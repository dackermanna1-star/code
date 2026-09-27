// Low-level DSP helpers for the procedural audio engine.
// - Seeded RNG, shared noise buffers, waveshaper curves
// - "Kit": a small synthesis toolkit bound to an (Offline)AudioContext, used by
//   the sound definitions to build their node graphs concisely.
// - Post-processing of rendered buffers (trim, normalise, seamless loop folding)
// - Procedural impulse responses for the convolution reverbs.

export const NOISE_SR = 44100;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// Buffers

export function makeBuffer(channels, length, sampleRate, ctx) {
  length = Math.max(1, length | 0);
  try {
    return new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
  } catch (e) {
    if (ctx) return ctx.createBuffer(channels, length, sampleRate);
    throw e;
  }
}

let _noise = null;
// Shared noise sources (context-independent AudioBuffers, 4 s each).
export function noiseBuffers(ctx) {
  if (_noise) return _noise;
  const len = NOISE_SR * 4;
  const rng = mulberry32(0xdecaf);
  const white = makeBuffer(1, len, NOISE_SR, ctx);
  const pink = makeBuffer(1, len, NOISE_SR, ctx);
  const brown = makeBuffer(1, len, NOISE_SR, ctx);
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  let pm = 0, bm = 0;
  for (let i = 0; i < len; i++) {
    const x = rng() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926;
    br = (br + 0.02 * x) / 1.02;
    b[i] = br;
    pm = Math.max(pm, Math.abs(p[i])); bm = Math.max(bm, Math.abs(br));
  }
  // remove DC from brown & normalise
  let mean = 0;
  for (let i = 0; i < len; i++) mean += b[i];
  mean /= len;
  bm = 0;
  for (let i = 0; i < len; i++) { b[i] -= mean; bm = Math.max(bm, Math.abs(b[i])); }
  for (let i = 0; i < len; i++) { p[i] /= pm; b[i] /= bm; }
  // make loops seamless (short crossfade of the ends)
  for (const d of [w, p, b]) {
    const x = 2048;
    for (let i = 0; i < x; i++) {
      const k = i / x;
      d[i] = d[i] * Math.sin(k * Math.PI / 2) + d[len - x + i] * Math.cos(k * Math.PI / 2);
    }
  }
  _noise = { white, pink, brown };
  return _noise;
}

const _curves = new Map();
// tanh soft-clip curve, normalised so the output peak ~ 1.
export function driveCurve(drive) {
  const key = Math.round(drive * 100);
  let c = _curves.get(key);
  if (c) return c;
  const n = 2048;
  c = new Float32Array(n);
  const k = Math.max(0.01, drive);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / norm;
  }
  _curves.set(key, c);
  return c;
}

// Asymmetric "tube"-ish curve for grittier distortion (adds even harmonics).
export function gritCurve(drive) {
  const key = 'g' + Math.round(drive * 100);
  let c = _curves.get(key);
  if (c) return c;
  const n = 2048;
  c = new Float32Array(n);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = x >= 0 ? Math.tanh(x * drive) : Math.tanh(x * drive * 0.6) * 0.85;
    c[i] = y; mx = Math.max(mx, Math.abs(y));
  }
  for (let i = 0; i < n; i++) c[i] /= mx;
  _curves.set(key, c);
  return c;
}

