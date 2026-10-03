import type { Command, GameState, RulesEvent, RulesState } from "./types";

/** How a table's game runs. Numbers here, per-table hooks in its `TableRules`. */
export interface FlowConfig {
  /** Balls in a game (before extra balls). */
  ballsPerGame: number;
  /** Credits a start takes; 0 = free play. */
  startCost: number;
  /** Credits a machine with no saved credits starts with. */
  startCredits: number;
  /** Ticks the game-over state lasts before the attract state. */
  overTicks: number;
  /** Ticks the ball saver runs from a ball's first switch; 0 = no saver. */
  saverTicks: number;
  /** Ticks the end-of-ball bonus is shown before the next ball. */
  bonusTicks: number;
  /** Most extra balls a game can award. */
  extraBallMax: number;
  /** A game that reaches this score earns one credit, once; 0 or absent = no replay score. */
  replayScore?: number;
  /** A score that makes the main board earns one credit. */
  highScoreCredit?: boolean;
  /** Scores a board keeps; default 10. */
  boardSize?: number;
  /**
   * Tilt: each nudge adds one heat, which cools one unit per `decayTicks`. Up to `free`
   * heat is quiet; up to `free + warnings` each nudge is a warning; more is a tilt (the
   * ball is dead: flippers off, no bonus, no saver). Absent = no tilt, nudges are free.
   */
  tilt?: { free: number; warnings: number; decayTicks: number };
  /** After a game, a player with `cost` credits may buy `balls` more balls within `windowTicks`; absent = no buy-in. */
  buyIn?: { cost: number; balls: number; windowTicks: number };
}

const DEFAULT_BOARD = 10;

/** What survives from one game to the next on a machine (kept by the leaves, see src/app). */
export interface Machine {
  credits: number;
  boards: { main: number[]; bought: number[] };
}

/** Problems with a flow config, or an empty list. */
export function validateFlow(cfg: FlowConfig): string[] {
  const errs: string[] = [];
  const nat = (name: "ballsPerGame" | "startCost" | "startCredits" | "overTicks" | "saverTicks" | "bonusTicks" | "extraBallMax", min: number) => {
    const v = cfg[name];
    if (!Number.isSafeInteger(v) || v < min) errs.push(`flow.${name} must be a whole number of at least ${min}, got ${v}`);
  };
  nat("ballsPerGame", 1);
  nat("startCost", 0);
  nat("startCredits", 0);
  nat("overTicks", 1);
  nat("saverTicks", 0);
  nat("bonusTicks", 1);
  nat("extraBallMax", 0);
  const opt = (what: string, v: number | undefined, min: number) => {
    if (v !== undefined && (!Number.isSafeInteger(v) || v < min)) errs.push(`flow.${what} must be a whole number of at least ${min}, got ${v}`);
  };
  opt("replayScore", cfg.replayScore, 0);
  opt("boardSize", cfg.boardSize, 1);
  if (cfg.tilt) {
    opt("tilt.free", cfg.tilt.free, 0);
    opt("tilt.warnings", cfg.tilt.warnings, 0);
    opt("tilt.decayTicks", cfg.tilt.decayTicks, 1);
  }
  if (cfg.buyIn) {
    opt("buyIn.cost", cfg.buyIn.cost, 1);
    opt("buyIn.balls", cfg.buyIn.balls, 1);
    opt("buyIn.windowTicks", cfg.buyIn.windowTicks, 1);
  }
  return errs;
}

/** Problems with a machine's saved state, which may come from untrusted storage; empty when fine. */
export function validateMachine(m: Machine): string[] {
  const errs: string[] = [];
  if (!Number.isSafeInteger(m.credits) || m.credits < 0) errs.push(`machine.credits must be a whole number, 0 or more, got ${m.credits}`);
  for (const name of ["main", "bought"] as const) {
    const b = m.boards?.[name];
    if (!Array.isArray(b) || !b.every((x) => Number.isSafeInteger(x) && x >= 0) || !b.every((x, i) => i === 0 || b[i - 1]! >= x)) {
      errs.push(`machine.boards.${name} must be a list of scores, whole numbers, highest first`);
    }
  }
  return errs;
}

export function initialGame(cfg: FlowConfig, machine?: Machine): GameState {
  return {
    phase: "attract",
    credits: machine ? machine.credits : cfg.startCredits,
    shootAgain: 0,
    bought: false,
    tilted: false,
    replayDone: false,
    extraBalls: 0,
    saverWait: false,
    tiltHeat: 0,
    tiltAt: 0,
    board: machine
      ? { main: machine.boards.main.slice(0, cfg.boardSize ?? DEFAULT_BOARD), bought: machine.boards.bought.slice(0, cfg.boardSize ?? DEFAULT_BOARD) }
      : { main: [], bought: [] },
  };
}

