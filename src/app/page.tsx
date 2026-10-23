'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HQS, START_CASH } from '@/lib/constants';
import { formatDate } from '@/lib/calendar';
import { money } from '@/lib/format';
import { useGame } from '@/store/game';
import { deleteSave, freeSlot, listSaves, SLOTS, type SlotMeta } from '@/store/saves';
import { Button, Field } from '@/components/ui';
import { Loading } from '@/components/Shell';

const COLORS = ['#D4AF37', '#C0392B', '#2E86DE', '#16A085', '#8E44AD', '#E67E22', '#ECF0F1', '#E84393'];

export default function Title() {
  const router = useRouter();
  const { start, load, ensureDB, dbReady, dbProgress } = useGame();
  const [mode, setMode] = useState<'menu' | 'new' | 'load'>('menu');
  const [saves, setSaves] = useState<SlotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({
    name: 'Meridian Pictures', initials: 'MP', color: COLORS[0], hq: 'LA',
    difficulty: 'easy' as 'easy' | 'hard', crewMode: 'standard' as 'standard' | 'full', startBudget: 'minimajor' as 'indie' | 'minimajor' | 'major',
    slot: 'slot1', seed: '',
  });

  useEffect(() => { listSaves().then(setSaves); freeSlot().then((slot) => setF((x) => ({ ...x, slot }))); }, []);
  useEffect(() => { ensureDB(); }, [ensureDB]);

  if (loading) return <Loading progress={dbProgress} />;

  const begin = async () => {
    setLoading(true);
    await start({ ...f, seed: f.seed || undefined });
    router.push('/hq');
  };
  const resume = async (slot: string) => {
    setLoading(true);
    if (await load(slot)) router.push('/hq');
    else setLoading(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(ellipse at 50% -10%, #D4AF3740, transparent 60%), radial-gradient(ellipse at 50% 120%, #9B1B3060, transparent 55%)' }} />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 py-12">
        <div className="mb-2 font-marquee text-sm tracking-[0.5em] text-muted">STUDIOHEADSIM.COM</div>
        <h1 className="gold-text text-center font-display text-5xl font-extrabold sm:text-7xl">Studio Head</h1>
        <div className="mt-1 font-marquee text-3xl tracking-[0.4em] text-[#F3EEDF]">SIM</div>
        <p className="mt-4 max-w-md text-center text-sm text-muted">It&apos;s January 2026. Buy scripts, cast real actors, chase the Academy Honours — and try not to get fired.</p>

        {mode === 'menu' && (
          <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
            <Button variant="ticket" onClick={() => setMode('new')}>New Game</Button>
            <Button variant="ghost" onClick={() => setMode('load')} disabled={!saves.length}>Load Game{saves.length ? ` (${saves.length})` : ''}</Button>
            <Link href="/about" className="text-center text-sm text-muted hover:text-white">About & attribution</Link>
            {!dbReady && <div className="text-center text-xs text-muted">Loading talent… {Math.round(dbProgress * 100)}%</div>}
          </div>
        )}

        {mode === 'load' && (
          <div className="mt-8 w-full space-y-2">
            {saves.sort((a, b) => b.savedAt - a.savedAt).map((m) => (
              <div key={m.slot} className="panel flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg font-marquee text-black" style={{ background: m.color }}>{m.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.studioName}</div>
                  <div className="text-xs text-muted">{formatDate(m.t)} · {m.difficulty} · {money(m.cash)} · {m.slot}</div>
                </div>
                <Button size="sm" onClick={() => resume(m.slot)}>Load</Button>
                <Button size="sm" variant="danger" onClick={async () => { if (confirm(`Delete ${m.studioName}?`)) { await deleteSave(m.slot); setSaves(await listSaves()); } }}>✕</Button>
              </div>
            ))}
            <div className="pt-2 text-center"><Button variant="subtle" onClick={() => setMode('menu')}>← Back</Button></div>
          </div>
        )}

        {mode === 'new' && (
          <div className="panel mt-8 w-full space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="Studio name"><input className="input" value={f.name} maxLength={32} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Logo initials"><input className="input uppercase" value={f.initials} maxLength={3} onChange={(e) => setF({ ...f, initials: e.target.value.toUpperCase() })} /></Field>
            </div>
            <Field label="Colour">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => <button key={c} onClick={() => setF({ ...f, color: c })} className={`h-8 w-8 rounded-full border-2 ${f.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />)}
              </div>
            </Field>
            <Field label="Headquarters" hint="Boosts your films in the home region.">
              <select className="select w-full" value={f.hq} onChange={(e) => setF({ ...f, hq: e.target.value })}>
                {HQS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </select>
            </Field>
            <Choice label="Difficulty" value={f.difficulty} onChange={(v) => setF({ ...f, difficulty: v })} options={[
              { v: 'easy', t: 'Easy', d: 'Simple finances. No board.' },
              { v: 'hard', t: 'Hard', d: 'Overheads, loans, co-financing and a board that can fire you.' },
            ]} />
            <Choice label="Crew depth" value={f.crewMode} onChange={(v) => setF({ ...f, crewMode: v })} options={[
              { v: 'standard', t: 'Standard', d: 'Actors, directors, writers.' },
              { v: 'full', t: 'Full Crew', d: 'Also composers, cinematographers and editors.' },
            ]} />
            <Choice label="Starting budget" value={f.startBudget} onChange={(v) => setF({ ...f, startBudget: v })} options={[
              { v: 'indie', t: 'Indie', d: money(START_CASH.indie) },
              { v: 'minimajor', t: 'Mini-major', d: money(START_CASH.minimajor) },
              { v: 'major', t: 'Major', d: money(START_CASH.major) },
            ]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Save slot">
                <select className="select w-full" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>
                  {SLOTS.map((s) => <option key={s} value={s}>{s}{saves.some((m) => m.slot === s) ? ' (overwrite)' : ''}</option>)}
                </select>
              </Field>
              <Field label="Seed (optional)" hint="Same seed + same choices = same results."><input className="input" value={f.seed} onChange={(e) => setF({ ...f, seed: e.target.value })} placeholder="random" /></Field>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button variant="subtle" onClick={() => setMode('menu')}>← Back</Button>
              <Button variant="ticket" onClick={begin} disabled={!f.name.trim()}>Lights, camera…</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { v: T; t: string; d: string }[] }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className={`grid gap-2 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} className={`rounded-lg border p-3 text-left transition ${value === o.v ? 'border-gold bg-gold/10' : 'border-line bg-panel2 hover:border-gold/50'}`}>
            <div className="font-semibold">{o.t}</div>
            <div className="text-xs text-muted">{o.d}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
