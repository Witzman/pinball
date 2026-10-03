import { describe, expect, it } from "vitest";
import { loadTable } from "../../src/table/load";
import { validateTable } from "../../src/table/validate";
import { step } from "../../src/core/step";
import { CONTACT_GATE_AB } from "../../src/core/types";
import { demoTable } from "../../src/tables/demo";
import type { GateDef, TableDef } from "../../src/table/schema";

function withGates(gates: NonNullable<TableDef["gates"]>, walls: TableDef["walls"] = []): TableDef {
  const def: TableDef = structuredClone(demoTable);
  def.walls = walls;
  delete def.sounds; // the demo's sound classes name switches of walls this test throws away
  def.posts = [];
  def.shots = {};
  def.plunger = undefined;
  def.flippers = [];
  def.gates = gates;
  return def;
}

describe("gates in table data", () => {
  it("loads a gate in metres with its zones and switch id", () => {
    const t = loadTable(withGates([{ a: [100, 500], b: [300, 500], zoneA: 0, zoneB: 2, switch: "ramp_enter" }]));
    const g = t.world.gates[0]!;
    expect([g.ax, g.ay, g.bx, g.by]).toEqual([0.1, 0.5, 0.3, 0.5]);
    expect([g.zoneA, g.zoneB]).toEqual([0, 2]);
    expect(g.sw).toBe(t.switchNames.indexOf("ramp_enter") + 1);
  });

  it("works without any gates (the field is optional)", () => {
    const def = structuredClone(demoTable);
    delete def.gates;
    expect(loadTable(def).world.gates).toEqual([]);
  });

  it("lets a shot name a gate switch", () => {
    const def = withGates([{ a: [100, 500], b: [300, 500], zoneA: 0, zoneB: 1, switch: "ramp_enter" }]);
    def.shots = { ramp: ["ramp_enter"] };
    expect(validateTable(def)).toEqual([]);
  });

  it("changes a ball's zone and reports the crossing when the table is played", () => {
    const t = loadTable(withGates([{ a: [100, 500], b: [300, 500], zoneA: 0, zoneB: 1, switch: "ramp_enter" }]));
    t.world.gravity = 0;
    t.world.balls.push({ x: 0.2, y: 0.55, vx: 0, vy: -1, w: 0, r: t.ballRadius, m: t.ballMass, zone: 0, hold: 0 });
    const events: number[] = [];
    for (let i = 0; i < 100; i++) {
      step(t.world);
      for (let c = 0; c < t.world.contacts.n; c++) events.push(t.world.contacts.kind[c]!);
    }
    expect(t.world.balls[0]!.zone).toBe(1);
    expect(events).toEqual([CONTACT_GATE_AB]);
  });

  it("carries oneWay from a wall to its colliders", () => {
    const t = loadTable(withGates([], [{ type: "polyline", points: [[100, 300], [200, 300], [300, 320]], material: "metal", oneWay: true }, { type: "segment", a: [100, 100], b: [200, 100], material: "metal" }]));
    expect(t.world.segments.map((s) => s.oneWay === true)).toEqual([true, true, false]);
  });
});

describe("gate validation", () => {
  const ok: GateDef = { a: [100, 500], b: [300, 500], zoneA: 0, zoneB: 1 };
  const gate = (over: Partial<GateDef>) => withGates([{ ...ok, ...over }]);

  it("accepts a good gate", () => {
    expect(validateTable(gate({}))).toEqual([]);
  });

  it("rejects a gate outside the playfield, of zero length, or with equal zones", () => {
    expect(validateTable(gate({ a: [-100, 500] })).join("\n")).toMatch(/gate #0: outside the playfield/);
    expect(validateTable(gate({ b: [100, 500] })).join("\n")).toMatch(/gate #0: zero length/);
    expect(validateTable(gate({ zoneB: 0 })).join("\n")).toMatch(/gate #0: both sides are zone 0/);
  });

  it("rejects zones that are not integers 0..30", () => {
    expect(validateTable(gate({ zoneB: 31 })).join("\n")).toMatch(/gate #0: zone 31/);
    expect(validateTable(gate({ zoneB: 1.5 })).join("\n")).toMatch(/gate #0: zone 1.5/);
  });

  it("rejects a gate switch that another collider also uses unless both are shared", () => {
    const def = withGates([{ ...ok, switch: "x" }], [{ type: "segment", a: [10, 10], b: [100, 10], material: "metal", switch: "x" }]);
    expect(validateTable(def).join("\n")).toMatch(/switch "x" is used by 2 colliders/);
  });
});
