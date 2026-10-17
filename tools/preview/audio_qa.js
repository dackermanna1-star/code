// Audio QA (page side). Renders sounds offline through HW.audio.renderOffline, measures them
// and draws waveform + spectrogram strips into contact sheets. Driven by tools/audio-qa.mjs
// (headless) via window.__qa; also usable by hand at tools/preview/audio.html?qa.
import { audio } from '../../src/audio/audio.js';
import { SFX } from '../../src/audio/sfx.js';

const SR = Number(new URLSearchParams(location.search).get('sr')) || 44100;

// Render lengths (s) for sounds longer than the default.
const SFX_SECONDS = {
  school_bell: 6.5, bell_short: 4.5, thunder: 8.5, collapse_rumble: 6.5, lightning: 4, stinger_hard: 5.5, stinger_soft: 4.5,
  mixer_start: 5.5, footstep_heavy_above: 5.5, applause_old: 5, colonel_breath: 5.5, colonel_breath_fast: 4.2, colonel_sink: 4.8,
  crowd_murmur: 5.5, record_crackle: 4, vhs_noise: 3, dumbwaiter: 4.2, glass_tone: 4.8, door_creak_slow: 4.2, fluor_on: 3.8,
  wind_gust: 4.6, intercom_chime: 3.6, amb_thunder_far: 6.6,
};

/** The full QA list: [{ group, kind, id, seconds, opts }]. */
export function qaList() {
  const L = [];
  for (const id of audio.ids.sfx) L.push({ group: 'sfx', kind: 'sfx', id, seconds: SFX_SECONDS[id] || 3 });
  for (const s of audio.ids.surfaces) for (const run of [false, true]) L.push({ group: 'footsteps', kind: 'footstep', id: s, label: `${s} ${run ? 'run' : 'walk'}`, seconds: 2.2, opts: { run } });
  for (const c of ['tess', 'danny', 'leah', 'marcus', 'denise', 'voice']) L.push({ group: 'voices', kind: 'blip', id: c, label: `blip ${c}`, seconds: 1.6 });
  L.push({ group: 'voices', kind: 'murmur', id: 'colonel', label: 'murmur(3) colonel', seconds: 3.8 });
  L.push({ group: 'voices', kind: 'sfx', id: 'step_colonel', label: 'step colonel', seconds: 1.2 });
  for (const id of audio.ids.events) L.push({ group: 'events', kind: 'sfx', id, seconds: SFX_SECONDS[id] || 2.5 });
  for (const id of audio.ids.ambience) L.push({ group: 'ambience', kind: id === 'period_buzz' ? 'layer' : 'ambience', id, seconds: 20 });
  for (const id of audio.ids.music) L.push({ group: 'music', kind: 'music', id, seconds: 40 });
  for (const id of audio.ids.loops) L.push({ group: 'loops', kind: 'loop', id, label: `loop ${id}`, seconds: 6 });
  return L;
}

// ---- analysis ----------------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const N_FFT = 2048;
const HANN = Float64Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N_FFT));
/** Power spectrum of the frame starting at `start`. */
function frameSpec(x, start) {
  const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) { const k = start + i; re[i] = (k >= 0 && k < x.length ? x[k] : 0) * HANN[i]; }
  fft(re, im);
  const p = new Float64Array(N_FFT / 2);
  for (let i = 0; i < N_FFT / 2; i++) p[i] = (re[i] * re[i] + im[i] * im[i]) / (N_FFT * N_FFT / 4);
  return p;
}
const db = (g) => 20 * Math.log10(Math.max(1e-10, g));

