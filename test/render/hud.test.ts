import { describe, expect, it } from "vitest";
import { drawHud } from "../../src/render/hud";

function recorder() {
  const counts: Record<string, number> = {};
  const texts: { text: string; x: number; y: number; font: string; fill: string }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, name: string) {
      if (name === "save" || name === "restore") return () => { counts[name] = (counts[name] ?? 0) + 1; };
      if (name === "fillText") return (text: string, x: number, y: number) => texts.push({ text, x, y, font: String(t.font), fill: String(t.fillStyle) });
      return t[name] ?? (() => {});
    },
    set(t, name: string, v) {
      t[name] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, counts };
}

const LABELS = ["COIN", "BUY MORE", "START"];

describe("drawing the hud", () => {
  it("draws each line once, in order, top to bottom, the first one bigger and in another colour", () => {
    const { ctx, texts } = recorder();
    drawHud(ctx, ["PRESS START", "CREDITS 2", "HIGH SCORE 5"], 800, 600);
    const lines = texts.filter((t) => !LABELS.includes(t.text));
    expect(lines.map((t) => t.text)).toEqual(["PRESS START", "CREDITS 2", "HIGH SCORE 5"]);
    expect(lines[1]!.y).toBeGreaterThan(lines[0]!.y);
    expect(lines[2]!.y).toBeGreaterThan(lines[1]!.y);
    const size = (f: string) => Number(/(\d+)px/.exec(f)![1]);
    expect(size(lines[0]!.font)).toBeGreaterThan(size(lines[1]!.font));
    expect(lines[0]!.fill).not.toBe(lines[1]!.fill);
  });

  it("starts below the touch band at the top of the screen", () => {
    const { ctx, texts } = recorder();
    drawHud(ctx, ["X", "Y"], 800, 1000);
    const lines = texts.filter((t) => !LABELS.includes(t.text));
    expect(lines[0]!.y).toBeGreaterThanOrEqual(0.12 * 1000);
  });

  it("names the three touch buttons inside the band, one in each third, left to right", () => {
    const { ctx, texts } = recorder();
    drawHud(ctx, [], 900, 1000);
    expect(texts.map((t) => t.text)).toEqual(LABELS);
    texts.forEach((t, i) => {
      expect(t.x).toBeGreaterThan((i * 900) / 3);
      expect(t.x).toBeLessThan(((i + 1) * 900) / 3);
      expect(t.y).toBeLessThan(0.12 * 1000);
    });
  });

  it("leaves the drawing state as it found it", () => {
    const { ctx, counts } = recorder();
    drawHud(ctx, ["A"], 800, 600);
    expect(counts).toEqual({ save: 1, restore: 1 });
  });
});
