// Shared helpers of level group 01 (hotels and apartments): local-coordinate zone drawing, big
// digit glyphs and number plates, the "does the player see this" test used by scripts.
import { defineTexture } from '../../gfx/textures.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { CF, M, cbox, W } from './kit.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// rotation that makes a prop's front face (dx, dz)
export const face = (dx, dz) => Math.atan2(dx, -dz);

// A zone seen in local cell coordinates (u, v) = (x - zone x0, z - zone z0). Every zone of a level
// that repeats with the zone size draws the same layout from the same local numbers.
export class Loc {
  constructor(zb) { this.zb = zb; this.x0 = zb.x0; this.z0 = zb.z0; this.w = zb.w; this.d = zb.d; }
  x(u) { return this.x0 + u; }
  z(v) { return this.z0 + v; }
  // run fn(u, v, index) over the cells of [u0,u1) x [v0,v1) that are inside the zone
  each(u0, v0, u1, v1, fn) {
    const { x0, z0, zb } = this;
    zb.fill(x0 + u0, z0 + v0, x0 + u1, z0 + v1, (x, z, i) => fn(x - x0, z - z0, i));
  }
  solid(u0, v0, u1, v1, mat) { this.each(u0, v0, u1, v1, (u, v, i) => { this.zb.solid[i] = mat; }); }
  // open floor space: clears solids, sets heights and materials
  carve(u0, v0, u1, v1, o = {}) {
    const zb = this.zb;
    this.each(u0, v0, u1, v1, (u, v, i) => {
      zb.solid[i] = 0;
      zb.floor[i] = o.floor ?? 0;
      zb.ceil[i] = o.ceil ?? 3;
      if (o.fmat) zb.fmat[i] = typeof o.fmat === 'function' ? o.fmat(u, v) : o.fmat;
      if (o.cmat) zb.cmat[i] = typeof o.cmat === 'function' ? o.cmat(u, v) : o.cmat;
      if (o.wmat) zb.wmat[i] = o.wmat;
      zb.flags[i] = o.flags ?? 0;
    });
  }
  floorMat(u0, v0, u1, v1, mat) { this.each(u0, v0, u1, v1, (u, v, i) => { this.zb.fmat[i] = typeof mat === 'function' ? mat(u, v) : mat; }); }
  heights(u0, v0, u1, v1, floor, ceil) { this.each(u0, v0, u1, v1, (u, v, i) => { if (floor !== undefined) this.zb.floor[i] = floor; if (ceil !== undefined) this.zb.ceil[i] = ceil; }); }
  in(u, v) { return u >= 0 && v >= 0 && u < this.w && v < this.d; }
  // brush clipped to the zone
  box(u0, y0, v0, u1, y1, v1, mat, o) { return cbox(this.zb, this.x0 + u0, y0, this.z0 + v0, this.x0 + u1, y1, this.z0 + v1, mat, o); }
  prop(type, u, y, v, rot, o) {
    if (!this.in(Math.floor(u), Math.floor(v))) return null;
    return this.zb.prop(type, this.x0 + u, y, this.z0 + v, rot || 0, o || {});
  }
  dynamic(type, u, y, v, rot, o, anim) {
    if (!this.in(Math.floor(u), Math.floor(v))) return null;
    return this.zb.dynamic(type, this.x0 + u, y, this.z0 + v, rot || 0, o || {}, anim || {});
  }
  light(u, y, v, o) {
    if (!this.in(Math.floor(u), Math.floor(v))) return null;
    return this.zb.light(this.x0 + u, y, this.z0 + v, o);
  }
  decal(u, y, v, dir, w, h, tex, o) {
    if (!this.in(Math.floor(u), Math.floor(v))) return null;
    return this.zb.decal(this.x0 + u, y, this.z0 + v, dir, w, h, tex, o);
  }
  emitter(u, y, v, snd, o) {
    if (!this.in(Math.floor(u), Math.floor(v))) return null;
    return this.zb.emitter(this.x0 + u, y, this.z0 + v, snd, o);
  }
  fixture(u, v, kind, on, o) {
    if (!this.in(Math.floor(u), Math.floor(v))) return null;
    return this.zb.fixture(this.x0 + u, this.z0 + v, kind, on, o);
  }
  wall(u, v, side, type, mm, mp) { if (this.in(u, v)) this.zb.setWall(this.x0 + u, this.z0 + v, side, type, mm, mp); }
  hLine(v, u0, u1, type, mm, mp) { for (let u = u0; u < u1; u++) this.wall(u, v, 'N', type, mm, mp); }
  vLine(u, v0, v1, type, mm, mp) { for (let v = v0; v < v1; v++) this.wall(u, v, 'W', type, mm, mp); }
}

