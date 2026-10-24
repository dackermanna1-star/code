/**
 * Jukebox music + combat score.
 *
 * A bar clock runs on the AudioContext timeline. Bars are generated just
 * ahead of time (lookahead scheduler pumped from a 25ms timer and from
 * update()), each bar's notes are queued and turned into audio nodes only when
 * they fall inside the lookahead window, so timing is sample accurate and
 * stopping / switching records is immediate.
 *
 * The jukebox is positional (PannerNode at the jukebox) with a low-passed,
 * non-positional bleed so it carries across the bar. The combat layer is a
 * separate non-positional bus synced to the same grid / chords.
 */
import * as THREE from 'three';
import { Band } from './Instruments';
import { SONGS, COMBAT_FALLBACK, combatBar, songBars, type SongDef, type BarInfo, type BarCtx, type Chord } from './Songs';
import { getKit, mkGain, mkFilter, mkNoise, mkOsc, mkShaper, envAHR, chain, clamp, smoothstep, mulberry32, rand, type Rng } from './dsp';
import { thump, noiseHit, grains, modal } from './layers';

interface QEv {
  time: number;
  fn: (t: number) => void;
  layer: 'juke' | 'combat';
}

interface Session {
  song: SongDef;
  bars: BarInfo[];
  bar: number;
  band: Band;
  bus: GainNode;
  wet: GainNode;
  rng: Rng;
}

function setPannerPos(p: PannerNode, v: THREE.Vector3): void {
  if (p.positionX) {
    p.positionX.value = v.x;
    p.positionY.value = v.y;
    p.positionZ.value = v.z;
  } else p.setPosition(v.x, v.y, v.z);
}

export class MusicSystem {
  readonly ac: BaseAudioContext;
  private readonly manual: boolean;
  private readonly offline: boolean;
  private readonly revSend: AudioNode | null;
  // jukebox chain
  private readonly jukeIn: GainNode;
  private readonly smashLP: BiquadFilterNode;
  private readonly jukeLevel: GainNode;
  private readonly jukeDuck: GainNode;
  private readonly fxIn: GainNode;
  private readonly panner: PannerNode;
  private readonly crackle: AudioBufferSourceNode;
  private readonly crackleGain: GainNode;
  private readonly chainNodes: AudioNode[] = [];
  // combat chain
  private readonly combatIn: GainNode;
  private readonly combatGain: GainNode;
  private readonly combatBand: Band;
  private readonly combatRng: Rng = mulberry32(977);
  // clock / scheduling
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: QEv[] = [];
  private dirty = false;
  private nextBar = 0;
  private clock = { bpm: 96, spb: 3, beats: 4 };
  private tempoMap: { t: number; bpm: number }[] = [];
  // jukebox state
  private juke: 'off' | 'gap' | 'song' | 'smashed' = 'off';
  private gapUntil = 0;
  private pendingIdx: number;
  private plays = 0;
  private session: Session | null = null;
  private songEnergy = 0;
  private name = '';
  private lastChords: Chord[] = [];
  private fallback = false;
  // combat
  private combatIdx = 0;
  private intensity = 0;
  private combatLevel = 0;
  private _energy = 0;
  private readonly sourcePos = new THREE.Vector3(0, 1.2, 0);

