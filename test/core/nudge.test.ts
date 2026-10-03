import { describe, expect, it } from "vitest";
import { nudge, step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { createWorld } from "../../src/core/world";
import { ball, wall } from "./helpers";

describe("nudge", () => {
  it("adds the velocity change to every free ball, and says how many it kicked", () => {
    const w = createWorld({ balls: [ball({ x: 0.1, y: 0.1, vx: 1, vy: -2 }), ball({ x: 0.2, y: 0.2 })], segments: [], circles: [], gravity: 0 });
    expect(nudge(w, 0.25, -0.5)).toBe(2);
    expect([w.balls[0]!.vx, w.balls[0]!.vy]).toEqual([1.25, -2.5]);
    expect([w.balls[1]!.vx, w.balls[1]!.vy]).toEqual([0.25, -0.5]);
  });

  it("leaves a ball held in a sinkhole alone, and counts only the others", () => {
    const w = createWorld({ balls: [ball({ hold: 1 }), ball({ x: 0.2 })], segments: [], circles: [], gravity: 0 });
    expect(nudge(w, 1, 1)).toBe(1);
    expect([w.balls[0]!.vx, w.balls[0]!.vy]).toEqual([0, 0]);
    expect([w.balls[1]!.vx, w.balls[1]!.vy]).toEqual([1, 1]);
  });

  it("does nothing, and says 0, on a table with no ball", () => {
    expect(nudge(createWorld({ balls: [], segments: [], circles: [], gravity: 0 }), 1, 1)).toBe(0);
  });

  it("changes nothing but the velocity: position, spin and zone stay", () => {
    const w = createWorld({ balls: [ball({ x: 0.1, y: 0.3, w: 5, zone: 2 })], segments: [], circles: [], gravity: 0 });
    nudge(w, 0.2, 0.2);
    const b = w.balls[0]!;
    expect([b.x, b.y, b.w, b.zone, b.hold]).toEqual([0.1, 0.3, 5, 2, 0]);
  });

  it("moves the ball on the next step by the change it was given, and plays out the same every time", () => {
    const run = () => {
      const w = createWorld({ balls: [ball({ x: 0.26, y: 0.5 })], segments: [wall(0, 0, 0.52, 0), wall(0.52, 0, 0.52, 1), wall(0.52, 1, 0, 1), wall(0, 1, 0, 0)], circles: [], gravity: 1.1 });
      for (let i = 0; i < 100; i++) step(w);
      nudge(w, 0.25, 0);
      for (let i = 0; i < 400; i++) step(w);
      return w;
    };
    expect(hashWorld(run())).toBe(hashWorld(run()));
    const plain = createWorld({ balls: [ball({ x: 0.26, y: 0.5 })], segments: [wall(0, 0, 0.52, 0), wall(0.52, 0, 0.52, 1), wall(0.52, 1, 0, 1), wall(0, 1, 0, 0)], circles: [], gravity: 1.1 });
    for (let i = 0; i < 500; i++) step(plain);
    expect(hashWorld(run())).not.toBe(hashWorld(plain));
    expect(run().balls[0]!.x).toBeGreaterThan(plain.balls[0]!.x); // shoved to +x
  });
});
