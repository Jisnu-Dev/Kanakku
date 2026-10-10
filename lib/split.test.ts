import { describe, expect, it } from "vitest";
import { allocate, computeSplit, SplitError } from "./split";
import { computeBalances, explainBalance, simplifyDebts } from "./balances";
import { toPaise, formatMoney } from "./money";
import type { Expense, TripState } from "./types";

const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);
const by = (xs: { participantId: string; amount: number }[]) => Object.fromEntries(xs.map((x) => [x.participantId, x.amount]));

describe("allocate", () => {
  it("always adds up to the total", () => {
    for (let total = 1; total < 400; total += 7)
      for (let n = 1; n <= 7; n++)
        for (let seed = 0; seed < 3; seed++) {
          const parts = allocate(total, Array(n).fill(1), seed);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        }
  });
  it("rotates the leftover paisa with the seed", () => {
    expect(allocate(10000, [1, 1, 1], 0)).toEqual([3334, 3333, 3333]);
    expect(allocate(10000, [1, 1, 1], 1)).toEqual([3333, 3334, 3333]);
    expect(allocate(10000, [1, 1, 1], 2)).toEqual([3333, 3333, 3334]);
  });
  it("gives nothing to a zero weight", () => {
    expect(allocate(100, [0, 1, 1], 0)).toEqual([0, 50, 50]);
    expect(allocate(101, [0, 1, 1], 0)[0]).toBe(0);
  });
});

describe("computeSplit", () => {
  const ids = ["a", "b", "c"];
  it("equal", () => {
    const s = computeSplit(10000, { mode: "equal", participantIds: ids });
    expect(sum(s)).toBe(10000);
  });
  it("exact must match the total", () => {
    expect(by(computeSplit(1000, { mode: "exact", participantIds: ids, exact: { a: 500, b: 300, c: 200 } }))).toEqual({ a: 500, b: 300, c: 200 });
    expect(() => computeSplit(1000, { mode: "exact", participantIds: ids, exact: { a: 500, b: 300 } })).toThrow(SplitError);
  });
  it("percent", () => {
    expect(by(computeSplit(99900, { mode: "percent", participantIds: ids, percent: { a: 50, b: 25, c: 25 } }))).toEqual({ a: 49950, b: 24975, c: 24975 });
    expect(() => computeSplit(1000, { mode: "percent", participantIds: ids, percent: { a: 50, b: 25 } })).toThrow("100");
    const thirds = computeSplit(1000, { mode: "percent", participantIds: ids, percent: { a: 33.33, b: 33.33, c: 33.34 } });
    expect(sum(thirds)).toBe(1000);
  });
  it("shares: one person counts as two", () => {
    expect(by(computeSplit(120000, { mode: "shares", participantIds: ids, shares: { a: 2, b: 1, c: 1 } }))).toEqual({ a: 60000, b: 30000, c: 30000 });
    // zero share drops out
    expect(by(computeSplit(100, { mode: "shares", participantIds: ids, shares: { a: 1, b: 0, c: 1 } }))).toEqual({ a: 50, c: 50 });
  });
  it("itemized spreads tax and tip in proportion", () => {
    // a: biryani 300, b: dosa 100, shared starter 200 (a,b,c). Items 600, bill 660 (10% tax).
    const s = by(
      computeSplit(66000, {
        mode: "itemized",
        participantIds: [],
        items: [
          { name: "Biryani", amount: 30000, participantIds: ["a"] },
          { name: "Dosa", amount: 10000, participantIds: ["b"] },
          { name: "Starter", amount: 20000, participantIds: ["a", "b", "c"] },
        ],
      }),
    );
    expect(s.a + s.b + s.c).toBe(66000);
    expect(s.a).toBeGreaterThan(40000); // 366.67 * 1.1
    expect(Math.abs(s.a - 40333)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.b - 18333)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.c - 7333)).toBeLessThanOrEqual(1);
  });
  it("itemized rejects items above the total", () => {
    expect(() => computeSplit(100, { mode: "itemized", participantIds: [], items: [{ name: "x", amount: 200, participantIds: ["a"] }] })).toThrow("more than");
  });
});

function exp(partial: Partial<Expense> & Pick<Expense, "amount" | "payers" | "splits">): Expense {
  return {
    id: Math.random().toString(36), title: "x", category: "food", spentOn: "2026-10-15", paymentMode: "upi", fromKitty: false,
    split: { mode: "equal", participantIds: [] }, note: "", receiptId: null, createdBy: null, createdAt: "", updatedAt: "", deletedAt: null, ...partial,
  };
}
function state(over: Partial<TripState>): TripState {
  return {
    trip: { id: "t", name: "T", startDate: null, endDate: null, budgetTotal: null, kittyHolderId: null, createdAt: "" },
    participants: ["a", "b", "c"].map((id, i) => ({ id, name: id, color: i, active: true, createdAt: "" })),
    expenses: [], settlements: [], kitty: [], budgets: {}, activity: [], ...over,
  };
}
const nets = (s: TripState) => Object.fromEntries(computeBalances(s).map((b) => [b.participantId, b.net]));

