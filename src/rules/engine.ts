import { nextRandom } from "./rng";
import { createState } from "./state";
import { validateState } from "./serialize";
import { createFlow, initialGame, validateFlow, validateMachine } from "./flow";
import type { Flow, FlowConfig, Machine } from "./flow";
import type { Command, Ctx, LitState, ModeDef, RulesEvent, RulesState, Shots, SwitchEvent, TableRules } from "./types";

export interface RulesOptions {
  seed: number;
  /** `TableDef.shots`: each shot is the switches to hit in this order. */
  shots?: Shots;
  /** Continue from a saved state instead of starting fresh (the seed is then ignored). */
  state?: RulesState;
  /** Ticks a shot's switch sequence may take from its first to its last switch; default 5000. */
  shotWindow?: number;
  /** Run the table as a game (credits, balls per game, game over). Without it the table is free play. */
  flow?: FlowConfig;
  /** What the machine remembers between games (credits, high scores); with `flow`, and not with `state`. */
  machine?: Machine;
}

export interface Rules {
  /** The live state. Read it (save, hash, assert); only the engine writes it, so its caches stay right. */
  readonly state: RulesState;
  /**
   * Advances to `tick`: fires due timers, then handles `events` in order. Commands
   * are appended to `out`. Call once per tick, ticks never going backwards (a bad
   * tick throws). A timer fires at most once per call: after a gap, an `every`
   * timer replays its missed beats one per call. A tick with no events and no
   * timer due returns at once and allocates nothing.
   */
  step(tick: number, events: readonly RulesEvent[], out: Command[]): void;
}

const DEFAULT_SHOT_WINDOW = 5000;
/** Mode enter/exit handlers may start other modes; this many levels deep is a loop in the script. */
const MAX_DEPTH = 16;

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A record's own entry; "constructor" or "toString" are not entries. */
const own = <T>(rec: Record<string, T>, id: string): T | undefined => (Object.hasOwn(rec, id) ? rec[id] : undefined);

/** Ids become keys of plain records: "__proto__" would write to the prototype instead. */
const needId = (what: string, id: string): void => {
  if (id === "" || id === "__proto__") throw new Error(`${what}: "${id}" is not a usable id`);
};

const NO_SHOTS: readonly string[] = Object.freeze([]);

/** Timer ids with this start belong to the flow. */
const FLOW_TIMER = "flow.";
const needScriptTimer = (what: string, id: string): void => {
  if (id.startsWith(FLOW_TIMER)) throw new Error(`${what}: ids starting with "${FLOW_TIMER}" belong to the game flow`);
};

/** Problems when a saved state does not fit the table's modes. */
function fitProblems(table: TableRules, s: RulesState): string[] {
  const errs: string[] = [];
  for (const [id, m] of Object.entries(s.modes)) {
    const def = own(table.modes, id);
    if (!def) errs.push(`saved state has mode "${id}" which the table does not define`);
    else if (!Object.hasOwn(def.phases, m.phase)) errs.push(`saved state has mode "${id}" in phase "${m.phase}" which the table does not define`);
  }
  return errs;
}

function shotFit(shots: Shots, s: RulesState): string[] {
  return Object.keys(s.shots)
    .filter((name) => !Object.hasOwn(shots, name))
    .map((name) => `saved state has progress on shot "${name}" which the table does not define`);
}

function tableProblems(table: TableRules): string[] {
  const errs: string[] = [];
  for (const [id, def] of Object.entries(table.modes)) {
    if (!Object.hasOwn(def.phases, def.start)) errs.push(`mode "${id}": start phase "${def.start}" is not one of its phases`);
  }
  return errs;
}

