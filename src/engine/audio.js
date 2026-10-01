// Synthesized audio engine: bus graph + master chain, one-shot SFX, sustained
// loops, hush / muffle controls and gamepad rumble. Every sound is generated
// with the Web Audio API (no samples). Without an AudioContext (Node tests,
// old browsers) every call is a silent no-op.
//
// Graph:
//   voice -> sfx ----\                         (sfx  : sfxVol)
//   music decks -> music --> hush --> mix      (music: musicVol, hush: hush())
//   voice(bypassHush) -> bypass ----> mix      (bypass: sfxVol, ignores hush)
//   voice send -> rev(conv) -> sfx | revB(conv) -> bypass
//   mix -> muffle(lowpass) -> glue comp -> limiter -> soft clip -> master -> out
//
// Internal contract (used by music.js / voice.js):
//   JJK.Audio.ctx / ._E (live engine) / ._musicBus / ._synth / ._onUnlock(fn)
//   ._offline(sec, raw) / ._render(name, opts, sec, raw) for offline analysis.
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const JJK = root.JJK;
  const U = JJK.U;
  const A = (JJK.Audio = {});
  const AC = root.AudioContext || root.webkitAudioContext || null;
  const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext || null;

  const clamp = U.clamp;
  const R = Math.random;
  const rr = (a, b) => a + R() * (b - a);
  const settings = () => JJK.settings || {};

  let live = null; // live engine (created by unlock)
  const unlockFns = [];
  const vol = { music: settings().musicVol != null ? settings().musicVol : 0.55, sfx: settings().sfxVol != null ? settings().sfxVol : 0.8 };
  const warned = {};
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = 1;
    try { console.warn('[JJK.Audio] ' + msg); } catch (e) {}
  }

  // ---------------------------------------------------------------- curves
  const curves = {};
  function tanhCurve(k) {
    k = Math.max(0.5, Math.round(k * 4) / 4);
    const key = 't' + k;
    if (curves[key]) return curves[key];
    const n = 2048, a = new Float32Array(n), nk = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      a[i] = Math.tanh(k * x) / nk;
    }
    return (curves[key] = a);
  }
  function crushCurve(bits) {
    const key = 'c' + bits;
    if (curves[key]) return curves[key];
    const n = 4096, a = new Float32Array(n), q = Math.pow(2, bits - 1);
    for (let i = 0; i < n; i++) a[i] = Math.round(((i / (n - 1)) * 2 - 1) * q) / q;
    return (curves[key] = a);
  }
  // Master soft clip: linear to 0.8, smooth knee to <1. Fed at half gain so
  // the curve covers inputs up to +-2.
  function clipCurve() {
    if (curves.clip) return curves.clip;
    const n = 4096, a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2, ax = Math.abs(x);
      const y = ax < 0.8 ? ax : 0.8 + 0.19 * Math.tanh((ax - 0.8) / 0.19);
      a[i] = x < 0 ? -y : y;
    }
    return (curves.clip = a);
  }

  // ---------------------------------------------------------------- buffers
  // Seamless loop: blend the head with the generated overhang.
  function loopable(gen, len, fade) {
    const raw = new Float32Array(len + fade);
    for (let i = 0; i < raw.length; i++) raw[i] = gen(i);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = raw[i];
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      out[i] = raw[i] * w + raw[len + i] * (1 - w);
    }
    return out;
  }
  function normalize(d, peak) {
    let m = 0;
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
    return d;
  }
  function makeNoise(c) {
    const sr = c.sampleRate, n = Math.floor(sr * 2), fade = Math.floor(sr * 0.02);
    const buf = (data) => {
      const b = c.createBuffer(1, data.length, sr);
      b.getChannelData(0).set(data);
      return b;
    };
    const white = new Float32Array(n);
    for (let i = 0; i < n; i++) white[i] = R() * 2 - 1;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    const pink = loopable(() => {
      const x = R() * 2 - 1;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
      b6 = x * 0.115926;
      return y;
    }, n, fade);
    let br = 0;
    const brown = loopable(() => {
      br = (br + 0.02 * (R() * 2 - 1)) / 1.02;
      return br;
    }, n, fade);
    // Crackle: sparse noisy pops of random size (fire, electricity, debris).
    const kn = Math.floor(sr * 3), crackle = new Float32Array(kn);
    for (let i = 0; i < kn;) {
      i += Math.floor(sr * (0.002 + Math.pow(R(), 2) * 0.028));
      if (i >= kn) break;
      const big = R() < 0.12;
      const amp = (big ? 0.6 + R() * 0.4 : 0.08 + Math.pow(R(), 2) * 0.5) * (R() < 0.5 ? -1 : 1);
      const tau = big ? rr(8, 40) : rr(2, 12), len = Math.floor(tau * 6);
      for (let j = 0; j < len && i + j < kn; j++) crackle[i + j] += amp * Math.exp(-j / tau) * (R() * 1.6 - 0.8 + (j === 0 ? 1 : 0));
    }
    return {
      white: buf(white),
      pink: buf(normalize(pink, 0.95)),
      brown: buf(normalize(brown, 0.95)),
      crackle: buf(normalize(crackle, 0.95)),
    };
  }
  // Generated stereo impulse response: early reflections + darkening tail.
  function makeIR(c, sec, decay, bright) {
    sec = sec || 2.6; decay = decay || 2.2; bright = bright == null ? 0.7 : bright;
    const sr = c.sampleRate, len = Math.floor(sr * sec), b = c.createBuffer(2, len, sr);
    const pre = Math.floor(sr * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let k = 0; k < 12; k++) {
        const i = pre + Math.floor(sr * (0.003 + R() * 0.075));
        if (i < len) d[i] += (R() * 2 - 1) * 0.5 * (1 - k / 14);
      }
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const a = bright * Math.exp(-t * 1.8) + 0.05;
        lp += a * (R() * 2 - 1 - lp);
        d[i] += lp * Math.exp((-t * 6.9) / decay) * (t < 0.025 ? t / 0.025 : 1);
      }
    }
    return b;
  }

  // ---------------------------------------------------------------- engine
  function makeEngine(c, raw) {
    const E = { ctx: c, live: false, raw: !!raw, nyq: c.sampleRate * 0.45, active: 0 };
    E.maxF = Math.min(20000, c.sampleRate * 0.45);
    E.buf = makeNoise(c);
    E.ir = makeIR(c, 2.8, 2.4, 0.75);
    const g = (x) => {
      const n = c.createGain();
      n.gain.value = x;
      return n;
    };
    E.mix = g(1);
    E.hush = g(1);
    E.sfx = g(vol.sfx);
    E.music = g(vol.music);
    E.bypass = g(vol.sfx);
    E.sfx.connect(E.hush);
    E.music.connect(E.hush);
    E.hush.connect(E.mix);
    E.bypass.connect(E.mix);
    const verb = (out) => {
      const inp = g(1), hp = c.createBiquadFilter(), cv = c.createConvolver(), ret = g(0.85);
      hp.type = 'highpass';
      hp.frequency.value = 220;
      cv.buffer = E.ir;
      inp.connect(hp); hp.connect(cv); cv.connect(ret); ret.connect(out);
      return inp;
    };
    E.rev = verb(E.sfx);
    E.revB = verb(E.bypass);
    if (raw) {
      E.mix.connect(c.destination);
      return E;
    }
    E.muffle = c.createBiquadFilter();
    E.muffle.type = 'lowpass';
    E.muffle.frequency.value = E.maxF;
    E.muffle.Q.value = 0.5;
    const pre = g(0.8);
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -12; glue.knee.value = 8; glue.ratio.value = 2.5;
    glue.attack.value = 0.004; glue.release.value = 0.22;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.001; lim.release.value = 0.1;
    // Chrome compressors start fully clamped and release from there; a near-
    // zero release for the first 50ms keeps the very first sound at full level.
    [[glue, 0.22], [lim, 0.1]].forEach(([n, rel]) => {
      n.release.setValueAtTime(0.001, c.currentTime);
      n.release.setValueAtTime(rel, c.currentTime + 0.05);
    });
    const half = g(0.5), clip = c.createWaveShaper();
    clip.curve = clipCurve();
    E.master = g(1);
    E.mix.connect(E.muffle); E.muffle.connect(pre); pre.connect(glue); glue.connect(lim);
    lim.connect(half); half.connect(clip); clip.connect(E.master); E.master.connect(c.destination);
    E.glue = glue; E.limiter = lim;
    return E;
  }

  // ---------------------------------------------------------------- synth core
  // A voice is one sound instance: out gain (+pan, +reverb send). Layer times
  // and frequencies are nominal and get scaled by opts.pitch (playback-rate
  // style: freq * p, time / p).
  function voice(E, o) {
    o = o || {};
    const c = E.ctx, p = clamp(+o.pitch || 1, 0.25, 4);
    const v = { E, c, p, ts: 1 / p, nyq: E.nyq, end: 0, send: null, extra: null, nc: !!o.nocount };
    v.t0 = o.when != null ? o.when : c.currentTime + 0.003 + (+o.delay || 0);
    v.out = c.createGain();
    v.out.gain.value = o.vol != null ? Math.max(0, +o.vol || 0) : 1;
    let head = v.out;
    if (o.pan && c.createStereoPanner) {
      v.pn = c.createStereoPanner();
      v.pn.pan.value = clamp(+o.pan || 0, -1, 1);
      head.connect(v.pn);
      head = v.pn;
    }
    v.head = head;
    v.revDest = o.revDest || (o.bypassHush ? E.revB : E.rev);
    head.connect(o.dest || (o.bypassHush ? E.bypass : E.sfx));
    v.verb = (amt) => {
      if (!v.send) {
        v.send = c.createGain();
        head.connect(v.send);
        v.send.connect(v.revDest);
      }
      v.send.gain.value = amt;
      return v;
    };
    return v;
  }
  const T = (v, t) => v.t0 + t * v.ts;
  function mark(v, t) {
    if (t > v.end) v.end = t;
  }
  function keep(v, n) {
    (v.extra || (v.extra = [])).push(n);
    return n;
  }
  // Automate a param. spec: number | [[t, value, mode?], ...] (mode 'l' linear,
  // 's' step, default exponential). Values are multiplied by mul, clamped to max.
  function setP(v, prm, spec, t, mul, max) {
    max = max || 1e9;
    const lim = (x) => (x > max ? max : x < -max ? -max : x);
    if (typeof spec === 'number') {
      prm.setValueAtTime(lim(spec * mul), T(v, t));
      return;
    }
    let prev = null;
    for (let i = 0; i < spec.length; i++) {
      const pt = spec[i], at = T(v, t + pt[0]), val = lim(pt[1] * mul);
      if (prev === null || pt[2] === 's') prm.setValueAtTime(val, at);
      else if (pt[2] === 'l' || val <= 0 || prev <= 0) prm.linearRampToValueAtTime(val, at);
      else prm.exponentialRampToValueAtTime(val, at);
      prev = val;
    }
  }
  // Amplitude envelope: o.env points, or attack/hold/decay (exp decay to -60dB).
  function envelope(v, prm, o, t) {
    const mul = o.g != null ? o.g : 1;
    if (o.env) {
      const e = o.env;
      let prev = null;
      for (let i = 0; i < e.length; i++) {
        const at = T(v, t + e[i][0]), val = e[i][1] * mul;
        if (prev === null) prm.setValueAtTime(val, at);
        else if (val <= 0 || prev <= 0) prm.linearRampToValueAtTime(val, at);
        else prm.exponentialRampToValueAtTime(val, at);
        prev = val;
      }
      return t + e[e.length - 1][0];
    }
    const a = o.a != null ? o.a : 0.002, h = o.h || 0, d = o.d != null ? o.d : 0.2, g = o.g != null ? o.g : 0.5;
    prm.setValueAtTime(0, T(v, t));
    prm.linearRampToValueAtTime(g, T(v, t + a));
    if (h > 0) prm.setValueAtTime(g, T(v, t + a + h));
    if (o.lin) prm.linearRampToValueAtTime(0, T(v, t + a + h + d));
    else prm.exponentialRampToValueAtTime(g * 0.001 + 1e-7, T(v, t + a + h + d));
    return t + a + h + d;
  }
  // One synthesis layer: source (osc / noise buffer) -> filters -> drive -> AM
  // -> envelope gain (-> pan) -> destination.
  //  o: {src, f, det, wave, rate, fm:{f,i,type}, fl:{type,f,Q}|[...], dist,
  //      am:{f,d,type}, t, a, h, d, g, env, lin, pan, to}
  function L(v, o) {
    const c = v.c, t = o.t || 0, kind = o.src || 'sine', mods = [];
    let src;
    if (v.E.buf[kind]) {
      src = c.createBufferSource();
      src.buffer = v.E.buf[kind];
      src.loop = true;
      setP(v, src.playbackRate, o.rate || 1, t, v.p);
    } else {
      src = c.createOscillator();
      if (o.wave) src.setPeriodicWave(o.wave);
      else src.type = kind;
      setP(v, src.frequency, o.f != null ? o.f : 440, t, v.p, v.nyq);
      if (o.det) src.detune.value = o.det;
      if (o.fm) {
        const m = c.createOscillator(), mg = c.createGain();
        m.type = o.fm.type || 'sine';
        setP(v, m.frequency, o.fm.f, t, v.p, v.nyq);
        mg.gain.value = 0;
        setP(v, mg.gain, o.fm.i, t, v.p);
        m.connect(mg);
        mg.connect(src.frequency);
        mods.push(m);
      }
    }
    let node = src;
    if (o.fl) {
      const fls = Array.isArray(o.fl) ? o.fl : [o.fl];
      for (let i = 0; i < fls.length; i++) {
        const f = fls[i], b = c.createBiquadFilter();
        b.type = f.type || 'lowpass';
        setP(v, b.frequency, f.f, t, v.p, v.nyq);
        if (f.Q != null) setP(v, b.Q, f.Q, t, 1);
        if (f.gain != null) b.gain.value = f.gain;
        node.connect(b);
        node = b;
      }
    }
    if (o.dist) {
      const ws = c.createWaveShaper();
      ws.curve = tanhCurve(o.dist);
      node.connect(ws);
      node = ws;
    }
    if (o.am) {
      const ag = c.createGain(), lf = c.createOscillator(), lg = c.createGain();
      const dp = o.am.d != null ? o.am.d : 0.5;
      ag.gain.value = 1 - dp; // dp = 1 -> true ring modulation
      lg.gain.value = dp;
      lf.type = o.am.type || 'sine';
      setP(v, lf.frequency, o.am.f, t, v.p, v.nyq);
      lf.connect(lg);
      lg.connect(ag.gain);
      node.connect(ag);
      node = ag;
      mods.push(lf);
    }
    const g = c.createGain();
    g.gain.value = 0;
    node.connect(g);
    let out = g;
    if (o.pan && c.createStereoPanner) {
      const pn = c.createStereoPanner();
      pn.pan.value = clamp(o.pan, -1, 1);
      g.connect(pn);
      out = pn;
    }
    out.connect(o.to || v.out);
    const end = envelope(v, g.gain, o, t);
    const t0 = T(v, t), stopAt = T(v, end) + 0.03;
    if (src.buffer) src.start(t0, R() * (src.buffer.duration - 0.05));
    else src.start(t0);
    src.stop(stopAt);
    for (let i = 0; i < mods.length; i++) {
      mods[i].start(t0);
      mods[i].stop(stopAt);
    }
    mark(v, end + 0.03);
    return { src, g, out, node };
  }
  // Feedback comb (hollow tube resonance); delay spec in seconds.
  function comb(v, dspec, fb, to) {
    const c = v.c, inp = c.createGain(), dl = c.createDelay(0.25), fg = c.createGain();
    fg.gain.value = fb;
    setP(v, dl.delayTime, dspec, 0, v.ts, 0.25);
    inp.connect(dl); dl.connect(fg); fg.connect(dl); dl.connect(to || v.out);
    keep(v, inp); keep(v, dl); keep(v, fg);
    return inp;
  }
  function shaper(v, curve, to) {
    const ws = v.c.createWaveShaper();
    ws.curve = curve;
    ws.connect(to || v.out);
    return keep(v, ws);
  }
  function disconnectVoice(v) {
    try {
      v.out.disconnect();
      if (v.pn) v.pn.disconnect();
      if (v.send) v.send.disconnect();
      if (v.extra) v.extra.forEach((n) => n.disconnect());
    } catch (e) {}
  }
  // Schedule cleanup once the voice has rung out (live engine only). E.active
  // counts SFX voices (music notes pass nocount) for the runaway-spam cap.
  function finish(v) {
    const E = v.E;
    if (!E.live) return v;
    if (!v.nc) E.active++;
    const ms = Math.max(60, (T(v, v.end) - v.c.currentTime + 0.3) * 1000);
    setTimeout(() => {
      if (!v.nc) E.active--;
      disconnectVoice(v);
    }, ms);
    return v;
  }
  function hold(prm, t) {
    if (prm.cancelAndHoldAtTime) {
      try {
        prm.cancelAndHoldAtTime(t);
        return;
      } catch (e) {}
    }
    const val = prm.value;
    prm.cancelScheduledValues(t);
    prm.setValueAtTime(val, t);
  }

  // ---------------------------------------------------------------- building blocks
  function click(v, t, g, f, d) {
    L(v, { src: 'white', t, fl: { type: 'highpass', f: f || 3000 }, a: 0.0005, d: d || 0.012, g });
  }
  // Sine body with a fast pitch drop.
  function thump(v, t, f0, f1, d, g, pd) {
    L(v, { src: 'sine', t, f: [[0, f0], [pd || Math.min(0.09, d * 0.4), f1]], a: 0.0015, d, g });
  }
  function swoosh(v, t, f0, f1, f2, a, d, g, Q, kind) {
    L(v, { src: kind || 'white', t, fl: { type: 'bandpass', f: [[0, f0], [a, f1], [a + d, f2]], Q: Q || 1.2 }, a, d, g, lin: true });
  }
  // Reverse swell: exponential rise then a hard stop.
  function swell(v, t, dur, g, kind, type, f0, f1, Q) {
    L(v, { src: kind, t, fl: { type, f: [[0, f0], [dur, f1]], Q: Q == null ? 1 : Q }, env: [[0, g * 0.002], [dur, g], [dur + 0.03, g * 0.001]] });
  }
  // Metallic ring from inharmonic partials; higher partials decay faster.
  function ring(v, t, f, rs, gs, d, shimmer) {
    for (let i = 0; i < rs.length; i++) {
      L(v, {
        src: 'sine', t, f: f * rs[i], a: 0.001, d: d / (1 + i * 0.6), g: gs[Math.min(i, gs.length - 1)],
        am: shimmer ? { f: 6 + i * 3.7, d: 0.35 } : null, pan: i % 2 ? 0.2 : -0.2,
      });
    }
  }
  // Glass shards: scattered high tinks, denser at the start.
  function shards(v, t, n, spread, f0, f1, g) {
    for (let i = 0; i < n; i++) {
      const dt = spread * Math.pow(R(), 1.6), f = rr(f0, f1), k = g * rr(0.4, 1) * (1 - dt / (spread * 1.5));
      L(v, { src: 'sine', t: t + dt, f: [[0, f], [0.1, f * rr(0.97, 1.02)]], a: 0.0005, d: rr(0.04, 0.22), g: k, pan: rr(-0.7, 0.7) });
      if (i % 2 === 0) L(v, { src: 'sine', t: t + dt, f: f * 2.43, a: 0.0005, d: 0.04, g: k * 0.4 });
      if (i % 3 === 0) L(v, { src: 'white', t: t + dt, fl: { type: 'bandpass', f: Math.min(f * 1.3, 12000), Q: 6 }, a: 0.0005, d: 0.02, g: k * 1.6 });
    }
  }
  // Stone / rock debris clatter.
  function rubble(v, t, n, spread, g) {
    for (let i = 0; i < n; i++) {
      const dt = spread * Math.pow(R(), 1.3), f = rr(700, 3800), k = g * rr(0.5, 1.4) * (1 - dt / (spread * 1.6));
      L(v, { src: 'white', t: t + dt, fl: { type: 'bandpass', f, Q: rr(2, 5) }, a: 0.0005, d: rr(0.015, 0.05), g: k * 2.2, pan: rr(-0.6, 0.6) });
      if (R() < 0.4) L(v, { src: 'sine', t: t + dt, f: f * 0.3, a: 0.0005, d: 0.03, g: k * 0.5 });
    }
  }
  // Electric arc: jittering square through a band + drive.
  function zap(v, t, d, g) {
    const o = L(v, { src: 'square', f: 900, t, fl: { type: 'bandpass', f: [[0, 3500], [d, 1500]], Q: 1.2 }, dist: 6, a: 0.001, h: d * 0.3, d: d * 0.7, g });
    for (let x = 0.006; x < d; x += rr(0.006, 0.022)) o.src.frequency.setValueAtTime(Math.min(v.nyq, rr(60, 1800) * v.p), T(v, t + x));
  }
  // Big explosion; s = size (0.5 burst .. 1.4 catastrophic).
  function boom(v, t, s) {
    click(v, t, 0.8, 1400, 0.025);
    thump(v, t, 120 + 40 * s, 30 - 6 * s, 0.5 + 0.9 * s, 0.9, 0.12);
    L(v, { src: 'white', t, fl: { type: 'bandpass', f: [[0, 1200], [0.3, 350]], Q: 0.6 }, dist: 8, a: 0.0005, d: 0.25 + 0.2 * s, g: 0.42 });
    L(v, { src: 'brown', t, fl: { type: 'lowpass', f: [[0, 3200], [0.5 + s, 150]] }, dist: 2.5, a: 0.004, h: 0.05 * s, d: 0.6 + 1.1 * s, g: 0.6 });
    L(v, { src: 'crackle', t: t + 0.05, rate: 0.8, fl: { type: 'bandpass', f: 2400, Q: 0.7 }, a: 0.05, d: 0.5 + 0.8 * s, g: 0.3 + 0.1 * s });
    v.verb(0.22 + 0.2 * s);
  }

  // ---------------------------------------------------------------- SFX
  const S = {};

  // UI ---------------------------------------------------------------
  S.ui_move = (v) => {
    L(v, { src: 'triangle', f: [[0, 1900], [0.03, 1500]], a: 0.001, d: 0.035, g: 0.3 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: 5000, Q: 2 }, a: 0.0005, d: 0.012, g: 0.2 });
  };
  S.ui_select = (v) => {
    [[0, 988], [0.055, 1480]].forEach(([t, f]) => {
      L(v, { src: 'square', t, f, a: 0.002, d: 0.14, g: 0.13, fl: { type: 'lowpass', f: [[0, 6000], [0.12, 1800]] } });
      L(v, { src: 'sine', t, f: f * 2, a: 0.002, d: 0.22, g: 0.08 });
    });
    L(v, { src: 'white', t: 0.055, fl: { type: 'highpass', f: 6000 }, a: 0.001, d: 0.06, g: 0.08 });
    v.verb(0.15);
  };
  S.ui_back = (v) => {
    [[0, 740], [0.06, 494]].forEach(([t, f]) => L(v, { src: 'triangle', t, f: [[0, f], [0.08, f * 0.97]], a: 0.002, d: 0.11, g: 0.28, fl: { type: 'lowpass', f: 3000 } }));
    v.verb(0.08);
  };
  S.ui_start = (v) => {
    thump(v, 0, 140, 38, 0.6, 0.6);
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 2500], [0.8, 6000]] }, a: 0.002, d: 0.9, g: 0.16 });
    [146.8, 220, 293.7, 370, 440, 587.3].forEach((f) => [-9, 9].forEach((det) =>
      L(v, { src: 'sawtooth', f, det, a: 0.005, h: 0.05, d: 0.9, g: 0.045, fl: { type: 'lowpass', f: [[0, 7000], [0.5, 900]], Q: 2 } })));
    L(v, { src: 'sine', f: [[0, 1200], [0.12, 3520]], a: 0.002, d: 0.6, g: 0.09, am: { f: 18, d: 0.4 } });
    L(v, { src: 'square', t: 0.12, f: 1760, a: 0.002, d: 0.5, g: 0.035, fl: { type: 'lowpass', f: 5000 } });
    v.verb(0.35);
  };
  S.ui_error = (v) => {
    [0, 0.11].forEach((t) => [155, 164].forEach((f) =>
      L(v, { src: 'square', t, f, a: 0.002, h: 0.05, d: 0.06, g: 0.13, fl: { type: 'lowpass', f: 1400 } })));
  };

  // Movement ---------------------------------------------------------
  S.step = (v) => {
    const k = rr(0.9, 1.12);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: 500 * k }, a: 0.002, d: 0.07, g: 0.45 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: 2600 * k, Q: 1.2 }, a: 0.001, d: 0.025, g: 0.14 });
    thump(v, 0, 110 * k, 60, 0.06, 0.25);
  };
  S.jump = (v) => {
    thump(v, 0, 130, 70, 0.08, 0.35);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 500], [0.18, 1800]], Q: 1.4 }, a: 0.03, d: 0.16, g: 0.35, lin: true });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: 700 }, a: 0.002, d: 0.06, g: 0.3 });
  };
  S.land = (v) => {
    thump(v, 0, 105, 42, 0.16, 0.65);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 900], [0.12, 200]] }, a: 0.002, d: 0.14, g: 0.5 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: 1800, Q: 0.9 }, a: 0.001, d: 0.06, g: 0.16 });
    L(v, { src: 'white', t: 0.02, fl: { type: 'highpass', f: 3000 }, a: 0.02, d: 0.2, g: 0.05 });
  };
  S.dash = (v) => {
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 700], [0.05, 2600], [0.22, 600]], Q: 1.1 }, a: 0.012, d: 0.22, g: 0.5 });
    L(v, { src: 'pink', fl: { type: 'lowpass', f: 600 }, a: 0.004, d: 0.1, g: 0.35 });
    thump(v, 0, 90, 50, 0.07, 0.4);
  };
  S.airdash = (v) => {
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 1200], [0.04, 4200], [0.2, 1000]], Q: 1.3 }, a: 0.008, d: 0.2, g: 0.45 });
    L(v, { src: 'sine', f: [[0, 900], [0.08, 2400]], a: 0.004, d: 0.1, g: 0.05 });
    L(v, { src: 'pink', fl: { type: 'bandpass', f: 500, Q: 0.8 }, a: 0.003, d: 0.08, g: 0.3 });
  };
  S.teleport = (v) => {
    const crush = shaper(v, crushCurve(5));
    L(v, { src: 'sine', f: [[0, 300], [0.05, 2600], [0.11, 180]], fm: { f: 37, i: [[0, 60], [0.1, 400]] }, a: 0.002, h: 0.06, d: 0.06, g: 0.3, to: crush });
    L(v, { src: 'square', f: [[0, 150], [0.05, 1300], [0.11, 90]], fl: { type: 'lowpass', f: 3500 }, a: 0.002, h: 0.04, d: 0.06, g: 0.07, to: crush });
    [2637, 3520, 4186, 5274].forEach((f, i) =>
      L(v, { src: 'sine', t: 0.04 + i * 0.012, f: f * rr(0.99, 1.01), a: 0.003, d: 0.4, g: 0.05, am: { f: 21 + i * 4, d: 0.5 }, pan: i % 2 ? 0.5 : -0.5 }));
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 9000], [0.12, 3000]] }, a: 0.04, d: 0.08, g: 0.14 });
    thump(v, 0.09, 80, 45, 0.08, 0.3);
    v.verb(0.2);
  };

  // Whiffs -----------------------------------------------------------
  // Whiffs: broad air body + a narrow resonant "whistle" riding the same sweep.
  S.whiff_l = (v) => {
    swoosh(v, 0, 1500, 3800, 1600, 0.025, 0.09, 0.38, 1.0);
    swoosh(v, 0, 2200, 5200, 2000, 0.025, 0.08, 0.3, 5);
  };
  S.whiff_m = (v) => {
    swoosh(v, 0, 900, 2800, 900, 0.04, 0.14, 0.42, 0.9);
    swoosh(v, 0, 1400, 3600, 1100, 0.04, 0.12, 0.3, 4.5);
    swoosh(v, 0.01, 300, 700, 300, 0.04, 0.12, 0.3, 0.9, 'pink');
  };
  S.whiff_h = (v) => {
    swoosh(v, 0, 400, 1700, 350, 0.07, 0.24, 0.5, 0.9);
    swoosh(v, 0, 700, 2400, 500, 0.07, 0.22, 0.32, 4);
    swoosh(v, 0, 150, 450, 120, 0.08, 0.25, 0.45, 0.8, 'brown');
    L(v, { src: 'sine', f: [[0, 60], [0.1, 85], [0.3, 50]], a: 0.07, d: 0.22, g: 0.18 });
  };

  // Impacts ----------------------------------------------------------
  S.hit_l = (v) => {
    click(v, 0, 0.5, 3000, 0.012);
    thump(v, 0, 190, 75, 0.09, 0.6);
    L(v, { src: 'white', fl: { type: 'bandpass', f: 1400, Q: 0.8 }, dist: 3, a: 0.001, d: 0.06, g: 0.28 });
    L(v, { src: 'square', f: [[0, 520], [0.03, 260]], fl: { type: 'lowpass', f: 2500 }, a: 0.0005, d: 0.035, g: 0.08 });
    v.verb(0.08);
  };
  S.hit_m = (v) => {
    click(v, 0, 0.6, 2500, 0.016);
    thump(v, 0, 160, 55, 0.17, 0.72);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 1200], [0.1, 600]], Q: 0.7 }, dist: 5, a: 0.001, d: 0.1, g: 0.32 });
    L(v, { src: 'pink', fl: { type: 'lowpass', f: 1200 }, a: 0.001, d: 0.12, g: 0.3 });
    v.verb(0.12);
  };
  S.hit_h = (v) => {
    click(v, 0, 0.7, 2000, 0.02);
    thump(v, 0, 140, 44, 0.3, 0.75);
    thump(v, 0, 62, 34, 0.45, 0.45);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 900], [0.16, 380]], Q: 0.6 }, dist: 7, a: 0.001, d: 0.17, g: 0.36 });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 1600], [0.2, 300]] }, a: 0.002, d: 0.22, g: 0.4 });
    v.verb(0.18);
  };
  S.hit_counter = (v) => {
    S.hit_h(v);
    ring(v, 0, 1650, [1, 2.32, 4.25, 6.63], [0.12, 0.08, 0.05, 0.03], 0.75);
    L(v, { src: 'sawtooth', f: [[0, 2400], [0.12, 3200]], fl: { type: 'highpass', f: 2000 }, a: 0.002, d: 0.18, g: 0.04 });
    v.verb(0.25);
  };
  S.hit_super = (v) => {
    click(v, 0, 0.8, 1800, 0.025);
    thump(v, 0, 170, 48, 0.35, 0.7);
    thump(v, 0, 75, 26, 0.9, 0.6, 0.16);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 1000], [0.3, 300]], Q: 0.6 }, dist: 10, a: 0.001, d: 0.32, g: 0.36 });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 2600], [0.8, 160]] }, dist: 2, a: 0.003, d: 0.9, g: 0.45 });
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 4000], [0.6, 7000]] }, a: 0.003, d: 0.6, g: 0.1 });
    ring(v, 0, 2100, [1, 2.76, 5.4], [0.06, 0.04, 0.02], 0.6);
    v.verb(0.32);
  };
  S.block = (v) => {
    click(v, 0, 0.35, 4000, 0.006);
    thump(v, 0, 240, 150, 0.07, 0.5, 0.03);
    L(v, { src: 'white', fl: { type: 'bandpass', f: 520, Q: 1.8 }, a: 0.001, d: 0.06, g: 0.5 });
    L(v, { src: 'pink', fl: { type: 'lowpass', f: 350 }, a: 0.002, d: 0.08, g: 0.35 });
    v.verb(0.06);
  };
  S.block_heavy = (v) => {
    click(v, 0, 0.45, 3500, 0.01);
    thump(v, 0, 190, 95, 0.15, 0.65, 0.05);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 450], [0.1, 300]], Q: 1.4 }, dist: 2, a: 0.001, d: 0.11, g: 0.4 });
    L(v, { src: 'white', t: 0.02, fl: { type: 'bandpass', f: [[0, 3000], [0.25, 1800]], Q: 1.5 }, a: 0.02, d: 0.22, g: 0.1 });
    thump(v, 0, 70, 45, 0.2, 0.35);
    v.verb(0.1);
  };
  S.perfect_guard = (v) => {
    click(v, 0, 0.3, 6000, 0.005);
    thump(v, 0, 300, 160, 0.06, 0.35, 0.02);
    ring(v, 0, 2637, [1, 1.5, 2, 3.01], [0.12, 0.08, 0.07, 0.03], 1.0, true);
    L(v, { src: 'white', fl: { type: 'highpass', f: 9000 }, a: 0.002, d: 0.5, g: 0.06 });
    v.verb(0.4);
  };
  S.parry = (v) => {
    click(v, 0, 0.5, 3000, 0.008);
    L(v, { src: 'sine', f: 1180, fm: { f: 1180 * 1.414, i: [[0, 2600], [0.25, 50]] }, a: 0.001, d: 0.38, g: 0.2 });
    L(v, { src: 'sine', f: 2490, fm: { f: 2490 * 2.21, i: [[0, 1800], [0.15, 30]] }, a: 0.001, d: 0.22, g: 0.1 });
    swell(v, 0.03, 0.26, 0.3, 'white', 'bandpass', 1200, 5000, 2);
    L(v, { src: 'sine', t: 0.03, f: [[0, 880], [0.26, 1760]], env: [[0, 0.0005], [0.26, 0.1], [0.29, 0.0001]] });
    v.verb(0.3);
  };
  S.guard_break = (v) => {
    click(v, 0, 0.8, 1500, 0.02);
    L(v, { src: 'square', f: [[0, 260], [0.08, 60]], fl: { type: 'lowpass', f: 3000 }, dist: 6, a: 0.001, d: 0.1, g: 0.22 });
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 1500], [0.3, 4000]] }, dist: 3, a: 0.001, d: 0.3, g: 0.26 });
    thump(v, 0, 130, 38, 0.35, 0.7);
    shards(v, 0.01, 18, 0.35, 2500, 8000, 0.08);
    v.verb(0.35);
  };
  S.throw_grab = (v) => {
    [0, 0.045].forEach((t, i) => L(v, { src: 'pink', t, fl: { type: 'bandpass', f: 1800 - i * 500, Q: 0.9 }, am: { f: 55, d: 0.6, type: 'square' }, a: 0.004, d: 0.1, g: 0.5 }));
    thump(v, 0.03, 140, 80, 0.07, 0.4);
    L(v, { src: 'white', fl: { type: 'highpass', f: 5000 }, a: 0.002, d: 0.05, g: 0.1 });
  };
  S.throw_tech = (v) => {
    [0, 0.022].forEach((t) => {
      click(v, t, 0.45, 2500, 0.01);
      L(v, { src: 'white', t, fl: { type: 'bandpass', f: 1600, Q: 1.3 }, a: 0.0008, d: 0.06, g: 0.5 });
      thump(v, t, 260, 140, 0.05, 0.3);
    });
    L(v, { src: 'sine', f: 1460, fm: { f: 1460 * 1.53, i: [[0, 1400], [0.2, 20]] }, a: 0.001, d: 0.3, g: 0.12 });
    swoosh(v, 0.03, 2400, 1200, 600, 0.02, 0.18, 0.15, 1);
    v.verb(0.2);
  };
  S.throw_slam = (v) => {
    click(v, 0, 0.6, 1800, 0.02);
    thump(v, 0, 115, 34, 0.45, 0.75);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 1200], [0.35, 200]] }, a: 0.002, d: 0.38, g: 0.5 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 700], [0.15, 400]], Q: 0.8 }, dist: 6, a: 0.001, d: 0.15, g: 0.32 });
    rubble(v, 0.04, 8, 0.4, 0.06);
    v.verb(0.22);
  };
  S.knockdown = (v) => {
    thump(v, 0, 100, 38, 0.32, 0.72);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 1300], [0.25, 260]] }, a: 0.002, d: 0.26, g: 0.45 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: 2100, Q: 1 }, dist: 3, a: 0.001, d: 0.08, g: 0.2 });
    thump(v, 0.15, 85, 40, 0.18, 0.35);
    L(v, { src: 'brown', t: 0.15, fl: { type: 'lowpass', f: 700 }, a: 0.002, d: 0.12, g: 0.25 });
    rubble(v, 0.02, 5, 0.3, 0.04);
    v.verb(0.15);
  };
  S.wall_bounce = (v) => {
    click(v, 0, 0.7, 1500, 0.02);
    L(v, { src: 'square', f: [[0, 320], [0.06, 70]], fl: { type: 'lowpass', f: 4000 }, dist: 8, a: 0.0005, d: 0.08, g: 0.18 });
    L(v, { src: 'white', fl: { type: 'highpass', f: 1200 }, dist: 4, a: 0.0005, d: 0.09, g: 0.26 });
    thump(v, 0, 85, 28, 0.65, 0.75);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 900], [0.5, 140]] }, a: 0.003, d: 0.55, g: 0.5 });
    rubble(v, 0.05, 14, 0.7, 0.05);
    v.verb(0.3);
  };
  S.ground_bounce = (v) => {
    click(v, 0, 0.5, 1600, 0.015);
    thump(v, 0, 125, 38, 0.32, 0.75);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 1100], [0.3, 180]] }, a: 0.002, d: 0.32, g: 0.45 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: 1500, Q: 0.8 }, dist: 4, a: 0.001, d: 0.07, g: 0.22 });
    thump(v, 0.11, 95, 45, 0.15, 0.32);
    rubble(v, 0.03, 6, 0.35, 0.04);
    v.verb(0.2);
  };
  S.black_flash = (v) => {
    click(v, 0, 0.9, 1500, 0.03);
    thump(v, 0, 210, 46, 0.4, 0.7, 0.05);
    thump(v, 0, 70, 22, 1.3, 0.6, 0.25);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 1100], [0.3, 280]], Q: 0.6 }, dist: 14, a: 0.0005, d: 0.32, g: 0.38 });
    // black lightning: ring-modulated crackle + arcing zaps
    L(v, { src: 'crackle', rate: 1.6, fl: { type: 'highpass', f: 1800 }, am: { f: 2900, d: 1, type: 'square' }, dist: 4, a: 0.001, h: 0.15, d: 0.55, g: 0.35 });
    zap(v, 0, 0.5, 0.16);
    zap(v, 0.08, 0.35, 0.1);
    // dark growl undertone + inverted suck tail
    L(v, { src: 'sawtooth', f: [[0, 82], [0.8, 41]], fl: { type: 'lowpass', f: [[0, 900], [0.8, 200]] }, dist: 5, am: { f: 31, d: 0.6 }, a: 0.005, d: 0.85, g: 0.22 });
    swell(v, 0.25, 0.4, 0.12, 'white', 'bandpass', 600, 3500, 1.5);
    v.verb(0.35);
  };
  S.ko_hit = (v) => {
    click(v, 0, 0.9, 1600, 0.03);
    thump(v, 0, 180, 45, 0.45, 0.72, 0.06);
    thump(v, 0, 66, 21, 1.8, 0.6, 0.35);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 1100], [0.35, 300]], Q: 0.6 }, dist: 12, a: 0.0005, d: 0.38, g: 0.4 });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 3000], [1.4, 120]] }, dist: 2, a: 0.003, d: 1.5, g: 0.45 });
    ring(v, 0, 1320, [1, 2.76, 5.4, 8.9], [0.09, 0.06, 0.03, 0.015], 1.6);
    L(v, { src: 'white', fl: { type: 'highpass', f: 5000 }, a: 0.003, d: 1.0, g: 0.08 });
    v.verb(0.6);
  };

  // Gojo -------------------------------------------------------------
  S.infinity_on = (v) => {
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 2500], [0.45, 9000]], Q: 1.5 }, a: 0.3, d: 0.45, g: 0.2 });
    [1760, 2217, 2637, 3520, 4435].forEach((f, i) =>
      L(v, { src: 'sine', t: i * 0.03, f: [[0, f * 0.94], [0.5, f * 1.03]], a: 0.25, d: 0.6, g: 0.05, am: { f: 6 + i * 2.3, d: 0.5 }, pan: (i % 2 ? 1 : -1) * 0.4 }));
    L(v, { src: 'sine', f: 440, fm: { f: 660, i: 120 }, a: 0.2, d: 0.5, g: 0.05 });
    v.verb(0.5);
  };
  S.infinity_off = (v) => {
    [3520, 2637, 2217, 1760].forEach((f, i) =>
      L(v, { src: 'sine', t: i * 0.02, f: [[0, f], [0.4, f * 0.82]], a: 0.01, d: 0.4, g: 0.05, am: { f: 9 + i * 3, d: 0.5 } }));
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 8000], [0.4, 2000]], Q: 1.5 }, a: 0.01, d: 0.4, g: 0.16 });
    v.verb(0.35);
  };
  S.infinity_stop = (v) => {
    // the blow decelerates into nothing: sinking hollow-tube resonance
    const cb = comb(v, [[0, 1 / 320], [0.7, 1 / 95]], 0.82);
    L(v, { src: 'sawtooth', f: [[0, 330], [0.7, 85]], fl: { type: 'lowpass', f: [[0, 3000], [0.7, 500]] }, am: { f: [[0, 28], [0.7, 3]], d: 0.5 }, a: 0.01, d: 0.75, g: 0.14, to: cb });
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 2500], [0.7, 400]], Q: 2 }, a: 0.004, d: 0.6, g: 0.2, to: cb });
    thump(v, 0, 140, 50, 0.6, 0.35, 0.5);
    click(v, 0, 0.25, 4000, 0.005);
    [1320, 1980].forEach((f) => L(v, { src: 'sine', f: [[0, f], [0.8, f * 0.5]], a: 0.05, d: 0.8, g: 0.035 }));
    mark(v, 1.1);
    v.verb(0.4);
  };
  S.infinity_break = (v) => {
    click(v, 0, 0.6, 2500, 0.01);
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 2000], [0.6, 5000]] }, a: 0.001, d: 0.6, g: 0.2 });
    shards(v, 0, 22, 0.55, 2800, 9000, 0.07);
    thump(v, 0.02, 220, 30, 0.7, 0.65, 0.5);
    L(v, { src: 'sine', f: [[0, 880], [0.6, 110]], a: 0.005, d: 0.6, g: 0.06 });
    v.verb(0.4);
  };
  S.blue_cast = (v) => {
    swell(v, 0, 0.25, 0.35, 'pink', 'bandpass', 3000, 250, 1.2);
    L(v, { src: 'sine', f: [[0, 220], [0.25, 55]], env: [[0, 0.001], [0.23, 0.3], [0.27, 0.0005]] });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: 140 }, a: 0.15, d: 0.2, g: 0.35 });
    thump(v, 0.25, 95, 30, 0.9, 0.7, 0.25);
    L(v, { src: 'brown', t: 0.23, fl: { type: 'lowpass', f: [[0, 400], [0.9, 90]] }, am: { f: 7, d: 0.5 }, a: 0.02, h: 0.2, d: 0.9, g: 0.5 });
    L(v, { src: 'sine', t: 0.25, f: 41, am: { f: 3.5, d: 0.6 }, a: 0.05, h: 0.3, d: 0.8, g: 0.35 });
    L(v, { src: 'sine', t: 0.25, f: [[0, 600], [1, 300]], fm: { f: 7, i: 80 }, a: 0.05, d: 0.9, g: 0.04 });
    v.verb(0.35);
  };
  S.blue_pull = (v) => {
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 3500], [0.4, 260]], Q: 1.6 }, env: [[0, 0.01], [0.36, 0.45], [0.45, 0.0005]] });
    L(v, { src: 'sine', f: [[0, 320], [0.42, 70]], env: [[0, 0.005], [0.36, 0.25], [0.45, 0.0005]] });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: 300 }, env: [[0, 0.01], [0.38, 0.4], [0.47, 0.0005]] });
    v.verb(0.2);
  };
  S.red_charge = (v) => {
    [1, 1.5, 2.02].forEach((m) =>
      L(v, { src: 'sawtooth', f: [[0, 160 * m], [0.5, 520 * m]], fl: { type: 'bandpass', f: [[0, 600], [0.5, 3000]], Q: 4 }, env: [[0, 0.005], [0.45, 0.12], [0.52, 0.0005]] }));
    L(v, { src: 'crackle', rate: [[0, 0.6], [0.5, 2.0]], fl: { type: 'highpass', f: 1500 }, env: [[0, 0.02], [0.45, 0.45], [0.52, 0.0005]] });
    L(v, { src: 'sine', f: [[0, 60], [0.5, 120]], env: [[0, 0.01], [0.45, 0.25], [0.52, 0.0005]] });
    v.verb(0.15);
  };
  S.red_shot = (v) => {
    click(v, 0, 0.7, 2000, 0.012);
    thump(v, 0, 320, 60, 0.18, 0.65, 0.05);
    L(v, { src: 'white', fl: { type: 'highpass', f: 1400 }, dist: 3, a: 0.0005, d: 0.12, g: 0.32 });
    L(v, { src: 'sawtooth', f: [[0, 1400], [0.12, 180]], fl: { type: 'lowpass', f: 5000 }, dist: 5, a: 0.0005, d: 0.13, g: 0.12 });
    swoosh(v, 0.02, 2600, 1800, 500, 0.02, 0.35, 0.25, 1.1);
    v.verb(0.2);
  };
  S.red_burst = (v) => {
    boom(v, 0, 0.5);
    L(v, { src: 'sawtooth', f: [[0, 900], [0.2, 120]], fl: { type: 'lowpass', f: 4000 }, dist: 6, a: 0.001, d: 0.2, g: 0.12 });
  };
  S.max_red = (v) => {
    boom(v, 0, 1.0);
    L(v, { src: 'sawtooth', f: [[0, 1200], [0.4, 90]], fl: { type: 'lowpass', f: [[0, 6000], [0.4, 800]] }, dist: 8, a: 0.001, d: 0.45, g: 0.14 });
    thump(v, 0, 48, 18, 1.6, 0.45, 0.6);
    v.verb(0.42);
  };
  S.purple_fire = (v) => {
    // surge: sub swell + rising detuned chord, then the roar at 0.28s
    L(v, { src: 'sine', f: [[0, 28], [0.28, 62]], env: [[0, 0.01], [0.28, 0.6], [0.5, 0.35], [1.8, 0.0005]] });
    [55, 82.4, 110, 164.8].forEach((f) => [-12, 12].forEach((det) =>
      L(v, { src: 'sawtooth', f: [[0, f * 0.75], [0.28, f]], det, fl: { type: 'lowpass', f: [[0, 200], [0.28, 2600], [1.6, 300]] }, dist: 2, env: [[0, 0.002], [0.28, 0.06], [1.7, 0.0005]] })));
    swell(v, 0, 0.28, 0.3, 'pink', 'bandpass', 200, 2000, 1);
    click(v, 0.28, 0.6, 1200, 0.03);
    thump(v, 0.28, 110, 32, 0.9, 0.65, 0.2);
    L(v, { src: 'pink', t: 0.28, fl: { type: 'bandpass', f: [[0, 500], [0.3, 1500], [1.6, 300]], Q: 0.7 }, dist: 6, am: { f: 17, d: 0.25 }, a: 0.02, h: 0.3, d: 1.3, g: 0.4 });
    L(v, { src: 'brown', t: 0.28, fl: { type: 'lowpass', f: [[0, 2000], [1.5, 150]] }, a: 0.02, h: 0.2, d: 1.4, g: 0.5 });
    [1318, 1976, 2637].forEach((f, i) =>
      L(v, { src: 'sine', t: 0.28, f: [[0, f], [1.2, f * 1.06]], a: 0.05, d: 1.2, g: 0.025, am: { f: 9 + i * 3, d: 0.6 } }));
    v.verb(0.4);
  };
  S.purple_impact = (v) => {
    boom(v, 0, 1.4);
    thump(v, 0, 60, 18, 2.2, 0.45, 0.8);
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 3000], [1.5, 8000]] }, a: 0.003, d: 1.8, g: 0.1 });
    [0.35, 0.8].forEach((t, i) => {
      thump(v, t, 90, 30, 0.6, 0.4 - i * 0.12, 0.2);
      L(v, { src: 'brown', t, fl: { type: 'lowpass', f: [[0, 1500], [0.6, 150]] }, dist: 3, a: 0.01, d: 0.7, g: 0.3 - i * 0.1 });
    });
    rubble(v, 0.2, 16, 1.6, 0.04);
    [440, 659, 880].forEach((f) => L(v, { src: 'sine', f: [[0, f], [2, f * 0.5]], a: 0.02, d: 2, g: 0.02, am: { f: 5, d: 0.5 } }));
    v.verb(0.55);
  };
  S.void_open = (v) => {
    // everything collapses inward (0..0.8), then a cosmic hum blooms
    swell(v, 0, 0.8, 0.35, 'white', 'bandpass', 6000, 300, 1.0);
    L(v, { src: 'sine', f: [[0, 880], [0.8, 55]], env: [[0, 0.002], [0.75, 0.2], [0.82, 0.0005]] });
    thump(v, 0.8, 70, 30, 1.0, 0.6, 0.4);
    [1, 2, 3, 4, 6, 8, 12, 16].forEach((h, i) => [0, 1].forEach((k) =>
      L(v, { src: 'sine', t: 0.8, f: 55 * h * (k ? 1.004 : 1), a: 0.15 + i * 0.05, h: 0.8, d: 2.2, g: (0.06 / Math.sqrt(h)) * (h > 6 ? 0.7 : 1), am: h >= 8 ? { f: 5 + i, d: 0.6 } : null, pan: k ? 0.3 : -0.3 })));
    [1760, 2640, 3520, 4400, 5280].forEach((f, i) =>
      L(v, { src: 'sine', t: 0.85 + i * 0.07, f: f * rr(0.995, 1.005), a: 0.2, d: 2.0, g: 0.022, am: { f: 11 + i * 3.3, d: 0.8 }, pan: rr(-0.8, 0.8) }));
    v.verb(0.6);
  };

  // Sukuna -----------------------------------------------------------
  S.dismantle = (v) => {
    L(v, { src: 'white', fl: [{ type: 'highpass', f: 3000 }, { type: 'bandpass', f: [[0, 9000], [0.06, 3500]], Q: 1.8 }], a: 0.002, d: 0.07, g: 0.75 });
    L(v, { src: 'sine', f: [[0, 7000], [0.05, 2800]], a: 0.001, d: 0.05, g: 0.1 });
    L(v, { src: 'sawtooth', f: [[0, 5200], [0.04, 2600]], fl: { type: 'highpass', f: 2000 }, a: 0.001, d: 0.035, g: 0.06 });
    click(v, 0, 0.25, 6000, 0.004);
    v.verb(0.12);
  };
  S.dismantle_hit = (v) => {
    click(v, 0, 0.55, 3000, 0.01);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 4500], [0.06, 2500]], Q: 1.5 }, a: 0.001, d: 0.06, g: 0.45 });
    thump(v, 0, 210, 90, 0.09, 0.5);
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 1500], [0.05, 700]], Q: 4 }, a: 0.002, d: 0.06, g: 0.5 });
    L(v, { src: 'sine', f: 4200 * rr(0.95, 1.05), a: 0.001, d: 0.12, g: 0.04 });
    v.verb(0.1);
  };
  S.cleave = (v) => {
    swoosh(v, 0, 600, 1400, 400, 0.03, 0.12, 0.3, 1);
    click(v, 0.03, 0.6, 1800, 0.015);
    thump(v, 0.03, 150, 52, 0.2, 0.72);
    L(v, { src: 'white', t: 0.03, fl: { type: 'bandpass', f: [[0, 700], [0.1, 450]], Q: 0.9 }, dist: 6, a: 0.001, d: 0.1, g: 0.38 });
    ring(v, 0.03, 2250, [1, 2.73, 5.12], [0.08, 0.05, 0.025], 0.6);
    v.verb(0.2);
  };
  S.cleave_hit = (v) => {
    S.hit_h(v);
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 1100], [0.04, 500], [0.1, 900]], Q: 5 }, a: 0.002, d: 0.12, g: 0.5 });
    ring(v, 0, 2250, [1, 2.73], [0.05, 0.03], 0.35);
  };
  S.fuga_fire = (v) => {
    click(v, 0, 0.4, 1500, 0.015);
    thump(v, 0, 200, 70, 0.15, 0.5);
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 400], [0.15, 1600], [1.0, 600]], Q: 0.8 }, dist: 4, am: { f: 19, d: 0.35, type: 'triangle' }, a: 0.03, h: 0.25, d: 0.8, g: 0.42 });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 600], [0.3, 1200], [1.0, 300]] }, a: 0.02, h: 0.2, d: 0.8, g: 0.5 });
    swoosh(v, 0.02, 400, 3200, 1200, 0.18, 0.35, 0.3, 1.0);
    L(v, { src: 'crackle', rate: 1.2, fl: { type: 'highpass', f: 1200 }, a: 0.05, h: 0.2, d: 0.7, g: 0.35 });
    thump(v, 0, 70, 50, 0.6, 0.3, 0.3);
    v.verb(0.3);
  };
  S.fuga_explode = (v) => {
    boom(v, 0, 1.1);
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 1800], [1.6, 400]], Q: 0.7 }, dist: 5, am: { f: 13, d: 0.3 }, a: 0.01, h: 0.3, d: 1.5, g: 0.3 });
    L(v, { src: 'crackle', t: 0.1, rate: 1.0, fl: { type: 'highpass', f: 900 }, a: 0.1, h: 0.5, d: 1.6, g: 0.4 });
    v.verb(0.45);
  };
  S.wcs_tear = (v) => {
    // instant shear: crack + huge sub
    click(v, 0, 1.0, 1200, 0.03);
    L(v, { src: 'white', fl: { type: 'highpass', f: 800 }, dist: 10, a: 0.0003, d: 0.06, g: 0.45 });
    thump(v, 0, 140, 18, 2.0, 0.65, 0.7);
    // ripping: a narrow band diving 9k -> 200 Hz, sawtooth-gated "rrrrip", plus a lower body rip
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 9000], [1.3, 200]], Q: 3 }, dist: 6, am: { f: [[0, 85], [1.3, 14]], d: 0.85, type: 'sawtooth' }, a: 0.003, h: 0.25, d: 1.2, g: 0.6 });
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 3500], [1.3, 90]], Q: 1.5 }, dist: 4, am: { f: [[0, 60], [1.3, 9]], d: 0.7, type: 'sawtooth' }, a: 0.003, h: 0.2, d: 1.2, g: 0.45 });
    // ring-mod artefacts
    L(v, { src: 'pink', fl: { type: 'bandpass', f: 2200, Q: 0.7 }, am: { f: [[0, 1800], [1.4, 90]], d: 1 }, a: 0.002, h: 0.2, d: 1.0, g: 0.3 });
    // comb sweep: resonant pitch sliding down through the tear
    const cb = comb(v, [[0, 1 / 340], [1.4, 1 / 48]], 0.9);
    L(v, { src: 'white', fl: { type: 'highpass', f: 400 }, a: 0.002, h: 0.3, d: 1.3, g: 0.22, to: cb });
    // shearing-metal shriek (inharmonic FM) diving with the tear
    L(v, { src: 'sawtooth', f: [[0, 3200], [1.2, 160]], fm: { f: [[0, 2300], [1.2, 110]], i: [[0, 1800], [1.2, 60]] }, fl: { type: 'bandpass', f: [[0, 4000], [1.2, 300]], Q: 2 }, a: 0.002, h: 0.15, d: 1.1, g: 0.18 });
    // descending detuned saw cluster
    [1, 1.06, 1.5, 2.12].forEach((m) =>
      L(v, { src: 'sawtooth', f: [[0, 700 * m], [1.4, 45 * m]], fl: { type: 'lowpass', f: [[0, 6000], [1.4, 400]] }, dist: 4, a: 0.002, h: 0.2, d: 1.3, g: 0.11 }));
    // after-quake rumble + debris
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 700], [2.2, 80]] }, dist: 2, a: 0.01, h: 0.3, d: 2.0, g: 0.45 });
    rubble(v, 0.35, 14, 1.6, 0.035);
    mark(v, 2.6);
    v.verb(0.5);
  };
  S.shrine_open = (v) => {
    click(v, 0, 0.4, 900, 0.02);
    thump(v, 0, 160, 70, 0.2, 0.45);
    // bonsho temple bell: beating inharmonic partials
    [[0.5, 0.16, 4.5], [1, 0.22, 4], [1.19, 0.1, 3], [1.56, 0.1, 2.6], [2.0, 0.08, 2.2], [2.66, 0.06, 1.6], [3.01, 0.05, 1.4], [4.18, 0.03, 1.0], [5.4, 0.02, 0.8]].forEach(([r, g, d]) =>
      [0, 1].forEach((k) => L(v, { src: 'sine', f: 98 * r + (k ? 0.7 + r * 0.4 : 0), a: 0.004, d, g: g * 0.5, pan: k ? 0.25 : -0.25 })));
    // bass drop + growl
    L(v, { src: 'sine', f: [[0, 130], [1.6, 28]], env: [[0, 0.001], [0.05, 0.55], [1.0, 0.4], [2.4, 0.0005]] });
    [55, 56.3].forEach((f) =>
      L(v, { src: 'sawtooth', t: 0.15, f: [[0, f], [2, f * 0.9]], fl: { type: 'lowpass', f: [[0, 200], [0.6, 500], [2.5, 150]], Q: 4 }, dist: 4, am: { f: 27, d: 0.55 }, a: 0.4, h: 0.6, d: 1.6, g: 0.14 }));
    v.verb(0.5);
  };
  S.shrine_slash = (v) => {
    const k = rr(0.85, 1.2);
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 7000 * k], [0.06, 2400 * k]], Q: 1.6 }, a: 0.002, d: 0.06, g: 0.5 });
    L(v, { src: 'sine', f: [[0, 4200 * k], [0.04, 2000 * k]], a: 0.001, d: 0.04, g: 0.06 });
    v.verb(0.15);
  };
  S.da_on = (v) => {
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 250], [0.25, 900], [0.6, 350]], Q: 5 }, am: { f: 9, d: 0.35 }, a: 0.18, d: 0.45, g: 0.7 });
    L(v, { src: 'brown', fl: { type: 'lowpass', f: [[0, 200], [0.3, 600]] }, a: 0.2, d: 0.4, g: 0.45 });
    L(v, { src: 'sine', f: [[0, 45], [0.3, 70], [0.6, 50]], a: 0.2, d: 0.4, g: 0.35 });
    L(v, { src: 'sawtooth', f: [[0, 110], [0.5, 98]], det: 8, fl: { type: 'lowpass', f: [[0, 200], [0.25, 700], [0.6, 200]], Q: 6 }, a: 0.2, d: 0.4, g: 0.08 });
    v.verb(0.3);
  };
  S.da_off = (v) => {
    L(v, { src: 'pink', fl: { type: 'bandpass', f: [[0, 900], [0.4, 220]], Q: 4 }, a: 0.02, d: 0.38, g: 0.5 });
    L(v, { src: 'sine', f: [[0, 80], [0.4, 40]], a: 0.02, d: 0.35, g: 0.25 });
    v.verb(0.2);
  };
  S.counter_stance = (v) => {
    click(v, 0, 0.3, 5000, 0.006);
    L(v, { src: 'sine', f: 1500, fm: { f: 1500 * 2.41, i: [[0, 900], [0.3, 10]] }, a: 0.002, d: 0.55, g: 0.1 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 3000], [0.2, 6500]], Q: 3 }, a: 0.005, d: 0.2, g: 0.2 });
    thump(v, 0, 90, 45, 0.45, 0.4, 0.2);
    v.verb(0.3);
  };
  S.chant_tick = (v) => {
    const f = 196;
    L(v, { src: 'sine', f, a: 0.003, d: 1.0, g: 0.2 });
    L(v, { src: 'sine', f: f * 2.76, a: 0.002, d: 0.4, g: 0.05 });
    L(v, { src: 'sine', f: f * 5.4, a: 0.002, d: 0.18, g: 0.02 });
    L(v, { src: 'sine', f: f * 0.5, a: 0.01, d: 0.7, g: 0.16 });
    L(v, { src: 'sawtooth', f: f * 0.5 + 0.8, fl: { type: 'lowpass', f: 400 }, a: 0.05, d: 0.6, g: 0.04 });
    v.verb(0.45);
  };

  // Shared -----------------------------------------------------------
  // domain_activate: the boom lands 0.6s after the call (reverse swell first).
  S.domain_activate = (v) => {
    const B = 0.6;
    swell(v, 0, B, 0.35, 'white', 'highpass', 3000, 9000, 0.7);
    swell(v, 0, B, 0.2, 'white', 'bandpass', 600, 4000, 1.5);
    [2093, 2960, 4186].forEach((f) => L(v, { src: 'sine', f, env: [[0, 0.0005], [B, 0.03], [B + 0.02, 0.0001]] }));
    click(v, B, 1.0, 1200, 0.03);
    thump(v, B, 120, 24, 2.0, 0.65, 0.45);
    thump(v, B, 220, 60, 0.35, 0.45, 0.06);
    L(v, { src: 'white', t: B, fl: { type: 'bandpass', f: [[0, 1100], [0.3, 300]], Q: 0.6 }, dist: 10, a: 0.0005, d: 0.3, g: 0.36 });
    L(v, { src: 'brown', t: B, fl: { type: 'lowpass', f: [[0, 1400], [1.5, 80]] }, dist: 2, a: 0.005, h: 0.1, d: 1.6, g: 0.45 });
    L(v, { src: 'white', t: B, fl: { type: 'highpass', f: 4500 }, a: 0.002, d: 1.3, g: 0.12 });
    v.verb(0.5);
  };
  S.domain_clash = (v) => {
    [[55, 1], [58.3, -1]].forEach(([f, s]) =>
      L(v, { src: 'sawtooth', f: [[0, f], [1.3, f * 1.12]], fl: { type: 'lowpass', f: [[0, 300], [0.5, 1800], [1.3, 600]], Q: 5 }, dist: 5, am: { f: s > 0 ? 23 : 31, d: 0.45 }, a: 0.08, h: 0.9, d: 0.4, g: 0.14, pan: s * 0.5 }));
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 600], [1.2, 3500]], Q: 3 }, dist: 3, a: 0.1, h: 0.8, d: 0.35, g: 0.25, pan: -0.4 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 4000], [1.2, 700]], Q: 3 }, dist: 3, a: 0.1, h: 0.8, d: 0.35, g: 0.25, pan: 0.4 });
    L(v, { src: 'crackle', rate: 1.5, fl: { type: 'highpass', f: 1500 }, a: 0.1, h: 0.8, d: 0.35, g: 0.3 });
    L(v, { src: 'sine', f: 36, am: { f: 6, d: 0.5 }, a: 0.1, h: 0.9, d: 0.4, g: 0.45 });
    click(v, 0, 0.6, 1500, 0.02);
    v.verb(0.35);
  };
  S.domain_shatter = (v) => {
    click(v, 0, 0.8, 2000, 0.02);
    L(v, { src: 'white', fl: { type: 'highpass', f: [[0, 1800], [1.2, 6000]] }, dist: 2, a: 0.001, d: 1.2, g: 0.25 });
    shards(v, 0, 30, 0.9, 2000, 9500, 0.07);
    thump(v, 0, 110, 28, 0.9, 0.7, 0.3);
    L(v, { src: 'sine', f: [[0, 1500], [1, 200]], a: 0.005, d: 0.9, g: 0.04 });
    v.verb(0.45);
  };
  S.burnout = (v) => {
    L(v, { src: 'crackle', rate: [[0, 2.2], [0.9, 0.3]], fl: { type: 'highpass', f: 1000 }, a: 0.005, d: 0.9, g: 0.45 });
    L(v, { src: 'sine', f: [[0, 700], [0.8, 90]], fm: { f: 13, i: 60 }, a: 0.005, d: 0.8, g: 0.12 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 6000], [0.8, 1500]], Q: 1 }, a: 0.005, d: 0.7, g: 0.14 });
    L(v, { src: 'sawtooth', f: [[0, 200], [0.6, 50]], fl: { type: 'lowpass', f: 700 }, am: { f: [[0, 40], [0.6, 8]], d: 0.7 }, a: 0.005, d: 0.6, g: 0.1 });
    v.verb(0.2);
  };
  S.super_flash = (v) => {
    swell(v, 0, 0.09, 0.25, 'white', 'highpass', 2000, 8000, 0.7);
    thump(v, 0.09, 180, 60, 0.25, 0.5);
    L(v, { src: 'sawtooth', f: [[0, 600], [0.09, 2400]], fl: { type: 'bandpass', f: 2500, Q: 2 }, env: [[0, 0.002], [0.09, 0.12], [0.11, 0.0005]] });
    [2349, 3136, 3951, 4699].forEach((f, i) =>
      L(v, { src: 'square', t: 0.09, f, fl: { type: 'lowpass', f: 7000 }, a: 0.002, d: 0.65 - i * 0.08, g: 0.04, am: { f: 22 + i * 5, d: 0.4 }, pan: (i - 1.5) * 0.3 }));
    L(v, { src: 'white', t: 0.09, fl: { type: 'highpass', f: 7000 }, a: 0.002, d: 0.5, g: 0.1 });
    v.verb(0.35);
  };
  S.meter_full = (v) => {
    [880, 1318.5, 1760, 2637].forEach((f, i) => L(v, { src: 'square', t: i * 0.045, f, fl: { type: 'lowpass', f: 5000 }, a: 0.002, d: 0.14, g: 0.08 }));
    L(v, { src: 'sine', t: 0.13, f: 3520, a: 0.003, d: 0.5, g: 0.06, am: { f: 16, d: 0.5 } });
    L(v, { src: 'white', t: 0.13, fl: { type: 'highpass', f: 8000 }, a: 0.003, d: 0.3, g: 0.06 });
    v.verb(0.25);
  };
  S.explosion = (v) => boom(v, 0, 0.8);
  S.debris = (v) => {
    rubble(v, 0, 16, 0.7, 0.08);
    L(v, { src: 'brown', fl: { type: 'lowpass', f: 500 }, a: 0.01, d: 0.5, g: 0.3 });
  };
  S.round_bell = (v) => {
    click(v, 0, 0.3, 800, 0.02);
    [[1, 0.24, 3.2], [1.52, 0.13, 2.6], [2.0, 0.1, 2.2], [2.41, 0.08, 1.8], [2.98, 0.07, 1.5], [3.6, 0.05, 1.2], [4.23, 0.04, 1.0], [5.1, 0.03, 0.7]].forEach(([r, g, d], i) =>
      L(v, { src: 'sine', f: [[0, 87.3 * r * 0.995], [0.3, 87.3 * r]], a: 0.004 + i * 0.002, d, g: g * 0.8, am: i > 2 ? { f: 3 + i * 0.7, d: 0.25 } : null, pan: (i % 2 ? 1 : -1) * 0.2 }));
    L(v, { src: 'pink', fl: { type: 'bandpass', f: 600, Q: 1 }, a: 0.002, d: 0.3, g: 0.25 });
    v.verb(0.45);
  };
  S.timer_tick = (v) => {
    L(v, { src: 'sine', f: [[0, 1700], [0.02, 1500]], a: 0.0008, d: 0.035, g: 0.22 });
    L(v, { src: 'white', fl: { type: 'bandpass', f: 2600, Q: 5 }, a: 0.0005, d: 0.02, g: 0.5 });
  };
  S.slowmo = (v) => {
    L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 4000], [0.9, 180]], Q: 1.5 }, a: 0.05, d: 0.85, g: 0.4 });
    [1, 1.007, 0.5].forEach((m) =>
      L(v, { src: 'sawtooth', f: [[0, 700 * m], [1.0, 55 * m]], fl: { type: 'lowpass', f: [[0, 3000], [1, 300]] }, a: 0.02, d: 0.95, g: 0.05 }));
    thump(v, 0.05, 90, 30, 1.0, 0.4, 0.8);
    v.verb(0.4);
  };
  S.fire_crackle = (v) => {
    L(v, { src: 'crackle', rate: rr(0.8, 1.2), fl: { type: 'highpass', f: 900 }, a: 0.02, h: 0.3, d: 0.5, g: 0.4 });
    L(v, { src: 'pink', fl: { type: 'bandpass', f: 500, Q: 0.8 }, am: { f: 7, d: 0.4 }, a: 0.05, h: 0.3, d: 0.5, g: 0.25 });
  };
  S.charge_level = (v) => {
    L(v, { src: 'square', f: [[0, 880], [0.04, 1320]], fl: { type: 'lowpass', f: 5000 }, a: 0.002, h: 0.03, d: 0.12, g: 0.1 });
    L(v, { src: 'sine', t: 0.03, f: 2640, a: 0.002, d: 0.22, g: 0.07 });
    L(v, { src: 'white', t: 0.03, fl: { type: 'highpass', f: 7000 }, a: 0.002, d: 0.08, g: 0.06 });
    v.verb(0.2);
  };

  // Mix levels (multiplies opts.vol), tuned from offline peak measurements so
  // raw peaks land at: UI ~0.3, light hits ~0.5, heavy ~0.75, supers/KO ~0.95.
  const LEVEL = {
    ui_move: 0.93, ui_select: 1.19, ui_back: 1.11, ui_start: 0.74, ui_error: 1.02, step: 0.66, jump: 0.95,
    land: 0.6, dash: 0.87, airdash: 1.6, teleport: 0.91, whiff_l: 1.2, whiff_m: 1.12, whiff_h: 0.97,
    hit_l: 0.53, hit_m: 0.47, hit_h: 0.42, hit_counter: 0.42, hit_super: 0.43, block: 0.7, block_heavy: 0.53,
    perfect_guard: 1.01, parry: 0.91, guard_break: 0.5, throw_grab: 1.23, throw_tech: 0.77, throw_slam: 0.58,
    knockdown: 0.72, wall_bounce: 0.52, ground_bounce: 0.7, black_flash: 0.38, ko_hit: 0.41,
    infinity_on: 1.67, infinity_off: 2.1, infinity_stop: 1.09, infinity_break: 0.91, blue_cast: 1.08,
    blue_pull: 1.24, red_charge: 1.52, red_shot: 0.49, red_burst: 0.44, max_red: 0.4, purple_fire: 0.6,
    purple_impact: 0.41, void_open: 1.15, dismantle: 0.88, dismantle_hit: 0.64, cleave: 0.61,
    cleave_hit: 0.45, fuga_fire: 0.9, fuga_explode: 0.47, wcs_tear: 0.47, shrine_open: 0.92,
    shrine_slash: 0.96, da_on: 1, da_off: 1.45, counter_stance: 0.98, chant_tick: 1.06, domain_activate: 0.43,
    domain_clash: 1.09, domain_shatter: 0.6, burnout: 1.59, super_flash: 0.96, meter_full: 1.77,
    explosion: 0.45, debris: 2.13, round_bell: 1.46, timer_tick: 1.14, slowmo: 0.98, fire_crackle: 1.48,
    charge_level: 1.38,
    // loops
    blue_loop: 0.55, purple_charge: 0.78, fuga_charge: 0.7, infinity_hum: 2,
  };
  const lvl = (name, o) => (o.vol != null ? Math.max(0, +o.vol || 0) : 1) * (LEVEL[name] || 1);
  function playOn(E, name, o) {
    const v = voice(E, Object.assign({}, o, { vol: lvl(name, o) }));
    S[name](v);
    return finish(v);
  }

  // ---------------------------------------------------------------- loops
  // Sustained layer (runs until the loop stops). Returns {src, fl, g, am, plfo}.
  function sus(v, o) {
    const c = v.c;
    let src;
    if (v.E.buf[o.src]) {
      src = c.createBufferSource();
      src.buffer = v.E.buf[o.src];
      src.loop = true;
      src.playbackRate.value = (o.rate || 1) * v.p;
    } else {
      src = c.createOscillator();
      src.type = o.src || 'sine';
      src.frequency.value = Math.min(v.nyq, (o.f || 220) * v.p);
      if (o.det) src.detune.value = o.det;
      if (o.fm) lfo(v, o.fm.f, o.fm.i, src.frequency);
    }
    const r = { src };
    let node = src;
    if (o.fl) {
      r.fl = c.createBiquadFilter();
      r.fl.type = o.fl.type || 'lowpass';
      r.fl.frequency.value = Math.min(v.nyq, o.fl.f * v.p);
      if (o.fl.Q != null) r.fl.Q.value = o.fl.Q;
      node.connect(r.fl);
      node = r.fl;
    }
    if (o.dist) {
      const ws = c.createWaveShaper();
      ws.curve = tanhCurve(o.dist);
      node.connect(ws);
      node = ws;
    }
    if (o.am) {
      const ag = c.createGain(), dp = o.am.d != null ? o.am.d : 0.5;
      ag.gain.value = 1 - dp;
      r.am = lfo(v, o.am.f, dp, ag.gain, o.am.type);
      node.connect(ag);
      node = ag;
    }
    r.g = c.createGain();
    r.g.gain.value = o.g != null ? o.g : 0.3;
    node.connect(r.g);
    let out = r.g;
    if ((o.pan || o.panLfo) && c.createStereoPanner) {
      const pn = c.createStereoPanner();
      pn.pan.value = o.pan || 0;
      if (o.panLfo) r.plfo = lfo(v, o.panLfo.f, o.panLfo.d, pn.pan);
      r.g.connect(pn);
      out = pn;
    }
    out.connect(o.to || v.out);
    if (src.buffer) src.start(v.t0, R() * (src.buffer.duration - 0.05));
    else src.start(v.t0);
    v.srcs.push(src);
    return r;
  }
  function lfo(v, f, depth, target, type) {
    const o = v.c.createOscillator(), g = v.c.createGain();
    o.type = type || 'sine';
    o.frequency.value = f;
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start(v.t0);
    v.srcs.push(o);
    return { o, g };
  }
  // Glide a param toward a value (k = time constant, 0 = immediate).
  function tg(v, prm, val, k) {
    const now = v.c.currentTime;
    if (k) prm.setTargetAtTime(val, now, k);
    else prm.setValueAtTime(val, Math.max(now, v.t0));
  }
  const tf = (v, prm, f, k) => tg(v, prm, Math.min(v.nyq, f * v.p), k);

  const LOOPS = {};
  LOOPS.blue_loop = (v) => {
    const n = sus(v, { src: 'brown', fl: { type: 'lowpass', f: 160, Q: 4 }, g: 0.7 });
    const sw = sus(v, { src: 'pink', fl: { type: 'bandpass', f: 600, Q: 5 }, g: 0.25, panLfo: { f: 0.9, d: 0.6 } });
    const swl = lfo(v, 0.9, 300, sw.fl.frequency);
    const s1 = sus(v, { src: 'sine', f: 43, g: 0.3 }), s2 = sus(v, { src: 'sine', f: 45.6, g: 0.26 });
    const wh = sus(v, { src: 'sine', f: 480, g: 0.02, fm: { f: 4, i: 50 }, panLfo: { f: 0.45, d: 0.7 } });
    return (x, k) => {
      tf(v, n.fl.frequency, 130 + 520 * x, k); tg(v, n.g.gain, 0.55 + 0.4 * x, k);
      tf(v, sw.fl.frequency, 500 + 1100 * x, k); tg(v, sw.g.gain, 0.15 + 0.35 * x, k);
      tg(v, swl.o.frequency, 0.7 + 3 * x, k); tg(v, swl.g.gain, 200 + 800 * x, k);
      tg(v, sw.plfo ? sw.plfo.o.frequency : swl.o.frequency, 0.9 + 2.5 * x, k);
      tf(v, s1.src.frequency, 42 + 16 * x, k); tf(v, s2.src.frequency, 44.4 + 18 * x, k);
      tf(v, wh.src.frequency, 420 + 900 * x, k); tg(v, wh.g.gain, 0.012 + 0.05 * x, k);
    };
  };
  LOOPS.purple_charge = (v) => {
    const c = v.c;
    const drive = keep(v, c.createGain()), ws = keep(v, c.createWaveShaper()), post = keep(v, c.createGain());
    ws.curve = tanhCurve(4);
    post.gain.value = 0.55;
    drive.connect(ws); ws.connect(post); post.connect(v.out);
    const thr = keep(v, c.createGain());
    thr.gain.value = 0.8;
    thr.connect(drive);
    const tl = lfo(v, 2, 0.2, thr.gain);
    const sub = sus(v, { src: 'sine', f: 32, g: 0.4 });
    const vo = [];
    [1, 1.498, 2, 2.378, 3].forEach((r) => [-1, 1].forEach((s) =>
      vo.push({ r, s, n: sus(v, { src: 'sawtooth', f: 55 * r, det: s * 8, fl: { type: 'lowpass', f: 300, Q: 3 }, g: 0.05, to: thr }) })));
    const cr = sus(v, { src: 'crackle', fl: { type: 'highpass', f: 1500 }, g: 0, rate: 0.6 });
    const roar = sus(v, { src: 'pink', fl: { type: 'bandpass', f: 700, Q: 0.7 }, g: 0, to: drive });
    const sh = [1318.5, 1975.5, 2637].map((f, i) => sus(v, { src: 'sine', f, g: 0, am: { f: 7 + i * 2.5, d: 0.6 }, panLfo: { f: 0.3 + i * 0.2, d: 0.6 } }));
    return (x, k) => {
      const e = x * x, base = 55 * Math.pow(2, x); // chord climbs an octave
      vo.forEach((o) => {
        tf(v, o.n.src.frequency, base * o.r, k);
        tg(v, o.n.src.detune, o.s * (6 + 22 * x), k);
        tf(v, o.n.fl.frequency, 250 + 4500 * e, k);
        tg(v, o.n.g.gain, 0.04 + 0.05 * x, k);
      });
      tf(v, sub.src.frequency, 30 + 26 * x, k); tg(v, sub.g.gain, 0.3 + 0.3 * x, k);
      tg(v, tl.o.frequency, 1.5 + 10 * x, k); tg(v, tl.g.gain, 0.12 + 0.25 * x, k);
      tg(v, drive.gain, 0.5 + 0.7 * x, k);
      tg(v, cr.g.gain, 0.04 + 0.45 * e, k); tg(v, cr.src.playbackRate, (0.6 + 1.8 * x) * v.p, k);
      tg(v, roar.g.gain, 0.5 * e * x, k); tf(v, roar.fl.frequency, 500 + 1500 * x, k);
      sh.forEach((s) => tg(v, s.g.gain, 0.03 * x, k));
    };
  };
  LOOPS.fuga_charge = (v) => {
    const roar = sus(v, { src: 'pink', fl: { type: 'bandpass', f: 400, Q: 0.9 }, dist: 3, g: 0.3, am: { f: 9, d: 0.3 } });
    lfo(v, 13.3, 0.12, roar.g.gain);
    const rum = sus(v, { src: 'brown', fl: { type: 'lowpass', f: 300 }, g: 0.4 });
    const cr = sus(v, { src: 'crackle', fl: { type: 'highpass', f: 1000 }, g: 0.15, rate: 0.7 });
    const sub = sus(v, { src: 'sine', f: 48, g: 0.2 });
    const hiss = sus(v, { src: 'white', fl: { type: 'highpass', f: 4000 }, g: 0.02 });
    return (x, k) => {
      tf(v, roar.fl.frequency, 350 + 900 * x, k); tg(v, roar.g.gain, 0.25 + 0.3 * x, k); tg(v, roar.am.o.frequency, 8 + 10 * x, k);
      tf(v, rum.fl.frequency, 250 + 450 * x, k); tg(v, rum.g.gain, 0.35 + 0.3 * x, k);
      tg(v, cr.g.gain, 0.12 + 0.45 * x, k); tg(v, cr.src.playbackRate, (0.6 + 1.4 * x) * v.p, k);
      tf(v, sub.src.frequency, 46 + 24 * x, k); tg(v, sub.g.gain, 0.18 + 0.22 * x, k);
      tg(v, hiss.g.gain, 0.015 + 0.1 * x * x, k);
    };
  };
  LOOPS.infinity_hum = (v) => {
    const a = sus(v, { src: 'sine', f: 880, g: 0.012, panLfo: { f: 0.13, d: 0.5 } });
    const b = sus(v, { src: 'sine', f: 1320.8, g: 0.008, panLfo: { f: 0.17, d: 0.5 } });
    sus(v, { src: 'sine', f: 1762, g: 0.004 });
    const air = sus(v, { src: 'white', fl: { type: 'bandpass', f: 6500, Q: 0.8 }, g: 0.012 });
    lfo(v, 0.25, 0.006, air.g.gain);
    return (x, k) => {
      tg(v, a.g.gain, 0.008 + 0.012 * x, k); tg(v, b.g.gain, 0.005 + 0.009 * x, k);
      tg(v, air.g.gain, 0.01 + 0.015 * x, k); tf(v, air.fl.frequency, 5500 + 3000 * x, k);
    };
  };
  LOOPS.void_ambience = (v) => {
    const d1 = sus(v, { src: 'sine', f: 55, g: 0.12 }), d2 = sus(v, { src: 'sine', f: 82.6, g: 0.06 }), d3 = sus(v, { src: 'sine', f: 110.4, g: 0.05 });
    const pad = sus(v, { src: 'triangle', f: 440.7, fl: { type: 'lowpass', f: 1200 }, g: 0.025, am: { f: 0.11, d: 0.6 } });
    const pad2 = sus(v, { src: 'triangle', f: 659.3, fl: { type: 'lowpass', f: 1200 }, g: 0.018, am: { f: 0.07, d: 0.7 } });
    const sh = [1760, 2637, 3520, 4699].map((f, i) => sus(v, { src: 'sine', f: f * (1 + i * 0.0015), g: 0.01, am: { f: 7 + i * 2.1, d: 0.8 }, panLfo: { f: 0.1 + i * 0.07, d: 0.8 } }));
    const hiss = sus(v, { src: 'white', fl: { type: 'bandpass', f: 7000, Q: 0.6 }, g: 0.015 });
    lfo(v, 0.07, 0.008, hiss.g.gain);
    return (x, k) => {
      tg(v, d1.g.gain, 0.1 + 0.06 * x, k); tg(v, d2.g.gain, 0.05 + 0.04 * x, k); tg(v, d3.g.gain, 0.04 + 0.03 * x, k);
      tg(v, pad.g.gain, 0.02 + 0.02 * x, k); tg(v, pad2.g.gain, 0.014 + 0.016 * x, k);
      tf(v, pad.fl.frequency, 1000 + 2500 * x, k);
      sh.forEach((s) => tg(v, s.g.gain, 0.008 + 0.016 * x, k));
      tg(v, hiss.g.gain, 0.012 + 0.02 * x, k);
    };
  };
  LOOPS.shrine_ambience = (v) => {
    const d1 = sus(v, { src: 'sawtooth', f: 49, fl: { type: 'lowpass', f: 220, Q: 2 }, dist: 1.5, g: 0.09 });
    const d2 = sus(v, { src: 'sawtooth', f: 51.9, fl: { type: 'lowpass', f: 220, Q: 2 }, dist: 1.5, g: 0.08 });
    const wind = sus(v, { src: 'pink', fl: { type: 'bandpass', f: 500, Q: 1.5 }, g: 0.12 });
    lfo(v, 0.13, 250, wind.fl.frequency);
    const growl = sus(v, { src: 'sawtooth', f: 36.7, fl: { type: 'lowpass', f: 150 }, g: 0.06, am: { f: 19, d: 0.6 } });
    let amt = 0, next = 0;
    // distant domain slashes, scheduled ahead on the audio clock
    v.sched = (until) => {
      if (!next) next = v.t0 + 0.3;
      while (next < until) {
        playOn(v.E, 'shrine_slash', { when: next, dest: v.out, revDest: v.revDest, vol: 0.1 + 0.35 * amt * rr(0.4, 1), pan: rr(-0.9, 0.9), pitch: rr(0.8, 1.25) });
        next += rr(0.12, 0.9) / (0.5 + amt);
      }
    };
    return (x, k) => {
      amt = x;
      tf(v, d1.fl.frequency, 200 + 500 * x, k); tf(v, d2.fl.frequency, 200 + 500 * x, k);
      tg(v, wind.g.gain, 0.1 + 0.12 * x, k); tg(v, growl.g.gain, 0.05 + 0.06 * x, k);
    };
  };
  LOOPS.domain_clash_loop = (v) => {
    const a = sus(v, { src: 'sawtooth', f: 55, fl: { type: 'lowpass', f: 400, Q: 5 }, dist: 5, am: { f: 23, d: 0.45 }, g: 0.12, pan: -0.45 });
    const b = sus(v, { src: 'sawtooth', f: 58.3, fl: { type: 'lowpass', f: 400, Q: 5 }, dist: 5, am: { f: 31, d: 0.45 }, g: 0.12, pan: 0.45 });
    const n1 = sus(v, { src: 'white', fl: { type: 'bandpass', f: 1200, Q: 3 }, dist: 3, g: 0.12, pan: -0.4 });
    const n2 = sus(v, { src: 'white', fl: { type: 'bandpass', f: 2400, Q: 3 }, dist: 3, g: 0.12, pan: 0.4 });
    lfo(v, 0.31, 600, n1.fl.frequency);
    lfo(v, 0.23, 900, n2.fl.frequency);
    const cr = sus(v, { src: 'crackle', fl: { type: 'highpass', f: 1500 }, g: 0.15, rate: 1.2 });
    const sub = sus(v, { src: 'sine', f: 36, g: 0.3, am: { f: 6, d: 0.5 } });
    return (x, k) => {
      tf(v, a.fl.frequency, 350 + 2200 * x, k); tf(v, b.fl.frequency, 350 + 2200 * x, k);
      tg(v, a.g.gain, 0.1 + 0.08 * x, k); tg(v, b.g.gain, 0.1 + 0.08 * x, k);
      tg(v, a.am.o.frequency, 18 + 20 * x, k); tg(v, b.am.o.frequency, 25 + 24 * x, k);
      tg(v, n1.g.gain, 0.08 + 0.2 * x, k); tg(v, n2.g.gain, 0.08 + 0.2 * x, k);
      tg(v, cr.g.gain, 0.1 + 0.4 * x, k); tg(v, cr.src.playbackRate, (1 + x) * v.p, k);
      tg(v, sub.g.gain, 0.25 + 0.25 * x, k); tf(v, sub.src.frequency, 34 + 10 * x, k);
    };
  };

  const DUMMY = Object.freeze({ setLevel() {}, stop() {}, level: 0 });
  function startLoop(E, name, o) {
    const c = E.ctx, fn = LOOPS[name];
    const v = voice(E, Object.assign({}, o, { vol: 1 }));
    v.srcs = [];
    const volume = lvl(name, o);
    v.out.gain.setValueAtTime(0, v.t0);
    v.out.gain.linearRampToValueAtTime(volume, v.t0 + (o.fadeIn != null ? Math.max(0.005, o.fadeIn) : 0.12));
    const set = fn(v);
    let level = clamp(+o.level || 0, 0, 1), dead = false, timer = null;
    set(level, 0);
    if (o.verb) v.verb(o.verb);
    if (v.sched) {
      if (E.live) {
        v.sched(c.currentTime + 0.5);
        timer = setInterval(() => v.sched(c.currentTime + 0.5), 150);
      } else v.sched(o.horizon || 0);
    }
    return {
      setLevel(x) {
        if (dead) return;
        level = clamp(+x || 0, 0, 1);
        set(level, 0.06);
      },
      get level() {
        return level;
      },
      stop(fade) {
        if (dead) return;
        dead = true;
        fade = fade == null ? 0.15 : Math.max(0.005, +fade || 0);
        if (timer) clearInterval(timer);
        const now = c.currentTime;
        hold(v.out.gain, now);
        v.out.gain.linearRampToValueAtTime(0, now + fade);
        v.srcs.forEach((s) => {
          try { s.stop(now + fade + 0.05); } catch (e) {}
        });
        if (E.live) setTimeout(() => disconnectVoice(v), (fade + 0.3) * 1000);
      },
    };
  }

  // ---------------------------------------------------------------- public API
  function fireUnlock() {
    for (let i = 0; i < unlockFns.length; i++) {
      try { unlockFns[i](); } catch (e) {}
    }
  }
  A.unlock = function () {
    if (!AC) return;
    if (!live) {
      let c = null;
      try { c = new AC({ latencyHint: 'interactive' }); } catch (e) {
        try { c = new AC(); } catch (e2) { return; }
      }
      const s = settings();
      if (s.musicVol != null) vol.music = clamp(+s.musicVol || 0, 0, 1);
      if (s.sfxVol != null) vol.sfx = clamp(+s.sfxVol || 0, 0, 1);
      try {
        live = makeEngine(c, false);
      } catch (e) {
        live = null;
        warnOnce('engine', 'audio init failed: ' + e);
        return;
      }
      live.live = true;
      try {
        c.addEventListener('statechange', () => {
          if (c.state === 'running') fireUnlock();
        });
      } catch (e) {}
      // iOS: start the output inside the gesture with a silent sample.
      try {
        const b = c.createBufferSource();
        b.buffer = c.createBuffer(1, 1, c.sampleRate);
        b.connect(c.destination);
        b.start(0);
      } catch (e) {}
      fireUnlock();
    }
    const st = live.ctx.state;
    if (st === 'suspended' || st === 'interrupted') {
      try {
        const p = live.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
  };

  A.setVolumes = function (music, sfx) {
    if (music != null) vol.music = clamp(+music || 0, 0, 1);
    if (sfx != null) vol.sfx = clamp(+sfx || 0, 0, 1);
    if (!live) return;
    const t = live.ctx.currentTime;
    live.music.gain.setTargetAtTime(vol.music, t, 0.03);
    live.sfx.gain.setTargetAtTime(vol.sfx, t, 0.03);
    live.bypass.gain.setTargetAtTime(vol.sfx, t, 0.03);
  };

  const lastPlay = {};
  // opts: {vol=1, pitch=1, pan=0, bypassHush=false, delay=0}. Returns {stop(fade)} or null.
  A.play = function (name, opts) {
    if (!S[name]) {
      warnOnce('sfx:' + name, 'unknown sfx "' + name + '"');
      return null;
    }
    const E = live;
    if (!E || E.ctx.state === 'closed' || E.active > 96) return null;
    opts = opts || {};
    const now = E.ctx.currentTime;
    if (!opts.force && lastPlay[name] != null && now - lastPlay[name] < 0.012 && now >= lastPlay[name]) return null;
    lastPlay[name] = now;
    try {
      const v = playOn(E, name, opts);
      return {
        stop(fade) {
          const t = E.ctx.currentTime;
          hold(v.out.gain, t);
          v.out.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fade == null ? 0.05 : +fade || 0));
        },
      };
    } catch (e) {
      warnOnce('err:' + name, 'sfx "' + name + '" failed: ' + e);
      return null;
    }
  };

  // opts: {vol=1, pitch=1, pan=0, level=0, bypassHush=false, fadeIn=0.12}
  A.loop = function (name, opts) {
    if (!LOOPS[name]) {
      warnOnce('loop:' + name, 'unknown loop "' + name + '"');
      return DUMMY;
    }
    if (!live || live.ctx.state === 'closed') return DUMMY;
    try {
      return startLoop(live, name, opts || {});
    } catch (e) {
      warnOnce('lerr:' + name, 'loop "' + name + '" failed: ' + e);
      return DUMMY;
    }
  };

  // Duck SFX + music to `depth` within ~40ms; hold for `seconds` then restore
  // (seconds <= 0 or Infinity: hold until unhush()). bypassHush sounds ignore it.
  A.hush = function (seconds, depth) {
    if (!live) return;
    depth = clamp(depth == null ? 0.05 : +depth || 0, 0, 1);
    const g = live.hush.gain, now = live.ctx.currentTime;
    hold(g, now);
    g.linearRampToValueAtTime(depth, now + 0.04);
    if (seconds > 0 && isFinite(seconds)) {
      g.setValueAtTime(depth, now + 0.04 + seconds);
      g.linearRampToValueAtTime(1, now + 0.04 + seconds + 0.3);
    }
  };
  A.unhush = function (fadeSec) {
    if (!live) return;
    const g = live.hush.gain, now = live.ctx.currentTime;
    hold(g, now);
    g.linearRampToValueAtTime(1, now + Math.max(0.005, fadeSec == null ? 0.05 : +fadeSec || 0));
  };

  // Muffle the whole mix: 0 = open, 1 = heavily muffled (~320 Hz).
  A.lowpass = function (amount, seconds) {
    if (!live || !live.muffle) return;
    const a = clamp(+amount || 0, 0, 1), f = a <= 0 ? live.maxF : live.maxF * Math.pow(320 / live.maxF, a);
    const p = live.muffle.frequency, now = live.ctx.currentTime;
    hold(p, now);
    p.exponentialRampToValueAtTime(f, now + Math.max(0.01, seconds == null ? 0.25 : +seconds || 0));
  };

  A.rumble = function (padIndex, strong, weak, ms) {
    try {
      const nav = root.navigator;
      const pads = nav && nav.getGamepads ? nav.getGamepads() : null;
      const gp = pads && pads[padIndex | 0];
      if (!gp) return;
      const s = clamp(+strong || 0, 0, 1), w = clamp(+weak || 0, 0, 1), d = Math.max(0, +ms || 0);
      const act = gp.vibrationActuator;
      if (act && act.playEffect) {
        const p = act.playEffect('dual-rumble', { startDelay: 0, duration: d, strongMagnitude: s, weakMagnitude: w });
        if (p && p.catch) p.catch(() => {});
      } else if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) {
        const p = gp.hapticActuators[0].pulse(Math.max(s, w), d);
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {}
  };

  A.list = () => ({ sfx: Object.keys(S), loops: Object.keys(LOOPS) });
  A.has = (name) => !!(S[name] || LOOPS[name]);

  // ---------------------------------------------------------------- internal contract
  Object.defineProperty(A, 'ctx', { enumerable: true, get: () => (live ? live.ctx : null) });
  Object.defineProperty(A, 'ready', { enumerable: true, get: () => !!live && live.ctx.state === 'running' });
  Object.defineProperty(A, '_E', { get: () => live });
  Object.defineProperty(A, '_musicBus', { get: () => (live ? live.music : null) });
  Object.defineProperty(A, '_sfxBus', { get: () => (live ? live.sfx : null) });
  A._onUnlock = function (fn) {
    unlockFns.push(fn);
    if (live) {
      try { fn(); } catch (e) {}
    }
  };
  A._synth = { voice, L, finish, setP, T, mark, keep, comb, shaper, tanhCurve, crushCurve, makeIR, sus, lfo, tg, hold };
  // Offline engine for analysis. raw = true skips the master chain (true peaks).
  A._offline = function (seconds, raw, sr) {
    if (!OAC) return null;
    sr = sr || 44100;
    const c = new OAC(2, Math.ceil(sr * seconds), sr);
    const E = makeEngine(c, raw !== false);
    E.sfx.gain.value = 1;
    E.music.gain.value = 1;
    E.bypass.gain.value = 1;
    return { ctx: c, E };
  };
  // Render a one-shot or loop (opts.level) offline -> Promise<AudioBuffer|null>.
  A._render = function (name, opts, seconds, raw) {
    seconds = seconds || 6;
    const o = A._offline(seconds, raw);
    if (!o || !(S[name] || LOOPS[name])) return Promise.resolve(null);
    opts = Object.assign({ when: 0.01 }, opts);
    if (S[name]) playOn(o.E, name, opts);
    else startLoop(o.E, name, Object.assign({ horizon: seconds }, opts));
    return o.ctx.startRendering();
  };
})();
