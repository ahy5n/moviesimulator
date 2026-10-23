// Releases, reviews and the week-by-week global box office.
import { monthOf, yearOf } from '../calendar';
import { GENRE_BIAS, HQS, MARKET_SHARE, MONTH_HEAT, RENTAL, SCREENS, tierInfo } from '../constants';
import { OUTLETS, CRITICS } from '../names';
import { makeRng, clamp } from '../rng';
import { reviewQuote } from '../titles';
import { MARKETS, type Film, type GameState, type Market, type ReleaseType, type ScreenPlan, type Studio } from '../types';
import { castMembers } from './production';
import { addLoyalty, LOYALTY } from './loyalty';
import { franchiseMult, franchiseOf } from './scripts';
import { filmProfit, headline, msg, pay, spend, studioById } from './util';

/** How big a given genre can get at the global box office. */
const GENRE_CEILING: Record<Film['primaryGenre'], number> = {
  Superhero: 1.3, Animation: 1.2, Action: 1.15, 'Sci-Fi': 1.1, Fantasy: 1.1, Family: 1.05, Comedy: 0.95, Horror: 0.95,
  Thriller: 0.9, Crime: 0.85, Romance: 0.85, Musical: 0.9, War: 0.85, Drama: 0.75, Western: 0.75, Documentary: 0.4,
};

export type ReleasePlan = { type: ReleaseType; t: number; screens: ScreenPlan; marketing: number; buyer?: string; price?: number };

const heatOf = (s: GameState, f: Film) => 0.65 * s.genreHeat[f.primaryGenre] + 0.35 * s.genreHeat[f.secondaryGenre ?? f.primaryGenre];

function studioRegion(st: Studio | undefined, m: Market): number {
  if (!st) return 1;
  const hq = HQS.find((h) => h.id === st.hq)?.regions[m] ?? 1;
  return hq * (st.personality?.regions[m] ?? 1);
}

/** Marketing as a multiplier: diminishing returns on P&A relative to production budget. */
export const marketingMult = (f: Film, marketing = f.marketing) =>
  0.55 + 0.85 * Math.sqrt(Math.min(1.6, marketing / Math.max(1, f.budget)));

function starMult(s: GameState, f: Film): number {
  const leads = castMembers(s, f).filter((m) => m.lead).map((m) => m.t);
  if (!leads.length) return 0.85;
  const draw = leads.reduce((a, t) => a + 0.5 * t.attrs.starPower + 0.5 * t.attrs.boxOffice, 0) / leads.length;
  return 0.6 + draw / 100 * 0.85;
}

function regionalAppeal(s: GameState, f: Film, m: Market): number {
  const members = castMembers(s, f);
  if (!members.length) return 1;
  let w = 0, sum = 0;
  for (const x of members) { const k = x.lead ? 2 : 1; w += k; sum += k * x.t.regional[m]; }
  const avg = sum / w;
  return clamp((0.45 + avg / 100) / 1.0, 0.5, 1.5);
}

function competition(s: GameState, f: Film, t: number): number {
  let n = 0, same = 0;
  for (const o of s.films) {
    if (o.id === f.id || !o.release || (o.release.type !== 'theatrical' && o.release.type !== 'dayanddate')) continue;
    if (Math.abs(o.release.t - t) > 1) continue;
    if (o.tier === 'Micro' || o.tier === 'Low') continue;
    n += o.tier === 'Tentpole' ? 1.5 : 1;
    if (o.primaryGenre === f.primaryGenre) same++;
  }
  return 1 / (1 + 0.1 * n + 0.1 * same);
}

/** Expected week-1 gross by market before review effects or noise. */
export function expectedOpening(s: GameState, f: Film, plan: { t: number; screens: ScreenPlan; marketing: number; type: ReleaseType }) {
  const ti = tierInfo(f.tier);
  const st = studioById(s, f.studioId);
  const q = f.quality || 55;
  // Stacked boosts are compressed so no single film runs away with the box office.
  const boosts = marketingMult(f, plan.marketing) * starMult(s, f) * heatOf(s, f) * MONTH_HEAT[monthOf(plan.t)]
    * competition(s, f, plan.t) * (0.68 + q / 100 * 0.62) * franchiseMult(s, f)
    * (1 + (f.festival?.reception ?? 0) * 0.15) * (1 + f.buzz * 0.1);
  const g = 0.65 * GENRE_CEILING[f.primaryGenre] + 0.35 * GENRE_CEILING[f.secondaryGenre ?? f.primaryGenre];
  const common = ti.base * g * Math.pow(boosts, 0.75) * Math.pow(SCREENS[plan.screens].mult, ti.screenW) * (plan.type === 'dayanddate' ? 0.6 : 1);
  const out = {} as Record<Market, number>;
  for (const m of MARKETS) out[m] = common * MARKET_SHARE[m] * regionalAppeal(s, f, m) * studioRegion(st, m);
  return out;
}

