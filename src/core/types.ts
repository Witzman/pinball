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
  /** 0 = free; i + 1 = held in the sinkhole `triggers[i]` and not simulated until kicked out. */
  hold: number;
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
  /** Switch id (1-based index into the table's switch names); 0 = no switch. */
  sw: number;
  /**
   * One-way wall: only blocks a ball on the side the normal (-dy, dx) of a->b
   * points to. A ball behind it passes through; once in front it cannot return.
   */
  oneWay?: boolean;
  /** Kicker (#49): the ball leaves with at least this normal speed, m/s. Absent = a passive wall. */
  kick?: number;
  /** A hit slower than this (m/s along the normal) does not kick. */
  kickMin?: number;
  /** Ticks after a kick in which the next hit is a plain bounce. */
  kickCd?: number;
  /** Index into `World.kickWait`; the chords of one polyline or arc share it. */
  kid?: number;
  /** Drop target (#50): 1 + the index into `World.down`; while that flag is set the wall does not exist. Absent = always there. */
  drop?: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
  e: number;
  mu: number;
  zoneMask: number;
  sw: number;
  /** Kicker fields, as on Segment. */
  kick?: number;
  kickMin?: number;
  kickCd?: number;
  kid?: number;
  /** Drop target, as on Segment. */
  drop?: number;
}

/**
 * A flipper: a tapered capsule (radius r0 at the pivot, r1 at the tip) that
 * swings between two angles. Kinematic: balls move it never. The pose follows
 * the swing progress `u` (0 rest, 1 raised) through a table built at load, so
 * the step needs no trigonometry.
 */
export interface Flipper {
  px: number;
  py: number;
  length: number;
  r0: number;
  r1: number;
  /** (r0 - r1) / length, and sqrt(1 - k^2): the side lines' tilt. Constant. */
  k: number;
  cs: number;
  /** Length of a side line between its tangent points. Constant. */
  tlen: number;
  theta0: number;
  theta1: number;
  /** cos and sin of the angle at u = i / (N - 1) for i = 0..N-1. */
  cosT: Float64Array;
  sinT: Float64Array;
  /** Swing progress 0..1. */
  u: number;
  /** Button held. */
  on: boolean;
  /** Swing speeds in u per second. */
  upRate: number;
  downRate: number;
  e: number;
  mu: number;
  /** Current axis (unit), tip position and angular velocity (rad/s). Derived from u. */
  dx: number;
  dy: number;
  tx: number;
  ty: number;
  omega: number;
}

/**
 * A spring plunger: a flat face that is pulled back along its axis and flies
 * forward when released, launching a ball resting on it.
 */
export interface Plunger {
  /** Face centre at rest. */
  x: number;
  y: number;
  /** Unit launch direction. */
  dirx: number;
  diry: number;
  halfWidth: number;
  stroke: number;
  /** Forward speed after a full pull, m/s. */
  maxSpeed: number;
  /** Speed of pulling back, m/s. */
  pullSpeed: number;
  e: number;
  mu: number;
  /** How far the face is pulled back, 0..stroke. */
  pos: number;
  /** Forward velocity of the face along the launch direction. */
  vel: number;
  /** Wanted pull 0..1, set by the input layer. */
  pull: number;
  /** Forward speed of the current release. */
  releaseV: number;
}

/**
 * A height-zone gate: a line a->b. A ball whose path crosses it from the left
 * of a->b (cross(b - a, p - a) > 0, side A) to the right (side B) and is in
 * `zoneA` moves to `zoneB`; crossing back from B in `zoneB` moves it to `zoneA`.
 * Ramp mouths and exits are gates. The crossing is tested on the straight line
 * from where the ball was at the start of the tick to where it ends it, and the
 * zone changes at the end of the tick: a bounce next to a gate within one tick
 * can misjudge it by a few millimetres.
 */
export interface Gate {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  zoneA: number;
  zoneB: number;
  /** Switch id reported on a crossing; 0 = none. */
  sw: number;
}

/**
 * A round trigger area. A ball whose centre enters it (in a matching zone) is
 * reported on `sw`. A `hold` trigger is a sinkhole: it also captures the ball at
 * its centre and keeps it there until `kickHeld` sends it out.
 */
export interface Trigger {
  x: number;
  y: number;
  r: number;
  zoneMask: number;
  /** Switch id reported on entry; 0 = none. */
  sw: number;
  hold: boolean;
  /** Unit direction and speed (m/s) of the kick-out. */
  kickx: number;
  kicky: number;
  kickSpeed: number;
}

/**
 * A magnet: while `on`, a ball in a matching zone within `r` of the centre is
 * pulled towards it with an acceleration that falls linearly from `strength`
 * (m/s^2) at the centre to 0 at the edge. The rules switch it on and off.
 */
export interface Magnet {
  x: number;
  y: number;
  r: number;
  strength: number;
  zoneMask: number;
  on: boolean;
}

/** What a contact record means. */
export const CONTACT_HIT = 0;
export const CONTACT_GATE_AB = 1;
export const CONTACT_GATE_BA = 2;
/** A ball entered a rollover trigger. */
export const CONTACT_TRIGGER = 3;
/** A ball was captured by a sinkhole. */
export const CONTACT_CAPTURE = 4;
/** A kicker pushed the ball (#49); recorded instead of CONTACT_HIT for that hit. */
export const CONTACT_KICK = 5;

/** Events on switches, in the order they happened. Cleared every step. */
export interface ContactBuffer {
  n: number;
  tick: Int32Array;
  ball: Int32Array;
  sw: Int32Array;
  /** Normal impulse in N*s; 0 for events that are not collisions. */
  impulse: Float64Array;
  /** One of the CONTACT_* kinds. */
  kind: Uint8Array;
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
  gates: Gate[];
  triggers: Trigger[];
  magnets: Magnet[];
  flippers: Flipper[];
  plunger: Plunger | null;
  /** Effective gravity along +y, m/s^2 (already projected for the slope). */
  gravity: number;
  /** Rolling drag, 1/s: speed decays as exp(-drag t). 0 = none. */
  drag: number;
  /** Spin damping, 1/s: spin decays as exp(-spinDamping t). 0 = none. */
  spinDamping: number;
  /** Ticks left of each kicker's cooldown (index = `kid`); empty without kickers. */
  kickWait: Int32Array;
  /** Drop targets (#50): 1 = down, per target, in the order of `LoadedTable.dropIds`; all up (0) at the start. Empty without drop targets. */
  down: Uint8Array;
  grid: Grid;
  contacts: ContactBuffer;
  tick: number;
}
