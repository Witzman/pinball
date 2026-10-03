import { describe, expect, it } from "vitest";
import { advance, createGame, nudge, takeCommands, tick } from "../../src/sim/game";
import { allTables, tableSetups } from "../../src/tables";
import { demoTable } from "../../src/tables/demo";
import { demoFlow } from "../../src/tables/demo-rules";
import { validateFlow } from "../../src/rules";

describe("the shipping tables' setups", () => {
  it("has a setup for every table, with a valid flow", () => {
    for (const t of allTables) {
      const setup = tableSetups[t.id];
      expect(setup, t.id).toBeDefined();
      expect(setup!.flow, t.id).toBeDefined();
      expect(validateFlow(setup!.flow!), t.id).toEqual([]);
    }
  });

  it("plays a game on the demo table: start, hit the target for 1000, a drain inside the saver window brings the ball back", () => {
    const g = createGame(demoTable, tableSetups.demo!);
    expect(g.rules.state.game).toMatchObject({ phase: "attract", credits: demoFlow.startCredits });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    expect(g.rules.state.game).toMatchObject({ phase: "play", credits: demoFlow.startCredits - demoFlow.startCost });
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    b.x = 0.34;
    b.y = 0.55;
    b.vx = 0;
    b.vy = -3;
    advance(g, 50);
    expect(g.rules.state.player.score).toBe(1000);
    g.table.world.gravity = 1.1;
    b.y = 1.2; // drains; the target was the ball's first switch, so the saver is on
    advance(g, 10);
    expect(g.rules.state.game!.phase).toBe("play");
    expect(g.rules.state.player.ballNo).toBe(1);
    expect(takeCommands(g).map((c) => c.c)).toContain("feedBall");
  });

  it("tilts the demo table when it is shoved too much: two free nudges, two warnings, the fifth is the tilt", () => {
    const g = createGame(demoTable, tableSetups.demo!);
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    g.table.world.gravity = 0;
    const heat: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      nudge(g, "left");
      for (let t = 0; t < 260; t++) tick(g); // past the cooldown, far inside the cooling time
      heat.push(g.rules.state.game!.tilted);
    }
    expect(heat).toEqual([false, false, false, false, true]);
    expect(g.rules.state.game!.tiltHeat).toBe(5);
  });

  it("lets a ball the flippers miss drain by gravity alone, so the game goes on to the next ball", () => {
    const g = createGame(demoTable, tableSetups.demo!);
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    expect(g.rules.state.player.ballNo).toBe(1);
    const b = g.table.world.balls[0]!;
    Object.assign(b, { x: 0.26, y: 0.95, vx: 0, vy: 0 }); // between the flippers, which stay down
    for (let i = 0; i < 20; i++) advance(g, 50); // a second of play, gravity only
    for (let i = 0; i < 100 && g.rules.state.player.ballNo === 1; i++) advance(g, 50);
    expect(g.rules.state.player.ballNo).toBe(2);
    expect(g.rules.state.game!.phase).toBe("play");
  });

  it("holds the ball in the plunger lane while the plunger is pulled: the lane has a floor", () => {
    const g = createGame(demoTable);
    g.input.plunge = true;
    for (let i = 0; i < 40; i++) advance(g, 50); // two seconds of pulling, more than the stroke needs
    const b = g.table.world.balls[0]!;
    expect(g.drains).toBe(0);
    expect(b.y).toBeLessThan(1.05); // still on the table, squeezed against the floor, not carried below it
    expect(b.y).toBeGreaterThan(0.95);
  });

  it("pushes the ball off each pop bumper of the demo table and scores 100 for it", () => {
    for (const [x, y, name] of [[0.12, 0.4, "bumper1"], [0.24, 0.42, "bumper2"]] as const) {
      const g = createGame(demoTable, tableSetups.demo!);
      g.input.start = true;
      advance(g, 5);
      g.input.start = false;
      advance(g, 5);
      g.table.world.gravity = 0;
      const b = g.table.world.balls[0]!;
      Object.assign(b, { x, y, vx: 1, vy: 0 }); // straight at the bumper from the left: (200, 400) mm and (320, 420) mm
      const before = g.rules.state.player.score;
      for (let i = 0; i < 80; i++) tick(g);
      expect(g.rules.state.player.score, name).toBe(before + 100);
      expect(b.vx, name).toBeLessThan(-1.9); // pushed back with the kick speed of 2 m/s
    }
  });

  it("pushes the ball off the standup target too: it comes back faster than a plain rubber wall would send it", () => {
    const g = createGame(demoTable, tableSetups.demo!);
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    Object.assign(b, { x: 0.34, y: 0.55, vx: 0, vy: -1 }); // up at the target from below
    for (let i = 0; i < 60; i++) tick(g);
    expect(g.rules.state.player.score).toBe(1000);
    expect(b.vy).toBeGreaterThan(1.2); // 1.6 m/s along the normal; a rubber bounce (e 0.6) would give 0.6
  });
});
