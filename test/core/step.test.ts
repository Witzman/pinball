import { describe, expect, it } from "vitest";
import { DT, step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { ball, world } from "./helpers";

function run(w: ReturnType<typeof world>, ticks: number) {
  for (let i = 0; i < ticks; i++) step(w);
}

describe("fixed timestep and gravity", () => {
  it("runs at a constant 1 kHz step", () => {
    expect(DT).toBe(0.001);
  });

  it("accelerates a free ball along the gravity axis by g after one second", () => {
    const w = world([ball()], [], 1.1);
    run(w, 1000);
    expect(w.balls[0]!.vy).toBeCloseTo(1.1, 6);
    expect(w.balls[0]!.vx).toBe(0);
  });

  it("counts ticks", () => {
    const w = world([ball()], [], 0);
    run(w, 5);
    expect(w.tick).toBe(5);
  });
});

describe("determinism", () => {
  it("gives the same state hash for the same start", () => {
    const a = world([ball({ vx: 1.3, vy: 0.2 })], [], 1.1);
    const b = world([ball({ vx: 1.3, vy: 0.2 })], [], 1.1);
    run(a, 500);
    run(b, 500);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it("gives a different hash for a different start", () => {
    const a = world([ball({ vx: 1.3 })], [], 1.1);
    const b = world([ball({ vx: 1.4 })], [], 1.1);
    run(a, 500);
    run(b, 500);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
