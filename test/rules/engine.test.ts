import { describe, expect, it } from "vitest";
import { createRules, hashRules, restore, serialize } from "../../src/rules";
import type { Command, Ctx, RulesEvent, TableRules } from "../../src/rules";
import { harness } from "./harness";

const empty: TableRules = { modes: {} };

describe("lamps", () => {
  it("lights a lamp, tells the leaves once per change, and counts collected as off", () => {
    const h = harness({ modes: {}, onSwitch: (c, e) => (e.sw === "light" ? c.setLamp("brood", "lit") : c.setLamp("brood", "collected")) });
    h.at(5).hit("light").at(6).hit("light").at(7).hit("take").at(8).hit("take").run(10);
    expect(h.cmds).toEqual([
      { c: "setLamp", lamp: "brood", state: "lit" },
      { c: "setLamp", lamp: "brood", state: "off" },
    ]);
    expect(h.state.lamps.brood).toBe("collected");
  });

  it("sends a command only when lit or not lit changes: collected and off look the same to the leaves", () => {
    const steps = ["lit", "collected", "off", "collected", "lit", "off", "off", "lit"] as const;
    const h = harness({ modes: {}, onSwitch: (c, e) => c.setLamp("l", steps[Number(e.sw)]!) });
    for (let i = 0; i < steps.length; i++) h.at(i + 1).hit(String(i));
    h.run(20);
    expect(h.cmds.map((c) => (c as { state: string }).state)).toEqual(["lit", "off", "lit", "off", "lit"]);
  });

  it("tells the leaves lit, flash and off apart, and again only when what they show changes", () => {
    const steps = ["flash", "flash", "lit", "flash", "collected", "flash", "off"] as const;
    const h = harness({ modes: {}, onSwitch: (c, e) => c.setLamp("l", steps[Number(e.sw)]!) });
    for (let i = 0; i < steps.length; i++) h.at(i + 1).hit(String(i));
    h.run(20);
    expect(h.cmds.map((c) => (c as { state: string }).state)).toEqual(["flash", "lit", "flash", "off", "flash", "off"]);
  });

  it("reads off for a lamp never set", () => {
    let seen = "";
    const h = harness({ modes: {}, onSwitch: (c) => { seen = c.lamp("nothing"); } });
    h.at(1).hit("x").run(2);
    expect(seen).toBe("off");
  });
});

describe("counters and score", () => {
  it("adds, reads, resets, and returns the new value", () => {
    const got: number[] = [];
    const h = harness({
      modes: {},
      onSwitch(c, e) {
        if (e.sw === "loop") got.push(c.add("loops"));
        if (e.sw === "big") got.push(c.add("loops", 5));
        if (e.sw === "reset") c.reset("loops");
        if (e.sw === "read") got.push(c.count("loops"));
      },
    });
    h.at(1).hit("loop").at(2).hit("loop").at(3).hit("big").at(4).hit("read").at(5).hit("reset").at(6).hit("read").run(7);
    expect(got).toEqual([1, 2, 7, 7, 0]);
    expect("loops" in h.state.counters).toBe(false);
  });

  it("ends at plain zero after adding and taking back, and rejects non-finite amounts", () => {
    const h = harness({ modes: {}, onSwitch: (c) => { c.add("x", 1); c.add("x", -1); c.add("y", -0); } });
    h.at(1).hit("a").run(2);
    expect(Object.is(h.state.counters.x, 0)).toBe(true);
    expect(Object.is(h.state.counters.y, 0)).toBe(true);
    expect(serialize(h.state)).toContain('"x":0');
    const bad = harness({ modes: {}, onSwitch: (c) => { c.add("x", Number.NaN); } });
    expect(() => bad.at(1).hit("a").run(1)).toThrow(/not a finite number/);
  });

  it("adds to the score", () => {
    const h = harness({ modes: {}, onSwitch: (c, e) => c.addScore(e.sw === "target" ? 1000 : 25) });
    h.at(1).hit("target").at(2).hit("pop").at(3).hit("pop").run(4);
    expect(h.state.player.score).toBe(1050);
    expect(() => harness({ modes: {}, onSwitch: (c) => c.addScore(Infinity) }).at(1).hit("a").run(1)).toThrow(/addScore/);
  });
});

