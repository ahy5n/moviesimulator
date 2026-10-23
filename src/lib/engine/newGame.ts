import { RIVAL_STUDIOS } from '@/data/studios';
import { START_CASH } from '../constants';
import { makeRng, clamp } from '../rng';
import { GENRES, type GameSettings, type GameState, type Genre } from '../types';
import { newBoard, setBoardTargets } from './finance';
import { seedRivals } from './rivals';
import { refreshIPs, refreshMarketplace } from './scripts';
import { msg } from './util';

export type NewGameOptions = GameSettings & {
  name: string; color: string; initials: string; hq: string; seed?: string; slot?: string;
};

export function newGame(o: NewGameOptions): GameState {
  const seed = o.seed || Math.random().toString(36).slice(2, 10);
  const r = makeRng(seed, 'init');
  const heat = {} as Record<Genre, number>;
  for (const g of GENRES) heat[g] = clamp(r.normal(1, 0.12), 0.7, 1.3);
  heat.Superhero = clamp(heat.Superhero - 0.12, 0.6, 1.4); // superhero fatigue, 2026 edition
  heat.Horror = clamp(heat.Horror + 0.1, 0.6, 1.4);

  const s: GameState = {
    version: 1, seed, slot: o.slot ?? 'slot1', createdAt: Date.now(), savedAt: Date.now(), t: 0,
    settings: { difficulty: o.difficulty, crewMode: o.crewMode, startBudget: o.startBudget },
    studio: { id: 'player', name: o.name || 'Untitled Pictures', color: o.color, initials: o.initials || 'UP', hq: o.hq, cash: START_CASH[o.startBudget], prestige: o.startBudget === 'indie' ? 40 : o.startBudget === 'minimajor' ? 45 : 55, isPlayer: true },
    rivals: RIVAL_STUDIOS.map((c) => ({
      id: c.id, name: c.name, color: c.color, initials: c.initials, hq: c.hq, cash: c.cash, prestige: c.prestige, isPlayer: false,
      personality: c.personality, rivalSubs: c.startSubs, streamName: c.streamName,
    })),
    films: [], scripts: [], ips: [], franchises: [], talentOverrides: {}, newTalent: [], commitments: {}, negotiations: {},
    genreHeat: heat, loans: [], inbox: [], ceremonies: [], festivalEntries: [], history: [], ledger: {},
    bailoutUsed: false, jobHistory: [{ studioName: o.name, fromT: 0 }], producer: { reputation: 0 }, idCounter: 1, stats: { biddingWars: 0, sacked: 0 },
  };
  if (o.difficulty === 'hard') s.board = newBoard(s);
  seedRivals(s);
  refreshMarketplace(s);
  refreshIPs(s);
  msg(s, 'news', `Welcome to ${s.studio.name}`, [
    'It is January 2026 and you are the new head of the studio.',
    '1. Buy a script from the Script Marketplace (or develop your own).',
    '2. Hire a director and cast your leads from the Talent Database.',
    '3. Greenlight, shoot, and release it in the best window you can find.',
    'Advance the calendar a fortnight at a time. Good luck.',
  ].join('\n'), { link: '/scripts' });
  if (s.board) setBoardTargets(s);
  return s;
}
