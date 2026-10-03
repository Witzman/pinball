import type { Ball } from "../core/types";
import { CONTACT_CAPTURE, CONTACT_GATE_AB, CONTACT_GATE_BA, CONTACT_HIT, CONTACT_TRIGGER } from "../core/types";
import { kickHeld, nudge as shove, step } from "../core/step";
import { createRules, freePlay } from "../rules";
import type { Command, Machine, Rules, RulesEvent, TableSetup } from "../rules";

export type { TableSetup } from "../rules";
import { loadTable, makeBall } from "../table/load";
import type { LoadedTable } from "../table/load";
import type { TableDef } from "../table/schema";

/** Buttons held right now; set by the input layer. */
export interface GameInput {
  left: boolean;
  right: boolean;
  plunge: boolean;
  /** Machine buttons: insert a credit, start a game, buy extra balls. */
  coin: boolean;
  start: boolean;
  buyin: boolean;
}

export interface Game {
  table: LoadedTable;
  input: GameInput;
  paused: boolean;
  /** Milliseconds not yet turned into physics ticks. */
  accMs: number;
  /** Balls lost down the drain (placeholder until ball flow, #11). */
  drains: number;
  rules: Rules;
  /** What `recover` needs to start the rules over. */
  setup: { def: TableDef; options: GameOptions };
  /** Messages of the last few errors the loop recovered from, oldest first. */
  errors: string[];
  /** How many errors the loop has recovered from in all. */
  errorCount: number;
  /** Errors in a row without a calm stretch between; too many and the game gives up (`broken`). */
  errorStreak: number;
  /** Ticks since the last error. */
  calmTicks: number;
  /** Set when the game could not be kept going: the loop stops and the leaves say so. */
  broken: string | null;
  /** How many of this tick's commands have been applied and queued. */
  applied: number;
  /** Commands the rules gave since the leaves last took them (`takeCommands`). */
  outbox: Command[];
  /** Buttons as the rules last heard of them, to find the edges. */
  pressed: GameInput;
  /** Balls put on the plunger whose arrival the rules have not heard of yet. */
  arrivals: number;
  /** A nudge waiting for the next tick, and the tick the last one was applied (-cooldown: none yet). */
  pendingNudge: NudgeDir | null;
  lastNudge: number;
  /** Scratch lists reused every tick. */
  events: RulesEvent[];
  cmds: Command[];
  drained: number[];
}

export interface GameOptions extends TableSetup {
  /** Seed of the rules' random numbers; the replay header's seed. */
  seed?: number;
  /** What the machine remembers (credits, scores); only with a flow. */
  machine?: Machine;
}

/** Which way a nudge shoves: the way the balls move (the table is shoved the other way). */
export type NudgeDir = "left" | "right" | "up";
/** Velocity change of a nudge, m/s. Guesses: gravity on the demo table is about 1.1 m/s^2; there is no QA to tune them. */
const NUDGE_SIDE = 0.25;
const NUDGE_UP = 0.15;
/** Ticks after a nudge in which the next one is dropped. */
const NUDGE_COOLDOWN = 250;
const NUDGES: Record<NudgeDir, readonly [number, number]> = { left: [NUDGE_SIDE, 0], right: [-NUDGE_SIDE, 0], up: [0, NUDGE_UP] };

/** One physics tick in milliseconds; a longer frame is cut to MAX_FRAME_MS. */
const TICK_MS = 1;
const MAX_FRAME_MS = 50;
/** A ball this far below the playfield (m) has drained. */
const DRAIN_MARGIN = 0.03;

export function createGame(def: TableDef, opts: GameOptions = {}): Game {
  const table = loadTable(def);
  // free play feeds a ball on every drain, which would stop any game from ending: a flow gets plain rules
  const rules = createRules(opts.rules ?? (opts.flow ? { modes: {} } : freePlay), {
    seed: opts.seed ?? 1,
    shots: def.shots,
    ...(opts.flow ? { flow: opts.flow } : {}),
    ...(opts.machine ? { machine: opts.machine } : {}),
  });
  const idle = (): GameInput => ({ left: false, right: false, plunge: false, coin: false, start: false, buyin: false });
  const g: Game = {
    table, input: idle(), paused: false, accMs: 0, drains: 0,
    rules, setup: { def, options: opts }, errors: [], errorCount: 0, errorStreak: 0, calmTicks: 0, broken: null, applied: 0, outbox: [], pressed: idle(), arrivals: 0, pendingNudge: null, lastNudge: -NUDGE_COOLDOWN, events: [], cmds: [], drained: [],
  };
  if (!opts.flow) {
    // free play: a ball waits on the plunger. With a flow the first ball comes when a game starts.
    table.world.balls.push(newBall(g));
    g.arrivals = 1;
  }
  return g;
}

/** A ball resting on the plunger face, or mid-table if the table has no plunger. */
function newBall(g: Game): Ball {
  const p = g.table.world.plunger;
  if (!p) return makeBall(g.table, (g.table.playfieldWidth * 1000) / 2, 100);
  const cx = p.x - p.dirx * p.pos;
  const cy = p.y - p.diry * p.pos;
  const gap = g.table.ballRadius + 1e-4;
  return { ...makeBall(g.table, 0, 0), x: cx + p.dirx * gap, y: cy + p.diry * gap };
}

