// Festival acquisitions: finished indie films go up for sale at Summit, Riviera and Lido.
// You only see the screening buzz, not the real quality. Rivals are guessing too.
import { FESTIVALS } from '@/data/awards';
import { tierOf } from '../constants';
import { formatDate, turnInYear, yearOf } from '../calendar';
import { languageMarketFactor, pickLanguage } from '../languages';
import { makeRng, clamp, type RNG } from '../rng';
import { getDB, talent } from '../talentDb';
import { genLogline, genTitle } from '../titles';
import { MARKETS, type Acquisition, type Film, type GameState, type Genre, type Tone } from '../types';
import { addLoyalty, LOYALTY } from './loyalty';
import { scheduleRival } from './rivals';
import { headline, msg, nextId, pay, studioById } from './util';

const INDIE_GENRES: [Genre, number][] = [
  ['Drama', 5], ['Comedy', 3], ['Horror', 3], ['Documentary', 2], ['Romance', 2], ['Thriller', 2], ['Crime', 1.5], ['Sci-Fi', 1], ['Musical', 0.5], ['Western', 0.5], ['War', 0.5],
];
const LOTS: Record<string, number> = { summit: 5, riviera: 4, lido: 4 };
/** Rivals that shop at festivals, and how keen they are. */
const BUYER_APPETITE: Record<string, number> = { a24: 1.15, neon: 1.15, netflix: 1.05, amazon: 1, apple: 1.05, lionsgate: 0.8, sony: 0.7, universal: 0.55, wb: 0.5, disney: 0.3, paramount: 0.5, yrf: 0.4 };

export const acquisitionsList = (s: GameState) => (s.acquisitions ??= []);
export const openLots = (s: GameState) => acquisitionsList(s).filter((a) => a.status === 'open');
export const bidStep = (a: Acquisition) => Math.max(250_000, Math.round((a.bid * 0.06) / 50_000) * 50_000);

/** What a buyer thinks a film is worth from what was seen in the screening room. */
function valuation(s: GameState, a: Pick<Acquisition, 'budget' | 'primaryGenre' | 'language'>, estQuality: number, reception: number) {
  const lang = MARKETS.reduce((acc, m) => acc + languageMarketFactor(a.language, m), 0) / MARKETS.length;
  const upside = Math.max(0, estQuality - 48) / 20;
  const awards = Math.max(0, estQuality - 72) * 0.5e6; // awards-season potential, whatever it cost to make
  return Math.max(0.3e6, (a.budget * (0.45 + upside) + awards) * s.genreHeat[a.primaryGenre] * (0.5 + lang * 0.5) * (1 + reception * 0.15));
}

function pickPeople(s: GameState, r: RNG, kind: 'actor' | 'director' | 'writer', n: number, language: string): string[] {
  const all = getDB().all;
  const pool = [...all, ...s.newTalent];
  const out: string[] = [];
  for (let i = 0; i < 200 && out.length < n; i++) {
    const b = pool[Math.floor(r() * pool.length)];
    if (!b || b.kind !== kind || b.fee > 2.5e6 || out.includes(b.id) || s.talentOverrides[b.id]?.retired) continue;
    if (!b.languages.includes(language) && r.chance(0.8)) continue;
    out.push(b.id);
  }
  return out;
}

