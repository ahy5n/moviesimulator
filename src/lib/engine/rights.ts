// The rights market: make offers for rivals' finished films, library titles and whole franchises.
// Rivals also own established franchises from before the game starts, and keep making sequels.
import { makeRng } from '../rng';
import { genTitle } from '../titles';
import { GENRES, type Film, type Franchise, type GameState, type Genre, type Studio } from '../types';
import { forecastGross } from './boxoffice';
import { merchPerYear } from './merch';
import { filmPullRaw, LICENCE_PER_PULL_YEAR } from './streaming';
import { headline, msg, nextId, pay, studioById } from './util';

const GENRE_GROSS: Partial<Record<Genre, number>> = { Superhero: 1.6, Animation: 1.4, Action: 1.2, 'Sci-Fi': 1.1, Fantasy: 1.2, Family: 1, Horror: 0.35, Comedy: 0.5, Thriller: 0.5, Crime: 0.5 };

/** Older saves and new games: give the big rivals a few franchises they built before 2026. */
export function seedRivalFranchises(s: GameState) {
  if (s.franchises.some((f) => f.legacyFilms)) return;
  for (const st of s.rivals) {
    const p = st.personality;
    if (!p || p.slate < 6) continue;
    const r = makeRng(s.seed, 'legacy', st.id);
    const n = p.slate >= 14 ? r.int(2, 3) : r.int(1, 2);
    for (let i = 0; i < n; i++) {
      const genre = r.weighted(GENRES.filter((g) => g !== 'Documentary' && g !== 'Musical'), (g) => (p.genres[g] ?? 0.3) * (GENRE_GROSS[g] ?? 0.4));
      const films = r.int(2, 6);
      s.franchises.push({
        id: nextId(s, 'fr'), name: genTitle(r, genre).replace(/^The /, ''), studioId: st.id, filmIds: [], heat: Math.round(r.range(0.05, 0.6) * 100) / 100,
        fatigue: r.range(0, 0.25), isUniverse: films >= 4 && r.chance(0.4), legacyFilms: films, genre,
        legacyGross: Math.round(films * r.range(200e6, 700e6) * (GENRE_GROSS[genre] ?? 0.4) / 1e6) * 1e6,
      });
    }
  }
}

/** Rivals return to their franchises now and then. */
export function maybeRivalSequel(s: GameState, st: Studio, f: Film, r: ReturnType<typeof makeRng>) {
  const own = s.franchises.filter((x) => x.studioId === st.id && x.fatigue < 0.35);
  if (!own.length || !r.chance(0.14)) return;
  const fr = r.pick(own);
  const n = (fr.legacyFilms ?? 0) + fr.filmIds.length + 1;
  f.title = `${fr.name} ${n}`;
  f.franchiseId = fr.id;
  if (fr.genre) f.primaryGenre = fr.genre;
  fr.filmIds.push(f.id);
}

// ---------- Valuations ----------

const forSale = (f: Film) => !f.inTheatres && f.release?.type !== 'sold' && (f.stage === 'library' || f.stage === 'released' || (f.stage === 'ready' && (!f.release || f.release.t > 0)));

/** What a film is worth to a buyer: future box office for unreleased films, library and streaming value otherwise. */
export function filmValue(s: GameState, f: Film): number {
  if (f.stage === 'ready') {
    const gross = forecastGross(s, f, { t: s.t + 3, screens: 'wide', marketing: f.budget * 0.5, type: 'theatrical' });
    return Math.max(f.budget * 0.5, gross * 0.45 - f.budget * 0.45 + f.budget * 0.25);
  }
  const age = Math.max(0, (s.t - (f.release?.t ?? s.t)) / 26);
  const library = (f.gross * 0.012 + f.budget * 0.004) * Math.pow(0.82, age) / 0.25;
  const streaming = filmPullRaw(s, f) * 0.6 * LICENCE_PER_PULL_YEAR * 3;
  return Math.max(0.3e6, library + streaming);
}

export const franchiseGrossAll = (s: GameState, fr: Franchise) =>
  (fr.legacyGross ?? 0) + fr.filmIds.reduce((a, id) => a + (s.films.find((f) => f.id === id)?.gross ?? 0), 0);

