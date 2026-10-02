import { describe, expect, it } from "vitest";
import { step } from "../../src/core/step";
import { hashWorld } from "../../src/core/hash";
import { createWorld } from "../../src/core/world";
import { slopeGravity } from "../../src/core/world";
import type { Ball, Flipper, World } from "../../src/core/types";
import { BALL_R, ball, leftFlipper } from "./helpers";

/** Distance from the ball centre to the flipper's axis, minus the local radius, minus the ball radius. */
function clearance(f: Flipper, b: Ball): number {
  const rx = b.x - f.px;
  const ry = b.y - f.py;
  let u = (rx * f.dx + ry * f.dy) / f.length;
  u = Math.max(0, Math.min(1, u));
  const cx = f.px + f.dx * f.length * u;
  const cy = f.py + f.dy * f.length * u;
  const local = f.r0 + (f.r1 - f.r0) * u;
  return Math.hypot(b.x - cx, b.y - cy) - local - b.r;
}

/** A ball resting on top of the resting flipper at `along` metres from the pivot (flipper rests 30 deg down-right). */
function restingBall(f: Flipper, along: number): Ball {
  const ax = f.px + f.dx * along;
  const ay = f.py + f.dy * along;
  const local = f.r0 + ((f.r1 - f.r0) * along) / f.length;
  const nx = f.dy; // upward normal (y is down): (dy, -dx)
  const ny = -f.dx;
  const gap = local + BALL_R + 1e-5;
  return ball({ x: ax + nx * gap, y: ay + ny * gap });
}

function run(w: World, ticks: number, each?: () => void) {
  for (let i = 0; i < ticks; i++) {
    step(w);
    each?.();
  }
}

describe("ball on a flipper", () => {
  it("never sinks into a resting flipper while rolling along it", () => {
    const f = leftFlipper();
    const b = restingBall(f, 0.015);
    const w = createWorld({ balls: [b], segments: [], circles: [], flippers: [f], gravity: slopeGravity(6.5) });
    let worst = Infinity;
    run(w, 3000, () => {
      if (b.x < f.tx - 0.01) worst = Math.min(worst, clearance(f, b));
    });
    expect(worst).toBeGreaterThan(-0.0005);
    expect(b.x).toBeGreaterThan(f.px + 0.02); // it did roll towards the tip
  });
});

describe("ball riding a rising flipper", () => {
  it("is carried up without sinking into it", () => {
    const f = leftFlipper({ e: 0, mu: 0.3 });
    const b = restingBall(f, 0.03);
    const w = createWorld({ balls: [b], segments: [], circles: [], flippers: [f], gravity: slopeGravity(6.5) });
    f.on = true;
    let worst = Infinity;
    run(w, 40, () => (worst = Math.min(worst, clearance(f, b))));
    expect(worst).toBeGreaterThan(-0.0001); // 0.1 mm
  });
});

describe("flipper strike", () => {
  /** Fastest ball speed in the first `ticks` ms after the button goes down. */
  function strike(along: number, e = 0.5, ticks = 5): number {
    const f = leftFlipper({ e, mu: 0 });
    const b = restingBall(f, along);
    const w = createWorld({ balls: [b], segments: [], circles: [], flippers: [f], gravity: 0 });
    f.on = true;
    let fastest = 0;
    run(w, ticks, () => (fastest = Math.max(fastest, Math.hypot(b.vx, b.vy))));
    return fastest;
  }

  it("sends the ball away on the first strike, but never faster than (1 + e) times the surface speed", () => {
    const f = leftFlipper();
    const along = 0.05;
    const dist = Math.hypot(restingBall(f, along).x - f.px, restingBall(f, along).y - f.py);
    const omega = (60 * Math.PI) / 180 / 0.04;
    const v = strike(along, 0.5);
    expect(v).toBeGreaterThan(0.5 * omega * dist * 0.5);
    expect(v).toBeLessThan(1.5 * omega * dist * 1.05);
  });

  it("stays below a sanity ceiling even when the swing strikes the ball again", () => {
    const omega = (60 * Math.PI) / 180 / 0.04;
    const ceiling = 2 * 1.5 * omega * (0.06 + 0.005 + BALL_R);
    for (const along of [0.02, 0.035, 0.05]) expect(strike(along, 0.5, 80)).toBeLessThan(ceiling);
  });

  it("hits harder the further from the pivot the ball is", () => {
    const near = strike(0.02);
    const mid = strike(0.035);
    const far = strike(0.05);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(mid);
  });

  it("transfers more speed with higher restitution", () => {
    expect(strike(0.045, 0.8)).toBeGreaterThan(strike(0.045, 0.1));
  });

  it("gives no speed to a ball that is not touched", () => {
    const f = leftFlipper();
    const b = ball({ x: 0.4, y: 0.4 });
    const w = createWorld({ balls: [b], segments: [], circles: [], flippers: [f], gravity: 0 });
    f.on = true;
    run(w, 80);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });
});

describe("fast balls and swinging flippers", () => {
  it("never end up inside the flipper, from many angles at 20 m/s", () => {
    let seed = 99;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    let worst = Infinity;
    for (let i = 0; i < 200; i++) {
      const f = leftFlipper();
      // start 0.15 m above a random point of the flipper, aim at it with a random tilt
      const along = 0.005 + rnd() * 0.05;
      const tx = f.px + f.dx * along;
      const ty = f.py + f.dy * along;
      const tilt = (rnd() - 0.5) * 1.2;
      const speed = 8 + rnd() * 12;
      const b = ball({ x: tx - Math.sin(tilt) * 0.15, y: ty - Math.cos(tilt) * 0.15, vx: Math.sin(tilt) * speed, vy: Math.cos(tilt) * speed });
      const w = createWorld({ balls: [b], segments: [], circles: [], flippers: [f], gravity: 0 });
      f.on = rnd() < 0.7;
      run(w, 60, () => {
        if (b.x > f.px - 0.01 && b.x < f.tx + 0.01) worst = Math.min(worst, clearance(f, b));
      });
    }
    expect(worst).toBeGreaterThan(-0.001);
  });
});

describe("determinism with a flipper", () => {
  it("replays to the same hash", () => {
    const hashes = [0, 1].map(() => {
      const f = leftFlipper();
      const b = restingBall(f, 0.04);
      const w = createWorld({ balls: [b], segments: [], circles: [], flippers: [f], gravity: slopeGravity(6.5) });
      run(w, 300);
      f.on = true;
      run(w, 100);
      f.on = false;
      run(w, 600);
      return hashWorld(w);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});
