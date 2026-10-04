import { describe, expect, it } from "vitest";
import { advance, createGame, tick } from "../../src/sim/game";
import { harness } from "../rules/harness";
import type { Game } from "../../src/sim/game";
import type { TableRules } from "../../src/rules";
import { colonyFlow, colonyRules } from "../../src/tables/colony-rules";
import { CHAMBER_HOLD, FUNGUS_BANK, FUNGUS_RESET, KICKBACK_SPEED, LOOP_SHOT, SWITCH_POINTS, TRAIL_SHOT } from "../../src/tables/colony-scoring";
import { allTables, tableSetups } from "../../src/tables";
import { colonyTable } from "../../src/tables/colony";
import { validateTable } from "../../src/table/validate";
import { dropAt, insideSolid, restGrid } from "../helpers/rest-grid";

/** A game of The Colony in free play, with its rules, that writes down the switches the rules hear, in order. */
function play(): { g: Game; seen: string[] } {
  const seen: string[] = [];
  const rules: TableRules = { ...colonyRules, onSwitch: (c, e) => { seen.push(e.sw); colonyRules.onSwitch?.(c, e); } };
  return { g: createGame(colonyTable, { rules }), seen };
}

const drop = dropAt;
const insideWall = (g: Game, x: number, y: number) => insideSolid(g, colonyTable, x, y);

/** Ticks until the ball drains, at most `max`; true if it did. `left` counts the ticks the ball was outside the playfield box on the way, which only a missing wall allows. */
function drains(g: Game, max = 25000, left = { ticks: 0 }): boolean {
  const before = g.drains;
  for (let i = 0; i < max && g.drains === before; i++) {
    tick(g);
    const b = g.table.world.balls[0];
    if (g.drains === before && b && (b.x < 0 || b.x > g.table.playfieldWidth)) left.ticks++;
  }
  return g.drains > before;
}

