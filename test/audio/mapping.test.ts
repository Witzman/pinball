import { describe, expect, it } from "vitest";
import { HARD_HIT, soundsFor, soundsForCommand } from "../../src/audio/mapping";
import type { AudioEvent } from "../../src/sim/audio-events";

const sw = (over: Partial<Extract<AudioEvent, { a: "switch" }>> = {}): AudioEvent => ({ a: "switch", sw: "x", kind: "hit", s: 0.5, ...over });

describe("what the sim's events sound like", () => {
  it("makes a kick a bumper pop, by strength, unless the table says the switch is a sling or a target", () => {
    expect(soundsFor(sw({ kind: "kick", s: 0.7 }))).toEqual([{ id: "bumperPop", s: 0.7 }]);
    expect(soundsFor(sw({ kind: "kick", cls: "sling", s: 0.6 }))).toEqual([{ id: "slingThwack", s: 0.6 }]);
    expect(soundsFor(sw({ kind: "kick", cls: "target", s: 0.6 }))).toEqual([{ id: "target", s: 0.6 }]);
    expect(soundsFor(sw({ kind: "kick", cls: "pop", s: 0.2 }))).toEqual([{ id: "bumperPop", s: 0.2 }]);
  });

  it("makes a hit a ball hit when hard and a tick when soft, the border at HARD_HIT", () => {
    expect(soundsFor(sw({ s: HARD_HIT + 0.01 }))[0]!.id).toBe("ballHit");
    expect(soundsFor(sw({ s: HARD_HIT }))[0]!.id).toBe("wallTick");
    expect(soundsFor(sw({ s: 0 }))[0]!.id).toBe("wallTick");
    expect(soundsFor(sw({ s: 1 }))[0]!.id).toBe("ballHit");
    expect(soundsFor(sw({ cls: "wall", s: 0.9 }))[0]!.id).toBe("ballHit");
  });

  it("makes triggers, gates and rollover-class switches a rollover, and a capture a sinkhole sound, at full strength", () => {
    for (const kind of ["trigger", "gate"] as const) expect(soundsFor(sw({ kind, s: 0 }))).toEqual([{ id: "rollover", s: 1 }]);
    expect(soundsFor(sw({ kind: "hit", cls: "rollover", s: 0.3 }))).toEqual([{ id: "rollover", s: 1 }]);
    expect(soundsFor(sw({ kind: "capture", s: 0 }))).toEqual([{ id: "sinkholeCapture", s: 1 }]);
  });

  it("clamps a strength that is out of range or not a number", () => {
    expect(soundsFor(sw({ kind: "kick", s: 7 }))[0]!.s).toBe(1);
    expect(soundsFor(sw({ kind: "kick", s: -3 }))[0]!.s).toBe(0);
    expect(soundsFor(sw({ kind: "kick", s: NaN }))[0]!.s).toBe(0);
  });

  it("sounds the flippers, the plunger and the drain", () => {
    expect(soundsFor({ a: "flip", side: "L", up: true })).toEqual([{ id: "flipperUp", s: 1 }]);
    expect(soundsFor({ a: "flip", side: "R", up: false })).toEqual([{ id: "flipperDown", s: 1 }]);
    expect(soundsFor({ a: "plunge", s: 0.4 })).toEqual([{ id: "plunger", s: 0.4 }]);
    expect(soundsFor({ a: "plunge", s: 3 })).toEqual([{ id: "plunger", s: 1 }]);
    expect(soundsFor({ a: "drain" })).toEqual([{ id: "drain", s: 1 }]);
  });

  it("is silent for the machine buttons for now", () => {
    expect(soundsFor({ a: "btn", button: "coin" })).toEqual([]);
  });

  it("is the same every time: the same event gives equal output, and the input is not changed", () => {
    const e = sw({ kind: "kick", cls: "sling", s: 0.33 });
    const before = JSON.stringify(e);
    expect(soundsFor(e)).toEqual(soundsFor(e));
    expect(JSON.stringify(e)).toBe(before);
  });
});

describe("what the rules' commands sound like", () => {
  it("plays a sound command by its name, at its volume (default full)", () => {
    expect(soundsForCommand({ c: "sound", play: "warn" })).toEqual([{ id: "warn", s: 1 }]);
    expect(soundsForCommand({ c: "sound", play: "tilt", vol: 0.5 })).toEqual([{ id: "tilt", s: 0.5 }]);
    expect(soundsForCommand({ c: "sound", play: "tilt", vol: 9 })).toEqual([{ id: "tilt", s: 1 }]);
  });

  it("ignores a sound it does not know, and every command that is not a sound", () => {
    expect(soundsForCommand({ c: "sound", play: "kazoo" })).toEqual([]);
    expect(soundsForCommand({ c: "sound", play: "toString" })).toEqual([]);
    expect(soundsForCommand({ c: "setLamp", lamp: "a", state: "lit" })).toEqual([]);
    expect(soundsForCommand({ c: "credits", n: 2 })).toEqual([]);
  });
});
