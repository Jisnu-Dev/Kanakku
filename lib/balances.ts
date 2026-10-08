import type { TripState } from "./types";

export interface PersonBalance {
  participantId: string;
  paid: number; // paid out of pocket for group expenses
  contributed: number; // put into the kitty
  share: number; // their share of every expense
  settledOut: number; // paid back to others
  settledIn: number; // received from others
  kittyHeld: number; // kitty cash they are still holding
  net: number; // > 0: gets money back, < 0: owes
}

export interface Transfer {
  fromId: string;
  toId: string;
  amount: number;
}

export interface KittySummary {
  contributed: number;
  spent: number;
  remaining: number;
  holderId: string | null;
}

export function kittySummary(state: TripState): KittySummary {
  const contributed = state.kitty.filter((k) => !k.deletedAt).reduce((a, k) => a + k.amount, 0);
  const spent = state.expenses.filter((e) => !e.deletedAt && e.fromKitty).reduce((a, e) => a + e.amount, 0);
  return { contributed, spent, remaining: contributed - spent, holderId: state.trip.kittyHolderId };
}

/**
 * Balances are always derived from the ledger, never stored.
 * net = (paid + put into kitty + paid back to others) − (share of expenses + received from others) − kitty cash held
 * The kitty holder is charged for what is left in the kitty (they have that money), which makes the nets sum to zero.
 */
export function computeBalances(state: TripState): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  for (const p of state.participants)
    map.set(p.id, { participantId: p.id, paid: 0, contributed: 0, share: 0, settledOut: 0, settledIn: 0, kittyHeld: 0, net: 0 });
  const get = (id: string) => map.get(id);

  for (const e of state.expenses) {
    if (e.deletedAt) continue;
    if (!e.fromKitty) for (const l of e.payers) { const b = get(l.participantId); if (b) b.paid += l.amount; }
    for (const l of e.splits) { const b = get(l.participantId); if (b) b.share += l.amount; }
  }
  for (const k of state.kitty) {
    if (k.deletedAt) continue;
    const b = get(k.participantId);
    if (b) b.contributed += k.amount;
  }
  for (const s of state.settlements) {
    if (s.deletedAt) continue;
    const from = get(s.fromId), to = get(s.toId);
    if (from) from.settledOut += s.amount;
    if (to) to.settledIn += s.amount;
  }
  const kitty = kittySummary(state);
  if (kitty.holderId && get(kitty.holderId)) get(kitty.holderId)!.kittyHeld = kitty.remaining;

  for (const b of map.values()) b.net = b.paid + b.contributed + b.settledOut - b.share - b.settledIn - b.kittyHeld;
  return [...map.values()];
}

/**
 * Reduce net balances to a short list of payments: repeatedly match the person who owes
 * the most with the person who is owed the most. Produces at most (people − 1) transfers.
 */
export function simplifyDebts(balances: Pick<PersonBalance, "participantId" | "net">[]): Transfer[] {
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ id: b.participantId, amt: -b.net }));
  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ id: b.participantId, amt: b.net }));
  const out: Transfer[] = [];
  const byAmt = (a: { amt: number; id: string }, b: { amt: number; id: string }) => b.amt - a.amt || a.id.localeCompare(b.id);
  while (debtors.length && creditors.length) {
    debtors.sort(byAmt);
    creditors.sort(byAmt);
    // An exact match clears two people with one payment, so prefer it.
    let d = debtors[0], c = creditors[0];
    outer: for (const dd of debtors) for (const cc of creditors) if (dd.amt === cc.amt) { d = dd; c = cc; break outer; }
    const amount = Math.min(d.amt, c.amt);
    out.push({ fromId: d.id, toId: c.id, amount });
    d.amt -= amount;
    c.amt -= amount;
    if (d.amt === 0) debtors.splice(debtors.indexOf(d), 1);
    if (c.amt === 0) creditors.splice(creditors.indexOf(c), 1);
  }
  return out;
}

export function totalSpent(state: TripState): number {
  return state.expenses.filter((e) => !e.deletedAt).reduce((a, e) => a + e.amount, 0);
}
