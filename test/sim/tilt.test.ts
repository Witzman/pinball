import { describe, expect, it } from "vitest";
import { advance, createGame, nudge, takeCommands, tick } from "../../src/sim/game";
import { runReplay } from "../../src/sim/replay";
import type { Replay } from "../../src/sim/replay";
import type { FlowConfig } from "../../src/rules";
import { demoTable } from "../../src/tables/demo";

const flow = (tilt: FlowConfig["tilt"]): FlowConfig => ({
  ballsPerGame: 3, startCost: 0, startCredits: 0, overTicks: 100, saverTicks: 0, bonusTicks: 5, extraBallMax: 0, tilt,
});

function started(tilt: FlowConfig["tilt"]) {
  const g = createGame(demoTable, { flow: flow(tilt) });
  g.input.start = true;
  advance(g, 5);
  g.input.start = false;
  advance(g, 5);
  g.table.world.gravity = 0; // the ball stays where the test puts it
  return g;
}

function nudgeAndRun(g: ReturnType<typeof started>, ticks = 260): void {
  expect(nudge(g, "left")).toBe(true);
  for (let i = 0; i < ticks; i++) tick(g);
}

const leftFlipper = (g: ReturnType<typeof started>) => g.table.world.flippers[g.table.flipperIds.indexOf("left")]!;

describe("a tilt in the game", () => {
  it("lets the flippers work before the tilt", () => {
    const g = started({ free: 0, warnings: 0, decayTicks: 2000 });
    g.input.left = true;
    for (let i = 0; i < 60; i++) tick(g);
    expect(leftFlipper(g).u).toBe(1);
  });

  it("switches both flippers off for the rest of the ball once it tilts", () => {
    const g = started({ free: 0, warnings: 0, decayTicks: 2000 });
    nudgeAndRun(g, 5);
    expect(g.rules.state.game!.tilted).toBe(true);
    g.input.left = true;
    g.input.right = true;
    for (let i = 0; i < 100; i++) tick(g);
    expect(leftFlipper(g).u).toBe(0);
    expect(g.table.world.flippers[g.table.flipperIds.indexOf("right")]!.u).toBe(0);
  });

  it("lets the flippers work again once the play is over, although tilted stays set until the next serve", () => {
    const g = started({ free: 0, warnings: 0, decayTicks: 2000 });
    nudgeAndRun(g, 5);
    expect(g.rules.state.game).toMatchObject({ tilted: true, phase: "play" });
    g.rules.state.game!.phase = "attract"; // as after the last ball: the flag is still set
    g.input.left = true;
    for (let i = 0; i < 60; i++) tick(g);
    expect(leftFlipper(g).u).toBe(1);
  });

  it("drops a flipper that was up when the tilt came, and the next ball has working flippers again", () => {
    const g = started({ free: 0, warnings: 0, decayTicks: 2000 });
    g.input.left = true;
    for (let i = 0; i < 60; i++) tick(g);
    expect(leftFlipper(g).u).toBe(1);
    nudgeAndRun(g, 200);
    expect(leftFlipper(g).u).toBe(0);
    g.table.world.balls[0]!.y = 1.2; // the dead ball drains
    for (let i = 0; i < 30; i++) tick(g); // bonus time, then the next ball
    expect(g.rules.state.game).toMatchObject({ phase: "play", tilted: false });
    for (let i = 0; i < 60; i++) tick(g);
    expect(leftFlipper(g).u).toBe(1);
  });

  it("warns, then tilts, over real nudges with the cooldown between them", () => {
    const g = started({ free: 1, warnings: 2, decayTicks: 5000 });
    takeCommands(g);
    const cues: string[] = [];
    for (let i = 0; i < 4; i++) {
      nudgeAndRun(g);
      for (const c of takeCommands(g)) if (c.c === "dmd") cues.push(c.show.id);
    }
    expect(cues).toEqual(["tiltWarning", "tiltWarning", "tilt"]);
    expect(g.rules.state.game!.tilted).toBe(true);
  });

  it("is not reached by nudges that the cooldown dropped", () => {
    const g = started({ free: 0, warnings: 0, decayTicks: 5000 });
    nudge(g, "left");
    tick(g);
    for (let i = 0; i < 5; i++) {
      expect(nudge(g, "left")).toBe(false);
      tick(g);
    }
    expect(g.rules.state.game!.tiltHeat).toBe(1);
  });
});

describe("a tilt in a replay", () => {
  const setup = { demo: { flow: flow({ free: 1, warnings: 1, decayTicks: 3000 }) } };
  const replay = (nudges: number): Replay => ({
    header: { format: 1, tableId: "demo", dt: 0.001, seed: 2, ticks: 3000 },
    inputs: [
      { tick: 10, action: "start_down" }, { tick: 20, action: "start_up" },
      ...Array.from({ length: nudges }, (_, i) => ({ tick: 400 + i * 300, action: "nudge_left" as const })),
    ],
  });

  it("reproduces the tilt, with both hashes, every time", () => {
    const a = runReplay(replay(3), [demoTable], setup);
    const b = runReplay(replay(3), [demoTable], setup);
    expect(a.game.rules.state.game!.tilted).toBe(true);
    expect(a.hash).toBe(b.hash);
    expect(a.rulesHash).toBe(b.rulesHash);
  });

  it("tilts only with enough nudges: two are a warning, three a tilt", () => {
    expect(runReplay(replay(2), [demoTable], setup).game.rules.state.game!.tilted).toBe(false);
    expect(runReplay(replay(3), [demoTable], setup).game.rules.state.game!.tilted).toBe(true);
    expect(runReplay(replay(0), [demoTable], setup).game.rules.state.game).toMatchObject({ tilted: false, tiltHeat: 0 });
  });
});
