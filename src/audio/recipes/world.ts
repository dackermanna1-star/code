/**
 * World & atmosphere one-shots: nether portal, cave "mood" sounds, biome ambience
 * additions, birds, drips, thunder, and note-block instruments.
 */
import { addNoise, alloc, applyDecay, lowpass, midiHz, mix, peakEq, smoothRandom, softClip, sweep, TAU, fade } from '../dsp/core';
import { bitcrush, chorus, echo, reverb, reverbMono } from '../dsp/fx';
import { bubble, bubbles, burst, creak, grains, ping, pluck, randomModes, ratioModes, scatter, strike, thump, whoosh } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { voice } from '../dsp/voice';
import { boom, debris } from './kit';
import type { SoundSpec } from './types';

/** Big dark cave reverb used for cave sounds (baked). */
const caveVerb = (b: Float32Array, sr: number, wet = 0.7): Float32Array => reverbMono(b, sr, { t60: 3.4, size: 1.9, damp: 0.7, wet, dry: 0.5, predelay: 0.04, tail: 1.5 });

/** Swirling portal texture: detuned low hum + phasing noise bands. */
function portalSwirl(sr: number, r: Rand, dur: number, rise: number, amp: readonly number[]): Float32Array {
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const f0 = r.range(70, 95);
  const phs = [0, 0, 0, 0];
  const det = [1, 1.007, 0.994, 2.003];
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const t = i / sr;
    const f = f0 * Math.pow(rise, u) * (1 + 0.02 * Math.sin(TAU * 3.1 * t));
    let s = 0;
    for (let k = 0; k < 4; k++) {
      phs[k] += (TAU * f * det[k]) / sr;
      s += Math.sin(phs[k] + 0.8 * Math.sin(phs[k] * 0.5)) * (k === 3 ? 0.3 : 0.5);
    }
    out[i] = s * (0.6 + 0.4 * Math.sin(TAU * 2.3 * t)) * 0.18;
  }
  lowpass(out, sr, 900);
  const nz = new Float32Array(n);
  addNoise(nz, r, 0, n, 1, 'pink');
  const nz2 = nz.slice();
  const lfoA = r.range(0.35, 0.6);
  const lfoB = r.range(0.5, 0.9);
  const fa: number[] = [];
  const fb: number[] = [];
  for (let t = 0; t <= dur + 0.05; t += 0.05) {
    fa.push(t, 600 * Math.pow(2.6, Math.sin(TAU * lfoA * t)) * Math.pow(rise, t / dur));
    fb.push(t, 1400 * Math.pow(2.2, Math.sin(TAU * lfoB * t + 1.3)) * Math.pow(rise, t / dur));
  }
  sweep(nz, sr, 'bp', fa, 3.5);
  sweep(nz2, sr, 'bp', fb, 4);
  for (let i = 0; i < n; i++) out[i] += (nz[i] * 0.6 + nz2[i] * 0.4) * 1.7;
  const ch = chorus(out, sr, { rate: 0.3, depth: 0.004, delay: 0.012, mix: 0.5 });
  for (let i = 0; i < n; i++) {
    const u = i / n;
    let e = 0;
    // breakpoint envelope
    for (let k = 2; k < amp.length; k += 2) {
      if (u <= amp[k]) {
        const ua = amp[k - 2];
        e = amp[k - 1] + ((amp[k + 1] - amp[k - 1]) * (u - ua)) / Math.max(1e-6, amp[k] - ua);
        break;
      }
    }
    ch[i] *= e;
  }
  return ch;
}

