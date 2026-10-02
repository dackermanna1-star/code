/**
 * Audio debug page (debug/audio.html): buttons for every sound / loop / music mode, block
 * material grid, ambience controls, positional source controls, spectrogram of the last
 * sound and an output meter. Also exposes `window.__audioCheck` for tools/audiocheck.mjs.
 */
import {
  AUDIO_CATEGORIES,
  AudioEngine,
  BLOCK_ACTIONS,
  LOOP_NAMES,
  MUSIC_MODES,
  SOUND_GROUPS,
  SOUND_NAMES,
  analyze,
  categoryOf,
  colormap,
  renderLoop,
  renderSound,
  spectrogram,
  variationsOf,
  type AmbienceState,
  type AudioCategory,
  type LoopHandle,
  type MusicMode,
  type PlayOptions,
  type Rendered,
  type SoundMetrics,
} from '../audio';

const BIOMES = [
  'plains', 'forest', 'birch_forest', 'dark_forest', 'taiga', 'snowy_plains', 'snowy_slopes', 'desert', 'badlands', 'savanna', 'jungle',
  'swamp', 'meadow', 'cherry_grove', 'beach', 'ocean', 'river', 'dripstone_caves', 'lush_caves', 'deep_dark',
  'nether_wastes', 'crimson_forest', 'warped_forest', 'soul_sand_valley', 'basalt_deltas', 'the_end',
];

const engine = new AudioEngine({ seed: 1234 });
const LISTENER = { x: 0, y: 64, z: 0 };
const FORWARD = { x: 0, y: 0, z: -1 };
const UP = { x: 0, y: 1, z: 0 };

const po = { volume: 1, pitch: 1, muffle: 0, positional: false, az: 30, dist: 6, height: 0 };
const amb: AmbienceState = { underwater: false, caveFactor: 0, rain: 0, thunder: 0, wind: 0.3, dimension: 'overworld', biome: 'plains', timeOfDay: 0.25, inLava: false };
let ambOn = true;
let thunderDist = 120;
const loops = new Map<string, LoopHandle>();
let orbit = false;
let orbitT = 0;
const posObj = { x: 0, y: 0, z: 0 };

const $ = (id: string): HTMLElement => document.getElementById(id)!;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'onclick' && typeof v === 'function') e.addEventListener('click', v as EventListener);
    else if (k === 'class') e.className = String(v);
    else (e as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of kids) e.append(c);
  return e;
}

function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, on: (v: number) => void, fmt = (v: number) => v.toFixed(2)): HTMLInputElement {
  const out = h('span', {}, fmt(value));
  const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  inp.addEventListener('input', () => {
    const v = Number(inp.value);
    out.textContent = fmt(v);
    on(v);
  });
  parent.append(h('label', { class: 'row' }, h('span', {}, label), inp, out));
  return inp;
}

function checkbox(parent: HTMLElement, label: string, value: boolean, on: (v: boolean) => void): void {
  const inp = h('input', { type: 'checkbox', checked: value });
  inp.addEventListener('change', () => on(inp.checked));
  parent.append(h('label', { class: 'row' }, h('span', {}, label), inp, h('span', {}, '')));
}

function select(parent: HTMLElement, label: string, options: readonly string[], value: string, on: (v: string) => void): void {
  const s = h('select', {});
  for (const o of options) s.append(h('option', { value: o, selected: o === value }, o));
  s.addEventListener('change', () => on(s.value));
  parent.append(h('label', { class: 'row' }, h('span', {}, label), s, h('span', {}, '')));
}

function currentPos(): { x: number; y: number; z: number } {
  const a = (po.az * Math.PI) / 180;
  posObj.x = LISTENER.x + Math.sin(a) * po.dist;
  posObj.z = LISTENER.z - Math.cos(a) * po.dist;
  posObj.y = LISTENER.y + po.height;
  return posObj;
}

function playOpts(): PlayOptions {
  return { volume: po.volume, pitch: po.pitch, muffle: po.muffle, pos: po.positional ? { ...currentPos() } : undefined };
}

async function ensureStarted(): Promise<void> {
  if (!engine.ready) await engine.init();
  $('start').textContent = engine.ready ? 'Audio running' : 'Audio unavailable';
}

