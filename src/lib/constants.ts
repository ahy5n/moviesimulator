import type { BudgetTier, Genre, Market, ScreenPlan, Trait } from './types';

export const GENRE_COLORS: Record<Genre, string> = {
  Action: '#E4572E', Comedy: '#F2C14E', Drama: '#7B6CF6', Horror: '#8B0000', 'Sci-Fi': '#29B6F6',
  Romance: '#EC6FA4', Thriller: '#5C6BC0', Animation: '#26C6DA', Fantasy: '#9C64D9', Superhero: '#D93A3A',
  Musical: '#F48FB1', War: '#7D8B5A', Western: '#C2803E', Crime: '#607D8B', Documentary: '#8DA399', Family: '#66BB6A',
};

export const MARKET_NAMES: Record<Market, string> = {
  US: 'US / Canada', UK: 'UK', EU: 'Europe', CN: 'China', IN: 'India', JP: 'Japan', KR: 'South Korea',
  LATAM: 'Latin America', ME: 'Middle East', ROW: 'Rest of World',
};

/** Share of a typical film's worldwide gross by market. */
export const MARKET_SHARE: Record<Market, number> = {
  US: 0.38, UK: 0.05, EU: 0.14, CN: 0.09, IN: 0.04, JP: 0.05, KR: 0.03, LATAM: 0.08, ME: 0.03, ROW: 0.11,
};

/** Studio's cut of the box office by market. */
export const RENTAL: Record<Market, number> = {
  US: 0.5, UK: 0.4, EU: 0.4, CN: 0.25, IN: 0.4, JP: 0.4, KR: 0.4, LATAM: 0.4, ME: 0.4, ROW: 0.4,
};

export const TIERS: { tier: BudgetTier; min: number; max: number; typical: number; filming: number; post: number; base: number; screenW: number }[] = [
  { tier: 'Micro', min: 0.5e6, max: 5e6, typical: 2.5e6, filming: 2, post: 2, base: 4.5e6, screenW: 0.3 },
  { tier: 'Low', min: 5e6, max: 30e6, typical: 15e6, filming: 3, post: 3, base: 20e6, screenW: 0.6 },
  { tier: 'Mid', min: 30e6, max: 100e6, typical: 60e6, filming: 4, post: 4, base: 55e6, screenW: 1 },
  { tier: 'High', min: 100e6, max: 200e6, typical: 150e6, filming: 5, post: 5, base: 108e6, screenW: 1.2 },
  { tier: 'Tentpole', min: 200e6, max: 350e6, typical: 250e6, filming: 6, post: 6, base: 170e6, screenW: 1.4 },
];
export const tierOf = (budget: number): BudgetTier =>
  budget < 5e6 ? 'Micro' : budget < 30e6 ? 'Low' : budget < 100e6 ? 'Mid' : budget < 200e6 ? 'High' : 'Tentpole';
export const tierInfo = (tier: BudgetTier) => TIERS.find((x) => x.tier === tier)!;

export const SCREENS: Record<ScreenPlan, { label: string; screens: number; mult: number; cost: number }> = {
  limited: { label: 'Limited (600 screens)', screens: 600, mult: 0.4, cost: 0 },
  moderate: { label: 'Moderate (2,000)', screens: 2000, mult: 0.75, cost: 0 },
  wide: { label: 'Wide (3,600)', screens: 3600, mult: 1, cost: 0 },
  ultra: { label: 'Ultra-wide (4,400 + PLF)', screens: 4400, mult: 1.12, cost: 0.04 },
};

/** Release-window strength by month (0 = January). */
export const MONTH_HEAT = [0.78, 0.9, 1.0, 1.02, 1.18, 1.28, 1.3, 1.05, 0.8, 0.95, 1.15, 1.3];

