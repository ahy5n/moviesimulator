// Browser saves: IndexedDB via idb-keyval, falling back to localStorage.
import { get, set, del } from 'idb-keyval';
import type { GameState } from '@/lib/types';

export const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'] as const;
export type SlotMeta = { slot: string; studioName: string; t: number; savedAt: number; difficulty: string; cash: number; color: string; initials: string };

const KEY = (slot: string) => `shs:save:${slot}`;
const META = 'shs:meta';

async function idbOk(): Promise<boolean> {
  try { await set('shs:probe', 1); return true; } catch { return false; }
}
let useIdb: boolean | null = null;
async function backend() { if (useIdb === null) useIdb = typeof indexedDB !== 'undefined' && (await idbOk()); return useIdb; }

async function rawGet<T>(k: string): Promise<T | undefined> {
  if (await backend()) return get<T>(k);
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : undefined; } catch { return undefined; }
}
async function rawSet(k: string, v: unknown) {
  if (await backend()) return set(k, v);
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}
async function rawDel(k: string) {
  if (await backend()) return del(k);
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}

export async function listSaves(): Promise<SlotMeta[]> {
  return (await rawGet<SlotMeta[]>(META)) ?? [];
}

export async function saveGame(s: GameState) {
  await rawSet(KEY(s.slot), s);
  const meta = (await listSaves()).filter((m) => m.slot !== s.slot);
  meta.push({ slot: s.slot, studioName: s.studio.name, t: s.t, savedAt: Date.now(), difficulty: s.settings.difficulty, cash: s.studio.cash, color: s.studio.color, initials: s.studio.initials });
  await rawSet(META, meta);
}

export const loadGame = (slot: string) => rawGet<GameState>(KEY(slot));

export async function deleteSave(slot: string) {
  await rawDel(KEY(slot));
  await rawSet(META, (await listSaves()).filter((m) => m.slot !== slot));
}

export async function freeSlot(): Promise<string> {
  const used = new Set((await listSaves()).map((m) => m.slot));
  return SLOTS.find((s) => !used.has(s)) ?? 'slot1';
}

export const LAST_SLOT = 'shs:last';
