// Background ambience beds. Each bed = a few continuous live textures (noise
// through filters with slow random modulation, hums) + randomly scheduled
// one-off details (distant screams, far gunfire, creaks, drips...) taken from
// the pre-rendered buffers, filtered/panned/reverbed for distance. Nothing is
// an obvious short loop.

import { NOISE_SR, noiseBuffers } from './dsp.js';

export const AMBIENCES = ['city', 'apartments', 'subway', 'sewer', 'hospital', 'rooftop', 'safe'];

const R = (a, b) => a + (b - a) * Math.random();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function farGunfire(b, vol = 1) {
  const name = pick(['pistol', 'rifle', 'rifle2', 'smg', 'shotgun', 'sniper', 'm60']);
  const n = Math.random() < 0.3 ? 1 : Math.floor(R(2, 7));
  const pan = R(-0.9, 0.9), lp = R(700, 1500), v = R(0.05, 0.12) * vol;
  let t = 0;
  for (let k = 0; k < n; k++) {
    b.one(name, { vol: v * R(0.7, 1), pan, lp, far: 1.2, delay: t });
    t += name === 'sniper' || name === 'shotgun' ? R(0.6, 1.4) : R(0.08, 0.5);
  }
}
function farScream(b, vol = 1, lp = 1300) {
  b.one(pick(['zAlert', 'zAlert', 'hordeScream', 'witchScream', 'hurtFemale', 'hurtMale', 'zBurn']), { vol: R(0.04, 0.09) * vol, pan: R(-1, 1), lp, far: 1.0, rate: R(0.85, 1.05) });
}

