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
    plunger: { e: 0.2, mu: 0 },
  },
  walls: [
    // outer box
    { type: "polyline", points: [[5, 5], [515, 5], [515, 1045], [5, 1045]], closed: true, material: "metal" },
    // a guide and an arc
    { type: "segment", a: [5, 800], b: [180, 900], material: "rubber" },
    { type: "arc", c: [260, 260], r: 240, from: 200, to: 340, chords: 24, material: "metal" },
    // plunger lane, open at the top
    { type: "segment", a: [483, 1045], b: [483, 250], material: "metal" },
    // one-way flap across the lane: the ball goes up through it and cannot roll back down
    { type: "segment", a: [515, 300], b: [483, 300], material: "metal", oneWay: true },
    // deflector at the top of the lane: steers the ball left, into the playfield
    { type: "segment", a: [420, 30], b: [515, 125], material: "metal" },
    // a standup target
    { type: "segment", a: [300, 500], b: [380, 500], material: "rubber", switch: "target1" },
  ],
  posts: [
    { at: [200, 400], r: 12, material: "rubber" },
    { at: [320, 420], r: 12, material: "rubber" },
  ],
  plunger: { at: [499, 1030], dirDeg: -90, width: 32, stroke: 80, maxSpeed: 5, pullSpeed: 0.2, material: "plunger" },
  flippers: [
    { id: "left", pivot: [150, 900], length: 60, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -30, upMs: 40, downMs: 100, material: "rubber" },
    { id: "right", pivot: [370, 900], length: 60, rBase: 9.5, rTip: 5, restDeg: 150, activeDeg: 210, upMs: 40, downMs: 100, material: "rubber" },
  ],
  shots: { target: ["target1"] },
};
