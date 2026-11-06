/* =============================================================================
 * SPLEEN: SEPSIS — audio.js
 * -----------------------------------------------------------------------------
 * Complete audio system: procedural SFX + generative adaptive music.
 * Pure Web Audio API. No libraries, no samples, no network. Classic script that
 * defines exactly one global: AUDIO.
 *
 * PUBLIC API
 *   AUDIO.init()                  Create/resume the AudioContext. Call from a user
 *                                 gesture. Idempotent, never throws. Returns bool.
 *   AUDIO.ready                   true once init() has created a context.
 *   AUDIO.setVolume(kind, v)      kind 'master'|'music'|'sfx', v 0..1. Perceptual
 *                                 curve (gain = v*v), smoothed ramp.
 *   AUDIO.getVolume(kind)         -> the v last set (0..1).
 *   AUDIO.setMuted(bool)          smooth master mute. AUDIO.muted reads (and sets) it.
 *   AUDIO.sfx(name, opts)         opts (all optional):
 *                                   vol   0..2 gain multiplier (default 1)
 *                                   rate  playback-rate multiplier (1.1 = ~1.7 st up).
 *                                         PREFERRED way to pitch.
 *                                   pitch semitone offset (combined with rate)
 *                                   pan   -1..1
 *                                   force true = bypass the per-name throttle
 *                                 Returns a handle {stop(fadeSec)} or null.
 *                                 Unknown name -> console.warn once, returns null.
 *   AUDIO.stopSfx(name, fadeSec)  stop all live voices of a name (e.g. charge sounds).
 *   AUDIO.music.play(id, opts)    ids: title shop veins heart lungs gut cortex wound
 *                                 boss final victory death. opts {region} for 'boss'
 *                                 (defaults to the last region played). ~1.5s
 *                                 crossfade. Same track (and region) again = no-op.
 *                                 Calls before init() are remembered.
 *   AUDIO.music.stop(fadeSec)
 *   AUDIO.music.setIntensity(x)   0..1. Cheap; may be called every frame.
 *   AUDIO.music.current           current track id or null. (.region for boss)
 *   AUDIO.music.clock()           -> {beat, bpm, bar, bpb}. beat = float beats since
 *                                 the current track started. Monotonic. Keeps
 *                                 advancing without audio (performance.now fallback);
 *                                 aligned with audible beats when audio runs.
 *   AUDIO.duck(amount, sec)       briefly duck music; amount 0..1.
 *   AUDIO.setLowpass(on)          muffle music (pause / low HP).
 *
 * TEST HOOKS (underscore = not for gameplay)
 *   AUDIO._sfxNames, AUDIO._trackIds, AUDIO._regions
 *   AUDIO._renderSfx(name, variant?, sampleRate?)             -> Promise<AudioBuffer>
 *   AUDIO._renderMusic(id, seconds, intensity, {region, raw, sampleRate, seed})
 *                                                             -> Promise<AudioBuffer>
 *   AUDIO._debug()                                            -> state snapshot
 * ===========================================================================*/
