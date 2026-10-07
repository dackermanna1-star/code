// Forests and everything green: where every tree, bush and boulder stands,
// and how they're drawn. Near the camera trees are real models (instanced,
// swaying in the wind, casting shadows close by); further out each one is a
// flat picture of itself that turns to face you; beyond the fog, nothing.
// Trunks are collision boxes, so you can't walk through a forest.
import * as THREE from 'three';
import { conifer, broadleaf, bush, rock } from './trees.js';
import { needleTex, leafTex, photo, canvasTex } from '../textures.js';
import { hash2, rng } from '../noise.js';
import { HALF } from './layout.js';

const SPECIES = [
  { id: 'spruce', make: () => conifer(11, 38), foliage: () => needleTex(), bark: 'bark', H: 38, trunk: 0.9, color: 0x9ab08a },
  { id: 'pine', make: () => conifer(23, 34, { bare: 0.42, levels: 8 }), foliage: () => needleTex(), bark: 'bark', H: 34, trunk: 0.85, color: 0xa8b892 },
  { id: 'birch', make: () => broadleaf(37, 30, 'birch'), foliage: () => leafTex('birch'), bark: 'birch', H: 30, trunk: 0.55, color: 0xffffff },
  { id: 'oak', make: () => broadleaf(41, 27, 'oak'), foliage: () => leafTex('oak'), bark: 'bark2', H: 27, trunk: 1.1, color: 0xffffff },
  { id: 'bush', make: () => bush(53, 3.6), foliage: () => leafTex('bush'), bark: 'bark2', H: 4, trunk: 0, color: 0xffffff, small: true },
];
const NEAR = 330, CLOSE = 150, FAR = 2400, CELL = 128;

function birchBark() {
  return canvasTex('birchbark', 128, 256, (x, w, h) => {
    x.fillStyle = '#e8e4da'; x.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${20 + r() * 30},${20 + r() * 25},${20 + r() * 20},${0.5 + r() * 0.5})`; x.fillRect(r() * w, r() * h, 4 + r() * 22, 1.5 + r() * 3.5); }
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(120,110,100,${r() * 0.2})`; x.fillRect(r() * w, r() * h, 1, 1 + r() * 3); }
  });
}

function treeMaterial(sp, wind) {
  const fol = sp.foliage();
  const bark = sp.bark === 'birch' ? birchBark() : photo(sp.bark);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.45, map: fol });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.barkMap = { value: bark };
    sh.uniforms.wind = wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float kind; varying float vKind; uniform vec2 wind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKind = kind;
{
  #ifdef USE_INSTANCING
  vec4 o = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #else
  vec4 o = vec4(0.0);
  #endif
  float ph = o.x * 0.031 + o.z * 0.047;
  float bend = max(transformed.y, 0.0); bend = bend * bend * 0.0009;
  float gust = sin(wind.y * 1.1 + ph) * 0.6 + sin(wind.y * 2.3 + ph * 1.7) * 0.3;
  transformed.x += bend * wind.x * (1.0 + gust) * 1.4;
  transformed.z += bend * wind.x * gust * 0.6;
  if (kind > 0.5) { transformed += normal * sin(wind.y * 4.0 + ph * 3.0 + transformed.y) * 0.08 * wind.x; }
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKind; uniform sampler2D barkMap;')
      .replace('#include <map_fragment>', `
if (vKind < 0.5) { diffuseColor.rgb *= texture2D(barkMap, vMapUv * vec2(1.0, 1.0)).rgb; }
else { vec4 f = texture2D(map, vMapUv); diffuseColor *= f; }
`)
      .replace('#include <alphatest_fragment>', 'if (vKind > 0.5 && diffuseColor.a < 0.45) discard;');
  };
  mat.customProgramCacheKey = () => 'ob-tree-' + sp.id;
  // shadows: cut out by the leaves
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: fol, alphaTest: 0.45, side: THREE.DoubleSide });
  return { mat, depth };
}

