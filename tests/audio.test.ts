import { afterEach, describe, expect, it } from 'vitest';
import { AudioManager, LOOP_KEYS, SOUND_NAMES, SOUND_SPECS, audio } from '../src/audio/audio';
import { BEDS } from '../src/audio/ambience';
import { distanceGain, spatialize, MAX_AUDIBLE_DISTANCE } from '../src/audio/spatial';
import { SlidingWindow, VoicePool } from '../src/audio/voicePolicy';

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

describe('SlidingWindow', () => {
  it('allows at most N events per window and frees slots as time passes', () => {
    const w = new SlidingWindow(2, 0.05);
    expect(w.tryAcquire(0)).toBe(true);
    expect(w.tryAcquire(0.01)).toBe(true);
    expect(w.tryAcquire(0.02)).toBe(false);
    expect(w.tryAcquire(0.049)).toBe(false);
    expect(w.tryAcquire(0.05)).toBe(true); // first slot (t=0) expired
    expect(w.tryAcquire(0.055)).toBe(false);
    expect(w.tryAcquire(0.061)).toBe(true); // second slot (t=0.01) expired
  });
});

describe('VoicePool', () => {
  it('rate-limits a spammed sound and merges the excess into the newest instance', () => {
    const pool = new VoicePool<null>({ cap: 32 });
    let plays = 0;
    let merges = 0;
    let drops = 0;
    for (let i = 0; i < 300; i++) {
      const now = i * 0.001; // 300 calls in 0.3 s (1000/s)
      pool.reap(now);
      const a = pool.admit('impact_small', 1, 2, now, 6);
      if (a.kind === 'play') {
        plays++;
        pool.commit('impact_small', 1, now, now + 0.08, 0.3, null);
      } else if (a.kind === 'merge') merges++;
      else drops++;
    }
    // 2 per 50 ms over 0.3 s => at most 12 fresh instances.
    expect(plays).toBeLessThanOrEqual(12);
    expect(plays).toBeGreaterThanOrEqual(6);
    expect(merges + drops).toBe(300 - plays);
    expect(merges).toBeGreaterThan(200);
    expect(pool.size).toBeLessThanOrEqual(6);
  });

  it('merge level grows sub-linearly and is capped', () => {
    let lvl = 0.3;
    for (let i = 0; i < 100; i++) lvl = VoicePool.mergeLevel(lvl, 0.3, 0.3, 2);
    expect(lvl).toBeCloseTo(0.6, 5);
    expect(VoicePool.mergeLevel(0.3, 0.3, 0.3, 5)).toBeCloseTo(Math.SQRT2 * 0.3, 5);
  });

  it('never drops a high-priority sound in favour of footsteps; steals the lowest priority', () => {
    const pool = new VoicePool<string>({ cap: 4, lowCap: 10, burstMax: 100 });
    for (let i = 0; i < 4; i++) {
      const a = pool.admit('footstep' + i, 0, 1, i * 0.001);
      expect(a.kind).toBe('play');
      pool.commit('footstep' + i, 0, i * 0.001, 10, 0.3, 'step' + i);
    }
    const a = pool.admit('explosion_big', 9, 2, 0.01);
    expect(a.kind).toBe('play');
    if (a.kind !== 'play') return;
    expect(a.steal).not.toBeNull();
    expect(a.steal?.priority).toBe(0);
    // A footstep cannot evict anything of higher priority once the pool is all explosions.
    const big = new VoicePool<null>({ cap: 2, burstMax: 100 });
    big.commit('explosion_big', 9, 0, 10, 1, null);
    big.commit('player_hurt', 10, 0, 10, 1, null);
    const f = big.admit('footstep', 0, 1, 0.1);
    expect(f.kind).toBe('drop');
  });

  it('caps low-priority voices so they cannot fill the pool', () => {
    const pool = new VoicePool<null>({ cap: 32, lowCap: 3, burstMax: 100 });
    let played = 0;
    for (let i = 0; i < 10; i++) {
      const name = 'low' + i; // distinct names: no per-sound limiting / merging
      const a = pool.admit(name, 1, 5, i);
      if (a.kind === 'play') {
        played++;
        pool.commit(name, 1, i, 1000, 0.2, null);
      }
    }
    expect(played).toBe(3);
    // High priority still fine.
    expect(pool.admit('perk_pick', 8, 1, 20).kind).toBe('play');
  });

  it('per-sound polyphony: protected sounds recycle their oldest instance, others merge', () => {
    const pool = new VoicePool<null>({ burstMax: 100 });
    for (let i = 0; i < 3; i++) {
      const a = pool.admit('explosion_big', 9, 5, i);
      expect(a.kind).toBe('play');
      pool.commit('explosion_big', 9, i, 100, 1, null);
    }
    const a = pool.admit('explosion_big', 9, 5, 5, 3);
    expect(a.kind).toBe('play');
    if (a.kind === 'play') expect(a.steal?.start).toBe(0);
    for (let i = 0; i < 2; i++) pool.commit('dig', 2, i, 100, 1, null);
    expect(pool.admit('dig', 2, 5, 10, 2).kind).toBe('merge');
  });

  it('reaps finished voices', () => {
    const pool = new VoicePool<number>();
    pool.commit('a', 1, 0, 1, 1, 1);
    pool.commit('b', 1, 0, 2, 1, 2);
    const removed: number[] = [];
    expect(pool.reap(1.5, (v) => removed.push(v.payload))).toBe(1);
    expect(removed).toEqual([1]);
    expect(pool.size).toBe(1);
  });
});

