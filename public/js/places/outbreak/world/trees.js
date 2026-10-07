// Tree, bush and rock models, built from code. Conifers are a bark-textured
// trunk with whorls of drooping branch cards (a drawn needle texture); broad-
// leaved trees and birches have a few limbs and a crown of leaf-cluster cards.
// Foliage normals point away from the middle of the crown so it lights like
// a soft ball rather than a pile of flat cards.
import * as THREE from 'three';
import { rng } from '../noise.js';

/** Collects triangles with position, normal, uv and a 'kind' (0 bark, 1 foliage). */
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.k = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, k) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.k.push(k); return this.count - 1; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('kind', new THREE.Float32BufferAttribute(this.k, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** A tapered cylinder from a to b (radii r0, r1), bark. */
function limb(G, a, b, r0, r1, seg = 7, vScale = 1) {
  const dir = new THREE.Vector3().subVectors(b, a), L = dir.length(); dir.normalize();
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t1 = new THREE.Vector3().crossVectors(dir, up).normalize(), t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
  const base = G.count;
  for (let ring = 0; ring <= 1; ring++) {
    const c = ring ? b : a, r = ring ? r1 : r0;
    for (let i = 0; i <= seg; i++) {
      const ang = i / seg * Math.PI * 2, cx = Math.cos(ang), cz = Math.sin(ang);
      const n = new THREE.Vector3().addScaledVector(t1, cx).addScaledVector(t2, cz);
      G.vert(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r, n.x, n.y, n.z, i / seg * Math.max(1, Math.round(r0 * 3)), ring * L * vScale / 6, 0);
    }
  }
  for (let i = 0; i < seg; i++) { const a0 = base + i, a1 = a0 + 1, b0 = a0 + seg + 1, b1 = b0 + 1; G.quad(a0, b0, b1, a1); }
}

/** A foliage card centred at c, spanning +-w along tangent t and 0..h along v (the card's 'up'). Normal: away from `centre`. */
function card(G, c, t, v, w, h, centre, uvRect = [0, 0, 1, 1], back = 0) {
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  const ids = corners.map(([s, q]) => {
    const p = new THREE.Vector3().copy(c).addScaledVector(t, s * w).addScaledVector(v, q * h - back);
    const n = new THREE.Vector3().subVectors(p, centre).normalize();
    n.y = n.y * 0.6 + 0.4; n.normalize();
    const u = uvRect[0] + (s * 0.5 + 0.5) * (uvRect[2] - uvRect[0]), vv = uvRect[1] + q * (uvRect[3] - uvRect[1]);
    return G.vert(p.x, p.y, p.z, n.x, n.y, n.z, u, vv, 1);
  });
  G.quad(ids[0], ids[1], ids[2], ids[3]);
}

/** A spruce/fir: height H. */
export function conifer(seed, H = 34, opts = {}) {
  const r = rng(seed), G = new Geo();
  const trunkR = H * 0.022 + 0.3;
  limb(G, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, H * 0.96, 0), trunkR, 0.12, 7, 2);
  const levels = opts.levels || 10, bottom = H * (opts.bare ?? 0.22);
  for (let l = 0; l < levels; l++) {
    const t = l / (levels - 1), y = bottom + (H * 0.94 - bottom) * t;
    const reach = (1 - t) * H * 0.32 + 1.5, droop = 0.4 - t * 0.2;
    const n = Math.max(5, Math.round(11 - t * 5));
    const off = r() * Math.PI;
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < n; i++) {
      const rr = ring ? 0.75 : 1, ry = ring ? -H * 0.03 : 0;
      const a = off + (i + ring * 0.5) / n * Math.PI * 2 + (r() - 0.5) * 0.4;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-out.z, 0, out.x);
      const dr = droop + (ring ? 0.25 : 0) + (r() - 0.5) * 0.15;
      const dir = out.clone().multiplyScalar(Math.cos(dr)).add(new THREE.Vector3(0, -Math.sin(dr), 0)).normalize();
      // a branch card lying along dir, tilted so it's seen from above and the side
      const c = new THREE.Vector3(0, y + ry, 0).addScaledVector(out, trunkR * 0.4);
      const tilt = 0.35 + r() * 0.3;
      const tvec = side.clone().multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0)).normalize();
      card(G, c, tvec, dir, reach * 0.5 * rr, reach * rr, new THREE.Vector3(0, y - 2, 0));
    }
  }
  // the tip
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI; card(G, new THREE.Vector3(0, H * 0.84, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), new THREE.Vector3(0, 1, 0), 1.3, H * 0.2, new THREE.Vector3(0, H * 0.8, 0)); }
  return G.build();
}

