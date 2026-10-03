import type { RulesState } from "./types";

/** Throws if a value is not plain JSON data (the state must survive a save and a replay). */
function assertPlain(v: unknown, path: string): void {
  if (v === null || typeof v === "string" || typeof v === "boolean") return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`rules state: ${path} is not a finite number`);
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

export function serialize(s: RulesState): string {
  assertPlain(s, "state");
  return stable(s);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const recordOf = (v: unknown, ok: (x: unknown) => boolean): boolean => isRecord(v) && Object.values(v).every(ok);

/** Problems with a parsed state, or an empty list. */
export function validateState(s: unknown): string[] {
  if (!isRecord(s)) return ["state is not an object"];
  const errs: string[] = [];
  if (s.v !== 1) errs.push(`unknown state version ${String(s.v)}`);
  if (!isInt(s.tick) || s.tick < 0) errs.push("tick must be a non-negative integer");
  if (!isInt(s.rng) || s.rng < 0 || s.rng > 0xffffffff) errs.push("rng must be a uint32");
  if (!recordOf(s.lamps, (x) => x === "off" || x === "lit" || x === "collected")) errs.push("lamps must map ids to off, lit or collected");
  if (!recordOf(s.counters, (x) => typeof x === "number" && Number.isFinite(x))) errs.push("counters must map ids to numbers");
  if (!recordOf(s.timers, (x) => isRecord(x) && isInt(x.due) && (x.every === undefined || (isInt(x.every) && x.every > 0)) && (x.tag === undefined || typeof x.tag === "string"))) {
    errs.push("timers must map ids to {due, every?, tag?}");
  }
  if (!recordOf(s.modes, (x) => isRecord(x) && typeof x.phase === "string" && isInt(x.since) && recordOf(x.data, (d) => typeof d === "number" && Number.isFinite(d)))) {
    errs.push("modes must map ids to {phase, since, data}");
  }
  const b = s.balls;
  if (!isRecord(b) || !isInt(b.inPlay) || !isInt(b.toFeed) || !isInt(b.capacity) || !recordOf(b.locked, isInt) || !isRecord(b.saver) || !isInt(b.saver.until)) {
    errs.push("balls must be {inPlay, locked, toFeed, saver {until}, capacity}");
  }
  const p = s.player;
  if (!isRecord(p) || typeof p.score !== "number" || !isInt(p.ballNo) || !recordOf(p.persist, (x) => typeof x === "number" && Number.isFinite(x))) {
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
  return parsed as RulesState;
}