function legsFromScores(critic: number, audience: number) {
  const wom = 0.35 * critic + 0.65 * audience;
  return clamp(0.68 - wom / 100 * 0.46, 0.2, 0.72); // weekly drop
}

/** Rough forecast used for UI and streamer sale offers. */
export function forecastGross(s: GameState, f: Film, plan: { t: number; screens: ScreenPlan; marketing: number; type: ReleaseType }) {
  const open = Object.values(expectedOpening(s, f, plan)).reduce((a, b) => a + b, 0);
  const q = f.quality || 55;
  const drop = legsFromScores(q + 2, q * 0.75 + 18);
  return open / drop;
}

export function salePrice(s: GameState, f: Film, buyer: string): number {
  const gross = forecastGross(s, f, { t: s.t + 2, screens: 'wide', marketing: f.budget * 0.5, type: 'theatrical' });
  const r = makeRng(s.seed, f.id, 'sale', buyer);
  const q = f.quality || 55;
  return Math.round(Math.max(f.budget * 0.35, gross * 0.36 * (0.75 + q / 200) * r.range(0.85, 1.12)) / 1e5) * 1e5;
}

export function generateReviews(s: GameState, f: Film) {
  const r = makeRng(s.seed, f.id, 'reviews');
  const b1 = GENRE_BIAS[f.primaryGenre], b2 = GENRE_BIAS[f.secondaryGenre ?? f.primaryGenre];
  const leads = castMembers(s, f).filter((m) => m.lead);
  const star = leads.length ? leads.reduce((a, m) => a + m.t.attrs.starPower, 0) / leads.length : 50;
  f.critic = clamp(Math.round(f.quality + 0.65 * b1.critic + 0.35 * b2.critic + r.normal(0, 6)), 1, 99);
  f.audience = clamp(Math.round(f.quality * 0.72 + 20 + 0.65 * b1.audience + 0.35 * b2.audience + (star - 50) / 12 + r.normal(0, 6)), 5, 99);
  f.qualityKnown = true;
  const outlets = r.shuffle([...OUTLETS]).slice(0, 6);
  f.reviews = outlets.map((outlet) => {
    const score = clamp(Math.round(f.critic! + r.normal(0, 11)), 1, 100);
    return { outlet, critic: r.pick(CRITICS), score, quote: reviewQuote(r, score) };
  });
}

/** Player schedules a release. Marketing is paid now. */
export function scheduleRelease(s: GameState, f: Film, plan: ReleasePlan): string | null {
  if (f.stage !== 'ready') return 'Film is not finished yet.';
  if (plan.type === 'sold') {
    const buyer = plan.buyer ?? 'netflix';
    const price = plan.price ?? salePrice(s, f, buyer);
    f.salePrice = price; f.soldTo = buyer;
    f.release = { type: 'sold', t: s.t, screens: 'limited', markets: [] };
    f.stage = 'library';
    generateReviews(s, f);
    pay(s, f.studioId, price, 'Streamer sales');
    msg(s, 'finance', `${f.title} sold to ${studioById(s, buyer)?.name ?? buyer}`, `Flat fee of $${(price / 1e6).toFixed(1)}M received.`, { link: `/film/${f.id}` });
    return null;
  }
  if ((plan.type === 'streaming' || plan.type === 'dayanddate') && !s.studio.streaming) return 'Launch your streaming service first.';
  const minT = plan.type === 'streaming' ? s.t + 1 : s.t + 2;
  if (plan.t < minT) return 'Marketing needs more lead time — pick a later date.';
  f.marketing = plan.type === 'streaming' ? Math.round(plan.marketing * 0.5) : plan.marketing;
  spend(s, f, f.marketing + (plan.screens === 'ultra' ? f.budget * SCREENS.ultra.cost : 0), 'Marketing');
  f.release = { type: plan.type, t: plan.t, screens: plan.screens, markets: [...MARKETS] };
  return null;
}

export function unschedule(s: GameState, f: Film) {
  if (!f.release || f.release.t <= s.t || f.stage !== 'ready') return;
  f.release = undefined; // marketing already spent is sunk
}

