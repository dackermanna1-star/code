// Minimal TGA decoder (uncompressed / RLE, 24/32-bit truecolour) -> ImageData-like {width,height,data}
export function decodeTga(buf) {
  const b = new Uint8Array(buf);
  const idLen = b[0], cmapType = b[1], type = b[2];
  const cmapLen = b[5] | (b[6] << 8), cmapDepth = b[7];
  const w = b[12] | (b[13] << 8), h = b[14] | (b[15] << 8);
  const bpp = b[16], desc = b[17];
  if (cmapType || (type !== 2 && type !== 10)) throw new Error('unsupported TGA type ' + type);
  let p = 18 + idLen + cmapLen * (cmapDepth >> 3);
  const px = bpp >> 3;
  const out = new Uint8ClampedArray(w * h * 4);
  const topDown = !!(desc & 0x20);
  let i = 0;
  const put = (o) => {
    const row = Math.floor(i / w), col = i % w;
    const y = topDown ? row : h - 1 - row;
    const d = (y * w + col) * 4;
    out[d] = b[o + 2]; out[d + 1] = b[o + 1]; out[d + 2] = b[o]; out[d + 3] = px === 4 ? b[o + 3] : 255;
    i++;
  };
  if (type === 2) {
    while (i < w * h) { put(p); p += px; }
  } else {
    while (i < w * h) {
      const c = b[p++];
      const n = (c & 127) + 1;
      if (c & 128) { for (let k = 0; k < n; k++) put(p); p += px; }
      else { for (let k = 0; k < n; k++) { put(p); p += px; } }
    }
  }
  return { width: w, height: h, data: out };
}
