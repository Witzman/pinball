import { hitCircle, setHit } from "./sweep";
import type { Hit } from "./sweep";
import type { Ball, Flipper } from "./types";

/** Points of the angle table; the step interpolates between them. */
export const POSE_POINTS = 257;

/** Sets axis and tip from u. Interpolates the table and renormalises: only + - * / and sqrt. */
export function poseFlipper(f: Flipper): void {
  const x = f.u * (POSE_POINTS - 1);
  let i = Math.floor(x);
  if (i > POSE_POINTS - 2) i = POSE_POINTS - 2;
  const a = x - i;
  const c = f.cosT[i]! * (1 - a) + f.cosT[i + 1]! * a;
  const s = f.sinT[i]! * (1 - a) + f.sinT[i + 1]! * a;
  const n = Math.sqrt(c * c + s * s);
  f.dx = c / n;
  f.dy = s / n;
  f.tx = f.px + f.length * f.dx;
  f.ty = f.py + f.length * f.dy;
}

/** Moves the flipper for dt seconds towards its target and sets its angular velocity. */
export function advanceFlipper(f: Flipper, dt: number): void {
  const before = f.u;
  let u = before + (f.on ? f.upRate : -f.downRate) * dt;
  if (u > 1) u = 1;
  else if (u < 0) u = 0;
  f.u = u;
  f.omega = u === before ? 0 : ((f.theta1 - f.theta0) * (u - before)) / dt;
  poseFlipper(f);
}

// Contact with a moving flipper. The flipper is treated as static at its current
// pose for one sub-step; the surface velocity (omega x r) only enters the response
// and the "is it closing in" test. See notes in #6.

function surfaceVelocity(f: Flipper, x: number, y: number): [number, number] {
  return [-f.omega * (y - f.py), f.omega * (x - f.px)];
}

/** A ball this close to the surface (m) counts as touching it. */
const TOUCH = 1e-6;

export function hitFlipper(f: Flipper, b: Ball, rem: number, best: Hit | null): Hit | null {
  // the two end circles
  for (let k = 0; k < 2; k++) {
    const cx = k === 0 ? f.px : f.tx;
    const cy = k === 0 ? f.py : f.ty;
    const R = (k === 0 ? f.r0 : f.r1) + b.r;
    const dx = b.x - cx;
    const dy = b.y - cy;
    const lim = R + TOUCH;
    const touching = dx * dx + dy * dy <= lim * lim;
    const t = touching ? 0 : hitCircle(b, cx, cy, R, rem);
    if (t === Infinity) continue;
    const qx = b.x + b.vx * t - cx;
    const qy = b.y + b.vy * t - cy;
    const ql = Math.sqrt(qx * qx + qy * qy);
    if (ql === 0) continue;
    const nx = qx / ql;
    const ny = qy / ql;
    const [vsx, vsy] = surfaceVelocity(f, b.x + b.vx * t - nx * b.r, b.y + b.vy * t - ny * b.r);
    if ((b.vx - vsx) * nx + (b.vy - vsy) * ny >= 0) continue;
    best = setHit(best, t, nx, ny, f.e, f.mu, 0, vsx, vsy);
  }

  // the side line facing the ball
  const rx = b.x - f.px;
  const ry = b.y - f.py;
  const sgn = rx * -f.dy + ry * f.dx >= 0 ? 1 : -1;
  const nx = sgn * f.cs * -f.dy + f.k * f.dx;
  const ny = sgn * f.cs * f.dx + f.k * f.dy;
  const d = rx * nx + ry * ny - f.r0;
  const vn = b.vx * nx + b.vy * ny;
  const touching = d <= b.r + TOUCH;
  if (touching || vn < 0) {
    const t = touching ? 0 : (b.r - d) / vn;
    if (t <= rem) {
      const cx = b.x + b.vx * t;
      const cy = b.y + b.vy * t;
      // tangent direction of the side line, from the pivot-side tangent point to the tip-side one
      const tsx = (f.length * f.dx + (f.r1 - f.r0) * nx) / f.tlen;
      const tsy = (f.length * f.dy + (f.r1 - f.r0) * ny) / f.tlen;
      const proj = (cx - (f.px + nx * f.r0)) * tsx + (cy - (f.py + ny * f.r0)) * tsy;
      if (proj >= 0 && proj <= f.tlen) {
        const [vsx, vsy] = surfaceVelocity(f, cx - nx * b.r, cy - ny * b.r);
        if ((b.vx - vsx) * nx + (b.vy - vsy) * ny < 0) best = setHit(best, t, nx, ny, f.e, f.mu, 0, vsx, vsy);
      }
    }
  }
  return best;
}

/** Moves a ball that a flipper pose update left inside the flipper back to its surface. */
export function pushOutFlipper(f: Flipper, b: Ball): void {
  let bestD = Infinity;
  let bnx = 0;
  let bny = 0;
  for (let k = 0; k < 2; k++) {
    const qx = b.x - (k === 0 ? f.px : f.tx);
    const qy = b.y - (k === 0 ? f.py : f.ty);
    const ql = Math.sqrt(qx * qx + qy * qy);
    const d = ql - (k === 0 ? f.r0 : f.r1);
    if (d < bestD && ql > 0) {
      bestD = d;
      bnx = qx / ql;
      bny = qy / ql;
    }
  }
  const rx = b.x - f.px;
  const ry = b.y - f.py;
  const sgn = rx * -f.dy + ry * f.dx >= 0 ? 1 : -1;
  const nx = sgn * f.cs * -f.dy + f.k * f.dx;
  const ny = sgn * f.cs * f.dx + f.k * f.dy;
  const tsx = (f.length * f.dx + (f.r1 - f.r0) * nx) / f.tlen;
  const tsy = (f.length * f.dy + (f.r1 - f.r0) * ny) / f.tlen;
  const proj = (b.x - (f.px + nx * f.r0)) * tsx + (b.y - (f.py + ny * f.r0)) * tsy;
  if (proj >= 0 && proj <= f.tlen) {
    const d = rx * nx + ry * ny - f.r0;
    if (d < bestD) {
      bestD = d;
      bnx = nx;
      bny = ny;
    }
  }
  if (bestD < b.r) {
    b.x += bnx * (b.r - bestD);
    b.y += bny * (b.r - bestD);
  }
}
