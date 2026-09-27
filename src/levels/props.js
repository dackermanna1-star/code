// Static prop library. Props are merged into level geometry batches (cheap)
// and register approximate collision boxes. Coordinates: (x, y, z) is the
// floor point under the prop's centre; ry rotates around Y (0 = default).
// Most props are built so their "front" faces -Z before rotation.
import * as THREE from 'three';
import { trs, unitBox, unitCyl, unitSphere } from '../world/geom.js';
import { F_DEFAULT, F_SOLID, F_SHOOT, F_SIGHT } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { makeRng } from '../core/math.js';

const rnd = makeRng(1234);
const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();

// Local-space part helper bound to a prop transform.
class P {
  constructor(L, x, y, z, ry = 0) {
    this.L = L;
    this.base = trs(x, y, z, 0, ry, 0);
    this.x = x; this.y = y; this.z = z; this.ry = ry;
  }
  // box centred at local (cx, cy, cz) with size (sx, sy, sz)
  box(cx, cy, cz, sx, sy, sz, mat, tint, rot) {
    const m = trs(cx, cy, cz, rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0, sx, sy, sz).premultiply(this.base);
    this.L.mesh(unitBox(), mat, m, { tint, worldUV: materials.scaleOf(mat) });
    return this;
  }
  cyl(cx, cy, cz, r, h, mat, tint, rot, seg = 12) {
    const m = trs(cx, cy, cz, rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0, r * 2, h, r * 2).premultiply(this.base);
    this.L.mesh(unitCyl(seg), mat, m, { tint, uvScale: 1 });
    return this;
  }
  sph(cx, cy, cz, r, mat, tint, sc = [1, 1, 1]) {
    const m = trs(cx, cy, cz, 0, 0, 0, r * 2 * sc[0], r * 2 * sc[1], r * 2 * sc[2]).premultiply(this.base);
    this.L.mesh(unitSphere(10), mat, m, { tint, uvScale: 1 });
    return this;
  }
  geo(g, mat, cx, cy, cz, rot = [0, 0, 0], sc = [1, 1, 1], tint) {
    const m = trs(cx, cy, cz, rot[0], rot[1], rot[2], sc[0], sc[1], sc[2]).premultiply(this.base);
    this.L.mesh(g, mat, m, { tint, uvScale: 1 });
    return this;
  }
  // collision box in local space (converted to world AABB)
  col(cx, cy, cz, sx, sy, sz, surf = 'metal', flags = F_DEFAULT) {
    const m = trs(cx, cy, cz, 0, 0, 0, sx, sy, sz).premultiply(this.base);
    const bb = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(m);
    this.L.col.addBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, surf, flags);
    this.L._expand(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z);
    return this;
  }
}
export const prop = (L, x, y, z, ry) => new P(L, x, y, z, ry);

const pickC = (arr) => arr[Math.floor(rnd() * arr.length)];
const CAR_COLORS = [0x7a1a14, 0x1a2a4a, 0x2a2a2a, 0x8a8a88, 0xc8c4b8, 0x1e3a2a, 0x5a4a2a, 0x3a1a2a, 0x9a7a2a];

