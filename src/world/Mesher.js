// Chunk section mesher (16x16x16). Produces compact vertex data for three render passes.
//
// Vertex format (separate attributes):
//   position Uint16 x3  : local coords * 32 (1/32 block precision), section origin applied by mesh position
//   uv       Uint8  x2  : texture coords * 32 (0..32 covers one tile; >32 repeats)
//   data     Uint8  x4  : [face (0..5, 6 = plant/up), flags, layer & 255, layer >> 8]
//                         flags: 1 sway, 2 top vertex (plants), 4 emissive, 8 water, 16 water surface underside
//   light    Uint8  x4  : [sky*17, block*17, ao 0..255, 0]   (normalized)
// Faces: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z

import { BLOCKS, OPAQUE, getBoxes, faceTexture } from './blocks.js';
import { CHUNK } from './World.js';
import { hash32 } from '../core/rng.js';

const N = CHUNK;
const P = N + 2;
const PP = P * P;
const S = 32; // fixed point scale

// Per face: 4 corners (CCW from outside) as [x,y,z], plus uv function inputs
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// uv (in block units) for a point on a face
function faceUV(face, x, y, z) {
  switch (face) {
    case 0: return [1 - z, 1 - y];
    case 1: return [z, 1 - y];
    case 2: return [x, z];
    case 3: return [x, z];
    case 4: return [x, 1 - y];
    default: return [1 - x, 1 - y];
  }
}
// rotate top-face uv for oriented blocks so the front edge is the image bottom
function rotTopUV(f, x, z) {
  switch (f & 3) {
    case 0: return [x, z];
    case 1: return [z, 1 - x];
    case 2: return [1 - x, 1 - z];
    default: return [1 - z, x];
  }
}

const AO_CURVE = [90, 150, 205, 255];

class Buf {
  constructor() {
    this.cap = 4096;
    this.pos = new Uint16Array(this.cap * 3);
    this.uv = new Uint8Array(this.cap * 2);
    this.data = new Uint8Array(this.cap * 4);
    this.light = new Uint8Array(this.cap * 4);
    this.idx = new Uint32Array(this.cap * 1.5);
    this.n = 0; this.ni = 0;
  }
  reset() { this.n = 0; this.ni = 0; }
  ensure(k) {
    if (this.n + k <= this.cap) return;
    let cap = this.cap;
    while (this.n + k > cap) cap *= 2;
    const grow = (arr, per) => { const a = new arr.constructor(cap * per); a.set(arr); return a; };
    this.pos = grow(this.pos, 3); this.uv = grow(this.uv, 2); this.data = grow(this.data, 4);
    this.light = grow(this.light, 4); this.idx = grow(this.idx, 1.5);
    this.cap = cap;
  }
  vert(x, y, z, u, v, face, flags, layer, sky, blk, ao) {
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.data[i * 4] = face; this.data[i * 4 + 1] = flags; this.data[i * 4 + 2] = layer & 255; this.data[i * 4 + 3] = layer >> 8;
    this.light[i * 4] = sky; this.light[i * 4 + 1] = blk; this.light[i * 4 + 2] = ao; this.light[i * 4 + 3] = 0;
  }
  quad(flip) {
    const b = this.n - 4;
    const I = this.idx;
    let k = this.ni;
    if (flip) {
      I[k++] = b + 1; I[k++] = b + 2; I[k++] = b + 3;
      I[k++] = b + 1; I[k++] = b + 3; I[k++] = b;
    } else {
      I[k++] = b; I[k++] = b + 1; I[k++] = b + 2;
      I[k++] = b; I[k++] = b + 2; I[k++] = b + 3;
    }
    this.ni = k;
  }
  output() {
    if (this.n === 0) return null;
    return {
      pos: this.pos.slice(0, this.n * 3),
      uv: this.uv.slice(0, this.n * 2),
      data: this.data.slice(0, this.n * 4),
      light: this.light.slice(0, this.n * 4),
      index: this.n < 65536 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni),
      vertexCount: this.n,
    };
  }
}

