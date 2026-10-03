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

/** Ticks until the ball drains, at most `max`; true if it did. */
function drains(g: Game, max = 25000): boolean {
  const before = g.drains;
  for (let i = 0; i < max && g.drains === before; i++) tick(g);
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

  it("launches from the plunger: a hard pull sends the ball round the dome and it drains, a hard pull passes the three skill lanes in order", () => {
    for (const ms of [150, 300, 600, 1000]) {
      const { g, seen } = play();
      g.input.plunge = true;
      advance(g, 50);
      for (let i = 0; i < ms; i++) tick(g);
      g.input.plunge = false;
      expect(drains(g, 40000), `pull ${ms} ms`).toBe(true);
      if (ms >= 600) expect(seen.slice(0, 3), `pull ${ms} ms`).toEqual(["skill1", "skill2", "skill3"]);
    }
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
