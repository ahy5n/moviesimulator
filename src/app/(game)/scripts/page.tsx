'use client';
import Link from 'next/link';
import { langName } from '@/lib/languages';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { GENRE_COLORS } from '@/lib/constants';
import { money } from '@/lib/format';
import { talent } from '@/lib/talentDb';
import { buyCoverage, buyScript, coverageCost } from '@/lib/engine/scripts';
import { marketPulse } from '@/lib/selectors';
import { writersStrike } from '@/lib/engine/shocks';
import { GENRES } from '@/lib/types';
import { Badge, Button, Empty, PageHeader } from '@/components/ui';

export default function Scripts() {
  const { state: s, act } = useGame();
  const router = useRouter();
  const [genre, setGenre] = useState<string>('all');
  const [sort, setSort] = useState<'quality' | 'price' | 'budget'>('quality');
  const pulse = useMemo(() => (s ? Object.fromEntries(marketPulse(s).map((p) => [p.g, p.shown])) : {}), [s]);
  if (!s) return null;
  const list = s.scripts.filter((x) => genre === 'all' || x.primaryGenre === genre || x.secondaryGenre === genre)
    .sort((a, b) => sort === 'quality' ? (b.low + b.high) - (a.low + a.high) : sort === 'price' ? a.price - b.price : a.suggestedBudget - b.suggestedBudget);

  return (
    <div>
      <PageHeader title="Script Marketplace" sub="Fresh scripts every fortnight. Rivals are shopping too." right={
        <>
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)}><option value="all">All genres</option>{GENRES.map((g) => <option key={g}>{g}</option>)}</select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="quality">Best quality</option><option value="price">Cheapest</option><option value="budget">Smallest budget</option></select>
        </>
      } />
      {writersStrike(s) && <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">The writers are on strike. No new scripts will come onto the market until it ends.</div>}
      {!list.length && <Empty>No scripts match. Check back next fortnight.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((sc) => {
          const w = talent(s, sc.writerId);
          const by = sc.dealBy ? talent(s, sc.dealBy) : undefined;
          const afford = s.studio.cash >= sc.price;
          return (
            <div key={sc.id} className={`panel flex flex-col p-4 ${by ? 'border-gold/60' : ''}`}>
              {by && <div className="mb-2 text-xs text-gold">Pitched to you by <Link href={`/talent/${by.id}`} className="link">{by.name}</Link> under your deal{by.kind === 'director' ? ' · wants to direct' : ''}</div>}
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-marquee text-2xl leading-tight tracking-wide">{sc.title}</h3>
                <span className="shrink-0 text-xs text-muted">{sc.expires - s.t <= 1 ? 'Last chance' : `${sc.expires - s.t} fn left`}</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                <Badge color={GENRE_COLORS[sc.primaryGenre]}>{sc.primaryGenre}{pulse[sc.primaryGenre] >= 1.12 ? ' 🔥' : ''}</Badge>
                {sc.secondaryGenre && <Badge color={GENRE_COLORS[sc.secondaryGenre]}>{sc.secondaryGenre}</Badge>}
                <Badge>{sc.tone}</Badge>
                <Badge>{langName(sc.language)}</Badge>
              </div>
              <p className="mb-3 flex-1 text-sm italic text-[#CFC9BC]">“{sc.logline}”</p>
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs"><span className="label">Script quality</span><span className="tabular-nums">{sc.low}–{sc.high}{sc.coverage ? ' ✓' : ''}</span></div>
                <div className="relative h-2 rounded-full bg-panel2">
                  <div className="absolute h-2 rounded-full bg-gold/70" style={{ left: `${sc.low}%`, width: `${Math.max(2, sc.high - sc.low)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><div className="label">Budget</div>{money(sc.suggestedBudget)}<div className="text-muted">{sc.tier}</div></div>
                <div><div className="label">Roles</div>{sc.leads} lead · {sc.supports} sup</div>
                <div><div className="label">Writer</div>{w ? <Link href={`/talent/${w.id}`} className="link">{w.name}</Link> : '—'}</div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button onClick={() => { const f = act((d) => buyScript(d, sc.id)); if (f) router.push(`/film/${f.id}`); }} disabled={!afford}>Buy {money(sc.price)}</Button>
                {!sc.coverage && <Button variant="ghost" size="sm" onClick={() => act((d) => buyCoverage(d, sc.id))} title="Pay a reader to narrow the quality estimate">Coverage {money(coverageCost(sc))}</Button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
