// Chapter 3 (The Sewer) prop library: pawn-shop goods, fast-food kitchen,
// gas station, freight yard, warehouse racks, sewer machinery and the
// military triage plaza in front of Mercy Hospital. All props follow the
// kit convention (L, x, y, z, ry, ...) with (x,y,z) the floor point under the
// prop's centre and the prop's "front" facing -Z before rotation.
import * as THREE from 'three';
import { P } from './kit.js';
import { F_SOLID, F_SHOOT } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { makeRng } from '../core/math.js';

const rng = makeRng(3303);
const prop = P.prop;

// Build geometry with the normal level API into a detached THREE.Group (used
// for objects that move or change: the scissor lift, fuel pumps, the tanker).
// Geometry is authored in world coordinates; the group sits at the origin.
export function buildGroup(L, fn) {
  const tmp = new (L.constructor)(L.game, {});
  fn(tmp);
  const grp = new THREE.Group();
  for (const b of tmp.buckets.values()) {
    if (!b.vcount) continue;
    const mesh = new THREE.Mesh(b.toGeometry(), materials.get(b.mat));
    mesh.castShadow = !b.mat.startsWith('emissive');
    mesh.receiveShadow = true;
    grp.add(mesh);
  }
  for (const c of [...tmp.root.children]) grp.add(c);
  return grp;
}

// Plain mesh with the vertex-colour attribute level materials expect.
export function vmesh(geo, mat, tint = 0xffffff) {
  const c = new THREE.Color(tint);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  const m = new THREE.Mesh(geo, materials.get(mat));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------ pawn shop --
export function guitar(L, x, y, z, ry, color = 0x8a4a1a, electric = false) {
  const p = prop(L, x, y, z, ry);
  const rot = [Math.PI / 2, 0, 0];
  if (electric) {
    p.box(0, 0.28, 0, 0.34, 0.42, 0.045, 'plasticGloss', color);
    p.box(0.08, 0.5, 0, 0.14, 0.16, 0.045, 'plasticGloss', color, [0, 0, -0.4]);
    p.box(0, 0.26, -0.026, 0.2, 0.16, 0.01, 'plastic', 0xe8e4d8);
  } else {
    p.cyl(0, 0.22, 0, 0.2, 0.09, 'wood', color, rot, 16);
    p.cyl(0, 0.48, 0, 0.155, 0.09, 'wood', color, rot, 16);
    p.cyl(0, 0.4, -0.046, 0.05, 0.005, 'blackMatte', null, rot, 12);
    p.box(0, 0.12, -0.046, 0.14, 0.03, 0.01, 'woodDark');
  }
  p.box(0, 0.92, 0, 0.055, 0.62, 0.035, 'woodDark');
  p.box(0, 1.28, 0, 0.085, 0.16, 0.03, 'woodDark', 0x2a1a10);
  for (const sx of [-0.05, 0.05]) for (let k = 0; k < 3; k++) p.box(sx, 1.23 + k * 0.045, -0.02, 0.025, 0.012, 0.012, 'chrome');
  p.box(0, 0.7, -0.021, 0.035, 1.05, 0.004, 'chrome', 0x777777);
  // wall hook
  p.box(0, 1.32, 0.04, 0.03, 0.03, 0.08, 'metalDark');
  return p;
}

// Glass jewellery showcase with trays of rings / watches / chains.
export function showcase(L, x, y, z, ry, len = 2.2) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.3, 0, len, 0.6, 0.62, 'woodDark', 0x6a5040);
  p.box(0, 0.01, 0, len - 0.04, 0.02, 0.6, 'blackMatte');
  p.box(0, 0.61, 0, len - 0.06, 0.025, 0.56, 'fabricRed', 0x5a1420);
  const n = Math.floor(len / 0.18);
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + 0.15 + i * ((len - 0.3) / Math.max(1, n - 1));
    const kind = rng();
    if (kind < 0.4) p.cyl(lx, 0.64, -0.08 + rng() * 0.16, 0.025, 0.02, rng() < 0.5 ? 'paintedYellow' : 'chrome', rng() < 0.5 ? 0xe8c040 : 0xdddddd, null, 8);
    else if (kind < 0.7) p.box(lx, 0.635, -0.05 + rng() * 0.1, 0.07, 0.03, 0.09, 'blackMatte').box(lx, 0.655, -0.05, 0.04, 0.012, 0.04, 'chrome');
    else p.box(lx, 0.628, 0, 0.12, 0.012, 0.02, 'paintedYellow', 0xd8b030, [0, rng() * 1.2, 0]);
  }
  p.box(0, 0.83, 0, len, 0.44, 0.62, 'glass');
  for (const sz of [-0.3, 0.3]) p.box(0, 1.05, sz, len, 0.025, 0.025, 'chrome');
  for (const sx of [-len / 2, len / 2]) p.box(sx, 0.83, 0, 0.025, 0.44, 0.62, 'chrome');
  p.col(0, 0.53, 0, len, 1.06, 0.62, 'glass');
  return p;
}