describe("timers", () => {
  it("fires a one-shot exactly at its tick, once, and removes it", () => {
    const fired: [number, string, string | undefined][] = [];
    const h = harness({
      modes: {},
      onSwitch: (c) => c.after("end", 100, "mission"),
      onTimer: (c, id, tag) => fired.push([c.now, id, tag]),
    });
    h.at(10).hit("start").run(300);
    expect(fired).toEqual([[110, "end", "mission"]]);
    expect(h.state.timers).toEqual({});
  });

  it("repeats an every-timer at its interval until cancelled", () => {
    const fired: number[] = [];
    const h = harness({
      modes: {},
      onSwitch: (c, e) => (e.sw === "go" ? c.every("beat", 50) : c.cancel("beat")),
      onTimer: (c) => fired.push(c.now),
    });
    h.at(0).hit("go").at(260).hit("stop").run(600);
    expect(fired).toEqual([50, 100, 150, 200, 250]);
    expect(h.state.timers).toEqual({});
  });

  it("fires timers before the events of the same tick, and in (due, id) order", () => {
    const order: string[] = [];
    const h = harness({
      modes: {},
      onSwitch: (c, e) => {
        if (e.sw === "arm") {
          c.after("b", 10);
          c.after("a", 10);
          c.after("early", 5);
        } else order.push(`switch ${e.sw}`);
      },
      onTimer: (_c, id) => order.push(`timer ${id}`),
    });
    h.at(0).hit("arm").at(10).hit("x").run(20);
    expect(order).toEqual(["timer early", "timer a", "timer b", "switch x"]);
  });

  it("lets a handler re-arm its own timer and cancel another one due the same tick", () => {
    const fired: string[] = [];
    const h = harness({
      modes: {},
      onSwitch: (c) => { c.after("a", 10); c.after("b", 10); },
      onTimer(c, id) {
        fired.push(`${id}@${c.now}`);
        if (id === "a") {
          c.cancel("b");
          c.after("a", 10);
        }
      },
    });
    h.at(0).hit("x").run(25);
    expect(fired).toEqual(["a@10", "a@20"]);
  });

  it("skips a timer that an earlier handler re-armed for later in the same tick", () => {
    const fired: string[] = [];
    const h = harness({
      modes: {},
      onSwitch: (c) => { c.after("a", 10); c.after("b", 10); },
      onTimer(c, id) {
        fired.push(`${id}@${c.now}`);
        if (id === "a") c.after("b", 50);
      },
    });
    h.at(0).hit("x").run(100);
    expect(fired).toEqual(["a@10", "b@60"]);
  });

  it("replaces a timer with the same id", () => {
    const fired: number[] = [];
    const h = harness({ modes: {}, onSwitch: (c) => c.after("t", 100), onTimer: (c) => fired.push(c.now) });
    h.at(0).hit("a").at(50).hit("a").run(300);
    expect(fired).toEqual([150]);
  });

  it("rejects timer lengths that are not whole ticks of at least 1", () => {
    for (const ticks of [0, -3, 1.5, Number.NaN]) {
      expect(() => harness({ modes: {}, onSwitch: (c) => c.after("t", ticks) }).at(1).hit("a").run(1)).toThrow(/whole number of at least 1/);
      expect(() => harness({ modes: {}, onSwitch: (c) => c.every("t", ticks) }).at(1).hit("a").run(1)).toThrow(/whole number of at least 1/);
    }
  });

  it("does no work on a tick with no events and no timer due", () => {
    let calls = 0;
    const h = harness({ modes: {}, onTimer: () => { calls++; }, onSwitch: (c) => c.after("t", 1000) });
    h.at(0).hit("a").run(5);
    const before = h.cmds.length;
    h.run(990);
    expect(calls).toBe(0);
    expect(h.cmds.length).toBe(before);
    expect(h.state.tick).toBe(990);
    h.run(1000);
    expect(calls).toBe(1);
  });
});

