// Agent negotiations and bidding wars for hot talent.
import { makeRng, clamp } from '../rng';
import { isAvailable, override, talent } from '../talentDb';
import { tierInfo } from '../constants';
import type { BiddingWar, CrewRole, Film, GameState, Negotiation, Talent } from '../types';
import { filmById, msg, nextId, spend, studioById } from './util';
import { setCommit } from './scripts';
import { loyaltyAppeal, loyaltyDiscount, loyaltyTo, PICKY_BYPASS_AT, SKIP_WAR_AT } from './loyalty';

export type Role = 'lead' | 'support' | CrewRole;
export type Offer = { fee: number; backend: number; billing: number; options: number };

export const negKey = (filmId: string, talentId: string) => `${filmId}:${talentId}`;

const isHot = (s: GameState, t: Talent) =>
  t.kind === 'actor' && (t.attrs.starPower >= 80 || (s.talentOverrides[t.id]?.lastHitT ?? -99) > s.t - 13);

/** What the agent opens with. */
export function askingFee(s: GameState, t: Talent, film: Film, role: Role, studioId = s.studio.id): number {
  let fee = t.fee;
  if (role === 'support') fee *= 0.55;
  if (t.kind === 'director') fee *= 0.6 + (tierInfo(film.tier).typical / 60e6) * 0.25;
  if (t.traits.includes('Diva')) fee *= 1.2;
  // Sequels: returning cast want a raise unless they signed an option.
  if (film.sequelOf) {
    const orig = s.films.find((x) => x.id === film.sequelOf);
    const slot = orig?.cast.find((c) => c.talentId === t.id);
    if (slot) fee = Math.max(fee, slot.fee) * (slot.options > 1 ? 1.1 : 1.4);
  }
  fee *= 1 - loyaltyDiscount(t, loyaltyTo(s, t.id, studioId).total);
  return Math.max(20_000, Math.round(fee / 10_000) * 10_000);
}

export const expectedBilling = (t: Talent, role: Role) => (role !== 'lead' ? 3 : t.attrs.starPower >= 75 ? 1 : 2);

function appeal(s: GameState, t: Talent, film: Film, studioId: string): number {
  const st = studioById(s, studioId)!;
  const dir = film.crew.director ? talent(s, film.crew.director.talentId) : undefined;
  let a = (film.scriptQuality - 55) / 110 + (st.prestige - 50) / 220;
  a += dir ? (dir.attrs.overall - 55) / 220 : -0.04;
  const loyal = loyaltyTo(s, t.id, studioId).total;
  if (t.traits.includes('Picky') && loyal < PICKY_BYPASS_AT) a += (film.scriptQuality - 70) / 60;
  return a + loyaltyAppeal(loyal);
}

export type NegResult = { kind: 'opened'; neg: Negotiation } | { kind: 'bidding'; war: BiddingWar } | { kind: 'error'; reason: string };

export function canApproach(s: GameState, t: Talent, film: Film): string | null {
  if (!isAvailable(s, t.id)) return `${t.name} is busy until later.`;
  const walked = s.talentOverrides[t.id]?.walkedUntil;
  if (walked && walked > s.t) return `${t.name}'s agent isn't taking your calls for a while.`;
  if (film.cast.some((c) => c.talentId === t.id)) return 'Already cast.';
  if (Object.values(film.crew).some((c) => c?.talentId === t.id)) return 'Already on the crew.';
  return null;
}

