import type { LitState } from "../rules";
import type { LoadedTable } from "../table/load";
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
  balls: { id: number; x: number; y: number; r: number; vx: number; vy: number; w: number; zone: number }[];
  flippers: FlipperView[];
  plunger: { x: number; y: number; dirx: number; diry: number; halfWidth: number; pos: number } | null;
  magnets: { x: number; y: number; r: number; on: boolean }[];
  lamps: Record<string, LitState>;
  /** The text the player reads, and what it depends on; built by the app from the rules state. */
  hud: { lines: string[]; tilted: boolean; phase: string };
  camera: Camera;
}

/** What never changes while a table is loaded. */
export interface StaticScene {
  width: number;
  length: number;
  walls: { ax: number; ay: number; bx: number; by: number; kind: "wall" | "rubber" | "switch"; zoneMask: number }[];
  posts: { x: number; y: number; r: number; kind: "post" | "switch"; zoneMask: number }[];
  triggers: { x: number; y: number; r: number; hold: boolean }[];
}

/** The whole playfield seen from straight above. */
export function topCamera(width: number, length: number): Camera {
  return { mode: "top", cx: width / 2, cy: length / 2, zoom: 1, pitchDeg: 0, yawDeg: 0, fovDeg: 0 };
}

export function buildScene(table: LoadedTable): StaticScene {
  const w = table.world;
  return {
    width: table.playfieldWidth,
    length: table.playfieldLength,
    walls: w.segments.map((s) => ({ ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, kind: s.sw > 0 ? "switch" : s.e > 0.5 ? "rubber" : "wall", zoneMask: s.zoneMask })),
    posts: w.circles.map((c) => ({ x: c.x, y: c.y, r: c.r, kind: c.sw > 0 ? "switch" : "post", zoneMask: c.zoneMask })),
    triggers: w.triggers.map((t) => ({ x: t.x, y: t.y, r: t.r, hold: t.hold })),
  };
}

/** A copy of the moment: nothing in it points into the game. `hudLines` is what the app wants on screen. */
export function snapshot(g: Game, hudLines: readonly string[] = []): Snapshot {
  const w = g.table.world;
  const p = w.plunger;
  const game = g.rules.state.game;
  return {
    tick: w.tick,
    paused: g.paused,
    broken: g.broken !== null,
    balls: w.balls.map((b, id) => ({ id, x: b.x, y: b.y, r: b.r, vx: b.vx, vy: b.vy, w: b.w, zone: b.zone })),
    flippers: w.flippers.map((f) => ({ px: f.px, py: f.py, tx: f.tx, ty: f.ty, dx: f.dx, dy: f.dy, k: f.k, cs: f.cs, r0: f.r0, r1: f.r1, up: f.on })),
    plunger: p ? { x: p.x, y: p.y, dirx: p.dirx, diry: p.diry, halfWidth: p.halfWidth, pos: p.pos } : null,
    magnets: w.magnets.map((m) => ({ x: m.x, y: m.y, r: m.r, on: m.on })),
    lamps: { ...g.rules.state.lamps },
    hud: { lines: [...hudLines], tilted: game?.tilted === true, phase: game?.phase ?? "" },
    camera: topCamera(g.table.playfieldWidth, g.table.playfieldLength),
  };
}
