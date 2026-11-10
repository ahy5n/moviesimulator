// TV series: develop, package, pitch to channels, sign multi-season contracts, shoot, air, renew or get cancelled.
import { CHANNELS, channelById, type Channel } from '@/data/channels';
import { GENRE_BIAS } from '../constants';
import { langName, speaks } from '../languages';
import { makeRng, clamp } from '../rng';
import { genreFit, isAvailable, override, talent } from '../talentDb';
import type { GameState, Genre, Series, SeriesFormat, SeriesOffer, Talent, Tone } from '../types';
import { loyaltyAppeal, loyaltyDiscount, loyaltyTo, addLoyalty, LOYALTY } from './loyalty';
import { setCommit } from './scripts';
import { dealBlock, dealFeeMult } from './deals';
import { seriesFacilityEffect } from './facilities';
import { actorsStrike, feeShockMult, writersStrike } from './shocks';
import { agencyBlock, agencyFeeMult, agencyNudge } from './agencies';
import { linkSpinoff } from './spinoffs';
import { headline, msg, nextId, pay, studioById } from './util';

export type FormatInfo = { lengths: number[]; runtimes: (30 | 45 | 60)[]; budget: number; oneSeason?: boolean; syndicates?: boolean; blurb: string };
export const FORMAT_INFO: Record<SeriesFormat, FormatInfo> = {
  Drama: { lengths: [6, 8, 10, 13], runtimes: [60, 45], budget: 3e6, blurb: 'Serialised drama, one story across the season.' },
  Limited: { lengths: [4, 6, 8], runtimes: [60, 45], budget: 4e6, oneSeason: true, blurb: 'One closed story, one season. Awards magnet.' },
  Sitcom: { lengths: [10, 13, 22], runtimes: [30], budget: 1.5e6, syndicates: true, blurb: 'Half-hour comedy. Cheap, and gold in syndication.' },
  Procedural: { lengths: [13, 18, 22], runtimes: [60, 45], budget: 2.5e6, syndicates: true, blurb: 'Case-of-the-week. Networks love them for years.' },
  Anthology: { lengths: [6, 8], runtimes: [60], budget: 3.5e6, blurb: 'New story and cast vibe each season.' },
  Docuseries: { lengths: [4, 6, 8], runtimes: [45, 60], budget: 0.8e6, blurb: 'Factual series. Cheap, prestige-friendly.' },
  Animated: { lengths: [10, 13, 22], runtimes: [30], budget: 1.2e6, syndicates: true, blurb: 'Animated half-hour. Slow to make, lasts forever.' },
  Soap: { lengths: [26, 52], runtimes: [45, 30], budget: 0.35e6, syndicates: true, blurb: 'Daily drama. Huge volume, tiny budgets.' },
};

export const seriesList = (s: GameState) => (s.series ??= []);
export const seriesById = (s: GameState, id: string) => seriesList(s).find((x) => x.id === id);
export const suggestedBudget = (x: Pick<Series, 'format' | 'runtime'>) => FORMAT_INFO[x.format].budget * (x.runtime / 60) * (x.runtime === 30 ? 1.6 : 1);
export const filmingTurns = (x: Series) => clamp(Math.ceil((x.episodes * x.runtime) / 60 / 3.5), 2, 8) + (x.format === 'Animated' ? 2 : 0);
export const postTurns = (x: Series) => (x.format === 'Animated' ? 3 : 2);
const airsAllAtOnce = (x: Series) => !!x.ownService || channelById(x.contract?.channelId)?.kind === 'streamer';
export const airingTurns = (x: Series) => (airsAllAtOnce(x) ? 2 : Math.min(13, Math.ceil(x.episodes / 2)));

// ---------- Development ----------

