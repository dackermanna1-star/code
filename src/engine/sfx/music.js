// Original procedural music cues. Every cue is rendered offline into a stereo buffer:
// instruments are synthesised per note (additive / subtractive / FM / Karplus-Strong / modal),
// mixed with equal-power panning and a reverb send. Loops wrap their tails onto the start so they
// repeat seamlessly; continuous "bed" layers are cross-faded instead.
import { Synth, hashStr, hz, peakOf, rmsOf, softLimit, VOWELS } from './dsp.js';

const SR = 22050;
const N = hz;

// ---------------------------------------------------------------- mixer
class Mix {
  constructor(S, dur, loopLen = 0, xfade = 2) {
    this.S = S; this.L = loopLen; this.X = xfade;
    const n = S.len(dur);
    this.n = n;
    this.dl = new Float32Array(n); this.dr = new Float32Array(n);
    this.sl = new Float32Array(n); this.sr = new Float32Array(n);
    if (loopLen) {
      const nb = S.len(loopLen + xfade);
      this.bl = new Float32Array(nb); this.br = new Float32Array(nb);
      this.bsl = new Float32Array(nb); this.bsr = new Float32Array(nb);
    }
  }
  _put(L, R, SL, SR, x, t, gain, pan, send) {
    const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    const gl = Math.cos(a) * Math.SQRT2 * gain, gr = Math.sin(a) * Math.SQRT2 * gain;
    const S = this.S;
    // soften digital note onsets (KS plucks etc. start at full amplitude)
    const nf = Math.min(x.length, Math.round(S.sr * 0.0015));
    if (nf > 1 && Math.abs(x[0]) > 1e-4) for (let i = 0; i < nf; i++) x[i] *= i / nf;
    // ...and make sure every note dies away instead of being truncated
    if (x.length > 8 && Math.abs(x[x.length - 1]) + Math.abs(x[x.length - 2]) > 1e-4) {
      const nt = Math.min(x.length >> 1, Math.round(S.sr * Math.max(0.02, Math.min(0.4, x.length / S.sr * 0.15))));
      for (let i = 0; i < nt; i++) x[x.length - 1 - i] *= i / nt;
    }
    S.mix(L, x, t, gl); S.mix(R, x, t, gr);
    if (send > 0) { S.mix(SL, x, t, gl * send); S.mix(SR, x, t, gr * send); }
  }
  /** note/event (wraps at loop point) */
  add(x, t, { gain = 1, pan = 0, send = 0.25 } = {}) { this._put(this.dl, this.dr, this.sl, this.sr, x, t, gain, pan, send); }
  /** continuous bed spanning the whole loop (+xfade); cross-faded at the seam */
  bed(x, { gain = 1, pan = 0, send = 0.25 } = {}) { this._put(this.bl, this.br, this.bsl, this.bsr, x, 0, gain, pan, send); }
  finish({ room = 0.8, damp = 0.45, wet = 0.3 } = {}) {
    const S = this.S;
    if (!this.L) {
      S.verbStereo(this.sl, this.sr, this.dl, this.dr, { room, damp, wet });
      return [this.dl, this.dr];
    }
    const nl = S.len(this.L), nx = S.len(this.X);
    const out = [], sends = [];
    for (const [d, s, b, bs] of [[this.dl, this.sl, this.bl, this.bsl], [this.dr, this.sr, this.br, this.bsr]]) {
      const o = S.wrap(d, nl), so = S.wrap(s, nl);
      const bo = S.loopXfade(b, nl, nx), bso = S.loopXfade(bs, nl, nx);
      for (let i = 0; i < nl; i++) { o[i] += bo[i]; so[i] += bso[i]; }
      out.push(o); sends.push(so);
    }
    // reverb over two tiled periods; keep the second so tails carried over the seam are included
    const tl = new Float32Array(nl * 2), tr = new Float32Array(nl * 2);
    tl.set(sends[0]); tl.set(sends[0], nl); tr.set(sends[1]); tr.set(sends[1], nl);
    const wl = new Float32Array(nl * 2), wr = new Float32Array(nl * 2);
    S.verbStereo(tl, tr, wl, wr, { room, damp, wet });
    for (let i = 0; i < nl; i++) { out[0][i] += wl[nl + i]; out[1][i] += wr[nl + i]; }
    return out;
  }
}

// ---------------------------------------------------------------- instruments (mono)
function envADSR(S, x, att, dec, sus, rel, hold) {
  const sr = S.sr, n = x.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let e;
    if (t < att) e = t / att;
    else if (t < att + dec) e = 1 - (1 - sus) * (t - att) / dec;
    else if (t < hold) e = sus;
    else e = sus * Math.max(0, 1 - (t - hold) / rel);
    if (t < att) e = Math.sin(0.5 * Math.PI * e);
    x[i] *= e;
  }
  return x;
}
const fnOf = (f) => (typeof f === 'function' ? f : () => f);

