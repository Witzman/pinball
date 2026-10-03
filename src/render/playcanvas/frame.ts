// The camera frame of the PlayCanvas renderer as plain geometry (no engine), so it can be tested.

/** Whether the point (x, y, z) is on the screen for a camera at `distance` along `pitch` (radians from straight down) looking at the origin; `margin` is the share of the half screen to keep free. */
export function onScreen(x: number, y: number, z: number, distance: number, pitch: number, fovDeg: number, aspect: number, margin = 0.04): boolean {
  const vTan = Math.tan((fovDeg * Math.PI) / 360);
  const hTan = vTan * aspect;
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  // the camera sits at (0, d cp, d sp), looks along (0, -cp, -sp); its up is (0, sp, -cp), its right is +x
  const vy = y - distance * cp;
  const vz = z - distance * sp;
  const depth = -vy * cp - vz * sp;
  const up = vy * sp - vz * cp;
  const limit = 1 - margin;
  return depth > 1 && Math.abs(x / (depth * hTan)) < limit && Math.abs(up / (depth * vTan)) < limit;
}

/** The smallest distance at which the whole table (width x length, and rails `rail` high) and any `extra` points (the backbox) fit on a screen of this aspect (width / height). */
export function fitDistance(pitch: number, fovDeg: number, aspect: number, width: number, length: number, rail: number, extra: readonly (readonly [number, number, number])[] = []): number {
  const corners = [...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [0, rail].map((y) => [(sx * width) / 2, y, (sz * length) / 2] as const))), ...extra];
  let lo = 1;
  let hi = 100000;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    if (corners.every(([x, y, z]) => onScreen(x, y, z, d, pitch, fovDeg, aspect))) hi = d;
    else lo = d;
  }
  return hi;
}