/** New lots go on sale the fortnight a festival runs; bidding closes when you advance. */
export function openFestivalMarket(s: GameState) {
  const ty = turnInYear(s.t);
  const year = yearOf(s.t);
  for (const fest of FESTIVALS) {
    if (fest.turn !== ty) continue;
    const r = makeRng(s.seed, year, fest.id, 'market');
    const lots: Acquisition[] = [];
    for (let i = 0; i < (LOTS[fest.id] ?? 4); i++) {
      const g = r.weighted(INDIE_GENRES, ([gg, w]) => w * s.genreHeat[gg])[0];
      const g2 = r.chance(0.35) ? r.pick(INDIE_GENRES.map((x) => x[0]).filter((x) => x !== g)) : undefined;
      const tone: Tone = r.pick(['light', 'balanced', 'dark'] as const);
      const language = r.chance(fest.indie ? 0.75 : 0.55) ? 'en' : pickLanguage(r);
      const budget = Math.round(r.range(0.6e6, fest.indie ? 9e6 : 16e6) / 1e5) * 1e5;
      const quality = clamp(Math.round(r.normal(58 + fest.prestige * 6, 13)), 18, 96);
      const mid = quality + r.normal(0, 4.5);
      const w = r.int(5, 9);
      const reception = Math.round(clamp((quality - 62) / 18 * fest.prestige + r.normal(0, 0.35), -1.5, 1.5) * 100) / 100;
      const director = pickPeople(s, r, 'director', 1, language)[0];
      const writer = pickPeople(s, r, 'writer', 1, language)[0];
      const cast = pickPeople(s, r, 'actor', g === 'Documentary' ? 0 : r.int(2, 4), language);
      if (!director || !writer) continue;
      const a: Acquisition = {
        id: nextId(s, 'aq'), festivalId: fest.id, year, opensT: s.t, closesT: s.t + 1,
        title: genTitle(r, g, g2), logline: genLogline(r, g, g2, tone), primaryGenre: g, secondaryGenre: g2, tone, language,
        budget, quality, screened: [clamp(Math.round(mid - w)), clamp(Math.round(mid + w))], reception,
        directorId: director, writerId: writer, cast, reserve: 0, bid: 0, rivalMax: {}, status: 'open', log: [],
      };
      const fair = valuation(s, a, mid, reception);
      a.reserve = Math.round(fair * r.range(0.3, 0.45) / 50_000) * 50_000;
      for (const st of s.rivals) {
        const appetite = BUYER_APPETITE[st.id] ?? 0.4;
        if (!st.personality || !r.chance(Math.min(0.85, appetite * 0.45))) continue;
        const est = mid + r.normal(0, 5); // their scouts are guessing as well
        const taste = 0.7 + (st.personality.genres[g] ?? 0.5) * 0.3;
        a.rivalMax[st.id] = Math.round(valuation(s, a, est, reception) * appetite * taste * r.range(0.65, 1.15) / 50_000) * 50_000;
      }
      a.bid = a.reserve;
      rivalsRespond(a, 0);
      lots.push(a);
    }
    acquisitionsList(s).push(...lots);
    if (lots.length) msg(s, 'offer', `${fest.name} market is open`, `${lots.length} finished films are for sale. Bidding closes ${formatDate(s.t + 1)}.`, { link: '/festivals' });
  }
}

/** Rivals bid against the current price, proxy-auction style, up to their private ceiling. */
function rivalsRespond(a: Acquisition, playerBid: number) {
  const floor = playerBid ? playerBid + bidStep(a) : a.reserve;
  const ranked = Object.entries(a.rivalMax).filter(([, m]) => m >= floor).sort((x, y) => y[1] - x[1]);
  if (!ranked.length) return;
  const [top, topMax] = ranked[0];
  const rival = Math.max(playerBid, ranked[1]?.[1] ?? 0);
  const price = rival ? Math.min(topMax, Math.max(floor, rival + bidStep(a))) : a.reserve;
  a.bid = price;
  a.leader = top;
  a.log.push({ studioId: top, amount: price });
}

export function placeBid(s: GameState, lotId: string, amount: number): string | null {
  const a = acquisitionsList(s).find((x) => x.id === lotId);
  if (!a || a.status !== 'open' || a.closesT <= s.t) return 'Bidding has closed.';
  const min = a.leader ? a.bid + bidStep(a) : a.bid;
  if (amount < min) return `Bid at least $${(min / 1e6).toFixed(2)}M.`;
  if (s.studio.cash < amount) return 'Not enough cash to back that bid.';
  a.bid = amount;
  a.leader = s.studio.id;
  a.log.push({ studioId: s.studio.id, amount });
  rivalsRespond(a, amount);
  return a.leader === s.studio.id ? null : `${studioById(s, a.leader)?.name ?? 'A rival'} topped you instantly at $${(a.bid / 1e6).toFixed(2)}M.`;
}

