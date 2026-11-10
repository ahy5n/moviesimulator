// The player's streaming service (and a light model of rival services).
import { makeRng, clamp } from '../rng';
import { channelById } from '@/data/channels';
import type { Film, GameState, StreamingService } from '../types';
import { castMembers } from './production';
import { msg, pay } from './util';
import { seriesPull, seriesPullRaw } from './tv';
import { recession } from './shocks';

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

/** Subscriber pull of a film, wherever it streams. */
export function filmPullRaw(s: GameState, f: Film): number {
  const q = f.qualityKnown ? (0.5 * f.quality + 0.5 * (f.audience ?? f.quality)) : 50;
  const leads = castMembers(s, f).filter((m) => m.lead);
  const star = leads.length ? leads.reduce((a, m) => a + m.t.attrs.starPower, 0) / leads.length : 45;
  const age = Math.max(0, (s.t - (f.release?.t ?? s.t)) / 26);
  const scale = Math.min(2, Math.sqrt(f.budget / 30e6));
  const exclusive = f.release?.type === 'streaming' ? 1.6 : f.release?.type === 'dayanddate' ? 1.25 : 1;
  return 260_000 * Math.pow(q / 65, 2.4) * (0.6 + star / 120) * scale * exclusive * (1 + f.buzz * 0.2) * Math.pow(0.72, age);
}

/** Subscriber pull of one of your titles on your own service. */
export function titlePull(s: GameState, f: Film): number {
  if (f.soldTo || f.stage === 'shelved') return 0;
  const onService = f.stage === 'library' || (f.release?.type === 'dayanddate' && f.stage === 'released') || (f.release?.type === 'streaming' && f.stage === 'released');
  return onService ? filmPullRaw(s, f) : 0;
}

export const opCost = (subs: number) => 2.5e6 + subs * 1.1 * 12 / 26;

/** Share of subscribers on the cheaper ad-supported plan, and what each brings in a month. */
export const AD_SHARE = 0.4;
export const adArpu = (s: GameState) => (recession(s) ? 3.6 : 4.5);
export function revenuePerSubMonth(s: GameState, sv: StreamingService) {
  if (!sv.adTier) return sv.price;
  return (1 - AD_SHARE) * sv.price + AD_SHARE * (sv.price * 0.55 + adArpu(s));
}

// ---------- Licensing other studios' titles onto your service ----------

export const LICENCE_PER_PULL_YEAR = 22; // dollars per subscriber of pull, per year

export function licensableTitles(s: GameState) {
  const out: { id: string; kind: 'film' | 'series'; title: string; from: string; pull: number }[] = [];
  const have = new Set((s.studio.streaming?.licensed ?? []).map((l) => l.id));
  for (const f of s.films) {
    if (f.studioId === s.studio.id || have.has(f.id) || f.stage !== 'library' || f.release?.type === 'streaming' || f.release?.type === 'sold') continue;
    const pull = filmPullRaw(s, f) * 0.6; // second-window titles pull less than your own
    if (pull > 40_000) out.push({ id: f.id, kind: 'film', title: f.title, from: f.studioId, pull });
  }
  for (const x of s.series ?? []) {
    if (x.studioId === s.studio.id || have.has(x.id) || !x.seasons.length || x.stage === 'airing') continue;
    const own = channelById(x.contract?.channelId)?.studioId;
    if (own && own === x.studioId) continue; // their streaming originals aren't for rent
    const pull = seriesPullRaw(s, x) * 0.5;
    if (pull > 40_000) out.push({ id: x.id, kind: 'series', title: x.title, from: x.studioId, pull });
  }
  return out.sort((a, b) => b.pull - a.pull).slice(0, 20);
}

export const licencePrice = (pull: number, years: number) => Math.round((pull * LICENCE_PER_PULL_YEAR * years) / 1e5) * 1e5;

export function licenseIn(s: GameState, id: string, years: number): string | null {
  const sv = s.studio.streaming;
  if (!sv) return 'Launch your streaming service first.';
  const t = licensableTitles(s).find((x) => x.id === id);
  if (!t) return 'Not available.';
  const price = licencePrice(t.pull, years);
  if (s.studio.cash < price) return 'Not enough cash.';
  pay(s, s.studio.id, -price, 'Content licensing');
  pay(s, t.from, price, 'Content licensing');
  (sv.licensed ??= []).push({ ...t, untilT: s.t + years * 26 });
  return null;
}