export function developSeries(s: GameState, o: {
  title: string; logline: string; format: SeriesFormat; genre: Genre; genre2?: Genre; tone: Tone; language: string;
  episodes: number; runtime: 30 | 45 | 60; budgetPerEp: number; writerId: string; turns: number; spinoffOf?: string;
}): Series | undefined {
  const w = talent(s, o.writerId);
  if (!w || writersStrike(s) || dealBlock(s, w.id, s.studio.id)) return;
  const r = makeRng(s.seed, s.t, 'tvdev', o.writerId);
  const fee = Math.round((w.fee * (0.6 + o.turns * 0.15) * dealFeeMult(s, w.id, s.studio.id)) / 10_000) * 10_000;
  const fit = 0.65 * w.genres[o.genre] + 0.35 * w.genres[o.genre2 ?? o.genre];
  const q = clamp(Math.round(0.55 * w.attrs.acting + 0.25 * fit + o.turns * 3.5 + 4 + r.normal(0, 7) - (speaks(w.languages, o.language) ? 0 : 8)), 10, 98);
  const lo = clamp(Math.round(q - r.int(3, 9)));
  const x: Series = {
    id: nextId(s, 'tv'), title: o.title, logline: o.logline, studioId: s.studio.id, format: o.format, primaryGenre: o.genre, secondaryGenre: o.genre2,
    tone: o.tone, language: o.language, episodes: o.episodes, runtime: o.runtime, budgetPerEp: o.budgetPerEp, writerId: o.writerId,
    scriptQuality: q, scriptRange: [lo, clamp(lo + 12)], stage: 'development', stageTurnsLeft: o.turns, createdT: s.t, season: 0,
    regulars: [], leads: o.format === 'Docuseries' ? 0 : o.format === 'Anthology' || o.format === 'Soap' ? 3 : 2, supports: o.format === 'Docuseries' ? 0 : 2,
    offers: [], seasons: [], spent: fee, revenue: 0, events: [], luck: clamp(r.normal(1, 0.04), 0.9, 1.1),
  };
  pay(s, s.studio.id, -fee, 'TV development');
  if (o.spinoffOf) linkSpinoff(s, x, o.spinoffOf);
  setCommit(s, o.writerId, x.id, s.studio.id, s.t + o.turns);
  seriesList(s).push(x);
  return x;
}

// ---------- Regulars (casting) ----------

export function askingPerEp(s: GameState, t: Talent, x: Series, role: 'lead' | 'support'): number {
  let fee = t.fee * (role === 'lead' ? 0.07 : 0.025);
  if (x.runtime === 30) fee *= 0.8;
  if (x.format === 'Soap') fee *= 0.5;
  if (t.attrs.starPower >= 85) fee *= 1.3; // film stars charge a premium to do TV
  fee *= 1 - loyaltyDiscount(t, loyaltyTo(s, t.id, x.studioId).total);
  fee *= Math.pow(1.06, Math.max(0, x.season - 1)) * dealFeeMult(s, t.id, x.studioId) * agencyFeeMult(s, t, x.studioId);
  return Math.max(5_000, Math.round(fee / 1_000) * 1_000);
}

export type RegularResponse = { status: 'accepted' | 'countered' | 'rejected'; counter?: number; note: string };
const counters = new Map<string, number>(); // seriesId:talentId -> last counter this session

export function canApproachRegular(s: GameState, t: Talent, x: Series): string | null {
  if (x.regulars.some((r) => r.talentId === t.id)) return 'Already a series regular.';
  const exclusive = dealBlock(s, t.id, x.studioId);
  if (exclusive) return exclusive;
  if (x.studioId === s.studio.id) { const frozen = agencyBlock(s, t); if (frozen) return frozen; }
  const walked = s.talentOverrides[t.id]?.walkedUntil;
  if (walked && walked > s.t) return `${t.name}'s agent isn't taking your calls for a while.`;
  if (!isAvailable(s, t.id) && s.commitments[t.id]?.filmId !== x.id) return `${t.name} is busy right now.`;
  if (!['development', 'pitching', 'preproduction'].includes(x.stage)) return 'Casting is locked while the season is in production.';
  return null;
}

export function approachRegular(s: GameState, seriesId: string, talentId: string, role: 'lead' | 'support', feePerEp: number): RegularResponse {
  const x = seriesById(s, seriesId)!;
  const t = talent(s, talentId)!;
  const block = canApproachRegular(s, t, x);
  if (block) return { status: 'rejected', note: block };
  const asking = askingPerEp(s, t, x, role);
  const key = `${seriesId}:${talentId}`;
  const ch = channelById(x.contract?.channelId);
  const appeal = (x.scriptQuality - 55) / 110 + (s.studio.prestige - 50) / 220 + (ch ? (ch.prestige - 0.5) * 0.15 : 0) + loyaltyAppeal(loyaltyTo(s, t.id, x.studioId).total);
  const r = makeRng(s.seed, s.t, 'reg', key, feePerEp);
  const prior = counters.get(key);
  const value = feePerEp / asking + appeal * 0.5;
  if ((prior && feePerEp >= prior) || value >= 1 + r.range(-0.04, 0.05)) {
    x.regulars.push({ talentId, role, feePerEp });
    counters.delete(key);
    agencyNudge(s, talentId, 0.3);
    return { status: 'accepted', note: `${t.name} signs on as a series regular.` };
  }
  if (value >= 0.78) {
    const counter = Math.round(Math.max(feePerEp * 1.04, asking * (1 - appeal * 0.5) * r.range(1, 1.06)) / 1_000) * 1_000;
    counters.set(key, counter);
    return { status: 'countered', counter, note: 'We like the show. Meet us at this number per episode.' };
  }
  override(s, talentId).walkedUntil = s.t + 3;
  agencyNudge(s, talentId, -0.4);
  return { status: 'rejected', note: "That's not serious money for a series regular. We're out." };
}

