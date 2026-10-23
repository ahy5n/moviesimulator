// Overheads, loans, bankruptcy, the board of directors and getting sacked.
import { RIVAL_STUDIOS } from '@/data/studios';
import { yearOf } from '../calendar';
import { HQS, START_CASH } from '../constants';
import { makeRng, clamp } from '../rng';
import type { Board, BoardTarget, GameState, JobOffer, Studio } from '../types';
import { allStudios, filmProfit, msg, nextId, pay, headline } from './util';

const ACTIVE = new Set(['development', 'preproduction', 'filming', 'post', 'ready']);

export function overheadPerTurn(s: GameState): number {
  if (s.settings.difficulty === 'easy') return 0;
  const base = s.settings.startBudget === 'indie' ? 0.15e6 : s.settings.startBudget === 'minimajor' ? 0.9e6 : 3e6;
  const projects = s.films.filter((f) => f.studioId === s.studio.id && ACTIVE.has(f.stage)).length;
  return base + projects * 0.12e6;
}

export function maxDebt(s: GameState): number {
  const y = yearOf(s.t);
  const rev = Object.entries(s.ledger[y - 1] ?? s.ledger[y] ?? {}).reduce((a, [, v]) => a + Math.max(0, v), 0);
  return Math.max(START_CASH[s.settings.startBudget] * 0.6, rev * 0.8);
}
export const debt = (s: GameState) => s.loans.reduce((a, l) => a + l.balance, 0);

export function loanRate(s: GameState): number {
  const ratio = debt(s) / Math.max(1, maxDebt(s));
  return 0.06 + ratio * 0.06 + (s.studio.cash < 0 ? 0.04 : 0);
}

export function takeLoan(s: GameState, amount: number, turns: number): string | null {
  if (s.settings.difficulty !== 'hard') return 'Loans are a Hard mode feature.';
  if (amount <= 0) return 'Pick an amount.';
  if (debt(s) + amount > maxDebt(s)) return 'The banks will not lend you that much.';
  const rate = loanRate(s);
  const i = rate / 26;
  const payment = amount * i / (1 - Math.pow(1 + i, -turns));
  s.loans.push({ id: nextId(s, 'l'), principal: amount, balance: amount, rate, payment, turnsLeft: turns });
  pay(s, s.studio.id, amount, 'Loans');
  return null;
}

export function repayLoan(s: GameState, id: string) {
  const l = s.loans.find((x) => x.id === id);
  if (!l || s.studio.cash < l.balance) return;
  pay(s, s.studio.id, -l.balance, 'Loan repayments');
  s.loans = s.loans.filter((x) => x.id !== id);
}

export function advanceFinance(s: GameState) {
  const oh = overheadPerTurn(s);
  if (oh) pay(s, s.studio.id, -oh, 'Overheads');
  for (const l of s.loans) {
    const interest = l.balance * (l.rate / 26);
    l.balance = Math.max(0, l.balance + interest - l.payment);
    l.turnsLeft--;
    pay(s, s.studio.id, -l.payment, 'Loan repayments');
  }
  s.loans = s.loans.filter((l) => l.turnsLeft > 0 && l.balance > 1);
}

export function checkBankruptcy(s: GameState) {
  if (s.studio.cash >= 0 || s.gameOver) return;
  if (!s.bailoutUsed) {
    s.bailoutUsed = true;
    const amount = Math.max(-s.studio.cash + START_CASH[s.settings.startBudget] * 0.25, 10e6);
    pay(s, s.studio.id, amount, 'Bailout');
    msg(s, 'finance', 'One more chance', `Investors bail you out with ${Math.round(amount / 1e6)}M. Next time it is over.`, { link: '/finances' });
    headline('Emergency bailout keeps the lights on');
    if (s.board) s.board.confidence = clamp(s.board.confidence - 30);
    return;
  }
  s.gameOver = { reason: 'Your studio ran out of money. The receivers have changed the locks.', t: s.t };
}

// ---------- Board ----------

export function yearProfit(s: GameState, year: number): number {
  return Object.entries(s.ledger[year] ?? {}).filter(([k]) => k !== 'Loans' && k !== 'Bailout').reduce((a, [, v]) => a + v, 0);
}

