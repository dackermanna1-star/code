/**
 * Generative background music — calm, sparse piano / pad pieces in the spirit of C418,
 * generated from seeded rules (scales, progressions, motifs and textures per mood), with
 * long silences between pieces. Nothing is transcribed: every piece is a fresh combination
 * of rules, so no existing melody is reproduced.
 */
import type { SoundBank } from './bank';
import { Rand, hashStr, mix32 } from './dsp/rand';
import { INSTRUMENTS, nearestRoot } from './recipes/instruments';

export type MusicMode = 'menu' | 'overworld' | 'creative' | 'underwater' | 'nether' | 'end' | 'off';

/** Music bus level (pieces are soft; this sits them ~10 dB under typical SFX peaks). */
const MUSIC_GAIN = 1.1;

const SCALES: Record<string, readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  whole: [0, 2, 4, 6, 8, 10],
  pentaMaj: [0, 2, 4, 7, 9],
  pentaMin: [0, 3, 5, 7, 10],
  dim: [0, 2, 3, 5, 6, 8, 9, 11],
};

type Texture = 'chords' | 'arp' | 'melody' | 'sparse' | 'bells' | 'drone' | 'pads';
type InstName = 'piano' | 'pad' | 'bell' | 'pluck' | 'drone' | 'choir';

interface Mood {
  scales: readonly string[];
  progs: readonly (readonly number[])[];
  bpm: readonly [number, number];
  gap: readonly [number, number];
  first: readonly [number, number];
  bars: readonly [number, number];
  combos: readonly (readonly Texture[])[];
  register: readonly [number, number];
  bass: readonly [number, number];
  chordCenter: number;
  padInst: InstName;
  melodyInst: InstName;
  arpInst: InstName;
  vel: number;
  rest: number;
}

const BRIGHT = [[0, 4, 5, 3], [0, 3, 0, 4], [5, 3, 0, 4], [0, 5, 3, 4], [3, 0, 4, 5], [0, 3, 5, 4], [0, 2, 3, 0], [3, 4, 0, 0]];
const LYD = [[0, 1, 0, 1], [0, 1, 4, 0], [0, 4, 1, 0]];
const DARK = [[0, 5, 2, 6], [0, 3, 0, 3], [0, 6, 5, 6], [0, 5, 3, 4], [0, 3, 6, 0], [0, 2, 5, 0]];
const PHRYG = [[0, 1, 0, 6], [0, 1, 3, 1], [0, 6, 1, 0]];