// Soft limiter curve: linear to `knee`, then smoothly saturates towards `ceil`.
export function limiterCurve(knee = 0.8, ceil = 0.98) {
  const key = 'lim' + knee + ceil;
  let c = _curves.get(key);
  if (c) return c;
  const n = 4096;
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2; // input range -2..2 (WaveShaper maps -1..1 → curve; we pre-scale)
    const a = Math.abs(x);
    let y;
    if (a <= knee) y = a;
    else y = knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  _curves.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Vowel formants (Hz) for an adult male voice: F1..F4
export const VOWELS = {
  a: [730, 1090, 2440, 3400],
  o: [570, 840, 2410, 3300],
  u: [320, 870, 2240, 3200],
  e: [530, 1840, 2480, 3500],
  i: [290, 2250, 3000, 3700],
  ae: [660, 1720, 2410, 3400],
  uh: [520, 1190, 2390, 3400],
  er: [490, 1350, 1690, 3300],
  m: [260, 900, 2200, 3100],
  aw: [640, 950, 2500, 3350],
};
const F_BW = [90, 110, 170, 250];
const F_GAIN = [1, 0.7, 0.35, 0.18];

// ---------------------------------------------------------------------------
// Kit: synthesis helpers bound to a context. `out` is the default destination.

export class Kit {
  constructor(ctx, out, rng, variant = 0, nVariants = 1) {
    this.ctx = ctx;
    this.out = out;
    this.rng = rng;
    this.v = variant;
    this.nv = nVariants;
    this.sr = ctx.sampleRate;
    this.nb = noiseBuffers(ctx);
  }
  // random helpers
  r(a, b) { return a + (b - a) * this.rng(); }
  ri(a, b) { return Math.floor(a + (b - a + 1) * this.rng()); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length) % arr.length]; }
  chance(p) { return this.rng() < p; }
  vary(x, amt = 0.1) { return x * (1 + (this.rng() * 2 - 1) * amt); }

  // --- basic nodes
  gain(v = 1, dest = this.out) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  filter(type, freq, Q = 0.707, dest = this.out, gainDb = 0) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, this.sr * 0.49);
    f.Q.value = Q;
    if (gainDb) f.gain.value = gainDb;
    if (dest) f.connect(dest);
    return f;
  }
  lp(f, Q, dest) { return this.filter('lowpass', f, Q ?? 0.707, dest); }
  hp(f, Q, dest) { return this.filter('highpass', f, Q ?? 0.707, dest); }
  bp(f, Q, dest) { return this.filter('bandpass', f, Q ?? 1, dest); }
  peak(f, Q, db, dest) { return this.filter('peaking', f, Q, dest, db); }
  shaper(drive = 2, dest = this.out, grit = false) {
    const s = this.ctx.createWaveShaper();
    s.curve = grit ? gritCurve(drive) : driveCurve(drive);
    s.oversample = 'none';
    if (dest) s.connect(dest);
    return s;
  }
  delay(time, fb = 0, dest = this.out, lpf = 0) {
    const d = this.ctx.createDelay(Math.max(1, time + 0.1));
    d.delayTime.value = time;
    if (dest) d.connect(dest);
    if (fb > 0) {
      const g = this.gain(fb, null);
      if (lpf) { const f = this.lp(lpf, 0.7, g); d.connect(f); } else d.connect(g);
      g.connect(d);
    }
    return d;
  }
  pan(p, dest = this.out) {
    const s = this.ctx.createStereoPanner();
    s.pan.value = p;
    if (dest) s.connect(dest);
    return s;
  }
  // chain(a, b, c): connect in series, returns [first, last]
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[0];
  }

  // --- automation
  // pts: [[dt, value, kind]] kind: 'l' linear (default) | 'e' exponential | 's' step
  env(param, t, pts) {
    const p0 = pts[0];
    param.setValueAtTime(p0[1], t + p0[0]);
    for (let i = 1; i < pts.length; i++) {
      const [dt, v, k] = pts[i];
      const tt = t + dt;
      if (k === 's') param.setValueAtTime(v, tt);
      else if (k === 'e') param.exponentialRampToValueAtTime(Math.max(1e-4, v), tt);
      else param.linearRampToValueAtTime(v, tt);
    }
    return param;
  }
  // attack/decay envelope: linear attack to peak, then exponential decay (d = time to ~-60 dB)
  ad(param, t, a, d, peak = 1, hold = 0) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) param.setValueAtTime(peak, t + a + hold);
    param.setTargetAtTime(0, t + a + hold, Math.max(0.0005, d / 6.9));
    return param;
  }

  // --- sources
  noise(t, dur, color = 'white', dest = this.out, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.nb[color] || this.nb.white;
    s.loop = true;
    s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    s.start(t, this.rng() * 3.5);
    s.stop(t + dur + 0.02);
    return s;
  }
  osc(type, freq, t, dur, dest = this.out, detune = 0) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    if (dest) o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }
  // Smooth random control signal (piecewise-linear noise at `hz` changes/sec), added to `param`.
  rand(t, dur, hz, depth, param) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.nb.white;
    s.loop = true;
    s.playbackRate.value = hz / NOISE_SR;
    const g = this.gain(depth, null);
    s.connect(g);
    if (param) g.connect(param);
    s.start(t, this.rng() * 3.9);
    s.stop(t + dur + 0.05);
    return g;
  }
  // sine LFO added to param
  lfo(t, dur, hz, depth, param, type = 'sine') {
    const o = this.osc(type, hz, t, dur, null);
    const g = this.gain(depth, null);
    o.connect(g);
    if (param) g.connect(param);
    return { o, g };
  }

  // --- building blocks
  // filtered noise burst. opts: {color, a, d, hold, amp, f:[[type,freq,Q],...], fenv:[[dt,freq]...] (on first filter), drive, dest, rate}
  burst(t, o = {}) {
    const dest = o.dest || this.out;
    const g = this.gain(0, null);
    this.ad(g.gain, t, o.a ?? 0.001, o.d ?? 0.1, o.amp ?? 1, o.hold ?? 0);
    let last = g;
    if (o.drive) { const s = this.shaper(o.drive, null, o.grit); last.connect(s); last = s; }
    last.connect(dest);
    let head = g;
    const fl = o.f || [];
    for (let i = fl.length - 1; i >= 0; i--) {
      const [ty, fr, q] = fl[i];
      const f = this.filter(ty, fr, q ?? 0.707, head);
      if (i === 0 && o.fenv) this.env(f.frequency, t, o.fenv.map(([dt, v, k]) => [dt, Math.min(v, this.sr * 0.49), k || 'e']));
      head = f;
    }
    const dur = (o.a ?? 0.001) + (o.hold ?? 0) + (o.d ?? 0.1) * 1.1 + 0.01;
    const src = this.noise(t, dur, o.color || 'white', head, o.rate || 1);
    return { src, g, head };
  }
  // sine (or other) thump with pitch sweep
  thump(t, o = {}) {
    const dest = o.dest || this.out;
    const g = this.gain(0, dest);
    this.ad(g.gain, t, o.a ?? 0.002, o.d ?? 0.2, o.amp ?? 1, o.hold ?? 0);
    const dur = (o.a ?? 0.002) + (o.hold ?? 0) + (o.d ?? 0.2) * 1.1;
    const osc = this.osc(o.type || 'sine', o.f0 ?? 120, t, dur, g);
    osc.frequency.setValueAtTime(o.f0 ?? 120, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 ?? 50), t + (o.sweep ?? 0.08));
    return { osc, g };
  }
  // resonant click (mechanical)
  click(t, o = {}) {
    return this.burst(t, { a: 0.0004, d: o.d ?? 0.02, amp: o.amp ?? 1, f: [['bandpass', o.f ?? 3000, o.q ?? 5]], dest: o.dest, color: 'white' });
  }
  // sum of exponentially decaying partials: parts = [[freq, decay, amp], ...]
  modal(t, parts, dest = this.out, o = {}) {
    const g = this.gain(o.amp ?? 1, dest);
    for (const [f, d, a] of parts) {
      if (f >= this.sr * 0.48) continue;
      const pg = this.gain(0, g);
      this.ad(pg.gain, t, o.a ?? 0.0008, d, a);
      const osc = this.osc('sine', f, t, (o.a ?? 0.0008) + d * 1.05, pg);
      if (o.glide) osc.frequency.setTargetAtTime(f * o.glide, t, o.glideT ?? 0.2);
    }
    return g;
  }
  // band-passed noise sweep (whoosh). o: {f0, f1, f2, q, amp, peakAt, dest, color}
  whoosh(t, dur, o = {}) {
    const dest = o.dest || this.out;
    const g = this.gain(0, dest);
    const pk = o.peakAt ?? 0.5;
    this.env(g.gain, t, [[0, 0], [dur * pk, o.amp ?? 1], [dur, 0]]);
    const f = this.bp(o.f0 ?? 400, o.q ?? 1.2, g);
    this.env(f.frequency, t, [[0, o.f0 ?? 400], [dur * pk, o.f1 ?? 1800, 'e'], [dur, o.f2 ?? 500, 'e']]);
    this.noise(t, dur, o.color || 'white', f);
    return g;
  }
  // wet squelch: bandpassed noise with rapidly wandering centre frequency
  squelch(t, dur, o = {}) {
    const dest = o.dest || this.out;
    const g = this.gain(0, dest);
    this.env(g.gain, t, [[0, 0], [o.a ?? 0.005, o.amp ?? 1], [dur, 0.0001, 'e']]);
    const f = this.bp(o.f ?? 900, o.q ?? 4, g);
    this.rand(t, dur, o.rate ?? 45, (o.f ?? 900) * (o.depth ?? 0.5), f.frequency);
    const am = this.gain(0.6, f);
    this.rand(t, dur, (o.rate ?? 45) * 1.3, 0.5, am.gain);
    this.noise(t, dur, o.color || 'pink', am);
    return g;
  }
  // bubbles / gurgle: rising sine blips
  bubbles(t, dur, o = {}) {
    const dest = o.dest || this.out;
    const g = this.gain(o.amp ?? 1, dest);
    const rate = o.rate ?? 25;
    let tt = t;
    while (tt < t + dur) {
      tt += -Math.log(1 - this.rng() * 0.999) / rate;
      if (tt >= t + dur) break;
      const f = this.r(o.fLo ?? 180, o.fHi ?? 600);
      const len = this.r(0.012, 0.045);
      const bg = this.gain(0, g);
      const a = this.r(0.3, 1);
      bg.gain.setValueAtTime(0, tt);
      bg.gain.linearRampToValueAtTime(a, tt + 0.002);
      bg.gain.setTargetAtTime(0, tt + 0.004, len / 3);
      const osc = this.osc('sine', f, tt, len * 2, bg);
      osc.frequency.setValueAtTime(f, tt);
      osc.frequency.exponentialRampToValueAtTime(f * this.r(1.4, 2.4), tt + len);
    }
    return g;
  }
  // N-wave (supersonic crack)
  nwave(t, ms, amp = 1, dest = this.out) {
    const n = Math.max(4, Math.round(ms * 0.001 * this.sr));
    const b = makeBuffer(1, n + 4, this.sr, this.ctx);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = amp * (1 - (2 * i) / (n - 1));
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(dest);
    s.start(t);
    return s;
  }
  // Random clicks/crackles. density: number or [[dt, perSecond], ...]; o: {len:[minMs,maxMs], ampPow, dest, amp}
  crackle(t, dur, density, o = {}) {
    const sr = this.sr;
    const n = Math.max(8, Math.ceil(dur * sr));
    const b = makeBuffer(1, n, sr, this.ctx);
    const d = b.getChannelData(0);
    const densAt = typeof density === 'number' ? () => density : (x) => {
      let prev = density[0];
      for (let i = 1; i < density.length; i++) {
        const cur = density[i];
        if (x <= cur[0]) {
          const k = (x - prev[0]) / Math.max(1e-6, cur[0] - prev[0]);
          return prev[1] + (cur[1] - prev[1]) * k;
        }
        prev = cur;
      }
      return prev[1];
    };
    let maxD = 0;
    if (typeof density === 'number') maxD = density; else for (const p of density) maxD = Math.max(maxD, p[1]);
    if (maxD <= 0) maxD = 1;
    const lenMin = (o.len ? o.len[0] : 0.2) * 0.001 * sr, lenMax = (o.len ? o.len[1] : 2) * 0.001 * sr;
    const pw = o.ampPow ?? 2.5;
    let x = 0;
    while (true) {
      x += -Math.log(1 - this.rng() * 0.9999) / maxD;
      if (x >= dur) break;
      if (this.rng() > densAt(x) / maxD) continue;
      const i0 = Math.floor(x * sr);
      const L = Math.max(2, Math.floor(lenMin + (lenMax - lenMin) * this.rng()));
      const a = Math.pow(this.rng(), pw) * (this.rng() < 0.5 ? -1 : 1);
      const tau = L / 3;
      for (let k = 0; k < L && i0 + k < n; k++) d[i0 + k] += a * (this.rng() * 2 - 1) * Math.exp(-k / tau);
    }
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    const g = this.gain(o.amp ?? 1, o.dest || this.out);
    s.connect(g);
    s.start(t);
    return { src: s, g };
  }

  // --- formant voice
  // o: {f0: number | [[dt,hz],...], vowel: 'a' | [[dt,'a'],...], fs (formant scale), breath, rough, roughHz,
  //     jitter, jitterHz, drive, grit, amp: [[dt,v],...], type, dest, lp, vib:[rate, cents], dual: ratio, dualAmp, nasal}
  voice(t, dur, o = {}) {
    const ctx = this.ctx;
    const dest = o.dest || this.out;
    const fs = o.fs ?? 1;
    let vDest = dest;
    if (o.tremble) {
      // multiplicative trembling (sobs, shaking breath): gain in [1-2d, 1]
      const tg = this.gain(1 - o.tremble[1], dest);
      this.rand(t, dur, o.tremble[0], o.tremble[1], tg.gain);
      vDest = tg;
    }
    const outG = this.gain(0, vDest);
    const ampPts = o.amp || [[0, 0], [0.04, 1], [dur - 0.08, 0.8], [dur, 0]];
    this.env(outG.gain, t, ampPts);
    let tail = outG;
    if (o.lp) { const l = this.lp(o.lp, 0.7, outG); tail = l; }
    let pre = tail;
    if (o.drive) { const s = this.shaper(o.drive, tail, o.grit); pre = s; }
    const sum = this.gain(1, pre);
    // formant bank
    const bankIn = this.gain(1, null);
    const vowelPts = typeof o.vowel === 'string' || !o.vowel ? [[0, o.vowel || 'uh']] : o.vowel;
    const nF = o.formants ?? 4;
    for (let k = 0; k < nF; k++) {
      const F0 = VOWELS[vowelPts[0][1]][k] * fs;
      const f = this.filter('bandpass', F0, F0 / (F_BW[k] * Math.max(0.6, fs)), null);
      f.frequency.setValueAtTime(F0, t);
      for (let j = 1; j < vowelPts.length; j++) {
        const [dt, vw] = vowelPts[j];
        f.frequency.linearRampToValueAtTime(Math.min(VOWELS[vw][k] * fs, this.sr * 0.45), t + dt);
      }
      const fg = this.gain(F_GAIN[k] * (o.fGains ? o.fGains[k] : 1), sum);
      bankIn.connect(f); f.connect(fg);
      if (o.formantWobble) this.rand(t, dur, o.formantWobble[0], F0 * o.formantWobble[1], f.frequency);
    }
    // chest/body path
    const body = this.lp(250 * fs, 0.7, null);
    const bodyG = this.gain(o.body ?? 0.25, sum);
    body.connect(bodyG);
    // roughness AM
    const am = this.gain(1 - (o.rough ?? 0) * 0.5, bankIn);
    am.connect(body);
    if (o.rough) {
      const r = this.lfo(t, dur, o.roughHz ?? 40, (o.rough ?? 0) * 0.5, am.gain, o.roughType || 'sine');
      this.rand(t, dur, 8, (o.roughHz ?? 40) * 0.3, r.o.frequency);
      if (o.roughNoise) this.rand(t, dur, (o.roughHz ?? 40) * 1.5, o.roughNoise, am.gain);
    }
    // sources
    const f0pts = typeof o.f0 === 'number' || o.f0 === undefined ? [[0, o.f0 ?? 110]] : o.f0;
    const f0avg = f0pts.reduce((s, p) => s + p[1], 0) / f0pts.length;
    const mk = (ratio, amp, det) => {
      const og = this.gain(amp, am);
      const osc = this.osc(o.type || 'sawtooth', f0pts[0][1] * ratio, t, dur, og, det);
      osc.frequency.setValueAtTime(f0pts[0][1] * ratio, t);
      for (let j = 1; j < f0pts.length; j++) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f0pts[j][1] * ratio), t + f0pts[j][0]);
      }
      if (o.jitter !== 0) this.rand(t, dur, o.jitterHz ?? 14, f0avg * ratio * (o.jitter ?? 0.03), osc.frequency);
      if (o.vib) this.lfo(t, dur, o.vib[0] * this.r(0.9, 1.1), o.vib[1], osc.detune);
      return osc;
    };
    mk(1, o.voiced ?? 1, 0);
    if (o.dual) mk(o.dual, (o.dualAmp ?? 0.6) * (o.voiced ?? 1), this.r(-15, 15));
    if (o.sub) mk(0.5, o.sub * (o.voiced ?? 1), 0);
    // breath noise
    if (o.breath) {
      const bg = this.gain(o.breath, bankIn);
      const hpf = this.hp(o.breathHp ?? 500, 0.7, bg);
      this.noise(t, dur, 'white', hpf);
    }
    return outG;
  }
}

