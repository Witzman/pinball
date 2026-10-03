// A layout lint for tables authored by hand, without a human to play them (#52). It sits next to
// validateTable: that one says a table is well formed, this one says the layout is likely to play
// (no pinch that holds a ball, no sinkhole without room, no magnet that pulls through a wall).
// Every number is in LINT, in one place, and is a placeholder like the rest of the layout: nobody
// has played the tables. Used by tests and tools; the game does not import it.

import type { FlipperDef, Point, TableDef } from "./schema";

/** The numbers of the rules, millimetres unless it says otherwise. */
export const LINT = {
  /** Two wall pieces that come closer than this are joined (a corner, a wall meeting a flipper), not a gap. */
  joined: 2,
  /** A gap between two things must be at least a ball diameter plus this, or it holds a ball (a pinch) or lets one squeeze through. */
  gapMargin: 3,
  /** A sinkhole needs this much clear space between the ball rim and any wall around it. */
  sinkholeClearance: 3,
  /** A sinkhole needs this much free length in the direction it kicks the ball. */
  sinkholeKickRoom: 60,
  /** The two flippers of a pair: the clear gap between their resting tips, in ball diameters (from, to) ... */
  flipperRestGap: [1.5, 4] as const,
  /** ... and between their raised tips, in ball diameters (about two balls). */
  flipperRaisedGap: [1, 3] as const,
  /** A feed lane into a flipper may be this many degrees steeper than the flipper at rest. */
  feedSteeper: 10,
  /** A feed lane ends within this distance of the start of the flipper's top edge. */
  feedReach: 25,
  /** Only kickers on the lower part of the table are slingshots in this sense: below this fraction of the playfield length. */
  slingBelow: 0.6,
  /** A slingshot's inward normal may point down the table by at most this (the y component, 1 = straight at the drain). */
  slingDown: 0.1,
  /** A lane (a place with walls to both sides within `laneWidth` ball diameters) is at least a ball plus `laneMin` wide and at most a ball plus `laneMax`. */
  laneWidth: 3,
  laneMin: 3,
  laneMax: 45,
} as const;

interface Piece {
  /** What it is, for the messages. */
  name: string;
  /** The wall (or other thing) this piece belongs to, and its place in it, so neighbours in one polyline are not compared. */
  owner: number;
  index: number;
  a: Point;
  b: Point;
  /** Radius around the line (0 for a wall, the radius for a post or a flipper). */
  r: number;
  zones: number[];
}

const zonesOf = (z: number[] | undefined): number[] => (z && z.length > 0 ? z : [0]);
const share = (a: number[], b: number[]) => a.some((z) => b.includes(z));

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

function segCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
  const d2 = cross(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
  const d3 = cross(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]);
  const d4 = cross(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The distance between two segments (0 when they cross). */
function segsDist(a: Point, b: Point, c: Point, d: Point): number {
  if (segCross(a, b, c, d)) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

function arcPoints(c: Point, r: number, from: number, to: number, chords: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= chords; i++) {
    const a = ((from + ((to - from) * i) / chords) * Math.PI) / 180;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

/** The straight pieces of every wall, as the loader makes them. */
function wallPieces(t: TableDef): Piece[] {
  const out: Piece[] = [];
  t.walls.forEach((w, i) => {
    let pts: Point[];
    if (w.type === "segment") pts = [w.a, w.b];
    else if (w.type === "polyline") pts = w.closed ? [...w.points, w.points[0]!] : w.points;
    else pts = arcPoints(w.c, w.r, w.from, w.to, w.chords ?? 16);
    for (let k = 1; k < pts.length; k++) out.push({ name: `wall #${i}`, owner: i, index: k, a: pts[k - 1]!, b: pts[k]!, r: 0, zones: zonesOf(w.zones) });
  });
  return out;
}

/** A flipper's axis at an angle, as a piece with the larger end radius (the narrowest gap it can make). */
function flipperAt(f: FlipperDef, deg: number): { a: Point; b: Point } {
  const r = (deg * Math.PI) / 180;
  return { a: f.pivot, b: [f.pivot[0] + f.length * Math.cos(r), f.pivot[1] + f.length * Math.sin(r)] };
}

/** The first thing a ray from `from` in `deg` degrees (table plane, y down) meets among the pieces, as a distance; Infinity if nothing. */
function rayHit(from: Point, deg: number, pieces: Piece[], zones: number[]): number {
  const r = (deg * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  let best = Infinity;
  for (const p of pieces) {
    if (!share(p.zones, zones)) continue;
    if (p.r > 0) {
      // a circle (post): the nearest point of the ray within r of its centre
      const fx = p.a[0] - from[0];
      const fy = p.a[1] - from[1];
      const along = fx * dx + fy * dy;
      if (along < 0) continue;
      const off = Math.abs(fx * dy - fy * dx);
      if (off < p.r) best = Math.min(best, along - Math.sqrt(p.r * p.r - off * off));
      continue;
    }
    const ex = p.b[0] - p.a[0];
    const ey = p.b[1] - p.a[1];
    const den = cross(dx, dy, ex, ey);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(p.a[0] - from[0], p.a[1] - from[1], ex, ey) / den;
    const u = cross(p.a[0] - from[0], p.a[1] - from[1], dx, dy) / den;
    if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/**
 * Problems in the layout of a table, as readable lines; empty means none found. Rules: sinkhole
 * room, magnets that pull through walls, pinches between walls and things, overlapping triggers,
 * the flipper pair's gap, feed lanes, slingshot normals, lane widths. Each line starts with
 * `<table id>: <rule>:`.
 */
export function lintTable(t: TableDef): string[] {
  const out: string[] = [];
  const bad = (rule: string, m: string) => out.push(`${t.id}: ${rule}: ${m}`);
  const d = t.ball.radius * 2;
  const walls = wallPieces(t);
  const posts: Piece[] = t.posts.map((p, i) => ({ name: `post #${i}`, owner: 1000 + i, index: 0, a: p.at, b: p.at, r: p.r, zones: zonesOf(p.zones) }));
  const restFlippers: Piece[] = t.flippers.map((f, i) => {
    const s = flipperAt(f, f.restDeg);
    return { name: `flipper "${f.id}"`, owner: 2000 + i, index: 0, a: s.a, b: s.b, r: Math.max(f.rBase, f.rTip), zones: [0] };
  });
  const solids = [...walls, ...posts];

  // sinkholes: room around the ball and room to kick it out
  for (const tr of t.triggers ?? []) {
    if (!tr.hold) continue;
    const z = zonesOf(tr.zones);
    let nearest = Infinity;
    for (const p of solids) if (share(p.zones, z)) nearest = Math.min(nearest, segDist(tr.at, p.a, p.b) - p.r);
    if (nearest < t.ball.radius + LINT.sinkholeClearance) bad("sinkhole-clearance", `sinkhole "${tr.id}" has a wall ${nearest.toFixed(1)} mm away, needs ${t.ball.radius + LINT.sinkholeClearance} (ball radius + ${LINT.sinkholeClearance})`);
    const free = rayHit(tr.at, tr.hold.kickDeg, solids, z);
    if (free < LINT.sinkholeKickRoom) bad("sinkhole-kick", `sinkhole "${tr.id}" kicks into a wall ${free.toFixed(1)} mm away, needs ${LINT.sinkholeKickRoom} mm of room`);
  }

  // magnets pull through walls: none may lie within reach
  for (const m of t.magnets ?? []) {
    const z = zonesOf(m.zones);
    for (const p of solids) {
      if (!share(p.zones, z)) continue;
      const dist = segDist(m.at, p.a, p.b) - p.r;
      if (dist < m.r) bad("magnet-reach", `magnet "${m.id}" reaches ${m.r} mm but ${p.name} is ${dist.toFixed(1)} mm away: it would pull a ball through it`);
    }
  }

  // gaps: two things that are not joined must not form a wedge or a passage a ball would jam in. A gap
  // narrower than a ball everywhere is a slit nothing can enter and is left alone; one that is
  // narrower than a ball plus a margin somewhere and at least a ball wide at one end is a finding.
  // Walls that touch end to end are one shape (a dome meeting its side walls): not compared inside.
  const parent = walls.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const touches = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < LINT.joined;
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const p = walls[i]!;
      const q = walls[j]!;
      if (share(p.zones, q.zones) && (touches(p.a, q.a) || touches(p.a, q.b) || touches(p.b, q.a) || touches(p.b, q.b))) parent[root(i)] = root(j);
    }
  }
  const comp = new Map<Piece, number>();
  walls.forEach((w, i) => comp.set(w, root(i)));
  const things = [...walls, ...posts, ...restFlippers];
  const minGap = d + LINT.gapMargin;
  const pairs = new Map<string, { gap: number; text: string }>();
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const p = things[i]!;
      const q = things[j]!;
      if (p.owner === q.owner || !share(p.zones, q.zones)) continue;
      const cp = comp.get(p);
      if (cp !== undefined && cp === comp.get(q)) continue;
      const gap = segsDist(p.a, p.b, q.a, q.b) - p.r - q.r;
      if (gap < LINT.joined || gap >= minGap) continue; // joined or touching: one shape; wide enough
      const widest = Math.max(segDist(p.a, q.a, q.b), segDist(p.b, q.a, q.b), segDist(q.a, p.a, p.b), segDist(q.b, p.a, p.b)) - p.r - q.r;
      if (widest < d) continue; // a slit no ball can enter
      const key = `${p.name}|${q.name}`;
      const old = pairs.get(key);
      if (!old || gap < old.gap) pairs.set(key, { gap, text: `${p.name} and ${q.name} come within ${gap.toFixed(1)} mm of each other and open to at least a ball (${d} mm): a ball would jam there; keep at least ${minGap} mm or join them` });
    }
  }
  for (const v of pairs.values()) bad("gap", v.text);

  // triggers that overlap fire together
  const trs = t.triggers ?? [];
  for (let i = 0; i < trs.length; i++) {
    for (let j = i + 1; j < trs.length; j++) {
      const a = trs[i]!;
      const b = trs[j]!;
      if (!share(zonesOf(a.zones), zonesOf(b.zones))) continue;
      const dist = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
      if (dist < a.r + b.r) bad("trigger-overlap", `triggers "${a.id}" and "${b.id}" overlap (${dist.toFixed(1)} mm between centres, radii ${a.r} and ${b.r})`);
    }
  }

  // the flipper pair: the clear gap between the tips, at rest and raised
  const left = t.flippers.find((f) => f.id === "left");
  const right = t.flippers.find((f) => f.id === "right");
  if (left && right) {
    const tipGap = (deg: (f: FlipperDef) => number) => {
      const l = flipperAt(left, deg(left)).b;
      const r = flipperAt(right, deg(right)).b;
      return (Math.hypot(l[0] - r[0], l[1] - r[1]) - left.rTip - right.rTip) / d;
    };
    const rest = tipGap((f) => f.restDeg);
    const up = tipGap((f) => f.activeDeg);
    if (rest < LINT.flipperRestGap[0] || rest > LINT.flipperRestGap[1]) bad("flipper-gap", `the flippers' resting tips are ${rest.toFixed(2)} balls apart, wanted ${LINT.flipperRestGap[0]} to ${LINT.flipperRestGap[1]}`);
    if (up < LINT.flipperRaisedGap[0] || up > LINT.flipperRaisedGap[1]) bad("flipper-gap", `the flippers' raised tips are ${up.toFixed(2)} balls apart, wanted ${LINT.flipperRaisedGap[0]} to ${LINT.flipperRaisedGap[1]}`);
  }

  // feed lanes: a wall piece that ends at the start of a flipper's top edge must not be much steeper than the flipper
  for (const f of t.flippers) {
    const a = (f.restDeg * Math.PI) / 180;
    let nx = -Math.sin(a);
    let ny = Math.cos(a);
    if (ny > 0) [nx, ny] = [-nx, -ny];
    const top: Point = [f.pivot[0] + f.rBase * nx, f.pivot[1] + f.rBase * ny];
    for (const w of walls) {
      // the end of the piece nearer the flipper is the one that feeds it
      const near = Math.hypot(w.b[0] - top[0], w.b[1] - top[1]) <= Math.hypot(w.a[0] - top[0], w.a[1] - top[1]) ? w.b : w.a;
      const far = near === w.b ? w.a : w.b;
      if (Math.hypot(near[0] - top[0], near[1] - top[1]) > LINT.feedReach) continue;
      // the slope towards the flipper, as the angle below horizontal on the flipper's side
      const dx = Math.abs(near[0] - far[0]);
      const dy = near[1] - far[1];
      if (dy <= 0) continue; // it does not run down towards the flipper
      const lane = (Math.atan2(dy, dx) * 180) / Math.PI;
      const flipper = Math.abs(((f.restDeg + 180) % 180) > 90 ? 180 - ((f.restDeg + 180) % 180) : (f.restDeg + 180) % 180);
      if (lane > flipper + LINT.feedSteeper) bad("feed-lane", `${w.name} feeds flipper "${f.id}" at ${lane.toFixed(0)} degrees, the flipper rests at ${flipper.toFixed(0)}: more than ${LINT.feedSteeper} degrees steeper`);
    }
  }

  // slingshots: the face towards the middle of the table must not point down at the drain
  t.walls.forEach((w, i) => {
    if (!w.kick || w.type !== "segment" || (w.a[1] + w.b[1]) / 2 < t.playfield.length * LINT.slingBelow) return;
    let nx = w.b[1] - w.a[1];
    let ny = -(w.b[0] - w.a[0]);
    const l = Math.hypot(nx, ny);
    nx /= l;
    ny /= l;
    const mid = (w.a[0] + w.b[0]) / 2;
    if ((nx > 0) !== (mid < t.playfield.width / 2)) [nx, ny] = [-nx, -ny]; // the face towards the middle
    if (ny > LINT.slingDown) bad("sling-normal", `wall #${i}: the slingshot face towards the middle points ${(ny * 100).toFixed(0)}% down the table, towards the drain`);
  });

  // lanes: a trigger with walls to both sides close by sits in a lane, which must be a ball wide plus a margin
  for (const tr of trs) {
    if (tr.hold) continue;
    const z = zonesOf(tr.zones);
    let leftX = -Infinity;
    let rightX = Infinity;
    for (const p of walls) {
      if (!share(p.zones, z)) continue;
      const [x0, y0] = p.a;
      const [x1, y1] = p.b;
      if (y0 === y1 || tr.at[1] < Math.min(y0, y1) || tr.at[1] > Math.max(y0, y1)) continue;
      const x = x0 + ((tr.at[1] - y0) / (y1 - y0)) * (x1 - x0);
      if (x <= tr.at[0]) leftX = Math.max(leftX, x);
      else rightX = Math.min(rightX, x);
    }
    const width = rightX - leftX;
    if (!(width < LINT.laneWidth * d)) continue; // open space, not a lane
    if (width < d + LINT.laneMin) bad("lane-width", `trigger "${tr.id}" lies in a lane ${width.toFixed(1)} mm wide, narrower than a ball plus ${LINT.laneMin} mm`);
    if (width > d + LINT.laneMax) bad("lane-width", `trigger "${tr.id}" lies in a lane ${width.toFixed(1)} mm wide, wider than a ball plus ${LINT.laneMax} mm`);
  }

  return out;
}
