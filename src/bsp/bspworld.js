// Builds a playable world from an original GoldSrc BSP (user-supplied files):
// render meshes with the map's own textures and hlrad lightmaps, hull-based
// collision, light sampling for models and entity data for the game.

import * as THREE from 'three';
import { parseBsp, parseWad, BspHulls, CONTENTS_SOLID } from './bsp30.js';
import { buildWorldMaterial } from './bspmaterial.js';
import { TraceResult, CollisionWorld, MASK_SHOT } from '../engine/collision.js';

const SKIP = new Set(['sky', 'aaatrigger', 'clip', 'null', 'origin', 'skip', 'hint', 'bevel']);
const VISIBLE_ENTS = new Set(['func_wall', 'func_illusionary', 'func_breakable', 'func_door', 'func_door_rotating', 'func_pushable', 'func_wall_toggle', 'func_button']);
const SOLID_ENTS = new Set(['func_wall', 'func_breakable', 'func_door', 'func_door_rotating', 'func_pushable', 'func_wall_toggle']);

export async function loadBspWorld({ bsp: bspBuf, wads = [] }, onProgress = () => {}) {
  onProgress('Parsing BSP', 0.1);
  const bsp = parseBsp(bspBuf);
  const wadTex = new Map();
  for (const w of wads) {
    try { for (const [k, v] of parseWad(w)) if (!wadTex.has(k)) wadTex.set(k, v); } catch (e) { console.warn('bad wad', e); }
  }
  onProgress('Building textures', 0.3);
  const texCache = new Map();
  const getTex = (mt) => {
    const key = mt.name.toLowerCase();
    if (texCache.has(key)) return texCache.get(key);
    let src = mt.data ? mt : wadTex.get(key);
    let tex;
    if (src && src.data) {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').putImageData(new ImageData(src.data, src.width, src.height), 0, 0);
      tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapNearestFilter;
      tex.colorSpace = THREE.NoColorSpace;
      tex.flipY = false;
    } else {
      // missing texture: GoldSrc-style checker
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d');
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#000' : '#f0f'; g.fillRect(x * 8, y * 8, 8, 8); }
      tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
    }
    tex.userData.transparent = key[0] === '{';
    texCache.set(key, tex);
    return tex;
  };

  // ---- faces of the world and visible brush entities
  const models = [{ model: bsp.models[0], offset: [0, 0, 0], solid: true }];
  for (const e of bsp.entities) {
    if (!e.model || e.model[0] !== '*' || !VISIBLE_ENTS.has(e.classname)) continue;
    if (e.rendermode && +e.rendermode !== 0 && +e.renderamt === 0) continue;
    models.push({ model: bsp.models[+e.model.slice(1)], offset: (e.origin || '0 0 0').split(' ').map(Number), solid: SOLID_ENTS.has(e.classname), ent: e });
  }
  const faces = [];
  for (const md of models) {
    const m = md.model;
    for (let i = 0; i < m.numfaces; i++) {
      const f = bsp.faces[m.firstface + i];
      const ti = bsp.texinfo[f.texinfo];
      const mt = bsp.textures[ti.miptex];
      if (!mt || SKIP.has(mt.name.toLowerCase())) continue;
      const verts = [];
      for (let k = 0; k < f.numedges; k++) {
        const se = bsp.surfedges[f.firstedge + k];
        const vi = se >= 0 ? bsp.edges[se * 2] : bsp.edges[-se * 2 + 1];
        verts.push([bsp.vertices[vi * 3] + md.offset[0], bsp.vertices[vi * 3 + 1] + md.offset[1], bsp.vertices[vi * 3 + 2] + md.offset[2]]);
      }
      const pl = bsp.planes[f.plane];
      const n = f.side ? [-pl.n[0], -pl.n[1], -pl.n[2]] : pl.n.slice();
      // lightmap extents
      let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
      for (const v of verts) {
        const s = v[0] * ti.s[0] + v[1] * ti.s[1] + v[2] * ti.s[2] + ti.s[3];
        const t = v[0] * ti.t[0] + v[1] * ti.t[1] + v[2] * ti.t[2] + ti.t[3];
        if (s < smin) smin = s; if (s > smax) smax = s;
        if (t < tmin) tmin = t; if (t > tmax) tmax = t;
      }
      const s0 = Math.floor(smin / 16), s1 = Math.ceil(smax / 16), t0 = Math.floor(tmin / 16), t1 = Math.ceil(tmax / 16);
      faces.push({ verts, n, ti, mt, lightofs: f.lightofs, styles: f.styles, lm: { s0, t0, w: s1 - s0 + 1, h: t1 - t0 + 1, x: 0, y: 0 }, offset: md.offset });
    }
  }
  onProgress('Packing lightmaps', 0.5);
  // ---- pack lightmaps (shelf)
  const PAD = 1;
  let area = 0;
  for (const f of faces) area += (f.lm.w + 2 * PAD) * (f.lm.h + 2 * PAD);
  let W = 256;
  while (W * W < area * 1.3) W *= 2;
  const order = faces.slice().sort((a, b) => b.lm.h - a.lm.h);
  let x = 0, y = 0, sh = 0;
  for (const f of order) {
    const rw = f.lm.w + 2 * PAD, rh = f.lm.h + 2 * PAD;
    if (x + rw > W) { x = 0; y += sh; sh = 0; }
    f.lm.x = x + PAD; f.lm.y = y + PAD;
    x += rw; if (rh > sh) sh = rh;
  }
  let H = 1;
  while (H < y + sh) H *= 2;
  const rgba = new Uint8Array(W * H * 4);
  for (const f of faces) {
    const lm = f.lm;
    const has = f.lightofs >= 0 && f.styles[0] !== 255;
    for (let j = -1; j <= lm.h; j++) for (let i = -1; i <= lm.w; i++) {
      const ci = Math.max(0, Math.min(lm.w - 1, i)), cj = Math.max(0, Math.min(lm.h - 1, j));
      const o = ((lm.y + j) * W + (lm.x + i)) * 4;
      if (has) {
        const so = f.lightofs + (cj * lm.w + ci) * 3;
        rgba[o] = bsp.lighting[so]; rgba[o + 1] = bsp.lighting[so + 1]; rgba[o + 2] = bsp.lighting[so + 2];
      } else { rgba[o] = rgba[o + 1] = rgba[o + 2] = 255; }
      rgba[o + 3] = 255;
    }
  }
  const lmTex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  lmTex.magFilter = lmTex.minFilter = THREE.LinearFilter;
  lmTex.generateMipmaps = false;
  lmTex.needsUpdate = true;

  onProgress('Building meshes', 0.7);
  // ---- meshes grouped by texture
  const groups = new Map();
  for (const f of faces) {
    const k = f.mt.name.toLowerCase();
    let gl = groups.get(k);
    if (!gl) groups.set(k, gl = []);
    gl.push(f);
  }
  const meshes = [];
  for (const [name, list] of groups) {
    let nTri = 0;
    for (const f of list) nTri += f.verts.length - 2;
    const pos = new Float32Array(nTri * 9), uv = new Float32Array(nTri * 6), uv1 = new Float32Array(nTri * 6);
    let p = 0;
    const tex = getTex(list[0].mt);
    const tw = list[0].mt.width || 64, th = list[0].mt.height || 64;
    for (const f of list) {
      const ti = f.ti, lm = f.lm;
      const put = (v) => {
        pos[p * 3] = v[0]; pos[p * 3 + 1] = v[1]; pos[p * 3 + 2] = v[2];
        const s = v[0] * ti.s[0] + v[1] * ti.s[1] + v[2] * ti.s[2] + ti.s[3];
        const t = v[0] * ti.t[0] + v[1] * ti.t[1] + v[2] * ti.t[2] + ti.t[3];
        uv[p * 2] = s / tw; uv[p * 2 + 1] = t / th;
        uv1[p * 2] = (lm.x + s / 16 - lm.s0 + 0.5) / W;
        uv1[p * 2 + 1] = (lm.y + t / 16 - lm.t0 + 0.5) / H;
        p++;
      };
      // GoldSrc winding is clockwise seen from the front; emit CCW for three.js
      for (let k = 1; k + 1 < f.verts.length; k++) { put(f.verts[0]); put(f.verts[k + 1]); put(f.verts[k]); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, buildWorldMaterial(tex, lmTex, tex.userData.transparent));
    mesh.name = 'bsp:' + name;
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }

  onProgress('Collision', 0.85);
  const collision = new BspCollision(bsp, models.filter((m) => m.solid));
  const sampler = new BspLightSampler(bsp, faces, W, H, rgba);

  // ---- entities in the format the game expects
  const ents = [];
  const vec = (s) => (s || '0 0 0').split(/\s+/).map(Number);
  for (const e of bsp.entities) {
    if (e.classname === 'info_player_start' || e.classname === 'info_player_deathmatch') {
      const a = vec(e.angles);
      ents.push({ classname: e.classname, origin: vec(e.origin), angle: e.angle != null ? +e.angle : a[1] });
    } else if (e.classname === 'func_bomb_target' || e.classname === 'func_buyzone') {
      const m = bsp.models[+e.model.slice(1)];
      const out = { classname: e.classname, mins: m.mins.slice(), maxs: m.maxs.slice() };
      if (e.classname === 'func_bomb_target') out.name = (m.mins[0] + m.maxs[0]) / 2 > 0 ? 'A' : 'B';
      else out.team = e.team === '1' ? 'T' : 'CT';
      ents.push(out);
    }
  }
  const le = bsp.entities.find((e) => e.classname === 'light_environment');
  let sunDir = [-0.366, -0.341, 0.866];
  if (le) {
    const yaw = (+le.angle || 0) * Math.PI / 180, pitch = (+le.pitch || -60) * Math.PI / 180;
    sunDir = [-Math.cos(pitch) * Math.cos(yaw), -Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch)];
  }
  const wm = bsp.models[0];
  const map = { entities: ents, bounds: [wm.mins[0], wm.mins[1], wm.maxs[0], wm.maxs[1]], lights: [], source: 'bsp', skyname: bsp.entities[0]?.skyname };
  return { map, compiled: null, collision, alloc: { width: W, height: H }, lmTex, meshes, lighting: { sunDir }, sampler, hash: 'bsp' };
}