/** A broad-leaved tree (oak/maple) or a birch. */
export function broadleaf(seed, H = 30, kind = 'oak') {
  const r = rng(seed), G = new Geo();
  const birch = kind === 'birch';
  const trunkR = birch ? 0.55 : H * 0.03 + 0.4;
  const crownY = H * (birch ? 0.62 : 0.58), crownR = H * (birch ? 0.22 : 0.33);
  limb(G, new THREE.Vector3(0, -1, 0), new THREE.Vector3((r() - 0.5) * 1.2, crownY, (r() - 0.5) * 1.2), trunkR, trunkR * 0.55, 8, 2);
  const limbs = [];
  for (let i = 0; i < (birch ? 3 : 5); i++) {
    const a = i / 5 * Math.PI * 2 + r(), y = crownY * (0.65 + r() * 0.25);
    const end = new THREE.Vector3(Math.cos(a) * crownR * 0.7, y + crownR * (0.4 + r() * 0.5), Math.sin(a) * crownR * 0.7);
    limb(G, new THREE.Vector3(0, y, 0), end, trunkR * 0.45, 0.12, 5, 2);
    limbs.push(end);
  }
  const centre = new THREE.Vector3(0, crownY + crownR * 0.5, 0);
  const cards = birch ? 46 : 64;
  for (let i = 0; i < cards; i++) {
    // points spread over a lumpy ellipsoid, a little inside
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const lump = 0.75 + 0.25 * r();
    const p = new THREE.Vector3(s * Math.cos(a) * crownR * lump, u * crownR * (birch ? 1.3 : 0.85) * lump, s * Math.sin(a) * crownR * lump).add(centre);
    const out = new THREE.Vector3().subVectors(p, centre).normalize();
    let t = new THREE.Vector3(-out.z, 0, out.x); if (t.lengthSq() < 0.01) t.set(1, 0, 0); t.normalize();
    const v = new THREE.Vector3().crossVectors(out, t).normalize().multiplyScalar(-1);
    const sz = crownR * (birch ? 0.42 : 0.5) * (0.8 + r() * 0.4);
    card(G, p, t, v, sz * 0.5, sz, centre, [0, 0, 1, 1], sz * 0.5);
  }
  return G.build();
}

/** A bush: leaf cards in a dome. */
export function bush(seed, R = 3) {
  const r = rng(seed), G = new Geo();
  const centre = new THREE.Vector3(0, R * 0.5, 0);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, u = r() * 0.9;
    const p = new THREE.Vector3(Math.cos(a) * R * 0.6 * (1 - u * 0.5), R * (0.2 + u * 0.7), Math.sin(a) * R * 0.6 * (1 - u * 0.5));
    const out = new THREE.Vector3().subVectors(p, new THREE.Vector3(0, 0, 0)).normalize();
    const t = new THREE.Vector3(-out.z, 0, out.x).normalize();
    const v = new THREE.Vector3(0, 1, 0);
    card(G, p, t, v, R * 0.55, R * 0.95, centre, [0, 0, 1, 1], R * 0.45);
  }
  return G.build();
}

/** A rock: a squashed, lumpy icosphere. */
export function rock(seed, R = 3) {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(R, 2);
  const p = g.attributes.position;
  const sx = 0.8 + r() * 0.6, sy = 0.45 + r() * 0.35, sz = 0.8 + r() * 0.6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 1.7 + seed) * Math.cos(z * 1.3 + seed * 0.7) + 0.1 * Math.sin(y * 2.3 + x);
    p.setXYZ(i, x * sx * k, Math.max(-R * 0.3, y * sy * k), z * sz * k);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) / 6; uv[i * 2 + 1] = p.getY(i) / 6; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(p.count).fill(2), 1));
  return g;
}