function toFilm(s: GameState, a: Acquisition, studioId: string): Film {
  const f: Film = {
    id: nextId(s, 'f'), title: a.title, studioId, logline: a.logline, primaryGenre: a.primaryGenre, secondaryGenre: a.secondaryGenre, tone: a.tone, language: a.language,
    stage: 'ready', stageTurnsLeft: 0, createdT: s.t, budget: a.budget, tier: tierOf(a.budget), suggestedBudget: a.budget, marketing: 0,
    scriptQuality: clamp(a.quality + 3), quality: a.quality, qualityKnown: false, testRange: a.screened, leads: Math.min(2, a.cast.length), supports: Math.max(0, a.cast.length - 2),
    cast: a.cast.map((id, i) => ({ talentId: id, role: i < 2 ? 'lead' as const : 'support' as const, fee: 0, backend: 0, billing: i + 1, options: 0 })),
    crew: { director: { talentId: a.directorId, fee: 0 }, writer: { talentId: a.writerId, fee: 0 } },
    weekly: [], byMarket: {}, gross: 0, studioRevenue: 0, otherRevenue: 0, spent: a.bid, backendPaid: 0,
    awards: [], fyc: {}, events: [`Acquired at the ${FESTIVALS.find((x) => x.id === a.festivalId)?.name} for $${(a.bid / 1e6).toFixed(2)}M.`],
    luck: 1, buzz: clamp(a.reception * 0.4, -0.8, 2), inTheatres: false, weeksOut: 0,
    festival: { id: a.festivalId, year: a.year, reception: a.reception }, acquiredAt: a.festivalId,
  };
  s.films.push(f);
  return f;
}

export function closeFestivalMarket(s: GameState) {
  for (const a of acquisitionsList(s)) {
    if (a.status !== 'open' || a.closesT > s.t) continue;
    const st = a.leader ? studioById(s, a.leader) : undefined;
    if (!st) { a.status = 'passed'; continue; }
    if (st.isPlayer && st.cash < a.bid) {
      a.status = 'passed';
      msg(s, 'finance', `Deal for ${a.title} collapses`, 'You no longer had the cash to close.', { link: '/festivals' });
      continue;
    }
    pay(s, st.id, -a.bid, 'Acquisitions');
    const f = toFilm(s, a, st.id);
    a.status = 'sold';
    a.filmId = f.id;
    for (const c of f.cast) addLoyalty(s, c.talentId, st.id, LOYALTY.film * 0.5);
    if (st.isPlayer) {
      msg(s, 'offer', `You bought ${a.title}`, `$${(a.bid / 1e6).toFixed(2)}M for worldwide rights. It's finished: pick a release in the Release Planner.`, { link: `/release?film=${f.id}` });
      headline(`${s.studio.name} win the bidding for ${a.title}`);
    } else {
      scheduleRival(s, st, f, makeRng(s.seed, f.id, 'acq'));
      const yours = a.log.some((l) => l.studioId === s.studio.id);
      msg(s, yours ? 'offer' : 'rival', `${st.name} buy ${a.title}`, `Sold for $${(a.bid / 1e6).toFixed(2)}M.${yours ? ' You were outbid.' : ''}`, { link: '/festivals' });
    }
  }
  // Keep a couple of years of results for the market history.
  s.acquisitions = acquisitionsList(s).filter((a) => a.status === 'open' || a.year >= yearOf(s.t) - 1);
}

/** For the UI: someone on the lot's cast or crew, by name. */
export const lotPeople = (s: GameState, a: Acquisition) => ({
  director: talent(s, a.directorId), writer: talent(s, a.writerId), cast: a.cast.map((id) => talent(s, id)).filter((t) => !!t),
});