// ---------------------------------------------------------------------------
// Collision over the BSP clip hulls + dynamic player boxes, same interface as CollisionWorld.
export class BspCollision {
  constructor(bsp, models) {
    this.bsp = bsp;
    this.hulls = new BspHulls(bsp);
    this.models = models;
    this.dynamic = [];
    this._tw = { start: [0, 0, 0], end: [0, 0, 0], mins: [0, 0, 0], maxs: [0, 0, 0] };
  }

  hullFor(mins, maxs) {
    const h = maxs[2] - mins[2];
    const w = maxs[0] - mins[0];
    if (w === 0 && h === 0) return 0;
    if (w >= 30 && h >= 70) return 1;
    if (w >= 30 && h >= 34) return 3;
    if (w >= 60) return 2;
    return 0;
  }

  trace(start, end, mins, maxs, mask = 0xff, out = new TraceResult(), ignore = null) {
    out.reset();
    const hull = this.hullFor(mins, maxs);
    // GoldSrc hulls are offset so that the box is centred on the traced origin;
    // for non-centred boxes shift the trace to the box centre.
    const off = hull === 0 ? [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, (mins[2] + maxs[2]) / 2] : [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, (mins[2] + maxs[2]) / 2];
    for (const md of this.models) {
      const o = md.offset;
      const s = [start[0] + off[0] - o[0], start[1] + off[1] - o[1], start[2] + off[2] - o[2]];
      const e = [end[0] + off[0] - o[0], end[1] + off[1] - o[1], end[2] + off[2] - o[2]];
      const t = { fraction: 1, allsolid: true, startsolid: false, inopen: false, endpos: e.slice(), normal: [0, 0, 0], dist: 0 };
      this.hulls.recursive(hull, md.model.headnode[hull], 0, 1, s, e, t);
      if (t.allsolid) { t.startsolid = true; }
      if (t.startsolid) { out.startsolid = true; }
      if (t.allsolid) { out.allsolid = true; out.fraction = 0; out.endpos = start.slice(); return out; }
      if (t.fraction < out.fraction) {
        out.fraction = t.fraction;
        out.normal = t.normal;
        out.dist = t.dist;
        out.brush = { userData: null, bsp: true };
      }
    }
    // dynamic boxes
    const tw = this._tw;
    for (let i = 0; i < 3; i++) { tw.start[i] = start[i]; tw.end[i] = end[i]; tw.mins[i] = mins[i]; tw.maxs[i] = maxs[i]; }
    const isPoint = mins[0] === 0 && maxs[0] === 0 && mins[2] === 0 && maxs[2] === 0;
    for (const b of this.dynamic) {
      if (!b.active || !(b.contents & mask) || b === ignore) continue;
      CollisionWorld.prototype._traceBrush.call(this, tw, b, out, isPoint);
      if (out.allsolid) { out.endpos = start.slice(); return out; }
    }
    const f = out.fraction;
    out.endpos = [start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f, start[2] + (end[2] - start[2]) * f];
    return out;
  }

