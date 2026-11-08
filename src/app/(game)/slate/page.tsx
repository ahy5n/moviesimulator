'use client';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { myFilms } from '@/lib/selectors';
import { totalCost } from '@/lib/engine/util';
import { money } from '@/lib/format';
import type { Film } from '@/lib/types';
import { FilmCard } from '@/components/cards';
import { Button, LinkButton, PageHeader } from '@/components/ui';

const COLS: { id: string; label: string; match: (f: Film) => boolean }[] = [
  { id: 'dev', label: 'Development', match: (f) => f.stage === 'development' },
  { id: 'pre', label: 'Pre-production', match: (f) => f.stage === 'preproduction' },
  { id: 'film', label: 'Filming', match: (f) => f.stage === 'filming' },
  { id: 'post', label: 'Post-production', match: (f) => f.stage === 'post' },
  { id: 'mkt', label: 'Marketing / Ready', match: (f) => f.stage === 'ready' },
  { id: 'rel', label: 'In release', match: (f) => f.stage === 'released' },
  { id: 'lib', label: 'Library', match: (f) => f.stage === 'library' },
];

export default function Slate() {
  const s = useGame((x) => x.state)!;
  const [showLib, setShowLib] = useState(false);
  const films = myFilms(s);
  const cols = COLS.filter((c) => showLib || c.id !== 'lib');
  const inProd = films.filter((f) => ['development', 'preproduction', 'filming', 'post', 'ready'].includes(f.stage));
  return (
    <div>
      <PageHeader title="Production Slate" sub={`${inProd.length} projects · ${money(inProd.reduce((a, f) => a + totalCost(f), 0))} committed`}
        right={<><Button size="sm" variant="ghost" onClick={() => setShowLib(!showLib)}>{showLib ? 'Hide' : 'Show'} library</Button><LinkButton href="/scripts" size="sm" variant="gold">+ New project</LinkButton></>} />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {cols.map((c) => {
          const list = films.filter(c.match);
          return (
            <div key={c.id} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1"><span className="font-marquee text-lg tracking-wider text-gold">{c.label}</span><span className="text-xs text-muted">{list.length}</span></div>
              <div className="min-h-[120px] space-y-2 rounded-xl border border-dashed border-line p-2">
                {list.map((f) => <FilmCard key={f.id} f={f} s={s} premiere={f.stage === 'ready' && f.release?.t === s.t} />)}
              </div>
            </div>
          );
        })}
      </div>
      {!!s.series?.length && <div className="mt-2 rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-marquee text-lg tracking-wider text-gold">Earlier TV contracts</h2><span className="text-xs text-muted">These contracts were made before TV joined the production pipeline.</span></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{s.series.map((show) => <div key={show.id} className="rounded-lg border border-line bg-panel2 p-3"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{show.title}</span><span className="chip">{show.genre}</span></div><div className="mt-1 text-xs text-muted">{show.channelName} · {show.language} · {show.episodes} × {show.episodeMinutes} min</div><div className="mt-2 text-xs">Season {show.seasonsProduced} / {show.totalSeasons} · {money(show.revenue)} licence revenue</div></div>)}</div>
      </div>}
    </div>
  );
}
