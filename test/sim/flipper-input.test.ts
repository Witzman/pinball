import { describe, expect, it } from "vitest";
import { advance, createGame, nudge, takeAudio, tick } from "../../src/sim/game";
import type { Game } from "../../src/sim/game";
import { loadTable } from "../../src/table/load";
import type { FlipperDef, TableDef } from "../../src/table/schema";
import { validateTable } from "../../src/table/validate";
import { demoTable } from "../../src/tables/demo";

const upper = (over: Partial<FlipperDef> = {}): FlipperDef => ({
  id: "upperLeft", pivot: [60, 520], length: 58, rBase: 9.5, rTip: 5, restDeg: 30, activeDeg: -30, upMs: 40, downMs: 100, material: "rubber", ...over,
});

function withUpper(over: Partial<FlipperDef> = {}): TableDef {
  const t = structuredClone(demoTable);
  t.flippers.push(upper(over));
  return t;
}

const ticks = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) tick(g);
};
const u = (g: Game, id: string) => g.table.world.flippers[g.table.flipperIds.indexOf(id)]!.u;

describe("which button swings a flipper (#51)", () => {
  it("keeps left and right as they were, and gives any other id no button unless the table names one", () => {
    expect(loadTable(demoTable).flipperInputs).toEqual(["left", "right"]);
    expect(loadTable(withUpper()).flipperInputs).toEqual(["left", "right", null]);
    expect(loadTable(withUpper({ input: "left" })).flipperInputs).toEqual(["left", "right", "left"]);
    expect(loadTable(withUpper({ input: "right" })).flipperInputs).toEqual(["left", "right", "right"]);
  });

  it("validates the input: left or right only", () => {
    expect(validateTable(withUpper({ input: "left" }))).toEqual([]);
    expect(validateTable(withUpper())).toEqual([]);
    expect(validateTable(withUpper({ input: "middle" as "left" })).join("\n")).toMatch(/flipper "upperLeft": input must be "left" or "right"/);
  });

  it("swings an upper flipper that follows the left button with the left button, and not with the right one", () => {
    const g = createGame(withUpper({ input: "left" }));
    g.input.right = true;
    ticks(g, 100);
    expect(u(g, "upperLeft")).toBe(0);
    expect(u(g, "right")).toBe(1);
    g.input.right = false;
    g.input.left = true;
    ticks(g, 100);
    expect(u(g, "upperLeft")).toBe(1);
    expect(u(g, "left")).toBe(1);
    g.input.left = false;
    ticks(g, 300);
    expect(u(g, "upperLeft")).toBe(0); // and back down
  });

  it("follows the right button when the table says so", () => {
    const g = createGame(withUpper({ input: "right" }));
    g.input.left = true;
    ticks(g, 100);
    expect(u(g, "upperLeft")).toBe(0);
    g.input.right = true;
    ticks(g, 100);
    expect(u(g, "upperLeft")).toBe(1);
  });

  it("never moves a flipper that follows no button, whatever is pressed", () => {
    const g = createGame(withUpper());
    g.input.left = true;
    g.input.right = true;
    ticks(g, 200);
    expect(u(g, "upperLeft")).toBe(0);
    expect(g.table.world.flippers[2]!.on).toBe(false);
  });

  it("switches an upper flipper off with the others when the ball is tilted", () => {
    const flow = { ballsPerGame: 3, startCost: 0, startCredits: 0, overTicks: 100, saverTicks: 0, bonusTicks: 5, extraBallMax: 0, tilt: { free: 0, warnings: 0, decayTicks: 2000 } };
    const g = createGame(withUpper({ input: "left" }), { flow });
    g.input.start = true;
    advance(g, 5);
    g.input.start = false;
    advance(g, 5);
    g.table.world.gravity = 0;
    g.input.left = true;
    ticks(g, 100);
    expect(u(g, "upperLeft")).toBe(1);
    expect(nudge(g, "left")).toBe(true);
    ticks(g, 400);
    expect(g.rules.state.game!.tilted).toBe(true);
    expect(u(g, "upperLeft")).toBe(0);
    expect(u(g, "left")).toBe(0);
  });

  it("gives the sound layer a flip event for each flipper that swings, by the button that moved it", () => {
    const g = createGame(withUpper({ input: "left" }));
    g.input.left = true;
    ticks(g, 3);
    g.input.left = false;
    ticks(g, 3);
    const flips = takeAudio(g).events.filter((e) => e.a === "flip");
    expect(flips).toEqual([
      { a: "flip", side: "L", up: true }, { a: "flip", side: "L", up: true },
      { a: "flip", side: "L", up: false }, { a: "flip", side: "L", up: false },
    ]);
    const quiet = createGame(withUpper());
    quiet.input.left = true;
    ticks(quiet, 3);
    expect(takeAudio(quiet).events.filter((e) => e.a === "flip")).toHaveLength(1); // only the left flipper
  });

  it("shows the upper flipper in the snapshot as held or not", () => {
    const g = createGame(withUpper({ input: "left" }));
    g.input.left = true;
    ticks(g, 2);
    expect(g.table.world.flippers.map((f) => f.on)).toEqual([true, false, true]);
  });
});
