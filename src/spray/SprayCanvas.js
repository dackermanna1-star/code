// The paint itself: where it goes, how it builds up and how it runs.
//
// Paint is deposited into "canvases" (see sprayGLSL.js): 2 x 2 m projectors on
// a grid over each sprayed plane, each owning a 512 x 512 tile of an array
// render target. Every frame the spray becomes a chain of stamps: elliptical
// Gaussians (stretched when the can is held at an angle) with a grainy core
// and sparse overspray droplets, spaced finely enough that fast strokes stay
// continuous. Coverage follows film thickness (1 - exp(-t / t0)), so a quick
// pass is translucent and slow or repeated passes go solid.
//
// A coarse CPU copy of the wet film thickness on vertical canvases drives the
// drips: where too much paint sits for too long, a run breaks loose, slides
// down under gravity, picks up wet paint on its way, slows as it skins over
// and ends in a bead. Everything that changes the paint goes through
// process*() with explicit dt, so the whole history can be replayed exactly
// from the event log (undo, and the paint surviving a reload).
import * as THREE from 'three';
import { shared } from '../render/shaderlib.js';
import { IRR } from '../world/irradiance.js';
import { RNG } from '../core/rng.js';
import { SPRAY_TILES_PER_ROW, SPRAY_TILE, SPRAY_SIZE } from './sprayGLSL.js';

const TPL = SPRAY_TILES_PER_ROW * SPRAY_TILES_PER_ROW; // tiles per layer
const LAYER_PX = SPRAY_TILE * SPRAY_TILES_PER_ROW;
const WET_RES = 128; // CPU wet-film cells per canvas side
const CELL = SPRAY_SIZE / WET_RES;
const CELL_AREA = CELL * CELL;
const T0 = 12; // µm of wet film that hides the surface by 1 - 1/e
const DRIP_T = 105; // µm of wet film before paint starts to run
const DRY_TAU = 6; // s, wet film relaxation (solvent flash-off)
const MAX_STAMPS = 6144;
const MAX_DRIPS = 48;

/** Cap behaviour: sigma = s0 + k * distance (m); Q = wet paint volume rate (m³/s); over = overspray. */
export const CAPS = {
  skinny: { s0: 0.0014, k: 0.025, Q: 0.35e-6, over: 0.3 },
  standard: { s0: 0.002, k: 0.055, Q: 1.1e-6, over: 0.45 },
  fat: { s0: 0.004, k: 0.15, Q: 2.7e-6, over: 0.7 },
  // flat fan: wide along the slit, thin across it
  calligraphy: { s0: 0.002, k: 0.12, kMinor: 0.015, Q: 1.2e-6, over: 0.3, fan: true },
};

export const FINISHES = {
  matte: { metal: 0.0, smooth: 0.22 },
  gloss: { metal: 0.0, smooth: 0.6 },
  chrome: { metal: 0.95, smooth: 0.72 },
};

const KIND = { spray: 0, capsule: 1, disc: 2 };

const STAMP_VS = /* glsl */ `
precision highp float;
in vec2 position;
in vec4 iA; // canvas-local centre (m), axis (unit)
in vec4 iB; // spray: sx, sy, peak µm, overspray | capsule: half length, radius, opacity | disc: radius, -, opacity
in vec4 iC; // linear colour, seed
in vec4 iD; // metal, smoothness, wetness, tile + 16 * kind
out vec2 vQ;
flat out vec4 vA;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out float vKind;
uniform vec3 uQuad; // material pass: quadrant offset + scale inside the material layer
void main() {
  float kind = floor(iD.w / 16.0);
  float tile = iD.w - kind * 16.0;
  vec2 ax = iA.zw, ay = vec2(-ax.y, ax.x);
  vec2 ext;
  if (kind < 0.5) ext = iB.xy * (3.6 + 5.0 * iB.w);
  else if (kind < 1.5) ext = vec2(iB.x + iB.y, iB.y) + 0.006;
  else ext = vec2(iB.x) + 0.006;
  // axis-aligned bounds of the rotated footprint, clipped to the tile
  vec2 h = abs(ax) * ext.x + abs(ay) * ext.y;
  vec2 q = clamp(iA.xy + position * h, vec2(-0.01), vec2(${(SPRAY_SIZE + 0.01).toFixed(3)}));
  vQ = q;
  vA = iA; vB = iB; vC = iC; vD = iD; vKind = kind;
  vec2 t = vec2(mod(tile, ${SPRAY_TILES_PER_ROW.toFixed(1)}), floor(tile / ${SPRAY_TILES_PER_ROW.toFixed(1)}));
  vec2 luv = (t + q * ${(1 / SPRAY_SIZE).toFixed(6)}) * ${(1 / SPRAY_TILES_PER_ROW).toFixed(6)};
  gl_Position = vec4((uQuad.xy + luv * uQuad.z) * 2.0 - 1.0, 0.0, 1.0);
}
`;

