// Spin-offs and crossovers: hit films become series, hit series become films (or spawn new series).
import { clamp } from '../rng';
import type { Film, GameState, Series } from '../types';
import { ensureFranchise } from './scripts';

const spunFrom = (s: GameState, id: string) => (s.series ?? []).some((x) => x.spinoffOf === id) || s.films.some((f) => f.spinoffOf === id);

export const canSpinOffFilm = (s: GameState, f: Film) =>
  f.studioId === s.studio.id && (f.stage === 'released' || f.stage === 'library') && (f.gross >= 40e6 || (f.audience ?? 0) >= 75) && !spunFrom(s, f.id);

export const canSpinOffSeries = (s: GameState, x: Series) =>
  x.studioId === s.studio.id && x.seasons.length >= 1 && x.seasons.some((r) => r.audience >= 70 || r.critic >= 75) && !(s.series ?? []).some((y) => y.spinoffOf === x.id);

export const canMakeMovie = (s: GameState, x: Series) =>
  x.studioId === s.studio.id && x.seasons.length >= 2 && !s.films.some((f) => f.spinoffOf === x.id);

/** Built-in audience a spin-off series starts with. */
export function spinoffBuzz(s: GameState, sourceId: string): number {
  const f = s.films.find((x) => x.id === sourceId);
  if (f) return clamp(f.gross / 400e6 + ((f.audience ?? 60) - 60) / 40, 0.1, 1.5);
  const x = (s.series ?? []).find((y) => y.id === sourceId);
  if (x) return clamp(Math.max(...x.seasons.map((r) => r.viewers)) / 3 + (x.seasons.at(-1)!.audience - 60) / 50, 0.1, 1.2);
  return 0;
}

/** A film spun out of a series: its fans show up, like a book adaptation's readers. */
export function movieBuzzFromSeries(x: Series): number {
  const avg = x.seasons.reduce((a, r) => a + r.viewers, 0) / Math.max(1, x.seasons.length);
  return Math.round(clamp(avg * 12 + x.seasons.length * 5, 10, 80));
}

/** Link a spin-off series into the source's franchise (creating one for a standalone film). */
export function linkSpinoff(s: GameState, x: Series, sourceId: string) {
  x.spinoffOf = sourceId;
  x.buzz = Math.max(x.buzz ?? 0, spinoffBuzz(s, sourceId));
  const f = s.films.find((y) => y.id === sourceId);
  if (f) x.franchiseId = ensureFranchise(s, f).id;
  const src = (s.series ?? []).find((y) => y.id === sourceId);
  if (src?.franchiseId) x.franchiseId = src.franchiseId;
  x.events.push(`Spun off from ${f?.title ?? src?.title}.`);
}
