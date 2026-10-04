import { describe, expect, it } from "vitest";
import { advance, createGame, setDropTarget } from "../../src/sim/game";
import { cameraFor, tiltedCamera, topCamera } from "../../src/sim/camera";
import { ballHeight, buildScene, snapshot } from "../../src/sim/snapshot";
import { demoTable } from "../../src/tables/demo";
import { colonyTable } from "../../src/tables/colony";
import { tableSetups } from "../../src/tables";

function played() {
  const g = createGame(demoTable, tableSetups.demo);
  g.input.left = true;
  advance(g, 400);
  return g;
}

describe("snapshot", () => {
  it("is plain data: it survives a JSON round trip and holds no NaN", () => {
    const s = snapshot(played(), ["A"]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const finite = (v: unknown): boolean => (typeof v === "number" ? Number.isFinite(v) : v !== null && typeof v === "object" ? Object.values(v).every(finite) : true);
    expect(finite(s)).toBe(true);
  });

  it("is the same for the same play, run twice", () => {
    expect(snapshot(played())).toEqual(snapshot(played()));
  });

  it("is a copy: changing it leaves the world alone, and the game moving on leaves it alone", () => {
    const g = played();
    const s = snapshot(g);
    const frozen = JSON.stringify(s);
    const hash = JSON.stringify(g.table.world);
    s.balls.forEach((b) => (b.x += 1));
    s.flippers.forEach((f) => (f.px += 1));
    s.magnets.forEach((m) => (m.on = !m.on));
    s.lamps.x = "lit";
    s.hud.lines.push("x");
    expect(JSON.stringify(g.table.world)).toBe(hash);
    expect(g.rules.state.lamps).not.toHaveProperty("x");
    const again = snapshot(g);
    const kept = JSON.stringify(again);
    g.input.right = true;
    advance(g, 100);
    expect(JSON.stringify(again)).toBe(kept);
    expect(JSON.stringify(snapshot(g))).not.toBe(kept);
    expect(frozen).not.toBe(JSON.stringify(s));
  });

  it("carries what the renderer needs: ball motion and zone, flipper held, lamps, camera", () => {
    const g = createGame(demoTable); // a table without a flow has its ball in play from the start
    g.input.left = true;
    advance(g, 400);
    const s = snapshot(g);
    expect(s.balls.length).toBe(g.table.world.balls.length);
    expect(s.balls[0]).toMatchObject({ id: 0, zone: g.table.world.balls[0]!.zone, vx: g.table.world.balls[0]!.vx });
    expect(s.flippers[g.table.flipperIds.indexOf("left")]!.up).toBe(true);
    expect(s.flippers[g.table.flipperIds.indexOf("right")]!.up).toBe(false);
    expect(s.lamps).toEqual(g.rules.state.lamps);
    expect(s.camera).toEqual(topCamera(g.table.playfieldWidth, g.table.playfieldLength));
    expect(s.paused).toBe(false);
    expect(s.broken).toBe(false);
  });

  it("copies the magnets and shows them in their live state", () => {
    const g = createGame(demoTable);
    g.table.world.magnets.push({ x: 0.1, y: 0.2, r: 0.03, strength: 1, zoneMask: 1, on: true });
    const s = snapshot(g);
    expect(s.magnets).toEqual([{ x: 0.1, y: 0.2, r: 0.03, on: true }]);
    s.magnets[0]!.on = false;
    expect(g.table.world.magnets[0]!.on).toBe(true);
    g.table.world.magnets[0]!.on = false;
    expect(snapshot(g).magnets[0]!.on).toBe(false);
  });

  it("says when the game is paused or broken", () => {
    const g = createGame(demoTable);
    g.paused = true;
    expect(snapshot(g).paused).toBe(true);
    g.broken = "boom";
    expect(snapshot(g).broken).toBe(true);
  });

  it("knows the hud: lines as given, tilt and phase from the rules", () => {
    const g = played();
    expect(snapshot(g, ["X", "Y"]).hud.lines).toEqual(["X", "Y"]);
    expect(snapshot(g).hud.lines).toEqual([]);
    expect(snapshot(g).hud.tilted).toBe(false);
    expect(snapshot(g).hud.phase).toBe(g.rules.state.game!.phase);
    expect(snapshot(g).hud.phase).not.toBe("");
    g.rules.state.game!.tilted = true;
    expect(snapshot(g).hud).toMatchObject({ tilted: true, phase: g.rules.state.game!.phase });
  });
});

describe("buildScene", () => {
  it("lists every wall, post and trigger of the table, as plain data", () => {
    const g = createGame(demoTable);
    const sc = buildScene(g.table);
    const w = g.table.world;
    expect(sc.walls.length).toBe(w.segments.length);
    expect(sc.posts.length).toBe(w.circles.length);
    expect(sc.triggers.length).toBe(w.triggers.length);
    expect(sc.width).toBe(g.table.playfieldWidth);
    expect(sc.walls.map((x) => x.zoneMask)).toEqual(w.segments.map((x) => x.zoneMask));
    expect(sc.posts.map((x) => x.zoneMask)).toEqual(w.circles.map((x) => x.zoneMask));
    expect(JSON.parse(JSON.stringify(sc))).toEqual(sc);
  });

  it("gives each trigger its id, so a renderer can bind the lamp of the same name", () => {
    const g = createGame(demoTable);
    g.table.triggerIds.push("lane1");
    g.table.world.triggers.push({ x: 0.1, y: 0.2, r: 0.01, zoneMask: 1, sw: 0, hold: false, kickx: 0, kicky: 0, kickSpeed: 0 });
    expect(buildScene(g.table).triggers).toEqual([{ id: "lane1", x: 0.1, y: 0.2, r: 0.01, hold: false }]);
  });

  it("names the kind of a collider by its switch and bounce", () => {
    const g = createGame(demoTable);
    const w = g.table.world;
    const sc = buildScene(g.table);
    w.segments.forEach((s, i) => expect(sc.walls[i]!.kind).toBe(s.sw > 0 ? "switch" : s.e > 0.5 ? "rubber" : "wall"));
    expect(new Set(sc.walls.map((x) => x.kind)).size).toBeGreaterThan(1);
  });
});

describe("height", () => {
  function onRamp() {
    const g = createGame(demoTable);
    const b = g.table.world.balls[0]!;
    Object.assign(b, { x: 0.07, y: 0.66, vx: 0, vy: -1.5, zone: 0 });
    return { g, b };
  }

  it("a ball on the playfield is at height 0, and the scene carries the heights and the ramp", () => {
    const g = createGame(demoTable);
    expect(snapshot(g).balls[0]!.z).toBe(0);
    const sc = buildScene(g.table);
    expect(sc.heights).toEqual([0, 0.03]);
    expect(sc.ramps).toEqual(g.table.ramps);
    sc.heights[1] = 9;
    expect(g.table.heights[1]).toBe(0.03); // a copy
    sc.ramps[0]!.path[0]!.x = 9;
    expect(g.table.ramps[0]!.path[0]!.x).toBe(0.07); // a copy
  });

  it("a ball rolled up the ramp climbs: its height follows its place along the ramp, from the mouth up to the exit, and is 0 on the playfield again after it", () => {
    const { g, b } = onRamp();
    const zs: number[] = [];
    for (let i = 0; i < 1500 && !(b.zone === 0 && zs.length > 0); i++) {
      advance(g, 1);
      if (b.zone === 1) zs.push(snapshot(g).balls[0]!.z);
    }
    expect(zs.length).toBeGreaterThan(20);
    for (let i = 1; i < zs.length; i++) expect(zs[i]!, `step ${i}`).toBeGreaterThanOrEqual(zs[i - 1]! - 1e-9); // it only climbs on the way up (the ball is slowing, never rolling back here)
    expect(zs[0]!).toBeLessThan(0.012); // starts near the mouth, low
    expect(Math.max(...zs)).toBeGreaterThan(0.03); // and gets high near the top
    expect(Math.max(...zs)).toBeLessThanOrEqual(0.048 + 1e-9);
    expect(b.zone).toBe(0);
    expect(snapshot(g).balls[0]!.z).toBe(0);
  });

  it("a zone without a height reads as 0, so a table with no visual still snapshots", () => {
    const g = createGame(demoTable);
    g.table.world.balls[0]!.zone = 5;
    expect(snapshot(g).balls[0]!.z).toBe(0);
  });
});

describe("camera", () => {
  it("top is the whole playfield from above", () => {
    expect(topCamera(0.52, 1.05)).toEqual({ mode: "top", cx: 0.26, cy: 0.525, zoom: 1, pitchDeg: 0, yawDeg: 0, fovDeg: 0 });
    const g = createGame(demoTable);
    expect(snapshot(g).camera).toEqual(topCamera(g.table.playfieldWidth, g.table.playfieldLength));
  });

  it("tilted looks up the table at the ball, kept inside the playfield, and is a pure function of its inputs", () => {
    const a = tiltedCamera(0.52, 1.05, { x: 0.3, y: 0.8 });
    expect(a).toEqual(tiltedCamera(0.52, 1.05, { x: 0.3, y: 0.8 }));
    expect(a).toMatchObject({ mode: "tilted", cx: 0.26, cy: 0.8 });
    expect(a.pitchDeg).toBeGreaterThan(0);
    expect(a.fovDeg).toBeGreaterThan(0);
    expect(tiltedCamera(0.52, 1.05, { x: 0, y: 5 }).cy).toBe(1.05);
    expect(tiltedCamera(0.52, 1.05, { x: 0, y: -5 }).cy).toBe(0);
    expect(tiltedCamera(0.52, 1.05, null).cy).toBe(0.525);
  });

  it("the snapshot takes the mode asked for, and cameraFor picks by mode", () => {
    const g = createGame(demoTable);
    const b = g.table.world.balls[0]!;
    expect(snapshot(g, [], "tilted").camera).toEqual(tiltedCamera(g.table.playfieldWidth, g.table.playfieldLength, b));
    expect(cameraFor("top", 1, 2, null).mode).toBe("top");
    expect(cameraFor("tilted", 1, 2, null).mode).toBe("tilted");
  });
});

describe("ballHeight", () => {
  it("interpolates along the nearest part of the ramp and does not go past its ends", () => {
    const g = createGame(demoTable);
    const t = g.table;
    // the demo ramp: from (0.07, 0.6) at 0 up to (0.07, 0.3) at 0.048 m
    const at = (y: number, x = 0.07) => ballHeight(t, { x, y, zone: 1 });
    expect(at(0.6)).toBeCloseTo(0, 12);
    expect(at(0.45)).toBeCloseTo(0.024, 12);
    expect(at(0.3)).toBeCloseTo(0.048, 12);
    expect(at(0.7)).toBeCloseTo(0, 12); // before the mouth: clamped
    expect(at(0.1)).toBeCloseTo(0.048, 12); // past the exit: clamped
    expect(at(0.45, 0.2)).toBeCloseTo(0.024, 12); // to the side: the nearest point of the path
  });

  it("is the height of the zone for the playfield and for a zone with no ramp", () => {
    const t = createGame(demoTable).table;
    expect(ballHeight(t, { x: 0.07, y: 0.45, zone: 0 })).toBe(0);
    expect(ballHeight(t, { x: 0.07, y: 0.45, zone: 5 })).toBe(0);
  });
});

describe("effects data for a renderer", () => {
  it("names the switch of every wall and post that has one, and null for the rest", () => {
    const sc = buildScene(createGame(demoTable).table);
    expect(sc.walls.filter((w) => w.sw !== null).map((w) => w.sw)).toEqual(["target1"]);
    expect(sc.posts.map((p) => p.sw)).toEqual(["bumper1", "bumper2"]);
    expect(sc.walls.filter((w) => w.sw === null).length).toBe(sc.walls.length - 1);
  });

  it("lists the switches hit since the last snapshot, with their strength and whether they kicked, and only those", () => {
    const g = createGame(demoTable);
    const events = [
      { a: "switch", sw: "bumper1", kind: "kick", s: 0.7 },
      { a: "flip", side: "L", up: true },
      { a: "switch", sw: "target1", kind: "hit", s: 0.2 },
      { a: "drain" },
    ] as const;
    expect(snapshot(g, [], "top", events).hits).toEqual([{ sw: "bumper1", s: 0.7, kick: true }, { sw: "target1", s: 0.2, kick: false }]);
    expect(snapshot(g).hits).toEqual([]);
  });

  it("shows drop targets (#50): the scene marks their walls and the snapshot says which are down", () => {
    const g = createGame(colonyTable, tableSetups.colony);
    const walls = buildScene(g.table).walls.filter((w) => w.drop > 0);
    expect(walls.map((w) => w.drop).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(snapshot(g).down).toEqual([0, 0, 0, 0, 0, 0]);
    setDropTarget(g, "fungusL2", "down");
    const i = g.table.dropIds.indexOf("fungusL2");
    expect(snapshot(g).down[i]).toBe(1);
    expect(snapshot(g).down.filter((d) => d === 1)).toHaveLength(1);
    expect(buildScene(createGame(demoTable, tableSetups.demo).table).walls.every((w) => w.drop === 0)).toBe(true);
  });
});
