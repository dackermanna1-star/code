// The sounds of the tomb, all synthesized: stone grinding and slamming,
// splashes, roaring fire, sand blasting, jaws snapping, a swarm of scarabs,
// mummies groaning, spears and blades, the Pharaoh's gong, the gates, the
// Eye of Ra charging and firing. And the music: the Hijaz scale (D Eb F#
// G A Bb C), a darbuka playing maqsum (doum tek - tek doum - tek -), an oud,
// a ney flute over a drone.
import { sounds } from '../../engine/Sound.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const one = (fn, pos, vol = 1) => sounds.custom(fn, pos || null, vol);

export function tone(freq, dur, o = {}) {
  one((c, out, t, K) => {
    const s = t + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, s);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, s + dur);
    const g = c.createGain(); K.env(g, s, o.a || 0.005, o.vol ?? 0.3, dur);
    K.chain(osc, K.filt(c, 'lowpass', o.lp || 6000), g, out); osc.start(s); osc.stop(s + dur + 0.05);
  }, o.pos, 1);
}
export function burst(dur, o = {}) {
  one((c, out, t, K) => {
    const s = t + (o.delay || 0);
    const n = K.noise(c, o.kind || 'white'); const g = c.createGain(); K.env(g, s, o.a || 0.002, o.vol ?? 0.5, dur);
    const f = K.filt(c, o.type || 'bandpass', o.f || 1500, o.q || 1); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, s + dur);
    K.chain(n, f, g, out); n.start(s, Math.random()); n.stop(s + dur + 0.05);
  }, o.pos, 1);
}