// A frame for a rectangular room (cells [u0,u1) x [v0,v1)). `door` says on which side of the room
// the corridor lies: 'N' (north of the room), 'S', 'W' or 'E'. Depth b runs from that door wall
// inward, lateral a from the left to the right as seen when entering. pt(a, b) gives local (u, v).
// rotOut / rotIn: prop rotations facing the door / the back wall; rotR / rotL: facing the right /
// left side. A and B are the lateral width and the depth.
export function roomFrame(u0, v0, u1, v1, door) {
  let B, Aa, pt, wa, db;
  switch (door) {
    case 'N': B = [0, 1]; Aa = [-1, 0]; pt = (a, b) => [u1 - a, v0 + b]; wa = u1 - u0; db = v1 - v0; break;
    case 'S': B = [0, -1]; Aa = [1, 0]; pt = (a, b) => [u0 + a, v1 - b]; wa = u1 - u0; db = v1 - v0; break;
    case 'W': B = [1, 0]; Aa = [0, 1]; pt = (a, b) => [u0 + b, v0 + a]; wa = v1 - v0; db = u1 - u0; break;
    default: B = [-1, 0]; Aa = [0, -1]; pt = (a, b) => [u1 - b, v1 - a]; wa = v1 - v0; db = u1 - u0; break;
  }
  return { A: wa, B: db, pt, rotOut: face(-B[0], -B[1]), rotIn: face(B[0], B[1]), rotR: face(Aa[0], Aa[1]), rotL: face(-Aa[0], -Aa[1]) };
}

// A flat brush whose top face carries a planar texture mapping (u from x, w from z). The engine
// clips every brush to its chunks without touching UV rectangles, so the slab is cut here at the
// 16 m chunk grid and each piece gets the rectangle of its own part. mapU(x) / mapW(z) take
// absolute coordinates; faces other than the top come from `sides` (a material or null).
export function flatSlab(Z, u0, v0, u1, v1, y0, y1, mat, mapU, mapW, sides = null, o = {}) {
  const cut = (a, b) => { const out = [a]; for (let k = Math.floor(a / 16) * 16 + 16; k < b; k += 16) out.push(k); out.push(b); return out; };
  const xs = cut(Z.x0 + u0, Z.x0 + u1), zs = cut(Z.z0 + v0, Z.z0 + v1);
  for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1], c = zs[j], d = zs[j + 1];
    const m = sides ?? null;
    if (o.bottom) {
      // underside (seen from below): u runs along -x, w along -z
      const rect = [mapU(b), mapW(c), mapU(a), mapW(d)];
      Z.zb.box(a, y0, c, b, y1, d, [m, m, null, mat, m, m], { uv: ['world', 'world', 'world', rect, 'world', 'world'], collide: o.collide !== false });
    } else {
      const rect = [mapU(a), mapW(c), mapU(b), mapW(d)];
      Z.zb.box(a, y0, c, b, y1, d, [m, m, mat, null, m, m], { uv: ['world', 'world', rect, 'world', 'world', 'world'], collide: o.collide !== false });
    }
  }
}

// ------------------------------------------------------------------ big digits and plates
// White glyphs on transparent tiles; props tint them. Every glyph tile is 64x64 with the glyph at
// scale 8 in the middle (40x56 px of it).
const GLYPHS = '0123456789,-.:/';
const gname = (c) => 'g01_dg_' + (c === ',' ? 'comma' : c === '-' ? 'dash' : c === '.' ? 'dot' : c === ':' ? 'colon' : c === '/' ? 'slash' : c);
for (const c of GLYPHS) {
  defineTexture(gname(c), (p) => {
    p.fill([244, 244, 240]);
    p.clearAlpha(0);
    p.textA(c, 12, 4, 255, 8);
  }, 2);
}

