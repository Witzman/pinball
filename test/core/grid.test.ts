import { describe, expect, it } from "vitest";
import { buildGrid, collect } from "../../src/core/grid";
import type { Circle, Segment } from "../../src/core/types";
import { lcg } from "./scenes";
import { wall } from "./helpers";

function ids(g: ReturnType<typeof buildGrid>, x0: number, y0: number, x1: number, y1: number): number[] {
  const n = collect(g, x0, y0, x1, y1);
  return Array.from(g.cand.subarray(0, n));
}

describe("grid broadphase", () => {
  const segs: Segment[] = [wall(0, 0, 1, 0), wall(5, 5, 5.1, 5.1), wall(2, 0, 2, 10)];
  const circles: Circle[] = [{ x: 3, y: 3, r: 0.1, e: 0.5, mu: 0, zoneMask: 1, sw: 0 }];

  it("returns colliders near the query box and not far ones", () => {
    const g = buildGrid(segs, circles, 0.5);
    expect(ids(g, 4.9, 4.9, 5.2, 5.2)).toEqual([1]);
    expect(ids(g, 2.9, 2.9, 3.1, 3.1)).toEqual([3]); // circle index follows the segments
  });

  it("lists a long collider once, in ascending index order", () => {
    const g = buildGrid(segs, circles, 0.5);
    const found = ids(g, 0, 0, 6, 6);
    expect(found).toEqual([...new Set(found)].sort((a, b) => a - b));
    expect(found).toContain(2);
  });

  it("does not crash for a box outside the grid", () => {
    const g = buildGrid(segs, circles, 0.5);
    expect(() => ids(g, -50, -50, -49, -49)).not.toThrow();
    expect(() => ids(g, 99, 99, 100, 100)).not.toThrow();
  });

  it("returns every collider within reach of a ball (superset of the true hits)", () => {
    const rnd = lcg(3);
    const many: Segment[] = [];
    for (let i = 0; i < 300; i++) {
      const x = rnd() * 0.5;
      const y = rnd();
      many.push(wall(x, y, x + 0.05 * (rnd() - 0.5), y + 0.05 * (rnd() - 0.5)));
    }
    const g = buildGrid(many, [], 0.04);
    for (let k = 0; k < 200; k++) {
      const px = rnd() * 0.5;
      const py = rnd();
      const r = 0.0135;
      const found = new Set(ids(g, px - r, py - r, px + r, py + r));
      many.forEach((s, i) => {
        const abx = s.bx - s.ax;
        const aby = s.by - s.ay;
        const u = Math.max(0, Math.min(1, ((px - s.ax) * abx + (py - s.ay) * aby) / (abx * abx + aby * aby)));
        const d = Math.hypot(px - (s.ax + u * abx), py - (s.ay + u * aby));
        if (d <= r) expect(found.has(i)).toBe(true);
      });
    }
  });
});
