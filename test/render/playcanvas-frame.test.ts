import { describe, expect, it } from "vitest";
import { FLASH_HALF_MS, LAMP_LEVEL, fitDistance, lampLevel, onScreen } from "../../src/render/playcanvas/frame";

const W = 52;
const L = 105;
const deg = (d: number) => (d * Math.PI) / 180;

describe("the camera frame of the PlayCanvas renderer", () => {
  it("puts the middle of the table in the middle of the screen, at any distance and angle", () => {
    for (const pitch of [0, deg(35), deg(55)]) for (const d of [60, 150, 400]) expect(onScreen(0, 0, 0, d, pitch, 45, 0.7)).toBe(true);
  });

  it("finds a distance at which all eight corners of the table are on the screen, and at no nearer one", () => {
    for (const [pitch, aspect] of [[deg(55), 0.7], [deg(55), 1.8], [deg(0), 0.5], [deg(40), 1]] as const) {
      const d = fitDistance(pitch, 45, aspect, W, L, 7);
      const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [0, 7].map((y) => [(sx * W) / 2, y, (sz * L) / 2] as const)));
      expect(corners.every(([x, y, z]) => onScreen(x, y, z, d * 1.001, pitch, 45, aspect)), `fits at ${d}`).toBe(true);
      expect(corners.every(([x, y, z]) => onScreen(x, y, z, d * 0.98, pitch, 45, aspect)), `does not fit nearer`).toBe(false);
    }
  });

  it("needs a longer distance for a narrower screen, a wider angle of view needs a shorter one", () => {
    const pitch = deg(55);
    expect(fitDistance(pitch, 45, 0.5, W, L, 7)).toBeGreaterThan(fitDistance(pitch, 45, 1.2, W, L, 7));
    expect(fitDistance(pitch, 30, 0.7, W, L, 7)).toBeGreaterThan(fitDistance(pitch, 60, 0.7, W, L, 7));
  });

  it("does not count a point behind the camera as on the screen", () => {
    expect(onScreen(0, 0, 500, 100, deg(55), 45, 1)).toBe(false);
  });
});

describe("lampLevel", () => {
  it("is steady for off, lit and collected, whatever the time", () => {
    for (const t of [0, 150, 200, 399, 400, 12345]) for (const s of ["off", "lit", "collected"] as const) expect(lampLevel(s, t)).toBe(LAMP_LEVEL[s]);
  });

  it("blinks a flashing lamp: bright for half a period, dim for the next, on the simulation tick", () => {
    expect(lampLevel("flash", 0)).toBe(LAMP_LEVEL.flash);
    expect(lampLevel("flash", FLASH_HALF_MS - 1)).toBe(LAMP_LEVEL.flash);
    expect(lampLevel("flash", FLASH_HALF_MS)).toBe(LAMP_LEVEL.off);
    expect(lampLevel("flash", 2 * FLASH_HALF_MS - 1)).toBe(LAMP_LEVEL.off);
    expect(lampLevel("flash", 2 * FLASH_HALF_MS)).toBe(LAMP_LEVEL.flash);
    expect(LAMP_LEVEL.flash).toBeGreaterThan(LAMP_LEVEL.off);
  });
});
