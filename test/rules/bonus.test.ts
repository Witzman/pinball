import { describe, expect, it } from "vitest";
import { createRules, hashRules, kickback, restore, serialize, validateFlow } from "../../src/rules";
import type { FlowConfig, TableRules } from "../../src/rules";
import { harness } from "./harness";

const cfg: FlowConfig = { ballsPerGame: 3, startCost: 1, startCredits: 2, overTicks: 100, saverTicks: 300, bonusTicks: 200, extraBallMax: 1 };

const table: TableRules = {
  modes: { m: { start: "p", phases: { p: { exit: (c) => c.add("mode_exited") } } } },
  persist: ["eggs"],
  onSwitch(c, e) {
    if (e.sw === "loop") c.add("loops");
    if (e.sw === "level") c.add("levels");
    if (e.sw === "x") c.add("bonusX");
    if (e.sw === "egg") c.add("eggs");
    if (e.sw === "mode") { c.start("m"); c.after("t", 5000); }
    if (e.sw === "extra") c.add("extra_given", c.game.extraBall() ? 1 : 0);
    if (e.sw === "extra_false") c.add("extra_refused", c.game.extraBall() ? 0 : 1);
    if (e.sw === "saver") c.game.saver(500);
    if (e.sw === "kick") c.add("kicked", kickback(c, { lamp: "kb", solenoid: "kicker" }) ? 1 : 0);
    if (e.sw === "kb_on") c.setLamp("kb", "lit");
    if (e.sw === "phase") c.add(`phase_${c.game.phase()}`);
  },
  bonus: (c) => (c.count("loops") * 400 + c.count("levels") * 500) * Math.max(1, c.count("bonusX")),
  bonusParts: (c) => [["loops", c.count("loops") * 400], ["levels", c.count("levels") * 500]],
};

function game(over: Partial<FlowConfig> = {}) {
  const h = harness(table, { flow: { ...cfg, ...over } });
  h.at(1).button("start", true).at(2).ballAtPlunger();
  return h.run(3);
}

/** A game with the saver off, so a drain always ends the ball. */
const plain = () => game({ saverTicks: 0 });

/** Ends the ball with a drain at `tick` and runs to `tick`. */
function drain(h: ReturnType<typeof game>, tick: number) {
  return h.at(tick).drain().run(tick);
}

