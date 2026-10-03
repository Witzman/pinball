import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { hashWorld } from "../../src/core/hash";
import type { Ball, Magnet, World } from "../../src/core/types";
import { ball } from "./helpers";

function magnet(over: Partial<Magnet> = {}): Magnet {
  return { x: 0.3, y: 0.5, r: 0.05, strength: 10, zoneMask: 1, on: true, ...over };
}

function make(balls: Ball[], magnets: Magnet[], drag = 0): World {
  return createWorld({ balls, segments: [], circles: [], magnets, gravity: 0, drag });
}

function play(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(w);
}

describe("magnets", () => {
  it("pulls a ball towards the centre, along the line to it", () => {
    const w = make([ball({ x: 0.3, y: 0.53 })], [magnet()]);
    play(w, 10);
    const b = w.balls[0]!;
    expect(b.vy).toBeLessThan(0);
    expect(b.vx).toBe(0);
    expect(b.y).toBeLessThan(0.53);
    const diag = make([ball({ x: 0.33, y: 0.53 })], [magnet()]);
    play(diag, 10);
    expect(diag.balls[0]!.vx).toBeLessThan(0);
    expect(diag.balls[0]!.vy).toBeCloseTo(diag.balls[0]!.vx, 12);
  });

  it("accelerates by strength * (1 - d / r) at distance d", () => {
    const w = make([ball({ x: 0.3, y: 0.53 })], [magnet()]); // d = 0.03, r = 0.05: 10 * 0.4 = 4 m/s^2
    step(w);
    expect(w.balls[0]!.vy).toBeCloseTo(-4 * 0.001, 12);
  });

  it("pulls harder nearer the centre and not at all at or beyond the edge", () => {
    const pull = (d: number) => {
      const w = make([ball({ x: 0.3, y: 0.5 + d })], [magnet()]);
      step(w);
      return -w.balls[0]!.vy;
    };
    expect(pull(0.01)).toBeGreaterThan(pull(0.03));
    expect(pull(0.03)).toBeGreaterThan(pull(0.049));
    expect(pull(0.05)).toBeCloseTo(0, 15);
    expect(pull(0.2)).toBeCloseTo(0, 15);
  });

  it("does nothing while off, and starts when switched on", () => {
    const w = make([ball({ x: 0.3, y: 0.53 })], [magnet({ on: false })]);
    play(w, 50);
    expect(w.balls[0]!.vy).toBe(0);
    w.magnets[0]!.on = true;
    play(w, 50);
    expect(w.balls[0]!.vy).toBeLessThan(0);
  });

  it("only reaches balls in its zones", () => {
    const w = make([ball({ x: 0.3, y: 0.53, zone: 1 })], [magnet()]);
    play(w, 50);
    expect(w.balls[0]!.vy).toBe(0);
    const w2 = make([ball({ x: 0.3, y: 0.53, zone: 1 })], [magnet({ zoneMask: 0b10 })]);
    play(w2, 50);
    expect(w2.balls[0]!.vy).toBeLessThan(0);
  });

  it("ignores a ball held in a sinkhole", () => {
    const w = make([ball({ x: 0.3, y: 0.53, hold: 1 })], [magnet()]);
    play(w, 50);
    expect(w.balls[0]!.vy).toBe(0);
  });

  it("pulls a ball in a straight line without a push at the centre, and with drag it settles there", () => {
    const w = make([ball({ x: 0.33, y: 0.52 })], [magnet()], 8);
    play(w, 4000);
    const b = w.balls[0]!;
    expect(Math.hypot(b.x - 0.3, b.y - 0.5)).toBeLessThan(0.002);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.05);
  });

  it("deflects a passing ball towards it and speeds it up", () => {
    const passing = (on: boolean) => {
      const w = make([ball({ x: 0.2, y: 0.54, vx: 1 })], [magnet({ on })]);
      play(w, 200);
      return w.balls[0]!;
    };
    const off = passing(false);
    const on = passing(true);
    expect(off.y).toBeCloseTo(0.54, 9);
    expect(on.y).toBeLessThan(0.54);
  });

  it("adds two magnets", () => {
    const left = magnet({ x: 0.27 });
    const right = magnet({ x: 0.33 });
    const w = make([ball({ x: 0.3, y: 0.53 })], [left, right]); // symmetric: no sideways pull
    play(w, 20);
    expect(w.balls[0]!.vx).toBeCloseTo(0, 12);
    expect(w.balls[0]!.vy).toBeLessThan(0);
  });

  it("is part of the state hash only while on", () => {
    const off = make([ball({ x: 0.1, y: 0.1 })], [magnet({ on: false })]);
    const none = make([ball({ x: 0.1, y: 0.1 })], []);
    const on = make([ball({ x: 0.1, y: 0.1 })], [magnet({ on: true })]);
    expect(hashWorld(off)).toBe(hashWorld(none));
    expect(hashWorld(on)).not.toBe(hashWorld(none));
  });
});
