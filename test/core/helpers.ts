import type { Ball, Segment, World } from "../../src/core/types";
import type { Flipper } from "../../src/core/types";
import { createWorld, makeFlipper } from "../../src/core/world";

export const BALL_R = 0.01350; // 27 mm ball

export function ball(over: Partial<Ball> = {}): Ball {
  return { x: 0, y: 0, vx: 0, vy: 0, w: 0, r: BALL_R, m: 0.08, zone: 0, ...over };
}

export function wall(ax: number, ay: number, bx: number, by: number, over: Partial<Segment> = {}): Segment {
  return { ax, ay, bx, by, e: 0.5, mu: 0, zoneMask: 1, sw: 0, ...over };
}

export function world(balls: Ball[], segments: Segment[] = [], gravity = 0): World {
  return createWorld({ balls, segments, circles: [], gravity });
}

const DEG = Math.PI / 180;

/** Left-style flipper: pivot at (0.2, 0.9), 60 mm long, resting 30 deg below horizontal, swinging to 30 deg above. */
export function leftFlipper(over: Partial<Parameters<typeof makeFlipper>[0]> = {}): Flipper {
  return makeFlipper({
    px: 0.2, py: 0.9, length: 0.06, r0: 0.0095, r1: 0.005,
    restRad: 30 * DEG, activeRad: -30 * DEG, upTime: 0.04, downTime: 0.1,
    e: 0.5, mu: 0.2, ...over,
  });
}
