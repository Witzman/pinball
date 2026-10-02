// A table is typed data. Lengths in millimetres, angles in degrees, masses in
// grams; the loader converts to SI. Scripts (rules.ts) are separate modules.

export type Point = [number, number];

export interface Material {
  /** Restitution, 0..1. */
  e: number;
  /** Friction coefficient, >= 0. */
  mu: number;
}

interface WallBase {
  material: string;
  /** Heights this wall exists in; default [0] (the playfield). */
  zones?: number[];
  /** Name of the switch hits on this wall count for. */
  switch?: string;
  /** Set on every collider that deliberately shares one switch name. */
  shared?: boolean;
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

export interface TableDef {
  id: string;
  name: string;
  playfield: { width: number; length: number; slopeDeg: number };
  ball: { radius: number; mass: number };
  materials: Record<string, Material>;
  walls: WallDef[];
  posts: PostDef[];
  flippers: FlipperDef[];
  plunger?: PlungerDef;
  /** Named shots: ordered lists of switch names the rules treat as one shot. */
  shots: Record<string, string[]>;
}
