import type { GameInput } from "../sim/game";

const LEFT = ["ShiftLeft", "KeyZ", "ArrowLeft"];
const RIGHT = ["ShiftRight", "Slash", "ArrowRight"];
const PLUNGE = ["Space", "ArrowDown", "Enter"];
const PAUSE = ["KeyP", "Escape"];
const COIN = ["KeyC"];
const START = ["Digit1"];
const BUYIN = ["KeyB"];

/** Applies a key event to the held buttons; returns "pause" on the key down of a pause key. */
export function applyKey(state: GameInput, code: string, down: boolean): "pause" | undefined {
  if (LEFT.includes(code)) state.left = down;
  else if (RIGHT.includes(code)) state.right = down;
  else if (PLUNGE.includes(code)) state.plunge = down;
  else if (COIN.includes(code)) state.coin = down;
  else if (START.includes(code)) state.start = down;
  else if (BUYIN.includes(code)) state.buyin = down;
  else if (down && PAUSE.includes(code)) return "pause";
  return undefined;
}

export type Zone = "left" | "right" | "plunge" | "coin" | "buyin" | "start";

/** The top band of the screen holds the machine buttons. */
export const MACHINE_BAND = 0.12;

/**
 * Lower half of the screen: left and right halves are the flippers, the right edge is
 * the plunger. The top band, in thirds from the left: coin, buy-in, start. The rest of
 * the upper half is free (nudge, #20).
 */
export function touchZone(x: number, y: number, w: number, h: number): Zone | null {
  if (y < MACHINE_BAND * h) return x < w / 3 ? "coin" : x < (2 * w) / 3 ? "buyin" : "start";
  if (y < 0.5 * h) return null;
  if (x >= 0.82 * w) return "plunge";
  return x < w / 2 ? "left" : "right";
}

/** Tracks several fingers; a button is held while any finger is in its zone. */
export class TouchTracker {
  private pointers = new Map<number, [number, number]>();

  constructor(
    private w: number,
    private h: number,
  ) {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  down(id: number, x: number, y: number): void {
    this.pointers.set(id, [x, y]);
  }
  move(id: number, x: number, y: number): void {
    if (this.pointers.has(id)) this.pointers.set(id, [x, y]);
  }
  up(id: number): void {
    this.pointers.delete(id);
  }
  clear(): void {
    this.pointers.clear();
  }
  state(): GameInput {
    const s: GameInput = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };
    for (const [x, y] of this.pointers.values()) {
      const z = touchZone(x, y, this.w, this.h);
      if (z) s[z] = true;
    }
    return s;
  }
}

const BUTTONS = ["left", "right", "plunge", "coin", "start", "buyin"] as const;

/**
 * Makes a tap shorter than a frame count: a press is remembered until the frame that
 * follows has run its ticks, even if the key or finger was already up by then.
 */
export class ButtonLatch {
  private latched: GameInput = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };
  private held: GameInput = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };

  /** Takes what is held now; a button that just went down is latched. Returns what the game should see. */
  update(now: GameInput): GameInput {
    for (const b of BUTTONS) {
      if (now[b] && !this.held[b]) this.latched[b] = true;
      this.held[b] = now[b];
    }
    return this.seen();
  }

  /** Held, or pressed since the last frame. */
  seen(): GameInput {
    const out = { ...this.held };
    for (const b of BUTTONS) out[b] = this.held[b] || this.latched[b];
    return out;
  }

  /** The frame has run: what was only latched is forgotten. Returns what the game should see now. */
  frameDone(): GameInput {
    for (const b of BUTTONS) this.latched[b] = false;
    return this.seen();
  }
}

