import { describe, expect, it } from "vitest";
import { LINT, lintTable } from "../../src/table/lint";
import { validateTable } from "../../src/table/validate";
import type { FlipperDef, TableDef } from "../../src/table/schema";
import { colonyTable } from "../../src/tables/colony";
import { demoTable } from "../../src/tables/demo";
import { restGrid } from "../helpers/rest-grid";

/** A clean, valid table: a box with nothing in it; each test adds the one thing that should trip its rule. */
function base(extra: Partial<TableDef> = {}): TableDef {
  return {
    id: "lint",
    name: "Lint",
    playfield: { width: 520, length: 1050, slopeDeg: 6.5 },
    ball: { radius: 13.5, mass: 80 },
    materials: { metal: { e: 0.4, mu: 0.1 }, rubber: { e: 0.6, mu: 0.3 } },
    walls: [{ type: "polyline", points: [[5, 1045], [5, 5], [515, 5], [515, 1045]], material: "metal" }],
    posts: [],
    flippers: [],
    shots: {},
    ...extra,
  };
}

const flip = (id: string, pivot: [number, number], restDeg: number, activeDeg: number): FlipperDef => ({ id, pivot, length: 58, rBase: 9.5, rTip: 5, restDeg, activeDeg, upMs: 40, downMs: 100, material: "rubber" });

/** The lint lines of a table that is valid, restricted to one rule. */
function findings(t: TableDef, rule: string): string[] {
  expect(validateTable(t)).toEqual([]);
  return lintTable(t).filter((l) => l.includes(`: ${rule}:`));
}

