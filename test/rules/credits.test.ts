import { describe, expect, it } from "vitest";
import { createRules, hashRules, restore, serialize } from "../../src/rules";
import type { Command, FlowConfig, TableRules } from "../../src/rules";
import { harness } from "./harness";

const cfg: FlowConfig = {
  ballsPerGame: 3, startCost: 1, startCredits: 3, overTicks: 100, saverTicks: 0, bonusTicks: 10, extraBallMax: 0,
  replayScore: 1000, highScoreCredit: true, boardSize: 3, buyIn: { cost: 2, balls: 2, windowTicks: 500 },
};

const table: TableRules = {
  modes: {},
  onSwitch(c, e) {
    if (e.sw === "p") c.addScore(100);
    if (e.sw === "big") c.addScore(5000);
    if (e.sw === "credit") c.game.awardCredit(2);
  },
  bonus: (c) => c.count("bonus_points"),
};

type H = ReturnType<typeof harness>;
let at = 0;

/** A game with `score` points on ball 1 and nothing after, played to its end; `h` is left at the end of the game. */
function started(opts: Partial<FlowConfig> = {}, machine?: { credits: number; boards: { main: number[]; bought: number[] } }): H {
  const h = harness(table, { flow: { ...cfg, ...opts }, ...(machine ? { machine } : {}) });
  at = 1;
  h.at(at).button("start", true).at(at + 1).ballAtPlunger();
  at += 2;
  return h.run(at);
}

/** Drains the ball, lets the bonus pass and serves the next one. */
function nextBall(h: H): H {
  at += 5;
  h.at(at).drain().run(at);
  at += 20;
  h.run(at).at(at + 1).ballAtPlunger();
  at += 1;
  return h.run(at);
}

/** Plays out the last ball: drains it and lets the bonus pass. */
function endGame(h: H): H {
  at += 5;
  h.at(at).drain().run(at);
  at += 20;
  return h.run(at);
}

function scoreAndPlayOut(h: H, points: "p" | "big", times: number): H {
  for (let i = 0; i < times; i++) h.at(++at).hit(points);
  return h.run(at);
}

const cmds = (h: H, kind: Command["c"]) => h.cmds.filter((c) => c.c === kind);

describe("replay score", () => {
  it("pays one credit when the score is reached, once a game, and tells the display and the leaves", () => {
    const h = started();
    h.take();
    scoreAndPlayOut(h, "p", 9); // 900
    expect(h.state.game!.credits).toBe(2);
    scoreAndPlayOut(h, "p", 1); // 1000
    expect(h.state.game!.credits).toBe(3);
    expect(h.state.game!.replayDone).toBe(true);
    expect(cmds(h, "dmd")).toEqual([{ c: "dmd", show: { id: "replay" } }]);
    expect(cmds(h, "credits")).toEqual([{ c: "credits", n: 3 }]);
    scoreAndPlayOut(h, "p", 20);
    expect(h.state.game!.credits).toBe(3); // not again in this game
  });

  it("pays again in the next game", () => {
    const h = started();
    scoreAndPlayOut(h, "big", 1);
    expect(h.state.game!.credits).toBe(3); // 3 - 1 start + 1 replay
    nextBall(h);
    endGame(nextBall(h));
    expect(h.state.game!.phase).toBe("buyin"); // 3 credits cover the offer
    at = h.state.timers["flow.buyin"]!.due + 150; // the window runs out, attract follows
    h.run(at - 1).at(at).button("start", true).run(at);
    expect(h.state.game).toMatchObject({ phase: "play", replayDone: false });
    scoreAndPlayOut(h, "big", 1);
    expect(h.state.game!.replayDone).toBe(true);
  });

  it("counts the bonus too", () => {
    const h = harness({ modes: {}, bonus: () => 2000 }, { flow: cfg });
    h.at(1).button("start", true).at(2).ballAtPlunger().at(10).drain().run(11);
    expect(h.state.game!.phase).toBe("bonus");
    expect(h.state.game!.replayDone).toBe(true);
    expect(h.state.game!.credits).toBe(3); // 3 - 1 + 1
  });

  it("is off when the config has none, and never pays outside a game", () => {
    const none = started({ replayScore: 0 });
    scoreAndPlayOut(none, "big", 2);
    expect(none.state.game!.credits).toBe(2);
    const attract = harness(table, { flow: cfg });
    attract.at(1).hit("big").run(2);
    expect(attract.state.game!.credits).toBe(3);
  });

  it("is paid when a timer scores, not only a switch", () => {
    const t: TableRules = { modes: {}, onSwitch: (c) => c.after("pay", 5), onTimer: (c) => c.addScore(2000) };
    const h = harness(t, { flow: cfg });
    h.at(1).button("start", true).at(2).ballAtPlunger().at(3).hit("x").run(20);
    expect(h.state.game!.replayDone).toBe(true);
  });
});

