"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { computeBalances, kittySummary, simplifyDebts, totalSpent, type KittySummary, type PersonBalance, type Transfer } from "@/lib/balances";
import { rememberTrip, useTrip, type Act } from "@/lib/client";
import type { Expense, Participant, TripState } from "@/lib/types";
import { Avatar, cx, Icon, Sheet } from "./ui";
import { Home } from "./Home";
import { Expenses } from "./Expenses";
import { Balances } from "./Balances";
import { Insights } from "./Insights";
import { Group } from "./Group";
import { Tickets } from "./Tickets";
import { ExpenseForm } from "./ExpenseForm";
import { ExpenseDetail } from "./ExpenseDetail";
import { KittyForm, SettleForm, type SettlePrefill } from "./MoneyForms";

export type Tab = "home" | "expenses" | "balances" | "insights" | "tickets" | "group";

interface App {
  state: TripState;
  me: string | null;
  setMe: (id: string | null) => void;
  act: Act;
  busy: boolean;
  person: (id: string | null | undefined) => Participant | undefined;
  nameOf: (id: string | null | undefined) => string;
  balances: PersonBalance[];
  transfers: Transfer[];
  kitty: KittySummary;
  spent: number;
  live: Expense[];
  go: (tab: Tab) => void;
  addExpense: () => void;
  editExpense: (e: Expense) => void;
  viewExpense: (id: string) => void;
  settle: (prefill?: SettlePrefill) => void;
  addToKitty: () => void;
  toast: (msg: string, tone?: "ok" | "error") => void;
}

const Ctx = createContext<App | null>(null);
export const useApp = () => useContext(Ctx)!;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Trip", icon: "home" },
  { id: "expenses", label: "Expenses", icon: "list" },
  { id: "balances", label: "Balances", icon: "scale" },
  { id: "insights", label: "Spending", icon: "chart" },
  { id: "tickets", label: "Tickets", icon: "ticket" },
  { id: "group", label: "Group", icon: "people" },
];

