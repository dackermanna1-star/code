// Every sound in the hotel, made on the spot with WebAudio: the storm, the
// building groaning, your footsteps on carpet, wood, marble and iron, the
// doors, the lift, the telephone, the music box, the piano, the old
// gramophone waltz - and him: the heavy dragging step, his keys, his
// breathing, his scream. Sounds come from where they are (3D, through
// headphones), echo in the big rooms and are muffled through walls.
import * as THREE from 'three';
import { sounds } from '../../engine/Sound.js';
import { H } from './state.js';
import { GROUP } from '../../engine/Part.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class HotelAudio {
  constructor() { this.ready = false; this.loops = []; this.volume = 0.8; this.timers = []; }

  init(volume = 0.8) {
    if (this.ready) return true;
    let c = null, bus = null;
    const h = sounds.customLoop((ctx, out) => { c = ctx; bus = out; return { stop() {} }; }, 1);
    if (!c) return false;
    this.c = c; this.h = h;
    this.out = c.createGain(); this.out.gain.value = volume; this.out.connect(bus);
    this.volume = volume;
    // a compressor keeps the screams from tearing your ears off
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    this.comp.connect(this.out);
    this.dry = c.createGain(); this.dry.connect(this.comp);
    this.rev = c.createConvolver(); this.rev.buffer = this._impulse(2.6, 2.4);
    this.wet = c.createGain(); this.wet.gain.value = 0.3; this.rev.connect(this.wet); this.wet.connect(this.comp);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.9; this.musicBus.connect(this.comp);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 1; this.ambBus.connect(this.comp);
    this.N = { white: this._noise('white'), pink: this._noise('pink'), brown: this._noise('brown') };
    this.shaper = this._curve(60);
    this.ready = true;
    this._ambience();
    return true;
  }
  setVolume(v) { this.volume = v; if (this.out) this.out.gain.setTargetAtTime(v, this.c.currentTime, 0.05); }
  pause(on) { if (!this.ready) return; if (on) this.c.suspend?.(); else this.c.resume?.(); if (window.speechSynthesis) { if (on) speechSynthesis.pause(); else speechSynthesis.resume(); } }

  // --- plumbing ---------------------------------------------------------------------------------------------------------------------------
  _noise(kind) {
    const c = this.c, len = c.sampleRate * 3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2; }
      else d[i] = w;
    }
    return b;
  }
  _impulse(secs, decay) {
    const c = this.c, len = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 80 ? i / 80 : 1); }
    return b;
  }
  _curve(k) { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; cv[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return cv; }
  src(kind = 'white', loop = false) { const n = this.c.createBufferSource(); n.buffer = this.N[kind]; n.loop = loop; if (!loop) n.loopStart = 0; return n; }
  osc(type, f) { const o = this.c.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  filt(type, f, q = 1) { const x = this.c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
  gain(v = 1) { const g = this.c.createGain(); g.gain.value = v; return g; }
  env(param, t, a, peak, d, end = 0.0001) { param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); param.exponentialRampToValueAtTime(end, t + a + d); }
  chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
  /** Where a one-shot goes: through a 3D panner at pos (muffled if there's a wall in the way), with some reverb. */
  bus(pos, o = {}) {
    const c = this.c, g = this.gain(o.vol ?? 1);
    let head = g;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = o.ref ?? 7; p.maxDistance = 400; p.rolloffFactor = o.roll ?? 1.25;
      setPos(p, pos);
      if (this.occluded(pos)) { const lp = this.filt('lowpass', o.muffle ?? 650, 0.7); g.connect(lp); head = lp; g.gain.value *= 0.55; }
      head.connect(p); head = p;
    }
    head.connect(this.dry);
    const send = this.gain((o.rev ?? 1) * 0.55); head.connect(send); send.connect(this.rev);
    return g;
  }
  occluded(pos) {
    const cam = H.world?.camera?.position;
    if (!cam || cam.distanceTo(pos) < 2) return false;
    const hit = H.world.raycast(cam, pos, { mask: GROUP.WORLD });
    return !!hit && hit.distance < cam.distanceTo(pos) - 1.2;
  }
  now() { return this.c.currentTime + 0.01; }
  /** play fn(out, t) at pos. */
  play(pos, fn, o = {}) { if (!this.ready || H.paused) return; fn(this.bus(pos, o), this.now()); }

  // --- each frame: the listener, the ambience, the heartbeat, the music --------------------------------------------------------------------
  update(dt, cam) {
    if (!this.ready) return;
    const L = this.c.listener;
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) { L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z; L.forwardX.value = _f.x; L.forwardY.value = _f.y; L.forwardZ.value = _f.z; L.upX.value = _u.x; L.upY.value = _u.y; L.upZ.value = _u.z; }
    else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    // how big the space sounds
    const area = H.story?.area?.() || 'room';
    const wetT = { lobby: 0.75, stairs: 0.8, corridor: 0.42, ball: 0.7, basement: 0.55, room: 0.22, outside: 0.08 }[area] ?? 0.3;
    this.wet.gain.setTargetAtTime(wetT, this.c.currentTime, 0.6);
    const outside = area === 'outside';
    if (this.rain) { this.rain.g.gain.setTargetAtTime(outside ? 0.5 : 0.045 + (H.story?.nearWindow?.() || 0) * 0.08, this.c.currentTime, 0.5); this.rain.f.frequency.setTargetAtTime(outside ? 7000 : 2200, this.c.currentTime, 0.5); }
    if (this.drone) { this.drone.g.gain.setTargetAtTime((outside ? 0.05 : 0.22) * (H.story?.dread ?? 1), this.c.currentTime, 1); }
    if (this.hum) this.hum.g.gain.setTargetAtTime(H.lights?.power && !outside ? 0.035 : 0, this.c.currentTime, 0.4);
    // his breathing follows him; the heartbeat follows how close he is
    const m = H.monster;
    if (this.mBreath) {
      const on = m?.active && m.visibleBody;
      const d = on ? m.head.distanceTo(cam.position) : 99;
      setPos(this.mBreath.p, on ? m.head : cam.position);
      this.mBreath.g.gain.setTargetAtTime(on ? Math.min(0.9, 9 / (d + 2)) * (m.state === 'chase' ? 1.4 : 1) : 0, this.c.currentTime, 0.15);
      this.mBreath.lp.frequency.setTargetAtTime(on && this.occludedCheap(m.head) ? 500 : 2600, this.c.currentTime, 0.2);
      this.mBreath.rate.frequency.setTargetAtTime(m?.state === 'chase' ? 1.6 : 0.42, this.c.currentTime, 0.3);
    }
    const near = m?.active ? Math.max(0, 1 - m.pos.distanceTo(cam.position) / 30) : 0;
    this._beat = (this._beat || 0) - dt;
    const fearBeat = Math.max(near, H.player?.mode === 'hide' && m?.active && near > 0.2 ? 0.8 : 0);
    if (fearBeat > 0.15 && this._beat <= 0) { this.heartbeat(fearBeat); this._beat = 60 / (70 + fearBeat * 80); }
    this._music(dt);
    this._random(dt);
  }
  occludedCheap(pos) { this._occT = (this._occT || 0) + 1; if (this._occT % 6 === 0) this._occ = this.occluded(pos); return this._occ; }

  // --- the ambience -------------------------------------------------------------------------------------------------------------------------
  _ambience() {
    const c = this.c, t = this.now();
    // the building's drone: two low tones beating against each other, a rumble, the wind in the chimneys
    const dg = this.gain(0); dg.connect(this.ambBus);
    for (const f of [41.2, 41.9, 61.7]) { const o = this.osc('sine', f); const g = this.gain(f > 60 ? 0.12 : 0.4); this.chain(o, g, dg); o.start(t); }
    const rum = this.src('brown', true), rl = this.filt('lowpass', 110, 0.7), rg = this.gain(0.9); this.chain(rum, rl, rg, dg); rum.start(t);
    const wind = this.src('pink', true), wb = this.filt('bandpass', 420, 6), wg = this.gain(0.25); this.chain(wind, wb, wg, dg); wind.start(t);
    const lfo = this.osc('sine', 0.07), lg = this.gain(260); lfo.connect(lg); lg.connect(wb.frequency); lfo.start(t);
    const lfo2 = this.osc('sine', 0.13), lg2 = this.gain(0.2); lfo2.connect(lg2); lg2.connect(wg.gain); lfo2.start(t);
    this.drone = { g: dg };
    // rain on the windows and the roof
    const rn = this.src('pink', true), rhp = this.filt('highpass', 500, 0.5), rlp = this.filt('lowpass', 2200, 0.5), rgn = this.gain(0.05);
    this.chain(rn, rhp, rlp, rgn, this.ambBus); rn.start(t);
    this.rain = { g: rgn, f: rlp };
    // mains hum when the power is on
    const hg = this.gain(0); hg.connect(this.ambBus);
    for (const [f, a] of [[60, 0.5], [120, 0.3], [180, 0.12]]) { const o = this.osc('sine', f); const g = this.gain(a); this.chain(o, g, hg); o.start(t); }
    this.hum = { g: hg };
    // his breathing (a loop that follows him round)
    const bn = this.src('pink', true), f1 = this.filt('bandpass', 520, 3), f2 = this.filt('bandpass', 1350, 5), mix = this.gain(1), am = this.gain(0), lp = this.filt('lowpass', 2600, 0.7), out = this.gain(0);
    bn.connect(f1); bn.connect(f2); f1.connect(mix); f2.connect(mix);
    const rate = this.osc('sine', 0.42), rg2 = this.gain(0.5), off = c.createConstantSource ? c.createConstantSource() : null;
    rate.connect(rg2); rg2.connect(am.gain);
    if (off) { off.offset.value = 0.5; off.connect(am.gain); off.start(t); }
    // a low wet growl under it
    const gr = this.osc('sawtooth', 52), grf = this.filt('lowpass', 240, 2), grg = this.gain(0.35); this.chain(gr, grf, grg, am);
    const vib = this.osc('sine', 5.5), vg = this.gain(3); vib.connect(vg); vg.connect(gr.frequency); vib.start(t);
    const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 5; p.rolloffFactor = 1.4;
    this.chain(mix, am, lp, out, p); p.connect(this.dry); const s = this.gain(0.5); p.connect(s); s.connect(this.rev);
    bn.start(t); rate.start(t); gr.start(t);
    this.mBreath = { g: out, p, lp, rate };
  }
  /** Now and then: the building settles, pipes knock, something walks about upstairs. */
  _random(dt) {
    this._rt = (this._rt ?? 6) - dt;
    if (this._rt > 0) return;
    this._rt = rnd(7, 18);
    const cam = H.world.camera.position, a = Math.random() * Math.PI * 2, d = rnd(10, 30);
    const at = new THREE.Vector3(cam.x + Math.cos(a) * d, cam.y + rnd(-2, 8), cam.z + Math.sin(a) * d);
    const r = Math.random(), area = H.story?.area?.();
    if (area === 'outside') { if (r < 0.5) this.creak(at, 0.4); return; }
    if (r < 0.35) this.creak(at, rnd(0.3, 0.7));
    else if (r < 0.5) this.knock(at, Math.random() < 0.5 ? 2 : 1, 0.35);
    else if (r < 0.65) this.pipe(at);
    else if (r < 0.78) this.stepsAbove(at.setY(cam.y + 13));
    else if (r < 0.88) this.whisper(at, 0.35);
    else this.thudFar(at);
  }

  // --- the music ------------------------------------------------------------------------------------------------------------------------------------
  _music(dt) {
    const m = H.monster;
    const want = H.story?.ended ? 'none' : m?.state === 'chase' || H.story?.finale ? 'chase' : m?.active && m.floor === H.story?.floor?.() ? 'tension' : 'none';
    if (want !== this.mode) {
      const t = this.now();
      for (const l of this.musicLoops || []) { l.g.gain.setTargetAtTime(0, t, want === 'chase' ? 0.05 : 1.2); setTimeout(() => l.stop(), 5000); }
      this.musicLoops = [];
      if (want === 'chase') this.musicLoops.push(this._chase());
      if (want === 'tension') this.musicLoops.push(this._tension());
      this.mode = want;
    }
    for (const l of this.musicLoops || []) l.update?.(dt);
  }
  _tension() {
    const c = this.c, t = this.now(), g = this.gain(0); g.connect(this.musicBus);
    g.gain.setTargetAtTime(0.16, t, 2.5);
    const nodes = [];
    for (const n of [38, 39, 45, 50]) { const o = this.osc('sawtooth', NOTE(n)); o.detune.value = rnd(-12, 12); const f = this.filt('lowpass', 380, 0.8), og = this.gain(0.12); this.chain(o, f, og, g); o.start(t); nodes.push(o); }
    const hi = this.osc('sine', NOTE(93)), hg = this.gain(0.012), trem = this.osc('sine', 6.3), tg = this.gain(0.01); trem.connect(tg); tg.connect(hg.gain); this.chain(hi, hg, g); hi.start(t); trem.start(t); nodes.push(hi, trem);
    return { g, stop: () => nodes.forEach((n) => { try { n.stop(); } catch { /* */ } }) };
  }
  _chase() {
    const t0 = this.now(), g = this.gain(0); g.connect(this.musicBus);
    g.gain.setTargetAtTime(0.5, t0, 0.05);
    const bpm = 168, beat = 60 / bpm;
    let next = t0, i = 0, alive = true;
    const self = this;
    const nodes = [];
    const drone = this.osc('sawtooth', NOTE(33)), df = this.filt('lowpass', 200, 4), dg = this.gain(0.28); this.chain(drone, df, dg, g); drone.start(t0); nodes.push(drone);
    const lfo = this.osc('square', bpm / 60 * 2), lg = this.gain(120); lfo.connect(lg); lg.connect(df.frequency); lfo.start(t0); nodes.push(lfo);
    const update = () => {
      if (!alive) return;
      const now = self.c.currentTime;
      while (next < now + 0.25) {
        const b = i % 16;
        if (b % 4 === 0 || b === 6 || b === 14) self._drum(g, next, b % 8 === 0 ? 1 : 0.7);
        if (b % 2 === 1) self._tick(g, next, 0.18);
        if (b === 0 && (i / 16) % 2 === 0) self._stab(g, next, [45, 46, 52, 58]);
        if (b === 8 && (i / 16) % 2 === 1) self._stab(g, next, [44, 45, 51, 57]);
        // a rising string ostinato
        const sn = [57, 58, 57, 60, 57, 58, 57, 63][i % 8];
        self._bowed(g, next, NOTE(sn), beat * 0.9, 0.06);
        next += beat / 2; i++;
      }
    };
    return { g, update, stop: () => { alive = false; nodes.forEach((n) => { try { n.stop(); } catch { /* */ } }); } };
  }
  _drum(out, t, v) {
    const o = this.osc('sine', 120), g = this.gain(0); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    this.env(g.gain, t, 0.003, 0.9 * v, 0.35); this.chain(o, g, out); o.start(t); o.stop(t + 0.5);
    const n = this.src('white'), f = this.filt('lowpass', 900, 1), ng = this.gain(0); this.env(ng.gain, t, 0.002, 0.3 * v, 0.12); this.chain(n, f, ng, out); n.start(t); n.stop(t + 0.2);
  }
  _tick(out, t, v) { const n = this.src('white'), f = this.filt('highpass', 6000, 1), g = this.gain(0); this.env(g.gain, t, 0.001, v, 0.04); this.chain(n, f, g, out); n.start(t); n.stop(t + 0.08); }
  _stab(out, t, notes) {
    const g = this.gain(0); this.env(g.gain, t, 0.01, 0.22, 1.1); const f = this.filt('lowpass', 1800, 1); f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(500, t + 1);
    this.chain(f, g, out);
    for (const n of notes) { const o = this.osc('sawtooth', NOTE(n)); o.detune.value = rnd(-15, 15); o.connect(f); o.start(t); o.stop(t + 1.3); }
  }
  _bowed(out, t, f, d, v) { const o = this.osc('sawtooth', f), fl = this.filt('bandpass', f * 2, 2), g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); this.chain(o, fl, g, out); o.start(t); o.stop(t + d + 0.05); }
  /** A scare chord: everything at once. */
  stinger(v = 1) {
    if (!this.ready) return;
    const t = this.now(), g = this.gain(0); g.connect(this.musicBus);
    this.env(g.gain, t, 0.01, 0.55 * v, 2.6);
    for (const n of [36, 37, 43, 48, 49, 55, 61, 62, 73]) { const o = this.osc(n > 60 ? 'square' : 'sawtooth', NOTE(n)); o.detune.value = rnd(-25, 25); const f = this.filt('lowpass', n > 60 ? 3000 : 900, 1), og = this.gain(n > 60 ? 0.05 : 0.12); this.chain(o, f, og, g); o.start(t); o.stop(t + 2.8); }
    const n = this.src('white'), nf = this.filt('bandpass', 1800, 0.6), ng = this.gain(0); this.env(ng.gain, t, 0.005, 0.5 * v, 0.6); this.chain(n, nf, ng, g); n.start(t); n.stop(t + 0.8);
    const s = this.osc('sine', 55), sg = this.gain(0); s.frequency.exponentialRampToValueAtTime(28, t + 1.5); this.env(sg.gain, t, 0.01, 0.9 * v, 1.6); this.chain(s, sg, g); s.start(t); s.stop(t + 1.8);
  }
  /** A slow, rising swell of dread. */
  swell(secs = 6, v = 0.5) {
    if (!this.ready) return;
    const t = this.now(), g = this.gain(0.0001); g.connect(this.musicBus);
    g.gain.exponentialRampToValueAtTime(v * 0.3, t + secs); g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 1.5);
    for (const n of [40, 41, 47, 52, 53]) { const o = this.osc('sawtooth', NOTE(n)); o.detune.setValueAtTime(-40, t); o.detune.linearRampToValueAtTime(40, t + secs); const f = this.filt('lowpass', 300, 1); f.frequency.exponentialRampToValueAtTime(2200, t + secs); this.chain(o, f, g); o.start(t); o.stop(t + secs + 1.6); }
  }

  // --- your footsteps, breathing, heart ------------------------------------------------------------------------------------------------------------
  step(surf, vol, gait) {
    if (!this.ready) return;
    const at = H.player?.pos.clone().setY(H.player.pos.y + 0.3);
    this.play(at, (out, t) => {
      const v = vol * (0.85 + Math.random() * 0.3);
      const thud = (f, d, a) => { const o = this.osc('sine', f), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d); this.env(g.gain, t, 0.003, a * v, d); this.chain(o, g, out); o.start(t); o.stop(t + d + 0.05); };
      const nz = (type, f, q, d, a, kind = 'white') => { const n = this.src(kind), fl = this.filt(type, f * rnd(0.85, 1.15), q), g = this.gain(0); this.env(g.gain, t, 0.002, a * v, d); this.chain(n, fl, g, out); n.start(t, Math.random()); n.stop(t + d + 0.05); };
      if (surf === 'carpet') { thud(70, 0.12, 0.5); nz('lowpass', 400, 0.7, 0.1, 0.35, 'pink'); }
      else if (surf === 'marble' || surf === 'tile') { nz('highpass', 2600, 1, 0.05, 0.6); thud(160, 0.08, 0.5); nz('bandpass', 5000, 2, 0.03, 0.4); }
      else if (surf === 'metal') { for (const r of [1, 2.76, 5.4]) { const o = this.osc('sine', 230 * r * rnd(0.97, 1.03)), g = this.gain(0); this.env(g.gain, t, 0.002, 0.25 * v / r, 0.25); this.chain(o, g, out); o.start(t); o.stop(t + 0.3); } thud(90, 0.1, 0.5); }
      else if (surf === 'concrete') { nz('bandpass', 1300, 1.2, 0.08, 0.55); thud(95, 0.08, 0.5); nz('highpass', 4000, 1, 0.05, 0.2); }
      else if (surf === 'grass') nz('bandpass', 2500, 0.8, 0.12, 0.35);
      else if (surf === 'gravel') { for (let i = 0; i < 3; i++) { const tt = t + i * 0.02; const n = this.src('white'), fl = this.filt('bandpass', rnd(2000, 4000), 2), g = this.gain(0); this.env(g.gain, tt, 0.001, 0.4 * v, 0.05); this.chain(n, fl, g, out); n.start(tt, Math.random()); n.stop(tt + 0.08); } }
      else { thud(110, 0.1, 0.6); nz('bandpass', 850, 1.5, 0.07, 0.5); if (Math.random() < 0.22) this._creakNode(out, t + 0.03, rnd(240, 320), 0.25 * v, 0.3); }
    }, { vol: 0.55, rev: surf === 'carpet' ? 0.4 : 1, ref: 3 });
    if (gait === 'run' && Math.random() < 0.5) this.pant(0.25);
  }
  land(surf) { this.step(surf, 1.3, 'walk'); }
  pant(v = 0.4) { if (!this.ready || (this._pantT || 0) > this.c.currentTime) return; this._pantT = this.c.currentTime + 0.55; this.play(null, (out, t) => { const n = this.src('pink'), f = this.filt('bandpass', rnd(900, 1300), 1.5), g = this.gain(0); this.env(g.gain, t, 0.08, v * 0.25, 0.32); this.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 0.5); }); }
  exhausted() { for (let i = 0; i < 4; i++) setTimeout(() => this.pant(0.7), i * 520); }
  breathIn() { this.play(null, (out, t) => { const n = this.src('pink'), f = this.filt('bandpass', 1400, 1.2), g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); this.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 0.5); }); }
  breathOut(hard) { this.play(null, (out, t) => { const n = this.src('pink'), f = this.filt('bandpass', hard ? 900 : 700, 1), g = this.gain(0); this.env(g.gain, t, 0.05, hard ? 0.4 : 0.15, hard ? 0.9 : 0.5); this.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 1.2); }); }
  gasp() { this.play(null, (out, t) => { for (let i = 0; i < 3; i++) { const tt = t + i * 0.42; const n = this.src('pink'), f = this.filt('bandpass', 1500 - i * 200, 1.4), g = this.gain(0); this.env(g.gain, tt, 0.04, 0.55, 0.32); this.chain(n, f, g, out); n.start(tt, Math.random()); n.stop(tt + 0.5); } }); }
  heartbeat(v) { this.play(null, (out, t) => { for (const [dt2, a] of [[0, 1], [0.16, 0.7]]) { const o = this.osc('sine', 52), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(34, t + dt2 + 0.14); this.env(g.gain, t + dt2, 0.008, 0.55 * v * a, 0.16); this.chain(o, g, out); o.start(t + dt2); o.stop(t + dt2 + 0.25); } }, { rev: 0 }); }

  // --- small things ---------------------------------------------------------------------------------------------------------------------------------------
  click() { this.play(null, (out, t) => { for (const d of [0, 0.035]) { const n = this.src('white'), f = this.filt('bandpass', 3200, 3), g = this.gain(0); this.env(g.gain, t + d, 0.001, 0.35, 0.02); this.chain(n, f, g, out); n.start(t + d); n.stop(t + d + 0.04); } }, { rev: 0.2 }); }
  batteries() { for (let i = 0; i < 4; i++) setTimeout(() => this.click(), i * 160); }
  beep(ok) { this.play(null, (out, t) => { const o = this.osc(ok ? 'square' : 'sawtooth', ok ? 1600 : 220), f = this.filt('lowpass', 3000, 1), g = this.gain(0); this.env(g.gain, t, 0.003, 0.12, ok ? 0.08 : 0.45); this.chain(o, f, g, out); o.start(t); o.stop(t + 0.5); }, { rev: 0.3 }); }
  paper() { this.play(null, (out, t) => { for (let i = 0; i < 4; i++) { const tt = t + i * 0.05 + Math.random() * 0.03; const n = this.src('white'), f = this.filt('bandpass', rnd(3000, 6500), 1.2), g = this.gain(0); this.env(g.gain, tt, 0.004, 0.18, 0.07); this.chain(n, f, g, out); n.start(tt, Math.random()); n.stop(tt + 0.1); } }, { rev: 0.2 }); }
  pickup(pos, kind) {
    if (kind === 'key') this.keys(pos, 0.5);
    else if (kind === 'fuse' || kind === 'battery') this.play(pos, (out, t) => { for (const f of [2400, 3100]) { const o = this.osc('sine', f), g = this.gain(0); this.env(g.gain, t, 0.001, 0.12, 0.25); this.chain(o, g, out); o.start(t); o.stop(t + 0.3); } }, { ref: 3 });
    else if (kind === 'cutters') this.play(pos, (out, t) => this._metal(out, t, 180, 0.5, 0.6), { ref: 3 });
    else this.paper();
  }
  _metal(out, t, f, v, d) { for (const r of [1, 2.3, 3.9, 5.7]) { const o = this.osc('sine', f * r * rnd(0.98, 1.02)), g = this.gain(0); this.env(g.gain, t, 0.002, v / r, d); this.chain(o, g, out); o.start(t); o.stop(t + d + 0.1); } }
  keys(pos, v = 0.6) { this.play(pos, (out, t) => { for (let i = 0; i < 7; i++) { const tt = t + Math.random() * 0.35; for (const f of [rnd(2600, 3600), rnd(4200, 6000)]) { const o = this.osc('sine', f), g = this.gain(0); this.env(g.gain, tt, 0.001, v * 0.08, rnd(0.08, 0.25)); this.chain(o, g, out); o.start(tt); o.stop(tt + 0.3); } } }, { ref: 4 }); }
  _creakNode(out, t, f, v, d) {
    const o = this.osc('sawtooth', f), fl = this.filt('bandpass', f * 3.2, 9), g = this.gain(0);
    o.frequency.setValueAtTime(f, t); for (let k = 1; k < 6; k++) o.frequency.linearRampToValueAtTime(f * rnd(0.82, 1.18), t + d * k / 6);
    const am = this.osc('square', rnd(28, 55)), ag = this.gain(0.5); am.connect(ag); ag.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.2); g.gain.linearRampToValueAtTime(0.0001, t + d);
    this.chain(o, fl, g, out); o.start(t); o.stop(t + d + 0.05); am.start(t); am.stop(t + d + 0.05);
  }
  creak(pos, v = 0.5) { this.play(pos, (out, t) => this._creakNode(out, t, rnd(150, 300), v, rnd(0.6, 1.6)), { ref: 6 }); }
  knock(pos, n = 3, v = 0.8, gap = 0.32) { this.play(pos, (out, t) => { for (let i = 0; i < n; i++) { const tt = t + i * gap * rnd(0.9, 1.1); const o = this.osc('sine', 95), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(60, tt + 0.1); this.env(g.gain, tt, 0.002, v, 0.18); this.chain(o, g, out); o.start(tt); o.stop(tt + 0.25); const nn = this.src('white'), f = this.filt('bandpass', 700, 1.5), ng = this.gain(0); this.env(ng.gain, tt, 0.001, v * 0.5, 0.06); this.chain(nn, f, ng, out); nn.start(tt, Math.random()); nn.stop(tt + 0.1); } }, { ref: 8 }); }
  pipe(pos) { this.play(pos, (out, t) => { this._metal(out, t, rnd(90, 160), 0.35, 1.4); const n = this.src('brown'), f = this.filt('lowpass', 300, 1), g = this.gain(0); this.env(g.gain, t, 0.01, 0.4, 0.6); this.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 0.8); }, { ref: 8 }); }
  stepsAbove(pos) { this.play(pos, (out, t) => { for (let i = 0; i < 5; i++) { const tt = t + i * 0.62; const o = this.osc('sine', 60), g = this.gain(0); this.env(g.gain, tt, 0.004, 0.4, 0.2); this.chain(o, g, out); o.start(tt); o.stop(tt + 0.25); } }, { ref: 10, muffle: 300 }); }
  thudFar(pos) { this.play(pos, (out, t) => { const o = this.osc('sine', 48), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); this.env(g.gain, t, 0.005, 0.7, 0.6); this.chain(o, g, out); o.start(t); o.stop(t + 0.8); }, { ref: 10, muffle: 250 }); }
  whisper(pos, v = 0.4) {
    this.play(pos, (out, t) => {
      const n = this.src('pink'), g = this.gain(0), f1 = this.filt('bandpass', 1800, 4), f2 = this.filt('bandpass', 3200, 5);
      n.connect(f1); n.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
      let tt = t;
      for (let s = 0; s < 9; s++) { const d = rnd(0.08, 0.22); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(v * rnd(0.3, 1), tt + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, tt + d); f1.frequency.setValueAtTime(rnd(1200, 2600), tt); tt += d + rnd(0.02, 0.12); }
      n.start(t, Math.random()); n.stop(tt + 0.1);
    }, { ref: 5 });
  }
  thunder(dist = 1) {
    if (!this.ready) return;
    const t = this.now() + dist * rnd(0.6, 1.6), g = this.gain(0); g.connect(this.ambBus);
    const n = this.src('brown'), f = this.filt('lowpass', 160 + (1 - dist) * 300, 0.8); this.chain(n, f, g); n.start(t, Math.random()); n.stop(t + 7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * (1.2 - dist * 0.5), t + 0.25); g.gain.exponentialRampToValueAtTime(0.25, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 6.5);
    if (dist < 0.5) { const c = this.src('white'), cf = this.filt('highpass', 1500, 0.7), cg = this.gain(0); this.env(cg.gain, t, 0.005, 0.3, 0.4); this.chain(c, cf, cg, this.ambBus); c.start(t); c.stop(t + 0.5); }
  }

  // --- doors, the lift, the telephone ------------------------------------------------------------------------------------------------------------------
  doorOpen(pos) { this.play(pos, (out, t) => { this._latch(out, t, 0.4); this._creakNode(out, t + 0.12, rnd(170, 240), 0.35, rnd(0.7, 1.1)); }, { ref: 6 }); }
  doorClose(pos) { this.play(pos, (out, t) => { this._creakNode(out, t, rnd(200, 260), 0.15, 0.5); this._thump(out, t + 0.45, 0.7); this._latch(out, t + 0.47, 0.5); }, { ref: 6 }); }
  doorSlam(pos) { this.play(pos, (out, t) => { this._thump(out, t, 1.4); const n = this.src('white'), f = this.filt('bandpass', 900, 0.8), g = this.gain(0); this.env(g.gain, t, 0.002, 1.0, 0.35); this.chain(n, f, g, out); n.start(t); n.stop(t + 0.5); for (let i = 0; i < 5; i++) this._latch(out, t + 0.05 + i * 0.07, 0.4); }, { ref: 9, vol: 1.2 }); }
  locked(pos) { this.play(pos, (out, t) => { for (let i = 0; i < 3; i++) { this._latch(out, t + i * 0.13, 0.55); this._thump(out, t + i * 0.13 + 0.02, 0.2); } }, { ref: 5 }); }
  unlock(pos) { this.play(pos, (out, t) => { this.keys(null, 0.3); this._latch(out, t + 0.25, 0.8); this._metal(out, t + 0.3, 400, 0.15, 0.2); }, { ref: 5 }); }
  _latch(out, t, v) { const n = this.src('white'), f = this.filt('bandpass', 2500, 4), g = this.gain(0); this.env(g.gain, t, 0.001, v * 0.5, 0.03); this.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 0.05); this._metal(out, t, 900, v * 0.08, 0.08); }
  _thump(out, t, v) { const o = this.osc('sine', 80), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); this.env(g.gain, t, 0.002, v * 0.8, 0.25); this.chain(o, g, out); o.start(t); o.stop(t + 0.3); const n = this.src('brown'), f = this.filt('lowpass', 500, 1), ng = this.gain(0); this.env(ng.gain, t, 0.002, v * 0.6, 0.2); this.chain(n, f, ng, out); n.start(t, Math.random()); n.stop(t + 0.3); }
  wardrobe(pos, open, kind) { this.play(pos, (out, t) => { if (kind === 'locker') { this._metal(out, t, open ? 300 : 260, 0.2, 0.3); this._latch(out, t, 0.6); } else { this._creakNode(out, t, open ? 320 : 280, 0.25, 0.45); for (let i = 0; i < 4; i++) this._latch(out, t + 0.05 + i * 0.05, 0.12); } if (!open) this._thump(out, t + 0.3, 0.25); }, { ref: 4 }); }
  button(pos) { this.play(pos, (out, t) => { this._latch(out, t, 0.8); this._thump(out, t + 0.02, 0.15); }, { ref: 3 }); }
  ding(pos) { this.play(pos, (out, t) => { for (const [f, a] of [[1046.5, 0.35], [2093, 0.12], [2637, 0.08], [3136, 0.05]]) { const o = this.osc('sine', f), g = this.gain(0); this.env(g.gain, t, 0.002, a, 2.4); this.chain(o, g, out); o.start(t); o.stop(t + 2.6); } }, { ref: 14, vol: 1.1 }); }
  elevatorDoors(pos) { this.play(pos, (out, t) => { const n = this.src('brown'), f = this.filt('lowpass', 420, 1), g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.3); g.gain.setValueAtTime(0.7, t + 1.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.9); this.chain(n, f, g, out); n.start(t, Math.random()); n.stop(t + 2); this._thump(out, t + 1.85, 0.6); this._metal(out, t + 1.85, 220, 0.2, 0.5); }, { ref: 9 }); }
  motor(pos, secs) { this.play(pos, (out, t) => { const o = this.osc('sawtooth', 62), f = this.filt('lowpass', 260, 2), g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.6); g.gain.setValueAtTime(0.35, t + secs - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + secs); this.chain(o, f, g, out); o.start(t); o.stop(t + secs + 0.1); const n = this.src('brown'), nf = this.filt('bandpass', 180, 1), ng = this.gain(0.4); this.chain(n, nf, ng, g); n.start(t); n.stop(t + secs); }, { ref: 12, muffle: 300 }); }
  /** The telephone's bell (returns a stop function). */
  phoneRing(pos) {
    if (!this.ready) return () => {};
    let alive = true;
    const ring = () => {
      if (!alive) return;
      this.play(pos, (out, t) => { for (const f of [1150, 1580, 2450]) { const o = this.osc('triangle', f), g = this.gain(0); const tr = this.osc('square', 24), tg = this.gain(0.5); tr.connect(tg); tg.connect(g.gain); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + 1.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.75); this.chain(o, g, out); o.start(t); o.stop(t + 1.8); tr.start(t); tr.stop(t + 1.8); } }, { ref: 6 });
      setTimeout(ring, 3600);
    };
    ring();
    return () => { alive = false; };
  }
  pickupPhone(pos) { this.play(pos, (out, t) => { this._latch(out, t, 0.7); this._thump(out, t + 0.05, 0.25); }, { ref: 3 }); }
  /** Static and a buzzing voice from the television (returns stop). */
  tvStatic(pos) {
    if (!this.ready) return () => {};
    const n = this.src('white', true), f = this.filt('bandpass', 2600, 0.6), g = this.gain(0.0001), out = this.bus(pos, { ref: 4, vol: 0.6 });
    this.chain(n, f, g, out); n.start(); g.gain.exponentialRampToValueAtTime(0.35, this.now() + 0.15);
    return () => { g.gain.setTargetAtTime(0, this.c.currentTime, 0.03); setTimeout(() => n.stop(), 300); };
  }
  ice(pos) { this.play(pos, (out, t) => { const o = this.osc('sawtooth', 48), f = this.filt('lowpass', 200, 3), g = this.gain(0); this.env(g.gain, t, 0.05, 0.6, 1.4); this.chain(o, f, g, out); o.start(t); o.stop(t + 1.6); for (let i = 0; i < 9; i++) { const tt = t + 0.6 + Math.random() * 0.8; this._metal(out, tt, rnd(1500, 3000), 0.05, 0.1); } }, { ref: 8 }); }
  /** A tune on the music box: notes (MIDI), seconds per note; slows as it winds down. */
  musicBox(pos, notes, spb = 0.36) { this.play(pos, (out, t) => { let tt = t; notes.forEach((n, i) => { if (n) { for (const [m, a] of [[1, 0.2], [2.01, 0.05], [3.98, 0.03]]) { const o = this.osc('sine', NOTE(n) * m), g = this.gain(0); this.env(g.gain, tt, 0.002, a, 1.2); this.chain(o, g, out); o.start(tt); o.stop(tt + 1.3); } } tt += spb * (1 + Math.max(0, i - notes.length + 8) * 0.12); }); }, { ref: 4 }); }
  /** Piano notes, played by nobody. */
  piano(pos, notes, gap = 0.4, v = 0.5) { this.play(pos, (out, t) => { let tt = t; for (const nn of notes) { for (const n of [].concat(nn)) { if (!n) continue; const f = NOTE(n); for (const [m, a, d] of [[1, 0.3, 2.4], [2, 0.12, 1.6], [3, 0.06, 1.0], [4.02, 0.03, 0.6]]) { const o = this.osc(m === 1 ? 'triangle' : 'sine', f * m), g = this.gain(0); this.env(g.gain, tt, 0.004, a * v, d); this.chain(o, g, out); o.start(tt); o.stop(tt + d + 0.1); } } tt += gap * rnd(0.85, 1.25); } }, { ref: 8 }); }
  /** The old waltz on the gramophone (returns stop). */
  gramophone(pos) {
    if (!this.ready) return () => {};
    const out = this.bus(pos, { ref: 5, vol: 0.8 }), bp = this.filt('bandpass', 1200, 0.5), g = this.gain(0.0001); this.chain(g, bp, out);
    g.gain.exponentialRampToValueAtTime(1, this.now() + 0.5);
    const crackle = this.src('white', true), cf = this.filt('highpass', 3000, 0.5), cg = this.gain(0.025); this.chain(crackle, cf, cg, out); crackle.start();
    const mel = [76, 0, 74, 76, 0, 72, 69, 0, 0, 71, 72, 74, 76, 0, 79, 77, 76, 74, 72, 0, 0, 74, 72, 71, 69, 0, 0, 0, 0];
    const bass = [45, 52, 52, 45, 52, 52, 40, 52, 52, 47, 52, 52];
    let alive = true, i = 0, next = this.now();
    const tick = () => {
      if (!alive) return;
      while (next < this.c.currentTime + 0.4) {
        const spb = 0.42 + Math.sin(i * 0.3) * 0.02;
        const m = mel[i % mel.length], b = bass[i % bass.length];
        if (m) { const o = this.osc('triangle', NOTE(m) * (1 + Math.sin(i) * 0.004)), og = this.gain(0); this.env(og.gain, next, 0.01, 0.16, spb * 1.6); this.chain(o, og, g); o.start(next); o.stop(next + spb * 2); }
        { const o = this.osc('square', NOTE(i % 3 === 0 ? b : b + 12)), og = this.gain(0); this.env(og.gain, next, 0.005, i % 3 === 0 ? 0.08 : 0.04, spb * 0.8); this.chain(o, og, g); o.start(next); o.stop(next + spb); }
        next += spb; i++;
      }
      setTimeout(tick, 150);
    };
    tick();
    return () => { alive = false; g.gain.setTargetAtTime(0, this.c.currentTime, 0.2); setTimeout(() => crackle.stop(), 800); };
  }
  paChime() { this.play(null, (out, t) => { const bp = this.filt('bandpass', 1500, 1.4), d = this.c.createWaveShaper(); d.curve = this._curve(8); this.chain(bp, d, out); for (const [f, dt2] of [[784, 0], [622, 0.55], [523, 1.1]]) { const o = this.osc('sine', f), g = this.gain(0); this.env(g.gain, t + dt2, 0.01, 0.35, 1.2); this.chain(o, g, bp); o.start(t + dt2); o.stop(t + dt2 + 1.3); } }, { rev: 1.5 }); }
  powerOn() {
    this.play(null, (out, t) => { this._thump(out, t, 2); this._metal(out, t, 70, 0.6, 1.5); const o = this.osc('sawtooth', 30), f = this.filt('lowpass', 200, 2), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(60, t + 1.5); this.env(g.gain, t, 0.05, 0.4, 2); this.chain(o, f, g, out); o.start(t); o.stop(t + 2.2); }, { rev: 1.5 });
    for (let i = 0; i < 6; i++) setTimeout(() => this.play(null, (out, t) => { const n = this.src('white'), f = this.filt('bandpass', 4000, 3), g = this.gain(0); this.env(g.gain, t, 0.001, 0.15, 0.08); this.chain(n, f, g, out); n.start(t); n.stop(t + 0.1); }), 300 + i * 140);
  }
  chainCut(pos) { this.play(pos, (out, t) => { this._metal(out, t, 520, 0.7, 0.9); this._latch(out, t, 1); for (let i = 0; i < 14; i++) this._metal(out, t + 0.1 + i * 0.05 + Math.random() * 0.03, rnd(800, 2400), 0.1, 0.15); this._thump(out, t + 0.8, 0.6); }, { ref: 5, vol: 1.2 }); }
  cutting(pos) { this.play(pos, (out, t) => { const o = this.osc('sawtooth', 90), f = this.filt('bandpass', 700, 4), g = this.gain(0); o.frequency.linearRampToValueAtTime(70, t + 0.5); this.env(g.gain, t, 0.05, 0.15, 0.45); this.chain(o, f, g, out); o.start(t); o.stop(t + 0.6); }, { ref: 3 }); }
  glass(pos) { this.play(pos, (out, t) => { const n = this.src('white'), f = this.filt('highpass', 2500, 0.7), g = this.gain(0); this.env(g.gain, t, 0.002, 0.8, 0.4); this.chain(n, f, g, out); n.start(t); n.stop(t + 0.5); for (let i = 0; i < 8; i++) { const tt = t + 0.02 + Math.random() * 0.3; const o = this.osc('sine', rnd(2400, 6200)), og = this.gain(0); this.env(og.gain, tt, 0.002, 0.15, 0.2); this.chain(o, og, out); o.start(tt); o.stop(tt + 0.25); } }, { ref: 6 }); }
  bulbPop(pos) { this.play(pos, (out, t) => { const n = this.src('white'), f = this.filt('bandpass', 3000, 1), g = this.gain(0); this.env(g.gain, t, 0.001, 0.7, 0.08); this.chain(n, f, g, out); n.start(t); n.stop(t + 0.12); this._metal(out, t, 1800, 0.06, 0.3); }, { ref: 4 }); }
  fluorescent(pos) { this.play(pos, (out, t) => { for (let i = 0; i < 5; i++) { const tt = t + i * 0.09; const o = this.osc('square', 120), f = this.filt('bandpass', 2000, 2), g = this.gain(0); this.env(g.gain, tt, 0.002, 0.08, 0.05); this.chain(o, f, g, out); o.start(tt); o.stop(tt + 0.07); } }, { ref: 4 }); }
  radio(pos) { this.play(pos, (out, t) => { const n = this.src('white'), f = this.filt('bandpass', 1800, 0.8), g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.1); g.gain.setValueAtTime(0.25, t + 1.6); g.gain.linearRampToValueAtTime(0.0001, t + 2); this.chain(n, f, g, out); n.start(t); n.stop(t + 2.1); const o = this.osc('sine', 440), og = this.gain(0); o.frequency.linearRampToValueAtTime(380, t + 1.8); this.env(og.gain, t + 0.5, 0.2, 0.05, 1.2); this.chain(o, og, out); o.start(t + 0.5); o.stop(t + 2); }, { ref: 4 }); }
  burst(pos) { this.doorSlam(pos); this.play(pos, (out, t) => { for (let i = 0; i < 6; i++) this._creakNode(out, t + i * 0.03, rnd(400, 900), 0.15, 0.12); }, { ref: 9 }); }

  // --- him -------------------------------------------------------------------------------------------------------------------------------------------------
  mStep(pos, heavy = 1, drag = true) {
    this.play(pos, (out, t) => {
      const o = this.osc('sine', 62), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(34, t + 0.22); this.env(g.gain, t, 0.004, 0.95 * heavy, 0.35); this.chain(o, g, out); o.start(t); o.stop(t + 0.45);
      const n = this.src('brown'), f = this.filt('lowpass', 420, 1), ng = this.gain(0); this.env(ng.gain, t, 0.003, 0.7 * heavy, 0.18); this.chain(n, f, ng, out); n.start(t, Math.random()); n.stop(t + 0.25);
      if (drag) { const d = this.src('pink'), df = this.filt('bandpass', 700, 1.2), dg = this.gain(0); df.frequency.setValueAtTime(500, t + 0.25); df.frequency.linearRampToValueAtTime(1100, t + 0.8); dg.gain.setValueAtTime(0.0001, t + 0.22); dg.gain.linearRampToValueAtTime(0.35 * heavy, t + 0.4); dg.gain.linearRampToValueAtTime(0.0001, t + 0.85); this.chain(d, df, dg, out); d.start(t + 0.2, Math.random()); d.stop(t + 0.9); }
      if (Math.random() < 0.35) this._creakNode(out, t + 0.05, rnd(90, 140), 0.12, 0.35);
    }, { ref: 9, roll: 1.1, vol: 1.1 });
  }
  mRun(pos) { this.play(pos, (out, t) => { for (const d of [0, 0.09]) { const o = this.osc('sine', 70), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.15); this.env(g.gain, t + d, 0.003, 0.9, 0.22); this.chain(o, g, out); o.start(t + d); o.stop(t + d + 0.3); const n = this.src('white'), f = this.filt('bandpass', 1400, 1), ng = this.gain(0); this.env(ng.gain, t + d, 0.002, 0.3, 0.06); this.chain(n, f, ng, out); n.start(t + d, Math.random()); n.stop(t + d + 0.1); } }, { ref: 10, vol: 1.2 }); }
  /** Running after you: a wet, rattling snarl. */
  mRasp(pos, v = 1) {
    this.play(pos, (out, t) => {
      const dur = rnd(0.45, 0.85);
      const d = this.c.createWaveShaper(); d.curve = this.shaper; const g = this.gain(0); this.chain(d, g, out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o = this.osc('sawtooth', rnd(68, 92)); o.frequency.linearRampToValueAtTime(rnd(52, 66), t + dur);
      const f = this.filt('bandpass', rnd(330, 460), 1.4), og = this.gain(0.3);
      const am = this.osc('square', rnd(26, 38)), amg = this.gain(0.3); am.connect(amg); amg.connect(og.gain);
      this.chain(o, f, og, d);
      const n = this.src('pink'), nf = this.filt('bandpass', 1300, 1.1), ng = this.gain(0.35); this.chain(n, nf, ng, d);
      o.start(t); o.stop(t + dur + 0.05); am.start(t); am.stop(t + dur + 0.05); n.start(t, Math.random()); n.stop(t + dur + 0.05);
    }, { ref: 10, vol: 1.1, rev: 0.8 });
  }
  sniff(pos) { this.play(pos, (out, t) => { for (let i = 0; i < 4; i++) { const tt = t + i * 0.16; const n = this.src('pink'), f = this.filt('bandpass', 2600, 2.5), g = this.gain(0); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.5, tt + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.13); this.chain(n, f, g, out); n.start(tt, Math.random()); n.stop(tt + 0.15); } }, { ref: 5 }); }
  crack(pos) { this.play(pos, (out, t) => { for (let i = 0; i < 6; i++) { const tt = t + Math.random() * 0.4; const n = this.src('white'), f = this.filt('bandpass', rnd(1500, 4000), 3), g = this.gain(0); this.env(g.gain, tt, 0.001, 0.35, 0.02); this.chain(n, f, g, out); n.start(tt, Math.random()); n.stop(tt + 0.04); } }, { ref: 5 }); }
  /** He hums the waltz to himself (a few notes, wrong). */
  mHum(pos) { this.play(pos, (out, t) => { let tt = t; for (const n of [64, 62, 64, 60, 57, 59, 60, 62]) { const o = this.osc('sawtooth', NOTE(n - 12) * rnd(0.985, 1.015)), f = this.filt('bandpass', 600, 4), f2 = this.filt('lowpass', 1400, 1), g = this.gain(0); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.18, tt + 0.1); g.gain.linearRampToValueAtTime(0.0001, tt + 0.5); this.chain(o, f, f2, g, out); o.start(tt); o.stop(tt + 0.55); tt += rnd(0.42, 0.6); } }, { ref: 6 }); }
  /** The scream when he sees you. */
  scream(pos, v = 1) {
    this.play(pos, (out, t) => {
      const d = this.c.createWaveShaper(); d.curve = this.shaper; const g = this.gain(0), hp = this.filt('highpass', 180, 0.7);
      this.chain(d, hp, g, out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6 * v, t + 0.06); g.gain.setValueAtTime(0.6 * v, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      for (const [f0, f1] of [[220, 880], [233, 940], [330, 1240], [146, 520]]) { const o = this.osc('sawtooth', f0); o.frequency.exponentialRampToValueAtTime(f1, t + 0.35); o.frequency.exponentialRampToValueAtTime(f1 * 0.85, t + 1.6); const vb = this.osc('sine', 9), vg = this.gain(f1 * 0.03); vb.connect(vg); vg.connect(o.frequency); const og = this.gain(0.2); this.chain(o, og, d); o.start(t); o.stop(t + 1.8); vb.start(t); vb.stop(t + 1.8); }
      const n = this.src('white'), nf = this.filt('bandpass', 2400, 0.8), ng = this.gain(0.5); this.chain(n, nf, ng, d); n.start(t); n.stop(t + 1.7);
    }, { ref: 14, vol: 1.3, rev: 1.4 });
  }
  /** The last thing you hear. */
  jumpscare() {
    this.play(null, (out, t) => {
      const d = this.c.createWaveShaper(); d.curve = this.shaper; const g = this.gain(0); this.chain(d, g, out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.0, t + 0.02); g.gain.setValueAtTime(1, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      for (const f of [180, 191, 270, 404, 607, 1210]) { const o = this.osc('sawtooth', f); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.7); const og = this.gain(0.18); this.chain(o, og, d); o.start(t); o.stop(t + 1.9); }
      const n = this.src('white'), ng = this.gain(0.7); this.chain(n, ng, d); n.start(t); n.stop(t + 1.8);
      const s = this.osc('sine', 70), sg = this.gain(0); s.frequency.exponentialRampToValueAtTime(25, t + 1); this.env(sg.gain, t, 0.005, 1.2, 1.2); this.chain(s, sg, out); s.start(t); s.stop(t + 1.4);
    }, { rev: 0.6, vol: 1.1 });
  }

  /** Words through the telephone or the tannoy (speech if the browser has it; the subtitles say it anyway). */
  speak(text, o = {}) {
    try {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      const u = new SpeechSynthesisUtterance(text);
      const vs = speechSynthesis.getVoices();
      const v = vs.find((x) => /en[-_]GB/i.test(x.lang) && /male|daniel|george|arthur|oliver/i.test(x.name)) || vs.find((x) => /en[-_]GB/i.test(x.lang)) || vs.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.pitch = o.pitch ?? 0.35; u.rate = o.rate ?? 0.78; u.volume = Math.min(1, (o.vol ?? 0.9) * this.volume);
      speechSynthesis.speak(u);
    } catch { /* no voice */ }
  }
  stopSpeech() { try { window.speechSynthesis?.cancel(); } catch { /* */ } }
}

function setPos(p, v) {
  if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
}
