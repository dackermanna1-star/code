// Shared helpers for level group 04 (streets, houses, cars, lamps, skylines).
//  * painters: functions that paint 64x64 textures; each level registers its own palette
//  * driveChannels(): lets a level script own flicker channels (traffic lights, lit windows)
//  * props: g04_car (parked cars), g04_tree (card trees), g04_lamp (street lamps), g04_digit plates
import { defineTexture } from '../../gfx/textures.js';
import { pnoise, pfbm } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as G, propWithXf as withXf } from '../props.js';
import { xfMul, xfTranslate, xfRotY, xfRotZ } from '../../core/math.js';
import { face, tface } from '../pocket/eh_common.js';
import { hr, owns, cbox, M, FACE, only } from './kit.js';

export { face, tface, hr, owns, cbox, M, FACE, only, defineTexture, defineMaterial, VF, defineProp, S, T, G, withXf };

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const FIT = [0, 0, 1, 1];

// ------------------------------------------------------------------ flicker channels owned by a script
// The engine recomputes every flicker channel each frame (after the scripts ran). A level script
// that wants a channel to follow its own pattern (a traffic light, a window that lights up) calls
// driveChannels(game, time, fn) every frame; fn(v, t) edits the channel array right after the
// engine's own update. When the script stops calling (level left) the engine's channels come back.
export function driveChannels(game, time, fn) {
  const f = game.flicker;
  let h = f.__g04;
  if (!h) {
    const orig = f.update.bind(f);
    h = f.__g04 = { fn: null, until: -1 };
    f.update = (t) => { orig(t); if (h.fn && t <= h.until) h.fn(f.v, t); };
  }
  h.fn = fn; h.until = time + 0.35;
}

// ------------------------------------------------------------------ painters
// random walk crack
export function crack(p, x, y, len, c, al = 0.6) {
  const r = p.rng;
  let dx = r.range(-1, 1), dy = r.range(-1, 1);
  for (let k = 0; k < len; k++) {
    p.set(Math.round(x), Math.round(y), c, al);
    x += dx; y += dy;
    if (r.chance(0.35)) { dx += r.range(-0.8, 0.8); dy += r.range(-0.8, 0.8); const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
  }
}

export function paintAsphalt(p, base = [62, 62, 64], o = {}) {
  p.fill(base);
  p.grain(o.grain ?? 0.1);
  p.noise(4, o.noise ?? 0.1, 2);
  p.speckle(o.speckle ?? 90, mul(base, 1.55), 0.3, 0.6);
  p.speckle(o.dark ?? 40, mul(base, 0.6), 0.3, 0.6);
  for (let i = 0; i < (o.cracks ?? 0); i++) crack(p, p.rng.int(0, 63), p.rng.int(0, 63), p.rng.int(8, 26), mul(base, 0.5), 0.8);
  if (o.wet) {
    // glossy streaks that read as wet
    p.map((x, y, c) => {
      const n = pnoise(x, y * 0.5, 8, 5) * 0.6 + pnoise(x * 2, y, 16, 9) * 0.4;
      const k = n > 0.58 ? 1 + (n - 0.58) * o.wet * 3.2 : 1;
      return [c[0] * k, c[1] * k, c[2] * (k * 1.04)];
    });
  }
}

// paint a stripe on an asphalt tile. dir 'z': stripe runs along z (a vertical stripe in the
// texture), at texture column x0..x0+w; 'x': a horizontal stripe. dash = [on, off] in pixels
// along the stripe (null: continuous)
export function stripe(p, dir, at, w, c, dash = null, al = 1) {
  for (let t = 0; t < 64; t++) {
    if (dash && (t % (dash[0] + dash[1])) >= dash[0]) continue;
    for (let k = 0; k < w; k++) {
      if (dir === 'z') p.set(at + k, t, c, al); else p.set(t, at + k, c, al);
    }
  }
}

export function paintConcrete(p, base = [168, 166, 158], o = {}) {
  p.fill(base);
  p.grain(o.grain ?? 0.06);
  p.noise(3, o.noise ?? 0.07, 2);
  if (o.joints !== false) for (let i = 0; i < 64; i++) { p.set(i, 0, mul(base, 0.72)); p.set(0, i, mul(base, 0.72)); p.set(i, 1, mul(base, 1.06)); p.set(1, i, mul(base, 1.06)); }
  p.speckle(o.speckle ?? 40, mul(base, 0.7), 0.3, 0.6);
  for (let i = 0; i < (o.cracks ?? 0); i++) crack(p, p.rng.int(0, 63), p.rng.int(0, 63), p.rng.int(6, 20), mul(base, 0.55), 0.8);
}

export function paintGrass(p, base = [74, 112, 52], o = {}) {
  p.fill(base);
  p.noise(4, o.noise ?? 0.16, 3);
  p.map((x, y, c) => mul(c, 0.82 + p.rng.next() * 0.36));
  if (o.tufts !== 0) p.speckle(o.tufts ?? 90, mul(base, 1.35), 0.3, 0.7);
  if (o.dark) p.speckle(o.dark, mul(base, 0.6), 0.4, 0.8);
  if (o.dirt) p.speckle(o.dirt, o.dirtCol || [110, 92, 62], 0.4, 0.8);
}

export function paintSiding(p, base, o = {}) {
  const board = o.board ?? 8;
  p.fill(base);
  for (let y = 0; y < 64; y += board) {
    p.rect(0, y, 64, 1, mul(base, o.groove ?? 0.78));
    p.rect(0, y + 1, 64, 1, mul(base, o.hi ?? 1.08));
    p.shade(0, y + board - 3, 64, 2, -0.05);
  }
  p.grain(o.grain ?? 0.03);
  p.noise(3, o.noise ?? 0.05, 2);
  if (o.stain) for (let i = 0; i < o.stain; i++) p.stain(p.rng.int(0, 63), p.rng.int(0, 63), p.rng.int(5, 10), mul(base, 0.6), 0.3);
}

export function paintBrick(p, r, c1, c2, mortar, o = {}) {
  p.fill(mortar);
  const bh = o.bh ?? 8, bw = o.bw ?? 16;
  for (let row = 0; row < 64 / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let b = -1; b < 64 / bw + 1; b++) {
      const c = mix(c1, c2, r.next());
      p.rect(off + b * bw + 1, row * bh + 1, bw - 1, bh - 1, c);
    }
  }
  p.grain(o.grain ?? 0.07);
  if (o.stain) for (let i = 0; i < o.stain; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(4, 10), [30, 28, 26], 0.35);
}

