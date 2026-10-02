import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { BALL_R, ball, wall, world } from "./helpers";
import type { World } from "../../src/core/types";

function run(w: World, ticks: number) {
  for (let i = 0; i < ticks; i++) step(w);
}

function energy(w: World): number {
  let e = 0;
  for (const b of w.balls) {
    const inertia = 0.4 * b.m * b.r * b.r;
    e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) + 0.5 * inertia * b.w * b.w - b.m * w.gravity * b.y;
  }
  return e;
}

/** A closed box 0.4 m wide, 0.6 m tall, with lossy walls and friction. */
function box(balls = [ball({ x: 0.1, y: 0.1, vx: 1.7, vy: -0.9 })]): World {
  const o = { e: 0.6, mu: 0.2 };
  return world(
    balls,
    [wall(0, 0, 0.4, 0, o), wall(0.4, 0, 0.4, 0.6, o), wall(0.4, 0.6, 0, 0.6, o), wall(0, 0.6, 0, 0, o)],
    1.1,
  );
}

describe("friction and spin", () => {
  it("slows a ball sliding along a wall and spins it up", () => {
    const w = world([ball({ x: -BALL_R - 1e-4, vx: 1, vy: 2 })], [wall(0, -10, 0, 10, { mu: 0.3 })], 0);
    run(w, 50);
    const b = w.balls[0]!;
    expect(b.vy).toBeLessThan(2);
    expect(b.w).toBeLessThan(0);
  });

  it("does not change tangential speed on a frictionless wall", () => {
    const w = world([ball({ x: -BALL_R - 1e-4, vx: 1, vy: 2 })], [wall(0, -10, 0, 10, { mu: 0 })], 0);
    run(w, 50);
    expect(w.balls[0]!.vy).toBe(2);
    expect(w.balls[0]!.w).toBe(0);
  });
});

describe("resting contact", () => {
  it("comes to rest on a floor and stays there without jitter", () => {
    const w = world([ball({ y: 0.5 })], [wall(-1, 1, 1, 1, { e: 0.5 })], 1.1);
    run(w, 9000);
    const y9 = w.balls[0]!.y;
    run(w, 1000);
    const b = w.balls[0]!;
    expect(Math.abs(b.vy)).toBeLessThan(0.01);
    expect(b.y).toBeCloseTo(1 - BALL_R, 6);
    expect(Math.abs(b.y - y9)).toBeLessThan(1e-6);
  });
});

describe("energy", () => {
  it("never gains mechanical energy from static colliders", () => {
    const w = box();
    let prev = energy(w);
    for (let i = 0; i < 8000; i++) {
      step(w);
      const e = energy(w);
      expect(e).toBeLessThanOrEqual(prev + 1e-9);
      prev = e;
    }
  });

  it("keeps the ball inside the box", () => {
    const w = box();
    run(w, 8000);
    const b = w.balls[0]!;
    expect(b.x).toBeGreaterThan(BALL_R - 1e-6);
    expect(b.x).toBeLessThan(0.4 - BALL_R + 1e-6);
    expect(b.y).toBeGreaterThan(BALL_R - 1e-6);
    expect(b.y).toBeLessThan(0.6 - BALL_R + 1e-6);
  });
});

describe("determinism with collisions", () => {
  it("replays to the same hash every time", () => {
    const hashes = [0, 1, 2].map(() => {
      const w = box();
      run(w, 5000);
      return hashWorld(w);
    });
    expect(new Set(hashes).size).toBe(1);
  });
});
