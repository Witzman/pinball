import type { LitState } from "../rules";
import type { LoadedTable } from "../table/load";
import { cameraFor } from "./camera";
import type { AudioEvent } from "./audio-events";
import type { Game } from "./game";

// What a renderer sees (issue #21): plain data, JSON-serialisable, metres, +y down the
// playfield. A renderer reads a StaticScene (once per table) and a snapshot (per frame)
// and nothing else: not the world, not the rules.

export interface FlipperView {
  px: number;
  py: number;
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  k: number;
  cs: number;
  r0: number;
  r1: number;
  /** The button is held. */
  up: boolean;
}

/** Where the view looks. A renderer decides how to draw it; the canvas placeholder only knows "top". */
export interface Camera {
  mode: "top" | "tilted";
  /** Look-at point, metres. */
  cx: number;
  cy: number;
  /** Playfield widths visible per screen width; 1 = the whole playfield fits. */
  zoom: number;
  /** 0 = straight down. */
  pitchDeg: number;
  yawDeg: number;
  fovDeg: number;
}

/** Everything the renderer needs of one moment, as plain data. */
export interface Snapshot {
  /** Simulation milliseconds: the only clock a renderer may use. */
  tick: number;
  paused: boolean;
  broken: boolean;
  balls: { id: number; x: number; y: number; r: number; vx: number; vy: number; w: number; zone: number; z: number }[];
  flippers: FlipperView[];
  plunger: { x: number; y: number; dirx: number; diry: number; halfWidth: number; pos: number } | null;
  magnets: { x: number; y: number; r: number; on: boolean }[];
  lamps: Record<string, LitState>;
  /** The text the player reads, and what it depends on; built by the app from the rules state. */
  hud: { lines: string[]; tilted: boolean; phase: string };
  /** Switches hit since the last snapshot, for flashes and the like: `s` is the strength 0..1. */
  hits: { sw: string; s: number; kick: boolean }[];
  camera: Camera;
}

/** What never changes while a table is loaded. */
export interface StaticScene {
  width: number;
  length: number;
  walls: { ax: number; ay: number; bx: number; by: number; kind: "wall" | "rubber" | "switch"; zoneMask: number; sw: string | null }[];
  posts: { x: number; y: number; r: number; kind: "post" | "switch"; zoneMask: number; /** The switch it reports, for effects; null if none. */ sw: string | null }[];
  triggers: { id: string; x: number; y: number; r: number; hold: boolean }[];
  /** Height of each zone's level above the playfield, metres. */
  heights: number[];
  ramps: { zone: number; path: { x: number; y: number }[]; width: number; /** Height of the ball level at each path point, metres. */ heights: number[] }[];
}


export function buildScene(table: LoadedTable): StaticScene {
  const w = table.world;
  return {
    width: table.playfieldWidth,
    length: table.playfieldLength,
    walls: w.segments.map((s) => ({ ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, kind: s.sw > 0 ? "switch" : s.e > 0.5 ? "rubber" : "wall", zoneMask: s.zoneMask, sw: s.sw > 0 ? table.switchNames[s.sw - 1]! : null })),
    posts: w.circles.map((c) => ({ x: c.x, y: c.y, r: c.r, kind: c.sw > 0 ? "switch" : "post", zoneMask: c.zoneMask, sw: c.sw > 0 ? table.switchNames[c.sw - 1]! : null })),
    triggers: w.triggers.map((t, i) => ({ id: table.triggerIds[i]!, x: t.x, y: t.y, r: t.r, hold: t.hold })),
    heights: [...table.heights],
    ramps: table.ramps.map((r) => ({ zone: r.zone, width: r.width, path: r.path.map((q) => ({ ...q })), heights: [...r.heights] })),
  };
}

/**
 * How high a ball in the ramp zone is: along the ramp whose centre line is nearest to it, the
 * height interpolated between the path points (a ramp that rises lifts the ball smoothly);
 * a ball on the playfield, or in a zone without a ramp, is at the height of its zone.
 */
export function ballHeight(table: LoadedTable, b: { x: number; y: number; zone: number }): number {
  const flat = table.heights[b.zone] ?? 0;
  if (b.zone === 0) return flat;
  let best = Infinity;
  let h = flat;
  for (const r of table.ramps) {
    if (r.zone !== b.zone) continue;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!;
      const c = r.path[i]!;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((b.x - a.x) * dx + (b.y - a.y) * dy) / len2));
      const d2 = (b.x - (a.x + t * dx)) ** 2 + (b.y - (a.y + t * dy)) ** 2;
      if (d2 < best) {
        best = d2;
        h = r.heights[i - 1]! + (r.heights[i]! - r.heights[i - 1]!) * t;
      }
    }
  }
  return h;
}

/** A copy of the moment: nothing in it points into the game. `hudLines` is what the app wants on screen; `cameraMode` picks the view. */
export function snapshot(g: Game, hudLines: readonly string[] = [], cameraMode: Camera["mode"] = "top", events: readonly AudioEvent[] = []): Snapshot {
  const w = g.table.world;
  const p = w.plunger;
  const game = g.rules.state.game;
  return {
    tick: w.tick,
    paused: g.paused,
    broken: g.broken !== null,
    balls: w.balls.map((b, id) => ({ id, x: b.x, y: b.y, r: b.r, vx: b.vx, vy: b.vy, w: b.w, zone: b.zone, z: ballHeight(g.table, b) })),
    flippers: w.flippers.map((f) => ({ px: f.px, py: f.py, tx: f.tx, ty: f.ty, dx: f.dx, dy: f.dy, k: f.k, cs: f.cs, r0: f.r0, r1: f.r1, up: f.on })),
    plunger: p ? { x: p.x, y: p.y, dirx: p.dirx, diry: p.diry, halfWidth: p.halfWidth, pos: p.pos } : null,
    magnets: w.magnets.map((m) => ({ x: m.x, y: m.y, r: m.r, on: m.on })),
    lamps: { ...g.rules.state.lamps },
    hud: { lines: [...hudLines], tilted: game?.tilted === true, phase: game?.phase ?? "" },
    hits: events.flatMap((e) => (e.a === "switch" ? [{ sw: e.sw, s: e.s, kick: e.kind === "kick" }] : [])),
    camera: cameraFor(cameraMode, g.table.playfieldWidth, g.table.playfieldLength, g.table.world.balls[0] ?? null),
  };
}