// ------------------------------------------------------------ furniture --
export function table(L, x, y, z, ry = 0, w = 1.4, d = 0.8, mat = 'wood') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.74, 0, w, 0.05, d, mat);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (w / 2 - 0.05), 0.36, sz * (d / 2 - 0.05), 0.06, 0.72, 0.06, mat);
  p.col(0, 0.745, 0, w, 0.06, d, 'wood');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.col(sx * (w / 2 - 0.05), 0.36, sz * (d / 2 - 0.05), 0.06, 0.72, 0.06, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function chair(L, x, y, z, ry = 0, mat = 'woodDark', tipped = false) {
  const p = prop(L, x, y, z, ry);
  if (tipped) {
    p.box(0, 0.22, 0, 0.44, 0.44, 0.05, mat, null, [0, 0, 0]);
    p.box(0, 0.05, -0.25, 0.44, 0.05, 0.44, mat);
    p.col(0, 0.2, -0.1, 0.45, 0.4, 0.5, 'wood', F_SOLID);
    return p;
  }
  p.box(0, 0.45, 0, 0.44, 0.05, 0.44, mat);
  p.box(0, 0.75, 0.2, 0.44, 0.55, 0.04, mat);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * 0.19, 0.22, sz * 0.19, 0.04, 0.45, 0.04, mat);
  p.col(0, 0.5, 0, 0.44, 1.0, 0.44, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function sofa(L, x, y, z, ry = 0, color = 0x5a3a2a) {
  const p = prop(L, x, y, z, ry);
  const m = 'fabric';
  p.box(0, 0.22, 0, 2.0, 0.44, 0.9, m, color);
  p.box(0, 0.62, 0.36, 2.0, 0.5, 0.2, m, color);
  p.box(-0.92, 0.5, 0, 0.18, 0.36, 0.9, m, color);
  p.box(0.92, 0.5, 0, 0.18, 0.36, 0.9, m, color);
  p.box(-0.45, 0.5, -0.05, 0.8, 0.14, 0.7, m, color * 1);
  p.box(0.45, 0.5, -0.05, 0.8, 0.14, 0.7, m, color);
  p.col(0, 0.45, 0, 2.0, 0.9, 0.9, 'fabric');
  return p;
}
export function bed(L, x, y, z, ry = 0, color = 0x8a8a9a, hospital = false) {
  const p = prop(L, x, y, z, ry);
  if (hospital) {
    p.box(0, 0.55, 0, 0.95, 0.12, 2.0, 'metalClean');
    p.box(0, 0.66, 0, 0.9, 0.12, 1.95, 'fabric', 0xd8dcd8);
    p.box(0, 0.78, 0.8, 0.6, 0.1, 0.35, 'fabric', 0xeeeeee);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(sx * 0.42, 0.27, sz * 0.9, 0.025, 0.55, 'metalClean');
    p.box(0, 0.95, 1.0, 0.95, 0.5, 0.04, 'metalClean');
    p.box(0.48, 0.8, 0, 0.03, 0.2, 1.3, 'metalClean');
    p.col(0, 0.4, 0, 0.95, 0.8, 2.0, 'metal');
    return p;
  }
  p.box(0, 0.2, 0, 1.5, 0.3, 2.05, 'woodDark');
  p.box(0, 0.45, 0, 1.45, 0.22, 1.95, 'fabric', 0xd8d2c0);
  p.box(0, 0.58, 0.1, 1.46, 0.06, 1.6, 'fabric', color);
  p.box(-0.35, 0.62, 0.8, 0.55, 0.12, 0.35, 'fabric', 0xeeeeea);
  p.box(0.35, 0.62, 0.8, 0.55, 0.12, 0.35, 'fabric', 0xeeeeea);
  p.box(0, 0.7, 1.02, 1.55, 1.0, 0.08, 'woodDark');
  p.col(0, 0.3, 0, 1.5, 0.62, 2.05, 'fabric');
  return p;
}
export function dresser(L, x, y, z, ry = 0, mat = 'woodDark') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 1.2, 1.0, 0.5, mat);
  for (let i = 0; i < 3; i++) p.box(0, 0.2 + i * 0.3, -0.255, 1.1, 0.24, 0.02, mat, 0xcccccc);
  p.col(0, 0.5, 0, 1.2, 1.0, 0.5, 'wood');
  return p;
}
export function bookshelf(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.0, 0, 1.0, 2.0, 0.35, 'woodDark');
  for (let i = 0; i < 4; i++) {
    let bx = -0.44;
    while (bx < 0.42) {
      const bw = 0.03 + rnd() * 0.05;
      const bh = 0.25 + rnd() * 0.12;
      if (rnd() < 0.85) p.box(bx + bw / 2, 0.12 + i * 0.47 + bh / 2, -0.03, bw, bh, 0.26, 'fabric', pickC([0x6a2a2a, 0x2a3a5a, 0x3a5a3a, 0x8a7a5a, 0x4a4a4a]));
      bx += bw + 0.005;
    }
  }
  p.col(0, 1.0, 0, 1.0, 2.0, 0.35, 'wood');
  return p;
}
export function tv(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.25, 0, 1.0, 0.5, 0.45, 'woodDark');
  p.box(0, 0.72, 0.02, 0.8, 0.46, 0.08, 'blackMatte');
  p.box(0, 0.72, -0.025, 0.72, 0.4, 0.01, 'glassDirty', 0x303838);
  p.col(0, 0.5, 0, 1.0, 1.0, 0.45, 'wood');
  return p;
}
export function fridge(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.9, 0, 0.75, 1.8, 0.7, 'paintedWhite');
  p.box(0.3, 1.2, -0.37, 0.03, 0.4, 0.04, 'chrome');
  p.box(0, 1.25, -0.352, 0.74, 0.01, 0.01, 'blackMatte');
  p.col(0, 0.9, 0, 0.75, 1.8, 0.7, 'metal');
  return p;
}
export function stove(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.45, 0, 0.75, 0.9, 0.65, 'paintedWhite');
  p.box(0, 0.905, 0, 0.72, 0.01, 0.62, 'blackMatte');
  p.box(0, 0.45, -0.33, 0.6, 0.4, 0.02, 'glassDirty', 0x202020);
  p.col(0, 0.45, 0, 0.75, 0.9, 0.65, 'metal');
  return p;
}
export function counter(L, x, y, z, ry = 0, len = 2.4, top = 'marble') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.44, 0, len, 0.88, 0.62, 'woodPale');
  p.box(0, 0.9, -0.02, len + 0.02, 0.04, 0.66, top);
  for (let i = 0; i < Math.floor(len / 0.6); i++) p.box(-len / 2 + 0.3 + i * 0.6, 0.45, -0.315, 0.56, 0.8, 0.01, 'woodPale', 0xbbbbbb);
  p.col(0, 0.46, 0, len, 0.92, 0.64, 'wood');
  return p;
}
export function desk(L, x, y, z, ry = 0, computer = true) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.74, 0, 1.5, 0.04, 0.75, 'woodPale');
  p.box(-0.55, 0.37, 0, 0.4, 0.74, 0.7, 'woodPale', 0xdddddd);
  p.box(0.72, 0.37, 0, 0.04, 0.74, 0.7, 'woodPale');
  if (computer) {
    p.box(0.1, 0.99, 0.12, 0.5, 0.36, 0.05, 'plastic', 0x2a2a2a);
    p.box(0.1, 0.99, 0.095, 0.44, 0.28, 0.01, 'glassDirty', 0x151a20);
    p.box(0.1, 0.8, 0.14, 0.08, 0.1, 0.08, 'plastic', 0x2a2a2a);
    p.box(0.05, 0.77, -0.12, 0.45, 0.02, 0.16, 'plastic', 0x3a3a3a);
  }
  p.col(0, 0.38, 0, 1.5, 0.78, 0.75, 'wood');
  return p;
}
export function officeChair(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.48, 0, 0.5, 0.08, 0.5, 'fabric', 0x222222);
  p.box(0, 0.85, 0.23, 0.46, 0.6, 0.06, 'fabric', 0x222222);
  p.cyl(0, 0.25, 0, 0.03, 0.4, 'metalDark');
  p.box(0, 0.06, 0, 0.6, 0.04, 0.06, 'metalDark');
  p.box(0, 0.06, 0, 0.06, 0.04, 0.6, 'metalDark');
  p.col(0, 0.5, 0, 0.55, 1.0, 0.55, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
export function filingCabinet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.66, 0, 0.47, 1.32, 0.62, 'paintedWhite', 0xa8aca8);
  for (let i = 0; i < 4; i++) p.box(0, 0.18 + i * 0.32, -0.315, 0.42, 0.27, 0.01, 'metal', 0x9a9e9a);
  p.col(0, 0.66, 0, 0.47, 1.32, 0.62, 'metal');
  return p;
}
export function lamp(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.02, 0, 0.15, 0.04, 'metalDark');
  p.cyl(0, 0.75, 0, 0.015, 1.5, 'metalDark');
  p.cyl(0, 1.55, 0, 0.22, 0.28, 'fabric', 0xd8c8a0);
  return p;
}
export function cabinetWall(L, x, y, z, ry = 0, len = 2.4) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.9, 0.15, len, 0.7, 0.35, 'woodPale');
  for (let i = 0; i < Math.floor(len / 0.6); i++) p.box(-len / 2 + 0.3 + i * 0.6, 1.9, -0.028, 0.56, 0.64, 0.01, 'woodPale', 0xbbbbbb);
  return p;
}
export function toilet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.2, -0.05, 0.38, 0.4, 0.5, 'plasticGloss', 0xeeeeee);
  p.box(0, 0.6, 0.2, 0.4, 0.45, 0.18, 'plasticGloss', 0xeeeeee);
  p.col(0, 0.4, 0, 0.4, 0.8, 0.6, 'tile');
  return p;
}
export function bathtub(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.28, 0, 0.75, 0.56, 1.7, 'plasticGloss', 0xeeeee8);
  p.box(0, 0.5, 0, 0.6, 0.1, 1.55, 'blackMatte', 0x303030);
  p.col(0, 0.28, 0, 0.75, 0.56, 1.7, 'tile');
  return p;
}
export function sink(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.85, 0, 0.55, 0.12, 0.45, 'plasticGloss', 0xeeeeee);
  p.cyl(0, 0.42, 0.05, 0.08, 0.8, 'plasticGloss', 0xeeeeee);
  p.box(0, 1.3, 0.22, 0.5, 0.6, 0.02, 'chrome');
  p.col(0, 0.5, 0, 0.55, 1.0, 0.45, 'tile', F_SOLID | F_SHOOT);
  return p;
}
export function rug(L, x, y, z, w, d, color) {
  L.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.012, z + d / 2, 'carpet', { tint: color, collide: false });
}
export function picture(L, x, y, z, ry, w = 0.6, h = 0.45) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0, 0, w, h, 0.03, 'woodDark');
  p.box(0, 0, -0.016, w - 0.08, h - 0.08, 0.005, 'paper', pickC([0x5a6a7a, 0x7a5a3a, 0x3a5a3a, 0x8a7a6a]));
  return p;
}