describe("balances", () => {
  it("one payer, equal split", () => {
    const s = state({ expenses: [exp({ amount: 900, payers: [{ participantId: "a", amount: 900 }], splits: ["a", "b", "c"].map((p) => ({ participantId: p, amount: 300 })) })] });
    expect(nets(s)).toEqual({ a: 600, b: -300, c: -300 });
    expect(simplifyDebts(computeBalances(s))).toHaveLength(2);
  });
  it("two payers on one bill", () => {
    const s = state({ expenses: [exp({ amount: 900, payers: [{ participantId: "a", amount: 500 }, { participantId: "b", amount: 400 }], splits: ["a", "b", "c"].map((p) => ({ participantId: p, amount: 300 })) })] });
    expect(nets(s)).toEqual({ a: 200, b: 100, c: -300 });
  });
  it("settlements move balances and deleted rows are ignored", () => {
    const s = state({
      expenses: [
        exp({ amount: 900, payers: [{ participantId: "a", amount: 900 }], splits: ["a", "b", "c"].map((p) => ({ participantId: p, amount: 300 })) }),
        exp({ amount: 5000, deletedAt: "x", payers: [{ participantId: "b", amount: 5000 }], splits: [{ participantId: "a", amount: 5000 }] }),
      ],
      settlements: [{ id: "s", fromId: "b", toId: "a", amount: 300, mode: "upi", note: "", paidOn: "", createdBy: null, createdAt: "", deletedAt: null }],
    });
    expect(nets(s)).toEqual({ a: 300, b: 0, c: -300 });
    expect(simplifyDebts(computeBalances(s))).toEqual([{ fromId: "c", toId: "a", amount: 300 }]);
  });
  it("kitty: holder owes back what is left", () => {
    const k = (p: string) => ({ id: p, participantId: p, amount: 200000, mode: "upi" as const, note: "", paidOn: "", createdAt: "", deletedAt: null });
    const s = state({
      trip: { id: "t", name: "T", startDate: null, endDate: null, budgetTotal: null, kittyHolderId: "a", createdAt: "" },
      kitty: [k("a"), k("b"), k("c")],
      expenses: [exp({ amount: 450000, fromKitty: true, payers: [], splits: ["a", "b", "c"].map((p) => ({ participantId: p, amount: 150000 })) })],
    });
    expect(nets(s)).toEqual({ a: -100000, b: 50000, c: 50000 });
    const total = Object.values(nets(s)).reduce((x, y) => x + y, 0);
    expect(total).toBe(0);
  });
  it("simplifies a chain into fewer payments", () => {
    // a owes b 100, b owes c 100 -> a pays c 100
    const t = simplifyDebts([{ participantId: "a", net: -100 }, { participantId: "b", net: 0 }, { participantId: "c", net: 100 }]);
    expect(t).toEqual([{ fromId: "a", toId: "c", amount: 100 }]);
    const many = simplifyDebts([
      { participantId: "a", net: -700 }, { participantId: "b", net: -300 }, { participantId: "c", net: 300 }, { participantId: "d", net: 450 }, { participantId: "e", net: 250 },
    ]);
    expect(many.length).toBeLessThanOrEqual(4);
    expect(many.reduce((x, m) => x + m.amount, 0)).toBe(1000);
  });
});

describe("explainBalance", () => {
  it("lines add up to each person's net, including kitty and payments", () => {
    const k = (p: string) => ({ id: "k" + p, participantId: p, amount: 200000, mode: "upi" as const, note: "", paidOn: "2026-10-15", createdAt: "", deletedAt: null });
    const s = state({
      trip: { id: "t", name: "T", startDate: null, endDate: null, budgetTotal: null, kittyHolderId: "a", createdAt: "" },
      kitty: [k("a"), k("b"), k("c")],
      expenses: [
        exp({ amount: 450000, fromKitty: true, payers: [], splits: ["a", "b", "c"].map((p) => ({ participantId: p, amount: 150000 })) }),
        exp({ amount: 900, payers: [{ participantId: "a", amount: 500 }, { participantId: "b", amount: 400 }], splits: [{ participantId: "b", amount: 450 }, { participantId: "c", amount: 450 }] }),
        exp({ amount: 7000, deletedAt: "x", payers: [{ participantId: "c", amount: 7000 }], splits: [{ participantId: "a", amount: 7000 }] }),
      ],
      settlements: [{ id: "s", fromId: "c", toId: "a", amount: 300, mode: "upi", note: "", paidOn: "2026-10-16", createdBy: null, createdAt: "", deletedAt: null }],
    });
    for (const b of computeBalances(s)) {
      const lines = explainBalance(s, b.participantId, (id) => id, String);
      expect(lines.reduce((x, l) => x + l.effect, 0)).toBe(b.net);
    }
    const a = explainBalance(s, "a", (id) => id, String);
    expect(a.find((l) => l.kind === "kittyHeld")?.effect).toBe(-150000);
    expect(a.some((l) => l.detail.includes("not part of the split"))).toBe(true);
    expect(explainBalance(s, "c", (id) => id, String).some((l) => l.detail === "Share 450, paid by a and b")).toBe(true);
  });
});

describe("money", () => {
  it("parses and formats", () => {
    expect(toPaise("1,250.5")).toBe(125050);
    expect(toPaise("₹ 80")).toBe(8000);
    expect(toPaise("0.07")).toBe(7);
    expect(toPaise("12.345")).toBeNull();
    expect(toPaise("abc")).toBeNull();
    expect(formatMoney(12505000)).toBe("₹1,25,050");
    expect(formatMoney(-150)).toBe("−₹1.50");
  });
});
