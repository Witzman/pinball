import type { Backend } from "./mixer";
import type { SoundId, Voice } from "./voices";

// The real sound device (#15): Web Audio. Loaded lazily, on the first gesture, so it is
// not part of the first load. Everything it plays comes from the voice tables; the noise
// comes from a fixed seed, so the same sound is the same sound every time.

export interface Engine extends Backend {
  suspend(): void;
  resume(): void;
}

/** The slice of AudioContext this engine uses; a test can supply a fake. */
export type ContextFactory = () => AudioContext;

const NOISE_SECONDS = 1;
const FADE = 0.004;
const SILENT = 0.0001;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function noiseBuffer(ctx: AudioContext, kind: "white" | "brown"): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = lcg(kind === "white" ? 12345 : 54321);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    if (kind === "white") d[i] = w;
    else {
      last = (last + 0.02 * w) / 1.02; // leaky integrator: brown noise
      d[i] = last * 3.5;
    }
  }
  return buf;
}

const OSC_TYPE = { sine: "sine", square: "square", saw: "sawtooth", tri: "triangle" } as const;

export function createEngine(make: ContextFactory = () => new AudioContext()): Engine {
  const ctx = make();
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);
  const buffers = { white: noiseBuffer(ctx, "white"), brown: noiseBuffer(ctx, "brown") };
  let nextHandle = 1;
  const voices = new Map<number, GainNode[]>();

  return {
    now: () => ctx.currentTime,
    start(_id: SoundId, voice: Voice, gain: number, rate: number, at: number): number {
      const handle = nextHandle++;
      const gains: GainNode[] = [];
      for (const layer of voice.layers) {
        const t0 = at + (layer.at ?? 0);
        const { a, peak, d } = layer.env;
        const g = ctx.createGain();
        g.gain.setValueAtTime(SILENT, t0);
        g.gain.linearRampToValueAtTime(Math.max(SILENT, peak * gain), t0 + a);
        g.gain.exponentialRampToValueAtTime(SILENT, t0 + a + d);
        g.gain.setValueAtTime(0, t0 + a + d + 0.001);
        let src: AudioScheduledSourceNode;
        if ("osc" in layer.src) {
          const o = ctx.createOscillator();
          o.type = OSC_TYPE[layer.src.osc];
          o.frequency.setValueAtTime(layer.src.f0 * rate, t0);
          o.frequency.exponentialRampToValueAtTime(Math.max(1, layer.src.f1 * rate), t0 + a + d);
          src = o;
        } else {
          const b = ctx.createBufferSource();
          b.buffer = buffers[layer.src.noise];
          b.loop = true;
          src = b;
        }
        if (layer.filter) {
          const f = ctx.createBiquadFilter();
          f.type = layer.filter.type;
          f.Q.value = layer.filter.q;
          f.frequency.setValueAtTime(layer.filter.f0 * rate, t0);
          f.frequency.exponentialRampToValueAtTime(Math.max(1, layer.filter.f1 * rate), t0 + a + d);
          src.connect(f);
          f.connect(g);
        } else src.connect(g);
        g.connect(compressor);
        src.start(t0);
        src.stop(t0 + Math.min(voice.dur, a + d) + 0.02);
        src.onended = () => {
          src.disconnect();
          g.disconnect();
        };
        gains.push(g);
      }
      voices.set(handle, gains);
      return handle;
    },
    stop(handle: number, at: number): void {
      for (const g of voices.get(handle) ?? []) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(0, at, FADE / 2);
      }
      voices.delete(handle);
    },
    suspend: () => void ctx.suspend(),
    resume: () => void ctx.resume(),
  };
}
