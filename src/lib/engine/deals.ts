// Overall and first-look deals: keep directors and showrunners close, or watch rivals lock them up.
import { formatDate } from '../calendar';
import { makeRng, clamp } from '../rng';
import { bestGenre, getDB, isAvailable, talent } from '../talentDb';
import { genLogline, genTitle } from '../titles';
import type { Deal, DealKind, GameState, Script, Talent } from '../types';
import { addLoyalty, loyaltyTo } from './loyalty';
import { budgetFor, scriptPrice } from './scripts';
import { headline, msg, nextId, pay, studioById } from './util';

export const DEAL_INFO: Record<DealKind, { name: string; blurb: string; retainer: number; discount: number; pitchEvery: [number, number] }> = {
  'first-look': { name: 'First-look deal', blurb: 'You see their projects first and get 15% off their fee. They can still work elsewhere.', retainer: 0.35, discount: 0.15, pitchEvery: [12, 18] },
  overall: { name: 'Overall deal', blurb: 'Exclusive: they only work for you, at 30% off, and pitch you a project every few months.', retainer: 0.9, discount: 0.3, pitchEvery: [8, 12] },
};
const MAX_RIVAL_DEALS = 3;

export const dealsList = (s: GameState) => (s.deals ??= []);
export const dealFor = (s: GameState, talentId: string) => (s.deals ?? []).find((d) => d.talentId === talentId && d.fromT <= s.t && s.t < d.untilT);
export const canHaveDeal = (t: Talent) => t.kind === 'director' || t.kind === 'writer';

/** Fee multiplier for a studio hiring this person: cheaper under your own deal, dearer under a rival's first-look. */
export function dealFeeMult(s: GameState, talentId: string, studioId: string): number {
  const d = dealFor(s, talentId);
  if (!d) return 1;
  if (d.studioId === studioId) return 1 - DEAL_INFO[d.kind].discount;
  return d.kind === 'first-look' ? 1.2 : 1;
}

/** Why a studio can't hire someone: they're exclusive to a rival. */
export function dealBlock(s: GameState, talentId: string, studioId: string): string | null {
  const d = dealFor(s, talentId);
  if (!d || d.kind !== 'overall' || d.studioId === studioId) return null;
  return `Exclusive to ${studioById(s, d.studioId)?.name ?? 'another studio'} on an overall deal until ${formatDate(d.untilT)}.`;
}

export const retainerPerTurn = (t: Talent, kind: DealKind) => Math.round((t.fee * DEAL_INFO[kind].retainer) / 26 / 1000) * 1000;

/** Would they sign with you? Prestige, history together and your reputation all help. */
export function dealWillingness(s: GameState, t: Talent, kind: DealKind): { ok: boolean; score: number; reason: string } {
  const loyal = loyaltyTo(s, t.id, s.studio.id).total;
  const score = s.studio.prestige * 0.6 + loyal * 6 + (s.producer?.reputation ?? 0) * 1.5 + (t.traits.includes('Loyal') ? 8 : 0)
    - t.attrs.overall * 0.5 - (kind === 'overall' ? 8 : 0);
  const ok = score >= 8;
  const reason = ok ? 'Their agent says yes in principle.'
    : loyal < 2 ? 'They barely know you. Make a film together first, or grow your prestige.'
    : 'They want a bigger, more prestigious studio before tying themselves down.';
  return { ok, score, reason };
}

export function signDeal(s: GameState, talentId: string, kind: DealKind, years: number): string | null {
  const t = talent(s, talentId);
  if (!t || !canHaveDeal(t)) return 'Only directors and writers sign overall deals.';
  const cur = dealFor(s, talentId);
  if (cur && cur.studioId !== s.studio.id) return `Already on a deal with ${studioById(s, cur.studioId)?.name}.`;
  const w = dealWillingness(s, t, kind);
  if (!w.ok && !cur) return w.reason;
  const per = retainerPerTurn(t, kind);
  if (s.studio.cash < per * 26) return 'You need a year of retainer in the bank.';
  const r = makeRng(s.seed, s.t, 'deal', talentId);
  if (cur) {
    cur.kind = kind; cur.perTurn = per; cur.untilT = Math.max(cur.untilT, s.t) + years * 26; cur.poach = undefined;
  } else {
    dealsList(s).push({ id: nextId(s, 'dl'), talentId, studioId: s.studio.id, kind, fromT: s.t, untilT: s.t + years * 26, perTurn: per, nextPitchT: s.t + r.int(...DEAL_INFO[kind].pitchEvery) });
  }
  addLoyalty(s, talentId, s.studio.id, 1);
  headline(`${t.name} signs a ${DEAL_INFO[kind].name.toLowerCase()}`);
  return null;
}

