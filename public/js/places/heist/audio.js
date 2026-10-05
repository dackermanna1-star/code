// Heist sounds, all synthesized: police sirens, the bank's alarm bell, the
// thermal drill, the vault door, explosions, breaking glass, screams, the
// van, the helicopter, tense heist music that builds with the action, and
// the crew's voices (the browser's speech synthesis, with subtitles).
import { sounds } from '../../engine/Sound.js';

const loops = {};
function loop(name, fn, vol = 1) {
  if (loops[name] && !loops[name].dead) return loops[name];
  loops[name] = sounds.customLoop(fn, vol);
  return loops[name];
}
export function stopLoop(name) { if (loops[name]) { loops[name].stop(); delete loops[name]; } }
export function setLoopVolume(name, v) { loops[name]?.setVolume(v); }
export function stopAll() { for (const k of Object.keys(loops)) stopLoop(k); stopMusic(); window.speechSynthesis?.cancel(); }

// --- loops -------------------------------------------------------------------------------------------
/** The European-style two-tone is wrong for an American city: a wail that sweeps up and down. */
export function siren(vol = 0.3) {
  return loop('siren', (c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth';
    const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.22;
    const depth = c.createGain(); depth.gain.value = 420;
    o.frequency.value = 1050; lfo.connect(depth); depth.connect(o.frequency);
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 1060; depth.connect(o2.frequency); // a second car, slightly off
    const lfo2 = c.createOscillator(); lfo2.type = 'square'; lfo2.frequency.value = 3.1; const d2 = c.createGain(); d2.gain.value = 260; lfo2.connect(d2); d2.connect(o2.frequency);
    const bp = K.filt(c, 'bandpass', 1300, 0.7); const g2 = c.createGain(); g2.gain.value = 0.5;
    o.connect(bp); o2.connect(g2); g2.connect(bp);
    K.chain(bp, K.filt(c, 'lowpass', 3200), out);
    for (const n of [o, lfo, o2, lfo2]) n.start(t);
    return { stop: (s) => { for (const n of [o, lfo, o2, lfo2]) n.stop(s); } };
  }, vol);
}
/** The bank's alarm: a hammered bell ringing ~18 times a second. */
export function alarmBell(vol = 0.35) {
  return loop('alarm', (c, out, t, K) => {
    const am = c.createGain(); am.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 17; const ld = c.createGain(); ld.gain.value = 0.5;
    const off = c.createConstantSource ? c.createConstantSource() : null; if (off) { off.offset.value = 0.5; off.connect(am.gain); off.start(t); }
    lfo.connect(ld); ld.connect(am.gain);
    const os = [2400, 3520, 5310].map((f, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = [0.6, 0.3, 0.15][i]; o.connect(g); g.connect(am); o.start(t); return o; });
    K.chain(am, K.filt(c, 'highpass', 900), out);
    lfo.start(t);
    return { stop: (s) => { lfo.stop(s); off?.stop(s); for (const o of os) o.stop(s); } };
  }, vol);
}
/** The thermal drill: motor whine and the grinding of the bit. set(running 0..1). */
export function drillLoop(vol = 0.4) {
  return loop('drill', (c, out, t, K) => {
    const run = c.createGain(); run.gain.value = 1; run.connect(out);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 190;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 382;
    const wob = c.createOscillator(); wob.frequency.value = 7; const wd = c.createGain(); wd.gain.value = 6; wob.connect(wd); wd.connect(o.frequency); wd.connect(o2.frequency);
    const g1 = c.createGain(); g1.gain.value = 0.25; const g2 = c.createGain(); g2.gain.value = 0.08;
    K.chain(o, K.filt(c, 'lowpass', 1400), g1, run); K.chain(o2, K.filt(c, 'bandpass', 900, 2), g2, run);
    const n = K.noise(c, 'white', true); const ng = c.createGain(); ng.gain.value = 0.18;
    K.chain(n, K.filt(c, 'bandpass', 3200, 1.5), ng, run);
    for (const x of [o, o2, wob, n]) x.start(t);
    return {
      set(r) { run.gain.setTargetAtTime(r, c.currentTime, 0.15); o.frequency.setTargetAtTime(120 + 70 * r, c.currentTime, 0.3); },
      stop: (s) => { for (const x of [o, o2, wob, n]) x.stop(s); },
    };
  }, vol);
}
/** The van's engine, pitched by speed (set(0..1)). */
export function engine(vol = 0.25) {
  return loop('engine', (c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 110;
    const g = c.createGain(); g.gain.value = 0.35; const g2 = c.createGain(); g2.gain.value = 0.1;
    const lp = K.filt(c, 'lowpass', 500); o.connect(g); o2.connect(g2); g.connect(lp); g2.connect(lp); lp.connect(out);
    const n = K.noise(c, 'brown', true); const ng = c.createGain(); ng.gain.value = 0.5; K.chain(n, K.filt(c, 'lowpass', 300), ng, out); // road rumble
    for (const x of [o, o2, n]) x.start(t);
    return {
      set(s) { const f = 45 + s * 95; o.frequency.setTargetAtTime(f, c.currentTime, 0.2); o2.frequency.setTargetAtTime(f * 2, c.currentTime, 0.2); lp.frequency.setTargetAtTime(350 + s * 900, c.currentTime, 0.2); },
      stop: (s) => { for (const x of [o, o2, n]) x.stop(s); },
    };
  }, vol);
}
/** Helicopter rotor thump. */
export function rotor(vol = 0.3) {
  return loop('rotor', (c, out, t, K) => {
    const n = K.noise(c, 'brown', true); const am = c.createGain(); am.gain.value = 0.3;
    const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 19; const ld = c.createGain(); ld.gain.value = 0.7; lfo.connect(ld); ld.connect(am.gain);
    K.chain(n, K.filt(c, 'lowpass', 420), am, out);
    const w = K.noise(c, 'white', true); const wg = c.createGain(); wg.gain.value = 0.05; K.chain(w, K.filt(c, 'bandpass', 2600, 2), wg, out);
    for (const x of [n, lfo, w]) x.start(t);
    return { stop: (s) => { for (const x of [n, lfo, w]) x.stop(s); } };
  }, vol);
}