export function marketShares(s: GameState, year: number): { studio: Studio; gross: number; share: number }[] {
  const totals = new Map<string, number>();
  for (const f of s.films) if (f.release && yearOf(f.release.t) === year) totals.set(f.studioId, (totals.get(f.studioId) ?? 0) + f.gross);
  const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  return allStudios(s).map((st) => ({ studio: st, gross: totals.get(st.id) ?? 0, share: (totals.get(st.id) ?? 0) / sum })).sort((a, b) => b.gross - a.gross);
}

export function setBoardTargets(s: GameState) {
  if (!s.board) return;
  const year = yearOf(s.t);
  const r = makeRng(s.seed, year, 'board');
  const scale = START_CASH[s.settings.startBudget];
  const prev = s.history.at(-1);
  const profitTarget = Math.round(Math.max(scale * 0.04, (prev?.profit ?? 0) * 0.8 + scale * 0.03) / 1e6) * 1e6;
  const options: BoardTarget[] = [
    { kind: 'profit', value: profitTarget, label: `Profit of $${Math.round(profitTarget / 1e6)}M` },
    { kind: 'hits', value: s.settings.startBudget === 'indie' ? 1 : 2, label: `At least ${s.settings.startBudget === 'indie' ? 1 : 2} hit${s.settings.startBudget === 'indie' ? '' : 's'} (2.5× return)` },
    { kind: 'marketShare', value: s.settings.startBudget === 'major' ? 5 : s.settings.startBudget === 'minimajor' ? 9 : 13, label: `Top ${s.settings.startBudget === 'major' ? 5 : s.settings.startBudget === 'minimajor' ? 9 : 13} in market share` },
  ];
  if (s.studio.prestige >= 50 || year > 2026) options.push({ kind: 'bpNoms', value: s.studio.prestige >= 65 ? 2 : 1, label: `At least ${s.studio.prestige >= 65 ? 2 : 1} Academy nomination${s.studio.prestige >= 65 ? 's' : ''}` });
  if (s.studio.streaming) {
    const v = Math.round(Math.max(1e6, s.studio.streaming.subscribers * 1.4) / 1e6) * 1e6;
    options.push({ kind: 'streamingSubs', value: v, label: `Grow streaming to ${v / 1e6}M subscribers` });
  }
  const targets = [options[0], ...r.shuffle(options.slice(1)).slice(0, 2)];
  s.board.targets = targets;
  s.board.year = year;
  msg(s, 'board', `Board targets for ${year}`, targets.map((t) => `• ${t.label}`).join('\n'), { link: '/board' });
}

export function evaluateTarget(s: GameState, t: BoardTarget, year: number): boolean {
  switch (t.kind) {
    case 'profit': return yearProfit(s, year) >= t.value;
    case 'hits': return s.films.filter((f) => f.studioId === s.studio.id && f.release && yearOf(f.release.t) === year && f.gross > 2.5 * f.spent && f.gross > 0).length >= t.value;
    case 'marketShare': return marketShares(s, year).findIndex((x) => x.studio.id === s.studio.id) < t.value;
    case 'bpNoms': {
      const noms = s.films.filter((f) => f.studioId === s.studio.id).flatMap((f) => f.awards).filter((a) => a.body === 'academy' && a.year === year - 1).length;
      return noms >= t.value;
    }
    case 'streamingSubs': return (s.studio.streaming?.subscribers ?? 0) >= t.value;
  }
}

export function boardYearEnd(s: GameState) {
  const b = s.board;
  if (!b) return;
  const year = b.year;
  let met = 0;
  for (const t of b.targets) {
    t.met = evaluateTarget(s, t, year);
    if (t.met) met++;
  }
  const delta = met * 9 - (b.targets.length - met) * 11 * boardSoftening(s);
  b.confidence = clamp(b.confidence + delta);
  addBoardLoyalty(s, met * BOARD_LOYALTY.target);
  b.history.push({ year, confidence: b.confidence, met, total: b.targets.length });
  msg(s, 'board', `Board review ${year}: ${met}/${b.targets.length} targets met`, `Confidence ${delta >= 0 ? 'rises' : 'falls'} to ${Math.round(b.confidence)}.`, { link: '/board' });
}

