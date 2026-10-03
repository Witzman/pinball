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
  /** Call on a user gesture: loads the engine and opens the sound device. Only the first call does anything. */
  unlock(): void;
  suspend(): void;
  resume(): void;
  /** Flips mute, remembers it, and says what it is now. */
  toggleMute(): boolean;
  settings(): AudioSettings;
  /** True once the sound device is open. */
  ready(): boolean;
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
  let loaded = false;
  void store.get(AUDIO_KEY).then((t) => {
    if (!loaded) settings = parseSettings(t);
    loaded = true;
  }, () => undefined);
  let state: "idle" | "loading" | "ready" | "off" = "idle";
  let engine: Engine | null = null;
  let mixer: Mixer | null = null;
  let paused = false;

  return {
    feed(batch, cmds) {
      if (state !== "ready" || mixer === null || paused) return;
      mixer.beginFrame();
      for (const e of batch.events) for (const p of soundsFor(e)) mixer.play(p);
      for (const c of cmds) for (const p of soundsForCommand(c)) mixer.play(p);
    },
    unlock() {
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
          engine = m.createEngine(); // a browser may refuse to make the context
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
      loaded = true;
      if (settings.mute) mixer?.silence();
      void store.set(AUDIO_KEY, serializeSettings(settings)).catch((e) => warn("audio: could not save the settings", e));
      return settings.mute;
    },
    settings: () => ({ ...settings }),
    ready: () => state === "ready",
  };
}