/** What the flow needs from the engine. */
export interface FlowHost {
  state: RulesState;
  emit(cmd: Command): void;
  /** Arms a one-shot timer under a reserved `flow.` id. */
  setTimer(id: string, ticks: number): void;
  clearTimer(id: string): void;
  /** Stops modes, cancels table timers, forgets shots, clears lamps and counters (all but the table's `persist` ones when `keepPersist`). */
  reset(keepPersist: boolean): void;
  /** Stops modes, cancels table timers and forgets shots, keeping lamps and counters (the bonus reads them). */
  stopPlay(): void;
  /** Awards the table's end-of-ball bonus; returns the points. */
  awardBonus(): number;
  now(): number;
  /** Sends every locked ball out again, so a tilted ball cannot be stuck in a lock. */
  releaseLocks(): void;
  /** Asks the ball manager for a ball on the plunger. */
  feed(): void;
}

export interface Flow {
  /** Coin, start and buy-in are the machine's, never the table's: true for them. */
  consumes(e: RulesEvent): boolean;
  press(e: RulesEvent): void;
  /** Whether modes and the table's handlers see events now: only while a ball is being played. */
  admits(): boolean;
  /** After a drain has been handled: does the ball, or the game, end? */
  afterDrain(): void;
  timer(id: string): void;
  /** A switch was hit while playing: starts the ball saver if it waits for that. */
  switchSeen(tick: number): void;
  extraBall(): boolean;
  saver(ticks: number): void;
  awardCredit(n: number): void;
  /** A nudge reached a ball: it heats the table, and enough heat is a warning or a tilt. */
  nudged(e: RulesEvent): void;
  /** The score may have changed: pays the replay credit when it is reached. */
  scored(): void;
  phase(): GameState["phase"];
}

const OVER = "flow.over";
const BONUS = "flow.bonus";
const BUYIN = "flow.buyin";

