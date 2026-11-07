import * as THREE from 'three';
import { GEO, SEABED, AIRPORT_FLAT, ARR_CITY } from '../geo.js';
import { BAKE_FRAG, BAKE_VERT, terrainVertexShader, terrainFragmentShader } from './terrainShaders.js';

// =============================================================================
// TERRAIN — nested-grid geometry clipmap drawn in at most 5 instanced draw calls.
//
//  * Level L has cell size s0·2^L and covers a (2H)x(2H)-cell square centred on
//    the camera snapped to 2·s_L, so every vertex sits on a fixed world lattice
//    (no swimming). Level L+1 leaves out (index buffer) the footprint of level
//    L, which can only sit at 4 cell offsets -> 4 holed variants + 1 full grid,
//    each drawn instanced with a per-instance level attribute (no overdraw, no
//    discard).
//  * Heights / water mask / mountain-belt factor are BAKED per level into a
//    float atlas (geoHeight from geo.js, identical to the CPU) only when a
//    level snaps to a new position, so the per-frame vertex cost is a handful
//    of texel fetches. Odd vertices are geomorphed towards the coarser level
//    near each ring's outer edge (crack-free transitions).
//  * Floating origin: geometry is relative to a reference point (= level-0
//    centre, within 4 m of the camera); detail coordinates use the reference
//    modulo 16384 m, large-scale masks the float32 world position.
//  * Earth curvature drop d^2/2R relative to the camera so the horizon dips
//    correctly (3.4 deg at 11 km) and matches the atmosphere.
//  * The finest levels are skipped at altitude.
// =============================================================================

const MOD = 16384;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pmod = (x, m) => ((x % m) + m) % m;

export class Terrain {
  constructor(app, env, sharedUniforms, textures) {
    this.app = app;
    this.env = env;
    const detail = clamp(app.quality?.detail ?? 1, 0, 3);
    const half = [24, 32, 48, 64][detail];
    this.s0 = 2;
    this.half = half;
    this.N = half * 2;
    this.apron = 2;
    this.stride = this.N + 1 + 2 * this.apron;
    this.levels = Math.ceil(Math.log2(470000 / (half * this.s0))) + 1;
    this.cfg = { levels: this.levels, half, morph: Math.max(2, half / 4), stride: this.stride, apron: this.apron, detail };
    this.minLevel = 0;
    this._minLevelF = 0;

    // --- bake atlas -------------------------------------------------------------
    const r = app.renderer;
    const floatOK = r.extensions.has('EXT_color_buffer_float');
    this.rt = new THREE.WebGLRenderTarget(this.stride * this.levels, this.stride, {
      type: floatOK ? THREE.FloatType : THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    this.rt.texture.name = 'env.terrainHeights';
    this.geoU = { uGeoDep: sharedUniforms.uGeoDep, uGeoArr: sharedUniforms.uGeoArr };
    this.bakeMat = new THREE.ShaderMaterial({
      name: 'env.terrainBake', vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG,
      uniforms: {
        ...this.geoU,
        uBakeOrigin: { value: new THREE.Vector2() }, uBakeScale: { value: 1 }, uBlockX0: { value: 0 }, uApron: { value: this.apron },
      },
      depthTest: false, depthWrite: false,
    });
    this.origins = [];
    for (let L = 0; L < this.levels; L++) this.origins.push({ x: NaN, z: NaN, dirty: true });

    // --- grid geometry: shared vertices, 5 index variants --------------------------
    // variant 0 = full grid (finest drawn level); 1..4 = grid with the hole for the
    // next finer level at cell offset (o_x, o_z) in {0,1}^2 (the finer level is
    // snapped on a 2x finer lattice, so its footprint sits at H/2 + {0,1} cells).
    const N = this.N, V = N + 1, Hh = half;
    const pos = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const o = (j * V + i) * 3; pos[o] = i; pos[o + 1] = 0; pos[o + 2] = j; }
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const IdxArr = V * V > 65535 ? Uint32Array : Uint16Array;
    this.variants = [];
    for (let v = 0; v < 5; v++) {
      const ox = v === 0 ? 0 : (v - 1) & 1, oz = v === 0 ? 0 : ((v - 1) >> 1) & 1;
      const h0x = Hh / 2 + ox, h0z = Hh / 2 + oz;
      const tris = [];
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          if (v > 0 && i >= h0x && i < h0x + Hh && j >= h0z && j < h0z + Hh) continue;
          const a = j * V + i, b = a + 1, c = a + V, d = c + 1;   // a=(i,j) b=(i+1,j) c=(i,j+1) d=(i+1,j+1)
          tris.push(a, c, d, a, d, b);
        }
      }
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', posAttr);
      geo.setIndex(new THREE.BufferAttribute(new IdxArr(tris), 1));
      const lv = new THREE.InstancedBufferAttribute(new Float32Array(this.levels), 1);
      lv.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aLevel', lv);
      geo.instanceCount = 0;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
      this.variants.push({ geo, attr: lv, list: [], key: -1 });
    }

