// Module worker for generatePaintBatchParallel(). Generates one surface per message
// and transfers the pixel buffers back (no canvases are created in the worker).

import { generateWallPaint, generatePropPaint } from './index.js';

self.onmessage = (e) => {
  const { id, type, spec } = e.data;
  try {
    const s = { ...spec, canvases: false };
    const r = type === 'prop' ? generatePropPaint(s) : generateWallPaint(s);
    const c = r.colorImage, p = r.propsImage;
    self.postMessage({ id, ok: true, w: c.width, h: c.height, color: c.data.buffer, props: p.data.buffer, stats: r.stats }, [c.data.buffer, p.data.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
  }
};
