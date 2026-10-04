import type { RulesState } from "./types";

/** Throws if a value is not plain JSON data (the state must survive a save and a replay). */
function assertPlain(v: unknown, path: string): void {
  if (v === null || typeof v === "string" || typeof v === "boolean") return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`rules state: ${path} is not a finite number`);
    // JSON would write -0 as 0: the save would silently differ from the state
    if (Object.is(v, -0)) throw new Error(`rules state: ${path} is negative zero`);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => assertPlain(x, `${path}[${i}]`));
    return;
  }
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    for (const [k, x] of Object.entries(v)) assertPlain(x, `${path}.${k}`);
    return;
  }
  throw new Error(`rules state: ${path} is not plain JSON data (${typeof v})`);
}

/** Same text for the same state whatever order the keys were added in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** `game` is left out while null, so a table without a flow saves and hashes as it did before flows existed. */
export function serialize(s: RulesState): string {
  assertPlain(s, "state");
  if (s.game === null) {
    const { game: _none, ...rest } = s;
    return stable(rest);
  }
  if (s.game.tiltHeat === 0 && s.game.tiltAt === 0) {
    // quiet: left out, so a game saved before tilt existed reads and hashes as before
    const { tiltHeat: _h, tiltAt: _a, ...game } = s.game;
    return stable({ ...s, game });
  }
  return stable(s);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A finite number that JSON keeps as it is (no -0). */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0);
/** A whole number from 0 up to 2^53 - 1. */
const isNat = (v: unknown): v is number => isNum(v) && Number.isSafeInteger(v) && v >= 0;
const recordOf = (v: unknown, ok: (x: unknown) => boolean): boolean => isRecord(v) && Object.values(v).every(ok);

const KEYS = ["v", "tick", "rng", "lamps", "counters", "timers", "shots", "modes", "balls", "game", "player"];
const PHASES = ["attract", "play", "bonus", "over", "buyin"];

/** Scores, highest first. */
const isBoard = (v: unknown): boolean => Array.isArray(v) && v.every(isNat) && v.every((x, i) => i === 0 || (v[i - 1] as number) >= x);

/** Problems with a parsed state, or an empty list. */
export function validateState(s: unknown): string[] {
  if (!isRecord(s)) return ["state is not an object"];
  const errs: string[] = [];
  for (const k of Object.keys(s)) if (!KEYS.includes(k)) errs.push(`unknown key "${k}"`);
  if (s.v !== 1) errs.push(`unknown state version ${String(s.v)}`);
  if (!isNat(s.tick)) errs.push("tick must be a non-negative integer");
  if (!isNat(s.rng) || s.rng > 0xffffffff) errs.push("rng must be a uint32");
  if (!recordOf(s.lamps, (x) => x === "off" || x === "lit" || x === "flash" || x === "collected")) errs.push("lamps must map ids to off, lit, flash or collected");
  if (!recordOf(s.counters, isNum)) errs.push("counters must map ids to numbers");
  if (!recordOf(s.timers, (x) => isRecord(x) && isNat(x.due) && (x.every === undefined || (isNat(x.every) && x.every > 0)) && (x.tag === undefined || typeof x.tag === "string"))) {
    errs.push("timers must map ids to {due, every?, tag?} with whole-number ticks");
  }
  if (!recordOf(s.shots, (x) => isRecord(x) && isNat(x.i) && x.i > 0 && isNat(x.at))) errs.push("shots must map names to {i >= 1, at}");
  if (!recordOf(s.modes, (x) => isRecord(x) && typeof x.phase === "string" && isNat(x.since) && recordOf(x.data, isNum))) {
    errs.push("modes must map ids to {phase, since, data}");
  }
  const b = s.balls;
  if (!isRecord(b) || !isNat(b.inPlay) || !isNat(b.toFeed) || !isNat(b.capacity) || b.capacity < 1 || !recordOf(b.locked, isNat) || !isRecord(b.saver) || !isNat(b.saver.until)) {
    errs.push("balls must be {inPlay, locked, toFeed, saver {until}, capacity >= 1} with whole numbers");
  } else if (b.inPlay > b.capacity) {
    errs.push(`balls.inPlay ${b.inPlay} is above balls.capacity ${b.capacity}`);
  }
  const g = s.game === undefined ? null : s.game; // absent = no flow
  if (g !== null) {
    if (
      !isRecord(g) || typeof g.phase !== "string" || !PHASES.includes(g.phase) || !isNat(g.credits) || !isNat(g.shootAgain) ||
      typeof g.bought !== "boolean" || typeof g.tilted !== "boolean" || typeof g.replayDone !== "boolean" || !isNat(g.extraBalls) || typeof g.saverWait !== "boolean" ||
      (g.tiltHeat !== undefined && !isNat(g.tiltHeat)) || (g.tiltAt !== undefined && !isNat(g.tiltAt)) ||
      !isRecord(g.board) || !isBoard(g.board.main) || !isBoard(g.board.bought)
    ) {
      errs.push("game must be null or {phase, credits, shootAgain, bought, tilted, replayDone, extraBalls, saverWait, tiltHeat?, tiltAt?, board {main, bought} sorted highest first}");
    }
  }
  const p = s.player;
  if (!isRecord(p) || !isNum(p.score) || !isNat(p.ballNo) || !recordOf(p.persist, isNum)) {
    errs.push("player must be {score, ballNo, persist}");
  }
  return errs;
}

/** Parses a saved state. Throws, listing every problem, if it is not a valid state of this version. */
export function restore(json: string): RulesState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`rules state: not valid JSON (${(e as Error).message})`);
  }
  const errs = validateState(parsed);
  if (errs.length > 0) throw new Error(`rules state invalid:\n${errs.join("\n")}`);
  const state = parsed as RulesState;
  if (state.game === undefined) state.game = null;
  else if (state.game !== null) {
    state.game.tiltHeat ??= 0;
    state.game.tiltAt ??= 0;
  }
  return state;
}