describe("end-of-ball bonus", () => {
  it("pays the table's bonus, multiplier included, when the ball ends, and shows it", () => {
    const h = plain();
    h.at(10).hit("loop").at(11).hit("loop").at(12).hit("level").at(13).hit("x").at(14).hit("x").run(15);
    h.take();
    drain(h, 20);
    expect(h.state.game!.phase).toBe("bonus");
    expect(h.state.player.score).toBe((2 * 400 + 500) * 2); // x2
    expect(h.cmds).toEqual([
      { c: "dmd", show: { id: "bonus", args: { total: 2600 } } },
      { c: "dmd", show: { id: "bonusPart", args: { label: "loops", value: 800 } } },
      { c: "dmd", show: { id: "bonusPart", args: { label: "levels", value: 500 } } },
    ]);
  });

  it("pays it once and keeps the counters it reads until the next ball", () => {
    const h = plain();
    h.at(10).hit("loop").run(11);
    drain(h, 20);
    h.run(150);
    expect(h.state.counters.loops).toBe(1);
    expect(h.state.player.score).toBe(400);
    h.run(220); // bonus time 200 from tick 20
    expect(h.state.game!.phase).toBe("play");
    expect(h.state.counters.loops).toBeUndefined();
    expect(h.state.player.score).toBe(400);
  });

  it("shows a zero bonus without scoring", () => {
    const h = plain();
    h.take();
    drain(h, 20);
    expect(h.state.player.score).toBe(0);
    expect(h.cmds[0]).toEqual({ c: "dmd", show: { id: "bonus", args: { total: 0 } } });
    expect(h.cmds).toHaveLength(3); // the two parts, both zero
  });

  it("goes without a bonus function: nothing is scored and the game still moves on", () => {
    const h = harness({ modes: {} }, { flow: cfg });
    h.at(1).button("start", true).at(2).ballAtPlunger().at(20).drain().run(21);
    expect(h.state.game!.phase).toBe("bonus");
    h.run(221);
    expect(h.state.game!.phase).toBe("play");
    expect(h.state.player.ballNo).toBe(2);
  });

  it("does not call the table's handlers while the bonus is shown", () => {
    const h = plain();
    drain(h, 20);
    h.at(50).hit("loop").run(51);
    expect(h.state.counters.loops).toBeUndefined();
  });

  it("stops modes (running their exit handlers) and table timers when the ball ends, before the bonus", () => {
    const h = plain();
    h.at(10).hit("mode").run(11);
    expect(h.state.modes.m).toBeDefined();
    drain(h, 20);
    expect(h.state.modes).toEqual({});
    expect(h.state.counters.mode_exited).toBe(1);
    expect(Object.keys(h.state.timers)).toEqual(["flow.bonus"]);
  });

  it("clears the multiplier and the rest for the next ball but keeps what the table persists", () => {
    const h = plain();
    h.at(10).hit("x").at(11).hit("egg").at(12).hit("loop").run(13);
    drain(h, 20);
    h.run(220);
    expect(h.state.counters.bonusX).toBeUndefined();
    expect(h.state.counters.eggs).toBe(1);
  });

  it("plays on to the next ball after the bonus, and ends the game after the last one, bonus first", () => {
    const h = plain();
    h.at(10).hit("loop").run(11);
    drain(h, 20);
    h.run(220).at(221).ballAtPlunger().at(230).hit("loop").at(235).drain().run(236);
    h.run(436).at(437).ballAtPlunger().at(440).hit("loop").at(445).drain().run(446);
    expect(h.state.game!.phase).toBe("bonus"); // the last ball's bonus first
    expect(h.state.player.score).toBe(1200);
    h.take();
    h.run(645);
    expect(h.state.game!.phase).toBe("over");
    expect(h.cmds).toEqual([{ c: "gameOver", score: 1200, bought: false }]);
  });

  it("skips the bonus of a tilted ball", () => {
    const h = plain();
    h.at(10).hit("loop").run(11);
    h.state.game!.tilted = true; // test setup: tilt is #20's, only the flag exists
    drain(h, 20);
    expect(h.state.player.score).toBe(0);
    expect(h.state.game!.phase).toBe("bonus");
    h.run(220);
    expect(h.state.game!.tilted).toBe(false);
  });

  it("restores a game in the bonus and plays on identically", () => {
    const h = plain();
    h.at(10).hit("loop").run(11);
    drain(h, 20);
    const saved = serialize(h.state);
    const mk = () => createRules(table, { seed: 1, flow: cfg, state: restore(saved) });
    const a = mk();
    const b = mk();
    for (const t of [100, 220, 221]) {
      a.step(t, t === 221 ? [{ t: "ballAtPlunger", tick: t }] : [], []);
      b.step(t, t === 221 ? [{ t: "ballAtPlunger", tick: t }] : [], []);
    }
    expect(a.state.game!.phase).toBe("play");
    expect(hashRules(a.state)).toBe(hashRules(b.state));
    expect(a.state.player.ballNo).toBe(2);
  });
});