// ---------------------------------------------------------------------------
// Post-processing

function peakOf(buf) {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > p) p = a; }
  }
  return p;
}

// trim trailing silence, normalise peak to `level`, apply short fades, optional loop folding
export function finalizeBuffer(buf, o = {}) {
  const bctx = o.ctx;
  const sr = buf.sampleRate;
  const nch = buf.numberOfChannels;
  let peak = peakOf(buf);
  if (!(peak > 1e-6)) peak = 1e-6;
  let len = buf.length;
  if (o.loop) {
    const X = Math.min(Math.floor((o.xfade ?? 0.3) * sr), Math.floor(len / 3));
    const L = len - X;
    const out = makeBuffer(nch, L, sr, bctx);
    for (let c = 0; c < nch; c++) {
      const s = buf.getChannelData(c), d = out.getChannelData(c);
      for (let i = 0; i < L; i++) d[i] = s[i];
      for (let i = 0; i < X; i++) {
        const k = i / X;
        d[i] = s[i] * Math.sin(k * Math.PI / 2) + s[L + i] * Math.cos(k * Math.PI / 2);
      }
    }
    const pk = Math.max(1e-6, peakOf(out));
    const g = (o.level ?? 0.8) / pk;
    for (let c = 0; c < nch; c++) { const d = out.getChannelData(c); for (let i = 0; i < L; i++) d[i] *= g; }
    return out;
  }
  if (o.trim !== false) {
    const thr = peak * (o.trimThr ?? 0.0006);
    let last = 0;
    for (let c = 0; c < nch; c++) {
      const d = buf.getChannelData(c);
      for (let i = d.length - 1; i > last; i--) { if (Math.abs(d[i]) > thr) { last = i; break; } }
    }
    len = Math.min(buf.length, last + Math.floor(0.01 * sr) + 1);
  }
  const out = makeBuffer(nch, Math.max(16, len), sr, bctx);
  const g = (o.level ?? 0.8) / peak;
  const fadeOut = Math.min(Math.floor(0.012 * sr), Math.floor(len * 0.2));
  const fadeIn = o.fadeIn ? Math.floor(o.fadeIn * sr) : 0;
  for (let c = 0; c < nch; c++) {
    const s = buf.getChannelData(c), d = out.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = s[i] * g;
    for (let i = 0; i < fadeOut; i++) d[len - 1 - i] *= i / fadeOut;
    for (let i = 0; i < fadeIn && i < len; i++) d[i] *= i / fadeIn;
  }
  return out;
}

