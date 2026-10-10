"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/lib/client";
import { MAX_TICKET_BYTES, TICKET_CHUNK, TICKET_KINDS, ticketKind, ticketParts } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { openPdf, pdfText, type OpenPdf } from "@/lib/pdf";
import { matchPeople, namesFromFilename, parseTicketText } from "@/lib/ticketParse";
import type { Ticket } from "@/lib/types";
import { useApp } from "./TripApp";
import { Avatar, Button, Chip, cx, Empty, Field, Icon, inputClass, Sheet } from "./ui";

interface Fields {
  kind: string;
  title: string;
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
  blob: Blob;
  mime: string;
  autofilled: boolean;
}

/** "22:30" -> "10:30 pm" */
function clock(hhmm: string | null): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
const mb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const seatCount = (t: Pick<Ticket, "passengersText" | "passengerIds">) => Math.max(t.passengersText ? t.passengersText.split(",").filter((x) => x.trim()).length : 0, t.passengerIds.length);
const isTravel = (kind: string) => ticketKind(kind).travel;
/** "Tirupur to Chennai" for journeys, the place for everything else. */
function ticketTitle(t: Pick<Ticket, "kind" | "title" | "fromPlace" | "toPlace">): string {
  if (isTravel(t.kind) && t.fromPlace && t.toPlace) return `${t.fromPlace} to ${t.toPlace}`;
  return t.title || t.fromPlace || t.toPlace || ticketKind(t.kind).label;
}

// ---------- file transfer ----------
// Files are fetched in pieces (see TICKET_CHUNK) and kept for the session, so "View" then "Download" loads once.

const loaded = new Map<string, Promise<Uint8Array>>();

function loadBytes(trip: string, t: Ticket, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  let job = loaded.get(t.id);
  if (!job) {
    job = (async () => {
      const parts = ticketParts(t.size);
      const out = new Uint8Array(t.size);
      let at = 0;
      for (let i = 0; i < parts; i++) {
        const res = await fetch(`/api/trips/${trip}/ticket/${t.id}?part=${i}`);
        if (!res.ok) throw new Error("part " + i);
        const piece = new Uint8Array(await res.arrayBuffer());
        out.set(piece, at);
        at += piece.length;
        onProgress?.((i + 1) / parts);
      }
      return out;
    })();
    loaded.set(t.id, job);
    job.catch(() => loaded.delete(t.id));
  }
  return job;
}

function saveToDevice(bytes: Uint8Array, t: Ticket) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: t.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = t.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function useDownload(t: Ticket | undefined) {
  const { state, toast } = useApp();
  const [working, setWorking] = useState(false);
  async function download() {
    if (!t || working) return;
    setWorking(true);
    try {
      saveToDevice(await loadBytes(state.trip.id, t), t);
    } catch {
      toast("Couldn't download the ticket. Check your connection and try again.", "error");
    } finally {
      setWorking(false);
    }
  }
  return { download, working };
}

