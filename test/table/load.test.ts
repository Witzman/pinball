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
});
