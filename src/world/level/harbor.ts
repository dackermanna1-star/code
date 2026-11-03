import * as THREE from 'three';
import { Arena, HALF_D, HALF_W } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { chainFence, container, crateStack, lampPost, pallet, put, signBoard, wallLamp, barrier, cone } from './blocks';
import { parkedCar, Windows } from './street';
import { canvas, tex, normalFromHeight, makeNoise } from '../mapKit';
import { RNG } from '../../core/math';
import { skyTexture, buildCity } from '../city';

/**
 * DOCK 4: chapter one's level. The KX warehouse (the warehouse map, as it was) stands on the quay;
 * round it the harbour at one in the morning - a freighter moored along the quay under two cranes,
 * black water, the loading apron and the Butcher's truck at the north door; south of the hall the
 * container yard in its rows under flood towers, men walking the lanes; the perimeter fence, its
 * gate and its booth, and the street outside where she comes in.
 *
 * x east, z south. The hall: x -13..13, z -11..11 (doors: north z -11, south z 11, east x 13, west
 * x -13). The quay's edge: z -26 (water beyond). The yard: x -58..40, z 14..60. The fence: x -60.
 */
export const HARBOR = {
  start: { x: -70, z: 57, yaw: Math.PI / 2 },
  westDoor: { x: -14.8, z: 0.1 },
  fenceCut: { x: -60, z: 38 },
  dumpster: { x: -61.8, z: 38 },
  booth: { x: -55.5, z: 51 },
  truck: { x: 0.4, z: -19.5 },
};
/** The yard's rows of containers: z of each row, and its stacks (x of each, how high). */
export const ROWS: { z: number; stacks: [number, number][] }[] = [
  { z: 18, stacks: [[-50, 2], [-43.9, 1], [-37.8, 3], [-25, 1], [-18.9, 2], [-6, 1], [6, 2], [12.1, 1], [25, 2], [31.1, 1]] },
  { z: 26.5, stacks: [[-52, 1], [-45.9, 2], [-33, 1], [-26.9, 1], [-14, 2], [-7.9, 3], [5, 1], [18, 2], [24.1, 2], [34, 1]] },
  { z: 35, stacks: [[-48, 2], [-35, 1], [-28.9, 2], [-16, 1], [-9.9, 1], [3, 2], [9.1, 1], [22, 1], [28.1, 3]] },
  { z: 43.5, stacks: [[-53, 1], [-46.9, 1], [-34, 2], [-21, 1], [-14.9, 2], [-2, 1], [11, 2], [17.1, 1], [30, 1]] },
  { z: 52, stacks: [[-44, 2], [-37.9, 1], [-25, 1], [-12, 2], [-5.9, 1], [7, 1], [20, 2], [26.1, 1]] },
];
const COLORS = ['red', 'blue', 'green', 'orange', 'grey', 'white'] as const;

