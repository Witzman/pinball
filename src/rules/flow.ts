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
}

const OVER = "flow.over";

export function createFlow(cfg: FlowConfig, host: FlowHost): Flow {
  const game = (): GameState => host.state.game!;
  const credits = (): void => host.emit({ c: "credits", n: game().credits });

  const startGame = (): void => {
    const g = game();
    g.credits -= cfg.startCost;
    g.phase = "play";
    g.shootAgain = 0;
    g.bought = false;
    g.tilted = false;
    g.replayDone = false;
    host.reset(false);
    host.state.player.score = 0;
    host.state.player.ballNo = 1;
    credits();
    host.feed();
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
      const g = game();
      const b = host.state.balls;
      if (g.phase !== "play" || b.inPlay > 0 || b.toFeed > 0) return;
      for (const n of Object.values(b.locked)) if (n > 0) return;
      const p = host.state.player;
      if (p.ballNo < cfg.ballsPerGame) {
        p.ballNo += 1;
        host.reset(true);
        host.feed();
      } else {
        g.phase = "over";
        host.reset(true); // the game is done: no mode, timer or lamp of the last ball goes on into attract
        host.emit({ c: "gameOver", score: p.score, bought: g.bought });
        host.setTimer(OVER, cfg.overTicks);
      }
    },
    timer(id) {
      if (id === OVER && game().phase === "over") game().phase = "attract";
    },
  };
}