describe("shots", () => {
  const shots = { loop: ["loop_a", "loop_b"], target: ["t1"] };
  const run = (script: (h: ReturnType<typeof harness>) => void, window?: number) => {
    const seen: string[] = [];
    const h = harness({ modes: {}, onShot: (c, shot) => seen.push(`${shot}@${c.now}`) }, { shots, ...(window ? { shotWindow: window } : {}) });
    script(h);
    h.run(20000);
    return seen;
  };

  it("fires a one-switch shot on every hit", () => {
    expect(run((h) => h.at(10).hit("t1").at(20).hit("t1"))).toEqual(["target@10", "target@20"]);
  });

  it("fires a sequence shot when its switches come in order, and not before", () => {
    expect(run((h) => h.at(10).hit("loop_a"))).toEqual([]);
    expect(run((h) => h.at(10).hit("loop_a").at(300).hit("loop_b"))).toEqual(["loop@300"]);
  });

  it("ignores the second switch alone and a wrong order", () => {
    expect(run((h) => h.at(10).hit("loop_b"))).toEqual([]);
    expect(run((h) => h.at(10).hit("loop_b").at(20).hit("loop_a"))).toEqual([]);
  });

  it("is not broken by an unrelated switch in between, but restarts on a repeated first switch", () => {
    expect(run((h) => h.at(10).hit("loop_a").at(20).hit("t1").at(30).hit("loop_b"))).toEqual(["target@20", "loop@30"]);
    expect(run((h) => h.at(10).hit("loop_a").at(4000).hit("loop_a").at(8000).hit("loop_b"), 5000)).toEqual(["loop@8000"]);
  });

  it("measures the window from the first switch of the sequence, not the last", () => {
    const three = { long: ["x", "y", "z"] };
    const seen: string[] = [];
    const h = harness({ modes: {}, onShot: (c, s) => seen.push(`${s}@${c.now}`) }, { shots: three, shotWindow: 5000 });
    h.at(0).hit("x").at(4000).hit("y").at(6000).hit("z").run(7000);
    expect(seen).toEqual([]);
    const ok = harness({ modes: {}, onShot: (c, s) => seen.push(`${s}@${c.now}`) }, { shots: three, shotWindow: 5000 });
    ok.at(0).hit("x").at(2000).hit("y").at(4900).hit("z").run(7000);
    expect(seen).toEqual(["long@4900"]);
  });

  it("forgets a half-seen sequence after the window", () => {
    expect(run((h) => h.at(10).hit("loop_a").at(6000).hit("loop_b"), 5000)).toEqual([]);
    expect(run((h) => h.at(10).hit("loop_a").at(5010).hit("loop_b"), 5000)).toEqual(["loop@5010"]);
  });

  it("counts a shot again after it fired", () => {
    expect(run((h) => h.at(10).hit("loop_a").at(20).hit("loop_b").at(30).hit("loop_a").at(40).hit("loop_b"))).toEqual(["loop@20", "loop@40"]);
  });

  it("keeps the progress in the state, and clears it when the shot fires", () => {
    const h = harness(empty, { shots });
    h.at(10).hit("loop_a").run(11);
    expect(h.state.shots).toEqual({ loop: { i: 1, at: 10 } });
    h.at(20).hit("loop_b").run(21);
    expect(h.state.shots).toEqual({});
  });

  it("gives the shot to the mode handlers before the table, after the switch itself", () => {
    const order: string[] = [];
    const table: TableRules = {
      modes: { m: { start: "p", phases: { p: { on: { switch: () => order.push("mode switch"), shot: () => order.push("mode shot") } } } } },
      onSwitch: (c, e) => {
        if (e.sw === "go") c.start("m");
        else order.push("table switch");
      },
      onShot: () => order.push("table shot"),
    };
    const h = harness(table, { shots });
    h.at(1).hit("go").at(5).hit("t1").run(6);
    expect(order).toEqual(["mode switch", "table switch", "mode shot", "table shot"]);
  });

  it("completes a shot whose sequence repeats its own start: A, A, A, B finishes [A, A, B]", () => {
    const fire = (list: string[], hits: string[]) => {
      const seen: string[] = [];
      const h = harness({ modes: {}, onShot: (_c, s) => seen.push(s) }, { shots: { s: list } });
      hits.forEach((sw, i) => h.at(i + 1).hit(sw));
      h.run(hits.length + 2);
      return seen;
    };
    expect(fire(["A", "A", "B"], ["A", "A", "A", "B"])).toEqual(["s"]);
    expect(fire(["A", "B", "A", "C"], ["A", "B", "A", "B", "A", "C"])).toEqual(["s"]);
    expect(fire(["A", "A", "B"], ["A", "B"])).toEqual([]);
    expect(fire(["A", "B", "A", "C"], ["A", "B", "A", "A", "C"])).toEqual([]);
    expect(fire(["A", "B", "C"], ["A", "C", "B", "C"])).toEqual([]);
  });

  it("ignores a switch that is not in the shot, but drops the progress on one that is in it out of order", () => {
    const seen: string[] = [];
    const h = harness({ modes: {}, onShot: (_c, s) => seen.push(s) }, { shots: { s: ["A", "B", "C"] } });
    h.at(1).hit("A").at(2).hit("zzz").at(3).hit("B").run(4);
    expect(h.state.shots).toEqual({ s: { i: 2, at: 1 } });
    h.at(5).hit("A").run(6); // A is in the list but not next: it can only start over
    expect(h.state.shots).toEqual({ s: { i: 1, at: 5 } });
    h.at(7).hit("C").run(8); // C is in the list, no start of the sequence ends with it
    expect(h.state.shots).toEqual({});
    expect(seen).toEqual([]);
  });

  it("refuses a shot with no switches", () => {
    expect(() => createRules(empty, { seed: 1, shots: { none: [] } })).toThrow(/shot "none" has no switches/);
  });
});

