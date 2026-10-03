import { describe, expect, it } from "vitest";
import type { Renderer } from "../../src/render/renderer";
import { advance, createGame } from "../../src/sim/game";
import { buildScene, snapshot } from "../../src/sim/snapshot";
import type { Snapshot } from "../../src/sim/snapshot";
import { demoTable } from "../../src/tables/demo";

/**
 * What every Renderer must do (#21), whatever it draws with. `make` builds a fresh renderer
 * and `drew` says how many things the last draw put on the screen (a canvas: its calls).
 * The canvas runs it today; a WebGL renderer (#45) runs the same.
 */
export function conformance(name: string, make: () => { renderer: Renderer; drew: () => number; reset: () => void }): void {
  describe(`${name} is a Renderer`, () => {
    const game = () => {
      const g = createGame(demoTable);
      advance(g, 50);
      return g;
    };

    it("draws nothing, and does not throw, before it has a scene", () => {
      const { renderer, drew, reset } = make();
      reset();
      renderer.resize(600, 900, 1);
      expect(() => renderer.draw(snapshot(game()))).not.toThrow();
      expect(drew()).toBe(0);
    });

    it("draws a full snapshot after setScene and resize", () => {
      const g = game();
      const { renderer, drew, reset } = make();
      renderer.resize(600, 900, 2);
      renderer.setScene(buildScene(g.table));
      reset();
      renderer.draw(snapshot(g, ["BALL 1   SCORE 0", "CREDITS 1"]));
      expect(drew()).toBeGreaterThan(0);
    });

    it("draws an empty snapshot (no balls, no flippers, no plunger, no magnets) without throwing", () => {
      const g = game();
      const { renderer } = make();
      renderer.resize(300, 500, 1);
      renderer.setScene(buildScene(g.table));
      const empty: Snapshot = { ...snapshot(g), balls: [], flippers: [], plunger: null, magnets: [] };
      expect(() => renderer.draw(empty)).not.toThrow();
    });

    it("draws more when there are more balls", () => {
      const g = game();
      const { renderer, drew, reset } = make();
      renderer.resize(600, 900, 1);
      renderer.setScene(buildScene(g.table));
      const one = snapshot(g);
      const three: Snapshot = { ...one, balls: [0, 1, 2].map((id) => ({ ...one.balls[0]!, id, x: 0.1 + id * 0.1 })) };
      reset();
      renderer.draw(one);
      const few = drew();
      reset();
      renderer.draw(three);
      expect(drew()).toBeGreaterThan(few);
    });

    it("does not change the snapshot or the scene it is given", () => {
      const g = game();
      const { renderer } = make();
      renderer.resize(600, 900, 1);
      const scene = buildScene(g.table);
      const snap = snapshot(g, ["X"], "tilted");
      const before = JSON.stringify([scene, snap]);
      renderer.setScene(scene);
      renderer.draw(snap);
      renderer.draw(snap);
      expect(JSON.stringify([scene, snap])).toBe(before);
    });

    it("can be resized between frames and disposed, and then draws nothing", () => {
      const g = game();
      const { renderer, drew, reset } = make();
      renderer.setScene(buildScene(g.table));
      for (const [w, h, dpr] of [[600, 900, 1], [320, 480, 3], [1200, 700, 1.5]] as const) {
        renderer.resize(w, h, dpr);
        expect(() => renderer.draw(snapshot(g))).not.toThrow();
      }
      renderer.dispose();
      reset();
      renderer.draw(snapshot(g));
      expect(drew()).toBe(0);
    });
  });
}
