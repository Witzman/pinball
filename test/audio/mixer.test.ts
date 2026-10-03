import { describe, expect, it } from "vitest";
import { Mixer } from "../../src/audio/mixer";
import type { Backend } from "../../src/audio/mixer";
import { MAX_STARTS_PER_FRAME, MIN_GAIN, VOICES } from "../../src/audio/voices";
import type { SoundId } from "../../src/audio/voices";

/** A sound device that writes down what it is asked and has a clock the test moves. */
class Fake implements Backend {
  t = 0;
  started: { handle: number; id: SoundId; gain: number; rate: number; at: number }[] = [];
  stopped: number[] = [];
  next = 1;
  now() {
    return this.t;
  }
  start(id: SoundId, _v: unknown, gain: number, rate: number, at: number) {
    const handle = this.next++;
    this.started.push({ handle, id, gain, rate, at });
    return handle;
  }
  stop(handle: number) {
    this.stopped.push(handle);
  }
}

function setup(master = () => 1) {
  const be = new Fake();
  return { be, mx: new Mixer(be, master) };
}

describe("the mixer", () => {
  it("turns strength into gain and pitch along the voice's ranges", () => {
    const { be, mx } = setup();
    mx.play({ id: "ballHit", s: 0 });
    be.t += 1;
    mx.play({ id: "ballHit", s: 1 });
    const v = VOICES.ballHit;
    expect(be.started[0]).toMatchObject({ gain: v.gain[0], rate: v.pitch[0] });
    expect(be.started[1]!.gain).toBeCloseTo(v.gain[1], 12);
    expect(be.started[1]!.rate).toBeCloseTo(v.pitch[1], 12);
  });

  it("starts at most MAX_STARTS_PER_FRAME sounds in one frame, and again after beginFrame", () => {
    const { be, mx } = setup();
    mx.beginFrame();
    for (let i = 0; i < 20; i++) {
      be.t += 1; // far apart: no cooldown in the way
      mx.play({ id: "rollover", s: 1 });
    }
    expect(be.started).toHaveLength(MAX_STARTS_PER_FRAME);
    mx.beginFrame();
    be.t += 1;
    expect(mx.play({ id: "rollover", s: 1 })).toBe(true);
  });

  it("drops a second start of the same sound inside its cooldown, unless it is much louder, and lets it through after", () => {
    const { be, mx } = setup();
    expect(mx.play({ id: "ballHit", s: 0.1 })).toBe(true);
    be.t = VOICES.ballHit.cooldownMs / 2000;
    expect(mx.play({ id: "ballHit", s: 0.1 })).toBe(false);
    expect(mx.play({ id: "ballHit", s: 1 })).toBe(true); // gain 0.8 against 0.17: more than 1.5 times
    be.t = 10;
    expect(mx.play({ id: "ballHit", s: 0.1 })).toBe(true);
  });

  it("drops a voice that is too quiet by its own gain, but a low volume only makes sounds softer", () => {
    const low = setup(() => 0.05);
    expect(low.mx.play({ id: "wallTick", s: 0 })).toBe(true); // 0.2 at the voice, 0.01 out: still played
    expect(low.be.started[0]!.gain).toBeCloseTo(0.01, 12);
    const tiny = { ...VOICES.wallTick, gain: [MIN_GAIN / 2, MIN_GAIN / 2] as [number, number] };
    const saved = VOICES.wallTick;
    (VOICES as Record<string, unknown>).wallTick = tiny;
    try {
      expect(setup().mx.play({ id: "wallTick", s: 0 })).toBe(false);
    } finally {
      (VOICES as Record<string, unknown>).wallTick = saved;
    }
    const muted = setup(() => 0);
    expect(muted.mx.play({ id: "drain", s: 1 })).toBe(false);
    expect(muted.be.started).toEqual([]);
  });

  it("scales gain by the master", () => {
    const { be, mx } = setup(() => 0.5);
    mx.play({ id: "drain", s: 1 });
    expect(be.started[0]!.gain).toBeCloseTo(VOICES.drain.gain[1] * 0.5, 12);
  });

  describe("when all voices are in use (a mixer with room for two)", () => {
    const small = (be: Fake) => new Mixer(be, () => 1, 2);

    it("forgets a voice that is over, so a long quiet stretch never fills it", () => {
      const be = new Fake();
      const mx = small(be);
      mx.play({ id: "target", s: 1 });
      mx.play({ id: "rollover", s: 1 });
      expect(mx.voices).toBe(2);
      be.t += 1;
      mx.beginFrame();
      expect(mx.play({ id: "bumperPop", s: 1 })).toBe(true);
      expect(mx.voices).toBe(1);
      expect(be.stopped).toEqual([]); // nothing had to be stolen
    });

    it("steals the lowest priority first, for a sound of the same or higher priority", () => {
      const be = new Fake();
      const mx = small(be);
      mx.play({ id: "bumperPop", s: 1 }); // prio 1, handle 1: the older
      be.t = 0.01;
      mx.play({ id: "wallTick", s: 1 }); // prio 0, handle 2: the newer, but the lowest priority
      be.t = 0.02;
      expect(mx.play({ id: "rollover", s: 1 })).toBe(true); // prio 1 takes the place of the tick, not of the older pop
      expect(be.stopped).toEqual([2]);
    });

    it("steals the oldest of equal priority", () => {
      const be = new Fake();
      const mx = small(be);
      mx.play({ id: "bumperPop", s: 1 });
      be.t = 0.01;
      mx.play({ id: "slingThwack", s: 1 });
      be.t = 0.02;
      expect(mx.play({ id: "target", s: 1 })).toBe(true);
      expect(be.stopped).toEqual([1]);
    });

    it("never steals a voice of higher priority for a lesser sound: the new one is dropped", () => {
      const be = new Fake();
      const mx = small(be);
      mx.play({ id: "drain", s: 1 }); // prio 3
      mx.play({ id: "tilt", s: 1 }); // prio 3
      expect(mx.play({ id: "wallTick", s: 1 })).toBe(false);
      expect(mx.play({ id: "bumperPop", s: 1 })).toBe(false);
      expect(be.stopped).toEqual([]);
      expect(be.started).toHaveLength(2);
    });
  });

  it("silences everything on a pause", () => {
    const { be, mx } = setup();
    mx.play({ id: "drain", s: 1 });
    mx.play({ id: "tilt", s: 1 });
    mx.silence();
    expect(be.stopped).toHaveLength(2);
    expect(mx.voices).toBe(0);
  });
});
