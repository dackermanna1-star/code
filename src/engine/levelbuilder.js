// Level construction kit. Geometry is emitted into per-material buckets with
// world-projected UVs, subdivided for PS1 vertex lighting, and baked with
// static lights (raycast shadows) + sky occlusion into vertex colours.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createPS1Material } from './ps1material.js';
import { tex } from './textures.js';
import { SURF } from './collision.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Standard material library. scale = metres per texture repeat.
export const MATERIALS = {
  concrete: { tex: ['concrete', {}], scale: 3, surf: SURF.CONCRETE },
  concreteDark: { tex: ['concrete', { color: 0x5c5a56 }], scale: 3, surf: SURF.CONCRETE },
  concreteWarm: { tex: ['concrete', { color: 0x9a8f7c }], scale: 3, surf: SURF.CONCRETE },
  asphalt: { tex: ['asphalt', {}], scale: 4, surf: SURF.CONCRETE },
  asphaltYellow: { tex: ['asphalt', { line: 'yellow' }], scale: 4, surf: SURF.CONCRETE },
  asphaltWhite: { tex: ['asphalt', { line: 'white' }], scale: 4, surf: SURF.CONCRETE },
  crosswalk: { tex: ['asphalt', { line: 'crosswalk' }], scale: 4, surf: SURF.CONCRETE },
  sidewalk: { tex: ['sidewalk', {}], scale: 2, surf: SURF.CONCRETE },
  brick: { tex: ['brick', {}], scale: 2.5, surf: SURF.CONCRETE },
  brickTan: { tex: ['brick', { color: 0xa08560 }], scale: 2.5, surf: SURF.CONCRETE },
  brickDark: { tex: ['brick', { color: 0x5a3028 }], scale: 2.5, surf: SURF.CONCRETE },
  carpetRed: { tex: ['carpet', {}], scale: 2, surf: SURF.CARPET },
  carpetBlue: { tex: ['carpet', { color: 0x283a5a, accent: 0x8a8a6a }], scale: 2, surf: SURF.CARPET },
  carpetGreen: { tex: ['carpet', { color: 0x2c4a34, accent: 0x9a7a3a }], scale: 2, surf: SURF.CARPET },
  carpetBrown: { tex: ['carpet', { color: 0x5a4632, accent: 0x8a6a3a }], scale: 2, surf: SURF.CARPET },
  wallpaper: { tex: ['wallpaper', {}], scale: 2, surf: SURF.CONCRETE },
  wallpaperGreen: { tex: ['wallpaper', { color: 0x8a9a7a, stripe: 0x6a7a5a }], scale: 2, surf: SURF.CONCRETE },
  wallpaperRed: { tex: ['wallpaper', { color: 0x8a4a3a, stripe: 0x6a3226 }], scale: 2, surf: SURF.CONCRETE },
  wainscot: { tex: ['wainscot', {}], scale: 2, surf: SURF.WOOD },
  plaster: { tex: ['plaster', {}], scale: 3, surf: SURF.CONCRETE },
  plasterBlue: { tex: ['plaster', { color: 0x8aa0b0 }], scale: 3, surf: SURF.CONCRETE },
  plasterGreen: { tex: ['plaster', { color: 0x7a9a80 }], scale: 3, surf: SURF.CONCRETE },
  plasterPeach: { tex: ['plaster', { color: 0xd0a888 }], scale: 3, surf: SURF.CONCRETE },
  plasterDirty: { tex: ['plaster', { color: 0x9a907a }], scale: 3, surf: SURF.CONCRETE },
  ceiling: { tex: ['ceiling', {}], scale: 1.2, surf: SURF.CONCRETE },
  wood: { tex: ['wood', {}], scale: 2, surf: SURF.WOOD },
  woodFloor: { tex: ['wood', { planks: true, color: 0x7a5232 }], scale: 2, surf: SURF.WOOD },
  woodDark: { tex: ['wood', { color: 0x3e2818 }], scale: 2, surf: SURF.WOOD },
  woodLight: { tex: ['wood', { color: 0xa07a50 }], scale: 2, surf: SURF.WOOD },
  metal: { tex: ['metal', {}], scale: 2, surf: SURF.METAL },
  metalDark: { tex: ['metal', { color: 0x44484c }], scale: 2, surf: SURF.METAL },
  metalRivet: { tex: ['metal', { rivets: true }], scale: 2, surf: SURF.METAL },
  metalDiamond: { tex: ['metal', { diamond: true, color: 0x6a6e70 }], scale: 1.5, surf: SURF.METAL },
  metalGreen: { tex: ['metal', { color: 0x3a5a42, rivets: true }], scale: 2, surf: SURF.METAL },
  metalRed: { tex: ['metal', { color: 0x7a2a22 }], scale: 2, surf: SURF.METAL },
  metalYellow: { tex: ['metal', { color: 0xb08a20 }], scale: 2, surf: SURF.METAL },
  steel: { tex: ['metal', { color: 0x9aa0a4 }], scale: 1.5, surf: SURF.METAL },
  shutter: { tex: ['shutter', {}], scale: 2, surf: SURF.METAL },
  tileWhite: { tex: ['tile', { color: 0xd8d4c8 }], scale: 1.2, surf: SURF.TILE },
  tileChecker: { tex: ['tile', { color: 0xd8d4c8, color2: 0x30302c, checker: true }], scale: 1.6, surf: SURF.TILE },
  tileMall: { tex: ['tile', { color: 0xc8bca4, color2: 0xa89878, checker: true, n: 2 }], scale: 2.4, surf: SURF.TILE },
  tileBlue: { tex: ['tile', { color: 0x8aa8b8, n: 8 }], scale: 1.2, surf: SURF.TILE },
  tileKitchen: { tex: ['tile', { color: 0xb8a890, color2: 0x8a3a30, checker: true, n: 4 }], scale: 1.4, surf: SURF.TILE },
  marble: { tex: ['marble', {}], scale: 2, surf: SURF.TILE },
  marbleDark: { tex: ['marble', { color: 0x6a6258 }], scale: 2, surf: SURF.TILE },
  gravel: { tex: ['gravel', {}], scale: 2, surf: SURF.GRAVEL },
  roof: { tex: ['roof', {}], scale: 3, surf: SURF.GRAVEL },
  grass: { tex: ['grass', {}], scale: 3, surf: SURF.GRASS },
  dirt: { tex: ['dirt', {}], scale: 3, surf: SURF.DIRT },
  glass: { tex: ['glass', {}], scale: 2, surf: SURF.GLASS, transparent: true, opacity: 1 },
  water: { tex: ['water', {}], scale: 2, surf: SURF.WATER, unlit: false, uvScroll: [0.05, 0.02] },
  black: { color: 0x050505, surf: SURF.CONCRETE },
  emissiveWhite: { color: 0xffffff, surf: SURF.GLASS, unlit: true },
  emissiveWarm: { color: 0xffd890, surf: SURF.GLASS, unlit: true },
  clip: { invisible: true, surf: SURF.CONCRETE },
};

