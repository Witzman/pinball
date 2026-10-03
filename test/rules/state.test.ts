import { describe, expect, it } from "vitest";
import { createState, hashRules, nextRandom, restore, serialize, validateState } from "../../src/rules";
import type { RulesState } from "../../src/rules";

function busy(): RulesState {
  const s = createState(42);
  s.tick = 1234;
  s.lamps = { brood: "lit", ramp: "collected", loop: "off" };
  s.counters = { loops: 3, trail: 0.5 };
  s.timers = { mission: { due: 5000, tag: "end" }, tick: { due: 1300, every: 100 } };
  s.shots = { loop: { i: 1, at: 1200 } };
  s.modes = { forage: { phase: "running", since: 1000, data: { shots: 2 } } };
  s.balls = { inPlay: 1, locked: { dig: 2 }, toFeed: 0, saver: { until: 9000 }, capacity: 3 };
  s.player = { score: 1500000, ballNo: 2, persist: { eggs: 4 } };
  return s;
}

describe("rules state", () => {
  it("starts empty at tick 0 with the seed in the generator word", () => {
    const s = createState(7);
    expect([s.v, s.tick, s.rng]).toEqual([1, 0, 7]);
    expect(s.balls).toEqual({ inPlay: 0, locked: {}, toFeed: 0, saver: { until: 0 }, capacity: 1 });
    expect(validateState(s)).toEqual([]);
  });

  it("keeps a seed as an unsigned 32-bit word", () => {
    expect(createState(-1).rng).toBe(0xffffffff);
    expect(createState(2 ** 32 + 5).rng).toBe(5);
  });

  it("round-trips through serialize and restore without losing anything", () => {
    const s = busy();
    expect(restore(serialize(s))).toEqual(s);
  });

  it("writes the same text whatever order the keys were added in", () => {
    const a = busy();
    const b = busy();
    b.lamps = { loop: "off", ramp: "collected", brood: "lit" };
    b.counters = { trail: 0.5, loops: 3 };
    expect(serialize(a)).toBe(serialize(b));
    expect(hashRules(a)).toBe(hashRules(b));
  });

  it("restores into a state that plays on identically", () => {
    const a = busy();
    const b = restore(serialize(a));
    const draws = (s: RulesState) => [nextRandom(s), nextRandom(s), nextRandom(s)];
    expect(draws(b)).toEqual(draws(a));
  });

  it("hashes differently when any part of the state differs", () => {
    const base = hashRules(busy());
    const edits: ((s: RulesState) => void)[] = [
      (s) => { (s as { v: number }).v = 2; },
      (s) => { s.tick += 1; },
      (s) => { s.rng += 1; },
      (s) => { s.lamps.brood = "collected"; },
      (s) => { s.counters.loops = 4; },
      (s) => { s.timers.mission!.due += 1; },
      (s) => { s.timers.tick!.every = 101; },
      (s) => { s.shots.loop!.i = 2; },
      (s) => { s.shots.loop!.at += 1; },
      (s) => { s.modes.forage!.phase = "done"; },
      (s) => { s.modes.forage!.since += 1; },
      (s) => { s.modes.forage!.data.shots = 3; },
      (s) => { s.balls.inPlay = 2; },
      (s) => { s.balls.toFeed = 1; },
      (s) => { s.balls.saver.until += 1; },
      (s) => { s.balls.capacity = 4; },
      (s) => { s.player.ballNo = 3; },
      (s) => { s.balls.locked.dig = 3; },
      (s) => { s.player.score += 1; },
      (s) => { s.player.persist.eggs = 5; },
    ];
    for (const edit of edits) {
      const s = busy();
      edit(s);
      expect(hashRules(s)).not.toBe(base);
    }
  });

  it("refuses to serialize anything that is not plain JSON", () => {
    const withMap = busy() as unknown as Record<string, unknown>;
    withMap.extra = new Map();
    expect(() => serialize(withMap as unknown as RulesState)).toThrow(/not plain JSON/);
    const withFn = busy();
    (withFn.counters as Record<string, unknown>).f = () => 1;
    expect(() => serialize(withFn)).toThrow(/state\.counters\.f is not plain JSON/);
    const withNaN = busy();
    withNaN.counters.bad = Number.NaN;
    expect(() => serialize(withNaN)).toThrow(/state\.counters\.bad is not a finite number/);
    const withUndefined = busy();
    (withUndefined.counters as Record<string, unknown>).u = undefined;
    expect(() => serialize(withUndefined)).toThrow(/not plain JSON/);
  });

  it("refuses negative zero, infinity, arrays, class instances and bare-prototype objects, nested or not", () => {
    const bad = (edit: (s: RulesState) => void) => {
      const s = busy();
      edit(s);
      return () => serialize(s);
    };
    expect(bad((s) => { s.counters.z = -0; })).toThrow(/state\.counters\.z is negative zero/);
    expect(bad((s) => { s.counters.z = Infinity; })).toThrow(/not a finite number/);
    expect(bad((s) => { (s.counters as Record<string, unknown>).z = [1]; s.modes.forage!.data = { deep: { x: new Date() } } as never; })).toThrow(/not plain JSON/);
    expect(bad((s) => { (s.lamps as Record<string, unknown>).z = new (class Foo {})(); })).toThrow(/state\.lamps\.z is not plain JSON/);
    expect(bad((s) => { s.timers = Object.create(null) as never; })).toThrow(/state\.timers is not plain JSON/);
    expect(bad((s) => { s.modes.forage!.data = { n: { m: Number.NaN } } as never; })).toThrow(/state\.modes\.forage\.data\.n\.m is not a finite number/);
  });

  it("refuses to restore numbers that would break the engine", () => {
    const text = (edit: (s: Record<string, any>) => void) => {
      const s = JSON.parse(serialize(busy()));
      edit(s);
      return JSON.stringify(s);
    };
    const bad = (edit: (s: Record<string, any>) => void) => () => restore(text(edit));
    expect(bad((s) => { s.balls.capacity = 0; })).toThrow(/capacity >= 1/);
    expect(bad((s) => { s.balls.capacity = -2; })).toThrow(/rules state invalid/);
    expect(bad((s) => { s.balls.inPlay = -1; })).toThrow(/rules state invalid/);
    expect(bad((s) => { s.balls.toFeed = -1; })).toThrow(/rules state invalid/);
    expect(bad((s) => { s.balls.saver.until = -5; })).toThrow(/rules state invalid/);
    expect(bad((s) => { s.balls.locked.dig = -1; })).toThrow(/rules state invalid/);
    expect(bad((s) => { s.balls.inPlay = 5; })).toThrow(/inPlay 5 is above balls.capacity 3/);
    expect(bad((s) => { s.timers.mission.due = -1; })).toThrow(/whole-number ticks/);
    expect(bad((s) => { s.timers.tick.every = 0; })).toThrow(/whole-number ticks/);
    expect(bad((s) => { s.shots.loop.i = 0; })).toThrow(/shots must map/);
    expect(bad((s) => { s.shots.loop.at = -1; })).toThrow(/shots must map/);
    expect(bad((s) => { s.modes.forage.since = -1; })).toThrow(/modes must map/);
    expect(bad((s) => { s.player.ballNo = -1; })).toThrow(/player must be/);
    expect(bad((s) => { s.tick = 2 ** 60; })).toThrow(/tick must be/);
    expect(() => restore(text((s) => { s.player.score = 0; }).replace('"score":0', '"score":1e999'))).toThrow(/player must be/);
    expect(() => restore(text((s) => { s.player.score = 0; }).replace('"score":0', '"score":-0'))).toThrow(/player must be/);
  });

  it("refuses unknown keys instead of carrying them along", () => {
    expect(() => restore(JSON.stringify({ ...JSON.parse(serialize(busy())), extra: 1 }))).toThrow(/unknown key "extra"/);
  });

  it("refuses to restore text that is not a valid state, naming every problem", () => {
    expect(() => restore("{")).toThrow(/not valid JSON/);
    expect(() => restore("[]")).toThrow(/state is not an object/);
    const bad = { ...busy(), v: 2, tick: -1, rng: 2 ** 33, lamps: { a: "blue" }, counters: { a: "x" } };
    const e = validateState(bad).join("\n");
    expect(e).toMatch(/unknown state version 2/);
    expect(e).toMatch(/tick must be a non-negative integer/);
    expect(e).toMatch(/rng must be a uint32/);
    expect(e).toMatch(/lamps must map/);
    expect(e).toMatch(/counters must map/);
    expect(() => restore(JSON.stringify(bad))).toThrow(/rules state invalid/);
  });

  it("checks timers, modes, balls and player shapes", () => {
    const s = JSON.parse(serialize(busy()));
    s.timers.x = { due: 1.5 };
    s.modes.y = { phase: 3, since: 0, data: {} };
    s.balls.saver = 4;
    s.player.ballNo = "two";
    const e = validateState(s).join("\n");
    expect(e).toMatch(/timers must map/);
    expect(e).toMatch(/modes must map/);
    expect(e).toMatch(/balls must be/);
    expect(e).toMatch(/player must be/);
    const zero = JSON.parse(serialize(busy()));
    zero.timers.z = { due: 10, every: 0 };
    expect(validateState(zero).join("\n")).toMatch(/timers must map/);
  });
});

