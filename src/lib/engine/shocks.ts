// Industry shocks: writers' and actors' strikes that freeze production, and recession years.
// Every studio is hit the same way; the guilds are fictional.
import { formatDate } from '../calendar';
import { makeRng } from '../rng';
import type { GameState, Shock, ShockKind } from '../types';
import { headline, msg } from './util';

export const SHOCK_INFO: Record<ShockKind, { name: string; guild?: string; effects: string[] }> = {
  writers: {
    name: "Writers' strike", guild: 'Screenwriters Guild',
    effects: ['No new scripts can be commissioned or developed', 'Scripts in development stall', 'TV writers’ rooms stop: no new seasons start', 'The script market dries up'],
  },
  actors: {
    name: "Actors' strike", guild: 'Performers Guild',
    effects: ['Filming stops on every film and series (no spend while frozen)', 'Nothing new can be greenlit', 'Stars can’t promote releases: openings 15% lower'],
  },
  recession: {
    name: 'Recession',
    effects: ['Box office down 15%', 'TV licence fees down 10%', 'Streaming churn up', 'Talent fees down 10%', 'Loans cost 2 points more'],
  },
};

const LEAD = 2; // fortnights of warning before a strike starts

/** The shock in force this turn, if any. Announced-but-not-started shocks don't count. */
export function activeShock(s: GameState, kind?: ShockKind): Shock | undefined {
  return (s.shocks ?? []).find((x) => x.startT <= s.t && s.t < x.endT && (!kind || x.kind === kind));
}
export const upcomingShock = (s: GameState) => (s.shocks ?? []).find((x) => x.startT > s.t);

export const writersStrike = (s: GameState) => !!activeShock(s, 'writers');
export const actorsStrike = (s: GameState) => !!activeShock(s, 'actors');
export const recession = (s: GameState) => !!activeShock(s, 'recession');

export const boxOfficeShockMult = (s: GameState) => (recession(s) ? 0.85 : 1) * (actorsStrike(s) ? 0.85 : 1);
export const feeShockMult = (s: GameState) => (recession(s) ? 0.9 : 1);

/** Roughly one shock every three to four years, never in the first year. */
export function advanceShocks(s: GameState) {
  const r = makeRng(s.seed, s.t, 'shock');
  s.nextShockT ??= 26 + r.int(10, 50);
  for (const x of s.shocks ?? []) {
    if (x.startT === s.t) {
      const info = SHOCK_INFO[x.kind];
      msg(s, 'event', `${info.name} begins`, `${info.guild ? `The ${info.guild} is on strike. ` : ''}Expected to last until about ${formatDate(x.endT)}.\n${info.effects.map((e) => `• ${e}`).join('\n')}`);
      headline(`${info.name} begins`);
    }
    if (x.endT === s.t) {
      const info = SHOCK_INFO[x.kind];
      msg(s, 'event', `${info.name} is over`, x.kind === 'recession' ? 'Consumer spending is recovering.' : `The ${info.guild} has reached a deal. Production resumes.`);
      headline(`${info.name} ends`);
    }
  }
  if (activeShock(s) || upcomingShock(s) || s.t < s.nextShockT) return;
  const kind: ShockKind = r.weighted(['writers', 'actors', 'recession'] as ShockKind[], (k) => (k === 'recession' ? 1 : 1.2));
  const startT = s.t + (kind === 'recession' ? 1 : LEAD);
  const len = kind === 'recession' ? r.int(20, 30) : kind === 'writers' ? r.int(5, 10) : r.int(4, 9);
  (s.shocks ??= []).push({ kind, announcedT: s.t, startT, endT: startT + len });
  s.nextShockT = startT + len + r.int(52, 90);
  const info = SHOCK_INFO[kind];
  if (kind === 'recession') msg(s, 'event', 'Economists call a recession', `Audiences are tightening their belts. Expect about ${Math.round(len / 2)} months of pain.\n${info.effects.map((e) => `• ${e}`).join('\n')}`);
  else msg(s, 'event', `${info.guild} sets a strike date`, `Talks with the studios have collapsed. A strike starts ${formatDate(startT)} unless something changes. Get films into the can and seasons started now.\n${info.effects.map((e) => `• ${e}`).join('\n')}`);
  headline(kind === 'recession' ? 'Recession hits' : `${info.guild} votes to strike`);
}
