import { hashWorld } from "../core/hash";
import { DT } from "../core/step";
import type { TableDef } from "../table/schema";
import { hashRules } from "../rules";
import type { TableRules } from "../rules";
import { createGame, takeCommands, tick } from "./game";
import type { Game } from "./game";

/** The buttons a replay can press and release. */
export const ACTIONS = ["left_down", "left_up", "right_down", "right_up", "plunge_down", "plunge_up"] as const;
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
  const down = action.endsWith("_down");
  if (action.startsWith("left")) g.input.left = down;
  else if (action.startsWith("right")) g.input.right = down;
  else g.input.plunge = down;
}

/**
 * Plays a replay headless on the table it names and returns the state hashes at the
 * end. `rules` maps a table id to its rules (free play if absent). Throws on an
 * invalid replay or an unknown table.
 */
export function runReplay(r: Replay, tables: TableDef[], rules: Record<string, TableRules> = {}): ReplayResult {
  const errors = validateReplay(r);
  if (errors.length > 0) throw new Error(`invalid replay: ${errors.join("; ")}`);
  const def = tables.find((t) => t.id === r.header.tableId);
  if (!def) throw new Error(`unknown table "${r.header.tableId}"`);
  const game = createGame(def, { rules: Object.hasOwn(rules, def.id) ? rules[def.id] : undefined, seed: r.header.seed });
  let next = 0;
  for (let t = 0; t < r.header.ticks; t++) {
    while (next < r.inputs.length && r.inputs[next]!.tick === t) press(game, r.inputs[next++]!.action);
    tick(game);
    takeCommands(game); // nobody listens in a replay
  }
  return { hash: hashWorld(game.table.world), rulesHash: hashRules(game.rules.state), game };
}
