/** Draws text lines top-left, the first one big. A stand-in for the dot-matrix display (#14). */
export function drawHud(ctx: CanvasRenderingContext2D, lines: readonly string[], cw: number, ch: number): void {
  const size = Math.max(14, Math.round(Math.min(cw, ch) * 0.035));
  const pad = Math.round(size * 0.6);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = pad + Math.round(ch * 0.12 * 0.5); // clear of the touch band at the very top
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? Math.round(size * 1.4) : size}px system-ui, sans-serif`;
    ctx.fillStyle = i === 0 ? "#ffd866" : "#e8e8f0";
    ctx.fillText(line, pad, y);
    y += Math.round(size * (i === 0 ? 1.9 : 1.4));
  });
}