export function endDeal(s: GameState, dealId: string) {
  const d = dealsList(s).find((x) => x.id === dealId);
  if (!d || d.studioId !== s.studio.id) return;
  // Buying out the rest of the term costs a quarter of what's left.
  const left = Math.max(0, d.untilT - s.t) * d.perTurn * 0.25;
  pay(s, s.studio.id, -left, 'Overall deals');
  d.untilT = s.t;
}

export function matchPoach(s: GameState, dealId: string): string | null {
  const d = dealsList(s).find((x) => x.id === dealId);
  if (!d?.poach) return 'No offer to match.';
  if (s.studio.cash < d.poach.raise) return 'Not enough cash.';
  pay(s, s.studio.id, -d.poach.raise, 'Overall deals');
  d.perTurn = Math.round(d.perTurn * 1.15);
  d.poach = undefined;
  addLoyalty(s, d.talentId, s.studio.id, 1.5);
  return null;
}

function rivalSign(s: GameState, studioId: string, t: Talent, years: number, r: ReturnType<typeof makeRng>) {
  const kind: DealKind = r.chance(0.6) ? 'overall' : 'first-look';
  dealsList(s).push({ id: nextId(s, 'dl'), talentId: t.id, studioId, kind, fromT: s.t, untilT: s.t + years * 26, perTurn: retainerPerTurn(t, kind), nextPitchT: 1e9 });
}

/** A project pitched by someone on a deal with you. It sits in your script market, reserved for you. */
function pitchProject(s: GameState, d: Deal, t: Talent, r: ReturnType<typeof makeRng>) {
  const g = bestGenre(t);
  const tier = r.pick(t.attrs.overall >= 75 ? ['Mid', 'High'] as const : ['Low', 'Mid'] as const);
  const sug = budgetFor(r, tier);
  const q = clamp(Math.round((t.kind === 'writer' ? 0.6 * t.attrs.acting : 0.45 * t.attrs.acting + 12) + 0.25 * t.genres[g] + r.normal(4, 6)), 20, 96);
  const writerId = t.kind === 'writer' ? t.id : (getDB().all.find((w) => w.kind === 'writer' && Math.abs(w.attrs.acting - q) < 6)?.id ?? t.id);
  const sc: Script = {
    id: nextId(s, 's'), title: genTitle(r, g), logline: genLogline(r, g, undefined, 'balanced'), primaryGenre: g, tone: 'balanced', language: t.languages[0] ?? 'en',
    quality: q, low: clamp(q - 6), high: clamp(q + 6), coverage: true, suggestedBudget: sug, tier,
    leads: g === 'Documentary' ? 0 : r.chance(0.4) ? 2 : 1, supports: g === 'Documentary' ? 0 : 2, writerId,
    price: d.kind === 'overall' ? 0 : Math.round(scriptPrice(q, sug) * 0.5 / 1e4) * 1e4, expires: s.t + 8, source: 'original', dealBy: t.id,
  };
  s.scripts.unshift(sc);
  msg(s, 'agent', `${t.name} pitches "${sc.title}"`, `A ${g.toLowerCase()} project from your ${DEAL_INFO[d.kind].name.toLowerCase()}. Coverage says ${sc.low}–${sc.high}.${sc.price ? ` Yours for ${(sc.price / 1e6).toFixed(1)}M.` : ' Free under the deal.'}${t.kind === 'director' ? ` ${t.name} wants to direct.` : ''}`, { link: '/scripts' });
}

