// Mochi's voice: a small formant synthesiser.
//
// Source  : band-limited saw/pulse mix (PolyBLEP) with spectral tilt + glottal-synchronous breath.
// Tract   : 3 parallel band-pass formants following vowel targets (+ a nasal murmur path).
// Scripts : each phrase is a list of segments (pitch / vowel / amplitude breakpoints, consonant
//           noise bursts, vibrato, lip trill...). Every render gets a little random variation.
// Pure (no Web Audio) so phrases can be rendered in node for tests.

import type { VoicePhrase } from './types';
import {
  Rng,
  Noise,
  Svf,
  OnePole,
  Biquad,
  TAU,
  clamp,
  polyBlep,
  smoothRandom,
  dcBlock,
  fadeIn,
  trimTail,
  normalizeLoudness,
} from './dsp';

export type VowelKey = 'a' | 'ae' | 'e' | 'eh' | 'i' | 'ih' | 'o' | 'aw' | 'oo' | 'u' | 'uh' | 'er' | 'm' | 'n' | 'l' | 'w' | 'y';
export type FricKind = 's' | 'sh' | 'f' | 'h' | 'k' | 't' | 'p' | 'sniff' | 'growl';
/** A constant, or breakpoints spread evenly across the segment. */
export type Curve = number | readonly number[];

export interface Seg {
  /** duration (s) */
  d: number;
  /** vowel target(s) across the segment */
  v?: VowelKey | readonly VowelKey[];
  /** pitch in semitones relative to Mochi's base pitch (carries over when omitted) */
  p?: Curve;
  /** voiced amplitude 0..1 (0 when omitted) */
  a?: Curve;
  /** breath / aspiration through the vocal tract 0..1 */
  br?: Curve;
  /** extra nasality 0..1 */
  nas?: number;
  /** consonant noise (not shaped by the formants) */
  fr?: { k: FricKind; a: Curve };
  /** vibrato depth (semitones) and rate (Hz) */
  vib?: number;
  vr?: number;
  /** lip/tongue trill rate (Hz) and depth 0..1 */
  trill?: number;
  tr?: number;
  /** brightness 0..1 */
  tilt?: number;
}

interface Vowel {
  f: readonly [number, number, number];
  g: readonly [number, number, number];
  nasal?: number;
}

// Formant targets (≈ adult female values; scaled up at render time for a small creature).
const VOWELS: Record<VowelKey, Vowel> = {
  a: { f: [880, 1300, 2850], g: [1, 0.6, 0.28] },
  ae: { f: [820, 1900, 2800], g: [1, 0.62, 0.3] },
  e: { f: [500, 2350, 2950], g: [1, 0.6, 0.34] },
  eh: { f: [650, 2050, 2850], g: [1, 0.6, 0.3] },
  i: { f: [330, 2700, 3300], g: [1, 0.55, 0.35] },
  ih: { f: [450, 2300, 3000], g: [1, 0.55, 0.3] },
  o: { f: [560, 980, 2800], g: [1, 0.55, 0.18] },
  aw: { f: [700, 1080, 2750], g: [1, 0.55, 0.2] },
  oo: { f: [470, 1150, 2700], g: [1, 0.45, 0.15] },
  u: { f: [360, 900, 2650], g: [1, 0.35, 0.12] },
  uh: { f: [720, 1450, 2800], g: [1, 0.55, 0.25] },
  er: { f: [500, 1550, 1950], g: [1, 0.5, 0.3] },
  m: { f: [280, 1150, 2500], g: [0.5, 0.05, 0.02], nasal: 1 },
  n: { f: [280, 1650, 2650], g: [0.5, 0.07, 0.03], nasal: 1 },
  l: { f: [380, 1150, 2900], g: [1, 0.3, 0.15] },
  w: { f: [330, 760, 2500], g: [1, 0.3, 0.08] },
  y: { f: [300, 2800, 3400], g: [1, 0.5, 0.35] },
};

