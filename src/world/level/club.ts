import * as THREE from 'three';
import { Arena, Obstacle } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { canvas, tex } from '../mapKit';
import { LevelKit, LightSpot } from './kit';
import { Materials } from './materials';
import { put, signBoard, wallLamp, neonSign } from './blocks';
import { RNG } from '../../core/math';
import { buildCity, skyTexture } from '../city';
import { CLUB_BEAT } from '../../anim/lib/dance';

/**
 * THE LANTERN, inside: chapter two's level. In off Kessler Street through the lobby (the coat
 * check, the curtain) into the hall - a dance floor of lit tiles under a rig of moving beams and a
 * mirror ball, the DJ up on his stage at the west end, the long bar along the north wall; the VIP
 * gallery round the south side, up a flight of stairs with a rope and a man on it; the office off
 * the gallery's west end, where the books are kept, and a ladder from it to the roof.
 *
 * Behind the hall, through the staff door under the gallery: the back corridor, the staff room
 * (the lockers - Ivy's is number six) and the keg room under the office, with a ladder up through a
 * trapdoor in the office floor.
 *
 * x east, z south. The hall: x -14..14, z -14..14, its gallery z 8.5..14 at 3.6 m. The lobby: x
 * 16..28, z -5..6. The office: x -14..-5, z 14..22 at 3.6 m, the keg room under it. The back
 * corridor z 16..17.5 and the staff room z 17.7..22, x -4..6. The roof: 9.2 m.
 */
export const CLUB = {
  start: { x: 25.6, z: 0.6, yaw: -Math.PI / 2 },
  streetDoor: { x: 28.6, z: 0.6 },
  bouncer: { x: 26.9, z: -1.0 },
  coatCheck: { x: 18.3, z: -3.2 },
  hallMouth: { x: 15, z: 0 },
  galleryY: 3.6,
  stairFoot: { x: 12, z: 0.2 },
  ropeHost: { x: 9.3, z: 0.6 },
  bar: { x0: -8, x1: 8, z: -12.2 },
  bartender: { x: 0.6, z: -13.25 },
  barFront: { x: 0.6, z: -11.15 },
  djBooth: { x: -11.8, z: 0 },
  staffDoor: { x: -2.0, z: 14 },
  doorGuard: { x: -2.0, z: 12.9 },
  corridor: { x0: -4, x1: 6, z0: 16, z1: 17.5 },
  staffRoomDoor: { x: 0.6, z: 17.6 },
  locker: { x: -0.2, z: 21.2 },
  kegDoor: { x: -4.5, z: 16.7 },
  trapLadder: { x: -12.15, z: 14.7 },
  officeDoor: { x: -10.5, z: 14 },
  safe: { x: -13.2, z: 19.5 },
  desk: { x: -8.6, z: 18.5 },
  ladder: { x: -5.4, z: 21.2 },
  roofY: 9.2,
  roofEdge: { x: 14.6, z: -15.4 },
};

/** The club's moving parts, for the chapter's script. */
export const clubStage = {
  /** The alarm's gone off: the house lights up, the rig and the floor dark, the beacons turning. */
  alarm: false,
  rope: null as THREE.Group | null,
  ropeOb: null as Obstacle | null,
  locker: null as THREE.Object3D | null,
  lockerWant: 0,
  lockerOpen: 0,
  safeDoor: null as THREE.Object3D | null,
  safeWant: 0,
  safeOpen: 0,
  /** Lights that only come on with the alarm, and the ones it puts out. */
  house: [] as LightSpot[],
  rigLights: [] as LightSpot[],
  beacons: [] as THREE.Object3D[],
  /** The track's clock (the floor, the beams and the dancers keep to it). */
  t: 0,
};

/** Unhook the rope at the foot of the VIP stairs. */
export function openRope(a: Arena) {
  const r = clubStage.rope;
  if (r) {
    // (the last post swung round against the rail, the rope hanging off it)
    r.rotation.y = -1.35;
  }
  if (clubStage.ropeOb) {
    a.obstacles = a.obstacles.filter((o) => o !== clubStage.ropeOb);
    clubStage.ropeOb = null;
    a.heightsChanged();
  }
}
export function setAlarm(on: boolean) {
  clubStage.alarm = on;
  for (const s of clubStage.house) s.off = !on;
  for (const s of clubStage.rigLights) s.off = on;
}