/** Sends the ball held in the sinkhole `id` out. Returns whether a ball was held. */
export function kickTrigger(g: Game, id: string): boolean {
  const ti = g.table.triggerIds.indexOf(id);
  if (ti < 0) throw new Error(`unknown trigger "${id}"`);
  return kickHeld(g.table.world, ti) >= 0;
}

/** Switches the magnet `id` on or off. */
export function setMagnet(g: Game, id: string, on: boolean): void {
  const mi = g.table.magnetIds.indexOf(id);
  if (mi < 0) throw new Error(`unknown magnet "${id}"`);
  g.table.world.magnets[mi]!.on = on;
}

/**
 * Asks for a nudge: it is applied at the start of the next tick, to every free ball.
 * Dropped (false) while another is waiting or the last one was less than the cooldown ago.
 */
export function nudge(g: Game, dir: NudgeDir): boolean {
  if (g.pendingNudge !== null || g.table.world.tick - g.lastNudge < NUDGE_COOLDOWN) return false;
  g.pendingNudge = dir;
  return true;
}

export function setPaused(g: Game, paused: boolean): void {
  g.paused = paused;
}

function applyInput(g: Game): void {
  const w = g.table.world;
  const l = g.table.flipperIds.indexOf("left");
  const r = g.table.flipperIds.indexOf("right");
  if (l >= 0) w.flippers[l]!.on = g.input.left;
  if (r >= 0) w.flippers[r]!.on = g.input.right;
  if (w.plunger) w.plunger.pull = g.input.plunge ? 1 : 0;
}

const KINDS = {
  [CONTACT_HIT]: "hit",
  [CONTACT_GATE_AB]: "gateAB",
  [CONTACT_GATE_BA]: "gateBA",
  [CONTACT_TRIGGER]: "trigger",
  [CONTACT_CAPTURE]: "capture",
} as const;

const BUTTONS = ["left", "right", "plunge", "coin", "start", "buyin"] as const;

/** Edges of the three buttons since the rules last heard. */
function buttonEvents(g: Game, tick: number, out: RulesEvent[]): void {
  for (const b of BUTTONS) {
    if (g.input[b] !== g.pressed[b]) {
      g.pressed[b] = g.input[b];
      out.push({ t: "button", tick, button: b, down: g.input[b] });
    }
  }
}

/** Does what the rules asked of the physical world. Everything also goes to the outbox for the leaves. */
function applyCommands(g: Game, cmds: readonly Command[]): void {
  for (const cmd of cmds) {
    if (cmd.c === "magnet") setMagnet(g, cmd.id, cmd.on);
    else if (cmd.c === "fireSolenoid") kickTrigger(g, cmd.id);
    else if (cmd.c === "feedBall") {
      g.table.world.balls.push(newBall(g));
      g.arrivals += 1;
    } else if (cmd.c === "lockBall") {
      // the lock id is the sinkhole's trigger id; the ball must be the one it holds
      const ti = g.table.triggerIds.indexOf(cmd.lock);
      if (ti < 0) throw new Error(`lockBall: "${cmd.lock}" is not a sinkhole of this table`);
      const b = g.table.world.balls[cmd.ball];
      if (!b || b.hold !== ti + 1) throw new Error(`lockBall "${cmd.lock}": ball ${cmd.ball} is not the ball held in that sinkhole`);
    } else if (cmd.c === "releaseBall") {
      if (!kickTrigger(g, cmd.lock)) throw new Error(`releaseBall "${cmd.lock}": no ball is held in that sinkhole`);
    }
    g.outbox.push(cmd);
    g.applied += 1;
  }
}

/**
 * One tick: input applied, world stepped, then the rules hear what happened (the
 * ball that arrived, buttons, switches in the order they were hit, drains) and
 * their commands are carried out before the next step.
 */
export function tick(g: Game): void {
  const w = g.table.world;
  applyInput(g);
  let nudged: NudgeDir | null = null;
  if (g.pendingNudge !== null) {
    const [dvx, dvy] = NUDGES[g.pendingNudge];
    if (shove(w, dvx, dvy) > 0) {
      nudged = g.pendingNudge;
      g.lastNudge = w.tick; // a shove nobody felt does not start the cooldown
    }
    g.pendingNudge = null;
  }
  step(w);
  const t = w.tick;
  const events = g.events;
  events.length = 0;
  for (; g.arrivals > 0; g.arrivals--) events.push({ t: "ballAtPlunger", tick: t });
  buttonEvents(g, t, events);
  if (nudged !== null) events.push({ t: "nudge", tick: t, dir: nudged });
  const c = w.contacts;
  for (let i = 0; i < c.n; i++) {
    events.push({ t: "switch", tick: t, ball: c.ball[i]!, sw: g.table.switchNames[c.sw[i]! - 1]!, kind: KINDS[c.kind[i]! as keyof typeof KINDS], impulse: c.impulse[i]! });
  }
  const drained = g.drained;
  drained.length = 0;
  for (let i = 0; i < w.balls.length; i++) {
    if (w.balls[i]!.y > g.table.playfieldLength + DRAIN_MARGIN) {
      drained.push(i);
      events.push({ t: "drain", tick: t, ball: i });
      g.drains += 1;
    }
  }
  // The drained balls stay in the array while the rules run, so the ball indices in the
  // events and in the commands (lockBall) mean what they meant when the events were made.
  g.cmds.length = 0;
  g.applied = 0;
  g.rules.step(t, events, g.cmds);
  applyCommands(g, g.cmds);
  for (let k = drained.length - 1; k >= 0; k--) w.balls.splice(drained[k]!, 1);
}

