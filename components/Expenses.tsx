"use client";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import { dayNumber, formatDay } from "@/lib/format";
import type { Expense } from "@/lib/types";
import { useApp } from "./TripApp";
import { ExpenseRow } from "./ExpenseRow";
import { Button, Chip, cx, Empty, Icon, inputClass, Money, Panel } from "./ui";

type Scope = "all" | "mine" | "cash" | "advance";

export function Expenses() {
  const { live, state, me, addExpense } = useApp();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [cat, setCat] = useState<string | null>(null);
  const start = state.trip.startDate;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return live.filter((e) => {
      if (cat && e.category !== cat) return false;
      if (scope === "mine" && !e.splits.some((s) => s.participantId === me) && !e.payers.some((p) => p.participantId === me)) return false;
      if (scope === "cash" && e.paymentMode !== "cash") return false;
      if (scope === "advance" && !(start && e.spentOn < start)) return false;
      return !needle || e.title.toLowerCase().includes(needle) || e.note.toLowerCase().includes(needle);
    });
  }, [live, q, scope, cat, me, start]);

  const days = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of shown) (m.get(e.spentOn) ?? m.set(e.spentOn, []).get(e.spentOn)!).push(e);
    return [...m.entries()];
  }, [shown]);
  const usedCats = CATEGORIES.filter((c) => live.some((e) => e.category === c.id));
  const total = shown.reduce((a, e) => a + e.amount, 0);
  const filtered = q || scope !== "all" || cat;

  return (
    <main className="px-4 pt-6">
      <h1 className="display text-[32px] font-semibold leading-tight">Expenses</h1>
      <p className="mt-1 text-muted">
        {shown.length} {shown.length === 1 ? "expense" : "expenses"}{filtered ? " match" : ""}, <Money paise={total} className="font-semibold text-ink" /> in total
      </p>

      {live.length > 0 && (
        <>
          <label className="relative mt-4 block">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Search expenses" placeholder="Search expenses" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputClass, "pl-10")} />
          </label>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <Chip on={scope === "all" && !cat} onClick={() => { setScope("all"); setCat(null); }}>All</Chip>
            <Chip on={scope === "mine"} onClick={() => setScope(scope === "mine" ? "all" : "mine")}>Involving me</Chip>
            <Chip on={scope === "cash"} onClick={() => setScope(scope === "cash" ? "all" : "cash")}>Cash only</Chip>
            {start && <Chip on={scope === "advance"} onClick={() => setScope(scope === "advance" ? "all" : "advance")}>Booked ahead</Chip>}
            {usedCats.map((c) => (
              <Chip key={c.id} on={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}><span aria-hidden>{c.glyph}</span> {c.label}</Chip>
            ))}
          </div>
        </>
      )}

      {live.length === 0 ? (
        <div className="mt-6">
          <Empty action={<Button onClick={addExpense}><Icon name="plus" size={18} /> Add expense</Button>}>No expenses yet. Add the first one and it shows up here for everyone.</Empty>
        </div>
      ) : days.length === 0 ? (
        <div className="mt-6"><Empty action={<Button variant="quiet" onClick={() => { setQ(""); setScope("all"); setCat(null); }}>Clear filters</Button>}>Nothing matches these filters.</Empty></div>
      ) : (
        days.map(([day, list]) => {
          const n = dayNumber(start, day);
          return (
            <section key={day} className="mt-6">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-semibold">
                  {formatDay(day)} {n !== null && <span className="font-normal text-muted">{n < 1 ? "before the trip" : `day ${n}`}</span>}
                </h2>
                <Money paise={list.reduce((a, e) => a + e.amount, 0)} className="text-sm text-muted" />
              </div>
              <Panel>{list.map((e) => <ExpenseRow key={e.id} e={e} />)}</Panel>
            </section>
          );
        })
      )}
    </main>
  );
}
