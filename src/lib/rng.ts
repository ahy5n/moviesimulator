import seedrandom from 'seedrandom';

export type RNG = {
  (): number;
  int(min: number, max: number): number;
  range(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  normal(mean?: number, sd?: number): number;
  weighted<T>(items: readonly T[], weight: (x: T) => number): T;
  shuffle<T>(arr: T[]): T[];
};

/** Deterministic RNG: the same seed + tag always gives the same stream, so a save + seed reproduces results. */
export function makeRng(...parts: (string | number)[]): RNG {
  const r = seedrandom(parts.join(':')) as unknown as () => number;
  const rng = (() => r()) as RNG;
  rng.int = (min, max) => Math.floor(r() * (max - min + 1)) + min;
  rng.range = (min, max) => r() * (max - min) + min;
  rng.pick = (arr) => arr[Math.floor(r() * arr.length)];
  rng.chance = (p) => r() < p;
  rng.normal = (mean = 0, sd = 1) => {
    const u = Math.max(1e-9, r());
    const v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  rng.weighted = (items, weight) => {
    const ws = items.map(weight);
    const total = ws.reduce((a, b) => a + Math.max(0, b), 0);
    let x = r() * total;
    for (let i = 0; i < items.length; i++) {
      x -= Math.max(0, ws[i]);
      if (x <= 0) return items[i];
    }
    return items[items.length - 1];
  };
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return rng;
}

export const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
