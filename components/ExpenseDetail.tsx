"use client";
import { useState } from "react";
import { categoryOf, modeLabel, splitLabel } from "@/lib/constants";
import { dayNumber, formatDay, timeAgo } from "@/lib/format";
import { useApp } from "./TripApp";
import { Avatar, Button, Icon, KittyMark, Money, Sheet } from "./ui";

export function ExpenseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, person, nameOf, me, act, busy, editExpense, toast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return null;
  const cat = categoryOf(e.category);
  const history = state.activity.filter((a) => a.entityId === e.id);
  const day = dayNumber(state.trip.startDate, e.spentOn);
  const when = `${formatDay(e.spentOn)}${day !== null ? (day < 1 ? ", before the trip" : `, day ${day}`) : ""}`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={e.deletedAt ? "Deleted expense" : "Expense"}
      footer={
        e.deletedAt ? (
          <Button size="lg" className="w-full" disabled={busy} onClick={async () => (await act("expense.restore", { id })) && toast("Restored")}>
            <Icon name="undo" size={18} /> Restore expense
          </Button>
        ) : confirming ? (
          <div className="flex gap-3">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" size="lg" className="flex-1" disabled={busy} onClick={async () => { if (await act("expense.delete", { id })) { toast("Deleted. You can restore it from the Group tab."); onClose(); } }}>
              Delete expense
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variant="quiet" size="lg" aria-label="Delete expense" onClick={() => setConfirming(true)}><Icon name="trash" size={18} /></Button>
            <Button size="lg" className="flex-1" onClick={() => editExpense(e)}><Icon name="edit" size={18} /> Edit</Button>
          </div>
        )
      }
    >
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunk text-2xl">{cat.glyph}</span>
        <div className="min-w-0 flex-1">
          <h3 className="display text-2xl font-semibold leading-tight">{e.title}</h3>
          <p className="mt-0.5 text-[15px] text-muted">{cat.label}, {when}</p>
        </div>
      </div>
      <p className="display num mt-4 text-[44px] font-semibold leading-none">
        <Money paise={e.amount} />
      </p>
      <p className="mt-1.5 text-[15px] text-muted">Paid with {modeLabel(e.paymentMode)}{e.createdBy ? `. Added by ${nameOf(e.createdBy)}` : ""}.</p>

      <h4 className="mb-1 mt-6 text-sm font-medium text-muted">Paid by</h4>
      <ul className="divide-y divide-line">
        {e.fromKitty ? (
          <li className="flex items-center gap-3 py-2.5"><KittyMark size={32} /><span className="flex-1 font-medium">The kitty</span><Money paise={e.amount} className="font-semibold" /></li>
        ) : (
          e.payers.map((p) => (
            <li key={p.participantId} className="flex items-center gap-3 py-2.5">
              <Avatar person={person(p.participantId)} size={32} />
              <span className="flex-1 font-medium">{nameOf(p.participantId)}{p.participantId === me ? " (you)" : ""}</span>
              <Money paise={p.amount} className="font-semibold" />
            </li>
          ))
        )}
      </ul>

      <h4 className="mb-1 mt-6 text-sm font-medium text-muted">Split {splitLabel(e.split.mode).toLowerCase()} between {e.splits.length}</h4>
      <ul className="divide-y divide-line">
        {[...e.splits].sort((a, b) => b.amount - a.amount).map((s) => (
          <li key={s.participantId} className="flex items-center gap-3 py-2.5">
            <Avatar person={person(s.participantId)} size={32} />
            <span className="flex-1 font-medium">{nameOf(s.participantId)}{s.participantId === me ? " (you)" : ""}</span>
            <Money paise={s.amount} className="font-semibold" />
          </li>
        ))}
      </ul>

      {e.split.mode === "itemized" && e.split.items && (
        <>
          <h4 className="mb-1 mt-6 text-sm font-medium text-muted">Items</h4>
          <ul className="divide-y divide-line">
            {e.split.items.map((it, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{it.name || `Item ${i + 1}`}</span>
                  <span className="block truncate text-sm text-muted">{it.participantIds.map(nameOf).join(", ")}</span>
                </span>
                <Money paise={it.amount} />
              </li>
            ))}
          </ul>
        </>
      )}

      {e.note && (
        <>
          <h4 className="mb-1 mt-6 text-sm font-medium text-muted">Note</h4>
          <p className="whitespace-pre-wrap">{e.note}</p>
        </>
      )}

      {e.receiptId && (
        <>
          <h4 className="mb-2 mt-6 text-sm font-medium text-muted">Receipt</h4>
          <a href={`/api/trips/${state.trip.id}/receipt/${e.receiptId}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/trips/${state.trip.id}/receipt/${e.receiptId}`} alt={`Receipt for ${e.title}`} className="max-h-72 rounded-2xl border border-line" />
          </a>
        </>
      )}

      <h4 className="mb-2 mt-6 text-sm font-medium text-muted">History</h4>
      <ol className="space-y-3">
        {history.map((a) => (
          <li key={a.id} className="flex gap-3 text-[15px]">
            <Avatar person={person(a.actorId)} size={24} />
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-medium">{a.actorId ? nameOf(a.actorId) : "Someone"}</span>{" "}
                {a.action === "expense.create" ? "added this" : a.action === "expense.update" ? "edited this" : a.action === "expense.delete" ? "deleted this" : "restored this"}{" "}
                <span className="whitespace-nowrap text-sm text-muted">{timeAgo(a.createdAt)}</span>
              </p>
              {a.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-sm text-muted">
                  {a.changes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
