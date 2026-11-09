'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { FESTIVALS } from '@/data/awards';
import { formatDate, turnInYear } from '@/lib/calendar';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { langName } from '@/lib/languages';
import { acquisitionsList, bidStep, lotPeople, placeBid } from '@/lib/engine/acquisitions';
import { studioById } from '@/lib/engine/util';
import type { Acquisition } from '@/lib/types';
import { Badge, Button, Empty, PageHeader, Panel } from '@/components/ui';

const verdict = (r: number) => (r > 0.8 ? 'Standing ovation' : r > 0.2 ? 'Warm applause' : r > -0.3 ? 'Polite response' : 'Walkouts');

function Lot({ a }: { a: Acquisition }) {
  const { state: s, act } = useGame();
  const min = s ? (a.leader ? a.bid + bidStep(a) : a.bid) : 0;
  const [typed, setTyped] = useState('');
  const amount = typed ? Math.round(Number(typed) * 1e6 / 10_000) * 10_000 : min;
  const [note, setNote] = useState<string | null>(null);
  if (!s) return null;
  const p = lotPeople(s, a);
  const mine = a.leader === s.studio.id;
  const buyers = Object.keys(a.rivalMax).length;
  const bid = (x: number) => {
    const res = act((d) => placeBid(d, a.id, x));
    setNote(res ?? 'You lead the bidding.');
    setTyped('');
  };
  return (
    <div className={`panel flex flex-col p-4 ${mine ? 'border-emerald-500/60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-marquee text-2xl leading-tight tracking-wide">{a.title}</h3>
        <span className="chip shrink-0">{FESTIVALS.find((f) => f.id === a.festivalId)?.name.replace(' Film Festival', '')}</span>
      </div>
      <div className="my-1.5 flex flex-wrap gap-1">
        <Badge color={GENRE_COLORS[a.primaryGenre]}>{a.primaryGenre}</Badge>
        {a.secondaryGenre && <Badge color={GENRE_COLORS[a.secondaryGenre]}>{a.secondaryGenre}</Badge>}
        <Badge>{langName(a.language)}</Badge>
        <Badge>Made for {money(a.budget)}</Badge>
      </div>
      <p className="mb-2 text-sm italic text-[#CFC9BC]">“{a.logline}”</p>
      <div className="text-xs text-muted">
        Dir. {p.director ? <Link className="link" href={`/talent/${p.director.id}`}>{p.director.name}</Link> : '—'}
        {p.cast.length > 0 && <> · Starring {p.cast.slice(0, 2).map((t, i) => <span key={t!.id}>{i ? ', ' : ''}<Link className="link" href={`/talent/${t!.id}`}>{t!.name}</Link></span>)}</>}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs"><span className="label">Screening buzz</span><span>{verdict(a.reception)} · {a.screened[0]}–{a.screened[1]}</span></div>
        <div className="relative h-2 rounded-full bg-panel2"><div className="absolute h-2 rounded-full bg-gold/70" style={{ left: `${a.screened[0]}%`, width: `${a.screened[1] - a.screened[0]}%` }} /></div>
      </div>
      <div className="mt-3 flex items-baseline justify-between text-sm">
        <span className="text-muted">{buyers ? `${buyers} other buyer${buyers > 1 ? 's' : ''} circling` : 'No other buyers yet'}</span>
        <span>{a.leader ? <>{mine ? <span className="text-emerald-300">You lead</span> : <span className="text-amber-300">{studioById(s, a.leader)?.name}</span>} at <span className="font-semibold text-gold">{money(a.bid, 2)}</span></> : <>Asking <span className="font-semibold text-gold">{money(a.bid, 2)}</span></>}</span>
      </div>
      {!mine && (
        <div className="mt-3 flex items-center gap-2">
          <input type="number" className="input w-28" step={0.05} min={min / 1e6} placeholder={(min / 1e6).toFixed(2)} value={typed} onChange={(e) => setTyped(e.target.value)} />
          <span className="text-xs text-muted">$M</span>
          <Button size="sm" onClick={() => bid(amount)} disabled={!(amount >= min) || s.studio.cash < amount}>Bid</Button>
          <Button size="sm" variant="ghost" onClick={() => bid(min + bidStep(a) * 3)}>+{money(bidStep(a) * 4)}</Button>
        </div>
      )}
      {note && <div className={`mt-2 text-xs ${mine ? 'text-emerald-300' : 'text-amber-300'}`}>{note}</div>}
    </div>
  );
}

export default function FestivalMarket() {
  const s = useGame((x) => x.state)!;
  const all = s.acquisitions ?? [];
  const open = all.filter((a) => a.status === 'open');
  const past = all.filter((a) => a.status !== 'open').sort((a, b) => b.closesT - a.closesT);
  const ty = turnInYear(s.t);
  const next = FESTIVALS.map((f) => ({ f, t: s.t + ((f.turn - ty + 26) % 26 || 26) })).sort((a, b) => a.t - b.t);
  const spent = past.filter((a) => a.leader === s.studio.id && a.status === 'sold');
  return (
    <div>
      <PageHeader title="Festival Market" sub="Finished indie films go on sale at Summit (January), Riviera (May) and Lido (September). You only see the screening reaction, not the real quality, and rivals bid against you." />
      <Panel title={open.length ? `On sale now · bidding closes ${formatDate(open[0].closesT)}` : 'On sale now'}>
        {open.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{open.map((a) => <Lot key={a.id} a={a} />)}</div>
          : <Empty>Nothing on sale this fortnight. Next market: {next[0].f.name}, {formatDate(next[0].t)}.</Empty>}
      </Panel>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Calendar">
          <div className="space-y-2 text-sm">
            {next.map(({ f, t }) => <div key={f.id} className="flex justify-between"><span>{f.name}</span><span className="text-muted">{formatDate(t)}</span></div>)}
          </div>
          <p className="mt-3 text-xs text-muted">Bought films arrive finished: release them from the Release Planner. Want to premiere your own film instead? Enter it from its film page.</p>
          {spent.length > 0 && <p className="mt-2 text-xs">You’ve bought {spent.length} film{spent.length > 1 ? 's' : ''} for {money(spent.reduce((x, a) => x + a.bid, 0))}.</p>}
        </Panel>
        <Panel title="Recent deals" className="lg:col-span-2" pad={false}>
          {past.length ? (
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Film</th><th>Festival</th><th>Buzz</th><th>Buyer</th><th className="text-right">Price</th></tr></thead>
              <tbody>{past.slice(0, 20).map((a) => {
                const mine = a.leader === s.studio.id && a.status === 'sold';
                return (
                  <tr key={a.id} className={mine ? 'bg-gold/10' : ''}>
                    <td>{a.filmId && s.films.some((f) => f.id === a.filmId) ? <Link className="hover:text-gold" href={`/film/${a.filmId}`}>{a.title}</Link> : a.title} <span className="text-xs text-muted">{a.primaryGenre}</span></td>
                    <td className="text-muted">{FESTIVALS.find((f) => f.id === a.festivalId)?.name.replace(' Film Festival', '')} {a.year}</td>
                    <td className="text-xs">{verdict(a.reception)}</td>
                    <td>{a.status === 'sold' ? studioById(s, a.leader!)?.name : <span className="text-muted">No sale</span>}</td>
                    <td className="text-right tabular-nums">{a.status === 'sold' ? money(a.bid, 2) : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          ) : <div className="p-4"><Empty>No deals yet.</Empty></div>}
        </Panel>
      </div>
    </div>
  );
}
