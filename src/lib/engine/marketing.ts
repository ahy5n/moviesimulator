// Release campaigns on top of plain P&A, pre-release tracking and moving release dates.
import { formatDate } from '../calendar';
import { makeRng, clamp } from '../rng';
import type { CampaignItem, Film, GameState, Genre } from '../types';
import { expectedOpening } from './boxoffice';
import { loyaltyTo } from './loyalty';
import { actorsStrike } from './shocks';
import { headline, msg, spend } from './util';

const YOUNG: Genre[] = ['Horror', 'Comedy', 'Action', 'Superhero', 'Animation'];

export const CAMPAIGN: Record<CampaignItem, { name: string; blurb: string }> = {
  trailer: { name: 'Big trailer launch', blurb: 'Debut the trailer in a huge live TV slot. Buzz rises, more if the film is good.' },
  premiere: { name: 'Red-carpet premiere', blurb: 'A glossy premiere. Critics are a little kinder (+2) and buzz rises.' },
  tour: { name: 'Global press tour', blurb: 'Your leads promote it worldwide: opening +6%. Stars loyal to you (3+) do it for free. Impossible during an actors’ strike.' },
  tvblitz: { name: 'TV spot blitz', blurb: 'Saturate ad breaks: opening +8%. Worth it for wide releases.' },
  social: { name: 'Social & influencer push', blurb: 'Cheap. +8% opening for horror, comedy, action, superhero and animation; +3% otherwise.' },
};
export const CAMPAIGN_ITEMS = Object.keys(CAMPAIGN) as CampaignItem[];

export function campaignCost(s: GameState, f: Film, item: CampaignItem): number {
  switch (item) {
    case 'trailer': return Math.round(Math.max(1e6, f.budget * 0.03) / 1e5) * 1e5;
    case 'premiere': return Math.round(Math.max(0.4e6, f.budget * 0.01) / 1e5) * 1e5;
    case 'tvblitz': return Math.round(Math.max(2e6, f.budget * 0.05) / 1e5) * 1e5;
    case 'social': return Math.round((0.4e6 + f.budget * 0.004) / 1e5) * 1e5;
    case 'tour': {
      const leads = f.cast.filter((c) => c.role === 'lead');
      return leads.reduce((a, c) => a + (loyaltyTo(s, c.talentId, f.studioId).total >= 3 ? 0 : 0.8e6), 0);
    }
  }
}

export const campaignBlocked = (s: GameState, item: CampaignItem) => (item === 'tour' && actorsStrike(s) ? 'The actors are on strike: no press tours.' : null);

/** Opening multiplier from campaign extras. */
export function campaignMult(s: GameState, f: Film): number {
  const c = f.campaign ?? [];
  let m = 1;
  if (c.includes('tour') && !actorsStrike(s)) m *= 1.06;
  if (c.includes('tvblitz')) m *= 1.08;
  if (c.includes('social')) m *= YOUNG.includes(f.primaryGenre) ? 1.08 : 1.03;
  return m;
}

/** Pay for campaign extras and fire the trailer/premiere effects. Called when a release is scheduled. */
export function runCampaign(s: GameState, f: Film, items: CampaignItem[]) {
  const ok = items.filter((i) => !campaignBlocked(s, i));
  f.campaign = ok;
  const cost = ok.reduce((a, i) => a + campaignCost(s, f, i), 0);
  spend(s, f, cost, 'Marketing');
  if (ok.includes('premiere')) f.buzz = clamp(f.buzz + 0.1, -0.8, 2.5);
  if (ok.includes('trailer')) {
    const r = makeRng(s.seed, f.id, 'trailer');
    const reaction = clamp(r.normal((f.quality - 60) / 25 + 0.5, 0.45), -0.6, 1.6);
    f.buzz = clamp(f.buzz + 0.12 + reaction * 0.15, -0.8, 2.5);
    const views = Math.round(Math.max(3, (20 + reaction * 40) * Math.sqrt(f.budget / 50e6)));
    const verdict = reaction > 0.9 ? 'goes viral' : reaction > 0.3 ? 'lands well' : reaction > -0.1 ? 'gets a shrug' : 'gets ratioed';
    f.events.push(`Trailer ${verdict}: ${views}M views in a day.`);
    msg(s, 'event', `${f.title} trailer ${verdict}`, `${views}M views in 24 hours.`, { link: `/film/${f.id}` });
  }
}

/** Pre-release opening-week tracking for your scheduled films. Gets sharper as the date approaches. */
export function advanceTracking(s: GameState) {
  for (const f of s.films) {
    if (f.studioId !== s.studio.id || f.stage !== 'ready' || !f.release || f.release.t <= s.t) continue;
    if (f.release.type !== 'theatrical' && f.release.type !== 'dayanddate') continue;
    const weeksOut = f.release.t - s.t;
    if (weeksOut > 8) continue;
    const exp = Object.values(expectedOpening(s, f, { t: f.release.t, screens: f.release.screens, marketing: f.marketing, type: f.release.type })).reduce((a, b) => a + b, 0);
    const reviews = 0.82 + (f.quality || 55) / 100 * 0.38;
    const r = makeRng(s.seed, f.id, 'track', s.t);
    const mid = exp * reviews * r.normal(1, 0.04 * weeksOut);
    const u = 0.1 + 0.05 * weeksOut;
    (f.tracking ??= []).push({ t: s.t, low: Math.round(mid * (1 - u)), high: Math.round(mid * (1 + u)) });
    if (f.tracking.length > 8) f.tracking.shift();
  }
}

export const moveFee = (f: Film) => Math.round(f.marketing * 0.08 / 1e5) * 1e5;

/** Move a scheduled release. Ad buys have to be redone, and long delays get people talking. */
export function moveRelease(s: GameState, f: Film, newT: number): string | null {
  if (f.stage !== 'ready' || !f.release || f.release.t <= s.t || f.release.type === 'sold') return 'Can’t move this release.';
  const minT = s.t + (f.release.type === 'streaming' ? 1 : 2);
  if (newT < minT) return 'Too soon. Marketing needs lead time.';
  if (newT === f.release.t) return null;
  const fee = moveFee(f);
  if (s.studio.cash < fee) return 'Not enough cash for the new ad buys.';
  spend(s, f, fee, 'Marketing');
  const delay = newT - f.release.t;
  if (delay >= 4) f.buzz = clamp(f.buzz - 0.1, -0.8, 2.5);
  f.events.push(`Release ${delay > 0 ? 'pushed back' : 'brought forward'} to ${formatDate(newT)}.`);
  f.release.t = newT;
  f.tracking = [];
  if (delay >= 4) headline(`${f.title} delayed to ${formatDate(newT)}`);
  return null;
}
