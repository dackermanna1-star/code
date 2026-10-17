// Mixer: bus graph, master dynamics and the shared convolution reverbs.
//
//   music ─► musicScene ─┐                         (scene gains = silence × duck)
//   ambience ─► ambScene ─┤
//   sfx ───────────────────┼─► master ─► trim ─► compressor ─► soft clip ─► [analyser] ─► out
//   ui ────────────────────┘
//   sends.sfx ─┐
//   sends.amb ─► ambSendScene ─► verbIn ─► convA / convB (crossfaded spaces) ─► master
//   musicVerbIn ─► convMusic ─► music  (music volume and silence apply to its reverb too)
//
// Every voice owns its own pan/filter chain and connects into a bus + a send; the mixer only
// owns long-lived nodes, so it is safe to build on any BaseAudioContext (live or offline).
import { makeIR, Rand, mulberry32, dbToGain } from './dsp.js';

/** Makeup gain Chrome's DynamicsCompressor adds for the settings below (measured; it follows
 *  the spec's (1/fullRangeGain)^0.6 rule). We pre-attenuate by it so quiet passages are
 *  untouched and only peaks get compressed. */
const COMP_MAKEUP_DB = 2.43;
const COMP = { threshold: -10, knee: 10, ratio: 4, attack: 0.003, release: 0.25 };

/** Reverb spaces (TECH §10 addition: HW.audio.setSpace(kind)). `send` is the wet level. */
export const SPACES = {
  room: { t60: 0.6, pre: 0.004, damp: [7000, 2400], send: 0.17,
    early: [[0.005, 0.5], [0.009, 0.4], [0.014, 0.35], [0.019, 0.25], [0.026, 0.18]] },
  corridor: { t60: 1.8, pre: 0.007, damp: [7500, 1800], send: 0.26,
    flutter: { period: 0.0118, decay: 0.82, count: 18 }, early: [[0.004, 0.4], [0.011, 0.3], [0.031, 0.25], [0.052, 0.2]] },
  hall: { t60: 2.9, pre: 0.024, damp: [6000, 1300], send: 0.33,
    early: [[0.021, 0.4], [0.033, 0.32], [0.046, 0.3], [0.064, 0.22], [0.082, 0.2], [0.105, 0.14]] },
  basement: { t60: 1.4, pre: 0.006, damp: [3600, 700], send: 0.3, lowcut: 35,
    early: [[0.006, 0.45], [0.012, 0.4], [0.02, 0.3], [0.031, 0.22]] },
  cavern: { t60: 4.8, pre: 0.04, damp: [2600, 420], send: 0.42, lowcut: 30,
    early: [[0.05, 0.3], [0.08, 0.25]], echoes: [[0.19, 0.32], [0.37, 0.22], [0.58, 0.15], [0.83, 0.08]] },
  stairwell: { t60: 2.0, pre: 0.008, damp: [8000, 2100], send: 0.3,
    flutter: { period: 0.0086, decay: 0.78, count: 14 }, early: [[0.006, 0.4], [0.017, 0.3]] },
  tile: { t60: 1.25, pre: 0.003, damp: [11000, 4200], send: 0.3,
    early: [[0.003, 0.5], [0.006, 0.45], [0.0095, 0.4], [0.013, 0.35], [0.018, 0.3], [0.024, 0.2]] },
  library: { t60: 1.3, pre: 0.012, damp: [5000, 1300], send: 0.18, early: [[0.012, 0.3], [0.022, 0.2]] },
  vault: { t60: 2.3, pre: 0.014, damp: [4600, 900], send: 0.32, early: [[0.011, 0.4], [0.019, 0.33], [0.029, 0.25]] },
  outside: { t60: 0.8, pre: 0.02, damp: [6000, 2400], send: 0.07, echoes: [[0.11, 0.35], [0.23, 0.15]] },
  car: { t60: 0.16, pre: 0.001, damp: [5000, 2000], send: 0.08 },
  music: { t60: 3.2, pre: 0.03, damp: [7000, 2200], early: [[0.02, 0.2], [0.035, 0.15]], send: 1 },
};
export const SPACE_ALIASES = {
  small: 'room', classroom: 'room', office: 'room', large: 'hall', gym: 'hall', auditorium: 'hall',
  cafeteria: 'hall', restroom: 'tile', kitchen: 'tile', stairs: 'stairwell', mine: 'cavern', breaker: 'cavern',
  crypt: 'vault', exterior: 'outside',
};
export const spaceName = (k) => (k == null || k === 'none' ? 'none' : SPACES[k] ? k : SPACE_ALIASES[k] || null);

// IRs are pure data; cache one AudioBuffer per (sampleRate, space).
const IR_CACHE = new Map();
function irBuffer(ctx, kind) {
  const key = `${ctx.sampleRate}|${kind}`;
  let b = IR_CACHE.get(key);
  if (!b) {
    const data = makeIR(ctx.sampleRate, SPACES[kind], new Rand(mulberry32(kind.length * 7919 + 13)));
    b = ctx.createBuffer(2, data[0].length, ctx.sampleRate);
    b.copyToChannel(data[0], 0); b.copyToChannel(data[1], 1);
    IR_CACHE.set(key, b);
  }
  return b;
}