describe("The Colony, step 1: the outline", () => {
  it("is a valid table, registered with rules and a flow", () => {
    expect(validateTable(colonyTable)).toEqual([]);
    expect(allTables).toContain(colonyTable);
    expect(tableSetups.colony?.flow).toBeDefined();
  });

  it("is the table of the spec: 520 x 1050 mm, 6.5 degrees, a 27 mm ball, a 70 mm flipper pair and the two upper flippers, one plunger", () => {
    expect(colonyTable.playfield).toEqual({ width: 520, length: 1050, slopeDeg: 6.5 });
    expect(colonyTable.ball.radius * 2).toBe(27);
    expect(colonyTable.flippers.map((f) => [f.id, f.length, f.input ?? null])).toEqual([["left", 70, null], ["right", 70, null], ["upperLeft", 58, "left"], ["upperRight", 45, "right"]]);
    expect(colonyTable.plunger).toBeDefined();
  });

  it("has a skill shot of three lane switches up the plunger lane, and the frozen switch names", () => {
    expect(colonyTable.shots).toEqual({ skillShot: ["skill1", "skill2", "skill3"], scout: ["scout"], leafRamp: ["leafEnter", "leafExit"], rootRamp: ["rootEnter", "rootExit"], broodChamber: ["brood"], queensChamber: ["queen"], mushroomHole: ["mushroom"], digRamp: ["digEnter", "digSite"], trailWest: ["orbitWIn", "spinW"], trailEast: ["orbitEIn", "spinE"], pheromoneLoop: ["loopL", "loopR"] });
    const names = [...(colonyTable.triggers ?? []).map((t) => t.switch), ...colonyTable.walls.flatMap((w) => (w.switch ? [w.switch] : [])), ...colonyTable.posts.flatMap((p) => (p.switch ? [p.switch] : [])), ...(colonyTable.gates ?? []).flatMap((g) => (g.switch ? [g.switch] : []))].sort();
    expect(names).toEqual(["brood", "bumper1", "bumper2", "bumper3", "digEnter", "digSite", "fungusL1", "fungusL2", "fungusL3", "fungusR1", "fungusR2", "fungusR3", "inL", "inR", "kickbackL", "leafEnter", "leafExit", "loopL", "loopR", "mushroom", "orbitEIn", "orbitEOut", "orbitWIn", "orbitWOut", "outL", "outR", "queen", "rollO", "rollR", "rollW", "rootEnter", "rootExit", "scout", "skill1", "skill2", "skill3", "slingL", "slingR", "spinE", "spinW"]);
  });

  it("lets no ball rest for ever: balls dropped at rest over a grid all drain", () => {
    expect(restGrid(colonyTable, { create: (def) => createGame(def, { rules: colonyRules }) })).toEqual([]);
  }, 60000); // about 5 s on a quiet machine: the default 5 s limit failed it under load

  /** The switches the rules hear for a plunger pulled for `ms` and then let go, and the ball's track until it drains. */
  function launch(ms: number) {
    const { g, seen } = play();
    g.input.plunge = true;
    advance(g, 50);
    for (let i = 0; i < ms; i++) tick(g);
    g.input.plunge = false;
    const b = g.table.world.balls[0]!;
    let outside = 0; // ticks with the ball outside the playfield box while still in play
    let top = 2;
    let reentered = false; // back into the plunger lane after it was up in the dome
    let highest = 2;
    for (let i = 0; i < 40000 && g.drains === 0; i++) {
      tick(g);
      if (g.drains > 0) break;
      if (b.x < 0 || b.x > 0.52 || b.y < 0) outside++;
      top = Math.min(top, b.y);
      highest = Math.min(highest, b.y);
      if (highest < 0.25 && b.x > 0.489 && b.y > 0.26 && b.y < 1.0) reentered = true;
    }
    return { seen, drained: g.drains > 0, outside, top, reentered };
  }

  it("launches from the plunger: pulls from 300 ms up send the ball round the dome, inside the table, never back into the lane, and it drains", () => {
    for (const ms of [300, 600, 1000]) {
      const r = launch(ms);
      expect(r.drained, `pull ${ms} ms`).toBe(true);
      expect(r.outside, `pull ${ms} ms: ticks outside the table`).toBe(0);
      expect(r.reentered, `pull ${ms} ms: back in the lane`).toBe(false);
      expect(r.top, `pull ${ms} ms: how high`).toBeLessThan(0.45);
    }
  });

  it("makes the skill shot a matter of pull: a short pull passes fewer skill lanes, a long one all three in order", () => {
    expect(launch(60).seen.length).toBeLessThan(3);
    expect(launch(60).top).toBeGreaterThan(launch(200).top);
    expect(launch(600).seen.slice(0, 3)).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("ends each inlane guide where the top edge of its resting flipper begins, in line with it: no notch for a ball to rest in", () => {
    for (const f of colonyTable.flippers.filter((x) => x.id === "left" || x.id === "right")) { // the upper flipper has no inlane
      const a = (f.restDeg * Math.PI) / 180;
      let nx = -Math.sin(a);
      let ny = Math.cos(a);
      if (ny > 0) [nx, ny] = [-nx, -ny]; // the side that faces up the table
      const top: [number, number] = [f.pivot[0] + f.rBase * nx, f.pivot[1] + f.rBase * ny];
      const guide = colonyTable.walls.find((w) => w.type === "polyline" && w.points.length === 3 && Math.abs(w.points[2]![0] - top[0]) < 20);
      expect(guide, f.id).toBeDefined();
      if (guide?.type === "polyline") {
        const end = guide.points[2]!;
        expect(Math.hypot(end[0] - top[0], end[1] - top[1]), f.id).toBeLessThan(1);
      }
    }
  });

  it("keeps a ball in the plunger lane when it is pushed sideways, and keeps a ball above the flap out of the lane", () => {
    const inLane = play();
    drop(inLane.g, 499, 700);
    inLane.g.table.world.balls[0]!.vx = -1.5;
    for (let i = 0; i < 6000; i++) tick(inLane.g);
    expect(inLane.g.drains).toBe(0);
    expect(inLane.g.table.world.balls[0]!.x).toBeGreaterThan(0.483); // the lane wall held it
    const wall = play();
    drop(wall.g, 30, 600);
    wall.g.table.world.balls[0]!.vx = -2; // shoved at the left wall
    for (let i = 0; i < 300; i++) tick(wall.g);
    expect(wall.g.table.world.balls[0]!.x).toBeGreaterThan(0); // the left wall held it
    const above = play();
    drop(above.g, 495, 200); // in the dome corner above the flap
    expect(drains(above.g)).toBe(true); // the one-way flap sends it into the playfield: it does not fall into the lane
  });

  it("keeps a pulled plunger and its ball in the lane: it has a floor", () => {
    const { g } = play();
    g.input.plunge = true;
    for (let i = 0; i < 2000; i++) tick(g);
    expect(g.drains).toBe(0);
    const b = g.table.world.balls[0]!;
    expect(b.y).toBeLessThan(1.05);
    expect(b.y).toBeGreaterThan(0.95);
  });

  it("reports the lanes: a ball dropped into each inlane and outlane hits its switch and then drains", () => {
    const cases: [number, number, string][] = [[85, 760, "inL"], [403, 760, "inR"], [32, 900, "outL"], [455, 900, "outR"]];
    for (const [x, y, sw] of cases) {
      const { g, seen } = play();
      drop(g, x, y);
      expect(drains(g), sw).toBe(true);
      expect(seen, sw).toContain(sw);
    }
    const { g, seen } = play();
    drop(g, 32, 900);
    drains(g);
    expect(seen).toEqual(["outL", "kickbackL", "outL"]); // the kickback lane lies below the outlane rollover; the lit kickback sends the ball back up past it, and it drains in the end
  });

  it("lets each flipper lift a ball out of its inlane: some timing sends it far up the table, and without the press it drains", () => {
    for (const [side, x] of [["left", 85], ["right", 403]] as const) {
      let best = 1;
      for (let press = 300; press <= 1000; press += 20) {
        const { g } = play();
        drop(g, x, 760);
        g.input[side] = false;
        let top = 1;
        for (let i = 0; i < 2500; i++) {
          if (i === press) g.input[side] = true;
          if (i === press + 120) g.input[side] = false;
          tick(g);
          const ball = g.table.world.balls[0];
          if (ball) top = Math.min(top, ball.y);
        }
        best = Math.min(best, top);
      }
      expect(best, side).toBeLessThan(0.5);
    }
    const { g } = play();
    drop(g, 85, 760);
    let top = 1;
    for (let i = 0; i < 2500; i++) {
      tick(g);
      const ball = g.table.world.balls[0];
      if (ball) top = Math.min(top, ball.y);
    }
    expect(top).toBeGreaterThan(0.7); // no press: it only rolls down
  });

  it("pops the ball off each pop bumper with the kick speed, and the switch hears a kick", () => {
    for (const [name, x, y] of [["bumper1", 260, 320], ["bumper2", 200, 395], ["bumper3", 320, 395]] as const) {
      const kinds: string[] = [];
      const rules: TableRules = { modes: {}, onSwitch: (_c, e) => void (e.sw === name && kinds.push(e.kind)) };
      const g = createGame(colonyTable, { rules });
      g.table.world.gravity = 0;
      Object.assign(g.table.world.balls[0]!, { x: (x - 70) / 1000, y: y / 1000, vx: 1, vy: 0, zone: 0 }); // straight at it from the left
      for (let i = 0; i < 150 && kinds.length === 0; i++) tick(g);
      expect(kinds, name).toEqual(["kick"]); // and the speed is checked at the moment of the kick, before anything else is hit
      expect(g.table.world.balls[0]!.vx, name).toBeCloseTo(-2, 1);
    }
  });

  it("reports the rollover lanes at the top and the scout standup", () => {
    for (const [x, y, sw] of [[190, 80, "rollW"], [260, 70, "rollO"], [330, 80, "rollR"]] as const) {
      const { g, seen } = play();
      drop(g, x, y);
      drains(g);
      expect(seen, sw).toContain(sw);
    }
    const { g, seen } = play();
    g.table.world.gravity = 0;
    Object.assign(g.table.world.balls[0]!, { x: 0.315, y: 0.64, vx: 0, vy: -1 }); // up at the scout from below
    for (let i = 0; i < 100; i++) tick(g);
    expect(seen).toContain("scout");
  });

  it("lifts a ball with the upper flipper: some timing of the left button sends a ball from the left wall far up the table", () => {
    let best = 1;
    for (let press = 100; press <= 1500; press += 20) {
      const { g } = play();
      drop(g, 25, 480);
      g.input.left = false;
      let top = 1;
      for (let i = 0; i < 3000; i++) {
        if (i === press) g.input.left = true;
        if (i === press + 120) g.input.left = false;
        tick(g);
        const b = g.table.world.balls[0];
        if (b && i > press) top = Math.min(top, b.y);
      }
      best = Math.min(best, top);
    }
    expect(best).toBeLessThan(0.3); // up into the dome
  });

  it("swings the upper flipper with the left button only", () => {
    const { g } = play();
    const u = () => g.table.world.flippers[g.table.flipperIds.indexOf("upperLeft")]!.u;
    g.input.right = true;
    for (let i = 0; i < 100; i++) tick(g);
    expect(u()).toBe(0);
    g.input.right = false;
    g.input.left = true;
    for (let i = 0; i < 100; i++) tick(g);
    expect(u()).toBe(1);
  });

  it("keeps the upper flipper off a wedge at the left wall: the ball that touches the wall lies at or right of the pivot, so it rolls onto the flipper, and no ball fits between pivot and wall", () => {
    const f = colonyTable.flippers.find((x) => x.id === "upperLeft")!;
    const wallX = 5;
    const r = colonyTable.ball.radius;
    expect(f.pivot[0] - f.rBase).toBeGreaterThanOrEqual(wallX); // not through the wall
    expect(f.pivot[0] - f.rBase - wallX).toBeLessThan(2 * r); // no gap a ball slips through
    expect(f.pivot[0]).toBeLessThanOrEqual(wallX + r); // the ball against the wall is right of the pivot centre: it does not wedge
  });

  it("keeps the pop bumpers well apart: 60 mm or more between the edges of each pair, so no pocket holds a ball between kickers", () => {
    const bumpers = colonyTable.posts.filter((p) => p.kick !== undefined);
    expect(bumpers).toHaveLength(3);
    for (let i = 0; i < bumpers.length; i++) {
      for (let j = i + 1; j < bumpers.length; j++) {
        const a = bumpers[i]!;
        const b = bumpers[j]!;
        expect(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) - a.r - b.r, `${a.switch} and ${b.switch}`).toBeGreaterThanOrEqual(60);
      }
      expect(bumpers[i]!.kick).toEqual({ speed: 2, minHit: 0.3, cooldownMs: 30 });
    }
  });

  it("makes the slings kickers too, and tags the sounds of the slings and the scout", () => {
    for (const sw of ["slingL", "slingR"]) expect(colonyTable.walls.find((w) => w.switch === sw)!.kick).toEqual({ speed: 1.6, minHit: 0.4, cooldownMs: 40 });
    expect(colonyTable.sounds).toEqual({ slingL: "sling", slingR: "sling", scout: "target" });
  });

  it("slants the scout down to the left, so a ball that rolls off it goes into the playfield and not out to the right outlane", () => {
    const scout = colonyTable.walls.find((w) => w.switch === "scout")!;
    if (scout.type !== "segment") throw new Error("the scout is a segment");
    expect(scout.a[0]).toBeLessThan(scout.b[0]);
    expect(scout.a[1]).toBeGreaterThan(scout.b[1]); // the left end is lower down the table
  });

  it("pins the upper flipper's placement: pivot, rest and raised angle (placeholders: change them on purpose)", () => {
    const f = colonyTable.flippers.find((x) => x.id === "upperLeft")!;
    expect(f).toMatchObject({ pivot: [16, 600], restDeg: 30, activeDeg: -30, input: "left" });
  });

  it("has two rising ramps, each with a mouth and an exit gate, rails in its own zone, and a height profile that climbs", () => {
    const ramps = colonyTable.visual!.ramps!.filter((r) => r.zone < 3); // the Dig Ramp ends in the Dig Site, not an exit gate: its own tests below
    expect(ramps.map((r) => r.zone)).toEqual([1, 2]);
    expect(colonyTable.visual!.heights).toEqual([0, 48, 48, 56]);
    for (const r of ramps) {
      expect(r.heights, `zone ${r.zone}`).toEqual([0, 48]);
      const rails = colonyTable.walls.filter((w) => w.zones?.length === 1 && w.zones[0] === r.zone);
      expect(rails, `zone ${r.zone} rails`).toHaveLength(2);
      const gates = colonyTable.gates!.filter((g) => g.zoneA === r.zone || g.zoneB === r.zone);
      expect(gates.map((g) => [g.zoneA, g.zoneB])).toEqual([[0, r.zone], [r.zone, 0]]);
    }
  });

  it("builds each ramp where its picture is: rails at the edges of the drawn path, the gates between them, the mouth at the start of the path and the exit at its end", () => {
    for (const r of colonyTable.visual!.ramps!.filter((r) => r.zone < 3)) {
      const cx = r.path[0]![0];
      const [y0, y1] = [r.path[0]![1], r.path[1]![1]];
      const rails = colonyTable.walls.filter((w) => w.zones?.length === 1 && w.zones[0] === r.zone);
      const railXs = rails.map((w) => (w.type === "segment" ? w.a[0] : NaN)).sort((a, b) => a - b);
      expect(railXs, `zone ${r.zone}`).toEqual([cx - r.width / 2, cx + r.width / 2]);
      for (const w of rails) if (w.type === "segment") expect([w.a[1], w.b[1]].sort((a, b) => a - b), `zone ${r.zone} rail span`).toEqual([Math.min(y0, y1), Math.max(y0, y1)]);
      const [mouth, exit] = colonyTable.gates!.filter((g) => g.zoneA === r.zone || g.zoneB === r.zone);
      expect([mouth!.a[1], mouth!.b[1]], `zone ${r.zone} mouth`).toEqual([y0, y0]);
      expect([exit!.a[1], exit!.b[1]], `zone ${r.zone} exit`).toEqual([y1, y1]);
      for (const g of [mouth!, exit!]) expect([g.a[0], g.b[0]].sort((a, b) => a - b), `zone ${r.zone} gate span`).toEqual([cx - r.width / 2, cx + r.width / 2]);
    }
  });

  it("keeps a ball on the table even when it slips into a ramp zone outside the rails at the edge of a mouth", () => {
    // starts in a ramp zone just outside the rails, found by a random search on the table without the outer walls in the ramp zones: each one flew out through the left wall there
    const starts: [number, number, number, number, number][] = [
      [63.8, 549.5, 0.621, -0.19, 1],
      [64.2, 527.4, -1.128, -0.258, 1],
      [56.6, 502.8, -0.835, 0.818, 1],
      [61.3, 545.3, 0.458, 0.407, 1],
      [400, 600, 1.4, -0.8, 2],
    ];
    for (const [x, y, vx, vy, zone] of starts) {
      const g = createGame(colonyTable);
      const b = g.table.world.balls[0]!;
      Object.assign(b, { x: x / 1000, y: y / 1000, vx, vy, zone });
      for (let i = 0; i < 8000; i++) {
        tick(g);
        const ball = g.table.world.balls[0];
        if (!ball) break;
        expect(ball.x, `(${x},${y}) tick ${i}`).toBeGreaterThan(0);
        expect(ball.x, `(${x},${y}) tick ${i}`).toBeLessThan(0.52);
        expect(ball.y, `(${x},${y}) tick ${i}`).toBeGreaterThan(0);
      }
    }
  });

  it("lets a ball roll up a ramp and out at the top: it enters in zone 0, climbs in its zone, leaves in zone 0, and the rules hear the shot", () => {
    for (const [name, x, y0, enter, exit, zone] of [["leafRamp", 70, 560, "leafEnter", "leafExit", 1], ["rootRamp", 410, 700, "rootEnter", "rootExit", 2]] as const) {
      const seen: string[] = [];
      const shots: string[] = [];
      const rules: TableRules = { modes: {}, onSwitch: (_c, e) => void seen.push(e.sw), onShot: (_c, s) => void shots.push(s) };
      const g = createGame(colonyTable, { rules });
      g.table.world.gravity = 0;
      const b = g.table.world.balls[0]!;
      Object.assign(b, { x: x / 1000, y: y0 / 1000, vx: 0, vy: -1.6, zone: 0 }); // just below the mouth (the Leaf mouth lies above the tip of the upper flipper)
      const zones = new Set<number>();
      for (let i = 0; i < 600; i++) {
        tick(g);
        zones.add(b.zone);
      }
      expect(seen.slice(0, 2), name).toEqual([enter, exit]); // a ball out of the Root exit may roll on up into the Dig Ramp (that is meant)
      expect(zones.has(zone), name).toBe(true);
      expect(shots[0], name).toBe(name);
    }
  });

  it("can be reached by a flipper: some timing of the upper flipper sends a ball up the Leaf Ramp, and some timing of the left flipper up the Root Ramp", () => {
    const sweep = (start: [number, number], button: "left" | "right", want: string) => {
      let hit = 0;
      for (let press = 200; press <= 1300; press += 25) {
        const shots: string[] = [];
        const rules: TableRules = { modes: {}, onShot: (_c, s) => void shots.push(s) };
        const g = createGame(colonyTable, { rules });
        drop(g, start[0], start[1]);
        for (let i = 0; i < 3500 && g.table.world.balls.length > 0; i++) {
          g.input[button] = i >= press && i < press + 100;
          tick(g);
        }
        if (shots.includes(want)) hit++;
      }
      return hit;
    };
    expect(sweep([25, 480], "left", "leafRamp"), "upper flipper -> Leaf Ramp").toBeGreaterThan(0);
    expect(sweep([85, 760], "left", "rootRamp"), "left flipper -> Root Ramp").toBeGreaterThan(0);
  }, 120000);
});

describe("The Colony, step 3b: the chambers", () => {
  const chambers = ["brood", "queen", "mushroom"] as const;
  const spot = (id: string): [number, number] => colonyTable.triggers!.find((t) => t.id === id)!.at;

  /** Rolls a ball straight at a chamber from 40 mm above it. */
  function rollInto(id: string): { g: Game; seen: string[] } {
    const r = play();
    const [x, y] = spot(id);
    Object.assign(r.g.table.world.balls[0]!, { x: x / 1000, y: (y - 40) / 1000, vx: 0, vy: 0.8, zone: 0 });
    return r;
  }

  it("pins the chambers' placement and kicks (placeholders: change them on purpose)", () => {
    expect(colonyTable.triggers!.filter((t) => t.hold).map((t) => [t.id, t.at, t.r, t.hold])).toEqual([
      ["kickbackL", [32, 1005], 10, { kickDeg: -90, kickSpeed: 2.4 }],
      ["brood", [85, 665], 12, { kickDeg: -25, kickSpeed: 1.8 }],
      ["queen", [260, 470], 12, { kickDeg: -105, kickSpeed: 1.6 }],
      ["mushroom", [244, 555], 12, { kickDeg: 100, kickSpeed: 1.2 }],
      ["digSite", [422, 215], 12, { kickDeg: 90, kickSpeed: 0.8 }],
    ]);
  });

  it("catches a ball that rolls into each chamber, holds it, lets it go after the hold time and the ball leaves the hole", () => {
    for (const id of chambers) {
      const { g, seen } = rollInto(id);
      const [x, y] = spot(id);
      let held = -1;
      for (let i = 0; i < 400 && held < 0; i++) {
        tick(g);
        if (g.table.world.balls[0]?.hold) held = i;
      }
      expect(held, `${id}: caught`).toBeGreaterThanOrEqual(0);
      expect(seen, id).toContain(id);
      const b = g.table.world.balls[0]!;
      expect(Math.hypot(b.x * 1000 - x, b.y * 1000 - y), `${id}: sits at the centre`).toBeLessThan(1e-6);
      for (let i = 0; i < CHAMBER_HOLD - 50; i++) tick(g);
      expect(g.table.world.balls[0]!.hold, `${id}: still held before the hold time`).not.toBe(0);
      for (let i = 0; i < 200; i++) tick(g);
      expect(g.table.world.balls[0]?.hold ?? 0, `${id}: let go`).toBe(0);
      for (let i = 0; i < 100; i++) tick(g);
      const away = Math.hypot(g.table.world.balls[0]!.x * 1000 - x, g.table.world.balls[0]!.y * 1000 - y);
      expect(away, `${id}: it left the hole`).toBeGreaterThan(30);
    }
  });

  it("lets the ball out of each chamber on its way: it drains in the end, and is never caught again by the chamber it left", () => {
    for (const id of chambers) {
      const { g, seen } = rollInto(id);
      expect(drains(g, 40000), id).toBe(true);
      expect(seen.filter((s) => s === id).length, `${id}: caught once`).toBe(1);
    }
  });

  it("can be reached by a flipper: some timing of some flipper puts a ball in each chamber", () => {
    const sweep = (start: [number, number], button: "left" | "right", want: string) => {
      let hit = 0;
      for (let press = 200; press <= 1300; press += 25) {
        const { g, seen } = play();
        drop(g, start[0], start[1]);
        for (let i = 0; i < 4000 && g.table.world.balls.length > 0; i++) {
          g.input[button] = i >= press && i < press + 100;
          tick(g);
        }
        if (seen.includes(want)) hit++;
      }
      return hit;
    };
    const starts: [string, [number, number], "left" | "right"][] = [["left flipper", [85, 760], "left"], ["right flipper", [403, 760], "right"], ["upper flipper", [25, 480], "left"]];
    for (const id of chambers) {
      const best = Math.max(...starts.map(([, start, button]) => sweep(start, button, id)));
      expect(best, id).toBeGreaterThan(0);
    }
  }, 240000);
});

describe("The Colony, step 3c: the Dig Ramp, the Dig Site and the Pull Bridge", () => {
  it("pins the Dig Ramp's placement (placeholders: change them on purpose): zone 3, mouth at y 330, the Dig Site at the top, a steeper climb than the other ramps", () => {
    const r = colonyTable.visual!.ramps!.find((x) => x.zone === 3)!;
    expect([r.path, r.width, r.heights]).toEqual([[[422, 330], [422, 190]], 60, [0, 56]]);
    const rails = colonyTable.walls.filter((w) => w.zones?.length === 1 && w.zones[0] === 3);
    expect(rails.map((w) => (w.type === "segment" ? [w.a, w.b] : null))).toEqual([[[392, 330], [392, 190]], [[452, 330], [452, 190]], [[392, 190], [452, 190]]]);
    expect(colonyTable.gates!.filter((g) => g.zoneB === 3 || g.zoneA === 3).map((g) => [g.a, g.b, g.zoneA, g.zoneB, g.switch])).toEqual([[[392, 330], [452, 330], 0, 3, "digEnter"]]);
    const site = colonyTable.triggers!.find((t) => t.id === "digSite")!;
    expect(site.zones).toEqual([3]);
    expect(site.at[0]).toBe(422);
    expect(site.at[1]).toBeGreaterThan(190 + 13.5); // the ball fits between the cap and the hole
    expect(colonyTable.magnets).toEqual([{ id: "pullBridge", at: [48, 612], r: 40, strength: 4 }]);
  });

  it("lets a ball roll up the Dig Ramp into the Dig Site: the rules hear digEnter and digSite, the shot is digRamp, the ball is held in zone 3", () => {
    const shots: string[] = [];
    const seen: string[] = [];
    const rules: TableRules = { ...colonyRules, onSwitch: (c, e) => { seen.push(e.sw); colonyRules.onSwitch?.(c, e); }, onShot: (c, s, e) => { shots.push(s); colonyRules.onShot?.(c, s, e); } };
    const g = createGame(colonyTable, { rules });
    Object.assign(g.table.world.balls[0]!, { x: 0.422, y: 0.4, vx: 0, vy: -1.6, zone: 0 });
    for (let i = 0; i < 600; i++) tick(g);
    expect(seen.slice(0, 2)).toEqual(["digEnter", "digSite"]);
    expect(shots).toContain("digRamp");
    const b = g.table.world.balls[0]!;
    expect(b.zone).toBe(3);
    expect(b.hold).toBeGreaterThan(0);
  });

  it("lets the ball out of the Dig Site: it rolls down the ramp, out of the mouth, and drains in the end, caught once", () => {
    const { g, seen } = play();
    Object.assign(g.table.world.balls[0]!, { x: 0.422, y: 0.4, vx: 0, vy: -1.6, zone: 0 });
    expect(drains(g, 40000)).toBe(true);
    expect(seen.filter((s) => s === "digSite")).toHaveLength(1);
  });

  it("keeps a ball on the table when it slips into the Dig Ramp zone outside its rails", () => {
    for (const [x, y, vx, vy] of [[388, 335, 0.4, -0.5], [456, 328, -0.2, -0.6], [470, 250, 0.9, -0.2], [380, 300, -0.9, -0.4]] as const) {
      const g = createGame(colonyTable);
      Object.assign(g.table.world.balls[0]!, { x: x / 1000, y: y / 1000, vx, vy, zone: 3 });
      for (let i = 0; i < 6000; i++) {
        tick(g);
        const ball = g.table.world.balls[0];
        if (!ball) break;
        expect(ball.x, `(${x},${y}) tick ${i}`).toBeGreaterThan(0);
        expect(ball.x, `(${x},${y}) tick ${i}`).toBeLessThan(0.52);
        expect(ball.y, `(${x},${y}) tick ${i}`).toBeGreaterThan(0);
      }
    }
  });

  it("can be reached by a flipper: some timing of the left flipper or of the upper right flipper puts a ball in the Dig Site", () => {
    const sweep = (start: [number, number], button: "left" | "right") => {
      let hit = 0;
      for (let press = 200; press <= 1300; press += 10) {
        const { g, seen } = play();
        drop(g, start[0], start[1]);
        for (let i = 0; i < 4000 && g.table.world.balls.length > 0; i++) {
          g.input[button] = i >= press && i < press + 100;
          tick(g);
        }
        if (seen.includes("digSite")) hit++;
      }
      return hit;
    };
    const best = Math.max(sweep([85, 760], "left"), sweep([440, 540], "right"));
    expect(best).toBeGreaterThan(0);
  }, 120000);

  it("switches the Pull Bridge on after a Leaf Ramp shot, holds a ball on the upper flipper with it, and switches it off after the hold time and at a drain", () => {
    // the rules turn it on
    const r = { on: false };
    const rules: TableRules = { ...colonyRules };
    const g = createGame(colonyTable, { rules });
    g.table.world.gravity = 0;
    Object.assign(g.table.world.balls[0]!, { x: 0.07, y: 0.56, vx: 0, vy: -1.6, zone: 0 });
    let onAt = -1;
    for (let i = 0; i < 700; i++) {
      tick(g);
      if (g.table.world.magnets[0]!.on && onAt < 0) onAt = i;
    }
    r.on = g.table.world.magnets[0]!.on;
    expect(onAt, "on after the Leaf shot").toBeGreaterThan(0);
    expect(r.on).toBe(true);
    for (let i = 0; i < 1500; i++) tick(g);
    expect(g.table.world.magnets[0]!.on, "off after the hold time").toBe(false);
  });

  it("holds the ball at the upper flipper with the magnet on, and lets it go with it off", () => {
    const stays = (on: boolean) => {
      const g = createGame(colonyTable);
      drop(g, 60, 600);
      g.table.world.magnets[0]!.on = on;
      for (let i = 0; i < 1500; i++) tick(g);
      const b = g.table.world.balls[0];
      return !!b && Math.hypot(b.x * 1000 - 48, b.y * 1000 - 612) < 40;
    };
    expect(stays(true)).toBe(true);
    expect(stays(false)).toBe(false);
  });
});

describe("The Colony, step 4: the Fungus Farm and the kickback", () => {
  const targets = (side: "L" | "R") => colonyTable.walls.filter((w) => w.ref?.startsWith(`fungus${side}`));
  const down = (g: Game) => Array.from(g.table.world.down);

  it("has two banks of three drop targets in the art's target zones (x 130 to 170 and 320 to 360, y 500 to 590), mirrored about x = 244, either side of the Mushroom Hole", () => {
    expect(colonyTable.dropBanks).toEqual({ fungusL: ["fungusL1", "fungusL2", "fungusL3"], fungusR: ["fungusR1", "fungusR2", "fungusR3"] });
    for (const [side, x0, x1] of [["L", 130, 170], ["R", 320, 360]] as const) {
      const ts = targets(side);
      expect(ts, side).toHaveLength(3);
      for (const t of ts) {
        if (t.type !== "segment") throw new Error("a segment");
        expect(t.switch).toBe(t.ref);
        for (const p of [t.a, t.b]) {
          expect(p[0], `${t.ref} x`).toBeGreaterThanOrEqual(x0);
          expect(p[0], `${t.ref} x`).toBeLessThanOrEqual(x1);
          expect(p[1], `${t.ref} y`).toBeGreaterThanOrEqual(500);
          expect(p[1], `${t.ref} y`).toBeLessThanOrEqual(590);
        }
      }
    }
    const [l, r] = [targets("L"), targets("R")].map((ts) => ts.map((t) => (t.type === "segment" ? [t.a, t.b] : [])));
    for (let i = 0; i < 3; i++) expect(r![i], `mirror ${i}`).toEqual(l![i]!.map(([x, y]) => [488 - x!, y!]));
    const hole = colonyTable.triggers!.find((t) => t.id === "mushroom")!;
    expect(hole.at[0]).toBe(244);
  });

  it("puts a target down when a ball hits it, and the ball passes where it stood", () => {
    for (const [id, from, vx] of [["fungusL2", [105, 545], 0.9], ["fungusR2", [383, 545], -0.9]] as const) {
      const { g, seen } = play();
      g.table.world.gravity = 0;
      Object.assign(g.table.world.balls[0]!, { x: from[0] / 1000, y: from[1] / 1000, vx, vy: 0, zone: 0 });
      for (let i = 0; i < 400; i++) tick(g);
      expect(seen, id).toContain(id);
      const idx = g.table.dropIds.indexOf(id);
      expect(g.table.world.down[idx], `${id} is down`).toBe(1);
      expect(down(g).filter((d) => d === 1), `${id}: only that one`).toHaveLength(1);
      // a second ball through the same place meets nothing there now
      const again: string[] = [];
      seen.length = 0;
      Object.assign(g.table.world.balls[0]!, { x: from[0] / 1000, y: from[1] / 1000, vx, vy: 0, zone: 0 });
      for (let i = 0; i < 400; i++) tick(g);
      again.push(...seen);
      expect(again.includes(id), `${id}: no second hit while down`).toBe(false);
    }
  });

  it("pays a bank when its third target goes down, and brings the bank up after the reset time, not before", () => {
    const { g, seen } = play();
    g.table.world.gravity = 0;
    // hit the three left targets one after the other, with the ball put in front of each
    const starts: [number, number][] = [[105, 515], [115, 545], [125, 575]];
    for (const [x, y] of starts) {
      Object.assign(g.table.world.balls[0]!, { x: x / 1000, y: y / 1000, vx: 0.9, vy: 0, zone: 0 });
      for (let i = 0; i < 300; i++) tick(g);
    }
    expect(seen.filter((s) => s.startsWith("fungusL"))).toEqual(["fungusL1", "fungusL2", "fungusL3"]);
    const idxs = ["fungusL1", "fungusL2", "fungusL3"].map((id) => g.table.dropIds.indexOf(id));
    expect(idxs.map((i) => g.table.world.down[i])).toEqual([1, 1, 1]);
    for (let i = 0; i < FUNGUS_RESET - 400; i++) tick(g);
    // not up before the time (the ball may still be rolling about; the targets do not care)
    expect(idxs.map((i) => g.table.world.down[i]), "still down before the reset").toEqual([1, 1, 1]);
    for (let i = 0; i < 600; i++) tick(g);
    expect(idxs.map((i) => g.table.world.down[i]), "up again").toEqual([0, 0, 0]);
    expect(FUNGUS_BANK).toBeLessThan(1_000_000);
  });

  it("lets no ball rest for ever with the left bank down, the right bank down, or both", () => {
    for (const downIds of [["fungusL1", "fungusL2", "fungusL3"], ["fungusR1", "fungusR2", "fungusR3"], ["fungusL1", "fungusL2", "fungusL3", "fungusR1", "fungusR2", "fungusR3"]]) {
      expect(restGrid(colonyTable, { x: [100, 400, 30], y: [450, 700, 30], ticks: 120000, create: (def) => createGame(def, { rules: colonyRules }), setup: (g) => { for (const id of downIds) g.table.world.down[g.table.dropIds.indexOf(id)] = 1; } }), downIds.join()).toEqual([]);
    }
  }, 120000);

  it("can be reached by a flipper: some timing of some flipper hits a target of each bank", () => {
    const sweep = (start: [number, number], button: "left" | "right", prefix: string) => {
      let hit = 0;
      for (let press = 200; press <= 1300; press += 25) {
        const { g, seen } = play();
        drop(g, start[0], start[1]);
        for (let i = 0; i < 4000 && g.table.world.balls.length > 0; i++) {
          g.input[button] = i >= press && i < press + 100;
          tick(g);
        }
        if (seen.some((s) => s.startsWith(prefix))) hit++;
      }
      return hit;
    };
    const starts: [[number, number], "left" | "right"][] = [[[85, 760], "left"], [[403, 760], "right"], [[25, 480], "left"]];
    for (const prefix of ["fungusL", "fungusR"]) expect(Math.max(...starts.map(([s, b]) => sweep(s, b, prefix))), prefix).toBeGreaterThan(0);
  }, 240000);

  it("kicks the ball up the left outlane when the kickback is lit (once per ball), well clear of the lane, with margin on the kick speed", () => {
    const run = (speed: number) => {
      const { g, seen } = play();
      const t = g.table.world.triggers[g.table.triggerIds.indexOf("kickbackL")]!;
      t.kickSpeed = speed;
      drop(g, 32, 900);
      let top = 2;
      for (let i = 0; i < 3000 && g.table.world.balls.length > 0; i++) {
        tick(g);
        const b = g.table.world.balls[0];
        if (b && seen.includes("kickbackL")) top = Math.min(top, b.y);
      }
      return { top: top * 1000, seen };
    };
    const real = run(KICKBACK_SPEED);
    expect(real.seen.filter((s) => s === "kickbackL"), "caught once").toHaveLength(1);
    expect(real.top, "the ball leaves the lane at the top (y < 700) ...").toBeLessThan(700);
    // ... and a kick 25 % weaker would still leave it (margin)
    expect(run(KICKBACK_SPEED * 0.75).top).toBeLessThan(770);
    // a weak kick does not
    expect(run(0.3).top).toBeGreaterThan(770);
  });

  it("lets a second ball at the kickback drain: the kickback is spent for the ball, the sinkhole lets it go without a kick", () => {
    const { g, seen } = play();
    drop(g, 32, 900);
    // first time: kicked up; the ball comes down the lane again and is caught a second time
    expect(drains(g, 40000)).toBe(true);
    expect(seen.filter((s) => s === "kickbackL").length).toBeGreaterThanOrEqual(1);
    const caught = seen.filter((s) => s === "kickbackL").length;
    // every capture after the first is let go: the ball drains (it did), and at most a few catches
    expect(caught).toBeLessThanOrEqual(3);
    expect(g.drains).toBe(1);
  });
});

describe("The Colony, step 2b: the orbits, the spinners and the Pheromone Loop", () => {
  const trig = (id: string) => colonyTable.triggers!.find((t) => t.id === id)!;

  it("pins the orbit and loop triggers (placeholders: change them on purpose), all plain rollovers in zone 0", () => {
    expect(["orbitWIn", "spinW", "orbitWOut", "orbitEIn", "spinE", "orbitEOut", "loopL", "loopR"].map((id) => [id, trig(id).at, trig(id).r, trig(id).hold, trig(id).zones])).toEqual([
      ["orbitWIn", [33, 545], 14, undefined, undefined],
      ["spinW", [33, 420], 14, undefined, undefined],
      ["orbitWOut", [33, 235], 14, undefined, undefined],
      ["orbitEIn", [455, 500], 14, undefined, undefined],
      ["spinE", [455, 400], 14, undefined, undefined],
      ["orbitEOut", [455, 290], 14, undefined, undefined],
      ["loopL", [82, 100], 12, undefined, undefined],
      ["loopR", [438, 100], 12, undefined, undefined],
    ]);
  });

  it("has the East corridor free of the Dig Ramp's mouth: the East triggers lie right of the mouth gate (x 392 to 452) and clear of the plunger lane wall", () => {
    for (const id of ["orbitEIn", "spinE", "orbitEOut"]) {
      const t = trig(id);
      expect(t.at[0] - t.r, id).toBeGreaterThanOrEqual(441); // a ball hugging the wall (centre x 469.5) and one 15 mm left of it both count
      expect(t.at[0] + t.r, id).toBeLessThanOrEqual(483);
    }
    for (const id of ["orbitWIn", "spinW", "orbitWOut"]) expect(trig(id).at[0] - trig(id).r, id).toBeGreaterThanOrEqual(5);
  });

  it("has the upper right flipper as the mirror of the upper left one about x = 244: same shape, mirrored angles, the right button, and clear of the Root Ramp lane", () => {
    const [ul, ur] = ["upperLeft", "upperRight"].map((id) => colonyTable.flippers.find((f) => f.id === id)!);
    expect(ur!.input).toBe("right");
    expect([ur!.restDeg, ur!.activeDeg]).toEqual([150, 210]); // 180 - 30 and 180 + 30: the mirror of 30 and -30
    expect(ur!.pivot[0]).toBe(488 - ul!.pivot[0]);
    expect(ur!.pivot[0] + ur!.rBase).toBeLessThan(483); // inside the plunger lane wall
  });

  it("swings the upper right flipper with the right button only", () => {
    const { g } = play();
    const u = () => g.table.world.flippers[g.table.flipperIds.indexOf("upperRight")]!.u;
    g.input.left = true;
    for (let i = 0; i < 100; i++) tick(g);
    expect(u()).toBe(0);
    g.input.left = false;
    g.input.right = true;
    for (let i = 0; i < 100; i++) tick(g);
    expect(u()).toBe(1);
  });

  it("hears a trail when a ball goes up an orbit past its spinner, in that order, and the shot is paid", () => {
    for (const [shot, path] of [["trailWest", [[33, 560], [33, 400]]], ["trailEast", [[455, 548], [455, 380]]]] as const) {
      const shots: string[] = [];
      const seen: string[] = [];
      const rules: TableRules = { ...colonyRules, onSwitch: (c, e) => { seen.push(e.sw); colonyRules.onSwitch?.(c, e); }, onShot: (c, s, e) => { shots.push(s); colonyRules.onShot?.(c, s, e); } };
      const g = createGame(colonyTable, { rules });
      g.table.world.gravity = 0;
      Object.assign(g.table.world.balls[0]!, { x: path[0]![0]! / 1000, y: path[0]![1]! / 1000, vx: 0, vy: -1.5, zone: 0 });
      for (let i = 0; i < 300; i++) tick(g);
      expect(shots, shot).toContain(shot);
      expect(seen.filter((x) => /^(orbit|spin)/.test(x)).slice(0, 2), shot).toEqual(shot === "trailWest" ? ["orbitWIn", "spinW"] : ["orbitEIn", "spinE"]);
    }
  });

  it("does not hear a trail when a ball comes down an orbit (spinner first, then the entrance)", () => {
    for (const [shot, x] of [["trailWest", 33], ["trailEast", 455]] as const) {
      const shots: string[] = [];
      const rules: TableRules = { ...colonyRules, onShot: (c, s, e) => { shots.push(s); colonyRules.onShot?.(c, s, e); } };
      const g = createGame(colonyTable, { rules });
      g.table.world.gravity = 0;
      Object.assign(g.table.world.balls[0]!, { x: x / 1000, y: 0.4, vx: 0, vy: 1.5, zone: 0 });
      for (let i = 0; i < 300; i++) tick(g);
      expect(shots, shot).not.toContain(shot);
    }
  });

  it("hears the Pheromone Loop for loopL then loopR, and not for loopR then loopL (the way a plunger ball goes round the dome)", () => {
    const forward = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots, seed: 1 });
    forward.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    forward.take();
    const before = forward.state.player.score;
    forward.at(10).hit("loopL").at(30).hit("loopR").run(31);
    expect(forward.state.player.score - before).toBe(LOOP_SHOT);
    const back = harness(colonyRules, { flow: colonyFlow, shots: colonyTable.shots, seed: 1 });
    back.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    back.take();
    const b0 = back.state.player.score;
    back.at(10).hit("loopR").at(30).hit("loopL").run(31);
    expect(back.state.player.score - b0).toBe(0);
  });

  it("pays a trail 100,000 and the loop 150,000, and each spin 5,000", () => {
    expect([TRAIL_SHOT, LOOP_SHOT, SWITCH_POINTS.spinW, SWITCH_POINTS.spinE]).toEqual([100_000, 150_000, 5_000, 5_000]);
  });

  it("can be reached by a flipper: the upper left flipper sends a ball up Trail West and round the Pheromone Loop, the upper right flipper up Trail East", () => {
    const sweep = (start: [number, number], button: "left" | "right", want: string) => {
      let hit = 0;
      for (let press = 200; press <= 1300; press += 10) {
        const shots: string[] = [];
        const rules: TableRules = { ...colonyRules, onShot: (c, s, e) => { shots.push(s); colonyRules.onShot?.(c, s, e); } };
        const g = createGame(colonyTable, { rules });
        drop(g, start[0], start[1]);
        for (let i = 0; i < 4000 && g.table.world.balls.length > 0; i++) {
          g.input[button] = i >= press && i < press + 100;
          tick(g);
        }
        if (shots.includes(want)) hit++;
      }
      return hit;
    };
    expect(sweep([25, 480], "left", "trailWest"), "upper left -> Trail West").toBeGreaterThan(0);
    expect(sweep([25, 480], "left", "pheromoneLoop"), "upper left -> Pheromone Loop").toBeGreaterThan(0);
    expect(sweep([463, 450], "right", "trailEast"), "upper right -> Trail East").toBeGreaterThan(0);
  }, 240000);

  it("lets no ball rest for ever around the new flipper and the orbit corridors", () => {
    expect(restGrid(colonyTable, { x: [400, 480, 10], y: [250, 700, 25], create: (def) => createGame(def, { rules: colonyRules }) })).toEqual([]);
  }, 120000);
});