async function play(name: string): Promise<void> {
  await ensureStarted();
  engine.play(name, playOpts());
  showSpectrogram(name);
}

// ---------------------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------------------

function buildControls(): void {
  const c = $('controls');
  c.append(h('h2', {}, 'Mixer'));
  for (const cat of AUDIO_CATEGORIES) {
    slider(c, cat, 0, 1, 0.01, 1, (v) => (cat === 'master' ? engine.setMasterVolume(v) : engine.setCategoryVolume(cat as AudioCategory, v)));
  }
  c.append(h('h2', {}, 'Play options'));
  slider(c, 'volume', 0, 4, 0.05, po.volume, (v) => (po.volume = v));
  slider(c, 'pitch', 0.5, 2, 0.01, po.pitch, (v) => (po.pitch = v));
  slider(c, 'muffle', 0, 1, 0.01, po.muffle, (v) => (po.muffle = v));
  checkbox(c, 'positional', po.positional, (v) => (po.positional = v));
  slider(c, 'azimuth°', -180, 180, 1, po.az, (v) => (po.az = v), (v) => v.toFixed(0));
  slider(c, 'distance', 0.5, 64, 0.5, po.dist, (v) => (po.dist = v), (v) => v.toFixed(1));
  slider(c, 'height', -16, 16, 0.5, po.height, (v) => (po.height = v), (v) => v.toFixed(1));
  c.append(h('div', { class: 'hint' }, 'Listener at origin facing −Z (north); azimuth 90° = east (right ear).'));

  c.append(h('h2', {}, 'Ambience (setAmbience every frame)'));
  checkbox(c, 'enabled', ambOn, (v) => (ambOn = v));
  select(c, 'dimension', ['overworld', 'nether', 'end'], amb.dimension, (v) => (amb.dimension = v as AmbienceState['dimension']));
  select(c, 'biome', BIOMES, amb.biome, (v) => (amb.biome = v));
  checkbox(c, 'underwater', amb.underwater, (v) => (amb.underwater = v));
  checkbox(c, 'in lava', !!amb.inLava, (v) => (amb.inLava = v));
  slider(c, 'caveFactor', 0, 1, 0.01, amb.caveFactor, (v) => (amb.caveFactor = v));
  slider(c, 'rain', 0, 1, 0.01, amb.rain, (v) => (amb.rain = v));
  slider(c, 'thunder', 0, 1, 0.01, amb.thunder, (v) => (amb.thunder = v));
  slider(c, 'wind', 0, 1, 0.01, amb.wind, (v) => (amb.wind = v));
  slider(c, 'timeOfDay', 0, 1, 0.005, amb.timeOfDay, (v) => (amb.timeOfDay = v), (v) => v.toFixed(3));

  c.append(h('h2', {}, 'Thunder'));
  slider(c, 'distance', 0, 800, 5, thunderDist, (v) => (thunderDist = v), (v) => v.toFixed(0));
  c.append(
    h('button', {
      onclick: async () => {
        await ensureStarted();
        engine.thunder(thunderDist);
      },
    }, 'Strike'),
  );

  c.append(h('h2', {}, 'Music'));
  const mrow = h('div', { class: 'flex' });
  const mbtns: HTMLButtonElement[] = [];
  for (const m of MUSIC_MODES) {
    const b = h('button', {
      onclick: async () => {
        await ensureStarted();
        engine.setMusicMode(m as MusicMode);
        for (const x of mbtns) x.classList.toggle('on', x === b);
      },
    }, m);
    mbtns.push(b);
    mrow.append(b);
  }
  mrow.append(h('button', { onclick: () => engine.musicNext() }, 'skip silence ⏭'));
  c.append(mrow);

  c.append(h('h2', {}, 'Loops'));
  checkbox(c, 'orbit sources', orbit, (v) => (orbit = v));
  const lrow = h('div', { class: 'flex' });
  for (const name of LOOP_NAMES) {
    const b: HTMLButtonElement = h('button', {
      onclick: async () => {
        await ensureStarted();
        const cur = loops.get(name);
        if (cur) {
          cur.stop(0.4);
          loops.delete(name);
          b.classList.remove('on');
        } else {
          loops.set(name, engine.loop(name, playOpts()));
          b.classList.add('on');
          showSpectrogram(name, 'loop');
        }
      },
    }, name.replace('loop.', ''));
    lrow.append(b);
  }
  c.append(lrow);

  c.append(h('h2', {}, 'Stress'));
  c.append(
    h('button', {
      onclick: async () => {
        await ensureStarted();
        for (let i = 0; i < 80; i++) {
          const n = SOUND_NAMES[(Math.random() * SOUND_NAMES.length) | 0];
          const a = Math.random() * Math.PI * 2;
          engine.play(n, { pos: { x: Math.sin(a) * 10, y: 64, z: Math.cos(a) * 10 }, volume: 0.6 });
        }
      },
    }, '80 random sounds'),
  );
}

