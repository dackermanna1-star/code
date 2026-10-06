// Disaster sounds, synthesized: the warning siren, wind, rain, rumbling,
// rushing water, crackling fire, thunder, impacts, splashes and acid sizzle.
import { sounds } from '../../engine/Sound.js';
export { explosion, crash, glassBreak } from '../heist/audio.js';

const loops = {};
function loop(name, fn, vol) {
  if (loops[name] && !loops[name].dead) { loops[name].setVolume(vol); return loops[name]; }
  loops[name] = sounds.customLoop(fn, vol);
  return loops[name];
}
export function stop(name) { if (loops[name]) { loops[name].stop(); delete loops[name]; } }
export function stopAll() { for (const k of Object.keys(loops)) stop(k); }
export function volume(name, v) { loops[name]?.setVolume(v); }

/** The air-raid siren that warns of a disaster. */
export function siren(secs = 4) {
  sounds.custom((c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(720, t + secs * 0.45); o.frequency.setValueAtTime(720, t + secs * 0.6); o.frequency.linearRampToValueAtTime(200, t + secs);
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(223, t); o2.frequency.linearRampToValueAtTime(724, t + secs * 0.45); o2.frequency.setValueAtTime(724, t + secs * 0.6); o2.frequency.linearRampToValueAtTime(202, t + secs);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.4); g.gain.setValueAtTime(0.35, t + secs - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    const m = c.createGain(); m.gain.value = 0.4; o2.connect(m);
    K.chain(o, K.filt(c, 'lowpass', 1600), g, out); m.connect(g);
    o.start(t); o2.start(t); o.stop(t + secs + 0.1); o2.stop(t + secs + 0.1);
  }, null, 0.9);
}

/** Wind: a gusty roar (strength 0..1 with set()). */
export function wind(vol = 0.3) {
  return loop('wind', (c, out, t, K) => {
    const n = K.noise(c, 'pink', true);
    const f = K.filt(c, 'bandpass', 500, 0.8);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.17; const ld = c.createGain(); ld.gain.value = 260; lfo.connect(ld); ld.connect(f.frequency);
    const am = c.createGain(); am.gain.value = 0.7; const l2 = c.createOscillator(); l2.frequency.value = 0.31; const l2d = c.createGain(); l2d.gain.value = 0.3; l2.connect(l2d); l2d.connect(am.gain);
    K.chain(n, f, am, out);
    const hi = K.noise(c, 'white', true); const hg = c.createGain(); hg.gain.value = 0.05; K.chain(hi, K.filt(c, 'highpass', 3000), hg, out);
    for (const x of [n, lfo, l2, hi]) x.start(t);
    return { stop: (s) => { for (const x of [n, lfo, l2, hi]) x.stop(s); } };
  }, vol);
}
export function rain(vol = 0.25) {
  return loop('rain', (c, out, t, K) => {
    const n = K.noise(c, 'white', true); const g = c.createGain(); g.gain.value = 0.5;
    K.chain(n, K.filt(c, 'highpass', 1800), K.filt(c, 'lowpass', 9000), g, out);
    const n2 = K.noise(c, 'pink', true); const g2 = c.createGain(); g2.gain.value = 0.4; K.chain(n2, K.filt(c, 'lowpass', 700), g2, out);
    n.start(t); n2.start(t);
    return { stop: (s) => { n.stop(s); n2.stop(s); } };
  }, vol);
}
export function rumble(vol = 0.4) {
  return loop('rumble', (c, out, t, K) => {
    const n = K.noise(c, 'brown', true); const g = c.createGain(); g.gain.value = 1.2;
    const am = c.createGain(); am.gain.value = 0.7; const l = c.createOscillator(); l.frequency.value = 5; const ld = c.createGain(); ld.gain.value = 0.3; l.connect(ld); ld.connect(am.gain);
    K.chain(n, K.filt(c, 'lowpass', 160), am, g, out);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 31; const og = c.createGain(); og.gain.value = 0.18; K.chain(o, K.filt(c, 'lowpass', 90), og, out);
    for (const x of [n, l, o]) x.start(t);
    return { stop: (s) => { for (const x of [n, l, o]) x.stop(s); } };
  }, vol);
}
export function rush(vol = 0.35) {
  return loop('rush', (c, out, t, K) => {
    const n = K.noise(c, 'pink', true); const f = K.filt(c, 'lowpass', 1200); const g = c.createGain(); g.gain.value = 0.9;
    const l = c.createOscillator(); l.frequency.value = 0.4; const ld = c.createGain(); ld.gain.value = 400; l.connect(ld); ld.connect(f.frequency);
    K.chain(n, f, g, out);
    const b = K.noise(c, 'brown', true); const bg = c.createGain(); bg.gain.value = 0.8; K.chain(b, K.filt(c, 'lowpass', 220), bg, out);
    for (const x of [n, l, b]) x.start(t);
    return { stop: (s) => { for (const x of [n, l, b]) x.stop(s); } };
  }, vol);
}
export function crackle(vol = 0.3) {
  return loop('crackle', (c, out, t, K) => {
    const n = K.noise(c, 'brown', true); const g = c.createGain(); g.gain.value = 0.6; K.chain(n, K.filt(c, 'lowpass', 500), g, out);
    const w = K.noise(c, 'white', true); const am = c.createGain(); am.gain.value = 0;
    const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 13; const ld = c.createGain(); ld.gain.value = 0.25; l.connect(ld); ld.connect(am.gain);
    const l2 = c.createOscillator(); l2.type = 'square'; l2.frequency.value = 7.3; const l2d = c.createGain(); l2d.gain.value = 0.2; l2.connect(l2d); l2d.connect(am.gain);
    K.chain(w, K.filt(c, 'bandpass', 2600, 1.5), am, out);
    for (const x of [n, w, l, l2]) x.start(t);
    return { stop: (s) => { for (const x of [n, w, l, l2]) x.stop(s); } };
  }, vol);
}

