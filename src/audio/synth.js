// Procedurally synthesized supplementary sounds (casings, reload
// mechanics, impacts, sub-bass layers). They are mixed under the original
// DOOM sounds and kept short and lo-fi (22 kHz, slight bit crush) so they
// sit with the 11 kHz originals instead of replacing them.

const RATE = 22050;

function buf(seconds) { return new Float32Array(Math.max(1, Math.floor(seconds * RATE))); }

let seed = 1;
function rnd() {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return (seed >>> 8) / 8388608 - 1;
}

function env(t, attack, decay) {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

// One-pole filters on a buffer in place.
function lowpass(a, cutoff) {
  const k = 1 - Math.exp(-2 * Math.PI * cutoff / RATE);
  let y = 0;
  for (let i = 0; i < a.length; i++) { y += (a[i] - y) * k; a[i] = y; }
  return a;
}

function highpass(a, cutoff) {
  const k = Math.exp(-2 * Math.PI * cutoff / RATE);
  let px = 0, py = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    py = k * (py + x - px);
    px = x;
    a[i] = py;
  }
  return a;
}

function bandpass(a, lo, hi) { return lowpass(highpass(a, lo), hi); }

function mix(dst, src, gain = 1, offset = 0) {
  const o = Math.floor(offset * RATE);
  for (let i = 0; i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * gain;
  return dst;
}

function normalize(a, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] / m * 1.4) / Math.tanh(1.4) * peak;
  // 8-bit style quantisation for the period feel.
  for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i] * 96) / 96;
  return a;
}

function noise(seconds, attack, decay) {
  const a = buf(seconds);
  for (let i = 0; i < a.length; i++) a[i] = rnd() * env(i / RATE, attack, decay);
  return a;
}

function partials(seconds, freqs, decays, gains) {
  const a = buf(seconds);
  for (let i = 0; i < a.length; i++) {
    const t = i / RATE;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) s += Math.sin(2 * Math.PI * freqs[k] * t) * Math.exp(-t / decays[k]) * gains[k];
    a[i] = s;
  }
  return a;
}

function thump(seconds, f0, f1, decay) {
  const a = buf(seconds);
  let ph = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / RATE;
    const f = f1 + (f0 - f1) * Math.exp(-t / (decay * 0.5));
    ph += 2 * Math.PI * f / RATE;
    a[i] = Math.sin(ph) * env(t, 0.002, decay);
  }
  return a;
}

function click(freq = 3000, len = 0.012) {
  return bandpass(noise(len + 0.01, 0.0005, len / 3), freq * 0.5, freq * 1.5);
}

