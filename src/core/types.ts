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

export interface World {
  balls: Ball[];
  segments: Segment[];
  circles: Circle[];
  /** Effective gravity along +y, m/s^2 (already projected for the slope). */
  gravity: number;
  tick: number;
}
