// Synthesis worker: pulls small batches of recipes from the main thread and
// hands back the raw mixes (transferred, not copied). The main thread does the
// native OfflineAudioContext rendering.

import { synthesize } from './recipes.js';

self.onmessage = (e) => {
  const { jobs, sampleRate } = e.data;
  for (const { name, v } of jobs) {
    try {
      const r = synthesize(name, v, sampleRate);
      self.postMessage(r, r.channels.map((c) => c.buffer));
    } catch (err) {
      self.postMessage({ name, v, error: String((err && err.stack) || err) });
    }
  }
  self.postMessage({ idle: true });
};

self.postMessage({ ready: true });
