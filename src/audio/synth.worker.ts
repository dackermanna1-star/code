/// <reference lib="webworker" />
/**
 * Synthesis worker: renders sound keys off the main thread.
 * In:  { id, key, sr }
 * Out: { id, key, ch: Float32Array[], sr, loop, ms } (channel buffers transferred) | { id, key, error }
 */
import { renderKey } from './render';

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { id: number; key: string; sr: number };
  try {
    const r = renderKey(m.key, m.sr);
    if (!r) {
      (self as any).postMessage({ id: m.id, key: m.key, error: `unknown key ${m.key}` });
      return;
    }
    const transfer = [...new Set(r.ch.map((c) => c.buffer))];
    (self as any).postMessage({ id: m.id, key: m.key, ch: r.ch, sr: r.sr, loop: r.loop, ms: r.ms }, transfer);
  } catch (err) {
    (self as any).postMessage({ id: m.id, key: m.key, error: String((err as Error)?.stack ?? err) });
  }
};
