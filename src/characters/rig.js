// Character rig: one smoothly skinned mesh per character, sculpted from parametric surfaces
// (lofted torso, muscled limbs, sculpted head, hands, shoes, clothing layers), with a
// per-character texture atlas (painted face with expressions, printed ID on the back).
import { BABYLON } from '../render/babylon.js';
import { BONES, BONE_PARENT, B, ROOT } from './poses.js';
import { RNG } from '../core/random.js';
import { lerp, clamp, smoothstep } from '../core/mathutil.js';
import { rigDims } from './body.js';

const V3 = BABYLON.Vector3;
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const TEX_W = 512, TEX_H = 256;
const WHITE_UV = [0.75, 0.25];
const FACE_W = 0.092, FACE_H = 0.135;      // half extents of the face projection (m)

/** Smooth interpolation through keyed rows [x, a, b, c...] (Catmull-Rom). */
function interp(keys, x, col) {
  if (x <= keys[0][0]) return keys[0][col];
  const n = keys.length;
  if (x >= keys[n - 1][0]) return keys[n - 1][col];
  let i = 0;
  while (i < n - 2 && keys[i + 1][0] < x) i++;
  const p0 = keys[Math.max(0, i - 1)][col], p1 = keys[i][col], p2 = keys[i + 1][col], p3 = keys[Math.min(n - 1, i + 2)][col];
  const t = (x - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const se = (v, n) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n); // superellipse shaping
const gauss = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));

export { rigDims };

/** Vertex accumulator with up to two bone influences per vertex. */
class SkinGeo {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.bi = []; this.bw = []; }
  vert(p, n, uv, c, w) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); this.col.push(c[0], c[1], c[2], 1);
    const a = w[0] || [0, 1], b = w[1] || [0, 0];
    this.bi.push(a[0], b[0], 0, 0); this.bw.push(a[1], b[1], 0, 0);
    return this.pos.length / 3 - 1;
  }
  /**
   * Parametric grid patch. fn(s,t)->[x,y,z]. Normals from central differences of fn (so split
   * patches share identical normals along their seams). `flip` reverses the facing.
   * weights(s,t,p)->[[bone,w],[bone,w]]; color(s,t,p)->rgb; uv(s,t,p)->[u,v]|null.
   * include(sMid,tMid)->bool lets a patch skip quads (hairlines, face caps).
   */
  patch(o) {
    const { fn, s0, s1, t0, t1, sSeg, tSeg } = o;
    const es = (s1 - s0) * 1e-3 + 1e-5, et = (t1 - t0) * 1e-3 + 1e-5;
    const grid = [];
    let cx = 0, cy = 0, cz = 0, cn = 0;
    for (let j = 0; j <= tSeg; j++) {
      const row = [];
      for (let i = 0; i <= sSeg; i++) {
        const s = s0 + (s1 - s0) * (i / sSeg), t = t0 + (t1 - t0) * (j / tSeg);
        const p = fn(s, t);
        // Central differences inside the domain, one-sided at the edges.
        const sLo = o.wrapS ? s - es : Math.max(Math.min(s0, s1), s - es), sHi = o.wrapS ? s + es : Math.min(Math.max(s0, s1), s + es);
        const tLo = Math.max(Math.min(t0, t1), t - et), tHi = Math.min(Math.max(t0, t1), t + et);
        const ps1 = fn(sHi, t), ps0 = fn(sLo, t), pt1 = fn(s, tHi), pt0 = fn(s, tLo);
        const ax = ps1[0] - ps0[0], ay = ps1[1] - ps0[1], az = ps1[2] - ps0[2];
        const bx = pt1[0] - pt0[0], by = pt1[1] - pt0[1], bz = pt1[2] - pt0[2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        row.push({ p, n: [nx, ny, nz], s, t });
        cx += p[0]; cy += p[1]; cz += p[2]; cn++;
      }
      grid.push(row);
    }
    // Orientation: make normals point away from `center` (default: centroid of the patch) and
    // pick the triangle winding that matches, so every patch faces outward.
    const ref = o.center || [cx / cn, cy / cn, cz / cn];
    let vote = 0;
    for (let j = 0; j <= tSeg; j += Math.max(1, tSeg >> 2)) for (let i = 0; i <= sSeg; i += Math.max(1, sSeg >> 2)) {
      const g = grid[j][i];
      vote += g.n[0] * (g.p[0] - ref[0]) + g.n[1] * (g.p[1] - ref[1]) + g.n[2] * (g.p[2] - ref[2]);
    }
    const flip = o.orient ? o.orient < 0 : vote < 0;
    for (const row of grid) for (const g of row) {
      let [nx, ny, nz] = g.n;
      if (flip) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 1e-14) || !Number.isFinite(nl)) {
        const d = [g.p[0] - ref[0], g.p[1] - ref[1], g.p[2] - ref[2]]; const dl = Math.hypot(...d) || 1;
        g.n = [d[0] / dl, d[1] / dl, d[2] / dl];
      } else g.n = [nx / nl, ny / nl, nz / nl];
    }
    const cache = new Map();
    const vid = (i, j, faceKey) => {
      const key = `${i},${j},${faceKey}`;
      if (cache.has(key)) return cache.get(key);
      const g = grid[j][i];
      const uvfn = o.uv && faceKey === 1 ? o.uv : null;
      const uv = uvfn ? uvfn(g.s, g.t, g.p) : WHITE_UV;
      const col = faceKey === 1 && o.uvColor ? o.uvColor : (typeof o.color === 'function' ? o.color(g.s, g.t, g.p) : o.color);
      const w = typeof o.weights === 'function' ? o.weights(g.s, g.t, g.p) : o.weights;
      const id = this.vert(g.p, g.n, uv, col, w);
      cache.set(key, id);
      return id;
    };
    for (let j = 0; j < tSeg; j++) for (let i = 0; i < sSeg; i++) {
      const sm = (grid[j][i].s + grid[j][i + 1].s) / 2, tm = (grid[j][i].t + grid[j + 1][i].t) / 2;
      if (o.include && !o.include(sm, tm)) continue;
      const fk = o.uvRegion && o.uvRegion(sm, tm, [grid[j][i].p, grid[j][i + 1].p, grid[j + 1][i + 1].p, grid[j + 1][i].p]) ? 1 : 0;
      const a = vid(i, j, fk), b = vid(i + 1, j, fk), c = vid(i + 1, j + 1, fk), d = vid(i, j + 1, fk);
      if (flip) this.idx.push(a, c, d, a, b, c); else this.idx.push(a, d, c, a, c, b);
    }
  }
}

export class CharacterRig {
  constructor(scene, app, name = 'char') {
    this.scene = scene;
    this.app = app;
    this.d = rigDims(app);
    this.expression = 'neutral';
    this.mouthOpen = false;
    this.blinking = false;
    this._build(name);
  }

