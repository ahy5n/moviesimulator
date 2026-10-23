// Rating formulas shared by the TMDB build script and the fictional-talent generator.
import { makeRng, clamp } from './rng';
import { GENRES, MARKETS, TRAITS, type Attrs, type Gender, type Genre, type Market, type Talent, type TalentKind, type Trait } from './types';

export type RawCredit = {
  title: string; year: number; order: number; vote_average: number; vote_count: number;
  genres: Genre[]; revenue?: number; language?: string; job?: string;
};
export type RawPerson = {
  tmdbId: number; name: string; birthday?: string | null; gender: number; place_of_birth?: string | null;
  popularity: number; kind: TalentKind; credits: RawCredit[]; nationality?: string;
};

/** TMDB movie genre ids → game genres. */
export const TMDB_GENRES: Record<number, Genre[]> = {
  28: ['Action'], 12: ['Action', 'Fantasy'], 16: ['Animation'], 35: ['Comedy'], 80: ['Crime'], 99: ['Documentary'],
  18: ['Drama'], 10751: ['Family'], 14: ['Fantasy'], 36: ['War', 'Drama'], 27: ['Horror'], 10402: ['Musical'],
  9648: ['Thriller'], 10749: ['Romance'], 878: ['Sci-Fi'], 53: ['Thriller'], 10752: ['War'], 37: ['Western'], 10770: ['Drama'],
};

const SUPERHERO = /avengers|spider-?man|batman|superman|x-men|captain (america|marvel)|iron man|thor|guardians of the galaxy|wonder woman|aquaman|black panther|deadpool|venom|justice league|ant-man|doctor strange|shazam|the flash|eternals|the marvels|hulk|wolverine|black widow|fantastic four|thunderbolts|joker|krrish|ra\.one|suicide squad|man of steel|watchmen|hellboy|blade|green lantern|daredevil|catwoman|kick-ass|the boys|minnal murali|hanu-man|logan|morbius|madame web|kraven|blue beetle|black adam/i;

export function mapGenres(ids: number[], title: string, revenue = 0): Genre[] {
  const set = new Set<Genre>();
  for (const id of ids) for (const g of TMDB_GENRES[id] ?? []) set.add(g);
  if (SUPERHERO.test(title) && (set.has('Action') || set.has('Sci-Fi') || set.has('Fantasy') || revenue > 2e8)) set.add('Superhero');
  return [...set];
}

/** Language of a filmography → home market weights. */
const LANG_MARKETS: Record<string, Partial<Record<Market, number>>> = {
  en: { US: 1, UK: 1, EU: 0.75, LATAM: 0.7, ME: 0.6, ROW: 0.7, JP: 0.55, KR: 0.55, CN: 0.5, IN: 0.45 },
  hi: { IN: 1, ME: 0.85, UK: 0.5, ROW: 0.45, US: 0.25 }, te: { IN: 0.95, ME: 0.6, US: 0.2 },
  ta: { IN: 0.9, ME: 0.6, ROW: 0.4 }, ml: { IN: 0.8, ME: 0.75 }, kn: { IN: 0.75, ME: 0.4 },
  ur: { ME: 0.9, IN: 0.6, UK: 0.5, ROW: 0.5 }, pa: { IN: 0.7, UK: 0.5, ME: 0.5 }, bn: { IN: 0.7, ROW: 0.4 },
  ko: { KR: 1, JP: 0.6, CN: 0.4, ROW: 0.5, US: 0.25 }, zh: { CN: 1, ROW: 0.55, KR: 0.3, JP: 0.3 },
  cn: { CN: 0.95, ROW: 0.6, KR: 0.3 }, ja: { JP: 1, KR: 0.4, CN: 0.35, ROW: 0.3 },
  fr: { EU: 1, UK: 0.4, ME: 0.4, ROW: 0.35, US: 0.25 }, es: { LATAM: 1, EU: 0.75, US: 0.4 },
  pt: { LATAM: 0.9, EU: 0.5 }, de: { EU: 0.9 }, it: { EU: 0.9 }, tr: { ME: 0.8, EU: 0.4 }, ar: { ME: 1 },
  yo: { ROW: 0.9 }, ig: { ROW: 0.85 }, ha: { ROW: 0.8 }, fa: { ME: 0.8 }, th: { ROW: 0.6 }, id: { ROW: 0.6 },
};

