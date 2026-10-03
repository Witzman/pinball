import { LOUDER_FACTOR, MAX_STARTS_PER_FRAME, MIN_GAIN, POLYPHONY, VOICES } from "./voices";
import type { SoundId, Voice } from "./voices";
import type { Play } from "./mapping";

/** What the mixer needs of a sound device: a clock and a way to start and stop a voice. */
export interface Backend {
  /** Seconds. */
  now(): number;
  /** Starts a voice at `at` (seconds on the clock) with this gain and pitch rate; returns a handle. */
  start(id: SoundId, voice: Voice, gain: number, rate: number, at: number): number;
  /** Fades the voice out quickly. */
  stop(handle: number, at: number): void;
}

interface Active {
  handle: number;
  id: SoundId;
  prio: number;
  startedAt: number;
  endsAt: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Decides which sounds actually start (#15): a cooldown per id, a limit of starts per
 * frame, a limit of voices at once (the quietest kind is stolen first, never for a lesser
 * one), and nothing below a minimum gain. Pure apart from the Backend it talks to.
 */
export class Mixer {
  private active: Active[] = [];
  private last = new Map<SoundId, { at: number; gain: number }>();
  private startsThisFrame = 0;

  constructor(private readonly backend: Backend, private readonly master = () => 1, private readonly limit = POLYPHONY) {}

  /** Call once per frame before the plays of that frame. */
  beginFrame(): void {
    this.startsThisFrame = 0;
  }

  /** Voices playing right now. */
  get voices(): number {
    return this.active.length;
  }

  /** Returns true when the sound was started. */
  play(p: Play): boolean {
    const voice: Voice = VOICES[p.id];
    const now = this.backend.now();
    const voiceGain = lerp(voice.gain[0], voice.gain[1], p.s);
    const master = this.master();
    // a voice too quiet to matter is dropped by its own gain, not by the volume: a low volume makes sounds softer, it does not silence the small ones
    if (!(voiceGain >= MIN_GAIN) || !(master > 0)) return false;
    const gain = voiceGain * master;
    if (this.startsThisFrame >= MAX_STARTS_PER_FRAME) return false;
    const last = this.last.get(p.id);
    if (last !== undefined && (now - last.at) * 1000 < voice.cooldownMs && gain <= last.gain * LOUDER_FACTOR) return false;
    this.active = this.active.filter((a) => a.endsAt > now);
    if (this.active.length >= this.limit) {
      let victim = 0;
      for (let i = 1; i < this.active.length; i++) {
        const a = this.active[i]!;
        const v = this.active[victim]!;
        if (a.prio < v.prio || (a.prio === v.prio && a.startedAt < v.startedAt)) victim = i;
      }
      if (this.active[victim]!.prio > voice.prio) return false; // never steal for a lesser sound
      this.backend.stop(this.active[victim]!.handle, now);
      this.active.splice(victim, 1);
    }
    const rate = lerp(voice.pitch[0], voice.pitch[1], p.s);
    const handle = this.backend.start(p.id, voice, gain, rate, now);
    this.active.push({ handle, id: p.id, prio: voice.prio, startedAt: now, endsAt: now + voice.dur });
    this.last.set(p.id, { at: now, gain });
    this.startsThisFrame += 1;
    return true;
  }

  /** Stops everything (a pause). */
  silence(): void {
    const now = this.backend.now();
    for (const a of this.active) this.backend.stop(a.handle, now);
    this.active = [];
  }
}
