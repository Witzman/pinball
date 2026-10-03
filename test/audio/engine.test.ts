import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/audio/engine";
import { SOUND_IDS, VOICES } from "../../src/audio/voices";

/** A recording stand-in for the parts of AudioContext the engine uses. */
function fakeContext() {
  const log: string[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime: (v: number, t: number) => void log.push(`${name}.set ${v.toFixed(4)} @${t.toFixed(3)}`),
    linearRampToValueAtTime: () => void log.push(`${name}.lin`),
    exponentialRampToValueAtTime: (v: number) => void log.push(`${name}.exp ${v.toFixed(4)}`),
    cancelScheduledValues: () => void log.push(`${name}.cancel`),
    setTargetAtTime: (v: number) => void log.push(`${name}.target ${v}`),
  });
  const node = (kind: string, extra: object = {}) => ({
    connect: (_n: unknown) => void log.push(`${kind}.connect`),
    disconnect: () => void log.push(`${kind}.disconnect`),
    start: () => void log.push(`${kind}.start`),
    stop: () => void log.push(`${kind}.stop`),
    onended: null as null | (() => void),
    ...extra,
  });
  const ctx = {
    sampleRate: 8000,
    currentTime: 1,
    destination: node("destination"),
    createDynamicsCompressor: () => node("compressor"),
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    createGain: () => node("gain", { gain: param("gain") }),
    createOscillator: () => node("osc", { type: "", frequency: param("freq") }),
    createBufferSource: () => node("noise", { buffer: null, loop: false }),
    createBiquadFilter: () => node("filter", { type: "", Q: { value: 0 }, frequency: param("ffreq") }),
    suspend: () => void log.push("ctx.suspend"),
    resume: () => void log.push("ctx.resume"),
  };
  return { ctx: ctx as unknown as AudioContext, log };
}

describe("the Web Audio engine", () => {
  it("builds and starts every voice of the table without throwing, with one source per layer, all stopped", () => {
    const { ctx, log } = fakeContext();
    const e = createEngine(() => ctx);
    for (const id of SOUND_IDS) {
      log.length = 0;
      const h = e.start(id, VOICES[id], 0.5, 1, e.now());
      expect(h, id).toBeGreaterThan(0);
      expect(log.filter((l) => /\.start$/.test(l)), id).toHaveLength(VOICES[id].layers.length);
      expect(log.filter((l) => /\.stop$/.test(l)), id).toHaveLength(VOICES[id].layers.length);
    }
  });

  it("gives every voice its own handle, and stops one by fading its gains out", () => {
    const { ctx, log } = fakeContext();
    const e = createEngine(() => ctx);
    const a = e.start("drain", VOICES.drain, 1, 1, 1);
    const b = e.start("tilt", VOICES.tilt, 1, 1, 1);
    expect(a).not.toBe(b);
    log.length = 0;
    e.stop(a, 1.5);
    expect(log.some((l) => l.startsWith("gain.cancel"))).toBe(true);
    expect(log.some((l) => l.startsWith("gain.target 0"))).toBe(true);
    log.length = 0;
    e.stop(a, 1.6); // already gone: nothing happens
    expect(log).toEqual([]);
  });

  it("starts layers at their own offsets, and ramps every envelope down to silence", () => {
    const { ctx, log } = fakeContext();
    const e = createEngine(() => ctx);
    e.start("warn", VOICES.warn, 1, 1, 1);
    expect(log.some((l) => l.startsWith("gain.set 0.0001 @1.070"))).toBe(true); // the second beep
    expect(log.filter((l) => l === "gain.exp 0.0001").length).toBe(VOICES.warn.layers.length);
  });

  it("scales pitch by the rate, and suspends and resumes the context", () => {
    const { ctx, log } = fakeContext();
    const e = createEngine(() => ctx);
    log.length = 0;
    e.start("rollover", VOICES.rollover, 1, 2, 1);
    expect(log.some((l) => l.startsWith("freq.set 1760"))).toBe(true); // 880 Hz at rate 2
    e.suspend();
    e.resume();
    expect(log).toContain("ctx.suspend");
    expect(log).toContain("ctx.resume");
  });

  it("makes the noise from fixed seeds: two engines have the same noise", () => {
    const grab = () => {
      const bufs: Float32Array[] = [];
      const { ctx } = fakeContext();
      (ctx as unknown as { createBuffer: (c: number, n: number) => unknown }).createBuffer = (_c, n) => {
        const data = new Float32Array(n);
        bufs.push(data);
        return { getChannelData: () => data };
      };
      createEngine(() => ctx);
      return bufs.map((b) => Array.from(b.slice(0, 64)));
    };
    const one = grab();
    expect(one).toEqual(grab());
    expect(one[0]).not.toEqual(one[1]); // white and brown differ
    expect(one[0]!.some((x) => x !== 0)).toBe(true);
  });
});
