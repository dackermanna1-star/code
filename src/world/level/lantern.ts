import * as THREE from 'three';
import { Arena, HALF_D, HALF_W } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { buildAlley } from '../alley';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { chainFence, crateStack, lampPost, neonSign, wallLamp, put, signBoard } from './blocks';
import { block, busStop, cab, hydrant, parkedCar, shopfront, steam, trashBags, velvetRope, Windows, streetBox, bench } from './street';
import { RNG } from '../../core/math';

/**
 * KESSLER STREET: the prologue's level. The alley behind the Lantern (the alley map, as it was)
 * is its heart; round it the street it opens onto - shops lit late, a bus stop, cabs, the Lantern's
 * own front door with its queue, its rope and its man on the door - and the lane south of the block,
 * fenced and piled with crates, that leads round to the block's back way in.
 *
 * x runs east, z south. The alley: x -13..13, z -11..11 (its mouth on the street at x 13, z -2.5..2.5).
 * The street: pavement x 14..16.5, road 16.5..26, pavement 26..28.5. The Lantern: north of the alley,
 * its front at x 14, its door at z -24. The lane: z 30..33.5, from the street west.
 */
export const LANTERN = {
  /** Where the cab drops her. */
  start: { x: 15.4, z: 64, yaw: Math.PI },
  door: { x: 14.6, z: -24 },
  bouncer: { x: 15.1, z: -22.6 },
  gate: { x: 13.6, z: 0 },
  laneMouth: { x: 15.2, z: 31.7 },
  fence: { x: 8, z: 31.75 },
  crates: { x: 2.8, z: 31.75 },
  shutter: { x: -1.6, z: 30 },
  storeDoor: { x: -4, z: 11.6 },
};

