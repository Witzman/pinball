import { describe, expect, it } from "vitest";
import { advance, createGame, nudge, recover, takeCommands, tick } from "../../src/sim/game";
import type { FlowConfig, TableRules } from "../../src/rules";
import { demoTable } from "../../src/tables/demo";
import { saucerTable } from "./fixtures";
import type { Command } from "../../src/rules";

const flow: FlowConfig = { ballsPerGame: 3, startCost: 1, startCredits: 4, overTicks: 200, saverTicks: 0, bonusTicks: 5, extraBallMax: 0 };

/** Rules that blow up when the standup target is hit. */
const fragile: TableRules = { modes: {}, onSwitch: (c, e) => { if (e.sw === "target1") { c.addScore(500); throw new Error("script bug"); } } };

function hitTheTarget(g: ReturnType<typeof createGame>): void {
  g.table.world.gravity = 0;
  const b = g.table.world.balls[0]!;
  b.x = 0.34;
  b.y = 0.55;
  b.vx = 0;
  b.vy = -3;
}

describe("a tick that throws", () => {
  it("still throws out of tick() itself, so tests and tools see the error", () => {
    const g = createGame(demoTable, { rules: fragile, flow });
    g.input.start = true;
    for (let i = 0; i < 5; i++) tick(g);
    g.input.start = false;
    hitTheTarget(g);
    expect(() => { for (let i = 0; i < 100; i++) tick(g); }).toThrow(/script bug/);
  });

  it("is recovered from in the live loop: back in attract, credits kept, balls gone, the error told", () => {
    const g = createGame(demoTable, { rules: fragile, flow });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    expect(g.rules.state.game).toMatchObject({ phase: "play", credits: 3 });
    takeCommands(g);
    hitTheTarget(g);
    advance(g, 50);
    expect(g.errors).toEqual(["script bug"]);
    expect(g.errorCount).toBe(1);
    expect(g.rules.state.game).toMatchObject({ phase: "attract", credits: 3 });
    expect(g.rules.state.player.score).toBe(0);
    expect(g.table.world.balls).toHaveLength(0);
    expect(g.rules.state.balls).toMatchObject({ inPlay: 0, toFeed: 0 });
    expect(takeCommands(g)).toContainEqual({ c: "dmd", show: { id: "error", args: { message: "script bug" } } });
  });

  it("lets the player start another game after the recovery", () => {
    const g = createGame(demoTable, { rules: fragile, flow });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    hitTheTarget(g);
    advance(g, 50);
    expect(g.rules.state.game!.phase).toBe("attract");
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    expect(g.rules.state.game).toMatchObject({ phase: "play", credits: 2, bought: false });
    expect(g.table.world.balls).toHaveLength(1);
    expect(g.rules.state.player.ballNo).toBe(1);
  });

  it("keeps the score boards of the machine through a recovery", () => {
    const g = createGame(demoTable, { rules: fragile, flow, machine: { credits: 2, boards: { main: [900], bought: [30] } } });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    hitTheTarget(g);
    advance(g, 50);
    expect(g.rules.state.game!.board).toEqual({ main: [900], bought: [30] });
    expect(g.rules.state.game!.credits).toBe(1);
  });

  it("puts a fresh ball on the plunger when the table runs without a flow", () => {
    const g = createGame(demoTable, { rules: { modes: {}, onSwitch: () => { throw new Error("boom"); } } });
    expect(g.table.world.balls).toHaveLength(1);
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    b.x = 0.34;
    b.y = 0.55;
    b.vy = -3;
    advance(g, 50);
    expect(g.errors).toEqual(["boom"]);
    expect(g.table.world.balls).toHaveLength(1);
    expect(g.table.world.balls[0]!.y).toBeGreaterThan(0.95); // on the plunger
    expect(g.rules.state.balls.inPlay).toBe(1); // announced to the fresh rules on the next tick
  });

  it("switches magnets off, and a button still held counts as a new press for the fresh rules", () => {
    const g = createGame(saucerTable, { rules: { modes: {}, onBallStart: (c) => c.emit({ c: "magnet", id: "pull", on: true }), onSwitch: () => { throw new Error("boom"); } }, flow });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    expect(g.table.world.magnets[0]!.on).toBe(true);
    g.input.coin = true; // held when the error comes
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    b.x = 0.34;
    b.y = 0.55;
    b.vy = -3;
    advance(g, 60);
    expect(g.errorCount).toBe(1);
    expect(g.table.world.magnets[0]!.on).toBe(false);
    expect(g.pressed.coin).toBe(true); // the button is still down: the fresh rules will hear of it as a new press
    g.input.coin = false;
    advance(g, 5);
    expect(g.rules.state.game!.credits).toBeGreaterThanOrEqual(0);
  });

  it("keeps only the last ten messages, but counts them all", () => {
    const g = createGame(demoTable, { rules: fragile, flow: { ...flow, startCost: 0 } });
    for (let n = 1; n <= 13; n++) {
      g.input.start = true;
      advance(g, 5);
      g.input.start = false;
      advance(g, 5);
      hitTheTarget(g);
      advance(g, 50);
      for (let calm = 0; calm < 22; calm++) advance(g, 50); // a calm stretch between errors
    }
    expect(g.errorCount).toBe(13);
    expect(g.errors).toHaveLength(10);
  });

  it("does not hide a healthy game: no errors, no change", () => {
    const g = createGame(demoTable, { flow });
    g.input.start = true;
    advance(g, 5);
    advance(g, 500);
    expect(g.errorCount).toBe(0);
    expect(g.errors).toEqual([]);
    expect(g.rules.state.game!.phase).toBe("play");
  });
});

