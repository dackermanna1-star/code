// Box downsampling of straight-alpha ImageData-like images (no canvas round trip).
export function downsampleImage(img, scale) {
  if (scale >= 0.999) return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const f = Math.max(1, Math.round(1 / scale));
  const w = Math.max(1, Math.floor(img.width / f)), h = Math.max(1, Math.floor(img.height / f));
  const out = new Uint8ClampedArray(w * h * 4);
  const src = img.data, sw = img.width;
  const n = f * f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const o = ((y * f + dy) * sw + (x * f + dx)) * 4;
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          a += src[o + 3];
        }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  return { width: w, height: h, data: out };
}
