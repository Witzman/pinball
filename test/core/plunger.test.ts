import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { createWorld, makePlunger, slopeGravity } from "../../src/core/world";
import type { Plunger, World } from "../../src/core/types";
import { BALL_R, ball, wall } from "./helpers";

/** A vertical lane 33 mm wide (x 0.485..0.515) launching upwards (-y); the face rests at y = 1.0. */
function lanePlunger(over: Partial<Parameters<typeof makePlunger>[0]> = {}): Plunger {
  return makePlunger({ x: 0.5, y: 1.0, dirx: 0, diry: -1, halfWidth: 0.0165, stroke: 0.08, maxSpeed: 6, pullSpeed: 0.4, e: 0.2, mu: 0, ...over });
}

function laneWorld(p: Plunger, balls = [ball({ x: 0.5, y: 1.0 - BALL_R - 1e-5 })]): World {
  return createWorld({
    balls,
    segments: [wall(0.4835, 1.1, 0.4835, 0.0), wall(0.5165, 1.1, 0.5165, 0.0)],
    circles: [],
    plunger: p,
    gravity: slopeGravity(6.5),
  });
}

function run(w: World, ticks: number, each?: () => void) {
  for (let i = 0; i < ticks; i++) {
    step(w);
    each?.();
  }
}

describe("plunger kinematics", () => {
  it("rests with its face at the rest position", () => {
    const p = lanePlunger();
    expect(p.pos).toBe(0);
    expect(p.vel).toBe(0);
  });

  it("is pulled back at the pull speed and stops at full stroke", () => {
    const p = lanePlunger();
    const w = laneWorld(p, []);
    p.pull = 1;
    run(w, 100); // 0.1 s * 0.4 m/s = 40 mm
    expect(p.pos).toBeCloseTo(0.04, 6);
    run(w, 300);
    expect(p.pos).toBeCloseTo(0.08, 9);
    run(w, 100);
    expect(p.pos).toBeCloseTo(0.08, 9);
  });

  it("holds a partial pull", () => {
    const p = lanePlunger();
    const w = laneWorld(p, []);
    p.pull = 0.4;
    run(w, 400);
    expect(p.pos).toBeCloseTo(0.032, 9);
    expect(p.vel).toBe(0);
  });

  it("flies forward on release at a speed proportional to the pull, then stops at rest", () => {
    const p = lanePlunger();
    const w = laneWorld(p, []);
    p.pull = 0.5;
    run(w, 200);
    p.pull = 0;
    step(w);
    expect(p.vel).toBeCloseTo(0.5 * 6, 9);
    run(w, 50);
    expect(p.pos).toBe(0);
    expect(p.vel).toBe(0);
  });
});

describe("launching a ball", () => {
  /** Fastest upward ball speed within 60 ms of the release, after a pull of `pull`. */
  function launch(pull: number): { v: number; b: World["balls"][number] } {
    const p = lanePlunger();
    const w = laneWorld(p);
    const b = w.balls[0]!;
    p.pull = pull;
    run(w, Math.ceil((pull * 0.08) / 0.4 / 0.001) + 50);
    p.pull = 0;
    let v = 0;
    run(w, 60, () => (v = Math.max(v, -b.vy)));
    return { v, b };
  }

  it("rests on the face under gravity without sinking in", () => {
    const p = lanePlunger();
    const w = laneWorld(p);
    run(w, 2000);
    expect(w.balls[0]!.y).toBeCloseTo(1.0 - BALL_R, 4);
    expect(Math.abs(w.balls[0]!.vy)).toBeLessThan(0.01);
  });

  it("settles on the face again after it is pulled back (gravity is only 1.1 m/s^2, so it takes a moment)", () => {
    const p = lanePlunger();
    const w = laneWorld(p);
    p.pull = 1;
    run(w, 1800);
    expect(w.balls[0]!.y).toBeCloseTo(1.0 + 0.08 - BALL_R, 3);
  });

  it("launches up the lane, between its walls, with a speed set by the pull", () => {
    const light = launch(0.3);
    const hard = launch(1);
    expect(light.v).toBeGreaterThan(0.3 * 6 * 0.8);
    expect(hard.v).toBeGreaterThan(light.v * 2.5);
    expect(hard.v).toBeLessThan(1.2 * 6 * 1.05); // (1 + e) * v at full pull
    expect(Math.abs(hard.b.x - 0.5)).toBeLessThan(0.0165);
  });

  it("replays to the same hash", () => {
    const hashes = [0, 1].map(() => hashWorld(laneWorldAfterLaunch()));
    expect(hashes[0]).toBe(hashes[1]);
  });
});

function laneWorldAfterLaunch(): World {
  const p = lanePlunger();
  const w = laneWorld(p);
  p.pull = 0.8;
  run(w, 300);
  p.pull = 0;
  run(w, 300);
  return w;
}