const BEDS = {
  city: {
    gain: 0.32,
    build(b) {
      b.wind(0.35, 420, 260);
      b.rumble(0.3, 90);
      b.texture('white', 0.012, [['highpass', 6000]]);
    },
    events: [
      { every: [22, 50], first: [4, 15], fn: (b) => b.one('amb_siren', { vol: R(0.12, 0.2), pan: R(-1, 1), lp: 1400, far: 0.6 }) },
      { every: [7, 18], first: [2, 6], fn: (b) => farGunfire(b) },
      { every: [10, 26], first: [5, 12], fn: (b) => farScream(b) },
      { every: [45, 90], first: [20, 40], fn: (b) => b.one('explosion', { vol: 0.09, pan: R(-1, 1), lp: 380, far: 0.9 }) },
      { every: [30, 60], first: [15, 30], fn: (b) => b.one('carAlarm', { vol: 0.03, pan: R(-1, 1), lp: 1200, far: 1, dur: R(4, 6) }) },
    ],
  },
  apartments: {
    gain: 0.5,
    build(b) {
      b.texture('brown', 0.16, [['lowpass', 150]]);
      b.texture('pink', 0.025, [['bandpass', 420, 0.5]], 0.1, 0.4);
      b.hum(60, 0.008, 220);
    },
    events: [
      { every: [5, 14], fn: (b) => b.one('amb_creak', { vol: R(0.15, 0.3), pan: R(-1, 1), lp: 3000, far: 0.2 }) },
      { every: [18, 40], first: [6, 14], fn: (b) => b.one('amb_tvStatic', { vol: R(0.08, 0.13), pan: R(-1, 1), lp: 1800, far: 0.2 }) },
      { every: [14, 32], first: [5, 12], fn: (b) => farScream(b, 1.1, 650) },
      { every: [9, 24], fn: (b) => b.one(pick(['amb_thud', 'doorBang', 'bodyFall']), { vol: R(0.08, 0.18), pan: R(-1, 1), lp: 500, far: 0.2 }) },
      { every: [8, 20], fn: (b) => b.one('zIdle', { vol: R(0.05, 0.1), pan: R(-1, 1), lp: 800, far: 0.4 }) },
      { every: [6, 16], fn: (b) => b.one('drip', { vol: R(0.04, 0.08), pan: R(-1, 1), far: 0.3 }) },
    ],
  },
  subway: {
    gain: 0.42,
    build(b) {
      b.rumble(0.45, 70, 0.05, 0.3);
      b.hum(60, 0.012, 900, true);
      b.texture('pink', 0.05, [['bandpass', 300, 0.7]], 0.2, 0.3);
    },
    events: [
      { every: [2, 6], fn: (b) => b.one('drip', { vol: R(0.08, 0.2), pan: R(-1, 1), far: 0.7 }) },
      { every: [14, 34], fn: (b) => b.one('amb_clank', { vol: R(0.07, 0.14), pan: R(-1, 1), lp: 2000, far: 0.9 }) },
      { every: [45, 90], first: [15, 40], fn: (b) => b.one('amb_train', { vol: 0.35, pan: R(-0.6, 0.6), far: 0.5 }) },
      { every: [20, 45], fn: (b) => b.one('amb_rat', { vol: R(0.05, 0.1), pan: R(-1, 1), far: 0.4 }) },
      { every: [9, 24], fn: (b) => b.one(pick(['zIdle', 'zIdle', 'zAlert']), { vol: R(0.04, 0.08), pan: R(-1, 1), lp: 900, far: 1 }) },
    ],
  },
  sewer: {
    gain: 0.45,
    build(b) {
      b.water(0.16);
      b.texture('brown', 0.12, [['lowpass', 120]]);
    },
    events: [
      { every: [1, 3], fn: (b) => b.one('drip', { vol: R(0.06, 0.18), pan: R(-1, 1), far: 0.8, rate: R(0.8, 1.2) }) },
      { every: [1.5, 4], fn: (b) => b.one('amb_bubble', { vol: R(0.05, 0.12), pan: R(-1, 1), far: 0.4 }) },
      { every: [14, 32], first: [4, 12], fn: (b) => b.one('amb_pipeGroan', { vol: R(0.15, 0.25), pan: R(-1, 1), far: 0.7 }) },
      { every: [10, 25], fn: (b) => b.one(pick(['zIdle', 'zIdle', 'zAlert', 'boomerGurgle']), { vol: R(0.04, 0.08), pan: R(-1, 1), lp: 800, far: 1.2 }) },
      { every: [15, 40], fn: (b) => b.one('amb_rat', { vol: R(0.05, 0.1), pan: R(-1, 1), far: 0.5 }) },
    ],
  },
  hospital: {
    gain: 0.5,
    build(b) {
      b.hum(120, 0.012, 1600, true);
      b.tone(120, 0.015);
      b.tone(9600, 0.0015);
      b.texture('pink', 0.07, [['lowpass', 600]], 0.1, 0.2);
    },
    events: [
      { every: [10, 24], first: [3, 8], fn: (b) => { const n = Math.floor(R(5, 12)), pan = R(-0.8, 0.8); for (let k = 0; k < n; k++) b.one('amb_monitor', { vol: 0.035, pan, lp: 3000, far: 0.35, delay: k * 0.85 }); } },
      { every: [15, 35], fn: (b) => b.one('amb_alarmBeeps', { vol: 0.05, pan: R(-1, 1), lp: 2500, far: 0.6 }) },
      { every: [16, 38], first: [6, 14], fn: (b) => farScream(b, 1, 900) },
      { every: [20, 45], fn: (b) => b.one(pick(['amb_clank', 'amb_creak', 'doorBang']), { vol: R(0.05, 0.1), pan: R(-1, 1), lp: 1500, far: 0.6 }) },
    ],
  },
  rooftop: {
    gain: 0.36,
    build(b) {
      b.wind(0.55, 350, 220, true);
      b.texture('white', 0.05, [['bandpass', 1200, 0.8]], 0.15, 0.5);
      b.whistle(0.02);
      b.rumble(0.22, 120);
    },
    events: [
      { every: [9, 22], first: [3, 8], fn: (b) => farGunfire(b, 0.9) },
      { every: [28, 60], first: [8, 20], fn: (b) => b.one('amb_siren', { vol: R(0.1, 0.16), pan: R(-1, 1), lp: 1300, far: 0.7 }) },
      { every: [14, 32], fn: (b) => farScream(b, 0.9, 1100) },
      { every: [50, 100], first: [25, 50], fn: (b) => b.one('explosion', { vol: 0.08, pan: R(-1, 1), lp: 350, far: 1 }) },
    ],
  },
  safe: {
    gain: 0.4,
    build(b) {
      b.texture('brown', 0.12, [['lowpass', 120]]);
      b.tone(50, 0.008);
      b.texture('pink', 0.01, [['bandpass', 700, 0.6]]);
    },
    events: [
      { every: [12, 30], first: [6, 12], fn: (b) => b.one(pick(['doorBang', 'amb_thud']), { vol: R(0.05, 0.09), pan: R(-1, 1), lp: 380, far: 0.2 }) },
      { every: [14, 30], fn: (b) => b.one('zIdle', { vol: R(0.03, 0.05), pan: R(-1, 1), lp: 500, far: 0.3 }) },
    ],
  },
};

