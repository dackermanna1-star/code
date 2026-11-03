import * as THREE from 'three';
import type { Arena } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { put, signBoard, wallLamp, chainFence, lampPost } from './blocks';
import { Windows } from './street';
import { RNG } from '../../core/math';
import { buildLab } from '../lab';
import { carModel } from '../../vehicle/car';
import { skyTexture } from '../city';

/**
 * PALEWATER BIOTECH at first light: chapter six's level. Outside the fence, Viper's car crumpled
 * against the gate; the gatehouse; the guards' hut with its lockers; the forecourt, the loading dock
 * where the convoy's trucks stand with their doors open; the glass front of the main building, its
 * lobby and reception desk, the security office; the observation corridor along the main lab's
 * south wall - and the main lab itself (the endless mode's), where the Warden is.
 *
 * x east, z south: the lab at the origin, the building's front to the south, the gate beyond.
 */
export const PALEWATER = {
  start: { x: 23.4, z: 66.5, yaw: Math.PI },
  wreck: { x: 22.4, z: 63.6 },
  gate: { x0: 18, x1: 27, z: 62 },
  climb: { x0: -9, x1: -3, z: 62 },
  hut: { x0: 28, x1: 36, z0: 46, z1: 56 },
  locker: { x: 35.3, z: 49 },
  lobby: { x0: -11, x1: 11, z0: 15, z1: 31 },
  desk: { x: 0, z: 22 },
  frontDoor: { x: 0, z: 31 },
  corridor: { z0: 12, z1: 15 },
  secOffice: { x0: 11, x1: 19, z0: 15, z1: 25 },
  dock: { x: 30, z: 14 },
};