export function dropRegular(s: GameState, seriesId: string, talentId: string) {
  const x = seriesById(s, seriesId);
  if (!x || !['development', 'pitching', 'preproduction', 'between'].includes(x.stage)) return;
  x.regulars = x.regulars.filter((r) => r.talentId !== talentId);
  if (x.studioId === s.studio.id) agencyNudge(s, talentId, -0.5, 'You dropped one of their clients.');
}

// ---------- Quality & audience ----------

export function seriesQuality(s: GameState, x: Series): number {
  const w = talent(s, x.writerId);
  const members = x.regulars.map((r) => ({ t: talent(s, r.talentId)!, lead: r.role === 'lead' })).filter((m) => m.t);
  let cast = 55;
  if (members.length) {
    let wsum = 0, sum = 0;
    for (const m of members) {
      const k = m.lead ? 2 : 1;
      const lp = speaks(m.t.languages, x.language) ? 0 : x.format === 'Animated' ? 3 : 12;
      wsum += k; sum += k * (0.55 * genreFit(m.t, x.primaryGenre, x.secondaryGenre) + 0.45 * m.t.attrs.acting - lp);
    }
    cast = sum / wsum - Math.max(0, x.leads - members.filter((m) => m.lead).length) * 10;
  }
  const ratio = x.budgetPerEp / suggestedBudget(x);
  const budget = ratio < 1 ? 0.75 + 0.25 * ratio : Math.min(1.06, 1 + (ratio - 1) * 0.08);
  const q = (0.4 * x.scriptQuality + 0.25 * (w?.attrs.acting ?? 50) + 0.35 * cast) * budget * x.luck + seriesFacilityEffect(s, x).quality;
  return clamp(Math.round(50 + (q - 50) * 1.3), 5, 98);
}

/** How well a show suits a channel (about 0.5 = poor fit, 1 = good, 1.4 = perfect). */
function channelFit(ch: Channel, x: Series) {
  const raw = (0.65 * (ch.genres[x.primaryGenre] ?? 0.7) + 0.35 * (ch.genres[x.secondaryGenre ?? x.primaryGenre] ?? 0.7)) * (ch.formats[x.format] ?? 0.6);
  return clamp(Math.pow(raw, 0.55), 0.4, 1.45);
}
const langFit = (ch: Channel, x: Series) => (ch.languages.includes(x.language) ? 1 : ch.kind === 'streamer' ? 0.55 : 0.15);
export const expectation = (ch: Channel) => ch.reach * 0.6;

function starOf(s: GameState, x: Series) {
  const leads = x.regulars.filter((r) => r.role === 'lead').map((r) => talent(s, r.talentId)!).filter(Boolean);
  return leads.length ? leads.reduce((a, t) => a + t.attrs.starPower, 0) / leads.length : 35;
}

function ownServiceReach(s: GameState) {
  const subs = s.studio.streaming?.subscribers ?? 0;
  return Math.max(0.3, Math.sqrt(subs / 1e6) * 0.6);
}

// ---------- Pitching & contracts ----------

export function readyToPitch(x: Series) {
  return x.stage === 'pitching' && x.pitchedT === undefined && (x.pitchCooldown ?? 0) <= 0;
}

export function pitch(s: GameState, id: string) {
  const x = seriesById(s, id);
  if (!x || !readyToPitch(x)) return;
  x.pitchedT = s.t;
  x.offers = [];
  msg(s, 'offer', `${x.title} is out to buyers`, 'Channels will come back with offers next fortnight.', { link: `/tv/${x.id}` });
}

