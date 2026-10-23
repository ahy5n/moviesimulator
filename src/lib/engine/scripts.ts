// Script marketplace, build-your-own development, IP rights, sequels and cinematic universes.
import { yearOf } from '../calendar';
import { TIERS, tierInfo } from '../constants';
import { makeRng, clamp, type RNG } from '../rng';
import { allTalent, talent } from '../talentDb';
import { genIPTitle, genLogline, genTitle } from '../titles';
import { GENRES, type BudgetTier, type Film, type Franchise, type GameState, type Genre, type IP, type Script, type Tone } from '../types';
import { filmById, msg, nextId, pay, filmProfit } from './util';

const COMBOS: [Genre, Genre][] = [
  ['Action', 'Comedy'], ['Sci-Fi', 'Horror'], ['Romance', 'Comedy'], ['Crime', 'Thriller'], ['Action', 'Sci-Fi'],
  ['Fantasy', 'Family'], ['Drama', 'Romance'], ['War', 'Drama'], ['Horror', 'Comedy'], ['Animation', 'Family'],
  ['Superhero', 'Action'], ['Musical', 'Romance'], ['Western', 'Action'], ['Thriller', 'Drama'], ['Sci-Fi', 'Thriller'],
];

const TIER_WEIGHTS: Record<BudgetTier, number> = { Micro: 2, Low: 3, Mid: 3, High: 1.6, Tentpole: 0.8 };

function pickTier(r: RNG, g: Genre): BudgetTier {
  const tiers = TIERS.map((x) => x.tier);
  return r.weighted(tiers, (t) => {
    let w = TIER_WEIGHTS[t];
    if ((g === 'Superhero' || g === 'Fantasy' || g === 'Animation') && (t === 'Micro' || t === 'Low')) w *= 0.15;
    if ((g === 'Superhero' || g === 'Animation') && (t === 'High' || t === 'Tentpole')) w *= 2.5;
    if ((g === 'Documentary' || g === 'Horror' || g === 'Drama') && (t === 'High' || t === 'Tentpole')) w *= 0.15;
    if (g === 'Documentary' && t === 'Micro') w *= 3;
    return w;
  });
}

export function budgetFor(r: RNG, tier: BudgetTier): number {
  const ti = tierInfo(tier);
  return Math.round(r.range(ti.min * 1.05, ti.max * 0.9) / 1e5) * 1e5;
}

/** Script price scales with quality and budget. */
export const scriptPrice = (quality: number, budget: number) =>
  Math.round((60_000 + budget * 0.012 * (0.5 + quality / 100)) * (0.6 + Math.pow(quality / 70, 2)) / 10_000) * 10_000;

function randomWriter(s: GameState, r: RNG, quality: number) {
  const writers = allTalent(s, 'writer');
  const near = writers.filter((w) => Math.abs(w.attrs.acting - quality) < 12);
  return (near.length ? r.pick(near) : r.pick(writers))?.id ?? '';
}

export function genScript(s: GameState, r: RNG, source: Script['source'] = 'market'): Script {
  let g: Genre, g2: Genre | undefined;
  if (r.chance(0.45)) [g, g2] = r.pick(COMBOS);
  else { g = r.weighted(GENRES, (x) => s.genreHeat[x] * (x === 'Documentary' || x === 'Western' || x === 'Musical' ? 0.4 : 1)); }
  const tone: Tone = r.pick(['light', 'balanced', 'dark'] as const);
  const tier = pickTier(r, g);
  const suggestedBudget = budgetFor(r, tier);
  const quality = clamp(Math.round(r.normal(58, 14)), 15, 97);
  const spread = r.int(14, 22);
  const low = clamp(Math.round(quality - r.range(0.2, 0.8) * spread), 5, 99);
  const leads = g === 'Documentary' ? 0 : g === 'Romance' || r.chance(0.35) ? 2 : 1;
  const supports = g === 'Documentary' ? 0 : r.int(1, 3);
  return {
    id: nextId(s, 's'), title: genTitle(r, g, g2), logline: genLogline(r, g, g2, tone),
    primaryGenre: g, secondaryGenre: g2, tone, quality, low, high: clamp(low + spread, 5, 99), coverage: false,
    suggestedBudget, tier, leads, supports, writerId: randomWriter(s, r, quality),
    price: scriptPrice(quality, suggestedBudget), expires: s.t + r.int(2, 4), source,
  };
}

/** Refresh the marketplace each turn: expire old scripts and top up to ~10. */
export function refreshMarketplace(s: GameState) {
  const r = makeRng(s.seed, s.t, 'market');
  s.scripts = s.scripts.filter((x) => x.expires > s.t);
  while (s.scripts.length < 10) s.scripts.push(genScript(s, r));
}

export const coverageCost = (sc: Script) => Math.round((25_000 + sc.suggestedBudget * 0.0012) / 5_000) * 5_000;

