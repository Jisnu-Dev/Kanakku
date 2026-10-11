"use client";
import { useMemo, useState } from "react";
import { CHECKLIST_IDEAS, concerns, doneFor, progressFor } from "@/lib/checklist";
import type { ChecklistItem } from "@/lib/types";
import { chooseIdentity, useApp } from "./TripApp";
import { Avatar, Button, Chip, cx, Empty, Field, Icon, inputClass, Meter, Panel, Section, Segmented, Sheet } from "./ui";

type Mode = "each" | "shared";

export function Checklist() {
  const { state, me, act, busy, person, nameOf, toast } = useApp();
  const items = state.checklist;
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<Mode>("each");
  const [assignee, setAssignee] = useState<string>("");
  const [leftOnly, setLeftOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // Ticks show at once and are confirmed by the server a moment later.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const active = state.participants.filter((p) => p.active);
  const view = useMemo(
    () =>
      items.map((i) => {
        const p = pending[i.id];
        if (p === undefined || !me) return i;
        const rest = i.doneBy.filter((x) => x !== me);
        return { ...i, doneBy: i.mode === "shared" ? (p ? [me] : []) : p ? [...rest, me] : rest };
      }),
    [items, pending, me],
  );
  const mine = progressFor(view, me);
  const shown = leftOnly ? view.filter((i) => concerns(i, me) && !doneFor(i, me)) : view;
  const each = shown.filter((i) => i.mode === "each");
  const shared = shown.filter((i) => i.mode === "shared");
  const ideas = CHECKLIST_IDEAS.filter((idea) => !items.some((i) => i.label.toLowerCase() === idea.label.toLowerCase())).slice(0, 8);

  async function add(text: string, m: Mode, who: string | null) {
    const clean = text.trim();
    if (!clean) return;
    if (await act("check.add", { label: clean, mode: m, assigneeId: m === "shared" ? who : null })) setLabel("");
  }

  async function toggle(i: ChecklistItem) {
    if (!me) return chooseIdentity();
    const next = !doneFor(i, me);
    setPending((p) => ({ ...p, [i.id]: next }));
    await act("check.toggle", { id: i.id, participantId: me, done: next });
    setPending((p) => {
      const { [i.id]: _, ...rest } = p;
      return rest;
    });
  }

  const tick = (i: ChecklistItem, on: boolean, labelText: string) => (
    <button type="button" role="checkbox" aria-checked={on} aria-label={labelText} onClick={() => toggle(i)}
      className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border-2 transition", on ? "border-plus bg-plus text-white dark:text-[#06231a]" : "border-line bg-surface")}>
      {on && <Icon name="check" size={18} />}
    </button>
  );
  const more = (i: ChecklistItem) => (
    <button type="button" onClick={() => setEditing(i.id)} aria-label={`Details for ${i.label}`} className="-mr-2 flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunk">
      <Icon name="chevron" size={18} />
    </button>
  );

  return (
    <main className="px-4 pt-5">
      <h1 className="display text-[32px] font-semibold leading-tight">Checklist</h1>
      {items.length > 0 && me && mine.total > 0 ? (
        <div className="mt-2">
          <p className="mb-2 text-muted">
            {mine.left.length === 0 ? "You're all packed." : (
              <>You have <span className="font-semibold text-ink">{mine.left.length} {mine.left.length === 1 ? "thing" : "things"}</span> left of {mine.total}.</>
            )}
          </p>
          <Meter value={mine.done} max={mine.total} label="Your packing progress" />
        </div>
      ) : (
        <p className="mt-1 text-muted">Things to pack and bring, so nothing gets left behind.</p>
      )}

      <form className="mt-5 rounded-2xl bg-surface p-3.5" onSubmit={(e) => { e.preventDefault(); add(label, mode, assignee || null); }}>
        <div className="flex gap-2.5">
          <input aria-label="Something to bring" placeholder="Add something to bring" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
          <Button type="submit" disabled={!label.trim() || busy}>Add</Button>
        </div>
        <div className="mt-3">
          <Segmented label="Who needs it" value={mode} onChange={setMode} options={[{ id: "each", label: "Everyone brings one" }, { id: "shared", label: "One for the group" }]} />
        </div>
        {mode === "shared" && (
          <label className="mt-3 flex items-center gap-3 text-[15px]">
            <span className="shrink-0 text-muted">Who's bringing it?</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={cx(inputClass, "h-10")}>
              <option value="">Not decided</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (you)` : p.name}</option>)}
            </select>
          </label>
        )}
      </form>

      {ideas.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-muted">Often forgotten. Tap to add.</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {ideas.map((idea) => (
              <button key={idea.label} type="button" disabled={busy} onClick={() => add(idea.label, idea.mode, null)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 text-sm font-medium text-ink active:bg-sunk">
                <Icon name="plus" size={15} className="text-muted" /> {idea.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-6"><Empty>Nothing on the list yet. Add what everyone should pack, and anything one person is bringing for the group.</Empty></div>
      ) : (
        <>
          {me && mine.total > 0 && (
            <div className="mt-5 flex gap-2">
              <Chip on={!leftOnly} onClick={() => setLeftOnly(false)}>Everything</Chip>
              <Chip on={leftOnly} onClick={() => setLeftOnly(true)}>Left for me{mine.left.length ? ` (${mine.left.length})` : ""}</Chip>
            </div>
          )}

          {each.length > 0 && (
            <Section title="Everyone brings their own" className="!mt-6">
              <Panel>
                {each.map((i) => {
                  const on = doneFor(i, me);
                  const count = i.doneBy.filter((id) => active.some((p) => p.id === id)).length;
                  return (
                    <div key={i.id} className="flex items-center gap-3 py-2 pl-3.5 pr-4">
                      {tick(i, on, `I've packed ${i.label}`)}
                      <button type="button" onClick={() => toggle(i)} className="min-w-0 flex-1 py-1.5 text-left">
                        <span className={cx("block truncate font-medium", on && "text-muted line-through")}>{i.label}</span>
                        <span className="block text-sm text-muted">{count === active.length && count > 0 ? "Everyone has it" : `${count} of ${active.length} packed`}</span>
                      </button>
                      {more(i)}
                    </div>
                  );
                })}
              </Panel>
            </Section>
          )}

          {shared.length > 0 && (
            <Section title="One for the group" className={each.length ? undefined : "!mt-6"}>
              <Panel>
                {shared.map((i) => {
                  const on = i.doneBy.length > 0;
                  const who = i.assigneeId;
                  return (
                    <div key={i.id} className="flex items-center gap-3 py-2 pl-3.5 pr-4">
                      {tick(i, on, `${i.label} is packed`)}
                      <button type="button" onClick={() => toggle(i)} className="min-w-0 flex-1 py-1.5 text-left">
                        <span className={cx("block truncate font-medium", on && "text-muted line-through")}>{i.label}</span>
                        <span className={cx("block truncate text-sm", !who && !on ? "font-medium text-minus" : "text-muted")}>
                          {on ? `Packed${i.doneBy[0] ? ` by ${i.doneBy[0] === me ? "you" : nameOf(i.doneBy[0])}` : ""}` : who ? (who === me ? "You're bringing this" : `${nameOf(who)} is bringing this`) : "Nobody has taken this yet"}
                        </span>
                      </button>
                      {!who && !on && me ? (
                        <Button size="sm" variant="quiet" disabled={busy} onClick={async () => (await act("check.update", { id: i.id, label: i.label, mode: "shared", assigneeId: me })) && toast(`You're bringing ${i.label}`)}>I'll bring it</Button>
                      ) : who ? (
                        <Avatar person={person(who)} size={28} dim={on} />
                      ) : null}
                      {more(i)}
                    </div>
                  );
                })}
              </Panel>
            </Section>
          )}

          {leftOnly && shown.length === 0 && <div className="mt-6"><Empty>Nothing left for you. You're all packed.</Empty></div>}
        </>
      )}

      {editing && <ItemSheet id={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

/** Rename an item, change who it's for, tick people off, or remove it. */
function ItemSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, me, act, busy, toast } = useApp();
  const item = state.checklist.find((i) => i.id === id);
  const [label, setLabel] = useState(item?.label ?? "");
  const [mode, setMode] = useState<Mode>(item?.mode ?? "each");
  const [assignee, setAssignee] = useState(item?.assigneeId ?? "");
  const [confirming, setConfirming] = useState(false);
  if (!item) return null;
  const people = state.participants.filter((p) => p.active || item.doneBy.includes(p.id));
  const changed = label.trim() !== item.label || mode !== item.mode || (mode === "shared" && (assignee || null) !== item.assigneeId);

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.label}
      footer={
        confirming ? (
          <div className="flex gap-3">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" size="lg" className="flex-1" disabled={busy} onClick={async () => { if (await act("check.delete", { id })) { toast("Removed from the checklist"); onClose(); } }}>Remove</Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variant="quiet" size="lg" aria-label="Remove from the checklist" onClick={() => setConfirming(true)}><Icon name="trash" size={18} /></Button>
            <Button size="lg" className="flex-1" disabled={busy || !label.trim() || !changed}
              onClick={async () => { if (await act("check.update", { id, label: label.trim(), mode, assigneeId: mode === "shared" ? assignee || null : null })) { toast("Saved"); onClose(); } }}>
              Save changes
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        <Field label="What to bring"><input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className={inputClass} /></Field>
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Who needs it?</p>
          <Segmented label="Who needs it" value={mode} onChange={setMode} options={[{ id: "each", label: "Everyone brings one" }, { id: "shared", label: "One for the group" }]} />
          {mode !== item.mode && item.doneBy.length > 0 && <p className="mt-2 text-sm text-muted">Changing this clears the ticks already made.</p>}
        </div>
        {mode === "shared" ? (
          <Field label="Who's bringing it?">
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
              <option value="">Not decided</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (you)` : p.name}</option>)}
            </select>
          </Field>
        ) : (
          item.mode === "each" && (
            <div>
              <p className="mb-1 text-sm font-medium text-muted">Who has packed it? Tap to tick for someone.</p>
              <ul className="divide-y divide-line">
                {people.map((p) => {
                  const on = item.doneBy.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" role="checkbox" aria-checked={on} disabled={busy} onClick={() => act("check.toggle", { id, participantId: p.id, done: !on })} className="flex w-full items-center gap-3 py-2.5 text-left">
                        <Avatar person={p} size={30} dim={!on} />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name}{p.id === me ? " (you)" : ""}</span>
                        <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg border-2", on ? "border-plus bg-plus text-white dark:text-[#06231a]" : "border-line")}>{on && <Icon name="check" size={16} />}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
      </div>
    </Sheet>
  );
}
