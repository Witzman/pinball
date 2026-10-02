import type { World } from "../../src/core/types";
import { createWorld } from "../../src/core/world";
import { ball, wall } from "./helpers";

/** Deterministic pseudo-random numbers for scene building; not part of the game. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** A 0.52 x 1.05 m playfield with `n` short random guides, 3 balls, posts. */
export function crowded(n: number, seed = 7): World {
  const rnd = lcg(seed);
  const segments = [wall(0, 0, 0.52, 0), wall(0.52, 0, 0.52, 1.05), wall(0.52, 1.05, 0, 1.05), wall(0, 1.05, 0, 0)];
  for (let i = 0; i < n; i++) {
    const x = rnd() * 0.5;
    const y = rnd() * 1.0;
    segments.push(wall(x, y, x + 0.03, y + 0.02 * (rnd() - 0.5)));
  }
  const circles = [0, 1, 2, 3].map(() => ({ x: 0.05 + rnd() * 0.4, y: 0.05 + rnd() * 0.9, r: 0.012, e: 0.7, mu: 0.1, zoneMask: 1 }));
  return createWorld({
    balls: [ball({ x: 0.26, y: 0.1, vx: 1, vy: 1 }), ball({ x: 0.3, y: 0.2, vx: -1, vy: 0.5 }), ball({ x: 0.2, y: 0.3, vx: 0.5, vy: -1 })],
    segments,
    circles,
    gravity: 1.1,
  });
}
