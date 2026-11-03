import * as THREE from 'three';
import type { Arena } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { canvas, tex } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { put, signBoard, lampPost } from './blocks';
import { RNG } from '../../core/math';
import { container } from './blocks';

/**
 * PALEWATER'S RIVER DOCK, sunrise: chapter eight's level. Out of the service door at the top of the
 * stairs onto the dock behind the labs: a concrete apron with containers and a crane, the long
 * wooden jetty out over the water, and at its end the helipad on its pier - Voss's helicopter,
 * rotors turning. The sun coming up over the far bank.
 *
 * x east, z south: the building behind (south), the river ahead (north).
 */
export const DAWN = {
  start: { x: 0, z: 26, yaw: Math.PI },
  apron: { x0: -26, x1: 26, z0: -2, z1: 30 },
  // (its far end runs onto the helipad's rim: no gap between the boards and the pier)
  jetty: { x0: -2.5, x1: 2.5, z0: -61.6, z1: -2 },
  pad: { x: 0, z: -72, r: 11 },
  heli: { x: 0, z: -73 },
};

export const dawnStage = {
  rotor: null as THREE.Object3D | null,
  rotorSpeed: 0,
  heli: null as THREE.Group | null,
  sun: 0,
};

function skyDawn() {
  const [c, x] = canvas(16, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2a3a5a');
  g.addColorStop(0.45, '#7a6a8a');
  g.addColorStop(0.62, '#e89a6a');
  g.addColorStop(0.7, '#ffcf8a');
  g.addColorStop(1, '#3a3a4a');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 256);
  const t = tex(c, true, false);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/** A small helicopter: body, tail boom, skids, the main rotor (spins), a tail rotor. */
function helicopter() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.6, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.5, roughness: 0.05 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), paint);
  body.scale.set(1, 0.85, 1.6);
  body.position.y = 1.7;
  const win = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12, 0, Math.PI * 2, 0, 1.2), glass);
  win.rotation.x = Math.PI / 2.4;
  win.position.set(0, 1.9, 1.1);
  win.scale.set(1, 1, 0.9);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.2, 10).rotateX(Math.PI / 2), paint);
  boom.position.set(0, 2.0, -4.0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.8), paint);
  fin.position.set(0, 2.5, -6.4);
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6).rotateX(Math.PI / 2), paint);
    skid.position.set(sx, 0.08, 0);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), paint);
    strut.position.set(sx * 0.8, 0.5, 0.6);
    const strut2 = strut.clone();
    strut2.position.z = -0.6;
    g.add(skid, strut, strut2);
  }
  const rotor = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 5.4), paint);
    b.position.z = 2.7;
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * Math.PI * 2;
    arm.add(b);
    rotor.add(arm);
  }
  rotor.position.y = 3.05;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), paint);
  mast.position.y = 2.8;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.12), paint);
  tail.position.set(0.18, 2.4, -6.5);
  g.add(body, win, boom, fin, rotor, mast, tail);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { group: g, rotor, tail };
}