const I = {
  timp(S, f, vel = 1, len = 2.6) {
    const ex = S.burst(0.012, 0.003); S.lp(ex, 600 + 1600 * vel);
    const m = S.modes(len, [[f, 0.9, 1], [f * 1.504, 0.6, 0.55], [f * 1.742, 0.45, 0.35], [f * 2.0, 0.4, 0.3], [f * 2.245, 0.3, 0.2], [f * 2.494, 0.25, 0.12]], ex);
    S.norm(m, 1);
    const th = S.thump(0.5, f * 1.6, f, 0.02, 0.18, 0.002);
    S.mix(m, th, 0, 0.7);
    const sn = S.burst(0.1, 0.012); S.lp(sn, 1800); S.mix(m, S.norm(sn, 1), 0, 0.25 * vel);
    return S.mul(S.norm(m, 1), vel);
  },
  tom(S, f, vel = 1) {
    const x = S.thump(0.9, f * 2.2, f, 0.025, 0.22, 0.001);
    const n = S.burst(0.3, 0.035); S.lp(n, 1500); S.mix(x, S.norm(n, 1), 0, 0.45);
    S.mix(x, S.modes(0.5, [[f * 1.58, 0.12, 0.3], [f * 2.3, 0.07, 0.15]]), 0, 1);
    return S.mul(S.sat(S.norm(x, 1), 1.4), vel);
  },
  kick(S, vel = 1) {
    const x = S.thump(0.6, 160, 46, 0.03, 0.16, 0.001);
    S.mix(x, S.click(3000, 1, 0.002, 0.02), 0, 0.15);
    return S.mul(S.sat(S.norm(x, 1), 1.6), vel);
  },
  snare(S, vel = 1, tau = 0.11) {
    const n = S.burst(0.5, tau); S.bp(n, 3200, 0.6); S.norm(n, 1);
    const b = S.thump(0.2, 260, 185, 0.01, 0.05, 0.001);
    S.mix(n, b, 0, 0.7);
    S.mix(n, S.mul(S.thump(0.15, 380, 330, 0.01, 0.03), 0.3), 0, 1);
    return S.mul(S.norm(n, 1), vel);
  },
  crash(S, len = 2.8, vel = 1) {
    const x = S.buf(len);
    for (const f of [410.6, 608.8, 739.2, 1045.4, 1080, 1600]) S.add(x, S.mul(S.osc('square', len, f * S.jit(1, 0.01)), 0.15));
    const n = S.noise(len); S.add(x, n);
    S.hp(x, 3200); S.peq(x, 7000, 0.8, 4);
    S.mul(x, (t) => Math.min(1, t / 0.002) * (0.35 * Math.exp(-t / 0.08) + 0.65 * Math.exp(-t / (len * 0.25))));
    return S.mul(S.norm(x, 1), vel);
  },
  hat(S, vel = 1, open = false) {
    const x = S.burst(open ? 0.4 : 0.08, open ? 0.12 : 0.018);
    S.hp(x, 6500);
    return S.mul(S.norm(x, 1), vel);
  },
  brass(S, f, dur, { vel = 1, bright = 1, att = 0.035, rel = 0.18, sub = 0 } = {}) {
    const len = dur + rel + 0.05, F = fnOf(f);
    const x = S.buf(len);
    const vib = (t) => 1 + (t > 0.25 ? 0.004 * Math.sin(6.2832 * 5.2 * t) : 0);
    for (const d of [-0.004, 0, 0.0045]) S.add(x, S.osc('saw', len, (t) => F(t) * (1 + d) * vib(t), S.r()));
    if (sub > 0) S.add(x, S.mul(S.osc('saw', len, (t) => F(t) * 0.5 * vib(t)), sub));
    const f0 = F(0);
    S.lp(x, (t) => {
      const a = t < att ? t / att : 0.45 + 0.55 * Math.exp(-(t - att) / 0.25);
      return Math.min(SR * 0.45, f0 * (1.2 + (2.5 + 6 * vel * bright) * a));
    }, 1.1);
    envADSR(S, x, att, 0.15, 0.78, rel, dur);
    S.sat(x, 1.3);
    return S.mul(S.norm(x, 1), vel);
  },
  strings(S, f, dur, { att = 0.25, rel = 0.5, trem = 0, tremR = 12, bright = 1, vel = 1 } = {}) {
    const len = dur + rel + 0.05, F = fnOf(f);
    const x = S.buf(len);
    for (const d of [-0.006, -0.002, 0.003, 0.007]) {
      const vp = S.rand(0, 6.28), vr = S.rand(4.8, 6.0);
      S.add(x, S.osc('saw', len, (t) => F(t) * (1 + d) * (1 + 0.0035 * Math.sin(vr * 6.2832 * t + vp)), S.r()));
    }
    const fc = (t) => Math.min(SR * 0.42, F(t) * 5 * bright + 400);
    S.lp(x, fc, 0.6); S.lp(x, (t) => fc(t) * 1.3, 0.6);
    envADSR(S, x, att, 0.1, 0.92, rel, dur);
    if (trem > 0) S.mul(x, (t) => 1 - trem * (0.5 + 0.5 * Math.sin(6.2832 * tremR * t)));
    return S.mul(S.norm(x, 1), vel);
  },
  pad(S, f, dur, { att = 1.2, rel = 1.6, cut = 1100, vel = 1 } = {}) {
    const len = dur + rel + 0.05;
    const x = S.buf(len);
    for (const d of [-0.005, 0.005]) S.add(x, S.osc('saw', len, f * (1 + d), S.r()));
    S.add(x, S.mul(S.osc('tri', len, f * 0.5), 0.6));
    const lf = S.rand(0, 6.28);
    S.lp(x, (t) => cut * (1 + 0.25 * Math.sin(0.7 * t + lf)), 0.9);
    envADSR(S, x, att, 0.5, 0.85, rel, dur);
    return S.mul(S.norm(x, 1), vel);
  },
  glass(S, f, len = 3, { att = 0.01, vel = 1 } = {}) {
    const x = S.fm(len, f, 2.0, (t) => 0.9 * Math.exp(-t / 0.8));
    S.add(x, S.mul(S.osc('sine', len, f * 2.76), 0.12));
    S.mul(x, (t) => Math.min(1, t / att) * Math.exp(-t / (len * 0.3)));
    return S.mul(S.norm(x, 1), vel);
  },
  bell(S, f, len = 3, vel = 1) {
    const x = S.fm(len, f, 1.4, (t) => 3 * Math.exp(-t / 0.6));
    S.mul(x, (t) => Math.min(1, t / 0.002) * Math.exp(-t / (len * 0.3)));
    return S.mul(S.norm(x, 1), vel);
  },
  pluck(S, f, len = 2.5, { bright = 0.5, decay = 0.997, vel = 1 } = {}) {
    const x = S.ks(f, len, { bright, decay, pick: 0.18 });
    S.dcblock(x);
    S.mul(x, (t) => Math.min(1, (len - t) / 0.05));
    return S.mul(S.norm(x, 1), vel);
  },
  banjo(S, f, vel = 1) {
    const len = 1.4;
    const x = S.ks(f, len, { bright: 0.95, decay: 0.988, pick: 0.11 });
    S.dcblock(x);
    S.peq(x, 520, 2, 7); S.peq(x, 1300, 2, 4); S.hp(x, 120);
    const tw = S.fm(0.08, f * 2, 3, 2); S.mul(tw, (t) => Math.exp(-t / 0.015));
    S.mix(x, tw, 0, 0.15);
    S.mul(x, (t) => Math.min(1, (len - t) / 0.08));
    return S.mul(S.norm(x, 1), vel);
  },
  slide(S, f0, f1, dur, { glide = 0.18, vel = 1 } = {}) {
    const len = dur + 0.4;
    const F = (t) => (t < glide ? f0 * Math.pow(f1 / f0, 0.5 - 0.5 * Math.cos(Math.PI * t / glide)) : f1) * (1 + (t > 0.3 ? 0.006 * Math.sin(6.2832 * 5 * t) : 0));
    const x = S.buf(len), sr = S.sr;
    const ph = new Float64Array(9);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr, fr = F(t);
      let v = 0;
      for (let k = 1; k <= 8; k++) {
        if (fr * k > sr * 0.45) break;
        ph[k] += fr * k / sr;
        v += Math.sin(6.2832 * ph[k]) * Math.exp(-t * (0.8 + k * 0.9)) / k;
      }
      x[i] = v;
    }
    S.lp(x, 2800);
    const pk = S.burst(0.05, 0.006); S.bp(pk, 2500, 1); S.mix(x, S.norm(pk, 1), 0, 0.15);
    envADSR(S, x, 0.004, 0.1, 1, 0.3, dur);
    return S.mul(S.norm(x, 1), vel);
  },
  choir(S, f, dur, vowel = 'a', { att = 0.6, rel = 0.8, vel = 1 } = {}) {
    const len = dur + rel;
    const x = S.buf(len);
    for (const d of [-0.007, 0, 0.006]) {
      const vr = S.rand(4.5, 5.5), vp = S.rand(0, 6);
      S.add(x, S.voice({ dur: len, f0: (t) => f * (1 + d) * (1 + 0.005 * Math.sin(6.2832 * vr * t + vp)), vowel, breath: 0.22, jitter: 0.004, shimmer: 0.03, fscale: f > 260 ? 1.15 : 1 }));
    }
    envADSR(S, x, att, 0.3, 0.9, rel, dur);
    return S.mul(S.norm(x, 1), vel);
  },
  drone(S, f, len, { cut = 500, vel = 1 } = {}) {
    const x = S.buf(len);
    for (const d of [-0.003, 0.003]) S.add(x, S.osc('saw', len, f * (1 + d), S.r()));
    S.add(x, S.mul(S.osc('sine', len, f * 0.5), 1.2));
    S.lp(x, cut, 0.8);
    return S.mul(S.norm(x, 1), vel);
  },
  bowed(S, f, len, vel = 1) {
    const ex = S.noise(len);
    S.mul(ex, (t) => Math.sin(Math.PI * Math.min(1, t / len)) ** 2);
    const m = S.modes(len, [[f, 1.5, 1], [f * 2.32, 1.2, 0.7], [f * 4.25, 0.9, 0.5], [f * 6.63, 0.6, 0.3], [f * 9.38, 0.4, 0.2]], ex);
    S.mul(m, (t) => Math.min(1, (len - t) / 0.3));
    return S.mul(S.norm(m, 1), vel);
  },
  riser(S, len, vel = 1) {
    const x = S.noise(len);
    S.bp(x, (t) => 400 + 7000 * Math.pow(t / len, 2), 1.2);
    S.mul(x, (t) => Math.pow(t / len, 2.5) * Math.min(1, (len - t) / 0.03));
    return S.mul(S.norm(x, 1), vel);
  },
  piano(S, f, vel = 1, len = 3) {
    const x = S.buf(len), sr = S.sr, B = 0.0004;
    const parts = [];
    for (let k = 1; k <= 10; k++) { const fk = k * f * Math.sqrt(1 + B * k * k); if (fk < sr * 0.45) parts.push([fk, 2.5 / Math.pow(k, 0.8), (1 / k) * (k === 1 ? 1 : 0.7)]); }
    S.add(x, S.modes(len, parts));
    const h = S.burst(0.03, 0.004); S.lp(h, 2500); S.mix(x, S.norm(h, 1), 0, 0.08);
    S.mul(x, (t) => Math.min(1, (len - t) / 0.1));
    return S.mul(S.norm(x, 1), vel);
  },
  pizz(S, f, vel = 1) { return I.pluck(S, f, 0.7, { bright: 0.35, decay: 0.985, vel }); },
  xylo(S, f, vel = 1) {
    const x = S.modes(0.8, [[f, 0.25, 1], [f * 3.93, 0.07, 0.4], [f * 9.0, 0.025, 0.15]], S.burst(0.003, 0.0005));
    return S.mul(S.norm(x, 1), vel);
  },
  boom(S, vel = 1) {
    const x = S.thump(2.5, 75, 28, 0.15, 0.6, 0.003);
    return S.mul(S.norm(x, 1), vel);
  },
  heart(S, vel = 1) {
    const x = S.buf(0.7);
    S.mix(x, S.thump(0.35, 80, 48, 0.02, 0.07, 0.006), 0, 1);
    S.mix(x, S.thump(0.35, 75, 44, 0.02, 0.06, 0.006), 0.17, 0.6);
    S.lp(x, 300);
    return S.mul(S.norm(x, 1), vel);
  },
};

