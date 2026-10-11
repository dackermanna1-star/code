// Lightmap cache: a hash of the geometry + lighting decides whether the
// pre-baked lightmap shipped in public/maps/ can be used.

export function hashMap(brushes, lighting) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    // FNV-1a over the bytes of a float rounded to 1/64
    let v = Math.round(n * 64) | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 255;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  };
  const mixs = (s) => {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  };
  for (const b of brushes) {
    mix(b.contents); mix(b.visible ? 1 : 0); mix(b.luxel || 16); mix(b.fullbright ? 1 : 0);
    for (const p of b.planes) {
      mix(p.n[0]); mix(p.n[1]); mix(p.n[2]); mix(p.d);
      const t = p.tex;
      mixs(t == null ? '~' : typeof t === 'string' ? t : (t.name || '?'));
    }
  }
  mixs(JSON.stringify(lighting));
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function inflate(buf) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The prebaked lightmap ships as a plain RGB PNG (filter 0 on every row, as
// written by tools/bake.mjs). Decoding it by hand keeps the bytes exact: no
// colour management or premultiplication from the browser's image decoder.
export async function decodeRgbPng(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < b.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); }
    else if (type === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = await inflate(new Blob(idat));
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) rgb.set(raw.subarray(y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1)), y * w * 3);
  return { width: w, height: h, rgb };
}
