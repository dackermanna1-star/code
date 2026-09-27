// Procedural PBR texture generator. Produces tileable albedo / normal / ORM
// (R = ambient occlusion, G = roughness, B = metalness) data textures so the
// game ships with zero external image assets.
import * as THREE from 'three';
import { makeRng, clamp, lerp, smoothstep } from '../core/math.js';

let SIZE = 512;
export function setTextureSize(s) { SIZE = s; }

// ---------------------------------------------------------------- noise ----
class Noise {
  constructor(seed) {
    const r = makeRng(seed);
    this.v = new Float32Array(512);
    this.p = new Uint16Array(512);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = p[i & 255];
      this.v[i] = r();
    }
  }
  lat(x, y) {
    return this.v[this.p[(this.p[x & 255] + y) & 255]];
  }
  // Periodic value noise; x,y in lattice units, period in lattice cells.
  value(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = this.lat(x0, y0), b = this.lat(x1, y0), c = this.lat(x0, y1), d = this.lat(x1, y1);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  }
  // Tileable fbm, u,v in [0,1)
  fbm(u, v, freq = 4, oct = 5, gain = 0.5) {
    let sum = 0, amp = 0.5, norm = 0, f = freq;
    for (let o = 0; o < oct; o++) {
      sum += amp * this.value(u * f, v * f, f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
  ridged(u, v, freq = 4, oct = 4) {
    let sum = 0, amp = 0.5, norm = 0, f = freq;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(this.value(u * f, v * f, f) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}

// Tileable worley noise: returns [f1, f2, cellId]
function makeWorley(seed, n) {
  const r = makeRng(seed);
  const pts = new Float32Array(n * n * 2);
  const ids = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    pts[i * 2] = r();
    pts[i * 2 + 1] = r();
    ids[i] = r();
  }
  const out = [0, 0, 0];
  return (u, v) => {
    const x = u * n, y = v * n;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
        const k = wy * n + wx;
        const px = cx + pts[k * 2], py = cy + pts[k * 2 + 1];
        const dx = px - x, dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; id = ids[k]; } else if (d < f2) f2 = d;
      }
    }
    out[0] = f1; out[1] = f2; out[2] = id;
    return out;
  };
}

function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ------------------------------------------------------------- canvas ----
class TexData {
  constructor(size) {
    this.size = size;
    const n = size * size;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.h = new Float32Array(n);
    this.rough = new Float32Array(n).fill(0.8);
    this.metal = new Float32Array(n);
    this.ao = new Float32Array(n).fill(1);
  }
  each(fn) {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      const v = (y + 0.5) / s;
      for (let x = 0; x < s; x++) {
        fn((x + 0.5) / s, v, y * s + x, x, y);
      }
    }
  }
  set(i, r, g, b) {
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
  }
}

function toSRGBByte(v) {
  return clamp(Math.round(v * 255), 0, 255);
}

