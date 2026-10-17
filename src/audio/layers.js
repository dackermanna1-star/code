// Continuous sound layers built from live nodes inside a Voice: filtered noise beds, rain,
// wind, mains hum, fluorescent buzz, fire, an idling engine. Slow random modulation comes from
// looping smooth-random curves (engine.curve) so nothing repeats on an audible period.
// Used by ambience beds (ambience.js) and positional loops (loops.js).
import { dbToGain, alloc, normalize } from './dsp.js';
import { rainDrops } from './synth.js';

/** Slow random modulation of an AudioParam: param += depth * curve(t), period in seconds. */
export function modulate(V, eng, param, { period = 20, points = 12, depth = 0.5, seed = 0 } = {}) {
  const c = V.src(eng.curve(points, seed), 2 / period, true);
  const g = V.gain(depth);
  c.connect(g); g.connect(param);
  c._offset = eng.R.r() * 2;
  V.play(c, 0, null);
  return g;
}

/** Filtered noise bed. filters: [[type, f, q, gainDb]]. mod: { period, depth (0..1 of level) }. */
export function noiseLayer(V, eng, { color = 'pink', filters = [], level = -30, dest, mod = null, rate = 1 }) {
  const n = V.noise(color, rate);
  let node = n;
  for (const [type, f, q, g] of filters) { const b = V.filter(type, f, q ?? 0.707, g ?? 0); node.connect(b); node = b; }
  const out = V.gain(dbToGain(level));
  node.connect(out); out.connect(dest || V.out);
  if (mod) modulate(V, eng, out.gain, { ...mod, depth: (mod.depth ?? 0.5) * dbToGain(level) });
  V.play(n, 0, null);
  return { out, last: node };
}

// ---- textures (cached JS-rendered buffers, mono, looped at offsets) --------------------------
const TEX = {
  window: { sec: 6.1, rate: 260, f: [2000, 6000], t60: [0.004, 0.015] },
  roof: { sec: 5.3, rate: 700, f: [400, 2000], t60: [0.01, 0.04] },
  asphalt: { sec: 5.7, rate: 1200, f: [1500, 7000], t60: [0.002, 0.008] },
  car_roof: { sec: 6.7, rate: 480, f: [250, 1200], t60: [0.02, 0.06] },
  metal: { sec: 4.9, rate: 300, f: [1200, 4200], t60: [0.02, 0.06] },
};
function texEntry(kind) {
  const P = TEX[kind];
  return {
    var: 1, peak: -3, edges: false, dc: false,
    gen(S) {
      const o = S.alloc(P.sec);
      rainDrops(o, S.sr, 0, P.sec, { rate: P.rate, f: P.f, t60: P.t60, R: S.R });
      // make the loop seam seamless: wrap the tail into the head
      const xf = Math.round(S.sr * 0.05);
      for (let i = 0; i < xf; i++) { const a = i / xf; o[i] = o[i] * a + o[o.length - xf + i] * (1 - a); }
      return o.subarray(0, o.length - xf);
    },
  };
}
const TEX_ENTRIES = Object.fromEntries(Object.keys(TEX).map((k) => [k, texEntry(k)]));

function texture(V, eng, kind, { level, dest, pan = 0, rate = 1 }) {
  const buf = eng.buffer(`tex_${kind}`, TEX_ENTRIES[kind]);
  const s = V.src(buf, rate, true);
  s._offset = eng.R.r() * buf.duration;
  const g = V.gain(dbToGain(level));
  let node = s;
  if (pan && V.ctx.createStereoPanner) { const p = V.pan(pan); node.connect(p); node = p; }
  node.connect(g); g.connect(dest || V.out);
  V.play(s, 0, null);
  return g;
}

/** Rain heard on a surface: 'window' | 'roof' | 'asphalt' | 'metal' (car roof from outside) | 'car_roof' (from inside). */
export function rainLayer(V, eng, { kind = 'window', level = -30, dest, intensity = 1 }) {
  const d = dest || V.out;
  const bus = V.gain(1); bus.connect(d);
  const mod = { period: 31, depth: 0.35, seed: 7 };
  if (kind === 'window') {
    noiseLayer(V, eng, { color: 'pink', filters: [['bandpass', 2600, 0.5]], level: level - 4, dest: bus, mod });
    noiseLayer(V, eng, { color: 'brown', filters: [['lowpass', 700, 0.7]], level: level - 6, dest: bus });
    texture(V, eng, 'window', { level: level - 2, dest: bus, pan: -0.5 });
    texture(V, eng, 'window', { level: level - 4, dest: bus, pan: 0.5, rate: 0.93 });
  } else if (kind === 'roof') {
    noiseLayer(V, eng, { color: 'pink', filters: [['lowpass', 1600, 0.7]], level, dest: bus, mod });
    noiseLayer(V, eng, { color: 'brown', filters: [['lowpass', 220, 0.8]], level: level - 2, dest: bus, mod: { period: 23, depth: 0.3, seed: 2 } });
    texture(V, eng, 'roof', { level: level + 1, dest: bus, pan: -0.4 });
    texture(V, eng, 'roof', { level: level, dest: bus, pan: 0.4, rate: 0.96 });
  } else if (kind === 'asphalt') {
    noiseLayer(V, eng, { color: 'white', filters: [['highpass', 400, 0.7], ['lowpass', 9000, 0.7]], level: level - 3, dest: bus, mod });
    noiseLayer(V, eng, { color: 'pink', filters: [['lowpass', 900, 0.7]], level: level - 4, dest: bus });
    texture(V, eng, 'asphalt', { level: level - 1, dest: bus, pan: -0.6 });
    texture(V, eng, 'asphalt', { level: level - 1, dest: bus, pan: 0.6, rate: 0.95 });
  } else if (kind === 'metal') {
    texture(V, eng, 'metal', { level, dest: bus, pan: 0.3 });
    texture(V, eng, 'metal', { level: level - 3, dest: bus, pan: -0.2, rate: 0.94 });
  } else if (kind === 'car_roof') {
    const lp = V.filter('lowpass', 1500, 0.7); lp.connect(bus);
    noiseLayer(V, eng, { color: 'brown', filters: [['lowpass', 400, 0.8]], level: level - 1, dest: lp, mod });
    texture(V, eng, 'car_roof', { level: level + 2, dest: lp, pan: -0.3 });
    texture(V, eng, 'car_roof', { level: level + 1, dest: lp, pan: 0.3, rate: 0.95 });
  }
  bus.gain.value = intensity;
  return bus;
}

