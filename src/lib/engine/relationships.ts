// Talent relationships: people who work together well become friends (and a director's regulars);
// people who clash won't share a set again. Clashes only ever involve fictional people.
import { makeRng, clamp } from '../rng';
import { pairKey, talent } from '../talentDb';
import type { Film, GameState, Talent } from '../types';
import { headline, msg } from './util';

export const FRIENDS_AT = 3;
export const FEUD_AT = -4;

export const relation = (s: GameState, a: string, b: string) => s.relations?.[pairKey(a, b)] ?? 0;

export function addRelation(s: GameState, a: string, b: string, d: number) {
  if (a === b || !d) return;
  const k = pairKey(a, b);
  const v = clamp((s.relations?.[k] ?? 0) + d, -10, 10);
  if (Math.abs(v) < 0.25) { if (s.relations) delete s.relations[k]; return; }
  (s.relations ??= {})[k] = Math.round(v * 100) / 100;
}

export const filmPeople = (f: Film) => [...f.cast.map((c) => c.talentId), ...(f.crew.director ? [f.crew.director.talentId] : [])];

/** After a release: hits bond everyone; flops sour things, but only between fictional people. */
export function relationsOnResult(s: GameState, f: Film) {
  // Rival films only bond their leads and director on a hit, to keep saves small.
  const mine = f.studioId === s.studio.id;
  const ids = mine ? filmPeople(f) : [...f.cast.filter((c) => c.role === 'lead').map((c) => c.talentId), ...(f.crew.director ? [f.crew.director.talentId] : [])];
  const ratio = f.gross / Math.max(1, f.spent);
  const good = ratio > 2.5 || (f.critic ?? 0) >= 80;
  const bad = ratio < 0.8 && (f.critic ?? 50) < 50;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (good) addRelation(s, ids[i], ids[j], 1.5);
    else if (!mine) continue;
    else if (bad) { if (talent(s, ids[i])?.isFictional && talent(s, ids[j])?.isFictional) addRelation(s, ids[i], ids[j], -0.75); }
    else addRelation(s, ids[i], ids[j], 0.5);
  }
}

/** On-set friendships (anyone) and clashes (fictional people only). */
export function relationshipEvents(s: GameState) {
  for (const f of s.films) {
    if (f.stage !== 'filming') continue;
    const r = makeRng(s.seed, s.t, 'rel', f.id);
    if (!r.chance(0.05)) continue;
    const ids = filmPeople(f);
    if (ids.length < 2) continue;
    const a = r.pick(ids);
    const b = r.pick(ids.filter((x) => x !== a));
    const ta = talent(s, a), tb = talent(s, b);
    if (!ta || !tb) continue;
    const mine = f.studioId === s.studio.id;
    if (ta.isFictional && tb.isFictional && r.chance(0.4)) {
      addRelation(s, a, b, -4);
      f.luck = clamp(f.luck - 0.02, 0.8, 1.2);
      if (mine) { msg(s, 'event', `Tension on the ${f.title} set`, `${ta.name} and ${tb.name} aren't speaking. They won't want to work together again.`, { link: `/film/${f.id}` }); headline(`${ta.name} and ${tb.name} clash on set`); }
    } else {
      addRelation(s, a, b, 2);
      f.luck = clamp(f.luck + 0.01, 0.8, 1.2);
      if (mine) msg(s, 'event', `${ta.name} and ${tb.name} hit it off`, `The ${f.title} set has a new friendship. Expect them to want to work together again.`, { link: `/film/${f.id}`, read: true });
    }
  }
}

/** Someone on this film that the person refuses to work with. */
export function feudWith(s: GameState, t: Talent, f: Film): Talent | undefined {
  for (const id of filmPeople(f)) if (id !== t.id && relation(s, t.id, id) <= FEUD_AT) return talent(s, id);
  return undefined;
}

/** Discount and appeal when the director (or a co-star) is a friend. */
export function friendBonus(s: GameState, t: Talent, f: Film): number {
  let best = 0;
  for (const id of filmPeople(f)) if (id !== t.id) best = Math.max(best, relation(s, t.id, id));
  return best >= FRIENDS_AT ? 0.1 : 0;
}

export function relationsOf(s: GameState, id: string): { other: Talent; v: number }[] {
  const out: { other: Talent; v: number }[] = [];
  for (const [k, v] of Object.entries(s.relations ?? {})) {
    const [a, b] = k.split('|');
    if (a !== id && b !== id) continue;
    const other = talent(s, a === id ? b : a);
    if (other) out.push({ other, v });
  }
  return out.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
}
