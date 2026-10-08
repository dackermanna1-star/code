// Sounds of the Games, all synthesized: the crowd (a murmur that swells into
// cheers, gasps of "oooh" at the nasty ones, applause), bodies hitting things
// (thuds, smacks, bone cracks), the cannon, the whistle, the starting pistol,
// splashes, pins, the wind past you in flight, fanfares, and a little
// sequencer for the music.
import { sounds } from '../../engine/Sound.js';
import { tone, burst } from '../elevator/audio.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
export { tone, burst };

// --- the crowd -------------------------------------------------------------------------------------------------------------------------------
let crowd = null, wind = null;
/** The murmur of 30,000 people (a loop; level 0..1). */
export function crowdBed(level = 0.3) {
  if (crowd && !crowd.dead) { crowd.setVolume(level); return crowd; }
  crowd = sounds.customLoop((c, out, t, K) => {
    const parts = [];
    for (const [f, q, v] of [[520, 0.7, 0.55], [1150, 1.2, 0.3], [2600, 2, 0.12]]) {
      const n = K.noise(c, 'pink'); const bp = K.filt(c, 'bandpass', f, q); const g = c.createGain(); g.gain.value = v;
      // slow swells
      const lfo = c.createOscillator(); lfo.frequency.value = rnd(0.07, 0.2); const lg = c.createGain(); lg.gain.value = v * 0.35; lfo.connect(lg); lg.connect(g.gain);
      K.chain(n, bp, g, out); n.start(t); lfo.start(t); parts.push(n, lfo);
    }
    return { stop: (tt) => parts.forEach((p) => p.stop(tt)) };
  }, level);
  return crowd;
}
export function crowdLevel(v) { if (crowd && !crowd.dead) crowd.setVolume(v); }

/** A cheer: a roar that swells and dies away, with whistles. */
export function cheer(k = 1) {
  const len = 1.6 + k * 1.6;
  for (let i = 0; i < 4; i++) burst(len, { kind: 'pink', type: 'bandpass', f: rnd(700, 1500), q: 0.9, a: 0.25 + i * 0.05, vol: 0.18 * k, delay: i * 0.08 });
  for (let i = 0; i < Math.round(2 + k * 4); i++) {
    const d = rnd(0.1, len * 0.6), f = rnd(2200, 3400);
    tone(f, rnd(0.25, 0.5), { type: 'sine', to: f * rnd(1.05, 1.25), vol: 0.035 * k, delay: d });
  }
}
/** "Oooooh!" - the crowd wincing at a nasty one. */
export function ooh(k = 1) {
  sounds.custom((c, out, t) => {
    const len = 1.5;
    for (let v = 0; v < 9; v++) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f0 = rnd(140, 330);
      o.frequency.setValueAtTime(f0 * 0.92, t); o.frequency.linearRampToValueAtTime(f0 * 1.08, t + 0.35); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + len);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 330; f1.Q.value = 3;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * k, t + 0.25 + Math.random() * 0.1); g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(out); o.start(t + Math.random() * 0.08); o.stop(t + len + 0.1);
    }
  }, null, 1);
}
/** Applause: lots of hands. */
export function applause(secs = 3, k = 1) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c, 'white'); const hp = K.filt(c, 'bandpass', 2400, 0.6);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22 * k, t + 0.3); g.gain.setValueAtTime(0.22 * k, t + secs * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + secs);
    // the clatter: amplitude jitter
    const am = c.createGain(); am.gain.value = 0.6;
    const j = K.noise(c, 'white'); const jl = K.filt(c, 'lowpass', 60); const jg = c.createGain(); jg.gain.value = 0.9; j.connect(jl); jl.connect(jg); jg.connect(am.gain);
    K.chain(n, hp, am, g, out); n.start(t); j.start(t); n.stop(t + secs + 0.1); j.stop(t + secs + 0.1);
  }, null, 1);
}

