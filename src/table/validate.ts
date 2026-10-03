import { DT } from "../core/step";
import type { Point, TableDef } from "./schema";

const MAX_ZONE = 30;
/** Largest magnet pull (m/s^2) a table may ask for. */
const MAX_MAGNET_STRENGTH = 20;
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

  (t.gates ?? []).forEach((g, i) => {
    const where = `gate #${i}`;
    if (!inside(g.a) || !inside(g.b)) fail(`${where}: outside the playfield`);
    if (g.a[0] === g.b[0] && g.a[1] === g.b[1]) fail(`${where}: zero length`);
    checkZones(where, [g.zoneA, g.zoneB]);
    if (g.zoneA === g.zoneB) fail(`${where}: both sides are zone ${g.zoneA}; a gate must join two different zones`);
    useSwitch(g.switch, g.shared);
  });

  const triggerIds = new Map<string, number>();
  (t.triggers ?? []).forEach((tr, i) => {
    const where = `trigger "${tr.id}" (#${i})`;
    triggerIds.set(tr.id, (triggerIds.get(tr.id) ?? 0) + 1);
    if (tr.id === "") fail(`${where}: id must not be empty`);
    if (!(tr.r > 0)) fail(`${where}: radius must be positive`);
    if (!inside(tr.at)) fail(`${where}: outside the playfield`);
    checkZones(where, tr.zones);
    if (tr.switch === undefined || tr.switch === "") fail(`${where}: needs a switch name`);
    else useSwitch(tr.switch, tr.shared);
    if (tr.hold) {
      if (!(tr.hold.kickSpeed > 0 && Number.isFinite(tr.hold.kickSpeed))) fail(`${where}: kickSpeed must be positive`);
      if (!Number.isFinite(tr.hold.kickDeg)) fail(`${where}: kickDeg must be a number`);
      // a held ball sits at the centre, so the sinkhole must be smaller than the ball
      if (tr.r > t.ball.radius) fail(`${where}: a sinkhole must not be wider than the ball (radius ${tr.r} > ${t.ball.radius})`);
    }
  });
  for (const [id, n] of triggerIds) if (n > 1) fail(`trigger "${id}" is used by ${n} definitions; ids must be unique`);

  const magnetIds = new Map<string, number>();
  (t.magnets ?? []).forEach((m, i) => {
    const where = `magnet "${m.id}" (#${i})`;
    magnetIds.set(m.id, (magnetIds.get(m.id) ?? 0) + 1);
    if (m.id === "") fail(`${where}: id must not be empty`);
    if (!(m.r > 0 && Number.isFinite(m.r))) fail(`${where}: radius must be positive`);
    if (!inside(m.at)) fail(`${where}: outside the playfield`);
    checkZones(where, m.zones);
    if (!(m.strength > 0 && Number.isFinite(m.strength))) fail(`${where}: strength must be positive`);
    // a pull far above gravity would fling the ball: more than 20 m/s^2 is almost certainly a unit mistake
    if (m.strength > MAX_MAGNET_STRENGTH) fail(`${where}: strength ${m.strength} m/s^2 is above ${MAX_MAGNET_STRENGTH}`);
  });
  for (const [id, n] of magnetIds) if (n > 1) fail(`magnet "${id}" is used by ${n} definitions; ids must be unique`);

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

  const vis = t.visual;
  if (vis) {
    const hs = vis.heights ?? [];
    if (hs.length > MAX_ZONE + 1) fail(`visual: at most ${MAX_ZONE + 1} heights`);
    hs.forEach((h, z) => {
      if (!(Number.isFinite(h) && h >= 0)) fail(`visual: height of zone ${z} must be a number >= 0`);
    });
    if (hs.length > 0 && hs[0] !== 0) fail("visual: the height of zone 0 (the playfield) must be 0");
    (vis.ramps ?? []).forEach((r, i) => {
      const where = `visual ramp #${i}`;
      checkZones(where, [r.zone]);
      if (r.zone === 0) fail(`${where}: zone 0 is the playfield, a ramp lies in zone 1 or above`);
      if (!(r.zone < hs.length)) fail(`${where}: zone ${r.zone} has no height in visual.heights`);
      if (r.path.length < 2) fail(`${where}: needs at least 2 path points`);
      if (!r.path.every(inside)) fail(`${where}: outside the playfield`);
      if (!(r.width > 0 && r.width <= t.playfield.width)) fail(`${where}: width must be positive and fit the playfield`);
    });
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
