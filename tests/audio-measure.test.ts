import { it } from 'vitest';
import { SFX_NAMES, renderSfx } from '../src/audio/sfx';
import { LOOPS, LOOP_NAMES, renderLoopLayer } from '../src/audio/loops';
import { VOICE_PHRASES, renderPhrase } from '../src/audio/voice';

const SR = 32000;
function bands(b: Float32Array, sr: number) {
  // average power spectrum over 2048-sample Hann frames
  const N = 2048;
  const edges = [0, 200, 800, 2500, 6000, 1e9];
  const e = new Float64Array(edges.length - 1);
  let cent = 0, tot = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= Math.max(N, b.length); s += N / 2) {
    for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); re[i] = (b[s + i] ?? 0) * w; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N, p = re[k] * re[k] + im[k] * im[k];
      tot += p; cent += p * f;
      for (let j = 0; j < e.length; j++) if (f >= edges[j] && f < edges[j + 1]) e[j] += p;
    }
  }
  return { frac: Array.from(e, (x) => x / (tot || 1)), cent: cent / (tot || 1) };
}
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
const fmt = (n: string, b: Float32Array) => { const { frac, cent } = bands(b, SR); return `${n.padEnd(16)} cent ${cent.toFixed(0).padStart(5)}  <200 ${(frac[0]*100).toFixed(0).padStart(3)}%  -800 ${(frac[1]*100).toFixed(0).padStart(3)}%  -2.5k ${(frac[2]*100).toFixed(0).padStart(3)}%  -6k ${(frac[3]*100).toFixed(0).padStart(3)}%  >6k ${(frac[4]*100).toFixed(0).padStart(3)}%`; };
it('spectra', () => {
  console.log(SFX_NAMES.map((n) => fmt(n, renderSfx(n, SR, 1))).join('\n'));
  const L: string[] = [];
  for (const n of LOOP_NAMES) for (let l = 0; l < LOOPS[n].layers.length; l++) L.push(fmt(`${n}/${l}`, renderLoopLayer(n, l, SR)));
  console.log(L.join('\n'));
  console.log(VOICE_PHRASES.map((n) => fmt(n, renderPhrase(n, SR, 1))).join('\n'));
}, 120000);
