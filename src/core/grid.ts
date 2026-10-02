import type { Circle, Grid, Segment } from "./types";

// Built once at table load. Static colliders only (flippers and other moving
// parts are tested separately). Colliders are indexed segments first, then circles.

export const DEFAULT_CELL = 0.04;

export function buildGrid(segments: Segment[], circles: Circle[], cell = DEFAULT_CELL): Grid {
  const total = segments.length + circles.length;
  const lo = new Float64Array(total * 2);
  const hi = new Float64Array(total * 2);
  segments.forEach((s, i) => {
    lo[2 * i] = Math.min(s.ax, s.bx);
    lo[2 * i + 1] = Math.min(s.ay, s.by);
    hi[2 * i] = Math.max(s.ax, s.bx);
    hi[2 * i + 1] = Math.max(s.ay, s.by);
  });
  circles.forEach((c, k) => {
    const i = segments.length + k;
    lo[2 * i] = c.x - c.r;
    lo[2 * i + 1] = c.y - c.r;
    hi[2 * i] = c.x + c.r;
    hi[2 * i + 1] = c.y + c.r;
  });

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  if (total > 0) {
    minX = lo[0]!;
    minY = lo[1]!;
    maxX = hi[0]!;
    maxY = hi[1]!;
    for (let i = 1; i < total; i++) {
      minX = Math.min(minX, lo[2 * i]!);
      minY = Math.min(minY, lo[2 * i + 1]!);
      maxX = Math.max(maxX, hi[2 * i]!);
      maxY = Math.max(maxY, hi[2 * i + 1]!);
    }
  }
  const nx = Math.floor((maxX - minX) / cell) + 1;
  const ny = Math.floor((maxY - minY) / cell) + 1;
  const cellOf = (v: number, min: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v - min) / cell)));

  const start = new Int32Array(nx * ny + 1);
  for (let pass = 0; pass < 2; pass++) {
    const fill = pass === 1 ? start.slice() : null;
    const items = pass === 1 ? new Int32Array(start[nx * ny]!) : null;
    for (let i = 0; i < total; i++) {
      const x0 = cellOf(lo[2 * i]!, minX, nx);
      const x1 = cellOf(hi[2 * i]!, minX, nx);
      const y0 = cellOf(lo[2 * i + 1]!, minY, ny);
      const y1 = cellOf(hi[2 * i + 1]!, minY, ny);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = cy * nx + cx;
          if (pass === 0) start[c + 1]! += 1;
          else items![fill![c]!++] = i;
        }
      }
    }
    if (pass === 0) {
      for (let c = 0; c < nx * ny; c++) start[c + 1] = start[c + 1]! + start[c]!;
    } else {
      return { minX, minY, cell, nx, ny, start, items: items!, stamp: new Int32Array(total), stampN: 0, cand: new Int32Array(total) };
    }
  }
  throw new Error("unreachable");
}

/**
 * Fills g.cand with the colliders whose cells touch the box, ascending and
 * unique, and returns how many. Ascending order keeps tie-breaking identical to
 * a scan over all colliders.
 */
export function collect(g: Grid, x0: number, y0: number, x1: number, y1: number): number {
  const cx0 = Math.min(g.nx - 1, Math.max(0, Math.floor((x0 - g.minX) / g.cell)));
  const cx1 = Math.min(g.nx - 1, Math.max(0, Math.floor((x1 - g.minX) / g.cell)));
  const cy0 = Math.min(g.ny - 1, Math.max(0, Math.floor((y0 - g.minY) / g.cell)));
  const cy1 = Math.min(g.ny - 1, Math.max(0, Math.floor((y1 - g.minY) / g.cell)));
  if (g.stampN === 2147483647) {
    g.stamp.fill(0);
    g.stampN = 0;
  }
  const mark = ++g.stampN;
  let n = 0;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * g.nx + cx;
      for (let k = g.start[c]!; k < g.start[c + 1]!; k++) {
        const i = g.items[k]!;
        if (g.stamp[i] !== mark) {
          g.stamp[i] = mark;
          g.cand[n++] = i;
        }
      }
    }
  }
  for (let i = 1; i < n; i++) {
    const v = g.cand[i]!;
    let j = i - 1;
    while (j >= 0 && g.cand[j]! > v) {
      g.cand[j + 1] = g.cand[j]!;
      j--;
    }
    g.cand[j + 1] = v;
  }
  return n;
}
