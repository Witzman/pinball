import { describe, expect, it } from "vitest";
import { advance, createGame, tick } from "../../src/sim/game";
import type { Game } from "../../src/sim/game";
import type { TableRules } from "../../src/rules";
import { allTables, tableSetups } from "../../src/tables";
import { colonyTable } from "../../src/tables/colony";
import { validateTable } from "../../src/table/validate";

/** A game of The Colony in free play that writes down the switches the rules hear, in order. */
function play(): { g: Game; seen: string[] } {
  const seen: string[] = [];
  const rules: TableRules = { modes: {}, onSwitch: (_c, e) => void seen.push(e.sw) };
  return { g: createGame(colonyTable, { rules }), seen };
}

/** Puts the (only) ball at rest at (x, y) mm. */
function drop(g: Game, x: number, y: number): void {
  Object.assign(g.table.world.balls[0]!, { x: x / 1000, y: y / 1000, vx: 0, vy: 0, zone: 0 });
}

/** Whether a ball centre at (x, y) mm would overlap a wall, a post or a flipper (a spawn artifact, not a place a ball can be). */
function insideWall(g: Game, x: number, y: number): boolean {
  const r = g.table.ballRadius * 1000;
  const near = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < r;
  };
  const w = g.table.world;
  if (w.segments.some((s) => near(s.ax * 1000, s.ay * 1000, s.bx * 1000, s.by * 1000))) return true;
  if (w.circles.some((c) => Math.hypot(x - c.x * 1000, y - c.y * 1000) < r + c.r * 1000)) return true;
  return colonyTable.flippers.some((f) => {
    const a = (f.restDeg * Math.PI) / 180;
    return near(f.pivot[0], f.pivot[1], f.pivot[0] + f.length * Math.cos(a), f.pivot[1] + f.length * Math.sin(a)) ;
  });
}

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

  it("is the table of the spec: 520 x 1050 mm, 6.5 degrees, a 27 mm ball, a 58 mm flipper pair, one plunger", () => {
    expect(colonyTable.playfield).toEqual({ width: 520, length: 1050, slopeDeg: 6.5 });
    expect(colonyTable.ball.radius * 2).toBe(27);
    expect(colonyTable.flippers.map((f) => [f.id, f.length])).toEqual([["left", 58], ["right", 58]]);
    expect(colonyTable.plunger).toBeDefined();
  });

  it("has a skill shot of three lane switches up the plunger lane, and the frozen switch names", () => {
    expect(colonyTable.shots).toEqual({ skillShot: ["skill1", "skill2", "skill3"] });
    const names = [...(colonyTable.triggers ?? []).map((t) => t.switch), ...colonyTable.walls.flatMap((w) => (w.switch ? [w.switch] : []))].sort();
    expect(names).toEqual(["inL", "inR", "kickbackL", "outL", "outR", "skill1", "skill2", "skill3", "slingL", "slingR"]);
  });

  it("lets no ball rest for ever: balls dropped at rest over a grid all drain", () => {
    const stuck: string[] = [];
    for (let y = 40; y <= 980; y += 47) {
      for (let x = 23; x <= 470; x += 31) {
        const { g } = play();
        if (insideWall(g, x, y)) continue; // a ball cannot be put there
        drop(g, x, y);
        if (!drains(g)) stuck.push(`(${x},${y})`);
      }
    }
    expect(stuck).toEqual([]);
  });

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
    for (const f of colonyTable.flippers) {
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
});