/** Nationality → language fallback when we only know where someone was born. */
export const COUNTRY_LANG: Record<string, string> = {
  US: 'en', GB: 'en', CA: 'en', AU: 'en', IE: 'en', NZ: 'en', IN: 'hi', PK: 'ur', KR: 'ko', CN: 'zh', HK: 'cn', TW: 'zh',
  JP: 'ja', FR: 'fr', BE: 'fr', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', CU: 'es', BR: 'pt',
  NG: 'en', GH: 'en', ZA: 'en', KE: 'en', DE: 'de', IT: 'it', TR: 'tr', EG: 'ar', AE: 'ar', LB: 'ar', IR: 'fa', TH: 'th', ID: 'id',
};

const W_TRAITS: [Trait, number][] = [
  ['Reliable', 20], ['Team Player', 18], ['Workaholic', 12], ['Perfectionist', 10], ['Method', 8], ['Loyal', 10],
  ['Picky', 7], ['Prankster', 8], ['Diva', 6],
];

export function assignTraits(id: string, star: number): Trait[] {
  const r = makeRng('traits', id);
  const n = r.chance(0.3) ? 2 : 1;
  const out: Trait[] = [];
  while (out.length < n) {
    const t = r.weighted(W_TRAITS, ([tr, w]) => (tr === 'Picky' || tr === 'Diva' ? w * (0.5 + star / 60) : w))[0];
    const clash = (out.includes('Reliable') && t === 'Diva') || (out.includes('Diva') && t === 'Reliable');
    if (!out.includes(t) && !clash) out.push(t);
  }
  return out;
}

export function feeFor(star: number, box: number, kind: TalentKind): number {
  const score = 0.6 * star + 0.4 * box;
  const base = kind === 'actor' ? 50_000 : kind === 'director' ? 120_000 : kind === 'writer' ? 60_000 : 40_000;
  const cap = kind === 'actor' ? 30e6 : kind === 'director' ? 15e6 : 5e6;
  const fee = base * Math.exp(0.067 * score) * (score > 80 ? 1 + (score - 80) / 20 : 1);
  return Math.round(Math.min(cap, fee) / 10_000) * 10_000;
}
export const backendFor = (star: number) => (star >= 70 ? Math.round(((star - 70) / 30) * 10 + 2) : 0);

export function overallOf(a: Omit<Attrs, 'overall'>, kind: TalentKind): number {
  if (kind === 'actor') return Math.round(0.25 * a.starPower + 0.3 * a.acting + 0.25 * a.boxOffice + 0.1 * a.range + 0.1 * a.reliability);
  return Math.round(0.6 * a.acting + 0.2 * a.boxOffice + 0.1 * a.starPower + 0.1 * a.reliability);
}

const log10 = Math.log10;

