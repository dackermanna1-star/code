// =============================================================================
// ROAD FIELD TEXTURES — GPU rasterisation of the road corridor into the float
// textures declared by geo.js GEO_UNIFORMS (consumed by the terrain GLSL via
// busRoadSample / geoApplyRoad):
//   texel = (ry road surface height at the nearest centreline point,
//            d horizontal distance to the centreline (1e6 = none),
//            mode (1 carve terrain, 0 tunnel / bridge), halfW formation half width)
// exactly like RouteIndex.field() on the CPU.
//
// The centreline is simplified adaptively (lateral error < 0.12 m, vertical
// < 0.03 m) and every segment is drawn as a capsule (segment ± 420 m plus round
// caps): the fragment shader computes the exact point-segment distance,
// discards beyond 420 m and writes depth = d so the nearest road wins
// (round joins/caps → no gaps on the outside of tight curves).
//   coarse: whole route bbox, once at init (4096x2048 ≈ 18-20 m/texel on medium+)
//   fine:   ~4 km square centred on the bus, re-rendered when the bus has moved
//           more than ~1 km from its centre (2 m/texel; 4 m on 'low').
// =============================================================================
import * as THREE from 'three';
import { GEO_UNIFORMS } from '../world/geo.js';
import { ROAD_TYPES } from '../world/route.js';

const MAXD = 420;
const DEPTH_SCALE = 1 / 512;

const VERT = /* glsl */`
attribute vec4 aA;   // ax, az (rect-origin relative), ya, ma
attribute vec4 aB;   // bx, bz, yb, mb
attribute float aW;  // half width
varying vec2 vP;
varying vec4 vA;
varying vec4 vB;
varying float vW;
void main() {
  vP = position.xy; vA = aA; vB = aB; vW = aW;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
}`;
const FRAG = /* glsl */`
precision highp float;
uniform float uReversed;
varying vec2 vP;
varying vec4 vA;
varying vec4 vB;
varying float vW;
void main() {
  vec2 ab = vB.xy - vA.xy;
  float L2 = dot(ab, ab);
  float t = L2 > 0.0 ? clamp(dot(vP - vA.xy, ab) / L2, 0.0, 1.0) : 0.0;
  vec2 q = vA.xy + ab * t - vP;
  float d = length(q);
  if (d > ${MAXD.toFixed(1)}) discard;
  float ry = mix(vA.z, vB.z, t);
  float mode = mix(vA.w, vB.w, t);
  gl_FragColor = vec4(ry, d, mode, vW);
  float z = d * ${DEPTH_SCALE};
  gl_FragDepth = uReversed > 0.5 ? 1.0 - z : z;
}`;
const CLEAR_FRAG = /* glsl */`
precision highp float;
void main() { gl_FragColor = vec4(0.0, 1e6, 0.0, 0.0); }`;

/** Adaptive simplification of the 2 m centreline: returns sample indices. */
function simplify(R) {
  const keep = [0];
  const n = R.n;
  let a = 0;
  const latTol = 0.12, yTol = 0.03, maxLen = 160;
  while (a < n - 1) {
    let b = a + 1;
    // grow b while every intermediate sample stays within tolerance
    while (b + 1 < n) {
      const c = b + 1;
      if ((c - a) * R.step > maxLen) break;
      if (R.mode[c] !== R.mode[a] || R.seg[c] !== R.seg[a]) break;
      const ax = R.x[a], az = R.z[a], bx = R.x[c] - ax, bz = R.z[c] - az;
      const L2 = bx * bx + bz * bz;
      let ok = true;
      for (let k = a + 1; k < c; k++) {
        const t = ((R.x[k] - ax) * bx + (R.z[k] - az) * bz) / L2;
        const px = ax + bx * t - R.x[k], pz = az + bz * t - R.z[k];
        if (px * px + pz * pz > latTol * latTol) { ok = false; break; }
        const yl = R.y[a] + (R.y[c] - R.y[a]) * ((k - a) / (c - a));
        if (Math.abs(yl - R.y[k]) > yTol) { ok = false; break; }
      }
      if (!ok) break;
      b = c;
    }
    keep.push(b);
    a = b;
  }
  return keep;
}

