import { describe, expect, it } from "vitest";
import { createGame, takeCommands, tick } from "../../src/sim/game";
import { runReplay, validateReplay } from "../../src/sim/replay";
import type { Replay } from "../../src/sim/replay";
import type { FlowConfig, TableRules } from "../../src/rules";
import { demoTable } from "../../src/tables/demo";
import { lcg } from "../core/scenes";

const flow: FlowConfig = { ballsPerGame: 3, startCost: 1, startCredits: 2, overTicks: 200 };
const rules: TableRules = { modes: {}, onSwitch: (c, e) => { if (e.sw === "target1") c.addScore(1000); } };
const setup = { rules, flow };

function run(g: ReturnType<typeof createGame>, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(g);
}

/** Presses and releases a machine button over a few ticks. */
function press(g: ReturnType<typeof createGame>, button: "coin" | "start" | "buyin"): void {
  g.input[button] = true;
  run(g, 3);
  g.input[button] = false;
  run(g, 3);
}

describe("a game in the game loop", () => {
  it("starts with no ball on the table and the rules in attract", () => {
    const g = createGame(demoTable, setup);
    run(g, 10);
    expect(g.table.world.balls).toHaveLength(0);
    expect(g.rules.state.game).toMatchObject({ phase: "attract", credits: 2 });
    expect(g.rules.state.balls.inPlay).toBe(0);
  });

  it("puts a ball on the plunger when start is pressed, and takes the credit", () => {
    const g = createGame(demoTable, setup);
    press(g, "start");
    expect(g.rules.state.game).toMatchObject({ phase: "play", credits: 1 });
    expect(g.table.world.balls).toHaveLength(1);
    expect(g.table.world.balls[0]!.y).toBeGreaterThan(0.95); // on the plunger
    expect(g.rules.state.balls.inPlay).toBe(1);
    const cmds = takeCommands(g).map((c) => c.c);
    expect(cmds).toEqual(["credits", "feedBall"]);
  });

  it("takes a coin from the machine button", () => {
    const g = createGame(demoTable, setup);
    press(g, "coin");
    press(g, "coin");
    expect(g.rules.state.game!.credits).toBe(4);
    expect(takeCommands(g)).toEqual([{ c: "credits", n: 3 }, { c: "credits", n: 4 }]);
  });

  it("plays three balls to game over, then back to attract with no ball left on the table", () => {
    const g = createGame(demoTable, setup);
    press(g, "start");
    for (let ball = 1; ball <= 3; ball++) {
      expect(g.rules.state.player.ballNo).toBe(ball);
      expect(g.table.world.balls).toHaveLength(1);
      g.table.world.balls[0]!.y = 1.2; // drains
      run(g, 3);
    }
    expect(g.rules.state.game!.phase).toBe("over");
    expect(g.table.world.balls).toHaveLength(0);
    expect(g.drains).toBe(3);
    expect(takeCommands(g)).toContainEqual({ c: "gameOver", score: 0, bought: false });
    run(g, 200);
    expect(g.rules.state.game!.phase).toBe("attract");
  });

  it("ends a game even when the table brings no rules of its own", () => {
    // a flow with the default rules must not inherit free play, which would feed a ball on every drain forever
    const g = createGame(demoTable, { flow });
    press(g, "start");
    for (let ball = 1; ball <= 3; ball++) {
      g.table.world.balls[0]!.y = 1.2;
      run(g, 3);
    }
    expect(g.rules.state.game!.phase).toBe("over");
    expect(g.table.world.balls).toHaveLength(0);
  });

  it("ends a game even when the table brings no rules of its own", () => {
    // a flow with the default rules must not inherit free play, which would feed a ball on every drain forever
    const g = createGame(demoTable, { flow });
    press(g, "start");
    for (let ball = 1; ball <= 3; ball++) {
      g.table.world.balls[0]!.y = 1.2;
      run(g, 3);
    }
    expect(g.rules.state.game!.phase).toBe("over");
    expect(g.table.world.balls).toHaveLength(0);
  });

  it("scores through the table's rules while a ball is in play", () => {
    const g = createGame(demoTable, setup);
    press(g, "start");
    g.table.world.gravity = 0;
    const b = g.table.world.balls[0]!;
    b.x = 0.34;
    b.y = 0.55;
    b.vx = 0;
    b.vy = -3; // into the target
    run(g, 100);
    expect(g.rules.state.player.score).toBeGreaterThanOrEqual(1000);
  });

  it("does not score from a switch hit while no game is on", () => {
    const g = createGame(demoTable, setup);
    g.table.world.balls.push({ x: 0.34, y: 0.55, vx: 0, vy: -3, w: 0, r: 0.0135, m: 0.08, zone: 0, hold: 0 }); // test setup: a stray ball
    g.table.world.gravity = 0;
    run(g, 100);
    expect(g.rules.state.player.score).toBe(0);
  });

  it("keeps the number of balls on the table equal to the balls the rules count, and ends a game after exactly three drained balls, over many random games", () => {
    let played = 0;
    let finished = 0;
    const broken: string[] = []; // collected, so the loop stays fast: one expect at the end
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = lcg(seed);
      const g = createGame(demoTable, { ...setup, seed });
      let before = g.rules.state.game!.phase;
      let drainsAtStart = 0;
      for (let t = 0; t < 3000; t++) {
        const r = rnd();
        if (r < 0.004) g.input.coin = !g.input.coin;
        else if (r < 0.008) g.input.start = !g.input.start;
        else if (r < 0.012 && g.table.world.balls.length > 0) g.table.world.balls[0]!.y = 1.2;
        tick(g);
        const here = `seed ${seed} tick ${t}`;
        const b = g.rules.state.balls;
        const locked = Object.values(b.locked).reduce((a, n) => a + n, 0);
        const onTable = g.table.world.balls.length;
        const phase = g.rules.state.game!.phase;
        if (onTable !== b.inPlay + b.toFeed + locked) broken.push(`${here}: ${onTable} on the table, rules count ${b.inPlay + b.toFeed + locked}`);
        if (phase !== "play" && onTable !== 0) broken.push(`${here}: ${onTable} balls on the table in phase ${phase}`);
        if (g.rules.state.player.ballNo > 3) broken.push(`${here}: ball number ${g.rules.state.player.ballNo}`);
        if (before !== "play" && phase === "play") drainsAtStart = g.drains;
        before = phase;
        for (const c of takeCommands(g)) {
          if (c.c === "feedBall") played++;
          if (c.c === "gameOver") {
            finished++;
            if (g.drains - drainsAtStart !== 3) broken.push(`${here}: game over after ${g.drains - drainsAtStart} drains`);
          }
        }
      }
    }
    expect(broken.slice(0, 5)).toEqual([]);
    // the property was exercised: many balls were served and several games ran to the end
    expect(played).toBeGreaterThan(30);
    expect(finished).toBeGreaterThan(3);
  }, 30000);
});

