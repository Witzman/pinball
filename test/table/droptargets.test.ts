import { describe, expect, it } from "vitest";
import { hashWorld } from "../../src/core/hash";
import { advance, createGame, resetDropBank, setDropTarget, takeCommands, tick } from "../../src/sim/game";
import type { Game } from "../../src/sim/game";
import type { TableRules } from "../../src/rules";
import { loadTable } from "../../src/table/load";
import { validateTable } from "../../src/table/validate";
import type { TableDef } from "../../src/table/schema";
import { dropAt, drainsWithin, restGrid } from "../helpers/rest-grid";

/** A box open at the bottom (the drain) with a flat drop target across the middle: a ball dropped on it rests there for ever while it is up. */
function table(extra: Partial<TableDef> = {}): TableDef {
  return {
    id: "drop",
    name: "Drop",
    playfield: { width: 520, length: 1050, slopeDeg: 6.5 },
    ball: { radius: 13.5, mass: 80 },
    materials: { metal: { e: 0.4, mu: 0.1 }, rubber: { e: 0.6, mu: 0.3 } },
    walls: [
      { type: "polyline", points: [[5, 1045], [5, 5], [515, 5], [515, 1045]], material: "metal" },
      { type: "segment", a: [200, 500], b: [320, 500], material: "rubber", switch: "t1", ref: "t1" },
    ],
    posts: [],
    flippers: [],
    shots: { t1: ["t1"] },
    ...extra,
  };
}

/** `n` physics ticks. */
function run(g: Game, n: number): void {
  for (let i = 0; i < n; i++) tick(g);
}

function game(def: TableDef): { g: Game; seen: string[] } {
  const seen: string[] = [];
  const rules: TableRules = { modes: {}, onSwitch: (_c, e) => void seen.push(e.sw) };
  return { g: createGame(def, { rules }), seen };
}

describe("drop targets in table data", () => {
  it("loads refs as indices: colliders that share a ref share a target, and the world has one flag per target, all up", () => {
    const t = loadTable(table({
      walls: [
        ...table().walls,
        { type: "polyline", points: [[100, 300], [140, 300], [140, 340]], material: "rubber", ref: "pair" },
      ],
      posts: [{ at: [400, 300], r: 10, material: "rubber", ref: "t1" }],
      dropBanks: { bank: ["t1", "pair"] },
    }));
    expect(t.dropIds).toEqual(["t1", "pair"]);
    expect(t.dropBanks).toEqual({ bank: [0, 1] });
    expect(Array.from(t.world.down)).toEqual([0, 0]);
    expect(t.world.segments.map((s) => s.drop)).toEqual([undefined, undefined, undefined, 1, 2, 2]);
    expect(t.world.circles.map((c) => c.drop)).toEqual([1]);
  });

  it("builds a table without drop targets exactly as before: no flags, no drop fields", () => {
    const t = loadTable(table({ walls: table().walls.map((w) => ({ ...w, ref: undefined })) }));
    expect(t.dropIds).toEqual([]);
    expect(t.world.down.length).toBe(0);
    expect(t.world.segments.every((s) => !("drop" in s) || s.drop === undefined)).toBe(true);
  });
});

describe("drop target validation", () => {
  it("accepts a table with drop targets and a bank", () => {
    expect(validateTable(table({ dropBanks: { b: ["t1"] } }))).toEqual([]);
  });

  it("rejects an empty ref, an empty bank, a bank that names a ref nothing has, and an empty bank name", () => {
    const e = (t: TableDef) => validateTable(t).join("\n");
    expect(e(table({ walls: [{ type: "segment", a: [200, 500], b: [320, 500], material: "rubber", ref: "" }] }))).toMatch(/ref must be a non-empty string/);
    expect(e(table({ dropBanks: { b: [] } }))).toMatch(/drop bank "b": needs at least one drop target/);
    expect(e(table({ dropBanks: { b: ["nope"] } }))).toMatch(/drop bank "b": "nope" is not the ref of any wall or post/);
    expect(e(table({ dropBanks: { "": ["t1"] } }))).toMatch(/drop bank: name must not be empty/);
  });
});

