import { describe, expect, it } from "vitest";
import { drawHud } from "../../src/render/hud";

function recorder() {
  const texts: { text: string; x: number; y: number; font: string; fill: string }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, name: string) {
      if (name === "fillText") return (text: string, x: number, y: number) => texts.push({ text, x, y, font: String(t.font), fill: String(t.fillStyle) });
      return t[name] ?? (() => {});
    },
    set(t, name: string, v) {
      t[name] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

describe("drawing the hud", () => {
  it("draws each line once, in order, top to bottom, the first one bigger and in another colour", () => {
    const { ctx, texts } = recorder();
    drawHud(ctx, ["PRESS START", "CREDITS 2", "HIGH SCORE 5"], 800, 600);
    expect(texts.map((t) => t.text)).toEqual(["PRESS START", "CREDITS 2", "HIGH SCORE 5"]);
    expect(texts[1]!.y).toBeGreaterThan(texts[0]!.y);
    expect(texts[2]!.y).toBeGreaterThan(texts[1]!.y);
    const size = (f: string) => Number(/(\d+)px/.exec(f)![1]);
    expect(size(texts[0]!.font)).toBeGreaterThan(size(texts[1]!.font));
    expect(texts[0]!.fill).not.toBe(texts[1]!.fill);
  });

  it("starts below the touch band at the top of the screen", () => {
    const { ctx, texts } = recorder();
    drawHud(ctx, ["X"], 800, 1000);
    expect(texts[0]!.y).toBeGreaterThan(0.12 * 1000 * 0.5);
  });

  it("draws nothing for no lines", () => {
    const { ctx, texts } = recorder();
    drawHud(ctx, [], 800, 600);
    expect(texts).toEqual([]);
  });
});
