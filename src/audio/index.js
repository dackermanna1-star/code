// =============================================================================
// AUDIO MODULE - the complete soundscape of the flight.
//
//  graph:
//    engines ─┐ (engineVolume) → zone muffle ┐
//    ambience ┤ (ambienceVolume) → zone muffle ┼→ cabinMix → headphone isolation ─┐
//    effects ─┘ (effectsVolume) + room reverb ┘                                     ├→ pause duck → master → compressor → limiter → out
//    pa (announcementVolume) → ceiling speakers (near + delayed far) ───────────────┘
//    ui ─────────────────────────────────────────────────────────── (not ducked) ──→ master
//    ifeBus → ifeVolume ─────────────────── (headphones, not ducked/isolated) ────→ master
//
//  * procedural aircraft sounds: aircraft.js  (driven by app.flight.state)
//  * foley vocabulary (play(name, opts)): foley.js, synthesised & cached
//  * PA announcements + chimes: announcer.js ; boarding music: music.js
//  * listener = app.camera (aircraft-local frame), updated at priority 70
//  * zone acoustics (player:zone): lavs (small bright room, engines muffled,
//    extraction fan), galley (equipment hum, cart rattles), cabin
//  * headphones (IFE in use): cabin noise -11 dB + low-pass (passive isolation)
//
// API: { unlock(), play(name, {position, volume, rate, surface}), context, ifeBus,
//        connectMedia(el), setHeadphones(on), say(text, speaker), chime(type),
//        buses, debug: { renderSnapshot, renderFoley, analyzeAnnouncement, stats } }
// =============================================================================
import { NoiseBank, makeIR, clamp01 } from './dsp.js';
import { FOLEY, renderFoley } from './foley.js';
import { AircraftSound } from './aircraft.js';
import { Announcer } from './announcer.js';
import { BoardingMusic } from './music.js';
import { analyzeBuffer } from './analysis.js';
import { DOORS } from '../core/constants.js';

const CHIME_FOR = { pa: 'chime_pa', seatbelt: 'chime_seatbelt', call: 'chime_call', triple: 'chime_triple' };
const BIG_BUSES = new Set(['engines', 'ambience']);
const MAX_VOICES = 32;

export async function init(app) {
  let sys;
  try {
    sys = new AudioSystem(app);
  } catch (e) {
    console.warn('[audio] Web Audio unavailable - running silent', e);
    return silentApi();
  }
  return sys.api();
}

function silentApi() {
  const noop = () => {};
  return { stub: false, silent: true, unlock: noop, play: noop, context: null, ifeBus: null, connectMedia: noop, setHeadphones: noop, say: noop, chime: noop };
}

class AudioSystem {
  constructor(app) {
    this.app = app;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no AudioContext');
    this.ctx = new AC({ latencyHint: 'interactive' });
    // (it usually starts 'suspended' until the user gesture of the Board button)
    this.foleyCache = new Map();
    this.lastVariant = new Map();
    this.voices = 0;
    this.zone = null;
    this.headphones = false;
    this.pushback = false;
    this.ext = 0;
    this._lastDoorSound = -1e9;
    this._pendingDoor = null;
    this._listenerPos = { x: 0, y: 1.2, z: 0 };
    this._galleyT = 0;
    this._buildGraph();
    this.bank = new NoiseBank(this.ctx, 6);
    this.aircraft = new AircraftSound(this.ctx, this.bank, { engines: this.engines, ambience: this.ambience, effects: this.effects }, (n, o) => this.shot(n, o));
    this.announcer = new Announcer({ app, ctx: this.ctx, paVoice: this.paVoice, playPa: (n, d, v, r) => this.playPa(n, d, v, r) });
    this.music = new BoardingMusic(this.ctx, this.paMusic, this.bank);
    this._applySettings();
    this._wire();
    app.addUpdate((dt) => this.update(dt), 70, 'audio');
  }

