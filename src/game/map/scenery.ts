// Trees, rocks, lamp posts, buildings and signage. Everything solid also gets
// a static collider so it can be crashed into.

import * as THREE from 'three';
import type { World } from '../../sim/world.ts';
import type { Heightfield } from '../../sim/terrain.ts';
import { Collider } from '../../sim/colliders.ts';
import { Surface } from '../../sim/surfaces.ts';
import { Rng } from '../../sim/math.ts';
import { PADS, ZONES, CLIFF } from './layout.ts';
import type { RoadPath } from './terrainGen.ts';
import { MAT, texBox, signBoard } from '../obstacles/assets.ts';
import { treeBarkTexture, foliageTexture, windowGridTexture, corrugatedTexture } from '../../render/textures.ts';

/** Paved surfaces (roads, pads) within `margin` meters, using the surface map. */
function nearRoad(hf: Heightfield, x: number, z: number, margin: number): boolean {
  const paved = (s: number) => s === Surface.ASPHALT || s === Surface.CONCRETE || s === Surface.GRAVEL;
  if (paved(hf.surfaceAt(x, z))) return true;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    if (paved(hf.surfaceAt(x + Math.cos(ang) * margin, z + Math.sin(ang) * margin))) return true;
  }
  return false;
}

function onPad(x: number, z: number, margin: number): boolean {
  for (const p of PADS) {
    if (Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin) return true;
  }
  return false;
}

