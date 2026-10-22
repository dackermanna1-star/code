// Sound bank: renders every recipe into AudioBuffers at startup. Synthesis runs
// in a small pool of Web Workers when available (Vite inlines the worker, so a
// single-file build keeps working) and otherwise on the main thread in short
// jobs that yield to the event loop. Banks are cached per sample rate and shared
// by every AudioSystem on the page (AudioBuffers are not tied to a context).
import { Rng } from './dsp.js';
import { jobSteps, listJobs } from './jobs.js';

const cache = new Map();

// A plain macrotask (not scheduler.yield, whose continuations outrank timers and
// would starve the game's own callbacks while we synthesise).
function yieldToEventLoop() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

export class SoundBank {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.sets = new Map();
    this.lastPick = new Map();
    this.impulse = null;
    this.stats = null;
    this.rng = new Rng(0x5eed);
  }

  add(r) {
    if (r.layer === 'ir') {
      this.impulse = makeBuffer(r.channels, r.rate);
      return;
    }
    let s = this.sets.get(r.key);
    if (!s) {
      s = { near: [], far: [] };
      this.sets.set(r.key, s);
    }
    const buffer = makeBuffer(r.channels, r.rate);
    s[r.layer][r.index] = { buffer, duration: buffer.duration, loopStart: r.loopStart ?? 0, loopEnd: r.loopEnd ?? 0 };
  }

  get(key) {
    return this.sets.get(key);
  }

  has(key) {
    return this.sets.has(key);
  }

  // Random variant that never repeats the previous pick of the same set.
  pick(key, layer = 'near') {
    const s = this.sets.get(key);
    const list = s && (s[layer].length ? s[layer] : s.near);
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    const id = `${key}|${layer}`;
    const last = this.lastPick.get(id) ?? -1;
    let i = this.rng.int(list.length - 1);
    if (i >= last) i++;
    this.lastPick.set(id, i);
    return list[i];
  }

  // Specific variant (used to pair jet_gun with its matching tail).
  variant(key, index, layer = 'near') {
    const s = this.sets.get(key);
    if (!s || !s[layer].length) return null;
    return s[layer][index % s[layer].length];
  }

  entries() {
    const out = [];
    for (const [key, s] of this.sets) {
      s.near.forEach((e, i) => out.push({ key, layer: 'near', index: i, ...e }));
      s.far.forEach((e, i) => out.push({ key, layer: 'far', index: i, ...e }));
    }
    return out;
  }
}

function makeBuffer(channels, sampleRate) {
  const buffer = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate });
  channels.forEach((data, i) => buffer.copyToChannel(data, i));
  return buffer;
}

async function spawnWorkers(count) {
  if (typeof Worker === 'undefined' || count < 1) return [];
  try {
    // Vite turns this into an inlined (base64/blob) worker in builds and a module worker in dev.
    const mod = await import('./synthWorker.js?worker&inline');
    if (typeof mod.default !== 'function') return [];
    const workers = [];
    for (let i = 0; i < count; i++) workers.push(new mod.default());
    return workers;
  } catch {
    return [];
  }
}

// Work queue over the pool; resolves with the jobs that could not be run in a worker.
function runPool(workers, jobs, onResult) {
  return new Promise((resolve) => {
    let next = 0;
    let active = 0;
    const failed = [];
    const finishIfDone = () => {
      if (active === 0 && (next >= jobs.length || workers.every((w) => w.dead))) {
        for (; next < jobs.length; next++) failed.push(jobs[next]);
        resolve(failed);
      }
    };
    const assign = (w) => {
      if (w.dead || next >= jobs.length) {
        finishIfDone();
        return;
      }
      w.job = jobs[next++];
      active++;
      w.postMessage({ id: w.job.key, job: w.job });
    };
    for (const w of workers) {
      w.onmessage = (e) => {
        active--;
        if (e.data.ok) onResult(e.data);
        else failed.push(w.job);
        w.job = null;
        assign(w);
      };
      w.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        w.dead = true;
        if (w.job) {
          active--;
          failed.push(w.job);
          w.job = null;
        }
        finishIfDone();
      };
      assign(w);
    }
  });
}

async function build(ctxRate, onProgress, maxWorkers) {
  const bank = new SoundBank(ctxRate);
  const jobs = listJobs(ctxRate);
  const t0 = performance.now();
  const stats = { jobs: jobs.length, workerJobs: 0, mainJobs: 0, busyMs: 0, perKey: {} };
  let done = 0;
  const accept = (out, key) => {
    for (const r of out.results) bank.add(r);
    stats.busyMs += out.ms;
    stats.perKey[key] = out.ms;
    done++;
    if (onProgress) onProgress(done / jobs.length);
  };
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  const workers = await spawnWorkers(Math.max(0, Math.min(maxWorkers ?? 3, cores - 1)));
  stats.workers = workers.length;
  let remaining = jobs;
  if (workers.length) {
    remaining = await runPool(workers, jobs, (data) => {
      stats.workerJobs++;
      accept(data, data.results[0]?.key ?? '?');
    });
    for (const w of workers) w.terminate();
  }
  // Main-thread fallback: one buffer per step, yielding whenever ~8 ms have passed.
  let lastYield = performance.now();
  for (const job of remaining) {
    const steps = jobSteps(job);
    const results = [];
    let ms = 0;
    for (;;) {
      const s0 = performance.now();
      const step = steps.next();
      ms += performance.now() - s0;
      if (step.done) break;
      results.push(step.value);
      if (performance.now() - lastYield > 8) {
        await yieldToEventLoop();
        lastYield = performance.now();
      }
    }
    accept({ results, ms }, job.key);
    stats.mainJobs++;
  }
  let seconds = 0;
  let bytes = 0;
  for (const e of bank.entries()) {
    seconds += e.duration * e.buffer.numberOfChannels;
    bytes += e.buffer.length * e.buffer.numberOfChannels * 4;
  }
  bank.stats = { ...stats, wallMs: performance.now() - t0, seconds, megabytes: bytes / 1048576 };
  return bank;
}

export function loadBank(sampleRate, onProgress, maxWorkers) {
  let promise = cache.get(sampleRate);
  if (!promise) {
    promise = build(sampleRate, onProgress, maxWorkers);
    cache.set(sampleRate, promise);
    promise.catch(() => cache.delete(sampleRate));
  }
  return promise;
}

export function clearBankCache() {
  cache.clear();
}
