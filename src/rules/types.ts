// The rules framework: tables declare modes and handlers, the engine runs them.
// Rules are a pure function of (state, events, tick): the same events at the same
// ticks always give the same state and commands, so a replay reproduces them. The
// state is plain JSON data; handlers are code that is looked up by id.

import type { TableDef } from "../table/schema";

/** What the physics and the input layer tell the rules. Names, never numeric ids. */
export type RulesEvent =
  | { t: "switch"; tick: number; ball: number; sw: string; kind: "hit" | "gateAB" | "gateBA" | "trigger" | "capture"; impulse: number }
  | { t: "button"; tick: number; button: "left" | "right" | "plunge"; down: boolean }
  | { t: "drain"; tick: number; ball: number }
  | { t: "ballAtPlunger"; tick: number };

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
  | { c: "magnet"; id: string; on: boolean }
  | { c: "lockBall"; ball: number; lock: string }
  | { c: "feedBall"; feed: string }
  | { c: "dmd"; show: Cue }
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
  modes: Record<string, ModeState>;
  balls: BallMgr;
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
  mode(id: string): ModeState | null;
  start(id: string): void;
  stop(id: string): void;
  goto(id: string, phase: string): void;
  ball: { lock(lockId: string): void; release(lockId: string): void; feed(): void; inPlay(): number };
  emit(cmd: Command): void;
  addScore(n: number): void;
}

export interface PhaseDef {
  enter?(c: Ctx): void;
  exit?(c: Ctx): void;
  /** Handlers by event type (`switch`, `button`, `drain`, `ballAtPlunger`) or `timer`. */
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
  /** Names of lamps, counters and player values that survive from one ball to the next. */
  persist?: string[];
  onSwitch?(c: Ctx, e: SwitchEvent): void;
  onShot?(c: Ctx, shot: string, e: SwitchEvent): void;
  onTimer?(c: Ctx, id: string, tag?: string): void;
  onBallStart?(c: Ctx): void;
  onDrain?(c: Ctx): void;
}

/** The table data the engine needs to know the shots. */
export type Shots = TableDef["shots"];
