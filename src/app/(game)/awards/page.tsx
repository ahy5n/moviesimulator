'use client';
import Link from 'next/link';
import { useGame } from '@/store/game';
import { AWARD_BODIES, FESTIVALS, categoriesFor } from '@/data/awards';
import { formatShort, turnInYear, yearOf } from '@/lib/calendar';
import { money } from '@/lib/format';
import { talent } from '@/lib/talentDb';
import { fycSpend } from '@/lib/engine/awards';
import { studioById } from '@/lib/engine/util';
import type { Film, GameState } from '@/lib/types';
import { Button, Empty, PageHeader, Panel } from '@/components/ui';

const AMOUNTS = [250_000, 1_000_000, 3_000_000];

function campaignFilms(s: GameState): Film[] {
  const y = yearOf(s.t);
  const ty = turnInYear(s.t);
  // Before the Academy ceremony you can still campaign for last year's films; from summer, for this year's.
  return s.films.filter((f) => f.studioId === s.studio.id && f.release && f.release.type !== 'sold' && f.critic !== undefined &&
    (yearOf(f.release.t) === y || (yearOf(f.release.t) === y - 1 && ty <= 5)));
}

export default function Awards() {
  const { state: s, act } = useGame();
  if (!s) return null;
  const y = yearOf(s.t);
  const base = s.t - turnInYear(s.t);
  const events = [
    ...AWARD_BODIES.flatMap((b) => [{ t: base + b.nomTurn, label: `${b.name} nominations` }, { t: base + b.ceremonyTurn, label: `${b.name} ceremony` }]),
    ...FESTIVALS.map((f) => ({ t: base + f.turn, label: f.name })),
  ].filter((e) => e.t > s.t || (e.t === s.t && !s.ceremonies.some((c) => c.t === s.t))).sort((a, b) => a.t - b.t);
  const live = s.ceremonies.filter((c) => c.categories.every((k) => k.winner < 0));
  const past = s.ceremonies.filter((c) => c.categories.some((k) => k.winner >= 0)).slice().reverse();
  const films = campaignFilms(s);
  const cats = categoriesFor('academy', s.settings.crewMode === 'full');

  return (
    <div>
      <PageHeader title="Awards Season" sub="Nov–Mar. Late-year prestige releases and smart campaigns win." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Calendar">
          <ul className="space-y-1.5 text-sm">{events.map((e, i) => <li key={i} className="flex justify-between"><span>{e.label}</span><span className="text-muted">{formatShort(e.t)}</span></li>)}</ul>
          {!events.length && <Empty>Season over. Next one starts in the new year.</Empty>}
        </Panel>
        <Panel title="For Your Consideration" className="lg:col-span-2">
          {!films.length ? <Empty>No eligible films. Release well-reviewed films this year to campaign.</Empty> : (
            <div className="space-y-4">
              {films.map((f) => (
                <div key={f.id} className="rounded-lg border border-line bg-panel2 p-3">
                  <div className="mb-2 flex items-center justify-between"><Link href={`/film/${f.id}`} className="font-semibold hover:text-gold">{f.title}</Link><span className="text-xs text-muted">Critics {f.critic} · spent {money(Object.values(f.fyc).reduce((a, b) => a + b, 0))}</span></div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {cats.filter((c) => c !== 'Best Animated Feature' || f.primaryGenre === 'Animation').map((c) => (
                      <div key={c} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{c}{f.fyc[c] ? <span className="text-gold"> · {money(f.fyc[c])}</span> : ''}</span>
                        <span className="flex shrink-0 gap-1">{AMOUNTS.map((a) => <Button key={a} size="sm" variant="ghost" disabled={s.studio.cash < a} onClick={() => act((d) => fycSpend(d, f.id, c, a))}>+{money(a, 0)}</Button>)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted">Diminishing returns: the first million matters far more than the tenth.</p>
            </div>
          )}
        </Panel>
      </div>

      {live.map((c) => (
        <Panel key={c.id} title={`${AWARD_BODIES.find((b) => b.id === c.body)?.name} ${c.year} — nominees`} className="mt-5" right={<span className="text-xs text-muted">Ceremony {formatShort(c.t)}</span>}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {c.categories.map((k) => (
              <div key={k.name}>
                <div className="label mb-1">{k.name}</div>
                <ul className="space-y-0.5 text-sm">{k.nominees.map((n, i) => {
                  const f = s.films.find((x) => x.id === n.filmId);
                  const p = n.talentId && !['Best Picture', 'Best Screenplay', 'Best Animated Feature', 'Best International Feature', 'Best Ensemble'].includes(k.name) ? talent(s, n.talentId) : undefined;
                  const mine = n.studioId === s.studio.id;
                  return <li key={i} className={mine ? 'text-gold' : ''}>{p ? `${p.name} — ` : ''}<span className={p ? 'text-muted' : ''}>{f?.title}</span>{mine && f && <Button size="sm" variant="subtle" onClick={() => act((d) => fycSpend(d, f.id, k.name, 1_000_000))}>+$1M</Button>}</li>;
                })}</ul>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <Panel title="Past ceremonies" className="mt-5">
        {!past.length ? <Empty>No ceremonies yet — the first is in January {y + (turnInYear(s.t) > 1 ? 1 : 0)}.</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {past.map((c) => {
              const bp = c.categories.find((k) => k.name === 'Best Picture' || k.name === 'Best Ensemble');
              const w = bp && bp.nominees[bp.winner];
              const f = w && s.films.find((x) => x.id === w.filmId);
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{AWARD_BODIES.find((b) => b.id === c.body)?.name} {c.year} {!c.viewed && <span className="chip text-gold">unwatched</span>}</span>
                  <span className="flex items-center gap-3"><span className="hidden text-muted sm:inline">{bp?.name}: {f?.title ?? '—'} ({w ? studioById(s, w.studioId)?.name : ''})</span><Link className="link" href={`/awards/ceremony/${c.id}`}>Watch →</Link></span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