// ---------------------------------------------------------- containers --
export function crate(L, x, y, z, ry = 0, s = 1, mat = 'wood') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.4 * s, 0, 0.8 * s, 0.8 * s, 0.8 * s, mat);
  p.box(0, 0.4 * s, -0.405 * s, 0.1 * s, 0.8 * s, 0.01, mat, 0x9a8a70, [0, 0, 0.78]);
  p.col(0, 0.4 * s, 0, 0.8 * s, 0.8 * s, 0.8 * s, 'wood');
  return p;
}
export function pallet(L, x, y, z, ry = 0, boxes = true) {
  const p = prop(L, x, y, z, ry);
  for (let i = 0; i < 5; i++) p.box(-0.5 + i * 0.25, 0.12, 0, 0.12, 0.02, 1.2, 'wood', 0xbbaa88);
  for (const sz of [-0.5, 0, 0.5]) p.box(0, 0.055, sz, 1.1, 0.11, 0.1, 'wood', 0xbbaa88);
  let h = 0.13;
  if (boxes) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { p.box((rnd() - 0.5) * 0.1, h + 0.25, (rnd() - 0.5) * 0.1, 1.0, 0.5, 1.0, 'fabric', 0x9a8060); h += 0.5; }
  }
  p.col(0, h / 2, 0, 1.15, h, 1.2, 'wood');
  return p;
}
export function barrel(L, x, y, z, color = 0x3a4a6a, rusty = true) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.45, 0, 0.3, 0.9, rusty ? 'rust' : 'paintedBlue', color, null, 14);
  p.cyl(0, 0.3, 0, 0.31, 0.03, 'metalDark');
  p.cyl(0, 0.62, 0, 0.31, 0.03, 'metalDark');
  p.col(0, 0.45, 0, 0.6, 0.9, 0.6, 'metal');
  return p;
}
export function dumpster(L, x, y, z, ry = 0, color = 0x2e4a36) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.7, 0, 1.9, 1.2, 1.1, 'paintedGreen', color);
  p.box(0, 1.33, 0.05, 1.95, 0.06, 1.15, 'rubber', 0x222222, [0.12, 0, 0]);
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.45]) p.cyl(sx, 0.08, sz, 0.08, 0.1, 'rubber');
  p.col(0, 0.7, 0, 1.9, 1.4, 1.1, 'metal');
  return p;
}
export function trashCan(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.45, 0, 0.28, 0.9, 'metal', 0x6a6a64, null, 12);
  p.col(0, 0.45, 0, 0.55, 0.9, 0.55, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function trashBags(L, x, y, z, n = 4) {
  const p = prop(L, x, y, z, rnd() * 6);
  for (let i = 0; i < n; i++) p.sph((rnd() - 0.5) * 1.0, 0.2, (rnd() - 0.5) * 0.8, 0.3 + rnd() * 0.1, 'rubber', 0x1a1a1c, [1, 0.75, 1]);
  return p;
}
export function debris(L, x, y, z, r = 1.2, mat = 'concrete', n = 8) {
  const p = prop(L, x, y, z, rnd() * 6);
  for (let i = 0; i < n; i++) {
    const s = 0.15 + rnd() * 0.4;
    p.box((rnd() - 0.5) * r * 2, s / 3, (rnd() - 0.5) * r * 2, s * (1 + rnd()), s * 0.6, s, mat, null, [rnd() * 0.5, rnd() * 3, rnd() * 0.5]);
  }
  return p;
}
export function papers(L, x, y, z, r = 2, n = 10) {
  const p = prop(L, x, y, z, 0);
  for (let i = 0; i < n; i++) p.box((rnd() - 0.5) * r * 2, 0.005, (rnd() - 0.5) * r * 2, 0.21, 0.004, 0.29, 'paper', 0xd8d4c8, [0, rnd() * 6, 0]);
  return p;
}

// ------------------------------------------------------------- vehicles --
export function car(L, x, y, z, ry = 0, opts = {}) {
  const color = opts.color ?? pickC(CAR_COLORS);
  const p = prop(L, x, y, z, ry);
  const burnt = !!opts.burnt;
  const body = burnt ? 'rust' : 'carPaint';
  const bc = burnt ? 0x3a3430 : color;
  // lower body
  p.box(0, 0.62, 0, 1.8, 0.62, 4.4, body, bc);
  p.box(0, 0.55, -2.05, 1.78, 0.4, 0.4, body, bc); // front bumper area
  // cabin
  p.box(0, 1.18, 0.25, 1.6, 0.52, 2.2, body, bc);
  // windows (dark glass)
  p.box(0, 1.2, -0.87, 1.5, 0.44, 0.04, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024, [0.55, 0, 0]);
  p.box(0, 1.2, 1.36, 1.5, 0.44, 0.04, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024, [-0.5, 0, 0]);
  p.box(0.81, 1.2, 0.25, 0.02, 0.4, 2.0, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024);
  p.box(-0.81, 1.2, 0.25, 0.02, 0.4, 2.0, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024);
  // wheels
  for (const sx of [-0.82, 0.82]) for (const sz of [-1.4, 1.4]) {
    p.cyl(sx, 0.34, sz, 0.34, 0.24, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
    p.cyl(sx * 1.01, 0.34, sz, 0.18, 0.25, burnt ? 'rust' : 'chrome', burnt ? 0x3a2a20 : 0xbbbbbb, [0, 0, Math.PI / 2], 10);
  }
  // lights
  if (!burnt) {
    p.box(0.6, 0.72, -2.26, 0.35, 0.14, 0.02, 'emissiveWarm', 0x777777);
    p.box(-0.6, 0.72, -2.26, 0.35, 0.14, 0.02, 'emissiveWarm', 0x777777);
    p.box(0.65, 0.75, 2.21, 0.3, 0.12, 0.02, 'emissiveRed', 0x552222);
    p.box(-0.65, 0.75, 2.21, 0.3, 0.12, 0.02, 'emissiveRed', 0x552222);
    p.box(0, 0.5, -2.26, 1.6, 0.12, 0.04, 'chrome');
  }
  if (opts.police) {
    p.box(0, 0.68, 0, 1.82, 0.3, 1.6, 'paintedWhite', 0xe8e8e8);
    p.box(0, 1.48, 0.25, 1.0, 0.1, 0.25, 'plastic', 0x222222);
    p.box(-0.3, 1.55, 0.25, 0.35, 0.08, 0.22, 'emissiveRed', 0x882222);
    p.box(0.3, 1.55, 0.25, 0.35, 0.08, 0.22, 'plastic', 0x2244aa);
  }
  if (opts.taxi) p.box(0, 1.5, 0.25, 0.5, 0.15, 0.18, 'plastic', 0xe8d030);
  p.col(0, 0.72, 0, 1.8, 1.0, 4.4, 'metal');
  p.col(0, 1.2, 0.25, 1.6, 0.5, 2.2, 'metal');
  return p;
}
export function van(L, x, y, z, ry = 0, color = 0xd8d4c8) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.2, 0.3, 2.0, 1.9, 4.2, 'carPaint', color);
  p.box(0, 0.75, -2.15, 1.95, 0.9, 0.9, 'carPaint', color);
  p.box(0, 1.55, -1.75, 1.8, 0.6, 0.05, 'glassDirty', 0x1a2024, [0.35, 0, 0]);
  for (const sx of [-0.9, 0.9]) for (const sz of [-1.6, 1.6]) p.cyl(sx, 0.36, sz, 0.36, 0.26, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  p.col(0, 1.15, 0, 2.0, 2.0, 5.0, 'metal');
  return p;
}
export function truck(L, x, y, z, ry = 0, color = 0xc8c4b8) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.9, 1.5, 2.5, 2.8, 7.5, 'paintedWhite', color);
  p.box(0, 1.4, -3.3, 2.4, 2.2, 2.2, 'carPaint', 0x7a1a14);
  p.box(0, 1.8, -4.42, 2.1, 0.8, 0.05, 'glassDirty', 0x1a2024);
  for (const sx of [-1.1, 1.1]) for (const sz of [-3.3, 0.5, 3.8]) p.cyl(sx, 0.5, sz, 0.5, 0.35, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  p.col(0, 1.9, 1.5, 2.5, 2.8, 7.5, 'metal');
  p.col(0, 1.3, -3.3, 2.4, 2.3, 2.2, 'metal');
  return p;
}

