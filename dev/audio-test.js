// Dead County – audio test bench + offline verification API (used by dev/audio-verify.cjs).
import { AudioEngine, SOUND_NAMES, EXTRA_SOUND_NAMES } from '../src/audio/AudioEngine.js';
import { SOUND_DEFS, ALL_RENDER_NAMES, renderVariant, renderSound } from '../src/audio/sounds.js';
import { generatePiece } from '../src/audio/music.js';

const engine = new AudioEngine();
window.engine = engine;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------
// interactive UI
// ---------------------------------------------------------------------------------------------
const GROUPS = [
  ['Guns', (n) => n.startsWith('gun_') && !['gun_jam'].includes(n) || ['crossbow', 'bow', 'distant_gunshot'].includes(n)],
  ['Gun mechanics', (n) => ['dry_fire', 'reload_mag_out', 'reload_mag_in', 'reload_shell', 'pump', 'bolt', 'break_open', 'break_close', 'cock', 'gun_jam', 'shell_drop'].includes(n)],
  ['Melee & impacts', (n) => /^(swing|hit_|headshot|glass_break|bullet_|ricochet|shove|stomp|throw|bite|block_break)/.test(n)],
  ['Footsteps & movement', (n) => /^(footstep|jump|land)/.test(n)],
  ['Zombies', (n) => n.startsWith('zombie_')],
  ['Player', (n) => /^(player_|cough|breath|heartbeat|eat|drink|bandage|pills|zipper|item_|equip)/.test(n)],
  ['UI', (n) => /^(ui_|craft|sleep_start|level_up)/.test(n)],
  ['World', (n) => /^(door|container|car_alarm|helicopter|explosion|fire_loop|molotov|flare|lighter|match|wood_chop|barricade|pry|splash|radio|flashlight)/.test(n)],
  ['Ambient', () => true],
];
const allPublic = [...SOUND_NAMES, ...EXTRA_SOUND_NAMES];
const used = new Set();
const btns = new Map();
for (const [title, f] of GROUPS) {
  const names = allPublic.filter((n) => !used.has(n) && f(n));
  if (!names.length) continue;
  names.forEach((n) => used.add(n));
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.fontSize = '12px';
  const row = document.createElement('div');
  row.className = 'row';
  for (const n of names) {
    const b = document.createElement('button');
    b.textContent = n;
    b.className = 'pending';
    b.onclick = (e) => {
      ensureInit();
      if (e.altKey) return showSpectrogram(n, Math.floor(Math.random() * SOUND_DEFS[n].variants));
      if (e.shiftKey) {
        const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 37;
        const L = engine.listener;
        engine.play(n, { pos: { x: L.x + Math.cos(a) * d, y: L.y, z: L.z + Math.sin(a) * d } });
      } else engine.play(n);
    };
    btns.set(n, b);
    row.appendChild(b);
  }
  $('sounds').append(h, row);
}

function ensureInit() {
  if (!engine.ctx) {
    engine.init();
    engine.setListener({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 });
  } else engine.init();
}
$('init').onclick = ensureInit;

