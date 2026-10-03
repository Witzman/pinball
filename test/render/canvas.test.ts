import { describe, expect, it } from "vitest";
import { createCanvasRenderer, drawScene, fitView } from "../../src/render/canvas";
import { advance, createGame } from "../../src/sim/game";
import { buildScene, snapshot } from "../../src/sim/snapshot";
import { demoTable } from "../../src/tables/demo";

/** A recording stand-in for CanvasRenderingContext2D. */
function fakeCtx() {
  const calls: Record<string, number> = {};
  const arcs: number[][] = [];
  const target: Record<string, unknown> = {};
  return {
    calls,
    arcs,
    ctx: new Proxy(target, {
      get(t, name: string) {
        if (name in t) return t[name];
        return (...args: number[]) => {
          calls[name] = (calls[name] ?? 0) + 1;
          if (name === "arc") arcs.push(args);
        };
      },
      set(t, name: string, v) {
        t[name] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D,
  };
}

describe("fitView", () => {
  it("fits the whole playfield into the canvas, centred, with a margin", () => {
    const v = fitView(1000, 600, 0.52, 1.05);
    expect(v.scale * 1.05).toBeLessThanOrEqual(600);
    expect(v.scale * 0.52).toBeLessThanOrEqual(1000);
    expect(v.ox).toBeGreaterThan(0);
    expect(v.scale).toBeGreaterThan(0);
  });

  it("is limited by the tighter side", () => {
    const wide = fitView(2000, 500, 0.52, 1.05);
    const tall = fitView(300, 2000, 0.52, 1.05);
    expect(wide.scale).toBeCloseTo((500 * 0.96) / 1.05, 6);
    expect(tall.scale).toBeCloseTo((300 * 0.96) / 0.52, 6);
  });
});

describe("drawScene", () => {
  it("draws without throwing and draws every wall, post, flipper and the ball", () => {
    const g = createGame(demoTable);
    const { ctx, calls, arcs } = fakeCtx();
    drawScene(ctx, 600, 900, buildScene(g.table), snapshot(g));
    expect(calls.stroke).toBeGreaterThanOrEqual(g.table.world.segments.length);
    // the ball is an arc of its (scaled) radius
    const view = fitView(600, 900, demoTable.playfield.width / 1000, demoTable.playfield.length / 1000);
    const ballArc = arcs.find((a) => Math.abs(a[2]! - g.table.ballRadius * view.scale) < 1e-6);
    expect(ballArc).toBeDefined();
    expect(calls.fill).toBeGreaterThan(0);
  });

  it("draws a raised flipper somewhere else than a resting one", () => {
    const g = createGame(demoTable);
    const resting = fakeCtx();
    drawScene(resting.ctx, 600, 900, buildScene(g.table), snapshot(g));
    g.input.left = true;
    advance(g, 50);
    const raised = fakeCtx();
    drawScene(raised.ctx, 600, 900, buildScene(g.table), snapshot(g));
    expect(JSON.stringify(resting.arcs)).not.toBe(JSON.stringify(raised.arcs));
  });
});

/** Every call a fake context received, in order, with its arguments. */
function recordingCtx() {
  const log: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, name: string) {
      if (name in t) return t[name];
      return (...args: unknown[]) => void log.push(`${name}(${args.join(",")})`);
    },
    set(t, name: string, v) {
      log.push(`${name}=${String(v)}`);
      t[name] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

describe("the canvas renderer", () => {
  function setup() {
    const g = createGame(demoTable);
    const { ctx, log } = recordingCtx();
    const r = createCanvasRenderer(ctx);
    r.setScene(buildScene(g.table));
    r.resize(600, 900, 2);
    return { g, r, log };
  }

  it("draws the same moment the same way twice, and never touches the snapshot or the world", () => {
    const { g, r, log } = setup();
    const snap = snapshot(g, ["BALL 1   SCORE 0"]);
    const frozen = JSON.stringify(snap);
    Object.freeze(snap);
    for (const part of [snap.balls, snap.flippers, snap.magnets, snap.lamps, snap.hud, snap.hud.lines, snap.camera]) Object.freeze(part);
    const before = JSON.stringify(g.table.world);
    log.length = 0;
    r.draw(snap);
    const first = log.slice();
    log.length = 0;
    r.draw(snap);
    expect(log).toEqual(first);
    expect(first.length).toBeGreaterThan(10);
    expect(JSON.stringify(snap)).toBe(frozen);
    expect(JSON.stringify(g.table.world)).toBe(before);
  });

  it("sets the device scale once on resize, so draw needs no transform of its own", () => {
    const { g, r, log } = setup();
    expect(log).toContain("setTransform(2,0,0,2,0,0)");
    log.length = 0;
    r.draw(snapshot(g));
    expect(log.some((c) => c.startsWith("setTransform"))).toBe(false);
  });

  it("colours walls and posts by kind: switch amber, rubber and posts blue, plain walls grey", () => {
    const g = createGame(demoTable);
    const scene = buildScene(g.table);
    const { ctx, log } = recordingCtx();
    const kinds = new Set(scene.walls.map((w) => w.kind));
    expect(kinds.size).toBeGreaterThan(1);
    drawScene(ctx, 600, 900, scene, snapshot(g));
    const colour = { wall: "#9aa6c4", rubber: "#4da3ff", switch: "#ffb84d" } as const;
    for (const k of kinds) expect(log).toContain(`strokeStyle=${colour[k]}`);
    expect(log).toContain("fillStyle=#4da3ff"); // posts
  });

  it("draws the hud lines of the snapshot", () => {
    const { g, r, log } = setup();
    log.length = 0;
    r.draw(snapshot(g, ["PRESS START"]));
    expect(log.some((c) => c.startsWith("fillText(PRESS START"))).toBe(true);
  });

  it("draws nothing before it has a scene, and again nothing after dispose", () => {
    const g = createGame(demoTable);
    const { ctx, log } = recordingCtx();
    const r = createCanvasRenderer(ctx);
    r.draw(snapshot(g));
    expect(log).toEqual([]);
    r.setScene(buildScene(g.table));
    r.dispose();
    r.draw(snapshot(g));
    expect(log).toEqual([]);
  });

  it("draws a magnet in its live state: lit and unlit look different", () => {
    const { g, r, log } = setup();
    const snap = snapshot(g);
    snap.magnets = [{ x: 0.2, y: 0.3, r: 0.02, on: false }];
    log.length = 0;
    r.draw(snap);
    const off = log.slice();
    snap.magnets = [{ x: 0.2, y: 0.3, r: 0.02, on: true }];
    log.length = 0;
    r.draw(snap);
    expect(log).not.toEqual(off);
  });
});
