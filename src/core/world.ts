import { buildGrid } from "./grid";
import type { Ball, Circle, Segment, World } from "./types";

export interface WorldInit {
  balls: Ball[];
  segments: Segment[];
  circles: Circle[];
  gravity: number;
  drag?: number;
  spinDamping?: number;
}

/** Colliders are static after this call: the grid is built here, once. */
export function createWorld(init: WorldInit): World {
  return { ...init, drag: init.drag ?? 0, spinDamping: init.spinDamping ?? 0, grid: buildGrid(init.segments, init.circles), tick: 0 };
}

/** Gravity along the playfield for a slope in degrees. Load time only: sin is not allowed in the step. */
export function slopeGravity(degrees: number): number {
  return 9.81 * Math.sin((degrees * Math.PI) / 180);
}
