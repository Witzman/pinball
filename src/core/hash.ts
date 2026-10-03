import type { World } from "./types";

const view = new DataView(new ArrayBuffer(8));

function mix(h: number, v: number): number {
  view.setFloat64(0, v);
  h = Math.imul(h ^ view.getUint32(0), 16777619) >>> 0;
  return Math.imul(h ^ view.getUint32(4), 16777619) >>> 0;
}

/** FNV-1a style hash over the exact bits of every ball, flipper, plunger and the tick. */
export function hashWorld(w: World): number {
  let h = 2166136261;
  h = mix(h, w.tick);
  for (const b of w.balls) {
    h = mix(h, b.x);
    h = mix(h, b.y);
    h = mix(h, b.vx);
    h = mix(h, b.vy);
    h = mix(h, b.w);
    h = mix(h, b.zone);
    if (b.hold !== 0) h = mix(h, b.hold);
  }
  for (const f of w.flippers) h = mix(h, f.u);
  for (let i = 0; i < w.magnets.length; i++) if (w.magnets[i]!.on) h = mix(h, i + 1);
  for (let i = 0; i < w.kickWait.length; i++) if (w.kickWait[i] !== 0) h = mix(mix(h, 1000 + i), w.kickWait[i]!);
  if (w.plunger) {
    h = mix(h, w.plunger.pos);
    h = mix(h, w.plunger.vel);
  }
  return h;
}