// Steel shelving unit (2 m tall) stocked with odds and ends. kind: 'tv' | 'goods' | 'kitchen' | 'store'
export function shelving(L, x, y, z, ry, w = 2.0, kind = 'goods', d = 0.5) {
  const p = prop(L, x, y, z, ry);
  for (const sx of [-w / 2 + 0.03, w / 2 - 0.03]) for (const sz of [-d / 2 + 0.03, d / 2 - 0.03]) p.box(sx, 1.0, sz, 0.04, 2.0, 0.04, 'metal', 0x8a8e8a);
  const levels = [0.12, 0.62, 1.12, 1.62];
  for (const ly of levels) p.box(0, ly, 0, w, 0.03, d, 'metal', 0x9a9e9a);
  for (let li = 0; li < levels.length; li++) {
    const ly = levels[li] + 0.015;
    let lx = -w / 2 + 0.1;
    while (lx < w / 2 - 0.2) {
      if (kind === 'tv') {
        const tw = 0.42 + rng() * 0.2, th = tw * 0.78;
        if (lx + tw > w / 2 - 0.05) break;
        if (li < 3) {
          p.box(lx + tw / 2, ly + th / 2, 0.02, tw, th, 0.4, 'plastic', rng.pick([0x2a2a2a, 0x3a3630, 0x6a6a64]));
          const lit = rng() < 0.3;
          p.box(lx + tw / 2 - 0.03, ly + th / 2 + 0.01, -0.185, tw * 0.72, th * 0.72, 0.01, lit ? 'emissiveCool' : 'glassDirty', lit ? 0x555555 : 0x1a2020);
        } else {
          p.box(lx + 0.15, ly + 0.08, 0, 0.3, 0.16, 0.25, 'plastic', rng.pick([0x1a1a1a, 0x8a8a86]));
        }
        lx += tw + 0.06;
      } else if (kind === 'kitchen') {
        const bw = 0.25 + rng() * 0.2;
        if (rng() < 0.5) p.cyl(lx + bw / 2, ly + 0.14, 0, bw * 0.4, 0.28, 'metalClean', null, null, 10);
        else p.box(lx + bw / 2, ly + 0.15, 0, bw, 0.3, 0.35, 'fabric', rng.pick([0xb09060, 0xd8d0c0, 0x9a8060]));
        lx += bw + 0.05;
      } else if (kind === 'store') {
        const bw = 0.08 + rng() * 0.08, bh = 0.12 + rng() * 0.18;
        p.box(lx + bw / 2, ly + bh / 2, -0.1, bw, bh, 0.12, 'plastic', rng.pick([0xc83020, 0x2050a0, 0xe0c020, 0x30a050, 0xe8e0d0, 0xe07020]));
        lx += bw + 0.015;
      } else {
        const bw = 0.2 + rng() * 0.3, bh = 0.12 + rng() * 0.3;
        if (rng() < 0.75) p.box(lx + bw / 2, ly + bh / 2, 0, bw, bh, d * 0.7, rng.pick(['plastic', 'fabric', 'metalDark', 'woodDark']), rng.pick([0x5a4a3a, 0x2a2a2e, 0x8a7a5a, 0x4a5a6a, 0x7a2a2a]));
        lx += bw + 0.05;
      }
    }
  }
  p.col(0, 1.0, 0, w, 2.0, d, 'metal');
  return p;
}

export function cashRegister(L, x, y, z, ry) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.06, 0, 0.4, 0.12, 0.38, 'plastic', 0x2a2a2a);
  p.box(0, 0.16, 0.06, 0.36, 0.1, 0.22, 'plastic', 0x3a3a3a, [-0.35, 0, 0]);
  p.box(0, 0.3, 0.14, 0.2, 0.12, 0.04, 'emissiveGreen', 0x333333);
  return p;
}

// Floor safe / vault box.
export function floorSafe(L, x, y, z, ry) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.6, 0, 0.9, 1.2, 0.8, 'paintedGreen', 0x2a3a30);
  p.cyl(0.1, 0.7, -0.41, 0.1, 0.03, 'chrome', null, [Math.PI / 2, 0, 0]);
  p.box(-0.25, 0.7, -0.41, 0.04, 0.2, 0.03, 'chrome');
  p.box(0, 0.6, -0.402, 0.8, 1.1, 0.005, 'metalDark');
  p.col(0, 0.6, 0, 0.9, 1.2, 0.8, 'metal');
  return p;
}

