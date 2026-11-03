import * as THREE from 'three';
import type { Arena } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { canvas, tex } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { put, signBoard, wire } from './blocks';
import { RNG } from '../../core/math';
import { buildApartment } from '../apartment';

/**
 * MERIDIAN TOWER, the top of it: chapter four's level. The service lift opens on floor 57 - bare
 * concrete, the edges open to the rain, work lights on stands, the stairs up chained shut - so out
 * over the edge onto the scaffold (the city two hundred metres down), along the planks and up its
 * ladder to the gap where a pane of 58's glass is still missing. Floor 58 is the private floor:
 * fitted out but not finished, its security office and its screens, the service stairs up to the
 * penthouse's back corridor - and the penthouse itself, where the viewing is.
 *
 * The penthouse is the endless mode's (its floor at 0); 58 at -4.6 and 57 at -9.2 under it. x east,
 * z south; north is the glass and the city.
 */
export const MERIDIAN = {
  site: -9.2,
  f58: -4.6,
  foot: { x0: -16, x1: 31, z0: -14, z1: 22 },
  lift: { x: 20, z: 19.8, yaw: Math.PI },
  stairDoor57: { x: 27.6, z: 17.2 },
  edgeGap: { x0: -7, x1: -3 },
  ladder: { x: 6.0, z: -14.6, yaw: Math.PI },
  pane: { x0: 7.5, x1: 11 },
  secOffice: { x: -11, z: 15 },
  screens: { x: -15.85, z: 15 },
  stairs: { x0: 26.8, x1: 29.2, z0: 9.5, z1: 15.5 },
  corridor: { x0: 14, x1: 23, z0: 6.5, z1: 8.5 },
  serviceDoor: { x: 13, z: 7.5 },
  privateLift: { x: 4.5, z: 11 },
};

/** The monitors in 58's security office: a grid of grey camera feeds, one of them the penthouse. */
export const meridianStage = {
  screens: null as THREE.MeshBasicMaterial | null,
  /** 0 the plain feeds, 1 the viewing (the stage, a girl on it). */
  feed: 0,
};

function screensTexture(viewing: boolean) {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#05070a';
  x.fillRect(0, 0, 512, 256);
  const rng = new RNG(viewing ? 9 : 8);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 4; i++) {
      const px = 6 + i * 126, py = 6 + j * 83;
      const g = x.createLinearGradient(px, py, px, py + 76);
      const big = viewing && i === 1 && j === 1;
      g.addColorStop(0, big ? '#3a2a20' : '#1a2228');
      g.addColorStop(1, big ? '#6a4a30' : '#2a343a');
      x.fillStyle = g;
      x.fillRect(px, py, 120, 76);
      // shapes: a corridor's lines, a door, people
      x.strokeStyle = 'rgba(200,220,220,0.25)';
      x.beginPath();
      x.moveTo(px + 10, py + 70);
      x.lineTo(px + 50 + rng.next() * 20, py + 30);
      x.lineTo(px + 110, py + 70);
      x.stroke();
      if (big) {
        // the stage: a lit girl, red hair, guests' heads in silhouette
        x.fillStyle = '#e0b8a0';
        x.fillRect(px + 56, py + 24, 8, 30);
        x.fillStyle = '#8a2a1a';
        x.fillRect(px + 55, py + 18, 10, 8);
        x.fillStyle = '#0a0a0a';
        for (let k = 0; k < 6; k++) x.fillRect(px + 10 + k * 18, py + 60, 12, 16);
      }
      x.fillStyle = '#c8e8c8';
      x.font = '9px monospace';
      x.fillText(big ? 'PH-01 · VIEWING · REC' : `CAM ${String(j * 4 + i + 1).padStart(2, '0')}`, px + 4, py + 11);
    }
  return tex(c, true, false);
}