// --- the traps ----------------------------------------------------------------------------------------------------------------------------
/** Stone grinding on stone (a slab moving, a door, a statue turning). */
export function grind(pos, len = 1.2, vol = 0.7) {
  one((c, out, t, K) => {
    const n = K.noise(c, 'brown'); const f = K.filt(c, 'bandpass', 180, 1.2); const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.15); g.gain.setValueAtTime(vol, t + len - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + len);
    const lfo = c.createOscillator(); lfo.frequency.value = rnd(9, 15); const lg = c.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(f.frequency);
    K.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + len + 0.05); lfo.start(t); lfo.stop(t + len);
  }, pos, 1);
}
/** A heavy slam: something huge hits the floor. */
export function slam(pos, vol = 1) {
  one((c, out, t, K) => {
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const g = c.createGain(); K.env(g, t, 0.003, 0.9 * vol, 0.6); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.7);
    const n = K.noise(c, 'brown'); const f = K.filt(c, 'lowpass', 900); const ng = c.createGain(); K.env(ng, t, 0.002, 0.8 * vol, 0.9);
    K.chain(n, f, ng, out); n.start(t, Math.random()); n.stop(t + 1);
    const d = K.noise(c, 'white'); const df = K.filt(c, 'bandpass', 2400, 0.8); const dg = c.createGain(); K.env(dg, t + 0.05, 0.05, 0.12 * vol, 0.8);
    K.chain(d, df, dg, out); d.start(t + 0.05, Math.random()); d.stop(t + 0.9);
  }, pos, 1);
}
export function splash(pos, k = 1) { burst(0.6 * k, { kind: 'white', type: 'lowpass', f: 2600, to: 400, vol: 0.5 * k, a: 0.01, pos }); burst(0.25, { kind: 'pink', type: 'bandpass', f: 900, q: 0.8, vol: 0.4 * k, pos }); }
/** A roar of fire (a flame jet, a geyser of fire). */
export function fire(pos, len = 2, vol = 0.6) {
  one((c, out, t, K) => {
    const n = K.noise(c, 'pink'); const f = K.filt(c, 'lowpass', 1400); const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.12); g.gain.setValueAtTime(vol * 0.8, t + len - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    K.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + len + 0.05); lfo.start(t); lfo.stop(t + len);
  }, pos, 1);
}
/** Sand blasting out of the ground. */
export function sand(pos, len = 3) {
  one((c, out, t, K) => {
    const n = K.noise(c, 'white'); const f = K.filt(c, 'bandpass', 1800, 0.6); const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.1); g.gain.setValueAtTime(0.3, t + len - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + len);
    K.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + len + 0.05);
  }, pos, 1);
  slam(pos, 0.4);
}
/** Jaws snapping shut (a crocodile, the serpent). */
export function chomp(pos, big = true) {
  tone(big ? 70 : 140, 0.25, { to: 40, vol: 0.6, pos });
  burst(0.12, { kind: 'white', type: 'bandpass', f: 1800, q: 2, vol: 0.5, pos });
  burst(0.4, { kind: 'brown', type: 'lowpass', f: 400, vol: 0.5, pos, delay: 0.02 });
}
/** The skittering of ten thousand scarabs. */
export function scarabs(pos, len = 5) {
  one((c, out, t, K) => {
    const n = K.noise(c, 'white'); const f = K.filt(c, 'bandpass', 4200, 3); const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < len * 14; i++) g.gain.linearRampToValueAtTime(rnd(0.05, 0.28) * Math.min(1, i / 8, (len * 14 - i) / 8), t + i / 14);
    K.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + len + 0.1);
  }, pos, 1);
}
/** A mummy's groan. */
export function groan(pos) {
  one((c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; const f0 = rnd(80, 120);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 0.5); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 1.6);
    const f = K.filt(c, 'bandpass', 500, 4); const f2 = K.filt(c, 'lowpass', 1200); const g = c.createGain(); K.env(g, t, 0.2, 0.35, 1.6);
    K.chain(o, f, f2, g, out); o.start(t); o.stop(t + 1.8);
  }, pos, 1);
}
export function spears(pos) { burst(0.18, { kind: 'white', type: 'highpass', f: 2500, vol: 0.4, pos }); for (let i = 0; i < 4; i++) tone(rnd(1800, 2600), 0.25, { type: 'triangle', vol: 0.06, delay: 0.08 + i * 0.03, pos }); }
export function swoosh(pos, vol = 0.4) { burst(0.5, { kind: 'pink', type: 'bandpass', f: 400, to: 1400, q: 1.5, vol, pos }); }
/** The Pharaoh's gong when a trap fires (and a hiss of the curse). */
export function gong(pos, vol = 0.55) {
  one((c, out, t, K) => {
    for (const [m, a, d] of [[1, 1, 3.5], [2.76, 0.5, 2.2], [5.4, 0.25, 1.4], [8.9, 0.12, 0.9]]) {
      const o = c.createOscillator(); o.frequency.value = 110 * m * rnd(0.995, 1.005); const g = c.createGain(); K.env(g, t, 0.004, vol * 0.3 * a, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1);
    }
  }, pos, 1);
}
export function tick(last = false) { tone(last ? 880 : 660, last ? 0.5 : 0.12, { type: 'triangle', vol: last ? 0.3 : 0.2 }); if (last) gong(null, 0.5); }
/** The great gates grinding open. */
export function gates(pos) { grind(pos, 3.5, 0.9); tone(55, 3.4, { type: 'sawtooth', vol: 0.15, lp: 200, pos }); }
/** The Eye of Ra opening: a long rising choir and a pulse. */
export function eyeCharge(len = 12) {
  one((c, out, t) => {
    for (const n of [50, 57, 62, 66, 69]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(NOTE(n), t); o.frequency.exponentialRampToValueAtTime(NOTE(n + 12), t + len);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + len);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + len * 0.6); g.gain.linearRampToValueAtTime(0.06, t + len); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.3);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.4);
    }
  }, null, 1);
}
export function eyeBlast() {
  slam(null, 1.4);
  burst(3, { kind: 'pink', type: 'lowpass', f: 3000, to: 200, vol: 0.7, a: 0.01 });
  for (let i = 0; i < 6; i++) tone(NOTE(74 + [0, 4, 7, 12, 16, 19][i]), 2.4, { type: 'sine', vol: 0.08, delay: 0.1 + i * 0.05 });
}
/** The runners win: a fanfare on the Hijaz scale. */
export function fanfareWin() { [[62, 0], [66, 0.18], [69, 0.36], [74, 0.54], [72, 0.9], [74, 1.1]].forEach(([n, d]) => { tone(NOTE(n), 0.5, { type: 'sawtooth', vol: 0.07, delay: d, lp: 2400 }); tone(NOTE(n - 12), 0.5, { type: 'triangle', vol: 0.12, delay: d }); }); }
/** The Pharaoh wins: a low, sinister phrase. */
export function fanfareLose() { [[50, 0], [51, 0.4], [54, 0.8], [50, 1.4]].forEach(([n, d]) => { tone(NOTE(n), 0.7, { type: 'sawtooth', vol: 0.09, delay: d, lp: 900 }); }); gong(null, 0.6); }

