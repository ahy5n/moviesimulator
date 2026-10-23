'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/store/game';
import { money } from '@/lib/format';
import { talent } from '@/lib/talentDb';
import { closeWar, playerBid, rivalStep } from '@/lib/engine/negotiation';
import { filmById, studioById } from '@/lib/engine/util';
import { Button, CountUp, Empty } from '@/components/ui';
import { Avatar, OvrBadge } from '@/components/cards';

const CLOCK = 8;

export default function Bidding() {
  const { state: s, act } = useGame();
  const w = s?.biddingWar;
  const [clock, setClock] = useState(CLOCK);
  const lastLen = useRef(0);

  // Reset the clock on every new bid.
  useEffect(() => {
    if (!w) return;
    if (w.log.length !== lastLen.current) { lastLen.current = w.log.length; setClock(CLOCK); }
  }, [w]);

  useEffect(() => {
    if (!w || w.done) return;
    const id = setInterval(() => setClock((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [w?.done, w]);

  // Rivals respond a moment after you take the lead.
  useEffect(() => {
    if (!w || w.done || !s || w.leader !== s.studio.id) return;
    const id = setTimeout(() => act((d) => rivalStep(d)), 1200 + Math.random() * 1800);
    return () => clearTimeout(id);
  }, [w?.log.length, w?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (clock <= 0 && w && !w.done && w.leader) act((d) => closeWar(d));
  }, [clock]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;
  if (!w) return <Empty>No bidding war in progress. They start when you chase hot talent that rivals want too.</Empty>;
  const t = talent(s, w.talentId)!;
  const f = filmById(s, w.filmId);
  const leader = w.leader ? studioById(s, w.leader) : undefined;
  const mine = w.leader === s.studio.id;
  const bid = (mult: number) => act((d) => playerBid(d, Math.round((d.biddingWar!.leader ? d.biddingWar!.current * mult : d.biddingWar!.current) / 10_000) * 10_000));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="carpet relative overflow-hidden rounded-2xl border border-carpet p-6 text-center shadow-2xl">
        <div className="font-marquee text-sm tracking-[0.4em] text-gold-light">Bidding war</div>
        <div className="mt-4 flex flex-col items-center gap-3">
          <Avatar t={t} size={96} />
          <div className="h-display text-3xl font-bold">{t.name}</div>
          <div className="flex items-center gap-2 text-sm text-white/70"><OvrBadge value={t.attrs.overall} size="sm" /> Star {t.attrs.starPower} · for {f?.title}</div>
        </div>
        <div className="mt-6 font-marquee text-6xl tracking-wide text-gold-light"><CountUp value={w.current} ms={400} /></div>
        <div className="mt-1 text-sm text-white/80">{w.done ? (w.winner === s.studio.id ? 'SOLD — to you!' : `SOLD — to ${leader?.name ?? 'nobody'}`) : leader ? `${mine ? 'You lead' : `${leader.name} lead`}` : 'Opening bid at the asking price'}</div>
        {!w.done && (
          <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-black/40">
            <div className="h-full bg-gold transition-all duration-1000 ease-linear" style={{ width: `${(Math.max(0, clock) / CLOCK) * 100}%` }} />
          </div>
        )}
      </div>

      {!w.done ? (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {!w.leader && <Button onClick={() => bid(1)} disabled={s.studio.cash < w.current}>Bid {money(w.current)}</Button>}
          {w.leader && !mine && <>
            <Button onClick={() => bid(1.05)} disabled={s.studio.cash < w.current * 1.05}>Raise 5% → {money(w.current * 1.05)}</Button>
            <Button onClick={() => bid(1.12)} disabled={s.studio.cash < w.current * 1.12}>Raise 12% → {money(w.current * 1.12)}</Button>
          </>}
          <Button variant="danger" onClick={() => act((d) => closeWar(d, true))}>Drop out</Button>
        </div>
      ) : (
        <div className="mt-5 text-center">
          {f && <Link href={`/casting/${f.id}`} className="link">Back to casting →</Link>}
        </div>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="panel p-4">
          <div className="label mb-2">In the room</div>
          {w.bidders.map((b) => { const st = studioById(s, b.studioId)!; return <div key={b.studioId} className="flex items-center justify-between py-1 text-sm"><span><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: st.color }} />{st.name}</span><span className={b.out ? 'text-muted line-through' : 'text-emerald-400'}>{b.out ? 'out' : 'bidding'}</span></div>; })}
        </div>
        <div className="panel max-h-56 overflow-y-auto p-4">
          <div className="label mb-2">Bids</div>
          {[...w.log].reverse().map((l, i) => <div key={i} className="flex justify-between py-0.5 text-sm"><span>{studioById(s, l.studioId)?.name}</span><span className="tabular-nums text-gold">{money(l.amount)}</span></div>)}
          {!w.log.length && <div className="text-sm text-muted">No bids yet.</div>}
        </div>
      </div>
    </div>
  );
}
