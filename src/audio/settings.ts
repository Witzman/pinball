/** The volume and mute the player chose, kept under their own key (#15; the settings screen is #23). */
export interface AudioSettings {
  vol: number;
  mute: boolean;
}

export const AUDIO_KEY = "pinball/audio/v1";
export const DEFAULT_SETTINGS: AudioSettings = { vol: 0.7, mute: false };

/** Reads stored text defensively: anything unusable gives the defaults, a volume is clamped to 0..1. */
export function parseSettings(text: string | null): AudioSettings {
  if (text === null) return { ...DEFAULT_SETTINGS };
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== "object" || v === null) return { ...DEFAULT_SETTINGS };
    const r = v as Record<string, unknown>;
    const vol = typeof r.vol === "number" && Number.isFinite(r.vol) ? Math.min(1, Math.max(0, r.vol)) : DEFAULT_SETTINGS.vol;
    return { vol, mute: r.mute === true };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function serializeSettings(s: AudioSettings): string {
  return JSON.stringify({ v: 1, vol: s.vol, mute: s.mute });
}

/** The loudness for a volume setting: squared, so the slider feels even. */
export const masterGain = (s: AudioSettings): number => (s.mute ? 0 : s.vol * s.vol * 0.8);

/** All the audio layer needs of storage; the app's Store fits. */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
