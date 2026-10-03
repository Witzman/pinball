import { describe, expect, it } from "vitest";
import { touchZone } from "../../src/input/input";
import { drawHud } from "../../src/render/hud";
import { FLIPPER_HALF, layout, MACHINE_BAND, MACHINE_BUTTONS, PLUNGE_EDGE } from "../../src/sim/layout";

const W = 400;
const H = 800;

describe("layout", () => {
  it("gives a renderer everything below the machine band, and nothing of the band", () => {
    const l = layout(W, H);
    expect(l.band).toBeCloseTo(MACHINE_BAND * H, 9);
    expect(l.cameraRect).toEqual({ x: 0, y: l.band, w: W, h: H - l.band });
    expect(touchZone(10, l.cameraRect.y - 0.001, W, H)).toBe("coin");
    expect(touchZone(10, l.cameraRect.y + 0.001, W, H)).toBeNull();
  });

  it("is the one source of the touch zones: every point is the zone the numbers say", () => {
    const names = ["coin", "buyin", "start"] as const;
    expect([...MACHINE_BUTTONS]).toEqual([...names]);
    for (let y = 0; y < H; y += 7) {
      for (let x = 0; x < W; x += 5) {
        const z = touchZone(x, y, W, H);
        if (y < MACHINE_BAND * H) expect(z).toBe(names[Math.min(2, Math.floor(x / (W / 3)))]);
        else if (y < FLIPPER_HALF * H) expect(z).toBeNull();
        else if (x >= PLUNGE_EDGE * W) expect(z).toBe("plunge");
        else expect(z).toBe(x < W / 2 ? "left" : "right");
      }
    }
  });

  it("is where the hud draws the button names: centred in the band, one per third", () => {
    const texts: number[][] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, n: string) => (n in t ? t[n] : n === "fillText" ? (...a: unknown[]) => void texts.push([a[1] as number, a[2] as number]) : () => undefined),
      set: (t, n: string, v) => ((t[n] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    drawHud(ctx, [], W, H);
    expect(texts).toEqual([0, 1, 2].map((i) => [((i + 0.5) * W) / 3, (MACHINE_BAND * H) / 2]));
  });
});
