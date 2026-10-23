/**
 * Headless balance run: an "average player" bot plays N years across several seeds.
 *   npm run simulate -- --years 10 --games 6 --difficulty hard --budget minimajor
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { monthOf, yearOf } from '../src/lib/calendar';
import { MONTH_HEAT } from '../src/lib/constants';
import { makeRng } from '../src/lib/rng';
import { buildDB, setDB, allTalent, genreFit, isAvailable, type DbFile } from '../src/lib/talentDb';
import type { Film, GameState } from '../src/lib/types';
import { newGame } from '../src/lib/engine/newGame';
import { advanceTurn } from '../src/lib/engine/turn';
import { buyScript } from '../src/lib/engine/scripts';
import { openNegotiation, respond, negKey, playerBid, rivalStep, closeWar } from '../src/lib/engine/negotiation';
import { greenlight, greenlightIssues } from '../src/lib/engine/production';
import { scheduleRelease } from '../src/lib/engine/boxoffice';
import { launchStreaming, canLaunch } from '../src/lib/engine/streaming';
import { acceptJob } from '../src/lib/engine/finance';
import { filmProfit } from '../src/lib/engine/util';
import { tierInfo } from '../src/lib/constants';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const YEARS = Number(arg('years', '10'));
const GAMES = Number(arg('games', '4'));
const DIFF = arg('difficulty', 'hard') as 'easy' | 'hard';
const BUDGET = arg('budget', 'minimajor') as 'indie' | 'minimajor' | 'major';

const dir = join(process.cwd(), 'public', 'data');
const files = ['actors', 'directors', 'writers', 'crew'].map((n) => JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8')) as DbFile);
const costars = existsSync(join(dir, 'costars.json')) ? JSON.parse(readFileSync(join(dir, 'costars.json'), 'utf8')) : [];
setDB(buildDB(files, costars));

function botTurn(s: GameState) {
  const r = makeRng('bot', s.seed, s.t);
  const mine = s.films.filter((f) => f.studioId === s.studio.id);
  const active = mine.filter((f) => ['development', 'preproduction', 'filming', 'post', 'ready'].includes(f.stage));
  const maxActive = BUDGET === 'indie' ? 3 : BUDGET === 'minimajor' ? 5 : 9;
  const reserve = (BUDGET === 'indie' ? 8e6 : BUDGET === 'minimajor' ? 60e6 : 200e6);
  // Buy a script.
  if (active.length < maxActive) {
    const committed = active.reduce((a, f) => a + (f.stage === 'ready' || f.stage === 'post' ? (f.release ? 0 : f.budget * 0.5) : f.budget - (f.prodPaid ?? 0) + f.budget * 0.5), 0);
    const affordable = s.scripts.filter((sc) => sc.suggestedBudget * 1.8 + sc.price < s.studio.cash - reserve - committed)
      .sort((a, b) => (b.low + b.high) / 2 * s.genreHeat[b.primaryGenre] - (a.low + a.high) / 2 * s.genreHeat[a.primaryGenre]);
    if (affordable.length && r.chance(0.6)) buyScript(s, affordable[0].id);
  }
  for (const f of mine) {
    if (f.stage === 'preproduction') castFilm(s, f, r);
    if (f.stage === 'ready' && !f.release) {
      // Pick the best window in the next 8 turns.
      let best = s.t + 2, bs = 0;
      for (let t = s.t + 2; t < s.t + 10; t++) { const h = MONTH_HEAT[monthOf(t)] + r.range(0, 0.1); if (h > bs) { bs = h; best = t; } }
      const type = s.studio.streaming && r.chance(0.25) ? 'streaming' : 'theatrical';
      scheduleRelease(s, f, { type, t: best, screens: f.tier === 'Micro' ? 'limited' : f.tier === 'Low' ? 'moderate' : 'wide', marketing: Math.round(f.budget * 0.5) });
    }
  }
  if (!canLaunch(s) && !s.studio.streaming) { /* not yet */ } else if (!s.studio.streaming && s.studio.cash > 4 * (BUDGET === 'indie' ? 40e6 : 150e6) && r.chance(0.2)) launchStreaming(s, 'BotFlix', 9.99);
}

function castFilm(s: GameState, f: Film, r: ReturnType<typeof makeRng>) {
  const pick = (kind: 'actor' | 'director', maxFee: number) => {
    const pool = allTalent(s, kind).filter((t) => isAvailable(s, t.id) && t.fee <= maxFee && !f.cast.some((c) => c.talentId === t.id));
    pool.sort((a, b) => (genreFit(b, f.primaryGenre, f.secondaryGenre) + b.attrs.overall) - (genreFit(a, f.primaryGenre, f.secondaryGenre) + a.attrs.overall));
    return pool[r.int(0, Math.min(5, pool.length - 1))];
  };
  const deal = (id: string, role: 'lead' | 'support' | 'director') => {
    const res = openNegotiation(s, id, f.id, role);
    if (res.kind === 'bidding') {
      playerBid(s, res.war.current);
      for (let i = 0; i < 6 && rivalStep(s); i++) if (r.chance(0.5)) playerBid(s, s.biddingWar!.current * 1.08);
      closeWar(s);
      return;
    }
    if (res.kind !== 'opened') return;
    const t = allTalent(s).find((x) => x.id === id)!;
    let offer = { fee: res.neg.asking * 0.95, backend: t.backendDemand, billing: role === 'lead' ? 1 : 3, options: 1 };
    for (let i = 0; i < 3; i++) {
      const n = respond(s, negKey(f.id, id), offer)!;
      if (n.status !== 'open') break;
      const c = n.history.at(-1)!;
      offer = c.fee > 0 ? { fee: c.fee, backend: c.backend, billing: c.billing, options: c.options } : { ...offer, fee: offer.fee * 1.15 };
    }
  };
  if (!f.crew.director) { const d = pick('director', f.budget * 0.06 + 5e5); if (d) deal(d.id, 'director'); }
  while (f.cast.filter((c) => c.role === 'lead').length < f.leads) {
    const a = pick('actor', f.budget * 0.12 + 2e5); if (!a) break;
    const before = f.cast.length; deal(a.id, 'lead'); if (f.cast.length === before) break;
  }
  if (f.cast.filter((c) => c.role === 'support').length < f.supports) { const a = pick('actor', f.budget * 0.03 + 1e5); if (a) deal(a.id, 'support'); }
  if (!greenlightIssues(s, f).length && s.studio.cash > f.budget * 0.6) greenlight(s, f);
}