export function openNegotiation(s: GameState, talentId: string, filmId: string, role: Role): NegResult {
  const t = talent(s, talentId);
  const film = filmById(s, filmId);
  if (!t || !film) return { kind: 'error', reason: 'Not found' };
  const block = canApproach(s, t, film);
  if (block) return { kind: 'error', reason: block };
  const key = negKey(filmId, talentId);
  const asking = askingFee(s, t, film, role);
  // Hot talent can spark a bidding war, unless they're loyal enough to talk to you first.
  if (role === 'lead' && isHot(s, t) && !s.negotiations[key] && loyaltyTo(s, t.id, s.studio.id).total < SKIP_WAR_AT) {
    const r = makeRng(s.seed, s.t, 'war', talentId);
    const bidders = s.rivals
      .filter((rv) => rv.cash > asking * 4 && rv.personality)
      .filter((rv) => r.chance(0.22 + rv.personality!.aggression * 0.22 + (rv.personality!.genres[film.primaryGenre] ?? 0) * 0.06))
      .slice(0, 3)
      .map((rv) => ({ studioId: rv.id, max: Math.round(asking * (1.04 + rv.personality!.aggression * 0.45 + r.range(0, 0.45))), out: false }));
    if (bidders.length) {
      const war: BiddingWar = { id: nextId(s, 'bw'), talentId, filmId, role, asking, current: asking, leader: '', bidders, log: [], done: false };
      s.biddingWar = war;
      s.stats.biddingWars++;
      return { kind: 'bidding', war };
    }
  }
  const neg: Negotiation = s.negotiations[key] ?? { talentId, filmId, role, round: 0, asking, history: [], status: 'open' };
  if (neg.status !== 'open') { neg.status = 'open'; neg.round = 0; neg.history = []; }
  s.negotiations[key] = neg;
  return { kind: 'opened', neg };
}

export function respond(s: GameState, key: string, offer: Offer): Negotiation | undefined {
  const neg = s.negotiations[key];
  if (!neg || neg.status !== 'open') return neg;
  const t = talent(s, neg.talentId)!;
  const film = filmById(s, neg.filmId)!;
  const r = makeRng(s.seed, s.t, 'neg', key, neg.round);
  neg.round++;
  neg.history.push({ from: 'you', ...offer, note: '' });

  const ap = appeal(s, t, film, s.studio.id);
  if (t.traits.includes('Picky') && film.scriptQuality < 62 && s.studio.prestige < 65 && loyaltyTo(s, t.id, s.studio.id).total < PICKY_BYPASS_AT) {
    neg.history.push({ from: 'agent', fee: 0, backend: 0, billing: 0, options: 0, note: `${t.name} only does prestige material. It's a pass.` });
    neg.status = 'rejected';
    walk(s, t.id, 4);
    return neg;
  }
  const demand = t.backendDemand;
  const backendVal = demand > 0 ? Math.min(0.2, (offer.backend - demand) * 0.025) : offer.backend * 0.01;
  const exp = expectedBilling(t, neg.role as Role);
  const billingVal = neg.role === 'lead' || neg.role === 'support' ? Math.min(0.04, (exp - offer.billing) * 0.08) : 0;
  const optionsVal = (offer.options - 1) * (t.traits.includes('Workaholic') ? 0.02 : t.traits.includes('Loyal') ? 0 : -0.06);
  const value = offer.fee / neg.asking + backendVal + billingVal + optionsVal + ap * 0.5;
  const threshold = 1 + r.range(-0.04, 0.05);

  const last = neg.history.filter((h) => h.from === 'agent').at(-1);
  const meetsCounter = last && last.fee > 0 && offer.fee >= last.fee && offer.backend >= last.backend && offer.billing <= last.billing && offer.options <= last.options;

  if (meetsCounter || value >= threshold) {
    neg.history.push({ from: 'agent', ...offer, note: r.pick(['We have a deal.', `${t.name.split(' ')[0]} is in. Send the paperwork.`, 'Done. My client is excited.']) });
    neg.status = 'accepted';
    sign(s, film, t, neg.role as Role, offer);
    return neg;
  }
  if (neg.round >= 3) {
    neg.history.push({ from: 'agent', fee: 0, backend: 0, billing: 0, options: 0, note: "We're too far apart. My client is moving on." });
    neg.status = 'walked';
    walk(s, t.id, 3);
    return neg;
  }
  if (value >= 0.72) {
    const gap = Math.max(0, threshold - (backendVal + billingVal + optionsVal + ap * 0.5));
    const counterFee = Math.round(Math.max(offer.fee * 1.03, neg.asking * gap * r.range(0.98, 1.06)) / 10_000) * 10_000;
    neg.history.push({
      from: 'agent', fee: counterFee, backend: Math.max(offer.backend, demand), billing: Math.min(offer.billing, exp), options: Math.min(offer.options, t.traits.includes('Workaholic') ? 3 : 1),
      note: r.pick(['We can get there, but not at that number.', 'Close. Meet us here and we sign today.', 'My client loves the script. The money needs to be right.']),
    });
  } else {
    neg.history.push({ from: 'agent', fee: 0, backend: 0, billing: 0, options: 0, note: r.pick(["That's not a serious offer.", 'Call me back when you mean it.', 'We expected more respect for my client.']) });
  }
  return neg;
}

