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

  it("reports a nudge direction on the key down of A, D and W, and nothing on key up", () => {
    const s = fresh();
    expect(applyKey(s, "KeyA", true)).toBe("left");
    expect(applyKey(s, "KeyD", true)).toBe("right");
    expect(applyKey(s, "KeyW", true)).toBe("up");
    for (const k of ["KeyA", "KeyD", "KeyW"]) expect(applyKey(s, k, false), k).toBeUndefined();
    expect(s).toEqual(fresh()); // a nudge is one shot: no held state
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

describe("swipes", () => {
  const W = 400;
  const H = 800;
  // the free band is 12% to 50% of the height: y 96 to 400
  const swipe = (from: [number, number], to: [number, number], ms = 100) => {
    const t = new TouchTracker(W, H);
    t.down(1, from[0], from[1], 1000);
    return t.move(1, to[0], to[1], 1000 + ms);
  };

  it("makes a nudge of a quick swipe left, right and up, from the free band", () => {
    expect(swipe([300, 250], [200, 250])).toBe("left");
    expect(swipe([100, 250], [200, 250])).toBe("right");
    expect(swipe([200, 350], [200, 250])).toBe("up");
  });

  it("ignores a swipe down", () => {
    expect(swipe([200, 150], [200, 280])).toBeNull();
  });

  it("needs enough travel: 30 px or 6% of the short side, whichever is more", () => {
    expect(swipe([200, 250], [176, 250])).toBeNull(); // 24 px: under 30 and under 6% of 400 = 24
    expect(swipe([200, 250], [175, 250])).toBeNull(); // 25 px
    expect(swipe([200, 250], [169, 250])).toBe("left"); // 31 px
    const wide = new TouchTracker(1000, 600); // short side 600: 36 px
    wide.down(1, 500, 200, 0);
    expect(wide.move(1, 468, 200, 50)).toBeNull(); // 32 px
    expect(wide.move(1, 463, 200, 60)).toBe("left"); // 37 px
  });

  it("needs to be quick: after 300 ms it is a drag, and stays one", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 300, 250, 0);
    expect(t.move(1, 250, 250, 301)).toBeNull();
    expect(t.move(1, 100, 250, 310)).toBeNull(); // still no: it already lost
    const ok = new TouchTracker(W, H);
    ok.down(1, 300, 250, 0);
    expect(ok.move(1, 250, 250, 300)).toBe("left"); // exactly 300 ms
  });

  it("wants one clear axis: a diagonal waits, and may still become a swipe", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 300, 300, 0);
    expect(t.move(1, 250, 250, 50)).toBeNull(); // 50 across, 50 up: no clear axis
    expect(t.move(1, 200, 240, 100)).toBe("left"); // 100 across, 60 up: 100 >= 1.5 * 60
  });

  it("fires once per finger, then is spent until it lifts", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 300, 250, 0);
    expect(t.move(1, 200, 250, 50)).toBe("left");
    expect(t.move(1, 100, 250, 80)).toBeNull();
    t.up(1);
    t.down(1, 300, 250, 500);
    expect(t.move(1, 200, 250, 550)).toBe("left");
  });

  it("never swipes from the machine band or from the flipper half", () => {
    expect(swipe([300, 40], [150, 40])).toBeNull(); // coin/start band
    expect(swipe([300, 600], [150, 600])).toBeNull(); // flipper zone
    expect(swipe([300, 450], [150, 450])).toBeNull(); // just below the free band
    expect(swipe([200, 98], [50, 98])).toBe("left"); // just inside it
  });

  it("presses no button with a finger that began in the free band, wherever its swipe ends", () => {
    const up = new TouchTracker(W, H);
    up.down(1, 300, 110, 0); // just inside the free band (y 96 and more)
    up.move(1, 300, 60, 50); // swiped up into the machine band: start
    expect(up.state()).toEqual(fresh());
    const toFlipper = new TouchTracker(W, H);
    toFlipper.down(1, 100, 390, 0);
    toFlipper.move(1, 100, 500, 50); // swiped down into the flipper half
    expect(toFlipper.state()).toEqual(fresh());
    const still = new TouchTracker(W, H);
    still.down(1, 300, 200, 0);
    expect(still.state()).toEqual(fresh());
  });

  it("still lets a second finger from the lower half hold its flipper while one swipes", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 300, 200, 0);
    t.down(2, 50, 700, 0);
    t.move(1, 200, 200, 50);
    expect(t.state()).toEqual({ ...fresh(), left: true });
  });

  it("does not let a finger that drifts up from a flipper make a nudge", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 100, 700, 0);
    expect(t.move(1, 100, 300, 100)).toBeNull();
  });

  it("keeps holding the flipper while a finger from the lower half moves, and ignores unknown fingers", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 50, 700, 0);
    t.move(1, 60, 710, 10);
    expect(t.state().left).toBe(true);
    expect(t.move(9, 0, 0, 0)).toBeNull();
  });

  it("forgets a finger that was lifted or cleared", () => {
    const t = new TouchTracker(W, H);
    t.down(1, 300, 250, 0);
    t.up(1);
    expect(t.move(1, 100, 250, 20)).toBeNull();
    t.down(2, 300, 250, 0);
    t.clear();
    expect(t.move(2, 100, 250, 20)).toBeNull();
  });
});

