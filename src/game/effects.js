// Visual effects: pixel particles (blood, sparks, debris), billboards (fire, smoke,
// muzzle flashes, explosions), decals (blood, bullet holes, scorch), tracers and gibs.
import * as THREE from 'three';
import { G } from '../engine/ps1material.js';
import { canvasFor, mulberry32 } from '../engine/textures.js';
import { createPS1Material } from '../engine/ps1material.js';
import { MeshKit } from '../engine/meshkit.js';
import { charAtlas } from './rig.js';

const rnd = Math.random;

// ---------------------------------------------------------------- particles
const PART_VS = /* glsl */`
attribute float size;
attribute vec4 pcolor;
uniform float uScale;
uniform vec2 uSnapRes;
varying vec4 vCol;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnapRes + 0.5) / uSnapRes * clip.w;
  gl_Position = clip;
  gl_PointSize = clamp(floor(size * uScale / max(-mv.z, 0.1) + 0.5), 1.0, 7.0);
  vCol = pcolor;
  vDepth = -mv.z;
}`;
const PART_FS = /* glsl */`
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec4 vCol; varying float vDepth;
void main() {
  if (vCol.a < 0.01) discard;
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(mix(vCol.rgb, uFogColor, f), vCol.a);
}`;

export class Particles {
  constructor(scene, max = 4096) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.floor = new Float32Array(max);
    this.flags = new Uint8Array(max); // bit0: leaves blood decal on floor hit
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('pcolor', this.aCol); geo.setAttribute('size', this.aSize);
    geo.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 120 }, uSnapRes: G.uSnapRes, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo = geo;
    scene.add(this.points);
    this.onFloorHit = null;
  }
  // projection scale: pixels per metre at 1m distance
  setScreenHeight(h, fovDeg = 75) { this.uniforms.uScale.value = h / (2 * Math.tan(fovDeg * Math.PI / 360)); }
  spawn(x, y, z, vx, vy, vz, r, g, b, a, size, life, grav = 9.8, drag = 0.5, floorY = -1e9, flags = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i] = size * 0.03; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floorY; this.flags[i] = flags;
  }
  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.n;
        if (i !== j) {
          p[i * 3] = p[j * 3]; p[i * 3 + 1] = p[j * 3 + 1]; p[i * 3 + 2] = p[j * 3 + 2];
          v[i * 3] = v[j * 3]; v[i * 3 + 1] = v[j * 3 + 1]; v[i * 3 + 2] = v[j * 3 + 2];
          for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.col[j * 4 + k];
          this.size[i] = this.size[j]; this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
          this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.floor[i] = this.floor[j]; this.flags[i] = this.flags[j];
        }
        i--; continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= d; v[i * 3 + 2] *= d; v[i * 3 + 1] = v[i * 3 + 1] * d - this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < this.floor[i]) {
        p[i * 3 + 1] = this.floor[i];
        if (this.flags[i] & 1 && this.onFloorHit && Math.random() < 0.25) this.onFloorHit(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        v[i * 3] *= 0.2; v[i * 3 + 2] *= 0.2; v[i * 3 + 1] = 0;
        this.flags[i] = 0;
        this.life[i] = Math.min(this.life[i], 0.6);
      }
      const t = this.life[i] / this.maxLife[i];
      if (t < 0.3) this.col[i * 4 + 3] = Math.min(this.col[i * 4 + 3], t / 0.3);
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- billboards
// atlas 128x64: row0: fire frames (4 x 16x32 -> occupy 64x32), smoke (32x32), muzzle (16x16), glow(16x16)
const BB_VS = /* glsl */`
attribute vec3 offset;
attribute vec4 bcolor;
attribute vec4 uvRect;
attribute vec2 bsize;   // width, height
attribute float rot;
uniform vec2 uSnapRes;
varying vec2 vUv;
varying vec4 vCol;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(offset, 1.0);
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  mv.xy += q * bsize;
  vec4 clip = projectionMatrix * mv;
  if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnapRes + 0.5) / uSnapRes * clip.w;
  gl_Position = clip;
  vUv = uvRect.xy + uv * uvRect.zw;
  vCol = bcolor;
  vDepth = -mv.z;
}`;
const BB_FS = /* glsl */`
uniform sampler2D map;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform float uAdditive;
varying vec2 vUv; varying vec4 vCol; varying float vDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.02) discard;
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 col = t.rgb * vCol.rgb;
  col = mix(col, uFogColor * (1.0 - uAdditive), f);
  gl_FragColor = vec4(col, a);
}`;

function makeBBAtlas() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvasFor('fire', { seed: 3 }), 0, 0);             // 64x32 (4 frames 16x32)
  ctx.drawImage(canvasFor('smoke', { seed: 4 }), 64, 0);           // 32x32
  ctx.drawImage(canvasFor('muzzle', { seed: 5 }), 96, 0);          // 16x16
  // glow dot
  const g = ctx.createRadialGradient(120, 8, 0, 120, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(112, 0, 16, 16);
  // explosion puff (orange smoke) at 96,16 (32x32)
  ctx.drawImage(canvasFor('smoke', { seed: 6 }), 96, 16);
  // spark streak 0,32 (16x16)
  ctx.fillStyle = '#fff'; ctx.fillRect(7, 33, 2, 14);
  // blood puff 16,32
  ctx.drawImage(canvasFor('blood', { seed: 7 }), 16, 32, 32, 32);
  // drip / splash for acid 48,32
  ctx.drawImage(canvasFor('acid', { seed: 8 }), 48, 32, 32, 32);
  // bile puff 80,32
  ctx.drawImage(canvasFor('bile', { seed: 9 }), 80, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  const R = (x, y, w, h) => [x / 128, y / 64, w / 128, h / 64];
  return { tex: t, fire: [R(0, 0, 16, 32), R(16, 0, 16, 32), R(32, 0, 16, 32), R(48, 0, 16, 32)], smoke: R(64, 0, 32, 32), muzzle: R(96, 0, 16, 16), glow: R(112, 0, 16, 16), puff: R(96, 16, 32, 32), spark: R(0, 32, 16, 16), blood: R(16, 32, 32, 32), acid: R(48, 32, 32, 32), bile: R(80, 32, 32, 32) };
}

class BillboardSet {
  constructor(scene, atlas, max, additive) {
    this.max = max; this.atlas = atlas;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('uv', base.getAttribute('uv'));
    this.offset = new Float32Array(max * 3); this.color = new Float32Array(max * 4); this.uvRect = new Float32Array(max * 4); this.bsize = new Float32Array(max * 2); this.rot = new Float32Array(max);
    const mk = (arr, n) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aOff = mk(this.offset, 3); this.aCol = mk(this.color, 4); this.aUV = mk(this.uvRect, 4); this.aSize = mk(this.bsize, 2); this.aRot = mk(this.rot, 1);
    geo.setAttribute('offset', this.aOff); geo.setAttribute('bcolor', this.aCol); geo.setAttribute('uvRect', this.aUV); geo.setAttribute('bsize', this.aSize); geo.setAttribute('rot', this.aRot);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.tex }, uSnapRes: G.uSnapRes, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uAdditive: { value: additive ? 1 : 0 } },
      vertexShader: BB_VS, fragmentShader: BB_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 7 : 6;
    this.geo = geo;
    this.items = [];
    scene.add(this.mesh);
  }
  // item: {x,y,z, vx,vy,vz, w,h, grow, life, max, r,g,b,a, fade, uv | anim(array), animRate, rot, rotV, grav}
  add(it) {
    if (this.items.length >= this.max) this.items.shift();
    it.max = it.life; it.t = 0;
    this.items.push(it);
    return it;
  }
  update(dt) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.persist) it.life -= dt;
      it.t += dt;
      if (it.life <= 0) { items.splice(i, 1); i--; continue; }
      if (it.vx) it.x += it.vx * dt; if (it.vy) it.y += it.vy * dt; if (it.vz) it.z += it.vz * dt;
      if (it.grav) it.vy -= it.grav * dt;
      if (it.grow) { it.w += it.grow * dt; it.h += it.grow * dt; }
      if (it.rotV) it.rot = (it.rot || 0) + it.rotV * dt;
      if (it.hidden) continue;
      const k = n;
      this.offset[k * 3] = it.x; this.offset[k * 3 + 1] = it.y; this.offset[k * 3 + 2] = it.z;
      const lifeT = it.persist ? 1 : it.life / it.max;
      const fa = it.fade === false ? 1 : Math.min(1, lifeT * (it.fadeK || 2));
      const fi = it.fadeIn ? Math.min(1, it.t / it.fadeIn) : 1;
      this.color[k * 4] = it.r; this.color[k * 4 + 1] = it.g; this.color[k * 4 + 2] = it.b; this.color[k * 4 + 3] = it.a * fa * fi;
      let uv = it.uv;
      if (it.anim) uv = it.anim[Math.floor(it.t * (it.animRate || 10) + (it.animOff || 0)) % it.anim.length];
      this.uvRect[k * 4] = uv[0]; this.uvRect[k * 4 + 1] = uv[1]; this.uvRect[k * 4 + 2] = uv[2]; this.uvRect[k * 4 + 3] = uv[3];
      this.bsize[k * 2] = it.w; this.bsize[k * 2 + 1] = it.h;
      this.rot[k] = it.rot || 0;
      n++;
    }
    this.geo.instanceCount = n;
    this.aOff.needsUpdate = this.aCol.needsUpdate = this.aUV.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- decals
