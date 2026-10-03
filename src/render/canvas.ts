import type { FlipperView, Snapshot, StaticScene } from "../sim/snapshot";
import { drawHud } from "./hud";
import type { Renderer } from "./renderer";

// Placeholder vector art (issue #18 makes the real art). Reads only the static scene
// and a snapshot (#21); it never touches the simulation or the rules.

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

export function drawScene(ctx: CanvasRenderingContext2D, cw: number, ch: number, scene: StaticScene, snap: Readonly<Snapshot>): void {
  const v = fitView(cw, ch, scene.width, scene.length);
  const X = (x: number) => v.ox + x * v.scale;
  const Y = (y: number) => v.oy + y * v.scale;

  ctx.fillStyle = "#0b0d14";
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = "#151a2b";
  ctx.fillRect(v.ox, v.oy, scene.width * v.scale, scene.length * v.scale);

  ctx.lineWidth = Math.max(1.5, 0.003 * v.scale);
  ctx.lineCap = "round";
  for (const s of scene.walls) {
    ctx.strokeStyle = s.kind === "switch" ? "#ffb84d" : s.kind === "rubber" ? "#4da3ff" : "#9aa6c4";
    ctx.beginPath();
    ctx.moveTo(X(s.ax), Y(s.ay));
    ctx.lineTo(X(s.bx), Y(s.by));
    ctx.stroke();
  }
  for (const c of scene.posts) {
    ctx.fillStyle = c.kind === "switch" ? "#ffb84d" : "#4da3ff";
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), c.r * v.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = Math.max(1, 0.002 * v.scale);
  for (const t of scene.triggers) {
    ctx.strokeStyle = t.hold ? "#7ee787" : "#ffd866";
    ctx.beginPath();
    ctx.arc(X(t.x), Y(t.y), t.r * v.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const m of snap.magnets) {
    ctx.strokeStyle = m.on ? "#ff6b9d" : "#7d5a6e";
    ctx.beginPath();
    ctx.arc(X(m.x), Y(m.y), m.r * v.scale, 0, Math.PI * 2);
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

/** The Canvas 2D renderer: the placeholder art and the HUD text, behind the Renderer interface. */
export function createCanvasRenderer(ctx: CanvasRenderingContext2D): Renderer {
  let w = 0;
  let h = 0;
  let scene: StaticScene | null = null;
  return {
    resize(cssW, cssH, dpr) {
      w = cssW;
      h = cssH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    setScene(s) {
      scene = s;
    },
    draw(snap) {
      if (scene === null) return;
      drawScene(ctx, w, h, scene, snap);
      drawHud(ctx, snap.hud.lines, w, h);
    },
    dispose() {
      scene = null;
    },
  };
}
