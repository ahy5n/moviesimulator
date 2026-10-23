// The fortnightly turn: everything that happens when you press Advance.
import { formatDate, turnInYear, yearOf } from '../calendar';
import { makeRng, clamp } from '../rng';
import { GENRES, type GameState, type YearSummary } from '../types';
import { advanceAwards } from './awards';
import { advanceBoxOffice, advanceWindows, judgeResult, libraryIncome } from './boxoffice';
import { generateNewcomers, retirements, studioEvents, talentEvents } from './careers';
import {
  advanceFinance, boardOnResult, boardYearEnd, checkBankruptcy, checkSacking, marketShares, setBoardTargets, yearProfit,
} from './finance';
import { advanceProduction } from './production';
import { advanceRivals } from './rivals';
import { decayFranchises, refreshIPs, refreshMarketplace } from './scripts';
import { advanceStreaming } from './streaming';
import { newTally, setTally } from './util';

export function advanceTurn(prev: GameState): GameState {
  const s: GameState = structuredClone(prev);
  if (s.gameOver || s.sacked) return s;
  const tally = newTally();
  setTally(tally);
  const cashStart = s.studio.cash;
  try {
    // 1. Simulate the fortnight that is ending.
    advanceProduction(s);
    advanceBoxOffice(s);
    advanceWindows(s, (f) => {
      judgeResult(s, f);
      if (f.studioId === s.studio.id) boardOnResult(s, f.id);
    });
    libraryIncome(s);
    advanceStreaming(s);
    advanceRivals(s);
    advanceFinance(s);
    talentEvents(s);
    studioEvents(s);
    decayFranchises(s);
    for (const k of Object.keys(s.negotiations)) if (s.negotiations[k].status !== 'open') delete s.negotiations[k];
    s.biddingWar = undefined;
    for (const [id, c] of Object.entries(s.commitments)) if (c.until < s.t) delete s.commitments[id];
    s.inbox = s.inbox.filter((m) => !m.offer || m.offer.expires > s.t);

    // 2. Move the calendar on.
    s.t += 1;
    if (turnInYear(s.t) === 0) yearEnd(s);
    advanceAwards(s);
    refreshMarketplace(s);
    checkBankruptcy(s);
    checkSacking(s);
  } finally {
    setTally(null);
  }
  s.lastSummary = { t: s.t - 1, cashStart, cashEnd: s.studio.cash, income: tally.income, expenses: tally.expenses, headlines: tally.headlines };
  s.savedAt = Date.now();
  return s;
}

function yearEnd(s: GameState) {
  const year = yearOf(s.t) - 1;
  s.history.push(yearSummary(s, year));
  if (s.board) boardYearEnd(s);
  // Genre heat drifts every year.
  const r = makeRng(s.seed, year, 'heat');
  for (const g of GENRES) s.genreHeat[g] = clamp(s.genreHeat[g] + r.normal(0, 0.08) + (1 - s.genreHeat[g]) * 0.15, 0.6, 1.4);
  generateNewcomers(s);
  retirements(s);
  refreshIPs(s);
  if (s.board) setBoardTargets(s);
  // Trim old rival data to keep saves small.
  const cutoff = s.t - 26 * 4;
  s.films = s.films.filter((f) => f.studioId === s.studio.id || !f.release || f.release.t > cutoff || f.awards.length > 0);
  for (const f of s.films) if (f.studioId !== s.studio.id && f.release && f.release.t < s.t - 26 && !f.inTheatres) { f.reviews = undefined; f.events = []; f.weekly = []; f.openByMarket = undefined; f.fyc = {}; }
}

export function yearSummary(s: GameState, year: number): YearSummary {
  const mine = s.films.filter((f) => f.studioId === s.studio.id);
  const released = mine.filter((f) => f.release && yearOf(f.release.t) === year);
  const L = s.ledger[year] ?? {};
  const revenue = Object.values(L).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const costs = -Object.values(L).filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const shares = marketShares(s, year);
  const idx = shares.findIndex((x) => x.studio.id === s.studio.id);
  const awards = mine.flatMap((f) => f.awards).filter((a) => a.year === year - 1 || (a.body.length > 0 && a.year === year && ['summit', 'riviera', 'lido'].includes(a.body)));
  return {
    year, released: released.length, gross: released.reduce((a, f) => a + f.gross, 0), revenue, costs, profit: yearProfit(s, year),
    marketShare: shares[idx]?.share ?? 0, rank: idx + 1,
    noms: awards.length, wins: awards.filter((a) => a.won).length,
    bestPictures: awards.filter((a) => a.won && a.category === 'Best Picture' && a.body === 'academy').length,
    subs: s.studio.streaming?.subscribers ?? 0, studioName: s.studio.name,
  };
}

export const describeTurn = (t: number) => formatDate(t);
