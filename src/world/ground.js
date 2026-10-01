// Alley floor: stepped voxel heightfield mesh, wet asphalt/concrete shader with
// roughness-dependent planar reflections (vertically streaked like real wet
// streets), puddle water surfaces with sharp distorted reflections, and an
// analytic ripple system for drips and footsteps.
import * as THREE from 'three';
import { buildGroundData, makeSampler, GMAT, G, DRAINS, MANHOLES } from './groundData.js';
import { GLSL_COMMON, shared, patch } from '../render/shaderlib.js';
import { SPRAY_PARS, sprayApply } from '../spray/sprayGLSL.js';
import { RNG } from '../core/rng.js';
import { fbm2, valueNoise2 } from '../core/noise.js';
import { LAYER_REFLECT } from './units.js';

const MAX_RIPPLES = 24;

export class Ground {
  constructor(engine) {
    this.engine = engine;
    this.ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.rippleCursor = 0;
    this.reflection = new GroundReflection(engine);
  }

  build() {
    const t0 = performance.now();
    this.data = buildGroundData();
    this.sample = makeSampler(this.data);
    this.timings = { data: Math.round(performance.now() - t0) };
    const t1 = performance.now();
    this.infoTex = this.buildInfoTexture();
    const { ground, water } = this.buildMeshes();
    this.timings.mesh = Math.round(performance.now() - t1);

    const common = {
      tRefl: { value: this.reflection.target.texture },
      uReflMat: { value: this.reflection.textureMatrix },
      uInfo: { value: this.infoTex },
      uInfoMin: { value: new THREE.Vector2(G.x0, G.z0) },
      uInfoInvSize: { value: new THREE.Vector2(1 / (G.nx * G.cell), 1 / (G.nz * G.cell)) },
      uRipples: { value: this.ripples },
      uReflRes: { value: this.reflection.size },
    };
    this.uniforms = common;
    this.groundMat = createGroundMaterial(common);
    this.waterMat = createWaterMaterial(common);

    this.groundMesh = new THREE.Mesh(ground, this.groundMat);
    this.groundMesh.name = 'ground';
    this.groundMesh.receiveShadow = true;
    this.groundMesh.castShadow = false;
    this.waterMesh = new THREE.Mesh(water, this.waterMat);
    this.waterMesh.name = 'water';
    this.waterMesh.renderOrder = 10;
    this.engine.scene.add(this.groundMesh, this.waterMesh);
    return this;
  }