type PhraseKey = VoicePhrase | 'hiccup';

function rep(n: number, f: (i: number) => Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) out.push(...f(i));
  return out;
}

/** Phrase scripts. Pitches are semitones above/below Mochi's base pitch (~400 Hz). */
export const PHRASES: Record<PhraseKey, (r: Rng) => Seg[]> = {
  yum: (r) => [
    { d: 0.05, v: 'y', p: [1, 2], a: [0, 0.75] },
    { d: 0.09, v: ['y', 'u'], p: [2, 4], a: [0.8, 0.95] },
    { d: 0.17, v: 'u', p: [4, 6 + r.range(0, 1.5)], a: [0.95, 1], vib: 0.2 },
    { d: 0.2, v: ['u', 'm', 'm'], p: [7, 6], a: [0.85, 0.55, 0], vib: 0.25 },
  ],
  mmm: (r) => [
    { d: 0.06, v: 'm', p: [0], a: [0, 0.6] },
    { d: 0.9, v: 'm', p: [0.5, 2.5, 1.5, 4.5, 3.5, r.range(6, 8)], a: [0.7, 0.9, 1, 0.95, 0.85, 0], vib: 0.3, br: 0.05 },
  ],
  wow: () => [
    { d: 0.07, v: 'w', p: [1, 3], a: [0, 0.8] },
    { d: 0.2, v: ['w', 'a'], p: [3, 9], a: [0.85, 1] },
    { d: 0.2, v: ['a', 'aw'], p: [9, 7], a: [1, 0.9], vib: 0.25 },
    { d: 0.13, v: ['aw', 'w'], p: [7, 4], a: [0.85, 0] },
  ],
  yay: (r) => [
    { d: 0.05, v: 'y', p: [4, 5], a: [0, 0.8] },
    { d: 0.11, v: ['y', 'ae'], p: [5, 9], a: [0.85, 1] },
    { d: 0.17, v: ['ae', 'e'], p: [9, 12, 12], a: [1, 1], vib: 0.3 },
    { d: 0.12, v: ['e', 'i'], p: [12, 11], a: [0.9, 0] },
    ...(r.chance(0.5)
      ? ([
          { d: 0.05, a: 0 },
          { d: 0.04, v: 'y', p: [9, 11], a: [0, 0.7] },
          { d: 0.16, v: ['ae', 'e', 'i'], p: [12, 14, 13], a: [0.85, 0.9, 0], vib: 0.3 },
        ] as Seg[])
      : []),
  ],
  love: () => [
    { d: 0.32, v: ['a', 'aw'], p: [7, 6, 4], a: [0, 1, 0.85], br: 0.22, vib: 0.35 },
    { d: 0.05, v: 'l', p: [4], a: [0.6] },
    { d: 0.28, v: ['uh', 'u'], p: [5, 2], a: [0.95, 0.8], vib: 0.4 },
    { d: 0.11, v: 'u', p: [2, 1], a: [0.55, 0], fr: { k: 'f', a: [0, 0.1, 0] } },
  ],
  ok: () => [
    { d: 0.15, v: ['o', 'oo'], p: [3, 4], a: [0, 1, 0.9] },
    { d: 0.035, v: 'oo', p: [4], a: [0.3, 0] },
    { d: 0.035, fr: { k: 'k', a: 0.6 } },
    { d: 0.21, v: ['e', 'i'], p: [7, 5], a: [0.95, 0], br: 0.08 },
  ],
  hmm: () => [
    { d: 0.06, v: 'm', p: [0, 1], a: [0, 0.6], br: 0.2 },
    { d: 0.5, v: 'm', p: [1, 5, 2], a: [0.7, 0.95, 0], vib: 0.18 },
  ],
  huh: () => [
    { d: 0.06, v: 'uh', p: [0], a: [0, 0.15], br: [0.1, 0.7] },
    { d: 0.24, v: 'uh', p: [0, 7], a: [0.85, 1, 0], br: 0.15 },
  ],
  eww: () => [
    { d: 0.08, v: 'i', p: [6, 5], a: [0, 0.9], nas: 0.5 },
    { d: 0.24, v: ['i', 'e'], p: [5, 3], a: [0.9, 1], nas: 0.6, vib: 0.25 },
    { d: 0.3, v: ['e', 'u'], p: [3, -4], a: [1, 0], nas: 0.6 },
  ],
  bleh: () => [
    { d: 0.035, v: 'm', p: [4], a: [0, 0.45] },
    { d: 0.012, fr: { k: 'p', a: 0.4 } },
    { d: 0.05, v: ['l', 'eh'], p: [4, 5], a: [0.7, 1] },
    { d: 0.3, v: 'eh', p: [5, 0], a: [1, 0], trill: 23, tr: 0.4, br: 0.2 },
  ],
  yuck: () => [
    { d: 0.06, v: 'y', p: [5, 6], a: [0, 0.8] },
    { d: 0.16, v: ['y', 'uh'], p: [6, 1], a: [0.9, 1], nas: 0.3 },
    { d: 0.035, v: 'uh', p: [1], a: [0.4, 0] },
    { d: 0.05, fr: { k: 'k', a: 0.6 } },
  ],
  spicy: () => [
    ...rep(3, (i) => [
      { d: 0.035, v: 'ae', p: [7 + i], a: 0, br: [0.2, 0.9] },
      { d: 0.13, v: ['ae', 'a'], p: [8 + i, 7 + i], a: [0.6, 0.35], br: [0.75, 0.5] },
      { d: 0.05, a: 0 },
    ]),
    { d: 0.04, v: 'ae', p: [10], a: 0, br: [0.2, 0.9] },
    { d: 0.36, v: ['ae', 'a'], p: [11, 4], a: [0.8, 0], br: [0.7, 0.4], vib: 0.3 },
  ],
  sour: () => [
    { d: 0.34, v: 'u', p: [3, 2], a: [0, 0.9, 0.8], vib: 0.6, vr: 9, nas: 0.3 },
    { d: 0.06, v: ['u', 'i'], p: [2, 10], a: [0.8, 0.9] },
    { d: 0.18, v: 'i', p: [12, 10], a: [0.9, 0], vib: 0.5, vr: 9 },
  ],
  brr: () => [
    { d: 0.03, v: 'm', p: [2], a: [0, 0.4], fr: { k: 'p', a: 0.3 } },
    { d: 0.65, v: ['oo', 'u'], p: [2, 0, 1, -1], a: [0.9, 0.85, 0], trill: 27, tr: 0.85, vib: 0.5, vr: 9 },
  ],
  hot: () =>
    rep(3, (i) => [
      { d: 0.04, v: 'oo', p: [5 + i * 2], a: 0, br: [0, 0.8] },
      { d: 0.12, v: ['oo', 'u'], p: [6 + i * 2, 4 + i * 2], a: [0.65, 0.2], br: 0.7 },
      { d: 0.06, a: 0 },
    ]),
  giggle: (r) =>
    rep(r.int(4, 5), (i) => [
      { d: 0.028, v: 'i', p: [3 + i * 2], a: 0, br: [0.1, 0.85] },
      { d: 0.07, v: ['ih', 'i'], p: [4 + i * 2, 3 + i * 2], a: [0.95, 0.25], br: 0.25 },
      { d: 0.035, a: 0 },
    ]),
  gasp: () => [
    { d: 0.2, v: ['ae', 'a'], p: [8], a: 0, br: [0.1, 1] },
    { d: 0.02, a: 0 },
    { d: 0.11, v: 'a', p: [12, 14], a: [0.95, 0], br: 0.2 },
  ],
  aah: () => [
    { d: 0.06, v: 'a', p: [4], a: [0, 0.6], br: 0.5 },
    { d: 0.62, v: 'a', p: [4, 3, 0], a: [0.8, 0.9, 0], br: 0.28, vib: 0.25 },
  ],
  nom: () =>
    rep(2, (i) => [
      { d: 0.05, v: 'n', p: [4 + i * 2, 5 + i * 2], a: [0, 0.7] },
      { d: 0.1, v: 'o', p: [5 + i * 2, 4 + i * 2], a: [0.95, 0.9] },
      { d: 0.07, v: 'm', p: [4 + i * 2, 3 + i * 2], a: [0.7, 0] },
      { d: 0.04, a: 0 },
    ]),
  sigh: () => [
    { d: 0.12, v: 'a', p: [4], a: 0, br: [0, 0.8] },
    { d: 0.7, v: ['a', 'uh'], p: [4, -2], a: [0.25, 0.3, 0], br: [0.8, 0.35, 0] },
  ],
  hungry: () => [
    { d: 0.32, fr: { k: 'growl', a: [0, 0.5, 0.35, 0] } },
    { d: 0.15, v: 'm', p: [2, 1], a: [0, 0.7] },
    { d: 0.06, v: ['m', 'a'], p: [1, 0], a: [0.7, 0.9] },
    { d: 0.2, v: 'a', p: [0, -1], a: [0.9, 0.5], vib: 0.3 },
    { d: 0.05, v: 'm', p: [0], a: [0.4, 0.5] },
    { d: 0.06, v: ['m', 'a'], p: [2, 4], a: [0.6, 0.9] },
    { d: 0.3, v: ['a', 'e'], p: [4, 9], a: [0.9, 0], vib: 0.3 },
  ],
  hi: () => [
    { d: 0.05, v: 'a', p: [5], a: 0, br: [0, 0.7] },
    { d: 0.25, v: ['a', 'i'], p: [5, 10, 8], a: [0.85, 1, 0], br: 0.1, vib: 0.2 },
  ],
  'oh-no': () => [
    { d: 0.2, v: ['o', 'oo'], p: [6, 4], a: [0, 1, 0.8] },
    { d: 0.05, v: 'n', p: [3, 2], a: [0.6, 0.6] },
    { d: 0.32, v: ['o', 'u'], p: [3, -2], a: [0.9, 0], vib: 0.35 },
  ],
  'uh-oh': () => [
    { d: 0.16, v: 'uh', p: [5], a: [0, 1, 0.8] },
    { d: 0.06, a: 0 },
    { d: 0.28, v: ['o', 'oo'], p: [2, 0], a: [0.95, 0], vib: 0.2 },
  ],
  'ta-da': () => [
    { d: 0.015, v: 'a', p: [2], fr: { k: 't', a: 0.55 } },
    { d: 0.11, v: 'a', p: [2], a: [0.9, 0.7] },
    { d: 0.035, v: 'a', p: [2], a: [0.25, 0.15] },
    { d: 0.012, fr: { k: 't', a: 0.3 } },
    { d: 0.46, v: ['a', 'ae'], p: [7, 9, 9], a: [1, 0.95, 0], vib: 0.4 },
  ],
  hehe: () =>
    rep(2, (i) => [
      { d: 0.035, v: 'eh', p: [5 + i * 2], a: 0, br: [0.1, 0.8] },
      { d: 0.08, v: ['eh', 'e'], p: [5 + i * 2, 4 + i * 2], a: [0.9, 0.2], br: 0.2 },
      { d: 0.05, a: 0 },
    ]),
  ooh: () => [
    { d: 0.08, v: 'oo', p: [0, 2], a: [0, 0.8] },
    { d: 0.46, v: ['oo', 'u'], p: [2, 8, 6], a: [0.9, 1, 0], vib: 0.3 },
  ],
  'sniff-hmm': () => [
    { d: 0.1, fr: { k: 'sniff', a: [0, 0.6] } },
    { d: 0.06, a: 0 },
    { d: 0.09, fr: { k: 'sniff', a: [0, 0.7] } },
    { d: 0.13, a: 0 },
    { d: 0.46, v: 'm', p: [0, 6], a: [0, 0.9, 0], vib: 0.15 },
  ],
  cry: () => [
    { d: 0.08, v: 'w', p: [5, 6], a: [0, 0.7] },
    { d: 0.6, v: ['w', 'a', 'ae'], p: [7, 6, 4], a: [0.8, 1, 0.75], vib: 0.8, vr: 5, br: 0.2 },
    { d: 0.2, v: ['ae', 'a'], p: [4, 1], a: [0.6, 0] },
    { d: 0.14, v: 'a', p: [3], a: 0, br: [0, 0.45, 0] },
    { d: 0.36, v: ['w', 'a'], p: [5, 2], a: [0.65, 0], vib: 0.8, vr: 5, br: 0.15 },
  ],
  cough: () =>
    rep(2, (i) => [
      { d: 0.025, v: 'uh', p: [3 - i], fr: { k: 'k', a: 0.45 } },
      { d: 0.11, v: 'uh', p: [3 - i, -i], a: [0.55, 0], br: [0.8, 0.4] },
      { d: 0.07 + i * 0.02, a: 0 },
    ]),
  burp: () => [
    { d: 0.42, v: ['o', 'oo', 'u'], p: [-12, -13, -14.5], a: [0, 1, 0.8, 0], trill: 32, tr: 0.5, br: 0.15, tilt: 0.25 },
  ],
  hiccup: () => [
    { d: 0.045, v: 'ih', p: [9], a: 0, br: [0.1, 0.6] },
    { d: 0.075, v: 'ih', p: [9, 13], a: [0.95, 0], br: 0.2 },
  ],
};