// ------------------------------------------------------- street furniture --
export function streetLight(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  p.cyl(0, 3.2, 0, 0.09, 6.4, 'metalDark', null, null, 8);
  p.box(0, 6.35, -0.7, 0.12, 0.1, 1.5, 'metalDark');
  p.box(0, 6.3, -1.35, 0.35, 0.12, 0.55, 'metalDark');
  const on = opts.on !== false;
  p.box(0, 6.23, -1.35, 0.28, 0.02, 0.45, on ? 'emissiveWarm' : 'blackMatte');
  p.col(0, 3.2, 0, 0.2, 6.4, 0.2, 'metal');
  if (on) {
    const lp = new THREE.Vector3(0, 6.0, -1.35).applyMatrix4(p.base);
    L.light(lp.x, lp.y, lp.z, 0xffc070, opts.intensity ?? 30, opts.range ?? 22, { flicker: opts.flicker || 0 });
  }
  return p;
}
export function trafficLight(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.cyl(0, 2.6, 0, 0.08, 5.2, 'metalDark', null, null, 8);
  p.box(0, 5.1, -1.4, 0.1, 0.1, 3.0, 'metalDark');
  p.box(0, 4.7, -2.6, 0.35, 0.95, 0.3, 'paintedYellow', 0x5a5a20);
  p.box(0, 4.99, -2.76, 0.2, 0.2, 0.02, 'emissiveRed', 0x551111);
  p.box(0, 4.47, -2.76, 0.2, 0.2, 0.02, 'blackMatte');
  p.col(0, 2.6, 0, 0.18, 5.2, 0.18, 'metal');
  return p;
}
export function hydrant(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.35, 0, 0.12, 0.7, 'paintedRed', 0xb02a1a);
  p.sph(0, 0.72, 0, 0.12, 'paintedRed', 0xb02a1a);
  p.cyl(0, 0.45, 0, 0.05, 0.4, 'paintedRed', 0xb02a1a, [0, 0, Math.PI / 2]);
  p.col(0, 0.4, 0, 0.3, 0.8, 0.3, 'metal');
  return p;
}
export function mailbox(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.8, 0, 0.5, 0.9, 0.5, 'paintedBlue', 0x2a4a8a);
  p.cyl(0, 1.25, 0, 0.25, 0.5, 'paintedBlue', 0x2a4a8a, [Math.PI / 2, 0, 0]);
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) p.box(sx, 0.18, sz, 0.05, 0.36, 0.05, 'metalDark');
  p.col(0, 0.7, 0, 0.5, 1.4, 0.5, 'metal');
  return p;
}
export function newsBox(L, x, y, z, ry = 0, color = 0xb81a1a) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.6, 0, 0.45, 0.9, 0.4, 'paintedRed', color);
  p.box(0, 0.75, -0.205, 0.35, 0.3, 0.01, 'glassDirty', 0x303030);
  p.col(0, 0.55, 0, 0.45, 1.1, 0.4, 'metal');
  return p;
}
export function bench(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.45, 0, 1.8, 0.05, 0.45, 'wood');
  p.box(0, 0.75, 0.22, 1.8, 0.4, 0.04, 'wood');
  for (const sx of [-0.8, 0.8]) p.box(sx, 0.22, 0, 0.06, 0.45, 0.45, 'metalDark');
  p.col(0, 0.45, 0, 1.8, 0.9, 0.5, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function vending(L, x, y, z, ry = 0, color = 0xb02a1a) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.95, 0, 0.9, 1.9, 0.8, 'paintedRed', color);
  p.box(-0.12, 1.1, -0.405, 0.55, 1.3, 0.01, 'glassDirty', 0x303838);
  p.box(0.3, 1.1, -0.41, 0.18, 0.4, 0.01, 'emissiveCool', 0x333333);
  p.col(0, 0.95, 0, 0.9, 1.9, 0.8, 'metal');
  return p;
}
export function planter(L, x, y, z, r = 0.5) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.3, 0, r, 0.6, 'concrete', null, null, 12);
  p.sph(0, 0.85, 0, r * 0.9, 'foliage', 0x2a3a1e, [1, 0.8, 1]);
  p.col(0, 0.5, 0, r * 2, 1.0, r * 2, 'concrete');
  return p;
}
export function fenceChain(L, x0, z0, x1, z1, y = 0, h = 3) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const p = prop(L, (x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  const n = Math.max(1, Math.round(len / 2.5));
  for (let i = 0; i <= n; i++) p.cyl(-len / 2 + (len / n) * i, h / 2, 0, 0.04, h, 'metal', 0x8a8a86, null, 6);
  p.cyl(0, h - 0.05, 0, 0.03, len, 'metal', 0x8a8a86, [0, 0, Math.PI / 2], 6);
  // mesh approximated by a thin semi-transparent-looking dark grid box
  p.box(0, h / 2, 0, len, h - 0.1, 0.02, 'metal', 0x4a4a48);
  p.col(0, h / 2, 0, len, h, 0.1, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function barricade(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.9, 0, 2.0, 0.25, 0.08, 'paintedWhite', 0xd8d8d0);
  for (let i = 0; i < 4; i++) p.box(-0.75 + i * 0.5, 0.9, -0.045, 0.22, 0.24, 0.01, 'paintedRed', 0xc02a1a);
  for (const sx of [-0.8, 0.8]) { p.box(sx, 0.5, 0.15, 0.06, 1.0, 0.06, 'wood', null, [0.3, 0, 0]); p.box(sx, 0.5, -0.15, 0.06, 1.0, 0.06, 'wood', null, [-0.3, 0, 0]); }
  p.col(0, 0.55, 0, 2.0, 1.1, 0.5, 'wood', F_SOLID | F_SHOOT);
  return p;
}
export function sandbags(L, x, y, z, ry = 0, len = 3, rows = 3) {
  const p = prop(L, x, y, z, ry);
  for (let r = 0; r < rows; r++) {
    const n = Math.floor(len / 0.6);
    for (let i = 0; i < n; i++) p.box(-len / 2 + 0.3 + i * 0.6 + (r % 2) * 0.15, 0.1 + r * 0.19, 0, 0.58, 0.2, 0.42, 'fabric', 0x8a7a58);
  }
  p.col(0, rows * 0.1, 0, len, rows * 0.2, 0.45, 'fabric');
  return p;
}
export function acUnit(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.6, 0, 1.6, 1.2, 1.2, 'metal', 0xa8aca8);
  p.cyl(0, 1.21, 0, 0.45, 0.02, 'blackMatte');
  for (let i = 0; i < 6; i++) p.box(-0.6 + i * 0.24, 0.6, -0.605, 0.04, 1.0, 0.01, 'metalDark');
  p.col(0, 0.6, 0, 1.6, 1.2, 1.2, 'metal');
  return p;
}
export function waterTower(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) p.box(sx, 2.5, sz, 0.18, 5.0, 0.18, 'metalDark');
  p.cyl(0, 6.8, 0, 2.2, 3.6, 'woodDark', null, null, 16);
  for (let i = 0; i < 4; i++) p.cyl(0, 5.3 + i * 1.0, 0, 2.23, 0.06, 'metalDark', null, null, 16);
  p.geo(new THREE.ConeGeometry(2.4, 1.2, 16), 'metalDark', 0, 9.2, 0);
  p.col(0, 6.8, 0, 4.4, 3.6, 4.4, 'wood');
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) p.col(sx, 2.5, sz, 0.2, 5, 0.2, 'metal');
  return p;
}
export function antenna(L, x, y, z, h = 8) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, h / 2, 0, 0.06, h, 'metalDark', null, null, 6);
  for (let i = 1; i < 4; i++) p.box(0, h * i / 4, 0, 1.2 - i * 0.25, 0.03, 0.03, 'metalDark');
  p.box(0, h + 0.05, 0, 0.1, 0.1, 0.1, 'emissiveRed');
  const lp = new THREE.Vector3(0, h + 0.1, 0).applyMatrix4(p.base);
  L.light(lp.x, lp.y, lp.z, 0xff2010, 3, 6, { flicker: 0 });
  p.col(0, h / 2, 0, 0.2, h, 0.2, 'metal');
  return p;
}
export function pipe(L, x0, y0, z0, x1, y1, z1, r = 0.12, mat = 'metal', tint) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r * 2, len, r * 2));
  L.mesh(unitCyl(10), mat, m, { tint, uvScale: 1 });
  // flanges
  for (const t of [0.02, 0.98]) {
    const fp = a.clone().lerp(b, t);
    L.mesh(unitCyl(10), 'metalDark', new THREE.Matrix4().compose(fp, q, new THREE.Vector3(r * 2.6, 0.06, r * 2.6)), { uvScale: 1 });
  }
}

