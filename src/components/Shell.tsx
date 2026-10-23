'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useGame } from '@/store/game';
import { LAST_SLOT } from '@/store/saves';
import { formatDate, yearOf } from '@/lib/calendar';
import { money } from '@/lib/format';
import { acceptJob, declineJobs } from '@/lib/engine/finance';
import { Button, CountUp, Modal, signed } from './ui';

const NAV: { group: string; items: { href: string; label: string; icon: string; hard?: boolean }[] }[] = [
  { group: 'Studio', items: [
    { href: '/hq', label: 'HQ', icon: '🏛' }, { href: '/inbox', label: 'Inbox', icon: '✉' },
    { href: '/finances', label: 'Finances', icon: '$' }, { href: '/board', label: 'Board Room', icon: '⚖', hard: true },
    { href: '/history', label: 'Hall of Fame', icon: '★' },
  ] },
  { group: 'Development', items: [
    { href: '/scripts', label: 'Script Market', icon: '✎' }, { href: '/develop', label: 'Development', icon: '✍' },
    { href: '/ip', label: 'IP & Franchises', icon: '❖' },
  ] },
  { group: 'Talent & Production', items: [
    { href: '/talent', label: 'Talent', icon: '☺' }, { href: '/slate', label: 'Production Slate', icon: '▤' },
    { href: '/release', label: 'Release Planner', icon: '▶' },
  ] },
  { group: 'Market', items: [
    { href: '/boxoffice', label: 'Box Office', icon: '▮' }, { href: '/streaming', label: 'Streaming', icon: '◉' },
    { href: '/awards', label: 'Awards', icon: '🏆' }, { href: '/rivals', label: 'Rivals', icon: '⚔' },
  ] },
  { group: '', items: [{ href: '/settings', label: 'Saves & Settings', icon: '⚙' }, { href: '/about', label: 'About', icon: 'ℹ' }] },
];

export function Loading({ progress }: { progress: number }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-dashed border-gold/70" style={{ animationDuration: '3s' }} />
        <div className="absolute inset-4 rounded-full border-2 border-gold/40" />
      </div>
      <div className="font-marquee text-4xl tracking-widest text-gold">Rolling cameras…</div>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-gold transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <div className="text-xs text-muted">Loading the talent database</div>
    </div>
  );
}