export function boardReact(s: GameState, delta: number, why: string) {
  if (!s.board) return;
  s.board.confidence = clamp(s.board.confidence + (delta < 0 ? delta * boardSoftening(s) : delta));
  if (Math.abs(delta) >= 4) msg(s, 'board', delta > 0 ? 'The board is pleased' : 'The board is concerned', why, { link: '/board' });
}

const NAME_A = ['Silver Reel', 'Harbourlight', 'Paper Moon', 'Northgate', 'Blue Lantern', 'Crescent', 'Ironwood', 'Golden Hour', 'Red Rock', 'Bright Lane', 'Kingfisher', 'Lowtide', 'Marigold', 'Ember Street', 'Foxglove', 'Twelve Oaks', 'Starling', 'Copperline'];
const NAME_B = ['Pictures', 'Films', 'Studios', 'Entertainment', 'Media', 'Productions'];
const OFFER_COLORS = ['#C0392B', '#2E86DE', '#16A085', '#8E44AD', '#E67E22', '#ECF0F1', '#E84393', '#7D8B5A'];
const tierFor = (cash: number): JobOffer['tier'] => (cash >= 1.2e9 ? 'major' : cash >= 2e8 ? 'minimajor' : 'indie');

/** Fired: only fictional studios at your level or below come calling. */
export function jobOffers(s: GameState): JobOffer[] {
  const r = makeRng(s.seed, s.t, 'sack');
  const level = START_CASH[s.settings.startBudget];
  const taken = new Set(allStudios(s).map((x) => x.name));
  const out: JobOffer[] = [];
  // Two sideways moves (a bit smaller than where you were) and one clear step down.
  const scales = [r.range(0.6, 0.95), r.range(0.4, 0.75), r.range(0.15, 0.35)];
  for (const scale of scales) {
    let name = '';
    const used = (n: string) => taken.has(n) || out.some((o) => o.name.split(' ')[0] === n.split(' ')[0]);
    for (let i = 0; i < 40 && (!name || used(name)); i++) name = `${r.pick(NAME_A)} ${r.pick(NAME_B)}`;
    taken.add(name);
    const cash = Math.round((level * scale) / 1e6) * 1e6;
    // A good reputation softens the fall: better-regarded studios still call.
    const rep = Math.min(8, (s.producer?.reputation ?? 0) * 0.5);
    const prestige = clamp(Math.round(s.studio.prestige - r.range(3, 14) - (scale < 0.4 ? 8 : 0) + rep), 15, 90);
    const hq = r.pick(HQS).id;
    out.push({
      id: `job${s.t}_${out.length}`, name, cash, prestige, hq, tier: tierFor(cash),
      color: r.pick(OFFER_COLORS), initials: name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
      pitch: scale < 0.4 ? 'A struggling outfit that needs a fresh start.' : scale < 0.7 ? 'A smaller studio looking for a steady hand.' : 'A rival at roughly your old level.',
    });
  }
  return out;
}

export function checkSacking(s: GameState) {
  if (!s.board || s.sacked || s.gameOver || s.board.confidence >= 20) return;
  if ((s.board.loyalty ?? 0) >= REPRIEVE_AT && !s.board.reprieveUsed) {
    s.board.reprieveUsed = true;
    s.board.loyalty = (s.board.loyalty ?? 0) - REPRIEVE_AT;
    s.board.confidence = 30;
    msg(s, 'board', 'Final warning', 'The board wanted you out, but your track record bought you one more chance. There will not be another.', { link: '/board' });
    return;
  }
  s.sacked = { t: s.t, offers: jobOffers(s) };
  s.stats.sacked++;
  msg(s, 'board', 'You have been fired', 'The board has lost confidence in your leadership. A few smaller studios are calling…', { link: '/board' });
}

