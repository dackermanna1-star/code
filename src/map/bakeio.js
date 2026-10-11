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