// ------------------------------------------------------------ burger barn --
export function booth(L, x, y, z, ry, color = 0x9a1a14) {
  // two benches facing each other across a table, total depth 2.4 (along local z)
  const p = prop(L, x, y, z, ry);
  for (const s of [-1, 1]) {
    p.box(0, 0.23, s * 0.95, 1.4, 0.46, 0.5, 'fabric', color);
    p.box(0, 0.75, s * 1.15, 1.4, 0.6, 0.12, 'fabric', color);
    p.box(0, 0.03, s * 0.95, 1.36, 0.06, 0.46, 'metalDark');
    p.col(0, 0.5, s * 1.0, 1.4, 1.0, 0.4, 'fabric', F_SOLID | F_SHOOT);
  }
  p.box(0, 0.74, 0, 1.2, 0.04, 0.8, 'plasticGloss', 0xd8c890);
  p.cyl(0, 0.36, 0, 0.05, 0.72, 'chrome');
  p.col(0, 0.745, 0, 1.2, 0.06, 0.8, 'wood');
  return p;
}
export function diner_table(L, x, y, z, ry, chairs = 2) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.74, 0, 0.8, 0.04, 0.8, 'plasticGloss', 0xd8c890);
  p.cyl(0, 0.36, 0, 0.05, 0.72, 'chrome');
  p.cyl(0, 0.02, 0, 0.25, 0.04, 'chrome');
  p.col(0, 0.745, 0, 0.8, 0.06, 0.8, 'wood');
  for (let i = 0; i < chairs; i++) {
    const a = i * Math.PI + (rng() - 0.5) * 0.4;
    const cx = Math.sin(a) * 0.62, cz = Math.cos(a) * 0.62;
    const tipped = rng() < 0.2;
    if (tipped) p.box(cx, 0.22, cz, 0.42, 0.42, 0.06, 'plastic', 0xc02018, [1.3, a, 0]);
    else {
      p.box(cx, 0.45, cz, 0.42, 0.05, 0.42, 'plastic', 0xc02018, [0, a, 0]);
      p.box(cx + Math.sin(a) * 0.19, 0.72, cz + Math.cos(a) * 0.19, 0.42, 0.5, 0.04, 'plastic', 0xc02018, [0, a, 0]);
      p.cyl(cx, 0.22, cz, 0.025, 0.44, 'chrome');
    }
  }
  return p;
}
export function grill(L, x, y, z, ry, w = 1.2, kind = 'grill') {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.42, 0, w, 0.84, 0.8, 'metalClean', 0xb8bcb8);
  if (kind === 'grill') p.box(0, 0.86, -0.02, w - 0.08, 0.04, 0.7, 'blackMatte', 0x202020);
  else if (kind === 'fryer') {
    for (const sx of [-w / 4, w / 4]) { p.box(sx, 0.86, 0, w / 2 - 0.1, 0.04, 0.55, 'metalDark', 0x4a3a1a); p.box(sx, 0.95, 0.05, 0.3, 0.12, 0.25, 'metal', 0x9a9a9a); }
  } else p.box(0, 0.86, 0, w - 0.08, 0.04, 0.7, 'metalClean', 0xd0d4d0);
  for (let i = 0; i < 3; i++) p.box(-w / 2 + 0.2 + i * (w - 0.4) / 2, 0.7, -0.405, 0.05, 0.05, 0.02, 'blackMatte');
  p.col(0, 0.44, 0, w, 0.88, 0.8, 'metal');
  return p;
}
// Stainless hood over the cook line (visual only).
export function hood(L, x, y, z, ry, w) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0, 0, w, 0.5, 1.0, 'metalClean', 0xa8aca8);
  p.box(0, -0.26, 0, w - 0.1, 0.02, 0.9, 'metalDark');
  return p;
}
export function prepTable(L, x, y, z, ry, w = 2.0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.9, 0, w, 0.04, 0.75, 'metalClean', 0xc8ccc8);
  p.box(0, 0.25, 0, w - 0.1, 0.02, 0.7, 'metalClean', 0xa8aca8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (w / 2 - 0.05), 0.45, sz * 0.32, 0.04, 0.9, 0.04, 'metalClean');
  p.col(0, 0.91, 0, w, 0.06, 0.75, 'metal');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.col(sx * (w / 2 - 0.05), 0.45, sz * 0.32, 0.05, 0.9, 0.05, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function drinkMachine(L, x, y, z, ry) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.35, 0, 0.9, 0.7, 0.6, 'metalClean', 0x9a9e9a);
  p.box(0, 1.15, 0.05, 0.85, 0.7, 0.5, 'plastic', 0xc02018);
  p.box(0, 1.2, -0.205, 0.7, 0.4, 0.01, 'emissiveWarm', 0x444444);
  for (let i = 0; i < 4; i++) p.box(-0.3 + i * 0.2, 0.8, -0.2, 0.06, 0.1, 0.06, 'blackMatte');
  p.col(0, 0.75, 0, 0.9, 1.5, 0.6, 'metal');
  return p;
}
// Hanging carcass / bagged meat in the walk-in freezer.
export function meatHook(L, x, y, z) {
  const p = prop(L, x, y, z, rng() * 6);
  p.cyl(0, -0.1, 0, 0.01, 0.2, 'chrome', null, null, 4);
  p.sph(0, -0.55, 0, 0.22, 'fabric', 0x8a3a3a, [0.9, 1.9, 0.7]);
  p.sph(0, -0.5, 0.05, 0.2, 'fabric', 0xd8c8b8, [0.8, 1.5, 0.5]);
  return p;
}

