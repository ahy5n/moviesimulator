// Awards season, For Your Consideration campaigns and film festivals.
import { AWARD_BODIES, FESTIVALS, categoriesFor } from '@/data/awards';
import { monthOf, turnInYear, yearOf } from '../calendar';
import { GENRE_BIAS } from '../constants';
import { makeRng, clamp, type RNG } from '../rng';
import { override, talent } from '../talentDb';
import type { Ceremony, Film, GameState, Nominee } from '../types';
import { headline, msg, nextId, pay, studioById } from './util';
import { addLoyalty, LOYALTY } from './loyalty';
import { addBoardLoyalty, BOARD_LOYALTY } from './finance';

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
        const leads = f.cast.filter((c) => c.role === 'lead').map((c) => talent(s, c.talentId)!).filter(Boolean);
        if (leads.length && leads.every((t) => !ENGLISH.has(t.nationality))) push(base);
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

export function nominate(s: GameState, bodyId: string) {
  const body = AWARD_BODIES.find((b) => b.id === bodyId)!;
  const year = yearOf(s.t) - 1;
  const films = eligibleFilms(s, year);
  if (!films.length) return;
  const r = makeRng(s.seed, year, 'noms', bodyId);
  const cer: Ceremony = { id: nextId(s, 'c'), body: bodyId, year, t: s.t - turnInYear(s.t) + body.ceremonyTurn, categories: [], viewed: false };
  let mine = 0;
  for (const cat of categoriesFor(bodyId, s.settings.crewMode === 'full')) {
    const noms = candidates(s, films, cat, r, body.critics).sort((a, b) => b.score - a.score).slice(0, 5);
    if (noms.length < 2) continue;
    cer.categories.push({ name: cat, nominees: noms.map(({ campaignKey: _, ...n }) => n), winner: -1 });
    mine += noms.filter((n) => n.studioId === s.studio.id).length;
  }
  s.ceremonies.push(cer);
  if (mine) {
    msg(s, 'awards', `${body.name}: ${mine} nomination${mine > 1 ? 's' : ''}!`, 'Spend on For Your Consideration campaigns before the ceremony to improve your odds.', { link: '/awards' });
    headline(`${mine} ${body.short} nominations for your studio`);
  } else msg(s, 'awards', `${body.name} nominations announced`, 'Your studio was shut out this year.', { link: '/awards' });
  for (const c of cer.categories) for (const n of c.nominees) {
    const f = s.films.find((x) => x.id === n.filmId)!;
    f.awards.push({ year, body: bodyId, category: c.name, talentId: n.talentId, won: false });
    if (n.talentId) { const ov = override(s, n.talentId); ov.star = (ov.star ?? 0) + (bodyId === 'academy' ? 2 : 0.5); }
    // Getting someone nominated earns their loyalty (the Academy counts most).
    if (n.talentId) addLoyalty(s, n.talentId, f.studioId, LOYALTY.nomination * body.weight);
    if (f.studioId === s.studio.id) addBoardLoyalty(s, BOARD_LOYALTY.nomination * body.weight);
    if (c.name === 'Best Picture' || c.name === 'Best Ensemble') for (const m of f.cast) addLoyalty(s, m.talentId, f.studioId, LOYALTY.ensembleNom * body.weight);
    const st = studioById(s, f.studioId); if (st) st.prestige = clamp(st.prestige + (bodyId === 'academy' ? 0.5 : 0.15));
  }
}

export function holdCeremony(s: GameState, cer: Ceremony) {
  const body = AWARD_BODIES.find((b) => b.id === cer.body)!;
  const r = makeRng(s.seed, cer.year, 'win', cer.body);
  const priorWins = (filmId: string, cat: string) =>
    s.ceremonies.filter((c) => c.year === cer.year && c.id !== cer.id && c.categories.some((k) => k.name === cat && k.winner >= 0 && k.nominees[k.winner].filmId === filmId)).length;
  let mineWins = 0;
  for (const cat of cer.categories) {
    let best = 0, bestScore = -1e9;
    cat.nominees.forEach((n, i) => {
      const f = s.films.find((x) => x.id === n.filmId)!;
      const score = n.score + campaignBoost(f.fyc[cat.name] ?? 0) * 0.5 + priorWins(n.filmId, cat.name) * 3 + r.normal(0, 3.5);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    cat.winner = best;
    const w = cat.nominees[best];
    const f = s.films.find((x) => x.id === w.filmId)!;
    const rec = f.awards.find((a) => a.year === cer.year && a.body === cer.body && a.category === cat.name && a.talentId === w.talentId);
    if (rec) rec.won = true;
    const big = cer.body === 'academy';
    if (w.talentId) { const ov = override(s, w.talentId); ov.star = (ov.star ?? 0) + (big ? 6 : 2); ov.acting = (ov.acting ?? 0) + (big ? 2 : 0.5); ov.feeMult = (ov.feeMult ?? 1) * (big ? 1.15 : 1.04); }
    // Winning earns even more loyalty than a nomination.
    if (w.talentId) addLoyalty(s, w.talentId, f.studioId, LOYALTY.win * body.weight);
    if (w.studioId === s.studio.id) addBoardLoyalty(s, BOARD_LOYALTY.win * body.weight);
    if (cat.name === 'Best Picture' || cat.name === 'Best Ensemble') for (const m of f.cast) addLoyalty(s, m.talentId, f.studioId, LOYALTY.ensembleWin * body.weight);
    const st = studioById(s, f.studioId);
    if (st) st.prestige = clamp(st.prestige + (cat.name === 'Best Picture' ? (big ? 6 : 2) : big ? 1.2 : 0.4));
    f.buzz = Math.min(2, f.buzz + (cat.name === 'Best Picture' ? (big ? 0.8 : 0.3) : 0.1));
    if (w.studioId === s.studio.id) mineWins++;
  }
  if (mineWins) {
    msg(s, 'awards', `${body.name}: ${mineWins} win${mineWins > 1 ? 's' : ''}!`, 'Watch the ceremony to see the envelopes opened. Winners and nominees now feel more loyal to you and your studio.', { link: `/awards/ceremony/${cer.id}` });
    headline(`Your studio wins ${mineWins} at the ${body.name}`);
  } else msg(s, 'awards', `${body.name} ceremony`, 'Watch the winners announced.', { link: `/awards/ceremony/${cer.id}` });
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
  runFestivals(s);
}