function buildTextures(td, opts = {}) {
  const s = td.size, n = s * s;
  const alb = new Uint8Array(n * 4);
  const nor = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const strength = opts.normalStrength ?? 3.0;
  const aoStrength = opts.aoStrength ?? 1.0;
  // Cavity AO from height: compare to blurred neighbourhood.
  const h = td.h;
  const blur = new Float32Array(n);
  const rad = 3;
  // separable box blur (wrap)
  const tmp = new Float32Array(n);
  for (let y = 0; y < s; y++) {
    let acc = 0;
    for (let k = -rad; k <= rad; k++) acc += h[y * s + ((k + s) % s)];
    for (let x = 0; x < s; x++) {
      tmp[y * s + x] = acc / (rad * 2 + 1);
      acc += h[y * s + ((x + rad + 1) % s)] - h[y * s + ((x - rad + s) % s)];
    }
  }
  for (let x = 0; x < s; x++) {
    let acc = 0;
    for (let k = -rad; k <= rad; k++) acc += tmp[((k + s) % s) * s + x];
    for (let y = 0; y < s; y++) {
      blur[y * s + x] = acc / (rad * 2 + 1);
      acc += tmp[((y + rad + 1) % s) * s + x] - tmp[((y - rad + s) % s) * s + x];
    }
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x;
      const xl = y * s + ((x - 1 + s) % s), xr = y * s + ((x + 1) % s);
      const yd = ((y - 1 + s) % s) * s + x, yu = ((y + 1) % s) * s + x;
      const dx = (h[xr] - h[xl]) * strength * (s / 256);
      const dy = (h[yu] - h[yd]) * strength * (s / 256);
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      nor[i * 4] = toSRGBByte(nx * 0.5 + 0.5);
      nor[i * 4 + 1] = toSRGBByte(ny * 0.5 + 0.5);
      nor[i * 4 + 2] = toSRGBByte(nz * 0.5 + 0.5);
      nor[i * 4 + 3] = 255;
      const cav = clamp(1 - (blur[i] - h[i]) * 4 * aoStrength, 0.25, 1) * td.ao[i];
      alb[i * 4] = toSRGBByte(clamp(td.r[i], 0, 1));
      alb[i * 4 + 1] = toSRGBByte(clamp(td.g[i], 0, 1));
      alb[i * 4 + 2] = toSRGBByte(clamp(td.b[i], 0, 1));
      alb[i * 4 + 3] = 255;
      orm[i * 4] = toSRGBByte(cav);
      orm[i * 4 + 1] = toSRGBByte(clamp(td.rough[i], 0.02, 1));
      orm[i * 4 + 2] = toSRGBByte(clamp(td.metal[i], 0, 1));
      orm[i * 4 + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = opts.anisotropy ?? 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(alb, true), normalMap: mk(nor, false), ormMap: mk(orm, false) };
}

// ------------------------------------------------------------ helpers ----
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

function stains(td, noise, amount = 0.35, freq = 3, color = [0.18, 0.15, 0.1]) {
  td.each((u, v, i) => {
    const st = smoothstep(0.55, 0.85, noise.fbm(u + 0.37, v + 0.11, freq, 4));
    const k = st * amount;
    td.r[i] = lerp(td.r[i], color[0], k);
    td.g[i] = lerp(td.g[i], color[1], k);
    td.b[i] = lerp(td.b[i], color[2], k);
    td.rough[i] = lerp(td.rough[i], 0.6, k * 0.5);
  });
}

function cracks(td, seed, count = 6, depth = 0.25, width = 1.2) {
  const r = makeRng(seed);
  const s = td.size;
  for (let c = 0; c < count; c++) {
    let x = r() * s, y = r() * s;
    let ang = r() * Math.PI * 2;
    const len = 40 + r() * 160;
    for (let t = 0; t < len; t++) {
      ang += (r() - 0.5) * 0.6;
      x += Math.cos(ang);
      y += Math.sin(ang);
      const w = width * (1 - t / len) + 0.4;
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const d = Math.hypot(ox, oy);
          if (d > w) continue;
          const px = ((Math.round(x) + ox) % s + s) % s;
          const py = ((Math.round(y) + oy) % s + s) % s;
          const i = py * s + px;
          const k = 1 - d / (w + 0.01);
          td.h[i] -= depth * k;
          td.r[i] *= 1 - 0.5 * k;
          td.g[i] *= 1 - 0.5 * k;
          td.b[i] *= 1 - 0.5 * k;
        }
      }
      if (r() < 0.02) { // branch
        ang += (r() - 0.5) * 2;
      }
    }
  }
}

