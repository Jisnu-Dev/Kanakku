"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { categoryOf, modeLabel, splitLabel } from "./constants";
import type { TripState } from "./types";

const ME = (id: string) => `tripsplit:me:${id}`;
const RECENT = "tripsplit:trips";

export function rememberTrip(id: string, name: string) {
  try {
    const list: { id: string; name: string }[] = JSON.parse(localStorage.getItem(RECENT) || "[]");
    localStorage.setItem(RECENT, JSON.stringify([{ id, name }, ...list.filter((t) => t.id !== id)].slice(0, 8)));
  } catch {}
}
export function recentTrips(): { id: string; name: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}

export type Act = (action: string, payload: unknown) => Promise<boolean>;

/** Loads the trip, keeps it fresh (on focus and every few seconds), and sends changes. */
export function useTrip(id: string, onError: (msg: string) => void) {
  const [state, setState] = useState<TripState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [me, setMeState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef("");
  const writing = useRef(0);

  const accept = useCallback((text: string) => {
    if (text === last.current) return;
    last.current = text;
    setState(JSON.parse(text));
    setStatus("ready");
  }, []);

  const refresh = useCallback(async () => {
    if (writing.current) return;
    try {
      const res = await fetch(`/api/trips/${id}`, { cache: "no-store" });
      if (res.status === 404) return setStatus("missing");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      const text = await res.text();
      if (!writing.current) accept(text);
    } catch (e) {
      setStatus((s) => (s === "loading" ? "error" : s));
      if (!last.current && e instanceof Error && e.message) onError(e.message);
    }
  }, [id, accept, onError]);

  useEffect(() => {
    try {
      setMeState(localStorage.getItem(ME(id)));
    } catch {}
    refresh();
    const tick = () => document.visibilityState === "visible" && refresh();
    const timer = setInterval(tick, 6000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [id, refresh]);

  const setMe = useCallback(
    (pid: string | null) => {
      setMeState(pid);
      try {
        if (pid) localStorage.setItem(ME(id), pid);
        else localStorage.removeItem(ME(id));
      } catch {}
    },
    [id],
  );

  const act: Act = useCallback(
    async (action, payload) => {
      writing.current++;
      setBusy(true);
      try {
        const res = await fetch(`/api/trips/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, actorId: me, payload }),
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = "Couldn't save. Check your connection and try again.";
          try {
            msg = JSON.parse(text).error || msg;
          } catch {}
          onError(msg);
          return false;
        }
        accept(text);
        return true;
      } catch {
        onError("Couldn't save. Check your connection and try again.");
        return false;
      } finally {
        writing.current--;
        setBusy(false);
      }
    },
    [id, me, accept, onError],
  );

  return { state, status, me, setMe, act, busy, refresh };
}

/** Shrink a photo in the browser so receipts stay small enough to keep in the database. */
export async function compressImage(file: File, maxSide = 1400, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function buildCsv(state: TripState): string {
  const name = (id: string) => state.participants.find((p) => p.id === id)?.name ?? "?";
  const rupees = (p: number) => (p / 100).toFixed(2);
  const people = state.participants;
  const rows: string[][] = [
    ["Type", "Date", "Title", "Category", "Amount (INR)", "Paid by", "Paid with", "Split type", ...people.map((p) => `${p.name} share`), "Note"],
  ];
  for (const e of [...state.expenses].reverse()) {
    if (e.deletedAt) continue;
    const share = new Map(e.splits.map((s) => [s.participantId, s.amount]));
    rows.push([
      "Expense", e.spentOn, e.title, categoryOf(e.category).label, rupees(e.amount),
      e.fromKitty ? "Kitty" : e.payers.map((p) => (e.payers.length > 1 ? `${name(p.participantId)} (${rupees(p.amount)})` : name(p.participantId))).join("; "),
      modeLabel(e.paymentMode), splitLabel(e.split.mode), ...people.map((p) => rupees(share.get(p.id) ?? 0)), e.note,
    ]);
  }
  for (const k of [...state.kitty].reverse())
    if (!k.deletedAt) rows.push(["Kitty contribution", k.paidOn, `${name(k.participantId)} put money in the kitty`, "", rupees(k.amount), name(k.participantId), modeLabel(k.mode), "", ...people.map(() => ""), k.note]);
  for (const s of [...state.settlements].reverse())
    if (!s.deletedAt) rows.push(["Payment", s.paidOn, `${name(s.fromId)} paid ${name(s.toId)}`, "", rupees(s.amount), name(s.fromId), modeLabel(s.mode), "", ...people.map(() => ""), s.note]);
  const cell = (v: string) => {
    const safe = /^[=+\-@]/.test(v) ? "'" + v : v; // stop spreadsheets treating text as a formula
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function download(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
