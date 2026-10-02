import { collect } from "./grid";
import type { Ball, World } from "./types";

/** The fixed physics step in seconds. Part of the replay header. */
export const DT = 0.001;

/** Below this normal speed (m/s) a contact does not bounce. */
const REST_SPEED = 0.05;
/** Collision passes per step; time left after the last one is dropped. */
const MAX_PASSES = 4;

// Determinism: only + - * / and Math.sqrt (correctly rounded) in this file. No
// sin, cos, pow or atan2, and colliders are visited in array order.

interface Hit {
  t: number;
  nx: number;
  ny: number;
  e: number;
  mu: number;
  sw: number;
}

/** Earliest time in [0, rem] the ball centre reaches distance R from point C. */
function hitCircle(b: Ball, cx: number, cy: number, R: number, rem: number): number {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const bb = dx * b.vx + dy * b.vy; // half of the linear term
  if (bb >= 0) return Infinity; // moving away or tangent
  const a = b.vx * b.vx + b.vy * b.vy;
  const c = dx * dx + dy * dy - R * R;
  if (c <= 0) return 0; // already touching or inside, and approaching
  const disc = bb * bb - a * c;
  if (disc < 0) return Infinity;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t >= 0 && t <= rem ? t : Infinity;
}

function setHit(best: Hit | null, t: number, nx: number, ny: number, e: number, mu: number, sw: number): Hit {
  if (best && best.t <= t) return best;
  return { t, nx, ny, e, mu, sw };
}

function earliest(w: World, b: Ball, rem: number): Hit | null {
  let best: Hit | null = null;
  const zoneBit = 1 << b.zone;
  const reach = b.r + 1e-6;
  const ex = b.x + b.vx * rem;
  const ey = b.y + b.vy * rem;
  const g = w.grid;
  const n = collect(g, Math.min(b.x, ex) - reach, Math.min(b.y, ey) - reach, Math.max(b.x, ex) + reach, Math.max(b.y, ey) + reach);
  const nSeg = w.segments.length;

  for (let k = 0; k < n; k++) {
    const idx = g.cand[k]!;
    if (idx >= nSeg) {
      const c = w.circles[idx - nSeg]!;
      if ((c.zoneMask & zoneBit) === 0) continue;
      const t = hitCircle(b, c.x, c.y, b.r + c.r, rem);
      if (t === Infinity) continue;
      const px = b.x + b.vx * t - c.x;
      const py = b.y + b.vy * t - c.y;
      const pl = Math.sqrt(px * px + py * py);
      best = setHit(best, t, px / pl, py / pl, c.e, c.mu, c.sw);
      continue;
    }
    const s = w.segments[idx]!;
    if ((s.zoneMask & zoneBit) === 0) continue;
    const abx = s.bx - s.ax;
    const aby = s.by - s.ay;
    const len2 = abx * abx + aby * aby;
    const len = Math.sqrt(len2);
    // unit normal; side chosen by where the ball is now
    let nx = -aby / len;
    let ny = abx / len;
    const d0 = (b.x - s.ax) * nx + (b.y - s.ay) * ny;
    if (d0 < 0) {
      nx = -nx;
      ny = -ny;
    }
    const d = d0 < 0 ? -d0 : d0;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const t = d >= b.r ? (b.r - d) / vn : 0;
      if (t <= rem) {
        const px = b.x + b.vx * t - s.ax;
        const py = b.y + b.vy * t - s.ay;
        const u = (px * abx + py * aby) / len2;
        if (u >= 0 && u <= 1) best = setHit(best, t, nx, ny, s.e, s.mu, s.sw);
      }
    }
    for (let e = 0; e < 2; e++) {
      const cx = e === 0 ? s.ax : s.bx;
      const cy = e === 0 ? s.ay : s.by;
      const t = hitCircle(b, cx, cy, b.r, rem);
      if (t === Infinity) continue;
      const px = b.x + b.vx * t - cx;
      const py = b.y + b.vy * t - cy;
      const pl = Math.sqrt(px * px + py * py);
      best = setHit(best, t, px / pl, py / pl, s.e, s.mu, s.sw);
    }
  }
  return best;
}

/** Impulse against a static surface with normal (nx, ny) pointing at the ball. */
function respond(b: Ball, h: Hit): number {
  const vn = b.vx * h.nx + b.vy * h.ny;
  if (vn >= 0) return 0;
  const e = -vn < REST_SPEED ? 0 : h.e;
  const jn = -(1 + e) * vn * b.m;
  b.vx += (jn * h.nx) / b.m;
  b.vy += (jn * h.ny) / b.m;

  if (h.mu > 0) {
    // slip speed of the contact point along the tangent; ball is a solid sphere
    const tx = -h.ny;
    const ty = h.nx;
    const vt = b.vx * tx + b.vy * ty;
    const slip = vt - b.w * b.r;
    const inertia = 0.4 * b.m * b.r * b.r;
    let jt = -slip / (1 / b.m + (b.r * b.r) / inertia);
    const limit = h.mu * jn;
    if (jt > limit) jt = limit;
    else if (jt < -limit) jt = -limit;
    b.vx += (jt * tx) / b.m;
    b.vy += (jt * ty) / b.m;
    b.w -= (b.r * jt) / inertia;
  }
  return jn;
}

export function step(w: World): void {
  const out = w.contacts;
  out.n = 0;
  for (let bi = 0; bi < w.balls.length; bi++) {
    const b = w.balls[bi]!;
    b.vy += w.gravity * DT;
    b.vx *= 1 - w.drag * DT;
    b.vy *= 1 - w.drag * DT;
    b.w *= 1 - w.spinDamping * DT;
    let rem = DT;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const hit = earliest(w, b, rem);
      if (hit === null) {
        b.x += b.vx * rem;
        b.y += b.vy * rem;
        break;
      }
      b.x += b.vx * hit.t;
      b.y += b.vy * hit.t;
      const jn = respond(b, hit);
      if (hit.sw > 0 && jn > 0 && out.n < out.sw.length) {
        const k = out.n++;
        out.tick[k] = w.tick;
        out.ball[k] = bi;
        out.sw[k] = hit.sw;
        out.impulse[k] = jn;
      }
      rem -= hit.t;
      if (rem <= 0) break;
    }
  }
  w.tick += 1;
}
