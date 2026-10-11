// Stand-in textures for BSP surfaces whose WAD wasn't supplied: guessed from the
// texture name (wood, brick, concrete, grass, tiles, metal, water, ...) so a map
// is still readable without the original Half-Life / CS texture files.
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// [pattern, base rgb, pattern params]
const KINDS = [
  [/water|^!|slime/, 'water', [40, 70, 80]],
  [/grs|grass|hedge|leaf|plant|bush/, 'grass', [72, 82, 40]],
  [/dirt|mud|out_grnd|soil|ground/, 'noise', [110, 88, 60]],
  [/sand/, 'noise', [176, 150, 108]],
  [/brick|bk_|wall_br/, 'brick', [128, 72, 52]],
  [/wood|crate|plank|box|fifties_dr|dr1|door|dsk|desk|shelf|bks|pfab|cch|chair|table|fiftsfile|file|cardbox/, 'planks', [118, 84, 52]],
  [/tile|flr|floor|c2a4_flr/, 'tiles', [140, 132, 118]],
  [/metal|mtl|steel|pipe|silo|grate|vent|babtech|tech|lab|c1a/, 'panels', [96, 100, 104]],
  [/roof|out_roof/, 'tiles', [92, 52, 40]],
  [/glass|window|wndw/, 'flat', [120, 140, 150]],
  [/ceil/, 'flat', [170, 166, 150]],
  [/wall|crete|concrete|stone|out_w|rock|cac/, 'blocks', [132, 126, 112]],
  [/black/, 'flat', [12, 12, 12]],
  [/picture|sign|poster|flipsign/, 'flat', [150, 120, 80]],
];

export function generateFallbackTexture(name, w = 64, h = 64) {
  w = Math.max(8, Math.min(256, w | 0)); h = Math.max(8, Math.min(256, h | 0));
  const n = name.toLowerCase();
  let kind = 'noise', base = [120, 112, 100];
  for (const [re, k, b] of KINDS) if (re.test(n)) { kind = k; base = b; break; }
  const r = rng(hash(n));
  // vary the tint a little per texture so neighbouring surfaces read apart
  const tint = 0.9 + r() * 0.2;
  base = base.map((c) => c * tint);
  const data = new Uint8ClampedArray(w * h * 4);
  const noise = new Float32Array(w * h);
  for (let i = 0; i < noise.length; i++) noise[i] = r();
  const n2 = (x, y) => noise[((y % h + h) % h) * w + ((x % w + w) % w)];
  const smoothN = (x, y) => (n2(x, y) + n2(x + 1, y) + n2(x, y + 1) + n2(x - 1, y) + n2(x, y - 1)) / 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let k = 1 + (smoothN(x, y) - 0.5) * 0.25;
      switch (kind) {
        case 'brick': {
          const row = Math.floor(y / 8), off = row % 2 ? 8 : 0;
          if (y % 8 === 0 || (x + off) % 16 === 0) k = 0.62;
          break;
        }
        case 'blocks': {
          const row = Math.floor(y / 16), off = row % 2 ? 16 : 0;
          if (y % 16 === 0 || (x + off) % 32 === 0) k *= 0.78;
          break;
        }
        case 'planks': {
          if (x % 16 === 0) k = 0.55;
          k *= 1 + Math.sin((y + Math.floor(x / 16) * 13) * 0.45 + n2(x >> 4, 0) * 6) * 0.06;
          break;
        }
        case 'tiles': if (x % 16 === 0 || y % 16 === 0) k = 0.72; break;
        case 'panels': if (x % 32 === 0 || y % 32 === 0) k = 0.6; else if ((x % 32 === 1) || (y % 32 === 1)) k = 1.25; break;
        case 'grass': k = 0.75 + n2(x, y) * 0.5; break;
        case 'water': k = 0.85 + Math.sin(x * 0.4 + Math.sin(y * 0.3) * 2) * 0.1; break;
        case 'flat': k = 1 + (n2(x, y) - 0.5) * 0.06; break;
        default: k = 0.85 + smoothN(x, y) * 0.3;
      }
      const o = (y * w + x) * 4;
      data[o] = clamp(base[0] * k); data[o + 1] = clamp(base[1] * k); data[o + 2] = clamp(base[2] * k); data[o + 3] = 255;
    }
  }
  if (n[0] === '{') {
    // alpha-tested (fences, ladders): bars on a transparent background
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % 16 > 3 && y % 16 > 3) data[(y * w + x) * 4 + 3] = 0;
  }
  return { name, width: w, height: h, data };
}