    // --- material -----------------------------------------------------------------
    const base = [];
    for (let L = 0; L < this.levels; L++) base.push(new THREE.Vector2());
    this.uniforms = {
      ...sharedUniforms,
      uHeights: { value: this.rt.texture },
      uLevelBase: { value: base },
      uS0: { value: this.s0 },
      uCamPos: { value: new THREE.Vector3() },
      uRefWorld: { value: new THREE.Vector2() },
      uRefMod: { value: new THREE.Vector2() },
      uAnchor: { value: new THREE.Vector2() },
      uDetail: { value: detail },
      tNoise: { value: textures.noise },
      tWaves: { value: textures.waves },
      tRelief: { value: textures.relief },
      tGrass: { value: textures.grass }, tGrassN: { value: textures.grassN },
      tDirt: { value: textures.dirt }, tDirtN: { value: textures.dirtN },
      tRock: { value: textures.rock }, tRockN: { value: textures.rockN },
      tSand: { value: textures.sand },
      tMeadow: { value: textures.meadow },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'env.terrain',
      vertexShader: terrainVertexShader(this.cfg),
      fragmentShader: terrainFragmentShader(this.cfg),
      uniforms: this.uniforms,
      fog: false, lights: false,
    });
    this.mesh = new THREE.Group();
    this.mesh.name = 'env.terrain';
    this.meshes = this.variants.map((vr, i) => {
      const m = new THREE.Mesh(vr.geo, this.material);
      m.name = `env.terrain.v${i}`;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.raycast = () => {};
      m.renderOrder = 50;          // after airport / city opaques: early-z rejects terrain under pavement
      m.visible = false;
      this.mesh.add(m);
      return m;
    });
    this.ref = new THREE.Vector3();
  }

  invalidate() { for (const o of this.origins) o.dirty = true; }

  _bake(L) {
    const o = this.origins[L];
    const s = this.s0 * 2 ** L;
    const u = this.bakeMat.uniforms;
    u.uBakeOrigin.value.set(o.x, o.z);
    u.uBakeScale.value = s;
    u.uBlockX0.value = L * this.stride;
    const rt = this.rt;
    rt.viewport.set(L * this.stride, 0, this.stride, this.stride);
    rt.scissor.set(L * this.stride, 0, this.stride, this.stride);
    rt.scissorTest = true;
    this.app.pipeline.fullscreen(this.bakeMat, rt);
    rt.scissorTest = false;
    rt.viewport.set(0, 0, rt.width, rt.height);
    rt.scissor.set(0, 0, rt.width, rt.height);
    o.dirty = false;
  }

  /** cam: camera world position (Vector3), agl: height above ground (m). */
  update(cam, agl, time) {
    const H = this.half, s0 = this.s0;
    // reference point = level-0 centre (multiple of 2*s0)
    const refx = Math.floor(cam.x / (2 * s0)) * 2 * s0, refz = Math.floor(cam.z / (2 * s0)) * 2 * s0;
    this.ref.set(refx, 0, refz);
    // finest level to draw (hysteresis)
    const target = Math.log2(Math.max(1, agl * 0.3 / (H * s0)));
    if (target > this._minLevelF + 1.15 || target < this._minLevelF - 0.15) this._minLevelF = Math.floor(target);
    this.minLevel = clamp(this._minLevelF, 0, this.levels - 2);

    const r = this.app.renderer;
    const prevRT = r.getRenderTarget();
    let baked = 0;
    for (let L = 0; L < this.levels; L++) {
      const s = s0 * 2 ** L;
      const cx = Math.floor(cam.x / (2 * s)) * 2 * s, cz = Math.floor(cam.z / (2 * s)) * 2 * s;
      const ox = cx - H * s, oz = cz - H * s;
      const o = this.origins[L];
      if (o.x !== ox || o.z !== oz) { o.x = ox; o.z = oz; o.dirty = true; }
      if (o.dirty && L >= this.minLevel - 1) { this._bake(L); baked++; }
      this.uniforms.uLevelBase.value[L].set(ox - refx, oz - refz);
    }
    if (baked) r.setRenderTarget(prevRT);
    const u = this.uniforms;
    u.uCamPos.value.set(cam.x - refx, cam.y, cam.z - refz);
    u.uRefWorld.value.set(refx, refz);
    const mx = pmod(refx, MOD), mz = pmod(refz, MOD);
    u.uRefMod.value.set(mx, mz);
    u.uAnchor.value.set((refx - mx) / 1024, (refz - mz) / 1024);
    // assign visible levels to index variants (hole offset relative to the finer level)
    for (const vr of this.variants) vr.list.length = 0;
    for (let L = this.minLevel; L < this.levels; L++) {
      let v = 0;
      if (L > this.minLevel) {
        const s = s0 * 2 ** L;
        const ox = Math.round((this.origins[L - 1].x - this.origins[L].x) / s - H / 2);
        const oz = Math.round((this.origins[L - 1].z - this.origins[L].z) / s - H / 2);
        v = 1 + clamp(ox, 0, 1) + 2 * clamp(oz, 0, 1);
      }
      this.variants[v].list.push(L);
    }
    for (let i = 0; i < 5; i++) {
      const vr = this.variants[i];
      let key = 0;
      for (let k = 0; k < vr.list.length; k++) key |= 1 << vr.list[k];
      if (key !== vr.key) {
        vr.key = key;
        for (let k = 0; k < vr.list.length; k++) vr.attr.array[k] = vr.list[k];
        vr.attr.needsUpdate = true;
      }
      vr.geo.instanceCount = vr.list.length;
      this.meshes[i].visible = vr.list.length > 0;
    }
    this.mesh.position.set(refx, 0, refz);
  }

  dispose() {
    this.rt.dispose(); this.material.dispose(); this.bakeMat.dispose();
    for (const vr of this.variants) vr.geo.dispose();
  }
}