describe("ball saver", () => {
  it("starts at the ball's first switch, not while the ball waits on the plunger", () => {
    const h = game();
    expect(h.state.game!.saverWait).toBe(true);
    expect(h.state.balls.saver.until).toBe(0);
    h.at(100).hit("loop").run(101);
    expect(h.state.game!.saverWait).toBe(false);
    expect(h.state.balls.saver.until).toBe(400);
  });

  it("serves the same ball again when the last ball drains inside the window, once", () => {
    const h = game();
    h.at(100).hit("loop").at(110).hit("loop").run(111);
    h.take();
    drain(h, 200);
    expect(h.state.game!.phase).toBe("play");
    expect(h.state.player.ballNo).toBe(1);
    expect(h.cmds).toEqual([{ c: "dmd", show: { id: "shootAgain" } }, { c: "feedBall", feed: "plunger" }]);
    expect(h.state.counters.loops).toBe(2); // nothing on the table was touched
    expect(h.state.balls.saver.until).toBe(0);
    h.at(201).ballAtPlunger().at(210).hit("loop").at(220).drain().run(221);
    expect(h.state.game!.phase).toBe("bonus"); // the saver is used up: no second save, and it does not start again
    expect(h.state.counters.loops).toBe(3);
  });

  it("does not save after the window, nor a ball that never hit a switch", () => {
    const late = game();
    late.at(100).hit("loop").run(101);
    drain(late, 400); // window is 100..400: tick 400 is no longer inside
    expect(late.state.game!.phase).toBe("bonus");
    const early = game();
    drain(early, 50);
    expect(early.state.game!.phase).toBe("bonus");
    const inside = game();
    inside.at(100).hit("loop").run(101);
    drain(inside, 399);
    expect(inside.state.game!.phase).toBe("play");
  });

  it("is off when the config says 0 ticks", () => {
    const h = game({ saverTicks: 0 });
    expect(h.state.game!.saverWait).toBe(false);
    h.at(100).hit("loop").run(101);
    expect(h.state.balls.saver.until).toBe(0);
    drain(h, 120);
    expect(h.state.game!.phase).toBe("bonus");
  });

  it("can be started by the table for a given time, from now", () => {
    const h = game({ saverTicks: 0 });
    h.at(100).hit("saver").run(101);
    expect(h.state.balls.saver.until).toBe(600);
    drain(h, 550);
    expect(h.state.game!.phase).toBe("play");
    expect(() => harness({ modes: {}, onSwitch: (c) => c.game.saver(0) }).at(1).hit("a").run(1)).toThrow(/whole number of at least 1/);
  });

  it("gives each ball its own saver", () => {
    const h = game();
    h.at(100).hit("loop").run(101);
    drain(h, 150); // saved
    h.at(151).ballAtPlunger().at(160).hit("loop").at(170).drain().run(171); // used up: bonus
    h.run(371).at(372).ballAtPlunger();
    h.run(373);
    expect(h.state.player.ballNo).toBe(2);
    expect(h.state.game!.saverWait).toBe(true);
    h.at(380).hit("loop").run(381);
    expect(h.state.balls.saver.until).toBe(680);
  });
});

describe("ball end edge cases", () => {
  it("does not serve a tilted ball again, even inside the saver window", () => {
    const h = game();
    h.at(100).hit("loop").run(101);
    h.state.game!.tilted = true; // test setup: #20 sets it
    drain(h, 150);
    expect(h.state.game!.phase).toBe("bonus");
  });

  it("goes on to the next ball even when the bonus function throws", () => {
    const rules = createRules({ modes: {}, bonus: () => { throw new Error("boom"); } }, { seed: 1, flow: { ...cfg, saverTicks: 0 } });
    const sw = (tick: number, t: "start" | "plunger"): never => (t === "start" ? { t: "button", tick, button: "start", down: true } : { t: "ballAtPlunger", tick }) as never;
    rules.step(1, [sw(1, "start")], []);
    rules.step(2, [sw(2, "plunger")], []);
    expect(() => rules.step(3, [{ t: "drain", tick: 3, ball: 0 }], [])).toThrow(/boom/);
    expect(rules.state.game!.phase).toBe("bonus");
    expect(rules.state.timers["flow.bonus"]).toBeDefined(); // the way on is there
    rules.step(3 + 200, [], []);
    expect(rules.state.game!.phase).toBe("play");
    expect(rules.state.player.ballNo).toBe(2);
  });

  it("does not let the bonus function start modes or feed balls", () => {
    const run = (fn: (c: Parameters<NonNullable<TableRules["bonus"]>>[0]) => void) => () => {
      const h = harness({ modes: { m: { start: "p", phases: { p: {} } } }, bonus: (c) => { fn(c); return 0; } }, { flow: { ...cfg, saverTicks: 0 } });
      h.at(1).button("start", true).at(2).ballAtPlunger().at(3).drain().run(4);
    };
    expect(run((c) => c.start("m"))).toThrow(/while the game flow clears the table/);
    expect(run((c) => c.ball.feed())).toThrow(/while the game flow clears the table/);
  });

  it("does not let the first switch start a saver the table already started by hand", () => {
    const h = game();
    h.at(10).hit("saver").at(20).hit("loop").run(21);
    expect(h.state.game!.saverWait).toBe(false);
    expect(h.state.balls.saver.until).toBe(510); // from the table's call at tick 10, not from the switch at 20
  });
});