  buildInfoTexture() {
    // 5 cm texels over the ground grid: R crack, G oil/stain, B silt/dirt, A puddle depth
    const rng = new RNG(4242);
    const S = 2; // texels per ground cell
    const W = G.nx * S, H = G.nz * S;
    const data = new Uint8Array(W * H * 4);
    const { depth, mask, mat } = this.data;
    const px = (x) => (x - G.x0) / G.cell * S;
    const pz = (z) => (z - G.z0) / G.cell * S;
    const put = (i, j, ch, v) => {
      if (i < 0 || j < 0 || i >= W || j >= H) return;
      const o = (i + j * W) * 4 + ch;
      data[o] = Math.min(255, Math.max(data[o], v));
    };
    // puddle depth + silt rings around puddle edges
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const id = Math.floor(i / S) + Math.floor(j / S) * G.nx;
        if (!mask[id]) continue;
        const d = depth[id];
        data[(i + j * W) * 4 + 3] = Math.min(255, Math.round((d / 0.04) * 255));
        const x = G.x0 + (i + 0.5) / S * G.cell, z = G.z0 + (j + 0.5) / S * G.cell;
        // general dirt: more near walls and at the cross-alley corners
        const wallDist = Math.min(Math.abs(Math.abs(x) - 2.8), 9);
        let dirt = Math.max(0, 1 - wallDist / 0.9) * 150 + fbm2(x * 0.8, z * 0.8, 3, 17) * 90;
        if (z > 14) dirt *= 0.5;
        data[(i + j * W) * 4 + 2] = Math.min(255, dirt);
        // oil / stains: mottled
        const st = fbm2(x * 1.3, z * 1.3, 4, 23);
        data[(i + j * W) * 4 + 1] = Math.max(0, (st - 0.55) * 500);
      }
    // silt ring: dilate puddle mask edges
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        const o = (i + j * W) * 4;
        if (data[o + 3] > 0) continue;
        let near = 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            if (data[(ii + jj * W) * 4 + 3] > 0) near = Math.max(near, 3 - Math.max(Math.abs(di), Math.abs(dj)));
          }
        if (near) data[o + 2] = Math.min(255, data[o + 2] + near * 45);
      }
    // oil spots where vehicles idle, drips under the dumpster areas
    const oilSpots = [[0.1, -8], [-0.2, -23], [0.3, -36], [0, -52], [-0.3, -66], [1.9, -22.5], [-2.0, -35.1], [2.1, -64], [-8, -77], [9, -76.5]];
    for (const [ox, oz] of oilSpots) {
      const n = rng.int(3, 7);
      for (let k = 0; k < n; k++) {
        const cx = px(ox + rng.range(-0.6, 0.6)), cz = pz(oz + rng.range(-0.9, 0.9));
        const r = rng.range(2, 9);
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            const dd = Math.sqrt(di * di + dj * dj) / r;
            if (dd > 1) continue;
            put(Math.round(cx + di), Math.round(cz + dj), 1, Math.round((1 - dd * dd) * rng.range(140, 255)));
          }
      }
    }
    // cracks: random walks (longitudinal along ruts, transverse, and alligator patches)
    const crackWalk = (x, z, ang, len, wiggle) => {
      let cx = px(x), cz = pz(z);
      for (let s = 0; s < len; s++) {
        put(Math.round(cx), Math.round(cz), 0, 255);
        if (rng.chance(0.25)) put(Math.round(cx + 1), Math.round(cz), 0, 140);
        ang += rng.normal(0, wiggle);
        cx += Math.cos(ang);
        cz += Math.sin(ang);
        if (rng.chance(0.012)) crackWalk(G.x0 + cx / S * G.cell, G.z0 + cz / S * G.cell, ang + rng.sign() * rng.range(0.6, 1.3), rng.int(10, 60), wiggle);
      }
    };
    for (let z = 12; z > -74; z -= rng.range(2.5, 7)) {
      // transverse
      crackWalk(rng.range(-2.6, -1.5), z, rng.range(-0.15, 0.15), rng.int(40, 110), 0.18);
      // longitudinal along a rut
      if (rng.chance(0.6)) crackWalk(rng.pick([-0.95, 0.95]) + rng.range(-0.2, 0.2), z, Math.PI / 2 + rng.range(-0.1, 0.1), rng.int(40, 140), 0.12);
    }
    for (let k = 0; k < 9; k++) {
      // alligator cracking patches
      const cx = rng.range(-1.8, 1.8), cz = rng.range(-72, 10);
      for (let m = 0; m < 26; m++) crackWalk(cx + rng.range(-0.6, 0.6), cz + rng.range(-0.8, 0.8), rng.range(0, Math.PI * 2), rng.int(5, 14), 0.5);
    }
    for (let x = -21; x < 21; x += rng.range(3, 7)) crackWalk(x, rng.range(-79, -74.5), Math.PI / 2 + rng.range(-0.3, 0.3), rng.int(30, 90), 0.2);
    // never crack across grates / manholes / street
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const id = Math.floor(i / S) + Math.floor(j / S) * G.nx;
        const m = mat[id];
        if (m === GMAT.GRATE || m === GMAT.MANHOLE || m === GMAT.SIDEWALK) data[(i + j * W) * 4] = 0;
      }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  buildMeshes() {
    const { h, mat, mask, depth, level, nx, nz, cell, x0, z0 } = this.data;
    const pos = [], nrm = [], gd = [], idx = [];
    let vcount = 0;
    const quad = (a, b, c, d, n, m, side) => {
      pos.push(...a, ...b, ...c, ...d);
      for (let k = 0; k < 4; k++) {
        nrm.push(n[0] * 127, n[1] * 127, n[2] * 127);
        gd.push(m, side, 0, 0);
      }
      idx.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
      vcount += 4;
    };
    const HQ = 1 / G.hq;
    // ── top faces: greedy merge on (height, material) ──
    const key = new Int32Array(nx * nz);
    for (let id = 0; id < nx * nz; id++) key[id] = mask[id] ? (Math.round(h[id] * HQ) + 4096) * 32 + mat[id] : -1;
    const used = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const id = i + j * nx;
        if (key[id] < 0 || used[id]) continue;
        const k = key[id];
        let w = 1;
        while (i + w < nx && key[id + w] === k && !used[id + w]) w++;
        let hh = 1;
        outer: while (j + hh < nz) {
          for (let q = 0; q < w; q++) {
            const o = i + q + (j + hh) * nx;
            if (key[o] !== k || used[o]) break outer;
          }
          hh++;
        }
        for (let b = 0; b < hh; b++) for (let a = 0; a < w; a++) used[i + a + (j + b) * nx] = 1;
        const y = h[id];
        const xa = x0 + i * cell, xb = x0 + (i + w) * cell;
        const za = z0 + j * cell, zb = z0 + (j + hh) * cell;
        quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], [0, 1, 0], mat[id], 0);
      }
    // ── side faces between columns of different height (merged in runs) ──
    const sideRuns = (alongX) => {
      // alongX: faces on planes x = const (between i and i+1), runs along j
      const A = alongX ? nx : nz, Bn = alongX ? nz : nx;
      for (let a = 0; a < A - 1; a++) {
        let run = null;
        const flush = () => {
          if (!run) return;
          const { b0, b1, yl, yh, dir, m } = run;
          const p = (alongX ? x0 : z0) + (a + 1) * cell;
          const s0 = (alongX ? z0 : x0) + b0 * cell, s1 = (alongX ? z0 : x0) + b1 * cell;
          if (alongX) {
            const n = [dir, 0, 0];
            if (dir > 0) quad([p, yl, s0], [p, yh, s0], [p, yh, s1], [p, yl, s1], n, m, 1);
            else quad([p, yl, s1], [p, yh, s1], [p, yh, s0], [p, yl, s0], n, m, 1);
          } else {
            const n = [0, 0, dir];
            if (dir > 0) quad([s1, yl, p], [s1, yh, p], [s0, yh, p], [s0, yl, p], n, m, 1);
            else quad([s0, yl, p], [s0, yh, p], [s1, yh, p], [s1, yl, p], n, m, 1);
          }
          run = null;
        };
        for (let b = 0; b < Bn; b++) {
          const i1 = alongX ? a + b * nx : b + a * nx;
          const i2 = alongX ? a + 1 + b * nx : b + (a + 1) * nx;
          const m1 = mask[i1], m2 = mask[i2];
          let face = null;
          if (m1 && m2 && h[i1] !== h[i2]) {
            if (h[i1] > h[i2]) face = { yl: h[i2], yh: h[i1], dir: 1, m: mat[i1] };
            else face = { yl: h[i1], yh: h[i2], dir: -1, m: mat[i2] };
          } else if (m1 && !m2) face = { yl: -0.25, yh: h[i1], dir: 1, m: mat[i1] };
          else if (!m1 && m2) face = { yl: -0.25, yh: h[i2], dir: -1, m: mat[i2] };
          if (face && run && run.b1 === b && run.yl === face.yl && run.yh === face.yh && run.dir === face.dir && run.m === face.m) {
            run.b1 = b + 1;
          } else {
            flush();
            if (face) run = { b0: b, b1: b + 1, ...face };
          }
        }
        flush();
      }
    };
    sideRuns(true);
    sideRuns(false);

    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ground.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nrm), 3, true));
    ground.setAttribute('gdat', new THREE.BufferAttribute(new Uint8Array(gd), 4, false));
    ground.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    ground.computeBoundingBox();
    ground.computeBoundingSphere();
    this.groundTris = idx.length / 3;

    // ── water: flat quads at basin level, merged ──
    const wpos = [], widx = [];
    let wv = 0;
    const wkey = new Int32Array(nx * nz);
    for (let id = 0; id < nx * nz; id++) wkey[id] = mask[id] && depth[id] > 0.0012 ? Math.round(level[id] * 2000) : -1;
    const wused = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const id = i + j * nx;
        if (wkey[id] < 0 || wused[id]) continue;
        const k = wkey[id];
        let w = 1;
        while (i + w < nx && wkey[id + w] === k && !wused[id + w]) w++;
        let hh = 1;
        outer2: while (j + hh < nz) {
          for (let q = 0; q < w; q++) {
            const o = i + q + (j + hh) * nx;
            if (wkey[o] !== k || wused[o]) break outer2;
          }
          hh++;
        }
        for (let b = 0; b < hh; b++) for (let a = 0; a < w; a++) wused[i + a + (j + b) * nx] = 1;
        const y = level[id];
        const xa = x0 + i * cell, xb = x0 + (i + w) * cell;
        const za = z0 + j * cell, zb = z0 + (j + hh) * cell;
        wpos.push(xa, y, za, xa, y, zb, xb, y, zb, xb, y, za);
        widx.push(wv, wv + 1, wv + 2, wv, wv + 2, wv + 3);
        wv += 4;
      }
    const water = new THREE.BufferGeometry();
    water.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    water.setIndex(widx);
    water.computeBoundingBox();
    water.computeBoundingSphere();
    this.waterTris = widx.length / 3;
    return { ground, water };
  }

  addRipple(x, z, amp = 1, t = shared.uTime.value) {
    const r = this.ripples[this.rippleCursor];
    r.set(x, z, t, amp);
    this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES;
  }

  update(dt, t) {}
}

