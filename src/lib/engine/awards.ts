// Awards season, For Your Consideration campaigns and film festivals.
import { AWARD_BODIES, FESTIVALS, categoriesFor, tvCategoriesFor } from '@/data/awards';
import { channelById } from '@/data/channels';
import { monthOf, turnInYear, yearOf } from '../calendar';
import { GENRE_BIAS } from '../constants';
import { makeRng, clamp, type RNG } from '../rng';
import { override, talent } from '../talentDb';
import type { Ceremony, Film, GameState, Nominee, Series } from '../types';
import { headline, msg, nextId, pay, studioById } from './util';
import { addLoyalty, LOYALTY } from './loyalty';
import { addBoardLoyalty, BOARD_LOYALTY } from './finance';
import { closeFestivalMarket, openFestivalMarket } from './acquisitions';

const ENGLISH = new Set(['US', 'GB', 'CA', 'AU', 'IE', 'NZ']);

const campaignBoost = (spend: number) => 9 * Math.log10(1 + spend / 250_000);

export function eligibleFilms(s: GameState, year: number): Film[] {
  return s.films.filter((f) => f.release && f.release.type !== 'sold' && yearOf(f.release.t) === year && (f.stage === 'released' || f.stage === 'library') && f.critic !== undefined);
}

function filmScore(s: GameState, f: Film, r: RNG, critics: number): number {
  const prestige = 0.65 * GENRE_BIAS[f.primaryGenre].prestige + 0.35 * GENRE_BIAS[f.secondaryGenre ?? f.primaryGenre].prestige;
  const late = monthOf(f.release!.t) >= 8 ? 5 : monthOf(f.release!.t) >= 5 ? 1 : -2;
  const st = studioById(s, f.studioId);
  return (1 - critics) * f.quality + critics * f.critic! + prestige * 10 + late + (st?.prestige ?? 50) / 25
    + (f.festival ? f.festival.reception * 4 : 0) + r.normal(0, 4);
}

type Cand = Nominee & { campaignKey: string };

function candidates(s: GameState, films: Film[], cat: string, r: RNG, critics: number): Cand[] {
  const out: Cand[] = [];
  for (const f of films) {
    const base = filmScore(s, f, r, critics);
    const camp = campaignBoost(f.fyc[cat] ?? 0) + campaignBoost(f.fyc['Best Picture'] ?? 0) * 0.3;
    const push = (score: number, talentId?: string) => out.push({ filmId: f.id, talentId, studioId: f.studioId, score: score + camp, campaignKey: cat });
    switch (cat) {
      case 'Best Picture': case 'Best Ensemble':
        if (cat === 'Best Ensemble') {
          const cast = f.cast.map((c) => talent(s, c.talentId)!).filter(Boolean);
          if (cast.length >= 2) push(base * 0.6 + (cast.reduce((a, t) => a + t.attrs.acting, 0) / cast.length) * 0.4);
        } else push(base);
        break;
      case 'Best Director': {
        const d = f.crew.director && talent(s, f.crew.director.talentId);
        if (d) push(base * 0.75 + d.attrs.acting * 0.25, d.id);
        break;
      }
      case 'Best Screenplay': push(0.55 * f.scriptQuality + 0.45 * base, f.crew.writer?.talentId); break;
      case 'Best Animated Feature': if (f.primaryGenre === 'Animation') push(base); break;
      case 'Best International Feature': {
        // Not in English. Older saves without a language fall back to the leads' nationality.
        const leads = f.cast.filter((c) => c.role === 'lead').map((c) => talent(s, c.talentId)!).filter(Boolean);
        const foreign = f.language ? f.language !== 'en' : leads.length > 0 && leads.every((t) => !ENGLISH.has(t.nationality));
        if (foreign) push(base);
        break;
      }
      case 'Best Score': case 'Best Cinematography': case 'Best Editing': {
        const role = cat === 'Best Score' ? 'composer' : cat === 'Best Cinematography' ? 'cinematographer' : 'editor';
        const c = f.crew[role] && talent(s, f.crew[role]!.talentId);
        if (c) push(base * 0.6 + c.attrs.acting * 0.4, c.id);
        break;
      }
      default: {
        const lead = cat === 'Best Actor' || cat === 'Best Actress';
        const female = cat.includes('Actress');
        for (const c of f.cast) {
          if ((c.role === 'lead') !== lead) continue;
          const t = talent(s, c.talentId);
          if (!t || (female ? t.gender !== 'F' : t.gender === 'F')) continue;
          push(0.45 * t.attrs.acting + 0.35 * base + 0.2 * t.genres[f.primaryGenre] + r.normal(0, 3), t.id);
        }
      }
    }
  }
  return out;
}

