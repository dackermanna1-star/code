/**
 * Formant voice synth: a glottal-pulse oscillator (with pitch jitter and
 * optional vibrato) plus aspiration noise, fed through three parallel formant
 * band-passes (and a low "chest" path). Vowel targets glide over each
 * syllable; pitch / amplitude contours are scripted per vocal kind.
 */
import { getKit, mkOsc, mkNoise, mkFilter, mkGain, clamp, rand, randi, pick, chance } from './dsp';
import { droplets } from './layers';

export type VocalKind = 'grunt' | 'pain' | 'scream' | 'death' | 'shout' | 'laugh' | 'taunt' | 'effort' | 'gurgle';
export type Vowel = 'ah' | 'uh' | 'oh' | 'oo' | 'ee' | 'ih' | 'eh' | 'ae' | 'mm';

/** Formant frequencies (adult male) and relative formant gains. */
export const VOWELS: Record<Vowel, { f: [number, number, number]; g: [number, number, number] }> = {
  ah: { f: [730, 1090, 2440], g: [1, 0.62, 0.32] },
  uh: { f: [640, 1190, 2390], g: [1, 0.55, 0.26] },
  oh: { f: [520, 860, 2400], g: [1, 0.45, 0.16] },
  oo: { f: [330, 870, 2240], g: [1, 0.3, 0.08] },
  ee: { f: [280, 2250, 2900], g: [0.75, 0.5, 0.42] },
  ih: { f: [400, 1920, 2560], g: [0.9, 0.5, 0.32] },
  eh: { f: [550, 1770, 2490], g: [1, 0.55, 0.3] },
  ae: { f: [690, 1660, 2490], g: [1, 0.6, 0.3] },
  mm: { f: [260, 1100, 2200], g: [0.7, 0.06, 0.02] },
};

/** Higher wins when two vocals compete for a speaker / voice slot. */
export const VOCAL_PRIORITY: Record<VocalKind, number> = {
  death: 6,
  gurgle: 5,
  scream: 4,
  pain: 4,
  shout: 3,
  taunt: 3,
  laugh: 2,
  effort: 1,
  grunt: 1,
};

export interface Syllable {
  /** start (seconds from utterance start) */
  at: number;
  dur: number;
  /** vowel targets spread evenly over the syllable */
  v: Vowel[];
  /** pitch contour as multiples of the speaker's base pitch, spread over the syllable */
  f0: number[];
  amp: number;
  /** aspiration ("h") lead-in before `at` */
  h?: number;
  /** breathiness during the vowel */
  breath?: number;
  att?: number;
  rel?: number;
  /** gurgling amplitude bubbling rate (Hz) */
  bubbles?: number;
}

export interface Utterance {
  syl: Syllable[];
  /** pitch jitter depth (cents) */
  jitter: number;
  /** source brightness: low-pass cutoff as a multiple of f0 */
  bright: number;
  level: number;
  vib?: number;
  vibRate?: number;
  /** extra wet noise / bubbles (death gurgle) */
  wet?: boolean;
}