  /**
   * @param out    destination (music volume bus)
   * @param reverbSend shared room reverb input (optional)
   * @param opts.manual  no timer: the caller drives `pump()` (offline rendering / tests)
   */
  constructor(ac: BaseAudioContext, out: AudioNode, reverbSend: AudioNode | null = null, opts: { manual?: boolean } = {}) {
    this.ac = ac;
    this.manual = !!opts.manual;
    this.offline = !('close' in ac);
    this.revSend = reverbSend;
    const kit = getKit(ac);
    const keep = <T extends AudioNode>(n: T): T => (this.chainNodes.push(n), n);

    // ---- jukebox: vintage EQ, gentle saturation, smash low-pass, level, ducking
    this.jukeIn = keep(mkGain(ac, 1));
    this.smashLP = keep(mkFilter(ac, 'lowpass', 20000, 0.7));
    this.jukeLevel = keep(mkGain(ac, 0));
    this.jukeDuck = keep(mkGain(ac, 1));
    chain(
      this.jukeIn,
      keep(mkFilter(ac, 'highpass', 65, 0.7)),
      keep(mkFilter(ac, 'lowshelf', 180, 0.7, 2)),
      keep(mkFilter(ac, 'peaking', 2600, 0.8, -2)),
      keep(mkFilter(ac, 'highshelf', 7000, 0.7, -5)),
      keep(mkFilter(ac, 'lowpass', 11000, 0.6)),
      keep(mkGain(ac, 0.9)),
      keep(mkShaper(ac, kit.curves.soft)),
      this.smashLP,
      this.jukeLevel,
      this.jukeDuck,
    );
    this.fxIn = keep(mkGain(ac, 1));
    const jukeOut = keep(mkGain(ac, 1));
    this.jukeDuck.connect(jukeOut);
    this.fxIn.connect(jukeOut);
    const p = keep(ac.createPanner());
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 2.5;
    p.rolloffFactor = 1;
    p.maxDistance = 50;
    setPannerPos(p, this.sourcePos);
    this.panner = p;
    jukeOut.connect(p);
    p.connect(out);
    // non-positional bleed so the jukebox is heard everywhere in the bar
    const bleedLP = keep(mkFilter(ac, 'lowpass', 1700, 0.6));
    const bleed = keep(mkGain(ac, 0.2));
    chain(jukeOut, bleedLP, bleed, out);
    if (reverbSend) chain(jukeOut, keep(mkGain(ac, 0.4)), reverbSend);
    // vinyl surface noise under the record
    this.crackleGain = keep(mkGain(ac, 0.05));
    this.crackle = ac.createBufferSource();
    this.crackle.buffer = kit.crackle;
    this.crackle.loop = true;
    this.crackle.start();
    chain(this.crackle, keep(mkFilter(ac, 'bandpass', 2600, 0.5)), this.crackleGain, this.jukeIn);

    // ---- combat layer: score, not in the room
    this.combatIn = keep(mkGain(ac, 1));
    this.combatGain = keep(mkGain(ac, 0));
    chain(this.combatIn, keep(mkFilter(ac, 'highpass', 40, 0.7)), this.combatGain, out);
    if (reverbSend) chain(this.combatGain, keep(mkGain(ac, 0.06)), reverbSend);
    this.combatBand = new Band(ac, this.combatIn, { amp: 'metal', drums: 'punch' });

    this.pendingIdx = Math.floor(Math.random() * SONGS.length);
  }

  // ------------------------------------------------------------------ public API

  /** current tempo */
  get bpm(): number {
    const e = this.tempoAt(this.heardTime());
    return e ? e.bpm : this.clock.bpm;
  }

  /** 0..1 phase within the current beat (output latency compensated) */
  get beat(): number {
    if (!this.running) return 0;
    const now = this.heardTime();
    const e = this.tempoAt(now);
    if (!e || now < e.t) return 0;
    const x = ((now - e.t) * e.bpm) / 60;
    return x - Math.floor(x);
  }

  /** 0..1 how energetic the current mix is (song section energy / combat layer) */
  get energy(): number {
    return this._energy;
  }

  /** current (or about-to-play) record; '' when off or smashed */
  get songName(): string {
    return this.name;
  }

  /** true once the jukebox has been destroyed */
  get smashed(): boolean {
    return this.juke === 'smashed';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const now = this.ac.currentTime;
    this.queue = [];
    this.tempoMap = [];
    this.nextBar = now + 0.12;
    if (this.juke === 'smashed') this.useFallback();
    else this.startGap(now + 0.05, false);
    if (!this.manual && this.timer === null && typeof setInterval === 'function') this.timer = setInterval(() => this.tick(), 25);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.ac.currentTime;
    this.endSession(t, 0.4);
    this.queue = [];
    this.tempoMap = [];
    if (this.juke !== 'smashed') {
      this.juke = 'off';
      this.name = '';
    }
    this.jukeLevel.gain.setTargetAtTime(0, t, 0.1);
    this.combatGain.gain.setTargetAtTime(0, t, 0.2);
    this.combatLevel = 0;
  }