export function makeOffers(s: GameState, x: Series, renewal: boolean, onlyChannel?: string): SeriesOffer[] {
  const r = makeRng(s.seed, s.t, 'tvoffer', x.id, renewal ? 'renew' : 'pitch');
  const star = starOf(s, x);
  const out: SeriesOffer[] = [];
  const pool = CHANNELS.filter((c) => (!onlyChannel || c.id === onlyChannel) && (!c.studioId || s.rivals.some((rv) => rv.id === c.studioId)));
  for (const ch of pool) {
    if (x.budgetPerEp > ch.maxBudgetPerEp) continue;
    const crowd = seriesList(s).filter((o) => o.id !== x.id && o.contract?.channelId === ch.id && ['preproduction', 'filming', 'post', 'airing'].includes(o.stage)).length;
    const q = renewal ? (x.seasons.at(-1)?.quality ?? x.scriptQuality) : x.scriptQuality;
    const score = channelFit(ch, x) * langFit(ch, x) * Math.pow(q / 65, 1.4) * (0.8 + star / 250) * (0.9 + ch.prestige * (q - 60) / 100) * s.genreHeat[x.primaryGenre] / (1 + 0.04 * crowd) * (1 + (x.buzz ?? 0) * 0.15) + r.normal(0, 0.1);
    if (!renewal && score < 0.78) continue;
    const appetite = score + ch.boldness * 0.3 + r.normal(0, 0.1);
    let guaranteed = 1, options = 1, note = 'One season, with an option for a second.';
    const longRunner = ['Procedural', 'Sitcom', 'Soap', 'Animated'].includes(x.format) || ch.kind === 'streamer';
    if (FORMAT_INFO[x.format].oneSeason) { guaranteed = 1; options = 0; note = 'Limited series order.'; }
    // Bold channels (US networks, Indian and Latin American broadcasters) sign long deals; cautious ones (UK, Korea, Europe) rarely do.
    else if (appetite > 1.85 && longRunner && ch.boldness >= 0.55) { guaranteed = 5; options = 0; note = 'Five-season commitment. They want this for years.'; }
    else if (appetite > 1.6 && ch.boldness >= 0.4) { guaranteed = 3; options = 1; note = 'Three seasons guaranteed, option on a fourth.'; }
    else if (appetite > 1.38 && ch.boldness >= 0.3) { guaranteed = 2; options = 1; note = 'Straight-to-series: two seasons, option on a third.'; }
    if (renewal) { guaranteed = Math.min(guaranteed, 2); options = guaranteed > 1 ? 0 : 1; note = guaranteed > 1 ? 'Two-season renewal.' : 'One more season, option on another.'; }
    const prevFee = x.contract?.feePerEp ?? 0;
    const costPerEp = x.budgetPerEp + x.regulars.reduce((a, reg) => a + reg.feePerEp, 0);
    let fee = costPerEp * ch.payRatio * clamp(0.72 + (score - 0.85) * 0.5, 0.6, 1.2) * (guaranteed >= 3 ? 0.93 : 1) * feeShockMult(s);
    if (renewal && prevFee) fee = Math.max(fee, prevFee * (score > 1.1 ? 1.2 : 1.05));
    out.push({ id: nextId(s, 'of'), channelId: ch.id, guaranteed, options, feePerEp: Math.round(fee / 10_000) * 10_000, expires: s.t + (renewal ? 4 : 3), renewal, note });
  }
  return out.sort((a, b) => b.feePerEp * (b.guaranteed + b.options * 0.5) - a.feePerEp * (a.guaranteed + a.options * 0.5)).slice(0, renewal ? 1 : 4);
}

export function acceptOffer(s: GameState, id: string, offerId: string) {
  const x = seriesById(s, id);
  const o = x?.offers.find((y) => y.id === offerId);
  if (!x || !o || o.expires < s.t) return;
  x.contract = { channelId: o.channelId, guaranteedLeft: o.guaranteed, optionsLeft: o.options, feePerEp: o.feePerEp, signedT: s.t };
  x.ownService = false;
  x.offers = [];
  x.stage = 'preproduction';
  const ch = channelById(o.channelId)!;
  x.events.push(`Signed with ${ch.name}: ${o.note} ($${(o.feePerEp / 1e6).toFixed(2)}M per episode).`);
  msg(s, 'news', `${ch.name} orders ${x.title}`, o.note, { link: `/tv/${x.id}` });
}

