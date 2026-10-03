import { describe, expect, it } from "vitest";
import { chooseRenderer } from "../../src/app/renderer-choice";

describe("chooseRenderer", () => {
  it("draws the 3D table by default when the browser has WebGL", () => {
    expect(chooseRenderer("", true)).toBe("playcanvas");
    expect(chooseRenderer("?table=colony", true)).toBe("playcanvas");
    expect(chooseRenderer("?renderer=playcanvas", true)).toBe("playcanvas");
    expect(chooseRenderer("?renderer=whatever", true)).toBe("playcanvas");
  });

  it("draws the plain canvas when asked to", () => {
    expect(chooseRenderer("?renderer=canvas", true)).toBe("canvas");
    expect(chooseRenderer("?table=demo&renderer=canvas", true)).toBe("canvas");
  });

  it("draws the plain canvas without WebGL, whatever was asked", () => {
    expect(chooseRenderer("", false)).toBe("canvas");
    expect(chooseRenderer("?renderer=playcanvas", false)).toBe("canvas");
  });
});
