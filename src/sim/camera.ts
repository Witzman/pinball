import type { Camera } from "./snapshot";

/** The view of the "tilted" camera: from behind the flippers, looking up the table. Guesses; there is no QA to tune them. */
const TILT_PITCH_DEG = 55;
const TILT_FOV_DEG = 50;
const TILT_ZOOM = 1.3;

/** The whole playfield seen from straight above. */
export function topCamera(width: number, length: number): Camera {
  return { mode: "top", cx: width / 2, cy: length / 2, zoom: 1, pitchDeg: 0, yawDeg: 0, fovDeg: 0 };
}

/**
 * The player-eye view: tilted, looking at the ball (kept inside the playfield) and sideways
 * centred. A pure function of the table size and the ball, so camera moves replay and test.
 */
export function tiltedCamera(width: number, length: number, ball: { x: number; y: number } | null): Camera {
  const y = ball === null ? length / 2 : Math.min(length, Math.max(0, ball.y));
  return { mode: "tilted", cx: width / 2, cy: y, zoom: TILT_ZOOM, pitchDeg: TILT_PITCH_DEG, yawDeg: 0, fovDeg: TILT_FOV_DEG };
}

export function cameraFor(mode: Camera["mode"], width: number, length: number, ball: { x: number; y: number } | null): Camera {
  return mode === "top" ? topCamera(width, length) : tiltedCamera(width, length, ball);
}
