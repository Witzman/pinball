import { buildGrid } from "./grid";
import { POSE_POINTS, poseFlipper } from "./flipper";
import type { Ball, Circle, ContactBuffer, Flipper, Gate, Magnet, Plunger, Segment, Trigger, World } from "./types";

export const CONTACT_CAPACITY = 64;

function contactBuffer(): ContactBuffer {
  return {
    n: 0,
    tick: new Int32Array(CONTACT_CAPACITY),
    ball: new Int32Array(CONTACT_CAPACITY),
    sw: new Int32Array(CONTACT_CAPACITY),
    impulse: new Float64Array(CONTACT_CAPACITY),
    kind: new Uint8Array(CONTACT_CAPACITY),
  };
}

export interface WorldInit {
  balls: Ball[];
  segments: Segment[];
  circles: Circle[];
  gates?: Gate[];
  triggers?: Trigger[];
  magnets?: Magnet[];
  flippers?: Flipper[];
  plunger?: Plunger | null;
  gravity: number;
  drag?: number;
  spinDamping?: number;
}

/** Colliders are static after this call: the grid is built here, once. */
export function createWorld(init: WorldInit): World {
  return { ...init, gates: init.gates ?? [], triggers: init.triggers ?? [], magnets: init.magnets ?? [], flippers: init.flippers ?? [], plunger: init.plunger ?? null, drag: init.drag ?? 0, spinDamping: init.spinDamping ?? 0, grid: buildGrid(init.segments, init.circles), contacts: contactBuffer(), tick: 0 };
}

/** Gravity along the playfield for a slope in degrees. Load time only: sin is not allowed in the step. */
export function slopeGravity(degrees: number): number {
  return 9.81 * Math.sin((degrees * Math.PI) / 180);
}

export interface FlipperInit {
  px: number;
  py: number;
  length: number;
  r0: number;
  r1: number;
  /** Angles in radians, in the table's x-right, y-down plane: axis = (cos, sin). */
  restRad: number;
  activeRad: number;
  /** Seconds to swing rest -> raised, and back. */
  upTime: number;
  downTime: number;
  e: number;
  mu: number;
}

/** Load time only: builds the angle table with sin and cos. */
export function makeFlipper(i: FlipperInit): Flipper {
  const cosT = new Float64Array(POSE_POINTS);
  const sinT = new Float64Array(POSE_POINTS);
  for (let n = 0; n < POSE_POINTS; n++) {
    const a = i.restRad + ((i.activeRad - i.restRad) * n) / (POSE_POINTS - 1);
    cosT[n] = Math.cos(a);
    sinT[n] = Math.sin(a);
  }
  const k = (i.r0 - i.r1) / i.length;
  const f: Flipper = {
    px: i.px, py: i.py, length: i.length, r0: i.r0, r1: i.r1,
    k, cs: Math.sqrt(1 - k * k), tlen: Math.sqrt(i.length * i.length - (i.r0 - i.r1) * (i.r0 - i.r1)),
    theta0: i.restRad, theta1: i.activeRad, cosT, sinT,
    u: 0, on: false, upRate: 1 / i.upTime, downRate: 1 / i.downTime, e: i.e, mu: i.mu,
    dx: 0, dy: 0, tx: 0, ty: 0, omega: 0,
  };
  poseFlipper(f);
  return f;
}

export interface PlungerInit {
  x: number;
  y: number;
  /** Launch direction; normalised here. */
  dirx: number;
  diry: number;
  halfWidth: number;
  stroke: number;
  maxSpeed: number;
  pullSpeed: number;
  e: number;
  mu: number;
}

export function makePlunger(i: PlungerInit): Plunger {
  const n = Math.sqrt(i.dirx * i.dirx + i.diry * i.diry);
  return {
    x: i.x, y: i.y, dirx: i.dirx / n, diry: i.diry / n, halfWidth: i.halfWidth, stroke: i.stroke,
    maxSpeed: i.maxSpeed, pullSpeed: i.pullSpeed, e: i.e, mu: i.mu, pos: 0, vel: 0, pull: 0, releaseV: 0,
  };
}
