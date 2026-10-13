import { CHUNK_SIZE, WORLD_HEIGHT } from '../../shared/constants';
import { allTileNames, BLOCKS, LIGHT_EMIT, OPAQUE } from '../../shared/world/blocks';

/**
 * Chunk mesher (runs in a Web Worker; pure so it is also benchmarked in Node).
 *
 *  1. Copy the chunk plus an 8-block margin from its neighbours.
 *  2. Flood-fill sky light (0-15, straight down then spreading) and block
 *     light (emissive blocks) — Minecraft-style.
 *  3. Emit faces with per-vertex ambient occlusion + smooth light, merging
 *     coplanar faces with identical tile/AO/light (greedy meshing).
 *
 * Vertex layout (16 bytes): pos u16x4 (x,y,z in 1/16 block, face id),
 * uv u16x2 (1/16 block), info u8x4 (tile layer, ao 0-3, sky 0-15, block 0-15).
 */

export const P = 8;
const W = CHUNK_SIZE + 2 * P;
const H = WORLD_HEIGHT;
const UNKNOWN = 255;
const S = 16; // sub-block units

const li = (x: number, y: number, z: number) => (y * W + z) * W + x;

// Per-block tables (built once per worker).
const tileNames = allTileNames();
const tileIdx = new Map(tileNames.map((n, i) => [n, i]));
const TILE_TOP = new Uint8Array(256), TILE_SIDE = new Uint8Array(256), TILE_BOTTOM = new Uint8Array(256);
const SHAPE = new Uint8Array(256); // 0 none, 1 cube, 2 cross, 3 liquid, 4 flat, 5 door_open
const TRANS = new Uint8Array(256); // translucent pass
const CUTOUT = new Uint8Array(256);
const ATTEN = new Uint8Array(256); // extra light attenuation (leaves, water)
for (const d of BLOCKS) {
  if (!d) continue;
  TILE_TOP[d.id] = tileIdx.get(d.tex.top) ?? 0;
  TILE_SIDE[d.id] = tileIdx.get(d.tex.side) ?? 0;
  TILE_BOTTOM[d.id] = tileIdx.get(d.tex.bottom) ?? 0;
  SHAPE[d.id] = { none: 0, cube: 1, cross: 2, liquid: 3, flat: 4, door_open: 5 }[d.shape];
  TRANS[d.id] = d.translucent || d.liquid ? 1 : 0;
  CUTOUT[d.id] = d.cutout ? 1 : 0;
  ATTEN[d.id] = d.tree === 'leaves' || d.liquid ? 1 : 0;
}
const isOccluder = (id: number) => id === UNKNOWN || OPAQUE[id] === 1;

class Buf {
  pos: Uint16Array;
  uv: Uint16Array;
  info: Uint8Array;
  idx: Uint32Array;
  nv = 0;
  ni = 0;
  constructor(cap = 4096) {
    this.pos = new Uint16Array(cap * 4);
    this.uv = new Uint16Array(cap * 2);
    this.info = new Uint8Array(cap * 4);
    this.idx = new Uint32Array(cap * 1.5);
  }
  private grow() {
    const cap = (this.pos.length / 4) * 2;
    const p = new Uint16Array(cap * 4); p.set(this.pos); this.pos = p;
    const u = new Uint16Array(cap * 2); u.set(this.uv); this.uv = u;
    const f = new Uint8Array(cap * 4); f.set(this.info); this.info = f;
    const i = new Uint32Array(cap * 1.5); i.set(this.idx); this.idx = i;
  }
  vert(x: number, y: number, z: number, face: number, u: number, v: number, tile: number, ao: number, sky: number, blk: number) {
    if (this.nv * 4 >= this.pos.length) this.grow();
    const n = this.nv;
    this.pos[n * 4] = x; this.pos[n * 4 + 1] = y; this.pos[n * 4 + 2] = z; this.pos[n * 4 + 3] = face;
    this.uv[n * 2] = u; this.uv[n * 2 + 1] = v;
    this.info[n * 4] = tile; this.info[n * 4 + 1] = ao; this.info[n * 4 + 2] = sky; this.info[n * 4 + 3] = blk;
    this.nv++;
    return n;
  }
  quad(a: number, b: number, c: number, d: number, flipDiag: boolean) {
    if (this.ni + 6 > this.idx.length) this.grow();
    const I = this.idx;
    if (flipDiag) {
      I[this.ni++] = b; I[this.ni++] = c; I[this.ni++] = d;
      I[this.ni++] = b; I[this.ni++] = d; I[this.ni++] = a;
    } else {
      I[this.ni++] = a; I[this.ni++] = b; I[this.ni++] = c;
      I[this.ni++] = a; I[this.ni++] = c; I[this.ni++] = d;
    }
  }
  result(): MeshArrays {
    return { pos: this.pos.slice(0, this.nv * 4), uv: this.uv.slice(0, this.nv * 2), info: this.info.slice(0, this.nv * 4), idx: this.idx.slice(0, this.ni) };
  }
}

