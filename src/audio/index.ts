import type { AudioBatch, Command } from "../sim/audio-events";
import type { Engine } from "./engine";
import { soundsFor, soundsForCommand } from "./mapping";
import { Mixer } from "./mixer";
import { AUDIO_KEY, DEFAULT_SETTINGS, masterGain, parseSettings, serializeSettings } from "./settings";
import type { AudioSettings, KeyValue } from "./settings";

/** What the app does with sound (#15). Safe to call at any time: before the first gesture, without an AudioContext, after an error, it does nothing. */
export interface Audio {
  /** The sounds of one frame: what the sim heard and the commands the rules gave. */
  feed(batch: AudioBatch, cmds: readonly Command[]): void;
  /** Call on every user gesture until `running()`: the first loads the engine and opens the sound device, later ones ask a suspended device to run (Safari and iOS insist on a gesture). */
  unlock(): void;
  suspend(): void;
  resume(): void;
  /** Flips mute, remembers it, and says what it is now. */
  toggleMute(): boolean;
  settings(): AudioSettings;
  /** True once the sound device is open. */
  ready(): boolean;
  /** True once the device is actually running (a context can be open and still suspended). */
  running(): boolean;
}

export interface AudioDeps {
  /** Loads the engine module; the app passes a dynamic import, a test a fake. */
  load?: () => Promise<{ createEngine: () => Engine }>;
  /** Whether the browser has Web Audio at all. */
  available?: () => boolean;
  warn?: (message: string, cause?: unknown) => void;
}

const hasWebAudio = (): boolean => typeof globalThis !== "undefined" && ("AudioContext" in globalThis || "webkitAudioContext" in globalThis);

export function createAudio(store: KeyValue, deps: AudioDeps = {}): Audio {
  const load = deps.load ?? (() => import("./engine"));
  const available = deps.available ?? hasWebAudio;
  const warn = deps.warn ?? ((m, c) => console.warn(m, c));
  let settings: AudioSettings = { ...DEFAULT_SETTINGS };
  let muteTouched = false; // the player pressed M before the stored settings arrived: that wins over the stored mute
  const loading = store.get(AUDIO_KEY).then(
    (t) => {
      const stored = parseSettings(t);
      settings = { vol: stored.vol, mute: muteTouched ? settings.mute : stored.mute };
    },
    () => undefined,
  );
  let state: "idle" | "loading" | "ready" | "off" = "idle";
  let engine: Engine | null = null;
  let mixer: Mixer | null = null;
  let paused = false;

  return {
    feed(batch, cmds) {
      if (state !== "ready" || mixer === null || engine === null || paused || !engine.running()) return; // a suspended device has a frozen clock: what is sent now would burst out later
      mixer.beginFrame();
      for (const e of batch.events) for (const p of soundsFor(e)) mixer.play(p);
      for (const c of cmds) for (const p of soundsForCommand(c)) mixer.play(p);
    },
    unlock() {
      if (state === "ready") {
        if (engine !== null && !engine.running() && !paused) engine.resume(); // inside the gesture, as Safari wants
        return;
      }
      if (state !== "idle") return;
      if (!available()) {
        state = "off";
        warn("audio: Web Audio is not available, the game stays silent");
        return;
      }
      state = "loading";
      const fail = (e: unknown) => {
        state = "off";
        warn("audio: could not start, the game stays silent", e);
      };
      load().then((m) => {
        try {
          engine = m.createEngine(); // a browser may refuse to make the context; it asks to run, and the next gesture asks again
          mixer = new Mixer(engine, () => masterGain(settings));
          state = "ready";
        } catch (e) {
          fail(e);
        }
      }, fail);
    },
    suspend() {
      paused = true;
      mixer?.silence();
      engine?.suspend();
    },
    resume() {
      paused = false;
      engine?.resume();
    },
    toggleMute() {
      settings = { ...settings, mute: !settings.mute };
      muteTouched = true;
      if (settings.mute) mixer?.silence();
      // saved once the stored settings have arrived, so the volume in storage is not overwritten by the default
      void loading.then(() => store.set(AUDIO_KEY, serializeSettings(settings))).catch((e) => warn("audio: could not save the settings", e));
      return settings.mute;
    },
    settings: () => ({ ...settings }),
    ready: () => state === "ready",
    running: () => state === "ready" && engine !== null && engine.running(),
  };
}
