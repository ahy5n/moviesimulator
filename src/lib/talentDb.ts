// Read-only talent database plus the per-save career layer.
import { ageAt } from './calendar';
import { clamp } from './rng';
import { feeFor, overallOf } from './ratings';
import { GENRES, MARKETS, type Genre, type GameState, type Market, type Talent, type TalentKind } from './types';

/** On-disk compact format, keeps the JSON small. */
export type CompactPerson = {
  i: string; d?: number; n: string; f?: 1; k: TalentKind; b: string; g: 'M' | 'F' | 'X'; c: string;
  a: number[]; // star, acting, box, range, chem, rel, exp
  ge: number[]; re: number[]; tr: string[]; p: number; fee: number; bd: number;
  cr: [string, number, number][]; dy?: number;
};
export type DbFile = { v: 1; source: 'tmdb' | 'demo'; generated: string; people: CompactPerson[] };

export function toCompact(t: Talent): CompactPerson {
  const a = t.attrs;
  return {
    i: t.id, d: t.tmdbId, n: t.name, f: t.isFictional ? 1 : undefined, k: t.kind, b: t.birthDate, g: t.gender, c: t.nationality,
    a: [a.starPower, a.acting, a.boxOffice, a.range, a.chemistry, a.reliability, a.experience],
    ge: GENRES.map((g) => t.genres[g]), re: MARKETS.map((m) => t.regional[m]), tr: t.traits, p: t.potential,
    fee: t.fee, bd: t.backendDemand, cr: t.credits.map((c) => [c.title, c.year, c.billing]), dy: t.debutYear,
  };
}

export function fromCompact(c: CompactPerson): Talent {
  const [starPower, acting, boxOffice, range, chemistry, reliability, experience] = c.a;
  const base = { starPower, acting, boxOffice, range, chemistry, reliability, experience };
  const genres = {} as Record<Genre, number>;
  GENRES.forEach((g, i) => (genres[g] = c.ge[i]));
  const regional = {} as Record<Market, number>;
  MARKETS.forEach((m, i) => (regional[m] = c.re[i]));
  return {
    id: c.i, tmdbId: c.d, name: c.n, isFictional: !!c.f, kind: c.k, birthDate: c.b, gender: c.g, nationality: c.c,
    attrs: { ...base, overall: overallOf(base, c.k) }, genres, regional, traits: c.tr as Talent['traits'], potential: c.p,
    fee: c.fee, backendDemand: c.bd, credits: c.cr.map(([title, year, billing]) => ({ title, year, billing })), debutYear: c.dy,
  };
}

export type TalentDB = { source: 'tmdb' | 'demo'; all: Talent[]; byId: Map<string, Talent>; costars: Map<string, number> };

let DB: TalentDB | null = null;
export const setDB = (db: TalentDB) => { DB = db; cache.clear(); };
export const getDB = () => { if (!DB) throw new Error('Talent database not loaded'); return DB; };
export const hasDB = () => !!DB;

export function buildDB(files: DbFile[], costars: [string, string, number][] = []): TalentDB {
  const all: Talent[] = [];
  for (const f of files) for (const p of f.people) all.push(fromCompact(p));
  const byId = new Map(all.map((t) => [t.id, t]));
  const cs = new Map<string, number>();
  for (const [a, b, n] of costars) cs.set(pairKey(a, b), n);
  return { source: files[0]?.source ?? 'demo', all, byId, costars: cs };
}
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Browser loader. Fetches the JSON files shipped in /public/data. */
export async function loadDBBrowser(onProgress?: (p: number) => void): Promise<TalentDB> {
  if (DB) return DB;
  const names = ['actors', 'directors', 'writers', 'crew'];
  const files: DbFile[] = [];
  let i = 0;
  for (const n of names) {
    const res = await fetch(`/data/${n}.json`);
    if (res.ok) files.push(await res.json());
    onProgress?.(++i / (names.length + 1));
  }
  let costars: [string, string, number][] = [];
  try { const r = await fetch('/data/costars.json'); if (r.ok) costars = await r.json(); } catch { /* optional */ }
  onProgress?.(1);
  const db = buildDB(files, costars);
  setDB(db);
  return db;
}