  /** Jukebox switches to the next record (needle lift, changer, needle drop). */
  nextSong(): void {
    if (this.juke === 'smashed') return;
    if (!this.running || this.juke === 'gap') {
      this.pendingIdx = (this.pendingIdx + 1) % SONGS.length;
      if (this.juke === 'gap') this.name = SONGS[this.pendingIdx].name;
      return;
    }
    this.startGap(this.ac.currentTime + 0.02, true);
  }

  /** Pick a specific record (0 blues, 1 rock'n'roll, 2 country, 3 doo-wop). */
  selectSong(i: number): void {
    if (this.juke === 'smashed') return;
    this.pendingIdx = ((i % SONGS.length) + SONGS.length) % SONGS.length;
    if (this.running && this.juke === 'song') this.startGap(this.ac.currentTime + 0.02, true);
    else if (this.juke === 'gap') this.name = SONGS[this.pendingIdx].name;
  }

  /** Jukebox world position. */
  setSource(pos: THREE.Vector3): void {
    this.sourcePos.copy(pos);
    setPannerPos(this.panner, pos);
  }

  /** Jukebox destroyed: record scratch, electrical death, the record never comes back. */
  smash(): void {
    if (this.juke === 'smashed') return;
    const t = this.ac.currentTime + 0.01;
    const playing = this.juke === 'song';
    this.juke = 'smashed';
    this.name = '';
    this.dropLayer('juke');
    this.scratch(t, playing);
    this.electrical(t + 0.3);
    this.smashLP.frequency.setValueAtTime(20000, t);
    this.smashLP.frequency.exponentialRampToValueAtTime(220, t + 0.45);
    this.jukeLevel.gain.setTargetAtTime(0, t + 0.05, 0.12);
    this.crackleGain.gain.setTargetAtTime(0, t, 0.05);
    this.endSession(t + 0.5, 0.05);
  }

  /** 0..1 combat intensity: fades in the combat layer. */
  setIntensity(x: number): void {
    this.intensity = clamp(x, 0, 1);
  }

  /** Per-frame: smoothing, ducking and a scheduler pump (also pumped by its own timer). */
  update(dt: number): void {
    const now = this.ac.currentTime;
    const target = smoothstep(0.04, 0.75, this.intensity) * 0.9;
    const k = 1 - Math.exp(-Math.max(dt, 0) / (target > this.combatLevel ? 0.8 : 2.5));
    this.combatLevel += (target - this.combatLevel) * k;
    this.combatGain.gain.setTargetAtTime(this.running ? this.combatLevel : 0, now, 0.08);
    this.jukeDuck.gain.setTargetAtTime(1 - 0.4 * this.combatLevel, now, 0.3);
    const songE = this.juke === 'song' ? this.songEnergy : this.juke === 'gap' ? 0.06 : 0;
    const eT = Math.max(songE * (1 - 0.3 * this.combatLevel), this.combatLevel);
    this._energy += (eT - this._energy) * (1 - Math.exp(-Math.max(dt, 0) / 0.5));
    if (this.running && !this.manual) this.pump(now + this.lookahead());
  }

  /** Schedule everything up to context time `until` (normally driven internally). */
  pump(until: number): void {
    if (!this.running) return;
    const now = this.ac.currentTime;
    if (!this.offline && this.nextBar < now - 0.25) {
      // main thread stalled: skip ahead instead of firing a burst of late notes
      this.nextBar = now + 0.05;
      this.queue = this.queue.filter((e) => e.time >= now - 0.05);
    }
    let guard = 0;
    while (this.nextBar < until && guard++ < 2000) this.genBar();
    if (this.dirty) {
      this.queue.sort((a, b) => a.time - b.time);
      this.dirty = false;
    }
    let i = 0;
    while (i < this.queue.length && this.queue[i].time < until) i++;
    if (!i) return;
    const due = this.queue.splice(0, i);
    for (const e of due) {
      try {
        e.fn(Math.max(e.time, now));
      } catch (err) {
        console.warn('[music]', err);
      }
    }
  }