/** Wind outside: a moving band of noise with gusts, plus a faint whistle in a gap. */
export function windLayer(V, eng, { level = -34, dest, whistle = -10, center = 380, seed = 1 }) {
  const { out, last } = noiseLayer(V, eng, { color: 'pink', filters: [['bandpass', center, 0.8]], level, dest, mod: { period: 17, depth: 0.7, seed } });
  modulate(V, eng, last.frequency, { period: 23, depth: center * 0.45, seed: seed + 1 });
  if (whistle != null) {
    const w = noiseLayer(V, eng, { color: 'white', filters: [['bandpass', 1100, 25]], level: level + whistle, dest, mod: { period: 13, depth: 0.95, seed: seed + 2 } });
    modulate(V, eng, w.last.frequency, { period: 31, depth: 260, seed: seed + 3 });
  }
  return out;
}

/** Mains hum (60 Hz + harmonics). */
export function humLayer(V, { f = 60, level = -40, h = [1, 0.5, 0.3, 0.2], dest }) {
  const g = V.gain(dbToGain(level)); g.connect(dest || V.out);
  h.forEach((a, i) => { const o = V.osc('sine', f * (i + 1)); const og = V.gain(a); o.connect(og); og.connect(g); V.play(o, 0, null); });
  return g;
}

/** Cached PeriodicWave for the 120 Hz fluorescent ballast buzz. */
function ballastWave(eng) {
  if (!eng._ballastWave) {
    const n = 40, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (1 / Math.pow(k, 0.8)) * (k >= 8 && k <= 22 ? 1.6 : 1) * (k % 2 ? 1 : 0.7);
    eng._ballastWave = eng.ctx.createPeriodicWave(re, im);
  }
  return eng._ballastWave;
}

/** A bank of fluorescent tubes: rich 120 Hz buzz, ballast grit, faint flicker. */
export function ballastLayer(V, eng, { level = -32, dest }) {
  const g = V.gain(dbToGain(level)); g.connect(dest || V.out);
  const o = V.osc(ballastWave(eng), 120);
  const lp = V.filter('lowpass', 3800, 0.6), bp = V.filter('peaking', 2400, 1, 4);
  V.chain(o, bp, lp, g);
  V.play(o, 0, null);
  noiseLayer(V, eng, { color: 'white', filters: [['bandpass', 2400, 2]], level: -12, dest: g, mod: { period: 0.7, points: 10, depth: 0.6, seed: 9 } });
  humLayer(V, { f: 60, level: -8, h: [0.4, 1, 0.3, 0.25], dest: g });
  modulate(V, eng, g.gain, { period: 2.3, points: 24, depth: dbToGain(level) * 0.12, seed: 4 });
  return g;
}

/** Fire roar (boiler, mine fire): low turbulent noise with flicker. */
export function fireLayer(V, eng, { level = -30, lp = 320, dest }) {
  const a = noiseLayer(V, eng, { color: 'brown', filters: [['lowpass', lp, 0.9]], level, dest, mod: { period: 1.6, points: 22, depth: 0.45, seed: 12 } });
  noiseLayer(V, eng, { color: 'pink', filters: [['bandpass', 900, 0.8]], level: level - 12, dest, mod: { period: 1.1, points: 18, depth: 0.7, seed: 13 } });
  return a.out;
}

/** An idling 4-cylinder ('86 Taurus): firing pulses ~26 Hz, harmonics, exhaust rumble. */
export function engineLayer(V, eng, { level = -30, dest }) {
  const g = V.gain(dbToGain(level)); g.connect(dest || V.out);
  const lp = V.filter('lowpass', 170, 1.6); lp.connect(g);
  const o1 = V.osc('sawtooth', 26), o2 = V.osc('sine', 52), o3 = V.osc('square', 13);
  const g1 = V.gain(0.8), g2 = V.gain(0.5), g3 = V.gain(0.12);
  V.chain(o1, g1, lp); V.chain(o2, g2, lp); V.chain(o3, g3, lp);
  for (const [o, d] of [[o1, 0.7], [o2, 1.4], [o3, 0.35]]) { modulate(V, eng, o.frequency, { period: 3.1, points: 14, depth: d, seed: 21 }); V.play(o, 0, null); }
  noiseLayer(V, eng, { color: 'brown', filters: [['lowpass', 110, 0.8]], level: -6, dest: g, mod: { period: 0.9, points: 12, depth: 0.3, seed: 22 } });
  return g;
}

/** Plain room tone (brown/pink noise low-passed). */
export function toneLayer(V, eng, { level = -40, lp = 200, hp = 0, color = 'brown', dest, mod = { period: 41, depth: 0.25, seed: 30 } }) {
  const filters = [['lowpass', lp, 0.7]];
  if (hp) filters.unshift(['highpass', hp, 0.7]);
  return noiseLayer(V, eng, { color, filters, level, dest, mod }).out;
}

export { alloc, normalize };
