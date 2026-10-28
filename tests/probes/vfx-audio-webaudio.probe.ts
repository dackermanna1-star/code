// Probe: Babylon 9 audio (does Engine create an AudioContext? legacy Sound, AudioEngineV2) and a raw Web Audio
// pipeline: modal synthesis into Float32Array, HRTF panner -> lowpass -> convolver send -> compressor graph,
// OfflineAudioContext render timings, decodeAudioData of OGG Vorbis.
import { Engine, Scene, AbstractEngine, Sound, CreateAudioEngineAsync, CreateSoundAsync, CreateSoundBufferAsync, Vector3 } from "@babylonjs/core";
import { TONE440_OGG_B64 } from "./vfx-audio-tone440.ts";
import { r3, tick } from "./vfx-audio-util.ts";

// all OGG assets in the repo at build time (Vite copies them into dist and gives URLs)
const oggUrls = import.meta.glob("../../public/assets/sounds/**/*.ogg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

// ------------------------------------------------------------------ synthesis
interface Mode {
  f: number; // Hz
  a: number; // amplitude
  t60: number; // seconds to decay by 60 dB
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sum of exponentially decaying sinusoids via a complex rotation per mode (no Math.sin in the loop),
 *  plus a short noise burst (contact transient). Writes into `out` (e.g. AudioBuffer.getChannelData(0)). */
function synthModal(out: Float32Array, sr: number, modes: Mode[], noiseAmp: number, noiseMs: number, seed: number): void {
  out.fill(0);
  const n = out.length;
  for (const m of modes) {
    if (m.f >= sr * 0.45) continue; // avoid aliasing
    const w = (2 * Math.PI * m.f) / sr;
    const r = Math.exp(-6.907755 / (m.t60 * sr)); // ln(1000) = 6.9078 -> -60 dB after t60
    const c = Math.cos(w) * r, s = Math.sin(w) * r;
    let re = 0, im = m.a; // y = im (phase 90 deg: starts at +a, i.e. cosine-like strike)
    // amplitude after k samples = a*r^k -> stop when below -100 dB of a
    const stop = Math.min(n, Math.ceil(Math.log(1e-5) / Math.log(r)));
    for (let i = 0; i < stop; i++) {
      out[i] += im;
      const nre = re * c - im * s;
      im = re * s + im * c;
      re = nre;
    }
  }
  // contact noise: white noise with exponential decay
  const rand = rng(seed);
  const k = Math.exp(-1 / ((noiseMs / 1000) * sr));
  let env = noiseAmp;
  for (let i = 0; i < n && env > 1e-4; i++) {
    out[i] += (rand() * 2 - 1) * env;
    env *= k;
  }
  // 1 ms attack ramp (avoid click), peak normalise to 0.9
  const ramp = Math.min(n, Math.round(sr * 0.001));
  for (let i = 0; i < ramp; i++) out[i] *= i / ramp;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < n; i++) out[i] *= g;
  }
}

/** Reference implementation with Math.sin/Math.exp per sample (to show why the rotation form matters). */
function synthModalNaive(out: Float32Array, sr: number, modes: Mode[]): void {
  out.fill(0);
  for (const m of modes) {
    const w = (2 * Math.PI * m.f) / sr;
    const d = 6.907755 / (m.t60 * sr);
    for (let i = 0; i < out.length; i++) out[i] += m.a * Math.exp(-d * i) * Math.cos(w * i);
  }
}

function randomModes(rand: () => number, count: number, f0: number): Mode[] {
  const modes: Mode[] = [];
  for (let k = 0; k < count; k++) {
    const ratio = 1 + k * (0.8 + rand() * 1.6) + rand() * 0.3; // inharmonic partial ratios
    modes.push({ f: f0 * ratio, a: 1 / (1 + k * 0.7), t60: 0.08 + rand() * 1.2 / (1 + k * 0.4) });
  }
  return modes;
}

function rms(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
}