// ---------------------------------------------------------- generators ----
const GEN = {
  concrete(td, o) {
    const n = new Noise(o.seed ?? 11);
    const base = hex(o.color ?? 0x8a8782);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 4, 6);
      const fine = n.fbm(u * 1.0 + 0.5, v, 32, 3);
      const pits = fine > 0.72 ? -0.2 : 0;
      const tone = 0.78 + f * 0.35 + (fine - 0.5) * 0.12;
      td.set(i, base[0] * tone, base[1] * tone, base[2] * tone);
      td.h[i] = f * 0.6 + fine * 0.35 + pits;
      td.rough[i] = 0.82 + fine * 0.15;
    });
    stains(td, n, o.stain ?? 0.35, 2, [0.22, 0.2, 0.17]);
    if (o.cracks !== false) cracks(td, (o.seed ?? 11) + 5, o.crackCount ?? 5);
  },
  plaster(td, o) {
    const n = new Noise(o.seed ?? 21);
    const base = hex(o.color ?? 0xd8d2c4);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 6, 5);
      const fine = n.value(u * 128, v * 128, 128);
      const tone = 0.9 + f * 0.12 + fine * 0.04;
      td.set(i, base[0] * tone, base[1] * tone, base[2] * tone);
      td.h[i] = f * 0.25 + fine * 0.15;
      td.rough[i] = 0.9;
    });
    // water stains running down + grime
    td.each((u, v, i) => {
      const drip = smoothstep(0.62, 0.9, n.fbm(u * 1.0, v * 0.25 + 0.3, 3, 4)) * (1 - v) ;
      const k = drip * (o.grime ?? 0.55);
      td.r[i] = lerp(td.r[i], 0.35, k); td.g[i] = lerp(td.g[i], 0.3, k); td.b[i] = lerp(td.b[i], 0.22, k);
    });
    stains(td, n, o.stain ?? 0.25, 3);
    if (o.cracks) cracks(td, 77, 4, 0.2, 1);
  },
  wallpaper(td, o) {
    const n = new Noise(o.seed ?? 31);
    const a = hex(o.color ?? 0x8c7a5a), b = hex(o.color2 ?? 0x6e5c40);
    const stripes = o.stripes ?? 12;
    td.each((u, v, i) => {
      const sx = u * stripes;
      const st = Math.sin(sx * Math.PI * 2) > 0.3 ? 1 : 0;
      // damask-ish motif
      const mu = (u * stripes) % 1, mv = (v * stripes * 0.5) % 1;
      const motif = Math.abs(Math.sin(mu * Math.PI * 2) * Math.cos(mv * Math.PI * 4)) > 0.7 ? 1 : 0;
      const m = Math.max(st * 0.6, motif * 0.8);
      const f = n.fbm(u, v, 4, 4);
      const tone = 0.85 + f * 0.25;
      td.set(i, lerp(a[0], b[0], m) * tone, lerp(a[1], b[1], m) * tone, lerp(a[2], b[2], m) * tone);
      td.h[i] = 0.2 * m + f * 0.1;
      td.rough[i] = 0.85;
      // peeling: patches revealing plaster
      const peel = smoothstep(0.7, 0.74, n.fbm(u + 0.2, v + 0.8, 3, 5));
      if (peel > 0) {
        const pc = 0.62 + f * 0.1;
        td.r[i] = lerp(td.r[i], pc, peel); td.g[i] = lerp(td.g[i], pc * 0.96, peel); td.b[i] = lerp(td.b[i], pc * 0.88, peel);
        td.h[i] -= 0.3 * peel;
      }
    });
    stains(td, n, 0.4, 2, [0.25, 0.2, 0.12]);
  },
  brick(td, o) {
    const n = new Noise(o.seed ?? 41);
    const rows = o.rows ?? 16, cols = o.cols ?? 4, mortar = o.mortar ?? 0.012;
    const base = hex(o.color ?? 0x7a3a2a), mc = hex(o.mortarColor ?? 0x9a948a);
    td.each((u, v, i) => {
      const row = Math.floor(v * rows);
      const off = (row % 2) * 0.5;
      const cu = u * cols + off;
      const col = Math.floor(cu);
      const lu = cu - col, lv = v * rows - row;
      const du = Math.min(lu, 1 - lu) / cols, dv = Math.min(lv, 1 - lv) / rows;
      const d = Math.min(du, dv);
      const f = n.fbm(u, v, 8, 4);
      const vr = hash2(row, ((col % cols) + cols) % cols);
      const isM = d < mortar;
      const bevel = smoothstep(mortar, mortar * 2.2, d);
      if (isM) {
        const t = 0.8 + f * 0.3;
        td.set(i, mc[0] * t, mc[1] * t, mc[2] * t);
        td.h[i] = 0.1 + f * 0.1;
        td.rough[i] = 0.95;
      } else {
        const t = 0.7 + vr * 0.45 + (f - 0.5) * 0.3;
        const burn = vr > 0.85 ? 0.6 : 1;
        td.set(i, base[0] * t * burn, base[1] * t * burn * (0.9 + vr * 0.2), base[2] * t * burn);
        td.h[i] = 0.5 + bevel * 0.4 + f * 0.2;
        td.rough[i] = 0.85 + f * 0.1;
      }
    });
    stains(td, n, o.stain ?? 0.4, 2, [0.1, 0.09, 0.08]);
  },
  tiles(td, o) {
    const n = new Noise(o.seed ?? 51);
    const cu = o.cols ?? 8, cv = o.rows ?? 8, grout = o.grout ?? 0.006;
    const a = hex(o.color ?? 0xe8e6e0), b = hex(o.color2 ?? o.color ?? 0xe8e6e0), g = hex(o.groutColor ?? 0x6a665e);
    const brickOff = o.offset ?? 0;
    td.each((u, v, i) => {
      const row = Math.floor(v * cv);
      const uu = u * cu + (row % 2) * brickOff;
      const col = Math.floor(uu);
      const lu = uu - col, lv = v * cv - row;
      const d = Math.min(Math.min(lu, 1 - lu) / cu, Math.min(lv, 1 - lv) / cv);
      const f = n.fbm(u, v, 6, 4);
      const vr = hash2(row + 3, ((col % cu) + cu) % cu);
      const chk = o.checker ? ((row + col) % 2 === 0 ? a : b) : a;
      if (d < grout) {
        const t = 0.8 + f * 0.4;
        td.set(i, g[0] * t, g[1] * t, g[2] * t);
        td.h[i] = 0.05;
        td.rough[i] = 0.95;
      } else {
        const t = 0.92 + vr * 0.1 + (f - 0.5) * 0.1;
        td.set(i, chk[0] * t, chk[1] * t, chk[2] * t);
        td.h[i] = 0.6 + smoothstep(grout, grout * 3, d) * 0.3;
        td.rough[i] = (o.gloss ?? 0.25) + f * 0.25;
        // chipped tiles
        if (vr > 0.93 && f > 0.55) {
          td.set(i, g[0] * 0.8, g[1] * 0.8, g[2] * 0.8);
          td.h[i] = 0.2;
          td.rough[i] = 0.9;
        }
      }
    });
    stains(td, n, o.stain ?? 0.45, 3, [0.25, 0.22, 0.15]);
  },
  woodfloor(td, o) {
    const n = new Noise(o.seed ?? 61);
    const planks = o.planks ?? 8;
    const base = hex(o.color ?? 0x6b4a2e);
    td.each((u, v, i) => {
      const row = Math.floor(v * planks);
      const lv = v * planks - row;
      const off = hash2(row, 7);
      const seg = Math.floor(u * 2 + off * 2);
      const lu = (u * 2 + off * 2) - seg;
      const gap = Math.min(lv, 1 - lv) < 0.03 || Math.min(lu, 1 - lu) < 0.004;
      const vr = hash2(row, seg);
      const grain = n.fbm(u * 1 + vr, v * 8 + row, 4, 4);
      const rings = 0.5 + 0.5 * Math.sin((grain * 12 + lv * 3) * 3.0);
      const t = (0.65 + vr * 0.35) * (0.8 + rings * 0.25);
      if (gap) {
        td.set(i, base[0] * 0.25, base[1] * 0.25, base[2] * 0.25);
        td.h[i] = 0;
        td.rough[i] = 0.9;
      } else {
        td.set(i, base[0] * t, base[1] * t, base[2] * t);
        td.h[i] = 0.6 + rings * 0.08;
        td.rough[i] = 0.45 + grain * 0.3;
      }
    });
    stains(td, n, 0.35, 3, [0.15, 0.1, 0.06]);
  },
  wood(td, o) {
    const n = new Noise(o.seed ?? 71);
    const base = hex(o.color ?? 0x8a6a44);
    td.each((u, v, i) => {
      const g = n.fbm(u, v * 0.25, 4, 5);
      const rings = 0.5 + 0.5 * Math.sin((u * 20 + g * 10) * Math.PI);
      const t = 0.7 + rings * 0.3;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      td.h[i] = rings * 0.3 + g * 0.2;
      td.rough[i] = 0.7;
    });
    stains(td, n, 0.3, 2);
  },
  carpet(td, o) {
    const n = new Noise(o.seed ?? 81);
    const base = hex(o.color ?? 0x5a3b3b);
    td.each((u, v, i) => {
      const fine = n.value(u * 256, v * 256, 256);
      const f = n.fbm(u, v, 3, 4);
      const t = 0.8 + fine * 0.25 + (f - 0.5) * 0.3;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      td.h[i] = fine * 0.5;
      td.rough[i] = 1;
    });
    stains(td, n, 0.5, 3, [0.12, 0.08, 0.06]);
  },
  asphalt(td, o) {
    const n = new Noise(o.seed ?? 91);
    const base = hex(o.color ?? 0x2e2e30);
    td.each((u, v, i) => {
      const agg = n.value(u * 200, v * 200, 200);
      const f = n.fbm(u, v, 3, 5);
      const t = 0.75 + agg * 0.4 + (f - 0.5) * 0.35;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      td.h[i] = agg * 0.5 + f * 0.3;
      // wet patches
      const wet = smoothstep(0.6, 0.7, n.fbm(u + 0.5, v + 0.2, 2, 4));
      td.rough[i] = lerp(0.85, 0.15, wet * (o.wet ?? 0.8));
      td.r[i] *= 1 - wet * 0.3; td.g[i] *= 1 - wet * 0.3; td.b[i] *= 1 - wet * 0.3;
    });
    cracks(td, 93, 8, 0.3, 1.5);
  },
  sidewalk(td, o) {
    const n = new Noise(o.seed ?? 101);
    const base = hex(o.color ?? 0x86837c);
    const slabs = o.slabs ?? 2;
    td.each((u, v, i) => {
      const lu = (u * slabs) % 1, lv = (v * slabs) % 1;
      const seam = Math.min(lu, 1 - lu, lv, 1 - lv) < 0.008;
      const f = n.fbm(u, v, 6, 5);
      const fine = n.value(u * 128, v * 128, 128);
      const t = 0.8 + f * 0.25 + fine * 0.08;
      if (seam) { td.set(i, base[0] * 0.4, base[1] * 0.4, base[2] * 0.4); td.h[i] = 0; }
      else { td.set(i, base[0] * t, base[1] * t, base[2] * t); td.h[i] = 0.5 + f * 0.2 + fine * 0.1; }
      td.rough[i] = 0.85;
    });
    stains(td, n, 0.45, 3, [0.15, 0.13, 0.1]);
    cracks(td, 103, 4, 0.2, 1);
  },
  metal(td, o) {
    const n = new Noise(o.seed ?? 111);
    const base = hex(o.color ?? 0x5a6468);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 4, 5);
      const scratch = n.value(u * 4, v * 160, 160);
      const rust = smoothstep(0.62, 0.78, n.fbm(u + 0.7, v + 0.1, 3, 5)) * (o.rust ?? 0.6);
      const t = 0.8 + f * 0.25 + (scratch > 0.93 ? 0.3 : 0);
      td.set(i, lerp(base[0] * t, 0.35, rust), lerp(base[1] * t, 0.17, rust), lerp(base[2] * t, 0.08, rust));
      td.h[i] = f * 0.2 - rust * 0.15 + (scratch > 0.93 ? -0.1 : 0);
      td.rough[i] = lerp(o.rough ?? 0.45, 0.9, rust) + (scratch > 0.93 ? -0.2 : 0);
      td.metal[i] = lerp(o.metal ?? 0.6, 0.1, rust);
    });
  },
  diamond(td, o) {
    const n = new Noise(o.seed ?? 121);
    const base = hex(o.color ?? 0x7a7e80);
    const k = o.count ?? 8;
    td.each((u, v, i) => {
      const cu = (u * k) % 1, cv = (v * k) % 1;
      const a = Math.abs(((cu + cv) % 1) - 0.5), b = Math.abs(((cu - cv + 1) % 1) - 0.5);
      const bump = (cv < 0.5 ? smoothstep(0.1, 0.04, Math.abs(cu - cv) ) : smoothstep(0.1, 0.04, Math.abs(cu + cv - 1.5)));
      const bump2 = smoothstep(0.08, 0.02, Math.abs(a - b) * 0.5 + Math.abs(cu - 0.5) * 0.2) * 0;
      const f = n.fbm(u, v, 4, 5);
      const rust = smoothstep(0.6, 0.8, f) * (o.rust ?? 0.4);
      const t = 0.8 + f * 0.3;
      td.set(i, lerp(base[0] * t, 0.3, rust), lerp(base[1] * t, 0.16, rust), lerp(base[2] * t, 0.08, rust));
      td.h[i] = bump * 0.6 + bump2 + f * 0.1;
      td.rough[i] = lerp(0.35, 0.9, rust);
      td.metal[i] = lerp(0.8, 0.2, rust);
    });
  },
  rooftar(td, o) {
    const n = new Noise(o.seed ?? 131);
    const base = hex(o.color ?? 0x3a3936);
    const w = makeWorley(133, 48);
    td.each((u, v, i) => {
      const [f1, f2, id] = w(u, v);
      const pebble = smoothstep(0.1, 0.0, f2 - f1);
      const f = n.fbm(u, v, 4, 4);
      const t = 0.7 + id * 0.5 + (f - 0.5) * 0.3;
      td.set(i, base[0] * t, base[1] * t, base[2] * t * 0.95);
      td.h[i] = (1 - f1) * 0.6 - pebble * 0.3;
      td.rough[i] = 0.9;
    });
    stains(td, n, 0.4, 2, [0.12, 0.12, 0.11]);
  },
  ceiling(td, o) {
    const n = new Noise(o.seed ?? 141);
    const base = hex(o.color ?? 0xcfcac0);
    const k = o.count ?? 4;
    td.each((u, v, i) => {
      const lu = (u * k) % 1, lv = (v * k) % 1;
      const grid = Math.min(lu, 1 - lu, lv, 1 - lv) < 0.02;
      const holes = n.value(u * 180, v * 180, 180) > 0.78 ? 1 : 0;
      const f = n.fbm(u, v, 4, 4);
      if (grid) { td.set(i, 0.55, 0.55, 0.55); td.h[i] = 0.9; td.metal[i] = 0.5; td.rough[i] = 0.4; }
      else {
        const t = 0.85 + f * 0.2 - holes * 0.15;
        td.set(i, base[0] * t, base[1] * t, base[2] * t);
        td.h[i] = 0.5 - holes * 0.2;
        td.rough[i] = 0.95;
      }
    });
    // water damage
    td.each((u, v, i) => {
      const w = smoothstep(0.62, 0.66, n.fbm(u + 0.4, v + 0.9, 2, 5));
      const ring = smoothstep(0.66, 0.68, n.fbm(u + 0.4, v + 0.9, 2, 5));
      const k2 = w * 0.35 + (w - ring) * 0.3;
      td.r[i] = lerp(td.r[i], 0.5, k2); td.g[i] = lerp(td.g[i], 0.42, k2); td.b[i] = lerp(td.b[i], 0.28, k2);
    });
  },
  linoleum(td, o) {
    const n = new Noise(o.seed ?? 151);
    const base = hex(o.color ?? 0xb8b4a4);
    const k = o.count ?? 4;
    td.each((u, v, i) => {
      const lu = (u * k) % 1, lv = (v * k) % 1;
      const seam = Math.min(lu, 1 - lu, lv, 1 - lv) < 0.004;
      const speck = n.value(u * 220, v * 220, 220);
      const f = n.fbm(u, v, 3, 4);
      let t = 0.9 + (f - 0.5) * 0.15;
      let c = [base[0] * t, base[1] * t, base[2] * t];
      if (speck > 0.8) c = [c[0] * 0.7, c[1] * 0.72, c[2] * 0.7];
      if (speck < 0.12) c = [c[0] * 1.08, c[1] * 1.08, c[2] * 1.1];
      if (seam) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
      td.set(i, c[0], c[1], c[2]);
      td.h[i] = seam ? 0 : 0.5;
      td.rough[i] = 0.3 + f * 0.25;
    });
    stains(td, n, 0.4, 3, [0.3, 0.27, 0.18]);
  },
  sewer(td, o) {
    const n = new Noise(o.seed ?? 161);
    GEN.brick(td, { rows: 12, cols: 3, color: o.color ?? 0x4a3a2c, mortarColor: 0x2e2c26, stain: 0.2 });
    td.each((u, v, i) => {
      const slime = smoothstep(0.5, 0.8, n.fbm(u, v * 0.5, 3, 5)) * (1 - v * 0.6);
      td.r[i] = lerp(td.r[i], 0.12, slime); td.g[i] = lerp(td.g[i], 0.16, slime); td.b[i] = lerp(td.b[i], 0.07, slime);
      td.rough[i] = lerp(td.rough[i], 0.2, slime);
      const wetline = v < 0.3 ? smoothstep(0.3, 0.0, v) : 0;
      td.rough[i] = lerp(td.rough[i], 0.15, wetline);
      td.r[i] *= 1 - wetline * 0.4; td.g[i] *= 1 - wetline * 0.35; td.b[i] *= 1 - wetline * 0.4;
    });
  },
  water(td, o) {
    const n = new Noise(o.seed ?? 171);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 6, 5);
      td.set(i, 0.08, 0.1, 0.07);
      td.h[i] = f;
      td.rough[i] = 0.05;
    });
  },
  dirt(td, o) {
    const n = new Noise(o.seed ?? 181);
    const base = hex(o.color ?? 0x4a3e30);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 5, 6);
      const fine = n.value(u * 150, v * 150, 150);
      const t = 0.65 + f * 0.5 + fine * 0.1;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      td.h[i] = f * 0.6 + fine * 0.3;
      td.rough[i] = 0.95;
    });
  },
  fabric(td, o) {
    const n = new Noise(o.seed ?? 191);
    const base = hex(o.color ?? 0x6a6a70);
    td.each((u, v, i) => {
      const weave = (Math.sin(u * 600) * Math.sin(v * 600)) * 0.5 + 0.5;
      const f = n.fbm(u, v, 3, 4);
      const t = 0.8 + weave * 0.12 + (f - 0.5) * 0.3;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      td.h[i] = weave * 0.3;
      td.rough[i] = 0.95;
    });
    stains(td, n, 0.4, 3, [0.18, 0.14, 0.1]);
  },
  marble(td, o) {
    const n = new Noise(o.seed ?? 201);
    const base = hex(o.color ?? 0xd8d4cc);
    const k = o.count ?? 2;
    td.each((u, v, i) => {
      const lu = (u * k) % 1, lv = (v * k) % 1;
      const seam = Math.min(lu, 1 - lu, lv, 1 - lv) < 0.004;
      const vein = Math.pow(1 - Math.abs(Math.sin((u + n.fbm(u, v, 3, 5) * 1.5) * Math.PI * 3)), 12);
      const t = 0.9 - vein * 0.4;
      td.set(i, base[0] * t, base[1] * t, base[2] * t);
      if (seam) td.set(i, 0.3, 0.3, 0.3);
      td.h[i] = seam ? 0 : 0.5;
      td.rough[i] = 0.12 + vein * 0.1;
    });
    stains(td, n, 0.25, 3, [0.3, 0.26, 0.2]);
  },
  paintedMetal(td, o) {
    const n = new Noise(o.seed ?? 211);
    const base = hex(o.color ?? 0x8a2a20);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 4, 5);
      const chip = smoothstep(0.66, 0.7, n.fbm(u + 0.3, v + 0.3, 6, 5));
      const t = 0.85 + f * 0.2;
      td.set(i, lerp(base[0] * t, 0.3, chip), lerp(base[1] * t, 0.2, chip), lerp(base[2] * t, 0.12, chip));
      td.h[i] = 0.5 - chip * 0.2 + f * 0.05;
      td.rough[i] = lerp(0.5, 0.85, chip) + f * 0.1;
      td.metal[i] = lerp(0.2, 0.6, chip);
    });
    stains(td, n, 0.3, 2, [0.1, 0.08, 0.06]);
  },
  rubber(td, o) {
    const n = new Noise(o.seed ?? 221);
    td.each((u, v, i) => {
      const f = n.fbm(u, v, 6, 4);
      const t = 0.8 + f * 0.2;
      td.set(i, 0.07 * t, 0.07 * t, 0.075 * t);
      td.h[i] = f * 0.2;
      td.rough[i] = 0.75;
    });
  },
  zombieCloth(td, o) {
    // Clothing texture for infected: torn fabric with grime, blood and bite marks.
    const n = new Noise(o.seed ?? 231);
    td.each((u, v, i) => {
      const weave = (Math.sin(u * 700) * Math.sin(v * 700)) * 0.5 + 0.5;
      const f = n.fbm(u, v, 4, 5);
      const grime = smoothstep(0.45, 0.8, n.fbm(u + 0.3, v + 0.6, 3, 5));
      const t = 0.85 + weave * 0.1 + (f - 0.5) * 0.35;
      let r = t, g = t, b = t;
      r = lerp(r, 0.35, grime * 0.6); g = lerp(g, 0.3, grime * 0.6); b = lerp(b, 0.22, grime * 0.6);
      const tear = n.value(u * 30, v * 30, 30) > 0.86 ? 1 : 0;
      if (tear) { r *= 0.55; g *= 0.5; b *= 0.5; }
      td.set(i, r, g, b);
      td.h[i] = weave * 0.2 + f * 0.3 - tear * 0.3;
      td.rough[i] = 0.9;
    });
  },
};