describe("a drop target in the step", () => {
  it("blocks a ball while up: a ball dropped on it rests there", () => {
    const { g } = game(table());
    dropAt(g, 260, 450);
    run(g, 3000);
    const b = g.table.world.balls[0]!;
    expect(g.drains).toBe(0);
    expect(b.y * 1000).toBeLessThan(500);
  });

  it("lets a ball through while down, and the ball drains", () => {
    const { g } = game(table());
    setDropTarget(g, "t1", "down");
    dropAt(g, 260, 450);
    expect(drainsWithin(g)).toBe(true);
  });

  it("reports hits while up and nothing while down", () => {
    const up = game(table());
    dropAt(up.g, 260, 450);
    run(up.g, 2000);
    expect(up.seen.length).toBeGreaterThan(0);
    expect(new Set(up.seen)).toEqual(new Set(["t1"]));

    const down = game(table());
    setDropTarget(down.g, "t1", "down");
    dropAt(down.g, 260, 450);
    run(down.g, 2000);
    expect(down.seen).toEqual([]);
  });

  it("blocks again once it is brought up: a ball above it is held by it once more", () => {
    const { g } = game(table());
    setDropTarget(g, "t1", "down");
    setDropTarget(g, "t1", "up");
    dropAt(g, 260, 450);
    run(g, 3000);
    expect(g.drains).toBe(0);
  });

  it("drops a post too, and every collider of one ref together", () => {
    const def = table({ walls: [table().walls[0]!], posts: [{ at: [260, 500], r: 20, material: "rubber", ref: "p" }], shots: {} });
    const up = game(def);
    dropAt(up.g, 260, 440);
    run(up.g, 3000);
    expect(up.g.table.world.balls[0]!.y * 1000).toBeLessThan(500); // balanced on the post or beside it, still on the table
    const down = game(def);
    setDropTarget(down.g, "p", "down");
    dropAt(down.g, 260, 440);
    expect(drainsWithin(down.g)).toBe(true);

    const two = table({ shots: {}, walls: [table().walls[0]!, { type: "segment", a: [100, 500], b: [220, 500], material: "rubber", ref: "x" }, { type: "segment", a: [220, 500], b: [340, 500], material: "rubber", ref: "x" }] });
    const g = game(two).g;
    setDropTarget(g, "x", "down");
    expect(Array.from(g.table.world.down)).toEqual([1]);
    dropAt(g, 160, 450);
    expect(drainsWithin(g)).toBe(true);
  });

  it("keeps the golden hash of a table without drop targets: a ref nothing puts down changes no hash", () => {
    const withRef = game(table()).g;
    const without = game(table({ walls: table().walls.map((w) => ({ ...w, ref: undefined })) })).g;
    for (const g of [withRef, without]) {
      dropAt(g, 100, 300);
      run(g, 300);
    }
    expect(hashWorld(withRef.table.world)).toBe(hashWorld(without.table.world));
  });

  it("hashes only while a target is down: down differs, up again is the same as never down", () => {
    const hashAfter = (down: boolean, backUp = false) => {
      const g = game(table()).g;
      if (down) setDropTarget(g, "t1", "down");
      if (backUp) setDropTarget(g, "t1", "up");
      dropAt(g, 100, 300);
      run(g, 300);
      return hashWorld(g.table.world);
    };
    expect(hashAfter(true)).not.toBe(hashAfter(false));
    expect(hashAfter(true, true)).toBe(hashAfter(false));
  });
});

describe("drop target commands", () => {
  it("puts targets down and up on command, and a bank back up", () => {
    const def = table({
      walls: [table().walls[0]!, { type: "segment", a: [200, 500], b: [320, 500], material: "rubber", ref: "a", switch: "a" }, { type: "segment", a: [340, 500], b: [460, 500], material: "rubber", ref: "b", switch: "b" }],
      dropBanks: { both: ["a", "b"] },
      shots: {},
    });
    let step = 0;
    const rules: TableRules = {
      modes: {},
      onBallStart: (c) => { c.emit({ c: "dropTarget", id: "a", state: "down" }); c.emit({ c: "dropTarget", id: "b", state: "down" }); c.after("up", 5); },
      onTimer: (c) => { step++; c.emit({ c: "dropBank", bank: "both" }); },
    };
    const g = createGame(def, { rules });
    run(g, 2);
    expect(Array.from(g.table.world.down)).toEqual([1, 1]);
    run(g, 10);
    expect(step).toBe(1);
    expect(Array.from(g.table.world.down)).toEqual([0, 0]);
    expect(takeCommands(g).map((c) => c.c)).toContain("dropBank");
  });

  it("fails loudly for a target or a bank the table does not have", () => {
    const g = game(table()).g;
    expect(() => setDropTarget(g, "nope", "down")).toThrow(/unknown drop target "nope"/);
    expect(() => resetDropBank(g, "nope")).toThrow(/unknown drop bank "nope"/);
  });

  it("brings every target up when the game recovers from an error, so the recovered world hashes like a fresh one", () => {
    const def = table({ walls: [...table().walls, { type: "segment", a: [40, 300], b: [160, 300], material: "metal", switch: "boom" }], shots: {} });
    const rules: TableRules = { modes: {}, onSwitch: (_c, e) => { if (e.sw === "boom") throw new Error("boom"); } };
    const g = createGame(def, { rules });
    setDropTarget(g, "t1", "down");
    dropAt(g, 100, 250);
    for (let i = 0; i < 20; i++) advance(g, 50);
    expect(g.errorCount).toBe(1);
    expect(Array.from(g.table.world.down)).toEqual([0]);
  });

  it("is the same game twice: the rules put a target down on a hit and the run replays exactly", () => {
    const rules = (): TableRules => ({ modes: {}, onSwitch: (c, e) => { if (e.sw === "t1" && e.kind === "hit") c.emit({ c: "dropTarget", id: "t1", state: "down" }); } });
    const play = () => {
      const g = createGame(table(), { rules: rules() });
      dropAt(g, 260, 450);
      for (let i = 0; i < 2500; i++) tick(g);
      return { hash: hashWorld(g.table.world), drains: g.drains, down: Array.from(g.table.world.down) };
    };
    const a = play();
    expect(a.down).toEqual([1]); // the first hit put it down
    expect(a.drains).toBe(1); // and the ball fell through
    expect(play()).toEqual(a);
  });
});

describe("the no-resting-place grid in both states", () => {
  const def = table();
  const grid = (state: "up" | "down") => restGrid(def, { x: [230, 290, 30], y: [460, 460, 1], ticks: 6000, setup: (g) => setDropTarget(g, "t1", state) });

  it("finds a resting place while the flat target is up and none while it is down", () => {
    expect(grid("up")).not.toEqual([]);
    expect(grid("down")).toEqual([]);
  });
});
