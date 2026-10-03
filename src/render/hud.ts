import { MACHINE_BAND as BAND, MACHINE_BUTTONS } from "../sim/layout";
import type { MachineButton } from "../sim/layout";

/** What the machine buttons of the touch screen are called on screen; drawn in the order of MACHINE_BUTTONS. */
const NAMES: Record<MachineButton, string> = { coin: "COIN", buyin: "BUY MORE", start: "START" };
const BAND_LABELS = MACHINE_BUTTONS.map((b) => NAMES[b]);

/**
 * Draws text lines below the touch band, the first one big, and the names of the touch
 * buttons in the band. A stand-in for the dot-matrix display (#14).
 */
export function drawHud(ctx: CanvasRenderingContext2D, lines: readonly string[], cw: number, ch: number): void {
  const size = Math.max(14, Math.round(Math.min(cw, ch) * 0.035));
  const pad = Math.round(size * 0.6);
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(size * 0.8)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232, 232, 240, 0.35)";
  BAND_LABELS.forEach((label, i) => ctx.fillText(label, ((i + 0.5) * cw) / 3, (BAND * ch) / 2));
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = Math.round(BAND * ch) + pad;
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? Math.round(size * 1.4) : size}px system-ui, sans-serif`;
    ctx.fillStyle = i === 0 ? "#ffd866" : "#e8e8f0";
    ctx.fillText(line, pad, y);
    y += Math.round(size * (i === 0 ? 1.9 : 1.4));
  });
  ctx.restore();
}