// --- the music --------------------------------------------------------------------------------------------------------------------------------
let nbuf = null;
function noiseBuf(c) { if (nbuf) return nbuf; nbuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
const env = (g, t, a, v, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
const I = {
  // darbuka: doum (low, round), tek (sharp rim), ka (soft)
  doum(c, out, t, v = 0.35) { const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18); const g = c.createGain(); env(g, t, 0.003, v, 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4); },
  tek(c, out, t, v = 0.14) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 2; const g = c.createGain(); env(g, t, 0.001, v, 0.07); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + 0.1); const o = c.createOscillator(); o.frequency.value = 820; const og = c.createGain(); env(og, t, 0.001, v * 0.5, 0.05); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.06); },
  riq(c, out, t, v = 0.05) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; const g = c.createGain(); env(g, t, 0.001, v, 0.12); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + 0.14); },
  // an oud: a bright pluck that dies away, with the second string just off
  oud(c, out, t, n, d, v = 0.06) { for (const det of [-6, 5]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(420, t + Math.min(d, 0.6)); f.Q.value = 2; const g = c.createGain(); env(g, t, 0.003, v, Math.max(0.2, d)); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1); } },
  // a ney: breathy and slow, with vibrato
  ney(c, out, t, n, d, v = 0.05) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(n); const vib = c.createOscillator(); vib.frequency.value = 5.2; const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(NOTE(n) * 0.012, t + d * 0.5); vib.connect(vg); vg.connect(o.frequency); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.25, d * 0.3)); g.gain.setValueAtTime(v * 0.9, t + d * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); const n2 = c.createBufferSource(); n2.buffer = noiseBuf(c); const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = NOTE(n) * 2; bf.Q.value = 3; const bg = c.createGain(); bg.gain.value = v * 0.35; n2.connect(bf); bf.connect(bg); bg.connect(g); o.start(t); vib.start(t); n2.start(t, Math.random() * 0.2); o.stop(t + d + 0.05); vib.stop(t + d + 0.05); n2.stop(t + d + 0.05); },
  drone(c, out, t, n, d, v = 0.05) { for (const [m, det] of [[1, -4], [1, 4], [1.5, 0]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n) * m; o.detune.value = det; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * (m > 1 ? 0.5 : 1), t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  bass(c, out, t, n, d, v = 0.16) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(n); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = c.createGain(); env(g, t, 0.01, v, d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); },
  taiko(c, out, t, v = 0.5) { const o = c.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3); const g = c.createGain(); env(g, t, 0.004, v, 0.7); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.75); const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const ng = c.createGain(); env(ng, t, 0.002, v * 0.4, 0.25); n.connect(f); f.connect(ng); ng.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + 0.3); },
};
// D Hijaz: D Eb F# G A Bb C
const HJ = [62, 63, 66, 67, 69, 70, 72, 74, 75, 78, 79, 81];
const SONGS = {
  // the camp: a drone, a slow ney melody, a soft darbuka
  camp: {
    bpm: 84, steps: 128,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16);
      if (b === 0 && bar % 2 === 0) I.drone(c, out, t, 38, L * 32, 0.035);
      if ([0, 6, 8, 12].includes(b)) (b === 0 || b === 8 ? I.doum : I.tek)(c, out, t, b === 0 || b === 8 ? 0.16 : 0.06);
      if (b % 2 === 1) I.riq(c, out, t, 0.012);
      const mel = [[0, 69, 6], [6, 70, 2], [8, 69, 4], [12, 67, 4], [16, 66, 6], [22, 67, 2], [24, 66, 4], [28, 63, 4], [32, 62, 12], [48, 66, 4], [52, 67, 4], [56, 69, 8], [64, 74, 6], [70, 72, 2], [72, 70, 4], [76, 69, 4], [80, 70, 4], [84, 69, 2], [86, 67, 2], [88, 66, 8], [96, 67, 4], [100, 66, 4], [104, 63, 4], [108, 62, 20]];
      for (const [at, n, len] of mel) if (s === at) I.ney(c, out, t, n, L * len * 0.95, 0.045);
      if (b === 0 && bar % 4 === 2) I.oud(c, out, t, 50, L * 6, 0.04);
    },
  },
  // the run: maqsum on the darbuka, a pulsing bass, an oud riff
  run: {
    bpm: 116, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      // maqsum: D T . T D . T .  (in eighths)
      if (b === 0 || b === 8) I.doum(c, out, t, 0.3);
      if (b === 2 || b === 6 || b === 12) I.tek(c, out, t, 0.12);
      if (b % 2 === 1) I.riq(c, out, t, 0.02);
      if (b === 14 && bar === 3) I.tek(c, out, t, 0.09);
      const root = [50, 50, 51, 48][bar];
      if (b % 4 === 0) I.bass(c, out, t, root - 12 + (b === 8 ? 7 : 0), L * 3, 0.13);
      const riff = [[0, 62], [2, 63], [3, 66], [4, 67], [6, 66], [7, 63], [8, 62], [11, 63], [12, 66], [14, 63]];
      for (const [at, n] of riff) if (b === at) I.oud(c, out, t, n + (bar === 2 ? 1 : bar === 3 ? -2 : 0), L * 1.8, 0.035);
      if (b === 0 && bar === 0) I.drone(c, out, t, 38, L * 64, 0.02);
    },
  },
  // the Eye of Ra: big drums and a rising chant
  eye: {
    bpm: 132, steps: 32,
    play(c, out, t, s, L) {
      const b = s % 16;
      if (b === 0 || b === 6 || b === 10) I.taiko(c, out, t, 0.45);
      if (b === 4 || b === 12) I.tek(c, out, t, 0.14);
      if (b % 2 === 1) I.riq(c, out, t, 0.03);
      if (b === 0) { I.bass(c, out, t, 38, L * 8, 0.16); for (const n of [62, 66, 69]) I.ney(c, out, t, n + (s >= 16 ? 1 : 0), L * 14, 0.02); }
    },
  },
};
const songs = {};
export function playSong(id, vol = 0.35) {
  const cur = songs.music;
  if (cur?.id === id && !cur.dead) { cur.h.setVolume(vol); return; }
  stopSong();
  const song = SONGS[id];
  if (!song) return;
  const h = sounds.customLoop((c, out) => ({ c, out }), vol);
  if (h.dead) return;
  const S = { id, h, c: h.ctx, out: h.out, step: 0, next: h.ctx.currentTime + 0.1, dead: false };
  const L = 60 / song.bpm / 4;
  S.timer = setInterval(() => {
    if (S.next < S.c.currentTime) S.next = S.c.currentTime + 0.05;
    while (S.next < S.c.currentTime + 0.3) { try { song.play(S.c, S.out, S.next, S.step % song.steps, L); } catch { /* a note dropped */ } S.step++; S.next += L; }
  }, 60);
  songs.music = S;
}
export function stopSong() { const S = songs.music; if (!S) return; clearInterval(S.timer); S.h.stop(); S.dead = true; delete songs.music; }
export function songId() { return songs.music?.id || null; }
/** The wind over the desert, a loop (level 0..1). */
let wind = null;
export function windLevel(v) {
  if (!wind || wind.dead) {
    wind = sounds.customLoop((c, out, t, K) => {
      const n = K.noise(c, 'pink', true); const f = K.filt(c, 'bandpass', 600, 0.7); const g = c.createGain(); g.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency);
      K.chain(n, f, g, out); n.start(t); lfo.start(t);
      return { stop: (tt) => { n.stop(tt); lfo.stop(tt); } };
    }, 0);
  }
  wind?.setVolume(v);
}
export function stopAll() { stopSong(); wind?.stop(); wind = null; }
