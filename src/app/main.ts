import { applyKey, ButtonLatch, TouchTracker } from "../input/input";
import { createCanvasRenderer } from "../render/canvas";
import { createAudio } from "../audio";
import { advance, createGame, nudge, setPaused, takeAudio, takeCommands } from "../sim/game";
import type { GameInput } from "../sim/game";
import { buildScene, snapshot } from "../sim/snapshot";
import { localStore } from "../storage";
import { hudLines } from "./hud";
import { createKeeper, machineKey, toMachine } from "./machine";
import { chooseTable } from "./table-choice";

const found = document.getElementById("table");
if (!(found instanceof HTMLCanvasElement)) throw new Error("canvas #table missing");
const canvas: HTMLCanvasElement = found;
const context = canvas.getContext("2d");
if (!context) throw new Error("2d canvas not available");
const ctx: CanvasRenderingContext2D = context;
const banner = document.getElementById("banner");

async function boot(): Promise<void> {
  const { def, setup, flow } = chooseTable(location.search);
  // what the machine remembers between visits: credits and scores
  const keeper = createKeeper(localStore(), {
    startCredits: flow.startCredits,
    boardSize: flow.boardSize ?? 10,
    key: machineKey(def.id),
    onError: (e) => console.error("could not save the machine", e),
  });
  const stored = await keeper.load();
  const game = createGame(def, { ...setup, machine: toMachine(stored) });
  const keys: GameInput = { left: false, right: false, plunge: false, coin: false, start: false, buyin: false };
  const touch = new TouchTracker(innerWidth, innerHeight);
  const renderer = createCanvasRenderer(ctx);
  renderer.setScene(buildScene(game.table));

  function resize(): void {
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    renderer.resize(innerWidth, innerHeight, dpr);
    touch.resize(innerWidth, innerHeight);
  }
  addEventListener("resize", resize);
  resize();

  // sound (#15): procedural, opened by the first gesture, loaded then and not before
  const audio = createAudio(localStore());
  for (const type of ["keydown", "pointerdown", "touchend"] as const) addEventListener(type, () => audio.unlock(), { once: true, capture: true });

  function pause(on: boolean): void {
    setPaused(game, on);
    if (banner) banner.hidden = !on;
    if (on) audio.suspend();
    else audio.resume();
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
    if (e.code === "KeyM") audio.toggleMute();
    const result = applyKey(keys, e.code, true);
    if (result === "pause") pause(!game.paused);
    else if (result !== undefined) nudge(game, result);
    mergeInput();
    if (["Space", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => {
    applyKey(keys, e.code, false);
    mergeInput();
  });

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    touch.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    mergeInput();
  });
  canvas.addEventListener("pointermove", (e) => {
    const dir = touch.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    if (dir !== null) nudge(game, dir);
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
    game.pendingNudge = null; // nor may a shove asked for just before fire when play resumes
    latch.clear(); // a press made just before the tab was hidden must not fire when it comes back
    give(latch.update({ left: false, right: false, plunge: false, coin: false, start: false, buyin: false }));
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
    const cmds = takeCommands(game);
    keeper.apply(cmds); // credits and scores are saved; lamps and the display have no listeners yet (#14)
    audio.feed(takeAudio(game), cmds);
    if (reported < game.errorCount) {
      console.error("the game recovered from an error:", game.errors[game.errors.length - 1]);
      reported = game.errorCount;
    }
    last = now;
    renderer.draw(snapshot(game, game.broken !== null ? ["SOMETHING WENT WRONG", "RELOAD THE PAGE"] : hudLines(game.rules.state, flow.startCost)));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // a handle for automated checks (screenshots); not part of the game
  (globalThis as Record<string, unknown>).__pinball = game;
}

boot().catch((e: unknown) => {
  // storage that never answers, a table that does not load: say so instead of showing a blank page
  console.error("could not start", e);
  if (banner) {
    banner.textContent = `Could not start: ${e instanceof Error ? e.message : String(e)}`;
    banner.hidden = false;
  }
});
