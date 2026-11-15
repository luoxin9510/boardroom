/** Seeded random numbers (mulberry32). The seed lives in game state so a game replays exactly. */
export interface RngState {
  rng: number;
}

/** Advances the state's seed and returns a float in [0, 1). */
export function rngNext(state: RngState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** An integer in [1, sides]. */
export function rollDie(state: RngState, sides = 6): number {
  return 1 + Math.floor(rngNext(state) * sides);
}

/** A new array in random order (Fisher–Yates). */
export function shuffle<T>(state: RngState, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext(state) * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** A seed for a new game; never 0 (mulberry32 works with 0, but 0 reads like "unset"). */
export function newSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