function makeDecalAtlas() {
  // 128x128: 4 blood variants (32x32), bullet hole, scorch, bile, acid, blood drip trail
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < 4; i++) ctx.drawImage(canvasFor('blood', { seed: 100 + i }), i * 32, 0);
  for (let i = 0; i < 4; i++) ctx.drawImage(canvasFor('bulletHole', { seed: 200 + i }), i * 8, 32, 8, 8);
  ctx.drawImage(canvasFor('scorch', { seed: 300 }), 32, 32);
  ctx.drawImage(canvasFor('bile', { seed: 301 }), 64, 32);
  ctx.drawImage(canvasFor('acid', { seed: 302 }), 96, 32);
  for (let i = 0; i < 4; i++) ctx.drawImage(canvasFor('blood', { seed: 400 + i }), i * 32, 64);
  // darken second row of blood for older/dried variants
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  const R = (x, y, w, h) => [x / 128, y / 128, (x + w) / 128, (y + h) / 128];
  return { tex: t, blood: [R(0, 0, 32, 32), R(32, 0, 32, 32), R(64, 0, 32, 32), R(96, 0, 32, 32), R(0, 64, 32, 32), R(32, 64, 32, 32), R(64, 64, 32, 32), R(96, 64, 32, 32)], hole: [R(0, 32, 8, 8), R(8, 32, 8, 8), R(16, 32, 8, 8), R(24, 32, 8, 8)], scorch: R(32, 32, 32, 32), bile: R(64, 32, 32, 32), acid: R(96, 32, 32, 32) };
}