// ---------- page ----------

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
        let blob: Blob = f;
        let mime = isPdf ? "application/pdf" : f.type;
        if (isImage && f.size > 1_500_000) {
          blob = await (await fetch(await compressImage(f, 2400, 0.86))).blob(); // big phone photos shrink a lot with no visible loss
          mime = "image/jpeg";
        }
        if (blob.size > MAX_TICKET_BYTES) {
          skipped.push(`${f.name} is over 20 MB`);
          continue;
        }
        const draft: Draft = {
          key: Date.now() + i, filename: f.name, blob, mime, autofilled: false,
          kind: isPdf ? "bus" : "other", title: "", fromPlace: "", toPlace: "", departsOn: "", departsAt: "", operator: "", reference: "", passengerIds: [], passengersText: "", note: "",
        };
        let names = namesFromFilename(f.name);
        if (isPdf) {
          try {
            const parsed = parseTicketText(await pdfText(new Uint8Array(await f.arrayBuffer())));
            draft.kind = parsed.kind ?? "other";
            draft.title = parsed.title;
            draft.fromPlace = parsed.fromPlace;
            draft.toPlace = parsed.toPlace;
            draft.departsOn = parsed.departsOn ?? "";
            draft.departsAt = parsed.departsAt ?? "";
            draft.reference = parsed.reference;
            draft.passengersText = parsed.passengers.map((p) => `${p.name} ${p.seat}`).join(", ");
            if (parsed.passengers.length) names = parsed.passengers.map((p) => p.name);
            draft.autofilled = !!(parsed.kind || parsed.departsOn || parsed.passengers.length);
          } catch {
            draft.kind = "other"; // unreadable text just means the form starts empty
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
  const groups = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of shown) {
      const key = isTravel(t.kind) ? `go|${t.fromPlace.toLowerCase()}|${t.toPlace.toLowerCase()}|${t.departsOn ?? ""}` : `${t.kind}|${t.title.toLowerCase()}|${t.departsOn ?? ""}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    // Within a group, your own ticket comes first.
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
            {tickets.length === 0 ? "Bus tickets, entry passes and bookings, in one place." : `${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}${myCount ? `, ${myCount} with your name on` : ""}`}
          </p>
        </div>
        {tickets.length > 0 && <div className="shrink-0 pt-1">{addButton}</div>}
      </div>
      <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose ticket files" tabIndex={-1} onChange={(e) => pick(e.target.files)} />

      {tickets.length === 0 ? (
        <div className="mt-6">
          <Empty action={addButton}>Add the PDFs or photos of your tickets, several at once if you like. Details are filled in from each PDF where they can be read.</Empty>
        </div>
      ) : (
        <>
          {myCount > 0 && myCount < tickets.length && (
            <div className="mt-4 flex gap-2">
              <Chip on={!mineOnly} onClick={() => setMineOnly(false)}>Everyone's</Chip>
              <Chip on={mineOnly} onClick={() => setMineOnly(true)}>Mine</Chip>
            </div>
          )}
          {groups.map((list) => {
            const t0 = list[0];
            const kind = ticketKind(t0.kind);
            const journey = kind.travel && t0.fromPlace && t0.toPlace;
            return (
              <section key={t0.id} className="mt-7">
                <h2 className="display flex flex-wrap items-center gap-x-2 text-[21px] font-semibold leading-tight">
                  <span aria-hidden className="text-xl">{kind.glyph}</span>
                  {journey ? (
                    <>
                      {t0.fromPlace} <Icon name="arrow" size={18} className="text-muted" /> <span className="sr-only">to</span> {t0.toPlace}
                    </>
                  ) : (
                    ticketTitle(t0)
                  )}
                </h2>
                <p className="mt-0.5 text-muted">{[kind.label, t0.departsOn && formatDay(t0.departsOn)].filter(Boolean).join(", ")}</p>
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
  const { me, person, nameOf } = useApp();
  const { download, working } = useDownload(t);
  const mine = !!me && t.passengerIds.includes(me);
  const seats = seatCount(t);
  const travel = isTravel(t.kind);
  const who = t.passengerIds.map((id) => (id === me ? "You" : nameOf(id)));
  const unit = travel ? ["seat", "seats"] : ["person", "people"];
  return (
    <article className={cx("relative overflow-hidden rounded-2xl bg-surface", mine && "ring-2 ring-turmeric")}>
      <button type="button" onClick={onOpen} className="block w-full px-4 pb-3 pt-3.5 text-left active:bg-sunk">
        <span className="flex items-baseline justify-between gap-3">
          <span className="display text-xl font-semibold">{t.departsAt ? clock(t.departsAt) : seats > 1 ? (travel ? "Group ticket" : "Group pass") : travel ? "Ticket" : ticketKind(t.kind).label}</span>
          <span className="text-sm font-medium text-muted">{seats > 0 ? `${seats} ${unit[seats === 1 ? 0 : 1]}` : ""}</span>
        </span>
        {t.operator && <span className="block text-[15px] text-muted">{t.operator}</span>}
        {t.passengerIds.length > 0 && (
          <span className="mt-2.5 flex items-center gap-2.5">
            <span className="flex shrink-0 -space-x-2">{t.passengerIds.slice(0, 6).map((id) => <Avatar key={id} person={person(id)} size={28} />)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{who.join(", ")}</span>
          </span>
        )}
        {t.passengersText && <span className="mt-1.5 block text-sm text-muted">{travel ? "Seats: " : ""}{t.passengersText}</span>}
        {t.note && <span className="mt-1.5 block truncate text-sm text-muted">{t.note}</span>}
        {mine && <span className="mt-2 inline-block rounded-full bg-turmeric px-2.5 py-0.5 text-[13px] font-semibold text-[#1a1f4b]">You're on this ticket</span>}
      </button>
      {/* The tear line: stub below, like a paper ticket. */}
      <div aria-hidden className="relative mx-4 border-t-2 border-dashed border-line">
        <span className="absolute -left-[26px] -top-[10px] h-5 w-5 rounded-full bg-paper" />
        <span className="absolute -right-[26px] -top-[10px] h-5 w-5 rounded-full bg-paper" />
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="num min-w-0 flex-1 truncate text-sm text-muted">{t.reference || t.filename}</span>
        <Button size="sm" variant="quiet" disabled={working} onClick={download} aria-label={`Download ${t.filename}`}><Icon name="download" size={16} /> {working ? "Saving…" : "Save"}</Button>
        <Button size="sm" onClick={onOpen}><Icon name="eye" size={16} /> Open</Button>
      </div>
    </article>
  );
}

// ---------- full-screen viewer ----------

/** Every page of a PDF at full width. Pages are drawn as they scroll into view, so long tickets stay light on memory. */
function PdfPages({ bytes, scroller, onError }: { bytes: Uint8Array; scroller: React.RefObject<HTMLDivElement | null>; onError: () => void }) {
  const [doc, setDoc] = useState<OpenPdf | null>(null);
  const holders = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    let opened: OpenPdf | null = null;
    openPdf(bytes)
      .then((d) => {
        opened = d;
        if (alive) setDoc(d);
        else d.close();
      })
      .catch(() => alive && onError());
    return () => {
      alive = false;
      opened?.close();
    };
  }, [bytes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!doc || !scroller.current) return;
    const done = new Set<number>();
    const width = Math.min(1800, Math.round(scroller.current.clientWidth * Math.min(window.devicePixelRatio || 1, 3) * 1.5));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.page);
          if (!e.isIntersecting || done.has(n)) continue;
          done.add(n);
          doc
            .render(n, width)
            .then((canvas) => {
              canvas.style.cssText = "width:100%;height:100%;display:block";
              canvas.setAttribute("role", "img");
              canvas.setAttribute("aria-label", `Page ${n} of ${doc.ratios.length}`);
              e.target.replaceChildren(canvas);
            })
            .catch(() => done.delete(n));
        }
      },
      { root: scroller.current, rootMargin: "800px 0px" },
    );
    holders.current.forEach((h) => h && io.observe(h));
    return () => io.disconnect();
  }, [doc, scroller]);

  if (!doc) return <p className="animate-pulse py-16 text-center text-muted" aria-live="polite">Opening the ticket…</p>;
  return (
    <div className="space-y-2">
      {doc.ratios.map((ratio, i) => (
        <div key={i} ref={(el) => { holders.current[i] = el; }} data-page={i + 1} className="overflow-hidden bg-white shadow-sm" style={{ aspectRatio: `1 / ${ratio}` }} />
      ))}
    </div>
  );
}

/** Opens a ticket across the whole screen, ready to show at a gate or to a conductor. */
function TicketViewer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (t: Ticket) => void }) {
  const { state, act, busy, nameOf, me, toast } = useApp();
  const t = state.tickets.find((x) => x.id === id);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<"load" | "render" | null>(null);
  const [zoom, setZoom] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const { download, working } = useDownload(t);
  const isPdf = t?.mime === "application/pdf";

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    if (!t) return;
    let alive = true;
    setFailed(null);
    loadBytes(state.trip.id, t, (f) => alive && setProgress(f))
      .then((b) => alive && setBytes(b))
      .catch(() => alive && setFailed("load"));
    return () => {
      alive = false;
    };
  }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen awake while a ticket is being shown.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const imageUrl = useMemo(() => (bytes && t && !isPdf ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: t.mime })) : null), [bytes, t?.mime, isPdf]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void (imageUrl && URL.revokeObjectURL(imageUrl)), [imageUrl]);

  if (!t) return null;
  const when = [t.departsOn && formatDay(t.departsOn), clock(t.departsAt)].filter(Boolean).join(", ");
  const openInTab = () => bytes && window.open(URL.createObjectURL(new Blob([bytes as BlobPart], { type: t.mime })), "_blank");
  const bar = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/15 disabled:opacity-35";

  return (
    <dialog ref={dialog} className="viewer" aria-label={ticketTitle(t)} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="flex shrink-0 items-center gap-1 bg-indigo-deep py-2 pl-1.5 pr-2 text-white" style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}>
        <button type="button" onClick={onClose} aria-label="Close ticket" className={bar}><Icon name="x" /></button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="display truncate text-[17px] font-semibold leading-tight">{ticketTitle(t)}</h2>
          <p className="truncate text-[13px] text-white/75">{when || ticketKind(t.kind).label}</p>
        </div>
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Zoom out" className={bar}><Icon name="minus" /></button>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Zoom in" className={bar}><Icon name="plus" /></button>
        <button type="button" onClick={download} disabled={working} aria-label="Download ticket" className={bar}><Icon name="download" /></button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-sunk">
        <div style={{ width: `${zoom * 100}%` }}>
          {failed === "load" ? (
            <p className="px-6 py-16 text-center text-muted">Couldn't load the ticket. Check your connection, then close and open it again.</p>
          ) : failed === "render" ? (
            <p className="px-6 py-16 text-center text-muted">
              This PDF can't be shown here on this phone.{" "}
              <button type="button" className="font-semibold text-indigo underline dark:text-turmeric" onClick={openInTab}>Open it in a new tab</button> or download it.
            </p>
          ) : !bytes ? (
            <div className="px-10 py-16 text-center text-muted" aria-live="polite">
              <p>Loading the ticket…</p>
              <div className="mx-auto mt-3 h-1.5 max-w-52 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-indigo transition-[width]" style={{ width: `${Math.max(6, progress * 100)}%` }} /></div>
            </div>
          ) : isPdf ? (
            <PdfPages bytes={bytes} scroller={scroller} onError={() => setFailed("render")} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl ?? ""} alt={`Ticket: ${ticketTitle(t)}`} className="block w-full bg-white" />
          )}
        </div>

        <div className="sticky left-0 bg-paper px-5 pb-8 pt-5 text-[15px]">
          <h3 className="display text-lg font-semibold">About this ticket</h3>
          <dl className="mt-2 space-y-1.5">
            {t.passengerIds.length > 0 && <div><dt className="inline text-muted">For </dt><dd className="inline">{t.passengerIds.map((p) => (p === me ? "you" : nameOf(p))).join(", ")}</dd></div>}
            {t.passengersText && <div><dt className="inline text-muted">{isTravel(t.kind) ? "Seats " : "Names "}</dt><dd className="inline">{t.passengersText}</dd></div>}
            {t.operator && <div><dt className="inline text-muted">{isTravel(t.kind) ? "Operator " : "Booked with "}</dt><dd className="inline">{t.operator}</dd></div>}
            {t.reference && <div><dt className="inline text-muted">Ticket number </dt><dd className="num inline">{t.reference}</dd></div>}
            {t.note && <div><dt className="inline text-muted">Note </dt><dd className="inline whitespace-pre-wrap">{t.note}</dd></div>}
            <div className="text-sm text-muted">{t.filename}, {mb(t.size)}{t.uploadedBy ? `, added by ${nameOf(t.uploadedBy)}` : ""}</div>
          </dl>
          {confirming ? (
            <div className="mt-5 flex gap-3">
              <Button variant="quiet" className="flex-1" onClick={() => setConfirming(false)}>Keep it</Button>
              <Button variant="danger" className="flex-1" disabled={busy} onClick={async () => { if (await act("ticket.delete", { id })) { loaded.delete(id); toast("Ticket deleted"); onClose(); } }}>Delete ticket</Button>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button variant="quiet" onClick={() => onEdit(t)}><Icon name="edit" size={17} /> Edit details</Button>
              <Button variant="quiet" onClick={openInTab} disabled={!bytes}>Open in a new tab</Button>
              <Button variant="quiet" onClick={() => setConfirming(true)} aria-label="Delete ticket"><Icon name="trash" size={17} /> Delete</Button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ---------- add / edit ----------

/** Adds one or more tickets (one step per file) or edits the details of an existing one. */
function TicketForm(props: { mode: "add"; drafts: Draft[]; onClose: () => void } | { mode: "edit"; ticket: Ticket; onClose: () => void }) {
  const { state, me, act, busy, toast } = useApp();
  const adding = props.mode === "add";
  const total = adding ? props.drafts.length : 1;
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const [upload, setUpload] = useState<string | null>(null);
  const source: Fields = adding ? props.drafts[index] : { ...props.ticket, departsOn: props.ticket.departsOn ?? "", departsAt: props.ticket.departsAt ?? "" };
  const [f, setF] = useState<Fields>(source);
  const draft = adding ? props.drafts[index] : null;
  const people = state.participants.filter((p) => p.active || f.passengerIds.includes(p.id));
  const set = (patch: Partial<Fields>) => setF((old) => ({ ...old, ...patch }));
  const all = people.length > 0 && people.every((p) => f.passengerIds.includes(p.id));
  const travel = isTravel(f.kind);
  const working = busy || upload !== null;

  function next(savedNow: number) {
    if (!adding || index + 1 >= total) {
      if (savedNow > 0) toast(adding ? (savedNow === 1 ? "Ticket added" : `${savedNow} tickets added`) : "Ticket updated");
      return props.onClose();
    }
    setF(props.drafts[index + 1]);
    setIndex(index + 1);
  }

  /** Reserve the ticket, send the file in pieces, then ask the server to check and publish it. */
  async function sendFile(d: Draft, payload: object): Promise<boolean> {
    const id = crypto.randomUUID();
    const parts = ticketParts(d.blob.size);
    setUpload("Starting…");
    try {
      if (!(await act("ticket.add", { ...payload, id, filename: d.filename, mime: d.mime, size: d.blob.size }))) return false;
      for (let i = 0; i < parts; i++) {
        setUpload(parts > 1 ? `Uploading ${Math.round((i / parts) * 100)}%` : "Uploading…");
        const res = await fetch(`/api/trips/${state.trip.id}/ticket/${id}?seq=${i}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: d.blob.slice(i * TICKET_CHUNK, (i + 1) * TICKET_CHUNK) });
        if (!res.ok) {
          toast((await res.json().catch(() => ({}))).error || "The upload was interrupted. Check your connection and try again.", "error");
          return false;
        }
      }
      setUpload("Finishing…");
      return await act("ticket.finish", { id });
    } catch {
      toast("The upload was interrupted. Check your connection and try again.", "error");
      return false;
    } finally {
      setUpload(null);
    }
  }

  async function save() {
    const payload = {
      kind: f.kind, title: travel ? "" : f.title.trim(), fromPlace: travel ? f.fromPlace.trim() : "", toPlace: travel ? f.toPlace.trim() : "",
      departsOn: f.departsOn || null, departsAt: f.departsAt || null, operator: f.operator.trim(), reference: f.reference.trim(),
      passengerIds: f.passengerIds, passengersText: f.passengersText.trim(), note: f.note.trim(),
    };
    const ok = adding ? await sendFile(draft!, payload) : await act("ticket.update", { ...payload, id: props.ticket.id });
    if (!ok) return;
    setSaved(saved + 1);
    next(saved + 1);
  }

  const last = index + 1 >= total;
  return (
    <Sheet
      open
      onClose={() => !working && props.onClose()}
      title={adding ? (total > 1 ? `Ticket ${index + 1} of ${total}` : "Add ticket") : "Edit ticket"}
      footer={
        <div className="flex gap-3">
          {adding && total > 1 && <Button variant="quiet" size="lg" disabled={working} onClick={() => next(saved)}>Skip</Button>}
          <Button size="lg" className="flex-1" disabled={working} onClick={save}>{upload ?? (busy ? "Saving…" : adding ? (last ? "Save ticket" : "Save and next") : "Save changes")}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {draft && (
          <p className="rounded-2xl bg-sunk px-3.5 py-3 text-[15px]">
            <span className="block truncate font-semibold">{draft.filename} <span className="font-normal text-muted">({mb(draft.blob.size)})</span></span>
            <span className="text-muted">{draft.autofilled ? "Filled in from the ticket. Check it before saving." : "Couldn't read details from this file, so fill in what you know."}</span>
          </p>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-muted">What kind of ticket?</p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {TICKET_KINDS.map((k) => (
              <Chip key={k.id} on={f.kind === k.id} onClick={() => set({ kind: k.id })}><span aria-hidden>{k.glyph}</span> {k.label}</Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {travel ? (
            <>
              <Field label="From"><input value={f.fromPlace} maxLength={40} placeholder="Tirupur" onChange={(e) => set({ fromPlace: e.target.value })} className={inputClass} /></Field>
              <Field label="To"><input value={f.toPlace} maxLength={40} placeholder="Chennai" onChange={(e) => set({ toPlace: e.target.value })} className={inputClass} /></Field>
            </>
          ) : (
            <div className="col-span-2">
              <Field label={f.kind === "stay" ? "Hotel or stay" : "Place or event"}><input value={f.title} maxLength={60} placeholder={f.kind === "stay" ? "Hotel name" : "Wonderla"} onChange={(e) => set({ title: e.target.value })} className={inputClass} /></Field>
            </div>
          )}
          <Field label={f.kind === "stay" ? "Check-in date" : "Date"}><input type="date" value={f.departsOn} onChange={(e) => set({ departsOn: e.target.value })} className={inputClass} /></Field>
          <Field label={travel ? "Departs at" : "Time (optional)"}><input type="time" value={f.departsAt} onChange={(e) => set({ departsAt: e.target.value })} className={inputClass} /></Field>
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
          <p className="mt-2 text-sm text-muted">Pick one person for a single ticket, or everyone covered by a group booking.</p>
        </div>

        <Field label={travel ? "Names and seats on the ticket (optional)" : "Names on the ticket (optional)"}><input value={f.passengersText} maxLength={400} placeholder={travel ? "Jisnu 10W, Alex 12" : "10 adults"} onChange={(e) => set({ passengersText: e.target.value })} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticket number"><input value={f.reference} maxLength={80} onChange={(e) => set({ reference: e.target.value })} className={inputClass} /></Field>
          <Field label={travel ? "Operator" : "Booked with"}><input value={f.operator} maxLength={60} onChange={(e) => set({ operator: e.target.value })} className={inputClass} /></Field>
        </div>
        <Field label="Note (optional)"><input value={f.note} maxLength={300} placeholder={travel ? "Boarding point, contact number…" : "Gate, opening time…"} onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
      </div>
    </Sheet>
  );
}