export function TripApp({ id }: { id: string }) {
  const [toastMsg, setToastMsg] = useState<{ msg: string; tone: "ok" | "error"; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    clearTimeout(timer.current);
    setToastMsg({ msg, tone, key: Date.now() });
    timer.current = setTimeout(() => setToastMsg(null), tone === "error" ? 5000 : 2400);
  }, []);
  const onError = useCallback((m: string) => toast(m, "error"), [toast]);
  const { state, status, me, setMe, act, busy } = useTrip(id, onError);

  const [tab, setTab] = useState<Tab>("home");
  const [form, setForm] = useState<{ expense: Expense | null } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [settling, setSettling] = useState<SettlePrefill | null>(null);
  const [kittyOpen, setKittyOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.slice(1) as Tab;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const go = useCallback((t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "home" ? location.pathname : `#${t}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (state) {
      rememberTrip(state.trip.id, state.trip.name);
      document.title = `${state.trip.name} – Kanakku`;
    }
  }, [state?.trip.id, state?.trip.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const app = useMemo<App | null>(() => {
    if (!state) return null;
    const map = new Map(state.participants.map((p) => [p.id, p]));
    const balances = computeBalances(state);
    return {
      state, me: me && map.has(me) ? me : null, setMe, act, busy,
      person: (pid) => (pid ? map.get(pid) : undefined),
      nameOf: (pid) => (pid && map.get(pid)?.name) || "Someone",
      balances,
      transfers: simplifyDebts(balances),
      kitty: kittySummary(state),
      spent: totalSpent(state),
      live: state.expenses.filter((e) => !e.deletedAt),
      go,
      addExpense: () => setForm({ expense: null }),
      editExpense: (e) => setForm({ expense: e }),
      viewExpense: setViewing,
      settle: (prefill) => setSettling(prefill ?? {}),
      addToKitty: () => setKittyOpen(true),
      toast,
    };
  }, [state, me, setMe, act, busy, go, toast]);

  if (status === "missing") return <Notice title="This trip link doesn't work" body="Check that the whole link was copied, or start a new trip." />;
  if (!app) return status === "error" ? <Notice title="Couldn't load the trip" body="Check your connection and reload the page." /> : <Loading />;

  const needsIdentity = !app.me || choosing;
  const View = { home: Home, expenses: Expenses, balances: Balances, insights: Insights, tickets: Tickets, group: Group }[tab];

  return (
    <Ctx.Provider value={app}>
      <div className="mx-auto min-h-dvh max-w-[520px] pb-28">
        <View />
      </div>

      <nav aria-label="Sections" className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="safe-bottom mx-auto grid max-w-[520px] grid-cols-6 px-0.5 pt-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cx("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-semibold min-[400px]:text-[11.5px]", tab === t.id ? "text-indigo dark:text-turmeric" : "text-muted")}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {tab !== "group" && tab !== "tickets" && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-[76px] z-20 mx-auto flex max-w-[520px] justify-end px-4" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          <button
            type="button"
            onClick={app.addExpense}
            className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-turmeric pl-4 pr-5 text-base font-semibold text-[#1a1f4b] shadow-[0_6px_20px_rgb(23_28_79/0.28)] active:scale-[0.97]"
          >
            <Icon name="plus" size={22} /> Add expense
          </button>
        </div>
      )}

      {form && <ExpenseForm key={form.expense?.id ?? "new"} expense={form.expense} onClose={() => setForm(null)} />}
      {viewing && !form && <ExpenseDetail id={viewing} onClose={() => setViewing(null)} />}
      {settling && <SettleForm prefill={settling} onClose={() => setSettling(null)} />}
      {kittyOpen && <KittyForm onClose={() => setKittyOpen(false)} />}

      <Sheet open={needsIdentity} onClose={() => app.me && setChoosing(false)} title="Who are you?">
        <p className="mb-4 text-[15px] text-muted">Pick your name so the trip shows what you owe and who added what. This is remembered on this phone only.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {state!.participants.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setMe(p.id);
                setChoosing(false);
              }}
              className={cx("flex items-center gap-3 rounded-2xl border p-3 text-left font-semibold", app.me === p.id ? "border-indigo bg-sunk" : "border-line")}
            >
              <Avatar person={p} dim={!p.active} />
              <span className="min-w-0 truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted">Not on the list? Ask someone on the trip to add you from the Group tab.</p>
      </Sheet>
      <IdentityBridge onChoose={() => setChoosing(true)} />

      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4">
        {toastMsg && (
          <div key={toastMsg.key} className={cx("pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-[15px] font-medium shadow-lg", toastMsg.tone === "error" ? "bg-minus text-white dark:text-[#2a0710]" : "bg-ink text-paper")}>
            {toastMsg.msg}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

/** Lets any screen open the "Who are you?" sheet without threading a prop through. */
function IdentityBridge({ onChoose }: { onChoose: () => void }) {
  useEffect(() => {
    const h = () => onChoose();
    window.addEventListener("kanakku:choose-me", h);
    return () => window.removeEventListener("kanakku:choose-me", h);
  }, [onChoose]);
  return null;
}
export const chooseIdentity = () => window.dispatchEvent(new Event("kanakku:choose-me"));

function Loading() {
  return (
    <div className="mx-auto max-w-[520px] animate-pulse px-4 pt-4" aria-busy aria-label="Loading the trip">
      <div className="h-52 rounded-3xl bg-sunk" />
      <div className="mt-6 h-5 w-32 rounded bg-sunk" />
      <div className="mt-3 h-40 rounded-2xl bg-sunk" />
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-start justify-center px-6">
      <h1 className="display text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-indigo px-5 text-[15px] font-semibold text-on-indigo">
        Start a new trip
      </Link>
    </main>
  );
}
