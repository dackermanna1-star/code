/* What Derry Keeps — procedural audio.  window.SND
 *
 * Everything here is synthesized with the Web Audio API: no audio files.
 * Plain browser script (no modules, no build step), works from file://.
 *
 *   await SND.init()                 create/resume the AudioContext (call from a user gesture; safe to repeat)
 *   SND.setVolume(channel, v)        'master'|'music'|'ambience'|'sfx', 0..1 (smooth ramp)
 *   SND.music(id|null, {fade=2})     crossfade to a generative looping track (same id again = no-op)
 *   SND.ambience(id|null, {fade=2})  environmental bed, crossfades
 *   SND.weather('rain'|'wind'|null)  extra layer above the ambience
 *   SND.sfx(id, {volume=1})          one-shot
 *   SND.tape(on)                     cassette hiss + wow/flutter + hum; gently low-passes the music bus
 *   SND.voice(seconds, kind)         distant unintelligible speech on an old tape ('girl'|'boy'|'man'|'woman'|'old')
 *   SND.heartbeat(bpm|null)          looping lub-dub
 *   SND.duck(amount, seconds)        lower the music by amount (0..1) for a while, then restore
 *   SND.stopAll()
 *   SND.ready                        true once init() has built the audio graph
 *
 * Every method is a silent no-op (never throws) before init, without Web Audio, or for an
 * unknown id (console.warn once per id). music/ambience/weather/tape/heartbeat/setVolume calls
 * made before init are remembered and applied when init() runs.
 *
 * Signal flow
 *   layer voices -> layer fade (dry) -> channel [wow -> tape low-pass -> duck] -> channel volume -> master
 *               \-> layer fade (send) -> channel wet copy ------------------------> channel volume -> reverb
 *   master -> DynamicsCompressor (gentle limiter) -> trim -> destination;  reverb return -> master
 *
 * Generative music runs on a lookahead scheduler: a 100 ms setInterval plans whole bars as
 * lightweight events and creates audio nodes only for events that fall inside the next ~0.3 s
 * of AudioContext time (the window widens automatically if timers get throttled).
 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var SND = { ready: false };
  window.SND = SND;

  var ctx = null;
  var G = {};                  // shared graph nodes
  var NOISE = {};              // precomputed noise buffers: white, pink, brown
  var chans = {};              // music, ambience, sfx channels
  var vols = { master: 0.9, music: 0.55, ambience: 0.6, sfx: 0.8 };
  var warned = {};
  var pending = {};            // stateful calls made before init()

  /* ------------------------------------------------------------------ utilities */

  function warnOnce(kind, id) {
    var k = kind + ':' + id;
    if (warned[k]) return;
    warned[k] = true;
    try { console.warn('[SND] unknown ' + kind + ' id: ' + id); } catch (e) { /* ignore */ }
  }
  var errorsShown = 0;
  function report(e) {
    if (errorsShown++ < 5) { try { console.warn('[SND] internal error (ignored):', e); } catch (x) { /* ignore */ } }
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function cents(c) { return Math.pow(2, c / 1200); }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* seeded random helper object */
  function Rand(seed) {
    var f = mulberry(seed);
    return {
      f: f,
      r: function (a, b) { return a + (b - a) * f(); },
      i: function (a, b) { return a + Math.floor((b - a + 1) * f()); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; },
      chance: function (p) { return f() < p; },
      exp: function (a, b) { return a * Math.pow(b / a, f()); }
    };
  }
  var GR = Rand((Date.now() ^ 0x5bd1e995) >>> 0);   // unseeded-ish randomness for one-shots

  /* chord names -> pitch classes: "Am7", "Bbmaj7", "G7/B", "F7/Eb" */
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
    sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '6': [0, 4, 7, 9],
    m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
    dim: [0, 3, 6], m7b5: [0, 3, 6, 10], '7sus4': [0, 5, 7, 10], '13': [0, 4, 10, 14, 21]
  };
  function pcOf(letter, acc) { return (PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12; }
  var chordCache = {};
  function chord(name) {
    if (chordCache[name]) return chordCache[name];
    var m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(name) || ['', 'C', '', '', '', ''];
    var root = pcOf(m[1], m[2]);
    var iv = QUAL[m[3]] || QUAL[''];
    var c = {
      name: name, root: root, iv: iv,
      bass: m[4] ? pcOf(m[4], m[5]) : root,
      pcs: iv.map(function (i) { return (root + i) % 12; })
    };
    chordCache[name] = c;
    return c;
  }
  /* lowest MIDI note >= lo with pitch class pc */
  function above(pc, lo) { return lo + (((pc - lo) % 12) + 12) % 12; }
  /* close voicing of a chord's tones starting at lo (sorted, unique) */
  function stack(c, lo, skipRoot) {
    var out = [];
    for (var i = 0; i < c.pcs.length; i++) {
      if (skipRoot && c.pcs[i] === c.root && c.pcs.length > 3) continue;
      out.push(above(c.pcs[i], lo));
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /* ------------------------------------------------------------------ node helpers */

  function now() { return ctx.currentTime; }
  function gain(v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  function biquad(type, f, q, db) {
    var b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (db != null) b.gain.value = db;
    return b;
  }
  function osc(type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function noiseSrc(kind) {
    var s = ctx.createBufferSource();
    s.buffer = NOISE[kind] || NOISE.white;
    s.loop = true;
    return s;
  }
  function startNoise(s, t) { s.start(t, GR.f() * (s.buffer.duration - 0.1)); }
  function mono(node) { node.channelCount = 1; node.channelCountMode = 'explicit'; return node; }
  function pan(p) {
    if (ctx.createStereoPanner) { var s = ctx.createStereoPanner(); s.pan.value = clamp(p || 0, -1, 1); return s; }
    return gain(1);
  }
  /* connect to dest through a panner (or directly when p is 0/undefined) */
  function via(dest, p) { if (!p) return dest; var n = pan(p); n.connect(dest); return n; }

  /* AD envelope: 0 -> peak in a, hold h, exponential decay with time constant d. Returns end time. */
  function envAD(param, t, a, peak, d, h) {
    h = h || 0;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (h > 0) param.setValueAtTime(peak, t + a + h);
    param.setTargetAtTime(0, t + a + h, d);
    return t + a + h + d * 7;
  }

  /* oscillator one-shot. o: {type,f,f2,glide,lin,a,d,h,v,det} */
  function tone(dest, t, o) {
    var s = osc(o.type || 'sine', o.f), g = gain(0);
    if (o.f2) {
      s.frequency.setValueAtTime(o.f, t);
      if (o.lin) s.frequency.linearRampToValueAtTime(o.f2, t + (o.glide || 0.1));
      else s.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || 0.1));
    }
    if (o.det) s.detune.value = o.det;
    s.connect(g); g.connect(dest);
    var end = envAD(g.gain, t, o.a || 0.003, o.v, o.d || 0.1, o.h);
    s.start(t); s.stop(end + 0.02);
    return end;
  }
  /* filtered-noise one-shot. o: {n,ft,f,q,f2,sweep,a,d,h,v,mono,raw}. v is bandwidth-compensated
     (see ncomp) so a narrow band and a broad one with the same v land at a similar loudness. */
  function burst(dest, t, o) {
    var n = o.n || 'white', ft = o.ft || 'bandpass', q = o.q != null ? o.q : 1;
    var s = noiseSrc(n), f = biquad(ft, o.f || 1000, q), g = gain(0);
    var v = o.v * (o.raw ? 1 : ncomp(n, ft, o.f || 1000, q));
    if (o.mono !== false) mono(f);
    if (o.f2) {
      f.frequency.setValueAtTime(o.f, t);
      f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || (o.a || 0.002) + (o.h || 0) + (o.d || 0.05) * 3));
    }
    s.connect(f); f.connect(g); g.connect(dest);
    var end = envAD(g.gain, t, o.a || 0.002, v, o.d || 0.05, o.h);
    startNoise(s, t); s.stop(end + 0.02);
    return end;
  }
  /* bank of decaying sines (bells, metal, glass). ratios/amps/decays arrays */
  function partials(dest, t, f, ratios, amps, decays, v, a) {
    var end = t;
    for (var i = 0; i < ratios.length; i++) {
      var fr = f * ratios[i];
      if (fr > 9000) continue;
      end = Math.max(end, tone(dest, t, { f: fr, v: v * amps[i], d: decays[i], a: a || 0.002 }));
    }
    return end;
  }

  /* piecewise-linear automation that can be interrupted without clicks */
  function Auto(param, v) { this.p = param; this.pts = [[0, v]]; param.value = v; }
  Auto.prototype.val = function (t) {
    var p = this.pts, n = p.length;
    if (t <= p[0][0]) return p[0][1];
    for (var i = 1; i < n; i++) {
      if (t < p[i][0]) {
        var a = p[i - 1], b = p[i];
        return a[1] + (b[1] - a[1]) * (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      }
    }
    return p[n - 1][1];
  };
  Auto.prototype.go = function (segs, t) {
    var p = this.p, v = this.val(t), held = false;
    if (p.cancelAndHoldAtTime) { try { p.cancelAndHoldAtTime(t); held = true; } catch (e) { held = false; } }
    if (!held) { p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
    this.pts = [[t, v]];
    for (var i = 0; i < segs.length; i++) {
      t += Math.max(0.005, segs[i][0]);
      p.linearRampToValueAtTime(segs[i][1], t);
      this.pts.push([t, segs[i][1]]);
    }
  };
  /* equal-power style fade built from 8 linear segments */
  Auto.prototype.fade = function (target, dur, t) {
    var v0 = this.val(t), segs = [], N = 8;
    for (var i = 1; i <= N; i++) {
      var x = i / N;
      segs.push([dur / N, target >= v0 ? v0 + (target - v0) * Math.sin(x * Math.PI / 2)
                                       : target + (v0 - target) * Math.cos(x * Math.PI / 2)]);
    }
    this.go(segs, t);
  };

  /* ------------------------------------------------------------------ graph */

  function makeNoise(kind, seconds) {
    var sr = ctx.sampleRate, len = Math.floor(sr * seconds), X = Math.floor(sr * 0.05);
    var buf = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var R = Rand(hash(kind) + ch * 7919), tmp = new Float32Array(len + X);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, i, w;
      for (i = 0; i < len + X; i++) {
        w = R.f() * 2 - 1;
        if (kind === 'pink') {          // Paul Kellet's refined pink filter
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
          tmp[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
        } else if (kind === 'brown') {
          last = (last + 0.02 * w) / 1.02; tmp[i] = last;
        } else tmp[i] = w;
      }
      // seamless loop: crossfade the tail into the head
      for (i = 0; i < X; i++) { var x = i / X; tmp[i] = tmp[i] * x + tmp[len + i] * (1 - x); }
      // remove DC and normalise to RMS 0.2
      var mean = 0, ss = 0;
      for (i = 0; i < len; i++) mean += tmp[i];
      mean /= len;
      for (i = 0; i < len; i++) { tmp[i] -= mean; ss += tmp[i] * tmp[i]; }
      var sc = 0.2 / Math.sqrt(ss / len || 1), d = buf.getChannelData(ch);
      for (i = 0; i < len; i++) d[i] = tmp[i] * sc;
    }
    return buf;
  }

  /* procedural impulse response: decaying stereo noise that darkens as it decays */
  function makeIR(seconds) {
    var sr = ctx.sampleRate, len = Math.floor(sr * seconds), pre = Math.floor(sr * 0.012);
    var buf = ctx.createBuffer(2, len, sr), tau = seconds / 6.9;
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), R = Rand(ch ? 9173 : 1307), lp = 0;
      for (var i = pre; i < len; i++) {
        var t = (i - pre) / sr;
        var a = 0.12 + 0.6 * Math.exp(-t / 0.45);
        lp += a * ((R.f() * 2 - 1) - lp);
        var fadeIn = Math.min(1, t / 0.02);
        d[i] = lp * Math.exp(-t / tau) * fadeIn;
      }
      for (var k = 0; k < 7; k++) {                // a few early reflections
        var idx = pre + Math.floor(sr * R.r(0.004, 0.075));
        if (idx < len) d[idx] += R.r(-0.5, 0.5) * (1 - k / 9);
      }
    }
    return buf;
  }

  /* a delay line whose time is wobbled by two LFOs (tape wow + flutter) */
  function wowLine(base, wowRate, wowDepth, flRate, flDepth, list) {
    var d = ctx.createDelay(0.1);
    d.delayTime.value = base;
    var l1 = osc('sine', wowRate), g1 = gain(wowDepth), l2 = osc('sine', flRate), g2 = gain(flDepth);
    l1.connect(g1); g1.connect(d.delayTime); l2.connect(g2); g2.connect(d.delayTime);
    var t = ctx.currentTime;
    l1.start(t); l2.start(t);
    if (list) list.push(l1, l2);
    return { node: d, wow: g1, flutter: g2, lfos: [l1, l2] };
  }

  function Channel(name, opt) {
    var c = this;
    c.name = name;
    c.dry = gain(1); c.wet = gain(1);
    var d = c.dry, w = c.wet;
    if (opt.wow) {
      // delay lines for tape wow/flutter; their LFOs only exist while the tape is on (setWow)
      var dd = ctx.createDelay(0.05), dw = ctx.createDelay(0.05);
      dd.delayTime.value = dw.delayTime.value = 0.012;
      c.wowParams = [dd.delayTime, dw.delayTime];
      c.wowLfos = null;
      d.connect(dd); d = dd; w.connect(dw); w = dw;
    }
    if (opt.lp) {
      c.lpD = biquad('lowpass', 20000, 0.5); c.lpW = biquad('lowpass', 20000, 0.5);
      d.connect(c.lpD); d = c.lpD; w.connect(c.lpW); w = c.lpW;
    }
    if (opt.duck) {
      var gd = gain(1), gw = gain(1);
      c.duckD = new Auto(gd.gain, 1); c.duckW = new Auto(gw.gain, 1);
      d.connect(gd); d = gd; w.connect(gw); w = gw;
    }
    var vd = gain(vols[name]), vw = gain(vols[name]);
    c.volD = new Auto(vd.gain, vols[name]); c.volW = new Auto(vw.gain, vols[name]);
    d.connect(vd); vd.connect(G.master);
    w.connect(vw); vw.connect(G.verbIn);
  }

  /* start (or wind down) the music channel's wow + flutter; one LFO pair drives dry and wet alike */
  function setWow(c, on) {
    var t = ctx.currentTime, W;
    if (on) {
      if (c.wowLfos) return;
      var l1 = osc('sine', 0.55), l2 = osc('sine', 6.3), g1 = gain(0), g2 = gain(0);
      l1.connect(g1); l2.connect(g2);
      for (var i = 0; i < c.wowParams.length; i++) { g1.connect(c.wowParams[i]); g2.connect(c.wowParams[i]); }
      g1.gain.setTargetAtTime(0.001, t, 0.3); g2.gain.setTargetAtTime(0.00003, t, 0.3);
      l1.start(t); l2.start(t);
      c.wowLfos = { l: [l1, l2], g: [g1, g2] };
    } else if (c.wowLfos) {
      W = c.wowLfos; c.wowLfos = null;
      W.g[0].gain.setTargetAtTime(0, t, 0.3); W.g[1].gain.setTargetAtTime(0, t, 0.3);
      W.l[0].stop(t + 2.5); W.l[1].stop(t + 2.5);
      W.l[1].onended = function () { try { W.g[0].disconnect(); W.g[1].disconnect(); } catch (e) { /* ignore */ } };
    }
  }

  var MB_WAVE = null, GLOTTAL = null;

  function build() {
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }

    G.master = gain(vols.master);
    G.masterAuto = new Auto(G.master.gain, vols.master);
    var comp = G.comp = ctx.createDynamicsCompressor();
    // a gentle peak limiter: only the loudest moments touch it, slow-ish release avoids pumping
    comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.3;
    // the node adds automatic make-up gain (~2 dB at these settings); trim it back out
    G.trim = gain(0.8);
    G.master.connect(comp); comp.connect(G.trim); G.trim.connect(ctx.destination);

    // shared reverb on a send bus
    G.verbIn = gain(1);
    var hp = biquad('highpass', 160, 0.6), lp = biquad('lowpass', 6500, 0.5);
    G.verb = ctx.createConvolver();
    G.verb.buffer = makeIR(2.5);
    G.verbOut = gain(0.55);
    G.verbIn.connect(hp); hp.connect(lp); lp.connect(G.verb); G.verb.connect(G.verbOut); G.verbOut.connect(G.master);

    NOISE.white = makeNoise('white', 4);
    NOISE.pink = makeNoise('pink', 4);
    NOISE.brown = makeNoise('brown', 4);

    MB_WAVE = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 0, 0, 1, 0, 0.5]));
    // softened glottal-ish pulse for voices: harmonics falling ~12 dB/octave
    var re = new Float32Array(40), im = new Float32Array(40);
    for (var h = 1; h < 40; h++) im[h] = 1 / (h * h * 0.6 + h * 0.4);
    GLOTTAL = ctx.createPeriodicWave(re, im);

    chans.music = new Channel('music', { wow: true, lp: true, duck: true });
    chans.ambience = new Channel('ambience', {});
    chans.sfx = new Channel('sfx', {});

    // the "tape" bus for recorded voices: always a little wobbly and band-limited
    G.tapeIn = gain(1);
    var thp = biquad('highpass', 260, 0.7), tlp = biquad('lowpass', 3000, 0.6), tpk = biquad('peaking', 1400, 0.8, 3);
    var twet = gain(0.25);
    G.tapeIn.connect(thp); thp.connect(tpk); tpk.connect(tlp);
    tlp.connect(chans.sfx.dry); tlp.connect(twet); twet.connect(chans.sfx.wet);

    // resume on later gestures if the browser suspends us (iOS interruptions etc.)
    var kick = function () {
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    };
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) {
      try { window.addEventListener(ev, kick, { capture: true, passive: true }); } catch (e) { /* ignore */ }
    });

    timer = setInterval(tick, 100);
  }

  /* ------------------------------------------------------------------ voices & scheduler */

  var MAX_VOICES = 44, voiceEnds = [];
  function voiceOK(end) {
    var t = ctx.currentTime, n = 0;
    for (var i = 0; i < voiceEnds.length; i++) if (voiceEnds[i] > t) voiceEnds[n++] = voiceEnds[i];
    voiceEnds.length = n;
    if (n >= MAX_VOICES) return false;
    voiceEnds.push(end);
    return true;
  }

  /* remember a note's source so the layer can stop it at teardown */
  function own(L, src, end) { if (L.notes) L.notes.push({ s: src, e: end }); }

  var layers = [], timer = null, lastWall = 0, lookahead = 0.3, hb = null, activeSfx = [];

  function Layer(kind, id, chanName, def, seed) {
    var L = this;
    L.kind = kind; L.id = id; L.def = def;
    L.chan = chans[chanName];
    L.R = Rand(seed);
    L.sources = []; L.gens = []; L.q = []; L.qDirty = false; L.notes = []; L.prune = 0;
    L.dead = false; L.deadAt = 0;
    L.level = def.gain != null ? def.gain : 1;
    L.fadeD = gain(0); L.fadeW = gain(0);
    L.autoD = new Auto(L.fadeD.gain, 0); L.autoW = new Auto(L.fadeW.gain, 0);
    L.fadeD.connect(L.chan.dry); L.fadeW.connect(L.chan.wet);
    L.in = gain(1); L.dry = gain(1); L.wet = gain(1);
    L.send = gain(def.send != null ? def.send : 0.25);
    var head = L.in;
    if (def.wow) {
      var w = wowLine(0.02, def.wow[0], def.wow[1], def.wow[2] || 5.8, def.wow[3] || 0.00002, L.sources);
      head.connect(w.node); head = w.node;
    }
    head.connect(L.fadeD); head.connect(L.send); L.send.connect(L.fadeW);
    L.dry.connect(L.fadeD); L.wet.connect(L.fadeW);
    if (def.bpm) {
      L.beat = 60 / def.bpm;
      L.seq = { next: ctx.currentTime + 0.12, bar: 0, section: 0, pending: [] };
    }
  }
  Layer.prototype.keep = function () { for (var i = 0; i < arguments.length; i++) this.sources.push(arguments[i]); };
  Layer.prototype.fadeTo = function (v, dur) {
    var t = ctx.currentTime;
    this.autoD.fade(v, dur, t); this.autoW.fade(v, dur, t);
  };
  Layer.prototype.stop = function (fade) {
    fade = Math.max(0.04, fade);
    var end = ctx.currentTime + fade + 0.3;
    if (this.dead && end >= this.deadAt) return;     // already fading out at least this fast
    this.dead = true;
    this.fadeTo(0, fade);
    this.deadAt = end;
  };
  Layer.prototype.teardown = function () {
    var t = ctx.currentTime, i;
    for (i = 0; i < this.sources.length; i++) { try { this.sources[i].stop(); } catch (e) { /* already stopped */ } }
    for (i = 0; i < this.notes.length; i++) { if (this.notes[i].e > t) { try { this.notes[i].s.stop(); } catch (e) { /* ignore */ } } }
    this.notes = [];
    try { this.fadeD.disconnect(); } catch (e) { /* ignore */ }
    try { this.fadeW.disconnect(); } catch (e) { /* ignore */ }
    this.sources = []; this.gens = []; this.q = []; this.seq = null;
  };
  /* queue a callback at audio time t; it runs (creating nodes) once t is inside the lookahead window */
  Layer.prototype.at = function (t, fn) { this.q.push({ t: t, fn: fn }); this.qDirty = true; };
  /* queue an instrument note: inst(L, t, a, b, c, d) */
  Layer.prototype.play = function (t, inst, a, b, c, d) {
    var L = this;
    L.q.push({ t: t, fn: function (tt) { inst(L, tt, a, b, c, d); } });
    L.qDirty = true;
  };
  /* random-interval generator */
  Layer.prototype.every = function (min, max, fn, first) {
    this.gens.push({ next: ctx.currentTime + (first != null ? first : this.R.r(min * 0.3, max)), min: min, max: max, fn: fn });
  };
  /* random walk of an AudioParam (log = exponential distribution) */
  Layer.prototype.walk = function (param, lo, hi, tmin, tmax, tc, log) {
    var R = this.R;
    this.every(tmin, tmax, function (t) { param.setTargetAtTime(log ? R.exp(lo, hi) : R.r(lo, hi), t, tc); }, 0.05);
  };
  Layer.prototype.tick = function (t0, horizon) {
    var L = this, i;
    if (t0 > L.prune) {          // forget notes that have finished
      L.prune = t0 + 2;
      L.notes = L.notes.filter(function (n) { return n.e > t0; });
    }
    // plan bars
    if (L.seq) {
      if (L.seq.next < t0 - 0.2) L.seq.next = t0 + 0.05;      // fell behind (throttled tab): skip ahead
      var guard = 0;
      while (L.seq && L.seq.next < horizon && guard++ < 8) {
        if (!L.seq.pending.length) {
          L.seq.pending = L.def.section(L, L.seq.section++) || [];
          if (!L.seq.pending.length) { L.seq.next += 4 * L.beat; continue; }
        }
        var bar = L.seq.pending.shift();
        var beats = bar.len || L.def.beats || 4;
        bar(L.seq.next, L.beat, L.seq.bar++);
        L.seq.next += beats * L.beat;
      }
    }
    // generators
    for (i = 0; i < L.gens.length; i++) {
      var g = L.gens[i], n = 0;
      if (g.next < t0 - 0.25) g.next = t0 + L.R.r(0, g.min);
      while (g.next < horizon && n++ < 16) {
        g.fn(g.next);
        g.next += Math.max(0.02, L.R.r(g.min, g.max));
      }
    }
    // dispatch queued events
    if (L.qDirty) { L.q.sort(function (a, b) { return a.t - b.t; }); L.qDirty = false; }
    var q = L.q, k = 0;
    while (k < q.length && q[k].t < horizon) {
      var e = q[k++];
      if (e.t >= t0 - 0.06) e.fn(Math.max(e.t, t0));
    }
    if (k) q.splice(0, k);
  };

  function tick() {
    if (!ctx) return;
    try {
      var t0 = ctx.currentTime;
      var wall = (window.performance && performance.now) ? performance.now() : Date.now();
      var gap = lastWall ? (wall - lastWall) / 1000 : 0.1;
      lastWall = wall;
      // widen the window if timers are being throttled (background tab)
      lookahead = clamp(Math.max(lookahead * 0.9, gap * 1.6 + 0.1), 0.3, 2.5);
      var horizon = t0 + lookahead;
      for (var i = layers.length - 1; i >= 0; i--) {
        var L = layers[i];
        if (L.dead && t0 > L.deadAt) { L.teardown(); layers.splice(i, 1); continue; }
        try { L.tick(t0, horizon); } catch (e) { report(e); }
      }
      if (hb) {
        if (hb.next < t0 - 0.2) hb.next = t0 + 0.05;
        while (hb.next < horizon) { lubDub(chans.sfx.dry, hb.next, 0.5, hb.bpm); hb.next += 60 / hb.bpm; }
      }
      for (var j = activeSfx.length - 1; j >= 0; j--) {
        var s = activeSfx[j];
        if (t0 > s.end + 0.5) {
          try { s.g.disconnect(); } catch (e) { /* ignore */ }
          if (s.gw) { try { s.gw.disconnect(); } catch (e) { /* ignore */ } }
          if (s.x) { try { s.x.disconnect(); } catch (e) { /* ignore */ } }
          activeSfx.splice(j, 1);
        }
      }
    } catch (e) { report(e); }
  }

  /* ------------------------------------------------------------------ instruments */

  /* Music box: sine + quiet 3rd/5th partials, fast attack, ~1.5 s decay, random detune, pin tick */
  function musicBox(L, t, m, v, o) {
    o = o || {};
    if (!cap(L, t + 2.6)) return;
    var f = mtof(m) * cents(L.R.r(-6, 6) + (o.det || 0));
    var out = gain(v);
    out.connect(via(o.dest || L.mb || L.in, clamp((m - 76) / 14, -0.5, 0.5) + L.R.r(-0.12, 0.12)));
    var s1 = osc('sine', f), g1 = gain(0);
    s1.connect(g1); g1.connect(out);
    var tau = clamp(0.5 - (m - 72) * 0.012, 0.22, 0.6) * (o.decay || 1);
    g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(1, t + 0.003); g1.gain.setTargetAtTime(0, t + 0.003, tau);
    var s2 = ctx.createOscillator(), g2 = gain(0);
    s2.setPeriodicWave(MB_WAVE); s2.frequency.value = f * 1.003;
    s2.connect(g2); g2.connect(out);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.15, t + 0.002); g2.gain.setTargetAtTime(0, t + 0.002, tau * 0.25);
    burst(out, t, { f: 3000, q: 2.5, v: 0.1, d: 0.004 });
    s1.start(t); s2.start(t); s1.stop(t + 0.003 + tau * 7); s2.stop(t + 0.003 + tau * 2.5);
    own(L, s1, t + 0.003 + tau * 7); own(L, s2, t + 0.003 + tau * 2.5);
  }

  /* Electric piano: FM bark on attack, detuned second sine, short tine "bell"; goes through an EP bus (tremolo + LP) */
  function ePiano(L, t, m, dur, v, o) {
    o = o || {};
    var end = t + dur + 1.0;
    if (!cap(L, end)) return;
    var f = mtof(m), out = gain(0);
    out.connect(o.dest || L.ep || L.in);
    var c1 = osc('sine', f), c2 = osc('sine', f), md = osc('sine', f), mg = gain(0);
    c2.detune.value = 6 + L.R.r(-2, 2);
    md.connect(mg); mg.connect(c1.frequency);
    mg.gain.setValueAtTime(f * (0.6 + v * 1.6), t); mg.gain.setTargetAtTime(f * 0.1, t, 0.22);
    var c2g = gain(0.4);
    c1.connect(out); c2.connect(c2g); c2g.connect(out);
    var A = out.gain;
    A.setValueAtTime(0, t); A.linearRampToValueAtTime(v * 0.55, t + 0.004);
    A.setTargetAtTime(v * 0.2, t + 0.004, 0.8);
    A.setTargetAtTime(0, t + dur, 0.14);
    c1.start(t); c2.start(t); md.start(t);
    c1.stop(end); c2.stop(end); md.stop(end);
    own(L, c1, end); own(L, c2, end); own(L, md, end);
    if (m < 84) {
      var b = osc('sine', f * 7.03), bg = gain(0);
      b.connect(bg); bg.connect(out);
      bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.09 * v + 0.02, t + 0.002); bg.gain.setTargetAtTime(0, t + 0.002, 0.045);
      b.start(t); b.stop(t + 0.4);
    }
  }
  /* EP bus: warm LP + stereo tremolo (auto-pan) */
  function epBus(L, rate, depth, lpf) {
    var input = gain(1), lp = biquad('lowpass', lpf || 2400, 0.5);
    var lfo = osc('sine', rate || 4), gl = gain(1 - depth), gr = gain(1 - depth), dl = gain(depth), dr = gain(-depth);
    lfo.connect(dl); dl.connect(gl.gain); lfo.connect(dr); dr.connect(gr.gain);
    input.connect(lp); lp.connect(gl); lp.connect(gr);
    gl.connect(via(L.in, -0.4)); gr.connect(via(L.in, 0.4));
    lfo.start(ctx.currentTime); L.keep(lfo);
    return input;
  }

  /* Felt piano: sine/triangle blend, soft attack, harmonics decay via a falling low-pass */
  function felt(L, t, m, dur, v, o) {
    o = o || {};
    var decay = clamp(1.7 - (m - 48) * 0.022, 0.5, 2.2) * (o.decay || 1);
    var end = t + Math.min(dur + 1.6, 0.02 + decay * 7);
    if (!cap(L, end)) return;
    var f = mtof(m) * cents(L.R.r(-2, 2));
    var dest = via(o.dest || L.in, clamp((m - 62) / 36, -0.45, 0.45));
    var out = gain(0), lp = biquad('lowpass', 1000, 0.4);
    var s1 = osc('sine', f), s2 = osc('triangle', f), g2 = gain(0.55);
    s2.detune.value = 3;
    s1.connect(out); s2.connect(g2); g2.connect(lp); lp.connect(out); out.connect(dest);
    lp.frequency.setValueAtTime(Math.min(f * (2.5 + v * 6), 6000), t);
    lp.frequency.setTargetAtTime(Math.max(f * 1.1, 180), t + 0.02, 0.45);
    var A = out.gain;
    A.setValueAtTime(0, t); A.linearRampToValueAtTime(v, t + (o.a || 0.016)); A.setTargetAtTime(0, t + (o.a || 0.016), decay);
    A.setTargetAtTime(0, t + Math.max(dur, 0.05), 0.22);
    burst(dest, t, { n: 'pink', ft: 'lowpass', f: 380, q: 0.6, v: 0.18 * v, d: 0.012 });
    s1.start(t); s2.start(t); s1.stop(end); s2.stop(end);
    own(L, s1, end); own(L, s2, end);
  }

  /* Karplus-Strong pluck, rendered once per pitch into a buffer (no per-sample processing at runtime) */
  var ksCache = {};
  function ksBuf(m, kind) {
    var key = kind + m;
    if (ksCache[key]) return ksCache[key];
    var sr = Math.max(22050, Math.round(ctx.sampleRate / 2)), f = mtof(m);
    var N = Math.max(2, Math.floor(sr / f - 0.5)), fr = sr / (N + 0.5);
    var bass = kind === 'bass', secs = bass ? 1.7 : 2.6, len = Math.floor(sr * secs);
    var y = new Float32Array(len), R = Rand(hash(key)), ex = new Float32Array(N), lp = 0, mean = 0, i;
    var bright = bass ? 0.22 : (kind === 'lead' ? 0.6 : 0.4);
    for (i = 0; i < N; i++) { lp += bright * ((R.f() * 2 - 1) - lp); ex[i] = lp; mean += lp; }
    mean /= N;
    var P = Math.max(1, Math.floor(N * (bass ? 0.3 : 0.17)));
    var t60 = bass ? 1.5 : clamp(3.8 - (m - 50) * 0.07, 1.4, 3.8);
    var rho = Math.pow(0.001, 1 / (fr * t60));
    for (var n = 0; n < len; n++) {
      var x = n < N ? (ex[n] - mean) - (n >= P ? (ex[n - P] - mean) * 0.9 : 0) : 0;
      var a = n >= N ? y[n - N] : 0, b = n > N ? y[n - N - 1] : 0;
      y[n] = x + rho * 0.5 * (a + b);
    }
    var atk = Math.floor(sr * (bass ? 0.006 : 0.004)), pk = 0;
    for (i = 0; i < atk; i++) y[i] *= i / atk;               // soften the pick transient
    for (i = 0; i < len; i++) pk = Math.max(pk, Math.abs(y[i]));
    var fadeN = Math.floor(sr * 0.3), sc = 0.9 / (pk || 1);
    for (i = 0; i < len; i++) y[i] *= sc * (i > len - fadeN ? (len - i) / fadeN : 1);
    var buf = ctx.createBuffer(1, len, sr);
    buf.getChannelData(0).set(y);
    ksCache[key] = { buf: buf, rate: f / fr };
    return ksCache[key];
  }
  function pluck(L, t, m, v, o) {
    o = o || {};
    var k = ksBuf(m, o.kind || 'gtr'), rate = k.rate * cents(o.det || 0);
    var end = t + Math.min(o.dur ? o.dur + 0.5 : 99, k.buf.duration / rate);
    if (!cap(L, end)) return;
    var s = ctx.createBufferSource(), g = gain(v);
    s.buffer = k.buf; s.playbackRate.value = rate;
    s.connect(g); g.connect(via(o.dest || L.gtr || L.in, o.pan));
    if (o.dur) { g.gain.setValueAtTime(v, t + o.dur); g.gain.setTargetAtTime(0, t + o.dur, 0.07); }
    s.start(t); s.stop(end + 0.02);
    own(L, s, end);
  }

  /* Pads / strings: detuned oscillators per note into a shared moving low-pass (L.pad) */
  function padNote(L, t, m, dur, v, o) {
    o = o || {};
    var a = o.a != null ? o.a : 1.2, r = o.r != null ? o.r : 1.6, hold = Math.max(a, dur);
    var end = t + hold + r * 2.4;
    if (!cap(L, end)) return;
    var f = mtof(m), g = gain(0), types = o.types || ['sawtooth', 'triangle'], dets = o.dets || [-6, 6];
    g.connect(via(o.dest || L.pad || L.in, o.pan));
    for (var i = 0; i < types.length; i++) {
      var s = osc(types[i], f), d0 = dets[i % dets.length] + L.R.r(-2, 2);
      s.detune.setValueAtTime(d0, t);
      if (o.rise) s.detune.linearRampToValueAtTime(d0 + o.rise, end);
      s.connect(g); s.start(t); s.stop(end); own(L, s, end);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + hold);
    g.gain.setTargetAtTime(0, t + hold, r / 3);
  }
  function padBus(L, f, q, dest) { var lp = biquad('lowpass', f, q || 0.6); lp.connect(dest || L.in); return lp; }

  /* Calliope / organ pipe: triangle + square pair, scoop + vibrato, fixed per-pipe mistuning (L.tune) */
  function calliope(L, t, m, dur, v, o) {
    o = o || {};
    var end = t + dur + 0.35;
    if (!cap(L, end)) return;
    var off = (L.tune ? L.tune[((m % 24) + 24) % 24] : 0) + (o.det || 0);
    var f = mtof(m), g = gain(0);
    g.connect(via(o.dest || L.cal || L.in, o.pan));
    var tri = osc('triangle', f), sq = osc('square', f * 1.004), gs = gain(0.16);
    var n = Math.max(8, Math.ceil((dur + 0.3) * 60)), curve = new Float32Array(n);
    var ph = L.R.r(0, 6.28), rate = 5.5 + L.R.r(-0.5, 0.5);
    for (var i = 0; i < n; i++) {
      var tt = i / (n - 1) * (dur + 0.3);
      curve[i] = off - 30 * Math.exp(-tt / 0.03) + 9 * Math.sin(ph + 6.2832 * rate * tt) * Math.min(1, tt / 0.18);
    }
    tri.detune.setValueCurveAtTime(curve, t, dur + 0.3);
    sq.detune.setValueCurveAtTime(curve, t, dur + 0.3);
    tri.connect(g); sq.connect(gs); gs.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.022);
    g.gain.setTargetAtTime(v * 0.82, t + 0.022, 0.08);
    g.gain.setTargetAtTime(0, t + dur, 0.035);
    burst(g, t, { f: Math.min(f * 3, 5000), q: 2, v: 0.12, d: 0.02 });
    tri.start(t); sq.start(t); tri.stop(end); sq.stop(end);
    own(L, tri, end); own(L, sq, end);
  }

  /* Vibraphone-ish bell: fundamental + 4th harmonic; L.vib bus adds the motor tremolo */
  function vibes(L, t, m, v, o) {
    o = o || {};
    var end = t + 5;
    if (!cap(L, end)) return;
    var f = mtof(m), g = gain(0), s1 = osc('sine', f), s2 = osc('sine', f * 4.0), g2 = gain(0);
    s1.connect(g); s2.connect(g2); g2.connect(g); g.connect(via(o.dest || L.vib || L.in, o.pan));
    g2.gain.setValueAtTime(0.16, t); g2.gain.setTargetAtTime(0, t, 0.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, o.decay || 0.95);
    s1.start(t); s2.start(t); s1.stop(end); s2.stop(t + 1.5);
    own(L, s1, end); own(L, s2, t + 1.5);
  }
  function tremBus(L, rate, depth, dest) {
    var g = gain(1 - depth), lfo = osc('sine', rate), d = gain(depth);
    lfo.connect(d); d.connect(g.gain); g.connect(dest || L.in);
    lfo.start(ctx.currentTime); L.keep(lfo);
    return g;
  }

  /* soft drums */
  function kick(L, t, v, o) {
    var dest = (o && o.dest) || L.drums || L.in, s = osc('sine', 110), g = gain(0);
    s.frequency.setValueAtTime(115, t); s.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    s.connect(g); g.connect(dest);
    var end = envAD(g.gain, t, 0.004, v, 0.11);
    s.start(t); s.stop(end);
  }
  function brush(L, t, v, len) {
    var dest = L.drums || L.in;
    burst(dest, t, { f: 2600, f2: 1700, q: 0.6, a: 0.012 * (len || 1), v: v * 0.45, d: 0.07 * (len || 1), sweep: 0.15 * (len || 1) });
  }
  function hat(L, t, v) { burst(L.drums || L.in, t, { f: 7000, q: 1.2, v: v * 0.5, d: 0.018 }); }

  /* bird: a short distant song of 2-5 chirps */
  function bird(dest, t, R, v) {
    var n = R.i(2, 5), base = R.r(2300, 3600), kind = R.i(0, 2), tt = t;
    for (var i = 0; i < n; i++) {
      var d = R.r(0.05, 0.12), s = osc('sine', base), g = gain(0), b = base * R.r(0.92, 1.08);
      if (kind === 0) { s.frequency.setValueAtTime(b * 1.3, tt); s.frequency.exponentialRampToValueAtTime(b * 0.8, tt + d); }
      else if (kind === 1) { s.frequency.setValueAtTime(b * 0.8, tt); s.frequency.exponentialRampToValueAtTime(b * 1.25, tt + d); }
      else { s.frequency.setValueAtTime(b, tt); s.frequency.linearRampToValueAtTime(b * 1.3, tt + d * 0.5); s.frequency.linearRampToValueAtTime(b * 0.95, tt + d); }
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + d * 0.25); g.gain.linearRampToValueAtTime(0, tt + d);
      s.connect(g); g.connect(dest); s.start(tt); s.stop(tt + d + 0.02);
      tt += d + R.r(0.05, 0.17);
    }
    return tt;
  }

  /* ------------------------------------------------------------------ beds, speech, crowds */

  /* rough loudness compensation so filtered noise of any bandwidth lands near the same level */
  function ncomp(n, ft, f, q) {
    var nyq = ctx.sampleRate / 2, c = 1;
    q = q || 0.7;
    if (n === 'white') {
      if (ft === 'bandpass') c = Math.sqrt(nyq * q / f);
      else if (ft === 'lowpass') c = Math.sqrt(nyq / f);
    } else if (n === 'pink') {
      if (ft === 'bandpass') c = Math.sqrt(6.9 / Math.log((2 * q + 1) / Math.max(0.05, 2 * q - 1)));
      else if (ft === 'lowpass') c = Math.sqrt(6.9 / Math.log(Math.max(1.5, f / 20)));
      else if (ft === 'highpass') c = Math.sqrt(6.9 / Math.log(Math.max(1.5, 20000 / f)));
    }
    return Math.min(c, 24);
  }

  /* persistent noise bed: noise -> filter (-> filter2) -> gain. o.v is pre-compensation level */
  function bed(L, o) {
    var n = o.n || 'pink', ft = o.ft || 'lowpass', f0 = o.f || 1000, q = o.q != null ? o.q : 0.7;
    var s = noiseSrc(n), f = biquad(ft, f0, q), c = o.raw ? 1 : ncomp(n, ft, f0, q);
    var g = gain((o.v != null ? o.v : 0.2) * c);
    s.connect(f);
    var tail = f, f2 = null;
    if (o.ft2) { f2 = biquad(o.ft2, o.f2, o.q2 != null ? o.q2 : 0.7); f.connect(f2); tail = f2; }
    tail.connect(g); g.connect(o.dest || L.in);
    startNoise(s, ctx.currentTime); L.keep(s);
    if (o.walk) L.walk(g.gain, o.walk[0] * c, o.walk[1] * c, o.walk[2], o.walk[3], o.walk[4]);
    if (o.fwalk) L.walk(f.frequency, o.fwalk[0], o.fwalk[1], o.fwalk[2], o.fwalk[3], o.fwalk[4], true);
    return { s: s, f: f, f2: f2, g: g, c: c };
  }
  /* persistent oscillator */
  function steady(L, type, f, v, dest, det) {
    var s = osc(type, f), g = gain(v);
    if (det) s.detune.value = det;
    s.connect(g); g.connect(dest || L.in);
    s.start(ctx.currentTime); L.keep(s);
    return { s: s, g: g };
  }

  /* formant speech murmur: glottal buzz + breath noise through three moving formant filters */
  var VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [390, 1990, 2550], [570, 840, 2410],
                [440, 1020, 2240], [300, 870, 2240], [660, 1720, 2410], [490, 1350, 1690]];
  var VKIND = {
    girl:  { f0: 238, fs: 1.2, br: 0.35, jit: 0.025, rate: 1.0 },
    boy:   { f0: 172, fs: 1.1, br: 0.25, jit: 0.02, rate: 1.0 },
    woman: { f0: 200, fs: 1.14, br: 0.28, jit: 0.02, rate: 1.0 },
    man:   { f0: 108, fs: 1.0, br: 0.2, jit: 0.02, rate: 0.95 },
    old:   { f0: 168, fs: 1.06, br: 0.45, jit: 0.05, rate: 0.8, trem: 5.2 }
  };
  var VOICE_TRIM = { girl: 0.72, boy: 1.12, woman: 0.9, man: 1.7, old: 1 };
  function speak(dest, t, secs, kind, R, o) {
    o = o || {};
    var K = VKIND[kind] || VKIND.woman, end = t + secs, f0 = K.f0 * R.r(0.94, 1.06);
    var out = gain(o.v != null ? o.v : 1);
    out.connect(via(dest, o.pan));
    var buzz = ctx.createOscillator();
    buzz.setPeriodicWave(GLOTTAL); buzz.frequency.value = f0;
    var vg = gain(0), nz = noiseSrc('pink'), ng = mono(gain(0)), sib = mono(biquad('highpass', 2400, 0.7)), sg = gain(0);
    var body = biquad('lowpass', 420, 0.6), bg = gain(0.5);
    var F = [biquad('bandpass', 700, 5), biquad('bandpass', 1200, 7), biquad('bandpass', 2500, 9)];
    var FG = [gain(3.2), gain(2.6), gain(1.6)];
    buzz.connect(vg); vg.connect(body); body.connect(bg); bg.connect(out);
    nz.connect(ng); nz.connect(sib); sib.connect(sg); sg.connect(out);
    for (var i = 0; i < 3; i++) { vg.connect(F[i]); ng.connect(F[i]); F[i].connect(FG[i]); FG[i].connect(out); }
    var lfo = null;
    if (K.trem) {
      lfo = osc('sine', K.trem); var lg = gain(f0 * 0.035);
      lfo.connect(lg); lg.connect(buzz.frequency); lfo.start(t); lfo.stop(end + 0.4);
    }
    var tt = t + 0.04, sp = K.rate * (o.rate || 1);
    while (tt < end - 0.25) {
      var plen = Math.min(R.r(0.9, 3.0), end - tt - 0.05), p0 = tt, pEnd = tt + plen;
      var fA = f0 * R.r(1.06, 1.2), fB = f0 * R.r(0.8, 0.92), ask = R.chance(0.18);
      while (tt < pEnd - 0.12) {
        var nsyl = R.i(1, 3);
        for (var s = 0; s < nsyl && tt < pEnd - 0.1; s++) {
          var sd = R.r(0.09, 0.22) / sp, x = (tt - p0) / plen, pf = fA + (fB - fA) * x;
          if (ask && x > 0.7) pf *= 1 + (x - 0.7) * 0.9;
          var stress = s === 0 ? R.r(0.85, 1) : R.r(0.5, 0.8), c = R.f(), vt = tt;
          if (stress > 0.9) pf *= 1.07;
          if (c < 0.28) {                       // fricative onset
            sg.gain.setTargetAtTime(0.9 * stress, tt, 0.012);
            sg.gain.setTargetAtTime(0, tt + 0.05, 0.015);
            vt = tt + 0.05;
          } else if (c < 0.5) {                 // plosive: closure, then a puff
            ng.gain.setTargetAtTime(1.4 * stress, tt + 0.02, 0.004);
            ng.gain.setTargetAtTime(0, tt + 0.03, 0.01);
            vt = tt + 0.035;
          }
          var vw = VOWELS[R.i(0, VOWELS.length - 1)];
          for (var k = 0; k < 3; k++) F[k].frequency.setTargetAtTime(vw[k] * K.fs * R.r(0.95, 1.05), vt - 0.01, 0.025);
          buzz.frequency.setTargetAtTime(pf * (1 + R.r(-K.jit, K.jit)), vt, 0.03);
          vg.gain.setTargetAtTime(stress, vt, 0.02);
          vg.gain.setTargetAtTime(stress * 0.3, vt + sd * 0.65, 0.03);
          ng.gain.setTargetAtTime(K.br * 0.5 * stress, vt + 0.01, 0.03);
          tt = vt + sd;
        }
        vg.gain.setTargetAtTime(0, tt, 0.018);
        ng.gain.setTargetAtTime(0, tt, 0.02);
        tt += R.r(0.015, 0.08);
      }
      vg.gain.setTargetAtTime(0, tt, 0.03);
      ng.gain.setTargetAtTime(0, tt, 0.03);
      tt += R.r(0.28, 0.75) / sp;
    }
    var st = Math.min(tt, end);
    vg.gain.setTargetAtTime(0, st, 0.03); ng.gain.setTargetAtTime(0, st, 0.03); sg.gain.setTargetAtTime(0, st, 0.03);
    buzz.start(t); startNoise(nz, t);
    buzz.stop(end + 0.4); nz.stop(end + 0.4);
    return { out: out, end: end + 0.4 };
  }

  /* crowd babble: band-limited noise streams with syllabic amplitude + occasional formant voices */
  function crowd(L, o) {
    var dest = gain(o.v != null ? o.v : 1), lp = biquad('lowpass', o.lp || 3200, 0.5);
    dest.connect(lp); lp.connect(o.out || L.in);
    var body = bed(L, { n: 'pink', ft: 'bandpass', f: 650, q: 0.8, v: 0.3, dest: dest });
    L.walk(body.g.gain, 0.2 * body.c, 0.4 * body.c, 0.4, 1.5, 0.5);
    var c = ncomp('pink', 'bandpass', 800, 2.5);
    for (var i = 0; i < (o.n || 3); i++) {
      var s = noiseSrc('pink'), f = mono(biquad('bandpass', 800, 2.5)), g = gain(0);
      s.connect(f); f.connect(g); g.connect(via(dest, L.R.r(-0.7, 0.7)));
      startNoise(s, ctx.currentTime); L.keep(s);
      L.walk(f.frequency, 320, 1800, 0.08, 0.28, 0.035, true);
      L.walk(g.gain, 0, 0.45 * c, 0.07, 0.22, 0.03);
    }
    if (o.voices) {
      L.every(o.voices[0], o.voices[1], function (t) {
        speak(dest, t, L.R.r(0.5, 1.6), L.R.pick(['man', 'woman', 'man', 'woman', 'boy', 'girl']), L.R,
              { v: o.vv || 0.5, pan: L.R.r(-0.8, 0.8) });
      });
    }
    return dest;
  }

  /* ------------------------------------------------------------------ sound atoms (shared by ambience & sfx) */

  /* grainy noise scrape (pencil, match strike): one source, jittery gain */
  function scratch(dest, t, dur, f, q, v, R) {
    var s = noiseSrc('white'), b = mono(biquad('bandpass', f, q)), g = gain(0), c = ncomp('white', 'bandpass', f, q);
    s.connect(b); b.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    for (var tt = t; tt < t + dur; tt += R.r(0.006, 0.014)) g.gain.linearRampToValueAtTime(v * c * R.r(0.15, 1), tt);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
    startNoise(s, t); s.stop(t + dur + 0.05);
    return t + dur + 0.05;
  }
  /* wood creak: stick-slip pulse train exciting two body resonances */
  function creak(dest, t, R, v, dur) {
    dur = dur || R.r(0.4, 1.3);
    var s = osc('sawtooth', R.r(28, 60)), f1 = biquad('bandpass', R.r(450, 900), 4), f2 = biquad('bandpass', R.r(1300, 2300), 5);
    var g = gain(0), g2 = gain(0.5), end = t + dur;
    s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    for (var tt = t; tt < end; tt += R.r(0.04, 0.13)) {
      s.frequency.setTargetAtTime(R.r(20, 80), tt, 0.04);
      g.gain.setTargetAtTime(v * R.r(0.2, 1) * 2.2, tt, 0.03);
    }
    g.gain.setTargetAtTime(0, end, 0.05);
    s.start(t); s.stop(end + 0.4);
    return end + 0.4;
  }
  function knock(dest, t, R, v) {
    tone(dest, t, { f: R.r(150, 200), f2: 105, glide: 0.06, v: v * 0.7, d: 0.035, a: 0.001 });
    burst(dest, t, { f: R.r(450, 700), q: 1.6, v: v * 0.2, d: 0.028, a: 0.001 });
    burst(dest, t, { ft: 'highpass', f: 2500, v: v * 0.5, d: 0.006, a: 0.0005 });
    return t + 0.3;
  }
  function step(dest, t, R, v, p) {
    var d = via(dest, p);
    burst(d, t, { n: 'pink', ft: 'lowpass', f: 320, q: 0.9, v: 1.6 * v, d: 0.035, a: 0.003 });
    tone(d, t, { f: 95, f2: 60, glide: 0.05, v: 0.45 * v, d: 0.04 });
    burst(d, t + R.r(0.05, 0.08), { f: R.r(900, 1600), q: 0.9, v: 0.2 * v, d: 0.03, a: 0.006 });
  }
  function tick1(dest, t, f, v) {
    burst(dest, t, { f: f, q: 4, v: v, d: 0.005, a: 0.0005 });
    tone(dest, t, { f: f * 0.37, v: v * 0.05, d: 0.018 });
  }
  function drip(dest, t, R, v) {
    var f = R.r(700, 1500);
    tone(dest, t, { f: f, f2: f * R.r(1.6, 2.2), glide: 0.025, v: v, d: 0.025, a: 0.001 });
  }
  function clink(dest, t, R, v) {
    var f = R.r(1900, 3200);
    return partials(dest, t, f, [1, 2.32, 4.07], [1, 0.4, 0.15], [0.12, 0.05, 0.02], v);
  }
  function metal(dest, t, R, v, base) {
    var f = base || R.r(180, 380);
    burst(dest, t, { n: 'pink', ft: 'lowpass', f: 1800, v: v * 1.2, d: 0.03 });
    return partials(dest, t, f, [1, 2.11, 3.53, 5.2, 7.1], [1, 0.7, 0.5, 0.3, 0.15], [0.5, 0.35, 0.22, 0.12, 0.07], v * 0.35);
  }
  function cricket(dest, t, f, v, pulses) {
    var s = osc('sine', f), g = gain(0), n = pulses || 3, tt = t;
    s.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    for (var i = 0; i < n; i++) {
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.004);
      g.gain.setValueAtTime(v, tt + 0.011); g.gain.linearRampToValueAtTime(0, tt + 0.016);
      tt += 0.03;
    }
    s.start(t); s.stop(tt + 0.02);
  }
  function bark(dest, t, R, v) {
    var n = R.i(1, 3), tt = t;
    for (var i = 0; i < n; i++) {
      var s = osc('sawtooth', 420), f1 = biquad('bandpass', 650, 3), f2 = biquad('bandpass', 1500, 4), g = gain(0), g2 = gain(0.6);
      s.frequency.setValueAtTime(R.r(380, 460), tt); s.frequency.exponentialRampToValueAtTime(R.r(220, 280), tt + 0.13);
      s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(dest);
      envAD(g.gain, tt, 0.012, v, 0.045, 0.05);
      burst(dest, tt, { f: 900, q: 1, v: v * 0.12, d: 0.05 });
      s.start(tt); s.stop(tt + 0.5);
      tt += R.r(0.28, 0.4);
    }
    return tt;
  }
  function laugh(dest, t, R, v) {
    var n = R.i(3, 6), tt = t, f0 = R.r(150, 260);
    for (var i = 0; i < n; i++) {
      var s = ctx.createOscillator(), f1 = biquad('bandpass', 800, 4), f2 = biquad('bandpass', 1300, 5), g = gain(0), g2 = gain(0.6);
      s.setPeriodicWave(GLOTTAL);
      s.frequency.setValueAtTime(f0 * (1.15 - i * 0.04), tt); s.frequency.linearRampToValueAtTime(f0 * (1.05 - i * 0.04), tt + 0.1);
      s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(dest);
      envAD(g.gain, tt, 0.015, v * 6 * (1 - i * 0.08), 0.04, 0.05);
      burst(dest, tt, { n: 'pink', f: 1200, q: 1, a: 0.01, v: v * 0.25, d: 0.04 });
      s.start(tt); s.stop(tt + 0.4);
      tt += R.r(0.15, 0.2);
    }
  }
  function cough(dest, t, R, v) {
    var n = R.i(1, 2), tt = t;
    for (var i = 0; i < n; i++) {
      burst(dest, tt, { n: 'white', f: R.r(500, 800), q: 1.2, a: 0.008, v: v * 0.25, d: 0.07, h: 0.03 });
      burst(dest, tt, { n: 'white', f: R.r(1400, 2000), q: 1.5, a: 0.008, v: v * 0.12, d: 0.05, h: 0.02 });
      tone(dest, tt, { f: R.r(110, 160), v: v * 0.12, a: 0.01, d: 0.05 });
      tt += R.r(0.25, 0.35);
    }
  }
  function carPass(dest, t, R, v, dur) {
    dur = dur || R.r(4, 7);
    var s = noiseSrc('brown'), s2 = noiseSrc('pink'), lp = mono(biquad('lowpass', 300, 0.8)), lp2 = mono(biquad('bandpass', 900, 0.7));
    var g = gain(0), p = pan(0), dir = R.chance(0.5) ? 1 : -1, mid = t + dur * R.r(0.45, 0.55);
    var g2 = gain(0.4 * ncomp('pink', 'bandpass', 900, 0.7));
    s.connect(lp); s2.connect(lp2); lp2.connect(g2); lp.connect(g); g2.connect(g); g.connect(p); p.connect(dest);
    if (p.pan) { p.pan.setValueAtTime(-0.8 * dir, t); p.pan.linearRampToValueAtTime(0.8 * dir, t + dur); }
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(900, mid); lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    lp2.frequency.setValueAtTime(700, t); lp2.frequency.exponentialRampToValueAtTime(1300, mid); lp2.frequency.exponentialRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.25, mid - dur * 0.2);
    g.gain.linearRampToValueAtTime(v, mid); g.gain.linearRampToValueAtTime(v * 0.25, mid + dur * 0.2); g.gain.linearRampToValueAtTime(0, t + dur);
    startNoise(s, t); startNoise(s2, t); s.stop(t + dur + 0.1); s2.stop(t + dur + 0.1);
  }
  function horn(dest, t, R, v) {
    var lp = biquad('lowpass', 1400, 0.7), g = gain(0), d = R.r(0.25, 0.45);
    lp.connect(g); g.connect(dest);
    [R.r(340, 360), R.r(425, 445)].forEach(function (f) { var s = osc('sawtooth', f); s.connect(lp); s.start(t); s.stop(t + d + 0.2); });
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.05);
  }
  function lap(dest, t, R, v) {
    burst(dest, t, { n: 'brown', ft: 'lowpass', f: R.r(350, 700), q: 0.7, a: R.r(0.06, 0.15), v: v, d: R.r(0.12, 0.3) });
    burst(dest, t + 0.05, { n: 'pink', ft: 'bandpass', f: R.r(900, 1600), q: 1, a: 0.04, v: v * 0.25, d: 0.08 });
  }
  function flick(dest, t, R, v) {
    var n = R.i(3, 8), tt = t;
    for (var i = 0; i < n; i++) { burst(dest, tt, { f: R.r(900, 2200), q: 1.4, v: v * R.r(0.15, 0.3), d: 0.012 }); tt += R.r(0.06, 0.13); }
  }
  /* a breathy, formant-shaped whisper (noise only) */
  function whisperFx(dest, t, dur, R, v) {
    var s = noiseSrc('white'), out = gain(v), g = mono(gain(0)), lp = biquad('lowpass', 6000, 0.5);
    var F = [biquad('bandpass', 700, 4), biquad('bandpass', 1300, 5), biquad('bandpass', 2600, 6)], FG = [gain(4), gain(3), gain(2.2)];
    var sib = biquad('highpass', 3800, 0.8), sg = gain(0);
    s.connect(g); s.connect(sib); sib.connect(sg); sg.connect(lp);
    for (var i = 0; i < 3; i++) { g.connect(F[i]); F[i].connect(FG[i]); FG[i].connect(lp); }
    lp.connect(out); out.connect(dest);
    var tt = t + 0.02, end = t + dur;
    while (tt < end - 0.1) {
      var sd = R.r(0.12, 0.25), vw = VOWELS[R.i(0, VOWELS.length - 1)];
      if (R.chance(0.35)) { sg.gain.setTargetAtTime(0.5, tt, 0.015); sg.gain.setTargetAtTime(0, tt + 0.07, 0.02); tt += 0.07; }
      for (var k = 0; k < 3; k++) F[k].frequency.setTargetAtTime(vw[k] * 1.15, tt, 0.03);
      g.gain.setTargetAtTime(R.r(0.6, 1), tt, 0.03);
      g.gain.setTargetAtTime(0.1, tt + sd * 0.7, 0.04);
      tt += sd;
    }
    g.gain.setTargetAtTime(0, Math.min(tt, end), 0.05); sg.gain.setTargetAtTime(0, Math.min(tt, end), 0.03);
    startNoise(s, t); s.stop(end + 0.4);
    return end + 0.4;
  }
  function thump(dest, t, v, f) {
    tone(dest, t, { f: f * 1.5, f2: f * 0.75, glide: 0.07, v: v * 0.9, d: 0.06, a: 0.006 });
    tone(dest, t, { f: f * 3, f2: f * 1.5, glide: 0.05, v: v * 0.22, d: 0.03, a: 0.004 });
    burst(dest, t, { n: 'brown', ft: 'lowpass', f: 200, v: v * 1.0, d: 0.04, a: 0.005 });
  }
  function lubDub(dest, t, v, bpm) {
    var gap = clamp(0.3 * Math.sqrt(70 / (bpm || 70)), 0.16, 0.36);
    thump(dest, t, v, 58);
    thump(dest, t + gap, v * 0.7, 66);
    return t + gap + 0.5;
  }

  /* ------------------------------------------------------------------ music: material */

  /* "À la claire fontaine" — traditional French / French-Canadian folk song (public domain).
     The melody as sung in Quebec (the "ballade" tune), transcribed from the LilyPond score in
     the French Wikipedia article "À la claire fontaine" (section "Musique": F major, 2/4) and
     cross-checked against the tone set do-re-mi-sol / duple meter listed by Beth's Notes
     (bethsnotesplus.com). Each entry is [MIDI pitch, duration in eighth notes]; 12 bars of 2/4. */
  var CLAIRE_FONTAINE = [
    [65, 2], [65, 1], [69, 1],   [69, 1], [67, 1], [69, 1], [67, 1],                 // À la clai-re fon-tai-ne
    [65, 2], [65, 1], [69, 1],   [69, 1], [67, 1], [69, 2],                          // m'en al-lant pro-me-ner,
    [69, 2], [69, 1], [67, 1],   [65, 1], [69, 1], [72, 1], [69, 1],                 // j'ai trou-vé l'eau si bel-le
    [72, 2], [72, 1], [69, 1],   [65, 1], [69, 1], [67, 2],                          // que je m'y suis bai-gnée.
    [65, 2], [65, 1], [69, 1],   [69, 1], [67, 0.5], [65, 0.5], [69, 1], [65, 1],    // Il y a long-temps que je t'ai-me,
    [69, 2], [69, 1], [67, 0.5], [65, 0.5],   [69, 1], [67, 1], [65, 2]              // ja-mais je ne t'ou-blie-rai.
  ];
  /* harmony per bar, after the piano part of the same score (two names = half a bar each) */
  var CF_CHORDS = [['F'], ['Bbmaj7'], ['F/A'], ['C'], ['F', 'A7'], ['Dm'], ['F/A'], ['G7/B', 'C'],
                   ['F'], ['F7/Eb', 'Bb/D'], ['F/C', 'G7/B'], ['C7', 'F']];
  function toBars(mel, per) {
    var bars = [], cur = [], pos = 0;
    for (var i = 0; i < mel.length; i++) {
      cur.push({ o: pos, m: mel[i][0], d: mel[i][1] });
      pos += mel[i][1];
      if (pos >= per - 1e-6) { bars.push(cur); cur = []; pos = 0; }
    }
    if (cur.length) bars.push(cur);
    return bars;
  }
  var CF_BARS = toBars(CLAIRE_FONTAINE, 4);
  var F_MAJOR = [5, 7, 9, 10, 0, 2, 4];

  /* an original carousel waltz for Canal Days (C major, 3/4) and its trio strain (F major) */
  var WALTZ_A = [[67, 2], [64, 1], [67, 2], [64, 1], [67, 1], [69, 1], [71, 1], [72, 3],
                 [77, 2], [74, 1], [77, 2], [74, 1], [77, 1], [76, 1], [74, 1], [71, 3],
                 [69, 2], [65, 1], [69, 2], [65, 1], [69, 1], [71, 1], [72, 1], [74, 3],
                 [67, 2], [64, 1], [67, 2], [72, 1], [71, 2], [74, 1], [72, 3]];
  var WALTZ_A_CH = ['C', 'C', 'C', 'C', 'G7', 'G7', 'G7', 'G7', 'Dm', 'Dm', 'G7', 'G7', 'C', 'C', 'G7', 'C'];
  var WALTZ_B = [[65, 1], [69, 1], [72, 1], [77, 2], [76, 1], [76, 2], [72, 1], [69, 3],
                 [70, 1], [74, 1], [77, 1], [79, 2], [77, 1], [76, 2], [79, 1], [77, 3]];
  var WALTZ_B_CH = ['F', 'F', 'C7', 'F', 'Bb', 'Gm7', 'C7', 'F'];
  var WALTZ_A_BARS = toBars(WALTZ_A, 3), WALTZ_B_BARS = toBars(WALTZ_B, 3);

  function cap(L, end) { return L.nocap || voiceOK(end); }
  function stepIn(scale, m, dir) {           // move m one scale step up (dir 1) or down (-1)
    for (var k = 1; k < 4; k++) { var x = m + dir * k; if (scale.indexOf(((x % 12) + 12) % 12) >= 0) return x; }
    return m + dir;
  }
  function nearest(pcs, x) {                 // chord tone nearest to x
    var best = x, bd = 99;
    for (var i = 0; i < pcs.length; i++) for (var o = -1; o <= 1; o++) {
      var m = above(pcs[i], x - 6) + o * 12, d = Math.abs(m - x);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  /* rootless jazz voicing (3rd, 7th, 9th/5th) between G3 and ~F#4 */
  function rootless(c) {
    var pcs = c.pcs.filter(function (p) { return p !== c.root; }), q = c.iv;
    if (q.length === 4 && (q[3] === 11 || (q[1] === 3 && q[3] === 10))) pcs.push((c.root + 2) % 12);
    var out = pcs.map(function (p) { return above(p, 55); });
    out.sort(function (a, b) { return a - b; });
    return out;
  }
  /* soft low pad chord: bass + up to 3 close tones */
  function padChord(L, t, name, dur, v, o) {
    o = o || {};
    var c = chord(name), b = above(c.bass, o.bassLo || 41), up = stack(c, o.lo || 53, true).slice(0, o.n || 3);
    var a = o.a != null ? o.a : 0.6, r = o.r != null ? o.r : 1.2;
    L.play(t, padNote, b, dur, v * 1.1, { a: a, r: r, dest: o.dest, types: o.types });
    for (var i = 0; i < up.length; i++) L.play(t + i * 0.03, padNote, up[i], dur, v, { a: a, r: r, dest: o.dest, types: o.types });
  }
  function clockTick(L, t, f, v) { tick1(L.tickBus || L.dry, t, f, v); }
  function rest(n) { var a = []; for (var i = 0; i < n; i++) a.push(function () {}); return a; }

  var MUSIC = {};

  /* ---- title: June's theme — music box "À la claire fontaine" over a soft low pad, worn tape */
  MUSIC.title = {
    bpm: 66, beats: 2, gain: 1.2, send: 0.6, wow: [0.42, 0.0011, 5.5, 0.00002],
    setup: function (L) {
      L.pad = padBus(L, 650, 0.5);
      L.mb = biquad('lowpass', 5200, 0.5); L.mb.connect(L.in);
    },
    section: function (L, n) {
      if (n === 0) {
        return [function (t, beat) { padChord(L, t, 'F', 4 * beat, 0.05, { a: 1.6 }); L.play(t + beat, musicBox, 84, 0.16); },
                function (t, beat) { L.play(t + beat * 0.5, musicBox, 81, 0.13); }];
      }
      var k = (n - 1) % 3;
      if (k === 0) return cfVerse(L, 'plain');
      if (k === 1) return cfVerse(L, L.R.pick(['octave', 'echo', 'low', 'plain']));
      return titleInterlude(L);
    }
  };
  function cfVerse(L, style) {
    var bars = [];
    for (var b = 0; b < 12; b++) bars.push(cfVerseBar(L, b, style));
    return bars;
  }
  function cfVerseBar(L, b, style) {
    return function (t, beat) {
      var e = beat / 2, R = L.R, ch = CF_CHORDS[b], cd = 2 * beat / ch.length, i;
      for (i = 0; i < ch.length; i++) padChord(L, t + i * cd, ch[i], cd * 0.92, style === 'low' ? 0.03 : 0.036);
      var notes = CF_BARS[b], second = b % 2 === 1;
      for (i = 0; i < notes.length; i++) {
        var nt = notes[i], m = nt.m + (style === 'low' ? 0 : 12) + (style === 'octave' && b >= 8 ? 12 : 0);
        var v = 0.36 * (!second && i === 0 ? 1.1 : 1) * (nt.d >= 2 ? 1.05 : 0.92) * R.r(0.9, 1.05);
        if (second && i === notes.length - 1) v *= 0.82;
        var at = t + nt.o * e + R.r(-0.012, 0.012);
        if (i > 0 && R.chance(0.05)) L.play(at - 0.07, musicBox, stepIn(F_MAJOR, m, 1), v * 0.4);
        L.play(at, musicBox, m, v);
        if (style === 'echo' && nt.d >= 2) L.play(at + e, musicBox, m + 12, v * 0.32);
        if (style === 'octave' && second && i === notes.length - 1) L.play(at + 0.02, musicBox, m + 12, v * 0.4);
      }
    };
  }
  function titleInterlude(L) {
    var prog = L.R.pick([['F', 'Bbmaj7', 'Dm', 'C'], ['Bbmaj7', 'F/A', 'Gm7', 'C'], ['Dm', 'Bbmaj7', 'F', 'C']]);
    var bars = prog.map(function (name) {
      return function (t, beat) {
        var R = L.R, tones = stack(chord(name), 72), k = R.i(1, 3);
        padChord(L, t, name, 2 * beat * 0.95, 0.036);
        for (var j = 0; j < k; j++) {
          L.play(t + R.i(0, 3) * beat / 2 + R.r(0, 0.02), musicBox, R.pick(tones) + (R.chance(0.3) ? 12 : 0), R.r(0.12, 0.2));
        }
      };
    });
    bars.push(function (t, beat) { padChord(L, t, 'C', 4 * beat * 0.95, 0.035, { a: 1 }); });
    return bars.concat(rest(1));
  }

  /* ---- june: the melody alone, slower, half-remembered */
  MUSIC.june = {
    bpm: 54, beats: 2, gain: 1.19, send: 0.75, wow: [0.33, 0.0017, 5.2, 0.00003],
    setup: function (L) { L.mb = biquad('lowpass', 4200, 0.5); L.mb.connect(L.in); },
    section: function (L, n) {
      var R = L.R, stop = n > 0 && R.chance(0.3) ? R.pick([4, 6, 8]) : 12, bars = [];
      for (var b = 0; b < stop; b++) bars.push(juneBar(L, b, stop));
      return bars.concat(rest(R.i(2, 4)));
    }
  };
  function juneBar(L, b, stop) {
    var last = b === stop - 1;
    var f = function (t, beat) {
      var e = beat / 2, R = L.R, notes = CF_BARS[b];
      for (var i = 0; i < notes.length; i++) {
        var nt = notes[i];
        if (!(b === 0 && i === 0) && R.chance(0.12)) continue;          // a note drops out
        var slow = last ? 1 + nt.o * 0.07 : 1;                         // the spring winding down
        var v = 0.3 * R.r(0.8, 1.05) * (nt.d >= 2 ? 1.05 : 0.9);
        L.play(t + nt.o * e * slow + R.r(-0.02, 0.02), musicBox, nt.m + 12, v, { decay: 1.2 });
      }
    };
    if (last || b % 4 === 3) f.len = 2.35;
    return f;
  }

  /* ---- larch: grandmother's house — slow Rhodes, Am F C G with an uneasy turn, a clock */
  MUSIC.larch = {
    bpm: 70, beats: 4, gain: 0.53, send: 0.3, wow: [0.5, 0.0007, 6, 0.00002],
    setup: function (L) { L.ep = epBus(L, 4.2, 0.2, 2200); L.tickBus = gain(1); L.tickBus.connect(L.dry); },
    section: function (L, n) {
      var R = L.R, A = ['Am7', 'Fmaj7', 'C', 'G'];
      var B = n === 0 ? ['Am7', 'Fmaj7', 'C', 'E'] : R.pick([['Am7', 'Fmaj7', 'C', 'E'], ['Am7', 'Fmaj7', 'Fm', 'C'], ['Fmaj7', 'G', 'Em7', 'E']]);
      var mel = n > 0 && R.chance(0.55);
      return A.concat(B).map(function (name, i) { return larchBar(L, name, mel, n === 0 && i < 2); });
    }
  };
  function larchBar(L, name, mel, sparse) {
    return function (t, beat) {
      var R = L.R, c = chord(name), bass = above(c.bass, 40), up = stack(c, 55, true).slice(0, 4), j, b;
      var pat = sparse ? 0 : R.pick([0, 0, 1, 2]);
      var hits = pat === 0 ? [[0, 3.7]] : pat === 1 ? [[0, 2.8], [3, 0.9]] : [[0, 1.4], [1.5, 2.3]];
      for (var h = 0; h < hits.length; h++) {
        var v = (h === 0 ? 0.42 : 0.3) * R.r(0.9, 1.05);
        for (j = 0; j < up.length; j++) L.play(t + hits[h][0] * beat + j * 0.012 + R.r(0, 0.01), ePiano, up[j], hits[h][1] * beat, v);
      }
      L.play(t, ePiano, bass, 3.6 * beat, 0.45);
      if (R.chance(0.3)) L.play(t + 3 * beat, ePiano, bass + 7, 0.9 * beat, 0.28);
      if (mel && R.chance(0.7)) {
        var ct = stack(c, 69), safe = name !== 'E' && name !== 'Fm', scale = [69, 71, 72, 74, 76, 77, 79];
        var k = R.i(1, 3), pos = R.pick([1, 1.5, 2]);
        for (j = 0; j < k; j++) L.play(t + (pos + j * 0.5) * beat, ePiano, (j < k - 1 && safe) ? R.pick(scale) : R.pick(ct), 0.9 * beat, 0.26);
      }
      for (b = 0; b < 4; b++) L.play(t + b * beat, clockTick, b % 2 ? 2300 : 2700, 0.05);
    };
  }

  /* ---- school: plucked guitar arpeggios in D with a IV-minor turn, brushes, bass */
  var SCHOOL = {
    A1: ['D', 'Dsus2', 'Bm7', 'G'], A2: ['D', 'A/C#', 'G', 'Gm'],
    B1: ['Em7', 'G', 'D', 'A'], B2: ['Bm7', 'G', 'Gm6', 'A'],
    C1: ['G', 'A', 'F#m', 'Bm'], C2: ['G', 'Gm', 'D', 'D']
  };
  var ARP = [[0, 2, 3, 2, 1, 2, 3, 2], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 2], [0, 3, 2, 3, 1, 3, 2, 3]];
  MUSIC.school = {
    bpm: 96, beats: 4, gain: 1.5, send: 0.2,
    setup: function (L) {
      L.gtr = biquad('lowpass', 3800, 0.5); L.gtr.connect(L.in);
      L.drums = gain(1); L.drums.connect(L.in);
      L.bassBus = biquad('lowpass', 900, 0.6); L.bassBus.connect(L.dry);
      L.arp = 0;
    },
    section: function (L, n) {
      var R = L.R, S = SCHOOL, list, o = { drums: true, lead: false, half: false };
      if (n === 0) {
        list = ['D', 'Dsus2'].concat(S.A1, S.A2);
        return list.map(function (name, i) { return schoolBar(L, name, { drums: i >= 2, lead: false }); });
      }
      var k = (n - 1) % 3;
      if (k === 0) { list = S.B1.concat(S.B2); o.lead = true; }
      else if (k === 1) { list = R.chance(0.35) ? S.C1.concat(S.C2) : S.A1.concat(S.A2); o.lead = R.chance(0.3); }
      else { list = S.A1.concat(S.A2); o.half = R.chance(0.5); }
      L.arp = R.i(0, ARP.length - 1);
      return list.map(function (name) { return schoolBar(L, name, o); });
    }
  };
  function schoolBar(L, name, o) {
    return function (t, beat) {
      var R = L.R, c = chord(name), e = beat / 2, i;
      var bass = above(c.bass, 43), tones = [bass].concat(stack(c, bass + 5));
      var pat = ARP[R.chance(0.2) ? R.i(0, ARP.length - 1) : L.arp];
      for (i = 0; i < 8; i++) {
        var m = tones[Math.min(pat[i], tones.length - 1)];
        L.play(t + i * e + R.r(0, 0.012), pluck, m, (i % 2 ? 0.26 : 0.34) * R.r(0.85, 1.05), { pan: (m - 57) / 40 });
      }
      if (o.drums) {
        var bn = bass - 12;
        L.play(t, pluck, bn, 0.34, { kind: 'bass', dur: beat * 1.6, dest: L.bassBus });
        L.play(t + 2 * beat, pluck, R.chance(0.6) ? bn : bn + 7, 0.3, { kind: 'bass', dur: beat * 1.4, dest: L.bassBus });
        if (R.chance(0.3)) L.play(t + 3.5 * beat, pluck, bn + R.pick([2, -1, 5]), 0.28, { kind: 'bass', dur: e * 0.9, dest: L.bassBus });
        L.play(t, kick, 0.24);
        if (!o.half) L.play(t + 2 * beat, kick, 0.21);
        if (R.chance(0.3)) L.play(t + 2.5 * beat, kick, 0.18);
        L.play(t + beat, brush, 0.5, 1.3);
        L.play(t + 3 * beat, brush, o.half ? 0.35 : 0.5, 1.3);
        for (i = 0; i < 8; i++) if (R.chance(0.85)) L.play(t + i * e + R.r(0, 0.01), hat, (i % 2 ? 0.1 : 0.16) * R.r(0.7, 1));
      }
      if (o.lead && R.chance(0.65)) {
        var ct = stack(c, 69);
        L.play(t + R.pick([0, 0.5, 1]) * beat, pluck, R.pick(ct), 0.28, { kind: 'lead', pan: 0.2 });
        if (R.chance(0.5)) L.play(t + 2.5 * beat, pluck, R.pick(ct) + R.pick([0, 12]), 0.22, { kind: 'lead', pan: 0.2 });
      }
    };
  }

  /* ---- town: downtown in daylight — maj7/min7 Rhodes, walking-ish bass, light brushes */
  var TOWN = [['Cmaj7', 'Am7', 'Dm7', 'G7'], ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], ['Em7', 'A7', 'Dm7', 'G7'], ['Fmaj7', 'Fm6', 'Em7', 'A7']];
  MUSIC.town = {
    bpm: 84, beats: 4, gain: 0.6, send: 0.24,
    setup: function (L) {
      L.ep = epBus(L, 3.4, 0.14, 2600);
      L.drums = gain(1); L.drums.connect(L.in);
      L.bassBus = biquad('lowpass', 1100, 0.6); L.bassBus.connect(L.dry);
    },
    section: function (L, n) {
      var R = L.R, a = n === 0 ? TOWN[0] : R.pick(TOWN), b = R.pick(TOWN), list = a.concat(b), walk = n > 0 && R.chance(0.65);
      return list.map(function (name, i) { return townBar(L, name, list[(i + 1) % list.length], walk); });
    }
  };
  function townBar(L, name, next, walk) {
    return function (t, beat) {
      var R = L.R, c = chord(name), nc = chord(next), sw = 0.64, i, j;
      var vo = rootless(c);
      var pats = [[[0, 1.6], [2 + sw, 1.2]], [[0, 0.9], [1 + sw, 1.3], [3 + sw, 0.3]], [[sw, 1.3], [2 + sw, 1.3]], [[0, 3.6]]];
      var pat = R.pick(pats);
      for (i = 0; i < pat.length; i++) {
        var v = R.r(0.26, 0.36);
        for (j = 0; j < vo.length; j++) L.play(t + pat[i][0] * beat + j * 0.008, ePiano, vo[j], pat[i][1] * beat, v);
      }
      var root = above(c.bass, 36), fifth = root + 7, third = root + c.iv[1];
      if (walk) {
        var tgt = above(nc.bass, 36), appr = tgt + (R.chance(0.5) ? -1 : 1);
        var line = [root, R.chance(0.5) ? third : root + 12, fifth, appr];
        for (i = 0; i < 4; i++) L.play(t + i * beat, pluck, line[i], i ? 0.46 : 0.55, { kind: 'bass', dur: beat * 0.92, dest: L.bassBus });
      } else {
        L.play(t, pluck, root, 0.55, { kind: 'bass', dur: beat * 1.8, dest: L.bassBus });
        L.play(t + 2 * beat, pluck, fifth > 50 ? fifth - 12 : fifth, 0.46, { kind: 'bass', dur: beat * 1.8, dest: L.bassBus });
      }
      L.play(t + beat, brush, 0.42, 1.7);
      L.play(t + 3 * beat, brush, 0.42, 1.7);
      var ride = [0, 1, 1 + sw, 2, 3, 3 + sw];
      for (i = 0; i < ride.length; i++) L.play(t + ride[i] * beat, hat, (ride[i] % 1 ? 0.07 : 0.11) * R.r(0.7, 1));
      if (R.chance(0.5)) L.play(t, kick, 0.25);
      if (R.chance(0.25)) {
        var ct = stack(c, 72);
        L.play(t + 3 * beat, ePiano, R.pick(ct), 0.5 * beat, 0.24);
        L.play(t + (3 + sw) * beat, ePiano, R.pick(ct), 0.6 * beat, 0.2);
      }
    };
  }

  /* ---- barrens: woods and ravine — drone, sparse felt piano, distant birds, air */
  MUSIC.barrens = {
    gain: 0.7, send: 0.55,
    setup: function (L) {
      var R = L.R, lp = biquad('lowpass', 420, 0.6);
      lp.connect(L.in);
      var d1 = steady(L, 'sine', 73.42, 0.12, lp); steady(L, 'sine', 73.66, 0.1, lp);
      var d3 = steady(L, 'triangle', 110.0, 0.05, lp); steady(L, 'triangle', 110.19, 0.04, lp);
      L.walk(d1.g.gain, 0.06, 0.14, 3, 7, 2); L.walk(d3.g.gain, 0.03, 0.07, 4, 9, 3);
      bed(L, { n: 'pink', ft: 'bandpass', f: 1100, q: 0.8, v: 0.02, walk: [0.01, 0.035, 2, 5, 1.5], fwalk: [600, 1900, 3, 7, 2] });
      var notes = [62, 65, 67, 69, 72, 74, 76];
      L.every(3.5, 9, function (t) {
        var m = R.pick(notes), v = R.r(0.25, 0.4);
        felt(L, t, m, 2.5, v);
        if (R.chance(0.3)) felt(L, t + R.r(0.25, 0.6), m + R.pick([-5, 5, 7, -3]), 2, v * 0.7);
      }, 1.5);
      L.every(16, 30, function (t) { felt(L, t, 50, 4, 0.22); });
      var birds = biquad('lowpass', 3800, 0.5), bd = gain(0.25);
      birds.connect(L.wet); birds.connect(bd); bd.connect(L.dry);
      L.every(5, 15, function (t) { bird(via(birds, R.r(-0.8, 0.8)), t, R, 0.035); });
    }
  };

  /* ---- mystery: low filtered eighth-note pulse, sparse vibraphone in D minor */
  var MYST_MOTIFS = [[[0, 69], [1, 74], [1.5, 76], [2, 77]], [[0, 81], [0.5, 77], [1, 76], [2.5, 74]],
                     [[0, 74], [2, 73], [3, 74]], [[0.5, 77], [1, 76], [1.5, 74], [3, 69]], [[0, 72], [1.5, 70], [2, 69]]];
  MUSIC.mystery = {
    bpm: 80, beats: 4, gain: 2.1, send: 0.35,
    setup: function (L) {
      L.pul = biquad('lowpass', 520, 2); L.pul.connect(L.dry);
      var pw = gain(0.3); L.pul.connect(pw); pw.connect(L.wet);
      L.walk(L.pul.frequency, 300, 950, 3, 8, 2.5, true);
      L.vib = tremBus(L, 4.6, 0.3);
    },
    section: function (L, n) {
      var R = L.R, P = [['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A'],
                        ['Dm', 'F', 'Gm', 'A', 'Dm', 'F', 'Gm', 'A7'], ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Eb', 'A']];
      var prog = n === 0 ? P[0] : R.pick(P);
      return prog.map(function (name, i) { return mysteryBar(L, name, i); });
    }
  };
  function pulseNote(L, t, m, v, len) {
    var end = t + len * 4 + 0.1;
    if (!cap(L, end)) return;
    var s = osc('sawtooth', mtof(m)), s2 = osc('sine', mtof(m - 12)), g = gain(0), g2 = gain(0.7);
    s.connect(g); s2.connect(g2); g2.connect(g); g.connect(L.pul);
    envAD(g.gain, t, 0.006, v, len * 0.55);
    s.start(t); s2.start(t); s.stop(end); s2.stop(end);
    own(L, s, end); own(L, s2, end);
  }
  function mysteryBar(L, name, i) {
    return function (t, beat) {
      var R = L.R, c = chord(name), root = above(c.root, 38), e = beat / 2, k;
      var acc = [1, 0.5, 0.7, 0.5, 0.9, 0.5, 0.7, 0.55];
      for (k = 0; k < 8; k++) L.play(t + k * e, pulseNote, root + ((k === 3 || k === 7) && R.chance(0.3) ? 12 : 0), 0.125 * acc[k], e);
      if (i % 2 === 0) {
        var r = R.f(), sharp = name === 'A' || name === 'A7', flat = name === 'Eb';
        if (r < 0.45) {
          var mo = R.pick(MYST_MOTIFS), top = Math.max.apply(null, mo.map(function (x) { return x[1]; })), up = top <= 74 && R.chance(0.35) ? 12 : 0;
          for (k = 0; k < mo.length; k++) {
            var m = mo[k][1] + up;
            if (sharp && m % 12 === 0) m += 1;            // C -> C# over A
            if (flat && m % 12 === 4) m -= 1;             // E -> Eb over Eb
            L.play(t + mo[k][0] * beat, vibes, m, R.r(0.15, 0.2));
          }
        } else if (r < 0.75) {
          var ct = stack(c, 69);
          L.play(t + R.pick([0, 1, 1.5]) * beat, vibes, R.pick(ct), 0.17);
          if (R.chance(0.5)) L.play(t + R.pick([2.5, 3]) * beat, vibes, R.pick(ct) + 12, 0.12);
        }
      }
      if (i % 2 === 0) L.play(t, kick, 0.14);
    };
  }

  /* ---- tension: strings rising over 40 s cycles, 60 bpm low pulse, a high harmonic */
  MUSIC.tension = {
    bpm: 60, beats: 4, gain: 1.5, send: 0.35,
    setup: function (L) {
      L.padA = biquad('lowpass', 300, 0.9); L.padA.connect(L.in);
      L.padB = biquad('lowpass', 300, 0.9); L.padB.connect(L.in);
      var hi = gain(1); hi.connect(L.in);
      var h1 = steady(L, 'sine', 1174.7, 0.01, hi); steady(L, 'sine', 1175.6, 0.008, hi);
      L.walk(h1.g.gain, 0.003, 0.014, 2, 5, 1.5);
      var low = biquad('lowpass', 140, 0.7); low.connect(L.in);
      steady(L, 'sine', 36.71, 0.06, low); steady(L, 'sine', 73.42, 0.035, low);
    },
    section: function (L, n) {
      var roots = [50, 51, 49, 50, 52, 50], root = roots[n % roots.length], bus = n % 2 ? L.padB : L.padA, bars = [];
      for (var b = 0; b < 10; b++) bars.push(tensionBar(L, b, root, bus));
      return bars;
    }
  };
  function tensionCycle(L, t, root, bus) {
    var f = bus.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(260, t); f.exponentialRampToValueAtTime(2400, t + 46);
    var notes = [root - 12, root, root + 7, root + 13, root + 15];
    for (var i = 0; i < notes.length; i++) {
      padNote(L, t + i * 0.4, notes[i], 40, i ? 0.05 : 0.06, { a: 10, r: 8, rise: 300, dest: bus, types: ['sawtooth', 'sawtooth'], dets: [-8, 8] });
    }
  }
  function tensionPulse(L, t, v, accent) {
    tone(L.dry, t, { f: 52, f2: 40, glide: 0.15, v: v * (accent ? 0.5 : 0.36), a: 0.01, d: 0.18 });
    tone(L.dry, t, { f: 104, f2: 80, glide: 0.1, v: v * 0.1, a: 0.01, d: 0.1 });
  }
  function tensionBar(L, b, root, bus) {
    return function (t, beat) {
      if (b === 0) L.play(t, tensionCycle, root, bus);
      for (var k = 0; k < 4; k++) L.play(t + k * beat, tensionPulse, 0.35 + 0.5 * (b * 4 + k) / 40, k === 0);
    };
  }

  /* ---- horror: clusters, rumble, scrapes, reversed swells, irregular */
  MUSIC.horror = {
    gain: 1.26, send: 0.45,
    setup: function (L) {
      var R = L.R;
      bed(L, { n: 'brown', ft: 'lowpass', f: 110, v: 0.5, raw: true, walk: [0.25, 0.7, 2, 6, 1.8] });
      var low = biquad('lowpass', 150, 0.7); low.connect(L.in);
      steady(L, 'sine', 41.2, 0.1, low); steady(L, 'sine', 43.65, 0.08, low);
      L.every(4, 11, function (t) { horrorSwell(L, t); }, 0.5);
      L.every(6, 15, function (t) { horrorScrape(L, t); }, 3);
      L.every(10, 24, function (t) { horrorBoom(L, t); });
      L.every(5, 12, function (t) { horrorWhine(L, t); });
      L.every(18, 40, function (t) { whisperFx(via(L.wet, R.r(-0.9, 0.9)), t, R.r(0.8, 1.6), R, 0.05); });
    }
  };
  function horrorSwell(L, t) {
    var R = L.R, base = R.i(40, 52), dur = R.r(2.2, 4.5), notes = [base, base + 1, base + 13];
    if (R.chance(0.5)) notes.push(base + 6);
    var lp = biquad('lowpass', 250, 1.2);
    lp.connect(L.in);
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(R.r(1500, 3000), t + dur);
    for (var i = 0; i < notes.length; i++) padNote(L, t, notes[i], dur, 0.05, { a: dur, r: 0.08, dest: lp, types: ['sawtooth', 'sawtooth'], dets: [-10, 10] });
  }
  function horrorScrape(L, t) {
    var R = L.R, dur = R.r(1.5, 3.5), f1 = R.r(600, 1400), f2 = f1 * R.pick([0.5, 1.8, 2.4]);
    var s = noiseSrc('white'), b = mono(biquad('bandpass', f1, 14)), g = gain(0), c = ncomp('white', 'bandpass', f1, 14);
    var dest = via(L.in, R.r(-0.7, 0.7));
    s.connect(b); b.connect(g); g.connect(dest);
    b.frequency.setValueAtTime(f1, t); b.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t);
    for (var tt = t + 0.1; tt < t + dur; tt += R.r(0.05, 0.15)) g.gain.linearRampToValueAtTime(0.22 * c * R.r(0.4, 1) * Math.sin(Math.PI * (tt - t) / dur), tt);
    g.gain.linearRampToValueAtTime(0, t + dur);
    startNoise(s, t); s.stop(t + dur + 0.05);
    var base = R.r(300, 520);
    [1, 2.76, 5.4].forEach(function (r, i) {
      var o = osc('sine', base * r), gg = gain(0);
      o.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.03 / (i + 1), t + dur * 0.6); gg.gain.linearRampToValueAtTime(0, t + dur + 0.5);
      o.start(t); o.stop(t + dur + 0.6);
    });
  }
  function horrorBoom(L, t) {
    tone(L.in, t, { f: 48, f2: 30, glide: 0.8, v: 0.5, a: 0.01, d: 0.6 });
    burst(L.in, t, { n: 'brown', ft: 'lowpass', f: 160, v: 0.8, a: 0.01, d: 0.4 });
  }
  function horrorWhine(L, t) {
    var R = L.R, f = mtof(R.i(86, 92)), d = R.r(2, 4);
    [f, f * 1.0595].forEach(function (fr, i) {
      var o = osc('sine', fr), g = gain(0);
      o.connect(g); g.connect(via(L.in, i ? 0.4 : -0.4));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.008, t + d * 0.45); g.gain.linearRampToValueAtTime(0, t + d);
      o.start(t); o.stop(t + d + 0.05);
    });
  }

  /* ---- quiet: near silence — two high sines beating, a sub-bass breath every ~12 s, faint wind */
  MUSIC.quiet = {
    gain: 0.9, send: 0.3,
    setup: function (L) {
      var t = ctx.currentTime, a = steady(L, 'sine', 2349.3, 0, via(L.in, -0.3)), b = steady(L, 'sine', 2349.7, 0, via(L.in, 0.3));
      a.g.gain.setValueAtTime(0, t); a.g.gain.linearRampToValueAtTime(0.006, t + 6);
      b.g.gain.setValueAtTime(0, t); b.g.gain.linearRampToValueAtTime(0.006, t + 7);
      bed(L, { n: 'pink', ft: 'bandpass', f: 500, q: 0.8, v: 0.012, walk: [0.004, 0.02, 3, 7, 2.5], fwalk: [280, 900, 4, 9, 3] });
      L.every(10, 14, function (tt) { subBreath(L, tt); }, 2.5);
    }
  };
  function subBreath(L, t) {
    var s = osc('sine', 41), s2 = osc('sine', 82), g = gain(0), g2 = gain(0.25);
    s.connect(g); s2.connect(g2); g2.connect(g); g.connect(L.dry);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 3.5); g.gain.linearRampToValueAtTime(0, t + 8.5);
    s.start(t); s2.start(t); s.stop(t + 8.6); s2.stop(t + 8.6);
    burst(L.dry, t, { n: 'brown', ft: 'lowpass', f: 180, a: 3.5, v: 0.25, d: 1.6 });
  }

  /* ---- festival: Canal Days — calliope waltz, oom-pah bass, slightly out of tune, crowd */
  MUSIC.festival = {
    bpm: 150, beats: 3, gain: 1, send: 0.22, wow: [0.23, 0.0012, 4.5, 0.00002],
    setup: function (L) {
      var R = L.R;
      L.cal = biquad('lowpass', 2800, 0.5); L.cal.connect(L.in);
      L.tune = [];
      for (var i = 0; i < 24; i++) L.tune.push(R.r(-12, 12));
      crowd(L, { v: 0.2, lp: 2400, n: 2, out: L.dry, voices: [2, 5], vv: 0.35 });
      L.every(7, 16, function (t) { laugh(via(L.dry, R.r(-0.8, 0.8)), t, R, 0.025); });
    },
    section: function (L, n) {
      var k = n % 3;
      if (k === 1) return waltz(L, WALTZ_B_BARS, WALTZ_B_CH, 'plain');
      return waltz(L, WALTZ_A_BARS, WALTZ_A_CH, k === 0 ? 'plain' : L.R.pick(['high', 'sour', 'trill']));
    }
  };
  function waltz(L, bars, chords, style) {
    var sour = style === 'sour' ? L.R.i(2, bars.length - 2) : -1;
    return bars.map(function (notes, b) {
      return function (t, beat) {
        var R = L.R, c = chord(chords[b]), root = above(c.bass, 41), up = stack(c, 55, true).slice(0, 3), i;
        L.play(t, calliope, b % 2 ? root + 7 - (root + 7 > 52 ? 12 : 0) : root, beat * 0.8, 0.18);
        for (i = 1; i < 3; i++) for (var j = 0; j < up.length; j++) L.play(t + i * beat + j * 0.004, calliope, up[j], beat * 0.42, 0.075);
        for (i = 0; i < notes.length; i++) {
          var nt = notes[i], m = nt.m + (style === 'high' ? 12 : 0), det = (b === sour && i === 0) ? -38 : 0;
          if (style === 'trill' && nt.d >= 2 && R.chance(0.4)) L.play(t + nt.o * beat - 0.05, calliope, stepIn(C_MAJOR, m, 1), 0.06, 0.12);
          L.play(t + nt.o * beat + R.r(0, 0.01), calliope, m, nt.d * beat * 0.88, 0.2, { det: det });
        }
      };
    });
  }

  /* ---- warm: felt piano, C – G/B – Am – F, sparse melody */
  var C_MAJOR = [0, 2, 4, 5, 7, 9, 11];
  MUSIC.warm = {
    bpm: 64, beats: 4, gain: 1, send: 0.45,
    setup: function (L) { L.mel = 72; },
    section: function (L, n) {
      var R = L.R, P = [['C', 'G/B', 'Am', 'F'], ['F', 'G', 'Em7', 'Am'], ['Dm7', 'G', 'C', 'Csus4'], ['Fmaj7', 'G', 'C', 'C'], ['Am', 'F', 'C', 'G']];
      var a = P[0], b = n === 0 ? P[0] : R.pick(P.slice(1));
      return a.concat(b).map(function (name) { return warmBar(L, name); });
    }
  };
  function warmBar(L, name) {
    return function (t, beat) {
      var R = L.R, c = chord(name), bass = above(c.bass, 40), up = stack(c, bass + 7), e = beat / 2, i;
      L.play(t, felt, bass, 3.8 * beat, 0.24);
      var lh = R.i(0, 2);
      if (lh === 0) for (i = 0; i < 3; i++) L.play(t + (i + 1) * beat, felt, up[i % up.length], beat * 1.5, 0.15);
      else if (lh === 1) for (i = 0; i < up.length; i++) L.play(t + e + i * 0.02, felt, up[i], 3 * beat, 0.12);
      else for (i = 0; i < 4; i++) L.play(t + (i + 1) * e, felt, up[i % up.length] + (i === 3 ? 12 : 0), beat, 0.13);
      if (R.chance(0.85)) {
        var m = nearest(c.pcs, L.mel), k = R.i(1, 3), pos = R.pick([0, 0, 1]);
        if (m < 67) m += 12; if (m > 81) m -= 12;
        L.play(t + pos * beat + R.r(0, 0.02), felt, m, beat * 1.8, R.r(0.28, 0.34));
        var at = pos + R.pick([1.5, 2]);
        for (i = 1; i < k && at < 3.6; i++) {
          m = stepIn(C_MAJOR, m, R.chance(0.55) ? -1 : 1);
          L.play(t + at * beat, felt, m, beat * 1.2, R.r(0.22, 0.3));
          at += R.pick([0.5, 1]);
        }
        L.mel = m;
      }
    };
  }

  /* ---- sad: grief — low strings in D minor, sparse felt piano, very slow */
  var D_MINOR = [2, 4, 5, 7, 9, 10, 0];
  MUSIC.sad = {
    bpm: 50, beats: 4, gain: 1, send: 0.5,
    setup: function (L) { L.pad = padBus(L, 700, 0.7); L.walk(L.pad.frequency, 450, 900, 5, 10, 3, true); L.mel = 74; },
    section: function (L, n) {
      var R = L.R, P = [['Dm', 'Bb', 'Gm', 'A'], ['Dm', 'Dm/C', 'Bb', 'A7sus4'], ['Gm', 'Dm/F', 'Eb', 'A'], ['Dm', 'Bb', 'F/A', 'A']];
      var a = n === 0 ? P[0] : R.pick(P), b = R.pick(P);
      return a.concat(b).map(function (name, i) { return sadBar(L, name, i); });
    }
  };
  function sadBar(L, name, i) {
    return function (t, beat) {
      var R = L.R, c = chord(name);
      padChord(L, t, name, 3.9 * beat, 0.045, { a: 2.2, r: 3, bassLo: 38 });
      if (R.chance(0.75)) {
        var k = R.i(1, 2), at = R.pick([0.5, 1, 2]);
        for (var j = 0; j < k; j++) {
          var dir = R.f() < 0.62 ? -1 : 1, m = stepIn(D_MINOR, L.mel, dir);
          if (m < 62) m = R.pick([72, 74, 77]);
          if ((name === 'A' || name === 'A7') && m % 12 === 0) m += 1;   // C# over A major
          if (name === 'Eb' && m % 12 === 4) m -= 1;                     // Eb, not E, over Eb
          L.play(t + at * beat, felt, m, beat * 2, R.r(0.24, 0.3));
          if (R.chance(0.2)) L.play(t + at * beat + 0.02, felt, m - R.pick([3, 4, 5]), beat * 2, 0.16);
          L.mel = m; at += R.pick([1, 1.5]);
        }
      }
      if (i % 4 === 0) L.play(t, felt, above(c.bass, 38), 4 * beat, 0.2);
    };
  }

  /* ---- end: the June melody on felt piano with the pad, building gently, then resolving */
  MUSIC.end = {
    bpm: 60, beats: 2, gain: 0.63, send: 0.5,
    setup: function (L) { L.pad = padBus(L, 450, 0.6); L.mb = biquad('lowpass', 4500, 0.5); L.mb.connect(L.in); },
    section: function (L, n) {
      var k = n % 4, bars = [], b;
      if (k < 2) { for (b = 0; b < 12; b++) bars.push(endBar(L, b, k)); return bars; }
      if (k === 2) return endOutro(L);
      return rest(3);
    }
  };
  function endBar(L, b, level) {
    return function (t, beat) {
      var R = L.R, e = beat / 2, ch = CF_CHORDS[b], cd = 2 * beat / ch.length, i;
      L.pad.frequency.setTargetAtTime(level ? 550 + b * 70 : 420, t, 2);
      for (i = 0; i < ch.length; i++) padChord(L, t + i * cd, ch[i], cd * 0.95, level ? 0.05 : 0.04, { a: 0.5 });
      var notes = CF_BARS[b];
      for (i = 0; i < notes.length; i++) {
        var nt = notes[i], v = 0.34 * R.r(0.92, 1.04) * (nt.d >= 2 ? 1.05 : 0.95);
        L.play(t + nt.o * e + R.r(0, 0.015), felt, nt.m, nt.d * e * 1.1, v);
        if (level && b >= 8) L.play(t + nt.o * e + 0.01, musicBox, nt.m + 24, v * 0.3);
      }
      if (level) {
        var c0 = chord(ch[0]), up = stack(c0, 53);
        L.play(t, felt, above(c0.bass, 41), 2 * beat, 0.2);
        for (i = 0; i < 3; i++) L.play(t + (i + 1) * e, felt, up[i % up.length], e * 2, 0.12);
      }
    };
  }
  function endOutro(L) {
    var bars = [10, 11].map(function (b) {
      var f = function (t, beat) {
        var e = beat * 0.62, notes = CF_BARS[b], ch = CF_CHORDS[b], cd = 2.5 * beat / ch.length, i;
        for (i = 0; i < ch.length; i++) padChord(L, t + i * cd, ch[i], cd * 0.95, 0.05, { a: 0.6 });
        for (i = 0; i < notes.length; i++) {
          L.play(t + notes[i].o * e, felt, notes[i].m, notes[i].d * e * 1.2, 0.3);
          L.play(t + notes[i].o * e + 0.01, musicBox, notes[i].m + 24, 0.08);
        }
      };
      f.len = 2.5;
      return f;
    });
    var fin = function (t, beat) {
      padChord(L, t, 'Bbmaj7', 2 * beat, 0.045, { a: 0.8 });
      padChord(L, t + 2 * beat, 'Csus4', beat, 0.045, { a: 0.5 });
      padChord(L, t + 3 * beat, 'C', beat, 0.045, { a: 0.4 });
      padChord(L, t + 4 * beat, 'Fadd9', 5 * beat, 0.05, { a: 1.2, r: 3 });
      var arp = [53, 60, 67, 69, 72];
      for (var i = 0; i < arp.length; i++) L.play(t + 4 * beat + i * 0.32, felt, arp[i], 4 * beat, 0.2 - i * 0.015);
      L.play(t + 5.6 * beat, musicBox, 84, 0.12);
    };
    fin.len = 10;
    return bars.concat([fin]);
  }

  /* ------------------------------------------------------------------ ambience */

  /* a "far away" send for a layer: low-passed, mostly reverb */
  function far(L) {
    if (L.farBus) return L.farBus;
    var lp = biquad('lowpass', 1600, 0.5), d = gain(0.3);
    lp.connect(L.wet); lp.connect(d); d.connect(L.dry);
    L.farBus = lp;
    return lp;
  }
  /* gusting wind: all components ride one shared gust envelope */
  function windBeds(L, k, dest) {
    var gust = gain(1);
    gust.connect(dest || L.in);
    L.walk(gust.gain, 0.35, 1.25, 1.5, 5, 1.1);
    bed(L, { n: 'pink', ft: 'bandpass', f: 500, q: 0.9, v: 0.14 * k, dest: gust, walk: [0.08 * k, 0.16 * k, 2, 5, 1.5], fwalk: [250, 900, 2, 6, 1.5] });
    bed(L, { n: 'pink', ft: 'bandpass', f: 1200, q: 1.2, v: 0.06 * k, dest: gust, walk: [0.02 * k, 0.09 * k, 1, 4, 0.8], fwalk: [700, 1800, 1.5, 5, 1.2] });
    bed(L, { n: 'brown', ft: 'lowpass', f: 200, v: 0.2 * k, raw: true, dest: gust, walk: [0.1 * k, 0.25 * k, 2, 6, 2] });
    bed(L, { n: 'white', ft: 'bandpass', f: 900, q: 12, v: 0.03 * k, dest: gust, walk: [0, 0.05 * k, 2, 7, 1.5], fwalk: [600, 1300, 2, 6, 1.5] });
    return gust;
  }
  function pageTurn(dest, t, R, v) {
    var dur = R.r(0.28, 0.4), s = noiseSrc('white'), f = mono(biquad('bandpass', 900, 0.9)), g = gain(0);
    var c = ncomp('white', 'bandpass', 2000, 0.9);
    f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(3500, t + dur * 0.7); f.frequency.exponentialRampToValueAtTime(1800, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    for (var tt = t + 0.02; tt < t + dur; tt += R.r(0.018, 0.04)) g.gain.linearRampToValueAtTime(v * c * (R.r(0.3, 1) * Math.sin(Math.PI * (tt - t) / dur) + 0.05), tt);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    startNoise(s, t); s.stop(t + dur + 0.1);
    burst(dest, t + dur * 0.85, { n: 'pink', ft: 'lowpass', f: 600, v: v * 1.2, d: 0.04 });
    return t + dur + 0.2;
  }
  function wiper(L, t) {
    burst(L.dry, t, { n: 'pink', ft: 'bandpass', f: 1200, f2: 2200, q: 1, a: 0.25, v: 0.16, d: 0.12, sweep: 0.45 });
    burst(L.dry, t + 0.5, { n: 'pink', ft: 'lowpass', f: 250, v: 0.9, d: 0.04 });
    tone(L.dry, t + 0.5, { f: 90, f2: 60, glide: 0.05, v: 0.16, d: 0.04 });
  }
  function trays(L, t) {
    var R = L.R, d = via(L.in, R.r(-0.9, 0.9)), n = R.i(2, 5), tt = t;
    for (var i = 0; i < n; i++) {
      if (R.chance(0.5)) metal(d, tt, R, R.r(0.03, 0.07), R.r(500, 900));
      else burst(d, tt, { f: R.r(1200, 2500), q: 1.5, v: R.r(0.06, 0.12), d: 0.02 });
      tt += R.r(0.04, 0.15);
    }
  }
  function chalk(L, t) {
    var R = L.R, d = via(L.in, R.r(-0.3, 0.3)), n = R.i(2, 6), tt = t;
    for (var i = 0; i < n; i++) {
      burst(d, tt, { f: R.r(1800, 2600), q: 2, v: 0.12, d: 0.006 });
      tone(d, tt, { f: R.r(900, 1300), v: 0.015, d: 0.01 });
      if (R.chance(0.4)) scratch(d, tt + 0.02, R.r(0.1, 0.25), 3500, 2, 0.06, R);
      tt += R.r(0.15, 0.35);
    }
  }
  function pipeKnock(L, t) {
    var R = L.R, n = R.i(1, 4), tt = t, base = R.r(130, 260), d = via(L.in, R.r(-0.8, 0.8));
    for (var i = 0; i < n; i++) { metal(d, tt, R, R.r(0.06, 0.13) * (1 - i * 0.2), base * R.r(0.97, 1.03)); tt += R.r(0.15, 0.45); }
  }
  function walkers(L, v, t0) {
    var R = L.R, n = R.i(4, 9), p = R.r(-0.8, 0.8), tt = t0;
    for (var i = 0; i < n; i++) { step(L.in, tt, R, v * R.r(0.85, 1), p); tt += R.r(0.42, 0.55); }
  }
  function tuneSweep(L, dest, t) {
    var R = L.R, d = R.r(1.5, 3), w = osc('sine', 1000), g = gain(0);
    w.frequency.setValueAtTime(R.r(2000, 3800), t); w.frequency.exponentialRampToValueAtTime(R.r(100, 400), t + d * 0.5);
    w.frequency.exponentialRampToValueAtTime(R.r(1000, 3000), t + d);
    w.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + 0.3); g.gain.linearRampToValueAtTime(0.035, t + d * 0.5); g.gain.linearRampToValueAtTime(0, t + d);
    w.start(t); w.stop(t + d + 0.05);
  }
  function wallBar(L, name) {
    return function (t, beat) {
      var c = chord(name), root = above(c.root, 33), up = stack(c, 52).slice(0, 3), R = L.R, i;
      for (i = 0; i < 4; i++) {
        L.play(t + i * beat, pluck, root, 0.7, { kind: 'bass', dur: beat * 0.45, dest: L.wall });
        L.play(t + (i + 0.5) * beat, pluck, root, 0.5, { kind: 'bass', dur: beat * 0.4, dest: L.wall });
      }
      [0, 2].forEach(function (b) {
        L.at(t + b * beat, function (tt) { tone(L.wall, tt, { f: 100, f2: 45, glide: 0.08, v: 0.6, d: 0.1 }); });
        L.at(t + (b + 1) * beat, function (tt) { burst(L.wall, tt, { n: 'pink', ft: 'lowpass', f: 700, v: 1.0, d: 0.06 }); });
        for (var j = 0; j < up.length; j++) L.play(t + b * beat, padNote, up[j], beat * 1.6, 0.05, { a: 0.02, r: 0.3, dest: L.wall, types: ['square'] });
      });
      if (R.chance(0.3)) L.at(t + 2.5 * beat, function (tt) { tone(L.wall, tt, { f: 100, f2: 45, glide: 0.08, v: 0.45, d: 0.1 }); });
    };
  }

  var AMB = {};
  AMB.rain = {
    gain: 0.89, send: 0.1,
    setup: function (L) {
      var R = L.R, grain = gain(1);
      grain.connect(L.in);
      bed(L, { n: 'pink', ft: 'highpass', f: 500, ft2: 'lowpass', f2: 7000, v: 0.17 });
      bed(L, { n: 'white', ft: 'bandpass', f: 2500, q: 0.6, v: 0.07, dest: grain, walk: [0.035, 0.12, 2, 6, 1.2] });
      L.walk(grain.gain, 0.6, 1.3, 0.03, 0.08, 0.02);
      bed(L, { n: 'brown', ft: 'lowpass', f: 500, v: 0.2, raw: true, walk: [0.12, 0.28, 3, 8, 2] });
      L.every(0.08, 0.45, function (t) { drip(via(L.in, R.r(-0.9, 0.9)), t, R, R.r(0.01, 0.035)); });
      L.every(1.5, 5, function (t) { drip(via(L.in, R.r(-0.6, 0.6)), t, R, R.r(0.05, 0.09)); });
    }
  };
  AMB.rain_car = {
    gain: 0.75, send: 0.04,
    setup: function (L) {
      var R = L.R, eng = biquad('lowpass', 140, 0.8);
      bed(L, { n: 'pink', ft: 'bandpass', f: 1100, q: 0.7, v: 0.15 });
      bed(L, { n: 'brown', ft: 'lowpass', f: 300, v: 0.16, raw: true });
      L.every(0.03, 0.12, function (t) { burst(L.in, t, { f: R.r(1500, 3500), q: 2, v: R.r(0.04, 0.12), d: 0.004 }); });
      eng.connect(L.dry);
      var e1 = steady(L, 'sawtooth', 27.5, 0.14, eng); steady(L, 'sine', 55, 0.07, eng);
      L.walk(e1.s.frequency, 26.5, 28.5, 0.8, 2, 0.5);
      L.every(1.9, 2.1, function (t) { wiper(L, t); }, 0.6);
    }
  };
  AMB.night = {
    gain: 1.15, send: 0.2,
    setup: function (L) {
      var R = L.R, cr = biquad('lowpass', 6000, 0.5);
      cr.connect(L.in);
      bed(L, { n: 'pink', ft: 'bandpass', f: 400, q: 0.7, v: 0.035, walk: [0.015, 0.05, 2, 6, 2], fwalk: [250, 700, 3, 8, 2] });
      for (var i = 0; i < 4; i++) {
        (function (f, p, period, v) {
          var dest = via(cr, p), left = 0;
          L.every(period * 0.95, period * 1.05, function (t) {
            if (left <= 0) { left = R.i(3, 9); return; }          // a pause between groups
            left--;
            cricket(dest, t, f * R.r(0.995, 1.005), v, R.i(3, 4));
          });
        })(R.r(4200, 5200), R.r(-0.8, 0.8), R.r(0.45, 0.85), R.r(0.03, 0.075));
      }
      L.every(30, 90, function (t) { bark(via(far(L), R.r(-0.9, 0.9)), t, R, 0.03); }, R.r(10, 30));
    }
  };
  AMB.wind = { gain: 1, send: 0.1, setup: function (L) { windBeds(L, 1); } };
  AMB.house = {
    gain: 1.19, send: 0.15,
    setup: function (L) {
      var R = L.R, fr = biquad('lowpass', 400, 0.7), tk = via(L.in, -0.4);
      bed(L, { n: 'brown', ft: 'lowpass', f: 300, v: 0.04, raw: true });
      fr.connect(L.dry);
      var f1 = steady(L, 'sine', 60, 0.022, fr); steady(L, 'sine', 120, 0.012, fr); steady(L, 'sawtooth', 120, 0.004, fr); steady(L, 'sine', 180, 0.005, fr);
      L.walk(f1.g.gain, 0.015, 0.025, 4, 10, 2);
      L.every(1, 1, function (t) { L.tk = !L.tk; tick1(tk, t, L.tk ? 2400 : 2050, 0.06); }, 0.3);
      L.every(12, 35, function (t) { creak(via(L.in, R.r(-0.8, 0.8)), t, R, R.r(0.05, 0.12)); }, R.r(3, 10));
    }
  };
  AMB.school = {
    gain: 1.17, send: 0.35,
    setup: function (L) {
      var R = L.R;
      crowd(L, { v: 0.35, lp: 1800, n: 3, voices: [1.5, 4], vv: 0.3 });
      L.every(4, 12, function (t) { metal(via(L.in, R.r(-0.9, 0.9)), t, R, R.r(0.04, 0.1)); });
      L.every(6, 15, function (t) { walkers(L, 0.3, t); });
    }
  };
  AMB.cafeteria = {
    gain: 1, send: 0.3,
    setup: function (L) {
      var R = L.R;
      crowd(L, { v: 0.6, lp: 2600, n: 4, voices: [0.6, 1.8], vv: 0.35 });
      L.every(1.5, 5, function (t) { trays(L, t); });
      L.every(0.8, 3, function (t) { clink(via(L.in, R.r(-0.9, 0.9)), t, R, R.r(0.012, 0.035)); });
      L.every(8, 20, function (t) { laugh(via(L.in, R.r(-0.8, 0.8)), t, R, 0.025); });
    }
  };
  AMB.classroom = {
    gain: 1.1, send: 0.25,
    setup: function (L) {
      var R = L.R, hm = biquad('lowpass', 900, 0.6);
      crowd(L, { v: 0.25, lp: 1500, n: 2, voices: [4, 9], vv: 0.25 });
      hm.connect(L.dry); steady(L, 'sine', 120, 0.004, hm); steady(L, 'sawtooth', 120, 0.002, hm);
      L.every(12, 30, function (t) { cough(via(L.in, R.r(-0.8, 0.8)), t, R, 0.14); }, R.r(4, 10));
      L.every(5, 14, function (t) { chalk(L, t); }, 2);
    }
  };
  AMB.hum = {
    gain: 0.61, send: 0.05,
    setup: function (L) {
      var R = L.R, lp = biquad('lowpass', 1600, 0.6), buzz = gain(1);
      buzz.connect(lp); lp.connect(L.in);
      steady(L, 'sine', 120, 0.05); steady(L, 'sine', 240, 0.02); steady(L, 'sine', 360, 0.012);
      steady(L, 'sawtooth', 120, 0.014, buzz);
      L.every(6, 18, function (t) {
        var g = buzz.gain, n = R.i(3, 9), tt = t;
        for (var i = 0; i < n; i++) { g.setValueAtTime(R.r(0, 2.5), tt); tt += R.r(0.03, 0.09); }
        g.setValueAtTime(1, tt);
        burst(L.in, t, { ft: 'highpass', f: 3000, v: 0.2, d: 0.003 });
      });
    }
  };
  AMB.boiler = {
    gain: 0.5, send: 0.3,
    setup: function (L) {
      var R = L.R, low = biquad('lowpass', 100, 0.8);
      bed(L, { n: 'brown', ft: 'lowpass', f: 90, v: 0.6, raw: true, walk: [0.4, 0.8, 2, 5, 1.5] });
      low.connect(L.in);
      var s = steady(L, 'sine', 34, 0.12, low); steady(L, 'triangle', 51, 0.04, low);
      L.walk(s.g.gain, 0.06, 0.16, 2, 6, 2);
      bed(L, { n: 'white', ft: 'highpass', f: 2500, ft2: 'lowpass', f2: 7000, v: 0.04, walk: [0.01, 0.07, 2, 8, 1] });
      L.every(5, 16, function (t) { pipeKnock(L, t); }, 2);
    }
  };
  AMB.diner = {
    gain: 1.17, send: 0.2,
    setup: function (L) {
      var R = L.R, gr = gain(1);
      crowd(L, { v: 0.35, lp: 2400, n: 3, voices: [1.2, 3.5], vv: 0.3 });
      L.every(1, 4, function (t) {
        var d = via(L.in, R.r(-0.9, 0.9));
        clink(d, t, R, R.r(0.015, 0.04));
        if (R.chance(0.4)) clink(d, t + R.r(0.08, 0.2), R, R.r(0.01, 0.03));
      });
      gr.connect(via(L.in, 0.6));
      bed(L, { n: 'white', ft: 'highpass', f: 3000, ft2: 'lowpass', f2: 8000, v: 0.06, dest: gr, walk: [0.03, 0.1, 0.5, 2, 0.3] });
      L.every(0.05, 0.25, function (t) { burst(gr, t, { ft: 'highpass', f: 2500, v: R.r(0.05, 0.2), d: 0.002 }); });
      L.every(25, 60, function (t) { partials(via(L.in, -0.7), t, 2100, [1, 2.4, 3.9], [1, 0.3, 0.1], [0.3, 0.1, 0.05], 0.03); });
      L.every(10, 25, function (t) { laugh(via(L.in, R.r(-0.8, 0.8)), t, R, 0.02); });
    }
  };
  AMB.records = {
    bpm: 112, beats: 4, gain: 0.3, send: 0.15,
    setup: function (L) {
      var R = L.R, wg = gain(1);
      L.wall = biquad('lowpass', 380, 0.8); L.wall.connect(wg); wg.connect(L.dry);
      bed(L, { n: 'brown', ft: 'lowpass', f: 250, v: 0.03, raw: true });
      L.every(3, 9, function (t) { flick(via(L.in, R.r(-0.8, 0.8)), t, R, 0.3); });
      L.every(15, 40, function (t) { cough(via(L.in, R.r(-0.8, 0.8)), t, R, 0.07); });
    },
    section: function (L) {
      var prog = ['A', 'E', 'F#m', 'D', 'A', 'E', 'D', 'D'];
      return prog.map(function (name) { return wallBar(L, name); });
    }
  };
  AMB.library = {
    gain: 1.66, send: 0.35,
    setup: function (L) {
      var R = L.R, hv = biquad('lowpass', 600, 0.6), tk = via(L.in, 0.5);
      bed(L, { n: 'brown', ft: 'lowpass', f: 220, v: 0.03, raw: true });
      hv.connect(L.dry); steady(L, 'sine', 120, 0.002, hv);
      L.every(1, 1, function (t) { L.tk = !L.tk; tick1(tk, t, L.tk ? 1900 : 1700, 0.03); }, 0.4);
      L.every(6, 16, function (t) { pageTurn(via(L.in, R.r(-0.8, 0.8)), t, R, 0.3); }, 2);
      L.every(20, 45, function (t) { cough(via(far(L), R.r(-0.9, 0.9)), t, R, 0.07); });
    }
  };
  AMB.creek = {
    gain: 1.17, send: 0.15,
    setup: function (L) {
      var R = L.R;
      bed(L, { n: 'pink', ft: 'lowpass', f: 1200, v: 0.07 });
      for (var i = 0; i < 3; i++) {
        var b = bed(L, { n: 'white', ft: 'bandpass', f: 800, q: 2.5, v: 0.05, dest: via(L.in, R.r(-0.7, 0.7)) });
        L.walk(b.f.frequency, 350, 2200, 0.05, 0.16, 0.03, true);
        L.walk(b.g.gain, 0.01 * b.c, 0.09 * b.c, 0.06, 0.2, 0.03);
      }
      L.every(0.15, 0.7, function (t) { drip(via(L.in, R.r(-0.8, 0.8)), t, R, R.r(0.015, 0.05)); });
      L.every(4, 12, function (t) { bird(via(far(L), R.r(-0.9, 0.9)), t, R, 0.05); });
    }
  };
  AMB.hill = {
    gain: 1.1, send: 0.05,
    setup: function (L) {
      var gust = windBeds(L, 1.3);
      bed(L, { n: 'white', ft: 'highpass', f: 3500, ft2: 'lowpass', f2: 8000, v: 0.05, dest: gust });
    }
  };
  AMB.canal = {
    gain: 1.9, send: 0.2,
    setup: function (L) {
      var R = L.R;
      bed(L, { n: 'brown', ft: 'lowpass', f: 400, v: 0.06, raw: true, walk: [0.03, 0.08, 2, 5, 1.5] });
      L.every(1.2, 3.5, function (t) { lap(via(L.in, R.r(-0.6, 0.6)), t, R, R.r(0.3, 0.6)); });
      crowd(L, { v: 0.2, lp: 1200, n: 2, out: far(L), voices: [2, 6], vv: 0.3 });
    }
  };
  AMB.festival = {
    bpm: 150, beats: 3, gain: 1, send: 0.3,
    setup: function (L) {
      var R = L.R, cg = gain(0.4);
      crowd(L, { v: 0.45, lp: 2600, n: 3, voices: [0.8, 2.5], vv: 0.35 });
      L.every(4, 10, function (t) { laugh(via(L.in, R.r(-0.9, 0.9)), t, R, 0.03); });
      L.cal = biquad('lowpass', 900, 0.6); L.cal.connect(cg); cg.connect(far(L));
      L.tune = [];
      for (var i = 0; i < 24; i++) L.tune.push(R.r(-15, 15));
    },
    section: function (L, n) {
      if (cur.music === 'festival') return rest(8);          // the band is already playing as music
      return n % 2 ? waltz(L, WALTZ_B_BARS, WALTZ_B_CH, 'plain') : waltz(L, WALTZ_A_BARS, WALTZ_A_CH, 'plain');
    }
  };
  AMB.quiet = {
    gain: 0.8, send: 0.4,
    setup: function (L) {
      var R = L.R, low = biquad('lowpass', 200, 0.7);
      low.connect(L.dry);
      steady(L, 'sine', 55, 0.02, low); steady(L, 'sine', 110, 0.005, low);
      bed(L, { n: 'brown', ft: 'lowpass', f: 150, v: 0.02, raw: true });
      L.every(20, 50, function (t) { creak(via(far(L), R.r(-0.9, 0.9)), t, R, 0.08); }, 8);
    }
  };
  AMB.town = {
    gain: 1.6, send: 0.15,
    setup: function (L) {
      var R = L.R;
      bed(L, { n: 'brown', ft: 'lowpass', f: 300, v: 0.06, raw: true, walk: [0.035, 0.08, 3, 8, 2] });
      L.every(5, 14, function (t) { carPass(L.in, t, R, R.r(0.25, 0.45)); }, 1);
      L.every(3, 9, function (t) { bird(via(L.in, R.r(-0.9, 0.9)), t, R, R.r(0.02, 0.04)); });
      L.every(40, 110, function (t) { horn(via(far(L), R.r(-0.9, 0.9)), t, R, 0.1); }, R.r(15, 40));
      L.every(10, 25, function (t) { walkers(L, 0.22, t); });
    }
  };
  AMB.attic = {
    gain: 1, send: 0.3,
    setup: function (L) {
      var R = L.R, muff = biquad('lowpass', 600, 0.6);
      muff.connect(L.in);
      windBeds(L, 0.7, muff);
      L.every(8, 22, function (t) { creak(via(L.in, R.r(-0.9, 0.9)), t, R, R.r(0.06, 0.14)); }, 3);
      L.every(15, 40, function (t) { tick1(via(L.in, R.r(-0.9, 0.9)), t, R.r(1500, 3000), 0.04); });
    }
  };
  AMB.static = {
    gain: 0.93, send: 0.05,
    setup: function (L) {
      var R = L.R, lp = biquad('lowpass', 5000, 0.5);
      lp.connect(L.in);
      var b = bed(L, { n: 'white', ft: 'bandpass', f: 1500, q: 0.5, v: 0.12, dest: lp });
      bed(L, { n: 'pink', ft: 'lowpass', f: 3000, v: 0.08, dest: lp });
      L.walk(b.f.frequency, 800, 3000, 0.5, 2, 0.3, true);
      L.every(0.02, 0.15, function (t) { burst(lp, t, { ft: 'highpass', f: 1500, v: R.r(0.05, 0.3), d: 0.0015 }); });
      L.every(5, 12, function (t) { tuneSweep(L, lp, t); }, 1.5);
      L.every(8, 20, function (t) { speak(lp, t, R.r(0.4, 1.0), R.pick(['man', 'woman']), R, { v: 0.2 }); });
    }
  };

  var WEATHER = {
    rain: { gain: 0.8, send: 0.1, setup: AMB.rain.setup },
    wind: { gain: 1.15, send: 0.1, setup: AMB.wind.setup }
  };

  /* the cassette layer for SND.tape(true): hiss, mains hum, transport rumble */
  var TAPE = {
    gain: 0.5, send: 0,
    setup: function (L) {
      bed(L, { n: 'white', ft: 'highpass', f: 1500, ft2: 'lowpass', f2: 7500, v: 0.08 });
      var hum = biquad('lowpass', 400, 0.7);
      hum.connect(L.dry);
      steady(L, 'sine', 60, 0.018, hum); steady(L, 'sine', 120, 0.01, hum); steady(L, 'sine', 180, 0.005, hum);
      bed(L, { n: 'brown', ft: 'lowpass', f: 90, v: 0.05, raw: true, walk: [0.02, 0.06, 0.5, 1.5, 0.3] });
    }
  };

  /* ------------------------------------------------------------------ sfx */

  /* a node feeding the sfx group's dry bus, plus an optional reverb send */
  function mix(o, wet) {
    var n = gain(1);
    n.connect(o.d);
    if (wet) { var w = gain(wet); n.connect(w); w.connect(o.w); }
    return n;
  }
  function shim(o, dest) { return { R: o.R, in: dest, nocap: true }; }
  /* electric bell: sustained partials chopped by a clapper (sawtooth AM) */
  function clapperBell(dest, t, dur, f, ratios, amps, rate, v) {
    var lfo = osc('sawtooth', rate), lg = gain(-0.5), am = gain(0.5), env = gain(0), lp = biquad('lowpass', 5000, 0.5);
    lfo.connect(lg); lg.connect(am.gain);
    am.connect(lp); lp.connect(env); env.connect(dest);
    var end = t + dur + 1.6;
    for (var i = 0; i < ratios.length; i++) {
      var s = osc('sine', f * ratios[i]), g = gain(amps[i]);
      s.connect(g); g.connect(am); s.start(t); s.stop(end);
    }
    var s2 = noiseSrc('white'), b = mono(biquad('bandpass', 3000, 1)), ng = gain(0.12 * ncomp('white', 'bandpass', 3000, 1));
    s2.connect(b); b.connect(ng); ng.connect(am); startNoise(s2, t); s2.stop(t + dur);
    lg.gain.setValueAtTime(-0.5, t + dur); lg.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(v, t + 0.01);
    env.gain.setValueAtTime(v, t + dur); env.gain.setTargetAtTime(0, t + dur, 0.3);
    lfo.start(t); lfo.stop(end);
    return end;
  }

  /* per-sfx level trims in dB, from loudness measurements (short-term RMS around -24 dBFS for
     diegetic sounds, quieter UI sounds, peaks kept under -6 dBFS before the limiter) */
  var SFX_DB = {
    click: 3, select: -6.5, hover: 3.5, page: 5, notify: -5, clue: 3, door_open: 4, door_close: -5,
    door_knock: -2.5, window_knock: 2, footsteps: -1, car_door: -5.5, bell: -1.5, locker: -0.5, phone_ring: -0.5,
    phone_pickup: 4.5, phone_hangup: -1, tape_play: -2, tape_stop: -2.5, tape_rewind: -0.5, tape_insert: 2,
    record_start: 1.5, static_burst: 3, radio_tune: -0.5, thunder: -3.5, heartbeat: -3, whisper: 1.5, breath: 2,
    light_switch: 3, lantern: -2.5, lights_out: -7, bike_bell: -4.5, paper: 1.5, typewriter: -0.5, wind_gust: -3.5,
    splash: -1, match: 2, sting: -3.5
  };
  var SFX = {
    click: function (o) {
      burst(o.d, o.t, { f: 2400, q: 1.5, v: 1.0, d: 0.004, a: 0.0005 });
      return tone(o.d, o.t, { f: 1250, v: 0.12, d: 0.012, a: 0.001 });
    },
    select: function (o) {
      var L = shim(o, mix(o, 0.25));
      felt(L, o.t, 76, 0.25, 0.42);
      felt(L, o.t + 0.06, 83, 0.25, 0.26);
      return o.t + 2;
    },
    hover: function (o) { return burst(o.d, o.t, { f: 3200, q: 2, v: 0.3, d: 0.003, a: 0.0005 }); },
    page: function (o) { return pageTurn(mix(o, 0.1), o.t, o.R, 0.6); },
    notify: function (o) {
      var chime = function (t, f, v) {
        partials(o.d, t, f, [1, 2, 3.01], [1, 0.22, 0.06], [0.55, 0.2, 0.08], v, 0.004);
        tone(o.w, t, { f: f, v: v * 0.6, a: 0.004, d: 0.55 });
      };
      chime(o.t, 659.3, 0.28); chime(o.t + 0.14, 880, 0.24);
      return o.t + 4;
    },
    clue: function (o) {
      var t = o.t, R = o.R, n = mix(o, 0.15);
      for (var i = 0; i < 3; i++) scratch(n, t + i * R.r(0.09, 0.12), R.r(0.05, 0.08), R.r(2800, 4200), 1.4, 0.4, R);
      var bt = t + 0.4;
      partials(n, bt, 2093, [1, 2.4, 3.9], [1, 0.3, 0.1], [0.35, 0.12, 0.05], 0.15);
      tone(o.w, bt, { f: 2093, v: 0.08, d: 0.35 });
      return bt + 2.5;
    },
    door_open: function (o) {
      var n = mix(o, 0.3);
      burst(n, o.t, { f: 2200, q: 2, v: 0.2, d: 0.008 });
      return creak(n, o.t + 0.08, o.R, 0.5, o.R.r(0.9, 1.4));
    },
    door_close: function (o) {
      var t = o.t, n = mix(o, 0.3);
      tone(n, t, { f: 85, f2: 45, glide: 0.12, v: 0.8, d: 0.09, a: 0.002 });
      burst(n, t, { n: 'pink', ft: 'lowpass', f: 300, v: 1.6, d: 0.06, a: 0.002 });
      burst(n, t, { f: 900, q: 1.2, v: 0.15, d: 0.03 });
      burst(n, t + 0.05, { f: 3200, q: 3, v: 0.25, d: 0.006 });
      partials(n, t + 0.05, 2300, [1, 1.6], [1, 0.5], [0.03, 0.02], 0.1);
      return t + 1.2;
    },
    door_knock: function (o) {
      var n = mix(o, 0.25), tt = o.t;
      for (var i = 0; i < 3; i++) { knock(n, tt, o.R, i === 2 ? 0.85 : 1); tt += o.R.r(0.2, 0.26); }
      return tt + 0.6;
    },
    window_knock: function (o) {
      var R = o.R, n = mix(o, 0.45), tt = o.t;
      for (var i = 0; i < 3; i++) {
        partials(n, tt, R.r(1900, 2300), [1, 1.47, 2.33, 3.1], [1, 0.5, 0.25, 0.1], [0.06, 0.04, 0.025, 0.015], 0.2);
        burst(n, tt, { f: 650, q: 1, v: 0.2, d: 0.018 });
        tone(n, tt, { f: 310, v: 0.22, d: 0.05 });
        tt += R.r(0.55, 0.7);
      }
      return tt + 1.5;
    },
    footsteps: function (o) {
      var R = o.R, n = mix(o, 0.2), k = R.i(4, 6), tt = o.t;
      for (var i = 0; i < k; i++) {
        step(n, tt, R, 1 - i * 0.04, i % 2 ? 0.15 : -0.15);
        if (R.chance(0.2)) creak(n, tt + 0.05, R, 0.15, R.r(0.15, 0.3));
        tt += R.r(0.46, 0.56);
      }
      return tt + 0.5;
    },
    car_door: function (o) {
      var t = o.t, n = mix(o, 0.18);
      tone(n, t, { f: 70, f2: 38, glide: 0.15, v: 0.9, d: 0.12, a: 0.002 });
      burst(n, t, { n: 'pink', ft: 'lowpass', f: 420, v: 1.8, d: 0.07 });
      burst(n, t, { f: 1500, q: 0.8, v: 0.25, d: 0.03 });
      partials(n, t + 0.01, 420, [1, 2.3, 3.7], [1, 0.5, 0.3], [0.08, 0.05, 0.03], 0.1);
      burst(n, t + 0.04, { f: 2800, q: 3, v: 0.2, d: 0.008 });
      return t + 1;
    },
    bell: function (o) {
      return clapperBell(mix(o, 0.4), o.t, 2.0, 820, [1, 2.08, 2.97, 4.2], [0.5, 0.3, 0.18, 0.08], 24, 0.5);
    },
    locker: function (o) {
      var t = o.t, R = o.R, n = mix(o, 0.35);
      burst(n, t, { n: 'pink', ft: 'lowpass', f: 2000, v: 1.4, d: 0.04, a: 0.001 });
      tone(n, t, { f: 110, f2: 70, glide: 0.06, v: 0.4, d: 0.06 });
      partials(n, t, 210, [1, 2.32, 4.35, 6.8, 9.3], [1, 0.8, 0.6, 0.35, 0.2], [0.7, 0.45, 0.3, 0.18, 0.1], 0.1);
      for (var i = 0; i < 3; i++) burst(n, t + 0.08 + i * R.r(0.04, 0.07), { f: R.r(1500, 3000), q: 2, v: 0.15 - i * 0.035, d: 0.01 });
      return t + 2.5;
    },
    phone_ring: function (o) {
      var n = mix(o, 0.2), t = o.t;
      clapperBell(n, t, 1.6, 1040, [1, 2.2, 3.3], [0.5, 0.25, 0.1], 20, 0.42);
      clapperBell(n, t + 0.025, 1.6, 1310, [1, 2.1, 3.2], [0.4, 0.2, 0.08], 20, 0.32);
      clapperBell(n, t + 3.6, 1.6, 1040, [1, 2.2, 3.3], [0.5, 0.25, 0.1], 20, 0.42);
      clapperBell(n, t + 3.625, 1.6, 1310, [1, 2.1, 3.2], [0.4, 0.2, 0.08], 20, 0.32);
      return t + 6.9;
    },
    phone_pickup: function (o) {
      var t = o.t, n = mix(o, 0.1);
      burst(n, t, { f: 1800, q: 1.5, v: 0.9, d: 0.01 });
      burst(n, t + 0.03, { n: 'pink', ft: 'lowpass', f: 700, v: 1.0, d: 0.03 });
      burst(n, t + 0.09, { f: 3500, q: 3, v: 0.8, d: 0.004 });
      return t + 0.5;
    },
    phone_hangup: function (o) {
      var t = o.t, n = mix(o, 0.15);
      burst(n, t, { n: 'pink', ft: 'lowpass', f: 900, v: 1.6, d: 0.035 });
      burst(n, t, { f: 2200, q: 1.2, v: 1.0, d: 0.012 });
      tone(n, t, { f: 120, f2: 70, glide: 0.05, v: 0.45, d: 0.04 });
      partials(n, t + 0.01, 1040, [1, 2.2], [1, 0.4], [0.18, 0.07], 0.05);
      return t + 1.2;
    },
    tape_play: function (o) {
      var t = o.t, n = mix(o, 0.05), m = osc('sawtooth', 30), lp = biquad('lowpass', 400, 0.7), g = gain(0);
      burst(n, t, { f: 1600, q: 1, v: 1.2, d: 0.012 });
      burst(n, t + 0.015, { n: 'pink', ft: 'lowpass', f: 500, v: 1.8, d: 0.04 });
      tone(n, t + 0.01, { f: 140, f2: 80, glide: 0.04, v: 0.45, d: 0.04 });
      m.frequency.setValueAtTime(25, t + 0.05); m.frequency.exponentialRampToValueAtTime(95, t + 0.4);
      m.connect(lp); lp.connect(g); g.connect(n);
      g.gain.setValueAtTime(0, t + 0.05); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.setTargetAtTime(0, t + 0.6, 0.15);
      m.start(t + 0.05); m.stop(t + 1.6);
      burst(n, t + 0.05, { f: 2400, q: 2, a: 0.2, v: 0.12, d: 0.2, h: 0.2 });
      return t + 1.6;
    },
    tape_stop: function (o) {
      var t = o.t, n = mix(o, 0.05);
      burst(n, t, { f: 1400, q: 1, v: 1.2, d: 0.012 });
      burst(n, t + 0.01, { n: 'pink', ft: 'lowpass', f: 450, v: 1.9, d: 0.05 });
      tone(n, t + 0.01, { f: 120, f2: 70, glide: 0.05, v: 0.5, d: 0.05 });
      return t + 0.6;
    },
    tape_rewind: function (o) {
      var t = o.t, n = mix(o, 0.05), dur = 1.5, s = osc('sawtooth', 300), bp = biquad('bandpass', 1500, 1.5), g = gain(0);
      burst(n, t, { f: 1500, q: 1, v: 1.0, d: 0.01 });
      s.frequency.setValueAtTime(200, t + 0.03); s.frequency.exponentialRampToValueAtTime(720, t + 0.5); s.frequency.linearRampToValueAtTime(800, t + dur);
      s.connect(bp); bp.connect(g); g.connect(n);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.3); g.gain.setValueAtTime(0.25, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      burst(n, t + 0.03, { f: 3000, f2: 4500, q: 0.8, a: 0.3, h: dur - 0.35, v: 0.25, d: 0.03, sweep: dur });
      burst(n, t + dur + 0.02, { n: 'pink', ft: 'lowpass', f: 500, v: 1.8, d: 0.04 });
      s.start(t); s.stop(t + dur + 0.1);
      return t + dur + 0.5;
    },
    tape_insert: function (o) {
      var t = o.t, n = mix(o, 0.05);
      burst(n, t, { f: 2600, q: 2, v: 0.9, d: 0.008 });
      burst(n, t + 0.06, { f: 1800, q: 1.5, v: 1.1, d: 0.01 });
      burst(n, t + 0.065, { n: 'pink', ft: 'lowpass', f: 900, v: 1.3, d: 0.025 });
      burst(n, t + 0.22, { f: 2200, q: 2, v: 0.9, d: 0.008 });
      burst(n, t + 0.225, { n: 'pink', ft: 'lowpass', f: 700, v: 1.2, d: 0.03 });
      return t + 0.6;
    },
    record_start: function (o) {
      var t = o.t, n = mix(o, 0);
      burst(n, t, { f: 1500, q: 1, v: 1.1, d: 0.01 });
      burst(n, t + 0.012, { n: 'pink', ft: 'lowpass', f: 500, v: 1.5, d: 0.035 });
      burst(n, t + 0.05, { f: 4500, q: 0.6, a: 0.06, h: 0.25, v: 0.3, d: 0.12 });
      return t + 1;
    },
    static_burst: function (o) {
      var t = o.t, R = o.R, dur = R.r(0.45, 0.7), n = mix(o, 0), s = noiseSrc('white'), f = mono(biquad('bandpass', 1800, 0.6)), lp = biquad('lowpass', 5000, 0.5), g = gain(0);
      s.connect(f); f.connect(lp); lp.connect(g); g.connect(n);
      for (var tt = t; tt < t + dur; tt += R.r(0.02, 0.06)) { f.frequency.setValueAtTime(R.exp(600, 4500), tt); g.gain.setValueAtTime(R.r(0.4, 1) * 1.6, tt); }
      g.gain.setValueAtTime(1.2, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
      for (var i = 0; i < 8; i++) burst(n, t + R.r(0, dur), { ft: 'highpass', f: 1500, v: R.r(0.3, 0.8), d: 0.002 });
      startNoise(s, t); s.stop(t + dur + 0.05);
      return t + dur + 0.1;
    },
    radio_tune: function (o) {
      var t = o.t, R = o.R, dur = 1.8, n = mix(o, 0.05), lp = biquad('lowpass', 4500, 0.5);
      var s = noiseSrc('white'), f = mono(biquad('bandpass', 700, 1.2)), g = gain(0), c = ncomp('white', 'bandpass', 1500, 1.2);
      lp.connect(n); s.connect(f); f.connect(g); g.connect(lp);
      f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3000, t + dur * 0.6); f.frequency.exponentialRampToValueAtTime(1200, t + dur);
      g.gain.setValueAtTime(0, t);
      for (var tt = t + 0.04; tt < t + dur; tt += R.r(0.05, 0.12)) g.gain.linearRampToValueAtTime(c * R.r(0.15, 0.3), tt);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      var w = osc('sine', 2800), wg = gain(0);
      w.frequency.setValueAtTime(2800, t); w.frequency.exponentialRampToValueAtTime(120, t + dur * 0.5); w.frequency.exponentialRampToValueAtTime(1600, t + dur);
      w.connect(wg); wg.connect(lp);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(0.05, t + 0.3); wg.gain.linearRampToValueAtTime(0.08, t + dur * 0.5); wg.gain.linearRampToValueAtTime(0, t + dur);
      speak(lp, t + dur * 0.42, 0.35, 'man', R, { v: 0.5 });
      startNoise(s, t); s.stop(t + dur + 0.1); w.start(t); w.stop(t + dur + 0.05);
      return t + dur + 0.5;
    },
    thunder: function (o) {
      var t = o.t, R = o.R, n = mix(o, 0.6), dur = R.r(3.5, 5), s = noiseSrc('brown'), lp = biquad('lowpass', 400, 0.7), g = gain(0);
      s.connect(lp); lp.connect(g); g.connect(n);
      lp.frequency.setValueAtTime(420, t); lp.frequency.exponentialRampToValueAtTime(120, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.3, t + 0.08); g.gain.setTargetAtTime(0.5, t + 0.08, 0.25);
      for (var tt = t + 0.5; tt < t + dur; tt += R.r(0.25, 0.7)) g.gain.setTargetAtTime(R.r(0.35, 1.1) * (1 - (tt - t) / dur * 0.6), tt, R.r(0.1, 0.3));
      g.gain.setTargetAtTime(0, t + dur, 0.6);
      burst(n, t, { n: 'pink', ft: 'lowpass', f: 900, v: 0.9, d: 0.15 });
      startNoise(s, t); s.stop(t + dur + 4);
      return t + dur + 4;
    },
    heartbeat: function (o) { return lubDub(o.d, o.t, 0.9, 66); },
    whisper: function (o) {
      return whisperFx(via(mix(o, 0.4), o.R.r(-0.5, 0.5)), o.t, o.R.r(1.0, 1.5), o.R, 0.6);
    },
    breath: function (o) {
      var t = o.t, d = 0.42, n = mix(o, 0.1), s = noiseSrc('white'), f = mono(biquad('bandpass', 900, 1.2)), f2 = biquad('lowpass', 5000, 0.5), g = gain(0);
      var c = ncomp('white', 'bandpass', 1500, 1.2);
      f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2400, t + d);
      s.connect(f); f.connect(f2); f2.connect(g); g.connect(n);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7 * c, t + d * 0.75); g.gain.linearRampToValueAtTime(0, t + d);
      startNoise(s, t); s.stop(t + d + 0.05);
      return t + d + 0.3;
    },
    light_switch: function (o) {
      var t = o.t, n = mix(o, 0.05);
      burst(n, t, { f: 3000, q: 1.5, v: 1.3, d: 0.004, a: 0.0005 });
      burst(n, t + 0.006, { f: 1200, q: 2, v: 1.0, d: 0.012 });
      tone(n, t + 0.004, { f: 2600, v: 0.06, d: 0.02 });
      return t + 0.3;
    },
    lantern: function (o) {
      var t = o.t, n = mix(o, 0.15);
      burst(n, t, { n: 'brown', ft: 'lowpass', f: 300, f2: 900, sweep: 0.15, a: 0.06, v: 1.6, d: 0.2 });
      tone(n, t, { f: 60, f2: 90, glide: 0.1, v: 0.3, a: 0.05, d: 0.15 });
      burst(n, t + 0.05, { ft: 'highpass', f: 2500, a: 0.3, h: 1.2, v: 0.25, d: 0.6 });
      return t + 3.2;
    },
    lights_out: function (o) {
      var t = o.t, n = mix(o, 0.5);
      burst(n, t, { ft: 'highpass', f: 3000, v: 0.9, d: 0.003, a: 0.0005 });
      tone(n, t, { f: 120, f2: 70, glide: 0.4, v: 0.07, a: 0.002, d: 0.15 });
      tone(n, t + 0.02, { f: 34, f2: 26, glide: 2, v: 0.8, a: 0.04, d: 0.9 });
      tone(n, t + 0.02, { f: 68, f2: 52, glide: 1.5, v: 0.28, a: 0.04, d: 0.6 });
      burst(n, t + 0.02, { n: 'brown', ft: 'lowpass', f: 120, v: 1.2, a: 0.05, d: 0.6 });
      burst(n, t + 0.02, { n: 'pink', ft: 'lowpass', f: 350, v: 0.7, a: 0.03, d: 0.3 });
      return t + 6.5;
    },
    bike_bell: function (o) {
      var n = mix(o, 0.15), lp = biquad('lowpass', 6000, 0.5);
      lp.connect(n);
      var ding = function (t, v) {
        partials(lp, t, 2350, [1, 1.5, 2.65, 3.9], [1, 0.4, 0.25, 0.1], [0.5, 0.3, 0.12, 0.06], v);
        burst(lp, t, { f: 4000, q: 2, v: 0.08, d: 0.003 });
      };
      ding(o.t, 0.2); ding(o.t + 0.16, 0.16);
      return o.t + 4;
    },
    paper: function (o) {
      var R = o.R, n = mix(o, 0.05), tt = o.t, end = o.t + R.r(0.5, 0.75);
      while (tt < end) { burst(n, tt, { f: R.r(1500, 5000), q: R.r(0.8, 2), v: R.r(0.3, 0.9), d: R.r(0.006, 0.02) }); tt += R.r(0.015, 0.06); }
      burst(n, o.t + 0.1, { n: 'pink', ft: 'bandpass', f: 1200, q: 0.7, a: 0.15, v: 0.5, d: 0.12 });
      return end + 0.2;
    },
    typewriter: function (o) {
      var R = o.R, n = mix(o, 0.12), k = R.i(5, 8), tt = o.t;
      for (var i = 0; i < k; i++) {
        burst(n, tt, { f: R.r(1800, 2800), q: 1.2, v: 1.2, d: 0.008, a: 0.0005 });
        burst(n, tt + 0.004, { n: 'pink', ft: 'lowpass', f: 500, v: 1.2, d: 0.025 });
        tone(n, tt, { f: 180, f2: 120, glide: 0.03, v: 0.22, d: 0.02 });
        tt += R.r(0.1, 0.2) * (R.chance(0.15) ? 2.2 : 1);
      }
      tt += 0.15;
      partials(n, tt, 2650, [1, 2.73, 4.1], [1, 0.3, 0.12], [0.45, 0.15, 0.06], 0.2);
      return tt + 3;
    },
    wind_gust: function (o) {
      var t = o.t, R = o.R, dur = R.r(1.8, 2.8), n = mix(o, 0.2), s = noiseSrc('pink'), f = biquad('bandpass', 400, 1.6), g = gain(0);
      var c = ncomp('pink', 'bandpass', 700, 1.6);
      f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(R.r(900, 1400), t + dur * 0.45); f.frequency.exponentialRampToValueAtTime(300, t + dur);
      s.connect(f); f.connect(g); g.connect(n);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7 * c, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.4 * c, t + dur * 0.65); g.gain.linearRampToValueAtTime(0, t + dur);
      startNoise(s, t); s.stop(t + dur + 0.1);
      var w = noiseSrc('white'), wf = biquad('bandpass', 900, 14), wg = gain(0), wc = ncomp('white', 'bandpass', 900, 14);
      wf.frequency.setValueAtTime(700, t); wf.frequency.exponentialRampToValueAtTime(1300, t + dur * 0.45); wf.frequency.exponentialRampToValueAtTime(600, t + dur);
      w.connect(wf); wf.connect(wg); wg.connect(n);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(0.12 * wc, t + dur * 0.45); wg.gain.linearRampToValueAtTime(0, t + dur);
      startNoise(w, t); w.stop(t + dur + 0.1);
      return t + dur + 0.2;
    },
    splash: function (o) {
      var t = o.t, R = o.R, n = mix(o, 0.25);
      burst(n, t, { n: 'white', ft: 'lowpass', f: 5000, f2: 600, sweep: 0.4, a: 0.004, v: 0.6, d: 0.15 });
      burst(n, t, { n: 'pink', ft: 'lowpass', f: 400, v: 1.5, d: 0.08, a: 0.002 });
      for (var i = 0; i < 9; i++) tone(n, t + R.r(0.05, 0.6), { f: R.r(500, 1300), f2: R.r(1400, 2600), glide: 0.03, v: R.r(0.04, 0.1), d: 0.025 });
      burst(n, t + 0.15, { n: 'white', ft: 'bandpass', f: 2500, q: 0.6, a: 0.05, v: 0.3, d: 0.25 });
      return t + 1.5;
    },
    match: function (o) {
      var t = o.t, R = o.R, n = mix(o, 0.08);
      scratch(n, t, 0.14, 3500, 1.2, 0.8, R);
      burst(n, t + 0.13, { n: 'pink', ft: 'lowpass', f: 1500, f2: 700, sweep: 0.3, a: 0.02, v: 1.2, d: 0.18 });
      burst(n, t + 0.2, { f: 1800, q: 0.5, a: 0.1, h: 0.6, v: 0.15, d: 0.4 });
      for (var i = 0; i < 5; i++) burst(n, t + 0.2 + R.r(0, 0.8), { ft: 'highpass', f: 2500, v: R.r(0.3, 0.6), d: 0.002 });
      return t + 2.2;
    },
    sting: function (o) {
      var t = o.t, n = mix(o, 0.5), lp = biquad('lowpass', 900, 1), g = gain(0), notes = [62, 63, 68, 74, 75];
      tone(n, t, { f: 55, f2: 32, glide: 0.6, v: 0.7, a: 0.005, d: 0.5 });
      burst(n, t, { n: 'brown', ft: 'lowpass', f: 250, v: 1.4, a: 0.005, d: 0.25 });
      lp.connect(g); g.connect(n);
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3500, t + 0.25); lp.frequency.exponentialRampToValueAtTime(800, t + 1.8);
      for (var i = 0; i < notes.length; i++) {
        [-9, 9].forEach(function (d) { var s = osc('sawtooth', mtof(notes[i])); s.detune.value = d; s.connect(lp); s.start(t); s.stop(t + 3.2); });
      }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.12); g.gain.setTargetAtTime(0, t + 0.3, 0.45);
      burst(n, t, { f: 2400, f2: 1800, q: 9, a: 0.05, v: 0.12, d: 0.35, sweep: 1 });
      return t + 3.5;
    }
  };

  /* ------------------------------------------------------------------ public API */

  var cur = { music: null, ambience: null, weather: null };
  var curL = { music: null, ambience: null, weather: null };
  var tapeL = null, built = false, playCount = 0;
  var SFX_MAX = 14, VOICE_LEVEL = 0.3;

  function live() { return !!(ctx && built && SND.ready); }
  function safe(fn) {
    return function () { try { return fn.apply(SND, arguments); } catch (e) { report(e); } };
  }
  function fadeOf(o, d) {
    var f = o && typeof o.fade === 'number' && isFinite(o.fade) ? o.fade : d;
    return clamp(f, 0, 30);
  }
  function normId(id) { return (id == null || id === 'stop' || id === 'none' || id === false) ? null : id; }
  function newLayer(kind, id, chanName, def, fade) {
    var L = new Layer(kind, id, chanName, def, hash(kind + ':' + id) + (playCount++) * 7919);
    try { if (def.setup) def.setup(L); } catch (e) { report(e); }
    layers.push(L);
    L.fadeTo(L.level, Math.max(0.05, fade));
    return L;
  }
  function switchLayer(slot, table, chanName, id, fade) {
    id = normId(id);
    if (id != null && !Object.prototype.hasOwnProperty.call(table, id)) { warnOnce(slot, id); return; }
    if (!live()) { pending[slot] = id; return; }
    var old = curL[slot];
    if (id === cur[slot] && (id == null || (old && !old.dead))) return;
    if (old) old.stop(fade);
    cur[slot] = id;
    curL[slot] = id != null ? newLayer(slot, id, chanName, table[id], fade) : null;
  }
  function unlock() {
    try {
      var b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { /* ignore */ }
  }
  function applyPending() {
    var p = pending;
    pending = {};
    if ('music' in p) SND.music(p.music);
    if ('ambience' in p) SND.ambience(p.ambience);
    if ('weather' in p) SND.weather(p.weather);
    if (p.tape) SND.tape(true);
    if ('hb' in p) SND.heartbeat(p.hb);
  }

  SND.init = function () {
    try {
      if (!AC) return Promise.resolve(false);
      if (!built) {
        if (ctx) { try { ctx.close(); } catch (e) { /* ignore */ } ctx = null; }
        build();
        built = true;
      }
      var p = null;
      if (ctx.state !== 'running' && ctx.resume) { try { p = ctx.resume(); } catch (e) { p = null; } }
      unlock();
      var done = function () {
        if (!SND.ready) { SND.ready = true; try { applyPending(); } catch (e) { report(e); } }
        return true;
      };
      if (!p || typeof p.then !== 'function') return Promise.resolve(done());
      return new Promise(function (resolve) {
        var fin = false;
        var finish = function () { if (fin) return; fin = true; done(); resolve(true); };
        p.then(finish, finish);
        setTimeout(finish, 800);         // never hang if resume() waits for a gesture
      });
    } catch (e) {
      report(e);
      return Promise.resolve(false);
    }
  };

  SND.setVolume = safe(function (ch, v) {
    if (ch !== 'master' && ch !== 'music' && ch !== 'ambience' && ch !== 'sfx') { warnOnce('channel', ch); return; }
    v = Number(v);
    if (!isFinite(v)) return;
    v = clamp(v, 0, 1);
    vols[ch] = v;
    if (!built) return;
    var t = ctx.currentTime;
    if (ch === 'master') G.masterAuto.go([[0.12, v]], t);
    else { chans[ch].volD.go([[0.12, v]], t); chans[ch].volW.go([[0.12, v]], t); }
  });

  SND.music = safe(function (id, o) { switchLayer('music', MUSIC, 'music', id, fadeOf(o, 2)); });
  SND.ambience = safe(function (id, o) { switchLayer('ambience', AMB, 'ambience', id, fadeOf(o, 2)); });
  SND.weather = safe(function (id, o) { switchLayer('weather', WEATHER, 'ambience', id, fadeOf(o, 3)); });

  SND.sfx = safe(function (id, o) {
    if (!Object.prototype.hasOwnProperty.call(SFX, id)) { warnOnce('sfx', id); return; }
    if (!live() || ctx.state !== 'running') return;
    var v = o && typeof o.volume === 'number' && isFinite(o.volume) ? clamp(o.volume, 0, 2) : 1;
    if (v <= 0) return;
    v *= Math.pow(10, (SFX_DB[id] || 0) / 20);
    var t0 = ctx.currentTime, n = 0;
    for (var i = 0; i < activeSfx.length; i++) if (activeSfx[i].end > t0) n++;
    if (n >= SFX_MAX) return;
    var g = gain(v), gw = gain(v);
    g.connect(chans.sfx.dry); gw.connect(chans.sfx.wet);
    var end = SFX[id]({ t: t0 + 0.005, d: g, w: gw, R: GR });
    activeSfx.push({ g: g, gw: gw, end: typeof end === 'number' && isFinite(end) ? end : t0 + 3 });
  });

  SND.tape = safe(function (on) {
    on = !!on;
    if (!live()) { pending.tape = on; return; }
    if (on === !!(tapeL && !tapeL.dead)) return;
    var c = chans.music, t = ctx.currentTime;
    if (on) {
      tapeL = newLayer('tape', 'tape', 'sfx', TAPE, 0.4);
      c.lpD.frequency.setTargetAtTime(2600, t, 0.25); c.lpW.frequency.setTargetAtTime(2600, t, 0.25);
      setWow(c, true);
    } else {
      if (tapeL) tapeL.stop(0.4);
      tapeL = null;
      c.lpD.frequency.setTargetAtTime(20000, t, 0.3); c.lpW.frequency.setTargetAtTime(20000, t, 0.3);
      setWow(c, false);
    }
  });

  SND.voice = safe(function (seconds, kind) {
    if (kind == null) kind = 'girl';
    if (!Object.prototype.hasOwnProperty.call(VKIND, kind)) { warnOnce('voice', kind); return; }
    if (!live() || ctx.state !== 'running') return;
    var s = Number(seconds);
    if (!isFinite(s) || s < 0.2) return;
    s = Math.min(s, 120);
    // each voice gets its own wobbling tape delay, so nothing runs between lines
    var w = wowLine(0.015, 0.7, 0.0009, 7.1, 0.00004);
    w.node.connect(G.tapeIn);
    var r = speak(w.node, ctx.currentTime + 0.03, s, kind, GR, { v: VOICE_LEVEL * VOICE_TRIM[kind] });
    w.lfos[0].stop(r.end + 0.1); w.lfos[1].stop(r.end + 0.1);
    activeSfx.push({ g: r.out, end: r.end, x: w.node });
  });

  SND.heartbeat = safe(function (bpm) {
    var b = bpm == null || bpm === false ? null : Number(bpm);
    if (b != null && (!isFinite(b) || b <= 0)) b = null;
    if (b != null) b = clamp(b, 30, 200);
    if (!live()) { pending.hb = b; return; }
    if (b == null) { hb = null; return; }
    if (hb) hb.bpm = b; else hb = { bpm: b, next: ctx.currentTime + 0.05 };
  });

  SND.duck = safe(function (amount, seconds) {
    if (!live()) return;
    var a = clamp(Number(amount) || 0, 0, 1), s = clamp(Number(seconds) || 0, 0, 600), lvl = 1 - a, t = ctx.currentTime;
    var segs = [[0.3, lvl], [Math.max(0.005, s), lvl], [1.2, 1]];
    chans.music.duckD.go(segs, t); chans.music.duckW.go(segs, t);
  });

  SND.stopAll = safe(function () {
    pending = {};
    if (!live()) return;
    var t = ctx.currentTime;
    ['music', 'ambience', 'weather'].forEach(function (k) { curL[k] = null; cur[k] = null; });
    if (tapeL) SND.tape(false);
    for (var j = 0; j < layers.length; j++) layers[j].stop(0.6);
    hb = null;
    for (var i = 0; i < activeSfx.length; i++) {
      var s = activeSfx[i];
      try { s.g.gain.cancelScheduledValues(t); s.g.gain.setTargetAtTime(0, t, 0.03); } catch (e) { /* ignore */ }
      if (s.gw) { try { s.gw.gain.cancelScheduledValues(t); s.gw.gain.setTargetAtTime(0, t, 0.03); } catch (e) { /* ignore */ } }
      s.end = Math.min(s.end, t + 0.3);
    }
    chans.music.duckD.go([[0.3, 1]], t); chans.music.duckW.go([[0.3, 1]], t);
  });
})();
