// Streams chunk section meshes around the camera with a per-frame meshing budget.
import * as THREE from 'three';
import { Mesher } from './Mesher.js';
import { CHUNK } from './World.js';
import { BLOCKS } from './blocks.js';
import { globalUniforms, LIGHTING_GLSL } from '../render/materials.js';

const VERT = /* glsl */ `
in vec4 aData;
in vec4 aLight;
uniform float uTime;
uniform float uWind;
out vec3 vUvL;
out vec3 vWorldPos;
out vec3 vLight;
flat out int vFace;
flat out int vFlags;
void main() {
  vec3 p = position / 32.0;
  vFace = int(aData.x + 0.5);
  vFlags = int(aData.y + 0.5);
  float layer = aData.z + aData.w * 256.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  if ((vFlags & 1) != 0) {
    float amt = (vFlags & 2) != 0 ? 0.10 : (vFace == 6 ? 0.0 : 0.03);
    float t = uTime * (1.3 + uWind * 1.8);
    float k = 0.35 + uWind * 1.2;
    wp.x += sin(t + wp.x * 0.7 + wp.z * 0.31 + wp.y * 0.2) * amt * k;
    wp.z += cos(t * 0.83 + wp.x * 0.43 + wp.z * 0.61) * amt * k;
  }
  if ((vFlags & 8) != 0 && (vFace == 2 || (vFlags & 16) != 0)) {
    wp.y += sin(uTime * 1.4 + wp.x * 0.9 + wp.z * 0.6) * 0.025 - 0.02;
  }
  vWorldPos = wp.xyz;
  vUvL = vec3(uv / 32.0, layer);
  vLight = aLight.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
${LIGHTING_GLSL}
uniform sampler2DArray uAtlas;
uniform int uPass;
in vec3 vUvL;
in vec3 vWorldPos;
in vec3 vLight;
flat in int vFace;
flat in int vFlags;
out vec4 fragColor;
const vec3 NORMALS[7] = vec3[7](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,1,0));
void main() {
  vec3 uvl = vUvL;
  bool water = (vFlags & 8) != 0;
  if (water) {
    uvl.xy += vec2(uTime * 0.03, uTime * 0.017) + 0.04 * vec2(sin(uTime * 0.7 + vWorldPos.z), cos(uTime * 0.6 + vWorldPos.x));
  }
  vec4 tex = texture(uAtlas, uvl);
  if (uPass == 1 && tex.a < 0.5) discard;
  if (uPass == 0) tex.a = 1.0;
  vec3 n = NORMALS[vFace];
  float sky = vLight.x, blk = vLight.y, ao = vLight.z;
  // directional face shading like Minecraft (softens flat looks)
  float faceShade = vFace == 2 ? 1.0 : vFace == 3 ? 0.55 : (vFace == 0 || vFace == 1) ? 0.8 : vFace == 6 ? 0.92 : 0.88;
  vec3 lit = computeLighting(vWorldPos, n, sky, blk, ao) * faceShade;
  vec3 albedo = tex.rgb;
  // rain-soaked surfaces outdoors get darker and a little more saturated
  float wet = uWetness * smoothstep(0.8, 1.0, sky) * (vFace == 2 ? 1.0 : 0.5);
  albedo = mix(albedo, albedo * albedo * 1.2, wet * 0.5);
  vec3 col = albedo * lit;
  // wet sheen: flat outdoor surfaces mirror the sky at grazing angles; puddles (pixel-snapped value
  // noise, 1/16 block like the textures) mirror it strongly
  if (vFace == 2 && wet > 0.01 && !water && uPass != 2) {
    vec2 q = floor(vWorldPos.xz * 16.0) / 16.0;
    vec2 i0 = floor(q * 0.35), f0 = fract(q * 0.35);
    f0 = f0 * f0 * (3.0 - 2.0 * f0);
    float n00 = fract(sin(dot(i0, vec2(127.1, 311.7))) * 43758.5);
    float n10 = fract(sin(dot(i0 + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
    float n01 = fract(sin(dot(i0 + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
    float n11 = fract(sin(dot(i0 + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
    float pn = mix(mix(n00, n10, f0.x), mix(n01, n11, f0.x), f0.y);
    float puddle = step(0.62, pn) * wet;
    vec3 V = normalize(vWorldPos - uCamPos);
    float fres = pow(1.0 - abs(V.y), 4.0);
    vec3 skyRefl = uFogColor * (0.3 + 0.3 * sky) + vec3(0.75, 0.8, 1.0) * uLightning * 0.4;
    float refl = wet * (0.04 + 0.22 * fres) + puddle * (0.18 + 0.32 * fres);
    col = mix(col, skyRefl, clamp(refl, 0.0, 0.6));
  }
  if ((vFlags & 4) != 0) col = max(col, albedo * 1.6);
  float alpha = tex.a;
  if (water && (vFlags & 16) != 0) {
    // surface seen from below: bright, sky-tinted, total internal reflection at grazing angles
    vec3 V = normalize(vWorldPos - uCamPos);
    float tir = smoothstep(0.35, 0.15, abs(V.y));
    col = mix(uFogColor * (0.35 + 0.65 * sky) * 0.9 + albedo * 0.15, uWaterFog * 1.4, tir);
    alpha = mix(0.55, 0.95, tir);
  } else if (water) {
    vec3 V = normalize(vWorldPos - uCamPos);
    float fres = pow(1.0 - abs(V.y), 3.0);
    col = mix(col, uFogColor * (0.4 + 0.6 * sky), fres * 0.55);
    alpha = mix(alpha, 1.0, fres * 0.5);
  }
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, uPass == 2 ? alpha : 1.0);
}
`;