describe("a game in a replay", () => {
  const replay = (): Replay => ({
    header: { format: 1, tableId: "demo", dt: 0.001, seed: 4, ticks: 3000 },
    inputs: [
      { tick: 10, action: "coin_down" }, { tick: 20, action: "coin_up" },
      { tick: 100, action: "start_down" }, { tick: 110, action: "start_up" },
      { tick: 400, action: "plunge_down" }, { tick: 800, action: "plunge_up" },
    ],
  });
  const play = (r: Replay) => runReplay(r, [demoTable], { demo: setup });

  it("knows the machine buttons as replay actions", () => {
    expect(validateReplay(replay())).toEqual([]);
    const bad = replay();
    (bad.inputs[0] as { action: string }).action = "coin_sideways";
    expect(validateReplay(bad).join("\n")).toMatch(/"coin_sideways" is unknown/);
  });

  it("replays coin, start and plunger to the same physics and rules hashes twice", () => {
    const a = play(replay());
    const b = play(replay());
    expect(a.hash).toBe(b.hash);
    expect(a.rulesHash).toBe(b.rulesHash);
    expect(a.game.rules.state.game).toMatchObject({ phase: "play", credits: 2 }); // 2 + 1 coin - 1 start
    expect(a.game.table.world.balls[0]!.y).toBeLessThan(0.95); // the launch took the ball off the plunger
  });

  it("gives a different result without the coin: the buttons really are part of the replay", () => {
    const noCoin = replay();
    noCoin.inputs = noCoin.inputs.filter((i) => !i.action.startsWith("coin"));
    expect(play(noCoin).rulesHash).not.toBe(play(replay()).rulesHash);
  });
});