const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** geo.js terrainHeight WITHOUT the final water mix (port; verified against geo.js at start-up). */
function landHeight(wx, wz, dep, arr) {
  const { fbm, ridged, vnoise, coastX } = GEO;
  const hills = fbm(wx / 9000, wz / 9000, 5) * 140 + fbm(wx / 1800, wz / 1800, 3) * 18;
  const belt = sstep(0.15, 0.55, fbm(wx / 60000 + 3.3, wz / 60000 - 1.1, 3) + 0.25);
  const mountains = ridged(wx / 14000, wz / 14000, 5) * 2600 * belt;
  let h = 60 + hills + mountains;
  const ddx = wx - dep.x, ddz = wz - dep.z;
  const depPlain = 1 - sstep(9000, 30000, Math.hypot(ddx, ddz));
  h = h * (1 - depPlain) + depPlain * (12 + fbm(wx / 4000, wz / 4000, 4) * 22 + sstep(-4000, -16000, ddz) * 90 * (0.6 + 0.4 * vnoise(wx / 5000, 1.7)));
  const adx = wx - arr.x, adz = wz - arr.z;
  const arrPlain = 1 - sstep(14000, 40000, Math.hypot(adx, adz));
  const backdrop = sstep(-14000, -30000, adz) * sstep(-8000, 6000, adx) * (300 + 500 * Math.max(0, fbm(wx / 7000, wz / 7000, 4)));
  h = h * (1 - arrPlain) + arrPlain * (6 + fbm(wx / 3000, wz / 3000, 4) * 14 + backdrop);
  const inCity = sstep(ARR_CITY.xMin - 1500, ARR_CITY.xMin, adx) * (1 - sstep(ARR_CITY.xMax, ARR_CITY.xMax + 2500, adx)) *
    sstep(ARR_CITY.zMin - 2500, ARR_CITY.zMin, adz) * (1 - sstep(ARR_CITY.zMax, ARR_CITY.zMax + 1500, adz));
  h = h * (1 - inCity) + inCity * (4 + 10 * sstep(-6000, 6000, adx) + 3 * vnoise(wx / 900, wz / 900));
  const shore = coastX(adz);
  const beach = sstep(shore - 20, shore + 400, adx);
  if (Math.abs(adz) < 95000 && adx > -150000 && adx < shore + 2500) h = h * (0.35 + 0.65 * sstep(shore + 200, shore + 2500, adx)) * beach + (1 - beach) * 0.5;
  for (const o of [dep, arr]) {
    const ax = wx - o.x, az = wz - o.z, F = AIRPORT_FLAT;
    const fx = Math.max(F.xMin - ax, 0, ax - F.xMax), fz = Math.max(F.zMin - az, 0, az - F.zMax);
    const t = sstep(0, F.blend, Math.hypot(fx, fz));
    h = h * t + (1 - t) * -0.25;
  }
  return h;
}

