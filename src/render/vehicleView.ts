// Renders a simulated vehicle. Every physics node acts as an affine "bone":
// its matrix is the local deformation gradient (fit from neighbouring beams)
// plus its current position, so crushed panels bend smoothly and detached
// parts carry their meshes away. Wheels are rigid groups driven by the sim.

import * as THREE from 'three';
import type { Vehicle } from '../sim/vehicle/vehicle.ts';
import { BEAM_BROKEN } from '../sim/softbody.ts';
import { buildCarGeometry, computeSkin, type GeoGroup, type MatKey } from './carMesh.ts';
import { buildWheel, type WheelParts, type RimStyle } from './wheelMesh.ts';
import { grilleTexture, plateTexture, headlightTexture, taillightTexture, crackedGlassTexture, randomPlate } from './textures.ts';
import { extractRotation, mat3FromQuat, mat3Invert } from '../sim/math.ts';

class NodeSkeleton extends THREE.Skeleton {
  constructor(n: number) {
    const bones: THREE.Bone[] = [];
    for (let i = 0; i < n; i++) bones.push(new THREE.Bone());
    super(bones);
    this.computeBoneTexture();
  }
  override update(): void {
    if (this.boneTexture) this.boneTexture.needsUpdate = true;
  }
}

export interface PaintOptions {
  color: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  stripes?: boolean;
  stripeColor?: number;
}

const sharedMats = new Map<string, THREE.Material>();
function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = sharedMats.get(key) as T | undefined;
  if (!m) {
    m = make();
    sharedMats.set(key, m);
  }
  return m;
}