const MOODS: Record<string, Mood> = {
  menu: {
    scales: ['ionian', 'lydian'],
    progs: [...BRIGHT, ...LYD],
    bpm: [62, 72],
    gap: [8, 20],
    first: [1, 2.5],
    bars: [24, 32],
    combos: [['chords', 'melody', 'pads'], ['arp', 'melody'], ['chords', 'melody']],
    register: [64, 79],
    bass: [36, 48],
    chordCenter: 57,
    padInst: 'pad',
    melodyInst: 'piano',
    arpInst: 'piano',
    vel: 0.46,
    rest: 0.3,
  },
  day: {
    scales: ['ionian', 'lydian', 'mixolydian', 'pentaMaj'],
    progs: [...BRIGHT, ...LYD],
    bpm: [64, 78],
    gap: [70, 220],
    first: [15, 40],
    bars: [24, 40],
    combos: [['chords', 'melody'], ['arp', 'melody'], ['arp'], ['chords', 'melody', 'pads'], ['sparse', 'pads']],
    register: [62, 79],
    bass: [36, 48],
    chordCenter: 57,
    padInst: 'pad',
    melodyInst: 'piano',
    arpInst: 'piano',
    vel: 0.44,
    rest: 0.35,
  },
  night: {
    scales: ['dorian', 'aeolian', 'pentaMin'],
    progs: DARK,
    bpm: [54, 66],
    gap: [70, 220],
    first: [15, 40],
    bars: [20, 32],
    combos: [['chords', 'melody', 'pads'], ['sparse', 'pads'], ['arp', 'melody']],
    register: [60, 76],
    bass: [33, 45],
    chordCenter: 55,
    padInst: 'pad',
    melodyInst: 'piano',
    arpInst: 'piano',
    vel: 0.38,
    rest: 0.4,
  },
  creative: {
    scales: ['lydian', 'ionian', 'pentaMaj'],
    progs: [...BRIGHT, ...LYD],
    bpm: [70, 84],
    gap: [50, 160],
    first: [8, 25],
    bars: [24, 40],
    combos: [['arp', 'melody', 'bells'], ['chords', 'bells', 'melody'], ['arp', 'pads', 'bells']],
    register: [64, 81],
    bass: [36, 50],
    chordCenter: 59,
    padInst: 'pad',
    melodyInst: 'piano',
    arpInst: 'pluck',
    vel: 0.46,
    rest: 0.25,
  },
  underwater: {
    scales: ['whole', 'lydian', 'pentaMaj'],
    progs: [[0, 1, 0, 1], [0, 3, 0, 3], [0, 2, 0, 4]],
    bpm: [48, 58],
    gap: [40, 120],
    first: [6, 18],
    bars: [16, 28],
    combos: [['pads', 'bells', 'sparse'], ['pads', 'sparse'], ['pads', 'bells']],
    register: [67, 86],
    bass: [40, 52],
    chordCenter: 62,
    padInst: 'choir',
    melodyInst: 'bell',
    arpInst: 'bell',
    vel: 0.36,
    rest: 0.5,
  },
  nether: {
    scales: ['phrygian', 'harmonic', 'aeolian'],
    progs: [...DARK, ...PHRYG],
    bpm: [48, 58],
    gap: [30, 100],
    first: [5, 15],
    bars: [16, 28],
    combos: [['drone', 'sparse'], ['drone', 'chords'], ['drone', 'sparse', 'pads']],
    register: [43, 62],
    bass: [26, 38],
    chordCenter: 45,
    padInst: 'drone',
    melodyInst: 'piano',
    arpInst: 'piano',
    vel: 0.42,
    rest: 0.5,
  },
  end: {
    scales: ['whole', 'dim'],
    progs: [[0, 3, 0, 3], [0, 1, 0, 1], [0, 2, 4, 2]],
    bpm: [46, 54],
    gap: [40, 120],
    first: [6, 18],
    bars: [16, 24],
    combos: [['pads', 'bells', 'sparse'], ['pads', 'sparse']],
    register: [70, 90],
    bass: [38, 50],
    chordCenter: 62,
    padInst: 'choir',
    melodyInst: 'bell',
    arpInst: 'bell',
    vel: 0.32,
    rest: 0.55,
  },
};

export interface NoteEv {
  t: number;
  inst: InstName;
  midi: number;
  vel: number;
  dur: number;
}

export interface Piece {
  mood: string;
  scale: string;
  root: number;
  bpm: number;
  bars: number;
  textures: readonly Texture[];
  length: number;
  events: NoteEv[];
  keys: string[];
}