/** Release day: reviews land and the opening is set. */
export function doRelease(s: GameState, f: Film) {
  const r = makeRng(s.seed, f.id, 'release');
  generateReviews(s, f);
  f.stage = 'released';
  const fr = franchiseOf(s, f);
  if (fr) fr.fatigue += fr.isUniverse ? 0.12 : 0.08;
  const type = f.release!.type;
  if (type === 'streaming') {
    f.inTheatres = false;
    f.homeWindowT = s.t;
    return;
  }
  if (r.chance(f.primaryGenre === 'Horror' ? 0.25 : 0.07)) {
    f.chinaBlocked = true;
    f.release!.markets = f.release!.markets.filter((m) => m !== 'CN');
    if (f.studioId === s.studio.id) msg(s, 'news', `${f.title} denied a China release`, 'Censors have not approved the film. It will skip the Chinese market.', { link: `/film/${f.id}` });
  }
  f.inTheatres = true;
  f.weeksOut = 0;
  f.weekly = [];
  f.byMarket = {};
  if (f.studioId === s.studio.id) f.weeklyByMarket = {};
}

function weekGross(s: GameState, f: Film, open: Record<Market, number>, week: number): Record<Market, number> {
  const out = {} as Record<Market, number>;
  const drop = legsFromScores(f.critic!, f.audience!);
  const front = f.primaryGenre === 'Horror' || f.primaryGenre === 'Superhero' ? 0.08 : 0;
  const platform = f.release!.screens === 'limited' && (f.critic ?? 0) >= 74;
  const r = makeRng(s.seed, f.id, 'wk', week);
  for (const m of f.release!.markets) {
    let g = open[m];
    for (let i = 1; i <= week; i++) {
      if (platform && i <= 3) g *= 1.55;
      else g *= 1 - clamp(drop + (i === 1 ? front : 0) - f.buzz * 0.04, 0.15, 0.8);
    }
    out[m] = g * clamp(r.normal(1, 0.06), 0.8, 1.2);
  }
  return out;
}

/** Two weeks of box office for every film in cinemas. Revenue (rentals) flows to the studio. */
export function advanceBoxOffice(s: GameState) {
  for (const f of s.films) {
    if (f.stage === 'ready' && f.release && f.release.t <= s.t) doRelease(s, f);
    if (!f.inTheatres || !f.release) continue;
    let open = f.openByMarket as Record<Market, number> | undefined;
    if (!open) {
      const r = makeRng(s.seed, f.id, 'open');
      const exp = expectedOpening(s, f, { t: f.release.t, screens: f.release.screens, marketing: f.marketing, type: f.release.type });
      const noise = Math.exp(r.normal(0, 0.22));
      // Reviews affect opening weekend too.
      const rev = 0.82 + (0.4 * f.critic! + 0.6 * f.audience!) / 100 * 0.38;
      open = {} as Record<Market, number>;
      for (const m of MARKETS) open[m] = exp[m] * noise * rev * clamp(r.normal(1, 0.1), 0.7, 1.3);
      f.openByMarket = open;
    }
    let turnRevenue = 0;
    for (let k = 0; k < 2 && f.inTheatres; k++) {
      const wk = weekGross(s, f, open, f.weeksOut);
      let total = 0;
      for (const m of Object.keys(wk) as Market[]) {
        total += wk[m];
        f.byMarket[m] = (f.byMarket[m] ?? 0) + wk[m];
        if (f.weeklyByMarket) (f.weeklyByMarket[m] ??= []).push(Math.round(wk[m]));
        turnRevenue += wk[m] * RENTAL[m];
      }
      f.weekly.push(Math.round(total));
      f.gross += total;
      f.weeksOut++;
      const openTotal = f.weekly[0] || 1;
      if ((f.weeksOut > 3 && total < openTotal * 0.012) || f.weeksOut >= 18 || total < 40_000) {
        f.inTheatres = false;
        f.homeWindowT = Math.max(s.t + 1, f.release.t + 4);
      }
    }
    f.studioRevenue += turnRevenue;
    pay(s, f.studioId, turnRevenue, 'Box office');
    payParticipants(s, f, turnRevenue);
    if (f.weeksOut <= 2) openingNews(s, f);
  }
}

/** Backend points and co-financing partners take their share of each payment. */
export function payParticipants(s: GameState, f: Film, revenue: number) {
  if (revenue <= 0) return;
  let out = 0;
  for (const c of f.cast) out += revenue * (c.backend / 100);
  if (f.cofinance) out += revenue * f.cofinance.share;
  if (out <= 0) return;
  f.backendPaid += out;
  pay(s, f.studioId, -out, 'Backend & partners');
}

function openingNews(s: GameState, f: Film) {
  const open = f.weekly[0] ?? 0;
  const st = studioById(s, f.studioId)!;
  const mine = st.isPlayer;
  if (!mine && open < 120e6) return;
  const text = `${f.title} opens to $${(open / 1e6).toFixed(1)}M worldwide${mine ? '' : ` for ${st.name}`}.`;
  if (mine) {
    headline(text);
    msg(s, 'news', `Opening weekend: ${f.title}`, `${text} Critics ${f.critic}, audiences ${f.audience}.`, { link: `/film/${f.id}` });
  } else msg(s, 'rival', `Box office: ${f.title}`, text);
}