/** Pictures of each tree, for far away: rendered once at load. */
function impostors(renderer, geos, mats) {
  const S = 256, n = geos.length;
  const rt = new THREE.WebGLRenderTarget(S * n, S * 2, { samples: 0 });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4030, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(0.3, 1, 1); scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x4a5a3a, 0);
  renderer.clear();
  const info = [];
  for (let i = 0; i < n; i++) {
    const g = geos[i]; g.computeBoundingBox();
    const bb = g.boundingBox, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), h = bb.max.y - bb.min.y;
    const half = Math.max(w, h) / 2 * 1.02;
    const m = new THREE.Mesh(g, mats[i]);
    m.position.y = -(bb.min.y + bb.max.y) / 2;
    scene.add(m);
    for (let view = 0; view < 2; view++) {
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
      cam.position.set(view ? 100 : 0, 0, view ? 0 : 100); cam.lookAt(0, 0, 0);
      renderer.setViewport(i * S, view * S, S, S);
      renderer.setScissor(i * S, view * S, S, S); renderer.setScissorTest(true);
      renderer.render(scene, cam);
    }
    scene.remove(m);
    info.push({ half, cy: (bb.min.y + bb.max.y) / 2 });
  }
  renderer.setScissorTest(false);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  const t = rt.texture;
  t.generateMipmaps = false;
  return { tex: t, info, n };
}

const BB_VS = `
attribute vec4 inst; // x, y, z, scale
attribute vec2 kind; // species, flip
uniform vec4 boxes[8]; // per species: half size, centre y
uniform float nSpecies;
uniform vec3 camPos;
varying vec2 vUv; varying float vFade;
#include <fog_pars_vertex>
void main() {
  vec4 b = boxes[int(kind.x)];
  vec3 to = camPos - inst.xyz; to.y = 0.0;
  vec3 fwd = normalize(to);
  vec3 right = vec3(fwd.z, 0.0, -fwd.x);
  float s = inst.w;
  vec3 wp = inst.xyz + right * position.x * b.x * 2.0 * s * kind.y + vec3(0.0, (position.y * b.x * 2.0 + b.y) * s, 0.0);
  vUv = vec2((kind.x + (position.x + 0.5)) / nSpecies, (position.y + 0.5) * 0.5);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float d = length(to);
  vFade = smoothstep(${NEAR - 30}.0, ${NEAR + 10}.0, d);
  #include <fog_vertex>
}`;
const BB_FS = `
uniform sampler2D atlas; uniform vec3 light, sky;
varying vec2 vUv; varying float vFade;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(atlas, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb * light, 1.0);
  #include <fog_fragment>
}`;

export class Vegetation {
  constructor(world, T, phys, opts = {}) {
    this.world = world; this.T = T;
    this.wind = { value: new THREE.Vector2(0.4, 0) };
    this.geos = SPECIES.map((s) => s.make());
    const mats = SPECIES.map((s) => treeMaterial(s, this.wind));
    // the instances
    this.items = []; // {x, y, z, s, r, sp}
    this.cells = new Map();
    this._place(phys, opts);
    // near: real trees (two sets: the closest cast shadows)
    this.near = SPECIES.map((s, i) => {
      const mk = (shadow) => {
        const m = new THREE.InstancedMesh(this.geos[i], mats[i].mat, s.small ? 2500 : 3500);
        m.customDepthMaterial = mats[i].depth;
        m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.setColorAt(0, new THREE.Color(1, 1, 1));
        world.scene.add(m);
        return m;
      };
      return { close: mk(true), mid: mk(false) };
    });
    // far: pictures of trees
    const imp = impostors(world.renderer, this.geos.slice(0, 4), mats.slice(0, 4).map((m) => m.mat));
    this.imp = imp;
    const quad = new THREE.PlaneGeometry(1, 1);
    const bg = new THREE.InstancedBufferGeometry();
    bg.setAttribute('position', quad.attributes.position); bg.setIndex(quad.index);
    this.maxFar = 60000;
    this.farInst = new THREE.InstancedBufferAttribute(new Float32Array(this.maxFar * 4), 4); this.farInst.setUsage(THREE.DynamicDrawUsage);
    this.farKind = new THREE.InstancedBufferAttribute(new Float32Array(this.maxFar * 2), 2); this.farKind.setUsage(THREE.DynamicDrawUsage);
    bg.setAttribute('inst', this.farInst); bg.setAttribute('kind', this.farKind);
    bg.instanceCount = 0;
    const boxes = imp.info.map((q) => new THREE.Vector4(q.half, q.cy, 0, 0));
    while (boxes.length < 8) boxes.push(new THREE.Vector4());
    this.bbUni = { atlas: { value: imp.tex }, boxes: { value: boxes }, nSpecies: { value: imp.n }, camPos: { value: new THREE.Vector3() }, light: { value: new THREE.Color(1, 1, 1) }, sky: { value: new THREE.Color() } };
    const bm = new THREE.ShaderMaterial({ vertexShader: BB_VS, fragmentShader: BB_FS, uniforms: { ...this.bbUni, ...THREE.UniformsLib.fog }, fog: true, side: THREE.DoubleSide });
    this.far = new THREE.Mesh(bg, bm); this.far.frustumCulled = false;
    world.scene.add(this.far);
    this.farGeo = bg;
    // rocks
    this._rocks(phys);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    this.at = null; this.time = 0;
    this._frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
  }

