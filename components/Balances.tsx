"use client";
import { useState } from "react";
import { modeLabel } from "@/lib/constants";
import { formatShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { explainBalance, type Transfer } from "@/lib/balances";
import { useApp } from "./TripApp";
import { Avatar, Button, cx, Empty, Icon, Money, NetLabel, Panel, Section, Sheet } from "./ui";

export function Balances() {
  const app = useApp();
  const { state, me, person, nameOf, balances, transfers, kitty, act, busy } = app;
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<Transfer | null>(null);
  const payments = state.settlements.filter((s) => !s.deletedAt);
  const sorted = [...balances].sort((a, b) => (a.participantId === me ? -1 : b.participantId === me ? 1 : b.net - a.net));
  const biggest = Math.max(1, ...balances.map((b) => Math.abs(b.net)));
  const kittyLoose = kitty.remaining !== 0 && !kitty.holderId;

  return (
    <main className="px-4 pt-6">
      <h1 className="display text-[32px] font-semibold leading-tight">Balances</h1>
      <p className="mt-1 text-muted">
        {transfers.length === 0 ? "Everyone is settled up." : `${transfers.length} ${transfers.length === 1 ? "payment settles" : "payments settle"} the whole trip.`}
      </p>

      <Section title="Who pays whom" action={<Button variant="ghost" size="sm" className="!px-0" onClick={() => app.settle()}>Record another payment</Button>}>
        {transfers.length === 0 ? (
          <Empty>No one owes anything right now.</Empty>
        ) : (
          <Panel>
            {transfers.map((t, i) => {
              const mine = t.fromId === me || t.toId === me;
              return (
                <div key={i} className={cx("flex items-center gap-2.5 py-1.5 pl-2.5 pr-4", mine && "bg-sunk/60")}>
                  <button type="button" onClick={() => setWhy(t)} aria-label={`Why ${nameOf(t.fromId)} pays ${nameOf(t.toId)} ${formatMoney(t.amount)}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-2 text-left active:bg-sunk">
                    <Avatar person={person(t.fromId)} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 leading-snug">
                        <span className="font-semibold">{t.fromId === me ? "You" : nameOf(t.fromId)}</span>
                        <span className="text-muted">{t.fromId === me ? "pay" : "pays"}</span>
                        <span className="font-semibold">{t.toId === me ? "you" : nameOf(t.toId)}</span>
                      </span>
                      <span className="flex items-baseline gap-2">
                        <Money paise={t.amount} className="display text-xl font-semibold" />
                        <span className="text-sm font-medium text-indigo dark:text-turmeric">See why</span>
                      </span>
                    </span>
                  </button>
                  <Button size="sm" variant={mine ? "primary" : "quiet"} onClick={() => app.settle(t)}>Mark paid</Button>
                </div>
              );
            })}
          </Panel>
        )}
        {kittyLoose && (
          <p className="mt-3 rounded-2xl bg-minus-wash p-3.5 text-[15px] text-minus">
            The kitty has {formatMoney(kitty.remaining)} in it but no one is marked as holding it, so these numbers leave it out. Set a holder in the Group tab.
          </p>
        )}
      </Section>

      <Section title="Each person">
        <Panel>
          {sorted.map((b) => {
            const p = person(b.participantId)!;
            const isOpen = open === b.participantId;
            const width = `${(Math.abs(b.net) / biggest) * 50}%`;
            return (
              <div key={b.participantId}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.participantId)} className="block w-full px-4 py-3 text-left active:bg-sunk">
                  <span className="flex items-center gap-3">
                    <Avatar person={p} dim={!p.active} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}{p.id === me ? " (you)" : ""}{!p.active ? " (left)" : ""}</span>
                      <span className="block text-[15px]"><NetLabel net={b.net} /></span>
                    </span>
                    <Icon name={isOpen ? "down" : "chevron"} size={18} className="text-muted" />
                  </span>
                  {/* Owes grows left of the centre line, gets-back grows right. */}
                  <span aria-hidden className="relative mt-2.5 block h-1.5 rounded-full bg-sunk">
                    <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-line" />
                    {b.net !== 0 && <span className="absolute top-0 h-full rounded-full" style={{ width, background: b.net > 0 ? "var(--plus)" : "var(--minus)", ...(b.net > 0 ? { left: "50%" } : { right: "50%" }) }} />}
                  </span>
                </button>
                {isOpen && (
                  <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 bg-sunk/60 px-4 py-3.5 text-[15px]">
                    <dt className="text-muted">Paid for the group</dt><dd className="text-right">{formatMoney(b.paid)}</dd>
                    {b.contributed > 0 && (<><dt className="text-muted">Put into the kitty</dt><dd className="text-right">{formatMoney(b.contributed)}</dd></>)}
                    {b.settledOut > 0 && (<><dt className="text-muted">Paid back to others</dt><dd className="text-right">{formatMoney(b.settledOut)}</dd></>)}
                    <dt className="text-muted">Their share of expenses</dt><dd className="text-right">{formatMoney(-b.share)}</dd>
                    {b.settledIn > 0 && (<><dt className="text-muted">Received from others</dt><dd className="text-right">{formatMoney(-b.settledIn)}</dd></>)}
                    {b.kittyHeld !== 0 && (<><dt className="text-muted">Kitty cash they hold</dt><dd className="text-right">{formatMoney(-b.kittyHeld)}</dd></>)}
                    <dt className="border-t border-line pt-1.5 font-semibold">Balance</dt>
                    <dd className={cx("border-t border-line pt-1.5 text-right font-semibold", b.net > 0 ? "text-plus" : b.net < 0 ? "text-minus" : "")}>{formatMoney(b.net, { sign: true })}</dd>
                  </dl>
                )}
              </div>
            );
          })}
        </Panel>
      </Section>

      {payments.length > 0 && (
        <Section title="Payments recorded">
          <Panel>
            {payments.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar person={person(s.fromId)} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate"><span className="font-semibold">{nameOf(s.fromId)}</span> paid <span className="font-semibold">{nameOf(s.toId)}</span></p>
                  <p className="truncate text-sm text-muted">{formatShort(s.paidOn)}, {modeLabel(s.mode)}{s.note ? `, ${s.note}` : ""}</p>
                </div>
                <Money paise={s.amount} className="font-semibold" />
                <button type="button" aria-label={`Remove payment from ${nameOf(s.fromId)} to ${nameOf(s.toId)}`} disabled={busy}
                  onClick={async () => confirm("Remove this payment? Balances will go back to what they were.") && (await act("settlement.delete", { id: s.id })) && app.toast("Payment removed")}
                  className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunk">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </Panel>
        </Section>
      )}
      {why && <WhySheet transfer={why} onClose={() => setWhy(null)} />}
    </main>
  );
}

/** Explains one suggested payment: every entry behind what the payer owes and what the receiver is owed. */
function WhySheet({ transfer, onClose }: { transfer: Transfer; onClose: () => void }) {
  const app = useApp();
  const { state, me, person, nameOf, balances, transfers } = app;
  const [showReceiver, setShowReceiver] = useState(false);
  const { fromId, toId, amount } = transfer;
  const from = balances.find((b) => b.participantId === fromId);
  const to = balances.find((b) => b.participantId === toId);
  const fromName = fromId === me ? "You" : nameOf(fromId);
  const toName = toId === me ? "you" : nameOf(toId);
  const owes = from ? -from.net : 0;
  const owed = to ? to.net : 0;
  const otherPayees = transfers.filter((t) => t.fromId === fromId && t.toId !== toId);
  const otherPayers = transfers.filter((t) => t.toId === toId && t.fromId !== fromId);
  const you = (id: string) => (id === me ? "you" : nameOf(id));
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

  const ledger = (id: string) => {
    const lines = explainBalance(state, id, nameOf, formatMoney);
    return (
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.label}</span>
                <span className="block text-sm text-muted">{l.date ? `${formatShort(l.date)}. ` : ""}{l.detail}</span>
              </span>
              <span className={cx("num shrink-0 font-semibold", l.effect > 0 ? "text-plus" : l.effect < 0 ? "text-minus" : "text-muted")}>{formatMoney(l.effect, { sign: true })}</span>
            </>
          );
          return (
            <li key={l.kind + l.key}>
              {l.expenseId ? (
                <button type="button" onClick={() => app.viewExpense(l.expenseId!)} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-sunk">{body}</button>
              ) : (
                <div className="flex items-center gap-3 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Sheet open onClose={onClose} title="Why this payment"
      footer={<Button size="lg" className="w-full" onClick={() => { onClose(); app.settle(transfer); }}>Mark {formatMoney(amount)} as paid</Button>}>
      <div className="flex items-center gap-3">
        <Avatar person={person(fromId)} size={40} />
        <Icon name="arrow" className="text-muted" />
        <Avatar person={person(toId)} size={40} />
        <p className="display num ml-auto text-[28px] font-semibold leading-none">{formatMoney(amount)}</p>
      </div>
      <p className="mt-4">
        {fromName} {fromId === me ? "owe" : "owes"} <span className="num font-semibold">{formatMoney(owes)}</span> overall, and {toName} {toId === me ? "are" : "is"} owed{" "}
        <span className="num font-semibold">{formatMoney(owed)}</span> overall.{" "}
        {otherPayees.length === 0
          ? `${fromId === me ? "Your" : "Their"} whole balance goes to ${toName} in one payment.`
          : `${formatMoney(amount)} of it goes to ${toName}, and the rest to ${list(otherPayees.map((t) => `${you(t.toId)} (${formatMoney(t.amount)})`))}.`}
        {otherPayers.length > 0 && ` ${toId === me ? "You also get" : `${nameOf(toId)} also gets`} ${list(otherPayers.map((t) => `${formatMoney(t.amount)} from ${you(t.fromId)}`))}.`}
      </p>
      <p className="mt-2 text-sm text-muted">
        Payments are matched up so the trip settles in as few transfers as possible. So {fromName === "You" ? "you" : fromName} may pay someone who didn't pay for {fromId === me ? "your" : "their"} expenses directly, but nobody pays or receives more than their own balance.
      </p>

      <h3 className="display mt-6 text-[19px] font-semibold">How {fromId === me ? "you" : nameOf(fromId)} came to owe {formatMoney(owes)}</h3>
      <p className="mb-1 mt-1 text-sm text-muted">Green is money put in, red is money used. Tap an expense to open it.</p>
      {ledger(fromId)}
      <p className="num flex justify-between border-t-2 border-ink/60 pt-2.5 font-semibold"><span>Balance</span><span className="text-minus">{formatMoney(-owes, { sign: true })}</span></p>

      <button type="button" aria-expanded={showReceiver} onClick={() => setShowReceiver(!showReceiver)} className="mt-7 flex w-full items-center gap-2 text-left">
        <h3 className="display flex-1 text-[19px] font-semibold">How {toId === me ? "you are" : `${nameOf(toId)} is`} owed {formatMoney(owed)}</h3>
        <Icon name={showReceiver ? "down" : "chevron"} size={18} className="text-muted" />
      </button>
      {showReceiver && (
        <>
          {ledger(toId)}
          <p className="num flex justify-between border-t-2 border-ink/60 pt-2.5 font-semibold"><span>Balance</span><span className="text-plus">{formatMoney(owed, { sign: true })}</span></p>
        </>
      )}
    </Sheet>
  );
}
