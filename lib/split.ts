import type { Line, SplitInput } from "./types";

/**
 * Divide `total` paise in proportion to `weights` so the parts add up to exactly `total`.
 * Each part is floored, then the leftover paise go one each to the largest fractional
 * remainders. Ties are broken starting from `seed`, so the extra paisa rotates between
 * people across expenses instead of always landing on whoever is listed first.
 */
export function allocate(total: number, weights: number[], seed = 0): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new SplitError("Nothing to split by");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / sum);
  const parts = raw.map((r) => Math.floor(r + 1e-9));
  let left = abs - parts.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, frac: raw[i] - parts[i], rot: (((i - seed) % n) + n) % n, w }))
    .filter((o) => o.w > 0)
    .sort((a, b) => (Math.abs(b.frac - a.frac) > 1e-9 ? b.frac - a.frac : a.rot - b.rot));
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1;
  return parts.map((p) => p * sign);
}

export class SplitError extends Error {}

/** Small stable hash so each expense gets its own tie-break starting point. */
export function seedFrom(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Turn a split input into per-person amounts that add up to exactly `total`.
 * Throws SplitError with a message a person can act on when the input doesn't add up.
 */
export function computeSplit(total: number, input: SplitInput, seed = 0): Line[] {
  if (!Number.isInteger(total) || total <= 0) throw new SplitError("Enter an amount");
  const ids = [...new Set(input.participantIds)];
  const lines = (amounts: number[], who = ids): Line[] =>
    who.map((participantId, i) => ({ participantId, amount: amounts[i] })).filter((l) => l.amount !== 0);

  switch (input.mode) {
    case "equal": {
      if (ids.length === 0) throw new SplitError("Pick at least one person to split between");
      return lines(allocate(total, ids.map(() => 1), seed));
    }
    case "exact": {
      const amounts = ids.map((id) => input.exact?.[id] ?? 0);
      if (amounts.some((a) => !Number.isInteger(a) || a < 0)) throw new SplitError("Amounts can't be negative");
      const sum = amounts.reduce((a, b) => a + b, 0);
      if (sum !== total) throw new SplitError(sum < total ? "Amounts add up to less than the total" : "Amounts add up to more than the total");
      return lines(amounts);
    }
    case "percent": {
      const pcts = ids.map((id) => input.percent?.[id] ?? 0);
      if (pcts.some((p) => !(p >= 0))) throw new SplitError("Percentages can't be negative");
      const hundredths = pcts.reduce((a, p) => a + Math.round(p * 100), 0);
      if (hundredths !== 10000) throw new SplitError("Percentages must add up to 100");
      return lines(allocate(total, pcts, seed));
    }
    case "shares": {
      const shares = ids.map((id) => input.shares?.[id] ?? 0);
      if (shares.some((s) => !(s >= 0))) throw new SplitError("Shares can't be negative");
      if (!shares.some((s) => s > 0)) throw new SplitError("Give at least one person a share");
      return lines(allocate(total, shares, seed));
    }
    case "itemized": {
      const items = input.items ?? [];
      if (items.length === 0) throw new SplitError("Add at least one item");
      // Each person's weight is what they ordered: an item shared by three counts a third each.
      const ordered = new Map<string, number>();
      let itemTotal = 0;
      items.forEach((item, idx) => {
        if (!Number.isInteger(item.amount) || item.amount <= 0) throw new SplitError(`Enter a price for ${item.name || "item " + (idx + 1)}`);
        const who = [...new Set(item.participantIds)];
        if (who.length === 0) throw new SplitError(`Pick who had ${item.name || "item " + (idx + 1)}`);
        for (const id of who) ordered.set(id, (ordered.get(id) ?? 0) + item.amount / who.length);
        itemTotal += item.amount;
      });
      if (itemTotal > total) throw new SplitError("Items add up to more than the total");
      // Dividing the whole bill by those weights spreads tax, service charge and tip in
      // proportion to what each person ordered, and rounds only once.
      const who = [...ordered.keys()];
      return lines(allocate(total, who.map((id) => ordered.get(id)!), seed), who);
    }
  }
}
