// Sound bank worker: synthesises the procedural bank (sounds.js) off the main thread and posts
// every buffer as soon as it is ready (transferred, not copied), in the engine's priority order.
// It also builds reverb impulse responses on request, ahead of the remaining bank jobs.
//   main -> worker  { type: 'ir', kind, rate }       build makeIR(kind, rate)
//                   { type: 'want', names: [...] }   move these jobs to the front of the queue
//   worker -> main  { type: 'hello', total } · { type: 'buf', name, sr, loop, kind, data }
//                   { type: 'ir', kind, rate, l, r } · { type: 'jobError', name, message }
//                   { type: 'done', count, ms }
// Importing this module anywhere but inside a worker does nothing (tools/check.mjs imports it).
import { bankQueue } from './sounds.js';
import { makeIR } from './reverb.js';

const scope = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope ? self : null;

const SLICE_MS = 30;   // work per task before checking for IR requests
let queue = [];
const irQueue = [];
let t0 = 0, sent = 0, finished = false;

function post(msg, transfer) { scope.postMessage(msg, transfer || []); }

function buildIR(req) {
  try {
    const [l, r] = makeIR(req.kind, req.rate);
    post({ type: 'ir', kind: req.kind, rate: req.rate, l, r }, [l.buffer, r.buffer]);
  } catch (err) {
    post({ type: 'jobError', name: 'ir:' + req.kind, message: String((err && err.stack) || err) });
  }
}

function runJob(job) {
  try {
    const data = job.make();
    post({ type: 'buf', name: job.name, sr: job.sr, loop: job.loop, kind: job.kind, data }, [data.buffer]);
  } catch (err) {
    post({ type: 'jobError', name: job.name, message: String((err && err.stack) || err) });
  }
  sent++;
}

// a zero-delay yield (setTimeout(0) is clamped to 4 ms once nested); at most one step pending
let wake = null, pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  if (!wake && typeof MessageChannel === 'function') {
    const ch = new MessageChannel();
    ch.port1.onmessage = step;
    wake = () => ch.port2.postMessage(0);
  }
  if (wake) wake(); else setTimeout(step, 0);
}

function step() {
  pending = false;
  const until = performance.now() + SLICE_MS;
  do {
    if (irQueue.length) { buildIR(irQueue.shift()); continue; }
    const job = queue.shift();
    if (!job) {
      if (!finished) { finished = true; post({ type: 'done', count: sent, ms: performance.now() - t0 }); }
      return;   // idle: an IR request restarts the loop
    }
    runJob(job);
  } while (performance.now() < until);
  schedule();
}

if (scope) {
  scope.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'ir') {
      if (!irQueue.some((q) => q.kind === m.kind && q.rate === m.rate)) irQueue.push({ kind: m.kind, rate: m.rate });
      schedule();
    } else if (m.type === 'want' && Array.isArray(m.names)) {
      const want = new Set(m.names);
      const front = queue.filter((j) => want.has(j.name));
      if (front.length) queue = front.concat(queue.filter((j) => !want.has(j.name)));
    }
  };
  t0 = performance.now();
  queue = bankQueue();
  post({ type: 'hello', total: queue.length });
  schedule();
}