/** Builds a complete piece from a seed (deterministic). */
export function generatePiece(moodName: string, seed: number): Piece {
  const mood = MOODS[moodName] ?? MOODS.day;
  const r = new Rand(seed);
  const scaleName = r.pick(mood.scales);
  const scale = SCALES[scaleName];
  const N = scale.length;
  const root = r.int(12);
  const bpm = Math.round(r.range(mood.bpm[0], mood.bpm[1]));
  const beat = 60 / bpm;
  const meter = r.chance(0.25) ? 3 : 4;
  const bar = beat * meter;
  const bars = Math.max(8, Math.round(r.range(mood.bars[0], mood.bars[1]) / 4) * 4);
  const textures = r.pick(mood.combos);
  const has = (t: Texture) => textures.includes(t);
  const progA = N === 7 ? r.pick(mood.progs) : [0, r.int(N), 0, r.int(N)];
  const progB = N === 7 ? r.pick(mood.progs) : [r.int(N), 0, r.int(N), 0];
  const chordBars = r.chance(0.6) ? 1 : 2;
  const ev: NoteEv[] = [];

  const mod = (a: number, n: number): number => ((a % n) + n) % n;
  /** MIDI for absolute scale degree (degree 0 = root in octave 0 → MIDI = root). */
  const midiOf = (deg: number): number => root + scale[mod(deg, N)] + 12 * Math.floor(deg / N);
  /** Degree whose pitch is closest to `target` MIDI. */
  const degNear = (target: number): number => {
    const d0 = Math.round(((target - root) / 12) * N);
    let best = d0;
    for (let k = d0 - N; k <= d0 + N; k++) if (Math.abs(midiOf(k) - target) < Math.abs(midiOf(best) - target)) best = k;
    return best;
  };
  /** Degree of the tonic in the octave nearest `target`. */
  const ob = (target: number): number => {
    const d = degNear(target);
    return d - mod(d, N);
  };
  const chordDegs = (p: number, ext: boolean): number[] => {
    const c = [p, p + 2, p + 4];
    if (ext && N >= 7) c.push(r.chance(0.5) ? p + 6 : p + 8);
    return c;
  };
  const note = (t: number, inst: InstName, midi: number, vel: number, dur: number) => {
    if (t < 0) return;
    ev.push({ t: Math.max(0, t + r.gauss() * 0.008), inst, midi, vel: Math.max(0.05, Math.min(1, vel * (1 + r.bi() * 0.1))), dur });
  };

  // ---- form: intro (no melody) · A · A' · B · A'' · outro ----
  const intro = r.chance(0.6) ? 2 : 4;
  const outro = 2;
  const body = bars - intro - outro;
  const bStart = intro + Math.floor(body * 0.5);
  const bEnd = bStart + Math.floor(body * 0.25);
  const regLo = mood.register[0];
  const regHi = mood.register[1];
  const bassMid = (mood.bass[0] + mood.bass[1]) / 2;

  // motif: rhythm (beats) + scale steps, realized against the current chord
  const palettes = [[1, 1, 2], [0.5, 0.5, 1, 2], [1.5, 0.5, 2], [1, 0.5, 0.5, 2], [2, 1, 1], [1, 1, 1, 1], [0.5, 1, 0.5, 2]];
  const rhythm = r.pick(palettes).slice();
  const steps: number[] = [0];
  for (let i = 1; i < rhythm.length; i++) steps.push(r.pick([-2, -1, -1, 1, 1, 2, -3, 3]));
  let lastMel = degNear((regLo + regHi) / 2);
  const arpPattern = r.pick([[0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 5], [0, 1, 2, 4, 5, 4, 2, 1], [0, 3, 1, 4, 2, 5, 1, 4]]);

  for (let b = 0; b < bars; b++) {
    const inB = b >= bStart && b < bEnd;
    const prog = inB ? progB : progA;
    const isOutro = b >= bars - outro;
    const pDeg = isOutro ? 0 : prog[Math.floor(b / chordBars) % prog.length];
    const chordStart = b % chordBars === 0;
    const t0 = b * bar;
    const swell = 0.85 + 0.15 * Math.sin((Math.PI * b) / bars);
    const v = mood.vel * swell * (isOutro ? 0.8 : 1);
    const cd = chordDegs(pDeg, r.chance(0.45));
    const span = chordBars * bar;

    if (has('drone') && (b === 0 || (chordStart && b % 4 === 0))) {
      note(t0, 'drone', clampMidi(midiOf(ob(mood.bass[0] + 4)), mood.bass[0], mood.bass[1] + 6), v * 0.7, Math.min(4, bars - b) * bar + 1);
    }
    if (has('pads') && chordStart) {
      const base = ob(mood.chordCenter);
      for (const d of cd.slice(0, 3)) note(t0 + 0.02, mood.padInst, clampMidi(midiOf(base + d), mood.chordCenter - 7, mood.chordCenter + 12), v * 0.55, span + 0.8);
    }
    if (has('chords') && chordStart) {
      note(t0, 'piano', clampMidi(midiOf(ob(bassMid) + pDeg), mood.bass[0], mood.bass[1]), v * 0.85, span + 1.2);
      const base = ob(mood.chordCenter);
      const roll = r.range(0.03, 0.06);
      const voicing = cd.map((d) => clampMidi(midiOf(base + d), mood.chordCenter - 6, mood.chordCenter + 9)).sort((a, c) => a - c);
      for (let i = 0; i < voicing.length; i++) note(t0 + roll * (i + 1), 'piano', voicing[i], v * 0.55, span + 0.6);
      if (chordBars === 1 && r.chance(0.3)) for (let i = 0; i < 2; i++) note(t0 + bar * 0.5 + i * roll, 'piano', voicing[Math.min(voicing.length - 1, i + 1)], v * 0.38, bar * 0.6);
    }
    if (has('arp') && !(b < intro && r.chance(0.3))) {
      const sub = bpm < 66 ? 2 : 1;
      const base = ob(mood.chordCenter - 3);
      const tones: number[] = [];
      for (const oct of [0, N]) for (const d of cd.slice(0, 3)) tones.push(midiOf(base + d + oct));
      tones.sort((a, c) => a - c);
      for (let s = 0; s < meter * sub; s++) {
        if (s > 0 && r.chance(0.28)) continue;
        note(t0 + (s * beat) / sub, mood.arpInst, tones[arpPattern[s % arpPattern.length] % tones.length], v * (s === 0 ? 0.55 : 0.4), beat * 1.6);
      }
    }
    if (has('sparse') && r.chance(0.6)) {
      const k = 1 + r.int(2);
      for (let i = 0; i < k; i++) {
        const m = clampMidi(midiOf(ob(r.range(regLo, regHi)) + r.pick(cd)), regLo - 5, regHi);
        note(t0 + r.int(meter) * beat + r.range(0, 0.1), r.chance(0.3) ? mood.melodyInst : 'piano', m, v * 0.5, bar * 1.5);
      }
    }
    if (has('bells') && r.chance(0.45)) {
      note(t0 + r.int(meter) * beat, 'bell', clampMidi(midiOf(ob(regHi) + r.pick(cd)), regLo + 5, 96), v * 0.4, bar * 1.2);
    }
    if (has('melody') && b >= intro && !isOutro && b % 2 === 0 && r.next() > mood.rest) {
      // realize the motif over this 2-bar unit (with variations), leaving space after it
      const invert = r.chance(0.25);
      const len = r.chance(0.25) ? rhythm.length - 1 : rhythm.length;
      // start on the chord tone nearest the previous melody note (inside the register)
      let start = lastMel;
      let bestDist = 1e9;
      const base = lastMel - mod(lastMel, N);
      for (const d of cd) {
        for (let o = -2; o <= 2; o++) {
          const cand = base + d + o * N;
          const m = midiOf(cand);
          const dist = Math.abs(cand - lastMel);
          if (dist < bestDist && m >= regLo && m <= regHi) {
            bestDist = dist;
            start = cand;
          }
        }
      }
      let deg = start;
      let t = t0 + (r.chance(0.3) ? beat : 0);
      for (let i = 0; i < len; i++) {
        deg += invert ? -steps[i] : steps[i];
        if (midiOf(deg) < regLo - 3) deg += N;
        if (midiOf(deg) > regHi + 3) deg -= N;
        note(t, mood.melodyInst, midiOf(deg), v * 0.78, rhythm[i] * beat * 1.7);
        t += rhythm[i] * beat;
        lastMel = deg;
      }
      // occasional echo an octave up
      if (r.chance(0.15)) note(t + beat * 0.5, mood.melodyInst, midiOf(lastMel) + 12, v * 0.35, beat * 2);
    }
  }
  // final tonic chord ringing out
  const fin = bars * bar;
  const fb = ob(mood.chordCenter);
  for (const d of [0, 2, 4]) note(fin + d * 0.02, 'piano', midiOf(fb + d), mood.vel * 0.45, 6);
  note(fin, 'piano', clampMidi(midiOf(ob(mood.bass[0] + 5)), mood.bass[0], mood.bass[1]), mood.vel * 0.6, 7);

  ev.sort((a, b) => a.t - b.t);
  const keys = new Set<string>();
  for (const e of ev) keys.add(`i:${e.inst}:${nearestRoot(INSTRUMENTS[e.inst], e.midi)}`);
  return { mood: moodName, scale: scaleName, root, bpm, bars, textures, length: fin + 8, events: ev, keys: [...keys] };
}