/** Rival services grow with their originals and their release slate; your growth comes partly out of theirs. */
function advanceRivalServices(s: GameState, playerAdds: number) {
  const total = s.rivals.reduce((a, rv) => a + (rv.rivalSubs ?? 0), 0) || 1;
  for (const rv of s.rivals) {
    if (!rv.rivalSubs) continue;
    const r = makeRng(s.seed, s.t, rv.id, 'subs');
    let growth = 0.0006 + r.normal(0, 0.003);
    for (const x of s.series ?? []) {
      if (x.stage !== 'airing' || channelById(x.contract?.channelId)?.studioId !== rv.id) continue;
      growth += 0.0012 * Math.pow((x.current?.quality ?? 60) / 65, 2);
    }
    for (const f of s.films) if (f.studioId === rv.id && f.release?.type === 'streaming' && f.release.t === s.t) growth += 0.002 * Math.pow((f.quality || 60) / 65, 2);
    if (recession(s)) growth -= 0.002;
    rv.rivalSubs = Math.max(1e6, rv.rivalSubs * (1 + clamp(growth, -0.02, 0.02)) - Math.max(0, playerAdds) * 0.5 * (rv.rivalSubs / total));
  }
}

export function advanceStreaming(s: GameState) {
  const sv = s.studio.streaming;
  if (!sv) { advanceRivalServices(s, 0); return; }
  const r = makeRng(s.seed, s.t, 'stream');
  const mine = s.films.filter((f) => f.studioId === s.studio.id);
  let library = 0, burst = 0;
  const pulls = new Map<string, number>();
  for (const f of mine) {
    const p = titlePull(s, f);
    if (p > 0) { pulls.set(f.id, p); library += p; }
  }
  // Your own original series count too, and a new season brings a burst of sign-ups.
  const seriesPulls = new Map<string, number>();
  for (const x of s.series ?? []) {
    if (x.studioId !== s.studio.id) continue;
    const p = seriesPull(s, x);
    if (p <= 0) continue;
    seriesPulls.set(x.id, p);
    library += p;
    if (x.stage === 'airing') burst += p * 0.5;
  }
  sv.licensed = (sv.licensed ?? []).filter((l) => l.untilT > s.t);
  for (const l of sv.licensed) library += l.pull;
  sv.libraryValue = library;
  // New exclusive drops this turn add a burst of sign-ups.
  for (const f of mine) {
    if (f.release && f.release.t === s.t && (f.release.type === 'streaming' || f.release.type === 'dayanddate')) burst += (pulls.get(f.id) ?? 0) * 0.6;
  }
  sv.exclusivesBoost = Math.max(0, (sv.exclusivesBoost ?? 0) - 0.002); // a hit original's halo fades slowly
  const priceFactor = Math.pow(9.99 / sv.price, 1.3);
  const rivalSubs = s.rivals.reduce((a, rv) => a + (rv.rivalSubs ?? 0), 0);
  const competition = clamp(1.15 - Math.log10(1 + rivalSubs / 1e8) * 0.2, 0.7, 1.1);
  const target = library * priceFactor * competition * (1 + sv.exclusivesBoost) * (sv.adTier ? 1.25 : 1);
  sv.churn = clamp(0.028 + (sv.price - 9.99) * 0.004 + (library < 1e6 ? 0.01 : 0) + (recession(s) ? 0.012 : 0) - (sv.adTier ? 0.004 : 0), 0.01, 0.12);
  const lost = sv.subscribers * sv.churn * 12 / 26;
  const gained = Math.max(0, (target - sv.subscribers) * 0.16) + burst + sv.subscribers * sv.churn * 12 / 26 * 0.7 * Math.min(1.3, target / Math.max(1, sv.subscribers));
  const before = sv.subscribers;
  sv.subscribers = Math.max(5000, Math.round(sv.subscribers + gained - lost + r.normal(0, sv.subscribers * 0.005)));
  advanceRivalServices(s, sv.subscribers - before);
  const revenue = sv.subscribers * revenuePerSubMonth(s, sv) * 12 / 26;
  pay(s, s.studio.id, revenue, 'Streaming');
  pay(s, s.studio.id, -opCost(sv.subscribers), 'Streaming costs');
  sv.history.push({ t: s.t, subs: sv.subscribers, revenue });
  if (sv.history.length > 26 * 12) sv.history.shift();
  // Attribute revenue to titles (for P&L only; cash is already booked above).
  if (library > 0) {
    for (const f of mine) { const p = pulls.get(f.id); if (p) f.otherRevenue += revenue * (p / library) * 0.5; }
    for (const x of s.series ?? []) { const p = seriesPulls.get(x.id); if (p) x.revenue += revenue * (p / library) * 0.5; }
  }
}

export function setAdTier(s: GameState, on: boolean) {
  if (s.studio.streaming) s.studio.streaming.adTier = on;
}

export function setPrice(s: GameState, price: number) {
  if (s.studio.streaming) s.studio.streaming.price = clamp(Math.round(price * 100) / 100, 2.99, 29.99);
}
