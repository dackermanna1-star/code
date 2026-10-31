/**
 * Continuous (looping) sounds. Each recipe builds a small always-running graph from looping
 * noise buffers and oscillators and returns a controller that maps a 0..1 intensity onto
 * filter cutoffs, gains and modulation rates with smooth setTargetAtTime automation.
 */
import type { AspectId } from '../core/ids';
import type { LoopId } from './types';
import { clampFreq, distortionCurve, type NoiseBank, type NoiseColor } from './synth';

export interface LoopCtx {
  ctx: BaseAudioContext;
  /** Destination for the loop's signal (engine-owned fader). */
  out: AudioNode;
  nb: NoiseBank;
  aspect?: AspectId;
  now: number;
  /** Every source created is registered here so the handle can stop them. */
  sources: AudioScheduledSourceNode[];
}

export interface LoopController {
  /** Map intensity v (0..1) onto parameters, starting at `at` with time constant `tc`. */
  set(v: number, at: number, tc: number): void;
  /** Fader level once faded in. */
  level: number;
  /** Reverb send level. */
  reverb: number;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function lnoise(L: LoopCtx, color: NoiseColor, rate = 1): AudioBufferSourceNode {
  const s = L.ctx.createBufferSource();
  const buf = L.nb[color];
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(L.now, buf.duration > 0.4 ? Math.random() * (buf.duration - 0.3) : 0);
  L.sources.push(s);
  return s;
}

function losc(L: LoopCtx, type: OscillatorType, f: number, detune = 0): OscillatorNode {
  const o = L.ctx.createOscillator();
  o.type = type;
  o.frequency.value = clampFreq(L.ctx, f);
  o.detune.value = detune;
  o.start(L.now);
  L.sources.push(o);
  return o;
}

function lfilter(L: LoopCtx, type: BiquadFilterType, f: number, q = 0.707): BiquadFilterNode {
  const b = L.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = clampFreq(L.ctx, f);
  b.Q.value = q;
  return b;
}

function lgain(L: LoopCtx, v: number): GainNode {
  const g = L.ctx.createGain();
  g.gain.value = v;
  return g;
}

/** Tremolo stage: returns a gain node whose gain swings around (1 - depth/2) ± depth/2. */
function tremolo(L: LoopCtx, rate: number, depth: number, type: OscillatorType = 'sine'): { node: GainNode; osc: OscillatorNode; depth: GainNode } {
  const g = lgain(L, 1 - depth / 2);
  const o = losc(L, type, rate);
  const dg = lgain(L, depth / 2);
  o.connect(dg);
  dg.connect(g.gain);
  return { node: g, osc: o, depth: dg };
}

/** LFO into an arbitrary param. */
function lmod(L: LoopCtx, param: AudioParam, rate: number, depth: number, type: OscillatorType = 'sine'): { osc: OscillatorNode; depth: GainNode } {
  const o = losc(L, type, rate);
  const dg = lgain(L, depth);
  o.connect(dg);
  dg.connect(param);
  return { osc: o, depth: dg };
}

const T = (p: AudioParam, v: number, at: number, tc: number) => p.setTargetAtTime(v, at, Math.max(0.005, tc));

/* ------------------------------------------------------------------ */
/* Elemental loop layer (charge / beam / aura)                         */
/* ------------------------------------------------------------------ */

function aspectLayer(L: LoopCtx, dest: AudioNode, scale = 1): (v: number, at: number, tc: number) => void {
  const a = L.aspect;
  if (!a) return () => {};
  const g = lgain(L, 0);
  g.connect(dest);
  const lvl = (lo: number, hi: number) => (v: number) => (lo + (hi - lo) * v) * scale;
  switch (a) {
    case 'inferno': {
      const c = lnoise(L, 'crackle', 1);
      const bp = lfilter(L, 'bandpass', 2100, 0.8);
      c.connect(bp);
      bp.connect(g);
      const r = lnoise(L, 'brown');
      const lp = lfilter(L, 'lowpass', 450);
      const rg = lgain(L, 0.7);
      r.connect(lp);
      lp.connect(rg);
      rg.connect(g);
      const L1 = lvl(0.18, 0.5);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(c.playbackRate, 0.8 + 0.8 * v, at, tc);
        T(lp.frequency, 380 + 500 * v, at, tc);
      };
    }
    case 'radiance': {
      const sum = lgain(L, 1);
      const tr = tremolo(L, 0.7, 0.6);
      sum.connect(tr.node);
      tr.node.connect(g);
      for (const [f, gg] of [[1046.5, 0.05], [1568, 0.04], [2093, 0.03], [3136, 0.015]] as const) {
        const o = losc(L, 'sine', f, Math.random() * 6 - 3);
        const og = lgain(L, gg);
        o.connect(og);
        og.connect(sum);
      }
      const n = lnoise(L, 'white');
      const hp = lfilter(L, 'highpass', 7000);
      const ng = lgain(L, 0.06);
      const tn = tremolo(L, 19, 0.7);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(tn.node);
      tn.node.connect(g);
      const L1 = lvl(0.5, 1.4);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(tr.osc.frequency, 0.6 + 2.5 * v, at, tc);
      };
    }
    case 'verdant': {
      const n = lnoise(L, 'pink');
      const bp = lfilter(L, 'bandpass', 1400, 1.2);
      const tr = tremolo(L, 15, 0.85);
      n.connect(bp);
      bp.connect(tr.node);
      tr.node.connect(g);
      const o = losc(L, 'triangle', 98);
      const og = lgain(L, 0.08);
      const lp = lfilter(L, 'lowpass', 400);
      o.connect(lp);
      lp.connect(og);
      og.connect(g);
      const L1 = lvl(0.18, 0.5);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(bp.frequency, 1200 + 1400 * v, at, tc);
        T(tr.osc.frequency, 11 + 10 * v, at, tc);
      };
    }
    case 'frost': {
      const sum = lgain(L, 1);
      const tr = tremolo(L, 3.5, 0.5);
      sum.connect(tr.node);
      tr.node.connect(g);
      for (const [f, gg] of [[2900, 0.04], [4130, 0.03], [5310, 0.025]] as const) {
        const o = losc(L, 'sine', f);
        const og = lgain(L, gg);
        o.connect(og);
        og.connect(sum);
      }
      const n = lnoise(L, 'white');
      const hp = lfilter(L, 'highpass', 6500);
      const ng = lgain(L, 0.12);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(g);
      const L1 = lvl(0.5, 1.3);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(tr.osc.frequency, 2.5 + 6 * v, at, tc);
      };
    }
    case 'tempest': {
      const c = lnoise(L, 'crackle', 1.6);
      const hp = lfilter(L, 'highpass', 2500);
      c.connect(hp);
      hp.connect(g);
      const o = losc(L, 'square', 60);
      const lp = lfilter(L, 'lowpass', 900);
      const og = lgain(L, 0.07);
      o.connect(lp);
      lp.connect(og);
      og.connect(g);
      const L1 = lvl(0.2, 0.6);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(c.playbackRate, 1.2 + 1.2 * v, at, tc);
        T(lp.frequency, 600 + 1400 * v, at, tc);
      };
    }
    case 'void': {
      const o = losc(L, 'sine', 45);
      const fm = lmod(L, o.frequency, 5, 8);
      const og = lgain(L, 0.5);
      o.connect(og);
      og.connect(g);
      const n = lnoise(L, 'pink');
      const lp = lfilter(L, 'lowpass', 600);
      const tr = tremolo(L, 0.4, 0.9);
      const ng = lgain(L, 0.25);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(tr.node);
      tr.node.connect(g);
      const L1 = lvl(0.3, 0.75);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(fm.osc.frequency, 3 + 6 * v, at, tc);
        T(o.frequency, 42 + 14 * v, at, tc);
      };
    }
    case 'chrono': {
      const t = lnoise(L, 'ticks', 1);
      const bp = lfilter(L, 'bandpass', 2800, 1.5);
      const tg = lgain(L, 0.5);
      t.connect(bp);
      bp.connect(tg);
      tg.connect(g);
      for (const f of [660, 663.3]) {
        const o = losc(L, 'sine', f);
        const og = lgain(L, 0.035);
        o.connect(og);
        og.connect(g);
      }
      const L1 = lvl(0.3, 0.8);
      return (v, at, tc) => {
        T(g.gain, L1(v), at, tc);
        T(t.playbackRate, 1 + 1.5 * v, at, tc);
      };
    }
  }
  return () => {};
}