export class LevelBuilder {
  constructor(opts = {}) {
    this.opts = opts;
    this.buckets = new Map();
    this.colPos = []; this.colSurf = []; this.colBullet = [];
    this.lights = [];       // static baked lights
    this.dynLights = [];    // runtime lights (flicker, fire)
    this.zones = [];        // ambient overrides
    this.markers = [];      // generic markers {type, pos, ...}
    this.triggers = [];
    this.doors = [];
    this.glass = [];
    this.ladders = [];
    this.props = [];        // dynamic props (gas cans, physics-ish objects)
    this.meshes = [];       // extra Object3Ds (unique)
    this.matDefs = { ...MATERIALS, ...(opts.materials || {}) };
    this.stack = [new THREE.Matrix4()];
    this.maxQuad = opts.maxQuad || 2.0;
    this.ambientSky = new THREE.Color(opts.ambientSky || 0x4a4c56);
    this.ambientGround = new THREE.Color(opts.ambientGround || 0x2a2622);
    this.sun = opts.sun || null; // {dir:[x,y,z], color}
    this.skyRays = opts.skyRays !== undefined ? opts.skyRays : 6;
    this.skyColor = new THREE.Color(opts.skyColor || 0x8890a0);
    this.minLight = new THREE.Color(opts.minLight || 0x141416);
    this._signCount = 0;
  }

  defMat(name, def) { this.matDefs[name] = def; return name; }