export interface MeshArrays {
  pos: Uint16Array;
  uv: Uint16Array;
  info: Uint8Array;
  idx: Uint32Array;
}

export interface MeshResult {
  cx: number;
  cz: number;
  opaque: MeshArrays;
  trans: MeshArrays;
  /** Milliseconds spent (lighting, meshing). */
  ms: [number, number];
}

/**
 * @param chunks 3x3 neighbourhood, index (dz+1)*3+(dx+1); centre must exist.
 */
export function meshChunk(cx: number, cz: number, chunks: Array<Uint8Array | null>, ao = true): MeshResult {
  const t0 = performance.now();
  // ---- 1. padded copy
  const blk = new Uint8Array(W * W * H);
  let maxY = 0;
  for (let pz = 0; pz < W; pz++) {
    const wz = pz - P;
    const dz = wz < 0 ? -1 : wz >= CHUNK_SIZE ? 1 : 0;
    const lz = wz - dz * CHUNK_SIZE;
    for (let px = 0; px < W; px++) {
      const wx = px - P;
      const dx = wx < 0 ? -1 : wx >= CHUNK_SIZE ? 1 : 0;
      const lx = wx - dx * CHUNK_SIZE;
      const src = chunks[(dz + 1) * 3 + (dx + 1)];
      if (!src) {
        for (let y = 0; y < H; y++) blk[li(px, y, pz)] = UNKNOWN;
        continue;
      }
      const base = lx | (lz << 4);
      for (let y = 0; y < H; y++) {
        const id = src[base | (y << 8)];
        blk[li(px, y, pz)] = id;
        if (id && y > maxY) maxY = y;
      }
    }
  }
  const top = Math.min(H - 1, maxY + 2);

  // ---- 2. light
  const sky = new Uint8Array(W * W * H);
  const bl = new Uint8Array(W * W * H);
  const queue = new Int32Array(W * W * H);
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let l = 15;
    for (let y = H - 1; y >= 0; y--) {
      const i = li(x, y, z);
      const id = blk[i];
      if (id === UNKNOWN) { sky[i] = 15; continue; }
      if (OPAQUE[id]) { l = 0; break; }
      if (ATTEN[id] && l > 0) l--;
      sky[i] = l;
      if (l === 0) break;
    }
  }
  const spread = (light: Uint8Array, qlen: number) => {
    let head = 0;
    while (head < qlen) {
      const i = queue[head++];
      const l = light[i];
      if (l <= 1) continue;
      const x = i % W, z = Math.floor(i / W) % W, y = Math.floor(i / (W * W));
      const nl = l - 1;
      // 6 neighbours
      if (x > 0) { const n = i - 1; if (light[n] < nl && !isOccluder(blk[n])) { light[n] = nl - ATTEN[blk[n]]; queue[qlen++] = n; } }
      if (x < W - 1) { const n = i + 1; if (light[n] < nl && !isOccluder(blk[n])) { light[n] = nl - ATTEN[blk[n]]; queue[qlen++] = n; } }
      if (z > 0) { const n = i - W; if (light[n] < nl && !isOccluder(blk[n])) { light[n] = nl - ATTEN[blk[n]]; queue[qlen++] = n; } }
      if (z < W - 1) { const n = i + W; if (light[n] < nl && !isOccluder(blk[n])) { light[n] = nl - ATTEN[blk[n]]; queue[qlen++] = n; } }
      if (y > 0) { const n = i - W * W; if (light[n] < nl && !isOccluder(blk[n])) { light[n] = nl - ATTEN[blk[n]]; queue[qlen++] = n; } }
      if (y < H - 1) { const n = i + W * W; if (light[n] < nl && !isOccluder(blk[n])) { light[n] = nl - ATTEN[blk[n]]; queue[qlen++] = n; } }
    }
  };
  // seed sky BFS from lit cells bordering darker non-opaque cells
  let q = 0;
  for (let y = 0; y <= top; y++) for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = li(x, y, z);
    const l = sky[i];
    if (l < 2) continue;
    if ((x > 0 && sky[i - 1] < l - 1 && !isOccluder(blk[i - 1])) || (x < W - 1 && sky[i + 1] < l - 1 && !isOccluder(blk[i + 1])) ||
      (z > 0 && sky[i - W] < l - 1 && !isOccluder(blk[i - W])) || (z < W - 1 && sky[i + W] < l - 1 && !isOccluder(blk[i + W])) ||
      (y > 0 && sky[i - W * W] < l - 1 && !isOccluder(blk[i - W * W]))) queue[q++] = i;
  }
  spread(sky, q);
  q = 0;
  for (let y = 0; y <= top; y++) for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = li(x, y, z);
    const e = LIGHT_EMIT[blk[i]];
    if (e) { bl[i] = e; queue[q++] = i; }
  }
  spread(bl, q);
  const t1 = performance.now();

  // ---- 3. faces
  const opq = new Buf(8192);
  const trs = new Buf(1024);
  const dims = [CHUNK_SIZE, H, CHUNK_SIZE];
  const at = (x: number, y: number, z: number) => (y < 0 ? 1 : y >= H ? 0 : blk[li(x + P, y, z + P)]);
  const skyAt = (x: number, y: number, z: number) => (y >= H ? 15 : y < 0 ? 0 : sky[li(x + P, y, z + P)]);
  const blAt = (x: number, y: number, z: number) => (y < 0 || y >= H ? 0 : bl[li(x + P, y, z + P)]);
  const occ = (x: number, y: number, z: number) => (y < 0 ? 1 : y >= H ? 0 : isOccluder(blk[li(x + P, y, z + P)]) ? 1 : 0);

  const mask = new Float64Array(CHUNK_SIZE * H);
  const c = [0, 0, 0];
  const nrm = [0, 0, 0];
  const uax = [0, 0, 0], vax = [0, 0, 0];
  const vAo = [0, 0, 0, 0], vSky = [0, 0, 0, 0], vBl = [0, 0, 0, 0];
  const CU = [-1, 1, 1, -1], CV = [-1, -1, 1, 1];

  for (let face = 0; face < 6; face++) {
    const axis = face >> 1; // 0 x, 1 y, 2 z
    const positive = (face & 1) === 0;
    const ua = axis === 0 ? 2 : 0; // u axis
    const va = axis === 1 ? 2 : 1; // v axis
    nrm[0] = nrm[1] = nrm[2] = 0; nrm[axis] = positive ? 1 : -1;
    uax[0] = uax[1] = uax[2] = 0; uax[ua] = 1;
    vax[0] = vax[1] = vax[2] = 0; vax[va] = 1;
    const U = dims[ua], V = dims[va];
    const tileTab = axis === 1 ? (positive ? TILE_TOP : TILE_BOTTOM) : TILE_SIDE;
    const flipWinding = axis === 2 ? !positive : positive;
    for (let w = 0; w < dims[axis]; w++) {
      if (axis === 1 && w > top) break;
      let any = false;
      for (let v = 0; v < V; v++) {
        if (axis !== 1 && v > top) { for (let u = 0; u < U; u++) mask[v * U + u] = 0; continue; }
        for (let u = 0; u < U; u++) {
          c[axis] = w; c[ua] = u; c[va] = v;
          const id = at(c[0], c[1], c[2]);
          let key = 0;
          if (SHAPE[id] === 1 && !TRANS[id]) {
            const nid = at(c[0] + nrm[0], c[1] + nrm[1], c[2] + nrm[2]);
            const visible = !isOccluder(nid) && !(CUTOUT[id] && nid === id);
            if (visible) {
              const fx = c[0] + nrm[0], fy = c[1] + nrm[1], fz = c[2] + nrm[2];
              let aoKey = 0, skyKey = 0, blKey = 0;
              const centreSky = skyAt(fx, fy, fz), centreBl = blAt(fx, fy, fz);
              for (let k = 0; k < 4; k++) {
                const du = CU[k], dv = CV[k];
                const s1x = fx + uax[0] * du, s1y = fy + uax[1] * du, s1z = fz + uax[2] * du;
                const s2x = fx + vax[0] * dv, s2y = fy + vax[1] * dv, s2z = fz + vax[2] * dv;
                const cox = s1x + vax[0] * dv, coy = s1y + vax[1] * dv, coz = s1z + vax[2] * dv;
                const o1 = occ(s1x, s1y, s1z), o2 = occ(s2x, s2y, s2z), o3 = occ(cox, coy, coz);
                const a = !ao ? 3 : o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
                let ss = centreSky, sb = centreBl, n = 1;
                if (!o1) { ss += skyAt(s1x, s1y, s1z); sb += blAt(s1x, s1y, s1z); n++; }
                if (!o2) { ss += skyAt(s2x, s2y, s2z); sb += blAt(s2x, s2y, s2z); n++; }
                if (!o3 && !(o1 && o2)) { ss += skyAt(cox, coy, coz); sb += blAt(cox, coy, coz); n++; }
                const sv = Math.round(ss / n), bv = Math.round(sb / n);
                aoKey |= a << (k * 2);
                skyKey |= sv << (k * 4);
                blKey |= bv << (k * 4);
              }
              key = 1 + tileTab[id] + 256 * (aoKey + 256 * skyKey) + 4294967296 * blKey;
            }
          }
          mask[v * U + u] = key;
          if (key) any = true;
        }
      }
      if (!any) continue;
      // greedy merge
      for (let v = 0; v < V; v++) {
        for (let u = 0; u < U; ) {
          const key = mask[v * U + u];
          if (!key) { u++; continue; }
          let wdt = 1;
          while (u + wdt < U && mask[v * U + u + wdt] === key) wdt++;
          let hgt = 1;
          outer: while (v + hgt < V) {
            for (let k = 0; k < wdt; k++) if (mask[(v + hgt) * U + u + k] !== key) break outer;
            hgt++;
          }
          for (let dv = 0; dv < hgt; dv++) for (let k = 0; k < wdt; k++) mask[(v + dv) * U + u + k] = 0;
          // decode
          let rest = key - 1;
          const tile = rest % 256; rest = Math.floor(rest / 256);
          const aoKey = rest % 256; rest = Math.floor(rest / 256);
          const skyKey = rest % 65536; rest = Math.floor(rest / 65536);
          const blKey = rest;
          for (let k = 0; k < 4; k++) {
            vAo[k] = (aoKey >> (k * 2)) & 3;
            vSky[k] = (skyKey >> (k * 4)) & 15;
            vBl[k] = (blKey >> (k * 4)) & 15;
          }
          // corners: k=0 (u0,v0) 1 (u1,v0) 2 (u1,v1) 3 (u0,v1)
          const wpos = w + (positive ? 1 : 0);
          const ids = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) {
            const pu = u + (k === 1 || k === 2 ? wdt : 0);
            const pv = v + (k >= 2 ? hgt : 0);
            c[axis] = wpos; c[ua] = pu; c[va] = pv;
            const tu = (k === 1 || k === 2 ? wdt : 0) * S;
            const tv = axis === 1 ? (k >= 2 ? hgt : 0) * S : (k >= 2 ? 0 : hgt) * S;
            ids[k] = opq.vert(c[0] * S, c[1] * S, c[2] * S, face, tu, tv, tile, vAo[k], vSky[k], vBl[k]);
          }
          const flipDiag = vAo[0] + vAo[2] < vAo[1] + vAo[3];
          if (flipWinding) opq.quad(ids[3], ids[2], ids[1], ids[0], !flipDiag);
          else opq.quad(ids[0], ids[1], ids[2], ids[3], flipDiag);
          u += wdt;
        }
      }
    }
  }

  // ---- 4. non-greedy shapes: plants, liquids, translucent cubes, flats, open doors
  for (let y = 0; y <= top; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
    const id = at(x, y, z);
    const shape = SHAPE[id];
    if (shape === 0 || (shape === 1 && !TRANS[id])) continue;
    const sk = skyAt(x, y, z), bk = blAt(x, y, z);
    if (shape === 2) {
      const t = TILE_SIDE[id];
      const quadsD = [[0, 0, S, S], [S, 0, 0, S]];
      for (const [x0, z0, x1, z1] of quadsD) {
        const a = opq.vert(x * S + x0, y * S, z * S + z0, 6, 0, S, t, 3, sk, bk);
        const b = opq.vert(x * S + x1, y * S, z * S + z1, 6, S, S, t, 3, sk, bk);
        const cc = opq.vert(x * S + x1, y * S + S, z * S + z1, 6, S, 0, t, 3, sk, bk);
        const d = opq.vert(x * S + x0, y * S + S, z * S + z0, 6, 0, 0, t, 3, sk, bk);
        opq.quad(a, b, cc, d, false);
        opq.quad(d, cc, b, a, false);
      }
      continue;
    }
    if (shape === 4 || shape === 5) {
      // flat slab (sleeping bag) or open-door panel
      let x0 = 0, x1 = S, y0 = 0, y1 = S, z0 = 0, z1 = S;
      if (shape === 4) y1 = 3;
      else {
        const alongX = isOccluder(at(x - 1, y, z)) || isOccluder(at(x + 1, y, z)) || at(x - 1, y, z) >= 40 || at(x + 1, y, z) >= 40;
        if (alongX) { x1 = 2; } else { z1 = 2; }
      }
      emitBox(opq, x, y, z, x0, y0, z0, x1, y1, z1, TILE_TOP[id], TILE_SIDE[id], sk, bk);
      continue;
    }
    // translucent cube or liquid
    const liquid = shape === 3;
    const above = at(x, y + 1, z);
    const h = liquid && above !== id ? 14 : S;
    for (let face = 0; face < 6; face++) {
      const axis = face >> 1, positive = (face & 1) === 0;
      const n = [0, 0, 0];
      n[axis] = positive ? 1 : -1;
      const nid = at(x + n[0], y + n[1], z + n[2]);
      if (nid === id || isOccluder(nid)) {
        if (!(liquid && face === 2 && h < S && nid !== id)) continue;
      }
      if (liquid && face === 2 && nid !== id && !isOccluder(nid)) {
        // surface: double-sided so it is visible from under water
        const t = TILE_TOP[id];
        const ls = skyAt(x, y + 1, z), lb = blAt(x, y + 1, z);
        const a = trs.vert(x * S, y * S + h, z * S, 2, 0, 0, t, 3, ls, lb);
        const b = trs.vert(x * S + S, y * S + h, z * S, 2, S, 0, t, 3, ls, lb);
        const cc = trs.vert(x * S + S, y * S + h, z * S + S, 2, S, S, t, 3, ls, lb);
        const d = trs.vert(x * S, y * S + h, z * S + S, 2, 0, S, t, 3, ls, lb);
        trs.quad(d, cc, b, a, false);
        trs.quad(a, b, cc, d, false);
        continue;
      }
      if (isOccluder(nid) || nid === id) continue;
      emitFace(trs, x, y, z, face, h, axis === 1 ? (positive ? TILE_TOP[id] : TILE_BOTTOM[id]) : TILE_SIDE[id], skyAt(x + n[0], y + n[1], z + n[2]), blAt(x + n[0], y + n[1], z + n[2]));
    }
  }
  const t2 = performance.now();
  return { cx, cz, opaque: opq.result(), trans: trs.result(), ms: [t1 - t0, t2 - t1] };
}

