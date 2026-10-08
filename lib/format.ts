/** Today's date on this device as YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const utc = (ymd: string) => new Date(ymd + "T00:00:00Z");
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" });
const dayFmt = fmt({ weekday: "short", day: "numeric", month: "short" });
const shortFmt = fmt({ day: "numeric", month: "short" });

/** "2026-10-15" -> "Thu, 15 Oct" */
export const formatDay = (ymd: string) => dayFmt.format(utc(ymd));
/** "2026-10-15" -> "15 Oct" */
export const formatShort = (ymd: string) => shortFmt.format(utc(ymd));

export function formatRange(start: string | null, end: string | null): string {
  if (start && end) return start === end ? formatDay(start) : `${formatShort(start)} to ${formatShort(end)}`;
  if (start) return `From ${formatShort(start)}`;
  return "";
}

export function dayNumber(start: string | null, ymd: string): number | null {
  if (!start) return null;
  return Math.round((utc(ymd).getTime() - utc(start).getTime()) / 86400000) + 1;
}

export function timeAgo(isoString: string): string {
  const s = Math.max(0, (Date.now() - new Date(isoString).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(isoString));
}
