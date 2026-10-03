// A table is typed data. Lengths in millimetres, angles in degrees, masses in
// grams; the loader converts to SI. Scripts (rules.ts) are separate modules.

export type Point = [number, number];

export interface Material {
  /** Restitution, 0..1. */
  e: number;
  /** Friction coefficient, >= 0. */
  mu: number;
}

/**
 * A kicker (#49): a slingshot or a pop bumper. A ball that hits it at least `minHit` m/s
 * along the normal, outside the cooldown, leaves with a normal speed of at least `speed`
 * (the larger of the usual bounce and `speed`: the push does not depend on how hard the
 * ball came). On a polyline or arc every chord kicks, and they share one cooldown.
 */
export interface KickDef {
  /** m/s, 0 < speed <= 6. */
  speed: number;
  /** m/s, default 0.3; at least 0.1 (above the rest speed) and at most `speed`. */
  minHit?: number;
  /** ms from one kick to the next, integer 1..1000, default 30 (counted in whole ticks: give or take 1 ms). A ball between two facing kickers bounces for ever at the kick speed: a layout must not make that pocket. */
  cooldownMs?: number;
}

interface WallBase {
  material: string;
  /** Heights this wall exists in; default [0] (the playfield). */
  zones?: number[];
  /** Name of the switch hits on this wall count for. */
  switch?: string;
  /** Set on every collider that deliberately shares one switch name. */
  shared?: boolean;
  /**
   * One-way wall: blocks only on the side its normal points to, where the normal
   * of a segment a->b is (-dy, dx) (a->b pointing left gives a normal pointing up
   * the table). A ball behind it passes through and cannot come back.
   */
  oneWay?: boolean;
  kick?: KickDef;
}

export interface SegmentDef extends WallBase {
  type: "segment";
  a: Point;
  b: Point;
}

export interface PolylineDef extends WallBase {
  type: "polyline";
  points: Point[];
  closed?: boolean;
}

export interface ArcDef extends WallBase {
  type: "arc";
  c: Point;
  r: number;
  /** Start and end angle in degrees, counter-clockwise from +x; may run either way. */
  from: number;
  to: number;
  /** Number of straight chords the arc becomes; default 16. */
  chords?: number;
}

export type WallDef = SegmentDef | PolylineDef | ArcDef;

export interface PostDef {
  at: Point;
  r: number;
  material: string;
  zones?: number[];
  switch?: string;
  shared?: boolean;
  kick?: KickDef;
}

/**
 * A height-zone gate, a line a->b. A ball crossing it from the left of a->b (the
 * side where cross(b - a, p - a) > 0) while in zoneA moves to zoneB, and back.
 * Walls with `zones` exist only at their height; gates join the heights, so a
 * ramp is walls in its zone plus a gate at its mouth and one at its exit.
 */
export interface GateDef {
  a: Point;
  b: Point;
  zoneA: number;
  zoneB: number;
  /** Switch reported on every crossing (direction is in the contact record). */
  switch?: string;
  shared?: boolean;
}

/**
 * A round area on the playfield: a rollover, lane or sinkhole. A ball whose
 * centre enters it is reported on `switch`. With `hold` it is a sinkhole: the
 * ball is captured at the centre and stays until the rules kick it out.
 */
export interface TriggerDef {
  /** Unique name; the rules address a sinkhole by it. */
  id: string;
  at: Point;
  r: number;
  /** Heights this trigger exists in; default [0]. */
  zones?: number[];
  /** Reported on every entry (capture, for a sinkhole). Required: the event is the point. */
  switch: string;
  shared?: boolean;
  /** Makes it a sinkhole. Direction in degrees in the table plane (x right, y down; up the table is -90), speed in m/s. */
  hold?: { kickDeg: number; kickSpeed: number };
}

/**
 * A magnet the rules switch on and off by id. While on, a ball within `r` of the
 * centre is pulled towards it, strongest at the centre (`strength` in m/s^2, the
 * table's gravity along the slope is about 1.1) and fading linearly to nothing at `r`.
 */
export interface MagnetDef {
  id: string;
  at: Point;
  r: number;
  strength: number;
  /** Heights this magnet reaches; default [0]. */
  zones?: number[];
}

export interface FlipperDef {
  id: string;
  /** Pivot centre. */
  pivot: Point;
  length: number;
  /** Radius at the pivot and at the tip. */
  rBase: number;
  rTip: number;
  /** Axis angle at rest and when raised, degrees, in the table plane (x right, y down). */
  restDeg: number;
  activeDeg: number;
  /** Swing time rest -> raised, and back, milliseconds. */
  upMs: number;
  downMs: number;
  material: string;
  /**
   * Which flipper button swings it (#51): a flipper whose id is "left" or "right" follows that
   * button; any other id follows no button unless it says so here (an upper flipper follows the
   * left one). A flipper that follows nothing never moves.
   */
  input?: "left" | "right";
}

export interface PlungerDef {
  /** Centre of the plunger face at rest. */
  at: Point;
  /** Launch direction in degrees in the table plane (x right, y down); up the table is -90. */
  dirDeg: number;
  /** Face width, mm. */
  width: number;
  /** How far it can be pulled back, mm. */
  stroke: number;
  /** Forward speed after a full pull, and speed of pulling back, m/s. */
  maxSpeed: number;
  pullSpeed: number;
  material: string;
}

/**
 * How a table looks in height; presentation only, physics keeps its 2D zones (#21).
 * `heights[zone]` is the height of the ball centre's level above the playfield, mm
 * (index 0 is the playfield and must be 0). A ramp is drawn along `path` (its centre
 * line) with `width`; its walls and gates are still ordinary walls and gates.
 */
export interface VisualDef {
  heights?: number[];
  ramps?: {
    zone: number;
    path: Point[];
    width: number;
    /** Height of the ball level above the playfield at each path point, mm: a ramp that rises (or falls). Without it the ramp lies at the height of its zone. */
    heights?: number[];
  }[];
}

/** How a table can say a switch should sound (#15). */
export const SOUND_CLASSES = ["pop", "sling", "rollover", "target", "wall"] as const;
export type SoundClass = (typeof SOUND_CLASSES)[number];

export interface TableDef {
  id: string;
  name: string;
  playfield: { width: number; length: number; slopeDeg: number };
  ball: { radius: number; mass: number };
  materials: Record<string, Material>;
  walls: WallDef[];
  posts: PostDef[];
  gates?: GateDef[];
  triggers?: TriggerDef[];
  magnets?: MagnetDef[];
  flippers: FlipperDef[];
  plunger?: PlungerDef;
  visual?: VisualDef;
  /** How a switch sounds (#15): a class per switch name; without one the sound layer picks by what was hit. */
  sounds?: Record<string, SoundClass>;
  /** Named shots: ordered lists of switch names the rules treat as one shot. */
  shots: Record<string, string[]>;
}
