import type { Command } from "../rules";
import { SOUND_CLASSES } from "../table/schema";
import type { SoundClass } from "../table/schema";

export type { Command, SoundClass };
export { SOUND_CLASSES };

/** What a sound layer hears of the sim (#15): plain data, no physics units, built per tick next to the rules' events and not hashed. */
export type AudioEvent =
  /** A named switch was hit. `s` is the impulse as a strength 0..1; `cls` is the table's sound class for the switch, if it gave one. */
  | { a: "switch"; sw: string; kind: "hit" | "kick" | "gate" | "trigger" | "capture"; cls?: SoundClass; s: number }
  | { a: "flip"; side: "L" | "R"; up: boolean }
  /** The plunger was let go; `s` is how far it was pulled, 0..1. */
  | { a: "plunge"; s: number }
  | { a: "drain" }
  | { a: "btn"; button: "coin" | "start" | "buyin" };

/** Everything since the last call, and how fast the fastest ball rolls (0..1) for a rolling loop. */
export interface AudioBatch {
  events: AudioEvent[];
  roll: number;
}

/** Impulse (N s) that counts as a strength of 1: an 80 g ball at 6 m/s. */
export const FULL_STRENGTH_SPEED = 6;
