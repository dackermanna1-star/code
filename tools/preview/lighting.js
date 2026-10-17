// Lighting & FX preview harness (not shipped). Builds fake maps (lighting_scene.js), drives
// LightingSystem / FxSystem deterministically and renders stills or a live view.
//
// URL params (all optional):
//   view     corridor | angles | presets | exterior | lightning | stutter | doors | bench | fx | post | live
//   t        simulated seconds before the still (default 2)
//   px,py    Tess feet (world px)   dir  up|down|left|right   angle  flashlight angle (deg)
//   fl       flashlight on (1/0)    power 0..1   flicker 0..1
//   period   1 = period lights on (instant), 'stutter' = switched on 0.6 s before the still
//   cam      x,y camera override     scale  display scale (default 2)
//   reduce   1 = settings.reduceFlashing     only  comma list of presets (view=presets)
import HW from '../../src/engine/hw.js';
import { LightingSystem } from '../../src/render/lighting.js';
import * as FXM from '../../src/render/fx.js';
import { corridorMap, presetRoomMap, exteriorMap, drawScene } from './lighting_scene.js';
import { fxGallery, postGallery } from './lighting_fx.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const view = q.get('view') || 'corridor';
const root = document.getElementById('root');
const info = document.getElementById('info');
const DIRS = { up: -90, down: 90, left: 180, right: 0 };

const settings = { reduceFlashing: q.get('reduce') === '1', grain: q.get('grain') !== '0', crt: q.get('crt') === '1' };
const sfxLog = [];
HW.settings = { get: (k) => settings[k], values: settings };
HW.audio = { sfx: (id, o) => { sfxLog.push(`${id}@${Math.round(o?.x ?? 0)},${Math.round(o?.y ?? 0)}`); return { stop() {} }; } };
HW.time = 0;
const FxSystem = FXM.FxSystem;
HW.fx = FxSystem ? new FxSystem() : null;
HW.fx?.init?.();
if (HW.fx) HW.fx.dustMotes?.(true);