// --- bodies ------------------------------------------------------------------------------------------------------------------------------------
/** A body hitting something at speed v (studs/s). */
export function impact(v, pos, soft = false) {
  const k = Math.min(1.4, v / 45);
  if (k < 0.12) return;
  tone(rnd(85, 115) / (1 + k * 0.3), 0.18 + k * 0.12, { to: 38, vol: 0.55 * k, pos });
  burst(0.06 + k * 0.06, { kind: 'brown', type: 'lowpass', f: soft ? 500 : 900 + k * 600, vol: 0.7 * k, pos });
  if (k > 0.6 && !soft) burst(0.05, { f: rnd(1500, 2500), q: 1, vol: 0.35 * k, pos });
}
export function crack(pos) {
  burst(0.05, { f: 4200, q: 0.5, vol: 1.0, pos });
  tone(1900, 0.05, { type: 'square', to: 500, vol: 0.18, pos });
  for (let i = 0; i < 4; i++) burst(0.035, { f: rnd(2500, 6000), vol: 0.45, delay: 0.04 + i * rnd(0.025, 0.06), pos });
}
export function oof(pos) { sounds.play('uuhhh', pos, 0.9); }
export function splash(pos, k = 1) {
  burst(0.5 + k * 0.5, { kind: 'white', type: 'lowpass', f: 3500, to: 500, vol: 0.55 * Math.min(1.4, k), pos });
  burst(0.25, { kind: 'pink', type: 'bandpass', f: 800, q: 1.5, vol: 0.4 * Math.min(1.4, k), pos });
  for (let i = 0; i < 5; i++) tone(rnd(500, 1200), 0.08, { type: 'sine', to: rnd(1400, 2400), vol: 0.06, delay: 0.15 + Math.random() * 0.5, pos });
}
export function boing(pos) {
  sounds.custom((c, out, t) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.12); o.frequency.exponentialRampToValueAtTime(260, t + 0.45);
    const lfo = c.createOscillator(); lfo.frequency.value = 18; const lg = c.createGain(); lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
  }, pos, 1);
}
export function pins(pos, n = 10) {
  for (let i = 0; i < n * 2; i++) {
    tone(rnd(500, 1300), 0.13, { type: 'triangle', to: rnd(300, 600), vol: 0.32, delay: i * rnd(0.012, 0.04), pos });
    burst(0.05, { f: rnd(1500, 3500), vol: 0.35, delay: i * 0.025, pos });
  }
  burst(0.6, { kind: 'brown', type: 'lowpass', f: 700, vol: 0.6, pos });
}

// --- the events -----------------------------------------------------------------------------------------------------------------------------------------
export function boom(pos) {
  tone(62, 1.1, { to: 22, vol: 1.4, pos });
  burst(1.2, { kind: 'brown', type: 'lowpass', f: 1200, to: 200, vol: 1.3, pos });
  burst(0.18, { kind: 'white', type: 'highpass', f: 1800, vol: 0.6, pos });
}
export function pistol() { burst(0.25, { kind: 'white', type: 'lowpass', f: 5000, vol: 1.0 }); tone(180, 0.15, { to: 60, vol: 0.5 }); }
export function whistle() {
  sounds.custom((c, out, t) => {
    for (const f of [2750, 2810]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = c.createOscillator(); lfo.frequency.value = 24; const lg = c.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(o.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 0.62);
      o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.65); lfo.stop(t + 0.65);
    }
  }, null, 1);
}
export const beep = (hi = false) => tone(hi ? 1320 : 880, hi ? 0.45 : 0.16, { type: 'square', vol: 0.12, lp: 3500 });
export const tick = () => tone(2000, 0.03, { type: 'square', vol: 0.05, lp: 4000 });
export const charge = (v) => tone(300 + v * 900, 0.05, { type: 'triangle', vol: 0.05 });
export const release = () => { burst(0.25, { kind: 'pink', type: 'bandpass', f: 900, to: 300, vol: 0.4 }); tone(500, 0.2, { type: 'sine', to: 160, vol: 0.2 }); };
export const swoosh = (pos) => burst(0.35, { kind: 'pink', type: 'bandpass', f: 600, to: 2400, q: 1.2, vol: 0.5, pos });
export const ding = () => { for (const [m, a] of [[1, 0.25], [2.76, 0.08]]) tone(1568 * m, 1.0, { vol: a }); };
export const sparkle = () => { for (let i = 0; i < 7; i++) tone(rnd(2200, 4800), 0.3, { vol: 0.05, delay: i * 0.05 }); };
export const firework = (pos) => { tone(rnd(300, 500), 0.9, { type: 'sine', to: rnd(1800, 2600), vol: 0.05, pos }); burst(0.8, { kind: 'pink', type: 'lowpass', f: 1500, vol: 0.9, delay: 0.95, pos }); for (let i = 0; i < 8; i++) burst(0.04, { f: rnd(3000, 7000), vol: 0.18, delay: 1.1 + i * 0.07, pos }); };
export const buzzer = () => { tone(150, 0.6, { type: 'sawtooth', vol: 0.2, lp: 900 }); tone(153, 0.6, { type: 'square', vol: 0.1, lp: 700 }); };
export const punch = (pos) => { tone(120, 0.12, { to: 50, vol: 0.8, pos }); burst(0.08, { kind: 'pink', f: 900, vol: 0.8, pos }); };
export const clank = (pos) => { tone(rnd(300, 420), 0.4, { type: 'triangle', vol: 0.25, pos }); tone(rnd(900, 1200), 0.25, { type: 'sine', vol: 0.1, pos }); };

