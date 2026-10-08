"use client";
import { useMemo, useState } from "react";
import { compressImage } from "@/lib/client";
import { CATEGORIES, PAYMENT_MODES, SPLIT_MODES } from "@/lib/constants";
import { today } from "@/lib/format";
import { formatMoney, paiseToInput, toPaise } from "@/lib/money";
import { computeSplit, seedFrom, SplitError } from "@/lib/split";
import type { Expense, Line, Participant, PaymentMode, SplitInput, SplitMode } from "@/lib/types";
import { useApp } from "./TripApp";
import { Avatar, Button, Chip, cx, Field, Icon, inputClass, KittyMark, Money, MoneyInput, Segmented, Sheet } from "./ui";

type PayerMode = "one" | "many" | "kitty";
interface ItemDraft {
  key: number;
  name: string;
  amount: string;
  ids: string[];
}
type Strs = Record<string, string>;

const num = (s: string | undefined) => {
  const n = Number(s);
  return s && Number.isFinite(n) ? n : 0;
};

export function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { state, me, act, busy, kitty, toast } = useApp();
  const editing = !!expense;

  // People who can be picked: everyone still on the trip, plus anyone already on this expense.
  const people = useMemo(() => {
    const used = new Set<string>([...(expense?.payers ?? []), ...(expense?.splits ?? [])].map((l) => l.participantId));
    expense?.split.participantIds.forEach((p) => used.add(p));
    return state.participants.filter((p) => p.active || used.has(p.id));
  }, [state.participants, expense]);
  const activeIds = people.filter((p) => p.active).map((p) => p.id);

  const [amount, setAmount] = useState(expense ? paiseToInput(expense.amount) : "");
  const [title, setTitle] = useState(expense?.title ?? "");
  const [category, setCategory] = useState(expense?.category ?? "food");
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? today());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(expense?.paymentMode ?? "upi");
  const [note, setNote] = useState(expense?.note ?? "");

  const [payerMode, setPayerMode] = useState<PayerMode>(expense ? (expense.fromKitty ? "kitty" : expense.payers.length > 1 ? "many" : "one") : "one");
  const [payer, setPayer] = useState<string>(expense?.payers[0]?.participantId ?? me ?? activeIds[0] ?? "");
  const [paid, setPaid] = useState<Strs>(() => Object.fromEntries((expense?.payers ?? []).map((p) => [p.participantId, paiseToInput(p.amount)])));

  const s = expense?.split;
  const [mode, setMode] = useState<SplitMode>(s?.mode ?? "equal");
  const [included, setIncluded] = useState<string[]>(s && s.mode !== "itemized" ? s.participantIds : activeIds);
  const [exact, setExact] = useState<Strs>(() => Object.fromEntries(Object.entries(s?.exact ?? {}).map(([k, v]) => [k, v ? paiseToInput(v) : ""])));
  const [percent, setPercent] = useState<Strs>(() => Object.fromEntries(Object.entries(s?.percent ?? {}).map(([k, v]) => [k, v ? String(v) : ""])));
  const [shares, setShares] = useState<Record<string, number>>(() => s?.shares ?? Object.fromEntries(activeIds.map((p) => [p, 1])));
  const [items, setItems] = useState<ItemDraft[]>(() =>
    s?.items?.length ? s.items.map((it, i) => ({ key: i, name: it.name, amount: paiseToInput(it.amount), ids: it.participantIds })) : [{ key: 0, name: "", amount: "", ids: [] }],
  );

  // undefined = leave as is, null = remove, string = new photo
  const [receipt, setReceipt] = useState<string | null | undefined>(undefined);
  const hasReceipt = receipt !== null && (receipt !== undefined || !!expense?.receiptId);
  const receiptSrc = receipt ?? (expense?.receiptId ? `/api/trips/${state.trip.id}/receipt/${expense.receiptId}` : null);

  const total = toPaise(amount) ?? 0;

  const splitInput: SplitInput = useMemo(() => {
    switch (mode) {
      case "equal":
        return { mode, participantIds: included };
      case "exact": {
        const map = Object.fromEntries(people.map((p) => [p.id, toPaise(exact[p.id] ?? "") ?? 0]).filter(([, v]) => (v as number) > 0));
        return { mode, participantIds: Object.keys(map), exact: map };
      }
      case "percent": {
        const map = Object.fromEntries(people.map((p) => [p.id, num(percent[p.id])]).filter(([, v]) => (v as number) > 0));
        return { mode, participantIds: Object.keys(map), percent: map };
      }
      case "shares": {
        const map = Object.fromEntries(people.map((p) => [p.id, shares[p.id] ?? 0]).filter(([, v]) => (v as number) > 0));
        return { mode, participantIds: Object.keys(map), shares: map };
      }
      case "itemized":
        return {
          mode,
          participantIds: [],
          items: items.filter((it) => it.name.trim() || it.amount || it.ids.length).map((it) => ({ name: it.name.trim(), amount: toPaise(it.amount) ?? 0, participantIds: it.ids })),
        };
    }
  }, [mode, included, exact, percent, shares, items, people]);

  const preview = useMemo((): { lines: Line[]; error: string | null } => {
    if (total <= 0) return { lines: [], error: null };
    try {
      return { lines: computeSplit(total, splitInput, seedFrom(expense?.id ?? "")), error: null };
    } catch (e) {
      return { lines: [], error: e instanceof SplitError ? e.message : "Check the split" };
    }
  }, [total, splitInput, expense?.id]);
  const shareOf = (id: string) => preview.lines.find((l) => l.participantId === id)?.amount ?? 0;

  const payers: Line[] =
    payerMode === "one"
      ? payer && total > 0 ? [{ participantId: payer, amount: total }] : []
      : payerMode === "many"
        ? people.map((p) => ({ participantId: p.id, amount: toPaise(paid[p.id] ?? "") ?? 0 })).filter((l) => l.amount > 0)
        : [];
  const paidSum = payers.reduce((a, p) => a + p.amount, 0);

  const problem =
    total <= 0 ? "Enter the amount"
    : !title.trim() ? "Say what this was for"
    : payerMode === "one" && !payer ? "Pick who paid"
    : payerMode === "many" && paidSum !== total ? (paidSum < total ? `${formatMoney(total - paidSum)} of the bill still needs a payer` : `Payers add up to ${formatMoney(paidSum - total)} too much`)
    : preview.error;

  async function save() {
    if (problem) return toast(problem, "error");
    const payload = { title: title.trim(), amount: total, category, spentOn, paymentMode, fromKitty: payerMode === "kitty", payers, split: splitInput, note: note.trim(), receipt };
    const ok = await act(editing ? "expense.update" : "expense.create", editing ? { ...payload, id: expense!.id } : payload);
    if (ok) {
      toast(editing ? "Saved changes" : "Expense added");
      onClose();
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setReceipt(await compressImage(file));
    } catch {
      toast("That photo couldn't be read. Try a JPG or PNG.", "error");
    }
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const itemTotal = items.reduce((a, it) => a + (toPaise(it.amount) ?? 0), 0);

  // ---------- split editors ----------

  const row = (p: Participant, control: React.ReactNode, onRowClick?: () => void) => (
    <div key={p.id} className="flex items-center gap-3 py-2">
      <button type="button" tabIndex={onRowClick ? 0 : -1} onClick={onRowClick} className={cx("flex min-w-0 flex-1 items-center gap-3 text-left", !onRowClick && "pointer-events-none")}>
        <Avatar person={p} size={32} />
        <span className="min-w-0 flex-1 truncate font-medium">{p.name}{p.id === me ? " (you)" : ""}</span>
      </button>
      {control}
    </div>
  );
  const shareTag = (id: string) => <span className="num w-20 shrink-0 text-right text-sm text-muted">{total > 0 && shareOf(id) ? formatMoney(shareOf(id)) : ""}</span>;

  let editor: React.ReactNode;
  if (mode === "equal") {
    const all = included.length === people.length;
    editor = (
      <>
        <div className="flex items-center justify-between pb-1 text-sm text-muted">
          <span>{included.length} of {people.length} people</span>
          <button type="button" className="font-semibold text-indigo dark:text-turmeric" onClick={() => setIncluded(all ? [] : people.map((p) => p.id))}>
            {all ? "Clear all" : "Select everyone"}
          </button>
        </div>
        {people.map((p) => {
          const on = included.includes(p.id);
          return row(
            p,
            <>
              {shareTag(p.id)}
              <button
                type="button" role="checkbox" aria-checked={on} aria-label={`Include ${p.name}`} onClick={() => setIncluded(toggle(included, p.id))}
                className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2", on ? "border-indigo bg-indigo text-on-indigo" : "border-line")}
              >
                {on && <Icon name="check" size={16} />}
              </button>
            </>,
            () => setIncluded(toggle(included, p.id)),
          );
        })}
      </>
    );
  } else if (mode === "exact") {
    const sum = people.reduce((a, p) => a + (toPaise(exact[p.id] ?? "") ?? 0), 0);
    editor = (
      <>
        {people.map((p) => row(p, <MoneyInput className="w-32" ariaLabel={`${p.name} owes`} value={exact[p.id] ?? ""} onChange={(v) => setExact({ ...exact, [p.id]: v })} />))}
        <Tally left={total - sum} unit="money" />
      </>
    );
  } else if (mode === "percent") {
    const sum = people.reduce((a, p) => a + Math.round(num(percent[p.id]) * 100), 0) / 100;
    editor = (
      <>
        {people.map((p) =>
          row(
            p,
            <>
              {shareTag(p.id)}
              <span className="num relative block w-24">
                <input
                  inputMode="decimal" aria-label={`${p.name} percent`} placeholder="0" value={percent[p.id] ?? ""}
                  onChange={(e) => /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value) && setPercent({ ...percent, [p.id]: e.target.value })}
                  className={cx(inputClass, "pr-8 text-right")}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">%</span>
              </span>
            </>,
          ),
        )}
        <div className="flex items-center justify-between pt-2 text-sm">
          <button type="button" className="font-semibold text-indigo dark:text-turmeric" onClick={() => {
            const each = Math.floor(10000 / people.length) / 100;
            setPercent(Object.fromEntries(people.map((p, i) => [p.id, String(i === 0 ? Math.round((100 - each * (people.length - 1)) * 100) / 100 : each)])));
          }}>Spread evenly</button>
          <Tally left={Math.round((100 - sum) * 100) / 100} unit="percent" inline />
        </div>
      </>
    );
  } else if (mode === "shares") {
    editor = people.map((p) => {
      const n = shares[p.id] ?? 0;
      const set = (v: number) => setShares({ ...shares, [p.id]: Math.max(0, Math.min(99, v)) });
      return row(
        p,
        <>
          {shareTag(p.id)}
          <span className="flex shrink-0 items-center rounded-full bg-sunk">
            <button type="button" aria-label={`Fewer shares for ${p.name}`} className="h-9 w-9 text-lg font-semibold disabled:opacity-30" disabled={n <= 0} onClick={() => set(n - 1)}>−</button>
            <span className="num w-7 text-center font-semibold" aria-live="polite">{n}</span>
            <button type="button" aria-label={`More shares for ${p.name}`} className="h-9 w-9 text-lg font-semibold" onClick={() => set(n + 1)}>+</button>
          </span>
        </>,
      );
    });
  } else {
    const extras = total - itemTotal;
    editor = (
      <>
        <div className="space-y-3">
          {items.map((it, idx) => {
            const patch = (p: Partial<ItemDraft>) => setItems(items.map((x) => (x.key === it.key ? { ...x, ...p } : x)));
            return (
              <div key={it.key} className="rounded-2xl border border-line p-3">
                <div className="flex gap-2">
                  <input aria-label={`Item ${idx + 1} name`} placeholder={idx === 0 ? "Chicken biryani" : "Item"} value={it.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} className={cx(inputClass, "min-w-0 flex-1")} />
                  <MoneyInput className="w-28 shrink-0" ariaLabel={`Item ${idx + 1} price`} value={it.amount} onChange={(v) => patch({ amount: v })} />
                  {items.length > 1 && (
                    <button type="button" aria-label={`Remove item ${idx + 1}`} onClick={() => setItems(items.filter((x) => x.key !== it.key))} className="flex h-11 w-9 shrink-0 items-center justify-center text-muted">
                      <Icon name="x" size={18} />
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {people.map((p) => {
                    const on = it.ids.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={on} onClick={() => patch({ ids: toggle(it.ids, p.id) })}
                        className={cx("flex h-8 items-center gap-1.5 rounded-full border py-0 pl-1 pr-2.5 text-sm font-medium", on ? "border-indigo bg-indigo text-on-indigo" : "border-line text-muted")}>
                        <Avatar person={p} size={22} dim={!on} /> {p.name}
                      </button>
                    );
                  })}
                  <button type="button" className="ml-1 text-sm font-semibold text-indigo dark:text-turmeric" onClick={() => patch({ ids: it.ids.length === people.length ? [] : people.map((p) => p.id) })}>
                    {it.ids.length === people.length ? "Clear" : "Everyone"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="quiet" size="sm" className="mt-3" onClick={() => setItems([...items, { key: Math.max(...items.map((i) => i.key)) + 1, name: "", amount: "", ids: [] }])}>
          <Icon name="plus" size={16} /> Add item
        </Button>
        {total > 0 && itemTotal > 0 && (
          <p className={cx("mt-3 text-sm", extras < 0 ? "font-semibold text-minus" : "text-muted")}>
            {extras < 0
              ? `Items add up to ${formatMoney(-extras)} more than the bill.`
              : extras === 0
                ? "Items match the bill exactly."
                : `Items come to ${formatMoney(itemTotal)}. The other ${formatMoney(extras)} (tax, tip, charges) is shared in proportion to what each person ordered.`}
          </p>
        )}
        {preview.lines.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-2xl bg-sunk px-3.5">
            {preview.lines.map((l) => {
              const p = people.find((x) => x.id === l.participantId);
              return (
                <li key={l.participantId} className="flex items-center gap-2.5 py-2 text-[15px]">
                  <Avatar person={p} size={24} /> <span className="flex-1 truncate">{p?.name}</span> <Money paise={l.amount} className="font-semibold" />
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const payerOptions: { id: PayerMode; label: string }[] = [
    { id: "one", label: "One person" },
    { id: "many", label: "Several" },
    ...(kitty.holderId ? [{ id: "kitty" as const, label: "Kitty" }] : []),
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? "Edit expense" : "Add expense"}
      footer={
        <>
          {problem && total > 0 && <p role="status" className="mb-2 text-center text-sm text-minus">{problem}</p>}
          <Button size="lg" className="w-full" disabled={busy} onClick={save}>
            {busy ? "Saving…" : editing ? "Save changes" : total > 0 ? `Add ${formatMoney(total)}` : "Add expense"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label className="display flex items-baseline gap-2 border-b-2 border-line pb-2 focus-within:border-indigo">
            <span className="text-3xl font-semibold text-muted">₹</span>
            <input
              autoFocus={!editing} inputMode="decimal" aria-label="Amount" placeholder="0" value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) setAmount(v);
              }}
              className="num w-full min-w-0 bg-transparent text-5xl font-semibold outline-none"
            />
          </label>
          <input aria-label="What was it for?" placeholder="What was it for? Lunch at Murugan Idli" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={cx(inputClass, "mt-4")} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Category</p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {CATEGORIES.map((c) => (
              <Chip key={c.id} on={category === c.id} onClick={() => setCategory(c.id)}>
                <span aria-hidden>{c.glyph}</span> {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={spentOn} onChange={(e) => e.target.value && setSpentOn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Paid with">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} className={inputClass}>
              {PAYMENT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Who paid?</p>
          <Segmented label="Who paid" value={payerMode} options={payerOptions} onChange={setPayerMode} />
          <div className="mt-3">
            {payerMode === "one" && (
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={payer === p.id} onClick={() => setPayer(p.id)}
                    className={cx("flex h-10 items-center gap-2 rounded-full border py-0 pl-1 pr-3.5 font-medium", payer === p.id ? "border-indigo bg-indigo text-on-indigo" : "border-line")}>
                    <Avatar person={p} size={30} /> {p.id === me ? "You" : p.name}
                  </button>
                ))}
              </div>
            )}
            {payerMode === "many" && (
              <>
                {people.map((p) => row(p, <MoneyInput className="w-32" ariaLabel={`${p.name} paid`} value={paid[p.id] ?? ""} onChange={(v) => setPaid({ ...paid, [p.id]: v })} />))}
                <Tally left={total - paidSum} unit="money" />
              </>
            )}
            {payerMode === "kitty" && (
              <p className="flex items-center gap-3 rounded-2xl bg-sunk p-3 text-[15px]">
                <KittyMark size={32} />
                <span>Comes out of the kitty, which has <span className="num font-semibold">{formatMoney(kitty.remaining + (expense?.fromKitty ? expense.amount : 0))}</span> in it.</span>
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Split how?</p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {SPLIT_MODES.map((m) => <Chip key={m.id} on={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</Chip>)}
          </div>
          <p className="mt-2 text-sm text-muted">{SPLIT_MODES.find((m) => m.id === mode)!.hint}</p>
          <div className="mt-2">{editor}</div>
        </div>

        <div className="space-y-3">
          <Field label="Note (optional)">
            <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={cx(inputClass, "h-auto py-2.5")} />
          </Field>
          {hasReceipt && receiptSrc ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptSrc} alt="Receipt" className="h-20 w-20 rounded-xl border border-line object-cover" />
              <Button variant="quiet" size="sm" onClick={() => setReceipt(null)}><Icon name="trash" size={16} /> Remove photo</Button>
            </div>
          ) : (
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-sunk px-5 text-[15px] font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-turmeric">
              <Icon name="camera" size={18} /> Add receipt photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Tally({ left, unit, inline }: { left: number; unit: "money" | "percent"; inline?: boolean }) {
  const show = (n: number) => (unit === "money" ? formatMoney(n) : `${n}%`);
  return (
    <p className={cx("num text-sm font-semibold", !inline && "pt-2 text-right", left === 0 ? "text-plus" : left < 0 ? "text-minus" : "text-muted")}>
      {left === 0 ? "Adds up" : left > 0 ? `${show(left)} left to assign` : `${show(-left)} too much`}
    </p>
  );
}
