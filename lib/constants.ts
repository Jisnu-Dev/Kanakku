import type { PaymentMode, SplitMode } from "./types";

export const CATEGORIES = [
  { id: "food", label: "Food", glyph: "🍛" },
  { id: "snacks", label: "Coffee & snacks", glyph: "☕" },
  { id: "local", label: "Autos & cabs", glyph: "🛺" },
  { id: "travel", label: "Train & bus", glyph: "🚆" },
  { id: "stay", label: "Stay", glyph: "🏨" },
  { id: "tickets", label: "Tickets & entry", glyph: "🎟️" },
  { id: "shopping", label: "Shopping", glyph: "🛍️" },
  { id: "other", label: "Other", glyph: "🧾" },
] as const;

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as string[];
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export const PAYMENT_MODES: { id: PaymentMode; label: string }[] = [
  { id: "upi", label: "UPI" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "other", label: "Other" },
];
export const modeLabel = (id: string) => PAYMENT_MODES.find((m) => m.id === id)?.label ?? id;

export const SPLIT_MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: "equal", label: "Equally", hint: "Everyone ticked pays the same" },
  { id: "exact", label: "Amounts", hint: "Type what each person owes" },
  { id: "percent", label: "Percent", hint: "Must add up to 100" },
  { id: "shares", label: "Shares", hint: "2 shares pays twice as much as 1" },
  { id: "itemized", label: "By item", hint: "Tax and tip are spread in proportion" },
];
export const splitLabel = (id: string) => SPLIT_MODES.find((m) => m.id === id)?.label ?? id;

/** Thread colours, one per person. `ink` is the text colour that reads on top of it. */
export const THREADS = [
  { bg: "#2B3A9B", ink: "#FFFFFF" }, // indigo
  { bg: "#EDAE00", ink: "#1A1F4B" }, // turmeric
  { bg: "#D2304A", ink: "#FFFFFF" }, // kumkum
  { bg: "#178A5F", ink: "#FFFFFF" }, // leaf
  { bg: "#EE7A1B", ink: "#1A1F4B" }, // marigold
  { bg: "#2F8FD8", ink: "#FFFFFF" }, // sea
  { bg: "#7A3FA8", ink: "#FFFFFF" }, // jamun
  { bg: "#E05C9B", ink: "#FFFFFF" }, // lotus
  { bg: "#0F8C8C", ink: "#FFFFFF" }, // peacock
  { bg: "#8A5A2B", ink: "#FFFFFF" }, // filter coffee
];
export const thread = (i: number) => THREADS[((i % THREADS.length) + THREADS.length) % THREADS.length];
