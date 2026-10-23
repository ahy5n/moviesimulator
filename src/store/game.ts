'use client';
import { create } from 'zustand';
import { loadDBBrowser, hasDB } from '@/lib/talentDb';
import type { GameState } from '@/lib/types';
import { newGame, type NewGameOptions } from '@/lib/engine/newGame';
import { advanceTurn } from '@/lib/engine/turn';
import { LAST_SLOT, loadGame, saveGame } from './saves';

type Store = {
  state: GameState | null;
  dbReady: boolean; dbProgress: number; dbSource?: 'tmdb' | 'demo';
  showSummary: boolean; busy: boolean;
  ensureDB: () => Promise<void>;
  start: (o: NewGameOptions) => Promise<void>;
  load: (slot: string) => Promise<boolean>;
  /** Apply a mutation to a copy of the state, then autosave. Returns the mutator's result. */
  act: <T>(fn: (s: GameState) => T) => T | undefined;
  advance: () => Promise<void>;
  closeSummary: () => void;
  quit: () => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function queueSave(s: GameState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveGame(s).catch(console.error); }, 400);
}

export const useGame = create<Store>((set, get) => ({
  state: null, dbReady: hasDB(), dbProgress: 0, showSummary: false, busy: false,
  ensureDB: async () => {
    if (get().dbReady) return;
    const db = await loadDBBrowser((p) => set({ dbProgress: p }));
    set({ dbReady: true, dbSource: db.source });
  },
  start: async (o) => {
    await get().ensureDB();
    const s = newGame(o);
    set({ state: s, showSummary: false });
    await saveGame(s);
    try { localStorage.setItem(LAST_SLOT, s.slot); } catch { /* ignore */ }
  },
  load: async (slot) => {
    await get().ensureDB();
    const s = await loadGame(slot);
    if (!s) return false;
    set({ state: s, showSummary: false });
    try { localStorage.setItem(LAST_SLOT, slot); } catch { /* ignore */ }
    return true;
  },
  act: (fn) => {
    const cur = get().state;
    if (!cur) return undefined;
    const next = structuredClone(cur);
    const out = fn(next);
    set({ state: next });
    queueSave(next);
    return out;
  },
  advance: async () => {
    const cur = get().state;
    if (!cur || get().busy) return;
    set({ busy: true });
    await new Promise((r) => setTimeout(r, 30));
    const next = advanceTurn(cur);
    set({ state: next, busy: false, showSummary: true });
    await saveGame(next);
  },
  closeSummary: () => set({ showSummary: false }),
  quit: () => set({ state: null }),
}));