  // ===================================================================== graph
  _buildGraph() {
    const ctx = this.ctx, G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q = 0.707, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
    // master chain: gentle bus compression then a brick-wall-ish limiter
    this.master = G(1);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.knee.value = 10; this.comp.ratio.value = 2.5; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.1;
    this.master.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(ctx.destination);
    // ducking (pause menus) and headphone isolation
    this.duck = G(1); this.duck.connect(this.master);
    this.hpLp = F('lowpass', 20000, 0.5); this.hpGain = G(1);
    this.cabinMix = G(1); this.cabinMix.connect(this.hpLp); this.hpLp.connect(this.hpGain); this.hpGain.connect(this.duck);
    // category buses
    this.engVol = G(1); this.ambVol = G(1); this.fxVol = G(1);
    this.engines = G(1); this.ambience = G(1); this.effects = G(1);
    this.engLp = F('lowpass', 20000, 0.5); this.engZone = G(1);
    this.ambLp = F('lowpass', 20000, 0.5); this.ambZone = G(1);
    this.engines.connect(this.engLp); this.engLp.connect(this.engZone); this.engZone.connect(this.engVol); this.engVol.connect(this.cabinMix);
    this.ambience.connect(this.ambLp); this.ambLp.connect(this.ambZone); this.ambZone.connect(this.ambVol); this.ambVol.connect(this.cabinMix);
    this.effects.connect(this.fxVol); this.fxVol.connect(this.cabinMix);
    // room reverbs (sends from effects; the lav also gets the ambience)
    this.cabinVerb = ctx.createConvolver(); this.cabinVerb.buffer = makeIR(ctx, { decay: 0.32, length: 0.5, bright: 3500, seed: 5, early: [[0.006, 0.4], [0.011, 0.25], [0.019, 0.15]] });
    this.lavVerb = ctx.createConvolver(); this.lavVerb.buffer = makeIR(ctx, { decay: 0.28, length: 0.45, bright: 7000, seed: 9, predelay: 0.002, early: [[0.003, 0.6], [0.005, 0.45], [0.008, 0.35], [0.012, 0.25]] });
    this.cabinSend = G(0.12); this.lavSend = G(0); this.lavAmbSend = G(0);
    this.effects.connect(this.cabinSend); this.cabinSend.connect(this.cabinVerb); this.cabinVerb.connect(this.fxVol);
    this.effects.connect(this.lavSend); this.lavSend.connect(this.lavVerb); this.lavVerb.connect(this.fxVol);
    this.ambZone.connect(this.lavAmbSend); this.lavAmbSend.connect(this.lavVerb);
    // PA system: voice (pre-processed) + chimes/music (speaker colouration) -> ceiling speakers
    this.paVol = G(1);
    this.paVoice = G(1.7); this.paMusic = G(1);
    this.paChime = G(1);
    this.paSpk = F('highpass', 170, 0.7);
    const spk2 = F('lowpass', 7000, 0.6), spk3 = F('peaking', 2800, 1.0, 2.5);
    this.paMusic.connect(this.paSpk); this.paChime.connect(this.paSpk); this.paSpk.connect(spk2); spk2.connect(spk3); spk3.connect(this.paVol);
    this.paVoice.connect(this.paVol);
    this.paDuckExt = G(1);
    const mkSpk = (delay, gain) => {
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 0.0001;
      const d = ctx.createDelay(0.2); d.delayTime.value = delay; const g = G(gain);
      this.paVol.connect(d); d.connect(g); g.connect(p); p.connect(this.paDuckExt);
      return p;
    };
    this.paSpeakers = [mkSpk(0, 0.85), mkSpk(0.021, 0.42), mkSpk(0.043, 0.25)];
    this.paDuckExt.connect(this.duck);
    // UI + IFE (not ducked by menus, not isolated by headphones)
    this.ui = G(1); this.ui.connect(this.master);
    this.ifeBus = G(1); this.ifeVol = G(0.8); this.ifeBus.connect(this.ifeVol); this.ifeVol.connect(this.master);
    this.mediaNodes = new WeakMap();
  }

