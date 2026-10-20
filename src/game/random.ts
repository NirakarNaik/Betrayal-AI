/**
 * Seeded pseudorandom number generator (mulberry32).
 *
 * The generator state is a single 32-bit integer stored in MatchState so that
 * every random outcome is reproducible from the seed and the recorded inputs.
 */

export interface Rng {
  state: number;
}

export function normalizeSeed(seed: number): number {
  // Force into unsigned 32-bit range; avoid a zero state.
  const s = Math.floor(Math.abs(seed)) >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

/** Returns a float in [0, 1) and advances the generator. */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, maxExclusive). */
export function nextInt(rng: Rng, maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("nextInt: maxExclusive must be positive");
  return Math.floor(nextFloat(rng) * maxExclusive);
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: empty array");
  return items[nextInt(rng, items.length)] as T;
}

/** Stable 32-bit string hash (FNV-1a) for deterministic tie-breaks. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return normalizeSeed(Math.floor(Math.random() * 0xffffffff));
}
