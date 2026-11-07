import * as THREE from 'three';
import { GEO } from '../geo.js';
import { BAKE_FRAG, BAKE_VERT, terrainVertexShader, terrainFragmentShader } from './terrainShaders.js';

// =============================================================================
// TERRAIN — nested-grid geometry clipmap drawn in ONE instanced draw call.
//
//  * Level L has cell size s0·2^L and covers a (2H)x(2H)-cell square centred on
//    the camera snapped to 2·s_L, so every vertex sits on a fixed world lattice
//    (no swimming). Level L+1 discards (fragment) the footprint of level L.
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
    this.cfg = { levels: this.levels, half, morph: Math.max(2, half / 4), stride: this.stride, apron: this.apron };
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

    // --- grid geometry (instanced per level) ---------------------------------------
    const N = this.N, V = N + 1;
    const pos = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const o = (j * V + i) * 3; pos[o] = i; pos[o + 1] = 0; pos[o + 2] = j; }
    const idx = new (V * V > 65535 ? Uint32Array : Uint16Array)(N * N * 6);
    let k = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * V + i, b = a + 1, c = a + V, d = c + 1;   // a=(i,j) b=(i+1,j) c=(i,j+1) d=(i+1,j+1)
        idx[k++] = a; idx[k++] = c; idx[k++] = d;
        idx[k++] = a; idx[k++] = d; idx[k++] = b;
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.instanceCount = this.levels;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geometry = geo;

    // --- material -----------------------------------------------------------------
    const base = [];
    for (let L = 0; L < this.levels; L++) base.push(new THREE.Vector2());
    this.uniforms = {
      ...sharedUniforms,
      uHeights: { value: this.rt.texture },
      uLevelBase: { value: base },
      uMinLevel: { value: 0 },
      uS0: { value: this.s0 },
      uCamPos: { value: new THREE.Vector3() },
      uFlat: { value: 0 },
      uRefWorld: { value: new THREE.Vector2() },
      uRefMod: { value: new THREE.Vector2() },
      uAnchor: { value: new THREE.Vector2() },
      uDetail: { value: detail },
      tNoise: { value: textures.noise },
      tWaves: { value: textures.waves },
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
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'env.terrain';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = -10;
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
    u.uMinLevel.value = this.minLevel;
    u.uCamPos.value.set(cam.x - refx, cam.y, cam.z - refz);
    u.uRefWorld.value.set(refx, refz);
    const mx = pmod(refx, MOD), mz = pmod(refz, MOD);
    u.uRefMod.value.set(mx, mz);
    u.uAnchor.value.set((refx - mx) / 1024, (refz - mz) / 1024);
    this.geometry.instanceCount = this.levels - this.minLevel;
    this.mesh.position.set(refx, 0, refz);
  }

  dispose() {
    this.rt.dispose(); this.geometry.dispose(); this.material.dispose(); this.bakeMat.dispose();
  }
}

/** CPU ground height (water surface where wet), shared by app.world.groundHeight. */
export function makeGroundHeight(app) {
  return (x, z) => {
    const dep = app.world.departureOrigin, arr = app.world.arrivalOrigin;
    const h = GEO.terrainHeight(x, z, dep, arr);
    if (h < 0 && GEO.waterMask(x, z, dep, arr) > 0.5) return 0;
    return h;
  };
}
