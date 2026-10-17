// AudioEngine: the context-agnostic core behind HW.audio. One instance drives the live
// AudioContext (audio.js); QA builds another on an OfflineAudioContext (renderOffline), so
// every sound is produced by exactly the same code in both places.
//
// Responsibilities: sfx voices (buffer + graph recipes, variants cache, voice caps, cleanup),
// positional placement (pan / distance / occlusion), loops, ambience beds + layers, music
// tracks, scene gains (silence / duck), the event scheduler ("pump") and reverb spaces.
import { Mixer, spaceName } from './mixer.js';
import { Voice } from './voice.js';
import { Rand, mulberry32, Noise, smoothCurve, alloc, normalize, edges, dcBlock, clamp, dbToGain, chans } from './dsp.js';
import { SFX } from './sfx.js';
import { LOOPS } from './loops.js';
import { BEDS, Bed, BED_SPACE } from './ambience.js';
import { TRACKS, Track } from './music.js';
import { stepId, STEP_SURFACES } from './footsteps.js';
import { blipId } from './voices.js';

const LOOKAHEAD = 0.6;          // s of audio scheduled ahead by the pump
const MAX_VOICES = 40;          // one-shot sfx/ui voices
const MAX_STEPS = 10;           // footsteps have their own, lower-priority pool
const NEAR = 24, FAR = 480;     // px: full volume inside NEAR, silent beyond FAR (TECH §10)
const PAN_SPAN = 180;           // px offset that reaches the pan limit
const CACHE_BYTES = 48 * 1024 * 1024;
const SILENT = 0;               // scene gain while silence(true)