// ------------------------------------------------------------ vehicles --
export function bus(L, x, y, z, ry, o = {}) {
  const p = prop(L, x, y, z, ry);
  const burnt = !!o.burnt;
  const body = burnt ? 'rust' : 'carPaint';
  const col = burnt ? 0x3a3430 : (o.color ?? 0xd8b030);
  const len = 11;
  p.box(0, 1.65, 0, 2.5, 2.4, len, body, col);
  p.box(0, 0.35, 0, 2.3, 0.4, len - 0.6, 'metalDark');
  p.box(0, 2.9, 0, 2.45, 0.1, len - 0.2, body, col);
  for (const sx of [-1, 1]) {
    p.box(sx * 1.255, 2.05, 0.3, 0.02, 0.8, len - 2.2, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024);
    for (let i = 0; i < 8; i++) p.box(sx * 1.265, 2.05, -len / 2 + 1.6 + i * 1.2, 0.02, 0.8, 0.06, body, col);
    if (!burnt) p.box(sx * 1.26, 1.05, 0, 0.01, 0.12, len - 0.6, 'paintedBlue', 0x1a3a7a);
  }
  p.box(0, 2.0, -len / 2 - 0.01, 2.2, 1.1, 0.02, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024);
  for (const sx of [-1.15, 1.15]) for (const sz of [-len / 2 + 1.8, len / 2 - 2.2]) p.cyl(sx, 0.5, sz, 0.5, 0.35, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  p.col(0, 1.5, 0, 2.5, 3.0, len, 'metal');
  return p;
}
export function ambulance(L, x, y, z, ry, o = {}) {
  const p = prop(L, x, y, z, ry);
  const burnt = !!o.burnt;
  const white = burnt ? 'rust' : 'carPaint';
  const wc = burnt ? 0x3a3430 : 0xe8e8e4;
  p.box(0, 1.45, 0.7, 2.2, 2.3, 3.8, white, wc);
  p.box(0, 1.0, -1.9, 2.1, 1.3, 1.5, white, wc);
  p.box(0, 1.9, -1.5, 2.05, 0.6, 0.8, burnt ? 'blackMatte' : 'glassDirty', 0x1a2024, [0.3, 0, 0]);
  p.box(0, 0.45, 0, 2.0, 0.4, 5.6, 'metalDark');
  if (!burnt) {
    for (const sx of [-1, 1]) {
      p.box(sx * 1.105, 1.2, 0.7, 0.01, 0.3, 3.7, 'paintedRed', 0xc01810);
      p.box(sx * 1.105, 2.0, 0.7, 0.01, 0.5, 0.5, 'paintedRed', 0xc01810);
      p.box(sx * 1.105, 2.0, 0.7, 0.012, 0.16, 0.5, 'paintedWhite', 0xeeeeee);
      p.box(sx * 1.105, 2.0, 0.7, 0.012, 0.5, 0.16, 'paintedWhite', 0xeeeeee);
    }
    p.box(0, 2.65, -0.9, 1.6, 0.12, 0.3, 'plastic', 0x222222);
    p.box(-0.45, 2.73, -0.9, 0.5, 0.08, 0.26, 'emissiveRed');
    p.box(0.45, 2.73, -0.9, 0.5, 0.08, 0.26, o.lit ? 'emissiveCool' : 'plastic', 0x2244aa);
    p.box(0.6, 0.85, -2.66, 0.3, 0.14, 0.02, 'emissiveWarm', 0x777777);
    p.box(-0.6, 0.85, -2.66, 0.3, 0.14, 0.02, 'emissiveWarm', 0x777777);
  }
  if (o.doorsOpen) {
    p.box(-1.3, 1.45, 2.65, 0.06, 2.0, 0.95, white, wc, [0, 0.9, 0]);
    p.box(1.3, 1.45, 2.65, 0.06, 2.0, 0.95, white, wc, [0, -0.9, 0]);
    p.box(0, 1.45, 2.58, 2.0, 1.9, 0.02, 'blackMatte');
  } else p.box(0, 1.45, 2.61, 2.1, 2.1, 0.02, white, wc);
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.7, 1.8]) p.cyl(sx, 0.4, sz, 0.4, 0.28, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  p.col(0, 1.3, 0.2, 2.2, 2.6, 5.4, 'metal');
  return p;
}
// Articulated fuel tanker: cab (static). The tank itself is built separately (it explodes).
export function tankerCab(L, x, y, z, ry, color = 0x8a1a14) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 1.55, 0, 2.4, 2.3, 2.2, 'carPaint', color);
  p.box(0, 0.75, -1.35, 2.3, 0.9, 0.6, 'carPaint', color);
  p.box(0, 1.95, -1.11, 2.1, 0.9, 0.04, 'glassDirty', 0x1a2024);
  p.box(0, 0.9, -1.66, 1.6, 0.5, 0.04, 'chrome', 0x9a9a9a);
  for (const sx of [-1, 1]) {
    p.box(sx * 1.21, 1.95, 0.1, 0.02, 0.7, 1.0, 'glassDirty', 0x1a2024);
    p.cyl(sx * 1.05, 2.4, 0.95, 0.07, 1.8, 'chrome');
  }
  p.box(0, 0.55, 2.8, 2.0, 0.3, 4.2, 'metalDark');
  for (const sx of [-1.1, 1.1]) for (const sz of [-0.8, 2.2, 3.6]) p.cyl(sx, 0.5, sz, 0.5, 0.36, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  p.col(0, 1.35, -0.2, 2.4, 2.7, 2.8, 'metal');
  return p;
}
// The cylindrical tank (used via buildGroup so it can be swapped for a wreck).
export function tankerTank(L, x, y, z, ry, wreck = false) {
  const p = prop(L, x, y, z, ry);
  const len = 9.0;
  const m = wreck ? 'rust' : 'metalClean';
  const t = wreck ? 0x2a2420 : 0xc8ccc8;
  if (wreck) {
    p.cyl(0, 1.9, -2.4, 1.1, 4.0, m, t, [Math.PI / 2, 0, 0], 16);
    p.cyl(0.2, 1.6, 2.6, 1.05, 3.4, m, t, [Math.PI / 2 + 0.12, 0.1, 0], 16);
    p.box(0, 1.9, 0, 1.6, 0.6, 1.2, 'blackMatte');
  } else {
    p.cyl(0, 1.9, 0, 1.1, len, m, t, [Math.PI / 2, 0, 0], 20);
    for (const sz of [-len / 2, len / 2]) p.sph(0, 1.9, sz, 1.1, m, t, [1, 1, 0.25]);
    for (let i = -3; i <= 3; i++) p.cyl(0, 1.9, i * 1.25, 1.12, 0.06, 'metal', 0x8a8e8a, [Math.PI / 2, 0, 0], 20);
    p.box(0, 3.05, 0, 0.5, 0.05, len - 1, 'diamond');
    for (let i = -1; i <= 1; i++) p.cyl(0, 3.05, i * 2.8, 0.25, 0.14, 'metal', 0x9a9a9a);
    p.box(-1.12, 1.9, 0, 0.02, 0.5, 2.6, 'paintedRed', 0xc02010);
    p.box(1.12, 1.9, 0, 0.02, 0.5, 2.6, 'paintedRed', 0xc02010);
  }
  p.box(0, 0.6, 0, 1.8, 0.4, len - 0.5, 'metalDark');
  for (const sx of [-1.1, 1.1]) for (const sz of [len / 2 - 1.6, len / 2 - 0.4]) p.cyl(sx, 0.5, sz, 0.5, 0.36, 'rubber', 0x151515, [0, 0, Math.PI / 2], 14);
  return p;
}
export function forklift(L, x, y, z, ry, color = 0xd8a020) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.55, 0.2, 1.1, 0.7, 1.7, 'paintedYellow', color);
  p.box(0, 0.75, 1.05, 1.1, 0.9, 0.4, 'metalDark', 0x2a2a2a);
  p.box(0, 1.0, 0.35, 0.5, 0.12, 0.5, 'fabric', 0x1a1a1a);
  p.box(0, 1.3, 0.58, 0.5, 0.5, 0.08, 'fabric', 0x1a1a1a);
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.3, 1.0]) p.box(sx, 1.6, sz, 0.06, 1.4, 0.06, 'metalDark');
  p.box(0, 2.3, 0.35, 1.1, 0.05, 1.4, 'metalDark');
  p.cyl(0, 1.3, -0.1, 0.16, 0.03, 'blackMatte', null, [0.9, 0, 0]);
  for (const sx of [-0.35, 0.35]) p.box(sx, 1.4, -0.72, 0.08, 2.8, 0.1, 'metalDark');
  p.box(0, 0.5, -0.8, 1.0, 0.5, 0.06, 'metalDark');
  for (const sx of [-0.3, 0.3]) p.box(sx, 0.08, -1.35, 0.12, 0.05, 1.1, 'metalDark');
  for (const sx of [-0.55, 0.55]) { p.cyl(sx, 0.3, -0.35, 0.3, 0.25, 'rubber', 0x151515, [0, 0, Math.PI / 2], 12); p.cyl(sx, 0.25, 0.9, 0.25, 0.22, 'rubber', 0x151515, [0, 0, Math.PI / 2], 12); }
  p.col(0, 0.8, 0.3, 1.2, 1.6, 1.9, 'metal');
  p.col(0, 1.4, -0.72, 0.9, 2.8, 0.2, 'metal', F_SOLID | F_SHOOT);
  return p;
}

