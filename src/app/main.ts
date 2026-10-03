import { applyKey, ButtonLatch, TouchTracker } from "../input/input";
import { drawScene } from "../render/canvas";
import { drawHud } from "../render/hud";
import { advance, createGame, setPaused, snapshot, takeCommands } from "../sim/game";
import type { GameInput } from "../sim/game";
import { localStore } from "../storage";
import { demoTable } from "../tables/demo";
import { demoFlow } from "../tables/demo-rules";
import { tableSetups } from "../tables";
import { hudLines } from "./hud";
import { createKeeper, toMachine } from "./machine";

const found = document.getElementById("table");
if (!(found instanceof HTMLCanvasElement)) throw new Error("canvas #table missing");
const canvas: HTMLCanvasElement = found;
const context = canvas.getContext("2d");
if (!context) throw new Error("2d canvas not available");
const ctx: CanvasRenderingContext2D = context;
const banner = document.getElementById("banner");

async function boot(): Promise<void> {
  // what the machine remembers between visits: credits and scores
  const keeper = createKeeper(localStore(), {
    startCredits: demoFlow.startCredits,
    boardSize: demoFlow.boardSize ?? 10,
    onError: (e) => console.error("could not save the machine", e),
  });
  const stored = await keeper.load();
  const game = createGame(demoTable, { ...tableSetups.demo, machine: toMachine(stored) });
  const keys: GameInput = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };
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

  // a tap shorter than a frame must still count: the latch holds a press until the frame's ticks have run
  const latch = new ButtonLatch();
  function give(seen: GameInput): void {
    for (const b of ["left", "right", "plunge", "coin", "start", "buyin"] as const) game.input[b] = seen[b];
  }
  function mergeInput(): void {
    const t = touch.state();
    const held = { ...keys };
    for (const b of ["left", "right", "plunge", "coin", "start", "buyin"] as const) held[b] = keys[b] || t[b];
    give(latch.update(held));
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

  // a hidden tab or a lost window must not leave a button held
  function releaseAll(): void {
    for (const b of ["left", "right", "plunge", "coin", "start", "buyin"] as const) keys[b] = false;
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
  let reported = 0; // errors already written to the console
  function frame(now: number): void {
    advance(game, now - last);
    give(latch.frameDone());
    keeper.apply(takeCommands(game)); // credits and scores are saved; lamps, display and sound have no listeners yet (#14, #15)
    if (reported < game.errorCount) {
      console.error("the game recovered from an error:", game.errors[game.errors.length - 1]);
      reported = game.errorCount;
    }
    last = now;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, innerWidth, innerHeight, game.table, snapshot(game));
    drawHud(ctx, hudLines(game.rules.state, demoFlow.startCost), innerWidth, innerHeight);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // a handle for automated checks (screenshots); not part of the game
  (globalThis as Record<string, unknown>).__pinball = game;
}

void boot();
