import type { Ball, Segment, World } from "../../src/core/types";
import { createWorld } from "../../src/core/world";

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