describe("modes", () => {
  const log: string[] = [];
  const mission: TableRules = {
    modes: {
      forage: {
        start: "running",
        phases: {
          running: {
            enter: (c) => log.push(`enter running@${c.now}`),
            exit: (c) => log.push(`exit running@${c.now}`),
            on: {
              switch: (c, e) => {
                if (e.t === "switch" && e.sw === "food") {
                  const m = c.mode("forage")!;
                  m.data.food = (m.data.food ?? 0) + 1;
                  if (m.data.food === 2) c.goto("forage", "done");
                }
              },
              timer: (c) => log.push(`timer@${c.now}`),
            },
          },
          done: { enter: (c) => { log.push("enter done"); c.addScore(500); }, on: { switch: () => log.push("done saw switch") } },
        },
      },
    },
    onSwitch: (c, e) => {
      if (e.sw === "start") c.start("forage");
      if (e.sw === "stop") c.stop("forage");
      if (e.sw === "timer") c.after("t", 10);
    },
  };

  it("starts a mode in its start phase, runs enter, and starts it only once", () => {
    log.length = 0;
    const h = harness(mission);
    h.at(10).hit("start").at(20).hit("start").run(30);
    expect(log).toEqual(["enter running@10"]);
    expect(h.state.modes.forage).toEqual({ phase: "running", since: 10, data: {} });
  });

  it("keeps data across a phase change and runs exit and enter in order", () => {
    log.length = 0;
    const h = harness(mission);
    h.at(10).hit("start").at(20).hit("food").at(30).hit("food").run(40);
    expect(log).toEqual(["enter running@10", "exit running@30", "enter done"]);
    expect(h.state.modes.forage).toEqual({ phase: "done", since: 30, data: { food: 2 } });
    expect(h.state.player.score).toBe(500);
  });

  it("only gives events to the handler of the current phase", () => {
    log.length = 0;
    const h = harness(mission);
    h.at(10).hit("start").at(20).hit("food").at(30).hit("food").at(40).hit("food").run(50);
    expect(log).toContain("done saw switch");
    expect(log.filter((l) => l === "done saw switch")).toHaveLength(1);
  });

  it("runs exit on stop, removes the mode, and ignores a stop of a mode that is not running", () => {
    log.length = 0;
    const h = harness(mission);
    h.at(10).hit("start").at(20).hit("stop").at(30).hit("stop").run(40);
    expect(log).toEqual(["enter running@10", "exit running@20"]);
    expect(h.state.modes).toEqual({});
  });

  it("delivers timers to the running modes too", () => {
    log.length = 0;
    const h = harness(mission);
    h.at(5).hit("start").at(6).hit("timer").run(30);
    expect(log).toContain("timer@16");
  });

  it("calls modes in id order, skips one stopped by an earlier handler, and does not give a new mode the event that started it", () => {
    const seen: string[] = [];
    const mk = (name: string, extra?: (c: Ctx) => void): TableRules["modes"][string] => ({
      start: "p",
      phases: { p: { on: { switch: (c) => { seen.push(name); extra?.(c); } } } },
    });
    const table: TableRules = {
      modes: { b: mk("b"), a: mk("a", (c) => { c.stop("b"); c.start("z"); }), z: mk("z") },
    };
    const h = harness(table);
    h.state.modes.b = { phase: "p", since: 0, data: {} }; // inserted first on purpose: order must not depend on it
    h.state.modes.a = { phase: "p", since: 0, data: {} };
    h.at(1).hit("x").at(2).hit("x").run(3);
    expect(seen).toEqual(["a", "a", "z"]);
  });

  it("survives an exit handler that stops, starts or goes to its own mode", () => {
    const stopSelf: TableRules["modes"] = { m: { start: "p", phases: { p: { exit: (c) => { c.stop("m"); c.start("m"); } }, q: {} } } };
    const h = harness({ modes: stopSelf, onSwitch: (c, e) => (e.sw === "go" ? c.start("m") : c.stop("m")) });
    h.at(1).hit("go").at(2).hit("stop").run(3);
    expect(h.state.modes).toEqual({});
    const gotoSelf: TableRules["modes"] = { m: { start: "p", phases: { p: { exit: (c) => c.goto("m", "q") }, q: {} } } };
    const g = harness({ modes: gotoSelf, onSwitch: (c, e) => (e.sw === "go" ? c.start("m") : c.goto("m", "q")) });
    expect(() => g.at(1).hit("go").at(2).hit("move").run(3)).toThrow(/already leaving/);
  });

  it("removes a mode whose exit handler threw instead of leaving it half stopped", () => {
    const boom: TableRules["modes"] = { m: { start: "p", phases: { p: { exit: () => { throw new Error("boom"); } } } } };
    const rules = createRules({ modes: boom, onSwitch: (c, e) => (e.sw === "go" ? c.start("m") : c.stop("m")) }, { seed: 1 });
    const sw = (tick: number, name: string): RulesEvent => ({ t: "switch", tick, ball: 0, sw: name, kind: "hit", impulse: 1 });
    rules.step(1, [sw(1, "go")], []);
    expect(() => rules.step(2, [sw(2, "stop")], [])).toThrow(/boom/);
    expect(rules.state.modes).toEqual({});
  });

  it("gives an event to the modes running when it began, whichever sorts first", () => {
    const seen: string[] = [];
    const mk = (name: string, starts?: string): TableRules["modes"][string] => ({
      start: "p",
      phases: { p: { on: { switch: (c) => { seen.push(name); if (starts) c.start(starts); } } } },
    });
    // "a" starts "b" (sorts after) and "c" starts "0" (sorts before); neither newcomer sees the event that started it
    const table: TableRules["modes"] = { a: mk("a", "b"), b: mk("b"), c: mk("c", "0"), 0: mk("0") };
    const h = harness({ modes: table, onSwitch: (c, e) => { if (e.sw === "go") { c.start("a"); c.start("c"); } } });
    h.at(1).hit("go").at(2).hit("x").at(3).hit("y").run(4);
    // tick 2: only a and c, the modes running when it began; tick 3: all four, in id order
    expect(seen).toEqual(["a", "c", "0", "a", "b", "c"]);
  });

  it("throws on unknown modes and phases, goto on a mode that is not running, and runaway nesting", () => {
    const go = (fn: (c: Ctx) => void, modes: TableRules["modes"] = {}) => () => harness({ modes, onSwitch: (c) => fn(c) }).at(1).hit("x").run(1);
    expect(go((c) => c.start("nope"))).toThrow(/unknown mode "nope"/);
    expect(go((c) => c.stop("nope"))).toThrow(/unknown mode "nope"/);
    const one = { m: { start: "p", phases: { p: {} } } };
    expect(go((c) => c.goto("m", "p"), one)).toThrow(/not running/);
    expect(go((c) => { c.start("m"); c.goto("m", "q"); }, one)).toThrow(/no phase "q"/);
    const loop: TableRules["modes"] = {
      a: { start: "p", phases: { p: { enter: (c) => c.stop("a") } } },
    };
    const nest: TableRules["modes"] = {
      a: { start: "p", phases: { p: { enter: (c) => { c.stop("a"); c.start("a"); } } } },
    };
    expect(go((c) => c.start("a"), nest)).toThrow(/nest more than 16 deep/);
    expect(go((c) => c.start("a"), loop)).not.toThrow();
  });

  it("refuses a table whose mode starts in a phase it does not have", () => {
    expect(() => createRules({ modes: { m: { start: "x", phases: { p: {} } } } }, { seed: 1 })).toThrow(/start phase "x"/);
  });
});

