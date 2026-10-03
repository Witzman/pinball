import { describe, expect, it } from "vitest";
import { advance, createGame, nudge, recover, takeAudio, tick } from "../../src/sim/game";
import type { Game } from "../../src/sim/game";
import type { FlowConfig } from "../../src/rules";
import { demoTable } from "../../src/tables/demo";
import { tableSetups } from "../../src/tables";

const ticks = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) tick(g);
};

function started(flow?: Partial<FlowConfig>): Game {
  const g = createGame(demoTable, { flow: { ballsPerGame: 3, startCost: 0, startCredits: 0, overTicks: 100, saverTicks: 0, bonusTicks: 5, extraBallMax: 0, ...flow } });
  g.input.start = true;
  advance(g, 5);
  g.input.start = false;
  advance(g, 5);
  g.table.world.gravity = 0;
  takeAudio(g);
  return g;
}

describe("what the sim gives the sound layer", () => {
  it("gives a flip event for each flipper at each edge of its button, and none while the button is just held", () => {
    const g = createGame(demoTable);
    g.input.left = true;
    ticks(g, 5);
    g.input.right = true;
    ticks(g, 5);
    g.input.left = false;
    g.input.right = false;
    ticks(g, 5);
    expect(takeAudio(g).events).toEqual([
      { a: "flip", side: "L", up: true },
      { a: "flip", side: "R", up: true },
      { a: "flip", side: "L", up: false },
      { a: "flip", side: "R", up: false },
    ]);
  });

  it("makes no click when the tilt drops a flipper, and none for a button pressed while the flippers are dead", () => {
    const g = started({ tilt: { free: 0, warnings: 0, decayTicks: 2000 } });
    g.input.left = true;
    ticks(g, 50);
    takeAudio(g);
    expect(nudge(g, "left")).toBe(true);
    ticks(g, 20);
    expect(g.rules.state.game!.tilted).toBe(true);
    g.input.right = true;
    g.input.left = false;
    ticks(g, 50);
    expect(takeAudio(g).events.filter((e) => e.a === "flip")).toEqual([]);
  });

  it("gives a plunge event when the plunger is let go, with the strength of how far it was pulled; none when the button was never pressed", () => {
    const g = createGame(demoTable);
    g.input.plunge = true;
    ticks(g, 300);
    const p = g.table.world.plunger!;
    const pulled = p.pos / p.stroke;
    expect(pulled).toBeGreaterThan(0.1);
    expect(pulled).toBeLessThan(1);
    expect(takeAudio(g).events).toEqual([]); // nothing while it is being pulled
    g.input.plunge = false;
    tick(g);
    const ev = takeAudio(g).events;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ a: "plunge" });
    expect((ev[0] as { s: number }).s).toBeCloseTo(pulled, 12);
    const g2 = createGame(demoTable);
    ticks(g2, 5);
    expect(takeAudio(g2).events).toEqual([]);
  });

  it("gives a switch event with the kind, the strength and the table's class when a ball hits a kicker or a target", () => {
    const g = started();
    Object.assign(g.table.world.balls[0]!, { x: 0.12, y: 0.4, vx: 1, vy: 0 }); // at bumper1
    ticks(g, 80);
    const pop = takeAudio(g).events.filter((e) => e.a === "switch");
    expect(pop).toHaveLength(1);
    expect(pop[0]).toMatchObject({ a: "switch", sw: "bumper1", kind: "kick" });
    expect(pop[0]).not.toHaveProperty("cls");
    expect((pop[0] as { s: number }).s).toBeGreaterThan(0.3);
    expect((pop[0] as { s: number }).s).toBeLessThanOrEqual(1);

    const h = started();
    Object.assign(h.table.world.balls[0]!, { x: 0.34, y: 0.55, vx: 0, vy: -1 });
    ticks(h, 60);
    expect(takeAudio(h).events.filter((e) => e.a === "switch")[0]).toMatchObject({ sw: "target1", kind: "kick", cls: "target" });
  });

  it("gives a drain event, and a button event for the coin and start presses (not the release)", () => {
    const g = createGame(demoTable, tableSetups.demo!);
    g.input.coin = true;
    ticks(g, 3);
    expect(takeAudio(g).events.filter((e) => e.a === "btn")).toEqual([{ a: "btn", button: "coin" }]); // on the press, while it is still held
    g.input.coin = false;
    ticks(g, 3);
    expect(takeAudio(g).events.filter((e) => e.a === "btn")).toEqual([]); // not on the release
    g.input.start = true;
    ticks(g, 3);
    g.input.start = false;
    ticks(g, 3);
    expect(takeAudio(g).events.filter((e) => e.a === "btn")).toEqual([{ a: "btn", button: "start" }]);
    Object.assign(g.table.world.balls[0]!, { y: 1.2 });
    ticks(g, 3);
    expect(takeAudio(g).events).toContainEqual({ a: "drain" });
  });

  it("hands each event over once, and tells how fast the fastest ball rolls: 5 m/s is full, a held ball does not count", () => {
    const g = started();
    g.table.world.balls[0]!.vx = 3;
    g.table.world.balls[0]!.vy = 0;
    expect(takeAudio(g).roll).toBeCloseTo(0.6, 9);
    g.table.world.balls[0]!.vx = 30;
    expect(takeAudio(g).roll).toBe(1);
    g.table.world.balls[0]!.hold = 1;
    expect(takeAudio(g).roll).toBe(0);
    g.input.left = true;
    ticks(g, 2);
    expect(takeAudio(g).events).toHaveLength(1);
    expect(takeAudio(g).events).toEqual([]);
  });

  it("says gate for both directions of a gate crossing, and does not take a table's switch name for a sound class", () => {
    const t = structuredClone(demoTable);
    t.gates = [{ a: [40, 600], b: [100, 600], zoneA: 0, zoneB: 1, switch: "mouth" }, { a: [40, 300], b: [100, 300], zoneA: 1, zoneB: 0, switch: "constructor" }];
    t.sounds = {};
    delete t.visual;
    const g = createGame(t);
    g.table.world.gravity = 0;
    Object.assign(g.table.world.balls[0]!, { x: 0.07, y: 0.65, vx: 0, vy: -1.5 });
    ticks(g, 400); // up through the mouth and out at the top
    const sw = takeAudio(g).events.filter((e) => e.a === "switch");
    expect(sw.map((e) => [(e as { sw: string }).sw, (e as { kind: string }).kind])).toEqual([["mouth", "gate"], ["constructor", "gate"]]);
    for (const e of sw) expect(e).not.toHaveProperty("cls"); // "constructor" is a switch name, not a class
    Object.assign(g.table.world.balls[0]!, { x: 0.07, y: 0.25, vx: 0, vy: 1.5, zone: 0 }); // and back down from above: the other direction
    ticks(g, 400);
    expect(takeAudio(g).events.filter((e) => e.a === "switch").map((e) => (e as { kind: string }).kind)).toEqual(["gate", "gate"]);
  });

  it("keeps at most 512 events if nobody listens, the newest ones, and forgets them when the game recovers", () => {
    const g = createGame(demoTable);
    for (let i = 0; i < 701; i++) { // an odd number, so the 512th and the last flip differ
      g.input.left = !g.input.left;
      tick(g);
    }
    expect(g.audioOut.length).toBe(512);
    expect(g.audioOut[511]).toEqual({ a: "flip", side: "L", up: g.input.left }); // the last one is there
    recover(g, new Error("boom"));
    expect(g.audioOut).toEqual([]);
  });
});
