import { validateMachine } from "../rules";
import type { Command, Machine } from "../rules";
import type { Store } from "../storage";

/** One line of a score board. Names are fixed until initials entry exists (#14). */
export interface Entry {
  score: number;
  name: string;
}

/** What the machine keeps between sessions. */
export interface StoredMachine {
  credits: number;
  boards: { main: Entry[]; bought: Entry[] };
}

export const MACHINE_KEY = "pinball/machine/v1";
const DEFAULT_NAME = "AAA";

export function fresh(startCredits: number): StoredMachine {
  return { credits: startCredits, boards: { main: [], bought: [] } };
}

/** The scores alone, in the shape the rules take. */
export function toMachine(s: StoredMachine): Machine {
  return { credits: s.credits, boards: { main: s.boards.main.map((e) => e.score), bought: s.boards.bought.map((e) => e.score) } };
}

const isEntry = (v: unknown): v is Entry =>
  typeof v === "object" && v !== null && typeof (v as Entry).score === "number" && typeof (v as Entry).name === "string" && (v as Entry).name.length <= 12;

/** Reads saved text. Anything that is not a valid saved machine gives a fresh one, never an error: storage is untrusted. */
export function parseStored(text: string | null, startCredits: number, boardSize = Infinity): StoredMachine {
  if (text === null) return fresh(startCredits);
  try {
    const raw = JSON.parse(text) as { credits?: unknown; boards?: { main?: unknown; bought?: unknown } };
    const main = raw?.boards?.main;
    const bought = raw?.boards?.bought;
    if (!Array.isArray(main) || !Array.isArray(bought) || !main.every(isEntry) || !bought.every(isEntry)) return fresh(startCredits);
    // credits + 0 turns a negative zero into 0; boards longer than the machine keeps are cut here, not on the first score
    const stored: StoredMachine = {
      credits: (raw.credits as number) + 0,
      boards: { main: (main as Entry[]).slice(0, boardSize), bought: (bought as Entry[]).slice(0, boardSize) },
    };
    return validateMachine(toMachine(stored)).length === 0 ? stored : fresh(startCredits);
  } catch {
    return fresh(startCredits);
  }
}

/** Applies the rules' `credits` and `hiscore` commands to the machine; true when something changed. Other commands are not its business. */
export function applyCommands(s: StoredMachine, cmds: readonly Command[], boardSize: number): boolean {
  let changed = false;
  for (const c of cmds) {
    if (c.c === "credits" && c.n !== s.credits) {
      s.credits = c.n;
      changed = true;
    } else if (c.c === "hiscore") {
      const board = s.boards[c.board];
      board.splice(Math.max(0, c.rank - 1), 0, { score: c.score, name: DEFAULT_NAME });
      if (board.length > boardSize) board.length = boardSize;
      changed = true;
    }
  }
  return changed;
}

export interface Keeper {
  load(): Promise<StoredMachine>;
  /** Applies commands and saves when they changed the machine. */
  apply(cmds: readonly Command[]): void;
  /** Resolves when every save so far has finished. */
  flush(): Promise<void>;
}

/** Keeps the stored machine in step with the game. Saves run one after another; a failed save is reported, never thrown. */
export function createKeeper(store: Store, opts: { startCredits: number; boardSize: number; onError?: (e: unknown) => void }): Keeper {
  let machine = fresh(opts.startCredits);
  let loaded = false;
  let chain: Promise<void> = Promise.resolve();
  return {
    async load() {
      machine = parseStored(await store.get(MACHINE_KEY).catch(() => null), opts.startCredits, opts.boardSize);
      loaded = true;
      return structuredClone(machine);
    },
    apply(cmds) {
      if (!loaded) throw new Error("keeper: load the machine before applying commands");
      if (!applyCommands(machine, cmds, opts.boardSize)) return;
      const text = JSON.stringify(machine);
      chain = chain.then(() => store.set(MACHINE_KEY, text)).catch((e) => opts.onError?.(e));
    },
    flush: () => chain,
  };
}
