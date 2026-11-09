// Languages: what people speak, what films and series are made in, and where each language sells.
import type { RNG } from './rng';
import type { Market } from './types';

/** Languages a film or series can be made in (ISO 639-1 codes; 'cn' = Cantonese as TMDB uses it). */
export const LANGUAGES: Record<string, string> = {
  en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', zh: 'Mandarin', cn: 'Cantonese', ja: 'Japanese', ko: 'Korean',
  te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', ur: 'Urdu', pa: 'Punjabi', pt: 'Portuguese', ar: 'Arabic', de: 'German',
  it: 'Italian', tr: 'Turkish', yo: 'Yoruba', fa: 'Persian',
};
export const LANGUAGE_CODES = Object.keys(LANGUAGES);
export const langName = (code?: string) => LANGUAGES[code ?? 'en'] ?? code ?? 'English';

/** How well a language travels to each market (0–1). Also drives regional appeal. */
export const LANG_MARKETS: Record<string, Partial<Record<Market, number>>> = {
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

/** Nationality → main language. */
export const COUNTRY_LANG: Record<string, string> = {
  US: 'en', GB: 'en', CA: 'en', AU: 'en', IE: 'en', NZ: 'en', IN: 'hi', PK: 'ur', KR: 'ko', CN: 'zh', HK: 'cn', TW: 'zh',
  JP: 'ja', FR: 'fr', BE: 'fr', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', CU: 'es', BR: 'pt',
  NG: 'en', GH: 'en', ZA: 'en', KE: 'en', DE: 'de', IT: 'it', TR: 'tr', EG: 'ar', AE: 'ar', LB: 'ar', IR: 'fa', TH: 'th', ID: 'id',
};

/** Second languages commonly spoken alongside the home language. */
const EXTRA_LANGS: Record<string, string[]> = {
  IN: ['en', 'te', 'ta', 'pa', 'ur'], PK: ['en', 'pa', 'hi'], NG: ['yo'], HK: ['zh', 'en'], TW: ['en'], CA: ['fr'], BE: ['de'],
  MX: ['en'], ES: ['en'], BR: ['es'], EG: ['en'], AE: ['en'], LB: ['fr'], IR: [], KR: ['en'], JP: ['en'], CN: ['en'], FR: ['en'],
};

/**
 * Market multipliers for a film in this language, relative to an English-language film (which the box office is calibrated on).
 * Local-language films dominate their home markets and travel less; overall they earn about 75% of an English film at the same budget.
 */
const SHARE: Record<Market, number> = { US: 0.38, UK: 0.05, EU: 0.14, CN: 0.09, IN: 0.04, JP: 0.05, KR: 0.03, LATAM: 0.08, ME: 0.03, ROW: 0.11 };
const factorCache = new Map<string, Record<string, number>>();
export function languageMarketFactor(lang: string | undefined, m: Market): number {
  if (!lang || lang === 'en') return 1;
  let f = factorCache.get(lang);
  if (!f) {
    const raw: Record<string, number> = {};
    let total = 0;
    for (const mk of Object.keys(SHARE) as Market[]) {
      const reach = LANG_MARKETS[lang]?.[mk] ?? 0.12;
      const en = LANG_MARKETS.en[mk] ?? 0.5;
      raw[mk] = ((0.2 + reach) / (0.2 + en)) * (reach >= 0.9 ? 4 : 1);
      total += SHARE[mk] * raw[mk];
    }
    f = {};
    for (const mk of Object.keys(raw)) f[mk] = raw[mk] * (0.75 / total);
    factorCache.set(lang, f);
  }
  return f[m];
}

/** Languages someone speaks: home language, plus extras from their career, plus English for many international names. */
export function deriveLanguages(nationality: string, starPower: number, r: RNG, careerLangs: Record<string, number> = {}): string[] {
  const home = COUNTRY_LANG[nationality] ?? 'en';
  const set = new Set<string>([home]);
  for (const [l, n] of Object.entries(careerLangs)) if (n >= 2 && LANGUAGES[l]) set.add(l);
  if (home !== 'en' && (careerLangs.en ?? 0) >= 2) set.add('en');
  if (home !== 'en' && r.chance(0.25 + starPower / 180)) set.add('en');
  for (const extra of EXTRA_LANGS[nationality] ?? []) if (r.chance(extra === 'en' ? 0.35 : 0.3)) set.add(extra);
  if (home === 'en' && r.chance(0.08)) set.add(r.pick(['es', 'fr', 'de', 'it']));
  return [...set].filter((l) => LANGUAGES[l]);
}

/** Script language mix. Your HQ makes local-language projects more common. */
export function pickLanguage(r: RNG, hqLang?: string): string {
  const base: [string, number][] = [
    ['en', 70], ['hi', 5], ['es', 4], ['ko', 4], ['fr', 3], ['zh', 2.5], ['ja', 2.5], ['te', 1.5], ['ta', 1.5], ['pt', 1],
    ['de', 1], ['it', 1], ['ur', 1], ['tr', 0.7], ['ar', 0.7], ['ml', 0.6], ['cn', 0.6], ['yo', 0.5], ['pa', 0.4], ['fa', 0.3],
  ];
  return r.weighted(base, ([l, w]) => (l === hqLang && l !== 'en' ? w * 4 : w))[0];
}

export const HQ_LANG: Record<string, string> = {
  LA: 'en', London: 'en', Mumbai: 'hi', Seoul: 'ko', Paris: 'fr', Lagos: 'en', 'Mexico City': 'es', 'Hong Kong': 'cn',
};

export const speaks = (languages: string[] | undefined, lang: string | undefined) => !lang || !languages || languages.includes(lang);
