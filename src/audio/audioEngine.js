// Procedural audio engine (WebAudio, zero asset files). See SPEC.md.
//
//   const audio = new AudioEngine({ master, music, sfx, voice });
//   audio.onProgress = (f) => ...;   // 0..1 while init() renders the critical set
//   await audio.init();              // critical sounds rendered; the rest renders in the background
//   audio.resume();                  // on a user gesture
//   audio.play('rifle', { pos, owner, gun: true });
//
// Every one-shot is synthesised with WebAudio nodes and pre-rendered through
// OfflineAudioContext into several AudioBuffer variants. Music is synthesised
// live with a lookahead scheduler; ambience beds are live textures + random
// one-off details. If WebAudio is unavailable every method is a safe no-op.

import { Kit, mulberry32, hashStr, finalizeBuffer, makeImpulse, REVERB_PRESETS, limiterCurve, noiseBuffers, bufferStats } from './dsp.js';
import { WEAPON_SFX } from './sfxWeapons.js';
import { CREATURE_SFX } from './sfxCreatures.js';
import { SPECIAL2_SFX } from './sfxSpecials2.js';
import { WORLD_SFX } from './sfxWorld.js';
import { Music, MUSIC_KIT, MUSIC_STATES, STINGER_NAMES } from './music.js';
import { Ambience, AMBIENCES } from './ambience.js';

export const SFX_DEFS = Object.assign({}, WEAPON_SFX, CREATURE_SFX, SPECIAL2_SFX, WORLD_SFX);
const ALL_DEFS = Object.assign({}, SFX_DEFS, MUSIC_KIT);
/** Public sound names usable with play()/loop(). */
export const SOUND_NAMES = Object.keys(SFX_DEFS).filter((n) => !n.startsWith('_') && !n.startsWith('amb_'));
export const LOOP_NAMES = SOUND_NAMES.filter((n) => SFX_DEFS[n].loop || SFX_DEFS[n].chain);
export const REVERB_NAMES = ['outdoor', 'room', 'hall', 'tunnel', 'sewer', 'stairwell', 'safe'];
export { MUSIC_STATES, STINGER_NAMES, AMBIENCES };

// Weapon-def sound names that are not in the spec list map onto existing sounds.
const ALIASES = { axe: 'swing', crowbar: 'swing', machete: 'swing', fireaxe: 'swing', katana: 'swing', bile: 'glass', pipebomb: 'beep' };

// Per-category mixing: ref distance, priority, reverb send, bus, per-name voice cap.
const CATS = {
  gun: { ref: 7, pri: 3, send: 1.0, bus: 'sfx', max: 12, local: 1.25 },
  explosion: { ref: 12, pri: 4, send: 0.8, bus: 'sfx', max: 6, local: 1.1 },
  impact: { ref: 3, pri: 1, send: 0.35, bus: 'sfx', max: 12 },
  gore: { ref: 3, pri: 1.2, send: 0.3, bus: 'sfx', max: 10 },
  debris: { ref: 1.5, pri: 0.3, send: 0.2, bus: 'sfx', max: 8 },
  step: { ref: 2, pri: 0.6, send: 0.2, bus: 'sfx', max: 10 },
  foley: { ref: 2, pri: 1.5, send: 0.2, bus: 'sfx', max: 8 },
  zvocal: { ref: 4, pri: 1.2, send: 0.35, bus: 'sfx', max: 8, group: 'z', groupMax: 16 },
  horde: { ref: 25, pri: 3, send: 0.5, bus: 'sfx', max: 3 },
  special: { ref: 6, pri: 3, send: 0.4, bus: 'sfx', max: 4 },
  tank: { ref: 10, pri: 4, send: 0.5, bus: 'sfx', max: 6 },
  witch: { ref: 5, pri: 3.5, send: 0.45, bus: 'sfx', max: 3 },
  voice: { ref: 3, pri: 2.5, send: 0.3, bus: 'voice', max: 6 },
  world: { ref: 4, pri: 2, send: 0.4, bus: 'sfx', max: 8 },
  loop: { ref: 5, pri: 2, send: 0.35, bus: 'sfx', max: 6 },
  ui: { ref: 1, pri: 10, send: 0, bus: 'sfx', max: 6, twoD: true },
  amb: { ref: 5, pri: 0.2, send: 0.3, bus: 'amb', max: 6 },
  music: { ref: 1, pri: 5, send: 0, bus: 'music', max: 16, twoD: true },
};
const CAT_ORDER = ['gun', 'foley', 'impact', 'gore', 'zvocal', 'step', 'ui', 'voice', 'explosion', 'debris', 'music', 'special', 'tank', 'witch', 'horde', 'world', 'loop', 'amb'];