/** After cinemas: home entertainment / licensing, then library. Also updates genre heat and talent fame. */
export function advanceWindows(s: GameState, onLibrary: (f: Film) => void) {
  for (const f of s.films) {
    if (f.stage !== 'released' || f.inTheatres || f.homeWindowT === undefined || f.homeWindowT > s.t) continue;
    f.stage = 'library';
    const q = f.quality;
    const st = studioById(s, f.studioId)!;
    if (f.release?.type === 'streaming') { onLibrary(f); continue; }
    // Home entertainment + licensing. If the studio has its own service it keeps the film and earns PVOD only.
    const own = !!st.streaming;
    const amount = f.gross * (own ? 0.1 : 0.3 + q / 100 * 0.14) + (own ? 0 : f.budget * 0.16);
    f.otherRevenue += amount;
    pay(s, f.studioId, amount, own ? 'Home entertainment' : 'Licensing');
    payParticipants(s, f, amount);
    onLibrary(f);
  }
}

/** Library titles keep earning a trickle when not on your own service. */
export function libraryIncome(s: GameState) {
  for (const f of s.films) {
    if (f.stage !== 'library' || f.soldTo || f.release?.type === 'streaming') continue;
    const st = studioById(s, f.studioId);
    if (!st || st.streaming) continue;
    const age = (s.t - (f.release?.t ?? s.t)) / 26;
    const amt = (f.gross * 0.012 + f.budget * 0.004) * Math.pow(0.82, age) / 26;
    if (amt < 1000) continue;
    f.otherRevenue += amt;
    pay(s, f.studioId, amt, 'Library');
  }
}

/** Results feed genre heat and the franchise. */
export function judgeResult(s: GameState, f: Film) {
  const profit = filmProfit(f);
  const ratio = f.gross / Math.max(1, f.spent);
  const g = f.primaryGenre;
  const fr = franchiseOf(s, f);
  if (f.tier === 'High' || f.tier === 'Tentpole' || ratio > 4) {
    if (ratio > 3) { s.genreHeat[g] = clamp(s.genreHeat[g] + 0.06, 0.6, 1.4); if (fr) fr.heat += 0.25; }
    else if (ratio < 1.2) { s.genreHeat[g] = clamp(s.genreHeat[g] - 0.06, 0.6, 1.4); if (fr) fr.heat = Math.max(0, fr.heat - 0.2); }
  }
  for (const c of Object.values(f.crew)) if (c) addLoyalty(s, c.talentId, f.studioId, LOYALTY.film);
  for (const c of f.cast) {
    addLoyalty(s, c.talentId, f.studioId, LOYALTY.film);
    const ov = (s.talentOverrides[c.talentId] = { ...(s.talentOverrides[c.talentId] ?? {}) });
    ov.credits = [{ title: f.title, year: yearOf(f.release?.t ?? s.t), billing: c.billing, inGame: true, filmId: f.id }, ...(ov.credits ?? [])].slice(0, 12);
    if (c.role !== 'lead' || f.release?.type === 'streaming' || f.release?.type === 'sold') continue;
    if (ratio > 3 && f.gross > 150e6) {
      ov.star = (ov.star ?? 0) + 4; ov.box = (ov.box ?? 0) + 4; ov.feeMult = (ov.feeMult ?? 1) * 1.15; ov.lastHitT = s.t;
    } else if (ratio < 1 && (f.tier === 'High' || f.tier === 'Tentpole' || f.tier === 'Mid')) {
      ov.star = (ov.star ?? 0) - 3; ov.box = (ov.box ?? 0) - 3; ov.feeMult = (ov.feeMult ?? 1) * 0.93;
    }
    if ((f.critic ?? 0) >= 85) ov.acting = (ov.acting ?? 0) + 1;
  }
  const st = studioById(s, f.studioId)!;
  if ((f.critic ?? 0) >= 85) st.prestige = clamp(st.prestige + 1.5);
  if ((f.critic ?? 0) <= 30) st.prestige = clamp(st.prestige - 1);
  if (st.isPlayer && profit !== 0) {
    if (ratio > 3) msg(s, 'news', `${f.title} is a smash hit`, `Worldwide gross $${(f.gross / 1e6).toFixed(0)}M.`, { link: `/film/${f.id}` });
    else if (ratio < 0.8 && f.release?.type !== 'streaming') msg(s, 'news', `${f.title} flops`, `Just $${(f.gross / 1e6).toFixed(0)}M worldwide against a $${(f.spent / 1e6).toFixed(0)}M outlay.`, { link: `/film/${f.id}` });
  }
}

export const releaseWeekIndex = (f: Film) => (f.release ? f.release.t * 2 : 0);
