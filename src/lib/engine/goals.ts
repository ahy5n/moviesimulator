// Scenarios (a goal and a deadline chosen at the start) and achievements (unlocked as you play).
import { formatDate, yearOf } from '../calendar';
import type { GameSettings, GameState } from '../types';
import { debt } from './finance';
import { franchiseGrossAll } from './rights';
import { headline, msg } from './util';

export type ScenarioDef = {
  id: string; name: string; blurb: string; years: number;
  setup: Partial<GameSettings> & { cash?: number; loan?: number; prestige?: number };
  progress: (s: GameState) => { done: boolean; text: string };
};

const hasWon = (s: GameState, body: string, category: string) => s.films.some((f) => f.studioId === s.studio.id && f.awards.some((a) => a.won && a.body === body && a.category === category));

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'turnaround', name: 'The Turnaround', years: 3,
    blurb: 'You inherit a broke indie: $12M in the bank, a $40M loan and a board that wants blood. Get to $100M cash with no debt.',
    setup: { startBudget: 'indie', difficulty: 'hard', cash: 12e6, loan: 40e6, prestige: 30 },
    progress: (s) => ({ done: s.studio.cash >= 100e6 && debt(s) <= 0, text: `Cash $${(s.studio.cash / 1e6).toFixed(0)}M of $100M · debt $${(debt(s) / 1e6).toFixed(0)}M` }),
  },
  {
    id: 'indie-bp', name: 'Small Studio, Big Night', years: 6,
    blurb: 'Start as an indie and win Best Picture at the Academy Honours.',
    setup: { startBudget: 'indie' },
    progress: (s) => ({ done: hasWon(s, 'academy', 'Best Picture'), text: `${s.films.filter((f) => f.studioId === s.studio.id).flatMap((f) => f.awards).filter((a) => a.body === 'academy').length} Academy nominations so far` }),
  },
  {
    id: 'streamer', name: 'Streaming Wars', years: 5,
    blurb: 'Launch a service and reach 25 million subscribers.',
    setup: { startBudget: 'minimajor' },
    progress: (s) => ({ done: (s.studio.streaming?.subscribers ?? 0) >= 25e6, text: `${((s.studio.streaming?.subscribers ?? 0) / 1e6).toFixed(1)}M of 25M subscribers` }),
  },
  {
    id: 'franchise', name: 'Franchise Builder', years: 6,
    blurb: 'Own a franchise that has grossed $3 billion. Build one, or buy one.',
    setup: { startBudget: 'minimajor' },
    progress: (s) => {
      const best = Math.max(0, ...s.franchises.filter((f) => f.studioId === s.studio.id).map((f) => franchiseGrossAll(s, f)));
      return { done: best >= 3e9, text: `Biggest franchise: $${(best / 1e9).toFixed(2)}B of $3B` };
    },
  },
  {
    id: 'mogul', name: 'King of Hollywood', years: 8,
    blurb: 'Start as a major and finish three years in a row at #1 in market share.',
    setup: { startBudget: 'major' },
    progress: (s) => {
      let run = 0, best = 0;
      for (const h of s.history) { run = h.rank === 1 ? run + 1 : 0; best = Math.max(best, run); }
      return { done: best >= 3, text: `Best run at #1: ${best} year${best === 1 ? '' : 's'}` };
    },
  },
  {
    id: 'tv', name: 'Prestige TV', years: 5,
    blurb: 'Win Best Drama Series at the Crystal Television Awards with three of your shows on air at once along the way.',
    setup: { startBudget: 'minimajor' },
    progress: (s) => {
      const won = (s.series ?? []).some((x) => x.studioId === s.studio.id && x.awards?.some((a) => a.won && a.body === 'crystal' && a.category === 'Best Drama Series'));
      const onAir = (s.series ?? []).filter((x) => x.studioId === s.studio.id && x.stage === 'airing').length;
      if (onAir >= 3) s.stats.tripleAir = 1;
      return { done: won && !!s.stats.tripleAir, text: `${won ? '✓' : '✗'} Crystal Best Drama · ${s.stats.tripleAir ? '✓' : `${onAir}/3`} shows on air at once` };
    },
  },
];
export const scenarioDef = (id?: string) => SCENARIOS.find((x) => x.id === id);

export function checkScenario(s: GameState) {
  const sc = s.scenario;
  const def = scenarioDef(sc?.id);
  if (!sc || !def || sc.status !== 'active') return;
  const p = def.progress(s);
  if (p.done) {
    sc.status = 'won';
    msg(s, 'board', `Scenario complete: ${def.name}`, `You did it with ${Math.max(0, sc.deadlineT - s.t)} fortnights to spare. Keep playing as long as you like.`, { link: '/history' });
    headline(`Scenario complete: ${def.name}!`);
  } else if (s.t >= sc.deadlineT) {
    sc.status = 'lost';
    msg(s, 'board', `Scenario failed: ${def.name}`, `The deadline (${formatDate(sc.deadlineT)}) has passed. ${p.text}. You can keep playing in sandbox mode.`, { link: '/history' });
  }
}

// ---------- Achievements ----------

type Ach = { id: string; name: string; blurb: string; check: (s: GameState) => boolean };
const mineFilms = (s: GameState) => s.films.filter((f) => f.studioId === s.studio.id);
const mineSeries = (s: GameState) => (s.series ?? []).filter((x) => x.studioId === s.studio.id);

