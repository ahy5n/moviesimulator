// The studio lot: big upfront investments that make later productions cheaper and better.
import type { FacilityId, Film, GameState, Genre, Series } from '../types';
import { msg, pay } from './util';

export type FacilityInfo = {
  id: FacilityId; name: string; blurb: string; costs: number[]; buildTurns: number;
  saving: number; quality: number; // per level, for productions it applies to
  appliesTo: string; applies: (genres: Genre[], animated: boolean) => boolean;
};

const VFX_GENRES: Genre[] = ['Action', 'Sci-Fi', 'Superhero', 'Fantasy'];

export const FACILITIES: FacilityInfo[] = [
  { id: 'stages', name: 'Sound stages', blurb: 'Shoot on your own lot instead of renting. Idle stages are leased out.', costs: [25e6, 60e6, 120e6], buildTurns: 6, saving: 0.04, quality: 0.8, appliesTo: 'Every live-action film and series', applies: (_g, anim) => !anim },
  { id: 'vfx', name: 'VFX house', blurb: 'In-house effects for spectacle pictures.', costs: [40e6, 90e6, 180e6], buildTurns: 8, saving: 0.06, quality: 1.5, appliesTo: 'Action, Sci-Fi, Superhero and Fantasy', applies: (g) => g.some((x) => VFX_GENRES.includes(x)) },
  { id: 'animation', name: 'Animation unit', blurb: 'Your own animators. Level 2+ also shaves a fortnight off production.', costs: [50e6, 110e6, 200e6], buildTurns: 10, saving: 0.08, quality: 2, appliesTo: 'Animated films and series', applies: (_g, anim) => anim },
  { id: 'post', name: 'Post-production suite', blurb: 'Editing bays, sound mix and grading in-house. Post runs a fortnight faster; test screenings are free.', costs: [15e6, 35e6], buildTurns: 4, saving: 0.01, quality: 0.5, appliesTo: 'Everything you make', applies: () => true },
];
export const facilityInfo = (id: FacilityId) => FACILITIES.find((f) => f.id === id)!;

/** Built and finished levels only. */
export function facilityLevel(s: GameState, id: FacilityId): number {
  const f = s.facilities?.[id];
  if (!f) return 0;
  return f.readyT <= s.t ? f.level : f.level - 1;
}

export const upkeepPerTurn = (id: FacilityId, level: number) => facilityInfo(id).costs.slice(0, level).reduce((a, b) => a + b, 0) * 0.08 / 26;

export function buildFacility(s: GameState, id: FacilityId): string | null {
  const info = facilityInfo(id);
  const cur = s.facilities?.[id];
  if (cur && cur.readyT > s.t) return 'Already under construction.';
  const level = (cur?.level ?? 0) + 1;
  const cost = info.costs[level - 1];
  if (!cost) return 'Fully built.';
  if (s.studio.cash < cost) return 'Not enough cash.';
  pay(s, s.studio.id, -cost, 'Facilities');
  (s.facilities ??= {})[id] = { level, readyT: s.t + info.buildTurns };
  return null;
}

/** Saving (share of production budget) and quality bonus a production gets from your lot. */
export function facilityEffect(s: GameState, studioId: string, genres: Genre[], animated: boolean) {
  if (studioId !== s.studio.id) return { saving: 0, quality: 0 };
  let saving = 0, quality = 0;
  for (const info of FACILITIES) {
    const lv = facilityLevel(s, info.id);
    if (!lv || !info.applies(genres, animated)) continue;
    saving += info.saving * lv;
    quality += info.quality * lv;
  }
  return { saving: Math.min(0.3, saving), quality: Math.round(quality * 10) / 10 };
}
export const filmFacilityEffect = (s: GameState, f: Film) =>
  facilityEffect(s, f.studioId, [f.primaryGenre, ...(f.secondaryGenre ? [f.secondaryGenre] : [])], f.primaryGenre === 'Animation');
export const seriesFacilityEffect = (s: GameState, x: Series) =>
  facilityEffect(s, x.studioId, [x.primaryGenre, ...(x.secondaryGenre ? [x.secondaryGenre] : [])], x.format === 'Animated' || x.primaryGenre === 'Animation');

/** Upkeep, construction news and stage rental income when nothing of yours is shooting. */
export function advanceFacilities(s: GameState) {
  for (const info of FACILITIES) {
    const cur = s.facilities?.[info.id];
    if (!cur) continue;
    if (cur.readyT === s.t) msg(s, 'news', `${info.name} ${cur.level > 1 ? `upgraded to level ${cur.level}` : 'open for business'}`, `Applies to: ${info.appliesTo.toLowerCase()}.`, { link: '/lot' });
    const lv = facilityLevel(s, info.id);
    if (lv) pay(s, s.studio.id, -upkeepPerTurn(info.id, lv), 'Facilities');
  }
  const stages = facilityLevel(s, 'stages');
  if (stages) {
    const shooting = s.films.some((f) => f.studioId === s.studio.id && f.stage === 'filming') || (s.series ?? []).some((x) => x.studioId === s.studio.id && x.stage === 'filming');
    if (!shooting) pay(s, s.studio.id, upkeepPerTurn('stages', stages) * 1.1, 'Stage rentals');
  }
}