/** Build a randomized script for a vocal kind. */
export function vocalScript(kind: VocalKind): Utterance {
  switch (kind) {
    case 'grunt': {
      const v = pick<Vowel>(['uh', 'uh', 'ah', 'oh', 'mm', 'eh']);
      return {
        syl: [{ at: 0.03, dur: rand(0.09, 0.16), v: [v, 'uh'], f0: [1.0, 1.12, 0.86], amp: 1, h: chance(0.6) ? 0.025 : 0, breath: 0.25, att: 0.012, rel: 0.05 }],
        jitter: 18,
        bright: 14,
        level: 0.8,
      };
    }
    case 'effort': {
      const v = pick<Vowel[]>([['eh', 'ah'], ['ah', 'uh'], ['uh', 'ah'], ['ih', 'ah'], ['ah', 'ah']]);
      return {
        syl: [{ at: 0.05, dur: rand(0.17, 0.3), v, f0: [1.15, 1.5, 1.4, 1.02], amp: 1, h: rand(0.03, 0.05), breath: 0.3, att: 0.02, rel: 0.07 }],
        jitter: 22,
        bright: 22,
        level: 0.85,
      };
    }
    case 'pain': {
      const r = Math.random();
      if (r < 0.45)
        // "AGH!"
        return {
          syl: [{ at: 0.01, dur: rand(0.22, 0.38), v: ['ah', 'ah', 'uh'], f0: [1.55, 1.95, 1.75, 1.15], amp: 1, breath: 0.35, att: 0.008, rel: 0.09 }],
          jitter: 40,
          bright: 20,
          level: 0.85,
        };
      if (r < 0.75)
        // "OW!"
        return {
          syl: [{ at: 0.01, dur: rand(0.26, 0.4), v: ['ah', 'oh', 'oo'], f0: [1.5, 1.85, 1.55, 1.25], amp: 1, breath: 0.3, att: 0.01, rel: 0.1 }],
          jitter: 35,
          bright: 18,
          level: 0.85,
        };
      // "UNGH" (winded)
      return {
        syl: [{ at: 0.01, dur: rand(0.13, 0.2), v: ['uh', 'uh'], f0: [1.25, 1.35, 0.95], amp: 1, breath: 0.35, att: 0.006, rel: 0.06 }],
        jitter: 45,
        bright: 16,
        level: 0.8,
      };
    }
    case 'scream': {
      const v = pick<Vowel[]>([['ah', 'ah', 'ah'], ['ae', 'ah', 'ah'], ['ee', 'ae', 'ah'], ['ah', 'ah', 'uh'], ['eh', 'ah', 'ah']]);
      const d = rand(0.75, 1.35);
      return {
        syl: [{ at: 0.01, dur: d, v, f0: [2.1, 2.85, 2.75, 2.55, 2.0], amp: 1, breath: 0.45, att: 0.06, rel: 0.25 }],
        jitter: 45,
        bright: 12,
        vib: rand(35, 70),
        vibRate: rand(5.5, 7.5),
        level: 0.85,
      };
    }
    case 'shout': {
      const w = pick(['hey', 'hey', 'oi', 'yeah', 'hoy', 'oyyou']);
      if (w === 'hey')
        return { syl: [{ at: 0.05, dur: rand(0.28, 0.4), v: ['eh', 'eh', 'ee'], f0: [1.55, 1.82, 1.7, 1.35], amp: 1, h: 0.045, breath: 0.25, att: 0.025, rel: 0.08 }], jitter: 20, bright: 26, level: 0.85 };
      if (w === 'oi')
        return { syl: [{ at: 0.02, dur: rand(0.25, 0.35), v: ['oh', 'oh', 'ee'], f0: [1.5, 1.8, 1.65, 1.3], amp: 1, breath: 0.2, att: 0.012, rel: 0.07 }], jitter: 20, bright: 26, level: 0.85 };
      if (w === 'hoy')
        return { syl: [{ at: 0.05, dur: rand(0.28, 0.38), v: ['oh', 'oh', 'ih'], f0: [1.45, 1.75, 1.6, 1.3], amp: 1, h: 0.05, breath: 0.25, att: 0.02, rel: 0.08 }], jitter: 20, bright: 24, level: 0.85 };
      if (w === 'oyyou')
        return {
          syl: [
            { at: 0.02, dur: 0.2, v: ['oh', 'ee'], f0: [1.5, 1.75, 1.6], amp: 1, breath: 0.2, att: 0.012, rel: 0.05 },
            { at: 0.3, dur: 0.3, v: ['ee', 'oo', 'oo'], f0: [1.7, 1.85, 1.4], amp: 0.95, breath: 0.2, att: 0.02, rel: 0.08 },
          ],
          jitter: 20,
          bright: 24,
          level: 0.85,
        };
      // "YEAH!"
      return { syl: [{ at: 0.02, dur: rand(0.38, 0.5), v: ['ee', 'eh', 'ae', 'ah'], f0: [1.3, 1.75, 1.65, 1.2], amp: 1, breath: 0.22, att: 0.03, rel: 0.1 }], jitter: 22, bright: 24, level: 0.85 };
    }
    case 'laugh': {
      const n = randi(4, 7);
      const rate = rand(5.2, 6.6);
      const v = pick<Vowel>(['ah', 'ah', 'eh', 'oh', 'uh']);
      let f = rand(1.45, 1.85);
      const syl: Syllable[] = [];
      for (let i = 0; i < n; i++) {
        const at = 0.04 + i / rate;
        const dur = (1 / rate) * rand(0.45, 0.58);
        syl.push({ at, dur, v: [v, v], f0: [f * 1.06, f, f * 0.92], amp: 1 - i * 0.07, h: 0.03, breath: 0.4, att: 0.012, rel: 0.035 });
        f *= rand(0.93, 0.98);
      }
      return { syl, jitter: 30, bright: 18, level: 0.75 };
    }
    case 'taunt': {
      const r = Math.random();
      if (r < 0.45)
        // "c'MON!"
        return {
          syl: [
            { at: 0.04, dur: 0.1, v: ['uh'], f0: [1.15, 1.22, 1.12], amp: 0.75, h: 0.025, breath: 0.3, att: 0.01, rel: 0.03 },
            { at: 0.18, dur: rand(0.34, 0.44), v: ['ah', 'oh', 'uh'], f0: [1.3, 1.72, 1.55, 1.08], amp: 1, breath: 0.2, att: 0.025, rel: 0.1 },
          ],
          jitter: 22,
          bright: 24,
          level: 0.85,
        };
      if (r < 0.75)
        // "YEEAAH!"
        return { syl: [{ at: 0.02, dur: rand(0.45, 0.6), v: ['ee', 'eh', 'ae', 'ah'], f0: [1.3, 1.85, 1.7, 1.15], amp: 1, breath: 0.25, att: 0.03, rel: 0.12 }], jitter: 24, bright: 24, level: 0.85, vib: 20, vibRate: 5 };
      // "HAH!"  "HA-HAH"
      return {
        syl: [
          { at: 0.05, dur: 0.12, v: ['ah', 'ah'], f0: [1.5, 1.55, 1.35], amp: 0.8, h: 0.04, breath: 0.35, att: 0.012, rel: 0.04 },
          { at: 0.28, dur: 0.26, v: ['ah', 'ah'], f0: [1.6, 1.68, 1.05], amp: 1, h: 0.045, breath: 0.35, att: 0.015, rel: 0.08 },
        ],
        jitter: 24,
        bright: 22,
        level: 0.85,
      };
    }
    case 'death': {
      const d = rand(0.85, 1.35);
      return {
        syl: [
          { at: 0.03, dur: d, v: ['oh', 'uh', 'uh', 'uh'], f0: [1.2, 1.25, 1.02, 0.78, 0.55], amp: 0.95, h: 0.03, breath: 0.35, att: 0.05, rel: 0.35 },
          { at: d + 0.12, dur: 0.28, v: ['uh', 'uh'], f0: [0.62, 0.56, 0.5], amp: 0.35, h: 0.02, breath: 0.65, att: 0.03, rel: 0.12 },
        ],
        jitter: 60,
        bright: 10,
        level: 0.62,
        vib: 22,
        vibRate: 4.2,
      };
    }
    case 'gurgle':
    default:
      return {
        syl: [{ at: 0.03, dur: rand(0.6, 0.9), v: ['oo', 'uh', 'oo'], f0: [0.85, 0.92, 0.72, 0.6], amp: 0.9, breath: 0.25, att: 0.04, rel: 0.2, bubbles: rand(12, 19) }],
        jitter: 70,
        bright: 8,
        level: 0.7,
        wet: true,
      };
  }
}

