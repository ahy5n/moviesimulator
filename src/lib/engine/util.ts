import { yearOf } from '../calendar';
import type { Film, GameState, Message, MessageKind, Studio } from '../types';

export const nextId = (s: GameState, prefix: string) => `${prefix}${(s.idCounter++).toString(36)}`;

export function msg(s: GameState, kind: MessageKind, title: string, body: string, extra: Partial<Message> = {}) {
  // Routine rival chatter arrives pre-read so the unread badge means something.
  s.inbox.unshift({ id: nextId(s, 'm'), t: s.t, kind, title, body, read: kind === 'rival', ...extra });
  if (s.inbox.length > 300) s.inbox.length = 300;
}

/** Per-turn money tracker for the player's studio. */
export type Tally = { income: Record<string, number>; expenses: Record<string, number>; headlines: string[] };
export const newTally = (): Tally => ({ income: {}, expenses: {}, headlines: [] });

let TALLY: Tally | null = null;
export const setTally = (t: Tally | null) => { TALLY = t; };

/** Move money for any studio; player flows are also booked to the ledger and the turn tally. */
export function pay(s: GameState, studioId: string, amount: number, category: string) {
  const st = studioById(s, studioId);
  if (!st || !amount) return;
  st.cash += amount;
  if (!st.isPlayer) return;
  const y = yearOf(s.t);
  const L = (s.ledger[y] ??= {});
  L[category] = (L[category] ?? 0) + amount;
  if (TALLY) {
    const bucket = amount > 0 ? TALLY.income : TALLY.expenses;
    bucket[category] = (bucket[category] ?? 0) + Math.abs(amount);
  }
}

export const headline = (text: string) => { TALLY?.headlines.push(text); };

export function studioById(s: GameState, id: string): Studio | undefined {
  return s.studio.id === id ? s.studio : s.rivals.find((r) => r.id === id);
}
export const allStudios = (s: GameState) => [s.studio, ...s.rivals];
export const filmById = (s: GameState, id: string) => s.films.find((f) => f.id === id);
export const playerFilms = (s: GameState) => s.films.filter((f) => f.studioId === s.studio.id);

export function totalCost(f: Film): number {
  const castFees = f.cast.reduce((a, c) => a + c.fee, 0);
  const crewFees = Object.values(f.crew).reduce((a, c) => a + (c?.fee ?? 0), 0);
  return f.budget * (1 + (f.overrun ?? 0)) + f.marketing + castFees + crewFees;
}
export const filmRevenue = (f: Film) => f.studioRevenue + f.otherRevenue + (f.salePrice ?? 0) - f.backendPaid;
export const filmProfit = (f: Film) => filmRevenue(f) - f.spent;

/** Charge a film's studio and record it against the film. */
export function spend(s: GameState, f: Film, amount: number, category: string) {
  if (amount <= 0) return;
  f.spent += amount;
  pay(s, f.studioId, -amount, category);
}

export const isReleased = (f: Film) => f.stage === 'released' || f.stage === 'library';