function birdCall(out: Float32Array, sr: number, r: Rand, t0: number, style: number): void {
  const base = r.range(2400, 4200);
  const syl = (t: number, d: number, fa: number, fb: number, amp: number, warble = 0) => {
    const s0 = Math.round(t * sr);
    const n = Math.round(d * sr);
    let ph = 0;
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const u = i / n;
      const f = fa * Math.pow(fb / fa, u) * (1 + warble * Math.sin(TAU * 45 * (i / sr)));
      ph += (TAU * f) / sr;
      const e = Math.sin(Math.PI * u) ** 1.5;
      out[s0 + i] += (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * e * amp;
    }
  };
  if (style === 0) {
    // trill
    const k = 6 + r.int(8);
    for (let i = 0; i < k; i++) syl(t0 + i * 0.055, 0.04, base * 1.1, base * 0.85, 0.5);
  } else if (style === 1) {
    // two-note call "tee-oo"
    syl(t0, 0.18, base * 1.15, base * 1.25, 0.6);
    syl(t0 + 0.24, 0.22, base * 0.95, base * 0.75, 0.55);
  } else if (style === 2) {
    // warbling phrase
    let t = t0;
    for (let i = 0; i < 5 + r.int(4); i++) {
      const d = r.range(0.05, 0.12);
      syl(t, d, base * r.range(0.8, 1.3), base * r.range(0.8, 1.3), r.range(0.3, 0.6), 0.04);
      t += d + r.range(0.01, 0.05);
    }
  } else {
    // chirps
    for (let i = 0; i < 3 + r.int(3); i++) syl(t0 + i * r.range(0.12, 0.2), 0.035, base * 0.9, base * 1.4, 0.5);
  }
}

function thunderRumble(sr: number, r: Rand, dur: number, lp: number, attack: number): Float32Array {
  const n = Math.ceil(dur * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 0.8, 'brown');
  addNoise(b, r, 0, n, 0.12, 'pink');
  const cut: number[] = [];
  for (let t = 0; t <= dur; t += 0.25) cut.push(t, lp * r.range(0.6, 1.4) * Math.exp(-t / (dur * 0.9)) + 60);
  sweep(b, sr, 'lp', cut, 0.7);
  lowpass(b, sr, lp * 1.5);
  // rolling swells
  const k = 4 + r.int(4);
  const centers: number[] = [];
  for (let i = 0; i < k; i++) centers.push(r.range(attack, dur * 0.8), r.range(0.3, 1.0), r.range(0.2, 0.8));
  const am = smoothRandom(r, sr, n, 5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let e = 0;
    for (let j = 0; j < centers.length; j += 3) {
      const d = (t - centers[j]) / centers[j + 2];
      e += centers[j + 1] * Math.exp(-d * d);
    }
    const base = t < attack ? t / attack : Math.exp(-(t - attack) / (dur * 0.35));
    b[i] *= (base * 0.6 + e * 0.5) * (0.8 + 0.2 * am[i]);
  }
  fade(b, sr, 0.005, 0.5);
  return b;
}

// Note block helpers -------------------------------------------------------------------

function fmBell(sr: number, f: number, dur: number, ratio: number, index: number, t60: number): Float32Array {
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  let pc = 0;
  let pm = 0;
  const k = Math.exp(-6.907755 / (t60 * sr));
  const ki = Math.exp(-6.907755 / (t60 * 0.4 * sr));
  let e = 1;
  let ei = index;
  for (let i = 0; i < n; i++) {
    pm += (TAU * f * ratio) / sr;
    pc += (TAU * f) / sr;
    const a = Math.min(1, i / (0.001 * sr));
    out[i] = Math.sin(pc + ei * Math.sin(pm)) * e * a;
    e *= k;
    ei *= ki;
  }
  return out;
}

