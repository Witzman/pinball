import type { Ball } from "../core/types";
import { step } from "../core/step";
import { loadTable, makeBall } from "../table/load";
import type { LoadedTable } from "../table/load";
import type { TableDef } from "../table/schema";

/** Buttons held right now; set by the input layer. */
export interface GameInput {
  left: boolean;
  right: boolean;
  plunge: boolean;
}

export interface Game {
  table: LoadedTable;
  input: GameInput;
  paused: boolean;
  /** Milliseconds not yet turned into physics ticks. */
  accMs: number;
  /** Balls lost down the drain (placeholder until ball flow, #11). */
  drains: number;
}

/** One physics tick in milliseconds; a longer frame is cut to MAX_FRAME_MS. */
const TICK_MS = 1;
const MAX_FRAME_MS = 50;
/** A ball this far below the playfield (m) has drained. */
const DRAIN_MARGIN = 0.03;

export function createGame(def: TableDef): Game {
  const table = loadTable(def);
  const g: Game = { table, input: { left: false, right: false, plunge: false }, paused: false, accMs: 0, drains: 0 };
  table.world.balls.push(newBall(g));
  return g;
}

/** A ball resting on the plunger face, or mid-table if the table has no plunger. */
function newBall(g: Game): Ball {
  const p = g.table.world.plunger;
  if (!p) return makeBall(g.table, (g.table.playfieldWidth * 1000) / 2, 100);
  const cx = p.x - p.dirx * p.pos;
  const cy = p.y - p.diry * p.pos;
  const gap = g.table.ballRadius + 1e-4;
  return { ...makeBall(g.table, 0, 0), x: cx + p.dirx * gap, y: cy + p.diry * gap };
}

export function setPaused(g: Game, paused: boolean): void {
  g.paused = paused;
}

function applyInput(g: Game): void {
  const w = g.table.world;
  const l = g.table.flipperIds.indexOf("left");
  const r = g.table.flipperIds.indexOf("right");
  if (l >= 0) w.flippers[l]!.on = g.input.left;
  if (r >= 0) w.flippers[r]!.on = g.input.right;
  if (w.plunger) w.plunger.pull = g.input.plunge ? 1 : 0;
}

/** Runs the physics for `dtMs` of real time, in whole ticks; the remainder carries over. */
export function advance(g: Game, dtMs: number): void {
  if (g.paused) return;
  g.accMs += Math.min(dtMs, MAX_FRAME_MS);
  const w = g.table.world;
  while (g.accMs >= TICK_MS) {
    applyInput(g);
    step(w);
    g.accMs -= TICK_MS;
    for (let i = 0; i < w.balls.length; i++) {
      if (w.balls[i]!.y > g.table.playfieldLength + DRAIN_MARGIN) {
        w.balls[i] = newBall(g);
        g.drains += 1;
      }
    }
  }
}

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
}

/** Everything the renderer needs, as plain data. */
export interface Snapshot {
  tick: number;
  balls: { x: number; y: number; r: number }[];
  flippers: FlipperView[];
  plunger: { x: number; y: number; dirx: number; diry: number; halfWidth: number; pos: number } | null;
}

export function snapshot(g: Game): Snapshot {
  const w = g.table.world;
  const p = w.plunger;
  return {
    tick: w.tick,
    balls: w.balls.map((b) => ({ x: b.x, y: b.y, r: b.r })),
    flippers: w.flippers.map((f) => ({ px: f.px, py: f.py, tx: f.tx, ty: f.ty, dx: f.dx, dy: f.dy, k: f.k, cs: f.cs, r0: f.r0, r1: f.r1 })),
    plunger: p ? { x: p.x, y: p.y, dirx: p.dirx, diry: p.diry, halfWidth: p.halfWidth, pos: p.pos } : null,
  };
}
