import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { leftFlipper } from "./helpers";
import type { Flipper, World } from "../../src/core/types";

const DEG = Math.PI / 180;

function withFlipper(f: Flipper): World {
  return createWorld({ balls: [], segments: [], circles: [], gravity: 0, flippers: [f] });
}

function run(w: World, ticks: number) {
  for (let i = 0; i < ticks; i++) step(w);
}

describe("flipper kinematics", () => {
  it("rests at the rest angle", () => {
    const f = leftFlipper();
    expect(Math.atan2(f.dy, f.dx)).toBeCloseTo(30 * DEG, 6);
    expect(f.tx).toBeCloseTo(0.2 + 0.06 * Math.cos(30 * DEG), 6);
    expect(f.ty).toBeCloseTo(0.9 + 0.06 * Math.sin(30 * DEG), 6);
  });

  it("swings to the active angle when the button is held and stops there", () => {
    const f = leftFlipper();
    const w = withFlipper(f);
    f.on = true;
    run(w, 60);
    expect(f.u).toBe(1);
    expect(Math.atan2(f.dy, f.dx)).toBeCloseTo(-30 * DEG, 5);
    run(w, 200);
    expect(f.u).toBe(1);
    expect(f.omega).toBe(0);
  });

  it("swings at the angular speed the swing time implies", () => {
    const f = leftFlipper();
    const w = withFlipper(f);
    f.on = true;
    run(w, 10);
    // 60 degrees in 40 ms = 26.18 rad/s, towards decreasing angle
    expect(f.omega).toBeCloseTo(-(60 * DEG) / 0.04, 3);
  });

  it("returns to rest, slower, when released", () => {
    const f = leftFlipper();
    const w = withFlipper(f);
    f.on = true;
    run(w, 60);
    f.on = false;
    run(w, 50);
    expect(f.u).toBeGreaterThan(0);
    expect(f.omega).toBeGreaterThan(0);
    expect(f.omega).toBeCloseTo((60 * DEG) / 0.1, 3);
    run(w, 100);
    expect(f.u).toBe(0);
    expect(f.omega).toBe(0);
  });

  it("keeps the axis a unit vector at every point of the swing", () => {
    const f = leftFlipper();
    const w = withFlipper(f);
    f.on = true;
    for (let i = 0; i < 50; i++) {
      step(w);
      expect(Math.hypot(f.dx, f.dy)).toBeCloseTo(1, 12);
    }
  });

  it("is on the straight swing arc halfway through", () => {
    const f = leftFlipper();
    const w = withFlipper(f);
    f.on = true;
    run(w, 20); // half of 40 ms
    expect(f.u).toBeCloseTo(0.5, 9);
    expect(Math.atan2(f.dy, f.dx)).toBeCloseTo(0, 4);
  });
});
