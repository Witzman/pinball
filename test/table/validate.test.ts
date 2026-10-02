import { describe, expect, it } from "vitest";
import { validateTable } from "../../src/table/validate";
import type { TableDef } from "../../src/table/schema";
import { demoTable } from "../../src/tables/demo";
import { allTables } from "../../src/tables";

function patched(patch: (t: TableDef) => void): TableDef {
  const t = structuredClone(demoTable);
  patch(t);
  return t;
}

describe("validateTable", () => {
  it("accepts the demo table", () => {
    expect(validateTable(demoTable)).toEqual([]);
  });

  it("accepts every registered table", () => {
    expect(allTables.length).toBeGreaterThan(0);
    for (const t of allTables) expect(validateTable(t), t.id).toEqual([]);
  });

  it("rejects a wall that names an unknown material", () => {
    const t = patched((x) => void (x.walls[0]!.material = "glass"));
    expect(validateTable(t).join("\n")).toMatch(/material "glass"/);
  });

  it("rejects a zero-length segment", () => {
    const t = patched((x) => x.walls.push({ type: "segment", a: [100, 100], b: [100, 100], material: "rubber" }));
    expect(validateTable(t).join("\n")).toMatch(/zero length/);
  });

  it("rejects duplicate switch names", () => {
    const t = patched((x) => x.walls.push({ type: "segment", a: [10, 10], b: [20, 10], material: "rubber", switch: "target1" }));
    expect(validateTable(t).join("\n")).toMatch(/switch "target1" is used by 2 colliders/);
  });

  it("allows one switch on several colliders only when declared", () => {
    const t = patched((x) => x.walls.push({ type: "segment", a: [10, 10], b: [20, 10], material: "rubber", switch: "target1", shared: true }));
    const first = t.walls.find((w) => w.switch === "target1");
    if (first) first.shared = true;
    expect(validateTable(t)).toEqual([]);
  });

  it("rejects a shot that names an unknown switch", () => {
    const t = patched((x) => void (x.shots.bad = ["nope"]));
    expect(validateTable(t).join("\n")).toMatch(/shot "bad".*"nope"/);
  });

  it("rejects geometry outside the playfield", () => {
    const t = patched((x) => x.posts.push({ at: [9999, 10], r: 5, material: "rubber" }));
    expect(validateTable(t).join("\n")).toMatch(/outside the playfield/);
  });

  it("rejects an arc with a non-positive radius or fewer than 2 chords", () => {
    const a = patched((x) => x.walls.push({ type: "arc", c: [200, 200], r: 0, from: 0, to: 90, material: "rubber" }));
    expect(validateTable(a).join("\n")).toMatch(/radius/);
    const b = patched((x) => x.walls.push({ type: "arc", c: [200, 200], r: 50, from: 0, to: 90, chords: 1, material: "rubber" }));
    expect(validateTable(b).join("\n")).toMatch(/chords/);
  });

  it("rejects out-of-range material values and zone numbers", () => {
    const m = patched((x) => void (x.materials.rubber!.e = 1.5));
    expect(validateTable(m).join("\n")).toMatch(/restitution/);
    const z = patched((x) => void (x.walls[0]!.zones = [40]));
    expect(validateTable(z).join("\n")).toMatch(/zone/);
  });

  it("reports every problem, not only the first", () => {
    const t = patched((x) => {
      x.walls[0]!.material = "glass";
      x.shots.bad = ["nope"];
    });
    expect(validateTable(t).length).toBeGreaterThanOrEqual(2);
  });

  describe("flippers", () => {
    it("rejects a duplicate flipper id", () => {
      const t = patched((x) => x.flippers.push({ ...x.flippers[0]! }));
      expect(validateTable(t).join("\n")).toMatch(/flipper "left".*(twice|duplicate|more than once|used by)/i);
    });

    it("rejects an unknown material", () => {
      const t = patched((x) => void (x.flippers[0]!.material = "glass"));
      expect(validateTable(t).join("\n")).toMatch(/flipper "left".*material "glass"/);
    });

    it("rejects a flipper whose end radii leave no straight side", () => {
      const t = patched((x) => void ((x.flippers[0]!.length = 10), (x.flippers[0]!.rBase = 14), (x.flippers[0]!.rTip = 2)));
      expect(validateTable(t).join("\n")).toMatch(/flipper "left".*length/);
    });

    it("rejects equal rest and active angles", () => {
      const t = patched((x) => void (x.flippers[0]!.activeDeg = x.flippers[0]!.restDeg));
      expect(validateTable(t).join("\n")).toMatch(/flipper "left".*angle/);
    });

    it("rejects a swing so fast the tip would skip past a ball in one tick", () => {
      const t = patched((x) => void ((x.flippers[0]!.upMs = 1), (x.flippers[0]!.downMs = 1)));
      expect(validateTable(t).join("\n")).toMatch(/flipper "left".*(fast|speed)/);
    });

    it("rejects a pivot outside the playfield", () => {
      const t = patched((x) => void (x.flippers[0]!.pivot = [9999, 10]));
      expect(validateTable(t).join("\n")).toMatch(/flipper "left".*outside the playfield/);
    });
  });

  describe("plunger", () => {
    const withPlunger = (patch: (p: NonNullable<TableDef["plunger"]>) => void) => patched((x) => patch(x.plunger!));

    it("rejects an unknown material", () => {
      expect(validateTable(withPlunger((p) => void (p.material = "glass"))).join("\n")).toMatch(/plunger.*material "glass"/);
    });

    it("rejects non-positive size and speeds", () => {
      for (const field of ["width", "stroke", "maxSpeed", "pullSpeed"] as const) {
        const t = withPlunger((p) => void (p[field] = 0));
        expect(validateTable(t).join("\n"), field).toMatch(new RegExp(`plunger.*${field}`));
      }
    });

    it("rejects a release so fast the face could skip past a ball in one tick", () => {
      const t = withPlunger((p) => void (p.maxSpeed = 40));
      expect(validateTable(t).join("\n")).toMatch(/plunger.*(fast|speed)/);
    });

    it("rejects a plunger outside the playfield", () => {
      const t = withPlunger((p) => void (p.at = [9999, 10]));
      expect(validateTable(t).join("\n")).toMatch(/plunger.*outside the playfield/);
    });

    it("accepts a table without a plunger", () => {
      const t = patched((x) => void delete x.plunger);
      expect(validateTable(t)).toEqual([]);
    });
  });
});
