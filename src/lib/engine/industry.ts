// The industry moves around you: rival studios change bosses, hit trouble, sell their libraries and merge.
// Bosses are fictional people.
import { formatDate } from '../calendar';
import { fictionalName } from '../names';
import { makeRng, clamp } from '../rng';
import { GENRES, type GameState, type Studio } from '../types';
import { openLibrarySale } from './rights';
import { headline, msg } from './util';

const STYLES = [
  { label: 'a blockbuster showman', risk: 0.15, prestige: -0.1, aggression: 0.15, slate: 2 },
  { label: 'a prestige-first auteur champion', risk: 0.05, prestige: 0.2, aggression: -0.05, slate: -1 },
  { label: 'a cost-cutting operator', risk: -0.15, prestige: -0.05, aggression: -0.1, slate: -2 },
  { label: 'a streaming evangelist', risk: 0.05, prestige: 0, aggression: 0.05, slate: 0, streaming: 0.25 },
  { label: 'a talent-poaching dealmaker', risk: 0.05, prestige: 0, aggression: 0.25, slate: 1 },
];

export function newBoss(s: GameState, st: Studio, r: ReturnType<typeof makeRng>) {
  const p = st.personality;
  if (!p) return;
  const { name } = fictionalName(r, r.chance(0.45) ? 'F' : 'M', new Set());
  const style = r.pick(STYLES);
  p.risk = clamp(p.risk + style.risk, 0.05, 0.95);
  p.prestige = clamp(p.prestige + style.prestige, 0.05, 0.95);
  p.aggression = clamp(p.aggression + style.aggression, 0.05, 0.95);
  p.slate = clamp(p.slate + style.slate, 3, 24);
  if (style.streaming && st.rivalSubs) p.streamingFirst = clamp(p.streamingFirst + style.streaming, 0, 0.9);
  const g = r.pick(GENRES);
  p.genres[g] = clamp((p.genres[g] ?? 0.5) + 0.6, 0.2, 2);
  st.boss = name;
  st.bossSince = s.t;
  msg(s, 'rival', `${st.name} names ${name} as studio chief`, `The new boss is ${style.label}. Expect more ${g.toLowerCase()} from them.`, { link: '/rivals', read: false });
  headline(`New boss at ${st.name}: ${name}`);
}

/** One rival swallows another: films, shows, franchises, deals and subscribers all move over. */
function merge(s: GameState, buyer: Studio, target: Studio) {
  for (const f of s.films) if (f.studioId === target.id) f.studioId = buyer.id;
  for (const x of s.series ?? []) if (x.studioId === target.id) x.studioId = buyer.id;
  for (const fr of s.franchises) if (fr.studioId === target.id) fr.studioId = buyer.id;
  for (const d of s.deals ?? []) if (d.studioId === target.id) d.studioId = buyer.id;
  for (const c of Object.values(s.commitments)) if (c.studioId === target.id) c.studioId = buyer.id;
  for (const ip of s.ips) if (ip.owner === target.id) ip.owner = buyer.id;
  for (const c of s.ceremonies) for (const k of c.categories) for (const n of k.nominees) if (n.studioId === target.id) n.studioId = buyer.id;
  for (const a of s.acquisitions ?? []) if (a.leader === target.id) a.leader = buyer.id;
  if (target.rivalSubs) {
    if (buyer.rivalSubs) buyer.rivalSubs += target.rivalSubs * 0.8;
    else { buyer.rivalSubs = target.rivalSubs; buyer.streamName = target.streamName; }
  }
  buyer.cash += target.cash * 0.5;
  buyer.prestige = clamp(Math.max(buyer.prestige, target.prestige) + 1);
  if (buyer.personality && target.personality) buyer.personality.slate = clamp(buyer.personality.slate + Math.round(target.personality.slate * 0.4), 3, 30);
  s.rivals = s.rivals.filter((x) => x.id !== target.id);
  s.librarySales = (s.librarySales ?? []).filter((x) => x.studioId !== target.id);
  msg(s, 'rival', `${buyer.name} to acquire ${target.name}`, `The deal folds ${target.name}'s films, shows and franchises into ${buyer.name}. One fewer studio bidding for talent.`, { link: '/rivals', read: false });
  headline(`${buyer.name} buys ${target.name}`);
}

export function advanceIndustry(s: GameState) {
  if (s.t < 26) return;
  const r = makeRng(s.seed, s.t, 'industry');
  for (const st of s.rivals) {
    if (!st.personality) continue;
    // Roughly one boss change per studio every 25 years, so a couple a decade across the industry.
    if (r.chance(0.0015) && (st.bossSince ?? -99) < s.t - 52) newBoss(s, st, r);
    // Trouble: a bad run forces a studio to sell its library.
    if ((st.distressUntil ?? -1) <= s.t && r.chance(0.0013)) {
      st.distressUntil = s.t + 26;
      msg(s, 'rival', `${st.name} in trouble`, `Heavy losses and a falling share price. Their films and franchises are cheaper to buy until ${formatDate(st.distressUntil)}.`, { link: '/rights', read: false });
      headline(`${st.name} posts heavy losses`);
      openLibrarySale(s, st);
    }
  }
  // Mergers are rare and keep at least eight rivals in the game.
  if (s.rivals.length > 8 && r.chance(0.006)) {
    const big = s.rivals.filter((x) => (x.personality?.slate ?? 0) >= 12);
    const buyer = big.length ? r.pick(big) : undefined;
    const targets = s.rivals.filter((x) => x !== buyer && (x.personality?.slate ?? 0) < 14).sort((a, b) => ((b.distressUntil ?? -1) > s.t ? 1 : 0) - ((a.distressUntil ?? -1) > s.t ? 1 : 0));
    const target = targets[0] && ((targets[0].distressUntil ?? -1) > s.t ? targets[0] : r.pick(targets));
    if (buyer && target) merge(s, buyer, target);
  }
}
