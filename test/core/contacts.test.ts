import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { ball, wall } from "./helpers";

function setup(sw: number) {
  return createWorld({
    balls: [ball({ x: -0.1, y: 0, vx: 3 })],
    segments: [wall(0, -5, 0, 5, { sw })],
    circles: [],
    gravity: 0,
  });
}

describe("contact events", () => {
  it("records a hit on a collider with a switch id, with the impulse", () => {
    const w = setup(3);
    let seen = 0;
    for (let i = 0; i < 100 && seen === 0; i++) {
      step(w);
      seen = w.contacts.n;
    }
    expect(seen).toBe(1);
    expect(w.contacts.sw[0]).toBe(3);
    expect(w.contacts.ball[0]).toBe(0);
    expect(w.contacts.impulse[0]!).toBeGreaterThan(0.2); // m (1+e) v = 0.08 * 1.5 * 3 = 0.36
    expect(w.contacts.tick[0]).toBe(w.tick - 1);
  });

  it("records nothing for a collider without a switch", () => {
    const w = setup(0);
    for (let i = 0; i < 100; i++) {
      step(w);
      expect(w.contacts.n).toBe(0);
    }
  });

  it("clears the buffer at the start of every step", () => {
    const w = setup(3);
    let hitTick = -1;
    for (let i = 0; i < 100; i++) {
      step(w);
      if (w.contacts.n > 0) {
        hitTick = i;
        break;
      }
    }
    expect(hitTick).toBeGreaterThanOrEqual(0);
    step(w);
    expect(w.contacts.n).toBe(0);
  });
});