export class AudioEngine {
  /** opts: offline (bool), seed (int, offline determinism), dynamics, analyser, occluder fn getter */
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.offline = !!opts.offline;
    this.R = new Rand(opts.seed != null ? mulberry32(opts.seed) : Math.random);
    this.mix = new Mixer(ctx, { dynamics: opts.dynamics !== false, analyser: !!opts.analyser });
    this.getOccluder = opts.getOccluder || (() => null);
    this.listener = { x: 0, y: 0, set: false, moved: true };
    this.voices = [];            // active one-shot voices
    this.steps = [];             // active footstep voices
    this.loops = new Set();      // active loop handles
    this.tasks = [];             // scheduler tasks { next, run(t) → next | null, dead }
    this.cache = new Map();      // `${id}|${key}` → { bufs: AudioBuffer[], last, bytes }
    this.cacheBytes = 0;
    this.noiseBufs = {};
    this.curves = new Map();
    this.bed = null; this.bedId = null; this.fading = [];
    this.layers = new Map();
    this.track = null; this.trackId = null;
    this.silenced = false; this.duckLevel = 1;
    this.manualSpace = null;
    this.stripLevel = 0;
    this.feet = new Map();       // entity id → last foot (alternation)
    this._lastPosUpdate = 0;
    this.mix.setVolumes({ master: 1, music: 1, sfx: 1, ambience: 1 }, 0);
    this.mix.setSpace('room', 0.01);
  }

  get now() { return this.ctx.currentTime; }
  /** Live engines only make one-shot sounds while the context runs (nothing piles up while
   *  suspended); offline engines always do. */
  get live() { return this.offline || this.ctx.state === 'running'; }

  // ==== shared resources ============================================================================
  noiseBuffer(color) {
    let b = this.noiseBufs[color];
    if (!b) {
      const sr = this.ctx.sampleRate, n = new Noise(new Rand(mulberry32(color.length * 101 + 7)), color);
      const xf = Math.round(sr * 0.05), raw = alloc(sr, 6 + 0.05);
      for (let i = 0; i < raw.length; i++) raw[i] = n.next();
      // seamless loop: fade the head in over the samples that follow the cut
      const N = raw.length - xf;
      for (let i = 0; i < xf; i++) { const a = i / xf; raw[i] = raw[i] * a + raw[N + i] * (1 - a); }
      const data = raw.subarray(0, N);
      dcBlock(data, sr, 8);
      normalize(data, color === 'white' ? -4 : -2);
      b = this.ctx.createBuffer(1, data.length, sr);
      b.copyToChannel(data, 0);
      this.noiseBufs[color] = b;
    }
    return b;
  }
  /** Loopable smooth-random modulation curve (2 s @ 8 kHz with `points` control points).
   *  Play it at playbackRate = 2 / periodSeconds for a slow random LFO. */
  curve(points = 12, seed = 0) {
    const key = `${points}|${seed}`;
    let b = this.curves.get(key);
    if (!b) {
      const data = smoothCurve(8000, 2, points / 2, new Rand(mulberry32(points * 977 + seed * 131 + 3)));
      b = this.ctx.createBuffer(1, data.length, 8000);
      b.copyToChannel(data, 0);
      this.curves.set(key, b);
    }
    return b;
  }

  // ==== scheduler ===================================================================================
  /** Add a scheduler task. run(t) receives the scheduled absolute time and returns the next
   *  time (or null to finish). Returns the task (set task.dead = true to cancel). */
  addTask(first, run, owner = null) {
    const task = { next: first, run, owner, dead: false };
    this.tasks.push(task);
    if (!this.offline) this.pump(this.now + LOOKAHEAD);
    return task;
  }
  /** Run every task due before `until` (absolute ctx time). Offline renders pump once over the
   *  whole duration; live engines pump every tick with a short look-ahead. */
  pump(until) {
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      let guard = 0;
      while (!task.dead && task.next != null && task.next < until && guard++ < 500) {
        try { task.next = task.run(task.next); } catch (e) { console.error('[audio] task failed', e); task.dead = true; }
      }
      if (task.next == null) task.dead = true;
    }
    if (this.tasks.some((t) => t.dead)) this.tasks = this.tasks.filter((t) => !t.dead);
  }

  /** Periodic housekeeping (live): schedule ahead, retire finished voices, update placement. */
  tick() {
    const now = this.now;
    this.pump(now + LOOKAHEAD);
    this._sweep(this.voices, now);
    this._sweep(this.steps, now);
    for (const h of this.loops) if (h.voice.disposed || (h.voice.stopping && now > h.voice.end)) { h.voice.dispose(); this.loops.delete(h); }
    this.fading = this.fading.filter((x) => { if (now > x.end) { x.dispose(); return false; } x.sweep?.(now); return true; });
    this.bed?.sweep(now);
    for (const l of this.layers.values()) l.sweep(now);
    this.track?.sweep(now);
    // positional updates (≤ 12 Hz): long sfx and loops follow the listener / occlusion changes
    if (now - this._lastPosUpdate > 0.08) {
      this._lastPosUpdate = now;
      for (const v of this.voices) if (v.pos && v.end - now > 0.25) v.place(this.placeFor(v.pos.x, v.pos.y, v.opts), 0.06);
      for (const h of this.loops) if (h.voice.pos) h.voice.place(this.placeFor(h.voice.pos.x, h.voice.pos.y, h.voice.opts), 0.08);
    }
  }
  _sweep(list, now) {
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (now > v.end + 0.15) { v.dispose(); list[i] = list[list.length - 1]; list.pop(); }
    }
  }

  // ==== placement ===================================================================================
  setListener(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const L = this.listener;
    if (L.x !== x || L.y !== y) { L.x = x; L.y = y; L.moved = true; }
    L.set = true;
  }
  /** World position → { gain, pan, lp, wet, d, occ } relative to the listener. */
  placeFor(x, y, opts = {}) {
    const L = this.listener;
    if (!L.set) return { gain: 1, pan: 0, lp: 20000, wet: 1, d: 0, occ: 0 };
    const dx = x - L.x, dy = y - L.y, d = Math.hypot(dx, dy);
    const far = opts.far || FAR;
    let gain = d <= NEAR ? 1 : d >= far ? 0 : Math.pow(1 - (d - NEAR) / (far - NEAR), 1.6);
    const pan = clamp(dx / PAN_SPAN, -1, 1) * 0.82;
    let occ = 0;
    const occluder = this.getOccluder();
    if (occluder && d > 8) { try { occ = clamp(Number(occluder(L.x, L.y, x, y)) || 0); } catch { occ = 0; } }
    gain *= 1 - 0.55 * occ;
    const lp = Math.min(20000 * Math.exp(-d / 650), 18000 * Math.pow(0.03, occ));
    const wet = 0.55 + 0.9 * clamp(d / 320);
    return { gain, pan, lp, wet, d, occ };
  }
  /** Relative placement for ambience events: pan -1..1 and distance 0..1 (0 = at the ear). */
  placeRel(pan, dist) {
    return { gain: Math.pow(1 - 0.85 * clamp(dist), 1.5), pan: clamp(pan, -1, 1), lp: 18000 * Math.pow(0.12, clamp(dist)), wet: 0.6 + 1.2 * clamp(dist) };
  }

  // ==== buffers =====================================================================================
  /** Get (or synthesise) a buffer variant for a buffer recipe. */
  buffer(id, entry, opts = {}) {
    const extra = entry.key ? entry.key(opts) : '';
    const key = extra ? `${id}|${extra}` : id;
    let slot = this.cache.get(key);
    if (slot) { this.cache.delete(key); this.cache.set(key, slot); } // LRU touch
    else { slot = { bufs: [], last: -1, bytes: 0 }; this.cache.set(key, slot); }
    const want = Math.max(1, entry.var ?? 3);
    let idx;
    if (slot.bufs.length < want) {
      const b = this._synth(id, entry, opts);
      slot.bufs.push(b); slot.bytes += b.length * b.numberOfChannels * 4; this.cacheBytes += b.length * b.numberOfChannels * 4;
      idx = slot.bufs.length - 1;
      this._trimCache(key);
    } else {
      idx = this.R.int(0, slot.bufs.length - 1);
      if (idx === slot.last && slot.bufs.length > 1) idx = (idx + 1) % slot.bufs.length;
    }
    slot.last = idx;
    return slot.bufs[idx];
  }
  _synth(id, entry, opts) {
    const sr = this.ctx.sampleRate, R = this.R.fork();
    const S = { sr, R, opts, id, alloc: (sec) => alloc(sr, sec), stereo: (sec) => [alloc(sr, sec), alloc(sr, sec)] };
    let data = entry.gen(S);
    if (entry.dc !== false) dcBlock(data, sr);
    normalize(data, entry.peak ?? -6);
    if (entry.edges !== false) edges(data, sr, 0.0005, 0.004);
    const cs = chans(data);
    const b = this.ctx.createBuffer(cs.length, cs[0].length, sr);
    cs.forEach((c, i) => b.copyToChannel(c, i));
    return b;
  }
  _trimCache(keep) {
    for (const [k, slot] of this.cache) {
      if (this.cacheBytes <= CACHE_BYTES) break;
      if (k === keep) continue;
      this.cacheBytes -= slot.bytes; this.cache.delete(k);
    }
  }

  // ==== sfx =========================================================================================
  /** Core voice factory used by sfx, loops, beds, footsteps, blips and murmur.
   *  o: { t (abs), x, y, place, vol, rate, dest, send, bus, wet, dur, far } */
  play(id, o = {}) {
    const entry = SFX[id];
    if (!entry) { warnOnce(`unknown sfx '${id}'`); return null; }
    const ctx = this.ctx;
    const t0 = Math.max(ctx.currentTime + 0.002, o.t ?? ctx.currentTime + 0.004) + (o.delay || 0);
    const pos = Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: o.x, y: o.y } : null;
    let place = o.place || (pos ? this.placeFor(pos.x, pos.y, o) : null);
    if (pos && place.gain <= 0.0005 && !o.loop) return null; // inaudible: skip the work
    if (o.pan != null && !place) place = { gain: 1, pan: clamp(o.pan, -1, 1), lp: 20000, wet: 1 };
    const bus = o.bus || entry.bus || 'sfx';
    const dest = o.dest || this.mix.bus[bus];
    const send = o.send !== undefined ? o.send : bus === 'ui' || entry.wet === 0 ? null : this.mix.sends[bus === 'ambience' ? 'ambience' : 'sfx'];
    const vjit = entry.vjit ?? 1.5, pjit = entry.jit ?? 0.025;
    const vol = (o.vol ?? 1) * dbToGain(this.R.bi() * vjit) * dbToGain(entry.gain || 0);
    const rate = (o.rate ?? 1) * (1 + this.R.bi() * pjit);
    const v = new Voice(this, { id, dest, send, t0, rate, vol, wet: (entry.wet ?? 1) * (place?.wet ?? 1), spatial: !!place });
    v.pos = pos; v.opts = o;
    if (place) v.place(place, 0, t0);
    if (entry.gen) {
      const buf = this.buffer(id, entry, o);
      const s = v.src(buf, 1);
      s.connect(v.out);
      v.play(s, 0, buf.duration * (o.loop ? 1 : 1.0));
    } else if (entry.graph) {
      entry.graph(v, o, this);
      if (v.end === Infinity && !o.loop) v.end = v.T(entry.dur || 4);
    }
    return v;
  }

  /** One-shot sfx with voice management. Returns a handle { stop, setPos, setVol }. */
  sfx(id, opts = {}) {
    if (!this.live || !id) return NULL_HANDLE;
    const entry = SFX[id];
    if (!entry) { warnOnce(`unknown sfx '${id}'`); return NULL_HANDLE; }
    // per-id concurrency (e.g. only one school bell at a time)
    const max = entry.max ?? 4;
    let same = 0, oldest = null;
    for (const v of this.voices) if (v.id === id && !v.stopping) { same++; if (!oldest || v.t0 < oldest.t0) oldest = v; }
    if (same >= max && oldest) oldest.stop(0.04);
    if (this.voices.length >= MAX_VOICES) this._steal(this.voices);
    const v = this.play(id, opts);
    if (!v) return NULL_HANDLE;
    this.voices.push(v);
    return handleFor(this, v);
  }
  _steal(list) {
    let oldest = null;
    for (const v of list) if (!v.stopping && (!oldest || v.t0 < oldest.t0)) oldest = v;
    if (oldest) oldest.stop(0.03);
  }

  /** Continuous loop: a LOOPS recipe, or any sfx id re-triggered back to back. */
  loop(id, opts = {}) {
    if (!id) return NULL_HANDLE;
    const L = LOOPS[id], entry = SFX[id];
    if (!L && !entry) { warnOnce(`unknown loop '${id}'`); return NULL_HANDLE; }
    const pos = Number.isFinite(opts.x) && Number.isFinite(opts.y) ? { x: opts.x, y: opts.y } : null;
    const place = pos ? this.placeFor(pos.x, pos.y, opts) : null;
    const bus = opts.bus || L?.bus || entry?.bus || 'sfx';
    const fade = opts.fade ?? 0.4;
    const v = new Voice(this, { id, dest: this.mix.bus[bus], send: bus === 'ui' ? null : this.mix.sends[bus === 'ambience' ? 'ambience' : 'sfx'],
      t0: this.now + 0.01, rate: opts.rate || 1, vol: opts.vol ?? 1, wet: (L?.wet ?? entry?.wet ?? 1) * (place?.wet ?? 1), spatial: !!pos });
    v.pos = pos; v.opts = opts;
    if (place) v.place(place, 0, v.t0);
    v.out.gain.setValueAtTime(0, v.t0);
    v.out.gain.linearRampToValueAtTime(1, v.t0 + fade);
    if (L?.graph) {
      L.graph(v, opts, this);
    } else {
      const srcId = L?.retrigger || id;
      const [g0, g1] = L?.gap || [0.02, 0.25];
      const task = this.addTask(v.t0, (t) => {
        if (v.disposed || v.stopping) return null;
        const e = SFX[srcId];
        const buf = this.buffer(srcId, e, opts);
        const r = (opts.rate || 1) * (1 + this.R.bi() * (e.jit ?? 0.025));
        const s = this.ctx.createBufferSource();
        s.buffer = buf; s.playbackRate.value = r;
        const g = this.ctx.createGain(); g.gain.value = dbToGain(this.R.bi() * (e.vjit ?? 1.5));
        s.connect(g); g.connect(v.out);
        s.start(t); s.stop(t + buf.duration / r + 0.01);
        s.onended = () => { try { g.disconnect(); s.disconnect(); } catch { /* ignore */ } };
        const len = (L?.period ? L.period(this.R, opts) : buf.duration / r * (L?.overlap ?? 1));
        return t + len + this.R.range(g0, g1);
      }, v);
      v.task = task;
    }
    v.end = Infinity;
    const h = handleFor(this, v, true);
    this.loops.add(h);
    return h;
  }

  // ==== footsteps / voices ==========================================================================
  footstep(surface, opts = {}) {
    if (!this.live) return;
    const surf = STEP_SURFACES.includes(surface) ? surface : 'lino';
    const who = opts.id || (opts.npc ? 'npc' : 'player');
    const foot = (this.feet.get(who) || 0) ^ 1;
    this.feet.set(who, foot);
    if (this.feet.size > 64) this.feet.clear();
    const colonel = who === 'colonel';
    const id = colonel ? 'step_colonel' : stepId(surf, !!opts.run);
    if (this.steps.length >= MAX_STEPS) { if (opts.npc) return; this._steal(this.steps); }
    // alternating feet: the trailing foot lands a touch softer and lower
    const vol = (opts.vol ?? 1) * (opts.npc && !colonel ? 0.62 : 1) * (foot ? 1 : 0.86);
    const rate = (opts.rate ?? 1) * (foot ? 1 : 0.965);
    const v = this.play(id, { ...opts, vol, rate });
    if (v) this.steps.push(v);
  }
  blip(charId) {
    if (!this.live) return;
    const id = blipId(charId);
    if (!id) return;
    const v = this.play(id, { bus: 'ui' });
    if (v) { if (this.voices.length >= MAX_VOICES) this._steal(this.voices); this.voices.push(v); }
  }
  murmur(sec = 1.5) {
    if (!this.live) return NULL_HANDLE;
    for (const v of this.voices) if (v.id === 'colonel_murmur' && !v.stopping) v.stop(0.25);
    const v = this.play('colonel_murmur', { dur: clamp(Number(sec) || 1.5, 0.4, 20) });
    if (!v) return NULL_HANDLE;
    this.voices.push(v);
    return handleFor(this, v);
  }

  // ==== ambience / layers ===========================================================================
  ambience(id, fade = 2) {
    if (id === 'period_buzz') { this.layer('period_buzz', true, fade); return; }
    id = id || null;
    if (id === this.bedId) return;
    if (this.bed) { this.bed.stop(fade); this.fading.push(this.bed); }
    this.bed = null; this.bedId = id;
    this.stripLevel = 0;
    if (!id) return;
    if (!BEDS[id]) { warnOnce(`unknown ambience '${id}'`); return; }
    this.bed = new Bed(this, id, BEDS[id], { fade, dest: this.mix.bus.ambience, send: this.mix.sends.ambience });
    if (!this.manualSpace && BED_SPACE[id]) this.mix.setSpace(BED_SPACE[id], Math.max(0.3, fade * 0.6));
    this.manualSpace = null;
  }
  /** Ambience layers play over the current bed (e.g. 'period_buzz' during periods). Any
   *  ambience id can be used as a layer. */
  layer(id, on = true, fade = 1) {
    const cur = this.layers.get(id);
    if (on) {
      if (cur || !BEDS[id]) { if (!BEDS[id]) warnOnce(`unknown layer '${id}'`); return; }
      this.layers.set(id, new Bed(this, id, BEDS[id], { fade, dest: this.mix.bus.ambience, send: this.mix.sends.ambience, layer: true }));
    } else if (cur) {
      cur.stop(fade); this.fading.push(cur); this.layers.delete(id);
    }
  }
  /** Long-hall effect: mute the bed's strata one by one (0 = full bed). */
  stripAmbience(n = 0, fade = 1.5) {
    this.stripLevel = Math.max(0, n | 0);
    this.bed?.strip(this.stripLevel, fade);
  }

  // ==== music =======================================================================================
  music(id, fade = 2) {
    id = id || null;
    if (id === this.trackId) return;
    if (this.track) { this.track.stop(fade); this.fading.push(this.track); }
    this.track = null; this.trackId = id;
    if (!id) return;
    if (!TRACKS[id]) { warnOnce(`unknown music '${id}'`); return; }
    this.track = new Track(this, id, TRACKS[id], { fade, dest: this.mix.bus.music, send: this.mix.musicVerbIn });
  }

  // ==== scene / mix =================================================================================
  silence(on = true, fade = 0.5) {
    this.silenced = !!on;
    this._scene(fade);
  }
  duck(level = 1, fade = 0.5) {
    this.duckLevel = clamp(Number(level), 0, 1);
    this._scene(fade);
  }
  _scene(fade) {
    const g = (this.silenced ? SILENT : 1) * this.duckLevel;
    this.mix.setScene('music', g, fade);
    this.mix.setScene('ambience', g, fade);
  }
  setVolumes(v) { this.mix.setVolumes(v || {}); }
  setSpace(kind, fade = 0.8) {
    const name = spaceName(kind);
    if (!name) { warnOnce(`unknown space '${kind}'`); return this.mix.space; }
    this.manualSpace = name;
    return this.mix.setSpace(name, fade);
  }
  level() { return this.mix.level(); }

  /** Stop everything (used by renderOffline cleanup and the preview page). */
  stopAll(fade = 0.2) {
    for (const v of this.voices) v.stop(fade);
    for (const h of this.loops) h.stop(fade);
    this.ambience(null, fade);
    for (const id of [...this.layers.keys()]) this.layer(id, false, fade);
    this.music(null, fade);
  }
}

// ---- handles -----------------------------------------------------------------------------------
export const NULL_HANDLE = Object.freeze({ stop() {}, setPos() {}, setVol() {}, playing: false });

function handleFor(eng, v, isLoop = false) {
  return {
    voice: v,
    get playing() { return !v.disposed && !v.stopping && eng.now < v.end; },
    stop(fade = isLoop ? 0.5 : 0.05) {
      if (v.task) v.task.dead = true;
      v.stop(fade);
      if (isLoop) v.end = eng.now + Math.max(0.005, fade) + 0.05;
    },
    setPos(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !v.panner) return;
      v.pos = { x, y };
      v.place(eng.placeFor(x, y, v.opts), 0.05);
    },
    setVol(vol, fade = 0.1) { v.setVol(Math.max(0, Number(vol) || 0), fade); },
  };
}

const warned = new Set();
function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn(`[audio] ${msg}`); } }