function buildSoundButtons(): void {
  // block grid
  const table = h('table', { class: 'grid' });
  const head = h('tr', {}, h('th', {}, 'group'));
  for (const a of BLOCK_ACTIONS) head.append(h('th', {}, a));
  table.append(head);
  for (const g of SOUND_GROUPS) {
    if (g === 'none') continue;
    const tr = h('tr', {}, h('th', {}, g));
    for (const a of BLOCK_ACTIONS) tr.append(h('td', {}, h('button', { onclick: () => play(`block.${g}.${a}`) }, a)));
    table.append(tr);
  }
  $('blocks').append(table);

  // other sounds grouped by prefix
  const groups = new Map<string, string[]>();
  for (const n of SOUND_NAMES) {
    if (/^block\.[a-z_]+\.(break|place|step|hit|fall|land)$/.test(n) && !n.startsWith('block.note_block')) continue;
    const parts = n.split('.');
    const key = parts[0] === 'mob' || parts[0] === 'ambient' || parts[0] === 'block' || parts[0] === 'entity' || parts[0] === 'item' ? `${parts[0]}.${parts[1]}` : parts[0];
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  const root = $('sounds');
  for (const [k, list] of groups) {
    const g = h('div', { class: 'group' }, h('h3', {}, k));
    const row = h('div', { class: 'flex' });
    for (const n of list) row.append(h('button', { onclick: () => play(n), title: `${n} · ${categoryOf(n)} · ${variationsOf(n)} variations` }, n.slice(k.length + 1) || n));
    g.append(row);
    root.append(g);
  }
}

// ---------------------------------------------------------------------------------------
// spectrogram & meter
// ---------------------------------------------------------------------------------------

function drawSpectrogram(canvas: HTMLCanvasElement, ch: Float32Array[], sr: number, title: string): SoundMetrics {
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const envH = 44;
  const rows = H - envH - 6;
  const sp = spectrogram(ch, sr, { rows, hop: Math.max(64, Math.round(ch[0].length / W)), fftSize: 2048, fMin: 40, fMax: 20000 });
  const m = analyze(ch, sr);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  // level strip (peak per column, dB)
  const x = ch[0];
  const per = x.length / W;
  g.fillStyle = '#5ac878';
  for (let px = 0; px < W; px++) {
    let pk = 0;
    for (let i = Math.floor(px * per); i < Math.floor((px + 1) * per); i++) {
      for (const c of ch) pk = Math.max(pk, Math.abs(c[i] ?? 0));
    }
    const db = Math.max(-60, 20 * Math.log10(pk + 1e-9));
    const hh = ((db + 60) / 60) * envH;
    g.fillRect(px, envH - hh, 1, hh);
  }
  let mx = -200;
  for (const d of sp.data) if (d > mx) mx = d;
  const img = g.createImageData(W, rows);
  for (let px = 0; px < W; px++) {
    const f = Math.min(sp.frames - 1, Math.floor((px / W) * sp.frames));
    for (let y = 0; y < rows; y++) {
      const t = (sp.data[f * sp.rows + y] - (mx - 75)) / 75;
      const [r, gg, b] = colormap(t);
      const o = ((rows - 1 - y) * W + px) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, envH + 6);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = '11px ui-monospace, monospace';
  for (const fq of [100, 300, 1000, 3000, 10000]) {
    const y = envH + 6 + rows - 1 - Math.round((Math.log(fq / 40) / Math.log(20000 / 40)) * rows);
    g.fillRect(0, y, 6, 1);
    g.fillText(fq >= 1000 ? `${fq / 1000}k` : String(fq), 8, y + 4);
  }
  g.fillText(title, 8, 12);
  return m;
}

function showSpectrogram(name: string, kind: 'sound' | 'loop' = 'sound'): void {
  const bank = engine.getBank();
  let ch: Float32Array[] | null = null;
  let sr = 48000;
  const isLoop = kind === 'loop';
  const key = isLoop ? `l:${name}` : `s:${name}#0`;
  const buf = bank?.get(key);
  if (buf) {
    ch = [];
    for (let i = 0; i < buf.numberOfChannels; i++) ch.push(buf.getChannelData(i));
    sr = buf.sampleRate;
  } else {
    const r = isLoop ? renderLoop(name, 48000) : renderSound(name, 0, 48000);
    if (r) {
      ch = r.ch;
      sr = r.sr;
    }
  }
  if (!ch) return;
  const m = drawSpectrogram($('spec') as HTMLCanvasElement, ch, sr, name);
  $('specInfo').textContent =
    `${name}  [${categoryOf(name)}]  ${m.duration.toFixed(2)} s (active ${m.activeDuration.toFixed(2)} s) @ ${sr} Hz · peak ${m.peakDb.toFixed(1)} dBFS · ` +
    `rms ${m.rmsDb.toFixed(1)} dB · centroid ${m.centroid.toFixed(0)} Hz · roll-off ${m.rolloff.toFixed(0)} Hz · low ${(m.low * 100).toFixed(0)}% · high ${(m.high * 100).toFixed(0)}%`;
}

const meterBuf = new Float32Array(2048);
let peakHold = 0;
function drawMeter(): void {
  const an = engine.getAnalyser();
  const cv = $('meter') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  if (!an) return;
  an.getFloatTimeDomainData(meterBuf);
  let pk = 0;
  let s = 0;
  for (let i = 0; i < meterBuf.length; i++) {
    const a = Math.abs(meterBuf[i]);
    if (a > pk) pk = a;
    s += meterBuf[i] * meterBuf[i];
  }
  const rms = Math.sqrt(s / meterBuf.length);
  peakHold = Math.max(pk, peakHold * 0.97);
  const toX = (v: number) => (Math.max(-60, 20 * Math.log10(v + 1e-9)) + 60) / 60 * (cv.width - 120);
  g.fillStyle = '#2f7a3a';
  g.fillRect(0, 8, toX(rms), 18);
  g.fillStyle = pk > 0.97 ? '#e05050' : '#5ac878';
  g.fillRect(0, 30, toX(pk), 18);
  g.fillStyle = '#fff';
  g.fillRect(toX(peakHold), 28, 2, 22);
  g.font = '11px ui-monospace, monospace';
  g.fillText(`rms ${(20 * Math.log10(rms + 1e-9)).toFixed(1)} dB`, cv.width - 112, 20);
  g.fillText(`peak ${(20 * Math.log10(peakHold + 1e-9)).toFixed(1)} dB`, cv.width - 112, 44);
  // scope
  g.strokeStyle = 'rgba(120,200,255,0.6)';
  g.beginPath();
  const w = cv.width - 120;
  for (let i = 0; i < 512; i++) {
    const y = 30 - meterBuf[i * 4] * 28;
    if (i === 0) g.moveTo(w * (i / 512), y);
    else g.lineTo(w * (i / 512), y);
  }
  g.stroke();
}

// ---------------------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------------------

let last = performance.now();
let statusTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  engine.setListener(LISTENER, FORWARD, UP);
  if (ambOn && engine.ready) engine.setAmbience(amb);
  if (orbit && loops.size) {
    orbitT += dt;
    let k = 0;
    for (const hnd of loops.values()) {
      const a = orbitT * 0.6 + (k++ * Math.PI * 2) / loops.size;
      hnd.setPos({ x: Math.sin(a) * po.dist, y: LISTENER.y + po.height, z: -Math.cos(a) * po.dist });
    }
  }
  engine.update(dt);
  drawMeter();
  statusTimer -= dt;
  if (statusTimer <= 0 && engine.ready) {
    statusTimer = 0.25;
    const s = engine.getStats();
    const b = s.bank;
    const mu = s.music;
    $('status').textContent =
      `${s.state} ${s.sampleRate} Hz · voices ${s.voices} · loops ${s.activeLoops}/${s.loops} · ` +
      (b ? `buffers ${b.buffers} (${(b.bytes / 1048576).toFixed(1)} MB) queued ${b.queued} inflight ${b.inflight} rendered ${b.rendered} in ${b.renderMs} ms ${b.worker ? '[worker]' : '[main thread]'}` : '') +
      (mu ? `\nmusic ${mu.mode}/${mu.state}${mu.wait ? ` (next in ${mu.wait}s)` : ''}${mu.piece ? ` · ${mu.piece}` : ''} · ` : '\n') +
      `beds ${JSON.stringify(s.ambience)}`;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------
// automated check API (tools/audiocheck.mjs)
// ---------------------------------------------------------------------------------------

export interface CheckResult extends SoundMetrics {
  key: string;
  name: string;
  v: number;
  kind: 'sound' | 'loop';
  category: string | null;
  synthMs: number;
  renderSr: number;
  channels: number;
  /** Loop seam discontinuity relative to the typical sample step (loops only). */
  seam: number;
  error?: string;
}

const CHECK_SR = 48000;

/** Plays a rendered buffer through an OfflineAudioContext (exercises the browser's buffer path & resampling). */
async function viaOffline(r: Rendered): Promise<Float32Array[]> {
  const len = Math.ceil((r.ch[0].length * CHECK_SR) / r.sr) + 128;
  const oac = new OfflineAudioContext(r.ch.length, len, CHECK_SR);
  const buf = oac.createBuffer(r.ch.length, r.ch[0].length, r.sr);
  r.ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  const src = oac.createBufferSource();
  src.buffer = buf;
  src.connect(oac.destination);
  src.start(0);
  const out = await oac.startRendering();
  const ch: Float32Array[] = [];
  for (let i = 0; i < out.numberOfChannels; i++) ch.push(out.getChannelData(i));
  return ch;
}

/** Loop seam: the wrap-around step |x[n−1] − x[0]| relative to the typical local step around the junction. */
function seamOf(ch: Float32Array[]): number {
  let worst = 0;
  const W = 256;
  for (const x of ch) {
    const n = x.length;
    let d = 0;
    for (let i = 1; i < W; i++) d += Math.abs(x[i] - x[i - 1]) + Math.abs(x[n - i] - x[n - i - 1]);
    d /= 2 * (W - 1);
    worst = Math.max(worst, Math.abs(x[n - 1] - x[0]) / (d * 4 + 1e-9));
  }
  return worst;
}

async function checkKey(key: string): Promise<CheckResult> {
  const isLoop = !key.includes('#') && LOOP_NAMES.includes(key);
  const [name, vs] = isLoop ? [key, '0'] : key.split('#');
  const v = Number(vs ?? 0);
  const base = { key, name, v, kind: (isLoop ? 'loop' : 'sound') as 'sound' | 'loop', category: categoryOf(name) };
  try {
    const t0 = performance.now();
    const r = isLoop ? renderLoop(name, CHECK_SR) : renderSound(name, v, CHECK_SR);
    const synthMs = performance.now() - t0;
    if (!r) throw new Error('unknown');
    const ch = await viaOffline(r);
    const m = analyze(ch, CHECK_SR);
    return { ...base, ...m, synthMs, renderSr: r.sr, channels: r.ch.length, seam: isLoop ? seamOf(r.ch) : 0 };
  } catch (e) {
    return { ...base, ...analyze([new Float32Array(1)], CHECK_SR), synthMs: 0, renderSr: 0, channels: 0, seam: 0, error: String(e) };
  }
}

async function spectrogramPNG(key: string, width = 900, height = 280): Promise<string> {
  const isLoop = !key.includes('#') && LOOP_NAMES.includes(key);
  const [name, vs] = isLoop ? [key, '0'] : key.split('#');
  const r = isLoop ? renderLoop(name, CHECK_SR) : renderSound(name, Number(vs ?? 0), CHECK_SR);
  if (!r) throw new Error(`unknown ${key}`);
  const ch = await viaOffline(r);
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const m = drawSpectrogram(cv, ch, CHECK_SR, `${key}  ${m2s(ch)}`);
  void m;
  return cv.toDataURL('image/png');
}

const m2s = (ch: Float32Array[]): string => {
  const m = analyze(ch, CHECK_SR);
  return `${m.duration.toFixed(2)}s  peak ${m.peakDb.toFixed(1)} dBFS  centroid ${m.centroid.toFixed(0)} Hz`;
};

/**
 * Full-engine integration test on an OfflineAudioContext: simulates ~`seconds` of gameplay
 * (steps, mobs, explosions, thunder, 80-sound burst, moving loops, ambience changes incl.
 * cave / rain / underwater, menu music) via suspend/resume "frames", then measures the mix.
 */
async function mixTest(seconds = 16): Promise<Record<string, unknown>> {
  const oac = new OfflineAudioContext(2, CHECK_SR * seconds, CHECK_SR);
  const eng = new AudioEngine({ context: oac, worker: false, prewarm: false, seed: 99 });
  await eng.init();
  const bank = eng.getBank();
  if (!bank) throw new Error('engine init failed');
  const t0 = performance.now();
  for (const ir of ['outdoor', 'cave', 'music']) bank.renderNow(`r:${ir}`);
  const used = [
    'block.grass.step', 'block.stone.step', 'block.stone.break', 'block.gravel.break', 'mob.zombie.say', 'mob.cow.say', 'mob.creeper.hurt',
    'random.explode', 'random.fuse', 'weather.thunder.near', 'weather.thunder.far', 'random.pop', 'random.orb', 'game.player.hurt',
    'liquid.splash', 'mob.ghast.moan', 'random.levelup', 'ambient.cave', 'ambient.drip', 'ambient.bird', 'ambient.underwater.additions',
  ];
  for (const n of used) for (let v = 0; v < variationsOf(n); v++) bank.renderNow(`s:${n}#${v}`);
  for (const l of ['loop.fire', 'loop.lava', 'loop.portal', 'loop.rain', 'loop.rain_indoor', 'loop.wind', 'loop.cave', 'loop.underwater', 'loop.night'])
    bank.renderNow(`l:${l}`);
  const prerenderMs = performance.now() - t0;

  const a: AmbienceState = { underwater: false, caveFactor: 0, rain: 0.8, thunder: 0, wind: 0.6, dimension: 'overworld', biome: 'forest', timeOfDay: 0.6, inLava: false };
  const L = { x: 0, y: 64, z: 0 };
  const P = (x: number, z: number, y = 64) => ({ x, y, z });
  let fire: LoopHandle | null = null;
  let lava: LoopHandle | null = null;
  let maxVoices = 0;
  let stepIdx = 0;
  const events: [number, () => void][] = [
    [0.1, () => eng.setMusicMode('menu')],
    [0.2, () => (fire = eng.loop('loop.fire', { pos: P(3, -2) }))],
    [0.25, () => (lava = eng.loop('loop.lava', { pos: P(-6, 4) }))],
    [1.0, () => eng.play('mob.zombie.say', { pos: P(-5, -5) })],
    [1.5, () => eng.play('mob.cow.say', { pos: P(8, 3) })],
    [2.0, () => eng.play('random.fuse', { pos: P(2, -3) })],
    [3.0, () => eng.play('random.explode', { pos: P(2, -3), volume: 4 })],
    [3.15, () => eng.play('random.explode', { pos: P(1, -1), volume: 4 })],
    [4.0, () => eng.play('random.levelup')],
    [5.0, () => eng.thunder(40)],
    [6.0, () => eng.thunder(400)],
    [
      7.0,
      () => {
        for (let i = 0; i < 80; i++) {
          const ang = (i / 80) * Math.PI * 2;
          eng.play(used[i % used.length], { pos: P(Math.sin(ang) * 6, Math.cos(ang) * 6), volume: 0.8, muffle: (i % 3) / 3 });
        }
      },
    ],
    [8.0, () => (a.caveFactor = 0.95)],
    [9.0, () => eng.play('block.stone.break', { pos: P(2, 2) })],
    [10.0, () => ((a.caveFactor = 0), (a.underwater = true))],
    [10.5, () => eng.play('liquid.splash', { pos: P(0, -1) })],
    [12.0, () => (a.underwater = false)],
    [13.0, () => fire?.stop(0.5)],
    [13.5, () => lava?.stop(1)],
    [14.0, () => eng.play('mob.ghast.moan', { pos: P(-10, -10) })],
  ];
  let ei = 0;
  const DT = 0.05;
  for (let t = DT; t < seconds - DT; t += DT) {
    const tt = t;
    void oac.suspend(tt).then(() => {
      while (ei < events.length && events[ei][0] <= tt) events[ei++][1]();
      if (Math.abs((tt % 0.4) - 0.2) < DT / 2) {
        eng.play(stepIdx++ % 2 ? 'block.grass.step' : 'block.stone.step', { pos: P(0, 0, 62.5) });
      }
      const ang = tt * 0.8;
      fire?.setPos(P(Math.sin(ang) * 4, Math.cos(ang) * 4));
      eng.setListener(L, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
      eng.setAmbience(a);
      eng.update(DT);
      maxVoices = Math.max(maxVoices, eng.getStats().voices);
      void oac.resume();
    });
  }
  const t1 = performance.now();
  const out = await oac.startRendering();
  const renderMs = performance.now() - t1;
  const ch = [out.getChannelData(0), out.getChannelData(1)];
  const m = analyze(ch, CHECK_SR);
  const profile: { t: number; peakDb: number; rmsDb: number }[] = [];
  for (let s = 0; s < seconds; s++) {
    let pk = 0;
    let ss = 0;
    const a0 = s * CHECK_SR;
    const a1 = Math.min(ch[0].length, a0 + CHECK_SR);
    for (const c of ch) {
      for (let i = a0; i < a1; i++) {
        const v = Math.abs(c[i]);
        if (v > pk) pk = v;
        ss += c[i] * c[i];
      }
    }
    profile.push({ t: s, peakDb: +(20 * Math.log10(pk + 1e-12)).toFixed(1), rmsDb: +(10 * Math.log10(ss / ((a1 - a0) * 2) + 1e-20)).toFixed(1) });
  }
  const stats = eng.getStats();
  eng.dispose();
  return { seconds, prerenderMs: Math.round(prerenderMs), renderMs: Math.round(renderMs), maxVoices, peak: m.peak, peakDb: m.peakDb, rmsDb: m.rmsDb, finite: m.finite, centroid: m.centroid, profile, stats };
}

/**
 * Renders `seconds` of generative music for a mode through the full engine on an
 * OfflineAudioContext (silence before the first piece skipped) → spectrogram PNG + levels.
 */
async function musicRender(mode: MusicMode, seconds = 30): Promise<Record<string, unknown>> {
  const oac = new OfflineAudioContext(2, CHECK_SR * seconds, CHECK_SR);
  const eng = new AudioEngine({ context: oac, worker: false, prewarm: false, seed: 5 });
  await eng.init();
  eng.getBank()?.renderNow('r:music');
  eng.setMusicMode(mode);
  eng.musicNext();
  let piece: string | null = null;
  const DT = 0.05;
  for (let t = DT; t < seconds - DT; t += DT) {
    void oac.suspend(t).then(() => {
      eng.update(DT);
      piece = eng.getStats().music?.piece ?? piece;
      void oac.resume();
    });
  }
  const out = await oac.startRendering();
  const ch = [out.getChannelData(0), out.getChannelData(1)];
  const m = analyze(ch, CHECK_SR);
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 300;
  drawSpectrogram(cv, ch, CHECK_SR, `music ${mode}: ${piece ?? '—'}`);
  eng.dispose();
  return { mode, piece, peakDb: m.peakDb, rmsDb: m.rmsDb, finite: m.finite, centroid: m.centroid, png: cv.toDataURL('image/png') };
}

/**
 * Loop virtualization: 30 positional fire loops at 3–38 blocks → at most 24 active, and the
 * active set is the nearest audible ones (after the listener moves too).
 */
async function loopTest(): Promise<Record<string, unknown>> {
  const oac = new OfflineAudioContext(2, CHECK_SR, CHECK_SR);
  const eng = new AudioEngine({ context: oac, worker: false, prewarm: false, seed: 3 });
  await eng.init();
  eng.getBank()?.renderNow('l:loop.fire');
  eng.setListener({ x: 0, y: 64, z: 0 }, FORWARD, UP);
  const handles: LoopHandle[] = [];
  for (let i = 0; i < 30; i++) {
    const d = 3 + ((i * 37) % 30) * 1.2; // shuffled distances 3..38 (all audible → over the 24-loop budget)
    const a = i * 2.4;
    handles.push(eng.loop('loop.fire', { pos: { x: Math.sin(a) * d, y: 64, z: Math.cos(a) * d } }));
  }
  const check = () => {
    const det = eng.getStats(true).loopDetail ?? [];
    const active = det.filter((l) => l.active);
    const parkedAudible = det.filter((l) => !l.active && l.dist < 48);
    const farthestActive = Math.max(0, ...active.map((l) => l.dist));
    const nearestParked = Math.min(1e9, ...parkedAudible.map((l) => l.dist));
    return { active: active.length, inRange: det.filter((l) => l.dist < 48).length, farthestActive, nearestParked, ok: active.length <= 24 && nearestParked + 2.01 >= farthestActive };
  };
  for (let k = 0; k < 40; k++) eng.update(0.1);
  const a = check();
  // move the listener: the nearest set changes
  eng.setListener({ x: 40, y: 64, z: 0 }, FORWARD, UP);
  for (let k = 0; k < 60; k++) eng.update(0.1);
  const b = check();
  for (const h of handles) h.stop(0);
  eng.update(0.1);
  const c = eng.getStats();
  eng.dispose();
  return { before: a, afterMove: b, afterStop: { loops: c.loops, activeLoops: c.activeLoops }, ok: a.ok && b.ok && c.loops === 0 };
}

/** Realtime test with the page's engine: worker pre-render, live playback levels, lazy-render latency. */
async function realtimeTest(): Promise<Record<string, unknown>> {
  const t0 = performance.now();
  await ensureStarted();
  const initMs = performance.now() - t0;
  await engine.whenIdle(90000);
  const prewarmMs = performance.now() - t0;
  const stats0 = engine.getStats();
  const an = engine.getAnalyser();
  const buf = new Float32Array(2048);
  let maxPeak = 0;
  let maxVoices = 0;
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const sample = async (n: number) => {
    for (let k = 0; k < n; k++) {
      await sleep(25);
      engine.update(0.025);
      if (an) {
        an.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) maxPeak = Math.max(maxPeak, Math.abs(buf[i]));
      }
      maxVoices = Math.max(maxVoices, engine.getStats().voices);
    }
  };
  engine.setListener(LISTENER, FORWARD, UP);
  const seq = ['ui.click', 'random.pop', 'block.stone.break', 'block.grass.step', 'mob.zombie.say', 'random.levelup', 'random.explode', 'mob.cow.say'];
  for (const n of seq) {
    engine.play(n, { pos: { x: 3, y: 64, z: -3 } });
    await sample(6);
  }
  // lazily rendered (not pre-warmed) sound: time until it is audible as a voice
  const before = engine.getStats().voices;
  const tl = performance.now();
  engine.play('mob.enderman.scream', { pos: { x: -2, y: 64, z: -2 } });
  let lazyMs = -1;
  for (let k = 0; k < 120; k++) {
    await sleep(10);
    engine.update(0.01);
    if (engine.getStats().voices > before) {
      lazyMs = performance.now() - tl;
      break;
    }
  }
  await sample(20);
  const fire = engine.loop('loop.fire', { pos: { x: 2, y: 64, z: 0 } });
  await sample(20);
  fire.stop(0.2);
  engine.setMusicMode('menu');
  engine.musicNext();
  await sample(40);
  return { initMs: Math.round(initMs), prewarmMs: Math.round(prewarmMs), stats0, stats1: engine.getStats(), maxPeak, maxVoices, lazyMs: Math.round(lazyMs) };
}

declare global {
  interface Window {
    __audioCheck?: unknown;
    __shotReady?: boolean;
  }
}

window.__audioCheck = {
  list: () => ({
    sounds: SOUND_NAMES,
    loops: LOOP_NAMES,
    variations: Object.fromEntries(SOUND_NAMES.map((n) => [n, variationsOf(n)])),
  }),
  check: async (keys: string[]) => {
    const out: CheckResult[] = [];
    for (const k of keys) out.push(await checkKey(k));
    return out;
  },
  spectrogramPNG,
  mixTest,
  loopTest,
  musicRender,
  realtimeTest,
};

// ---------------------------------------------------------------------------------------

buildControls();
buildSoundButtons();
$('start').addEventListener('click', () => void ensureStarted());
requestAnimationFrame(frame);
window.__shotReady = true;