export function keepOnOwnService(s: GameState, id: string) {
  const x = seriesById(s, id);
  if (!x || !s.studio.streaming) return;
  x.ownService = true;
  x.contract = undefined;
  x.offers = [];
  if (x.stage === 'pitching' || x.stage === 'between') x.stage = 'preproduction';
  x.events.push(`Kept in-house as a ${s.studio.streaming.name} original.`);
}

export function seasonCost(s: GameState, x: Series) {
  return x.budgetPerEp * x.episodes * (1 - seriesFacilityEffect(s, x).saving) + x.regulars.reduce((a, r) => a + r.feePerEp, 0) * x.episodes;
}

/** Fortnights between season starts: a year for most shows, continuous for soaps. */
export const seasonCycle = (x: Series) => (x.format === 'Soap' ? 13 : 26);
export const nextSeasonAllowedT = (x: Series) => (x.lastSeasonStartT === undefined ? 0 : x.lastSeasonStartT + seasonCycle(x) - (x.format === 'Limited' ? 0 : postTurns(x) + 2));

export function startIssues(s: GameState, x: Series): string[] {
  const out: string[] = [];
  if (x.stage !== 'preproduction') out.push('Not ready to shoot.');
  if (writersStrike(s)) out.push("The writers' strike: no scripts, no new season.");
  if (actorsStrike(s) && x.format !== 'Animated' && x.format !== 'Docuseries') out.push("The actors' strike: nothing can start shooting.");
  const wait = nextSeasonAllowedT(x) - s.t;
  if (wait > 0) out.push(`The writers' room needs ${wait} more fortnight${wait > 1 ? 's' : ''} before season ${x.season + 1} can shoot.`);
  const leads = x.regulars.filter((r) => r.role === 'lead').length;
  if (leads < x.leads) out.push(`Cast ${x.leads - leads} more lead${x.leads - leads > 1 ? 's' : ''}.`);
  for (const r of x.regulars) if (!isAvailable(s, r.talentId) && s.commitments[r.talentId]?.filmId !== x.id) out.push(`${talent(s, r.talentId)?.name} is busy.`);
  if ((studioById(s, x.studioId)?.cash ?? 0) < x.regulars.reduce((a, r) => a + r.feePerEp, 0) * x.episodes) out.push('Not enough cash for regulars’ fees.');
  return out;
}

/** Start shooting the next season. Regulars are paid for the season up front; production is paid while filming. */
export function startSeason(s: GameState, id: string) {
  const x = seriesById(s, id);
  if (!x || startIssues(s, x).length) return;
  x.season++;
  x.lastSeasonStartT = s.t;
  if (x.contract) {
    if (x.contract.guaranteedLeft > 0) x.contract.guaranteedLeft--;
    else if (x.contract.optionsLeft > 0) x.contract.optionsLeft--;
  }
  if (x.season > 1) for (const r of x.regulars) r.feePerEp = Math.round(r.feePerEp * 1.06 / 1_000) * 1_000;
  const fees = x.regulars.reduce((a, r) => a + r.feePerEp, 0) * x.episodes;
  x.spent += fees;
  pay(s, x.studioId, -fees, 'TV talent');
  const r = makeRng(s.seed, x.id, 'season', x.season);
  const prev = x.seasons.at(-1)?.quality;
  const base = seriesQuality(s, x);
  const w = talent(s, x.writerId);
  const quality = prev === undefined ? base : clamp(Math.round(0.5 * base + 0.5 * prev + r.normal(-1.5, 3.5) + ((w?.attrs.acting ?? 60) - 60) / 20));
  x.current = { quality, viewers: [], aired: 0, critic: 0, audience: 0 };
  x.stage = 'filming';
  x.stageTurnsLeft = filmingTurns(x);
  for (const reg of x.regulars) setCommit(s, reg.talentId, x.id, x.studioId, s.t + x.stageTurnsLeft);
}

export function endSeries(s: GameState, id: string) {
  const x = seriesById(s, id);
  if (!x || ['filming', 'post', 'airing'].includes(x.stage)) return;
  x.stage = 'ended';
  x.offers = [];
  msg(s, 'news', `${x.title} comes to an end`, `${x.seasons.length} season${x.seasons.length === 1 ? '' : 's'}, ${x.seasons.reduce((a, b) => a + b.episodes, 0)} episodes.`, { link: `/tv/${x.id}` });
}

// ---------- Turn ----------

