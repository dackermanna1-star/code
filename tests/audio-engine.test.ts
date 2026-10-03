// Engine behaviour against a strict fake Web Audio implementation (node has none). The fake throws
// where real browsers throw (non-finite params, negative times, double start, bad buffers, ...),
// so any misuse shows up as an engine fault even though the public API swallows errors.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../src/audio/engine';
import { SFX_NAMES } from '../src/audio/sfx';
import { LOOP_NAMES } from '../src/audio/loops';

// ------------------------------------------------------------------------------------------------
// Fake Web Audio

const finite = (...xs: number[]) => {
  for (const x of xs) if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError(`non-finite value ${x}`);
};

class FakeParam {
  private v: number;
  constructor(v: number) {
    this.v = v;
  }
  get value(): number {
    return this.v;
  }
  set value(x: number) {
    finite(x);
    this.v = x;
  }
  setValueAtTime(v: number, t: number) {
    finite(v, t);
    if (t < 0) throw new RangeError('negative time');
    this.v = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    finite(v, t);
    if (t < 0) throw new RangeError('negative time');
    this.v = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    finite(v, t);
    if (v === 0 || t < 0) throw new RangeError('bad exponential ramp');
    this.v = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    finite(v, t, tc);
    if (t < 0 || tc < 0) throw new RangeError('bad setTargetAtTime');
    this.v = v;
    return this;
  }
  cancelScheduledValues(t: number) {
    finite(t);
    return this;
  }
  cancelAndHoldAtTime(t: number) {
    finite(t);
    return this;
  }
}

class FakeNode {
  outs = new Set<FakeNode>();
  constructor(readonly context: FakeCtx) {
    context.nodeCount++;
  }
  connect<T>(n: T): T {
    if (!(n instanceof FakeNode)) throw new TypeError('connect(): not an AudioNode');
    if (n.context !== this.context) throw new Error('InvalidAccessError: other context');
    this.outs.add(n);
    return n;
  }
  disconnect() {
    this.outs.clear();
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakePanner extends FakeNode {
  pan = new FakeParam(0);
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  reduction = 0;
}
class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}
class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  getFloatTimeDomainData(a: Float32Array) {
    a.fill(0);
  }
}
class FakeBuffer {
  private data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    if (!(length >= 1) || !(numberOfChannels >= 1) || sampleRate < 3000 || sampleRate > 768000) throw new Error('NotSupportedError: createBuffer');
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number) {
    return this.data[i];
  }
}
class FakeConvolver extends FakeNode {
  normalize = true;
  private buf: FakeBuffer | null = null;
  get buffer() {
    return this.buf;
  }
  set buffer(b: FakeBuffer | null) {
    if (b && b.sampleRate !== this.context.sampleRate) throw new Error('NotSupportedError: convolver rate');
    this.buf = b;
  }
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  startAt = -1;
  stopAt = Infinity;
  start(when = 0, offset = 0) {
    finite(when, offset);
    if (this.startAt >= 0) throw new Error('InvalidStateError: start() twice');
    if (when < 0 || offset < 0) throw new RangeError('negative start');
    this.startAt = when;
    this.context.sources.add(this);
  }
  stop(when = 0) {
    finite(when);
    if (this.startAt < 0) throw new Error('InvalidStateError: stop() before start()');
    if (when < 0) throw new RangeError('negative stop');
    this.stopAt = when;
  }
  get endTime(): number {
    const natural = this.loop || !this.buffer ? Infinity : this.startAt + this.buffer.duration / this.playbackRate.value;
    return Math.min(natural, this.stopAt);
  }
}

class FakeCtx {
  static instances: FakeCtx[] = [];
  static allowResume = true;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  nodeCount = 0;
  sources = new Set<FakeSource>();
  destination: FakeNode;
  private listeners: (() => void)[] = [];
  constructor(_opts?: unknown) {
    this.destination = new FakeNode(this);
    FakeCtx.instances.push(this);
  }
  createGain() {
    return new FakeGain(this);
  }
  createStereoPanner() {
    return new FakePanner(this);
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this);
  }
  createWaveShaper() {
    return new FakeShaper(this);
  }
  createConvolver() {
    return new FakeConvolver(this);
  }
  createAnalyser() {
    return new FakeAnalyser(this);
  }
  created = 0;
  createBufferSource() {
    this.created++;
    return new FakeSource(this);
  }
  /** started sources that carry real material (not the 1-sample iOS unlock blip) */
  real(): FakeSource[] {
    return [...this.sources].filter((s) => (s.buffer?.length ?? 0) > 1);
  }
  createBuffer(ch: number, len: number, sr: number) {
    return new FakeBuffer(ch, len, sr);
  }
  addEventListener(type: string, fn: () => void) {
    if (type === 'statechange') this.listeners.push(fn);
  }
  resume() {
    if (FakeCtx.allowResume && this.state !== 'running') {
      this.state = 'running';
      for (const f of this.listeners) f();
    }
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    for (const f of this.listeners) f();
    return Promise.resolve();
  }
  /** advance the audio clock, firing `onended` like a browser would */
  advance(dt: number) {
    if (this.state !== 'running') return;
    this.currentTime += dt;
    for (const s of [...this.sources]) {
      if (s.endTime <= this.currentTime) {
        this.sources.delete(s);
        s.onended?.();
      }
    }
  }
  /** sources that are audible right now */
  sounding(): FakeSource[] {
    return [...this.sources].filter((s) => s.startAt <= this.currentTime && s.stopAt > this.currentTime);
  }
}