describe('spatialize', () => {
  const L = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  it('is silent beyond ~140 units and louder when closer', () => {
    expect(distanceGain(MAX_AUDIBLE_DISTANCE + 1, 1000)).toBe(0);
    expect(distanceGain(139.9, 140)).toBeLessThan(0.001);
    expect(distanceGain(1, 140)).toBe(1);
    expect(distanceGain(20, 140)).toBeGreaterThan(distanceGain(60, 140));
    expect(spatialize(L, 0, 0, -200, 140).gain).toBe(0);
  });
  it('pans right for +X when looking down -Z, and follows yaw', () => {
    expect(spatialize(L, 20, 0, 0, 140).pan).toBeGreaterThan(0.5);
    expect(spatialize(L, -20, 0, 0, 140).pan).toBeLessThan(-0.5);
    expect(Math.abs(spatialize(L, 0, 0, -20, 140).pan)).toBeLessThan(1e-6);
    // Turn left 90° (yaw +π/2 looks toward -X): a source at -X is now straight ahead.
    const turned = { ...L, yaw: Math.PI / 2 };
    expect(Math.abs(spatialize(turned, -20, 0, 0, 140).pan)).toBeLessThan(1e-6);
    expect(spatialize(turned, 0, 0, -20, 140).pan).toBeGreaterThan(0.5); // old forward is now on the right
  });
  it('muffles sources behind the listener', () => {
    const front = spatialize(L, 0, 0, -10, 140).cutoff;
    const back = spatialize(L, 0, 0, 10, 140).cutoff;
    expect(back).toBeLessThan(front);
  });
});

// ---------------------------------------------------------------------------------------------
// Manager in plain Node (no Web Audio): everything must be a silent no-op
// ---------------------------------------------------------------------------------------------

