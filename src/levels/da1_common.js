// Dead Air 1 (The Greenhouse): shared layout constants and small builders.
//
// Plan (x east, z south, y up; street level 0):
//   Building A  x   0..32  z 16..44  roof 18.0  (greenhouse + start safe room)
//   alley gap   x  32..39            (plank bridge at z 36.2..37.8)
//   Building B  x  39..66  z 16..44  roof 18.0, floors 14.4 / 10.8 used
//   Building C  x  66..80  z 16..44  roof  7.2  (rooftop bar, crashed news chopper)
//   Building D  x  80..104 z 16..44  2F  7.2   (insurance office, broken window)
//   Harbor St   z 44..64  (semi trailer against D at z 44..46.6)
//   Harborview Hotel x 70..134 z 64..110 (loading dock x 108..124, kitchen safe room)
import * as THREE from 'three';
import { P } from './kit.js';
import { makeRng } from '../core/math.js';
import { DF } from '../render/decals.js';

export const YA = 18;      // roofs of A and B
export const F4 = 14.4;    // B top floor
export const F3 = 10.8;    // B floor below (reached through the burned floor)
export const YC = 7.2;     // C roof = D second floor
export const ZS = 44;      // street-front facade line (north side of Harbor St)
export const ZN = 16;      // back facade line
export const HY = 1.2;     // hotel service level (loading dock)
export const rng = makeRng(9101);

// rotate a local offset (lx, lz) by ry around (x, z) -> [wx, wz]
export function rot(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + c * lx + s * lz, z - s * lx + c * lz];
}

// Decorative window grid on one face of a solid block (visual only).
// face 'n'|'s' runs along X at z = fixed; 'e'|'w' along Z at x = fixed.
// o: {fh, dx, w, h, sill, lit, broken, boarded, curtains, ac, skip:(a,y)=>bool, y0, frame, glassTint}
export function windowGrid(L, face, a0, a1, fixed, y0, y1, o = {}) {
  const fh = o.fh ?? 3.6, dx = o.dx ?? 2.8, ww = o.w ?? 1.3, wh = o.h ?? 1.6, sill = o.sill ?? 0.95;
  const out = face === 'n' || face === 'w' ? -1 : 1; // outward normal sign
  const alongX = face === 'n' || face === 's';
  const f0 = fixed + out * 0.005;
  const B = o.batch || L;
  const vb = (x0, yy0, z0, x1, yy1, z1, mat, tint) => B.box(x0, yy0, z0, x1, yy1, z1, mat, { collide: false, tint });
  const quad = (a, yy, w, h, d, mat, tint) => {
    if (alongX) vb(a - w / 2, yy, Math.min(f0, f0 + out * d), a + w / 2, yy + h, Math.max(f0, f0 + out * d), mat, tint);
    else vb(Math.min(f0, f0 + out * d), yy, a - w / 2, Math.max(f0, f0 + out * d), yy + h, a + w / 2, mat, tint);
  };
  const n = Math.max(1, Math.floor((a1 - a0 - 0.6) / dx));
  const start = a0 + (a1 - a0 - (n - 1) * dx) / 2;
  for (let fy = (o.y0 ?? y0); fy + sill + wh < y1 - 0.2; fy += fh) {
    for (let i = 0; i < n; i++) {
      const a = start + i * dx;
      if (o.skip && o.skip(a, fy)) continue;
      const yy = fy + sill;
      const r = rng();
      const lit = r < (o.lit ?? 0.1);
      const broken = !lit && r < (o.lit ?? 0.1) + (o.broken ?? 0.08);
      const boarded = !lit && !broken && rng() < (o.boarded ?? 0.05);
      // sill + lintel + reveal
      quad(a, yy - 0.12, ww + 0.24, 0.12, 0.08, o.sillMat ?? 'concrete', o.sillTint ?? 0xa8a49c);
      quad(a, yy + wh, ww + 0.1, 0.14, 0.05, o.sillMat ?? 'concrete', o.sillTint ?? 0xa8a49c);
      if (lit) {
        quad(a, yy, ww, wh, 0.02, 'emissiveWindow');
        if (rng() < (o.curtains ?? 0.6)) quad(a - ww * 0.28, yy, ww * 0.46, wh, 0.03, 'fabric', rng.pick([0x8a3a2a, 0x3a5a7a, 0xc8b890, 0x5a6a3a, 0x7a2a4a]));
      } else if (broken) {
        quad(a, yy, ww, wh, 0.02, 'blackMatte', 0x050505);
      } else {
        quad(a, yy, ww, wh, 0.02, 'glassDirty', o.glassTint ?? 0x141c22);
        if (rng() < (o.curtains ?? 0.35)) quad(a + ww * 0.25, yy + 0.05, ww * 0.42, wh - 0.1, 0.01, 'fabric', rng.pick([0x5a4a3a, 0x3a3a48, 0x6a5a4a]));
      }
      if (boarded) for (let k = 0; k < 3; k++) quad(a, yy + 0.2 + k * 0.5, ww + 0.2, 0.22, 0.05, 'woodPale', 0x8a7a60);
      // mullion
      if (!broken && !boarded && o.frame !== false) quad(a, yy, 0.05, wh, 0.035, 'metalDark');
      // window AC unit under some windows
      if (o.ac && rng() < o.ac) {
        if (alongX) vb(a - 0.35, yy - 0.05, Math.min(f0, f0 + out * 0.55), a + 0.35, yy + 0.4, Math.max(f0, f0 + out * 0.55), 'metal', 0x9a9a94);
        else vb(Math.min(f0, f0 + out * 0.55), yy - 0.05, a - 0.35, Math.max(f0, f0 + out * 0.55), yy + 0.4, a + 0.35, 'metal', 0x9a9a94);
      }
    }
    // floor band / cornice line
    if (o.bands !== false) {
      if (alongX) vb(a0, fy - 0.12, Math.min(f0, f0 + out * 0.06), a1, fy + 0.06, Math.max(f0, f0 + out * 0.06), o.bandMat ?? 'concrete', o.bandTint ?? 0x8a867e);
      else vb(Math.min(f0, f0 + out * 0.06), fy - 0.12, a0, Math.max(f0, f0 + out * 0.06), fy + 0.06, a1, o.bandMat ?? 'concrete', o.bandTint ?? 0x8a867e);
    }
  }
}