const STAMP_FS = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vQ;
flat in vec4 vA;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in float vKind;
uniform float uMatPass;
out vec4 fragColor;
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
void main() {
  if (vQ.x < 0.0 || vQ.y < 0.0 || vQ.x >= ${SPRAY_SIZE.toFixed(1)} || vQ.y >= ${SPRAY_SIZE.toFixed(1)}) discard;
  vec2 ax = vA.zw, ay = vec2(-ax.y, ax.x);
  vec2 d = vQ - vA.xy;
  float a = 0.0;
  if (vKind < 0.5) {
    ivec2 tx = ivec2(floor(vQ * ${(SPRAY_TILE / SPRAY_SIZE).toFixed(1)}));
    vec3 h = vec3(pcg3d(uvec3(uvec2(tx + 4096), uint(vC.w)))) * (1.0 / 4294967296.0);
    vec2 e = vec2(dot(d, ax), dot(d, ay)) / vB.xy;
    float r2 = dot(e, e);
    // grainy core: droplets arrive unevenly, repeated passes average out
    float dep = vB.z * exp(-0.5 * pow(r2, 1.35)) * (0.72 + 0.56 * h.x);
    a = 1.0 - exp(-dep / ${T0.toFixed(1)});
    // overspray: sparse fine droplets in a wide halo, in proportion to the paint delivered
    float halo = exp(-0.5 * r2 / (3.0 + 9.0 * vB.w));
    if (h.y < vB.w * halo * min(0.04, vB.z * 0.004)) a = max(a, 0.08 + 0.42 * h.z);
  } else if (vKind < 1.5) {
    float along = clamp(dot(d, ax), -vB.x, vB.x);
    float dist = length(d - ax * along);
    a = vB.z * (1.0 - smoothstep(vB.y - 0.0018, vB.y + 0.0012, dist));
  } else {
    float dist = length(d);
    a = vB.z * (1.0 - smoothstep(vB.x - 0.0018, vB.x + 0.0012, dist));
  }
  if (a < 0.0015) discard;
  fragColor = uMatPass < 0.5 ? vec4(vC.rgb * a, a) : vec4(vD.xyz * a, a);
}
`;

// whole-tile passes: clear (no blending) and wet decay (multiply)
const TILE_VS = /* glsl */ `
precision highp float;
in vec2 position;
in vec4 iD;
uniform vec3 uQuad;
void main() {
  float tile = iD.w;
  vec2 t = vec2(mod(tile, ${SPRAY_TILES_PER_ROW.toFixed(1)}), floor(tile / ${SPRAY_TILES_PER_ROW.toFixed(1)}));
  vec2 luv = (t + position * 0.5 + 0.5) * ${(1 / SPRAY_TILES_PER_ROW).toFixed(6)};
  gl_Position = vec4((uQuad.xy + luv * uQuad.z) * 2.0 - 1.0, 0.0, 1.0);
}
`;
const TILE_FS = /* glsl */ `
precision highp float;
uniform vec4 uOut;
out vec4 fragColor;
void main() { fragColor = uOut; }
`;

const v3 = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class SprayCanvas {
  constructor(engine) {
    this.engine = engine;
    this.ready = false;
    this.planes = new Map();
    this.canvasByKey = new Map();
    this.slots = [];
    this.drips = [];
    this.wetCanvases = new Set();
    this.rng = new RNG(90210);
    this.seed = 1;
    this.useClock = 0;
    this.prev = null; // last spray sample of the running stroke
    this.time = 0; // live clock (cosmetic wetness only)
    this.dirty = false;
    this.sinceStamp = 0;
    this.gridFull = 0;
    this._t = [v3(), v3(), v3(), v3()];
  }

  /** Allocate GPU resources (lazily: only once the player paints or saved paint exists). */
  init() {
    if (this.ready) return this;
    const r = this.engine.renderer;
    const q = this.engine.params.quality;
    this.layers = q === 'high' ? 4 : q === 'medium' ? 2 : 1;
    this.maxCanvases = this.layers * TPL;
    // one atlas array: colour layers, then material layers holding four colour
    // layers' material at half resolution each (one quadrant per colour layer).
    // Two samplers in total keep the wall shader within 16 texture units.
    this.matLayer0 = this.layers;
    const t = new THREE.WebGLArrayRenderTarget(LAYER_PX, LAYER_PX, this.layers + Math.ceil(this.layers / 4), {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });
    t.texture.colorSpace = THREE.SRGBColorSpace; // material values round-trip exactly through the sRGB encode/decode
    t.texture.anisotropy = 4;
    r.initRenderTarget(t); // allocates the full mip chain
    t.texture.generateMipmaps = false; // regenerated by hand when strokes settle
    this.atlas = t;

    // float data texture: 1 m lookup grid (up to four canvas ids + 1 per cell) plus
    // one extra slice of canvas parameters (4 texels per canvas)
    this.gmin = IRR.min.clone();
    this.gn = [Math.round(IRR.max.x - IRR.min.x), Math.round(IRR.max.y - IRR.min.y), Math.round(IRR.max.z - IRR.min.z)];
    const [gx, gy, gz] = this.gn;
    this.data = new Float32Array(4 * gx * gy * (gz + 1));
    this.dataTex = new THREE.Data3DTexture(this.data, gx, gy, gz + 1);
    this.dataTex.format = THREE.RGBAFormat;
    this.dataTex.type = THREE.FloatType;
    this.dataTex.minFilter = this.dataTex.magFilter = THREE.NearestFilter;
    this.dataTex.needsUpdate = true;

    // stamp renderer
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.inst = {};
    for (const k of ['iA', 'iB', 'iC', 'iD']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a);
      this.inst[k] = a;
    }
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // 2D positions: skip the auto bounds
    this.stampGeo = geo;
    this.stampMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: STAMP_VS,
      fragmentShader: STAMP_FS,
      uniforms: { uMatPass: { value: 0 }, uQuad: { value: new THREE.Vector3(0, 0, 1) } },
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, this.stampMat);
    mesh.frustumCulled = false;
    this.stampScene = new THREE.Scene();
    this.stampScene.add(mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // tile passes
    const tgeo = new THREE.InstancedBufferGeometry();
    tgeo.setAttribute('position', geo.getAttribute('position'));
    tgeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.tileD = new THREE.InstancedBufferAttribute(new Float32Array(TPL * 4 * 4), 4);
    this.tileD.setUsage(THREE.DynamicDrawUsage);
    tgeo.setAttribute('iD', this.tileD);
    tgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.tileGeo = tgeo;
    this.clearMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: TILE_VS, fragmentShader: TILE_FS,
      uniforms: { uOut: { value: new THREE.Vector4(0, 0, 0, 0) }, uQuad: { value: new THREE.Vector3(0, 0, 1) } },
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    this.decayMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: TILE_VS, fragmentShader: TILE_FS,
      uniforms: { uOut: { value: new THREE.Vector4(1, 1, 1, 1) }, uQuad: { value: new THREE.Vector3(0, 0, 1) } },
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false,
    });
    const tmesh = new THREE.Mesh(tgeo, this.clearMat);
    tmesh.frustumCulled = false;
    this.tileMesh = tmesh;
    this.tileScene = new THREE.Scene();
    this.tileScene.add(tmesh);

    this.queue = []; // pending stamps: { layer, a, b, c, d } as flat arrays
    this.qn = 0;
    this.qbuf = new Float32Array(MAX_STAMPS * 16);
    this.qlayer = new Uint8Array(MAX_STAMPS);

    shared.uSprayData.value = this.dataTex;
    shared.uSprayAtlas.value = this.atlas.texture;
    shared.uSprayMatLayer.value = this.matLayer0;
    shared.uSprayDims.value.set(gx, gy, gz);
    shared.uSprayGridMin.value.copy(this.gmin);
    shared.uSprayGridInv.value.set(1 / gx, 1 / gy, 1 / gz);
    this.ready = true;
    return this;
  }

  get coverage() {
    return this.ready ? this.slots.filter(Boolean).length / this.maxCanvases : 0;
  }

  // ───────────────────────── planes & canvases ─────────────────────────

  /** The paint plane through point p with normal n (snapped so nearby hits share canvases). */
  planeFor(p, n) {
    const N = v3().copy(n).normalize();
    if (Math.abs(N.y) > 0.9) N.set(0, Math.sign(N.y), 0);
    else {
      // walls are axis-aligned: snap near-axis normals exactly
      const ax = Math.abs(N.x), az = Math.abs(N.z);
      if (Math.max(ax, az) > 0.985 && Math.abs(N.y) < 0.12) N.set(ax > az ? Math.sign(N.x) : 0, 0, ax > az ? 0 : Math.sign(N.z));
      else N.set(Math.round(N.x * 64) / 64, Math.round(N.y * 64) / 64, Math.round(N.z * 64) / 64).normalize();
    }
    const d = Math.round(p.dot(N) / 0.02) * 0.02;
    const key = `${N.x.toFixed(3)},${N.y.toFixed(3)},${N.z.toFixed(3)}|${Math.round(d / 0.02)}`;
    let pl = this.planes.get(key);
    if (pl) return pl;
    const U = Math.abs(N.y) > 0.9 ? v3().set(1, 0, 0) : v3().crossVectors(UP, N).normalize();
    const V = v3().crossVectors(N, U).normalize();
    const g = new THREE.Vector2(-UP.dot(U), -UP.dot(V));
    const wall = Math.abs(N.y) < 0.35;
    pl = {
      key, N, U, V, d, g,
      drips: g.length() > 0.5,
      slabBack: wall ? -0.36 : -0.1,
      slabFront: wall ? 0.3 : 0.1,
    };
    this.planes.set(key, pl);
    return pl;
  }

  /** World point on a plane from plane coordinates. */
  planePoint(pl, u, v, out) {
    return out.copy(pl.N).multiplyScalar(pl.d).addScaledVector(pl.U, u).addScaledVector(pl.V, v);
  }

  canvasAt(pl, iu, iv, create) {
    const key = `${pl.key}|${iu}|${iv}`;
    let c = this.canvasByKey.get(key);
    if (c || !create) return c ?? null;
    let slot = this.slots.findIndex((s) => !s);
    if (slot < 0) {
      // full: recycle the canvas painted least recently
      let best = 0;
      for (let i = 1; i < this.slots.length; i++) if (this.slots[i].lastUse < this.slots[best].lastUse) best = i;
      if (this.slots.length < this.maxCanvases) best = this.slots.length;
      else this.freeCanvas(this.slots[best]);
      slot = best;
    }
    c = { key, plane: pl, iu, iv, slot, layer: Math.floor(slot / TPL), tile: slot % TPL, lastUse: this.useClock, wet: null, wetMax: 0 };
    c.origin = this.planePoint(pl, iu * SPRAY_SIZE, iv * SPRAY_SIZE, v3());
    this.slots[slot] = c;
    this.canvasByKey.set(key, c);
    this.writeParams(c);
    this.registerGrid(c, true);
    this.clearTile(c);
    shared.uSprayOn.value = 1;
    return c;
  }

  freeCanvas(c) {
    this.registerGrid(c, false);
    this.canvasByKey.delete(c.key);
    this.wetCanvases.delete(c);
    this.slots[c.slot] = null;
    this.drips = this.drips.filter((d) => d.lastCanvas !== c);
  }

  writeParams(c) {
    const pl = c.plane;
    const rows = [[c.origin.x, c.origin.y, c.origin.z, pl.slabBack], [pl.U.x, pl.U.y, pl.U.z, pl.slabFront], [pl.V.x, pl.V.y, pl.V.z, c.layer], [pl.N.x, pl.N.y, pl.N.z, c.tile]];
    rows.forEach((row, k) => this.data.set(row, this.paramOffset(c.slot * 4 + k)));
    this.dataTex.needsUpdate = true;
  }

  /** Offset in the data texture of parameter texel t (the slice after the grid). */
  paramOffset(t) {
    const [nx, ny, nz] = this.gn;
    return 4 * ((t % nx) + nx * (Math.floor(t / nx) + ny * nz));
  }

  registerGrid(c, add) {
    const pl = c.plane;
    const min = this._t[0].set(Infinity, Infinity, Infinity), max = this._t[1].set(-Infinity, -Infinity, -Infinity);
    const p = this._t[2];
    for (const a of [0, SPRAY_SIZE]) for (const b of [0, SPRAY_SIZE]) for (const n of [pl.slabBack, pl.slabFront]) {
      p.copy(c.origin).addScaledVector(pl.U, a).addScaledVector(pl.V, b).addScaledVector(pl.N, n);
      min.min(p);
      max.max(p);
    }
    const [nx, ny, nz] = this.gn;
    const id = c.slot + 1;
    const i0 = Math.max(0, Math.floor(min.x - this.gmin.x)), i1 = Math.min(nx - 1, Math.floor(max.x - this.gmin.x - 1e-4));
    const j0 = Math.max(0, Math.floor(min.y - this.gmin.y)), j1 = Math.min(ny - 1, Math.floor(max.y - this.gmin.y - 1e-4));
    const k0 = Math.max(0, Math.floor(min.z - this.gmin.z)), k1 = Math.min(nz - 1, Math.floor(max.z - this.gmin.z - 1e-4));
    const G = this.data;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = 4 * (i + nx * (j + ny * k));
      if (add) {
        let placed = false;
        for (let s = 0; s < 4; s++) if (G[o + s] === 0 || G[o + s] === id) { G[o + s] = id; placed = true; break; }
        if (!placed) this.gridFull++;
      } else {
        // remove and keep the slots packed (the shader stops at the first empty one)
        const ids = [G[o], G[o + 1], G[o + 2], G[o + 3]].filter((x) => x && x !== id);
        for (let s = 0; s < 4; s++) G[o + s] = ids[s] ?? 0;
      }
    }
    this.dataTex.needsUpdate = true;
  }

  // ───────────────────────── stamps ─────────────────────────

  /** Queue a stamp at plane coords (u, v); it lands on every canvas it overlaps. */
  stamp(pl, u, v, kind, ax, ay, b0, b1, b2, b3, color, mat, reach, allocReach) {
    const S = SPRAY_SIZE;
    const iu0 = Math.floor((u - reach) / S), iu1 = Math.floor((u + reach) / S);
    const iv0 = Math.floor((v - reach) / S), iv1 = Math.floor((v + reach) / S);
    for (let iv = iv0; iv <= iv1; iv++) for (let iu = iu0; iu <= iu1; iu++) {
      // only the core may open new canvases; faint halos land on existing ones
      const near = u + allocReach > iu * S && u - allocReach < (iu + 1) * S && v + allocReach > iv * S && v - allocReach < (iv + 1) * S;
      const c = this.canvasAt(pl, iu, iv, near);
      if (!c) continue;
      c.lastUse = this.useClock;
      c.paintTime = this.time;
      if (this.qn >= MAX_STAMPS) this.flush();
      const o = this.qn * 16;
      const B = this.qbuf;
      B[o] = u - iu * S; B[o + 1] = v - iv * S; B[o + 2] = ax; B[o + 3] = ay;
      B[o + 4] = b0; B[o + 5] = b1; B[o + 6] = b2; B[o + 7] = b3;
      B[o + 8] = color[0]; B[o + 9] = color[1]; B[o + 10] = color[2]; B[o + 11] = (this.seed = (this.seed * 1103 + 12345) % 16777213);
      B[o + 12] = mat[0]; B[o + 13] = mat[1]; B[o + 14] = mat[2]; B[o + 15] = c.tile + 16 * kind;
      this.qlayer[this.qn] = c.layer;
      this.qn++;
      this.dirty = true;
      this.sinceStamp = 0;
    }
  }

  /** Render queued stamps into the atlases (colour at full res, material at half). */
  flush() {
    if (!this.ready || !this.qn) return;
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    const B = this.qbuf;
    for (let layer = 0; layer < this.layers; layer++) {
      let n = 0;
      for (let i = 0; i < this.qn; i++) {
        if (this.qlayer[i] !== layer) continue;
        if (n >= MAX_STAMPS) break;
        const o = i * 16;
        this.inst.iA.array.set(B.subarray(o, o + 4), n * 4);
        this.inst.iB.array.set(B.subarray(o + 4, o + 8), n * 4);
        this.inst.iC.array.set(B.subarray(o + 8, o + 12), n * 4);
        this.inst.iD.array.set(B.subarray(o + 12, o + 16), n * 4);
        n++;
      }
      if (!n) continue;
      for (const k of ['iA', 'iB', 'iC', 'iD']) {
        const a = this.inst[k];
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 4);
        a.needsUpdate = true;
      }
      this.stampGeo.instanceCount = n;
      const u = this.stampMat.uniforms;
      u.uMatPass.value = 0;
      u.uQuad.value.set(0, 0, 1);
      r.setRenderTarget(this.atlas, layer);
      r.render(this.stampScene, this.cam);
      u.uMatPass.value = 1;
      this.matQuad(layer, u.uQuad.value);
      r.setRenderTarget(this.atlas, this.matLayer0 + (layer >> 2));
      r.render(this.stampScene, this.cam);
    }
    this.qn = 0;
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
  }

  /** Quadrant of the material layer that holds colour layer `layer`'s material. */
  matQuad(layer, out) {
    const q = layer % 4;
    return out.set((q & 1) * 0.5, (q >> 1) * 0.5, 0.5);
  }

  /** Run a whole-tile pass (clear or wet decay) over canvases: colour and/or material. */
  tilePass(canvases, mat, color, material) {
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.tileMesh.material = mat;
    const quad = mat.uniforms.uQuad.value;
    for (let layer = 0; layer < this.layers; layer++) {
      const list = canvases.filter((c) => c.layer === layer);
      if (!list.length) continue;
      list.forEach((c, i) => this.tileD.setXYZW(i, 0, 0, 0, c.tile));
      this.tileD.clearUpdateRanges();
      this.tileD.needsUpdate = true;
      this.tileGeo.instanceCount = list.length;
      if (color) {
        quad.set(0, 0, 1);
        r.setRenderTarget(this.atlas, layer);
        r.render(this.tileScene, this.cam);
      }
      if (material) {
        this.matQuad(layer, quad);
        r.setRenderTarget(this.atlas, this.matLayer0 + (layer >> 2));
        r.render(this.tileScene, this.cam);
      }
    }
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
  }

  clearTile(c) {
    this.flush();
    this.tilePass([c], this.clearMat, true, true);
  }

  /** Rebuild mip levels once painting pauses (distant walls sample them). */
  updateMips() {
    if (!this.ready) return;
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.empty = this.empty ?? new THREE.Scene();
    const rt = this.atlas;
    rt.texture.generateMipmaps = true;
    r.setRenderTarget(rt, 0);
    r.render(this.empty, this.cam); // render() regenerates the mips of the bound target
    rt.texture.generateMipmaps = false;
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
    this.dirty = false;
  }

  // ───────────────────────── wet film (CPU) ─────────────────────────

  wetAdd(c, lu, lv, sx, sy, ax, ay, peak, candidates) {
    if (!c.wet) {
      c.wet = new Float32Array(WET_RES * WET_RES);
      c.wetThr = new Float32Array(WET_RES * WET_RES);
      for (let i = 0; i < c.wetThr.length; i++) c.wetThr[i] = DRIP_T * (0.75 + 0.5 * this.hash(c.slot * 7919 + i));
    }
    this.wetCanvases.add(c);
    // keep the footprint at least a cell wide, conserving volume
    const ex = Math.max(sx, CELL * 0.6), ey = Math.max(sy, CELL * 0.6);
    const pk = peak * (sx * sy) / (ex * ey);
    const R = 3 * Math.max(ex, ey);
    const i0 = Math.max(0, Math.floor((lu - R) / CELL)), i1 = Math.min(WET_RES - 1, Math.floor((lu + R) / CELL));
    const j0 = Math.max(0, Math.floor((lv - R) / CELL)), j1 = Math.min(WET_RES - 1, Math.floor((lv + R) / CELL));
    const W = c.wet;
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * CELL - lv;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * CELL - lu;
        const e1 = (x * ax + y * ay) / ex, e2 = (-x * ay + y * ax) / ey;
        const g = Math.exp(-0.5 * (e1 * e1 + e2 * e2));
        if (g < 0.01) continue;
        const k = j * WET_RES + i;
        W[k] += pk * g;
        if (W[k] > c.wetThr[k]) candidates.push(c, k);
        if (W[k] > c.wetMax) c.wetMax = W[k];
      }
    }
  }

  hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = Math.imul(n, 9);
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }

  // ───────────────────────── processing (deterministic) ─────────────────────────

  /**
   * One frame of spraying. f = { hit, normal, nozzle, right, pressure, dt } (THREE.Vector3s),
   * s = stroke settings { lin: [r,g,b], cap, width, flow, finish, drips }.
   */
  processSpray(f, s) {
    this.useClock++;
    const pl = this.planeFor(f.hit, f.normal);
    const cap = CAPS[s.cap] ?? CAPS.standard;
    const fin = FINISHES[s.finish] ?? FINISHES.gloss;
    const dir = this._t[3].subVectors(f.hit, f.nozzle);
    const dist = Math.max(0.025, dir.length());
    dir.divideScalar(dist);
    const cosI = Math.max(0.28, Math.abs(dir.dot(pl.N)));
    const sigma = (cap.s0 + dist * cap.k) * s.width;
    let ax, ay, sx, sy;
    if (cap.fan) {
      // calligraphy: the slit stays level with the view
      ax = f.right.dot(pl.U);
      ay = f.right.dot(pl.V);
      sx = sigma;
      sy = (cap.s0 + dist * cap.kMinor) * Math.sqrt(s.width);
    } else {
      ax = dir.dot(pl.U);
      ay = dir.dot(pl.V);
      sx = sigma / cosI;
      sy = sigma;
    }
    const al = Math.hypot(ax, ay);
    if (al < 1e-4) {
      ax = 1;
      ay = 0;
    } else {
      ax /= al;
      ay /= al;
    }
    // transfer efficiency falls off when the can is held too far away
    const eff = Math.max(0, Math.min(1, 1 - (dist - 0.55) / 0.9));
    const Q = cap.Q * s.flow * f.pressure * s.width * eff;
    const rate = (Q / (2 * Math.PI * sx * sy)) * 1e6; // µm/s at the centre
    const over = Math.min(1, cap.over * Math.max(0.3, Math.min(2.2, dist / 0.35)));
    const u = f.hit.dot(pl.U), v = f.hit.dot(pl.V);
    const mat = [fin.metal, fin.smooth, 1];
    const p = this.prev;
    const cont = p && p.plane === pl;
    let n = 1;
    if (cont) {
      const len = Math.hypot(u - p.u, v - p.v);
      n = Math.max(1, Math.min(64, Math.ceil(len / (0.38 * Math.min(p.sy, sy)))));
      if (len > 0.6) n = 1; // a jump (the aim crossed an edge): don't smear across it
    }
    const candidates = [];
    for (let i = 1; i <= n; i++) {
      const t = cont && n > 1 ? i / n : 1;
      const uu = cont ? p.u + (u - p.u) * t : u, vv = cont ? p.v + (v - p.v) * t : v;
      const ssx = cont ? p.sx + (sx - p.sx) * t : sx, ssy = cont ? p.sy + (sy - p.sy) * t : sy;
      const peak = (rate * f.dt) / n;
      if (peak <= 0) continue;
      const core = 3.2 * Math.max(ssx, ssy);
      this.stamp(pl, uu, vv, KIND.spray, ax, ay, ssx, ssy, peak, over, s.lin, mat, core * (1 + 1.4 * over), core);
      if (s.drips && pl.drips) {
        const S = SPRAY_SIZE;
        const iu = Math.floor(uu / S), iv = Math.floor(vv / S);
        for (const [du, dv] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const c = this.canvasAt(pl, iu + du, iv + dv, false);
          if (!c) continue;
          const lu = uu - c.iu * S, lv = vv - c.iv * S;
          if (lu < -core || lv < -core || lu > S + core || lv > S + core) continue;
          this.wetAdd(c, lu, lv, ssx, ssy, ax, ay, peak, candidates);
        }
      }
    }
    // spits: a few fat droplets at the start of a stroke and when feathering
    const spitP = (cont ? 0.02 : 0.6) + (f.pressure < 0.45 ? 0.08 : 0);
    if (this.rng.next() < spitP) {
      const k = 1 + Math.floor(this.rng.next() * 2.5);
      for (let i = 0; i < k; i++) {
        const a = this.rng.next() * Math.PI * 2, rr = sigma * (0.4 + 2.2 * this.rng.next());
        this.stamp(pl, u + Math.cos(a) * rr, v + Math.sin(a) * rr, KIND.disc, 1, 0, 0.0008 + 0.0022 * this.rng.next(), 0, 0.9, 0, s.lin, mat, 0.01, 0);
      }
    }
    this.prev = { plane: pl, u, v, sx, sy };
    if (candidates.length) this.spawnDrips(candidates, s);
  }

  /** The current stroke ended (next spray frame starts fresh). */
  endStroke() {
    this.prev = null;
  }

  spawnDrips(cand, s) {
    for (let i = 0; i < cand.length; i += 2) {
      if (this.drips.length >= MAX_DRIPS) break;
      const c = cand[i], k = cand[i + 1];
      const W = c.wet;
      if (W[k] <= c.wetThr[k]) continue;
      const ci = k % WET_RES, cj = (k / WET_RES) | 0;
      const u = c.iu * SPRAY_SIZE + (ci + 0.3 + 0.4 * this.rng.next()) * CELL;
      const v = c.iv * SPRAY_SIZE + (cj + 0.5) * CELL;
      // runs need room: no new drip right next to a young one
      let crowded = false;
      for (const d of this.drips) if (d.plane === c.plane && d.age < 0.6 && Math.abs(d.u - u) < 0.014 && Math.abs(d.v - v) < 0.05) crowded = true;
      if (crowded) continue;
      const vol = (W[k] - 0.55 * c.wetThr[k]) * 1e-6 * CELL_AREA * 1.6;
      W[k] = 0.55 * c.wetThr[k];
      if (cj > 0) W[k - WET_RES] *= 0.7;
      this.drips.push({ plane: c.plane, u, v, vol, age: 0, lin: s.lin.slice(), mat: [FINISHES[s.finish]?.metal ?? 0, FINISHES[s.finish]?.smooth ?? 0.6, 1], wob: this.rng.next() * 6.28, lastCanvas: c });
    }
  }

  /** Advance drips and drying by dt (called every frame while anything is wet). */
  processTick(dt) {
    if (!this.ready || dt <= 0) return;
    // drips
    const S = SPRAY_SIZE;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.age += dt;
      const g = d.plane.g;
      const gl = g.length();
      const visc = Math.exp(-d.age / 2.4);
      const speed = Math.min(0.11, 0.032 * Math.pow(d.vol / 5e-9, 0.6)) * visc * gl;
      const w = Math.min(0.0055, Math.max(0.0013, 0.0024 * Math.cbrt(d.vol / 5e-9)));
      const step = speed * dt;
      const u0 = d.u, v0 = d.v;
      if (step > 1e-6) {
        d.wob += step * 140;
        const side = Math.sin(d.wob) * 0.00035 + (this.rng.next() - 0.5) * 0.0004;
        d.u += (g.x / gl) * step - (g.y / gl) * side;
        d.v += (g.y / gl) * step + (g.x / gl) * side;
        // pick up wet paint on the way down
        const c = this.canvasAt(d.plane, Math.floor(d.u / S), Math.floor(d.v / S), false);
        if (c && c.wet) {
          const ci = Math.floor((d.u - c.iu * S) / CELL), cj = Math.floor((d.v - c.iv * S) / CELL);
          if (ci >= 0 && cj >= 0 && ci < WET_RES && cj < WET_RES) {
            const k = cj * WET_RES + ci;
            const ex = c.wet[k] - 40;
            if (ex > 0) {
              d.vol += ex * 0.6 * 1e-6 * CELL_AREA;
              c.wet[k] -= ex * 0.6;
            }
          }
        }
        d.vol -= w * step * 70e-6;
        // trail
        const mu = (u0 + d.u) / 2, mv = (v0 + d.v) / 2;
        const du = d.u - u0, dv = d.v - v0, len = Math.hypot(du, dv) || 1e-6;
        this.stamp(d.plane, mu, mv, KIND.capsule, du / len, dv / len, len / 2, w / 2, 0.93, 0, d.lin, d.mat, w + len, w + len);
        const wp = this.planePoint(d.plane, d.u, d.v, this._t[2]);
        const ground = this.engine.world?.groundHeight?.(wp.x, wp.z) ?? 0;
        if (wp.y < ground + 0.004) d.vol = 0;
      }
      if (d.vol < 0.7e-9 || speed < 0.0018) {
        // the run skins over and stops in a bead
        this.stamp(d.plane, d.u, d.v, KIND.disc, 1, 0, w * 0.82, 0, 0.96, 0, d.lin, d.mat, w, w);
        this.drips.splice(i, 1);
      }
    }
    // drying
    this.dryFor(dt);
    this.sinceStamp += dt;
  }

  /** Wet film relaxes; canvases that have dried out release their CPU field. */
  dryFor(t) {
    if (!this.wetCanvases.size) return;
    const k = Math.exp(-t / DRY_TAU);
    for (const c of this.wetCanvases) {
      const W = c.wet;
      for (let i = 0; i < W.length; i++) W[i] *= k;
      c.wetMax *= k;
      if (c.wetMax < 4) {
        c.wet = null;
        c.wetThr = null;
        c.wetMax = 0;
        this.wetCanvases.delete(c);
      }
    }
  }

  /** Long idle stretch (nothing running): analytic drying only. */
  processIdle(seconds) {
    this.dryFor(seconds);
  }

  /** True while drips run or paint is still wet enough to matter for the log. */
  get active() {
    return this.drips.length > 0;
  }
  get wet() {
    return this.wetCanvases.size > 0;
  }

  /** Fresh paint glistens; fade the wetness of recently painted tiles (live only, cosmetic). */
  decayWetness(dt) {
    if (!this.ready) return;
    this.wetT = (this.wetT ?? 0) + dt;
    if (this.wetT < 0.5) return;
    const step = this.wetT;
    this.wetT = 0;
    const recent = this.slots.filter((c) => c && this.time - (c.paintTime ?? -1e9) < 150);
    if (!recent.length) return;
    // wetness halves in ~20 s
    const k = Math.pow(0.5, step / 20);
    this.decayMat.uniforms.uOut.value.set(1, 1, k, 1);
    this.flush();
    this.tilePass(recent, this.decayMat, false, true);
  }

  /** Remove all paint and state (GPU tiles, canvases, drips). */
  clearAll() {
    this.drips = [];
    this.prev = null;
    this.wetCanvases.clear();
    if (!this.ready) return;
    this.qn = 0;
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget();
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    for (let layer = 0; layer < this.atlas.depth; layer++) {
      r.setRenderTarget(this.atlas, layer);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
    }
    r.setClearColor(cc, ca);
    r.setRenderTarget(prevRT);
    this.planes.clear();
    this.canvasByKey.clear();
    this.slots = [];
    this.data.fill(0);
    this.dataTex.needsUpdate = true;
    shared.uSprayOn.value = 0;
    this.rng = new RNG(90210);
    this.seed = 1;
    this.useClock = 0;
    this.updateMips();
  }

  /** Dry every tile instantly (after replaying saved paint). */
  dryAll() {
    if (!this.ready) return;
    this.flush();
    const all = this.slots.filter(Boolean);
    if (!all.length) return;
    this.decayMat.uniforms.uOut.value.set(1, 1, 0, 1);
    this.tilePass(all, this.decayMat, false, true);
  }

  /** Per-frame upkeep: flush stamps, refresh mips when painting pauses. */
  update(dt) {
    if (!this.ready) return;
    this.time += dt;
    this.flush();
    this.decayWetness(dt);
    if (this.dirty && this.sinceStamp > 0.35) this.updateMips();
  }
}