export function buildScenery(world: World, hf: Heightfield, roads: RoadPath[], quality: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(4242);
  // ---------------------------------------------------------------- trees
  const pineTrunk = new THREE.CylinderGeometry(0.18, 0.3, 4, 7);
  pineTrunk.translate(0, 2, 0);
  const pineCone = new THREE.ConeGeometry(2.2, 5.5, 9);
  pineCone.translate(0, 6.5, 0);
  const pineCone2 = new THREE.ConeGeometry(1.6, 4.2, 9);
  pineCone2.translate(0, 9, 0);
  const leafTrunk = new THREE.CylinderGeometry(0.22, 0.35, 4.5, 7);
  leafTrunk.translate(0, 2.25, 0);
  const leafBlob = new THREE.IcosahedronGeometry(2.8, 1);
  leafBlob.translate(0, 6.2, 0);
  const pos = leafBlob.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const f = 1 + (Math.sin(pos.getX(i) * 3.1) * Math.cos(pos.getZ(i) * 2.7)) * 0.12;
    pos.setXYZ(i, pos.getX(i) * f, (pos.getY(i) - 6.2) * 0.85 * f + 6.2, pos.getZ(i) * f);
  }
  leafBlob.computeVertexNormals();
  const barkMat = new THREE.MeshStandardMaterial({ map: treeBarkTexture(), roughness: 0.95 });
  const pineMat = new THREE.MeshStandardMaterial({ map: foliageTexture(), color: 0x6f8f5c, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ map: foliageTexture(), color: 0x9fb86a, roughness: 0.85 });
  const maxTrees = Math.round(2600 * quality);
  const pines: THREE.Matrix4[] = [], leafs: THREE.Matrix4[] = [];
  let tries = 0;
  while (pines.length + leafs.length < maxTrees && tries < maxTrees * 30) {
    tries++;
    const x = rng.range(-760, 760), z = rng.range(-760, 760);
    const r = Math.hypot(x, z);
    if (r < 120) continue;
    if (onPad(x, z, 14)) continue;
    const h = hf.heightAt(x, z);
    if (h > 135) continue;
    const s = hf.surfaceAt(x, z);
    if (s === Surface.ROCK || s === Surface.ASPHALT || s === Surface.CONCRETE || s === Surface.MUD) continue;
    const hx = hf.heightAt(x + 2, z), hz = hf.heightAt(x, z + 2);
    if (Math.hypot(hx - h, hz - h) / 2 > 0.7) continue;
    if (Math.hypot(x - CLIFF.x, z - CLIFF.z) < CLIFF.radius + 12) continue;
    // cluster trees: favour noise-dense areas
    const dens = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 0.5 + 0.5;
    if (rng.next() > dens * 0.9 + (h > 20 ? 0.4 : 0.05)) continue;
    if (nearRoad(hf, x, z, 7)) continue;
    const sc = rng.range(0.75, 1.35);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)), new THREE.Vector3(sc, sc * rng.range(0.85, 1.2), sc));
    const pine = h > 15 || rng.next() < 0.45;
    (pine ? pines : leafs).push(m);
    if (r < 640) {
      const c = Collider.capsule(0.3 * sc, 2.2 * sc);
      c.setPosition(x, h + 2.2 * sc, z);
      c.surface = Surface.WOOD;
      c.tag = 'wood';
      world.addStatic(c);
    }
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], shadow = true) => {
    const im = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  };
  inst(pineTrunk, barkMat, pines);
  inst(pineCone, pineMat, pines);
  inst(pineCone2, pineMat, pines);
  inst(leafTrunk, barkMat, leafs);
  inst(leafBlob, leafMat, leafs);

  // ---------------------------------------------------------------- rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rp = rockGeo.getAttribute('position');
  for (let i = 0; i < rp.count; i++) {
    const n = 1 + Math.sin(rp.getX(i) * 4.1 + rp.getZ(i) * 2.3) * 0.18 + Math.cos(rp.getY(i) * 5.3) * 0.1;
    rp.setXYZ(i, rp.getX(i) * n, rp.getY(i) * n * 0.75, rp.getZ(i) * n);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.95, flatShading: true });
  const rocks: THREE.Matrix4[] = [];
  for (let i = 0; i < 700 * quality; i++) {
    const x = rng.range(-780, 780), z = rng.range(-780, 780);
    if (onPad(x, z, 10) || nearRoad(hf, x, z, 6)) continue;
    const h = hf.heightAt(x, z);
    const hillZone = x > 270 && x < 495 && z > 310 && z < 510;
    if (h < 8 && !hillZone && rng.next() < 0.85) continue;
    const s = rng.range(0.4, h > 30 ? 4 : 1.6);
    rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - s * 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3))), new THREE.Vector3(s, s, s)));
    if (Math.hypot(x, z) < 640 && s > 0.6) {
      const c = Collider.sphere(s * 0.85);
      c.setPosition(x, h - s * 0.3, z);
      c.surface = Surface.ROCK;
      c.tag = 'rock';
      world.addStatic(c);
    }
  }
  inst(rockGeo, rockMat, rocks);

  // ---------------------------------------------------------------- lamp posts along roads
  const lamps: THREE.Matrix4[] = [];
  const ring = roads.find((r) => r.def.name === 'ring');
  if (ring) {
    for (let i = 0; i < ring.samples.length; i += 22) {
      const s = ring.samples[i];
      for (const side of [-1, 1]) {
        const off = (ring.def.width / 2 + 2.2) * side;
        const x = s.x - s.tz * off, z = s.z + s.tx * off;
        if (onPad(x, z, 2)) continue;
        const h = hf.heightAt(x, z);
        const yaw = Math.atan2(-s.tz * side, s.tx * side);
        lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2), new THREE.Vector3(1, 1, 1)));
        const c = Collider.capsule(0.12, 4);
        c.setPosition(x, h + 4, z);
        c.surface = Surface.METAL;
        c.tag = 'metal';
        world.addStatic(c);
      }
    }
  }
  const pole = new THREE.CylinderGeometry(0.1, 0.14, 8, 8);
  pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 1.8);
  arm.translate(0, 7.9, 0.9);
  const head = new THREE.BoxGeometry(0.35, 0.12, 0.6);
  head.translate(0, 7.8, 1.7);
  inst(pole, MAT.darkSteel(), lamps);
  inst(arm, MAT.darkSteel(), lamps, false);
  inst(head, MAT.glow(0xfff1c8), lamps, false);

  // ---------------------------------------------------------------- buildings
  const addBuilding = (x: number, z: number, w: number, h: number, d: number, yaw: number, mat: THREE.Material, roof = true) => {
    const y = hf.heightAt(x, z);
    const m = new THREE.Mesh(texBox(w, h, d, 3), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = yaw;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    if (roof) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), MAT.darkSteel());
      r.position.set(x, y + h + 0.2, z);
      r.rotation.y = yaw;
      r.castShadow = true;
      g.add(r);
    }
    const c = Collider.box(w / 2, h / 2, d / 2);
    c.setPosition(x, y + h / 2, z).setYaw(yaw);
    c.surface = Surface.CONCRETE;
    c.tag = 'concrete';
    world.addStatic(c);
  };
  const wallMat = new THREE.MeshStandardMaterial({ map: windowGridTexture(), roughness: 0.7 });
  const shedMat = new THREE.MeshStandardMaterial({ map: corrugatedTexture('#9aa3ab'), roughness: 0.55, metalness: 0.4 });
  const shed2 = new THREE.MeshStandardMaterial({ map: corrugatedTexture('#b8a27a'), roughness: 0.6, metalness: 0.3 });
  // hub: garage hangar (west), control tower, workshop
  addBuilding(-62, 0, 14, 9, 36, 0, shedMat);
  addBuilding(62, -55, 10, 18, 10, 0, wallMat);
  addBuilding(62, 55, 16, 7, 12, 0, shed2);
  // crash center: control building and grandstand
  addBuilding(40, -540, 10, 6, 24, 0, wallMat);
  for (let row = 0; row < 6; row++) {
    const x = -38 + row * 1.2;
    const y0 = hf.heightAt(x, -530);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5 + row * 0.5, 40), MAT.concreteDark());
    step.position.set(-30 - row * 1.2, y0 + (0.5 + row * 0.5) / 2, -530);
    step.castShadow = step.receiveShadow = true;
    g.add(step);
  }
  {
    const c = Collider.box(4, 1.6, 20);
    c.setPosition(-33, 1.6, -530);
    world.addStatic(c);
  }
  // industrial warehouses
  addBuilding(480, 40, 20, 12, 40, 0, shedMat);
  addBuilding(300, 165, 30, 10, 16, 0, shed2);
  addBuilding(470, -5, 16, 9, 14, 0, shedMat);
  // drop zone control hut
  addBuilding(-395, 140, 8, 5, 8, 0, wallMat);

  // ---------------------------------------------------------------- zone signs
  for (const z of ZONES) {
    if (z.id === 'hub') continue;
    const sb = signBoard(z.name.toUpperCase(), z.description.length > 46 ? z.description.slice(0, 44) + '…' : z.description, 8, 3.2, 2.5, z.color);
    const [sx, sz, yaw] = z.spawn;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const px = sx + fx * 10 - fz * 8, pz = sz + fz * 10 + fx * 8;
    sb.position.set(px, hf.heightAt(px, pz), pz);
    sb.rotation.y = yaw;
    sb.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    g.add(sb);
  }
  return g;
}
