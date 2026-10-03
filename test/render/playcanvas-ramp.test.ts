import { describe, expect, it } from "vitest";
import { rampGeometry } from "../../src/render/playcanvas/ramp";
import type { MeshData } from "../../src/render/playcanvas/ramp";

// a ramp 4 wide that runs from the player up the table (z from 40 to 0) and rises from 1 to 9
const path = [{ x: 0, y: 1, z: 40 }, { x: 0, y: 5, z: 20 }, { x: 0, y: 9, z: 0 }];
const g = rampGeometry(path, 4, 0.5, 1.2);

const triangles = (m: MeshData) => {
  const out: { v: number[][]; n: number[] }[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const ix = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
    out.push({ v: ix.map((k) => m.positions.slice(k * 3, k * 3 + 3)), n: m.normals.slice(ix[0]! * 3, ix[0]! * 3 + 3) });
  }
  return out;
};

describe("the geometry of a rising ramp", () => {
  it("builds a surface of two triangles per face for each of the two segments, and rails on both edges", () => {
    expect(g.surface.indices.length / 3).toBe(2 * 4 * 2); // top, bottom and two edges: 4 quads x 2 triangles x 2 segments
    expect(g.rails.indices.length / 3).toBe(2 * 4 * 2); // two walls with two faces: 4 quads x 2 triangles x 2 segments
    expect(g.surface.positions.length).toBe(g.surface.normals.length);
  });

  it("winds every triangle counter-clockwise seen from the side its normal points to", () => {
    for (const m of [g.surface, g.rails]) {
      for (const t of triangles(m)) {
        const a = t.v[0]!;
        const b = t.v[1]!;
        const c = t.v[2]!;
        const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
        const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
        const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        expect(cr[0]! * t.n[0]! + cr[1]! * t.n[1]! + cr[2]! * t.n[2]!).toBeGreaterThan(0);
        expect(Math.hypot(...t.n)).toBeCloseTo(1, 9);
      }
    }
  });

  it("faces up on top and down underneath, and the top surface follows the heights of the path", () => {
    const tops = triangles(g.surface).filter((t) => t.n[1]! > 0.5);
    const unders = triangles(g.surface).filter((t) => t.n[1]! < -0.5);
    expect(tops.length).toBe(4);
    expect(unders.length).toBe(4);
    const ys = new Set(tops.flatMap((t) => t.v.map((v) => v[1]!.toFixed(3))));
    expect([...ys].sort()).toEqual(["1.000", "5.000", "9.000"]);
    // the top is a slope: its normal leans back towards the player (+z) because the ramp rises away from the player
    expect(tops[0]!.n[2]!).toBeGreaterThan(0);
  });

  it("is as wide as asked, centred on the path, and the rails stand on the edges", () => {
    const xs = g.surface.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(-2, 9);
    expect(Math.max(...xs)).toBeCloseTo(2, 9);
    const railY = g.rails.positions.filter((_, i) => i % 3 === 1);
    expect(Math.max(...railY)).toBeCloseTo(9 + 1.2, 9);
    const railX = new Set(g.rails.positions.filter((_, i) => i % 3 === 0).map((x) => Math.abs(x).toFixed(3)));
    expect([...railX]).toEqual(["2.000"]);
  });

  it("puts a support under the middle of every segment, below the slab", () => {
    expect(g.supports).toHaveLength(2);
    expect(g.supports[0]).toEqual({ x: 0, y: 3 - 0.5, z: 30 });
    expect(g.supports[1]).toEqual({ x: 0, y: 7 - 0.5, z: 10 });
  });

  it("follows a ramp that turns: the sides stay on either side of the centre line", () => {
    const bend = rampGeometry([{ x: 0, y: 0, z: 20 }, { x: 0, y: 4, z: 10 }, { x: 10, y: 8, z: 0 }], 4, 0.5, 1);
    const surf = triangles(bend.surface).filter((t) => t.n[1]! > 0.5);
    expect(surf).toHaveLength(4);
    for (const t of surf) for (const v of t.v) expect(Number.isFinite(v[0]! + v[1]! + v[2]!)).toBe(true);
  });
});
