// The sounds of the table as plain parameter tables (#15), so they can be checked without an
// AudioContext and played by any backend. Every number is a placeholder: nobody has heard them.

export type Osc = "sine" | "square" | "saw" | "tri";

export interface Layer {
  src: { osc: Osc; f0: number; f1: number } | { noise: "white" | "brown" };
  /** Seconds after the start of the voice; default 0. */
  at?: number;
  filter?: { type: "lowpass" | "highpass" | "bandpass"; f0: number; f1: number; q: number };
  /** Attack and decay in seconds, and the peak level 0..1; the decay is exponential and ends at silence. */
  env: { a: number; peak: number; d: number };
}

export interface Voice {
  layers: Layer[];
  /** Seconds the voice lasts at most. */
  dur: number;
  /** 0..3: a voice is only ever stolen by one of the same priority or higher. */
  prio: number;
  /** Milliseconds in which another start of this id is dropped (unless it is much louder). */
  cooldownMs: number;
  /** Gain at strength 0 and 1. */
  gain: [number, number];
  /** Playback rate (pitch factor) at strength 0 and 1. */
  pitch: [number, number];
}

const TABLE = {
  bumperPop: {
    layers: [
      { src: { osc: "tri", f0: 300, f1: 120 }, env: { a: 0.002, peak: 0.8, d: 0.09 } },
      { src: { osc: "square", f0: 900, f1: 300 }, env: { a: 0.001, peak: 0.3, d: 0.03 } },
    ],
    dur: 0.1, prio: 1, cooldownMs: 40, gain: [0.5, 0.9], pitch: [0.9, 1.2],
  },
  slingThwack: {
    layers: [
      { src: { noise: "white" }, filter: { type: "bandpass", f0: 1800, f1: 600, q: 3 }, env: { a: 0.001, peak: 0.8, d: 0.06 } },
      { src: { osc: "sine", f0: 160, f1: 70 }, env: { a: 0.001, peak: 0.7, d: 0.07 } },
    ],
    dur: 0.08, prio: 1, cooldownMs: 40, gain: [0.5, 0.9], pitch: [0.9, 1.1],
  },
  flipperUp: {
    layers: [
      { src: { osc: "square", f0: 140, f1: 90 }, env: { a: 0.001, peak: 0.6, d: 0.03 } },
      { src: { noise: "white" }, filter: { type: "lowpass", f0: 900, f1: 600, q: 0.7 }, env: { a: 0.001, peak: 0.5, d: 0.03 } },
    ],
    dur: 0.04, prio: 1, cooldownMs: 20, gain: [0.7, 0.7], pitch: [1, 1],
  },
  flipperDown: {
    layers: [
      { src: { osc: "square", f0: 190, f1: 120 }, env: { a: 0.001, peak: 0.4, d: 0.02 } },
      { src: { noise: "white" }, filter: { type: "lowpass", f0: 1200, f1: 800, q: 0.7 }, env: { a: 0.001, peak: 0.3, d: 0.02 } },
    ],
    dur: 0.03, prio: 0, cooldownMs: 20, gain: [0.4, 0.4], pitch: [1, 1],
  },
  plunger: {
    layers: [
      { src: { noise: "brown" }, filter: { type: "lowpass", f0: 400, f1: 1500, q: 0.7 }, env: { a: 0.005, peak: 0.7, d: 0.12 } },
      { src: { osc: "sine", f0: 90, f1: 50 }, env: { a: 0.002, peak: 0.7, d: 0.16 } },
    ],
    dur: 0.18, prio: 1, cooldownMs: 100, gain: [0.3, 0.9], pitch: [0.9, 1.1],
  },
  ballHit: {
    layers: [
      { src: { osc: "tri", f0: 700, f1: 500 }, env: { a: 0.001, peak: 0.6, d: 0.05 } },
      { src: { noise: "white" }, filter: { type: "highpass", f0: 2000, f1: 2000, q: 0.7 }, env: { a: 0.001, peak: 0.4, d: 0.03 } },
    ],
    dur: 0.06, prio: 0, cooldownMs: 30, gain: [0.1, 0.8], pitch: [0.8, 1.4],
  },
  wallTick: {
    layers: [{ src: { osc: "sine", f0: 1200, f1: 900 }, env: { a: 0.001, peak: 0.4, d: 0.02 } }],
    dur: 0.025, prio: 0, cooldownMs: 25, gain: [0.2, 0.4], pitch: [0.9, 1.1],
  },
  rollover: {
    layers: [{ src: { osc: "sine", f0: 880, f1: 1320 }, env: { a: 0.003, peak: 0.5, d: 0.06 } }],
    dur: 0.07, prio: 1, cooldownMs: 40, gain: [0.5, 0.6], pitch: [1, 1],
  },
  target: {
    layers: [
      { src: { osc: "square", f0: 520, f1: 390 }, env: { a: 0.002, peak: 0.5, d: 0.08 } },
      { src: { osc: "sine", f0: 1040, f1: 1040 }, env: { a: 0.002, peak: 0.4, d: 0.05 } },
    ],
    dur: 0.09, prio: 1, cooldownMs: 40, gain: [0.5, 0.8], pitch: [1, 1],
  },
  sinkholeCapture: {
    layers: [
      { src: { osc: "sine", f0: 400, f1: 100 }, env: { a: 0.005, peak: 0.7, d: 0.2 } },
      { src: { noise: "white" }, filter: { type: "lowpass", f0: 1500, f1: 300, q: 0.7 }, env: { a: 0.005, peak: 0.4, d: 0.15 } },
    ],
    dur: 0.25, prio: 2, cooldownMs: 100, gain: [0.7, 0.7], pitch: [1, 1],
  },
  drain: {
    layers: [
      { src: { osc: "saw", f0: 300, f1: 40 }, filter: { type: "lowpass", f0: 1200, f1: 200, q: 1 }, env: { a: 0.01, peak: 0.7, d: 0.65 } },
    ],
    dur: 0.7, prio: 3, cooldownMs: 300, gain: [0.8, 0.8], pitch: [1, 1],
  },
  warn: {
    layers: [
      { src: { osc: "square", f0: 300, f1: 300 }, env: { a: 0.005, peak: 0.4, d: 0.05 } },
      { src: { osc: "square", f0: 300, f1: 300 }, at: 0.07, env: { a: 0.005, peak: 0.4, d: 0.05 } },
    ],
    dur: 0.13, prio: 2, cooldownMs: 200, gain: [0.6, 0.6], pitch: [1, 1],
  },
  tilt: {
    layers: [{ src: { osc: "saw", f0: 110, f1: 55 }, env: { a: 0.01, peak: 0.8, d: 0.55 } }],
    dur: 0.6, prio: 3, cooldownMs: 300, gain: [0.8, 0.8], pitch: [1, 1],
  },
} satisfies Record<string, Voice>;

export type SoundId = keyof typeof TABLE;
export const VOICES: Record<SoundId, Voice> = TABLE;
export const SOUND_IDS = Object.keys(VOICES) as SoundId[];
export const isSoundId = (id: string): id is SoundId => Object.hasOwn(VOICES, id);

/** Mixer limits. */
export const POLYPHONY = 16;
export const MAX_STARTS_PER_FRAME = 6;
/** A start quieter than this is not worth a voice. */
export const MIN_GAIN = 0.02;
/** A start inside the cooldown still goes through when it is this much louder than the last one. */
export const LOUDER_FACTOR = 1.5;