export function analyze(a, item) {
  const sr = a.sampleRate, [L, R] = a.channels, n = L.length;
  let peak = 0, sum = 0, mean = 0, nan = 0;
  for (const c of [L, R]) for (let i = 0; i < n; i++) {
    const v = c[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const av = Math.abs(v); if (av > peak) peak = av;
    sum += v * v; mean += v;
  }
  const rms = Math.sqrt(sum / (2 * n)), dc = mean / (2 * n);
  // effective length: until the signal stays 60 dB under its peak
  const th = peak * 1e-3;
  let last = 0;
  for (let i = n - 1; i >= 0; i--) if (Math.abs(a[i]) > th) { last = i; break; }
  const dur = (last + 1) / sr;
  // loudness window: beds/music skip the fade-in
  const w0 = item.kind === 'ambience' || item.kind === 'layer' || item.kind === 'music' ? Math.round(2 * sr) : 0;
  let ws = 0; for (let i = w0; i < n; i++) ws += a[i] * a[i];
  const winRms = Math.sqrt(ws / Math.max(1, n - w0));
  // active RMS: mean power of the 50 ms frames above -50 dBFS (one-shots)
  const fl = Math.round(0.05 * sr); let aps = 0, apn = 0;
  for (let i = 0; i + fl <= n; i += fl) { let s = 0; for (let k = 0; k < fl; k++) s += a[i + k] * a[i + k]; s /= fl; if (s > 1e-5) { aps += s; apn++; } }
  // spectral centroid (energy-weighted over frames)
  let cn = 0, cd = 0;
  const hop = Math.max(N_FFT, Math.floor(Math.max(1, last) / 48));
  for (let s0 = 0; s0 < Math.max(1, last); s0 += hop) {
    const p = frameSpec(a, s0);
    for (let k = 1; k < p.length; k++) { const f = k * sr / N_FFT; cn += f * p[k]; cd += p[k]; }
  }
  const centroid = cd > 0 ? cn / cd : 0;
  const status = nan > 0 ? 'FAIL nan' : peak > 0.99 ? 'FAIL clip' : peak < 1e-4 ? 'FAIL silent' : 'ok';
  return { group: item.group, kind: item.kind, id: item.id, label: item.label || item.id, seconds: item.seconds, sr,
    dur: +dur.toFixed(3), peakDb: +db(peak).toFixed(1), rmsDb: +db(item.kind === 'ambience' || item.kind === 'layer' || item.kind === 'music' ? winRms : rms).toFixed(1),
    activeRmsDb: +(apn ? 10 * Math.log10(aps / apn) : -120).toFixed(1), dc: +dc.toExponential(1), nan, centroid: Math.round(centroid), status };
}

// ---- drawing -----------------------------------------------------------------------------------
const W = 1500, ROW = 100, LABEL = 300, PER_SHEET = 16, HEAD = 34;
const rows = []; // { stats, mono, sr }

function colormap(v) { // v 0..1 → dark violet → red → amber → white
  const stops = [[0, [8, 8, 14]], [0.35, [60, 20, 80]], [0.6, [190, 50, 40]], [0.82, [240, 170, 50]], [1, [255, 250, 220]]];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (v - a) / (b - a);
      return ca.map((c, k) => Math.round(c + (cb[k] - c) * t));
    }
  }
  return stops[stops.length - 1][1];
}

