// Everything you hear in the elevator, synthesized: the muzak (a little
// bossa nova that never ends), the arrival chime, the doors, the hum of the
// shaft - and the floors: waves and gulls, bubbling lava, a disco, a circus,
// a saloon piano, an arcade, wind, roars, moos, alarms, whispers and screams.
import { sounds } from '../../engine/Sound.js';
export { explosion, glassBreak, scream, clunk } from '../heist/audio.js';
export { splash, crumble, whoosh, thunder } from '../disasters/audio.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// --- loops (ambiences that run while a floor is open) -------------------------------------------------------------------------
const loops = {};
function loop(name, fn, vol) {
  if (loops[name] && !loops[name].dead) { loops[name].setVolume(vol); return loops[name]; }
  loops[name] = sounds.customLoop(fn, vol);
  return loops[name];
}
export function stop(name) { if (loops[name]) { loops[name].stop(); delete loops[name]; } }
export function volume(name, v) { loops[name]?.setVolume(v); }
export function stopAll() { for (const k of Object.keys(loops)) stop(k); stopSong('car'); stopSong('floor'); }

/** A filtered noise bed (sea, wind, gas, rain, underwater...). o: {kind, type, f, q, lfo, depth, am} */
export function bed(name, vol, o = {}) {
  return loop(name, (c, out, t, K) => {
    const n = K.noise(c, o.kind || 'pink', true);
    const f = K.filt(c, o.type || 'lowpass', o.f || 800, o.q || 0.8);
    const nodes = [n];
    if (o.lfo) { const l = c.createOscillator(); l.frequency.value = o.lfo; const ld = c.createGain(); ld.gain.value = o.depth ?? (o.f || 800) * 0.6; l.connect(ld); ld.connect(f.frequency); nodes.push(l); }
    const g = c.createGain(); g.gain.value = 1;
    if (o.am) { g.gain.value = 0.6; const l = c.createOscillator(); l.frequency.value = o.am; const ld = c.createGain(); ld.gain.value = 0.4; l.connect(ld); ld.connect(g.gain); nodes.push(l); }
    K.chain(n, f, g, out);
    for (const x of nodes) x.start(t);
    return { stop: (s) => { for (const x of nodes) x.stop(s); } };
  }, vol);
}
/** A steady tone bed (hums, drones). freqs: list of Hz; o.type, o.lp, o.wobble */
export function hum(name, vol, freqs, o = {}) {
  return loop(name, (c, out, t, K) => {
    const nodes = [];
    const lp = K.filt(c, 'lowpass', o.lp || 600, 0.7); lp.connect(out);
    for (const f of freqs) {
      const osc = c.createOscillator(); osc.type = o.type || 'sawtooth'; osc.frequency.value = f;
      if (o.wobble) { const l = c.createOscillator(); l.frequency.value = o.wobble * rnd(0.8, 1.2); const ld = c.createGain(); ld.gain.value = f * 0.01; l.connect(ld); ld.connect(osc.frequency); nodes.push(l); }
      const g = c.createGain(); g.gain.value = 1 / freqs.length; osc.connect(g); g.connect(lp); nodes.push(osc);
    }
    for (const x of nodes) x.start(t);
    return { stop: (s) => { for (const x of nodes) x.stop(s); } };
  }, vol);
}
export const sea = (v = 0.35) => bed('sea', v, { kind: 'pink', f: 700, lfo: 0.13, depth: 500, am: 0.13 });
export const wind = (v = 0.3) => bed('wind', v, { kind: 'pink', type: 'bandpass', f: 500, q: 0.7, lfo: 0.2, depth: 300, am: 0.3 });
export const hiss = (v = 0.3) => bed('hiss', v, { kind: 'white', type: 'highpass', f: 2600, am: 2.3 });
export const rain = (v = 0.3) => bed('rain', v, { kind: 'white', type: 'bandpass', f: 4000, q: 0.4 });
export const underwater = (v = 0.4) => bed('under', v, { kind: 'brown', f: 260, lfo: 0.2, depth: 120, am: 0.25 });
export const roomTone = (v = 0.15) => bed('room', v, { kind: 'brown', f: 180 });
export const drone = (v = 0.25) => hum('drone', v, [55, 55.6, 82.4, 110.7], { type: 'sawtooth', lp: 320, wobble: 0.15 });
export const machine = (v = 0.3) => hum('machine', v, [48, 96, 144], { type: 'square', lp: 260, wobble: 4 });
export const ufoHum = (v = 0.3) => hum('ufo', v, [180, 271, 362], { type: 'sine', lp: 2000, wobble: 6 });
export const fluorescent = (v = 0.06) => hum('fluor', v, [120, 240, 360], { type: 'square', lp: 1800 });
export function lavaBubbles(vol = 0.35) {
  return loop('lava', (c, out, t, K) => {
    const n = K.noise(c, 'brown', true); const g = c.createGain(); g.gain.value = 0.8; K.chain(n, K.filt(c, 'lowpass', 220), g, out); n.start(t);
    let alive = true;
    const blub = () => { if (!alive) return; const tt = c.currentTime + 0.02; const o = c.createOscillator(); o.type = 'sine'; const f = rnd(70, 160); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 2.6, tt + 0.09); const og = c.createGain(); K.env(og, tt, 0.005, rnd(0.3, 0.7), 0.1); K.chain(o, og, out); o.start(tt); o.stop(tt + 0.15); setTimeout(blub, rnd(80, 420)); };
    blub();
    return { stop: (s) => { alive = false; n.stop(s); } };
  }, vol);
}
export function crackle(vol = 0.3) {
  return loop('crackle', (c, out, t, K) => {
    const n = K.noise(c, 'brown', true); const g = c.createGain(); g.gain.value = 0.6; K.chain(n, K.filt(c, 'lowpass', 500), g, out); n.start(t);
    let alive = true;
    const pop = () => { if (!alive) return; const tt = c.currentTime + 0.01; const w = K.noise(c); const wg = c.createGain(); K.env(wg, tt, 0.001, rnd(0.2, 0.6), 0.03); K.chain(w, K.filt(c, 'bandpass', rnd(1500, 4000), 1.5), wg, out); w.start(tt, Math.random()); w.stop(tt + 0.05); setTimeout(pop, rnd(30, 160)); };
    pop();
    return { stop: (s) => { alive = false; n.stop(s); } };
  }, vol);
}
export function alarmBell(vol = 0.3) {
  return loop('bell', (c, out, t, K) => {
    const am = c.createGain(); am.gain.value = 0.5;
    const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 18; const ld = c.createGain(); ld.gain.value = 0.5; l.connect(ld); ld.connect(am.gain);
    const os = [2100, 2630, 3480].map((f) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(am); return o; });
    K.chain(am, K.filt(c, 'bandpass', 2600, 0.8), out);
    for (const x of [l, ...os]) x.start(t);
    return { stop: (s) => { for (const x of [l, ...os]) x.stop(s); } };
  }, vol);
}
/** Random little events in a loop: fn(c, out, K) every [a, b] ms. */
export function sprinkle(name, vol, a, b, fn) {
  return loop(name, (c, out, t, K) => {
    let alive = true;
    const go = () => { if (!alive) return; try { fn(c, out, K, c.currentTime + 0.02); } catch { /* */ } setTimeout(go, rnd(a, b)); };
    setTimeout(go, rnd(a * 0.3, b * 0.6));
    return { stop: () => { alive = false; } };
  }, vol);
}
export const gulls = (v = 0.25) => sprinkle('gulls', v, 1800, 5200, (c, out, K, t) => {
  for (let i = 0; i < (Math.random() < 0.5 ? 2 : 3); i++) {
    const tt = t + i * 0.22; const o = c.createOscillator(); o.type = 'sawtooth'; const f = rnd(1300, 1700);
    o.frequency.setValueAtTime(f, tt); o.frequency.linearRampToValueAtTime(f * 1.35, tt + 0.06); o.frequency.exponentialRampToValueAtTime(f * 0.7, tt + 0.2);
    const g = c.createGain(); K.env(g, tt, 0.01, 0.25, 0.18); K.chain(o, K.filt(c, 'bandpass', 1800, 3), g, out); o.start(tt); o.stop(tt + 0.25);
  }
});
export const jungle = (v = 0.25) => sprinkle('jungle', v, 400, 1600, (c, out, K, t) => {
  const kind = Math.random();
  if (kind < 0.5) { // chirps
    for (let i = 0; i < 3; i++) { const tt = t + i * 0.08; const o = c.createOscillator(); o.type = 'sine'; const f = rnd(2500, 4200); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 1.4, tt + 0.05); const g = c.createGain(); K.env(g, tt, 0.004, 0.12, 0.05); K.chain(o, g, out); o.start(tt); o.stop(tt + 0.08); }
  } else if (kind < 0.8) { // a bird call: down-up
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.linearRampToValueAtTime(600, t + 0.15); o.frequency.linearRampToValueAtTime(1300, t + 0.3); const g = c.createGain(); K.env(g, t, 0.02, 0.15, 0.3); K.chain(o, g, out); o.start(t); o.stop(t + 0.4);
  } else { // insects
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = rnd(4000, 6000); const am = c.createGain(); am.gain.value = 0; const l = c.createOscillator(); l.frequency.value = 40; const ld = c.createGain(); ld.gain.value = 0.05; l.connect(ld); ld.connect(am.gain); K.chain(o, am, out); o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1);
  }
});
export const bleeps = (v = 0.15) => sprinkle('bleeps', v, 150, 700, (c, out, K, t) => {
  const o = c.createOscillator(); o.type = Math.random() < 0.5 ? 'square' : 'triangle'; o.frequency.setValueAtTime(rnd(300, 1600), t); if (Math.random() < 0.5) o.frequency.exponentialRampToValueAtTime(rnd(200, 2400), t + 0.12);
  const g = c.createGain(); K.env(g, t, 0.003, 0.2, 0.1); K.chain(o, g, out); o.start(t); o.stop(t + 0.15);
});
export const whispers = (v = 0.25) => sprinkle('whisper', v, 1500, 4000, (c, out, K, t) => {
  const n = K.noise(c); const f = K.filt(c, 'bandpass', rnd(1500, 3500), 6); const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); for (let i = 0; i < 6; i++) g.gain.linearRampToValueAtTime(rnd(0.05, 0.3), t + i * 0.12 + 0.06); g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
  K.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 0.85);
});