  _applySettings() {
    const s = this.app.settings, now = this.ctx.currentTime;
    const v = (k, d = 1) => { const x = Number(s.get(k)); return Number.isFinite(x) ? clamp01(x) : d; };
    const mute = this.app.debug?.mute ? 0 : 1;
    const set = (g, x) => g.gain.setTargetAtTime(x, now, 0.05);
    set(this.master, v('masterVolume', 0.9) * mute);
    set(this.engVol, v('engineVolume')); set(this.ambVol, v('ambienceVolume')); set(this.fxVol, v('effectsVolume'));
    set(this.paVol, v('announcementVolume')); set(this.ifeVol, v('ifeVolume', 0.8));
  }

  _wire() {
    const ev = this.app.events, on = (n, f) => ev.on(n, (p) => { try { f(p || {}); } catch (e) { console.warn('[audio]', n, e); } });
    this.app.settings.onChange?.(() => this._applySettings());
    on('app:start', () => this.unlock());
    on('input:mousedown', () => { if (this.app.started) this.unlock(); });
    on('input:keydown', () => { if (this.app.started) this.unlock(); });
    on('cabin:announce', (p) => this.announcer.request(p.id));
    on('cabin:announceCancel', () => this.announcer.cancel());
    on('cabin:chime', (p) => this.chime(p.type));
    on('flight:touchdown', (p) => this.aircraft.touchdown(p.intensity ?? 0.3));
    on('flight:reverse', (p) => { if (!p.instant) this.aircraft.reverser(p.on); });
    on('flight:spoilers', (p) => this.aircraft.spoilers(p));
    on('flight:pushback', (p) => { this.pushback = p.state === 'start'; });
    on('flight:phase', (p) => { if (p.phase !== 'pushback') this.pushback = false; });
    on('flight:doors', (p) => {
      if (p.instant) return;
      // the galley module animates the L1 door and should call play('cabin_door'); fall back if it does not
      clearTimeout(this._pendingDoor);
      this._pendingDoor = setTimeout(() => {
        if (this.app.time - this._lastDoorSound > 3) this.play('cabin_door', { position: { x: -1.7, y: 1.0, z: DOORS.L1.z }, volume: 0.9 });
      }, 1500);
    });
    on('player:zone', (p) => this.setZone(p.zone));
    on('ife:focus', (p) => this.setHeadphones(!!p.on));
    on('flight:skip', () => { this.aircraft.hyd.prevGear = null; });
    on('flight:restart', () => { this.aircraft.hyd.prevGear = null; });
  }