export function buildMeridian(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  // ---- the penthouse, as the endless mode builds it
  const ap = buildApartment(a, blood, Math.max(1, pointLights - 1), shadowMapSize);
  ap.moon.removeFromParent();
  ap.moon.target?.removeFromParent();
  // (its service door opens onto the back corridor now: no dark box behind it, no gate across it)
  a.obstacles = a.obstacles.filter((o) => !(o.name === 'gate' && o.ghost && o.minX > 12));
  a.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && !Array.isArray(mat) && mat.side === THREE.BackSide && mat.color?.getHex() === 0x050506 && m.position.x > 13) m.visible = false;
  });
  const F = MERIDIAN.foot;
  const k = new LevelKit(a, blood, Math.max(2, pointLights - 1), shadowMapSize, { bounds: { minX: -24, maxX: 36, minZ: -22, maxZ: 30 }, density: 0.6 });
  k.ambientLight = 0.14;
  const M = new Materials(blood, false);
  const Mw = new Materials(blood, true);
  const rng = new RNG(6161);
  a.camBounds = { out: 0, maxY: 4.0, walls: true };
  a.fallDeath = 4;
  // the drop all round; the floors are what's built
  a.pits.push({ minX: -40, maxX: 50, minZ: -40, maxZ: 40 });
  a.groundRect = { minX: -13.4, maxX: 13.4, minZ: -11.4, maxZ: 11.4 };
  const S57 = MERIDIAN.site, S58 = MERIDIAN.f58;
  const concrete = M.concrete(0x8a8884);
  const rawFloor = M.concreteFloor();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8aa0b8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const iron = M.iron();
  const hiVis = M.paint(0xd8a020, 0.6, 0.1);

  // ---------------------------------------------------------------------- the penthouse's floor, and what's over 58 elsewhere
  k.block([-13.4, 13.4, -0.4, 0, -11.4, 11.4], 'crate', 'penthouse floor', true);
  k.solid([F.x0, F.x1, -0.4, 0, -14, -11.4], concrete, { kind: false });
  k.solid([F.x0, -13.4, -0.4, 0, -11.4, F.z1], concrete, { kind: false });
  k.solid([13.4, F.x1, -0.4, 0, -11.4, F.z1], concrete, { kind: false });
  k.solid([-13.4, 13.4, -0.4, 0, 11.4, F.z1], concrete, { kind: false });

  // ---------------------------------------------------------------------- the back corridor and the service stairs
  {
    const C = MERIDIAN.corridor;
    k.deck(C.x0, C.x1, C.z0, C.z1, 0, M.slabs(), null, { thick: 0.4, name: 'corridor' });
    k.solid([C.x0, C.x1, 0, 3.0, C.z0 - 0.2, C.z0], M.paint(0xd8d4cc, 0.8, 0), { kind: 'wall' });
    k.solid([C.x0, C.x1, 0, 3.0, C.z1, C.z1 + 0.2], M.paint(0xd8d4cc, 0.8, 0), { kind: 'wall' });
    k.solid([C.x0, C.x1, 3.0, 3.2, C.z0 - 0.2, C.z1 + 0.2], M.paint(0xe8e4dc, 0.8, 0), { kind: false });
    for (let x = C.x0 + 2; x < C.x1; x += 3) k.spot([x, 2.7, 7.5], 0xfff4e0, 8, 5);
    signBoard(k, 'SERVICE · STAFF ONLY', C.x0 + 0.5, 2.3, C.z0 + 0.02, 0, 1.6, 0.25, { bg: '#e8e4dc', fg: '#2a2a2a' });
    // the stair core: its top landing at the penthouse's level, the flight down to 58
    const St = MERIDIAN.stairs;
    k.deck(23, 31, 6, St.z0, 0, M.slabs(), concrete, { thick: 0.4, name: 'landing' });
    k.stairs(St.x0, St.x1, St.z0, St.z1, 'z', S58, 0, concrete, { dir: -1 });
    k.solid([St.x0 - 0.2, St.x0, S58, 1.1, St.z0, St.z1], null, { kind: 'wall', name: 'stair rail', hidden: true });
    put(k, new THREE.BoxGeometry(0.05, 0.05, St.z1 - St.z0 + 0.6), iron, St.x0 - 0.1, S58 / 2 + 1.0, (St.z0 + St.z1) / 2, 0, false);
    // the core's walls, all the way down to 57
    for (const b of [[23, 31, S57, 3.2, -0.6, 0], [23, 23.2, S57, 3.2, 0, 6.5], [23, 23.2, S57, 3.2, 8.5, 17.4], [30.8, 31, S57, 3.2, 0, 17.4], [23, 26.6, S57, 3.2, 17.4, 17.6], [28.6, 31, S57, 3.2, 17.4, 17.6]] as [number, number, number, number, number, number][]) {
      k.solid(b, concrete, { kind: 'wall', name: 'core' });
    }
    // (58's way out of the core, and 57's: chained)
    k.solid([23, 23.2, S58, S58 + 2.3, 15.5, 17.4], null, { kind: false });
    k.spot([27, S58 + 3.6, 12], 0xd8e0ff, 10, 6, { flicker: 0.1 });
    k.spot([27, 2.6, 7.5], 0xfff0d8, 10, 6);
  }

  // ---------------------------------------------------------------------- floor 58: the private floor
  {
    // the slab, round the stair core's hole
    const St = MERIDIAN.stairs;
    k.deck(F.x0, F.x1, F.z0, St.z0, S58, M.slabs(), null, { thick: 0.4, dense: true, name: '58' });
    k.deck(F.x0, St.x0, St.z0, F.z1, S58, M.slabs(), null, { thick: 0.4, dense: true, name: '58' });
    k.deck(St.x1, F.x1, St.z0, F.z1, S58, M.slabs(), null, { thick: 0.4, name: '58' });
    k.deck(St.x0, St.x1, St.z1, F.z1, S58, M.slabs(), null, { thick: 0.4, name: '58' });
    // its glass skin (north, west and south; the core's on the east), one pane on the north still out
    const P = MERIDIAN.pane;
    const pane = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.2), glassMat);
      m.position.set((x0 + x1) / 2, S58 + 2.1, (z0 + z1) / 2);
      m.rotation.y = Math.atan2(z1 - z0, x1 - x0) * -1;
      k.g.add(m);
      const ob = k.block([Math.min(x0, x1) - 0.06, Math.max(x0, x1) + 0.06, S58, S58 + 4.2, Math.min(z0, z1) - 0.06, Math.max(z0, z1) + 0.06], 'wall', 'glass');
      if (ob) ob.seeThrough = true;
    };
    pane(F.x0, F.z0, P.x0, F.z0);
    pane(P.x1, F.z0, F.x1, F.z0);
    pane(F.x0, F.z0, F.x0, F.z1);
    pane(F.x0, F.z1, 23, F.z1);
    for (let x = F.x0; x <= F.x1; x += 2.35) put(k, new THREE.BoxGeometry(0.08, 4.2, 0.1), iron, x, S58 + 2.1, F.z0, 0, false);
    // plastic sheeting over the missing pane, flapping
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0 - 0.3, 3.6), new THREE.MeshStandardMaterial({ color: 0xd8dce0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.6 }));
    sheet.position.set((P.x0 + P.x1) / 2 + 0.6, S58 + 2.2, F.z0 + 0.2);
    k.g.add(sheet);
    k.updates.push(() => {
      const t = performance.now() / 1000;
      sheet.rotation.x = 0.25 + Math.sin(t * 2.3) * 0.18 + Math.sin(t * 5.1) * 0.06;
    });
    // the security office (west): its walls, the bank of monitors, a desk, a coffee machine
    const O = MERIDIAN.secOffice;
    k.solid([-7.5, -7.3, S58, S58 + 3.0, 9, F.z1], M.paint(0x6a6a70, 0.6, 0.1), { kind: 'wall', name: 'office' });
    k.solid([F.x0, -10.4, S58, S58 + 3.0, 9, 9.2], M.paint(0x6a6a70, 0.6, 0.1), { kind: 'wall', name: 'office' });
    k.solid([-8.8, -7.3, S58, S58 + 3.0, 9, 9.2], M.paint(0x6a6a70, 0.6, 0.1), { kind: 'wall', name: 'office' });
    const scr = new THREE.MeshBasicMaterial({ map: screensTexture(false) });
    const screens = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.5), scr);
    screens.position.set(MERIDIAN.screens.x, S58 + 1.9, MERIDIAN.screens.z);
    screens.rotation.y = Math.PI / 2;
    k.g.add(screens);
    meridianStage.screens = scr;
    meridianStage.feed = 0;
    k.solid([F.x0 + 0.4, F.x0 + 1.2, S58, S58 + 0.78, O.z - 2.4, O.z + 2.4], M.paint(0x2a2a2e, 0.5, 0.3), { kind: 'crate', name: 'desk' });
    k.spot([F.x0 + 1.6, S58 + 2.0, O.z], 0x8ab0d0, 12, 6);
    k.spot([O.x + 2, S58 + 2.9, O.z + 3], 0xe8f0ff, 10, 6);
    // the private lift's lobby (south): gold doors, a marble floor, a console
    const L = MERIDIAN.privateLift;
    const gold = M.paint(0xb89040, 0.3, 0.85);
    k.solid([L.x - 2.2, L.x + 2.2, S58, S58 + 3.2, F.z1 - 0.4, F.z1], M.paint(0x2a2622, 0.4, 0.2), { kind: 'wall', name: 'lift wall' });
    put(k, new THREE.BoxGeometry(1.6, 2.4, 0.05), gold, L.x, S58 + 1.2, F.z1 - 0.43, 0, false);
    put(k, new THREE.BoxGeometry(0.02, 2.4, 0.06), M.dark(), L.x, S58 + 1.2, F.z1 - 0.46, 0, false);
    signBoard(k, 'PH · 59–61', L.x, S58 + 2.75, F.z1 - 0.44, Math.PI, 0.9, 0.22, { bg: '#100c08', fg: '#d8b060', lit: true });
    k.spot([L.x, S58 + 3.2, F.z1 - 2], 0xffe0b0, 14, 6);
    // fitting out: plastic-wrapped sofas, crates of marble, paint, step-ladders, work lights
    for (const [x, z, w, d, h, c] of [[-2, -6, 2.4, 1.0, 0.85, 0xd8d8d8], [4, -6, 2.4, 1.0, 0.85, 0xd8d8d8], [12, 2, 1.4, 2.4, 1.0, 0x8a7a68], [-4, 4, 1.6, 1.2, 0.9, 0x8a7a68], [16, -8, 1.2, 1.2, 1.1, 0x9a9a9a], [-12, -8, 1.8, 0.9, 0.85, 0xd8d8d8]] as [number, number, number, number, number, number][]) {
      k.solid([x - w / 2, x + w / 2, S58, S58 + h, z - d / 2, z + d / 2], M.paint(c, 0.5, 0.05), { kind: 'crate', name: 'wrapped' });
    }
    for (const [x, z] of [[8, 4], [-8, 0], [18, 12]] as [number, number][]) {
      put(k, new THREE.CylinderGeometry(0.14, 0.13, 0.36, 10), M.paint(0xe8e8e8, 0.6, 0.1), x, S58 + 0.18, z);
      put(k, new THREE.CylinderGeometry(0.14, 0.13, 0.36, 10), M.paint(0xe8e8e8, 0.6, 0.1), x + 0.4, S58 + 0.18, z + 0.1);
    }
    // its lights: downlights in the finished bits, a work light in the rest
    for (const [x, z, c, i] of [[-4, -8, 0xfff0d8, 16], [6, -8, 0xfff0d8, 16], [0, 4, 0xfff0d8, 14], [10, 8, 0xd8e0ff, 18], [18, -4, 0xd8e0ff, 18], [-12, 2, 0xfff0d8, 12], [14, 16, 0xfff0d8, 14]] as [number, number, number, number][]) {
      k.spot([x, S58 + 3.6, z], c, i, 9);
    }
    // a column grid holding the penthouse up
    for (const x of [-12, -4, 4, 12, 20]) for (const z of [-10, -2, 6, 14]) {
      if ((x === -12 && z === 14) || (x === 20 && z === 14)) continue;
      k.solid([x - 0.4, x + 0.4, S58, -0.4, z - 0.4, z + 0.4], M.paint(0xc8c4bc, 0.7, 0.05), { kind: 'pillar', name: 'column' });
    }
  }

  // ---------------------------------------------------------------------- floor 57: the site
  {
    const L = MERIDIAN.lift;
    k.deck(F.x0, F.x1, F.z0, F.z1, S57, rawFloor, concrete, { thick: 0.5, dense: true, name: '57' });
    // 58's slab overhead, seen from below; the columns all the way up
    for (const x of [-12, -4, 4, 12, 20]) for (const z of [-10, -2, 6, 14]) {
      if ((x === -12 && z === 14) || (x === 20 && z === 14)) continue;
      k.solid([x - 0.45, x + 0.45, S57, S58 - 0.4, z - 0.45, z + 0.45], concrete, { kind: 'pillar', name: 'column' });
    }
    // the edge: a scaffold-board rail (bodies go over it), open where the scaffold's reached
    const G = MERIDIAN.edgeGap;
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      k.solid([Math.min(x0, x1), Math.max(x0, x1), S57, S57 + 1.0, Math.min(z0, z1), Math.max(z0, z1)], null, { kind: 'ledge', name: 'edge rail', hidden: true });
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (const y of [0.5, 1.0]) put(k, new THREE.BoxGeometry(x0 === x1 ? 0.06 : len, 0.12, x0 === x1 ? len : 0.06), hiVis, (x0 + x1) / 2, S57 + y, (z0 + z1) / 2, 0, false);
      for (let t = 0; t <= len; t += 2.4) put(k, new THREE.BoxGeometry(0.06, 1.05, 0.06), iron, x0 + ((x1 - x0) * t) / len, S57 + 0.52, z0 + ((z1 - z0) * t) / len, 0, false);
    };
    rail(F.x0, F.z0 + 0.05, G.x0, F.z0 + 0.05);
    rail(G.x1, F.z0 + 0.05, F.x1, F.z0 + 0.05);
    rail(F.x0 + 0.05, F.z0, F.x0 + 0.05, F.z1);
    rail(F.x0, F.z1 - 0.05, 18, F.z1 - 0.05);
    // the service lift (south-east): the car she arrives in, its doors open onto the floor
    k.solid([18, 18.2, S57, S57 + 2.8, 18.4, 21.8], M.steel(), { kind: 'wall', name: 'lift' });
    k.solid([21.8, 22, S57, S57 + 2.8, 18.4, 21.8], M.steel(), { kind: 'wall', name: 'lift' });
    k.solid([18, 22, S57, S57 + 2.8, 21.8, 22], M.steel(), { kind: 'wall', name: 'lift' });
    k.solid([18, 22, S57 + 2.8, S57 + 3.0, 18.4, 22], M.steel(), { kind: false });
    put(k, new THREE.BoxGeometry(0.6, 0.12, 0.02), M.glow(0xff6a3a, 1.6), L.x + 1.2, S57 + 2.4, 21.78, 0, false);
    k.spot([L.x, S57 + 2.6, 20], 0xe8f0ff, 8, 4);
    // the stairs up: chained, a sign
    const D = MERIDIAN.stairDoor57;
    k.solid([26.6, 28.6, S57, S57 + 2.3, 17.42, 17.58], M.paint(0x4a5a4a, 0.5, 0.5), { kind: 'wall', name: 'stair door' });
    signBoard(k, 'STAIRS CLOSED ABOVE 57 · USE THE HOIST', D.x, S57 + 2.5, 17.38, Math.PI, 2.2, 0.32, { bg: '#d8a020', fg: '#141414' });
    wire(k, M, new THREE.Vector3(26.7, S57 + 1.2, 17.36), new THREE.Vector3(28.5, S57 + 1.2, 17.36), 0.15);
    // the site's clutter: rebar bundles, cement bags on pallets, plywood, a mixer, cable drums, the site office
    for (const [x, z] of [[-10, -6], [2, 10], [8, -10], [-6, 14]] as [number, number][]) {
      k.solid([x - 1.6, x + 1.6, S57, S57 + 0.5, z - 0.4, z + 0.4], M.rust(), { kind: 'crate', name: 'rebar' });
    }
    for (const [x, z] of [[-14, 0], [14, -6], [0, -4], [10, 14]] as [number, number][]) {
      k.solid([x - 0.6, x + 0.6, S57, S57 + 0.9, z - 0.5, z + 0.5], M.paint(0xb8b0a0, 0.9, 0), { kind: 'crate', name: 'cement' });
    }
    for (const [x, z] of [[-2, 18], [6, 2]] as [number, number][]) k.solid([x - 1.2, x + 1.2, S57, S57 + 1.1, z - 0.6, z + 0.6], M.wood(), { kind: 'crate', name: 'plywood' });
    put(k, new THREE.CylinderGeometry(0.55, 0.45, 1.2, 12).rotateZ(0.5), M.paint(0xd86a20, 0.6, 0.3), 16, S57 + 1.0, 4);
    k.block([15.2, 16.8, S57, S57 + 1.6, 3.2, 4.8], 'prop', 'mixer');
    // the site office: a container on the floor, lit, a kettle inside
    k.solid([-15.6, -9.6, S57, S57 + 2.6, 15, 21.6], M.container('blue'), { kind: 'wall', name: 'site office' });
    put(k, new THREE.BoxGeometry(1.0, 1.2, 0.05), M.glow(0xffe0a0, 0.9), -9.58, S57 + 1.5, 18, Math.PI / 2, false);
    // work lights on stands: the floor's only light, pools of it with the dark between
    for (const [x, z, ry] of [[-8, -10, 0.6], [10, -2, -2.2], [-12, 8, 1.6], [14, 12, 3.6], [2, 16, 3.1]] as [number, number, number][]) {
      put(k, new THREE.CylinderGeometry(0.03, 0.04, 1.8, 6), iron, x, S57 + 0.9, z, 0, false);
      put(k, new THREE.BoxGeometry(0.4, 0.3, 0.12), M.glow(0xfff8e8, 2.2), x, S57 + 1.85, z, ry, false);
      k.spot([x + Math.sin(ry) * 0.6, S57 + 1.9, z + Math.cos(ry) * 0.6], 0xfff4e0, 22, 9);
    }
    // plastic sheeting hung in a couple of bays, moving in the wind
    for (const [x, z] of [[-4, -10], [12, -10]] as [number, number][]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.8).translate(0, -1.9, 0), new THREE.MeshStandardMaterial({ color: 0xe0e4e8, transparent: true, opacity: 0.3, side: THREE.DoubleSide, roughness: 0.6 }));
      m.position.set(x, S58 - 0.5, z);
      k.g.add(m);
      const ph = rng.next() * 6;
      k.updates.push(() => {
        const t = performance.now() / 1000 + ph;
        m.rotation.x = Math.sin(t * 1.6) * 0.14 + Math.sin(t * 4.1) * 0.04;
      });
    }
  }

  // ---------------------------------------------------------------------- the scaffold (north face, outside)
  {
    // (the boards run in under the slab's edge a little: no crack between them to step into)
    const z0 = -15.5, z1 = -13.95;
    // the planks at 57 and at 58 (the upper one has a hatch for the ladder)
    k.deck(-11, 13, z0, z1, S57, Mw.planksFloor(), Mw.wood(), { thick: 0.1, name: 'scaffold' });
    const Ld = MERIDIAN.ladder;
    k.deck(-11, Ld.x - 0.8, z0, z1, S58, Mw.planksFloor(), Mw.wood(), { thick: 0.1, name: 'scaffold' });
    k.deck(Ld.x + 0.8, 13, z0, z1, S58, Mw.planksFloor(), Mw.wood(), { thick: 0.1, name: 'scaffold' });
    k.deck(Ld.x - 0.8, Ld.x + 0.8, z0, Ld.z - 0.35, S58, Mw.planksFloor(), Mw.wood(), { thick: 0.1, name: 'scaffold' });
    k.ladder(Ld.x, Ld.z, Ld.yaw, S57, S58, iron);
    // the tubes: standards every couple of metres, ledgers, the outer guard rails (ledges: over is down)
    for (let x = -11; x <= 13; x += 2) {
      put(k, new THREE.CylinderGeometry(0.03, 0.03, 9.6, 6), iron, x, S57 + 4.2, z0, 0, true);
      put(k, new THREE.CylinderGeometry(0.03, 0.03, 9.6, 6), iron, x, S57 + 4.2, z1 - 0.05, 0, false);
    }
    for (const y of [S57 + 0.5, S57 + 1.0, S58 + 0.5, S58 + 1.0]) put(k, new THREE.CylinderGeometry(0.025, 0.025, 24, 6).rotateZ(Math.PI / 2), iron, 1, y, z0, 0, false);
    k.solid([-11, 13, S57, S57 + 1.05, z0 - 0.1, z0], null, { kind: 'ledge', name: 'scaffold rail', hidden: true });
    k.solid([-11, 13, S58, S58 + 1.05, z0 - 0.1, z0], null, { kind: 'ledge', name: 'scaffold rail', hidden: true });
    k.solid([-11.1, -11, S57, S58 + 1.05, z0, z1], null, { kind: 'ledge', name: 'scaffold rail', hidden: true });
    k.solid([13, 13.1, S57, S58 + 1.05, z0, z1], null, { kind: 'ledge', name: 'scaffold rail', hidden: true });
    // netting on the outside, torn in places
    const net = new THREE.Mesh(new THREE.PlaneGeometry(24, 9.4), new THREE.MeshBasicMaterial({ color: 0x2a5a8a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(1, S57 + 4.4, z0 - 0.06);
    k.g.add(net);
    k.spot([-6, S57 + 2.2, -14.8], 0xffb070, 10, 7, { flicker: 0.2 });
    k.spot([8, S58 + 2.2, -14.8], 0xffb070, 10, 7);
    // the rain out here (and the wind in it)
    k.rain({ count: 1400, w: 26, h: 12, when: () => a.focus.z < -13.6 || a.focus.x < F.x0 + 0.5 || a.focus.x > F.x1 - 0.5 });
  }

  // ---------------------------------------------------------------------- the tower's crane, beside it in the rain
  {
    const cx = 36, cz = -6;
    put(k, new THREE.BoxGeometry(1.6, 70, 1.6), M.paint(0xc89020, 0.6, 0.4), cx, S57 - 25, cz, 0, false);
    put(k, new THREE.BoxGeometry(60, 1.2, 1.2), M.paint(0xc89020, 0.6, 0.4), cx - 18, S57 + 11, cz, 0, false);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010, fog: false }));
    red.position.set(cx - 48, S57 + 11.8, cz);
    k.g.add(red);
    k.updates.push(() => (red.visible = Math.floor(performance.now() / 800) % 2 === 0));
  }

  const hemi = ap.hemi;
  hemi.intensity = Math.max(hemi.intensity, 0.9);
  const key = k.keyLight(0x9ab4e8, 0.9, new THREE.Vector3(-0.3, 1, -1.2), 26);
  void key;
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(6, S58 + 1.6, 0),
    update: (dt) => {
      ap.update?.(dt);
      const scr = meridianStage.screens;
      if (scr && scr.userData.feed !== meridianStage.feed) {
        scr.userData.feed = meridianStage.feed;
        scr.map = screensTexture(meridianStage.feed === 1);
        scr.needsUpdate = true;
      }
    },
  });
  return { ...parts, dust: ap.dust, dressing: ap.dressing };
}
