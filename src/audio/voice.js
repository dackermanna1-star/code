// Voice: one playing sound = a small group of Web Audio nodes with a shared output gain and an
// optional spatial chain, routed into a bus and a reverb send.
//
//   [recipe nodes] ─► out ─► level ─► (lp ─► panner) ─► dest (bus / bed / track)
//                                   └──────────────► wet ─► send (reverb)
//
// Recipes schedule in *relative* time (seconds from the voice start) scaled by `rate`, so a
// recipe played at rate 0.5 is an octave down and twice as long — the same contract as a
// buffer's playbackRate. Every node created through the voice is tracked and disconnected by
// dispose(), which the engine calls once the voice has finished (no node leaks).

export class Voice {
  /** opts: dest (AudioNode), send (AudioNode | null), t0 (abs time), rate, vol, wet (send
   *  level), spatial (bool: build lp + panner), id. */
  constructor(eng, opts) {
    const ctx = eng.ctx;
    this.eng = eng; this.ctx = ctx; this.id = opts.id || '';
    this.rate = opts.rate || 1;
    this.t0 = opts.t0 ?? ctx.currentTime + 0.005;
    this.end = this.t0;
    this.nodes = []; this.srcs = [];
    this.out = this.gain(1);
    this.level = this.gain(opts.vol ?? 1);
    this.out.connect(this.level);
    let tail = this.level;
    if (opts.spatial) {
      this.lpNode = this.filter('lowpass', 20000, 0.5, 0, false);
      this.panner = ctx.createStereoPanner ? this.reg(ctx.createStereoPanner()) : null;
      tail.connect(this.lpNode); tail = this.lpNode;
      if (this.panner) { tail.connect(this.panner); tail = this.panner; }
    }
    tail.connect(opts.dest);
    if (opts.send) {
      this.wet = this.gain(opts.wet ?? 1);
      (this.lpNode || this.level).connect(this.wet); this.wet.connect(opts.send);
    }
    this.baseVol = opts.vol ?? 1;
    this.disposed = false;
  }

  // ---- time / pitch helpers ------------------------------------------------------------------
  T(t) { return this.t0 + t / this.rate; }
  hz(f) { return f * this.rate; }

  // ---- node factories (all tracked) ----------------------------------------------------------
  reg(n) { this.nodes.push(n); return n; }
  gain(v = 1) { const n = this.ctx.createGain(); n.gain.value = v; return this.reg(n); }
  /** Biquad; frequency is scaled by rate unless scale === false. */
  filter(type, f, q = 0.707, g = 0, scale = true) {
    const n = this.ctx.createBiquadFilter();
    n.type = type; n.frequency.value = Math.min(scale ? f * this.rate : f, this.ctx.sampleRate * 0.45);
    n.Q.value = q; n.gain.value = g;
    return this.reg(n);
  }
  lp(f, q) { return this.filter('lowpass', f, q); }
  hp(f, q) { return this.filter('highpass', f, q); }
  bp(f, q) { return this.filter('bandpass', f, q); }
  peak(f, q, g) { return this.filter('peaking', f, q, g); }
  osc(type, f, detune = 0) {
    const n = this.ctx.createOscillator();
    if (typeof type === 'string') n.type = type; else n.setPeriodicWave(type);
    n.frequency.value = f * this.rate; n.detune.value = detune;
    this.srcs.push(n);
    return this.reg(n);
  }
  /** Looping noise from the engine's shared buffers ('white' | 'pink' | 'brown'). */
  noise(color = 'white', playbackRate = 1) {
    const buf = this.eng.noiseBuffer(color);
    const n = this.ctx.createBufferSource();
    n.buffer = buf; n.loop = true; n.playbackRate.value = playbackRate * this.rate;
    n._offset = this.eng.R.r() * buf.duration;
    this.srcs.push(n);
    return this.reg(n);
  }
  src(buffer, playbackRate = 1, loop = false) {
    const n = this.ctx.createBufferSource();
    n.buffer = buffer; n.loop = loop; n.playbackRate.value = playbackRate * this.rate;
    this.srcs.push(n);
    return this.reg(n);
  }
  shaper(curve, oversample = 'none') { const n = this.ctx.createWaveShaper(); n.curve = curve; n.oversample = oversample; return this.reg(n); }
  delay(t, max = 1) { const n = this.ctx.createDelay(max); n.delayTime.value = t; return this.reg(n); }
  pan(p = 0) { const n = this.ctx.createStereoPanner(); n.pan.value = p; return this.reg(n); }
  constant(v = 0) { const n = this.ctx.createConstantSource(); n.offset.value = v; this.srcs.push(n); return this.reg(n); }