// ---------- TV ----------

type TvKind = 'drama' | 'comedy' | 'limited' | 'doc' | 'animated';
function tvKind(x: Series): TvKind {
  if (x.format === 'Limited') return 'limited';
  if (x.format === 'Docuseries') return 'doc';
  if (x.format === 'Animated') return 'animated';
  if (x.format === 'Sitcom' || x.primaryGenre === 'Comedy') return 'comedy';
  return 'drama';
}
const TV_CAT_KIND: Record<string, TvKind | 'any'> = {
  'Best TV Drama': 'drama', 'Best TV Comedy': 'comedy', 'Best TV Limited Series': 'limited', 'Best Actor – Television': 'any', 'Best Actress – Television': 'any',
  'Best Drama Series': 'drama', 'Best Comedy Series': 'comedy', 'Best Limited Series': 'limited', 'Best Docuseries': 'doc', 'Best Animated Series': 'animated',
  'Best Actor in a Drama Series': 'drama', 'Best Actress in a Drama Series': 'drama', 'Best Actor in a Comedy Series': 'comedy',
  'Best Actress in a Comedy Series': 'comedy', 'Best Actor in a Limited Series': 'limited', 'Best Actress in a Limited Series': 'limited',
};

/** Seasons eligible for a TV body: Golden Lens looks at last calendar year, the Crystals at the last 12 months. */
function eligibleSeasons(s: GameState, bodyId: string) {
  const out: { x: Series; season: Series['seasons'][number] }[] = [];
  const y = yearOf(s.t) - 1;
  for (const x of s.series ?? []) {
    for (const sea of x.seasons) {
      const ok = bodyId === 'lens' ? yearOf(sea.airedFrom) === y : sea.airedFrom >= s.t - 26 && sea.airedFrom < s.t;
      if (ok) out.push({ x, season: sea });
    }
  }
  return out;
}