  // ---------- transforms ----------
  get matrix() { return this.stack[this.stack.length - 1]; }
  push(pos = [0, 0, 0], rotY = 0, scale = 1) {
    const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rotY), V(scale, scale, scale));
    this.stack.push(this.matrix.clone().multiply(m));
  }
  pushMatrix(m) { this.stack.push(this.matrix.clone().multiply(m)); }
  pop() { if (this.stack.length > 1) this.stack.pop(); }
  xf(p) { return p.clone().applyMatrix4(this.matrix); }
  xfDir(d) { return d.clone().transformDirection(this.matrix); }

  bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) {
      const def = this.matDefs[mat];
      if (!def) throw new Error('Unknown material ' + mat);
      b = { mat, def, pos: [], nrm: [], uv: [], col: [] };
      this.buckets.set(mat, b);
    }
    return b;
  }

  // ---------- primitive emission ----------
  // Emits a planar quad given 4 corners (local space, CCW when viewed from the front).
  // opts: collide (default true unless material invisible-only), uv: [[u,v]x4] explicit, bullet (default true), subdivide
  quad(a, b, c, d, mat, opts = {}) {
    const def = this.matDefs[mat];
    const collide = opts.collide !== undefined ? opts.collide : true;
    const visible = !def.invisible && opts.visible !== false;
    const A = a.isVector3 ? a : V(...a), B = b.isVector3 ? b : V(...b), C = c.isVector3 ? c : V(...c), D = d.isVector3 ? d : V(...d);
    const e1 = B.clone().sub(A), e2 = D.clone().sub(A);
    const n = e1.clone().cross(e2).normalize();
    const nu = opts.subdivide === false ? 1 : Math.max(1, Math.ceil(e1.length() / (opts.maxQuad || this.maxQuad)));
    const nv = opts.subdivide === false ? 1 : Math.max(1, Math.ceil(e2.length() / (opts.maxQuad || this.maxQuad)));
    const scale = opts.scale || def.scale || 2;
    const an = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const projUV = (p) => {
      if (opts.uvMode === 'local') return null;
      if (ay >= an && ay >= az) return [p.x / scale, p.z / scale * (n.y > 0 ? 1 : 1)];
      if (an >= az) return [(n.x > 0 ? -p.z : p.z) / scale, p.y / scale];
      return [(n.z > 0 ? p.x : -p.x) / scale, p.y / scale];
    };
    const W = this.matrix;
    const nW = n.clone().transformDirection(W);
    const lerp4 = (u, v) => {
      // bilinear between A,B,C,D (A=0,0  B=1,0  C=1,1  D=0,1)
      const p0 = A.clone().lerp(B, u), p1 = D.clone().lerp(C, u);
      return p0.lerp(p1, v);
    };
    const uvAt = (u, v, p) => {
      if (opts.uv) {
        const [ua, va] = opts.uv[0], [ub, vb] = opts.uv[1], [uc, vc] = opts.uv[2], [ud, vd] = opts.uv[3];
        const u0 = ua + (ub - ua) * u, v0 = va + (vb - va) * u;
        const u1 = ud + (uc - ud) * u, v1 = vd + (vc - vd) * u;
        return [u0 + (u1 - u0) * v, v0 + (v1 - v0) * v];
      }
      const uv = projUV(p);
      if (opts.uvOffset) { uv[0] += opts.uvOffset[0]; uv[1] += opts.uvOffset[1]; }
      return uv;
    };
    const bk = visible ? this.bucket(mat) : null;
    const tint = opts.tint || null;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
      const p = [lerp4(u0, v0), lerp4(u1, v0), lerp4(u1, v1), lerp4(u0, v1)];
      const t = [uvAt(u0, v0, p[0]), uvAt(u1, v0, p[1]), uvAt(u1, v1, p[2]), uvAt(u0, v1, p[3])];
      const w = p.map((q) => q.clone().applyMatrix4(W));
      const tris = [[0, 1, 2], [0, 2, 3]];
      for (const tri of tris) {
        for (const k of tri) {
          if (bk) {
            bk.pos.push(w[k].x, w[k].y, w[k].z);
            bk.nrm.push(nW.x, nW.y, nW.z);
            bk.uv.push(t[k][0], t[k][1]);
            bk.col.push(tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1);
          }
          if (collide) {
            this.colPos.push(w[k].x, w[k].y, w[k].z);
            this.colSurf.push(def.surf || 0);
            this.colBullet.push(opts.bullet === false || def.noBullet ? 0 : 1);
          }
        }
      }
    }
  }

  // Axis-aligned (in local space) box. faces: object with keys px,nx,py,ny,pz,nz = false to skip.
  // mats: string or {side, top, bottom}
  box(min, max, mats, opts = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const m = typeof mats === 'string' ? { side: mats, top: mats, bottom: mats } : { side: mats.side, top: mats.top || mats.side, bottom: mats.bottom || mats.side, px: mats.px, nx: mats.nx, pz: mats.pz, nz: mats.nz };
    const f = opts.faces || {};
    const o = opts;
    if (f.py !== false) this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), m.top, o);
    if (f.ny !== false) this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), m.bottom, o);
    if (f.pz !== false) this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), m.pz || m.side, o);
    if (f.nz !== false) this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), m.nz || m.side, o);
    if (f.px !== false) this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), m.px || m.side, o);
    if (f.nx !== false) this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), m.nx || m.side, o);
  }

  // Rectangle with holes decomposed into solid rectangles. Returns [[u0,v0,u1,v1],...]
  static decompose(u0, v0, u1, v1, holes) {
    const xs = new Set([u0, u1]);
    for (const h of holes) { if (h[0] > u0 && h[0] < u1) xs.add(h[0]); if (h[2] > u0 && h[2] < u1) xs.add(h[2]); }
    const xa = [...xs].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < xa.length - 1; i++) {
      const a = xa[i], b = xa[i + 1];
      if (b - a < 1e-5) continue;
      const cover = holes.filter((h) => h[0] <= a + 1e-5 && h[2] >= b - 1e-5).map((h) => [Math.max(v0, h[1]), Math.min(v1, h[3])]).filter((s) => s[1] > s[0]).sort((p, q) => p[0] - q[0]);
      let y = v0;
      for (const [c0, c1] of cover) {
        if (c0 > y + 1e-5) out.push([a, y, b, c0]);
        y = Math.max(y, c1);
      }
      if (v1 > y + 1e-5) out.push([a, y, b, v1]);
    }
    // merge vertically-identical neighbours horizontally
    const merged = [];
    for (const r of out) {
      const last = merged.find((m) => Math.abs(m[2] - r[0]) < 1e-5 && Math.abs(m[1] - r[1]) < 1e-5 && Math.abs(m[3] - r[3]) < 1e-5);
      if (last) last[2] = r[2]; else merged.push(r.slice());
    }
    return merged;
  }

  /**
   * Thick wall from (x0,z0) to (x1,z1), bottom y0 top y1.
   * opts: thick (0.2), mat2 (back side material), openings: [{at (centre distance from start), w, y0 (relative to wall bottom), h}],
   *       caps (end caps, default true), top (top cap, default true), trim (material for opening jambs)
   * Front face normal = left of the direction of travel (x0,z0)->(x1,z1) when looking from above with +y up:
   * for direction +x, front faces -z.
   */
  wall(x0, z0, x1, z1, y0, y1, mat, opts = {}) {
    const t = opts.thick !== undefined ? opts.thick : 0.2;
    const dx = x1 - x0, dz = z1 - z0; const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const ang = Math.atan2(-dz, dx); // rotation so local +x points along wall
    const holes = (opts.openings || []).map((o) => [o.at - o.w / 2, (o.y0 || 0), o.at + o.w / 2, (o.y0 || 0) + o.h]);
    const H = y1 - y0;
    const rects = LevelBuilder.decompose(0, 0, len, H, holes);
    const mFront = mat, mBack = opts.mat2 || mat, mTrim = opts.trim || mat;
    this.push([x0, y0, z0], ang);
    const hz = t / 2;
    for (const [a, b, c, d] of rects) {
      // front (-z local)
      this.quad(V(c, b, -hz), V(a, b, -hz), V(a, d, -hz), V(c, d, -hz), mFront, opts);
      // back (+z local)
      this.quad(V(a, b, hz), V(c, b, hz), V(c, d, hz), V(a, d, hz), mBack, opts);
    }
    for (const h of holes) {
      const [a, b, c, d] = h;
      const bb = Math.max(0, b), dd = Math.min(H, d);
      if (a > 0) this.quad(V(a, bb, -hz), V(a, bb, hz), V(a, dd, hz), V(a, dd, -hz), mTrim, opts); // left jamb faces +x
      if (c < len) this.quad(V(c, bb, hz), V(c, bb, -hz), V(c, dd, -hz), V(c, dd, hz), mTrim, opts);
      if (dd < H) this.quad(V(a, dd, hz), V(c, dd, hz), V(c, dd, -hz), V(a, dd, -hz), mTrim, opts); // header faces down
      if (bb > 0) this.quad(V(a, bb, -hz), V(c, bb, -hz), V(c, bb, hz), V(a, bb, hz), mTrim, opts); // sill faces up
    }
    if (opts.caps !== false) {
      this.quad(V(0, 0, hz), V(0, 0, -hz), V(0, H, -hz), V(0, H, hz), mTrim, opts);
      this.quad(V(len, 0, -hz), V(len, 0, hz), V(len, H, hz), V(len, H, -hz), mTrim, opts);
    }
    if (opts.top !== false) this.quad(V(0, H, -hz), V(len, H, -hz), V(len, H, hz), V(0, H, hz), opts.topMat || mTrim, opts);
    this.pop();
  }

  /** Horizontal floor (top face, normal +y) with optional rectangular holes [[x0,z0,x1,z1],...]. */
  floor(x0, z0, x1, z1, y, mat, opts = {}) {
    const holes = opts.holes || [];
    const rects = LevelBuilder.decompose(x0, z0, x1, z1, holes);
    for (const [a, b, c, d] of rects) this.quad(V(a, y, d), V(c, y, d), V(c, y, b), V(a, y, b), mat, opts);
  }
  /** Ceiling (normal -y). */
  ceiling(x0, z0, x1, z1, y, mat, opts = {}) {
    const holes = opts.holes || [];
    const rects = LevelBuilder.decompose(x0, z0, x1, z1, holes);
    for (const [a, b, c, d] of rects) this.quad(V(a, y, b), V(c, y, b), V(c, y, d), V(a, y, d), mat, opts);
  }
  /** Thick slab: floor on top, ceiling beneath, sides on hole edges and outer edges (if edges=true). */
  slab(x0, z0, x1, z1, yTop, thick, matTop, matBottom, opts = {}) {
    this.floor(x0, z0, x1, z1, yTop, matTop, opts);
    this.ceiling(x0, z0, x1, z1, yTop - thick, matBottom || matTop, opts);
    const side = opts.edgeMat || matBottom || matTop;
    const yb = yTop - thick;
    for (const h of (opts.holes || [])) {
      const [a, b, c, d] = h;
      this.quad(V(a, yb, d), V(a, yb, b), V(a, yTop, b), V(a, yTop, d), side, opts); // faces +x? (inside hole looking from hole)
      this.quad(V(c, yb, b), V(c, yb, d), V(c, yTop, d), V(c, yTop, b), side, opts);
      this.quad(V(a, yb, b), V(c, yb, b), V(c, yTop, b), V(a, yTop, b), side, opts);
      this.quad(V(c, yb, d), V(a, yb, d), V(a, yTop, d), V(c, yTop, d), side, opts);
    }
    if (opts.edges) {
      this.quad(V(x0, yb, z1), V(x1, yb, z1), V(x1, yTop, z1), V(x0, yTop, z1), side, opts);
      this.quad(V(x1, yb, z0), V(x0, yb, z0), V(x0, yTop, z0), V(x1, yTop, z0), side, opts);
      this.quad(V(x1, yb, z1), V(x1, yb, z0), V(x1, yTop, z0), V(x1, yTop, z1), side, opts);
      this.quad(V(x0, yb, z0), V(x0, yb, z1), V(x0, yTop, z1), V(x0, yTop, z0), side, opts);
    }
  }

  /**
   * Room: floor, ceiling and four walls with openings.
   * r = {x0,z0,x1,z1,y,h, floor, ceil, wall, wallOut, thick, doors:{n:[{at,w,h,y0}], s:[], e:[], w:[]}, noCeil, noFloor, walls:{n:false}}
   * n = -z side, s = +z side, w = -x side, e = +x side.
   * Wall openings' "at" is measured from the west end (n/s walls) or north end (e/w walls).
   */
  room(r) {
    const t = r.thick !== undefined ? r.thick : 0.2;
    const y = r.y || 0, h = r.h || 3;
    if (!r.noFloor) this.floor(r.x0, r.z0, r.x1, r.z1, y, r.floor || 'concrete', { holes: r.floorHoles });
    if (!r.noCeil) this.ceiling(r.x0, r.z0, r.x1, r.z1, y + h, r.ceil || 'ceiling', { holes: r.ceilHoles });
    const d = r.doors || {};
    const walls = r.walls || {};
    const wm = r.wall || 'plaster', wo = r.wallOut || wm;
    const ht = t / 2;
    // north wall (z0), runs west->east, front faces -z (outside); we want inside (+z) to be wm
    if (walls.n !== false) this.wall(r.x0 - ht, r.z0, r.x1 + ht, r.z0, y, y + h, wo, { thick: t, mat2: wm, openings: (d.n || []).map((o) => ({ ...o, at: o.at + ht })), trim: r.trim, top: r.wallTop !== false });
    if (walls.s !== false) this.wall(r.x1 + ht, r.z1, r.x0 - ht, r.z1, y, y + h, wo, { thick: t, mat2: wm, openings: (d.s || []).map((o) => ({ ...o, at: (r.x1 - r.x0) - o.at + ht })), trim: r.trim, top: r.wallTop !== false });
    if (walls.w !== false) this.wall(r.x0, r.z1 - ht + t, r.x0, r.z0 + ht - t, y, y + h, wo, { thick: t, mat2: wm, openings: (d.w || []).map((o) => ({ ...o, at: (r.z1 - r.z0) - o.at - ht + t })), trim: r.trim, caps: false, top: r.wallTop !== false });
    if (walls.e !== false) this.wall(r.x1, r.z0 + ht - t, r.x1, r.z1 - ht + t, y, y + h, wo, { thick: t, mat2: wm, openings: (d.e || []).map((o) => ({ ...o, at: o.at - ht + t })), trim: r.trim, caps: false, top: r.wallTop !== false });
  }

  /**
   * Straight stairs. from = bottom-front centre [x,y,z], dir = 'n'|'s'|'e'|'w' (direction of ascent),
   * width, rise (total height), run (total horizontal length), steps.
   * Visual steps + an invisible collision ramp, plus optional side stringers.
   */
  stairs(from, dir, width, rise, run, steps, mat, opts = {}) {
    const rot = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[dir];
    // local: ascend along +z, width along x
    this.push(from, rot);
    const sh = rise / steps, sd = run / steps, hw = width / 2;
    for (let i = 0; i < steps; i++) {
      const y0 = i * sh, y1 = (i + 1) * sh, z0 = i * sd, z1 = (i + 1) * sd;
      // tread
      this.quad(V(-hw, y1, z1), V(hw, y1, z1), V(hw, y1, z0), V(-hw, y1, z0), opts.treadMat || mat, { collide: false });
      // riser (faces -z)
      this.quad(V(hw, y0, z0), V(-hw, y0, z0), V(-hw, y1, z0), V(hw, y1, z0), mat, { collide: false });
      if (opts.sides !== false) {
        this.quad(V(hw, 0, z1), V(hw, 0, z0), V(hw, y1, z0), V(hw, y1, z1), opts.sideMat || mat, { collide: false });
        this.quad(V(-hw, 0, z0), V(-hw, 0, z1), V(-hw, y1, z1), V(-hw, y1, z0), opts.sideMat || mat, { collide: false });
      }
    }
    if (opts.under !== false) this.quad(V(-hw, 0, 0), V(hw, 0, 0), V(hw, rise, run), V(-hw, rise, run), opts.sideMat || mat, { collide: false });
    // collision ramp from front edge to top edge
    this.quad(V(-hw, 0, 0), V(-hw, rise, run), V(hw, rise, run), V(hw, 0, 0), 'clip', { collide: true });
    // back face of top step down to the floor (collision) to block walking under from behind
    this.quad(V(-hw, 0, run), V(-hw, rise, run), V(-hw, rise, run), V(-hw, 0, run), 'clip', { collide: false });
    if (opts.rails) {
      for (const sx of [-hw - 0.05, hw + 0.05]) {
        this.push([sx, 0, 0]);
        // rail as slanted thin box approximated by quads
        const rH = 0.95;
        this.quad(V(0, rH, 0), V(0, rise + rH, run), V(0, rise + rH + 0.08, run), V(0, rH + 0.08, 0), opts.railMat || 'metalDark', { collide: false });
        this.quad(V(0, rH + 0.08, 0), V(0, rise + rH + 0.08, run), V(0, rise + rH, run), V(0, rH, 0), opts.railMat || 'metalDark', { collide: false });
        this.pop();
        // clip wall along rail side so survivors don't fall off
        this.quad(V(sx, 0, 0), V(sx, rise, run), V(sx, rise + 1.2, run), V(sx, 1.2, 0), 'clip', { collide: true });
        this.quad(V(sx, 1.2, 0), V(sx, rise + 1.2, run), V(sx, rise, run), V(sx, 0, 0), 'clip', { collide: true });
      }
    }
    this.pop();
  }

  /** Visible inclined ramp (e.g. wheelchair ramp, debris). */
  ramp(from, dir, width, rise, run, mat, opts = {}) {
    const rot = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[dir];
    this.push(from, rot);
    const hw = width / 2;
    this.quad(V(-hw, 0, 0), V(-hw, rise, run), V(hw, rise, run), V(hw, 0, 0), mat, opts);
    if (opts.sides !== false) {
      this.quad(V(hw, 0, run), V(hw, 0, 0), V(hw, 0.0001, 0), V(hw, rise, run), mat, { ...opts, collide: false });
      this.quad(V(-hw, 0, 0), V(-hw, 0, run), V(-hw, rise, run), V(-hw, 0.0001, 0), mat, { ...opts, collide: false });
    }
    this.pop();
  }

  /** Low-poly cylinder (pillar, barrel). */
  cylinder(x, y0, z, r, h, mat, opts = {}) {
    const seg = opts.segments || 8;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = V(x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r), p1 = V(x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r);
      const circ = 2 * Math.PI * r;
      const uv = [[i / seg * circ / 2, 0], [(i + 1) / seg * circ / 2, 0], [(i + 1) / seg * circ / 2, h / 2], [i / seg * circ / 2, h / 2]];
      this.quad(p1, p0, V(p0.x, y0 + h, p0.z), V(p1.x, y0 + h, p1.z), mat, { ...opts, uv });
      if (opts.cap !== false) {
        const c = V(x, y0 + h, z);
        this.quad(c, V(p1.x, y0 + h, p1.z), V(p0.x, y0 + h, p0.z), c, opts.capMat || mat, { ...opts, subdivide: false });
      }
    }
  }

  /** Sign / decal quad with its own texture (unique material). Placed vertically facing `facing` (radians, 0 = +z). */
  sign(pos, facing, w, h, texName, texOpts, opts = {}) {
    const name = '__sign' + (this._signCount++);
    this.defMat(name, { tex: [texName, texOpts], surf: opts.surf || SURF.METAL, unlit: opts.unlit, emissive: opts.emissive, alphaTest: opts.alphaTest !== undefined ? opts.alphaTest : (opts.alpha ? 0.5 : 0), transparent: false, polyOffset: true });
    this.push(pos, facing);
    const hw = w / 2;
    const off = opts.offset !== undefined ? opts.offset : 0.012;
    this.quad(V(-hw, -h / 2, off), V(hw, -h / 2, off), V(hw, h / 2, off), V(-hw, h / 2, off), name, { collide: !!opts.collide, uv: [[0, 0], [1, 0], [1, 1], [0, 1]], subdivide: opts.subdivide });
    if (opts.back) this.quad(V(hw, -h / 2, -off), V(-hw, -h / 2, -off), V(-hw, h / 2, -off), V(hw, h / 2, -off), opts.backMat || name, { collide: false, uv: opts.backMat ? undefined : [[0, 0], [1, 0], [1, 1], [0, 1]] });
    this.pop();
    return name;
  }

  /** Horizontal decal on floor (blood pools, stains). */
  floorDecal(x, y, z, size, rot, texName, texOpts) {
    const name = '__decal' + texName + JSON.stringify(texOpts || {});
    if (!this.matDefs[name]) this.defMat(name, { tex: [texName, texOpts || {}], surf: SURF.CONCRETE, alphaTest: 0.5, polyOffset: true });
    this.push([x, y + 0.01, z], rot);
    const h = size / 2;
    this.quad(V(-h, 0, h), V(h, 0, h), V(h, 0, -h), V(-h, 0, -h), name, { collide: false, uv: [[0, 0], [1, 0], [1, 1], [0, 1]], subdivide: false });
    this.pop();
  }

  // ---------- gameplay markers ----------
  light(pos, color, range, intensity = 1, opts = {}) {
    const l = { pos: V(...pos).applyMatrix4(this.matrix), color: new THREE.Color(color).multiplyScalar(intensity), range, shadows: opts.shadows !== false, flicker: opts.flicker || 0, dynamic: !!opts.dynamic, id: opts.id };
    if (opts.dynamic) this.dynLights.push(l); else this.lights.push(l);
    if (opts.flicker && !opts.dynamic) {
      // also a weak dynamic flicker component
      this.dynLights.push({ pos: l.pos.clone(), color: l.color.clone().multiplyScalar(0.35), range: range * 0.8, flicker: opts.flicker, dynamic: true, flickerOnly: true });
    }
    return l;
  }
  zone(min, max, opts) { this.zones.push({ box: new THREE.Box3(V(...min), V(...max)), ...opts }); }
  marker(type, pos, data = {}) { const m = { type, pos: V(...pos).applyMatrix4(this.matrix), ...data }; this.markers.push(m); return m; }
  trigger(min, max, data) { const t = { box: new THREE.Box3(V(...min), V(...max)), fired: false, ...data }; this.triggers.push(t); return t; }

  // ---------- build ----------
  async build(onProgress) {
    const report = async (p, msg) => { if (onProgress) { onProgress(p, msg); await new Promise((r) => setTimeout(r, 0)); } };
    await report(0.05, 'Building collision');
    // collision geometry (all)
    const colGeo = new THREE.BufferGeometry();
    colGeo.setAttribute('position', new THREE.Float32BufferAttribute(this.colPos, 3));
    colGeo.setAttribute('surf', new THREE.Uint8BufferAttribute(this.colSurf, 1));
    // bullet geometry (subset)
    const bp = [], bs = [];
    for (let i = 0; i < this.colBullet.length; i++) if (this.colBullet[i]) { bp.push(this.colPos[i * 3], this.colPos[i * 3 + 1], this.colPos[i * 3 + 2]); bs.push(this.colSurf[i]); }
    const bulGeo = new THREE.BufferGeometry();
    bulGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bulGeo.setAttribute('surf', new THREE.Uint8BufferAttribute(bs, 1));
    const moveBVH = new MeshBVH(colGeo, { maxLeafSize: 6 });
    const shootBVH = new MeshBVH(bulGeo, { maxLeafSize: 6 });
    this.colGeo = colGeo; this.bulGeo = bulGeo; this.moveBVH = moveBVH; this.shootBVH = shootBVH;

    await report(0.15, 'Baking light');
    const group = new THREE.Group();
    group.name = 'level';
    const buckets = [...this.buckets.values()];
    let total = 0; for (const b of buckets) total += b.pos.length / 3;
    let done = 0;
    for (const b of buckets) {
      const n = b.pos.length / 3;
      const def = b.def;
      if (!def.unlit) {
        for (let i = 0; i < n; i++) {
          const c = this.bakeVertex(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2], b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2], shootBVH);
          b.col[i * 3] *= c.r; b.col[i * 3 + 1] *= c.g; b.col[i * 3 + 2] *= c.b;
          done++;
          if ((done & 8191) === 0) await report(0.15 + 0.75 * done / total, 'Baking light');
        }
      } else done += n;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mat = this.makeMaterial(def);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = b.mat;
      mesh.matrixAutoUpdate = false;
      if (def.transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    await report(0.95, 'Finalising');
    this.group = group;
    return group;
  }

  /** Synchronous build for small dynamic set pieces: no collision, flat light, tint-mode materials. */
  buildSimple(light = 1) {
    const group = new THREE.Group();
    for (const b of this.buckets.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col.map((c) => c * light), 3));
      geo.computeBoundingSphere();
      const def = b.def;
      const map = def.texObj || (def.tex ? tex(def.tex[0], def.tex[1]) : null);
      const mat = createPS1Material({ map, color: def.color !== undefined ? def.color : 0xffffff, tint: !def.unlit, unlit: def.unlit, transparent: def.transparent, opacity: def.opacity, alphaTest: def.alphaTest, emissive: def.emissive, side: def.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
    }
    return group;
  }

  makeMaterial(def) {
    // def.texObj: a ready THREE.Texture (custom canvas textures), def.tex: [generatorName, opts]
    const map = def.texObj || (def.tex ? tex(def.tex[0], def.tex[1]) : null);
    const m = createPS1Material({
      map, color: def.color !== undefined ? def.color : 0xffffff, baked: !def.unlit, unlit: def.unlit,
      transparent: def.transparent, opacity: def.opacity, alphaTest: def.alphaTest, uvScroll: def.uvScroll,
      emissive: def.emissive, side: def.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (def.polyOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
    return m;
  }

  ambientAt(x, y, z) {
    for (const zn of this.zones) {
      if (zn.box.containsPoint(_p.set(x, y, z))) return zn;
    }
    return null;
  }

  // Bake lighting for a point with normal.
  bakeVertex(x, y, z, nx, ny, nz, bvh, out = new THREE.Color()) {
    const P = _p.set(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05);
    const zn = this.ambientAt(x, y, z);
    const sky = zn && zn.sky ? zn.sky : this.ambientSky;
    const ground = zn && zn.ground ? zn.ground : this.ambientGround;
    const hemi = ny * 0.5 + 0.5;
    out.setRGB(ground.r + (sky.r - ground.r) * hemi, ground.g + (sky.g - ground.g) * hemi, ground.b + (sky.b - ground.b) * hemi);
    // sky occlusion
    const rays = zn && zn.skyRays !== undefined ? zn.skyRays : this.skyRays;
    if (rays > 0) {
      let vis = 0;
      for (let i = 0; i < rays; i++) {
        const d = SKY_DIRS[i % SKY_DIRS.length];
        // bend towards normal
        _d.set(d[0] + nx * 0.6, d[1] + ny * 0.6, d[2] + nz * 0.6).normalize();
        if (_d.dot(_n2.set(nx, ny, nz)) < 0) continue;
        _ray.origin.copy(P); _ray.direction.copy(_d);
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, 60);
        if (!hit) vis += 1;
      }
      vis /= rays;
      const skyAmt = zn && zn.skyAmt !== undefined ? zn.skyAmt : 1;
      out.r += this.skyColor.r * vis * skyAmt; out.g += this.skyColor.g * vis * skyAmt; out.b += this.skyColor.b * vis * skyAmt;
    }
    // sun
    if (this.sun) {
      const sd = _d.set(...this.sun.dir).normalize();
      const ndl = nx * sd.x + ny * sd.y + nz * sd.z;
      if (ndl > 0) {
        _ray.origin.copy(P); _ray.direction.copy(sd);
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, 200);
        if (!hit) { const c = this.sun.color; out.r += c.r * ndl; out.g += c.g * ndl; out.b += c.b * ndl; }
      }
    }
    // point lights
    for (const l of this.lights) {
      const lx = l.pos.x - P.x, ly = l.pos.y - P.y, lz = l.pos.z - P.z;
      const d2 = lx * lx + ly * ly + lz * lz;
      if (d2 > l.range * l.range) continue;
      const d = Math.sqrt(d2);
      const ndl = (lx * nx + ly * ny + lz * nz) / Math.max(d, 1e-4);
      if (ndl <= -0.2) continue;
      let att = 1 - d / l.range; att *= att;
      const lam = Math.max(ndl, 0) * 0.85 + 0.15;
      if (l.shadows && d > 0.3) {
        _ray.origin.copy(P); _ray.direction.set(lx / d, ly / d, lz / d);
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, d - 0.2);
        if (hit) { att *= 0.12; }
      }
      out.r += l.color.r * att * lam; out.g += l.color.g * att * lam; out.b += l.color.b * att * lam;
    }
    out.r = Math.max(this.minLight.r, Math.min(out.r, 2.2));
    out.g = Math.max(this.minLight.g, Math.min(out.g, 2.2));
    out.b = Math.max(this.minLight.b, Math.min(out.b, 2.2));
    return out;
  }
}

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const _ray = new THREE.Ray();
const SKY_DIRS = [];
{
  // fixed hemisphere directions (golden spiral)
  const N = 12;
  for (let i = 0; i < N; i++) {
    const y = 0.15 + 0.85 * (i + 0.5) / N;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    SKY_DIRS.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
}