// chords
const chord = (names) => names.map(N);

// ---------------------------------------------------------------- cue helpers
function brassChord(S, mx, t, notes, dur, opts = {}) {
  notes.forEach((f, k) => mx.add(I.brass(S, f, dur, { ...opts, vel: (opts.vel ?? 1) }), t + k * 0.004, { gain: (opts.gain ?? 0.5) / Math.sqrt(notes.length), pan: (k / Math.max(1, notes.length - 1) - 0.5) * 0.6, send: opts.send ?? 0.3 }));
}
function stringChord(S, mx, t, notes, dur, opts = {}) {
  notes.forEach((f, k) => mx.add(I.strings(S, f, dur, opts), t, { gain: (opts.gain ?? 0.5) / Math.sqrt(notes.length), pan: (k / Math.max(1, notes.length - 1) - 0.5) * 0.9, send: opts.send ?? 0.4 }));
}
function padChord(S, mx, t, notes, dur, opts = {}) {
  notes.forEach((f, k) => mx.add(I.pad(S, f, dur, opts), t, { gain: (opts.gain ?? 0.5) / Math.sqrt(notes.length), pan: (k / Math.max(1, notes.length - 1) - 0.5) * 0.8, send: opts.send ?? 0.5 }));
}

// ---------------------------------------------------------------- cues
const CUES = {
  horde_incoming: { loop: false, duck: 0.45, dur: 7, gen(S) {
    const mx = new Mix(S, 8.5);
    const b = 60 / 140;
    mx.add(I.timp(S, N('D2'), 1, 3), 0, { gain: 0.9, send: 0.3 });
    mx.add(I.crash(S, 2.5, 0.8), 0, { gain: 0.35, pan: 0.3 });
    brassChord(S, mx, 0, chord(['D2', 'A2', 'D3', 'Eb3']), 0.5, { gain: 0.8, sub: 0.4 });
    // accelerating toms
    let t = b, gap = b;
    let k = 0;
    while (t < 4.5) {
      mx.add(I.tom(S, k % 3 === 2 ? N('A2') : k % 2 ? N('F2') : N('D2'), 0.6 + 0.4 * t / 4.5), t, { gain: 0.7, pan: k % 2 ? 0.3 : -0.3, send: 0.2 });
      t += gap; gap = Math.max(0.07, gap * 0.9); k++;
    }
    // snare roll crescendo
    for (let s = 3.3; s < 4.6; s += 0.055) mx.add(I.snare(S, 0.2 + 0.8 * (s - 3.3) / 1.3, 0.06), s, { gain: 0.35, pan: 0.15, send: 0.2 });
    // rising dissonant string glissandi
    for (const [lo, semis, pan] of [[N('D3'), 0, -0.5], [N('D3'), 1, 0.5], [N('A3'), 0, 0], [N('A3'), 1, 0.2]]) {
      const f0 = lo * Math.pow(2, semis / 12);
      mx.add(I.strings(S, (tt) => f0 * Math.pow(2, 1.6 * Math.min(1, tt / 4.6)), 4.6, { att: 1.5, rel: 0.1, trem: 0.5, tremR: 13, vel: 1 }), 0.1, { gain: 0.32, pan, send: 0.4 });
    }
    // ascending dissonant stabs
    brassChord(S, mx, 4 * b, chord(['F3', 'Gb3']), 0.25, { gain: 0.5 });
    brassChord(S, mx, 8 * b, chord(['A3', 'Bb3']), 0.25, { gain: 0.55 });
    brassChord(S, mx, 10 * b, chord(['C4', 'Db4', 'D3']), 0.3, { gain: 0.6 });
    // final hit
    const H = 4.7;
    mx.add(I.timp(S, N('D2'), 1, 3), H, { gain: 1, send: 0.35 });
    mx.add(I.boom(S, 1), H, { gain: 0.8, send: 0.1 });
    mx.add(I.crash(S, 3, 1), H, { gain: 0.45, pan: -0.3 });
    brassChord(S, mx, H, chord(['D2', 'D3', 'A3', 'Eb4', 'F4']), 1.4, { gain: 0.95, sub: 0.5, rel: 0.6 });
    stringChord(S, mx, H, chord(['D4', 'Eb5', 'A5']), 1.2, { att: 0.02, rel: 1.0, trem: 0.4, gain: 0.4 });
    return mx.finish({ room: 0.85, wet: 0.3 });
  } },

  horde_loop: { gain: 0.9, loop: true, dur: 7.5, gen(S) {
    const b = 60 / 128, L = 16 * b, s16 = b / 4;
    const mx = new Mix(S, L + 3, L, 1);
    const toms = 'X..xX..xX.x.X.xx';
    const kicks = 'x.....x.x.......';
    const chords = [['D3', 'F3', 'A3'], ['Bb2', 'D3', 'F3'], ['C3', 'E3', 'G3'], ['A2', 'C#3', 'E3']];
    const bass = ['D2', 'Bb1', 'C2', 'A1'];
    for (let bar = 0; bar < 4; bar++) {
      const t0 = bar * 4 * b;
      for (let i = 0; i < 16; i++) {
        const t = t0 + i * s16;
        if (toms[i] !== '.') mx.add(I.tom(S, toms[i] === 'X' ? N('D2') : N('A2'), toms[i] === 'X' ? 1 : 0.65), t, { gain: 0.55, pan: toms[i] === 'X' ? -0.25 : 0.3, send: 0.15 });
        if (kicks[i] === 'x') mx.add(I.kick(S, 1), t, { gain: 0.6, send: 0.05 });
        if (i % 8 === 4) mx.add(I.snare(S, 1), t, { gain: 0.45, pan: 0.1, send: 0.2 });
        if (i % 2 === 0) mx.add(I.hat(S, i % 4 === 2 ? 0.8 : 0.45), t, { gain: 0.12, pan: 0.4, send: 0.05 });
        if (i % 2 === 0) mx.add(I.strings(S, N(bass[bar]) * (i % 4 === 2 ? 2 : 1), s16 * 1.5, { att: 0.01, rel: 0.08, bright: 1.5 }), t, { gain: 0.32, pan: -0.1, send: 0.15 });
      }
      brassChord(S, mx, t0, chord(chords[bar]), 0.28, { gain: 0.5 });
      if (bar === 3) { brassChord(S, mx, t0 + 2.5 * b, chord(chords[bar]), 0.2, { gain: 0.4 }); brassChord(S, mx, t0 + 3 * b, chord(['D3', 'F3', 'A3']), 0.2, { gain: 0.45 }); }
      stringChord(S, mx, t0, chord(chords[bar]).map((f) => f * 2), 4 * b - 0.1, { att: 0.15, rel: 0.3, trem: 0.45, tremR: 12, gain: 0.22 });
    }
    mx.add(I.crash(S, 2.5, 0.7), 0, { gain: 0.2, pan: 0.35 });
    return mx.finish({ room: 0.75, wet: 0.22 });
  } },

  tank: { loop: true, dur: 12.8, gen(S) {
    const b = 0.4, L = 32 * b, e = b / 2;
    const mx = new Mix(S, L + 4, L, 2);
    const riff = [ // [beat, note, beats]
      [0, 'D2', 1.5], [1.5, 'D2', 0.5], [2, 'F2', 1], [3, 'Eb2', 1],
      [4, 'D2', 2], [6, 'C2', 1], [7, 'Db2', 1],
      [8, 'D2', 1.5], [9.5, 'D2', 0.5], [10, 'Ab2', 1], [11, 'G2', 1],
      [12, 'F2', 1], [13, 'Eb2', 1], [14, 'D2', 2],
    ];
    for (let half = 0; half < 2; half++) {
      const off = half * 16 * b;
      for (const [bt, nn, len] of riff) {
        mx.add(I.brass(S, N(nn), len * b * 0.92, { vel: 1, bright: 0.55, sub: 0.4, att: 0.03, rel: 0.12 }), off + bt * b, { gain: 0.5, pan: -0.15, send: 0.25 });
        if (half === 1) mx.add(I.brass(S, N(nn) * 2, len * b * 0.92, { vel: 0.9, bright: 0.7, att: 0.03, rel: 0.12 }), off + bt * b, { gain: 0.3, pan: 0.25, send: 0.3 });
      }
    }
    for (let i = 0; i < 32; i++) {
      const t = i * b;
      mx.add(I.timp(S, i % 4 === 2 ? N('A1') : N('D2'), i % 4 === 0 ? 1 : 0.75, 1.6), t, { gain: 0.95, pan: -0.2, send: 0.2 });
      if (i % 4 === 1 || i % 4 === 3) mx.add(I.snare(S, 1, 0.14), t, { gain: 0.42, pan: 0.15, send: 0.3 });
      // taiko gallop: beat + 3/4 of the beat
      mx.add(I.tom(S, N('D2') * 0.75, 1), t, { gain: 0.45, pan: 0.2, send: 0.15 });
      if (i % 2 === 1) mx.add(I.tom(S, N('F2') * 0.75, 0.7), t + 0.75 * b, { gain: 0.35, pan: 0.35, send: 0.15 });
      // low string ostinato in eighths: D D D Eb
      for (let k = 0; k < 2; k++) {
        const idx = (i * 2 + k) % 8;
        const f = idx === 7 ? N('Eb3') : idx === 3 ? N('C3') : N('D3');
        mx.add(I.strings(S, f, e * 0.8, { att: 0.008, rel: 0.06, bright: 1.6 }), t + k * e, { gain: 0.28, pan: 0.3, send: 0.15 });
      }
    }
    mx.add(I.crash(S, 3, 0.9), 0, { gain: 0.3, pan: -0.4 });
    mx.add(I.crash(S, 3, 0.9), 16 * b, { gain: 0.3, pan: 0.4 });
    mx.bed(I.drone(S, N('D1'), L + 2, { cut: 300 }), { gain: 0.2, send: 0.05 });
    return mx.finish({ room: 0.8, wet: 0.22 });
  } },

  witch_near: { gain: 0.8, loop: true, dur: 12, gen(S) {
    const L = 12;
    const mx = new Mix(S, L + 5, L, 2);
    // shimmering tremolo cluster (bed)
    const cl = [N('A5'), N('Bb5'), N('E6')];
    cl.forEach((f, k) => {
      const q = Math.round(f * L) / L;
      mx.bed(I.strings(S, q, L + 2, { att: 0.01, rel: 0.01, trem: 0.85, tremR: 13 + k * 0.5, bright: 0.6 }), { gain: 0.16, pan: (k - 1) * 0.6, send: 0.6 });
    });
    const low = S.noise(L + 2); S.lp(low, 260); mx.bed(S.norm(low, 1), { gain: 0.12, send: 0.3 });
    // glassy tones on a whole-tone set
    const set = ['C5', 'D5', 'E5', 'F#5', 'G#5', 'A#5', 'C6', 'D6'].map(N);
    for (let t = 0.3; t < L - 0.5; t += S.rand(1.0, 1.8)) mx.add(I.glass(S, S.pick(set), 3.5, { att: S.rand(0.01, 0.2) }), t, { gain: 0.3, pan: S.rand(-0.8, 0.8), send: 0.7 });
    for (const t of [1.5, 7.5]) mx.add(I.bowed(S, S.pick([N('E3'), N('Bb2'), N('F3')]), 4), t, { gain: 0.3, pan: S.rand(-0.5, 0.5), send: 0.6 });
    return mx.finish({ room: 0.92, damp: 0.3, wet: 0.4 });
  } },

  witch_rage: { loop: false, duck: 0.3, dur: 1.6, gen(S) {
    const mx = new Mix(S, 3.2);
    stringChord(S, mx, 0, [N('C5'), N('Db5'), N('G5'), N('Ab5')].map((f) => (t) => f * Math.pow(2, Math.min(1, t / 0.45))), 1.1, { att: 0.01, rel: 0.5, trem: 0.5, tremR: 15, gain: 0.7, bright: 1.4 });
    brassChord(S, mx, 0, chord(['D3', 'Eb3', 'Ab3', 'A3']), 0.6, { gain: 0.8, sub: 0.3, rel: 0.4 });
    mx.add(I.timp(S, N('D2'), 1, 2.4), 0, { gain: 0.8 });
    mx.add(I.crash(S, 2.5, 1), 0, { gain: 0.4, pan: 0.3 });
    mx.add(I.glass(S, N('D7') * 0.5, 1.5), 0.02, { gain: 0.3, pan: -0.4 });
    return mx.finish({ room: 0.8, wet: 0.3 });
  } },

  stinger_boomer: { loop: false, duck: 0.6, dur: 2.2, gen(S) {
    const mx = new Mix(S, 3.6);
    const wob = (f) => (t) => f * (1 + 0.03 * Math.sin(6.2832 * 7 * t));
    mx.add(I.brass(S, wob(N('F2')), 0.32, { bright: 0.35, sub: 0.5 }), 0, { gain: 0.8, send: 0.25 });
    mx.add(I.brass(S, wob(N('E2')), 0.32, { bright: 0.35, sub: 0.5 }), 0.4, { gain: 0.8, send: 0.25 });
    mx.add(I.brass(S, (t) => N('B1') * (1 - 0.05 * Math.min(1, t / 1.2)) * (1 + 0.045 * Math.sin(6.2832 * 6 * t)), 1.1, { bright: 0.35, sub: 0.6, rel: 0.4 }), 0.8, { gain: 0.9, send: 0.3 });
    mx.add(I.timp(S, N('B1'), 0.8, 2), 0.8, { gain: 0.6 });
    mx.add(I.pizz(S, N('F3'), 0.7), 0, { gain: 0.25, pan: 0.4 });
    mx.add(I.pizz(S, N('E3'), 0.7), 0.4, { gain: 0.25, pan: 0.4 });
    return mx.finish({ room: 0.7, wet: 0.25 });
  } },
  stinger_hunter: { loop: false, duck: 0.6, dur: 2, gen(S) {
    const mx = new Mix(S, 3.2);
    const s = 60 / 160 / 4;
    ['E5', 'F5', 'E5', 'F5', 'E5', 'F5'].forEach((n, k) => mx.add(I.strings(S, N(n), s * 0.9, { att: 0.005, rel: 0.05, bright: 1.6 }), k * s, { gain: 0.45, pan: 0.3, send: 0.3 }));
    stringChord(S, mx, 6 * s, chord(['C6', 'B5', 'F5']), 0.35, { att: 0.005, rel: 0.6, bright: 1.5, gain: 0.6 });
    mx.add(I.snare(S, 1), 6 * s, { gain: 0.4 });
    mx.add(I.piano(S, N('C2'), 1, 2), 6 * s, { gain: 0.5, pan: -0.3 });
    mx.add(I.piano(S, N('F#2'), 1, 2), 6 * s, { gain: 0.4, pan: -0.3 });
    return mx.finish({ room: 0.7, wet: 0.3 });
  } },
  stinger_smoker: { loop: false, duck: 0.6, dur: 2.5, gen(S) {
    const mx = new Mix(S, 4);
    const bend = (f) => (t) => f * Math.pow(2, -Math.min(1, Math.max(0, t - 0.3) / 1.8) / 12);
    chord(['F#3', 'C4', 'F4']).forEach((f, k) => mx.add(I.brass(S, bend(f), 2.0, { bright: 0.25, att: 0.08, rel: 0.4, vel: 0.8 }), 0, { gain: 0.35, pan: (k - 1) * 0.5, send: 0.4 }));
    const br = S.noise(2.4); S.bp(br, (t) => 1500 - t * 300, 1.5); S.mul(br, (t) => Math.sin(Math.PI * Math.min(1, t / 2.4)) * (0.6 + 0.4 * Math.sin(t * 9)));
    mx.add(S.norm(br, 1), 0, { gain: 0.15, send: 0.5 });
    mx.add(I.glass(S, N('B5'), 2.5), 0.1, { gain: 0.25, pan: 0.5 });
    mx.add(I.timp(S, N('F#2'), 0.6, 2.2), 0, { gain: 0.4 });
    return mx.finish({ room: 0.85, wet: 0.35 });
  } },
  stinger_charger: { loop: false, duck: 0.6, dur: 2, gen(S) {
    const mx = new Mix(S, 3.4);
    for (const [t, v] of [[0, 0.8], [0.32, 0.9], [0.56, 1]]) { mx.add(I.tom(S, N('C2'), v), t, { gain: 0.7, send: 0.2 }); mx.add(I.kick(S, v), t, { gain: 0.5 }); }
    mx.add(I.brass(S, (t) => N('A1') * Math.pow(2, 0.66 * Math.min(1, t / 0.6)), 1.0, { bright: 0.6, sub: 0.6, rel: 0.4 }), 0, { gain: 0.8, send: 0.3 });
    brassChord(S, mx, 0.8, chord(['F2', 'C3', 'F3', 'Gb3']), 0.6, { gain: 0.8, sub: 0.4, rel: 0.5 });
    mx.add(I.crash(S, 2.4, 1), 0.8, { gain: 0.35, pan: 0.3 });
    mx.add(I.timp(S, N('F2'), 1, 2), 0.8, { gain: 0.7 });
    return mx.finish({ room: 0.75, wet: 0.25 });
  } },
  stinger_jockey: { loop: false, duck: 0.6, dur: 2, gen(S) {
    const mx = new Mix(S, 3.2);
    const e = 60 / 180 / 2;
    ['C5', 'F#5', 'B4', 'F5', 'Bb4', 'E5'].forEach((n, k) => {
      mx.add(I.xylo(S, N(n), 0.9), k * e, { gain: 0.5, pan: k % 2 ? 0.4 : -0.4, send: 0.25 });
      mx.add(I.pizz(S, N(n) / 2, 0.8), k * e, { gain: 0.3, pan: 0, send: 0.2 });
    });
    for (let k = 0; k < 10; k++) mx.add(I.xylo(S, N(k % 2 ? 'E6' : 'F6'), 0.5 + 0.05 * k), 6 * e + k * 0.045, { gain: 0.3, pan: 0.3, send: 0.3 });
    mx.add(I.snare(S, 0.7, 0.05), 6 * e, { gain: 0.3 });
    return mx.finish({ room: 0.7, wet: 0.25 });
  } },
  stinger_spitter: { loop: false, duck: 0.6, dur: 2.5, gen(S) {
    const mx = new Mix(S, 4);
    const F = (t) => (t < 0.9 ? N('A5') * Math.pow(2, -6 * (t / 0.9) / 12) : N('D#5') * Math.pow(2, Math.min(1, (t - 0.9) / 0.4) / 12)) * (1 + 0.012 * Math.sin(6.2832 * 6 * t));
    const th = S.osc('sine', 2.4, F); S.add(th, S.mul(S.osc('sine', 2.4, (t) => F(t) * 2), 0.15));
    S.mul(th, (t) => Math.min(1, t / 0.08) * Math.min(1, (2.4 - t) / 0.5));
    mx.add(th, 0, { gain: 0.45, send: 0.5 });
    const fz = S.noise(2.2); S.hp(fz, 4000); const w = S.wobble(2.2, 20);
    for (let i = 0; i < fz.length; i++) fz[i] *= Math.max(0, w[i]) ** 2;
    S.mul(fz, (t) => Math.min(1, t / 0.3) * Math.min(1, (2.2 - t) / 0.4));
    mx.add(S.norm(fz, 1), 0.1, { gain: 0.18, pan: 0.4, send: 0.3 });
    mx.add(I.pizz(S, N('D#3'), 1), 0, { gain: 0.4, pan: -0.3 });
    mx.add(I.pizz(S, N('A2'), 1), 0.9, { gain: 0.4, pan: -0.3 });
    return mx.finish({ room: 0.8, wet: 0.35 });
  } },

  incap: { gain: 0.85, loop: true, dur: 8, gen(S) {
    const L = 8;
    const mx = new Mix(S, L + 4, L, 2);
    for (const [f, g] of [[N('D1'), 0.4], [N('Eb2'), 0.18]]) mx.bed(I.drone(S, Math.round(f * L) / L, L + 2, { cut: 260 }), { gain: g, send: 0.2 });
    const hi = S.buf(L + 2);
    for (const f of [N('A4'), N('Bb4')]) S.add(hi, I.strings(S, Math.round(f * L) / L, L + 2, { att: 0.01, rel: 0.01, trem: 0.3, tremR: 0.5, bright: 0.4 }));
    S.lp(hi, 1500);
    mx.bed(S.norm(hi, 1), { gain: 0.08, send: 0.6 });
    for (let k = 0; k < 8; k++) mx.add(I.heart(S, k % 2 ? 0.85 : 1), k * 1.0, { gain: 0.75, send: 0.05 });
    return mx.finish({ room: 0.8, damp: 0.6, wet: 0.3 });
  } },

  death: { loop: false, duck: 0.0, dur: 6, gen(S) {
    const mx = new Mix(S, 8.5);
    mx.add(I.piano(S, N('D2'), 1, 5), 0, { gain: 0.6, pan: -0.2, send: 0.4 });
    mx.add(I.piano(S, N('D3'), 0.7, 5), 0.01, { gain: 0.35, pan: -0.1, send: 0.4 });
    chord(['D3', 'F3', 'A3', 'E4']).forEach((f, k) => mx.add(I.choir(S, f, 2.6, k > 1 ? 'o' : 'a', { att: 0.9, rel: 1.2 }), 0.2, { gain: 0.25, pan: (k - 1.5) * 0.4, send: 0.6 }));
    stringChord(S, mx, 0.1, chord(['D2', 'A2', 'F4']), 2.6, { att: 1.0, rel: 1.2, gain: 0.35 });
    stringChord(S, mx, 3.0, chord(['Bb1', 'F2', 'D4', 'A4']), 2.6, { att: 0.8, rel: 2.0, gain: 0.4 });
    chord(['Bb2', 'D3', 'F3', 'A3']).forEach((f, k) => mx.add(I.choir(S, f, 2.2, 'o', { att: 0.7, rel: 1.8 }), 3.0, { gain: 0.22, pan: (k - 1.5) * 0.4, send: 0.6 }));
    mx.add(I.piano(S, N('A4'), 0.5, 4), 3.0, { gain: 0.2, pan: 0.3, send: 0.5 });
    return mx.finish({ room: 0.9, damp: 0.5, wet: 0.4 });
  } },

  saferoom: { gain: 0.8, loop: true, dur: 16, gen(S) {
    const b = 1, L = 16;
    const mx = new Mix(S, L + 5, L, 2);
    const prog = [['A2', 'C3', 'E3', 'A3'], ['F2', 'A2', 'C3', 'E3'], ['C3', 'E3', 'G3', 'C4'], ['B2', 'D3', 'G3', 'B3']];
    prog.forEach((c, k) => padChord(S, mx, k * 4 * b, chord(c), 3.8, { att: 1.0, rel: 1.6, cut: 900, gain: 0.45 }));
    // sparse plucked arpeggio
    const arp = [['A3', 'E4', 'C5'], ['F3', 'C4', 'A4'], ['C4', 'G4', 'E4'], ['G3', 'D4', 'B4']];
    arp.forEach((ns, k) => ns.forEach((n, j) => mx.add(I.pluck(S, N(n), 3, { bright: 0.35, decay: 0.998 }), k * 4 + j * 0.75 + (j === 2 ? 0.5 : 0), { gain: 0.28, pan: -0.3 + j * 0.3, send: 0.45 })));
    // slide guitar line (original)
    const mel = [[0.5, 'D4', 'E4', 2.5], [3.2, 'D4', 'C4', 0.8], [4.5, 'A3', 'C4', 2.0], [7.0, 'B3', 'A3', 0.9], [9.0, 'F4', 'G4', 2.0], [11.2, 'F4', 'E4', 0.8], [12.5, 'C4', 'D4', 1.5], [14.3, 'C4', 'B3', 1.5]];
    for (const [t, a, c, d] of mel) mx.add(I.slide(S, N(a), N(c), d, { glide: 0.25 }), t, { gain: 0.32, pan: 0.25, send: 0.5 });
    return mx.finish({ room: 0.85, damp: 0.55, wet: 0.35 });
  } },

  explore_hotel: { gain: 0.5, loop: true, dur: 18, gen(S) {
    const L = 18;
    const mx = new Mix(S, L + 6, L, 3);
    mx.bed(I.drone(S, Math.round(N('D2') * L) / L, L + 3, { cut: 380 }), { gain: 0.45, send: 0.3 });
    mx.bed(I.drone(S, Math.round(N('A2') * L) / L, L + 3, { cut: 300 }), { gain: 0.15, pan: 0.4, send: 0.4 });
    const r = S.brown(L + 3); S.lp(r, 200); mx.bed(S.norm(r, 1), { gain: 0.2, send: 0.2 });
    mx.add(I.bowed(S, N('Eb3'), 5), 2, { gain: 0.35, pan: -0.5, send: 0.6 });
    mx.add(I.bowed(S, N('G#2'), 6), 9, { gain: 0.35, pan: 0.5, send: 0.6 });
    mx.add(I.glass(S, N('D5'), 4, { att: 0.5 }), 13.5, { gain: 0.12, pan: 0.2, send: 0.7 });
    mx.add(I.piano(S, N('D1'), 0.6, 4), 6.0, { gain: 0.25, send: 0.5 });
    return mx.finish({ room: 0.9, damp: 0.5, wet: 0.35 });
  } },
  explore_streets: { gain: 0.5, loop: true, dur: 20, gen(S) {
    const L = 20;
    const mx = new Mix(S, L + 6, L, 3);
    const w = S.pink(L + 3); S.bp(w, (t) => 500 + 250 * Math.sin(t * 0.6), 0.7); mx.bed(S.norm(w, 1), { gain: 0.22, send: 0.4 });
    mx.bed(I.drone(S, Math.round(N('A1') * L) / L, L + 3, { cut: 300 }), { gain: 0.4, send: 0.3 });
    mx.add(I.brass(S, N('E3'), 3.0, { bright: 0.2, att: 1.5, rel: 1.5, vel: 0.6 }), 3, { gain: 0.25, pan: -0.3, send: 0.8 });
    mx.add(I.brass(S, N('F3'), 2.5, { bright: 0.2, att: 1.2, rel: 1.5, vel: 0.6 }), 11, { gain: 0.22, pan: 0.3, send: 0.8 });
    for (const t of [7.3, 15.8]) { const m = I.bell(S, S.pick([N('C3'), N('F#3')]), 3, 0.7); S.lp(m, 1200); mx.add(m, t, { gain: 0.25, pan: S.rand(-0.7, 0.7), send: 0.9 }); }
    return mx.finish({ room: 0.93, damp: 0.6, wet: 0.45 });
  } },
  explore_mall: { gain: 0.5, loop: true, dur: 16, gen(S) {
    const L = 16;
    const mx = new Mix(S, L + 6, L, 3);
    mx.bed(I.drone(S, Math.round(N('E2') * L) / L, L + 3, { cut: 320 }), { gain: 0.35, send: 0.3 });
    for (const [n, p] of [['B5', -0.5], ['E6', 0.5]]) { const f = Math.round(N(n) * L) / L; const g = S.osc('sine', L + 3, f); mx.bed(g, { gain: 0.035, pan: p, send: 0.8 }); }
    for (let t = 1; t < L - 1; t += S.rand(2.5, 4.5)) mx.add(I.glass(S, S.pick(['E5', 'G5', 'B5', 'D6', 'F#5'].map(N)), 4, { att: 0.05 }), t, { gain: 0.18, pan: S.rand(-0.8, 0.8), send: 0.9 });
    mx.add(I.bowed(S, N('B2'), 6), 5, { gain: 0.25, pan: 0.3, send: 0.7 });
    return mx.finish({ room: 0.96, damp: 0.35, wet: 0.5 });
  } },

  danger: { gain: 0.85, loop: false, duck: 0.6, dur: 2.5, gen(S) {
    const mx = new Mix(S, 3.6);
    mx.add(I.riser(S, 2.4), 0, { gain: 0.5, send: 0.3 });
    chord(['D4', 'Eb4', 'A4', 'Bb4']).forEach((f, k) => {
      const s = I.strings(S, f, 2.35, { att: 2.0, rel: 0.06, trem: 0.4, tremR: 14 });
      S.mul(s, (t) => Math.pow(Math.min(1, t / 2.35), 1.5));
      mx.add(s, 0, { gain: 0.25, pan: (k - 1.5) * 0.4, send: 0.3 });
    });
    mx.add(I.timp(S, N('D2'), 0.8, 1.2), 2.35, { gain: 0.5 });
    return mx.finish({ room: 0.75, wet: 0.3 });
  } },

  finale_start: { loop: false, duck: 0.3, dur: 8.5, gen(S) {
    const mx = new Mix(S, 11);
    for (let t = 0; t < 6; t += 0.07) mx.add(I.timp(S, N('D2'), 0.15 + 0.85 * Math.pow(t / 6, 2), 0.8), t, { gain: 0.45, pan: -0.2, send: 0.2 });
    const prog = [[0, ['D3', 'F3', 'A3']], [2, ['Bb2', 'D3', 'F3', 'Bb3']], [4, ['C3', 'E3', 'G3', 'C4']]];
    for (const [t, c] of prog) brassChord(S, mx, t, chord(c), 1.9, { gain: 0.45 + t * 0.06, att: 0.4, rel: 0.2, bright: 0.6 + t * 0.08 });
    for (const [n, p] of [['D4', -0.4], ['A4', 0.4], ['D5', 0]]) mx.add(I.strings(S, (t) => N(n) * Math.pow(2, Math.min(1, t / 6) * 7 / 12), 6, { att: 2, rel: 0.1, trem: 0.4 }), 0, { gain: 0.25, pan: p, send: 0.4 });
    const H = 6;
    mx.add(I.boom(S, 1), H, { gain: 0.8 });
    mx.add(I.timp(S, N('D2'), 1, 3), H, { gain: 0.9 });
    mx.add(I.crash(S, 3, 1), H, { gain: 0.45, pan: 0.3 });
    brassChord(S, mx, H, chord(['D2', 'D3', 'F#3', 'A3', 'D4']), 1.8, { gain: 1, sub: 0.5, rel: 0.8 });
    stringChord(S, mx, H, chord(['A4', 'D5', 'F#5']), 1.8, { att: 0.02, rel: 1, gain: 0.4 });
    return mx.finish({ room: 0.85, wet: 0.3 });
  } },

  finale_loop: { loop: true, dur: 13.7, gen(S) {
    const b = 60 / 140, L = 32 * b, s16 = b / 4;
    const mx = new Mix(S, L + 4, L, 2);
    const chords = [['D3', 'F3', 'A3'], ['Bb2', 'D3', 'F3'], ['G2', 'Bb2', 'D3'], ['A2', 'C#3', 'E3']];
    const ost = [['D4', 'F4', 'A4', 'F4'], ['D4', 'F4', 'Bb4', 'F4'], ['D4', 'G4', 'Bb4', 'G4'], ['C#4', 'E4', 'A4', 'E4']];
    const bass = ['D2', 'Bb1', 'G1', 'A1'];
    const tomP = 'X.x.X..xX.x.Xxxx';
    for (let bar = 0; bar < 8; bar++) {
      const t0 = bar * 4 * b, c = bar % 4;
      for (let i = 0; i < 16; i++) {
        const t = t0 + i * s16;
        mx.add(I.strings(S, N(ost[c][i % 4]), s16 * 0.9, { att: 0.006, rel: 0.05, bright: 1.4 }), t, { gain: 0.2, pan: 0.35, send: 0.2 });
        if (i % 2 === 0) mx.add(I.strings(S, N(bass[c]), s16 * 1.6, { att: 0.01, rel: 0.06, bright: 1.6 }), t, { gain: 0.3, pan: -0.2, send: 0.1 });
        if (tomP[i] !== '.') mx.add(I.tom(S, tomP[i] === 'X' ? N('C2') : N('G2'), tomP[i] === 'X' ? 1 : 0.6), t, { gain: 0.45, pan: tomP[i] === 'X' ? -0.3 : 0.3, send: 0.15 });
        if (i === 0 || i === 10) mx.add(I.kick(S, 1), t, { gain: 0.55 });
        if (i === 4 || i === 12) mx.add(I.snare(S, 1), t, { gain: 0.4, pan: 0.1, send: 0.25 });
        mx.add(I.hat(S, i % 4 === 0 ? 0.7 : 0.35), t, { gain: 0.08, pan: 0.5 });
      }
      brassChord(S, mx, t0, chord(chords[c]), bar % 4 === 3 ? 1.5 : 0.3, { gain: 0.5, sub: 0.3 });
      if (bar % 2 === 1) brassChord(S, mx, t0 + 2.5 * b, chord(chords[c]), 0.2, { gain: 0.35 });
    }
    for (let t = 7 * 4 * b + 2 * b; t < L - 0.05; t += 0.06) mx.add(I.timp(S, N('A1'), 0.3 + 0.6 * (t - 30 * b) / (2 * b), 0.8), t, { gain: 0.4 });
    mx.add(I.crash(S, 3, 0.8), 0, { gain: 0.25, pan: -0.4 });
    return mx.finish({ room: 0.75, wet: 0.22 });
  } },

  escape: { loop: true, dur: 14.1, gen(S) {
    const b = 60 / 136, L = 32 * b, e = b / 2;
    const mx = new Mix(S, L + 4, L, 2);
    const chords = [['D3', 'F#3', 'A3'], ['Bb2', 'D3', 'F3'], ['C3', 'E3', 'G3'], ['D3', 'F#3', 'A3']];
    const bass = ['D2', 'Bb1', 'C2', 'D2'];
    const mel = [ // original fanfare: [beat, note, beats]
      [0, 'A4', 1], [1, 'D5', 1], [2, 'E5', 1], [3, 'F#5', 1],
      [4, 'F5', 1.5], [5.5, 'D5', 0.5], [6, 'C5', 2],
      [8, 'E5', 1], [9, 'C5', 1], [10, 'G4', 1], [11, 'C5', 1],
      [12, 'F#5', 3], [15, 'A4', 1],
      [16, 'D5', 1], [17, 'F#5', 1], [18, 'A5', 2],
      [20, 'F5', 1], [21, 'D5', 1], [22, 'Bb4', 2],
      [24, 'C5', 1], [25, 'E5', 1], [26, 'G5', 1.5], [27.5, 'E5', 0.5],
      [28, 'F#5', 4],
    ];
    for (const [bt, n, len] of mel) mx.add(I.brass(S, N(n), len * b * 0.9, { bright: 0.9, vel: 1 }), bt * b, { gain: 0.42, pan: 0.15, send: 0.35 });
    for (let bar = 0; bar < 8; bar++) {
      const t0 = bar * 4 * b, c = Math.floor(bar / 2) % 4;
      if (bar % 2 === 0) { brassChord(S, mx, t0, chord(chords[c]), 8 * b - 0.2, { gain: 0.3, att: 0.1, bright: 0.4 }); stringChord(S, mx, t0, chord(chords[c]).map((f) => f * 2), 8 * b - 0.2, { att: 0.2, rel: 0.4, gain: 0.2 }); }
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * e;
        mx.add(I.strings(S, N(bass[c]), e * 0.8, { att: 0.01, rel: 0.05, bright: 1.6 }), t, { gain: 0.3, pan: -0.2, send: 0.1 });
        if (i % 4 === 0) mx.add(I.kick(S, 1), t, { gain: 0.5 });
        if (i % 4 === 2) mx.add(I.snare(S, 1), t, { gain: 0.38, send: 0.25 });
        if (i === 3 || i === 7) mx.add(I.tom(S, N('G2'), 0.6), t + e / 2, { gain: 0.3, pan: 0.3 });
        mx.add(I.hat(S, 0.5), t, { gain: 0.08, pan: 0.5 });
      }
    }
    mx.add(I.crash(S, 3, 0.8), 0, { gain: 0.25 });
    mx.add(I.crash(S, 3, 0.8), 16 * b, { gain: 0.25 });
    return mx.finish({ room: 0.8, wet: 0.25 });
  } },

  chapter_end: { loop: false, duck: 0, dur: 4.5, gen(S) {
    const mx = new Mix(S, 6.5);
    brassChord(S, mx, 0, chord(['G2', 'D3', 'G3', 'B3']), 1.1, { gain: 0.4, bright: 0.35, att: 0.2, rel: 0.5 });
    padChord(S, mx, 1.2, chord(['D3', 'F#3', 'A3', 'D4']), 2.5, { att: 0.3, rel: 1.6, gain: 0.5, cut: 1500 });
    ['D4', 'F#4', 'A4', 'D5'].forEach((n, k) => mx.add(I.pluck(S, N(n), 3, { bright: 0.45 }), 1.2 + k * 0.18, { gain: 0.3, pan: -0.3 + k * 0.2, send: 0.4 }));
    mx.add(I.timp(S, N('D2'), 0.5, 2.5), 1.2, { gain: 0.35 });
    return mx.finish({ room: 0.8, wet: 0.35 });
  } },

  menu: { loop: true, dur: 24, gen(S) {
    const b = 0.75, L = 32 * b;
    const mx = new Mix(S, L + 5, L, 2);
    const prog = [['D3', 'F3', 'A3'], ['D3', 'F3', 'A3'], ['Bb2', 'D3', 'F3'], ['C3', 'E3', 'G3'], ['D3', 'F3', 'A3'], ['D3', 'F3', 'A3'], ['G2', 'Bb2', 'D3'], ['A2', 'C#3', 'E3']];
    const bassN = ['D2', 'D2', 'Bb1', 'C2', 'D2', 'D2', 'G1', 'A1'];
    // banjo-ish rolling arpeggio (forward roll pattern over chord tones)
    const roll = [0, 2, 4, 1, 3, 5, 2, 4];
    prog.forEach((c, bar) => {
      const t0 = bar * 4 * b;
      padChord(S, mx, t0, chord(c), 4 * b - 0.3, { att: 0.8, rel: 1.4, cut: 700, gain: 0.32 });
      const tones = [...c.map(N), ...c.map((n) => N(n) * 2)];
      roll.forEach((ix, k) => {
        if (bar % 4 === 3 && k > 5) return; // breathe
        mx.add(I.banjo(S, tones[ix] * 2, k === 0 ? 0.9 : 0.6), t0 + k * b / 2, { gain: 0.16, pan: 0.35, send: 0.3 });
      });
      mx.add(I.pluck(S, N(bassN[bar]), 3, { bright: 0.25, decay: 0.998 }), t0, { gain: 0.4, pan: -0.25, send: 0.25 });
      mx.add(I.pluck(S, N(bassN[bar]) * 1.5, 2, { bright: 0.25 }), t0 + 2 * b, { gain: 0.22, pan: -0.25, send: 0.25 });
    });
    const mel = [ // [beat, fromNote, toNote, beats]  (original melody)
      [2, 'G4', 'A4', 2],
      [4, 'F4', 'F4', 1], [5, 'E4', 'E4', 1], [6, 'C4', 'D4', 2],
      [8, 'D4', 'D4', 1], [9, 'F4', 'F4', 1], [10, 'F4', 'G4', 2],
      [12, 'E4', 'E4', 3], [15, 'C4', 'C4', 1],
      [16, 'D4', 'D4', 2], [18, 'G4', 'A4', 2],
      [20, 'C5', 'C5', 1], [21, 'A4', 'A4', 1], [22, 'G4', 'G4', 1], [23, 'F4', 'F4', 1],
      [24, 'G4', 'G4', 2], [26, 'Bb4', 'Bb4', 1], [27, 'A4', 'A4', 1],
      [28, 'G#4', 'A4', 3.5],
    ];
    for (const [bt, a, c, len] of mel) mx.add(I.slide(S, N(a), N(c), len * b * 0.95, { glide: a === c ? 0.001 : 0.22 }), bt * b, { gain: 0.36, pan: -0.05, send: 0.45 });
    const dr = I.drone(S, Math.round(N('D1') * L) / L, L + 2, { cut: 220 });
    mx.bed(dr, { gain: 0.2, send: 0.1 });
    const hiss = S.noise(L + 2); S.bp(hiss, 3000, 0.5); mx.bed(S.norm(hiss, 1), { gain: 0.012, send: 0 });
    return mx.finish({ room: 0.82, damp: 0.5, wet: 0.32 });
  } },
};

