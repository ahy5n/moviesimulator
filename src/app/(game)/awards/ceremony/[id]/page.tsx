'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGame } from '@/store/game';
import { AWARD_BODIES } from '@/data/awards';
import { talent } from '@/lib/talentDb';
import { studioById } from '@/lib/engine/util';
import { Button, Empty } from '@/components/ui';

const PERSON_CATS = new Set(['Best Director', 'Best Actor', 'Best Actress', 'Best Supporting Actor', 'Best Supporting Actress', 'Best Score', 'Best Cinematography', 'Best Editing']);

export default function Ceremony() {
  const { state: s, act } = useGame();
  const { id } = useParams<{ id: string }>();
  const [idx, setIdx] = useState(0);
  const [opened, setOpened] = useState(false);
  const c = s?.ceremonies.find((x) => x.id === id);
  useEffect(() => { if (c && !c.viewed) act((d) => { const x = d.ceremonies.find((k) => k.id === id); if (x) x.viewed = true; }); }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s || !c) return <Empty>Ceremony not found.</Empty>;
  if (c.categories.every((k) => k.winner < 0)) return <Empty>The envelopes are still sealed. Come back on {c.t > s.t ? 'ceremony night' : 'the night'}.</Empty>;
  const body = AWARD_BODIES.find((b) => b.id === c.body)!;
  const done = idx >= c.categories.length;
  // Best Picture last, for drama.
  const cats = [...c.categories].sort((a, b) => (a.name === 'Best Picture' ? 1 : b.name === 'Best Picture' ? -1 : 0));
  const cat = cats[Math.min(idx, cats.length - 1)];
  const label = (n: (typeof cat.nominees)[number]) => {
    const f = s.films.find((x) => x.id === n.filmId);
    const p = n.talentId && PERSON_CATS.has(cat.name) ? talent(s, n.talentId) : undefined;
    return { main: p ? p.name : f?.title ?? '?', sub: p ? f?.title : studioById(s, n.studioId)?.name, mine: n.studioId === s.studio.id };
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="carpet rounded-2xl p-6 text-center shadow-2xl">
        <div className="font-marquee text-sm tracking-[0.4em] text-gold-light">{body.name} · {c.year}</div>
        {!done ? (
          <>
            <div className="h-display mt-3 text-3xl font-bold">{cat.name}</div>
            <div className="mt-5 space-y-2 text-left">
              {cat.nominees.map((n, i) => {
                const l = label(n);
                const win = opened && i === cat.winner;
                return (
                  <div key={i} className={`flex items-center justify-between rounded-lg border px-4 py-2 transition-all duration-700 ${win ? 'scale-[1.03] border-gold bg-gold/25 shadow-[0_0_30px_#D4AF3766]' : opened ? 'border-white/10 bg-black/30 opacity-50' : 'border-white/15 bg-black/25'}`}>
                    <span><span className={`font-semibold ${l.mine ? 'text-gold-light' : ''}`}>{l.main}</span>{l.sub && <span className="ml-2 text-sm text-white/60">{l.sub}</span>}</span>
                    {win && <span className="text-2xl">🏆</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-center gap-3">
              {!opened ? <Button variant="ticket" onClick={() => setOpened(true)}>Open the envelope</Button>
                : <Button onClick={() => { setOpened(false); setIdx(idx + 1); }}>{idx + 1 < cats.length ? 'Next award →' : 'Finish'}</Button>}
              <Button variant="subtle" onClick={() => setIdx(cats.length)}>Skip to results</Button>
            </div>
            <div className="mt-3 text-xs text-white/50">{idx + 1} / {cats.length}</div>
          </>
        ) : (
          <div className="mt-4 space-y-1 text-left text-sm">
            {cats.map((k) => { const l = label(k.nominees[k.winner]); return <div key={k.name} className="flex justify-between gap-3 border-b border-white/10 py-1.5"><span className="text-white/70">{k.name}</span><span className={l.mine ? 'font-semibold text-gold-light' : ''}>{l.main}</span></div>; })}
          </div>
        )}
      </div>
      <div className="mt-4 text-center"><Link href="/awards" className="link">Back to Awards</Link></div>
    </div>
  );
}
