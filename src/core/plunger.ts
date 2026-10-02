import { hitCircle, setHit } from "./sweep";
import type { Hit } from "./sweep";
import type { Ball, Plunger } from "./types";

/** A ball this close to the face (m) counts as touching it. */
const TOUCH = 1e-6;

/** Pulls back towards `pull * stroke`, or flies forward at the speed fixed when it was pulled. */
export function advancePlunger(p: Plunger, dt: number): void {
  const before = p.pos;
  const target = p.pull * p.stroke;
  if (p.pos < target) {
    p.pos = Math.min(target, p.pos + p.pullSpeed * dt);
    p.releaseV = p.maxSpeed * (p.pos / p.stroke);
  } else if (p.pos > target) {
    p.pos = Math.max(target, p.pos - p.releaseV * dt);
  }
  p.vel = (before - p.pos) / dt;
}

function faceCentre(p: Plunger): [number, number] {
  return [p.x - p.dirx * p.pos, p.y - p.diry * p.pos];
}

/** The front of the face (the side the ball is on) and its two end points, moving at p.vel along dir. */
export function hitPlunger(p: Plunger, b: Ball, rem: number, best: Hit | null): Hit | null {
  const [cx, cy] = faceCentre(p);
  const vsx = p.dirx * p.vel;
  const vsy = p.diry * p.vel;
  const px = -p.diry; // lateral axis
  const py = p.dirx;

  for (let k = 0; k < 2; k++) {
    const ex = cx + (k === 0 ? -1 : 1) * px * p.halfWidth;
    const ey = cy + (k === 0 ? -1 : 1) * py * p.halfWidth;
    const dx = b.x - ex;
    const dy = b.y - ey;
    const lim = b.r + TOUCH;
    const touching = dx * dx + dy * dy <= lim * lim;
    const t = touching ? 0 : hitCircle(b, ex, ey, b.r, rem);
    if (t === Infinity) continue;
    const qx = b.x + b.vx * t - ex;
    const qy = b.y + b.vy * t - ey;
    const ql = Math.sqrt(qx * qx + qy * qy);
    if (ql === 0) continue;
    const nx = qx / ql;
    const ny = qy / ql;
    if ((b.vx - vsx) * nx + (b.vy - vsy) * ny >= 0) continue;
    best = setHit(best, t, nx, ny, p.e, p.mu, 0, vsx, vsy);
  }

  const rx = b.x - cx;
  const ry = b.y - cy;
  const d = rx * p.dirx + ry * p.diry;
  const vn = b.vx * p.dirx + b.vy * p.diry;
  const touching = d >= 0 && d <= b.r + TOUCH;
  if (touching || (d > 0 && vn < 0)) {
    const t = touching ? 0 : (b.r - d) / vn;
    if (t <= rem) {
      const s = (rx + b.vx * t) * px + (ry + b.vy * t) * py;
      if (s >= -p.halfWidth && s <= p.halfWidth && (b.vx - vsx) * p.dirx + (b.vy - vsy) * p.diry < 0) {
        best = setHit(best, t, p.dirx, p.diry, p.e, p.mu, 0, vsx, vsy);
      }
    }
  }
  return best;
}
