#!/usr/bin/env node
// Offline music renderer using exactly the in-game sequencer + DMX driver +
// OPL3 code. Writes a 16-bit stereo WAV and prints level / timing stats.
//
//   node tools/render-music.mjs <wad>[,<pwad>...] <LUMP|file.mus|file.mid> [seconds=30] [out.wav]
//        [--rate 44100] [--no-loop] [--volume 0..1] [--opl2] [--stereo-correct] [--pitch]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Wad, WadStack } from '../src/wad/wad.js';
import { MusicEngine } from '../src/audio/sequencer.js';
import { parseMusic } from '../src/audio/mus.js';

function usage() {
  console.error('usage: node tools/render-music.mjs <wad>[,<pwad>...] <LUMP|file> [seconds=30] [out.wav] [--rate N] [--no-loop] [--volume V] [--opl2] [--stereo-correct] [--pitch]');
  process.exit(1);
}

const args = process.argv.slice(2);
const opts = { rate: 44100, loop: true, volume: 1, opl3: true, stereoCorrect: false, pitch: false };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--rate') opts.rate = Number(args[++i]);
  else if (a === '--no-loop') opts.loop = false;
  else if (a === '--volume') opts.volume = Number(args[++i]);
  else if (a === '--opl2') opts.opl3 = false;
  else if (a === '--stereo-correct') opts.stereoCorrect = true;
  else if (a === '--pitch') opts.pitch = true;
  else if (a.startsWith('--')) usage();
  else positional.push(a);
}
if (positional.length < 2) usage();
const [wadArg, musicArg, secondsArg = '30', outPath = null] = positional;
const seconds = Number(secondsArg);

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const stack = new WadStack();
for (const path of wadArg.split(',')) stack.add(new Wad(toArrayBuffer(readFileSync(path)), path));

const genmidi = stack.data('GENMIDI');
if (!genmidi) throw new Error('no GENMIDI lump');
const music = stack.has(musicArg) ? stack.data(musicArg) : existsSync(musicArg) ? new Uint8Array(readFileSync(musicArg)) : null;
if (!music) throw new Error(`music lump or file not found: ${musicArg}`);

const song = parseMusic(music);
const noteOns = song.events.filter((e) => e.type === 'noteOn').length;
console.log(`${musicArg}: ${song.format.toUpperCase()}, ${song.events.length} events (${noteOns} notes), ${song.duration.toFixed(2)} s long`);

// --- Render ----------------------------------------------------------------

const rate = opts.rate;
const total = Math.round(seconds * rate);
const engine = new MusicEngine(rate, { opl3: opts.opl3, stereoCorrect: opts.stereoCorrect });
engine.setGenmidi(genmidi);
engine.setVolume(opts.volume);
engine.play(music, opts.loop);

// Track peak voice usage by sampling the driver between blocks.
const left = new Float32Array(total);
const right = new Float32Array(total);
const BLOCK = 128; // AudioWorklet render quantum
let maxVoices = 0;
const t0 = process.hrtime.bigint();
for (let off = 0; off < total; off += BLOCK) {
  const n = Math.min(BLOCK, total - off);
  engine.render(left, right, off, n);
  if (engine.driver.activeVoices > maxVoices) maxVoices = engine.driver.activeVoices;
}
const elapsed = Number(process.hrtime.bigint() - t0) / 1e9;

// --- Stats -------------------------------------------------------------------