// ───────────────────────────── planar reflection ─────────────────────────────

export class GroundReflection {
  constructor(engine) {
    this.engine = engine;
    this.planeY = 0.0;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(LAYER_REFLECT);
    this.textureMatrix = new THREE.Matrix4();
    this.size = new THREE.Vector2(1, 1);
    this.scale = { low: 0.35, medium: 0.42 }[engine.params?.quality] ?? 0.5;
    this.target = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    });
    this._v = {
      n: new THREE.Vector3(0, 1, 0),
      rp: new THREE.Vector3(),
      cp: new THREE.Vector3(),
      view: new THREE.Vector3(),
      look: new THREE.Vector3(),
      tgt: new THREE.Vector3(),
      rot: new THREE.Matrix4(),
      plane: new THREE.Plane(),
      clip: new THREE.Vector4(),
      q: new THREE.Vector4(),
    };
  }

  setSize(w, h) {
    const W = Math.max(16, Math.round(w * this.scale)), H = Math.max(16, Math.round(h * this.scale));
    this.target.setSize(W, H);
    this.size.set(W, H);
  }

  render(renderer, scene, camera) {
    const v = this._v;
    const rc = this.camera;
    v.rp.set(camera.position.x, this.planeY, camera.position.z);
    v.cp.setFromMatrixPosition(camera.matrixWorld);
    v.rot.extractRotation(camera.matrixWorld);
    v.view.subVectors(v.rp, v.cp).reflect(v.n).negate().add(v.rp);
    v.look.set(0, 0, -1).applyMatrix4(v.rot).add(v.cp);
    v.tgt.subVectors(v.rp, v.look).reflect(v.n).negate().add(v.rp);
    rc.position.copy(v.view);
    rc.up.set(0, 1, 0).applyMatrix4(v.rot).reflect(v.n);
    rc.lookAt(v.tgt);
    rc.far = camera.far;
    rc.near = camera.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // oblique near plane = mirror plane
    v.plane.setFromNormalAndCoplanarPoint(v.n, v.rp).applyMatrix4(rc.matrixWorldInverse);
    v.clip.set(v.plane.normal.x, v.plane.normal.y, v.plane.normal.z, v.plane.constant);
    const pm = rc.projectionMatrix;
    v.q.x = (Math.sign(v.clip.x) + pm.elements[8]) / pm.elements[0];
    v.q.y = (Math.sign(v.clip.y) + pm.elements[9]) / pm.elements[5];
    v.q.z = -1.0;
    v.q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    v.clip.multiplyScalar(2.0 / v.clip.dot(v.q));
    pm.elements[2] = v.clip.x;
    pm.elements[6] = v.clip.y;
    pm.elements[10] = v.clip.z + 1.0 - 0.003;
    pm.elements[14] = v.clip.w;
    rc.projectionMatrixInverse.copy(pm).invert();

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, rc);
    renderer.setRenderTarget(prevTarget);
  }
}

