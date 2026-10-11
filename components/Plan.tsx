"use client";
import { useState } from "react";
import { Checklist } from "./Checklist";
import { Tickets } from "./Tickets";
import { Segmented } from "./ui";

type View = "tickets" | "checklist";

// Lets another screen (the Trip page's packing card) open this tab on the checklist.
let startOn: View | null = null;
export const openChecklistNext = () => {
  startOn = "checklist";
};

/** Everything to sort out before leaving: tickets and the packing checklist. */
export function Plan() {
  const [view, setView] = useState<View>(() => {
    const first = startOn ?? (typeof location !== "undefined" && location.hash === "#checklist" ? "checklist" : "tickets");
    startOn = null;
    return first;
  });
  const pick = (v: View) => {
    setView(v);
    history.replaceState(null, "", v === "checklist" ? "#checklist" : "#tickets");
    window.scrollTo({ top: 0 });
  };
  return (
    <>
      <div className="px-4 pt-5">
        <Segmented label="Plan section" value={view} onChange={pick} options={[{ id: "tickets", label: "Tickets" }, { id: "checklist", label: "Checklist" }]} />
      </div>
      {view === "tickets" ? <Tickets /> : <Checklist />}
    </>
  );
}