// --- one-shots ---------------------------------------------------------------------------------------
export function explosion(pos, big = 1) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c, 'brown'); const g = c.createGain(); K.env(g, t, 0.005, 2.2 * big, 1.6 * big);
    K.chain(n, K.filt(c, 'lowpass', 900), g, out); n.start(t); n.stop(t + 2.5);
    const w = K.noise(c); const wg = c.createGain(); K.env(wg, t, 0.002, 1.0, 0.4); K.chain(w, K.filt(c, 'highpass', 1500), wg, out); w.start(t); w.stop(t + 0.6);
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.8); const og = c.createGain(); K.env(og, t, 0.005, 1.8 * big, 0.9);
    K.chain(o, og, out); o.start(t); o.stop(t + 1.2);
    const e = K.noise(c, 'pink'); const eg = c.createGain(); K.env(eg, t + 0.15, 0.1, 0.4, 2.5); K.chain(e, K.filt(c, 'lowpass', 500), eg, out); e.start(t + 0.15); e.stop(t + 3);
  }, pos, 1);
}
export function glassBreak(pos) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.001, 0.9, 0.25); K.chain(n, K.filt(c, 'highpass', 2500), g, out); n.start(t); n.stop(t + 0.35);
    for (let i = 0; i < 9; i++) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 3000 + Math.random() * 5000; const og = c.createGain();
      const tt = t + 0.04 + Math.random() * 0.6; K.env(og, tt, 0.001, 0.12, 0.08); K.chain(o, og, out); o.start(tt); o.stop(tt + 0.12);
    }
  }, pos, 0.8);
}
export function scream(pos, pitch = 1) {
  sounds.custom((c, out, t, K) => {
    const f0 = (380 + Math.random() * 220) * pitch;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 0.15); o.frequency.linearRampToValueAtTime(f0 * 0.75, t + 1.0);
    const vib = c.createOscillator(); vib.frequency.value = 6; const vd = c.createGain(); vd.gain.value = f0 * 0.04; vib.connect(vd); vd.connect(o.frequency);
    const g = c.createGain(); K.env(g, t, 0.05, 0.5, 0.9);
    const mix = c.createGain(); mix.gain.value = 1;
    for (const [f, q, a] of [[900, 6, 1], [1400, 8, 0.7], [2700, 10, 0.35]]) { const b = K.filt(c, 'bandpass', f * pitch, q); const bg = c.createGain(); bg.gain.value = a; o.connect(b); b.connect(bg); bg.connect(mix); }
    K.chain(mix, g, out); o.start(t); vib.start(t); o.stop(t + 1.1); vib.stop(t + 1.1);
  }, pos, 0.5);
}
export function beep(freq = 1800, len = 0.08, vol = 0.3, pos = null) {
  sounds.custom((c, out, t, K) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq; const g = c.createGain(); K.env(g, t, 0.002, vol, len); K.chain(o, K.filt(c, 'lowpass', 4000), g, out); o.start(t); o.stop(t + len + 0.05); }, pos, 1);
}
export function chime(up = true) {
  const notes = up ? [660, 880, 1320] : [440, 330, 220];
  sounds.custom((c, out, t, K) => notes.forEach((f, i) => { const o = c.createOscillator(); o.type = up ? 'triangle' : 'square'; o.frequency.value = f; const g = c.createGain(); K.env(g, t + i * 0.09, 0.005, up ? 0.35 : 0.2, 0.3); K.chain(o, K.filt(c, 'lowpass', 3000), g, out); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4); }), null, 1);
}
export function clunk(pos, low = 1) {
  sounds.custom((c, out, t, K) => {
    const o = c.createOscillator(); o.frequency.setValueAtTime(140 * low, t); o.frequency.exponentialRampToValueAtTime(50 * low, t + 0.25); const g = c.createGain(); K.env(g, t, 0.003, 1.2, 0.35); K.chain(o, g, out); o.start(t); o.stop(t + 0.5);
    const n = K.noise(c); const ng = c.createGain(); K.env(ng, t, 0.001, 0.6, 0.08); K.chain(n, K.filt(c, 'bandpass', 1800, 1.5), ng, out); n.start(t); n.stop(t + 0.15);
  }, pos, 1);
}
export function rumble(pos, secs = 4) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c, 'brown'); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2, t + 0.4); g.gain.setValueAtTime(1.2, t + secs - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    K.chain(n, K.filt(c, 'lowpass', 220), g, out); n.start(t); n.stop(t + secs + 0.1);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38; const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25, t + 0.5); og.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    K.chain(o, K.filt(c, 'lowpass', 120), og, out); o.start(t); o.stop(t + secs + 0.1);
  }, pos, 1);
}
export function rustle(pos) {
  sounds.custom((c, out, t, K) => { for (let i = 0; i < 4; i++) { const n = K.noise(c); const g = c.createGain(); const tt = t + i * 0.07 + Math.random() * 0.03; K.env(g, tt, 0.005, 0.25, 0.06); K.chain(n, K.filt(c, 'bandpass', 2500 + Math.random() * 2000, 1.2), g, out); n.start(tt); n.stop(tt + 0.1); } }, pos, 0.7);
}
export function zipper() {
  sounds.custom((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); const am = c.createGain(); const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 60; const ld = c.createGain(); ld.gain.value = 0.5; l.connect(ld); ld.connect(am.gain); K.chain(n, K.filt(c, 'bandpass', 3500, 2), am, g, out); n.start(t); l.start(t); n.stop(t + 0.4); l.stop(t + 0.4); }, null, 1);
}
export function whoosh() {
  sounds.custom((c, out, t, K) => { const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, t, 0.08, 0.5, 0.3); const f = K.filt(c, 'bandpass', 400, 1.5); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.35); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.5); }, null, 1);
}
export function screech(pos) {
  sounds.custom((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.05, 0.5, 0.9); const f = K.filt(c, 'bandpass', 2200, 12); const l = c.createOscillator(); l.frequency.value = 11; const ld = c.createGain(); ld.gain.value = 300; l.connect(ld); ld.connect(f.frequency); K.chain(n, f, g, out); n.start(t); l.start(t); n.stop(t + 1.1); l.stop(t + 1.1); }, pos, 1);
}
export function crash(pos) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.002, 1.3, 0.5); K.chain(n, K.filt(c, 'bandpass', 1200, 0.6), g, out); n.start(t); n.stop(t + 0.7);
    const b = K.noise(c, 'brown'); const bg = c.createGain(); K.env(bg, t, 0.003, 1.5, 0.4); K.chain(b, K.filt(c, 'lowpass', 300), bg, out); b.start(t); b.stop(t + 0.5);
    for (let i = 0; i < 6; i++) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 600 + Math.random() * 2400; const og = c.createGain(); const tt = t + 0.05 + Math.random() * 0.4; K.env(og, tt, 0.001, 0.15, 0.2); K.chain(o, og, out); o.start(tt); o.stop(tt + 0.25); }
  }, pos, 1);
}
export function slam(pos) { clunk(pos, 0.8); }

