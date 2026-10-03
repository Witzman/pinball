import type { Ball } from "./types";

export interface Hit {
  t: number;
  nx: number;
  ny: number;
  e: number;
  mu: number;
  sw: number;
  /** Velocity of the surface at the contact point (moving parts); 0 for static colliders. */
  vsx: number;
  vsy: number;
  /** Kicker of the collider hit (#49): normal speed, minimum hit speed, cooldown in ticks, index; kick 0 = none. */
  kick: number;
  kmin: number;
  kcd: number;
  ki: number;
}

/** Earliest time in [0, rem] the ball centre reaches distance R from point C. */
export function hitCircle(b: Ball, cx: number, cy: number, R: number, rem: number): number {
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

export function setHit(best: Hit | null, t: number, nx: number, ny: number, e: number, mu: number, sw: number, vsx = 0, vsy = 0, kick = 0, kmin = 0, kcd = 0, ki = 0): Hit {
  if (best && best.t <= t) return best;
  return { t, nx, ny, e, mu, sw, vsx, vsy, kick, kmin, kcd, ki };
}
