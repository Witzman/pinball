import { createGame, tick } from "../../src/sim/game";
import type { Game } from "../../src/sim/game";
import type { TableDef } from "../../src/table/schema";

/** Puts the (only) ball at rest at (x, y) mm, in the playfield zone. */
export function dropAt(g: Game, x: number, y: number): void {
  Object.assign(g.table.world.balls[0]!, { x: x / 1000, y: y / 1000, vx: 0, vy: 0, zone: 0 });
}

/**
 * Whether a ball centre at (x, y) mm would overlap a wall, a post or a resting flipper, or sit
 * exactly above a wall end: spawn artifacts, not places a game reaches.
 */
export function insideSolid(g: Game, def: TableDef, x: number, y: number): boolean {
  const r = g.table.ballRadius * 1000;
  const near = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < r;
  };
  const w = g.table.world;
  if (w.segments.some((s) => near(s.ax * 1000, s.ay * 1000, s.bx * 1000, s.by * 1000))) return true;
  // a ball centred exactly above the end of a wall balances on it: a knife edge, not a place a game reaches
  if (w.segments.some((s) => [[s.ax, s.ay], [s.bx, s.by]].some(([px, py]) => Math.abs(x - px! * 1000) < 2 && py! * 1000 > y))) return true;
  if (w.circles.some((c) => Math.hypot(x - c.x * 1000, y - c.y * 1000) < r + c.r * 1000)) return true;
  return def.flippers.some((f) => {
    const a = (f.restDeg * Math.PI) / 180;
    return near(f.pivot[0], f.pivot[1], f.pivot[0] + f.length * Math.cos(a), f.pivot[1] + f.length * Math.sin(a));
  });
}

/** Ticks until the ball drains, at most `max`; true if it did. */
export function drainsWithin(g: Game, max = 25000): boolean {
  const before = g.drains;
  for (let i = 0; i < max && g.drains === before; i++) tick(g);
  return g.drains > before;
}

export interface RestGridOptions {
  /** Grid from (x0, y0) to (x1, y1) mm in steps; the defaults cover a playfield of the usual size. */
  x?: [number, number, number];
  y?: [number, number, number];
  /** Ticks to wait for the drain before a ball counts as resting for ever. */
  ticks?: number;
  /** Points to leave out (places a ball cannot reach, such as a sealed corner). Points inside a wall are always left out. */
  skip?: (x: number, y: number) => boolean;
  /** Makes the game for each drop; the default is a plain `createGame(def)`. A table with sinkholes needs its rules, which let the ball out again. */
  create?: (def: TableDef) => Game;
  /** Changes the table state before each drop: a drop target down, a magnet on, a sinkhole full. */
  setup?: (g: Game) => void;
}

/**
 * The generic no-resting-place check (#52): a ball dropped at rest on every point of a grid must
 * drain, flippers down. Returns the points where it did not, as "(x,y)" strings; empty means none.
 * Any table can run it, in as many states as `setup` can put it in.
 */
export function restGrid(def: TableDef, opts: RestGridOptions = {}): string[] {
  const [x0, x1, dx] = opts.x ?? [23, 470, 31];
  const [y0, y1, dy] = opts.y ?? [40, 980, 47];
  const stuck: string[] = [];
  for (let y = y0; y <= y1; y += dy) {
    for (let x = x0; x <= x1; x += dx) {
      const g = opts.create ? opts.create(def) : createGame(def);
      if (opts.skip?.(x, y) || insideSolid(g, def, x, y)) continue;
      opts.setup?.(g);
      dropAt(g, x, y);
      if (!drainsWithin(g, opts.ticks)) stuck.push(`(${x},${y})`);
    }
  }
  return stuck;
}
