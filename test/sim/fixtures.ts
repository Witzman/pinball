import { demoTable } from "../../src/tables/demo";
import type { Replay } from "../../src/sim/replay";
import type { TableRules } from "../../src/rules";
import type { TableDef } from "../../src/table/schema";

/** The demo table with a sinkhole in the plunger lane, right in the path of a launched ball, and a magnet. */
export const saucerTable: TableDef = {
  ...structuredClone(demoTable),
  id: "saucer-demo",
  triggers: [{ id: "saucer", at: [499, 700], r: 8, switch: "saucer_sw", hold: { kickDeg: -90, kickSpeed: 2 } }],
  magnets: [{ id: "pull", at: [250, 600], r: 60, strength: 8 }],
};

/** Locks the ball the sinkhole captures, lets it go 300 ticks later, and rolls a random number for the record. */
export const saucerRules: TableRules = {
  modes: {},
  onSwitch(c, e) {
    if (e.kind === "capture") {
      c.ball.lock("saucer");
      c.after("free", 300);
      c.add("roll", Math.floor(c.rnd() * 1000000));
    }
  },
  onTimer: (c) => c.ball.release("saucer"),
  onDrain: (c) => c.ball.feed(),
};

/** Plunge, and let the rules do the rest. */
export function saucerReplay(seed: number): Replay {
  return {
    header: { format: 1, tableId: "saucer-demo", dt: 0.001, seed, ticks: 4000 },
    inputs: [{ tick: 300, action: "plunge_down" }, { tick: 700, action: "plunge_up" }],
  };
}