/** Turn a raw TMDB career into game ratings. */
export function rateFromCareer(p: RawPerson, refYear = 2026): Talent {
  const id = `t${p.tmdbId}`;
  const r = makeRng('rate', id);
  const credits = p.credits.filter((c) => c.year && c.year <= refYear).sort((a, b) => b.year - a.year);
  const recent = credits.filter((c) => c.year >= refYear - 10);
  const isActor = p.kind === 'actor';

  // Star Power: log popularity + recent leading roles.
  const leads10 = recent.filter((c) => !isActor || c.order <= 1).length;
  const starPower = clamp(Math.round(12 * log10(1 + p.popularity) * 2.1 + Math.min(25, leads10 * 2.2) + 8), 10, 99);

  // Acting / craft skill: weighted vote average, with a prestige bonus for very high rated films.
  let wsum = 0, vsum = 0, bonus = 0;
  for (const c of credits) {
    if (!c.vote_count || c.vote_count < 20) continue;
    const w = log10(1 + c.vote_count) * (isActor ? 1 / (1 + c.order * 0.25) : 1);
    wsum += w; vsum += w * c.vote_average;
    if (c.vote_average >= 7.8 && c.vote_count > 2000 && c.order <= 3) bonus += 1.5;
  }
  const avgVote = wsum ? vsum / wsum : 5.8;
  const acting = clamp(Math.round((avgVote - 4.2) * 17 + Math.min(10, bonus) + r.range(-3, 3)), 15, 99);

  // Box Office Draw: recency-weighted log revenue of top-billed films.
  let bw = 0, bs = 0;
  for (const c of credits) {
    if (!c.revenue || c.revenue < 1e5) continue;
    if (isActor && c.order > 2) continue;
    const w = Math.pow(0.88, Math.max(0, refYear - c.year));
    bw += w; bs += w * log10(c.revenue);
  }
  const avgLog = bw ? bs / bw : 6.2;
  const boxOffice = clamp(Math.round((avgLog - 5.6) * 23 + (bw ? Math.min(8, bw * 1.5) : 0)), 8, 99);

  // Range: distinct genres with 2+ credits.
  const gcount: Partial<Record<Genre, number>> = {};
  const gqual: Partial<Record<Genre, number>> = {};
  for (const c of credits) for (const g of c.genres) {
    gcount[g] = (gcount[g] ?? 0) + 1;
    gqual[g] = (gqual[g] ?? 0) + (c.vote_average || 5.5);
  }
  const distinct = Object.values(gcount).filter((n) => (n ?? 0) >= 2).length;
  const range = clamp(Math.round(15 + distinct * 6.5), 10, 99);
  const chemistry = Math.round(r.range(40, 80));
  const reliability = clamp(Math.round(70 + r.normal(0, 9)), 30, 99);
  const experience = clamp(Math.round(Math.min(99, credits.length * 1.6 + 10)), 5, 99);

  const traits = assignTraits(id, starPower);
  const rel = clamp(reliability + (traits.includes('Reliable') ? 12 : 0) - (traits.includes('Diva') ? 12 : 0), 20, 99);

  const base = { starPower, acting, boxOffice, range, chemistry, reliability: rel, experience };
  const overall = overallOf(base, p.kind);

  // Genre ratings: share of credits × quality, floored at 25.
  const total = credits.length || 1;
  const genres = {} as Record<Genre, number>;
  for (const g of GENRES) {
    const n = gcount[g] ?? 0;
    const q = n ? (gqual[g] ?? 0) / n : 5.5;
    const share = n / total;
    const v = 25 + Math.sqrt(share) * 55 * (0.5 + (q - 4) / 6) * (0.6 + acting / 250) + (n >= 3 ? 6 : 0);
    genres[g] = clamp(Math.round(v), 25, 99);
  }

  // Regional appeal from filmography language + nationality, scaled by fame.
  const nationality = p.nationality || 'US';
  const langCount: Record<string, number> = {};
  for (const c of credits) if (c.language) langCount[c.language] = (langCount[c.language] ?? 0) + 1;
  const homeLang = COUNTRY_LANG[nationality] ?? 'en';
  langCount[homeLang] = (langCount[homeLang] ?? 0) + Math.max(2, total * 0.2);
  const langTotal = Object.values(langCount).reduce((a, b) => a + b, 0);
  const regional = {} as Record<Market, number>;
  for (const m of MARKETS) {
    let s = 0;
    for (const [lang, n] of Object.entries(langCount)) s += (n / langTotal) * (LANG_MARKETS[lang]?.[m] ?? 0.15);
    regional[m] = clamp(Math.round(10 + s * 60 + starPower * 0.3 * (0.4 + s)), 5, 99);
  }

  const birth = p.birthday || `${refYear - 40}-06-15`;
  const age = refYear - Number(birth.slice(0, 4));
  const potential = age < 30 ? clamp(Math.round(overall + r.range(0, 25) * ((30 - age) / 12)), overall, 97) : overall;

  return {
    id, tmdbId: p.tmdbId, name: p.name, isFictional: false, kind: p.kind,
    birthDate: birth, gender: p.gender === 1 ? 'F' : p.gender === 2 ? 'M' : 'X', nationality,
    attrs: { ...base, overall }, genres, regional, traits, potential,
    fee: feeFor(starPower, boxOffice, p.kind), backendDemand: isActor ? backendFor(starPower) : 0,
    credits: credits.slice(0, 10).map((c) => ({ title: c.title, year: c.year, billing: c.order + 1 })),
    debutYear: credits.length ? credits[credits.length - 1].year : undefined,
  };
}

