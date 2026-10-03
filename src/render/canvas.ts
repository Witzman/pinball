import type { LoadedTable } from "../table/load";
import type { FlipperView, Snapshot } from "../sim/game";

// Placeholder vector art (issue #18 makes the real art). Reads only a snapshot and
// the static colliders of the table; it never writes to the simulation.

const MARGIN = 0.96;

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

/** Fits the playfield (metres) into the canvas (pixels), centred. */
export function fitView(cw: number, ch: number, width: number, length: number): View {
  const scale = Math.min((cw * MARGIN) / width, (ch * MARGIN) / length);
  return { scale, ox: (cw - width * scale) / 2, oy: (ch - length * scale) / 2 };
}

function drawFlipper(ctx: CanvasRenderingContext2D, v: View, f: FlipperView): void {
  const X = (x: number) => v.ox + x * v.scale;
  const Y = (y: number) => v.oy + y * v.scale;
  const px = -f.dy;
  const py = f.dx;
  ctx.beginPath();
  for (const s of [1, -1]) {
    const nx = s * f.cs * px + f.k * f.dx;
    const ny = s * f.cs * py + f.k * f.dy;
    const ax = f.px + nx * f.r0;
    const ay = f.py + ny * f.r0;
    const bx = f.tx + nx * f.r1;
    const by = f.ty + ny * f.r1;
    if (s === 1) {
      ctx.moveTo(X(ax), Y(ay));
      ctx.lineTo(X(bx), Y(by));
    } else {
      ctx.lineTo(X(bx), Y(by));
      ctx.lineTo(X(ax), Y(ay));
    }
  }
  ctx.closePath();
  ctx.fillStyle = "#e8e8f0";
  ctx.fill();
  for (const [x, y, r] of [[f.px, f.py, f.r0], [f.tx, f.ty, f.r1]] as const) {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), r * v.scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, cw: number, ch: number, table: LoadedTable, snap: Snapshot): void {
  const v = fitView(cw, ch, table.playfieldWidth, table.playfieldLength);
  const X = (x: number) => v.ox + x * v.scale;
  const Y = (y: number) => v.oy + y * v.scale;
  const w = table.world;

  ctx.fillStyle = "#0b0d14";
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = "#151a2b";
  ctx.fillRect(v.ox, v.oy, table.playfieldWidth * v.scale, table.playfieldLength * v.scale);

  ctx.lineWidth = Math.max(1.5, 0.003 * v.scale);
  ctx.lineCap = "round";
  for (const s of w.segments) {
    ctx.strokeStyle = s.sw > 0 ? "#ffb84d" : s.e > 0.5 ? "#4da3ff" : "#9aa6c4";
    ctx.beginPath();
    ctx.moveTo(X(s.ax), Y(s.ay));
    ctx.lineTo(X(s.bx), Y(s.by));
    ctx.stroke();
  }
  for (const c of w.circles) {
    ctx.fillStyle = c.sw > 0 ? "#ffb84d" : "#4da3ff";
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), c.r * v.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = Math.max(1, 0.002 * v.scale);
  for (const t of w.triggers) {
    ctx.strokeStyle = t.hold ? "#7ee787" : "#ffd866";
    ctx.beginPath();
    ctx.arc(X(t.x), Y(t.y), t.r * v.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  const p = snap.plunger;
  if (p) {
    const cx = p.x - p.dirx * p.pos;
    const cy = p.y - p.diry * p.pos;
    const lx = -p.diry * p.halfWidth;
    const ly = p.dirx * p.halfWidth;
    ctx.strokeStyle = "#e8e8f0";
    ctx.lineWidth = Math.max(3, 0.006 * v.scale);
    ctx.beginPath();
    ctx.moveTo(X(cx - lx), Y(cy - ly));
    ctx.lineTo(X(cx + lx), Y(cy + ly));
    ctx.stroke();
  }

  for (const f of snap.flippers) drawFlipper(ctx, v, f);

  for (const b of snap.balls) {
    ctx.fillStyle = "#d9dde8";
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), b.r * v.scale, 0, Math.PI * 2);
    ctx.fill();
  }
}