// volumes
for (const k of ['master', 'sfx', 'music', 'ambience']) {
  const l = document.createElement('label');
  l.innerHTML = `${k} <input type="range" min="0" max="1" step="0.01" value="${engine.volumes[k]}"><span class="v">${engine.volumes[k]}</span>`;
  const inp = l.querySelector('input');
  inp.oninput = () => {
    engine.setVolumes({ [k]: +inp.value });
    l.querySelector('.v').textContent = (+inp.value).toFixed(2);
  };
  $('volumes').appendChild(l);
}
// music
for (const m of ['menu', 'calm', 'night', 'tense', 'none']) {
  const b = document.createElement('button');
  b.textContent = m;
  b.onclick = () => {
    ensureInit();
    engine.setMusic(m);
    for (const x of $('music').children) x.classList.toggle('on', x === b);
  };
  $('music').appendChild(b);
}
// ambience
for (const k of ['rain', 'wind', 'storm', 'night', 'indoor', 'underwater', 'heartbeat', 'tinnitus', 'breathing', 'tension', 'events']) {
  const l = document.createElement('label');
  const v0 = k === 'wind' ? 0.2 : k === 'events' ? 1 : 0;
  l.innerHTML = `${k} <input type="range" min="0" max="1" step="0.01" value="${v0}"><span class="v">${v0}</span>`;
  const inp = l.querySelector('input');
  inp.oninput = () => {
    ensureInit();
    engine.setAmbience({ [k]: +inp.value });
    l.querySelector('.v').textContent = (+inp.value).toFixed(2);
  };
  $('ambience').appendChild(l);
}
document.querySelectorAll('[data-thunder]').forEach((b) => (b.onclick = () => (ensureInit(), engine.thunder(+b.dataset.thunder))));
let orbit = false;
$('orbit').onclick = () => {
  orbit = !orbit;
  $('orbit').classList.toggle('on', orbit);
};
// loops
const loopHandles = new Map();
for (const n of ['car_alarm', 'helicopter', 'fire_loop', 'flare_loop', 'radio_static', 'crickets']) {
  const b = document.createElement('button');
  b.textContent = n + ' (pos 8 m east)';
  b.onclick = () => {
    ensureInit();
    if (loopHandles.has(n)) {
      loopHandles.get(n).stop();
      loopHandles.delete(n);
      b.classList.remove('on');
    } else {
      loopHandles.set(n, engine.loop(n, { pos: { x: 8, y: 1.6, z: 0 }, volume: 1 }));
      b.classList.add('on');
    }
  };
  $('loops').appendChild(b);
}

let last = performance.now();
let ang = 0;
function frame(t) {
  const dt = (t - last) / 1000;
  last = t;
  if (engine.ctx) {
    if (orbit) {
      ang += dt * 0.5;
      engine.setListener({ x: 0, y: 1.6, z: 0 }, { x: Math.sin(ang), y: 0, z: -Math.cos(ang) });
    }
    engine.update(dt);
    const s = engine.debugStats();
    $('status').textContent = `${s.state} · rendered ${s.rendered}/${s.total} (${s.megabytes} MB, ${s.renderMs} ms cpu) · voices ${s.voices} · loops ${s.loops} · music ${s.music}`;
    for (const [n, b] of btns) if (b.classList.contains('pending') && engine.isReady(n)) b.classList.remove('pending');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------------------------
// analysis helpers
// ---------------------------------------------------------------------------------------------
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
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const p = i + k, q = p + h;
        const br = re[q] * cr - im[q] * ci, bi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - br;
        im[q] = im[p] - bi;
        re[p] += br;
        im[p] += bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function colormap(x) {
  x = Math.max(0, Math.min(1, x));
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const f = x * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), t = f - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * t);
}

/** draw waveform + log-frequency spectrogram of a buffer into ctx2d region */
function drawSpectrogram(g, buf, x0, y0, W, H, label) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, n = d.length;
  const N = 1024, nyq = sr / 2, wf = 36;
  const SH = H - wf - 14;
  g.fillStyle = '#000';
  g.fillRect(x0, y0, W, H);
  // waveform envelope
  g.fillStyle = '#6fa';
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x / W) * n), b = Math.max(a + 1, Math.floor(((x + 1) / W) * n));
    let mx = 0;
    for (let i = a; i < b; i++) mx = Math.max(mx, Math.abs(d[i]));
    const h = mx * (wf - 2);
    g.fillRect(x0 + x, y0 + 14 + (wf - h) / 2, 1, Math.max(1, h));
  }
  const img = g.createImageData(W, SH);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let x = 0; x < W; x++) {
    const c = Math.floor((x / W) * n);
    for (let i = 0; i < N; i++) {
      const j = c + i - N / 2;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = j >= 0 && j < n ? d[j] * w : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < SH; y++) {
      const f = 40 * Math.pow(nyq / 40, 1 - y / (SH - 1));
      const bin = Math.min(N / 2 - 1, Math.round(f / (sr / N)));
      const m = Math.hypot(re[bin], im[bin]) / (N / 4);
      const db = 20 * Math.log10(m + 1e-9);
      const [r, gg, b] = colormap((db + 90) / 90);
      const o = (y * W + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, x0, y0 + wf + 14);
  g.fillStyle = '#fff';
  g.font = '11px monospace';
  g.fillText(`${label}  ${buf.duration.toFixed(2)}s  ${sr}Hz`, x0 + 3, y0 + 11);
  g.fillStyle = '#888';
  for (const f of [100, 1000, 10000]) {
    if (f >= nyq) continue;
    const y = (1 - Math.log(f / 40) / Math.log(nyq / 40)) * (SH - 1);
    g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x0 + W - 22, y0 + wf + 14 + y + 4);
  }
}

