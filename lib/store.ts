import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import type { PoolClient } from "pg";
import { z } from "zod";
import { query, transaction } from "./db";
import { CATEGORY_IDS, categoryOf, modeLabel, splitLabel } from "./constants";
import { formatMoney } from "./money";
import { computeSplit, seedFrom, SplitError } from "./split";
import type { ActivityEntry, Expense, KittyContribution, Line, Participant, Settlement, SplitInput, Trip, TripState } from "./types";

/** An error whose message is safe and useful to show to the person using the app. */
export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const tripId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 16); // unguessable, no look-alike characters
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | null));

// ---------- validation ----------

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.number().int().positive().max(1_000_000_000, "That amount is too large");
const name = z.string().trim().min(1, "Enter a name").max(40);
const mode = z.enum(["upi", "cash", "card", "other"]);
const line = z.object({ participantId: z.string(), amount: money });

const splitSchema = z.object({
  mode: z.enum(["equal", "exact", "percent", "shares", "itemized"]),
  participantIds: z.array(z.string()).max(60),
  exact: z.record(z.string(), z.number().int().min(0)).optional(),
  percent: z.record(z.string(), z.number().min(0).max(100)).optional(),
  shares: z.record(z.string(), z.number().min(0).max(1000)).optional(),
  items: z.array(z.object({ name: z.string().trim().max(60), amount: z.number().int(), participantIds: z.array(z.string()) })).max(60).optional(),
});

const expenseSchema = z.object({
  title: z.string().trim().min(1, "Say what this was for").max(80),
  amount: money,
  category: z.string().refine((c) => CATEGORY_IDS.includes(c), "Pick a category"),
  spentOn: date,
  paymentMode: mode,
  fromKitty: z.boolean(),
  payers: z.array(line).max(60),
  split: splitSchema,
  note: z.string().trim().max(500).default(""),
  receipt: z.string().max(4_000_000, "That photo is too large").nullable().optional(), // data URL to set, null to remove, omitted to keep
});

export const createTripSchema = z.object({
  name: z.string().trim().min(1, "Give the trip a name").max(60),
  startDate: date.nullable(),
  endDate: date.nullable(),
  participants: z.array(name).min(1, "Add at least one person").max(40),
});

const actions = {
  "trip.update": z.object({ name: z.string().trim().min(1).max(60), startDate: date.nullable(), endDate: date.nullable() }),
  "participant.add": z.object({ name }),
  "participant.rename": z.object({ id: z.string(), name }),
  "participant.setActive": z.object({ id: z.string(), active: z.boolean() }),
  "participant.remove": z.object({ id: z.string() }),
  "expense.create": expenseSchema,
  "expense.update": expenseSchema.extend({ id: z.string() }),
  "expense.delete": z.object({ id: z.string() }),
  "expense.restore": z.object({ id: z.string() }),
  "settlement.create": z.object({ fromId: z.string(), toId: z.string(), amount: money, mode, note: z.string().trim().max(200).default(""), paidOn: date }),
  "settlement.delete": z.object({ id: z.string() }),
  "kitty.setHolder": z.object({ participantId: z.string() }),
  "kitty.contribute": z.object({ participantId: z.string(), amount: money, mode, note: z.string().trim().max(200).default(""), paidOn: date }),
  "kitty.remove": z.object({ id: z.string() }),
  "budget.set": z.object({ category: z.string(), amount: z.number().int().min(0).max(1_000_000_000) }), // category "total" sets the trip budget; 0 clears
};
export type ActionName = keyof typeof actions;

// ---------- reads ----------

export async function tripExists(id: string): Promise<boolean> {
  return (await query("select 1 from trips where id = $1", [id])).length > 0;
}