export function bufferStats(buf) {
  let peak = 0, sum = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), dur: buf.duration };
}

// ---------------------------------------------------------------------------
// Impulse responses

// Reverb preset table. T60 in seconds; early = [[time, amp], ...] discrete reflections;
// flutter = [period, amp] periodic reflections; lp0/lp1 damping lowpass (Hz) at start/end.
export const REVERB_PRESETS = {
  outdoor: {
    len: 2.6, t60: 1.9, pre: 0.0, diffuse: 0.22, lp0: 2200, lp1: 700, width: 1,
    early: [[0.075, 0.55], [0.13, 0.42], [0.21, 0.36], [0.33, 0.3], [0.48, 0.24], [0.69, 0.17], [0.95, 0.12], [1.3, 0.08], [1.7, 0.05]],
    earlySmear: 0.028, wet: 0.5, gunSend: 1.0, send: 0.28,
  },
  room: {
    len: 0.9, t60: 0.55, pre: 0.003, diffuse: 1, lp0: 7000, lp1: 2200, width: 0.8,
    early: [[0.004, 0.7], [0.007, 0.6], [0.011, 0.55], [0.016, 0.5], [0.021, 0.45], [0.029, 0.4], [0.037, 0.3]],
    earlySmear: 0.002, wet: 0.42, gunSend: 0.85, send: 0.3,
  },
  hall: {
    len: 2.8, t60: 2.3, pre: 0.018, diffuse: 1, lp0: 6500, lp1: 1500, width: 1,
    early: [[0.021, 0.55], [0.034, 0.5], [0.047, 0.45], [0.063, 0.4], [0.081, 0.34], [0.1, 0.3]],
    earlySmear: 0.004, wet: 0.55, gunSend: 0.95, send: 0.35,
  },
  tunnel: {
    len: 3.2, t60: 2.8, pre: 0.006, diffuse: 0.9, lp0: 4500, lp1: 900, width: 0.9,
    early: [[0.012, 0.5], [0.025, 0.45]], flutter: [0.031, 0.5], earlySmear: 0.003,
    wet: 0.62, gunSend: 1.0, send: 0.38,
  },
  sewer: {
    len: 3.6, t60: 3.2, pre: 0.005, diffuse: 0.9, lp0: 3800, lp1: 800, width: 0.9,
    early: [[0.009, 0.55], [0.019, 0.45]], flutter: [0.0185, 0.55], earlySmear: 0.002,
    wet: 0.68, gunSend: 1.0, send: 0.42,
  },
  stairwell: {
    len: 2.4, t60: 2.1, pre: 0.003, diffuse: 0.9, lp0: 9000, lp1: 2600, width: 0.85,
    early: [[0.006, 0.6], [0.013, 0.5]], flutter: [0.0115, 0.45], earlySmear: 0.0015,
    wet: 0.58, gunSend: 1.0, send: 0.36,
  },
  safe: {
    len: 0.5, t60: 0.32, pre: 0.002, diffuse: 1, lp0: 5000, lp1: 1800, width: 0.7,
    early: [[0.003, 0.5], [0.006, 0.4], [0.010, 0.35], [0.015, 0.3]],
    earlySmear: 0.002, wet: 0.3, gunSend: 0.6, send: 0.22,
  },
  // internal: lush hall for music, dark outdoor wash for distant ambience details
  music: {
    len: 3.4, t60: 2.8, pre: 0.025, diffuse: 1, lp0: 6000, lp1: 1300, width: 1,
    early: [[0.019, 0.4], [0.031, 0.35], [0.044, 0.3], [0.058, 0.25]], earlySmear: 0.005, wet: 1,
  },
  far: {
    len: 3.4, t60: 2.9, pre: 0.03, diffuse: 0.7, lp0: 1800, lp1: 500, width: 1,
    early: [[0.12, 0.4], [0.26, 0.3], [0.47, 0.25], [0.8, 0.15], [1.2, 0.1]], earlySmear: 0.04, wet: 1,
  },
};