// ───────────────────────────── materials ─────────────────────────────

const REFL_PARS = /* glsl */ `
uniform sampler2D tRefl;
uniform mat4 uReflMat;
uniform sampler2D uInfo;
uniform vec2 uInfoMin;
uniform vec2 uInfoInvSize;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec2 uReflRes;

// Sample the planar reflection with roughness blur and vertical streaking
vec3 reflSample(vec3 wp, vec2 distort, float rough) {
  vec4 pc = uReflMat * vec4(wp, 1.0);
  vec2 uv = pc.xy / pc.w + distort;
  float lod = clamp(rough * 7.0, 0.0, 6.0);
  vec3 c = textureLod(tRefl, uv, lod).rgb * 0.4;
  float st = rough * rough * 0.09;
  c += textureLod(tRefl, uv + vec2(0.0, st), lod).rgb * 0.17;
  c += textureLod(tRefl, uv - vec2(0.0, st), lod).rgb * 0.17;
  c += textureLod(tRefl, uv + vec2(0.0, st * 2.2), lod + 0.5).rgb * 0.13;
  c += textureLod(tRefl, uv - vec2(0.0, st * 2.2), lod + 0.5).rgb * 0.13;
  return c;
}

vec4 groundInfo(vec2 xz) {
  return texture(uInfo, (xz - uInfoMin) * uInfoInvSize);
}

// Ripples: expanding rings from drips and footsteps. Returns normal xz offset.
vec2 rippleNormal(vec2 p, float t) {
  vec2 n = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 3.0) continue;
    vec2 d = p - r.xy;
    float dist = length(d);
    float radius = age * 0.32;
    float x = dist - radius;
    if (abs(x) > 0.25) continue;
    float env = exp(-x * x * 160.0) * exp(-age * 1.6) * r.w * smoothstep(0.0, 0.08, age);
    float wave = cos(x * 70.0) * env;
    n += normalize(d + 1e-4) * wave * 0.5;
  }
  return n;
}
`;

