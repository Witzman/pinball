import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { CONTACT_GATE_AB, CONTACT_GATE_BA } from "../../src/core/types";
import type { Gate, World } from "../../src/core/types";
import { ball, BALL_R, wall } from "./helpers";

// Gate along y = 0.5 from x = 0.1 to x = 0.3, pointing right (+x). Side A is where
// cross(b - a, p - a) > 0: with y down that is BELOW the line (larger y).
function gate(over: Partial<Gate> = {}): Gate {
  return { ax: 0.1, ay: 0.5, bx: 0.3, by: 0.5, zoneA: 0, zoneB: 1, sw: 0, ...over };
}

function play(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(w);
}

function falling(x: number, y: number, vy: number, zone = 0, g: Gate[] = [gate()]): World {
  return createWorld({ balls: [ball({ x, y, vy, zone })], segments: [], circles: [], gates: g, gravity: 0 });
}

describe("zone gates", () => {
  it("moves a ball from zone A to zone B when it crosses from side A", () => {
    const w = falling(0.2, 0.55, -1); // below the line, moving up: A -> B
    play(w, 100);
    expect(w.balls[0]!.y).toBeLessThan(0.5);
    expect(w.balls[0]!.zone).toBe(1);
  });

  it("moves it back when it crosses from side B in zone B", () => {
    const w = falling(0.2, 0.45, 1, 1);
    play(w, 100);
    expect(w.balls[0]!.y).toBeGreaterThan(0.5);
    expect(w.balls[0]!.zone).toBe(0);
  });

  it("does nothing before the line is reached", () => {
    const w = falling(0.2, 0.55, -1);
    play(w, 10); // 1 cm
    expect(w.balls[0]!.zone).toBe(0);
  });

  it("leaves a ball alone whose zone does not match the side it crosses from", () => {
    const w = falling(0.2, 0.55, -1, 2);
    play(w, 100);
    expect(w.balls[0]!.zone).toBe(2);
    const w2 = falling(0.2, 0.45, 1, 0); // B -> A needs zone B (1)
    play(w2, 100);
    expect(w2.balls[0]!.zone).toBe(0);
  });

  it("ignores a ball that passes beside the gate", () => {
    const w = falling(0.4, 0.55, -1);
    play(w, 100);
    expect(w.balls[0]!.y).toBeLessThan(0.5);
    expect(w.balls[0]!.zone).toBe(0);
  });

  it("catches a fast ball that would jump the line within one tick", () => {
    const w = falling(0.2, 0.5004, -20); // 2 cm per tick
    play(w, 3);
    expect(w.balls[0]!.zone).toBe(1);
  });

  it("works on a slanted gate, in both directions", () => {
    // line y = x + 0.3 from (0.1, 0.4) to (0.3, 0.6); side A is below/right of it
    const g = gate({ ax: 0.1, ay: 0.4, bx: 0.3, by: 0.6 });
    const mk = (x: number, y: number, vx: number, zone: number) =>
      createWorld({ balls: [ball({ x, y, vx, zone })], segments: [], circles: [], gates: [g], gravity: 0 });
    const toB = mk(0.1, 0.5, 1, 0); // starts on side A, crosses at x = 0.2
    play(toB, 400);
    expect(toB.balls[0]!.zone).toBe(1);
    const toA = mk(0.3, 0.5, -1, 1); // starts on side B
    play(toA, 400);
    expect(toA.balls[0]!.zone).toBe(0);
    const wrongZone = mk(0.3, 0.5, -1, 0);
    play(wrongZone, 400);
    expect(wrongZone.balls[0]!.zone).toBe(0);
  });

  it("reports a crossing on the gate's switch with its direction, and only then", () => {
    const w = falling(0.2, 0.505, -1, 0, [gate({ sw: 7 })]);
    const seen: [number, number][] = [];
    for (let i = 0; i < 30; i++) {
      step(w);
      for (let c = 0; c < w.contacts.n; c++) seen.push([w.contacts.sw[c]!, w.contacts.kind[c]!]);
    }
    expect(seen).toEqual([[7, CONTACT_GATE_AB]]);
    w.balls[0]!.vy = 1;
    seen.length = 0;
    for (let i = 0; i < 30; i++) {
      step(w);
      for (let c = 0; c < w.contacts.n; c++) seen.push([w.contacts.sw[c]!, w.contacts.kind[c]!]);
    }
    expect(seen).toEqual([[7, CONTACT_GATE_BA]]);
  });

  it("changes the zone without a switch too, and records nothing", () => {
    const w = falling(0.2, 0.505, -1);
    let events = 0;
    for (let i = 0; i < 30; i++) {
      step(w);
      events += w.contacts.n;
    }
    expect(w.balls[0]!.zone).toBe(1);
    expect(events).toBe(0);
  });

  it("makes walls of the new zone solid and walls of the old zone disappear", () => {
    // gate at y = 0.5; a zone 0 wall at y = 0.3 and a zone 1 wall at y = 0.2, both above it
    const old = wall(0, 0.3, 0.5, 0.3, { zoneMask: 1 << 0, e: 0 });
    const ramp = wall(0, 0.2, 0.5, 0.2, { zoneMask: 1 << 1, e: 0 });
    const through = createWorld({ balls: [ball({ x: 0.2, y: 0.9, vy: -2 })], segments: [old, ramp], circles: [], gates: [gate()], gravity: 0 });
    play(through, 600);
    expect(through.balls[0]!.zone).toBe(1);
    // it passed the zone 0 wall at 0.3 and was stopped by the zone 1 wall at 0.2
    expect(through.balls[0]!.y).toBeGreaterThan(0.2 + BALL_R - 1e-3);
    expect(through.balls[0]!.y).toBeLessThan(0.3);
    // without the gate it stays in zone 0 and is stopped by the wall at 0.3
    const stays = createWorld({ balls: [ball({ x: 0.2, y: 0.9, vy: -2 })], segments: [old, ramp], circles: [], gates: [], gravity: 0 });
    play(stays, 600);
    expect(stays.balls[0]!.y).toBeGreaterThan(0.3);
  });
});