describe('AudioManager without Web Audio', () => {
  it('is a safe no-op', () => {
    const m = new AudioManager();
    expect(() => {
      m.setListener(1, 2, 3, 0.5, 0.1);
      m.setVolumes(1, 1, 1);
      for (const n of SOUND_NAMES) m.play(n, { x: 1, y: 2, z: 3, volume: 1, pitch: 1.2 });
      for (const k of LOOP_KEYS) m.setLoop(k, 1, 0, 0, 0);
      m.setAmbience('mines');
      m.update(1 / 60);
      m.unlock();
      m.play('explosion_big');
      m.update(1 / 60);
    }).not.toThrow();
    expect(m.ready).toBe(false);
    expect(m.stats.voices).toBe(0);
    expect(m.stats.dropped).toBe(0);
    expect(audio).toBeInstanceOf(AudioManager);
  });

  it('defines a spec for every sound name', () => {
    expect(SOUND_NAMES.length).toBe(58);
    for (const n of SOUND_NAMES) {
      const s = SOUND_SPECS[n];
      expect(s.range).toBeLessThanOrEqual(140);
      expect(s.vol).toBeGreaterThan(0);
    }
    expect(SOUND_SPECS.explosion_big.pri).toBeGreaterThan(SOUND_SPECS.footstep.pri);
    expect(SOUND_SPECS.player_hurt.pri).toBeGreaterThan(SOUND_SPECS.impact_small.pri);
  });
});

// ---------------------------------------------------------------------------------------------
// Manager against a strict fake AudioContext: exercises every recipe / loop / bed and validates
// the automation calls the browser would otherwise reject or silently mis-render.
// ---------------------------------------------------------------------------------------------

