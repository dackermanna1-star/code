import * as THREE from 'three';
import { BloodAtlas, FaceKind, SPLAT } from './bloodAtlas';
import { brickTexture, concreteTexture, crateTexture, graffitiTexture, metalSidingTexture, pillarTexture, radialTexture } from './textures';
import { RNG } from '../core/math';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
  kind: 'wall' | 'pillar' | 'crate' | 'prop';
  name: string;
}
export interface Door {
  x: number; // outside spawn point
  z: number;
  ix: number; // inside entry point
  iz: number;
  yaw: number; // facing into the arena
  width: number;
}
export interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  obstacle: Obstacle;
}

export const HALF_W = 13;
export const HALF_D = 11;
export const WALL_H = 7;

/** Build a quad with tiling uv (meters / tile) and blood atlas uv. */
function paintQuad(blood: BloodAtlas, origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: number, h: number, tile: [number, number], kind: FaceKind, density: number, segU = 1, segV = 1) {
  const face = blood.addFace(origin, u, v, w, h, kind, density);
  const n = face.n;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const buv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const lu = (i / segU) * w, lv = (j / segV) * h;
      const p = origin.clone().addScaledVector(face.u, lu).addScaledVector(face.v, lv);
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(lu / tile[0], lv / tile[1]);
      const [bu, bv] = blood.faceUV(face, lu, lv);
      buv.push(bu, bv);
    }
  }
  for (let j = 0; j < segV; j++)
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('bloodUv', new THREE.Float32BufferAttribute(buv, 2));
  g.setIndex(idx);
  return g;
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vcount = 0;
  let icount = 0;
  for (const g of geos) {
    vcount += g.attributes.position.count;
    icount += g.index!.count;
  }
  const out = new THREE.BufferGeometry();
  const names = Object.keys(geos[0].attributes);
  for (const nm of names) {
    const size = geos[0].attributes[nm].itemSize;
    const arr = new Float32Array(vcount * size);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[nm].array as Float32Array, o);
      o += g.attributes[nm].count * size;
    }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  const idx = new Uint32Array(icount);
  let io = 0, vo = 0;
  for (const g of geos) {
    const src = g.index!.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    io += src.length;
    vo += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export class Arena {
  group = new THREE.Group();
  obstacles: Obstacle[] = [];
  doors: Door[] = [];
  lamps: { light: THREE.PointLight; bulb: THREE.Mesh; base: number; flicker: number; phase: number; pivot: THREE.Object3D; swing: number; swingV: number }[] = [];
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  dust: THREE.Points;
  time = 0;
  private rng = new RNG(99);

  constructor(public blood: BloodAtlas, pointLights: number, shadowMapSize: number) {
    const S = blood.size;
    const floorDensity = S >= 4096 ? 96 : 52;
    const wallDensity = floorDensity * 0.45;
    const propDensity = floorDensity * 0.6;

    // ---------------------------------------------------------------- floor
    const concrete = concreteTexture(11);
    const floorMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.86, metalness: 0.0, color: 0xb8b4ae });
    blood.patchMaterial(floorMat);
    const floorGeo = paintQuad(blood, new THREE.Vector3(-HALF_W, 0, HALF_D), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), HALF_W * 2, HALF_D * 2, [4, 4], 'floor', floorDensity, 8, 8);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.group.add(floor);
    // outside floor (doorways) — dark, not paintable
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.01;
    this.group.add(outside);

    // ---------------------------------------------------------------- walls
    const brick = brickTexture(12);
    const wallMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.92, color: 0xa09088 });
    blood.patchMaterial(wallMat);
    const siding = metalSidingTexture(13);
    const sidingMat = new THREE.MeshStandardMaterial({ map: siding, roughness: 0.6, metalness: 0.35, color: 0x8a9096 });
    const lowerH = 3.6;
    const wallGeos: THREE.BufferGeometry[] = [];
    const upperGeos: THREE.BufferGeometry[] = [];
    type WallSpec = { origin: THREE.Vector3; u: THREE.Vector3; len: number; doorAt?: number; doorW?: number; doorH?: number; name: string };
    const walls: WallSpec[] = [
      { name: 'north', origin: new THREE.Vector3(HALF_W, 0, -HALF_D), u: new THREE.Vector3(-1, 0, 0), len: HALF_W * 2, doorAt: HALF_W, doorW: 5, doorH: 4.2 },
      { name: 'south', origin: new THREE.Vector3(-HALF_W, 0, HALF_D), u: new THREE.Vector3(1, 0, 0), len: HALF_W * 2, doorAt: HALF_W, doorW: 5, doorH: 4.2 },
      { name: 'east', origin: new THREE.Vector3(HALF_W, 0, HALF_D), u: new THREE.Vector3(0, 0, -1), len: HALF_D * 2, doorAt: HALF_D, doorW: 2.2, doorH: 2.8 },
      { name: 'west', origin: new THREE.Vector3(-HALF_W, 0, -HALF_D), u: new THREE.Vector3(0, 0, 1), len: HALF_D * 2, doorAt: HALF_D, doorW: 2.2, doorH: 2.8 },
    ];
    const up = new THREE.Vector3(0, 1, 0);
    for (const w of walls) {
      const segs: [number, number, number, number][] = []; // u0,u1, v0, v1
      if (w.doorAt !== undefined) {
        const d0 = w.doorAt - w.doorW! / 2, d1 = w.doorAt + w.doorW! / 2;
        segs.push([0, d0, 0, lowerH], [d1, w.len, 0, lowerH], [d0, d1, w.doorH!, lowerH]);
        // door spawn
        const mid = w.origin.clone().addScaledVector(w.u, w.doorAt);
        const inward = new THREE.Vector3().crossVectors(up, w.u).negate(); // points into arena
        inward.set(-w.u.z, 0, w.u.x);
        // ensure inward points to origin
        if (inward.dot(mid.clone().negate()) < 0) inward.negate();
        const outP = mid.clone().addScaledVector(inward, -3.2);
        const inP = mid.clone().addScaledVector(inward, 1.6);
        this.doors.push({ x: outP.x, z: outP.z, ix: inP.x, iz: inP.z, yaw: Math.atan2(inward.x, inward.z), width: w.doorW! });
        // dark tunnel behind door
        const tunnel = new THREE.Mesh(new THREE.BoxGeometry(w.doorW! + 0.4, w.doorH! + 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.BackSide }));
        tunnel.position.copy(mid).addScaledVector(inward, -3.0).setY(w.doorH! / 2);
        tunnel.rotation.y = Math.atan2(inward.x, inward.z);
        this.group.add(tunnel);
        // roll-up door slats (raised) above opening
        const slat = new THREE.Mesh(new THREE.BoxGeometry(w.doorW! + 0.3, 0.5, 0.15), sidingMat);
        slat.position.copy(mid).setY(w.doorH! + 0.25).addScaledVector(inward, -0.1);
        slat.rotation.y = Math.atan2(inward.x, inward.z);
        this.group.add(slat);
        // hazard frame
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.7 });
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, w.doorH!, 0.25), frameMat);
          post.position.copy(mid).addScaledVector(w.u, (s * w.doorW!) / 2).setY(w.doorH! / 2).addScaledVector(inward, 0.05);
          post.castShadow = true;
          this.group.add(post);
        }
        // collision for wall segments either side of door handled below
      } else segs.push([0, w.len, 0, lowerH]);
      for (const [u0, u1, v0, v1] of segs) {
        const o = w.origin.clone().addScaledVector(w.u, u0).setY(v0);
        wallGeos.push(paintQuad(blood, o, w.u, up, u1 - u0, v1 - v0, [3, 3], 'wall', wallDensity, Math.max(1, Math.round((u1 - u0) / 3)), 1));
      }
      // upper siding (non-paintable)
      const uo = w.origin.clone().setY(lowerH);
      const upGeo = new THREE.PlaneGeometry(w.len, WALL_H - lowerH);
      const inward = new THREE.Vector3(-w.u.z, 0, w.u.x);
      const c = uo.clone().addScaledVector(w.u, w.len / 2).setY(lowerH + (WALL_H - lowerH) / 2);
      if (inward.dot(c.clone().setY(0).negate()) < 0) inward.negate();
      upGeo.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(inward.x, inward.z)));
      upGeo.translate(c.x, c.y, c.z);
      const uvs = upGeo.attributes.uv.array as Float32Array;
      for (let i = 0; i < uvs.length; i += 2) {
        uvs[i] *= w.len / 2.5;
        uvs[i + 1] *= (WALL_H - lowerH) / 2.5;
      }
      upperGeos.push(upGeo);
      // trim strip between brick and siding
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w.len, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.6 }));
      trim.position.copy(c).setY(lowerH);
      trim.rotation.y = Math.atan2(inward.x, inward.z) + Math.PI / 2;
      this.group.add(trim);
    }
    const wallMesh = new THREE.Mesh(mergeGeos(wallGeos), wallMat);
    wallMesh.receiveShadow = true;
    this.group.add(wallMesh);
    const upper = new THREE.Mesh(mergeGeos(upperGeos), sidingMat);
    upper.receiveShadow = true;
    this.group.add(upper);
    // wall colliders (thick boxes outside)
    const T = 1.0;
    const wallObs = (minX: number, maxX: number, minZ: number, maxZ: number, name: string) =>
      this.obstacles.push({ minX, maxX, minZ, maxZ, h: WALL_H, kind: 'wall', name });
    wallObs(-HALF_W - T, -2.5, -HALF_D - T, -HALF_D, 'north');
    wallObs(2.5, HALF_W + T, -HALF_D - T, -HALF_D, 'north');
    wallObs(-HALF_W - T, -2.5, HALF_D, HALF_D + T, 'south');
    wallObs(2.5, HALF_W + T, HALF_D, HALF_D + T, 'south');
    wallObs(HALF_W, HALF_W + T, -HALF_D - T, -1.1, 'east');
    wallObs(HALF_W, HALF_W + T, 1.1, HALF_D + T, 'east');
    wallObs(-HALF_W - T, -HALF_W, -HALF_D - T, -1.1, 'west');
    wallObs(-HALF_W - T, -HALF_W, 1.1, HALF_D + T, 'west');

    // graffiti decals
    const gtex = [graffitiTexture(1), graffitiTexture(3)];
    const gmat = gtex.map((t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), gmat[0]);
    g1.position.set(-7.5, 2.0, -HALF_D + 0.02);
    this.group.add(g1);
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), gmat[1]);
    g2.position.set(HALF_W - 0.02, 1.9, 6.5);
    g2.rotation.y = -Math.PI / 2;
    this.group.add(g2);

    // ---------------------------------------------------------------- pillars
    const pTex = pillarTexture(14);
    const pillarMat = new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.85, color: 0xc0bcb6 });
    blood.patchMaterial(pillarMat);
    const pillarGeos: THREE.BufferGeometry[] = [];
    const ps = 0.7;
    const pillarPos: [number, number][] = [[-7, -5], [7, -5], [-7, 5], [7, 5]];
    for (const [px, pz] of pillarPos) {
      pillarGeos.push(...this.boxFaces(blood, px, pz, ps, ps, WALL_H, propDensity, [ps, WALL_H], false, 3.4));
      this.obstacles.push({ minX: px - ps / 2, maxX: px + ps / 2, minZ: pz - ps / 2, maxZ: pz + ps / 2, h: WALL_H, kind: 'pillar', name: 'pillar' });
      // steel cap / beam to ceiling
      const cap = new THREE.Mesh(new THREE.BoxGeometry(ps + 0.15, 0.3, ps + 0.15), new THREE.MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.6, roughness: 0.5 }));
      cap.position.set(px, WALL_H - 0.6, pz);
      this.group.add(cap);
    }
    const pillars = new THREE.Mesh(mergeGeos(pillarGeos), pillarMat);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    this.group.add(pillars);

    // ---------------------------------------------------------------- crates (static stacks)
    const cTex = crateTexture(15);
    const crateMat = new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.8, color: 0xd0c0a8 });
    blood.patchMaterial(crateMat);
    const crateGeos: THREE.BufferGeometry[] = [];
    const stacks: [number, number, number, number, number][] = [
      // x, z, w, d, h
      [-11.3, -9.3, 2.4, 2.4, 2.4],
      [-8.7, -10.0, 1.2, 1.2, 1.2],
      [11.2, 9.2, 2.4, 2.4, 1.2],
      [11.4, 7.4, 1.2, 1.2, 2.4],
      [-11.4, 8.8, 1.2, 2.4, 1.2],
      [11.3, -9.0, 2.4, 1.2, 1.2],
      [9.2, -10.2, 1.2, 1.2, 2.4],
    ];
    for (const [x, z, w, d, h] of stacks) {
      crateGeos.push(...this.boxFaces(blood, x, z, w, d, h, propDensity, [1.2, 1.2], true));
      this.obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, kind: 'crate', name: 'crates' });
    }
    const crates = new THREE.Mesh(mergeGeos(crateGeos), crateMat);
    crates.castShadow = true;
    crates.receiveShadow = true;
    this.group.add(crates);

    // ---------------------------------------------------------------- props (non-paintable decor)
    this.addDecor();

    // ---------------------------------------------------------------- ceiling & trusses
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H;
    this.group.add(ceil);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.6 });
    for (let x = -10; x <= 10; x += 5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, HALF_D * 2), trussMat);
      beam.position.set(x, WALL_H - 0.5, 0);
      this.group.add(beam);
    }
    for (let z = -8; z <= 8; z += 8) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.35, 0.2), trussMat);
      beam.position.set(0, WALL_H - 0.85, z);
      this.group.add(beam);
    }

    // ---------------------------------------------------------------- windows (moonlight)
    const winMat = new THREE.MeshBasicMaterial({ color: 0x6f8fb8 });
    const winFrame = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 });
    for (let x = -10; x <= 10; x += 4) {
      for (const zs of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), winMat);
        w.position.set(x, 5.6, zs * (HALF_D - 0.03));
        w.rotation.y = zs > 0 ? Math.PI : 0;
        this.group.add(w);
        for (const dx of [-0.6, 0, 0.6]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.05), winFrame);
          bar.position.set(x + dx, 5.6, zs * (HALF_D - 0.05));
          this.group.add(bar);
        }
      }
    }

    // ---------------------------------------------------------------- lights
    this.hemi = new THREE.HemisphereLight(0x7f8cab, 0x3a3028, 1.35);
    this.group.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xa4bce8, 1.9);
    this.moon.position.set(-9, 16, -12);
    this.moon.target.position.set(0, 0, 0);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const sc = this.moon.shadow.camera as THREE.OrthographicCamera;
    sc.left = -17; sc.right = 17; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 45;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.03;
    this.group.add(this.moon, this.moon.target);
    const glow = radialTexture(64, 'rgba(255,220,160,1)', 'rgba(255,200,120,0)');
    const lampPos: [number, number][] = [[-4.5, -3.5], [4.5, 3.5], [4.5, -3.5], [-4.5, 3.5], [0, 0]];
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2c3a30, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
    for (let i = 0; i < lampPos.length; i++) {
      const [lx, lz] = lampPos[i];
      const pivot = new THREE.Object3D();
      pivot.position.set(lx, WALL_H - 0.6, lz);
      this.group.add(pivot);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      cord.position.y = -0.8;
      pivot.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 16, 1, true), shadeMat);
      shade.position.y = -1.7;
      pivot.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a8 }));
      bulb.position.y = -1.85;
      pivot.add(bulb);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd8a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      spr.scale.set(1.4, 1.4, 1);
      spr.position.y = -1.85;
      pivot.add(spr);
      if (i < pointLights) {
        const light = new THREE.PointLight(0xffb470, i === 4 ? 45 : 70, 17, 1.7);
        light.position.y = -1.95;
        pivot.add(light);
        this.lamps.push({ light, bulb, base: light.intensity, flicker: i === 1 ? 1 : 0, phase: this.rng.next() * 10, pivot, swing: 0, swingV: 0 });
      } else {
        this.lamps.push({ light: new THREE.PointLight(0, 0), bulb, base: 0, flicker: 0, phase: 0, pivot, swing: 0, swingV: 0 });
      }
    }
    // floating dust
    const dustGeo = new THREE.BufferGeometry();
    const dp: number[] = [];
    for (let i = 0; i < 700; i++) dp.push((this.rng.next() - 0.5) * HALF_W * 2, this.rng.next() * 6.5, (this.rng.next() - 0.5) * HALF_D * 2);
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xb0b8c8, size: 0.025, transparent: true, opacity: 0.45, depthWrite: false, map: radialTexture(16), blending: THREE.AdditiveBlending }));
    this.group.add(this.dust);

    // ---------------------------------------------------------------- static floor paint & grime (persistent, into atlas)
    this.paintFloorDecals();
    this.mergeStatic();
  }

  /**
   * Merge static decor meshes that share a look into single draw calls (excluding swinging lamps,
   * paintable surfaces and transparent decals). Cuts ~120 draw calls (and shadow-pass calls) to ~15.
   */
  private mergeStatic() {
    this.group.updateMatrixWorld(true);
    const lampPivots = new Set(this.lamps.map((l) => l.pivot));
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean; meshes: THREE.Mesh[] }>();
    const isUnderLamp = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (lampPivots.has(p)) return true;
      return false;
    };
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      if (isUnderLamp(m)) return;
      const geo = m.geometry;
      if (geo.attributes.bloodUv || !geo.index || !geo.attributes.uv || !geo.attributes.normal) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (Array.isArray(m.material) || mat.transparent) return;
      const key = [mat.type, mat.color?.getHexString(), mat.roughness, mat.metalness, mat.map?.uuid ?? '', mat.side, (mat as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial ? 'b' : 's'].join('|');
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, geos: [], cast: false, recv: false, meshes: [] }));
      const g = geo.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      g.applyMatrix4(m.matrixWorld);
      b.geos.push(g);
      b.cast ||= m.castShadow;
      b.recv ||= m.receiveShadow;
      b.meshes.push(m);
    });
    for (const b of buckets.values()) {
      if (b.meshes.length < 2) continue;
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      for (const m of b.meshes) m.removeFromParent();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.recv;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'staticMerged';
      this.group.add(mesh);
    }
  }

  /** Box faces (4 sides + optional top) as paintable quads. */
  private boxFaces(blood: BloodAtlas, x: number, z: number, w: number, d: number, h: number, density: number, tile: [number, number], top: boolean, paintH = h) {
    const out: THREE.BufferGeometry[] = [];
    const y = 0;
    const up = new THREE.Vector3(0, 1, 0);
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    // faces: origin, u (horizontal along face), outward normal = u x up
    const sides: [THREE.Vector3, THREE.Vector3, number][] = [
      [new THREE.Vector3(x0, y, z1), new THREE.Vector3(1, 0, 0), w], // +Z face
      [new THREE.Vector3(x1, y, z0), new THREE.Vector3(-1, 0, 0), w], // -Z face
      [new THREE.Vector3(x1, y, z1), new THREE.Vector3(0, 0, -1), d], // +X face
      [new THREE.Vector3(x0, y, z0), new THREE.Vector3(0, 0, 1), d], // -X face
    ];
    for (const [o, u, len] of sides) {
      const ph = Math.min(paintH, h);
      out.push(paintQuad(this.blood, o, u, up, len, ph, tile, 'prop', density));
      if (ph < h) {
        // upper part: tiny atlas allocation (still valid attributes), uv continues above the painted part
        const o2 = o.clone().setY(ph);
        const g2 = paintQuad(this.blood, o2, u, up, len, h - ph, tile, 'prop', 2);
        const uvs = g2.attributes.uv.array as Float32Array;
        for (let i = 1; i < uvs.length; i += 2) uvs[i] += ph / tile[1];
        out.push(g2);
      }
    }
    if (top) out.push(paintQuad(this.blood, new THREE.Vector3(x0, h, z1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), w, d, tile, 'prop', density));
    // fix uv v for sides with texture tiling along height
    return out;
  }

  private addDecor() {
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2c2e30, metalness: 0.6, roughness: 0.5 });
    // forklift silhouette in corner
    const fork = new THREE.Group();
    const yellow = new THREE.MeshStandardMaterial({ color: 0xb08a18, roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 2.0), yellow);
    body.position.y = 0.75;
    fork.add(body);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.1), darkMetal);
    cage.position.set(0, 1.75, -0.3);
    fork.add(cage);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.15), darkMetal);
    mast.position.set(0, 1.2, 1.05);
    fork.add(mast);
    for (const s of [-1, 1]) {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 1.0), darkMetal);
      tine.position.set(s * 0.3, 0.1, 1.6);
      fork.add(tine);
      for (const zz of [-0.6, 0.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(s * 0.62, 0.28, zz);
        fork.add(wheel);
      }
    }
    fork.position.set(-10.6, 0, 3.2);
    fork.rotation.y = 0.4;
    fork.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(fork);
    this.obstacles.push({ minX: -11.6, maxX: -9.6, minZ: 1.9, maxZ: 4.6, h: 2.3, kind: 'prop', name: 'forklift' });
    // pallets along walls
    const palMat = new THREE.MeshStandardMaterial({ color: 0x6a5032, roughness: 0.9 });
    for (const [x, z, r] of [[-3.8, -10.3, 0], [6.0, 10.3, 0.1], [12.3, -2.6, Math.PI / 2], [-12.2, -4.5, Math.PI / 2]] as [number, number, number][]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.0), palMat);
      p.position.set(x, 0.075, z);
      p.rotation.y = r;
      p.receiveShadow = true;
      this.group.add(p);
    }
    // electrical panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x4a5258, metalness: 0.5, roughness: 0.5 }));
    panel.position.set(5.5, 1.6, -HALF_D + 0.14);
    this.group.add(panel);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    led.position.set(5.8, 2.0, -HALF_D + 0.28);
    this.group.add(led);
    // pipes along north wall
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a4044, metalness: 0.7, roughness: 0.4 });
    for (const y of [4.2, 4.5]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, HALF_W * 2, 10), pipeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, y, -HALF_D + 0.25);
      this.group.add(pipe);
    }
    // tires stack
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.13, 8, 16), tireMat);
      t.rotation.x = Math.PI / 2;
      t.position.set(12.1, 0.13 + i * 0.26, 3.6);
      t.castShadow = true;
      this.group.add(t);
    }
    this.obstacles.push({ minX: 11.6, maxX: 12.6, minZ: 3.1, maxZ: 4.1, h: 0.8, kind: 'prop', name: 'tires' });
  }

  /** Permanent painted lines, fight circle and grime into the atlas (paint/AO channels). */
  private paintFloorDecals() {
    const b = this.blood;
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    // painted fight circle (dashed ring) as overlapping smears along the ring
    for (let i = 0; i < 240; i++) {
      if (i % 16 > 11) continue;
      const a = (i / 240) * Math.PI * 2;
      p.set(Math.cos(a) * 5.0, 0.01, Math.sin(a) * 5.0);
      const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      b.splat(p, 0.075, SPLAT.paint, 0.38, up, t, 1.6, i * 0.37);
    }
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      p.set(Math.cos(a) * 0.8, 0.01, Math.sin(a) * 0.8);
      b.splat(p, 0.045, SPLAT.paint, 0.3, up, null, 0, i);
    }
    // lane lines near walls
    for (let x = -11; x <= 11; x += 0.12) {
      p.set(x, 0.01, -8.4);
      b.splat(p, 0.06, SPLAT.paint, 0.28, up, new THREE.Vector3(1, 0, 0), 1.2, x);
      p.set(x, 0.01, 8.4);
      b.splat(p, 0.06, SPLAT.paint, 0.28, up, new THREE.Vector3(1, 0, 0), 1.2, x + 3);
    }
    // grime & oil stains
    for (let i = 0; i < 70; i++) {
      p.set((this.rng.next() - 0.5) * HALF_W * 1.9, 0.01, (this.rng.next() - 0.5) * HALF_D * 1.9);
      b.splat(p, 0.4 + this.rng.next() * 1.4, SPLAT.ao, 0.12 + this.rng.next() * 0.2, up, null, 0, i);
    }
    // grime along wall bases
    for (let x = -HALF_W; x <= HALF_W; x += 0.8) {
      for (const z of [-HALF_D + 0.1, HALF_D - 0.1]) {
        p.set(x, 0.01, z);
        b.splat(p, 0.7, SPLAT.ao, 0.25, up, null, 0, x * z);
      }
    }
    for (let z = -HALF_D; z <= HALF_D; z += 0.8) {
      for (const x of [-HALF_W + 0.1, HALF_W - 0.1]) {
        p.set(x, 0.01, z);
        b.splat(p, 0.7, SPLAT.ao, 0.25, up, null, 0, x * z);
      }
    }
    // around pillars & crates (contact shadow)
    for (const o of this.obstacles) {
      if (o.kind === 'wall') continue;
      const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
      p.set(cx, 0.01, cz);
      b.splat(p, Math.max(o.maxX - o.minX, o.maxZ - o.minZ) * 0.85, SPLAT.ao, 0.35, up, null, 0, cx);
    }
  }

  /** Closest vertical surface (wall/pillar/crate) to a point within maxDist. */
  nearestSurface(x: number, z: number, maxDist: number, kinds: Obstacle['kind'][] = ['wall', 'pillar', 'crate']): SurfaceHit | null {
    let best: SurfaceHit | null = null;
    for (const o of this.obstacles) {
      if (!kinds.includes(o.kind)) continue;
      const cx = Math.max(o.minX, Math.min(x, o.maxX));
      const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d > maxDist || d < 1e-4) continue;
      if (!best || d < best.dist) {
        best = { point: new THREE.Vector3(cx, 0, cz), normal: new THREE.Vector3(dx / d, 0, dz / d), dist: d, obstacle: o };
      }
    }
    return best;
  }

  /** Resolve a circle (x,z,r) against obstacles; returns corrected position. */
  collide(x: number, z: number, r: number, ignoreWalls = false): [number, number, boolean] {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const o of this.obstacles) {
        if (ignoreWalls && o.kind === 'wall') continue;
        const cx = Math.max(o.minX, Math.min(x, o.maxX));
        const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 < 1e-8) {
            // inside: push out along smallest axis
            const pl = x - o.minX, pr = o.maxX - x, pb = z - o.minZ, pf = o.maxZ - z;
            const m = Math.min(pl, pr, pb, pf);
            if (m === pl) x = o.minX - r;
            else if (m === pr) x = o.maxX + r;
            else if (m === pb) z = o.minZ - r;
            else z = o.maxZ + r;
          } else {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          }
        }
      }
    }
    return [x, z, hit];
  }

  inside(x: number, z: number, margin = 0) {
    return Math.abs(x) < HALF_W - margin && Math.abs(z) < HALF_D - margin;
  }

  update(dt: number) {
    this.time += dt;
    for (const l of this.lamps) {
      if (l.base > 0) {
        let k = 1;
        if (l.flicker) {
          const t = this.time + l.phase;
          const f = Math.sin(t * 13.0) * Math.sin(t * 7.3) * Math.sin(t * 2.1);
          k = f > 0.55 ? 0.15 : 0.92 + Math.sin(t * 40) * 0.05;
        }
        l.light.intensity = l.base * k;
        (l.bulb.material as THREE.MeshBasicMaterial).color.setScalar(0.4 + 0.6 * k).multiply(new THREE.Color(1, 0.88, 0.66));
      }
      // swing spring
      l.swingV += -l.swing * 6 * dt - l.swingV * 0.4 * dt;
      l.swing += l.swingV * dt;
      l.pivot.rotation.z = l.swing;
      l.pivot.rotation.x = l.swing * 0.6;
    }
    // drifting dust
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(this.time * 0.3 + i) * 0.002;
      arr[i + 1] -= 0.0015;
      if (arr[i + 1] < 0) arr[i + 1] = 6.5;
    }
    pos.needsUpdate = true;
  }

  /** Kick nearby lamps (big impacts). */
  shakeLamps(x: number, z: number, strength: number) {
    for (const l of this.lamps) {
      const d = Math.hypot(l.pivot.position.x - x, l.pivot.position.z - z);
      if (d < 7) l.swingV += (Math.random() - 0.5) * strength * (1 - d / 7) * 0.6;
    }
  }
}
