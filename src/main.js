// Bootstrap and main loop: fixed-step simulation with render interpolation,
// camera-driven slow motion, event routing to effects/audio/HUD, settings
// persistence and keyboard/pointer controls.

import { SIM_DT, DEFAULT_SETTINGS, sanitizeSettings } from './config.js';
import { Simulation } from './sim/simulation.js';
import { Renderer } from './render/renderer.js';
import { Camera } from './render/camera.js';
import { FX } from './render/fx.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { clamp } from './core/math.js';

const STORE_KEY = 'stickman-arena-settings-v1';

function loadSettings() {
  let s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) s = sanitizeSettings(JSON.parse(raw));
  } catch (e) {
    /* storage unavailable: defaults */
  }
  const hot = typeof window !== 'undefined' && window.claude && window.claude.hot && window.claude.hot.data;
  if (hot && hot.settings) s = sanitizeSettings(hot.settings);
  s.muted = true; // sound always starts off until the viewer opts in
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !hot) {
    s.screenShake = Math.min(s.screenShake, 0.25);
  }
  return s;
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch (e) {
    /* ignore */
  }
}

function randomSeed() {
  if (window.crypto && window.crypto.getRandomValues) {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0];
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

export function start(root) {
  const canvas = root.querySelector('canvas');
  const S = loadSettings();
  const renderer = new Renderer(canvas);
  const cam = new Camera();
  const fx = new FX();
  const audio = new AudioEngine();
  let sim = null;
  let simNumber = 1;
  let acc = 0;
  let paused = false;
  let last = performance.now();
  let renderT = 0;
  let endShownAt = null;
  let lastStepAdvanced = true;
  const perf = { fps: 60, simMs: 0, renderMs: 0 };

  const actions = {
    newSim: (seed) => newSim(seed),
    replay: () => newSim(sim ? sim.seed : undefined),
    togglePause: () => setPaused(!paused),
    cycleCamera: () => {
      const order = ['director', 'follow', 'wide', 'free'];
      S.cameraMode = order[(order.indexOf(S.cameraMode) + 1) % order.length];
      cam.mode = S.cameraMode;
      if (S.cameraMode === 'free') {
        cam.free.x = cam.x;
        cam.free.y = cam.y;
        cam.free.w = cam.viewW;
      }
      ui.syncInputs();
      saveSettings(S);
    },
    toggleSound: (forceOn) => {
      const on = forceOn === true ? true : S.muted;
      if (on) {
        if (!audio.init()) return;
        audio.setTheme(sim.level.theme, sim.level.condition);
        S.muted = false;
      } else S.muted = true;
      audio.setMuted(S.muted);
      audio.setVolume(S.volume);
      ui.soundHintDismissed = true;
      ui.syncDock();
    },
    settingsChanged: (key) => {
      if (sim) {
        // live-tunable values flow straight into the running battle
        for (const k of ['maxActive', 'spawnRate', 'enemyAggression', 'escalation', 'physicsIntensity', 'slowMo', 'screenShake']) sim.settings[k] = S[k];
      }
      if (key === 'cameraMode') cam.mode = S.cameraMode;
      if (key === 'volume') audio.setVolume(S.volume);
      if (key === 'quality') renderer.resize(S.quality);
      if (key === 'debugAI' || key === 'showStats' || key === 'showHud') ui.applyVisibility();
      saveSettings(S);
    },
  };

  const ui = new UI(root, S, actions);
  cam.mode = S.cameraMode;

  function setPaused(p) {
    paused = p;
    ui.setPaused(p);
  }

  function newSim(seed) {
    const sd = seed !== undefined ? seed >>> 0 : randomSeed();
    sim = new Simulation(S, sd, simNumber++);
    renderer.setSim(sim);
    renderer.resize(S.quality);
    fx.reset(sim);
    cam.reset(sim, renderer.W, renderer.H);
    if (audio.ready) audio.setTheme(sim.level.theme, sim.level.condition);
    ui.onNewSim(sim);
    acc = 0;
    endShownAt = null;
    setPaused(false);
    // let the first wave settle in before the first frame
    for (let i = 0; i < 2; i++) sim.step();
    sim.drainEvents();
  }

  function routeEvents(events) {
    for (const e of events) {
      fx.handle(e, sim, S);
      cam.onEvent(e, sim, S);
      audio.handle(e, cam, sim);
      ui.event(e);
    }
  }

  function frame(now) {
    const realDt = clamp((now - last) / 1000, 0, 0.1);
    last = now;
    perf.fps += (1 / Math.max(1e-3, realDt) - perf.fps) * 0.05;
    renderer.resize(S.quality);
    const W = renderer.W;
    const H = renderer.H;
    let ts = 0;
    if (!paused) {
      const wasSlow = !!cam.slow;
      ts = S.simSpeed * cam.timeScale;
      acc += realDt * ts;
      const t0 = performance.now();
      let steps = 0;
      while (acc >= SIM_DT && steps < 8) {
        lastStepAdvanced = sim.step();
        routeEvents(sim.drainEvents());
        acc -= SIM_DT;
        steps++;
      }
      if (steps >= 8) acc = 0;
      perf.simMs += (performance.now() - t0 - perf.simMs) * 0.1;
      if (!wasSlow && cam.slow) audio.handle({ t: 'slowmo' }, cam, sim);
      fx.update(realDt * ts, sim, cam.view(W, H), S);
      renderT += realDt * ts;
    }
    const alpha = lastStepAdvanced ? clamp(acc / SIM_DT, 0, 1) : 1;
    cam.update(paused ? 0 : realDt, sim, W, H, alpha, S);
    const r0 = performance.now();
    renderer.render(sim, cam, fx, alpha, renderT, S);
    perf.renderMs += (performance.now() - r0 - perf.renderMs) * 0.1;
    audio.update(realDt, sim, cam, cam.timeScale * S.simSpeed);
    let perfText = null;
    if (S.showStats) {
      let awake = 0;
      for (const f of sim.fighters) if (!f.kinematic && !f.rag.sleeping) awake++;
      let parts = 0;
      for (const p of fx.ps) if (p.alive) parts++;
      perfText = `FPS ${perf.fps.toFixed(0)}  sim ${perf.simMs.toFixed(1)}ms  draw ${perf.renderMs.toFixed(1)}ms\nfighters ${sim.fighters.length}  ragdolls ${awake}  fx ${parts}\nprops ${sim.props.boxes.length + sim.props.sticks.length}  zoom ${(cam.zoom).toFixed(2)}`;
    }
    ui.update(realDt, sim, perfText);
    // end of battle
    if (sim.over && sim.overT > 3.2) {
      if (endShownAt === null) {
        endShownAt = now;
        ui.showEnd(sim, S.autoNext ? 8 : null);
      } else if (S.autoNext) {
        const left = 8 - (now - endShownAt) / 1000;
        ui.setCountdown(left);
        if (left <= 0) newSim();
      }
    }
    requestAnimationFrame(frame);
  }

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      actions.togglePause();
    } else if (k === 'n') actions.newSim();
    else if (k === 'r') actions.replay();
    else if (k === 'c') actions.cycleCamera();
    else if (k === 'm') actions.toggleSound();
    else if (k === 'h') {
      S.showHud = !S.showHud;
      ui.syncInputs();
      ui.applyVisibility();
      saveSettings(S);
    } else if (k === 's') ui.toggleDrawer();
    else if (k === 'd') {
      S.debugAI = !S.debugAI;
      ui.syncInputs();
      saveSettings(S);
    } else if (k === 'escape') ui.toggleDrawer(false);
    else if (k === '1' || k === '2' || k === '3') {
      S.simSpeed = { 1: 0.5, 2: 1, 3: 2 }[k];
      ui.syncInputs();
      saveSettings(S);
    }
  });

  // free camera: drag to pan, wheel to zoom
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (S.cameraMode !== 'free') return;
    drag = { x: e.clientX, y: e.clientY, cx: cam.free.x, cy: cam.free.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = cam.viewW / renderer.W;
    cam.free.x = drag.cx - (e.clientX - drag.x) * k;
    cam.free.y = drag.cy - (e.clientY - drag.y) * k;
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (S.cameraMode !== 'free') return;
      e.preventDefault();
      cam.free.w = clamp(cam.free.w * Math.exp(e.deltaY * 0.001), 300, 6000);
    },
    { passive: false },
  );

  // the viewer's live-update hook keeps settings across republishes
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(() => ({ settings: S }));
  }
  window.__arena = { get sim() { return sim; }, cam, fx, settings: S, newSim, setPaused };

  newSim();
  requestAnimationFrame(frame);
}