/** Takes the commands the rules gave since the last call (lamps, display, sound for the leaves). */
export function takeCommands(g: Game): Command[] {
  const taken = g.outbox;
  g.outbox = [];
  return taken;
}

/** The most error messages a game keeps. */
const MAX_ERRORS = 10;
/** Errors in a row, with fewer than CALM_TICKS good ticks between, after which the game gives up instead of restarting forever. */
const MAX_STREAK = 5;
const CALM_TICKS = 1000;

/**
 * A tick threw, so the game is in a state nobody can reason about (a tick that stops
 * half way leaves balls and counts out of step): start the rules over, keep what the
 * machine remembers (credits, scores), take the balls off the table and tell the
 * leaves. Back in attract with a flow; a fresh ball on the plunger without one.
 */
export function recover(g: Game, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // what the failed tick had already told the machine (credits, a score board place) must reach the
  // keeper, or storage would drift from the rules' own boards, which carry over
  for (const c of g.cmds.slice(g.applied)) if (c.c === "credits" || c.c === "hiscore") g.outbox.push(c);
  g.errorCount += 1;
  g.errors.push(message);
  if (g.errors.length > MAX_ERRORS) g.errors.shift();
  const { def, options } = g.setup;
  const old = g.rules.state.game;
  const machine = old ? { credits: old.credits, boards: { main: [...old.board.main], bought: [...old.board.bought] } } : undefined;
  const w = g.table.world;
  w.balls.length = 0;
  for (const m of w.magnets) m.on = false;
  g.rules = createRules(options.rules ?? (options.flow ? { modes: {} } : freePlay), {
    seed: options.seed ?? 1,
    shots: def.shots,
    ...(options.flow ? { flow: options.flow } : {}),
    ...(machine ? { machine } : {}),
  });
  g.pressed = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };
  g.events.length = 0;
  g.cmds.length = 0;
  g.drained.length = 0;
  g.arrivals = 0;
  g.pendingNudge = null;
  g.lastNudge = -NUDGE_COOLDOWN;
  if (!options.flow) {
    w.balls.push(newBall(g));
    g.arrivals = 1;
  }
  g.outbox.push({ c: "dmd", show: { id: "error", args: { message } } });
}

/**
 * Runs the physics for `dtMs` of real time, in whole ticks; the remainder carries
 * over. A tick that throws is recovered from (see `recover`) instead of ending the loop;
 * an error that keeps coming back (or a recovery that fails) stops the game and sets `broken`.
 */
export function advance(g: Game, dtMs: number): void {
  if (g.paused || g.broken !== null) return;
  g.accMs += Math.min(dtMs, MAX_FRAME_MS);
  while (g.accMs >= TICK_MS) {
    try {
      tick(g);
      if (++g.calmTicks >= CALM_TICKS) g.errorStreak = 0;
    } catch (e) {
      g.calmTicks = 0;
      g.errorStreak += 1;
      try {
        recover(g, e);
      } catch (again) {
        g.broken = `recovery failed: ${again instanceof Error ? again.message : String(again)}`;
      }
      if (g.broken === null && g.errorStreak >= MAX_STREAK) g.broken = `too many errors in a row, the last: ${g.errors[g.errors.length - 1] ?? "unknown"}`;
    }
    g.accMs -= TICK_MS;
    if (g.broken !== null) {
      g.accMs = 0;
      return;
    }
  }
}

export interface FlipperView {
  px: number;
  py: number;
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  k: number;
  cs: number;
  r0: number;
  r1: number;
}

/** Everything the renderer needs, as plain data. */
export interface Snapshot {
  tick: number;
  balls: { x: number; y: number; r: number }[];
  flippers: FlipperView[];
  plunger: { x: number; y: number; dirx: number; diry: number; halfWidth: number; pos: number } | null;
}

export function snapshot(g: Game): Snapshot {
  const w = g.table.world;
  const p = w.plunger;
  return {
    tick: w.tick,
    balls: w.balls.map((b) => ({ x: b.x, y: b.y, r: b.r })),
    flippers: w.flippers.map((f) => ({ px: f.px, py: f.py, tx: f.tx, ty: f.ty, dx: f.dx, dy: f.dy, k: f.k, cs: f.cs, r0: f.r0, r1: f.r1 })),
    plunger: p ? { x: p.x, y: p.y, dirx: p.dirx, diry: p.diry, halfWidth: p.halfWidth, pos: p.pos } : null,
  };
}
