import { describe, expect, it } from "vitest";
import { loadTable } from "../../src/table/load";
import type { KickDef, TableDef } from "../../src/table/schema";
import { validateTable } from "../../src/table/validate";
import { demoTable } from "../../src/tables/demo";

function withKick(patch: (t: TableDef) => void): TableDef {
  const t = structuredClone(demoTable);
  patch(t);
  return t;
}
const problems = (t: TableDef) => validateTable(t).join("\n");
const kick: KickDef = { speed: 1.6, minHit: 0.4, cooldownMs: 40 };

describe("kickers in table data", () => {
  it("load as colliders with a kick in m/s, a minimum, a cooldown in ticks and an index", () => {
    const t = loadTable(withKick((x) => {
      x.walls.push({ type: "segment", a: [100, 100], b: [200, 100], material: "rubber", switch: "slingA", kick });
      x.posts.push({ at: [300, 300], r: 20, material: "rubber", switch: "bumperA", kick: { speed: 2 } });
    }));
    const seg = t.world.segments.at(-1)!;
    expect(seg).toMatchObject({ kick: 1.6, kickMin: 0.4, kickCd: 40, kid: 0 });
    const post = t.world.circles.at(-1)!;
    expect(post).toMatchObject({ kick: 2, kickMin: 0.3, kickCd: 30, kid: 1 }); // the defaults, the next index
    expect(t.world.kickWait).toEqual(new Int32Array(2));
  });

  it("share one cooldown over the chords of a polyline or an arc", () => {
    const t = loadTable(withKick((x) => {
      x.walls.push({ type: "polyline", points: [[100, 100], [200, 100], [200, 200]], material: "rubber", kick });
      x.walls.push({ type: "arc", c: [260, 600], r: 50, from: 0, to: 90, chords: 6, material: "rubber", kick });
    }));
    const kicking = t.world.segments.filter((s) => s.kick !== undefined);
    expect(kicking).toHaveLength(2 + 6);
    expect(new Set(kicking.map((s) => s.kid))).toEqual(new Set([0, 1]));
    expect(kicking.slice(0, 2).map((s) => s.kid)).toEqual([0, 0]);
    expect(kicking.slice(2).every((s) => s.kid === 1)).toBe(true);
    expect(t.world.kickWait.length).toBe(2);
  });

  it("leave a table without kickers exactly as it was: no kick fields on any collider, an empty cooldown list", () => {
    const t = loadTable(withKick((x) => void x.walls.push({ type: "segment", a: [100, 100], b: [200, 100], material: "rubber" })));
    for (const c of [...t.world.segments, ...t.world.circles]) {
      for (const f of ["kick", "kickMin", "kickCd", "kid"]) expect(c, f).not.toHaveProperty(f);
    }
    expect(t.world.kickWait.length).toBe(0);
  });
});

describe("kicker validation", () => {
  const post = (k: Partial<KickDef> & { speed?: number }): TableDef => withKick((x) => void x.posts.push({ at: [300, 300], r: 20, material: "rubber", kick: { speed: 2, ...k } }));
  const wall = (k: KickDef): TableDef => withKick((x) => void x.walls.push({ type: "segment", a: [100, 100], b: [200, 100], material: "rubber", kick: k }));

  it("accepts sane kickers on walls and posts", () => {
    expect(problems(post({}))).toBe("");
    expect(problems(wall(kick))).toBe("");
    expect(problems(post({ speed: 6, minHit: 6, cooldownMs: 1000 }))).toBe("");
    expect(problems(post({ minHit: 0.1, cooldownMs: 1 }))).toBe("");
  });

  it("rejects a kick speed that is not a number above 0 and at most 6 m/s", () => {
    for (const speed of [0, -1, NaN, Infinity, 6.01, 20]) expect(problems(post({ speed })), String(speed)).toMatch(/kick speed/);
  });

  it("rejects a minimum hit speed below 0.1 (the rest speed is 0.05), above the kick speed, or not a number", () => {
    for (const minHit of [0, 0.05, -1, NaN]) expect(problems(post({ minHit })), String(minHit)).toMatch(/minHit/);
    expect(problems(post({ speed: 1, minHit: 1.5 }))).toMatch(/minHit/);
  });

  it("rejects a cooldown that is not a whole number of ms from 1 to 1000", () => {
    for (const cooldownMs of [0, 1.5, -5, 1001, NaN]) expect(problems(post({ cooldownMs })), String(cooldownMs)).toMatch(/cooldownMs/);
  });

  it("says where the bad kicker is", () => {
    expect(problems(wall({ speed: 0 }))).toMatch(/wall #\d+ \(segment\): kick speed/);
    expect(problems(post({ speed: 0 }))).toMatch(/post #\d+: kick speed/);
  });
});
