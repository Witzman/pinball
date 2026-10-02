import { buildGrid } from "./grid";
import type { Ball, Circle, ContactBuffer, Segment, World } from "./types";

export const CONTACT_CAPACITY = 64;

function contactBuffer(): ContactBuffer {
  return {
    n: 0,
    tick: new Int32Array(CONTACT_CAPACITY),
    ball: new Int32Array(CONTACT_CAPACITY),
    sw: new Int32Array(CONTACT_CAPACITY),
    impulse: new Float64Array(CONTACT_CAPACITY),
  };
}

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
  return { ...init, drag: init.drag ?? 0, spinDamping: init.spinDamping ?? 0, grid: buildGrid(init.segments, init.circles), contacts: contactBuffer(), tick: 0 };
}

/** Gravity along the playfield for a slope in degrees. Load time only: sin is not allowed in the step. */
export function slopeGravity(degrees: number): number {
  return 9.81 * Math.sin((degrees * Math.PI) / 180);
}
