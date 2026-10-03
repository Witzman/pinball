// The screen as the player touches it (#21, #20): one place for the numbers that input
// uses to find a button and that a renderer uses to draw it, so the two cannot drift.

/** The top band of the screen holds the machine buttons: its height as a fraction of the screen. */
export const MACHINE_BAND = 0.12;
/** The machine buttons, left to right, as the top band is divided in thirds. */
export const MACHINE_BUTTONS = ["coin", "buyin", "start"] as const;
export type MachineButton = (typeof MACHINE_BUTTONS)[number];
/** Below this fraction of the height the screen is the flipper half; between the band and it, the rest is free (nudge swipes). */
export const FLIPPER_HALF = 0.5;
/** From this fraction of the width on, the flipper half is the plunger. */
export const PLUNGE_EDGE = 0.82;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a renderer may draw the table into: everything below the machine band. Pixels of a w x h screen. */
export interface Layout {
  band: number;
  cameraRect: Rect;
}

export function layout(w: number, h: number): Layout {
  const band = MACHINE_BAND * h;
  return { band, cameraRect: { x: 0, y: band, w, h: h - band } };
}