  /** connect a → b → c …; returns the last node. */
  chain(...ns) { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; }

  /** Start a source at relative time t; stop after dur (relative) or never (dur == null). */
  play(src, t = 0, dur = null) {
    const at = Math.max(this.ctx.currentTime, this.T(t));
    if (src._offset != null) src.start(at, src._offset); else src.start(at);
    if (dur != null) {
      const e = this.T(t + dur);
      src.stop(e);
      if (e > this.end) this.end = e;
    } else this.end = Infinity;
    return src;
  }

  /** Automate param through [[t, v, kind?], ...]; kind: 'lin' (default) | 'exp' | 'set' |
   *  ['tgt', tau]. Times relative; values scaled by rate when freq === true. */
  env(param, pts, freq = false) {
    const k = freq ? this.rate : 1;
    const first = pts[0];
    param.setValueAtTime(first[1] * k, this.T(first[0]));
    for (let i = 1; i < pts.length; i++) {
      const [t, v, kind] = pts[i], at = this.T(t), val = v * k;
      if (kind === 'set') param.setValueAtTime(val, at);
      else if (kind === 'exp') param.exponentialRampToValueAtTime(Math.max(1e-5, val), at);
      else if (Array.isArray(kind)) param.setTargetAtTime(val, this.T(pts[i - 1][0]), kind[1] / this.rate);
      else param.linearRampToValueAtTime(val, at);
    }
    return param;
  }
  /** Percussive envelope on a gain param: 0 → peak in `a`, exponential decay to -60 dB in t60. */
  ad(param, t, peak, a, t60) {
    param.setValueAtTime(0, this.T(t));
    param.linearRampToValueAtTime(peak, this.T(t + a));
    param.setTargetAtTime(0, this.T(t + a), t60 / 6.9 / this.rate);
    return t + a + t60;
  }

  // ---- placement -----------------------------------------------------------------------------
  /** Apply a placement { gain, pan, lp, wet } (see AudioEngine.placeFor), smoothed. */
  place(p, smoothing = 0.04, at = null) {
    const t = at ?? this.ctx.currentTime;
    const tc = Math.max(0.001, smoothing);
    this._placeGain = p.gain;
    if (at != null) {
      this.level.gain.setValueAtTime(this.baseVol * p.gain, t);
      if (this.lpNode) this.lpNode.frequency.setValueAtTime(p.lp, t);
      if (this.panner) this.panner.pan.setValueAtTime(p.pan, t);
      if (this.wet && p.wet != null) this.wet.gain.setValueAtTime(p.wet, t);
      return;
    }
    this.level.gain.setTargetAtTime(this.baseVol * p.gain, t, tc);
    if (this.lpNode) this.lpNode.frequency.setTargetAtTime(p.lp, t, tc);
    if (this.panner) this.panner.pan.setTargetAtTime(p.pan, t, tc);
    if (this.wet && p.wet != null) this.wet.gain.setTargetAtTime(p.wet, t, tc);
  }
  setVol(v, fade = 0.05) {
    this.baseVol = v;
    const t = this.ctx.currentTime;
    this.level.gain.cancelScheduledValues(t);
    this.level.gain.setTargetAtTime(v * (this._placeGain ?? 1), t, Math.max(0.005, fade / 3));
  }

  /** Fade out and end. The engine disposes the nodes once `end` has passed. */
  stop(fade = 0.05) {
    if (this.disposed) return;
    const t = this.ctx.currentTime, f = Math.max(0.005, fade);
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + f);
    for (const s of this.srcs) { try { s.stop(t + f + 0.02); } catch { /* already stopped */ } }
    this.end = t + f + 0.05;
    this.stopping = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.children) { for (const c of this.children) c.dispose(); this.children = null; }
    for (const s of this.srcs) { try { s.stop(); } catch { /* not started / already stopped */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
    this.nodes.length = 0; this.srcs.length = 0;
  }
}
