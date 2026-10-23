// Read-only views over game state used by the screens.
import { yearOf } from './calendar';
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