export function paintShingle(p, r, base, o = {}) {
  p.fill(mul(base, 0.8));
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 6 : 0;
    for (let x = off; x < 64 + off; x += 12) { p.rect(x, row * 8, 1, 8, mul(base, 0.55)); p.shade(x + 1, row * 8, 11, 8, r.range(-0.1, 0.1)); }
    p.rect(0, row * 8 + 7, 64, 1, mul(base, 0.5));
    p.rect(0, row * 8, 64, 1, mul(base, 1.1));
  }
  p.grain(o.grain ?? 0.07);
  if (o.moss) p.speckle(o.moss, [60, 84, 44], 0.3, 0.6, 2);
}

// window: glass colour, frame colour; lit = emissive warm; curtain = [r,g,b] drawn curtains
export function paintWindow(p, o = {}) {
  const frame = o.frame ?? [200, 200, 196], glass = o.glass ?? [20, 24, 32];
  p.fill(glass);
  if (o.lit) {
    const lit = o.lit;
    p.map((x, y, c) => mul(lit, 0.9 + 0.12 * Math.sin(y * 0.12 + x * 0.05)));
  } else {
    p.map((x, y, c) => (Math.abs(x - y * 0.8 - 14) < 5 ? mul(c, o.gleam ?? 1.7) : c));
  }
  if (o.curtain) {
    const cc = o.curtain;
    for (let x = 0; x < 64; x += 1) {
      const fold = 0.88 + 0.12 * Math.sin(x * 0.9);
      for (let y = 0; y < 64; y++) {
        const edge = x < 20 || x > 43;
        if (edge || o.curtainFull) p.set(x, y, mul(cc, fold));
      }
    }
  }
  p.rect(30, 0, 4, 64, frame); p.rect(0, 30, 64, 4, frame);
  p.frame(0, 0, 64, 64, frame); p.frame(1, 1, 62, 62, frame); p.frame(2, 2, 60, 60, mul(frame, 0.8));
}

