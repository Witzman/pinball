import { advanceFlipper } from "./flipper";
import { collect } from "./grid";
import { hitFlipper, pushOutFlipper } from "./flipper";
import { advancePlunger, hitPlunger } from "./plunger";
import { hitCircle, setHit } from "./sweep";
import type { Hit } from "./sweep";
import { CONTACT_CAPTURE, CONTACT_GATE_AB, CONTACT_GATE_BA, CONTACT_HIT, CONTACT_KICK, CONTACT_TRIGGER } from "./types";
import type { Ball, Magnet, World } from "./types";

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
      best = setHit(best, t, px / pl, py / pl, c.e, c.mu, c.sw, 0, 0, c.kick ?? 0, c.kickMin ?? 0, c.kickCd ?? 0, c.kid ?? 0);
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
    if (d0 < 0 && s.oneWay === true) continue; // behind a one-way wall: it does not exist
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
        if (u >= 0 && u <= 1) best = setHit(best, t, nx, ny, s.e, s.mu, s.sw, 0, 0, s.kick ?? 0, s.kickMin ?? 0, s.kickCd ?? 0, s.kid ?? 0);
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
      best = setHit(best, t, px / pl, py / pl, s.e, s.mu, s.sw, 0, 0, s.kick ?? 0, s.kickMin ?? 0, s.kickCd ?? 0, s.kid ?? 0);
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

function record(w: World, bi: number, sw: number, impulse: number, kind: number): void {
  const out = w.contacts;
  if (out.n >= out.sw.length) return;
  const c = out.n++;
  out.tick[c] = w.tick;
  out.ball[c] = bi;
  out.sw[c] = sw;
  out.impulse[c] = impulse;
  out.kind[c] = kind;
}

/** Zone changes for a ball that moved from (x0, y0) to where it is now. */
function crossGates(w: World, b: Ball, bi: number, x0: number, y0: number): void {
  for (const g of w.gates) {
    const abx = g.bx - g.ax;
    const aby = g.by - g.ay;
    const s0 = abx * (y0 - g.ay) - aby * (x0 - g.ax);
    const s1 = abx * (b.y - g.ay) - aby * (b.x - g.ax);
    const fromA = s0 > 0;
    if (fromA === s1 > 0) continue;
    // where along the gate the path crosses it, 0..1
    const f = s0 / (s0 - s1);
    const u = ((x0 + (b.x - x0) * f - g.ax) * abx + (y0 + (b.y - y0) * f - g.ay) * aby) / (abx * abx + aby * aby);
    if (u < 0 || u > 1) continue;
    if (fromA ? b.zone !== g.zoneA : b.zone !== g.zoneB) continue;
    b.zone = fromA ? g.zoneB : g.zoneA;
    if (g.sw > 0) record(w, bi, g.sw, 0, fromA ? CONTACT_GATE_AB : CONTACT_GATE_BA);
  }
}

/** Pull of one magnet on a ball for one tick. */
function attract(m: Magnet, b: Ball): void {
  if (!m.on || (m.zoneMask & (1 << b.zone)) === 0) return;
  const dx = m.x - b.x;
  const dy = m.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= m.r || d === 0) return;
  const k = (m.strength * (1 - d / m.r) * DT) / d;
  b.vx += dx * k;
  b.vy += dy * k;
}

/** Rollovers and sinkholes for a ball that moved from (x0, y0) to where it is now. */
function enterTriggers(w: World, b: Ball, bi: number, x0: number, y0: number): void {
  const dx = b.x - x0;
  const dy = b.y - y0;
  const len2 = dx * dx + dy * dy;
  const zoneBit = 1 << b.zone;
  for (let i = 0; i < w.triggers.length; i++) {
    const t = w.triggers[i]!;
    if ((t.zoneMask & zoneBit) === 0) continue;
    const r2 = t.r * t.r;
    const sx = x0 - t.x;
    const sy = y0 - t.y;
    if (sx * sx + sy * sy <= r2) continue; // it started inside: not an entry
    // closest approach of the path of this tick to the centre
    let f = len2 > 0 ? -(sx * dx + sy * dy) / len2 : 0;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const px = sx + dx * f;
    const py = sy + dy * f;
    if (px * px + py * py > r2) continue;
    if (t.hold) {
      let taken = false;
      for (let k = 0; k < w.balls.length; k++) if (w.balls[k]!.hold === i + 1) taken = true;
      if (taken) continue; // the sinkhole is full: the ball rolls over it
      b.x = t.x;
      b.y = t.y;
      b.vx = 0;
      b.vy = 0;
      b.w = 0;
      b.hold = i + 1;
      if (t.sw > 0) record(w, bi, t.sw, 0, CONTACT_CAPTURE);
    } else if (t.sw > 0) {
      record(w, bi, t.sw, 0, CONTACT_TRIGGER);
    }
    if (b.hold !== 0) return;
  }
}