  _build(name) {
    const { scene, d } = this;
    const sk = new BABYLON.Skeleton(`${name}_sk`, `${name}_sk`, scene);
    this.rest = d.rest;
    this.abs = [];
    this.bones = [];
    BONES.forEach((n, i) => {
      const parent = BONE_PARENT[i] >= 0 ? this.bones[BONE_PARENT[i]] : null;
      const r = this.rest[i];
      this.bones.push(new BABYLON.Bone(n, sk, parent, BABYLON.Matrix.Translation(r[0], r[1], r[2])));
      const pa = BONE_PARENT[i] >= 0 ? this.abs[BONE_PARENT[i]] : [0, 0, 0];
      this.abs.push([pa[0] + r[0], pa[1] + r[1], pa[2] + r[2]]);
    });
    this.skeleton = sk;
    const g = new SkinGeo();
    this._body(g);
    const mesh = new BABYLON.Mesh(name, scene);
    const vd = new BABYLON.VertexData();
    vd.positions = new Float32Array(g.pos); vd.normals = new Float32Array(g.nrm); vd.uvs = new Float32Array(g.uv);
    vd.colors = new Float32Array(g.col); vd.indices = new Uint32Array(g.idx);
    vd.matricesIndices = new Float32Array(g.bi); vd.matricesWeights = new Float32Array(g.bw);
    vd.applyToMesh(mesh);
    mesh.skeleton = sk;
    mesh.numBoneInfluencers = 2;
    mesh.isPickable = false;
    // A fixed local box generous enough for any pose (lying, reaching, being thrown). It must stay
    // synced to the world matrix: with doNotSyncBoundingInfo the world box never follows the
    // character, so culling tests where they first stood and people vanish on screen.
    mesh.setBoundingInfo(new BABYLON.BoundingInfo(new V3(-1.3, -0.4, -1.3), new V3(1.3, 2.4, 1.3)));
    mesh.rotationQuaternion = null;
    this.vertexCount = g.pos.length / 3;
    this.tex = new BABYLON.DynamicTexture(`${name}_tex`, { width: TEX_W, height: TEX_H }, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    this.tex.hasAlpha = false;
    this.tex.anisotropicFilteringLevel = 4;
    this.ctx = this.tex.getContext();
    this._paintAtlas();
    const mat = new BABYLON.StandardMaterial(`${name}_mat`, scene);
    mat.diffuseTexture = this.tex;
    mat.specularColor = new BABYLON.Color3(0.09, 0.085, 0.08);
    mat.specularPower = 18;
    mat.emissiveColor = new BABYLON.Color3(0.04, 0.035, 0.03);
    mesh.material = mat;
    this.mesh = mesh; this.material = mat;
    this._m = new BABYLON.Matrix(); this._q = new BABYLON.Quaternion(); this._s = new V3(1, 1, 1); this._t = new V3();
  }

  // ===================================================================================== body
  /** Torso cross-section half-sizes at relative height r (fraction of H above the hips). */
  _torsoShape(r) {
    const { d, app } = this;
    const g = d.g, m = d.m, f = d.f, belly = app.build.belly;
    // y, halfWidth, frontDepth, backDepth, zOffset, superellipse n
    const K = [
      [-0.1, 0.1, 0.08, 0.085, 0, 2.2], [-0.065, 0.152, 0.095, 0.105, 0, 2.4], [0.0, 0.176, 0.1, 0.118, -0.006, 2.5],
      [0.08, 0.166, 0.097, 0.104, 0, 2.5], [0.18, 0.151, 0.096, 0.092, 0.005, 2.4], [0.28, 0.157, 0.106, 0.093, 0.008, 2.4],
      [0.37, 0.176, 0.12, 0.099, 0.01, 2.5], [0.45, 0.188, 0.116, 0.101, 0.008, 2.6], [0.5, 0.18, 0.099, 0.095, 0, 2.5],
      [0.535, 0.142, 0.078, 0.085, -0.008, 2.3], [0.565, 0.08, 0.056, 0.064, -0.006, 2.1], [0.6, 0.056, 0.05, 0.052, 0, 2.0],
      [0.66, 0.052, 0.048, 0.05, 0.006, 2.0], [0.7, 0.05, 0.046, 0.048, 0.008, 2.0],
    ];
    let W = interp(K, r, 1), Df = interp(K, r, 2), Db = interp(K, r, 3);
    const cz = interp(K, r, 4), n = interp(K, r, 5);
    if (f) {
      W += 0.024 * gauss(r, 0, 0.06, 1) - 0.016 * gauss(r - 0.19, 0, 0.05, 1) - 0.022 * smoothstep(0.38, 0.5, r) * (1 - smoothstep(0.53, 0.57, r));
      Df += 0.026 * gauss(r - 0.39, 0, 0.04, 1);
    }
    Df += belly * 0.085 * gauss(r - 0.17, 0, 0.09, 1); W += belly * 0.045 * gauss(r - 0.15, 0, 0.12, 1); Db += belly * 0.02 * gauss(r - 0.15, 0, 0.1, 1);
    Df += m * 0.014 * gauss(r - 0.38, 0, 0.05, 1); W += m * 0.02 * gauss(r - 0.48, 0, 0.04, 1); Db += m * 0.012 * gauss(r - 0.45, 0, 0.06, 1);
    const neckK = smoothstep(0.55, 0.6, r);
    const gs = lerp(g, 0.55 + 0.45 * g, neckK);
    return { W: W * gs, Df: Df * gs, Db: Db * gs, cz, n };
  }
  /** Torso surface point for angle a (0 = front, increasing toward +x/right) at relative height r. */
  _torso(a, r) {
    const { d } = this;
    const s = this._torsoShape(r);
    const sa = Math.sin(a), ca = Math.cos(a);
    const x = s.W * se(sa, s.n);
    const z = s.cz + (ca >= 0 ? s.Df : s.Db) * se(ca, s.n);
    return [x, d.hipH + r * d.H, z];
  }
  _torsoWeights(r) {
    const blend = (b1, b2, t) => [[b1, 1 - t], [b2, t]];
    if (r < 0.03) return [[B.hips, 1]];
    if (r < 0.13) return blend(B.hips, B.spine, smoothstep(0.03, 0.13, r));
    if (r < 0.2) return [[B.spine, 1]];
    if (r < 0.32) return blend(B.spine, B.chest, smoothstep(0.2, 0.32, r));
    if (r < 0.54) return [[B.chest, 1]];
    if (r < 0.61) return blend(B.chest, B.neck, smoothstep(0.54, 0.61, r));
    return blend(B.neck, B.head, smoothstep(0.62, 0.7, r) * 0.6);
  }

  _body(g) {
    const { app, d } = this;
    const skin = hexRGB(app.skin), shirt = hexRGB(app.shirt), pants = hexRGB(app.pants), shoes = hexRGB(app.shoes);
    const under = hexRGB(app.undershirt);
    const isGuard = app.outfitKey === 'guard', isWarden = app.outfitKey === 'warden', isInmate = app.outfitKey.startsWith('inmate') || app.outfitKey === 'solitary';
    const tank = app.sleeves === 'tank';
    const torsoTop = tank ? under : shirt;
    const waistR = 0.085;                      // shirt/pants boundary (relative height)
    const neckR = 0.556;                       // collar line
    const TS = 22;
    const torsoPatch = (r0, r1, color, extra = {}) => g.patch({
      fn: (a, r) => this._torso(a, r), s0: 0, s1: Math.PI * 2, wrapS: true, sSeg: TS, t0: r0, t1: r1, tSeg: Math.max(2, Math.round((r1 - r0) / 0.035)),
      weights: (a, r) => this._torsoWeights(r), color, ...extra,
    });
    // Torso: pants (hips), shirt (chest), skin (neck). Back print region gets its own UVs.
    torsoPatch(-0.1, waistR, pants);
    const printTop = 0.5, printBot = 0.33, printA = 0.62;
    torsoPatch(waistR, neckR, torsoTop, isInmate ? {
      uvRegion: (a, r) => Math.abs(a - Math.PI) < printA && r > printBot && r < printTop,
      uv: (a, r) => [0.75 - ((a - Math.PI) / printA) * 0.25 * 0.98, 0.75 + ((r - (printBot + printTop) / 2) / ((printTop - printBot) / 2)) * 0.24],
      uvColor: [1, 1, 1],
    } : {});
    torsoPatch(neckR, 0.7, skin);
    // Waistband / belt and shirt hem layered slightly outside the body.
    const ring = (r0, r1, pad, color, aSkip = null) => g.patch({
      fn: (a, r) => { const p = this._torso(a, r); const s = this._torsoShape(r); const k = 1 + pad / Math.max(0.05, s.W); return [p[0] * k, p[1], (p[2] - s.cz) * k + s.cz]; },
      s0: 0, s1: Math.PI * 2, sSeg: TS, t0: r0, t1: r1, tSeg: 2, weights: (a, r) => this._torsoWeights(r), color,
      include: aSkip ? (a) => !aSkip(a) : null,
    });
    if (isGuard || isWarden) ring(0.045, 0.085, 0.006, [0.09, 0.08, 0.07]);
    else ring(waistR - 0.004, waistR + 0.03, 0.005, torsoTop);
    // Collar: inmates/guards get a folded collar with a V opening showing the undershirt.
    if (!tank) {
      ring(neckR - 0.012, neckR + 0.022, 0.008, isWarden ? [0.93, 0.93, 0.9] : shirt, (a) => Math.abs(a) < 0.45 || Math.abs(a - Math.PI * 2) < 0.45);
      // Undershirt V
      g.patch({
        fn: (a, r) => { const p = this._torso(a, r); return [p[0] * 1.004, p[1], p[2] + 0.002]; },
        s0: -0.42, s1: 0.42, sSeg: 6, t0: 0.49, t1: neckR + 0.004, tSeg: 3, center: [0, d.hipH + 0.5 * d.H, 0], weights: (a, r) => this._torsoWeights(r),
        color: isWarden ? [0.93, 0.93, 0.9] : isGuard ? [0.88, 0.88, 0.85] : under,
        include: (a, r) => Math.abs(a) < 0.42 * smoothstep(0.47, neckR, r) + 0.05,
      });
    }
    // Arms ----------------------------------------------------------------------------------
    for (const side of ['L', 'R']) this._arm(g, side, { skin, sleeve: torsoTop, tank, isGuard, isWarden });
    // Legs ----------------------------------------------------------------------------------
    for (const side of ['L', 'R']) this._leg(g, side, { pants, shoes, skin });
    // Clothing details -----------------------------------------------------------------------
    if (isGuard) {
      const badge = this._torso(-0.42, 0.42);
      this._box(g, B.chest, [badge[0], badge[1], badge[2] + 0.006], [0.045, 0.055, 0.008], [0.86, 0.7, 0.26]);
      const tag = this._torso(0.45, 0.43);
      this._box(g, B.chest, [tag[0], tag[1], tag[2] + 0.005], [0.06, 0.016, 0.006], [0.92, 0.92, 0.9]);
      for (const sx of [-1, 1]) { const pk = this._torso(sx * 0.42, 0.37); this._box(g, B.chest, [pk[0], pk[1], pk[2] + 0.004], [0.07, 0.065, 0.006], shade(shirt, 0.82)); }
      const hol = this._torso(1.3, 0.06); this._box(g, B.hips, [hol[0] + 0.02, hol[1] - 0.03, hol[2]], [0.035, 0.11, 0.06], [0.1, 0.1, 0.1]);
      const radio = this._torso(-1.4, 0.07); this._box(g, B.hips, [radio[0] - 0.015, radio[1], radio[2]], [0.03, 0.08, 0.05], [0.15, 0.15, 0.15]);
    }
    if (isWarden) {
      // Tie and lapels
      g.patch({ fn: (a, r) => { const p = this._torso(a, r); return [p[0], p[1], p[2] + 0.006]; }, s0: -0.07, s1: 0.07, sSeg: 2, t0: 0.27, t1: neckR - 0.01, tSeg: 5, center: [0, d.hipH + 0.4 * d.H, 0],
        weights: (a, r) => this._torsoWeights(r), color: [0.58, 0.1, 0.09], include: (a, r) => Math.abs(a) < 0.03 + 0.05 * smoothstep(0.27, 0.36, r) - 0.03 * smoothstep(0.5, 0.55, r) },
      );
      for (const sx of [-1, 1]) g.patch({ fn: (a, r) => { const p = this._torso(a, r); return [p[0] * 1.01, p[1], p[2] + 0.008]; }, s0: sx > 0 ? 0.12 : -0.55, s1: sx > 0 ? 0.55 : -0.12, sSeg: 4, t0: 0.3, t1: 0.53, tSeg: 4, center: [0, d.hipH + 0.42 * d.H, 0],
        weights: (a, r) => this._torsoWeights(r), color: shade(shirt, 0.75), include: (a, r) => Math.abs(a) > 0.1 + 0.32 * smoothstep(0.3, 0.53, r) && Math.abs(a) < 0.55 });
    }
    if (app.bandana) {
      const c = hexRGB(app.bandana), arm = this.abs[B.armL];
      g.patch({ fn: (a, t) => [arm[0] + Math.sin(a) * 0.066 * (1 + d.m * 0.3), arm[1] - t, arm[2] + Math.cos(a) * 0.068 * (1 + d.m * 0.3)], s0: 0, s1: Math.PI * 2, sSeg: 12, t0: 0.06, t1: 0.11, tSeg: 1, weights: [[B.armL, 1]], color: c, flip: true });
    }
    this._head(g, skin);
  }

  _box(g, bone, c, size, color) {
    const [w, h, dd] = size.map((v) => v / 2);
    const faces = [[[0, 0, 1], [[w, -h, dd], [-w, -h, dd], [-w, h, dd], [w, h, dd]]], [[0, 0, -1], [[-w, -h, -dd], [w, -h, -dd], [w, h, -dd], [-w, h, -dd]]],
      [[1, 0, 0], [[w, -h, -dd], [w, -h, dd], [w, h, dd], [w, h, -dd]]], [[-1, 0, 0], [[-w, -h, dd], [-w, -h, -dd], [-w, h, -dd], [-w, h, dd]]],
      [[0, 1, 0], [[-w, h, dd], [w, h, dd], [w, h, -dd], [-w, h, -dd]]], [[0, -1, 0], [[-w, -h, -dd], [w, -h, -dd], [w, -h, dd], [-w, -h, dd]]]];
    for (const [n, cs] of faces) {
      const ids = cs.map((q) => g.vert([c[0] + q[0], c[1] + q[1], c[2] + q[2]], n, WHITE_UV, color, [[bone, 1]]));
      g.idx.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
    }
  }

  /** Arm as one tube from inside the shoulder to the wrist, plus a sculpted hand. */
  _arm(g, side, o) {
    const { d, app } = this;
    const k = side === 'R' ? 1 : -1;
    const a = this.abs[B['arm' + side]];
    const ms = 1 + d.m * 0.32, gs = 0.85 + d.g * 0.15 + (d.f ? -0.06 : 0);
    const U = d.upperArm, F = d.foreArm, L = U + F;
    // dist from shoulder joint, rx (side), rz (front-back), z offset
    const K = [[-0.04, 0.05, 0.052, 0], [0.0, 0.058, 0.06, 0], [0.05, 0.057, 0.058, 0.002], [0.12, 0.05, 0.054, 0.004], [0.2 * U / 0.29, 0.045, 0.05, 0.004],
      [U - 0.03, 0.039, 0.041, 0], [U, 0.036, 0.038, -0.002], [U + 0.04, 0.042, 0.044, 0.002], [U + 0.1, 0.039, 0.04, 0.002], [L - 0.06, 0.031, 0.027, 0], [L, 0.027, 0.022, 0]];
    const fn = (ang, dist) => {
      const rx = interp(K, dist, 1) * gs * ms, rz = interp(K, dist, 2) * gs * ms, oz = interp(K, dist, 3);
      return [a[0] + Math.sin(ang) * rx, a[1] - dist, a[2] + oz + Math.cos(ang) * rz];
    };
    const W = (ang, dist) => {
      if (dist < 0.025) { const t = smoothstep(-0.04, 0.025, dist); return [[B['arm' + side], 0.55 + 0.45 * t], [B.chest, 0.45 - 0.45 * t]]; }
      if (dist < U - 0.035) return [[B['arm' + side], 1]];
      if (dist < U + 0.035) { const t = smoothstep(U - 0.035, U + 0.035, dist); return [[B['arm' + side], 1 - t], [B['fore' + side], t]]; }
      return [[B['fore' + side], 1]];
    };
    const sleeveEnd = o.tank ? -0.04 : app.sleeves === 'long' ? L - 0.03 : 0.155;
    const seg = 12;
    const part = (t0, t1, color) => { if (t1 > t0) g.patch({ fn, s0: 0, s1: Math.PI * 2, sSeg: seg, t0, t1, tSeg: Math.max(2, Math.round((t1 - t0) / 0.035)), weights: W, color, flip: true }); };
    part(-0.04, sleeveEnd, o.sleeve);
    part(sleeveEnd, L, o.skin);
    if (!o.tank) {
      // Sleeve cuff
      const cuffAt = sleeveEnd;
      g.patch({ fn: (ang, dist) => { const p = fn(ang, dist); const c = fn(ang + Math.PI, dist); const mx = (p[0] + c[0]) / 2, mz = (p[2] + c[2]) / 2; return [mx + (p[0] - mx) * 1.09, p[1], mz + (p[2] - mz) * 1.09]; },
        s0: 0, s1: Math.PI * 2, sSeg: seg, t0: cuffAt - 0.035, t1: cuffAt + 0.004, tSeg: 2, weights: W, color: shade(o.sleeve, 0.92), flip: true });
    }
    if (app.tattoo && side === 'R' && app.sleeves !== 'long') {
      g.patch({ fn: (ang, dist) => { const p = fn(ang, dist); const c = fn(ang + Math.PI, dist); const mx = (p[0] + c[0]) / 2, mz = (p[2] + c[2]) / 2; return [mx + (p[0] - mx) * 1.012, p[1], mz + (p[2] - mz) * 1.012]; },
        s0: -0.9, s1: 0.9, sSeg: 5, t0: U + 0.07, t1: U + 0.15, tSeg: 2, weights: W, color: shade(o.skin, 0.52), flip: true });
    }
    this._hand(g, side, o.skin);
  }

  _hand(g, side, skin) {
    const { d } = this;
    const k = side === 'R' ? 1 : -1;
    const h = this.abs[B['hand' + side]];
    const sc = d.H * (d.f ? 0.92 : 1) * (0.92 + d.g * 0.08);
    const bone = [[B['hand' + side], 1]];
    // Palm + curled fingers as one lofted mitt along -y, plus a thumb.
    const K = [[0, 0.016, 0.03, 0], [0.02, 0.016, 0.036, 0.002], [0.055, 0.017, 0.04, 0.004], [0.08, 0.02, 0.041, 0.004], [0.1, 0.02, 0.037, 0.002], [0.115, 0.012, 0.03, -0.002]];
    const fn = (ang, dist) => {
      const dd = dist * sc;
      const rx = interp(K, dist, 1) * sc, rz = interp(K, dist, 2) * sc, oz = interp(K, dist, 3) * sc;
      const curl = smoothstep(0.065, 0.115, dist) * 0.012 * sc;
      return [h[0] + Math.sin(ang) * rx - k * curl, h[1] - dd + 0.004, h[2] + oz + Math.cos(ang) * rz];
    };
    g.patch({ fn, s0: 0, s1: Math.PI * 2, sSeg: 10, t0: 0, t1: 0.115, tSeg: 5, weights: bone, color: skin, flip: true, center: [h[0], h[1] - 0.06, h[2]] });
    // Thumb
    const tb = [h[0] - k * 0.012 * sc, h[1] - 0.03 * sc, h[2] + 0.028 * sc];
    g.patch({ fn: (ang, t) => { const r = (0.011 - t * 0.003) * sc; const cx = tb[0] - k * 0.004 * t, cy = tb[1] - 0.045 * t * sc, cz = tb[2] + 0.012 * t * sc; return [cx + Math.sin(ang) * r, cy, cz + Math.cos(ang) * r]; },
      s0: 0, s1: Math.PI * 2, sSeg: 7, t0: 0, t1: 1, tSeg: 3, weights: bone, color: skin, flip: true });
  }

  _leg(g, side, o) {
    const { d, app } = this;
    const t = this.abs[B['thigh' + side]];
    const ms = 1 + d.m * 0.18, gs = d.g * (d.f ? 1.03 : 1), belly = app.build.belly;
    const T = d.thigh, S = d.shin, L = T + S;
    const K = [[-0.07, 0.088, 0.098, 0], [0.0, 0.09, 0.095, 0], [0.09, 0.085, 0.088, 0.003], [0.22, 0.072, 0.075, 0.004], [T - 0.07, 0.058, 0.06, 0.004],
      [T, 0.053, 0.056, 0.006], [T + 0.06, 0.054, 0.058, -0.006], [T + 0.14, 0.055, 0.062, -0.014], [T + 0.26, 0.043, 0.047, -0.006], [L - 0.04, 0.036, 0.038, 0], [L, 0.035, 0.036, 0]];
    const fn = (ang, dist) => {
      const rx = interp(K, dist, 1) * gs * ms * (1 + belly * 0.06), rz = interp(K, dist, 2) * gs * ms, oz = interp(K, dist, 3);
      const inward = dist < 0.05 ? (side === 'R' ? -1 : 1) * 0.008 * smoothstep(0.05, -0.07, dist) : 0;
      return [t[0] + inward + Math.sin(ang) * rx, t[1] - dist, t[2] + oz + Math.cos(ang) * rz];
    };
    const W = (ang, dist) => {
      if (dist < 0.05) { const k = smoothstep(-0.07, 0.05, dist); return [[B['thigh' + side], 0.5 + 0.5 * k], [B.hips, 0.5 - 0.5 * k]]; }
      if (dist < T - 0.04) return [[B['thigh' + side], 1]];
      if (dist < T + 0.04) { const k = smoothstep(T - 0.04, T + 0.04, dist); return [[B['thigh' + side], 1 - k], [B['shin' + side], k]]; }
      return [[B['shin' + side], 1]];
    };
    g.patch({ fn, s0: 0, s1: Math.PI * 2, sSeg: 12, t0: -0.07, t1: L - 0.02, tSeg: 20, weights: W, color: o.pants, flip: true });
    // Pant hem over the shoe
    g.patch({ fn: (ang, dist) => { const p = fn(ang, dist); return [t[0] + (p[0] - t[0]) * 1.12, p[1], t[2] + (p[2] - t[2]) * 1.12]; }, s0: 0, s1: Math.PI * 2, sSeg: 12, t0: L - 0.06, t1: L - 0.015, tSeg: 2, weights: W, color: shade(o.pants, 0.9), flip: true });
    this._shoe(g, side, o.shoes);
  }

  _shoe(g, side, color) {
    const { d } = this;
    const f = this.abs[B['foot' + side]];
    const bone = [[B['foot' + side], 1]];
    const sc = d.H * (d.f ? 0.92 : 1) * (0.94 + d.g * 0.06);
    const floor = f[1] - d.footH;
    // z, half-width, height
    const K = [[-0.075, 0.032, 0.085], [-0.05, 0.043, 0.095], [0.0, 0.046, 0.085], [0.06, 0.05, 0.066], [0.12, 0.052, 0.05], [0.16, 0.044, 0.04], [0.185, 0.026, 0.03]];
    const fn = (ang, z) => {
      const w = interp(K, z, 1) * sc, h = interp(K, z, 2) * sc;
      const sa = Math.sin(ang), ca = Math.cos(ang);
      return [f[0] + w * se(sa, 2.6), floor + h / 2 + (h / 2) * se(ca, 2.6), f[2] + z * sc];
    };
    const sole = shade(color, 0.45), base = color;
    const col = (ang, z, p) => (p[1] < floor + 0.016 * sc ? (base[0] > 0.7 ? [0.25, 0.25, 0.25] : [0.92, 0.92, 0.9]) : base);
    void sole;
    g.patch({ fn, s0: 0, s1: Math.PI * 2, sSeg: 12, t0: -0.075, t1: 0.185, tSeg: 9, weights: bone, color: col, center: [f[0], floor + 0.04, f[2] + 0.05] });
    // End caps (heel and toe)
    for (const [z, fl] of [[-0.075, true], [0.185, false]]) {
      g.patch({ fn: (ang, r) => { const p = fn(ang, z); const c = [f[0], floor + interp(K, z, 2) * sc / 2, f[2] + z * sc]; return [lerp(c[0], p[0], r), lerp(c[1], p[1], r), lerp(c[2], p[2], r) + (fl ? -0.004 : 0.004) * (1 - r)]; },
        s0: 0, s1: Math.PI * 2, sSeg: 12, t0: 0, t1: 1, tSeg: 2, weights: bone, color: col, center: [f[0], floor + 0.04, f[2] + 0.05] });
    }
  }

  // ===================================================================================== head
  _headPoint(dx, dy, dz) {
    const { d } = this;
    const hs = d.head;
    let rx = 0.082, ry = dy > 0 ? 0.118 : 0.125, rz = dz > 0 ? 0.1 : 0.106;
    let x = dx * rx, y = dy * ry, z = dz * rz;
    const jaw = smoothstep(-0.08, -0.95, dy);
    x *= 1 - 0.36 * jaw;
    if (dz > 0) z *= 1 - 0.06 * jaw; else z *= 1 - 0.55 * jaw;
    if (dz > 0.3) z += 0.011 * smoothstep(-0.65, -0.9, dy) * smoothstep(0.3, 0.9, dz);               // chin
    x *= 1 + 0.035 * gauss(Math.abs(dx) - 0.75, dy + 0.15, 0.2, 0.2) * (dz > 0 ? 1 : 0.3);        // cheekbones
    if (dz > 0.55) z -= 0.007 * smoothstep(0.55, 1, dz) * (1 - Math.abs(dy));                        // flatter face
    z += 0.0065 * gauss(dx, dy - 0.24, 0.45, 0.07) * smoothstep(0.7, 0.95, dz);                      // brow ridge
    z -= 0.0055 * (gauss(dx - 0.36, dy - 0.03, 0.13, 0.08) + gauss(dx + 0.36, dy - 0.03, 0.13, 0.08)) * smoothstep(0.6, 0.9, dz); // sockets
    if (dz < -0.25 && dy > -0.3) z *= 1.05;                                                          // occiput
    y *= 1 - 0.04 * smoothstep(0.8, 1, dy);
    const c = this.headCenter;
    return [c[0] + x * hs, c[1] + y * hs, c[2] + z * hs];
  }
  _headDir(th, ph) { return [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)]; }