/** Slider value 0..1 → gain (squared ≈ perceptual taper; 0.8 → -3.9 dB). */
export const volCurve = (v) => { v = Math.max(0, Math.min(1, Number(v) || 0)); return v * v; };

export class Mixer {
  constructor(ctx, { dynamics = true, analyser = false } = {}) {
    this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(1);
    let tail = this.master;
    if (dynamics) {
      const trim = g(dbToGain(-COMP_MAKEUP_DB));
      const comp = ctx.createDynamicsCompressor();
      for (const [k, v] of Object.entries(COMP)) comp[k].value = v;
      const clip = ctx.createWaveShaper();
      clip.curve = softClipCurve(); clip.oversample = '2x';
      tail.connect(trim); trim.connect(comp); comp.connect(clip); tail = clip;
      this.comp = comp;
    }
    if (analyser) {
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
      this._td = new Float32Array(this.analyser.fftSize);
      tail.connect(this.analyser);
    }
    tail.connect(ctx.destination);

    this.bus = { music: g(), ambience: g(), sfx: g(), ui: g() };
    this.scene = { music: g(), ambience: g() };
    this.bus.music.connect(this.scene.music); this.scene.music.connect(this.master);
    this.bus.ambience.connect(this.scene.ambience); this.scene.ambience.connect(this.master);
    this.bus.sfx.connect(this.master); this.bus.ui.connect(this.master);

    // shared space reverb: two convolvers so a space change can crossfade
    this.sends = { sfx: g(), ambience: g() };
    this.ambSendScene = g();
    this.verbIn = g(0);
    this.sends.sfx.connect(this.verbIn);
    this.sends.ambience.connect(this.ambSendScene); this.ambSendScene.connect(this.verbIn);
    this.verbOut = g(1); this.verbOut.connect(this.master);
    this.conv = [ctx.createConvolver(), ctx.createConvolver()];
    this.convGain = [g(0), g(0)];
    for (let i = 0; i < 2; i++) { this.verbIn.connect(this.conv[i]); this.conv[i].connect(this.convGain[i]); this.convGain[i].connect(this.verbOut); }
    this.active = 0; this.space = 'none';

    // music reverb (non-diegetic, fixed space)
    this.musicVerbIn = g(1);
    this.musicConv = ctx.createConvolver();
    this.musicConv.buffer = irBuffer(ctx, 'music');
    this.musicVerbIn.connect(this.musicConv); this.musicConv.connect(this.bus.music);

    this.volumes = { master: 1, music: 1, sfx: 1, ambience: 1 };
  }

  /** Volumes 0..1 as in settings (taper applied here). The UI bus follows sfx. */
  setVolumes(v, fade = 0.05) {
    Object.assign(this.volumes, v);
    const t = this.ctx.currentTime, tc = Math.max(0.005, fade / 3);
    const set = (node, val) => node.gain.setTargetAtTime(val, t, tc);
    set(this.master, volCurve(this.volumes.master));
    set(this.bus.music, volCurve(this.volumes.music));
    set(this.bus.ambience, volCurve(this.volumes.ambience));
    set(this.sends.ambience, volCurve(this.volumes.ambience));
    set(this.bus.sfx, volCurve(this.volumes.sfx));
    set(this.sends.sfx, volCurve(this.volumes.sfx));
    set(this.bus.ui, volCurve(this.volumes.sfx) * 0.9);
  }

  /** Scene gain (silence × duck) for 'music' or 'ambience'. */
  setScene(which, value, fade = 1) {
    const t = this.ctx.currentTime, tc = Math.max(0.004, fade / 4);
    const nodes = which === 'music' ? [this.scene.music] : [this.scene.ambience, this.ambSendScene];
    for (const n of nodes) { n.gain.cancelScheduledValues(t); n.gain.setTargetAtTime(value, t, tc); }
  }

  /** Crossfade the shared reverb to another space (see SPACES). Returns the resolved name. */
  setSpace(kind, fade = 0.8) {
    const name = spaceName(kind);
    if (!name || name === this.space) return this.space;
    const t = this.ctx.currentTime, tc = Math.max(0.01, fade / 4);
    const next = 1 - this.active;
    if (name !== 'none') this.conv[next].buffer = irBuffer(this.ctx, name);
    this.convGain[this.active].gain.cancelScheduledValues(t);
    this.convGain[this.active].gain.setTargetAtTime(0, t, tc);
    this.convGain[next].gain.cancelScheduledValues(t);
    this.convGain[next].gain.setTargetAtTime(name === 'none' ? 0 : 1, t, tc);
    this.verbIn.gain.setTargetAtTime(name === 'none' ? 0 : SPACES[name].send, t, tc);
    this.active = next; this.space = name;
    return name;
  }

  /** Output level 0..1 (RMS, scaled for meters). Needs { analyser: true }. */
  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._td);
    let s = 0; for (let i = 0; i < this._td.length; i++) s += this._td[i] * this._td[i];
    const rms = Math.sqrt(s / this._td.length);
    // -50 dBFS → 0, -6 dBFS → 1
    return Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-9) + 50) / 44));
  }
}

/** Transparent below ~-1.5 dBFS, then a smooth knee into a hard ceiling (safety only). */
function softClipCurve() {
  const n = 2048, c = new Float32Array(n), knee = 0.84;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a < knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    c[i] = Math.sign(x) * Math.min(0.995, y);
  }
  return c;
}