/** Your shows report everything; rival shows only make the news when they matter. */
function note(s: GameState, x: Series, kind: Parameters<typeof msg>[1], title: string, body: string, extra: Parameters<typeof msg>[4] = {}) {
  if (x.studioId === s.studio.id) { msg(s, kind, title, body, extra); return; }
  const big = (x.current?.quality ?? x.seasons.at(-1)?.quality ?? 0) >= 78;
  if (big && /premieres|cancelled|syndication/.test(title)) msg(s, 'rival', `${studioById(s, x.studioId)?.name}: ${title}`, body, extra);
}
const mineHeadline = (s: GameState, x: Series, text: string) => { if (x.studioId === s.studio.id) headline(text); };

const TRAVEL: Record<string, number> = { en: 1, ko: 0.9, es: 0.8, ja: 0.7, hi: 0.6, fr: 0.6 };

export function advanceSeries(s: GameState) {
  for (const x of seriesList(s)) {
    x.offers = x.offers.filter((o) => o.expires >= s.t);
    if (x.pitchCooldown) x.pitchCooldown--;
    switch (x.stage) {
      case 'development':
        if (--x.stageTurnsLeft <= 0) {
          x.stage = 'pitching';
          note(s, x, 'news', `${x.title}: pilot script delivered`, `Quality ${x.scriptRange[0]}–${x.scriptRange[1]}. Attach some stars, then pitch it to channels${s.studio.streaming ? ' or keep it for your own service' : ''}.`, { link: `/tv/${x.id}` });
        }
        break;
      case 'pitching':
        if (x.pitchedT !== undefined && s.t >= x.pitchedT && !x.offers.length) {
          const offers = makeOffers(s, x, false);
          x.pitchedT = undefined;
          if (offers.length) {
            x.offers = offers;
            note(s, x, 'offer', `${offers.length} offer${offers.length > 1 ? 's' : ''} for ${x.title}`, offers.map((o) => `• ${channelById(o.channelId)!.name}: ${o.note}`).join('\n'), { link: `/tv/${x.id}` });
          } else {
            x.pitchCooldown = 3;
            note(s, x, 'offer', `No takers for ${x.title}`, 'Every channel passed. Strengthen the package (stars, budget, language fit) and pitch again in six weeks.', { link: `/tv/${x.id}` });
          }
        }
        break;
      case 'filming': {
        if (actorsStrike(s) && x.format !== 'Animated' && x.format !== 'Docuseries') break;
        const perTurn = (x.budgetPerEp * x.episodes * (1 - seriesFacilityEffect(s, x).saving)) / filmingTurns(x);
        x.spent += perTurn;
        pay(s, x.studioId, -perTurn, 'TV production');
        if (--x.stageTurnsLeft <= 0) { x.stage = 'post'; x.stageTurnsLeft = postTurns(x); }
        break;
      }
      case 'post':
        if (--x.stageTurnsLeft <= 0) premiere(s, x);
        break;
      case 'airing':
        airTurn(s, x);
        break;
      case 'between':
        if (!x.offers.length && !x.ownService) {
          x.stage = 'ended';
          x.events.push('The renewal offer lapsed. The series has ended.');
        }
        break;
    }
  }
}

function premiere(s: GameState, x: Series) {
  const r = makeRng(s.seed, x.id, 'reviews', x.season);
  const q = x.current!.quality;
  const b = GENRE_BIAS[x.primaryGenre];
  x.current!.critic = clamp(Math.round(q + b.critic + r.normal(0, 6)), 1, 99);
  x.current!.audience = clamp(Math.round(q * 0.72 + 20 + b.audience + r.normal(0, 6)), 5, 99);
  x.stage = 'airing';
  x.stageTurnsLeft = airingTurns(x);
  const where = x.ownService ? s.studio.streaming?.name : channelById(x.contract?.channelId)?.name;
  note(s, x, 'news', `${x.title} season ${x.season} premieres on ${where}`, `Critics ${x.current!.critic}, audiences ${x.current!.audience}.`, { link: `/tv/${x.id}` });
}