// ------------------------------------------------------------- subway --
export function subwayCar(L, x, y, z, ry = 0, opts = {}) {
  const p = prop(L, x, y, z, ry);
  const len = opts.len ?? 16, w = 3.0, h = 3.3;
  const color = opts.color ?? 0xa8aca8;
  // shell (walls with window band)
  p.box(0, 0.25, 0, w - 0.2, 0.5, len - 0.4, 'metalDark'); // undercarriage
  p.box(0, 0.6, 0, w, 0.2, len, 'diamond', 0x777777); // floor
  for (const sx of [-1, 1]) {
    p.box(sx * (w / 2 - 0.04), 1.2, 0, 0.08, 1.0, len, 'metalClean', color);
    p.box(sx * (w / 2 - 0.04), 2.95, 0, 0.08, 0.7, len, 'metalClean', color);
    p.box(sx * (w / 2 - 0.04), 2.15, 0, 0.04, 0.9, len - 0.2, 'glassDirty', 0x202628);
    p.box(sx * (w / 2 + 0.005), 1.72, 0, 0.01, 0.12, len, 'paintedBlue', 0x2a4a9a);
  }
  p.box(0, 3.35, 0, w, 0.12, len, 'metalClean', color); // roof
  p.box(0, 1.9, len / 2 - 0.04, w, 2.6, 0.08, 'metalClean', color);
  p.box(0, 1.9, -len / 2 + 0.04, w, 2.6, 0.08, 'metalClean', color);
  // seats inside
  for (const sx of [-1, 1]) p.box(sx * (w / 2 - 0.35), 1.05, 0, 0.5, 0.12, len - 3, 'fabric', 0x2a3a6a);
  // poles
  for (let i = -2; i <= 2; i++) p.cyl(0, 2.0, i * 3, 0.025, 2.8, 'chrome');
  // light strip
  p.box(0, 3.22, 0, 0.25, 0.04, len - 1, opts.lit ? 'emissiveCool' : 'blackMatte');
  // collision: floor + side walls (doors open gaps at center)
  p.col(0, 0.35, 0, w, 0.7, len, 'metal');
  const gap = opts.doors ? 1.4 : 0;
  for (const sx of [-1, 1]) {
    if (gap) {
      p.col(sx * (w / 2 - 0.05), 2.0, -len / 4 - gap / 4, 0.1, 2.8, len / 2 - gap / 2, 'metal');
      p.col(sx * (w / 2 - 0.05), 2.0, len / 4 + gap / 4, 0.1, 2.8, len / 2 - gap / 2, 'metal');
    } else p.col(sx * (w / 2 - 0.05), 2.0, 0, 0.1, 2.8, len, 'metal');
  }
  p.col(0, 3.35, 0, w, 0.14, len, 'metal');
  p.col(0, 2.0, len / 2 - 0.05, w, 2.8, 0.1, 'metal');
  p.col(0, 2.0, -len / 2 + 0.05, w, 2.8, 0.1, 'metal');
  if (opts.lit) {
    for (let i = -1; i <= 1; i++) {
      const lp = new THREE.Vector3(0, 3.0, i * len / 3).applyMatrix4(p.base);
      L.light(lp.x, lp.y, lp.z, 0xd8f0ff, 8, 8, { flicker: 0.5 });
    }
  }
  return p;
}
export function turnstile(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 0.3, 1.0, 0.9, 'metalClean');
  p.box(0.35, 0.85, 0, 0.4, 0.04, 0.04, 'chrome', null, [0, 0, 0.3]);
  p.col(0, 0.5, 0, 0.3, 1.0, 0.9, 'metal');
  return p;
}
export function generator(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.15, 0, 3.2, 0.3, 1.6, 'metalDark');
  p.box(-0.4, 1.0, 0, 2.2, 1.4, 1.4, 'paintedYellow', 0x9a7a1a);
  p.box(1.1, 0.9, 0, 0.8, 1.2, 1.3, 'metal', 0x6a6a64);
  p.cyl(-0.9, 2.0, 0.3, 0.15, 0.8, 'metalDark');
  for (let i = 0; i < 6; i++) p.box(-1.2 + i * 0.3, 1.0, -0.71, 0.05, 1.0, 0.02, 'metalDark');
  p.col(0, 0.85, 0, 3.2, 1.7, 1.6, 'metal');
  return p;
}
export function electricPanel(L, x, y, z, ry = 0, lit = true) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.1, 0, 1.2, 2.2, 0.4, 'metal', 0x8a9088);
  for (let i = 0; i < 3; i++) p.box(-0.3 + i * 0.3, 1.5, -0.205, 0.22, 0.3, 0.01, 'metalDark');
  if (lit) {
    p.box(-0.4, 1.9, -0.205, 0.05, 0.05, 0.01, 'emissiveGreen');
    p.box(-0.3, 1.9, -0.205, 0.05, 0.05, 0.01, 'emissiveRed');
  }
  p.col(0, 1.1, 0, 1.2, 2.2, 0.4, 'metal');
  return p;
}
export function pumpMachine(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.2, 0, 2.4, 0.4, 1.2, 'concreteDark');
  p.cyl(-0.5, 0.95, 0, 0.5, 1.1, 'paintedGreen', 0x2e5a4a, [0, 0, Math.PI / 2], 16);
  p.box(0.6, 0.9, 0, 0.9, 1.0, 0.9, 'paintedGreen', 0x2e5a4a);
  p.cyl(-1.2, 0.95, 0, 0.18, 0.5, 'metalDark', null, [0, 0, Math.PI / 2]);
  p.cyl(0.6, 1.7, 0, 0.12, 0.8, 'metal');
  p.col(0, 0.8, 0, 2.4, 1.6, 1.2, 'metal');
  return p;
}
export function valveWheel(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.geo(new THREE.TorusGeometry(0.25, 0.03, 6, 16), 'paintedRed', 0, 0, 0, [0, 0, 0], [1, 1, 1], 0xa02a1a);
  p.box(0, 0, 0, 0.5, 0.03, 0.03, 'paintedRed', 0xa02a1a);
  p.box(0, 0, 0, 0.03, 0.5, 0.03, 'paintedRed', 0xa02a1a);
  return p;
}