export function buildLantern(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  // ---- the alley, as its own map builds it (its lights take part of the budget)
  const alley = buildAlley(a, blood, Math.max(1, pointLights - 1), shadowMapSize);
  // the street side gets a real gate across the mouth (and the block's south door leads somewhere)
  a.obstacles = a.obstacles.filter((o) => !(o.name === 'gate' && o.ghost && o.minX > 12));
  a.group.traverse((o) => {
    const m = o as THREE.Mesh;
    // (the dark box behind the south doorway: the corridor's there now)
    if (m.isMesh && Math.abs(m.position.x + 4) < 0.01 && Math.abs(m.position.z - (HALF_D + 1.5)) < 0.01) m.visible = false;
  });
  const k = new LevelKit(a, blood, Math.max(2, pointLights - 1), shadowMapSize, { bounds: { minX: -HALF_W - 1.5, maxX: 36, minZ: -49, maxZ: 73 }, density: 0.9 });
  k.ambientLight = 0.22;
  const M = new Materials(blood, true);
  const rng = new RNG(2024);
  const W = new Windows(91);
  a.camBounds = { out: 0, maxY: 26, walls: true };
  a.farPlane = 260;

  // ---------------------------------------------------------------------- the street
  const Z0 = -48, Z1 = 72;
  // (nobody fights out here: the street's floors don't take blood)
  k.deck(14, 16.5, Z0, Z1, 0.15, M.slabs(), M.concrete(0x8a8884), { name: 'pavement west', thick: 0.15, tile: 2.4, paint: false });
  k.floor(16.5, 26, Z0, Z1, M.asphalt(), { tile: 4, paint: false });
  k.deck(26, 28.5, Z0, Z1, 0.15, M.slabs(), M.concrete(0x8a8884), { name: 'pavement east', thick: 0.15, tile: 2.4, paint: false });
  // (the road's centre line and the crossing by the Lantern)
  for (let z = Z0 + 2; z < Z1; z += 5) put(k, new THREE.BoxGeometry(0.14, 0.01, 2.4), M.glow(0xb89a40, 0.6), 21.25, 0.005, z, 0, false);
  for (let i = 0; i < 7; i++) put(k, new THREE.BoxGeometry(8.6, 0.01, 0.45), M.glow(0xc8c4b8, 0.45), 21.25, 0.006, -34 + i * 0.9, 0, false);

  // ---------------------------------------------------------------------- west: the Lantern, the block, the hotel
  // the Lantern: three storeys of brick, its front on the street
  block(k, -HALF_W - 1, 14, Z0, -12, 14, M.brick('brown'), { name: 'the Lantern' });
  W.face(k, M, 14, -12.6, 14, Z0 + 0.6, 5.4, 3, rng, { pitch: 3.3, skip: (i, f) => f === 0 && i > 2 && i < 6 });
  // its front door: recessed glass, a canopy of bulbs, the blade sign, the rope and its queue
  {
    const D = LANTERN.door;
    k.solid([13.7, 14.0, 0, 2.8, D.z - 1.6, D.z + 1.6], M.dark(), { kind: false });
    const doors = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0xc8783a }));
    doors.position.set(14.02, 1.3, D.z);
    doors.rotation.y = Math.PI / 2;
    k.g.add(doors);
    for (const dz of [-0.65, 0.65]) put(k, new THREE.BoxGeometry(0.06, 2.6, 0.08), M.paint(0xb8903a, 0.3, 0.9), 14.06, 1.3, D.z + dz, 0, false);
    // canopy
    put(k, new THREE.BoxGeometry(2.4, 0.3, 4.6), M.paint(0x14100e, 0.5, 0.3), 15.2, 3.15, D.z, 0, true);
    for (let i = 0; i < 9; i++) for (const dx of [-0.9, 0, 0.9]) put(k, new THREE.SphereGeometry(0.045, 6, 4), M.glow(0xffd090, 2.2), 15.2 + dx, 2.98, D.z - 2 + i * 0.5, 0, false);
    k.spot([15.3, 2.7, D.z], 0xffc078, 40, 9);
    // a red carpet out to the kerb
    put(k, new THREE.BoxGeometry(2.4, 0.012, 1.8), M.paint(0x5a0a12, 0.85, 0), 15.2, 0.157, D.z, 0, false);
    // the blade sign, out from the wall over the door
    neonSign(k, ['THE', 'LANTERN'], '#ffb040', 14.9, 6.2, D.z + 2.6, 0, 1.8, 4.2, { intensity: 36 });
    neonSign(k, ['THE', 'LANTERN'], '#ffb040', 14.9, 6.2, D.z + 2.62, Math.PI, 1.8, 4.2, { intensity: 0 });
    put(k, new THREE.BoxGeometry(1.1, 0.08, 0.08), M.iron(), 14.45, 8.4, D.z + 2.6, 0, false);
    // the rope: along the kerb side, the queue outside it
    velvetRope(k, M, 15.75, D.z + 2.6, 15.75, D.z + 9);
    k.spot([15.2, 3.4, D.z + 6], 0xffd8a0, 10, 7);
  }
  // the block south of the alley: its back way in (the corridor), its storeroom and shutter
  block(k, -HALF_W - 1, -5, 12, 30, 9.5, M.block('#8a948a'));
  block(k, 0, 14, 12, 30, 9.5, M.block('#8a948a'));
  block(k, -3.3, 0, 12, 25, 9.5, M.block('#8a948a'), { walk: false });
  block(k, -5, -4.7, 12, 25, 3.1, M.block('#8a948a'), { walk: false });
  k.solid([-5, -3.3, 3.1, 9.5, 12, 25], M.block('#8a948a'), { kind: 'wall', name: 'corridor roof', walk: true });
  k.solid([-5, 0, 3.1, 9.5, 25, 30], M.block('#8a948a'), { kind: 'wall', name: 'store roof', walk: true });
  // the corridor and the storeroom: lino, peeling walls, a tube that won't stay on
  k.floor(-4.7, -3.3, 12, 25, M.concreteFloor(), { tile: 2, paint: false });
  k.floor(-5, 0, 25, 30, M.concreteFloor(), { tile: 2, paint: false });
  k.spot([-4.0, 2.7, 18], 0xc8f0ff, 14, 7, { flicker: 0.7 });
  k.spot([-2.5, 2.6, 27.5], 0xffd8a0, 10, 6);
  put(k, new THREE.BoxGeometry(0.12, 0.05, 1.2), M.glow(0xd8f0ff, 1.4), -4.0, 3.05, 18, 0, false);
  // the storeroom's south wall: the locked back door, the shutter stuck a metre up
  k.solid([-5, -2.6, 0, 3.1, 29.75, 30], M.block('#7a847a'), { kind: 'wall', name: 'store wall' });
  k.solid([-0.6, 0, 0, 3.1, 29.75, 30], M.block('#7a847a'), { kind: 'wall', name: 'store wall' });
  k.solid([-2.6, -0.6, 1.2, 3.1, 29.8, 29.95], M.shutter(4), { kind: 'wall', name: 'shutter', climb: false });
  put(k, new THREE.BoxGeometry(1.0, 2.1, 0.06), M.paint(0x3a4a44, 0.6, 0.3), -4, 1.05, 30.03, 0, false);
  signBoard(k, 'STAFF ONLY', -4, 2.35, 30.04, 0, 0.9, 0.22, { bg: '#c8b030', fg: '#1a1a1a' });
  wallLamp(k, M, -1.6, 3.4, 30.05, 0, { flicker: 0.4, intensity: 16 });
  // shelves and boxes in the storeroom (the photo's on the shelf)
  for (const x of [-4.6, -0.4]) put(k, new THREE.BoxGeometry(0.5, 2.0, 3.6), M.wood(), x, 1.0, 27.2, 0, true);
  k.block([-5, -4.35, 0, 2, 25.4, 29], 'crate', 'shelf');
  k.block([-0.65, 0, 0, 2, 25.4, 29], 'crate', 'shelf');
  // the hotel south of the lane: shops on its street front
  block(k, -HALF_W - 1, 14, 33.5, Z1, 11, M.brick('red'), { name: 'the Marlowe' });
  W.face(k, M, 14, 34.2, 14, Z1 - 0.6, 4.9, 3, rng, { pitch: 3.0 });
  W.face(k, M, -HALF_W - 1 + 0.6, 33.5, 14 - 0.6, 33.5, 4.9, 2, rng, { pitch: 3.4 });
  shopfront(k, M, rng, 14, 41, Math.PI / 2, 5.2, { neon: 'DELI · 24H', color: '#3ad8ff', awning: 1.6 });
  shopfront(k, M, rng, 14, 50, Math.PI / 2, 5.6, { sign: 'SUDS LAUNDROMAT', color: '#2a4a6a', light: 18 });
  shopfront(k, M, rng, 14, 60, Math.PI / 2, 5.0, { sign: 'GOLD & PAWN', color: '#3a2a10', shutter: true });
  shopfront(k, M, rng, 14, 68.5, Math.PI / 2, 5.0, { neon: 'HOTEL MARLOWE', color: '#ff4a8a', awning: 2.0 });
  // the block's street face (north of the lane)
  W.face(k, M, 14, 12.6, 14, 29.4, 4.6, 2, rng, { pitch: 3.2 });
  shopfront(k, M, rng, 14, 20, Math.PI / 2, 5.4, { sign: 'KIM\'S HARDWARE', color: '#5a1a12', shutter: true });

  // ---------------------------------------------------------------------- east: across the road
  // (the alley map's backdrop building stands across from the mouth: the rest of the row round it)
  k.block([28.5, 32.5, 0, 16, -30, 30], 'wall', 'across', true);
  block(k, 28.5, 36, 30, Z1, 12, M.brick('yellow'));
  block(k, 28.5, 36, Z0, -30, 14, M.brick('red'));
  W.face(k, M, 28.5, Z1 - 0.6, 28.5, 30.6, 4.9, 3, rng, { pitch: 3.1 });
  W.face(k, M, 28.5, -30.6, 28.5, Z0 + 0.6, 4.9, 3, rng, { pitch: 3.2 });
  shopfront(k, M, rng, 28.5, 38, -Math.PI / 2, 5.6, { neon: 'NOODLES', color: '#ff3a3a', awning: 1.8 });
  shopfront(k, M, rng, 28.5, 47, -Math.PI / 2, 5.0, { neon: 'PHARMACY', color: '#4aff7a' });
  shopfront(k, M, rng, 28.5, 56, -Math.PI / 2, 5.0, { neon: 'INK & STEEL', color: '#b84aff' });
  shopfront(k, M, rng, 28.5, 64.5, -Math.PI / 2, 5.0, { sign: 'BLUE NOTE BAR', color: '#1a2a4a', light: 20 });
  shopfront(k, M, rng, 28.5, -36, -Math.PI / 2, 5.0, { neon: 'PALACE SLOTS', color: '#ffd03a' });
  shopfront(k, M, rng, 28.5, -44, -Math.PI / 2, 5.0, { sign: 'CHECKS CASHED', color: '#2a4a1a', shutter: true });

  // ---------------------------------------------------------------------- the street's furniture
  for (let z = Z0 + 6; z < Z1 - 2; z += 16) lampPost(k, M, 16.15, z, { ry: Math.PI / 2, intensity: 60 });
  for (let z = Z0 + 14; z < Z1 - 2; z += 16) lampPost(k, M, 26.35, z, { ry: -Math.PI / 2, intensity: 55, flicker: z > 40 && z < 60 ? 0.35 : 0 });
  // parked along both kerbs (the cab that brought her at the south end)
  cab(k, 17.7, 64.2, Math.PI / 2);
  for (const [z, c] of [[52, 0x2a2a30], [24, 0x5a1a1a], [-8, 0x1a2a3a], [-40, 0x3a3a34]] as [number, number][]) parkedCar(k, 17.6, z, Math.PI / 2, c);
  for (const [z, c] of [[58, 0x1a1a1e], [43, 0x6a6a68], [12, 0x2a3a2a], [-16, 0x0e0e12], [-28, 0x4a3a2a]] as [number, number][]) parkedCar(k, 24.9, z, Math.PI / 2, c);
  // (the alley map's own car at the mouth, and its streetlight: solid)
  k.block([HALF_W + 4.2 - 0.92, HALF_W + 4.2 + 0.92, 0, 1.3, 6.5 - 2.15, 6.5 + 2.15], 'crate', 'car', true);
  k.block([HALF_W + 1.68, HALF_W + 1.92, 0, 7, -3.32, -3.08], 'pillar', 'streetlight');
  busStop(k, M, 27.3, 30.5, -Math.PI / 2);
  bench(k, M, 15.0, 45.5, Math.PI / 2);
  for (const [x, z] of [[16.2, 36], [16.2, -6], [26.3, 22], [26.3, -20]] as [number, number][]) hydrant(k, M, x, z);
  streetBox(k, M, 15.2, 37.8, Math.PI / 2, 0x2a5a3a);
  streetBox(k, M, 15.2, 38.4, Math.PI / 2, 0x8a1a1a, 0.95);
  streetBox(k, M, 27.4, 4, -Math.PI / 2, 0x4a4a52, 1.4);
  trashBags(k, M, rng, 15.1, 55.5, 5);
  trashBags(k, M, rng, 27.6, 52, 3);
  trashBags(k, M, rng, 15.1, 16.5, 4);
  steam(k, 21.2, 28, 1.2);
  steam(k, 21.0, -14, 0.9);

  // ---------------------------------------------------------------------- the lane round the back
  k.floor(-HALF_W - 1, 14, 30, 33.5, M.asphalt(), { tile: 4, paint: false });
  // the gate across it, chained: over the top
  chainFence(k, M, LANTERN.fence.x, 30.05, LANTERN.fence.x, 33.45, 2.1);
  signBoard(k, 'NO ENTRY · KX PROPERTY', LANTERN.fence.x + 0.08, 1.4, 31.75, Math.PI / 2, 1.6, 0.4, { bg: '#c8b030', fg: '#141414' });
  wallLamp(k, M, 11, 3.2, 33.45, Math.PI, { intensity: 16, color: 0xffb070 });
  // a wall of crates wedged across it: up and over
  for (let i = 0; i < 3; i++) k.solid([LANTERN.crates.x - 0.8, LANTERN.crates.x + 0.8, 0, 1.2, 30 + i * 1.17, 30 + (i + 1) * 1.17], M.crate(), { kind: 'crate', name: 'crates', walk: true, tile: 1.2, material: 'wood' });
  crateStack(k, M, LANTERN.crates.x - 0.2, 32.9, 2, 0.9);
  trashBags(k, M, rng, 6.4, 33.0, 3);
  trashBags(k, M, rng, -8, 30.6, 4);
  k.solid([-12.5, -10.6, 0, 1.25, 31.2, 33.2], M.paint(0x2a4a3a, 0.6, 0.35), { kind: 'crate', name: 'dumpster', walk: true });
  // the lane's end: a blank wall
  k.solid([-HALF_W - 1.5, -HALF_W - 1, 0, 11, 30, 33.5], M.block('#6a746a'), { kind: 'wall' });

  // ---------------------------------------------------------------------- the alley's gate on the street
  {
    // three metres of chain-link and razor wire across the mouth, chained shut
    const G = LANTERN.gate;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.1), M.chainLink());
    const uv = mesh.geometry.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] *= 10;
      uv[i + 1] *= 6.2;
    }
    mesh.position.set(G.x, 1.55, 0);
    mesh.rotation.y = Math.PI / 2;
    mesh.name = 'alleyGate';
    k.g.add(mesh);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 4, 24), M.steel());
    for (let z = -2.4; z <= 2.4; z += 0.32) {
      const w = wire.clone();
      w.position.set(G.x, 3.25, z);
      w.rotation.y = Math.PI / 2;
      k.g.add(w);
    }
    for (const z of [-2.55, 2.55]) put(k, new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), M.steel(), G.x, 1.7, z, 0, true);
    put(k, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), M.steel(), G.x + 0.05, 1.2, 0, 0, false);
    signBoard(k, 'PRIVATE · NO TRESPASSING', G.x + 0.06, 2.2, 0, Math.PI / 2, 1.8, 0.4, { bg: '#d8d0c0', fg: '#8a1a1a' });
    const ob = k.block([G.x - 0.06, G.x + 0.06, 0, 3.4, -2.5, 2.5], 'wall', 'alley gate');
    if (ob) {
      ob.climb = false;
      ob.seeThrough = true;
    }
  }
  W.finish(k);
  // (out on the street the night's a little brighter than in the alley's well)
  alley.hemi.intensity *= 1.25;
  // the alley's moon follows her round the block (its shadows where she is)
  const moon = alley.moon;
  moon.intensity *= 1.3;
  const moonOff = moon.position.clone().sub(moon.target.position);
  const ext = k.finish({ hemi: alley.hemi });
  return {
    ...alley,
    update: (dt) => {
      alley.update(dt);
      ext.update(dt);
      const f = a.focus;
      moon.target.position.set(Math.round(f.x), 0, Math.round(f.z));
      moon.position.copy(moon.target.position).add(moonOff);
      moon.target.updateMatrixWorld();
    },
  };
}
