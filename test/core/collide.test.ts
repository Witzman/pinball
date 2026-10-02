import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { BALL_R, ball, wall, world } from "./helpers";

function run(w: ReturnType<typeof world>, ticks: number) {
  for (let i = 0; i < ticks; i++) step(w);
}

describe("segment collisions", () => {
  it("bounces off a floor with the restitution of the material", () => {
    // floor at y = 1, ball falls straight down at 2 m/s, e = 0.5, no friction
    const w = world([ball({ y: 0.9, vy: 2 })], [wall(-1, 1, 1, 1, { e: 0.5 })], 0);
    run(w, 200);
    expect(w.balls[0]!.vy).toBeCloseTo(-1, 6);
    expect(w.balls[0]!.y).toBeLessThan(1 - BALL_R + 1e-9);
  });

  it("never tunnels through a thin wall at 20 m/s from many angles", () => {
    // wall is the segment x = 0 for y in [-100, 100], long enough that the ball cannot pass its end; the ball starts left of it
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 300; i++) {
      const angle = (rnd() - 0.5) * Math.PI * 0.9; // incoming direction within +-81 deg of +x
      const speed = 5 + rnd() * 15;
      const b = ball({ x: -0.2, y: (rnd() - 0.5) * 0.6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      const w = world([b], [wall(0, -100, 0, 100)], 0);
      run(w, 100);
      expect(w.balls[0]!.x).toBeLessThan(0);
    }
  });

  it("is deflected by the end point of a segment", () => {
    // wall ends at y = 0; ball aims at the tip from the left, slightly above it
    const w = world([ball({ x: -0.1, y: -0.005, vx: 3 })], [wall(0, 0, 0, 1)], 0);
    run(w, 100);
    const b = w.balls[0]!;
    expect(b.vy).toBeLessThan(0); // pushed up, away from the tip
    expect(b.vx).toBeLessThan(3);
  });

  it("ignores a collider that does not exist in the ball's zone", () => {
    const w = world([ball({ y: 0.9, vy: 2, zone: 1 })], [wall(-1, 1, 1, 1, { zoneMask: 1 })], 0);
    run(w, 200);
    expect(w.balls[0]!.y).toBeGreaterThan(1);
  });
});

describe("circle colliders", () => {
  it("deflects a ball off a post", () => {
    const w = createWorld({
      balls: [ball({ x: -0.1, y: 0.005, vx: 3 })],
      segments: [],
      circles: [{ x: 0, y: 0, r: 0.01, e: 0.6, mu: 0, zoneMask: 1 }],
      gravity: 0,
    });
    run(w, 100);
    const b = w.balls[0]!;
    expect(b.vy).toBeGreaterThan(0.1); // pushed down, away from the post centre
    expect(b.vx).toBeLessThan(3);
  });
});
