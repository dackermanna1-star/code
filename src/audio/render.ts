/**
 * Render registry: maps every renderable key to its synthesis recipe and finalizes the
 * result (mono/stereo, DC block, tail trim, loudness normalization, seamless loops).
 *
 * Keys:   s:<sound>#<variant>   one-shot variation
 *         l:<loop>              seamless loop
 *         i:<instrument>:<midi> music instrument sample
 *         r:<impulse>           reverb impulse response (stereo)
 *
 * Pure & DOM-free: runs in the synthesis worker, on the main thread and in Node.
 */
import { Biquad, dcBlock, fade, peakAbs, trimTail } from './dsp/core';
import { makeIR } from './dsp/fx';
import { Rand, hashStr, mix32 } from './dsp/rand';
import { blockSounds } from './recipes/blocks';
import { creatureSounds } from './recipes/creatures';
import { INSTRUMENTS, foldLoop } from './recipes/instruments';
import { loopSpecs } from './recipes/loops';
import { sfxSounds } from './recipes/sfx';
import { portalLoops, portalSounds } from './recipes/portal';
import { heroSounds } from './recipes/hero';
import type { LoopSpec, Out, SoundSpec } from './recipes/types';
import { worldSounds } from './recipes/world';

export const SOUNDS: Readonly<Record<string, SoundSpec>> = {
  ...blockSounds(),
  ...sfxSounds(),
  ...creatureSounds(),
  ...worldSounds(),
  ...portalSounds(),
  ...heroSounds(),
};

export const LOOPS: Readonly<Record<string, LoopSpec>> = { ...loopSpecs(), ...portalLoops() };

export interface IRSpec {
  dur: number;
  t60Lo: number;
  t60Hi: number;
  predelay: number;
  early: number;
  earlySpread: number;
  earlyGain: number;
  build: number;
  lowCut?: number;
  highCut?: number;
}

/** Procedural impulse responses for the realtime convolvers. */
export const IRS: Readonly<Record<string, IRSpec>> = {
  /** Open air: ground slap + sparse distant reflections, short and bright-ish. */
  outdoor: { dur: 1.2, t60Lo: 0.9, t60Hi: 0.35, predelay: 0.012, early: 10, earlySpread: 0.09, earlyGain: 0.6, build: 0.03, lowCut: 120 },
  /** Cave: long, dark, dense rocky reverb. */
  cave: { dur: 4.2, t60Lo: 3.6, t60Hi: 1.1, predelay: 0.02, early: 24, earlySpread: 0.07, earlyGain: 0.45, build: 0.06, lowCut: 60, highCut: 9000 },
  /** Music hall: smooth, lush. */
  music: { dur: 4.5, t60Lo: 3.4, t60Hi: 2.0, predelay: 0.03, early: 12, earlySpread: 0.05, earlyGain: 0.25, build: 0.12, lowCut: 90 },
};

export interface Rendered {
  ch: Float32Array[];
  sr: number;
  /** Whole-buffer loop (pads, loops). */
  loop?: boolean;
  /** Synthesis time (ms) — diagnostics. */
  ms?: number;
}

const toCh = (o: Out): Float32Array[] => (Array.isArray(o) ? o : [o]);

/** Short-term loudness (dB): max mean-square over 30 ms windows of a K-ish weighted signal. */
export function loudnessDb(ch: Float32Array[], sr: number, whole = false): number {
  const n = ch[0].length;
  const ms = new Float64Array(n);
  for (const c of ch) {
    const shelf = new Biquad('hs', sr, 1700, 0.7071, 4);
    const hp = new Biquad('hp', sr, 60, 0.5);
    for (let i = 0; i < n; i++) {
      const y = shelf.tick(hp.tick(c[i]));
      ms[i] += y * y;
    }
  }
  if (whole) {
    let s = 0;
    for (let i = 0; i < n; i++) s += ms[i];
    return 10 * Math.log10(Math.max(1e-20, s / n / ch.length));
  }
  const w = Math.max(1, Math.round(0.03 * sr));
  const hop = Math.max(1, Math.round(0.01 * sr));
  let best = 0;
  let acc = 0;
  for (let i = 0; i < Math.min(w, n); i++) acc += ms[i];
  best = acc;
  for (let i = w; i < n; i++) {
    acc += ms[i] - ms[i - w];
    if ((i - w) % hop === 0 && acc > best) best = acc;
  }
  return 10 * Math.log10(Math.max(1e-20, best / Math.min(w, n) / ch.length));
}

const PEAK_CEIL = 0.891; // −1 dBFS

