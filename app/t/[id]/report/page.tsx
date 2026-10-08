"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { computeBalances, kittySummary, simplifyDebts, totalSpent } from "@/lib/balances";
import { categoryOf, modeLabel, splitLabel } from "@/lib/constants";
import { formatRange, formatShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { TripState } from "@/lib/types";

/** A plain, print-friendly summary. "Save as PDF" from the print dialog gives the PDF export. */
export default function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<TripState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/trips/${id}`, { cache: "no-store" }).then(async (r) => (r.ok ? setState(await r.json()) : setFailed(true))).catch(() => setFailed(true));
  }, [id]);
  if (failed) return <p className="p-6">Couldn't load this trip.</p>;
  if (!state) return <p className="p-6 text-muted">Loading…</p>;

  const name = (pid: string) => state.participants.find((p) => p.id === pid)?.name ?? "?";
  const balances = computeBalances(state);
  const transfers = simplifyDebts(balances);
  const kitty = kittySummary(state);
  const live = state.expenses.filter((e) => !e.deletedAt).reverse();
  const th = "border-b-2 border-ink/70 py-1.5 pr-3 text-left font-semibold";
  const td = "border-b border-line py-1.5 pr-3 align-top";
  const r = " text-right num";

  return (
    <main className="mx-auto max-w-4xl bg-white p-6 text-[13.5px] text-black sm:p-10 print:p-0">
      <div className="no-print mb-6 flex gap-3">
        <button onClick={() => window.print()} className="h-10 rounded-full bg-indigo px-5 font-semibold text-white">Print or save as PDF</button>
        <Link href={`/t/${id}`} className="flex h-10 items-center rounded-full bg-sunk px-5 font-semibold text-ink">Back to the trip</Link>
      </div>
      <h1 className="display text-3xl font-semibold">{state.trip.name}</h1>
      <p className="mt-1 text-neutral-600">
        {[formatRange(state.trip.startDate, state.trip.endDate), `${state.participants.length} people`, `${live.length} expenses`, `${formatMoney(totalSpent(state))} spent`].filter(Boolean).join(", ")}
      </p>

      <h2 className="display mb-2 mt-7 text-xl font-semibold">Who pays whom</h2>
      {transfers.length === 0 ? <p>Everyone is settled up.</p> : (
        <ul className="space-y-1">{transfers.map((t, i) => <li key={i}>{name(t.fromId)} pays {name(t.toId)} <strong className="num">{formatMoney(t.amount)}</strong></li>)}</ul>
      )}

      <h2 className="display mb-2 mt-7 text-xl font-semibold">Summary by person</h2>
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={th}>Person</th><th className={th + r}>Paid</th>{kitty.contributed > 0 && <th className={th + r}>Kitty</th>}<th className={th + r}>Share</th><th className={th + r}>Paid back</th><th className={th + r}>Received</th><th className={th + r}>Balance</th>
        </tr></thead>
        <tbody>{balances.map((b) => (
          <tr key={b.participantId}>
            <td className={td}>{name(b.participantId)}{kitty.holderId === b.participantId && kitty.remaining ? ` (holds ${formatMoney(kitty.remaining)} kitty)` : ""}</td>
            <td className={td + r}>{formatMoney(b.paid)}</td>{kitty.contributed > 0 && <td className={td + r}>{formatMoney(b.contributed)}</td>}
            <td className={td + r}>{formatMoney(b.share)}</td><td className={td + r}>{formatMoney(b.settledOut)}</td><td className={td + r}>{formatMoney(b.settledIn)}</td>
            <td className={td + r + " font-semibold"}>{b.net === 0 ? "settled" : `${b.net > 0 ? "gets back" : "owes"} ${formatMoney(Math.abs(b.net))}`}</td>
          </tr>
        ))}</tbody>
      </table>

      <h2 className="display mb-2 mt-7 text-xl font-semibold">Expenses</h2>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>Date</th><th className={th}>What</th><th className={th}>Paid by</th><th className={th}>Split</th><th className={th + r}>Amount</th></tr></thead>
        <tbody>{live.map((e) => (
          <tr key={e.id} className="break-inside-avoid">
            <td className={td + " whitespace-nowrap"}>{formatShort(e.spentOn)}</td>
            <td className={td}>{e.title}<br /><span className="text-neutral-600">{categoryOf(e.category).label}, {modeLabel(e.paymentMode)}</span></td>
            <td className={td}>{e.fromKitty ? "Kitty" : e.payers.map((p) => (e.payers.length > 1 ? `${name(p.participantId)} ${formatMoney(p.amount)}` : name(p.participantId))).join(", ")}</td>
            <td className={td}><span className="text-neutral-600">{splitLabel(e.split.mode)}:</span> {e.splits.map((s) => `${name(s.participantId)} ${formatMoney(s.amount)}`).join(", ")}</td>
            <td className={td + r + " font-semibold"}>{formatMoney(e.amount)}</td>
          </tr>
        ))}</tbody>
      </table>

      {state.settlements.some((s) => !s.deletedAt) && (
        <>
          <h2 className="display mb-2 mt-7 text-xl font-semibold">Payments already made</h2>
          <ul className="space-y-1">{state.settlements.filter((s) => !s.deletedAt).map((s) => <li key={s.id}>{formatShort(s.paidOn)}: {name(s.fromId)} paid {name(s.toId)} <span className="num">{formatMoney(s.amount)}</span> by {modeLabel(s.mode)}</li>)}</ul>
        </>
      )}
    </main>
  );
}
