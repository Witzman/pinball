import type { Ball, Circle, Segment, World } from "./types";

export interface WorldInit {
  balls: Ball[];
  segments: Segment[];
  circles: Circle[];
  gravity: number;
}

export function createWorld(init: WorldInit): World {
  return { ...init, tick: 0 };
}

/** Gravity along the playfield for a slope in degrees. Load time only: sin is not allowed in the step. */
export function slopeGravity(degrees: number): number {
  return 9.81 * Math.sin((degrees * Math.PI) / 180);
}