function noteBlock(inst: string, sr: number, r: Rand): Float32Array {
  const F = (m: number) => midiHz(m);
  switch (inst) {
    case 'harp': {
      const out = alloc(sr, 1.6);
      pluck(out, sr, r, 0.001, F(66), { dur: 1.5, t60: 1.4, bright: 0.6, pick: 0.15, amp: 0.8 });
      return out;
    }
    case 'bass': {
      const out = alloc(sr, 1.4);
      pluck(out, sr, r, 0.001, F(42), { dur: 1.3, t60: 1.1, bright: 0.35, pick: 0.2, amp: 0.9 });
      thump(out, sr, 0.001, F(42), F(42), 0.6, 0.35, 0.004);
      return out;
    }
    case 'basedrum': {
      const out = alloc(sr, 0.5);
      thump(out, sr, 0.001, 130, 48, 0.4, 1, 0.001);
      burst(out, sr, r, 0.001, 0.006, 0.4, 400, 4000);
      return out;
    }
    case 'snare': {
      const out = alloc(sr, 0.4);
      burst(out, sr, r, 0.001, 0.22, 0.8, 1500, 9000);
      ping(out, sr, 0.001, 185, 0.12, 0.5);
      ping(out, sr, 0.001, 330, 0.08, 0.3);
      return out;
    }
    case 'hat': {
      const out = alloc(sr, 0.15);
      burst(out, sr, r, 0.001, 0.07, 0.9, 7000, 16000);
      strike(out, sr, 0.001, randomModes(r, 6, 6000, 12000, 0.03, 0.06, { tilt: 0 }), 0.2);
      return out;
    }
    case 'bell':
      return fmBell(sr, F(90), 2.2, 3.5, 2.2, 2.0);
    case 'chime': {
      const out = alloc(sr, 2.6);
      strike(out, sr, 0.001, ratioModes(F(90), [1, 2.76, 5.4, 8.93], 2.4, { tilt: 0.9, decayTilt: 0.6 }), 0.8, 0.0005);
      return out;
    }
    case 'xylophone': {
      const out = alloc(sr, 0.7);
      strike(out, sr, 0.001, ratioModes(F(90), [1, 3.0, 6.1], 0.5, { tilt: 1.1, decayTilt: 0.8 }), 0.9, 0.0004);
      return out;
    }
    case 'iron_xylophone': {
      const out = alloc(sr, 2.2);
      strike(out, sr, 0.001, ratioModes(F(66), [1, 4.0, 10.0], 2.0, { tilt: 1.2, decayTilt: 0.6 }), 0.9, 0.0005);
      for (let i = 0; i < out.length; i++) out[i] *= 1 - 0.25 * (1 - Math.cos(TAU * 5.5 * (i / sr)));
      return out;
    }
    case 'cow_bell': {
      const out = alloc(sr, 0.6);
      const n = Math.round(0.5 * sr);
      let a = 0;
      let b = 0;
      for (let i = 0; i < n; i++) {
        a += F(78) / sr;
        b += (F(78) * 1.48) / sr;
        out[i] = ((a % 1 < 0.5 ? 1 : -1) + (b % 1 < 0.5 ? 1 : -1)) * 0.3 * Math.exp(-(i / sr) / 0.09);
      }
      sweep(out, sr, 'bp', F(78) * 1.6, 1.2);
      return out;
    }
    case 'flute': {
      const out = alloc(sr, 1.0);
      const f = F(78);
      const n = Math.round(0.9 * sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * f * (1 + 0.006 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.3))) / sr;
        const e = Math.min(1, t / 0.06) * (t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.15) : 1);
        out[i] = (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * e * 0.6;
      }
      const br = new Float32Array(n);
      addNoise(br, r, 0, n, 1);
      sweep(br, sr, 'bp', f * 2, 3);
      for (let i = 0; i < n; i++) out[i] += br[i] * 0.12 * Math.min(1, i / (0.03 * sr));
      return out;
    }
    case 'guitar': {
      const out = alloc(sr, 1.5);
      pluck(out, sr, r, 0.001, F(54), { dur: 1.4, t60: 1.4, bright: 0.45, pick: 0.18, amp: 0.8 });
      peakEq(out, sr, 110, 1.2, 4);
      peakEq(out, sr, 230, 1.5, 3);
      return out;
    }
    case 'didgeridoo': {
      const out = alloc(sr, 1.3);
      voice(out, sr, r, 0.001, { dur: 1.2, f0: [0, F(42), 1.2, F(42)], amp: [0, 0, 0.05, 1, 1.0, 0.9, 1.2, 0], vowel: [0, 'u', 0.3, 'o', 0.6, 'u', 0.9, 'o', 1.2, 'u'], scale: 0.9, tilt: 1.1, breath: 0.15, rough: 0.15, jitter: 0.003 });
      return out;
    }
    case 'bit': {
      const out = alloc(sr, 0.6);
      const n = Math.round(0.5 * sr);
      let p = 0;
      for (let i = 0; i < n; i++) {
        p += F(66) / sr;
        out[i] = (p % 1 < 0.5 ? 0.5 : -0.5) * Math.exp(-(i / sr) / 0.18);
      }
      return bitcrush(out, 2, 6);
    }
    case 'banjo': {
      const out = alloc(sr, 1.0);
      pluck(out, sr, r, 0.001, F(66), { dur: 0.9, t60: 0.55, bright: 0.85, pick: 0.08, amp: 0.8 });
      peakEq(out, sr, 1800, 1.5, 6);
      return out;
    }
    case 'pling':
    default:
      return fmBell(sr, F(66), 1.6, 1, 1.6, 1.2);
  }
}

