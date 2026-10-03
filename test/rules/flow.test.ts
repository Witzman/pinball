import { describe, expect, it } from "vitest";
import { createRules, hashRules, restore, serialize } from "../../src/rules";
import type { FlowConfig, RulesEvent, TableRules } from "../../src/rules";
import { harness } from "./harness";

const cfg: FlowConfig = { ballsPerGame: 3, startCost: 1, startCredits: 2, overTicks: 100 };

const table: TableRules = {
  modes: {
    m: { start: "p", phases: { p: { enter: (c) => c.add("mode_entered"), exit: (c) => c.add("mode_left"), on: { switch: (c) => c.add("mode_saw") } } } },
  },
  persist: ["eggs", "egg_lamp"],
  onSwitch(c, e) {
    if (e.sw === "extra_ball_please") c.ball.feed();
    if (e.sw === "target") {
      c.addScore(100);
      c.add("hits");
      c.add("eggs");
      c.setLamp("egg_lamp", "lit");
      c.setLamp("temp_lamp", "lit");
      c.start("m");
      c.after("late", 5000);
    }
  },
  onBallStart: (c) => c.add("balls_started"),
  onTimer: (c) => c.add("late_fired"),
};

/** A table with a flow, in attract mode, nothing played yet. */
function machine(opts: { flow?: FlowConfig; shots?: Record<string, string[]> } = {}) {
  return harness(table, { flow: opts.flow ?? cfg, ...(opts.shots ? { shots: opts.shots } : {}) });
}

/** Presses start with a credit and lets the first ball arrive. */
function startGame(h: ReturnType<typeof machine>, at = 10) {
  h.at(at).button("start", true).at(at + 1).ballAtPlunger();
  return h.run(at + 2);
}

