// Offline rendering scenarios for verification (used by tools/audio-test.html and headless tests).
// Drives an AudioEngine inside an OfflineAudioContext: frame updates + timed actions are executed in
// ctx.suspend() callbacks, exactly like a game loop would call update()/footstep()/oneShot().
import { AudioEngine } from '../AudioEngine.js';

export const SURFACE_CYCLE = ['asphalt', 'concrete', 'wet', 'puddle', 'metal', 'grate', 'debris', 'glass', 'wood', 'cardboard'];

// ---------------------------------------------------------------- WAV encoding
export function encodeWav(channels, sr, float = true) {
  const nch = channels.length;
  const n = channels[0].length;
  const bps = float ? 4 : 2;
  const buf = new ArrayBuffer(44 + n * nch * bps);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nch * bps, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * bps, true); v.setUint16(32, nch * bps, true);
  v.setUint16(34, bps * 8, true); w(36, 'data'); v.setUint32(40, n * nch * bps, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const s = channels[c][i];
      if (float) v.setFloat32(o, s, true);
      else v.setInt16(o, Math.max(-1, Math.min(1, s)) * 32767, true);
      o += bps;
    }
  }
  return buf;
}

export function toBase64(ab) {
  const bytes = new Uint8Array(ab);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

// ---------------------------------------------------------------- world model used by the simulations
export const WORLD = {
  frontWallZ: -95.5,
  backZ: 8.3,
  eye: 1.62,
  distFront(z) { return Math.max(0.5, z - this.frontWallZ); },
  distBack(z) { return Math.max(0.5, this.backZ - z); },
  enclosure(z) { return z < -88 ? 0.5 : z > 6 ? 0.7 : 1; },
};

/** Surface map for the walk simulation (by z). */
export function surfaceAtZ(z) {
  if (z > -6) return 'asphalt';
  if (z > -9) return 'wet';
  if (z > -11) return 'puddle';
  if (z > -16) return 'asphalt';
  if (z > -19) return 'concrete';
  if (z > -21) return 'grate';
  if (z > -24) return 'debris';
  if (z > -27) return 'wet';
  if (z > -29) return 'metal';
  if (z > -31) return 'puddle';
  if (z > -34) return 'cardboard';
  if (z > -37) return 'glass';
  if (z > -40) return 'wood';
  return 'asphalt';
}

// ---------------------------------------------------------------- driver
/**
 * scenario: { duration, engineOpts, setup(engine, api), frame(t, dt, engine, api), actions: [[t, fn(engine, api)]] }
 * Returns { sampleRate, channels: [Float32Array, Float32Array], meta, engine }
 */
export async function renderOffline(scenario, o = {}) {
  const sr = o.sampleRate ?? 48000;
  const dur = scenario.duration;
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC({ numberOfChannels: 2, length: Math.round(sr * dur), sampleRate: sr });
  const engine = new AudioEngine({ context: ctx, seed: o.seed ?? 1337, fadeInSec: 0.05, ...(scenario.engineOpts || {}) });
  const t0 = performance.now();
  await engine.init();
  const initMs = performance.now() - t0;
  await engine.whenFullyLoaded();
  const fullMs = performance.now() - t0;
  const meta = { initMs, fullMs, events: [], debug: null };
  const api = { meta, state: {}, log: (e) => meta.events.push(e) };
  if (scenario.setup) scenario.setup(engine, api);
  const q = 128 / sr;
  const quant = (t) => Math.max(1, Math.round(t / q)) * q;
  const fps = o.fps ?? 30;
  const map = new Map();
  const add = (t, fn) => {
    if (t <= 0 || t >= dur - 2 * q) return;
    const k = Math.round(quant(t) / q);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(fn);
  };
  let lastT = 0;
  for (let t = 1 / fps; t < dur; t += 1 / fps) {
    add(t, (tt) => {
      const dt = tt - lastT;
      lastT = tt;
      if (scenario.frame) scenario.frame(tt, dt, engine, api);
    });
  }
  for (const [t, fn] of scenario.actions || []) add(t, () => fn(engine, api));
  const keys = [...map.keys()].sort((a, b) => a - b);
  // frame callbacks first, then actions at the same instant
  for (const k of keys) {
    const t = k * q;
    ctx.suspend(t).then(() => {
      for (const fn of map.get(k)) {
        try { fn(t); } catch (e) { console.error('scenario action failed', e); }
      }
      ctx.resume();
    });
  }
  const tr = performance.now();
  const buf = await ctx.startRendering();
  meta.renderMs = performance.now() - tr;
  meta.debug = engine.getDebugInfo();
  return { sampleRate: sr, channels: [buf.getChannelData(0), buf.getChannelData(1)], meta, engine };
}

// ---------------------------------------------------------------- scenario library
const look = (engine, pos, fwd = { x: 0, y: 0, z: -1 }) => engine.setListener(pos, fwd, { x: 0, y: 1, z: 0 });
const stateAt = (z, t, extra = {}) => ({
  time: t, playerPos: { x: 0, y: 0, z }, playerVel: { x: 0, y: 0, z: -1.25 }, speed: 1.25,
  distFront: WORLD.distFront(z), distBack: WORLD.distBack(z), enclosure: WORLD.enclosure(z), ...extra,
});

/**
 * Spray strokes driven like the game's SprayTool: sprayStart + sprayUpdate in the same frame, the pressure
 * ramping up over ~70 ms, sprayStop when the trigger is released. strokes: [{ t0, t1, cap, flow(u, t), dist(u, t) }]
 * (u = 0..1 through the stroke). The nozzle sits ~0.4 m ahead/right of the listener and sweeps slowly.
 */
function sprayDriver(strokes, lis) {
  const st = strokes.map(() => ({ on: false, done: false, pressure: 0 }));
  return (t, dt, engine) => {
    strokes.forEach((s, i) => {
      const k = st[i];
      if (k.done || t < s.t0) return;
      if (t >= s.t1) {
        if (k.on) engine.sprayStop();
        k.on = false;
        k.done = true;
        return;
      }
      const u = (t - s.t0) / (s.t1 - s.t0);
      k.pressure = Math.min(1, k.pressure + dt / 0.07);
      if (!k.on) engine.sprayStart({ cap: s.cap });
      k.on = true;
      const sweep = 0.1 * Math.sin(2 * Math.PI * 0.6 * t);
      engine.sprayUpdate({
        flow: (s.flow ? s.flow(u, t) : 1) * k.pressure,
        cap: s.cap,
        distance: s.dist ? s.dist(u, t) : 0.25,
        position: { x: lis.x + 0.22 + sweep, y: lis.y - 0.25, z: lis.z - 0.32 },
      });
    });
  };
}

/** heel + toe pair at time t */
function stepActions(t, surface, foot, intensity, z) {
  const pos = (zz) => ({ x: foot === 'L' ? -0.1 : 0.1, y: 0, z: zz });
  return [
    [t, (e) => e.footstep({ foot, part: 'heel', surface, intensity, position: pos(z) })],
    [t + 0.1, (e) => e.footstep({ foot, part: 'toe', surface, intensity: intensity * 0.9, position: pos(z - 0.1) })],
  ];
}

export const SCENARIOS = {
  /** Full mix: walk down the alley over many surfaces, past emitters, with forced distant events. */
  walk(opts = {}) {
    const dur = opts.duration ?? 40;
    const speed = 1.25;
    const z0 = 1.5;
    const stepHz = 1.9;
    const actions = [];
    let foot = 'L';
    for (let t = 0.6; t < dur - 0.5; t += 1 / stepHz) {
      const z = z0 - speed * t;
      const surf = surfaceAtZ(z);
      const inten = 0.68 + 0.12 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 7.1);
      actions.push(...stepActions(t, surf, foot, inten, z));
      if (Math.abs(Math.sin(t * 3.7)) > 0.985) actions.push([t + 0.2, (e) => e.footstep({ foot, part: 'scuff', surface: surf, intensity: 0.5, position: { x: 0, y: 0, z } })]);
      foot = foot === 'L' ? 'R' : 'L';
    }
    // drips near the walls (world-scheduled, visually synced)
    let rs = 12345;
    const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let t = 0.8; t < dur; t += 0.25 + rnd() * 1.2) {
      const surf = ['water', 'water', 'ground', 'metal', 'plastic'][Math.floor(rnd() * 5)];
      actions.push([t, (e) => {
        const z = z0 - speed * t;
        e.oneShot('drip', { position: { x: (rnd() < 0.5 ? -1 : 1) * (1.8 + rnd() * 0.8), y: 0, z: z - 2 - rnd() * 8 }, surface: surf });
      }]);
    }
    actions.push([1.0, (e) => e.oneShot('carPass', { from: { x: -45, y: 0.5, z: 14 }, to: { x: 45, y: 0.5, z: 14 }, duration: 6 })]);
    actions.push([4.0, (e) => e.triggerAmbient('siren')]);
    actions.push([9.0, (e) => e.oneShot('canKick', { position: { x: 0.3, y: 0, z: z0 - speed * 9 - 0.6 }, strength: 0.8 })]);
    actions.push([13.0, (e) => e.triggerAmbient('train')]);
    actions.push([15.5, (e) => e.oneShot('paperRustle', { position: { x: -1.5, y: 0, z: z0 - speed * 15.5 - 3 }, strength: 0.7 })]);
    actions.push([17.0, (e) => e.oneShot('garbageShift', { position: { x: -2.0, y: 0.6, z: -22 } })]);
    actions.push([19.0, (e) => e.oneShot('bottleKick', { position: { x: -0.4, y: 0, z: z0 - speed * 19 - 0.6 }, strength: 0.7 })]);
    actions.push([21.5, (e) => e.oneShot('doorRattle', { position: { x: 2.8, y: 1.2, z: z0 - speed * 21.5 - 4 } })]);
    actions.push([24.0, (e) => e.oneShot('plasticRustle', { position: { x: 1.8, y: 0.3, z: z0 - speed * 24 - 2 }, strength: 0.8 })]);
    actions.push([26.0, (e) => e.triggerAmbient('streetVoices')]);
    actions.push([27.5, (e) => e.oneShot('wireCreak', { position: { x: 0, y: 7, z: z0 - speed * 27.5 - 3 } })]);
    actions.push([30.0, (e) => e.triggerAmbient('distantCar')]);
    actions.push([31.0, (e) => e.oneShot('canRoll', { position: { x: 1.2, y: 0, z: z0 - speed * 31 - 3 }, duration: 2.5 })]);
    actions.push([34.0, (e) => e.triggerAmbient('dog')]);
    let lamp = null;
    return {
      duration: dur,
      engineOpts: { autoEvents: false, ...(opts.engineOpts || {}) },
      setup(engine) {
        if (opts.solo) {
          for (const b of ['footsteps', 'emitters', 'oneShots', 'ambience', 'reverb']) if (!opts.solo.split('+').includes(b)) engine.setBusGain(b, 0);
        }
        engine.addEmitter({ type: 'hvac', position: { x: 2.5, y: 2.4, z: -10 } });
        lamp = engine.addEmitter({ type: 'lampBuzz', position: { x: -2.6, y: 4.5, z: -4 } });
        engine.addEmitter({ type: 'trickle', position: { x: 2.65, y: 0.1, z: -17 } });
        engine.addEmitter({ type: 'tv', position: { x: -2.8, y: 3.5, z: -13 } });
        engine.addEmitter({ type: 'drain', position: { x: 0.6, y: 0, z: -24 } });
        engine.addEmitter({ type: 'transformer', position: { x: -2.6, y: 3, z: -30 } });
        engine.addEmitter({ type: 'exhaust', position: { x: 2.0, y: 13, z: -36 } });
        engine.addEmitter({ type: 'voices', position: { x: 2.8, y: 4, z: -42 } });
        engine.addEmitter({ type: 'radio', position: { x: -2.8, y: 7, z: -50 } });
        engine.registerDumpster({ x: -2.0, y: 0.6, z: -22 });
        look(engine, { x: 0, y: WORLD.eye, z: z0 });
      },
      frame(t, dt, engine) {
        const z = z0 - speed * t;
        const yaw = 0.25 * Math.sin(t * 0.21);
        look(engine, { x: 0.05 * Math.sin(t * 6), y: WORLD.eye + 0.02 * Math.sin(t * 2 * Math.PI * stepHz), z }, { x: Math.sin(yaw), y: -0.05, z: -Math.cos(yaw) });
        engine.update(dt, stateAt(z, t));
        // flickering lamp: bursts of on/off
        if (lamp) {
          const burst = (t > 2.5 && t < 4.2) || (t > 11 && t < 11.8);
          const v = burst ? (Math.sin(t * 37) + Math.sin(t * 91) > 0.3 ? 1 : 0.05) : 0.92 + 0.08 * Math.sin(t * 13);
          lamp.setIntensity(v);
        }
      },
      actions,
    };
  },

  /** Footsteps on every surface (static listener), optional dry (no reverb) for structure analysis. */
  steps(opts = {}) {
    const surfaces = opts.surfaces ?? SURFACE_CYCLE;
    const per = opts.per ?? 4;
    const gap = opts.gap ?? 0.75;
    const dur = 0.5 + surfaces.length * per * gap + 1.5;
    const actions = [];
    let t = 0.5;
    let foot = 'L';
    const z = -40;
    const marks = [];
    for (const s of surfaces) {
      for (let i = 0; i < per; i++) {
        actions.push(...stepActions(t, s, foot, 0.75, z));
        marks.push({ t, surface: s });
        foot = foot === 'L' ? 'R' : 'L';
        t += gap;
      }
    }
    return {
      duration: dur,
      engineOpts: { ambience: false, autoEvents: false, clothing: false },
      setup(engine, api) {
        api.meta.marks = marks;
        if (opts.dry) engine.setBusGain('reverb', 0);
        look(engine, { x: 0, y: WORLD.eye, z });
      },
      frame(tt, dt, engine) { engine.update(dt, stateAt(z, tt, { distFront: opts.distFront ?? 55.5, distBack: opts.distBack ?? 48 })); },
      actions,
    };
  },

  /** Isolated slap-back: heel clicks while the front wall distance changes; flutter/diffuse muted. */
  slap(opts = {}) {
    const dists = opts.dists ?? [8, 20, 40, 70];
    const dur = dists.length * 2.5 + 1;
    const actions = [];
    const marks = [];
    let t = 1.0;
    for (const d of dists) {
      const tt = t;
      marks.push({ t: tt, distFront: d });
      actions.push([tt, (e) => e.footstep({ foot: 'L', part: 'heel', surface: 'concrete', intensity: 1, position: { x: 0, y: 0, z: 0 } })]);
      t += 2.5;
    }
    let cur = dists[0];
    return {
      duration: dur,
      engineOpts: { ambience: false, autoEvents: false, clothing: false },
      setup(engine, api) {
        api.meta.marks = marks;
        engine.sends.fsF.gain.value = 0;
        engine.sends.fsD.gain.value = 0;
        engine.acoustics.slapToDiffuse.gain.value = 0;
        engine.acoustics.crossFB.gain.value = 0;
        engine.acoustics.crossBF.gain.value = 0;
        look(engine, { x: 0, y: WORLD.eye, z: 0 });
      },
      frame(tt, dt, engine) {
        for (const m of marks) if (tt >= m.t - 0.7) cur = m.distFront;
        engine.update(dt, { time: tt, playerPos: { x: 0, y: 0, z: 0 }, distFront: cur, distBack: 400, enclosure: 1 });
      },
      actions,
    };
  },

  /** Each emitter type alone, listener stepping through distances. */
  emitters(opts = {}) {
    const types = opts.types ?? ['hvac', 'exhaust', 'transformer', 'lampBuzz', 'trickle', 'drain', 'tv', 'voices', 'radio'];
    const dists = opts.dists ?? [2, 5, 10, 20, 40];
    const seg = opts.seg ?? 2.5;
    const per = dists.length * seg;
    const dur = types.length * per + 0.5;
    const marks = [];
    const actions = [];
    let h = null;
    types.forEach((type, i) => {
      const t0 = 0.25 + i * per;
      actions.push([t0, (e) => {
        if (h) h.stop();
        h = e.addEmitter({ type, position: { x: 0, y: 1.62, z: -60 } });
      }]);
      dists.forEach((d, k) => marks.push({ t: t0 + k * seg, type, d }));
    });
    return {
      duration: dur,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = marks; api.meta.seg = seg; },
      frame(t, dt, engine) {
        let d = dists[0];
        for (const m of marks) if (t >= m.t) d = m.d;
        const z = -60 + d;
        look(engine, { x: 0, y: WORLD.eye, z });
        engine.update(dt, stateAt(z, t));
      },
      actions,
    };
  },

  /** Ambience bed only (no events, no emitters). */
  ambience(opts = {}) {
    const dur = opts.duration ?? 30;
    return {
      duration: dur,
      engineOpts: { autoEvents: false, ambientDripRate: 0.0001 },
      setup(engine, api) {
        look(engine, { x: 0, y: WORLD.eye, z: -30 });
        api.meta.wind = [];
        if (opts.windOnly) {
          const A = engine.ambience;
          A.modulateBed = () => {};
          for (const g of [A.rumbleG, A.hissG, A.humG]) { g.gain.cancelScheduledValues(0); g.gain.value = 0; }
        }
      },
      frame(t, dt, engine, api) {
        const tw = t + (opts.windOffset ?? 0);
        engine.update(dt, stateAt(-30, tw));
        api.meta.wind.push([t, engine.windAt(tw)]);
      },
      actions: [],
    };
  },

  /** Forced distant events, bed muted, to check their level/shape. */
  events(opts = {}) {
    const list = opts.list ?? [['siren', 0.5], ['train', 28], ['distantCar', 58], ['streetVoices', 68], ['dog', 76], ['distantCar', 80]];
    const dur = opts.duration ?? 88;
    return {
      duration: dur,
      engineOpts: { autoEvents: false },
      setup(engine, api) {
        engine.setAmbienceEnabled(false, false);
        api.meta.marks = list.map(([type, t]) => ({ type, t }));
        look(engine, { x: 0, y: WORLD.eye, z: -60 });
      },
      frame(t, dt, engine) { engine.update(dt, stateAt(-60, t)); },
      actions: list.map(([type, t]) => [t, (e) => e.triggerAmbient(type)]),
    };
  },

  /** Flickering lamp: steady, rapid flicker, off, strike, slow dim. Intensity log in meta. */
  lamp() {
    const pattern = (t) => {
      if (t < 2) return 1;
      if (t < 2.6) return Math.floor(t * 23) % 3 === 0 ? 0.02 : 1;
      if (t < 4) return 0;
      if (t < 6) return 1;
      if (t < 7.5) return 1 - (t - 6) / 1.5;
      if (t < 9) return 0;
      return 1;
    };
    let lamp = null;
    return {
      duration: 11,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) {
        lamp = engine.addEmitter({ type: 'lampBuzz', position: { x: 0.5, y: 3.5, z: -2 } });
        api.meta.intensity = [];
        look(engine, { x: 0, y: WORLD.eye, z: 0 });
      },
      frame(t, dt, engine, api) {
        const v = pattern(t);
        lamp.setIntensity(v);
        api.meta.intensity.push([t, v]);
        engine.update(dt, stateAt(0, t));
      },
      actions: [],
    };
  },

  /** Car passes behind the alley mouth with the listener near the fence, then deep in the alley. */
  carpass() {
    let z = 2;
    return {
      duration: 18,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = [{ t: 0.5, type: 'car z=2' }, { t: 9.5, type: 'car z=-25' }]; },
      frame(t, dt, engine) {
        z = t < 9 ? 2 : -25;
        look(engine, { x: 0, y: WORLD.eye, z });
        engine.update(dt, stateAt(z, t));
      },
      actions: [
        [0.5, (e) => e.oneShot('carPass', { from: { x: -50, y: 0.5, z: 14 }, to: { x: 50, y: 0.5, z: 14 }, duration: 7 })],
        [9.5, (e) => e.oneShot('carPass', { from: { x: 50, y: 0.5, z: 14 }, to: { x: -50, y: 0.5, z: 14 }, duration: 7 })],
      ],
    };
  },

  /**
   * Spray can, one or more caps in sequence: start, `hold` s at full flow, flow ramp down to feathering
   * (0.08) over `ramp` s, `feather` s of sputter, stop. opts: { caps, cap, hold, ramp, feather, gap, distance, dry }
   */
  spray(opts = {}) {
    const caps = opts.caps ?? [opts.cap ?? 'standard'];
    const hold = opts.hold ?? 1.5, ramp = opts.ramp ?? 1.5, feather = opts.feather ?? 0.5, gap = opts.gap ?? 1.4;
    const per = hold + ramp + feather + gap;
    const t0 = 0.4;
    const lis = { x: 0, y: WORLD.eye, z: -20 };
    const marks = [];
    const strokes = caps.map((cap, i) => {
      const a = t0 + i * per;
      marks.push({ t: a, type: cap }, { t: a + hold, type: 'ramp' }, { t: a + hold + ramp, type: 'feather' }, { t: a + hold + ramp + feather, type: 'stop' });
      const T = hold + ramp + feather;
      return {
        t0: a, t1: a + T, cap,
        flow: (u) => { const s = u * T; return s < hold ? 1 : s < hold + ramp ? 1 - (0.92 * (s - hold)) / ramp : 0.08; },
        dist: () => opts.distance ?? 0.25,
      };
    });
    const drive = sprayDriver(strokes, lis);
    return {
      duration: t0 + caps.length * per,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = marks; if (opts.dry) engine.setBusGain('reverb', 0); look(engine, lis); },
      frame(t, dt, engine) { engine.update(dt, stateAt(lis.z, t)); drive(t, dt, engine); },
      actions: [],
    };
  },

  /** Distance cues (standard cap, full flow, one stroke): 25 cm -> 6 cm (splatter) -> into the air -> 25 cm. */
  sprayDistance(opts = {}) {
    const lis = { x: 0, y: WORLD.eye, z: -20 };
    const cap = opts.cap ?? 'standard';
    const seg = 1.2;
    const t0 = 0.4;
    const dists = [0.25, 0.06, Infinity, 0.25];
    const marks = dists.map((d, i) => ({ t: t0 + i * seg, type: String(d) }));
    const drive = sprayDriver([{ t0, t1: t0 + dists.length * seg, cap, dist: (u) => dists[Math.min(dists.length - 1, Math.floor(u * dists.length))] }], lis);
    return {
      duration: t0 + dists.length * seg + 1.2,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = marks; if (opts.dry) engine.setBusGain('reverb', 0); look(engine, lis); },
      frame(t, dt, engine) { engine.update(dt, stateAt(lis.z, t)); drive(t, dt, engine); },
      actions: [],
    };
  },

  /** Shaking the can: one canRattle per stroke reversal (~7/s) for `len` s, strength rising then easing. */
  rattle(opts = {}) {
    const len = opts.len ?? 1.2;
    const t0 = 0.4;
    const lis = { x: 0, y: WORLD.eye, z: -20 };
    let rs = opts.seed ?? 777;
    const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
    const actions = [];
    const marks = [];
    for (let t = t0; t < t0 + len; t += (1 / 7) * (0.85 + 0.3 * rnd())) {
      const u = (t - t0) / len;
      const s = Math.min(1, 0.45 + 0.9 * u) * (u > 0.8 ? 0.85 : 1) * (0.85 + 0.15 * rnd());
      actions.push([t, (e) => e.canRattle(s)]);
      marks.push({ t, type: s.toFixed(2) });
    }
    return {
      duration: t0 + len + (opts.tail ?? 1.0),
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = marks; if (opts.dry) engine.setBusGain('reverb', 0); look(engine, lis); },
      frame(t, dt, engine) { engine.update(dt, stateAt(lis.z, t)); },
      actions,
    };
  },

  /** Handling: equip, cap swap, menu open/close, holster (or opts.list = [[method, t, arg], ...]). */
  canfx(opts = {}) {
    const list = opts.list ?? [['canEquip', 0.3], ['capChange', 1.6], ['menuOpen', 2.4, true], ['menuOpen', 3.0, false], ['canHolster', 3.7]];
    const lis = { x: 0, y: WORLD.eye, z: -20 };
    const last = Math.max(...list.map((a) => a[1]));
    return {
      duration: opts.duration ?? last + 1.3,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = list.map(([fn, t, arg]) => ({ t, type: fn + (arg === undefined ? '' : '(' + arg + ')') })); if (opts.dry) engine.setBusGain('reverb', 0); look(engine, lis); },
      frame(t, dt, engine) { engine.update(dt, stateAt(lis.z, t)); },
      actions: list.map(([fn, t, arg]) => [t, (e) => e[fn](arg)]),
    };
  },

  /** In context (levels): bed, a lamp, a few steps, then equip, shake, two strokes, holster. */
  sprayMix(opts = {}) {
    const lis = { x: 0, y: WORLD.eye, z: -20 };
    const actions = [];
    for (let k = 0; k < 4; k++) actions.push(...stepActions(0.5 + k * 0.53, 'asphalt', k % 2 ? 'R' : 'L', 0.7, -20));
    actions.push([2.8, (e) => e.canEquip()]);
    for (let k = 0; k < 9; k++) actions.push([3.7 + k * 0.14, (e) => e.canRattle(0.6 + 0.04 * k)]);
    actions.push([9.6, (e) => e.canHolster()]);
    const drive = sprayDriver([
      { t0: 5.3, t1: 6.9, cap: opts.cap ?? 'standard', flow: () => 0.8 },
      { t0: 7.3, t1: 8.9, cap: opts.cap ?? 'standard', flow: () => 0.8, dist: (u) => 0.3 - 0.22 * u },
    ], lis);
    return {
      duration: 11,
      engineOpts: { autoEvents: false },
      setup(engine, api) {
        api.meta.marks = [{ t: 0.5, type: 'steps' }, { t: 2.8, type: 'equip' }, { t: 3.7, type: 'shake' }, { t: 5.3, type: 'spray' }, { t: 7.3, type: 'spray (closer)' }, { t: 9.6, type: 'holster' }];
        engine.addEmitter({ type: 'lampBuzz', position: { x: -2.6, y: 4.5, z: -23 } });
        look(engine, lis);
      },
      frame(t, dt, engine) { engine.update(dt, stateAt(lis.z, t)); drive(t, dt, engine); },
      actions,
    };
  },

  /** Every one-shot type near the listener. */
  oneshots(opts = {}) {
    const list = opts.list ?? [
      ['drip', { surface: 'water' }], ['drip', { surface: 'metal' }], ['drip', { surface: 'ground' }], ['drip', { surface: 'plastic' }],
      ['canKick', { strength: 0.9 }], ['canRoll', { duration: 2.5 }], ['bottleKick', { strength: 0.9 }], ['paperRustle', { strength: 0.8 }],
      ['plasticRustle', { strength: 0.8 }], ['garbageShift', {}], ['doorRattle', {}], ['wireCreak', {}],
      ['carPass', { from: { x: -45, y: 0.5, z: 14 }, to: { x: 45, y: 0.5, z: 14 }, duration: 6 }],
    ];
    const gap = opts.gap ?? 3;
    const dur = list.length * gap + 6;
    const marks = [];
    const actions = list.map(([type, p], i) => {
      const t = 0.5 + i * gap;
      marks.push({ t, type, surface: p.surface });
      return [t, (e) => {
        const pos = { x: 1.0 * (i % 2 ? 1 : -1), y: 0, z: -2 };
        e.oneShot(type, { position: pos, ...p });
      }];
    });
    return {
      duration: dur,
      engineOpts: { ambience: false, autoEvents: false },
      setup(engine, api) { api.meta.marks = marks; look(engine, { x: 0, y: WORLD.eye, z: 2 }); },
      frame(t, dt, engine) { engine.update(dt, stateAt(2, t)); },
      actions,
    };
  },
};

/** Return the engine's impulse responses (for analysis). */
export async function getImpulseResponses(o = {}) {
  const OAC = globalThis.OfflineAudioContext;
  const ctx = new OAC({ numberOfChannels: 2, length: 128, sampleRate: o.sampleRate ?? 48000 });
  const engine = new AudioEngine({ context: ctx, seed: o.seed ?? 1337, autoEvents: false });
  await engine.whenFullyLoaded();
  const B = engine.buffers;
  const ch = (b) => [b.getChannelData(0), b.getChannelData(1)];
  return { sampleRate: ctx.sampleRate, flutter: ch(B.flutterIR), diffuse: ch(B.diffuseIR), city: ch(B.cityIR), arrivals: engine.debug.flutterArrivals };
}
