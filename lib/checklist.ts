import type { ChecklistItem } from "./types";

/** Starter ideas people can add with one tap. `mode` is how the item is usually handled. */
export const CHECKLIST_IDEAS: { label: string; mode: "each" | "shared" }[] = [
  { label: "ID card", mode: "each" },
  { label: "Phone charger", mode: "each" },
  { label: "Change of clothes", mode: "each" },
  { label: "Swimwear", mode: "each" },
  { label: "Towel", mode: "each" },
  { label: "Cash", mode: "each" },
  { label: "Medicines", mode: "each" },
  { label: "Water bottle", mode: "each" },
  { label: "Power bank", mode: "shared" },
  { label: "Sunscreen", mode: "shared" },
  { label: "Snacks for the bus", mode: "shared" },
  { label: "Speaker", mode: "shared" },
  { label: "First aid kit", mode: "shared" },
];

/** Is this item finished from one person's point of view? */
export function doneFor(item: ChecklistItem, personId: string | null): boolean {
  if (item.mode === "shared") return item.doneBy.length > 0;
  return !!personId && item.doneBy.includes(personId);
}

/** Does this item need this person to do something? Shared items count only for whoever is bringing them. */
export function concerns(item: ChecklistItem, personId: string | null): boolean {
  if (!personId) return false;
  return item.mode === "each" || item.assigneeId === personId;
}

/** What one person still has to pack, and how far along they are. */
export function progressFor(items: ChecklistItem[], personId: string | null): { total: number; done: number; left: ChecklistItem[] } {
  const mine = items.filter((i) => concerns(i, personId));
  const left = mine.filter((i) => !doneFor(i, personId));
  return { total: mine.length, done: mine.length - left.length, left };
}

/** Shared items nobody has agreed to bring yet. */
export const unclaimed = (items: ChecklistItem[]) => items.filter((i) => i.mode === "shared" && !i.assigneeId && i.doneBy.length === 0);
