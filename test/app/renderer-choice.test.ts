import { describe, expect, it } from "vitest";
import { chooseRenderer } from "../../src/app/renderer-choice";

describe("chooseRenderer", () => {
  it("draws the 3D table when the browser has WebGL", () => {
    expect(chooseRenderer(true)).toBe("playcanvas");
  });

  it("draws the plain canvas without WebGL", () => {
    expect(chooseRenderer(false)).toBe("canvas");
  });
});
