import { describe, expect, it } from "vitest";
import { advance, createGame, tick } from "../../src/sim/game";
import type { Game } from "../../src/sim/game";
import type { TableRules } from "../../src/rules";
import { colonyRules } from "../../src/tables/colony-rules";
import { CHAMBER_HOLD } from "../../src/tables/colony-scoring";
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

  it("is the table of the spec: 520 x 1050 mm, 6.5 degrees, a 27 mm ball, a 58 mm flipper pair and the upper flipper, one plunger", () => {
    expect(colonyTable.playfield).toEqual({ width: 520, length: 1050, slopeDeg: 6.5 });
    expect(colonyTable.ball.radius * 2).toBe(27);
    expect(colonyTable.flippers.map((f) => [f.id, f.length, f.input ?? null])).toEqual([["left", 58, null], ["right", 58, null], ["upperLeft", 58, "left"]]);
    expect(colonyTable.plunger).toBeDefined();
  });

  it("has a skill shot of three lane switches up the plunger lane, and the frozen switch names", () => {
    expect(colonyTable.shots).toEqual({ skillShot: ["skill1", "skill2", "skill3"], scout: ["scout"], leafRamp: ["leafEnter", "leafExit"], rootRamp: ["rootEnter", "rootExit"], broodChamber: ["brood"], queensChamber: ["queen"], mushroomHole: ["mushroom"] });
    const names = [...(colonyTable.triggers ?? []).map((t) => t.switch), ...colonyTable.walls.flatMap((w) => (w.switch ? [w.switch] : [])), ...colonyTable.posts.flatMap((p) => (p.switch ? [p.switch] : [])), ...(colonyTable.gates ?? []).flatMap((g) => (g.switch ? [g.switch] : []))].sort();
    expect(names).toEqual(["brood", "bumper1", "bumper2", "bumper3", "inL", "inR", "kickbackL", "leafEnter", "leafExit", "mushroom", "outL", "outR", "queen", "rollO", "rollR", "rollW", "rootEnter", "rootExit", "scout", "skill1", "skill2", "skill3", "slingL", "slingR"]);
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
    expect(seen).toEqual(["outL", "kickbackL"]); // the kickback lane lies below the outlane rollover
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
    const ramps = colonyTable.visual!.ramps!;
    expect(ramps.map((r) => r.zone)).toEqual([1, 2]);
    expect(colonyTable.visual!.heights).toEqual([0, 48, 48]);
    for (const r of ramps) {
      expect(r.heights, `zone ${r.zone}`).toEqual([0, 48]);
      const rails = colonyTable.walls.filter((w) => w.zones?.length === 1 && w.zones[0] === r.zone);
      expect(rails, `zone ${r.zone} rails`).toHaveLength(2);
      const gates = colonyTable.gates!.filter((g) => g.zoneA === r.zone || g.zoneB === r.zone);
      expect(gates.map((g) => [g.zoneA, g.zoneB])).toEqual([[0, r.zone], [r.zone, 0]]);
    }
  });

  it("builds each ramp where its picture is: rails at the edges of the drawn path, the gates between them, the mouth at the start of the path and the exit at its end", () => {
    for (const r of colonyTable.visual!.ramps!) {
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
      expect(seen, name).toEqual([enter, exit]);
      expect(zones.has(zone), name).toBe(true);
      expect(shots, name).toEqual([name]);
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
      ["brood", [85, 665], 12, { kickDeg: -25, kickSpeed: 1.8 }],
      ["queen", [260, 470], 12, { kickDeg: -110, kickSpeed: 1.6 }],
      ["mushroom", [244, 555], 12, { kickDeg: 100, kickSpeed: 1.2 }],
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