export async function getState(id: string): Promise<TripState | null> {
  const [trips, participants, expenses, payers, splits, settlements, kitty, budgets, activity] = await Promise.all([
    query<any>("select * from trips where id = $1", [id]),
    query<any>("select * from participants where trip_id = $1 order by created_at, name", [id]),
    query<any>("select * from expenses where trip_id = $1 order by spent_on desc, created_at desc", [id]),
    query<any>("select p.* from expense_payers p join expenses e on e.id = p.expense_id where e.trip_id = $1", [id]),
    query<any>("select s.* from expense_splits s join expenses e on e.id = s.expense_id where e.trip_id = $1", [id]),
    query<any>("select * from settlements where trip_id = $1 order by paid_on desc, created_at desc", [id]),
    query<any>("select * from kitty_contributions where trip_id = $1 order by paid_on desc, created_at desc", [id]),
    query<any>("select * from budgets where trip_id = $1", [id]),
    query<any>("select * from activity where trip_id = $1 order by id desc limit 400", [id]),
  ]);
  if (!trips[0]) return null;
  const t = trips[0];
  const group = (rows: any[]) => {
    const m = new Map<string, Line[]>();
    for (const r of rows) (m.get(r.expense_id) ?? m.set(r.expense_id, []).get(r.expense_id)!).push({ participantId: r.participant_id, amount: r.amount });
    return m;
  };
  const payerMap = group(payers), splitMap = group(splits);
  const trip: Trip = { id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date, budgetTotal: t.budget_total, kittyHolderId: t.kitty_holder_id, createdAt: iso(t.created_at)! };
  return {
    trip,
    participants: participants.map((p): Participant => ({ id: p.id, name: p.name, color: p.color, active: p.active, createdAt: iso(p.created_at)! })),
    expenses: expenses.map((e): Expense => ({
      id: e.id, title: e.title, amount: e.amount, category: e.category, spentOn: e.spent_on, paymentMode: e.payment_mode, fromKitty: e.from_kitty,
      split: e.split, payers: payerMap.get(e.id) ?? [], splits: splitMap.get(e.id) ?? [], note: e.note, receiptId: e.receipt_id,
      createdBy: e.created_by, createdAt: iso(e.created_at)!, updatedAt: iso(e.updated_at)!, deletedAt: iso(e.deleted_at),
    })),
    settlements: settlements.map((s): Settlement => ({
      id: s.id, fromId: s.from_id, toId: s.to_id, amount: s.amount, mode: s.mode, note: s.note, paidOn: s.paid_on,
      createdBy: s.created_by, createdAt: iso(s.created_at)!, deletedAt: iso(s.deleted_at),
    })),
    kitty: kitty.map((k): KittyContribution => ({
      id: k.id, participantId: k.participant_id, amount: k.amount, mode: k.mode, note: k.note, paidOn: k.paid_on, createdAt: iso(k.created_at)!, deletedAt: iso(k.deleted_at),
    })),
    budgets: Object.fromEntries(budgets.map((b) => [b.category, b.amount])),
    activity: activity.map((a): ActivityEntry => ({
      id: Number(a.id), actorId: a.actor_id, action: a.action, entityType: a.entity_type, entityId: a.entity_id, summary: a.summary, changes: a.changes ?? [], createdAt: iso(a.created_at)!,
    })),
  };
}

export async function getReceipt(trip: string, id: string): Promise<{ mime: string; data: Buffer } | null> {
  const rows = await query<{ mime: string; data: Buffer }>("select mime, data from receipts where id = $1 and trip_id = $2", [id, trip]);
  return rows[0] ?? null;
}

// ---------- writes ----------

export async function createTrip(input: unknown): Promise<string> {
  const data = parse(createTripSchema, input);
  checkDates(data.startDate, data.endDate);
  const names = data.participants;
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new UserError("Two people have the same name. Add an initial to tell them apart.");
  const id = tripId();
  await transaction(async (c) => {
    await c.query("insert into trips (id, name, start_date, end_date) values ($1,$2,$3,$4)", [id, data.name, data.startDate, data.endDate]);
    for (let i = 0; i < names.length; i++)
      // created_at is staggered so people keep the order they were typed in
      await c.query("insert into participants (id, trip_id, name, color, created_at) values ($1,$2,$3,$4, now() + ($5 || ' milliseconds')::interval)", [randomUUID(), id, names[i], i, i]);
    await log(c, id, null, "trip.create", "trip", id, `Started the trip with ${names.join(", ")}`);
  });
  return id;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "That doesn't look right");
  return r.data;
}

function checkDates(start: string | null, end: string | null) {
  if (start && end && end < start) throw new UserError("The end date is before the start date");
}

async function log(c: PoolClient, trip: string, actor: string | null, action: string, entityType: string, entityId: string | null, summary: string, changes: string[] = []) {
  await c.query("insert into activity (trip_id, actor_id, action, entity_type, entity_id, summary, changes) values ($1,$2,$3,$4,$5,$6,$7)", [
    trip, actor, action, entityType, entityId, summary, JSON.stringify(changes),
  ]);
}

interface Ctx {
  c: PoolClient;
  trip: string;
  actor: string | null;
  people: Map<string, { id: string; name: string; active: boolean }>;
}

const who = (ctx: Ctx, id: string) => ctx.people.get(id)?.name ?? "Someone";
function need(ctx: Ctx, id: string) {
  if (!ctx.people.has(id)) throw new UserError("That person isn't part of this trip");
}

