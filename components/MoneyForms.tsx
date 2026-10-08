"use client";
import { useState } from "react";
import { PAYMENT_MODES } from "@/lib/constants";
import { today } from "@/lib/format";
import { formatMoney, paiseToInput, toPaise } from "@/lib/money";
import type { PaymentMode } from "@/lib/types";
import { useApp } from "./TripApp";
import { Avatar, Button, cx, Field, inputClass, MoneyInput, Segmented, Sheet } from "./ui";

export interface SettlePrefill {
  fromId?: string;
  toId?: string;
  amount?: number;
}

function PersonPicker({ label, value, onChange, exclude }: { label: string; value: string; onChange: (id: string) => void; exclude?: string }) {
  const { state, me } = useApp();
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {state.participants.filter((p) => p.id !== exclude).map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={value === p.id} onClick={() => onChange(p.id)}
            className={cx("flex h-10 items-center gap-2 rounded-full border py-0 pl-1 pr-3.5 font-medium", value === p.id ? "border-indigo bg-indigo text-on-indigo" : "border-line")}>
            <Avatar person={p} size={30} /> {p.id === me ? "You" : p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Record that one person paid another back. */
export function SettleForm({ prefill, onClose }: { prefill: SettlePrefill; onClose: () => void }) {
  const { act, busy, me, nameOf, toast } = useApp();
  const [fromId, setFrom] = useState(prefill.fromId ?? me ?? "");
  const [toId, setTo] = useState(prefill.toId ?? "");
  const [amount, setAmount] = useState(prefill.amount ? paiseToInput(prefill.amount) : "");
  const [mode, setMode] = useState<PaymentMode>("upi");
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState("");
  const paise = toPaise(amount) ?? 0;
  const ready = fromId && toId && fromId !== toId && paise > 0;

  return (
    <Sheet
      open onClose={onClose} title="Record a payment"
      footer={
        <Button size="lg" className="w-full" disabled={!ready || busy}
          onClick={async () => { if (await act("settlement.create", { fromId, toId, amount: paise, mode, note, paidOn })) { toast(`Recorded ${formatMoney(paise)} from ${nameOf(fromId)} to ${nameOf(toId)}`); onClose(); } }}>
          {busy ? "Saving…" : "Record payment"}
        </Button>
      }
    >
      <div className="space-y-5">
        <PersonPicker label="Who paid?" value={fromId} onChange={(id) => { setFrom(id); if (id === toId) setTo(""); }} />
        <PersonPicker label="Who received it?" value={toId} onChange={setTo} exclude={fromId} />
        <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Paid with</p>
          <Segmented label="Paid with" value={mode} options={PAYMENT_MODES} onChange={setMode} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" value={paidOn} onChange={(e) => e.target.value && setPaidOn(e.target.value)} className={inputClass} /></Field>
          <Field label="Note (optional)"><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={inputClass} /></Field>
        </div>
      </div>
    </Sheet>
  );
}

/** Put money into the shared kitty. The first time, also choose who is holding it. */
export function KittyForm({ onClose }: { onClose: () => void }) {
  const { act, busy, me, kitty, nameOf, state, toast } = useApp();
  const [holder, setHolder] = useState(kitty.holderId ?? "");
  const [who, setWho] = useState(me ?? "");
  const [amount, setAmount] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [mode, setMode] = useState<PaymentMode>("upi");
  const paise = toPaise(amount) ?? 0;
  const active = state.participants.filter((p) => p.active);
  const ready = holder && paise > 0 && (everyone || who);

  async function save() {
    if (holder !== kitty.holderId && !(await act("kitty.setHolder", { participantId: holder }))) return;
    const givers = everyone ? active.map((p) => p.id) : [who];
    for (const participantId of givers) if (!(await act("kitty.contribute", { participantId, amount: paise, mode, note: "", paidOn: today() }))) return;
    toast(everyone ? `Added ${formatMoney(paise)} each for ${givers.length} people` : `Added ${formatMoney(paise)} from ${nameOf(who)}`);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Add to the kitty"
      footer={<Button size="lg" className="w-full" disabled={!ready || busy} onClick={save}>{busy ? "Saving…" : "Add to kitty"}</Button>}>
      <div className="space-y-5">
        <p className="text-[15px] text-muted">
          The kitty is pooled money for shared costs. Whoever holds it pays from it, and anything left at the end is counted as money they owe back.
        </p>
        <PersonPicker label="Who is holding the kitty?" value={holder} onChange={setHolder} />
        <Field label={everyone ? "Amount from each person" : "Amount"}><MoneyInput value={amount} onChange={setAmount} placeholder="2000" /></Field>
        <div>
          <p className="mb-2 text-sm font-medium text-muted">From</p>
          <Segmented label="From" value={everyone ? "all" : "one"} options={[{ id: "one", label: "One person" }, { id: "all", label: `Everyone (${active.length})` }]} onChange={(v) => setEveryone(v === "all")} />
        </div>
        {!everyone && <PersonPicker label="Who is putting money in?" value={who} onChange={setWho} />}
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Given as</p>
          <Segmented label="Given as" value={mode} options={PAYMENT_MODES} onChange={setMode} />
        </div>
      </div>
    </Sheet>
  );
}