describe("score boards", () => {
  it("puts the final score on the main board with its rank, and pays a credit for it", () => {
    const h = started({ replayScore: 0 }, { credits: 3, boards: { main: [9000, 400], bought: [] } });
    scoreAndPlayOut(h, "big", 1); // 5000
    h.take();
    nextBall(h);
    nextBall(h);
    endGame(h);
    expect(h.state.game!.board.main).toEqual([9000, 5000, 400]);
    expect(cmds(h, "hiscore")).toEqual([{ c: "hiscore", board: "main", score: 5000, rank: 2 }]);
    expect(cmds(h, "credits")).toEqual([{ c: "credits", n: 3 }]); // 2 left after the start + 1 for the board
    expect(cmds(h, "gameOver")).toEqual([{ c: "gameOver", score: 5000, bought: false }]);
  });

  it("gives a credit for a board place only when the config says so", () => {
    const h = started({ replayScore: 0, highScoreCredit: false });
    scoreAndPlayOut(h, "p", 3);
    nextBall(h);
    nextBall(h);
    endGame(h);
    expect(h.state.game!.board.main).toEqual([300]);
    expect(h.state.game!.credits).toBe(2);
  });

  it("puts a score after equal ones, keeps only the best few, and ignores one that does not make it", () => {
    const h = started({ replayScore: 0 }, { credits: 5, boards: { main: [500, 300, 300], bought: [] } });
    scoreAndPlayOut(h, "p", 3); // 300: ties the last place but the board is full of >= 300
    nextBall(h);
    nextBall(h);
    h.take();
    endGame(h);
    expect(h.state.game!.board.main).toEqual([500, 300, 300]);
    expect(cmds(h, "hiscore")).toEqual([]);
    expect(cmds(h, "credits")).toEqual([]);
  });

  it("makes room by dropping the worst score", () => {
    const h = started({ replayScore: 0 }, { credits: 5, boards: { main: [500, 300, 100], bought: [] } });
    scoreAndPlayOut(h, "p", 4); // 400
    nextBall(h);
    nextBall(h);
    endGame(h);
    expect(h.state.game!.board.main).toEqual([500, 400, 300]);
  });

  it("does not put a score of zero on the board", () => {
    const h = started({ replayScore: 0 });
    nextBall(h);
    nextBall(h);
    endGame(h);
    expect(h.state.game!.board.main).toEqual([]);
    expect(cmds(h, "hiscore")).toEqual([]);
  });

  it("trims a machine's boards to the board size", () => {
    const r = createRules(table, { seed: 1, flow: cfg, machine: { credits: 1, boards: { main: [9, 8, 7, 6, 5], bought: [4, 3, 2, 1] } } });
    expect(r.state.game!.board).toEqual({ main: [9, 8, 7], bought: [4, 3, 2] });
  });
});

