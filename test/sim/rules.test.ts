import { describe, expect, it } from "vitest";
import { advance, createGame, takeCommands, tick } from "../../src/sim/game";
import { runReplay } from "../../src/sim/replay";
import type { Replay } from "../../src/sim/replay";
import { hashRules } from "../../src/rules";
import type { Command, RulesEvent, TableRules } from "../../src/rules";
import { demoTable } from "../../src/tables/demo";
import type { TableDef } from "../../src/table/schema";

/** The demo table with a sinkhole in the plunger lane, right in the path of a launched ball. */
const saucerTable: TableDef = {
  ...structuredClone(demoTable),
  id: "saucer-demo",
  triggers: [{ id: "saucer", at: [499, 700], r: 8, switch: "saucer_sw", hold: { kickDeg: -90, kickSpeed: 2 } }],
  magnets: [{ id: "pull", at: [250, 600], r: 60, strength: 8 }],
};

/** Records every event; the rest of the table is free play. */
function recorder(log: RulesEvent[]): TableRules {
  const modes: TableRules["modes"] = { spy: { start: "p", phases: { p: { on: {
    switch: (_c, e) => { log.push(e); },
    button: (_c, e) => { log.push(e); },
    drain: (_c, e) => { log.push(e); },
    ballAtPlunger: (_c, e) => { log.push(e); },
  } } } } };
  return { modes, onSwitch: () => {}, onDrain: (c) => c.ball.feed(), onBallStart: (c) => c.start("spy") };
}

function run(g: ReturnType<typeof createGame>, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(g);
}

describe("rules in the game loop", () => {
  it("tells the rules about the ball on the plunger on the first tick", () => {
    const g = createGame(demoTable);
    expect(g.rules.state.balls.inPlay).toBe(0);
    tick(g);
    expect(g.rules.state.balls.inPlay).toBe(1);
    expect(g.rules.state.tick).toBe(1);
    tick(g);
    expect(g.rules.state.balls.inPlay).toBe(1); // only once
  });

  it("steps the rules to the physics tick every tick", () => {
    const g = createGame(demoTable);
    run(g, 250);
    expect(g.rules.state.tick).toBe(g.table.world.tick);
    advance(g, 7);
    expect(g.rules.state.tick).toBe(257);
  });

  it("sends button edges, once per press and release", () => {
    const log: RulesEvent[] = [];
    const g = createGame(demoTable, { rules: recorder(log) });
    run(g, 2);
    g.input.left = true;
    run(g, 5);
    g.input.right = true;
    g.input.left = false;
    run(g, 3);
    g.input.right = false;
    run(g, 2);
    const buttons = log.filter((e) => e.t === "button").map((e) => (e.t === "button" ? `${e.button} ${e.down ? "down" : "up"} @${e.tick}` : ""));
    expect(buttons).toEqual(["left down @3", "left up @8", "right down @8", "right up @11"]);
  });

  it("turns contacts into switch events with the table's switch names and their kinds", () => {
    const log: RulesEvent[] = [];
    const g = createGame(demoTable, { rules: recorder(log) });
    const b = g.table.world.balls[0]!;
    g.table.world.gravity = 0;
    b.x = 0.34;
    b.y = 0.55;
    b.vx = 0;
    b.vy = -3; // into the standup target "target1" at y = 0.5
    run(g, 100);
    const hits = log.filter((e) => e.t === "switch");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({ t: "switch", sw: "target1", kind: "hit", ball: 0 });
    expect((hits[0] as { impulse: number }).impulse).toBeGreaterThan(0);
  });

  it("reports a drain, replaces the ball through the rules, and keeps counting", () => {
    const log: RulesEvent[] = [];
    const g = createGame(demoTable, { rules: recorder(log) });
    run(g, 3);
    g.table.world.balls[0]!.y = 1.2; // below the table
    tick(g);
    expect(log.filter((e) => e.t === "drain")).toHaveLength(1);
    expect(g.drains).toBe(1);
    expect(g.table.world.balls).toHaveLength(1);
    expect(g.table.world.balls[0]!.y).toBeGreaterThan(0.9); // back on the plunger
    expect(takeCommands(g)).toContainEqual({ c: "feedBall", feed: "plunger" });
    tick(g);
    expect(g.rules.state.balls).toMatchObject({ inPlay: 1, toFeed: 0 });
    // the first arrival starts the spy mode, so only the second one reaches it
    expect(log.filter((e) => e.t === "ballAtPlunger")).toHaveLength(1);
  });

  it("removes only the drained balls and keeps the others", () => {
    const g = createGame(demoTable);
    run(g, 3);
    g.rules.state.balls.capacity = 3;
    const w = g.table.world;
    w.balls.push({ ...w.balls[0]!, x: 0.2, y: 0.3 }, { ...w.balls[0]!, x: 0.3, y: 0.3 });
    w.balls[0]!.y = 1.2;
    w.balls[2]!.y = 1.3;
    tick(g);
    // the ball in the middle stayed; each drained ball was replaced by a new one on the plunger
    expect(w.balls.map((b) => b.x)).toEqual([0.2, 0.499, 0.499]);
    expect(w.balls[0]!.y).toBeCloseTo(0.3, 3);
  });

  it("gives the commands to the outbox once and clears it on take", () => {
    const g = createGame(demoTable);
    run(g, 2);
    g.table.world.balls[0]!.y = 1.2;
    tick(g);
    expect(takeCommands(g)).toEqual([{ c: "feedBall", feed: "plunger" }]);
    expect(takeCommands(g)).toEqual([]);
  });
});