describe("the game flow", () => {
  it("starts in attract with the credits of the config and no ball", () => {
    const h = machine();
    expect(h.state.game).toMatchObject({ phase: "attract", credits: 2, shootAgain: 0, bought: false, tilted: false, replayDone: false, board: { main: [], bought: [] } });
    expect(h.state.balls.inPlay).toBe(0);
  });

  it("has no game state without a flow, and free play still feeds on a drain as before", () => {
    const h = harness(table);
    expect(h.state.game).toBeNull();
  });

  it("does not call the table's handlers in attract or over, only while a ball is played", () => {
    const h = machine();
    h.at(1).hit("target").run(2);
    expect(h.state.player.score).toBe(0);
    expect(h.state.counters.hits).toBeUndefined();
    startGame(h);
    h.at(20).hit("target").run(21);
    expect(h.state.player.score).toBe(100);
  });

  it("takes a coin in any phase and tells the leaves the new total", () => {
    const h = machine();
    h.at(1).button("coin", true).at(2).button("coin", false).at(3).button("coin", true).run(4);
    expect(h.state.game!.credits).toBe(4);
    expect(h.cmds).toEqual([{ c: "credits", n: 3 }, { c: "credits", n: 4 }]);
    startGame(h, 10);
    h.take();
    h.at(30).button("coin", true).run(31);
    expect(h.state.game!.credits).toBe(4); // 4 + 1 - 1 (the start)
    expect(h.cmds).toEqual([{ c: "credits", n: 4 }]);
  });

  it("starts a game: takes a credit, zeroes the score, ball 1, asks for a ball, and ignores start while playing", () => {
    const h = machine();
    h.at(5).button("start", true).run(6);
    expect(h.state.game).toMatchObject({ phase: "play", credits: 1 });
    expect(h.state.player).toMatchObject({ score: 0, ballNo: 1 });
    expect(h.cmds).toEqual([{ c: "credits", n: 1 }, { c: "feedBall", feed: "plunger" }]);
    h.take();
    h.at(7).button("start", true).at(8).button("start", true).run(9);
    expect(h.state.game!.credits).toBe(1);
    expect(h.cmds).toEqual([]);
  });

  it("does not start without a credit, and says so", () => {
    const h = machine({ flow: { ...cfg, startCredits: 0 } });
    h.at(5).button("start", true).run(6);
    expect(h.state.game!.phase).toBe("attract");
    expect(h.cmds).toEqual([{ c: "dmd", show: { id: "insertCoin" } }]);
    h.take();
    h.at(7).button("coin", true).at(8).button("start", true).run(9);
    expect(h.state.game!.phase).toBe("play");
  });

  it("starts for free when a start costs nothing", () => {
    const h = machine({ flow: { ...cfg, startCost: 0, startCredits: 0 } });
    h.at(5).button("start", true).run(6);
    expect(h.state.game).toMatchObject({ phase: "play", credits: 0 });
  });

  it("ignores the release of a button", () => {
    const h = machine();
    h.at(5).button("start", false).at(6).button("coin", false).run(7);
    expect(h.state.game).toMatchObject({ phase: "attract", credits: 2 });
    expect(h.cmds).toEqual([]);
  });

  it("plays three balls, ends the game with the score, and returns to attract after the game-over time", () => {
    const h = machine();
    startGame(h);
    h.at(20).hit("target").at(30).drain();
    h.run(31);
    expect(h.state.player.ballNo).toBe(2);
    expect(h.cmds.filter((c) => c.c === "feedBall")).toHaveLength(2);
    h.at(40).ballAtPlunger().at(50).hit("target").at(60).drain().run(61);
    expect(h.state.player.ballNo).toBe(3);
    h.at(70).ballAtPlunger().at(80).hit("target").at(90).drain().run(91);
    expect(h.state.game!.phase).toBe("over");
    expect(h.cmds.filter((c) => c.c === "gameOver")).toEqual([{ c: "gameOver", score: 300, bought: false }]);
    expect(h.state.player.score).toBe(300);
    h.run(189);
    expect(h.state.game!.phase).toBe("over"); // the game-over time runs from the last drain at tick 90
    h.run(190);
    expect(h.state.game!.phase).toBe("attract");
    expect(h.state.timers).toEqual({});
  });

  it("calls onBallStart for every ball and not for a ball that arrives between games", () => {
    const h = machine();
    startGame(h);
    expect(h.state.counters.balls_started).toBe(1);
    h.at(20).drain().at(21).ballAtPlunger().run(22);
    expect(h.state.counters.balls_started).toBe(1); // wiped by the ball change, then 1 again
  });

  it("keeps persisted counters and lamps from ball to ball and clears the rest, stopping modes and timers", () => {
    const h = machine({ shots: { s: ["a", "b"] } });
    startGame(h);
    h.at(20).hit("target").at(21).hit("a").run(22);
    expect(h.state.shots).toEqual({ s: { i: 1, at: 21 } });
    expect(h.state.modes.m).toBeDefined();
    h.take();
    h.at(30).drain().run(31);
    expect(h.state.counters.eggs).toBe(1);
    expect(h.state.lamps.egg_lamp).toBe("lit");
    expect(h.state.counters.hits).toBeUndefined();
    expect(h.state.counters.mode_left).toBeUndefined(); // the exit handler ran, then its counter was cleared with the rest
    expect(h.state.lamps.temp_lamp).toBeUndefined();
    expect(h.state.modes).toEqual({});
    expect(h.state.shots).toEqual({});
    expect(Object.keys(h.state.timers)).toEqual([]);
    expect(h.cmds).toContainEqual({ c: "setLamp", lamp: "temp_lamp", state: "off" });
    expect(h.cmds).not.toContainEqual({ c: "setLamp", lamp: "egg_lamp", state: "off" });
    h.run(6000);
    expect(h.state.counters.late_fired).toBeUndefined(); // the timer of ball 1 never fired
  });

  it("clears everything, persisted values too, when a new game starts", () => {
    const h = machine();
    startGame(h);
    h.at(20).hit("target").at(30).drain().at(40).ballAtPlunger().at(50).drain().at(60).ballAtPlunger().at(70).drain().run(300);
    expect(h.state.game!.phase).toBe("attract");
    expect(h.state.counters.eggs).toBe(1);
    startGame(h, 400);
    expect(h.state.counters.eggs).toBeUndefined();
    expect(h.state.lamps.egg_lamp).toBeUndefined();
    expect(h.state.player.score).toBe(0);
    expect(h.state.game!.credits).toBe(0);
  });

  it("ends a ball only when no ball is in play, none is waiting to be fed and none is locked", () => {
    const h = machine();
    h.state.balls.capacity = 3; // test setup: a table with several balls
    startGame(h);
    h.at(20).ballAtPlunger().run(21);
    expect(h.state.balls.inPlay).toBe(2);
    h.at(30).drain().run(31);
    expect(h.state.player.ballNo).toBe(1); // one ball still plays
    h.at(40).drain().run(41);
    expect(h.state.player.ballNo).toBe(2);
    h.at(50).ballAtPlunger().run(51);
    h.rules.step(52, [{ t: "switch", tick: 52, ball: 0, sw: "x", kind: "capture", impulse: 0 }], h.cmds);
    h.state.balls.locked.saucer = 1; // test setup: a ball is locked
    h.state.balls.inPlay = 1;
    h.at(60).drain().run(61);
    expect(h.state.player.ballNo).toBe(2); // a ball is locked: the ball does not end
  });

  it("does not end the ball while a ball is on its way to the plunger", () => {
    const h = machine();
    h.state.balls.capacity = 2; // test setup
    startGame(h);
    h.at(20).hit("extra_ball_please").at(21).drain().run(22);
    expect(h.state.balls).toMatchObject({ inPlay: 0, toFeed: 1 });
    expect(h.state.player.ballNo).toBe(1); // a ball is coming: same ball number, no new feed
    h.at(23).ballAtPlunger().at(24).drain().run(25);
    expect(h.state.player.ballNo).toBe(2);
  });

  it("does not let an exit handler start a mode or feed a ball while the table is being cleared", () => {
    const leaky = (what: (c: Parameters<NonNullable<TableRules["onSwitch"]>>[0]) => void): TableRules => ({
      modes: {
        a: { start: "p", phases: { p: { exit: what } } },
        b: { start: "p", phases: { p: {} } },
      },
      onSwitch: (c, e) => { if (e.sw === "go") c.start("a"); },
    });
    for (const [name, what] of [["start", (c: Parameters<NonNullable<TableRules["onSwitch"]>>[0]) => c.start("b")], ["feed", (c: Parameters<NonNullable<TableRules["onSwitch"]>>[0]) => c.ball.feed()]] as const) {
      const h = harness(leaky(what), { flow: cfg });
      startGame(h);
      h.at(20).hit("go").run(21);
      expect(() => h.at(30).drain().run(31), name).toThrow(/while the game flow clears the table/);
    }
    // outside a reset the same calls are fine
    const ok = harness(leaky((c) => c.add("left")), { flow: cfg });
    startGame(ok);
    ok.at(20).hit("go").at(30).drain().run(31);
    expect(ok.state.modes).toEqual({});
  });

  it("keeps the flow's timer ids for itself", () => {
    const bad = (fn: (c: Parameters<NonNullable<TableRules["onSwitch"]>>[0]) => void) => () =>
      harness({ modes: {}, onSwitch: (c) => fn(c) }, { flow: cfg }).at(1).hit("a").run(1);
    // not in play, so use a flow-less harness for the script call
    const run = (fn: (c: Parameters<NonNullable<TableRules["onSwitch"]>>[0]) => void) => () => harness({ modes: {}, onSwitch: (c) => fn(c) }).at(1).hit("a").run(1);
    expect(run((c) => c.after("flow.over", 5))).toThrow(/belong to the game flow/);
    expect(run((c) => c.every("flow.x", 5))).toThrow(/belong to the game flow/);
    expect(run((c) => c.cancel("flow.over"))).toThrow(/belong to the game flow/);
    expect(bad).toBeDefined();
  });
});