export class Mesher {
  /** layerOf(name) -> texture array layer index */
  constructor(world, layerOf) {
    this.world = world;
    this.layerOf = layerOf;
    this.ids = new Uint8Array(P * P * P);
    this.lt = new Uint8Array(P * P * P);
    this.bufs = { opaque: new Buf(), cutout: new Buf(), translucent: new Buf() };
    // texture layer cache per (block, face) for non-meta blocks
    this.texCache = new Int32Array(256 * 6).fill(-1);
    this.passOf = BLOCKS.map((d) => d.pass);
  }

  tex(id, face, meta) {
    const d = BLOCKS[id];
    if (!d.oriented && d.name !== 'sign_letter') {
      const k = id * 6 + face;
      let v = this.texCache[k];
      if (v < 0) { v = this.layerOf(faceTexture(d, face, 0)); this.texCache[k] = v; }
      return v;
    }
    return this.layerOf(faceTexture(d, face, meta));
  }

  /** Mesh section (cx, cy, cz) in chunk coordinates. Returns {opaque, cutout, translucent} geometry data (or null each). */
  mesh(cx, cy, cz) {
    const w = this.world;
    const { SX, SY, SZ, blocks, light } = w;
    const ids = this.ids, lt = this.lt;
    const ox = cx * N, oy = cy * N, oz = cz * N;
    let any = false;
    // fill padded cache: index = (lx+1) + (lz+1)*P + (ly+1)*PP
    for (let lz = -1; lz <= N; lz++) {
      const wz = oz + lz;
      for (let lx = -1; lx <= N; lx++) {
        const wx = ox + lx;
        const inXZ = wx >= 0 && wz >= 0 && wx < SX && wz < SZ;
        const base = (wx + wz * SX) * SY;
        let ci = (lx + 1) + (lz + 1) * P;
        for (let ly = -1; ly <= N; ly++, ci += PP) {
          const wy = oy + ly;
          if (!inXZ) { ids[ci] = 0; lt[ci] = 0xf0; continue; }
          if (wy < 0) { ids[ci] = 1; lt[ci] = 0; continue; }
          if (wy >= SY) { ids[ci] = 0; lt[ci] = 0xf0; continue; }
          const id = blocks[base + wy];
          ids[ci] = id;
          lt[ci] = light[base + wy];
          if (id && lx >= 0 && ly >= 0 && lz >= 0 && lx < N && ly < N && lz < N) any = true;
        }
      }
    }
    if (!any) return { opaque: null, cutout: null, translucent: null };
    const bufs = this.bufs;
    bufs.opaque.reset(); bufs.cutout.reset(); bufs.translucent.reset();

    for (let ly = 0; ly < N; ly++) {
      for (let lz = 0; lz < N; lz++) {
        for (let lx = 0; lx < N; lx++) {
          const ci = (lx + 1) + (lz + 1) * P + (ly + 1) * PP;
          const id = ids[ci];
          if (id === 0) continue;
          const d = BLOCKS[id];
          const buf = bufs[d.pass];
          if (d.render === 'cube') this.cube(buf, d, id, ci, lx, ly, lz);
          else if (d.render === 'boxes') this.boxes(buf, d, id, ci, lx, ly, lz, ox + lx, oy + ly, oz + lz);
          else if (d.render === 'cross') this.cross(buf, d, id, ci, lx, ly, lz, ox + lx, oy + ly, oz + lz);
          else if (d.render === 'liquid') this.liquid(buf, d, id, ci, lx, ly, lz);
        }
      }
    }
    return { opaque: bufs.opaque.output(), cutout: bufs.cutout.output(), translucent: bufs.translucent.output() };
  }

  // neighbour offset in cache for normal
  static off(n) { return n[0] + n[2] * P + n[1] * PP; }