export const NOTE_INSTRUMENTS = [
  'harp', 'bass', 'basedrum', 'snare', 'hat', 'bell', 'flute', 'chime', 'guitar', 'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit', 'banjo', 'pling',
] as const;

// ---------------------------------------------------------------------------------------

function caveSound(sr: number, r: Rand, v: number): Float32Array {
  const kind = v % 8;
  const dur = r.range(3.5, 5.5);
  const out = alloc(sr, dur);
  if (kind === 0) {
    // ominous low cluster swell
    const n = Math.ceil(dur * sr);
    const fs = [r.range(104, 120), r.range(122, 132), r.range(154, 168)];
    const ph = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      let s = 0;
      for (let k = 0; k < 3; k++) {
        ph[k] += (TAU * fs[k] * (1 + 0.004 * Math.sin(i * 0.0003 * (k + 1)))) / sr;
        s += Math.sin(ph[k] + 0.4 * Math.sin(ph[k] * 2));
      }
      out[i] = s * Math.sin(Math.PI * u) ** 2 * 0.3;
    }
    whoosh(out, sr, r, 0, dur, { f: [0, 200, 0.5, 450, 1, 180], amp: [0, 0, 0.5, 1, 1, 0], q: 2, gain: 0.25 });
  } else if (kind === 1) {
    // distant stone shifting / rumble
    const n = Math.ceil(dur * sr);
    const b = new Float32Array(n);
    addNoise(b, r, 0, n, 1, 'brown');
    lowpass(b, sr, 260);
    const am = smoothRandom(r, sr, n, 3);
    for (let i = 0; i < n; i++) b[i] *= Math.max(0, am[i]) * Math.sin((Math.PI * i) / n);
    mix(out, b, 0, 1.4);
    debris(out, sr, r, r.range(0.5, 1.5), 1.2, { amp: 0.12, fLo: 400, fHi: 2500, hard: 0.6, t60: 0.03, density: 0.3 });
  } else if (kind === 2) {
    // tunnel howl
    whoosh(out, sr, r, 0, dur, { f: [0, r.range(280, 380), 0.4, r.range(550, 700), 1, r.range(240, 320)], amp: [0, 0, 0.4, 1, 0.7, 0.6, 1, 0], q: 9, gain: 0.8 });
    whoosh(out, sr, r, 0, dur, { f: [0, 500, 1, 900], amp: [0, 0, 0.5, 1, 1, 0], q: 1, gain: 0.15, pink: true });
  } else if (kind === 3) {
    // drips in a cavern
    let t = r.range(0.1, 0.4);
    while (t < dur - 1.2) {
      bubble(out, sr, t, r.range(1100, 2600), 0.6, 0.35, 0.8);
      ping(out, sr, t, r.range(1800, 3200), 0.04, 0.15);
      t += r.range(0.4, 1.2);
    }
  } else if (kind === 4) {
    // creak + sigh
    creak(out, sr, r, 0.2, 1.1, { rate: [0, 12, 0.5, 30, 1, 8], amp: [0, 0.2, 0.3, 1, 1, 0], modes: randomModes(r, 6, 120, 900, 0.05, 0.15, { tilt: 0.2 }), gain: 3 });
    whoosh(out, sr, r, 1.0, 1.8, { f: [0, 700, 0.5, 450, 1, 300], amp: [0, 0, 0.3, 1, 1, 0], q: 1.5, gain: 0.35 });
  } else if (kind === 5) {
    // ghostly descending "whoo"
    voice(out, sr, r, 0.2, { dur: 2.4, f0: [0, r.range(420, 520), 2.4, r.range(220, 280)], amp: [0, 0, 0.6, 0.7, 2.0, 0.5, 2.4, 0], vowel: [0, 'u', 2.4, 'o'], scale: 1.2, tilt: 2.4, breath: 0.6, vib: [4.5, 0.02] });
  } else if (kind === 6) {
    // distant scuttling
    let t = r.range(0.2, 0.6);
    const end = t + r.range(1.0, 1.8);
    while (t < end) {
      strike(out, sr, t, [{ f: r.log(1500, 3500), t60: 0.012, a: r.range(0.2, 0.6) }], 1);
      t += r.range(0.03, 0.12);
    }
    lowpass(out, sr, 3000);
  } else {
    // deep thumps (something big, far away)
    for (let i = 0; i < 3; i++) boom(out, sr, r, 0.3 + i * r.range(0.6, 0.9), r.range(40, 55), 0.7, 0.6 - i * 0.12);
  }
  return caveVerb(out, sr);
}