export function buildHarbor(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  // ---- the hall, as the warehouse map builds it
  a.buildWarehouse(blood, Math.max(1, pointLights - 1), shadowMapSize);
  // (outside the hall now is the harbour: its doors open onto it, not onto black)
  a.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && !Array.isArray(mat) && mat.side === THREE.BackSide && mat.color?.getHex() === 0x050506) m.visible = false;
    if (m.geometry.type === 'PlaneGeometry' && Math.abs(m.position.y + 0.01) < 1e-3 && (m.geometry as THREE.PlaneGeometry).parameters.width === 80) m.visible = false;
  });
  // (one moon and one sky for the whole harbour: the hall's own come out)
  a.moon.removeFromParent();
  a.moon.target.removeFromParent();
  a.hemi.removeFromParent();
  const k = new LevelKit(a, blood, Math.max(2, pointLights - 1), shadowMapSize, { bounds: { minX: -78, maxX: 48, minZ: -50, maxZ: 66 }, density: 0.7 });
  k.ambientLight = 0.16;
  const M = new Materials(blood, true);
  const rng = new RNG(4141);
  const W = new Windows(97);
  a.fog = { color: 0x0b0e14, density: 0.018 };
  a.background = skyTexture(17);
  a.camBounds = { out: 0, maxY: 30, walls: true };
  a.farPlane = 300;
  a.wet = true;

  // ---------------------------------------------------------------------- the hall from outside
  {
    const sid = M.siding(0x6a7276);
    const T0 = 0.02, T1 = 1.0, H = 8.6;
    // walls: north and south with the big doors (x -2.5..2.5, 4.2 high), east and west the small ones
    k.solid([-HALF_W - T1, -2.5, 0, H, -HALF_D - T1, -HALF_D - T0], sid, { kind: false, tile: 2.5 });
    k.solid([2.5, HALF_W + T1, 0, H, -HALF_D - T1, -HALF_D - T0], sid, { kind: false, tile: 2.5 });
    k.solid([-2.5, 2.5, 4.2, H, -HALF_D - T1, -HALF_D - T0], sid, { kind: false, tile: 2.5 });
    k.solid([-HALF_W - T1, -2.5, 0, H, HALF_D + T0, HALF_D + T1], sid, { kind: false, tile: 2.5 });
    k.solid([2.5, HALF_W + T1, 0, H, HALF_D + T0, HALF_D + T1], sid, { kind: false, tile: 2.5 });
    k.solid([-2.5, 2.5, 4.2, H, HALF_D + T0, HALF_D + T1], sid, { kind: false, tile: 2.5 });
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -HALF_W - T1 : HALF_W + T0, x1 = sx < 0 ? -HALF_W - T0 : HALF_W + T1;
      k.solid([x0, x1, 0, H, -HALF_D - T0, -1.1], sid, { kind: false, tile: 2.5 });
      k.solid([x0, x1, 0, H, 1.1, HALF_D + T0], sid, { kind: false, tile: 2.5 });
      k.solid([x0, x1, 2.8, H, -1.1, 1.1], sid, { kind: false, tile: 2.5 });
    }
    // the roof, and its painted name
    k.solid([-HALF_W - 1.3, HALF_W + 1.3, H, H + 0.3, -HALF_D - 1.3, HALF_D + 1.3], M.iron(), { kind: false });
    const sign = signBoard(k, 'DOCK 4 · KX FREIGHT', -HALF_W - 1.03, 6.6, 6.5, -Math.PI / 2, 7.5, 1.1, { bg: '#a8a296', fg: '#1a1a1a' });
    void sign;
    signBoard(k, 'DOCK 4', 0, 6.4, -HALF_D - 1.03, Math.PI, 4.5, 1.4, { bg: '#a8a296', fg: '#1a1a1a' });
    wallLamp(k, M, -HALF_W - 1.0, 3.4, 0, -Math.PI / 2, { intensity: 20, color: 0xffc080 });
    wallLamp(k, M, 0, 5.0, -HALF_D - 1.0, Math.PI, { intensity: 34, color: 0xffd090, reach: 12 });
    wallLamp(k, M, 0, 5.0, HALF_D + 1.0, 0, { intensity: 22, color: 0xffd090 });
  }

  // ---------------------------------------------------------------------- the ground
  // (the yard: plain concrete; where its lanes are walked, a strip that takes blood)
  k.floor(-78, 48, -26, 66, M.concrete(0x9a968e), { tile: 4, paint: false, y: -0.002 });
  for (const [x0, x1, z0, z1] of [[-58, 40, 21.6, 23.4], [-58, 40, 38.6, 40.4], [-58, -14, -10, 10]] as [number, number, number, number][]) k.floor(x0, x1, z0, z1, M.concreteFloor(), { tile: 4 });
  // the road outside the fence, and the yard's painted lines
  k.floor(-78, -61, -26, 66, M.asphalt(), { tile: 4, paint: false, y: 0.001 });
  for (let z = -20; z < 64; z += 5) put(k, new THREE.BoxGeometry(0.14, 0.01, 2.6), M.glow(0xb89a40, 0.55), -69.5, 0.006, z, 0, false);
  for (const row of ROWS) for (const dz of [-1.9, 1.9]) put(k, new THREE.BoxGeometry(98, 0.01, 0.1), M.glow(0xb8a040, 0.4), -9, 0.004, row.z + dz, 0, false);

  // ---------------------------------------------------------------------- the quay, the water, the ship
  {
    // the edge: a steel-capped kerb, bollards, and past it the drop to the water
    k.solid([-48, 48, 0, 0.25, -26.4, -26], M.steel(), { kind: 'wall', name: 'quay edge', walk: true });
    for (let x = -42; x <= 42; x += 8) {
      put(k, new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), M.paint(0x1a1a1c, 0.6, 0.4), x, 0.3, -25.2, 0, true);
      k.block([x - 0.26, x + 0.26, 0, 0.6, -25.46, -24.94], 'prop', 'bollard');
    }
    a.pits.push({ minX: -50, maxX: 50, minZ: -52, maxZ: -26.4 });
    // black water, the lights in it
    const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 70), waterMaterial());
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -2.1, -61);
    k.g.add(water);
    k.updates.push((dt) => {
      const m = water.material as THREE.MeshStandardMaterial;
      if (m.normalMap) {
        m.normalMap.offset.x += dt * 0.006;
        m.normalMap.offset.y += dt * 0.011;
      }
    });
    // the quay wall down into it
    k.solid([-50, 50, -2.6, 0, -26.6, -26.4], M.concrete(0x4a4844), { kind: false });
    // the freighter alongside: a black hull, rust streaks, a lit bridge aft
    const hull = M.paint(0x161a1e, 0.65, 0.35);
    k.solid([-46, 44, -2.6, 5.2, -45, -30], hull, { kind: false });
    k.solid([-46, 44, 5.2, 5.5, -45, -30], M.rust(), { kind: false });
    k.solid([28, 42, 5.5, 18, -43, -32], M.paint(0xd8d4c8, 0.6, 0.1), { kind: false });
    W.face(k, M, 28, -31.98, 42, -31.98, 8.0, 3, rng, { pitch: 2.4, floorH: 3.0, w: 1.4, h: 1.0, sills: false });
    for (let i = 0; i < 6; i++) container(k, M, -38 + i * 10.5, -37.5, 0, COLORS[(i * 2 + 1) % 6], 5.5);
    for (let i = 0; i < 4; i++) container(k, M, -33 + i * 12, -37.5, 0, COLORS[(i * 3) % 6], 8.09);
    signBoard(k, 'MERIDIAN STAR · MONROVIA', -20, 3.2, -29.98, 0, 8, 0.9, { bg: '#161a1e', fg: '#d8d4c8' });
    k.spot([35, 17, -31], 0xfff0d0, 30, 22);
    // two quay cranes over her, their booms out over the ship
    for (const cx of [-24, 22]) crane(k, M, cx);
  }

  // ---------------------------------------------------------------------- the apron: the Butcher's truck
  {
    const T = HARBOR.truck;
    reefer(k, M, T.x, T.z);
    for (const [x, z] of [[-8, -16], [9, -18], [-14, -20]] as [number, number][]) pallet(k, M, x, z, rng.next() * 3);
    crateStack(k, M, -9.5, -15.5, 2, 1.2);
    crateStack(k, M, 10.5, -15, 1, 1.2);
    for (const [x, z] of [[-6, -22], [6.5, -21.5]] as [number, number][]) barrier(k, M, x, z, 0, 3);
    lightTower(k, M, -16, -22);
    lightTower(k, M, 18, -16);
  }

  // ---------------------------------------------------------------------- the yard: rows of containers
  for (const [ri, row] of ROWS.entries()) {
    for (const [si, [x, n]] of row.stacks.entries()) {
      for (let lv = 0; lv < n; lv++) container(k, M, x, row.z, 0, COLORS[(ri * 7 + si * 3 + lv * 5) % 6], lv * 2.59);
    }
  }
  // flood towers over the lanes (the bright places), and the dark between them
  for (const [x, z] of [[-40, 22.5], [-4, 31], [26, 39.5], [-30, 48], [10, 56]] as [number, number][]) lightTower(k, M, x, z);
  // forklifts and drums in the lanes
  forklift(k, M, -30, 30.6, 0.3);
  forklift(k, M, 14, 47.8, 2.6);
  for (const [x, z] of [[-41, 31], [-40.4, 31.6], [2, 39.8], [2.6, 40.4], [-18, 47.6]] as [number, number][]) drum(k, M, x, z);
  for (const [x, z] of [[-22, 22], [-21.4, 22.4], [8, 31], [20, 47.8]] as [number, number][]) cone(k, M, x, z);
  // the road to the hall's west door, the yard office beside it
  k.solid([-40, -30, 0, 3.2, -9, -3], M.block('#9a8e7a'), { kind: 'wall', name: 'yard office', walk: true });
  W.face(k, M, -40, -2.98, -30, -2.98, 1.7, 1, rng, { pitch: 2.6, h: 1.2 });
  wallLamp(k, M, -35, 2.8, -2.95, 0, { intensity: 18 });
  parkedCar(k, -26, 6.5, 0, 0x1a1a1e);
  parkedCar(k, -33.5, 6.5, 0, 0x3a3a40);

  // ---------------------------------------------------------------------- the fence, the gate, the booth
  {
    const F = -60;
    // (razor wire along its top: not to be climbed - but here, where a container's crushed it, it's
    // sagging low, and a dumpster stands against it outside)
    chainFence(k, M, F, -26, F, 35.6, 2.7);
    chainFence(k, M, F, 35.6, F, 40.4, 2.15);
    chainFence(k, M, F, 40.4, F, 53.5, 2.7);
    chainFence(k, M, F, 60.5, F, 66, 2.7);
    for (const o of a.obstacles) if (o.name === 'fence' && Math.abs(o.minX - F) < 0.2 && o.h > 2.5) o.climb = false;
    razorWire(k, M, F, -26, 35.6);
    razorWire(k, M, F, 40.4, 53.5);
    razorWire(k, M, F, 60.5, 66);
    // the gate: shut, chained (a sliding panel)
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.6), M.chainLink());
    const uv = gate.geometry.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] *= 14;
      uv[i + 1] *= 5.2;
    }
    gate.position.set(F, 1.3, 57);
    gate.rotation.y = Math.PI / 2;
    k.g.add(gate);
    const g = k.block([F - 0.06, F + 0.06, 0, 2.6, 53.5, 60.5], 'wall', 'gate');
    if (g) {
      g.climb = false;
      g.seeThrough = true;
    }
    signBoard(k, 'KX FREIGHT · DOCK 4 · AUTHORISED VEHICLES ONLY', F - 0.08, 2.1, 52.2, -Math.PI / 2, 3.4, 0.45, { bg: '#d8d0c0', fg: '#8a1a1a' });
    // the dumpster outside the crushed bit (she's up it, and over)
    k.solid([HARBOR.dumpster.x - 0.62, HARBOR.dumpster.x + 0.6, 0, 1.25, HARBOR.dumpster.z - 1.0, HARBOR.dumpster.z + 1.0], M.paint(0x2a4a3a, 0.55, 0.35), { kind: 'crate', name: 'dumpster', walk: true });
    // the crushing container inside, half over the fence's line
    container(k, M, -55.5, 38.2, Math.PI / 2, 'grey');
    // the booth by the gate (two men in it, a radio, a kettle)
    k.solid([-58, -53, 0, 2.7, 48.5, 52.5], M.block('#c8c0a8'), { kind: 'wall', name: 'booth', walk: true });
    W.face(k, M, -58, 52.52, -53, 52.52, 1.6, 1, rng, { pitch: 2.2, h: 1.0 });
    W.face(k, M, -58.02, 48.5, -58.02, 52.5, 1.6, 1, rng, { pitch: 2.2, h: 1.0 });
    wallLamp(k, M, -55.5, 2.4, 52.55, 0, { intensity: 22, color: 0xfff0d0 });
    lightTower(k, M, -56, 58);
    barrier(k, M, -57.5, 57, Math.PI / 2, 4);
  }
  // the street outside: lamps, a wall, a car
  for (let z = -18; z < 66; z += 18) lampPost(k, M, -63, z, { ry: -Math.PI / 2, intensity: 50 });
  parkedCar(k, -66.5, 44, Math.PI / 2, 0x2a2a30);
  k.solid([-78, -76, 0, 4, -26, 66], M.block('#5a5a54'), { kind: 'wall' });
  // the city across the water and behind the sheds
  buildCity(k.g, rng, [{ n: 30, r0: 120, r1: 170, top0: 20, top1: 60 }], { bottom: -2, tint: 0x8a8aa0 });
  W.finish(k);
  const hemi = new THREE.HemisphereLight(0x6a7a9a, 0x3a3028, 2.6);
  k.g.add(hemi);
  k.keyLight(0xa8bce8, 2.3, new THREE.Vector3(-0.35, 1, 0.45), 26);
  const parts = k.finish({ hemi, probe: new THREE.Vector3(-20, 3, 20) });
  // (the hall's own moon and lamps stay as they were inside it)
  return { ...parts, dust: a.dust, dressing: a.dressing };
}

