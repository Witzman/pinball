import type { TableDef } from "../table/schema";
import { KICKBACK_SPEED } from "./colony-scoring";

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
    { type: "polyline", points: [[5, 1045], [5, 260]], material: "metal", zones: [0, 1, 2, 3] },
    { type: "arc", c: [260, 260], r: 255, from: 180, to: 360, chords: 32, material: "metal", zones: [0, 1, 2, 3] },
    { type: "polyline", points: [[515, 260], [515, 1045]], material: "metal", zones: [0, 1, 2, 3] },
    // the plunger lane: its wall and its floor (the pulled plunger and its ball stop on it), and a one-way flap at the top
    { type: "segment", a: [483, 1045], b: [483, 250], material: "metal", zones: [0, 1, 2, 3] },
    { type: "segment", a: [483, 1045], b: [515, 1045], material: "metal" },
    { type: "segment", a: [515, 205], b: [483, 250], material: "metal", oneWay: true },
    // (the outer walls above exist in the ramp zones too: a ball that slips into a ramp zone outside its rails, at the edge of a mouth, stays on the table)
    // the left lanes: the outlane runs down beside the wall (5..60); the inlane leads from its inner wall to the flipper
    // the inlane guide ends where the top edge of the resting flipper begins, in line with it, so a ball rolls on without a notch to rest in
    { type: "polyline", points: [[60, 770], [60, 838], [138.75, 891.8]], material: "metal" },
    { type: "segment", a: [110, 730], b: [130, 830], material: "rubber", switch: "slingL", kick: { speed: 1.6, minHit: 0.4, cooldownMs: 40 } },
    // the right lanes, the mirror of the left ones about the middle of the playfield between the walls (x = 244)
    { type: "polyline", points: [[428, 770], [428, 838], [349.25, 891.8]], material: "metal" },
    { type: "segment", a: [378, 730], b: [358, 830], material: "rubber", switch: "slingR", kick: { speed: 1.6, minHit: 0.4, cooldownMs: 40 } },
    // the Scout: a standup target in the middle, slanted so no ball can rest on it, and down to the left so a ball that rolls off goes into the playfield
    { type: "segment", a: [270, 650], b: [316, 630], material: "rubber", switch: "scout" },
    // the Fungus Farm (step 4): two banks of three drop targets either side of the Mushroom Hole, each a slanted line (no ball rests on it), the left one leaning right, the right one its mirror about x = 244; down, they let the ball through
    ...[0, 1, 2].map((i) => ({ type: "segment" as const, a: [135 + 10 * i, 500 + 30 * i] as [number, number], b: [145 + 10 * i, 530 + 30 * i] as [number, number], material: "rubber", switch: `fungusL${i + 1}`, ref: `fungusL${i + 1}` })),
    ...[0, 1, 2].map((i) => ({ type: "segment" as const, a: [353 - 10 * i, 500 + 30 * i] as [number, number], b: [343 - 10 * i, 530 + 30 * i] as [number, number], material: "rubber", switch: `fungusR${i + 1}`, ref: `fungusR${i + 1}` })),
    // the Leaf Ramp (left, zone 1): rails 60 mm apart from y=500 up to y=300; the ball rolls up it, over the playfield, and out at the top
    { type: "segment", a: [40, 500], b: [40, 300], material: "metal", zones: [1] },
    { type: "segment", a: [100, 500], b: [100, 300], material: "metal", zones: [1] },
    // the Root Ramp (right, zone 2): the same on the right, from y=640 up to y=400
    { type: "segment", a: [380, 640], b: [380, 400], material: "metal", zones: [2] },
    { type: "segment", a: [440, 640], b: [440, 400], material: "metal", zones: [2] },
    // the Dig Ramp (upper right, zone 3): rails 60 mm apart from y=330 up to y=190, closed at the top by the Dig Site (a cap, so a ball cannot leave over the top)
    { type: "segment", a: [392, 330], b: [392, 190], material: "metal", zones: [3] },
    { type: "segment", a: [452, 330], b: [452, 190], material: "metal", zones: [3] },
    { type: "segment", a: [392, 190], b: [452, 190], material: "metal", zones: [3] },
  ],
  posts: [
    // the Aphid Pasture: three pop bumpers in a triangle, 60 mm or more between their edges (no pocket for a ball to bounce in for ever)
    { at: [260, 320], r: 18, material: "rubber", switch: "bumper1", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
    { at: [200, 395], r: 18, material: "rubber", switch: "bumper2", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
    { at: [320, 395], r: 18, material: "rubber", switch: "bumper3", kick: { speed: 2, minHit: 0.3, cooldownMs: 30 } },
  ],
  triggers: [
    { id: "outL", at: [32, 960], r: 12, switch: "outL" },
    // the kickback: a sinkhole at the foot of the left outlane; the rules kick the ball up the lane when the kickback is lit, and let it go (no kick) when not
    { id: "kickbackL", at: [32, 1005], r: 10, switch: "kickbackL", hold: { kickDeg: -90, kickSpeed: KICKBACK_SPEED } },
    { id: "inL", at: [85, 810], r: 10, switch: "inL" },
    { id: "inR", at: [403, 810], r: 10, switch: "inR" },
    { id: "outR", at: [455, 960], r: 12, switch: "outR" },
    // the three rollover lanes at the top ("W-O-R"), under the dome
    { id: "rollW", at: [190, 120], r: 10, switch: "rollW" },
    { id: "rollO", at: [260, 110], r: 10, switch: "rollO" },
    { id: "rollR", at: [330, 120], r: 10, switch: "rollR" },
    // the chambers (step 3b): sinkholes a ball sits in until the rules kick it out. Their names are the lock ids and the switches. Placeholders: where they are, how hard they kick.
    // Brood Chamber, lower left, under the upper flipper; kicks across the table to the right
    { id: "brood", at: [85, 665], r: 12, switch: "brood", hold: { kickDeg: -25, kickSpeed: 1.8 } },
    // Queen's Chamber, in the middle under the pop bumpers; kicks up and left into the bumpers (-105: at -110 a ball looped between the Queen and the bumpers for ever once the right Fungus bank was down)
    { id: "queen", at: [260, 470], r: 12, switch: "queen", hold: { kickDeg: -105, kickSpeed: 1.6 } },
    // Mushroom Hole, between the two banks of the Fungus Farm (step 4); kicks down towards the flippers
    { id: "mushroom", at: [244, 555], r: 12, switch: "mushroom", hold: { kickDeg: 100, kickSpeed: 1.2 } },
    // the Dig Site (step 3c), at the top of the Dig Ramp: a ball sits in it until the rules kick it out; it kicks down the ramp, so the ball rolls out of the mouth
    { id: "digSite", at: [422, 215], r: 12, zones: [3], switch: "digSite", hold: { kickDeg: 90, kickSpeed: 0.8 } },
    // the orbits (step 2b): rollovers along the side corridors, no guide walls of their own. Trail West: up the left edge past the Leaf Ramp (in, spinner, out), fed by the upper left flipper; Trail East: up the right edge beside the Dig Ramp, fed by the upper right flipper (the lower flippers cannot get a ball in: the ramp mouths and the slings are in the way). The spinners are rollovers the rules count.
    { id: "orbitWIn", at: [33, 545], r: 14, switch: "orbitWIn" },
    { id: "spinW", at: [33, 420], r: 14, switch: "spinW" },
    { id: "orbitWOut", at: [33, 235], r: 14, switch: "orbitWOut" },
    { id: "orbitEIn", at: [455, 500], r: 14, switch: "orbitEIn" },
    { id: "spinE", at: [455, 400], r: 14, switch: "spinE" },
    { id: "orbitEOut", at: [455, 290], r: 14, switch: "orbitEOut" },
    // the Pheromone Loop: two rollovers under the dome, left and right; left then right is the loop (a ball from the plunger comes round right to left and does not count)
    { id: "loopL", at: [82, 100], r: 12, switch: "loopL" },
    { id: "loopR", at: [438, 100], r: 12, switch: "loopR" },
    // the skill shot: three rollovers up the plunger lane, the harder the pull the further the ball gets
    { id: "skill1", at: [499, 700], r: 10, switch: "skill1" },
    { id: "skill2", at: [499, 500], r: 10, switch: "skill2" },
    { id: "skill3", at: [499, 330], r: 10, switch: "skill3" },
  ],
  // each ramp is two gates: the mouth joins the playfield (zone 0) to the ramp, the exit joins it back
  gates: [
    { a: [40, 500], b: [100, 500], zoneA: 0, zoneB: 1, switch: "leafEnter" },
    { a: [40, 300], b: [100, 300], zoneA: 1, zoneB: 0, switch: "leafExit" },
    { a: [380, 640], b: [440, 640], zoneA: 0, zoneB: 2, switch: "rootEnter" },
    { a: [380, 400], b: [440, 400], zoneA: 2, zoneB: 0, switch: "rootExit" },
    // the Dig Ramp has a mouth only: its top is the Dig Site
    { a: [392, 330], b: [452, 330], zoneA: 0, zoneB: 3, switch: "digEnter" },
  ],
  visual: {
    heights: [0, 48, 48, 56],
    ramps: [
      { zone: 1, path: [[70, 500], [70, 300]], width: 60, heights: [0, 48] },
      { zone: 2, path: [[410, 640], [410, 400]], width: 60, heights: [0, 48] },
      { zone: 3, path: [[422, 330], [422, 190]], width: 60, heights: [0, 56] },
    ],
  },
  // the Pull Bridge: over the resting upper flipper, nearer the pivot than the tip so the Brood Chamber does not take the ball; the rules switch it on after a Leaf Ramp shot, so the ball waits there for the Dig Ramp shot
  magnets: [{ id: "pullBridge", at: [48, 612], r: 40, strength: 4 }],
  plunger: { at: [499, 1030], dirDeg: -90, width: 32, stroke: 80, maxSpeed: 2, pullSpeed: 0.1, material: "plunger" },
  flippers: [
    { id: "left", pivot: [134, 900], length: 70, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -20, upMs: 40, downMs: 100, material: "rubber" },
    { id: "right", pivot: [354, 900], length: 70, rBase: 9.5, rTip: 5, restDeg: 150, activeDeg: 200, upMs: 40, downMs: 100, material: "rubber" },
    // the upper flipper, on the left wall; it follows the left button
    { id: "upperLeft", pivot: [16, 600], length: 58, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -30, upMs: 40, downMs: 100, material: "rubber", input: "left" },
    // the upper right flipper (step 2b), the mirror of the upper left one about x = 244, 30 mm higher so its tip stays clear of the Root Ramp mouth (y 640), on the plunger lane wall; it follows the right button and feeds the East lane
    { id: "upperRight", pivot: [472, 570], length: 45, rBase: 9.5, rTip: 5, restDeg: 150, activeDeg: 210, upMs: 40, downMs: 100, material: "rubber", input: "right" },
  ],
  dropBanks: { fungusL: ["fungusL1", "fungusL2", "fungusL3"], fungusR: ["fungusR1", "fungusR2", "fungusR3"] },
  sounds: { slingL: "sling", slingR: "sling", scout: "target" },
  shots: { trailWest: ["orbitWIn", "spinW"], trailEast: ["orbitEIn", "spinE"], pheromoneLoop: ["loopL", "loopR"], skillShot: ["skill1", "skill2", "skill3"], scout: ["scout"], leafRamp: ["leafEnter", "leafExit"], rootRamp: ["rootEnter", "rootExit"], broodChamber: ["brood"], queensChamber: ["queen"], mushroomHole: ["mushroom"], digRamp: ["digEnter", "digSite"] },
};
