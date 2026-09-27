// Instanced renderer for common infected. Every body part type is a single
// InstancedMesh, so a horde of 100+ animated/ragdolled infected costs ~8 draw
// calls. Per-instance attributes carry skin/cloth colours, sleeve/pant cut
// lines and a dynamic blood amount; severed parts are hidden by zero scale.
import * as THREE from 'three';
import { PARTS, PART, J, partMatrix } from './body.js';
import { buildPartGeometries } from './partgeo.js';
import { getBloodMask, Noise } from '../render/textures.js';

// Detail/mask texture: R = luminance detail, G = region mask, B = hair/special.
function makeMaskTexture(kind) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const n = new Noise(kind.length * 17 + 3);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s, v = 1 - y / s; // canvas y down; uv v up
      let R = 0.82 + n.fbm(u, v, 8, 4) * 0.25;
      let G = 1, B = 0;
      const folds = Math.sin((u * 6 + n.fbm(u, v, 3, 3) * 2) * Math.PI * 2) * 0.05;
      if (kind === 'torso') {
        R += folds;
        // neck skin
        if (v > 0.93) G = 0;
        // tears in clothing revealing skin
        const tear = n.fbm(u + 0.3, v + 0.7, 4, 5);
        if (tear > 0.66) { G = 0; R *= 0.85; }
        // collar line
        if (v > 0.9 && v < 0.93) R *= 0.7;
        // belt
        if (v > 0.02 && v < 0.08) { B = 1; R *= 0.6; }
      } else if (kind === 'head') {
        G = 0;
        // face on -Z: u ~ 0.75 (see SphereGeometry param). Eyes and mouth.
        const du = u - 0.75, dv = v - 0.5;
        // hair: top & back
        const hairLine = 0.62 + Math.cos((u - 0.75) * Math.PI * 2) * 0.1 + n.fbm(u, v, 6, 3) * 0.08;
        if (v > hairLine) { G = 1; R = 0.7 + n.value(u * 90, v * 40, 90) * 0.4; }
        const eye = (ex) => {
          const dx = (du - ex) * 7.5, dy = (dv - 0.06) * 12;
          return dx * dx + dy * dy;
        };
        const e1 = eye(-0.045), e2 = eye(0.045);
        if (e1 < 1 || e2 < 1) { R = 0.12; B = 0.0; }
        else if (e1 < 2.2 || e2 < 2.2) R *= 0.55; // sunken sockets
        // eye glint (bloodshot)
        if (e1 < 0.18 || e2 < 0.18) { R = 0.55; B = 0.6; }
        // mouth
        const mx = du * 9, my = (dv + 0.09) * 26;
        if (mx * mx + my * my < 1) { R = 0.1; B = 0.8; }
        else if (mx * mx + my * my < 1.8) R *= 0.6;
        // cheek hollows
        if (Math.abs(du) > 0.05 && Math.abs(du) < 0.1 && dv < 0 && dv > -0.1) R *= 0.8;
        // veins
        if (n.ridged(u, v, 6, 3) > 0.82) R *= 0.75;
      } else {
        // limbs: G unused (cut from uv.y in shader); texture detail only
        R += folds * 0.8;
        if (n.fbm(u + 0.9, v, 5, 4) > 0.7) R *= 0.8; // bruises / dirt
      }
      const i = (y * s + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, R * 255));
      img.data[i + 1] = G * 255;
      img.data[i + 2] = B * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function makeCrowdMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ map: makeMaskTexture(kind), roughness: 0.85, metalness: 0 });
  const bloodTex = getBloodMask();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bloodMap = { value: bloodTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aSkin; attribute vec3 aCloth; attribute vec2 aCut;
        varying vec3 vSkin; varying vec3 vCloth; varying vec2 vCut;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSkin = aSkin; vCloth = aCloth; vCut = aCut;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D bloodMap;
        varying vec3 vSkin; varying vec3 vCloth; varying vec2 vCut;`)
      .replace('#include <map_fragment>', `
        vec4 mk = texture2D(map, vMapUv);
        float clothM;
        ${kind === 'limb' ? 'clothM = step(vMapUv.y, vCut.x);' : 'clothM = mk.g;'}
        vec3 base = mix(vSkin, vCloth, clothM);
        ${kind === 'head' ? 'base = mix(base, vec3(0.5,0.05,0.04), mk.b);' : ''}
        ${kind === 'torso' ? 'base = mix(base, vec3(0.05,0.04,0.035), mk.b);' : ''}
        ${kind === 'shin' ? 'base = mix(base, vec3(0.06,0.05,0.045), step(0.9, vMapUv.y));' : ''}
        base *= mk.r;
        float bm = texture2D(bloodMap, vMapUv * vec2(2.0, 1.5)).r;
        float bl = smoothstep(1.0 - vCut.y, 1.0 - vCut.y + 0.2, bm) * step(0.01, vCut.y);
        base = mix(base, vec3(0.16, 0.012, 0.008), bl * 0.9);
        diffuseColor.rgb = base;
        float wetBlood = bl;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, wetBlood);`);
  };
  m.customProgramCacheKey = () => 'crowd-' + kind;
  return m;
}

// Palette for random infected appearance.
const SKINS = [[0.52, 0.47, 0.42], [0.45, 0.42, 0.38], [0.38, 0.33, 0.29], [0.25, 0.2, 0.17], [0.55, 0.5, 0.46], [0.42, 0.45, 0.4], [0.33, 0.27, 0.22]];
const CLOTHS = [
  [0.12, 0.13, 0.16], [0.28, 0.26, 0.24], [0.4, 0.38, 0.34], [0.35, 0.08, 0.06], [0.1, 0.18, 0.3], [0.16, 0.22, 0.14],
  [0.5, 0.48, 0.42], [0.22, 0.14, 0.08], [0.06, 0.06, 0.07], [0.45, 0.4, 0.22], [0.2, 0.3, 0.35], [0.55, 0.55, 0.55],
];
const PANTS = [[0.1, 0.12, 0.2], [0.08, 0.08, 0.09], [0.28, 0.24, 0.18], [0.3, 0.3, 0.3], [0.15, 0.2, 0.3], [0.25, 0.2, 0.12]];
const HAIR = [[0.06, 0.05, 0.04], [0.15, 0.1, 0.06], [0.3, 0.28, 0.25], [0.35, 0.25, 0.12], [0.02, 0.02, 0.02], [0.5, 0.5, 0.48]];
// Themed outfits (hospital, police, worker...)
const OUTFITS = {
  civilian: null,
  hospital: { cloth: [[0.55, 0.62, 0.62], [0.42, 0.55, 0.6], [0.7, 0.7, 0.68]], pants: [[0.55, 0.62, 0.62], [0.42, 0.55, 0.6]] },
  worker: { cloth: [[0.6, 0.45, 0.1], [0.2, 0.25, 0.35], [0.45, 0.28, 0.12]], pants: [[0.15, 0.18, 0.28], [0.2, 0.2, 0.2]] },
  police: { cloth: [[0.08, 0.1, 0.18]], pants: [[0.06, 0.07, 0.12]] },
  subway: { cloth: [[0.3, 0.3, 0.32], [0.18, 0.2, 0.25], [0.45, 0.35, 0.2]], pants: [[0.1, 0.1, 0.12]] },
};

const PART_KIND = ['torso', 'head', 'limb', 'limb', 'limb', 'limb', 'limb', 'shin', 'limb', 'shin'];

export class CrowdRenderer {
  constructor(scene, capacity = 160) {
    this.cap = capacity;
    this.scene = scene;
    const geos = buildPartGeometries({ segs: 8 });
    const geoFor = [geos.torso, geos.head, geos.uarm, geos.farm, geos.uarm, geos.farm, geos.thigh, geos.shin, geos.thigh, geos.shin];
    this.meshes = [];
    this.attrs = [];
    const mats = { torso: makeCrowdMaterial('torso'), head: makeCrowdMaterial('head'), limb: makeCrowdMaterial('limb'), shin: makeCrowdMaterial('shin') };
    // Parts of identical geometry/material share one InstancedMesh with 2 instances per body.
    // groups: torso, head, uarm(L,R), farm(L,R), thigh(L,R), shin(L,R), foot(L,R)
    this.groups = [
      { parts: [PART.torso], geo: geos.torso, mat: mats.torso },
      { parts: [PART.head], geo: geos.head, mat: mats.head },
      { parts: [PART.uarmL, PART.uarmR], geo: geos.uarm, mat: mats.limb },
      { parts: [PART.farmL, PART.farmR], geo: geos.farm, mat: mats.limb },
      { parts: [PART.thighL, PART.thighR], geo: geos.thigh, mat: mats.limb },
      { parts: [PART.shinL, PART.shinR], geo: geos.shin, mat: mats.shin },
    ];
    for (const gr of this.groups) {
      const n = capacity * gr.parts.length;
      const mesh = new THREE.InstancedMesh(gr.geo, gr.mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      const aSkin = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const aCloth = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const aCut = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
      aCut.setUsage(THREE.DynamicDrawUsage);
      gr.geo.setAttribute('aSkin', aSkin);
      gr.geo.setAttribute('aCloth', aCloth);
      gr.geo.setAttribute('aCut', aCut);
      gr.mesh = mesh;
      gr.aSkin = aSkin; gr.aCloth = aCloth; gr.aCut = aCut;
      scene.add(mesh);
    }
    // feet
    this.footGeo = new THREE.BoxGeometry(0.1, 0.085, 0.25);
    this.footGeo.translate(0, -0.035, -0.06);
    this.footMesh = new THREE.InstancedMesh(this.footGeo, new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 }), capacity * 2);
    this.footMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.footMesh.castShadow = true;
    this.footMesh.frustumCulled = false;
    scene.add(this.footMesh);
    this.slots = new Array(capacity).fill(null);
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.mat4 = new Float32Array(16);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // initialise all instances hidden
    for (const gr of this.groups) {
      for (let i = 0; i < gr.mesh.instanceMatrix.count; i++) gr.mesh.setMatrixAt(i, this.zero);
      gr.mesh.count = capacity * gr.parts.length;
    }
    for (let i = 0; i < capacity * 2; i++) this.footMesh.setMatrixAt(i, this.zero);
  }

  // Allocate a slot and randomise appearance. Returns slot or -1.
  alloc(body, outfit = 'civilian', rng = Math.random) {
    if (this.free.length === 0) return -1;
    const slot = this.free.pop();
    this.slots[slot] = body;
    const o = OUTFITS[outfit];
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const lin = (v) => Math.pow(v, 2.2);
    const skin = pick(SKINS).map((v) => lin(v * (0.9 + rng() * 0.2)));
    const cloth = (o ? pick(o.cloth) : pick(CLOTHS)).map((v) => lin(v * (0.8 + rng() * 0.35)));
    const pants = (o ? pick(o.pants) : pick(PANTS)).map((v) => lin(v * (0.8 + rng() * 0.3)));
    const hair = rng() < 0.15 ? skin.map((v) => v * 0.8) : pick(HAIR).map(lin);
    const sleeve = rng() < 0.45 ? 1.1 : rng() < 0.5 ? 0.45 : -0.1; // long / short / none
    const shorts = rng() < 0.12;
    body.look = { skin, cloth, pants, hair, sleeve };
    const blood = 0.15 + rng() * 0.35;
    body.bloodAmt = blood;
    for (const gr of this.groups) {
      for (let k = 0; k < gr.parts.length; k++) {
        const p = gr.parts[k];
        const idx = slot * gr.parts.length + k;
        gr.aSkin.setXYZ(idx, skin[0], skin[1], skin[2]);
        let c = cloth, cut = 1.1;
        if (p === PART.head) { c = hair; cut = 0; }
        else if (p === PART.torso) { c = cloth; }
        else if (p === PART.uarmL || p === PART.uarmR) { cut = sleeve > 0 ? 1.1 : sleeve < 0 ? -0.1 : 0.45; }
        else if (p === PART.farmL || p === PART.farmR) { cut = sleeve > 1 ? 0.78 : -0.1; }
        else if (p === PART.thighL || p === PART.thighR) { c = pants; cut = shorts ? 0.45 : 1.1; }
        else if (p === PART.shinL || p === PART.shinR) { c = pants; cut = shorts ? -0.1 : 0.88; }
        gr.aCloth.setXYZ(idx, c[0], c[1], c[2]);
        gr.aCut.setXY(idx, cut, blood);
      }
      gr.aSkin.needsUpdate = true;
      gr.aCloth.needsUpdate = true;
      gr.aCut.needsUpdate = true;
    }
    return slot;
  }
  setBlood(slot, amount) {
    for (const gr of this.groups) {
      for (let k = 0; k < gr.parts.length; k++) {
        const idx = slot * gr.parts.length + k;
        gr.aCut.setY(idx, Math.min(1, amount));
      }
      gr.aCut.needsUpdate = true;
    }
  }
  release(slot) {
    if (slot < 0 || !this.slots[slot]) return;
    this.slots[slot] = null;
    this.free.push(slot);
    for (const gr of this.groups) {
      for (let k = 0; k < gr.parts.length; k++) gr.mesh.setMatrixAt(slot * gr.parts.length + k, this.zero);
      gr.mesh.instanceMatrix.needsUpdate = true;
    }
    this.footMesh.setMatrixAt(slot * 2, this.zero);
    this.footMesh.setMatrixAt(slot * 2 + 1, this.zero);
    this.footMesh.instanceMatrix.needsUpdate = true;
  }
  // Write matrices for one body.
  writeBody(slot, body) {
    const m = this.mat4;
    for (const gr of this.groups) {
      const arr = gr.mesh.instanceMatrix.array;
      for (let k = 0; k < gr.parts.length; k++) {
        const p = gr.parts[k];
        const off = (slot * gr.parts.length + k) * 16;
        if (!body.visible || (body.severed & (1 << p))) {
          for (let q = 0; q < 16; q++) arr[off + q] = 0;
          continue;
        }
        partMatrix(body, p, m);
        arr.set(m, off);
      }
      gr.mesh.instanceMatrix.needsUpdate = true;
    }
    // feet
    const fa = this.footMesh.instanceMatrix.array;
    for (let side = 0; side < 2; side++) {
      const off = (slot * 2 + side) * 16;
      const shinPart = side === 0 ? PART.shinL : PART.shinR;
      if (!body.visible || (body.severed & (1 << shinPart))) { for (let q = 0; q < 16; q++) fa[off + q] = 0; continue; }
      footMatrix(body, side, m);
      fa.set(m, off);
    }
    this.footMesh.instanceMatrix.needsUpdate = true;
  }
}

export function footMatrix(body, side, out) {
  const j = body.j;
  const kn = side === 0 ? J.LKN : J.RKN, ft = side === 0 ? J.LFT : J.RFT;
  let yx = j[kn * 3] - j[ft * 3], yy = j[kn * 3 + 1] - j[ft * 3 + 1], yz = j[kn * 3 + 2] - j[ft * 3 + 2];
  const yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1;
  yx /= yl; yy /= yl; yz /= yl;
  // blend towards world up so feet stay flat while standing
  if (!body.ragdoll) { yx *= 0.3; yz *= 0.3; yy = 1; const l = Math.sqrt(yx * yx + yy * yy + yz * yz); yx /= l; yy /= l; yz /= l; }
  let xx = body.right[0], xy = body.right[1], xz = body.right[2];
  const d = xx * yx + xy * yy + xz * yz;
  xx -= yx * d; xy -= yy * d; xz -= yz * d;
  const xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
  const s = body.scale;
  out[0] = xx * s; out[1] = xy * s; out[2] = xz * s; out[3] = 0;
  out[4] = yx * s; out[5] = yy * s; out[6] = yz * s; out[7] = 0;
  out[8] = zx * s; out[9] = zy * s; out[10] = zz * s; out[11] = 0;
  out[12] = j[ft * 3]; out[13] = j[ft * 3 + 1]; out[14] = j[ft * 3 + 2]; out[15] = 1;
  return out;
}

export { SKINS, CLOTHS, PANTS, HAIR };