/** Take a job at a (fictional) studio: it becomes yours, your old studio turns AI and stays in the world as a rival. */
export function acceptJob(s: GameState, offerId: string) {
  const offer = s.sacked?.offers.find((o) => o.id === offerId);
  if (!offer) return;
  const old = s.studio;
  old.isPlayer = false;
  old.id = old.id === 'player' ? `ex${s.t}` : old.id;
  for (const f of s.films) if (f.studioId === 'player') f.studioId = old.id;
  for (const fr of s.franchises) if (fr.studioId === 'player') fr.studioId = old.id;
  for (const c of Object.values(s.commitments)) if (c.studioId === 'player') c.studioId = old.id;
  for (const c of s.ceremonies) for (const k of c.categories) for (const n of k.nominees) if (n.studioId === 'player') n.studioId = old.id;
  for (const ip of s.ips) if (ip.owner === 'player') ip.owner = old.id;
  for (const [id, ov] of Object.entries(s.talentOverrides)) if (ov.loyalty?.player) {
    const { player, ...rest } = ov.loyalty;
    s.talentOverrides[id] = { ...ov, loyalty: { ...rest, [old.id]: (rest[old.id] ?? 0) + player } };
  }
  old.personality = { slate: 8, genres: {}, risk: 0.5, prestige: 0.5, budgetBias: ['Low', 'Mid', 'High'], streamingFirst: old.streaming ? 0.3 : 0, regions: {}, aggression: 0.5 };
  if (old.streaming) { old.rivalSubs = old.streaming.subscribers; old.streamName = old.streaming.name; old.streaming = undefined; }
  const next: Studio = { id: 'player', name: offer.name, color: offer.color, initials: offer.initials, hq: offer.hq, cash: offer.cash, prestige: offer.prestige, isPlayer: true };
  s.rivals = [...s.rivals, old];
  s.studio = next;
  s.settings.startBudget = offer.tier; // board targets, overheads and bailouts scale to the new studio
  s.loans = [];
  s.jobHistory.at(-1)!.toT = s.t;
  s.jobHistory.push({ studioName: next.name, fromT: s.t });
  s.negotiations = {};
  const rep = s.producer?.reputation ?? 0;
  s.board = { confidence: Math.min(75, 50 + rep * 1.5), year: yearOf(s.t), targets: [], history: s.board?.history ?? [], loyalty: Math.round(rep * 0.4 * 10) / 10 };
  s.sacked = undefined;
  setBoardTargets(s);
  msg(s, 'board', `Welcome to ${next.name}`, `You're the new studio head. ${offer.pitch} ${rep > 2 ? `Your reputation precedes you: the board starts at ${Math.round(s.board.confidence)} confidence.` : 'The board expects results.'}`, { link: '/hq' });
}

export function declineJobs(s: GameState) {
  s.gameOver = { reason: 'You walked away from Hollywood after being fired.', t: s.t };
}

export const rivalConfig = (id: string) => RIVAL_STUDIOS.find((r) => r.id === id);

export function newBoard(s: GameState): Board {
  return { confidence: 60, year: yearOf(s.t), targets: [], history: [], loyalty: 0 };
}

// ---------- Board loyalty & producer reputation ----------
// A board grows loyal to a producer who delivers; your reputation follows you to every studio.

export const BOARD_LOYALTY = { hit: 1, flop: -1, target: 1, nomination: 0.5, win: 1.5 };
export const REPRIEVE_AT = 6;

export function addBoardLoyalty(s: GameState, points: number) {
  if (!points) return;
  s.producer = { reputation: Math.max(0, (s.producer?.reputation ?? 0) + (points > 0 ? points : points / 2)) };
  if (s.board) s.board.loyalty = Math.max(0, (s.board.loyalty ?? 0) + points);
}

/** Bad news hits a loyal board less hard: up to half off. */
export const boardSoftening = (s: GameState) => 1 - Math.min(0.5, (s.board?.loyalty ?? 0) * 0.05);

export function boardLoyaltyLabel(points: number): string {
  if (points >= 10) return 'Firmly behind you';
  if (points >= REPRIEVE_AT) return 'Loyal';
  if (points >= 3) return 'Warming to you';
  if (points > 0) return 'Watching';
  return 'Unconvinced';
}

/** How a just-finished release lands with the board. */
export function boardOnResult(s: GameState, filmId: string) {
  const f = s.films.find((x) => x.id === filmId);
  if (!f || !s.board) return;
  const p = filmProfit(f);
  const scale = START_CASH[s.settings.startBudget];
  if (p > scale * 0.1) { boardReact(s, 3, `${f.title} made a healthy profit.`); addBoardLoyalty(s, BOARD_LOYALTY.hit); }
  else if (p < -scale * 0.08) { boardReact(s, -5, `${f.title} lost $${Math.round(-p / 1e6)}M.`); addBoardLoyalty(s, BOARD_LOYALTY.flop); }
}

