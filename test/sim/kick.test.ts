import { describe, expect, it } from "vitest";
import { advance, createGame, takeCommands, tick } from "../../src/sim/game";
import type { TableRules } from "../../src/rules";
import type { TableDef } from "../../src/table/schema";
import { runReplay } from "../../src/sim/replay";
import { demoTable } from "../../src/tables/demo";

// the demo table with a sling across the middle of the playfield: a rubber wall that kicks and has a switch
const slingTable: TableDef = {
  ...structuredClone(demoTable),
  id: "sling-test",
  walls: [...demoTable.walls, { type: "segment", a: [150, 600], b: [330, 600], material: "rubber", switch: "sling", kick: { speed: 1.6, minHit: 0.4, cooldownMs: 40 } }],
};

function play() {
  const events: { kind: string; impulse: number }[] = [];
  const rules: TableRules = { modes: {}, onSwitch: (_c, e) => void events.push({ kind: e.kind, impulse: e.impulse }) };
  const g = createGame(slingTable, { rules });
  return { g, events };
}

describe("a kicker in a game", () => {
  it("gives the rules a switch event of kind kick, with an impulse, when a ball hits the sling hard", () => {
    const { g, events } = play();
    Object.assign(g.table.world.balls[0]!, { x: 0.24, y: 0.5, vx: 0, vy: 1.2 }); // dropped on it from above, fast
    for (let i = 0; i < 100; i++) tick(g);
    expect(events.map((e) => e.kind)).toEqual(["kick"]);
    expect(events[0]!.impulse).toBeGreaterThan(0);
    expect(g.table.world.balls[0]!.vy).toBeLessThan(-1); // pushed back up the table
  });

  it("gives an ordinary hit for a ball that only rolls onto it", () => {
    const { g, events } = play();
    Object.assign(g.table.world.balls[0]!, { x: 0.24, y: 0.58 - 0.0135 - 0.001, vx: 0, vy: 0.05 }); // just above the sling, barely moving (gravity does the rest)
    for (let i = 0; i < 60; i++) tick(g);
    expect(events.every((e) => e.kind === "hit")).toBe(true);
  });

  it("replays the same: two runs of the same inputs give the same physics and rules hashes", () => {
    const run = () => runReplay({ header: { format: 1, tableId: "sling-test", dt: 0.001, seed: 3, ticks: 4000 }, inputs: [{ tick: 100, action: "plunge_down" }, { tick: 600, action: "plunge_up" }] }, [slingTable]);
    const a = run();
    const b = run();
    expect(a.hash).toBe(b.hash);
    expect(a.rulesHash).toBe(b.rulesHash);
  });

  it("has one cooldown counter in the world for each kicker", () => {
    const { g } = play();
    Object.assign(g.table.world.balls[0]!, { x: 0.24, y: 0.5, vx: 0, vy: 1.2 });
    advance(g, 20);
    takeCommands(g);
    expect(g.table.world.kickWait.length).toBe(1);
  });
});
