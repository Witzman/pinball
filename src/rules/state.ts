import type { RulesState } from "./types";

/** A fresh state at tick 0. `seed` is the replay header's seed. */
export function createState(seed: number): RulesState {
  return {
    v: 1,
    tick: 0,
    rng: seed >>> 0,
    lamps: {},
    counters: {},
    timers: {},
    shots: {},
    modes: {},
    balls: { inPlay: 0, locked: {}, toFeed: 0, saver: { until: 0 }, capacity: 1 },
    player: { score: 0, ballNo: 0, persist: {} },
  };
}
