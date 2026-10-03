import { hashWorld } from "../core/hash";
import { DT } from "../core/step";
import type { TableDef } from "../table/schema";
import { hashRules } from "../rules";
import { createGame, nudge, takeCommands, tick } from "./game";
import type { NudgeDir } from "./game";
import type { TableSetup } from "./game";
import type { Game } from "./game";

/** The buttons a replay can press and release. */
export const ACTIONS = [
  "left_down", "left_up", "right_down", "right_up", "plunge_down", "plunge_up",
  "coin_down", "coin_up", "start_down", "start_up", "buyin_down", "buyin_up",
  // one-shot: there is no release
  "nudge_left", "nudge_right", "nudge_up",
] as const;
export type ReplayAction = (typeof ACTIONS)[number];

export interface ReplayHeader {
  format: 1;
  tableId: string;
  /** Physics step in seconds; must equal the engine's DT. */
  dt: number;
  /** Seed of the rules' random numbers. */
  seed: number;
  /** Number of ticks to play. */
  ticks: number;
  /** What the machine held when the replay starts (with a flow): credits, and the score boards. */
  credits?: number;
  boards?: { main: number[]; bought: number[] };
}

/** An input takes effect before the physics step of `tick` (tick 0 = before the first step). */
export interface ReplayInput {
  tick: number;
  action: ReplayAction;
}

export interface Replay {
  header: ReplayHeader;
  inputs: ReplayInput[];
}

export interface ReplayResult {
  /** Hash of the physics at the end. */
  hash: number;
  /** Hash of the rules state at the end. */
  rulesHash: number;
  game: Game;
}

/** Problems with a replay, or an empty list. Takes untrusted JSON. */
export function validateReplay(r: unknown): string[] {
  const errors: string[] = [];
  if (typeof r !== "object" || r === null) return ["replay is not an object"];
  const { header: h, inputs } = r as { header?: Record<string, unknown>; inputs?: unknown };
  if (typeof h !== "object" || h === null) return ["header is missing"];
  if (h.format !== 1) errors.push(`header.format must be 1, got ${String(h.format)}`);
  if (typeof h.tableId !== "string" || h.tableId === "") errors.push("header.tableId must be a non-empty string");
  if (h.dt !== DT) errors.push(`header.dt must be ${DT}, got ${String(h.dt)}`);
  if (!Number.isInteger(h.seed)) errors.push("header.seed must be an integer");
  if (h.credits !== undefined && !(Number.isSafeInteger(h.credits) && (h.credits as number) >= 0)) errors.push("header.credits must be a whole number, 0 or more");
  if (h.boards !== undefined) {
    const b = h.boards as { main?: unknown; bought?: unknown } | null;
    const board = (v: unknown): boolean => Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && x >= 0) && v.every((x, i) => i === 0 || (v[i - 1] as number) >= x);
    if (typeof b !== "object" || b === null || !board(b.main) || !board(b.bought)) errors.push("header.boards must be {main, bought}, each a list of scores, highest first");
  }
  if (!Number.isInteger(h.ticks) || (h.ticks as number) < 0) errors.push("header.ticks must be a non-negative integer");
  if (!Array.isArray(inputs)) return [...errors, "inputs must be an array"];
  let last = 0;
  inputs.forEach((raw: unknown, i) => {
    const e = raw as { tick?: unknown; action?: unknown } | null;
    if (typeof e !== "object" || e === null) return void errors.push(`inputs[${i}] is not an object`);
    if (!Number.isInteger(e.tick) || (e.tick as number) < 0) return void errors.push(`inputs[${i}].tick must be a non-negative integer`);
    if (!(ACTIONS as readonly unknown[]).includes(e.action)) errors.push(`inputs[${i}].action "${String(e.action)}" is unknown`);
    if ((e.tick as number) < last) errors.push(`inputs[${i}].tick ${String(e.tick)} comes before the previous input`);
    if (Number.isInteger(h.ticks) && (e.tick as number) >= (h.ticks as number)) errors.push(`inputs[${i}].tick ${String(e.tick)} is not before header.ticks`);
    last = e.tick as number;
  });
  return errors;
}

function press(g: Game, action: ReplayAction): void {
  if (action.startsWith("nudge_")) {
    nudge(g, action.slice(6) as NudgeDir);
    return;
  }
  const down = action.endsWith("_down");
  const button = action.slice(0, action.lastIndexOf("_")) as "left" | "right" | "plunge" | "coin" | "start" | "buyin";
  g.input[button] = down;
}

/**
 * Plays a replay headless on the table it names and returns the state hashes at the
 * end. `setups` maps a table id to its rules and flow (free play if absent). Throws
 * on an invalid replay or an unknown table.
 */
export function runReplay(r: Replay, tables: TableDef[], setups: Record<string, TableSetup> = {}): ReplayResult {
  const errors = validateReplay(r);
  if (errors.length > 0) throw new Error(`invalid replay: ${errors.join("; ")}`);
  const def = tables.find((t) => t.id === r.header.tableId);
  if (!def) throw new Error(`unknown table "${r.header.tableId}"`);
  const setup = Object.hasOwn(setups, def.id) ? setups[def.id]! : {};
  const h = r.header;
  // what the machine held at the start; credits default to the flow's own starting credits
  const machine =
    h.credits !== undefined || h.boards !== undefined
      ? { credits: h.credits ?? setup.flow?.startCredits ?? 0, boards: h.boards ?? { main: [], bought: [] } }
      : undefined;
  const game = createGame(def, { ...setup, seed: h.seed, ...(machine ? { machine } : {}) });
  let next = 0;
  for (let t = 0; t < r.header.ticks; t++) {
    while (next < r.inputs.length && r.inputs[next]!.tick === t) press(game, r.inputs[next++]!.action);
    tick(game);
    takeCommands(game); // nobody listens in a replay
  }
  return { hash: hashWorld(game.table.world), rulesHash: hashRules(game.rules.state), game };
}
