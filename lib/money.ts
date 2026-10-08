/** Parse what a person types ("1,250.50", "₹ 80") into paise. Returns null if it isn't a number. */
export function toPaise(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 125050 -> "₹1,250.50"; whole rupees drop the decimals. */
export function formatMoney(paise: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(paise);
  const body = abs % 100 === 0 ? inr.format(abs / 100) : inr2.format(abs / 100);
  const sign = paise < 0 ? "−" : opts.sign && paise > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** 125050 -> "1250.50", for putting back into an input. */
export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