export function buildClub(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  clubStage.alarm = false;
  clubStage.house = [];
  clubStage.rigLights = [];
  clubStage.beacons = [];
  clubStage.lockerWant = clubStage.lockerOpen = clubStage.safeWant = clubStage.safeOpen = 0;
  const k = new LevelKit(a, blood, pointLights, shadowMapSize, { bounds: { minX: -22, maxX: 31, minZ: -26, maxZ: 28 }, density: 0.85 });
  k.ambientLight = 0.3;
  const M = new Materials(blood, false);
  const rng = new RNG(707);
  a.fog = { color: 0x120a18, density: 0.026 };
  a.background = skyTexture(23);
  a.camBounds = { out: 0, maxY: 14, walls: true };
  a.farPlane = 280;
  a.drains = [];
  const G = CLUB.galleryY;
  // (nothing loose from the warehouse: the club's own bottles, crates and empties)
  a.propSpots = { drums: [], crates: [] };
  a.propList = [
    ...[-6.2, -3.9, -1.1, 1.8, 4.3, 6.6].map((x, i) => ({ kind: 'bottle', x, z: CLUB.bar.z + (i % 2 ? 0.18 : -0.12), y: 1.18 })),
    ...[-11, -5.5, 0, 5.5].flatMap((x) => [{ kind: 'bottle', x: x - 0.2, z: 11.55, y: G + 0.42 }, { kind: 'bottle', x: x + 0.15, z: 11.7, y: G + 0.42 }]),
    { kind: 'bottle', x: CLUB.desk.x + 0.35, z: CLUB.desk.z + 0.2, y: G + 0.78 },
    { kind: 'milkcrate', x: 3.2, z: 17.05 }, { kind: 'milkcrate', x: 3.2, z: 17.05, y: 0.3 },
    { kind: 'box', x: -13.4, z: 15.3, ry: 0.3 }, { kind: 'box', x: -13.5, z: 15.9, ry: 0.1 }, { kind: 'box', x: -7.6, z: 21.5, ry: 0.4 },
    { kind: 'stool', x: 5.6, z: 18.9 }, { kind: 'stool', x: 5.6, z: 20.4 },
  ];
  const R = CLUB.roofY;
  const panel = M.paint(0x6a4a54, 0.5, 0.15);
  const darkWall = M.paint(0x4a3a42, 0.7, 0.05);
  const backWall = M.paint(0x8a8480, 0.8, 0.05);
  const gold = M.paint(0xb8903a, 0.3, 0.85);
  const velvet = M.paint(0x4a0a14, 0.85, 0);
  const black = M.paint(0x0c0c0e, 0.6, 0.2);

  // ---------------------------------------------------------------------- the shell
  k.solid([-17, -14, 0, R, -17, 24], darkWall, { kind: 'wall' });
  k.solid([-17, 16, 0, R, -17, -14], darkWall, { kind: 'wall' });
  k.solid([14, 16, 0, R, -16, -5], darkWall, { kind: 'wall' });
  k.solid([14, 16, 0, R, 5, 14], darkWall, { kind: 'wall' });
  k.solid([14, 16, 3.2, R, -5, 5], darkWall, { kind: 'wall' });
  // the hall's south wall (behind the gallery), the staff door through it at the bottom
  k.solid([-5, -2.6, 0, R, 14, 16], darkWall, { kind: 'wall' });
  k.solid([-1.4, 16, 0, R, 14, 16], darkWall, { kind: 'wall' });
  k.solid([-2.6, -1.4, 2.3, R, 14, 16], darkWall, { kind: 'wall' });
  // the back of the building
  k.solid([-17, 16, 0, R, 22, 24], darkWall, { kind: 'wall' });
  k.solid([6, 16, 0, R, 16, 22], darkWall, { kind: 'wall', name: 'back block' });
  // the keg room (and the office over it): its wall on the hall, the door from the back corridor
  k.solid([-14, -5, 0, G, 13.9, 14.1], darkWall, { kind: 'wall', name: 'keg room wall' });
  k.solid([-5, -4, 0, R, 17.4, 22], darkWall, { kind: 'wall' });
  k.solid([-5, -4, 2.3, R, 16, 17.4], darkWall, { kind: 'wall' });
  // the corridor's and the staff room's ceiling, the corridor's south wall and the staff room's door
  k.solid([-4, 6, 3.4, 3.7, 16, 22], M.concrete(0x4a4644), { kind: false });
  k.solid([-4, 0, 0, 3.4, 17.5, 17.7], backWall, { kind: 'wall' });
  k.solid([1.2, 6, 0, 3.4, 17.5, 17.7], backWall, { kind: 'wall' });
  k.solid([0, 1.2, 2.3, 3.4, 17.5, 17.7], backWall, { kind: 'wall' });
  // the lobby: its own box east of the hall, the street doors on its east wall
  k.solid([16, 30, 0, 4.2, -7, -5], darkWall, { kind: 'wall' });
  k.solid([16, 30, 0, 4.2, 6, 8], darkWall, { kind: 'wall' });
  k.solid([28, 30, 0, 4.2, -5, -1.3], darkWall, { kind: 'wall' });
  k.solid([28, 30, 0, 4.2, 2.5, 6], darkWall, { kind: 'wall' });
  k.solid([16, 30, 3.8, 4.4, -7, 8], M.concrete(0x2a2628), { kind: false });

  // ---------------------------------------------------------------------- the floors
  k.floor(-14, 14, -14, 14, M.concreteFloor(), { tile: 3, dense: true });
  k.floor(16, 28, -5, 6, M.planksFloor(), { tile: 2.4 });
  k.floor(14, 16, -5, 5, M.planksFloor(), { tile: 2.4 });
  k.floor(-2.6, -1.4, 14, 16, M.concreteFloor(), { tile: 3 });
  k.floor(-4, 6, 16, 17.5, M.concreteFloor(), { tile: 3 });
  k.floor(-4, 6, 17.5, 22, M.planksFloor(), { tile: 2.4 });
  k.floor(-5, -4, 16, 17.4, M.concreteFloor(), { tile: 3 });
  k.floor(-14, -5, 14.1, 22, M.concreteFloor(), { tile: 3, dense: true });
  // the lit dance floor: tiles whose colours run with the beat
  const tiles = danceFloor(k, -6, 6, -6, 6);

  // ---------------------------------------------------------------------- the lobby
  {
    k.solid([19, 21.5, 0, 1.1, -4.8, -1.6], M.wood(), { kind: 'crate', name: 'coat check' });
    put(k, new THREE.BoxGeometry(2.6, 0.05, 3.4), gold, 20.25, 1.12, -3.2, 0, false);
    for (let i = 0; i < 9; i++) put(k, new THREE.BoxGeometry(0.06, 0.9, 0.5), M.paint(rng.pick([0x1a1a1e, 0x3a1a1a, 0x2a2a34, 0x5a4a3a]), 0.8, 0), 17.4, 1.9, -4.6 + i * 0.4, 0, false);
    put(k, new THREE.BoxGeometry(0.04, 0.04, 3.8), gold, 17.4, 2.38, -3.0, 0, false);
    const doors = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), new THREE.MeshBasicMaterial({ color: 0x0c1218 }));
    doors.position.set(28.98, 1.4, 0.6);
    doors.rotation.y = -Math.PI / 2;
    k.g.add(doors);
    // (the street through the door's glass: a wash of sodium light)
    const street = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshBasicMaterial({ color: 0x8a5a2a, transparent: true, opacity: 0.35, fog: false }));
    street.position.set(28.95, 1.5, -0.2);
    street.rotation.y = -Math.PI / 2;
    k.g.add(street);
    k.block([28.9, 29, 0, 3, -1.3, 2.5], 'wall', 'street doors');
    for (const z of [-0.8, 2.0]) put(k, new THREE.BoxGeometry(0.1, 2.8, 0.1), gold, 28.9, 1.4, z, 0, false);
    // the curtain (velvet, parted) and the way through
    for (const z of [-3.6, 3.6]) k.solid([15.9, 16.3, 0, 3.2, z - 1.1, z + 1.1], velvet, { kind: 'wall', name: 'curtain' });
    signBoard(k, 'THE LANTERN', 22, 3.0, -4.98, 0, 4.2, 0.9, { bg: '#100808', fg: '#ffb040', lit: true, font: '"Oswald", sans-serif' });
    for (const x of [18, 22, 26]) wallLamp(k, M, x, 3.1, 5.95, Math.PI, { color: 0xffb070, intensity: 26 });
    k.spot([22, 3.2, 0.5], 0xff9a50, 46, 11);
    k.spot([18.5, 3.0, -3.2], 0xffc890, 22, 6);
    // a bench, a potted palm, the cash desk's lamp
    k.solid([24, 26.4, 0, 0.45, 5.2, 5.8], velvet, { kind: 'crate', name: 'bench' });
    put(k, new THREE.CylinderGeometry(0.3, 0.24, 0.6, 12), M.paint(0x2a2a2c, 0.5, 0.3), 27.4, 0.3, 5.2);
    for (let i = 0; i < 6; i++) {
      const lf = new THREE.ConeGeometry(0.1, 1.1, 5);
      lf.rotateZ(0.9);
      lf.rotateY((i / 6) * Math.PI * 2);
      lf.translate(0, 1.0, 0);
      put(k, lf, M.paint(0x2a4a24, 0.8, 0), 27.4, 0, 5.2, 0, false);
    }
  }

  // ---------------------------------------------------------------------- the hall's walls: panelling, trim, the mirror
  for (const [x0, z0, x1, z1] of [[-14, -14, 14, -14], [-14, 14, -14, -14], [14, -14, 14, -5], [14, 5, 14, 14], [14, 14, -1.4, 14], [-2.6, 14, -5, 14], [-5, 13.9, -14, 13.9]] as [number, number, number, number][]) {
    k.paintWall(x0, z0, x1, z1, 0, 3.2, panel, 2, 2.4);
  }
  put(k, new THREE.BoxGeometry(28, 0.1, 0.08), gold, 0, 3.2, -13.96, 0, false);
  put(k, new THREE.BoxGeometry(0.08, 0.1, 28), gold, -13.96, 3.2, 0, 0, false);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(15, 1.6), new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.04, metalness: 1, envMapIntensity: 1.8 }));
  mirror.position.set(0, 2.2, -13.95);
  k.g.add(mirror);
  // sconces down the long walls: pools of warm light between the panels
  for (const x of [-10, -4, 4, 10]) wallLamp(k, M, x, 2.6, -13.9, 0, { color: 0xffb070, intensity: 12 });
  for (const z of [-10, 10]) wallLamp(k, M, 13.9, 2.6, z, -Math.PI / 2, { color: 0xffb070, intensity: 12 });
  // the staff door, its sign, a dim lamp over it
  signBoard(k, 'STAFF ONLY', -2.0, 2.55, 13.98, Math.PI, 1.0, 0.24, { bg: '#c8b030', fg: '#141414' });
  put(k, new THREE.BoxGeometry(1.2, 2.3, 0.06), M.paint(0x2a2a2e, 0.5, 0.5), -2.0, 1.15, 15.2, 0, false);
  k.spot([-2.0, 2.8, 13.4], 0xffd8a0, 4, 3.2);

  // ---------------------------------------------------------------------- the bar (north)
  {
    const B = CLUB.bar;
    k.solid([B.x0, B.x1, 0, 1.12, B.z - 0.45, B.z + 0.45], M.wood(), { kind: 'crate', name: 'bar', climb: true });
    put(k, new THREE.BoxGeometry(B.x1 - B.x0 + 0.3, 0.07, 1.2), M.paint(0x0e0c0c, 0.15, 0.4), 0, 1.15, B.z, 0, false);
    // the back bar: shelves of lit bottles
    const bottles = bottleShelf();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 - 1, 0.55), bottles);
      m.position.set(0, 1.25 + i * 0.62, -13.9);
      k.g.add(m);
      put(k, new THREE.BoxGeometry(B.x1 - B.x0 - 1, 0.04, 0.3), M.glass(0x2a3a3a), 0, 0.96 + i * 0.62, -13.75, 0, false);
    }
    k.block([B.x0, B.x1, 0, 1.0, -14, -13.6], 'prop', 'back bar');
    k.spot([0, 2.6, -12.8], 0xffc890, 24, 9);
    k.spot([-6, 2.6, -12.8], 0xff9a6a, 14, 7);
    k.spot([6, 2.6, -12.8], 0xff9a6a, 14, 7);
    // stools along it, glasses and an ice bucket on it
    for (let x = B.x0 + 0.8; x < B.x1; x += 1.4) {
      put(k, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), M.paint(0x4a0a14, 0.6, 0), x, 0.78, B.z + 0.9, 0, false);
      put(k, new THREE.CylinderGeometry(0.03, 0.04, 0.76, 6), gold, x, 0.38, B.z + 0.9, 0, false);
    }
    for (let i = 0; i < 9; i++) put(k, new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8), M.glass(0x6a7a7a), B.x0 + 1.2 + i * 1.7 + rng.next() * 0.4, 1.24, B.z + (rng.next() - 0.5) * 0.4, 0, false);
    put(k, new THREE.CylinderGeometry(0.14, 0.11, 0.22, 12), M.steel(), 3.2, 1.3, B.z, 0, false);
    // the ends of the bar: a hatch through at the east end (the staff's way in)
    k.solid([B.x1, B.x1 + 0.1, 0, 1.12, -14, B.z - 0.45], M.wood(), { kind: 'wall', name: 'bar end' });
    k.solid([B.x0 - 0.1, B.x0, 0, 1.12, -14, B.z + 0.45], M.wood(), { kind: 'wall', name: 'bar end' });
  }

  // ---------------------------------------------------------------------- strips of light: the bar's front, the gallery's edge, the stage's lip
  {
    const amber = M.glow(0xffa040, 1.6), pink = M.glow(0xff3a8a, 1.4), cyan = M.glow(0x3ac8ff, 1.2);
    put(k, new THREE.BoxGeometry(16, 0.04, 0.04), amber, 0, 0.12, CLUB.bar.z + 0.47, 0, false);
    put(k, new THREE.BoxGeometry(16, 0.03, 0.03), amber, 0, 1.08, CLUB.bar.z + 0.47, 0, false);
    put(k, new THREE.BoxGeometry(24, 0.04, 0.04), pink, -2, G - 0.37, 8.5, 0, false);
    put(k, new THREE.BoxGeometry(0.04, 0.04, 10), cyan, -9.0, 1.0, 0, 0, false);
    put(k, new THREE.BoxGeometry(28, 0.03, 0.03), M.glow(0x9a5aff, 1.0), 0, 0.05, -13.98, 0, false);
    // a soft wash under the gallery (dim: the dark there is the point)
    for (const x of [-10, 0, 9]) k.spot([x, G - 0.6, 11.5], 0x6a3a8a, 5, 6);
  }

  // ---------------------------------------------------------------------- the DJ's stage (west)
  {
    k.deck(-14, -9, -5, 5, 1.0, M.planksFloor(), black, { name: 'stage', dense: true });
    k.stairs(-9, -7.6, -1.2, 1.2, 'x', 0, 1.0, black, { dir: -1 });
    const D = CLUB.djBooth;
    k.solid([D.x + 0.6, D.x + 1.3, 1.0, 2.05, D.z - 1.4, D.z + 1.4], M.paint(0x0a0a0c, 0.4, 0.4), { kind: 'prop', name: 'decks' });
    for (let i = 0; i < 10; i++) put(k, new THREE.BoxGeometry(0.06, 0.02, 0.06), M.glow(rng.pick([0xff3a6a, 0x3ac8ff, 0x7aff5a]), 2), D.x + 0.85, 2.06, D.z - 1.1 + i * 0.24, 0, false);
    for (const z of [-0.5, 0.5]) put(k, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), M.paint(0x1a1a1a, 0.3, 0.3), D.x + 1.05, 2.07, D.z + z, 0, false);
    // speaker stacks either side
    for (const z of [-4.2, 4.2]) k.solid([-13.8, -12.4, 1.0, 4.6, z - 0.8, z + 0.8], M.paint(0x0e0e10, 0.8, 0.1), { kind: 'prop', name: 'speakers' });
    neonSign(k, ['THE LANTERN'], '#ffb040', -13.9, 5.6, 0, Math.PI / 2, 7, 1.6, { intensity: 26 });
    k.spot([-11, 3.4, 0], 0xff6a9a, 30, 8);
  }

  // ---------------------------------------------------------------------- the VIP gallery (south) and its stairs
  {
    k.deck(-14, 14, 8.5, 14, G, M.planksFloor(), M.paint(0x1a1012, 0.6, 0.2), { name: 'gallery', dense: true, thick: 0.35 });
    // the balustrade: brass rail over glass (she can vault it: three and a half metres down)
    for (let x = -14; x < 10; x += 2.4) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 0.95), new THREE.MeshStandardMaterial({ color: 0x8aa0b0, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      glass.position.set(x + 1.2, G + 0.5, 8.52);
      k.g.add(glass);
    }
    put(k, new THREE.BoxGeometry(24, 0.07, 0.07), gold, -2, G + 1.0, 8.52, 0, false);
    const bal = k.solid([-14, 10, G, G + 1.0, 8.42, 8.62], null, { kind: 'wall', name: 'balustrade', climb: true, hidden: true });
    if (bal) bal.seeThrough = true;
    // columns under it
    for (let x = -12; x <= 8; x += 5) k.solid([x - 0.3, x + 0.3, 0, G - 0.35, 8.2, 8.8], M.paint(0x2a1a1e, 0.5, 0.3), { kind: 'pillar', name: 'column' });
    // the stairs: up along the east wall from z 1 to the gallery
    k.stairs(10, 14, 1.0, 8.5, 'z', 0, G, M.paint(0x2a1a1e, 0.5, 0.2), { walls: false });
    k.solid([9.8, 10, 0, G + 1.0, 1.0, 8.5], null, { kind: 'wall', name: 'stair rail', hidden: true });
    put(k, new THREE.BoxGeometry(0.06, 0.06, 7.6), gold, 9.9, G * 0.5 + 0.95, 4.75, 0, false);
    // the rope across the foot of them (unhooked for a black card)
    {
      const grp = new THREE.Group();
      const brass = M.paint(0xb8903a, 0.25, 0.9);
      const rope = M.paint(0x6a0a14, 0.6, 0);
      const post = (x: number) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.95, 8), brass);
        p.position.set(x, 0.47, 0);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), brass);
        b.position.set(x, 0.02, 0);
        grp.add(p, b);
      };
      post(0);
      post(3.6);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 8; j++) pts.push(new THREE.Vector3((j / 8) * 3.6, 0.86 - Math.sin((j / 8) * Math.PI) * 0.16, 0));
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.022, 5), rope));
      grp.position.set(10.2, 0, 0.8);
      k.g.add(grp);
      clubStage.rope = grp;
      clubStage.ropeOb = k.block([10.12, 13.88, 0, 0.95, 0.72, 0.88], 'prop', 'rope');
    }
    // booths: curved sofas, low tables, a lamp on each (the west end kept clear: the office door)
    for (const x of [-7.4, -2.4, 2.6, 7.4]) {
      k.solid([x - 1.6, x + 1.6, G, G + 0.45, 12.6, 13.9], velvet, { kind: 'crate', name: 'sofa' });
      k.solid([x - 1.6, x + 1.6, G + 0.45, G + 1.1, 13.6, 13.9], velvet, { kind: 'wall', name: 'sofa back' });
      k.solid([x - 0.7, x + 0.7, G, G + 0.42, 11.2, 12.0], M.paint(0x0e0c0c, 0.2, 0.3), { kind: 'crate', name: 'table' });
      put(k, new THREE.SphereGeometry(0.08, 8, 6), M.glow(0xffc070, 2), x, G + 0.55, 11.6, 0, false);
      for (let i = 0; i < 3; i++) put(k, new THREE.CylinderGeometry(0.03, 0.025, 0.14, 8), M.glass(0x8a9a9a), x - 0.4 + i * 0.35, G + 0.49, 11.5 + (i % 2) * 0.2, 0, false);
      put(k, new THREE.CylinderGeometry(0.12, 0.1, 0.2, 10), M.steel(), x + 0.45, G + 0.52, 11.7, 0, false);
      k.spot([x, G + 1.6, 12], 0xffb070, 10, 5);
    }
    signBoard(k, 'VIP', 12, G + 2.2, 13.95, Math.PI, 1.2, 0.5, { bg: '#100808', fg: '#ffb040', lit: true });
  }

  // ---------------------------------------------------------------------- the office (off the gallery's west end)
  {
    // its floor, round the trapdoor from the keg room (the ladder faces west: she steps off it
    // onto the boards beyond the hatch's west edge)
    const T = CLUB.trapLadder;
    const hx0 = -12.5, hx1 = -11.5, hz1 = 15.3;
    // (the boards' underside: the keg room's ceiling)
    const officeUnder = M.paint(0x1a1614, 0.8, 0.05);
    k.deck(-14, -5, hz1, 22, G, M.planksFloor(), officeUnder, { name: 'office floor', thick: 0.35, dense: true });
    k.deck(-14, hx0, 14.1, hz1, G, M.planksFloor(), officeUnder, { name: 'office floor', thick: 0.35 });
    k.deck(hx1, -5, 14.1, hz1, G, M.planksFloor(), officeUnder, { name: 'office floor', thick: 0.35 });
    // the trapdoor's lid flipped up against the wall; a rail round its east and south sides
    put(k, new THREE.BoxGeometry(1.0, 1.1, 0.05), M.wood(), (hx0 + hx1) / 2, G + 0.55, 14.16, 0, true);
    k.block([hx1, hx1 + 0.08, G, G + 0.9, 14.1, hz1], 'prop', 'trapdoor rail');
    k.block([hx0, hx1 + 0.08, G, G + 0.9, hz1, hz1 + 0.08], 'prop', 'trapdoor rail');
    put(k, new THREE.BoxGeometry(0.05, 0.05, hz1 - 14.1), M.iron(), hx1 + 0.04, G + 0.9, (14.1 + hz1) / 2, 0, false);
    put(k, new THREE.BoxGeometry(hx1 - hx0 + 0.08, 0.05, 0.05), M.iron(), (hx0 + hx1) / 2, G + 0.9, hz1 + 0.04, 0, false);
    for (const [x, z] of [[hx1 + 0.04, 14.12], [hx1 + 0.04, hz1 + 0.04], [hx0, hz1 + 0.04]] as [number, number][]) put(k, new THREE.BoxGeometry(0.05, 0.9, 0.05), M.iron(), x, G + 0.45, z, 0, false);
    k.ladder(T.x, T.z, -Math.PI / 2, 0, G, M.iron());
    // the wall between gallery and office, its door
    k.solid([-14, -11.3, G, 8.4, 13.9, 14.1], darkWall, { kind: 'wall', name: 'office wall' });
    k.solid([-9.7, -5, G, 8.4, 13.9, 14.1], darkWall, { kind: 'wall', name: 'office wall' });
    k.solid([-11.3, -9.7, G + 2.3, 8.4, 13.9, 14.1], darkWall, { kind: 'wall', name: 'office wall' });
    // (the doorway's own boards: the gallery's end to the office floor, no gap between)
    k.deck(-11.3, -9.7, 13.9, 14.2, G, M.planksFloor(), officeUnder, { name: 'office threshold', thick: 0.35 });
    signBoard(k, 'PRIVATE', -10.5, G + 2.55, 13.88, Math.PI, 1.0, 0.25, { bg: '#c8b030', fg: '#141414' });
    const wood = M.paint(0x7a5a44, 0.6, 0.05);
    k.paintWall(-14, 22, -14, 14.1, G, 3.0, wood, 2, 2.4);
    k.paintWall(-5, 14.1, -5, 22, G, 3.0, wood, 2, 2.4);
    k.paintWall(-5, 22, -14, 22, G, 3.0, wood, 2, 2.4);
    k.paintWall(-9.7, 14.1, -5, 14.1, G, 2.3, wood, 2, 2.3);
    k.paintWall(-14, 14.1, -11.3, 14.1, G, 2.3, wood, 2, 2.3);
    // the desk (a lamp, a ledger, money in bands), the chair, the safe, the cabinets
    const D = CLUB.desk;
    k.solid([D.x - 1.0, D.x + 1.0, G, G + 0.78, D.z - 0.5, D.z + 0.5], M.wood(), { kind: 'crate', name: 'desk' });
    put(k, new THREE.BoxGeometry(0.5, 0.32, 0.4), M.paint(0x1a1a1e, 0.4, 0.4), D.x + 0.55, G + 0.94, D.z - 0.1, 0, false);
    for (let i = 0; i < 6; i++) put(k, new THREE.BoxGeometry(0.16, 0.05, 0.07), M.paint(0x6a8a5a, 0.8, 0), D.x - 0.6 + (i % 3) * 0.18, G + 0.81 + Math.floor(i / 3) * 0.05, D.z + 0.1, 0.1 * i, false);
    put(k, new THREE.BoxGeometry(0.3, 0.05, 0.4), M.paint(0x6a0a0a, 0.6, 0), D.x - 0.1, G + 0.81, D.z - 0.15, 0.15, false);
    put(k, new THREE.CylinderGeometry(0.06, 0.1, 0.4, 8), gold, D.x + 0.7, G + 0.98, D.z + 0.3, 0, false);
    put(k, new THREE.SphereGeometry(0.1, 8, 6), M.glow(0xffd8a0, 1.6), D.x + 0.7, G + 1.2, D.z + 0.3, 0, false);
    k.solid([D.x - 0.3, D.x + 0.3, G, G + 0.5, D.z + 0.7, D.z + 1.2], M.paint(0x2a1a14, 0.6, 0), { kind: 'prop', name: 'chair' });
    k.spot([D.x + 0.7, G + 1.5, D.z + 0.3], 0xffd8a0, 12, 6);
    const S = CLUB.safe;
    k.solid([S.x - 0.55, S.x + 0.55, G, G + 1.3, S.z - 0.5, S.z + 0.5], M.steel(), { kind: 'crate', name: 'safe' });
    {
      // its door (it swings open for the script)
      const piv = new THREE.Group();
      piv.position.set(S.x + 0.56, G + 0.65, S.z - 0.46);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.16, 0.9), new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: 0.7, roughness: 0.35 }));
      door.position.set(0.02, 0, 0.45);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8c0a0, metalness: 0.9, roughness: 0.3 }));
      dial.position.set(0.06, 0.12, 0.45);
      piv.add(door, dial);
      k.g.add(piv);
      clubStage.safeDoor = piv;
      // inside: the red ledger, an envelope
      put(k, new THREE.BoxGeometry(0.34, 0.06, 0.26), M.paint(0x7a0a0a, 0.6, 0), S.x + 0.1, G + 0.75, S.z, 0, false);
      put(k, new THREE.BoxGeometry(0.3, 0.02, 0.2), M.paint(0x0a0a0a, 0.4, 0.2), S.x + 0.1, G + 0.35, S.z, 0, false);
    }
    for (let i = 0; i < 3; i++) k.solid([-10.2 + i * 0.7, -9.6 + i * 0.7, G, G + 1.4, 21.4, 21.95], M.paint(0x4a4e52, 0.5, 0.5), { kind: 'crate', name: 'cabinet' });
    // a leather sofa, a drinks trolley, a framed photo of the club's opening night
    // (clear of the hatch: she comes off the ladder onto the boards west of it and walks on south)
    k.solid([-13.9, -13.0, G, G + 0.45, 16.6, 18.8], M.paint(0x2a1a14, 0.5, 0.1), { kind: 'crate', name: 'sofa' });
    k.solid([-13.95, -13.75, G + 0.45, G + 1.1, 16.6, 18.8], M.paint(0x2a1a14, 0.5, 0.1), { kind: 'wall', name: 'sofa back' });
    put(k, new THREE.BoxGeometry(0.9, 0.6, 0.04), M.paint(0x3a3028, 0.5, 0.2), -5.06, G + 1.9, 17.6, -Math.PI / 2, false);
    // the ladder to the roof hatch
    k.ladder(CLUB.ladder.x, CLUB.ladder.z, Math.PI / 2, G, R, M.iron());
    k.spot([-9, G + 2.8, 16], 0xffe8c8, 30, 9);
    k.spot([-12.5, G + 2.6, 20], 0xffe0b0, 16, 7);
  }

  // ---------------------------------------------------------------------- the back corridor, the staff room
  {
    // the corridor: a strip light, pipes, a mop bucket, crates of empties
    k.spot([1, 3.1, 16.75], 0xd8e8ff, 7, 6, { flicker: 0.15 });
    put(k, new THREE.BoxGeometry(1.2, 0.05, 0.1), M.glow(0xd8e8ff, 1.4), 1, 3.35, 16.75, 0, false);
    put(k, new THREE.CylinderGeometry(0.05, 0.05, 10, 8).rotateZ(Math.PI / 2), M.iron(), 1, 3.1, 16.1, 0, false);
    for (const [x, n] of [[4.2, 3], [5.2, 2]] as [number, number][]) {
      for (let i = 0; i < n; i++) put(k, new THREE.BoxGeometry(0.5, 0.3, 0.38), M.paint(rng.pick([0x2a4a2a, 0x4a2a1a]), 0.7, 0), x, 0.15 + i * 0.31, 17.1, rng.next() * 0.2, true);
      k.block([x - 0.28, x + 0.28, 0, n * 0.31, 16.9, 17.3], 'prop', 'empties');
    }
    signBoard(k, '← STAFF   KEGS →', 1, 2.0, 16.02, 0, 1.6, 0.25, { bg: '#e8e0d0', fg: '#1a1a1a' });
    // the staff room: lockers along the south wall, a bench, the mirror with its bulbs, a sofa
    const L = CLUB.locker;
    const lockerMat = M.paint(0x7a8a9a, 0.45, 0.25);
    for (let i = 0; i < 10; i++) {
      const x = -3.5 + i * 0.6 + 0.3;
      if (i !== 6) put(k, new THREE.BoxGeometry(0.58, 1.9, 0.5), lockerMat, x, 0.95, 21.7, 0, true);
      else {
        // number six: the body, and its door on a hinge
        put(k, new THREE.BoxGeometry(0.58, 1.9, 0.04), lockerMat, x, 0.95, 21.93, 0, false);
        put(k, new THREE.BoxGeometry(0.04, 1.9, 0.5), lockerMat, x - 0.27, 0.95, 21.7, 0, false);
        put(k, new THREE.BoxGeometry(0.04, 1.9, 0.5), lockerMat, x + 0.27, 0.95, 21.7, 0, false);
        put(k, new THREE.BoxGeometry(0.58, 0.04, 0.5), lockerMat, x, 1.88, 21.7, 0, false);
        put(k, new THREE.BoxGeometry(0.5, 0.02, 0.44), lockerMat, x, 1.5, 21.7, 0, false);
        // inside: a denim jacket on the hook, sneakers, a photo strip taped to the door's back
        put(k, new THREE.BoxGeometry(0.42, 0.62, 0.14), M.paint(0x3a5a8a, 0.9, 0), x, 1.08, 21.8, 0, false);
        put(k, new THREE.BoxGeometry(0.28, 0.1, 0.12), M.paint(0xe8e8e8, 0.7, 0), x, 0.06, 21.72, 0, false);
        const piv = new THREE.Group();
        piv.position.set(x - 0.29, 0.95, 21.45);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.86, 0.03), new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.45, metalness: 0.25 }));
        door.position.set(0.28, 0, 0);
        const num = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: numberTexture('6'), transparent: true }));
        num.position.set(0.28, 0.62, -0.02);
        num.rotation.y = Math.PI;
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.36), new THREE.MeshBasicMaterial({ map: photoStripTexture() }));
        strip.position.set(0.3, 0.3, 0.02);
        piv.add(door, num, strip);
        k.g.add(piv);
        clubStage.locker = piv;
      }
      if (i !== 6) {
        const num = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: numberTexture(String(i)), transparent: true }));
        num.position.set(x, 1.57, 21.44);
        num.rotation.y = Math.PI;
        k.g.add(num);
      }
    }
    void L;
    k.block([-3.5, 2.5, 0, 1.9, 21.45, 22], 'prop', 'lockers');
    k.solid([-3, 1.5, 0, 0.45, 20.3, 20.7], M.wood(), { kind: 'crate', name: 'bench' });
    // the mirror wall (east), bulbs round it, a counter of make-up
    k.solid([5.4, 6, 0, 0.85, 18.2, 21.4], M.paint(0x2a2220, 0.5, 0.1), { kind: 'crate', name: 'dressing table' });
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.1), new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.05, metalness: 1 }));
    mir.position.set(5.97, 1.6, 19.8);
    mir.rotation.y = -Math.PI / 2;
    k.g.add(mir);
    for (let i = 0; i < 8; i++) put(k, new THREE.SphereGeometry(0.045, 8, 6), M.glow(0xfff0d0, 2.2), 5.95, i < 4 ? 2.2 : 1.0, 18.5 + (i % 4) * 0.85, 0, false);
    k.spot([5.2, 2.0, 19.8], 0xfff0d0, 22, 7);
    k.solid([-3.9, -3.0, 0, 0.45, 18.4, 20.6], M.paint(0x5a2a3a, 0.7, 0), { kind: 'crate', name: 'sofa' });
    k.spot([-1, 3.0, 19.6], 0xffe0b0, 22, 8);
    signBoard(k, 'NO PHONES ON THE FLOOR · SMILE', 2.4, 2.3, 17.72, 0, 2.0, 0.22, { bg: '#e8e0d0', fg: '#3a1a1a' });
  }

  // ---------------------------------------------------------------------- the keg room (under the office)
  {
    const kegM = M.steel();
    for (const [x, z] of [[-7, 15.2], [-6.3, 15.2], [-7, 15.9], [-6.3, 15.9], [-7.7, 15.2], [-9, 20.8], [-8.3, 20.8], [-9, 21.5], [-8.3, 21.5]] as [number, number][]) {
      put(k, new THREE.CylinderGeometry(0.29, 0.29, 0.62, 14), kegM, x, 0.31, z, 0, true);
    }
    k.block([-8.05, -5.95, 0, 0.62, 14.85, 16.25], 'crate', 'kegs');
    k.block([-9.35, -7.95, 0, 0.62, 20.45, 21.85], 'crate', 'kegs');
    // racks of boxed bottles: rows to slip between
    for (const [x0, x1, z0, z1] of [[-13.6, -12.4, 16.8, 21.6], [-11, -9.8, 16.4, 19.6]] as [number, number, number, number][]) {
      k.solid([x0, x1, 0, 2.2, z0, z1], M.paint(0x3a3a3c, 0.6, 0.5), { kind: 'crate', name: 'rack' });
      for (let z = z0 + 0.3; z < z1; z += 0.5)
        for (let y = 0.25; y < 2.1; y += 0.55) put(k, new THREE.BoxGeometry(x1 - x0 - 0.1, 0.4, 0.42), M.paint(rng.pick([0x8a6a3a, 0x7a5a2a, 0x9a7a4a]), 0.9, 0), (x0 + x1) / 2, y, z, 0, false);
    }
    k.solid([-7.4, -5.4, 0, 0.9, 18.4, 19.4], M.crate(), { kind: 'crate', name: 'crates' });
    k.solid([-7.0, -5.8, 0.9, 1.6, 18.5, 19.3], M.crate(), { kind: 'crate', name: 'crates' });
    // a bare bulb or two (she can stay in the dark between them)
    k.spot([-7.5, 3.0, 17.4], 0xffc890, 7, 6, { flicker: 0.05 });
    k.spot([-12, 3.0, 15.6], 0xffc890, 4, 4.5);
    put(k, new THREE.SphereGeometry(0.06, 8, 6), M.glow(0xffc890, 2), -7.5, 3.0, 17.4, 0, false);
  }

  // ---------------------------------------------------------------------- the roof (rain; Meridian on the skyline)
  {
    // the deck, round the hatch over the office ladder
    const hx0 = -6.4, hx1 = -5.2, hz0 = 20.6, hz1 = 21.8;
    const roof = M.roofFloor();
    // (its underside: the hall's and the office's ceiling, dark)
    const roofUnder = M.concrete(0x1e1a1c);
    k.deck(-17, 16, -17, hz0, R, roof, roofUnder, { name: 'roof', thick: 0.8, dense: true });
    k.deck(-17, 16, hz1, 24, R, roof, roofUnder, { name: 'roof', thick: 0.8 });
    k.deck(-17, hx0, hz0, hz1, R, roof, roofUnder, { name: 'roof', thick: 0.8 });
    k.deck(hx1, 16, hz0, hz1, R, roof, roofUnder, { name: 'roof', thick: 0.8 });
    for (const [x0, x1, z0, z1] of [[-17, 16, -17, -16.7], [-17, 16, 23.7, 24], [-17, -16.7, -17, 24], [15.7, 16, -17, 24]] as [number, number, number, number][]) {
      k.solid([x0, x1, R, R + 0.9, z0, z1], M.concrete(0x6a6662), { kind: 'wall', name: 'parapet', walk: true });
    }
    // the hatch: a curb round three sides, its lid thrown back
    k.solid([hx0 - 0.15, hx0, R, R + 0.4, hz0 - 0.15, hz1 + 0.15], M.steel(), { kind: 'crate', name: 'hatch' });
    k.solid([hx0, hx1, R, R + 0.4, hz0 - 0.15, hz0], M.steel(), { kind: 'crate', name: 'hatch' });
    k.solid([hx0, hx1, R, R + 0.4, hz1, hz1 + 0.15], M.steel(), { kind: 'crate', name: 'hatch' });
    put(k, new THREE.BoxGeometry(0.05, 1.1, 1.2), M.steel(), hx0 - 0.4, R + 0.55, (hz0 + hz1) / 2, 0, true);
    // AC units, vents, a water tank on legs, the club's sign from behind
    for (const [x, z] of [[4, -6], [8, 2], [-2, -10], [-10, 6]] as [number, number][]) k.solid([x - 1.0, x + 1.0, R, R + 1.4, z - 0.7, z + 0.7], M.paint(0x8a8c88, 0.6, 0.4), { kind: 'crate', name: 'ac unit', walk: true });
    for (const [x, z] of [[-12, -12], [0, 12], [11, -11]] as [number, number][]) put(k, new THREE.CylinderGeometry(0.3, 0.3, 1.2, 10), M.steel(), x, R + 0.6, z);
    k.solid([10, 13, R, R + 3.6, 15, 18], M.wood(), { kind: 'crate', name: 'water tank' });
    for (const [x, z] of [[-14, -14], [12, -14], [-14, 21], [12, 21]] as [number, number][]) k.spot([x, R + 2.4, z], 0xff9a60, 30, 12);
    // the club's sign on the roof's street edge, lit, its back to the roof
    neonSign(k, ['THE LANTERN'], '#ffb040', 15.5, R + 2.2, 0, -Math.PI / 2, 9, 2.0, { intensity: 40 });
    put(k, new THREE.BoxGeometry(0.3, 3.2, 9.4), M.iron(), 15.75, R + 1.6, 0, 0, true);
    k.spot([0, R + 5, 4], 0xb0c0e8, 60, 26);
    k.spot([-5.5, R + 1.8, 21.2], 0xffd0a0, 10, 6);
    for (const [x, z] of [[-6, -6], [6, 8], [-2, 16], [8, -10]] as [number, number][]) k.spot([x, R + 3.2, z], 0x9aa8d8, 26, 12);
    k.rain({ when: () => a.focus.y > R - 2.5, floorY: R });
  }
  // Meridian Tower on the skyline, lit to its crown (where Viper is)
  meridianOnSkyline(k, 160, -230);
  buildCity(k.g, rng, [{ n: 26, r0: 70, r1: 110, top0: 20, top1: 55 }, { n: 22, r0: 120, r1: 170, top0: 30, top1: 80 }], { bottom: -2, tint: 0x9a8aa8 });

  // ---------------------------------------------------------------------- the light rig; the alarm's lights
  const rig = lightRig(k, M, rng);
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7], [0, 0], [-10, 11], [4, 11], [22, 0]] as [number, number][]) {
    const s = k.spot([x, z === 0 && x === 22 ? 3.4 : 7.4, z], 0xe8ecff, x === 22 ? 40 : 140, 18);
    s.off = true;
    clubStage.house.push(s);
  }
  for (const [x, y, z] of [[-13.6, 6.6, -13.6], [13.6, 6.6, -13.6], [-13.6, 6.6, 13.6], [13.6, 6.6, 6], [-9, G + 2.6, 15.8], [1, 3.0, 17.8]] as [number, number, number][]) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), new THREE.MeshBasicMaterial({ color: 0x400404 }));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.4, 12, 1, true).translate(0, -2.2, 0).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff1010, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.name = 'beam';
    b.add(lamp, beam);
    k.g.add(b);
    clubStage.beacons.push(b);
    const s = k.spot([x, y - 0.3, z], 0xff1a10, 60, 12, { mod: () => 0.45 + 0.55 * Math.abs(Math.sin(clubStage.t * 4)) });
    s.off = true;
    clubStage.house.push(s);
  }
  const hemi = new THREE.HemisphereLight(0x9a7aaa, 0x4a3a40, 3.2);
  k.g.add(hemi);
  k.keyLight(0xa0a8d8, 0.9, new THREE.Vector3(0.3, 1, -0.4), 30);
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(0, 2.4, 0),
    update: (dt) => {
      clubStage.t += dt;
      const t = clubStage.t;
      tiles(t, clubStage.alarm);
      rig(t, dt, clubStage.alarm);
      // the doors on their hinges
      clubStage.lockerOpen += (clubStage.lockerWant - clubStage.lockerOpen) * Math.min(1, dt * 5);
      if (clubStage.locker) clubStage.locker.rotation.y = clubStage.lockerOpen * 1.9;
      clubStage.safeOpen += (clubStage.safeWant - clubStage.safeOpen) * Math.min(1, dt * 2.5);
      if (clubStage.safeDoor) clubStage.safeDoor.rotation.y = -clubStage.safeOpen * 1.7;
      for (const b of clubStage.beacons) {
        const beam = b.getObjectByName('beam') as THREE.Mesh;
        (beam.material as THREE.MeshBasicMaterial).opacity = clubStage.alarm ? 0.16 : 0;
        b.rotation.y = t * 5;
      }
    },
  });
  return parts;
}

