// Read-only views over game state used by the screens.
import { yearOf } from './calendar';
import { talent } from './talentDb';
import { makeRng, clamp } from './rng';
import { GENRES, type Film, type GameState, type Genre } from './types';
import { filmProfit, studioById } from './engine/util';
import { greenlightIssues } from './engine/production';

/** Box office chart for a given fortnight (two weeks ending at turn t). */
export function chartFor(s: GameState, t: number) {
  const rows: { f: Film; gross: number; total: number; week: number; studio: string; color: string; mine: boolean }[] = [];
  for (const f of s.films) {
    if (!f.release || f.release.type === 'streaming' || f.release.type === 'sold' || !f.weekly.length) continue;
    const startWeek = f.release.t * 2;
    const w0 = t * 2 - startWeek;
    if (w0 < 0 || w0 >= f.weekly.length) continue;
    const gross = (f.weekly[w0] ?? 0) + (f.weekly[w0 + 1] ?? 0);
    if (gross <= 0) continue;
    const total = f.weekly.slice(0, w0 + 2).reduce((a, b) => a + b, 0);
    const st = studioById(s, f.studioId);
    rows.push({ f, gross, total, week: Math.floor(w0 / 2) + 1, studio: st?.name ?? '?', color: st?.color ?? '#888', mine: f.studioId === s.studio.id });
  }
  return rows.sort((a, b) => b.gross - a.gross);
}

/** The genre heat players see: true heat plus a little noise. */
export function marketPulse(s: GameState): { g: Genre; shown: number; trend: number }[] {
  const y = yearOf(s.t);
  return GENRES.map((g) => {
    const r = makeRng(s.seed, y, Math.floor(s.t / 6), 'pulse', g);
    return { g, shown: clamp(s.genreHeat[g] + r.normal(0, 0.06), 0.5, 1.5), trend: s.genreHeat[g] - 1 };
  }).sort((a, b) => b.shown - a.shown);
}

export type Alert = { text: string; href: string; tone: 'gold' | 'red' | 'muted' };
export function alerts(s: GameState): Alert[] {
  const out: Alert[] = [];
  for (const f of s.films) {
    if (f.studioId !== s.studio.id) continue;
    if (f.stage === 'preproduction') {
      const issues = greenlightIssues(s, f);
      out.push(issues.length ? { text: `${f.title}: ${issues.join(' ')}`, href: `/film/${f.id}`, tone: 'gold' } : { text: `${f.title} is ready to greenlight.`, href: `/film/${f.id}`, tone: 'gold' });
    }
    if (f.stage === 'ready' && !f.release) out.push({ text: `${f.title} is finished — schedule a release.`, href: `/release?film=${f.id}`, tone: 'gold' });
  }
  for (const m of s.inbox) if (m.offer && m.offer.expires > s.t && !m.read) out.push({ text: m.title, href: m.link ?? '/inbox', tone: 'gold' });
  if (s.board && s.board.confidence < 35) out.push({ text: `Board confidence is ${Math.round(s.board.confidence)}. Below 20 you're out.`, href: '/board', tone: 'red' });
  if (s.studio.cash < 0) out.push({ text: 'You are overdrawn!', href: '/finances', tone: 'red' });
  for (const x of s.series ?? []) {
    if (x.studioId !== s.studio.id) continue;
    if (x.stage === 'pitching' && x.pitchedT === undefined && !x.offers.length) out.push({ text: `${x.title}: pitch it to channels${s.studio.streaming ? ' or keep it for your service' : ''}.`, href: `/tv/${x.id}`, tone: 'gold' });
    if (x.offers.length) out.push({ text: `${x.title}: ${x.offers.length} channel offer${x.offers.length > 1 ? 's' : ''} waiting.`, href: `/tv/${x.id}`, tone: 'gold' });
    if (x.stage === 'preproduction') out.push({ text: `${x.title}: cast it and start season ${x.season + 1}.`, href: `/tv/${x.id}`, tone: 'gold' });
    if (x.stage === 'between' && x.ownService) out.push({ text: `${x.title}: order another season or end it.`, href: `/tv/${x.id}`, tone: 'gold' });
  }
  const unviewed = s.ceremonies.filter((c) => !c.viewed && c.categories.some((k) => k.winner >= 0));
  for (const c of unviewed) out.push({ text: 'An awards ceremony is ready to watch.', href: `/awards/ceremony/${c.id}`, tone: 'gold' });
  return out;
}

export const myFilms = (s: GameState) => s.films.filter((f) => f.studioId === s.studio.id);

export function studioRecords(s: GameState) {
  const mine = myFilms(s).filter((f) => f.stage === 'released' || f.stage === 'library');
  const by = (fn: (f: Film) => number) => [...mine].sort((a, b) => fn(b) - fn(a))[0];
  return {
    total: mine.reduce((a, f) => a + f.gross, 0),
    biggest: by((f) => f.gross), mostProfitable: by(filmProfit), bestReviewed: by((f) => f.critic ?? 0),
    biggestOpening: by((f) => f.weekly[0] ?? 0),
    worst: [...mine].sort((a, b) => filmProfit(a) - filmProfit(b))[0],
  };
}

const PERSON_CATEGORIES = new Set(['Best Director', 'Best Actor', 'Best Actress', 'Best Supporting Actor', 'Best Supporting Actress', 'Best Score', 'Best Cinematography', 'Best Editing']);
/** Display info for an awards nominee, film or TV. */
export function nomineeInfo(s: GameState, n: { filmId: string; seriesId?: string; season?: number; talentId?: string }, category: string) {
  const series = n.seriesId ? (s.series ?? []).find((x) => x.id === n.seriesId) : undefined;
  const film = series ? undefined : s.films.find((x) => x.id === n.filmId);
  const title = series ? `${series.title}${n.season && n.season > 1 ? ` (S${n.season})` : ''}` : film?.title ?? '?';
  const href = series ? `/tv/${series.id}` : film ? `/film/${film.id}` : undefined;
  const isPerson = !!n.talentId && (PERSON_CATEGORIES.has(category) || /Actor|Actress/.test(category));
  const person = isPerson ? talent(s, n.talentId!)?.name : undefined;
  return { title, href, person, isTv: !!series };
}

/** TV ratings chart: every show on air right now, by its latest episode. */
export function tvChart(s: GameState) {
  return (s.series ?? []).filter((x) => x.stage === 'airing' && x.current && x.current.viewers.length)
    .map((x) => {
      const v = x.current!.viewers;
      const st = studioById(s, x.studioId);
      return { x, latest: v[v.length - 1], avg: v.reduce((a, b) => a + b, 0) / v.length, studio: st?.name ?? '?', color: st?.color ?? '#888', mine: x.studioId === s.studio.id };
    })
    .sort((a, b) => b.latest - a.latest);
}