// ============================================================================ the harbour's pieces
function waterMaterial() {
  const S = 256;
  const n = makeNoise(9, 16);
  const [c, x] = canvas(S, S);
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const v = n((i / S) * 16, (j / S) * 16) * 0.6 + n((i / S) * 48, (j / S) * 48) * 0.4;
      const o = (j * S + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v * 255;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const normal = normalFromHeight(c, 1.4);
  normal.repeat.set(24, 8);
  void tex;
  return new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.08, metalness: 0.3, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.6 });
}

/** A ship-to-shore crane: two A-frames of steel on the quay, its boom out over the water. */
function crane(k: LevelKit, M: Materials, cx: number) {
  const steel = M.paint(0xb85a1a, 0.55, 0.5);
  const legs: [number, number][] = [[cx - 7, -24.2], [cx + 7, -24.2], [cx - 7, -14.5], [cx + 7, -14.5]];
  for (const [x, z] of legs) {
    k.solid([x - 0.6, x + 0.6, 0, 26, z - 0.6, z + 0.6], steel, { kind: 'pillar', name: 'crane leg' });
  }
  k.solid([cx - 7.6, cx + 7.6, 24, 26, -25, -13.7], steel, { kind: false });
  k.solid([cx - 1.4, cx + 1.4, 26, 27.6, -60, -10], steel, { kind: false });
  k.solid([cx - 2.2, cx + 2.2, 22, 24, -20, -16.5], M.paint(0xd8d0c0, 0.6, 0.2), { kind: false });
  for (const z of [-24.2, -14.5]) k.solid([cx - 7, cx + 7, 1.2, 1.8, z - 0.4, z + 0.4], steel, { kind: false });
  put(k, new THREE.BoxGeometry(2.4, 0.4, 2.4), M.paint(0x2a2a2a, 0.6, 0.5), cx, 18, -38, 0, false);
  k.spot([cx, 23, -20], 0xfff0d8, 30, 26);
  put(k, new THREE.SphereGeometry(0.25, 8, 6), M.glow(0xff3020, 2.5), cx, 27.9, -59, 0, false);
}