// ------------------------------------------------------------ freight / warehouse --
// Ribbed shipping container occupying an AABB.
export function container(L, x0, y0, z0, x1, y1, z1, color = 0x2a4a7a, o = {}) {
  L.box(x0, y0, z0, x1, y1, z1, 'paintedBlue', { tint: color, ao: 0.85 });
  const alongX = x1 - x0 > z1 - z0;
  const ribs = 0.65;
  if (alongX) {
    for (let x = x0 + 0.4; x < x1 - 0.3; x += ribs) {
      if (o.faces?.n !== false) L.box(x, y0 + 0.08, z0 - 0.04, x + 0.12, y1 - 0.08, z0, 'paintedBlue', { tint: color, collide: false });
      if (o.faces?.s !== false) L.box(x, y0 + 0.08, z1, x + 0.12, y1 - 0.08, z1 + 0.04, 'paintedBlue', { tint: color, collide: false });
    }
    L.box(x0 - 0.03, y0, z0, x0, y1, z1, 'metalDark', { collide: false });
    L.box(x1, y0, z0, x1 + 0.03, y1, z1, 'metalDark', { collide: false });
  } else {
    for (let z = z0 + 0.4; z < z1 - 0.3; z += ribs) {
      if (o.faces?.w !== false) L.box(x0 - 0.04, y0 + 0.08, z, x0, y1 - 0.08, z + 0.12, 'paintedBlue', { tint: color, collide: false });
      if (o.faces?.e !== false) L.box(x1, y0 + 0.08, z, x1 + 0.04, y1 - 0.08, z + 0.12, 'paintedBlue', { tint: color, collide: false });
    }
    L.box(x0, y0, z0 - 0.03, x1, y1, z0, 'metalDark', { collide: false });
    L.box(x0, y0, z1, x1, y1, z1 + 0.03, 'metalDark', { collide: false });
  }
}
// A row of pallet racking along X (x0..x1) centred on z. One collider for the whole row.
export function rackRow(L, x0, x1, z, y = 0, o = {}) {
  const d = o.depth ?? 1.2, H = o.h ?? 4.6;
  const bay = 2.75;
  const levels = o.levels ?? [0.02, 1.55, 3.05];
  const n = Math.max(1, Math.round((x1 - x0) / bay));
  const bw = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * bw;
    for (const sz of [-d / 2, d / 2]) L.box(x - 0.05, y, z + sz - 0.05, x + 0.05, y + H, z + sz + 0.05, 'paintedBlue', { tint: 0x2a4a9a, collide: false });
  }
  for (let i = 0; i < n; i++) {
    const bx0 = x0 + i * bw + 0.05, bx1 = x0 + (i + 1) * bw - 0.05;
    for (const ly of levels.slice(1)) for (const sz of [-d / 2, d / 2]) L.box(bx0, y + ly - 0.12, z + sz - 0.04, bx1, y + ly, z + sz + 0.04, 'paintedRed', { tint: 0xd86a10, collide: false });
    for (const ly of levels) {
      if (rng() < 0.18) continue;
      // two pallets per bay
      for (let k = 0; k < 2; k++) {
        const px = bx0 + (k + 0.5) * (bx1 - bx0) / 2;
        const top = y + ly;
        if (ly > 0.05) L.box(px - 0.55, top, z - 0.5, px + 0.55, top + 0.12, z + 0.5, 'wood', { tint: 0xb09a78, collide: false });
        const base = top + (ly > 0.05 ? 0.12 : 0);
        const kind = rng();
        const hh = 0.5 + rng() * 0.7;
        if (kind < 0.55) L.box(px - 0.5, base, z - 0.48, px + 0.5, base + hh, z + 0.48, 'fabric', { tint: rng.pick([0x9a8060, 0xa88a60, 0x8a7050]), collide: false });
        else if (kind < 0.8) L.box(px - 0.5, base, z - 0.48, px + 0.5, base + hh, z + 0.48, 'plastic', { tint: rng.pick([0xc8c8c0, 0xb8c0c8, 0x3a6a9a]), collide: false });
        else for (const dz of [-0.25, 0.25]) for (const dx of [-0.25, 0.25]) { const pp = prop(L, px + dx, base, z + dz, 0); pp.cyl(0, 0.44, 0, 0.24, 0.88, 'paintedBlue', rng.pick([0x2a4a8a, 0x8a2a1a, 0x3a5a3a]), null, 10); }
      }
    }
  }
  L.box(x0 - 0.05, y, z - d / 2 - 0.05, x1 + 0.05, y + H, z + d / 2 + 0.05, 'metal', { visible: false });
}
// Stretch-wrapped pallet on the floor (with collision)
export function wrappedPallet(L, x, y, z, ry, h = 1.3, tint = 0xc8c8c0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.06, 0, 1.2, 0.12, 1.0, 'wood', 0xb09a78);
  p.box(0, 0.12 + h / 2, 0, 1.15, h, 0.98, rng() < 0.5 ? 'plastic' : 'fabric', rng() < 0.5 ? tint : 0x9a8060);
  p.col(0, (0.12 + h) / 2, 0, 1.2, 0.12 + h, 1.0, 'wood');
  return p;
}
// Roll-up loading door (visual) on a wall face. axis 'x' => door in a wall along X; nz = face normal sign.
export function rollDoor(L, x, y, z, w, h, nz, o = {}) {
  const t = 0.04;
  const z0 = nz > 0 ? z : z - t, z1 = nz > 0 ? z + t : z;
  L.box(x - w / 2, y, z0, x + w / 2, y + h, z1, 'metal', { tint: o.tint ?? 0x8a8e8a, collide: false });
  for (let yy = y + 0.25; yy < y + h; yy += 0.25) L.box(x - w / 2, yy, nz > 0 ? z1 : z0 - 0.015, x + w / 2, yy + 0.03, nz > 0 ? z1 + 0.015 : z0, 'metalDark', { collide: false });
  L.box(x - w / 2 - 0.15, y, nz > 0 ? z : z - 0.12, x - w / 2, y + h + 0.3, nz > 0 ? z + 0.12 : z, 'paintedYellow', { collide: false });
  L.box(x + w / 2, y, nz > 0 ? z : z - 0.12, x + w / 2 + 0.15, y + h + 0.3, nz > 0 ? z + 0.12 : z, 'paintedYellow', { collide: false });
  L.box(x - w / 2 - 0.15, y + h, nz > 0 ? z : z - 0.35, x + w / 2 + 0.15, y + h + 0.45, nz > 0 ? z + 0.35 : z, 'metalDark', { collide: false });
}