describe("seeded random numbers", () => {
  it("gives the same sequence for the same seed and different ones for different seeds", () => {
    const run = (seed: number) => {
      const s = createState(seed);
      return Array.from({ length: 8 }, () => nextRandom(s));
    };
    expect(run(1)).toEqual(run(1));
    expect(run(1)).not.toEqual(run(2));
  });

  it("stays in [0, 1) and looks uniform", () => {
    const s = createState(123);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const r = nextRandom(s);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      buckets[Math.floor(r * 10)]! += 1;
    }
    for (const n of buckets) expect(n).toBeGreaterThan(1700);
    for (const n of buckets) expect(n).toBeLessThan(2300);
  });

  it("keeps its position in the state, so a restore continues the sequence", () => {
    const s = createState(9);
    nextRandom(s);
    nextRandom(s);
    const copy = restore(serialize(s));
    expect(nextRandom(copy)).toBe(nextRandom(s));
  });

  it("keeps the generator word an unsigned 32-bit integer however long it runs", () => {
    const s = createState(0xfffffff0);
    for (let i = 0; i < 100; i++) {
      nextRandom(s);
      expect(Number.isInteger(s.rng) && s.rng >= 0 && s.rng <= 0xffffffff).toBe(true);
    }
    expect(restore(serialize(s))).toEqual(s);
  });

  it("matches the mulberry32 reference value", () => {
    // mulberry32 with seed 1: first output 0.6270739405881613
    expect(nextRandom(createState(1))).toBeCloseTo(0.6270739405881613, 15);
  });
});
