import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runReplay, validateReplay } from "../../src/sim/replay";
import type { Replay } from "../../src/sim/replay";
import { allTables } from "../../src/tables";

function replay(over: Partial<Replay["header"]> = {}, inputs: Replay["inputs"] = []): Replay {
  return { header: { format: 1, tableId: "demo", dt: 0.001, seed: 1, ticks: 100, ...over }, inputs };
}

function file(name: string): Replay {
  return JSON.parse(readFileSync(new URL(`../replays/${name}.json`, import.meta.url), "utf8")) as Replay;
}

describe("replay runner", () => {
  it("plays the same replay to the same hash every time", () => {
    const r = file("launch-and-flip");
    expect(runReplay(r, allTables).hash).toBe(runReplay(r, allTables).hash);
  });

  it("plays exactly header.ticks ticks", () => {
    expect(runReplay(replay({ ticks: 123 }), allTables).game.table.world.tick).toBe(123);
  });

  it("applies an input before the physics step of its tick", () => {
    const at = (tick: number) => runReplay(replay({ ticks: 20 }, [{ tick, action: "left_down" }]), allTables).game.table.world.flippers[0]!;
    // pressed at tick 0, the flipper has swung 20 ticks; pressed at tick 19, one tick
    expect(at(0).u).toBeCloseTo(20 / 40, 9);
    expect(at(19).u).toBeCloseTo(1 / 40, 9);
  });

  it("holds a button until its _up input", () => {
    const g = runReplay(replay({ ticks: 200 }, [{ tick: 0, action: "left_down" }, { tick: 0, action: "right_down" }, { tick: 100, action: "left_up" }]), allTables).game;
    const [left, right] = [g.table.flipperIds.indexOf("left"), g.table.flipperIds.indexOf("right")].map((i) => g.table.world.flippers[i]!);
    expect(right!.u).toBe(1);
    expect(left!.u).toBeLessThan(1); // released at tick 100, coming down
    expect(left!.on).toBe(false);
  });

  it("changes the hash when the flipper, not just the ball, differs", () => {
    // The ball sits on the plunger far from the flippers, so only flipper state differs.
    const a = runReplay(replay({ ticks: 30 }), allTables).hash;
    const b = runReplay(replay({ ticks: 30 }, [{ tick: 0, action: "left_down" }]), allTables).hash;
    expect(a).not.toBe(b);
  });

  it("changes the hash when the plunger moves", () => {
    const a = runReplay(replay({ ticks: 30 }), allTables).hash;
    const b = runReplay(replay({ ticks: 30 }, [{ tick: 0, action: "plunge_down" }]), allTables).hash;
    expect(a).not.toBe(b);
  });

  it("launches the ball off the plunger in the shipped replays: it goes round the table and drains, which the idle replay never does", () => {
    expect(runReplay(file("idle"), allTables).game.drains).toBe(0);
    for (const n of ["launch-and-flip", "flipper-hammering"]) {
      expect(runReplay(file(n), allTables).game.drains, n).toBeGreaterThan(0);
    }
  });

  it("makes the ball meet the flippers in the shipped replays: at some moment the ball is elsewhere than without the flipper inputs", () => {
    for (const n of ["launch-and-flip", "flipper-hammering"]) {
      const r = file(n);
      const plungeOnly = { ...r, inputs: r.inputs.filter((i) => i.action.startsWith("plunge")) };
      let apart = 0;
      for (let ticks = 250; ticks <= r.header.ticks; ticks += 250) {
        const upTo = (x: typeof r) => ({ header: { ...r.header, ticks }, inputs: x.inputs.filter((i) => i.tick < ticks) });
        const a = runReplay(upTo(r), allTables).game.table.world.balls[0]!;
        const b = runReplay(upTo(plungeOnly), allTables).game.table.world.balls[0]!;
        apart = Math.max(apart, Math.hypot(a.x - b.x, a.y - b.y));
      }
      expect(apart, n).toBeGreaterThan(0.01);
    }
  });

  it("rejects an unknown table", () => {
    expect(() => runReplay(replay({ tableId: "nope" }), allTables)).toThrow(/unknown table "nope"/);
  });

  it("rejects an invalid replay instead of playing it", () => {
    expect(() => runReplay(replay({ dt: 0.002 }), allTables)).toThrow(/invalid replay.*dt/);
  });
});

describe("replay validation", () => {
  it("accepts the shipped replays", () => {
    for (const n of ["idle", "launch-and-flip", "flipper-hammering"]) expect(validateReplay(file(n))).toEqual([]);
  });

  it("reports every problem, not just the first", () => {
    const bad = { header: { format: 2, tableId: "", dt: 1, seed: 1.5, ticks: -1 }, inputs: [] };
    expect(validateReplay(bad)).toHaveLength(5);
  });

  it("rejects an unknown action, a non-ascending tick and a tick past the end", () => {
    const e = validateReplay(replay({ ticks: 10 }, [
      { tick: 5, action: "left_down" },
      { tick: 3, action: "right_down" },
      { tick: 4, action: "jump" as never },
      { tick: 10, action: "left_up" },
    ]));
    expect(e.join("\n")).toMatch(/inputs\[1\].*before the previous/);
    expect(e.join("\n")).toMatch(/inputs\[2\].*"jump" is unknown/);
    expect(e.join("\n")).toMatch(/inputs\[3\].*not before header.ticks/);
  });

  it("rejects things that are not replays", () => {
    expect(validateReplay(null)).toEqual(["replay is not an object"]);
    expect(validateReplay({})).toEqual(["header is missing"]);
    expect(validateReplay({ header: replay().header, inputs: 3 })).toEqual(["inputs must be an array"]);
  });
});