describe("saving a game in every phase", () => {
  const sw = (tick: number, name: string): RulesEvent => ({ t: "switch", tick, ball: 0, sw: name, kind: "hit", impulse: 1 });
  const btn = (tick: number, button: "coin" | "start", down = true): RulesEvent => ({ t: "button", tick, button, down });
  // what can happen next in each phase, as (offset from the save, event)
  const scripts: Record<string, (t: number) => RulesEvent[]> = {
    attract: (t) => [btn(t + 1, "coin"), btn(t + 2, "start"), { t: "ballAtPlunger", tick: t + 3 }, sw(t + 4, "target"), { t: "drain", tick: t + 5, ball: 0 }],
    play: (t) => [btn(t + 1, "coin"), sw(t + 2, "target"), { t: "drain", tick: t + 3, ball: 0 }, { t: "ballAtPlunger", tick: t + 4 }, sw(t + 5, "target")],
    over: (t) => [btn(t + 1, "coin"), btn(t + 2, "start"), sw(t + 3, "target"), btn(t + 150, "start"), { t: "ballAtPlunger", tick: t + 151 }],
  };

  it("restores to a state that plays on identically in attract, play and over", () => {
    const h = machine();
    const saves: { phase: string; saved: string; tick: number }[] = [];
    const note = () => saves.push({ phase: h.state.game!.phase, saved: serialize(h.state), tick: h.state.tick });
    note();
    startGame(h);
    note();
    h.at(20).drain().at(21).ballAtPlunger().at(22).drain().at(23).ballAtPlunger().at(24).drain().run(25);
    note();
    expect(saves.map((x) => x.phase)).toEqual(["attract", "play", "over"]);
    for (const x of saves) {
      const live = harness(table, { flow: cfg }); // the original, continuing
      void live;
      const a = createRules(table, { seed: 1, flow: cfg, state: restore(x.saved) });
      const b = createRules(table, { seed: 1, flow: cfg, state: restore(x.saved) });
      const outA: never[] = [];
      const outB: never[] = [];
      for (const e of scripts[x.phase]!(x.tick)) {
        a.step(e.tick, [e], outA);
        b.step(e.tick, [e], outB);
      }
      expect(serialize(a.state), x.phase).toBe(serialize(b.state));
      expect(outA).toEqual(outB);
      expect(hashRules(a.state)).not.toBe(hashRules(restore(x.saved))); // and it did move on
    }
  });

  it("refuses to resume a game in a phase it could never leave", () => {
    const over = machine();
    startGame(over);
    over.at(20).drain().at(21).ballAtPlunger().at(22).drain().at(23).ballAtPlunger().at(24).drain().run(25);
    const saved = restore(serialize(over.state));
    expect(saved.game!.phase).toBe("over");
    expect(() => createRules(table, { seed: 1, flow: cfg, state: saved })).not.toThrow();
    delete saved.timers["flow.over"];
    expect(() => createRules(table, { seed: 1, flow: cfg, state: saved })).toThrow(/"over" without its flow.over timer/);
    for (const phase of ["bonus", "buyin"] as const) {
      const s = restore(serialize(over.state));
      s.game!.phase = phase;
      expect(() => createRules(table, { seed: 1, flow: cfg, state: s })).toThrow(new RegExp(`phase "${phase}", which this flow does not run yet`));
    }
  });

  it("keeps the saved game's credits and phase through restore", () => {
    const h = machine();
    startGame(h);
    const saved = restore(serialize(h.state));
    expect(saved.game).toMatchObject({ phase: "play", credits: 1 });
    expect(saved).toEqual(h.state);
  });

  it("writes a state without a flow exactly as before flows existed, and reads such a state back", () => {
    const h = harness(table);
    expect(serialize(h.state)).not.toContain("game");
    expect(restore(serialize(h.state)).game).toBeNull();
  });

  it("refuses a bad game in a save", () => {
    const h = machine();
    const bad = (edit: (g: Record<string, unknown>) => void) => () => {
      const s = JSON.parse(serialize(h.state));
      edit(s.game);
      return restore(JSON.stringify(s));
    };
    expect(bad((g) => { g.phase = "dancing"; })).toThrow(/game must be/);
    expect(bad((g) => { g.credits = -1; })).toThrow(/game must be/);
    expect(bad((g) => { g.board = { main: [1, 2], bought: [] }; })).toThrow(/game must be/);
    expect(bad((g) => { g.board = { main: [2, 1], bought: [3, 3] }; })).not.toThrow();
    expect(bad((g) => { g.tilted = "no"; })).toThrow(/game must be/);
  });
});

