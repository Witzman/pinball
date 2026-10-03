import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld, makeFlipper } from "../../src/core/world";
import { ball, BALL_R, leftFlipper, wall } from "./helpers";
import type { Flipper, World } from "../../src/core/types";

const DEG = Math.PI / 180;

// A left flipper at the bottom of a lane whose left wall is 30 mm left of the pivot.
// Raised, the flipper leaves a wedge between its upper face and the wall: a ball
// dropped in it is pinched, the worst case for jitter, tunnelling and energy gain.
function wedge(ballX: number, ballY: number, flipper: Flipper = leftFlipper()): World {
  const walls = [wall(0.17, 0.5, 0.17, 1.2), wall(0.17, 1.2, 0.6, 1.2), wall(0.6, 1.2, 0.6, 0.5)];
  return createWorld({ balls: [ball({ x: ballX, y: ballY })], segments: walls, circles: [], gravity: 1.1, flippers: [flipper] });
}

/** How far (m) a ball of radius BALL_R at (x, y) sinks into the flipper capsule; 0 when clear. */
function overlap(f: Flipper, x: number, y: number): number {
  const along = Math.max(0, Math.min(f.length, (x - f.px) * f.dx + (y - f.py) * f.dy));
  const cx = f.px + f.dx * along;
  const cy = f.py + f.dy * along;
  const radius = f.r0 + ((f.r1 - f.r0) * along) / f.length;
  return Math.max(0, radius + BALL_R - Math.hypot(x - cx, y - cy));
}

function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(w);
}

describe("ball pinched between a flipper and a wall", () => {
  it("comes to rest next to a raised flipper and the wall, without leaving the lane", () => {
    const f = leftFlipper();
    const w = wedge(0.185, 0.8, f);
    f.on = true;
    run(w, 3000);
    const b = w.balls[0]!;
    // pinned on the pivot cap (r0 = 9.5 mm at (0.2, 0.9)) and the wall: about (0.1835, 0.884)
    expect(b.x).toBeCloseTo(0.17 + BALL_R, 3);
    expect(b.y).toBeGreaterThan(0.87);
    expect(b.y).toBeLessThan(0.9); // on top of the flipper, not through it to the floor at 1.19
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.05); // at rest, not jittering
  });

  it("does not gain energy while the flipper pinches it: speed stays bounded", () => {
    const f = leftFlipper();
    const w = wedge(0.185, 0.88, f);
    f.on = true;
    let maxSpeed = 0;
    for (let i = 0; i < 4000; i++) {
      step(w);
      maxSpeed = Math.max(maxSpeed, Math.hypot(w.balls[0]!.vx, w.balls[0]!.vy));
    }
    // free fall from the drop height plus one flipper strike (1+e)*omega*d, both well under 10 m/s
    expect(maxSpeed).toBeLessThan(10);
  });

  it("keeps the ball out of the wall and out of the flipper while the flipper swings into it", () => {
    const f = leftFlipper();
    const w = wedge(0.19, 0.8, f);
    let minX = Infinity;
    let deepest = 0;
    for (let i = 0; i < 6000; i++) {
      f.on = Math.floor(i / 150) % 2 === 0;
      step(w);
      const b = w.balls[0]!;
      minX = Math.min(minX, b.x);
      deepest = Math.max(deepest, overlap(f, b.x, b.y));
    }
    expect(minX).toBeGreaterThan(0.17 + BALL_R - 1e-3);
    // The ball may roll off the tip when the flipper is down (that is the game), but
    // it must never sink into the capsule: bounded by a few tenths of a millimetre.
    expect(deepest).toBeLessThan(5e-4);
  });

  it("is a pure function of the start: the same pinch plays out the same way twice", () => {
    const play = () => {
      const f = leftFlipper();
      const w = wedge(0.19, 0.8, f);
      for (let i = 0; i < 3000; i++) {
        f.on = Math.floor(i / 150) % 2 === 0;
        step(w);
      }
      return [w.balls[0]!.x, w.balls[0]!.y, w.balls[0]!.vx, w.balls[0]!.vy];
    };
    expect(play()).toEqual(play());
  });
});
