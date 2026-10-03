/** The machine buttons of the touch screen, left to right, as the top band is divided (see touchZone). */
const BAND_LABELS = ["COIN", "BUY MORE", "START"] as const;
/** Height of the touch band as a fraction of the screen; the same number as MACHINE_BAND in input. */
const BAND = 0.12;

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