async function showSpectrogram(name, v = 0) {
  const r = await renderVariant(name, v, 48000);
  const c = $('spec');
  drawSpectrogram(c.getContext('2d'), r.buffer, 0, 0, c.width, c.height, `${name} #${v}`);
}

function stats(buf) {
  let peak = 0, ss = 0, nan = false;
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    if (!Number.isFinite(x)) {
      nan = true;
      continue;
    }
    const a = Math.abs(x);
    if (a > peak) peak = a;
    ss += x * x;
  }
  // loudness-ish: RMS over the loudest 400 ms window
  const win = Math.floor(0.4 * buf.sampleRate);
  let best = 0, acc = 0;
  for (let i = 0; i < d.length; i++) {
    acc += d[i] * d[i];
    if (i >= win) acc -= d[i - win] * d[i - win];
    if (i >= Math.min(win, d.length) - 1) best = Math.max(best, acc / Math.min(win, d.length));
  }
  // short-window (50 ms) loudness for impulsive sounds
  const w2 = Math.max(1, Math.floor(0.05 * buf.sampleRate));
  let best2 = 0;
  acc = 0;
  for (let i = 0; i < d.length; i++) {
    acc += d[i] * d[i];
    if (i >= w2) acc -= d[i - w2] * d[i - w2];
    if (i >= Math.min(w2, d.length) - 1) best2 = Math.max(best2, acc / Math.min(w2, d.length));
  }
  const seam = Math.abs(d[0] - d[d.length - 1]);
  return { peak, rms: Math.sqrt(ss / d.length), rmsWin: Math.sqrt(best), rms50: Math.sqrt(best2), nan, duration: buf.duration, seam };
}

