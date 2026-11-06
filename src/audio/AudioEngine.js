// Dead County audio — AudioEngine (public API, see docs/ARCHITECTURE.md "Audio").
//
// Everything is synthesised procedurally with the Web Audio API. On init() the engine builds the mix
// graph (buses, shared convolution reverbs, safety limiter) and starts rendering every sound recipe
// (several variants each) into AudioBuffers with OfflineAudioContext in the background. Playback is
// then cheap: buffer source → gain → [air-absorption lowpass → panner] → bus (+ reverb send).
//
// Mix graph:
//   sfxBus ─┐                                   ┌─ innerBus (player body sounds, heartbeat, tinnitus)
//   ambBus ─┼─ worldIn → worldLP → worldDuck ─┐ ├─ uiBus
//   reverbs ┘  (underwater / deafness muffle) ├─┼─ musicBus (+ music reverb)
//   outdoorBus → outdoorLP → ambBus           └─┴→ master → limiter → destination
//   sends: sfxSend / ambSend → revSend → outdoor IR (+) indoor IR → reverb return → worldIn

import { SOUND_DEFS, SOUND_NAMES, EXTRA_SOUND_NAMES, ALL_RENDER_NAMES, renderSound, PIANO_SAMPLES } from './sounds.js';
import { makeImpulseResponse, clamp, lerp, makeBuffer } from './dsp.js';
import { MusicSystem } from './music.js';
import { AmbienceSystem } from './ambience.js';

export { SOUND_NAMES, EXTRA_SOUND_NAMES };

const MAX_VOICES = 48;
const MAX_LOOPS = 24;
const NOOP = Object.freeze({ stop() {}, get playing() { return false; } });
const NOOP_LOOP = Object.freeze({ setVolume() {}, setPos() {}, setPitch() {}, stop() {}, get playing() { return false; } });
const SPEED_OF_SOUND = 343;