// --- one-shots -------------------------------------------------------------------------------------------------------------------------
const tone = (freq, dur, o = {}) => sounds.custom((c, out, t, K) => {
  const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = c.createGain(); K.env(g, t + (o.delay || 0), o.a || 0.005, o.vol ?? 0.3, dur);
  K.chain(osc, K.filt(c, 'lowpass', o.lp || 6000), g, out); osc.start(t + (o.delay || 0)); osc.stop(t + (o.delay || 0) + dur + 0.05);
}, o.pos || null, 1);
const burst = (dur, o = {}) => sounds.custom((c, out, t, K) => {
  const n = K.noise(c, o.kind || 'white'); const g = c.createGain(); K.env(g, t + (o.delay || 0), o.a || 0.002, o.vol ?? 0.5, dur);
  const f = K.filt(c, o.type || 'bandpass', o.f || 1500, o.q || 1); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  K.chain(n, f, g, out); n.start(t + (o.delay || 0), Math.random()); n.stop(t + (o.delay || 0) + dur + 0.05);
}, o.pos || null, 1);
export { tone, burst };

/** The arrival chime: a soft two-note bell. */
export function ding(down = false) {
  sounds.custom((c, out, t, K) => {
    for (const [f, d] of (down ? [[1046.5, 0], [784, 0.42]] : [[784, 0], [1046.5, 0.42]])) {
      for (const [m, a] of [[1, 0.32], [2.76, 0.07], [5.4, 0.03]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * m; const g = c.createGain(); K.env(g, t + d, 0.004, a, 1.6); K.chain(o, g, out); o.start(t + d); o.stop(t + d + 1.7);
      }
    }
  }, null, 0.9);
}
/** The doors sliding (open or shut), ending with a soft thump. */
export function doors(open) {
  sounds.custom((c, out, t, K) => {
    const n = K.noise(c, 'pink'); const f = K.filt(c, 'bandpass', open ? 700 : 520, 1.2); const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.25); g.gain.linearRampToValueAtTime(0.25, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    K.chain(n, f, g, out); n.start(t); n.stop(t + 1.6);
    const m = c.createOscillator(); m.type = 'sawtooth'; m.frequency.value = 70; const mg = c.createGain(); K.env(mg, t, 0.2, 0.05, 1.2); K.chain(m, K.filt(c, 'lowpass', 200), mg, out); m.start(t); m.stop(t + 1.5);
    const th = c.createOscillator(); th.frequency.setValueAtTime(open ? 110 : 90, t + 1.4); th.frequency.exponentialRampToValueAtTime(45, t + 1.6); const tg = c.createGain(); K.env(tg, t + 1.4, 0.004, open ? 0.25 : 0.5, 0.25); K.chain(th, tg, out); th.start(t + 1.4); th.stop(t + 1.75);
  }, null, 0.8);
}
/** Doors-closing warning beep. */
export const warnBeep = (last = false) => tone(last ? 1320 : 990, last ? 0.35 : 0.12, { type: 'triangle', vol: 0.22 });
/** The shaft: a hum and a rattle while the car moves (returns a handle; set volume 0..1). */
export function travel() {
  return loop('travel', (c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 52; const og = c.createGain(); og.gain.value = 0.35; K.chain(o, K.filt(c, 'lowpass', 160), og, out);
    const n = K.noise(c, 'brown', true); const ng = c.createGain(); ng.gain.value = 0.5; K.chain(n, K.filt(c, 'lowpass', 300), ng, out);
    const r = K.noise(c, 'white', true); const am = c.createGain(); am.gain.value = 0; const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 7; const ld = c.createGain(); ld.gain.value = 0.03; l.connect(ld); ld.connect(am.gain);
    K.chain(r, K.filt(c, 'bandpass', 2000, 2), am, out);
    for (const x of [o, n, r, l]) x.start(t);
    return { stop: (s) => { for (const x of [o, n, r, l]) x.stop(s); } };
  }, 0);
}
export const buttonBeep = () => tone(1560, 0.08, { type: 'square', vol: 0.12, lp: 3000 });
export function alarmButton() {
  sounds.custom((c, out, t, K) => {
    const am = c.createGain(); am.gain.value = 0.5; const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 20; const ld = c.createGain(); ld.gain.value = 0.5; l.connect(ld); ld.connect(am.gain);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 2400; const g = c.createGain(); K.env(g, t, 0.01, 0.5, 1.4);
    K.chain(o, am, g, out); o.start(t); l.start(t); o.stop(t + 1.5); l.stop(t + 1.5);
  }, null, 0.6);
}
/** A reward: a bright little arpeggio. */
export function bonus() { [0, 4, 7, 12].forEach((n, i) => tone(NOTE(76 + n), 0.25, { type: 'triangle', vol: 0.18, delay: i * 0.07 })); }
export function fanfare() { [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42], [7, 0.62], [12, 0.76]].forEach(([n, d]) => { tone(NOTE(67 + n), 0.3, { type: 'square', vol: 0.09, delay: d, lp: 2500 }); tone(NOTE(55 + n), 0.3, { type: 'triangle', vol: 0.12, delay: d }); }); }
/** A big creature's roar. pitch < 1 is bigger. */
export function roar(pos, pitch = 1, len = 1.6) {
  sounds.custom((c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; const f0 = 95 * pitch;
    o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0 * 1.3, t + 0.25); o.frequency.linearRampToValueAtTime(f0 * 0.7, t + len);
    const am = c.createGain(); am.gain.value = 0.7; const l = c.createOscillator(); l.frequency.value = 28; const ld = c.createGain(); ld.gain.value = 0.35; l.connect(ld); ld.connect(am.gain);
    const n = K.noise(c, 'pink'); const ng = c.createGain(); ng.gain.value = 0.8;
    const g = c.createGain(); K.env(g, t, 0.12, 1.1, len);
    const f = K.filt(c, 'lowpass', 900 * pitch, 1.2);
    o.connect(am); K.chain(n, K.filt(c, 'bandpass', 600 * pitch, 0.9), ng, am); K.chain(am, f, g, out);
    for (const x of [o, l, n]) { x.start(t); x.stop(t + len + 0.2); }
  }, pos, 1);
}
export function moo(pos) {
  sounds.custom((c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; const f = rnd(110, 150);
    o.frequency.setValueAtTime(f * 0.85, t); o.frequency.linearRampToValueAtTime(f, t + 0.3); o.frequency.linearRampToValueAtTime(f * 0.75, t + 1.1);
    const g = c.createGain(); K.env(g, t, 0.15, 0.5, 1.0); const mix = c.createGain();
    for (const [ff, q, a] of [[500, 4, 1], [800, 5, 0.5], [1600, 6, 0.2]]) { const b = K.filt(c, 'bandpass', ff, q); const bg = c.createGain(); bg.gain.value = a * 2; o.connect(b); b.connect(bg); bg.connect(mix); }
    K.chain(mix, g, out); o.start(t); o.stop(t + 1.3);
  }, pos, 0.9);
}
export const zap = (pos) => { tone(1800, 0.35, { type: 'sawtooth', to: 120, vol: 0.25, pos }); burst(0.3, { f: 3000, q: 0.5, vol: 0.4, pos }); };
export const pop = (pos) => tone(600, 0.08, { type: 'sine', to: 1400, vol: 0.4, pos });
export const boing = (pos) => sounds.play('boing', pos, 0.8);
export const cough = (pos) => { burst(0.18, { kind: 'pink', f: 700, q: 2, vol: 0.7, pos }); burst(0.15, { kind: 'pink', f: 600, q: 2, vol: 0.5, delay: 0.24, pos }); };
export const snap = (pos) => { burst(0.05, { f: 3500, q: 0.8, vol: 1, pos }); tone(180, 0.12, { to: 60, vol: 0.6, pos }); };
export const thud = (pos, big = 1) => { tone(90 / big, 0.3, { to: 35, vol: 0.9, pos }); burst(0.12, { kind: 'brown', type: 'lowpass', f: 600, vol: 0.9, pos }); };
export const stomp = (pos) => { tone(55, 0.5, { to: 25, vol: 1.2, pos }); burst(0.3, { kind: 'brown', type: 'lowpass', f: 300, vol: 1, pos }); };
export const shh = (pos) => burst(0.9, { kind: 'white', type: 'bandpass', f: 4200, q: 1.2, a: 0.08, vol: 0.6, pos });
export const crunch = (pos) => { for (let i = 0; i < 4; i++) burst(0.05, { f: rnd(800, 2500), vol: 0.5, delay: i * 0.05, pos }); };
export const gunshot = (pos) => { burst(0.4, { kind: 'white', type: 'lowpass', f: 2600, vol: 1.3, pos }); tone(140, 0.25, { to: 40, vol: 0.9, pos }); };
export const ricochet = (pos) => tone(3200, 0.4, { type: 'sine', to: 900, vol: 0.2, pos });
export const cannon = (pos) => { tone(70, 0.7, { to: 25, vol: 1.3, pos }); burst(0.7, { kind: 'brown', type: 'lowpass', f: 900, vol: 1.2, pos }); };
export const whistle = (pos) => tone(2400, 0.5, { type: 'sine', vol: 0.25, pos, a: 0.02 });
export const crack = (pos) => { burst(0.08, { f: 4000, q: 0.6, vol: 0.9, pos }); for (let i = 0; i < 5; i++) burst(0.04, { f: rnd(2000, 6000), vol: 0.4, delay: 0.05 + i * rnd(0.03, 0.09), pos }); };
export const errorSound = () => { tone(440, 0.18, { type: 'square', vol: 0.15, lp: 2500 }); tone(330, 0.3, { type: 'square', vol: 0.15, delay: 0.2, lp: 2500 }); };
export const powerDown = () => tone(800, 1.6, { type: 'sawtooth', to: 40, vol: 0.25, lp: 1500 });
export const ticket = () => { for (let i = 0; i < 8; i++) burst(0.03, { f: 3000, vol: 0.2, delay: i * 0.035 }); };
export const deskBell = (pos) => { for (const [m, a] of [[1, 0.4], [2.7, 0.12], [5.2, 0.05]]) tone(1680 * m, 1.6, { vol: a, pos }); };
export const pins = (pos) => { for (let i = 0; i < 14; i++) { tone(rnd(600, 1400), 0.12, { type: 'triangle', vol: 0.3, delay: i * rnd(0.02, 0.05), pos }); burst(0.06, { f: rnd(1500, 3500), vol: 0.4, delay: i * 0.03, pos }); } };
export const cheer = () => { for (let i = 0; i < 3; i++) burst(1.4, { kind: 'pink', type: 'bandpass', f: rnd(900, 1600), q: 0.8, a: 0.15, vol: 0.35, delay: i * 0.12 }); };
export const partyHorn = (pos) => { tone(330, 0.6, { type: 'sawtooth', to: 360, vol: 0.18, lp: 1800, pos }); tone(332, 0.6, { type: 'square', vol: 0.06, lp: 1500, pos }); };
export const firework = (pos) => { tone(400, 1.0, { type: 'sine', to: 2400, vol: 0.06, pos }); burst(0.7, { kind: 'pink', type: 'lowpass', f: 1600, vol: 0.9, delay: 1.0, pos }); for (let i = 0; i < 10; i++) burst(0.04, { f: rnd(3000, 7000), vol: 0.2, delay: 1.2 + i * 0.07, pos }); };
export const sparkle = (pos) => { for (let i = 0; i < 6; i++) tone(rnd(2000, 4500), 0.3, { vol: 0.06, delay: i * 0.05, pos }); };
export const yell = (pos, pitch = 1) => {
  sounds.custom((c, out, t, K) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; const f = 220 * pitch; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.3, t + 0.15); o.frequency.linearRampToValueAtTime(f * 0.9, t + 0.6);
    const g = c.createGain(); K.env(g, t, 0.03, 0.5, 0.55); const mix = c.createGain();
    for (const [ff, q, a] of [[730, 6, 1], [1090, 6, 0.6], [2440, 8, 0.25]]) { const b = K.filt(c, 'bandpass', ff * pitch, q); const bg = c.createGain(); bg.gain.value = a * 2; o.connect(b); b.connect(bg); bg.connect(mix); }
    K.chain(mix, g, out); o.start(t); o.stop(t + 0.7);
  }, pos, 0.7);
};
export const stinger = () => { for (const f of [233, 247, 466]) tone(f, 1.2, { type: 'sawtooth', vol: 0.12, lp: 1400, a: 0.01 }); burst(0.8, { kind: 'white', type: 'highpass', f: 3000, vol: 0.4 }); };
export const flicker = (pos) => { burst(0.05, { f: 5000, vol: 0.3, pos }); tone(120, 0.08, { type: 'square', vol: 0.2, lp: 800, pos }); };
export const bang = (pos) => { thud(pos, 1); burst(0.2, { kind: 'pink', f: 400, vol: 1, pos }); };
export const splat = (pos) => sounds.play('splat', pos, 0.9);
export const kerplunk = (pos) => sounds.play('kerplunk', pos, 0.9);