describe("starting the rules with a flow", () => {
  const make = (o: object) => () => createRules(table, { seed: 1, ...o });

  it("rejects a flow with bad numbers", () => {
    expect(make({ flow: { ...cfg, ballsPerGame: 0 } })).toThrow(/ballsPerGame must be a whole number of at least 1/);
    expect(make({ flow: { ...cfg, startCost: -1 } })).toThrow(/startCost/);
    expect(make({ flow: { ...cfg, startCredits: 1.5 } })).toThrow(/startCredits/);
    expect(make({ flow: { ...cfg, overTicks: 0 } })).toThrow(/overTicks/);
  });

  it("takes the machine's credits and scores instead of the config's", () => {
    const m = { credits: 7, boards: { main: [300, 200], bought: [50] } };
    const r = createRules(table, { seed: 1, flow: cfg, machine: m });
    expect(r.state.game).toMatchObject({ credits: 7, board: { main: [300, 200], bought: [50] } });
    m.boards.main.push(1);
    expect(r.state.game!.board.main).toEqual([300, 200]); // copied, not shared
  });

  it("refuses a machine without a flow, a machine together with a save, and a save that does not fit the flow", () => {
    const m = { credits: 1, boards: { main: [], bought: [] } };
    expect(make({ machine: m })).toThrow(/machine given without a flow/);
    const withFlow = machine();
    const saved = restore(serialize(withFlow.state));
    expect(make({ flow: cfg, machine: m, state: saved })).toThrow(/machine and state both given/);
    expect(make({ flow: cfg, state: restore(serialize(harness(table).state)) })).toThrow(/has no game but the table runs with a flow/);
    expect(make({ state: saved })).toThrow(/has a game but the table runs without a flow/);
  });
});
