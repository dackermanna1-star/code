// Audio lab: trigger every sound at three distances, run a battle stress test,
// toggle loops and weather, and expose hooks for scripts/audio-check.mjs.
import { AudioSystem } from '/src/audio/AudioSystem.js';
import { LOOPS, SOUNDS } from '/src/audio/catalog.js';
import { Rng } from '/src/audio/dsp.js';
import { describe } from './audio-analysis.js';
import { SCENES, at, renderCalibration, renderScene, stressFrame, stressLoops } from './audio-scenes.js';

const $ = (sel) => document.querySelector(sel);
// ?workers=0 forces main-thread synthesis (the fallback path).
const params = new URLSearchParams(location.search);
const audio = new AudioSystem({ maxVoices: 48, workers: params.has('workers') ? Number(params.get('workers')) : undefined });
const listener = {
  position: { x: 0, y: 1.7, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
};
const env = { wind: 0.3, rain: 0, thunderstorm: false, battleIntensity: 0, nearIntensity: 0, night: false };
const state = {
  azimuth: 30,
  stress: false,
  stressLoops: false,
  rate: 300,
  loops: new Set(),
  loopIntensity: 0.6,
  maxVoices: 0,
  frames: 0,
  updateMs: 0,
  t: 0,
};
const rng = new Rng(7);
const stressState = {};
const names = Object.keys(SOUNDS).filter((n) => !SOUNDS[n].internal);

// Scripted motion for each loop kind (position + velocity at time t).
const MOTION = {
  tank: (t) => orbit(t, 40, 0.15, 0),
  ifv: (t) => orbit(t + 7, 60, -0.12, 0),
  apc: (t) => orbit(t + 3, 80, 0.1, 0),
  truck: (t) => orbit(t + 1, 30, 0.25, 0),
  heli: (t) => orbit(t, 150, 0.08, 60),
  jet: (t) => line(t, 260, 18, 200),
  plane: (t) => line(t, 140, 40, 400),
  drone: (t) => orbit(t, 12, 0.9, 6),
  uav: (t) => orbit(t, 250, 0.1, 300),
  fire: () => ({ position: at(20, -60), velocity: { x: 0, y: 0, z: 0 } }),
  spaag_radar: () => ({ position: at(25, 60), velocity: { x: 0, y: 0, z: 0 } }),
};

function orbit(t, r, w, y) {
  const a = t * w;
  return {
    position: { x: r * Math.cos(a), y, z: r * Math.sin(a) },
    velocity: { x: -r * w * Math.sin(a), y: 0, z: r * w * Math.cos(a) },
  };
}

// Straight passes back and forth over the listener.
function line(t, speed, period, y) {
  const span = speed * period;
  const u = (t % (2 * period)) / period;
  const dir = u < 1 ? 1 : -1;
  const x = dir > 0 ? -span / 2 + span * u : span / 2 - span * (u - 1);
  return { position: { x, y, z: -40 }, velocity: { x: speed * dir, y: 0, z: 0 } };
}

function loopSources(t) {
  const out = [];
  for (const kind of state.loops) {
    const m = MOTION[kind](t);
    out.push({ id: `lab-${kind}`, kind, position: m.position, velocity: m.velocity, intensity: state.loopIntensity });
  }
  if (state.stressLoops) out.push(...stressLoops(t));
  return out;
}

function frame(dt) {
  state.t += dt;
  if (state.stress) stressFrame(audio, rng, dt, state.rate, stressState);
  audio.setLoops(loopSources(state.t));
  const t0 = performance.now();
  audio.update(dt, listener);
  state.updateMs += performance.now() - t0;
  state.frames++;
  if (audio.ready) state.maxVoices = Math.max(state.maxVoices, audio.stats().voices);
}

// rAF drives the lab; a timer takes over when rAF is throttled (hidden/headless pages).
let last = performance.now();
let lastRaf = 0;
function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frame(dt);
}
function raf() {
  lastRaf = performance.now();
  tick();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
setInterval(() => {
  if (performance.now() - lastRaf > 100) tick();
}, 16);

async function start() {
  $('#status').textContent = 'synthesising…';
  const t0 = performance.now();
  await audio.start();
  audio.setMasterVolume(Number($('#volume').value));
  audio.setEnvironment(env);
  const s = audio.stats();
  $('#status').textContent = `ready · synthesis ${Math.round(performance.now() - t0)} ms (${s.synthesis.workers} workers) · ${s.synthesis.megabytes.toFixed(1)} MB`;
  $('#start').disabled = true;
  return s;
}

function playAt(name, d) {
  audio.play(name, d ? at(d, state.azimuth) : null, { duration: name === 'jet_gun' ? Number($('#burst').value) : 2 });
}

function buildUi() {
  $('#start').onclick = () => start();
  $('#volume').oninput = (e) => audio.setMasterVolume(Number(e.target.value));
  $('#timescale').oninput = (e) => {
    $('#tsv').textContent = e.target.value;
    audio.setTimeScale(Number(e.target.value));
  };
  $('#azimuth').oninput = (e) => {
    state.azimuth = Number(e.target.value);
    $('#azv').textContent = e.target.value;
  };
  $('#rate').oninput = (e) => {
    state.rate = Number(e.target.value);
    $('#ratev').textContent = e.target.value;
  };
  $('#burst').oninput = (e) => {
    $('#burstv').textContent = e.target.value;
  };
  $('#loopIntensity').oninput = (e) => {
    state.loopIntensity = Number(e.target.value);
  };
  const toggle = (btn, on) => btn.classList.toggle('on', on);
  $('#mute').onclick = (e) => {
    audio.setMuted(!audio.muted);
    toggle(e.target, audio.muted);
  };
  $('#voice').onclick = (e) => {
    audio.setVoiceRadio(!audio.voiceRadio);
    toggle(e.target, audio.voiceRadio);
  };
  $('#stress').onclick = (e) => {
    state.stress = !state.stress;
    toggle(e.target, state.stress);
  };
  $('#stressLoops').onclick = (e) => {
    state.stressLoops = !state.stressLoops;
    toggle(e.target, state.stressLoops);
  };
  for (const input of document.querySelectorAll('[data-env]')) {
    input.oninput = () => {
      env[input.dataset.env] = Number(input.value);
      audio.setEnvironment(env);
    };
  }
  for (const btn of document.querySelectorAll('[data-flag]')) {
    btn.onclick = () => {
      env[btn.dataset.flag] = !env[btn.dataset.flag];
      toggle(btn, env[btn.dataset.flag]);
      audio.setEnvironment(env);
    };
  }
  for (const btn of document.querySelectorAll('[data-thunder]')) btn.onclick = () => audio.thunder(Number(btn.dataset.thunder));
  for (const btn of document.querySelectorAll('[data-radio]')) {
    const [faction, priority] = btn.dataset.radio.split(',').map(Number);
    btn.onclick = () => audio.radio(faction ? 'Enemy armour moving west, request fires' : 'Contact front, two hundred metres, engaging', faction, { priority });
  }
  $('#radioFlood').onclick = () => {
    for (let i = 0; i < 10; i++) audio.radio(`Flood message ${i}`, i % 2, { priority: i % 3 });
  };
  const loops = $('#loops');
  for (const kind of Object.keys(LOOPS)) {
    const b = document.createElement('button');
    b.textContent = kind;
    b.onclick = () => {
      if (state.loops.has(kind)) state.loops.delete(kind);
      else state.loops.add(kind);
      toggle(b, state.loops.has(kind));
    };
    loops.append(b);
  }
  const flybys = $('#flybys');
  for (const [kind, speed] of [['bullet', 900], ['bullet', 300], ['heavy', 1000], ['shell', 800], ['shell', 280], ['rocket', 600]]) {
    const b = document.createElement('button');
    b.textContent = `${kind} ${speed > 343 ? 'super' : 'sub'}`;
    b.onclick = () => audio.flyby(kind, at(3, state.azimuth, 2), speed);
    flybys.append(b);
  }
  const grid = $('#sounds');
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'sound';
    const label = document.createElement('code');
    label.textContent = name;
    row.append(label);
    const spatial = SOUNDS[name].spatial !== false;
    for (const [text, d] of spatial ? [['near', 15], ['mid', 200], ['far', 1000]] : [['play', 0]]) {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => playAt(name, d);
      row.append(b);
    }
    grid.append(row);
  }
}

