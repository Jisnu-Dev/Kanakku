"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { recentTrips } from "@/lib/client";
import { Avatar, Button, Field, Icon, inputClass, madras } from "@/components/ui";

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => setRecent(recentTrips()), []);

  function addPerson() {
    const n = draft.trim();
    if (!n) return;
    if (people.some((p) => p.toLowerCase() === n.toLowerCase())) return setError(`${n} is already on the list. Add an initial to tell them apart.`);
    setPeople([...people, n]);
    setDraft("");
    setError("");
  }

  async function create() {
    const everyone = draft.trim() && !people.some((p) => p.toLowerCase() === draft.trim().toLowerCase()) ? [...people, draft.trim()] : people;
    if (!name.trim()) return setError("Give the trip a name");
    if (everyone.length < 2) return setError("Add at least two people, starting with yourself");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, startDate: start || null, endDate: end || null, participants: everyone }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      router.push(`/t/${body.id}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't create the trip. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[520px] pb-16">
      <header className="overflow-hidden rounded-b-[28px] bg-indigo-deep text-white">
        <div aria-hidden className="h-28" style={madras([0, 1, 2, 3, 4, 5], 1.25)} />
        <div aria-hidden className="h-1.5 bg-turmeric" />
        <div className="px-5 pb-7 pt-6">
          <p className="display text-xl font-semibold text-turmeric">Kanakku</p>
          <h1 className="display mt-2 text-[40px] font-semibold leading-[1.02]">One trip, one tab, no arguments.</h1>
          <p className="mt-3 max-w-[38ch] text-white/80">Add every expense as it happens, split it any way you like, and see who pays whom at the end.</p>
        </div>
      </header>

      <div className="px-4">
        {recent.length > 0 && (
          <section className="mt-7">
            <h2 className="display mb-3 text-[19px] font-semibold">Your trips on this phone</h2>
            <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {recent.map((t) => (
                <Link key={t.id} href={`/t/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 font-semibold active:bg-sunk">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <Icon name="chevron" size={18} className="text-muted" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7">
          <h2 className="display mb-3 text-[19px] font-semibold">Start a trip</h2>
          <form className="space-y-4 rounded-2xl bg-surface p-4" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <Field label="Trip name"><input value={name} maxLength={60} placeholder="Chennai with the gang" onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
              <Field label="Ends"><input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-muted">Who's going? Start with yourself.</span>
              {people.length > 0 && (
                <ul className="mb-2.5 flex flex-wrap gap-2">
                  {people.map((p, i) => (
                    <li key={p} className="flex h-10 items-center gap-2 rounded-full border border-line pl-1 pr-1 font-medium">
                      <Avatar person={{ name: p, color: i }} size={30} /> {p}
                      <button type="button" aria-label={`Remove ${p}`} onClick={() => setPeople(people.filter((x) => x !== p))} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunk"><Icon name="x" size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2.5">
                <input aria-label="Person's name" value={draft} maxLength={40} placeholder={people.length ? "Next person" : "Your name"} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }} className={inputClass} />
                <Button variant="quiet" onClick={addPerson} disabled={!draft.trim()}>Add</Button>
              </div>
            </div>
            {error && <p role="alert" className="text-[15px] font-medium text-minus">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create trip"}</Button>
            <p className="text-sm text-muted">You get a private link to share. Anyone with the link can view and add expenses, with no sign-up.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
