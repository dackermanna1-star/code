import * as THREE from 'three';

// Procedural vegetation geometry. Every vertex carries:
//   aKind: 0 bark, 1 green frond, 2 dead frond, 3 card foliage
//   aSway: 0 at the anchor, rising toward the free end (drives wind motion)

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.kind = [];
    this.sway = [];
    this.idx = [];
  }

  vertex(p, n, u, v, kind, sway) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
    this.kind.push(kind);
    this.sway.push(sway);
    return this.kind.length - 1;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

function frond(b, top, az, el, length, droop, width, kind, r, segs) {
  const dir = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const side = norm([-Math.sin(az), 0, Math.cos(az)]);
  const start = add(top, [Math.cos(az), 0, Math.sin(az)], 0.18);
  const twist = (r() - 0.5) * 0.5;
  const rows = [];
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    const d = length * s;
    const p = add(add(start, dir, d), [0, -droop * d * d, 0]);
    const tan = norm([dir[0], dir[1] - 2 * droop * d, dir[2]]);
    let up = norm(cross(side, tan));
    if (up[1] < 0) up = [-up[0], -up[1], -up[2]];
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + s * 1.02)), 0.55);
    const fold = 0.42 + twist * s;
    const left = add(add(p, side, -w), up, w * fold);
    const right = add(add(p, side, w), up, w * (0.42 - twist * s));
    const nl = norm(add(up, side, 0.4));
    const nr = norm(add(up, side, -0.4));
    const sway = 0.15 + 0.85 * s;
    rows.push([
      b.vertex(left, nl, 0, s, kind, sway),
      b.vertex(p, nl, 0.5, s, kind, sway),
      b.vertex(p, nr, 0.5, s, kind, sway),
      b.vertex(right, nr, 1, s, kind, sway),
    ]);
  }
  for (let k = 0; k < segs; k++) {
    const a = rows[k];
    const c = rows[k + 1];
    b.idx.push(a[0], a[1], c[1], a[0], c[1], c[0]);
    b.idx.push(a[2], a[3], c[3], a[2], c[3], c[2]);
  }
}

/** One date palm. Heights in metres; the trunk base sits at the origin. */
export function palmGeometry(seed, { height = 10, bend = 0.05, fronds = 26, segs = 9 } = {}) {
  const r = rng(seed);
  const b = new Builder();
  const tSegs = 12;
  const radial = 9;
  const ba = r() * Math.PI * 2;
  const bx = Math.cos(ba);
  const bz = Math.sin(ba);
  const centre = (t) => [bend * height * t * t * bx, t * height, bend * height * t * t * bz];
  const radius = (t) => (0.23 - 0.05 * t) * (1 + 0.7 * Math.pow(1 - t, 8));
  const rows = [];
  for (let i = 0; i <= tSegs; i++) {
    const t = i / tSegs;
    const c = centre(t);
    const rad = radius(t);
    const row = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = [Math.cos(a), 0.12, Math.sin(a)];
      row.push(b.vertex([c[0] + Math.cos(a) * rad, c[1], c[2] + Math.sin(a) * rad], norm(n), j / radial, t * height, 0, t * t * 0.25));
    }
    rows.push(row);
  }
  for (let i = 0; i < tSegs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = rows[i][j];
      const c = rows[i + 1][j];
      b.idx.push(a, rows[i][j + 1], rows[i + 1][j + 1], a, rows[i + 1][j + 1], c);
    }
  }
  const top = centre(1);
  // Green crown: young fronds stand up, old ones droop.
  for (let f = 0; f < fronds; f++) {
    const age = Math.min(1, Math.max(0, f / fronds + (r() - 0.5) * 0.15));
    const az = f * 2.39996 + r() * 0.3;
    const el = 1.2 - age * 1.55 + (r() - 0.5) * 0.18;
    const len = (2.9 + 1.5 * r()) * (0.82 + 0.18 * Math.sin(Math.PI * age));
    const droop = 0.03 + 0.11 * age;
    frond(b, add(top, [0, -0.15 - 0.35 * age, 0]), az, el, len, droop, 0.55 * (len / 4), 1, r, segs);
  }
  // A skirt of dead fronds hanging below the crown.
  const dead = 3 + Math.floor(r() * 4);
  for (let f = 0; f < dead; f++) {
    const az = r() * Math.PI * 2;
    const el = -1.25 - r() * 0.25;
    frond(b, add(top, [0, -0.45 - r() * 0.4, 0]), az, el, 1.8 + r() * 0.8, 0.02, 0.2, 2, r, 5);
  }
  return b.build();
}

/**
 * n vertical cards crossing at the centre (a star), for grass and shrubs. Normals point
 * outward and up from the plant centre, which shades a clump as a rounded volume.
 */
export function cardClump(seed, { cards = 3, width = 1, height = 0.7, spread = 0.12 } = {}) {
  const r = rng(seed);
  const b = new Builder();
  for (let i = 0; i < cards; i++) {
    const a = (i / cards) * Math.PI + r() * 0.3;
    const dx = Math.cos(a) * width * 0.5;
    const dz = Math.sin(a) * width * 0.5;
    const ox = (r() - 0.5) * spread;
    const oz = (r() - 0.5) * spread;
    const lean = (r() - 0.5) * 0.15;
    const corners = [
      [ox - dx, 0, oz - dz, 0, 0],
      [ox + dx, 0, oz + dz, 1, 0],
      [ox + dx + lean, height, oz + dz, 1, 1],
      [ox - dx + lean, height, oz - dz, 0, 1],
    ];
    const ids = corners.map(([x, y, z, u, v]) => {
      const n = norm([x * 1.2, 0.6 + y / height, z * 1.2]);
      return b.vertex([x, y, z], n, u, v, 3, Math.pow(y / height, 1.4));
    });
    b.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  return b.build();
}
