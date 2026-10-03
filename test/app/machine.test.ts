import { describe, expect, it } from "vitest";
import { applyCommands, createKeeper, fresh, MACHINE_KEY, parseStored, toMachine } from "../../src/app/machine";
import type { StoredMachine } from "../../src/app/machine";
import { memoryStore } from "../../src/storage";
import type { Store } from "../../src/storage";

const saved = (): StoredMachine => ({ credits: 4, boards: { main: [{ score: 900, name: "AAA" }, { score: 500, name: "BOB" }], bought: [{ score: 70, name: "AAA" }] } });

describe("reading the saved machine", () => {
  it("starts fresh with the starting credits when nothing is saved", () => {
    expect(parseStored(null, 3)).toEqual({ credits: 3, boards: { main: [], bought: [] } });
  });

  it("reads back what was saved", () => {
    expect(parseStored(JSON.stringify(saved()), 3)).toEqual(saved());
  });

  it("starts fresh, never throws, on anything that is not a valid saved machine", () => {
    const bad = [
      "not json", "", "null", "[]", "{}", "42",
      JSON.stringify({ credits: -1, boards: { main: [], bought: [] } }),
      JSON.stringify({ credits: 1.5, boards: { main: [], bought: [] } }),
      JSON.stringify({ credits: "3", boards: { main: [], bought: [] } }),
      JSON.stringify({ credits: 1, boards: { main: [{ score: 1, name: "A" }, { score: 2, name: "B" }], bought: [] } }), // not highest first
      JSON.stringify({ credits: 1, boards: { main: [{ score: -5, name: "A" }], bought: [] } }),
      JSON.stringify({ credits: 1, boards: { main: [{ score: 5 }], bought: [] } }),
      JSON.stringify({ credits: 1, boards: { main: [{ score: 5, name: "WAY TOO LONG A NAME" }], bought: [] } }),
      JSON.stringify({ credits: 1, boards: { main: "x", bought: [] } }),
      JSON.stringify({ credits: 1, boards: { main: [] } }),
      JSON.stringify({ credits: 1 }),
    ];
    for (const text of bad) expect(parseStored(text, 7), text).toEqual(fresh(7));
  });

  it("turns a negative zero into 0, and cuts boards longer than the machine keeps, when it reads them", () => {
    const text = JSON.stringify({ credits: 0, boards: { main: [3, 2, 1].map((score) => ({ score, name: "AAA" })), bought: [5, 4, 3, 2].map((score) => ({ score, name: "AAA" })) } }).replace('"credits":0', '"credits":-0');
    const s = parseStored(text, 7, 2);
    expect(Object.is(s.credits, 0)).toBe(true);
    expect(s.boards.main.map((e) => e.score)).toEqual([3, 2]);
    expect(s.boards.bought.map((e) => e.score)).toEqual([5, 4]);
    expect(parseStored(text, 7).boards.main).toHaveLength(3); // no size given: nothing cut
  });

  it("hands the rules the scores only", () => {
    expect(toMachine(saved())).toEqual({ credits: 4, boards: { main: [900, 500], bought: [70] } });
  });
});

describe("applying the rules' commands", () => {
  it("follows the credit count", () => {
    const s = fresh(2);
    expect(applyCommands(s, [{ c: "credits", n: 5 }], 5)).toBe(true);
    expect(s.credits).toBe(5);
    expect(applyCommands(s, [{ c: "credits", n: 5 }], 5)).toBe(false);
  });

  it("puts a hiscore at its rank with the default name, on the right board, and keeps only the board size", () => {
    const s = saved();
    expect(applyCommands(s, [{ c: "hiscore", board: "main", score: 700, rank: 2 }], 3)).toBe(true);
    expect(s.boards.main).toEqual([{ score: 900, name: "AAA" }, { score: 700, name: "AAA" }, { score: 500, name: "BOB" }]);
    applyCommands(s, [{ c: "hiscore", board: "main", score: 800, rank: 2 }], 3);
    expect(s.boards.main.map((e) => e.score)).toEqual([900, 800, 700]); // 500 fell off
    applyCommands(s, [{ c: "hiscore", board: "bought", score: 90, rank: 1 }], 3);
    expect(s.boards.bought.map((e) => e.score)).toEqual([90, 70]);
    expect(s.boards.main.map((e) => e.score)).toEqual([900, 800, 700]);
  });

  it("leaves everything else alone and applies several commands in order", () => {
    const s = fresh(0);
    const changed = applyCommands(s, [
      { c: "dmd", show: { id: "x" } }, { c: "sound", play: "ding" }, { c: "credits", n: 1 }, { c: "credits", n: 2 },
      { c: "gameOver", score: 5, bought: false }, { c: "hiscore", board: "main", score: 5, rank: 1 },
    ], 5);
    expect(changed).toBe(true);
    expect(s).toEqual({ credits: 2, boards: { main: [{ score: 5, name: "AAA" }], bought: [] } });
    expect(applyCommands(fresh(0), [{ c: "dmd", show: { id: "x" } }], 5)).toBe(false);
  });
});