function createGroundMaterial(u) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  mat.name = 'ground';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, u);
    let vs = shader.vertexShader;
    vs = patch(vs, '#include <common>', /* glsl */ `
      attribute vec4 gdat;
      flat varying vec4 vGd;
      varying vec3 vWPos;
      varying vec3 vWNrm;
    `, 'after');
    vs = patch(vs, '#include <begin_vertex>', /* glsl */ `
      vGd = gdat;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNrm = normalize(mat3(modelMatrix) * normal);
    `, 'after');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = patch(fs, '#include <common>', GLSL_COMMON + SPRAY_PARS + REFL_PARS + /* glsl */ `
      flat varying vec4 vGd;
      varying vec3 vWPos;
      varying vec3 vWNrm;
    `, 'after');
    fs = patch(fs, '#include <map_fragment>', GROUND_SURFACE);
    fs = patch(fs, '#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;');
    fs = patch(fs, '#include <metalnessmap_fragment>', 'float metalnessFactor = sMetal;');
    fs = patch(fs, '#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(sN, 0.0)).xyz);');
    fs = patch(fs, '#include <lights_fragment_maps>', /* glsl */ `
      irradiance = sampleIrradiance(vWPos, sN) * sAO;
    `, 'after');
    fs = patch(fs, '#include <aomap_fragment>', /* glsl */ `
      float pShadow = playerShadow(vWPos + vec3(0.0, 0.02, 0.0));
      reflectedLight.directDiffuse *= pShadow;
      reflectedLight.directSpecular *= pShadow;
      // planar reflection on the wet film (Fresnel weighted)
      {
        vec3 Vv = normalize(cameraPosition - vWPos);
        float NdV = clamp(dot(sN, Vv), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 refl = reflSample(vWPos, sN.xz * 0.02, sReflRough);
        reflectedLight.indirectSpecular += refl * F * sReflAmt * sAO;
      }
    `, 'before');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'ground-v2';
  return mat;
}

