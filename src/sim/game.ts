import { FULL_STRENGTH_SPEED } from "./audio-events";
import type { AudioBatch, AudioEvent } from "./audio-events";
import type { Ball } from "../core/types";
import { CONTACT_CAPTURE, CONTACT_GATE_AB, CONTACT_GATE_BA, CONTACT_HIT, CONTACT_KICK, CONTACT_TRIGGER } from "../core/types";
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
  /** The way the last felt nudge went, for the view. */
  lastNudgeDir: NudgeDir;
  /** What the sound layer should hear, since it last took it (`takeAudio`); capped so nobody listening costs nothing. */
  audioOut: AudioEvent[];
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
    rules, setup: { def, options: opts }, errors: [], errorCount: 0, errorStreak: 0, calmTicks: 0, broken: null, applied: 0, outbox: [], audioOut: [], pressed: idle(), arrivals: 0, pendingNudge: null, lastNudge: -NUDGE_COOLDOWN, lastNudgeDir: "up", events: [], cmds: [], drained: [],
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

/** Sends the ball held in the sinkhole `id` out, at its kick speed or at `speed`. Returns whether a ball was held. */
export function kickTrigger(g: Game, id: string, speed?: number): boolean {
  const ti = g.table.triggerIds.indexOf(id);
  if (ti < 0) throw new Error(`unknown trigger "${id}"`);
  return kickHeld(g.table.world, ti, speed) >= 0;
}

/** Switches the magnet `id` on or off. */
export function setMagnet(g: Game, id: string, on: boolean): void {
  const mi = g.table.magnetIds.indexOf(id);
  if (mi < 0) throw new Error(`unknown magnet "${id}"`);
  g.table.world.magnets[mi]!.on = on;
}

/** Puts the drop target `id` down or up (#50). A target brought up under a ball leaves the ball overlapping it: the rules should not raise one while a ball is on it. */
export function setDropTarget(g: Game, id: string, state: "up" | "down"): void {
  const i = g.table.dropIds.indexOf(id);
  if (i < 0) throw new Error(`unknown drop target "${id}"`);
  g.table.world.down[i] = state === "down" ? 1 : 0;
}

/** Brings every drop target of the bank up (the reset of a bank). */
export function resetDropBank(g: Game, bank: string): void {
  const list = g.table.dropBanks[bank];
  if (!list) throw new Error(`unknown drop bank "${bank}"`);
  for (const i of list) g.table.world.down[i] = 0;
}

/**
 * Asks for a nudge: it is applied at the start of the next tick, to every free ball.
 * Dropped (false) while another is waiting, the last one was less than the cooldown ago,
 * or the game is paused or broken (a nudge made then would fire on the first tick after).
 */
export function nudge(g: Game, dir: NudgeDir): boolean {
  if (g.paused || g.broken !== null || g.pendingNudge !== null || g.table.world.tick - g.lastNudge < NUDGE_COOLDOWN) return false;
  g.pendingNudge = dir;
  return true;
}

export function setPaused(g: Game, paused: boolean): void {
  g.paused = paused;
}

const AUDIO_CAP = 512;
function audio(g: Game, e: AudioEvent): void {
  if (g.audioOut.length >= AUDIO_CAP) g.audioOut.shift(); // in a storm the newest matter: the drain comes last
  g.audioOut.push(e);
}

function applyInput(g: Game): void {
  const w = g.table.world;
  // a tilted ball is dead: the flippers do not answer (derived from the rules' state, so it survives a recovery);
  // `tilted` stays set until the next serve, so only the play phase is dead, not the attract screen after it
  const game = g.rules.state.game;
  const dead = game?.tilted === true && game.phase === "play";
  for (let i = 0; i < w.flippers.length; i++) {
    const button = g.table.flipperInputs[i];
    if (button === null || button === undefined) continue; // a flipper that follows no button
    const f = w.flippers[i]!;
    const want = !dead && g.input[button];
    if (want !== f.on && !dead) audio(g, { a: "flip", side: button === "left" ? "L" : "R", up: want }); // the tilt dropping a flipper is not a click
    f.on = want;
  }
  if (w.plunger) {
    const p = w.plunger;
    if (p.pull === 1 && !g.input.plunge) audio(g, { a: "plunge", s: Math.min(1, p.pos / p.stroke) });
    p.pull = g.input.plunge ? 1 : 0;
  }
}

