"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/lib/client";
import { formatDay } from "@/lib/format";
import { pdfText, renderPdf } from "@/lib/pdf";
import { matchPeople, namesFromFilename, parseTicketText } from "@/lib/ticketParse";
import type { Ticket } from "@/lib/types";
import { useApp } from "./TripApp";
import { Avatar, Button, Chip, cx, Empty, Field, Icon, inputClass, Sheet } from "./ui";

const MAX_BYTES = 3 * 1024 * 1024;

interface Fields {
  fromPlace: string;
  toPlace: string;
  departsOn: string;
  departsAt: string;
  operator: string;
  reference: string;
  passengerIds: string[];
  passengersText: string;
  note: string;
}
interface Draft extends Fields {
  key: number;
  filename: string;
  file: string; // data URL
  autofilled: boolean;
}

const fileUrl = (trip: string, id: string, download = false) => `/api/trips/${trip}/ticket/${id}${download ? "?download=1" : ""}`;

/** "22:30" -> "10:30 pm" */
function clock(hhmm: string | null): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
const kb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const seatCount = (t: Pick<Ticket, "passengersText" | "passengerIds">) => Math.max(t.passengersText ? t.passengersText.split(",").filter((x) => x.trim()).length : 0, t.passengerIds.length);

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export function Tickets() {
  const { state, me, toast } = useApp();
  const [mineOnly, setMineOnly] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tickets = state.tickets;
  const people = state.participants;

  /** Turn picked files into drafts, pre-filling whatever the ticket's own text tells us. */
  async function pick(list: FileList | null) {
    const files = [...(list ?? [])];
    if (input.current) input.current.value = "";
    if (!files.length) return;
    setReading(true);
    const out: Draft[] = [];
    const skipped: string[] = [];
    for (const [i, f] of files.entries()) {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isImage = /^image\/(jpeg|png|webp)$/.test(f.type);
      if (!isPdf && !isImage) {
        skipped.push(`${f.name} isn't a PDF or photo`);
        continue;
      }
      try {
        let file: string;
        if (isImage && f.size > 1_200_000) file = await compressImage(f, 2200, 0.85);
        else if (f.size > MAX_BYTES) {
          skipped.push(`${f.name} is over 3 MB`);
          continue;
        } else file = await readAsDataUrl(isPdf && f.type !== "application/pdf" ? f.slice(0, f.size, "application/pdf") : f);

        const draft: Draft = { key: Date.now() + i, filename: f.name, file, autofilled: false, fromPlace: "", toPlace: "", departsOn: "", departsAt: "", operator: "", reference: "", passengerIds: [], passengersText: "", note: "" };
        let names = namesFromFilename(f.name);
        if (isPdf) {
          try {
            const parsed = parseTicketText(await pdfText(new Uint8Array(await f.arrayBuffer())));
            draft.fromPlace = parsed.fromPlace;
            draft.toPlace = parsed.toPlace;
            draft.departsOn = parsed.departsOn ?? "";
            draft.departsAt = parsed.departsAt ?? "";
            draft.reference = parsed.reference;
            draft.passengersText = parsed.passengers.map((p) => `${p.name} ${p.seat}`).join(", ");
            if (parsed.passengers.length) names = parsed.passengers.map((p) => p.name);
            draft.autofilled = !!(parsed.fromPlace || parsed.departsOn || parsed.passengers.length);
          } catch {
            // Unreadable text just means the form starts empty.
          }
        }
        draft.passengerIds = matchPeople(names, people);
        out.push(draft);
      } catch {
        skipped.push(`${f.name} couldn't be read`);
      }
    }
    setReading(false);
    if (skipped.length) toast(skipped.join(". "), "error");
    if (out.length) setDrafts(out);
  }

  const shown = mineOnly ? tickets.filter((t) => me && t.passengerIds.includes(me)) : tickets;
  const journeys = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of shown) {
      const key = `${t.fromPlace.toLowerCase()}|${t.toPlace.toLowerCase()}|${t.departsOn ?? ""}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    // Within a journey, your own ticket comes first.
    for (const list of m.values()) list.sort((a, b) => Number(!!me && b.passengerIds.includes(me)) - Number(!!me && a.passengerIds.includes(me)));
    return [...m.values()];
  }, [shown, me]);
  const myCount = tickets.filter((t) => me && t.passengerIds.includes(me)).length;
  const addButton = (
    <Button onClick={() => input.current?.click()} disabled={reading}>
      <Icon name="plus" size={18} /> {reading ? "Reading…" : "Add tickets"}
    </Button>
  );

  return (
    <main className="px-4 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="display text-[32px] font-semibold leading-tight">Tickets</h1>
          <p className="mt-1 text-muted">
            {tickets.length === 0 ? "Bus, train and entry tickets, in one place." : `${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}${myCount ? `, ${myCount} with your name on` : ""}`}
          </p>
        </div>
        {tickets.length > 0 && <div className="shrink-0 pt-1">{addButton}</div>}
      </div>
      <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose ticket files" tabIndex={-1} onChange={(e) => pick(e.target.files)} />

      {tickets.length === 0 ? (
        <div className="mt-6">
          <Empty action={addButton}>Add the PDFs or photos of your tickets. Pick several at once; route, date and passengers are filled in from each PDF.</Empty>
        </div>
      ) : (
        <>
          {myCount > 0 && myCount < tickets.length && (
            <div className="mt-4 flex gap-2">
              <Chip on={!mineOnly} onClick={() => setMineOnly(false)}>Everyone's</Chip>
              <Chip on={mineOnly} onClick={() => setMineOnly(true)}>Mine</Chip>
            </div>
          )}
          {journeys.map((list) => {
            const t0 = list[0];
            return (
              <section key={t0.id} className="mt-7">
                <h2 className="display flex flex-wrap items-center gap-x-2 text-[21px] font-semibold leading-tight">
                  {t0.fromPlace && t0.toPlace ? (
                    <>
                      {t0.fromPlace} <Icon name="arrow" size={18} className="text-muted" /> <span className="sr-only">to</span> {t0.toPlace}
                    </>
                  ) : (
                    t0.fromPlace || t0.toPlace || "Other tickets"
                  )}
                </h2>
                {t0.departsOn && <p className="mt-0.5 text-muted">{formatDay(t0.departsOn)}</p>}
                <div className="mt-3 space-y-3">
                  {list.map((t) => <TicketCard key={t.id} t={t} onOpen={() => setViewing(t.id)} />)}
                </div>
              </section>
            );
          })}
        </>
      )}

      {viewing && !editing && <TicketViewer id={viewing} onClose={() => setViewing(null)} onEdit={(t) => setEditing(t)} />}
      {editing && <TicketForm mode="edit" ticket={editing} onClose={() => setEditing(null)} />}
      {drafts && <TicketForm mode="add" drafts={drafts} onClose={() => setDrafts(null)} />}
    </main>
  );
}

function TicketCard({ t, onOpen }: { t: Ticket; onOpen: () => void }) {
  const { state, me, person, nameOf } = useApp();
  const mine = !!me && t.passengerIds.includes(me);
  const seats = seatCount(t);
  const who = t.passengerIds.map((id) => (id === me ? "You" : nameOf(id)));
  return (
    <article className={cx("relative overflow-hidden rounded-2xl bg-surface", mine && "ring-2 ring-turmeric")}>
      <button type="button" onClick={onOpen} className="block w-full px-4 pb-3 pt-3.5 text-left active:bg-sunk">
        <span className="flex items-baseline justify-between gap-3">
          <span className="display text-xl font-semibold">{t.departsAt ? clock(t.departsAt) : seats > 1 ? "Group ticket" : "Ticket"}</span>
          <span className="text-sm font-medium text-muted">{seats > 1 ? `${seats} seats` : seats === 1 ? "1 seat" : ""}</span>
        </span>
        {t.operator && <span className="block text-[15px] text-muted">{t.operator}</span>}
        {t.passengerIds.length > 0 && (
          <span className="mt-2.5 flex items-center gap-2.5">
            <span className="flex shrink-0 -space-x-2">{t.passengerIds.slice(0, 6).map((id) => <Avatar key={id} person={person(id)} size={28} />)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{who.join(", ")}</span>
          </span>
        )}
        {t.passengersText && <span className="mt-1.5 block text-sm text-muted">{t.passengerIds.length ? "Seats: " : ""}{t.passengersText}</span>}
        {mine && <span className="mt-2 inline-block rounded-full bg-turmeric px-2.5 py-0.5 text-[13px] font-semibold text-[#1a1f4b]">You're on this ticket</span>}
      </button>
      {/* The tear line: stub below, like a paper ticket. */}
      <div aria-hidden className="relative mx-4 border-t-2 border-dashed border-line">
        <span className="absolute -left-[26px] -top-[10px] h-5 w-5 rounded-full bg-paper" />
        <span className="absolute -right-[26px] -top-[10px] h-5 w-5 rounded-full bg-paper" />
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="num min-w-0 flex-1 truncate text-sm text-muted">{t.reference || t.filename}</span>
        <Button size="sm" variant="quiet" onClick={onOpen}><Icon name="eye" size={16} /> View</Button>
        <a href={fileUrl(state.trip.id, t.id, true)} download={t.filename} aria-label={`Download ${t.filename}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-indigo px-3.5 text-sm font-semibold text-on-indigo">
          <Icon name="download" size={16} /> Download
        </a>
      </div>
    </article>
  );
}