/* ------------------------------------------------------------------ */
/* Loop recipes                                                        */
/* ------------------------------------------------------------------ */

export const LOOPS: Record<LoopId, (L: LoopCtx) => LoopController> = {
  charge: (L) => {
    // Energy bed: roaring bandpassed noise.
    const n = lnoise(L, 'pink');
    const bp = lfilter(L, 'bandpass', 500, 1.1);
    const ng = lgain(L, 0.2);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(L.out);
    // Rising hum: detuned saws through a resonant lowpass, with accelerating tremolo.
    const lp = lfilter(L, 'lowpass', 500, 4);
    const hum = lgain(L, 0.1);
    const tr = tremolo(L, 5, 0.5);
    lp.connect(hum);
    hum.connect(tr.node);
    tr.node.connect(L.out);
    const s1 = losc(L, 'sawtooth', 110, -12);
    const s2 = losc(L, 'sawtooth', 110, 12);
    s1.connect(lp);
    s2.connect(lp);
    const sub = losc(L, 'sine', 55);
    const subG = lgain(L, 0.22);
    sub.connect(subG);
    subG.connect(L.out);
    const asp = aspectLayer(L, L.out, 0.8);
    return {
      level: 0.65,
      reverb: 0.15,
      set(v, at, tc) {
        T(bp.frequency, 450 + 1900 * v, at, tc);
        T(ng.gain, 0.12 + 0.3 * v, at, tc);
        const f = 110 * (1 + 0.6 * v);
        T(s1.frequency, f, at, tc);
        T(s2.frequency, f, at, tc);
        T(sub.frequency, f / 2, at, tc);
        T(lp.frequency, 300 + 2600 * v, at, tc);
        T(hum.gain, 0.07 + 0.14 * v, at, tc);
        T(tr.osc.frequency, 5 + 12 * v, at, tc);
        asp(v, at, tc);
      },
    };
  },

  beam: (L) => {
    const roar = lnoise(L, 'pink');
    const rbp = lfilter(L, 'bandpass', 700, 0.7);
    const rg = lgain(L, 0.35);
    roar.connect(rbp);
    rbp.connect(rg);
    // Fast flutter on the whole beam body.
    const fl = tremolo(L, 11, 0.3);
    rg.connect(fl.node);
    fl.node.connect(L.out);
    const lp = lfilter(L, 'lowpass', 900, 2);
    const sg = lgain(L, 0.1);
    lp.connect(sg);
    sg.connect(fl.node);
    for (const [f, d] of [[55, -9], [55, 9], [82.4, 0], [110, 5]] as const) losc(L, 'sawtooth', f, d).connect(lp);
    const sz = lnoise(L, 'white');
    const hp = lfilter(L, 'highpass', 5000);
    const szg = lgain(L, 0.06);
    const st = tremolo(L, 14, 0.7);
    sz.connect(hp);
    hp.connect(szg);
    szg.connect(st.node);
    st.node.connect(L.out);
    const sub = losc(L, 'sine', 41);
    const subg = lgain(L, 0.3);
    sub.connect(subg);
    subg.connect(L.out);
    const asp = aspectLayer(L, L.out, 0.9);
    return {
      level: 0.68,
      reverb: 0.25,
      set(v, at, tc) {
        T(rbp.frequency, 500 + 900 * v, at, tc);
        T(rg.gain, 0.22 + 0.25 * v, at, tc);
        T(lp.frequency, 600 + 2400 * v, at, tc);
        T(szg.gain, 0.03 + 0.09 * v, at, tc);
        T(fl.osc.frequency, 8 + 10 * v, at, tc);
        T(subg.gain, 0.2 + 0.2 * v, at, tc);
        asp(v, at, tc);
      },
    };
  },

  beam_struggle: (L) => {
    // Two dissonant saw stacks beating against each other, driven into a waveshaper.
    const pre = lgain(L, 0.6);
    const lp = lfilter(L, 'lowpass', 900, 1.5);
    const ws = L.ctx.createWaveShaper();
    ws.curve = distortionCurve(4);
    ws.oversample = '2x';
    const post = lgain(L, 0.18);
    pre.connect(lp);
    lp.connect(ws);
    ws.connect(post);
    const wob = tremolo(L, 6, 0.45);
    post.connect(wob.node);
    wob.node.connect(L.out);
    for (const [f, d] of [[55, -6], [82.4, 6], [58.3, 4], [87.3, -4]] as const) {
      const o = losc(L, 'sawtooth', f, d);
      const og = lgain(L, 0.25);
      o.connect(og);
      og.connect(pre);
    }
    const c = lnoise(L, 'crackle', 1.5);
    const hp = lfilter(L, 'highpass', 3000);
    const cg = lgain(L, 0.3);
    c.connect(hp);
    hp.connect(cg);
    cg.connect(L.out);
    const r = lnoise(L, 'pink');
    const rbp = lfilter(L, 'bandpass', 700, 0.6);
    const rg = lgain(L, 0.3);
    r.connect(rbp);
    rbp.connect(rg);
    rg.connect(wob.node);
    const sub = losc(L, 'sine', 36);
    const subg = lgain(L, 0.3);
    sub.connect(subg);
    subg.connect(L.out);
    return {
      level: 0.72,
      reverb: 0.25,
      set(v, at, tc) {
        T(pre.gain, 0.4 + 1.6 * v, at, tc);
        T(lp.frequency, 700 + 2800 * v, at, tc);
        T(cg.gain, 0.15 + 0.4 * v, at, tc);
        T(c.playbackRate, 1.1 + 1.0 * v, at, tc);
        T(wob.osc.frequency, 6 + 10 * v, at, tc);
        T(rg.gain, 0.2 + 0.25 * v, at, tc);
      },
    };
  },

  blade_lock: (L) => {
    const c = lnoise(L, 'crackle', 1);
    const bp = lfilter(L, 'bandpass', 2400, 6);
    const cg = lgain(L, 0.4);
    c.connect(bp);
    bp.connect(cg);
    cg.connect(L.out);
    const n = lnoise(L, 'white');
    const nbp = lfilter(L, 'bandpass', 3800, 8);
    const ng = lgain(L, 0.25);
    const tr = tremolo(L, 9, 0.8);
    n.connect(nbp);
    nbp.connect(ng);
    ng.connect(tr.node);
    tr.node.connect(L.out);
    const ring = lgain(L, 0.06);
    ring.connect(L.out);
    const rates = [0.7, 1.1, 1.6];
    [1230, 1870, 2650].forEach((f, k) => {
      const o = losc(L, 'sine', f);
      const t = tremolo(L, rates[k], 0.9);
      o.connect(t.node);
      t.node.connect(ring);
    });
    const strain = losc(L, 'sawtooth', 70);
    const slp = lfilter(L, 'lowpass', 300, 3);
    const sg = lgain(L, 0.12);
    strain.connect(slp);
    slp.connect(sg);
    sg.connect(L.out);
    return {
      level: 0.75,
      reverb: 0.2,
      set(v, at, tc) {
        T(cg.gain, 0.2 + 0.4 * v, at, tc);
        T(c.playbackRate, 0.9 + 0.8 * v, at, tc);
        T(ring.gain, 0.04 + 0.06 * v, at, tc);
        T(strain.frequency, 70 + 25 * v, at, tc);
        T(bp.frequency, 2200 + 900 * v, at, tc);
      },
    };
  },

  aura: (L) => {
    const sum = lgain(L, 1);
    const tr = tremolo(L, 0.6, 0.3);
    sum.connect(tr.node);
    tr.node.connect(L.out);
    const sub = losc(L, 'sine', 55);
    const subg = lgain(L, 0.35);
    sub.connect(subg);
    subg.connect(sum);
    const lp = lfilter(L, 'lowpass', 380, 2);
    const sg = lgain(L, 0.1);
    lp.connect(sg);
    sg.connect(sum);
    losc(L, 'sawtooth', 110, -10).connect(lp);
    losc(L, 'sawtooth', 110, 10).connect(lp);
    const n = lnoise(L, 'pink');
    const bp = lfilter(L, 'bandpass', 300, 0.7);
    const ng = lgain(L, 0.15);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(sum);
    const asp = aspectLayer(L, L.out, 0.55);
    return {
      level: 0.5,
      reverb: 0.2,
      set(v, at, tc) {
        T(lp.frequency, 300 + 900 * v, at, tc);
        T(ng.gain, 0.1 + 0.2 * v, at, tc);
        T(bp.frequency, 260 + 500 * v, at, tc);
        T(tr.osc.frequency, 0.5 + 1.5 * v, at, tc);
        asp(v, at, tc);
      },
    };
  },

  timestop: (L) => {
    const drone = lgain(L, 0.3);
    drone.connect(L.out);
    losc(L, 'sine', 41.2).connect(drone);
    const fifth = losc(L, 'sine', 61.7);
    const fg = lgain(L, 0.6);
    fifth.connect(fg);
    fg.connect(drone);
    const hi = losc(L, 'sine', 1760);
    const htr = tremolo(L, 0.3, 0.9);
    const hg = lgain(L, 0.03);
    hi.connect(hg);
    hg.connect(htr.node);
    htr.node.connect(L.out);
    const tk = lnoise(L, 'ticks', 1);
    const tbp = lfilter(L, 'bandpass', 2600, 2);
    const tg = lgain(L, 0.35);
    tk.connect(tbp);
    tbp.connect(tg);
    tg.connect(L.out);
    const n = lnoise(L, 'pink');
    const lp = lfilter(L, 'lowpass', 1000);
    const sw = tremolo(L, 0.25, 1);
    const ng = lgain(L, 0.15);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(sw.node);
    sw.node.connect(L.out);
    return {
      level: 0.62,
      reverb: 0.5,
      set(v, at, tc) {
        T(drone.gain, 0.22 + 0.15 * v, at, tc);
        T(tg.gain, 0.25 + 0.2 * v, at, tc);
        T(ng.gain, 0.1 + 0.1 * v, at, tc);
      },
    };
  },

  wind: (L) => {
    const n = lnoise(L, 'pink');
    const bp = lfilter(L, 'bandpass', 600, 0.8);
    const fmod = lmod(L, bp.frequency, 0.09, 350);
    const gust = tremolo(L, 0.13, 0.5);
    const g = lgain(L, 0.3);
    n.connect(bp);
    bp.connect(g);
    g.connect(gust.node);
    gust.node.connect(L.out);
    const b = lnoise(L, 'brown');
    const lp = lfilter(L, 'lowpass', 380);
    const bg = lgain(L, 0.3);
    b.connect(lp);
    lp.connect(bg);
    bg.connect(L.out);
    const w = lnoise(L, 'white');
    const wbp = lfilter(L, 'bandpass', 2500, 6);
    const wtr = tremolo(L, 0.07, 1);
    const wg = lgain(L, 0.04);
    w.connect(wbp);
    wbp.connect(wg);
    wg.connect(wtr.node);
    wtr.node.connect(L.out);
    return {
      level: 0.55,
      reverb: 0.1,
      set(v, at, tc) {
        T(g.gain, 0.18 + 0.35 * v, at, tc);
        T(gust.depth.gain, 0.15 + 0.35 * v, at, tc);
        T(gust.node.gain, 0.85 - 0.35 * v, at, tc);
        T(fmod.depth.gain, 200 + 400 * v, at, tc);
        T(wg.gain, 0.02 + 0.05 * v, at, tc);
      },
    };
  },

  rain: (L) => {
    const w = lnoise(L, 'white');
    const hp = lfilter(L, 'highpass', 4500);
    const wg = lgain(L, 0.1);
    w.connect(hp);
    hp.connect(wg);
    wg.connect(L.out);
    const p = lnoise(L, 'pink');
    const bp = lfilter(L, 'bandpass', 1800, 0.5);
    const pg = lgain(L, 0.14);
    p.connect(bp);
    bp.connect(pg);
    pg.connect(L.out);
    const d = lnoise(L, 'drips', 1);
    const dbp = lfilter(L, 'bandpass', 3200, 0.8);
    const dg = lgain(L, 0.3);
    d.connect(dbp);
    dbp.connect(dg);
    dg.connect(L.out);
    const b = lnoise(L, 'brown');
    const lp = lfilter(L, 'lowpass', 250);
    const bg = lgain(L, 0.1);
    b.connect(lp);
    lp.connect(bg);
    bg.connect(L.out);
    return {
      level: 0.55,
      reverb: 0.08,
      set(v, at, tc) {
        const k = 0.45 + 0.75 * v;
        T(wg.gain, 0.1 * k, at, tc);
        T(pg.gain, 0.14 * k, at, tc);
        T(dg.gain, 0.3 * k, at, tc);
        T(d.playbackRate, 0.85 + 0.4 * v, at, tc);
      },
    };
  },

  lava: (L) => {
    const b = lnoise(L, 'brown');
    const lp = lfilter(L, 'lowpass', 180);
    const tr = tremolo(L, 0.2, 0.5);
    const bg = lgain(L, 0.5);
    b.connect(lp);
    lp.connect(bg);
    bg.connect(tr.node);
    tr.node.connect(L.out);
    const c = lnoise(L, 'crackle', 0.45);
    const clp = lfilter(L, 'lowpass', 700);
    const cg = lgain(L, 0.35);
    c.connect(clp);
    clp.connect(cg);
    cg.connect(L.out);
    const p = lnoise(L, 'pink');
    const pbp = lfilter(L, 'bandpass', 300, 0.8);
    const pg = lgain(L, 0.08);
    p.connect(pbp);
    pbp.connect(pg);
    pg.connect(L.out);
    return {
      level: 0.6,
      reverb: 0.1,
      set(v, at, tc) {
        const k = 0.5 + 0.7 * v;
        T(bg.gain, 0.5 * k, at, tc);
        T(cg.gain, 0.35 * k, at, tc);
        T(c.playbackRate, 0.4 + 0.3 * v, at, tc);
      },
    };
  },

  void_hum: (L) => {
    const d = lgain(L, 0.3);
    d.connect(L.out);
    losc(L, 'sine', 36).connect(d);
    const s2 = losc(L, 'sine', 54.3);
    const s2g = lgain(L, 0.7);
    s2.connect(s2g);
    s2g.connect(d);
    const s3 = losc(L, 'sine', 72.6);
    lmod(L, s3.frequency, 0.1, 3);
    const s3g = lgain(L, 0.3);
    s3.connect(s3g);
    s3g.connect(d);
    const hi = losc(L, 'sine', 2200);
    const htr = tremolo(L, 3, 1);
    const hg = lgain(L, 0.012);
    hi.connect(hg);
    hg.connect(htr.node);
    htr.node.connect(L.out);
    const n = lnoise(L, 'pink');
    const lp = lfilter(L, 'lowpass', 500);
    const sw = tremolo(L, 0.15, 1);
    const ng = lgain(L, 0.15);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(sw.node);
    sw.node.connect(L.out);
    return {
      level: 0.24,
      reverb: 0.35,
      set(v, at, tc) {
        const k = 0.5 + 0.7 * v;
        T(d.gain, 0.3 * k, at, tc);
        T(ng.gain, 0.15 * k, at, tc);
      },
    };
  },
};