export const ACHIEVEMENTS: Ach[] = [
  { id: 'first', name: 'Opening Night', blurb: 'Release your first film.', check: (s) => mineFilms(s).some((f) => f.stage === 'released' || f.stage === 'library') },
  { id: 'hundred', name: 'Nine Figures', blurb: 'A film grosses $100M.', check: (s) => mineFilms(s).some((f) => f.gross >= 100e6) },
  { id: 'billion', name: 'Billion-Dollar Baby', blurb: 'A film grosses $1B.', check: (s) => mineFilms(s).some((f) => f.gross >= 1e9) },
  { id: 'bp', name: 'Best Picture', blurb: 'Win Best Picture at the Academy Honours.', check: (s) => hasWon(s, 'academy', 'Best Picture') },
  { id: 'sweep', name: 'Clean Sweep', blurb: 'Win five awards at a single ceremony.', check: (s) => s.ceremonies.some((c) => c.categories.filter((k) => k.winner >= 0 && k.nominees[k.winner]?.studioId === s.studio.id).length >= 5) },
  { id: 'crystal', name: 'Crystal Clear', blurb: 'Win a Crystal Television Award.', check: (s) => mineSeries(s).some((x) => x.awards?.some((a) => a.won && a.body === 'crystal')) },
  { id: 'festival', name: 'Grand Prize', blurb: 'Win a festival Grand Prize.', check: (s) => mineFilms(s).some((f) => f.awards.some((a) => a.won && a.category === 'Grand Prize')) },
  { id: 'fivesea', name: 'Long Runner', blurb: 'A series reaches season five.', check: (s) => mineSeries(s).some((x) => x.season >= 5) },
  { id: 'synd', name: 'Syndicated', blurb: 'Sell a series into syndication.', check: (s) => mineSeries(s).some((x) => x.syndicated) },
  { id: 'subs10', name: 'Ten Million Strong', blurb: '10M subscribers on your service.', check: (s) => (s.studio.streaming?.subscribers ?? 0) >= 10e6 },
  { id: 'trilogy', name: 'Trilogy', blurb: 'Release three films in one franchise.', check: (s) => s.franchises.some((fr) => fr.studioId === s.studio.id && fr.filmIds.filter((id) => mineFilms(s).some((f) => f.id === id && f.release && f.release.t <= s.t)).length >= 3) },
  { id: 'buyfest', name: 'Market Buyer', blurb: 'Buy a film at a festival market.', check: (s) => mineFilms(s).some((f) => f.acquiredAt) },
  { id: 'buyrights', name: 'Corporate Raider', blurb: 'Buy a franchise from a rival.', check: (s) => s.franchises.some((fr) => fr.studioId === s.studio.id && fr.legacyFilms) || mineFilms(s).some((f) => f.boughtFrom && f.franchiseId) },
  { id: 'park', name: 'Theme Park Tycoon', blurb: 'Open a theme-park land.', check: (s) => s.franchises.some((fr) => fr.studioId === s.studio.id && fr.licences?.some((l) => l.kind === 'park' && l.live)) },
  { id: 'lot', name: 'Own the Lot', blurb: 'Fully build any facility.', check: (s) => Object.entries(s.facilities ?? {}).some(([id, f]) => f && f.readyT <= s.t && f.level >= (id === 'post' ? 2 : 3)) },
  { id: 'deal', name: 'Locked In', blurb: 'Sign someone to an overall or exclusive deal.', check: (s) => (s.deals ?? []).some((d) => d.studioId === s.studio.id && d.kind === 'overall') },
  { id: 'package', name: 'Packaged', blurb: 'Accept an agency package.', check: (s) => mineFilms(s).some((f) => f.events.some((e) => e.startsWith('Packaged by'))) },
  { id: 'spinoff', name: 'Spin Cycle', blurb: 'Spin a film into a series, or a series into a film.', check: (s) => mineSeries(s).some((x) => x.spinoffOf) || mineFilms(s).some((f) => f.spinoffOf) },
  { id: 'strike', name: 'Picket Line', blurb: 'Run a studio through a strike.', check: (s) => (s.shocks ?? []).some((x) => x.kind !== 'recession' && x.endT <= s.t) },
  { id: 'profit', name: 'In the Black', blurb: 'Make $100M profit in a year.', check: (s) => s.history.some((h) => h.profit >= 100e6) },
  { id: 'top', name: 'Number One', blurb: 'Finish a year #1 in market share.', check: (s) => s.history.some((h) => h.rank === 1) },
  { id: 'comeback', name: 'Comeback', blurb: 'Get fired and take a new job.', check: (s) => s.jobHistory.length >= 2 },
  { id: 'decade', name: 'A Decade at the Top', blurb: 'Run studios for ten years.', check: (s) => s.t >= 260 },
];

export function checkAchievements(s: GameState) {
  const got = (s.achievements ??= {});
  for (const a of ACHIEVEMENTS) {
    if (got[a.id] !== undefined || !a.check(s)) continue;
    got[a.id] = s.t;
    msg(s, 'news', `Achievement: ${a.name}`, a.blurb, { link: '/history', read: true });
    headline(`🏅 Achievement unlocked: ${a.name}`);
  }
}

export function startScenario(s: GameState, id: string) {
  const def = scenarioDef(id);
  if (!def) return;
  s.scenario = { id, startT: s.t, deadlineT: s.t + def.years * 26, status: 'active' };
  msg(s, 'board', `Scenario: ${def.name}`, `${def.blurb}\nDeadline: ${formatDate(s.scenario.deadlineT)} (end of ${yearOf(s.scenario.deadlineT) - 1}).`, { link: '/history' });
}
