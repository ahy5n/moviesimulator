// Merchandise and licensing: hit franchises keep paying between films.
import { yearOf } from '../calendar';
import { makeRng, clamp } from '../rng';
import type { Film, Franchise, GameState, Genre, LicenceKind } from '../types';
import { headline, msg, pay } from './util';
import { ensureFranchise } from './scripts';

/** Share of a franchise's lifetime gross that comes back each year as merch royalties, by genre. */
const MERCH: Partial<Record<Genre, number>> = {
  Superhero: 0.07, Animation: 0.09, Family: 0.07, Fantasy: 0.05, 'Sci-Fi': 0.045, Action: 0.025, Musical: 0.03, Horror: 0.015, Comedy: 0.01,
};
const merchRate = (g: Genre) => MERCH[g] ?? 0.008;

export const LICENCES: Record<LicenceKind, { name: string; blurb: string; cost: (gross: number) => number; turns: number; minGross: number }> = {
  toys: { name: 'Toy & consumer products line', blurb: 'Merch income ×1.6 for as long as the franchise is warm.', cost: (g) => Math.max(2e6, Math.round(g * 0.004 / 1e5) * 1e5), turns: 4, minGross: 60e6 },
  game: { name: 'Video game adaptation', blurb: 'A one-off launch payday a year from now. A hit game also heats up the franchise.', cost: (g) => Math.max(15e6, Math.round(g * 0.02 / 1e6) * 1e6), turns: 26, minGross: 150e6 },
  park: { name: 'Theme-park land', blurb: 'Two years to build, then steady income for good, and the franchise cools half as fast.', cost: (g) => Math.max(150e6, Math.round(g * 0.12 / 1e6) * 1e6), turns: 52, minGross: 500e6 },
};

export function franchiseFilms(s: GameState, fr: Franchise): Film[] {
  return fr.filmIds.map((id) => s.films.find((f) => f.id === id)).filter((f): f is Film => !!f && !!f.release && f.release.t <= s.t);
}
export const franchiseGross = (s: GameState, fr: Franchise) => franchiseFilms(s, fr).reduce((a, f) => a + f.gross, 0);