(function (root) {
  "use strict";

  // ===========================================================================
  // 0. Utilities
  // ===========================================================================
  const AC = root.AudioContext || root.webkitAudioContext || null;
  const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext || null;
  const doc = root.document || null;
  const perfNow = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const mod = (a, n) => ((a % n) + n) % n;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  const warned = Object.create(null);
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    try { console.warn('[AUDIO] ' + msg); } catch (_) { /* ignore */ }
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // mulberry32 seeded RNG with helpers
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    const r = function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }
  const RND = makeRng((Date.now() ^ 0x5bd1e995) >>> 0);
  function safeDisconnect(n) { try { n.disconnect(); } catch (_) { /* already */ } }
  // freeze an AudioParam at its current automated value before a new ramp
  function holdParam(p, now) {
    if (p.cancelAndHoldAtTime) { try { p.cancelAndHoldAtTime(now); return; } catch (_) { /* fall back */ } }
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
  }

  // ===========================================================================
  // 1. Shared buffers: noise, impulse responses, shaper curves
  // ===========================================================================
  const NOISE = Object.create(null); // sampleRate -> {w,p,b}
  const IRS = Object.create(null);   // sampleRate -> {music,sfx}

  function noiseFor(c) {
    const sr = c.sampleRate;
    if (NOISE[sr]) return NOISE[sr];
    const len = Math.floor(sr * 2);
    const rnd = makeRng(1234567);
    const mk = () => c.createBuffer(1, len, sr);
    const b = { w: mk(), p: mk(), b: mk() };
    const W = b.w.getChannelData(0), P = b.p.getChannelData(0), B = b.b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      W[i] = w;
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      P[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      br = (br + 0.02 * w) / 1.02;
      B[i] = br * 3.5;
    }
    // crossfade the loop seam of the coloured noises so looping never clicks
    const xf = Math.floor(sr * 0.05);
    for (const arr of [P, B]) {
      for (let i = 0; i < xf; i++) {
        const a = i / xf, j = len - xf + i;
        arr[j] = arr[j] * (1 - a) + arr[i] * a;
      }
    }
    NOISE[sr] = b;
    return b;
  }

  // Generated stereo impulse: pre-delay, sparse early reflections, a noise tail
  // that darkens as it decays (one-pole lowpass with falling cutoff).
  function makeIR(c, secs, pre, bright, seed) {
    const sr = c.sampleRate, len = Math.floor(secs * sr);
    const ir = c.createBuffer(2, len, sr);
    const rnd = makeRng(seed);
    const preN = Math.floor(pre * sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = preN; i < len; i++) {
        const x = (i - preN) / (len - preN);
        const env = Math.exp(-x * 5.5) * (1 - x);
        const a = bright * (1 - x * 0.85) + 0.02;
        lp += a * ((rnd() * 2 - 1) - lp);
        d[i] = lp * env;
      }
      for (let k = 0; k < 7; k++) {
        const idx = preN + Math.floor(rnd() * 0.07 * sr);
        if (idx < len) d[idx] += (rnd() < 0.5 ? -1 : 1) * (0.45 - k * 0.05);
      }
    }
    return ir;
  }
  function irsFor(c) {
    const sr = c.sampleRate;
    if (!IRS[sr]) IRS[sr] = { music: makeIR(c, 3.4, 0.025, 0.32, 991), sfx: makeIR(c, 1.5, 0.008, 0.45, 773) };
    return IRS[sr];
  }

  const CURVES = Object.create(null);
  function driveCurve(amt) {
    const key = 'd' + Math.round(amt * 100);
    if (CURVES[key]) return CURVES[key];
    const n = 1024, cv = new Float32Array(n), k = 1 + amt * 24, norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(k * x) / norm; }
    return (CURVES[key] = cv);
  }
  // final safety soft clipper: linear to 0.85, then tanh knee to a 0.98 ceiling
  function clipCurve() {
    if (CURVES.clip) return CURVES.clip;
    const n = 4096, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1, ax = Math.abs(x);
      cv[i] = ax < 0.85 ? x : Math.sign(x) * (0.85 + 0.13 * Math.tanh((ax - 0.85) / 0.13));
    }
    return (CURVES.clip = cv);
  }

  // ===========================================================================
  // 2. Synthesis primitives (work on any BaseAudioContext: live or offline)
  // ===========================================================================
  // AudioParam helpers ---------------------------------------------------------
  function ramp(p, t, v1, v2, dur, lin) {
    p.setValueAtTime(v1, t);
    if (v2 == null || v2 === v1) return;
    if (lin || v1 <= 0 || v2 <= 0) p.linearRampToValueAtTime(v2, t + dur);
    else p.exponentialRampToValueAtTime(v2, t + dur);
  }
  // multi-point automation: pts = [[dtFromT, value], ...]
  function points(p, t, v0, pts, lin, step) {
    p.setValueAtTime(v0, t);
    let prev = v0;
    for (let i = 0; i < pts.length; i++) {
      const tt = t + pts[i][0], v = pts[i][1];
      if (step) p.setValueAtTime(v, tt);
      else if (lin || prev <= 0 || v <= 0) p.linearRampToValueAtTime(v, tt);
      else p.exponentialRampToValueAtTime(v, tt);
      prev = v;
    }
  }
  // attack / hold / exponential (or linear) decay to silence at t+d
  function envAHD(p, t, a, h, d, peak, lin) {
    a = Math.max(0.0005, a);
    const end = t + Math.max(d, a + h + 0.004);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (h > 0) p.setValueAtTime(peak, t + a + h);
    if (lin) p.linearRampToValueAtTime(0, end);
    else {
      p.exponentialRampToValueAtTime(Math.max(peak * 0.0006, 1e-6), end);
      p.setValueAtTime(0, end + 0.001);
    }
    return end;
  }

  // Synth: a tiny voice-builder DSL. k = global frequency multiplier (used by the
  // live fallback path to apply pitch), st = stereo output (enables pan).
  function Synth(c, out, k, st, rng) {
    this.c = c; this.out = out; this.k = k || 1; this.st = !!st; this.r = rng || RND;
  }
  const SP = Synth.prototype;

  // filter chain: o.hp / o.bp / o.lp, each a number or {f, f2, t, q, p:[[dt,f]..]}
  SP.filt = function (node, o, t, d) {
    const c = this.c, k = this.k;
    const types = ['hp', 'bp', 'lp'];
    for (let i = 0; i < 3; i++) {
      const spec0 = o[types[i]];
      if (spec0 == null) continue;
      const spec = typeof spec0 === 'number' ? { f: spec0 } : spec0;
      const f = c.createBiquadFilter();
      f.type = types[i] === 'hp' ? 'highpass' : types[i] === 'bp' ? 'bandpass' : 'lowpass';
      f.Q.value = spec.q != null ? spec.q : (types[i] === 'bp' ? 1.5 : 0.7);
      if (spec.p) points(f.frequency, t, spec.f * k, spec.p.map((q) => [q[0], q[1] * k]));
      else ramp(f.frequency, t, spec.f * k, spec.f2 != null ? spec.f2 * k : null, spec.t || d);
      node.connect(f);
      node = f;
    }
    return node;
  };
  // amplitude modulation: o.am {r, r2, d} (tremolo, optionally accelerating) or
  // o.crk density 0..1 (random crackle gating)
  SP.amod = function (node, o, t, d) {
    const c = this.c;
    if (o.am) {
      const g = c.createGain();
      g.gain.value = 1 - o.am.d;
      const l = c.createOscillator();
      l.type = o.am.w || 'sine';
      ramp(l.frequency, t, o.am.r, o.am.r2 != null ? o.am.r2 : null, d);
      const lg = c.createGain();
      lg.gain.value = o.am.d;
      l.connect(lg); lg.connect(g.gain);
      l.start(t); l.stop(t + d + 0.05);
      node.connect(g);
      return g;
    }
    if (o.crk) {
      const g = c.createGain(), r = this.r;
      let tt = t;
      g.gain.setValueAtTime(0, t);
      while (tt < t + d) {
        g.gain.setValueAtTime(r() < o.crk ? 0.35 + r() * 0.65 : r() * 0.08, tt);
        tt += 0.003 + r() * 0.011;
      }
      node.connect(g);
      return g;
    }
    return node;
  };
  // gain envelope + optional pan -> destination
  SP.finish = function (node, o, t, d) {
    const c = this.c;
    const g = c.createGain();
    node.connect(g);
    envAHD(g.gain, t, o.a != null ? o.a : 0.002, o.h || 0, d, o.g != null ? o.g : 0.5, o.lin);
    const dest = o.dest || this.out;
    if (o.pan != null && this.st && c.createStereoPanner) {
      const p = c.createStereoPanner();
      if (Array.isArray(o.pan)) ramp(p.pan, t, clamp(o.pan[0], -1, 1), clamp(o.pan[1], -1, 1), d, true);
      else p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p); p.connect(dest);
    } else g.connect(dest);
    return g;
  };
  // oscillator voice. o: t d w f f2 ft fp fstep lin det vib{r,d} fm{r,i,i2,t,w}
  //                     hp bp lp am crk a h g pan dest
  SP.tone = function (o) {
    const c = this.c, k = this.k, t = o.t || 0, d = o.d || 0.1;
    const osc = c.createOscillator();
    osc.type = o.w || 'sine';
    const f = o.f * k;
    const f2 = o.f2 != null ? o.f2 * k : null;
    if (o.fp) points(osc.frequency, t, f, o.fp.map((q) => [q[0], q[1] * k]), o.lin, o.fstep);
    else ramp(osc.frequency, t, f, f2, o.ft || d, o.lin);
    if (o.det) osc.detune.value = o.det;
    const stopAt = t + d + 0.03;
    if (o.fm) {
      const r = o.fm.r;
      const mo = c.createOscillator();
      mo.type = o.fm.w || 'sine';
      if (o.fp) points(mo.frequency, t, f * r, o.fp.map((q) => [q[0], q[1] * k * r]), o.lin, o.fstep);
      else ramp(mo.frequency, t, f * r, f2 != null ? f2 * r : null, o.ft || d, o.lin);
      const mg = c.createGain();
      const i1 = o.fm.i * f * r;
      const i2 = (o.fm.i2 != null ? o.fm.i2 : o.fm.i) * (f2 != null ? f2 : f) * r;
      ramp(mg.gain, t, i1, i2, o.fm.t || d, true);
      mo.connect(mg); mg.connect(osc.frequency);
      mo.start(t); mo.stop(stopAt);
    }
    if (o.vib) {
      const l = c.createOscillator();
      l.frequency.value = o.vib.r;
      const lg = c.createGain();
      lg.gain.value = o.vib.d;
      l.connect(lg); lg.connect(osc.detune);
      l.start(t); l.stop(stopAt);
    }
    let node = this.filt(osc, o, t, d);
    node = this.amod(node, o, t, d);
    const g = this.finish(node, o, t, d);
    osc.start(t); osc.stop(stopAt);
    osc.onended = () => safeDisconnect(g);
    return osc;
  };
  // looping noise voice. o: t d col('w'|'p'|'b') rate + filters/env as tone
  SP.noise = function (o) {
    const c = this.c, t = o.t || 0, d = o.d || 0.1;
    const src = c.createBufferSource();
    src.buffer = noiseFor(c)[o.col || 'w'];
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    let node = this.filt(src, o, t, d);
    node = this.amod(node, o, t, d);
    const g = this.finish(node, o, t, d);
    src.start(t, this.r() * 1.7);
    src.stop(t + d + 0.03);
    src.onended = () => safeDisconnect(g);
    return src;
  };
  // insert effects (persist until their sources end)
  SP.drive = function (amt, dest, post) {
    const c = this.c, ws = c.createWaveShaper();
    ws.curve = driveCurve(amt);
    ws.oversample = '2x';
    const g = c.createGain();
    g.gain.value = post != null ? post : 0.5;
    ws.connect(g); g.connect(dest || this.out);
    return ws;
  };
  SP.fx = function (type, f, q, dest, auto, t) {
    const c = this.c, k = this.k, bq = c.createBiquadFilter();
    bq.type = type;
    bq.Q.value = q;
    if (auto && auto.p) points(bq.frequency, t || 0, f * k, auto.p.map((x) => [x[0], x[1] * k]));
    else bq.frequency.value = f * k;
    bq.connect(dest || this.out);
    return bq;
  };
  SP.bus = function (gain, dest) {
    const g = this.c.createGain();
    g.gain.value = gain;
    g.connect(dest || this.out);
    return g;
  };

  // ===========================================================================
  // 3. SFX definitions
  //    d: render length (s)   lvl: loudness target (dBFS, max 20ms RMS)
  //    vars: cached variants  max: concurrent voices  thr: throttle (s)
  //    rev: reverb send       pri: steal priority     jit: random pitch (st)
  //    st: render stereo      gen(S, t, r): build the sound
  // ===========================================================================
  const SFX = {
    // ---------------------------------------------------------------- UI ----
    ui_hover: { d: 0.05, lvl: -31, vars: 3, max: 2, thr: 0.04, rev: 0.04, pri: 0, jit: 0.4,
      gen(S, t, r) {
        S.tone({ t, d: 0.035, f: r.range(2300, 2600), f2: 1700, g: 0.3 });
        S.noise({ t, d: 0.012, hp: 6000, g: 0.08 });
      } },
    ui_click: { d: 0.09, lvl: -24, vars: 2, max: 3, rev: 0.05, pri: 0,
      gen(S, t) {
        S.tone({ t, d: 0.05, f: 1250, f2: 620, w: 'triangle', g: 0.4 });
        S.tone({ t, d: 0.07, f: 320, f2: 170, g: 0.35 });
        S.noise({ t, d: 0.015, bp: { f: 3200, q: 1 }, g: 0.25 });
      } },
    ui_back: { d: 0.17, lvl: -24, max: 2, rev: 0.08, pri: 0,
      gen(S, t) {
        S.tone({ t, d: 0.07, f: 880, f2: 560, w: 'triangle', g: 0.35 });
        S.tone({ t: t + 0.055, d: 0.09, f: 620, f2: 360, w: 'triangle', g: 0.35 });
      } },
    ui_confirm: { d: 0.5, lvl: -20, max: 2, rev: 0.25, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.25, f: 880, fm: { r: 2, i: 1.2, i2: 0 }, g: 0.35 });
        S.tone({ t: t + 0.07, d: 0.4, f: 1318.5, fm: { r: 2, i: 1.0, i2: 0 }, g: 0.35 });
        S.tone({ t: t + 0.07, d: 0.3, f: 2637, g: 0.07 });
      } },
    ui_error: { d: 0.26, lvl: -22, max: 2, rev: 0.04, pri: 1,
      gen(S, t) {
        for (let i = 0; i < 2; i++) {
          const tt = t + i * 0.12;
          S.tone({ t: tt, d: 0.1, f: 110, w: 'square', lp: 700, a: 0.004, h: 0.06, g: 0.3 });
          S.tone({ t: tt, d: 0.1, f: 116.5, w: 'sawtooth', lp: 900, a: 0.004, h: 0.06, g: 0.25 });
        }
      } },
    ui_open: { d: 0.4, lvl: -24, max: 2, rev: 0.3, pri: 0,
      gen(S, t) {
        S.noise({ t, d: 0.35, col: 'p', bp: { f: 350, f2: 2600, q: 1.4, t: 0.3 }, a: 0.12, g: 0.6 });
        S.tone({ t, d: 0.3, f: 180, f2: 420, a: 0.1, g: 0.15 });
      } },

    // ------------------------------------------------------- player shots ---
    shoot_neutrophil: { d: 0.1, lvl: -26, vars: 4, max: 4, thr: 0.03, jit: 0.8, rev: 0.06, pri: 0,
      gen(S, t, r) {
        const f = r.range(1250, 1550);
        S.tone({ t, d: 0.075, f, f2: f * 0.28, fm: { r: 1.5, i: 1.6, i2: 0 }, g: 0.45 });
        S.noise({ t, d: 0.035, col: 'p', bp: { f: 2600, f2: 900, q: 2.5 }, g: 0.35 });
      } },
    shoot_macrophage: { d: 0.18, lvl: -22, vars: 3, max: 3, thr: 0.04, jit: 0.8, rev: 0.08, pri: 0,
      gen(S, t, r) {
        S.noise({ t, d: 0.14, col: 'p', bp: { f: 1900, f2: 380, q: 1.2 }, g: 0.7 });
        S.noise({ t, d: 0.05, hp: 3500, g: 0.25 });
        S.tone({ t, d: 0.1, f: 190, f2: 55, g: 0.55 });
        for (let i = 0; i < 4; i++) {
          const f = r.range(700, 1700);
          S.tone({ t: t + r.range(0, 0.035), d: 0.04, f, f2: f * 0.4, w: 'triangle', g: 0.12 });
        }
      } },
    shoot_tcell: { d: 0.06, lvl: -26, vars: 3, max: 4, thr: 0.03, jit: 0.6, rev: 0.05, pri: 0,
      gen(S, t, r) {
        S.tone({ t, d: 0.022, f: r.range(3000, 3400), f2: 2300, w: 'square', hp: 1500, g: 0.18 });
        S.tone({ t, d: 0.04, f: 1900, f2: 950, g: 0.35 });
        S.noise({ t, d: 0.01, hp: 5000, g: 0.25 });
      } },
    shoot_tcell_charged: { d: 0.45, lvl: -14, vars: 2, max: 2, thr: 0.05, rev: 0.25, pri: 2,
      gen(S, t) {
        S.tone({ t, d: 0.38, f: 1700, f2: 160, w: 'sawtooth', bp: { f: 2400, f2: 500, q: 1.2 }, g: 0.5 });
        S.tone({ t, d: 0.25, f: 2100, f2: 300, fm: { r: 3.01, i: 5, i2: 0 }, g: 0.25 });
        S.tone({ t, d: 0.3, f: 130, f2: 40, g: 0.8 });
        S.noise({ t, d: 0.3, bp: { f: 4500, f2: 700, q: 1.5 }, g: 0.45 });
        S.noise({ t, d: 0.02, hp: 2000, g: 0.5 });
      } },
    charge_tcell: { d: 0.66, lvl: -22, max: 2, thr: 0.1, rev: 0.12, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.64, f: 280, f2: 1400, ft: 0.6, w: 'sawtooth', lp: { f: 900, f2: 5000, t: 0.6 },
          a: 0.55, h: 0.04, g: 0.35, vib: { r: 14, d: 25 } });
        S.tone({ t, d: 0.64, f: 560, f2: 2800, ft: 0.6, a: 0.55, h: 0.04, g: 0.18, am: { r: 8, r2: 30, d: 0.6 } });
        S.noise({ t, d: 0.64, hp: { f: 2000, f2: 7000, t: 0.6 }, a: 0.55, h: 0.04, g: 0.12 });
      } },
    shoot_bcell: { d: 0.09, lvl: -26, vars: 4, max: 4, thr: 0.03, jit: 1, rev: 0.1, pri: 0,
      gen(S, t, r) {
        const f = r.range(450, 600);
        S.tone({ t, d: 0.06, f, f2: f * 2.3, ft: 0.04, g: 0.45 });
        S.tone({ t: t + 0.022, d: 0.05, f: f * 1.4, f2: f * 3, ft: 0.035, g: 0.22 });
      } },
    shoot_helper: { d: 0.045, lvl: -31, vars: 3, max: 3, thr: 0.03, jit: 1.2, rev: 0.05, pri: 0,
      gen(S, t, r) { S.tone({ t, d: 0.03, f: r.range(1700, 1950), f2: 1350, w: 'triangle', g: 0.3 }); } },

    // ------------------------------------------------------------- player ---
    dash: { d: 0.25, lvl: -22, vars: 2, max: 2, thr: 0.05, rev: 0.12, pri: 1,
      gen(S, t) {
        S.noise({ t, d: 0.22, col: 'p', bp: { f: 500, p: [[0.07, 3200], [0.2, 900]], q: 1.1 }, a: 0.04, g: 0.7 });
        S.noise({ t, d: 0.12, hp: 2500, a: 0.02, g: 0.12 });
      } },
    hurt: { d: 0.35, lvl: -11, vars: 3, max: 2, thr: 0.07, rev: 0.15, pri: 3,
      gen(S, t, r) {
        S.tone({ t, d: 0.26, f: r.range(140, 165), f2: 42, g: 0.9 });
        S.noise({ t, d: 0.22, col: 'p', bp: { f: r.range(1100, 1500), f2: 240, q: 4 }, g: 0.9 });
        const dr = S.drive(0.6, null, 0.4);
        S.tone({ t, d: 0.2, f: r.range(380, 440), f2: 110, w: 'sawtooth', lp: { f: 1400, f2: 400 },
          fm: { r: 0.5, i: 2 }, g: 0.6, dest: dr });
        S.noise({ t, d: 0.045, bp: { f: 3200, q: 1 }, g: 0.35 });
      } },
    death: { d: 1.9, lvl: -11, max: 1, thr: 0.5, rev: 0.35, pri: 3, st: true,
      gen(S, t, r) {
        S.tone({ t, d: 1.3, f: 120, f2: 28, g: 0.5 });
        S.noise({ t, d: 1.7, col: 'b', lp: { f: 1000, f2: 90, t: 1.6 }, a: 0.01, g: 0.9 });
        const dr = S.drive(0.5, null, 0.35);
        S.tone({ t, d: 1.4, f: 210, f2: 48, w: 'sawtooth', lp: { f: 1200, f2: 180 }, vib: { r: 5, d: 40 },
          a: 0.05, g: 0.5, dest: dr });
        for (let i = 0; i < 6; i++) {
          const tt = t + 0.05 + i * 0.13 + r.range(0, 0.07), f = r.range(1500, 2400) * (1 - i * 0.1);
          S.noise({ t: tt, d: 0.18, col: 'p', bp: { f, f2: f * 0.25, q: 3.5 }, g: 0.55 - i * 0.05, pan: r.range(-0.6, 0.6) });
        }
        S.tone({ t: t + 0.75, d: 0.5, f: 85, f2: 32, g: 0.9 });
        S.noise({ t: t + 0.75, d: 0.4, col: 'b', lp: 300, g: 0.7 });
      } },
    heal: { d: 0.95, lvl: -18, max: 2, thr: 0.1, rev: 0.4, pri: 1, st: true,
      gen(S, t) {
        [72, 76, 79, 84].forEach((m, i) => S.tone({ t: t + i * 0.06, d: 0.7, f: mtof(m),
          fm: { r: 2, i: 0.8, i2: 0.1 }, a: 0.005, g: 0.25, pan: -0.3 + i * 0.2 }));
        S.tone({ t, d: 0.9, f: mtof(60), f2: mtof(67), w: 'triangle', lp: 1500, a: 0.25, g: 0.18 });
      } },
    shield_gain: { d: 0.7, lvl: -20, max: 2, thr: 0.1, rev: 0.45, pri: 1, st: true,
      gen(S, t) {
        [1, 2.76, 5.4].forEach((m, i) => S.tone({ t: t + i * 0.03, d: 0.6, f: 900 * m, f2: 1250 * m, ft: 0.35,
          a: 0.08, g: 0.18 / (i + 1), am: { r: 13, d: 0.4 }, pan: [-0.5 + i * 0.5, 0.5 - i * 0.5] }));
        S.noise({ t, d: 0.5, hp: { f: 5000, f2: 9000 }, a: 0.2, g: 0.12 });
      } },
    shield_break: { d: 0.5, lvl: -15, max: 2, thr: 0.08, rev: 0.3, pri: 2, st: true,
      gen(S, t, r) {
        S.noise({ t, d: 0.08, bp: { f: 3500, q: 1.2 }, g: 0.8 });
        for (let i = 0; i < 6; i++) {
          S.tone({ t: t + r.range(0, 0.04), d: r.range(0.12, 0.35), f: r.range(2200, 6500), g: 0.12, pan: r.range(-0.7, 0.7) });
        }
        S.tone({ t, d: 0.13, f: 320, f2: 75, g: 0.7 });
        S.noise({ t, d: 0.22, col: 'p', lp: { f: 2000, f2: 300 }, g: 0.5 });
      } },
    ability_ready: { d: 0.7, lvl: -22, max: 1, thr: 0.2, rev: 0.35, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.6, f: 1568, fm: { r: 2, i: 0.9, i2: 0 }, g: 0.3 });
        S.tone({ t: t + 0.09, d: 0.5, f: 2093, g: 0.12 });
      } },
    ability_net: { d: 0.5, lvl: -16, max: 2, thr: 0.08, rev: 0.15, pri: 2, st: true,
      gen(S, t, r) {
        S.noise({ t, d: 0.16, bp: { f: 700, f2: 3200, q: 1.3 }, a: 0.05, g: 0.45 });
        S.tone({ t, d: 0.14, f: 300, f2: 1100, w: 'triangle', a: 0.03, g: 0.15 });
        const ts = t + 0.15;
        S.noise({ t: ts, d: 0.16, col: 'p', bp: { f: 1600, f2: 280, q: 2 }, g: 0.9 });
        S.tone({ t: ts, d: 0.12, f: 190, f2: 70, w: 'triangle', g: 0.45 });
        for (let i = 0; i < 5; i++) {
          const f = r.range(900, 2200);
          S.noise({ t: ts + 0.04 + i * 0.045 + r.range(0, 0.02), d: 0.05, col: 'p', bp: { f, f2: f * 1.6, q: 6 },
            g: 0.3, pan: r.range(-0.5, 0.5) });
        }
      } },
    ability_engulf: { d: 0.7, lvl: -14, max: 1, thr: 0.1, rev: 0.2, pri: 2,
      gen(S, t) {
        S.tone({ t, d: 0.16, f: 230, f2: 85, g: 0.9 });
        S.noise({ t, d: 0.35, col: 'b', lp: { f: 700, f2: 180 }, g: 0.8 });
        S.tone({ t: t + 0.17, d: 0.24, f: 120, fp: [[0.06, 260], [0.22, 70]], g: 0.85 });
        S.noise({ t: t + 0.17, d: 0.4, col: 'p', bp: { f: 420, f2: 220, q: 5 }, g: 0.6 });
        S.noise({ t: t + 0.2, d: 0.08, col: 'p', bp: { f: 2000, q: 3 }, g: 0.25 });
      } },
    ability_mark: { d: 0.7, lvl: -16, max: 2, thr: 0.08, rev: 0.3, pri: 2,
      gen(S, t) {
        S.tone({ t, d: 0.02, f: 2200, w: 'square', hp: 1200, g: 0.25 });
        S.tone({ t: t + 0.11, d: 0.02, f: 2600, w: 'square', hp: 1200, g: 0.25 });
        S.tone({ t: t + 0.1, d: 0.55, f: 659, fm: { r: 1.41, i: 3, i2: 0.3 }, a: 0.01, g: 0.3 });
        S.tone({ t: t + 0.1, d: 0.55, f: 932, fm: { r: 1.41, i: 2.5, i2: 0.2 }, a: 0.01, g: 0.22 });
        S.tone({ t, d: 0.12, f: 1800, f2: 3200, g: 0.1 });
      } },
    ability_swarm: { d: 0.55, lvl: -16, max: 2, thr: 0.08, rev: 0.25, pri: 2, st: true,
      gen(S, t, r) {
        for (let i = 0; i < 14; i++) {
          const f = r.range(1100, 3000);
          S.tone({ t: t + r.range(0, 0.36), d: 0.035, f, f2: f * r.range(1.2, 1.8), g: 0.16, pan: r.range(-0.8, 0.8) });
        }
        S.noise({ t, d: 0.45, col: 'p', bp: { f: 1800, f2: 2600, q: 1.5 }, a: 0.03, g: 0.4, am: { r: 26, d: 0.8 } });
      } },
    revive: { d: 2.0, lvl: -13, max: 1, thr: 0.5, rev: 0.5, pri: 3, st: true,
      gen(S, t) {
        S.noise({ t, d: 1.15, col: 'p', bp: { f: 250, f2: 3500, q: 1.2 }, a: 1.05, g: 0.5 });
        [45, 52, 57, 61, 64].forEach((m, i) => S.tone({ t, d: 1.15, f: mtof(m), w: 'sawtooth', det: (i % 2 ? 7 : -7),
          lp: { f: 300, f2: 4000 }, a: 1.0, g: 0.12, pan: -0.6 + i * 0.3 }));
        const th = t + 1.1;
        S.tone({ t: th, d: 0.6, f: 110, f2: 38, g: 0.5 });
        S.noise({ t: th, d: 0.3, col: 'p', lp: { f: 5000, f2: 400 }, g: 0.5 });
        [69, 73, 76, 81].forEach((m, i) => S.tone({ t: th + i * 0.02, d: 0.85, f: mtof(m),
          fm: { r: 2, i: 1.5, i2: 0.1 }, g: 0.2, pan: -0.45 + i * 0.3 }));
      } },
    low_hp: { d: 0.3, lvl: -16, max: 2, thr: 0.2, rev: 0.1, pri: 2,
      gen(S, t) {
        const dr = S.drive(0.35, null, 0.8);
        S.tone({ t, d: 0.22, f: 72, f2: 40, a: 0.004, g: 0.85, dest: dr });
        S.tone({ t, d: 0.12, f: 150, f2: 75, w: 'triangle', a: 0.004, g: 0.3 });
        S.noise({ t, d: 0.09, col: 'p', bp: { f: 330, f2: 170, q: 1.2 }, g: 0.55 });
      } },

    // ------------------------------------------------------------- combat ---
    hit: { d: 0.12, lvl: -24, vars: 5, max: 6, thr: 0.03, jit: 1.5, rev: 0.08, pri: 0,
      gen(S, t, r) {
        const f = r.range(700, 1500);
        S.noise({ t, d: r.range(0.06, 0.09), col: 'p', bp: { f, f2: f * 0.3, q: r.range(1.1, 2) }, a: 0.001, g: 0.9 });
        S.tone({ t, d: 0.07, f: r.range(200, 260), f2: 90, w: 'triangle', g: 0.3 });
        if (r.chance(0.5)) S.tone({ t: t + 0.005, d: 0.03, f: r.range(900, 1400), f2: 400, w: 'triangle', g: 0.15 });
      } },
    hit_armor: { d: 0.25, lvl: -22, vars: 3, max: 4, thr: 0.03, jit: 1, rev: 0.12, pri: 0,
      gen(S, t, r) {
        const f = r.range(1600, 2100);
        S.tone({ t, d: 0.2, f, fm: { r: 2.41, i: 4, i2: 0 }, g: 0.3 });
        S.tone({ t, d: 0.1, f: f * 1.83, g: 0.1 });
        S.noise({ t, d: 0.02, hp: 4000, g: 0.4 });
        S.tone({ t, d: 0.04, f: 300, f2: 180, g: 0.2 });
      } },
    crit: { d: 0.2, lvl: -18, vars: 3, max: 3, thr: 0.04, jit: 1, rev: 0.12, pri: 1,
      gen(S, t, r) {
        const f = r.range(900, 1400);
        S.noise({ t, d: 0.12, col: 'p', bp: { f, f2: f * 0.3, q: 1.4 }, g: 1 });
        const dr = S.drive(0.6, null, 0.5);
        S.tone({ t, d: 0.06, f: 900, f2: 200, w: 'square', lp: 3000, g: 0.35, dest: dr });
        S.noise({ t, d: 0.035, bp: { f: 3500, q: 1 }, g: 0.6 });
        S.tone({ t, d: 0.13, f: 180, f2: 60, w: 'triangle', g: 0.45 });
      } },
    kill_small: { d: 0.16, lvl: -20, vars: 4, max: 4, thr: 0.03, jit: 1.5, rev: 0.12, pri: 1,
      gen(S, t, r) {
        const f = r.range(220, 320);
        S.tone({ t, d: 0.06, f, f2: f * 4, ft: 0.03, g: 0.5 });
        S.noise({ t, d: 0.11, col: 'p', bp: { f: r.range(1700, 2400), f2: 450, q: 2 }, g: 0.6 });
        S.tone({ t, d: 0.08, f: 190, f2: 80, w: 'triangle', g: 0.25 });
      } },
    kill_big: { d: 0.5, lvl: -15, vars: 2, max: 3, thr: 0.05, jit: 1, rev: 0.2, pri: 2,
      gen(S, t, r) {
        S.noise({ t, d: 0.38, col: 'p', lp: { f: 3500, f2: 300 }, g: 1 });
        S.noise({ t, d: 0.25, bp: { f: 1600, f2: 400, q: 1.2 }, g: 0.7 });
        S.tone({ t, d: 0.3, f: 140, f2: 40, w: 'triangle', g: 0.55 });
        const f = r.range(1200, 1800);
        S.noise({ t: t + 0.05, d: 0.18, col: 'p', bp: { f, f2: f * 0.25, q: 3 }, g: 0.5 });
        S.tone({ t, d: 0.05, f: 260, f2: 900, g: 0.3 });
      } },
    kill_elite: { d: 0.6, lvl: -14, vars: 2, max: 2, thr: 0.06, rev: 0.25, pri: 2,
      gen(S, t, r) {
        SFX.kill_big.gen(S, t, r);
        const dr = S.drive(0.9, null, 0.3);
        S.tone({ t, d: 0.3, f: 160, f2: 60, w: 'square', g: 0.5, dest: dr });
        S.noise({ t, d: 0.25, bp: { f: 900, f2: 300, q: 1 }, g: 0.7, crk: 0.5, dest: dr });
      } },
    shot_wall: { d: 0.08, lvl: -32, vars: 3, max: 3, thr: 0.03, jit: 1.5, rev: 0.05, pri: 0,
      gen(S, t, r) {
        S.noise({ t, d: 0.06, bp: { f: r.range(3500, 5000), f2: 2000, q: 1.5 }, g: 0.35 });
        S.tone({ t, d: 0.04, f: r.range(1300, 1700), f2: 700, g: 0.12 });
      } },
    explosion: { d: 1.2, lvl: -11, vars: 2, max: 3, thr: 0.05, rev: 0.35, pri: 2, st: true,
      gen(S, t, r) {
        const dr = S.drive(0.5, null, 0.6);
        S.tone({ t, d: 0.9, f: 95, f2: 28, ft: 0.6, g: 0.75, dest: dr });
        S.noise({ t, d: 1.0, col: 'b', lp: { f: 1600, f2: 120, t: 0.9 }, g: 0.8 });
        S.noise({ t, d: 0.5, col: 'p', bp: { f: 1000, f2: 220, q: 0.9 }, g: 1 });
        S.noise({ t, d: 0.06, hp: 1500, g: 0.8 });
        for (let i = 0; i < 4; i++) {
          const f = r.range(800, 2200);
          S.noise({ t: t + r.range(0.08, 0.5), d: 0.12, col: 'p', bp: { f, f2: f * 0.3, q: 3 }, g: 0.3, pan: r.range(-0.8, 0.8) });
        }
      } },
    burn: { d: 0.45, lvl: -24, vars: 2, max: 3, thr: 0.08, rev: 0.08, pri: 0,
      gen(S, t) {
        S.noise({ t, d: 0.4, hp: 3000, a: 0.01, g: 0.4, crk: 0.4 });
        S.noise({ t, d: 0.35, col: 'p', bp: { f: 1600, q: 0.8 }, a: 0.03, g: 0.2 });
      } },
    poison: { d: 0.5, lvl: -24, vars: 2, max: 3, thr: 0.08, rev: 0.12, pri: 0,
      gen(S, t, r) {
        S.noise({ t, d: 0.4, bp: { f: 2600, q: 0.7 }, a: 0.05, g: 0.25 });
        for (let i = 0; i < 5; i++) {
          const f = r.range(350, 800);
          S.tone({ t: t + r.range(0, 0.35), d: 0.05, f, f2: f * 2.4, ft: 0.04, g: 0.25 });
        }
      } },
    chain: { d: 0.3, lvl: -20, vars: 3, max: 3, thr: 0.04, rev: 0.15, pri: 1,
      gen(S, t, r) {
        const fp = [];
        for (let i = 1; i <= 10; i++) fp.push([i * 0.022, r.range(120, 600)]);
        S.tone({ t, d: 0.24, f: r.range(200, 500), fp, fstep: true, w: 'sawtooth', fm: { r: 7.13, i: 6, i2: 1 },
          hp: 300, g: 0.3, crk: 0.6 });
        S.noise({ t, d: 0.22, bp: { f: 3200, q: 1 }, g: 0.35, crk: 0.5 });
      } },
    stun: { d: 0.7, lvl: -22, max: 2, thr: 0.1, rev: 0.3, pri: 1, st: true,
      gen(S, t) {
        S.tone({ t, d: 0.65, f: 950, f2: 700, w: 'triangle', vib: { r: 7, d: 160 }, a: 0.02, g: 0.25, pan: [-0.6, 0.6] });
        S.tone({ t: t + 0.03, d: 0.6, f: 1420, f2: 1050, vib: { r: 6.3, d: 160 }, a: 0.02, g: 0.15, pan: [0.6, -0.6] });
      } },

    // ------------------------------------------------------------ enemies ---
    enemy_shoot: { d: 0.1, lvl: -24, vars: 4, max: 4, thr: 0.03, jit: 1.5, rev: 0.08, pri: 0,
      gen(S, t, r) {
        S.noise({ t, d: 0.07, col: 'p', bp: { f: r.range(2200, 2900), f2: 900, q: 2 }, g: 0.6 });
        S.tone({ t, d: 0.06, f: r.range(550, 700), f2: 220, g: 0.35 });
      } },
    enemy_shoot_big: { d: 0.25, lvl: -20, vars: 2, max: 3, thr: 0.04, jit: 1, rev: 0.12, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.2, f: 300, f2: 85, fm: { r: 0.5, i: 1.5, i2: 0 }, g: 0.7 });
        S.noise({ t, d: 0.18, col: 'p', bp: { f: 1000, f2: 280, q: 2.2 }, g: 0.7 });
        S.tone({ t: t + 0.03, d: 0.06, f: 500, f2: 1200, g: 0.15 });
      } },
    windup: { d: 0.5, lvl: -15, max: 3, thr: 0.05, rev: 0.12, pri: 2,
      gen(S, t) {
        S.tone({ t, d: 0.46, f: 300, f2: 950, ft: 0.42, w: 'sawtooth', lp: { f: 900, f2: 3500, t: 0.42 },
          a: 0.06, h: 0.34, g: 0.35, am: { r: 12, r2: 26, d: 0.5 } });
        S.tone({ t, d: 0.46, f: 318, f2: 1007, ft: 0.42, w: 'square', lp: 2000, a: 0.06, h: 0.34, g: 0.16 });
        S.noise({ t, d: 0.46, bp: { f: 800, f2: 3000, q: 2, t: 0.42 }, a: 0.2, h: 0.2, g: 0.15 });
      } },
    charge: { d: 0.45, lvl: -18, vars: 2, max: 3, thr: 0.05, rev: 0.12, pri: 1,
      gen(S, t) {
        S.noise({ t, d: 0.4, col: 'p', bp: { f: 300, p: [[0.15, 1600], [0.4, 350]], q: 1.4 }, a: 0.1, g: 0.8 });
        S.tone({ t, d: 0.35, f: 120, f2: 55, w: 'sawtooth', lp: 450, a: 0.05, g: 0.35, vib: { r: 25, d: 60 } });
      } },
    spawn: { d: 0.6, lvl: -21, vars: 2, max: 3, thr: 0.05, rev: 0.2, pri: 1,
      gen(S, t, r) {
        S.noise({ t, d: 0.5, col: 'b', lp: { f: 300, f2: 1300 }, a: 0.25, g: 0.6 });
        for (let i = 0; i < 7; i++) {
          const f = r.range(180, 600);
          S.tone({ t: t + 0.04 + i * 0.055 + r.range(0, 0.03), d: 0.06, f, f2: f * 2.5, ft: 0.05, g: 0.3 });
        }
        S.noise({ t: t + 0.38, d: 0.14, col: 'p', bp: { f: 1500, f2: 500, q: 2.5 }, g: 0.45 });
      } },
    burrow: { d: 0.5, lvl: -20, vars: 2, max: 3, thr: 0.05, rev: 0.12, pri: 1,
      gen(S, t, r) {
        S.noise({ t, d: 0.42, col: 'p', bp: { f: 1500, f2: 200, q: 3 }, g: 0.7 });
        S.tone({ t, d: 0.38, f: 300, f2: 55, g: 0.6 });
        for (let i = 0; i < 6; i++) S.noise({ t: t + r.range(0, 0.35), d: 0.025, bp: { f: r.range(600, 1800), q: 4 }, g: 0.35 });
      } },
    emerge: { d: 0.45, lvl: -18, vars: 2, max: 3, thr: 0.05, rev: 0.15, pri: 1,
      gen(S, t, r) {
        S.noise({ t, d: 0.16, col: 'p', bp: { f: 200, f2: 2200, q: 2 }, a: 0.12, g: 0.6 });
        const tb = t + 0.14;
        S.noise({ t: tb, d: 0.25, col: 'p', lp: { f: 2600, f2: 350 }, g: 0.85 });
        S.tone({ t: tb, d: 0.25, f: 160, f2: 55, w: 'triangle', g: 0.5 });
        for (let i = 0; i < 3; i++) {
          const f = r.range(1200, 2500);
          S.noise({ t: tb + r.range(0.02, 0.15), d: 0.08, col: 'p', bp: { f, f2: f * 0.4, q: 3 }, g: 0.3 });
        }
      } },
    teleport: { d: 0.3, lvl: -21, vars: 3, max: 3, thr: 0.05, rev: 0.2, pri: 1,
      gen(S, t, r) {
        for (let i = 0; i < 6; i++) S.tone({ t: t + i * 0.022, d: 0.02, f: r.range(400, 3000), w: 'square', lp: 4000, a: 0.001, g: 0.14 });
        S.tone({ t, d: 0.2, f: 2400, f2: 180, fm: { r: 2.5, i: 3, i2: 0 }, g: 0.25 });
      } },
    spore: { d: 0.2, lvl: -24, vars: 3, max: 4, thr: 0.03, jit: 1.5, rev: 0.12, pri: 0,
      gen(S, t, r) {
        S.noise({ t, d: 0.16, col: 'p', lp: { f: 1500, f2: 500 }, a: 0.012, g: 0.6 });
        S.noise({ t, d: 0.1, bp: { f: r.range(500, 800), q: 2 }, g: 0.25 });
        S.tone({ t, d: 0.08, f: 210, f2: 120, g: 0.2 });
      } },
    split: { d: 0.5, lvl: -19, vars: 2, max: 3, thr: 0.05, rev: 0.15, pri: 1, st: true,
      gen(S, t) {
        S.noise({ t, d: 0.24, col: 'p', bp: { f: 600, f2: 2200, q: 3 }, a: 0.02, g: 0.6, crk: 0.7 });
        const tp = t + 0.22;
        S.tone({ t: tp, d: 0.07, f: 260, f2: 1000, ft: 0.04, g: 0.45, pan: -0.5 });
        S.tone({ t: tp + 0.025, d: 0.07, f: 300, f2: 1150, ft: 0.04, g: 0.45, pan: 0.5 });
        S.noise({ t: tp, d: 0.18, col: 'p', bp: { f: 1600, f2: 400, q: 2 }, g: 0.6 });
      } },
    beam_charge: { d: 1.1, lvl: -18, max: 2, thr: 0.1, rev: 0.2, pri: 2,
      gen(S, t) {
        const lp = { f: 300, f2: 3200, t: 0.95 };
        S.tone({ t, d: 1.05, f: 80, f2: 230, ft: 0.95, w: 'sawtooth', lp, a: 0.85, h: 0.12, g: 0.3 });
        S.tone({ t, d: 1.05, f: 80.6, f2: 232, ft: 0.95, w: 'sawtooth', det: 12, lp, a: 0.85, h: 0.12, g: 0.3 });
        S.tone({ t, d: 1.05, f: 160, f2: 460, ft: 0.95, a: 0.85, h: 0.12, g: 0.25, am: { r: 6, r2: 30, d: 0.6 } });
        S.noise({ t, d: 1.05, hp: { f: 1500, f2: 6000, t: 0.95 }, a: 0.9, h: 0.08, g: 0.15 });
      } },
    beam_fire: { d: 0.7, lvl: -14, max: 2, thr: 0.08, rev: 0.2, pri: 2,
      gen(S, t) {
        const bp = S.fx('bandpass', 1400, 0.7);
        const dr = S.drive(0.7, bp, 0.9);
        S.tone({ t, d: 0.6, f: 220, w: 'sawtooth', a: 0.01, h: 0.38, g: 0.4, vib: { r: 32, d: 40 }, dest: dr });
        S.tone({ t, d: 0.6, f: 110, w: 'square', a: 0.01, h: 0.38, g: 0.3, dest: dr });
        S.tone({ t, d: 0.6, f: 223, w: 'sawtooth', a: 0.01, h: 0.38, g: 0.3, dest: dr });
        S.noise({ t, d: 0.6, bp: { f: 3200, q: 0.8 }, a: 0.01, h: 0.35, g: 0.35, crk: 0.6 });
        S.tone({ t, d: 0.3, f: 170, f2: 45, g: 0.8 });
      } },
    lightning: { d: 1.0, lvl: -12, vars: 2, max: 2, thr: 0.06, rev: 0.35, pri: 2, st: true,
      gen(S, t, r) {
        S.noise({ t, d: 0.07, hp: 900, g: 1 });
        S.noise({ t, d: 0.45, bp: { f: 2500, f2: 1200, q: 0.8 }, g: 0.85, crk: 0.55, pan: [r.range(-0.5, 0.5), r.range(-0.5, 0.5)] });
        S.tone({ t, d: 0.25, f: 900, f2: 150, fm: { r: 11, i: 15, i2: 0 }, g: 0.25 });
        S.tone({ t: t + 0.03, d: 0.8, f: 62, f2: 30, g: 0.45 });
        S.noise({ t: t + 0.04, d: 0.85, col: 'b', lp: { f: 700, f2: 100 }, g: 0.7 });
      } },
    acid: { d: 0.7, lvl: -20, vars: 2, max: 3, thr: 0.05, rev: 0.15, pri: 1,
      gen(S, t, r) {
        S.noise({ t, d: 0.2, col: 'p', bp: { f: 2200, f2: 600, q: 1.5 }, g: 0.7 });
        S.noise({ t: t + 0.05, d: 0.6, hp: 4000, g: 0.25, crk: 0.5 });
        for (let i = 0; i < 6; i++) {
          const f = r.range(300, 900);
          S.tone({ t: t + 0.05 + r.range(0, 0.5), d: 0.05, f, f2: f * 2.2, ft: 0.04, g: 0.2 });
        }
      } },
    roar: { d: 1.7, lvl: -10, max: 1, thr: 0.5, rev: 0.4, pri: 3, st: true,
      gen(S, t) {
        const out = S.drive(0.75, null, 0.55);
        const f1 = S.fx('bandpass', 350, 3, out, { p: [[0.3, 750], [1.5, 380]] }, t);
        const f2 = S.fx('bandpass', 900, 5, out, { p: [[0.3, 1300], [1.5, 700]] }, t);
        const f3 = S.fx('lowpass', 400, 0.7, out);
        const src = S.bus(1, f1);
        src.connect(f2); src.connect(f3);
        const contour = [[0.25, 1.35], [0.6, 1.25], [1.55, 0.7]];
        [55, 82.4, 110, 56].forEach((f, i) => S.tone({ t, d: 1.6, f, fp: contour.map((q) => [q[0], f * q[1]]),
          w: 'sawtooth', a: 0.15, h: 0.9, g: 0.3, vib: { r: 5 + i * 1.3, d: 30 + i * 10 }, dest: src }));
        S.noise({ t, d: 1.6, col: 'b', a: 0.12, h: 0.9, g: 0.6, am: { r: 11, d: 0.5 }, dest: src });
        S.tone({ t, d: 1.5, f: 46, f2: 34, a: 0.1, h: 0.8, g: 0.4 });
      } },
    boss_phase: { d: 1.6, lvl: -12, max: 1, thr: 0.5, rev: 0.45, pri: 3, st: true,
      gen(S, t) {
        S.noise({ t, d: 0.3, col: 'p', bp: { f: 300, f2: 4000, q: 1 }, a: 0.28, g: 0.5 });
        const th = t + 0.28;
        S.tone({ t: th, d: 0.8, f: 100, f2: 30, g: 0.65 });
        const dr = S.drive(0.8, null, 0.35);
        [110, 116.5, 164.8, 233].forEach((f, i) => S.tone({ t: th, d: 1.1, f, w: 'sawtooth', det: (i - 1.5) * 8,
          lp: { f: 3500, f2: 300 }, g: 0.25, dest: dr }));
        S.tone({ t: th, d: 1.2, f: 659, fm: { r: 1.41, i: 3, i2: 0.2 }, g: 0.18, pan: -0.4 });
        S.tone({ t: th, d: 1.2, f: 932, fm: { r: 1.41, i: 3, i2: 0.2 }, g: 0.14, pan: 0.4 });
        S.noise({ t: th, d: 0.5, col: 'b', lp: { f: 2000, f2: 100 }, g: 0.8 });
      } },
    boss_death: { d: 3.0, lvl: -9, max: 1, thr: 1, rev: 0.45, pri: 3, st: true,
      gen(S, t, r) {
        const out = S.drive(0.6, null, 0.45);
        const fb = S.fx('bandpass', 600, 2.5, out, { p: [[2.4, 200]] }, t);
        [90, 135, 91].forEach((f, i) => S.tone({ t, d: 2.5, f, f2: f * 0.28, w: 'sawtooth', a: 0.05, h: 1.2, g: 0.3,
          vib: { r: 4 + i, d: 50 }, dest: fb }));
        [0, 0.55, 1.15].forEach((dt, i) => {
          const tt = t + dt;
          S.tone({ t: tt, d: 0.8, f: 100 - i * 10, f2: 28, g: 0.6 - i * 0.1 });
          S.noise({ t: tt, d: 0.7, col: 'b', lp: { f: 1800, f2: 100 }, g: 0.8 });
          S.noise({ t: tt, d: 0.3, col: 'p', bp: { f: 1500, f2: 300, q: 2 }, g: 0.5, pan: r.range(-0.7, 0.7) });
        });
        S.noise({ t, d: 2.9, col: 'b', lp: { f: 400, f2: 60 }, a: 0.3, h: 0.8, g: 0.6 });
        for (let i = 0; i < 6; i++) {
          const f = r.range(900, 2200);
          S.noise({ t: t + 0.2 + r.range(0, 1.8), d: 0.2, col: 'p', bp: { f, f2: f * 0.3, q: 3 }, g: 0.35, pan: r.range(-0.8, 0.8) });
        }
        S.tone({ t: t + 0.6, d: 2.3, f: 3520, a: 0.6, g: 0.035 }); // post-blast tinnitus
      } },

    // ----------------------------------------------------- pickups / world --
    pickup_iron: { d: 0.25, lvl: -24, vars: 4, max: 4, thr: 0.03, jit: 1, rev: 0.15, pri: 0,
      gen(S, t, r) {
        const f = r.range(1900, 2300);
        S.tone({ t, d: 0.2, f, fm: { r: 2.76, i: 1.8, i2: 0 }, g: 0.3 });
        S.tone({ t, d: 0.09, f: f * 1.5, g: 0.1 });
        S.tone({ t, d: 0.04, f: 600, f2: 1300, g: 0.18 });
      } },
    pickup_health: { d: 0.5, lvl: -20, max: 2, thr: 0.05, rev: 0.3, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.25, f: mtof(72), fm: { r: 1, i: 1.2, i2: 0.2 }, g: 0.3 });
        S.tone({ t: t + 0.08, d: 0.4, f: mtof(79), fm: { r: 1, i: 1.2, i2: 0.1 }, g: 0.3 });
        S.tone({ t: t + 0.08, d: 0.3, f: mtof(91), g: 0.06 });
        S.tone({ t, d: 0.12, f: 400, f2: 800, g: 0.15 });
      } },
    pickup_mutation: { d: 1.3, lvl: -16, max: 2, thr: 0.1, rev: 0.5, pri: 2, st: true,
      gen(S, t) {
        [81, 85, 88, 95, 93, 100].forEach((m, i) => S.tone({ t: t + i * 0.045, d: 0.9 - i * 0.05, f: mtof(m),
          fm: { r: 3.01, i: 1.2, i2: 0 }, g: 0.17, pan: -0.7 + i * 0.28 }));
        [57, 64, 69].forEach((m, i) => S.tone({ t, d: 1.2, f: mtof(m), w: 'sawtooth', det: i * 6 - 6,
          lp: { f: 600, f2: 2500, t: 0.4 }, a: 0.15, g: 0.1 }));
        S.noise({ t, d: 1.1, hp: 7000, a: 0.25, g: 0.1, am: { r: 9, d: 0.7 } });
      } },
    pickup_malignant: { d: 1.3, lvl: -16, max: 2, thr: 0.1, rev: 0.5, pri: 2, st: true,
      gen(S, t) {
        S.tone({ t, d: 0.4, f: 70, f2: 35, g: 0.5 });
        [60, 66, 71, 73].forEach((m, i) => S.tone({ t: t + i * 0.06, d: 1.1, f: mtof(m),
          fm: { r: 1.41, i: 2.5, i2: 0.3 }, g: 0.16, pan: -0.5 + i * 0.33 }));
        const dr = S.drive(0.5, null, 0.4);
        S.tone({ t, d: 1.1, f: mtof(36), w: 'sawtooth', lp: { f: 1600, f2: 200 }, g: 0.3, dest: dr });
        S.tone({ t, d: 1.1, f: mtof(37), w: 'sawtooth', lp: { f: 1600, f2: 200 }, g: 0.25, dest: dr });
        S.noise({ t, d: 0.6, col: 'p', bp: { f: 3000, f2: 400, q: 2 }, a: 0.2, g: 0.3 });
      } },
    buy: { d: 0.5, lvl: -18, max: 2, thr: 0.05, rev: 0.25, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.15, f: 1500, fm: { r: 2.76, i: 1.5, i2: 0 }, g: 0.25 });
        S.tone({ t: t + 0.07, d: 0.35, f: 2250, fm: { r: 2.76, i: 1.5, i2: 0 }, g: 0.25 });
        S.tone({ t, d: 0.14, f: 180, f2: 420, g: 0.35 });
        S.tone({ t: t + 0.07, d: 0.4, f: mtof(84), g: 0.1 });
      } },
    door_open: { d: 0.75, lvl: -18, max: 2, thr: 0.1, rev: 0.25, pri: 1,
      gen(S, t, r) {
        S.noise({ t, d: 0.55, col: 'p', bp: { f: 280, f2: 1300, q: 4 }, a: 0.15, g: 0.7 });
        S.tone({ t, d: 0.6, f: 55, f2: 95, w: 'sawtooth', lp: 320, a: 0.15, g: 0.4 });
        for (let i = 0; i < 6; i++) S.noise({ t: t + r.range(0.05, 0.5), d: 0.04, col: 'p', bp: { f: r.range(700, 2000), q: 6 }, g: 0.3 });
        S.tone({ t: t + 0.5, d: 0.08, f: 250, f2: 900, g: 0.3 });
      } },
    door_close: { d: 0.7, lvl: -14, max: 2, thr: 0.1, rev: 0.3, pri: 2,
      gen(S, t) {
        S.noise({ t, d: 0.2, col: 'p', bp: { f: 1500, f2: 280, q: 3 }, g: 0.7 });
        const th = t + 0.12;
        S.tone({ t: th, d: 0.45, f: 95, f2: 34, g: 0.6 });
        S.tone({ t: th, d: 0.2, f: 190, f2: 90, w: 'triangle', g: 0.35 });
        S.noise({ t: th, d: 0.3, col: 'p', lp: { f: 900, f2: 250 }, g: 0.8 });
        S.tone({ t: th, d: 0.5, f: mtof(38), w: 'sawtooth', lp: { f: 900, f2: 120 }, g: 0.15 });
      } },
    room_clear: { d: 1.1, lvl: -15, max: 1, thr: 0.3, rev: 0.4, pri: 2, st: true,
      gen(S, t) {
        [62, 66, 69, 74, 78].forEach((m, i) => S.tone({ t: t + i * 0.055, d: 0.7, f: mtof(m), w: 'triangle',
          fm: { r: 2, i: 1.1, i2: 0 }, lp: 5000, g: 0.2, pan: -0.5 + i * 0.25 }));
        S.tone({ t, d: 0.3, f: 120, f2: 50, g: 0.6 });
        S.noise({ t: t + 0.2, d: 0.8, hp: 6500, a: 0.15, g: 0.08 });
        [50, 57, 62].forEach((m) => S.tone({ t: t + 0.22, d: 0.85, f: mtof(m), w: 'sawtooth', lp: { f: 2000, f2: 400 }, a: 0.02, g: 0.09 }));
      } },
    floor_enter: { d: 1.8, lvl: -14, max: 1, thr: 0.5, rev: 0.5, pri: 2, st: true,
      gen(S, t) {
        S.noise({ t, d: 1.5, col: 'p', bp: { f: 3200, f2: 180, q: 1.3, t: 1.4 }, a: 0.3, g: 0.6, pan: [-0.6, 0.6] });
        S.tone({ t, d: 1.6, f: 220, f2: 52, w: 'sawtooth', det: -8, lp: { f: 1600, f2: 180 }, a: 0.2, g: 0.18 });
        S.tone({ t, d: 1.6, f: 221, f2: 53, w: 'sawtooth', det: 8, lp: { f: 1600, f2: 180 }, a: 0.2, g: 0.18 });
        S.tone({ t: t + 1.1, d: 0.6, f: 70, f2: 30, g: 0.45 });
      } },
    portal: { d: 1.4, lvl: -18, max: 2, thr: 0.3, rev: 0.5, pri: 1, st: true,
      gen(S, t) {
        S.noise({ t, d: 1.3, col: 'p', bp: { f: 400, p: [[0.3, 1800], [0.6, 600], [0.9, 2400], [1.25, 500]], q: 3 },
          a: 0.3, g: 0.6, pan: [-0.8, 0.8] });
        S.tone({ t, d: 1.3, f: 300, f2: 620, vib: { r: 5, d: 70 }, a: 0.3, g: 0.2, pan: [0.7, -0.7] });
        S.tone({ t, d: 1.3, f: 452, f2: 930, vib: { r: 6.5, d: 70 }, a: 0.35, g: 0.12 });
      } },
    heartbeat: { d: 0.6, lvl: -12, max: 2, thr: 0.15, rev: 0.12, pri: 2,
      gen(S, t) {
        const dr = S.drive(0.35, null, 0.8);
        S.tone({ t, d: 0.22, f: 68, f2: 38, a: 0.004, g: 0.8, dest: dr });
        S.tone({ t, d: 0.12, f: 140, f2: 70, w: 'triangle', a: 0.004, g: 0.3 });
        S.noise({ t, d: 0.09, col: 'p', bp: { f: 320, f2: 160, q: 1.2 }, g: 0.6 });
        S.tone({ t: t + 0.27, d: 0.18, f: 86, f2: 48, a: 0.004, g: 0.6, dest: dr });
        S.tone({ t: t + 0.27, d: 0.1, f: 175, f2: 90, w: 'triangle', a: 0.004, g: 0.22 });
        S.noise({ t: t + 0.27, d: 0.07, col: 'p', bp: { f: 420, f2: 200, q: 1.2 }, g: 0.45 });
      } },
    breath_in: { d: 1.6, lvl: -22, max: 1, thr: 0.5, rev: 0.25, pri: 1,
      gen(S, t) {
        S.noise({ t, d: 1.5, col: 'p', bp: { f: 500, f2: 1500, q: 0.9 }, a: 1.05, g: 0.6 });
        S.noise({ t, d: 1.5, hp: 4500, a: 1.1, g: 0.12 });
      } },
    breath_out: { d: 1.6, lvl: -22, max: 1, thr: 0.5, rev: 0.25, pri: 1,
      gen(S, t) {
        S.noise({ t, d: 1.5, col: 'p', bp: { f: 1400, f2: 420, q: 0.9 }, a: 0.18, g: 0.6, lin: true });
        S.noise({ t, d: 1.2, hp: 4000, a: 0.15, g: 0.1, lin: true });
      } },
    reroll: { d: 0.5, lvl: -20, max: 2, thr: 0.1, rev: 0.15, pri: 1,
      gen(S, t, r) {
        for (let i = 0; i < 7; i++) {
          const f = r.range(500, 1300);
          S.tone({ t: t + i * 0.05, d: 0.04, f, f2: f * 0.7, fm: { r: 1, i: 2, i2: 0 }, g: 0.25 });
        }
        S.noise({ t, d: 0.4, col: 'p', bp: { f: 900, f2: 2500, q: 1.5 }, a: 0.2, g: 0.25 });
      } },
    unlock: { d: 2.0, lvl: -12, max: 1, thr: 0.5, rev: 0.45, pri: 3, st: true,
      gen(S, t) {
        const brass = (tt, m, dd, g, pan) => [0, 7, -7].forEach((dc) => S.tone({ t: tt, d: dd, f: mtof(m), w: 'sawtooth', det: dc,
          lp: { f: 500, p: [[0.06, 3500], [dd, 900]] }, a: 0.03, h: dd * 0.4, g, pan }));
        brass(t, 67, 0.16, 0.08, -0.3);
        brass(t + 0.12, 72, 0.16, 0.08, 0.3);
        const tc = t + 0.26;
        [60, 64, 67, 72, 76].forEach((m, i) => brass(tc, m, 1.4, 0.06, -0.6 + i * 0.3));
        S.tone({ t: tc, d: 0.9, f: 90, f2: 40, g: 0.5 });
        S.noise({ t: tc, d: 1.4, hp: 5000, a: 0.01, g: 0.15 });
        [84, 88, 91, 96].forEach((m, i) => S.tone({ t: tc + 0.1 + i * 0.07, d: 0.9, f: mtof(m),
          fm: { r: 3.01, i: 1, i2: 0 }, g: 0.08, pan: 0.5 - i * 0.3 }));
      } },
    select: { d: 0.3, lvl: -20, max: 2, thr: 0.05, rev: 0.2, pri: 1,
      gen(S, t) {
        S.tone({ t, d: 0.12, f: 1000, f2: 1500, fm: { r: 2, i: 1, i2: 0 }, g: 0.3 });
        S.tone({ t: t + 0.05, d: 0.2, f: 1500, fm: { r: 2, i: 0.8, i2: 0 }, g: 0.2 });
        S.tone({ t, d: 0.06, f: 300, f2: 700, g: 0.2 });
      } },
  };
  // fill defaults
  for (const name in SFX) {
    const d = SFX[name];
    d.name = name;
    d.vars = d.vars || 1;
    d.max = d.max || 3;
    d.thr = d.thr != null ? d.thr : 0.025;
    d.rev = d.rev || 0;
    d.pri = d.pri != null ? d.pri : 1;
    d.lvl = d.lvl != null ? d.lvl : -20;
    d.jit = d.jit || 0;
  }
  const SFX_NAMES = Object.keys(SFX);

  // ===========================================================================
  // 4. Offline rendering + SFX cache
  // ===========================================================================
  function renderOffline(oc) {
    return new Promise((resolve, reject) => {
      let done = false;
      oc.oncomplete = (e) => { if (!done) { done = true; resolve(e.renderedBuffer); } };
      try {
        const p = oc.startRendering();
        if (p && p.then) p.then((b) => { if (!done) { done = true; resolve(b); } }, reject);
      } catch (err) { reject(err); }
    });
  }

  // Perceptual loudness weighting (K-weighting-like): 2nd-order high-pass at
  // 100 Hz (sub energy barely registers - nor do small speakers play it) plus a
  // +3 dB high shelf above ~2 kHz (ear sensitivity). Returns a stateful filter.
  function biquadCoefs(type, f, q, gainDb, sr) {
    const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else {
      const A = Math.pow(10, gainDb / 40), sq = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq);
      a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function weighting(sr) {
    const h = biquadCoefs('hp', 100, 0.7071, 0, sr), k = biquadCoefs('hs', 2000, 0.7071, 3, sr);
    return function (x, s) {
      const y = h[0] * x + h[1] * s[0] + h[2] * s[1] - h[3] * s[2] - h[4] * s[3];
      s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y;
      const z = k[0] * y + k[1] * s[4] + k[2] * s[5] - k[3] * s[6] - k[4] * s[7];
      s[5] = s[4]; s[4] = y; s[7] = s[6]; s[6] = z;
      return z;
    };
  }

  // loudness-normalise to def.lvl (max 20ms weighted RMS), cap peak at -1 dBFS, trim tail
  function finishSfx(oc, buf, def) {
    const nch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
    const ch = [];
    for (let i = 0; i < nch; i++) ch.push(buf.getChannelData(i));
    const hop = Math.max(1, Math.floor(sr * 0.01));
    const nb = Math.ceil(n / hop), blocks = new Float64Array(nb);
    const wf = weighting(sr);
    let peak = 0;
    for (let c = 0; c < nch; c++) {
      const x = ch[c];
      const st = [0, 0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const v = x[i], a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        const w = wf(v, st);
        blocks[(i / hop) | 0] += w * w;
      }
    }
    let maxMs = 0;
    for (let b = 0; b + 1 < nb; b++) {
      const ms = (blocks[b] + blocks[b + 1]) / (2 * hop * nch);
      if (ms > maxMs) maxMs = ms;
    }
    if (nb === 1) maxMs = blocks[0] / (n * nch);
    const rmsDb = 10 * Math.log10(maxMs + 1e-12);
    let gain = Math.pow(10, (def.lvl - rmsDb) / 20);
    gain = clamp(gain, 0.02, 30);
    if (peak * gain > 0.89) gain = 0.89 / peak;
    let last = 0;
    const thr = 0.0004 / gain;
    for (let i = n - 1; i >= 0 && !last; i--) {
      for (let c = 0; c < nch; c++) if (Math.abs(ch[c][i]) > thr) { last = i; break; }
    }
    const outLen = Math.max(32, Math.min(n, last + Math.floor(sr * 0.01)));
    const out = oc.createBuffer(nch, outLen, sr);
    const fade = Math.min(Math.floor(sr * 0.006), outLen >> 1);
    for (let c = 0; c < nch; c++) {
      const src = ch[c], dst = out.getChannelData(c);
      for (let i = 0; i < outLen; i++) dst[i] = src[i] * gain;
      for (let i = 0; i < fade; i++) dst[outLen - 1 - i] *= i / fade;
    }
    def.norm = gain;
    return out;
  }

  function renderSfxVariant(name, variant, sr) {
    const def = SFX[name];
    if (!def || !OAC) return Promise.reject(new Error('cannot render ' + name));
    const nch = def.st ? 2 : 1;
    const oc = new OAC(nch, Math.ceil((def.d + 0.06) * sr), sr);
    const rng = makeRng(hashStr(name) + variant * 7919 + 1);
    const S = new Synth(oc, oc.destination, 1, def.st, rng);
    def.gen(S, 0.002, rng);
    return renderOffline(oc).then((buf) => finishSfx(oc, buf, def));
  }

  // ===========================================================================
  // 5. Music theory + instruments
  // ===========================================================================
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    harm: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11], locrian: [0, 1, 3, 5, 6, 8, 10],
  };
  const QUAL = {
    m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10], dim: [0, 3, 6],
    s2: [0, 2, 7], s4: [0, 5, 7], m9: [0, 3, 7, 10, 14], a9: [0, 4, 7, 14], b9: [0, 4, 7, 10, 13],
    hd: [0, 3, 6, 10], M6: [0, 4, 7, 9],
  };
  // "0m 8M 3M 10M": semitone offset from key + quality. Offsets > 6 voice downward.
  const PROG_CACHE = Object.create(null);
  function parseProg(str, key) {
    const ck = key + '|' + str;
    if (PROG_CACHE[ck]) return PROG_CACHE[ck];
    const out = str.trim().split(/\s+/).map((tok) => {
      const mt = /^(-?\d+)([a-zA-Z0-9]+)$/.exec(tok);
      let off = mt ? +mt[1] : 0;
      const q = mt ? mt[2] : 'm';
      if (off > 6) off -= 12;
      const r = key + off;
      return { r, n: (QUAL[q] || QUAL.m).map((x) => r + x), q };
    });
    return (PROG_CACHE[ck] = out);
  }
  // chord-tone index arpeggio shapes
  const ARPS = [[0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 1, 3, 2, 4, 3, 1], [0, 1, 2, 0, 1, 2, 3, 2], [3, 2, 1, 0, 1, 2, 3, 4], [0, 2, 4, 2, 1, 3, 5, 3]];
  const ARPS16 = [
    [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3], [0, 2, 4, 6, 1, 3, 5, 7, 0, 2, 4, 6, 7, 5, 3, 1],
    [0, 0, 3, 0, 1, 1, 4, 1, 2, 2, 5, 2, 3, 1, 4, 6], [6, 5, 4, 3, 2, 1, 0, 1, 6, 5, 4, 3, 2, 3, 4, 5],
  ];
  // motif: per-step array of null | {i: chordToneIndex, l: lengthSteps}
  function makeMotif(r, steps, density, lo, hi, lens) {
    const m = new Array(steps).fill(null);
    lens = lens || [2, 2, 2, 4, 4, 6];
    let i = r.int(lo, hi), p = 0;
    while (p < steps) {
      const l = Math.min(r.pick(lens), steps - p);
      if (r.chance(density)) {
        m[p] = { i, l };
        i = clamp(i + r.pick([-2, -1, -1, 0, 1, 1, 2]), lo, hi);
      }
      p += l;
    }
    if (!m[0]) m[0] = { i: lo + 1, l: 2 };
    return m;
  }
  function mutateMotif(r, m, lo, hi) {
    const out = m.map((x) => (x ? { i: x.i, l: x.l } : null));
    for (let k = 0; k < 2; k++) {
      const idx = r.int(0, out.length - 1);
      if (out[idx]) out[idx].i = clamp(out[idx].i + r.pick([-1, 1, 2, -2]), lo, hi);
    }
    return out;
  }

  const syn = (c, dest) => new Synth(c, dest, 1, true, RND);

  // Polyphonic sustained voice: unison oscillators -> (formants) -> lowpass -> AHR
  function poly(c, dest, t, notes, d, v, o) {
    o = o || {};
    const a = o.a != null ? o.a : 0.5, rel = o.r != null ? o.r : 0.8;
    const hold = Math.max(0.01, d - a), end = t + a + hold + rel;
    const uni = o.uni || 2, det = o.det != null ? o.det : 8;
    const g = c.createGain();
    const peak = v / Math.sqrt(notes.length * uni);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.linearRampToValueAtTime(0, end);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q || 0;
    const f = o.lp || 1200;
    if (o.lpPts) points(lp.frequency, t, o.lp0 || f, o.lpPts);
    else { lp.frequency.setValueAtTime(o.lp0 || f * 0.6, t); lp.frequency.linearRampToValueAtTime(f, t + a + 0.1); }
    lp.connect(g); g.connect(dest);
    let input = lp;
    if (o.form) {
      input = c.createGain();
      o.form.forEach((fm) => {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = fm[1];
        const fg = c.createGain(); fg.gain.value = fm[2];
        input.connect(bp); bp.connect(fg); fg.connect(lp);
      });
    }
    let lg = null;
    if (o.vib) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vib.r;
      lg = c.createGain(); lg.gain.value = o.vib.d;
      lfo.connect(lg); lfo.start(t); lfo.stop(end + 0.05);
    }
    let last = null;
    for (let n = 0; n < notes.length; n++) {
      for (let j = 0; j < uni; j++) {
        const os = c.createOscillator();
        os.type = o.w || 'sawtooth';
        os.frequency.value = mtof(notes[n]);
        const dc = uni > 1 ? (j / (uni - 1) * 2 - 1) * det : 0;
        os.detune.setValueAtTime(dc, t);
        if (o.droop) os.detune.linearRampToValueAtTime(dc + o.droop, end);
        if (lg) lg.connect(os.detune);
        os.connect(input);
        os.start(t); os.stop(end + 0.05);
        last = os;
      }
    }
    if (last) last.onended = () => safeDisconnect(g);
  }

  const PADS = {
    saw: { w: 'sawtooth', det: 10, lp: 900, a: 0.5, r: 1.0, vib: { r: 0.3, d: 6 } },
    choir: { w: 'sawtooth', det: 12, lp: 3200, a: 0.9, r: 1.4, vib: { r: 4.6, d: 9 }, form: [[360, 6, 2.2], [880, 8, 1.2]] },
    choirA: { w: 'sawtooth', det: 12, lp: 3500, a: 0.7, r: 1.4, vib: { r: 4.8, d: 10 }, form: [[700, 6, 2.0], [1150, 8, 1.2], [2600, 10, 0.5]] },
    air: { w: 'triangle', det: 6, lp: 2600, a: 1.2, r: 1.6, vib: { r: 4, d: 5 } },
    sick: { w: 'sawtooth', det: 22, lp: 650, a: 0.8, r: 1.0, vib: { r: 0.35, d: 18 } },
    square: { w: 'square', det: 12, lp: 1600, a: 0.3, r: 0.6 },
    decay: { w: 'sawtooth', det: 25, lp: 700, a: 1.0, r: 1.5, droop: -45 },
    warm: { w: 'triangle', det: 8, lp: 1800, a: 0.6, r: 1.2 },
    dark: { w: 'sawtooth', det: 6, lp: 600, a: 1.0, r: 1.5 },
    brass: { w: 'sawtooth', det: 9, lp: 500, lpPts: [[0.06, 3400], [0.5, 1300]], a: 0.03, r: 0.25 },
  };

  const INS = {
    pad(c, dest, t, notes, d, v, preset, extra) {
      poly(c, dest, t, notes, d, v, extra ? Object.assign({}, PADS[preset], extra) : PADS[preset]);
    },
    bass(c, dest, t, m, d, v, o) {
      o = o || {};
      const S = syn(c, dest), f = mtof(m), lp = o.lp || 200, env = o.env || 1200;
      const h = Math.max(0, d - 0.01);
      const fp = o.bend ? [[d, mtof(m + o.bend)]] : null;
      S.tone({ t, d: d + 0.06, f, fp, w: o.w || 'sawtooth', lp: { f: lp + env, f2: lp, t: o.fd || 0.14, q: o.q || 4 },
        a: 0.004, h, g: v, det: o.det || 0 });
      if (o.sub) S.tone({ t, d: d + 0.06, f: f / 2, fp: fp ? [[d, fp[0][1] / 2]] : null, a: 0.004, h, g: v * o.sub });
    },
    pluck(c, dest, t, m, v, o) {
      o = o || {};
      const S = syn(c, dest), dec = o.dec || 0.35;
      S.tone({ t, d: dec, f: mtof(m), w: o.w || 'triangle', lp: { f: o.lp || 3000, f2: 250, t: dec }, g: v, det: o.det || 0, pan: o.pan });
      if (o.oct) S.tone({ t, d: dec * 0.6, f: mtof(m + 12), g: v * o.oct, pan: o.pan });
    },
    bell(c, dest, t, m, v, o) {
      o = o || {};
      const S = syn(c, dest), dec = o.dec || 1.2;
      S.tone({ t, d: dec, f: mtof(m), f2: o.droop ? mtof(m + o.droop) : null, fm: { r: o.ratio || 3.5, i: o.i || 2, i2: 0, t: dec * 0.5 },
        g: v, det: o.det || 0, pan: o.pan });
    },
    lead(c, dest, t, m, d, v, o) {
      o = o || {};
      const S = syn(c, dest), f = mtof(m);
      const a = o.a || 0.02, det = o.det != null ? o.det : 7;
      const base = { t, d: d + (o.r || 0.15), f: o.from != null ? mtof(o.from) : f, fp: o.from != null ? [[o.gl || 0.07, f]] : null,
        w: o.w || 'sawtooth', lp: { f: o.lp || 2200, q: o.q || 1 }, a, h: Math.max(0, d - a), g: v * 0.6,
        vib: { r: o.vr || 5.5, d: o.vd || 12 }, pan: o.pan };
      base.det = -det; S.tone(base);
      base.det = det; S.tone(base);
      if (o.breath) S.noise({ t, d: d + 0.1, bp: { f: f * 2, q: 2 }, a: 0.03, h: d * 0.7, g: v * o.breath });
    },
    ep(c, dest, t, m, d, v, pan) {
      const S = syn(c, dest), f = mtof(m);
      S.tone({ t, d: d + 0.8, f, fm: { r: 1, i: 1.5, i2: 0.12, t: 0.7 }, a: 0.004, g: v, pan });
      S.tone({ t, d: 0.3, f: f * 4, a: 0.002, g: v * 0.07, pan });
    },
    // ---- percussion ----
    kick(c, dest, t, v, o) {
      o = o || {};
      const S = syn(c, dest);
      S.tone({ t, d: o.d || 0.42, f: o.f0 || 150, f2: o.f1 || 44, ft: o.pd || 0.09, a: 0.002, g: v });
      S.noise({ t, d: 0.012, hp: 1800, g: v * (o.click != null ? o.click : 0.25) });
    },
    lub(c, dest, t, v, o) {
      o = o || {};
      const S = syn(c, dest), f = o.f || 64;
      S.tone({ t, d: o.d || 0.3, f: f * 1.15, f2: f * 0.58, ft: 0.12, a: 0.003, g: v });
      S.tone({ t, d: 0.12, f: f * 2.3, f2: f * 1.2, w: 'triangle', a: 0.003, g: v * 0.22 });
      S.noise({ t, d: 0.11, col: 'b', lp: { f: 420, f2: 140 }, a: 0.004, g: v * 0.8 });
      if (o.click !== 0) S.noise({ t, d: 0.02, col: 'p', bp: { f: 900, q: 1 }, g: v * 0.12 });
    },
    dub(c, dest, t, v, o) {
      o = o || {};
      const S = syn(c, dest), f = o.f || 80;
      S.tone({ t, d: 0.2, f: f * 1.15, f2: f * 0.6, ft: 0.08, a: 0.003, g: v });
      S.tone({ t, d: 0.09, f: f * 2.3, f2: f * 1.2, w: 'triangle', a: 0.003, g: v * 0.2 });
      S.noise({ t, d: 0.07, col: 'b', lp: { f: 520, f2: 180 }, a: 0.003, g: v * 0.6 });
    },
    snare(c, dest, t, v, o) {
      o = o || {};
      const S = syn(c, dest), f = o.f || 200;
      S.noise({ t, d: o.d || 0.18, hp: 500, bp: { f: o.bp || 1900, q: 0.7 }, a: 0.001, g: v });
      S.tone({ t, d: 0.09, f, f2: f * 0.7, w: 'triangle', g: v * 0.55 });
    },
    clap(c, dest, t, v) {
      const S = syn(c, dest);
      S.noise({ t, d: 0.012, bp: { f: 1300, q: 1.1 }, a: 0.001, g: v * 0.7 });
      S.noise({ t: t + 0.011, d: 0.012, bp: { f: 1300, q: 1.1 }, a: 0.001, g: v * 0.7 });
      S.noise({ t: t + 0.022, d: 0.16, bp: { f: 1250, q: 1.1 }, a: 0.001, g: v * 0.9 });
    },
    hat(c, dest, t, v, o) {
      syn(c, dest).noise({ t, d: (o && o.d) || 0.04, hp: (o && o.hp) || 7500, a: 0.001, g: v, pan: o && o.pan });
    },
    shaker(c, dest, t, v) {
      syn(c, dest).noise({ t, d: 0.07, hp: 3000, bp: { f: 6500, q: 1.2 }, a: 0.012, g: v });
    },
    tom(c, dest, t, f, v) {
      const S = syn(c, dest);
      S.tone({ t, d: 0.35, f, f2: f * 0.55, a: 0.002, g: v });
      S.noise({ t, d: 0.05, col: 'p', lp: 2000, g: v * 0.3 });
    },
    crash(c, dest, t, v) {
      const S = syn(c, dest);
      S.noise({ t, d: 1.8, hp: 4000, a: 0.002, g: v });
      S.noise({ t, d: 0.9, bp: { f: 7000, q: 1 }, g: v * 0.5 });
    },
    metal(c, dest, t, f, v) {
      const S = syn(c, dest);
      S.tone({ t, d: 0.3, f, fm: { r: 1.41, i: 6, i2: 0 }, g: v });
      S.noise({ t, d: 0.04, bp: { f: 2500, q: 2 }, g: v * 0.6 });
    },
    // ---- organic textures ----
    bubble(c, dest, t, f, v, pan) { syn(c, dest).tone({ t, d: 0.07, f, f2: f * 2.4, ft: 0.05, a: 0.004, g: v, pan }); },
    zap(c, dest, t, f, v, pan) { syn(c, dest).tone({ t, d: 0.13, f, f2: f * 0.2, fm: { r: 3.3, i: 6, i2: 0 }, g: v, pan }); },
    crackle(c, dest, t, v, r) {
      syn(c, dest).noise({ t, d: 0.004 + r() * 0.01, bp: { f: 1500 + r() * 6000, q: 3 }, a: 0.0005, g: v, pan: r() * 1.6 - 0.8 });
    },
    drip(c, dest, t, f, v) {
      const S = syn(c, dest);
      S.tone({ t, d: 0.06, f, f2: f * 1.9, ft: 0.03, g: v });
      S.tone({ t: t + 0.18, d: 0.06, f, f2: f * 1.9, ft: 0.03, g: v * 0.3 });
    },
    groan(c, dest, t, m, d, v) {
      const S = syn(c, dest);
      const fb = S.fx('bandpass', 260, 5, null, { p: [[d * 0.4, 560], [d, 300]] }, t);
      S.tone({ t, d, f: mtof(m), f2: mtof(m - 1.5), w: 'sawtooth', a: d * 0.3, h: d * 0.3, g: v, vib: { r: 3.3, d: 30 }, dest: fb });
      S.tone({ t, d, f: mtof(m) * 1.01, f2: mtof(m - 2), w: 'sawtooth', a: d * 0.3, h: d * 0.3, g: v * 0.8, dest: fb });
    },
    whoosh(c, dest, t, d, v, f1, f2) {
      syn(c, dest).noise({ t, d, col: 'p', bp: { f: f1, p: [[d * 0.5, f2], [d, f1]], q: 1.4 }, a: d * 0.45, g: v });
    },
  };

  // instruments are no-ops when their layer is silent (dest === null)
  Object.keys(INS).forEach((k) => {
    const f = INS[k];
    INS[k] = function (c, dest) { if (dest) f.apply(null, arguments); };
  });

  // Persistent breathing wind (lungs): one looping noise source, automated.
  function startWind(P, layer) {
    const c = P.c, L = P.tr.layers[layer];
    if (!L) return;
    const src = c.createBufferSource();
    src.buffer = noiseFor(c).p; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.value = 350;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
    const g = c.createGain(); g.gain.value = 0.0001;
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(L.in);
    src.start(P.t, RND() * 1.5);
    P.tr.keep.push(src);
    P.st.wind = { bp, g };
  }
  function breathe(P, inBeats, outBeats, lvl) {
    const w = P.st.wind;
    if (!w) return;
    const t = P.t, bd = P.bd;
    w.g.gain.setTargetAtTime(lvl, t, bd * inBeats * 0.33);
    w.bp.frequency.setTargetAtTime(1500, t, bd * inBeats * 0.36);
    w.g.gain.setTargetAtTime(lvl * 0.12, t + bd * inBeats, bd * outBeats * 0.3);
    w.bp.frequency.setTargetAtTime(330, t + bd * inBeats, bd * outBeats * 0.33);
  }

  // ===========================================================================
  // 6. Track definitions
  //    layers: name -> {rev (reverb send), drive + post (saturation), lvl (mix
  //    trim), curve ([[intensity, gain], ...] - how the layer follows setIntensity)}
  //    bar(P) runs on each bar start, step(P) on every step, vary(P) every 4 bars.
  //    All notes land exactly on the 16th grid (swing only delays odd 16ths).
  // ===========================================================================
  const LAYER_CURVES = {
    amb: [[0, 1], [1, 0.8]],
    beat: [[0, 0.55], [1, 1]],
    bass: [[0.1, 0], [0.5, 1]],
    drums: [[0.3, 0], [0.75, 1]],
    stab: [[0.4, 0], [0.8, 1]],
    lead: [[0.55, 0], [0.95, 1]],
    fixed: [[0, 1], [1, 1]],
  };
  const VEINS_BASS = ['x.xx.xx.x.xx.xo.', 'x..x..x.x..x..xo', 'xxoxxxoxxxoxxxo5', 'x.x.x.x.x.x.o.x.'];
  const GUT_BASS = ['x..x.b.', 'x.ox..b', 'xx..x.o'];
  const BOSS_BASS = [
    [0, 0, 12, 0, 1, 0, 7, 0, 0, 0, 12, 0, 1, 0, 10, 12],
    [0, null, 0, 0, 12, null, 0, 1, 0, null, 0, 0, 7, null, 6, 1],
    [0, 0, 0, 12, 0, 0, 1, 0, 0, 0, 0, 12, 0, 7, 1, 0],
  ];
  // title lullaby (3/4): per bar [beat, midi, beats]
  const LULLABY = [
    [[0, 76, 1], [1, 81, 1], [2, 80, 1]], [[0, 76, 2], [2, 72, 1]], [[0, 74, 1], [1, 77, 1], [2, 76, 1]], [[0, 71, 3]],
    [[0, 76, 1], [1, 81, 1], [2, 83, 1]], [[0, 84, 1.5], [1.5, 83, 0.5], [2, 81, 1]], [[0, 80, 1], [1, 77, 1], [2, 74, 1]], [[0, 69, 3]],
  ];
  // final boss theme: [step, scaleDegree, lengthSteps] over 2 bars
  const FINAL_THEME = [
    [[0, 14, 6], [6, 11, 2], [8, 12, 4], [12, 11, 2], [14, 10, 2], [16, 9, 4], [20, 10, 2], [22, 8, 2], [24, 7, 8]],
    [[0, 14, 4], [4, 15, 4], [8, 16, 6], [14, 15, 2], [16, 14, 4], [20, 12, 2], [22, 11, 2], [24, 11, 8]],
  ];

  const TRACKS = {
    // ------------------------------------------------------------- TITLE ----
    title: {
      bpm: 66, bpb: 3, spb: 2, key: 57, scale: 'harm', fixed: true, gain: 1,
      progs: ['0m 8M 5m 7M 0m 8M 7b9 0m'],
      layers: { amb: { rev: 0.6, lvl: 0.87 }, bass: { rev: 0.3, lvl: 0.32 }, lead: { rev: 0.55, lvl: 1.6 } },
      bar(P) {
        const A = P.L('amb'), c = P.c, t = P.t;
        INS.pad(c, A, t, P.chord.n.slice(0, 3).map((m) => m + 12), P.barDur, 0.2, 'dark');
        INS.bass(c, P.L('bass'), t, P.chord.r - 12, P.barDur * 0.9, 0.22, { w: 'sine', lp: 300, env: 100, q: 0, sub: 0.4 });
        if (mod(P.lbar, 4) === 3) INS.whoosh(c, A, t + P.bd, P.bd * 2, 0.06, 250, 1200);
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, A = P.L('amb'), Ld = P.L('lead');
        if (p === 0) INS.lub(c, A, t, 0.22, { f: 52, click: 0 });
        if (p === 1) INS.dub(c, A, t, 0.13, { f: 62 });
        const lb = mod(P.lbar, 16), mel = LULLABY[lb % 8];
        for (let k = 0; k < mel.length; k++) {
          const [b, m, l] = mel[k];
          if (b * 2 !== p) continue;
          const worn = P.r.range(-9, 9);
          INS.bell(c, Ld, t, m, 0.2, { ratio: 4, i: 1.1, dec: 1.4 + l * 0.6, det: worn, pan: -0.15 });
          INS.bell(c, Ld, t + P.bd * 0.75, m, 0.05, { ratio: 4, i: 0.8, dec: 1.2, det: worn, pan: 0.4 });
          if (lb >= 8 && k === 0) {
            // second pass: a soft counter-voice on the nearest chord tone below
            let cm = 0;
            for (const x of P.chord.n) for (const o of [0, 12, 24]) if (x + o < m - 2 && x + o > cm) cm = x + o;
            if (cm) INS.bell(c, Ld, t, cm, 0.08, { ratio: 3, i: 0.7, dec: 2 });
          }
        }
      },
    },
    // -------------------------------------------------------------- SHOP ----
    shop: {
      bpm: 80, key: 50, scale: 'dorian', swing: 0.17, fixed: true, gain: 1,
      progs: ['0m7 5d7 10M7 7m7', '0m7 5d7 3M7 10M7'],
      layers: { amb: { rev: 0.3, lvl: 2.6 }, bass: { rev: 0.08, lvl: 0.45 }, drums: { rev: 0.12, lvl: 1.2 }, lead: { rev: 0.4, lvl: 2.4 } },
      vary(P) { P.st.mel = P.r.chance(0.6) ? makeMotif(P.r, 32, 0.5, 2, 6, [2, 4, 4, 6]) : null; },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        if (p === 0 || p === 6 || ((P.v4 & 1) && p === 11)) {
          const v = p === 0 ? 0.09 : 0.065;
          P.chord.n.forEach((m, i) => INS.ep(c, A, t + i * 0.009, m + 12, P.sd * (p === 0 ? 5 : 3), v, -0.3 + i * 0.2));
        }
        if (p === 0 || p === 8 || p === 14) {
          let m = P.chord.r - 12;
          if (p === 8) m += 7;
          if (p === 14) m = P.next().r - 12 + (r.chance(0.5) ? -1 : 2);
          INS.bass(c, B, t, m, P.sd * (p === 14 ? 1.5 : 3), 0.3, { w: 'triangle', lp: 500, env: 400, q: 1, sub: 0.5 });
        }
        if ((p & 1) === 0) INS.shaker(c, D, t, p % 4 === 2 ? 0.09 : 0.05);
        if (p === 0 || p === 8) INS.kick(c, D, t, 0.24, { f0: 100, f1: 45, click: 0.05 });
        if (p === 12) INS.snare(c, D, t, 0.12, { bp: 2600, d: 0.05, f: 330 });
        if (P.st.mel) {
          const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
          if (note) INS.bell(c, Ld, t, P.ct(note.i, 1), 0.12, { ratio: 4, i: 0.6, dec: 1.0 + note.l * 0.1 });
        }
        if (r.chance(0.02)) INS.bubble(c, A, t, r.range(500, 900), 0.05, r.range(-0.6, 0.6));
      },
    },
    // ------------------------------------------------------------- VEINS ----
    veins: {
      bpm: 96, key: 50, scale: 'minor', gain: 0.9,
      progs: ['0m 8M 3M 10M', '0m 5m 8M 7M', '0m7 8M7 3M 10s4'],
      layers: { amb: { rev: 0.5, lvl: 0.74 }, bass: { rev: 0.06, lvl: 0.54 }, drums: { rev: 0.12, lvl: 0.78 }, lead: { rev: 0.4, lvl: 2.2 } },
      init(P) { P.st.arp = ARPS[0]; P.st.bass = 0; },
      vary(P) {
        P.st.arp = P.r.pick(ARPS);
        P.st.bass = P.r.int(0, VEINS_BASS.length - 1);
        P.st.mel = P.r.chance(0.5) ? makeMotif(P.r, 32, 0.6, 1, 5, [4, 4, 6, 8]) : null;
      },
      bar(P) {
        const A = P.L('amb');
        if (!A) return;
        INS.pad(P.c, A, P.t, P.chord.n.map((m) => m + 12), P.barDur, 0.22, 'saw');
        INS.whoosh(P.c, A, P.t, P.barDur, 0.07, 220, 750);
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        if (A && (p === 0 || p === 8)) INS.lub(c, A, t, p === 0 ? 0.3 : 0.2, { f: 52, click: 0 });
        if (A && r.chance(0.04)) INS.drip(c, A, t, r.range(900, 1700), 0.05);
        if (B) {
          const ch = VEINS_BASS[P.st.bass][p];
          if (ch !== '.') {
            const m = P.chord.r - 12 + (ch === 'o' ? 12 : ch === '5' ? 7 : 0);
            INS.bass(c, B, t, m, P.sd * 0.8, p % 4 === 0 ? 0.4 : 0.3, { lp: 160, env: 700 + 900 * P.I, q: 6, sub: p % 4 === 0 ? 0.45 : 0 });
          }
        }
        if (D) {
          if (p === 0 || p === 8 || ((P.v4 & 1) && p === 10)) INS.kick(c, D, t, 0.55);
          if (p === 4 || p === 12) INS.clap(c, D, t, 0.38);
          if ((p & 1) === 0) INS.hat(c, D, t, p % 4 === 2 ? 0.22 : 0.11);
          else if (P.I > 0.75 && r.chance(0.4)) INS.hat(c, D, t, 0.05);
          if (p === 14 && mod(P.lbar, 4) === 3) INS.snare(c, D, t, 0.25);
        }
        if (Ld) {
          if ((p & 1) === 0) {
            const m = P.ct(P.st.arp[(p >> 1) % P.st.arp.length], 2);
            INS.pluck(c, Ld, t, m, 0.15, { w: 'square', lp: 2000, dec: 0.28, pan: -0.2 });
            INS.pluck(c, Ld, t + 3 * P.sd, m, 0.055, { w: 'square', lp: 1500, dec: 0.25, pan: 0.35 });
          }
          if (P.st.mel) {
            const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
            if (note) INS.lead(c, Ld, t, P.ct(note.i, 1), note.l * P.sd, 0.12, { lp: 1800, det: 9, a: 0.04 });
          }
        }
      },
    },
    // ------------------------------------------------------------- HEART ----
    heart: {
      bpm: 76, key: 48, scale: 'minor', bpc: 2, gain: 0.85,
      progs: ['0m 8M 5m 7M', '0m 1M 8M 7M', '0m 5m 3M 7d7'],
      layers: { beat: { rev: 0.15 }, amb: { rev: 0.55, lvl: 0.5 }, bass: { rev: 0.05, lvl: 0.4 }, drums: { rev: 0.15, lvl: 3.5 }, lead: { rev: 0.45, lvl: 2.8 } },
      init(P) { P.st.arp = ARPS[1]; },
      vary(P) {
        P.st.arp = P.r.pick(ARPS);
        P.st.mel = mod(P.lbar, 8) === 4 ? makeMotif(P.r, 32, 0.7, 2, 6, [4, 8, 8, 12]) : null;
      },
      bar(P) {
        const A = P.L('amb');
        if (A && mod(P.lbar, 2) === 0) {
          INS.pad(P.c, A, P.t, P.chord.n.map((m) => m + 12), P.barDur * 2, 0.3, 'choir');
          INS.pad(P.c, A, P.t, [P.chord.r - 12], P.barDur * 2, 0.12, 'dark', { uni: 1, w: 'sine', lp: 400 });
        }
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, H = P.L('beat'), B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        // the heartbeat IS the kick: lub exactly on every beat, dub one 16th later
        if (H) {
          if (p % 4 === 0) INS.lub(c, H, t, p === 0 ? 0.85 : 0.75, { f: 60 });
          else if (p % 4 === 1) INS.dub(c, H, t, 0.55);
        }
        if (B) {
          if (p % 4 === 0) INS.bass(c, B, t, P.chord.r - 12, P.sd * (p === 0 ? 3 : 1.6), 0.34, { lp: 120, env: 500, q: 3, sub: 0.7 });
          if ((P.v4 & 1) && (p === 6 || p === 14)) INS.bass(c, B, t, P.chord.r - 5, P.sd * 1.2, 0.22, { lp: 150, env: 600, q: 3 });
        }
        if (D) {
          if ((p & 1) === 0) INS.shaker(c, D, t, p % 4 === 2 ? 0.13 : 0.06);
          if (p === 4 || p === 12) INS.snare(c, D, t, 0.11, { bp: 1400, d: 0.22 });
          if (mod(P.lbar, 4) === 3 && p >= 12) INS.tom(c, D, t, [196, 165, 130, 110][p - 12], 0.11);
          if (mod(P.lbar, 8) === 0 && p === 0) INS.crash(c, D, t, 0.04);
          if (P.I > 0.85 && (p & 1)) INS.hat(c, D, t, 0.04);
        }
        if (Ld) {
          if ((p & 1) === 0) INS.bell(c, Ld, t, P.ct(P.st.arp[(p >> 1) % 8], 2), 0.11, { ratio: 3.5, i: 1.4, dec: 0.7, pan: (p % 4 ? 0.3 : -0.3) });
          if (P.st.mel) {
            const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
            if (note) INS.lead(c, Ld, t, P.ct(note.i, 1), note.l * P.sd, 0.14, { lp: 1600, a: 0.12, r: 0.4, vd: 16, det: 10 });
          }
        }
      },
    },
    // ------------------------------------------------------------- LUNGS ----
    lungs: {
      bpm: 84, key: 52, scale: 'dorian', gain: 1,
      progs: ['0m9 8M7 3M 10a9', '0m7 5M 8M7 7m7'],
      layers: { amb: { rev: 0.6, lvl: 0.82 }, bass: { rev: 0.15, lvl: 0.4 }, drums: { rev: 0.25, lvl: 1.3 }, lead: { rev: 0.55 } },
      start(P) { startWind(P, 'amb'); },
      vary(P) { P.st.mel = P.st.mel && P.r.chance(0.5) ? mutateMotif(P.r, P.st.mel, 0, 6) : makeMotif(P.r, 32, 0.55, 1, 6, [2, 4, 4, 6]); },
      bar(P) {
        // 12-beat breath cycle (~8.6s): inhale 5 beats, exhale 7
        if (mod(P.lbar, 3) === 0) breathe(P, 5, 7, 0.4);
        const A = P.L('amb');
        if (A) INS.pad(P.c, A, P.t, P.chord.n.map((m) => m + 12), P.barDur, 0.17, 'air');
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        if (A && (p & 1) === 0 && r.chance(0.08 + 0.18 * P.I)) {
          INS.pluck(c, A, t, P.sc(r.int(9, 16), 1), 0.09, { w: 'triangle', lp: 4200, dec: 0.9, oct: 0.3, pan: r.range(-0.7, 0.7) });
        }
        if (B) {
          if (p === 0) INS.bass(c, B, t, P.chord.r - 12, P.barDur * 0.45, 0.3, { w: 'triangle', lp: 420, env: 300, q: 1, sub: 0.6 });
          if (p === 8) INS.bass(c, B, t, P.chord.r - 12 + ((P.v4 & 1) ? 7 : 12), P.barDur * 0.4, 0.24, { w: 'triangle', lp: 420, env: 300, q: 1, sub: 0.4 });
        }
        if (D) {
          if (p === 0 || p === 6) INS.kick(c, D, t, 0.45, { f0: 110, f1: 45, d: 0.35, click: 0.05 });
          if (p === 8) INS.snare(c, D, t, 0.17, { bp: 1200, d: 0.35, f: 180 });
          if ((p & 1) === 0) INS.shaker(c, D, t, p % 4 === 2 ? 0.1 : 0.05);
          else if (P.I > 0.8) INS.shaker(c, D, t, 0.03);
        }
        if (Ld && P.st.mel) {
          const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
          if (note) INS.lead(c, Ld, t, P.ct(note.i, 1), note.l * P.sd, 0.15, { w: 'sine', det: 3, lp: 3000, a: 0.06, vd: 18, breath: 0.35 });
        }
      },
    },
    // --------------------------------------------------------------- GUT ----
    gut: {
      bpm: 100, key: 55, scale: 'phrygian', swing: 0.22, gain: 1,
      progs: ['0m 1M 8M 10m', '0m 1M 0m 5m', '0m7 1M7 3M 6dim'],
      layers: { amb: { rev: 0.45 }, bass: { rev: 0.08, drive: 0.2, post: 0.8, lvl: 0.17 }, drums: { rev: 0.15, lvl: 0.84 }, lead: { rev: 0.35, lvl: 0.95 } },
      init(P) { P.st.bp = 0; },
      vary(P) { P.st.bp = P.r.int(0, GUT_BASS.length - 1); P.st.mel = makeMotif(P.r, 32, 0.5, 0, 5, [2, 2, 4, 6]); },
      bar(P) {
        const A = P.L('amb');
        if (!A) return;
        if (mod(P.lbar, 2) === 0) INS.pad(P.c, A, P.t, P.chord.n.map((m) => m + 12), P.barDur * 2, 0.17, 'sick');
        if (mod(P.lbar, 4) === 2) INS.groan(P.c, A, P.t + P.bd, P.chord.r - 24, P.bd * 3, 0.22);
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        if (A && r.chance(0.16 + 0.14 * P.I)) INS.bubble(c, A, t + r.range(0, P.sd * 0.6), r.range(250, 900), 0.09, r.range(-0.7, 0.7));
        // bass in a 7-step cycle against the 16-step bar: off-kilter, but beats stay on grid
        if (B) {
          const ch = GUT_BASS[P.st.bp][P.n % 7];
          if (ch !== '.') {
            const m = P.chord.r - 12 + (ch === 'o' ? 12 : ch === 'b' ? 1 : 0);
            INS.bass(c, B, t, m, P.sd * 1.6, 0.34, { lp: 140, env: 800, q: 8, fd: 0.2, sub: 0.6, bend: r.chance(0.3) ? -1 : 0 });
          }
        }
        if (D) {
          if (p === 0 || p === 6 || p === 10) INS.kick(c, D, t, 0.68, { f0: 120, f1: 40 });
          if (p === 4 || p === 12) {
            INS.snare(c, D, t, 0.28, { bp: 900, d: 0.15, f: 160 });
            INS.bubble(c, D, t + 0.01, 300, 0.15);
          }
          if ((p & 1) === 0) INS.hat(c, D, t, 0.12);
          else if (r.chance(0.5)) INS.hat(c, D, t, 0.065);
          if (P.n % 7 === 3) INS.tom(c, D, t, r.range(140, 200), 0.17);
        }
        if (Ld && P.st.mel) {
          const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
          if (note) {
            const m = P.ct(note.i, 1);
            INS.lead(c, Ld, t, m, note.l * P.sd, 0.13, { w: 'square', det: 18, lp: 1200, vr: 4.5, vd: 35, from: P.st.lastLead, gl: 0.12 });
            P.st.lastLead = m;
          }
        }
      },
    },
    // ------------------------------------------------------------ CORTEX ----
    cortex: {
      bpm: 120, key: 54, scale: 'minor', gain: 1,
      progs: ['0m 8M 3M 10M', '0m 10M 8M 7m', '0m 3M 10M 5m'],
      layers: { amb: { rev: 0.4, lvl: 0.56 }, bass: { rev: 0.05, lvl: 0.52 }, drums: { rev: 0.1, lvl: 0.71 }, lead: { rev: 0.3, lvl: 4 } },
      init(P) { P.st.arp = ARPS16[0]; },
      vary(P) { P.st.arp = P.r.pick(ARPS16); P.st.glitch = P.r.chance(0.5); },
      bar(P) {
        const A = P.L('amb');
        if (!A) return;
        INS.pad(P.c, A, P.t, P.chord.n.map((m) => m + 12), P.barDur, 0.16, 'square');
        if (mod(P.lbar, 2) === 1) INS.zap(P.c, A, P.t + P.r.int(0, 15) * P.sd, P.r.range(2000, 5000), 0.06, P.r.range(-0.8, 0.8));
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        if (A && r.chance(0.25)) INS.crackle(c, A, t + r() * P.sd, 0.12, r);
        if (B) {
          if (p % 4 === 2) INS.bass(c, B, t, P.chord.r - 12, P.sd * 1.5, 0.36, { lp: 200, env: 1500, q: 7, fd: 0.09 });
          else if ((P.v4 & 1) && p % 4 === 3) INS.bass(c, B, t, P.chord.r, P.sd * 0.8, 0.22, { lp: 300, env: 1200, q: 7, fd: 0.06 });
          if (p === 0 && P.I > 0.6) INS.bass(c, B, t, P.chord.r - 12, P.sd, 0.3, { lp: 150, env: 600, q: 3, sub: 0.6 });
        }
        if (D) {
          if (p % 4 === 0) INS.kick(c, D, t, 0.6, { f0: 170, f1: 48, d: 0.32 });
          if (p === 4 || p === 12) INS.clap(c, D, t, 0.36);
          INS.hat(c, D, t, p % 4 === 2 ? 0.14 : 0.06, { d: p % 4 === 2 ? 0.12 : 0.03 });
          if (mod(P.lbar, 4) === 3 && p >= 12) {
            INS.hat(c, D, t + P.sd * 0.5, 0.08);
            if (p >= 14) INS.snare(c, D, t + P.sd * 0.5, 0.12, { d: 0.06 });
          }
        }
        if (Ld) {
          const m = P.ct(P.st.arp[p], 1);
          INS.bell(c, Ld, t, m, 0.1, { ratio: 2, i: 2.5, dec: 0.16, pan: ((p % 4) - 1.5) * 0.3 });
          if (P.st.glitch && p >= 8 && r.chance(0.3)) INS.bell(c, Ld, t + P.sd * 0.5, m + 12, 0.06, { ratio: 2, i: 3, dec: 0.08 });
          if (r.chance(0.03)) INS.zap(c, Ld, t, r.range(3000, 6000), 0.05, r.range(-0.8, 0.8));
        }
      },
    },
    // ------------------------------------------------------------- WOUND ----
    wound: {
      bpm: 90, key: 48, scale: 'locrian', gain: 1,
      progs: ['0m 1M 8M 6M', '0m 6M 5m 1M'],
      layers: { amb: { rev: 0.6, lvl: 0.74 }, bass: { rev: 0.1, drive: 0.6, post: 0.5, lvl: 0.22 }, drums: { rev: 0.25, drive: 0.3, post: 0.7, lvl: 0.4 }, lead: { rev: 0.5, lvl: 2.9 } },
      vary(P) { P.st.mel = makeMotif(P.r, 32, 0.6, 0, 5, [4, 4, 8, 8]); },
      bar(P) {
        const A = P.L('amb'), c = P.c, t = P.t, r = P.r;
        if (!A) return;
        if (mod(P.lbar, 2) === 0) INS.pad(c, A, t, [P.chord.r - 12, P.chord.r - 5, P.chord.n[1]], P.barDur * 2, 0.24, 'decay');
        else {
          // remnants of the regions you passed through, decaying
          const k = r.int(0, 3);
          if (k === 0) { INS.lub(c, A, t, 0.3, { f: 44 }); INS.dub(c, A, t + P.bd * 0.75, 0.18, { f: 52 }); }
          else if (k === 1) INS.whoosh(c, A, t, P.barDur, 0.09, 300, 1300);
          else if (k === 2) for (let i = 0; i < 5; i++) INS.bubble(c, A, t + r.range(0, P.barDur), r.range(150, 400), 0.07, r.range(-0.7, 0.7));
          else for (let i = 0; i < 3; i++) INS.zap(c, A, t + P.bd * (i + 1), 2500 - i * 600, 0.05, r.range(-0.6, 0.6));
        }
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, B = P.L('bass'), D = P.L('drums'), Ld = P.L('lead');
        if (B && (p === 0 || p === 10 || ((P.v4 & 1) && p === 14))) {
          INS.bass(c, B, t, P.chord.r - 12, P.sd * (p === 0 ? 8 : 4), 0.4, { lp: 220, env: 700, q: 2, sub: 0.7, bend: p === 10 ? -0.6 : 0 });
        }
        if (D) {
          if (p === 0 || p === 10) INS.kick(c, D, t, 0.8, { f0: 120, f1: 36, d: 0.55 });
          if (p === 8) INS.snare(c, D, t, 0.4, { bp: 1300, d: 0.35, f: 150 });
          if ((p & 1) && r.chance(0.12)) INS.metal(c, D, t, r.range(250, 600), 0.12);
          if ((p & 3) === 2) INS.hat(c, D, t, 0.1, { d: 0.05, hp: 5000 });
        }
        if (Ld && P.st.mel) {
          const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
          if (note) INS.bell(c, Ld, t, P.ct(note.i, 1), 0.16, { ratio: 1.41, i: 3, dec: 1.6, droop: -0.8, det: r.range(-15, 15) });
        }
      },
    },
    // ------------------------------------------------------- FINAL: SEPSIS --
    final: {
      bpm: 132, key: 50, scale: 'phrygian', gain: 1,
      progs: ['0m 1M 0m 10M', '8M 7M 0m 1M'],
      layers: {
        amb: { rev: 0.55, lvl: 0.73, curve: [[0, 1], [1, 0.9]] },
        bass: { rev: 0.05, drive: 0.45, post: 0.5, lvl: 0.3, curve: [[0, 0.35], [0.5, 1]] },
        drums: { rev: 0.15, drive: 0.1, post: 0.85, lvl: 0.3, curve: [[0, 0.3], [0.6, 1]] },
        stab: { rev: 0.3, drive: 0.25, post: 0.6, lvl: 0.2, curve: [[0.2, 0], [0.6, 1]] },
        lead: { rev: 0.35, curve: [[0.3, 0], [0.8, 1]] },
      },
      init(P) { P.st.th = 0; },
      vary(P) { P.st.th = P.r.int(0, 1); P.st.arp = P.r.pick(ARPS16); },
      bar(P) {
        const A = P.L('amb');
        if (A && mod(P.lbar, 2) === 0) INS.pad(P.c, A, P.t, P.chord.n.map((m) => m + 12).concat([P.chord.r]), P.barDur * 2, 0.32, 'choirA');
        const D = P.L('drums');
        if (D && mod(P.lbar, 4) === 0) INS.crash(P.c, D, P.t, 0.14);
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), St = P.L('stab'), Ld = P.L('lead');
        if (A) { if (p === 0 || p === 8) INS.lub(c, A, t, 0.4, { f: 55 }); else if (p === 1 || p === 9) INS.dub(c, A, t, 0.25); }
        if (B) {
          const pat = BOSS_BASS[P.v4 % 3], off = pat[p];
          if (off != null) INS.bass(c, B, t, P.chord.r - 12 + off, P.sd * 0.75, p % 4 === 0 ? 0.4 : 0.3, { lp: 200, env: 1400, q: 5, fd: 0.08 });
        }
        if (D) {
          if (p % 4 === 0 || p === 3 || ((P.v4 & 1) && p === 14)) INS.kick(c, D, t, 0.65, { f0: 160, f1: 42 });
          if (p === 4 || p === 12) INS.snare(c, D, t, 0.45, { bp: 1800 });
          else if (r.chance(0.1)) INS.snare(c, D, t, 0.1, { d: 0.06 });
          if (p === 6 || p === 7 || p === 15) INS.tom(c, D, t, p === 15 ? 90 : 120, 0.4);
          INS.hat(c, D, t, (p & 1) ? 0.05 : 0.1);
          if (mod(P.lbar, 4) === 3 && p >= 8) INS.snare(c, D, t, 0.1 + (p - 8) * 0.04, { d: 0.08 });
        }
        if (St && (p === 0 || p === 3 || p === 6 || ((P.v4 & 2) && p === 10))) {
          INS.pad(c, St, t, P.chord.n.map((m) => m + 12), P.sd * 1.5, 0.32, 'brass');
        }
        if (Ld) {
          const th = FINAL_THEME[(P.st.th + (mod(P.lbar, 4) >= 2 ? 1 : 0)) % 2], half = mod(P.lbar, 2) * 16;
          for (let k = 0; k < th.length; k++) {
            if (th[k][0] !== half + p) continue;
            const m = P.sc(th[k][1], 0), d = th[k][2] * P.sd;
            INS.lead(c, Ld, t, m, d, 0.16, { lp: 2800, det: 10, a: 0.015 });
            INS.lead(c, Ld, t, m - 12, d, 0.1, { lp: 1600, det: 6, a: 0.015 });
          }
          if (P.I > 0.9 && P.st.arp) INS.bell(c, Ld, t, P.ct(P.st.arp[p], 1), 0.05, { ratio: 2, i: 2.5, dec: 0.12, pan: ((p % 4) - 1.5) * 0.4 });
        }
      },
    },
    // ----------------------------------------------------------- VICTORY ----
    victory: {
      bpm: 84, key: 48, scale: 'major', fixed: true, fadeIn: 0.02, xout: 0.6, gain: 1,
      progs: ['0M 9m 5M 7M'],
      layers: { amb: { rev: 0.45, lvl: 0.68 }, bass: { rev: 0.1, lvl: 0.73 }, drums: { rev: 0.3, lvl: 0.3 }, lead: { rev: 0.5, lvl: 2.4 } },
      vary(P) { P.st.mel = makeMotif(P.r, 32, 0.45, 2, 7, [4, 4, 6, 8]); },
      bar(P) {
        const c = P.c, t = P.t, A = P.L('amb');
        if (P.lbar === 1) INS.pad(c, A, t, [60, 64, 67, 72, 74, 79], P.barDur * 0.8, 0.35, 'warm', { a: 0.05, r: 2.2 });
        if (P.lbar >= 2) {
          INS.pad(c, A, t, P.chord.n.map((m) => m + 12), P.barDur, 0.18, 'warm');
          INS.bass(c, P.L('bass'), t, P.chord.r - 12, P.barDur * 0.8, 0.2, { w: 'sine', lp: 300, env: 100, q: 0, sub: 0.3 });
        }
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, A = P.L('amb'), D = P.L('drums'), Ld = P.L('lead');
        if (P.lbar === 0) {
          // triumphant stinger: "da da-da DAAAA ... da DAAAA"
          const hits = { 0: [67, 72, 76, 0.18], 2: [67, 72, 76, 0.1], 3: [67, 72, 76, 0.1], 4: [67, 72, 76, 1.1], 10: [67, 71, 74, 0.25], 12: [67, 72, 79, 1.6] };
          const h = hits[p];
          if (h) {
            INS.pad(c, A, t, [h[0], h[1], h[2], 48], h[3], 0.5, 'brass');
            if (p === 0 || p === 4 || p === 12) { INS.tom(c, D, t, 70, 0.6); INS.kick(c, D, t, 0.5, { f0: 90, f1: 40, d: 0.8 }); }
            if (p === 4 || p === 12) INS.crash(c, D, t, 0.2);
          }
          if (p >= 4 && p < 12) INS.bell(c, Ld, t, [72, 76, 79, 84, 79, 84, 88, 91][p - 4], 0.12, { ratio: 3.01, i: 1, dec: 0.8 });
          return;
        }
        if (P.lbar === 1) return;
        if (p === 0) INS.lub(c, A, t, 0.18, { f: 58, click: 0 });
        if (p === 1) INS.dub(c, A, t, 0.1);
        if ((p & 1) === 0) INS.shaker(c, D, t, 0.03);
        if (P.st.mel) {
          const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
          if (note) INS.bell(c, Ld, t, P.ct(note.i, 1), 0.13, { ratio: 4, i: 1, dec: 1.6 });
        }
      },
    },
    // ------------------------------------------------------------- DEATH ----
    death: {
      bpm: 72, key: 45, scale: 'minor', fixed: true, len: 2, fadeIn: 0.02, xout: 0.5, gain: 1,
      progs: ['0m 0m'],
      layers: { amb: { rev: 0.6, lvl: 0.7 }, lead: { rev: 0.6, lvl: 1.9 } },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, A = P.L('amb'), Ld = P.L('lead');
        if (P.lbar === 0) {
          if (p === 0) {
            INS.kick(c, A, t, 0.7, { f0: 80, f1: 28, d: 1.6, pd: 0.5, click: 0 });
            INS.pad(c, A, t, [45, 52, 57, 60, 64], P.barDur * 1.3, 0.3, 'dark', { a: 0.05, r: 2.0, lp: 1500, lpPts: [[P.barDur * 2, 200]] });
            INS.pad(c, A, t, [57, 60, 64], P.barDur * 1.2, 0.18, 'choir', { a: 0.4, r: 1.6 });
          }
          const mel = { 0: 76, 3: 74, 4: 72, 7: 71, 8: 69, 12: 68 };
          if (mel[p] != null) INS.bell(c, Ld, t, mel[p], 0.15, { ratio: 3.5, i: 1.2, dec: p >= 8 ? 2.5 : 1.4 });
          if (p === 8) { INS.lub(c, A, t, 0.4, { f: 55, click: 0 }); }
          if (p === 9) INS.dub(c, A, t, 0.22);
          if (p === 14) INS.lub(c, A, t, 0.22, { f: 50, click: 0 });
        } else if (p === 0) {
          INS.bell(c, Ld, t, 57, 0.12, { ratio: 3.5, i: 0.8, dec: 3 });
          // the monitor flatlines
          syn(c, A).tone({ t: t + P.bd * 0.5, d: 2.6, f: 987.8, a: 0.01, h: 1.4, g: 0.05 });
        }
      },
    },
  };

  // ---- per-region boss variants (faster/heavier take on region scale+timbre)
  const BOSS = {
    veins: { bpm: 116, key: 50, scale: 'minor', progs: ['0m 1M 0m 8M', '0m 8M 10M 7M'], lead: 'saw', pad: 'saw', sig: 'flow', al: 0.8, ll: 1.7 },
    heart: { bpm: 92, key: 48, scale: 'minor', progs: ['0m 1M 8M 7M', '0m 5m 1M 7d7'], lead: 'strings', pad: 'choir', sig: 'heart', al: 0.8, ll: 1.65 },
    lungs: { bpm: 104, key: 52, scale: 'dorian', progs: ['0m 8M 10M 0m', '0m 5M 8M 7m'], lead: 'flute', pad: 'air', sig: 'wind', al: 0.8, ll: 1.35 },
    gut: { bpm: 116, key: 55, scale: 'phrygian', progs: ['0m 1M 0m 10m', '0m 1M 6M 1M'], lead: 'warble', pad: 'sick', sig: 'bubbles', swing: 0.15, al: 0.8, ll: 1.0 },
    cortex: { bpm: 140, key: 54, scale: 'minor', progs: ['0m 8M 10M 7M', '0m 1M 8M 7m'], lead: 'arp', pad: 'square', sig: 'zaps', al: 0.45, ll: 4.2 },
    wound: { bpm: 104, key: 48, scale: 'locrian', progs: ['0m 1M 6M 1M', '0m 8M 6M 5m'], lead: 'bell', pad: 'decay', sig: 'decay', al: 0.8, ll: 2.6 },
  };
  const REGIONS = Object.keys(BOSS);
  const BOSS_DEFS = Object.create(null);
  function bossLead(P, dest, s, note, m, d) {
    const c = P.c, t = P.t;
    switch (s.lead) {
      case 'strings': INS.lead(c, dest, t, m, d, 0.16, { lp: 1900, a: 0.05, det: 11, vd: 16 }); break;
      case 'flute': INS.lead(c, dest, t, m, d, 0.17, { w: 'triangle', det: 4, lp: 3200, a: 0.03, vd: 20, breath: 0.4 }); break;
      case 'warble': INS.lead(c, dest, t, m, d, 0.14, { w: 'square', det: 20, lp: 1500, vr: 5, vd: 40, from: P.st.lastLead, gl: 0.1 }); P.st.lastLead = m; break;
      case 'bell': INS.bell(c, dest, t, m, 0.17, { ratio: 1.41, i: 3.5, dec: 1.2, droop: -0.6 }); break;
      default: INS.lead(c, dest, t, m, d, 0.15, { lp: 2600, det: 9, a: 0.01 });
    }
  }
  function makeBossDef(region) {
    if (BOSS_DEFS[region]) return BOSS_DEFS[region];
    const s = BOSS[region];
    const def = {
      bpm: s.bpm, key: s.key, scale: s.scale, progs: s.progs, swing: s.swing || 0, region, gain: 1,
      layers: {
        amb: { rev: 0.5, lvl: s.al },
        bass: { rev: 0.05, drive: 0.4, post: 0.55, lvl: 0.28, curve: [[0, 0.3], [0.4, 1]] },
        drums: { rev: 0.12, drive: 0.1, post: 0.9, lvl: 0.33, curve: [[0, 0.35], [0.5, 1]] },
        stab: { rev: 0.3, drive: 0.25, post: 0.7, lvl: 0.24 },
        lead: { rev: 0.35, lvl: s.ll, curve: [[0.35, 0], [0.8, 1]] },
      },
      start: s.sig === 'wind' ? (P) => startWind(P, 'amb') : null,
      init(P) { P.st.arp = ARPS16[1]; },
      vary(P) { P.st.mel = makeMotif(P.r, 32, 0.75, 0, 5, [2, 2, 4, 6]); P.st.arp = P.r.pick(ARPS16); },
      bar(P) {
        const c = P.c, t = P.t, r = P.r, A = P.L('amb');
        if (s.sig === 'wind' && mod(P.lbar, 2) === 0) breathe(P, 3, 5, 0.45); // panting
        if (!A) return;
        INS.pad(c, A, t, P.chord.n.map((m) => m + 12), P.barDur, 0.2, s.pad);
        if (s.sig === 'flow') INS.whoosh(c, A, t, P.barDur, 0.08, 250, 900);
        if (s.sig === 'bubbles' && mod(P.lbar, 2) === 1) INS.groan(c, A, t, P.chord.r - 24, P.bd * 3, 0.22);
        if (s.sig === 'decay' && mod(P.lbar, 2) === 1) INS.lub(c, A, t + P.bd * 2, 0.25, { f: 44 });
        if (s.sig === 'zaps') INS.zap(c, A, t + r.int(0, 15) * P.sd, r.range(2500, 6000), 0.07, r.range(-0.8, 0.8));
      },
      step(P) {
        const c = P.c, t = P.t, p = P.pos, r = P.r, A = P.L('amb'), B = P.L('bass'), D = P.L('drums'), St = P.L('stab'), Ld = P.L('lead');
        if (A) {
          if (s.sig === 'bubbles' && r.chance(0.3)) INS.bubble(c, A, t + r.range(0, P.sd * 0.5), r.range(200, 900), 0.09, r.range(-0.7, 0.7));
          if (s.sig === 'zaps' && r.chance(0.35)) INS.crackle(c, A, t + r() * P.sd, 0.13, r);
        }
        if (B) {
          const off = BOSS_BASS[P.v4 % 3][p];
          if (off != null) INS.bass(c, B, t, P.chord.r - 12 + off, P.sd * 0.75, p % 4 === 0 ? 0.38 : 0.28, { lp: 180, env: 1300, q: 5, fd: 0.08 });
        }
        if (D) {
          if (s.sig === 'heart') {
            if (p % 4 === 0) INS.lub(c, D, t, 0.9, { f: 60 });
            else if (p % 4 === 1) INS.dub(c, D, t, 0.55);
          } else if (p % 4 === 0 || ((P.v4 & 1) && p === 14)) INS.kick(c, D, t, 0.7, { f0: 160, f1: 42 });
          if (p === 4 || p === 12) INS.snare(c, D, t, 0.42, { bp: 1700 });
          else if ((p === 7 || p === 15) && r.chance(0.5)) INS.snare(c, D, t, 0.1, { d: 0.06 });
          INS.hat(c, D, t, (p & 1) ? 0.045 : 0.1);
          if (mod(P.lbar, 4) === 3 && p >= 12) INS.tom(c, D, t, [220, 180, 140, 110][p - 12], 0.45);
          if (mod(P.lbar, 8) === 0 && p === 0) INS.crash(c, D, t, 0.13);
        }
        if (St && (p === 0 || p === 6 || ((P.v4 & 2) && p === 10))) INS.pad(c, St, t, P.chord.n.map((m) => m + 12), P.sd * 1.2, 0.28, 'brass');
        if (Ld) {
          if (s.lead === 'arp') INS.bell(c, Ld, t, P.ct(P.st.arp[p], 1), 0.11, { ratio: 2, i: 2.8, dec: 0.14, pan: ((p % 4) - 1.5) * 0.3 });
          else if (P.st.mel) {
            const note = P.st.mel[mod(P.lbar, 2) * 16 + p];
            if (note) bossLead(P, Ld, s, note, P.ct(note.i, 1), note.l * P.sd);
          }
        }
      },
    };
    return (BOSS_DEFS[region] = def);
  }
  const TRACK_IDS = ['title', 'shop', 'veins', 'heart', 'lungs', 'gut', 'cortex', 'wound', 'boss', 'final', 'victory', 'death'];
  function resolveDef(id, region) {
    if (id === 'boss') return makeBossDef(BOSS[region] ? region : 'veins');
    return TRACKS[id] || null;
  }

  // ===========================================================================
  // 7. Track player (generative step sequencer, one per playing track)
  // ===========================================================================
  function curveAt(cv, x) {
    if (x <= cv[0][0]) return cv[0][1];
    for (let i = 1; i < cv.length; i++) {
      if (x <= cv[i][0]) { const a = cv[i - 1], b = cv[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    }
    return cv[cv.length - 1][1];
  }

  function Track(g, id, def, t0, seed) {
    const c = g.c;
    this.g = g; this.c = c; this.id = id; this.def = def;
    this.bpm = def.bpm; this.bpb = def.bpb || 4; this.spb = def.spb || 4;
    this.sd = 60 / this.bpm / this.spb; this.spBar = this.bpb * this.spb;
    this.t0 = t0; this.next = 0; this.bar0 = null;
    this.r = makeRng(seed);
    this.I = 0; this.Iset = 0; this.lastSet = -1;
    this.fadeEnd = 0; this.ended = false; this.keep = [];
    this.trim = def.gain || 1;
    this.xd = c.createGain(); this.xw = c.createGain();
    this.xd.gain.value = 0; this.xw.gain.value = 0;
    this.xd.connect(g.musicDry); this.xw.connect(g.musicWet);
    this.layers = {};
    for (const name in def.layers) {
      const L = def.layers[name];
      const lg = c.createGain();
      lg.gain.value = 0;
      lg.connect(this.xd);
      let input = lg;
      if (L.drive) {
        const ws = c.createWaveShaper();
        // no oversampling: its resampler adds ~3 ms latency and would push
        // driven drums (e.g. boss heartbeats) off the beat clock
        ws.curve = driveCurve(L.drive); ws.oversample = 'none';
        const pg = c.createGain(); pg.gain.value = L.post || 0.6;
        ws.connect(pg); pg.connect(lg);
        input = ws;
      }
      if (L.rev) { const s = c.createGain(); s.gain.value = L.rev; lg.connect(s); s.connect(this.xw); }
      const curve = def.fixed ? LAYER_CURVES.fixed : (L.curve || LAYER_CURVES[name] || LAYER_CURVES.amb);
      this.layers[name] = { in: input, g: lg, curve, lvl: L.lvl != null ? L.lvl : 1 };
    }
    this.st = {};
    this.prog = parseProg(def.progs[0], def.key);
    this.P = makePerformer(this);
    if (def.init) def.init(this.P);
    if (def.start) { this.P.t = t0; def.start(this.P); }
  }
  const TP = Track.prototype;
  TP.stepTime = function (n) {
    let t = this.t0 + n * this.sd;
    if (this.def.swing && (n & 1)) t += this.def.swing * this.sd;
    return t;
  };
  TP.layerOn = function (L) { return curveAt(L.curve, this.I) > 0.012 || curveAt(L.curve, this.Iset) > 0.012; };
  TP.setIntensity = function (I, now, immediate) {
    for (const n in this.layers) {
      const L = this.layers[n], v = curveAt(L.curve, I) * L.lvl;
      if (immediate) { L.g.gain.cancelScheduledValues(0); L.g.gain.value = v; L.g.gain.setValueAtTime(v, now); }
      else L.g.gain.setTargetAtTime(v, now, 0.45);
    }
    this.Iset = I; this.lastSet = now;
    if (immediate) this.I = I;
  };
  TP.update = function (dt, now, I) {
    if (Math.abs(I - this.Iset) > 0.01 && (now - this.lastSet > 0.1 || I === 0 || I === 1)) this.setIntensity(I, now, false);
    this.I += (this.Iset - this.I) * (1 - Math.exp(-Math.max(0, dt) / 0.45));
  };
  TP.fadeTo = function (target, now, sec) {
    for (const p of [this.xd.gain, this.xw.gain]) {
      holdParam(p, now);
      if (sec <= 0.03) p.setValueAtTime(target, now);
      else p.linearRampToValueAtTime(target, now + sec);
    }
  };
  TP.fadeIn = function (now, sec) { this.fadeTo(this.trim, now, sec); };
  TP.fadeOut = function (now, sec) { this.fadeTo(0, now, sec); this.fadeEnd = now + sec + 0.05; };
  TP.dispose = function () {
    const now = this.c.currentTime;
    for (const s of this.keep) { try { s.stop(now + 0.05); } catch (_) { /* ok */ } }
    this.keep.length = 0;
    this.ended = true;
    const xd = this.xd, xw = this.xw;
    setTimeout(() => { safeDisconnect(xd); safeDisconnect(xw); }, 200);
  };
  TP.scheduleUntil = function (tEnd, tMin) {
    if (this.ended) return;
    if (this.stepTime(this.next) < tMin - 0.5) this.next = Math.max(this.next, Math.ceil((tMin - this.t0) / this.sd));
    let guard = 0;
    while (!this.ended && guard++ < 100000) {
      const n = this.next, t = this.stepTime(n);
      if (t >= tEnd) break;
      this.next = n + 1;
      if (t < tMin) continue;
      this.doStep(n, t);
    }
  };
  TP.doStep = function (n, t) {
    const P = this.P, def = this.def;
    const bar = Math.floor(n / this.spBar), pos = n - bar * this.spBar;
    if (this.bar0 === null) this.bar0 = pos === 0 ? bar : bar + 1;
    const lbar = bar - this.bar0;
    if (def.len && lbar >= def.len) { this.ended = true; return; }
    P.t = t; P.n = n; P.bar = bar; P.lbar = lbar; P.pos = pos; P.I = this.I;
    try {
      if (pos === 0 && lbar >= 0 && mod(lbar, 4) === 0) {
        P.v4 = this.r.int(0, 7);
        if (mod(lbar, 8) === 0) {
          P.v8 = this.r.int(0, 7);
          if (lbar > 0 && def.progs.length > 1 && this.r.chance(0.5)) this.prog = parseProg(this.r.pick(def.progs), def.key);
        }
        if (def.vary) def.vary(P);
      }
      const bpc = def.bpc || 1;
      P.ci = mod(Math.floor(lbar / bpc), this.prog.length);
      P.chord = this.prog[P.ci];
      if (pos === 0 && def.bar && lbar >= 0) def.bar(P);
      def.step(P);
    } catch (e) {
      warnOnce('step:' + this.id, 'music step error in ' + this.id + ': ' + (e && e.message));
    }
  };
  function makePerformer(tr) {
    const def = tr.def;
    const P = {
      tr, c: tr.c, def, r: tr.r, st: tr.st, key: def.key, scale: SCALES[def.scale] || SCALES.minor,
      t: 0, n: 0, bar: 0, lbar: 0, pos: 0, I: 0, chord: null, ci: 0, v4: 0, v8: 0,
      sd: tr.sd, bd: tr.sd * tr.spb, barDur: tr.sd * tr.spBar, spb: tr.spb, spBar: tr.spBar,
      // layer input node, or null when that layer is silent at this intensity
      L(name) { const L = tr.layers[name]; return L && tr.layerOn(L) ? L.in : null; },
      ct(i, oct) { const nn = P.chord.n, len = nn.length; return nn[mod(i, len)] + 12 * (Math.floor(i / len) + (oct || 0)); },
      sc(deg, oct) { const s = P.scale, len = s.length; return P.key + s[mod(deg, len)] + 12 * (Math.floor(deg / len) + (oct || 0)); },
      next() { const pr = tr.prog; return pr[mod(P.ci + 1, pr.length)]; },
    };
    return P;
  }

  // ===========================================================================
  // 8. Engine core: context, graph, volumes, clock, scheduler, lifecycle
  // ===========================================================================
  const LOOKAHEAD = 0.2;       // seconds scheduled ahead of currentTime
  const TICK_MS = 25;
  const VOICE_CAP = 32;
  // DynamicsCompressorNode applies automatic make-up gain; these trims (measured
  // in Chromium) cancel it so each stage is unity-gain below threshold.
  const COMP_TRIM = 0.72;      // master glue compressor: +2.83 dB make-up
  const LIM_TRIM = 0.82;       // master limiter: +1.71 dB make-up
  const MUS_TRIM = 0.82;       // music bus compressor: +1.72 dB make-up
  const LP_ON = 620;
  // Each DynamicsCompressorNode delays its signal by a fixed 6 ms look-ahead.
  // Music passes three (bus comp, master glue, master limiter), so a note
  // scheduled at ctx time T is heard at T + 18 ms; the beat clock compensates.
  const GRAPH_LATENCY = 0.018;

  const E = {
    ctx: null, g: null, ready: false, failed: false,
    vol: { master: 1, music: 0.8, sfx: 1 }, muted: false, lowpass: false,
    tracks: [], cur: null, curId: null, curRegion: null, lastRegion: 'veins', pending: null,
    intensity: 0, timer: null, lastTick: 0, tickMs: 0, ticks: 0,
    voices: [], lastPlay: Object.create(null), cache: Object.create(null), queue: [], inflight: 0,
  };

  function buildGraph(c, o) {
    o = o || {};
    const G = (v) => { const n = c.createGain(); n.gain.value = v; return n; };
    const ir = irsFor(c);
    const g = { c };
    g.master = G(1);
    const dcb = c.createBiquadFilter();   // DC / sub-rumble blocker
    dcb.type = 'highpass'; dcb.frequency.value = 25; dcb.Q.value = 0.6;
    g.master.connect(dcb);
    if (o.raw) dcb.connect(c.destination);
    else {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 2.5;
      comp.attack.value = 0.008; comp.release.value = 0.25;
      const trim = G(COMP_TRIM);
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20;
      lim.attack.value = 0.001; lim.release.value = 0.12;
      const clip = c.createWaveShaper();
      clip.curve = clipCurve();
      const ltrim = G(LIM_TRIM);
      dcb.connect(comp); comp.connect(trim); trim.connect(lim); lim.connect(ltrim); ltrim.connect(clip); clip.connect(c.destination);
    }
    // music: dry + reverb sum -> volume -> duck -> lowpass -> master
    g.musicDry = G(1); g.musicWet = G(1); g.musicSum = G(1);
    const mv = c.createConvolver(); mv.buffer = ir.music;
    const mret = G(0.6);
    g.musicWet.connect(mv); mv.connect(mret); mret.connect(g.musicSum);
    g.musicDry.connect(g.musicSum);
    // gentle bus compression keeps stacked downbeats (kick+bass+pad) in check
    const mc = c.createDynamicsCompressor();
    mc.threshold.value = -8; mc.knee.value = 8; mc.ratio.value = 3; mc.attack.value = 0.01; mc.release.value = 0.18;
    const mtrim = G(MUS_TRIM);
    g.musicVol = G(1); g.duck = G(1);
    g.lp = c.createBiquadFilter(); g.lp.type = 'lowpass'; g.lp.frequency.value = Math.min(20000, c.sampleRate * 0.45); g.lp.Q.value = 0.5;
    g.musicSum.connect(mc); mc.connect(mtrim); mtrim.connect(g.musicVol); g.musicVol.connect(g.duck); g.duck.connect(g.lp); g.lp.connect(g.master);
    // sfx: dry + room reverb -> volume -> master
    g.sfxDry = G(1); g.sfxWet = G(1); g.sfxVol = G(1);
    const sv = c.createConvolver(); sv.buffer = ir.sfx;
    const sret = G(0.5);
    g.sfxWet.connect(sv); sv.connect(sret); sret.connect(g.sfxVol);
    g.sfxDry.connect(g.sfxVol); g.sfxVol.connect(g.master);
    return g;
  }

  const volGain = (v) => v * v;
  function applyVolumes(immediate) {
    if (!E.g) return;
    const now = E.ctx.currentTime, tc = immediate ? 0.001 : 0.06;
    E.g.master.gain.setTargetAtTime(E.muted ? 0 : volGain(E.vol.master), now, tc);
    E.g.musicVol.gain.setTargetAtTime(volGain(E.vol.music), now, tc);
    E.g.sfxVol.gain.setTargetAtTime(volGain(E.vol.sfx), now, tc);
  }
  function applyLowpass(immediate) {
    if (!E.g) return;
    const now = E.ctx.currentTime, f = E.lowpass ? LP_ON : Math.min(20000, E.ctx.sampleRate * 0.45);
    E.g.lp.frequency.setTargetAtTime(f, now, immediate ? 0.001 : (E.lowpass ? 0.18 : 0.3));
    E.g.lp.Q.setTargetAtTime(E.lowpass ? 1.2 : 0.5, now, 0.2);
  }

  // ---- clock ---------------------------------------------------------------
  // The beat clock is the master timeline. While audio runs it is derived from
  // the *audible* context time; otherwise it free-runs on performance.now().
  // Switching modes is continuous; on resume the track is re-anchored to it.
  const CLK = { bpm: 100, bpb: 4, audio: false, t0: 0, beat0: 0, perf0: perfNow(), last: 0 };
  function ctxRunning() { return !!(E.ctx && E.ctx.state === 'running'); }
  function audibleTime() {
    const c = E.ctx;
    if (c.getOutputTimestamp) {
      try {
        const ts = c.getOutputTimestamp();
        if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
          const age = (perfNow() - ts.performanceTime) / 1000;
          if (age > -0.1 && age < 0.5) return Math.min(ts.contextTime + age, c.currentTime);
        }
      } catch (_) { /* fall through */ }
    }
    return Math.max(0, c.currentTime - (c.outputLatency || c.baseLatency || 0));
  }
  // context time whose scheduled music is reaching the listener's ears right now
  function heardTime() { return audibleTime() - GRAPH_LATENCY; }
  function clockBeat() {
    let b;
    if (CLK.audio && ctxRunning()) {
      b = (heardTime() - CLK.t0) * CLK.bpm / 60;
      if (b < CLK.last) b = CLK.last;
      CLK.beat0 = b; CLK.perf0 = perfNow();
    } else {
      CLK.audio = false;
      b = CLK.beat0 + (perfNow() - CLK.perf0) * CLK.bpm / 60000;
    }
    if (b < CLK.last) b = CLK.last;
    CLK.last = b;
    return b;
  }
  function clockReset(bpm, bpb) {
    CLK.bpm = bpm; CLK.bpb = bpb; CLK.beat0 = 0; CLK.perf0 = perfNow(); CLK.last = 0; CLK.audio = false;
  }
  function clockFreeze() { clockBeat(); CLK.audio = false; }
  // re-anchor the current track so audible beats continue the clock seamlessly
  function anchorAudio() {
    const tr = E.cur, c = E.ctx;
    const b = clockBeat();
    const t0 = heardTime() - b * 60 / CLK.bpm;
    CLK.t0 = t0; CLK.audio = true;
    if (tr) {
      tr.t0 = t0;
      tr.next = Math.max(0, Math.ceil((c.currentTime + 0.02 - t0) / tr.sd));
    }
  }

  // ---- scheduler -------------------------------------------------------------
  function tick() {
    const c = E.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const dt = E.lastTick ? now - E.lastTick : 0;
    E.lastTick = now;
    const p0 = perfNow();
    try {
      if (E.cur && !CLK.audio) anchorAudio();
      for (let i = 0; i < E.tracks.length; i++) {
        const tr = E.tracks[i];
        tr.update(dt, now, E.intensity);
        tr.scheduleUntil(now + LOOKAHEAD, now + 0.004);
      }
      for (let i = E.tracks.length - 1; i >= 0; i--) {
        const tr = E.tracks[i];
        if (tr.fadeEnd && now > tr.fadeEnd) { tr.dispose(); E.tracks.splice(i, 1); }
      }
      if (CLK.audio) clockBeat();
    } catch (e) {
      warnOnce('tick', 'scheduler error: ' + (e && e.message));
    }
    E.tickMs += perfNow() - p0; E.ticks++;
  }

  function startTrack(id, region, keepClock) {
    const c = E.ctx, def = resolveDef(id, region);
    if (!def) return;
    const now = c.currentTime;
    for (const tr of E.tracks) if (!tr.fadeEnd) tr.fadeOut(now, def.xout != null ? def.xout : 1.5);
    const tr = new Track(E.g, id, def, now + 0.08, (RND() * 4294967296) >>> 0);
    tr.setIntensity(def.fixed ? 1 : E.intensity, now, true);
    tr.fadeIn(now, def.fadeIn != null ? def.fadeIn : 1.5);
    E.tracks.push(tr);
    E.cur = tr;
    if (!keepClock) clockReset(def.bpm, def.bpb || 4);
    if (ctxRunning() && !keepClock) { CLK.t0 = tr.t0; CLK.audio = true; }
    tick();
  }

  // ---- SFX voices ----------------------------------------------------------
  function pruneVoices(now) {
    if (E.voices.length) E.voices = E.voices.filter((v) => !v.dead && v.end > now);
  }
  function killVoice(v, fade) {
    if (v.dead) return;
    v.dead = true;
    const c = E.ctx, now = c.currentTime;
    fade = Math.max(0.005, fade || 0.015);
    try {
      holdParam(v.g.gain, now);
      v.g.gain.linearRampToValueAtTime(0, now + fade);
      if (v.src) v.src.stop(now + fade + 0.01);
    } catch (_) { /* ignore */ }
    setTimeout(() => safeDisconnect(v.g), (fade + 0.15) * 1000);
  }
  function playSfx(name, opts) {
    const def = SFX[name];
    if (!def) { warnOnce('sfx:' + name, 'unknown sfx "' + name + '"'); return null; }
    if (!E.ctx || E.ctx.state !== 'running' || E.muted || E.vol.sfx <= 0 || E.vol.master <= 0) return null;
    const c = E.ctx, g = E.g, now = c.currentTime;
    opts = opts || {};
    if (!opts.force && now - (E.lastPlay[name] || -1) < def.thr) return null;
    E.lastPlay[name] = now;
    pruneVoices(now);
    // per-name cap: steal that name's oldest voice
    let same = 0, oldest = null;
    for (const v of E.voices) if (v.name === name) { same++; if (!oldest || v.start < oldest.start) oldest = v; }
    if (same >= def.max && oldest) { killVoice(oldest, 0.02); pruneVoices(now); }
    // global cap: steal the oldest voice of equal-or-lower priority
    if (E.voices.length >= VOICE_CAP) {
      let victim = null;
      for (const v of E.voices) if (!v.dead && v.pri <= def.pri && (!victim || v.pri < victim.pri || (v.pri === victim.pri && v.start < victim.start))) victim = v;
      if (!victim) return null;
      killVoice(victim, 0.02);
    }
    let rate = num(opts.rate, 1);
    if (!(rate > 0)) rate = 1;
    rate = clamp(rate * Math.pow(2, (num(opts.pitch, 0) + (def.jit ? (RND() * 2 - 1) * def.jit : 0)) / 12), 0.25, 4);
    const vol = clamp(num(opts.vol, 1), 0, 2);
    const pan = clamp(num(opts.pan, 0), -1, 1);
    const vg = c.createGain();
    let tail = vg;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; vg.connect(p); tail = p; }
    tail.connect(g.sfxDry);
    if (def.rev > 0) { const s = c.createGain(); s.gain.value = def.rev; vg.connect(s); s.connect(g.sfxWet); }
    const bufs = E.cache[name];
    const voice = { name, pri: def.pri, g: vg, src: null, start: now, end: 0, dead: false };
    if (bufs && bufs.length) {
      const buf = bufs[(RND() * bufs.length) | 0];
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(vg);
      vg.gain.value = vol;
      src.start(now);
      src.onended = () => { voice.dead = true; safeDisconnect(vg); };
      voice.src = src;
      voice.end = now + buf.duration / rate + 0.05;
    } else {
      // synth fallback until the cache is ready (also bumps it in the queue)
      vg.gain.value = vol * (def.norm || 1);
      const S = new Synth(c, vg, rate, true, makeRng((RND() * 4294967296) >>> 0));
      def.gen(S, now + 0.004, S.r);
      voice.end = now + def.d + 0.1;
      setTimeout(() => { voice.dead = true; safeDisconnect(vg); }, (def.d + 0.4) * 1000);
      bumpCache(name);
    }
    E.voices.push(voice);
    return { stop(fadeSec) { if (E.ctx) killVoice(voice, num(fadeSec, 0.05)); } };
  }

  // ---- background SFX pre-render (OfflineAudioContexts render off the main
  //      thread; two names in flight, most frequently used sounds first) ----
  function startCache() {
    if (!OAC || !E.ctx) return;
    const order = SFX_NAMES.slice().sort((a, b) => SFX[a].pri - SFX[b].pri);
    E.queue = order.filter((n) => !E.cache[n]);
    pumpCache();
  }
  function bumpCache(name) {
    const i = E.queue.indexOf(name);
    if (i > 0) { E.queue.splice(i, 1); E.queue.unshift(name); }
  }
  function pumpCache() {
    while (E.inflight < 2 && E.queue.length && E.ctx) renderNext();
  }
  function renderNext() {
    const name = E.queue.shift(), def = SFX[name], sr = E.ctx.sampleRate;
    E.inflight++;
    const jobs = [];
    for (let v = 0; v < def.vars; v++) jobs.push(renderSfxVariant(name, v, sr));
    Promise.all(jobs).then((bufs) => { E.cache[name] = bufs; }, (err) => {
      warnOnce('cache:' + name, 'pre-render failed for ' + name + ' (' + (err && err.message) + '); using live synth');
    }).then(() => {
      E.inflight--;
      setTimeout(pumpCache, 4);
    });
  }

  // ---- lifecycle -------------------------------------------------------------
  function docHidden() { return !!(doc && doc.hidden); }
  function onVisibility() {
    if (!E.ctx) return;
    try {
      if (docHidden()) { clockFreeze(); E.ctx.suspend().catch(() => {}); }
      else resumeCtx();
    } catch (_) { /* ignore */ }
  }
  function resumeCtx() {
    if (!E.ctx || docHidden()) return;
    if (E.ctx.state !== 'running' && E.ctx.state !== 'closed') {
      try { const p = E.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
    }
  }
  function onState() {
    if (!E.ctx) return;
    if (E.ctx.state === 'running') { E.lastTick = 0; tick(); }
    else clockFreeze();
  }

  function init() {
    try {
      if (!AC) { warnOnce('noac', 'Web Audio unavailable; audio disabled'); return false; }
      if (!E.ctx) {
        if (E.failed) return false;
        let ctx = null;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (_) { ctx = new AC(); }
        try { E.g = buildGraph(ctx); } catch (e) {
          // never leave a half-built engine behind: give up on audio for this session
          E.failed = true;
          try { ctx.close(); } catch (_) { /* ignore */ }
          throw e;
        }
        E.ctx = ctx;
        applyVolumes(true);
        applyLowpass(true);
        E.ctx.onstatechange = onState;
        if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVisibility);
        if (root.addEventListener) ['pointerdown', 'keydown', 'touchend', 'mousedown'].forEach((ev) => root.addEventListener(ev, resumeCtx, true));
        E.timer = setInterval(tick, TICK_MS);
        startCache();
        E.ready = true;
        if (E.pending) { const p = E.pending; E.pending = null; startTrack(p.id, p.region, true); }
      }
      resumeCtx();
      return true;
    } catch (e) {
      warnOnce('init', 'init failed: ' + (e && e.message));
      return false;
    }
  }

  // ===========================================================================
  // 9. Public API
  // ===========================================================================
  const guard = (fn, fallback) => function () {
    try { return fn.apply(null, arguments); } catch (e) { warnOnce('api:' + (e && e.message), 'error: ' + (e && e.message)); return fallback; }
  };
  const KINDS = { master: 1, music: 1, sfx: 1 };

  const music = {
    play: guard((id, opts) => {
      if (id == null) { music.stop(); return; }
      id = String(id);
      if (TRACK_IDS.indexOf(id) < 0) { warnOnce('track:' + id, 'unknown music track "' + id + '"'); return; }
      let region = null;
      if (id === 'boss') region = (opts && BOSS[opts.region]) ? opts.region : (E.lastRegion || 'veins');
      if (BOSS[id]) E.lastRegion = id;
      if (E.curId === id && E.curRegion === region) return;
      E.curId = id; E.curRegion = region;
      const def = resolveDef(id, region);
      if (!E.ctx) {
        E.pending = { id, region };
        clockReset(def.bpm, def.bpb || 4);
        return;
      }
      startTrack(id, region, false);
    }),
    stop: guard((fadeSec) => {
      const f = clamp(num(fadeSec, 1.5), 0, 20);
      E.pending = null;
      if (E.ctx) { const now = E.ctx.currentTime; for (const tr of E.tracks) if (!tr.fadeEnd) tr.fadeOut(now, f); }
      E.cur = null; E.curId = null; E.curRegion = null;
      clockFreeze();
    }),
    setIntensity: function (x) { E.intensity = x >= 1 ? 1 : x > 0 ? +x : 0; },
    getIntensity() { return E.intensity; },
    clock: function () {
      try {
        const beat = clockBeat();
        return { beat, bpm: CLK.bpm, bar: Math.floor(beat / CLK.bpb), bpb: CLK.bpb };
      } catch (_) {
        return { beat: 0, bpm: CLK.bpm, bar: 0, bpb: CLK.bpb };
      }
    },
  };
  Object.defineProperty(music, 'current', { enumerable: true, get: () => E.curId });
  Object.defineProperty(music, 'region', { enumerable: true, get: () => E.curRegion });

  const AUDIO = {
    init: guard(init, false),
    setVolume: guard((kind, v) => {
      if (!KINDS[kind]) return;
      const nv = clamp(num(+v, E.vol[kind]), 0, 1);
      if (nv === E.vol[kind]) return;
      E.vol[kind] = nv;
      applyVolumes(false);
    }),
    getVolume: (kind) => (KINDS[kind] ? E.vol[kind] : 0),
    setMuted: guard((m) => { if (E.muted === !!m) return; E.muted = !!m; applyVolumes(false); }),
    sfx: guard(playSfx, null),
    stopSfx: guard((name, fadeSec) => {
      if (!E.ctx) return;
      for (const v of E.voices) if (v.name === name) killVoice(v, num(fadeSec, 0.05));
    }),
    music,
    duck: guard((amount, sec) => {
      if (!E.g) return;
      const a = clamp(num(amount, 0.5), 0, 1), s = clamp(num(sec, 0.6), 0.05, 10);
      const p = E.g.duck.gain, now = E.ctx.currentTime;
      const target = Math.min(1 - a, p.value);
      holdParam(p, now);
      p.linearRampToValueAtTime(target, now + 0.03);
      p.setValueAtTime(target, now + 0.03 + s * 0.3);
      p.linearRampToValueAtTime(1, now + 0.03 + s);
    }),
    // cheap when unchanged: games often call this every frame
    setLowpass: guard((on) => { if (E.lowpass === !!on) return; E.lowpass = !!on; applyLowpass(false); }),

    // ---- test hooks ----
    _sfxNames: SFX_NAMES.slice(),
    _trackIds: TRACK_IDS.slice(),
    _regions: REGIONS.slice(),
    _sfxLevel: (name) => (SFX[name] ? SFX[name].lvl : null),
    _renderSfx(name, variant, sampleRate) {
      if (!OAC) return Promise.reject(new Error('OfflineAudioContext unavailable'));
      if (!SFX[name]) return Promise.reject(new Error('unknown sfx ' + name));
      return renderSfxVariant(name, variant | 0, sampleRate || 44100);
    },
    _renderMusic(id, seconds, intensity, opts) {
      opts = opts || {};
      if (!OAC) return Promise.reject(new Error('OfflineAudioContext unavailable'));
      const def = resolveDef(id, opts.region);
      if (!def) return Promise.reject(new Error('unknown track ' + id));
      const sr = opts.sampleRate || 44100, secs = num(seconds, 8);
      const oc = new OAC(2, Math.ceil(secs * sr), sr);
      const g = buildGraph(oc, { raw: !!opts.raw });
      g.musicVol.gain.value = opts.raw ? 1 : volGain(E.vol.music);
      const tr = new Track(g, id, def, 0.05, opts.seed != null ? opts.seed : 12345);
      tr.setIntensity(def.fixed ? 1 : clamp(num(intensity, 1), 0, 1), 0, true);
      if (opts.solo) for (const n in tr.layers) if (n !== opts.solo) { tr.layers[n].g.gain.value = 0; tr.layers[n].curve = [[0, 0], [1, 0]]; }
      tr.xd.gain.value = tr.trim; tr.xw.gain.value = tr.trim;
      tr.scheduleUntil(secs, 0);
      for (const s of tr.keep) { try { s.stop(secs); } catch (_) { /* ok */ } }
      return renderOffline(oc);
    },
    _debug() {
      return {
        cachedNames: Object.keys(E.cache),
        ctx: E.ctx ? E.ctx.state : null, sampleRate: E.ctx ? E.ctx.sampleRate : null,
        voices: E.voices.filter((v) => !v.dead).length, tracks: E.tracks.length, current: E.curId,
        cached: Object.keys(E.cache).length, total: SFX_NAMES.length, queue: E.queue.length,
        intensity: E.intensity, clockAudio: CLK.audio, clockT0: CLK.t0, trackT0: E.cur ? E.cur.t0 : null,
        avgTickMs: E.ticks ? E.tickMs / E.ticks : 0, ticks: E.ticks,
      };
    },
    _ctx: () => E.ctx,
    _graphLatency: GRAPH_LATENCY,
  };
  Object.defineProperty(AUDIO, 'ready', { enumerable: true, get: () => E.ready });
  Object.defineProperty(AUDIO, 'muted', { enumerable: true, get: () => E.muted, set: (m) => AUDIO.setMuted(m) });

  root.AUDIO = AUDIO;
})(typeof window !== 'undefined' ? window : this);
