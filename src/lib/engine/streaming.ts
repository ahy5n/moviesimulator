// The player's streaming service (and a light model of rival services).
import { makeRng, clamp } from '../rng';
import type { Film, GameState } from '../types';
import { castMembers } from './production';
import { msg, pay } from './util';

export const LAUNCH_TURN = 26; // available from the start of year two
export const launchCost = (s: GameState) => (s.settings.startBudget === 'indie' ? 40e6 : s.settings.startBudget === 'minimajor' ? 120e6 : 250e6);

export function canLaunch(s: GameState): string | null {
  if (s.studio.streaming) return 'Already launched.';
  if (s.t < LAUNCH_TURN) return 'Available from January 2027.';
  if (s.studio.cash < launchCost(s)) return 'Not enough cash.';
  return null;
}

export function launchStreaming(s: GameState, name: string, price: number) {
  if (canLaunch(s)) return;
  pay(s, s.studio.id, -launchCost(s), 'Streaming');
  s.studio.streaming = { name, launchedT: s.t, subscribers: 150_000, price, churn: 0.03, libraryValue: 0, history: [], exclusivesBoost: 0 };
  msg(s, 'news', `${name} launches`, `Your streaming service is live at $${price.toFixed(2)}/month. Your back catalogue moves onto the platform.`, { link: '/streaming' });
}

/** Subscriber pull of a single title. Exclusives and recent films pull hardest. */
export function titlePull(s: GameState, f: Film): number {
  if (f.soldTo || f.stage === 'shelved') return 0;
  const onService = f.stage === 'library' || (f.release?.type === 'dayanddate' && f.stage === 'released') || (f.release?.type === 'streaming' && f.stage === 'released');
  if (!onService) return 0;
  const q = f.qualityKnown ? (0.5 * f.quality + 0.5 * (f.audience ?? f.quality)) : 50;
  const leads = castMembers(s, f).filter((m) => m.lead);
  const star = leads.length ? leads.reduce((a, m) => a + m.t.attrs.starPower, 0) / leads.length : 45;
  const age = Math.max(0, (s.t - (f.release?.t ?? s.t)) / 26);
  const scale = Math.min(2, Math.sqrt(f.budget / 30e6));
  const exclusive = f.release?.type === 'streaming' ? 1.6 : f.release?.type === 'dayanddate' ? 1.25 : 1;
  return 260_000 * Math.pow(q / 65, 2.4) * (0.6 + star / 120) * scale * exclusive * (1 + f.buzz * 0.2) * Math.pow(0.72, age);
}

export const opCost = (subs: number) => 2.5e6 + subs * 1.1 * 12 / 26;

export function advanceStreaming(s: GameState) {
  const sv = s.studio.streaming;
  // Rival services drift a little each turn.
  for (const rv of s.rivals) if (rv.rivalSubs) rv.rivalSubs *= 1 + makeRng(s.seed, s.t, rv.id, 'subs').normal(0.002, 0.004);
  if (!sv) return;
  const r = makeRng(s.seed, s.t, 'stream');
  const mine = s.films.filter((f) => f.studioId === s.studio.id);
  let library = 0;
  const pulls = new Map<string, number>();
  for (const f of mine) {
    const p = titlePull(s, f);
    if (p > 0) { pulls.set(f.id, p); library += p; }
  }
  sv.libraryValue = library;
  // New exclusive drops this turn add a burst of sign-ups.
  let burst = 0;
  for (const f of mine) {
    if (f.release && f.release.t === s.t && (f.release.type === 'streaming' || f.release.type === 'dayanddate')) burst += (pulls.get(f.id) ?? 0) * 0.6;
  }
  const priceFactor = Math.pow(9.99 / sv.price, 1.3);
  const rivalSubs = s.rivals.reduce((a, rv) => a + (rv.rivalSubs ?? 0), 0);
  const competition = clamp(1.15 - Math.log10(1 + rivalSubs / 1e8) * 0.2, 0.7, 1.1);
  const target = library * priceFactor * competition;
  sv.churn = clamp(0.028 + (sv.price - 9.99) * 0.004 + (library < 1e6 ? 0.01 : 0), 0.01, 0.12);
  const lost = sv.subscribers * sv.churn * 12 / 26;
  const gained = Math.max(0, (target - sv.subscribers) * 0.16) + burst + sv.subscribers * sv.churn * 12 / 26 * 0.7 * Math.min(1.3, target / Math.max(1, sv.subscribers));
  sv.subscribers = Math.max(5000, Math.round(sv.subscribers + gained - lost + r.normal(0, sv.subscribers * 0.005)));
  const revenue = sv.subscribers * sv.price * 12 / 26;
  pay(s, s.studio.id, revenue, 'Streaming');
  pay(s, s.studio.id, -opCost(sv.subscribers), 'Streaming costs');
  sv.history.push({ t: s.t, subs: sv.subscribers, revenue });
  if (sv.history.length > 26 * 12) sv.history.shift();
  // Attribute revenue to titles (for film P&L only; cash is already booked above).
  if (library > 0) for (const f of mine) { const p = pulls.get(f.id); if (p) f.otherRevenue += revenue * (p / library) * 0.5; }
}

export function setPrice(s: GameState, price: number) {
  if (s.studio.streaming) s.studio.streaming.price = clamp(Math.round(price * 100) / 100, 2.99, 29.99);
}