describe("extra balls", () => {
  it("awards one, refuses the next, and tells the display", () => {
    const h = harness({ modes: {}, onSwitch: (c) => c.add("got", c.game.extraBall() ? 1 : 0) }, { flow: cfg });
    h.at(1).button("start", true).at(2).ballAtPlunger().run(3);
    h.take();
    h.at(10).hit("a").at(11).hit("a").at(12).hit("a").run(13);
    expect(h.state.counters.got).toBe(1); // 1 + 0 + 0
    expect(h.cmds.filter((c) => c.c === "dmd" && c.show.id === "extraBall")).toHaveLength(1);
  });

  it("is served after the bonus with the same ball number, so a game can run four balls", () => {
    const h = plain();
    h.at(10).hit("extra").run(11);
    drain(h, 20);
    expect(h.state.game!.phase).toBe("bonus");
    h.run(220);
    expect(h.state.game).toMatchObject({ phase: "play", shootAgain: 0 });
    expect(h.state.player.ballNo).toBe(1);
    expect(h.state.counters.extra_given).toBeUndefined(); // a new ball: the table is clear again
    h.at(221).ballAtPlunger().at(230).drain().run(231);
    h.run(431).at(432).ballAtPlunger().at(440).drain().run(441);
    h.run(641).at(642).ballAtPlunger().at(650).drain().run(651);
    h.run(851);
    expect(h.state.game!.phase).toBe("over");
    expect(h.state.player.ballNo).toBe(3);
  });

  it("refuses when the config allows none, and outside a ball being played", () => {
    const none = harness(table, { flow: { ...cfg, extraBallMax: 0 } });
    none.at(1).button("start", true).at(2).ballAtPlunger().at(10).hit("extra_false").run(11);
    expect(none.state.counters.extra_refused).toBe(1);
    const attract = harness({ modes: {}, onSwitch: (c) => c.add("x") }, { flow: cfg });
    expect(attract.state.game!.phase).toBe("attract");
    const noFlow = harness({ modes: {}, onSwitch: (c) => c.add("got", c.game.extraBall() ? 1 : 0) });
    noFlow.at(1).hit("a").run(2);
    expect(noFlow.state.counters.got).toBe(0);
  });

  it("starts a new game with no extra balls used", () => {
    const h = plain();
    h.at(10).hit("extra").run(11);
    expect(h.state.game!.extraBalls).toBe(1);
    drain(h, 20);
    h.run(220).at(221).ballAtPlunger().at(230).drain().run(231);
    h.run(431).at(432).ballAtPlunger().at(440).drain().run(441);
    h.run(641).at(642).ballAtPlunger().at(650).drain().run(651);
    h.run(1000).at(1001).button("start", true).run(1002);
    expect(h.state.game).toMatchObject({ phase: "play", extraBalls: 0, shootAgain: 0 });
  });
});

describe("where the game is, for scripts", () => {
  it("says play for a table without a flow, and the phase with one", () => {
    const free = harness(table);
    free.at(1).hit("phase").run(2);
    expect(free.state.counters.phase_play).toBe(1);
    const h = plain();
    h.at(10).hit("phase").run(11);
    expect(h.state.counters.phase_play).toBe(1);
  });
});

describe("kickback", () => {
  it("fires once when its lamp is lit, puts the lamp out, and does nothing when it is not lit", () => {
    const h = plain();
    h.at(10).hit("kick").run(11);
    expect(h.state.counters.kicked).toBe(0);
    expect(h.cmds.filter((c) => c.c === "fireSolenoid")).toEqual([]);
    h.at(12).hit("kb_on").at(13).hit("kick").at(14).hit("kick").run(15);
    expect(h.state.counters.kicked).toBe(1);
    expect(h.cmds.filter((c) => c.c === "fireSolenoid")).toEqual([{ c: "fireSolenoid", id: "kicker" }]);
    expect(h.state.lamps.kb).toBe("off");
  });
});

describe("flow config", () => {
  it("rejects bad saver, bonus and extra-ball numbers", () => {
    expect(validateFlow({ ...cfg, saverTicks: -1 }).join()).toMatch(/saverTicks/);
    expect(validateFlow({ ...cfg, bonusTicks: 0 }).join()).toMatch(/bonusTicks must be a whole number of at least 1/);
    expect(validateFlow({ ...cfg, extraBallMax: 1.5 }).join()).toMatch(/extraBallMax/);
    expect(validateFlow(cfg)).toEqual([]);
  });

  it("rejects a saved game with a bad extra-ball count or saver flag", () => {
    const h = plain();
    const bad = (edit: (g: Record<string, unknown>) => void) => () => {
      const s = JSON.parse(serialize(h.state));
      edit(s.game);
      return restore(JSON.stringify(s));
    };
    expect(bad((g) => { g.extraBalls = -1; })).toThrow(/game must be/);
    expect(bad((g) => { g.saverWait = "yes"; })).toThrow(/game must be/);
  });
});