  dispose(): void {
    this.stop();
    try {
      this.crackle.stop();
    } catch {
      /* ignore */
    }
    this.combatBand.dispose(this.ac.currentTime);
    for (const n of this.chainNodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  // ------------------------------------------------------------------ internals

  private tick(): void {
    if (this.running) this.pump(this.ac.currentTime + this.lookahead());
  }

  private lookahead(): number {
    return typeof document !== 'undefined' && document.hidden ? 1.5 : 0.15;
  }

  private heardTime(): number {
    const a = this.ac as Partial<AudioContext>;
    return this.ac.currentTime - (a.outputLatency ?? 0) - (a.baseLatency ?? 0);
  }

  private tempoAt(now: number): { t: number; bpm: number } | null {
    const m = this.tempoMap;
    if (!m.length) return null;
    let e = m[0];
    for (let i = 1; i < m.length; i++) {
      if (m[i].t <= now) e = m[i];
      else break;
    }
    return e;
  }

  private push(e: QEv): void {
    this.queue.push(e);
    this.dirty = true;
  }

  private dropLayer(layer: QEv['layer']): void {
    this.queue = this.queue.filter((e) => e.layer !== layer);
  }

  private combatActive(): boolean {
    return this.intensity > 0.03 || this.combatLevel > 0.01;
  }

  private useFallback(): void {
    this.fallback = true;
    this.clock = { bpm: COMBAT_FALLBACK.bpm, spb: COMBAT_FALLBACK.spb, beats: COMBAT_FALLBACK.beats };
  }

  private ctx(t0: number, sd: number, band: Band, rng: Rng, layer: QEv['layer'], info: { bar: number; sec: string; secBar: number; secLen: number; chord: Chord; prev: Chord; next: Chord }): BarCtx {
    const { spb, beats } = this.clock;
    return {
      t0,
      sd,
      steps: spb * beats,
      spb,
      beats,
      ...info,
      last: info.secBar === info.secLen - 1,
      b: band,
      rng,
      at: (step, fn, tight) => {
        const h = step === 0 ? 0 : (Math.random() - 0.5) * (tight ? 0.004 : 0.012);
        this.push({ time: t0 + step * sd + h, fn, layer });
      },
      s: (n) => n * sd,
    };
  }

  private genBar(): void {
    let t0 = this.nextBar;
    const combatOn = this.combatActive();
    if (this.juke === 'gap') {
      if (!combatOn && t0 < this.gapUntil) t0 = this.gapUntil;
      if (t0 >= this.gapUntil - 0.03) this.beginSong(t0);
    }
    if (this.juke === 'smashed' && !this.fallback) this.useFallback();
    const { bpm, spb, beats } = this.clock;
    const sd = 60 / bpm / spb;
    const barDur = sd * spb * beats;
    this.tempoMap.push({ t: t0, bpm });
    if (this.tempoMap.length > 12) this.tempoMap.shift();

    let chord: Chord | null = null;
    const s = this.session;
    if (this.juke === 'song' && s && s.bar < s.bars.length) {
      const info = s.bars[s.bar];
      chord = info.chord;
      const prev = s.bars[Math.max(0, s.bar - 1)].chord;
      const next = s.bars[Math.min(s.bars.length - 1, s.bar + 1)].chord;
      const c = this.ctx(t0, sd, s.band, s.rng, 'juke', { bar: s.bar, sec: info.sec, secBar: info.secBar, secLen: info.secLen, chord, prev, next });
      try {
        s.song.bar(c);
      } catch (err) {
        console.warn('[music]', err);
      }
      this.songEnergy = info.energy;
      this.lastChords.push(chord);
      if (this.lastChords.length > 16) this.lastChords.shift();
      s.bar++;
      if (s.bar >= s.bars.length) {
        // record over: let the last chord ring, then the changer puts on the next one
        this.push({ time: t0 + barDur + 0.25, layer: 'juke', fn: (t) => this.startGap(t, true) });
      }
    }
    if (combatOn) {
      const prog = this.fallback || !this.lastChords.length ? COMBAT_FALLBACK.chords : this.lastChords;
      const cc = chord ?? prog[this.combatIdx % prog.length];
      const c = this.ctx(t0, sd, this.combatBand, this.combatRng, 'combat', { bar: this.combatIdx, sec: 'combat', secBar: this.combatIdx % 4, secLen: 4, chord: cc, prev: cc, next: cc });
      try {
        combatBar(c, this.intensity, this.combatIdx);
      } catch (err) {
        console.warn('[music]', err);
      }
    }
    this.combatIdx++;
    this.nextBar = t0 + barDur;
  }

  private beginSong(t0: number): void {
    const ac = this.ac;
    const idx = this.pendingIdx;
    const song = SONGS[idx];
    this.pendingIdx = (idx + 1) % SONGS.length;
    this.plays++;
    const bus = mkGain(ac, 1);
    bus.connect(this.jukeIn);
    const wet = mkGain(ac, 0.25);
    if (this.revSend) wet.connect(this.revSend);
    const band = new Band(ac, bus, song.style);
    band.wetOut.connect(wet);
    this.session = { song, bars: songBars(song), bar: 0, band, bus, wet, rng: mulberry32(song.seed * 31 + this.plays * 7919) };
    this.clock = { bpm: song.bpm, spb: song.spb, beats: song.beats };
    this.juke = 'song';
    this.name = song.name;
    this.lastChords = [];
    this.jukeLevel.gain.setTargetAtTime(1, Math.max(ac.currentTime, t0 - 0.08), 0.02);
  }

  private endSession(t: number, fade: number): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.bus.gain.setTargetAtTime(0, t, fade / 3);
    s.wet.gain.setTargetAtTime(0, t, fade / 3);
    s.band.dispose(t + fade + 0.3);
    if (!this.offline && typeof setTimeout === 'function')
      setTimeout(() => {
        try {
          s.bus.disconnect();
          s.wet.disconnect();
        } catch {
          /* ignore */
        }
      }, (t - this.ac.currentTime + fade + 0.6) * 1000);
  }

  /** Needle up (if a record was playing), changer mechanism, needle down, lead-in groove. */
  private startGap(t: number, lift: boolean): void {
    if (this.juke === 'smashed') return;
    this.dropLayer('juke');
    if (lift) {
      this.needleLift(t);
      this.endSession(t, 0.1);
      this.changer(t + 0.12);
    }
    this.jukeLevel.gain.setTargetAtTime(0, t, 0.03);
    const tDrop = t + (lift ? 1.55 : 0.3);
    this.needleDrop(tDrop);
    this.gapUntil = tDrop + 0.9;
    this.juke = 'gap';
    this.name = SONGS[this.pendingIdx].name;
  }

  private needleLift(t: number): void {
    const ac = this.ac;
    noiseHit(ac, this.fxIn, t, { type: 'bandpass', f: 2500, f1: 900, sweep: 0.08, q: 2, tau: 0.02, amp: 0.25 });
    thump(ac, this.fxIn, t + 0.01, { f0: 180, f1: 90, drop: 0.02, tau: 0.015, amp: 0.15 });
  }

  private changer(t: number): void {
    const ac = this.ac;
    const o = mkOsc(ac, 'sawtooth', 55, t, t + 1.3);
    o.frequency.linearRampToValueAtTime(70, t + 0.5);
    o.frequency.linearRampToValueAtTime(52, t + 1.2);
    const lp = mkFilter(ac, 'lowpass', 420, 1.5);
    const g = mkGain(ac, 0);
    envAHR(g.gain, t, 0.06, 0.15, 0.9, 0.08);
    chain(o, lp, g, this.fxIn);
    noiseHit(ac, this.fxIn, t, { type: 'bandpass', f: 1200, q: 1, att: 0.1, hold: 0.9, tau: 0.08, amp: 0.035 });
    for (const dt of [0.08, 0.62, 1.18]) {
      thump(ac, this.fxIn, t + dt, { f0: 220, f1: 120, drop: 0.02, tau: 0.02, amp: 0.18 });
      modal(ac, this.fxIn, t + dt, { f: rand(900, 1300), ratios: [1, 2.3], taus: [0.03, 0.015], amps: [1, 0.4], amp: 0.06 });
    }
  }

  private needleDrop(t: number): void {
    const ac = this.ac;
    thump(ac, this.fxIn, t, { f0: 90, f1: 50, drop: 0.03, tau: 0.04, amp: 0.3 });
    const src = mkNoise(ac, getKit(ac).crackle, t, t + 1.3);
    const bp = mkFilter(ac, 'bandpass', 2400, 0.6);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.01);
    g.gain.setTargetAtTime(0.14, t + 0.05, 0.15);
    g.gain.setTargetAtTime(0, t + 0.95, 0.08);
    chain(src, bp, g, this.fxIn);
    noiseHit(ac, this.fxIn, t, { buf: 'brown', type: 'lowpass', f: 120, att: 0.05, hold: 0.8, tau: 0.1, amp: 0.25 });
  }

