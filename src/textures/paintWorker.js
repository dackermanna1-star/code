// Web Worker: generates one facade's graffiti off the main thread and returns
// raw RGBA buffers (colour at full resolution, props downscaled).
import { generateWallPaint } from './graffiti/index.js';

self.onmessage = (e) => {
  const { id, spec, propsScale } = e.data;
  try {
    const res = generateWallPaint(spec);
    const cw = res.color.width, ch = res.color.height;
    const color = res.color.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cw, ch);
    const pw = Math.max(1, Math.round(res.props.width * propsScale)), ph = Math.max(1, Math.round(res.props.height * propsScale));
    const pc = new OffscreenCanvas(pw, ph);
    const pctx = pc.getContext('2d', { willReadFrequently: true });
    pctx.imageSmoothingEnabled = true;
    pctx.drawImage(res.props, 0, 0, pw, ph);
    const props = pctx.getImageData(0, 0, pw, ph);
    self.postMessage(
      { id, ok: true, color: { width: cw, height: ch, data: color.data }, props: { width: pw, height: ph, data: props.data } },
      [color.data.buffer, props.data.buffer],
    );
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack ? err.stack : err) });
  }
};
