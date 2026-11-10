// Talent agencies (fictional): every actor, director and writer is repped by one.
// Treat an agency's clients well and it sends you packages; burn it and it freezes you out.
import { formatDate } from '../calendar';
import { makeRng, clamp } from '../rng';
import { bestGenre, genreFit, getDB, isAvailable, talent } from '../talentDb';
import { genLogline, genTitle } from '../titles';
import { tierOf } from '../constants';
import type { Film, GameState, Package, Talent } from '../types';
import { askingFee, sign } from './negotiation';
import { budgetFor } from './scripts';
import { headline, msg, nextId, spend } from './util';

export const AGENCIES = [
  { id: 'halcyon', name: 'Halcyon Artists', blurb: 'The big one. Stars and prestige directors.' },
  { id: 'northstar', name: 'North Star Talent', blurb: 'Packages blockbusters. Aggressive on fees.' },
  { id: 'vantage', name: 'Vantage Creative', blurb: 'Writers and showrunners first.' },
  { id: 'brightwater', name: 'Brightwater Agency', blurb: 'International talent across every language.' },
  { id: 'kestrel', name: 'Kestrel & Lowe', blurb: 'Boutique. Indie darlings and rising names.' },
] as const;
export type AgencyId = (typeof AGENCIES)[number]['id'];
export const agencyName = (id: string) => AGENCIES.find((a) => a.id === id)?.name ?? id;

