import { describe, expect, it } from "vitest";
import { loadTable } from "../../src/table/load";
import type { TableDef } from "../../src/table/schema";
import { validateTable } from "../../src/table/validate";
import { demoTable } from "../../src/tables/demo";

function patched(patch: (t: TableDef) => void): TableDef {
  const t = structuredClone(demoTable);
  patch(t);
  return t;
}
const problems = (t: TableDef) => validateTable(t).join("\n");

describe("visual heights and ramps", () => {
  it("are optional: a table without them loads with no heights and no ramps", () => {
    const t = loadTable(patched((x) => void delete x.visual));
    expect(t.heights).toEqual([]);
    expect(t.ramps).toEqual([]);
  });

  it("load into metres", () => {
    const t = loadTable(demoTable);
    expect(t.heights).toEqual([0, 0.03]);
    expect(t.ramps).toEqual([{ zone: 1, width: 0.06, path: [{ x: 0.07, y: 0.6 }, { x: 0.07, y: 0.3 }], heights: [0, 0.048] }]);
  });

  it("reject a playfield that is not at height 0", () => {
    expect(problems(patched((x) => void (x.visual!.heights = [5, 30])))).toMatch(/zone 0 \(the playfield\) must be 0/);
  });

  it("reject more heights than there are zones", () => {
    expect(problems(patched((x) => void (x.visual!.heights = Array.from({ length: 32 }, () => 0))))).toMatch(/at most 31 heights/);
    expect(problems(patched((x) => void (x.visual!.heights = Array.from({ length: 31 }, () => 0))))).toBe("");
  });

  it("reject a negative or non-finite height", () => {
    expect(problems(patched((x) => void (x.visual!.heights = [0, -1])))).toMatch(/height of zone 1/);
    expect(problems(patched((x) => void (x.visual!.heights = [0, NaN])))).toMatch(/height of zone 1/);
  });

  it("reject a ramp in zone 0, in a zone without a height, with a short path, outside the playfield or too wide", () => {
    const ramp = (patch: (r: NonNullable<TableDef["visual"]>["ramps"] extends (infer R)[] | undefined ? R : never) => void) =>
      problems(patched((x) => patch(x.visual!.ramps![0]!)));
    expect(ramp((r) => void (r.zone = 0))).toMatch(/zone 0 is the playfield/);
    expect(ramp((r) => void (r.zone = 2))).toMatch(/zone 2 has no height/);
    expect(ramp((r) => void (r.path = [[70, 600]]))).toMatch(/at least 2 path points/);
    expect(ramp((r) => void (r.path = [[70, 600], [-100, 300]]))).toMatch(/outside the playfield/);
    expect(ramp((r) => void (r.width = 0))).toMatch(/width must be positive/);
    expect(ramp((r) => void (r.width = 9999))).toMatch(/fit the playfield/);
  });

  it("give a ramp without a height profile the height of its zone at every point, and a ramp with one its own", () => {
    const flat = loadTable(patched((x) => void delete x.visual!.ramps![0]!.heights));
    expect(flat.ramps[0]!.heights).toEqual([0.03, 0.03]);
    expect(loadTable(demoTable).ramps[0]!.heights).toEqual([0, 0.048]);
  });

  it("reject a height profile that does not have one value for each path point, or a value that is negative or not a number", () => {
    const heights = (h: number[]) => problems(patched((x) => void (x.visual!.ramps![0]!.heights = h)));
    expect(heights([0])).toMatch(/one value for each of the 2 path points/);
    expect(heights([0, 10, 20])).toMatch(/one value for each of the 2 path points/);
    expect(heights([0, -1])).toMatch(/every height must be a number >= 0/);
    expect(heights([0, NaN])).toMatch(/every height must be a number >= 0/);
    expect(heights([0, 48])).toBe("");
  });
});