export function paintLeaves(p, base, hi, o = {}) {
  p.clearAlpha(0);
  const r = p.rng;
  const cx = 32, cy = o.cy ?? 30, rx = o.rx ?? 29, ry = o.ry ?? 26;
  for (let k = 0; k < (o.blobs ?? 70); k++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next());
    const x = cx + Math.cos(a) * rx * d * 0.85, y = cy + Math.sin(a) * ry * d * 0.85, rad = r.range(4, 9);
    const c = mix(base, hi, r.next());
    for (let yy = Math.floor(y - rad); yy <= y + rad; yy++) for (let xx = Math.floor(x - rad); xx <= x + rad; xx++) {
      const dd = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      if (dd <= rad && Math.hypot((xx - cx) / rx, (yy - cy) / ry) < 1.0) {
        p.set(xx, yy, mul(c, 0.82 + 0.28 * (1 - dd / rad)));
        p.alpha(xx, yy, 255);
      }
    }
  }
  if (o.trunk) {
    p.rect(30, 44, 4, 20, o.trunk); p.alpha(30, 44, 255);
    for (let y = 44; y < 64; y++) for (let x = 30; x < 34; x++) p.alpha(x, y, 255);
  }
}

// skyline silhouette strip (alpha is the shape). o: { seed, lo, hi (px heights), col, win (window
// colour or null), broken (0..1: jagged tops), widthMin/Max }
export function paintSkyline(p, o = {}) {
  p.clearAlpha(0);
  const r = p.rng;
  const col = o.col ?? [40, 44, 56];
  let x = 0;
  const wmin = o.widthMin ?? 4, wmax = o.widthMax ?? 10;
  while (x < 64) {
    let w = r.int(wmin, wmax);
    if (x + w > 64 || 64 - (x + w) < wmin) w = 64 - x;
    const h = Math.round(r.range(o.lo ?? 14, o.hi ?? 50));
    const tone = 0.8 + r.next() * 0.35;
    const bc = mul(col, tone);
    let tilt = 0;
    if (o.broken && r.chance(o.broken)) tilt = r.range(-0.6, 0.6) * h * 0.25;
    for (let xx = x; xx < x + w; xx++) {
      let hh = h + (o.broken ? Math.round(tilt * ((xx - x) / w - 0.5) * 2 + (r.chance(o.broken * 0.5) ? -r.int(0, 5) : 0)) : 0);
      hh = Math.max(4, Math.min(62, hh));
      for (let y = 64 - hh; y < 64; y++) {
        p.set(xx, y, bc);
        p.alpha(xx, y, 255);
        if (o.win && (xx - x) % 3 === 1 && (y % 4) === 1 && r.chance(o.winChance ?? 0.35) && y > 64 - hh + 2) p.set(xx, y, o.win);
      }
      if (o.mast && xx === x + (w >> 1) && r.chance(o.mast)) for (let y = 64 - hh - 6; y < 64 - hh; y++) { p.set(xx, y, bc); p.alpha(xx, y, 255); }
    }
    x += w;
  }
}

