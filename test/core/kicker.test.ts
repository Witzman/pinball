import { describe, expect, it } from "vitest";
import { hashWorld } from "../../src/core/hash";
import { step } from "../../src/core/step";
import { createWorld } from "../../src/core/world";
import { CONTACT_HIT, CONTACT_KICK } from "../../src/core/types";
import type { Circle, Segment, World } from "../../src/core/types";
import { ball, BALL_R, wall } from "./helpers";

// A floor at y = 0.5, normal up the table: a ball above it moving down hits it.
const KICK = 2;
function floor(over: Partial<Segment> = {}): Segment {
  return wall(0, 0.5, 1, 0.5, { e: 0.5, sw: 1, kick: KICK, kickMin: 0.3, kickCd: 30, kid: 0, ...over });
}

function make(vy: number, seg: Segment[] = [floor()], gravity = 0, kickers = 1): World {
  return createWorld({ balls: [ball({ x: 0.5, y: 0.5 - BALL_R - 0.002, vy })], segments: seg, circles: [], gravity, kickWait: new Int32Array(kickers) });
}

/** Steps and writes down every switch contact: [kind, impulse]. */
function run(w: World, ticks: number): [number, number][] {
  const seen: [number, number][] = [];
  for (let i = 0; i < ticks; i++) {
    step(w);
    for (let k = 0; k < w.contacts.n; k++) seen.push([w.contacts.kind[k]!, w.contacts.impulse[k]!]);
  }
  return seen;
}