// Decorative exterior fire escape on a face (visual only): landings + zigzag stairs.
export function fireEscapeDeco(L, face, a0, a1, fixed, y0, y1, fh = 3.6, o = {}) {
  const out = face === 'n' || face === 'w' ? -1 : 1;
  const alongX = face === 'n' || face === 's';
  const d0 = fixed, d1 = fixed + out * 1.3;
  const B = o.batch || L;
  const vb = (x0, yy0, z0, x1, yy1, z1, mat) => B.box(x0, yy0, z0, x1, yy1, z1, mat, { collide: false });
  for (let y = y0; y < y1; y += fh) {
    if (alongX) {
      vb(a0, y - 0.06, Math.min(d0, d1), a1, y, Math.max(d0, d1), 'diamond');
      vb(a0, y + 0.9, Math.min(d1, d1 - out * 0.04), a1, y + 0.95, Math.max(d1, d1 - out * 0.04), 'metalDark');
      for (let a = a0; a <= a1 + 0.01; a += (a1 - a0) / 3) vb(a - 0.02, y, Math.min(d1, d1 - out * 0.04), a + 0.02, y + 0.95, Math.max(d1, d1 - out * 0.04), 'metalDark');
    } else {
      vb(Math.min(d0, d1), y - 0.06, a0, Math.max(d0, d1), y, a1, 'diamond');
      vb(Math.min(d1, d1 - out * 0.04), y + 0.9, a0, Math.max(d1, d1 - out * 0.04), y + 0.95, a1, 'metalDark');
      for (let a = a0; a <= a1 + 0.01; a += (a1 - a0) / 3) vb(Math.min(d1, d1 - out * 0.04), y, a - 0.02, Math.max(d1, d1 - out * 0.04), y + 0.95, a + 0.02, 'metalDark');
    }
    // diagonal stair between landings (a sloped thin box via prop)
    if (y + fh < y1) {
      const len = Math.hypot(a1 - a0 - 0.6, fh);
      const ang = Math.atan2(fh, a1 - a0 - 0.6);
      const mid = (a0 + a1) / 2, md = (d0 + d1) / 2;
      if (alongX) P.prop(L, mid, y + fh / 2, md, 0).box(0, 0, 0, len, 0.08, 0.9, 'diamond', null, [0, 0, ang]);
      else P.prop(L, md, y + fh / 2, mid, Math.PI / 2).box(0, 0, 0, len, 0.08, 0.9, 'diamond', null, [0, 0, ang]);
    }
  }
}

// Dead plant clump (for planters / pots): drooping brown leaves.
export function deadPlant(L, x, y, z, s = 1, tint) {
  const p = P.prop(L, x, y, z, rng() * 6.28);
  const c = tint ?? rng.pick([0x4a3a22, 0x5a4a2a, 0x3a3020, 0x5a5028, 0x4a4a2a]);
  p.cyl(0, 0.25 * s, 0, 0.015 * s, 0.5 * s, 'woodDark', 0x3a2a1a, null, 5);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + rng();
    p.box(Math.cos(a) * 0.12 * s, 0.32 * s + rng() * 0.2 * s, Math.sin(a) * 0.12 * s, 0.22 * s, 0.015, 0.07 * s, 'foliage', c, [rng() * 0.6 + 0.3, a, 0.4]);
  }
  p.sph(0, 0.5 * s, 0, 0.13 * s, 'foliage', c, [1.2, 0.6, 1.2]);
  return p;
}
export function pot(L, x, y, z, r = 0.16, h = 0.28, plant = true) {
  const p = P.prop(L, x, y, z, 0);
  p.cyl(0, h / 2, 0, r, h, 'dirt', 0xa0582e, null, 10);
  p.cyl(0, h + 0.01, 0, r * 0.9, 0.02, 'dirt', 0x2a2018, null, 10);
  if (plant) deadPlant(L, x, y + h, z, r * 3.5);
  return p;
}

