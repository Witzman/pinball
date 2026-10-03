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
    // outer box: open at the bottom between the left wall and the plunger lane, so a ball the flippers miss falls out of the table (the drain)
    { type: "polyline", points: [[5, 1045], [5, 5], [515, 5], [515, 1045]], material: "metal" },
    // the floor of the plunger lane: the pulled plunger and its ball stop here
    { type: "segment", a: [483, 1045], b: [515, 1045], material: "metal" },
    // a guide and an arc
    { type: "segment", a: [5, 800], b: [180, 900], material: "rubber" },
    // and the same on the right, so a ball coming down beside the plunger lane reaches the right flipper instead of the drain
    { type: "segment", a: [483, 800], b: [340, 900], material: "rubber" },
    { type: "arc", c: [260, 260], r: 240, from: 200, to: 340, chords: 24, material: "metal" },
    // plunger lane, open at the top
    { type: "segment", a: [483, 1045], b: [483, 250], material: "metal" },
    // one-way flap across the lane: the ball goes up through it and cannot roll back down
    { type: "segment", a: [515, 205], b: [483, 250], material: "metal", oneWay: true },
    // deflector at the top of the lane: steers the ball left, into the playfield; it runs from the top wall to the right wall, so there is no pocket behind it for a ball to rest in
    { type: "segment", a: [395, 5], b: [515, 125], material: "metal" },
    // the rails of the ramp on the left (zone 1: a ball on the ramp touches only these)
    { type: "segment", a: [40, 600], b: [40, 300], material: "metal", zones: [1] },
    { type: "segment", a: [100, 600], b: [100, 300], material: "metal", zones: [1] },
    // a standup target, a little slanted: a ball dropped on a flat one would rest on it for ever
    { type: "segment", a: [300, 490], b: [380, 510], material: "rubber", switch: "target1", kick: { speed: 1.6, minHit: 0.4, cooldownMs: 40 } },
  ],
  posts: [
    // pop bumpers: they push the ball away
    { at: [200, 400], r: 12, material: "rubber", switch: "bumper1", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
    { at: [320, 420], r: 12, material: "rubber", switch: "bumper2", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
  ],
  // a ramp: up from its mouth at y=600 to its exit at y=300; the gates join the playfield (zone 0) and the ramp (zone 1)
  gates: [
    { a: [40, 600], b: [100, 600], zoneA: 0, zoneB: 1 },
    { a: [40, 300], b: [100, 300], zoneA: 1, zoneB: 0 },
  ],
  visual: { heights: [0, 30], ramps: [{ zone: 1, path: [[70, 600], [70, 300]], width: 60 }] },
  plunger: { at: [499, 1030], dirDeg: -90, width: 32, stroke: 80, maxSpeed: 5, pullSpeed: 0.2, material: "plunger" },
  flippers: [
    { id: "left", pivot: [150, 900], length: 60, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -30, upMs: 40, downMs: 100, material: "rubber" },
    { id: "right", pivot: [370, 900], length: 60, rBase: 9.5, rTip: 5, restDeg: 150, activeDeg: 210, upMs: 40, downMs: 100, material: "rubber" },
  ],
  shots: { target: ["target1"] },
};