const violations: string[] = [];
let nodeCount = 0;
function bad(msg: string): void {
  violations.push(msg);
}
function num(v: unknown, what: string): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${what}: non-finite ${String(v)}`);
}

class FParam {
  last: number;
  constructor(public value: number) {
    this.last = value;
  }
  setValueAtTime(v: number, t: number): this {
    num(v, 'setValueAtTime.v');
    num(t, 'setValueAtTime.t');
    if (t < 0) bad('negative time');
    this.last = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    num(v, 'linearRamp.v');
    num(t, 'linearRamp.t');
    this.last = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    num(v, 'expRamp.v');
    num(t, 'expRamp.t');
    if (v <= 0) bad(`expRamp to non-positive ${v}`);
    if (this.last === 0) bad('expRamp from zero (would hold at 0)');
    if (Math.sign(v) !== Math.sign(this.last)) bad('expRamp across sign');
    this.last = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    num(v, 'setTarget.v');
    num(t, 'setTarget.t');
    num(tc, 'setTarget.tc');
    if (tc <= 0) bad('setTarget with non-positive time constant');
    this.last = v;
    return this;
  }
  cancelScheduledValues(t: number): this {
    num(t, 'cancel.t');
    return this;
  }
  setValueCurveAtTime(): this {
    return this;
  }
}

class FNode {
  constructor() {
    nodeCount++;
  }
  connect<T>(dest: T): T {
    if (!(dest instanceof FNode) && !(dest instanceof FParam)) bad('connect to non-node');
    return dest;
  }
  disconnect(): void {}
}
class FGain extends FNode {
  gain = new FParam(1);
}
class FBiquad extends FNode {
  type = 'lowpass';
  frequency = new FParam(350);
  Q = new FParam(1);
  gain = new FParam(0);
  detune = new FParam(0);
}
class FSource extends FNode {
  started = false;
  stopped = false;
  onended: null | (() => void) = null;
  start(t = 0): void {
    num(t, 'start.t');
    if (this.started) bad('start called twice');
    this.started = true;
  }
  stop(t = 0): void {
    num(t, 'stop.t');
    if (!this.started) bad('stop before start');
    this.stopped = true;
  }
}
class FOsc extends FSource {
  type = 'sine';
  frequency = new FParam(440);
  detune = new FParam(0);
}
class FBuffer {
  private readonly data: Float32Array;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}
class FBufSrc extends FSource {
  buffer: FBuffer | null = null;
  loop = false;
  playbackRate = new FParam(1);
  detune = new FParam(0);
}
class FShaper extends FNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}
class FPanner extends FNode {
  pan = new FParam(0);
}
class FDelay extends FNode {
  delayTime = new FParam(0);
}
class FComp extends FNode {
  threshold = new FParam(-24);
  knee = new FParam(30);
  ratio = new FParam(12);
  attack = new FParam(0.003);
  release = new FParam(0.25);
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'suspended';
  destination = new FNode();
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  addEventListener(): void {}
  createGain(): FGain {
    return new FGain();
  }
  createBiquadFilter(): FBiquad {
    return new FBiquad();
  }
  createOscillator(): FOsc {
    return new FOsc();
  }
  createBufferSource(): FBufSrc {
    return new FBufSrc();
  }
  createBuffer(ch: number, len: number, sr: number): FBuffer {
    if (len < 1) bad('empty buffer');
    return new FBuffer(ch, len, sr);
  }
  createWaveShaper(): FShaper {
    return new FShaper();
  }
  createStereoPanner(): FPanner {
    return new FPanner();
  }
  createDelay(): FDelay {
    return new FDelay();
  }
  createDynamicsCompressor(): FComp {
    return new FComp();
  }
  createChannelMerger(): FNode {
    return new FNode();
  }
}

describe('AudioManager with a (fake) AudioContext', () => {
  const g = globalThis as unknown as { AudioContext?: unknown };
  afterEach(() => {
    delete g.AudioContext;
    violations.length = 0;
  });

  function boot(): { m: AudioManager; ctx: () => FakeAudioContext } {
    let created: FakeAudioContext | null = null;
    g.AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        created = this;
      }
    };
    const m = new AudioManager();
    m.unlock();
    m.unlock(); // idempotent
    expect(created).not.toBeNull();
    return { m, ctx: () => created as unknown as FakeAudioContext };
  }

  function step(m: AudioManager, ctx: FakeAudioContext, seconds: number): void {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i++) {
      ctx.currentTime += 1 / 60;
      m.update(1 / 60);
    }
  }

  it('unlocks, renders every sound with valid automation and reaps voices', () => {
    const { m, ctx } = boot();
    expect(m.ready).toBe(true);
    for (const n of SOUND_NAMES) {
      const before = nodeCount;
      m.play(n);
      m.play(n, { x: 10, y: 0, z: -5, pitch: 1.3, volume: 0.7 });
      expect(nodeCount - before, `${n} built nothing`).toBeGreaterThan(0);
      step(m, ctx(), 0.1);
    }
    expect(violations).toEqual([]);
    step(m, ctx(), 10);
    expect(m.stats.voices).toBe(0);
  });

  it('survives impact spam without exceeding caps', () => {
    const { m, ctx } = boot();
    for (let f = 0; f < 60; f++) {
      for (let i = 0; i < 20; i++) m.play('impact_small', { x: i, y: 0, z: -10 });
      m.play('explosion_small', { x: 5, y: 0, z: -20 });
      step(m, ctx(), 1 / 60);
      expect(m.stats.voices).toBeLessThanOrEqual(32);
    }
    expect(m.stats.merged).toBeGreaterThan(900);
    // The important sound still gets through at a full pool.
    for (let i = 0; i < 40; i++) m.play('footstep');
    const dropped = m.stats.dropped;
    m.play('player_hurt');
    expect(m.stats.dropped).toBe(dropped);
    expect(violations).toEqual([]);
  });

  it('culls distant positional sounds before allocating nodes', () => {
    const { m } = boot();
    m.setListener(0, 0, 0, 0, 0);
    const before = nodeCount;
    m.play('explosion_big', { x: 500, y: 0, z: 0 });
    expect(nodeCount).toBe(before);
    expect(m.stats.culled).toBe(1);
  });

  it('runs every loop and ambience bed, crossfades and tears down cleanly', () => {
    const { m, ctx } = boot();
    for (const id of [...Object.keys(BEDS), 'none', 'bogus', 'mines']) {
      m.setAmbience(id);
      for (let f = 0; f < 60 * 4; f++) {
        for (const k of LOOP_KEYS) m.setLoop(k, (f % 60) / 60, 3, 0, -3);
        step(m, ctx(), 1 / 60);
      }
      // ~40 s per bed so the sparse one-shots and evolution get exercised.
      step(m, ctx(), 40);
    }
    // Loops not refreshed fade out by themselves.
    step(m, ctx(), 5);
    expect(violations).toEqual([]);
  });
});
