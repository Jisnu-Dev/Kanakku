/**
 * Reads the useful fields out of a bus ticket's text (written against redBus e-tickets,
 * but every field is optional, so an unfamiliar ticket just comes back mostly empty).
 * Pure text matching: no network, no AI.
 */
export interface ParsedTicket {
  kind: "bus" | "entry" | null; // null when the text doesn't say
  title: string; // place or event, for entry passes
  fromPlace: string;
  toPlace: string;
  departsOn: string | null; // YYYY-MM-DD
  departsAt: string | null; // HH:MM, 24-hour
  reference: string; // ticket number / PNR
  passengers: { name: string; seat: string }[];
}

/** PDF text often repeats bold words ("Sai Karthi Sai Karthi"); keep one copy. */
function unrepeat(s: string): string {
  const words = s.trim().split(/\s+/);
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    if (words.slice(0, half).join(" ").toLowerCase() === words.slice(half).join(" ").toLowerCase()) return words.slice(0, half).join(" ");
  }
  return words.join(" ");
}

export function parseTicketText(raw: string): ParsedTicket {
  const text = raw.replace(/\s+/g, " ");
  const out: ParsedTicket = { kind: null, title: "", fromPlace: "", toPlace: "", departsOn: null, departsAt: null, reference: "", passengers: [] };

  const route = /\b([A-Z][A-Za-z]{2,}(?: [A-Z][A-Za-z]+)?)\s?-\s?([A-Z][A-Za-z]{2,}(?: [A-Z][A-Za-z]+)?)(?=\s+(?:\1\s?-\s?\2\s+)?on\b)/.exec(text);
  if (route) {
    out.fromPlace = route[1].replace(/^(?:Ticket |Information )+/, "");
    out.toPlace = route[2];
  }

  const stamp = /(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})\s*([AP]M)/i;
  const journey = stamp.exec(text.slice(Math.max(0, text.search(/Journey Date and Time/i)))) ?? stamp.exec(text);
  if (journey) {
    const [, d, m, y, h, min, ap] = journey;
    const hour = (Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0);
    out.departsOn = `${y}-${m}-${d}`;
    out.departsAt = `${String(hour).padStart(2, "0")}:${min}`;
  }

  const ticketNo = /Ticket Number:?\s*([A-Z0-9]{6,})/i.exec(text)?.[1];
  const pnr = /PNR No:?\s*([A-Z0-9]{6,})/i.exec(text)?.[1];
  out.reference = [ticketNo, pnr && `PNR ${pnr}`].filter(Boolean).join(", ");

  // "arunika 19Yrs, FEMALE U5": keep the name and seat, and deliberately drop age and gender.
  const seen = new Set<string>();
  const re = /([A-Za-z][A-Za-z .']*?)\s+\d{1,3}\s?Yrs,?\s*(?:MALE|FEMALE|OTHER)\s+([A-Z]{0,2}\d{1,3}[A-Z]{0,2})\b/g;
  for (let m; (m = re.exec(text)); ) {
    const name = unrepeat(m[1].replace(/^.*\bSeat no\.?\s*/i, ""));
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.passengers.push({ name, seat: m[2] });
  }
  if (route && (out.passengers.length || /\b(bus|redbus|boarding point)\b/i.test(text))) out.kind = "bus";

  // Amusement park and event passes: no route, so look for the venue and the visit date instead.
  if (!out.kind) {
    const VENUES = ["Wonderla", "Black Thunder", "VGP", "MGM Dizzee World", "Queens Land", "Kishkinta", "Imagicaa", "EsselWorld"];
    const venue = VENUES.find((v) => new RegExp(`\\b${v.replace(" ", " ?")}\\b`, "i").test(text));
    if (venue || /\b(entry ticket|admit one|park ticket|visit date|date of visit)\b/i.test(text)) {
      out.kind = "entry";
      out.title = venue ?? "";
      // Only trust a date that is labelled as the visit date; a bare date is often the booking date.
      const near = /(?:visit(?:ing)? date|date of visit|valid (?:on|for)|event date)\W{0,12}([^|]{6,24})/i.exec(text)?.[1];
      out.departsOn = (near && looseDate(near)) || null;
      out.departsAt = null;
      if (!out.reference) out.reference = /(?:Booking|Order|Transaction|Ticket)\s*(?:ID|No\.?|Number)\s*[:#-]?\s*([A-Z0-9-]{5,})/i.exec(text)?.[1] ?? "";
    }
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ymd = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);

/** "17/10/2026", "17-10-2026", "17 Oct 2026", "17th October, 2026", "October 17, 2026" -> "2026-10-17" */
export function looseDate(s: string): string | null {
  let m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = /(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3})[a-z]*,?[ -](\d{4})/.exec(s);
  if (m && MONTHS.includes(m[2].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = /([A-Za-z]{3})[a-z]* (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/.exec(s);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** True when the two words differ by a single inserted, removed or changed letter. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.length === long.length ? short.slice(i + 1) === long.slice(i + 1) : short.slice(i) === long.slice(i + 1);
}

/** Match names from a ticket (or its file name) to people on the trip. Returns the matched ids. */
export function matchPeople(names: string[], people: { id: string; name: string }[]): string[] {
  const ids = new Set<string>();
  for (const raw of names) {
    const n = norm(raw);
    if (n.length < 2) continue;
    const first = n.split(" ")[0];
    // Same first name, or one letter apart at the end ("Jai" / "Jaii"). Anything looser confuses
    // different people who share a start, like Arun and Arunika.
    const close = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && Math.abs(a.length - b.length) === 1 && (a.startsWith(b) || b.startsWith(a)));
    const firstOf = (p: { name: string }) => norm(p.name).split(" ")[0];
    const hit =
      people.find((p) => norm(p.name) === n) ??
      people.find((p) => firstOf(p) === first) ??
      people.find((p) => close(firstOf(p), first)) ??
      // Longer names may differ by one typo: "akilesh" on the ticket, "Akhilesh" on the trip.
      people.find((p) => Math.min(firstOf(p).length, first.length) >= 6 && oneEditApart(firstOf(p), first));
    if (hit) ids.add(hit.id);
  }
  return [...ids];
}

/** "arunika-alex-jisnu-TVB326227448.pdf" -> ["arunika", "alex", "jisnu"] */
export function namesFromFilename(filename: string): string[] {
  return filename.replace(/\.[a-z0-9]+$/i, "").split(/[-_,&+ ]+/).filter((t) => /^[A-Za-z]{2,}$/.test(t) && !/^(ticket|bus|tickets|copy|final)$/i.test(t));
}
