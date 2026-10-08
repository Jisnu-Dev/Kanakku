"use client";
import { useMemo, useState } from "react";
import { CATEGORIES, modeLabel, PAYMENT_MODES } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useApp } from "./TripApp";
import { Avatar, Empty, Meter, Money, Panel, Section, Segmented } from "./ui";

/** A labelled horizontal bar. The amount is always written out, so the bar is only a visual aid. */
function Bar({ label, lead, value, max, sub, color }: { label: string; lead?: React.ReactNode; value: number; max: number; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2.5">
        {lead}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <Money paise={value} className="font-semibold" />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunk">
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, minWidth: value > 0 ? 4 : 0, background: color ?? "var(--indigo)" }} />
      </div>
      {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Insights() {
  const { live, state, me, person, balances, spent } = useApp();
  const [view, setView] = useState<"group" | "me">("group");
  const start = state.trip.startDate;
  const mine = view === "me" && !!me;

  // In "me" view every expense counts only for your share of it.
  const weight = (e: (typeof live)[number]) => (mine ? (e.splits.find((s) => s.participantId === me)?.amount ?? 0) : e.amount);
  const total = live.reduce((a, e) => a + weight(e), 0);

  const byCat = useMemo(() => CATEGORIES.map((c) => ({ ...c, value: live.filter((e) => e.category === c.id).reduce((a, e) => a + weight(e), 0) })).filter((c) => c.value > 0 || (!mine && state.budgets[c.id])).sort((a, b) => b.value - a.value), [live, mine, me, state.budgets]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of live) {
      const key = start && e.spentOn < start ? "before" : e.spentOn;
      m.set(key, (m.get(key) ?? 0) + weight(e));
    }
    return [...m.entries()].filter(([, v]) => v > 0).sort(([a], [b]) => (a === "before" ? -1 : b === "before" ? 1 : a.localeCompare(b)));
  }, [live, mine, me, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const byMode = PAYMENT_MODES.map((m) => ({ ...m, value: live.filter((e) => e.paymentMode === m.id).reduce((a, e) => a + weight(e), 0) })).filter((m) => m.value > 0);
  const tripDays = byDay.filter(([d]) => d !== "before");
  const tripTotal = tripDays.reduce((a, [, v]) => a + v, 0);
  const maxCat = Math.max(1, ...byCat.map((c) => Math.max(c.value, mine ? 0 : (state.budgets[c.id] ?? 0))));
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v));
  const maxPerson = Math.max(1, ...balances.map((b) => Math.max(b.share, b.paid + b.contributed)));

  return (
    <main className="px-4 pt-6">
      <h1 className="display text-[32px] font-semibold leading-tight">Spending</h1>
      <div className="mt-4"><Segmented label="Whose spending" value={view} onChange={setView} options={[{ id: "group", label: "Whole group" }, { id: "me", label: "My share" }]} /></div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-sm text-muted">{mine ? "Your share" : "Total spent"}</p>
          <p className="display num mt-0.5 text-[26px] font-semibold leading-tight">{formatMoney(total)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-sm text-muted">{tripDays.length > 0 ? "Average per day" : "Expenses"}</p>
          <p className="display num mt-0.5 text-[26px] font-semibold leading-tight">{tripDays.length > 0 ? formatMoney(Math.round(tripTotal / tripDays.length / 100) * 100) : live.length}</p>
        </div>
      </div>

      {live.length === 0 ? (
        <div className="mt-6"><Empty>Charts appear here once there are expenses to add up.</Empty></div>
      ) : (
        <>
          {!mine && state.trip.budgetTotal ? (
            <Section title="Trip budget">
              <div className="rounded-2xl bg-surface p-4">
                <p className="mb-2.5">
                  <Money paise={spent} className="font-semibold" /> <span className="text-muted">of {formatMoney(state.trip.budgetTotal)}, </span>
                  <span className={spent > state.trip.budgetTotal ? "font-semibold text-minus" : "text-muted"}>
                    {spent > state.trip.budgetTotal ? `${formatMoney(spent - state.trip.budgetTotal)} over` : `${formatMoney(state.trip.budgetTotal - spent)} left`}
                  </span>
                </p>
                <Meter value={spent} max={state.trip.budgetTotal} tone={spent > state.trip.budgetTotal ? "minus" : "indigo"} label="Trip budget used" />
              </div>
            </Section>
          ) : null}

          <Section title="By category">
            <Panel>
              {byCat.map((c) => {
                const budget = mine ? 0 : (state.budgets[c.id] ?? 0);
                const over = budget > 0 && c.value > budget;
                return (
                  <Bar key={c.id} label={c.label} lead={<span aria-hidden className="text-lg">{c.glyph}</span>} value={c.value} max={maxCat} color={over ? "var(--minus)" : undefined}
                    sub={budget > 0 ? <span className={over ? "font-semibold text-minus" : ""}>{over ? `${formatMoney(c.value - budget)} over the ${formatMoney(budget)} budget` : `${formatMoney(budget - c.value)} left of ${formatMoney(budget)}`}</span> : total > 0 ? `${Math.round((c.value / total) * 100)}% of ${mine ? "your share" : "spending"}` : undefined} />
                );
              })}
            </Panel>
          </Section>

          <Section title="By day">
            <Panel>{byDay.map(([d, v]) => <Bar key={d} label={d === "before" ? "Booked before the trip" : formatDay(d)} value={v} max={maxDay} />)}</Panel>
          </Section>

          {!mine && (
            <Section title="Paid versus share">
              <p className="-mt-1 mb-3 text-[15px] text-muted">What each person put in, against what their share comes to.</p>
              <Panel>
                {balances.map((b) => {
                  const p = person(b.participantId)!;
                  const put = b.paid + b.contributed;
                  return (
                    <div key={b.participantId} className="px-4 py-3">
                      <div className="mb-2 flex items-center gap-2.5"><Avatar person={p} size={26} /><span className="font-medium">{p.name}</span></div>
                      {[["Paid", put, "var(--indigo)"], ["Share", b.share, "var(--turmeric)"]].map(([label, v, color]) => (
                        <div key={label as string} className="mt-1 flex items-center gap-2.5 text-sm">
                          <span className="w-11 text-muted">{label}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunk"><span className="block h-full rounded-full" style={{ width: `${((v as number) / maxPerson) * 100}%`, background: color as string, minWidth: (v as number) > 0 ? 4 : 0 }} /></span>
                          <span className="num w-20 text-right font-medium">{formatMoney(v as number)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Panel>
            </Section>
          )}

          <Section title="Paid with">
            <Panel>{byMode.map((m) => <Bar key={m.id} label={modeLabel(m.id)} value={m.value} max={total} sub={`${Math.round((m.value / Math.max(1, total)) * 100)}%`} />)}</Panel>
          </Section>
        </>
      )}
    </main>
  );
}
