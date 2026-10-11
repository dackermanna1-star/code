// Builds a playable world from an original GoldSrc BSP (files the player supplies -
// nothing from Valve or third-party mappers ships with this repo): render meshes with
// the map's own textures (from its WADs, or generated stand-ins when a WAD is missing)
// and hlrad lightmaps, hull collision (bspcollision.js), light sampling for models,
// and the entity data the game needs (spawns, hostages, doors, breakables, ladders,
// buttons, cameras, buy / rescue / bomb zones).
//
//   const W = await loadBspWorld({ bsp, wads: [ArrayBuffer...], sky: { rt, lf, ... } | null, name })
//   W.brushEnts: [{ ent, classname, model, origin, meshes: [Mesh], handle (collision) }]
import * as THREE from 'three';
import { parseBsp, indexWad } from './bsp30.js';
import { buildWorldMaterial } from './bspmaterial.js';
import { BspCollision } from './bspcollision.js';
import { generateFallbackTexture } from './bspfallback.js';

const SKIP = new Set(['sky', 'aaatrigger', 'clip', 'null', 'origin', 'skip', 'hint', 'bevel', 'aaa_trigger']);
// brush entities drawn by the game
const VISIBLE_ENTS = new Set(['func_wall', 'func_illusionary', 'func_breakable', 'func_door', 'func_door_rotating', 'func_pushable',
  'func_wall_toggle', 'func_button', 'func_rot_button', 'func_rotating', 'func_water', 'func_conveyor', 'func_train', 'func_plat', 'momentary_rot_button']);
const SOLID_ENTS = new Set(['func_wall', 'func_breakable', 'func_door', 'func_door_rotating', 'func_pushable', 'func_wall_toggle',
  'func_button', 'func_rot_button', 'func_rotating', 'func_train', 'func_plat', 'momentary_rot_button']);

const vec = (s, d = [0, 0, 0]) => (s ? String(s).trim().split(/\s+/).map(Number) : d.slice());

