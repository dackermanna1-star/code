// Synthesis worker: renders sound/music jobs off the main thread and transfers the sample data back.
import { renderSound } from './sounds.js';
import { renderMusic } from './music.js';

self.onmessage = (e) => {
  const { id, kind, name, variant } = e.data;
  try {
    const t0 = performance.now();
    const r = kind === 'music' ? renderMusic(name) : renderSound(name, variant);
    const ms = performance.now() - t0;
    self.postMessage({ id, ok: true, channels: r.channels, sampleRate: r.sampleRate, loop: r.loop, ms }, r.channels.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
  }
};