describe("the layout lint", () => {
  it("finds nothing in an empty box", () => {
    expect(lintTable(base())).toEqual([]);
  });

  it("keeps every number in LINT", () => {
    expect(Object.keys(LINT).sort()).toEqual(["feedReach", "feedSteeper", "flipperRaisedGap", "flipperRestGap", "gapMargin", "joined", "laneMax", "laneMin", "laneWidth", "sinkholeClearance", "sinkholeKickRoom", "slingBelow", "slingDown"]);
  });

  describe("sinkholes", () => {
    const hole = (at: [number, number], kickDeg: number): Partial<TableDef> => ({ triggers: [{ id: "h", at, r: 8, switch: "h", hold: { kickDeg, kickSpeed: 1 } }] });

    it("accepts a sinkhole in the open that kicks into free space", () => {
      expect(lintTable(base(hole([260, 500], -90)))).toEqual([]);
    });

    it("trips on a sinkhole with a wall closer than the ball rim plus clearance", () => {
      expect(findings(base(hole([20, 500], -90)), "sinkhole-clearance")).toHaveLength(1); // the wall at x=5 is 15 mm away, needs 16.5
    });

    it("trips on a sinkhole that kicks into a wall", () => {
      expect(findings(base(hole([260, 40], -90)), "sinkhole-kick")).toHaveLength(1); // the top wall is 35 mm away, needs 60
      expect(findings(base(hole([260, 40], 90)), "sinkhole-kick")).toHaveLength(0);
    });

    it("trips on a sinkhole that kicks into a post", () => {
      expect(findings(base({ ...hole([260, 500], -90), posts: [{ at: [260, 460], r: 18, material: "rubber" }] }), "sinkhole-kick")).toHaveLength(1);
    });
  });

  describe("magnets", () => {
    it("trips on a magnet whose reach includes a wall, and not on one clear of it", () => {
      const m = (x: number): Partial<TableDef> => ({ magnets: [{ id: "m", at: [x, 500], r: 40, strength: 5 }] });
      expect(findings(base(m(30)), "magnet-reach")).toHaveLength(1);
      expect(findings(base(m(200)), "magnet-reach")).toHaveLength(0);
    });

    it("sees a wall in another zone as no problem", () => {
      const t = base({ walls: [...base().walls, { type: "segment", a: [250, 400], b: [250, 600], material: "metal", zones: [1] }], magnets: [{ id: "m", at: [260, 500], r: 40, strength: 5 }] });
      expect(findings(t, "magnet-reach")).toHaveLength(0);
    });
  });

  describe("gaps", () => {
    const wedge = (gap: number): Partial<TableDef> => ({
      // two walls that run side by side: one at x=200, one `gap` mm to its right, both 300 long; they diverge below: a wedge
      walls: [...base().walls, { type: "segment", a: [200, 300], b: [200, 600], material: "metal" }, { type: "segment", a: [200 + gap, 300], b: [320, 600], material: "metal" }],
    });

    it("trips on a wedge that narrows below a ball plus the margin", () => {
      expect(findings(base(wedge(20)), "gap").length).toBeGreaterThan(0);
    });

    it("trips on a passage only slightly wider than the ball", () => {
      const t = base({ walls: [...base().walls, { type: "segment", a: [200, 300], b: [200, 600], material: "metal" }, { type: "segment", a: [229, 300], b: [229, 600], material: "metal" }] });
      expect(findings(t, "gap")).toHaveLength(1); // 29 mm: a ball (27) squeezes through and jams
    });

    it("lets a passage of a ball plus the margin through", () => {
      const t = base({ walls: [...base().walls, { type: "segment", a: [200, 300], b: [200, 600], material: "metal" }, { type: "segment", a: [235, 300], b: [235, 600], material: "metal" }] });
      expect(findings(t, "gap")).toHaveLength(0);
    });

    it("leaves a slit no ball can enter alone", () => {
      const t = base({ walls: [...base().walls, { type: "segment", a: [200, 300], b: [200, 600], material: "metal" }, { type: "segment", a: [210, 300], b: [210, 600], material: "metal" }] });
      expect(findings(t, "gap")).toHaveLength(0);
    });

    it("does not compare walls that meet end to end, nor walls in different zones", () => {
      const joined = base({ walls: [...base().walls, { type: "polyline", points: [[100, 300], [100, 500]], material: "metal" }, { type: "polyline", points: [[100, 500], [120, 700]], material: "metal" }] });
      expect(findings(joined, "gap")).toHaveLength(0);
      const zones = base({ walls: [...base().walls, { type: "segment", a: [200, 300], b: [200, 600], material: "metal" }, { type: "segment", a: [229, 300], b: [229, 600], material: "metal", zones: [1] }] });
      expect(findings(zones, "gap")).toHaveLength(0);
    });

    it("trips on a post that sits too close to a wall", () => {
      const t = base({ posts: [{ at: [40, 500], r: 10, material: "rubber" }] }); // 35 mm from the wall at x=5, minus the radius: 25
      expect(findings(t, "gap")).toHaveLength(1);
    });

    it("trips on a flipper at rest too close to a wall", () => {
      const t = base({ flippers: [flip("left", [100, 900], 30, -30)], walls: [...base().walls, { type: "segment", a: [60, 700], b: [100, 1000], material: "metal" }] });
      expect(findings(t, "gap").length).toBeGreaterThan(0);
    });
  });

  describe("triggers", () => {
    it("trips on two overlapping triggers, not on two apart, not in different zones", () => {
      const tr = (x: number, zones?: number[]) => ({ id: `t${x}`, at: [x, 500] as [number, number], r: 10, switch: `s${x}`, ...(zones ? { zones } : {}) });
      expect(findings(base({ triggers: [tr(200), tr(215)] }), "trigger-overlap")).toHaveLength(1);
      expect(findings(base({ triggers: [tr(200), tr(230)] }), "trigger-overlap")).toHaveLength(0);
      expect(findings(base({ triggers: [tr(200), tr(215, [1])] }), "trigger-overlap")).toHaveLength(0);
    });
  });

  describe("the flipper pair", () => {
    it("accepts tips about two balls apart when raised and a bit more at rest", () => {
      // resting tips 3.3 balls apart, raised (to 10 degrees below horizontal, the other way up) 2.8
      const t = base({ flippers: [flip("left", [160, 900], 30, -10), flip("right", [360, 900], 150, 190)] });
      expect(findings(t, "flipper-gap")).toHaveLength(0);
    });

    it("trips when the tips are too far apart, at rest and raised", () => {
      const t = base({ flippers: [flip("left", [60, 900], 30, -30), flip("right", [460, 900], 150, 210)] });
      expect(findings(t, "flipper-gap")).toHaveLength(2);
    });

    it("trips when the raised tips leave less than a ball", () => {
      const t = base({ flippers: [flip("left", [200, 900], 30, 0), flip("right", [300, 900], 150, 180)] });
      expect(findings(t, "flipper-gap").length).toBeGreaterThan(0);
    });

    it("has nothing to say about a table with no flipper pair", () => {
      expect(findings(base({ flippers: [flip("upper", [100, 600], 30, -30)] }), "flipper-gap")).toHaveLength(0);
    });
  });

  describe("feed lanes", () => {
    const lane = (endY: number): TableDef => {
      // the left flipper rests at 30 degrees; its top edge starts at (pivot + 9.5 * (sin30, -cos30)) = (104.75, 891.8)
      const f = flip("left", [100, 900], 30, -30);
      return base({ flippers: [f], walls: [...base().walls, { type: "segment", a: [20, endY], b: [104.75, 891.8], material: "metal" }] });
    };

    it("accepts a lane about as steep as the flipper, and trips on one much steeper", () => {
      expect(findings(lane(838), "feed-lane")).toHaveLength(0); // about 32 degrees
      expect(findings(lane(700), "feed-lane")).toHaveLength(1); // about 66 degrees
    });
  });

  describe("slingshots", () => {
    const sling = (a: [number, number], b: [number, number]): TableDef => base({ walls: [...base().walls, { type: "segment", a, b, material: "rubber", kick: { speed: 1.6 } }] });

    it("accepts a left slingshot whose inner face looks up and in, trips on one that looks at the drain", () => {
      expect(findings(sling([110, 730], [130, 830]), "sling-normal")).toHaveLength(0);
      expect(findings(sling([130, 830], [110, 730]), "sling-normal")).toHaveLength(0); // the same wall drawn the other way
      expect(findings(sling([110, 830], [130, 730]), "sling-normal")).toHaveLength(1); // leaning the other way, its inner face looks down
    });

    it("leaves a kicker in the upper table alone", () => {
      expect(findings(sling([60, 260], [200, 300]), "sling-normal")).toHaveLength(0);
    });
  });

  describe("lanes", () => {
    const lane = (width: number): TableDef =>
      base({
        walls: [...base().walls, { type: "segment", a: [100, 600], b: [100, 900], material: "metal" }, { type: "segment", a: [100 + width, 600], b: [100 + width, 900], material: "metal" }],
        triggers: [{ id: "l", at: [100 + width / 2, 750], r: 8, switch: "l" }],
      });

    it("accepts a lane a ball plus a margin wide, trips on narrower and on wider", () => {
      expect(findings(lane(40), "lane-width")).toHaveLength(0);
      expect(findings(lane(29), "lane-width")).toHaveLength(1);
      expect(findings(lane(80), "lane-width")).toHaveLength(1);
    });

    it("leaves a trigger in open space alone", () => {
      expect(findings(lane(200), "lane-width")).toHaveLength(0);
    });
  });

  describe("the tables that ship", () => {
    it("lints the demo table to these findings only (each looked at, none changes how it plays)", () => {
      expect(lintTable(demoTable).map((l) => l.replace(/ -?\d+(\.\d+)? mm/g, " N mm"))).toEqual([
        'demo: gap: wall #0 and wall #4 come within N mm of each other and open to at least a ball (27 mm): a ball would jam there; keep at least N mm or join them', // the slit between the top wall and the top of the arc: nothing reaches it, the grid test drains every ball
        'demo: gap: wall #2 and flipper "left" come within N mm of each other and open to at least a ball (27 mm): a ball would jam there; keep at least N mm or join them', // the guide ends 5 mm short of the flipper's top edge: the grid test drains a ball on both
        'demo: gap: wall #3 and flipper "right" come within N mm of each other and open to at least a ball (27 mm): a ball would jam there; keep at least N mm or join them',
        "demo: flipper-gap: the flippers' raised tips are 3.93 balls apart, wanted 1 to 3", // the flippers swing symmetrically about the horizontal: raised tips are as far apart as at rest
      ]);
    });

    it("lints The Colony clean", () => {
      expect(lintTable(colonyTable)).toEqual([]);
    });
  });
});

describe("the generic no-resting-place grid", () => {
  /** A flat shelf a ball rests on for ever, in a box with a drain at the bottom. */
  const shelf = (): TableDef => base({ walls: [{ type: "polyline", points: [[5, 1000], [5, 5], [515, 5], [515, 1000]], material: "metal" }, { type: "segment", a: [100, 500], b: [300, 500], material: "metal" }] });

  it("finds the resting place on a flat shelf: balls dropped on it never drain", () => {
    expect(restGrid(shelf(), { x: [150, 250, 50], y: [470, 470, 1], ticks: 3000 })).not.toEqual([]);
  });

  it("finds nothing on a slanted shelf", () => {
    const t = shelf();
    t.walls[1] = { type: "segment", a: [100, 480], b: [300, 520], material: "metal" };
    expect(restGrid(t, { x: [150, 250, 50], y: [470, 470, 1], ticks: 12000 })).toEqual([]);
  });

  it("puts the table in a state first, with setup", () => {
    let calls = 0;
    restGrid(base(), { x: [100, 100, 1], y: [100, 100, 1], ticks: 5000, setup: () => void calls++ });
    expect(calls).toBe(1);
  });
});
