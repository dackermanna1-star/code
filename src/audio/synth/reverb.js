// Procedural impulse responses.
//  - flutter: image-source model of two parallel brick walls (5.6 m apart) seen from an ear-height
//    listener with the source at the feet: alternating L/R arrivals with a 2W/c (~33 ms) pattern,
//    decaying, progressively low-passed and smeared (scattering from brick/mortar, ledges, pipes).
//  - diffuse: outdoor tail, RT60 ~1.5 s at low/mid with fast HF damping, plus sparse late reflections.
//  - city: long dark tail with discrete building echoes for distant events (sirens, train, cars).
import { filt, TAU } from '../lib/dsp.js';
import { deriveRng, noiseGen } from '../lib/rng.js';

const C = 343;
const NOY = async () => {};


function onePole(x, fc, sr) {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = x[i] + a * (y - x[i]); x[i] = y; }
  return x;
}

function energy(chs) {
  let e = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) e += c[i] * c[i];
  return e / chs.length;
}
function normEnergy(chs, target = 1) {
  const e = energy(chs);
  const g = Math.sqrt(target / Math.max(1e-12, e));
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
  return g;
}

/**
 * Image-source flutter IR. Returns { L, R, arrivals } (arrivals for analysis/debug).
 */
export function flutterIR(seed, sr, o = {}) {
  const r = deriveRng(seed, 'ir-flutter');
  const W = o.width ?? 5.6;
  const xl = o.listenerX ?? -1.2; // listener off-centre -> L, R, L+R arrivals repeating every 2W/c
  const xs = o.sourceX ?? xl + 0.08; // footsteps under the listener
  const h = o.height ?? 1.55; // feet -> ears
  const R = o.reflect ?? 0.96; // wet brick, broadband
  const scatter = o.scatter ?? 0.05; // fraction of amplitude scattered per bounce
  const maxOrder = o.maxOrder ?? 54;
  const len = Math.round((o.length ?? 0.95) * sr);
  const L = new Float32Array(len);
  const Rr = new Float32Array(len);
  const d0 = Math.hypot(xs - xl, h);
  const itdMax = 0.00066;
  const arrivals = [];
  const nz = noiseGen(r.seed32());
  const clusterLen = Math.round(0.012 * sr);
  const tmp = new Float32Array(clusterLen);
  const shadow = new Float32Array(clusterLen);

  for (let n = -maxOrder; n <= maxOrder; n++) {
    if (n === 0) continue;
    const order = Math.abs(n);
    // image of a source at xs between walls at +-W/2: x_n = n*W + (-1)^n * xs
    const ximg = n * W + (order % 2 === 0 ? xs : -xs);
    const rel = ximg - xl;
    const dn = Math.hypot(rel, h);
    const jitter = r.range(-0.00012, 0.00012) * Math.min(1, order / 3);
    const t = (dn - d0) / C + jitter;
    const i0 = Math.round(t * sr);
    if (i0 >= len - clusterLen) continue;
    // spreading slightly softer than 1/r: facade features keep energy in the corridor
    const amp = Math.pow(d0 / dn, 0.7) * Math.pow(R, order) * (order === 1 ? 0.7 : 1);
    const spec = Math.pow(1 - scatter, order);
    // build the arrival cluster: specular tap + scattered taps spread wider with order
    tmp.fill(0);
    const centre = Math.round(0.002 * sr);
    tmp[centre] += amp * spec;
    const spread = (0.00025 + 0.00045 * order) * sr;
    const nTaps = Math.min(40, 3 + 2 * order);
    const scatAmp = (amp * Math.sqrt(Math.max(0, 1 - spec * spec))) / Math.sqrt(nTaps);
    for (let k = 0; k < nTaps; k++) {
      const off = Math.round(centre + r.gauss() * spread * 0.5);
      if (off >= 0 && off < clusterLen) tmp[off] += scatAmp * nz() * 1.4;
    }
    // progressive low-pass: brick scattering + air
    const fc = 16000 / (1 + 0.22 * order);
    onePole(tmp, fc, sr);
    onePole(tmp, fc * 1.6, sr);
    // ears: near ear direct, far ear delayed + head-shadowed
    const lat = Math.abs(rel) / dn; // sin of lateral angle
    const itd = Math.round(itdMax * lat * sr);
    shadow.set(tmp);
    onePole(shadow, 1700, sr);
    const nearIsRight = rel > 0;
    const near = nearIsRight ? Rr : L;
    const far = nearIsRight ? L : Rr;
    const farG = 1 - 0.55 * lat;
    for (let k = 0; k < clusterLen; k++) {
      const a = i0 - centre + k;
      if (a >= 0 && a < len) near[a] += tmp[k];
      const b = a + itd;
      if (b >= 0 && b < len) far[b] += (tmp[k] * 0.3 + shadow[k] * 0.7) * farG + tmp[k] * (1 - farG) * 0.15;
    }
    arrivals.push({ n, order, t, amp, side: nearIsRight ? 'R' : 'L' });
  }
  // gentle fade at the end
  const nf = Math.round(0.08 * sr);
  for (let i = 0; i < nf; i++) { const g = i / nf; L[len - 1 - i] *= g; Rr[len - 1 - i] *= g; }
  const physicalEnergy = energy([L, Rr]);
  normEnergy([L, Rr], 1);
  arrivals.sort((a, b) => a.t - b.t);
  return { L, R: Rr, arrivals, physicalEnergy };
}

