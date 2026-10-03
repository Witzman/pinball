import type { RulesState } from "./types";

/** mulberry32 on `state.rng`: integer arithmetic only, returns a number in [0, 1). */
export function nextRandom(s: RulesState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
