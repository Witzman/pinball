// Physics state in SI units: metres, seconds, kilograms. Plain data only, so a
// world can be cloned and hashed. The +y axis points down the playfield.

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Spin about the axis normal to the playfield, rad/s, counter-clockwise. */
  w: number;
  r: number;
  m: number;
  /** Height zone: 0 playfield, 1+ ramp or habitrail. */
  zone: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Restitution. */
  e: number;
  /** Friction coefficient. */
  mu: number;
  /** Bit mask of the zones this collider exists in. */
  zoneMask: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
  e: number;
  mu: number;
  zoneMask: number;
}

/** Uniform grid over the static colliders (segments first, then circles), CSR layout. */
export interface Grid {
  minX: number;
  minY: number;
  cell: number;
  nx: number;
  ny: number;
  start: Int32Array;
  items: Int32Array;
  /** Scratch: last query that listed each collider, for de-duplication. */
  stamp: Int32Array;
  stampN: number;
  /** Scratch: result of `collect`, ascending and unique. */
  cand: Int32Array;
}

export interface World {
  balls: Ball[];
  segments: Segment[];
  circles: Circle[];
  /** Effective gravity along +y, m/s^2 (already projected for the slope). */
  gravity: number;
  /** Rolling drag, 1/s: speed decays as exp(-drag t). 0 = none. */
  drag: number;
  /** Spin damping, 1/s: spin decays as exp(-spinDamping t). 0 = none. */
  spinDamping: number;
  grid: Grid;
  tick: number;
}
