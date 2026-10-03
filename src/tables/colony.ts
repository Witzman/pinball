import type { TableDef } from "../table/schema";

/**
 * THE COLONY, step 1 of #25: the outline. Every number is a placeholder: nobody has played
 * this table, so what is checked is only what tests can check (no ball rests, the plunger
 * launches, the lanes and the flippers work). Millimetres, y down the table.
 *
 * Frozen names (the rules of #26 to #41 use them): switches outL, inL, inR, outR, kickbackL,
 * slingL, slingR, skill1..3; flippers left, right; shot skillShot. The rest of the layout
 * (orbits, ramps, sinkholes, targets, bumpers, the upper flipper) comes in later steps.
 */
export const colonyTable: TableDef = {
  id: "colony",
  name: "The Colony",
  playfield: { width: 520, length: 1050, slopeDeg: 6.5 },
  ball: { radius: 13.5, mass: 80 },
  materials: {
    rubber: { e: 0.6, mu: 0.3 },
    metal: { e: 0.4, mu: 0.1 },
    plunger: { e: 0.2, mu: 0 },
  },
  walls: [
    // the left wall, the dome over the top and the right wall; open at the bottom, between the lanes: that is the drain
    { type: "polyline", points: [[5, 1045], [5, 260]], material: "metal" },
    { type: "arc", c: [260, 260], r: 255, from: 180, to: 360, chords: 32, material: "metal" },
    { type: "polyline", points: [[515, 260], [515, 1045]], material: "metal" },
    // the plunger lane: its wall and its floor (the pulled plunger and its ball stop on it), and a one-way flap at the top
    { type: "segment", a: [483, 1045], b: [483, 250], material: "metal" },
    { type: "segment", a: [483, 1045], b: [515, 1045], material: "metal" },
    { type: "segment", a: [515, 205], b: [483, 250], material: "metal", oneWay: true },
    // the left lanes: the outlane runs down beside the wall (5..60); the inlane leads from its inner wall to the flipper
    // the inlane guide ends where the top edge of the resting flipper begins, in line with it, so a ball rolls on without a notch to rest in
    { type: "polyline", points: [[60, 770], [60, 838], [138.75, 891.8]], material: "metal" },
    { type: "segment", a: [110, 730], b: [130, 830], material: "rubber", switch: "slingL" },
    // the right lanes, the mirror of the left ones about the middle of the playfield between the walls (x = 244)
    { type: "polyline", points: [[428, 770], [428, 838], [349.25, 891.8]], material: "metal" },
    { type: "segment", a: [378, 730], b: [358, 830], material: "rubber", switch: "slingR" },
    // the Scout: a standup target on the right, slanted so no ball can rest on it
    { type: "segment", a: [395, 545], b: [440, 565], material: "rubber", switch: "scout" },
  ],
  posts: [
    // the Aphid Pasture: three pop bumpers in a triangle, 60 mm or more between their edges (no pocket for a ball to bounce in for ever)
    { at: [260, 320], r: 18, material: "rubber", switch: "bumper1", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
    { at: [200, 395], r: 18, material: "rubber", switch: "bumper2", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
    { at: [320, 395], r: 18, material: "rubber", switch: "bumper3", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
  ],
  triggers: [
    { id: "outL", at: [32, 960], r: 12, switch: "outL" },
    { id: "kickbackL", at: [32, 1005], r: 10, switch: "kickbackL" },
    { id: "inL", at: [85, 810], r: 10, switch: "inL" },
    { id: "inR", at: [403, 810], r: 10, switch: "inR" },
    { id: "outR", at: [455, 960], r: 12, switch: "outR" },
    // the three rollover lanes at the top ("W-O-R"), under the dome
    { id: "rollW", at: [190, 120], r: 10, switch: "rollW" },
    { id: "rollO", at: [260, 110], r: 10, switch: "rollO" },
    { id: "rollR", at: [330, 120], r: 10, switch: "rollR" },
    // the skill shot: three rollovers up the plunger lane, the harder the pull the further the ball gets
    { id: "skill1", at: [499, 700], r: 10, switch: "skill1" },
    { id: "skill2", at: [499, 500], r: 10, switch: "skill2" },
    { id: "skill3", at: [499, 330], r: 10, switch: "skill3" },
  ],
  plunger: { at: [499, 1030], dirDeg: -90, width: 32, stroke: 80, maxSpeed: 2, pullSpeed: 0.2, material: "plunger" },
  flippers: [
    { id: "left", pivot: [134, 900], length: 58, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -30, upMs: 40, downMs: 100, material: "rubber" },
    { id: "right", pivot: [354, 900], length: 58, rBase: 9.5, rTip: 5, restDeg: 150, activeDeg: 210, upMs: 40, downMs: 100, material: "rubber" },
    // the upper flipper, on the left wall; it follows the left button
    { id: "upperLeft", pivot: [16, 600], length: 58, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -30, upMs: 40, downMs: 100, material: "rubber", input: "left" },
  ],
  sounds: { slingL: "sling", slingR: "sling", scout: "target" },
  shots: { skillShot: ["skill1", "skill2", "skill3"], scout: ["scout"] },
};
