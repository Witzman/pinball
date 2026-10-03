import { describe, expect, it } from "vitest";
import { advance, createGame } from "../../src/sim/game";
import { buildScene, snapshot, topCamera } from "../../src/sim/snapshot";
import { demoTable } from "../../src/tables/demo";
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
    expect(JSON.stringify(s)).not.toMatch(/null|NaN/);
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
    expect(JSON.stringify(g.table.world)).toBe(hash);
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

  it("knows the hud: lines as given, tilt and phase from the rules", () => {
    const g = played();
    expect(snapshot(g, ["X", "Y"]).hud.lines).toEqual(["X", "Y"]);
    expect(snapshot(g).hud.lines).toEqual([]);
    expect(snapshot(g).hud.tilted).toBe(false);
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
    expect(JSON.parse(JSON.stringify(sc))).toEqual(sc);
  });

  it("names the kind of a collider by its switch and bounce", () => {
    const g = createGame(demoTable);
    const w = g.table.world;
    const sc = buildScene(g.table);
    w.segments.forEach((s, i) => expect(sc.walls[i]!.kind).toBe(s.sw > 0 ? "switch" : s.e > 0.5 ? "rubber" : "wall"));
    expect(new Set(sc.walls.map((x) => x.kind)).size).toBeGreaterThan(1);
  });
});
