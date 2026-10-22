// Worker entry: renders synthesis jobs off the main thread and transfers the
// resulting sample arrays back without copying. Inert if imported elsewhere.
import { runJob } from './jobs.js';

const inWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

if (inWorker) {
  self.onmessage = (event) => {
    const { id, job } = event.data;
    try {
      const out = runJob(job);
      const transfer = [];
      for (const r of out.results) for (const c of r.channels) transfer.push(c.buffer);
      self.postMessage({ id, ok: true, results: out.results, ms: out.ms }, transfer);
    } catch (err) {
      self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
    }
  };
}
