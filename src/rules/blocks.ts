import type { Ctx } from "./types";

/**
 * A kickback: when the lamp is lit the ball is kicked back into play and the lamp goes
 * out. Call it from the handler of the outlane's switch. Returns whether it fired, so
 * the table can let the ball drain when it did not.
 *
 * The solenoid is a sinkhole of the table (`fireSolenoid` kicks the ball it holds along
 * the sinkhole's kick direction), so the outlane needs one that captures the ball.
 */
export function kickback(c: Ctx, opts: { lamp: string; solenoid: string }): boolean {
  if (c.lamp(opts.lamp) !== "lit" && c.lamp(opts.lamp) !== "flash") return false;
  c.setLamp(opts.lamp, "off");
  c.emit({ c: "fireSolenoid", id: opts.solenoid });
  return true;
}