function TurnSummary() {
  const { state: s, showSummary, closeSummary } = useGame();
  if (!s?.lastSummary) return null;
  const sum = s.lastSummary;
  const inc = Object.entries(sum.income).sort((a, b) => b[1] - a[1]);
  const exp = Object.entries(sum.expenses).sort((a, b) => b[1] - a[1]);
  const net = sum.cashEnd - sum.cashStart;
  return (
    <Modal open={showSummary} onClose={closeSummary} title={<span>Fortnight summary <span className="text-sm font-normal text-muted">· {formatDate(sum.t)}</span></span>}>
      <div className="mb-4 flex items-baseline justify-between">
        <div><div className="label">Cash</div><div className="text-2xl font-semibold"><CountUp value={sum.cashEnd} /></div></div>
        <div className={`text-lg font-semibold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(net)}</div>
      </div>
      {sum.headlines.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="label">Headlines</div>
          {sum.headlines.slice(0, 8).map((h, i) => <div key={i} className="rounded-lg border-l-2 border-gold bg-panel2 px-3 py-1.5 text-sm">{h}</div>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><div className="label mb-1">Money in</div>{inc.length ? inc.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="text-emerald-400">{money(v)}</span></div>) : <div className="text-muted">—</div>}</div>
        <div><div className="label mb-1">Money out</div>{exp.length ? exp.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="text-red-400">{money(v)}</span></div>) : <div className="text-muted">—</div>}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Link href="/inbox" onClick={closeSummary} className="rounded-lg border border-line px-4 py-2 text-sm">Open inbox</Link>
        <Button onClick={closeSummary}>Continue</Button>
      </div>
    </Modal>
  );
}

function Sacked() {
  const { state: s, act } = useGame();
  const router = useRouter();
  if (!s?.sacked) return null;
  return (
    <Modal open onClose={() => undefined} title="You've been fired">
      <p className="mb-4 text-sm text-muted">The board of {s.studio.name} has lost confidence in you. The big studios won't touch you, but a few smaller outfits will. Pick your next job, or walk away.</p>
      <div className="space-y-2">
        {s.sacked.offers.map((o) => (
          <button key={o.id} onClick={() => { act((d) => acceptJob(d, o.id)); router.push('/hq'); }} className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel2 px-4 py-3 text-left hover:border-gold">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-marquee text-black" style={{ background: o.color }}>{o.initials}</span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{o.name}</span><span className="block text-xs text-muted">{o.pitch} Prestige {o.prestige} · {money(o.cash)} cash · {o.hq}</span></span>
            <span className="text-gold">Accept →</span>
          </button>
        ))}
      </div>
      <div className="mt-4 text-right"><Button variant="danger" size="sm" onClick={() => act((d) => declineJobs(d))}>Walk away from Hollywood</Button></div>
    </Modal>
  );
}

function GameOver() {
  const { state: s, quit } = useGame();
  const router = useRouter();
  if (!s?.gameOver) return null;
  return (
    <Modal open onClose={() => undefined} title="Fade to black">
      <p className="mb-2">{s.gameOver.reason}</p>
      <p className="mb-4 text-sm text-muted">{formatDate(s.gameOver.t)} · {s.history.length} seasons in charge.</p>
      <div className="flex justify-end gap-2">
        <Link href="/history" className="rounded-lg border border-line px-4 py-2 text-sm">Hall of Fame</Link>
        <Button onClick={() => { quit(); router.push('/'); }}>Main menu</Button>
      </div>
    </Modal>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { state: s, dbReady, dbProgress, ensureDB, load, advance, busy } = useGame();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [booting, setBooting] = useState(!s);

  useEffect(() => {
    (async () => {
      await ensureDB();
      if (!useGame.getState().state) {
        let slot: string | null = null;
        try { slot = localStorage.getItem(LAST_SLOT); } catch { /* ignore */ }
        if (!slot || !(await load(slot))) { router.replace('/'); return; }
      }
      setBooting(false);
    })();
  }, [ensureDB, load, router]);
  useEffect(() => setMenu(false), [path]);

  if (!dbReady || booting || !s) return <Loading progress={dbProgress} />;
  const unread = s.inbox.filter((m) => !m.read).length;
  const blocked = !!s.sacked || !!s.gameOver;

  const nav = (
    <nav className="space-y-4">
      {NAV.map((g) => (
        <div key={g.group || 'misc'}>
          {g.group && <div className="label mb-1 px-3">{g.group}</div>}
          {g.items.filter((i) => !i.hard || s.settings.difficulty === 'hard').map((i) => {
            const active = path === i.href || (i.href !== '/hq' && path.startsWith(i.href));
            return (
              <Link key={i.href} href={i.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${active ? 'bg-gold/15 text-gold' : 'text-[#CFCAC0] hover:bg-panel2'}`}>
                <span className="w-4 text-center opacity-80">{i.icon}</span>{i.label}
                {i.href === '/inbox' && unread > 0 && <span className="ml-auto rounded-full bg-carpet px-1.5 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-[#0E0E13] lg:flex">
        <Link href="/hq" className="flex items-center gap-3 border-b border-line px-4 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg font-marquee text-lg tracking-wide text-black" style={{ background: s.studio.color }}>{s.studio.initials}</span>
          <span className="min-w-0"><span className="block truncate font-display text-base font-bold">{s.studio.name}</span><span className="text-xs text-muted">Studio Head Sim</span></span>
        </Link>
        <div className="flex-1 overflow-y-auto p-3">{nav}</div>
      </aside>

      {menu && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMenu(false)}>
          <div className="h-full w-72 overflow-y-auto border-r border-line bg-[#0E0E13] p-3" onClick={(e) => e.stopPropagation()}>{nav}</div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-2.5 backdrop-blur">
        <button className="rounded-lg border border-line px-2.5 py-1.5 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
        <div className="min-w-0">
          <div className="font-marquee text-lg leading-none tracking-wider text-gold">{formatDate(s.t)}</div>
          <div className="text-[11px] text-muted">Year {yearOf(s.t) - 2025} · {s.settings.difficulty === 'hard' ? 'Hard' : 'Easy'}{s.board ? ` · Board ${Math.round(s.board.confidence)}` : ''}</div>
        </div>
        <div className="ml-auto text-right">
          <div className={`text-base font-semibold tabular-nums ${s.studio.cash < 0 ? 'text-red-400' : ''}`}><CountUp value={s.studio.cash} /></div>
          <div className="text-[11px] text-muted">cash</div>
        </div>
        <Button variant="ticket" onClick={advance} disabled={busy || blocked}>{busy ? 'Rolling…' : 'Advance ▸'}</Button>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 sm:px-6"><Suspense>{children}</Suspense></main>
      <footer className="mx-auto max-w-7xl px-4 pb-24 text-[11px] text-muted sm:px-6 lg:pb-8">
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="rounded bg-[#0d253f] px-1.5 py-0.5 font-bold text-[#01b4e4]">TMDB</span>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Real names are used for simulation purposes only. <Link href="/about" className="link">About</Link>
        </div>
      </footer>
      <TurnSummary />
      <Sacked />
      <GameOver />
    </div>
  );
}
