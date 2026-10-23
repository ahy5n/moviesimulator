// Rival studio AI: buy scripts, cast real people, release films, campaign for awards.
import { monthOf, turnInYear } from '../calendar';
import { MONTH_HEAT, tierInfo } from '../constants';
import { makeRng, clamp, type RNG } from '../rng';
import { genreFit, getDB, isAvailable, talent } from '../talentDb';
import { GENRES, MARKETS, type BudgetTier, type CrewRole, type Film, type GameState, type Genre, type Studio, type Talent } from '../types';
import { askingFee, sign } from './negotiation';
import { computeQuality, greenlight } from './production';
import { budgetFor, genScript } from './scripts';
import { salePrice } from './boxoffice';
import { STREAMER_BUYERS } from '@/data/studios';
import { msg, nextId, spend } from './util';

const ACTIVE: Film['stage'][] = ['development', 'preproduction', 'filming', 'post', 'ready'];

function prefWeight(st: Studio, g: Genre, s: GameState) {
  return (st.personality?.genres[g] ?? 0.35) * s.genreHeat[g];
}

/** Candidate pools are rebuilt once per turn. */
let POOL: { t: number; actors: Talent[]; directors: Talent[]; crew: Record<string, Talent[]> } | null = null;
function pools(s: GameState) {
  if (POOL && POOL.t === s.t) return POOL;
  const all = [...getDB().all, ...s.newTalent];
  const pick = (k: Talent['kind']) => all.filter((x) => x.kind === k && !s.talentOverrides[x.id]?.retired);
  POOL = { t: s.t, actors: pick('actor'), directors: pick('director'), crew: { composer: pick('composer'), cinematographer: pick('cinematographer'), editor: pick('editor'), writer: pick('writer') } };
  return POOL;
}