export function franchiseValue(s: GameState, fr: Franchise): number {
  const gross = franchiseGrossAll(s, fr);
  const library = fr.filmIds.map((id) => s.films.find((f) => f.id === id)).filter((f): f is Film => !!f && forSale(f)).reduce((a, f) => a + filmValue(s, f), 0);
  return gross * (0.05 + Math.min(1, fr.heat) * 0.08) * (1 - fr.fatigue * 0.5) + merchPerYear(s, fr) * 3 + library;
}

/** Their asking price. Prestige studios hold out for more; distressed ones sell cheap. */
function askFor(s: GameState, ownerId: string, key: string, value: number): number {
  const st = studioById(s, ownerId);
  const r = makeRng(s.seed, key, Math.floor(s.t / 13));
  const distressed = (st?.distressUntil ?? -1) > s.t;
  const factor = 1.1 + (st?.personality?.prestige ?? 0.5) * 0.25 - (distressed ? 0.4 : 0);
  return Math.round(value * factor * r.range(0.9, 1.15) / 1e5) * 1e5;
}

export type RightsListing = { kind: 'film' | 'franchise'; id: string; title: string; owner: string; value: number; detail: string };

export function rightsListings(s: GameState): RightsListing[] {
  const out: RightsListing[] = [];
  for (const fr of s.franchises) {
    if (fr.studioId === s.studio.id || !studioById(s, fr.studioId)) continue;
    const n = (fr.legacyFilms ?? 0) + fr.filmIds.length;
    out.push({ kind: 'franchise', id: fr.id, title: fr.name, owner: fr.studioId, value: franchiseValue(s, fr), detail: `${n} film${n > 1 ? 's' : ''} · ${fr.genre ?? ''} · $${(franchiseGrossAll(s, fr) / 1e9).toFixed(2)}B lifetime` });
  }
  for (const f of s.films) {
    if (f.studioId === s.studio.id || !forSale(f) || f.franchiseId || !studioById(s, f.studioId)) continue;
    if (f.stage !== 'ready' && f.gross < 20e6 && filmPullRaw(s, f) < 100_000) continue;
    out.push({ kind: 'film', id: f.id, title: f.title, owner: f.studioId, value: filmValue(s, f), detail: f.stage === 'ready' ? `Finished, unreleased · ${f.tier}` : `Library · $${(f.gross / 1e6).toFixed(0)}M gross` });
  }
  return out.sort((a, b) => b.value - a.value);
}

function takeFilm(s: GameState, f: Film, price: number) {
  f.boughtFrom = f.studioId;
  f.studioId = s.studio.id;
  if (f.stage === 'ready' && f.release && f.release.t > s.t) { f.release = undefined; f.marketing = 0; }
  f.spent = price; f.studioRevenue = 0; f.otherRevenue = 0; f.backendPaid = 0;
  f.events.push(`Rights bought from ${studioById(s, f.boughtFrom)?.name ?? 'a rival'}.`);
}

export type OfferResult = { status: 'accepted' | 'countered' | 'rejected'; note: string; ask?: number };