/** Generate a fictional person (newcomers and the offline demo roster). */
export function fictionalPerson(opts: {
  id: string; name: string; gender: Gender; nationality: string; birthYear: number; kind: TalentKind;
  tier: number; // 0..1 — how established
  seed: string; year: number;
}): Talent {
  const r = makeRng('fict', opts.seed, opts.id);
  const t = opts.tier;
  const starPower = clamp(Math.round(15 + t * 75 + r.normal(0, 6)), 5, 97);
  const acting = clamp(Math.round(35 + t * 45 + r.normal(0, 10)), 15, 97);
  const boxOffice = clamp(Math.round(10 + t * 75 + r.normal(0, 8)), 5, 97);
  const range = clamp(Math.round(20 + t * 40 + r.normal(0, 12)), 10, 95);
  const chemistry = Math.round(r.range(40, 80));
  const traits = assignTraits(opts.id, starPower);
  const reliability = clamp(Math.round(70 + r.normal(0, 9) + (traits.includes('Reliable') ? 12 : 0) - (traits.includes('Diva') ? 12 : 0)), 20, 99);
  const experience = clamp(Math.round(5 + t * 80 + r.normal(0, 6)), 1, 99);
  const base = { starPower, acting, boxOffice, range, chemistry, reliability, experience };
  const overall = overallOf(base, opts.kind);
  const fav = r.shuffle([...GENRES]).slice(0, 2 + Math.floor((range / 100) * 5));
  const genres = {} as Record<Genre, number>;
  for (const g of GENRES) {
    const idx = fav.indexOf(g);
    genres[g] = clamp(Math.round(idx === -1 ? 25 + r.range(0, 15) : 45 + acting * 0.4 - idx * 3 + r.range(-6, 6)), 25, 97);
  }
  const lang = COUNTRY_LANG[opts.nationality] ?? 'en';
  const regional = {} as Record<Market, number>;
  for (const m of MARKETS) regional[m] = clamp(Math.round(10 + (LANG_MARKETS[lang]?.[m] ?? 0.15) * 60 + starPower * 0.3), 5, 99);
  const age = opts.year - opts.birthYear;
  const potential = age < 30
    ? clamp(Math.round(overall + r.range(5, 30) * ((30 - age) / 10) * (r.chance(0.12) ? 1.6 : 1)), overall, 96)
    : overall;
  const month = String(r.int(1, 12)).padStart(2, '0');
  const day = String(r.int(1, 28)).padStart(2, '0');
  return {
    id: opts.id, name: opts.name, isFictional: true, kind: opts.kind,
    birthDate: `${opts.birthYear}-${month}-${day}`, gender: opts.gender, nationality: opts.nationality,
    attrs: { ...base, overall }, genres, regional, traits, potential,
    fee: feeFor(starPower, boxOffice, opts.kind), backendDemand: opts.kind === 'actor' ? backendFor(starPower) : 0,
    credits: [], debutYear: opts.year,
  };
}
