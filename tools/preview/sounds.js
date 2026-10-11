// Sound bank preview + diagnostics.
//   sounds.html                 buttons per sound, click to play, detail waveform/spectrogram
//   sounds.html?diag=1          build, print JSON stats to the console, draw a thumbnail grid
//   options: &only=ak47,m4a1  &variants=1 (one cell per variant)  &cols=7  &sr=22050  &workers=0

import { SOUND_NAMES, SOUND_GROUPS, SOUND_META, SoundEngine } from '../../src/assets/sounds.js';

const qs = new URLSearchParams(location.search);
const DIAG = qs.has('diag');
const SR = +(qs.get('sr') || 44100);
const ONLY = qs.get('only') ? qs.get('only').split(',') : null;
const SHOW_VARIANTS = qs.has('variants');
const COLS = +(qs.get('cols') || 7);
if (DIAG) document.body.classList.add('diag');

const $ = (id) => document.getElementById(id);
const status = (s) => ($('status').textContent = s);

// ------------------------------------------------------------------ FFT ---

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const hannCache = new Map();
function hann(n) {
  if (!hannCache.has(n)) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return hannCache.get(n);
}

/** Power spectrum of the window centred on sample c. */
function frame(x, c, N) {
  const re = new Float64Array(N), im = new Float64Array(N);
  const w = hann(N);
  const s = Math.round(c - N / 2);
  for (let i = 0; i < N; i++) {
    const j = s + i;
    re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0;
  }
  fft(re, im);
  const p = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}

function mono(buf) {
  const n = buf.length, nch = buf.numberOfChannels;
  if (nch === 1) return buf.getChannelData(0);
  const x = new Float32Array(n);
  for (let c = 0; c < nch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] += d[i] / nch;
  }
  return x;
}

// ---------------------------------------------------------------- stats ---

function stats(buf) {
  const sr = buf.sampleRate, n = buf.length;
  let peak = 0, sum = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
    }
  }
  const rms = Math.sqrt(sum / (n * buf.numberOfChannels));
  const x = mono(buf);
  // 10 ms RMS envelope -> decay times
  const win = Math.round(0.01 * sr);
  const env = [];
  for (let i = 0; i < n; i += win) {
    let s = 0, m = 0;
    for (let j = i; j < Math.min(n, i + win); j++) {
      s += x[j] * x[j];
      m++;
    }
    env.push(Math.sqrt(s / m));
  }
  const emax = Math.max(...env, 1e-9);
  const tAbove = (db) => {
    const thr = emax * Math.pow(10, db / 20);
    let last = 0;
    env.forEach((e, i) => { if (e >= thr) last = i; });
    return +(((last + 1) * win) / sr).toFixed(3);
  };
  const tPeak = +((env.indexOf(emax) * win) / sr).toFixed(3);
  // long-term power spectrum
  const N = 1024, hop = 512;
  const acc = new Float64Array(N / 2);
  for (let c = 0; c < n; c += hop) {
    const p = frame(x, c, N);
    for (let k = 0; k < N / 2; k++) acc[k] += p[k];
  }
  let num = 0, den = 0;
  const bands = [0, 0, 0, 0, 0];
  const edges = [150, 600, 2000, 5000];
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    num += f * acc[k];
    den += acc[k];
    let b = 0;
    while (b < edges.length && f >= edges[b]) b++;
    bands[b] += acc[k];
  }
  const centroid = den ? Math.round(num / den) : 0;
  // edge check: loud first/last samples = clicks (or, for loops, the wrap-around jump)
  const e2 = Math.round(0.002 * sr);
  let endAmp = 0;
  for (let i = Math.max(0, n - e2); i < n; i++) endAmp = Math.max(endAmp, Math.abs(x[i]));
  let meanStep = 0;
  for (let i = 1; i < n; i++) meanStep += Math.abs(x[i] - x[i - 1]);
  meanStep /= Math.max(1, n - 1);
  const loopJump = +(Math.abs(x[n - 1] - x[0]) / (meanStep || 1)).toFixed(2);
  return {
    dur: +(n / sr).toFixed(3),
    ch: buf.numberOfChannels,
    peak: +peak.toFixed(3),
    rmsDb: +(20 * Math.log10(rms + 1e-12)).toFixed(1),
    crestDb: +(20 * Math.log10(peak / (rms + 1e-12))).toFixed(1),
    centroid,
    tPeak,
    t20: tAbove(-20),
    t40: tAbove(-40),
    // % of energy in <150, 150-600, 600-2k, 2k-5k, >5k Hz
    bands: bands.map((b) => Math.round((100 * b) / (den || 1))),
    endAmp: +endAmp.toFixed(4),
    loopJump,
  };
}