const GROUND_SURFACE = /* glsl */ `
  int gm = int(vGd.x + 0.5);
  bool isSide = vGd.y > 0.5;
  vec3 sN = normalize(vWNrm);
  vec2 xz = vWPos.xz;
  const float GV = 0.0169;
  ivec2 vc = ivec2(floor(xz / GV));
  vec3 hv = h32(vc);
  vec2 dfx = dFdx(xz / GV), dfy = dFdy(xz / GV);
  float fw = max(length(dfx), length(dfy));
  float detail = 1.0 - smoothstep(0.8, 2.5, fw);
  vec4 info = groundInfo(xz);
  float crack = info.r;
  float oil = info.g;
  float silt = info.b;
  float pud = info.a; // puddle depth (0..4cm)
  vec4 nz = noise2L(xz * 2.3);
  vec4 nz2 = noise2L(xz * 0.35 + 17.0);

  vec3 alb;
  float rough;
  float metal = 0.0;
  float porosity = 1.0;
  // aggregate stone mask
  float stone = step(0.7, hv.x);
  if (gm == ${GMAT.ASPHALT} || gm == ${GMAT.STREET}) {
    vec3 bit = vec3(0.05, 0.05, 0.053) * (0.85 + 0.3 * nz.r);
    vec3 agg = mix(vec3(0.062, 0.06, 0.058), vec3(0.08, 0.075, 0.07), hv.y);
    alb = mix(bit, agg, stone * mix(1.0, 0.3, 1.0 - detail));
    alb *= 0.94 + 0.12 * hv.z;
    alb *= 0.85 + 0.3 * nz2.g;
    rough = mix(0.62, 0.45, stone);
  } else if (gm == ${GMAT.PATCH}) {
    alb = vec3(0.032, 0.032, 0.035) * (0.85 + 0.3 * nz.g);
    alb = mix(alb, vec3(0.08), step(0.85, hv.x) * 0.6);
    rough = 0.5;
  } else if (gm == ${GMAT.CONCRETE} || gm == ${GMAT.SIDEWALK} || gm == ${GMAT.CURB}) {
    alb = vec3(0.2, 0.195, 0.185) * (0.8 + 0.25 * nz.b + 0.12 * hv.y);
    float joint = step(0.96, fract(xz.y / 1.22)) + step(0.97, fract(xz.x / 1.5));
    alb *= 1.0 - 0.5 * clamp(joint, 0.0, 1.0);
    rough = 0.75;
  } else if (gm == ${GMAT.GRAVEL}) {
    alb = mix(vec3(0.06, 0.055, 0.05), vec3(0.15, 0.13, 0.11), hv.y) * (0.7 + 0.5 * hv.z);
    rough = 0.8;
  } else if (gm == ${GMAT.BRICK}) {
    vec2 bp = xz / vec2(0.2, 0.1);
    bp.x += step(1.0, mod(floor(bp.y), 2.0)) * 0.5;
    vec2 fb = fract(bp);
    float mortar = step(fb.x, 0.06) + step(fb.y, 0.1);
    alb = mix(vec3(0.16, 0.07, 0.05) * (0.7 + 0.5 * h12(ivec2(floor(bp)))), vec3(0.06), clamp(mortar, 0.0, 1.0));
    rough = 0.7;
  } else if (gm == ${GMAT.GRATE}) {
    float bar = step(0.55, fract(xz.x / 0.04));
    alb = mix(vec3(0.004), vec3(0.06, 0.04, 0.03) * (0.7 + 0.6 * hv.y), bar);
    rough = mix(1.0, 0.45, bar);
    metal = bar * 0.5;
    porosity = 0.2;
  } else if (gm == ${GMAT.MANHOLE}) {
    vec2 g = fract(xz / 0.05);
    float raised = step(0.5, g.x) * step(0.5, g.y);
    alb = vec3(0.05, 0.04, 0.035) * (0.6 + 0.5 * raised + 0.3 * hv.y);
    alb = mix(alb, vec3(0.12, 0.05, 0.02), smoothstep(0.55, 0.8, nz.r) * 0.7);
    rough = mix(0.6, 0.35, raised);
    metal = 0.4;
    porosity = 0.2;
  } else {
    alb = vec3(0.06);
    rough = 0.6;
  }
  if (isSide) alb *= 0.75;

  // cracks: dark, damp lines
  float crk = smoothstep(0.25, 0.75, crack) * (gm == ${GMAT.GRATE} || gm == ${GMAT.MANHOLE} ? 0.0 : 1.0);
  alb = mix(alb, vec3(0.012, 0.012, 0.013), crk * 0.85);
  // stains and dirt
  alb *= 1.0 - 0.55 * oil;
  alb = mix(alb, vec3(0.085, 0.072, 0.058), silt * 0.55);

  // the player's spray paint
  ${sprayApply('vWPos', 'normalize(vWNrm)')}

  // wetness: everything is wet after rain; puddle beds darkest, dirt patches less glossy
  float wetFilm = clamp(0.5 + 0.7 * smoothstep(0.25, 0.75, nz2.r) - 0.35 * silt + 0.5 * pud, 0.0, 1.0) * uWetness;
  alb *= mix(1.0, 0.45, wetFilm * porosity);
  // water sits between aggregate stones: rough stones poke through
  float filmRough = mix(0.1, 0.3, stone * (1.0 - pud));
  rough = mix(rough, filmRough, wetFilm);
  rough = mix(rough, 0.6, crk * 0.5);
  // thin oil film on water is smoother
  rough = mix(rough, 0.06, oil * 0.4);

  // per-voxel normal jitter for aggregate glints (faded with distance)
  vec2 tilt = (hv.yz - 0.5) * (0.1 * stone + 0.035) * detail;
  if (!isSide) sN = normalize(vec3(tilt.x, 1.0, tilt.y));

  float sAO = 1.0 - 0.4 * crk;
  float sReflRough = clamp(rough * 1.15, 0.02, 1.0);
  float sReflAmt = 1.35 * wetFilm * (isSide ? 0.3 : 1.0) * (1.0 - 0.6 * smoothstep(0.5, 0.9, rough));
  float sRough = rough;
  float sMetal = metal;
  diffuseColor.rgb = alb;
`;