let _landPortOK = null;
function landPortOK(dep, arr) {
  if (_landPortOK !== null) return _landPortOK;
  let ok = true, n = 0;
  for (let i = 0; i < 400 && n < 40; i++) {
    const x = (i * 7919 % 4000) * 173 - 300000, z = (i * 104729 % 3000) * 97 - 140000;
    if (GEO.waterMask(x, z, dep, arr) > 0) continue;
    n++;
    if (Math.abs(landHeight(x, z, dep, arr) - GEO.terrainHeight(x, z, dep, arr)) > 1e-6) { ok = false; break; }
  }
  if (!ok) console.warn('[environment] geo.js changed: land-height port disagrees; en-route lake rule disabled on the CPU');
  _landPortOK = ok;
  return ok;
}

/**
 * CPU ground height (m) at world (x, z) = geo.js terrainHeight, with the water
 * SURFACE (0) where wet. En-route lakes are only rendered in lowlands (< ~200 m
 * land height, see the terrain bake); elsewhere this returns the rendered land.
 */
export function makeGroundHeight(app) {
  return (x, z) => {
    const dep = app.world.departureOrigin, arr = app.world.arrivalOrigin;
    const h = GEO.terrainHeight(x, z, dep, arr);
    const m = GEO.waterMask(x, z, dep, arr);
    if (m <= 0) return h;
    const wEn = sstep(0.62, 0.66, GEO.vnoise(x / 23000 + 5.1, z / 23000 - 2.7)) *
      sstep(25000, 40000, Math.hypot(x - dep.x, z - dep.z)) * sstep(30000, 45000, Math.hypot(x - arr.x, z - arr.z));
    if (wEn > 0 && wEn >= m - 1e-4 && landPortOK(dep, arr)) {
      const hl = landHeight(x, z, dep, arr);
      const wv = wEn * (1 - sstep(140, 260, hl));
      const hv = hl * (1 - wv) + wv * SEABED;
      return (wv > 0.5 && hv < 0) ? 0 : hv;
    }
    return (h < 0 && m > 0.5) ? 0 : h;
  };
}
