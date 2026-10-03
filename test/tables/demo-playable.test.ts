import { describe, expect, it } from "vitest";
import { createGame, tick } from "../../src/sim/game";
import { demoTable } from "../../src/tables/demo";

/** Drops a ball at rest at (x, y) mm, flippers down, and ticks until it drains; false if it is still on the table after `ticks`. */
function drains(x: number, y: number, ticks = 25000): boolean {
  const g = createGame(demoTable);
  Object.assign(g.table.world.balls[0]!, { x: x / 1000, y: y / 1000, vx: 0, vy: 0 });
  for (let i = 0; i < ticks; i++) {
    tick(g);
    if (g.drains > 0) return true;
  }
  return false;
}

describe("the demo table has no place where a ball rests for ever", () => {
  it("drains a ball dropped on the standup target, wherever along it (not balanced exactly on its high end)", () => {
    for (const x of [310, 330, 350, 370, 380]) expect(drains(x, 470), `x=${x}`).toBe(true);
  });

  it("drains a ball dropped anywhere on a grid over the playfield (not in the sealed corner behind the deflector)", () => {
    const stuck: string[] = [];
    for (let y = 40; y <= 960; y += 74) {
      for (let x = 22; x <= 470; x += 58) {
        if (y < x - 390) continue; // above the deflector line (395,5)-(515,125): a ball cannot get there
        if (!drains(x, y)) stuck.push(`(${x},${y})`);
      }
    }
    expect(stuck).toEqual([]);
  });

  it("has a deflector that runs from the top wall to the right wall: nothing is left behind it", () => {
    const d = demoTable.walls.find((w) => w.type === "segment" && w.b[0] === 515 && w.b[1] === 125);
    expect(d).toBeDefined();
    if (d?.type === "segment") expect(d.a[1]).toBe(5); // it starts at the top wall (y=5)
  });
});