describe("commands that reach the physics", () => {
  it("switches a magnet on and off on command, and passes lamps, display and sound on to the outbox", () => {
    const rules: TableRules = {
      modes: {},
      onBallStart(c) {
        c.emit({ c: "magnet", id: "pull", on: true });
        c.emit({ c: "sound", play: "ding" });
        c.emit({ c: "dmd", show: { id: "hello" } });
        c.setLamp("l", "lit");
        c.after("off", 50);
      },
      onTimer: (c) => c.emit({ c: "magnet", id: "pull", on: false }),
    };
    const g = createGame(saucerTable, { rules });
    expect(g.table.world.magnets[0]!.on).toBe(false);
    tick(g);
    expect(g.table.world.magnets[0]!.on).toBe(true);
    expect(takeCommands(g).map((c) => c.c)).toEqual(["magnet", "sound", "dmd", "setLamp"]);
    run(g, 60);
    expect(g.table.world.magnets[0]!.on).toBe(false);
    expect(takeCommands(g)).toEqual([{ c: "magnet", id: "pull", on: false }]);
  });

  it("fails loudly on a command for a magnet or sinkhole the table does not have", () => {
    const bad = (cmd: Command) => () => run(createGame(saucerTable, { rules: { modes: {}, onBallStart: (c) => c.emit(cmd) } }), 2);
    expect(bad({ c: "magnet", id: "nope", on: true })).toThrow(/unknown magnet "nope"/);
    expect(bad({ c: "fireSolenoid", id: "nope" })).toThrow(/unknown trigger "nope"/);
  });

  it("refuses to lock a ball that is not held in a sinkhole", () => {
    const rules: TableRules = { modes: {}, onSwitch: (c) => c.ball.lock("saucer"), onDrain: (c) => c.ball.feed() };
    const g = createGame(demoTable, { rules });
    const log: RulesEvent[] = [];
    run(g, 2);
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    b.x = 0.34;
    b.y = 0.55;
    b.vy = -3;
    expect(() => run(g, 100)).toThrow(/ball 0 is not held in a sinkhole/);
    expect(log).toEqual([]);
  });

  it("captures a launched ball in a sinkhole, holds it while the rules wait, then releases it with a kick", () => {
    const rules: TableRules = {
      modes: {},
      onSwitch(c, e) {
        if (e.kind === "capture") {
          c.ball.lock(e.sw === "saucer_sw" ? "saucer" : "?");
          c.after("free", 300);
          c.add("roll", Math.floor(c.rnd() * 1000000));
        }
      },
      onTimer: (c) => c.ball.release("saucer"),
      onDrain: (c) => c.ball.feed(),
    };
    const g = createGame(saucerTable, { rules, seed: 5 });
    const b = () => g.table.world.balls[0]!;
    run(g, 300);
    g.input.plunge = true;
    run(g, 400);
    g.input.plunge = false;
    let held = 0;
    let heldAt = 0;
    for (let i = 0; i < 1500 && b().hold === 0; i++) tick(g);
    expect(b().hold).toBe(1); // captured at the sinkhole
    expect(b().x).toBeCloseTo(0.499, 12);
    expect(b().y).toBeCloseTo(0.7, 12);
    expect(g.rules.state.balls).toMatchObject({ inPlay: 0, locked: { saucer: 1 } });
    heldAt = g.rules.state.tick;
    for (let i = 0; i < 250; i++) {
      tick(g);
      if (b().hold === 1) held++;
    }
    expect(held).toBe(250); // still held 250 ticks later
    for (let i = 0; i < 100 && b().hold === 1; i++) tick(g);
    expect(b().hold).toBe(0);
    expect(g.rules.state.tick - heldAt).toBe(300); // released by the timer, 300 ticks after the capture
    expect(g.rules.state.balls).toMatchObject({ inPlay: 1, locked: {} });
    expect(b().vy).toBeLessThan(-1); // kicked up the lane
    expect(takeCommands(g).map((c) => c.c)).toEqual(expect.arrayContaining(["lockBall", "fireSolenoid"]));
  });
});