/** Deterministic: everyone keeps the same agency for the whole game. */
export function agencyOf(t: Pick<Talent, 'id' | 'attrs' | 'nationality' | 'kind'>): AgencyId {
  let h = 0;
  for (const c of t.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  if (t.attrs.overall >= 78 && h % 3 === 0) return 'halcyon';
  if (t.kind === 'writer' && h % 4 === 0) return 'vantage';
  if (!['US', 'GB', 'CA', 'AU', 'IE'].includes(t.nationality) && h % 3 === 1) return 'brightwater';
  if (t.attrs.overall < 55 && h % 3 === 2) return 'kestrel';
  return AGENCIES[h % AGENCIES.length].id;
}

export const agencyRel = (s: GameState, id: string) => s.agencies?.[id]?.rel ?? 0;
export const blacklisted = (s: GameState, id: string) => (s.agencies?.[id]?.blacklistUntil ?? -1) > s.t;

export function agencyBlock(s: GameState, t: Talent): string | null {
  const a = agencyOf(t);
  const st = s.agencies?.[a];
  return st?.blacklistUntil && st.blacklistUntil > s.t ? `${agencyName(a)} has frozen you out until ${formatDate(st.blacklistUntil)}. ${t.name} won't take your call.` : null;
}

/** Good friends at an agency shave 5% off their clients' fees. */
export const agencyFeeMult = (s: GameState, t: Talent, studioId: string) => (studioId === s.studio.id && agencyRel(s, agencyOf(t)) >= 4 ? 0.95 : 1);

/** Nudge your standing with someone's agency. Only the player has agency relationships. */
export function agencyNudge(s: GameState, talentId: string, delta: number, why?: string) {
  const t = talent(s, talentId);
  if (!t) return;
  const a = agencyOf(t);
  const st = ((s.agencies ??= {})[a] ??= { rel: 0 });
  st.rel = clamp(st.rel + delta, -10, 10);
  if (st.rel <= -5 && !(st.blacklistUntil && st.blacklistUntil > s.t)) {
    st.blacklistUntil = s.t + 8;
    st.rel = -2;
    msg(s, 'agent', `${agencyName(a)} freezes you out`, `${why ?? 'You’ve burned too many of their clients.'} None of their clients will talk to you until ${formatDate(st.blacklistUntil)}.`, { link: '/agencies' });
    headline(`${agencyName(a)} blacklists ${s.studio.name}`);
  }
}

function pickClient(s: GameState, r: ReturnType<typeof makeRng>, agency: AgencyId, kind: Talent['kind'], score: (t: Talent) => number, exclude: Set<string>): Talent | undefined {
  const all = getDB().all;
  let best: Talent | undefined, bestScore = -1e9;
  for (let i = 0; i < 400; i++) {
    const b = all[Math.floor(r() * all.length)];
    if (!b || b.kind !== kind || exclude.has(b.id) || agencyOf(b) !== agency || !isAvailable(s, b.id)) continue;
    const t = talent(s, b.id)!;
    const sc = score(t) + r.range(0, 8);
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  return best;
}

/** A ready-made package: script, director and stars from one agency, at a discount. */
function buildPackage(s: GameState, agency: AgencyId, r: ReturnType<typeof makeRng>): Package | undefined {
  const used = new Set<string>();
  const dir = pickClient(s, r, agency, 'director', (t) => t.attrs.overall, used);
  if (!dir) return;
  used.add(dir.id);
  const g = bestGenre(dir);
  const writer = pickClient(s, r, agency, 'writer', (t) => 0.6 * t.attrs.acting + 0.4 * genreFit(t, g), used);
  if (!writer) return;
  used.add(writer.id);
  const nLeads = g === 'Documentary' ? 0 : r.chance(0.4) ? 2 : 1;
  const actors: Talent[] = [];
  for (let i = 0; i < nLeads; i++) {
    const a = pickClient(s, r, agency, 'actor', (t) => 0.5 * genreFit(t, g) + 0.3 * t.attrs.overall + 0.2 * t.attrs.starPower, used);
    if (a) { actors.push(a); used.add(a.id); }
  }
  const tier = tierOf(Math.max(dir.fee, ...actors.map((a) => a.fee)) * 12);
  const budget = budgetFor(r, tier);
  const quality = clamp(Math.round(0.55 * writer.attrs.acting + 0.25 * genreFit(writer, g) + 10 + r.normal(0, 6)), 15, 95);
  const dummy = { tier, budget, sequelOf: undefined, studioId: s.studio.id, cast: [], crew: {} } as unknown as Film;
  const discount = 0.15 + Math.max(0, agencyRel(s, agency)) * 0.01;
  const fees = Math.round((writer.fee * 0.9 + askingFee(s, dir, dummy, 'director') + actors.reduce((a, t) => a + askingFee(s, t, dummy, 'lead'), 0)) * (1 - discount) / 1e4) * 1e4;
  return {
    id: nextId(s, 'pk'), agencyId: agency, expires: s.t + 4, title: genTitle(r, g), logline: genLogline(r, g, undefined, 'balanced'), primaryGenre: g, tone: 'balanced',
    language: dir.languages[0] ?? 'en', tier, budget, scriptQuality: quality, writerId: writer.id, directorId: dir.id, actorIds: actors.map((a) => a.id), fees, discount,
  };
}

export function advanceAgencies(s: GameState) {
  const r = makeRng(s.seed, s.t, 'agency');
  s.packages = (s.packages ?? []).filter((p) => p.expires > s.t);
  for (const a of AGENCIES) {
    const rel = agencyRel(s, a.id);
    if (blacklisted(s, a.id) || rel < -1 || s.packages.some((p) => p.agencyId === a.id)) continue;
    if (!r.chance(0.04 + Math.max(0, rel) * 0.012)) continue;
    const p = buildPackage(s, a.id, r);
    if (!p) continue;
    s.packages.push(p);
    const dir = talent(s, p.directorId);
    msg(s, 'agent', `${a.name} has a package for you`, `"${p.title}": ${dir?.name} directing${p.actorIds.length ? `, ${p.actorIds.map((id) => talent(s, id)?.name).join(' and ')} starring` : ''}. ${Math.round(p.discount * 100)}% off everyone's fees.`, { link: '/agencies' });
  }
  // Relationships drift back toward neutral.
  for (const st of Object.values(s.agencies ?? {})) st.rel *= 0.99;
}

export function packageIssues(s: GameState, p: Package): string[] {
  const out: string[] = [];
  for (const id of [p.writerId, p.directorId, ...p.actorIds]) if (!isAvailable(s, id)) out.push(`${talent(s, id)?.name} is no longer available.`);
  if (s.studio.cash < p.fees) out.push('Not enough cash for the fees.');
  return out;
}

export function acceptPackage(s: GameState, packageId: string): Film | undefined {
  const p = s.packages?.find((x) => x.id === packageId);
  if (!p || packageIssues(s, p).length) return;
  const f: Film = {
    id: nextId(s, 'f'), title: p.title, studioId: s.studio.id, logline: p.logline, primaryGenre: p.primaryGenre, secondaryGenre: p.secondaryGenre, tone: p.tone, language: p.language,
    stage: 'preproduction', stageTurnsLeft: 0, createdT: s.t, budget: p.budget, tier: p.tier, suggestedBudget: p.budget, marketing: 0,
    scriptQuality: p.scriptQuality, scriptRange: [clamp(p.scriptQuality - 5), clamp(p.scriptQuality + 5)], quality: 0, qualityKnown: false,
    leads: Math.max(1, p.actorIds.length), supports: p.primaryGenre === 'Documentary' ? 0 : 2, cast: [], crew: {},
    weekly: [], byMarket: {}, gross: 0, studioRevenue: 0, otherRevenue: 0, spent: 0, backendPaid: 0,
    awards: [], fyc: {}, events: [`Packaged by ${agencyName(p.agencyId)}.`], luck: 1, buzz: 0.05, inTheatres: false, weeksOut: 0,
  };
  if (!p.actorIds.length) f.leads = 0;
  s.films.push(f);
  const share = 1 - p.discount;
  const w = talent(s, p.writerId)!;
  f.crew.writer = { talentId: w.id, fee: Math.round(w.fee * 0.9 * share) };
  spend(s, f, f.crew.writer.fee, 'Talent');
  const d = talent(s, p.directorId)!;
  sign(s, f, d, 'director', { fee: Math.round(askingFee(s, d, f, 'director') * share), backend: 0, billing: 0, options: 1 });
  for (const id of p.actorIds) {
    const t = talent(s, id)!;
    sign(s, f, t, 'lead', { fee: Math.round(askingFee(s, t, f, 'lead') * share), backend: t.backendDemand, billing: 1, options: 1 });
  }
  s.packages = s.packages!.filter((x) => x.id !== packageId);
  agencyNudge(s, p.directorId, 1);
  return f;
}
