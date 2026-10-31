import * as THREE from 'three';
import { riverZ, riverW } from '../level/layout.js';
import { groundY, smoothLine } from './terrain.js';
import { rng, vnoise } from './textures.js';

/**
 * Vegetation. The eye never leaves the tower, so the woods are pixel-art tree cards turned to
 * face it (a second card crosses each one for other viewpoints), with bulging "spherical"
 * normals so the low sun lights their sun side and leaves the far side dark. Behind them, three
 * rings of treeline strips climb the hills. Near trees (orchard, lone oaks, willows by the river)
 * are low-poly with alpha-cut leaf blobs. The cornfield is rows of corn cards; grass tufts and
 * reeds are instanced cards. Everything leafy sways in the wind (vertex shader).
 */

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const qx = ax + dx * t - x, qz = az + dz * t - z;
    best = Math.min(best, qx * qx + qz * qz);
  }
  return Math.sqrt(best);
}

/** Two crossed unit cards (1 wide, 1 tall, base at y = 0) with bulging normals and sway. */
function cardGeometry() {
  const pos = [], nrm = [], uv = [], sway = [], idx = [];
  const add = (ax, az) => {
    const base = pos.length / 3;
    const corners = [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]];
    for (const [s, y, u, v] of corners) {
      const x = s * ax, z = s * az;
      pos.push(x, y, z);
      // bulge toward the viewer (+z, turned to face the tower) plus the offset from the crown's
      // centre; the crossed card uses the same field so it never flares edge-on in a side light
      const n = new THREE.Vector3(x * 1.4, (y - 0.45) * 1.1, 0.9 + z * 0.6).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(u, v);
      sway.push(y * y);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  add(1, 0); // faces +z
  add(0, 1); // faces -x
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

function instanced(geo, mat, list) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((t, i) => {
    _q.setFromAxisAngle(_up, t.yaw);
    _p.set(t.x, t.y, t.z);
    _s.set(t.w, t.h, t.w);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.setRGB(t.c[0], t.c[1], t.c[2]));
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

const AUTUMN = [
  [0.82, 0.86, 0.6], [0.95, 0.85, 0.5], [1.05, 0.72, 0.42], [0.9, 0.55, 0.36], [0.72, 0.78, 0.52], [1.0, 0.9, 0.55],
];

/**
 * Build the vegetation. Returns { meshes: [...], cornCount, treeCount, tuftCount }.
 * mats: { cardPine, cardBroad, cardBare, cardPoplar, treeline, tuft } materials; bank: a Bank for
 * the merged corn rows ('corn').
 */
export function buildVegetation(L, bank, mats) {
  const S = L.scenery;
  const R = rng(9001);
  const out = [];
  const roads = S.roads.map((r) => ({ pts: smoothLine(r.pts, 6), hw: r.width / 2 }));
  const blockers = S.buildings.map((b) => ({ x: b.pos[0], z: b.pos[1], r: Math.hypot(b.size[0], b.size[1]) / 2 + 4 }));
  for (const s of S.silos) blockers.push({ x: s.pos[0], z: s.pos[1], r: s.r + 4 });
  blockers.push({ x: S.waterTower.pos[0], z: S.waterTower.pos[1], r: 7 });
  const inField = (x, z, pad = 0) => S.fields.some((f) => x > f.minX - pad && x < f.maxX + pad && z > f.minZ - pad && z < f.maxZ + pad);
  const clear = (x, z, roadPad = 4) => {
    if (Math.abs(z - riverZ(x)) < riverW(x) + 3) return false;
    for (const r of roads) if (distToPolyline(x, z, r.pts) < r.hw + roadPad) return false;
    for (const b of blockers) if (Math.hypot(x - b.x, z - b.z) < b.r) return false;
    for (const sp of L.spawns) if (Math.hypot(x - sp.pos[0], z - sp.pos[1]) < 15) return false;
    const C = S.cemetery;
    if (x > C.minX - 3 && x < C.maxX + 3 && z > C.minZ - 3 && z < C.maxZ + 3) return false;
    return true;
  };

  // ---- the woods ring: cards
  const lists = { pine: [], broad: [], bare: [], poplar: [] };
  const step = 7.5;
  for (let gx = -700; gx <= 700; gx += step) {
    for (let gz = -700; gz <= 700; gz += step) {
      const x = gx + (R() - 0.5) * step * 0.9, z = gz + (R() - 0.5) * step * 0.9;
      const r = Math.hypot(x, z);
      const ix = Math.round((gx + 700) / step), iz = Math.round((gz + 700) / step);
      if (r > 470 && (ix % 2 || iz % 2)) continue; // a quarter as dense on the hills
      const th = Math.atan2(z, x);
      const rin = 206 + 24 * vnoise((th / (Math.PI * 2)) * 9, 0.5, 9, 4, 77) + 10 * vnoise((th / (Math.PI * 2)) * 31, 0.5, 31, 4, 78);
      if (r < rin || r > 700) continue;
      const dens = r > 470 ? 0.75 * vnoise(x / 90, z / 90, 4096, 4096, 79) + 0.2 : smooth(rin, rin + 30, r) * 0.82 + 0.12;
      if (R() > dens) continue;
      if (!clear(x, z, r < 300 ? 5 : 3)) continue;
      if (r < 260 && inField(x, z, 2)) continue;
      const y = groundY(x, z) - 0.2;
      const u = R();
      const kind = u < 0.52 ? 'pine' : u < 0.82 ? 'broad' : u < 0.93 ? 'bare' : 'poplar';
      const big = r > 470 ? 1.35 : 1;
      const hgt = big * (kind === 'pine' ? 11 + R() * 9 : kind === 'broad' ? 9 + R() * 7 : kind === 'bare' ? 8 + R() * 6 : 13 + R() * 7);
      const asp = kind === 'pine' || kind === 'poplar' ? 0.5 : 1.0;
      const yaw = Math.atan2(-x, -z) + (R() - 0.5) * 0.25;
      const shade = 0.82 + R() * 0.3;
      let c;
      if (kind === 'broad') {
        const a = AUTUMN[Math.floor(R() * AUTUMN.length)];
        c = [a[0] * shade, a[1] * shade, a[2] * shade];
      } else if (kind === 'pine') c = [shade * 0.95, shade, shade * 0.95];
      else c = [shade, shade * 0.97, shade * 0.95];
      lists[kind].push({ x, y, z, w: hgt * asp * (0.9 + R() * 0.25), h: hgt, yaw, c });
    }
  }
  // hedgerows / bushes along field edges and fences, small broadleaf cards
  for (const f of S.fields) {
    if (f.kind === 'pasture') continue;
    const per = 2 * (f.maxX - f.minX + f.maxZ - f.minZ);
    for (let k = 0; k < per / 9; k++) {
      const t = R() * per;
      let x, z;
      const w = f.maxX - f.minX, d = f.maxZ - f.minZ;
      if (t < w) { x = f.minX + t; z = f.minZ - 1.5; } else if (t < w + d) { x = f.maxX + 1.5; z = f.minZ + t - w; } else if (t < 2 * w + d) { x = f.maxX - (t - w - d); z = f.maxZ + 1.5; } else { x = f.minX - 1.5; z = f.maxZ - (t - 2 * w - d); }
      if (!clear(x, z, 3) || Math.max(Math.abs(x), Math.abs(z)) < 20) continue;
      const hgt = 1.6 + R() * 2.4;
      const a = AUTUMN[Math.floor(R() * AUTUMN.length)];
      lists.broad.push({ x, y: groundY(x, z) - 0.1, z, w: hgt * 1.3, h: hgt, yaw: Math.atan2(-x, -z), c: [a[0] * 0.75, a[1] * 0.75, a[2] * 0.7] });
    }
  }
  // bushes and young trees along the river banks
  for (let x = -330; x <= 330; x += 3.5) {
    if (R() < 0.45) continue;
    if (L.bridges.some((b) => x > b.minX - 8 && x < b.maxX + 8)) continue;
    const side = R() < 0.5 ? -1 : 1;
    const z = riverZ(x) + side * (riverW(x) + 2.6 + R() * 4);
    if (!clear(x, z, 3) && Math.abs(z - riverZ(x)) > riverW(x) + 1) continue;
    const big = R() < 0.25;
    const hgt = big ? 6 + R() * 5 : 1.5 + R() * 2.5;
    const a = AUTUMN[Math.floor(R() * AUTUMN.length)];
    lists[big && R() < 0.3 ? 'poplar' : 'broad'].push({ x, y: -0.2, z, w: hgt * (big ? 0.9 : 1.4), h: hgt, yaw: Math.atan2(-x, -z), c: [a[0] * 0.8, a[1] * 0.82, a[2] * 0.75] });
  }

  // ---- treeline strips on the hills
  {
    const pos = [], uv = [], nrm = [], idx = [], sway = [];
    let base = 0;
    for (const [rad, h, seed] of [[455, 17, 1], [500, 19, 2], [560, 22, 3]]) {
      const N = 360;
      let s = 0;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const rr = rad + 22 * vnoise((i / N) * 13, seed, 13, 8, 91);
        const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        const y = groundY(x, z);
        const hh = h * (0.75 + 0.5 * vnoise((i / N) * 40, seed, 40, 8, 92));
        if (i > 0) s += (Math.PI * 2 * rr) / N;
        pos.push(x, y - 3, z, x, y + hh, z);
        const nx = -Math.cos(th), nz = -Math.sin(th);
        nrm.push(nx, 0.3, nz, nx, 0.6, nz);
        uv.push(s / 70, 0, s / 70, 1);
        sway.push(0, 0.15);
        if (i > 0) {
          const k = base + (i - 1) * 2;
          idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
        }
      }
      base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mats.treeline);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    out.push(m);
  }

  // ---- near trees: the orchard and the lone trees, cards like the woods (the eye never moves,
  // so a card turned to face it reads as a whole tree)
  const card = (x, z, kind, h, tint) => {
    const list = kind === 'dead' ? lists.bare : kind === 'poplar' ? lists.poplar : lists.broad;
    const asp = kind === 'poplar' ? 0.55 : kind === 'willow' ? 1.25 : 1.0;
    list.push({ x, y: groundY(x, z) - 0.15, z, w: h * asp * (0.92 + R() * 0.16), h, yaw: Math.atan2(-x, -z) + (R() - 0.5) * 0.2, c: tint });
  };
  {
    const O = S.orchard;
    for (let x = O.minX + 3; x < O.maxX; x += O.dx) {
      for (let z = O.minZ + 3; z < O.maxZ; z += O.dz) {
        const dead = R() < 0.2;
        const a = AUTUMN[Math.floor(R() * AUTUMN.length)];
        const k = 0.85 + R() * 0.2;
        card(x + (R() - 0.5) * 0.8, z + (R() - 0.5) * 0.8, dead ? 'dead' : 'oak', 5 + R() * 1.6, dead ? [0.9, 0.86, 0.82] : [a[0] * k, a[1] * k, a[2] * k]);
      }
    }
  }
  for (const t of S.trees) {
    const a = t.kind === 'birch' ? [1.15, 0.98, 0.5] : t.kind === 'willow' ? [0.86, 0.92, 0.58] : t.kind === 'dead' ? [0.85, 0.82, 0.8] : AUTUMN[Math.floor(R() * AUTUMN.length)];
    card(t.pos[0], t.pos[1], t.kind, t.h, a);
  }

  const cg = cardGeometry();
  const treeCount = lists.pine.length + lists.broad.length + lists.bare.length + lists.poplar.length;
  out.push(instanced(cg, mats.cardPine, lists.pine), instanced(cg, mats.cardBroad, lists.broad), instanced(cg, mats.cardBare, lists.bare), instanced(cg, mats.cardPoplar, lists.poplar));

  // ---- the cornfield: rows of cards along z
  const corn = bank.b('corn', { sway: true });
  let cornCount = 0;
  for (const f of S.fields) {
    if (f.kind !== 'corn') continue;
    for (let x = f.minX + 0.45; x < f.maxX; x += 0.9) {
      for (let z = f.minZ + 0.2; z < f.maxZ - 1.2; z += 1.6) {
        if (R() < 0.03) continue; // trampled gaps
        const sc = S.scarecrow;
        if (Math.hypot(x - sc[0], z - sc[1]) < 2.5) continue;
        const h = 2.0 + R() * 0.55 - (x < f.minX + 2 || x > f.maxX - 2 ? 0.3 : 0);
        const k = 0.8 + R() * 0.35;
        corn.setColor(k, k * (0.95 + R() * 0.08), k * (0.88 + R() * 0.1));
        corn.sway = (ly) => (ly > 0.5 ? 0.45 : 0);
        const flip = R() < 0.5;
        const xx = x + (R() - 0.5) * 0.18;
        bank.identity();
        // front faces +x (toward the tower)
        corn.quad([xx, 0, z + 1.6], [xx, 0, z], [xx, h, z], [xx, h, z + 1.6], flip ? [1, 0] : [0, 0], flip ? [0, 0] : [1, 0], flip ? [0, 1] : [1, 1], flip ? [1, 1] : [0, 1], [1, 0.25, 0]);
        cornCount++;
      }
    }
  }

  // ---- grass tufts and reeds (instanced)
  const tufts = [];
  for (let k = 0; k < 5200 && tufts.length < 700; k++) {
    const r = 9 + Math.pow(R(), 0.9) * 42, a = R() * 6.28;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 9 && Math.abs(z) < 9) continue;
    if (!clear(x, z, 1.5) || inField(x, z, -1) && !S.fields.some((f) => (f.kind === 'pasture' || f.kind === 'fallow') && x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ)) continue;
    const h = 0.35 + R() * 0.45;
    const g = 0.5 + R() * 0.25;
    tufts.push({ x, y: 0, z, w: h * 1.4, h, yaw: R() * 6.28, c: [g * 0.95, g, g * 0.8] });
  }
  for (let x = -260; x <= 260; x += 1.2) {
    if (R() < 0.35) continue;
    if (L.bridges.some((b) => x > b.minX - 1 && x < b.maxX + 1)) continue;
    const side = R() < 0.5 ? -1 : 1;
    const z = riverZ(x) + side * (riverW(x) + (R() - 0.3) * 1.6);
    const h = 0.9 + R() * 0.9;
    const g = 0.75 + R() * 0.3;
    tufts.push({ x, y: -0.45, z, w: h * 0.9, h, yaw: R() * 6.28, c: [g * 1.05, g, g * 0.7] });
  }
  out.push(instanced(cg, mats.tuft, tufts));
  return { meshes: out, cornCount, treeCount, tuftCount: tufts.length };
}