function walk(s: GameState, id: string, turns: number) {
  override(s, id).walkedUntil = s.t + turns;
}

/** Attach someone to a film and pay their upfront fee. */
export function sign(s: GameState, film: Film, t: Talent, role: Role, offer: Offer) {
  if (role === 'lead' || role === 'support') {
    film.cast.push({ talentId: t.id, role, fee: offer.fee, backend: offer.backend, billing: offer.billing, options: offer.options });
  } else {
    film.crew[role] = { talentId: t.id, fee: offer.fee };
  }
  spend(s, film, offer.fee, 'Talent');
  const busyTurns = film.stage === 'filming' ? film.stageTurnsLeft : 2 + tierInfo(film.tier).filming;
  setCommit(s, t.id, film.id, film.studioId, s.t + busyTurns);
}

export function release(s: GameState, film: Film, talentId: string) {
  film.cast = film.cast.filter((c) => c.talentId !== talentId);
  for (const k of Object.keys(film.crew) as CrewRole[]) if (film.crew[k]?.talentId === talentId) delete film.crew[k];
  const c = s.commitments[talentId];
  if (c?.filmId === film.id) delete s.commitments[talentId];
}

// ---------- Bidding war ----------

export function playerBid(s: GameState, amount: number) {
  const w = s.biddingWar;
  if (!w || w.done || amount <= w.current && w.leader) return;
  w.current = Math.max(amount, w.current);
  w.leader = s.studio.id;
  w.log.push({ studioId: s.studio.id, amount: w.current });
}

/** One rival tries to top the current bid. Returns true if someone bid. */
export function rivalStep(s: GameState): boolean {
  const w = s.biddingWar;
  if (!w || w.done) return false;
  const r = makeRng(s.seed, w.id, w.log.length);
  const raise = Math.round((w.current * r.range(1.04, 1.12)) / 10_000) * 10_000;
  for (const b of r.shuffle([...w.bidders])) {
    if (b.out || b.studioId === w.leader) continue;
    if (raise > b.max) { b.out = true; continue; }
    if (r.chance(0.85)) {
      w.current = raise; w.leader = b.studioId;
      w.log.push({ studioId: b.studioId, amount: raise });
      return true;
    }
  }
  return false;
}

export function closeWar(s: GameState, playerDropped = false) {
  const w = s.biddingWar;
  if (!w || w.done) return;
  w.done = true;
  if (playerDropped && w.leader === s.studio.id) w.leader = '';
  if (playerDropped && !w.leader) {
    const best = w.bidders.filter((b) => !b.out).sort((a, b) => b.max - a.max)[0];
    if (best) { w.leader = best.studioId; w.current = Math.max(w.current, Math.round(w.asking * 1.02)); }
  }
  w.winner = w.leader;
  const t = talent(s, w.talentId)!;
  const film = filmById(s, w.filmId);
  if (w.leader === s.studio.id && film) {
    sign(s, film, t, w.role as Role, { fee: w.current, backend: t.backendDemand, billing: 1, options: 1 });
    msg(s, 'agent', `You won the bidding war for ${t.name}`, `${t.name} signs for ${film.title} at a record fee.`, { link: `/film/${film.id}` });
  } else if (w.leader) {
    const rv = studioById(s, w.leader)!;
    setCommit(s, t.id, '', rv.id, s.t + 8);
    rv.cash -= w.current;
    msg(s, 'rival', `${rv.name} land ${t.name}`, `${rv.name} won the bidding war for ${t.name}. They're off the market for a while.`, { link: `/talent/${t.id}` });
  }
}

export const warTalentLabel = (s: GameState) => {
  const w = s.biddingWar;
  return w ? talent(s, w.talentId)?.name : undefined;
};

export function clampOffer(o: Offer): Offer {
  return { fee: Math.max(0, Math.round(o.fee)), backend: clamp(Math.round(o.backend), 0, 25), billing: clamp(Math.round(o.billing), 1, 6), options: clamp(Math.round(o.options), 1, 3) };
}