/** Per-node wear values are uploaded as a float texture sampled in the vertex shader. */
function makePaintMaterial(p: PaintOptions, wearTex: THREE.DataTexture, wearSize: number): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: p.color,
    metalness: p.metalness,
    roughness: p.roughness,
    clearcoat: p.clearcoat,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.0,
  });
  const uniforms = {
    wearTex: { value: wearTex },
    wearSize: { value: wearSize },
    stripeColor: { value: new THREE.Color(p.stripeColor ?? 0xf5f5f5) },
    stripes: { value: p.stripes ? 1 : 0 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D wearTex;
         uniform float wearSize;
         varying float vWear;
         varying vec3 vRest;
         varying vec3 vRestN;
         float nodeWear(float idx) {
           float x = mod(idx, wearSize);
           float y = floor(idx / wearSize);
           return texture2D(wearTex, (vec2(x, y) + 0.5) / wearSize).r;
         }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vRest = position;
         vRestN = normal;
         vWear = nodeWear(skinIndex.x) * skinWeight.x + nodeWear(skinIndex.y) * skinWeight.y +
                 nodeWear(skinIndex.z) * skinWeight.z + nodeWear(skinIndex.w) * skinWeight.w;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vWear;
         varying vec3 vRest;
         varying vec3 vRestN;
         uniform vec3 stripeColor;
         uniform float stripes;
         float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
         float vnoise(vec3 x) {
           vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
           return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         if (stripes > 0.5) {
           float ax = abs(vRest.x);
           if (ax > 0.07 && ax < 0.21 && vRestN.y > 0.35) diffuseColor.rgb = stripeColor;
         }
         float scratchN = vnoise(vRest * vec3(38.0, 9.0, 38.0)) * 0.6 + vnoise(vRest * 120.0) * 0.4;
         float wearAmt = smoothstep(0.0, 1.0, vWear);
         float bare = step(1.0 - wearAmt * 0.95, scratchN);
         vec3 primer = vec3(0.32, 0.33, 0.34);
         vec3 metal = vec3(0.55, 0.56, 0.57);
         diffuseColor.rgb = mix(diffuseColor.rgb, mix(primer, metal, step(0.75, scratchN)), bare * 0.92);
         diffuseColor.rgb *= 1.0 - wearAmt * 0.25;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.55, clamp(vWear * 1.2, 0.0, 1.0));`,
      );
  };
  m.customProgramCacheKey = () => 'paint-skin-v1';
  return m;
}

export class VehicleView {
  readonly vehicle: Vehicle;
  readonly group = new THREE.Group();
  readonly skeleton: NodeSkeleton;
  readonly meshes: THREE.SkinnedMesh[] = [];
  readonly wheels: WheelParts[] = [];
  paintMat: THREE.MeshPhysicalMaterial;
  private glass = new Map<number, { mesh: THREE.SkinnedMesh; cracked: boolean }>();
  private lights = new Map<number, { mesh: THREE.SkinnedMesh; mat: THREE.MeshStandardMaterial; kind: 'head' | 'tail' }>();
  private wearData: Float32Array;
  private wearTex: THREE.DataTexture;
  private wearSize: number;
  // deformation gradient fitting
  private nbStart!: Int32Array;
  private nbIdx!: Int32Array;
  private nbW!: Float64Array;
  private binv!: Float64Array;
  private lambda!: Float64Array;
  private structVersion = -1;
  private partRot: Float64Array;
  private partQuat: Float64Array;
  private partNodes: Int32Array[];
  private crackedMat: THREE.Material;
  private glassMat: THREE.Material;
  visible = true;
  readonly bodyBounds = new THREE.Sphere();

  constructor(vehicle: Vehicle, paint: PaintOptions) {
    this.vehicle = vehicle;
    const st = vehicle.struct;
    const body = vehicle.body;
    this.skeleton = new NodeSkeleton(body.n);
    this.wearSize = Math.ceil(Math.sqrt(body.n));
    this.wearData = new Float32Array(this.wearSize * this.wearSize * 4);
    this.wearTex = new THREE.DataTexture(this.wearData, this.wearSize, this.wearSize, THREE.RGBAFormat, THREE.FloatType);
    this.wearTex.needsUpdate = true;
    this.paintMat = makePaintMaterial(paint, this.wearTex, this.wearSize);
    this.partRot = new Float64Array(body.parts.length * 9);
    this.partQuat = new Float64Array(body.parts.length * 4);
    for (let p = 0; p < body.parts.length; p++) {
      this.partRot.set([1, 0, 0, 0, 1, 0, 0, 0, 1], p * 9);
      this.partQuat.set([0, 0, 0, 1], p * 4);
    }
    this.partNodes = body.parts.map((p) => Int32Array.from(p.nodes));

    this.glassMat = shared('glass', () => new THREE.MeshPhysicalMaterial({
      color: 0x060a0e,
      metalness: 0.0,
      roughness: 0.02,
      transparent: true,
      opacity: 0.72,
      envMapIntensity: 2.4,
      reflectivity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }));
    this.crackedMat = shared('glassCracked', () => new THREE.MeshPhysicalMaterial({
      color: 0x8a959c,
      metalness: 0.0,
      roughness: 0.25,
      transparent: true,
      opacity: 0.85,
      map: crackedGlassTexture(),
      alphaMap: crackedGlassTexture(),
      side: THREE.DoubleSide,
      depthWrite: false,
    }));

    const geo = buildCarGeometry(vehicle.def, st);
    const plateTex = plateTexture(randomPlate(vehicle.id * 97 + 13));
    for (const g of geo.groups.values()) {
      const mesh = this.makeMesh(g, plateTex);
      if (!mesh) continue;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    // wheels
    const def = vehicle.def;
    for (let i = 0; i < 4; i++) {
      const w = buildWheel(def.shape.wheelRadius, def.shape.wheelWidth, def.features.tireProfile ?? 0.5, (def.features.rimStyle ?? 'spoke5') as RimStyle, def.id === 'vortex' ? 0xc9a400 : 0xa81818);
      if (vehicle.wheels[i].side < 0) {
        // mirror so the rim face points outward (-X)
        w.knuckle.rotation.y = Math.PI;
      }
      this.wheels.push(w);
      this.group.add(w.root);
    }
    this.rebuildFit();
    this.update();
  }

  private makeMesh(g: GeoGroup, plateTex: THREE.Texture): THREE.SkinnedMesh | null {
    if (g.pos.length === 0) return null;
    const st = this.vehicle.struct;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    let uv = g.uv;
    if (g.mat === 'glass' || g.mat === 'light' || g.mat === 'plate' || g.mat === 'grille') uv = planarUV(g);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const skin = computeSkin(g, st);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.skinWeight, 4));
    let material: THREE.Material | THREE.Material[];
    const key = g.key;
    switch (g.mat as MatKey) {
      case 'paint':
        material = this.paintMat;
        break;
      case 'trim':
        material = shared('trim', () => new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.6, metalness: 0.15 }));
        break;
      case 'chrome':
        material = shared('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.12, metalness: 1.0 }));
        break;
      case 'glass':
        material = this.glassMat;
        break;
      case 'grille':
        material = shared('grille', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: grilleTexture(), roughness: 0.5, metalness: 0.5 }));
        break;
      case 'plate':
        material = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.45, metalness: 0.1 });
        break;
      case 'interior':
        material = shared('interior', () => new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.92 }));
        break;
      case 'under':
        material = shared('under', () => new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95, side: THREE.DoubleSide }));
        break;
      case 'engine':
        material = shared('engine', () => new THREE.MeshStandardMaterial({ color: 0x4a4b4e, roughness: 0.5, metalness: 0.6 }));
        break;
      case 'light': {
        const idx = Number(key.split(':')[1]);
        const ld = st.lights[idx];
        const head = ld?.kind === 'head';
        const lm = new THREE.MeshStandardMaterial({
          color: head ? 0xffffff : 0xffffff,
          map: head ? headlightTexture() : taillightTexture(),
          emissive: head ? 0xfff6e0 : 0xff2010,
          emissiveMap: head ? headlightTexture() : taillightTexture(),
          emissiveIntensity: 0.3,
          roughness: 0.15,
          metalness: 0.2,
        });
        material = lm;
        break;
      }
      default:
        material = shared('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    }
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.bind(this.skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.castShadow = g.mat !== 'glass';
    mesh.receiveShadow = g.mat !== 'glass';
    if (g.mat === 'glass') {
      mesh.renderOrder = 2;
      const idx = key.split(':')[1];
      if (idx !== 'q') this.glass.set(Number(idx), { mesh, cracked: false });
    }
    if (g.mat === 'light') {
      const idx = Number(key.split(':')[1]);
      const ld = st.lights[idx];
      this.lights.set(idx, { mesh, mat: material as THREE.MeshStandardMaterial, kind: ld?.kind ?? 'head' });
    }
    if (g.mat === 'paint') {
      // interior (back) faces of panels
      const inner = new THREE.SkinnedMesh(geo, shared('paintInner', () => new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.85, side: THREE.BackSide })));
      inner.bind(this.skeleton, new THREE.Matrix4());
      inner.frustumCulled = false;
      inner.castShadow = false;
      inner.receiveShadow = true;
      this.meshes.push(inner);
      this.group.add(inner);
    }
    return mesh;
  }

  setPaint(p: PaintOptions): void {
    this.paintMat.color.setHex(p.color);
    this.paintMat.metalness = p.metalness;
    this.paintMat.roughness = p.roughness;
    this.paintMat.clearcoat = p.clearcoat;
    const u = this.paintMat.userData.uniforms;
    u.stripes.value = p.stripes ? 1 : 0;
    if (p.stripeColor !== undefined) u.stripeColor.value.setHex(p.stripeColor);
  }

  /** Recompute neighbour sets and inverse rest moment matrices (after breaks). */
  private rebuildFit(): void {
    const body = this.vehicle.body;
    const n = body.n;
    const rest = body.rest;
    const start = new Int32Array(n + 1);
    const idx: number[] = [];
    const w: number[] = [];
    this.binv = new Float64Array(n * 9);
    this.lambda = new Float64Array(n);
    const B = new Float64Array(9);
    const tmp = new Float64Array(9);
    for (let i = 0; i < n; i++) {
      start[i] = idx.length;
      const pi = body.nodePart[i];
      const s = body.adjStart[i], e = body.adjStart[i + 1];
      let count = 0;
      const collect = (samePart: boolean) => {
        for (let k = s; k < e; k++) {
          const b = body.adjBeam[k];
          if (body.bFlags[b] & BEAM_BROKEN) continue;
          const j = body.bA[b] === i ? body.bB[b] : body.bA[b];
          if (samePart && body.nodePart[j] !== pi) continue;
          if (idx.lastIndexOf(j) >= start[i]) continue;
          idx.push(j);
          const dx = rest[j * 3] - rest[i * 3], dy = rest[j * 3 + 1] - rest[i * 3 + 1], dz = rest[j * 3 + 2] - rest[i * 3 + 2];
          w.push(1 / Math.max(1e-4, dx * dx + dy * dy + dz * dz));
          count++;
        }
      };
      collect(true);
      if (count < 3) collect(false);
      B.fill(0);
      for (let k = start[i]; k < idx.length; k++) {
        const j = idx[k];
        const dx = rest[j * 3] - rest[i * 3], dy = rest[j * 3 + 1] - rest[i * 3 + 1], dz = rest[j * 3 + 2] - rest[i * 3 + 2];
        const ww = w[k];
        B[0] += ww * dx * dx; B[1] += ww * dx * dy; B[2] += ww * dx * dz;
        B[3] += ww * dy * dx; B[4] += ww * dy * dy; B[5] += ww * dy * dz;
        B[6] += ww * dz * dx; B[7] += ww * dz * dy; B[8] += ww * dz * dz;
      }
      const tr = B[0] + B[4] + B[8];
      const lam = 0.08 * tr / 3 + 1e-3;
      this.lambda[i] = lam;
      B[0] += lam; B[4] += lam; B[8] += lam;
      if (!mat3Invert(B, tmp)) tmp.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      this.binv.set(tmp, i * 9);
    }
    start[n] = idx.length;
    this.nbStart = start;
    this.nbIdx = Int32Array.from(idx);
    this.nbW = Float64Array.from(w);
    this.structVersion = body.structVersion;
  }

  /** Per-frame update of bone matrices, wheels, glass and lights. */
  update(): void {
    const v = this.vehicle;
    const body = v.body;
    if (body.structVersion !== this.structVersion) this.rebuildFit();
    const pos = body.pos, rest = body.rest;
    // part rotations
    const R = this.partRot;
    for (let p = 0; p < this.partNodes.length; p++) {
      const nodes = this.partNodes[p];
      if (nodes.length < 3) continue;
      body.fitRigid(nodes, _r9, _t3, this.partQuat.subarray(p * 4, p * 4 + 4));
      R.set(_r9, p * 9);
    }
    const bm = this.skeleton.boneMatrices as Float32Array;
    const A = _A;
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let i = 0; i < body.n; i++) {
      const i3 = i * 3;
      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      const rx = rest[i3], ry = rest[i3 + 1], rz = rest[i3 + 2];
      if (px < minx) minx = px;
      if (px > maxx) maxx = px;
      if (py < miny) miny = py;
      if (py > maxy) maxy = py;
      if (pz < minz) minz = pz;
      if (pz > maxz) maxz = pz;
      A.fill(0);
      for (let k = this.nbStart[i]; k < this.nbStart[i + 1]; k++) {
        const j = this.nbIdx[k];
        const j3 = j * 3;
        const w = this.nbW[k];
        const dx = pos[j3] - px, dy = pos[j3 + 1] - py, dz = pos[j3 + 2] - pz;
        const ex = rest[j3] - rx, ey = rest[j3 + 1] - ry, ez = rest[j3 + 2] - rz;
        A[0] += w * dx * ex; A[1] += w * dx * ey; A[2] += w * dx * ez;
        A[3] += w * dy * ex; A[4] += w * dy * ey; A[5] += w * dy * ez;
        A[6] += w * dz * ex; A[7] += w * dz * ey; A[8] += w * dz * ez;
      }
      const lam = this.lambda[i];
      const pr = body.nodePart[i] * 9;
      for (let k = 0; k < 9; k++) A[k] += lam * R[pr + k];
      // F = A * Binv
      const bi = this.binv;
      const o = i * 9;
      const F0 = A[0] * bi[o] + A[1] * bi[o + 3] + A[2] * bi[o + 6];
      const F1 = A[0] * bi[o + 1] + A[1] * bi[o + 4] + A[2] * bi[o + 7];
      const F2 = A[0] * bi[o + 2] + A[1] * bi[o + 5] + A[2] * bi[o + 8];
      const F3 = A[3] * bi[o] + A[4] * bi[o + 3] + A[5] * bi[o + 6];
      const F4 = A[3] * bi[o + 1] + A[4] * bi[o + 4] + A[5] * bi[o + 7];
      const F5 = A[3] * bi[o + 2] + A[4] * bi[o + 5] + A[5] * bi[o + 8];
      const F6 = A[6] * bi[o] + A[7] * bi[o + 3] + A[8] * bi[o + 6];
      const F7 = A[6] * bi[o + 1] + A[7] * bi[o + 4] + A[8] * bi[o + 7];
      const F8 = A[6] * bi[o + 2] + A[7] * bi[o + 5] + A[8] * bi[o + 8];
      const b = i * 16;
      bm[b] = F0; bm[b + 1] = F3; bm[b + 2] = F6; bm[b + 3] = 0;
      bm[b + 4] = F1; bm[b + 5] = F4; bm[b + 6] = F7; bm[b + 7] = 0;
      bm[b + 8] = F2; bm[b + 9] = F5; bm[b + 10] = F8; bm[b + 11] = 0;
      bm[b + 12] = px - (F0 * rx + F1 * ry + F2 * rz);
      bm[b + 13] = py - (F3 * rx + F4 * ry + F5 * rz);
      bm[b + 14] = pz - (F6 * rx + F7 * ry + F8 * rz);
      bm[b + 15] = 1;
    }
    this.skeleton.update();
    this.bodyBounds.center.set((minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2);
    this.bodyBounds.radius = Math.hypot(maxx - minx, maxy - miny, maxz - minz) / 2 + 0.6;

    // wear: scrape + plastic strain around each node
    this.updateWear();

    // wheels
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const ws = v.wheels[i];
      if (ws.detached) {
        w.root.visible = !!this.detachedWheelPose[i];
        const pose = this.detachedWheelPose[i];
        if (pose) {
          w.root.position.copy(pose.position);
          w.root.quaternion.copy(pose.quaternion);
          w.spin.rotation.x = 0;
        }
        continue;
      }
      w.root.visible = true;
      v.wheelTransform(i, _p3, _r9);
      w.root.position.set(_p3[0], _p3[1], _p3[2]);
      _m4.set(
        _r9[0], _r9[1], _r9[2], 0,
        _r9[3], _r9[4], _r9[5], 0,
        _r9[6], _r9[7], _r9[8], 0,
        0, 0, 0, 1,
      );
      w.root.quaternion.setFromRotationMatrix(_m4);
      // camber visual + flat tire
      w.knuckle.rotation.z = (ws.side > 0 ? 1 : -1) * ws.camberDamage * 0 + 0;
      w.spin.rotation.x = ws.angle;
      const flat = ws.flat;
      w.tire.scale.set(1, 1 - flat * 0.08, 1 - flat * 0.08);
    }

    // glass state
    for (const [idx, g] of this.glass) {
      const s = v.windowState[idx] ?? 0;
      g.mesh.visible = s < 2;
      if (s === 1 && !g.cracked) {
        g.mesh.material = this.crackedMat;
        g.cracked = true;
      } else if (s === 0 && g.cracked) {
        g.mesh.material = this.glassMat;
        g.cracked = false;
      }
    }
    // lights
    for (const [idx, l] of this.lights) {
      const broken = v.lightBroken[idx] === 1;
      let intensity = 0;
      if (!broken) {
        if (l.kind === 'head') intensity = v.headlights ? 3.2 : 0.35;
        else intensity = v.braking ? 3.0 : v.headlights ? 1.0 : 0.25;
      }
      l.mat.emissiveIntensity = intensity;
      l.mat.color.setHex(broken ? 0x222222 : 0xffffff);
    }
  }

  /** Poses for detached wheels (set by the game from free wheel bodies). */
  detachedWheelPose: ({ position: THREE.Vector3; quaternion: THREE.Quaternion } | null)[] = [null, null, null, null];

  private wearTimer = 0;
  private updateWear(): void {
    this.wearTimer++;
    if (this.wearTimer % 6 !== 0) return;
    const body = this.vehicle.body;
    const d = this.wearData;
    let changed = false;
    for (let i = 0; i < body.n; i++) {
      let s = 0;
      for (let k = body.adjStart[i]; k < body.adjStart[i + 1]; k++) {
        const b = body.adjBeam[k];
        const st = body.bFlags[b] & BEAM_BROKEN ? 0.3 : Math.abs(body.bL[b] - body.bL0[b]) / body.bL0[b];
        if (st > s) s = st;
      }
      const wv = Math.min(1, body.nodeScrape[i] * 0.6 + Math.max(0, s - 0.01) * 6);
      if (Math.abs(d[i * 4] - wv) > 0.01) {
        d[i * 4] = wv;
        changed = true;
      }
    }
    if (changed) this.wearTex.needsUpdate = true;
  }

  resetVisuals(): void {
    this.wearData.fill(0);
    this.wearTex.needsUpdate = true;
    this.detachedWheelPose = [null, null, null, null];
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
    }
    this.paintMat.dispose();
    this.wearTex.dispose();
    this.skeleton.dispose();
    this.group.removeFromParent();
  }
}

/** Compute planar UVs for a group from its two dominant axes, normalized to [0,1]. */
function planarUV(g: GeoGroup): number[] {
  const n = g.pos.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const v = g.pos[i * 3 + k];
    if (v < min[k]) min[k] = v;
    if (v > max[k]) max[k] = v;
  }
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
  let ua = order[0], va = order[1];
  // prefer x horizontal and y vertical for faces
  if (ext[2] < Math.max(ext[0], ext[1]) * 0.6) {
    ua = 0;
    va = 1;
  } else if (ext[0] < Math.max(ext[1], ext[2]) * 0.6) {
    ua = 2;
    va = 1;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push((g.pos[i * 3 + ua] - min[ua]) / (ext[ua] || 1), (g.pos[i * 3 + va] - min[va]) / (ext[va] || 1));
  }
  return out;
}

const _A = new Float64Array(9);
const _r9 = new Float64Array(9);
const _t3 = new Float64Array(3);
const _p3 = new Float64Array(3);
const _m4 = new THREE.Matrix4();
void extractRotation;
void mat3FromQuat;