// ------------------------------------------------------------ hospital --
export function gurney(L, x, y, z, ry = 0, sheet = true) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.8, 0, 0.65, 0.06, 1.95, 'metalClean');
  if (sheet) p.box(0, 0.86, 0, 0.62, 0.08, 1.9, 'fabric', 0xe8ece8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.box(sx * 0.28, 0.42, sz * 0.85, 0.04, 0.76, 0.04, 'metalClean'); p.cyl(sx * 0.28, 0.06, sz * 0.85, 0.06, 0.05, 'rubber', null, [0, 0, Math.PI / 2]); }
  p.col(0, 0.45, 0, 0.65, 0.9, 1.95, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function wheelchair(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 0.5, 0.05, 0.45, 'fabric', 0x2a2a2a);
  p.box(0, 0.8, 0.22, 0.5, 0.55, 0.04, 'fabric', 0x2a2a2a);
  for (const sx of [-0.3, 0.3]) p.geo(new THREE.TorusGeometry(0.3, 0.025, 6, 18), 'metalClean', sx, 0.3, 0.05, [0, Math.PI / 2, 0]);
  p.col(0, 0.5, 0, 0.65, 1.0, 0.7, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function ivStand(L, x, y, z) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.9, 0, 0.015, 1.8, 'metalClean', null, null, 6);
  p.box(0, 1.8, 0, 0.3, 0.02, 0.02, 'metalClean');
  p.box(0.12, 1.65, 0, 0.1, 0.18, 0.04, 'glass', 0xccddcc);
  for (let i = 0; i < 4; i++) p.box(Math.cos(i * 1.57) * 0.15, 0.04, Math.sin(i * 1.57) * 0.15, 0.3, 0.02, 0.02, 'metalClean', null, [0, i * 1.57, 0]);
  return p;
}
export function medCabinet(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.0, 0, 1.0, 2.0, 0.45, 'paintedWhite', 0xd8dcd8);
  p.box(-0.24, 1.35, -0.23, 0.44, 1.1, 0.01, 'glass', 0xccdddd);
  p.box(0.24, 1.35, -0.23, 0.44, 1.1, 0.01, 'glass', 0xccdddd);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) p.box(-0.35 + k * 0.17, 0.95 + i * 0.35, -0.1, 0.08, 0.14, 0.08, 'plastic', pickC([0xd8d8d0, 0xc86818, 0x3a6aa0, 0xeeeeee]));
  p.col(0, 1.0, 0, 1.0, 2.0, 0.45, 'metal');
  return p;
}
export function receptionDesk(L, x, y, z, ry = 0, len = 4) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.55, 0, len, 1.1, 0.7, 'woodPale', 0xc8c0b0);
  p.box(0, 1.12, -0.1, len + 0.1, 0.05, 0.9, 'marble');
  p.box(0, 0.8, 0.5, len - 0.2, 0.05, 0.5, 'woodPale');
  p.col(0, 0.58, 0, len, 1.16, 0.8, 'wood');
  return p;
}
export function curtainRail(L, x, y, z, ry = 0, len = 2.2, closed = 0.6) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 2.4, 0, len, 0.03, 0.03, 'metalClean');
  const cw = len * closed;
  p.box(-len / 2 + cw / 2, 1.5, 0, cw, 1.8, 0.02, 'fabric', 0x8ab0a8);
  return p;
}