  _head(g, skin) {
    const { app, d } = this;
    const hb = this.abs[B.head];
    this.headCenter = [0, hb[1] + 0.074 * d.H, 0.012];
    const head = [[B.head, 1]];
    const fn = (th, ph) => { const [x, y, z] = this._headDir(th, ph); return this._headPoint(x, y, z); };
    const c = this.headCenter, hs = d.head;
    // Face cap: quads whose positions fall inside the projection window get face UVs.
    const inFace = (pts) => pts.every((p) => Math.abs(p[0] - c[0]) < FACE_W * 0.97 * hs && Math.abs(p[1] - c[1]) < FACE_H * 0.97 * hs && p[2] - c[2] > 0.02 * hs);
    g.patch({
      fn, s0: 0, s1: Math.PI * 2, sSeg: 26, t0: 0.001, t1: Math.PI - 0.001, tSeg: 20, weights: head, color: skin, flip: true, center: c,
      uvRegion: (s, t, pts) => inFace(pts),
      uv: (s, t, p) => [0.25 - ((p[0] - c[0]) / (FACE_W * hs)) * 0.25, 0.5 + ((p[1] - c[1]) / (FACE_H * hs)) * 0.5],
      uvColor: [1, 1, 1],
    });
    // Nose: small lofted wedge from the bridge to the tip.
    const ns = app.noseSize * hs;
    const nb = this._headPoint(0, 0.02, 1), nt = this._headPoint(0, -0.3, 1);
    g.patch({
      fn: (a, t) => {
        const tt = Math.max(0, Math.min(1, t)); const w = lerp(0.006, 0.0155, Math.pow(tt, 1.4)) * ns, depth = lerp(0.004, 0.02, Math.pow(tt, 0.9)) * ns;
        const y = lerp(nb[1], nt[1] + 0.002, t), zb = lerp(nb[2], nt[2], t) - 0.006;
        const tip = t > 0.85 ? smoothstep(0.85, 1, t) : 0;
        return [Math.sin(a) * w * (1 - tip * 0.25), y + tip * 0.004 * (1 - Math.abs(Math.cos(a))), zb + Math.max(0, Math.cos(a)) * depth * (1 - tip * 0.35)];
      },
      s0: -Math.PI / 2, s1: Math.PI / 2, sSeg: 6, t0: 0, t1: 1, tSeg: 5, weights: head, color: shade(skin, 0.97), center: c,
    });
    // Ears
    for (const sx of [-1, 1]) {
      const e = this._headPoint(sx * 0.99, -0.05, -0.08);
      const es = app.earSize * hs;
      g.patch({ fn: (a, b) => [e[0] + sx * (0.009 + Math.cos(b) * 0.007) * es, e[1] + Math.sin(a) * Math.sin(b) * 0.032 * es, e[2] + Math.cos(a) * Math.sin(b) * 0.022 * es - 0.004],
        s0: 0, s1: Math.PI * 2, sSeg: 8, t0: 0.01, t1: Math.PI - 0.01, tSeg: 4, weights: head, color: shade(skin, 0.93), flip: sx < 0, center: e });
    }
    this._hair(g, fn);
    this._facialHair(g);
    this._headwear(g, fn);
  }