  // ===================================================================== public bits
  unlock() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* */ }
    }
    if (!this._prefetched) {
      this._prefetched = true;
      this.announcer.prefetchAll();
      this._warmFoley();
    }
    return ctx.state;
  }

  /** Lazily synthesise foley buffers in idle slices so the first use never hitches. */
  _warmFoley() {
    const names = Object.keys(FOLEY);
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < names.length && performance.now() - t0 < 6) { const n = names[i++]; for (let v = 0; v < Math.min(2, FOLEY[n].variants); v++) this._buffer(n, v); }
      if (i < names.length) setTimeout(step, 30);
    };
    setTimeout(step, 200);
  }

  _buffer(name, variant) {
    let list = this.foleyCache.get(name);
    if (!list) { list = []; this.foleyCache.set(name, list); }
    if (!list[variant]) list[variant] = renderFoley(this.ctx, name, variant);
    return list[variant];
  }

  _pickVariant(name) {
    const n = FOLEY[name].variants || 1;
    if (n <= 1) return 0;
    let v = Math.floor(Math.random() * n);
    if (v === this.lastVariant.get(name)) v = (v + 1) % n;
    this.lastVariant.set(name, v);
    return v;
  }

  /** Foley / one-shot player. Unknown names are ignored. */
  play(name, opts = {}) {
    try {
      if (typeof name !== 'string') return null;
      if (name.startsWith('chime_')) { this.playPa(name, 0, opts.volume ?? 1); return null; }
      if (name === 'cabin_door') this._lastDoorSound = this.app.time;
      let n = name;
      if (name === 'footstep' && opts.surface && opts.surface !== 'carpet') n = 'footstep_vinyl';
      if (!FOLEY[n]) return null;
      return this.shot(n, opts);
    } catch (e) { console.warn('[audio] play failed', name, e); return null; }
  }

  shot(name, { position, volume = 1, rate = 1, bus = 'effects', model, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (ctx.state !== 'running' || this.voices >= MAX_VOICES) return null;
    const def = FOLEY[name];
    if (!def) return null;
    const buf = this._buffer(name, this._pickVariant(name));
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, Number(rate) || 1));
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(3, (Number(volume) || 0) * def.level));
    src.connect(g);
    const dest = bus === 'engines' ? this.engines : bus === 'ambience' ? this.ambience : bus === 'ui' ? this.ui : this.effects;
    let p = null;
    if (position && bus !== 'ui' && Number.isFinite(position.x)) {
      p = ctx.createPanner();
      const big = BIG_BUSES.has(bus) || (model && model !== 'HRTF');
      p.panningModel = big ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse'; p.refDistance = big ? 3 : 0.9; p.rolloffFactor = big ? 0.8 : 1.15; p.maxDistance = 60;
      if (p.positionX) { p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z; } else p.setPosition(position.x, position.y, position.z);
      g.connect(p); p.connect(dest);
    } else g.connect(dest);
    this.voices++;
    src.onended = () => { this.voices--; try { src.disconnect(); g.disconnect(); p && p.disconnect(); } catch { /* */ } };
    src.start(ctx.currentTime + Math.max(0, delay));
    return src;
  }

  /** Play a sound through the PA ceiling speakers (chimes, handset clicks). */
  playPa(name, delay = 0, volume = 1, rate = 1) {
    const ctx = this.ctx;
    if (ctx.state !== 'running' || !FOLEY[name]) return;
    const buf = this._buffer(name, this._pickVariant(name));
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate;
    g.gain.value = volume * FOLEY[name].level;
    s.connect(g); g.connect(this.paChime);
    s.onended = () => { try { s.disconnect(); g.disconnect(); } catch { /* */ } };
    s.start(ctx.currentTime + delay);
  }

  chime(type) {
    const n = CHIME_FOR[type] || (FOLEY[type] ? type : null);
    if (n) this.playPa(n, 0, 1);
  }

  connectMedia(el) {
    if (!el) return null;
    let node = this.mediaNodes.get(el);
    if (!node) {
      try { node = this.ctx.createMediaElementSource(el); node.connect(this.ifeBus); this.mediaNodes.set(el, node); } catch (e) { console.warn('[audio] connectMedia failed', e); return null; }
    }
    return node;
  }

  setHeadphones(on) {
    on = !!on;
    if (on === this.headphones) return;
    this.headphones = on;
    const now = this.ctx.currentTime;
    this.hpLp.frequency.setTargetAtTime(on ? 1100 : 20000, now, on ? 0.18 : 0.3);
    this.hpGain.gain.setTargetAtTime(on ? 0.28 : 1, now, on ? 0.18 : 0.3);
    if (on) this.shot('switch_click', { volume: 0.25, rate: 0.7, bus: 'ui' });
  }

  setZone(zone) {
    this.zone = zone;
    const now = this.ctx.currentTime, lav = typeof zone === 'string' && zone.startsWith('lav');
    const galley = typeof zone === 'string' && zone.startsWith('galley');
    const T = (p, v) => p.setTargetAtTime(v, now, 0.25);
    T(this.engLp.frequency, lav ? 650 : 20000); T(this.engZone.gain, lav ? 0.5 : 1);
    T(this.ambLp.frequency, lav ? 1400 : 20000); T(this.ambZone.gain, lav ? 0.62 : 1);
    T(this.lavSend.gain, lav ? 0.42 : 0); T(this.lavAmbSend.gain, lav ? 0.08 : 0);
    T(this.cabinSend.gain, lav ? 0.02 : galley ? 0.2 : 0.12);
  }

  // ===================================================================== frame
  update(dt) {
    const app = this.app, ctx = this.ctx;
    // listener follows the active camera (aircraft-local)
    const cin = app.view?.mode === 'cinematic';
    const cam = cin && app.outsideCamera ? app.outsideCamera : app.camera;
    this.ext += ((cin ? 1 : 0) - this.ext) * Math.min(1, dt * 2);
    if (cam) {
      cam.updateMatrixWorld();
      const e = cam.matrixWorld.elements, L = ctx.listener;
      const x = e[12], y = e[13], z = e[14];
      if (Number.isFinite(x + y + z)) {
        this._listenerPos.x = x; this._listenerPos.y = y; this._listenerPos.z = z;
        if (L.positionX) {
          L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
          L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10];
          L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
        } else { L.setPosition(x, y, z); L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]); }
        // PA ceiling speakers around the listener
        const pz = [z - 0.45, z + 2.2, z - 3.1];
        for (let i = 0; i < 3; i++) {
          const p = this.paSpeakers[i];
          if (p.positionX) { p.positionX.value = x * 0.3; p.positionY.value = 2.05; p.positionZ.value = pz[i]; } else p.setPosition(x * 0.3, 2.05, pz[i]);
        }
      }
    }
    const now = ctx.currentTime;
    // pause duck (menus)
    const duckT = app.paused ? 0.2 : 1;
    if (this._duck !== duckT) { this._duck = duckT; this.duck.gain.setTargetAtTime(duckT, now, 0.25); }
    const paExt = 1 - 0.85 * this.ext;
    if (Math.abs((this._paExt ?? 1) - paExt) > 0.01) { this._paExt = paExt; this.paDuckExt.gain.setTargetAtTime(paExt, now, 0.2); }

    const st = app.flight?.state;
    if (!st) return;
    if (ctx.state === 'running') {
      try {
        this.aircraft.update(st, Math.min(dt, 0.1), { listener: this._listenerPos, zone: this.zone, exterior: this.ext, pushback: this.pushback });
      } catch (e) { if (!this._warned) { this._warned = true; console.warn('[audio] aircraft update', e); } }
      // galley: inserts and carts clink a little now and then when the aircraft moves
      if (typeof this.zone === 'string' && this.zone.startsWith('galley') && !st.onGround) {
        this._galleyT -= dt;
        if (this._galleyT <= 0) {
          this._galleyT = 3 + Math.random() * 7 / (1 + 4 * (st.turbulence || 0));
          const L = this._listenerPos;
          this.shot('rattle_cart', { position: { x: L.x + (Math.random() - 0.5), y: 0.7, z: L.z + (Math.random() < 0.5 ? -0.7 : 0.7) }, volume: 0.2 + 0.2 * Math.random(), model: 'HRTF' });
        }
      }
    }
    this.announcer.update();
    const speaking = this.announcer.active;
    this.music.update(!!st.cabin?.boardingMusic && !cin, speaking ? 0.25 : 1);
  }

  // ===================================================================== debug / verification
  /**
   * Render the procedural aircraft soundscape for a (partial) flight state offline and analyse it.
   * state: overrides merged on top of a default flight state; opts.listener {x,y,z}; opts.seconds
   */
  async renderSnapshot(state = {}, { seconds = 3, listener = { x: -1.3, y: 1.15, z: 0.5 }, zone = 'economy', from = 1.2, raw = false, only = null } = {}) {
    const sr = 48000, oc = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
    const out = oc.createGain(); out.connect(oc.destination);
    const bus = { engines: oc.createGain(), ambience: oc.createGain(), effects: oc.createGain() };
    for (const k in bus) { bus[k].connect(out); if (only && !only.includes(k)) bus[k].gain.value = 0; }
    const L = oc.listener;
    if (L.positionX) { L.positionX.value = listener.x; L.positionY.value = listener.y; L.positionZ.value = listener.z; L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1; }
    else L.setPosition(listener.x, listener.y, listener.z);
    const bank = new NoiseBank(oc, 6);
    const ac = new AircraftSound(oc, bank, bus, () => {});
    const st = mergeState(this.app.flight?.state, state);
    ac.update(st, 0, { listener, zone, snap: true, exterior: state.exterior || 0, pushback: !!state.pushback });
    const buf = await oc.startRendering();
    const res = analyzeBuffer(buf, from);
    if (raw) res.buffer = buf;
    return res;
  }

  /** Render one foley sound offline and analyse it. */
  async renderFoley(name, variant = 0) {
    const sr = 48000, def = FOLEY[name];
    if (!def) return null;
    const oc = new OfflineAudioContext(1, Math.floor(sr * def.dur), sr);
    const b = renderFoley(oc, name, variant);
    const r = analyzeBuffer(b, 0);
    r.level = def.level;
    return r;
  }

  async analyzeAnnouncement(id) {
    const b = await this.announcer.load(id);
    if (!b) return { id, missing: true };
    const meta = this.announcer.index[id] || {};
    const r = analyzeBuffer(b, 0);
    return { id, decoded: +b.duration.toFixed(3), index: meta.duration, sentences: meta.sentences?.length, rmsDb: r.rmsDb, peakDb: r.peakDb, centroid: r.centroid, nan: r.nan };
  }

  api() {
    const s = this;
    return {
      unlock: () => s.unlock(),
      play: (name, opts) => s.play(name, opts),
      get context() { return s.ctx; },
      ifeBus: s.ifeBus,
      connectMedia: (el) => s.connectMedia(el),
      setHeadphones: (on) => s.setHeadphones(on),
      get headphones() { return s.headphones; },
      say: (text, speaker) => s.announcer.say(text, speaker),
      chime: (type) => s.chime(type),
      announce: (id) => s.announcer.request(id),
      setZone: (z) => s.setZone(z),
      buses: { master: s.master, engines: s.engines, ambience: s.ambience, effects: s.effects, pa: s.paVol, ui: s.ui, ife: s.ifeBus },
      foleyNames: Object.keys(FOLEY),
      debug: {
        renderSnapshot: (st, o) => s.renderSnapshot(st, o),
        renderFoley: (n, v) => s.renderFoley(n, v),
        analyzeAnnouncement: (id) => s.analyzeAnnouncement(id),
        stats: () => ({ state: s.ctx.state, voices: s.voices, zone: s.zone, headphones: s.headphones, announcing: s.announcer.cur?.id || null, queue: [...s.announcer.queue] }),
        system: s,
      },
    };
  }
}

/** Deep-ish merge of a partial state onto a copy of the live state (engines array, cabin object). */
function mergeState(base, over) {
  const st = { ...(base || {}) };
  st.engines = (base?.engines || [{}, {}]).map((e) => ({ ...e }));
  st.cabin = { ...(base?.cabin || {}) };
  st.gForce = { x: 0, y: 1, z: 0 };
  for (const k in over) {
    if (k === 'engines' && Array.isArray(over.engines)) over.engines.forEach((e, i) => Object.assign(st.engines[i] || (st.engines[i] = {}), e));
    else if (k === 'n1') st.engines.forEach((e) => { e.n1 = over.n1; e.n2 = 60 + (over.n1 - 20.5) * 0.48; e.running = over.n1 > 15; e.starting = false; });
    else if (k === 'cabin') Object.assign(st.cabin, over.cabin);
    else st[k] = over[k];
  }
  return st;
}