/**
 * A nudge: every free ball (not held in a sinkhole) gets the velocity change (dvx, dvy).
 * Called between steps like `kickHeld`, never inside one. Returns how many balls it
 * kicked. Only + and *, so replays stay exact. Callers pass finite numbers: a NaN would
 * poison the ball and every hash after it.
 */
export function nudge(w: World, dvx: number, dvy: number): number {
  let n = 0;
  for (let i = 0; i < w.balls.length; i++) {
    const b = w.balls[i]!;
    if (b.hold !== 0) continue;
    b.vx += dvx;
    b.vy += dvy;
    n += 1;
  }
  return n;
}

/** Sends the ball held in sinkhole `ti` out along its kick direction. Returns the ball's index, or -1 if none was held. */
export function kickHeld(w: World, ti: number): number {
  const t = w.triggers[ti];
  if (!t) return -1;
  for (let bi = 0; bi < w.balls.length; bi++) {
    const b = w.balls[bi]!;
    if (b.hold === ti + 1) {
      b.hold = 0;
      b.vx = t.kickx * t.kickSpeed;
      b.vy = t.kicky * t.kickSpeed;
      return bi;
    }
  }
  return -1;
}

export function step(w: World): void {
  const out = w.contacts;
  out.n = 0;
  // A flipper moves a few millimetres per tick at most (validateTable enforces
  // it stays under the ball radius), so it is advanced once and treated as static
  // at that pose while the ball is swept; its surface velocity enters the response.
  for (let i = 0; i < w.kickWait.length; i++) if (w.kickWait[i]! > 0) w.kickWait[i]!--;
  for (const f of w.flippers) advanceFlipper(f, DT);
  if (w.plunger) advancePlunger(w.plunger, DT);
  for (let bi = 0; bi < w.balls.length; bi++) {
    const b = w.balls[bi]!;
    if (b.hold !== 0) continue; // held in a sinkhole
    for (const f of w.flippers) pushOutFlipper(f, b);
    for (let k = 0; k < w.magnets.length; k++) attract(w.magnets[k]!, b);
    b.vy += w.gravity * DT;
    b.vx *= 1 - w.drag * DT;
    b.vy *= 1 - w.drag * DT;
    b.w *= 1 - w.spinDamping * DT;
    const x0 = b.x;
    const y0 = b.y;
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
      const vnIn = hit.kick > 0 ? -(b.vx * hit.nx + b.vy * hit.ny) : 0;
      const jn = respond(b, hit);
      let impulse = jn;
      let kind = CONTACT_HIT;
      // a kicker (#49): a hit hard enough, outside the cooldown, leaves with at least the kick speed along the normal
      if (hit.kick > 0 && jn > 0 && vnIn >= hit.kmin && w.kickWait[hit.ki] === 0) {
        const vnOut = b.vx * hit.nx + b.vy * hit.ny;
        if (vnOut < hit.kick) {
          const d = hit.kick - vnOut;
          b.vx += d * hit.nx;
          b.vy += d * hit.ny;
          impulse = jn + b.m * d;
          kind = CONTACT_KICK;
          w.kickWait[hit.ki] = hit.kcd;
        }
      }
      if (hit.sw > 0 && jn > 0) record(w, bi, hit.sw, impulse, kind);
      rem -= hit.t;
      if (rem <= 0) break;
    }
    crossGates(w, b, bi, x0, y0);
    enterTriggers(w, b, bi, x0, y0);
  }
  w.tick += 1;
}