export function makeWorld() {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

export function panel(src, { label = '', scale = 2, crop = null } = {}) {
  const [sx, sy, sw, sh] = crop || [0, 0, 480, 270];
  const c = document.createElement('canvas');
  c.width = sw * scale;
  c.height = sh * scale;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = document.createElement('div');
  d.className = 'panel';
  d.appendChild(c);
  if (label) { const s = document.createElement('span'); s.textContent = label; d.appendChild(s); }
  root.appendChild(d);
  return c;
}

const clampCam = (map, x, y) => ({
  x: Math.round(Math.max(0, Math.min(map.w * 16 - 480, x))),
  y: Math.round(Math.max(0, Math.min(map.h * 16 - 270, y))),
  w: 480, h: 270,
});

/**
 * Run a lighting system on a map for t seconds at 60 Hz. `each(i, time)` may poke it per step.
 * Returns the camera.
 */
function simulate(L, map, { t = 2, tess, period = null, lightningAt = null, each = null, fx = HW.fx } = {}) {
  HW.map = map;
  HW.player = tess ? { x: tess.x, y: tess.y, hidden: null } : null;
  L.onMapLoad(map);
  if (period === 'instant') L.setGroup('period', true, { mode: 'instant' });
  const dt = 1 / 60;
  const steps = Math.round(t / dt);
  for (let i = 0; i < steps; i++) {
    const time = i * dt;
    if (lightningAt !== null && i === Math.round(lightningAt / dt)) L.lightning(1);
    each?.(i, time);
    if (tess) setFlashlight(L, tess);
    L.update(dt);
    fx?.update?.(dt);
    HW.time += dt;
  }
}

function setFlashlight(L, tess) {
  const f = L.flashlight;
  f.on = tess.fl;
  f.angle = (tess.angle * Math.PI) / 180;
  f.x = tess.x + Math.cos(f.angle) * 4;
  f.y = tess.y - 9 + Math.sin(f.angle) * 3;
  f.power = tess.power;
  f.flicker = tess.flicker;
}

function frame(L, map, cam, tess, ctx) {
  drawScene(ctx, map, cam, tess ? [tess] : []);
  HW.fx?.renderWorldPre?.(ctx, cam);
  L.render(ctx, cam);
  HW.fx?.renderWorld?.(ctx, cam);
  if (q.get('post') === '1') HW.fx?.renderPost?.(ctx);
}

function tessFromParams(map, def) {
  const dir = q.get('dir') || def.dir || 'up';
  return {
    x: num('px', def.x), y: num('py', def.y), dir,
    angle: num('angle', DIRS[dir]), fl: q.get('fl') !== '0', power: num('power', 1), flicker: num('flicker', 0),
  };
}

// ----------------------------------------------------------------------------------------- views
function viewCorridor() {
  const map = corridorMap();
  const L = new LightingSystem();
  L.init();
  const tess = tessFromParams(map, { x: 12 * 16 + 8, y: 15 * 16 + 12, dir: 'up' });
  const period = q.get('period') === '1' ? 'instant' : null;
  const t = num('t', 2);
  simulate(L, map, {
    t, tess, period,
    lightningAt: q.has('lightning') ? Math.max(0, t - num('lightning', 0.05)) : null,
    each: q.get('period') === 'stutter' ? (i, time) => { if (Math.abs(time - (t - num('since', 0.6))) < 1e-6 || i === Math.round((t - num('since', 0.6)) * 60)) L.setGroup('period', true); } : null,
  });
  const cam = q.has('cam') ? clampCam(map, ...q.get('cam').split(',').map(Number)) : clampCam(map, tess.x - 240, tess.y - 150);
  const [c, x] = makeWorld();
  frame(L, map, cam, tess, x);
  panel(c, { scale: num('scale', 2) });
  info.textContent = `lighting ${L.stats.ms.toFixed(2)} ms · lights ${L.stats.lights} · segs ${L.stats.segs} · lightAt(tess) ${L.lightAt(tess.x, tess.y - 10).toFixed(2)}\nsfx: ${sfxLog.slice(-6).join(' ')}`;
}

function viewAngles() {
  const map = corridorMap();
  const shots = [
    { label: 'hall, beam up at the wall', x: 12 * 16 + 8, y: 15 * 16 + 4, angle: -90 },
    { label: 'hall, beam east along lockers', x: 6 * 16, y: 14 * 16 + 4, angle: -8 },
    { label: 'beam into open classroom door', x: 6 * 16 + 8, y: 15 * 16 + 4, angle: -95 },
    { label: 'inside classroom, beam SE (bookshelf)', x: 9 * 16, y: 4 * 16 + 14, angle: 20 },
    { label: 'flashlight OFF (self-glow only)', x: 18 * 16, y: 15 * 16, angle: 90, fl: false },
    { label: 'low battery (power .3, flicker)', x: 30 * 16, y: 15 * 16 + 4, angle: 180, power: 0.3, flicker: 1 },
  ];
  for (const s of shots) {
    const L = new LightingSystem();
    L.init();
    const tess = { x: s.x, y: s.y, dir: 'up', angle: s.angle, fl: s.fl ?? true, power: s.power ?? 1, flicker: s.flicker ?? 0 };
    simulate(L, map, { t: num('t', 1.5), tess });
    const cam = clampCam(map, tess.x - 240, tess.y - 140);
    const [c, x] = makeWorld();
    frame(L, map, cam, tess, x);
    panel(c, { label: s.label, scale: num('scale', 1) });
  }
}

const PRESET_SHOTS = [
  ['fluor', { type: 'fluor', x: 14, y: 8 }],
  ['fluor (bad tube, t=dropout)', { type: 'fluor', x: 14, y: 8, flicker: 'fluor_bad' }],
  ['exit_sign', { type: 'exit_sign', x: 14, y: 3 }],
  ['exit_sign dying', { type: 'exit_sign', x: 14, y: 3, flicker: true }],
  ['lamp_green', { type: 'lamp_green', x: 14, y: 8 }, [{ type: 'desk_teacher', x: 13, y: 8 }]],
  ['bulb (caged)', { type: 'bulb', x: 14, y: 4 }],
  ['boiler', { type: 'boiler', x: 14.5, y: 7 }, [{ type: 'boiler', x: 13, y: 6 }], ':'],
  ['candle', { type: 'candle', x: 14, y: 9 }, [{ type: 'candle', x: 14, y: 9 }]],
  ['lamp_miner', { type: 'lamp_miner', x: 14, y: 9 }, [{ type: 'lamp_miner', x: 14, y: 9 }], ';'],
  ['spot', { type: 'spot', x: 14, y: 9 }, [{ type: 'lectern', x: 14, y: 9 }], '='],
  ['streetlamp', { type: 'streetlamp', x: 14, y: 9 }, [{ type: 'lamp_post', x: 14, y: 9 }], 'a'],
  ['headlights', { type: 'headlights', x: 14, y: 12, angle: -Math.PI / 2 }, [], 'a'],
  ['crt', { type: 'crt', x: 14, y: 8 }, [{ type: 'computer_desk', x: 14, y: 8, state: 'on' }]],
  ['led_red', { type: 'led_red', x: 14, y: 8 }, [{ type: 'pa_console', x: 13, y: 8 }]],
  ['mine_fire', { type: 'mine_fire', x: 14, y: 13 }, [], ';'],
  ['dawn (ambient)', { type: 'dawn' }],
];

function viewPresets() {
  const only = q.get('only') ? q.get('only').split(',') : null;
  for (const [label, def, objs = [], floor = '.'] of PRESET_SHOTS) {
    if (only && !only.some((o) => label.startsWith(o))) continue;
    const map = presetRoomMap(def, objs, floor);
    const L = new LightingSystem();
    L.init();
    const tess = { x: 6 * 16, y: 12 * 16, dir: 'up', angle: -90, fl: false, power: 1, flicker: 0 };
    simulate(L, map, { t: num('t', 2.3), tess });
    const cam = clampCam(map, 0, 0);
    const [c, x] = makeWorld();
    frame(L, map, cam, tess, x);
    panel(c, { label, scale: num('scale', 1) });
  }
}

function viewExterior() {
  const map = exteriorMap();
  const L = new LightingSystem();
  L.init();
  const tess = tessFromParams(map, { x: 13 * 16, y: 10 * 16, dir: 'up' });
  const t = num('t', 3);
  HW.fx?.rain?.(q.get('rain') !== '0', num('rain', 1));
  simulate(L, map, { t, tess, lightningAt: q.has('lightning') ? Math.max(0, t - num('lightning', 0.05)) : null });
  const cam = clampCam(map, num('cx', 70), num('cy', 0));
  const [c, x] = makeWorld();
  frame(L, map, cam, tess, x);
  panel(c, { scale: num('scale', 2) });
  info.textContent = `lighting ${L.stats.ms.toFixed(2)} ms`;
}

function viewLightning() {
  const map = corridorMap();
  for (const since of [0.02, 0.09, 0.16, 0.5, 1.2, 3]) {
    const L = new LightingSystem();
    L.init();
    const tess = { x: 8 * 16, y: 7 * 16, dir: 'up', angle: 30, fl: true, power: 1, flicker: 0 };
    simulate(L, map, { t: 3 + since, tess, lightningAt: 3 });
    const cam = clampCam(map, 0, 0);
    const [c, x] = makeWorld();
    frame(L, map, cam, tess, x);
    panel(c, { label: `lightning +${since}s${settings.reduceFlashing ? ' (reduceFlashing)' : ''}`, scale: num('scale', 1) });
  }
}

function viewStutter() {
  const map = corridorMap();
  for (const since of [0.05, 0.15, 0.3, 0.6, 1.0, 2.5]) {
    const L = new LightingSystem();
    L.init();
    sfxLog.length = 0;
    const tess = { x: 18 * 16, y: 16 * 16, dir: 'up', angle: 90, fl: false, power: 1, flicker: 0 };
    simulate(L, map, { t: 1 + since, tess, each: (i) => { if (i === 60) L.setGroup('period', true); } });
    const cam = clampCam(map, 6 * 16, 6 * 16);
    const [c, x] = makeWorld();
    frame(L, map, cam, tess, x);
    panel(c, { label: `period on +${since}s  sfx:${sfxLog.length}`, scale: num('scale', 1) });
  }
}

function viewDoors() {
  // Same spot, door 21 closed vs open; period lights on in the computer room only through the door.
  for (const state of ['closed', 'open']) {
    const map = corridorMap();
    const L = new LightingSystem();
    L.init();
    const tess = { x: 22 * 16 + 8, y: 16 * 16, dir: 'up', angle: -90, fl: true, power: 1, flicker: 0 };
    simulate(L, map, { t: 0.5, tess, period: 'instant', each: (i) => { if (i === 10) map.setDoor('pv_corridor_door_22_12', state); } });
    const cam = clampCam(map, 22 * 16 - 240, 4 * 16);
    const [c, x] = makeWorld();
    frame(L, map, cam, tess, x);
    panel(c, { label: `door ${state} (opaqueVersion ${map.opaqueVersion})`, scale: num('scale', 1) });
  }
}

function viewBench() {
  const map = corridorMap();
  const L = new LightingSystem();
  L.init();
  const tess = { x: 6 * 16, y: 15 * 16, dir: 'right', angle: 0, fl: true, power: 1, flicker: 0 };
  simulate(L, map, { t: 0.1, tess, period: 'instant' });
  const [c, x] = makeWorld();
  const N = num('frames', 240);
  const times = [];
  const tFrame = [];
  for (let i = 0; i < N; i++) {
    tess.x = 6 * 16 + (i / N) * 34 * 16;
    tess.angle = -90 + Math.sin(i * 0.05) * 120;
    setFlashlight(L, tess);
    L.update(1 / 60);
    const cam = clampCam(map, tess.x - 240, tess.y - 150);
    drawScene(x, map, cam, [tess]);
    const t0 = performance.now();
    L.render(x, cam);
    x.getImageData(0, 0, 1, 1); // force the raster to finish so timing includes it
    const t1 = performance.now();
    times.push(L.stats.ms);
    tFrame.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  tFrame.sort((a, b) => a - b);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const lights = L.lights.length;
  const msg = `[bench] lighting.render over ${N} frames, ${lights} lights + flashlight: JS avg ${avg(times).toFixed(2)} ms, p50 ${times[N >> 1].toFixed(2)}, p95 ${times[Math.floor(N * 0.95)].toFixed(2)}, max ${times[N - 1].toFixed(2)} | incl. raster flush avg ${avg(tFrame).toFixed(2)} p95 ${tFrame[Math.floor(N * 0.95)].toFixed(2)}`;
  console.log(msg);
  info.textContent = msg;
  panel(c, { scale: 1 });
  window.__bench = { avg: avg(times), p95: times[Math.floor(N * 0.95)], flushAvg: avg(tFrame) };
}

function viewLive() {
  const map = corridorMap();
  const L = new LightingSystem();
  L.init();
  HW.map = map;
  L.onMapLoad(map);
  const tess = { x: 12 * 16 + 8, y: 15 * 16 + 12, dir: 'up', angle: -90, fl: true, power: 1, flicker: 0 };
  HW.player = { x: tess.x, y: tess.y };
  const keys = new Set();
  addEventListener('keydown', (e) => {
    keys.add(e.key);
    if (e.key === 'f') tess.fl = !tess.fl;
    if (e.key === 'p') L.setGroup('period', !L.groupOn('period'));
    if (e.key === 'l') L.lightning(1);
    if (e.key === 'o') { const d = map.prop('pv_corridor_door_22_12'); map.setDoor(d.id, d.state === 'open' ? 'closed' : 'open'); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key));
  const [c, x] = makeWorld();
  const out = panel(c, { scale: 2 });
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let vx = 0;
    let vy = 0;
    if (keys.has('ArrowLeft')) vx--;
    if (keys.has('ArrowRight')) vx++;
    if (keys.has('ArrowUp')) vy--;
    if (keys.has('ArrowDown')) vy++;
    if (vx || vy) {
      tess.x += vx * 60 * dt;
      tess.y += vy * 60 * dt;
      const target = (Math.atan2(vy, vx) * 180) / Math.PI;
      let d = target - tess.angle;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      tess.angle += d * Math.min(1, dt * 11);
    }
    HW.player.x = tess.x;
    HW.player.y = tess.y;
    setFlashlight(L, tess);
    L.update(dt);
    HW.fx?.update?.(dt);
    const cam = clampCam(map, tess.x - 240, tess.y - 150);
    frame(L, map, cam, tess, x);
    out.getContext('2d').drawImage(c, 0, 0, 960, 540);
    info.textContent = `lighting ${L.stats.avg.toFixed(2)} ms · arrows move · f flashlight · p period · l lightning · o door`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const VIEWS = {
  corridor: viewCorridor, angles: viewAngles, presets: viewPresets, exterior: viewExterior, lightning: viewLightning,
  stutter: viewStutter, doors: viewDoors, bench: viewBench, live: viewLive,
  fx: () => fxGallery({ makeWorld, panel, q, info }), post: () => postGallery({ makeWorld, panel, q, info }),
};

try {
  (VIEWS[view] || viewCorridor)();
} catch (e) {
  console.error(e);
}
window.__ready = true;