function drawRow(g, y, r) {
  const { stats: s, mono: a, sr } = r;
  const ok = s.status === 'ok';
  g.fillStyle = '#101018'; g.fillRect(0, y, W, ROW - 2);
  g.fillStyle = ok ? '#e6d188' : '#ff6a5a'; g.font = '600 14px monospace';
  g.fillText(s.label, 8, y + 17);
  g.fillStyle = '#9a93a6'; g.font = '11px monospace';
  g.fillText(`${s.kind}  ${s.status}`, 8, y + 33);
  g.fillText(`len ${s.dur.toFixed(2)}s   peak ${s.peakDb} dB`, 8, y + 49);
  g.fillText(`rms ${s.rmsDb} dB   act ${s.activeRmsDb} dB`, 8, y + 65);
  g.fillText(`centroid ${s.centroid} Hz   dc ${s.dc}`, 8, y + 81);
  // display window
  const isBed = s.kind === 'ambience' || s.kind === 'layer' || s.kind === 'music';
  const show = isBed ? a.length / sr : Math.min(a.length / sr, Math.max(0.25, s.dur * 1.12));
  const ns = Math.max(1, Math.round(show * sr)), x0 = LABEL, ww = W - LABEL - 8;
  // waveform (min/max per column)
  const wy = y + 4, wh = 30, mid = wy + wh / 2;
  g.fillStyle = '#18181f'; g.fillRect(x0, wy, ww, wh);
  g.strokeStyle = '#2b2b38'; g.beginPath(); for (const lv of [0.5, 1]) { g.moveTo(x0, mid - lv * wh / 2); g.lineTo(x0 + ww, mid - lv * wh / 2); g.moveTo(x0, mid + lv * wh / 2); g.lineTo(x0 + ww, mid + lv * wh / 2); } g.stroke();
  g.fillStyle = ok ? '#d9a441' : '#ff6a5a';
  for (let x = 0; x < ww; x++) {
    const i0 = Math.floor(x * ns / ww), i1 = Math.max(i0 + 1, Math.floor((x + 1) * ns / ww));
    let mn = 1, mx = -1; for (let i = i0; i < i1 && i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
    if (mx < mn) continue;
    g.fillRect(x0 + x, mid - mx * wh / 2, 1, Math.max(1, (mx - mn) * wh / 2));
  }
  // spectrogram (log frequency 40 Hz .. 16 kHz, -100..-10 dB)
  const sy = wy + wh + 3, sh = ROW - wh - 12;
  const img = g.createImageData(ww, sh);
  const cols = Math.min(ww, 300), colW = ww / cols;
  const fLo = 40, fHi = Math.min(16000, sr / 2);
  const bins = new Int32Array(sh);
  for (let py = 0; py < sh; py++) { const f = fLo * Math.pow(fHi / fLo, 1 - py / (sh - 1)); bins[py] = Math.min(N_FFT / 2 - 1, Math.max(1, Math.round(f * N_FFT / sr))); }
  for (let c = 0; c < cols; c++) {
    const start = Math.floor(c * ns / cols) - N_FFT / 2;
    const p = frameSpec(a, start);
    for (let py = 0; py < sh; py++) {
      const k = bins[py], k2 = py > 0 ? bins[py - 1] : k;
      let m = 0; for (let j = Math.min(k, k2); j <= Math.max(k, k2); j++) if (p[j] > m) m = p[j];
      const v = Math.max(0, Math.min(1, (10 * Math.log10(m + 1e-14) + 100) / 90));
      const [cr, cg, cb] = colormap(v);
      for (let xx = Math.floor(c * colW); xx < Math.floor((c + 1) * colW); xx++) { const o = (py * ww + xx) * 4; img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb; img.data[o + 3] = 255; }
    }
  }
  g.putImageData(img, x0, sy);
  // axes: frequency marks and time ticks
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '9px monospace';
  for (const f of [100, 1000, 10000]) { if (f > fHi) continue; const py = (1 - Math.log(f / fLo) / Math.log(fHi / fLo)) * (sh - 1); g.fillRect(x0, sy + py, 4, 1); g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x0 + 6, sy + py + 3); }
  const step = show > 20 ? 5 : show > 6 ? 1 : show > 2 ? 0.5 : show > 0.6 ? 0.1 : 0.05;
  g.fillStyle = '#6d6880';
  for (let t = step; t < show; t += step) { const x = x0 + t / show * ww; g.fillRect(x, wy + wh, 1, 3); }
  g.fillText(`${show.toFixed(2)}s`, x0 + ww - 34, wy + 10);
}

window.__qa = {
  list: () => qaList(),
  /** Render + analyse a chunk of list items; keeps mono data for the sheets. */
  async run(items) {
    const out = [];
    for (const item of items) {
      let stats;
      try {
        const a = await audio.renderOffline(item.kind, item.id, item.seconds, { ...(item.opts || {}), sampleRate: SR, dynamics: false });
        stats = analyze(a, item);
        rows.push({ stats, mono: a, sr: a.sampleRate });
      } catch (e) {
        stats = { group: item.group, kind: item.kind, id: item.id, label: item.label || item.id, status: `FAIL error: ${e.message}` };
        console.error(e);
      }
      out.push(stats);
    }
    return out;
  },
  sheets() {
    // sheets never mix groups
    const sheets = [];
    let cur = null;
    for (const r of rows) {
      if (!cur || cur.group !== r.stats.group || cur.rows.length >= PER_SHEET) { cur = { group: r.stats.group, rows: [] }; sheets.push(cur); }
      cur.rows.push(r);
    }
    return sheets;
  },
  drawSheet(i) {
    const sheets = this.sheets(), sh = sheets[i];
    const c = document.getElementById('sheet');
    c.width = W; c.height = HEAD + sh.rows.length * ROW;
    const g = c.getContext('2d');
    g.fillStyle = '#07070b'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#c4bdb0'; g.font = '600 16px monospace';
    g.fillText(`HALLOWELL audio QA — ${sh.group}  (sheet ${i + 1}/${sheets.length}, ${SR} Hz, raw: no master dynamics)`, 8, 22);
    sh.rows.forEach((r, k) => drawRow(g, HEAD + k * ROW, r));
    return { group: sh.group, rows: sh.rows.length, height: c.height };
  },
  sheetCount() { return this.sheets().length; },
  entry: (id) => !!SFX[id],
};
window.__qaReady = true;
