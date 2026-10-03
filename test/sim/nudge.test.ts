import { describe, expect, it } from "vitest";
import { advance, createGame, nudge, tick } from "../../src/sim/game";
import { runReplay, validateReplay } from "../../src/sim/replay";
import type { Replay } from "../../src/sim/replay";
import { demoTable } from "../../src/tables/demo";

function steady() {
  const g = createGame(demoTable);
  g.table.world.gravity = 0;
  const b = g.table.world.balls[0]!;
  b.x = 0.3;
  b.y = 0.6;
  b.vx = 0;
  b.vy = 0;
  return { g, b };
}

describe("nudging the game", () => {
  it("shoves the ball the way it is asked: left +x, right -x, up +y (down the table), with the sizes of the design", () => {
    for (const [dir, vx, vy] of [["left", 0.25, 0], ["right", -0.25, 0], ["up", 0, 0.15]] as const) {
      const { g, b } = steady();
      expect(nudge(g, dir), dir).toBe(true);
      tick(g);
      expect([b.vx, b.vy], dir).toEqual([vx, vy]);
    }
  });

  it("applies it at the start of the next tick, not before, and only once", () => {
    const { g, b } = steady();
    nudge(g, "left");
    expect(b.vx).toBe(0);
    tick(g);
    expect(b.vx).toBe(0.25);
    expect(g.pendingNudge).toBeNull();
    tick(g);
    expect(b.vx).toBeLessThanOrEqual(0.25);
  });

  it("drops a nudge that comes inside the cooldown, and accepts one after it", () => {
    const { g, b } = steady();
    expect(nudge(g, "left")).toBe(true);
    tick(g);
    for (let i = 0; i < 100; i++) tick(g);
    expect(nudge(g, "left")).toBe(false); // 100 ticks later: still cooling
    for (let i = 0; i < 148; i++) tick(g);
    expect(nudge(g, "left")).toBe(false); // 249 ticks after the first
    tick(g);
    expect(nudge(g, "left")).toBe(true); // 250: allowed
    const before = b.vx;
    tick(g);
    expect(b.vx - before).toBeCloseTo(0.25, 9);
  });

  it("drops a second nudge asked for while the first is still waiting", () => {
    const { g } = steady();
    expect(nudge(g, "left")).toBe(true);
    expect(nudge(g, "right")).toBe(false);
    tick(g);
    expect(g.table.world.balls[0]!.vx).toBe(0.25);
  });

  it("starts no cooldown when no ball felt it", () => {
    const g = createGame(demoTable, { flow: { ballsPerGame: 3, startCost: 1, startCredits: 2, overTicks: 100, saverTicks: 0, bonusTicks: 5, extraBallMax: 0 } });
    expect(g.table.world.balls).toHaveLength(0);
    expect(nudge(g, "left")).toBe(true);
    tick(g);
    expect(g.events.some((e) => e.t === "nudge")).toBe(false);
    expect(nudge(g, "left")).toBe(true); // nothing to shove: no cooldown
  });

  it("tells the rules, once, in the tick it was applied, and ball-less ticks tell them nothing", () => {
    const { g } = steady();
    nudge(g, "up");
    tick(g);
    expect(g.events.filter((e) => e.t === "nudge")).toEqual([{ t: "nudge", tick: 1, dir: "up" }]);
    tick(g);
    expect(g.events.filter((e) => e.t === "nudge")).toEqual([]);
  });

  it("does not shove a ball held in a sinkhole", () => {
    const { g, b } = steady();
    b.hold = 1;
    nudge(g, "left");
    tick(g);
    expect(b.vx).toBe(0);
    expect(g.events.some((e) => e.t === "nudge")).toBe(false);
  });

  it("works through advance, as the live loop calls it", () => {
    const { g, b } = steady();
    nudge(g, "left");
    advance(g, 5);
    expect(b.vx).toBeGreaterThan(0.2);
  });
});

describe("nudges in a replay", () => {
  const base = (): Replay => ({ header: { format: 1, tableId: "demo", dt: 0.001, seed: 1, ticks: 3000 }, inputs: [{ tick: 300, action: "plunge_down" }, { tick: 700, action: "plunge_up" }] });
  const withNudges = (...n: [number, "nudge_left" | "nudge_right" | "nudge_up"][]): Replay => {
    const r = base();
    r.inputs.push(...n.map(([tick, action]) => ({ tick, action })));
    r.inputs.sort((a, b) => a.tick - b.tick);
    return r;
  };
  const play = (r: Replay) => runReplay(r, [demoTable]).hash;

  it("accepts the three nudge actions and refuses others", () => {
    expect(validateReplay(withNudges([1000, "nudge_left"], [1500, "nudge_right"], [2000, "nudge_up"]))).toEqual([]);
    const bad = withNudges([1000, "nudge_left"]);
    (bad.inputs[2] as { action: string }).action = "nudge_down";
    expect(validateReplay(bad).join()).toMatch(/"nudge_down" is unknown/);
  });

  it("plays the same replay with nudges to the same hash twice, and not the hash of the replay without them", () => {
    const r = withNudges([1000, "nudge_left"], [1500, "nudge_up"]);
    expect(play(r)).toBe(play(r));
    expect(play(r)).not.toBe(play(base()));
  });

  it("is a different game for each direction", () => {
    const hashes = (["nudge_left", "nudge_right", "nudge_up"] as const).map((a) => play(withNudges([1000, a])));
    expect(new Set(hashes).size).toBe(3);
  });

  it("drops a nudge inside the cooldown: two close together play as the first alone", () => {
    expect(play(withNudges([1000, "nudge_left"], [1100, "nudge_left"]))).toBe(play(withNudges([1000, "nudge_left"])));
    expect(play(withNudges([1000, "nudge_left"], [1300, "nudge_left"]))).not.toBe(play(withNudges([1000, "nudge_left"])));
  });
});