  testBox(pos, mins, maxs, mask) {
    const r = this._tr || (this._tr = new TraceResult());
    this.trace(pos, pos, mins, maxs, mask, r);
    return r.startsolid;
  }

  occluded(a, b, mask = MASK_SHOT) {
    const r = this._tr2 || (this._tr2 = new TraceResult());
    this.trace(a, b, [0, 0, 0], [0, 0, 0], mask, r);
    return r.fraction < 1 || r.startsolid;
  }
}

// R_LightPoint: walk the BSP down from a point to the first surface below and read its lightmap.
class BspLightSampler {
  constructor(bsp, faces, W, H, rgba) {
    this.bsp = bsp;
    this.W = W; this.H = H; this.rgba = rgba;
    this.faceByIndex = new Map();
    // map original face index -> our face (world only, by matching first vertex)
    this.faces = faces;
  }

  sample(pos, out = [1, 1, 1]) {
    const b = this.bsp;
    const end = [pos[0], pos[1], pos[2] - 2048];
    const r = this._recursive(b.models[0].headnode[0], pos, end);
    if (!r) return out;
    out[0] = r[0] / 128; out[1] = r[1] / 128; out[2] = r[2] / 128;
    return out;
  }

  _recursive(node, start, end) {
    const b = this.bsp;
    if (node < 0) return null;
    const n = b.nodes[node];
    const pl = b.planes[n.plane];
    const front = pl.n[0] * start[0] + pl.n[1] * start[1] + pl.n[2] * start[2] - pl.d;
    const back = pl.n[0] * end[0] + pl.n[1] * end[1] + pl.n[2] * end[2] - pl.d;
    const side = front < 0 ? 1 : 0;
    if ((back < 0 ? 1 : 0) === side) return this._recursive(n.children[side], start, end);
    const frac = front / (front - back);
    const mid = [start[0] + (end[0] - start[0]) * frac, start[1] + (end[1] - start[1]) * frac, start[2] + (end[2] - start[2]) * frac];
    const r = this._recursive(n.children[side], start, mid);
    if (r) return r;
    // check faces on this node
    for (let i = 0; i < n.numfaces; i++) {
      const f = b.faces[n.firstface + i];
      if (f.lightofs < 0 || f.styles[0] === 255) continue;
      const ti = b.texinfo[f.texinfo];
      const s = mid[0] * ti.s[0] + mid[1] * ti.s[1] + mid[2] * ti.s[2] + ti.s[3];
      const t = mid[0] * ti.t[0] + mid[1] * ti.t[1] + mid[2] * ti.t[2] + ti.t[3];
      // face extents
      let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
      for (let k = 0; k < f.numedges; k++) {
        const se = b.surfedges[f.firstedge + k];
        const vi = se >= 0 ? b.edges[se * 2] : b.edges[-se * 2 + 1];
        const vx = b.vertices[vi * 3], vy = b.vertices[vi * 3 + 1], vz = b.vertices[vi * 3 + 2];
        const ss = vx * ti.s[0] + vy * ti.s[1] + vz * ti.s[2] + ti.s[3];
        const tt = vx * ti.t[0] + vy * ti.t[1] + vz * ti.t[2] + ti.t[3];
        if (ss < smin) smin = ss; if (ss > smax) smax = ss;
        if (tt < tmin) tmin = tt; if (tt > tmax) tmax = tt;
      }
      if (s < smin || s > smax || t < tmin || t > tmax) continue;
      const bs = Math.floor(smin / 16), bt = Math.floor(tmin / 16);
      const w = Math.ceil(smax / 16) - bs + 1;
      const ds = Math.floor(s / 16) - bs, dt = Math.floor(t / 16) - bt;
      const o = f.lightofs + (dt * w + ds) * 3;
      return [b.lighting[o], b.lighting[o + 1], b.lighting[o + 2]];
    }
    return this._recursive(n.children[side ^ 1], mid, end);
  }
}