/** The wind past you in flight (a loop; level by speed). */
export function windLoop() {
  if (wind && !wind.dead) return wind;
  wind = sounds.customLoop((c, out, t, K) => {
    const n = K.noise(c, 'pink'); const f = K.filt(c, 'bandpass', 700, 0.8); n.connect(f); f.connect(out); n.start(t);
    return { stop: (tt) => n.stop(tt), f };
  }, 0);
  return wind;
}
export function windLevel(v) { if (!wind || wind.dead) windLoop(); wind?.setVolume(v); if (wind?.f) wind.f.frequency.value = 500 + v * 1600; }

/** A brass fanfare (the medal moment). */
export function fanfare(big = false) {
  const notes = big
    ? [[67, 0, 0.18], [67, 0.2, 0.12], [67, 0.33, 0.12], [72, 0.48, 0.6], [67, 1.1, 0.2], [72, 1.32, 0.2], [76, 1.54, 0.9]]
    : [[67, 0, 0.15], [72, 0.17, 0.15], [76, 0.34, 0.15], [79, 0.52, 0.55]];
  for (const [n, d, l] of notes) brass(n, d, l, 0.11);
  for (const [n, d, l] of notes) brass(n - 12, d, l, 0.06);
  if (big) setTimeout(() => cheer(1.1), 400);
}
function brass(n, delay, len, v) {
  sounds.custom((c, out, t) => {
    const t0 = t + delay;
    for (const det of [-6, 5]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t0); f.frequency.linearRampToValueAtTime(2600, t0 + 0.06); f.frequency.linearRampToValueAtTime(1500, t0 + len);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.04); g.gain.setValueAtTime(v * 0.85, t0 + len * 0.8); g.gain.linearRampToValueAtTime(0.0001, t0 + len + 0.08);
      o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + len + 0.12);
    }
  }, null, 1);
}