export function buyCoverage(s: GameState, scriptId: string) {
  const sc = s.scripts.find((x) => x.id === scriptId);
  if (!sc || sc.coverage) return;
  pay(s, s.studio.id, -coverageCost(sc), 'Development');
  const r = makeRng(s.seed, 'cov', sc.id);
  const w = r.int(3, 6);
  sc.low = clamp(sc.quality - r.int(0, w), 1, 99);
  sc.high = clamp(sc.low + w, 1, 99);
  sc.coverage = true;
}

function blankFilm(s: GameState, sc: Script, studioId: string): Film {
  return {
    id: nextId(s, 'f'), title: sc.title, studioId, logline: sc.logline,
    primaryGenre: sc.primaryGenre, secondaryGenre: sc.secondaryGenre, tone: sc.tone,
    stage: 'development', stageTurnsLeft: 1, createdT: s.t,
    budget: sc.suggestedBudget, tier: sc.tier, suggestedBudget: sc.suggestedBudget, marketing: 0,
    scriptQuality: sc.quality, scriptRange: sc.source === 'market' ? [sc.low, sc.high] : undefined, quality: 0, qualityKnown: false,
    leads: sc.leads, supports: sc.supports, cast: [], crew: { writer: { talentId: sc.writerId, fee: 0 } },
    weekly: [], byMarket: {}, gross: 0, studioRevenue: 0, otherRevenue: 0, spent: 0, backendPaid: 0,
    awards: [], fyc: {}, events: [], luck: 1, buzz: 0, inTheatres: false, weeksOut: 0,
    franchiseId: sc.franchiseId, sequelOf: sc.sequelOf, ipId: sc.ipId,
  };
}

export function buyScript(s: GameState, scriptId: string, studioId = s.studio.id): Film | undefined {
  const i = s.scripts.findIndex((x) => x.id === scriptId);
  if (i < 0) return;
  const sc = s.scripts[i];
  s.scripts.splice(i, 1);
  const f = blankFilm(s, sc, studioId);
  f.spent += sc.price;
  pay(s, studioId, -sc.price, 'Scripts');
  s.films.push(f);
  return f;
}

/** Build Your Own: hire a writer for N turns; quality is fixed when the draft is delivered. */
export function commissionScript(s: GameState, o: {
  genre: Genre; genre2?: Genre; tone: Tone; tier: BudgetTier; premise: string; writerId: string; turns: number; title?: string;
  ipId?: string; sequelOf?: string; franchiseId?: string;
}): Film | undefined {
  const w = talent(s, o.writerId);
  if (!w) return;
  const r = makeRng(s.seed, s.t, 'commission', o.writerId);
  const writerFee = Math.round(w.fee * (0.7 + o.turns * 0.15) / 10_000) * 10_000;
  const sug = budgetFor(r, o.tier);
  const sc: Script = {
    id: nextId(s, 's'), title: o.title || genTitle(r, o.genre, o.genre2), logline: o.premise, primaryGenre: o.genre,
    secondaryGenre: o.genre2, tone: o.tone, quality: 0, low: 0, high: 0, coverage: false, suggestedBudget: sug, tier: o.tier,
    leads: o.genre === 'Documentary' ? 0 : o.genre === 'Romance' ? 2 : 1, supports: o.genre === 'Documentary' ? 0 : 2,
    writerId: o.writerId, price: 0, expires: 0, source: o.ipId ? 'ip' : o.sequelOf ? 'sequel' : 'original',
    ipId: o.ipId, sequelOf: o.sequelOf, franchiseId: o.franchiseId,
  };
  const f = blankFilm(s, sc, s.studio.id);
  f.stage = 'development';
  f.stageTurnsLeft = o.turns;
  // Writer skill + genre fit + time spent, with noise. Revealed as a range at delivery.
  const fit = 0.65 * w.genres[o.genre] + 0.35 * (o.genre2 ? w.genres[o.genre2] : w.genres[o.genre]);
  f.scriptQuality = clamp(Math.round(0.55 * w.attrs.acting + 0.25 * fit + o.turns * 3.5 + r.normal(0, 7) + 4), 10, 98);
  f.crew.writer = { talentId: o.writerId, fee: writerFee };
  f.spent += writerFee;
  pay(s, s.studio.id, -writerFee, 'Development');
  setCommit(s, o.writerId, f.id, s.studio.id, s.t + o.turns);
  if (o.ipId) {
    const ip = s.ips.find((x) => x.id === o.ipId);
    if (ip) { ip.used = true; f.ipBuzz = ip.buzz; }
  }
  if (o.sequelOf) {
    const orig = s.films.find((x) => x.id === o.sequelOf);
    if (orig) {
      const fr = ensureFranchise(s, orig);
      f.franchiseId = fr.id;
      fr.filmIds.push(f.id);
      f.leads = orig.leads; f.supports = orig.supports;
    }
  }
  s.films.push(f);
  return f;
}