function netherAddition(biome: string, sr: number, r: Rand): Float32Array {
  const dur = r.range(3, 5);
  const out = alloc(sr, dur);
  switch (biome) {
    case 'crimson_forest':
      whoosh(out, sr, r, 0, dur, { f: [0, 180, 0.5, 420, 1, 160], amp: [0, 0, 0.4, 1, 0.6, 0.4, 1, 0], q: 1.3, gain: 0.8, pink: true });
      for (let i = 0; i < 2; i++) thump(out, sr, r.range(0.3, dur - 1), r.range(70, 100), 45, 0.4, 0.4);
      voice(out, sr, r, r.range(0.5, 1.5), { dur: 1.2, f0: [0, 160, 0.6, 210, 1.2, 140], amp: [0, 0, 0.3, 0.35, 1.2, 0], vowel: [0, 'o', 1.2, 'u'], scale: 0.7, breath: 0.6, rough: 0.5 });
      break;
    case 'warped_forest': {
      const root = r.range(600, 900);
      for (let i = 0; i < 4; i++) ping(out, sr, r.range(0.1, dur - 1.5), root * r.pick([1, 1.5, 2, 2.67]), r.range(0.6, 1.4), 0.25);
      whoosh(out, sr, r, 0, dur, { f: [0, 2000, 0.5, 4500, 1, 1500], amp: [0, 0, 0.5, 1, 1, 0], q: 6, gain: 0.25 });
      break;
    }
    case 'soul_sand_valley':
      voice(out, sr, r, 0.1, { dur: dur * 0.8, f0: [0, r.range(250, 330), dur * 0.8, r.range(180, 220)], amp: [0, 0, dur * 0.3, 0.5, dur * 0.8, 0], vowel: [0, 'u', dur * 0.4, 'a', dur * 0.8, 'o'], scale: 1.1, breath: 0.9, tilt: 2, vib: [4, 0.03] });
      whoosh(out, sr, r, 0, dur, { f: [0, 300, 0.5, 900, 1, 250], amp: [0, 0, 0.5, 1, 1, 0], q: 2.5, gain: 0.45 });
      break;
    case 'basalt_deltas':
      boom(out, sr, r, r.range(0.1, 0.8), r.range(38, 50), 1.5, 0.8);
      grains(out, sr, r, { t0: 0.2, t1: dur - 0.5, rate: (t) => 300 * Math.exp(-t / 1.2), fLo: 400, fHi: 3000, q: 1.5, amp: 0.25 });
      whoosh(out, sr, r, r.range(1, 2), 1.2, { f: [0, 5000, 1, 3000], amp: [0, 0, 0.1, 1, 1, 0], q: 0.9, gain: 0.25 });
      break;
    default: {
      // nether wastes: very distant ghast-like moan + rumble
      const n = Math.ceil(dur * sr);
      const b = new Float32Array(n);
      addNoise(b, r, 0, n, 1, 'brown');
      lowpass(b, sr, 180);
      applyDecay(b, sr, dur, 0, 0.8);
      mix(out, b, 0, 1);
      voice(out, sr, r, r.range(0.3, 1.0), { dur: 1.8, f0: [0, 450, 0.6, 520, 1.8, 330], amp: [0, 0, 0.3, 0.3, 1.8, 0], vowel: [0, 'a', 1.8, 'u'], scale: 1.25, breath: 0.5, vib: [5.5, 0.025] });
      lowpass(out, sr, 1800);
      break;
    }
  }
  return reverbMono(out, sr, { t60: 3.5, size: 2, damp: 0.6, wet: 0.65, dry: 0.5, predelay: 0.05, tail: 1.2 });
}