const cache = new Map();
export function getTexture(kind, opts = {}) {
  const key = kind + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const size = opts.size ?? SIZE;
  const td = new TexData(size);
  const gen = GEN[kind];
  if (!gen) throw new Error('Unknown texture ' + kind);
  gen(td, opts);
  const t = buildTextures(td, opts);
  cache.set(key, t);
  return t;
}

// Blood mask texture (R channel) used for per-instance blood on infected.
let bloodMask = null;
export function getBloodMask() {
  if (bloodMask) return bloodMask;
  const s = 256;
  const n = new Noise(999);
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s;
    const f = n.fbm(u, v, 4, 5);
    const drip = n.fbm(u * 1.0, v * 0.2, 6, 3);
    const m = clamp(f * 0.8 + drip * 0.4, 0, 1);
    const i = (y * s + x) * 4;
    data[i] = m * 255; data[i + 1] = m * 255; data[i + 2] = m * 255; data[i + 3] = 255;
  }
  bloodMask = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  bloodMask.wrapS = bloodMask.wrapT = THREE.RepeatWrapping;
  bloodMask.generateMipmaps = true;
  bloodMask.minFilter = THREE.LinearMipmapLinearFilter;
  bloodMask.magFilter = THREE.LinearFilter;
  bloodMask.needsUpdate = true;
  return bloodMask;
}

export { Noise, makeWorley };