export function createVoxelMaterial(atlas, pass) {
  const passId = pass === 'opaque' ? 0 : pass === 'cutout' ? 1 : 2;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...globalUniforms, uAtlas: { value: atlas }, uPass: { value: passId } },
    transparent: passId === 2,
    depthWrite: passId !== 2,
    side: THREE.FrontSide,
  });
}

const PASSES = ['opaque', 'cutout', 'translucent'];

export class ChunkRenderer {
  constructor(world, scene, textures) {
    this.world = world;
    this.scene = scene;
    this.textures = textures;
    this.mesher = new Mesher(world, (n) => textures.layer(n));
    this.materials = {
      opaque: createVoxelMaterial(textures.texture, 'opaque'),
      cutout: createVoxelMaterial(textures.texture, 'cutout'),
      translucent: createVoxelMaterial(textures.texture, 'translucent'),
    };
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
    this.sections = new Map(); // key -> {cx,cy,cz, meshes:{}, dirty, built}
    this.radius = 8; // in chunks
    this.NCX = Math.ceil(world.SX / CHUNK);
    this.NCY = Math.ceil(world.SY / CHUNK);
    this.NCZ = Math.ceil(world.SZ / CHUNK);
    this.dirtyUrgent = new Set();
    this.lastCenter = null;
    this.queue = [];
    this.budgetMs = 5;
    this._needQueue = true;
    this.stats = { sections: 0, meshed: 0, triangles: 0 };
    world.listeners.push((x0, y0, z0, x1, y1, z1) => this.markRegionDirty(x0, y0, z0, x1, y1, z1));
    this._sphere = new THREE.Sphere(new THREE.Vector3(8, 8, 8), 14);
  }

  key(cx, cy, cz) { return (cx * this.NCY + cy) * this.NCZ + cz; }

