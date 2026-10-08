"use client";
import { categoryOf } from "@/lib/constants";
import type { Expense } from "@/lib/types";
import { useApp } from "./TripApp";
import { cx, Money } from "./ui";

/** One line in any expense list: what, who paid, and what it means for you. */
export function ExpenseRow({ e }: { e: Expense }) {
  const { me, nameOf, viewExpense, state } = useApp();
  const cat = categoryOf(e.category);
  const myShare = e.splits.find((s) => s.participantId === me)?.amount ?? 0;
  const myPaid = e.fromKitty ? 0 : (e.payers.find((p) => p.participantId === me)?.amount ?? 0);
  const delta = myPaid - myShare;
  const paidBy = e.fromKitty ? "Kitty" : e.payers.length > 1 ? `${e.payers.length} people` : nameOf(e.payers[0]?.participantId);
  const advance = state.trip.startDate && e.spentOn < state.trip.startDate;

  return (
    <button type="button" onClick={() => viewExpense(e.id)} className={cx("flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunk", e.deletedAt && "opacity-55")}>
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunk text-xl">{cat.glyph}</span>
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate font-semibold", e.deletedAt && "line-through")}>{e.title}</span>
        <span className="block truncate text-sm text-muted">
          {paidBy} paid{e.paymentMode === "cash" ? " in cash" : ""}
          {advance ? ", booked ahead" : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Money paise={e.amount} className="block font-semibold" />
        <span className="block text-sm">
          {!me || (myShare === 0 && myPaid === 0) ? (
            <span className="text-muted">not you</span>
          ) : delta > 0 ? (
            <span className="text-plus">you lent <Money paise={delta} /></span>
          ) : delta < 0 ? (
            <span className="text-minus">you owe <Money paise={-delta} /></span>
          ) : (
            <span className="text-muted">you're even</span>
          )}
        </span>
      </span>
    </button>
  );
}