describe("replays with rules", () => {
  const saucerRules: TableRules = {
    modes: {},
    onSwitch(c, e) {
      if (e.kind === "capture") {
        c.ball.lock("saucer");
        c.after("free", 300);
        c.add("roll", Math.floor(c.rnd() * 1000000));
      }
    },
    onTimer: (c) => c.ball.release("saucer"),
    onDrain: (c) => c.ball.feed(),
  };
  const replay = (seed: number): Replay => ({
    header: { format: 1, tableId: "saucer-demo", dt: 0.001, seed, ticks: 4000 },
    inputs: [{ tick: 300, action: "plunge_down" }, { tick: 700, action: "plunge_up" }],
  });
  const play = (r: Replay) => runReplay(r, [saucerTable], { "saucer-demo": saucerRules });

  it("plays the same replay to the same physics and rules hashes twice", () => {
    const a = play(replay(5));
    const b = play(replay(5));
    expect(a.hash).toBe(b.hash);
    expect(a.rulesHash).toBe(b.rulesHash);
    expect(a.game.rules.state.counters.roll).toBeGreaterThan(0); // the sinkhole was reached
  });

  it("seeds the rules' random numbers from the header seed", () => {
    const a = play(replay(5));
    const b = play(replay(6));
    expect(a.game.rules.state.counters.roll).not.toBe(b.game.rules.state.counters.roll);
    expect(a.rulesHash).not.toBe(b.rulesHash);
    expect(a.hash).toBe(b.hash); // the physics does not care about the seed
  });

  it("differs from the same replay with the rules left out: the kick is the rules' doing", () => {
    const withRules = play(replay(5));
    const free = runReplay(replay(5), [saucerTable]);
    expect(withRules.hash).not.toBe(free.hash);
  });

  it("clears the outbox in a replay, so a long replay does not pile up commands", () => {
    expect(play(replay(5)).game.outbox).toEqual([]);
  });

  it("hashes the rules state: equal to hashRules of the final state", () => {
    const r = play(replay(5));
    expect(r.rulesHash).toBe(hashRules(r.game.rules.state));
  });
});