function tvCandidates(s: GameState, pool: ReturnType<typeof eligibleSeasons>, cat: string, r: RNG, critics: number): Nominee[] {
  const kind = TV_CAT_KIND[cat];
  const acting = /Actor|Actress/.test(cat);
  const female = /Actress/.test(cat);
  const out: Nominee[] = [];
  for (const { x, season } of pool) {
    if (kind !== 'any' && tvKind(x) !== kind) continue;
    const ch = channelById(x.contract?.channelId);
    const prestige = ch ? (ch.kind === 'premium' ? 8 : ch.kind === 'streamer' ? 5 : 2) * ch.prestige : 4;
    const st = studioById(s, x.studioId);
    const base = (1 - critics) * season.quality + critics * season.critic + prestige + (st?.prestige ?? 50) / 25 + r.normal(0, 4)
      + campaignBoost(x.fyc?.[cat] ?? 0) + campaignBoost(x.fyc?.['Series campaign'] ?? 0) * 0.8;
    if (!acting) { out.push({ filmId: '', seriesId: x.id, season: season.n, studioId: x.studioId, score: base }); continue; }
    for (const reg of x.regulars) {
      if (reg.role !== 'lead') continue;
      const t = talent(s, reg.talentId);
      if (!t || (female ? t.gender !== 'F' : t.gender === 'F')) continue;
      out.push({ filmId: '', seriesId: x.id, season: season.n, talentId: t.id, studioId: x.studioId, score: 0.45 * t.attrs.acting + 0.35 * base + 0.2 * t.genres[x.primaryGenre] + r.normal(0, 3) });
    }
  }
  // One nomination per series per category (best performer for acting categories).
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((n) => { const k = `${n.seriesId}:${n.talentId ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------- Nominations & ceremonies ----------

const nomineeKey = (n: Nominee) => n.seriesId ?? n.filmId;

export function nominate(s: GameState, bodyId: string) {
  const body = AWARD_BODIES.find((b) => b.id === bodyId)!;
  const year = bodyId === 'crystal' ? yearOf(s.t) : yearOf(s.t) - 1;
  const films = body.film === false ? [] : eligibleFilms(s, year);
  const seasons = body.tv ? eligibleSeasons(s, bodyId) : [];
  if (!films.length && !seasons.length) return;
  const r = makeRng(s.seed, year, 'noms', bodyId);
  const cer: Ceremony = { id: nextId(s, 'c'), body: bodyId, year, t: s.t - turnInYear(s.t) + body.ceremonyTurn, categories: [], viewed: false };
  let mine = 0;
  const add = (cat: string, noms: Nominee[]) => {
    if (noms.length < 2) return;
    cer.categories.push({ name: cat, nominees: noms, winner: -1 });
    mine += noms.filter((n) => n.studioId === s.studio.id).length;
  };
  if (films.length) for (const cat of categoriesFor(bodyId, s.settings.crewMode === 'full')) {
    add(cat, candidates(s, films, cat, r, body.critics).sort((a, b) => b.score - a.score).slice(0, 5).map(({ campaignKey: _, ...n }) => n));
  }
  if (seasons.length) for (const cat of tvCategoriesFor(bodyId)) add(cat, tvCandidates(s, seasons, cat, r, body.critics).slice(0, 5));
  if (!cer.categories.length) return;
  s.ceremonies.push(cer);
  if (mine) {
    msg(s, 'awards', `${body.name}: ${mine} nomination${mine > 1 ? 's' : ''}!`, 'Spend on For Your Consideration campaigns before the ceremony to improve your odds.', { link: '/awards' });
    headline(`${mine} ${body.short} nominations for your studio`);
  } else msg(s, 'awards', `${body.name} nominations announced`, 'Your studio was shut out this year.', { link: '/awards' });
  for (const c of cer.categories) for (const n of c.nominees) {
    if (n.talentId) { const ov = override(s, n.talentId); ov.star = (ov.star ?? 0) + (bodyId === 'academy' ? 2 : 0.5); }
    // Getting someone nominated earns their loyalty (the Academy counts most).
    if (n.talentId) addLoyalty(s, n.talentId, n.studioId, LOYALTY.nomination * body.weight);
    if (n.studioId === s.studio.id) addBoardLoyalty(s, BOARD_LOYALTY.nomination * body.weight);
    const st = studioById(s, n.studioId); if (st) st.prestige = clamp(st.prestige + (bodyId === 'academy' ? 0.5 : 0.15));
    if (n.seriesId) {
      const x = (s.series ?? []).find((y) => y.id === n.seriesId);
      if (x) (x.awards ??= []).push({ year, body: bodyId, category: c.name, talentId: n.talentId, won: false });
      continue;
    }
    const f = s.films.find((x) => x.id === n.filmId)!;
    f.awards.push({ year, body: bodyId, category: c.name, talentId: n.talentId, won: false });
    if (c.name === 'Best Picture' || c.name === 'Best Ensemble') for (const m of f.cast) addLoyalty(s, m.talentId, f.studioId, LOYALTY.ensembleNom * body.weight);
  }
}

export function holdCeremony(s: GameState, cer: Ceremony) {
  const body = AWARD_BODIES.find((b) => b.id === cer.body)!;
  const r = makeRng(s.seed, cer.year, 'win', cer.body);
  const priorWins = (key: string, cat: string) =>
    s.ceremonies.filter((c) => c.year === cer.year && c.id !== cer.id && c.categories.some((k) => k.name === cat && k.winner >= 0 && nomineeKey(k.nominees[k.winner]) === key)).length;
  let mineWins = 0;
  for (const cat of cer.categories) {
    let best = 0, bestScore = -1e9;
    cat.nominees.forEach((n, i) => {
      const fyc = n.seriesId ? (s.series ?? []).find((x) => x.id === n.seriesId)?.fyc?.[cat.name] ?? 0 : s.films.find((x) => x.id === n.filmId)?.fyc[cat.name] ?? 0;
      const score = n.score + campaignBoost(fyc) * 0.5 + priorWins(nomineeKey(n), cat.name) * 3 + r.normal(0, 3.5);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    cat.winner = best;
    const w = cat.nominees[best];
    const big = cer.body === 'academy' || cer.body === 'crystal';
    if (w.talentId) { const ov = override(s, w.talentId); ov.star = (ov.star ?? 0) + (big ? 5 : 2); ov.acting = (ov.acting ?? 0) + (big ? 2 : 0.5); ov.feeMult = (ov.feeMult ?? 1) * (big ? 1.12 : 1.04); }
    // Winning earns even more loyalty than a nomination.
    if (w.talentId) addLoyalty(s, w.talentId, w.studioId, LOYALTY.win * body.weight);
    if (w.studioId === s.studio.id) { addBoardLoyalty(s, BOARD_LOYALTY.win * body.weight); mineWins++; }
    const st = studioById(s, w.studioId);
    const top = cat.name === 'Best Picture' || /Series$|^Best TV/.test(cat.name);
    if (st) st.prestige = clamp(st.prestige + (top ? (big ? (cer.body === 'academy' ? 6 : 3) : 2) : big ? 1.2 : 0.4));
    if (w.seriesId) {
      const x = (s.series ?? []).find((y) => y.id === w.seriesId);
      if (!x) continue;
      const rec = x.awards?.find((a) => a.year === cer.year && a.body === cer.body && a.category === cat.name && a.talentId === w.talentId);
      if (rec) rec.won = true;
      // Award buzz lifts the next season's ratings and the channel's renewal appetite.
      x.buzz = Math.min(2, (x.buzz ?? 0) + (top ? 0.5 : 0.2));
      continue;
    }
    const f = s.films.find((x) => x.id === w.filmId)!;
    const rec = f.awards.find((a) => a.year === cer.year && a.body === cer.body && a.category === cat.name && a.talentId === w.talentId);
    if (rec) rec.won = true;
    if (cat.name === 'Best Picture' || cat.name === 'Best Ensemble') for (const m of f.cast) addLoyalty(s, m.talentId, f.studioId, LOYALTY.ensembleWin * body.weight);
    f.buzz = Math.min(2, f.buzz + (cat.name === 'Best Picture' ? (big ? 0.8 : 0.3) : 0.1));
  }
  if (mineWins) {
    msg(s, 'awards', `${body.name}: ${mineWins} win${mineWins > 1 ? 's' : ''}!`, 'Watch the ceremony to see the envelopes opened. Winners and nominees now feel more loyal to you and your studio.', { link: `/awards/ceremony/${cer.id}` });
    headline(`Your studio wins ${mineWins} at the ${body.name}`);
  } else msg(s, 'awards', `${body.name} ceremony`, 'Watch the winners announced.', { link: `/awards/ceremony/${cer.id}` });
}

/** TV campaign spending (per series, per category). */
export function fycSpendSeries(s: GameState, seriesId: string, category: string, amount: number) {
  const x = (s.series ?? []).find((y) => y.id === seriesId);
  if (!x || amount <= 0) return;
  x.fyc = { ...(x.fyc ?? {}), [category]: (x.fyc?.[category] ?? 0) + amount };
  x.spent += amount;
  pay(s, s.studio.id, -amount, 'Awards campaigns');
}

export function fycSpend(s: GameState, filmId: string, category: string, amount: number) {
  const f = s.films.find((x) => x.id === filmId);
  if (!f || amount <= 0) return;
  f.fyc[category] = (f.fyc[category] ?? 0) + amount;
  f.spent += amount;
  pay(s, s.studio.id, -amount, 'Awards campaigns');
}

/** Festivals: premiere an unreleased film. Great reception builds buzz; a bad one can sink it. */
export function enterFestival(s: GameState, filmId: string, festivalId: string): string | null {
  const f = s.films.find((x) => x.id === filmId);
  const fest = FESTIVALS.find((x) => x.id === festivalId);
  if (!f || !fest) return 'Not found';
  if (f.festival) return 'Already premiered at a festival.';
  if (!(f.stage === 'post' || f.stage === 'ready')) return 'Only finished or nearly finished films can premiere.';
  const year = yearOf(s.t);
  const festT = s.t - turnInYear(s.t) + fest.turn;
  if (festT < s.t) return 'This year\'s festival has passed.';
  if (f.release && f.release.t < festT) return 'Film releases before the festival.';
  s.festivalEntries = s.festivalEntries.filter((e) => e.filmId !== filmId);
  s.festivalEntries.push({ festivalId, filmId, year });
  pay(s, s.studio.id, -150_000, 'Awards campaigns');
  return null;
}

export function runFestivals(s: GameState) {
  const ty = turnInYear(s.t);
  const year = yearOf(s.t);
  for (const fest of FESTIVALS) {
    if (fest.turn !== ty) continue;
    const r = makeRng(s.seed, year, fest.id);
    // Rival prestige studios submit their best unreleased work.
    for (const f of s.films) {
      const st = studioById(s, f.studioId);
      if (st?.isPlayer || f.festival || !(f.stage === 'ready' || f.stage === 'post')) continue;
      if ((st?.personality?.prestige ?? 0) > 0.4 && f.scriptQuality > 62 && r.chance(0.35)) s.festivalEntries.push({ festivalId: fest.id, filmId: f.id, year });
    }
    const entries = s.festivalEntries.filter((e) => e.festivalId === fest.id && e.year === year);
    let best: Film | undefined, bestRec = -9;
    for (const e of entries) {
      const f = s.films.find((x) => x.id === e.filmId);
      if (!f) continue;
      const q = f.quality || (f.stage === 'post' ? Math.round(f.scriptQuality * 0.9) : 55);
      const reception = clamp((q - 62) / 18 * fest.prestige + r.normal(0, 0.35), -1.5, 1.5);
      f.festival = { id: fest.id, year, reception: Math.round(reception * 100) / 100 };
      f.buzz = clamp(f.buzz + reception * 0.4, -0.8, 2);
      if (reception > bestRec) { bestRec = reception; best = f; }
      if (f.studioId === s.studio.id) {
        const verdict = reception > 0.8 ? 'a standing ovation' : reception > 0.2 ? 'warm applause' : reception > -0.3 ? 'a polite response' : 'walkouts and boos';
        msg(s, 'awards', `${f.title} premieres at ${fest.name}`, `The premiere drew ${verdict}.`, { link: `/film/${f.id}` });
        headline(`${f.title} gets ${verdict} at ${fest.name}`);
      }
    }
    if (best && bestRec > 0.3) {
      best.buzz = clamp(best.buzz + 0.4, -0.8, 2.5);
      const st = studioById(s, best.studioId);
      if (st) st.prestige = clamp(st.prestige + 2);
      best.awards.push({ year, body: fest.id, category: 'Grand Prize', won: true });
      msg(s, 'awards', `${fest.name} Grand Prize: ${best.title}`, `${st?.name} take the festival's top honour.`, { link: `/film/${best.id}` });
    }
  }
}

export function advanceAwards(s: GameState) {
  const ty = turnInYear(s.t);
  for (const b of AWARD_BODIES) if (b.nomTurn === ty) nominate(s, b.id);
  for (const c of s.ceremonies) if (c.t === s.t && c.categories.every((k) => k.winner < 0)) holdCeremony(s, c);
  closeFestivalMarket(s);
  runFestivals(s);
  openFestivalMarket(s);
}