export const MUSIC_DEFS = CUES;
export const MUSIC_CUES = Object.keys(CUES);

/** Render a cue -> { channels:[L,R], sampleRate, loop } */
export function renderMusic(cue) {
  const def = CUES[cue];
  if (!def) throw new Error('unknown cue ' + cue);
  const S = new Synth(SR, hashStr('music:' + cue));
  const chs = def.gen(S);
  for (const c of chs) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) c[i] = 0;
  if (def.loop) {
    // circular high-pass: run over two periods so the filter state wraps, keep the second
    for (let k = 0; k < chs.length; k++) {
      const c = chs[k], n = c.length, t = new Float32Array(n * 2);
      t.set(c); t.set(c, n);
      S.hp(t, 25);
      chs[k] = t.slice(n);
    }
  } else for (const c of chs) S.hp(c, 25);
  let pk = 0, rs = 0;
  for (const c of chs) { pk = Math.max(pk, peakOf(c)); rs += rmsOf(c) ** 2; }
  rs = Math.sqrt(rs / chs.length);
  if (def.loop) {
    // ~-14 dBFS RMS, allow a little soft limiting on peaks
    const g = Math.min(0.2 / Math.max(rs, 1e-9), 1.25 / Math.max(pk, 1e-9));
    for (const c of chs) S.mul(c, g);
    softLimit(chs, 0.97);
  } else {
    const g = 1.1 / Math.max(pk, 1e-9);
    for (const c of chs) S.mul(c, g);
    softLimit(chs, 0.95);
    // trim silent tail then fade
    const thr = 0.0006;
    let end = chs[0].length;
    while (end > 1 && Math.abs(chs[0][end - 1]) < thr && Math.abs(chs[1][end - 1]) < thr) end--;
    end = Math.min(chs[0].length, end + S.len(0.05));
    for (let k = 0; k < chs.length; k++) { chs[k] = chs[k].slice(0, end); S.fade(chs[k], 0.002, 0.08); }
  }
  return { channels: chs, sampleRate: SR, loop: !!def.loop };
}

export { VOWELS };