describe("gate edge cases", () => {
  it("applies two gates crossed in one tick in array order", () => {
    // zone 0 -> 1 at y = 0.5, then 1 -> 2 at y = 0.49; a fast ball crosses both in one tick
    const g1 = gate({ ay: 0.5, by: 0.5, zoneA: 0, zoneB: 1 });
    const g2 = gate({ ay: 0.49, by: 0.49, zoneA: 1, zoneB: 2 });
    const w = falling(0.2, 0.505, -20, 0, [g1, g2]); // 2 cm per tick
    step(w);
    expect(w.balls[0]!.zone).toBe(2);
    const reversed = falling(0.2, 0.505, -20, 0, [g2, g1]);
    step(reversed);
    expect(reversed.balls[0]!.zone).toBe(1); // g2 saw zone 0 first and did nothing
  });

  it("does nothing to a ball that rests exactly on the line", () => {
    const w = createWorld({ balls: [ball({ x: 0.2, y: 0.5 })], segments: [], circles: [], gates: [gate()], gravity: 0 });
    play(w, 100);
    expect(w.balls[0]!.zone).toBe(0);
  });

  it("crosses exactly once when a tick ends on the line and the next leaves it", () => {
    const w = falling(0.2, 0.5005, -1, 0, [gate({ sw: 3 })]);
    let events = 0;
    for (let i = 0; i < 5; i++) {
      step(w);
      events += w.contacts.n;
    }
    expect(events).toBe(1);
    expect(w.balls[0]!.zone).toBe(1);
  });
});

describe("one-way walls", () => {
  // Wall along y = 0.5, x 0..0.5, a->b pointing left: normal (-dy, dx) = (0, -0.5): up the table.
  const oneWay = wall(0.5, 0.5, 0, 0.5, { oneWay: true });

  it("lets a ball pass from behind (below) and keeps it from coming back", () => {
    const w = createWorld({ balls: [ball({ x: 0.25, y: 0.6, vy: -1 })], segments: [oneWay], circles: [], gravity: 2 });
    play(w, 300);
    // it went through, turned under gravity above the wall and is now held there
    expect(w.balls[0]!.y).toBeLessThan(0.5);
    play(w, 3000);
    expect(w.balls[0]!.y).toBeLessThan(0.5);
    expect(w.balls[0]!.y).toBeGreaterThan(0.5 - BALL_R - 1e-3);
  });

  it("blocks a ball coming from the front (above) like a normal wall", () => {
    const w = createWorld({ balls: [ball({ x: 0.25, y: 0.3, vy: 3 })], segments: [oneWay], circles: [], gravity: 0 });
    play(w, 400);
    expect(w.balls[0]!.y).toBeLessThanOrEqual(0.5 - BALL_R + 1e-6);
    expect(w.balls[0]!.vy).toBeLessThanOrEqual(0.0001);
  });

  it("does not catch a ball from behind on its end points", () => {
    const w = createWorld({ balls: [ball({ x: 0.0, y: 0.6, vy: -3 })], segments: [oneWay], circles: [], gravity: 0 });
    play(w, 100);
    expect(w.balls[0]!.y).toBeLessThan(0.45);
    expect(w.balls[0]!.vy).toBe(-3);
  });

  it("is an ordinary wall when oneWay is off", () => {
    const wallSeg = wall(0.5, 0.5, 0, 0.5);
    const w = createWorld({ balls: [ball({ x: 0.25, y: 0.6, vy: -3 })], segments: [wallSeg], circles: [], gravity: 0 });
    play(w, 100);
    expect(w.balls[0]!.y).toBeGreaterThan(0.5);
  });
});
