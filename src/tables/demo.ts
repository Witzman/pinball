import type { TableDef } from "../table/schema";

/** A small proving ground for the table pipeline. Not the game table (that is #25). */
export const demoTable: TableDef = {
  id: "demo",
  name: "Proving Ground",
  playfield: { width: 520, length: 1050, slopeDeg: 6.5 },
  ball: { radius: 13.5, mass: 80 },
  materials: {
    rubber: { e: 0.6, mu: 0.3 },
    metal: { e: 0.4, mu: 0.1 },
  },
  walls: [
    // outer box
    { type: "polyline", points: [[5, 5], [515, 5], [515, 1045], [5, 1045]], closed: true, material: "metal" },
    // a guide and an arc
    { type: "segment", a: [5, 800], b: [180, 900], material: "rubber" },
    { type: "arc", c: [260, 260], r: 240, from: 200, to: 340, chords: 24, material: "metal" },
    // a standup target
    { type: "segment", a: [300, 500], b: [380, 500], material: "rubber", switch: "target1" },
  ],
  posts: [
    { at: [200, 400], r: 12, material: "rubber" },
    { at: [320, 420], r: 12, material: "rubber" },
  ],
  shots: { target: ["target1"] },
};