/** Speaker base pitch (Hz) for pitch multiplier 1. */
export const VOICE_BASE_HZ = 110;

/**
 * Render a scripted utterance. `pitch` is the speaker's voice pitch multiplier
 * (male ~0.7..1.15, female ~1.5..1.9). Returns the end time.
 */
export function renderUtterance(ac: BaseAudioContext, out: AudioNode, t: number, u: Utterance, pitch: number): number {
  const k = getKit(ac);
  const base = VOICE_BASE_HZ * clamp(pitch, 0.5, 2.2);
  const fs = 1 + clamp(pitch - 1, -0.3, 1) * 0.17; // formant scale (smaller vocal tract)
  let last = 0;
  let avg = 0;
  let cnt = 0;
  for (const s of u.syl) {
    last = Math.max(last, s.at + s.dur + 0.05);
    for (const f of s.f0) {
      avg += f;
      cnt++;
    }
  }
  const avgF0 = base * (avg / Math.max(cnt, 1));
  const end = t + last + 0.08;

  // --- source
  const osc = mkOsc(ac, k.waves.glottal, base * u.syl[0].f0[0], t, end);
  const jit = mkNoise(ac, k.white, t, end, 0.012);
  const jg = mkGain(ac, u.jitter);
  jit.connect(jg);
  jg.connect(osc.detune);
  if (u.vib) {
    const lfo = mkOsc(ac, 'sine', u.vibRate ?? 5.8, t, end);
    const lg = mkGain(ac, 0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(u.vib, t + 0.3);
    lfo.connect(lg);
    lg.connect(osc.detune);
  }
  const srcLP = mkFilter(ac, 'lowpass', clamp(avgF0 * u.bright, 800, 6500), 0.6);
  const vg = mkGain(ac, 0);
  osc.connect(srcLP);
  srcLP.connect(vg);
  const ns = mkNoise(ac, k.white, t, end);
  const ng = mkGain(ac, 0);
  ns.connect(ng);

  // --- formant bank
  const sum = mkGain(ac, 1);
  vg.connect(sum);
  ng.connect(sum);
  // higher voices put more harmonics into the (wider) formant bands: normalize loudness by f0
  const outG = mkGain(ac, u.level * clamp(Math.pow(150 / avgF0, 0.8), 0.35, 1));
  const outLP = mkFilter(ac, 'lowpass', 5200, 0.6);
  const outHP = mkFilter(ac, 'highpass', 75, 0.7);
  outG.connect(outLP);
  outLP.connect(outHP);
  outHP.connect(out);
  const v0 = VOWELS[u.syl[0].v[0]];
  const bw0 = [85, 105, 150];
  const fl: BiquadFilterNode[] = [];
  const fg: GainNode[] = [];
  for (let i = 0; i < 3; i++) {
    const fc = v0.f[i] * fs;
    const bw = bw0[i] * (1 + 0.5 * clamp(pitch - 1, 0, 1)) + avgF0 * 0.55;
    const f = mkFilter(ac, 'bandpass', fc, clamp(fc / bw, 1.2, 18));
    const g = mkGain(ac, v0.g[i]);
    sum.connect(f);
    f.connect(g);
    g.connect(outG);
    fl.push(f);
    fg.push(g);
  }
  // chest / fundamental path (parallel formant synths sound thin without it)
  const chest = mkFilter(ac, 'lowpass', Math.max(260, avgF0 * 2.2), 0.7);
  const cg = mkGain(ac, 0.32);
  vg.connect(chest);
  chest.connect(cg);
  cg.connect(outG);

  // --- wet gurgle layer
  let wetG: GainNode | null = null;
  if (u.wet) {
    const wn = mkNoise(ac, k.pink, t, end);
    const wl = mkFilter(ac, 'lowpass', 650, 1.2);
    wetG = mkGain(ac, 0);
    wn.connect(wl);
    wl.connect(wetG);
    wetG.connect(outG);
  }

  // --- schedule syllables
  const NOISE_K = 2.6; // white noise through narrow formants is much quieter than the voiced source
  let prevEnd = t;
  for (const s of u.syl) {
    const t0 = Math.max(t + s.at, prevEnd + 0.001);
    const t1 = t0 + s.dur;
    const att = Math.min(s.att ?? 0.02, s.dur * 0.4);
    const rel = Math.min(s.rel ?? 0.06, s.dur * 0.5);
    const h = Math.min(s.h ?? 0, Math.max(0, t0 - prevEnd - 0.002));
    const tStart = t0 - h;
    const br = (s.breath ?? 0.15) * NOISE_K;

    // voiced amplitude
    vg.gain.setValueAtTime(0, t0);
    vg.gain.linearRampToValueAtTime(s.amp, t0 + att);
    if (s.bubbles) {
      const per = 1 / s.bubbles;
      let tb = t0 + att;
      while (tb + per < t1 - rel) {
        vg.gain.linearRampToValueAtTime(s.amp * rand(0.45, 1), tb + per * 0.3);
        vg.gain.linearRampToValueAtTime(s.amp * rand(0.08, 0.25), tb + per * 0.85);
        if (wetG) {
          wetG.gain.setValueAtTime(0, tb);
          wetG.gain.linearRampToValueAtTime(rand(0.4, 1.1), tb + per * 0.25);
          wetG.gain.linearRampToValueAtTime(0.03, tb + per * 0.9);
        }
        tb += per * rand(0.95, 1.3);
      }
      vg.gain.linearRampToValueAtTime(s.amp * 0.3, t1 - rel);
    } else if (t1 - rel > t0 + att) vg.gain.linearRampToValueAtTime(s.amp * 0.85, t1 - rel);
    vg.gain.linearRampToValueAtTime(0, t1);

    // aspiration / breath
    ng.gain.setValueAtTime(0, tStart);
    if (h > 0) {
      ng.gain.linearRampToValueAtTime(br * 2.2 + 0.3 * NOISE_K, tStart + h * 0.6);
      ng.gain.linearRampToValueAtTime(br, t0 + att);
    } else ng.gain.linearRampToValueAtTime(br, t0 + att);
    if (t1 - rel > t0 + att) ng.gain.linearRampToValueAtTime(br * 0.75, t1 - rel);
    ng.gain.linearRampToValueAtTime(0, t1 + 0.012);

    // pitch contour
    const np = s.f0.length;
    osc.frequency.setValueAtTime(base * s.f0[0], tStart);
    for (let i = 1; i < np; i++) osc.frequency.exponentialRampToValueAtTime(base * s.f0[i], t0 + (s.dur * i) / (np - 1));

    // formant glides
    const nv = s.v.length;
    for (let i = 0; i < 3; i++) {
      const first = VOWELS[s.v[0]];
      fl[i].frequency.setValueAtTime(first.f[i] * fs, tStart);
      fg[i].gain.setValueAtTime(first.g[i], tStart);
      for (let j = 1; j < nv; j++) {
        const vv = VOWELS[s.v[j]];
        const tj = t0 + (s.dur * j) / (nv - 1);
        fl[i].frequency.linearRampToValueAtTime(vv.f[i] * fs, tj);
        fg[i].gain.linearRampToValueAtTime(vv.g[i], tj);
      }
    }
    prevEnd = t1 + 0.015;
  }
  if (u.wet) droplets(ac, outG, t + 0.05, { n: randi(3, 6), spread: last * 0.8, amp: 0.25, lo: 180, hi: 420 });
  return end;
}

/** Convenience: random utterance of `kind` at `t`. Returns the end time. */
export function speak(ac: BaseAudioContext, out: AudioNode, t: number, kind: VocalKind, pitch: number): number {
  return renderUtterance(ac, out, t, vocalScript(kind), pitch);
}