  /** Needle dragged across the record. */
  private scratch(t: number, loud: boolean): void {
    const ac = this.ac;
    const end = t + 0.62;
    const src = mkNoise(ac, getKit(ac).white, t, end);
    const bp = mkFilter(ac, 'bandpass', 800, 2.5);
    const f = bp.frequency;
    f.setValueAtTime(700, t);
    f.exponentialRampToValueAtTime(3200, t + 0.08);
    f.exponentialRampToValueAtTime(450, t + 0.22);
    f.exponentialRampToValueAtTime(2400, t + 0.3);
    f.exponentialRampToValueAtTime(260, t + 0.52);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.01);
    g.gain.setValueAtTime(0.8, t + 0.45);
    g.gain.linearRampToValueAtTime(0, t + 0.58);
    chain(src, bp, g, this.fxIn);
    // the music itself dragged with it
    const o = mkOsc(ac, 'sawtooth', 180, t, end);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.22);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.52);
    const og = mkGain(ac, 0);
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(loud ? 0.18 : 0.08, t + 0.01);
    og.gain.linearRampToValueAtTime(0, t + 0.55);
    chain(o, mkFilter(ac, 'lowpass', 1800, 1.2), og, this.fxIn);
  }

  /** Mains buzz sputtering out, sparks, speaker cone pop. */
  private electrical(t: number): void {
    const ac = this.ac;
    const dur = 1.6;
    const o = mkOsc(ac, 'sawtooth', 120, t, t + dur);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    let tt = t;
    while (tt < t + dur - 0.2) {
      const a = 0.12 * (1 - (tt - t) / dur) * rand(0.3, 1);
      const len = rand(0.03, 0.15);
      g.gain.linearRampToValueAtTime(a, tt + 0.01);
      g.gain.setValueAtTime(a, tt + len);
      g.gain.linearRampToValueAtTime(0, tt + len + 0.01);
      tt += len + rand(0.02, 0.12);
    }
    chain(o, mkFilter(ac, 'bandpass', 900, 1.2), g, this.fxIn);
    grains(ac, this.fxIn, t, { type: 'highpass', f: 3000, n: 22, spread: 1.0, amp: 0.4, grain: 0.0015 });
    thump(ac, this.fxIn, t + 0.05, { f0: 70, f1: 35, drop: 0.1, tau: 0.08, amp: 0.4 });
  }
}