type Stats = { films: Film[]; bankrupt: boolean; sackedYear?: number; wars: number; years: number };
const results: Stats[] = [];
for (let g = 0; g < GAMES; g++) {
  let s = newGame({ difficulty: DIFF, crewMode: 'standard', startBudget: BUDGET, name: 'Bot Pictures', color: '#D4AF37', initials: 'BP', hq: 'LA', seed: `sim${g}` });
  let sackedYear: number | undefined;
  const t0 = Date.now();
  for (let t = 0; t < YEARS * 26 && !s.gameOver; t++) {
    botTurn(s);
    s = advanceTurn(s);
    if (process.argv.includes('--verbose') && s.t % 26 === 0) console.log(`  y${yearOf(s.t)} cash ${(s.studio.cash/1e6).toFixed(0)}M ledger`, JSON.stringify(Object.fromEntries(Object.entries(s.ledger[yearOf(s.t)-1]??{}).map(([k,v])=>[k,Math.round(v/1e6)]))));
    if (s.sacked) { sackedYear ??= yearOf(s.t) - 2025; acceptJob(s, s.sacked.offers[0].id); }
  }
  const mine = s.films.filter((f) => f.studioId === s.studio.id || f.studioId === 'player');
  if (process.argv.includes('--size')) for (const k of Object.keys(s) as (keyof GameState)[]) console.log('   ', k, (JSON.stringify(s[k]) ?? '').length >> 10, 'KB');
  results.push({ films: s.films, bankrupt: !!s.gameOver, sackedYear, wars: s.stats.biddingWars, years: yearOf(s.t) - 2026 });
  const done = mine.filter((f) => f.stage === 'library' && f.release?.type === 'theatrical');
  console.log(`game ${g}: ${((Date.now() - t0) / 1000).toFixed(1)}s, cash $${(s.studio.cash / 1e6).toFixed(0)}M, films ${done.length}, gameOver=${!!s.gameOver}, sacked=${sackedYear ?? '-'}, wars=${s.stats.biddingWars}, bailout=${s.bailoutUsed}, board=${s.board?.confidence.toFixed(0) ?? '-'}, saveKB=${(JSON.stringify(s).length / 1024).toFixed(0)}`);
}

// ---------- Report ----------
const all = results.flatMap((r) => r.films).filter((f) => f.stage === 'library' && f.release?.type === 'theatrical');
const byTier = new Map<string, Film[]>();
for (const f of all) byTier.set(f.tier, [...(byTier.get(f.tier) ?? []), f]);
console.log('\nTheatrical films (all studios) by tier:');
for (const tier of ['Micro', 'Low', 'Mid', 'High', 'Tentpole']) {
  const fs = byTier.get(tier) ?? [];
  if (!fs.length) continue;
  const mult = fs.map((f) => f.gross / f.budget).sort((a, b) => a - b);
  const losers = fs.filter((f) => filmProfit(f) < 0).length;
  const med = mult[Math.floor(mult.length / 2)];
  const grosses = fs.map((f) => f.gross).sort((a, b) => a - b);
  console.log(`  ${tier.padEnd(9)} n=${String(fs.length).padStart(4)}  median gross/budget ${med.toFixed(2)}×  avg ${(mult.reduce((a, b) => a + b, 0) / mult.length).toFixed(2)}×  lose money ${(losers / fs.length * 100).toFixed(0)}%  max $${(grosses.at(-1)! / 1e6).toFixed(0)}M  min $${(grosses[0] / 1e6).toFixed(1)}M  p90 $${(grosses[Math.floor(grosses.length * 0.9)] / 1e6).toFixed(0)}M`);
}
const billion = all.filter((f) => f.gross > 1e9).length;
const worstLoss = Math.min(...all.map(filmProfit));
console.log(`\n$1B+ films: ${billion}; worst loss $${(worstLoss / 1e6).toFixed(0)}M; overall lose-money ${(all.filter((f) => filmProfit(f) < 0).length / all.length * 100).toFixed(0)}%`);
const qual = all.map((f) => f.quality).sort((a, b) => a - b);
console.log(`quality p10 ${qual[Math.floor(qual.length * 0.1)]} median ${qual[Math.floor(qual.length / 2)]} p90 ${qual[Math.floor(qual.length * 0.9)]}`);
console.log(`bankrupt: ${results.filter((r) => r.bankrupt).length}/${GAMES}; sacked by year 3: ${results.filter((r) => r.sackedYear && r.sackedYear <= 3).length}/${GAMES}; bidding wars/yr: ${(results.reduce((a, r) => a + r.wars, 0) / results.reduce((a, r) => a + Math.max(1, r.years), 0)).toFixed(1)}`);
void tierInfo;