// -------------------------------------------------------------- drawing ---

const STOPS = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
function cmap(u) {
  u = Math.max(0, Math.min(1, u)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(u)), f = u - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const mel = (f) => 2595 * Math.log10(1 + f / 700);
const imel = (m) => 700 * (Math.pow(10, m / 2595) - 1);

function drawWave(g, buf, X, Y, W, H) {
  g.fillStyle = '#0b0c09';
  g.fillRect(X, Y, W, H);
  g.strokeStyle = '#2b3024';
  g.beginPath();
  g.moveTo(X, Y + H / 2 + 0.5);
  g.lineTo(X + W, Y + H / 2 + 0.5);
  g.stroke();
  const x = mono(buf);
  const n = x.length;
  const mid = Y + H / 2, amp = H / 2 - 1;
  for (let c = 0; c < W; c++) {
    const a = Math.floor((c / W) * n), b = Math.max(a + 1, Math.floor(((c + 1) / W) * n));
    let mn = 1, mx = -1, s = 0;
    for (let i = a; i < b; i++) {
      const v = x[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      s += v * v;
    }
    const r = Math.sqrt(s / (b - a));
    g.fillStyle = Math.max(mx, -mn) > 0.97 ? '#ff5040' : '#a9c46a';
    g.fillRect(X + c, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp));
    g.fillStyle = '#e8f2c0';
    g.fillRect(X + c, mid - r * amp, 1, Math.max(1, 2 * r * amp));
  }
  // 10 ms RMS envelope in dB (0 dBFS at the top, -60 dB at the bottom)
  const win = Math.max(1, Math.round(buf.sampleRate * 0.01));
  g.strokeStyle = 'rgba(255,150,40,0.9)';
  g.beginPath();
  for (let c = 0; c < W; c++) {
    const ctr = Math.floor(((c + 0.5) / W) * n);
    let s = 0, m = 0;
    for (let i = Math.max(0, ctr - (win >> 1)); i < Math.min(n, ctr + (win >> 1)); i++) {
      s += x[i] * x[i];
      m++;
    }
    const db = 20 * Math.log10(Math.sqrt(s / Math.max(1, m)) + 1e-9);
    const yy = Y + (1 - (Math.max(-60, db) + 60) / 60) * H;
    if (c) g.lineTo(X + c, yy);
    else g.moveTo(X + c, yy);
  }
  g.stroke();
}

function drawSpec(g, buf, X, Y, W, H, N = 512) {
  const x = mono(buf);
  const sr = buf.sampleRate;
  const fmax = Math.min(sr / 2, 11025);
  const cols = [];
  let gmax = 1e-20;
  for (let c = 0; c < W; c++) {
    const p = frame(x, ((c + 0.5) / W) * x.length, N);
    cols.push(p);
    for (let k = 0; k < p.length; k++) if (p[k] > gmax) gmax = p[k];
  }
  const img = g.createImageData(W, H);
  const mtop = mel(fmax);
  const bins = new Float64Array(H);
  for (let y = 0; y < H; y++) bins[y] = (imel(mtop * (1 - (y + 0.5) / H)) / sr) * N;
  for (let c = 0; c < W; c++) {
    const p = cols[c];
    for (let y = 0; y < H; y++) {
      const kb = bins[y], k0 = Math.floor(kb), f = kb - k0;
      const v = (p[k0] || 0) * (1 - f) + (p[k0 + 1] || 0) * f;
      const db = 10 * Math.log10(v / gmax + 1e-12);
      const [r, gg, b] = cmap((db + 75) / 75);
      const o = (y * W + c) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, X, Y);
}

function drawGrid(bank, items) {
  const cv = $('grid');
  const W = cv.width;
  const gap = 6;
  const cw = Math.floor((W - gap * (COLS - 1)) / COLS);
  const lh = 13, wh = Math.round(cw * 0.22), sh = Math.round(cw * 0.3);
  const ch = lh + wh + sh + 2;
  const rows = Math.ceil(items.length / COLS);
  cv.height = rows * (ch + gap);
  const g = cv.getContext('2d');
  g.fillStyle = '#11130f';
  g.fillRect(0, 0, cv.width, cv.height);
  g.font = '10px Verdana, sans-serif';
  g.textBaseline = 'top';
  items.forEach((it, i) => {
    const X = (i % COLS) * (cw + gap);
    const Y = Math.floor(i / COLS) * (ch + gap);
    g.fillStyle = '#d8dccb';
    g.fillText(it.label, X + 1, Y + 1);
    g.fillStyle = '#8b917c';
    const s = it.st;
    const meta = `${s.dur}s ${s.peak} ${s.centroid}Hz`;
    g.fillText(meta, X + cw - g.measureText(meta).width - 1, Y + 1);
    drawWave(g, it.buf, X, Y + lh, cw, wh);
    drawSpec(g, it.buf, X, Y + lh + wh + 2, cw, sh);
  });
  cv.onclick = (e) => {
    const r = cv.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * cv.width, sy = ((e.clientY - r.top) / r.height) * cv.height;
    const i = Math.floor(sy / (ch + gap)) * COLS + Math.floor(sx / (cw + gap));
    if (items[i]) playItem(items[i].name, items[i].v);
  };
}

function drawDetail(name, buf, v) {
  const cv = $('detail');
  const g = cv.getContext('2d');
  g.fillStyle = '#11130f';
  g.fillRect(0, 0, cv.width, cv.height);
  const s = stats(buf);
  g.font = '11px Verdana, sans-serif';
  g.textBaseline = 'top';
  g.fillStyle = '#e0b04a';
  g.fillText(`${name}${v != null ? ' #' + v : ''}   ${s.dur}s  peak ${s.peak}  rms ${s.rmsDb} dB  centroid ${s.centroid} Hz  t20 ${s.t20}s  bands ${s.bands.join('/')}`, 2, 2);
  drawWave(g, buf, 0, 18, cv.width, 90);
  drawSpec(g, buf, 0, 112, cv.width, cv.height - 112, 1024);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  const fmax = Math.min(buf.sampleRate / 2, 11025);
  for (const f of [100, 500, 1000, 2000, 4000, 8000]) {
    const y = 112 + (cv.height - 112) * (1 - mel(f) / mel(fmax));
    g.fillRect(0, y, 6, 1);
    g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 8, y - 5);
  }
}

// ------------------------------------------------------------------ app ---

const engine = new SoundEngine();
let bank = null;
const loops = new Map();

function posFor() {
  const sel = $('pos').value;
  const L = [0, 0, 64];
  switch (sel) {
    case 'left': return [0, 300, 64];
    case 'right': return [0, -300, 64];
    case 'front': return [900, 0, 64];
    case 'behind': return [-600, 0, 64];
    case 'far': return [2500, 400, 64];
    default: return sel === '2d' ? null : L;
  }
}

function playItem(name, v) {
  engine.resume();
  const e = bank.get(name);
  const arr = Array.isArray(e) ? e : [e];
  if (v == null) v = Math.floor(Math.random() * arr.length);
  const pos = posFor();
  const attn = $('pos').value === 'far' ? 'loud' : undefined;
  if (SOUND_META[name].loop) {
    if (loops.has(name)) {
      loops.get(name).stop();
      loops.delete(name);
    } else loops.set(name, engine.loop(name, { pos, attenuation: attn }));
  } else {
    engine.play(name, { pos, attenuation: attn, channel: 'preview:' + name });
  }
  drawDetail(name, arr[v], arr.length > 1 ? v : null);
}

function buildButtons() {
  const root = $('controls');
  for (const [group, names] of Object.entries(SOUND_GROUPS)) {
    const div = document.createElement('div');
    div.className = 'group';
    div.innerHTML = `<h2>${group}</h2>`;
    for (const name of names) {
      const b = document.createElement('button');
      const m = SOUND_META[name];
      b.innerHTML = name + (m.variants > 1 ? ` <small>×${m.variants}</small>` : '') + (m.loop ? ' <small>loop</small>' : '');
      b.onclick = () => {
        playItem(name);
        if (m.loop) b.classList.toggle('on', loops.has(name));
      };
      div.appendChild(b);
    }
    root.appendChild(div);
  }
}

async function main() {
  $('vol').oninput = (e) => engine.setMasterVolume(+e.target.value);
  engine.setMasterVolume(0.8);
  engine.setListener([0, 0, 64], 0, 0);
  if (!DIAG) buildButtons();
  status('building…');
  await engine.init(SR, qs.has('workers') ? { workers: +qs.get('workers') } : undefined);
  bank = engine.bank;
  let buffers = 0;
  for (const v of bank.values()) buffers += Array.isArray(v) ? v.length : 1;
  status(`built ${bank.size} sounds / ${buffers} buffers in ${bank.buildTime.toFixed(0)} ms @ ${SR} Hz`);

  const items = [];
  const report = {};
  for (const name of ONLY || SOUND_NAMES) {
    const e = bank.get(name);
    if (!e) continue;
    const arr = Array.isArray(e) ? e : [e];
    report[name] = arr.map((buf, v) => {
      const st = stats(buf);
      if (v === 0 || SHOW_VARIANTS) items.push({ name, v, buf, st, label: arr.length > 1 ? `${name}${SHOW_VARIANTS ? '#' + v : ' ×' + arr.length}` : name });
      return st;
    });
  }
  drawGrid(bank, items);

  if (DIAG) {
    // Smoke-test the runtime engine: positional, channel-stealing and loop paths.
    let engineOk = true;
    const frame = {};
    try {
      // listener-frame checks: facing north (yaw 90): east is to the right, north ahead;
      // pitch 90 (looking straight down): the floor below is ahead.
      const probe = (pos, yaw, pitch) => {
        engine.setListener([0, 0, 0], yaw, pitch);
        engine.play('menu_click', { pos, attenuation: 'normal', volume: 0 });
        const v = [...engine._voices].at(-1);
        return [v.panner.positionX.value, v.panner.positionY.value, v.panner.positionZ.value].map((a) => Math.round(a));
      };
      frame.eastWhenFacingNorth = probe([100, 0, 0], 90, 0); // expect [100, 0, 0] (right)
      frame.northWhenFacingNorth = probe([0, 100, 0], 90, 0); // expect [0, 0, -100] (ahead)
      frame.upWhenFacingEast = probe([0, 0, 100], 0, 0); // expect [0, 100, 0]
      frame.belowWhenLookingDown = probe([0, 0, -100], 0, 90); // expect [0, 0, -100] (ahead)
      frame.westWhenFacingEast = probe([-100, 0, 0], 0, 0); // expect [0, 0, 100] (behind)
      engine.setListener([100, 200, 64], 90, 10);
      engine.play('ak47', { pos: [400, 200, 64], channel: 'p1:weapon', attenuation: 'loud' });
      engine.play('m4a1', { pos: [400, 200, 64], channel: 'p1:weapon', attenuation: 'loud' });
      engine.play('step_sand', { pos: [100, 260, 0] });
      engine.play('c4_beep');
      const w = engine.loop('ambience_wind', { volume: 0.5 });
      w.setVolume(0.3);
      engine.setListener([120, 200, 64], 180, 0);
      w.stop();
      engine.play('nonexistent_sound');
    } catch (err) {
      engineOk = false;
      console.error('engine smoke test failed', err);
    }
    const out = {
      sampleRate: SR, buildMs: Math.round(bank.buildTime), names: bank.size, buffers,
      engineOk, frame, ctxState: engine.ctx.state, activeVoices: engine.activeVoices, stats: bank.stats, sounds: report,
    };
    window.__diag = out;
    console.log('SOUND_DIAG ' + JSON.stringify(out));
    console.log(`SOUND_BUILD ms=${Math.round(bank.buildTime)} names=${bank.size} buffers=${buffers} sr=${SR} engineOk=${engineOk}`);
  }
}

main().catch((e) => {
  status('error: ' + e.message);
  console.error(e);
});