export class Decals {
  constructor(scene, max = 400) {
    this.max = max; this.i = 0;
    this.atlas = makeDecalAtlas();
    this.pos = new Float32Array(max * 4 * 3); this.uv = new Float32Array(max * 4 * 2); this.col = new Float32Array(max * 4 * 3); this.nrm = new Float32Array(max * 4 * 3);
    const idx = new Uint32Array(max * 6);
    for (let q = 0; q < max; q++) { idx[q * 6] = q * 4; idx[q * 6 + 1] = q * 4 + 1; idx[q * 6 + 2] = q * 4 + 2; idx[q * 6 + 3] = q * 4; idx[q * 6 + 4] = q * 4 + 2; idx[q * 6 + 5] = q * 4 + 3; }
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aUV = new THREE.BufferAttribute(this.uv, 2); this.aCol = new THREE.BufferAttribute(this.col, 3); this.aN = new THREE.BufferAttribute(this.nrm, 3);
    for (const a of [this.aPos, this.aUV, this.aCol, this.aN]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('uv', this.aUV); geo.setAttribute('color', this.aCol); geo.setAttribute('normal', this.aN);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = createPS1Material({ map: this.atlas.tex, baked: true, alphaTest: 0.5, fogScale: 1 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.geo = geo;
    this.lightFn = null; // (pos) => THREE.Color baked light at position
  }
  /** Place a decal at point p with surface normal n. kind: 'blood'|'hole'|'scorch'|'bile'|'acid' */
  add(p, n, size, kind = 'blood', rot = Math.random() * Math.PI * 2, light = null) {
    const q = this.i; this.i = (this.i + 1) % this.max;
    let uvr = this.atlas[kind];
    if (Array.isArray(uvr[0])) uvr = uvr[(Math.random() * uvr.length) | 0];
    const N = n.clone().normalize();
    const up = Math.abs(N.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const T = new THREE.Vector3().crossVectors(up, N).normalize();
    const Bv = new THREE.Vector3().crossVectors(N, T).normalize();
    const c = Math.cos(rot), s = Math.sin(rot);
    const t2 = T.clone().multiplyScalar(c).addScaledVector(Bv, s), b2 = Bv.clone().multiplyScalar(c).addScaledVector(T, -s);
    const h = size / 2;
    const P = p.clone().addScaledVector(N, 0.015);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const L = light || (this.lightFn ? this.lightFn(P) : new THREE.Color(0.6, 0.6, 0.6));
    corners.forEach(([a, b], k) => {
      const v = P.clone().addScaledVector(t2, a * h).addScaledVector(b2, b * h);
      const o = (q * 4 + k);
      this.pos[o * 3] = v.x; this.pos[o * 3 + 1] = v.y; this.pos[o * 3 + 2] = v.z;
      this.nrm[o * 3] = N.x; this.nrm[o * 3 + 1] = N.y; this.nrm[o * 3 + 2] = N.z;
      this.uv[o * 2] = a < 0 ? uvr[0] : uvr[2]; this.uv[o * 2 + 1] = b < 0 ? uvr[1] : uvr[3];
      this.col[o * 3] = L.r; this.col[o * 3 + 1] = L.g; this.col[o * 3 + 2] = L.b;
    });
    this.aPos.needsUpdate = this.aUV.needsUpdate = this.aCol.needsUpdate = this.aN.needsUpdate = true;
  }
  clear() { this.pos.fill(0); this.aPos.needsUpdate = true; }
}

// ---------------------------------------------------------------- tracers
export class Tracers {
  constructor(scene, max = 64) {
    this.max = max; this.items = [];
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aCol = new THREE.BufferAttribute(this.col, 3);
    this.aPos.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('color', this.aCol);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.geo = geo;
    scene.add(this.lines);
  }
  add(a, b, speed = 180) {
    const dir = b.clone().sub(a); const len = dir.length();
    if (len < 0.5) return;
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ a: a.clone(), dir: dir.multiplyScalar(1 / len), len, t: 0, speed, seg: Math.min(3, len * 0.4) });
  }
  update(dt) {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.t += dt * it.speed;
      if (it.t - it.seg > it.len) { this.items.splice(i, 1); i--; continue; }
      const s = Math.max(0, it.t - it.seg), e = Math.min(it.len, it.t);
      const p0 = it.a.clone().addScaledVector(it.dir, s), p1 = it.a.clone().addScaledVector(it.dir, e);
      this.pos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], n * 6);
      this.col.set([0.3, 0.25, 0.1, 1.0, 0.85, 0.5], n * 6);
      n++;
    }
    this.geo.setDrawRange(0, n * 2);
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- gibs & debris (simple physics meshes)
export class Gibs {
  constructor(scene, collision, max = 48) {
    this.scene = scene; this.collision = collision; this.max = max;
    this.items = [];
    const A = charAtlas();
    this.mat = createPS1Material({ map: A.texture, tint: true });
    const mk = (fn) => { const k = new MeshKit(); k.defaultUV = A.blood; fn(k); return k.toGeometry(); };
    this.geos = {
      chunk: mk((k) => k.box([0, 0, 0], [0.08, 0.06, 0.07], 0x8a1a12)),
      chunk2: mk((k) => k.box([0, 0, 0], [0.12, 0.05, 0.09], 0x6a1410)),
      bone: mk((k) => { k.box([0, 0, 0], [0.04, 0.16, 0.04], 0xd8d0b8); k.box([0, 0.08, 0], [0.06, 0.04, 0.06], 0x8a1a12); }),
      head: mk((k) => { k.box([0, 0, 0], [0.2, 0.22, 0.2], 0x9a8a78); k.box([0, -0.1, 0], [0.12, 0.04, 0.12], 0x7a1010); }),
      arm: mk((k) => { k.box([0, 0, 0], [0.09, 0.4, 0.09], 0x8a7a6a); k.box([0, 0.2, 0], [0.1, 0.03, 0.1], 0x8a1a12); }),
      leg: mk((k) => { k.box([0, 0, 0], [0.13, 0.6, 0.13], 0x3a4a6a); k.box([0, 0.3, 0], [0.14, 0.03, 0.14], 0x8a1a12); }),
      glass: mk((k) => k.box([0, 0, 0], [0.12, 0.01, 0.09], 0xa0c0c8)),
      wood: mk((k) => k.box([0, 0, 0], [0.04, 0.03, 0.3], 0x7a5232)),
      concrete: mk((k) => k.box([0, 0, 0], [0.1, 0.08, 0.1], 0x8a8780)),
    };
    this.onLand = null;
  }
  spawn(kind, pos, vel, opts = {}) {
    if (this.items.length >= this.max) { const old = this.items.shift(); this.scene.remove(old.mesh); }
    const mesh = new THREE.Mesh(this.geos[kind] || this.geos.chunk, opts.material || this.mat);
    mesh.position.copy(pos);
    mesh.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    if (opts.color) { mesh.material = this.mat.clone(); }
    this.scene.add(mesh);
    const it = { mesh, vel: vel.clone(), spin: new THREE.Vector3(rnd() * 10 - 5, rnd() * 10 - 5, rnd() * 10 - 5), life: opts.life || 12, resting: false, bleed: opts.bleed ? 1.5 : 0, kind };
    this.items.push(it);
    return it;
  }
  update(dt, effects) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this.scene.remove(it.mesh); this.items.splice(i, 1); i--; continue; }
      if (it.life < 1) it.mesh.scale.setScalar(Math.max(0.01, it.life));
      if (it.resting) continue;
      it.vel.y -= 14 * dt;
      const p = it.mesh.position;
      const step = it.vel.clone().multiplyScalar(dt);
      const len = step.length();
      if (len > 1e-5) {
        const hit = this.collision.raycast(p, step.clone().normalize(), len + 0.03, { move: true });
        if (hit) {
          p.copy(hit.point).addScaledVector(hit.normal, 0.03);
          const vn = it.vel.dot(hit.normal);
          it.vel.addScaledVector(hit.normal, -1.5 * vn).multiplyScalar(0.45);
          it.spin.multiplyScalar(0.5);
          if (it.bleed > 0 && effects && hit.normal.y > 0.5) effects.decals.add(hit.point, hit.normal, 0.3 + Math.random() * 0.2, 'blood');
          if (it.vel.lengthSq() < 0.3 && hit.normal.y > 0.6) it.resting = true;
          if (this.onLand) this.onLand(it, hit);
        } else p.add(step);
      }
      it.mesh.rotation.x += it.spin.x * dt; it.mesh.rotation.y += it.spin.y * dt; it.mesh.rotation.z += it.spin.z * dt;
      if (it.bleed > 0 && effects) {
        it.bleed -= dt;
        if (Math.random() < 0.5) effects.particles.spawn(p.x, p.y, p.z, rnd() - 0.5, rnd(), rnd() - 0.5, 0.45, 0.02, 0.01, 1, 3, 0.6, 9.8, 0.5);
      }
    }
  }
  clear() { for (const it of this.items) this.scene.remove(it.mesh); this.items = []; }
}