// --- music: a little step sequencer, two channels (the car's muzak and the floor's own music) --------------------------------------
const songs = {};
let nbuf = null;
function noiseBuf(c) { if (nbuf) return nbuf; nbuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
const I = {
  // electric piano: two sines, a bell-ish attack
  ep(c, out, t, n, d, v = 0.08) { for (const [m, a, dd] of [[1, 1, d], [2, 0.35, d * 0.4], [3.01, 0.12, 0.2]]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = NOTE(n) * m; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dd); o.connect(g); g.connect(out); o.start(t); o.stop(t + dd + 0.05); } },
  bass(c, out, t, n, d, v = 0.2) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(n); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); },
  pluck(c, out, t, n, d, v = 0.06, type = 'sawtooth') { const o = c.createOscillator(); o.type = type; o.frequency.value = NOTE(n); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(400, t + d); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); },
  organ(c, out, t, n, d, v = 0.05) { const vib = c.createOscillator(); vib.frequency.value = 6.5; const vd = c.createGain(); vd.gain.value = NOTE(n) * 0.012; vib.connect(vd); for (const [m, type, a] of [[1, 'square', 1], [2, 'sine', 0.6], [0.5, 'sine', 0.4]]) { const o = c.createOscillator(); o.type = type; o.frequency.value = NOTE(n) * m; vd.connect(o.frequency); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * a, t + 0.02); g.gain.setValueAtTime(v * a, t + d * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + d); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } vib.start(t); vib.stop(t + d + 0.05); },
  piano(c, out, t, n, d, v = 0.07) { for (const det of [0, 7]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(n); o.detune.value = det; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  chip(c, out, t, n, d, v = 0.04) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = NOTE(n); const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + d * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02); },
  bell(c, out, t, n, d, v = 0.06) { for (const [m, a] of [[1, 1], [3, 0.25], [4.2, 0.1]]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = NOTE(n) * m; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  pad(c, out, t, n, d, v = 0.03) { for (const det of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); } },
  kick(c, out, t, v = 0.5) { const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); },
  snare(c, out, t, v = 0.2) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + 0.2); },
  hat(c, out, t, v = 0.05, len = 0.04) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + len + 0.01); },
  shaker(c, out, t, v = 0.025) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6000; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + 0.08); },
};
const chord = (fn, c, out, t, notes, d, v) => notes.forEach((n) => fn(c, out, t, n, d, v));