export function worldSounds(): Record<string, SoundSpec> {
  const o: Record<string, SoundSpec> = {
    // ---------------- portal ----------------
    'portal.portal': {
      cat: 'blocks',
      n: 3,
      level: 0.5,
      pv: 0.08,
      gen: (sr, r) => portalSwirl(sr, r, r.range(2.6, 3.4), r.range(0.8, 1.25), [0, 0, 0.3, 1, 0.7, 0.8, 1, 0]),
    },
    'portal.trigger': {
      cat: 'ambient',
      n: 2,
      level: 0.6,
      pv: 0.03,
      send: 0,
      gen: (sr, r) => {
        const m = portalSwirl(sr, r, 4, 3.2, [0, 0, 0.6, 0.8, 0.9, 1, 1, 0]);
        return reverb(m, sr, { t60: 1.5, size: 1.2, damp: 0.4, wet: 0.4, tail: 0.5 });
      },
    },
    'portal.travel': {
      cat: 'ambient',
      n: 2,
      level: 0.6,
      pv: 0.03,
      send: 0,
      gen: (sr, r) => {
        const a = portalSwirl(sr, r, 5, 0.4, [0, 0, 0.1, 1, 0.6, 0.9, 1, 0]);
        const b = portalSwirl(sr, r, 5, 2.5, [0, 0, 0.3, 0.6, 0.8, 0.5, 1, 0]);
        for (let i = 0; i < a.length; i++) a[i] += b[i] * 0.7;
        whoosh(a, sr, r, 0, 5, { f: [0, 3000, 0.5, 300, 1, 1200], amp: [0, 0, 0.2, 1, 0.8, 0.6, 1, 0], q: 1.2, gain: 0.4 });
        return reverb(a, sr, { t60: 2.5, size: 1.6, damp: 0.4, wet: 0.5, tail: 0.6 });
      },
    },

    // ---------------- ambient ----------------
    'ambient.cave': { cat: 'ambient', n: 8, level: 0.55, pv: 0.06, div: 2, max: 2, gen: (sr, r, v) => caveSound(sr, r, v) },
    'ambient.drip': {
      cat: 'ambient',
      n: 4,
      level: 0.35,
      pv: 0.15,
      gen: (sr, r) => {
        const out = alloc(sr, 0.5);
        bubble(out, sr, 0.003, r.range(1300, 2800), 1, 0.35, 0.8);
        ping(out, sr, 0.003, r.range(2500, 4000), 0.03, 0.2);
        return echo(out, sr, r.range(0.09, 0.15), 0.4, 0.35, 3000, 0.6);
      },
    },
    'ambient.bird': {
      cat: 'ambient',
      n: 6,
      level: 0.3,
      pv: 0.08,
      max: 3,
      gen: (sr, r, v) => {
        const out = alloc(sr, 1.6);
        birdCall(out, sr, r, 0.01, v % 4);
        return reverbMono(out, sr, { t60: 0.6, size: 0.8, damp: 0.5, wet: 0.15, tail: 0.2 });
      },
    },
    'ambient.underwater.additions': {
      cat: 'ambient',
      n: 4,
      level: 0.45,
      pv: 0.08,
      div: 2,
      gen: (sr, r, v) => {
        const out = alloc(sr, 3);
        if (v % 2 === 0) {
          bubbles(out, sr, r, 0.05, r.range(0.6, 1.2), 90, 250, 1400, 0.5, 0.25, 0.7);
        } else {
          voice(out, sr, r, 0.1, { dur: 2.2, f0: [0, r.range(90, 120), 1.1, r.range(140, 180), 2.2, r.range(70, 90)], amp: [0, 0, 0.6, 0.6, 2.2, 0], vowel: [0, 'u', 1.1, 'o', 2.2, 'u'], scale: 0.6, tilt: 2.2, breath: 0.3 });
          bubbles(out, sr, r, 0.5, 2, 15, 200, 900, 0.3, 0.3, 0.7);
        }
        lowpass(out, sr, 1500);
        return reverbMono(out, sr, { t60: 2.5, size: 1.5, damp: 0.8, wet: 0.5, tail: 0.6 });
      },
    },
    'ambient.end.additions': {
      cat: 'ambient',
      n: 3,
      level: 0.4,
      pv: 0.06,
      div: 2,
      gen: (sr, r) => {
        const out = alloc(sr, 4);
        whoosh(out, sr, r, 0, 3.5, { f: [0, r.range(500, 800), 0.5, r.range(1200, 1800), 1, r.range(400, 600)], amp: [0, 0, 0.5, 1, 1, 0], q: 10, gain: 0.6 });
        ping(out, sr, r.range(0.5, 2), r.range(900, 1400), 2, 0.12);
        return reverbMono(out, sr, { t60: 4, size: 2, damp: 0.3, wet: 0.6, tail: 1 });
      },
    },

    // ---------------- weather ----------------
    'weather.thunder.near': {
      cat: 'weather',
      n: 3,
      level: 1,
      loud: -11,
      pv: 0.05,
      max: 3,
      send: 0,
      gen: (sr, r) => {
        const out = alloc(sr, 7);
        // tearing crack: dense train of broadband impulses
        scatter(r, 0.002, 0.6, (t) => 1400 * Math.exp(-t / 0.18), (t) => {
          burst(out, sr, r, t, r.range(0.002, 0.015), r.range(0.4, 1.2) * Math.exp(-t / 0.22), 200, 12000, 0.0001);
        });
        burst(out, sr, r, 0.002, 0.12, 1.3, 60, 8000, 0.0005);
        // ripping mid band
        const rn = Math.ceil(0.7 * sr);
        const rip = new Float32Array(rn);
        addNoise(rip, r, 0, rn, 1);
        sweep(rip, sr, 'bp', [0, 2400, 0.7, 700], 0.9);
        const am = smoothRandom(r, sr, rn, 40);
        for (let i = 0; i < rn; i++) rip[i] *= Math.max(0, am[i] + 0.3) * Math.exp(-(i / sr) / 0.2);
        mix(out, rip, Math.round(0.004 * sr), 1.2);
        boom(out, sr, r, 0.01, r.range(38, 48), 1.6, 1.2);
        const rb = thunderRumble(sr, r, 6.5, 420, 0.3);
        mix(out, rb, Math.round(0.1 * sr), 1.3);
        softClip(out, 1.4);
        return reverb(out, sr, { t60: 3, size: 2, damp: 0.5, wet: 0.45, tail: 1 });
      },
    },
    'weather.thunder.far': {
      cat: 'weather',
      n: 3,
      level: 0.9,
      loud: -13,
      pv: 0.08,
      max: 3,
      div: 4,
      send: 0,
      gen: (sr, r) => {
        const rb = thunderRumble(sr, r, r.range(6, 8), 220, r.range(0.6, 1.2));
        lowpass(rb, sr, 380);
        return reverb(rb, sr, { t60: 3, size: 2, damp: 0.7, wet: 0.45, tail: 1 });
      },
    },
  };

  for (const b of ['nether_wastes', 'crimson_forest', 'warped_forest', 'soul_sand_valley', 'basalt_deltas']) {
    o[`ambient.${b}.additions`] = { cat: 'ambient', n: 3, level: 0.45, pv: 0.06, div: 2, gen: (sr, r) => netherAddition(b, sr, r) };
  }
  for (const inst of NOTE_INSTRUMENTS) {
    o[`block.note_block.${inst}`] = { cat: 'blocks', n: 2, level: 0.7, pv: 0, gen: (sr, r) => noteBlock(inst, sr, r) };
  }
  return o;
}