function chooseTalent(s: GameState, r: RNG, pool: Talent[], f: Film, maxFee: number, starBias: number, samples = 70): Talent | undefined {
  let best: Talent | undefined, bestScore = -1;
  for (let i = 0; i < samples; i++) {
    const base = pool[Math.floor(r() * pool.length)];
    if (!base || !isAvailable(s, base.id)) continue;
    if (f.cast.some((c) => c.talentId === base.id)) continue;
    const t = talent(s, base.id)!;
    if (t.fee > maxFee) continue;
    const score = 0.45 * genreFit(t, f.primaryGenre, f.secondaryGenre) + 0.35 * t.attrs.overall + starBias * t.attrs.starPower + r.range(0, 8);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function castRivalFilm(s: GameState, st: Studio, f: Film, r: RNG) {
  const P = pools(s);
  const big = f.tier === 'High' || f.tier === 'Tentpole';
  const sign1 = (t: Talent | undefined, role: 'lead' | 'support' | CrewRole) => {
    if (!t) return;
    const fee = askingFee(s, t, f, role, st.id);
    sign(s, f, t, role, { fee, backend: role === 'lead' ? t.backendDemand : 0, billing: role === 'lead' ? 1 : 3, options: 1 });
  };
  if (!f.crew.director) sign1(chooseTalent(s, r, P.directors, f, f.budget * 0.08 + 1e6, big ? 0.2 : 0.05, 40), 'director');
  let leads = f.cast.filter((c) => c.role === 'lead').length;
  for (let tries = 0; leads < f.leads && tries < 3; tries++) {
    const t = chooseTalent(s, r, P.actors, f, f.budget * (big ? 0.14 : 0.2) + 3e5, big ? 0.35 : 0.1);
    if (t) { sign1(t, 'lead'); leads++; }
  }
  for (let i = f.cast.filter((c) => c.role === 'support').length; i < f.supports; i++) sign1(chooseTalent(s, r, P.actors, f, f.budget * 0.05 + 2e5, 0, 40), 'support');
  if (s.settings.crewMode === 'full' && st.personality && st.personality.prestige > 0.4) {
    for (const role of ['composer', 'cinematographer', 'editor'] as const) if (!f.crew[role]) sign1(chooseTalent(s, r, P.crew[role], f, f.budget * 0.02 + 2e5, 0, 25), role);
  }
}

export function startRivalProject(s: GameState, st: Studio, r: RNG): Film | undefined {
  const p = st.personality!;
  // Sometimes snap up a marketplace script the player was eyeing.
  let script = undefined as ReturnType<typeof genScript> | undefined;
  const fromMarket = s.scripts.filter((x) => (p.genres[x.primaryGenre] ?? 0) >= 1.2 && x.quality >= 55);
  if (fromMarket.length && r.chance(0.3)) {
    script = r.pick(fromMarket);
    s.scripts = s.scripts.filter((x) => x.id !== script!.id);
    msg(s, 'rival', `${st.name} buys "${script.title}"`, `The ${script.primaryGenre.toLowerCase()} script has been snapped up.`);
  } else {
    const g = r.weighted(GENRES, (x) => prefWeight(st, x, s));
    script = genScript(s, r);
    for (let i = 0; i < 6 && script.primaryGenre !== g; i++) script = genScript(s, r);
    script.quality = clamp(Math.round(script.quality + p.prestige * 8 - 3 + r.normal(0, 4)), 10, 97);
  }
  const tier: BudgetTier = r.pick(p.budgetBias);
  const budget = budgetFor(r, tier);
  const f: Film = {
    id: nextId(s, 'f'), title: script.title, studioId: st.id, logline: script.logline,
    primaryGenre: script.primaryGenre, secondaryGenre: script.secondaryGenre, tone: script.tone,
    stage: 'development', stageTurnsLeft: r.int(1, 3), createdT: s.t,
    budget, tier, suggestedBudget: budget, marketing: 0, scriptQuality: script.quality, quality: 0, qualityKnown: false,
    leads: script.leads, supports: script.supports, cast: [], crew: { writer: { talentId: script.writerId, fee: 0 } },
    weekly: [], byMarket: {}, gross: 0, studioRevenue: 0, otherRevenue: 0, spent: 0, backendPaid: 0,
    awards: [], fyc: {}, events: [], luck: 1, buzz: 0, inTheatres: false, weeksOut: 0,
  };
  spend(s, f, script.price, 'Scripts');
  s.films.push(f);
  return f;
}

function pickReleaseT(s: GameState, f: Film, r: RNG, st: Studio): number {
  let best = s.t + 2, bestScore = -1;
  const lateBias = f.quality >= 72 && (st.personality?.prestige ?? 0) > 0.4;
  for (let t = s.t + 2; t <= s.t + 10; t++) {
    let crowd = 0;
    for (const o of s.films) {
      if (!o.release || o.release.type === 'sold' || o.id === f.id) continue;
      const d = Math.abs(o.release.t - t);
      if (d === 0) crowd += o.tier === 'High' || o.tier === 'Tentpole' ? 0.25 : 0.1;
      else if (d === 1 && (o.tier === 'High' || o.tier === 'Tentpole')) crowd += 0.08;
    }
    let score = MONTH_HEAT[monthOf(t)] - crowd + r.range(0, 0.15);
    if (lateBias && monthOf(t) >= 9) score += 0.3;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

export function scheduleRival(s: GameState, st: Studio, f: Film, r: RNG) {
  const p = st.personality!;
  const streaming = !!st.rivalSubs && r.chance(p.streamingFirst);
  const t = pickReleaseT(s, f, r, st);
  f.marketing = Math.round(f.budget * r.range(0.4, 0.85) * (streaming ? 0.3 : 1));
  spend(s, f, f.marketing, 'Marketing');
  f.release = {
    type: streaming ? 'streaming' : 'theatrical', t, markets: [...MARKETS],
    screens: f.tier === 'Micro' ? 'limited' : f.tier === 'Low' ? (r.chance(0.5) ? 'limited' : 'moderate') : f.tier === 'Tentpole' ? 'ultra' : 'wide',
  };
}

export function advanceRivals(s: GameState) {
  for (const st of s.rivals) {
    if (!st.personality) continue;
    const p = st.personality;
    const r = makeRng(s.seed, s.t, 'rival', st.id);
    const active = s.films.filter((f) => f.studioId === st.id && ACTIVE.includes(f.stage));
    // New projects at the configured slate rate.
    const capacity = Math.ceil(p.slate * 0.75);
    if (active.length < capacity && r.chance(Math.min(0.95, p.slate / 26 * 1.6))) startRivalProject(s, st, r);
    for (const f of active) {
      if (f.stage === 'preproduction') {
        castRivalFilm(s, st, f, r);
        if (f.crew.director && f.cast.filter((c) => c.role === 'lead').length >= f.leads) greenlight(s, f);
        else if (s.t - f.createdT > 8) f.leads = Math.max(0, f.cast.filter((c) => c.role === 'lead').length);
      } else if (f.stage === 'ready' && !f.release) scheduleRival(s, st, f, r);
    }
    // Awards campaigns in the autumn for their best films.
    const ty = turnInYear(s.t);
    if (ty >= 20 || ty <= 3) {
      for (const f of s.films) {
        if (f.studioId !== st.id || !f.critic || f.critic < 72 || !f.release) continue;
        const spendAmt = 0.4e6 * p.prestige * (f.critic - 65) / 10 * r.range(0.5, 1.2);
        if (spendAmt <= 0) continue;
        f.fyc['Best Picture'] = (f.fyc['Best Picture'] ?? 0) + spendAmt;
        st.cash -= spendAmt;
      }
    }
    // Conglomerate parents keep the lights on.
    if (st.cash < 2e8) st.cash += 1.5e8;
  }
  streamerOffers(s);
}

/** Streamers occasionally bid for the player's finished, unscheduled films. */
function streamerOffers(s: GameState) {
  for (const f of s.films) {
    if (f.studioId !== s.studio.id || f.stage !== 'ready' || f.release) continue;
    const r = makeRng(s.seed, s.t, 'offer', f.id);
    if (!r.chance(0.18)) continue;
    const buyers = STREAMER_BUYERS.filter((b) => s.rivals.some((x) => x.id === b));
    if (!buyers.length) continue;
    const buyer = r.pick(buyers);
    const amount = salePrice(s, f, buyer);
    const name = s.rivals.find((x) => x.id === buyer)!.name;
    msg(s, 'offer', `${name} wants to buy ${f.title}`, `A flat $${(amount / 1e6).toFixed(1)}M for worldwide streaming rights. No box office upside.`, {
      filmId: f.id, link: `/release?film=${f.id}`, offer: { type: 'streamerBuy', filmId: f.id, amount, buyer, expires: s.t + 2 },
    });
  }
}

/** Seed rival pipelines at game start so the world feels alive from day one. */
export function seedRivals(s: GameState) {
  for (const st of s.rivals) {
    const r = makeRng(s.seed, 'seed', st.id);
    const n = Math.round(st.personality!.slate * 0.7);
    for (let i = 0; i < n; i++) {
      const f = startRivalProject(s, st, r)!;
      f.stage = 'preproduction';
      castRivalFilm(s, st, f, r);
      f.leads = Math.min(f.leads, f.cast.filter((c) => c.role === 'lead').length);
      if (!f.crew.director) continue;
      greenlight(s, f);
      const ti = tierInfo(f.tier);
      const phase = r.int(0, ti.filming + ti.post + 3);
      if (phase < ti.filming) { f.stageTurnsLeft = ti.filming - phase; f.prodPaid = f.budget * phase / ti.filming; f.spent += f.prodPaid; }
      else if (phase < ti.filming + ti.post) {
        f.stage = 'post'; f.stageTurnsLeft = ti.filming + ti.post - phase; f.prodPaid = f.budget; f.spent += f.budget;
        for (const c of f.cast) if (s.commitments[c.talentId]?.filmId === f.id) s.commitments[c.talentId].until = s.t;
      } else {
        f.stage = 'ready'; f.prodPaid = f.budget; f.spent += f.budget;
        f.quality = computeQuality(s, f);
        for (const c of f.cast) if (s.commitments[c.talentId]?.filmId === f.id) s.commitments[c.talentId].until = s.t;
        scheduleRival(s, st, f, r);
        f.release!.t = r.int(0, 8);
      }
    }
  }
}