const MAX_VOICES = 40;
const MAX_DIST = 120;
const ROLLOFF = 1.2;
const CONCURRENCY = 6;

const nop = () => {};
const DUMMY_LOOP = Object.freeze({ stop: nop, set: nop, playing: false });
const clamp01 = (x) => Math.max(0, Math.min(1, +x || 0));
const hasWindow = typeof window !== 'undefined';

export class AudioEngine {
  constructor(settings = {}) {
    this.settings = { master: 0.8, music: 0.55, sfx: 0.9, voice: 0.9 };
    for (const k of ['master', 'music', 'sfx', 'voice']) if (settings && settings[k] != null) this.settings[k] = clamp01(settings[k]);
    this.ctx = null;
    this.enabled = false;
    this.ready = false;
    this.onProgress = null;
    this.onBackgroundProgress = null;
    this.buffers = new Map();
    this.voices = [];
    this.loops = new Set();
    this.music = new Music(this);
    this.ambience = new Ambience(this);
    this._warned = new Set();
    this._lastVar = new Map();
    this._recent = new Map();
    this._lis = { x: 0, y: 0, z: 0 };
    this._reverbName = 'outdoor';
    this._pendingReverb = 'outdoor';
    this._irCache = new Map();
    this._heart = 0;
    this._heartNext = 0;
    this._jobs = [];
    this._jobIndex = new Map();
    this._done = 0;
    this._total = 0;
    this._initPromise = null;
    this._timer = null;
    this.initTime = 0;
    this.backgroundTime = 0;
    let resolveBg;
    this.backgroundDone = new Promise((r) => { resolveBg = r; });
    this._resolveBg = resolveBg;
  }

  // -------------------------------------------------------------------------
  // lifecycle

  init() {
    if (!this._initPromise) this._initPromise = this._init().catch((e) => { console.warn('[audio] init failed', e); this._progress(1); });
    return this._initPromise;
  }