export function makeRightsOffer(s: GameState, kind: 'film' | 'franchise', id: string, amount: number): OfferResult {
  const cool = s.rightsCooldown?.[id] ?? -1;
  if (cool > s.t) return { status: 'rejected', note: 'They’re not taking your calls about this one for a while.' };
  if (s.studio.cash < amount) return { status: 'rejected', note: 'You don’t have that much cash.' };
  const fr = kind === 'franchise' ? s.franchises.find((x) => x.id === id) : undefined;
  const film = kind === 'film' ? s.films.find((x) => x.id === id) : undefined;
  const owner = fr?.studioId ?? film?.studioId;
  if (!owner || owner === s.studio.id || (film && !forSale(film))) return { status: 'rejected', note: 'Not for sale.' };
  const value = fr ? franchiseValue(s, fr) : filmValue(s, film!);
  const ask = askFor(s, owner, id, value);
  const name = studioById(s, owner)?.name ?? 'They';
  if (amount < ask * 0.6) {
    (s.rightsCooldown ??= {})[id] = s.t + 4;
    return { status: 'rejected', note: `${name} laughed you out of the room. Try again in a couple of months.` };
  }
  if (amount < ask) return { status: 'countered', ask, note: `${name} would sell for $${(ask / 1e6).toFixed(1)}M.` };
  pay(s, s.studio.id, -amount, 'Rights purchases');
  pay(s, owner, amount, 'Rights purchases');
  if (film) takeFilm(s, film, amount);
  if (fr) {
    fr.studioId = s.studio.id;
    for (const fid of [...fr.filmIds]) {
      const f = s.films.find((x) => x.id === fid);
      if (!f) continue;
      if (forSale(f)) takeFilm(s, f, 0);
      else if (f.studioId !== s.studio.id) { f.franchiseId = undefined; fr.filmIds = fr.filmIds.filter((x) => x !== fid); }
    }
  }
  const title = fr?.name ?? film!.title;
  msg(s, 'finance', `You bought ${title}`, `${name} sold you the rights for $${(amount / 1e6).toFixed(1)}M.${fr ? ' Develop the next instalment from IP & Franchises.' : ''}`, { link: fr ? '/ip' : `/film/${film!.id}` });
  headline(`${s.studio.name} buy ${title} from ${name}`);
  return { status: 'accepted', note: 'Deal done.' };
}

// ---------- Library fire sales (from distressed rivals) ----------

export function openLibrarySale(s: GameState, st: Studio) {
  const films = s.films.filter((f) => f.studioId === st.id && f.stage === 'library' && !f.franchiseId && f.release?.type !== 'sold').sort((a, b) => filmValue(s, b) - filmValue(s, a)).slice(0, 12);
  if (films.length < 3) return;
  const price = Math.round(films.reduce((a, f) => a + filmValue(s, f), 0) * 0.7 / 1e6) * 1e6;
  (s.librarySales ??= []).push({ id: nextId(s, 'ls'), studioId: st.id, filmIds: films.map((f) => f.id), price, expires: s.t + 4 });
  msg(s, 'offer', `${st.name} put their film library up for sale`, `${films.length} titles for $${(price / 1e6).toFixed(0)}M. Other studios are circling.`, { link: '/rights' });
}

export function buyLibrary(s: GameState, saleId: string): string | null {
  const sale = s.librarySales?.find((x) => x.id === saleId);
  if (!sale || sale.expires <= s.t) return 'The sale has closed.';
  if (s.studio.cash < sale.price) return 'Not enough cash.';
  pay(s, s.studio.id, -sale.price, 'Rights purchases');
  pay(s, sale.studioId, sale.price, 'Rights purchases');
  const per = sale.price / sale.filmIds.length;
  for (const id of sale.filmIds) { const f = s.films.find((x) => x.id === id); if (f && f.studioId === sale.studioId) takeFilm(s, f, per); }
  s.librarySales = s.librarySales!.filter((x) => x.id !== saleId);
  headline(`${s.studio.name} buy the ${studioById(s, sale.studioId)?.name} library`);
  return null;
}

export function advanceRights(s: GameState) {
  seedRivalFranchises(s);
  const r = makeRng(s.seed, s.t, 'libsale');
  for (const sale of s.librarySales ?? []) {
    if (sale.expires !== s.t) continue;
    const buyers = s.rivals.filter((x) => x.id !== sale.studioId && x.personality && x.cash > sale.price);
    const buyer = buyers.length ? r.pick(buyers) : undefined;
    if (!buyer) continue;
    for (const id of sale.filmIds) { const f = s.films.find((x) => x.id === id); if (f && f.studioId === sale.studioId) f.studioId = buyer.id; }
    buyer.cash -= sale.price;
    msg(s, 'rival', `${buyer.name} buy the ${studioById(s, sale.studioId)?.name} library`, `${sale.filmIds.length} films for $${(sale.price / 1e6).toFixed(0)}M.`);
  }
  s.librarySales = (s.librarySales ?? []).filter((x) => x.expires > s.t);
  if (s.rightsCooldown) for (const k of Object.keys(s.rightsCooldown)) if (s.rightsCooldown[k] <= s.t) delete s.rightsCooldown[k];
}
