"use client";
import { formatRange, timeAgo } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { chooseIdentity, useApp } from "./TripApp";
import { ExpenseRow } from "./ExpenseRow";
import { Avatar, Button, Empty, Icon, KittyMark, madras, Meter, Money, Panel, Section } from "./ui";

export function Home() {
  const app = useApp();
  const { state, me, person, nameOf, balances, transfers, kitty, spent, live } = app;
  const mine = balances.find((b) => b.participantId === me);
  const net = mine?.net ?? 0;
  const myTransfers = transfers.filter((t) => t.fromId === me || t.toId === me);
  const budget = state.trip.budgetTotal;
  const hasKitty = kitty.contributed > 0 || !!kitty.holderId;
  const colors = state.participants.map((p) => p.color);
  const range = formatRange(state.trip.startDate, state.trip.endDate);

  return (
    <main>
      <header className="relative overflow-hidden rounded-b-[28px] bg-indigo-deep text-white">
        <div aria-hidden className="h-[72px]" style={madras(colors)} />
        <div aria-hidden className="h-1.5 bg-turmeric" />
        <div className="px-5 pb-6 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="display text-[34px] font-semibold leading-[1.05]">{state.trip.name}</h1>
              {range && <p className="mt-1.5 text-[15px] text-white/75">{range}</p>}
            </div>
            <button type="button" onClick={chooseIdentity} aria-label={`You are ${nameOf(me)}. Change`} className="shrink-0 rounded-full ring-2 ring-white/40">
              <Avatar person={person(me)} size={40} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-white/70">Group has spent</p>
              <p className="display num mt-0.5 text-[30px] font-semibold leading-none">{formatMoney(spent)}</p>
            </div>
            <div>
              <p className="text-sm text-white/70">{net > 0 ? "You get back" : net < 0 ? "You owe" : "Your balance"}</p>
              <p className="display num mt-0.5 text-[30px] font-semibold leading-none" style={{ color: net > 0 ? "#7be3b9" : net < 0 ? "#ff9db0" : undefined }}>
                {net === 0 ? "Settled" : formatMoney(Math.abs(net))}
              </p>
            </div>
          </div>
          {mine && (
            <p className="mt-4 text-sm text-white/75">
              Your share so far is <span className="num font-semibold text-white">{formatMoney(mine.share)}</span>. You've paid{" "}
              <span className="num font-semibold text-white">{formatMoney(mine.paid + mine.contributed)}</span>.
            </p>
          )}
        </div>
      </header>

      <div className="px-4">
        {myTransfers.length > 0 && (
          <Section title="To settle" action={<Button variant="ghost" size="sm" className="!px-0" onClick={() => app.go("balances")}>All balances</Button>}>
            <Panel>
              {myTransfers.map((t, i) => {
                const paying = t.fromId === me;
                const other = person(paying ? t.toId : t.fromId);
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Avatar person={other} />
                    <p className="min-w-0 flex-1">
                      {paying ? "Pay " : ""}
                      <span className="font-semibold">{other?.name}</span>
                      {paying ? "" : " pays you"} <Money paise={t.amount} className={paying ? "font-semibold text-minus" : "font-semibold text-plus"} />
                    </p>
                    <Button size="sm" variant="quiet" onClick={() => app.settle({ fromId: t.fromId, toId: t.toId, amount: t.amount })}>
                      {paying ? "I paid" : "Got it"}
                    </Button>
                  </div>
                );
              })}
            </Panel>
          </Section>
        )}

        {budget ? (
          <Section title="Budget">
            <div className="rounded-2xl bg-surface p-4">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <p>
                  <Money paise={spent} className="font-semibold" /> <span className="text-muted">of {formatMoney(budget)}</span>
                </p>
                <p className={spent > budget ? "font-semibold text-minus" : "text-muted"}>
                  {spent > budget ? `${formatMoney(spent - budget)} over` : `${formatMoney(budget - spent)} left`}
                </p>
              </div>
              <Meter value={spent} max={budget} tone={spent > budget ? "minus" : "indigo"} label="Budget used" />
            </div>
          </Section>
        ) : null}

        {hasKitty && (
          <Section title="Kitty" action={<Button variant="ghost" size="sm" className="!px-0" onClick={app.addToKitty}>Add money</Button>}>
            <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
              <KittyMark size={44} />
              <div className="min-w-0 flex-1">
                <p className="display num text-2xl font-semibold leading-tight">{formatMoney(kitty.remaining)} <span className="font-sans text-[15px] font-normal text-muted">left</span></p>
                <p className="truncate text-sm text-muted">
                  {formatMoney(kitty.spent)} spent of {formatMoney(kitty.contributed)}. {kitty.holderId ? `${nameOf(kitty.holderId)} is holding it.` : ""}
                </p>
              </div>
            </div>
          </Section>
        )}

        <Section
          title="Latest expenses"
          action={live.length > 5 ? <Button variant="ghost" size="sm" className="!px-0" onClick={() => app.go("expenses")}>See all {live.length}</Button> : undefined}
        >
          {live.length === 0 ? (
            <Empty action={<Button onClick={app.addExpense}><Icon name="plus" size={18} /> Add expense</Button>}>
              Nothing yet. Start with what's already booked, like train tickets or the stay.
            </Empty>
          ) : (
            <Panel>{live.slice(0, 5).map((e) => <ExpenseRow key={e.id} e={e} />)}</Panel>
          )}
        </Section>

        {state.activity.length > 1 && (
          <Section title="Recent changes" action={<Button variant="ghost" size="sm" className="!px-0" onClick={() => app.go("group")}>Full history</Button>}>
            <ul className="space-y-3 pl-1">
              {state.activity.slice(0, 4).map((a) => (
                <li key={a.id} className="flex gap-3 text-[15px]">
                  <Avatar person={person(a.actorId)} size={24} />
                  <p className="min-w-0 flex-1">
                    {a.summary} <span className="whitespace-nowrap text-sm text-muted">{timeAgo(a.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </main>
  );
}