function stats(buf) {
  let peak = 0;
  let sum = 0;
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += v;
    sumSq += v * v;
  }
  return { peak, rms: Math.sqrt(sumSq / buf.length), dc: sum / buf.length, clipped };
}
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
const sl = stats(left);
const sr = stats(right);
console.log(`rendered ${seconds}s @ ${rate} Hz in ${elapsed.toFixed(3)} s (${(seconds / elapsed).toFixed(1)}x realtime), max voices in use ${maxVoices}`);
console.log(`L: peak ${sl.peak.toFixed(3)} (${db(sl.peak)} dBFS)  rms ${sl.rms.toFixed(4)} (${db(sl.rms)} dBFS)  dc ${sl.dc.toFixed(5)}  clipped ${sl.clipped}`);
console.log(`R: peak ${sr.peak.toFixed(3)} (${db(sr.peak)} dBFS)  rms ${sr.rms.toFixed(4)} (${db(sr.rms)} dBFS)  dc ${sr.dc.toFixed(5)}  clipped ${sr.clipped}`);

// Per-second loudness, and a crude "is the music changing" measure: the
// spectral distance between successive 100 ms frames.
const perSecond = [];
for (let s = 0; s < Math.floor(seconds); s++) {
  let sumSq = 0;
  for (let i = s * rate; i < (s + 1) * rate; i++) sumSq += left[i] * left[i] + right[i] * right[i];
  perSecond.push(Math.sqrt(sumSq / (2 * rate)));
}
console.log('rms per second (dBFS):', perSecond.map((x) => db(x)).join(' '));
const silentSeconds = perSecond.filter((x) => x < 1e-4).length;
console.log(`silent seconds: ${silentSeconds}`);

// --- Spectrum helpers ---------------------------------------------------------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function spectrum(start, size) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    re[i] = ((left[start + i] || 0) + (right[start + i] || 0)) * 0.5 * w;
  }
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

const frame = 4096;
const hop = Math.round(rate * 0.1);
let flux = 0;
let frames = 0;
let prev = null;
for (let start = 0; start + frame <= total; start += hop) {
  const mag = spectrum(start, frame);
  if (prev) {
    let d = 0;
    let e = 0;
    for (let i = 0; i < mag.length; i++) {
      d += Math.abs(mag[i] - prev[i]);
      e += mag[i] + prev[i];
    }
    if (e > 0) {
      flux += d / e;
      frames++;
    }
  }
  prev = mag;
}
console.log(`mean spectral change between 100 ms frames: ${(flux / Math.max(1, frames)).toFixed(3)} (0 = static, ~1 = completely different)`);

if (opts.pitch) {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (f) => {
    const m = Math.round(69 + 12 * Math.log2(f / 440));
    return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  };
  // Dominant pitch-class histogram (strongest low peak per 0.25 s window).
  const size = 16384;
  const hist = new Map();
  const lowNotes = new Map();
  for (let start = 0; start + size <= total; start += Math.round(rate * 0.25)) {
    const mag = spectrum(start, size);
    const binHz = rate / size;
    let best = 0;
    let bestBin = 0;
    for (let i = Math.ceil(40 / binHz); i < Math.floor(1000 / binHz); i++) {
      if (mag[i] > best) {
        best = mag[i];
        bestBin = i;
      }
    }
    if (best <= 0) continue;
    // Parabolic interpolation for a finer frequency estimate.
    const a = mag[bestBin - 1];
    const b = mag[bestBin];
    const c = mag[bestBin + 1];
    const p = (a - c) / (2 * (a - 2 * b + c) || 1);
    const f = (bestBin + p) * binHz;
    const name = noteName(f);
    hist.set(name.replace(/-?\d+$/, ''), (hist.get(name.replace(/-?\d+$/, '')) || 0) + 1);
    lowNotes.set(name, (lowNotes.get(name) || 0) + 1);
  }
  const top = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log('strongest spectral peak per 0.25 s, pitch classes:', top(hist));
  console.log('strongest spectral peak per 0.25 s, notes:', top(lowNotes));
}

// --- WAV output ---------------------------------------------------------------

if (outPath) {
  const dataBytes = total * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < total; i++) {
    buf.writeInt16LE(q(left[i]), 44 + i * 4);
    buf.writeInt16LE(q(right[i]), 46 + i * 4);
  }
  writeFileSync(outPath, buf);
  console.log(`wrote ${outPath}`);
}
