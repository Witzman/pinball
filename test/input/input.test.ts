import { describe, expect, it } from "vitest";
import { applyKey, TouchTracker, touchZone } from "../../src/input/input";
import type { GameInput } from "../../src/sim/game";

const fresh = (): GameInput => ({ left: false, right: false, plunge: false, coin: false, start: false, buyin: false });

describe("keyboard", () => {
  it("holds a flipper while its key is down", () => {
    const s = fresh();
    applyKey(s, "ShiftLeft", true);
    applyKey(s, "ShiftRight", true);
    expect(s).toEqual({ ...fresh(), left: true, right: true, plunge: false });
    applyKey(s, "ShiftLeft", false);
    expect(s.left).toBe(false);
    expect(s.right).toBe(true);
  });

  it("accepts the alternative keys", () => {
    for (const [code, field] of [["KeyZ", "left"], ["ArrowLeft", "left"], ["Slash", "right"], ["ArrowRight", "right"], ["Space", "plunge"], ["ArrowDown", "plunge"]] as const) {
      const s = fresh();
      applyKey(s, code, true);
      expect(s[field], code).toBe(true);
    }
  });

  it("reports pause only on key down, and ignores unknown keys", () => {
    const s = fresh();
    expect(applyKey(s, "KeyP", true)).toBe("pause");
    expect(applyKey(s, "KeyP", false)).toBeUndefined();
    expect(applyKey(s, "KeyQ", true)).toBeUndefined();
    expect(s).toEqual(fresh());
  });
});

describe("touch zones", () => {
  const W = 400;
  const H = 800;

  it("maps the lower left and right halves to the flippers", () => {
    expect(touchZone(50, 700, W, H)).toBe("left");
    expect(touchZone(250, 700, W, H)).toBe("right");
  });

  it("maps the plunger area at the right edge to the plunger", () => {
    expect(touchZone(380, 600, W, H)).toBe("plunge");
  });

  it("leaves the upper part of the screen free (nudge, issue #20)", () => {
    expect(touchZone(100, 100, W, H)).toBeNull();
  });
});

describe("touch tracker", () => {
  it("holds a zone while any pointer is in it, across several fingers", () => {
    const t = new TouchTracker(400, 800);
    t.down(1, 50, 700);
    t.down(2, 250, 700);
    expect(t.state()).toEqual({ ...fresh(), left: true, right: true, plunge: false });
    t.up(1);
    expect(t.state()).toEqual({ ...fresh(), left: false, right: true, plunge: false });
    t.up(2);
    expect(t.state()).toEqual(fresh());
  });

  it("lets a finger slide from one zone to another", () => {
    const t = new TouchTracker(400, 800);
    t.down(1, 50, 700);
    t.move(1, 250, 700);
    expect(t.state()).toEqual({ ...fresh(), left: false, right: true, plunge: false });
  });

  it("follows a resize", () => {
    const t = new TouchTracker(400, 800);
    t.resize(800, 400);
    t.down(1, 700, 350);
    expect(t.state().right || t.state().plunge).toBe(true);
  });
});