export function buildPalewater(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  // ---- the main lab, as the endless mode builds it
  const lab = buildLab(a, blood, Math.max(1, pointLights - 1), shadowMapSize);
  lab.moon.removeFromParent();
  lab.moon.target?.removeFromParent();
  // (its south doors open onto the observation corridor now: no dark boxes behind them, no gates across)
  a.obstacles = a.obstacles.filter((o) => !(o.name === 'gate' && o.ghost && o.minZ > 10));
  a.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && !Array.isArray(mat) && mat.side === THREE.BackSide && mat.color?.getHex() === 0x050607 && m.position.z > 11) m.visible = false;
  });
  const k = new LevelKit(a, blood, Math.max(2, pointLights - 1), shadowMapSize, { bounds: { minX: -34, maxX: 48, minZ: -14, maxZ: 74 }, density: 0.66 });
  k.ambientLight = 0.22;
  const M = new Materials(blood, true);
  const Md = new Materials(blood, false);
  const rng = new RNG(7171);
  const W = new Windows(41);
  a.fog = { color: 0x5a6070, density: 0.009 };
  a.background = skyTexture(41);
  a.farPlane = 260;
  a.camBounds = { out: 0, maxY: 12, walls: true };
  const P = PALEWATER;
  const panel = Md.paint(0xd8dce0, 0.5, 0.05);
  const navy = Md.paint(0x1a2438, 0.5, 0.1);
  const glass = new THREE.MeshStandardMaterial({ color: 0x8aa0b0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

  // ---------------------------------------------------------------------- the ground outside
  k.floor(-34, 48, 31, 74, M.asphalt(), { tile: 6, dense: false });
  k.floor(19, 48, -14, 31, M.slabs(), { tile: 3 });
  k.floor(-34, -14, -14, 31, M.slabs(), { tile: 3, paint: false });
  // parking bays, painted
  for (let x = -26; x < 12; x += 3.2) put(k, new THREE.BoxGeometry(0.1, 0.01, 5), Md.glow(0xd8d4c8, 0.6), x, 0.012, 40, 0, false);

  // ---------------------------------------------------------------------- the building's shell round the lab
  // the main block (the lab inside it): walls round the lab's box, its roof
  k.solid([-14, 14, 5.6, 9.2, -12, 12], Md.concrete(0xb8bcc0), { kind: false });
  k.solid([-15, 19, 9.2, 9.6, -13, 31], Md.concrete(0x8a8e90), { kind: false });
  // the observation corridor along the lab's south wall
  const C = P.corridor;
  k.floor(-14, 14, C.z0, C.z1, Md.concreteFloor(), { tile: 3 });
  k.solid([-14, -13.8, 0, 3.4, C.z0, C.z1], panel, { kind: 'wall' });
  k.solid([13.8, 14, 0, 3.4, C.z0, C.z1], panel, { kind: 'wall' });
  k.solid([-14, 14, 3.4, 3.6, C.z0, C.z1], panel, { kind: false });
  // its south wall (the lobby's north), a door through to the lobby
  k.solid([-14, -1.2, 0, 3.4, C.z1 - 0.2, C.z1], panel, { kind: 'wall' });
  k.solid([1.2, 14, 0, 3.4, C.z1 - 0.2, C.z1], panel, { kind: 'wall' });
  k.solid([-1.2, 1.2, 2.4, 3.4, C.z1 - 0.2, C.z1], panel, { kind: 'wall' });
  signBoard(k, 'RESTRICTED · LEVEL 3 ACCESS', 0, 2.75, C.z1 + 0.02, 0, 2.4, 0.3, { bg: '#c82a2a', fg: '#f0f0e8' });
  for (const x of [-9, 0, 9]) k.spot([x, 3.1, (C.z0 + C.z1) / 2], 0xe8f0ff, 12, 7);
  // the lobby: glass front, a reception desk, benches, a big logo
  const L = P.lobby;
  k.floor(L.x0, L.x1, L.z0, L.z1, Md.slabs(), { tile: 2.4, dense: true });
  k.solid([L.x0 - 0.2, L.x0, 0, 4.2, L.z0, L.z1], panel, { kind: 'wall' });
  k.solid([L.x1, L.x1 + 0.2, 0, 4.2, L.z0, P.secOffice.z0 + 4], panel, { kind: 'wall' });
  k.solid([L.x1, L.x1 + 0.2, 0, 4.2, P.secOffice.z0 + 5.6, L.z1], panel, { kind: 'wall' });
  k.solid([L.x0, L.x1, 4.2, 4.4, L.z0, L.z1], Md.paint(0xe8ecf0, 0.6, 0), { kind: false });
  // the front: glass panels, the doors (open: the night shift's coming in)
  for (const [x0, x1] of [[L.x0, -2], [2, L.x1]] as [number, number][]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 4.2), glass);
    m.position.set((x0 + x1) / 2, 2.1, L.z1);
    k.g.add(m);
    const ob = k.block([x0, x1, 0, 4.2, L.z1 - 0.06, L.z1 + 0.06], 'wall', 'glass front');
    if (ob) ob.seeThrough = true;
  }
  for (let x = L.x0; x <= L.x1; x += 2.2) put(k, new THREE.BoxGeometry(0.08, 4.2, 0.1), Md.iron(), x, 2.1, L.z1, 0, false);
  signBoard(k, 'PALEWATER', 0, 3.6, L.z1 + 0.08, 0, 6, 1.0, { bg: '#0e1a24', fg: '#9ad8e0', lit: true, font: '"Oswald", sans-serif' });
  // reception: a long desk, its screens, the logo on the wall behind
  const D = P.desk;
  k.solid([D.x - 2.6, D.x + 2.6, 0, 1.05, D.z - 0.5, D.z + 0.5], navy, { kind: 'crate', name: 'reception' });
  put(k, new THREE.BoxGeometry(5.4, 0.05, 1.2), Md.paint(0xe8e8e0, 0.3, 0.1), D.x, 1.08, D.z, 0, false);
  for (const x of [-1.6, 0, 1.6]) put(k, new THREE.BoxGeometry(0.5, 0.32, 0.04), Md.glow(0x8ac8ff, 0.8), D.x + x, 1.3, D.z - 0.2, 0, false);
  signBoard(k, 'PALEWATER BIOTECH · BETTER LIVES THROUGH SCIENCE', 0, 3.0, L.z0 + 0.25, Math.PI, 7.5, 0.6, { bg: '#e8ecf0', fg: '#1a3a4a' });
  for (const x of [-7, 7]) k.solid([x - 1.4, x + 1.4, 0, 0.45, 27.5, 28.3], Md.paint(0x3a4a5a, 0.6, 0.1), { kind: 'crate', name: 'bench' });
  for (const [x, z] of [[-6, 20], [6, 20], [0, 27], [-6, 27], [6, 27]] as [number, number][]) k.spot([x, 4.0, z], 0xf0f4ff, 16, 8);
  // the security office (east of the lobby): screens, the night log
  const S = P.secOffice;
  k.floor(S.x0, S.x1, S.z0, S.z1, Md.concreteFloor(), { tile: 3 });
  k.solid([S.x1, S.x1 + 0.2, 0, 3.4, S.z0, S.z1], panel, { kind: 'wall' });
  k.solid([S.x0, S.x1, 0, 3.4, S.z1, S.z1 + 0.2], panel, { kind: 'wall' });
  k.solid([S.x0, S.x1, 3.4, 3.6, S.z0, S.z1], panel, { kind: false });
  k.solid([S.x1 - 1.2, S.x1 - 0.4, 0, 0.78, S.z0 + 1, S.z1 - 1], navy, { kind: 'crate', name: 'desk' });
  put(k, new THREE.PlaneGeometry(6, 1.8), Md.glow(0x5a8aa8, 0.7), S.x1 - 0.05, 2.0, (S.z0 + S.z1) / 2, -Math.PI / 2, false);
  k.spot([S.x1 - 2, 3.0, (S.z0 + S.z1) / 2], 0x9ac0e0, 12, 7);
  // the building's outside: its walls to the roof, windows, the loading dock's doors
  k.solid([-15, -14, 0, 9.2, -13, 31], Md.concrete(0x9a9ea2), { kind: 'wall' });
  k.solid([14, 19, 0, 9.2, -13, 15], Md.concrete(0x9a9ea2), { kind: 'wall' });
  k.solid([19, 19.2, 0, 9.2, 15, 31], Md.concrete(0x9a9ea2), { kind: 'wall' });
  k.solid([-15, 19, 0, 9.2, -13.2, -12], Md.concrete(0x9a9ea2), { kind: 'wall' });
  k.solid([L.x1 + 0.2, 19, 0, 9.2, S.z1 + 0.2, 31], Md.concrete(0x9a9ea2), { kind: 'wall' });
  k.solid([-14, L.x0 - 0.2, 0, 9.2, C.z1, 31], Md.concrete(0x9a9ea2), { kind: 'wall' });
  k.solid([-15, 19, 4.4, 9.2, 30.9, 31.1], Md.concrete(0x9a9ea2), { kind: false });
  W.face(k, Md, 19.2, -12, 19.2, 30, 5.6, 1, rng, { pitch: 3.2, sills: false });
  W.face(k, Md, -15, 30, -15, -12, 1.6, 2, rng, { pitch: 3.2, sills: false, floorH: 3.6 });
  // the loading dock (east): its shutter up, the trucks backed to it, their doors open on the dark
  // inside (empty now: chains on the floor, a blanket)
  put(k, new THREE.BoxGeometry(0.1, 3.6, 6), Md.dark(), 19.25, 1.8, 6, 0, false);
  for (const [x, z, ry] of [[29, 4.6, Math.PI / 2], [30, 11.5, Math.PI / 2 - 0.06]] as [number, number, number][]) {
    const t = carModel('truck', 0xe8e8e4);
    t.group.position.set(x, 0, z);
    t.group.rotation.y = ry;
    const L = 12.5, W = 2.5, back = -L / 2 + 0.1;
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, 2.7), new THREE.MeshBasicMaterial({ color: 0x050506 }));
    hole.position.set(0, 2.1, back - 0.012);
    hole.rotation.y = Math.PI;
    t.group.add(hole);
    for (const sd of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.04, 2.7, 0.05), Md.paint(0xdcdcd8, 0.5, 0.3));
      const hinge = new THREE.Group();
      hinge.position.set(sd * (W / 2), 2.1, back);
      hinge.rotation.y = sd * 1.75;
      leaf.position.set(-sd * (W / 4 - 0.02), 0, 0);
      hinge.add(leaf);
      t.group.add(hinge);
    }
    k.g.add(t.group);
    k.block([x - 6.3, x + 6.3, 0, 3.8, z - 1.35, z + 1.35], 'wall', 'truck');
  }
  k.spot([24, 5, 8], 0xfff0d8, 30, 14);
  signBoard(k, 'DOCK 2 · DELIVERIES · NO ENTRY', 19.3, 4.2, 6, Math.PI / 2, 2.6, 0.4, { bg: '#d8a020', fg: '#141414' });

  // ---------------------------------------------------------------------- the fence, the gate, the gatehouse, the guards' hut
  {
    const G = P.gate, Cl = P.climb;
    // the fence: unclimbable (razor wire on top) except where a section's been patched lower
    chainFence(k, M, -34, G.z, Cl.x0, G.z, 3.0);
    chainFence(k, M, Cl.x1, G.z, G.x0, G.z, 3.0);
    chainFence(k, M, G.x1, G.z, 48, G.z, 3.0);
    for (const o of a.obstacles) if (o.name === 'fence' && (o.minZ ?? 0) > G.z - 0.5 && o.maxZ < G.z + 0.5) o.climb = false;
    chainFence(k, M, Cl.x0, G.z, Cl.x1, G.z, 2.0);
    put(k, new THREE.BoxGeometry(Cl.x1 - Cl.x0, 0.08, 0.06), M.paint(0xd8a020, 0.6, 0.2), (Cl.x0 + Cl.x1) / 2, 2.05, G.z, 0, false);
    // the gate: two leaves, shut; the wreck against them
    k.solid([G.x0, G.x1, 0, 2.6, G.z - 0.12, G.z + 0.12], M.paint(0x3a4a5a, 0.5, 0.6), { kind: 'wall', name: 'gate', climb: false });
    for (let x = G.x0 + 0.3; x < G.x1; x += 0.3) put(k, new THREE.BoxGeometry(0.04, 2.6, 0.04), M.iron(), x, 1.3, G.z, 0, false);
    const wreck = carModel('saloon', 0x0c0c0e);
    wreck.group.position.set(P.wreck.x, 0, P.wreck.z);
    wreck.group.rotation.set(0, Math.PI + 0.35, 0.06);
    wreck.group.scale.set(1, 0.92, 0.9);
    k.g.add(wreck.group);
    k.block([P.wreck.x - 1.2, P.wreck.x + 1.2, 0, 1.4, P.wreck.z - 2.2, P.wreck.z + 2.2], 'crate', 'wreck');
    // the gatehouse (by the gate, inside), lit; the guards' hut further in
    k.solid([28, 32, 0, 3.0, 58, 61.6], Md.paint(0x9a9ea2, 0.7, 0.05), { kind: 'wall', name: 'gatehouse' });
    put(k, new THREE.BoxGeometry(3.6, 1.0, 0.05), M.glow(0xffe8c0, 0.8), 30, 1.9, 61.62, 0, false);
    wallLamp(k, Md, 28, 2.6, 59.8, -Math.PI / 2, { color: 0xffe0b0, intensity: 18 });
    const H = P.hut;
    k.solid([H.x0, H.x1, 0, 3.2, H.z0, H.z0 + 0.2], Md.paint(0x8a8e90, 0.7, 0.05), { kind: 'wall' });
    k.solid([H.x0, H.x1, 0, 3.2, H.z1 - 0.2, H.z1], Md.paint(0x8a8e90, 0.7, 0.05), { kind: 'wall' });
    k.solid([H.x1 - 0.2, H.x1, 0, 3.2, H.z0, H.z1], Md.paint(0x8a8e90, 0.7, 0.05), { kind: 'wall' });
    k.solid([H.x0, H.x0 + 0.2, 0, 3.2, H.z0, H.z0 + 3.4], Md.paint(0x8a8e90, 0.7, 0.05), { kind: 'wall' });
    k.solid([H.x0, H.x0 + 0.2, 0, 3.2, H.z0 + 4.6, H.z1], Md.paint(0x8a8e90, 0.7, 0.05), { kind: 'wall' });
    k.solid([H.x0, H.x0 + 0.2, 2.3, 3.2, H.z0 + 3.4, H.z0 + 4.6], Md.paint(0x8a8e90, 0.7, 0.05), { kind: 'wall' });
    k.solid([H.x0, H.x1, 3.2, 3.4, H.z0, H.z1], Md.paint(0x6a6e70, 0.7, 0.05), { kind: false });
    k.floor(H.x0, H.x1, H.z0, H.z1, Md.concreteFloor(), { tile: 3 });
    signBoard(k, 'SECURITY · STAFF', H.x0 - 0.02, 2.6, H.z0 + 4.0, -Math.PI / 2, 1.6, 0.3, { bg: '#1a2438', fg: '#e8e8e0' });
    // the lockers along its east wall: hers is the end one, her name still on it
    for (let i = 0; i < 8; i++) {
      const z = H.z0 + 1.0 + i * 0.62;
      put(k, new THREE.BoxGeometry(0.5, 1.9, 0.6), Md.paint(i === 5 ? 0x5a6a7a : 0x6a7a8a, 0.45, 0.3), H.x1 - 0.5, 0.95, z, 0, true);
    }
    k.block([H.x1 - 0.8, H.x1 - 0.2, 0, 1.9, H.z0 + 0.6, H.z0 + 6.2], 'prop', 'lockers');
    signBoard(k, 'S. REYES', H.x1 - 0.76, 1.6, P.locker.z, -Math.PI / 2, 0.42, 0.1, { bg: '#e8e0c8', fg: '#1a1a1a' });
    k.solid([H.x0 + 1.4, H.x0 + 3.8, 0, 0.75, H.z0 + 5, H.z0 + 6.2], Md.wood(), { kind: 'crate', name: 'table' });
    k.spot([H.x0 + 4, 3.0, H.z0 + 5], 0xfff0d8, 12, 7);
    // the floodlights over the forecourt
    for (const [x, z] of [[-20, 44], [0, 44], [16, 50], [36, 30], [36, 0]] as [number, number][]) lampPost(k, Md, x, z, { h: 8, color: 0xe8f0ff, intensity: 50, ry: Math.PI });
  }

  // ---------------------------------------------------------------------- the river beyond (east), the hills, the sky going grey
  k.floor(48, 300, -200, 300, new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.15, metalness: 0.5 }), { y: -3, paint: false, tile: 20 });
  for (let i = 0; i < 18; i++) {
    const x = -80 - rng.next() * 160, z = -60 + rng.next() * 260, h = 18 + rng.next() * 40;
    put(k, new THREE.ConeGeometry(30 + rng.next() * 30, h, 7), Md.paint(0x2a3038, 0.95, 0), x, h / 2 - 2, z, rng.next() * 3, false);
  }

  W.finish(k);
  const hemi = lab.hemi;
  hemi.intensity = 1.7;
  hemi.color.setHex(0xc8d0e0);
  const key = k.keyLight(0xffd8b0, 1.2, new THREE.Vector3(1, 0.45, 0.3), 30);
  void key;
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(0, 2, 24),
    update: (dt) => lab.update?.(dt),
  });
  return { ...parts, dust: lab.dust, dressing: lab.dressing };
}