function createWaterMaterial(u) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...u, uTime: shared.uTime, uNoise2: shared.uNoise2, uWind: shared.uWind },
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      uniform sampler2D uNoise2;
      varying vec3 vWPos;
      ${REFL_PARS}
      void main() {
        vec2 xz = vWPos.xz;
        vec4 info = groundInfo(xz);
        float depth = info.a * 0.04;
        // wind-driven micro waves + ripples
        vec2 w1 = texture2D(uNoise2, xz * 0.9 + vec2(uTime * 0.05, uTime * 0.03)).rg - 0.5;
        vec2 w2 = texture2D(uNoise2, xz * 2.7 - vec2(uTime * 0.09, -uTime * 0.07)).ba - 0.5;
        vec2 nxz = (w1 * 0.05 + w2 * 0.03) * (0.4 + 1.2 * uWind);
        nxz += rippleNormal(xz, uTime);
        vec3 N = normalize(vec3(nxz.x, 1.0, nxz.y));
        vec3 V = normalize(cameraPosition - vWPos);
        float NdV = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 refl = reflSample(vWPos, N.xz * 0.045, 0.02);
        // shallow edges blend softly into the wet asphalt
        float edge = smoothstep(0.0005, 0.006, depth);
        float a = clamp(F * 1.05 + 0.05, 0.0, 1.0) * edge;
        gl_FragColor = vec4(refl, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  mat.name = 'water';
  return mat;
}