  cube(buf, d, id, ci, lx, ly, lz) {
    const ids = this.ids, lt = this.lt;
    const selfCull = d.pass !== 'opaque'; // glass/leaves: hide faces between identical blocks
    const emissive = d.light > 0 ? 4 : 0;
    const flags = (d.sway ? 1 : 0) | emissive;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const qn = ci + Mesher.OFF[f];
      const nid = ids[qn];
      if (OPAQUE[nid]) continue;
      if (selfCull && nid === id) continue;
      const layer = this.tex(id, f, 0);
      buf.ensure(4);
      const aos = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        // tangent offsets toward this corner
        let s = 0, b = 0, cnt = 0, ao;
        const t1 = Mesher.TAN[f][0], t2 = Mesher.TAN[f][1];
        const o1 = (c[t1.axis] ? 1 : -1) * t1.off;
        const o2 = (c[t2.axis] ? 1 : -1) * t2.off;
        const a = qn, s1 = qn + o1, s2 = qn + o2, cc = qn + o1 + o2;
        const op1 = OPAQUE[ids[s1]], op2 = OPAQUE[ids[s2]], opc = OPAQUE[ids[cc]];
        // light average over non-opaque cells
        const la = lt[a]; s += la >> 4; b += la & 15; cnt++;
        if (!op1) { const l = lt[s1]; s += l >> 4; b += l & 15; cnt++; }
        if (!op2) { const l = lt[s2]; s += l >> 4; b += l & 15; cnt++; }
        if (!opc && !(op1 && op2)) { const l = lt[cc]; s += l >> 4; b += l & 15; cnt++; }
        if (op1 && op2) ao = 0; else ao = 3 - (op1 + op2 + opc);
        aos[k] = ao;
        const uvp = faceUV(f, c[0], c[1], c[2]);
        buf.vert((lx + c[0]) * S, (ly + c[1]) * S, (lz + c[2]) * S, uvp[0] * S, uvp[1] * S, f, flags, layer,
          Math.round((s / cnt) * 17), Math.round((b / cnt) * 17), AO_CURVE[ao]);
      }
      buf.quad(aos[0] + aos[2] < aos[1] + aos[3]);
    }
  }

  boxes(buf, d, id, ci, lx, ly, lz, wx, wy, wz) {
    const ids = this.ids, lt = this.lt;
    const meta = this.world.getMeta(wx, wy, wz);
    const boxes = getBoxes(id, meta);
    if (!boxes) return;
    const own = lt[ci];
    const emissive = d.light > 0 ? 4 : 0;
    const oriented = d.oriented;
    const isDoor = !!d.door;
    for (const bx of boxes) {
      const [x0, y0, z0, x1, y1, z1] = bx;
      for (let f = 0; f < 6; f++) {
        // is this face on the block boundary?
        let boundary;
        switch (f) {
          case 0: boundary = x1 >= 1; break;
          case 1: boundary = x0 <= 0; break;
          case 2: boundary = y1 >= 1; break;
          case 3: boundary = y0 <= 0; break;
          case 4: boundary = z1 >= 1; break;
          default: boundary = z0 <= 0; break;
        }
        const qn = ci + Mesher.OFF[f];
        if (boundary && OPAQUE[ids[qn]]) continue;
        const l = boundary ? (OPAQUE[ids[qn]] ? own : lt[qn]) : own;
        const sky = Math.max(l >> 4, own >> 4), blk = Math.max(l & 15, own & 15);
        let layer;
        if (isDoor) {
          // broad faces get the door texture, thin edges the side texture
          const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
          const dims = f < 2 ? [ez, ey] : f < 4 ? [ex, ez] : [ex, ey];
          const broad = dims[0] > 0.5 && dims[1] > 0.5 && f !== 2 && f !== 3;
          const t = d.tex;
          const name = broad ? (meta & 8 ? t.topTex : t.front) : t.side;
          layer = this.layerOf(name);
        } else layer = this.tex(id, f, meta);
        // ambient-ish shading for partial blocks: darker bottoms
        const ao = f === 3 ? 170 : 235;
        buf.ensure(4);
        const F = FACES[f];
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          const px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
          let uvp;
          if ((f === 2 || f === 3) && oriented) uvp = rotTopUV(meta, px, pz);
          else uvp = faceUV(f, px, py, pz);
          buf.vert(Math.round((lx + px) * S), Math.round((ly + py) * S), Math.round((lz + pz) * S),
            Math.round(uvp[0] * S), Math.round(uvp[1] * S), f, emissive, layer, sky * 17, blk * 17, ao);
        }
        buf.quad(false);
      }
    }
  }

  cross(buf, d, id, ci, lx, ly, lz, wx, wy, wz) {
    const l = this.lt[ci];
    const sky = (l >> 4) * 17, blk = (l & 15) * 17;
    const layer = this.tex(id, 0, 0);
    const h = hash32(wx, wy, wz);
    // random horizontal jitter like Minecraft grass
    const jx = d.sway ? ((h & 15) - 7.5) / 64 : 0;
    const jz = d.sway ? (((h >> 4) & 15) - 7.5) / 64 : 0;
    const a = 0.146, b = 0.854;
    const flagsBase = (d.sway ? 1 : 0) | (d.light > 0 ? 4 : 0);
    const quads = [
      [[a, b], [b, a]],
      [[a, a], [b, b]],
    ];
    for (const [[x0, z0], [x1, z1]] of quads) {
      for (let side = 0; side < 2; side++) {
        buf.ensure(4);
        const pts = side === 0
          ? [[x0, 0, z0, 0, 1], [x1, 0, z1, 1, 1], [x1, 1, z1, 1, 0], [x0, 1, z0, 0, 0]]
          : [[x1, 0, z1, 0, 1], [x0, 0, z0, 1, 1], [x0, 1, z0, 1, 0], [x1, 1, z1, 0, 0]];
        for (const p of pts) {
          const top = p[1] > 0 ? 2 : 0;
          buf.vert(Math.round((lx + p[0] + jx) * S), Math.round((ly + p[1]) * S), Math.round((lz + p[2] + jz) * S),
            p[3] * S, p[4] * S, 6, flagsBase | top, layer, sky, blk, 255);
        }
        buf.quad(false);
      }
    }
  }

  liquid(buf, d, id, ci, lx, ly, lz) {
    const ids = this.ids, lt = this.lt;
    const above = ids[ci + PP];
    const topH = above === id ? 1 : 0.875;
    const layer = this.tex(id, 2, 0);
    for (let f = 0; f < 6; f++) {
      const qn = ci + Mesher.OFF[f];
      const nid = ids[qn];
      if (nid === id) continue;
      if (OPAQUE[nid] && f !== 2) continue;
      if (f === 2 && above === id) continue;
      const l = OPAQUE[nid] ? lt[ci] : lt[qn];
      buf.ensure(4);
      const F = FACES[f];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        const py = c[1] ? topH : 0;
        const uvp = faceUV(f, c[0], py, c[2]);
        buf.vert((lx + c[0]) * S, Math.round((ly + py) * S), (lz + c[2]) * S, Math.round(uvp[0] * S), Math.round(uvp[1] * S),
          f, 8, layer, (l >> 4) * 17, (l & 15) * 17, 255);
      }
      buf.quad(false);
      if (f === 2) {
        // the surface seen from below (swimming / diving): same quad, reversed winding, flag 16
        buf.ensure(4);
        for (let k = 3; k >= 0; k--) {
          const c = F.c[k];
          const uvp = faceUV(2, c[0], topH, c[2]);
          buf.vert((lx + c[0]) * S, Math.round((ly + topH) * S), (lz + c[2]) * S, Math.round(uvp[0] * S), Math.round(uvp[1] * S),
            3, 8 | 16, layer, (l >> 4) * 17, (l & 15) * 17, 255);
        }
        buf.quad(false);
      }
    }
  }
}

Mesher.OFF = FACES.map((F) => Mesher.off(F.n));
// tangent axes for each face: which two axes (other than normal) and their cache offsets
Mesher.TAN = FACES.map((F) => {
  const axes = [0, 1, 2].filter((a) => F.n[a] === 0);
  const offOf = (a) => (a === 0 ? 1 : a === 1 ? PP : P);
  return axes.map((a) => ({ axis: a, off: offOf(a) }));
});
