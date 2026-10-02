// Level 58 (The Empty Stadium): night wind, floodlight hum, a PA that switches itself on.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, ns } from '../dsp.js';

// open air above a bowl: a low wind and a faint electrical thrum from the masts
defineBed('tone_lv58_night', { L: 12, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const gust = loopLfo(r, L, [1, 2, 3]);
  const a = white(n, r); filter(a, [['lp', 260], ['lp', 260]], sr, true);
  for (let i = 0; i < n; i++) a[i] *= 0.5 + 0.5 * (0.6 + 0.4 * gust(i / sr));
  mixRms(out, a, 0.3);
  const b = white(n, r); filter(b, [['bp', 700, 1.2], ['lp', 1400]], sr, true);
  for (let i = 0; i < n; i++) b[i] *= Math.pow(0.5 + 0.5 * gust(i / sr), 2);
  mixRms(out, b, 0.04);
  oscAdd(out, wavetable([[1, 1], [2, 0.5], [3, 0.2]]), cyc(100, L), 0.012, sr);
} });

// a floodlight mast: ballast hum, a touch of tick
defineLoop('lv58_flood', { L: 2, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 0.3], [2, 1], [3, 0.18], [4, 0.5], [6, 0.25], [8, 0.1]]);
  oscAdd(out, tab, cyc(100, L), 0.5, sr);
  oscAdd(out, tab, cyc(100.5, L), 0.2, sr, 0.3);
  const z = white(n, r); filter(z, [['bp', 3000, 3]], sr, true);
  const f = cyc(100, L);
  for (let i = 0; i < n; i++) z[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 8);
  mixRms(out, z, rmsOf(out) * 0.1);
} });

// the PA amplifier idling: a hum with a little hiss
defineLoop('lv58_pa_idle', { L: 3, sr: 11025, norm: ['rms', 0.15], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [3, 0.3], [5, 0.1]]), cyc(50, L), 0.5, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(150, L), 0.1, sr);
  const h = white(n, r); filter(h, [['hp', 2500], ['lp', 4800]], sr, true);
  mixRms(out, h, rmsOf(out) * 0.25);
} });

// the public address system wakes with nobody at the microphone: relay, hum swell, hiss, crackle, relay
defineShot('lv58_pa', { n: 2, dur: 4.2, sr: 11025, peak: 0.8, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  S.click(0.05, 0.6, 700, 0.004).thump(0.06, 0.4, 150, 70, 0.08);
  const hum = new Float32Array(n);
  oscAdd(hum, wavetable([[1, 1], [2, 0.4], [3, 0.5], [5, 0.15]]), 50 + k * 10, 0.6, sr);
  const hiss = white(n, r); filter(hiss, [['hp', 1500], ['lp', 3500]], sr);
  for (let i = 0; i < n; i++) hum[i] += hiss[i] * 0.12;
  mulInto(hum, envelope(n, sr, [[0, 0], [0.12, 0], [0.5, 0.9], [3.2, 0.9], [3.7, 0.3], [4.2, 0]]));
  for (let i = 0; i < n; i++) out[i] += hum[i];
  for (let t = 0.8; t < 3.3; t += r.range(0.2, 0.7)) S.grit(t, 0.35, r.range(0.05, 0.2), 400, 0.04, [['hp', 1200]]);
  S.click(3.6, 0.5, 600, 0.005).thump(3.62, 0.3, 120, 60, 0.07);
  filter(out, [['lp', 4200]], sr);
} });

// three soft chimes (a station jingle for an empty house): ding, dong, ding
defineShot('lv58_chime', { n: 1, dur: 4.4, peak: 0.7, gen(S) {
  const notes = [[0.0, 659.3], [0.7, 523.3], [1.4, 392.0]];
  for (const [t, f] of notes) {
    S.ring(t, [[f, 1.1, 0.5], [f * 2.76, 0.5, 0.18], [f * 5.4, 0.2, 0.08], [f * 0.5, 1.6, 0.12]], 0.9);
    S.click(t, 0.12, 2500, 0.002);
  }
  S.filter([['lp', 5200]]);
} });

// banks of lamps switching off together: contactor clunks, a long hum falling away
defineShot('lv58_flood_off', { n: 1, dur: 3.2, sr: 11025, peak: 0.85, gen(S) {
  const { out, r, sr } = S, n = out.length;
  S.thump(0.0, 0.8, 90, 40, 0.18).click(0.0, 0.5, 900, 0.004).thump(0.22, 0.5, 80, 38, 0.2).click(0.22, 0.35, 900, 0.004);
  S.noise(0.02, 0.35, 0.002, 0.25, [['bp', 400, 1], ['lp', 1200]]);
  const hum = new Float32Array(n);
  oscAdd(hum, wavetable([[2, 1], [4, 0.5], [6, 0.2]]), 60, 0.5, sr);
  mulInto(hum, envelope(n, sr, [[0, 1], [0.4, 0.8], [2.8, 0]]));
  for (let i = 0; i < n; i++) out[i] += hum[i];
  for (let t = 0.8; t < 2.6; t += r.range(0.3, 0.8)) S.ring(t, [[r.range(900, 2500), 0.03, 0.1]], 0.4);
  filter(out, [['lp', 3000]], sr);
} });

// ... and coming back on: relay chatter, then a hum climbing to full
defineShot('lv58_flood_on', { n: 1, dur: 3.6, sr: 11025, peak: 0.85, gen(S) {
  const { out, r, sr } = S, n = out.length;
  for (const t of [0.0, 0.18, 0.5]) S.thump(t, 0.7, 95, 42, 0.16).click(t, 0.5, 900, 0.004);
  const hum = new Float32Array(n);
  let ph = 0;
  const tab = wavetable([[2, 1], [4, 0.5], [6, 0.25], [8, 0.1]]);
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = 30 + 70 * Math.min(1, Math.max(0, (t - 0.3) / 2.2));
    ph += f / sr; if (ph >= 1) ph -= 1;
    const x = ph * 2048, j = x | 0;
    hum[i] = (tab[j] + (tab[j + 1] - tab[j]) * (x - j)) * 0.4;
  }
  mulInto(hum, envelope(n, sr, [[0, 0], [0.3, 0.2], [2.6, 1], [3.6, 0.7]]));
  for (let i = 0; i < n; i++) out[i] += hum[i];
  for (let t = 0.6; t < 2.4; t += r.range(0.15, 0.4)) S.click(t, 0.25, 2000, 0.003);
  filter(out, [['lp', 3200]], sr);
} });
void ns;
