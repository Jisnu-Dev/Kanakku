// All money is integer paise. Never floats.

export type SplitMode = "equal" | "exact" | "percent" | "shares" | "itemized";
export type PaymentMode = "upi" | "cash" | "card" | "other";

export interface Participant {
  id: string;
  name: string;
  color: number; // index into the thread palette
  active: boolean;
  createdAt: string;
}

export interface Item {
  name: string;
  amount: number; // paise
  participantIds: string[];
}

/** The raw input a split was built from, kept so an expense can be re-edited. */
export interface SplitInput {
  mode: SplitMode;
  participantIds: string[]; // who is in the split (equal / exact / percent / shares)
  exact?: Record<string, number>; // paise
  percent?: Record<string, number>; // 0-100, up to 2 decimals
  shares?: Record<string, number>; // any positive number
  items?: Item[]; // itemized: anything above the item total is tax/tip, spread in proportion
}

export interface Line {
  participantId: string;
  amount: number; // paise
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  spentOn: string; // YYYY-MM-DD
  paymentMode: PaymentMode;
  fromKitty: boolean;
  split: SplitInput;
  payers: Line[]; // empty when paid from the kitty
  splits: Line[];
  note: string;
  receiptId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Settlement {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  mode: PaymentMode;
  note: string;
  paidOn: string;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface KittyContribution {
  id: string;
  participantId: string;
  amount: number;
  mode: PaymentMode;
  note: string;
  paidOn: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ActivityEntry {
  id: number;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: string[]; // human-readable "Amount: ₹400 → ₹450"
  createdAt: string;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  budgetTotal: number | null;
  kittyHolderId: string | null;
  createdAt: string;
}

export interface TripState {
  trip: Trip;
  participants: Participant[];
  expenses: Expense[]; // includes deleted ones (deletedAt set) so they can be restored
  settlements: Settlement[];
  kitty: KittyContribution[];
  budgets: Record<string, number>; // category -> paise
  activity: ActivityEntry[];
}