/** Banded exponential-decay noise tail. rt: [[freq, rt60], ...] */
async function bandedTail(r, sr, len, rt, onset, build, damp, y = NOY) {
  const chs = [new Float32Array(len), new Float32Array(len)];
  const band = new Float32Array(len);
  for (let c = 0; c < 2; c++) {
    const out = chs[c];
    for (let b = 0; b < rt.length; b++) {
      const [fc, t60] = rt[b];
      const nz = noiseGen(r.seed32());
      const k = Math.exp(-6.907755 / (t60 * sr));
      const blen = Math.min(len, Math.ceil(t60 * 1.45 * sr));
      let env = 1;
      for (let i = 0; i < blen; i++) { band[i] = nz() * env; env *= k; }
      filt(band, 'bandpass', fc, 0.9, sr, 0, 0, blen);
      if (fc >= 8000) filt(band, 'bandpass', fc, 0.9, sr, 0, 0, blen);
      const nf = Math.min(blen, Math.round(0.02 * sr));
      for (let i = 0; i < nf; i++) band[blen - 1 - i] *= i / nf;
      for (let i = 0; i < blen; i++) out[i] += band[i];
      await y();
    }
    // onset: silence until `onset`, raised-cosine build-up
    const i0 = Math.round(onset * sr);
    const i1 = Math.round((onset + build) * sr);
    for (let i = 0; i < len; i++) {
      let g = 0;
      if (i >= i1) g = 1;
      else if (i > i0) g = 0.5 - 0.5 * Math.cos((Math.PI * (i - i0)) / (i1 - i0));
      out[i] *= g;
    }
    // progressive HF damping: two one-pole low-passes whose cutoff falls with time
    if (damp) {
      let y1 = 0, y2 = 0;
      for (let b = 0; b < len; b += 64) {
        const t = b / sr;
        const fc = damp.f1 + (damp.f0 - damp.f1) * Math.exp(-t / damp.tau);
        const a = Math.exp((-TAU * fc) / sr);
        const m = Math.min(64, len - b);
        for (let i = b; i < b + m; i++) {
          y1 = out[i] + a * (y1 - out[i]);
          y2 = y1 + a * (y2 - y1);
          out[i] = y2;
        }
      }
    }
  }
  await y();
  return chs;
}