  /** Where the trees go: denser where the forest mask says, never on roads, in water or in buildings. */
  _place(phys, opts) {
    const T = this.T, step = 11;
    const add = (x, z, sp, s) => {
      const y = T.heightAt(x, z) - 0.6;
      const it = { x, y, z, s, r: hash2(x | 0, z | 0, 9) * Math.PI * 2, sp, tint: 0.85 + hash2(z | 0, x | 0, 3) * 0.3 };
      this.items.push(it);
      const k = Math.floor((x + HALF) / CELL) * 1000 + Math.floor((z + HALF) / CELL);
      let c = this.cells.get(k); if (!c) this.cells.set(k, (c = { x: Math.floor((x + HALF) / CELL) * CELL - HALF + CELL / 2, z: Math.floor((z + HALF) / CELL) * CELL - HALF + CELL / 2, items: [] })); c.items.push(it);
      const S = SPECIES[sp];
      if (S.trunk > 0 && phys) phys.add(x, y + 6, z, S.trunk * s, 7, S.trunk * s, 0, 'wood', { tree: it });
    };
    const lim = HALF - 20;
    for (let gz = -lim; gz < lim; gz += step) for (let gx = -lim; gx < lim; gx += step) {
      const i = Math.round(gx / step), j = Math.round(gz / step);
      const x = gx + (hash2(i, j, 1) - 0.5) * step * 0.9, z = gz + (hash2(i, j, 2) - 0.5) * step * 0.9;
      const f = T.sample(T.forest, x, z);
      const ok = T.grassAt(x, z) > 0.05 && T.sample(T.roadW, x, z) < 0.15;
      if (!ok) continue;
      const r = hash2(i, j, 3);
      const h = T.heightAt(x, z);
      if (r < smooth01((f - 0.22) / 0.4) * 0.95) {
        // which kind: firs and spruces up high, birches and oaks lower down
        const hi = Math.min(1, Math.max(0, (h - 120) / 220));
        const q = hash2(i, j, 4);
        let sp = q < 0.35 + hi * 0.4 ? 0 : q < 0.55 + hi * 0.35 ? 1 : q < 0.82 ? 2 : 3;
        const s = 0.7 + hash2(i, j, 5) * 0.6;
        add(x, z, sp, s);
      } else if (r < f * 1.6 + 0.012 && hash2(i, j, 6) < 0.5) {
        add(x, z, 4, 0.7 + hash2(i, j, 7) * 0.8); // undergrowth and hedges
      } else if (f < 0.1 && r > 0.997) {
        add(x, z, hash2(i, j, 8) < 0.5 ? 3 : 2, 0.9 + hash2(i, j, 9) * 0.4); // a lone tree in a field
      }
    }
    if (opts.extra) for (const e of opts.extra) add(e.x, e.z, e.sp, e.s);
  }

