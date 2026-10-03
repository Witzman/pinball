import { describe, expect, it } from "vitest";
import { loadTable } from "../../src/table/load";
import { validateTable } from "../../src/table/validate";
import { advance, createGame, setMagnet } from "../../src/sim/game";
import { demoTable } from "../../src/tables/demo";
import type { MagnetDef, TableDef } from "../../src/table/schema";

function withMagnets(magnets: MagnetDef[]): TableDef {
  const def: TableDef = structuredClone(demoTable);
  def.magnets = magnets;
  return def;
}

const magnet: MagnetDef = { id: "mag1", at: [250, 500], r: 50, strength: 8 };

describe("magnets in table data", () => {
  it("loads a magnet in metres, off, with its id and zone mask", () => {
    const t = loadTable(withMagnets([{ ...magnet, zones: [0, 1] }]));
    const m = t.world.magnets[0]!;
    expect(m.x).toBeCloseTo(0.25, 12);
    expect(m.y).toBeCloseTo(0.5, 12);
    expect(m.r).toBeCloseTo(0.05, 12);
    expect([m.strength, m.zoneMask, m.on]).toEqual([8, 0b11, false]);
    expect(t.magnetIds).toEqual(["mag1"]);
  });

  it("works without magnets", () => {
    expect(loadTable(demoTable).world.magnets).toEqual([]);
    expect(loadTable(demoTable).magnetIds).toEqual([]);
  });
});

describe("magnet validation", () => {
  it("accepts a magnet", () => {
    expect(validateTable(withMagnets([magnet]))).toEqual([]);
  });

  it("rejects duplicate or empty ids, bad radius or strength, a pull above the limit, and a position outside", () => {
    const e = (m: MagnetDef[]) => validateTable(withMagnets(m)).join("\n");
    expect(e([magnet, { ...magnet }])).toMatch(/magnet "mag1" is used by 2 definitions/);
    expect(e([{ ...magnet, id: "" }])).toMatch(/id must not be empty/);
    expect(e([{ ...magnet, r: 0 }])).toMatch(/radius must be positive/);
    expect(e([{ ...magnet, strength: 0 }])).toMatch(/strength must be positive/);
    expect(e([{ ...magnet, strength: 500 }])).toMatch(/strength 500 m\/s\^2 is above 20/);
    expect(e([{ ...magnet, at: [-100, 500] }])).toMatch(/outside the playfield/);
    expect(e([{ ...magnet, zones: [40] }])).toMatch(/zone 40/);
  });
});

describe("switching a magnet from the game", () => {
  it("pulls only while on", () => {
    const g = createGame(withMagnets([magnet]));
    const b = g.table.world.balls[0]!;
    g.table.world.gravity = 0;
    b.x = 0.25;
    b.y = 0.53;
    b.vx = 0;
    b.vy = 0;
    advance(g, 30);
    expect(b.vy).toBe(0);
    setMagnet(g, "mag1", true);
    advance(g, 30);
    expect(b.vy).toBeLessThan(0);
    setMagnet(g, "mag1", false);
    const vy = b.vy;
    advance(g, 30);
    expect(b.vy).toBe(vy);
  });

  it("throws on an unknown id", () => {
    expect(() => setMagnet(createGame(withMagnets([magnet])), "nope", true)).toThrow(/unknown magnet "nope"/);
  });
});
