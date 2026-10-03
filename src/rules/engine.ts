import { nextRandom } from "./rng";
import { createState } from "./state";
import { validateState } from "./serialize";
import type { Command, Ctx, LitState, ModeDef, RulesEvent, RulesState, Shots, SwitchEvent, TableRules } from "./types";

export interface RulesOptions {
  seed: number;
  /** `TableDef.shots`: each shot is the switches to hit in this order. */
  shots?: Shots;
  /** Continue from a saved state instead of starting fresh (the seed is then ignored). */
  state?: RulesState;
  /** Ticks a shot's switch sequence may take from its first to its last switch; default 5000. */
  shotWindow?: number;
}

export interface Rules {
  state: RulesState;
  /**
   * Advances to `tick`: fires due timers, then handles `events` in order. Commands
   * are appended to `out`. Call once per tick with ticks in increasing order; a tick
   * with no events and no timer due returns at once and allocates nothing.
   */
  step(tick: number, events: readonly RulesEvent[], out: Command[]): void;
}

const DEFAULT_SHOT_WINDOW = 5000;
/** Mode enter/exit handlers may start other modes; this many levels deep is a loop in the script. */
const MAX_DEPTH = 16;

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Problems when a saved state does not fit the table's modes. */
function fitProblems(table: TableRules, s: RulesState): string[] {
  const errs: string[] = [];
  for (const [id, m] of Object.entries(s.modes)) {
    const def = table.modes[id];
    if (!def) errs.push(`saved state has mode "${id}" which the table does not define`);
    else if (!(m.phase in def.phases)) errs.push(`saved state has mode "${id}" in phase "${m.phase}" which the table does not define`);
  }
  return errs;
}

function tableProblems(table: TableRules): string[] {
  const errs: string[] = [];
  for (const [id, def] of Object.entries(table.modes)) {
    if (!(def.start in def.phases)) errs.push(`mode "${id}": start phase "${def.start}" is not one of its phases`);
  }
  return errs;
}

