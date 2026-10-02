import { DT } from "../core/step";
import type { Point, TableDef } from "./schema";

const MAX_ZONE = 30;
/** Geometry may overhang the playfield box by this much (mm), e.g. a plunger lane wall. */
const MARGIN = 5;

/** Every problem found in a table, as readable lines. Empty means valid. */
export function validateTable(t: TableDef): string[] {
  const errs: string[] = [];
  const fail = (m: string) => errs.push(`${t.id}: ${m}`);

  if (!(t.playfield.width > 0 && t.playfield.length > 0)) fail("playfield size must be positive");
  if (!(t.ball.radius > 0 && t.ball.mass > 0)) fail("ball radius and mass must be positive");

  for (const [name, m] of Object.entries(t.materials)) {
    if (!(m.e >= 0 && m.e <= 1)) fail(`material "${name}": restitution ${m.e} is outside 0..1`);
    if (!(m.mu >= 0)) fail(`material "${name}": friction ${m.mu} must be >= 0`);
  }

  const inside = (p: Point) =>
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    p[0] >= -MARGIN &&
    p[0] <= t.playfield.width + MARGIN &&
    p[1] >= -MARGIN &&
    p[1] <= t.playfield.length + MARGIN;

  const users = new Map<string, { count: number; allShared: boolean }>();
  const useSwitch = (name: string | undefined, shared: boolean | undefined) => {
    if (name === undefined) return;
    if (name === "") fail("switch name must not be empty");
    const u = users.get(name) ?? { count: 0, allShared: true };
    u.count += 1;
    u.allShared = u.allShared && shared === true;
    users.set(name, u);
  };

  const checkZones = (where: string, zones: number[] | undefined) => {
    for (const z of zones ?? []) {
      if (!Number.isInteger(z) || z < 0 || z > MAX_ZONE) fail(`${where}: zone ${z} must be an integer 0..${MAX_ZONE}`);
    }
  };

  t.walls.forEach((w, i) => {
    const where = `wall #${i} (${w.type})`;
    if (!(w.material in t.materials)) fail(`${where}: material "${w.material}" is not defined`);
    checkZones(where, w.zones);
    useSwitch(w.switch, w.shared);
    if (w.type === "segment") {
      if (!inside(w.a) || !inside(w.b)) fail(`${where}: outside the playfield`);
      if (w.a[0] === w.b[0] && w.a[1] === w.b[1]) fail(`${where}: zero length`);
    } else if (w.type === "polyline") {
      if (w.points.length < 2) fail(`${where}: needs at least 2 points`);
      if (!w.points.every(inside)) fail(`${where}: outside the playfield`);
      for (let k = 1; k < w.points.length; k++) {
        const p = w.points[k - 1]!;
        const q = w.points[k]!;
        if (p[0] === q[0] && p[1] === q[1]) fail(`${where}: zero length between points ${k - 1} and ${k}`);
      }
    } else {
      if (!(w.r > 0)) fail(`${where}: radius must be positive`);
      if (w.from === w.to) fail(`${where}: from and to are equal`);
      if (w.chords !== undefined && !(Number.isInteger(w.chords) && w.chords >= 2)) fail(`${where}: chords must be an integer >= 2`);
      if (!inside(w.c)) fail(`${where}: centre outside the playfield`);
    }
  });

  t.posts.forEach((p, i) => {
    const where = `post #${i}`;
    if (!(p.material in t.materials)) fail(`${where}: material "${p.material}" is not defined`);
    if (!(p.r > 0)) fail(`${where}: radius must be positive`);
    if (!inside(p.at)) fail(`${where}: outside the playfield`);
    checkZones(where, p.zones);
    useSwitch(p.switch, p.shared);
  });

  const flipperIds = new Map<string, number>();
  for (const f of t.flippers) {
    const where = `flipper "${f.id}"`;
    flipperIds.set(f.id, (flipperIds.get(f.id) ?? 0) + 1);
    if (!(f.material in t.materials)) fail(`${where}: material "${f.material}" is not defined`);
    if (!(f.rBase > 0 && f.rTip > 0)) fail(`${where}: radii must be positive`);
    if (!(f.length > Math.abs(f.rBase - f.rTip))) fail(`${where}: length must exceed the difference of the end radii`);
    if (f.restDeg === f.activeDeg) fail(`${where}: rest and active angle are equal`);
    if (!(f.upMs > 0 && f.downMs > 0)) fail(`${where}: swing times must be positive`);
    if (!inside(f.pivot)) fail(`${where}: pivot outside the playfield`);
    // the tip must not move more than one ball radius per physics tick, or a ball
    // could be skipped; core/step.ts treats the flipper as static within a tick
    const swing = (Math.abs(f.activeDeg - f.restDeg) * Math.PI) / 180;
    const fastest = swing / (Math.min(f.upMs, f.downMs) / 1000);
    if ((fastest * (f.length + f.rTip) * DT) / 1 > t.ball.radius) fail(`${where}: swing too fast (tip moves more than one ball radius per tick)`);
  }
  for (const [id, n] of flipperIds) if (n > 1) fail(`flipper "${id}" is used by ${n} definitions; ids must be unique`);

  const pl = t.plunger;
  if (pl) {
    if (!(pl.material in t.materials)) fail(`plunger: material "${pl.material}" is not defined`);
    for (const field of ["width", "stroke", "maxSpeed", "pullSpeed"] as const) {
      if (!(pl[field] > 0)) fail(`plunger: ${field} must be positive`);
    }
    if (!inside(pl.at)) fail("plunger: outside the playfield");
    // metres per tick, against the ball radius in millimetres
    if (pl.maxSpeed * DT * 1000 > t.ball.radius) fail("plunger: release too fast (face moves more than one ball radius per tick)");
  }

  for (const [name, u] of users) {
    if (u.count > 1 && !u.allShared) fail(`switch "${name}" is used by ${u.count} colliders; mark all of them shared: true or rename`);
  }

  for (const [shot, list] of Object.entries(t.shots)) {
    if (list.length === 0) fail(`shot "${shot}" has no switches`);
    for (const sw of list) if (!users.has(sw)) fail(`shot "${shot}" names switch "${sw}" which no collider defines`);
  }
  return errs;
}
