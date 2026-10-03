import type { GameInput } from "../sim/game";

const LEFT = ["ShiftLeft", "KeyZ", "ArrowLeft"];
const RIGHT = ["ShiftRight", "Slash", "ArrowRight"];
const PLUNGE = ["Space", "ArrowDown", "Enter"];
const PAUSE = ["KeyP", "Escape"];

/** Applies a key event to the held buttons; returns "pause" on the key down of a pause key. */
export function applyKey(state: GameInput, code: string, down: boolean): "pause" | undefined {
  if (LEFT.includes(code)) state.left = down;
  else if (RIGHT.includes(code)) state.right = down;
  else if (PLUNGE.includes(code)) state.plunge = down;
  else if (down && PAUSE.includes(code)) return "pause";
  return undefined;
}

export type Zone = "left" | "right" | "plunge";

/** Lower half of the screen: left and right halves are the flippers, the right edge is the plunger. */
export function touchZone(x: number, y: number, w: number, h: number): Zone | null {
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