// ------------------------------------------------------------------ house number plates
// 'g04_dg0'..'g04_dg9': a dark plate with a white digit; four to five side by side make a number.
for (let d = 0; d < 10; d++) {
  defineTexture('g04_dg' + d, (p) => {
    p.fill([16, 18, 26]);
    p.frame(0, 0, 64, 64, [70, 74, 86]);
    p.text(String(d), 14, 7, [238, 238, 226], 7);
  }, 4);
}
// digits for a plate on a prop (local coordinates): n string, centre (cx, cy), z plane, width of a
// digit; the plate faces local -z
export function plateOnProp(mb, n, cx, cy, z, dw = 0.3, dh = 0.42, tint = [1, 1, 1]) {
  const s = String(n), k = s.length;
  for (let i = 0; i < k; i++) {
    const x = cx + ((k - 1) / 2 - i) * dw;     // viewer at -z: left is +x
    const st = T('g04_dg' + (Math.abs(+s[i]) % 10), { tint });
    mb.quad([x + dw / 2, cy - dh / 2, z, x - dw / 2, cy - dh / 2, z, x - dw / 2, cy + dh / 2, z, x + dw / 2, cy + dh / 2, z], [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
  }
}

// ------------------------------------------------------------------ cars
defineTexture('g04_paint', (p) => { p.fill([214, 214, 208]); p.noise(4, 0.03, 2); p.grain(0.02); p.rect(0, 0, 64, 2, [236, 236, 230], 0.5); }, 6);
defineTexture('g04_glass', (p) => {
  p.fill([22, 28, 34]);
  p.map((x, y, c) => (Math.abs(x - y * 0.6 - 20) < 5 ? mul(c, 2.2) : c));
}, 6);
defineTexture('g04_glass_lit', (p) => { p.fill([236, 214, 150]); p.noise(3, 0.1, 2); }, 4);
defineTexture('g04_hl', (p) => { p.fill([255, 244, 214]); p.disc(32, 32, 24, [255, 255, 245]); p.frame(0, 0, 64, 64, [190, 190, 180]); }, 4);
defineTexture('g04_hl_off', (p) => { p.fill([120, 124, 128]); p.disc(32, 32, 24, [150, 154, 158]); p.frame(0, 0, 64, 64, [60, 60, 64]); }, 4);
defineTexture('g04_tail', (p) => { p.fill([150, 14, 14]); p.rect(2, 20, 60, 24, [230, 40, 30]); p.frame(0, 0, 64, 64, [60, 8, 8]); }, 4);
defineTexture('g04_grille', (p) => { p.fill([34, 34, 38]); for (let y = 4; y < 64; y += 8) p.rect(4, y, 56, 3, [150, 152, 158]); p.frame(0, 0, 64, 64, [80, 82, 88]); }, 4);
defineTexture('g04_plate', (p) => { p.fill([220, 214, 190]); p.rect(2, 2, 60, 60, [236, 232, 214]); p.text('1F9', 6, 22, [30, 40, 120], 3); }, 4);
defineTexture('g04_tire', (p) => { p.fill([24, 24, 26]); for (let y = 0; y < 64; y += 6) p.rect(0, y, 64, 2, [42, 42, 46]); }, 4);
defineTexture('g04_interior', (p) => { p.fill([26, 24, 24]); p.noise(3, 0.3, 2); }, 4);
defineMaterial('g04_paint', 'g04_paint', { s: 1.5, surf: 'metal' });
defineMaterial('g04_tire', 'g04_tire', { s: 0.5, surf: 'metal' });

// Parked car, front toward local -z. opts: kind sedan|wagon|van|pickup, col [r,g,b] paint tint,
// hl: headlights on (0 = off, 1 = on), dome: interior light, door: 0 closed / 1 driver's door
// open / 2 passenger door open, hood: bonnet open, flat: flat tyres (sags), dust: darker, rust,
// ch: flicker channel for the lamps.
const PROFILES = {
  sedan: { L: 2.2, pts: [[-2.2, 0.3], [-2.2, 0.8], [-1.05, 0.88], [-0.45, 1.38], [0.95, 1.38], [1.55, 0.92], [2.2, 0.9], [2.2, 0.3]], gl: [[-0.55, 0.78], [-0.3, 0.28]], sideGlass: [-0.78, 1.42, -0.3, 0.88], h: 1.4 },
  wagon: { L: 2.3, pts: [[-2.3, 0.3], [-2.3, 0.8], [-1.1, 0.88], [-0.5, 1.4], [1.45, 1.4], [2.05, 0.98], [2.3, 0.98], [2.3, 0.3]], sideGlass: [-0.84, 1.95, -0.34, 1.4], h: 1.42 },
  van: { L: 2.4, pts: [[-2.4, 0.3], [-2.4, 0.95], [-1.8, 1.0], [-1.45, 1.78], [2.4, 1.82], [2.4, 0.3]], sideGlass: [-1.32, -0.35, 1.0, 1.7], h: 1.85 },
  pickup: { L: 2.5, pts: [[-2.5, 0.3], [-2.5, 0.9], [-1.25, 0.98], [-0.7, 1.5], [0.4, 1.5], [0.7, 0.98], [2.5, 0.98], [2.5, 0.3]], sideGlass: [-0.62, 0.3, 1.0, 1.44], h: 1.5 },
};
defineProp('g04_car', {
  build(mb, p) {
    const o = p.opts, kind = PROFILES[o.kind] ? o.kind : 'sedan', P = PROFILES[kind];
    const col = o.col || [0.8, 0.8, 0.8];
    const dim = o.dust ? 0.82 : 1;
    const paint = S('g04_paint', { tint: [col[0] * dim, col[1] * dim, col[2] * dim] });
    const glass = o.dome ? { ...G('g04_glass_lit', 0.75, o.ch || 0), flags: VF.FULLBRIGHT } : S('g04_paint', { tint: [0.1, 0.12, 0.14] });
    const gl = T('g04_glass');
    const dark = S('g04_tire');
    const W = 0.88, sag = o.flat ? -0.1 : 0;
    const pts = P.pts.map(([z, y]) => [z, y + (y > 0.31 ? sag : 0)]);
    const n = pts.length;
    // sides: fan from the bottom centre
    for (const sx of [-1, 1]) {
      const c0 = [sx * W, 0.3, 0];
      for (let i = 0; i < n - 1; i++) {
        tface(mb, c0, [sx * W, pts[i][1], pts[i][0]], [sx * W, pts[i + 1][1], pts[i + 1][0]], [sx, 0, 0], paint, 1.5, 1.5);
      }
    }
    // top surfaces: hood, windscreen, roof, rear screen, trunk
    for (let i = 1; i < n - 2; i++) {
      const a = pts[i], b = pts[i + 1];
      const steep = Math.abs(b[1] - a[1]) > 0.3;
      const st = steep ? gl : paint;
      face(mb, [-W, a[1], a[0]], [W, a[1], a[0]], [W, b[1], b[0]], [-W, b[1], b[0]], [0, 1, 0], st, steep ? 1.2 : 1.5, steep ? 1.2 : 1.5);
    }
    // front and rear faces
    face(mb, [-W, pts[0][1], pts[0][0]], [W, pts[0][1], pts[0][0]], [W, pts[1][1], pts[1][0]], [-W, pts[1][1], pts[1][0]], [0, 0, -1], T('g04_grille'), 1.76, 0.5);
    face(mb, [-W, pts[n - 2][1], pts[n - 2][0]], [W, pts[n - 2][1], pts[n - 2][0]], [W, pts[n - 1][1], pts[n - 1][0]], [-W, pts[n - 1][1], pts[n - 1][0]], [0, 0, 1], paint, 1.5, 1.5);
    // side windows (glass quads just outside the body)
    const sg = P.sideGlass;
    const doorSide = o.door === 1 ? -1 : o.door === 2 ? 1 : 0;
    for (const sx of [-1, 1]) {
      let z0, z1, zt0, zt1, yb, yt;
      if (kind === 'van') { z0 = sg[0]; z1 = sg[1]; zt0 = sg[0] + 0.2; zt1 = sg[1]; yb = sg[2]; yt = sg[3]; }
      else if (kind === 'pickup') { z0 = sg[0]; z1 = sg[1]; zt0 = z0 + 0.35; zt1 = z1 - 0.3; yb = sg[2]; yt = sg[3]; }
      else { z0 = sg[0]; z1 = sg[1]; zt0 = z0 + 0.5; zt1 = z1 - 0.62; yb = sg[2] + 0; yt = sg[3]; }
      if (doorSide === sx) continue;
      const x = sx * (W + 0.012);
      const g = [[x, yb + sag, z0], [x, yb + sag, z1], [x, yt + sag, zt1], [x, yt + sag, zt0]];
      face(mb, g[0], g[1], g[2], g[3], [sx, 0, 0], glass.layer !== undefined && o.dome ? glass : gl, 1.2, 1.2);
    }
    // an open door: the leaf swings out about the front edge
    if (doorSide) {
      const sx = doorSide;
      const hz = kind === 'van' ? -1.3 : kind === 'pickup' ? -0.62 : -0.76;
      const len = kind === 'van' ? 1.0 : 1.05, yb = P.sideGlass[2] - 0.3, yt = P.sideGlass[3] + 0.0;
      withXf(mb, xfMul(xfTranslate(sx * W, 0, hz), xfRotY(-sx * 1.15)), () => {
        mb.box(-0.02, yb, 0, 0.02, yt, len, [paint, paint, paint, paint, paint, paint]);
        face(mb, [sx * 0.03, yb + 0.55, 0.06], [sx * 0.03, yb + 0.55, len - 0.08], [sx * 0.03, yt - 0.04, len - 0.2], [sx * 0.03, yt - 0.04, 0.2], [sx, 0, 0], gl, 1.2, 1.2);
      });
      // the dark doorway
      mb.quad([sx * (W - 0.01), yb, hz + len, sx * (W - 0.01), yb, hz, sx * (W - 0.01), yt, hz, sx * (W - 0.01), yt, hz + len].map((v, i) => v), [-sx, 0, 0], T('g04_interior'), sx > 0 ? [0, 1, 1, 1, 1, 0, 0, 0] : [1, 1, 0, 1, 0, 0, 1, 0]);
    }
    // bonnet open
    if (o.hood) {
      const a = pts[1];
      withXf(mb, xfMul(xfTranslate(0, a[1] + 0.02, pts[1][0] + 1.0), xfRotY(0)), () => {});
      face(mb, [-W, a[1] + 0.02, a[0] + 1.15], [W, a[1] + 0.02, a[0] + 1.15], [W, a[1] + 0.9, a[0] + 1.3], [-W, a[1] + 0.9, a[0] + 1.3], [0, 0, -1], paint, 1.5, 1.5);
    }
    // pickup bed walls
    if (kind === 'pickup') {
      const L = P.L;
      mb.box(-W, 0.98, 0.7, -W + 0.08, 1.2, L, paint, { skip: 8 });
      mb.box(W - 0.08, 0.98, 0.7, W, 1.2, L, paint, { skip: 8 });
      mb.box(-W, 0.98, 0.7, W, 1.2, 0.78, paint, { skip: 8 });
      mb.box(-W, 0.98, L - 0.08, W, 1.2, L, paint, { skip: 8 });
      mb.box(-W + 0.08, 0.7, 0.78, W - 0.08, 0.72, L - 0.08, S('g04_tire'), { skip: 8 });
    }
    // lamps
    const front = -P.L - 0.012, rear = P.L + 0.012;
    const hl = o.hl ? { ...G('g04_hl', 1.5, o.ch || 0), flags: VF.FULLBRIGHT | VF.NOFOG } : T('g04_hl_off', { tint: [0.6, 0.6, 0.62] });
    for (const sx of [-1, 1]) {
      const x = sx * 0.58, y0 = (kind === 'van' ? 0.5 : 0.55) + sag;
      mb.quad([x + 0.2, y0, front, x - 0.2, y0, front, x - 0.2, y0 + 0.16, front, x + 0.2, y0 + 0.16, front], [0, 0, -1], hl, [0, 1, 1, 1, 1, 0, 0, 0]);
      const tl = o.tail ? { ...G('g04_tail', 1.2, o.ch || 0), flags: VF.FULLBRIGHT } : T('g04_tail', { tint: [0.55, 0.45, 0.45] });
      mb.quad([x - 0.2, 0.62 + sag, rear, x + 0.2, 0.62 + sag, rear, x + 0.2, 0.78 + sag, rear, x - 0.2, 0.78 + sag, rear], [0, 0, 1], tl, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
    // plates
    mb.quad([0.2, 0.42 + sag, rear + 0.002, -0.2, 0.42 + sag, rear + 0.002, -0.2, 0.55 + sag, rear + 0.002, 0.2, 0.55 + sag, rear + 0.002], [0, 0, 1], T('g04_plate'), [0, 1, 1, 1, 1, 0, 0, 0]);
    // wheels
    const zf = kind === 'van' ? -1.45 : kind === 'pickup' ? -1.5 : -1.3, zr = kind === 'van' ? 1.5 : kind === 'pickup' ? 1.6 : 1.45;
    const wr = kind === 'van' ? 0.34 : 0.31;
    for (const sx of [-1, 1]) for (const z of [zf, zr]) {
      withXf(mb, xfMul(xfTranslate(sx * 0.8, wr + (o.flat ? -0.07 : 0), z), xfRotZ(Math.PI / 2)), () => mb.cyl(0, -0.11, 0, wr * (o.flat ? 0.85 : 1), 0.22, 8, dark, 3));
    }
  },
  boxes: (p) => { const P = PROFILES[(p.opts && p.opts.kind) || 'sedan'] || PROFILES.sedan; return [[-0.9, 0, -P.L, 0.9, P.h, P.L]]; },
  light: { x: 0, y: 0.75, z: -3.4, color: [1.0, 0.95, 0.8], rad: 8.5, int: 1.15, cond: (p) => !!(p.opts && p.opts.hl) },
});

// ------------------------------------------------------------------ trees (crossed cards)
// opts: kind 'round' | 'tall' | 'bare' | 'conifer'; h total height; tex card texture name
defineTexture('g04_bark', (p) => { p.fill([58, 44, 34]); p.noise(6, 0.25, 2); for (let x = 0; x < 64; x += 5) p.rect(x, 0, 1, 64, [34, 26, 20], 0.7); }, 6);
defineMaterial('g04_bark', 'g04_bark', { s: 0.6, surf: 'wood' });
defineProp('g04_tree', {
  build(mb, p, r) {
    const o = p.opts, h = o.h || 6.5, kind = o.kind || 'round';
    const bark = S('g04_bark', o.barkTint ? { tint: o.barkTint } : undefined);
    const tex = o.tex || 'g04_leaf_a';
    const st = T(tex, o.tint ? { tint: o.tint } : undefined);
    const th = h * (kind === 'tall' ? 0.5 : kind === 'conifer' ? 0.3 : 0.42);
    mb.cyl(0, 0, 0, kind === 'tall' ? 0.16 : 0.22, th, 5, bark, 2);
    if (kind === 'bare') {
      // bare branches: a few thin rods
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4 + r.range(-0.3, 0.3), l = r.range(1.2, 2.4), y0 = th * r.range(0.55, 1.0);
        mb.rod(0, y0, 0, Math.cos(a) * l, y0 + r.range(0.5, 1.6), Math.sin(a) * l, 0.05, 4, bark, false);
      }
      mb.cyl(0, th, 0, 0.1, h - th, 4, bark, 2);
      return;
    }
    const cw = o.cw || (kind === 'tall' ? 3.4 : kind === 'conifer' ? 3.6 : 5.2);
    const ch = h - th * (kind === 'conifer' ? 0.5 : 0.7);
    const y0 = h - ch;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + r.range(-0.15, 0.15);
      withXf(mb, xfRotY(a), () => {
        mb.card([cw / 2, y0, 0, -cw / 2, y0, 0, -cw / 2, y0 + ch, 0, cw / 2, y0 + ch, 0], [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
      });
    }
  },
  boxes: [[-0.25, 0, -0.25, 0.25, 3, 0.25]],
});

// ------------------------------------------------------------------ street lamps
// A lamp as brushes (visible as far as the fog reaches). Arm reaches toward direction dir
// ('N' -z, 'S' +z, 'E' +x, 'W' -x). Returns the position of the lamp head.
defineTexture('g04_lens_w', (p) => { p.fill([255, 250, 232]); p.disc(32, 32, 26, [255, 255, 250], 1, 6); }, 4);
defineTexture('g04_lens_y', (p) => { p.fill([255, 190, 96]); p.disc(32, 32, 26, [255, 226, 160], 1, 6); }, 4);
defineTexture('g04_lens_b', (p) => { p.fill([110, 170, 255]); p.disc(32, 32, 26, [200, 230, 255], 1, 6); }, 4);
defineTexture('g04_lens_g', (p) => { p.fill([150, 230, 190]); p.disc(32, 32, 26, [225, 255, 235], 1, 6); }, 4);
defineMaterial('g04_lens_w', 'g04_lens_w', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.15 });
defineMaterial('g04_lens_y', 'g04_lens_y', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.2 });
defineMaterial('g04_lens_b', 'g04_lens_b', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.2 });
defineMaterial('g04_lens_g', 'g04_lens_g', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.15 });
for (const ch of [1, 2, 3, 4, 5, 6]) {
  for (const k of ['w', 'y', 'b', 'g']) defineMaterial('g04_lens_' + k + ch, 'g04_lens_' + k, { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.2, chan: ch });
}
defineTexture('g04_pole', (p) => { p.fill([58, 60, 64]); p.noise(6, 0.14, 2); p.rect(0, 0, 8, 64, [78, 80, 86], 0.5); }, 4);
defineMaterial('g04_pole', 'g04_pole', { s: 1.2, surf: 'metal' });
defineMaterial('g04_pole_dead', 'g04_pole', { s: 1.2, surf: 'metal', tint: [0.7, 0.7, 0.72] });