// --- music ---------------------------------------------------------------------------------------------------------------------------------------------------
let nbuf = null;
function noiseBuf(c) { if (nbuf) return nbuf; nbuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
const env = (g, t, a, v, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
const I = {
  brass(c, out, t, n, d, v = 0.05) { for (const det of [-7, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(2200, t + 0.05); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v * 0.8, t + d * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  strings(c, out, t, n, d, v = 0.025) { for (const det of [-9, 0, 9]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  bass(c, out, t, n, d, v = 0.18) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(n); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = c.createGain(); env(g, t, 0.01, v, d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); },
  pluck(c, out, t, n, d, v = 0.05) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = NOTE(n); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(500, t + d); const g = c.createGain(); env(g, t, 0.005, v, d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); },
  bell(c, out, t, n, d, v = 0.05) { for (const [m, a] of [[1, 1], [3, 0.2], [4.2, 0.08]]) { const o = c.createOscillator(); o.frequency.value = NOTE(n) * m; const g = c.createGain(); env(g, t, 0.004, v * a, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  kick(c, out, t, v = 0.45) { const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); },
  snare(c, out, t, v = 0.16) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + 0.2); const o = c.createOscillator(); o.frequency.value = 190; const og = c.createGain(); env(og, t, 0.002, v * 0.6, 0.1); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12); },
  hat(c, out, t, v = 0.04, len = 0.04) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + len + 0.01); },
  timp(c, out, t, n, v = 0.3) { const o = c.createOscillator(); o.frequency.setValueAtTime(NOTE(n) * 1.03, t); o.frequency.exponentialRampToValueAtTime(NOTE(n), t + 0.1); const g = c.createGain(); env(g, t, 0.005, v, 0.9); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.95); },
};
const chord = (fn, c, out, t, notes, d, v) => notes.forEach((n) => fn(c, out, t, n, d, v));

const SONGS = {
  // the Games' theme: a heroic brass tune over strings and timpani (intros, results)
  theme: {
    bpm: 112, steps: 128,
    play(c, out, t, s, L) {
      const bar = Math.floor(s / 16) % 8, b = s % 16;
      const prog = [[48, [60, 64, 67]], [53, [60, 65, 69]], [55, [59, 62, 67]], [48, [60, 64, 67]], [57, [60, 64, 69]], [53, [60, 65, 69]], [55, [59, 62, 67]], [55, [59, 62, 65]]][bar];
      if (b === 0) { chord(I.strings, c, out, t, prog[1], L * 16, 0.016); I.bass(c, out, t, prog[0] - 12, L * 7, 0.16); I.timp(c, out, t, prog[0] - 12, 0.22); }
      if (b === 8) I.bass(c, out, t, prog[0] - 5, L * 6, 0.12);
      if (b === 12 && bar % 2) I.timp(c, out, t, prog[0] - 12, 0.12);
      if (b % 4 === 2) I.hat(c, out, t, 0.02, 0.05);
      const mel = [[0, 67, 3], [3, 67, 1], [4, 72, 4], [8, 76, 3], [11, 74, 1], [12, 72, 4], [16, 74, 6], [22, 72, 2], [24, 69, 4], [28, 67, 4],
        [32, 64, 3], [35, 67, 1], [36, 72, 6], [42, 74, 2], [44, 76, 4], [48, 79, 8], [56, 77, 4], [60, 74, 4],
        [64, 67, 3], [67, 67, 1], [68, 72, 4], [72, 76, 3], [75, 74, 1], [76, 72, 4], [80, 81, 6], [86, 79, 2], [88, 77, 4], [92, 76, 4],
        [96, 74, 3], [99, 72, 1], [100, 76, 4], [104, 74, 6], [110, 71, 2], [112, 72, 12]];
      for (const [at, n, len] of mel) if (s === at) I.brass(c, out, t, n, L * len, 0.04);
    },
  },
  // the action: driving drums and a bass riff (during the events, quietly)
  action: {
    bpm: 128, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      const r = [45, 45, 41, 43][bar];
      if (b % 4 === 0) I.kick(c, out, t, 0.32);
      if (b === 4 || b === 12) I.snare(c, out, t, 0.11);
      if (b % 2 === 0) I.hat(c, out, t, 0.022, 0.035);
      if ([0, 3, 6, 8, 11, 14].includes(b)) I.bass(c, out, t, r - 12 + (b === 14 ? 12 : 0), L * 1.6, 0.14);
      if (b === 0 || b === 10) chord(I.pluck, c, out, t, [r + 12, r + 16, r + 19], L * 2.5, 0.014);
    },
  },
  // the closing ceremony: the anthem, slow and grand
  anthem: {
    bpm: 76, steps: 64,
    play(c, out, t, s, L) {
      const bar = Math.floor(s / 16) % 4, b = s % 16;
      const prog = [[48, [60, 64, 67]], [53, [65, 69, 72]], [55, [62, 67, 71]], [48, [60, 64, 67, 72]]][bar];
      if (b === 0) { chord(I.strings, c, out, t, prog[1], L * 16, 0.02); I.bass(c, out, t, prog[0] - 12, L * 14, 0.16); I.timp(c, out, t, prog[0] - 12, 0.2); }
      const mel = [[0, 72, 6], [6, 71, 2], [8, 69, 4], [12, 67, 4], [16, 69, 6], [22, 72, 2], [24, 77, 8], [32, 76, 6], [38, 74, 2], [40, 72, 4], [44, 74, 4], [48, 72, 16]];
      for (const [at, n, len] of mel) if (s === at) { I.brass(c, out, t, n, L * len, 0.045); I.brass(c, out, t, n - 12, L * len, 0.025); }
      if (b % 4 === 0) I.bell(c, out, t, prog[1][0] + 24, L * 3, 0.012);
    },
  },
};

const songs = {};
export function playSong(ch, id, vol = 0.4) {
  if (songs[ch]?.id === id && !songs[ch].dead) { songs[ch].h.setVolume(vol); return songs[ch]; }
  stopSong(ch);
  const song = SONGS[id];
  if (!song) return null;
  const h = sounds.customLoop((c, out) => ({ c, out }), vol);
  if (h.dead) return null;
  const S = { id, h, c: h.ctx, out: h.out, step: 0, next: h.ctx.currentTime + 0.1, dead: false };
  const L = 60 / song.bpm / 4;
  S.timer = setInterval(() => {
    // (after the tab was hidden, skip the notes that were missed rather than play them all at once)
    if (S.next < S.c.currentTime) S.next = S.c.currentTime + 0.05;
    while (S.next < S.c.currentTime + 0.3) { try { song.play(S.c, S.out, S.next, S.step % song.steps, L); } catch { /* skip a note */ } S.step++; S.next += L; }
  }, 60);
  songs[ch] = S;
  return S;
}
export function songVolume(ch, v) { songs[ch]?.h.setVolume(v); }
export function stopSong(ch) { const S = songs[ch]; if (!S) return; clearInterval(S.timer); S.h.stop(); S.dead = true; delete songs[ch]; }
export function songPlaying(ch) { return songs[ch]?.id || null; }
export function stopAll() { for (const k of Object.keys(songs)) stopSong(k); crowd?.stop(); crowd = null; wind?.stop(); wind = null; }
