import { it } from "vitest";
import { step } from "../src/core/step";
import { createWorld } from "../src/core/world";
import type { Circle, Segment } from "../src/core/types";
import { ball, BALL_R, wall } from "./core/helpers";
const K = (kid: number, over: Partial<Segment> = {}) => ({ kick: 1.6, kickMin: 0.4, kickCd: 40, kid, ...over });
function report(name: string, w: ReturnType<typeof createWorld>, ticks: number) {
  let kicks = 0, maxv = 0, maxd = 0;
  for (let i = 0; i < ticks; i++) { step(w); for (let k = 0; k < w.contacts.n; k++) if (w.contacts.kind[k] === 5) kicks++; const b = w.balls[0]!; const v = Math.hypot(b.vx, b.vy); if (v > maxv) maxv = v; maxd = Math.max(maxd, Math.hypot(b.x - 0.5, b.y - 0.5)); }
  const b = w.balls[0]!;
  console.log(name, "kicks", kicks, "maxv", maxv.toFixed(2), "maxdist", maxd.toFixed(3), "final v", Math.hypot(b.vx, b.vy).toFixed(3));
}
it("probe", () => {
  for (const R of [0.0265, 0.027, 0.028]) for (const g of [0, 1]) {
    const c: Circle[] = [];
    for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3; c.push({ x: 0.5 + R * Math.cos(a), y: 0.5 + R * Math.sin(a), r: 0.012, e: 0.5, mu: 0, zoneMask: 1, sw: i + 1, kick: 2, kickMin: 0.3, kickCd: 30, kid: i }); }
    const w = createWorld({ balls: [ball({ x: 0.5, y: 0.5, vx: 0.4, vy: 0.1 })], segments: [], circles: c, gravity: g, kickWait: new Int32Array(3) });
    report("D ring R=" + R + " g=" + g, w, 20000);
  }
  // C proper: tilted sling, ball resting then sliding
  for (const ang of [0.1, 0.35, 0.7]) {
    const t = Math.tan(ang);
    const w = createWorld({ balls: [ball({ x: 0.5, y: 0.5 + 0 - BALL_R / Math.cos(ang) - 0.0005, vy: 0 })], segments: [wall(0.2, 0.5 - 0.3 * t, 0.8, 0.5 + 0.3 * t, K(0, { e: 0.8, mu: 0.2, sw: 1 }))], circles: [], gravity: 1.5, kickWait: new Int32Array(1) });
    let kicks = 0; for (let i = 0; i < 6000; i++) { step(w); for (let k = 0; k < w.contacts.n; k++) if (w.contacts.kind[k] === 5) kicks++; }
    const b = w.balls[0]!; console.log("C tilt", ang, "kicks", kicks, "pos", b.x.toFixed(3), b.y.toFixed(3), "v", b.vx.toFixed(3), b.vy.toFixed(3));
  }
  // C2: ball dropped on tilted sling, bounce chain
  { const w = createWorld({ balls: [ball({ x: 0.5, y: 0.3, vy: 0 })], segments: [wall(0.2, 0.5, 0.8, 0.5, K(0, { e: 0.8, sw: 1 })) ], circles: [], gravity: 1.5, kickWait: new Int32Array(1) });
    let kicks = 0; for (let i = 0; i < 6000; i++) { step(w); for (let k = 0; k < w.contacts.n; k++) if (w.contacts.kind[k] === 5) kicks++; }
    console.log("C2 drop flat sling", kicks, w.balls[0]!.y.toFixed(3), w.balls[0]!.vy.toFixed(3)); }
});