describe("randomness, emit and drains", () => {
  it("gives the script seeded random numbers that live in the state", () => {
    const draw = (seed: number) => {
      const got: number[] = [];
      const h = harness({ modes: {}, onSwitch: (c) => got.push(c.rnd()) }, { seed });
      h.at(1).hit("a").at(2).hit("a").run(3);
      return got;
    };
    expect(draw(5)).toEqual(draw(5));
    expect(draw(5)).not.toEqual(draw(6));
    expect(draw(5)[0]).not.toBe(draw(5)[1]);
  });

  it("passes emitted commands on in order", () => {
    const cmds: Command[] = [{ c: "sound", play: "ding" }, { c: "dmd", show: { id: "ant", args: { n: 3 } } }, { c: "magnet", id: "pull", on: true }];
    const h = harness({ modes: {}, onSwitch: (c) => cmds.forEach((x) => c.emit(x)) });
    h.at(1).hit("a").run(2);
    expect(h.cmds).toEqual(cmds);
  });

  it("calls onDrain and gives button, drain and plunger events to the modes", () => {
    const seen: string[] = [];
    const table: TableRules = {
      modes: { m: { start: "p", phases: { p: { on: { button: (_c, e) => seen.push(`button ${e.t === "button" ? e.button : ""}`), drain: () => seen.push("mode drain"), ballAtPlunger: () => seen.push("plunger") } } } } },
      onSwitch: (c) => c.start("m"),
      onDrain: () => seen.push("table drain"),
    };
    const h = harness(table);
    h.at(1).ballAtPlunger().at(2).hit("go").at(3).button("left", true).at(4).drain().at(5).ballAtPlunger().run(6);
    expect(seen).toEqual(["button left", "mode drain", "table drain", "plunger"]);
  });
});