function sanitize(ch: Float32Array[]): boolean {
  let bad = false;
  for (const c of ch) {
    for (let i = 0; i < c.length; i++) {
      if (!Number.isFinite(c[i])) {
        c[i] = 0;
        bad = true;
      }
    }
  }
  return bad;
}

function normalize(ch: Float32Array[], sr: number, targetDb: number, whole: boolean): void {
  const L = loudnessDb(ch, sr, whole);
  let g = Math.pow(10, (targetDb - L) / 20);
  let pk = 0;
  for (const c of ch) pk = Math.max(pk, peakAbs(c));
  if (pk <= 0) return;
  if (pk * g > PEAK_CEIL) g = PEAK_CEIL / pk;
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= g;
}

function toMono(ch: Float32Array[]): Float32Array[] {
  if (ch.length === 1) return ch;
  const n = Math.min(...ch.map((c) => c.length));
  const m = new Float32Array(n);
  for (const c of ch) for (let i = 0; i < n; i++) m[i] += c[i] / ch.length;
  return [m];
}

/** Seed for a sound variant (stable across sessions & sample rates). */
export const variantSeed = (name: string, v: number): number => mix32(hashStr(name), v + 1);

export function renderSound(name: string, v: number, sr: number): Rendered | null {
  const spec = SOUNDS[name];
  if (!spec) return null;
  const t0 = now();
  const rsr = sr / (spec.div ?? 1);
  const r = new Rand(variantSeed(name, v));
  let ch = toCh(spec.gen(rsr, r, v));
  if (sanitize(ch)) console.warn(`[audio] non-finite samples in ${name}#${v}`);
  // one-shots are positional → mono unless they're explicitly stereo (non-positional) sounds
  if (!isStereoSound(name)) ch = toMono(ch);
  for (const c of ch) dcBlock(c, rsr, 12);
  ch = trimTail(ch, rsr, 1.5e-4, 0.02);
  for (const c of ch) fade(c, rsr, 0.0003, 0);
  normalize(ch, rsr, spec.loud ?? -16, false);
  return { ch, sr: rsr, ms: now() - t0 };
}

/** Non-positional sounds keep their stereo image. */
export function isStereoSound(name: string): boolean {
  return name.startsWith('weather.') || name === 'portal.trigger' || name === 'portal.travel';
}

export function renderLoop(name: string, sr: number): Rendered | null {
  const spec = LOOPS[name];
  if (!spec) return null;
  const t0 = now();
  const rsr = sr / (spec.div ?? 1);
  const r = new Rand(variantSeed(name, 0));
  const xf = spec.xf ?? 0.5;
  let ch = toCh(spec.gen(rsr, r, spec.dur + xf));
  sanitize(ch);
  if (!spec.stereo) ch = toMono(ch);
  ch = ch.map((c) => foldLoop(dcBlock(c, rsr, 15), rsr, spec.dur, xf));
  normalize(ch, rsr, spec.loud ?? -20, true);
  return { ch, sr: rsr, loop: true, ms: now() - t0 };
}

export function renderInstrument(inst: string, midi: number, sr: number): Rendered | null {
  const spec = INSTRUMENTS[inst];
  if (!spec) return null;
  const t0 = now();
  const rsr = sr / (spec.div ?? 1);
  const r = new Rand(mix32(hashStr(inst), midi));
  const ch = spec.render(rsr, r, midi);
  sanitize(ch);
  let pk = 0;
  for (const c of ch) pk = Math.max(pk, peakAbs(c));
  const g = pk > 0 ? spec.peak / pk : 1;
  for (const c of ch) {
    for (let i = 0; i < c.length; i++) c[i] *= g;
    if (!spec.loop) fade(c, rsr, 0, 0.05);
  }
  return { ch, sr: rsr, loop: !!spec.loop, ms: now() - t0 };
}

export function renderIR(name: string, sr: number): Rendered | null {
  const spec = IRS[name];
  if (!spec) return null;
  const t0 = now();
  const ch = makeIR(sr, new Rand(variantSeed(name, 0)), spec);
  return { ch, sr, ms: now() - t0 };
}

/** Renders any key (see module doc). Returns null for unknown keys. */
export function renderKey(key: string, sr: number): Rendered | null {
  const kind = key.charCodeAt(0);
  const body = key.slice(2);
  if (kind === 115 /* s */) {
    const hash = body.lastIndexOf('#');
    return renderSound(body.slice(0, hash), Number(body.slice(hash + 1)) | 0, sr);
  }
  if (kind === 108 /* l */) return renderLoop(body, sr);
  if (kind === 105 /* i */) {
    const c = body.lastIndexOf(':');
    return renderInstrument(body.slice(0, c), Number(body.slice(c + 1)) | 0, sr);
  }
  if (kind === 114 /* r */) return renderIR(body, sr);
  return null;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
