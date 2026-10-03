import { describe, expect, it } from "vitest";
import { kickHeld, step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { hashWorld } from "../../src/core/hash";
import { CONTACT_CAPTURE, CONTACT_TRIGGER } from "../../src/core/types";
import type { Ball, Trigger, World } from "../../src/core/types";
import { ball } from "./helpers";

function trigger(over: Partial<Trigger> = {}): Trigger {
  return { x: 0.3, y: 0.5, r: 0.01, zoneMask: 1, sw: 5, hold: false, kickx: 0, kicky: -1, kickSpeed: 2, ...over };
}

function make(balls: Ball[], triggers: Trigger[], gravity = 0): World {
  return createWorld({ balls, segments: [], circles: [], triggers, gravity });
}

/** Runs `ticks` steps and returns every (switch, kind) event seen. */
function events(w: World, ticks: number): [number, number][] {
  const seen: [number, number][] = [];
  for (let i = 0; i < ticks; i++) {
    step(w);
    for (let c = 0; c < w.contacts.n; c++) seen.push([w.contacts.sw[c]!, w.contacts.kind[c]!]);
  }
  return seen;
}

describe("rollover triggers", () => {
  it("reports a ball once as it rolls through, and does not touch the ball", () => {
    const w = make([ball({ x: 0.2, y: 0.5, vx: 1 })], [trigger()]);
    expect(events(w, 300)).toEqual([[5, CONTACT_TRIGGER]]);
    expect(w.balls[0]!.vx).toBe(1);
    expect(w.balls[0]!.hold).toBe(0);
  });

  it("misses a ball that passes outside the radius", () => {
    const w = make([ball({ x: 0.2, y: 0.52, vx: 1 })], [trigger()]);
    expect(events(w, 300)).toEqual([]);
  });

  it("catches a ball whose path clips the edge, and one too fast to land inside it", () => {
    expect(events(make([ball({ x: 0.2, y: 0.5095, vx: 1 })], [trigger()]), 300)).toHaveLength(1);
    // 10 m/s = 1 cm per tick, the trigger is 2 cm wide: a tick can start before and end after it
    expect(events(make([ball({ x: 0.2999 - 0.005, y: 0.5, vx: 10 })], [trigger({ r: 0.002 })]), 50)).toHaveLength(1);
    expect(events(make([ball({ x: 0.2, y: 0.5, vx: 30 })], [trigger({ r: 0.002 })]), 50)).toHaveLength(1);
  });

  it("reports again when the ball leaves and comes back", () => {
    const w = make([ball({ x: 0.2, y: 0.5, vx: 1 })], [trigger()]);
    const first = events(w, 300);
    w.balls[0]!.vx = -1;
    const second = events(w, 300);
    expect([...first, ...second]).toEqual([[5, CONTACT_TRIGGER], [5, CONTACT_TRIGGER]]);
  });

  it("does not report a ball that starts inside, or one in another zone", () => {
    expect(events(make([ball({ x: 0.3, y: 0.5, vx: 1 })], [trigger()]), 100)).toEqual([]);
    expect(events(make([ball({ x: 0.2, y: 0.5, vx: 1, zone: 1 })], [trigger()]), 300)).toEqual([]);
    expect(events(make([ball({ x: 0.2, y: 0.5, vx: 1, zone: 1 })], [trigger({ zoneMask: 0b10 })]), 300)).toHaveLength(1);
  });

  it("stays silent without a switch", () => {
    expect(events(make([ball({ x: 0.2, y: 0.5, vx: 1 })], [trigger({ sw: 0 })]), 300)).toEqual([]);
  });
});

describe("sinkholes", () => {
  const sink = (over: Partial<Trigger> = {}) => trigger({ hold: true, ...over });

  it("captures the ball at its centre and holds it against gravity", () => {
    const w = make([ball({ x: 0.2, y: 0.455, vx: 1, vy: 0.2 })], [sink()], 5); // falls 4.5 cm on the way, so it arrives at y = 0.5
    expect(events(w, 400)).toEqual([[5, CONTACT_CAPTURE]]);
    const b = w.balls[0]!;
    expect([b.x, b.y, b.vx, b.vy, b.w, b.hold]).toEqual([0.3, 0.5, 0, 0, 0, 1]);
    for (let i = 0; i < 2000; i++) step(w);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([0.3, 0.5, 0, 0]);
  });

  it("kicks the ball out along its direction at its speed, and does not capture it again", () => {
    const w = make([ball({ x: 0.2, y: 0.5, vx: 1 })], [sink({ kickx: 0, kicky: -1, kickSpeed: 2 })]);
    events(w, 300);
    expect(kickHeld(w, 0)).toBe(0);
    const b = w.balls[0]!;
    expect([b.hold, b.vx, b.vy]).toEqual([0, 0, -2]);
    expect(events(w, 300)).toEqual([]);
    expect(b.y).toBeLessThan(0.5 - 0.1);
    expect(b.vy).toBe(-2);
  });

  it("returns -1 when nothing is held or the index is wrong", () => {
    const w = make([ball({ x: 0.1, y: 0.1 })], [sink()]);
    expect(kickHeld(w, 0)).toBe(-1);
    expect(kickHeld(w, 3)).toBe(-1);
    expect(kickHeld(w, -1)).toBe(-1);
  });

  it("lets a second ball roll over a full sinkhole and captures it once the first is out", () => {
    const w = make([ball({ x: 0.2, y: 0.5, vx: 1 }), ball({ x: 0.1, y: 0.5, vx: 1 })], [sink()]);
    const seen = events(w, 600);
    expect(seen).toEqual([[5, CONTACT_CAPTURE]]);
    expect(w.balls[0]!.hold).toBe(1);
    expect(w.balls[1]!.hold).toBe(0);
    expect(w.balls[1]!.x).toBeGreaterThan(0.35); // went through
    kickHeld(w, 0);
    w.balls[1]!.vx = -1;
    w.balls[1]!.x = 0.4;
    expect(events(w, 300)).toEqual([[5, CONTACT_CAPTURE]]);
    expect(w.balls[1]!.hold).toBe(1);
  });

  it("does not move a held ball for a flipper or a wall, and leaves other balls running", () => {
    const w = make([ball({ x: 0.2, y: 0.5, vx: 1 }), ball({ x: 0.1, y: 0.1, vy: 1 })], [sink()]);
    events(w, 400);
    expect(w.balls[0]!.hold).toBe(1);
    expect(w.balls[1]!.y).toBeGreaterThan(0.4);
  });

  it("does not capture in another zone", () => {
    const w = make([ball({ x: 0.2, y: 0.5, vx: 1, zone: 1 })], [sink()]);
    expect(events(w, 300)).toEqual([]);
    expect(w.balls[0]!.hold).toBe(0);
  });

  it("is part of the state hash only while a ball is held", () => {
    const a = make([ball({ x: 0.3, y: 0.5 })], [sink()]);
    const b = make([ball({ x: 0.3, y: 0.5 })], [sink()]);
    b.balls[0]!.hold = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
