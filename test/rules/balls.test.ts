import { describe, expect, it } from "vitest";
import { createRules } from "../../src/rules";
import type { RulesEvent, TableRules } from "../../src/rules";
import { harness } from "./harness";

const empty: TableRules = { modes: {} };
const sw = (tick: number, name: string, ball = 0, kind: "hit" | "capture" = "hit"): RulesEvent => ({ t: "switch", tick, ball, sw: name, kind, impulse: 1 });
const plunger = (tick: number): RulesEvent => ({ t: "ballAtPlunger", tick });

describe("ball manager", () => {
  it("counts a ball that arrives at the plunger, calls onBallStart, and forgets half-seen shots", () => {
    const log: string[] = [];
    const h = harness({ modes: {}, onBallStart: (c) => log.push(`start ${c.ball.inPlay()}`) }, { shots: { s: ["a", "b"] } });
    h.at(1).ballAtPlunger().at(2).hit("a").run(3);
    expect(h.state.balls.inPlay).toBe(1);
    expect(h.state.shots).toEqual({ s: { i: 1, at: 2 } });
    h.at(4).drain().at(5).ballAtPlunger().run(6);
    expect(log).toEqual(["start 1", "start 1"]);
    expect(h.state.shots).toEqual({});
  });

  it("lowers the count on a drain before the handler runs", () => {
    const seen: number[] = [];
    const h = harness({ modes: {}, onDrain: (c) => seen.push(c.ball.inPlay()) });
    h.at(1).ballAtPlunger().at(2).drain().run(3);
    expect(seen).toEqual([0]);
    expect(h.state.balls.inPlay).toBe(0);
  });

  it("refuses a drain when no ball is in play, instead of hiding the bad accounting", () => {
    const h = harness(empty);
    expect(() => h.at(1).drain().run(2)).toThrow(/no ball is in play/);
    const twice = harness(empty);
    expect(() => twice.at(1).ballAtPlunger().at(2).drain().at(3).drain().run(4)).toThrow(/no ball is in play/);
  });

  it("refuses a ball at the plunger beyond the capacity", () => {
    const h = harness(empty);
    expect(() => h.at(1).ballAtPlunger().at(2).ballAtPlunger().run(3)).toThrow(/1 ball\(s\) are already in play/);
  });

  it("feeds a ball: a command, a count to feed, and the guard on capacity", () => {
    const h = harness({ modes: {}, onDrain: (c) => c.ball.feed() });
    h.at(1).ballAtPlunger().at(2).drain().run(3);
    expect(h.cmds).toEqual([{ c: "feedBall", feed: "plunger" }]);
    expect(h.state.balls.toFeed).toBe(1);
    h.at(4).ballAtPlunger().run(5);
    expect(h.state.balls).toMatchObject({ inPlay: 1, toFeed: 0 });
    const greedy = harness({ modes: {}, onSwitch: (c) => { c.ball.feed(); c.ball.feed(); } });
    expect(() => greedy.at(1).hit("a").run(1)).toThrow(/more than 1 ball/);
  });

  it("locks the ball of the switch event: count, command, one fewer in play", () => {
    const h = harness({ modes: {}, onSwitch: (c, e) => { if (e.kind === "capture") c.ball.lock(e.sw); } });
    h.at(1).ballAtPlunger().run(2);
    h.rules.step(3, [sw(3, "saucer", 4, "capture")], h.cmds);
    expect(h.cmds).toEqual([{ c: "lockBall", ball: 4, lock: "saucer" }]);
    expect(h.state.balls).toMatchObject({ inPlay: 0, locked: { saucer: 1 } });
  });

  it("cannot lock without a ball in the event, or with a bad id", () => {
    const timer = harness({ modes: {}, onSwitch: (c) => c.after("t", 5), onTimer: (c) => c.ball.lock("x") });
    expect(() => timer.at(1).hit("a").run(10)).toThrow(/only a switch event has a ball/);
    expect(() => harness({ modes: {}, onSwitch: (c) => c.ball.lock("__proto__") }).at(1).hit("a").run(1)).toThrow(/not a usable id/);
  });

  it("releases a lock with a releaseBall command for the same id, and brings the ball back into play", () => {
    const h = harness({
      modes: {},
      onSwitch(c, e) {
        if (e.kind === "capture") { c.ball.lock(e.sw); c.after("go", 10); }
      },
      onTimer: (c) => c.ball.release("saucer"),
    });
    h.at(1).ballAtPlunger().run(2);
    h.rules.step(3, [sw(3, "saucer", 0, "capture")], h.cmds);
    h.run(20);
    expect(h.cmds).toEqual([{ c: "lockBall", ball: 0, lock: "saucer" }, { c: "releaseBall", lock: "saucer" }]);
    expect(h.state.balls).toMatchObject({ inPlay: 1, locked: {} });
  });

  it("refuses to release what is not locked", () => {
    expect(() => harness({ modes: {}, onSwitch: (c) => c.ball.release("saucer") }).at(1).hit("a").run(1)).toThrow(/nothing is locked in "saucer"/);
  });

  it("counts several locks of one id and refuses to release into a table that is full", () => {
    const rules = createRules({ modes: {}, onSwitch(c, e) { if (e.kind === "capture") c.ball.lock(e.sw); else c.ball.release("saucer"); } }, { seed: 1 });
    rules.state.balls.capacity = 2;
    rules.step(1, [plunger(1)], []);
    rules.step(2, [plunger(2)], []);
    rules.step(3, [sw(3, "saucer", 0, "capture")], []);
    rules.step(4, [sw(4, "saucer", 1, "capture")], []);
    expect(rules.state.balls).toMatchObject({ inPlay: 0, locked: { saucer: 2 } });
    rules.step(5, [plunger(5)], []);
    rules.step(6, [plunger(6)], []);
    expect(() => rules.step(7, [sw(7, "go")], [])).toThrow(/more than 2 ball/);
    rules.step(8, [{ t: "drain", tick: 8, ball: 0 }], []);
    rules.step(9, [sw(9, "go")], []);
    expect(rules.state.balls).toMatchObject({ inPlay: 2, locked: { saucer: 1 } });
  });
});