export function advanceDeals(s: GameState) {
  const r = makeRng(s.seed, s.t, 'deals');
  for (const d of dealsList(s)) {
    const t = talent(s, d.talentId);
    if (!t || d.untilT <= s.t) continue;
    const mine = d.studioId === s.studio.id;
    pay(s, d.studioId, -d.perTurn, 'Overall deals');
    if (!mine) continue;
    if (s.t >= d.nextPitchT) {
      pitchProject(s, d, t, r);
      d.nextPitchT = s.t + r.int(...DEAL_INFO[d.kind].pitchEvery);
    }
    if (d.untilT - s.t === 3) msg(s, 'agent', `${t.name}'s deal is up soon`, `Their ${DEAL_INFO[d.kind].name.toLowerCase()} ends ${formatDate(d.untilT)}. Renew it on the Studio Lot or rivals will come calling.`, { link: '/lot' });
    // Rivals try to poach good people who aren't attached to you.
    if (d.poach && d.poach.expires <= s.t) {
      const rival = studioById(s, d.poach.studioId);
      d.untilT = s.t - 1; // gone now, without the usual end-of-deal handling below
      d.poach = undefined;
      if (rival) {
        rivalSign(s, rival.id, t, r.int(2, 4), r);
        msg(s, 'agent', `${rival.name} poach ${t.name}`, 'You didn’t match their offer. They’ve signed an overall deal across town.', { link: `/talent/${t.id}` });
        headline(`${rival.name} poach ${t.name}`);
      }
    } else if (!d.poach && t.attrs.overall >= 65 && d.untilT - s.t > 4 && loyaltyTo(s, t.id, s.studio.id).total < 5 && r.chance(0.02)) {
      const rival = r.pick(s.rivals.filter((x) => x.personality && x.personality.prestige > 0.3));
      if (rival) {
        d.poach = { studioId: rival.id, raise: Math.round(d.perTurn * 13 / 1e4) * 1e4, expires: s.t + 2 };
        msg(s, 'agent', `${rival.name} are courting ${t.name}`, `They've offered a richer deal. Match it with a ${(d.poach.raise / 1e6).toFixed(1)}M bonus by ${formatDate(d.poach.expires)} or lose them.`, { link: '/lot' });
      }
    }
  }
  // Deals that just ran out: big names get snapped up by a rival half the time.
  for (const d of dealsList(s)) {
    if (d.untilT !== s.t || d.studioId !== s.studio.id) continue;
    const t = talent(s, d.talentId);
    if (!t) continue;
    if (t.attrs.overall >= 65 && r.chance(0.5)) {
      const rival = r.pick(s.rivals.filter((x) => x.personality));
      rivalSign(s, rival.id, t, r.int(2, 4), r);
      msg(s, 'agent', `${t.name} signs with ${rival.name}`, 'Your deal lapsed and a rival moved fast.', { link: `/talent/${t.id}` });
    } else msg(s, 'agent', `${t.name}'s deal has ended`, 'They are a free agent again.', { link: `/talent/${t.id}` });
  }
  // Rivals lock up top directors and writers.
  for (const st of s.rivals) {
    const p = st.personality;
    if (!p || p.slate < 6 || !r.chance(0.025 + p.aggression * 0.02)) continue;
    if (dealsList(s).filter((d) => d.studioId === st.id && d.untilT > s.t).length >= MAX_RIVAL_DEALS) continue;
    const all = getDB().all;
    for (let i = 0; i < 25; i++) {
      const b = all[Math.floor(r() * all.length)];
      if (!b || (b.kind !== 'director' && b.kind !== 'writer') || b.attrs.overall < 70 || dealFor(s, b.id) || !isAvailable(s, b.id)) continue;
      const t = talent(s, b.id)!;
      if (loyaltyTo(s, t.id, s.studio.id).total >= 6) continue; // your loyal collaborators won't leave you
      rivalSign(s, st.id, t, r.int(2, 4), r);
      msg(s, 'rival', `${st.name} sign ${t.name}`, `An overall deal for the ${t.kind}.`, { link: `/talent/${t.id}` });
      break;
    }
  }
  s.deals = dealsList(s).filter((d) => d.untilT > s.t - 1);
}
