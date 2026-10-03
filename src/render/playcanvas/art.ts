// Procedural art for the PlayCanvas renderer (issue #45): textures drawn with a 2D canvas, so the
// table has a look without any image file. Seeded, so the same table is drawn the same way.

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** The playfield: an ant-nest cutaway, packed soil with tunnels and pebbles, darker toward the edges. `w` x `h` pixels for a table `wm` x `lm` metres. */
export function playfieldTexture(w: number, h: number, wm: number, lm: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d")!;
  const rnd = lcg(7);
  const px = (m: number) => (m / wm) * w;
  // soil base
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#3a2416");
  base.addColorStop(0.5, "#4a2f1c");
  base.addColorStop(1, "#2b1a10");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // grain: thousands of short strokes
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const l = 2 + rnd() * 9;
    const a = rnd() * Math.PI;
    const shade = rnd();
    g.strokeStyle = shade < 0.5 ? `rgba(20,10,4,${0.05 + rnd() * 0.12})` : `rgba(150,100,60,${0.04 + rnd() * 0.08})`;
    g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // pebbles
  for (let i = 0; i < 380; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 3 + rnd() * 9;
    const light = 70 + rnd() * 50;
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    grad.addColorStop(0, `rgba(${light + 40},${light + 20},${light},0.55)`);
    grad.addColorStop(1, "rgba(20,10,5,0.35)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // tunnels: winding darker channels with a lit rim
  const tunnel = (pts: [number, number][], width: number) => {
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const [lw, col] of [[width + 8, "rgba(200,150,90,0.18)"], [width, "rgba(18,10,6,0.78)"], [width * 0.55, "rgba(10,6,4,0.55)"]] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), px(y)) : g.lineTo(px(x), px(y))));
      g.stroke();
    }
  };
  tunnel([[0.1, 0.62], [0.16, 0.5], [0.12, 0.36], [0.2, 0.26]], 38);
  tunnel([[0.44, 0.55], [0.36, 0.64], [0.3, 0.7], [0.22, 0.72]], 30);
  tunnel([[0.3, 0.2], [0.26, 0.3], [0.3, 0.4]], 26);
  // egg chamber glow
  const glow = g.createRadialGradient(px(0.26), px(0.52), 10, px(0.26), px(0.52), px(0.2));
  glow.addColorStop(0, "rgba(255,180,90,0.22)");
  glow.addColorStop(1, "rgba(255,180,90,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  // vignette
  const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  void lm;
  return c;
}

/** A soft round glow, for the lamps under the inserts; white in the middle, clear at the edge. */
export function glowTexture(size = 128): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** An equirectangular studio sky for reflections on the ball and the rails: a dark room with soft light boxes. */
export function studioSky(w = 512, h = 256): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d")!;
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#9aa8c8");
  base.addColorStop(0.45, "#3b4258");
  base.addColorStop(0.5, "#1a1d28");
  base.addColorStop(1, "#0b0c12");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const box = (x: number, y: number, bw: number, bh: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(bw, bh));
    grad.addColorStop(0, `rgba(255,248,235,${a})`);
    grad.addColorStop(1, "rgba(255,248,235,0)");
    g.fillStyle = grad;
    g.fillRect(x - bw, y - bh, bw * 2, bh * 2);
  };
  box(w * 0.2, h * 0.22, 70, 30, 1);
  box(w * 0.62, h * 0.18, 90, 24, 0.9);
  box(w * 0.88, h * 0.3, 50, 40, 0.6);
  return c;
}
