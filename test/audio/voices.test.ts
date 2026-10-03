import { describe, expect, it } from "vitest";
import { isSoundId, LOUDER_FACTOR, MAX_STARTS_PER_FRAME, MIN_GAIN, POLYPHONY, SOUND_IDS, VOICES } from "../../src/audio/voices";

const finite = (n: number) => Number.isFinite(n);

describe("the voice tables", () => {
  it("are exactly the sounds of the table, no more, no less", () => {
    expect([...SOUND_IDS].sort()).toEqual(["ballHit", "bumperPop", "drain", "flipperDown", "flipperUp", "plunger", "rollover", "sinkholeCapture", "slingThwack", "target", "tilt", "wallTick", "warn"]);
    expect(isSoundId("drain")).toBe(true);
    expect(isSoundId("toString")).toBe(false);
    expect(isSoundId("nope")).toBe(false);
  });

  for (const id of SOUND_IDS) {
    const v = VOICES[id];
    it(`${id}: every number is finite and in range`, () => {
      expect(v.layers.length).toBeGreaterThanOrEqual(1);
      expect(v.layers.length).toBeLessThanOrEqual(3);
      expect(v.dur).toBeGreaterThan(0);
      expect(v.dur).toBeLessThanOrEqual(1.5);
      expect(Number.isInteger(v.prio) && v.prio >= 0 && v.prio <= 3).toBe(true);
      expect(v.cooldownMs).toBeGreaterThan(0);
      for (const pair of [v.gain, v.pitch]) {
        expect(pair.every(finite)).toBe(true);
        expect(pair[0]).toBeGreaterThan(0);
        expect(pair[1]).toBeGreaterThanOrEqual(pair[0]);
      }
      expect(v.gain[1]).toBeLessThanOrEqual(1);
      for (const l of v.layers) {
        if ("osc" in l.src) {
          expect(l.src.f0).toBeGreaterThan(0);
          expect(l.src.f1).toBeGreaterThan(0);
          expect(l.src.f0).toBeLessThan(20000);
        }
        if (l.filter) {
          expect(l.filter.f0).toBeGreaterThan(0);
          expect(l.filter.f1).toBeGreaterThan(0);
          expect(l.filter.q).toBeGreaterThanOrEqual(0.1);
          expect(l.filter.q).toBeLessThanOrEqual(20);
        }
        expect(l.env.a).toBeGreaterThan(0);
        expect(l.env.d).toBeGreaterThan(0);
        expect(l.env.peak).toBeGreaterThan(0);
        expect(l.env.peak).toBeLessThanOrEqual(1);
      }
    });

    it(`${id}: every layer is silent by the time the voice is over`, () => {
      for (const l of v.layers) expect((l.at ?? 0) + l.env.a + l.env.d).toBeLessThanOrEqual(v.dur + 0.02);
    });
  }

  it("keeps the mixer limits sane", () => {
    expect(POLYPHONY).toBeGreaterThanOrEqual(8);
    expect(MAX_STARTS_PER_FRAME).toBeGreaterThanOrEqual(1);
    expect(MIN_GAIN).toBeGreaterThan(0);
    expect(MIN_GAIN).toBeLessThan(0.1);
    expect(LOUDER_FACTOR).toBeGreaterThan(1);
  });

  it("gives the drain and the tilt the highest priority, and the small ticks the lowest", () => {
    expect(VOICES.drain.prio).toBe(3);
    expect(VOICES.tilt.prio).toBe(3);
    expect(VOICES.wallTick.prio).toBe(0);
    expect(VOICES.ballHit.prio).toBe(0);
  });
});