/** A flood-light tower: a lattice mast, a cluster of lamps on top glaring down. */
function lightTower(k: LevelKit, M: Materials, x: number, z: number) {
  const h = 14;
  put(k, new THREE.CylinderGeometry(0.16, 0.24, h, 6), M.steel(), x, h / 2, z, 0, true);
  put(k, new THREE.BoxGeometry(1.8, 0.5, 0.6), M.iron(), x, h, z, 0, true);
  for (const dx of [-0.6, 0, 0.6]) put(k, new THREE.BoxGeometry(0.42, 0.32, 0.12), M.glow(0xfff2d8, 2.4), x + dx, h - 0.1, z + 0.32, 0, false);
  k.block([x - 0.3, x + 0.3, 0, h, z - 0.3, z + 0.3], 'pillar', 'light tower');
  k.spot([x, h - 1, z + 2], 0xfff0d8, 95, 30, { decay: 1.4 });
}

/** A refrigerated truck at the loading door (the KX's: six heads in the back). */
function reefer(k: LevelKit, M: Materials, x: number, z: number) {
  const [c, cx] = canvas(512, 160);
  cx.fillStyle = '#d8d8d4';
  cx.fillRect(0, 0, 512, 160);
  cx.fillStyle = '#2a4a6a';
  cx.font = '700 64px "Oswald", sans-serif';
  cx.fillText('NORDFROST', 40, 90);
  cx.font = '400 26px "Oswald", sans-serif';
  cx.fillText('FRESH · FROZEN · FAST', 44, 128);
  const side = new THREE.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.5, metalness: 0.2 });
  const plain = M.paint(0xd8d8d4, 0.5, 0.2);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.8, 7.2), [side, side, plain, plain, plain, plain]);
  box.position.set(x, 2.15, z - 1.2);
  box.castShadow = box.receiveShadow = true;
  k.g.add(box);
  put(k, new THREE.BoxGeometry(2.4, 2.2, 2.2), M.paint(0x2a3a5a, 0.4, 0.5), x, 1.6, z - 6.0, 0, true);
  put(k, new THREE.BoxGeometry(2.3, 0.7, 0.05), M.glass(), x, 2.1, z - 7.12, 0, false);
  for (const [dx, dz] of [[-1.1, -5.6], [1.1, -5.6], [-1.1, 0.2], [1.1, 0.2], [-1.1, 1.4], [1.1, 1.4]] as [number, number][]) {
    const w = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14);
    w.rotateZ(Math.PI / 2);
    put(k, w, M.paint(0x111111, 0.85, 0), x + dx, 0.5, z + dz, 0, true);
  }
  k.block([x - 1.3, x + 1.3, 0, 3.6, z - 7.2, z + 2.4], 'crate', 'truck', true);
}

