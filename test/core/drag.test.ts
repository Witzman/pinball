import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { ball } from "./helpers";
import type { World } from "../../src/core/types";

function free(b = ball({ vx: 2, w: 40 }), extra: { drag?: number; spinDamping?: number } = {}): World {
  return createWorld({ balls: [b], segments: [], circles: [], gravity: 0, ...extra });
}

function run(w: World, ticks: number) {
  for (let i = 0; i < ticks; i++) step(w);
}

describe("rolling drag and spin damping", () => {
  it("leaves speed and spin alone by default", () => {
    const w = free();
    run(w, 1000);
    expect(w.balls[0]!.vx).toBe(2);
    expect(w.balls[0]!.w).toBe(40);
  });

  it("decays speed exponentially with the drag coefficient", () => {
    const w = free(ball({ vx: 2 }), { drag: 0.5 });
    run(w, 1000);
    expect(w.balls[0]!.vx).toBeCloseTo(2 * Math.exp(-0.5), 2);
  });

  it("decays spin with the spin damping coefficient", () => {
    const w = free(ball({ w: 40 }), { spinDamping: 2 });
    run(w, 1000);
    expect(w.balls[0]!.w).toBeCloseTo(40 * Math.exp(-2), 1);
  });
});