export function lamp(zb, x, z, dir, o = {}) {
  if (!owns(zb, x, z)) return null;
  const y = o.y ?? 0;
  const h = o.h ?? 7.2, arm = o.arm ?? 1.9, hw = 0.075;
  const dx = dir === 'E' ? 1 : dir === 'W' ? -1 : 0, dz = dir === 'S' ? 1 : dir === 'N' ? -1 : 0;
  const pole = o.pole ?? M.g04_pole;
  zb.box(x - hw, y, z - hw, x + hw, y + h, z + hw, pole);
  zb.box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.35, z + 0.2, pole);
  // arm
  const ax = x + dx * arm, az = z + dz * arm;
  zb.box(Math.min(x, ax) - 0.05, y + h - 0.12, Math.min(z, az) - 0.05, Math.max(x, ax) + 0.05, y + h - 0.02, Math.max(z, az) + 0.05, pole);
  const hx = x + dx * (arm - 0.1), hz = z + dz * (arm - 0.1);
  const lens = o.lens ?? M.g04_lens_y;
  const wx = dx ? 0.55 : 0.32, wz = dz ? 0.55 : 0.32;
  if (o.dead) zb.box(hx - wx, y + h - 0.28, hz - wz, hx + wx, y + h - 0.1, hz + wz, pole);
  else {
    zb.box(hx - wx, y + h - 0.28, hz - wz, hx + wx, y + h - 0.1, hz + wz, [pole, pole, pole, lens, pole, pole].map((m, i) => (i === 3 ? lens : pole)));
    zb.light(hx, y + h - 0.5, hz, { color: o.color || [1.0, 0.72, 0.4], rad: o.rad ?? 10, int: o.int ?? 0.95, ch: o.ch || 0 });
  }
  return [hx, y + h - 0.2, hz];
}

