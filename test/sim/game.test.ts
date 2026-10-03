import { describe, expect, it } from "vitest";
import { advance, createGame, setPaused, snapshot } from "../../src/sim/game";
import { demoTable } from "../../src/tables/demo";
import { hashWorld } from "../../src/core/hash";

describe("game loop", () => {
  it("starts with one ball resting in the plunger lane", () => {
    const g = createGame(demoTable);
    const s = snapshot(g);
    expect(s.balls.length).toBe(1);
    expect(s.balls[0]!.x).toBeCloseTo(demoTable.plunger!.at[0] / 1000, 3);
    expect(s.balls[0]!.y).toBeLessThan(demoTable.plunger!.at[1] / 1000);
  });

  it("runs whole 1 ms ticks for the elapsed time and keeps the remainder", () => {
    const g = createGame(demoTable);
    advance(g, 16.7);
    expect(g.table.world.tick).toBe(16);
    advance(g, 0.4); // 0.7 + 0.4 = 1.1 ms
    expect(g.table.world.tick).toBe(17);
  });

  it("caps a long frame so a background tab cannot cause a spiral", () => {
    const g = createGame(demoTable);
    advance(g, 5000);
    expect(g.table.world.tick).toBe(50);
  });

  it("does not move while paused and resumes afterwards", () => {
    const g = createGame(demoTable);
    setPaused(g, true);
    advance(g, 100);
    expect(g.table.world.tick).toBe(0);
    setPaused(g, false);
    advance(g, 10);
    expect(g.table.world.tick).toBe(10);
  });

  it("raises a flipper while its button is held and lowers it again", () => {
    const g = createGame(demoTable);
    g.input.left = true;
    advance(g, 50);
    const left = g.table.world.flippers[g.table.flipperIds.indexOf("left")]!;
    const right = g.table.world.flippers[g.table.flipperIds.indexOf("right")]!;
    expect(left.u).toBe(1);
    expect(right.u).toBe(0);
    g.input.left = false;
    for (let i = 0; i < 3; i++) advance(g, 50); // frames are capped at 50 ms
    expect(left.u).toBe(0);
  });

  it("launches the ball up the lane when the plunger is held and released", () => {
    const g = createGame(demoTable);
    advance(g, 300); // settle on the face
    g.input.plunge = true;
    advance(g, 49); // full pull needs several frames; frames are capped at 50 ms
    for (let i = 0; i < 12; i++) advance(g, 49);
    g.input.plunge = false;
    let highest = Infinity;
    for (let i = 0; i < 40; i++) {
      advance(g, 25);
      highest = Math.min(highest, g.table.world.balls[0]!.y);
    }
    expect(highest).toBeLessThan(0.3);
  });

  it("puts a new ball into the plunger lane when the ball drains", () => {
    const g = createGame(demoTable);
    const b = g.table.world.balls[0]!;
    b.x = 0.26;
    b.y = demoTable.playfield.length / 1000 + 0.2; // below the table
    b.vx = 0;
    b.vy = 0;
    advance(g, 5);
    expect(g.table.world.balls.length).toBe(1);
    expect(g.table.world.balls[0]!.y).toBeLessThan(demoTable.playfield.length / 1000);
    expect(g.table.world.balls[0]!.x).toBeCloseTo(demoTable.plunger!.at[0] / 1000, 3);
    expect(g.drains).toBe(1);
  });

  it("is deterministic: the same inputs at the same times give the same hash", () => {
    const run = () => {
      const g = createGame(demoTable);
      for (let i = 0; i < 400; i++) {
        g.input.left = i % 40 < 10;
        g.input.plunge = i > 20 && i < 90;
        advance(g, 16);
      }
      return hashWorld(g.table.world);
    };
    expect(run()).toBe(run());
  });
});

describe("launching on the demo table", () => {
  it("delivers a full-power launch into the playfield whatever the timing", () => {
    let delivered = 0;
    let total = 0;
    for (const settle of [300, 853, 1100]) {
      for (const hold of [450, 520, 600, 700]) {
        const g = createGame(demoTable);
        for (let i = 0; i < settle; i++) advance(g, 1);
        g.input.plunge = true;
        for (let i = 0; i < hold; i++) advance(g, 1);
        g.input.plunge = false;
        let reached = false;
        for (let i = 0; i < 12000 && !reached; i++) {
          advance(g, 1);
          const b = g.table.world.balls[0]!;
          reached = b.y > 0.55 && b.x < 0.47;
        }
        total += 1;
        if (reached) delivered += 1;
      }
    }
    expect(delivered / total).toBeGreaterThanOrEqual(0.9);
  });
});

describe("snapshot", () => {
  it("is plain data for the renderer: balls, flipper poses and the plunger face", () => {
    const g = createGame(demoTable);
    const s = snapshot(g);
    expect(s.flippers.length).toBe(2);
    expect(s.flippers[0]).toMatchObject({ r0: expect.any(Number), tx: expect.any(Number), dx: expect.any(Number) });
    expect(s.plunger).toMatchObject({ x: expect.any(Number), halfWidth: expect.any(Number) });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("keeps a ball that has left the plunger lane from rolling back down it", () => {
    const g = createGame(demoTable);
    const b = g.table.world.balls[0]!;
    b.x = 0.499;
    b.y = 0.26; // in the lane, above the one-way flap at y = 300 mm
    b.vy = 1;
    for (let i = 0; i < 40; i++) advance(g, 49);
    expect(b.y).toBeLessThan(0.3);
    expect(b.y).toBeGreaterThan(0.25);
  });
});
