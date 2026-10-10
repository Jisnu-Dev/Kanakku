"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { thread } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import type { Participant } from "@/lib/types";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ---------- icons ----------

const paths: Record<string, ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  list: <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />,
  scale: <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" />,
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  people: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  copy: <path d="M9 9h10v11H9zM5 15V4h10" />,
  share: <path d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />,
  download: <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />,
  camera: <path d="M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  undo: <path d="M9 7 4 12l5 5M4 12h10a5 5 0 0 1 0 10h-2" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  ticket: <path d="M4 7h16v3.5a1.5 1.5 0 0 0 0 3V17H4v-3.5a1.5 1.5 0 0 0 0-3zM14.5 7v2M14.5 11v2M14.5 15v2" />,
  eye: <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  print: <path d="M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z" />,
};

export function Icon({ name, size = 20, className }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {paths[name]}
    </svg>
  );
}

// ---------- people ----------

export function Avatar({ person, size = 36, dim }: { person?: Pick<Participant, "name" | "color"> | null; size?: number; dim?: boolean }) {
  const t = thread(person?.color ?? 0);
  return (
    <span
      aria-hidden
      className="display inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: person ? t.bg : "var(--sunk)", color: person ? t.ink : "var(--muted)", fontSize: size * 0.42, opacity: dim ? 0.45 : 1, boxShadow: "0 0 0 1.5px var(--surface)" }}
    >
      {person ? person.name.trim().charAt(0).toUpperCase() : "?"}
    </span>
  );
}

/** The kitty gets its own mark so it never reads as a person. */
export function KittyMark({ size = 36 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-turmeric text-[#1a1f4b]" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      🫙
    </span>
  );
}

/**
 * Madras check: the plaid cloth Chennai gave its old name to. Each person on the trip
 * is one thread colour, so the pattern changes as people join.
 */
export function madras(colors: number[], scale = 1): CSSProperties {
  const widths = [10, 4, 16, 6, 12, 3];
  const list = colors.length ? colors : [1, 2, 3];
  const bands = (dir: string, alpha: string, shift: number) => {
    let at = 0;
    const stops: string[] = [];
    list.forEach((c, i) => {
      const gap = (i % 2 ? 18 : 12) * scale;
      const w = widths[(i + shift) % widths.length] * scale;
      const col = thread(c).bg + alpha;
      stops.push(`transparent ${at}px ${at + gap}px`, `${col} ${at + gap}px ${at + gap + w}px`);
      at += gap + w;
    });
    stops.push(`transparent ${at}px ${at + 8 * scale}px`);
    return `repeating-linear-gradient(${dir}, ${stops.join(", ")})`;
  };
  return { backgroundColor: "#1a2166", backgroundImage: `${bands("90deg", "d9", 0)}, ${bands("0deg", "a6", 2)}` };
}

// ---------- money ----------

export function Money({ paise, signed, className }: { paise: number; signed?: boolean; className?: string }) {
  const tone = signed ? (paise > 0 ? "text-plus" : paise < 0 ? "text-minus" : "text-muted") : "";
  return <span className={cx("num whitespace-nowrap", tone, className)}>{formatMoney(signed ? Math.abs(paise) : paise)}</span>;
}

/** "gets back ₹500" / "owes ₹500" / "settled" — never colour alone. */
export function NetLabel({ net, you }: { net: number; you?: boolean }) {
  if (net === 0) return <span className="text-muted">{you ? "You're settled" : "settled"}</span>;
  const verb = net > 0 ? (you ? "You get back" : "gets back") : you ? "You owe" : "owes";
  return (
    <span className={net > 0 ? "text-plus" : "text-minus"}>
      {verb} <span className="num font-semibold">{formatMoney(Math.abs(net))}</span>
    </span>
  );
}

// ---------- controls ----------

export function Button({
  children, variant = "primary", size = "md", className, ...rest
}: { variant?: "primary" | "quiet" | "ghost" | "danger"; size?: "sm" | "md" | "lg" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "bg-indigo text-on-indigo active:brightness-90",
    quiet: "bg-sunk text-ink active:brightness-95",
    ghost: "text-indigo dark:text-ink underline-offset-4 hover:underline",
    danger: "bg-minus-wash text-minus",
  };
  const sizes = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-13 px-6 text-base" };
  return (
    <button
      type="button"
      {...rest}
      className={cx("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-45 disabled:pointer-events-none", variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}

export function Chip({ on, children, onClick, className }: { on: boolean; children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition",
        on ? "border-indigo bg-indigo text-on-indigo" : "border-line bg-surface text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-sunk p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx("h-9 flex-1 rounded-full px-2 text-sm font-semibold transition", value === o.id ? "bg-surface text-ink shadow-[0_1px_3px_rgb(23_28_79/0.18)]" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none transition focus:border-indigo focus:ring-2 focus:ring-indigo/20";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

/** Rupee input. Keeps the raw text so a half-typed "12." isn't rewritten under the cursor. */
export function MoneyInput({ value, onChange, placeholder = "0", className, autoFocus, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; ariaLabel?: string }) {
  return (
    <span className={cx("num relative block", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">₹</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, "");
          if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) onChange(v);
        }}
        className={cx(inputClass, "pl-8")}
      />
    </span>
  );
}

// ---------- layout ----------

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="display text-xl font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunk">
          <Icon name="x" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      {footer && <footer className="safe-bottom shrink-0 border-t border-line bg-surface px-5 pt-3">{footer}</footer>}
    </dialog>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-8", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="display text-[19px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A plain white panel. Rows inside are separated by hairlines rather than boxed individually. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("divide-y divide-line overflow-hidden rounded-2xl bg-surface", className)}>{children}</div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-7 text-center text-[15px] text-muted">
      <p className="mx-auto max-w-[32ch]">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Meter({ value, max, tone = "indigo", label }: { value: number; max: number; tone?: "indigo" | "minus" | "turmeric"; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { indigo: "var(--indigo)", minus: "var(--minus)", turmeric: "var(--turmeric)" }[tone];
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className="h-2 overflow-hidden rounded-full bg-sunk">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, minWidth: value > 0 ? 4 : 0 }} />
    </div>
  );
}