// ------------------------------------------------------------- rooftop --
export function helipad(L, x, y, z, r = 9) {
  const p = prop(L, x, y, z, 0);
  p.cyl(0, 0.05, 0, r, 0.1, 'concreteDark', null, null, 32);
  p.geo(new THREE.TorusGeometry(r * 0.7, 0.15, 4, 40), 'paintedYellow', 0, 0.11, 0, [Math.PI / 2, 0, 0], [1, 1, 0.1], 0xd8c030);
  p.box(-1.4, 0.11, 0, 0.5, 0.01, 4.2, 'paintedWhite', 0xe8e8e0);
  p.box(1.4, 0.11, 0, 0.5, 0.01, 4.2, 'paintedWhite', 0xe8e8e0);
  p.box(0, 0.11, 0, 2.3, 0.01, 0.5, 'paintedWhite', 0xe8e8e0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.box(Math.cos(a) * (r - 0.2), 0.15, Math.sin(a) * (r - 0.2), 0.15, 0.08, 0.15, 'emissiveGreen');
  }
  p.col(0, 0.05, 0, r * 1.6, 0.1, r * 1.6, 'concrete');
  return p;
}
export function radioTable(L, x, y, z, ry = 0) {
  const p = table(L, x, y, z, ry, 1.2, 0.7, 'woodDark');
  p.box(0, 0.9, 0.05, 0.5, 0.28, 0.32, 'metal', 0x4a5040);
  p.box(-0.1, 0.92, -0.115, 0.2, 0.12, 0.01, 'emissiveGreen', 0x335533);
  p.cyl(0.18, 1.3, 0.1, 0.01, 0.5, 'metalDark');
  p.box(0.35, 0.8, -0.1, 0.12, 0.08, 0.2, 'plastic', 0x222222);
  return p;
}