function addEchoTap(ch, sr, r, t, amp, lpHz, spreadMs) {
  const n = Math.round(0.02 * sr);
  const tmp = new Float32Array(n);
  const nz = noiseGen(r.seed32());
  const c = Math.round(0.004 * sr);
  tmp[c] = amp;
  const taps = 12;
  for (let k = 0; k < taps; k++) {
    const off = Math.round(c + r.gauss() * spreadMs * 0.001 * sr);
    if (off >= 0 && off < n) tmp[off] += (amp / Math.sqrt(taps)) * nz();
  }
  onePole(tmp, lpHz, sr);
  onePole(tmp, lpHz * 1.5, sr);
  const i0 = Math.round(t * sr) - c;
  for (let k = 0; k < n; k++) { const a = i0 + k; if (a >= 0 && a < ch.length) ch[a] += tmp[k]; }
}

export async function diffuseIR(seed, sr, o = {}, y = NOY) {
  const r = deriveRng(seed, 'ir-diffuse');
  const len = Math.round((o.length ?? 2.3) * sr);
  const rt = o.rt ?? [[90, 1.45], [180, 1.5], [360, 1.45], [720, 1.35], [1400, 1.15], [2800, 0.8], [5600, 0.5], [11000, 0.3]];
  const [L, R] = await bandedTail(r, sr, len, rt, o.onset ?? 0.012, o.build ?? 0.12, { f0: 18000, f1: 1300, tau: 0.22 }, y);
  normEnergy([L, R], 1);
  // sparse late reflections: facade features, fire escapes, far buildings
  const nTaps = 14;
  for (let k = 0; k < nTaps; k++) {
    const t = 0.035 + r.next() * r.next() * 0.42;
    const decay = Math.exp((-6.9 * t) / 1.3);
    const amp = r.range(0.012, 0.03) * decay * Math.sqrt(sr / 48000);
    const ch = r.chance(0.5) ? L : R;
    addEchoTap(ch, sr, r, t, amp * 6, 5000 / (1 + t * 6), 0.6 + t * 4);
  }
  await y();
  const nf = Math.round(0.1 * sr);
  for (let i = 0; i < nf; i++) { const g = i / nf; L[len - 1 - i] *= g; R[len - 1 - i] *= g; }
  normEnergy([L, R], 1);
  return { L, R };
}

export async function cityIR(seed, sr, o = {}, y = NOY) {
  const r = deriveRng(seed, 'ir-city');
  const len = Math.round((o.length ?? 3.4) * sr);
  const rt = [[90, 2.6], [180, 2.7], [360, 2.5], [720, 2.2], [1400, 1.7], [2800, 1.1], [5600, 0.6], [11000, 0.3]];
  const [L, R] = await bandedTail(r, sr, len, rt, 0.015, 0.18, { f0: 7000, f1: 700, tau: 0.35 }, y);
  normEnergy([L, R], 1);
  // discrete echoes bouncing between buildings
  const echoes = 11;
  for (let k = 0; k < echoes; k++) {
    const t = 0.07 + k * r.range(0.05, 0.11) + r.range(0, 0.04);
    const decay = Math.exp((-6.9 * t) / 2.4);
    const amp = r.range(0.06, 0.14) * decay * Math.sqrt(sr / 48000);
    addEchoTap(r.chance(0.5) ? L : R, sr, r, t, amp * 4, 3500 / (1 + t * 2), 1 + t * 5);
    addEchoTap(r.chance(0.5) ? L : R, sr, r, t + r.range(0.002, 0.012), amp * 2, 3000 / (1 + t * 2), 1 + t * 5);
  }
  await y();
  const nf = Math.round(0.2 * sr);
  for (let i = 0; i < nf; i++) { const g = i / nf; L[len - 1 - i] *= g; R[len - 1 - i] *= g; }
  normEnergy([L, R], 1);
  return { L, R };
}

export { normEnergy, energy };
