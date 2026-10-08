"use client";
import { useState } from "react";
import { buildCsv, download } from "@/lib/client";
import { CATEGORIES, modeLabel } from "@/lib/constants";
import { formatShort, timeAgo } from "@/lib/format";
import { formatMoney, paiseToInput, toPaise } from "@/lib/money";
import type { Participant } from "@/lib/types";
import { chooseIdentity, useApp } from "./TripApp";
import { ExpenseRow } from "./ExpenseRow";
import { Avatar, Button, Empty, Field, Icon, inputClass, KittyMark, Money, MoneyInput, Panel, Section, Sheet } from "./ui";

export function Group() {
  const app = useApp();
  const { state, me, act, busy, person, nameOf, kitty, toast } = app;
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Participant | null>(null);
  const [tripOpen, setTripOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const link = typeof window !== "undefined" ? `${location.origin}/t/${state.trip.id}` : "";
  const deleted = state.expenses.filter((e) => e.deletedAt);
  const contributions = state.kitty.filter((k) => !k.deletedAt);
  const referenced = (id: string) =>
    state.expenses.some((e) => e.payers.some((p) => p.participantId === id) || e.splits.some((s) => s.participantId === id)) ||
    state.settlements.some((s) => s.fromId === id || s.toId === id) || state.kitty.some((k) => k.participantId === id);

  async function share() {
    const text = `Add your expenses for ${state.trip.name} here`;
    if (navigator.share) return navigator.share({ title: state.trip.name, text, url: link }).catch(() => {});
    await navigator.clipboard.writeText(link);
    toast("Link copied");
  }
  async function addPerson() {
    const name = newName.trim();
    if (name && (await act("participant.add", { name }))) {
      setNewName("");
      toast(`Added ${name}`);
    }
  }

  return (
    <main className="px-4 pt-6">
      <h1 className="display text-[32px] font-semibold leading-tight">Group</h1>
      <p className="mt-1 text-muted">Anyone with the link can see and add expenses. Share it only with people on the trip.</p>

      <div className="mt-4 flex gap-2.5">
        <Button className="flex-1" onClick={share}><Icon name="share" size={18} /> Share trip link</Button>
        <Button variant="quiet" aria-label="Copy trip link" onClick={async () => { await navigator.clipboard.writeText(link); toast("Link copied"); }}><Icon name="copy" size={18} /></Button>
      </div>

      <Section title="People">
        <Panel>
          {state.participants.map((p) => (
            <button key={p.id} type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunk">
              <Avatar person={p} dim={!p.active} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block text-sm text-muted">{[p.id === me && "You", !p.active && "Left the trip", kitty.holderId === p.id && "Holds the kitty"].filter(Boolean).join(", ") || "On the trip"}</span>
              </span>
              <Icon name="chevron" size={18} className="text-muted" />
            </button>
          ))}
        </Panel>
        <form className="mt-3 flex gap-2.5" onSubmit={(e) => { e.preventDefault(); addPerson(); }}>
          <input aria-label="New person's name" placeholder="Add someone by name" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
          <Button type="submit" variant="quiet" disabled={!newName.trim() || busy}>Add</Button>
        </form>
        <p className="mt-2 text-sm text-muted">
          New people are only included in expenses added from now on. <button type="button" onClick={chooseIdentity} className="font-semibold text-indigo underline-offset-4 hover:underline dark:text-turmeric">Switch who you are</button>
        </p>
      </Section>

      <Section title="Kitty" action={<Button variant="ghost" size="sm" className="!px-0" onClick={app.addToKitty}>Add money</Button>}>
        {contributions.length === 0 && !kitty.holderId ? (
          <Empty action={<Button variant="quiet" onClick={app.addToKitty}>Start a kitty</Button>}>Pooling money for shared costs? Track who put in what and what's been spent from it.</Empty>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
              <KittyMark size={44} />
              <div className="min-w-0 flex-1">
                <p className="display num text-2xl font-semibold leading-tight">{formatMoney(kitty.remaining)} <span className="font-sans text-[15px] font-normal text-muted">left</span></p>
                <p className="text-sm text-muted">{formatMoney(kitty.contributed)} put in, {formatMoney(kitty.spent)} spent. {kitty.holderId ? `${nameOf(kitty.holderId)} holds it.` : "No holder set."}</p>
              </div>
            </div>
            {contributions.length > 0 && (
              <Panel className="mt-3">
                {contributions.map((k) => (
                  <div key={k.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar person={person(k.participantId)} size={30} />
                    <span className="min-w-0 flex-1 truncate">{nameOf(k.participantId)} <span className="text-sm text-muted">{formatShort(k.paidOn)}, {modeLabel(k.mode)}</span></span>
                    <Money paise={k.amount} className="font-semibold" />
                    <button type="button" aria-label={`Remove ${nameOf(k.participantId)}'s contribution`} disabled={busy} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-sunk"
                      onClick={async () => confirm("Remove this contribution?") && (await act("kitty.remove", { id: k.id })) && toast("Contribution removed")}>
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                ))}
              </Panel>
            )}
          </>
        )}
      </Section>

      <Section title="Trip settings">
        <Panel>
          <SettingRow label="Name and dates" value={state.trip.name} onClick={() => setTripOpen(true)} />
          <SettingRow label="Budgets" value={state.trip.budgetTotal ? formatMoney(state.trip.budgetTotal) : Object.keys(state.budgets).length ? "By category" : "Not set"} onClick={() => setBudgetOpen(true)} />
        </Panel>
      </Section>

      <Section title="Export">
        <div className="flex flex-wrap gap-2.5">
          <Button variant="quiet" onClick={() => download(`${state.trip.name.replace(/[^\w]+/g, "-").toLowerCase()}-expenses.csv`, buildCsv(state))}><Icon name="download" size={18} /> Spreadsheet (CSV)</Button>
          <a href={`/t/${state.trip.id}/report`} className="inline-flex h-11 items-center gap-2 rounded-full bg-sunk px-5 text-[15px] font-semibold"><Icon name="print" size={18} /> Printable report</a>
        </div>
      </Section>

      {deleted.length > 0 && (
        <Section title="Deleted expenses">
          <p className="-mt-1 mb-3 text-[15px] text-muted">These don't count towards balances. Open one to restore it.</p>
          <Panel>{deleted.map((e) => <ExpenseRow key={e.id} e={e} />)}</Panel>
        </Section>
      )}

      <Section title="History">
        <ol className="space-y-3.5 pl-1">
          {state.activity.slice(0, showAll ? undefined : 12).map((a) => (
            <li key={a.id} className="flex gap-3 text-[15px]">
              <Avatar person={person(a.actorId)} size={26} />
              <div className="min-w-0 flex-1">
                <p>{a.summary}</p>
                {a.changes.length > 0 && <ul className="mt-0.5 space-y-0.5 text-sm text-muted">{a.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                <p className="mt-0.5 text-sm text-muted">{a.actorId ? `${nameOf(a.actorId)}, ` : ""}{timeAgo(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
        {!showAll && state.activity.length > 12 && <Button variant="quiet" size="sm" className="mt-4" onClick={() => setShowAll(true)}>Show all {state.activity.length} changes</Button>}
      </Section>

      {editing && <PersonSheet p={state.participants.find((x) => x.id === editing.id) ?? editing} canDelete={!referenced(editing.id) && state.participants.length > 1} onClose={() => setEditing(null)} />}
      {tripOpen && <TripSheet onClose={() => setTripOpen(false)} />}
      {budgetOpen && <BudgetSheet onClose={() => setBudgetOpen(false)} />}
    </main>
  );
}

function SettingRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-sunk">
      <span className="flex-1 font-medium">{label}</span>
      <span className="max-w-[45%] truncate text-muted">{value}</span>
      <Icon name="chevron" size={18} className="text-muted" />
    </button>
  );
}

function PersonSheet({ p, canDelete, onClose }: { p: Participant; canDelete: boolean; onClose: () => void }) {
  const { act, busy, kitty, toast, balances } = useApp();
  const [name, setName] = useState(p.name);
  const net = balances.find((b) => b.participantId === p.id)?.net ?? 0;
  return (
    <Sheet open onClose={onClose} title={p.name}
      footer={<Button size="lg" className="w-full" disabled={busy || !name.trim() || name.trim() === p.name} onClick={async () => (await act("participant.rename", { id: p.id, name: name.trim() })) && (toast("Name updated"), onClose())}>Save name</Button>}>
      <div className="space-y-6">
        <Field label="Name"><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <div className="space-y-3">
          {kitty.holderId !== p.id && (
            <Button variant="quiet" className="w-full" disabled={busy} onClick={async () => (await act("kitty.setHolder", { participantId: p.id })) && toast(`${p.name} now holds the kitty`)}>Make {p.name} the kitty holder</Button>
          )}
          {p.active ? (
            <>
              <Button variant="quiet" className="w-full" disabled={busy} onClick={async () => (await act("participant.setActive", { id: p.id, active: false })) && (toast(`${p.name} marked as left`), onClose())}>
                {p.name} has left the trip
              </Button>
              <p className="text-sm text-muted">
                They stop being added to new expenses. Everything already recorded stays{net !== 0 ? `, including their balance of ${formatMoney(net, { sign: true })}` : ""}.
              </p>
            </>
          ) : (
            <Button variant="quiet" className="w-full" disabled={busy} onClick={async () => (await act("participant.setActive", { id: p.id, active: true })) && (toast(`${p.name} is back`), onClose())}>Bring {p.name} back</Button>
          )}
          {canDelete ? (
            <Button variant="danger" className="w-full" disabled={busy} onClick={async () => confirm(`Delete ${p.name} from the trip?`) && (await act("participant.remove", { id: p.id })) && (toast(`${p.name} removed`), onClose())}>
              <Icon name="trash" size={17} /> Delete {p.name}
            </Button>
          ) : (
            <p className="text-sm text-muted">{p.name} can't be deleted because they're part of recorded expenses or payments. Deleting them would change everyone's balances.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function TripSheet({ onClose }: { onClose: () => void }) {
  const { state, act, busy, toast } = useApp();
  const [name, setName] = useState(state.trip.name);
  const [start, setStart] = useState(state.trip.startDate ?? "");
  const [end, setEnd] = useState(state.trip.endDate ?? "");
  return (
    <Sheet open onClose={onClose} title="Name and dates"
      footer={<Button size="lg" className="w-full" disabled={busy || !name.trim()} onClick={async () => (await act("trip.update", { name: name.trim(), startDate: start || null, endDate: end || null })) && (toast("Trip updated"), onClose())}>Save changes</Button>}>
      <div className="space-y-4">
        <Field label="Trip name"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
          <Field label="Ends"><input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
        </div>
        <p className="text-sm text-muted">Expenses dated before the start are shown as booked ahead.</p>
      </div>
    </Sheet>
  );
}

function BudgetSheet({ onClose }: { onClose: () => void }) {
  const { state, act, busy, toast } = useApp();
  const initial: Record<string, string> = { total: state.trip.budgetTotal ? paiseToInput(state.trip.budgetTotal) : "" };
  for (const c of CATEGORIES) initial[c.id] = state.budgets[c.id] ? paiseToInput(state.budgets[c.id]) : "";
  const [values, setValues] = useState(initial);
  const catSum = CATEGORIES.reduce((a, c) => a + (toPaise(values[c.id]) ?? 0), 0);

  async function save() {
    for (const key of Object.keys(values)) {
      if (values[key] === initial[key]) continue;
      if (!(await act("budget.set", { category: key, amount: toPaise(values[key]) ?? 0 }))) return;
    }
    toast("Budgets saved");
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title="Budgets" footer={<Button size="lg" className="w-full" disabled={busy} onClick={save}>Save budgets</Button>}>
      <div className="space-y-5">
        <Field label="Whole trip, for the group" hint="Leave any budget empty to go without one.">
          <MoneyInput value={values.total} onChange={(v) => setValues({ ...values, total: v })} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-muted">By category</p>
          <div className="space-y-2">
            {CATEGORIES.map((c) => (
              <label key={c.id} className="flex items-center gap-3">
                <span aria-hidden className="w-7 text-center text-lg">{c.glyph}</span>
                <span className="flex-1">{c.label}</span>
                <MoneyInput className="w-32" ariaLabel={`${c.label} budget`} value={values[c.id]} onChange={(v) => setValues({ ...values, [c.id]: v })} />
              </label>
            ))}
          </div>
          {catSum > 0 && <p className="mt-3 text-sm text-muted">Categories add up to {formatMoney(catSum)}.</p>}
        </div>
      </div>
    </Sheet>
  );
}