export function makeImpulse(ctx, name) {
  const P = REVERB_PRESETS[name] || REVERB_PRESETS.room;
  const sr = ctx.sampleRate;
  const N = Math.floor(P.len * sr);
  const buf = ctx.createBuffer(2, N, sr);
  const rng = mulberry32(hashStr('ir_' + name));
  const decayK = 6.9 / P.t60;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // diffuse tail with time-varying one-pole lowpass (HF decays faster)
    const pre = Math.floor(P.pre * sr);
    let y = 0;
    const onset = Math.floor(0.012 * sr);
    const perSample = Math.exp(-decayK / sr);
    const BL = 64;
    for (let i0 = pre; i0 < N; i0 += BL) {
      const tt = (i0 - pre) / sr;
      const fc = P.lp0 * Math.pow(P.lp1 / P.lp0, Math.min(1, (tt / P.len) * 1.5));
      const a = Math.exp(-2 * Math.PI * fc / sr);
      let env = Math.exp(-decayK * tt) * P.diffuse * 2.2;
      const iEnd = Math.min(N, i0 + BL);
      for (let i = i0; i < iEnd; i++) {
        y = y * a + (rng() * 2 - 1) * (1 - a);
        const on = i - pre < onset ? (i - pre) / onset : 1;
        d[i] += y * env * on;
        env *= perSample;
      }
    }
    // flutter echoes (tunnels / pipes / stairwells)
    if (P.flutter) {
      const [per, amp] = P.flutter;
      let tt = P.pre + per * (ch ? 1.07 : 1);
      let n = 0;
      while (tt < P.len * 0.8) {
        const i = Math.floor(tt * sr);
        const e = amp * Math.exp(-decayK * tt * 1.3) * (n % 2 ? 0.8 : 1);
        const L = 3 + n;
        for (let k = 0; k < L && i + k < N; k++) d[i + k] += e * (rng() * 2 - 1) * (1 - k / L) * 1.5;
        tt += per * (1 + (rng() - 0.5) * 0.02);
        n++;
      }
    }
    // early reflections / slap echoes: short filtered noise bursts
    for (const [et, ea] of P.early) {
      const tt = et * (1 + (ch ? 0.09 : -0.05) * P.width * (rng() * 0.5 + 0.5));
      const i0 = Math.floor(tt * sr);
      const L = Math.max(4, Math.floor((P.earlySmear || 0.003) * sr * (1 + tt * 2)));
      const fc = P.lp0 * Math.pow(P.lp1 / P.lp0, Math.min(1, tt / P.len * 2));
      const a = Math.exp(-2 * Math.PI * fc / sr);
      let z = 0;
      const sgn = rng() < 0.5 ? -1 : 1;
      for (let k = 0; k < L * 3 && i0 + k < N; k++) {
        const x = k < L ? (rng() * 2 - 1) + (k === 0 ? sgn * 3 : 0) : 0;
        z = z * a + x * (1 - a);
        d[i0 + k] += z * ea * 3.5 * (ch === 0 ? 1 : (0.75 + rng() * 0.5));
      }
    }
  }
  // energy normalisation
  let e = 0;
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < N; i++) e += d[i] * d[i]; }
  const g = 1 / Math.sqrt(e / 2 + 1e-9) * 0.9;
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < N; i++) d[i] *= g; }
  return buf;
}