// ------------------------------------------------------------ gas station --
export function pumpVisual(L, x, y, z, ry, wreck = false) {
  const p = prop(L, x, y, z, ry);
  if (wreck) {
    p.box(0, 0.35, 0, 0.8, 0.7, 0.5, 'rust', 0x2a2420, [0.05, 0.2, 0.08]);
    p.box(0.1, 0.8, 0.05, 0.6, 0.3, 0.4, 'blackMatte', null, [0.3, 0.5, -0.2]);
    return p;
  }
  p.box(0, 0.06, 0, 0.95, 0.12, 0.62, 'concrete');
  p.box(0, 0.95, 0, 0.8, 1.66, 0.5, 'paintedWhite', 0xd8d8d0);
  p.box(0, 1.92, 0, 0.86, 0.3, 0.56, 'paintedRed', 0xb81810);
  p.box(0, 1.92, -0.285, 0.7, 0.18, 0.01, 'emissiveWarm', 0x666666);
  for (const sz of [-1, 1]) {
    p.box(0, 1.35, sz * 0.253, 0.5, 0.3, 0.01, 'glassDirty', 0x102018);
    p.box(0, 1.35, sz * 0.256, 0.38, 0.08, 0.01, 'emissiveGreen', 0x333333);
    for (let i = 0; i < 3; i++) p.box(-0.25 + i * 0.25, 0.85, sz * 0.26, 0.14, 0.2, 0.03, 'plastic', [0xd8c020, 0x2a8a2a, 0xc02020][i]);
  }
  for (const sx of [-1, 1]) {
    p.box(sx * 0.42, 1.0, 0, 0.05, 0.22, 0.12, 'blackMatte');
    p.cyl(sx * 0.46, 0.6, -0.05, 0.025, 0.9, 'rubber', 0x111111, [0.35, 0, 0], 6);
  }
  return p;
}
export function canopyColumn(L, x, y, z, h) {
  L.box(x - 0.22, y, z - 0.22, x + 0.22, y + h, z + 0.22, 'paintedWhite', { tint: 0xd8d8d0 });
  L.box(x - 0.24, y, z - 0.24, x + 0.24, y + 0.9, z + 0.24, 'paintedYellow', { collide: false, tint: 0xd8b020 });
}

