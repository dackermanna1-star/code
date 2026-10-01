// Web Worker: generates one facade's graffiti off the main thread and returns
// raw straight-alpha RGBA buffers (colour at full resolution, props downsampled).
import { generateWallPaint } from './graffiti/index.js';
import { downsampleImage } from './paintImage.js';

self.onmessage = (e) => {
  const { id, spec, propsScale } = e.data;
  try {
    const res = generateWallPaint({ ...spec, canvases: false });
    const color = res.colorImage;
    const props = downsampleImage(res.propsImage, propsScale);
    self.postMessage({ id, ok: true, color, props }, [color.data.buffer, props.data.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack ? err.stack : err) });
  }
};