export async function loadBspWorld({ bsp: bspBuf, wads = [], sky = null, name = 'custom' }, onProgress = () => {}) {
  onProgress('Parsing BSP', 0.1);
  await tick();
  const bsp = parseBsp(bspBuf);
  const wadTex = new Map();
  for (const w of wads) {
    try { for (const [k, v] of indexWad(w)) if (!wadTex.has(k)) wadTex.set(k, v); } catch (e) { console.warn('bad wad', e); }
  }
  onProgress('Building textures', 0.25);
  await tick();
  const missing = [];
  const texCache = new Map();
  const getTex = (mt) => {
    const key = mt.name.toLowerCase();
    if (texCache.has(key)) return texCache.get(key);
    let src = mt.data ? mt : wadTex.get(key)?.();
    if (!src || !src.data) {
      missing.push(key);
      src = generateFallbackTexture(key, mt.width || 64, mt.height || 64);
    }
    const tex = new THREE.DataTexture(new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.length), src.width, src.height, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapNearestFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
    tex.userData.transparent = key[0] === '{';
    tex.userData.water = key[0] === '!' || key.startsWith('water');
    texCache.set(key, tex);
    return tex;
  };

  // ---- faces: the world, then each visible brush entity separately (so it can move / break)
  const groups = [{ model: bsp.models[0], offset: [0, 0, 0], ent: null, faces: [] }];
  const brushEnts = [];
  for (const e of bsp.entities) {
    if (!e.model || e.model[0] !== '*') continue;
    const m = bsp.models[+e.model.slice(1)];
    if (!m) continue;
    const be = { ent: e, classname: e.classname, model: m, origin: vec(e.origin), meshes: [], handle: null };
    brushEnts.push(be);
    if (!VISIBLE_ENTS.has(e.classname)) continue;
    const rm = +(e.rendermode || 0), ra = e.renderamt != null ? +e.renderamt : 255;
    if ((rm === 1 || rm === 2 || rm === 3 || rm === 5) && ra === 0) continue; // invisible
    groups.push({ model: m, offset: [0, 0, 0], ent: e, be, faces: [], render: { mode: rm, amt: ra } });
  }
  const allFaces = [];
  for (const g of groups) {
    const m = g.model;
    for (let i = 0; i < m.numfaces; i++) {
      const f = bsp.faces[m.firstface + i];
      const ti = bsp.texinfo[f.texinfo];
      const mt = bsp.textures[ti.miptex];
      if (!mt || SKIP.has(mt.name.toLowerCase())) continue;
      const verts = [];
      for (let k = 0; k < f.numedges; k++) {
        const se = bsp.surfedges[f.firstedge + k];
        const vi = se >= 0 ? bsp.edges[se * 2] : bsp.edges[-se * 2 + 1];
        verts.push([bsp.vertices[vi * 3], bsp.vertices[vi * 3 + 1], bsp.vertices[vi * 3 + 2]]);
      }
      let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
      for (const v of verts) {
        const s = v[0] * ti.s[0] + v[1] * ti.s[1] + v[2] * ti.s[2] + ti.s[3];
        const t = v[0] * ti.t[0] + v[1] * ti.t[1] + v[2] * ti.t[2] + ti.t[3];
        if (s < smin) smin = s; if (s > smax) smax = s;
        if (t < tmin) tmin = t; if (t > tmax) tmax = t;
      }
      const s0 = Math.floor(smin / 16), s1 = Math.ceil(smax / 16), t0 = Math.floor(tmin / 16), t1 = Math.ceil(tmax / 16);
      const face = { verts, ti, mt, lightofs: f.lightofs, styles: f.styles, lm: { s0, t0, w: s1 - s0 + 1, h: t1 - t0 + 1, x: 0, y: 0 } };
      g.faces.push(face);
      allFaces.push(face);
    }
  }

  onProgress('Packing lightmaps', 0.45);
  await tick();
  const PAD = 1;
  let area = 0;
  for (const f of allFaces) area += (f.lm.w + 2 * PAD) * (f.lm.h + 2 * PAD);
  let W = 256;
  while (W * W < area * 1.3) W *= 2;
  const order = allFaces.slice().sort((a, b) => b.lm.h - a.lm.h);
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
  for (const f of allFaces) {
    const lm = f.lm;
    const has = f.lightofs >= 0 && f.styles[0] !== 255;
    for (let j = -1; j <= lm.h; j++) for (let i = -1; i <= lm.w; i++) {
      const ci = Math.max(0, Math.min(lm.w - 1, i)), cj = Math.max(0, Math.min(lm.h - 1, j));
      const o = ((lm.y + j) * W + (lm.x + i)) * 4;
      if (has) {
        const so = f.lightofs + (cj * lm.w + ci) * 3;
        rgba[o] = bsp.lighting[so]; rgba[o + 1] = bsp.lighting[so + 1]; rgba[o + 2] = bsp.lighting[so + 2];
      } else { rgba[o] = rgba[o + 1] = rgba[o + 2] = 124; } // unlit (fullbright) faces
      rgba[o + 3] = 255;
    }
  }
  const lmTex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  lmTex.magFilter = lmTex.minFilter = THREE.LinearFilter;
  lmTex.generateMipmaps = false;
  lmTex.needsUpdate = true;

  onProgress('Building meshes', 0.65);
  await tick();
  const meshes = [];
  const waterScroll = new THREE.Vector2();
  for (const g of groups) {
    const byTex = new Map();
    for (const f of g.faces) {
      const k = f.mt.name.toLowerCase();
      let l = byTex.get(k);
      if (!l) byTex.set(k, l = []);
      l.push(f);
    }
    for (const [tname, list] of byTex) {
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
      const r = g.render || { mode: 0, amt: 255 };
      const water = tex.userData.water;
      const opacity = r.mode === 2 || r.mode === 3 ? Math.max(0.05, r.amt / 255) : water ? 0.82 : 1;
      const mat = buildWorldMaterial(tex, lmTex, tex.userData.transparent || r.mode === 4, {
        opacity, additive: r.mode === 5, scroll: water ? waterScroll : undefined, doubleSide: water,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'bsp:' + tname + (g.ent ? '@' + g.ent.model : '');
      if (opacity < 1 || r.mode === 5) mesh.renderOrder = 2;
      if (g.be) {
        // brush entity: its vertices are relative to its origin (the origin brush
        // for doors; 0 otherwise), so the mesh pivots there and can rotate / slide
        const o = g.be.origin;
        mesh.position.set(o[0], o[1], o[2]);
        g.be.meshes.push(mesh);
      } else mesh.matrixAutoUpdate = false;
      meshes.push(mesh);
    }
  }
  if (missing.length) console.warn(`[bsp] ${missing.length} textures not in the supplied WADs (generated stand-ins):`, missing.join(' '));

  onProgress('Collision', 0.85);
  await tick();
  const collision = new BspCollision(bsp);
  for (const be of brushEnts) {
    if (be.classname === 'func_ladder') { collision.addLadder(be.model, be.origin); continue; }
    if (!SOLID_ENTS.has(be.classname)) continue;
    // models of entities with an origin brush are built around it: their hull is local
    be.handle = collision.addEntity(be.model, be.origin, be);
  }
  const sampler = new BspLightSampler(bsp);

  // ---- point / zone entities in the format the game uses
  const ents = [];
  const modelOf = (e) => (e.model && e.model[0] === '*' ? bsp.models[+e.model.slice(1)] : null);
  for (const e of bsp.entities) {
    const c = e.classname;
    if (c === 'info_player_start' || c === 'info_player_deathmatch' || c === 'hostage_entity' || c === 'info_hostage_rescue' || c === 'info_bomb_target' || c === 'info_target') {
      const a = vec(e.angles);
      ents.push({ classname: c, origin: vec(e.origin), angle: e.angle != null ? +e.angle : a[1], targetname: e.targetname, model: e.model });
    } else if (c === 'func_bomb_target' || c === 'func_buyzone' || c === 'func_hostage_rescue') {
      const m = modelOf(e);
      if (!m) continue;
      const out = { classname: c, mins: m.mins.slice(), maxs: m.maxs.slice() };
      if (c === 'func_buyzone') out.team = e.team === '1' ? 'T' : e.team === '2' ? 'CT' : 'any';
      ents.push(out);
    } else if (c === 'trigger_camera') {
      ents.push({ classname: c, origin: vec(e.origin), angle: +(e.angle || 0), targetname: e.targetname, target: e.target, wait: +(e.wait || 10) });
    }
  }
  // bomb sites named by size order A/B (closest to the T spawn = B, like most maps)
  const bombs = ents.filter((e) => e.classname === 'func_bomb_target');
  bombs.forEach((b, i) => { b.name = String.fromCharCode(65 + i); });

  const le = bsp.entities.find((e) => e.classname === 'light_environment');
  let sunDir = [-0.366, -0.341, 0.866];
  if (le) {
    const yaw = (+le.angle || 0) * Math.PI / 180, pitch = (+le.pitch || -60) * Math.PI / 180;
    sunDir = [-Math.cos(pitch) * Math.cos(yaw), -Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch)];
  }
  const wm = bsp.models[0];
  const ws = bsp.entities.find((e) => e.classname === 'worldspawn') || {};
  const map = {
    name, entities: ents, bounds: [wm.mins[0], wm.mins[1], wm.maxs[0], wm.maxs[1]], zrange: [wm.mins[2], wm.maxs[2]],
    lights: [], source: 'bsp', skyname: ws.skyname, title: ws.message || name,
  };
  return {
    map, compiled: null, collision, alloc: { width: W, height: H }, lmTex, meshes, lighting: { sunDir }, sampler, hash: 'bsp:' + name,
    bsp, brushEnts, sky, missingTextures: missing,
    update(dt) { waterScroll.x = (waterScroll.x + dt * 0.03) % 1; waterScroll.y = (waterScroll.y + dt * 0.02) % 1; },
  };
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

// ---------------------------------------------------------------------------
// R_LightPoint: walk the BSP down from a point to the first lit surface below and
// read its lightmap. Returns light in the same units as the built-in map's sampler
// (1.0 = a normally lit surface), so studio models light the same way.
class BspLightSampler {
  constructor(bsp) { this.bsp = bsp; }

  sample(pos, out = [1, 1, 1]) {
    const b = this.bsp;
    const r = this._recursive(b.models[0].headnode[0], pos[0], pos[1], pos[2], pos[0], pos[1], pos[2] - 2048);
    if (!r) return out;
    const k = (264 / 128) / 255;
    out[0] = r[0] * k; out[1] = r[1] * k; out[2] = r[2] * k;
    return out;
  }

  _recursive(node, x1, y1, z1, x2, y2, z2) {
    const b = this.bsp;
    if (node < 0) return null;
    const n = b.nodes[node];
    const pl = b.planes[n.plane];
    const front = pl.n[0] * x1 + pl.n[1] * y1 + pl.n[2] * z1 - pl.d;
    const back = pl.n[0] * x2 + pl.n[1] * y2 + pl.n[2] * z2 - pl.d;
    const side = front < 0 ? 1 : 0;
    if ((back < 0 ? 1 : 0) === side) return this._recursive(n.children[side], x1, y1, z1, x2, y2, z2);
    const frac = front / (front - back);
    const mx = x1 + (x2 - x1) * frac, my = y1 + (y2 - y1) * frac, mz = z1 + (z2 - z1) * frac;
    const r = this._recursive(n.children[side], x1, y1, z1, mx, my, mz);
    if (r) return r;
    for (let i = 0; i < n.numfaces; i++) {
      const f = b.faces[n.firstface + i];
      if (f.lightofs < 0 || f.styles[0] === 255) continue;
      const ti = b.texinfo[f.texinfo];
      const s = mx * ti.s[0] + my * ti.s[1] + mz * ti.s[2] + ti.s[3];
      const t = mx * ti.t[0] + my * ti.t[1] + mz * ti.t[2] + ti.t[3];
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
    return this._recursive(n.children[side ^ 1], mx, my, mz, x2, y2, z2);
  }
}