describe("what the engine insists on", () => {
  it("refuses a tick that is not a whole number or goes backwards, and accepts the same tick again", () => {
    const rules = createRules(empty, { seed: 1 });
    rules.step(10, [], []);
    rules.step(10, [], []);
    expect(() => rules.step(9, [], [])).toThrow(/not before tick 10/);
    expect(() => rules.step(Number.NaN, [], [])).toThrow(/whole number/);
    expect(() => rules.step(11.5, [], [])).toThrow(/whole number/);
    expect(rules.state.tick).toBe(10);
  });

  it("keeps its own copy of a saved state", () => {
    const h = harness({ modes: {}, onSwitch: (c) => c.add("n") });
    h.at(1).hit("a").run(2);
    const saved = restore(serialize(h.state));
    const rules = createRules({ modes: {}, onSwitch: (c) => c.add("n") }, { seed: 1, state: saved });
    rules.step(3, [{ t: "switch", tick: 3, ball: 0, sw: "a", kind: "hit", impulse: 1 }], []);
    expect(saved.counters.n).toBe(1);
    expect(rules.state.counters.n).toBe(2);
  });

  it("does not mistake names like constructor or toString for entries, and refuses __proto__ as an id", () => {
    let lamp = "";
    let count = -1;
    let mode: unknown = "unset";
    const h = harness({
      modes: { m: { start: "p", phases: { p: {} } } },
      onSwitch(c) {
        lamp = c.lamp("constructor");
        count = c.count("toString");
        mode = c.mode("hasOwnProperty");
      },
    });
    h.at(1).hit("a").run(2);
    expect([lamp, count, mode]).toEqual(["off", 0, null]);
    for (const bad of ["__proto__", ""]) {
      expect(() => harness({ modes: {}, onSwitch: (c) => c.add(bad) }).at(1).hit("a").run(1)).toThrow(/not a usable id/);
      expect(() => harness({ modes: {}, onSwitch: (c) => c.setLamp(bad, "lit") }).at(1).hit("a").run(1)).toThrow(/not a usable id/);
      expect(() => harness({ modes: {}, onSwitch: (c) => c.after(bad, 5) }).at(1).hit("a").run(1)).toThrow(/not a usable id/);
    }
    expect(() => harness({ modes: {}, onSwitch: (c) => c.start("toString") }).at(1).hit("a").run(1)).toThrow(/unknown mode "toString"/);
  });

  it("replays a missed every-timer one beat per step, not all at once", () => {
    const fired: number[] = [];
    const rules = createRules({ modes: {}, onSwitch: (c) => c.every("e", 10), onTimer: (c) => fired.push(c.now) }, { seed: 1 });
    rules.step(0, [{ t: "switch", tick: 0, ball: 0, sw: "go", kind: "hit", impulse: 1 }], []);
    for (const t of [95, 96, 97]) rules.step(t, [], []);
    expect(fired).toEqual([95, 96, 97]);
    expect(rules.state.timers.e!.due).toBe(40);
  });

  it("refuses a save with progress on a shot the table does not have", () => {
    const h = harness(empty, { shots: { s: ["a", "b"] } });
    h.at(1).hit("a").run(2);
    expect(() => createRules(empty, { seed: 1, shots: { other: ["a", "b"] }, state: restore(serialize(h.state)) })).toThrow(/shot "s" which the table does not define/);
  });
});