describe("the keeper", () => {
  const opts = { startCredits: 3, boardSize: 5 };

  it("loads a fresh machine from an empty store, and what was saved from a used one", async () => {
    expect(await createKeeper(memoryStore(), opts).load()).toEqual(fresh(3));
    const store = memoryStore();
    await store.set(MACHINE_KEY, JSON.stringify(saved()));
    expect(await createKeeper(store, opts).load()).toEqual(saved());
  });

  it("saves when the commands changed the machine, and a later session loads it", async () => {
    const store = memoryStore();
    const keeper = createKeeper(store, opts);
    await keeper.load();
    keeper.apply([{ c: "credits", n: 1 }, { c: "hiscore", board: "main", score: 1234, rank: 1 }]);
    await keeper.flush();
    const again = await createKeeper(store, opts).load();
    expect(again).toEqual({ credits: 1, boards: { main: [{ score: 1234, name: "AAA" }], bought: [] } });
  });

  it("cuts a stored board to the board size at load, so storage and the rules start in step", async () => {
    const store = memoryStore();
    await store.set(MACHINE_KEY, JSON.stringify({ credits: 1, boards: { main: [9, 8, 7, 6, 5, 4].map((score) => ({ score, name: "AAA" })), bought: [] } }));
    const loaded = await createKeeper(store, { startCredits: 3, boardSize: 5 }).load();
    expect(loaded.boards.main).toHaveLength(5);
  });

  it("refuses commands before the machine is loaded: load would overwrite them", () => {
    const keeper = createKeeper(memoryStore(), opts);
    expect(() => keeper.apply([{ c: "credits", n: 1 }])).toThrow(/load the machine before applying/);
  });

  it("writes nothing when nothing changed", async () => {
    let writes = 0;
    const store: Store = { get: async () => null, set: async () => { writes++; } };
    const keeper = createKeeper(store, opts);
    await keeper.load();
    keeper.apply([{ c: "dmd", show: { id: "x" } }, { c: "credits", n: 3 }]); // 3 is what it already has
    await keeper.flush();
    expect(writes).toBe(0);
  });

  it("saves one after another, so the last state wins", async () => {
    const order: string[] = [];
    const store: Store = {
      get: async () => null,
      set: async (_k, v) => {
        await new Promise((r) => setTimeout(r, order.length === 0 ? 20 : 0)); // the first save is the slow one
        order.push(v);
      },
    };
    const keeper = createKeeper(store, opts);
    await keeper.load();
    keeper.apply([{ c: "credits", n: 1 }]);
    keeper.apply([{ c: "credits", n: 2 }]);
    await keeper.flush();
    expect(order.map((t) => (JSON.parse(t) as StoredMachine).credits)).toEqual([1, 2]);
  });

  it("reports a failed save instead of throwing, and keeps saving afterwards", async () => {
    const errors: unknown[] = [];
    let fail = true;
    const inner = memoryStore();
    const store: Store = { get: inner.get, set: async (k, v) => { if (fail) throw new Error("quota"); await inner.set(k, v); } };
    const keeper = createKeeper(store, { ...opts, onError: (e) => errors.push(e) });
    await keeper.load();
    keeper.apply([{ c: "credits", n: 1 }]);
    await keeper.flush();
    expect(errors).toHaveLength(1);
    fail = false;
    keeper.apply([{ c: "credits", n: 2 }]);
    await keeper.flush();
    expect(parseStored(await inner.get(MACHINE_KEY), 0).credits).toBe(2);
  });

  it("falls back to a fresh machine when the store cannot be read", async () => {
    const store: Store = { get: async () => { throw new Error("blocked"); }, set: async () => {} };
    expect(await createKeeper(store, opts).load()).toEqual(fresh(3));
  });
});