export function createFlow(cfg: FlowConfig, host: FlowHost): Flow {
  const game = (): GameState => host.state.game!;
  const credits = (): void => host.emit({ c: "credits", n: game().credits });

  /** A ball is about to be served: its own saver, a clean table, a new ball on the plunger. */
  const serve = (): void => {
    const g = game();
    g.phase = "play";
    g.tilted = false;
    g.tiltHeat = 0;
    g.tiltAt = 0;
    g.saverWait = cfg.saverTicks > 0;
    host.state.balls.saver.until = 0;
    host.reset(true);
    host.feed();
  };

  const startGame = (): void => {
    const g = game();
    g.credits -= cfg.startCost;
    g.shootAgain = 0;
    g.extraBalls = 0;
    g.bought = false;
    g.replayDone = false;
    host.reset(false);
    host.state.player.score = 0;
    host.state.player.ballNo = 1;
    credits();
    serve();
  };

  /** Puts `score` on a board, highest first; returns its rank from 1, or 0 when it does not make it. */
  const place = (board: number[], score: number): number => {
    const size = cfg.boardSize ?? DEFAULT_BOARD;
    if (score <= 0) return 0;
    let i = 0;
    while (i < board.length && board[i]! >= score) i++;
    if (i >= size) return 0;
    board.splice(i, 0, score);
    if (board.length > size) board.length = size;
    return i + 1;
  };

  const credit = (n: number): void => {
    game().credits += n;
    credits();
  };

  const gameOver = (): void => {
    const g = game();
    const score = host.state.player.score;
    g.phase = "over";
    host.reset(true); // the game is done: no mode, timer or lamp of the last ball goes on into attract
    // bought-in balls continue the game: their score goes to the bought board, the main board is not touched twice.
    // A bought ball earns no board credit; the replay credit, once a game, can still be reached on them.
    const board = g.bought ? "bought" : "main";
    const rank = place(g.board[board], score);
    if (rank > 0) host.emit({ c: "hiscore", board, score, rank });
    if (rank > 0 && board === "main" && cfg.highScoreCredit) credit(1);
    host.emit({ c: "gameOver", score, bought: g.bought });
    if (cfg.buyIn && !g.bought && g.credits >= cfg.buyIn.cost) {
      g.phase = "buyin";
      host.setTimer(BUYIN, cfg.buyIn.windowTicks);
    } else {
      host.setTimer(OVER, cfg.overTicks);
    }
  };

  /** The player spends credits on more balls: the game goes on with the same score. */
  const buyIn = (): void => {
    const g = game();
    const offer = cfg.buyIn!;
    host.clearTimer(BUYIN);
    g.credits -= offer.cost;
    g.bought = true;
    g.shootAgain = offer.balls - 1; // the first bought ball is served now
    credits();
    serve();
  };

  /** The last ball is gone: saved, or the bonus is paid and shown. */
  const endBall = (): void => {
    const g = game();
    const b = host.state.balls;
    if (!g.tilted && b.saver.until > host.now()) { // a tilted ball is not served again
      b.saver.until = 0;
      host.emit({ c: "dmd", show: { id: "shootAgain" } });
      host.feed(); // the same ball again, nothing on the table touched
      return;
    }
    host.stopPlay();
    g.phase = "bonus";
    host.setTimer(BONUS, cfg.bonusTicks); // first: a bonus function that throws must not leave the game without its way on
    if (!g.tilted) host.awardBonus();
    scored();
  };

  /** The replay score pays one credit, once a game; the score only changes in play and while the bonus is added. */
  const scored = (): void => {
    const g = game();
    if (!cfg.replayScore || g.replayDone) return;
    if (host.state.player.score < cfg.replayScore) return;
    g.replayDone = true;
    host.emit({ c: "dmd", show: { id: "replay" } });
    credit(1);
  };

  /** The bonus is shown: an extra ball, the next ball, or the end. */
  const afterBonus = (): void => {
    const g = game();
    const p = host.state.player;
    if (g.shootAgain > 0) {
      g.shootAgain -= 1;
      serve(); // same ball number
    } else if (p.ballNo < cfg.ballsPerGame) {
      p.ballNo += 1;
      serve();
    } else {
      gameOver();
    }
  };

  return {
    consumes: (e) => e.t === "button" && (e.button === "coin" || e.button === "start" || e.button === "buyin"),
    press(e) {
      if (e.t !== "button" || !e.down) return;
      const g = game();
      if (e.button === "coin") {
        g.credits += 1;
        credits();
      } else if (e.button === "start" && (g.phase === "attract" || g.phase === "buyin")) {
        if (g.phase === "buyin") {
          // declining the offer: the window closes and the start goes ahead (or asks for a credit)
          host.clearTimer(BUYIN);
          g.phase = "attract";
        }
        if (g.credits >= cfg.startCost) startGame();
        else host.emit({ c: "dmd", show: { id: "insertCoin" } });
      } else if (e.button === "buyin" && g.phase === "buyin" && cfg.buyIn && g.credits >= cfg.buyIn.cost) {
        buyIn();
      }
    },
    admits: () => game().phase === "play",
    afterDrain() {
      const b = host.state.balls;
      if (game().phase !== "play" || b.inPlay > 0 || b.toFeed > 0) return;
      for (const n of Object.values(b.locked)) if (n > 0) return;
      endBall();
    },
    timer(id) {
      const phase = game().phase;
      if ((id === OVER && phase === "over") || (id === BUYIN && phase === "buyin")) game().phase = "attract";
      else if (id === BONUS && phase === "bonus") afterBonus();
    },
    switchSeen(tick) {
      const g = game();
      if (g.saverWait) { // only called for events the table sees, so a ball is in play
        g.saverWait = false;
        host.state.balls.saver.until = tick + cfg.saverTicks;
      }
    },
    extraBall() {
      const g = game();
      if (g.phase !== "play" || g.extraBalls >= cfg.extraBallMax) return false;
      g.extraBalls += 1;
      g.shootAgain += 1;
      host.emit({ c: "dmd", show: { id: "extraBall" } });
      return true;
    },
    saver(ticks) {
      game().saverWait = false; // started by hand: the ball's first switch does not start it again
      host.state.balls.saver.until = host.now() + ticks;
    },
    awardCredit(n) {
      credit(n);
    },
    nudged(e) {
      const g = game();
      const tilt = cfg.tilt;
      if (!tilt || g.phase !== "play" || g.tilted || e.t !== "nudge") return;
      const now = e.tick;
      // cool: one unit per decayTicks since the clock was last set; keep the remainder
      const k = Math.floor((now - g.tiltAt) / tilt.decayTicks);
      if (k > 0 && g.tiltHeat > 0) {
        g.tiltHeat = Math.max(0, g.tiltHeat - k);
        if (g.tiltHeat > 0) g.tiltAt += k * tilt.decayTicks;
      }
      if (g.tiltHeat === 0) g.tiltAt = now; // the clock starts when the table heats up
      g.tiltHeat += 1;
      if (g.tiltHeat <= tilt.free) return;
      if (g.tiltHeat <= tilt.free + tilt.warnings) {
        host.emit({ c: "dmd", show: { id: "tiltWarning", args: { n: g.tiltHeat - tilt.free } } });
        host.emit({ c: "sound", play: "warn" });
        return;
      }
      g.tilted = true; // the ball is dead: the sim switches the flippers off, endBall skips the saver and the bonus
      host.emit({ c: "dmd", show: { id: "tilt" } });
      host.emit({ c: "sound", play: "tilt" });
      host.releaseLocks();
    },
    scored,
    phase: () => game().phase,
  };
}