export function thunder(pos, near = false) {
  sounds.custom((c, out, t, K) => {
    if (near) { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.001, 1.6, 0.25); K.chain(n, K.filt(c, 'highpass', 900), g, out); n.start(t); n.stop(t + 0.35); }
    const r = K.noise(c, 'brown'); const rg = c.createGain();
    rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(near ? 2.2 : 1.2, t + (near ? 0.05 : 0.3)); rg.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    const f = K.filt(c, 'lowpass', near ? 900 : 380);
    const am = c.createGain(); am.gain.value = 0.8; const l = c.createOscillator(); l.frequency.value = 7; const ld = c.createGain(); ld.gain.value = 0.4; l.connect(ld); ld.connect(am.gain);
    K.chain(r, f, am, rg, out); r.start(t); l.start(t); r.stop(t + 3.6); l.stop(t + 3.6);
  }, null, near ? 1 : 0.7);
}
export function splash(pos, big = 1) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.01, 0.7 * big, 0.5 * big);
    const f = K.filt(c, 'bandpass', 1400, 0.7); f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    K.chain(n, f, g, out); n.start(t); n.stop(t + 0.8 * big);
  }, pos, 0.8);
}
export function sizzle(vol = 0.2) {
  sounds.custom((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.02, vol, 0.35); K.chain(n, K.filt(c, 'highpass', 4000), g, out); n.start(t); n.stop(t + 0.45); }, null, 1);
}
export function crumble(pos) {
  sounds.custom((c, out, t, K) => {
    for (let i = 0; i < 6; i++) { const n = K.noise(c, 'brown'); const g = c.createGain(); const tt = t + i * 0.06 + Math.random() * 0.05; K.env(g, tt, 0.003, 0.7, 0.15); K.chain(n, K.filt(c, 'lowpass', 700 + Math.random() * 600), g, out); n.start(tt); n.stop(tt + 0.25); }
  }, pos, 0.8);
}
export function whoosh(pos) {
  sounds.custom((c, out, t, K) => { const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, t, 0.15, 0.6, 0.5); const f = K.filt(c, 'bandpass', 400, 2); f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(250, t + 0.7); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.9); }, pos, 0.9);
}
export function ding() {
  sounds.custom((c, out, t, K) => { for (const [f, d] of [[880, 0], [1320, 0.12]]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain(); K.env(g, t + d, 0.005, 0.3, 0.5); K.chain(o, g, out); o.start(t + d); o.stop(t + d + 0.6); } }, null, 1);
}