const vgain = (v) => {
  v = clamp(Number.isFinite(v) ? v : 1, 0, 1);
  return v * v; // perceptual slider curve
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map(); // name -> AudioBuffer[]
    this.volumes = { master: 1, sfx: 1, music: 0.8, ambience: 0.9 };
    this.ambience = {};
    this.mood = 'none';
    this.listener = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
    this.voices = [];
    this.loops = new Set();
    this.hrtf = true;
    this.stats = { rendered: 0, total: 0, renderMs: 0, bytes: 0, failed: [] };
    this._warned = new Set();
    this._queue = [];
    this._workers = 0;
    this._lastVariant = new Map();
    this._indoor = 0;
    this._debug = false;
  }

  // ===========================================================================================
  // lifecycle
  // ===========================================================================================
  /** Create the AudioContext (call from a user gesture). Safe to call repeatedly (resumes). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      try {
        ctx = new AC();
      } catch (e2) {
        console.warn('[audio] cannot create AudioContext', e2);
        return;
      }
    }
    this.ctx = ctx;
    this.baseRate = ctx.sampleRate > 50000 ? 48000 : ctx.sampleRate;
    try {
      this._buildGraph();
      this.music = new MusicSystem(this);
      this.amb = new AmbienceSystem(this);
    } catch (e) {
      console.warn('[audio] graph setup failed', e);
      this.ctx = null;
      try {
        ctx.close();
      } catch (e2) {
        /* ignore */
      }
      return;
    }
    this.setVolumes(this.volumes);
    this.amb.set(this.ambience);
    this.setListener(this.listener, { x: this.listener.fx, y: this.listener.fy, z: this.listener.fz });
    this.music.setMood(this.mood);
    this._startRendering();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  _gain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -5;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.2;
    // final safety: soft clipper (linear to 0.75, smoothly saturating to ±1) – the compressor alone overshoots
    this.clipper = ctx.createWaveShaper();
    const N = 4096, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = ((i / (N - 1)) * 2 - 1) * 2; // curve spans inputs ±2 (0.5 pre-gain below)
      const ax = Math.abs(x);
      curve[i] = Math.sign(x) * (ax <= 0.75 ? ax : 0.75 + 0.25 * Math.tanh((ax - 0.75) / 0.25));
    }
    this.clipper.curve = curve;
    const clipPre = this._gain(0.5, this.clipper);
    this.limiter.connect(clipPre);
    this.clipper.connect(ctx.destination);
    this.master = this._gain(1, this.limiter);

    this.worldDuck = this._gain(1, this.master);
    this.worldLP = ctx.createBiquadFilter();
    this.worldLP.type = 'lowpass';
    this.worldLP.frequency.value = 20000;
    this.worldLP.Q.value = 0.6;
    this.worldLP.connect(this.worldDuck);
    this.worldIn = this._gain(1, this.worldLP);

    this.sfxBus = this._gain(1, this.worldIn);
    this.ambBus = this._gain(1, this.worldIn);
    this.outdoorLP = ctx.createBiquadFilter();
    this.outdoorLP.type = 'lowpass';
    this.outdoorLP.frequency.value = 20000;
    this.outdoorLP.Q.value = 0.5;
    this.outdoorLP.connect(this.ambBus);
    this.outdoorBus = this._gain(1, this.outdoorLP);
    this.innerBus = this._gain(1, this.master);
    this.uiBus = this._gain(1, this.master);
    this.musicBus = this._gain(1, this.master);
    this.musicIn = this._gain(0.55, this.musicBus);

    // shared world reverb: outdoor (long, dark, scattered reflections) <-> indoor (short, bright)
    const sr = Math.min(ctx.sampleRate, 48000);
    this.revReturn = this._gain(1, this.worldIn);
    this.convOut = ctx.createConvolver();
    this.convOut.normalize = false;
    this.convOut.buffer = makeImpulseResponse(sr, {
      dur: 3.2, rt60: 2.6, predelay: 0.025, lp0: 5200, lp1: 700, hp: 160, seed: 11, gain: 0.55,
      early: [[0.07, 0.35], [0.12, 0.28], [0.19, 0.24], [0.31, 0.16], [0.46, 0.1], [0.62, 0.06]],
    });
    this.convIn = ctx.createConvolver();
    this.convIn.normalize = false;
    this.convIn.buffer = makeImpulseResponse(sr, {
      dur: 1.1, rt60: 0.65, predelay: 0.004, lp0: 9000, lp1: 2600, hp: 120, seed: 23, gain: 0.5,
      early: [[0.006, 0.6], [0.0105, 0.5], [0.016, 0.42], [0.023, 0.35], [0.031, 0.3], [0.041, 0.24], [0.055, 0.16]],
    });
    this.convOut.connect(this.revReturn);
    this.convIn.connect(this.revReturn);
    this.revOutG = this._gain(1, this.convOut);
    this.revInG = this._gain(0, this.convIn);
    this.revSend = this._gain(1);
    this.revSend.connect(this.revOutG);
    this.revSend.connect(this.revInG);
    this.sfxSend = this._gain(1, this.revSend);
    this.ambSend = this._gain(1, this.revSend);

    // music reverb (lush hall)
    this.musicConv = ctx.createConvolver();
    this.musicConv.normalize = false;
    this.musicConv.buffer = makeImpulseResponse(sr, {
      dur: 4.6, rt60: 3.8, predelay: 0.03, lp0: 7000, lp1: 1400, hp: 90, seed: 37, gain: 0.6,
      early: [[0.021, 0.3], [0.033, 0.25], [0.047, 0.2], [0.069, 0.15]],
    });
    this.musicConv.connect(this.musicBus);
    this.musicSend = this._gain(0.7, this.musicConv);
    this.musicIn.connect(this.musicSend);
  }

  // ===========================================================================================
  // background rendering
  // ===========================================================================================
  _startRendering() {
    const names = ALL_RENDER_NAMES.slice();
    // stable sort by priority (lower first); public sounds keep their order within a priority
    names.sort((a, b) => SOUND_DEFS[a].prio - SOUND_DEFS[b].prio);
    this._queue = names;
    this.stats.total = names.length;
    const workers = 3;
    for (let i = 0; i < workers; i++) this._worker();
  }

  async _worker() {
    this._workers++;
    while (this._queue.length && this.ctx) {
      const name = this._queue.shift();
      if (this.buffers.has(name)) continue;
      const t0 = performance.now();
      try {
        const r = await renderSound(name, this.baseRate);
        this.buffers.set(name, r.buffers);
        for (const b of r.buffers) this.stats.bytes += b.length * b.numberOfChannels * 4;
      } catch (e) {
        console.warn('[audio] render failed:', name, e);
        this.stats.failed.push(name);
        this.buffers.set(name, [makeBuffer(64, this.baseRate)]);
      }
      this.stats.renderMs += performance.now() - t0;
      this.stats.rendered++;
      this._onReady(name);
      await new Promise((r) => setTimeout(r, 0));
    }
    this._workers--;
  }

  _prioritize(name) {
    const i = this._queue.indexOf(name);
    if (i > 0) {
      this._queue.splice(i, 1);
      this._queue.unshift(name);
    }
  }

  _onReady(name) {
    for (const h of this.loops) if (!h.src && !h.stopped && h.name === name) this._startLoopSource(h);
  }

  /** true once a sound's buffers exist */
  isReady(name) {
    return this.buffers.has(name);
  }

  /** Promise resolving when every sound has been rendered. */
  whenAllReady() {
    return new Promise((res) => {
      const check = () => (!this.ctx || this.stats.rendered >= this.stats.total ? res() : setTimeout(check, 100));
      check();
    });
  }

  // ===========================================================================================
  // listener / volumes / ambience / music
  // ===========================================================================================
  setListener(pos, forward) {
    const L = this.listener;
    if (pos) {
      L.x = +pos.x || 0;
      L.y = +pos.y || 0;
      L.z = +pos.z || 0;
    }
    if (forward) {
      let fx = +forward.x || 0, fy = +forward.y || 0, fz = +forward.z || 0;
      const n = Math.hypot(fx, fy, fz);
      if (n > 1e-6) {
        fx /= n;
        fy /= n;
        fz /= n;
        L.fx = fx;
        L.fy = fy;
        L.fz = fz;
      }
    }
    if (!this.ctx) return;
    const l = this.ctx.listener;
    // up vector orthogonal to forward (world up projected)
    let ux = -L.fx * L.fy, uy = 1 - L.fy * L.fy, uz = -L.fz * L.fy;
    const un = Math.hypot(ux, uy, uz);
    if (un < 1e-4) {
      ux = 0;
      uy = 0;
      uz = -1;
    } else {
      ux /= un;
      uy /= un;
      uz /= un;
    }
    if (l.positionX) {
      l.positionX.value = L.x;
      l.positionY.value = L.y;
      l.positionZ.value = L.z;
      l.forwardX.value = L.fx;
      l.forwardY.value = L.fy;
      l.forwardZ.value = L.fz;
      l.upX.value = ux;
      l.upY.value = uy;
      l.upZ.value = uz;
    } else {
      l.setPosition(L.x, L.y, L.z);
      l.setOrientation(L.fx, L.fy, L.fz, ux, uy, uz);
    }
  }

  setVolumes(v = {}) {
    for (const k of ['master', 'sfx', 'music', 'ambience']) if (v[k] !== undefined && Number.isFinite(+v[k])) this.volumes[k] = clamp(+v[k], 0, 1);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (param, val) => param.setTargetAtTime(val, now, 0.03);
    const V = this.volumes;
    set(this.master.gain, vgain(V.master));
    set(this.sfxBus.gain, vgain(V.sfx));
    set(this.sfxSend.gain, vgain(V.sfx));
    set(this.innerBus.gain, vgain(V.sfx));
    set(this.uiBus.gain, vgain(V.sfx));
    set(this.musicBus.gain, vgain(V.music));
    set(this.ambBus.gain, vgain(V.ambience));
    set(this.ambSend.gain, vgain(V.ambience));
  }

  setAmbience(vals = {}) {
    if (!vals || typeof vals !== 'object') return;
    for (const k of Object.keys(vals)) if (vals[k] !== undefined && vals[k] !== null) this.ambience[k] = vals[k];
    if (this.amb) this.amb.set(vals);
  }

  setMusic(mood) {
    this.mood = ['menu', 'calm', 'night', 'tense', 'none'].includes(mood) ? mood : 'none';
    if (this.music) this.music.setMood(this.mood);
  }

  // ===========================================================================================
  // thunder
  // ===========================================================================================
  /** 0 = right overhead (sharp crack + rumble) .. 1 = far (low, long rumble). Arrives after a
   *  light-travel style delay of 0.1 + d·2.4 s. */
  thunder(distance01 = 0.5) {
    if (!this.ctx) return;
    const d = clamp(Number.isFinite(+distance01) ? +distance01 : 0.5, 0, 1);
    const delay = 0.1 + d * 2.4;
    const pan = (Math.random() * 2 - 1) * 0.6;
    if (d < 0.8) {
      const v = Math.pow(1 - d / 0.8, 1.1);
      this._playInternal('thunder_near', { volume: v, delayS: delay, pan, outdoor: true, lp: 14000 * Math.pow(1800 / 14000, d / 0.8) });
    }
    if (d > 0.15) {
      const v = 0.35 + 0.65 * Math.min(1, (d - 0.15) / 0.5);
      this._playInternal('thunder_far', { volume: v * (d < 0.5 ? 0.7 : 1), delayS: delay + 0.15, pan: -pan * 0.5, outdoor: true });
    }
  }

  // ===========================================================================================
  // one-shots
  // ===========================================================================================
  /** Play a one-shot. opts: {pos?, volume=1, pitch=1, maxDist?}. Returns {stop()}. */
  play(name, opts) {
    if (!this.ctx) return NOOP;
    if (name === 'thunder' && opts && opts.distance !== undefined) {
      this.thunder(opts.distance);
      return NOOP;
    }
    return this._playInternal(name, opts || {});
  }

  _warn(name) {
    if (this._warned.has(name)) return;
    this._warned.add(name);
    console.warn(`[audio] unknown sound "${name}"`);
  }

  _distGain(def, d) {
    const ref = def.ref;
    return ref / (ref + def.roll * (Math.max(d, ref) - ref));
  }

  _airCutoff(def, d) {
    return clamp(20000 / (1 + (d * (def.air ?? 1)) / 18), 350, 20000);
  }

  _busFor(def, opts) {
    if (opts.bus) return this[opts.bus] || this.sfxBus;
    switch (def.cat) {
      case 'amb':
        return opts.outdoor ? this.outdoorBus : this.ambBus;
      case 'inner':
        return this.innerBus;
      case 'ui':
        return this.uiBus;
      case 'music':
        return this.musicIn;
      default:
        return this.sfxBus;
    }
  }

  _pickVariant(name, n) {
    if (n <= 1) return 0;
    const last = this._lastVariant.get(name);
    let v = Math.floor(Math.random() * n);
    if (v === last) v = (v + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this._lastVariant.set(name, v);
    return v;
  }

  _est(v, now) {
    const age = now - v.start;
    if (age < 0) return v.loud;
    return v.loud * Math.max(0, 1 - age / Math.max(0.05, v.dur));
  }

  /** enforce per-name, per-group and global voice limits. Returns false if the new voice should be skipped. */
  _makeRoom(name, def, loud) {
    const now = this.ctx.currentTime;
    const steal = (filter, cap) => {
      let count = 0, victim = null, ve = Infinity;
      for (const v of this.voices) {
        if (!filter(v)) continue;
        count++;
        const e = this._est(v, now);
        if (e < ve || (e === ve && v.start < victim.start)) {
          ve = e;
          victim = v;
        }
      }
      if (count < cap) return true;
      if (!victim || ve > loud * 1.05) return false;
      this._kill(victim, 0.025);
      return true;
    };
    if (!steal((v) => v.name === name, def.cap)) return false;
    if (def.group && !steal((v) => v.def.group === def.group, def.groupCap)) return false;
    if (!steal(() => true, MAX_VOICES)) return false;
    return true;
  }

  _playInternal(name, opts = {}) {
    if (!this.ctx) return NOOP;
    const def = SOUND_DEFS[name];
    if (!def) {
      this._warn(name);
      return NOOP;
    }
    const bufs = this.buffers.get(name);
    if (!bufs) {
      this._prioritize(name);
      return NOOP;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const L = this.listener;
    const pos = opts.pos;
    let d = 0, positional = false;
    if (pos && Number.isFinite(pos.x)) {
      d = Math.hypot(pos.x - L.x, (pos.y || 0) - L.y, (pos.z || 0) - L.z);
      positional = d > 0.75;
      const maxDist = opts.maxDist ?? def.maxDist;
      if (d > maxDist) return NOOP;
    }
    const volume = Number.isFinite(opts.volume) ? Math.max(0, opts.volume) : 1;
    const vol = volume * def.level * (1 + (Math.random() * 2 - 1) * def.vv);
    const dg = positional ? this._distGain(def, d) : 1;
    const loud = vol * dg;
    if (loud < 0.0004) return NOOP;
    if (!this._makeRoom(name, def, loud)) return NOOP;

    const variant = this._pickVariant(name, bufs.length);
    const buf = bufs[variant];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const pitch = Number.isFinite(opts.pitch) && opts.pitch > 0 ? opts.pitch : 1;
    const rate = clamp(pitch * (1 + (Math.random() * 2 - 1) * def.pv), 0.1, 8);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    let tail = g, lp = null, panner = null, spanner = null;
    const nodes = [src, g];
    const cutoff = opts.lp ?? (positional ? this._airCutoff(def, d) : 0);
    if (cutoff && cutoff < 19000) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      lp.Q.value = 0.5;
      tail.connect(lp);
      tail = lp;
      nodes.push(lp);
    }
    const preSpatial = tail;
    if (positional) {
      panner = ctx.createPanner();
      panner.panningModel = this.hrtf && d < 30 && this.voices.length < 24 ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = def.ref;
      panner.rolloffFactor = def.roll;
      panner.maxDistance = 100000;
      if (panner.positionX) {
        panner.positionX.value = pos.x;
        panner.positionY.value = pos.y || 0;
        panner.positionZ.value = pos.z || 0;
      } else panner.setPosition(pos.x, pos.y || 0, pos.z || 0);
      tail.connect(panner);
      tail = panner;
      nodes.push(panner);
    } else if (opts.pan && ctx.createStereoPanner) {
      spanner = ctx.createStereoPanner();
      spanner.pan.value = clamp(opts.pan, -1, 1);
      tail.connect(spanner);
      tail = spanner;
      nodes.push(spanner);
    }
    tail.connect(this._busFor(def, opts));
    // reverb send (wet attenuates more slowly with distance than dry → distant sounds are washier)
    const sendBase = opts.send ?? def.send;
    const send = sendBase * (positional ? Math.sqrt(dg) : 1) * (opts.outdoor ? 1 : 1);
    if (send > 0.004 && def.cat !== 'ui') {
      const sg = ctx.createGain();
      sg.gain.value = send;
      preSpatial.connect(sg);
      sg.connect(def.cat === 'amb' ? this.ambSend : this.sfxSend);
      nodes.push(sg);
    }
    let start = opts.at ?? now;
    if (opts.delayS) start += opts.delayS;
    else if (positional && d > 25 && !opts.noDelay) start += Math.min(1.5, d / SPEED_OF_SOUND);
    src.start(Math.max(now, start));
    const voice = { name, def, src, g, nodes, start, dur: buf.duration / rate, loud, ended: false };
    src.onended = () => this._release(voice);
    this.voices.push(voice);
    return {
      stop: () => this._kill(voice, 0.04),
      get playing() {
        return !voice.ended;
      },
    };
  }

  _kill(v, fade = 0.03) {
    if (v.ended) return;
    v.ended = true;
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    const now = this.ctx.currentTime;
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(v.g.gain.value, now);
      v.g.gain.linearRampToValueAtTime(0, now + fade);
      v.src.stop(now + fade + 0.01);
    } catch (e) {
      /* not started yet / already stopped */
      try {
        v.src.stop();
      } catch (e2) {
        /* ignore */
      }
    }
  }

  _release(v) {
    if (!v.ended) {
      v.ended = true;
      const i = this.voices.indexOf(v);
      if (i >= 0) this.voices.splice(i, 1);
    }
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
  }

  // ===========================================================================================
  // loops
  // ===========================================================================================
  /** Continuous sound. opts: {pos?, volume=1}. Returns {setVolume, setPos, setPitch, stop}. */
  loop(name, opts) {
    if (!this.ctx) return NOOP_LOOP;
    opts = opts || {};
    let def = SOUND_DEFS[name];
    if (!def) {
      this._warn(name);
      return NOOP_LOOP;
    }
    if (def.loopAlias) {
      name = def.loopAlias;
      def = SOUND_DEFS[name];
    }
    if (this.loops.size >= MAX_LOOPS) {
      // drop the quietest existing loop
      let q = null;
      for (const h of this.loops) if (!q || h.eff < q.eff) q = h;
      if (q) this._stopLoop(q);
    }
    const ctx = this.ctx;
    const h = {
      name, def,
      vol: Number.isFinite(opts.volume) ? Math.max(0, opts.volume) : 1,
      pitch: 1,
      pos: opts.pos && Number.isFinite(opts.pos.x) ? { x: opts.pos.x, y: opts.pos.y || 0, z: opts.pos.z || 0 } : null,
      src: null, stopped: false, eff: 1,
    };
    h.g = ctx.createGain();
    h.g.gain.value = 0;
    let tail = h.g;
    if (h.pos) {
      h.lp = ctx.createBiquadFilter();
      h.lp.type = 'lowpass';
      h.lp.Q.value = 0.5;
      h.lp.frequency.value = 20000;
      h.panner = ctx.createPanner();
      h.panner.panningModel = 'equalpower';
      h.panner.distanceModel = 'inverse';
      h.panner.refDistance = def.ref;
      h.panner.rolloffFactor = def.roll;
      h.panner.maxDistance = 100000;
      h.g.connect(h.lp);
      h.lp.connect(h.panner);
      tail = h.panner;
      this._setPannerPos(h.panner, h.pos);
    }
    tail.connect(this._busFor(def, opts));
    if (def.send > 0) {
      h.sg = ctx.createGain();
      h.sg.gain.value = def.send;
      (h.lp || h.g).connect(h.sg);
      h.sg.connect(def.cat === 'amb' ? this.ambSend : this.sfxSend);
    }
    this.loops.add(h);
    if (this.buffers.has(name)) this._startLoopSource(h);
    else this._prioritize(name);
    this._updateLoop(h, true);
    const self = this;
    return {
      setVolume(v) {
        if (Number.isFinite(v)) h.vol = Math.max(0, v);
        self._updateLoop(h);
      },
      setPos(p) {
        if (!p || !Number.isFinite(p.x) || !h.panner) return;
        h.pos.x = p.x;
        h.pos.y = p.y || 0;
        h.pos.z = p.z || 0;
        self._setPannerPos(h.panner, h.pos);
        self._updateLoop(h);
      },
      setPitch(p) {
        if (!Number.isFinite(p) || p <= 0) return;
        h.pitch = clamp(p, 0.1, 8);
        if (h.src) h.src.playbackRate.setTargetAtTime(h.pitch, self.ctx.currentTime, 0.05);
      },
      stop() {
        self._stopLoop(h);
      },
      get playing() {
        return !h.stopped;
      },
    };
  }

  _setPannerPos(p, pos) {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setTargetAtTime(pos.x, t, 0.02);
      p.positionY.setTargetAtTime(pos.y, t, 0.02);
      p.positionZ.setTargetAtTime(pos.z, t, 0.02);
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  _startLoopSource(h) {
    const bufs = this.buffers.get(h.name);
    if (!bufs || h.stopped) return;
    const buf = bufs[Math.floor(Math.random() * bufs.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = h.pitch;
    src.connect(h.g);
    src.start(this.ctx.currentTime, Math.random() * buf.duration);
    h.src = src;
    // fade in
    h.g.gain.setValueAtTime(0, this.ctx.currentTime);
    this._updateLoop(h, false, 0.15);
  }

  _updateLoop(h, instant = false, tc = 0.06) {
    if (h.stopped) return;
    let eff = h.vol * h.def.level;
    const L = this.listener;
    if (h.pos) {
      const d = Math.hypot(h.pos.x - L.x, h.pos.y - L.y, h.pos.z - L.z);
      if (d > h.def.maxDist) eff = 0;
      else if (d > h.def.maxDist * 0.8) eff *= (h.def.maxDist - d) / (h.def.maxDist * 0.2);
      const t = this.ctx.currentTime;
      h.lp.frequency.setTargetAtTime(this._airCutoff(h.def, d), t, 0.1);
      if (h.sg) h.sg.gain.setTargetAtTime(h.def.send * Math.sqrt(this._distGain(h.def, d)) * (eff > 0 ? 1 : 0), t, 0.1);
      h.eff = eff * this._distGain(h.def, d);
    } else h.eff = eff;
    if (!h.src) return;
    const t = this.ctx.currentTime;
    if (instant) h.g.gain.setValueAtTime(eff, t);
    else h.g.gain.setTargetAtTime(eff, t, tc);
  }

  _stopLoop(h) {
    if (h.stopped) return;
    h.stopped = true;
    this.loops.delete(h);
    const now = this.ctx.currentTime;
    h.g.gain.cancelScheduledValues(now);
    h.g.gain.setValueAtTime(h.g.gain.value, now);
    h.g.gain.linearRampToValueAtTime(0, now + 0.12);
    const nodes = [h.g, h.lp, h.panner, h.sg].filter(Boolean);
    if (h.src) {
      h.src.stop(now + 0.15);
      h.src.onended = () => {
        h.src.disconnect();
        for (const n of nodes) n.disconnect();
      };
    } else for (const n of nodes) n.disconnect();
  }

  // ===========================================================================================
  // per-frame
  // ===========================================================================================
  update(dt) {
    if (!this.ctx) return;
    dt = clamp(Number.isFinite(dt) ? dt : 0.016, 0, 0.25);
    try {
      this.amb.update(dt);
      const C = this.amb.cur;
      const now = this.ctx.currentTime;
      // world muffle: underwater / deafness after explosions
      const fUw = 20000 * Math.pow(420 / 20000, C.underwater);
      const fTin = 20000 * Math.pow(1200 / 20000, clamp(C.tinnitus * 1.1, 0, 1));
      this.worldLP.frequency.setTargetAtTime(Math.min(fUw, fTin), now, 0.06);
      this.worldDuck.gain.setTargetAtTime((1 - 0.55 * C.tinnitus) * (1 - 0.35 * C.underwater), now, 0.06);
      // indoor: muffled outdoor ambience + reverb swap
      const ind = clamp(C.indoor, 0, 1);
      this.outdoorLP.frequency.setTargetAtTime(20000 * Math.pow(900 / 20000, ind), now, 0.08);
      this.outdoorBus.gain.setTargetAtTime(lerp(1, 0.55, ind), now, 0.08);
      this.revOutG.gain.setTargetAtTime(Math.cos((ind * Math.PI) / 2), now, 0.08);
      this.revInG.gain.setTargetAtTime(Math.sin((ind * Math.PI) / 2) * 1.1, now, 0.08);
      this.music.update(dt);
      for (const h of this.loops) if (h.pos) this._updateLoop(h);
    } catch (e) {
      if (!this._updErr) {
        this._updErr = true;
        console.warn('[audio] update error', e);
      }
    }
  }

  /** Debug info. */
  debugStats() {
    return {
      state: this.ctx ? this.ctx.state : 'uninitialised',
      voices: this.voices.length,
      loops: this.loops.size,
      rendered: this.stats.rendered,
      total: this.stats.total,
      renderMs: Math.round(this.stats.renderMs),
      megabytes: +(this.stats.bytes / 1048576).toFixed(1),
      failed: this.stats.failed.slice(),
      music: this.music ? this.music.mood : this.mood,
      ambience: this.amb ? { ...this.amb.cur } : { ...this.ambience },
    };
  }

  /** Stop everything and close the context. */
  dispose() {
    if (!this.ctx) return;
    for (const v of this.voices.slice()) this._kill(v);
    for (const h of [...this.loops]) this._stopLoop(h);
    this.amb?.dispose();
    this._queue = [];
    const ctx = this.ctx;
    this.ctx = null;
    ctx.close().catch(() => {});
  }
}

export default AudioEngine;
export { PIANO_SAMPLES };
