import type { AudioEvent, Command } from "../sim/audio-events";
import { isSoundId } from "./voices";
import type { SoundId } from "./voices";

/** A sound to play and its strength 0..1 (the voice turns that into gain and pitch). */
export interface Play {
  id: SoundId;
  s: number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** A ball hit harder than this strength is a hit, softer a tick. */
export const HARD_HIT = 0.15;

/** What an event of the sim sounds like: nothing, one sound, or two. Pure. */
export function soundsFor(e: AudioEvent): Play[] {
  switch (e.a) {
    case "switch": {
      const s = clamp01(e.s);
      const hit: SoundId = s > HARD_HIT ? "ballHit" : "wallTick";
      switch (e.cls) {
        case "pop": return [{ id: "bumperPop", s }];
        case "sling": return [{ id: "slingThwack", s }];
        case "rollover": return [{ id: "rollover", s: 1 }];
        case "target": return [{ id: "target", s }];
        case "wall": return [{ id: hit, s }];
        case undefined:
          if (e.kind === "kick") return [{ id: "bumperPop", s }];
          if (e.kind === "trigger" || e.kind === "gate") return [{ id: "rollover", s: 1 }];
          if (e.kind === "capture") return [{ id: "sinkholeCapture", s: 1 }];
          return [{ id: hit, s }];
      }
      return [];
    }
    case "flip":
      return [{ id: e.up ? "flipperUp" : "flipperDown", s: 1 }];
    case "plunge":
      return [{ id: "plunger", s: clamp01(e.s) }];
    case "drain":
      return [{ id: "drain", s: 1 }];
    case "btn":
      return []; // coin, start: the machine's voices come with the next part
  }
}

/** What a command of the rules sounds like: only `sound` commands, by the name of the sound; unknown names are ignored. */
export function soundsForCommand(c: Command): Play[] {
  if (c.c === "sound" && isSoundId(c.play)) return [{ id: c.play, s: c.vol === undefined ? 1 : clamp01(c.vol) }];
  return [];
}