  async _init() {
    const t0 = hasWindow && window.performance ? performance.now() : 0;
    const AC = hasWindow && (window.AudioContext || window.webkitAudioContext);
    const OAC = hasWindow && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!AC || !OAC) { this._progress(1); this._resolveBg(); return; }
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('[audio] AudioContext unavailable', e);
      this._progress(1); this._resolveBg();
      return;
    }
    this._OAC = OAC;
    noiseBuffers(this.ctx);
    this._buildGraph();
    this.enabled = true;

    // Build render jobs: critical defs first (ordered by category), then the rest.
    const names = Object.keys(ALL_DEFS);
    const rank = (n) => {
      const d = ALL_DEFS[n];
      const ci = CAT_ORDER.indexOf(d.cat);
      return (d.crit ? 0 : 1000) + (d.prio != null ? d.prio * 10 : 100) + (ci < 0 ? 99 : ci);
    };
    names.sort((a, b) => rank(a) - rank(b));
    const crit = [], bg = [];
    for (const n of names) {
      const d = ALL_DEFS[n];
      const nv = Math.max(1, d.v || 1);
      this.buffers.set(n, []);
      for (let i = 0; i < nv; i++) (d.crit ? crit : bg).push({ name: n, i });
    }
    this._total = crit.length + bg.length;
    this._critTotal = crit.length;
    this._jobs = bg;

    await this._runPool(crit, CONCURRENCY, () => this._progress(Math.min(1, this._done / Math.max(1, this._critTotal))));
    this.ready = true;
    this.initTime = (hasWindow && window.performance ? performance.now() : 0) - t0;
    this._progress(1);

    // Music reverb + attach music/ambience now that the graph exists.
    this.music.attach(this.ctx, this.musicBus, this._ir('music'));
    this.ambience.attach(this.ctx, this.ambBus, this.farIn);
    this._applyReverb(this._pendingReverb, true);
    this._timer = setInterval(() => this._tick(), 50);
    this._background(t0);
  }

  async _background(t0) {
    // Background rendering in small chunks, yielding to the main thread between them.
    const tb = hasWindow && window.performance ? performance.now() : 0;
    const chunk = 4;
    while (this._jobs.length) {
      const batch = this._jobs.splice(0, chunk);
      await this._runPool(batch, Math.min(3, batch.length));
      if (this.onBackgroundProgress) try { this.onBackgroundProgress(this._done / this._total); } catch (e) { /* ignore */ }
      await new Promise((r) => setTimeout(r, 0));
    }
    // Pre-build the remaining impulse responses so later setReverb() calls never hitch.
    for (const n of REVERB_NAMES) { if (!this._irCache.has(n)) { this._ir(n); await new Promise((r) => setTimeout(r, 0)); } }
    this.backgroundTime = (hasWindow && window.performance ? performance.now() : 0) - tb;
    this._resolveBg();
  }

  async _runPool(jobs, conc, onEach) {
    let idx = 0;
    const worker = async () => {
      while (idx < jobs.length) {
        const job = jobs[idx++];
        await this._renderJob(job);
        if (onEach) onEach();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, conc) }, worker));
  }

  async _renderJob({ name, i }) {
    const def = ALL_DEFS[name];
    const key = name + '#' + i;
    if (this._jobIndex.get(key)) return;
    this._jobIndex.set(key, 1);
    try {
      const buf = await this._renderVariant(name, def, i);
      this.buffers.get(name).push(buf);
    } catch (e) {
      console.warn('[audio] render failed', name, e);
    }
    this._done++;
  }

  async _renderVariant(name, def, i, OAC = this._OAC) {
    let sr = def.sr || 32000;
    const ch = def.stereo ? 2 : 1;
    let oc;
    try { oc = new OAC(ch, Math.ceil(def.dur * sr), sr); } catch (e) {
      sr = 44100; // older engines only accept 22.05k-96k
      oc = new OAC(ch, Math.ceil(def.dur * sr), sr);
    }
    const hp = oc.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = def.hp || 24;
    hp.Q.value = 0.6;
    hp.connect(oc.destination);
    const out = oc.createGain();
    out.connect(hp);
    const K = new Kit(oc, out, mulberry32((hashStr(name) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0), i, def.v || 1);
    def.build(K, i);
    const raw = await oc.startRendering();
    return finalizeBuffer(raw, { level: def.level ?? 0.8, loop: def.loop, xfade: def.xfade, ctx: this.ctx });
  }

  _progress(f) {
    if (this.onProgress) try { this.onProgress(f); } catch (e) { /* ignore */ }
  }

  /** Fraction (0..1) of all buffers rendered, including background work. */
  get loadFraction() { return this._total ? this._done / this._total : (this.enabled ? 0 : 1); }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') {
      try { return this.ctx.resume(); } catch (e) { /* ignore */ }
    }
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // graph

  _buildGraph() {
    const c = this.ctx;
    const G = (v = 1) => { const g = c.createGain(); g.gain.value = v; return g; };
    this.mix = G(1);
    this.masterGain = G(this.settings.master);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.2;
    this.clipPre = G(0.5);
    this.clip = c.createWaveShaper();
    this.clip.curve = limiterCurve(0.85, 0.985);
    this.mix.connect(this.masterGain);
    this.masterGain.connect(this.comp);
    this.comp.connect(this.clipPre);
    this.clipPre.connect(this.clip);
    this.clip.connect(c.destination);

    // category buses
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    this.muffle.connect(this.mix);
    this.sfxBus = G(this.settings.sfx); this.sfxBus.connect(this.muffle);
    this.voiceBus = G(this.settings.voice); this.voiceBus.connect(this.mix);
    this.ambBus = G(this.settings.sfx * 0.9); this.ambBus.connect(this.muffle);
    this.musicBus = G(this.settings.music); this.musicBus.connect(this.mix);
    this.buses = { sfx: this.sfxBus, voice: this.voiceBus, amb: this.ambBus, music: this.musicBus };

    // environment reverb: sends (scaled by category volume) -> A/B convolvers
    this.revIn = G(1);
    this.sendSfx = G(this.settings.sfx); this.sendSfx.connect(this.revIn);
    this.sendVoice = G(this.settings.voice); this.sendVoice.connect(this.revIn);
    this.sends = { sfx: this.sendSfx, voice: this.sendVoice, amb: this.sendSfx, music: null };
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    this.revIn.connect(hp);
    this.revA = c.createConvolver(); this.revB = c.createConvolver();
    this.revGA = G(0); this.revGB = G(0);
    this._revHP = hp;
    this.revA.connect(this.revGA); this.revB.connect(this.revGB);
    this.revReturn = G(1);
    this.revGA.connect(this.revReturn); this.revGB.connect(this.revReturn);
    this.revReturn.connect(this.muffle);
    this._revActive = null;

    // ambience details are sent into the current environment reverb (drips ring in tunnels,
    // far gunfire gets the street slap-back outdoors, ...)
    this.farIn = G(0.5);
    this.farIn.connect(this.sendSfx);
  }

  _ir(name) {
    let b = this._irCache.get(name);
    if (!b && this.ctx) { b = makeImpulse(this.ctx, name); this._irCache.set(name, b); }
    return b;
  }

  // -------------------------------------------------------------------------
  // volumes / environment

  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx', 'voice']) if (v[k] != null) this.settings[k] = clamp01(v[k]);
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.settings;
    const set = (g, x) => g.gain.setTargetAtTime(x, t, 0.05);
    set(this.masterGain, s.master);
    set(this.sfxBus, s.sfx);
    set(this.sendSfx, s.sfx);
    set(this.ambBus, s.sfx * 0.9);
    set(this.voiceBus, s.voice);
    set(this.sendVoice, s.voice);
    set(this.musicBus, s.music);
  }

  setReverb(preset) {
    if (!REVERB_PRESETS[preset] || !REVERB_NAMES.includes(preset)) {
      this._warnOnce('reverb:' + preset, '[audio] unknown reverb preset ' + preset);
      return;
    }
    this._pendingReverb = preset;
    if (!this.ctx || !this.ready) return;
    this._applyReverb(preset, false);
  }

  _applyReverb(preset, immediate) {
    if (preset === this._reverbName && this._revActive) return;
    const c = this.ctx, t = c.currentTime;
    const P = REVERB_PRESETS[preset];
    const useA = this._revActive !== this.revA;
    const conv = useA ? this.revA : this.revB;
    const g = useA ? this.revGA : this.revGB;
    const og = useA ? this.revGB : this.revGA;
    try { conv.buffer = this._ir(preset); } catch (e) { /* buffer swap on a busy convolver: ignore */ }
    try { this._revHP.connect(conv); } catch (e) { /* ignore */ }
    const fade = immediate ? 0.01 : 0.5;
    // stop feeding the idle convolver once it has faded out (saves CPU)
    const old = useA ? this.revB : this.revA;
    clearTimeout(this._revTimer);
    this._revTimer = setTimeout(() => { if (this._revActive !== old) try { this._revHP.disconnect(old); } catch (e) { /* not connected */ } }, (fade + 0.1) * 1000);
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(P.wet, t + fade);
    og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.linearRampToValueAtTime(0, t + fade);
    this._revActive = conv;
    this._reverbName = preset;
  }

  setAmbience(name) { this.ambience.set(name); }

  setListener(pos, forward, up) {
    if (pos) { this._lis.x = +pos.x || 0; this._lis.y = +pos.y || 0; this._lis.z = +pos.z || 0; }
    if (!this.ctx) return;
    const L = this.ctx.listener;
    try {
      if (L.positionX) {
        if (pos) { L.positionX.value = this._lis.x; L.positionY.value = this._lis.y; L.positionZ.value = this._lis.z; }
        if (forward) { L.forwardX.value = forward.x; L.forwardY.value = forward.y; L.forwardZ.value = forward.z; }
        if (up) { L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
      } else {
        if (pos) L.setPosition(this._lis.x, this._lis.y, this._lis.z);
        if (forward) L.setOrientation(forward.x, forward.y, forward.z, up ? up.x : 0, up ? up.y : 1, up ? up.z : 0);
      }
    } catch (e) { /* ignore non-finite values */ }
  }

  heartbeat(k) {
    this._heart = clamp01(k);
    if (!this.ctx) return;
    const f = this._heart > 0.05 ? 20000 * Math.pow(0.4, this._heart * this._heart) : 20000;
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.3);
  }

  // -------------------------------------------------------------------------
  // playback

  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }

  _resolve(name) {
    if (ALL_DEFS[name]) return name;
    if (ALIASES[name]) return ALIASES[name];
    return null;
  }

  _pickBuffer(name) {
    const arr = this.buffers.get(name);
    if (!arr || !arr.length) return null;
    if (arr.length === 1) return arr[0];
    let i = Math.floor(Math.random() * arr.length);
    if (i === this._lastVar.get(name)) i = (i + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length;
    this._lastVar.set(name, i);
    return arr[i];
  }

  // bump an unrendered sound to the front of the background queue
  _urgent(name) {
    if (!this._jobs.length) return;
    const mine = this._jobs.filter((j) => j.name === name);
    if (!mine.length) return;
    this._jobs = mine.concat(this._jobs.filter((j) => j.name !== name));
  }

  _dist(p) {
    const dx = p.x - this._lis.x, dy = p.y - this._lis.y, dz = p.z - this._lis.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  _att(d, ref) {
    const dd = Math.min(MAX_DIST, Math.max(ref, d));
    return ref / (ref + ROLLOFF * (dd - ref));
  }

  play(name, opts = {}) {
    if (!this.enabled || !this.ctx) return null;
    const key = this._resolve(name);
    if (!key) { this._warnOnce('snd:' + name, '[audio] unknown sound "' + name + '"'); return null; }
    const def = ALL_DEFS[key];
    const buf = this._pickBuffer(key);
    if (!buf) { this._urgent(key); return null; }
    opts = opts || {};
    const cat = CATS[def.cat] || CATS.world;
    const c = this.ctx;
    const now = c.currentTime;

    // same-name burst throttle (e.g. 10 shotgun pellets hitting concrete in one frame)
    if (def.cat !== 'gun') {
      const r = this._recent.get(key);
      if (r && now - r.t < 0.03) { if (r.n >= 2) return null; r.n++; } else this._recent.set(key, { t: now, n: 1 });
    }

    const local = !!(opts.owner && opts.owner.isHuman);
    const pos = !local && !cat.twoD && opts.pos ? opts.pos : null;
    let vol = opts.vol == null ? 1 : Math.max(0, +opts.vol || 0);
    if (local) vol *= cat.local || 1.15;
    const ref = def.ref || cat.ref;
    const d = pos ? this._dist(pos) : 0;
    if (pos && d > MAX_DIST * 1.5) return null;
    const att = pos ? this._att(d, ref) : 1;
    const loud = vol * att * (def.level ?? 0.8);
    if (loud < 0.006) return null;
    // the local player's own sounds (and UI) must never lose a voice to distant world noise
    const pri = ((opts.priority != null ? +opts.priority : cat.pri) || 1) * (local ? 4 : 1);
    const score = loud * pri;

    // voice limiting
    const same = [];
    let group = 0;
    for (const v of this.voices) {
      if (v.dead) continue;
      if (v.name === key) same.push(v);
      if (cat.group && v.group === cat.group) group++;
    }
    const maxSame = def.max || cat.max || 12;
    if (same.length >= maxSame) {
      let oldest = same[0];
      for (const v of same) if (v.start < oldest.start) oldest = v;
      this._kill(oldest);
    }
    if (cat.group && group >= cat.groupMax) {
      const victim = this._weakest((v) => v.group === cat.group);
      if (!victim || this._vscore(victim, now) > score) return null;
      this._kill(victim);
    }
    if (this._liveCount() >= MAX_VOICES) {
      const victim = this._weakest(() => true);
      if (!victim || this._vscore(victim, now) > score) return null;
      this._kill(victim);
    }

    // build the voice
    const src = c.createBufferSource();
    src.buffer = buf;
    const jit = def.jitter ?? 0.05;
    const rate = Math.max(0.05, (opts.rate == null ? 1 : +opts.rate || 1) * (1 + (Math.random() * 2 - 1) * jit));
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    const bus = this.buses[cat.bus] || this.sfxBus;
    let panner = null, lp = null;
    let head = g;
    if (pos && d > 12) {
      lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(1100, 20000 * Math.exp(-(d - 12) / 32));
      g.connect(lp);
      head = lp;
    }
    if (pos) {
      panner = this._panner(pos, ref);
      head.connect(panner);
      panner.connect(bus);
    } else head.connect(bus);
    // reverb send (wetter with distance)
    const sendBus = this.sends[cat.bus];
    let send = null;
    if (sendBus && cat.send > 0) {
      const P = REVERB_PRESETS[this._reverbName] || REVERB_PRESETS.outdoor;
      const isGun = opts.gun || def.cat === 'gun';
      const lvl = cat.send * (isGun ? P.gunSend : P.send / 0.3) * (pos ? Math.sqrt(att) : (isGun ? 0.8 : 1));
      if (lvl > 0.01) {
        send = c.createGain();
        send.gain.value = lvl;
        head.connect(send);
        send.connect(sendBus);
      }
    }
    src.start(now);
    const v = {
      name: key, src, g, panner, lp, send, start: now, end: now + buf.duration / rate, loud, pri,
      group: cat.group || null, dead: false,
    };
    src.onended = () => { v.dead = true; this._disconnect(v); };
    this.voices.push(v);
    return { stop: (fade = 0.05) => this._kill(v, fade), get playing() { return !v.dead; } };
  }

  _panner(pos, ref) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = MAX_DIST;
    p.rolloffFactor = ROLLOFF;
    this._setPannerPos(p, pos, true);
    return p;
  }
  _setPannerPos(p, pos, immediate) {
    const x = +pos.x || 0, y = +pos.y || 0, z = +pos.z || 0;
    if (p.positionX) {
      if (immediate) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
      else {
        const t = this.ctx.currentTime;
        p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
      }
    } else p.setPosition(x, y, z);
  }

  _vscore(v, now) {
    const dur = Math.max(0.05, v.end - v.start);
    const k = Math.max(0.05, 1 - (now - v.start) / dur);
    return v.loud * v.pri * k;
  }
  _weakest(filter) {
    const now = this.ctx.currentTime;
    let best = null, bs = Infinity;
    for (const v of this.voices) {
      if (v.dead || v.killing || !filter(v)) continue;
      const s = this._vscore(v, now);
      if (s < bs) { bs = s; best = v; }
    }
    return best;
  }
  _liveCount() { let n = 0; for (const v of this.voices) if (!v.dead && !v.killing) n++; return n; }

  _kill(v, fade = 0.03) {
    if (!v || v.dead || v.killing) return;
    v.killing = true;
    const t = this.ctx.currentTime;
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.01);
    } catch (e) { v.dead = true; this._disconnect(v); }
  }
  _disconnect(v) {
    for (const n of [v.src, v.g, v.lp, v.panner, v.send]) if (n) try { n.disconnect(); } catch (e) { /* ignore */ }
  }

  // looping sounds -----------------------------------------------------------
  loop(name, opts = {}) {
    const key = this._resolve(name);
    if (!key) { this._warnOnce('snd:' + name, '[audio] unknown sound "' + name + '"'); return DUMMY_LOOP; }
    if (!this.enabled || !this.ctx) return DUMMY_LOOP;
    opts = opts || {};
    const def = ALL_DEFS[key];
    const cat = CATS[def.cat] || CATS.world;
    const c = this.ctx;
    const L = {
      name: key, def, cat, vol: opts.vol == null ? 1 : +opts.vol, rate: opts.rate == null ? 1 : +opts.rate,
      pos: opts.pos ? { x: +opts.pos.x || 0, y: +opts.pos.y || 0, z: +opts.pos.z || 0 } : null,
      chain: !!def.chain || !def.loop, srcs: [], dead: false, started: false, nextAt: 0,
    };
    L.ref = def.ref || cat.ref;
    L.g = c.createGain();
    L.g.gain.value = 0;
    L.lp = c.createBiquadFilter();
    L.lp.type = 'lowpass';
    L.lp.frequency.value = 20000;
    L.g.connect(L.lp);
    const bus = this.buses[cat.bus] || this.sfxBus;
    if (L.pos) { L.panner = this._panner(L.pos, L.ref); L.lp.connect(L.panner); L.panner.connect(bus); } else L.lp.connect(bus);
    const sendBus = this.sends[cat.bus];
    if (sendBus) { L.send = c.createGain(); L.send.gain.value = 0; L.lp.connect(L.send); L.send.connect(sendBus); }
    this.loops.add(L);
    this._updateLoop(L, true);
    this._startLoop(L);
    const self = this;
    return {
      stop(fadeSec = 0.3) { self._stopLoop(L, fadeSec); },
      set(o = {}) {
        if (!o || L.dead) return;
        if (o.vol != null) L.vol = Math.max(0, +o.vol || 0);
        if (o.rate != null) {
          L.rate = Math.max(0.05, +o.rate || 1);
          for (const s of L.srcs) try { s.playbackRate.setTargetAtTime(L.rate, c.currentTime, 0.05); } catch (e) { /* ignore */ }
        }
        if (o.pos && L.panner) { L.pos.x = +o.pos.x || 0; L.pos.y = +o.pos.y || 0; L.pos.z = +o.pos.z || 0; self._setPannerPos(L.panner, L.pos, false); }
        self._updateLoop(L, false);
      },
      get playing() { return !L.dead; },
    };
  }

  _startLoop(L) {
    if (L.dead || L.started) return;
    const buf = this._pickBuffer(L.name);
    if (!buf) { this._urgent(L.name); return; } // retried from _tick
    const c = this.ctx, t = c.currentTime + 0.01;
    L.started = true;
    if (!L.chain) {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = L.rate * (1 + (Math.random() - 0.5) * 0.02);
      s.connect(L.g);
      s.start(t, Math.random() * buf.duration);
      L.srcs.push(s);
    } else {
      L.nextAt = t;
      this._chainNext(L);
    }
    L.g.gain.cancelScheduledValues(t);
    L.g.gain.setValueAtTime(0, t);
    L.g.gain.linearRampToValueAtTime(L.vol, t + 0.25);
  }

  _chainNext(L) {
    const c = this.ctx;
    while (!L.dead && L.nextAt < c.currentTime + 0.6) {
      const buf = this._pickBuffer(L.name);
      if (!buf) return;
      const s = c.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = L.rate * (1 + (Math.random() - 0.5) * 0.06);
      s.connect(L.g);
      const at = Math.max(L.nextAt, c.currentTime + 0.01);
      s.start(at);
      s.onended = () => { const i = L.srcs.indexOf(s); if (i >= 0) L.srcs.splice(i, 1); try { s.disconnect(); } catch (e) { /* ignore */ } };
      L.srcs.push(s);
      const gap = L.def.chain ? 0.15 + Math.random() * 0.9 : -0.05;
      L.nextAt = at + buf.duration / s.playbackRate.value + gap;
    }
  }

  _updateLoop(L, immediate) {
    const c = this.ctx, t = c.currentTime;
    let att = 1, d = 0;
    if (L.pos) { d = this._dist(L.pos); att = this._att(d, L.ref); }
    const tc = immediate ? 0.01 : 0.08;
    if (L.started) L.g.gain.setTargetAtTime(L.vol, t, tc);
    L.lp.frequency.setTargetAtTime(L.pos && d > 12 ? Math.max(1100, 20000 * Math.exp(-(d - 12) / 32)) : 20000, t, tc);
    if (L.send) {
      const P = REVERB_PRESETS[this._reverbName] || REVERB_PRESETS.outdoor;
      L.send.gain.setTargetAtTime(L.cat.send * (P.send / 0.3) * (L.pos ? Math.sqrt(att) : 1), t, tc);
    }
  }

  _stopLoop(L, fade = 0.3) {
    if (L.dead) return;
    L.dead = true;
    const c = this.ctx, t = c.currentTime;
    fade = Math.max(0.01, +fade || 0.01);
    try {
      L.g.gain.cancelScheduledValues(t);
      L.g.gain.setValueAtTime(L.g.gain.value, t);
      L.g.gain.linearRampToValueAtTime(0, t + fade);
    } catch (e) { /* ignore */ }
    for (const s of L.srcs) try { s.stop(t + fade + 0.02); } catch (e) { /* ignore */ }
    setTimeout(() => {
      for (const n of [L.g, L.lp, L.panner, L.send, ...L.srcs]) if (n) try { n.disconnect(); } catch (e) { /* ignore */ }
      this.loops.delete(L);
    }, (fade + 0.2) * 1000);
  }

  // -------------------------------------------------------------------------
  // housekeeping

  update(dt) { this._tick(); }

  _tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // voices
    if (this.voices.length) {
      let w = 0;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        if (v.dead || now > v.end + 0.5) { if (!v.dead) { v.dead = true; this._disconnect(v); } continue; }
        this.voices[w++] = v;
      }
      this.voices.length = w;
    }
    // loops: late starts, chains, distance updates
    this._loopTick = (this._loopTick || 0) + 1;
    for (const L of this.loops) {
      if (L.dead) continue;
      if (!L.started) this._startLoop(L);
      else if (L.chain) this._chainNext(L);
      if (L.pos && this._loopTick % 3 === 0) this._updateLoop(L, false);
    }
    // heartbeat
    if (this._heart > 0.01) {
      const buf = this._pickBuffer('_heartbeat');
      if (buf) {
        if (this._heartNext < now) this._heartNext = now + 0.05;
        while (this._heartNext < now + 0.2) {
          const s = this.ctx.createBufferSource();
          s.buffer = buf;
          const g = this.ctx.createGain();
          g.gain.value = 0.35 + 0.75 * this._heart;
          s.connect(g); g.connect(this.sfxBus);
          s.start(this._heartNext);
          s.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
          this._heartNext += 60 / (58 + 70 * this._heart);
        }
      }
    }
    this.music.tick();
    this.ambience.tick();
  }

  stopAll() {
    if (!this.ctx) { this.music.state = 'none'; this.ambience.name = null; this._heart = 0; return; }
    for (const v of this.voices) this._kill(v, 0.05);
    for (const L of this.loops) this._stopLoop(L, 0.1);
    this.heartbeat(0);
    this.music.stopAll();
    this.ambience.stopAll();
  }

  /** Debug info. */
  stats() {
    return {
      enabled: this.enabled, ready: this.ready, state: this.ctx ? this.ctx.state : 'none',
      voices: this.voices.filter((v) => !v.dead).length, loops: this.loops.size,
      loaded: this.loadFraction, initMs: Math.round(this.initTime), music: this.music.state, reverb: this._reverbName,
      ambience: this.ambience.name,
    };
  }

  /** Test helper: peak/rms/duration of every rendered buffer. */
  _bufferReport() {
    const out = {};
    for (const [n, arr] of this.buffers) out[n] = arr.map((b) => bufferStats(b));
    return out;
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this.ctx) try { this.ctx.close(); } catch (e) { /* ignore */ }
    this.enabled = false;
  }
}

export default AudioEngine;