// --- music: a looping heist score that layers up with the action ----------------------------------------
// intensity 0: casing the bank (pads, soft ticking); 1: the hold-up (bass, drums);
// 2: the assault (driving hats, lead stabs); 3: the getaway (everything, faster)
let M = null;
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const BASS = [45, 45, 48, 45, 43, 45, 40, 43, 45, 45, 48, 50, 52, 50, 48, 43]; // A minor
const LEAD = [69, 72, 76, 74, 72, 69, 67, 69];
export function startMusic() {
  if (M) return;
  const h = sounds.customLoop((c, out) => ({ c, out }), 0.32);
  if (h.dead) return;
  M = { c: h.ctx, out: h, step: 0, next: h.ctx.currentTime + 0.1, intensity: 0, target: 0, timer: null };
  const outNode = h.out;
  M.bus = outNode;
  M.timer = setInterval(schedule, 50);
}
export function setMusic(i) { if (M) M.target = i; else if (i > 0) { startMusic(); if (M) M.target = i; } }
export function stopMusic() { if (!M) return; clearInterval(M.timer); M.out.stop(); M = null; }
function schedule() {
  const c = M.c, out = M.bus;
  M.intensity = M.target;
  const bpm = M.intensity >= 3 ? 136 : M.intensity >= 2 ? 124 : 112;
  const step = 60 / bpm / 4; // sixteenths
  while (M.next < c.currentTime + 0.25) {
    const s = M.step, t = M.next, I = M.intensity;
    const beat = s % 16;
    // pad (always): a minor chord swell every bar
    if (beat === 0) {
      const root = BASS[(s / 16 | 0) % BASS.length];
      for (const iv of [12, 15, 19]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(root + iv); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(I ? 0.035 : 0.05, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 16); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + step * 16 + 0.05); }
    }
    // ticking clock
    if (I === 0 && beat % 4 === 0) click(c, out, t, 4200, 0.05);
    if (I >= 1) {
      // bass: eighth notes
      if (beat % 2 === 0) { const root = BASS[(s / 16 | 0) % BASS.length]; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = NOTE(root - 12 + (beat % 8 === 6 ? 12 : 0)); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.8); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420 + I * 120; o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + step * 2); }
      // kick and snare
      if (beat === 0 || beat === 8 || (I >= 2 && beat === 10)) kick(c, out, t);
      if (beat === 4 || beat === 12) snare(c, out, t, 0.2);
    }
    if (I >= 2) {
      click(c, out, t, 8000, beat % 2 ? 0.03 : 0.06); // hats
      if (beat % 4 === 2) { const n = LEAD[((s / 4) | 0) % LEAD.length]; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.5); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + step * 2); }
    }
    if (I >= 3 && beat % 2 === 1) snare(c, out, t, 0.05);
    M.step++; M.next += step;
  }
}
function kick(c, out, t) { const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); }
let nb = null;
function nbuf(c) { if (nb) return nb; nb = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nb; }
function snare(c, out, t, v) { const n = c.createBufferSource(); n.buffer = nbuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.2); }
function click(c, out, t, freq, v) { const n = c.createBufferSource(); n.buffer = nbuf(c); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.05); }

// --- voices ----------------------------------------------------------------------------------------------
let voiceOn = true;
export function setVoices(on) { voiceOn = on; if (!on) window.speechSynthesis?.cancel(); }
export function voicesOn() { return voiceOn; }
let voiceList = null;
function pickVoice(i) {
  const ss = window.speechSynthesis; if (!ss) return null;
  if (!voiceList || !voiceList.length) voiceList = ss.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!voiceList.length) return null;
  return voiceList[i % voiceList.length];
}
/** Say a line (if voices are on). who: {pitch, rate, voice}. */
export function speak(text, who = {}) {
  const ss = window.speechSynthesis;
  if (!voiceOn || !ss || sounds.muted) return;
  try {
    if (who.interrupt) ss.cancel();
    if (ss.speaking && ss.pending) return; // don't queue up a backlog
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(who.voice || 0); if (v) u.voice = v;
    u.pitch = who.pitch ?? 1; u.rate = who.rate ?? 1.08; u.volume = who.volume ?? 0.9;
    ss.speak(u);
  } catch { /* no speech */ }
}
