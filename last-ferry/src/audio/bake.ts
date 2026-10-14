// Bakes a sound recipe (sounds.ts) into normalised sample buffers.
import { fade, hashSeed, peakOf, Rng } from './dsp';
import { K } from './kit';
import { SOUNDS } from './sounds';

export interface Baked {
  /** 1 (mono) or 2 (stereo) channels at `sr`. */
  channels: Float32Array<ArrayBuffer>[];
  sr: number;
  /** Peak before normalisation (diagnostics). */
  rawPeak: number;
  /** Milliseconds spent rendering (diagnostics). */
  ms: number;
}

/** Peak level every baked buffer is normalised to. */
export const BAKE_PEAK = 0.95;

/** Render variant `variant` of sound `name` at sample rate `sr` (deterministic). */
export function bake(name: string, variant: number, sr: number): Baked | null {
  const def = SOUNDS[name];
  if (!def) return null;
  const n = Math.max(1, def.variants ?? 1);
  const v = ((variant % n) + n) % n;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rate = Math.round(sr * Math.min(1, Math.max(0.25, def.rate ?? 1)));
  const k = new K(rate, new Rng(hashSeed(name, v)), v);
  const out = def.render(k);
  const channels: Float32Array<ArrayBuffer>[] = Array.isArray(out) ? [out[0], out[1]] : [out];
  let peak = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) c[i] = 0;
    peak = Math.max(peak, peakOf(c));
  }
  const g = peak > 1e-9 ? BAKE_PEAK / peak : 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) c[i] *= g;
    fade(c, rate, 0, 3);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { channels, sr: rate, rawPeak: peak, ms: t1 - t0 };
}
