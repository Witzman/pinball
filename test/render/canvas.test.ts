import { describe, expect, it } from "vitest";
import { drawScene, fitView } from "../../src/render/canvas";
import { advance, createGame, snapshot } from "../../src/sim/game";
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
    drawScene(ctx, 600, 900, g.table, snapshot(g));
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
    drawScene(resting.ctx, 600, 900, g.table, snapshot(g));
    g.input.left = true;
    advance(g, 50);
    const raised = fakeCtx();
    drawScene(raised.ctx, 600, 900, g.table, snapshot(g));
    expect(JSON.stringify(resting.arcs)).not.toBe(JSON.stringify(raised.arcs));
  });
});