/** Recompute the split on the server so stored amounts never depend on what the client sent. */
function buildExpense(ctx: Ctx, id: string, e: z.infer<typeof expenseSchema>, holder: string | null) {
  const split = e.split as SplitInput;
  const ids = split.mode === "itemized" ? (split.items ?? []).flatMap((i) => i.participantIds) : split.participantIds;
  ids.forEach((p) => need(ctx, p));
  let splits: Line[];
  try {
    splits = computeSplit(e.amount, split, seedFrom(id));
  } catch (err) {
    if (err instanceof SplitError) throw new UserError(err.message);
    throw err;
  }
  let payers: Line[] = [];
  if (e.fromKitty) {
    if (!holder) throw new UserError("Choose who is holding the kitty first");
  } else {
    payers = e.payers.filter((p) => p.amount > 0);
    payers.forEach((p) => need(ctx, p.participantId));
    if (new Set(payers.map((p) => p.participantId)).size !== payers.length) throw new UserError("Someone is listed as paying twice");
    if (payers.length === 0) throw new UserError("Pick who paid");
    const paid = payers.reduce((a, p) => a + p.amount, 0);
    if (paid !== e.amount) throw new UserError(`Paid amounts add up to ${formatMoney(paid)}, but the total is ${formatMoney(e.amount)}`);
  }
  return { split, splits, payers };
}

async function saveReceipt(ctx: Ctx, dataUrl: string): Promise<string> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new UserError("That photo couldn't be read. Try a JPG or PNG.");
  const id = randomUUID();
  await ctx.c.query("insert into receipts (id, trip_id, mime, data) values ($1,$2,$3,$4)", [id, ctx.trip, m[1], Buffer.from(m[2], "base64")]);
  return id;
}

async function writeLines(ctx: Ctx, id: string, payers: Line[], splits: Line[]) {
  await ctx.c.query("delete from expense_payers where expense_id = $1", [id]);
  await ctx.c.query("delete from expense_splits where expense_id = $1", [id]);
  for (const p of payers) await ctx.c.query("insert into expense_payers values ($1,$2,$3)", [id, p.participantId, p.amount]);
  for (const s of splits) await ctx.c.query("insert into expense_splits values ($1,$2,$3)", [id, s.participantId, s.amount]);
}

const describePayers = (ctx: Ctx, fromKitty: boolean, payers: Line[]) =>
  fromKitty ? "the kitty" : payers.map((p) => (payers.length > 1 ? `${who(ctx, p.participantId)} ${formatMoney(p.amount)}` : who(ctx, p.participantId))).join(", ");
const describeSplit = (ctx: Ctx, splits: Line[]) => splits.map((s) => `${who(ctx, s.participantId)} ${formatMoney(s.amount)}`).join(", ");