describe("kicker colliders", () => {
  it("leaves a ball resting on a kicker alone: no kick, no motion worth the name", () => {
    const w = make(0, [floor()], 1.1);
    const seen = run(w, 3000);
    expect(seen.filter(([k]) => k === CONTACT_KICK)).toEqual([]);
    expect(Math.hypot(w.balls[0]!.vx, w.balls[0]!.vy)).toBeLessThan(0.1);
  });

  it("bounces a slow hit as an ordinary wall: below minHit there is no kick", () => {
    const w = make(0.2);
    const seen = run(w, 40);
    expect(seen.map(([k]) => k)).toEqual([CONTACT_HIT]);
    expect(w.balls[0]!.vy).toBeCloseTo(-0.1, 9); // e = 0.5
  });

  it("kicks a hit above minHit: the ball leaves with exactly the kick speed along the normal, and the switch hears CONTACT_KICK", () => {
    const w = make(1);
    const seen = run(w, 40);
    expect(seen.map(([k]) => k)).toEqual([CONTACT_KICK]);
    expect(w.balls[0]!.vy).toBeCloseTo(-KICK, 9);
    expect(seen[0]![1]).toBeCloseTo(0.08 * (1.5 + (KICK - 0.5)), 9); // the bounce plus the push
  });

  it("is a floor of the speed, not an addition: a bounce already faster than the kick is left alone", () => {
    const w = make(6); // bounces off at 3 m/s with e = 0.5
    const seen = run(w, 40);
    expect(seen.map(([k]) => k)).toEqual([CONTACT_HIT]);
    expect(w.balls[0]!.vy).toBeCloseTo(-3, 9);
  });

  it("does nothing to a ball sliding along it", () => {
    const w = createWorld({ balls: [ball({ x: 0.2, y: 0.5 - BALL_R, vx: 1 })], segments: [floor()], circles: [], gravity: 0, kickWait: new Int32Array(1) });
    const seen = run(w, 100);
    expect(seen).toEqual([]);
    expect(w.balls[0]!.vx).toBe(1);
    expect(w.balls[0]!.vy).toBe(0);
  });

  describe("the cooldown", () => {
    // a ceiling at y = 0.3 on the same kicker (kid 0) throws the ball back at the floor
    const corridor = (cd: number) => [floor({ kickCd: cd }), wall(0, 0.3, 1, 0.3, { e: 0.5, sw: 2, kick: KICK, kickMin: 0.3, kickCd: cd, kid: 0 })];

    it("makes a hit inside it an ordinary bounce, and arms again after it", () => {
      const w = make(1, corridor(400));
      const kinds = run(w, 300).map(([k]) => k);
      expect(kinds.filter((k) => k === CONTACT_KICK)).toHaveLength(1); // floor kick; the ceiling hit 87 ticks later is plain
      expect(kinds.filter((k) => k === CONTACT_HIT).length).toBeGreaterThanOrEqual(1);
      const again = run(w, 1500).map(([k]) => k);
      expect(again).toContain(CONTACT_KICK); // after 400 ticks it kicks again
    });

    it("starts at the cooldown after a kick and counts down one per step", () => {
      const w = make(1, [floor({ kickCd: 30 })]);
      run(w, 1);
      while (w.contacts.n === 0) step(w); // up to the kick
      expect(w.kickWait[0]).toBe(30);
      run(w, 10);
      expect(w.kickWait[0]).toBe(20);
      run(w, 100);
      expect(w.kickWait[0]).toBe(0);
    });

    it("with a cooldown of one tick still lets one kick through per hit", () => {
      const w = make(1, [floor({ kickCd: 1 })]);
      const seen = run(w, 40);
      expect(seen.filter(([k]) => k === CONTACT_KICK)).toHaveLength(1);
    });
  });

  it("kicks off the end cap of a wall and off a round post, along the normal at the contact", () => {
    const post: Circle = { x: 0.5, y: 0.5, r: 0.02, e: 0.5, mu: 0, zoneMask: 1, sw: 1, kick: KICK, kickMin: 0.3, kickCd: 30, kid: 0 };
    const w = createWorld({ balls: [ball({ x: 0.3, y: 0.5, vx: 1 })], segments: [], circles: [post], gravity: 0, kickWait: new Int32Array(1) });
    const seen = run(w, 400);
    expect(seen.map(([k]) => k)).toEqual([CONTACT_KICK]);
    expect(w.balls[0]!.vx).toBeCloseTo(-KICK, 6);
    expect(Math.abs(w.balls[0]!.vy)).toBeLessThan(1e-9);
  });

  it("ignores a kicker in another zone", () => {
    const w = make(1, [floor({ zoneMask: 2 })]);
    run(w, 200);
    expect(w.balls[0]!.y).toBeGreaterThan(0.5); // the ball went through: the wall is in zone 1
  });

  it("has no effect when no collider kicks: the world hashes as before, and a cooldown in progress is part of the hash", () => {
    const plain = (): World => createWorld({ balls: [ball({ x: 0.5, y: 0.45, vy: 1 })], segments: [wall(0, 0.5, 1, 0.5, { sw: 1 })], circles: [], gravity: 0 });
    const a = plain();
    const b = plain();
    run(a, 100);
    run(b, 100);
    expect(hashWorld(a)).toBe(hashWorld(b));
    const k0 = make(1);
    const k1 = make(1);
    k1.kickWait[0] = 7;
    expect(hashWorld(k0)).not.toBe(hashWorld(k1));
    const kz = make(1);
    kz.kickWait[0] = 0;
    expect(hashWorld(kz)).toBe(hashWorld(k0)); // a zero counter is left out
  });

  it("is deterministic: the same world twice gives the same hash after many kicks", () => {
    const go = () => {
      const w = make(1, [floor({ kickCd: 3 }), wall(0, 0.3, 1, 0.3, { e: 0.5, sw: 2, kick: KICK, kickMin: 0.3, kickCd: 3, kid: 0 })]);
      run(w, 5000);
      return hashWorld(w);
    };
    expect(go()).toBe(go());
  });

  it("gives no energy without hits: a ball in free flight past a kicker keeps its speed", () => {
    const w = createWorld({ balls: [ball({ x: 0.5, y: 0.2, vx: 0.3, vy: 0.2 })], segments: [floor()], circles: [], gravity: 0, kickWait: new Int32Array(1) });
    run(w, 100); // 0.02 m down: nowhere near the floor
    expect(w.balls[0]!.vx).toBe(0.3);
    expect(w.balls[0]!.vy).toBe(0.2);
  });
});