// Blood trail between two points on a floor.
export function bloodTrail(L, x0, z0, x1, z1, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    L.decal(x0 + (x1 - x0) * t + (rng() - 0.5) * 0.3, y + 0.012, z0 + (z1 - z0) * t + (rng() - 0.5) * 0.3, 0, 1, 0, 0.6 + rng() * 0.6, rng() < 0.5 ? DF.SMEAR : DF.BLOOD1 + (i % 4));
  }
}
export function scatterBlood(L, x0, z0, x1, z1, y, n = 3) {
  for (let i = 0; i < n; i++) L.decal(x0 + rng() * (x1 - x0), y + 0.012, z0 + rng() * (z1 - z0), 0, 1, 0, 0.7 + rng() * 1.2, DF.BLOOD1 + Math.floor(rng() * 4));
}

// Rooftop vent / exhaust stack / skylight bits.
export function roofVent(L, x, y, z, r = 0.25, h = 0.9) {
  const p = P.prop(L, x, y, z, 0);
  p.cyl(0, h / 2, 0, r, h, 'metal', 0x9a9c98, null, 10);
  p.cyl(0, h + 0.12, 0, r * 1.5, 0.08, 'metalDark', null, null, 10);
  p.cyl(0, h + 0.04, 0, r * 0.6, 0.08, 'blackMatte', null, null, 8);
  p.col(0, h / 2, 0, r * 2, h, r * 2, 'metal');
  return p;
}
export function skylight(L, x0, z0, x1, z1, y, o = {}) {
  L.box(x0, y, z0, x1, y + 0.45, z1, 'metalDark');
  const p = P.prop(L, (x0 + x1) / 2, y + 0.45, (z0 + z1) / 2, 0);
  const w = x1 - x0, d = z1 - z0;
  p.box(0, 0.25, -d / 4, w - 0.1, 0.03, d / 2 + 0.05, o.broken ? 'blackMatte' : 'glassDirty', 0x2a3438, [0.45, 0, 0]);
  p.box(0, 0.25, d / 4, w - 0.1, 0.03, d / 2 + 0.05, 'glassDirty', 0x2a3438, [-0.45, 0, 0]);
  p.box(0, 0.47, 0, w, 0.06, 0.08, 'metalDark');
}
export function satDish(L, x, y, z, ry, r = 0.6) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 0.08, 1.0, 0.08, 'metalDark');
  p.cyl(0, 1.1, 0.05, r, 0.06, 'metal', 0xc8c8c4, [1.1, 0, 0], 16);
  p.box(0, 1.2, -0.35, 0.03, 0.03, 0.7, 'metalDark', null, [-0.3, 0, 0]);
  p.col(0, 0.6, 0, 0.3, 1.2, 0.3, 'metal');
}
export function lawnChair(L, x, y, z, ry, color = 0x3a7a8a) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.32, 0, 0.55, 0.04, 0.55, 'plastic', color);
  p.box(0, 0.62, 0.3, 0.55, 0.6, 0.04, 'plastic', color, [-0.35, 0, 0]);
  for (const sx of [-0.25, 0.25]) for (const sz of [-0.25, 0.25]) p.box(sx, 0.16, sz, 0.03, 0.32, 0.03, 'metalClean');
  p.col(0, 0.35, 0, 0.6, 0.7, 0.6, 'fabric');
}
export function stringLights(L, pts, y, o = {}) {
  // bulbs along a sagging line through points [[x,z],...]
  const bulbs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 0.7));
    for (let k = 0; k <= n; k++) {
      const t = k / n, sag = Math.sin(t * Math.PI) * (o.sag ?? 0.35);
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, yy = y - sag;
      if (k < n) P.pipe(L, x, yy, z, ax + (bx - ax) * (k + 1) / n, y - Math.sin((k + 1) / n * Math.PI) * (o.sag ?? 0.35), az + (bz - az) * (k + 1) / n, 0.006, 'blackMatte');
      L.box(x - 0.04, yy - 0.12, z - 0.04, x + 0.04, yy - 0.04, z + 0.04, (k + i) % 5 === 3 && o.dead !== false ? 'blackMatte' : 'emissiveWarm', { collide: false });
      bulbs.push([x, yy, z]);
    }
  }
  return bulbs;
}