describe("saving, restoring and replaying", () => {
  const table: TableRules = {
    modes: {
      m: { start: "p", phases: { p: { on: { switch: (c, e) => { if (e.t === "switch" && e.sw === "hit") c.add("hits"); } } }, q: {} } },
    },
    onSwitch(c, e) {
      if (e.sw === "go") { c.start("m"); c.every("tick", 37); c.setLamp("l", "lit"); }
      if (e.sw === "dice") c.addScore(Math.floor(c.rnd() * 1000));
    },
    onTimer: (c) => { c.add("ticks"); },
  };
  const shots = { s: ["a", "b"] };
  const script = (h: ReturnType<typeof harness>) => {
    h.at(5).hit("go").at(100).hit("hit").at(200).hit("a").at(300).hit("dice").at(400).hit("b").at(500).hit("hit").at(600).hit("dice");
  };

  it("plays the same script to the same state and commands twice", () => {
    const a = harness(table, { shots, seed: 3 });
    script(a);
    a.run(1000);
    const b = harness(table, { shots, seed: 3 });
    script(b);
    b.run(1000);
    expect(hashRules(a.state)).toBe(hashRules(b.state));
    expect(a.cmds).toEqual(b.cmds);
    expect(a.state.counters.hits).toBe(2);
    expect(a.state.counters.ticks).toBeGreaterThan(20);
  });

  it("continues identically from a save taken in the middle", () => {
    const whole = harness(table, { shots, seed: 3 });
    script(whole);
    whole.run(1000);

    const first = harness(table, { shots, seed: 3 });
    script(first);
    first.run(350);
    const saved = serialize(first.state);
    const resumed = createRules(table, { seed: 999, shots, state: restore(saved) });
    const rest: Command[] = [];
    const events = new Map<number, RulesEvent[]>([
      [400, [{ t: "switch", tick: 400, ball: 0, sw: "b", kind: "hit", impulse: 1 }]],
      [500, [{ t: "switch", tick: 500, ball: 0, sw: "hit", kind: "hit", impulse: 1 }]],
      [600, [{ t: "switch", tick: 600, ball: 0, sw: "dice", kind: "hit", impulse: 1 }]],
    ]);
    for (let t = 351; t <= 1000; t++) resumed.step(t, events.get(t) ?? [], rest);
    expect(hashRules(resumed.state)).toBe(hashRules(whole.state));
    expect(first.cmds.concat(rest)).toEqual(whole.cmds);
  });

  it("keeps the state plain JSON through a long script", () => {
    const h = harness(table, { shots, seed: 3 });
    script(h);
    h.run(5000);
    expect(() => serialize(h.state)).not.toThrow();
    expect(restore(serialize(h.state))).toEqual(h.state);
  });

  it("refuses to resume a save that does not fit the table", () => {
    const h = harness(table, { shots });
    h.at(5).hit("go").run(10);
    const saved = restore(serialize(h.state));
    saved.modes.ghost = { phase: "p", since: 0, data: {} };
    expect(() => createRules(table, { seed: 1, shots, state: saved })).toThrow(/mode "ghost" which the table does not define/);
    const wrongPhase = restore(serialize(h.state));
    wrongPhase.modes.m!.phase = "zzz";
    expect(() => createRules(table, { seed: 1, shots, state: wrongPhase })).toThrow(/phase "zzz"/);
    const broken = restore(serialize(h.state));
    (broken as { v: number }).v = 9;
    expect(() => createRules(table, { seed: 1, shots, state: broken })).toThrow(/unknown state version/);
  });

  it("starts from the seed when no save is given", () => {
    const r = createRules(empty, { seed: 77 });
    expect(r.state.rng).toBe(77);
  });
});