// ------------------------------------------------------------------ traffic signals (brushes, so they show as far as the fog)
// Lens materials g04_sig_<r|a|g><ch>: ch 0 steady, 1..12 follow that flicker channel.
const SIG = { r: [[40, 6, 6], [255, 56, 40], [255, 170, 150]], a: [[46, 30, 4], [255, 176, 24], [255, 226, 150]], g: [[6, 40, 24], [36, 236, 130], [190, 255, 220]] };
for (const k of ['r', 'a', 'g']) {
  const [dk, mid, hi] = SIG[k];
  defineTexture('g04_sig_' + k, (p) => { p.fill(dk); p.disc(32, 32, 27, mid); p.disc(32, 32, 13, hi, 1, 6); }, 6);
  for (let ch = 0; ch <= 12; ch++) defineMaterial('g04_sig_' + k + (ch || ''), 'g04_sig_' + k, { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG, glow: 1.25, chan: ch });
}
defineTexture('g04_sig_off', (p) => { p.fill([14, 14, 16]); p.disc(32, 32, 27, [30, 30, 34]); p.disc(24, 24, 7, [60, 62, 70], 1, 4); }, 6);
defineMaterial('g04_sig_off', 'g04_sig_off', { s: 1, surf: 'plastic' });
defineTexture('g04_sig_body', (p) => { p.fill([40, 42, 40]); p.noise(5, 0.15, 2); }, 4);
defineMaterial('g04_sig_body', 'g04_sig_body', { s: 1, surf: 'metal' });