const cache = new Map<string, { t: number; ov: unknown; val: Talent }>();

export function baseTalent(state: Pick<GameState, 'newTalent'>, id: string): Talent | undefined {
  return getDB().byId.get(id) ?? state.newTalent.find((x) => x.id === id);
}

const ACTION_GENRES: Genre[] = ['Action', 'Superhero', 'War', 'Western'];

/** Talent as of the current turn: ageing curves, youth growth and career overrides applied. */
export function talent(state: Pick<GameState, 'newTalent' | 'talentOverrides' | 't'>, id: string): Talent | undefined {
  const base = baseTalent(state, id);
  if (!base) return undefined;
  const ov = state.talentOverrides[id];
  const hit = cache.get(id);
  if (hit && hit.t === state.t && hit.ov === ov) return hit.val;

  const age = ageAt(base.birthDate, state.t);
  const startAge = ageAt(base.birthDate, 0);
  const yrs = state.t / 26;
  const a = { ...base.attrs };
  const genres = { ...base.genres };

  // Youth growth towards potential (reaches it around age 30).
  if (base.potential > base.attrs.overall && startAge < 30) {
    const span = Math.max(1, 30 - startAge);
    const g = (base.potential - base.attrs.overall) * Math.min(1, yrs / span) * 1.15;
    a.acting += g; a.starPower += g * 0.9; a.boxOffice += g * 0.8; a.range += g * 0.4;
  }
  // Ageing curves: star power lasts, action ratings fade after 50.
  const over = (from: number) => Math.max(0, age - Math.max(from, startAge));
  a.starPower -= over(62) * 1.2;
  a.boxOffice -= over(56) * 1.0;
  a.acting -= over(68) * 0.6;
  for (const g of ACTION_GENRES) genres[g] = clamp(genres[g] - over(50) * 1.5, 25, 99);

  if (ov) { a.starPower += ov.star ?? 0; a.acting += ov.acting ?? 0; a.boxOffice += ov.box ?? 0; }
  for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] = clamp(Math.round(a[k]), 1, 99);
  a.overall = overallOf(a, base.kind);
  const fee = Math.round(feeFor(a.starPower, a.boxOffice, base.kind) * (ov?.feeMult ?? 1) / 10_000) * 10_000;
  const credits = ov?.credits ? [...ov.credits, ...base.credits] : base.credits;
  const val: Talent = { ...base, attrs: a, genres, fee: Math.max(20_000, fee), credits, backendDemand: base.kind === 'actor' && a.starPower >= 70 ? Math.round(((a.starPower - 70) / 30) * 10 + 2) : 0 };
  cache.set(id, { t: state.t, ov, val });
  return val;
}

export function allTalent(state: GameState, kind?: TalentKind): Talent[] {
  const out: Talent[] = [];
  const src = [...getDB().all, ...state.newTalent];
  for (const b of src) {
    if (kind && b.kind !== kind) continue;
    if (state.talentOverrides[b.id]?.retired) continue;
    const t = talent(state, b.id);
    if (t) out.push(t);
  }
  return out;
}

export const bestGenre = (t: Talent): Genre => GENRES.reduce((b, g) => (t.genres[g] > t.genres[b] ? g : b), GENRES[0]);
export const genreFit = (t: Talent, g: Genre, g2?: Genre) => (g2 ? 0.65 * t.genres[g] + 0.35 * t.genres[g2] : t.genres[g]);

export function isAvailable(state: GameState, id: string, fromT = state.t): boolean {
  const c = state.commitments[id];
  const ov = state.talentOverrides[id];
  if (ov?.retired) return false;
  if (ov?.breakUntil && ov.breakUntil > fromT) return false;
  return !c || c.until <= fromT;
}
export function availableFrom(state: GameState, id: string): number {
  const c = state.commitments[id];
  const ov = state.talentOverrides[id];
  return Math.max(state.t, c?.until ?? 0, ov?.breakUntil ?? 0);
}

export function override(state: GameState, id: string) {
  return (state.talentOverrides[id] = { ...(state.talentOverrides[id] ?? {}) });
}
