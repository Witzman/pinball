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

/** The playfield: a cutaway of an ant nest, painted: sky and grass under the dome, layered soil, tunnels and egg chambers, a fungus garden, an aphid pasture, rings around the bumpers. `w` x `h` pixels for a table `wm` x `lm` metres. */
export function playfieldTexture(w: number, h: number, wm: number, lm: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d")!;
  const rnd = lcg(11);
  const P = (m: number) => (m / wm) * w; // metres to pixels
  const px = (x: number) => P(x);
  const py = (y: number) => (y / lm) * h;

  // outside the playing area: dark wood
  g.fillStyle = "#120b07";
  g.fillRect(0, 0, w, h);
  g.save();
  // the playing area: the dome above, the rectangle below
  g.beginPath();
  g.arc(px(0.26), py(0.26), P(0.255), Math.PI, 2 * Math.PI);
  g.rect(px(0.005), py(0.26), P(0.51), h - py(0.26));
  g.clip();

  // sky under the dome, a sun, clouds
  const sky = g.createLinearGradient(0, py(0), 0, py(0.2));
  sky.addColorStop(0, "#2d6fd0");
  sky.addColorStop(1, "#9bd3ff");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, py(0.2));
  const sun = g.createRadialGradient(px(0.26), py(0.05), 2, px(0.26), py(0.05), P(0.14));
  sun.addColorStop(0, "rgba(255,250,200,1)");
  sun.addColorStop(0.2, "rgba(255,235,150,0.9)");
  sun.addColorStop(1, "rgba(255,220,120,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, w, py(0.2));
  g.fillStyle = "rgba(255,255,255,0.8)";
  for (const [cx, cy, r] of [[0.12, 0.08, 0.03], [0.4, 0.06, 0.035], [0.33, 0.13, 0.025], [0.19, 0.14, 0.02]] as const) {
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.ellipse(px(cx + (k - 2) * r * 0.7), py(cy + (k % 2) * 0.004), P(r), P(r * 0.55), 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // grass line: rolling hills
  g.fillStyle = "#3c9a3a";
  g.beginPath();
  g.moveTo(0, py(0.2));
  for (let x = 0; x <= wm + 0.01; x += 0.01) g.lineTo(px(x), py(0.185 + Math.sin(x * 22) * 0.008 + Math.sin(x * 47) * 0.004));
  g.lineTo(w, py(0.23));
  g.lineTo(0, py(0.23));
  g.fill();
  g.fillStyle = "#58c24a";
  for (let i = 0; i < 520; i++) {
    const x = rnd() * wm;
    const y = 0.17 + rnd() * 0.03;
    g.fillRect(px(x), py(y), 2, 9 + rnd() * 9);
  }

  // soil: strata, darker with depth
  const strata = ["#6a4326", "#5a3820", "#4b2e1a", "#3c2415", "#2f1c10"];
  for (let i = 0; i < strata.length; i++) {
    const top = 0.22 + i * 0.17;
    g.fillStyle = strata[i]!;
    g.beginPath();
    g.moveTo(0, py(top));
    for (let x = 0; x <= wm + 0.01; x += 0.01) g.lineTo(px(x), py(top + Math.sin(x * 15 + i * 2) * 0.012 + Math.sin(x * 38 + i) * 0.006));
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
  }
  // grain and pebbles
  for (let i = 0; i < 38000; i++) {
    const x = rnd() * w;
    const y = (0.22 + rnd() * 0.83) * h / lm * lm;
    const l = 2 + rnd() * 10;
    const a = rnd() * Math.PI;
    g.strokeStyle = rnd() < 0.5 ? `rgba(15,8,3,${0.05 + rnd() * 0.12})` : `rgba(190,130,80,${0.03 + rnd() * 0.07})`;
    g.lineWidth = 1 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 420; i++) {
    const x = rnd() * w;
    const y = py(0.23 + rnd() * 0.8);
    const r = 4 + rnd() * 12;
    const light = 90 + rnd() * 60;
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    grad.addColorStop(0, `rgba(${light + 50},${light + 30},${light},0.7)`);
    grad.addColorStop(1, "rgba(25,14,8,0.5)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // roots hanging from the grass
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    let x = rnd() * wm;
    let y = 0.2;
    g.strokeStyle = `rgba(200,170,120,${0.25 + rnd() * 0.3})`;
    g.lineWidth = 1.5 + rnd() * 2.5;
    g.beginPath();
    g.moveTo(px(x), py(y));
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 0.04;
      y += 0.02 + rnd() * 0.02;
      g.lineTo(px(x), py(y));
    }
    g.stroke();
  }

  // tunnels with a lit rim, and chambers
  const tunnel = (pts: [number, number][], width: number) => {
    g.lineJoin = "round";
    for (const [lw, col] of [[width + 10, "rgba(230,170,100,0.22)"], [width + 2, "rgba(12,6,3,0.85)"], [width * 0.6, "rgba(6,3,2,0.7)"]] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y))));
      g.stroke();
    }
  };
  const chamber = (cx: number, cy: number, rx: number, ry: number, glowCol: string) => {
    g.fillStyle = "rgba(230,170,100,0.22)";
    g.beginPath();
    g.ellipse(px(cx), py(cy), P(rx) + 6, P(ry) + 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(10,5,3,0.9)";
    g.beginPath();
    g.ellipse(px(cx), py(cy), P(rx), P(ry), 0, 0, Math.PI * 2);
    g.fill();
    const gl = g.createRadialGradient(px(cx), py(cy), 2, px(cx), py(cy), P(rx));
    gl.addColorStop(0, glowCol);
    gl.addColorStop(1, "rgba(255,170,60,0)");
    g.fillStyle = gl;
    g.beginPath();
    g.ellipse(px(cx), py(cy), P(rx), P(ry), 0, 0, Math.PI * 2);
    g.fill();
  };
  tunnel([[0.26, 0.2], [0.27, 0.3], [0.2, 0.42], [0.12, 0.5], [0.1, 0.62]], 34);
  tunnel([[0.27, 0.3], [0.38, 0.4], [0.44, 0.52]], 28);
  tunnel([[0.12, 0.5], [0.07, 0.4], [0.09, 0.3]], 24);
  tunnel([[0.2, 0.42], [0.26, 0.56], [0.3, 0.68]], 26);
  tunnel([[0.44, 0.52], [0.4, 0.62], [0.32, 0.66]], 24);
  chamber(0.26, 0.58, 0.06, 0.035, "rgba(255,190,90,0.55)"); // the queen's chamber
  chamber(0.1, 0.64, 0.045, 0.03, "rgba(255,190,90,0.4)");
  chamber(0.4, 0.62, 0.05, 0.03, "rgba(140,255,140,0.4)"); // the fungus garden
  // eggs
  for (const [cx, cy, n] of [[0.26, 0.58, 9], [0.1, 0.64, 5]] as const) {
    for (let i = 0; i < n; i++) {
      const ex = cx + (rnd() - 0.5) * 0.08;
      const ey = cy + (rnd() - 0.5) * 0.035;
      const grad = g.createRadialGradient(px(ex) - 3, py(ey) - 3, 1, px(ex), py(ey), 12);
      grad.addColorStop(0, "#fffbe8");
      grad.addColorStop(1, "#d9c9a0");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px(ex), py(ey), 9, 13, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // mushrooms in the fungus garden
  for (let i = 0; i < 7; i++) {
    const mx = 0.4 + (rnd() - 0.5) * 0.08;
    const my = 0.62 + (rnd() - 0.2) * 0.025;
    g.fillStyle = "#e9e2d0";
    g.fillRect(px(mx) - 2, py(my), 4, 12);
    g.fillStyle = i % 2 ? "#e5533a" : "#f2a23a";
    g.beginPath();
    g.ellipse(px(mx), py(my), 11, 7, 0, Math.PI, 2 * Math.PI);
    g.fill();
  }
  // ants walking in the tunnels
  const ant = (x: number, y: number, a: number, s: number) => {
    g.save();
    g.translate(px(x), py(y));
    g.rotate(a);
    g.scale(s, s);
    g.fillStyle = "#1a0f0a";
    g.strokeStyle = "#1a0f0a";
    g.lineWidth = 2;
    for (const [cx, rx, ry] of [[-16, 8, 6], [0, 6, 5], [14, 11, 8]] as const) {
      g.beginPath();
      g.ellipse(cx, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (const lx of [-4, 0, 4]) {
      g.beginPath();
      g.moveTo(lx, 0);
      g.lineTo(lx - 3, -14);
      g.moveTo(lx, 0);
      g.lineTo(lx - 3, 14);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-22, -2);
    g.lineTo(-30, -10);
    g.moveTo(-22, 2);
    g.lineTo(-30, 10);
    g.stroke();
    g.restore();
  };
  for (const [x, y, a] of [[0.22, 0.36, 2.2], [0.31, 0.36, 0.7], [0.16, 0.46, 2.6], [0.1, 0.56, 1.7], [0.33, 0.62, 3.3], [0.28, 0.5, 1.2]] as const) ant(x, y, a, 1.2);

  // rings around the pop bumpers and a pasture of aphids
  for (const [bx, by] of [[0.26, 0.32], [0.2, 0.395], [0.32, 0.395]] as const) {
    for (const [r, col, lw] of [[0.046, "rgba(255,190,70,0.9)", 5], [0.056, "rgba(255,120,40,0.7)", 3], [0.066, "rgba(255,230,160,0.4)", 2]] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(px(bx), py(by), P(r), 0, Math.PI * 2);
      g.stroke();
    }
  }
  // the lower playfield: lighter packed earth, a hazard stripe at the drain
  const low = g.createLinearGradient(0, py(0.8), 0, h);
  low.addColorStop(0, "rgba(40,22,12,0)");
  low.addColorStop(1, "rgba(15,8,5,0.6)");
  g.fillStyle = low;
  g.fillRect(0, py(0.8), w, h - py(0.8));

  // THE COLONY, painted across the middle
  g.save();
  g.translate(px(0.26), py(0.745));
  g.font = `bold ${Math.round(P(0.05))}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,8,2,0.9)";
  g.strokeText("THE COLONY", 0, 0);
  const gold = g.createLinearGradient(0, -30, 0, 30);
  gold.addColorStop(0, "#ffe9a0");
  gold.addColorStop(0.5, "#f2b53a");
  gold.addColorStop(1, "#a8651a");
  g.fillStyle = gold;
  g.fillText("THE COLONY", 0, 0);
  g.restore();
  g.restore();

  // a gold border just inside the walls
  g.strokeStyle = "rgba(255,200,90,0.55)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(px(0.26), py(0.26), P(0.245), Math.PI, 2 * Math.PI);
  g.moveTo(px(0.015), py(0.26));
  g.lineTo(px(0.015), h);
  g.moveTo(px(0.505), py(0.26));
  g.lineTo(px(0.505), h);
  g.stroke();
  // vignette
  const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
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
  base.addColorStop(0, "#c4d0ea");
  base.addColorStop(0.45, "#68718c");
  base.addColorStop(0.5, "#4a3626"); // below the horizon is what a ball sees of the table: warm soil, not a blue-grey floor
  base.addColorStop(1, "#24160c");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const box = (x: number, y: number, bw: number, bh: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(bw, bh));
    grad.addColorStop(0, `rgba(255,248,235,${a})`);
    grad.addColorStop(1, "rgba(255,248,235,0)");
    g.fillStyle = grad;
    g.fillRect(x - bw, y - bh, bw * 2, bh * 2);
  };
  box(w * 0.2, h * 0.22, 90, 40, 1);
  box(w * 0.62, h * 0.18, 120, 34, 1);
  box(w * 0.88, h * 0.3, 70, 50, 0.8);
  return c;
}

/** The painted glass of the backbox: the same sky over the same hills, the name of the table in gold. */
export function backglassTexture(w = 1024, h = 512): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d")!;
  const rnd = lcg(5);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1b4fa8");
  sky.addColorStop(0.55, "#74b9f0");
  sky.addColorStop(1, "#d6efff");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.5, h * 0.62, 5, w * 0.5, h * 0.62, h * 0.7);
  sun.addColorStop(0, "rgba(255,250,210,1)");
  sun.addColorStop(0.25, "rgba(255,230,140,0.8)");
  sun.addColorStop(1, "rgba(255,210,120,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * w;
    const cy = h * (0.15 + rnd() * 0.3);
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.ellipse(cx + (k - 2) * 38, cy + (k % 2) * 6, 46, 24, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // hills and grass
  for (const [col, base, amp] of [["#2f8a3a", 0.8, 0.05], ["#3fb04a", 0.88, 0.04]] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (base + Math.sin(x / 90 + base * 9) * amp));
    g.lineTo(w, h);
    g.fill();
  }
  // a line of ants over the hill
  g.fillStyle = "#140a06";
  for (let i = 0; i < 9; i++) {
    const x = 80 + i * 105;
    const y = h * (0.86 + Math.sin(x / 90 + 7.9) * 0.04) - 6;
    for (const [dx, rx, ry] of [[-12, 8, 6], [0, 6, 5], [14, 11, 8]] as const) {
      g.beginPath();
      g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the name
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold ${Math.round(h * 0.26)}px Georgia, serif`;
  g.lineWidth = 12;
  g.strokeStyle = "rgba(25,10,0,0.95)";
  g.strokeText("THE COLONY", w / 2, h * 0.34);
  const gold = g.createLinearGradient(0, h * 0.2, 0, h * 0.48);
  gold.addColorStop(0, "#fff0b0");
  gold.addColorStop(0.5, "#f5bd3e");
  gold.addColorStop(1, "#a8651a");
  g.fillStyle = gold;
  g.fillText("THE COLONY", w / 2, h * 0.34);
  g.font = `600 ${Math.round(h * 0.07)}px system-ui, sans-serif`;
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.fillText("A  PINBALL  OF  SIX  LEGS", w / 2, h * 0.53);
  return c;
}

/**
 * The dot-matrix display (#14): lines of text rendered into a grid of lit dots. The text is drawn
 * small on a pixel canvas and each lit pixel becomes a round dot, so any font reads as a display.
 */
export function drawDisplay(target: HTMLCanvasElement, lines: readonly string[]): void {
  const cols = 128;
  const rows = 32;
  const cell = target.width / cols;
  const pix = makeCanvas(cols, rows);
  const p = pix.getContext("2d", { willReadFrequently: true })!;
  p.fillStyle = "#000";
  p.fillRect(0, 0, cols, rows);
  p.fillStyle = "#fff";
  p.textBaseline = "top";
  const big = lines.slice(0, 1);
  const small = lines.slice(1, 4);
  // each line in the largest monospace size that fits the width: 15 px for the first line, 8 px for the rest
  const fitFont = (text: string, px: number): string => {
    let size = px;
    p.font = `bold ${size}px monospace`;
    while (size > 5 && p.measureText(text).width > cols - 2) {
      size -= 1;
      p.font = `bold ${size}px monospace`;
    }
    return p.font;
  };
  big.forEach((t) => {
    p.font = fitFont(t, 15);
    p.fillText(t, 1, 0);
  });
  small.slice(0, 2).forEach((t, i) => {
    p.font = fitFont(t, 8);
    p.fillText(t, 1, 16 + i * 8);
  });
  const data = p.getImageData(0, 0, cols, rows).data;
  const g = target.getContext("2d")!;
  g.fillStyle = "#070302";
  g.fillRect(0, 0, target.width, target.height);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = data[(y * cols + x) * 4]! / 255;
      g.fillStyle = on > 0.45 ? "#ffa322" : "#1f0f05";
      g.beginPath();
      g.arc(x * cell + cell / 2, y * cell + cell / 2, cell * (on > 0.45 ? 0.42 : 0.3), 0, Math.PI * 2);
      g.fill();
    }
  }
}
