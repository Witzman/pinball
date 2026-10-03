import { describe, expect, it } from "vitest";
import { loadTable } from "../../src/table/load";
import { validateTable } from "../../src/table/validate";
import { advance, createGame, kickTrigger } from "../../src/sim/game";
import { demoTable } from "../../src/tables/demo";
import type { TableDef, TriggerDef } from "../../src/table/schema";

function withTriggers(triggers: TriggerDef[]): TableDef {
  const def: TableDef = structuredClone(demoTable);
  def.triggers = triggers;
  return def;
}

const sinkhole: TriggerDef = { id: "saucer", at: [200, 700], r: 8, switch: "saucer_sw", hold: { kickDeg: -90, kickSpeed: 2 } };
const lane: TriggerDef = { id: "lane1", at: [150, 600], r: 10, switch: "lane1_sw" };

describe("triggers in table data", () => {
  it("loads triggers in metres, with a unit kick vector from degrees", () => {
    const t = loadTable(withTriggers([sinkhole, lane]));
    expect(t.triggerIds).toEqual(["saucer", "lane1"]);
    const s = t.world.triggers[0]!;
    expect(s.x).toBeCloseTo(0.2, 12);
    expect(s.y).toBeCloseTo(0.7, 12);
    expect(s.r).toBeCloseTo(0.008, 12);
    expect(s.hold).toBe(true);
    expect(s.kickx).toBeCloseTo(0, 12);
    expect(s.kicky).toBeCloseTo(-1, 12);
    expect(s.kickSpeed).toBe(2);
    expect(s.sw).toBe(t.switchNames.indexOf("saucer_sw") + 1);
    expect(t.world.triggers[1]!.hold).toBe(false);
  });

  it("works without triggers (the field is optional)", () => {
    expect(loadTable(demoTable).world.triggers).toEqual([]);
    expect(loadTable(demoTable).triggerIds).toEqual([]);
  });

  it("maps zones to a mask", () => {
    expect(loadTable(withTriggers([{ ...lane, zones: [1, 2] }])).world.triggers[0]!.zoneMask).toBe(0b110);
  });
});

describe("trigger validation", () => {
  it("accepts a sinkhole and a lane", () => {
    expect(validateTable(withTriggers([sinkhole, lane]))).toEqual([]);
  });

  it("lets a shot name a trigger switch", () => {
    const def = withTriggers([lane]);
    def.shots = { lane: ["lane1_sw"] };
    expect(validateTable(def)).toEqual([]);
  });

  it("rejects duplicate ids, empty ids, bad radii, positions outside the table and missing switches", () => {
    expect(validateTable(withTriggers([lane, { ...lane, switch: "other" }])).join("\n")).toMatch(/trigger "lane1" is used by 2 definitions/);
    expect(validateTable(withTriggers([{ ...lane, id: "" }])).join("\n")).toMatch(/id must not be empty/);
    expect(validateTable(withTriggers([{ ...lane, r: 0 }])).join("\n")).toMatch(/radius must be positive/);
    expect(validateTable(withTriggers([{ ...lane, at: [-100, 600] }])).join("\n")).toMatch(/outside the playfield/);
    expect(validateTable(withTriggers([{ ...lane, switch: "" }])).join("\n")).toMatch(/needs a switch name/);
    expect(validateTable(withTriggers([{ ...lane, zones: [99] }])).join("\n")).toMatch(/zone 99/);
  });

  it("rejects a sinkhole with no kick speed, a bad angle, or wider than the ball", () => {
    const bad = (hold: NonNullable<TriggerDef["hold"]>, r = 8) => validateTable(withTriggers([{ ...sinkhole, r, hold }])).join("\n");
    expect(bad({ kickDeg: -90, kickSpeed: 0 })).toMatch(/kickSpeed must be positive/);
    expect(bad({ kickDeg: Number.NaN, kickSpeed: 2 })).toMatch(/kickDeg must be a number/);
    expect(bad({ kickDeg: -90, kickSpeed: 2 }, 20)).toMatch(/must not be wider than the ball/);
  });

  it("applies the shared-switch rule to trigger switches", () => {
    const e = validateTable(withTriggers([lane, { ...lane, id: "lane2" }])).join("\n");
    expect(e).toMatch(/switch "lane1_sw" is used by 2 colliders/);
    expect(validateTable(withTriggers([{ ...lane, shared: true }, { ...lane, id: "lane2", shared: true }]))).toEqual([]);
  });
});

describe("kicking a sinkhole from the game", () => {
  function gameWithBallInSinkhole() {
    const g = createGame(withTriggers([{ id: "saucer", at: [250, 500], r: 8, switch: "saucer_sw", hold: { kickDeg: -90, kickSpeed: 2 } }]));
    const b = g.table.world.balls[0]!;
    b.x = 0.2;
    b.y = 0.5;
    b.vx = 1;
    b.vy = 0;
    g.table.world.gravity = 0;
    return { g, b };
  }

  it("holds the ball until the rules kick it out", () => {
    const { g, b } = gameWithBallInSinkhole();
    for (let i = 0; i < 20; i++) advance(g, 49);
    expect([b.x, b.y, b.hold]).toEqual([0.25, 0.5, 1]);
    expect(kickTrigger(g, "saucer")).toBe(true);
    expect(b.hold).toBe(0);
    advance(g, 49);
    expect(b.y).toBeLessThan(0.5);
    expect(kickTrigger(g, "saucer")).toBe(false); // nothing held any more
  });

  it("throws on an unknown trigger id", () => {
    const { g } = gameWithBallInSinkhole();
    expect(() => kickTrigger(g, "nope")).toThrow(/unknown trigger "nope"/);
  });
});