// ------------------------------------------------------------------------------------------------

const g = globalThis as unknown as Record<string, unknown>;
let doc: { hidden: boolean; listeners: (() => void)[]; addEventListener(t: string, f: () => void): void };

beforeEach(() => {
  vi.useFakeTimers();
  FakeCtx.instances = [];
  FakeCtx.allowResume = true;
  doc = {
    hidden: false,
    listeners: [],
    addEventListener(t: string, f: () => void) {
      if (t === 'visibilitychange') this.listeners.push(f);
    },
  };
  g.window = { AudioContext: FakeCtx };
  g.document = doc;
});
afterEach(() => {
  vi.useRealTimers();
  delete g.window;
  delete g.document;
});

const ctxOf = () => FakeCtx.instances[FakeCtx.instances.length - 1];
/** lets both clocks run: timers (bank / scheduler) and the audio clock */
async function run(ms: number) {
  for (let t = 0; t < ms; t += 20) {
    ctxOf()?.advance(0.02);
    await vi.advanceTimersByTimeAsync(20);
  }
}
async function unlocked(): Promise<Engine> {
  const e = new Engine();
  e.unlock();
  await vi.advanceTimersByTimeAsync(0);
  expect(e.ready).toBe(true);
  return e;
}

describe('engine (fake Web Audio)', () => {
  it('is inert before unlock, and creates nothing until a gesture', () => {
    const e = new Engine();
    e.play('tap');
    e.voice('yum');
    e.startMusic();
    e.duckMusic(0.5, 1);
    e.setMasterVolume(0.4);
    expect(FakeCtx.instances.length).toBe(0);
    expect(e.ready).toBe(false);
    expect(e.debug().state).toBe('none');
    expect(e.faults).toBe(0);
  });

  it('loops requested before unlock start sounding once unlocked', async () => {
    const e = new Engine();
    const h = e.loop('sizzle', { volume: 0 });
    h.setVolume(0.6, 0.1);
    expect(h.playing).toBe(true);
    expect(e.debug().loops).toEqual(['sizzle:pending']);
    e.unlock();
    await run(600);
    expect(e.debug().loops).toEqual(['sizzle:on']);
    const loops = ctxOf().sounding().filter((s) => s.loop);
    expect(loops.length).toBe(2); // two layers
    // station-style per-frame updates
    for (let i = 0; i < 120; i++) {
      h.setVolume(i / 120, 0.1);
      h.setPitch(1 + i / 600, 0.1);
      await run(16);
    }
    h.stop(0.3);
    expect(h.playing).toBe(false);
    await run(500);
    expect(ctxOf().sounding().filter((s) => s.loop).length).toBe(0);
    expect(e.debug().loops).toEqual([]);
    expect(e.faults).toBe(0);
  });

  it('every loop starts and stops cleanly; unknown names give inert handles', async () => {
    const e = await unlocked();
    for (const n of LOOP_NAMES) {
      const h = e.loop(n, { volume: 0.7, pitch: 1.1, pan: -0.4 });
      await run(300);
      expect(e.debug().loops).toContain(`${n}:on`);
      h.stop(0.1);
      await run(200);
    }
    expect(ctxOf().sounding().length).toBe(0);
    const bad = (e.loop as (n: string) => { playing: boolean; stop(): void })('nope');
    expect(bad.playing).toBe(false);
    bad.stop();
    expect(e.faults).toBe(0);
  }, 30000);

  it('plays every one-shot with natural variation and stays within caps', async () => {
    const e = await unlocked();
    for (const n of SFX_NAMES) {
      e.play(n, { volume: 0.8, pitch: 1.05, pan: 0.3 });
      await run(20);
    }
    expect(e.debug().bank?.rendered).toBeGreaterThanOrEqual(SFX_NAMES.length);
    // the same sound many times in one instant is merged
    const before = ctxOf().sources.size;
    for (let i = 0; i < 12; i++) e.play('chop');
    expect(ctxOf().sources.size - before).toBeLessThanOrEqual(3);
    // per-sound cap (popcorn: 8) and global cap (24)
    await run(2500); // let the earlier sounds finish
    for (let i = 0; i < 40; i++) e.play('popcorn', { delay: i * 0.01 });
    const live = ctxOf().real().filter((s) => s.stopAt === Infinity);
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThanOrEqual(8); // popcorn's own cap
    for (let i = 0; i < 40; i++) e.play(SFX_NAMES[i], { delay: 0.5 + i * 0.01 });
    expect(ctxOf().real().filter((s) => s.stopAt === Infinity).length).toBeLessThanOrEqual(24); // global cap
    // pitch variation: repeated plays don't all use the same rate
    const rates = new Set<number>();
    for (let i = 0; i < 6; i++) {
      e.play('pop');
      await run(60);
      const src = [...ctxOf().sources].pop();
      if (src) rates.add(src.playbackRate.value);
    }
    expect(rates.size).toBeGreaterThan(1);
    await run(4000);
    expect(e.debug().oneShots).toBe(0);
    expect(e.faults).toBe(0);
  }, 30000);

  it("Mochi doesn't talk over herself, and ducks the music a little", async () => {
    const e = await unlocked();
    e.voice('yum');
    e.voice('wow'); // replaces 'yum' (both render on demand)
    await run(400);
    e.voice('giggle', { pitch: 1.2 });
    await run(50);
    const voices = () => ctxOf().sounding().filter((s) => !s.loop && s.stopAt === Infinity);
    expect(voices().length).toBe(1);
    expect(e.faults).toBe(0);
  });

  it('switches: sound off silences and ignores new sounds; music on/off', async () => {
    const e = await unlocked();
    e.setSfxEnabled(false);
    expect(e.sfxEnabled).toBe(false);
    const n0 = ctxOf().created;
    e.play('ding');
    e.voice('hi');
    await run(200);
    expect(ctxOf().created).toBe(n0);
    e.setSfxEnabled(true);
    e.startMusic();
    await run(3000);
    expect(e.debug().music.running).toBe(true);
    expect(e.debug().music.bars).toBeGreaterThan(0);
    e.duckMusic(0.6, 1.5);
    e.setMusicEnabled(false);
    expect(e.musicEnabled).toBe(false);
    expect(e.debug().music.running).toBe(false);
    await run(1000);
    expect(ctxOf().sounding().length).toBe(0);
    e.setMusicEnabled(true); // startMusic() was requested before: resumes
    await run(2000);
    expect(e.debug().music.running).toBe(true);
    e.setMasterVolume(0.3);
    expect(e.faults).toBe(0);
  }, 30000);

  it('music keeps scheduling bar after bar, with a bounded number of live notes', async () => {
    const e = await unlocked();
    e.startMusic();
    await run(20000);
    const d = e.debug();
    expect(d.music.bars).toBeGreaterThanOrEqual(7);
    expect(d.music.notes).toBeLessThan(200);
    expect(e.faults).toBe(0);
  }, 60000);

  it('autoplay blocked: nothing plays, nothing throws, the next gesture recovers', async () => {
    FakeCtx.allowResume = false;
    const e = new Engine();
    e.unlock();
    e.play('tap');
    e.startMusic();
    await run(500);
    expect(e.ready).toBe(false);
    expect(ctxOf().real().length).toBe(0);
    FakeCtx.allowResume = true;
    e.unlock();
    await run(2000);
    expect(e.ready).toBe(true);
    expect(e.debug().music.running).toBe(true);
    expect(e.faults).toBe(0);
  });

  it('pauses in the background and resumes when visible again', async () => {
    const e = await unlocked();
    doc.hidden = true;
    doc.listeners.forEach((f) => f());
    expect(ctxOf().state).toBe('suspended');
    doc.hidden = false;
    doc.listeners.forEach((f) => f());
    await vi.advanceTimersByTimeAsync(0);
    expect(ctxOf().state).toBe('running');
    expect(e.faults).toBe(0);
  });

  it('shrugs off garbage arguments', async () => {
    const e = await unlocked();
    const any = e as unknown as Record<string, (...a: unknown[]) => unknown>;
    any.play('tap', { volume: NaN, pitch: Infinity, pan: 'x', delay: -3 });
    any.play('tap', { volume: -1, pitch: 0, pan: 99, delay: 1e9 });
    any.play('constructor');
    any.play('__proto__');
    any.voice('toString', { pitch: NaN });
    any.voice('yum', { pitch: Infinity, volume: NaN });
    const h = any.loop('boil', { volume: NaN, pitch: -2, pan: Infinity }) as { setVolume: (...a: unknown[]) => void; setPitch: (...a: unknown[]) => void; stop: (...a: unknown[]) => void };
    await run(300);
    h.setVolume(NaN, NaN);
    h.setPitch(Infinity, -1);
    h.stop(NaN);
    any.duckMusic(Infinity, NaN);
    any.setMasterVolume(undefined);
    await run(500);
    expect(e.faults).toBe(0);
  });

  it('without Web Audio everything is inert', () => {
    g.window = {};
    const e = new Engine();
    e.unlock();
    e.play('tap');
    const h = e.loop('sizzle');
    expect(h.playing).toBe(false);
    expect(e.ready).toBe(false);
    expect(e.faults).toBe(0);
  });
});