/** Per-phrase loudness trims (dB) so breathy / hummed phrases sit a little lower. */
export const PHRASE_TRIM: Partial<Record<PhraseKey, number>> = {
  sigh: -3,
  hmm: -2,
  mmm: -1.5,
  'sniff-hmm': -2,
  brr: -1.5,
  hot: -1,
  cough: -1.5,
  burp: -1,
  hiccup: -2,
  cry: -1,
};

export const VOICE_REF_DB = -20.5;
export const VOICE_PEAK_CAP = 0.7;
export const MOCHI_BASE_HZ = 400;

function curveAt(c: Curve, x: number): number {
  if (typeof c === 'number') return c;
  if (c.length === 1) return c[0];
  const p = clamp(x, 0, 1) * (c.length - 1);
  const k = Math.min(c.length - 2, Math.floor(p));
  return c[k] + (c[k + 1] - c[k]) * (p - k);
}
function curveEnd(c: Curve): number {
  return typeof c === 'number' ? c : c[c.length - 1];
}

export interface VoiceParams {
  /** base pitch (Hz) */
  base: number;
  /** formant scale (>1 = smaller creature) */
  fscale: number;
  /** duration multiplier */
  tempo: number;
  /** default vibrato rate (Hz) */
  vibRate: number;
}

export function randomVoiceParams(r: Rng): VoiceParams {
  return {
    base: MOCHI_BASE_HZ * Math.pow(2, (r.bi() * 0.7) / 12),
    fscale: 1.16 * (1 + r.bi() * 0.03),
    tempo: 1 + r.bi() * 0.07,
    vibRate: 5.6 + r.bi() * 0.6,
  };
}

