import type { Rand } from '../dsp/rand';

/** Mixer category a sound is routed to (`master` is the global bus, not a category). */
export type Cat = 'music' | 'blocks' | 'hostile' | 'neutral' | 'players' | 'ambient' | 'weather' | 'ui';

/** Mono buffer or [L, R] channels. */
export type Out = Float32Array | Float32Array[];

/** Recipe: renders variation `v` at sample rate `sr` using the seeded random stream `r`. */
export type Gen = (sr: number, r: Rand, v: number) => Out;

export interface SoundSpec {
  cat: Cat;
  /** Number of pre-rendered variations (2-4). */
  n: number;
  gen: Gen;
  /** Mix level multiplier applied at playback (after loudness normalization). */
  level?: number;
  /** ± random pitch variation (fraction) applied at playback. */
  pv?: number;
  /** Render at sampleRate / div (dull or long sounds — saves memory and CPU). */
  div?: 1 | 2 | 4;
  /** Max simultaneous instances of this sound. */
  max?: number;
  /** Loudness target (dB short-term RMS, K-ish weighted). Default −16. */
  loud?: number;
  /** Positional reverb send multiplier (0 = dry, e.g. UI-like player sounds). */
  send?: number;
}

export interface LoopSpec {
  cat: Cat;
  /** Seamless loop length (s). */
  dur: number;
  /** Crossfade overlap rendered beyond `dur` (s). */
  xf?: number;
  stereo?: boolean;
  /** Render `len` seconds (dur + xf). */
  gen: (sr: number, r: Rand, len: number) => Out;
  level?: number;
  div?: 1 | 2 | 4;
  loud?: number;
}
