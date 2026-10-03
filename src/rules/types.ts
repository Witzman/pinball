// The rules framework: tables declare modes and handlers, the engine runs them.
// Rules are a pure function of (state, events, tick): the same events at the same
// ticks always give the same state and commands, so a replay reproduces them. The
// state is plain JSON data; handlers are code that is looked up by id.

import type { TableDef } from "../table/schema";

/** What the physics and the input layer tell the rules. Names, never numeric ids. */
export type RulesEvent =
  | { t: "switch"; tick: number; ball: number; sw: string; kind: "hit" | "gateAB" | "gateBA" | "trigger" | "capture"; impulse: number }
  | { t: "button"; tick: number; button: "left" | "right" | "plunge" | "coin" | "start" | "buyin"; down: boolean }
  | { t: "drain"; tick: number; ball: number }
  | { t: "ballAtPlunger"; tick: number }
  /** The player shoved the table and at least one ball felt it. */
  | { t: "nudge"; tick: number; dir: "left" | "right" | "up" }
  // made by the engine itself:
  | { t: "timer"; tick: number; id: string; tag?: string }
  | { t: "shot"; tick: number; shot: string };

export type SwitchEvent = Extract<RulesEvent, { t: "switch" }>;

/** An opaque cue for the display and the audio; their layers interpret it (#14, #15). */
export interface Cue {
  id: string;
  args?: Record<string, number | string>;
}

/** What the rules ask for. Plain data; sim applies the physical ones, leaves consume the rest. */
export type Command =
  | { c: "setLamp"; lamp: string; state: "off" | "lit" | "flash" }
  | { c: "fireSolenoid"; id: string }
  /** Kicks out the ball locked in the sinkhole `lock`; an error if none is held there. */
  | { c: "releaseBall"; lock: string }
  | { c: "magnet"; id: string; on: boolean }
  | { c: "lockBall"; ball: number; lock: string }
  | { c: "feedBall"; feed: string }
  | { c: "dmd"; show: Cue }
  /** The credit count changed; `n` is the new total. */
  | { c: "credits"; n: number }
  /** A game ended with this score (`bought`: it ended with bought-in balls). */
  | { c: "gameOver"; score: number; bought: boolean }
  /** A score made a board; `rank` counts from 1. The leaf stores it (see src/app). */
  | { c: "hiscore"; board: "main" | "bought"; score: number; rank: number }
  | { c: "sound"; play: string; vol?: number };

/** A shot is off, lit, or collected: almost every reward is "light, then collect". */
export type LitState = "off" | "lit" | "collected";

export interface TimerState {
  /** Absolute tick the timer fires at. */
  due: number;
  /** Repeat interval in ticks; absent for a one-shot. */
  every?: number;
  tag?: string;
}

export interface ModeState {
  phase: string;
  /** Tick the current phase began. */
  since: number;
  data: Record<string, number>;
}

/** Ball count, locks and feeding. #10 uses inPlay <= 1; multiball (#12) fills in the rest. */
export interface BallMgr {
  inPlay: number;
  /** Balls held per lock id. */
  locked: Record<string, number>;
  /** Balls still to be fed to the plunger. */
  toFeed: number;
  /** The ball saver is active until this tick; 0 = off. */
  saver: { until: number };
  /** Most balls that may be in play at once. */
  capacity: number;
}

/** The game around the balls; present only when the table runs with a flow (see flow.ts). */
export interface GameState {
  phase: "attract" | "play" | "bonus" | "over" | "buyin";
  credits: number;
  /** Balls still to be served again without losing a ball number (saver, extra balls). */
  shootAgain: number;
  bought: boolean;
  tilted: boolean;
  replayDone: boolean;
  /** Extra balls awarded in this game, against the config's limit. */
  extraBalls: number;
  /** The ball saver is set to start at the ball's first switch: true until that switch. */
  saverWait: boolean;
  /** Tilt: nudges that have not cooled yet, and the tick that heat last cooled to. Both 0 and not saved when quiet. */
  tiltHeat: number;
  tiltAt: number;
  /** Scores of the machine, highest first. */
  board: { main: number[]; bought: number[] };
}

/** A shot partway through its switch sequence: `i` switches seen, the first at tick `at`. */
export interface ShotProgress {
  i: number;
  at: number;
}

/** All mutable rules state. JSON-safe on purpose: no Map, Set, function or class instance. */
export interface RulesState {
  /** Shape version; bump when the shape changes. */
  v: 1;
  tick: number;
  /** Word of the seeded random generator. */
  rng: number;
  lamps: Record<string, LitState>;
  counters: Record<string, number>;
  timers: Record<string, TimerState>;
  shots: Record<string, ShotProgress>;
  modes: Record<string, ModeState>;
  balls: BallMgr;
  /** Null when the table has no flow (free play). */
  game: GameState | null;
  /** `persist` is reserved for per-player values (#11 later); nothing writes it yet. */
  player: { score: number; ballNo: number; persist: Record<string, number> };
}

/** What a table script may touch. Ticks, not milliseconds: 1 tick = 1 ms at the 1 kHz step. */
export interface Ctx {
  now: number;
  /** The only source of randomness: seeded, part of the state. */
  rnd(): number;
  lamp(id: string): LitState;
  setLamp(id: string, s: LitState): void;
  count(id: string): number;
  add(id: string, n?: number): number;
  reset(id: string): void;
  after(id: string, ticks: number, tag?: string): void;
  every(id: string, ticks: number, tag?: string): void;
  cancel(id: string): void;
  /** The running mode's state (live: `data` may be written), or null. */
  mode(id: string): ModeState | null;
  start(id: string): void;
  stop(id: string): void;
  goto(id: string, phase: string): void;
  ball: { lock(lockId: string): void; release(lockId: string): void; feed(): void; inPlay(): number };
  game: {
    /** Where the game is; `play` for a table without a flow. */
    phase(): GameState["phase"];
    /** Awards an extra ball, served after this ball's bonus. False when none is left or no ball is being played. */
    extraBall(): boolean;
    /** The ball saver runs for `ticks` from now: a drain of the last ball in that time serves it again (with a flow only). */
    saver(ticks: number): void;
    /** Adds `n` credits to the machine (a special, a replay): the credit count is told to the leaves. Nothing without a flow. */
    awardCredit(n: number): void;
  };
  emit(cmd: Command): void;
  addScore(n: number): void;
}

export interface PhaseDef {
  enter?(c: Ctx): void;
  exit?(c: Ctx): void;
  /** Handlers by event type: `switch`, `shot`, `timer`, `button`, `drain`, `ballAtPlunger`. */
  on?: Record<string, (c: Ctx, e: RulesEvent) => void>;
}

export interface ModeDef {
  /** Phase entered on start. */
  start: string;
  phases: Record<string, PhaseDef>;
}

/** What `src/tables/<id>/rules.ts` returns. */
export interface TableRules {
  modes: Record<string, ModeDef>;
  /** End-of-ball bonus in points, read when a ball ends (counters, multiplier and all). */
  bonus?(c: Ctx): number;
  /** The parts of that bonus for the display, as [label, points]. */
  bonusParts?(c: Ctx): [string, number][];
  /** Names of lamps and counters that survive from one ball to the next (a new game clears them too). */
  persist?: string[];
  onSwitch?(c: Ctx, e: SwitchEvent): void;
  onShot?(c: Ctx, shot: string, e: SwitchEvent): void;
  onTimer?(c: Ctx, id: string, tag?: string): void;
  onBallStart?(c: Ctx): void;
  onDrain?(c: Ctx): void;
}

/** The table data the engine needs to know the shots. */
export type Shots = TableDef["shots"];