const KINDS = {
  [CONTACT_HIT]: "hit",
  [CONTACT_GATE_AB]: "gateAB",
  [CONTACT_GATE_BA]: "gateBA",
  [CONTACT_TRIGGER]: "trigger",
  [CONTACT_CAPTURE]: "capture",
  [CONTACT_KICK]: "kick",
} as const;

const BUTTONS = ["left", "right", "plunge", "coin", "start", "buyin"] as const;

/** Edges of the three buttons since the rules last heard. */
function buttonEvents(g: Game, tick: number, out: RulesEvent[]): void {
  for (const b of BUTTONS) {
    if (g.input[b] !== g.pressed[b]) {
      g.pressed[b] = g.input[b];
      out.push({ t: "button", tick, button: b, down: g.input[b] });
      if (g.input[b] && (b === "coin" || b === "start" || b === "buyin")) audio(g, { a: "btn", button: b });
    }
  }
}

/** Does what the rules asked of the physical world. Everything also goes to the outbox for the leaves. */
function applyCommands(g: Game, cmds: readonly Command[]): void {
  for (const cmd of cmds) {
    if (cmd.c === "magnet") setMagnet(g, cmd.id, cmd.on);
    else if (cmd.c === "dropTarget") setDropTarget(g, cmd.id, cmd.state);
    else if (cmd.c === "dropBank") resetDropBank(g, cmd.bank);
    else if (cmd.c === "fireSolenoid") kickTrigger(g, cmd.id, cmd.speed);
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
      if (!kickTrigger(g, cmd.lock, cmd.speed)) throw new Error(`releaseBall "${cmd.lock}": no ball is held in that sinkhole`);
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
      g.lastNudgeDir = g.pendingNudge;
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
    const sw = g.table.switchNames[c.sw[i]! - 1]!;
    const kind = KINDS[c.kind[i]! as keyof typeof KINDS];
    events.push({ t: "switch", tick: t, ball: c.ball[i]!, sw, kind, impulse: c.impulse[i]! });
    const cls = Object.hasOwn(g.table.sounds, sw) ? g.table.sounds[sw] : undefined;
    const s = Math.min(1, c.impulse[i]! / (g.table.ballMass * FULL_STRENGTH_SPEED));
    audio(g, { a: "switch", sw, kind: kind === "gateAB" || kind === "gateBA" ? "gate" : kind, s, ...(cls !== undefined ? { cls } : {}) });
  }
  const drained = g.drained;
  drained.length = 0;
  for (let i = 0; i < w.balls.length; i++) {
    if (w.balls[i]!.y > g.table.playfieldLength + DRAIN_MARGIN) {
      drained.push(i);
      events.push({ t: "drain", tick: t, ball: i });
      audio(g, { a: "drain" });
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

/** Takes what the sound layer should hear since the last call, and how fast the fastest ball rolls (0..1; 5 m/s is full). */
export function takeAudio(g: Game): AudioBatch {
  const events = g.audioOut;
  g.audioOut = [];
  let fastest = 0;
  for (const b of g.table.world.balls) if (b.hold === 0) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
  return { events, roll: Math.min(1, fastest / 5) };
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
  w.kickWait.fill(0); // a recovered world hashes like a fresh one
  w.down.fill(0);
  g.rules = createRules(options.rules ?? (options.flow ? { modes: {} } : freePlay), {
    seed: options.seed ?? 1,
    shots: def.shots,
    ...(options.flow ? { flow: options.flow } : {}),
    ...(machine ? { machine } : {}),
  });
  g.pressed = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };
  g.events.length = 0;
  g.audioOut.length = 0;
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

export { snapshot } from "./snapshot";
export type { AudioBatch, AudioEvent, SoundClass } from "./audio-events";
export type { Camera, FlipperView, Snapshot, StaticScene } from "./snapshot";