/** One axis-aligned face of a unit cube (height h in 1/16). */
function emitFace(buf: Buf, x: number, y: number, z: number, face: number, h: number, tile: number, sky: number, bl: number) {
  const X = x * S, Y = y * S, Z = z * S;
  let pts: number[][];
  switch (face) {
    case 0: pts = [[X + S, Y, Z + S], [X + S, Y, Z], [X + S, Y + h, Z], [X + S, Y + h, Z + S]]; break;
    case 1: pts = [[X, Y, Z], [X, Y, Z + S], [X, Y + h, Z + S], [X, Y + h, Z]]; break;
    case 2: pts = [[X, Y + h, Z + S], [X + S, Y + h, Z + S], [X + S, Y + h, Z], [X, Y + h, Z]]; break;
    case 3: pts = [[X, Y, Z], [X + S, Y, Z], [X + S, Y, Z + S], [X, Y, Z + S]]; break;
    case 4: pts = [[X, Y, Z + S], [X + S, Y, Z + S], [X + S, Y + h, Z + S], [X, Y + h, Z + S]]; break;
    default: pts = [[X + S, Y, Z], [X, Y, Z], [X, Y + h, Z], [X + S, Y + h, Z]]; break;
  }
  const uvs = [[0, h], [S, h], [S, 0], [0, 0]];
  const ids = pts.map((p, k) => buf.vert(p[0], p[1], p[2], face, uvs[k][0], uvs[k][1], tile, 3, sky, bl));
  buf.quad(ids[0], ids[1], ids[2], ids[3], false);
}

/** Small box inside a cell (all units 1/16). */
function emitBox(buf: Buf, x: number, y: number, z: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tTop: number, tSide: number, sky: number, bl: number) {
  const X = x * S, Y = y * S, Z = z * S;
  const faces: Array<[number, number[][]]> = [
    [0, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [1, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [2, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [3, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [4, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [5, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [face, pts] of faces) {
    const tile = face === 2 ? tTop : tSide;
    const ids = pts.map((p, k) => buf.vert(X + p[0], Y + p[1], Z + p[2], face, k === 1 || k === 2 ? S : 0, k >= 2 ? 0 : S, tile, 3, sky, bl));
    buf.quad(ids[0], ids[1], ids[2], ids[3], false);
  }
}