/**
 * The songs. Each is {bpm, steps (16ths in the loop), play(c, out, t, step, len)} - play is called for every
 * sixteenth note with its start time.
 */
const SONGS = {
  // the muzak: a slow bossa nova round ii-V-I-VI in C, an electric piano and a walking bass, a shaker
  muzak: {
    bpm: 100, steps: 128,
    play(c, out, t, s, L) {
      const bar = Math.floor(s / 16) % 8, b = s % 16;
      const prog = [[50, [62, 65, 69, 72]], [55, [65, 69, 71, 76]], [48, [64, 67, 71, 74]], [57, [61, 67, 70, 76]], [50, [62, 65, 69, 72]], [55, [65, 69, 71, 74]], [52, [64, 67, 71, 74]], [57, [61, 64, 67, 70]]][bar];
      // bossa comping rhythm
      if ([0, 3, 6, 10, 12].includes(b)) chord(I.ep, c, out, t, prog[1], L * (b === 12 ? 3.5 : 2.5), 0.035);
      // bass: root and fifth, with the bossa push
      if (b === 0) I.bass(c, out, t, prog[0], L * 5, 0.16);
      if (b === 6) I.bass(c, out, t, prog[0] + 7, L * 2, 0.12);
      if (b === 8) I.bass(c, out, t, prog[0] + 7, L * 5, 0.14);
      if (b === 14) I.bass(c, out, t, prog[0], L * 2, 0.11);
      I.shaker(c, out, t, b % 2 ? 0.012 : 0.022);
      if (b === 4 || b === 12) I.hat(c, out, t, 0.02, 0.06);
      // a lazy melody on top, now and then
      const mel = [[0, 76, 6], [7, 74, 3], [10, 72, 6], [32, 77, 6], [38, 76, 4], [42, 74, 6], [64, 79, 8], [72, 77, 4], [76, 76, 6], [96, 74, 5], [101, 72, 3], [104, 73, 8]];
      for (const [at, n, len] of mel) if (s === at) I.ep(c, out, t, n, L * len, 0.05);
    },
  },
  // the disco floor: four on the floor, offbeat hats, an octave bass and string stabs
  disco: {
    bpm: 122, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      const roots = [45, 45, 50, 52][bar];
      if (b % 4 === 0) I.kick(c, out, t, 0.45);
      if (b % 4 === 2) I.hat(c, out, t, 0.06, 0.07);
      if (b === 4 || b === 12) I.snare(c, out, t, 0.14);
      if (b % 2 === 0) I.bass(c, out, t, roots + (b % 4 === 2 ? 12 : 0), L * 1.6, 0.17);
      if (b === 2 || b === 7 || b === 10) chord(I.pluck, c, out, t, [roots + 24, roots + 28, roots + 31], L * 2, 0.025);
    },
  },
  // the circus: an oom-pah waltz on a calliope
  circus: {
    bpm: 168, steps: 96, // 3/4, eighth-note steps (6 per bar)
    play(c, out, t, s, L) {
      const b = s % 6, bar = Math.floor(s / 6) % 16;
      const roots = [48, 48, 55, 55, 48, 48, 55, 48, 53, 53, 48, 48, 55, 55, 48, 48][bar];
      if (b === 0) I.organ(c, out, t, roots - 12, L * 1.6, 0.06);
      if (b === 2 || b === 4) chord(I.organ, c, out, t, [roots + 4, roots + 7], L * 1.2, 0.025);
      const mel = [72, 76, 79, 84, 83, 79, 77, 74, 71, 74, 77, 83, 81, 77, 76, 72];
      if (b === 0 || (b === 3 && bar % 2)) I.organ(c, out, t, mel[bar] + (b === 3 ? -3 : 0), L * 2.6, 0.045);
    },
  },
  // the saloon: a stride piano rag
  saloon: {
    bpm: 112, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      const r = [43, 48, 43, 50][bar];
      if (b % 8 === 0) I.piano(c, out, t, r - 12, L * 3, 0.1);
      if (b % 8 === 4) chord(I.piano, c, out, t, [r + 4, r + 7, r + 12], L * 2, 0.04);
      const mel = [79, 0, 76, 79, 81, 0, 79, 76, 74, 0, 76, 74, 72, 74, 76, 0];
      const n = mel[(s + bar * 3) % 16];
      if (n && b % 2 === 0) I.piano(c, out, t, n, L * 1.8, 0.05);
    },
  },
  // the arcade: a chiptune loop
  arcade: {
    bpm: 140, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      const r = [57, 53, 55, 52][bar];
      if (b % 2 === 0) I.chip(c, out, t, r - 24 + (b % 4 ? 12 : 0), L * 0.9, 0.035);
      const arp = [0, 4, 7, 12, 7, 4];
      I.chip(c, out, t, r + arp[s % 6] + 12, L * 0.8, 0.012);
      const mel = [69, 0, 72, 0, 74, 76, 0, 74, 72, 0, 69, 0, 67, 69, 0, 0];
      if (mel[b] && bar % 2 === 0) I.chip(c, out, t, mel[b] + 12, L * 1.8, 0.02);
      if (b % 4 === 0) I.hat(c, out, t, 0.03, 0.03);
    },
  },
  // the penthouse party
  party: {
    bpm: 126, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      const r = [48, 45, 41, 43][bar];
      if (b % 4 === 0) I.kick(c, out, t, 0.5);
      if (b % 4 === 2) I.hat(c, out, t, 0.07, 0.08);
      I.hat(c, out, t, 0.015);
      if (b === 4 || b === 12) I.snare(c, out, t, 0.16);
      if (b % 4 === 2 || b === 15) I.bass(c, out, t, r, L * 1.5, 0.2);
      if ([0, 3, 6, 10].includes(b)) chord(I.pluck, c, out, t, [r + 24, r + 28, r + 31, r + 35], L * 1.5, 0.018);
    },
  },
  // a music box (candy land, the nursery)
  musicbox: {
    bpm: 96, steps: 64,
    play(c, out, t, s, L) {
      const mel = [76, 0, 79, 0, 84, 0, 83, 79, 81, 0, 77, 0, 79, 0, 0, 0, 72, 0, 76, 0, 79, 0, 77, 74, 76, 0, 72, 0, 74, 0, 0, 0];
      const n = mel[s % 32];
      if (n && s % 2 === 0) I.bell(c, out, t, n + 12, L * 6, 0.05);
      if (s % 8 === 0) I.bell(c, out, t, [60, 65, 67, 60][Math.floor(s / 8) % 4] + 12, L * 8, 0.03);
    },
  },
  // inside the computer: a driving arpeggio and four on the floor
  cyber: {
    bpm: 132, steps: 64,
    play(c, out, t, s, L) {
      const b = s % 16, bar = Math.floor(s / 16) % 4;
      const r = [45, 41, 43, 40][bar];
      if (b % 4 === 0) I.kick(c, out, t, 0.4);
      if (b % 4 === 2) I.hat(c, out, t, 0.05, 0.05);
      if (b === 4 || b === 12) I.snare(c, out, t, 0.1);
      I.pluck(c, out, t, r + 24 + [0, 7, 12, 15, 12, 7, 3, 7][s % 8], L * 0.9, 0.02, 'square');
      if (b % 2 === 0) I.bass(c, out, t, r, L * 1.4, 0.16);
      if (b === 0) I.pad(c, out, t, r + 12, L * 16, 0.02);
    },
  },
  // the pizza party: happy birthday on a toy piano, again and again
  birthday: {
    bpm: 150, steps: 96, // 3/4
    play(c, out, t, s, L) {
      const mel = [[0, 67, 1.5], [3, 67, 0.5], [4, 69, 2], [8, 67, 2], [12, 72, 2], [16, 71, 4], [24, 67, 1.5], [27, 67, 0.5], [28, 69, 2], [32, 67, 2], [36, 74, 2], [40, 72, 4], [48, 67, 1.5], [51, 67, 0.5], [52, 79, 2], [56, 76, 2], [60, 72, 2], [64, 71, 2], [68, 69, 4], [72, 77, 1.5], [75, 77, 0.5], [76, 76, 2], [80, 72, 2], [84, 74, 2], [88, 72, 4]];
      for (const [at, n, len] of mel) if (s === at) I.bell(c, out, t, n + 12, L * len * 2, 0.045);
      const chords = [48, 48, 55, 55, 55, 48, 48, 53, 48, 55, 48, 48];
      const bar = Math.floor(s / 8) % 12, b = s % 8;
      if (b === 0) I.bass(c, out, t, chords[bar] - 12, L * 3, 0.14);
      if (b === 4 || b === 6) chord(I.chip, c, out, t, [chords[bar] + 4, chords[bar] + 7], L * 0.8, 0.012);
    },
  },
  // dread: a slow pulse and a pad (the hallway, the tomb)
  dread: {
    bpm: 60, steps: 32,
    play(c, out, t, s, L) {
      if (s % 4 === 0) I.kick(c, out, t, 0.22);
      if (s % 16 === 0) chord(I.pad, c, out, t, [38, 41, 45 + (s % 32 ? 1 : 0)], L * 16, 0.03);
      if (s % 16 === 10) I.bell(c, out, t, 86, L * 4, 0.015);
    },
  },
};