/** Full ticket preview: PDFs are drawn page by page, photos are shown as they are. */
function TicketViewer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (t: Ticket) => void }) {
  const { state, act, busy, nameOf, me, toast } = useApp();
  const t = state.tickets.find((x) => x.id === id);
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const isPdf = t?.mime === "application/pdf";
  const url = t ? fileUrl(state.trip.id, t.id) : "";

  useEffect(() => {
    if (!isPdf || !host.current) return;
    setStatus("loading");
    return renderPdf(url, host.current, (r) => {
      if ("error" in r) return setStatus("error");
      setMore(r.pages - r.shown);
      setStatus("ready");
    });
  }, [url, isPdf]);

  if (!t) return null;
  const route = t.fromPlace && t.toPlace ? `${t.fromPlace} to ${t.toPlace}` : t.fromPlace || t.toPlace || "Ticket";
  const when = [t.departsOn && formatDay(t.departsOn), clock(t.departsAt)].filter(Boolean).join(", ");

  return (
    <Sheet
      open
      onClose={onClose}
      title={route}
      footer={
        confirming ? (
          <div className="flex gap-3">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" size="lg" className="flex-1" disabled={busy} onClick={async () => { if (await act("ticket.delete", { id })) { toast("Ticket deleted"); onClose(); } }}>Delete ticket</Button>
          </div>
        ) : (
          <div className="flex gap-2.5">
            <Button variant="quiet" size="lg" aria-label="Delete ticket" onClick={() => setConfirming(true)}><Icon name="trash" size={18} /></Button>
            <Button variant="quiet" size="lg" aria-label="Edit ticket details" onClick={() => onEdit(t)}><Icon name="edit" size={18} /></Button>
            <a href={fileUrl(state.trip.id, t.id, true)} download={t.filename} className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-indigo px-6 font-semibold text-on-indigo">
              <Icon name="download" size={18} /> Download
            </a>
          </div>
        )
      }
    >
      <div className="text-[15px]">
        {when && <p className="font-semibold">{when}</p>}
        {t.operator && <p className="text-muted">{t.operator}</p>}
        {t.passengerIds.length > 0 && <p className="mt-1.5">For {t.passengerIds.map((p) => (p === me ? "you" : nameOf(p))).join(", ")}</p>}
        {t.passengersText && <p className="text-muted">Seats: {t.passengersText}</p>}
        {t.reference && <p className="num text-muted">{t.reference}</p>}
        {t.note && <p className="mt-1.5 whitespace-pre-wrap">{t.note}</p>}
      </div>

      <div className="-mx-2 mt-4 rounded-2xl bg-sunk p-2">
        {isPdf ? (
          <>
            {status === "loading" && <p className="animate-pulse px-3 py-10 text-center text-muted" aria-live="polite">Opening the ticket…</p>}
            {status === "error" && (
              <p className="px-3 py-8 text-center text-[15px] text-muted">
                The preview couldn't be shown on this phone. <a className="font-semibold text-indigo underline dark:text-turmeric" href={url} target="_blank" rel="noreferrer">Open the PDF</a> or download it.
              </p>
            )}
            <div ref={host} className="space-y-2" />
            {status === "ready" && more > 0 && <p className="px-3 py-3 text-center text-sm text-muted">{more} more {more === 1 ? "page" : "pages"} in the full PDF.</p>}
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Ticket: ${route}`} className="w-full rounded-[10px]" />
        )}
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        <a className="font-semibold text-indigo underline-offset-4 hover:underline dark:text-turmeric" href={url} target="_blank" rel="noreferrer">Open in a new tab</a>
        <span className="mt-0.5 block">{t.filename}, {kb(t.size)}{t.uploadedBy ? `, added by ${nameOf(t.uploadedBy)}` : ""}</span>
      </p>
    </Sheet>
  );
}

/** Adds one or more tickets (one step per file) or edits the details of an existing one. */
function TicketForm(props: { mode: "add"; drafts: Draft[]; onClose: () => void } | { mode: "edit"; ticket: Ticket; onClose: () => void }) {
  const { state, me, act, busy, toast } = useApp();
  const adding = props.mode === "add";
  const total = adding ? props.drafts.length : 1;
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const source: Fields = adding ? props.drafts[index] : { ...props.ticket, departsOn: props.ticket.departsOn ?? "", departsAt: props.ticket.departsAt ?? "" };
  const [f, setF] = useState<Fields>(source);
  const draft = adding ? props.drafts[index] : null;
  const people = state.participants.filter((p) => p.active || f.passengerIds.includes(p.id));
  const set = (patch: Partial<Fields>) => setF((old) => ({ ...old, ...patch }));
  const all = people.length > 0 && people.every((p) => f.passengerIds.includes(p.id));

  function next(savedNow: number) {
    if (!adding || index + 1 >= total) {
      if (savedNow > 0) toast(adding ? (savedNow === 1 ? "Ticket added" : `${savedNow} tickets added`) : "Ticket updated");
      return props.onClose();
    }
    setF(props.drafts[index + 1]);
    setIndex(index + 1);
  }

  async function save() {
    const payload = {
      fromPlace: f.fromPlace.trim(), toPlace: f.toPlace.trim(), departsOn: f.departsOn || null, departsAt: f.departsAt || null,
      operator: f.operator.trim(), reference: f.reference.trim(), passengerIds: f.passengerIds, passengersText: f.passengersText.trim(), note: f.note.trim(),
    };
    const ok = adding ? await act("ticket.add", { ...payload, filename: draft!.filename, file: draft!.file }) : await act("ticket.update", { ...payload, id: props.ticket.id });
    if (!ok) return;
    setSaved(saved + 1);
    next(saved + 1);
  }

  const last = index + 1 >= total;
  return (
    <Sheet
      open
      onClose={props.onClose}
      title={adding ? (total > 1 ? `Ticket ${index + 1} of ${total}` : "Add ticket") : "Edit ticket"}
      footer={
        <div className="flex gap-3">
          {adding && total > 1 && <Button variant="quiet" size="lg" disabled={busy} onClick={() => next(saved)}>Skip</Button>}
          <Button size="lg" className="flex-1" disabled={busy} onClick={save}>{busy ? "Saving…" : adding ? (last ? "Save ticket" : "Save and next") : "Save changes"}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {draft && (
          <p className="rounded-2xl bg-sunk px-3.5 py-3 text-[15px]">
            <span className="block truncate font-semibold">{draft.filename}</span>
            <span className="text-muted">{draft.autofilled ? "Filled in from the ticket. Check it before saving." : "Couldn't read details from this file, so fill in what you know."}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><input value={f.fromPlace} maxLength={40} placeholder="Tirupur" onChange={(e) => set({ fromPlace: e.target.value })} className={inputClass} /></Field>
          <Field label="To"><input value={f.toPlace} maxLength={40} placeholder="Chennai" onChange={(e) => set({ toPlace: e.target.value })} className={inputClass} /></Field>
          <Field label="Date"><input type="date" value={f.departsOn} onChange={(e) => set({ departsOn: e.target.value })} className={inputClass} /></Field>
          <Field label="Departs at"><input type="time" value={f.departsAt} onChange={(e) => set({ departsAt: e.target.value })} className={inputClass} /></Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-muted">Who is this ticket for?</p>
            <button type="button" className="text-sm font-semibold text-indigo dark:text-turmeric" onClick={() => set({ passengerIds: all ? [] : people.map((p) => p.id) })}>{all ? "Clear" : "Everyone"}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = f.passengerIds.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ passengerIds: on ? f.passengerIds.filter((x) => x !== p.id) : [...f.passengerIds, p.id] })}
                  className={cx("flex h-10 items-center gap-2 rounded-full border py-0 pl-1 pr-3.5 font-medium", on ? "border-indigo bg-indigo text-on-indigo" : "border-line")}>
                  <Avatar person={p} size={30} /> {p.id === me ? "You" : p.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted">Pick one person for a single ticket, or everyone booked together on a group ticket.</p>
        </div>

        <Field label="Names and seats on the ticket (optional)"><input value={f.passengersText} maxLength={400} placeholder="Jisnu 10W, Alex 12" onChange={(e) => set({ passengersText: e.target.value })} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticket number"><input value={f.reference} maxLength={80} onChange={(e) => set({ reference: e.target.value })} className={inputClass} /></Field>
          <Field label="Bus or operator"><input value={f.operator} maxLength={60} onChange={(e) => set({ operator: e.target.value })} className={inputClass} /></Field>
        </div>
        <Field label="Note (optional)"><input value={f.note} maxLength={300} placeholder="Boarding point, contact number…" onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
      </div>
    </Sheet>
  );
}