function mainGenre(films: Film[]): Genre {
  const w = new Map<Genre, number>();
  for (const f of films) w.set(f.primaryGenre, (w.get(f.primaryGenre) ?? 0) + f.gross + 1);
  return [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Drama';
}

const hasLive = (fr: Franchise, k: LicenceKind) => !!fr.licences?.some((l) => l.kind === k && l.live);

/** Yearly merch royalties a franchise is earning right now. */
export function merchPerYear(s: GameState, fr: Franchise): number {
  const films = franchiseFilms(s, fr);
  if (!films.length) return 0;
  const gross = films.reduce((a, f) => a + f.gross, 0);
  const last = Math.max(...films.map((f) => f.release!.t));
  const years = (s.t - last) / 26;
  return gross * merchRate(mainGenre(films)) * (0.3 + Math.min(1.2, fr.heat)) * Math.pow(0.85, years) * (hasLive(fr, 'toys') ? 1.6 : 1);
}
export const parkPerYear = (s: GameState, fr: Franchise) => (hasLive(fr, 'park') ? franchiseGross(s, fr) * 0.05 * (0.5 + Math.min(1.2, fr.heat)) : 0);

/** One-film hits outside a franchise still sell T-shirts, at half the rate. */
export function standaloneMerch(s: GameState, f: Film): number {
  if (f.franchiseId || !f.release || f.release.t > s.t || f.gross < 150e6) return 0;
  return f.gross * merchRate(f.primaryGenre) * 0.5 * 0.5 * Math.pow(0.8, (s.t - f.release.t) / 26);
}

export function signLicence(s: GameState, franchiseId: string, kind: LicenceKind): string | null {
  const fr = s.franchises.find((x) => x.id === franchiseId);
  if (!fr || fr.studioId !== s.studio.id) return 'Not your franchise.';
  const L = LICENCES[kind];
  const gross = franchiseGross(s, fr);
  if (gross < L.minGross) return `Needs $${Math.round(L.minGross / 1e6)}M+ at the box office first.`;
  if (fr.licences?.some((l) => l.kind === kind && (kind !== 'game' || !l.live))) return kind === 'game' ? 'A game is already in development.' : 'Already signed.';
  const cost = L.cost(gross);
  if (s.studio.cash < cost) return 'Not enough cash.';
  pay(s, s.studio.id, -cost, 'Brand licensing');
  (fr.licences ??= []).push({ kind, signedT: s.t, readyT: s.t + L.turns, live: false, earned: -cost });
  return null;
}

/** License a one-off hit: it becomes a franchise you can build on. */
export function licenceFilm(s: GameState, filmId: string, kind: LicenceKind): string | null {
  const f = s.films.find((x) => x.id === filmId);
  if (!f || f.studioId !== s.studio.id) return 'Not your film.';
  if (franchiseGross(s, { filmIds: [f.id] } as Franchise) < LICENCES[kind].minGross) return `Needs $${Math.round(LICENCES[kind].minGross / 1e6)}M+ at the box office first.`;
  return signLicence(s, ensureFranchise(s, f).id, kind);
}

export function advanceMerch(s: GameState) {
  for (const fr of s.franchises) {
    if (fr.studioId !== s.studio.id) continue;
    for (const l of fr.licences ?? []) {
      if (l.live || l.readyT !== s.t) continue;
      l.live = true;
      if (l.kind === 'game') {
        const r = makeRng(s.seed, fr.id, 'game', l.signedT);
        const films = franchiseFilms(s, fr);
        const q = films.length ? films.reduce((a, f) => a + (f.audience ?? 60), 0) / films.length : 60;
        const mult = clamp(Math.exp(r.normal(0, 0.55)) * (0.4 + fr.heat) * (q / 65), 0.2, 5);
        const cost = -l.earned;
        const amount = Math.round(cost * 1.3 * mult);
        l.earned += amount;
        pay(s, s.studio.id, amount, 'Brand licensing');
        if (mult > 1.3) fr.heat += 0.15;
        const verdict = mult > 2 ? 'a smash' : mult > 1 ? 'a solid seller' : 'a disappointment';
        msg(s, 'news', `${fr.name}: the game is out`, `It's ${verdict}. Your share: $${(amount / 1e6).toFixed(1)}M.`, { link: '/ip' });
        headline(`${fr.name} video game is ${verdict}`);
      } else {
        msg(s, 'news', `${fr.name}: ${LICENCES[l.kind].name} launches`, l.kind === 'park' ? 'Gates open to huge crowds.' : 'Shelves are stocked worldwide.', { link: '/ip' });
      }
    }
    const merch = merchPerYear(s, fr) / 26;
    const park = parkPerYear(s, fr) / 26;
    if (merch > 1000) { pay(s, s.studio.id, merch, 'Merchandise'); fr.merchTotal = (fr.merchTotal ?? 0) + merch; }
    if (park > 1000) {
      pay(s, s.studio.id, park, 'Brand licensing');
      const l = fr.licences!.find((x) => x.kind === 'park')!;
      l.earned += park;
      fr.heat += 0.0025; // offsets half the usual cooling
    }
    for (const l of fr.licences ?? []) if (l.kind === 'toys' && l.live) l.earned += merch * (0.6 / 1.6);
  }
  for (const f of s.films) {
    if (f.studioId !== s.studio.id) continue;
    const m = standaloneMerch(s, f) / 26;
    if (m > 1000) pay(s, s.studio.id, m, 'Merchandise');
  }
}

/** Lifetime merch + licensing for the IP page. */
export const merchYear = (s: GameState) => {
  const L = s.ledger[yearOf(s.t)] ?? {};
  return (L.Merchandise ?? 0) + Math.max(0, L['Brand licensing'] ?? 0);
};