export class RoadField {
  constructor(app, route) {
    this.app = app;
    this.R = route;
    const r = app.renderer;
    this.floatLinear = r.extensions.has('OES_texture_float_linear');
    this.ok = r.extensions.has('EXT_color_buffer_float');
    const detail = app.quality?.detail ?? 1;
    const b = route.index.bounds, pad = MAXD + 60;
    this.origin = { x: Math.floor(b.xMin - pad), z: Math.floor(b.zMin - pad) };
    this.coarseSize = detail >= 1 ? [4096, 2048] : [2048, 1024];
    this.fineRes = detail >= 1 ? 2048 : 1024;
    this.fineTexel = detail >= 1 ? 2 : 4;
    this.fineSpan = this.fineRes * this.fineTexel;            // ~4 km
    this.coarseRect = {
      x0: this.origin.x, z0: this.origin.z,
      w: Math.ceil(b.xMax + pad) - this.origin.x, d: Math.ceil(b.zMax + pad) - this.origin.z,
    };
    this.fineRect = null;
    this.stats = { segments: 0, coarseMs: 0, fineMs: 0, fineRenders: 0 };
    this.validation = null;

    const mkRT = (w, h) => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      minFilter: this.floatLinear ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: this.floatLinear ? THREE.LinearFilter : THREE.NearestFilter,
      generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    if (!this.ok) { console.warn('[road] float render targets unavailable: road field disabled'); return; }
    this.rtCoarse = mkRT(this.coarseSize[0], this.coarseSize[1]);
    this.rtCoarse.texture.name = 'road.fieldCoarse';
    this.rtFine = mkRT(this.fineRes, this.fineRes);
    this.rtFine.texture.name = 'road.fieldFine';

    // corridor geometry: one quad per simplified segment (capsule bounding rectangle)
    const keep = simplify(route);
    const nSeg = keep.length - 1;
    this.stats.segments = nSeg;
    const pos = new Float32Array(nSeg * 4 * 3), aA = new Float32Array(nSeg * 4 * 4), aB = new Float32Array(nSeg * 4 * 4), aW = new Float32Array(nSeg * 4);
    const idx = new Uint32Array(nSeg * 6);
    const ox = this.origin.x, oz = this.origin.z;
    for (let k = 0; k < nSeg; k++) {
      const i = keep[k], j = keep[k + 1];
      const ax = route.x[i] - ox, az = route.z[i] - oz, bx = route.x[j] - ox, bz = route.z[j] - oz;
      let dx = bx - ax, dz = bz - az;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const nx = -dz, nz = dx, E = MAXD + 2;
      const corners = [[ax - dx * E + nx * E, az - dz * E + nz * E], [bx + dx * E + nx * E, bz + dz * E + nz * E],
        [bx + dx * E - nx * E, bz + dz * E - nz * E], [ax - dx * E - nx * E, az - dz * E - nz * E]];
      const hw = ROAD_TYPES[route.seg[i]].halfW;
      for (let c = 0; c < 4; c++) {
        const v = k * 4 + c;
        pos[v * 3] = corners[c][0]; pos[v * 3 + 1] = corners[c][1]; pos[v * 3 + 2] = 0;
        aA[v * 4] = ax; aA[v * 4 + 1] = az; aA[v * 4 + 2] = route.y[i]; aA[v * 4 + 3] = route.mode[i];
        aB[v * 4] = bx; aB[v * 4 + 1] = bz; aB[v * 4 + 2] = route.y[j]; aB[v * 4 + 3] = route.mode[j];
        aW[v] = hw;
      }
      idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(aA, 4));
    g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    g.setAttribute('aW', new THREE.BufferAttribute(aW, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.mat = new THREE.ShaderMaterial({
      name: 'road.fieldRaster', vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uReversed: { value: app.pipeline?.reversedDepth ? 1 : 0 } },
      depthTest: true, depthWrite: true, depthFunc: THREE.LessDepth, side: THREE.DoubleSide, blending: THREE.NoBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.clearMat = new THREE.ShaderMaterial({
      name: 'road.fieldClear', vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: CLEAR_FRAG,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.clearMesh = new THREE.Mesh(tri, this.clearMat);
    this.clearMesh.frustumCulled = false;
    this.clearScene = new THREE.Scene();
    this.clearScene.add(this.clearMesh);
    this.clearCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _render(rt, x0, z0, w, d) {
    const r = this.app.renderer;
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.autoClear = false;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.clearScene, this.clearCam);
    // world (x, z) relative to the geometry origin -> ortho camera window
    const c = this.cam;
    c.left = x0 - this.origin.x; c.right = c.left + w;
    c.bottom = z0 - this.origin.z; c.top = c.bottom + d;
    c.near = -1; c.far = 1;
    c.position.set(0, 0, 0); c.lookAt(0, 0, -1);
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    this.mat.uniforms.uReversed.value = r.state?.buffers?.depth?.getReversed?.() ? 1 : (this.app.pipeline?.reversedDepth ? 1 : 0);
    r.render(this.scene, c);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
  }

  renderCoarse() {
    if (!this.ok) return;
    const t0 = performance.now();
    const R = this.coarseRect;
    this._render(this.rtCoarse, R.x0, R.z0, R.w, R.d);
    GEO_UNIFORMS.uRoadCoarse.value = this.rtCoarse.texture;
    GEO_UNIFORMS.uRoadCoarseRect.value.set(R.x0, R.z0, 1 / R.w, 1 / R.d);
    GEO_UNIFORMS.uRoadReady.value = 1;
    this.stats.coarseMs = performance.now() - t0;
    this.app.events.emit('road:field', { kind: 'coarse', rect: { xMin: R.x0, zMin: R.z0, width: R.w, depth: R.d } });
  }

  /** Re-render the fine field if (x, z) is more than `moveDist` from its centre. */
  updateFine(x, z, force = false, moveDist = 1000) {
    if (!this.ok) return false;
    const f = this.fineRect;
    if (!force && f && Math.abs(x - f.cx) < moveDist && Math.abs(z - f.cz) < moveDist) return false;
    const t0 = performance.now();
    const T = this.fineTexel, span = this.fineSpan;
    // snap to the texel lattice so texel centres stay on a fixed world grid
    const x0 = Math.round((x - span / 2) / T) * T, z0 = Math.round((z - span / 2) / T) * T;
    this._render(this.rtFine, x0, z0, span, span);
    this.fineRect = { xMin: x0, zMin: z0, width: span, depth: span, cx: x0 + span / 2, cz: z0 + span / 2 };
    GEO_UNIFORMS.uRoadFine.value = this.rtFine.texture;
    GEO_UNIFORMS.uRoadFineRect.value.set(x0, z0, 1 / span, 1 / span);
    this.stats.fineMs = performance.now() - t0;
    this.stats.fineRenders++;
    this.app.events.emit('road:field', { kind: 'fine', rect: { xMin: x0, zMin: z0, width: span, depth: span } });
    return true;
  }

  /**
   * Numerical validation: read back blocks of texels around route points and compare with
   * RouteIndex.field() at the texel centres. Returns stats (and logs them).
   */
  validate(kind = 'fine', blocks = 6, size = 24) {
    if (!this.ok) return null;
    const r = this.app.renderer, R = this.R;
    const fine = kind === 'fine';
    const rt = fine ? this.rtFine : this.rtCoarse;
    const rect = fine ? this.fineRect : { xMin: this.coarseRect.x0, zMin: this.coarseRect.z0, width: this.coarseRect.w, depth: this.coarseRect.d };
    if (!rect) return null;
    const W = rt.width, H = rt.height;
    const tx = rect.width / W, tz = rect.depth / H;
    const buf = new Float32Array(size * size * 4);
    let n = 0, nRoad = 0, maxDy = 0, maxDd = 0, sumDy = 0, sumDd = 0, mism = 0, maxDm = 0;
    const tmp = {};
    // pick route samples inside the rect
    const cand = [];
    for (let i = 0; i < R.n; i += 37) {
      const u = (R.x[i] - rect.xMin) / rect.width, v = (R.z[i] - rect.zMin) / rect.depth;
      if (u > 0.05 && u < 0.95 && v > 0.05 && v < 0.95) cand.push(i);
    }
    for (let b = 0; b < blocks && cand.length; b++) {
      const i = cand[Math.floor((b + 0.5) / blocks * cand.length)];
      // offset the block a little to the side so it straddles the edge of the formation too
      const off = (b % 3 - 1) * (fine ? 14 : 120);
      const h = R.heading[i] * Math.PI / 180;
      const cx = R.x[i] + Math.cos(h) * off, cz = R.z[i] + Math.sin(h) * off;
      const px = Math.floor((cx - rect.xMin) / tx) - (size >> 1), pz = Math.floor((cz - rect.zMin) / tz) - (size >> 1);
      r.readRenderTargetPixels(rt, px, pz, size, size, buf);
      for (let jz = 0; jz < size; jz++) for (let jx = 0; jx < size; jx++) {
        const o = (jz * size + jx) * 4;
        const wx = rect.xMin + (px + jx + 0.5) * tx, wz = rect.zMin + (pz + jz + 0.5) * tz;
        const f = R.index.field(wx, wz);
        n++;
        const gpuNone = buf[o + 1] > 1e5;
        if (!f) { if (!gpuNone) mism++; continue; }
        if (gpuNone) { if (f.d < MAXD - 2) mism++; continue; }
        nRoad++;
        const dy = Math.abs(buf[o] - f.ry), dd = Math.abs(buf[o + 1] - f.d), dm = Math.abs(buf[o + 2] - f.mode);
        maxDy = Math.max(maxDy, dy); maxDd = Math.max(maxDd, dd); maxDm = Math.max(maxDm, dm);
        sumDy += dy; sumDd += dd;
        if (Math.abs(buf[o + 3] - f.halfW) > 1e-3 && f.d < 60) mism++;
      }
    }
    void tmp;
    const res = { kind, texels: n, road: nRoad, mismatches: mism, maxDy: +maxDy.toFixed(3), meanDy: +(sumDy / Math.max(1, nRoad)).toFixed(4), maxDd: +maxDd.toFixed(3), meanDd: +(sumDd / Math.max(1, nRoad)).toFixed(4), maxDmode: +maxDm.toFixed(3) };
    if (kind === 'fine') res.pass = maxDy < 0.2 && maxDd < 1.5 && mism <= n * 0.002;
    else res.pass = mism <= n * 0.01;
    this.validation = this.validation || {};
    this.validation[kind] = res;
    return res;
  }

  dispose() {
    this.rtCoarse?.dispose(); this.rtFine?.dispose();
    this.mesh?.geometry.dispose(); this.mat?.dispose(); this.clearMat?.dispose();
  }
}