function showStats() {
  if (!audio.ready) return;
  const s = audio.stats();
  const v = s.voiceStats;
  const lines = [
    `context ${s.state} @ ${audio.ctx.sampleRate} Hz   t=${s.time.toFixed(1)} s`,
    `voices ${s.voices}/${s.maxVoices} (peak ${state.maxVoices})   pending ${s.pending}   loops ${s.loops}`,
    `events ${v.events}  played ${v.played}  stolen ${v.stolen}  to bed ${v.toBed}  dropped ${v.dropped}`,
    `bed: aggregated ${s.bed.aggregated}  played ${s.bed.played}  dropped ${s.bed.dropped}  synthetic ${s.bed.synthetic}  far rate small ${s.bed.rateSmall.toFixed(1)}/s heavy ${s.bed.rateHeavy.toFixed(1)}/s`,
    `radio: requested ${s.radio.requested} accepted ${s.radio.accepted} dropped ${s.radio.dropped} babble ${s.radio.babbled} speech ${s.radio.spoken}`,
    `update() ${(state.updateMs / Math.max(1, state.frames)).toFixed(3)} ms/frame avg`,
    `synthesis: wall ${s.synthesis.wallMs.toFixed(0)} ms, cpu ${s.synthesis.busyMs.toFixed(0)} ms, workers ${s.synthesis.workers}, ${s.synthesis.seconds.toFixed(0)} s of audio, ${s.synthesis.megabytes.toFixed(1)} MB`,
  ];
  $('#stats').textContent = lines.join('\n');
}
setInterval(showStats, 250);

buildUi();

// Hooks for automated checks.
window.audioLab = {
  audio,
  names,
  start,
  play: (name, d = 15, az = 30) => audio.play(name, d ? at(d, az) : null),
  setStress(on, rate = 300) {
    state.stress = on;
    state.stressLoops = on;
    state.rate = rate;
    state.maxVoices = 0;
    state.frames = 0;
    state.updateMs = 0;
  },
  labStats: () => ({ ...audio.stats(), labMaxVoices: state.maxVoices, frames: state.frames, updateMsPerFrame: state.updateMs / Math.max(1, state.frames) }),
  analyzeBank() {
    const out = [];
    for (const e of audio.bank.entries()) {
      const loop = e.key.startsWith('loop:') || e.key === 'amb:wind' || e.key.startsWith('amb:rain') || e.key === 'amb:rumble' || e.key === 'amb:crickets' || e.key === 'radio:static';
      out.push({ key: e.key, layer: e.layer, index: e.index, loop, ...describe(e.buffer, { loop }) });
    }
    const ir = audio.bank.impulse;
    out.push({ key: 'impulse', layer: 'ir', index: 0, loop: false, ...describe(ir) });
    return out;
  },
  sceneNames: Object.keys(SCENES),
  renderScene: (name) => renderScene(name, { sampleRate: audio.ctx.sampleRate }),
  calibrate: () => renderCalibration(audio.ctx.sampleRate),
};
