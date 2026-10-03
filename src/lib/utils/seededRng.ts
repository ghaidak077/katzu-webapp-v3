/**
 * Dependency-free reproducible RNG + string hash.
 *
 * Shared by the grammar exercises (`src/lib/grammar/exercises.ts`) and the quiz
 * generator (`src/lib/utils/quizGenerator.ts`). It lives in its own module with
 * NO imports on purpose: the read-only content audits under `scripts/` load
 * these files directly with plain Node (type-stripping), where the app's `@/…`
 * path alias does not resolve — so anything a Node-run script imports must be
 * alias-free all the way down.
 */

/** Reproducible RNG (mulberry32) — same seed = same sequence. */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic string hash (FNV-1a) used to seed the RNG from an id. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