// ============================================================================ the club's pieces
/** The dance floor: 12 x 12 lit tiles (a texture redrawn on the beat). Returns its animation. */
function danceFloor(k: LevelKit, x0: number, x1: number, z0: number, z1: number) {
  const N = 12;
  const data = new Uint8Array(N * N * 4);
  const t = new THREE.DataTexture(data, N, N);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
  k.g.add(m);
  // (a grid of seams between the tiles)
  const pal = [[255, 40, 110], [40, 200, 255], [255, 180, 40], [140, 60, 255], [40, 255, 140]];
  let beat = -1;
  let dark = false;
  return (time: number, off: boolean) => {
    const b = Math.floor(time / CLUB_BEAT);
    if (b === beat && off === dark) return;
    beat = b;
    dark = off;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const o = (j * N + i) * 4;
        const wave = (i + j + b) % 5;
        const on = (i * 7 + j * 13 + b * 3) % 4 !== 0 || wave === 0;
        const c = pal[(Math.floor((i + b) / 3) + Math.floor(j / 3)) % pal.length];
        const k2 = off ? 0.02 : on ? (wave === 0 ? 1 : 0.35) : 0.05;
        data[o] = c[0] * k2;
        data[o + 1] = c[1] * k2;
        data[o + 2] = c[2] * k2;
        data[o + 3] = 255;
      }
    t.needsUpdate = true;
  };
}