describe("buy-in", () => {
  /** A game played to its end with `points` scored, left in the buy-in window. */
  function toBuyIn(points: number, opts: Partial<FlowConfig> = {}, machine?: { credits: number; boards: { main: number[]; bought: number[] } }): H {
    const h = started({ replayScore: 0, ...opts }, machine);
    scoreAndPlayOut(h, "p", points);
    nextBall(h);
    nextBall(h);
    endGame(h);
    return h;
  }

  it("offers more balls after the game when the player can pay, with a window", () => {
    const h = toBuyIn(5);
    expect(h.state.game).toMatchObject({ phase: "buyin", credits: 3, bought: false });
    expect(Object.keys(h.state.timers)).toEqual(["flow.buyin"]);
    expect(cmds(h, "gameOver")).toEqual([{ c: "gameOver", score: 500, bought: false }]);
  });

  it("does not offer it when the credits do not cover it, or when the config has none", () => {
    const none = toBuyIn(5, { buyIn: undefined });
    expect(none.state.game!.phase).toBe("over");
    const broke = toBuyIn(5, { highScoreCredit: false, startCredits: 2 });
    expect(broke.state.game).toMatchObject({ phase: "over", credits: 1 });
  });

  it("spends the credits, serves the first bought ball at once and plays on with the same score", () => {
    const h = toBuyIn(5);
    h.take();
    at += 1;
    h.at(at).button("buyin", true).run(at);
    expect(h.state.game).toMatchObject({ phase: "play", bought: true, credits: 1, shootAgain: 1 });
    expect(h.state.player).toMatchObject({ score: 500, ballNo: 3 });
    expect(h.cmds).toEqual([{ c: "credits", n: 1 }, { c: "feedBall", feed: "plunger" }]);
    expect(h.state.timers).toEqual({});
  });

  it("ends after the bought balls, puts the score on the bought board only, and offers nothing twice", () => {
    const h = toBuyIn(5, {}, { credits: 10, boards: { main: [], bought: [] } }); // rich enough to be offered a second time
    const mainBefore = [...h.state.game!.board.main];
    at += 1;
    h.at(at).button("buyin", true).at(at + 1).ballAtPlunger();
    at += 1;
    h.run(at);
    scoreAndPlayOut(h, "p", 2); // 700
    h.take();
    nextBall(h); // first bought ball ends, the second is served
    expect(h.state.game!.phase).toBe("play");
    scoreAndPlayOut(h, "p", 1); // 800
    endGame(h);
    expect(h.state.game!.board.main).toEqual(mainBefore); // untouched
    expect(h.state.game!.board.bought).toEqual([800]);
    expect(cmds(h, "hiscore")).toEqual([{ c: "hiscore", board: "bought", score: 800, rank: 1 }]);
    expect(cmds(h, "gameOver")).toEqual([{ c: "gameOver", score: 800, bought: true }]);
    expect(cmds(h, "credits")).toEqual([]); // no credit for a bought score
    expect(h.state.game!.credits).toBeGreaterThanOrEqual(2);
    expect(h.state.game!.phase).toBe("over"); // no second offer although the credits would pay for one
  });

  it("goes back to attract when the window runs out, keeping the credits", () => {
    const h = toBuyIn(5);
    const credits = h.state.game!.credits;
    const due = h.state.timers["flow.buyin"]!.due;
    h.run(due - 1);
    expect(h.state.game!.phase).toBe("buyin");
    h.run(due);
    expect(h.state.game!.phase).toBe("attract");
    expect(h.state.game!.credits).toBe(credits);
  });

  it("ignores the buy-in button outside the window, and a start inside it", () => {
    const h = toBuyIn(5);
    at += 1;
    h.at(at).button("start", true).run(at);
    expect(h.state.game!.phase).toBe("buyin");
    const attract = harness(table, { flow: cfg });
    attract.at(1).button("buyin", true).run(2);
    expect(attract.state.game).toMatchObject({ phase: "attract", credits: 3, bought: false });
  });

  it("takes a coin during the window", () => {
    const h = toBuyIn(5);
    const credits = h.state.game!.credits;
    at += 1;
    h.at(at).button("coin", true).run(at);
    expect(h.state.game!.credits).toBe(credits + 1);
    expect(h.state.game!.phase).toBe("buyin");
  });

  it("continues a game with a save taken in the window", () => {
    const h = toBuyIn(5);
    const saved = serialize(h.state);
    const mk = () => createRules(table, { seed: 1, flow: cfg, state: restore(saved) });
    const a = mk();
    const b = mk();
    for (const r of [a, b]) {
      r.step(at + 1, [{ t: "button", tick: at + 1, button: "buyin", down: true }], []);
      r.step(at + 2, [{ t: "ballAtPlunger", tick: at + 2 }], []);
    }
    expect(a.state.game).toMatchObject({ phase: "play", bought: true });
    expect(hashRules(a.state)).toBe(hashRules(b.state));
  });

  it("refuses a saved buy-in window without its timer or without a buy-in in the flow", () => {
    const h = toBuyIn(5);
    const s = restore(serialize(h.state));
    delete s.timers["flow.buyin"];
    expect(() => createRules(table, { seed: 1, flow: { ...cfg }, state: s })).toThrow(/"buyin" without its flow.buyin timer/);
    expect(() => createRules(table, { seed: 1, flow: { ...cfg, buyIn: undefined }, state: restore(serialize(h.state)) })).toThrow(/offers no buy-in/);
  });
});

describe("credits from the table", () => {
  it("lets a script award credits and tells the leaves the total", () => {
    const h = started();
    h.take();
    h.at(++at).hit("credit").run(at);
    expect(h.state.game!.credits).toBe(4); // 3 - 1 + 2
    expect(h.cmds).toEqual([{ c: "credits", n: 4 }]);
  });

  it("refuses a bad amount and does nothing without a flow", () => {
    for (const n of [0, -1, 1.5, Number.NaN]) {
      expect(() => harness({ modes: {}, onSwitch: (c) => c.game.awardCredit(n) }).at(1).hit("a").run(1)).toThrow(/whole number of at least 1/);
    }
    const free = harness({ modes: {}, onSwitch: (c) => c.game.awardCredit(2) });
    free.at(1).hit("a").run(2);
    expect(free.cmds).toEqual([]);
  });
});

describe("flow config for credits and boards", () => {
  it("rejects bad numbers", () => {
    const bad = (o: Partial<FlowConfig>) => () => createRules(table, { seed: 1, flow: { ...cfg, ...o } });
    expect(bad({ replayScore: -1 })).toThrow(/replayScore/);
    expect(bad({ boardSize: 0 })).toThrow(/boardSize/);
    expect(bad({ buyIn: { cost: 0, balls: 1, windowTicks: 10 } })).toThrow(/buyIn.cost/);
    expect(bad({ buyIn: { cost: 1, balls: 0, windowTicks: 10 } })).toThrow(/buyIn.balls/);
    expect(bad({ buyIn: { cost: 1, balls: 1, windowTicks: 0 } })).toThrow(/buyIn.windowTicks/);
  });
});