const CR = 32; // control-rate block (samples)

/** Renders a segment script to a raw (un-normalised) mono buffer. */
export function synthSegments(segs: readonly Seg[], sr: number, rng: Rng, vp: VoiceParams): Float32Array {
  const tempo = vp.tempo;
  const total = segs.reduce((s, g) => s + g.d * tempo, 0) + 0.08;
  const n = Math.ceil(total * sr);
  const frames = Math.ceil(n / CR) + 2;
  const pitch = new Float32Array(frames);
  const amp = new Float32Array(frames);
  const breath = new Float32Array(frames);
  const F = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  const G = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  const nasal = new Float32Array(frames);
  const vibD = new Float32Array(frames);
  const vibR = new Float32Array(frames);
  const trD = new Float32Array(frames);
  const trR = new Float32Array(frames);
  const tilt = new Float32Array(frames);

  // --- control trajectories
  let segIdx = 0;
  let segStart = 0;
  let lastP = segs.find((s) => s.p !== undefined)?.p;
  let lastPitch = lastP !== undefined ? curveAt(lastP, 0) : 0;
  const firstV = segs.find((s) => s.v !== undefined)?.v ?? 'uh';
  let lastVowel: VowelKey = typeof firstV === 'string' ? firstV : firstV[0];
  const ends: number[] = [];
  {
    let acc = 0;
    for (const s of segs) ends.push((acc += s.d * tempo));
  }
  for (let k = 0; k < frames; k++) {
    const t = (k * CR) / sr;
    while (segIdx < segs.length && t >= ends[segIdx]) {
      const s = segs[segIdx];
      if (s.p !== undefined) lastPitch = curveEnd(s.p);
      if (s.v !== undefined) lastVowel = typeof s.v === 'string' ? s.v : s.v[s.v.length - 1];
      segStart = ends[segIdx];
      segIdx++;
    }
    const s = segs[segIdx];
    if (!s) {
      pitch[k] = lastPitch;
      amp[k] = 0;
      breath[k] = 0;
      const vw = VOWELS[lastVowel];
      for (let j = 0; j < 3; j++) {
        F[j][k] = vw.f[j];
        G[j][k] = vw.g[j];
      }
      nasal[k] = vw.nasal ?? 0;
      vibD[k] = 0.1;
      vibR[k] = vp.vibRate;
      tilt[k] = 0.5;
      continue;
    }
    const x = (t - segStart) / (s.d * tempo);
    pitch[k] = s.p !== undefined ? curveAt(s.p, x) : lastPitch;
    amp[k] = s.a !== undefined ? curveAt(s.a, x) : 0;
    breath[k] = s.br !== undefined ? curveAt(s.br, x) : 0;
    let va: Vowel;
    let vb: Vowel;
    let vx = 0;
    if (s.v === undefined) va = vb = VOWELS[lastVowel];
    else if (typeof s.v === 'string') va = vb = VOWELS[s.v as VowelKey];
    else {
      const arr = s.v as readonly VowelKey[];
      const p = clamp(x, 0, 1) * (arr.length - 1);
      const i = Math.min(arr.length - 2, Math.floor(p));
      va = VOWELS[arr[Math.max(0, i)]];
      vb = VOWELS[arr[Math.min(arr.length - 1, i + 1)]];
      vx = arr.length > 1 ? p - i : 0;
    }
    for (let j = 0; j < 3; j++) {
      F[j][k] = va.f[j] + (vb.f[j] - va.f[j]) * vx;
      G[j][k] = va.g[j] + (vb.g[j] - va.g[j]) * vx;
    }
    nasal[k] = (va.nasal ?? 0) + ((vb.nasal ?? 0) - (va.nasal ?? 0)) * vx + (s.nas ?? 0) * 0.5;
    vibD[k] = s.vib ?? 0.1;
    vibR[k] = s.vr ?? vp.vibRate;
    trD[k] = s.trill ? (s.tr ?? 0.6) : 0;
    trR[k] = s.trill ?? 0;
    tilt[k] = s.tilt ?? 0.5;
  }

  // --- smooth the controls (one-pole per trajectory)
  const smooth = (arr: Float32Array, tau: number) => {
    const a = Math.exp(-CR / (tau * sr));
    let z = arr[0];
    for (let k = 0; k < arr.length; k++) {
      z = arr[k] + a * (z - arr[k]);
      arr[k] = z;
    }
  };
  smooth(pitch, 0.018);
  smooth(amp, 0.006);
  smooth(breath, 0.008);
  for (let j = 0; j < 3; j++) {
    smooth(F[j], 0.014);
    smooth(G[j], 0.014);
  }
  smooth(nasal, 0.02);
  smooth(vibD, 0.06);
  smooth(vibR, 0.06);
  smooth(trD, 0.02);
  smooth(tilt, 0.03);

  // --- audio-rate synthesis
  const out = new Float32Array(n);
  const drift = smoothRandom(frames, Math.max(3, total * 4), rng);
  const nz = new Noise(rng);
  const bp = [new Svf(), new Svf(), new Svf()];
  const BW = [110, 150, 220];
  const tiltLp = new OnePole();
  const aspHp = new OnePole().set(500, sr);
  const nas1 = new OnePole();
  const nas2 = new OnePole();
  let ph = 0;
  let vph = rng.next() * TAU;
  let tph = 0;
  const fs = vp.fscale;
  for (let k = 0; k < frames - 1; k++) {
    const i0 = k * CR;
    if (i0 >= n) break;
    const i1 = Math.min(n, i0 + CR);
    // per-block filter updates
    const f0Block = vp.base * Math.pow(2, pitch[k] / 12);
    for (let j = 0; j < 3; j++) {
      let fc = F[j][k] * fs;
      if (j === 0) fc = Math.max(fc, f0Block * 1.08); // formant tuning: keep F1 above the fundamental
      if (j === 1) fc = Math.max(fc, F[0][k] * fs * 1.35);
      bp[j].set(fc, fc / (BW[j] * (0.9 + 0.2 * fs)), sr);
    }
    tiltLp.set((700 + 2600 * tilt[k]) * (0.75 + 0.5 * amp[k]), sr);
    const nf = Math.max(380, f0Block * 1.3);
    nas1.set(nf, sr);
    nas2.set(nf, sr);
    const nasK = clamp(nasal[k], 0, 1);
    const g0 = G[0][k] * (1 - 0.5 * nasK);
    const g1 = G[1][k] * (1 - 0.6 * nasK);
    const g2 = G[2][k] * (1 - 0.6 * nasK);
    for (let i = i0; i < i1; i++) {
      const fr = (i - i0) / CR;
      const st = pitch[k] + (pitch[k + 1] - pitch[k]) * fr + vibD[k] * Math.sin(vph) + drift[k] * 0.12;
      const a = amp[k] + (amp[k + 1] - amp[k]) * fr;
      const b = breath[k] + (breath[k + 1] - breath[k]) * fr;
      const f0 = vp.base * Math.pow(2, st / 12);
      const dt = f0 / sr;
      ph += dt;
      if (ph >= 1) ph -= 1;
      vph += (TAU * vibR[k]) / sr;
      // glottal source: band-limited saw + narrow pulse
      const saw = 2 * ph - 1 - polyBlep(ph, dt);
      const w = 0.38;
      let pulse = ph < w ? 1 : -1;
      pulse += polyBlep(ph, dt);
      pulse -= polyBlep((ph - w + 1) % 1, dt);
      const src = tiltLp.lp(0.65 * saw + 0.35 * pulse);
      const asp = aspHp.hp(nz.white()) * (a > 0.05 ? (ph < 0.5 ? 1 : 0.55) : 1);
      const exc = a * src + b * asp * 0.9;
      let y = 0;
      bp[0].run(exc);
      y += g0 * bp[0].bpn;
      bp[1].run(exc);
      y += g1 * bp[1].bpn;
      bp[2].run(exc);
      y += g2 * bp[2].bpn;
      // nasal murmur (closed-mouth hum)
      y += nas2.lp(nas1.lp(a * src)) * nasK * 1.5;
      // lip / tongue trill
      if (trD[k] > 0.001) {
        tph += (TAU * trR[k]) / sr;
        const m = Math.pow(Math.max(0, Math.sin(tph)), 0.6);
        y *= 1 - trD[k] + trD[k] * m;
      }
      out[i] = y;
    }
  }

  // --- consonant noise (bursts & fricatives), shaped per segment
  {
    let t0 = 0;
    for (const s of segs) {
      const d = s.d * tempo;
      if (s.fr) addFricative(out, Math.round(t0 * sr), Math.round(d * sr), s.fr.k, s.fr.a, sr, rng);
      t0 += d;
    }
  }
  return out;
}