// Number plate / numerals. opts: text, h (digit height, metres), tint [r,g,b] (lit), glow (self-lit
// colour [r,g,b]), bg (material name of a plate behind), pad, frame (material name), thick, adv.
// Local origin: centre of the text at its base, front facing local -z.
const narrow = (c) => c === ',' || c === '.' || c === ':';
const advOf = (c, h, adv) => (narrow(c) ? h * 0.36 : c === ' ' ? h * 0.5 : h * adv);
defineProp('g01_num', {
  build(mb, p) {
    const o = p.opts, text = String(o.text ?? '0'), h = o.h ?? 0.2;
    const adv = o.adv ?? 0.82;
    const ws = [...text].map((c) => advOf(c, h, adv));
    const total = ws.reduce((a, b) => a + b, 0);
    const pad = o.pad ?? h * 0.35;
    const th = o.thick ?? 0.03;
    if (o.bg) {
      if (o.frame) {
        const fw = o.fw ?? 0.04;
        mb.box(-total / 2 - pad - fw, -pad * 0.6 - fw, -th + 0.012, total / 2 + pad + fw, h + pad * 0.6 + fw, 0.002, S(o.frame));
      }
      mb.box(-total / 2 - pad, -pad * 0.6, -th, total / 2 + pad, h + pad * 0.6, 0.001, S(o.bg));
    }
    const z = (o.bg ? -th : 0) - 0.006;
    let x = total / 2;
    const glow = o.glow;
    const yb = -h * 0.0714, yt = h * 1.0714;
    [...text].forEach((c, k) => {
      const w = ws[k];
      if (c !== ' ') {
        const nar = narrow(c);
        const gl = gname(c);
        const st = glow
          ? { layer: T(gl).layer, flags: 1, lit: false, color: [0.06, 0.06, 0.06], flk: glow, chan: o.chan || 0 }
          : T(gl, { tint: o.tint || [1, 0.85, 0.45] });
        const u0 = nar ? 0.24 : 0.1, u1 = nar ? 0.64 : 0.9;
        const hw = (nar ? 0.4 : 0.8) * 1.1429 * h / 2;
        const cx = x - w / 2;
        mb.quad([cx + hw, yb, z, cx - hw, yb, z, cx - hw, yt, z, cx + hw, yt, z], [0, 0, -1], st, [u0, 1, u1, 1, u1, 0, u0, 0]);
      }
      x -= w;
    });
  },
});

// text width in metres of a number plate (for planning)
export function numWidth(text, h, adv = 0.82) {
  return [...String(text)].reduce((a, c) => a + advOf(c, h, adv), 0);
}

// 1234567 -> '1,234,567'
export function withCommas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// ------------------------------------------------------------------ scripts: what is on screen
// Returns a function (x, y, z, margin) -> true when the point is clearly outside the view cone
// (so it can change without anybody seeing it).
export function offscreen(ctx) {
  const p = ctx.player, g = ctx.game;
  const fov = ((g.settings && g.settings.fov) || 56) * Math.PI / 180;
  const asp = g.settings && g.settings.wide ? 16 / 9 : 4 / 3;
  const half = Math.atan(Math.tan(fov / 2) * Math.sqrt(1 + asp * asp));
  const cy = Math.cos(p.pitch || 0);
  const fx = Math.sin(p.yaw) * cy, fy = Math.sin(p.pitch || 0), fz = -Math.cos(p.yaw) * cy;
  const ey = p.y + 1.5;
  return (x, y, z, margin = 0.2) => {
    const dx = x - p.x, dy = y - ey, dz = z - p.z;
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const dot = (dx * fx + dy * fy + dz * fz) / d;
    return dot < Math.cos(Math.min(3.0, half + margin)) || d < 0.01 ? true : false;
  };
}

export { CF, M, W };