function clampMidi(m: number, lo: number, hi: number): number {
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

interface MusicVoice {
  src: AudioBufferSourceNode;
  nodes: AudioNode[];
  done: boolean;
}

/** Plays generated pieces on the music bus with long silences in between. */
export class MusicEngine {
  private mode: MusicMode = 'off';
  private state: 'idle' | 'waiting' | 'loading' | 'playing' | 'fading' = 'idle';
  private timer = 0;
  private piece: Piece | null = null;
  private idx = 0;
  private start = 0;
  private count = 0;
  private tod = 0.2;
  private out: GainNode;
  private voices: MusicVoice[] = [];
  private r: Rand;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
    private bank: SoundBank,
    private seed: number,
  ) {
    this.r = new Rand(mix32(seed, 0x6d75));
    this.out = ctx.createGain();
    this.out.gain.value = MUSIC_GAIN;
    this.out.connect(dest);
  }

  setTimeOfDay(t: number): void {
    this.tod = t;
  }

  getMode(): MusicMode {
    return this.mode;
  }

  private moodName(): string {
    if (this.mode === 'overworld') return this.tod > 0.52 && this.tod < 0.98 ? 'night' : 'day';
    return this.mode;
  }

  setMode(m: MusicMode): void {
    if (m === this.mode) return;
    this.mode = m;
    if (this.state === 'playing' || this.state === 'loading') {
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.7);
      this.state = 'fading';
      this.timer = 3.2;
    } else if (this.state !== 'fading') {
      if (m === 'off') this.state = 'idle';
      else {
        this.state = 'waiting';
        const mood = MOODS[this.moodName()];
        this.timer = this.r.range(mood.first[0], mood.first[1]);
      }
    }
  }

  /** Skips the current silence (debug). */
  next(): void {
    if (this.state === 'waiting') this.timer = 0;
    else if (this.state === 'playing') {
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      this.state = 'fading';
      this.timer = 1.5;
      this.skipGap = true;
    }
  }
  private skipGap = false;

  update(dt: number): void {
    const now = this.ctx.currentTime;
    switch (this.state) {
      case 'idle':
        return;
      case 'waiting':
        this.timer -= dt;
        if (this.timer <= 0) {
          const mood = this.moodName();
          this.piece = generatePiece(mood, mix32(mix32(this.seed, ++this.count), hashStr(mood)));
          for (const k of this.piece.keys) this.bank.request(k, 3);
          this.state = 'loading';
          this.timer = 12;
        }
        return;
      case 'loading': {
        this.timer -= dt;
        const p = this.piece;
        if (!p) {
          this.state = 'idle';
          return;
        }
        let ready = true;
        for (const k of p.keys) if (!this.bank.has(k)) ready = false;
        if (ready || this.timer <= 0) {
          this.state = 'playing';
          this.idx = 0;
          this.start = now + 0.15;
          this.out.gain.cancelScheduledValues(now);
          this.out.gain.setValueAtTime(MUSIC_GAIN, now);
        }
        return;
      }
      case 'playing': {
        const p = this.piece;
        if (!p) return;
        const horizon = now + 0.35 - this.start;
        while (this.idx < p.events.length && p.events[this.idx].t <= horizon) {
          const e = p.events[this.idx++];
          const when = this.start + e.t;
          if (when >= now - 0.05) this.playNote(e, Math.max(now, when));
        }
        if (this.idx >= p.events.length && now > this.start + p.length) {
          this.state = 'waiting';
          const mood = MOODS[this.moodName()];
          this.timer = this.r.range(mood.gap[0], mood.gap[1]);
        }
        return;
      }
      case 'fading':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.stopAll();
          this.out.gain.cancelScheduledValues(now);
          this.out.gain.setValueAtTime(MUSIC_GAIN, now);
          if (this.mode === 'off') this.state = 'idle';
          else {
            this.state = 'waiting';
            this.timer = this.skipGap ? 0.5 : this.r.range(2, 6);
          }
          this.skipGap = false;
        }
        return;
    }
  }

  private playNote(e: NoteEv, when: number): void {
    if (this.voices.length >= 48) return;
    const spec = INSTRUMENTS[e.inst];
    const root = nearestRoot(spec, e.midi);
    const buf = this.bank.get(`i:${e.inst}:${root}`);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = Math.pow(2, (e.midi - root) / 12);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const nodes: AudioNode[] = [g];
    let tail: AudioNode = src;
    if (e.inst === 'piano' || e.inst === 'pluck') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900 + 9000 * e.vel * e.vel;
      f.Q.value = 0.5;
      src.connect(f);
      tail = f;
      nodes.push(f);
    }
    tail.connect(g);
    let out: AudioNode = g;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.5, Math.min(0.5, (e.midi - 62) / 40 + this.r.bi() * 0.12));
      g.connect(p);
      out = p;
      nodes.push(p);
    }
    out.connect(this.out);
    const gp = g.gain;
    let stopAt: number;
    if (spec.loop) {
      src.loop = true;
      const att = Math.min(1.6, e.dur * 0.4);
      gp.setValueAtTime(0, when);
      gp.linearRampToValueAtTime(e.vel, when + att);
      gp.setTargetAtTime(0, when + Math.max(att, e.dur), 0.9);
      stopAt = when + Math.max(att, e.dur) + 4;
      src.start(when, this.r.next() * buf.duration * 0.8);
    } else {
      gp.setValueAtTime(e.vel, when);
      gp.setTargetAtTime(0, when + e.dur, 0.45);
      stopAt = Math.min(when + e.dur + 2.5, when + buf.duration / rate + 0.05);
      src.start(when);
    }
    src.stop(stopAt);
    const v: MusicVoice = { src, nodes, done: false };
    src.onended = () => this.release(v);
    this.voices.push(v);
  }

  private release(v: MusicVoice): void {
    if (v.done) return;
    v.done = true;
    try {
      v.src.disconnect();
      for (const n of v.nodes) n.disconnect();
    } catch {
      /* already disconnected */
    }
    const i = this.voices.indexOf(v);
    if (i >= 0) {
      this.voices[i] = this.voices[this.voices.length - 1];
      this.voices.pop();
    }
  }

  private stopAll(): void {
    for (const v of this.voices.slice()) {
      try {
        v.src.stop();
      } catch {
        /* not started */
      }
      this.release(v);
    }
  }

  stats(): { mode: MusicMode; state: string; wait: number; piece: string | null; voices: number } {
    const p = this.piece;
    return {
      mode: this.mode,
      state: this.state,
      wait: this.state === 'waiting' ? Math.max(0, Math.round(this.timer)) : 0,
      piece: p ? `${p.mood} ${p.scale} root=${p.root} ${p.bpm}bpm ${p.bars} bars [${p.textures.join('+')}]` : null,
      voices: this.voices.length,
    };
  }

  dispose(): void {
    this.stopAll();
    this.out.disconnect();
  }
}