function wavBase64(buf) {
  const d = buf.getChannelData(0), n = d.length, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
  const ws = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  ws(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ws(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let s = '';
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// renders every variant of a sound in one context (exactly like the engine does) and caches it
const cache = new Map();
async function getVariant(name, v, baseRate) {
  const k = name + '@' + baseRate;
  if (!cache.has(k)) cache.set(k, renderSound(name, baseRate));
  const r = await cache.get(k);
  return { ...r.info[v], ms: r.ms / r.info.length };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.audioTest = {
  names: ALL_RENDER_NAMES,
  publicNames: SOUND_NAMES,
  defs: Object.fromEntries(Object.entries(SOUND_DEFS).map(([k, d]) => [k, { dur: d.dur, variants: d.variants, loop: !!d.loop, internal: !!d.internal, cat: d.cat, sr: d.sr, level: d.level }])),

  /** render every variant of every sound; returns per-variant stats */
  async renderAll({ baseRate = 48000, names = ALL_RENDER_NAMES, concurrency = 4 } = {}) {
    const jobs = [];
    for (const n of names) for (let v = 0; v < SOUND_DEFS[n].variants; v++) jobs.push([n, v]);
    const out = [];
    let i = 0;
    const t0 = performance.now();
    const worker = async () => {
      while (i < jobs.length) {
        const [n, v] = jobs[i++];
        try {
          const r = await getVariant(n, v, baseRate);
          out.push({ name: n, variant: v, ...stats(r.buffer), rawPeak: r.rawPeak, rawRms: r.rawRms, rawNan: r.nan, ms: r.ms, sr: r.buffer.sampleRate, samples: r.buffer.length, error: null });
        } catch (e) {
          out.push({ name: n, variant: v, error: String(e && e.stack || e) });
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { results: out, wallMs: performance.now() - t0 };
  },

  async spectrogramPNG(name, v = 0, W = 800, H = 300) {
    const r = await getVariant(name, v, 48000);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    drawSpectrogram(c.getContext('2d'), r.buffer, 0, 0, W, H, `${name} #${v}`);
    return c.toDataURL('image/png');
  },

  /** grid of spectrograms: items [[name, variant], ...] */
  async contactSheet(items, cols = 3, W = 420, H = 170) {
    const rows = Math.ceil(items.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * W;
    c.height = rows * H;
    const g = c.getContext('2d');
    for (let k = 0; k < items.length; k++) {
      const [n, v] = items[k];
      const r = await getVariant(n, v, 48000);
      drawSpectrogram(g, r.buffer, (k % cols) * W, Math.floor(k / cols) * H, W - 4, H - 4, `${n} #${v}`);
    }
    return c.toDataURL('image/png');
  },

  async wav(name, v = 0) {
    const r = await getVariant(name, v, 48000);
    return wavBase64(r.buffer);
  },

  musicCheck() {
    const issues = [];
    const info = [];
    for (const mood of ['menu', 'calm', 'night']) {
      for (let k = 0; k < 30; k++) {
        const p = generatePiece(mood);
        if (!p.events.length) issues.push(mood + ': empty piece');
        for (const e of p.events) {
          if (!Number.isFinite(e.t) || !Number.isFinite(e.midi) || !Number.isFinite(e.vel) || !Number.isFinite(e.dur) || e.vel <= 0 || e.dur <= 0) {
            issues.push(mood + ': bad event ' + JSON.stringify(e));
            break;
          }
        }
        if (p.length < 25 || p.length > 240) issues.push(`${mood}: odd length ${p.length.toFixed(1)}`);
        if (k < 2) info.push(`${mood}: ${p.mode} tonic ${p.tonic} ${p.bpm.toFixed(0)}bpm ${p.events.length} notes ${p.length.toFixed(0)}s`);
      }
    }
    return { issues, info };
  },

  /** measure live master output (RMS / peak, dBFS) in typical scenarios */
  async mixCheck() {
    const eng = new AudioEngine();
    eng.init();
    eng.setListener({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 });
    await eng.whenAllReady();
    const an = eng.ctx.createAnalyser();
    an.fftSize = 2048;
    eng.clipper.connect(an);
    const buf = new Float32Array(2048);
    let run = true;
    let acc = 0, cnt = 0, pk = 0, w50 = 0;
    const tick = () => {
      if (!run) return;
      eng.update(1 / 60);
      an.getFloatTimeDomainData(buf);
      let ss = 0;
      for (let i = 0; i < buf.length; i++) {
        ss += buf[i] * buf[i];
        pk = Math.max(pk, Math.abs(buf[i]));
      }
      acc += ss / buf.length;
      cnt++;
      w50 = Math.max(w50, ss / buf.length);
      setTimeout(tick, 16);
    };
    tick();
    const base = { rain: 0, wind: 0, storm: 0, night: 0, indoor: 0, underwater: 0, heartbeat: 0, tinnitus: 0, breathing: 0, tension: 0, events: 0 };
    const out = [];
    const measure = async (label, setup, ms = 2500, settle = 1500) => {
      eng.setMusic('none');
      eng.setAmbience(base);
      await sleep(400);
      setup();
      await sleep(settle);
      acc = 0;
      cnt = 0;
      pk = 0;
      w50 = 0;
      await sleep(ms);
      const db = (x) => +(10 * Math.log10(x + 1e-12)).toFixed(1);
      out.push({ label, rms: db(acc / Math.max(1, cnt)), loudest46ms: db(w50), peak: +(20 * Math.log10(pk + 1e-9)).toFixed(1) });
    };
    await measure('silence', () => {});
    await measure('day breeze (wind .3)', () => eng.setAmbience({ wind: 0.3 }));
    await measure('rain 1 + wind .5', () => eng.setAmbience({ rain: 1, wind: 0.5 }));
    await measure('storm (rain/wind/storm 1)', () => eng.setAmbience({ rain: 1, wind: 1, storm: 1 }));
    await measure('indoor in rain', () => eng.setAmbience({ rain: 1, wind: 0.5, indoor: 1 }));
    await measure('night crickets', () => eng.setAmbience({ night: 1, wind: 0.1 }));
    await measure('underwater', () => eng.setAmbience({ underwater: 1 }));
    await measure('tension 1', () => eng.setAmbience({ tension: 1 }));
    await measure('heartbeat 1', () => eng.setAmbience({ heartbeat: 1 }));
    await measure('breathing 1', () => eng.setAmbience({ breathing: 1 }));
    await measure('tinnitus 1', () => eng.setAmbience({ tinnitus: 1 }));
    await measure('music menu', () => eng.setMusic('menu'), 6000, 1500);
    await measure('music tense', () => eng.setMusic('tense'), 4000, 3500);
    await measure('pistol (own)', () => eng.play('gun_pistol'), 1200, 10);
    await measure('shotgun (own)', () => eng.play('gun_shotgun'), 1500, 10);
    await measure('AR burst x6', () => {
      for (let i = 0; i < 6; i++) setTimeout(() => eng.play('gun_ar'), i * 90);
    }, 1500, 10);
    await measure('pistol @ 150 m', () => eng.play('gun_pistol', { pos: { x: 150, y: 1.6, z: 0 } }), 2000, 10);
    await measure('zombie_groan @ 3 m', () => eng.play('zombie_groan', { pos: { x: 3, y: 1.6, z: 0 } }), 1800, 10);
    await measure('zombie_scream @ 10 m', () => eng.play('zombie_scream', { pos: { x: 0, y: 1.6, z: -10 } }), 2000, 10);
    await measure('footstep_grass (own)', () => eng.play('footstep_grass'), 400, 10);
    await measure('ui_click', () => eng.play('ui_click'), 300, 10);
    await measure('explosion @ 20 m', () => eng.play('explosion', { pos: { x: 20, y: 1.6, z: 0 } }), 3000, 10);
    await measure('thunder(0)', () => eng.thunder(0), 4000, 10);
    run = false;
    eng.dispose();
    return out;
  },

  /** exercise every public API method; returns {errors, log, outPeak, outNan} */
  async apiSmoke() {
    const errors = [], log = [];
    const T = (label, fn) => {
      try {
        return fn();
      } catch (e) {
        errors.push(`${label}: ${e && e.message}`);
      }
    };
    const eng = new AudioEngine();
    // --- before init: everything must be a silent no-op
    T('pre play', () => eng.play('gun_pistol', { pos: { x: 1, y: 2, z: 3 } }).stop());
    T('pre loop', () => {
      const h = eng.loop('car_alarm', { pos: { x: 1, y: 0, z: 0 } });
      h.setVolume(0.5);
      h.setPos({ x: 2, y: 0, z: 0 });
      h.setPitch(1.1);
      h.stop();
    });
    T('pre setAmbience', () => eng.setAmbience({ rain: 1, indoor: true }));
    T('pre thunder', () => eng.thunder(0.3));
    T('pre setMusic', () => eng.setMusic('calm'));
    T('pre setVolumes', () => eng.setVolumes({ master: 0.9 }));
    T('pre setListener', () => eng.setListener({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }));
    T('pre update', () => eng.update(0.016));
    const longTasks = [];
    let po = null;
    try {
      po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration)));
      po.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      /* unsupported */
    }
    T('init', () => eng.init());
    T('init twice', () => eng.init());
    if (!eng.ctx) {
      errors.push('no AudioContext after init');
      return { errors, log };
    }
    log.push('context state ' + eng.ctx.state + ' @' + eng.ctx.sampleRate);
    // meter the master output
    const an = eng.ctx.createAnalyser();
    an.fftSize = 2048;
    eng.clipper.connect(an);
    const tbuf = new Float32Array(2048);
    let outPeak = 0, outNan = false;
    let running = true;
    const tick = () => {
      if (!running) return;
      T('update', () => eng.update(1 / 60));
      an.getFloatTimeDomainData(tbuf);
      for (let i = 0; i < tbuf.length; i++) {
        const x = tbuf[i];
        if (!Number.isFinite(x)) outNan = true;
        else outPeak = Math.max(outPeak, Math.abs(x));
      }
      setTimeout(tick, 16);
    };
    tick();
    T('setMusic menu (pending → applied)', () => eng.setMusic('menu'));
    const t0 = performance.now();
    await Promise.race([eng.whenAllReady(), sleep(90000)]);
    const st = eng.debugStats();
    log.push(`render: ${st.rendered}/${st.total} sounds in ${((performance.now() - t0) / 1000).toFixed(1)}s wall, ${st.renderMs} ms summed, ${st.megabytes} MB, failed: ${st.failed.join(',') || 'none'}`);
    if (st.failed.length) errors.push('render failures: ' + st.failed.join(','));
    if (st.rendered < st.total) errors.push('not all sounds rendered in time');
    po?.disconnect();
    longTasks.sort((a, b) => b - a);
    log.push(`main-thread long tasks during background render: ${longTasks.length}, worst ${longTasks.slice(0, 5).map((x) => x.toFixed(0) + 'ms').join(' ') || '-'}`);
    // --- play every sound
    for (const n of [...SOUND_NAMES, ...EXTRA_SOUND_NAMES]) {
      T('play ' + n, () => {
        const h = eng.play(n);
        if (!h || typeof h.stop !== 'function') throw new Error('bad handle');
      });
      T('play pos ' + n, () => eng.play(n, { pos: { x: 5, y: 1, z: -8 }, volume: 0.8, pitch: 1.1, maxDist: 100 }));
      await sleep(5);
    }
    log.push('voices after playing everything: ' + eng.voices.length);
    if (eng.voices.length > 48) errors.push('voice cap exceeded: ' + eng.voices.length);
    T('stop handle', () => eng.play('gun_pistol').stop());
    T('weird opts', () => {
      eng.play('hit_flesh', { pos: { x: NaN, y: 0, z: 0 } });
      eng.play('hit_flesh', { volume: -1, pitch: 0 });
      eng.play('hit_flesh', { pos: { x: 1e6, y: 0, z: 0 } }).stop();
      eng.play('footstep_grass', { pos: { x: 0, y: 1.6, z: 0 } }); // at listener
    });
    T('unknown names', () => {
      eng.play('nope_sound');
      eng.play('nope_sound');
      eng.loop('nope_loop').stop();
    });
    // --- voice limiting
    for (let i = 0; i < 150; i++) T('spam', () => eng.play('zombie_groan', { pos: { x: Math.random() * 30 - 15, y: 1, z: Math.random() * 30 - 15 } }));
    const zc = eng.voices.filter((v) => v.def.group === 'zvoice').length;
    log.push(`after 150 groans: voices ${eng.voices.length}, zombie voices ${zc}`);
    if (eng.voices.length > 48) errors.push('voice cap exceeded after spam');
    if (zc > SOUND_DEFS.zombie_groan.groupCap) errors.push('zombie group cap exceeded: ' + zc);
    // --- loops
    const loops = [];
    for (const n of ['car_alarm', 'helicopter', 'fire_loop', 'flare_loop', 'radio_static', 'crickets', 'zombie_groan']) {
      T('loop ' + n, () => loops.push(eng.loop(n, { pos: { x: 10, y: 0, z: 0 }, volume: 0.7 })));
    }
    T('loop nonpositional', () => loops.push(eng.loop('fire_loop', { volume: 0.3 })));
    await sleep(300);
    for (const h of loops)
      T('loop ctl', () => {
        h.setVolume(0.5);
        h.setPos({ x: 20, y: 2, z: 5 });
        h.setPitch(0.9);
        h.setVolume(NaN);
        h.setPos(null);
      });
    T('loop far (culled)', () => loops.push(eng.loop('car_alarm', { pos: { x: 5000, y: 0, z: 0 } })));
    log.push('loops active: ' + eng.loops.size);
    // --- ambience
    T('ambience all', () => eng.setAmbience({ rain: 1, wind: 1, storm: 1, night: 1, indoor: true, underwater: 0.5, heartbeat: 1, tinnitus: 1, breathing: 1, tension: 1 }));
    await sleep(1500);
    const beds = [...eng.amb.beds.values()].filter((b) => b.src).length;
    log.push('ambience beds running with everything at 1: ' + beds + '/' + eng.amb.beds.size);
    if (beds < 8) errors.push('ambience beds did not start: ' + beds);
    T('ambience partial', () => eng.setAmbience({ indoor: false, underwater: 0 }));
    T('ambience junk', () => eng.setAmbience({ rain: 'x', wind: NaN, foo: 3 }));
    T('ambience null', () => eng.setAmbience(null));
    await sleep(500);
    const amb = eng.debugStats().ambience;
    if (Math.abs(amb.rain - 1) > 0.05) errors.push('rain not kept/smoothed: ' + amb.rain);
    if (amb.indoor > 0.9) errors.push('indoor not smoothing toward 0: ' + amb.indoor);
    for (const d of [0, 0.5, 1, NaN, -3, 7]) T('thunder ' + d, () => eng.thunder(d));
    T('play thunder', () => eng.play('thunder'));
    // --- music
    for (const m of ['menu', 'calm', 'night', 'tense', 'none', 'bogus', 'tense']) {
      T('music ' + m, () => eng.setMusic(m));
      await sleep(700);
    }
    T('music menu', () => eng.setMusic('menu'));
    await sleep(4000);
    const mnodes = eng.music.current ? eng.music.current.nodes.size : 0;
    log.push('menu music active nodes: ' + mnodes);
    if (!mnodes) errors.push('menu music did not start');
    // --- volumes / listener
    T('volumes', () => eng.setVolumes({ master: 0.5, sfx: 0.7, music: 0.3, ambience: 0.6 }));
    T('volumes empty', () => eng.setVolumes({}));
    T('volumes junk', () => eng.setVolumes({ master: NaN, sfx: 5, music: -1 }));
    T('listener up', () => eng.setListener({ x: 3, y: 20, z: 4 }, { x: 0, y: 1, z: 0 }));
    T('listener zero fwd', () => eng.setListener({ x: 3, y: 20, z: 4 }, { x: 0, y: 0, z: 0 }));
    T('listener null', () => eng.setListener(null, null));
    T('update junk dt', () => {
      eng.update(NaN);
      eng.update(-1);
      eng.update(100);
    });
    await sleep(1000);
    for (const h of loops) T('loop stop', () => (h.stop(), h.stop()));
    await sleep(400);
    log.push('loops after stop: ' + eng.loops.size);
    if (eng.loops.size) errors.push('loops not cleaned up');
    running = false;
    log.push('final ' + JSON.stringify({ voices: eng.voices.length, state: eng.ctx.state, time: eng.ctx.currentTime.toFixed(2) }));
    T('dispose', () => eng.dispose());
    return { errors, log, outPeak, outNan };
  },
};

$('renderAll').onclick = async () => {
  $('renderStatus').textContent = 'rendering…';
  const { results, wallMs } = await window.audioTest.renderAll();
  $('renderStatus').textContent = `${results.length} variants in ${(wallMs / 1000).toFixed(1)} s`;
  const by = new Map();
  for (const r of results) {
    if (!by.has(r.name)) by.set(r.name, []);
    by.get(r.name).push(r);
  }
  let html = '<table><tr><th>sound</th><th>var</th><th>dur s</th><th>peak</th><th>rms dB</th><th>loud dB</th><th>ms</th></tr>';
  for (const [n, rs] of by) {
    const bad = rs.some((r) => r.error || r.nan || r.peak > 1 || r.peak < 0.01);
    const dur = Math.max(...rs.map((r) => r.duration || 0));
    const pk = Math.max(...rs.map((r) => r.peak || 0));
    const rms = Math.max(...rs.map((r) => r.rms || 0));
    const lw = Math.max(...rs.map((r) => r.rmsWin || 0));
    const ms = rs.reduce((a, r) => a + (r.ms || 0), 0);
    html += `<tr class="${bad ? 'bad' : ''}"><td>${n}</td><td>${rs.length}</td><td>${dur.toFixed(2)}</td><td>${pk.toFixed(2)}</td><td>${(20 * Math.log10(rms + 1e-9)).toFixed(1)}</td><td>${(20 * Math.log10(lw + 1e-9)).toFixed(1)}</td><td>${ms.toFixed(0)}</td></tr>`;
  }
  $('table').innerHTML = html + '</table>';
};