  _rocks(phys) {
    const T = this.T, geos = [rock(1, 3), rock(2, 4), rock(3, 2.5)];
    const mat = new THREE.MeshStandardMaterial({ map: photo('rock'), normalMap: photo('rock', true), color: 0xb8b4ac, roughness: 0.92 });
    const list = [];
    const r = rng(77);
    for (let i = 0; i < 9000 && list.length < 2600; i++) {
      const x = (r() - 0.5) * (2 * HALF - 100), z = (r() - 0.5) * (2 * HALF - 100);
      const slope = T.sample(T.slope, x, z), f = T.sample(T.forest, x, z);
      const p = slope > 0.45 ? 0.6 : f > 0.4 ? 0.12 : 0.02;
      if (r() > p || T.grassAt(x, z) <= 0 && slope < 0.5) continue;
      if (T.waterAt(x, z) > T.heightAt(x, z) - 1 || T.sample(T.roadW, x, z) > 0.1) continue;
      list.push({ x, z, s: 0.5 + r() * (slope > 0.45 ? 2.2 : 1.1), g: Math.floor(r() * 3), r: r() * 6.28 });
    }
    this.rocks = geos.map((g, gi) => {
      const items = list.filter((q) => q.g === gi);
      const m = new THREE.InstancedMesh(g, mat, items.length);
      items.forEach((q, k) => {
        const y = T.heightAt(q.x, q.z) - 0.4 * q.s;
        this._m = this._m || new THREE.Matrix4();
        m.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(q.x, y, q.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, q.r, 0)), new THREE.Vector3(q.s, q.s, q.s)));
        if (phys && q.s > 0.8) phys.add(q.x, y + 1.2 * q.s, q.z, 2.4 * q.s, 1.2 * q.s, 2.4 * q.s, q.r, 'rock');
      });
      m.castShadow = true; m.receiveShadow = true;
      m.computeBoundingSphere();
      this.world.scene.add(m);
      return m;
    });
  }

  update(dt, camera, sky) {
    this.time += dt;
    this.wind.value.set(0.25 + (sky?.w.wind ?? 0.3) * 0.9, this.time);
    const cam = camera.position;
    // what's near and far changes only when the camera has moved a bit
    if (!this.at || this.at.distanceTo(cam) > 18) this._rebuild(cam);
    this._near(camera);
    // light the far pictures like the near trees
    if (sky) {
      const L = this.bbUni.light.value;
      L.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.42).add(this._c.copy(sky.sun.color).multiplyScalar(sky.sun.intensity * 0.2));
      L.r = Math.min(L.r, 1.4); L.g = Math.min(L.g, 1.4); L.b = Math.min(L.b, 1.4);
    }
    this.bbUni.camPos.value.copy(cam);
  }

  _rebuild(cam) {
    this.at = cam.clone();
    const inst = this.farInst.array, kind = this.farKind.array;
    let n = 0;
    this.nearItems = [];
    const ci = Math.floor((cam.x + HALF) / CELL), cj = Math.floor((cam.z + HALF) / CELL), R = Math.ceil(FAR / CELL);
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
      const c = this.cells.get(i * 1000 + j);
      if (!c) continue;
      const dc = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (dc > FAR + CELL) continue;
      for (const it of c.items) {
        const d = Math.hypot(it.x - cam.x, it.z - cam.z);
        if (d < NEAR) { this.nearItems.push(it); continue; }
        if (it.sp === 4 || d > FAR || n >= this.maxFar) continue;
        inst[n * 4] = it.x; inst[n * 4 + 1] = it.y; inst[n * 4 + 2] = it.z; inst[n * 4 + 3] = it.s;
        kind[n * 2] = it.sp; kind[n * 2 + 1] = it.r > Math.PI ? 1 : -1;
        n++;
      }
    }
    this.farGeo.instanceCount = n;
    this.farInst.needsUpdate = true; this.farKind.needsUpdate = true;
    this.farCount = n;
  }

  _near(camera) {
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pm);
    const cam = camera.position, counts = this.near.map(() => [0, 0]);
    const m = this._m, q = this._q, s = this._s, p = this._p, sph = this._sph, col = this._c;
    for (const it of this.nearItems) {
      const S = SPECIES[it.sp];
      sph.center.set(it.x, it.y + S.H * 0.5 * it.s, it.z); sph.radius = S.H * 0.6 * it.s + 2;
      const d = Math.hypot(it.x - cam.x, it.z - cam.z);
      if (d > 30 && !this._frustum.intersectsSphere(sph)) continue;
      const set = d < CLOSE ? 0 : 1;
      const mesh = set === 0 ? this.near[it.sp].close : this.near[it.sp].mid;
      const k = counts[it.sp][set];
      if (k >= mesh.instanceMatrix.count) continue;
      q.setFromAxisAngle(_Y, it.r); s.setScalar(it.s); p.set(it.x, it.y, it.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      col.setRGB(it.tint, it.tint * (0.97 + (it.r % 0.06)), it.tint * 0.95);
      mesh.setColorAt(k, col);
      counts[it.sp][set] = k + 1;
    }
    this.near.forEach((n, i) => {
      n.close.count = counts[i][0]; n.mid.count = counts[i][1];
      n.close.instanceMatrix.needsUpdate = true; n.mid.instanceMatrix.needsUpdate = true;
      if (n.close.instanceColor) n.close.instanceColor.needsUpdate = true;
      if (n.mid.instanceColor) n.mid.instanceColor.needsUpdate = true;
    });
    this.nearCount = counts.reduce((a, c) => a + c[0] + c[1], 0);
  }
}
const _Y = new THREE.Vector3(0, 1, 0);
function smooth01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
