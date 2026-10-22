// Synthesis jobs shared by the worker pool and the main-thread fallback. A job
// renders every variant of one sound (plus its far layers) and returns plain
// Float32Arrays, so results can be transferred from a worker without copying.
import { Rng, hashString } from './dsp.js';
import { AMBIENT, FLYBYS, FULL_RATE, LOOPS, RADIO, SOUNDS } from './catalog.js';
import { outdoorIR } from './synth/reverb.js';

function specFor(key) {
  if (key === 'impulse') return null;
  const [group, name] = key.includes(':') ? key.split(':') : ['sfx', key];
  switch (group) {
    case 'flyby':
      return FLYBYS[name];
    case 'loop':
      return LOOPS[name];
    case 'amb':
      return { near: AMBIENT[name] };
    case 'radio':
      return { near: RADIO[name] };
    default:
      return SOUNDS[name];
  }
}

// One job per sound key, heaviest first so a work queue balances well.
export function listJobs(ctxRate) {
  const keys = [
    'impulse',
    ...Object.keys(SOUNDS),
    ...Object.keys(FLYBYS).map((k) => `flyby:${k}`),
    ...Object.keys(LOOPS).map((k) => `loop:${k}`),
    ...Object.keys(AMBIENT).map((k) => `amb:${k}`),
    ...Object.keys(RADIO).map((k) => `radio:${k}`),
  ];
  const jobs = keys.map((key) => {
    const spec = specFor(key);
    const rate = !spec ? ctxRate : spec.near.rate === FULL_RATE ? ctxRate : Math.min(spec.near.rate, ctxRate);
    const variants = spec ? spec.near.variants : 1;
    const farVariants = spec && spec.far ? spec.far.variants : 0;
    return { key, rate, cost: rate * (variants + farVariants * 0.4) * (spec ? 1 : 2) };
  });
  return jobs.sort((a, b) => b.cost - a.cost);
}

function channelsOf(result) {
  const list = result instanceof Float32Array ? [result] : result.ch;
  // Standalone arrays only: views would drag their whole backing store along on transfer.
  return list.map((c) => (c.byteOffset === 0 && c.byteLength === c.buffer.byteLength ? c : c.slice()));
}

// Renders a job one buffer at a time (a generator, so the main-thread fallback
// can yield between variants); each step yields the buffer it produced.
export function* jobSteps(job) {
  if (job.key === 'impulse') {
    yield { key: 'impulse', layer: 'ir', index: 0, channels: outdoorIR(job.rate), rate: job.rate };
    return;
  }
  const spec = specFor(job.key);
  const nears = [];
  for (let v = 0; v < spec.near.variants; v++) {
    const rng = new Rng(hashString(`${job.key}:near:${v}`));
    const res = spec.near.fn(rng, job.rate, v);
    const channels = channelsOf(res);
    const rate = res.rate ?? job.rate;
    nears.push({ data: channels[0], rate });
    yield { key: job.key, layer: 'near', index: v, channels, rate, loopStart: res.loopStart ?? 0, loopEnd: res.loopEnd ?? 0 };
  }
  if (spec.far) {
    for (let v = 0; v < spec.far.variants; v++) {
      const src = nears[v % nears.length];
      const rng = new Rng(hashString(`${job.key}:far:${v}`));
      const res = spec.far.fn(src.data, rng, src.rate);
      yield { key: job.key, layer: 'far', index: v, channels: channelsOf(res), rate: res.rate ?? src.rate };
    }
  }
}

export function runJob(job) {
  const t0 = performance.now();
  const results = [...jobSteps(job)];
  return { results, ms: performance.now() - t0 };
}
