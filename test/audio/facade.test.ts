import { describe, expect, it } from "vitest";
import { createAudio } from "../../src/audio";
import type { Engine } from "../../src/audio/engine";
import { AUDIO_KEY, DEFAULT_SETTINGS, masterGain, parseSettings, serializeSettings } from "../../src/audio/settings";
import type { SoundId } from "../../src/audio/voices";
import { memoryStore } from "../../src/storage";

class FakeEngine implements Engine {
  t = 0;
  /** Whether the device runs; a test can start it suspended and let a gesture's resume() start it. */
  up = true;
  allowResume = true;
  started: SoundId[] = [];
  suspended = 0;
  resumed = 0;
  stops = 0;
  now() {
    return this.t;
  }
  start(id: SoundId) {
    this.started.push(id);
    return this.started.length;
  }
  stop() {
    this.stops++;
  }
  suspend() {
    this.suspended++;
  }
  resume() {
    this.resumed++;
    if (this.allowResume) this.up = true;
  }
  running() {
    return this.up;
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const batch = (...events: Parameters<ReturnType<typeof createAudio>["feed"]>[0]["events"]) => ({ events, roll: 0 });
const pop = batch({ a: "switch", sw: "b", kind: "kick", s: 1 });

function make(over: Partial<Parameters<typeof createAudio>[1]> = {}) {
  const engine = new FakeEngine();
  const store = memoryStore();
  const warnings: string[] = [];
  const audio = createAudio(store, { load: async () => ({ createEngine: () => engine }), available: () => true, warn: (m) => void warnings.push(m), ...over });
  return { audio, engine, store, warnings };
}

describe("the settings", () => {
  it("fall back to the defaults for anything unusable, and clamp the volume", () => {
    for (const bad of [null, "", "nope", "[]", "null", "42", '{"vol":"loud"}']) expect(parseSettings(bad), String(bad)).toEqual(bad === '{"vol":"loud"}' ? DEFAULT_SETTINGS : DEFAULT_SETTINGS);
    expect(parseSettings('{"vol":7,"mute":true}')).toEqual({ vol: 1, mute: true });
    expect(parseSettings('{"vol":-2}')).toEqual({ vol: 0, mute: false });
    expect(parseSettings('{"vol":0.3,"mute":"yes"}')).toEqual({ vol: 0.3, mute: false });
  });

  it("survive a round trip, and the master gain follows the volume squared, silent when muted", () => {
    const s = { vol: 0.5, mute: false };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
    expect(masterGain(s)).toBeCloseTo(0.2, 12);
    expect(masterGain({ vol: 1, mute: true })).toBe(0);
    expect(masterGain({ vol: 0, mute: false })).toBe(0);
  });
});

describe("the sound facade", () => {
  it("is silent until the first gesture opens it, and drops what happened before without queueing it", async () => {
    const { audio, engine } = make();
    audio.feed(pop, []);
    expect(audio.ready()).toBe(false);
    audio.unlock();
    await flush();
    expect(audio.ready()).toBe(true);
    expect(engine.started).toEqual([]); // the early pop was not kept
    audio.feed(pop, []);
    expect(engine.started).toEqual(["bumperPop"]);
  });

  it("plays the sound commands of the rules too", async () => {
    const { audio, engine } = make();
    audio.unlock();
    await flush();
    audio.feed(batch(), [{ c: "sound", play: "tilt" }, { c: "sound", play: "kazoo" }, { c: "setLamp", lamp: "a", state: "lit" }]);
    expect(engine.started).toEqual(["tilt"]);
  });

  it("opens only once, however many gestures", async () => {
    let loads = 0;
    const { audio } = make({ load: async () => (loads++, { createEngine: () => new FakeEngine() }) });
    audio.unlock();
    audio.unlock();
    audio.unlock();
    await flush();
    audio.unlock();
    expect(loads).toBe(1);
  });

  it("stays silent for good, and warns once, when the browser has no Web Audio", async () => {
    const { audio, engine, warnings } = make({ available: () => false });
    audio.unlock();
    audio.unlock();
    await flush();
    audio.feed(pop, []);
    audio.suspend();
    audio.resume();
    expect(audio.ready()).toBe(false);
    expect(engine.started).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("stays silent for good, and warns, when the engine cannot be loaded or started", async () => {
    const failing = make({ load: async () => { throw new Error("chunk missing"); } });
    failing.audio.unlock();
    await flush();
    failing.audio.feed(pop, []);
    expect(failing.audio.ready()).toBe(false);
    expect(failing.warnings).toHaveLength(1);
    const broken = make({ load: async () => ({ createEngine: () => { throw new Error("no context"); } }) });
    broken.audio.unlock();
    await flush();
    expect(broken.audio.ready()).toBe(false);
    expect(broken.warnings).toHaveLength(1);
  });

  it("is silent while paused and plays again after resume; a pause silences voices and suspends the device", async () => {
    const { audio, engine } = make();
    audio.unlock();
    await flush();
    audio.feed(pop, []);
    audio.suspend();
    expect(engine.suspended).toBe(1);
    expect(engine.stops).toBe(1);
    engine.t += 1; // past the cooldown, so only the pause can be what keeps it silent
    audio.feed(pop, []);
    expect(engine.started).toHaveLength(1);
    audio.resume();
    expect(engine.resumed).toBe(1);
    engine.t += 1;
    audio.feed(pop, []);
    expect(engine.started).toHaveLength(2);
  });

  it("does not send sounds to a device that is not running, and runs them after a gesture has started it", async () => {
    const { audio, engine } = make();
    engine.up = false;
    engine.allowResume = false; // the browser refuses the resume made when the context was made
    audio.unlock();
    await flush();
    expect(audio.ready()).toBe(true);
    expect(audio.running()).toBe(false);
    audio.feed(pop, []);
    expect(engine.started).toEqual([]); // not queued for a burst later
    engine.allowResume = true;
    audio.unlock(); // the next gesture asks again, inside the gesture
    expect(engine.resumed).toBe(1);
    expect(audio.running()).toBe(true);
    audio.feed(pop, []);
    expect(engine.started).toEqual(["bumperPop"]);
    audio.unlock();
    expect(engine.resumed).toBe(1); // a running device is left alone
  });

  it("does not ask a device to run while the game is paused", async () => {
    const { audio, engine } = make();
    audio.unlock();
    await flush();
    audio.suspend();
    engine.up = false;
    audio.unlock();
    expect(engine.resumed).toBe(0);
  });

  it("does nothing, and does not throw, when suspend, resume and feed come before it is open", () => {
    const { audio } = make();
    expect(() => {
      audio.suspend();
      audio.resume();
      audio.feed(pop, []);
    }).not.toThrow();
  });

  it("mutes and unmutes, remembers it in storage under its own key, and a muted game is silent", async () => {
    const { audio, engine, store } = make();
    audio.unlock();
    await flush();
    audio.feed(pop, []);
    expect(audio.toggleMute()).toBe(true);
    expect(engine.stops).toBe(1); // the pop that was playing is cut
    await flush();
    expect(parseSettings(await store.get(AUDIO_KEY))).toMatchObject({ mute: true });
    engine.t += 1;
    audio.feed(pop, []);
    expect(engine.started).toEqual(["bumperPop"]); // still only the first one: a muted game is silent
    expect(audio.toggleMute()).toBe(false);
    audio.feed(pop, []);
    expect(engine.started).toEqual(["bumperPop", "bumperPop"]);
  });

  it("starts with the settings of the last visit", async () => {
    const store = memoryStore();
    await store.set(AUDIO_KEY, serializeSettings({ vol: 0.2, mute: true }));
    const audio = createAudio(store, { load: async () => ({ createEngine: () => new FakeEngine() }), available: () => true });
    await flush();
    expect(audio.settings()).toEqual({ vol: 0.2, mute: true });
  });

  it("keeps the stored volume when M is pressed before the stored settings have arrived, and the player's mute wins", async () => {
    let answer: (t: string) => void = () => undefined;
    const saved: string[] = [];
    const store = { get: () => new Promise<string | null>((r) => void (answer = r)), set: async (_k: string, v: string) => void saved.push(v) };
    const audio = createAudio(store, { load: async () => ({ createEngine: () => new FakeEngine() }), available: () => true });
    expect(audio.toggleMute()).toBe(true); // before the store has answered
    answer(serializeSettings({ vol: 0.2, mute: false }));
    await flush();
    expect(audio.settings()).toEqual({ vol: 0.2, mute: true });
    expect(saved.map((t) => parseSettings(t))).toEqual([{ vol: 0.2, mute: true }]); // not the default volume
  });

  it("survives a store that cannot read or write", async () => {
    const store = { get: async () => { throw new Error("denied"); }, set: async () => { throw new Error("full"); } };
    const warnings: string[] = [];
    const audio = createAudio(store, { load: async () => ({ createEngine: () => new FakeEngine() }), available: () => true, warn: (m) => void warnings.push(m) });
    await flush();
    expect(audio.settings()).toEqual(DEFAULT_SETTINGS);
    expect(() => audio.toggleMute()).not.toThrow();
    await flush();
    expect(warnings.some((w) => /settings/.test(w))).toBe(true);
  });
});