function airTurn(s: GameState, x: Series) {
  const cur = x.current!;
  const total = airingTurns(x);
  const eps = Math.min(x.episodes - cur.aired, Math.ceil(x.episodes / total));
  const ch = channelById(x.contract?.channelId);
  const reach = x.ownService ? ownServiceReach(s) : ch!.reach;
  const fit = x.ownService ? 1 : channelFit(ch!, x) * langFit(ch!, x);
  const r = makeRng(s.seed, x.id, 'air', x.season, cur.aired);
  const prev = x.seasons.at(-1);
  const momentum = (prev ? clamp(Math.sqrt(prev.viewers / Math.max(0.1, reach * 0.8)), 0.8, 1.15) : 1) * (x.season > 3 ? Math.pow(0.92, x.season - 3) : 1);
  const wom = 0.4 * cur.critic + 0.6 * cur.audience;
  const rivalsOnAir = seriesList(s).filter((o) => o.id !== x.id && o.stage === 'airing');
  const sameChannel = x.contract ? rivalsOnAir.filter((o) => o.contract?.channelId === x.contract!.channelId).length : 0;
  const sameGenre = rivalsOnAir.filter((o) => o.primaryGenre === x.primaryGenre).length;
  const competition = Math.max(0.7, 1 / (1 + 0.05 * sameChannel + 0.015 * sameGenre)) * (1 + (x.buzz ?? 0) * 0.15);
  const ep = reach * Math.pow(cur.quality / 70, 1.6) * (0.8 + starOf(s, x) / 300) * s.genreHeat[x.primaryGenre] * fit * momentum * competition * 0.8;
  for (let i = 0; i < eps; i++) {
    const decay = Math.pow(1 - clamp(0.08 - wom / 1000, -0.02, 0.07), cur.aired + i);
    cur.viewers.push(Math.max(0.01, ep * decay * Math.exp(r.normal(0, 0.12))));
  }
  cur.aired += eps;
  if (x.contract && !x.ownService) {
    const fee = x.contract.feePerEp * eps;
    x.revenue += fee;
    pay(s, x.studioId, fee, 'TV licence fees');
  }
  if (--x.stageTurnsLeft <= 0 || cur.aired >= x.episodes) seasonEnd(s, x);
}

function seasonEnd(s: GameState, x: Series) {
  const cur = x.current!;
  const viewers = cur.viewers.reduce((a, b) => a + b, 0) / Math.max(1, cur.viewers.length);
  const ch = channelById(x.contract?.channelId);
  const exp = ch ? expectation(ch) : ownServiceReach(s) * 0.6;
  const hitOwn = x.ownService && viewers >= exp * 1.6;
  if (hitOwn && s.studio.streaming) s.studio.streaming.exclusivesBoost = Math.min(0.3, (s.studio.streaming.exclusivesBoost ?? 0) + 0.05);
  const result = { n: x.season, quality: cur.quality, critic: cur.critic, audience: cur.audience, viewers, episodes: x.episodes, airedFrom: s.t - airingTurns(x) + 1, feePerEp: x.contract?.feePerEp ?? 0 } as Series['seasons'][number];
  if (x.ownService) result.pull = Math.round(seriesPullRaw(s, x));
  x.seasons.push(result);
  x.current = undefined;
  x.buzz = (x.buzz ?? 0) * 0.5; // award buzz fades season by season
  const hit = viewers >= exp * 1.6;
  // International sales (not for your own originals) and syndication.
  if (!x.ownService) {
    const intl = x.budgetPerEp * x.episodes * 0.2 * (TRAVEL[x.language] ?? 0.5) * clamp(viewers / exp, 0.4, 2);
    x.revenue += intl;
    pay(s, x.studioId, intl, 'TV international sales');
    const totalEps = x.seasons.reduce((a, b) => a + b.episodes, 0);
    if (!x.syndicated && FORMAT_INFO[x.format].syndicates && totalEps >= 88) {
      x.syndicated = true;
      const amount = totalEps * x.budgetPerEp * 0.6;
      x.revenue += amount;
      pay(s, x.studioId, amount, 'Syndication');
      note(s, x, 'finance', `${x.title} sold into syndication`, `${totalEps} episodes. A $${(amount / 1e6).toFixed(0)}M payday.`, { link: `/tv/${x.id}` });
      mineHeadline(s, x, `${x.title} hits syndication`);
    }
  }
  if (hit) for (const reg of x.regulars) { const ov = override(s, reg.talentId); ov.star = (ov.star ?? 0) + 2; }
  // A hit season warms the franchise it belongs to.
  const fr = x.franchiseId ? s.franchises.find((f) => f.id === x.franchiseId) : undefined;
  if (fr && (hit || (x.ownService && cur.audience >= 75))) fr.heat += 0.1;
  for (const reg of x.regulars) addLoyalty(s, reg.talentId, x.studioId, LOYALTY.film * 0.5);
  const owner = studioById(s, x.studioId);
  if (owner) owner.prestige = clamp(owner.prestige + (cur.critic >= 85 ? 1 : 0));
  const label = `${x.title} S${x.season}: ${viewers.toFixed(2)}M viewers/ep`;
  mineHeadline(s, x, label);

  if (FORMAT_INFO[x.format].oneSeason) { result.outcome = 'ended'; x.stage = 'ended'; note(s, x, 'news', `${x.title} wraps its limited run`, label, { link: `/tv/${x.id}` }); return; }
  if (x.ownService) { result.outcome = 'ended'; x.stage = 'between'; note(s, x, 'news', `${x.title} season ${x.season} complete`, `${label}. Order another season or end it.`, { link: `/tv/${x.id}` }); return; }
  const c = x.contract!;
  if (c.guaranteedLeft > 0) {
    result.outcome = 'renewed';
    x.stage = 'preproduction';
    note(s, x, 'news', `${x.title} back for season ${x.season + 1}`, `${label}. Your contract guarantees ${c.guaranteedLeft} more season${c.guaranteedLeft > 1 ? 's' : ''}.`, { link: `/tv/${x.id}` });
  } else if (c.optionsLeft > 0) {
    if (viewers >= exp) {
      result.outcome = 'picked up';
      x.stage = 'preproduction';
      note(s, x, 'news', `${ch!.name} picks up ${x.title}`, `${label}. They exercised their option for season ${x.season + 1}.`, { link: `/tv/${x.id}` });
    } else cancel(s, x, `${label}, below the ${exp.toFixed(1)}M ${ch!.name} needed.`);
  } else if (viewers >= exp * 0.9) {
    x.offers = makeOffers(s, x, true, c.channelId);
    if (x.offers.length) {
      result.outcome = 'offered renewal';
      x.stage = 'between';
      note(s, x, 'offer', `${ch!.name} wants more ${x.title}`, `${label}. ${x.offers[0].note}`, { link: `/tv/${x.id}` });
    } else cancel(s, x, label);
  } else cancel(s, x, `${label}. Not enough to renew.`);
}