export function setCommit(s: GameState, talentId: string, filmId: string, studioId: string, until: number) {
  const c = s.commitments[talentId];
  s.commitments[talentId] = { filmId, studioId, until: Math.max(until, c?.until ?? 0) };
}

// ---------- IP ----------

const IP_KINDS: IP['kind'][] = ['Novel', 'Video game', 'Comic', 'Remake'];
const IP_GENRES: Record<IP['kind'], Genre[]> = {
  Novel: ['Drama', 'Thriller', 'Fantasy', 'Romance', 'Crime', 'Sci-Fi', 'Horror'],
  'Video game': ['Action', 'Sci-Fi', 'Fantasy', 'Horror', 'Animation'],
  Comic: ['Superhero', 'Action', 'Sci-Fi', 'Comedy'],
  Remake: ['Horror', 'Comedy', 'Action', 'Musical', 'Western', 'Family', 'Crime'],
};

export function refreshIPs(s: GameState) {
  const r = makeRng(s.seed, yearOf(s.t), 'ip');
  s.ips = s.ips.filter((x) => x.owner);
  for (let i = 0; i < 8; i++) {
    const kind = r.pick(IP_KINDS);
    const g = r.pick(IP_GENRES[kind]);
    const g2 = r.chance(0.4) ? r.pick(GENRES.filter((x) => x !== g)) : undefined;
    const buzz = clamp(Math.round(r.normal(55, 18)), 10, 98);
    s.ips.push({ id: nextId(s, 'ip'), title: genIPTitle(r, kind, g), kind, genres: [g, g2], buzz,
      price: Math.round((0.4e6 + Math.pow(buzz / 10, 3) * 25_000) / 50_000) * 50_000 });
  }
}

export function buyIP(s: GameState, ipId: string, studioId = s.studio.id): boolean {
  const ip = s.ips.find((x) => x.id === ipId);
  if (!ip || ip.owner) return false;
  ip.owner = studioId;
  pay(s, studioId, -ip.price, 'IP rights');
  return true;
}

// ---------- Franchises / sequels / universes ----------

export function franchiseOf(s: GameState, f: Film): Franchise | undefined {
  return f.franchiseId ? s.franchises.find((x) => x.id === f.franchiseId) : undefined;
}

export function sequelEligible(s: GameState, f: Film): boolean {
  if (f.studioId !== s.studio.id || (f.stage !== 'released' && f.stage !== 'library')) return false;
  if (s.films.some((x) => x.sequelOf === f.id)) return false;
  return filmProfit(f) > 0 && f.gross > 0 || (f.audience ?? 0) >= 75;
}

export function ensureFranchise(s: GameState, f: Film): Franchise {
  let fr = franchiseOf(s, f);
  if (!fr) {
    fr = { id: nextId(s, 'fr'), name: f.title.replace(/\s*\d+$/, ''), studioId: f.studioId, filmIds: [f.id], heat: 0.2, fatigue: 0, isUniverse: false };
    s.franchises.push(fr);
    f.franchiseId = fr.id;
  }
  return fr;
}

export function sequelTitle(base: string, n: number): string {
  const root = base.replace(/\s+(\d+|II|III|IV)$/, '').replace(/:.*$/, '');
  return `${root} ${n}`;
}

export function linkToUniverse(s: GameState, filmId: string, franchiseId: string) {
  const f = filmById(s, filmId);
  const fr = s.franchises.find((x) => x.id === franchiseId);
  if (!f || !fr || fr.studioId !== s.studio.id) return;
  const old = franchiseOf(s, f);
  if (old && old.id !== fr.id) old.filmIds = old.filmIds.filter((x) => x !== f.id);
  f.franchiseId = fr.id;
  if (!fr.filmIds.includes(f.id)) fr.filmIds.push(f.id);
  fr.isUniverse = true;
}

export function createUniverse(s: GameState, name: string): Franchise {
  const fr: Franchise = { id: nextId(s, 'fr'), name, studioId: s.studio.id, filmIds: [], heat: 0.1, fatigue: 0, isUniverse: true };
  s.franchises.push(fr);
  msg(s, 'news', `${name} cinematic universe announced`, 'The trades are buzzing about your shared universe plans.');
  return fr;
}

/** Opening multiplier from franchise heat (hits) and fatigue (too many releases). */
export function franchiseMult(s: GameState, f: Film): number {
  const fr = franchiseOf(s, f);
  let m = 1;
  if (fr) m *= clamp(1 + fr.heat * 0.6 - fr.fatigue, 0.55, 1.9);
  if (f.ipBuzz) m *= 1 + f.ipBuzz / 260;
  return m;
}

export function decayFranchises(s: GameState) {
  for (const fr of s.franchises) {
    fr.fatigue = Math.max(0, fr.fatigue - 0.02);
    fr.heat = Math.max(0, fr.heat - 0.005);
  }
}
