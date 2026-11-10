// Rival studios make TV too: they develop shows, cast real people, sell to channels (or their own streamer) and renew hits.
import { CHANNELS } from '@/data/channels';
import { speaks } from '../languages';
import { makeRng, clamp, type RNG } from '../rng';
import { genreFit, getDB, isAvailable, talent } from '../talentDb';
import { genLogline, genTitle } from '../titles';
import { GENRES, type GameState, type Genre, type Series, type SeriesFormat, type Studio, type Talent } from '../types';
import { RIVAL_LANGUAGE } from './rivals';
import { FORMAT_INFO, askingPerEp, makeOffers, seriesList, startIssues, startSeason, suggestedBudget } from './tv';
import { nextId, pay } from './util';
import { dealBlock } from './deals';
import { writersStrike } from './shocks';

/** Shows each rival starts per year. Netflix and Sony are TV factories; Neon makes none. */
const TV_SLATE: Record<string, number> = { disney: 4, wb: 5, universal: 4, paramount: 4, sony: 6, lionsgate: 3, a24: 2, netflix: 9, amazon: 6, apple: 4, neon: 0, yrf: 2 };

const FORMAT_TASTE: Record<string, Partial<Record<SeriesFormat, number>>> = {
  disney: { Animated: 3, Sitcom: 2, Drama: 1.5, Limited: 1 },
  sony: { Procedural: 3, Sitcom: 2, Drama: 2, Animated: 1 },
  netflix: { Drama: 3, Limited: 2.5, Docuseries: 2, Sitcom: 1.5, Animated: 1, Anthology: 1 },
  apple: { Drama: 3, Limited: 2, Sitcom: 1.5, Docuseries: 1 },
  amazon: { Drama: 3, Limited: 1.5, Sitcom: 1 },
  yrf: { Soap: 3, Drama: 2 },
  a24: { Limited: 3, Drama: 2, Sitcom: 1 },
};
const DEFAULT_TASTE: Partial<Record<SeriesFormat, number>> = { Drama: 3, Procedural: 2, Sitcom: 2, Limited: 1.5, Animated: 0.8, Docuseries: 0.6, Anthology: 0.6, Soap: 0.3 };

function genreFor(format: SeriesFormat, st: Studio, s: GameState, r: RNG): Genre {
  if (format === 'Sitcom') return 'Comedy';
  if (format === 'Docuseries') return 'Documentary';
  if (format === 'Animated') return r.chance(0.6) ? 'Animation' : r.pick(['Comedy', 'Family'] as Genre[]);
  if (format === 'Procedural') return r.pick(['Crime', 'Thriller', 'Drama'] as Genre[]);
  if (format === 'Soap') return r.pick(['Romance', 'Drama', 'Family'] as Genre[]);
  return r.weighted(GENRES.filter((g) => g !== 'Animation' && g !== 'Documentary'), (g) => (st.personality?.genres[g] ?? 0.5) * s.genreHeat[g]);
}

