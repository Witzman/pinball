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
}

/** What survives from one game to the next on a machine (kept by the leaves, see src/app). */
export interface Machine {
  credits: number;
  boards: { main: number[]; bought: number[] };
}

/** Problems with a flow config, or an empty list. */
export function validateFlow(cfg: FlowConfig): string[] {
  const errs: string[] = [];
  const nat = (name: keyof FlowConfig, min: number) => {
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
    board: machine ? { main: [...machine.boards.main], bought: [...machine.boards.bought] } : { main: [], bought: [] },
  };
}

/** What the flow needs from the engine. */
export interface FlowHost {
  state: RulesState;
  emit(cmd: Command): void;
  /** Arms a one-shot timer under a reserved `flow.` id. */
  setTimer(id: string, ticks: number): void;
  /** Stops modes, cancels table timers, forgets shots, clears lamps and counters (all but the table's `persist` ones when `keepPersist`). */
  reset(keepPersist: boolean): void;
  /** Stops modes, cancels table timers and forgets shots, keeping lamps and counters (the bonus reads them). */
  stopPlay(): void;
  /** Awards the table's end-of-ball bonus; returns the points. */
  awardBonus(): number;
  now(): number;
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
  phase(): GameState["phase"];
}

const OVER = "flow.over";
const BONUS = "flow.bonus";

export function createFlow(cfg: FlowConfig, host: FlowHost): Flow {
  const game = (): GameState => host.state.game!;
  const credits = (): void => host.emit({ c: "credits", n: game().credits });

  /** A ball is about to be served: its own saver, a clean table, a new ball on the plunger. */
  const serve = (): void => {
    const g = game();
    g.phase = "play";
    g.tilted = false;
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

  const gameOver = (): void => {
    const g = game();
    g.phase = "over";
    host.reset(true); // the game is done: no mode, timer or lamp of the last ball goes on into attract
    host.emit({ c: "gameOver", score: host.state.player.score, bought: g.bought });
    host.setTimer(OVER, cfg.overTicks);
  };

  /** The last ball is gone: saved, or the bonus is paid and shown. */
  const endBall = (): void => {
    const g = game();
    const b = host.state.balls;
    if (b.saver.until > host.now()) {
      b.saver.until = 0;
      host.emit({ c: "dmd", show: { id: "shootAgain" } });
      host.feed(); // the same ball again, nothing on the table touched
      return;
    }
    host.stopPlay();
    g.phase = "bonus";
    if (!g.tilted) host.awardBonus();
    host.setTimer(BONUS, cfg.bonusTicks);
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
      } else if (e.button === "start" && g.phase === "attract") {
        if (g.credits >= cfg.startCost) startGame();
        else host.emit({ c: "dmd", show: { id: "insertCoin" } });
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
      if (id === OVER && phase === "over") game().phase = "attract";
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
      host.state.balls.saver.until = host.now() + ticks;
    },
    phase: () => game().phase,
  };
}