function addFricative(out: Float32Array, start: number, len: number, kind: FricKind, a: Curve, sr: number, rng: Rng): void {
  const nz = new Noise(rng);
  const f1 = new Biquad();
  const f2 = new Biquad();
  let burst = false;
  switch (kind) {
    case 's':
      f1.highpass(4500, 0.7, sr);
      f2.bandpass(6500, 1.2, sr);
      break;
    case 'sh':
      f1.highpass(1800, 0.7, sr);
      f2.bandpass(3000, 1.4, sr);
      break;
    case 'f':
      f1.highpass(1200, 0.7, sr);
      f2.bandpass(3500, 0.4, sr);
      break;
    case 'h':
      f1.highpass(600, 0.7, sr);
      f2.bandpass(1800, 0.6, sr);
      break;
    case 'k':
      f1.highpass(900, 0.7, sr);
      f2.bandpass(2200, 1.3, sr);
      burst = true;
      break;
    case 't':
      f1.highpass(3000, 0.7, sr);
      f2.bandpass(5000, 1.0, sr);
      burst = true;
      break;
    case 'p':
      f1.highpass(150, 0.7, sr);
      f2.lowpass(1200, 0.7, sr);
      burst = true;
      break;
    case 'sniff':
      f1.highpass(1200, 0.7, sr);
      f2.bandpass(2600, 1.6, sr);
      break;
    case 'growl':
      f1.lowpass(260, 1.2, sr);
      f2.lowpass(400, 0.7, sr);
      break;
  }
  const growl = kind === 'growl';
  const flut = growl ? smoothRandom(len, Math.max(4, (len / sr) * 14), rng) : null;
  const fade = Math.max(1, Math.round(0.004 * sr));
  const gain = growl ? 6 : 1.4;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const x = i / len;
    let e = burst ? Math.exp(-x * 4) * curveAt(a, 0) : curveAt(a, x);
    if (i < fade) e *= i / fade;
    if (len - i < fade) e *= (len - i) / fade;
    let s = growl ? nz.brown() : nz.white();
    s = f2.run(f1.run(s));
    if (flut) s *= 0.55 + 0.45 * flut[i];
    out[start + i] += s * e * gain;
  }
}

/** Renders a phrase with natural random variation; normalised to the voice reference loudness. */
export function renderPhrase(phrase: PhraseKey, sr: number, seed: number, normalize = true): Float32Array {
  const rng = new Rng(seed * 7919 + 13);
  const script = PHRASES[phrase];
  if (!script) return new Float32Array(1);
  const vp = randomVoiceParams(rng);
  const raw = synthSegments(script(rng), sr, rng, vp);
  new Biquad().lowpass(7500, 0.6, sr).apply(raw);
  new Biquad().highpass(110, 0.6, sr).apply(raw);
  dcBlock(raw, sr);
  fadeIn(raw, Math.round(0.002 * sr));
  const out = trimTail(raw, sr, -60, 0.01);
  if (normalize) normalizeLoudness(out, sr, VOICE_REF_DB + (PHRASE_TRIM[phrase] ?? 0), VOICE_PEAK_CAP);
  return out;
}

export const VOICE_PHRASES = Object.keys(PHRASES).filter((k) => k !== 'hiccup') as VoicePhrase[];
