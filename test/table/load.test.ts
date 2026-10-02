import { describe, expect, it } from "vitest";
import { loadTable, makeBall } from "../../src/table/load";
import { step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { slopeGravity } from "../../src/core/world";
import { demoTable } from "../../src/tables/demo";
import type { TableDef } from "../../src/table/schema";

describe("loadTable", () => {
  it("converts millimetres to metres and grams to kilograms", () => {
    const t = loadTable(demoTable);
    expect(t.ballRadius).toBeCloseTo(demoTable.ball.radius / 1000, 12);
    expect(t.ballMass).toBeCloseTo(demoTable.ball.mass / 1000, 12);
    const post = t.world.circles[0]!;
    expect(post.x).toBeCloseTo(demoTable.posts[0]!.at[0] / 1000, 12);
    expect(post.r).toBeCloseTo(demoTable.posts[0]!.r / 1000, 12);
  });

  it("reports the playfield size in metres", () => {
    const t = loadTable(demoTable);
    expect(t.playfieldWidth).toBeCloseTo(demoTable.playfield.width / 1000, 12);
    expect(t.playfieldLength).toBeCloseTo(demoTable.playfield.length / 1000, 12);
  });

  it("uses the slope of the table for gravity", () => {
    const t = loadTable(demoTable);
    expect(t.world.gravity).toBeCloseTo(slopeGravity(demoTable.playfield.slopeDeg), 12);
  });

  it("turns an arc into chords whose end points lie on the circle", () => {
    const def: TableDef = structuredClone(demoTable);
    def.walls = [{ type: "arc", c: [200, 300], r: 100, from: 0, to: 90, chords: 8, material: "rubber" }];
    def.shots = {};
    def.posts = [];
    const w = loadTable(def).world;
    expect(w.segments.length).toBe(8);
    for (const s of w.segments) {
      expect(Math.hypot(s.ax - 0.2, s.ay - 0.3)).toBeCloseTo(0.1, 9);
      expect(Math.hypot(s.bx - 0.2, s.by - 0.3)).toBeCloseTo(0.1, 9);
    }
    // consecutive chords share an end point
    for (let i = 1; i < w.segments.length; i++) {
      expect(w.segments[i]!.ax).toBe(w.segments[i - 1]!.bx);
      expect(w.segments[i]!.ay).toBe(w.segments[i - 1]!.by);
    }
  });

  it("closes a closed polyline", () => {
    const def: TableDef = structuredClone(demoTable);
    def.walls = [{ type: "polyline", points: [[10, 10], [100, 10], [100, 100]], closed: true, material: "rubber" }];
    def.shots = {};
    def.posts = [];
    expect(loadTable(def).world.segments.length).toBe(3);
  });

  it("gives colliders of a named switch the same numeric id, others none", () => {
    const t = loadTable(demoTable);
    const idx = t.switchNames.indexOf("target1");
    expect(idx).toBeGreaterThanOrEqual(0);
    const withSwitch = t.world.segments.filter((s) => s.sw === idx + 1);
    expect(withSwitch.length).toBe(1);
    expect(t.world.segments.some((s) => s.sw === 0)).toBe(true);
  });

  it("refuses an invalid table and says why", () => {
    const def: TableDef = structuredClone(demoTable);
    def.walls[0]!.material = "glass";
    expect(() => loadTable(def)).toThrow(/material "glass"/);
  });

  it("keeps a dropped ball inside the demo table, deterministically", () => {
    const hashes = [0, 1].map(() => {
      const t = loadTable(demoTable);
      t.world.balls.push(makeBall(t, 260, 100));
      for (let i = 0; i < 6000; i++) step(t.world);
      const b = t.world.balls[0]!;
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(demoTable.playfield.width / 1000);
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(demoTable.playfield.length / 1000);
      return hashWorld(t.world);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });

  it("builds the flippers of the table in order, in SI units, at rest", () => {
    const t = loadTable(demoTable);
    expect(t.flipperIds).toEqual(demoTable.flippers.map((f) => f.id));
    expect(t.world.flippers.length).toBe(demoTable.flippers.length);
    const def = demoTable.flippers[0]!;
    const f = t.world.flippers[0]!;
    expect(f.px).toBeCloseTo(def.pivot[0] / 1000, 12);
    expect(f.length).toBeCloseTo(def.length / 1000, 12);
    expect(Math.atan2(f.dy, f.dx)).toBeCloseTo((def.restDeg * Math.PI) / 180, 6);
    expect(f.on).toBe(false);
    expect(f.upRate).toBeCloseTo(1000 / def.upMs, 9);
  });

  it("mirrors: the right flipper swings the opposite way from the left", () => {
    const t = loadTable(demoTable);
    const [l, r] = t.world.flippers as [import("../../src/core/types").Flipper, import("../../src/core/types").Flipper];
    expect(Math.sign(l.theta1 - l.theta0)).toBe(-Math.sign(r.theta1 - r.theta0));
  });

  it("lets the demo table's flippers hold and flip a ball end to end", () => {
    const t = loadTable(demoTable);
    const left = t.world.flippers[0]!;
    const rest = left.u;
    left.on = true;
    for (let i = 0; i < 60; i++) step(t.world);
    expect(left.u).toBeGreaterThan(rest);
    expect(left.u).toBe(1);
  });

  it("builds the plunger in SI units with a unit launch direction", () => {
    const t = loadTable(demoTable);
    const def = demoTable.plunger!;
    const p = t.world.plunger!;
    expect(p.x).toBeCloseTo(def.at[0] / 1000, 12);
    expect(p.halfWidth).toBeCloseTo(def.width / 2000, 12);
    expect(p.stroke).toBeCloseTo(def.stroke / 1000, 12);
    expect(Math.hypot(p.dirx, p.diry)).toBeCloseTo(1, 12);
    expect(p.diry).toBeLessThan(-0.99); // launches up the table
  });

  it("has no plunger when the table defines none", () => {
    const def: TableDef = structuredClone(demoTable);
    delete def.plunger;
    expect(loadTable(def).world.plunger).toBeNull();
  });

  it("launches a ball up the demo table's plunger lane", () => {
    const t = loadTable(demoTable);
    const p = t.world.plunger!;
    const def = demoTable.plunger!;
    const b = makeBall(t, def.at[0], def.at[1] - demoTable.ball.radius - 0.01);
    t.world.balls.push(b);
    for (let i = 0; i < 300; i++) step(t.world); // settle on the face
    p.pull = 1;
    for (let i = 0; i < 400; i++) step(t.world);
    p.pull = 0;
    let highest = Infinity;
    for (let i = 0; i < 1500; i++) {
      step(t.world);
      highest = Math.min(highest, b.y);
    }
    expect(highest).toBeLessThan(0.3);
    expect(b.x).toBeGreaterThan(0.48);
  });

  it("steers a launched ball out of the lane into the playfield", () => {
    const t = loadTable(demoTable);
    const p = t.world.plunger!;
    const def = demoTable.plunger!;
    const b = makeBall(t, def.at[0], def.at[1] - demoTable.ball.radius - 0.01);
    t.world.balls.push(b);
    for (let i = 0; i < 300; i++) step(t.world);
    p.pull = 1;
    for (let i = 0; i < 700; i++) step(t.world);
    p.pull = 0;
    let leftTheLane = false;
    for (let i = 0; i < 4000 && !leftTheLane; i++) {
      step(t.world);
      leftTheLane = b.x < 0.45 && b.y < 0.6;
    }
    expect(leftTheLane).toBe(true);
  });

  it("delivers a launched ball into the playfield towards the flippers, for light and hard launches", () => {
    for (const pull of [0.5, 0.75, 1]) {
      const t = loadTable(demoTable);
      const p = t.world.plunger!;
      const def = demoTable.plunger!;
      const b = makeBall(t, def.at[0], def.at[1] - demoTable.ball.radius - 0.01);
      t.world.balls.push(b);
      for (let i = 0; i < 300; i++) step(t.world);
      p.pull = pull;
      for (let i = 0; i < 700; i++) step(t.world);
      p.pull = 0;
      let reached = false;
      for (let i = 0; i < 8000 && !reached; i++) {
        step(t.world);
        reached = b.y > 0.7 && b.x < 0.47;
      }
      expect(reached, `pull ${pull}`).toBe(true);
    }
  });
});