const BUILDERS = {
  x_casing: () => normalize(mix(partials(0.25, [3150, 4720, 6110, 2380], [0.05, 0.035, 0.025, 0.07], [1, 0.7, 0.5, 0.4]), click(5000, 0.004), 0.6), 0.55),
  x_casing2: () => normalize(mix(partials(0.2, [2890, 5050, 3700], [0.04, 0.03, 0.05], [1, 0.6, 0.5]), click(4500, 0.004), 0.6), 0.5),
  x_shellcase: () => normalize(mix(partials(0.16, [1250, 1980, 2700], [0.03, 0.022, 0.015], [1, 0.6, 0.3]), lowpass(noise(0.05, 0.001, 0.01), 2500), 0.8), 0.5),
  x_magout: () => normalize(mix(mix(click(2200, 0.015), bandpass(noise(0.12, 0.01, 0.04), 900, 3500), 0.5, 0.01), thump(0.06, 300, 160, 0.02), 0.4), 0.7),
  x_magin: () => normalize(mix(mix(thump(0.08, 220, 120, 0.025), click(2600, 0.012), 0.9, 0.035), click(4200, 0.008), 0.6, 0.06), 0.8),
  x_slide: () => normalize(mix(mix(bandpass(noise(0.1, 0.005, 0.03), 1200, 5000), click(3500, 0.01), 1, 0.07), click(2500, 0.012), 0.8, 0.12), 0.8),
  x_bolt: () => normalize(mix(mix(thump(0.08, 260, 140, 0.03), bandpass(noise(0.12, 0.004, 0.035), 700, 3000), 0.7), click(2200, 0.014), 1, 0.09), 0.85),
  x_shellin: () => normalize(mix(mix(click(1800, 0.01), thump(0.05, 320, 200, 0.012), 0.6), bandpass(noise(0.06, 0.002, 0.015), 1500, 6000), 0.3, 0.02), 0.6),
  x_reload_start: () => normalize(lowpass(highpass(noise(0.16, 0.03, 0.05), 300), 2200), 0.35),
  x_adsin: () => normalize(lowpass(highpass(noise(0.12, 0.02, 0.03), 400), 2800), 0.3),
  x_dry: () => normalize(mix(click(3000, 0.006), click(1800, 0.01), 0.7, 0.02), 0.6),
  x_whoosh: () => {
    const a = buf(0.2);
    let lp = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / RATE;
      const cut = 300 + 2200 * Math.sin(Math.min(1, t / 0.2) * Math.PI);
      const k = 1 - Math.exp(-2 * Math.PI * cut / RATE);
      lp += (rnd() - lp) * k;
      a[i] = lp * Math.sin(Math.min(1, t / 0.2) * Math.PI);
    }
    return normalize(a, 0.5);
  },
  x_jump: () => normalize(mix(thump(0.08, 140, 80, 0.03), lowpass(noise(0.06, 0.002, 0.015), 1500), 0.4), 0.45),
  x_land: () => normalize(mix(thump(0.12, 120, 55, 0.05), lowpass(noise(0.08, 0.001, 0.02), 1200), 0.5), 0.6),
  x_slide_start: () => normalize(bandpass(noise(0.35, 0.02, 0.12), 400, 3000), 0.4),
  x_flesh: () => normalize(mix(lowpass(noise(0.1, 0.001, 0.03), 1800), thump(0.08, 160, 70, 0.03), 0.8), 0.7),
  x_flesh2: () => normalize(mix(lowpass(noise(0.12, 0.001, 0.04), 1400), thump(0.1, 130, 60, 0.035), 0.9), 0.7),
  x_splat: () => {
    const a = lowpass(noise(0.3, 0.002, 0.08), 1600);
    mix(a, thump(0.15, 110, 45, 0.06), 1.2);
    for (let k = 0; k < 6; k++) mix(a, lowpass(noise(0.04, 0.001, 0.01), 2200), 0.6, 0.03 + k * 0.035 + Math.abs(rnd()) * 0.02);
    return normalize(a, 0.8);
  },
  x_bone: () => {
    const a = buf(0.25);
    for (let k = 0; k < 9; k++) mix(a, click(1500 + Math.abs(rnd()) * 2500, 0.006), 0.8, Math.abs(rnd()) * 0.15);
    mix(a, thump(0.1, 180, 90, 0.03), 0.6);
    return normalize(a, 0.75);
  },
  x_gibpart: () => normalize(mix(lowpass(noise(0.09, 0.001, 0.025), 1300), thump(0.06, 140, 80, 0.02), 0.5), 0.5),
  x_ricochet: () => {
    const a = buf(0.3);
    let ph = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / RATE;
      const f = 2600 - 1500 * Math.min(1, t / 0.25) + 60 * Math.sin(t * 90);
      ph += 2 * Math.PI * f / RATE;
      a[i] = Math.sin(ph) * env(t, 0.004, 0.07) * 0.6;
    }
    mix(a, click(4000, 0.006), 0.8);
    return normalize(a, 0.4);
  },
  x_impact_stone: () => normalize(mix(lowpass(noise(0.1, 0.001, 0.025), 1600), click(2500, 0.006), 0.6), 0.45),
  x_impact_metal: () => normalize(mix(partials(0.3, [820, 1340, 2110, 2950], [0.08, 0.06, 0.05, 0.03], [1, 0.8, 0.6, 0.4]), click(3800, 0.005), 0.8), 0.45),
  x_sub: () => {
    const a = thump(0.9, 70, 30, 0.35);
    for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * 2.2);
    mix(a, lowpass(noise(0.5, 0.002, 0.15), 400), 0.5);
    return normalize(a, 0.95);
  },
  x_sub_small: () => {
    const a = thump(0.3, 95, 45, 0.09);
    for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * 1.8);
    return normalize(a, 0.8);
  },
  x_debris: () => {
    const a = buf(1.2);
    for (let k = 0; k < 40; k++) {
      const at = Math.pow(Math.abs(rnd()), 1.6) * 1.0;
      mix(a, click(800 + Math.abs(rnd()) * 3000, 0.008), 0.9 * Math.exp(-at * 2.5), at);
    }
    return normalize(a, 0.45);
  },
  x_body_fall: () => normalize(mix(thump(0.2, 110, 50, 0.06), lowpass(noise(0.15, 0.002, 0.04), 1000), 0.7), 0.75),
  x_hit: () => normalize(click(3000, 0.006), 0.25),
  x_sizzle: () => normalize(highpass(noise(0.25, 0.002, 0.07), 2500), 0.35),
};

export const SYNTH_NAMES = Object.keys(BUILDERS);

export function buildSynth(name) {
  const f = BUILDERS[name];
  if (!f) return null;
  seed = name.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { rate: RATE, data: f() };
}