  _hair(g, fn) {
    const { app, d } = this;
    const st = app.hair.style;
    if (st === 'bald') return;
    const hc = hexRGB(app.hair.color);
    const c = this.headCenter, hs = d.head;
    const head = [[B.head, 1]];
    // Shell over the sculpted head; `cover(dx,dy,dz)` decides which part of the scalp has hair.
    const shell = (pad, cover, seg = 30, rings = 22, lift = 0) => g.patch({
      fn: (th, ph) => {
        const [x, y, z] = this._headDir(th, ph);
        const p = this._headPoint(x, y, z);
        const k = 1 + pad / 0.1;
        return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k + lift * Math.max(0, y), c[2] + (p[2] - c[2]) * k];
      },
      s0: 0, s1: Math.PI * 2, sSeg: seg, t0: 0.001, t1: Math.PI * 0.82, tSeg: rings, weights: head, color: hc, flip: true, center: c,
      include: (th, ph) => { const [x, y, z] = this._headDir(th, ph); return cover(x, y, z); },
    });
    // Hairline: above the forehead and the ears, down the back to the nape.
    const base = (x, y, z, front = 0.42, side = 0.05, nape = -0.42) => {
      if (z > 0.55) return y > front + (Math.abs(x) * 0.25);
      if (z > -0.2) return y > side - (z < 0.2 ? 0 : 0.1) && !(Math.abs(x) > 0.85 && y < 0.3 && y > -0.35);
      return y > nape;
    };
    const r = new RNG(app.seed + 21);
    if (st === 'buzz') shell(0.004, (x, y, z) => base(x, y, z, 0.45));
    else if (st === 'short') shell(0.011, (x, y, z) => base(x, y, z, 0.38), 30, 22, 0.01);
    else if (st === 'slick') shell(0.013, (x, y, z) => base(x, y, z, 0.45, 0.05, -0.5), 30, 22, 0.014);
    else if (st === 'curly') { shell(0.018, (x, y, z) => base(x, y, z, 0.36), 30, 22, 0.012); for (let i = 0; i < 14; i++) { const th = r.range(0, Math.PI * 2), ph = r.range(0.15, 1.2); const [x, y, z] = this._headDir(th, ph); if (!base(x, y, z, 0.4)) continue; const p = this._headPoint(x, y, z); this._blob(g, [c[0] + (p[0] - c[0]) * 1.2, c[1] + (p[1] - c[1]) * 1.18, c[2] + (p[2] - c[2]) * 1.2], 0.03 * hs, hc); } }
    else if (st === 'afro') g.patch({ fn: (th, ph) => { const [x, y, z] = this._headDir(th, ph); return [c[0] + x * 0.135 * hs, c[1] + 0.045 * hs + y * 0.13 * hs, c[2] - 0.012 + z * 0.13 * hs]; }, s0: 0, s1: Math.PI * 2, sSeg: 22, t0: 0.001, t1: Math.PI * 0.74, tSeg: 14, weights: head, color: hc, flip: true, center: c, include: (th, ph) => { const [x, y, z] = this._headDir(th, ph); return !(z > 0.6 && y < 0.2) && !(Math.abs(x) > 0.75 && y < -0.05 && z > -0.2); } });
    else if (st === 'mohawk') { shell(0.003, (x, y, z) => base(x, y, z, 0.5) && Math.abs(x) > 0.12); g.patch({ fn: (a, t) => { const ph = 0.15 + t * 1.6; const [, y, z] = this._headDir(0, ph); const p = this._headPoint(0, y, z * (1 - t * 0) ); return [Math.sin(a) * 0.011 * hs, p[1] + 0.035 * hs * Math.max(0, Math.cos(a)), p[2] + (p[2] > c[2] ? -0.0 : 0)]; }, s0: -Math.PI / 2, s1: Math.PI / 2, sSeg: 4, t0: 0, t1: 1, tSeg: 10, weights: head, color: hc, flip: true }); }
    else if (st === 'spiky') { shell(0.012, (x, y, z) => base(x, y, z, 0.4)); for (let i = 0; i < 10; i++) { const th = r.range(-1, 1) + (i % 2 ? Math.PI : 0), ph = r.range(0.1, 0.9); const [x, y, z] = this._headDir(th, ph); const p = this._headPoint(x, y, z); this._spike(g, p, [x, y + 0.6, z], 0.016 * hs, 0.05 * hs, hc); } }
    else if (st === 'ponytail') { shell(0.01, (x, y, z) => base(x, y, z, 0.4, 0.0, -0.55)); const tie = this._headPoint(0, 0.1, -1); this._blob(g, [tie[0], tie[1], tie[2] - 0.01], 0.022 * hs, hc); g.patch({ fn: (a, t) => [Math.sin(a) * (0.022 - t * 0.012) * hs, tie[1] - t * 0.2 * hs, tie[2] - 0.025 - Math.sin(t * 2) * 0.03 * hs + Math.cos(a) * (0.022 - t * 0.012) * hs], s0: 0, s1: Math.PI * 2, sSeg: 8, t0: 0, t1: 1, tSeg: 6, weights: head, color: hc, flip: true }); }
    else if (st === 'long') {
      shell(0.013, (x, y, z) => base(x, y, z, 0.38, -0.2, -0.95), 30, 22);
      g.patch({ fn: (a, t) => { const ang = Math.PI * 0.5 + a; const p = this._headPoint(Math.sin(ang) * 0.95, -0.25, Math.cos(ang)); const dx = p[0] - c[0], dz = p[2] - c[2]; return [c[0] + dx * (1.12 + t * 0.12), p[1] - t * 0.2 * hs, c[2] + dz * (1.12 + t * 0.1) - t * 0.02]; }, s0: 0, s1: Math.PI, sSeg: 12, t0: 0, t1: 1, tSeg: 5, weights: head, color: hc, center: [c[0], c[1] - 0.1, c[2]] });
    }
    else if (st === 'bun') { shell(0.01, (x, y, z) => base(x, y, z, 0.4, 0.05, -0.5)); const b = this._headPoint(0, 0.62, -0.75); this._blob(g, [b[0], b[1] + 0.015, b[2] - 0.02], 0.04 * hs, hc); }
    else if (st === 'bob') {
      shell(0.015, (x, y, z) => base(x, y, z, 0.36, -0.3, -0.7), 30, 22);
      g.patch({ fn: (a, t) => { const ang = Math.PI * 0.38 + a; const p = this._headPoint(Math.sin(ang), -0.2, Math.cos(ang)); const dx = p[0] - c[0], dz = p[2] - c[2]; return [c[0] + dx * 1.16, p[1] - t * 0.075 * hs, c[2] + dz * 1.16]; }, s0: 0, s1: Math.PI * 1.24, sSeg: 14, t0: 0, t1: 1, tSeg: 3, weights: head, color: hc, center: [c[0], c[1] - 0.05, c[2]] });
    }
  }
  _blob(g, p, r, color) {
    g.patch({ fn: (th, ph) => [p[0] + Math.sin(ph) * Math.sin(th) * r, p[1] + Math.cos(ph) * r, p[2] + Math.sin(ph) * Math.cos(th) * r], s0: 0, s1: Math.PI * 2, sSeg: 8, t0: 0.01, t1: Math.PI - 0.01, tSeg: 5, weights: [[B.head, 1]], color, flip: true, center: p });
  }
  _spike(g, p, dir, r, len, color) {
    const l = Math.hypot(...dir); const u = dir.map((v) => v / l);
    g.patch({ fn: (a, t) => { const rr = r * (1 - t); const px = p[0] + u[0] * len * t, py = p[1] + u[1] * len * t, pz = p[2] + u[2] * len * t; return [px + Math.sin(a) * rr, py, pz + Math.cos(a) * rr]; }, s0: 0, s1: Math.PI * 2, sSeg: 5, t0: 0, t1: 1, tSeg: 2, weights: [[B.head, 1]], color, flip: true });
  }
  _facialHair(g) {
    const { app, d } = this;
    const f = app.facial;
    if (f === 'none' || f === 'stubble') return;
    const fc = hexRGB(app.facialColor), c = this.headCenter, head = [[B.head, 1]];
    const over = (cover, pad) => g.patch({
      fn: (th, ph) => { const [x, y, z] = this._headDir(th, ph); const p = this._headPoint(x, y, z); const k = 1 + pad / 0.1; return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k, c[2] + (p[2] - c[2]) * k]; },
      s0: -Math.PI * 0.75, s1: Math.PI * 0.75, sSeg: 22, t0: Math.PI * 0.45, t1: Math.PI * 0.99, tSeg: 12, weights: head, color: fc, flip: true, center: c,
      include: (th, ph) => { const [x, y, z] = this._headDir(th, ph); return cover(x, y, z); },
    });
    if (f === 'beard') over((x, y, z) => z > -0.1 && y < -0.32 && !(z > 0.8 && Math.abs(x) < 0.2 && y > -0.62 && y < -0.42), 0.012 * d.head);
    if (f === 'goatee') over((x, y, z) => z > 0.6 && Math.abs(x) < 0.28 && y < -0.62, 0.01 * d.head);
    if (f === 'chops') over((x, y, z) => Math.abs(x) > 0.62 && z > -0.1 && y < -0.05 && y > -0.62, 0.008 * d.head);
    if (f === 'mustache' || f === 'beard' || f === 'chops') {
      const m = this._headPoint(0, -0.38, 1);
      g.patch({ fn: (a, t) => { const x = lerp(-1, 1, t); const w = 0.032 * d.head * app.mouthWidth; const p = this._headPoint(x * 0.42, -0.4, Math.sqrt(1 - Math.min(0.9, x * x * 0.17))); return [x * w, m[1] - Math.abs(x) * 0.008 + Math.sin(a) * 0.0055, p[2] + 0.004 + Math.cos(a) * 0.006]; },
        s0: -Math.PI / 2, s1: Math.PI / 2, sSeg: 4, t0: 0, t1: 1, tSeg: 8, weights: head, color: fc, center: c });
    }
  }
  _headwear(g, fn) {
    const { app, d } = this;
    const c = this.headCenter, hs = d.head, head = [[B.head, 1]];
    if (app.cap) {
      g.patch({ fn: (th, ph) => { const [x, y, z] = this._headDir(th, ph); const p = this._headPoint(x, y, z); const k = 1.17; return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * 1.12 + 0.012, c[2] + (p[2] - c[2]) * k]; },
        s0: 0, s1: Math.PI * 2, sSeg: 22, t0: 0.001, t1: Math.PI * 0.42, tSeg: 7, weights: head, color: hexRGB('#232a36'), flip: true, center: c });
      const v = this._headPoint(0, 0.36, 1);
      this._box(g, B.head, [v[0], v[1] + 0.004, v[2] + 0.035 * hs], [0.17 * hs, 0.012, 0.075 * hs], hexRGB('#1a1f29'));
      const b = this._headPoint(0, 0.62, 1);
      this._box(g, B.head, [b[0], b[1] + 0.01, b[2] + 0.012], [0.03, 0.026, 0.008], [0.86, 0.7, 0.26]);
    }
    if (app.headband) g.patch({ fn: (th, t) => { const p = this._headPoint(Math.sin(th), 0.36 + t * 0.14, Math.cos(th)); return [c[0] + (p[0] - c[0]) * 1.06, p[1], c[2] + (p[2] - c[2]) * 1.06]; }, s0: 0, s1: Math.PI * 2, sSeg: 20, t0: 0, t1: 1, tSeg: 1, weights: head, color: hexRGB(app.headband), flip: true });
    if (app.glasses) {
      for (const sx of [-1, 1]) {
        const e = this._headPoint(sx * 0.37, 0.02, 0.95);
        g.patch({ fn: (a, t) => [e[0] + Math.sin(a) * (0.017 + t * 0.003) * hs, e[1] + Math.cos(a) * (0.012 + t * 0.002) * hs, e[2] + 0.012 * hs], s0: 0, s1: Math.PI * 2, sSeg: 12, t0: 0, t1: 1, tSeg: 1, weights: head, color: [0.1, 0.1, 0.1], center: c });
        const tmp = this._headPoint(sx * 0.98, 0.04, 0.3);
        this._box(g, B.head, [(e[0] + tmp[0]) / 2 + sx * 0.008, e[1] + 0.003, (e[2] + tmp[2]) / 2 + 0.005], [Math.abs(e[0] - tmp[0]) + 0.01, 0.004, Math.abs(e[2] - tmp[2]) + 0.004], [0.1, 0.1, 0.1]);
      }
      const br = this._headPoint(0, 0.06, 1);
      this._box(g, B.head, [br[0], br[1], br[2] + 0.012 * hs], [0.02 * hs, 0.004, 0.004], [0.1, 0.1, 0.1]);
    }
  }

  // ==================================================================================== texture
  _paintAtlas() {
    const ctx = this.ctx, app = this.app;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    if (app.outfitKey.startsWith('inmate') || app.outfitKey === 'solitary') {
      ctx.fillStyle = app.shirt; ctx.fillRect(256, 0, 256, 128);
      const r = new RNG(app.seed + 2);
      for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${r.range(0.02, 0.05)})`; ctx.fillRect(256 + r.range(0, 256), r.range(0, 128), 2, 2); }
      ctx.fillStyle = app.outfitKey === 'solitary' ? 'rgba(40,40,40,0.85)' : 'rgba(246,241,226,0.9)';
      ctx.font = 'bold 52px "Oswald", "Arial Narrow", Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(app.idNumber, 384, 58);
      ctx.font = 'bold 18px "Oswald", Arial, sans-serif';
      ctx.fillText('GRAVELMOUTH S.P.', 384, 102);
    }
    this._paintFace();
  }

  _paintFace() {
    const ctx = this.ctx, app = this.app, e = this.blinking ? 'blink' : this.expression;
    const S = 256, cx = 128, hs = this.d.head;
    const px = (x) => cx - (x / (FACE_W * hs)) * 128 * hs; // head-local metres -> canvas x (x>0 is character's right)
    const py = (y) => 128 - (y / (FACE_H * hs)) * 128 * hs;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 256, 256); ctx.clip();
    ctx.fillStyle = app.skin; ctx.fillRect(0, 0, S, S);
    const sk = hexRGB(app.skin);
    const tone = (k, a = 1) => `rgba(${Math.round(sk[0] * 255 * k)},${Math.round(sk[1] * 255 * k)},${Math.round(sk[2] * 255 * k)},${a})`;
    // Gentle facial shading: temples, under the cheekbones, around the eyes.
    const shadow = (x, y, rx, ry, a) => { const g2 = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); g2.addColorStop(0, `rgba(60,30,20,${a})`); g2.addColorStop(1, 'rgba(60,30,20,0)'); ctx.save(); ctx.translate(x, y); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.translate(-x, -y); ctx.fillStyle = g2; ctx.fillRect(x - Math.max(rx, ry), y - Math.max(rx, ry), Math.max(rx, ry) * 2, Math.max(rx, ry) * 2); ctx.restore(); };
    const eyeY = py(0.004), eyeDX = 0.031 * hs, mouthY = py(-0.066), es = app.eyeSize;
    for (const sx of [-1, 1]) { shadow(px(sx * eyeDX), eyeY, 26, 17, 0.16); shadow(px(sx * 0.058), py(-0.045), 22, 30, 0.08); }
    shadow(cx, py(-0.095), 30, 14, 0.07);
    // Stubble / facial hair shadow
    if (app.facial !== 'none') {
      const r = new RNG(app.seed + 9);
      ctx.fillStyle = 'rgba(25,18,12,0.28)';
      const dense = app.facial === 'stubble' ? 900 : 500;
      for (let i = 0; i < dense; i++) { const a = r.range(0.05, Math.PI - 0.05), rr = r.range(0.035, 0.08); const x = Math.cos(a) * rr * 1.1, y = -0.035 - Math.sin(a) * rr * 0.9; if (y > -0.05 && Math.abs(x) < 0.03) continue; ctx.fillRect(px(x), py(y), 1.6, 1.6); }
      for (let i = 0; i < 200; i++) { const x = r.range(-0.028, 0.028), y = r.range(-0.052, -0.046); ctx.fillRect(px(x), py(y), 1.5, 1.5); }
    }
    if (app.freckles) { const r = new RNG(app.seed + 3); ctx.fillStyle = 'rgba(120,60,30,0.32)'; for (let i = 0; i < 40; i++) ctx.beginPath(), ctx.arc(px(r.range(-0.05, 0.05)), py(r.range(-0.035, -0.01)), r.range(0.8, 1.6), 0, 7), ctx.fill(); }
    if (app.age === 'old') { ctx.strokeStyle = tone(0.72, 0.5); ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px(0.04), py(0.045 + i * 0.012)); ctx.quadraticCurveTo(cx, py(0.05 + i * 0.012), px(-0.04), py(0.045 + i * 0.012)); ctx.stroke(); } for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px(sx * 0.026), py(-0.03)); ctx.quadraticCurveTo(px(sx * 0.04), py(-0.06), px(sx * 0.034), py(-0.08)); ctx.stroke(); } }
    if (e === 'happy' || e === 'laugh') for (const sx of [-1, 1]) shadow(px(sx * 0.045), py(-0.035), 16, 11, 0.1);
    if (e === 'hurt' || e === 'ko') { ctx.fillStyle = 'rgba(110,40,80,0.28)'; ctx.beginPath(); ctx.ellipse(px(-0.035), py(-0.012), 15, 11, 0, 0, 7); ctx.fill(); }
    // Eyes
    const dark = '#1b120d';
    for (const sx of [-1, 1]) {
      const ex = px(sx * eyeDX), ew = 15 * es, eh0 = 8 * es;
      if (e === 'blink' || e === 'sleep') { ctx.strokeStyle = dark; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(ex - ew, eyeY); ctx.quadraticCurveTo(ex, eyeY + 5, ex + ew, eyeY); ctx.stroke(); continue; }
      if (e === 'ko') { ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex - 8, eyeY - 8); ctx.lineTo(ex + 8, eyeY + 8); ctx.moveTo(ex + 8, eyeY - 8); ctx.lineTo(ex - 8, eyeY + 8); ctx.stroke(); continue; }
      if (e === 'hurt') { ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex - ew, eyeY - 2); ctx.quadraticCurveTo(ex, eyeY + 3, ex + ew, eyeY - 2); ctx.stroke(); continue; }
      const eh = e === 'angry' ? eh0 * 0.62 : e === 'happy' ? eh0 * 0.68 : e === 'shock' ? eh0 * 1.25 : eh0;
      // almond-shaped sclera
      ctx.fillStyle = '#efe9df';
      ctx.beginPath(); ctx.moveTo(ex - ew, eyeY); ctx.quadraticCurveTo(ex, eyeY - eh * 1.6, ex + ew, eyeY); ctx.quadraticCurveTo(ex, eyeY + eh * 1.2, ex - ew, eyeY); ctx.fill();
      ctx.save(); ctx.clip();
      const ir = 6.6 * es;
      ctx.fillStyle = app.eyes; ctx.beginPath(); ctx.arc(ex - sx * 0.6, eyeY - 0.5, ir, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(ex - sx * 0.6, eyeY - 0.5, ir, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
      ctx.fillStyle = '#0a0706'; ctx.beginPath(); ctx.arc(ex - sx * 0.6, eyeY - 0.5, ir * 0.42, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ex - sx * 0.6 - 2.2, eyeY - 2.8, 1.6, 0, 7); ctx.fill();
      ctx.restore();
      // upper lid & lashes, lower lid
      ctx.strokeStyle = dark; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(ex - ew - 1, eyeY + 0.5); ctx.quadraticCurveTo(ex, eyeY - eh * 1.65, ex + ew + 1, eyeY + 0.5); ctx.stroke();
      ctx.strokeStyle = tone(0.7, 0.55); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ex - ew * 0.8, eyeY + 2); ctx.quadraticCurveTo(ex, eyeY + eh * 1.25, ex + ew * 0.85, eyeY + 1.5); ctx.stroke();
      ctx.strokeStyle = tone(0.8, 0.5); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(ex - ew * 0.9, eyeY - eh * 1.15); ctx.quadraticCurveTo(ex, eyeY - eh * 2.0, ex + ew * 0.9, eyeY - eh * 1.15); ctx.stroke();
    }
    // Brows (tapered strokes)
    const browCol = app.hair.style === 'bald' && app.age !== 'old' ? '#3b2a20' : app.hair.color;
    for (const sx of [-1, 1]) {
      const bx = px(sx * eyeDX);
      let inner = 0, outer = 0, arch = -3;
      if (e === 'angry' || e === 'threat') { inner = 8; outer = -2; arch = 0; }
      else if (e === 'hurt' || e === 'sad') { inner = -6; outer = 3; }
      else if (e === 'happy' || e === 'shock') { inner = -4; outer = -4; arch = -5; }
      const by = eyeY - 21;
      const thick = 2.2 + app.brow * 2.2;
      const xIn = bx + sx * 17, xOut = bx - sx * 18;
      ctx.fillStyle = browCol;
      ctx.beginPath();
      ctx.moveTo(xIn, by + inner);
      ctx.quadraticCurveTo(bx, by + arch - thick * 0.6, xOut, by + outer + 3);
      ctx.quadraticCurveTo(bx, by + arch + thick * 0.7, xIn, by + inner + thick);
      ctx.fill();
    }
    if (app.scar) { ctx.strokeStyle = 'rgba(160,80,70,0.7)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(px(-0.045), py(0.035)); ctx.lineTo(px(-0.052), py(-0.02)); ctx.stroke(); }
    // Nostril shading under the nose geometry
    ctx.fillStyle = 'rgba(55,25,18,0.35)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(px(sx * 0.0075), py(-0.038), 3.2, 1.8, sx * 0.3, 0, 7); ctx.fill(); }
    shadow(cx, py(-0.043), 14, 5, 0.12);
    // Mouth: lips with expression
    const mw = 21 * app.mouthWidth;
    const lip = `rgb(${Math.round(sk[0] * 175 + 40)},${Math.round(sk[1] * 120 + 20)},${Math.round(sk[2] * 115 + 18)})`;
    const lipDark = `rgb(${Math.round(sk[0] * 120 + 20)},${Math.round(sk[1] * 70 + 10)},${Math.round(sk[2] * 65 + 10)})`;
    const talk = this.mouthOpen;
    const drawLips = (curve, open) => {
      const y = mouthY;
      if (open > 0) {
        ctx.fillStyle = '#3a1512';
        ctx.beginPath(); ctx.moveTo(cx - mw * 0.85, y + curve * 0.4); ctx.quadraticCurveTo(cx, y - open * 0.35 + curve, cx + mw * 0.85, y + curve * 0.4); ctx.quadraticCurveTo(cx, y + open + curve, cx - mw * 0.85, y + curve * 0.4); ctx.fill();
        if (open > 4) { ctx.fillStyle = '#efe9dd'; ctx.fillRect(cx - mw * 0.55, y - open * 0.3 + curve * 0.8, mw * 1.1, Math.min(4, open * 0.35)); }
      }
      ctx.fillStyle = lip;
      ctx.beginPath(); ctx.moveTo(cx - mw, y + curve * 0.4); ctx.quadraticCurveTo(cx - mw * 0.4, y - 5 + curve * 0.3, cx, y - 3 + curve * 0.2); ctx.quadraticCurveTo(cx + mw * 0.4, y - 5 + curve * 0.3, cx + mw, y + curve * 0.4); ctx.quadraticCurveTo(cx, y - open * 0.3 + curve, cx - mw, y + curve * 0.4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - mw * 0.92, y + curve * 0.4); ctx.quadraticCurveTo(cx, y + open + 7 + curve, cx + mw * 0.92, y + curve * 0.4); ctx.quadraticCurveTo(cx, y + open + curve * 0.9, cx - mw * 0.92, y + curve * 0.4); ctx.fill();
      ctx.strokeStyle = lipDark; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - mw, y + curve * 0.4); ctx.quadraticCurveTo(cx, y + (open ? -open * 0.3 : 1.5) + curve, cx + mw, y + curve * 0.4); ctx.stroke();
    };
    if (e === 'happy') drawLips(-6, talk ? 7 : 0);
    else if (e === 'laugh') drawLips(-6, 11);
    else if (e === 'angry' || e === 'threat') { drawLips(4, talk ? 6 : 3); }
    else if (e === 'hurt') drawLips(3, 7);
    else if (e === 'shock') drawLips(0, 12);
    else if (e === 'ko') { drawLips(2, 8); ctx.fillStyle = '#d27080'; ctx.beginPath(); ctx.ellipse(cx + 4, mouthY + 9, 6, 6, 0.3, 0, 7); ctx.fill(); }
    else if (e === 'sleep') drawLips(0, 3);
    else if (e === 'sad') drawLips(5, 0);
    else drawLips(0, talk ? 7 : 0);
    ctx.restore();
    this.tex.update(true);
  }

  setExpression(e) { if (e !== this.expression) { this.expression = e; this._paintFace(); } }
  setMouth(open) { if (open !== this.mouthOpen) { this.mouthOpen = open; this._paintFace(); } }
  setBlink(b) { if (b !== this.blinking) { this.blinking = b; this._paintFace(); } }

  /** Apply local bone quaternions (Float32Array 17*4) and the hips translation offset. */
  applyPose(q, hips) {
    const bq = this._q, t = this._t, s = this._s;
    for (let i = 0; i < this.bones.length; i++) {
      const r = this.rest[i];
      if (i === 0) t.set(r[0] + hips[0], r[1] + hips[1], r[2] + hips[2]); else t.set(r[0], r[1], r[2]);
      bq.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
      BABYLON.Matrix.ComposeToRef(s, bq, t, this.bones[i].getLocalMatrix());
      this.bones[i].markAsDirty();
    }
  }
  place(x, y, z, yaw) { this.mesh.position.set(x, y, z); this.mesh.rotation.y = yaw; }
  /** Recompute bone matrices now (so attachments read this frame's pose). */
  syncSkeleton() { this.mesh.computeWorldMatrix(true); this.skeleton.prepare(true); }
  boneMatrix(name, out) { this.bones[B[name]].getFinalMatrix().multiplyToRef(this.mesh.getWorldMatrix(), out); return out; }
  boneWorld(name, out, local = V3.ZeroReadOnly) { this.boneMatrix(name, this._m); return V3.TransformCoordinatesToRef(local, this._m, out); }
  setOutline(on, color) {
    this.mesh.renderOutline = !!on;
    if (on) { this.mesh.outlineColor = color || new BABYLON.Color3(1, 0.85, 0.35); this.mesh.outlineWidth = 0.018; }
  }
  setVisible(v) { this.mesh.setEnabled(v); }
  dispose() { this.mesh.dispose(); this.skeleton.dispose(); this.tex.dispose(); this.material.dispose(); }
}