function pickPerson(s: GameState, r: RNG, kind: Talent['kind'], language: string, score: (t: Talent) => number, exclude: Set<string>, samples = 60, studioId?: string): Talent | undefined {
  const all = getDB().all;
  let best: Talent | undefined, bestScore = -1e9;
  for (let i = 0; i < samples; i++) {
    const b = all[Math.floor(r() * all.length)];
    if (!b || b.kind !== kind || exclude.has(b.id) || !isAvailable(s, b.id) || (studioId && dealBlock(s, b.id, studioId))) continue;
    const t = talent(s, b.id)!;
    const sc = score(t) - (speaks(t.languages, language) ? 0 : 40) + r.range(0, 6);
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  return best;
}

function castRegulars(s: GameState, x: Series, r: RNG) {
  const taken = new Set(x.regulars.map((reg) => reg.talentId));
  const need = (role: 'lead' | 'support') => (role === 'lead' ? x.leads : x.supports) - x.regulars.filter((reg) => reg.role === role).length;
  for (const role of ['lead', 'support'] as const) {
    for (let i = need(role); i > 0; i--) {
      const cap = role === 'lead' ? Math.max(60_000, x.budgetPerEp * 0.25) : Math.max(20_000, x.budgetPerEp * 0.08);
      const t = pickPerson(s, r, 'actor', x.language, (c) => (askingPerEp(s, c, x, role) > cap ? -999 : 0.5 * genreFit(c, x.primaryGenre, x.secondaryGenre) + 0.35 * c.attrs.overall + (role === 'lead' ? 0.2 * c.attrs.starPower : 0)), taken, 60, x.studioId);
      if (!t) break;
      taken.add(t.id);
      x.regulars.push({ talentId: t.id, role, feePerEp: askingPerEp(s, t, x, role) });
    }
  }
}

export function startRivalSeries(s: GameState, st: Studio, r: RNG): Series | undefined {
  const p = st.personality!;
  const format = r.weighted(Object.entries(FORMAT_TASTE[st.id] ?? DEFAULT_TASTE) as [SeriesFormat, number][], ([, w]) => w)[0];
  const info = FORMAT_INFO[format];
  const genre = genreFor(format, st, s, r);
  const language = RIVAL_LANGUAGE[st.id]?.(r) ?? 'en';
  const runtime = info.runtimes[0];
  const episodes = r.pick(info.lengths);
  const big = p.budgetBias.includes('Tentpole') || p.prestige > 0.7;
  const budgetPerEp = Math.round((suggestedBudget({ format, runtime }) * r.range(0.8, big ? 2.2 : 1.3)) / 50_000) * 50_000;
  const writer = pickPerson(s, r, 'writer', language, (w) => 0.6 * w.attrs.acting + 0.4 * genreFit(w, genre), new Set(), 40, st.id);
  if (!writer) return;
  const fit = genreFit(writer, genre);
  const quality = clamp(Math.round(0.55 * writer.attrs.acting + 0.25 * fit + 11 + p.prestige * 6 + r.normal(0, 7) - (speaks(writer.languages, language) ? 0 : 8)), 10, 97);
  const x: Series = {
    id: nextId(s, 'tv'), title: genTitle(r, genre), logline: genLogline(r, genre, undefined, 'balanced'), studioId: st.id,
    format, primaryGenre: genre, tone: 'balanced', language, episodes, runtime, budgetPerEp, writerId: writer.id,
    scriptQuality: quality, scriptRange: [quality - 6, quality + 6], stage: 'preproduction', stageTurnsLeft: 0, createdT: s.t, season: 0,
    regulars: [], leads: format === 'Docuseries' ? 0 : format === 'Anthology' || format === 'Soap' ? 3 : 2, supports: format === 'Docuseries' ? 0 : 2,
    offers: [], seasons: [], spent: 0, revenue: 0, events: [], luck: clamp(r.normal(1, 0.04), 0.9, 1.1),
  };
  castRegulars(s, x, r);
  // Sell it: to their own streamer most of the time, otherwise to whichever channel bites.
  const own = CHANNELS.find((c) => c.studioId === st.id);
  let offer = own && r.chance(0.75) ? makeOffers(s, x, false, own.id)[0] : undefined;
  if (!offer) offer = makeOffers(s, x, false).find((o) => o.channelId !== own?.id) ?? (own ? makeOffers(s, x, false, own.id)[0] : undefined);
  if (!offer && own) offer = { id: '', channelId: own.id, guaranteed: 1, options: 1, feePerEp: Math.round(budgetPerEp * own.payRatio), expires: s.t, note: '' };
  if (!offer) return;
  x.contract = { channelId: offer.channelId, guaranteedLeft: offer.guaranteed, optionsLeft: offer.options, feePerEp: offer.feePerEp, signedT: s.t };
  const fee = Math.round(writer.fee * 0.9);
  x.spent += fee;
  pay(s, st.id, -fee, 'TV development');
  seriesList(s).push(x);
  return x;
}

/** Rivals keep their shows moving: recast busy regulars, shoot the next season, take renewal deals. */
export function advanceRivalTV(s: GameState) {
  for (const st of s.rivals) {
    if (!st.personality) continue;
    const r = makeRng(s.seed, s.t, 'rivaltv', st.id);
    const mine = seriesList(s).filter((x) => x.studioId === st.id && x.stage !== 'ended' && x.stage !== 'cancelled');
    const perYear = TV_SLATE[st.id] ?? Math.round(st.personality.slate * 0.3);
    if (perYear && !writersStrike(s) && mine.length < perYear * 1.5 && r.chance(perYear / 26)) startRivalSeries(s, st, r);
    for (const x of mine) {
      if (x.stage === 'between' && x.offers.length) {
        const o = x.offers[0];
        x.contract = { channelId: o.channelId, guaranteedLeft: o.guaranteed, optionsLeft: o.options, feePerEp: o.feePerEp, signedT: s.t };
        x.offers = [];
        x.stage = 'preproduction';
      }
      if (x.stage === 'preproduction') {
        x.regulars = x.regulars.filter((reg) => isAvailable(s, reg.talentId) || s.commitments[reg.talentId]?.filmId === x.id);
        castRegulars(s, x, r);
        if (st.cash < 1e8) st.cash += 1e8;
        if (!startIssues(s, x).length) startSeason(s, x.id);
      }
    }
  }
}

/** Keep saves small: forget rival shows that ended long ago. */
export function pruneRivalTV(s: GameState) {
  s.series = seriesList(s).filter((x) => x.studioId === s.studio.id || !(x.stage === 'ended' || x.stage === 'cancelled') || (x.seasons.at(-1)?.airedFrom ?? 0) > s.t - 52 || (x.awards?.length ?? 0) > 0);
}