// ---------------------------------------------------------------- facade
export class Effects {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
    this.particles = new Particles(scene);
    this.bbAtlas = makeBBAtlas();
    this.bb = new BillboardSet(scene, this.bbAtlas, 600, false);
    this.bbAdd = new BillboardSet(scene, this.bbAtlas, 300, true);
    this.decals = new Decals(scene);
    this.tracers = new Tracers(scene);
    this.gibs = new Gibs(scene, collision);
    this.particles.onFloorHit = (x, y, z) => { if (Math.random() < 0.5) this.decals.add(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), 0.15 + Math.random() * 0.25, 'blood'); };
    this.lights = null; // set by world: (pos, color, range, life) => void
  }
  update(dt, camPos) {
    this.camPos = camPos;
    this.particles.update(dt);
    this.bb.update(dt);
    this.bbAdd.update(dt);
    this.tracers.update(dt);
    this.gibs.update(dt, this);
  }
  floorBelow(p, max = 3) {
    const g = this.collision.groundAt(p.x, p.y + 0.1, p.z, max);
    return g ? g.y : p.y - max;
  }
  // ---- high level effects
  blood(p, dir, amount = 1, opts = {}) {
    const fy = this.floorBelow(p);
    const n = Math.round(14 * amount);
    for (let i = 0; i < n; i++) {
      const sp = 1 + rnd() * 3 * amount;
      const vx = dir.x * sp + (rnd() - 0.5) * 2.5, vy = dir.y * sp + rnd() * 2.5, vz = dir.z * sp + (rnd() - 0.5) * 2.5;
      const dark = 0.3 + rnd() * 0.3;
      this.particles.spawn(p.x, p.y, p.z, vx, vy, vz, dark, 0.01, 0.01, 1, 2 + rnd() * 3, 0.5 + rnd() * 0.8, 9.8, 0.8, fy, 1);
    }
    // mist puff (not right in the camera's face)
    if (!this.camPos || this.camPos.distanceToSquared(p) > 2.5) this.bb.add({ x: p.x, y: p.y, z: p.z, vx: dir.x * 0.5, vy: 0.2, vz: dir.z * 0.5, w: 0.3 * amount + 0.2, h: 0.3 * amount + 0.2, grow: 1.2, life: 0.35, r: 0.6, g: 0.05, b: 0.04, a: 0.8, uv: this.bbAtlas.blood, rot: rnd() * 6 });
    // wall splatter behind the hit
    if (opts.wall !== false && amount >= 0.5) {
      const hit = this.collision.raycast(p, dir, 2.5, {});
      if (hit) this.decals.add(hit.point, hit.normal, 0.4 + rnd() * 0.5 * amount, 'blood');
    }
    if (amount >= 1 && rnd() < 0.6) {
      const g = this.collision.groundAt(p.x + dir.x * 0.5, p.y + 0.5, p.z + dir.z * 0.5, 3);
      if (g) this.decals.add(new THREE.Vector3(p.x + dir.x * 0.5, g.y, p.z + dir.z * 0.5), g.normal, 0.5 + rnd() * 0.6, 'blood');
    }
  }
  impact(p, n, surface) {
    // dust / sparks depending on surface
    const metal = surface === 2, wood = surface === 3, glass = surface === 6;
    const k = metal ? 6 : 5;
    for (let i = 0; i < k; i++) {
      const sp = 1 + rnd() * 3;
      const vx = n.x * sp + (rnd() - 0.5) * 2, vy = n.y * sp + rnd() * 2, vz = n.z * sp + (rnd() - 0.5) * 2;
      if (metal) this.particles.spawn(p.x, p.y, p.z, vx * 1.5, vy * 1.5, vz * 1.5, 1, 0.85, 0.4, 1, 2, 0.25 + rnd() * 0.2, 12, 0.3);
      else if (wood) this.particles.spawn(p.x, p.y, p.z, vx, vy, vz, 0.45, 0.3, 0.15, 1, 2.5, 0.5, 9.8, 0.6, p.y - 2);
      else if (glass) this.particles.spawn(p.x, p.y, p.z, vx, vy, vz, 0.75, 0.85, 0.9, 0.9, 2, 0.6, 9.8, 0.3, p.y - 2);
      else this.particles.spawn(p.x, p.y, p.z, vx * 0.7, vy * 0.7, vz * 0.7, 0.55, 0.52, 0.48, 1, 2.5, 0.4, 6, 0.8);
    }
    if (!metal && !glass) this.bb.add({ x: p.x + n.x * 0.05, y: p.y + n.y * 0.05, z: p.z + n.z * 0.05, vx: n.x * 0.4, vy: 0.3, vz: n.z * 0.4, w: 0.15, h: 0.15, grow: 0.8, life: 0.5, r: 0.6, g: 0.58, b: 0.52, a: 0.6, uv: this.bbAtlas.smoke, rot: rnd() * 6 });
    if (metal) this.bbAdd.add({ x: p.x, y: p.y, z: p.z, w: 0.12, h: 0.12, life: 0.06, r: 1, g: 0.8, b: 0.4, a: 1, uv: this.bbAtlas.glow });
    this.decals.add(p, n, 0.07, 'hole');
  }
  muzzleFlash(p, size = 0.25) {
    this.bbAdd.add({ x: p.x, y: p.y, z: p.z, w: size, h: size, life: 0.05, r: 1, g: 0.9, b: 0.6, a: 1, uv: this.bbAtlas.muzzle, rot: rnd() * 6, fade: false });
  }
  explosion(p, size = 1) {
    for (let i = 0; i < 10; i++) {
      this.bbAdd.add({ x: p.x + (rnd() - 0.5) * size, y: p.y + rnd() * size, z: p.z + (rnd() - 0.5) * size, vx: (rnd() - 0.5) * 3, vy: 1 + rnd() * 2, vz: (rnd() - 0.5) * 3, w: 1.2 * size, h: 1.2 * size, grow: 3 * size, life: 0.5 + rnd() * 0.3, r: 1, g: 0.6, b: 0.25, a: 1, uv: this.bbAtlas.puff, rot: rnd() * 6 });
    }
    for (let i = 0; i < 12; i++) {
      this.bb.add({ x: p.x + (rnd() - 0.5) * size, y: p.y + rnd() * size, z: p.z + (rnd() - 0.5) * size, vx: (rnd() - 0.5) * 2, vy: 1 + rnd() * 1.5, vz: (rnd() - 0.5) * 2, w: 1.5 * size, h: 1.5 * size, grow: 2.5, life: 2 + rnd() * 1.5, r: 0.15, g: 0.14, b: 0.13, a: 0.8, uv: this.bbAtlas.smoke, rot: rnd() * 6, fadeIn: 0.3 });
    }
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, e = rnd() * 1.2, sp = 4 + rnd() * 10;
      this.particles.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 1, 0.7 + rnd() * 0.3, 0.3, 1, 2 + rnd() * 2, 0.4 + rnd() * 0.6, 9.8, 0.5);
    }
    const g = this.collision.groundAt(p.x, p.y + 0.5, p.z, 3);
    if (g) this.decals.add(new THREE.Vector3(p.x, g.y, p.z), g.normal, 2.5 * size, 'scorch');
    if (this.lights) this.lights(p, new THREE.Color(1, 0.6, 0.3), 14 * size, 0.5, 3);
  }
  fireSprite(x, y, z, w, h, opts = {}) {
    return this.bbAdd.add({ x, y, z, w, h, life: opts.life || 1e9, persist: !!opts.persist, r: 1, g: opts.g || 0.85, b: opts.b || 0.7, a: opts.a || 0.95, anim: this.bbAtlas.fire, animRate: 8 + rnd() * 4, animOff: rnd() * 4, fade: opts.fade !== undefined ? opts.fade : true, fadeK: 4 });
  }
  smokePuff(x, y, z, opts = {}) {
    return this.bb.add({ x, y, z, vx: (rnd() - 0.5) * 0.3 + (opts.vx || 0), vy: opts.vy !== undefined ? opts.vy : 0.6 + rnd() * 0.5, vz: (rnd() - 0.5) * 0.3 + (opts.vz || 0), w: opts.size || 0.8, h: opts.size || 0.8, grow: opts.grow || 0.8, life: opts.life || 3, r: opts.r !== undefined ? opts.r : 0.2, g: opts.g !== undefined ? opts.g : 0.19, b: opts.b !== undefined ? opts.b : 0.18, a: opts.a || 0.5, uv: this.bbAtlas.smoke, rot: rnd() * 6, rotV: (rnd() - 0.5) * 0.5, fadeIn: 0.4 });
  }
  bileSplash(p, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = 1 + rnd() * 3;
      this.particles.spawn(p.x, p.y, p.z, Math.cos(a) * sp, 1 + rnd() * 3, Math.sin(a) * sp, 0.4, 0.55, 0.1, 1, 3, 0.8, 9.8, 0.5, this.floorBelow(p));
    }
    for (let i = 0; i < 6; i++) this.bb.add({ x: p.x, y: p.y, z: p.z, vx: (rnd() - 0.5) * 2, vy: rnd(), vz: (rnd() - 0.5) * 2, w: 1, h: 1, grow: 1.5, life: 1.2, r: 0.5, g: 0.65, b: 0.15, a: 0.6, uv: this.bbAtlas.smoke, rot: rnd() * 6 });
  }
}