export async function applyAction(trip: string, action: string, actorId: string | null, payload: unknown): Promise<void> {
  if (!(action in actions)) throw new UserError("Unknown action");
  const data = parse(actions[action as ActionName] as z.ZodType<any>, payload);

  await transaction(async (c) => {
    // Lock the trip row so two phones saving at the same moment apply one after the other.
    const t = (await c.query("select * from trips where id = $1 for update", [trip])).rows[0];
    if (!t) throw new UserError("This trip doesn't exist", 404);
    const rows = (await c.query("select id, name, active from participants where trip_id = $1", [trip])).rows;
    const ctx: Ctx = { c, trip, actor: null, people: new Map(rows.map((r) => [r.id, r])) };
    ctx.actor = actorId && ctx.people.has(actorId) ? actorId : null;
    const owned = async (table: string, id: string) => {
      const r = (await c.query(`select * from ${table} where id = $1 and trip_id = $2`, [id, trip])).rows[0];
      if (!r) throw new UserError("That entry no longer exists", 404);
      return r;
    };
    const say = (entityType: string, entityId: string | null, summary: string, changes: string[] = []) => log(c, trip, ctx.actor, action, entityType, entityId, summary, changes);

    switch (action as ActionName) {
      case "trip.update": {
        checkDates(data.startDate, data.endDate);
        await c.query("update trips set name = $2, start_date = $3, end_date = $4 where id = $1", [trip, data.name, data.startDate, data.endDate]);
        await say("trip", trip, "Updated the trip details");
        break;
      }
      case "participant.add": {
        if (rows.some((r) => r.name.toLowerCase() === data.name.toLowerCase())) throw new UserError(`${data.name} is already on this trip`);
        const used = (await c.query("select coalesce(max(color), -1) + 1 as next from participants where trip_id = $1", [trip])).rows[0].next;
        const id = randomUUID();
        await c.query("insert into participants (id, trip_id, name, color) values ($1,$2,$3,$4)", [id, trip, data.name, used]);
        await say("participant", id, `Added ${data.name} to the trip`);
        break;
      }
      case "participant.rename": {
        need(ctx, data.id);
        if (rows.some((r) => r.id !== data.id && r.name.toLowerCase() === data.name.toLowerCase())) throw new UserError(`${data.name} is already on this trip`);
        const old = who(ctx, data.id);
        await c.query("update participants set name = $2 where id = $1", [data.id, data.name]);
        if (old !== data.name) await say("participant", data.id, `Renamed ${old} to ${data.name}`);
        break;
      }
      case "participant.setActive": {
        need(ctx, data.id);
        await c.query("update participants set active = $2 where id = $1", [data.id, data.active]);
        await say("participant", data.id, data.active ? `${who(ctx, data.id)} is back on the trip` : `${who(ctx, data.id)} left the trip. Their past expenses stay.`);
        break;
      }
      case "participant.remove": {
        need(ctx, data.id);
        const refs = (
          await c.query(
            `select (select count(*) from expense_payers where participant_id = $1)
                  + (select count(*) from expense_splits where participant_id = $1)
                  + (select count(*) from settlements where from_id = $1 or to_id = $1)
                  + (select count(*) from kitty_contributions where participant_id = $1) as n`,
            [data.id],
          )
        ).rows[0].n;
        if (Number(refs) > 0) throw new UserError(`${who(ctx, data.id)} is part of existing expenses, so they can't be deleted. Mark them as left instead.`);
        if (rows.length === 1) throw new UserError("A trip needs at least one person");
        if (t.kitty_holder_id === data.id) await c.query("update trips set kitty_holder_id = null where id = $1", [trip]);
        await c.query("delete from participants where id = $1", [data.id]);
        await say("participant", data.id, `Removed ${who(ctx, data.id)} from the trip`);
        break;
      }
      case "expense.create": {
        const id = randomUUID();
        const { split, splits, payers } = buildExpense(ctx, id, data, t.kitty_holder_id);
        const receiptId = data.receipt ? await saveReceipt(ctx, data.receipt) : null;
        await c.query(
          `insert into expenses (id, trip_id, title, amount, category, spent_on, payment_mode, from_kitty, split, note, receipt_id, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, trip, data.title, data.amount, data.category, data.spentOn, data.paymentMode, data.fromKitty, JSON.stringify(split), data.note, receiptId, ctx.actor],
        );
        await writeLines(ctx, id, payers, splits);
        await say("expense", id, `Added “${data.title}” for ${formatMoney(data.amount)}, paid by ${describePayers(ctx, data.fromKitty, payers)}`);
        break;
      }
      case "expense.update": {
        const old = await owned("expenses", data.id);
        if (old.deleted_at) throw new UserError("Restore this expense before editing it");
        const oldPayers: Line[] = (await c.query("select participant_id, amount from expense_payers where expense_id = $1 order by participant_id", [data.id])).rows.map((r) => ({ participantId: r.participant_id, amount: r.amount }));
        const oldSplits: Line[] = (await c.query("select participant_id, amount from expense_splits where expense_id = $1 order by participant_id", [data.id])).rows.map((r) => ({ participantId: r.participant_id, amount: r.amount }));
        const { split, splits, payers } = buildExpense(ctx, data.id, data, t.kitty_holder_id);
        let receiptId: string | null = old.receipt_id;
        if (data.receipt === null) receiptId = null;
        else if (data.receipt) receiptId = await saveReceipt(ctx, data.receipt);

        const changes: string[] = [];
        const diff = (label: string, a: string, b: string) => { if (a !== b) changes.push(`${label}: ${a} → ${b}`); };
        const sorted = (ls: Line[]) => [...ls].sort((a, b) => a.participantId.localeCompare(b.participantId));
        diff("Title", old.title, data.title);
        diff("Amount", formatMoney(old.amount), formatMoney(data.amount));
        diff("Category", categoryOf(old.category).label, categoryOf(data.category).label);
        diff("Date", old.spent_on, data.spentOn);
        diff("Paid with", modeLabel(old.payment_mode), modeLabel(data.paymentMode));
        diff("Paid by", describePayers(ctx, old.from_kitty, oldPayers), describePayers(ctx, data.fromKitty, sorted(payers)));
        diff("Split type", splitLabel(old.split.mode), splitLabel(split.mode));
        diff("Split", describeSplit(ctx, oldSplits), describeSplit(ctx, sorted(splits)));
        diff("Note", old.note || "none", data.note || "none");
        if (receiptId !== old.receipt_id) changes.push(receiptId ? (old.receipt_id ? "Replaced the receipt photo" : "Added a receipt photo") : "Removed the receipt photo");

        await c.query(
          `update expenses set title=$2, amount=$3, category=$4, spent_on=$5, payment_mode=$6, from_kitty=$7, split=$8, note=$9, receipt_id=$10, updated_at=now() where id=$1`,
          [data.id, data.title, data.amount, data.category, data.spentOn, data.paymentMode, data.fromKitty, JSON.stringify(split), data.note, receiptId],
        );
        await writeLines(ctx, data.id, payers, splits);
        if (old.receipt_id && old.receipt_id !== receiptId) await c.query("delete from receipts where id = $1", [old.receipt_id]);
        if (changes.length) await say("expense", data.id, `Edited “${data.title}”`, changes);
        break;
      }
      case "expense.delete":
      case "expense.restore": {
        const old = await owned("expenses", data.id);
        const del = action === "expense.delete";
        if (!del && old.from_kitty && !t.kitty_holder_id) throw new UserError("Choose who is holding the kitty first");
        await c.query(`update expenses set deleted_at = ${del ? "now()" : "null"}, updated_at = now() where id = $1`, [data.id]);
        await say("expense", data.id, `${del ? "Deleted" : "Restored"} “${old.title}” (${formatMoney(old.amount)})`);
        break;
      }
      case "settlement.create": {
        need(ctx, data.fromId);
        need(ctx, data.toId);
        if (data.fromId === data.toId) throw new UserError("Pick two different people");
        const id = randomUUID();
        await c.query("insert into settlements (id, trip_id, from_id, to_id, amount, mode, note, paid_on, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
          id, trip, data.fromId, data.toId, data.amount, data.mode, data.note, data.paidOn, ctx.actor,
        ]);
        await say("settlement", id, `${who(ctx, data.fromId)} paid ${who(ctx, data.toId)} ${formatMoney(data.amount)} by ${modeLabel(data.mode)}`);
        break;
      }
      case "settlement.delete": {
        const old = await owned("settlements", data.id);
        await c.query("update settlements set deleted_at = now() where id = $1", [data.id]);
        await say("settlement", data.id, `Removed the payment of ${formatMoney(old.amount)} from ${who(ctx, old.from_id)} to ${who(ctx, old.to_id)}`);
        break;
      }
      case "kitty.setHolder": {
        need(ctx, data.participantId);
        await c.query("update trips set kitty_holder_id = $2 where id = $1", [trip, data.participantId]);
        await say("kitty", null, `${who(ctx, data.participantId)} is now holding the kitty`);
        break;
      }
      case "kitty.contribute": {
        need(ctx, data.participantId);
        if (!t.kitty_holder_id) throw new UserError("Choose who is holding the kitty first");
        const id = randomUUID();
        await c.query("insert into kitty_contributions (id, trip_id, participant_id, amount, mode, note, paid_on) values ($1,$2,$3,$4,$5,$6,$7)", [
          id, trip, data.participantId, data.amount, data.mode, data.note, data.paidOn,
        ]);
        await say("kitty", id, `${who(ctx, data.participantId)} put ${formatMoney(data.amount)} into the kitty`);
        break;
      }
      case "kitty.remove": {
        const old = await owned("kitty_contributions", data.id);
        await c.query("update kitty_contributions set deleted_at = now() where id = $1", [data.id]);
        await say("kitty", data.id, `Removed ${who(ctx, old.participant_id)}’s ${formatMoney(old.amount)} kitty contribution`);
        break;
      }
      case "budget.set": {
        if (data.category === "total") {
          await c.query("update trips set budget_total = $2 where id = $1", [trip, data.amount || null]);
          await say("budget", null, data.amount ? `Set the trip budget to ${formatMoney(data.amount)}` : "Cleared the trip budget");
        } else {
          if (!CATEGORY_IDS.includes(data.category)) throw new UserError("Pick a category");
          if (data.amount) await c.query("insert into budgets values ($1,$2,$3) on conflict (trip_id, category) do update set amount = excluded.amount", [trip, data.category, data.amount]);
          else await c.query("delete from budgets where trip_id = $1 and category = $2", [trip, data.category]);
          const label = categoryOf(data.category).label;
          await say("budget", null, data.amount ? `Set the ${label} budget to ${formatMoney(data.amount)}` : `Cleared the ${label} budget`);
        }
        break;
      }
    }
  });
}