class Bed {
  constructor(amb, name) {
    this.a = amb;
    this.e = amb.e;
    this.ctx = amb.ctx;
    this.name = name;
    this.def = BEDS[name];
    this.srcs = [];
    const now = this.ctx.currentTime;
    this.out = this.ctx.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(this.def.gain, now + 2.5);
    this.out.connect(amb.dest);
    this.nb = noiseBuffers(this.ctx);
    try { this.def.build(this); } catch (e) { console.warn('[ambience]', e); }
    this.events = this.def.events.map((ev) => ({ ev, next: now + R(...(ev.first || ev.every)) }));
    this.dead = false;
  }
  // --- texture helpers (live nodes)
  _src(color, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.nb[color];
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.ctx.currentTime, Math.random() * 3.5);
    this.srcs.push(s);
    return s;
  }
  _gain(v, dest) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(dest || this.out); return g; }
  _filt(type, f, q = 0.7, dest) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }
  // smooth random modulation (piecewise linear noise at `hz` changes per second) added to param
  mod(param, hz, depth) {
    const s = this._src('white', hz / NOISE_SR);
    const g = this.ctx.createGain();
    g.gain.value = depth;
    s.connect(g);
    g.connect(param);
    return g;
  }
  texture(color, vol, filters, modHz = 0, modDepth = 0, pan = 0) {
    let dest = this._gain(vol);
    if (modHz) this.mod(dest.gain, modHz, vol * modDepth);
    if (pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest); dest = p; }
    let head = dest;
    for (let i = filters.length - 1; i >= 0; i--) { const [ty, f, q] = filters[i]; head = this._filt(ty, f, q ?? 0.7, head); }
    this._src(color).connect(head);
    return dest;
  }
  wind(vol, f, fDepth, strong = false) {
    for (const pan of [-0.65, 0.65]) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      const g = this._gain(vol, null); g.connect(p); p.connect(this.out);
      this.mod(g.gain, strong ? 0.25 : 0.15, vol * (strong ? 0.55 : 0.4));
      const bp = this._filt('bandpass', f, 0.6, g);
      this.mod(bp.frequency, 0.3, fDepth);
      this._src('pink').connect(bp);
    }
  }
  whistle(vol) {
    const g = this._gain(vol);
    this.mod(g.gain, 0.2, vol);
    const bp = this._filt('bandpass', 1400, 25, g);
    this.mod(bp.frequency, 0.2, 350);
    this._src('white').connect(bp);
  }
  rumble(vol, f, modHz = 0.1, modDepth = 0.4) {
    const g = this._gain(vol);
    this.mod(g.gain, modHz, vol * modDepth);
    this._src('brown').connect(this._filt('lowpass', f, 0.7, g));
  }
  hum(freq, vol, lp, flicker = false) {
    const g = this._gain(vol);
    if (flicker) this.mod(g.gain, 3, vol * 0.5);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.connect(this._filt('lowpass', lp, 0.7, g));
    o.start();
    this.srcs.push(o);
  }
  tone(freq, vol) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    o.connect(this._gain(vol));
    o.start();
    this.srcs.push(o);
  }
  water(vol) {
    for (const pan of [-0.5, 0.5]) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan; p.connect(this.out);
      const g = this._gain(vol, p);
      this.mod(g.gain, 5, vol * 0.3);
      const bp = this._filt('bandpass', 900, 0.8, g);
      this.mod(bp.frequency, 9, 450);
      this._src('white').connect(bp);
      const rush = this._gain(vol * 1.4, p);
      this._src('pink').connect(this._filt('lowpass', 420, 0.7, rush));
    }
  }
  // one-off detail from the pre-rendered sounds
  one(name, o = {}) {
    const buf = this.e._pickBuffer(name);
    if (!buf || this.dead) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02 + (o.delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = (o.rate || 1) * R(0.95, 1.05);
    const g = ctx.createGain();
    g.gain.value = o.vol ?? 0.1;
    let head = g;
    if (o.lp) { const f = this._filt('lowpass', o.lp, 0.7, g); head = f; }
    s.connect(head);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
    g.connect(p);
    p.connect(this.out);
    let fs = null;
    if (o.far && this.a.far) { fs = ctx.createGain(); fs.gain.value = o.far; g.connect(fs); fs.connect(this.a.far); }
    s.onended = () => { for (const n of [s, g, head, p, fs]) if (n) try { n.disconnect(); } catch (e) { /* ignore */ } };
    s.start(t);
    if (o.dur) { g.gain.setValueAtTime(o.vol ?? 0.1, t + o.dur - 0.5); g.gain.linearRampToValueAtTime(0, t + o.dur); s.stop(t + o.dur + 0.05); }
    else if (buf.duration > 0) s.stop(t + buf.duration / Math.max(0.1, s.playbackRate.value) + 0.05);
  }
  tick(now) {
    if (this.dead) return;
    for (const e of this.events) {
      if (now >= e.next) {
        try { e.ev.fn(this); } catch (err) { console.warn('[ambience]', err); }
        e.next = now + R(...e.ev.every);
      }
    }
  }
  stop(fade = 2.5) {
    if (this.dead) return;
    this.dead = true;
    const now = this.ctx.currentTime;
    const g = this.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.linearRampToValueAtTime(0, now + fade);
    for (const s of this.srcs) { try { s.stop(now + fade + 0.1); } catch (e) { /* ignore */ } }
    setTimeout(() => { try { this.out.disconnect(); } catch (e) { /* ignore */ } }, (fade + 0.5) * 1000);
  }
}

export class Ambience {
  constructor(engine) {
    this.e = engine;
    this.ctx = null;
    this.name = null;
    this.bed = null;
    this._warned = new Set();
  }
  attach(ctx, dest, far) {
    this.ctx = ctx;
    this.dest = dest;
    this.far = far;
    if (this.name) { const n = this.name; this.name = null; this.set(n); }
  }
  set(name) {
    if (name === undefined || name === 'none') name = null;
    if (name !== null && !BEDS[name]) {
      if (!this._warned.has(name)) { this._warned.add(name); console.warn('[audio] unknown ambience', name); }
      return;
    }
    if (name === this.name && (this.bed || !this.ctx)) return;
    this.name = name;
    if (!this.ctx) return;
    if (this.bed) this.bed.stop(2.5);
    this.bed = name ? new Bed(this, name) : null;
  }
  tick() {
    if (this.bed && this.ctx) this.bed.tick(this.ctx.currentTime);
  }
  stopAll() {
    if (this.bed) this.bed.stop(0.5);
    this.bed = null;
    this.name = null;
  }
}
