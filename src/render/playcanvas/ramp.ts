// The geometry of a rising ramp (#45) as plain arrays, so it can be tested without the engine.
// Units are the renderer's (centimetres), x to the right, z down the table, y up.

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const sub = (a: number[], b: number[]): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

class Builder {
  readonly data: MeshData = { positions: [], normals: [], indices: [] };

  /** A flat quad a, b, c, d (counter-clockwise seen from the side the normal points to). */
  quad(a: number[], b: number[], c: number[], d: number[]): void {
    const n = cross(sub(b, a), sub(d, a));
    const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    const base = this.data.positions.length / 3;
    for (const v of [a, b, c, d]) {
      this.data.positions.push(v[0]!, v[1]!, v[2]!);
      this.data.normals.push(n[0]! / l, n[1]! / l, n[2]! / l);
    }
    this.data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * The surface and the side rails of a ramp whose centre line passes through `path` (the height
 * is the y of each point), `width` wide, the surface `thickness` thick, the rails `railH` high.
 * The surface faces up; the rails face outwards and inwards. A path needs at least two points.
 */
export function rampGeometry(path: readonly Point3[], width: number, thickness: number, railH: number): { surface: MeshData; rails: MeshData; supports: Point3[] } {
  const surface = new Builder();
  const rails = new Builder();
  const left: number[][] = [];
  const right: number[][] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, i + 1)]!;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // the sideways direction on the playfield: (dz, -dx) points to the left of the direction of travel (x right, z toward the player)
    const p = path[i]!;
    left.push([p.x + dz * (width / 2), p.y, p.z - dx * (width / 2)]);
    right.push([p.x - dz * (width / 2), p.y, p.z + dx * (width / 2)]);
  }
  const down = (v: number[], h: number): number[] => [v[0]!, v[1]! - h, v[2]!];
  const up = (v: number[], h: number): number[] => [v[0]!, v[1]! + h, v[2]!];
  for (let i = 1; i < path.length; i++) {
    const l0 = left[i - 1]!;
    const l1 = left[i]!;
    const r0 = right[i - 1]!;
    const r1 = right[i]!;
    // top (normal up), bottom (normal down)
    surface.quad(l0, r0, r1, l1);
    surface.quad(down(l0, thickness), down(l1, thickness), down(r1, thickness), down(r0, thickness));
    // the edges of the slab
    surface.quad(down(l0, thickness), l0, l1, down(l1, thickness));
    surface.quad(down(r1, thickness), r1, r0, down(r0, thickness));
    // rails: a thin wall standing on each edge, both faces
    for (const [e0, e1, outward] of [[l0, l1, 1], [r0, r1, -1]] as const) { // outward is 1 for the left edge, -1 for the right
      if (outward === 1) {
        rails.quad(e0, e1, up(e1, railH), up(e0, railH));
        rails.quad(up(e0, railH), up(e1, railH), e1, e0);
      } else {
        rails.quad(e1, e0, up(e0, railH), up(e1, railH));
        rails.quad(up(e1, railH), up(e0, railH), e0, e1);
      }
    }
  }
  // a support post under the middle of every segment
  const supports: Point3[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    supports.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - thickness, z: (a.z + b.z) / 2 });
  }
  return { surface: surface.data, rails: rails.data, supports };
}