// ------------------------------------------------------------ plaza / military --
export function jersey(L, x, y, z, ry, len = 2.0, tint = 0xb8b4a8) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.18, 0, len, 0.36, 0.6, 'concrete', tint);
  p.box(0, 0.6, 0, len, 0.5, 0.26, 'concrete', tint);
  p.box(0, 0.4, 0, len, 0.1, 0.4, 'concrete', tint);
  p.col(0, 0.43, 0, len, 0.86, 0.6, 'concrete');
  return p;
}
export function floodlight(L, x, y, z, ry, o = {}) {
  const p = prop(L, x, y, z, ry);
  const on = o.on !== false;
  p.box(0, 0.45, 0, 1.2, 0.5, 2.2, 'paintedYellow', 0xa88a20);
  for (const sz of [-0.8, 0.8]) p.cyl(0, 0.3, sz, 0.3, 1.3, 'rubber', 0x151515, [0, 0, Math.PI / 2], 12);
  p.cyl(0, 0.8 + 3.2, 0.5, 0.08, 6.4, 'metalDark', null, null, 8);
  p.box(0, 7.1, 0.5, 1.8, 0.1, 0.1, 'metalDark');
  for (const sx of [-0.6, 0.6]) for (const sy of [0, 0.55]) {
    p.box(sx, 6.8 + sy, 0.35, 0.45, 0.45, 0.25, 'metalDark', null, [0.35, 0, 0]);
    p.box(sx, 6.8 + sy, 0.22, 0.38, 0.38, 0.02, on ? 'emissiveWarm' : 'blackMatte', null, [0.35, 0, 0]);
  }
  p.col(0, 0.45, 0, 1.2, 0.9, 2.2, 'metal');
  p.col(0, 3.6, 0.5, 0.2, 6.4, 0.2, 'metal');
  if (on) {
    const lp = new THREE.Vector3(0, 6.4, -2.5).applyMatrix4(p.base);
    L.light(lp.x, lp.y, lp.z, 0xfff0d8, o.intensity ?? 34, o.range ?? 26, { flicker: o.flicker ?? 0 });
  }
  return p;
}
export function cot(L, x, y, z, ry, body = false) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.42, 0, 0.7, 0.06, 1.9, 'fabric', 0x4a5a3a);
  for (const sx of [-0.33, 0.33]) p.box(sx, 0.21, 0, 0.04, 0.42, 1.85, 'metalDark');
  if (body) p.box(0, 0.58, 0.1, 0.55, 0.26, 1.6, 'fabric', 0xd8d8d0);
  p.col(0, 0.25, 0, 0.7, 0.5, 1.9, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
export function medCrate(L, x, y, z, ry, s = 1) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.25 * s, 0, 0.9 * s, 0.5 * s, 0.6 * s, 'plastic', 0x4a5a3a);
  p.box(0, 0.25 * s, -0.301 * s, 0.24 * s, 0.08 * s, 0.01, 'paintedWhite', 0xeeeeee);
  p.box(0, 0.25 * s, -0.302 * s, 0.08 * s, 0.24 * s, 0.01, 'paintedRed', 0xc01810);
  p.col(0, 0.25 * s, 0, 0.9 * s, 0.5 * s, 0.6 * s, 'wood');
  return p;
}
// Military triage tent: open on its local -Z side. w along x, d along z.
export function tent(L, x, y, z, ry, w = 5, d = 4, o = {}) {
  const p = prop(L, x, y, z, ry);
  const col = o.color ?? 0x4a5a3a;
  const hw = 2.1, hr = 2.9;
  const slope = Math.atan2(hr - hw, w / 2);
  const rl = Math.hypot(w / 2, hr - hw) + 0.1;
  for (const s of [-1, 1]) p.box(s * w / 4, (hw + hr) / 2, 0, rl, 0.04, d + 0.2, 'fabricGreen', col, [0, 0, -s * slope]);
  for (const s of [-1, 1]) p.box(s * w / 2, hw / 2, 0.1, 0.04, hw, d - 0.2, 'fabricGreen', col);
  p.box(0, hw / 2, d / 2, w, hw, 0.04, 'fabricGreen', col);
  p.box(0, hr - 0.02, d / 2, 0.1, hr - hw, 0.04, 'fabricGreen', col);
  // front flaps rolled up
  for (const s of [-1, 1]) p.cyl(s * (w / 2 - 0.5), hw - 0.1, -d / 2, 0.1, 1.0, 'fabricGreen', col, [0, 0, Math.PI / 2], 8);
  for (const s of [-1, 1]) for (const sz of [-d / 2, d / 2]) p.box(s * (w / 2 - 0.05), hw / 2, sz, 0.05, hw, 0.05, 'metalDark');
  p.box(0, hr / 2, -d / 2, 0.05, hr, 0.05, 'metalDark');
  if (o.cross !== false) {
    p.box(0, 2.35, -d / 2 - 0.03, 0.9, 0.9, 0.01, 'paintedWhite', 0xeeeeee);
    p.box(0, 2.35, -d / 2 - 0.035, 0.6, 0.18, 0.01, 'paintedRed', 0xc01810);
    p.box(0, 2.35, -d / 2 - 0.035, 0.18, 0.6, 0.01, 'paintedRed', 0xc01810);
  }
  for (const s of [-1, 1]) p.col(s * w / 2, hw / 2, 0.1, 0.1, hw, d - 0.2, 'fabric', F_SOLID | F_SHOOT);
  p.col(0, hw / 2, d / 2, w, hw, 0.1, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
// Coil of razor wire lying along local X.
export function razorWire(L, x, y, z, ry, len = 4) {
  const p = prop(L, x, y, z, ry);
  const n = Math.round(len / 0.35);
  for (let i = 0; i < n; i++) p.geo(new THREE.TorusGeometry(0.38, 0.012, 4, 14), 'metal', -len / 2 + (i + 0.5) * len / n, 0.4, 0, [0, Math.PI / 2 + 0.25, 0], [1, 1, 1], 0x8a8e8a);
  return p;
}
export function stretcherPile(L, x, y, z, ry) {
  const p = prop(L, x, y, z, ry);
  for (let i = 0; i < 3; i++) p.box((rng() - 0.5) * 0.2, 0.08 + i * 0.1, (rng() - 0.5) * 0.2, 0.6, 0.06, 2.0, 'fabric', 0x3a4a2a, [0, (rng() - 0.5) * 0.3, 0]);
  return p;
}

// ------------------------------------------------------------ sewer --
export function grate(L, x0, y0, z0, x1, y1, z1, axis) {
  // vertical bars grate filling a tunnel mouth (collidable as one box)
  const span = axis === 'x' ? x1 - x0 : z1 - z0;
  const n = Math.floor(span / 0.18);
  for (let i = 0; i <= n; i++) {
    const a = (axis === 'x' ? x0 : z0) + i * span / n;
    if (axis === 'x') L.box(a - 0.025, y0, (z0 + z1) / 2 - 0.025, a + 0.025, y1, (z0 + z1) / 2 + 0.025, 'rust', { collide: false });
    else L.box((x0 + x1) / 2 - 0.025, y0, a - 0.025, (x0 + x1) / 2 + 0.025, y1, a + 0.025, 'rust', { collide: false });
  }
  for (const yy of [y0 + 0.4, (y0 + y1) / 2, y1 - 0.15]) {
    if (axis === 'x') L.box(x0, yy, (z0 + z1) / 2 - 0.04, x1, yy + 0.08, (z0 + z1) / 2 + 0.04, 'rust', { collide: false });
    else L.box((x0 + x1) / 2 - 0.04, yy, z0, (x0 + x1) / 2 + 0.04, yy + 0.08, z1, 'rust', { collide: false });
  }
  L.box(x0, y0, z0, x1, y1, z1, 'metal', { visible: false, flags: F_SOLID | F_SHOOT });
}
export function locker(L, x, y, z, ry, n = 3) {
  const p = prop(L, x, y, z, ry);
  const w = 0.42;
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * w;
    const open = rng() < 0.3;
    p.box(lx, 0.95, 0, w - 0.02, 1.9, 0.5, 'paintedGreen', 0x5a6a60);
    if (open) p.box(lx - w / 2 + 0.02, 0.95, -0.45, 0.02, 1.8, w - 0.04, 'paintedGreen', 0x5a6a60, [0, 0.9, 0]);
    else for (let k = 0; k < 3; k++) p.box(lx, 1.6 + k * 0.06, -0.252, w - 0.12, 0.02, 0.005, 'blackMatte');
  }
  p.col(0, 0.95, 0, n * w, 1.9, 0.5, 'metal');
  return p;
}
export function workbench(L, x, y, z, ry, w = 2.0) {
  const p = prop(L, x, y, z, ry);
  p.box(0, 0.88, 0, w, 0.06, 0.8, 'woodDark', 0x6a5a40);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (w / 2 - 0.06), 0.43, sz * 0.33, 0.07, 0.86, 0.07, 'metalDark');
  p.box(0, 0.2, 0, w - 0.1, 0.03, 0.7, 'metalDark');
  p.box(-w / 4, 0.95, 0.1, 0.35, 0.08, 0.2, 'paintedRed', 0xa02010);
  p.box(w / 4, 0.93, -0.1, 0.25, 0.05, 0.12, 'metal');
  p.col(0, 0.89, 0, w, 0.08, 0.8, 'wood');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.col(sx * (w / 2 - 0.06), 0.43, sz * 0.33, 0.08, 0.86, 0.08, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function cctvDesk(L, x, y, z, ry) {
  const p = P.desk(L, x, y, z, ry, false);
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 2; k++) {
      const lx = -0.45 + i * 0.45, ly = 1.0 + k * 0.38;
      p.box(lx, ly, 0.15, 0.42, 0.34, 0.3, 'plastic', 0x2a2a2a);
      p.box(lx, ly, -0.005, 0.36, 0.28, 0.01, (i + k) % 3 === 1 ? 'glassDirty' : 'emissiveCool', (i + k) % 3 === 1 ? 0x101418 : 0x3a4a44);
    }
  }
  return p;
}