  markRegionDirty(x0, y0, z0, x1, y1, z1) {
    const c0x = Math.max(0, Math.floor(x0 / CHUNK)), c1x = Math.min(this.NCX - 1, Math.floor(x1 / CHUNK));
    const c0y = Math.max(0, Math.floor(y0 / CHUNK)), c1y = Math.min(this.NCY - 1, Math.floor(y1 / CHUNK));
    const c0z = Math.max(0, Math.floor(z0 / CHUNK)), c1z = Math.min(this.NCZ - 1, Math.floor(z1 / CHUNK));
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) for (let cz = c0z; cz <= c1z; cz++) {
      const k = this.key(cx, cy, cz);
      const s = this.sections.get(k);
      if (s) { s.dirty = true; this.dirtyUrgent.add(k); this._needQueue = true; }
    }
  }

  /** Synchronously mesh everything within radius r of (x,z) – used during loading. */
  async prebuild(x, z, r, onProgress) {
    const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
    const list = [];
    for (let cx = ccx - r; cx <= ccx + r; cx++) for (let cz = ccz - r; cz <= ccz + r; cz++) {
      if (cx < 0 || cz < 0 || cx >= this.NCX || cz >= this.NCZ) continue;
      if ((cx - ccx) ** 2 + (cz - ccz) ** 2 > r * r) continue;
      for (let cy = 0; cy < this.NCY; cy++) list.push([cx, cy, cz]);
    }
    let t = performance.now();
    for (let i = 0; i < list.length; i++) {
      const [cx, cy, cz] = list[i];
      this.buildSection(cx, cy, cz);
      if (performance.now() - t > 40) {
        if (onProgress) await onProgress(i / list.length);
        t = performance.now();
      }
    }
  }

  buildSection(cx, cy, cz) {
    const k = this.key(cx, cy, cz);
    let s = this.sections.get(k);
    if (!s) {
      s = { cx, cy, cz, meshes: {}, dirty: true, built: false };
      this.sections.set(k, s);
    }
    const out = this.mesher.mesh(cx, cy, cz);
    for (const pass of PASSES) {
      const data = out[pass];
      const old = s.meshes[pass];
      if (!data) {
        if (old) { this.group.remove(old); old.geometry.dispose(); delete s.meshes[pass]; }
        continue;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Uint16BufferAttribute(data.pos, 3));
      g.setAttribute('uv', new THREE.Uint8BufferAttribute(data.uv, 2));
      g.setAttribute('aData', new THREE.Uint8BufferAttribute(data.data, 4));
      g.setAttribute('aLight', new THREE.Uint8BufferAttribute(data.light, 4, true));
      g.setIndex(new THREE.BufferAttribute(data.index, 1));
      g.boundingSphere = this._sphere.clone();
      g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(17, 17, 17));
      if (old) {
        old.geometry.dispose();
        old.geometry = g;
      } else {
        const m = new THREE.Mesh(g, this.materials[pass]);
        m.position.set(cx * CHUNK, cy * CHUNK, cz * CHUNK);
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.renderOrder = pass === 'translucent' ? 2 : pass === 'cutout' ? 1 : 0;
        this.group.add(m);
        s.meshes[pass] = m;
      }
    }
    s.dirty = false;
    s.built = true;
    this.stats.meshed++;
    // lets the renderer know its cached shadow map is stale
    this.group.userData.meshVersion = (this.group.userData.meshVersion || 0) + 1;
  }

  unloadSection(k) {
    const s = this.sections.get(k);
    if (!s) return;
    for (const pass of PASSES) {
      const m = s.meshes[pass];
      if (m) { this.group.remove(m); m.geometry.dispose(); }
    }
    this.sections.delete(k);
    this.group.userData.meshVersion = (this.group.userData.meshVersion || 0) + 1;
  }

  update(camPos) {
    this.updateUnderwater(camPos);
    const ccx = Math.floor(camPos.x / CHUNK), ccz = Math.floor(camPos.z / CHUNK);
    const r = this.radius;
    const t0 = performance.now();
    // urgent remeshes first (block changes near player)
    if (this.dirtyUrgent.size) {
      for (const k of this.dirtyUrgent) {
        const s = this.sections.get(k);
        if (s && s.dirty) this.buildSection(s.cx, s.cy, s.cz);
        this.dirtyUrgent.delete(k);
        if (performance.now() - t0 > this.budgetMs * 2) break;
      }
    }
    // the missing-section queue is rebuilt only when the centre chunk / radius changes or sections were
    // marked dirty (it used to be rebuilt every frame once empty: ~1.7k map lookups + sort per frame)
    const centerKey = (ccx * 100000 + ccz) * 32 + r;
    if (centerKey !== this.lastCenter || this._needQueue) {
      this.lastCenter = centerKey;
      this._needQueue = false;
      // rebuild queue of missing sections sorted by distance
      const q = [];
      for (let cx = ccx - r; cx <= ccx + r; cx++) for (let cz = ccz - r; cz <= ccz + r; cz++) {
        if (cx < 0 || cz < 0 || cx >= this.NCX || cz >= this.NCZ) continue;
        const d2 = (cx - ccx) ** 2 + (cz - ccz) ** 2;
        if (d2 > r * r) continue;
        for (let cy = 0; cy < this.NCY; cy++) {
          const s = this.sections.get(this.key(cx, cy, cz));
          if (!s || s.dirty) q.push([d2, cx, cy, cz]);
        }
      }
      q.sort((a, b) => b[0] - a[0]); // pop from end = nearest
      this.queue = q;
      // unload far sections
      const ur = (r + 2) * (r + 2);
      for (const [k, s] of this.sections) {
        if ((s.cx - ccx) ** 2 + (s.cz - ccz) ** 2 > ur) this.unloadSection(k);
      }
    }
    // holes right around the player (teleport, fast travel) get a bigger budget than the distant fill-in
    const near = this.queue.length && this.queue[this.queue.length - 1][0] <= 2;
    const budget = this.budgetMs * (near ? 2 : 1);
    while (this.queue.length && performance.now() - t0 < budget) {
      const [, cx, cy, cz] = this.queue.pop();
      const s = this.sections.get(this.key(cx, cy, cz));
      if (s && !s.dirty) continue;
      this.buildSection(cx, cy, cz);
    }
    this.stats.sections = this.sections.size;
  }

  /** Camera inside water -> murky underwater fog (all lit materials) + tinted sky / post. */
  updateUnderwater(camPos) {
    const w = this.world;
    const x = Math.floor(camPos.x), y = Math.floor(camPos.y), z = Math.floor(camPos.z);
    const id = w.get(x, y, z);
    let uw = BLOCKS[id] && BLOCKS[id].render === 'liquid';
    // the rendered surface sits at 0.875 of the top water block
    if (uw && camPos.y - y > 0.86 && BLOCKS[w.get(x, y + 1, z)].render !== 'liquid') uw = false;
    const G = globalUniforms;
    G.uUnderwater.value = uw ? 1 : 0;
    if (uw) {
      const a = G.uAmbientColor.value, sun = G.uSunColor.value;
      const sky = w.skyAt(x, y, z) / 15;
      const b = (a.r + a.g + a.b) / 3 * (0.25 + 0.75 * sky) + (sun.r + sun.g + sun.b) / 3 * 0.15 * sky;
      G.uWaterFog.value.setRGB(0.07 * b + 0.004, 0.24 * b + 0.01, 0.3 * b + 0.014);
    }
  }

  dispose() {
    for (const k of [...this.sections.keys()]) this.unloadSection(k);
    this.scene.remove(this.group);
    for (const p of PASSES) this.materials[p].dispose();
  }
}