export function createRules(table: TableRules, opts: RulesOptions): Rules {
  const problems = tableProblems(table);
  if (opts.state) {
    problems.push(...validateState(opts.state), ...fitProblems(table, opts.state), ...shotFit(opts.shots ?? {}, opts.state));
  }
  const shots = opts.shots ?? {};
  for (const [name, list] of Object.entries(shots)) if (list.length === 0) problems.push(`shot "${name}" has no switches`);
  if (opts.flow) problems.push(...validateFlow(opts.flow));
  if (opts.machine) problems.push(...validateMachine(opts.machine));
  if (opts.machine && !opts.flow) problems.push("machine given without a flow");
  if (opts.machine && opts.state) problems.push("machine and state both given: a saved state already has its credits");
  if (opts.state && opts.flow && opts.state.game === null) problems.push("saved state has no game but the table runs with a flow");
  if (opts.state && !opts.flow && opts.state.game !== null) problems.push("saved state has a game but the table runs without a flow");
  if (opts.state && opts.flow && opts.state.game) {
    const g = opts.state.game;
    // phases the flow cannot leave would hold a restored game forever
    if (g.phase === "buyin" && !opts.flow.buyIn) problems.push('saved state is in phase "buyin" but the flow offers no buy-in');
    for (const [phase, timer] of [["over", "flow.over"], ["bonus", "flow.bonus"], ["buyin", "flow.buyin"]] as const) {
      if (g.phase === phase && !Object.hasOwn(opts.state.timers, timer)) problems.push(`saved state is in phase "${phase}" without its ${timer} timer`);
    }
  }
  if (problems.length > 0) throw new Error(`rules cannot start:\n${problems.join("\n")}`);

  const state = opts.state ? structuredClone(opts.state) : createState(opts.seed);
  if (opts.flow && !opts.state) state.game = initialGame(opts.flow, opts.machine);
  const shotWindow = opts.shotWindow ?? DEFAULT_SHOT_WINDOW;
  const shotNames = Object.keys(shots).sort(byId);
  let out: Command[] = [];
  let depth = 0;
  /** Ball of the switch event being handled, or -1. */
  let curBall = -1;
  /** True while the flow clears the table: scripts may not start modes or feed balls from exit handlers then. */
  let resetting = false;

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
    const def = own(table.modes, id);
    if (!def) throw new Error(`unknown mode "${id}"`);
    return def;
  };

  const needTicks = (what: string, ticks: number): void => {
    if (!Number.isSafeInteger(ticks) || ticks < 1) throw new Error(`${what}: ticks must be a whole number of at least 1, got ${ticks}`);
  };

  // Running modes in id order. A new array is made whenever the set changes, so a
  // dispatch that holds the old one sees the modes that were running when it began.
  let modeIds: string[] | null = null;
  const runningModes = (): string[] => (modeIds ??= Object.keys(state.modes).sort(byId));

  // Modes whose exit handler is running: stop of them is a no-op (start is too: they are still running), goto throws.
  const leaving = new Set<string>();

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
    leaving.add(id);
    try {
      modeDef(id).phases[state.modes[id]!.phase]!.exit?.(ctx);
    } finally {
      leaving.delete(id);
      depth--;
    }
  };

  const ctx: Ctx = {
    now: state.tick,
    rnd: () => nextRandom(state),
    lamp: (id) => own(state.lamps, id) ?? "off",
    setLamp(id, s: LitState) {
      needId("setLamp", id);
      const wasLit = own(state.lamps, id) === "lit";
      state.lamps[id] = s;
      // the leaves only know lit and off: collected shows as off
      if (wasLit !== (s === "lit")) out.push({ c: "setLamp", lamp: id, state: s === "lit" ? "lit" : "off" });
    },
    count: (id) => own(state.counters, id) ?? 0,
    add(id, n = 1) {
      needId("add", id);
      if (!Number.isFinite(n)) throw new Error(`add "${id}": ${n} is not a finite number`);
      return (state.counters[id] = (own(state.counters, id) ?? 0) + n);
    },
    reset(id) {
      delete state.counters[id];
    },
    after(id, ticks, tag) {
      needId("after", id);
      needScriptTimer("after", id);
      needTicks(`after "${id}"`, ticks);
      state.timers[id] = tag === undefined ? { due: ctx.now + ticks } : { due: ctx.now + ticks, tag };
      dueKnown = false;
    },
    every(id, ticks, tag) {
      needId("every", id);
      needScriptTimer("every", id);
      needTicks(`every "${id}"`, ticks);
      state.timers[id] = tag === undefined ? { due: ctx.now + ticks, every: ticks } : { due: ctx.now + ticks, every: ticks, tag };
      dueKnown = false;
    },
    cancel(id) {
      needScriptTimer("cancel", id);
      delete state.timers[id];
      dueKnown = false;
    },
    mode: (id) => own(state.modes, id) ?? null,
    start(id) {
      const def = modeDef(id);
      if (resetting) throw new Error(`start "${id}": a mode cannot be started while the game flow clears the table`);
      if (own(state.modes, id)) return; // already running (also while its exit handler runs)
      state.modes[id] = { phase: def.start, since: ctx.now, data: {} };
      modeIds = null;
      enter(id);
    },
    stop(id) {
      modeDef(id);
      if (!own(state.modes, id) || leaving.has(id)) return;
      try {
        leave(id);
      } finally {
        delete state.modes[id];
        modeIds = null;
      }
    },
    goto(id, phase) {
      const def = modeDef(id);
      if (!Object.hasOwn(def.phases, phase)) throw new Error(`mode "${id}" has no phase "${phase}"`);
      const m = own(state.modes, id);
      if (!m) throw new Error(`goto: mode "${id}" is not running`);
      if (leaving.has(id)) throw new Error(`goto: mode "${id}" is already leaving its phase`);
      leave(id);
      state.modes[id] = { phase, since: ctx.now, data: m.data };
      enter(id);
    },
    ball: {
      inPlay: () => state.balls.inPlay,
      lock(lockId) {
        needId("ball.lock", lockId);
        if (curBall < 0) throw new Error("ball.lock: only a switch event has a ball to lock");
        const b = state.balls;
        b.locked[lockId] = (own(b.locked, lockId) ?? 0) + 1;
        b.inPlay = Math.max(0, b.inPlay - 1);
        out.push({ c: "lockBall", ball: curBall, lock: lockId });
      },
      release(lockId) {
        const b = state.balls;
        const n = own(b.locked, lockId) ?? 0;
        if (n < 1) throw new Error(`ball.release: nothing is locked in "${lockId}"`);
        if (b.inPlay + b.toFeed + 1 > b.capacity) throw new Error(`ball.release: more than ${b.capacity} ball(s) in play`);
        if (n === 1) delete b.locked[lockId];
        else b.locked[lockId] = n - 1;
        b.inPlay += 1;
        out.push({ c: "releaseBall", lock: lockId });
      },
      feed() {
        if (resetting) throw new Error("ball.feed: balls are not fed while the game flow clears the table");
        const b = state.balls;
        if (b.inPlay + b.toFeed + 1 > b.capacity) throw new Error(`ball.feed: more than ${b.capacity} ball(s) in play`);
        b.toFeed += 1;
        out.push({ c: "feedBall", feed: "plunger" });
      },
    },
    game: {
      phase: () => (flow ? flow.phase() : "play"),
      extraBall: () => (flow ? flow.extraBall() : false),
      saver(ticks) {
        needTicks("game.saver", ticks);
        if (flow) flow.saver(ticks);
        else state.balls.saver.until = ctx.now + ticks;
      },
      awardCredit(n) {
        if (!Number.isSafeInteger(n) || n < 1) throw new Error(`game.awardCredit: ${n} is not a whole number of at least 1`);
        flow?.awardCredit(n);
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

  const persisted = new Set(table.persist ?? []);
  const flow: Flow | null = opts.flow
    ? createFlow(opts.flow, {
        state,
        emit: (cmd) => {
          out.push(cmd);
        },
        setTimer(id, ticks) {
          state.timers[id] = { due: ctx.now + ticks };
          dueKnown = false;
        },
        clearTimer(id) {
          delete state.timers[id];
          dueKnown = false;
        },
        reset(keepPersist) {
          resetting = true;
          try {
            clearTable(keepPersist);
          } finally {
            resetting = false;
          }
        },
        stopPlay() {
          resetting = true;
          try {
            stopActivity();
          } finally {
            resetting = false;
          }
        },
        awardBonus() {
          // the table's bonus functions only read: no starting modes or feeding balls from them
          resetting = true;
          try {
            const total = table.bonus ? table.bonus(ctx) : 0;
            const parts = table.bonusParts ? table.bonusParts(ctx) : [];
            if (total !== 0) ctx.addScore(total);
            out.push({ c: "dmd", show: { id: "bonus", args: { total } } });
            for (const [label, value] of parts) out.push({ c: "dmd", show: { id: "bonusPart", args: { label, value } } });
            return total;
          } finally {
            resetting = false;
          }
        },
        now: () => ctx.now,
        feed: () => ctx.ball.feed(),
      })
    : null;

  /** Stops what is going on on the table: modes (with their exit handlers), table timers, shot progress. */
  function stopActivity(): void {
    for (const id of Object.keys(state.modes).sort(byId)) ctx.stop(id);
    for (const id of Object.keys(state.timers)) if (!id.startsWith(FLOW_TIMER)) delete state.timers[id];
    dueKnown = false;
    state.shots = {};
  }

  function clearTable(keepPersist: boolean): void {
    stopActivity();
    for (const id of Object.keys(state.lamps).sort(byId)) {
      if (keepPersist && persisted.has(id)) continue;
      if (state.lamps[id] === "lit") out.push({ c: "setLamp", lamp: id, state: "off" });
      delete state.lamps[id];
    }
    for (const id of Object.keys(state.counters)) if (!(keepPersist && persisted.has(id))) delete state.counters[id];
  }

  /** Mode handlers for an event: the modes running when it began, in id order, skipping any stopped meanwhile. */
  const toModes = (e: RulesEvent): void => {
    const ids = runningModes();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const m = own(state.modes, id);
      if (!m) continue;
      modeDef(id).phases[m.phase]!.on?.[e.t]?.(ctx, e);
    }
  };

  /**
   * Advances the switch sequences of all shots; returns the shots this switch completed.
   * A switch that is not in a shot's list is ignored by it. One that is in the list but
   * not the next expected falls back to the longest start of the sequence that the
   * switches seen so far still end with (so A, A, A, B completes [A, A, B]); if none
   * does, the progress is dropped. The window runs from the first switch of the
   * sequence; after a fallback it keeps the old start, which only makes it shorter.
   */
  const hitShots = (e: SwitchEvent): readonly string[] => {
    let done: string[] | null = null;
    for (const name of shotNames) {
      const list = shots[name]!;
      let cur = own(state.shots, name);
      if (cur && e.tick - cur.at > shotWindow) {
        delete state.shots[name];
        cur = undefined;
      }
      const have = cur ? cur.i : 0;
      let at: number;
      if (e.sw === list[have]) at = have + 1;
      else if (!list.includes(e.sw)) continue;
      else {
        // longest k <= have such that list[0..k-1] equals the last k switches seen (list[have-k+1..have-1], then e.sw)
        at = 0;
        for (let k = Math.min(have, list.length - 1); k >= 1; k--) {
          let ok = list[k - 1] === e.sw;
          for (let j = 0; ok && j < k - 1; j++) ok = list[j] === list[have - k + 1 + j];
          if (ok) {
            at = k;
            break;
          }
        }
      }
      if (at === list.length) {
        delete state.shots[name];
        (done ??= []).push(name);
      } else if (at === 0) {
        delete state.shots[name];
      } else {
        state.shots[name] = { i: at, at: at === 1 || !cur ? e.tick : cur.at };
      }
    }
    return done ?? NO_SHOTS;
  };

  const handle = (e: RulesEvent): void => {
    curBall = e.t === "switch" ? e.ball : -1;
    try {
      dispatch(e);
    } finally {
      curBall = -1;
    }
  };

  const dispatch = (e: RulesEvent): void => {
    const b = state.balls;
    if (e.t === "drain") {
      if (b.inPlay < 1) throw new Error("a ball drained but no ball is in play: the ball accounting is off");
      b.inPlay -= 1;
    } else if (e.t === "ballAtPlunger") {
      if (b.inPlay + 1 > b.capacity) throw new Error(`a ball arrived at the plunger but ${b.capacity} ball(s) are already in play`);
      b.inPlay += 1;
      b.toFeed = Math.max(0, b.toFeed - 1);
      state.shots = {}; // a sequence started with the last ball means nothing for the next
    }
    if (flow) {
      if (flow.consumes(e)) {
        flow.press(e);
        return;
      }
      if (!flow.admits()) return; // between balls and games the table is not playing
    }
    if (flow && e.t === "switch") flow.switchSeen(e.tick);
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
    } else if (e.t === "ballAtPlunger") {
      table.onBallStart?.(ctx);
    }
    // button events reach the modes only
    if (flow) flow.scored();
    if (flow && e.t === "drain") flow.afterDrain();
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
      if (flow && id.startsWith(FLOW_TIMER)) {
        flow.timer(id);
        continue;
      }
      const e: RulesEvent = t.tag === undefined ? { t: "timer", tick, id } : { t: "timer", tick, id, tag: t.tag };
      toModes(e);
      table.onTimer?.(ctx, id, t.tag);
      flow?.scored();
    }
  };

  return {
    state,
    step(tick, events, sink) {
      if (!Number.isSafeInteger(tick) || tick < state.tick) throw new Error(`step: tick ${tick} must be a whole number, not before tick ${state.tick}`);
      state.tick = tick;
      ctx.now = tick;
      if (events.length === 0 && earliest() > tick) return;
      out = sink;
      if (earliest() <= tick) fireTimers(tick);
      for (let i = 0; i < events.length; i++) handle(events[i]!);
    },
  };
}