// ---------------------------------------------------------- dead bodies --
// A static corpse lying on the floor (built from the part style of the crowd).
export function corpse(L, x, y, z, ry = 0, color = 0x4a4a52) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.12, 0, 0.4, 0.22, 0.65, 'fabric', color);
  p.sph(0, 0.12, -0.48, 0.11, 'plastic', 0x8a7a6a);
  p.box(-0.3, 0.08, -0.15, 0.1, 0.1, 0.55, 'fabric', color, [0, 0.4, 0]);
  p.box(0.32, 0.08, 0.05, 0.1, 0.1, 0.55, 'fabric', color, [0, -0.6, 0]);
  p.box(-0.12, 0.08, 0.7, 0.13, 0.13, 0.8, 'fabric', 0x2a2a34, [0, 0.1, 0]);
  p.box(0.14, 0.08, 0.72, 0.13, 0.13, 0.8, 'fabric', 0x2a2a34, [0, -0.15, 0]);
  return p;
}
export function bodyBag(L, x, y, z, ry = 0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.14, 0, 0.6, 0.28, 1.85, 'rubber', 0x101418);
  p.sph(0, 0.2, -0.7, 0.2, 'rubber', 0x101418, [1.2, 0.8, 1]);
  return p;
}

export { rnd as propRng };
