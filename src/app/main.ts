import { applyKey, TouchTracker } from "../input/input";
import { drawScene } from "../render/canvas";
import { advance, createGame, setPaused, snapshot } from "../sim/game";
import type { GameInput } from "../sim/game";
import { demoTable } from "../tables/demo";

const found = document.getElementById("table");
if (!(found instanceof HTMLCanvasElement)) throw new Error("canvas #table missing");
const canvas: HTMLCanvasElement = found;
const context = canvas.getContext("2d");
if (!context) throw new Error("2d canvas not available");
const ctx: CanvasRenderingContext2D = context;
const banner = document.getElementById("banner");

const game = createGame(demoTable);
const keys: GameInput = { left: false, right: false, plunge: false };
const touch = new TouchTracker(innerWidth, innerHeight);

function resize(): void {
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  touch.resize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

function pause(on: boolean): void {
  setPaused(game, on);
  if (banner) banner.hidden = !on;
}

function mergeInput(): void {
  const t = touch.state();
  game.input.left = keys.left || t.left;
  game.input.right = keys.right || t.right;
  game.input.plunge = keys.plunge || t.plunge;
}

addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (applyKey(keys, e.code, true) === "pause") pause(!game.paused);
  mergeInput();
  if (["Space", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => {
  applyKey(keys, e.code, false);
  mergeInput();
});

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  touch.down(e.pointerId, e.clientX, e.clientY);
  mergeInput();
});
canvas.addEventListener("pointermove", (e) => {
  touch.move(e.pointerId, e.clientX, e.clientY);
  mergeInput();
});
for (const type of ["pointerup", "pointercancel"] as const) {
  canvas.addEventListener(type, (e) => {
    touch.up(e.pointerId);
    mergeInput();
  });
}

// a hidden tab or a lost window must not leave a flipper held
function releaseAll(): void {
  keys.left = keys.right = keys.plunge = false;
  touch.clear();
  mergeInput();
}
addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAll();
    pause(true);
  }
});

let last = performance.now();
function frame(now: number): void {
  advance(game, now - last);
  last = now;
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScene(ctx, innerWidth, innerHeight, game.table, snapshot(game));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// a handle for automated checks (screenshots); not part of the game
(globalThis as Record<string, unknown>).__pinball = game;