/** Start a song on a channel ('car' or 'floor'); returns its handle (vol(), stop()). */
export function playSong(channel, id, vol = 0.5) {
  if (songs[channel]?.id === id && !songs[channel].dead) { songs[channel].h.setVolume(vol); return songs[channel]; }
  stopSong(channel);
  const song = SONGS[id];
  if (!song) return null;
  const h = sounds.customLoop((c, out) => ({ c, out }), vol);
  if (h.dead) return null;
  const S = { id, h, c: h.ctx, out: h.out, step: 0, next: h.ctx.currentTime + 0.12, dead: false };
  const L = 60 / song.bpm / (id === 'circus' || id === 'birthday' ? 2 : 4);
  S.timer = setInterval(() => {
    const c = S.c;
    while (S.next < c.currentTime + 0.3) {
      try { song.play(c, S.out, S.next, S.step % song.steps, L); } catch { /* a note failed */ }
      S.step++; S.next += L;
    }
  }, 60);
  S.vol = (v) => h.setVolume(v);
  songs[channel] = S;
  return S;
}
export function songVolume(channel, v) { songs[channel]?.h.setVolume(v); }
export function stopSong(channel) { const S = songs[channel]; if (!S) return; clearInterval(S.timer); S.h.stop(); S.dead = true; delete songs[channel]; }
export function songPlaying(channel) { return songs[channel]?.id || null; }