// One signal head on a pole at (x, z): the lenses face `face` ('N' = toward -z, 'S' +z, 'E' +x, 'W' -x).
// chans = [red, amber, green] channel numbers (0 steady) or null for a dead head.
export function signalHead(zb, x, y, z, face, chans, k = 1) {
  const dx = face === 'E' ? 1 : face === 'W' ? -1 : 0, dz = face === 'S' ? 1 : face === 'N' ? -1 : 0;
  const hx = x + dx * 0.34 * k, hz = z + dz * 0.34 * k;
  const ax = (dz ? 0.2 : 0.18) * k, az = (dz ? 0.18 : 0.2) * k;
  zb.box(hx - ax, y - 0.55 * k, hz - az, hx + ax, y + 0.55 * k, hz + az, M.g04_sig_body, { collide: false });
  zb.box(Math.min(x, hx) - 0.06, y - 0.05, Math.min(z, hz) - 0.06, Math.max(x, hx) + 0.06, y + 0.05, Math.max(z, hz) + 0.06, M.g04_sig_body, { collide: false });
  const fx = hx + dx * 0.19 * k, fz = hz + dz * 0.19 * k;
  const mats = chans ? ['r', 'a', 'g'].map((c, i) => M['g04_sig_' + c + (chans[i] || '')]) : [M.g04_sig_off, M.g04_sig_off, M.g04_sig_off];
  for (let i = 0; i < 3; i++) {
    const yy = y + (0.34 - i * 0.34) * k, q = 0.12 * k;
    zb.box(fx - (dz ? q : 0.02), yy - q, fz - (dx ? q : 0.02), fx + (dz ? q : 0.02), yy + q, fz + (dx ? q : 0.02), mats[i], { collide: false });
  }
}
// A signal pole at (x, z) with heads facing the listed directions
export function signalPole(zb, x, z, heads, o = {}) {
  if (!owns(zb, x, z)) return;
  const y0 = o.y ?? 0, h = o.h ?? 4.9;
  zb.box(x - 0.09, y0, z - 0.09, x + 0.09, y0 + h, z + 0.09, M.g04_pole);
  zb.box(x - 0.2, y0, z - 0.2, x + 0.2, y0 + 0.3, z + 0.2, M.g04_pole);
  for (const hd of heads) signalHead(zb, x, y0 + h - 0.9 * (o.k ?? 1), z, hd.face, hd.chans, o.k ?? 1);
}
