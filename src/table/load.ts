import { createWorld, makeFlipper, makePlunger, slopeGravity } from "../core/world";
import type { Ball, Circle, Gate, Magnet, Segment, Trigger, World } from "../core/types";
import type { Point, TableDef } from "./schema";
import { validateTable } from "./validate";

export interface LoadedTable {
  world: World;
  /** Flipper ids in the order of world.flippers. */
  flipperIds: string[];
  /** Trigger ids in the order of world.triggers. */
  triggerIds: string[];
  /** Magnet ids in the order of world.magnets. */
  magnetIds: string[];
  /** Switch names; a collider's `sw` is the 1-based index into this list. */
  switchNames: string[];
  /** Playfield size, metres. */
  playfieldWidth: number;
  playfieldLength: number;
  ballRadius: number;
  ballMass: number;
  /** Height of each zone's level above the playfield, metres; index = zone. Presentation only. */
  heights: number[];
  /** Drawn ramps (#21), metres. */
  ramps: { zone: number; path: { x: number; y: number }[]; width: number }[];
}

const MM = 1 / 1000;
const DEFAULT_CHORDS = 16;

function zoneMask(zones: number[] | undefined): number {
  let m = 0;
  for (const z of zones ?? [0]) m |= 1 << z;
  return m;
}

/** Load time only: sin and cos are allowed here, never in the step. */
function arcPoints(c: Point, r: number, from: number, to: number, chords: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= chords; i++) {
    const a = ((from + ((to - from) * i) / chords) * Math.PI) / 180;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

export function loadTable(def: TableDef): LoadedTable {
  const problems = validateTable(def);
  if (problems.length > 0) throw new Error(`invalid table:\n${problems.join("\n")}`);

  const switchNames: string[] = [];
  const swId = (name: string | undefined): number => {
    if (name === undefined) return 0;
    let i = switchNames.indexOf(name);
    if (i < 0) i = switchNames.push(name) - 1;
    return i + 1;
  };

  const segments: Segment[] = [];
  const circles: Circle[] = [];

  for (const w of def.walls) {
    const mat = def.materials[w.material]!;
    const base = { e: mat.e, mu: mat.mu, zoneMask: zoneMask(w.zones), sw: swId(w.switch), ...(w.oneWay === true ? { oneWay: true } : {}) };
    let pts: Point[];
    if (w.type === "segment") pts = [w.a, w.b];
    else if (w.type === "polyline") pts = w.closed ? [...w.points, w.points[0]!] : w.points;
    else pts = arcPoints(w.c, w.r, w.from, w.to, w.chords ?? DEFAULT_CHORDS);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      segments.push({ ax: p[0] * MM, ay: p[1] * MM, bx: q[0] * MM, by: q[1] * MM, ...base });
    }
  }

  for (const p of def.posts) {
    const mat = def.materials[p.material]!;
    circles.push({ x: p.at[0] * MM, y: p.at[1] * MM, r: p.r * MM, e: mat.e, mu: mat.mu, zoneMask: zoneMask(p.zones), sw: swId(p.switch) });
  }

  const gates: Gate[] = (def.gates ?? []).map((g) => ({
    ax: g.a[0] * MM, ay: g.a[1] * MM, bx: g.b[0] * MM, by: g.b[1] * MM, zoneA: g.zoneA, zoneB: g.zoneB, sw: swId(g.switch),
  }));

  const triggers: Trigger[] = (def.triggers ?? []).map((t) => {
    const a = ((t.hold?.kickDeg ?? 0) * Math.PI) / 180;
    return {
      x: t.at[0] * MM, y: t.at[1] * MM, r: t.r * MM, zoneMask: zoneMask(t.zones), sw: swId(t.switch), hold: t.hold !== undefined,
      kickx: Math.cos(a), kicky: Math.sin(a), kickSpeed: t.hold?.kickSpeed ?? 0,
    };
  });

  const magnets: Magnet[] = (def.magnets ?? []).map((m) => ({
    x: m.at[0] * MM, y: m.at[1] * MM, r: m.r * MM, strength: m.strength, zoneMask: zoneMask(m.zones), on: false,
  }));

  const flippers = def.flippers.map((f) => {
    const mat = def.materials[f.material]!;
    return makeFlipper({
      px: f.pivot[0] * MM, py: f.pivot[1] * MM, length: f.length * MM, r0: f.rBase * MM, r1: f.rTip * MM,
      restRad: (f.restDeg * Math.PI) / 180, activeRad: (f.activeDeg * Math.PI) / 180,
      upTime: f.upMs / 1000, downTime: f.downMs / 1000, e: mat.e, mu: mat.mu,
    });
  });

  const pl = def.plunger;
  const plunger = pl
    ? makePlunger({
        x: pl.at[0] * MM, y: pl.at[1] * MM,
        dirx: Math.cos((pl.dirDeg * Math.PI) / 180), diry: Math.sin((pl.dirDeg * Math.PI) / 180),
        halfWidth: (pl.width * MM) / 2, stroke: pl.stroke * MM, maxSpeed: pl.maxSpeed, pullSpeed: pl.pullSpeed,
        e: def.materials[pl.material]?.e ?? 0, mu: def.materials[pl.material]?.mu ?? 0,
      })
    : null;

  const world = createWorld({ balls: [], segments, circles, gates, triggers, magnets, flippers, plunger, gravity: slopeGravity(def.playfield.slopeDeg) });
  return { world, flipperIds: def.flippers.map((f) => f.id), triggerIds: (def.triggers ?? []).map((t) => t.id), magnetIds: (def.magnets ?? []).map((m) => m.id), switchNames, playfieldWidth: def.playfield.width * MM, playfieldLength: def.playfield.length * MM, ballRadius: def.ball.radius * MM, ballMass: def.ball.mass * MM, heights: (def.visual?.heights ?? []).map((h) => h * MM), ramps: (def.visual?.ramps ?? []).map((r) => ({ zone: r.zone, path: r.path.map((q) => ({ x: q[0] * MM, y: q[1] * MM })), width: r.width * MM })) };
}

/** A resting ball at (x, y) millimetres on the playfield. */
export function makeBall(t: LoadedTable, xMm: number, yMm: number): Ball {
  return { x: xMm * MM, y: yMm * MM, vx: 0, vy: 0, w: 0, r: t.ballRadius, m: t.ballMass, zone: 0, hold: 0 };
}
