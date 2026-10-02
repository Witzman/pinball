import { advanceFlipper } from "./flipper";
import { collect } from "./grid";
import { hitFlipper, pushOutFlipper } from "./flipper";
import { advancePlunger, hitPlunger } from "./plunger";
import { hitCircle, setHit } from "./sweep";
import type { Hit } from "./sweep";
import type { Ball, World } from "./types";

/** The fixed physics step in seconds. Part of the replay header. */
export const DT = 0.001;

/** Below this normal speed (m/s) a contact does not bounce. */
const REST_SPEED = 0.05;
/** Collision passes per step; time left after the last one is dropped. */
const MAX_PASSES = 4;

// Determinism: only + - * / and Math.sqrt (correctly rounded) in this file. No
// sin, cos, pow or atan2, and colliders are visited in array order.

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
  for (const f of w.flippers) best = hitFlipper(f, b, rem, best);
  if (w.plunger) best = hitPlunger(w.plunger, b, rem, best);
  return best;
}

/** Impulse against a static surface with normal (nx, ny) pointing at the ball. */
function respond(b: Ball, h: Hit): number {
  const vn = (b.vx - h.vsx) * h.nx + (b.vy - h.vsy) * h.ny;
  if (vn >= 0) return 0;
  const e = -vn < REST_SPEED ? 0 : h.e;
  const jn = -(1 + e) * vn * b.m;
  b.vx += (jn * h.nx) / b.m;
  b.vy += (jn * h.ny) / b.m;

  if (h.mu > 0) {
    // slip speed of the contact point along the tangent; ball is a solid sphere
    const tx = -h.ny;
    const ty = h.nx;
    const vt = (b.vx - h.vsx) * tx + (b.vy - h.vsy) * ty;
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
  // A flipper moves a few millimetres per tick at most (validateTable enforces
  // it stays under the ball radius), so it is advanced once and treated as static
  // at that pose while the ball is swept; its surface velocity enters the response.
  for (const f of w.flippers) advanceFlipper(f, DT);
  if (w.plunger) advancePlunger(w.plunger, DT);
  for (let bi = 0; bi < w.balls.length; bi++) {
    const b = w.balls[bi]!;
    for (const f of w.flippers) pushOutFlipper(f, b);
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
        const c = out.n++;
        out.tick[c] = w.tick;
        out.ball[c] = bi;
        out.sw[c] = hit.sw;
        out.impulse[c] = jn;
      }
      rem -= hit.t;
      if (rem <= 0) break;
    }
  }
  w.tick += 1;
}