describe("a recovery and the nudge", () => {
  it("forgets a nudge that was waiting and the cooldown of the last one", () => {
    const g = createGame(demoTable);
    expect(nudge(g, "left")).toBe(true);
    tick(g);
    expect(nudge(g, "up")).toBe(false); // cooling
    g.pendingNudge = "right"; // one more waiting
    recover(g, new Error("boom"));
    expect(g.pendingNudge).toBeNull();
    expect(nudge(g, "up")).toBe(true); // no cooldown carried over
  });
});

describe("an error that will not go away", () => {
  const freshGame = () => createGame(demoTable, { rules: fragile, flow: { ...flow, startCost: 0 } });
  const crash = (g: ReturnType<typeof createGame>) => {
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    hitTheTarget(g);
    advance(g, 50);
  };

  it("gives up after five errors in a row instead of restarting for ever, and stops the loop", () => {
    const g = freshGame();
    for (let i = 0; i < 4; i++) crash(g);
    expect(g.broken).toBeNull();
    crash(g);
    expect(g.broken).toMatch(/too many errors in a row, the last: script bug/);
    const tickBefore = g.table.world.tick;
    advance(g, 100);
    expect(g.table.world.tick).toBe(tickBefore); // nothing runs any more
    expect(g.accMs).toBe(0);
  });

  it("forgives errors that are far apart", () => {
    const g = freshGame();
    for (let i = 0; i < 9; i++) {
      crash(g);
      for (let calm = 0; calm < 22; calm++) advance(g, 50); // more than 1000 good ticks
    }
    expect(g.errorCount).toBe(9);
    expect(g.broken).toBeNull();
  });

  it("stops the loop, rather than throwing out of it, when the recovery itself fails", () => {
    const g = freshGame();
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    g.setup.options.flow = { ...flow, ballsPerGame: 0 }; // the rules cannot be rebuilt from this
    hitTheTarget(g);
    expect(() => advance(g, 50)).not.toThrow();
    expect(g.broken).toMatch(/recovery failed: [\s\S]*ballsPerGame/);
  });

  it("passes on the credit and score-board commands the failed tick had made but not yet delivered, and only those", () => {
    const g = createGame(demoTable, { flow });
    const cmds: Command[] = [
      { c: "credits", n: 2 }, // already applied and queued
      { c: "hiscore", board: "main", score: 900, rank: 1 }, // made, not delivered
      { c: "sound", play: "ding" }, // not the machine's business
      { c: "credits", n: 3 },
    ];
    g.cmds.push(...cmds);
    g.applied = 1;
    takeCommands(g);
    recover(g, new Error("boom"));
    const out = takeCommands(g);
    expect(out.filter((c) => c.c !== "dmd")).toEqual([{ c: "hiscore", board: "main", score: 900, rank: 1 }, { c: "credits", n: 3 }]);
  });
});