/** Critic and audience leanings per genre. */
export const GENRE_BIAS: Record<Genre, { critic: number; audience: number; prestige: number }> = {
  Action: { critic: -5, audience: 6, prestige: 0.1 }, Comedy: { critic: -3, audience: 4, prestige: 0.2 },
  Drama: { critic: 7, audience: -3, prestige: 1 }, Horror: { critic: -6, audience: 5, prestige: 0.15 },
  'Sci-Fi': { critic: 0, audience: 4, prestige: 0.4 }, Romance: { critic: -2, audience: 3, prestige: 0.4 },
  Thriller: { critic: 1, audience: 3, prestige: 0.5 }, Animation: { critic: 3, audience: 6, prestige: 0.4 },
  Fantasy: { critic: -1, audience: 5, prestige: 0.3 }, Superhero: { critic: -4, audience: 7, prestige: 0.05 },
  Musical: { critic: 2, audience: 2, prestige: 0.7 }, War: { critic: 4, audience: 0, prestige: 0.9 },
  Western: { critic: 3, audience: -2, prestige: 0.6 }, Crime: { critic: 3, audience: 2, prestige: 0.7 },
  Documentary: { critic: 9, audience: -4, prestige: 0.5 }, Family: { critic: -2, audience: 6, prestige: 0.2 },
};

export const TRAIT_INFO: Record<Trait, string> = {
  Reliable: 'Fewer production problems.',
  Diva: 'Expensive and prone to causing overruns.',
  Method: 'Boosts quality, may slow filming.',
  Workaholic: 'Happy to sign multi-film options.',
  'Team Player': 'Raises on-set chemistry.',
  Prankster: 'Lifts morale; occasional delays.',
  Perfectionist: 'Higher quality, higher overrun risk.',
  Loyal: 'Big discounts for studios and producers they keep working with.',
  Picky: 'Only signs for prestige scripts or studios.',
};

export const HQS: { id: string; label: string; regions: Partial<Record<Market, number>> }[] = [
  { id: 'LA', label: 'Los Angeles', regions: { US: 1.08 } },
  { id: 'London', label: 'London', regions: { UK: 1.15, EU: 1.05 } },
  { id: 'Mumbai', label: 'Mumbai', regions: { IN: 1.3, ME: 1.1 } },
  { id: 'Seoul', label: 'Seoul', regions: { KR: 1.3, JP: 1.05 } },
  { id: 'Paris', label: 'Paris', regions: { EU: 1.15, UK: 1.03 } },
  { id: 'Lagos', label: 'Lagos', regions: { ROW: 1.2 } },
  { id: 'Mexico City', label: 'Mexico City', regions: { LATAM: 1.25 } },
  { id: 'Hong Kong', label: 'Hong Kong', regions: { CN: 1.2, ROW: 1.05 } },
];

export const START_CASH = { indie: 50e6, minimajor: 500e6, major: 2000e6 } as const;

export const FLAGS: Record<string, string> = {};
export function flag(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  if (FLAGS[code]) return FLAGS[code];
  const f = String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
  FLAGS[code] = f;
  return f;
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', IN: 'India', PK: 'Pakistan', KR: 'South Korea', CN: 'China', HK: 'Hong Kong',
  TW: 'Taiwan', JP: 'Japan', FR: 'France', ES: 'Spain', MX: 'Mexico', AR: 'Argentina', BR: 'Brazil', CO: 'Colombia',
  CL: 'Chile', NG: 'Nigeria', CA: 'Canada', AU: 'Australia', IE: 'Ireland', DE: 'Germany', IT: 'Italy', NZ: 'New Zealand',
  ZA: 'South Africa', SE: 'Sweden', DK: 'Denmark', NO: 'Norway', NL: 'Netherlands', BE: 'Belgium', EG: 'Egypt',
  AE: 'UAE', TR: 'Turkey', IR: 'Iran', PL: 'Poland', RU: 'Russia', TH: 'Thailand', PH: 'Philippines', ID: 'Indonesia',
  GH: 'Ghana', KE: 'Kenya', PR: 'Puerto Rico', CU: 'Cuba', PE: 'Peru', VE: 'Venezuela', IL: 'Israel', LB: 'Lebanon',
};
export const countryName = (c: string) => COUNTRY_NAMES[c] ?? c;