export function createRules(table: TableRules, opts: RulesOptions): Rules {
  const problems = tableProblems(table);
  if (opts.state) {
    problems.push(...validateState(opts.state), ...fitProblems(table, opts.state));
  }
  const shots = opts.shots ?? {};
  for (const [name, list] of Object.entries(shots)) if (list.length === 0) problems.push(`shot "${name}" has no switches`);
  if (problems.length > 0) throw new Error(`rules cannot start:\n${problems.join("\n")}`);

  const state = opts.state ?? createState(opts.seed);
  const shotWindow = opts.shotWindow ?? DEFAULT_SHOT_WINDOW;
  const shotNames = Object.keys(shots).sort(byId);
  let out: Command[] = [];
  let depth = 0;

  // Earliest due timer, or Infinity. Recomputed lazily so an idle tick costs one comparison.
  let minDue = Infinity;
  let dueKnown = false;
  const earliest = (): number => {
    if (!dueKnown) {
      minDue = Infinity;
      for (const id in state.timers) if (state.timers[id]!.due < minDue) minDue = state.timers[id]!.due;
      dueKnown = true;
    }
    return minDue;
  };

  const modeDef = (id: string): ModeDef => {
    const def = table.modes[id];
    if (!def) throw new Error(`unknown mode "${id}"`);
    return def;
  };

  const needTicks = (what: string, ticks: number): void => {
    if (!Number.isSafeInteger(ticks) || ticks < 1) throw new Error(`${what}: ticks must be a whole number of at least 1, got ${ticks}`);
  };

  const enter = (id: string): void => {
    if (++depth > MAX_DEPTH) throw new Error(`mode "${id}": enter/exit handlers nest more than ${MAX_DEPTH} deep`);
    try {
      modeDef(id).phases[state.modes[id]!.phase]!.enter?.(ctx);
    } finally {
      depth--;
    }
  };
  const leave = (id: string): void => {
    if (++depth > MAX_DEPTH) throw new Error(`mode "${id}": enter/exit handlers nest more than ${MAX_DEPTH} deep`);
    try {
      modeDef(id).phases[state.modes[id]!.phase]!.exit?.(ctx);
    } finally {
      depth--;
    }
  };

  const ctx: Ctx = {
    now: state.tick,
    rnd: () => nextRandom(state),
    lamp: (id) => state.lamps[id] ?? "off",
    setLamp(id, s: LitState) {
      if ((state.lamps[id] ?? "off") === s) return;
      state.lamps[id] = s;
      out.push({ c: "setLamp", lamp: id, state: s === "lit" ? "lit" : "off" });
    },
    count: (id) => state.counters[id] ?? 0,
    add(id, n = 1) {
      if (!Number.isFinite(n)) throw new Error(`add "${id}": ${n} is not a finite number`);
      return (state.counters[id] = (state.counters[id] ?? 0) + n);
    },
    reset(id) {
      delete state.counters[id];
    },
    after(id, ticks, tag) {
      needTicks(`after "${id}"`, ticks);
      state.timers[id] = tag === undefined ? { due: ctx.now + ticks } : { due: ctx.now + ticks, tag };
      dueKnown = false;
    },
    every(id, ticks, tag) {
      needTicks(`every "${id}"`, ticks);
      state.timers[id] = tag === undefined ? { due: ctx.now + ticks, every: ticks } : { due: ctx.now + ticks, every: ticks, tag };
      dueKnown = false;
    },
    cancel(id) {
      delete state.timers[id];
      dueKnown = false;
    },
    mode: (id) => state.modes[id] ?? null,
    start(id) {
      const def = modeDef(id);
      if (state.modes[id]) return; // already running
      state.modes[id] = { phase: def.start, since: ctx.now, data: {} };
      enter(id);
    },
    stop(id) {
      modeDef(id);
      if (!state.modes[id]) return;
      leave(id);
      delete state.modes[id];
    },
    goto(id, phase) {
      const def = modeDef(id);
      if (!(phase in def.phases)) throw new Error(`mode "${id}" has no phase "${phase}"`);
      if (!state.modes[id]) throw new Error(`goto: mode "${id}" is not running`);
      leave(id);
      state.modes[id] = { phase, since: ctx.now, data: state.modes[id]!.data };
      enter(id);
    },
    ball: {
      inPlay: () => state.balls.inPlay,
      lock() {
        throw new Error("ball.lock arrives with the ball manager wiring");
      },
      release() {
        throw new Error("ball.release arrives with the ball manager wiring");
      },
      feed() {
        throw new Error("ball.feed arrives with the ball manager wiring");
      },
    },
    emit: (cmd) => {
      out.push(cmd);
    },
    addScore(n) {
      if (!Number.isFinite(n)) throw new Error(`addScore: ${n} is not a finite number`);
      state.player.score += n;
    },
  };

  /** Mode handlers for an event, modes in id order; a mode stopped by an earlier handler is skipped. */
  const toModes = (e: RulesEvent): void => {
    const ids = Object.keys(state.modes);
    if (ids.length === 0) return;
    ids.sort(byId);
    for (const id of ids) {
      const m = state.modes[id];
      if (!m) continue;
      modeDef(id).phases[m.phase]!.on?.[e.t]?.(ctx, e);
    }
  };

  /** Advances the switch sequences of all shots; returns the shots this switch completed. */
  const hitShots = (e: SwitchEvent): string[] => {
    let done: string[] | null = null;
    for (const name of shotNames) {
      const list = shots[name]!;
      let cur = state.shots[name];
      if (cur && e.tick - cur.at > shotWindow) {
        delete state.shots[name];
        cur = undefined;
      }
      let at = cur ? cur.i : 0;
      if (e.sw === list[at]) at += 1;
      else if (e.sw === list[0]) at = 1; // out of order: start over from this switch
      else continue;
      if (at === list.length) {
        delete state.shots[name];
        (done ??= []).push(name);
      } else {
        state.shots[name] = { i: at, at: at === 1 ? e.tick : cur!.at };
      }
    }
    return done ?? [];
  };

  const handle = (e: RulesEvent): void => {
    toModes(e);
    if (e.t === "switch") {
      table.onSwitch?.(ctx, e);
      for (const shot of hitShots(e)) {
        const se: RulesEvent = { t: "shot", tick: e.tick, shot };
        toModes(se);
        table.onShot?.(ctx, shot, e);
      }
    } else if (e.t === "drain") {
      table.onDrain?.(ctx);
    }
  };

  const fireTimers = (tick: number): void => {
    const due: string[] = [];
    for (const id in state.timers) if (state.timers[id]!.due <= tick) due.push(id);
    due.sort((a, b) => state.timers[a]!.due - state.timers[b]!.due || byId(a, b));
    for (const id of due) {
      const t = state.timers[id];
      if (!t || t.due > tick) continue; // cancelled or re-armed by an earlier handler
      if (t.every !== undefined) t.due += t.every;
      else delete state.timers[id];
      dueKnown = false;
      const e: RulesEvent = t.tag === undefined ? { t: "timer", tick, id } : { t: "timer", tick, id, tag: t.tag };
      toModes(e);
      table.onTimer?.(ctx, id, t.tag);
    }
  };

  return {
    state,
    step(tick, events, sink) {
      if (events.length === 0 && earliest() > tick) {
        state.tick = tick;
        ctx.now = tick;
        return;
      }
      out = sink;
      state.tick = tick;
      ctx.now = tick;
      if (earliest() <= tick) fireTimers(tick);
      for (let i = 0; i < events.length; i++) handle(events[i]!);
    },
  };
}