function zeroCrossFreq(a: Float32Array, sr: number, from: number, to: number): number {
  let zc = 0;
  for (let i = from + 1; i < to; i++) if ((a[i - 1] < 0 && a[i] >= 0)) zc++;
  return (zc * sr) / (to - from);
}

/** Exponentially decaying stereo noise IR (decorrelated L/R), pure JS. */
function makeIrJs(ctxRate: number, seconds: number, rt60: number): AudioBuffer {
  const len = Math.round(seconds * ctxRate);
  const buf = new AudioBuffer({ length: len, sampleRate: ctxRate, numberOfChannels: 2 });
  const k = Math.exp(-6.907755 / (rt60 * ctxRate));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rand = rng(77 + ch);
    let env = 1, lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.35 * ((rand() * 2 - 1) - lp); // one-pole lowpass (darker tail)
      d[i] = lp * env;
      env *= k;
    }
  }
  return buf;
}

export async function probe(): Promise<any> {
  const out: any = {};

  // ================================================================ A) does Babylon create an AudioContext?
  console.log("[va] section A", performance.now().toFixed(0));
  const RealAC = window.AudioContext;
  let acCount = 0;
  class CountingAC extends RealAC {
    constructor(o?: AudioContextOptions) {
      super(o);
      acCount++;
    }
  }
  (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = CountingAC;
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true }); // same options as src/main.ts
  const scene = new Scene(engine);
  out.babylonDefaultEngine = { audioContextsCreated: acCount, AbstractEngine_audioEngine: AbstractEngine.audioEngine ? "created" : null };
  const legacy = new Sound("legacy", new ArrayBuffer(16), scene);
  await tick(20);
  out.legacySoundWithoutAudioEngine = { isReady: legacy.isReady(), isPlaying: legacy.isPlaying };
  // opt-in legacy audio engine
  const c2 = document.createElement("canvas");
  const before = acCount;
  const e2 = new Engine(c2, false, { audioEngine: true });
  out.engineWithAudioEngineTrue = {
    audioContextsCreated: acCount - before,
    AbstractEngine_audioEngine: AbstractEngine.audioEngine ? "created" : null,
    ctxState: AbstractEngine.audioEngine?.audioContext?.state ?? null,
  };
  AbstractEngine.audioEngine?.dispose();
  AbstractEngine.audioEngine = null;
  e2.dispose();
  (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = RealAC;

  // ================================================================ B) our own AudioContext
  console.log("[va] section B", performance.now().toFixed(0));
  const ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 44100 });
  if (ctx.state !== "running") await Promise.race([ctx.resume(), tick(1000)]);
  out.context = { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: r3(ctx.baseLatency), outputLatency: r3(ctx.outputLatency ?? NaN), listenerHasAudioParams: "positionX" in ctx.listener, currentTime0: r3(ctx.currentTime) };
  // Pre-warm the HRTF database on the REALTIME context (silent source -> HRTF panner). Without this, the page's
  // first HRTF PannerNode inside an OfflineAudioContext sometimes never finishes rendering (2/6 runs hung).
  {
    const osc = new OscillatorNode(ctx, { frequency: 440 });
    const mute = new GainNode(ctx, { gain: 0 });
    osc.connect(mute).connect(new PannerNode(ctx, { panningModel: "HRTF", positionX: 1 })).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }
  await tick(1000);
  out.context.currentTimeAfter1s = r3(ctx.currentTime);

  // ================================================================ C) synthesis budget: 150 buffers, 0.3-1.5 s, 12 modes
  console.log("[va] section C", performance.now().toFixed(0));
  {
    const rand = rng(42);
    const specs = Array.from({ length: 150 }, (_, i) => ({ dur: 0.3 + (1.2 * i) / 149, f0: 120 + rand() * 2500, seed: i }));
    let samples = 0;
    const t0 = performance.now();
    const bank: AudioBuffer[] = [];
    for (const sp of specs) {
      const len = Math.round(sp.dur * ctx.sampleRate);
      const buf = new AudioBuffer({ length: len, sampleRate: ctx.sampleRate, numberOfChannels: 1 });
      synthModal(buf.getChannelData(0), ctx.sampleRate, randomModes(rand, 12, sp.f0), 0.3, 6, sp.seed);
      bank.push(buf);
      samples += len;
    }
    const ms = performance.now() - t0;
    // naive Math.exp/Math.cos version on 10 of them, extrapolated
    const t1 = performance.now();
    let naiveSamples = 0;
    for (let i = 0; i < 10; i++) {
      const sp = specs[i * 15];
      const a = new Float32Array(Math.round(sp.dur * ctx.sampleRate));
      synthModalNaive(a, ctx.sampleRate, randomModes(rand, 12, sp.f0));
      naiveSamples += a.length;
    }
    const naiveMs = performance.now() - t1;
    out.synthesis = {
      buffers: bank.length,
      totalAudioSeconds: r3(samples / ctx.sampleRate),
      totalMs: r3(ms),
      msPerAudioSecond: r3(ms / (samples / ctx.sampleRate)),
      memoryMB: r3((samples * 4) / 1048576),
      naiveMsPerAudioSecond: r3(naiveMs / (naiveSamples / ctx.sampleRate)),
      naiveExtrapolatedFor150Ms: r3((naiveMs / naiveSamples) * samples),
    };
    (out as any)._bank = bank;
  }
  const bank = (out as any)._bank as AudioBuffer[];
  delete (out as any)._bank;

  // the 0.5 s modal impact for the live graph
  const impact = new AudioBuffer({ length: Math.round(0.5 * ctx.sampleRate), sampleRate: ctx.sampleRate, numberOfChannels: 1 });
  synthModal(impact.getChannelData(0), ctx.sampleRate, [
    { f: 523, a: 1, t60: 0.45 }, { f: 1187, a: 0.6, t60: 0.3 }, { f: 2011, a: 0.45, t60: 0.2 }, { f: 3150, a: 0.3, t60: 0.12 },
    { f: 4420, a: 0.2, t60: 0.08 }, { f: 6100, a: 0.12, t60: 0.05 },
  ], 0.5, 5, 9);

  // ================================================================ D) reverb IR: pure JS vs OfflineAudioContext
  console.log("[va] section D", performance.now().toFixed(0));
  let tIr = performance.now();
  const irJs = makeIrJs(ctx.sampleRate, 2, 1.2);
  const irJsMs = performance.now() - tIr;
  tIr = performance.now();
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: 2 * ctx.sampleRate, sampleRate: ctx.sampleRate });
  {
    const noise = new AudioBuffer({ length: 2 * ctx.sampleRate, sampleRate: ctx.sampleRate, numberOfChannels: 2 });
    for (let ch = 0; ch < 2; ch++) {
      const d = noise.getChannelData(ch);
      const rand = rng(5 + ch);
      for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
    }
    const src = new AudioBufferSourceNode(off, { buffer: noise });
    const env = new GainNode(off, { gain: 1 });
    env.gain.setValueAtTime(1, 0);
    env.gain.exponentialRampToValueAtTime(0.001, 1.2); // RT60 = 1.2 s
    const lp = new BiquadFilterNode(off, { type: "lowpass", frequency: 9000, Q: 0.5 });
    lp.frequency.setValueAtTime(9000, 0);
    lp.frequency.exponentialRampToValueAtTime(1500, 2); // high frequencies decay faster
    src.connect(env).connect(lp).connect(off.destination);
    src.start();
  }
  const irOff = await off.startRendering();
  const irOffMs = performance.now() - tIr;
  out.reverbIR = { jsMs: r3(irJsMs), offlineMs: r3(irOffMs), offlineLength: irOff.length, offlineChannels: irOff.numberOfChannels, offlineRms: r3(rms(irOff.getChannelData(0))) };

  // ================================================================ E) layered shatter rendered offline
  console.log("[va] section E", performance.now().toFixed(0));
  {
    const t = performance.now();
    const len = Math.round(1.5 * ctx.sampleRate);
    const oc = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: ctx.sampleRate });
    const tink = new AudioBuffer({ length: Math.round(0.15 * ctx.sampleRate), sampleRate: ctx.sampleRate, numberOfChannels: 1 });
    synthModal(tink.getChannelData(0), ctx.sampleRate, [{ f: 3200, a: 1, t60: 0.1 }, { f: 5100, a: 0.6, t60: 0.07 }, { f: 7300, a: 0.4, t60: 0.05 }], 0.2, 2, 3);
    const bus = new GainNode(oc, { gain: 0.5 });
    bus.connect(oc.destination);
    const rand = rng(99);
    for (let g = 0; g < 60; g++) {
      const s = new AudioBufferSourceNode(oc, { buffer: tink, playbackRate: 0.7 + rand() * 1.3 });
      const gg = new GainNode(oc, { gain: 0.2 + rand() * 0.8 });
      const p = new StereoPannerNode(oc, { pan: rand() * 2 - 1 });
      s.connect(gg).connect(p).connect(bus);
      s.start(-Math.log(1 - rand() * 0.99) * 0.15); // exponential grain density
    }
    // noise crash through a bandpass + low thud
    const nb = new AudioBuffer({ length: Math.round(0.4 * ctx.sampleRate), sampleRate: ctx.sampleRate, numberOfChannels: 1 });
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (rand() * 2 - 1) * Math.exp(-i / (0.06 * ctx.sampleRate));
    const ns = new AudioBufferSourceNode(oc, { buffer: nb });
    const bp = new BiquadFilterNode(oc, { type: "bandpass", frequency: 4500, Q: 0.8 });
    ns.connect(bp).connect(bus);
    ns.start(0);
    const thud = new OscillatorNode(oc, { type: "sine", frequency: 85 });
    const tg = new GainNode(oc, { gain: 0 });
    tg.gain.setValueAtTime(0.8, 0);
    tg.gain.exponentialRampToValueAtTime(0.001, 0.25);
    thud.connect(tg).connect(bus);
    thud.start(0);
    thud.stop(0.3);
    const rendered = await oc.startRendering();
    out.layeredShatter = { ms: r3(performance.now() - t), seconds: 1.5, grains: 60, rmsL: r3(rms(rendered.getChannelData(0))) };
  }

  // ================================================================ F) N voices offline (audio-thread load estimate)
  console.log("[va] section F", performance.now().toFixed(0));
  {
    // warm-up: the first HRTF PannerNode render pays a one-time HRTF database load
    const t = performance.now();
    const oc = new OfflineAudioContext({ numberOfChannels: 2, length: 4410, sampleRate: ctx.sampleRate });
    const s = new AudioBufferSourceNode(oc, { buffer: impact });
    s.connect(new PannerNode(oc, { panningModel: "HRTF", positionX: 1 })).connect(oc.destination);
    s.start(0);
    console.log("[va] warmup start");
    await Promise.race([oc.startRendering(), tick(10000).then(() => { throw new Error("offline HRTF render hung"); })]);
    out.hrtfWarmupMs = r3(performance.now() - t);
    console.log("[va] warmup done", out.hrtfWarmupMs);
  }
  for (const cfg of [
    { model: "HRTF", reverb: true, n: 48 },
    { model: "equalpower", reverb: true, n: 48 },
    { model: "HRTF", reverb: false, n: 48 },
    { model: "equalpower", reverb: false, n: 48 },
    { model: "HRTF", reverb: true, n: 24 },
  ] as const) {
    const t = performance.now();
    const secs = 2;
    const oc = new OfflineAudioContext({ numberOfChannels: 2, length: secs * ctx.sampleRate, sampleRate: ctx.sampleRate });
    const comp = new DynamicsCompressorNode(oc, { threshold: -12, knee: 6, ratio: 8, attack: 0.003, release: 0.15 });
    comp.connect(oc.destination);
    const revSend = new GainNode(oc, { gain: 0.25 });
    if (cfg.reverb) {
      const rev = new ConvolverNode(oc, { buffer: irJs }); // 2 s stereo IR
      revSend.connect(rev).connect(comp);
    }
    const rand = rng(1);
    for (let v = 0; v < cfg.n; v++) {
      const s = new AudioBufferSourceNode(oc, { buffer: bank[v % bank.length], loop: true, playbackRate: 0.8 + rand() * 0.4 });
      const gn = new GainNode(oc, { gain: 0.1 });
      const lp = new BiquadFilterNode(oc, { type: "lowpass", frequency: 800 + rand() * 8000 });
      const pn = new PannerNode(oc, { panningModel: cfg.model, distanceModel: "inverse", refDistance: 1, rolloffFactor: 1, positionX: rand() * 10 - 5, positionY: 1, positionZ: rand() * 10 - 5 });
      s.connect(gn).connect(lp).connect(pn);
      pn.connect(comp);
      if (cfg.reverb) pn.connect(revSend);
      s.start(0);
    }
    console.log("[va] render", cfg.model, cfg.reverb, cfg.n);
    await oc.startRendering();
    const ms = performance.now() - t;
    console.log("[va] rendered", ms.toFixed(0));
    out["voices" + cfg.n + "_" + cfg.model + (cfg.reverb ? "_reverb" : "_dry")] = { renderMsFor2s: r3(ms), realtimeFactor: r3((secs * 1000) / ms) };
  }
  {
    // the 2 s convolver alone (one input)
    const t = performance.now();
    const oc = new OfflineAudioContext({ numberOfChannels: 2, length: 2 * ctx.sampleRate, sampleRate: ctx.sampleRate });
    const s = new AudioBufferSourceNode(oc, { buffer: bank[0], loop: true });
    const rev = new ConvolverNode(oc, { buffer: irJs });
    s.connect(rev).connect(oc.destination);
    s.start(0);
    await oc.startRendering();
    const ms = performance.now() - t;
    out.convolver2sAlone = { renderMsFor2s: r3(ms), realtimeFactor: r3(2000 / ms) };
  }

  // ================================================================ G) live graph: voice -> lowpass -> HRTF panner -> dry/comp + reverb send
  console.log("[va] section G", performance.now().toFixed(0));
  {
    const comp = new DynamicsCompressorNode(ctx, { threshold: -12, knee: 6, ratio: 8, attack: 0.003, release: 0.15 });
    const master = new GainNode(ctx, { gain: 0.8 });
    const analyser = new AnalyserNode(ctx, { fftSize: 2048 });
    comp.connect(master).connect(analyser).connect(ctx.destination);
    const reverb = new ConvolverNode(ctx, { buffer: irOff }); // normalize: true by default
    const reverbSend = new GainNode(ctx, { gain: 0.35 });
    reverbSend.connect(reverb).connect(comp);
    // listener (AudioParam API)
    const L = ctx.listener;
    L.positionX.value = 0; L.positionY.value = 1.7; L.positionZ.value = 0;
    L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = 1; // Babylon is left-handed; see notes on axis mapping
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    const src = new AudioBufferSourceNode(ctx, { buffer: impact, playbackRate: 1.03 });
    const vGain = new GainNode(ctx, { gain: 0.9 });
    const occl = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2500, Q: 0.707 }); // occlusion
    const pan = new PannerNode(ctx, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 1, maxDistance: 60, rolloffFactor: 1.2, positionX: 1.5, positionY: 1.2, positionZ: 2.5 });
    src.connect(vGain).connect(occl).connect(pan);
    pan.connect(comp);
    pan.connect(reverbSend);
    let endedAt = -1;
    const startT = ctx.currentTime;
    const ended = new Promise<void>((res) => (src.onended = () => { endedAt = ctx.currentTime; res(); }));
    src.start();
    await tick(120);
    const td = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(td);
    const rmsDuring = rms(td);
    await Promise.race([ended, tick(3000)]);
    await tick(1500); // let the reverb tail die
    analyser.getFloatTimeDomainData(td);
    out.liveGraph = { rmsWhilePlaying: r3(rmsDuring), endedAfterSec: endedAt >= 0 ? r3(endedAt - startT) : null, rmsAfterTail: r3(rms(td)), compressorReductionDb: r3(comp.reduction), state: ctx.state };
  }

  // ================================================================ H) decodeAudioData of OGG Vorbis
  console.log("[va] section H", performance.now().toFixed(0));
  {
    const bin = Uint8Array.from(atob(TONE440_OGG_B64), (c) => c.charCodeAt(0));
    const t = performance.now();
    const ab = await ctx.decodeAudioData(bin.buffer.slice(0));
    const d = ab.getChannelData(0);
    out.decodeEmbeddedVorbis = {
      ms: r3(performance.now() - t),
      duration: r3(ab.duration),
      sampleRate: ab.sampleRate,
      channels: ab.numberOfChannels,
      zeroCrossHz: r3(zeroCrossFreq(d, ab.sampleRate, 2000, d.length - 2000)),
      rms: r3(rms(d)),
    };
    const urls = Object.values(oggUrls);
    let ok = 0, fail = 0, totalSec = 0;
    const failures: string[] = [];
    const tAll = performance.now();
    let fetchMs = 0;
    const sample = urls.slice(0, 120);
    for (const u of sample) {
      try {
        const tf = performance.now();
        const resp = await fetch(u);
        const buf = await resp.arrayBuffer();
        fetchMs += performance.now() - tf;
        const audio = await ctx.decodeAudioData(buf);
        ok++;
        totalSec += audio.duration;
      } catch (e) {
        fail++;
        if (failures.length < 3) failures.push(u + ": " + String(e));
      }
    }
    out.decodeRepoOggs = { found: urls.length, decoded: ok, failed: fail, failures, audioSeconds: r3(totalSec), totalMs: r3(performance.now() - tAll), fetchMs: r3(fetchMs) };
    // parallel decode (decodeAudioData runs off the main thread)
    const tPar = performance.now();
    const bufs = await Promise.all(sample.slice(0, 40).map((u) => fetch(u).then((r) => r.arrayBuffer())));
    const tDec = performance.now();
    const res = await Promise.allSettled(bufs.map((b) => ctx.decodeAudioData(b)));
    out.decodeRepoOggs.parallel40 = { fetchMs: r3(tDec - tPar), decodeMs: r3(performance.now() - tDec), ok: res.filter((r) => r.status === "fulfilled").length };
  }

  // ================================================================ I) AudioEngineV2 sanity (on a separate context: dispose() closes it!)
  console.log("[va] section I", performance.now().toFixed(0));
  {
    const ctx2 = new AudioContext();
    const tv = performance.now();
    const v2 = await CreateAudioEngineAsync({ audioContext: ctx2, resumeOnInteraction: false, disableDefaultUI: true });
    const createMs = performance.now() - tv;
    const sb = await CreateSoundBufferAsync(impact, {}, v2);
    const snd = await CreateSoundAsync("v2impact", sb, { spatialEnabled: true, spatialPanningModel: "HRTF", spatialPosition: new Vector3(1, 0, 2), maxInstances: 4 }, v2);
    snd.play();
    snd.play({ volume: 0.5 }); // second instance shares the same spatial node / position
    await tick(50);
    const info: any = { createMs: r3(createMs), engineState: v2.state, soundState: snd.state, activeInstances: snd.activeInstancesCount, sameContext: (v2 as unknown as { _audioContext: AudioContext })._audioContext === ctx2 };
    v2.dispose();
    await tick(50);
    info.ctxStateAfterV2Dispose = ctx2.state;
    out.audioEngineV2 = info;
  }

  out.ourContextStillRunning = ctx.state;
  await ctx.close();
  engine.dispose();
  return out;
}