function cancel(s: GameState, x: Series, why: string) {
  const res = x.seasons.at(-1);
  if (res) res.outcome = 'cancelled';
  x.stage = 'cancelled';
  note(s, x, 'news', `${x.title} cancelled`, why, { link: `/tv/${x.id}` });
}

/** Subscribers a series pulls to a streaming service. Bigger, longer-running and better shows pull more; a season on air pulls hardest. */
export function seriesPullRaw(s: GameState, x: Series): number {
  const last = x.seasons.at(-1);
  const cur = x.stage === 'airing' ? x.current : undefined;
  if (!last && !cur) return 0;
  const q = cur ? 0.5 * cur.quality + 0.5 * (cur.audience || cur.quality) : 0.5 * last!.quality + 0.5 * last!.audience;
  const age = cur ? 0 : Math.max(0, (s.t - last!.airedFrom) / 26);
  const scale = clamp(Math.sqrt((x.budgetPerEp * x.episodes) / 20e6), 0.5, 2.5);
  const run = 1 + 0.25 * Math.max(0, x.seasons.length - (cur ? 0 : 1));
  return 550_000 * Math.pow(q / 65, 2.2) * scale * run * (1 + (x.buzz ?? 0) * 0.2) * (0.8 + starOf(s, x) / 250) * Math.pow(0.85, age);
}
export const seriesPull = (s: GameState, x: Series) => (x.ownService ? seriesPullRaw(s, x) : 0);

export const seriesProfit = (x: Series) => x.revenue - x.spent;
export const describeLanguage = (x: Series) => langName(x.language);

const STAGE: Record<Series['stage'], string> = {
  development: 'Writing pilot', pitching: 'Ready to pitch', preproduction: 'Pre-production', filming: 'Filming', post: 'Post-production',
  airing: 'On air', between: 'Awaiting renewal', ended: 'Ended', cancelled: 'Cancelled',
};
export const seriesStageLabel = (x: Series) =>
  x.offers.length ? (x.offers[0].renewal ? 'Renewal offer' : 'Offers in') : x.stage === 'pitching' && x.pitchedT !== undefined ? 'Out to buyers' : STAGE[x.stage];