/** Bottles on a lit shelf (one row, painted). */
function bottleShelf() {
  const [c, x] = canvas(1024, 64);
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,190,110,0.25)');
  g.addColorStop(1, 'rgba(255,160,80,0.65)');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 64);
  let px = 6;
  const rng = new RNG(31);
  while (px < 1018) {
    const w = 10 + rng.next() * 12, h = 30 + rng.next() * 28;
    x.fillStyle = rng.pick(['#3a6a2a', '#8a4a1a', '#c8c0a0', '#2a2a6a', '#6a1a2a', '#d8a040', '#e8e8f0']);
    x.globalAlpha = 0.85;
    x.fillRect(px, 64 - h, w, h);
    x.fillRect(px + w * 0.35, 64 - h - 8, w * 0.3, 8);
    x.globalAlpha = 0.4;
    x.fillStyle = '#ffffff';
    x.fillRect(px + 2, 64 - h + 4, 2, h - 8);
    x.globalAlpha = 1;
    px += w + 3 + rng.next() * 4;
  }
  return new THREE.MeshBasicMaterial({ map: tex(c, true, false), transparent: true });
}

/** A locker's number plate. */
function numberTexture(n: string) {
  const [c, x] = canvas(64, 64);
  x.fillStyle = '#d8d0b8';
  x.fillRect(4, 4, 56, 56);
  x.fillStyle = '#1a1a1a';
  x.font = 'bold 40px "Oswald", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(n, 32, 34);
  return tex(c, false, false);
}
/** Four frames from a photo booth: two girls pulling faces, the last one laughing. */
function photoStripTexture() {
  const [c, x] = canvas(64, 232);
  x.fillStyle = '#f4f0e8';
  x.fillRect(0, 0, 64, 232);
  const rng = new RNG(66);
  for (let i = 0; i < 4; i++) {
    const y = 6 + i * 56;
    x.fillStyle = '#2a2a34';
    x.fillRect(5, y, 54, 50);
    for (const [cx, hair] of [[22, '#7a1a10'], [42, '#5a1a10']] as [number, string][]) {
      x.fillStyle = hair;
      x.beginPath();
      x.ellipse(cx, y + 22, 10, 13, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#e0b8a0';
      x.beginPath();
      x.ellipse(cx + (rng.next() - 0.5) * 3, y + 25, 7, 9, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  return tex(c, true, false);
}

/**
 * The rig over the floor: moving beams (additive cones from the ceiling, sweeping), the mirror
 * ball turning with its specks, and coloured lights on the beat. Returns its animation.
 */
function lightRig(k: LevelKit, M: Materials, rng: RNG) {
  const beams: { m: THREE.Mesh; ph: number; sp: number }[] = [];
  const cols = [0xff3a8a, 0x3ac8ff, 0xffb040, 0x9a5aff, 0x5aff9a];
  // the truss
  for (const z of [-7, 7]) put(k, new THREE.BoxGeometry(22, 0.3, 0.3), M.paint(0x1a1a1c, 0.4, 0.6), 0, 7.6, z, 0, false);
  const fade = (() => {
    const [c, x] = canvas(4, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#606060');
    g.addColorStop(1, '#000000');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
    return tex(c, false, false);
  })();
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.ConeGeometry(0.9, 7.2, 20, 1, true);
    geo.translate(0, -3.6, 0);
    const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], alphaMap: fade, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(-9 + (i % 5) * 4.5, 7.5, i < 5 ? -7 : 7);
    k.g.add(m);
    beams.push({ m, ph: rng.next() * 6, sp: 0.4 + rng.next() * 0.6 });
  }
  // the mirror ball and its specks on the walls
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 1, roughness: 0.15, flatShading: true }));
  ball.position.set(0, 6.6, 0);
  k.g.add(ball);
  const specks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        Array.from({ length: 360 }, (_, i) => {
          const a = Math.floor(i / 3) * 2.399;
          const r = i % 3;
          return r === 0 ? Math.cos(a) * 13.8 : r === 1 ? 1 + ((a * 13.7) % 6.5) : Math.sin(a) * 13.8;
        }),
        3,
      ),
    ),
    new THREE.PointsMaterial({ color: 0xfff4e0, size: 0.09, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  k.g.add(specks);
  // coloured lights over the floor, pulsing on the beat
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 4 : -4, z = i < 2 ? -4 : 4;
    const s = k.spot([x, 6.5, z], cols[i], 150, 18, { mod: () => 0.45 + 0.55 * Math.pow(Math.max(0, Math.cos(((clubStage.t / CLUB_BEAT) % 1) * Math.PI * 2 + i)), 3) });
    clubStage.rigLights.push(s);
  }
  return (t: number, dt: number, off: boolean) => {
    for (const b of beams) {
      b.m.visible = !off;
      b.m.rotation.x = Math.sin(t * b.sp + b.ph) * 0.65;
      b.m.rotation.z = Math.cos(t * b.sp * 0.8 + b.ph * 1.3) * 0.55;
      (b.m.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.08 * Math.max(0, Math.sin(t * 2.1 + b.ph));
    }
    specks.visible = !off;
    if (!off) {
      ball.rotation.y += dt * 0.6;
      specks.rotation.y += dt * 0.15;
    }
  };
}

/** Meridian Tower far off: a slim glass tower, its crown lit, the cranes at its unfinished top. */
export function meridianOnSkyline(k: LevelKit, x: number, z: number, scale = 1) {
  const H = 210 * scale;
  const [c, cx] = canvas(256, 1024);
  cx.fillStyle = '#0a0e16';
  cx.fillRect(0, 0, 256, 1024);
  const rng = new RNG(5);
  for (let j = 0; j < 128; j++)
    for (let i = 0; i < 16; i++) {
      const on = j < 10 ? rng.next() < 0.75 : j > 100 ? rng.next() < 0.05 : rng.next() < 0.18;
      cx.fillStyle = on ? (j < 10 ? '#ffd8a0' : rng.pick(['#c8d8ff', '#ffe8c8', '#8ab0ff'])) : '#141a26';
      cx.fillRect(i * 16 + 2, j * 8 + 1, 12, 6);
    }
  const mat = new THREE.MeshBasicMaterial({ map: tex(c, true, false), fog: false });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(22 * scale, H, 22 * scale), mat);
  tower.position.set(x, H / 2 - 2, z);
  k.g.add(tower);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(6 * scale, 11 * scale, 18 * scale, 4), new THREE.MeshBasicMaterial({ color: 0xffb060, fog: false }));
  crown.position.set(x, H + 7 * scale, z);
  crown.rotation.y = Math.PI / 4;
  k.g.add(crown);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(2 * scale, 30 * scale, 2 * scale), new THREE.MeshBasicMaterial({ color: 0x3a2a1a, fog: false }));
  crane.position.set(x + 8 * scale, H + 20 * scale, z);
  k.g.add(crane);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(40 * scale, 1.4 * scale, 1.4 * scale), new THREE.MeshBasicMaterial({ color: 0x3a2a1a, fog: false }));
  jib.position.set(x + 14 * scale, H + 34 * scale, z);
  k.g.add(jib);
  const red = new THREE.Mesh(new THREE.SphereGeometry(1.2 * scale, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010, fog: false }));
  red.position.set(x + 34 * scale, H + 35 * scale, z);
  k.g.add(red);
  let t = 0;
  k.updates.push((dt) => {
    t += dt;
    red.visible = Math.floor(t / 0.7) % 2 === 0;
  });
}
