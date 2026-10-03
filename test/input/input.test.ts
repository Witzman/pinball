import { describe, expect, it } from "vitest";
import { applyKey, ButtonLatch, TouchTracker, touchZone } from "../../src/input/input";
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

  it("maps the machine keys: C is a coin, 1 starts, B buys more balls; held while down", () => {
    for (const [code, field] of [["KeyC", "coin"], ["Digit1", "start"], ["KeyB", "buyin"]] as const) {
      const s = fresh();
      applyKey(s, code, true);
      expect(s, code).toEqual({ ...fresh(), [field]: true });
      applyKey(s, code, false);
      expect(s, code).toEqual(fresh());
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

  it("leaves the upper part of the screen free (nudge, issue #20), below the machine band", () => {
    expect(touchZone(100, 100, W, H)).toBeNull();
    expect(touchZone(200, 0.12 * H + 1, W, H)).toBeNull();
    expect(touchZone(200, 0.5 * H - 1, W, H)).toBeNull();
  });

  it("puts the machine buttons in the top band, in thirds: coin, buy-in, start", () => {
    expect(touchZone(50, 20, W, H)).toBe("coin");
    expect(touchZone(200, 20, W, H)).toBe("buyin");
    expect(touchZone(380, 20, W, H)).toBe("start");
    expect(touchZone(W / 3 - 1, 0, W, H)).toBe("coin");
    expect(touchZone(W / 3, 0, W, H)).toBe("buyin");
    expect(touchZone((2 * W) / 3, 0, W, H)).toBe("start");
    expect(touchZone(50, 0.12 * H - 1, W, H)).toBe("coin");
  });

  it("holds a machine button while a finger rests in its zone", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 50, 20);
    expect(t.state()).toEqual({ ...fresh(), coin: true });
    t.move(1, 380, 20);
    expect(t.state()).toEqual({ ...fresh(), start: true });
    t.up(1);
    expect(t.state()).toEqual(fresh());
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

describe("button latch", () => {
  it("lets a tap that is over before the frame runs still count for that frame, then forgets it", () => {
    const l = new ButtonLatch();
    l.update({ ...fresh(), start: true }); // key down
    expect(l.update(fresh()).start).toBe(true); // key up before any tick: still seen
    expect(l.frameDone().start).toBe(false); // the frame ran
  });

  it("keeps a held button seen across frames", () => {
    const l = new ButtonLatch();
    expect(l.update({ ...fresh(), left: true }).left).toBe(true);
    expect(l.frameDone().left).toBe(true);
    expect(l.frameDone().left).toBe(true);
    expect(l.update(fresh()).left).toBe(false);
  });

  it("latches a second tap that follows the first within one frame as one press, and a new one after the frame", () => {
    const l = new ButtonLatch();
    l.update({ ...fresh(), coin: true });
    l.update(fresh());
    l.update({ ...fresh(), coin: true });
    l.update(fresh());
    expect(l.seen().coin).toBe(true);
    l.frameDone();
    expect(l.seen().coin).toBe(false);
    l.update({ ...fresh(), coin: true });
    expect(l.frameDone().coin).toBe(true); // held through the frame
  });

  it("does not latch a button that was already held when the frame ended", () => {
    const l = new ButtonLatch();
    l.update({ ...fresh(), plunge: true });
    l.frameDone();
    l.update({ ...fresh(), plunge: true }); // still down: no new press
    l.update(fresh());
    expect(l.seen().plunge).toBe(false);
  });

  it("forgets everything on clear: a press just before the window was lost does not fire later", () => {
    const l = new ButtonLatch();
    l.update({ ...fresh(), start: true, left: true });
    l.clear();
    expect(l.seen()).toEqual(fresh());
    expect(l.frameDone()).toEqual(fresh());
    // and a button that is still down when the window comes back is a new press
    expect(l.update({ ...fresh(), left: true }).left).toBe(true);
  });

  it("works for every button", () => {
    for (const b of ["left", "right", "plunge", "coin", "start", "buyin"] as const) {
      const l = new ButtonLatch();
      l.update({ ...fresh(), [b]: true });
      expect(l.update(fresh())[b], b).toBe(true);
      expect(l.frameDone()[b], b).toBe(false);
    }
  });
});