function forklift(k: LevelKit, M: Materials, x: number, z: number, ry: number) {
  const y = M.paint(0xc8981a, 0.55, 0.3);
  put(k, new THREE.BoxGeometry(1.2, 1.0, 2.0), y, x, 0.75, z, ry, true);
  put(k, new THREE.BoxGeometry(1.1, 1.0, 1.1), M.iron(), x, 1.75, z - 0.3 * Math.cos(ry), ry, true);
  put(k, new THREE.BoxGeometry(0.9, 2.4, 0.15), M.iron(), x + Math.sin(ry) * 1.05, 1.2, z + Math.cos(ry) * 1.05, ry, true);
  const along = Math.abs(Math.cos(ry)) > 0.5;
  k.block([x - (along ? 0.7 : 1.4), x + (along ? 0.7 : 1.4), 0, 2.3, z - (along ? 1.4 : 0.7), z + (along ? 1.4 : 0.7)], 'prop', 'forklift');
}
function drum(k: LevelKit, M: Materials, x: number, z: number) {
  put(k, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), M.paint(0x2a4a7a, 0.5, 0.5), x, 0.45, z, 0, true);
  k.block([x - 0.3, x + 0.3, 0, 0.9, z - 0.3, z + 0.3], 'prop', 'drum', true);
}
/** Coils of razor wire along a fence's top (x fixed, z0..z1). */
function razorWire(k: LevelKit, M: Materials, x: number, z0: number, z1: number) {
  const geo = new THREE.TorusGeometry(0.2, 0.01, 3, 18);
  geo.rotateY(Math.PI / 2);
  for (let z = z0; z <= z1; z += 0.28) put(k, geo, M.steel(), x, 2.88, z, 0, false);
}