export function buildDawn(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const k = new LevelKit(a, blood, pointLights, shadowMapSize, { bounds: { minX: -40, maxX: 40, minZ: -90, maxZ: 40 }, density: 0.7 });
  k.ambientLight = 0.4;
  const M = new Materials(blood, true);
  const Md = new Materials(blood, false);
  const rng = new RNG(8181);
  a.fog = { color: 0xb8a8a8, density: 0.0055 };
  a.background = skyDawn();
  a.farPlane = 600;
  a.camBounds = { out: 4, maxY: 20, walls: true };
  a.propSpots = { drums: [], crates: [] };
  a.fallDeath = 3;
  // (Palewater's own dock: its security, in its uniforms)
  a.roster = 'lab';
  // the water all round the apron and the jetty: a fall in is the end of a man (bodies go in)
  a.pits.push({ minX: -60, maxX: 60, minZ: -100, maxZ: -2 });
  const Ap = DAWN.apron, J = DAWN.jetty, P = DAWN.pad;

  // ---------------------------------------------------------------------- the apron
  k.floor(Ap.x0, Ap.x1, Ap.z0, Ap.z1, M.concreteFloor(), { tile: 3, dense: true });
  // its edge on the water: a kerb (bodies go over), bollards, a ladder down to nowhere
  k.solid([Ap.x0, J.x0, 0, 0.35, Ap.z0, Ap.z0 + 0.4], M.concrete(0xd8c050), { kind: 'ledge', name: 'quay edge' });
  k.solid([J.x1, Ap.x1, 0, 0.35, Ap.z0, Ap.z0 + 0.4], M.concrete(0xd8c050), { kind: 'ledge', name: 'quay edge' });
  for (let x = Ap.x0 + 3; x < Ap.x1; x += 7) if (Math.abs(x) > 4) put(k, new THREE.CylinderGeometry(0.22, 0.28, 0.6, 10), Md.paint(0x2a2a2a, 0.6, 0.4), x, 0.3, Ap.z0 + 0.8);
  // the building behind: Palewater's back wall, the service door she came out of
  k.solid([-30, 30, 0, 12, Ap.z1, Ap.z1 + 2], Md.concrete(0x9a9ea2), { kind: 'wall' });
  put(k, new THREE.BoxGeometry(2.4, 2.6, 0.1), Md.dark(), 0, 1.3, Ap.z1 - 0.02, 0, false);
  signBoard(k, 'PALEWATER · RIVER DOCK · NO UNAUTHORISED VESSELS', 8, 4.2, Ap.z1 - 0.04, Math.PI, 7, 0.6, { bg: '#e8ecf0', fg: '#1a3a4a' });
  k.solid([Ap.x0 - 1, Ap.x0, 0, 4, Ap.z0, Ap.z1], Md.concrete(0x8a8e90), { kind: 'wall' });
  k.solid([Ap.x1, Ap.x1 + 1, 0, 4, Ap.z0, Ap.z1], Md.concrete(0x8a8e90), { kind: 'wall' });
  // containers, a forklift, pallets: cover, and things to put men into
  for (const [x, z, ry, c] of [[-16, 18, 0, 'blue'], [-16, 12, 0, 'red'], [16, 20, Math.PI / 2, 'green'], [18, 8, 0, 'orange']] as [number, number, number, Parameters<Materials['container']>[0]][]) container(k, M, x, z, ry, c);
  for (const [x, z] of [[-8, 6], [8, 4], [-20, 4]] as [number, number][]) k.solid([x - 0.6, x + 0.6, 0, 0.9, z - 0.6, z + 0.6], M.crate(), { kind: 'crate', name: 'crate' });
  // the crane over the quay
  put(k, new THREE.BoxGeometry(1.2, 18, 1.2), Md.paint(0xc89020, 0.6, 0.4), -22, 9, 2, 0, true);
  put(k, new THREE.BoxGeometry(1.0, 1.0, 26), Md.paint(0xc89020, 0.6, 0.4), -22, 18, -9, 0, false);
  k.block([-22.6, -21.4, 0, 18, 1.4, 2.6], 'pillar', 'crane');
  for (const [x, z] of [[-12, 24], [12, 24], [-20, 2], [20, 2]] as [number, number][]) lampPost(k, Md, x, z, { h: 7, color: 0xffd8b0, intensity: 24 });

  // ---------------------------------------------------------------------- the jetty, the helipad
  const wood = M.planksFloor();
  k.deck(J.x0, J.x1, J.z0, J.z1 + 0.6, 0, wood, M.wood(), { thick: 0.5, dense: true, name: 'jetty' });
  for (let z = J.z0; z < J.z1; z += 3) {
    for (const x of [J.x0, J.x1]) put(k, new THREE.CylinderGeometry(0.16, 0.16, 6, 8), Md.paint(0x3a2a1a, 0.9, 0), x, -3, z, 0, false);
  }
  // its rope rail (ledges: a man over it goes in the river)
  for (const x of [J.x0, J.x1]) {
    k.solid([x - 0.05, x + 0.05, 0, 0.95, J.z0, J.z1], null, { kind: 'ledge', name: 'jetty rail', hidden: true });
    for (let z = J.z0; z <= J.z1; z += 2.5) put(k, new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), M.wood(), x, 0.5, z, 0, false);
    put(k, new THREE.CylinderGeometry(0.025, 0.025, J.z1 - J.z0, 5).rotateX(Math.PI / 2), Md.paint(0xc8b890, 0.9, 0), x, 0.9, (J.z0 + J.z1) / 2, 0, false);
  }
  // the pad: a round concrete pier, its H, its lights round the rim
  {
    const r = P.r;
    const pad = new THREE.CylinderGeometry(r, r, 0.5, 40);
    pad.translate(P.x, -0.25, P.z);
    k.geo(pad, M.concrete(0x8a8a88), true);
    k.block([P.x - r * 0.72, P.x + r * 0.72, -0.5, 0, P.z - r * 0.72, P.z + r * 0.72], 'crate', 'helipad', true);
    for (const [x0, x1, z0, z1] of [[P.x - r, P.x - r * 0.72, P.z - r * 0.5, P.z + r * 0.5], [P.x + r * 0.72, P.x + r, P.z - r * 0.5, P.z + r * 0.5], [P.x - r * 0.5, P.x + r * 0.5, P.z - r, P.z - r * 0.72], [P.x - r * 0.5, P.x + r * 0.5, P.z + r * 0.72, P.z + r]] as [number, number, number, number][]) {
      k.block([x0, x1, -0.5, 0, z0, z1], 'crate', 'helipad', true);
    }
    const H = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: (() => {
      const [c, x] = canvas(256, 256);
      x.strokeStyle = '#e8e4d8';
      x.lineWidth = 12;
      x.beginPath();
      x.arc(128, 128, 110, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = '#e8e4d8';
      x.fillRect(70, 60, 26, 136);
      x.fillRect(160, 60, 26, 136);
      x.fillRect(70, 115, 116, 26);
      return tex(c, true, false);
    })(), transparent: true }));
    H.rotation.x = -Math.PI / 2;
    H.position.set(P.x, 0.01, P.z);
    k.g.add(H);
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      put(k, new THREE.SphereGeometry(0.08, 6, 4), M.glow(i % 2 ? 0x3aff6a : 0xffffff, 2), P.x + Math.cos(ang) * (r - 0.3), 0.08, P.z + Math.sin(ang) * (r - 0.3), 0, false);
    }
    // the rim's guard rail (a ledge: over it is the river)
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      const mx = P.x + Math.cos((a0 + a1) / 2) * r, mz = P.z + Math.sin((a0 + a1) / 2) * r;
      // (open where the jetty meets it)
      if (Math.abs(mx - P.x) < 2.6 && mz > P.z) continue;
      k.solid([mx - 1.4, mx + 1.4, 0, 0.9, mz - 1.4, mz + 1.4].map((v, j) => (j === 0 || j === 1 ? mx + (v - mx) * Math.abs(Math.sin((a0 + a1) / 2)) : j === 4 || j === 5 ? mz + (v - mz) * Math.abs(Math.cos((a0 + a1) / 2)) : v)) as [number, number, number, number, number, number], null, { kind: 'ledge', name: 'pad rail', hidden: true });
    }
    const hc = helicopter();
    hc.group.position.set(DAWN.heli.x, 0, DAWN.heli.z);
    hc.group.rotation.y = Math.PI;
    k.g.add(hc.group);
    k.block([DAWN.heli.x - 1.5, DAWN.heli.x + 1.5, 0, 2.6, DAWN.heli.z - 2.4, DAWN.heli.z + 6.6], 'wall', 'helicopter');
    dawnStage.rotor = hc.rotor;
    dawnStage.heli = hc.group;
    dawnStage.rotorSpeed = 0;
  }

  // ---------------------------------------------------------------------- the river, the far bank, the sun
  const water = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.1, metalness: 0.6, envMapIntensity: 2.2 });
  k.floor(-400, 400, -900, -2, water, { y: -1.4, paint: false, tile: 30 });
  for (let i = 0; i < 40; i++) {
    const x = -380 + rng.next() * 760, z = -500 - rng.next() * 250, w = 14 + rng.next() * 30, h = 10 + rng.next() * 70;
    put(k, new THREE.BoxGeometry(w, h, w), Md.paint(0x4a4650, 0.9, 0), x, h / 2 - 1.4, z, rng.next(), false);
  }
  const sun = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false }));
  sun.position.set(140, 8, -560);
  sun.lookAt(0, 0, 0);
  k.g.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffb070, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunGlow.scale.set(180, 120, 1);
  sunGlow.position.copy(sun.position).add(new THREE.Vector3(0, 0, 2));
  k.g.add(sunGlow);

  const hemi = new THREE.HemisphereLight(0xc8b8c8, 0x5a4a48, 1.35);
  k.g.add(hemi);
  const key = k.keyLight(0xffc890, 1.25, new THREE.Vector3(0.6, 0.35, -1), 34);
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(0, 2, -10),
    update: (dt) => {
      if (dawnStage.rotor) dawnStage.rotor.rotation.y += dt * dawnStage.rotorSpeed;
      // the sun climbs as the chapter goes (the script sets it): warmer, brighter
      // (it clears the far bank's towers by the end: low and gold at first, then up over the river)
      const s = dawnStage.sun;
      sun.position.y = 22 + s * 70;
      sunGlow.position.y = sun.position.y;
      key.intensity = 1.25 + s * 0.55;
      hemi.intensity = 1.35 + s * 0.45;
    },
  });
  return parts;
}
