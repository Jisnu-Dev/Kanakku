import { describe, expect, it } from "vitest";
import { concerns, doneFor, progressFor, unclaimed } from "./checklist";
import type { ChecklistItem } from "./types";

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({ id: Math.random().toString(36), label: "x", mode: "each", assigneeId: null, doneBy: [], createdBy: null, createdAt: "", ...over });

describe("checklist", () => {
  const items = [
    item({ label: "ID card", doneBy: ["a"] }),
    item({ label: "Towel" }),
    item({ label: "Speaker", mode: "shared", assigneeId: "b" }),
    item({ label: "Sunscreen", mode: "shared", assigneeId: "a", doneBy: ["c"] }), // ticked by someone else still counts
    item({ label: "Snacks", mode: "shared" }),
  ];
  it("each-person items are done per person", () => {
    expect(doneFor(items[0], "a")).toBe(true);
    expect(doneFor(items[0], "b")).toBe(false);
    expect(doneFor(items[0], null)).toBe(false);
  });
  it("shared items are done for everyone once anyone ticks them", () => {
    expect(doneFor(items[3], "a")).toBe(true);
    expect(doneFor(items[3], "b")).toBe(true);
    expect(doneFor(items[2], "b")).toBe(false);
  });
  it("counts only what concerns the person", () => {
    expect(concerns(items[2], "a")).toBe(false);
    expect(concerns(items[2], "b")).toBe(true);
    const a = progressFor(items, "a"); // ID (done), Towel, Sunscreen (done)
    expect([a.total, a.done, a.left.map((i) => i.label)]).toEqual([3, 2, ["Towel"]]);
    const b = progressFor(items, "b"); // ID, Towel, Speaker
    expect([b.total, b.done]).toEqual([3, 0]);
    expect(progressFor(items, null).total).toBe(0);
  });
  it("finds shared items nobody has taken", () => {
    expect(unclaimed(items).map((i) => i.label)).toEqual(["Snacks"]);
  });
});
