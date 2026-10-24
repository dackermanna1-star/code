import * as THREE from 'three';
import type { SurfaceMaterial } from '../physics/Physics';
import { LevelBuilder, type VirtualLight } from './LevelBuilder';
import { Door, GlassPane } from './Doors';
import { ctx } from '../game/ctx';
import type { PropSystem, Prop } from './Props';
import { rand, pick } from '../core/math';
import { RAPIER, GROUPS, type RCollider } from '../physics/Physics';

export const FLOOR2 = 4.2;
const ROOF = 8.6;
const WALL_T = 0.3;
const IN_T = 0.2;

export interface Seat {
  pos: THREE.Vector3;
  yaw: number;
  kind: 'chair' | 'stool' | 'couch' | 'bench';
  prop?: Prop;
  taken: unknown;
  zone: string;
}

export interface Spot {
  pos: THREE.Vector3;
  yaw: number;
  kind: 'stand' | 'dance' | 'pool' | 'darts' | 'arcade' | 'lean' | 'watch' | 'bar' | 'jukebox' | 'smoke' | 'piss' | 'band';
  taken: unknown;
  zone: string;
  data?: any;
}

export interface Zone {
  name: string;
  label: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface Work {
  kind: 'bartender' | 'cook' | 'bouncer' | 'waitress' | 'guitarist' | 'drummer' | 'singer' | 'boss' | 'bartender2';
  pos: THREE.Vector3;
  yaw: number;
  patrol?: THREE.Vector3[];
}

export interface LevelInfo {
  builder: LevelBuilder;
  seats: Seat[];
  spots: Spot[];
  zones: Zone[];
  work: Work[];
  entrances: THREE.Vector3[];
  playerSpawn: { pos: THREE.Vector3; yaw: number };
  doors: Door[];
  glass: GlassPane[];
  bounds: THREE.Box3;
  danceFloor: THREE.Mesh;
  discoBall: THREE.Object3D;
  jukebox: { pos: THREE.Vector3; collider: RCollider; health: number; broken: boolean; mesh: THREE.Object3D };
  animated: ((t: number, dt: number) => void)[];
  taps: THREE.Vector3[];
  poolTables: { center: THREE.Vector3; size: [number, number] }[];
  lights: VirtualLight[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Builds "The Iron Horse", a two-story biker bar. */
export function buildBarLevel(scene: THREE.Scene, props: PropSystem): LevelInfo {
  const B = new LevelBuilder(scene);
  const seats: Seat[] = [];
  const spots: Spot[] = [];
  const work: Work[] = [];
  const doors: Door[] = [];
  const glass: GlassPane[] = [];
  const animated: ((t: number, dt: number) => void)[] = [];
  const taps: THREE.Vector3[] = [];
  const poolTables: { center: THREE.Vector3; size: [number, number] }[] = [];

  // ------------------------------------------------------------------ materials
  B.defineMat('floor', { tex: 'woodFloor', uv: 2.2, roughness: 0.62, surface: 'wood' });
  B.defineMat('floorUp', { tex: 'woodFloorLight', uv: 2.2, roughness: 0.7, surface: 'wood', color: '#c8a888' });
  B.defineMat('tile', { tex: 'tileChecker', uv: 1.2, roughness: 0.35, surface: 'tile' });
  B.defineMat('concrete', { tex: 'concrete', uv: 2.5, roughness: 0.95, surface: 'concrete' });
  B.defineMat('carpet', { tex: 'carpetRed', uv: 1.6, roughness: 1, surface: 'carpet' });
  B.defineMat('plaster', { tex: 'plaster', uv: 2.0, roughness: 0.95, surface: 'plaster' });
  B.defineMat('plasterDirty', { tex: 'plasterDirty', uv: 2.0, roughness: 0.95, surface: 'plaster' });
  B.defineMat('wainscot', { tex: 'wainscot', uv: 1.15, roughness: 0.7, surface: 'wood' });
  B.defineMat('brick', { tex: 'brick', uv: 2.4, roughness: 0.95, surface: 'concrete' });
  B.defineMat('panel', { tex: 'woodPanel', uv: 1.6, roughness: 0.8, surface: 'wood' });
  B.defineMat('wallTile', { tex: 'wallTile', uv: 1.2, roughness: 0.3, surface: 'tile' });
  B.defineMat('ceiling', { tex: 'ceilingWood', uv: 2.0, roughness: 0.9, surface: 'wood', shadow: true });
  B.defineMat('roof', { tex: 'ceilingWood', uv: 2.0, roughness: 0.9, surface: 'wood', shadow: false });
  B.defineMat('beam', { tex: 'darkWood', uv: 0.8, roughness: 0.8, surface: 'wood' });
  B.defineMat('trim', { tex: 'darkWood', uv: 0.6, roughness: 0.7, surface: 'wood', color: '#c8a888' });
  B.defineMat('barWood', { tex: 'barWood', uv: 1.0, roughness: 0.35, surface: 'wood' });
  B.defineMat('metal', { tex: 'metal', uv: 1.0, roughness: 0.35, metalness: 0.6, surface: 'metal' });
  B.defineMat('steel', { tex: 'metal', uv: 1.0, roughness: 0.25, metalness: 0.8, surface: 'metal', color: '#d8dce0' });
  B.defineMat('brass', { tex: 'white', uv: 1, roughness: 0.3, metalness: 0.9, surface: 'metal', color: '#c8a040' });
  B.defineMat('stage', { tex: 'stage', uv: 1.5, roughness: 0.6, surface: 'wood' });
  B.defineMat('vinyl', { tex: 'vinylRed', uv: 0.5, roughness: 0.45, surface: 'fabric' });
  B.defineMat('felt', { tex: 'felt', uv: 0.6, roughness: 1, surface: 'fabric' });
  B.defineMat('curtain', { tex: 'white', uv: 1, roughness: 0.95, surface: 'fabric', color: '#5a0a12' });
  B.defineMat('black', { tex: 'white', uv: 1, roughness: 0.7, surface: 'wood', color: '#141210' });
  B.defineMat('white', { tex: 'white', uv: 1, roughness: 0.3, surface: 'ceramic', color: '#eeeae2' });
  B.defineMat('mirror', { tex: 'white', uv: 1, roughness: 0.05, metalness: 1, surface: 'glass', color: '#9aa8b0' });
  B.defineMat('exterior', { tex: 'exteriorWood', uv: 1.8, roughness: 0.9, surface: 'wood' });
  B.defineMat('asphalt', { tex: 'asphalt', uv: 3, roughness: 0.9, surface: 'concrete' });
  B.defineMat('sidewalk', { tex: 'sidewalk', uv: 1.5, roughness: 0.95, surface: 'concrete' });
  B.defineMat('lampShade', { tex: 'white', uv: 1, roughness: 0.5, surface: 'metal', color: '#1f5a2a', emissive: '#000000' });
  B.defineMat('bulb', { tex: 'white', uv: 1, roughness: 0.5, surface: 'glass', color: '#ffe8b8', emissive: '#ffd890', emissiveIntensity: 3, shadow: false });
  B.defineMat('bulbCool', { tex: 'white', uv: 1, roughness: 0.5, surface: 'glass', color: '#e8f4ff', emissive: '#d8ecff', emissiveIntensity: 2.6, shadow: false });
  B.defineMat('bulbRed', { tex: 'white', uv: 1, roughness: 0.5, surface: 'glass', color: '#ff6060', emissive: '#ff2030', emissiveIntensity: 3, shadow: false });

  // ------------------------------------------------------------------ zones
  const zones: Zone[] = [
    { name: 'bar', label: 'Bar', min: V(-17, -1, -6), max: V(-13, 4, 9) },
    { name: 'pool', label: 'Pool Hall', min: V(11, -1, -6), max: V(17, 4, 9) },
    { name: 'stage', label: 'Stage', min: V(-5, -1, -6), max: V(5, 4, -3.4) },
    { name: 'dance', label: 'Dance Floor', min: V(-4, -1, -3.4), max: V(4, 4, 1) },
    { name: 'hall', label: 'Main Hall', min: V(-13, -1, -6), max: V(11, 4, 12) },
    { name: 'arcade', label: 'Arcade', min: V(11, -1, 9), max: V(17, 4, 12) },
    { name: 'kitchen', label: 'Kitchen', min: V(-17, -1, -14), max: V(-7, 4, -6) },
    { name: 'storage', label: 'Storage', min: V(-7, -1, -14), max: V(7, 4, -6) },
    { name: 'bathroom', label: 'Restrooms', min: V(7, -1, -14), max: V(17, 4, -6) },
    { name: 'balconyL', label: 'West Balcony', min: V(-17, 3.5, -6), max: V(-11, 9, 12) },
    { name: 'balconyR', label: 'East Balcony', min: V(11, 3.5, -6), max: V(17, 9, 12) },
    { name: 'balconyF', label: 'Front Balcony', min: V(-11, 3.5, 9), max: V(11, 9, 12) },
    { name: 'vip', label: 'VIP Lounge', min: V(-11, 3.5, -14), max: V(11, 9, -6) },
    { name: 'staff', label: 'Staff Room', min: V(-17, 3.5, -14), max: V(-11, 9, -6) },
    { name: 'poker', label: 'Card Room', min: V(11, 3.5, -14), max: V(17, 9, -6) },
    { name: 'office', label: 'Office', min: V(13.5, 3.5, 6), max: V(17, 9, 12) },
    { name: 'porch', label: 'Porch', min: V(-17, -1, 12), max: V(17, 4, 16) },
  ];

  // ------------------------------------------------------------------ ground floor slabs
  B.box('floor', [-17.15, -0.3, -6], [17.15, 0, 12.15], { skip: ['ny'] });
  B.box('tile', [-17.15, -0.3, -14.15], [-7, 0, -6], { skip: ['ny'] });
  B.box('concrete', [-7, -0.3, -14.15], [7, 0, -6], { skip: ['ny'] });
  B.box('tile', [7, -0.3, -14.15], [17.15, 0, -6], { skip: ['ny'] });

  // ------------------------------------------------------------------ second floor slabs (with ceiling underside)
  const slab = (x0: number, x1: number, z0: number, z1: number, mat = 'floorUp') => {
    B.box(mat, [x0, FLOOR2 - 0.08, z0], [x1, FLOOR2, z1], { skip: ['ny'] });
    B.box('ceiling', [x0, FLOOR2 - 0.22, z0], [x1, FLOOR2 - 0.08, z1], { skip: ['py'] });
  };
  slab(-17, -11, -6, 12);
  slab(11, 17, -6, 12);
  slab(-11, 11, 9, 12);
  // back section: VIP carpet, staff & poker rooms wood, stairwell opening
  slab(-17, -11, -14, -6);
  slab(11, 17, -14, -6);
  slab(-11, 11, -12.35, -6, 'carpet');
  slab(-11, -5.0, -14, -12.35, 'carpet');
  slab(1.6, 11, -14, -12.35, 'carpet');
  // stair landing for main stairs
  slab(9.35, 11, 0.6, 2.15);
  // roof
  B.box('roof', [-17.3, ROOF, -14.3], [17.3, ROOF + 0.3, 12.3], { skip: ['py'] });

  // ------------------------------------------------------------------ exterior walls
  const FRONT_DOOR: [number, number, number, number] = [-1.35, 1.35, 0, 2.9];
  const winGF: [number, number][] = [
    [-15.2, -13.2],
    [-10.2, -7.8],
    [-5.6, -3.2],
    [3.2, 5.6],
    [7.8, 10.2],
    [13.2, 15.2],
  ];
  const winUF: [number, number][] = [
    [-15.2, -13.2],
    [-8.2, -6.2],
    [6.2, 8.2],
    [14.6, 16.4],
  ];
  const frontOpenings: [number, number, number, number][] = [FRONT_DOOR, ...winGF.map(([a, b]) => [a, b, 1.0, 2.7] as [number, number, number, number]), ...winUF.map(([a, b]) => [a, b, 5.3, 7.3] as [number, number, number, number])];
  // front wall: interior plaster face + exterior siding face
  B.wallX('plaster', 12.075, -17.3, 17.3, 0, ROOF, 0.15, frontOpenings);
  B.wallX('exterior', 12.225, -17.3, 17.3, 0, ROOF, 0.15, frontOpenings, { collide: false });
  // window sills / frames
  for (const [a, b] of winGF) {
    B.box('trim', [a - 0.05, 0.92, 11.85], [b + 0.05, 1.0, 12.4], { collide: false });
    B.box('trim', [a - 0.05, 2.7, 11.95], [b + 0.05, 2.8, 12.35], { collide: false });
    B.box('trim', [(a + b) / 2 - 0.03, 1.0, 12.1], [(a + b) / 2 + 0.03, 2.7, 12.2], { collide: false });
    for (const half of [0, 1]) {
      const x0 = half ? (a + b) / 2 : a;
      const x1 = half ? b : (a + b) / 2;
      glass.push(new GlassPane(scene, V((x0 + x1) / 2, 1.85, 12.15), x1 - x0 - 0.04, 1.68, 0));
    }
  }
  for (const [a, b] of winUF) {
    B.box('trim', [a - 0.05, 5.22, 11.85], [b + 0.05, 5.3, 12.4], { collide: false });
    glass.push(new GlassPane(scene, V((a + b) / 2, 6.3, 12.15), b - a - 0.04, 1.98, 0));
  }
  // left wall (x=-17): windows upstairs only
  const leftUp: [number, number, number, number][] = [
    [-2.4, -0.6, 5.3, 7.3],
    [3.6, 5.4, 5.3, 7.3],
  ];
  B.wallZ('plaster', -17.075, -14.3, 12.3, 0, ROOF, 0.15, leftUp);
  B.wallZ('exterior', -17.225, -14.3, 12.3, 0, ROOF, 0.15, leftUp, { collide: false });
  for (const w of leftUp) glass.push(new GlassPane(scene, V(-17.15, 6.3, (w[0] + w[1]) / 2), w[1] - w[0] - 0.04, 1.98, Math.PI / 2));
  const rightUp: [number, number, number, number][] = [
    [-2.4, -0.6, 5.3, 7.3],
    [2.6, 4.4, 5.3, 7.3],
  ];
  B.wallZ('plaster', 17.075, -14.3, 12.3, 0, ROOF, 0.15, rightUp);
  B.wallZ('exterior', 17.225, -14.3, 12.3, 0, ROOF, 0.15, rightUp, { collide: false });
  for (const w of rightUp) glass.push(new GlassPane(scene, V(17.15, 6.3, (w[0] + w[1]) / 2), w[1] - w[0] - 0.04, 1.98, Math.PI / 2));
  B.wallX('brick', -14.15, -17.3, 17.3, 0, ROOF, WALL_T);

  // wainscot on the main hall walls (ground floor + upstairs)
  const wains = (axis: 'x' | 'z', c: number, a: number, b: number, y0: number, side: number, skip: [number, number][] = []) => {
    const h = 1.1;
    const t = 0.03;
    const ranges: [number, number][] = [];
    let cur = a;
    for (const [s0, s1] of skip.sort((p, q) => p[0] - q[0])) {
      if (s0 > cur) ranges.push([cur, s0]);
      cur = Math.max(cur, s1);
    }
    if (cur < b) ranges.push([cur, b]);
    for (const [r0, r1] of ranges) {
      if (axis === 'x') {
        B.box('wainscot', [r0, y0, c + side * 0.0], [r1, y0 + h, c + side * t], { collide: false });
        B.box('trim', [r0, y0 + h, c], [r1, y0 + h + 0.06, c + side * 0.06], { collide: false });
      } else {
        B.box('wainscot', [c, y0, r0], [c + side * t, y0 + h, r1], { collide: false });
        B.box('trim', [c, y0 + h, r0], [c + side * 0.06, y0 + h + 0.06, r1], { collide: false });
      }
    }
  };
  wains('x', 12.0, -13, 17, 0, -1, [[-1.35, 1.35]]);
  wains('z', 17.0, -6, 12, 0, -1);
  wains('x', 12.0, -17, 17, FLOOR2, -1);
  wains('z', -17.0, -6, 12, FLOOR2, 1);
  wains('z', 17.0, -6, 12, FLOOR2, -1);

  // ------------------------------------------------------------------ ground floor interior walls
  // hall / back rooms wall at z=-6 (doors: bar->kitchen, kitchen saloon, storage, restrooms)
  const backOpen: [number, number, number, number][] = [
    [-16.45, -15.35, 0, 2.3],
    [-9.7, -8.2, 0, 2.3],
    [5.0, 6.3, 0, 2.3],
    [7.25, 8.85, 0, 2.4],
  ];
  B.wallX('plaster', -5.95, -17, 17, 0, FLOOR2 - 0.22, 0.1, backOpen);
  B.wallX('wallTile', -6.05, -17, -7, 0, FLOOR2 - 0.22, 0.1, backOpen.filter((o) => o[1] < -7));
  B.wallX('brick', -6.05, -7, 7, 0, FLOOR2 - 0.22, 0.1, backOpen.filter((o) => o[0] > -7 && o[1] < 7));
  B.wallX('wallTile', -6.05, 7, 17, 0, FLOOR2 - 0.22, 0.1, backOpen.filter((o) => o[0] >= 7));
  wains('x', -5.9, -17, 17, 0, 1, backOpen.map((o) => [o[0], o[1]] as [number, number]).concat([[-4.6, 4.6]]));
  // kitchen/storage wall x=-7
  B.wallZ('wallTile', -7.05, -14, -6, 0, FLOOR2 - 0.22, 0.1, [[-10.5, -9.3, 0, 2.3]]);
  B.wallZ('brick', -6.95, -14, -6, 0, FLOOR2 - 0.22, 0.1, [[-10.5, -9.3, 0, 2.3]]);
  // storage / restroom corridor wall x=7
  B.wallZ('brick', 6.95, -14, -6, 0, FLOOR2 - 0.22, 0.1);
  B.wallZ('wallTile', 7.05, -14, -6, 0, FLOOR2 - 0.22, 0.1);
  // corridor right wall x=9 with restroom doors
  const rrDoors: [number, number, number, number][] = [
    [-12.7, -11.6, 0, 2.2],
    [-8.7, -7.6, 0, 2.2],
  ];
  B.wallZ('wallTile', 9.0, -14, -6, 0, FLOOR2 - 0.22, IN_T, rrDoors);
  // between men's & women's
  B.wallX('wallTile', -10.0, 9, 17, 0, FLOOR2 - 0.22, IN_T);

  // ------------------------------------------------------------------ second floor walls
  const y2 = FLOOR2;
  const top2 = ROOF;
  // staff room front wall z=-6 (x -17..-11) door
  B.wallX('plaster', -6.0, -17, -11, y2, top2, IN_T, [[-15.2, -14.1, y2, y2 + 2.3]]);
  // poker room front wall z=-6 (x 11..17) door
  B.wallX('plaster', -6.0, 11, 17, y2, top2, IN_T, [[13.4, 14.5, y2, y2 + 2.3]]);
  // VIP side walls x=-11 / x=11 with connecting doors (loop routes)
  B.wallZ('panel', -11.0, -14, -6, y2, top2, IN_T, [[-11.2, -10.1, y2, y2 + 2.3]]);
  B.wallZ('panel', 11.0, -14, -6, y2, top2, IN_T, [[-11.2, -10.1, y2, y2 + 2.3]]);
  // office walls
  B.wallZ('panel', 13.5, 6, 12, y2, top2, IN_T, [[7.4, 8.5, y2, y2 + 2.3]]);
  B.wallX('panel', 6.0, 13.5, 17, y2, top2, IN_T);
  // VIP back wall paneling
  B.box('panel', [-11, y2, -14.0], [11, top2, -13.95], { collide: false });

  // ------------------------------------------------------------------ columns & trusses
  const colMat = 'beam';
  for (const x of [-11, 11])
    for (const z of [-6, -2, 2, 6, 9]) {
      if (x === 11 && z === 2) continue; // stair landing
      B.box(colMat, [x - 0.17, 0, z - 0.17], [x + 0.17, FLOOR2 - 0.22, z + 0.17]);
      B.box(colMat, [x - 0.14, FLOOR2, z - 0.14], [x + 0.14, ROOF, z + 0.14]);
    }
  for (const x of [-7.5, -3.6, 3.6, 7.5]) {
    B.box(colMat, [x - 0.15, 0, 8.85], [x + 0.15, FLOOR2 - 0.22, 9.15]);
  }
  // edge beams under balcony edges
  B.box('beam', [-11.15, FLOOR2 - 0.42, -6], [-10.85, FLOOR2 - 0.2, 9.15], { collide: false });
  B.box('beam', [10.85, FLOOR2 - 0.42, -6], [11.15, FLOOR2 - 0.2, 9.15], { collide: false });
  B.box('beam', [-11, FLOOR2 - 0.42, 8.85], [11, FLOOR2 - 0.2, 9.15], { collide: false });
  B.box('beam', [-11, FLOOR2 - 0.42, -6.15], [11, FLOOR2 - 0.2, -5.85], { collide: false });
  // roof trusses over the void (decorative, like an old saloon)
  for (let z = -4.5; z <= 7.5; z += 3) {
    B.box('beam', [-11, ROOF - 0.35, z - 0.12], [11, ROOF - 0.05, z + 0.12], { collide: false });
    B.box('beam', [-11, ROOF - 1.4, z - 0.1], [11, ROOF - 1.2, z + 0.1], { collide: false });
    for (let x = -9; x <= 9; x += 3) {
      B.box('beam', [x - 0.08, ROOF - 1.3, z - 0.08], [x + 0.08, ROOF - 0.2, z + 0.08], { collide: false });
      B.cbox('beam', [x + 0.75, ROOF - 0.75, z], [1.6, 0.12, 0.12], { collide: false, rotY: 0 });
    }
  }
  for (let x = -9; x <= 9; x += 4.5) B.box('beam', [x - 0.1, ROOF - 0.32, -6], [x + 0.1, ROOF - 0.08, 9], { collide: false });

  // ------------------------------------------------------------------ main staircase (right side of hall)
  B.stairs('floor', 'z', 8.7, 2.15, [9.4, 10.85], 0, FLOOR2, 'beam');
  // stair handrails (sloped)
  {
    const len = Math.hypot(8.7 - 2.15, FLOOR2);
    const ang = Math.atan2(FLOOR2, 8.7 - 2.15);
    for (const x of [9.32, 10.93]) {
      B.slab('trim', 'z', (8.7 + 2.15) / 2, x, FLOOR2 / 2 + 0.98, len, 0.08, 0.08, -ang, false);
      // balusters
      for (let i = 0; i < 11; i++) {
        const t = (i + 0.5) / 11;
        const z = 8.7 - (8.7 - 2.15) * t;
        const y = FLOOR2 * t;
        B.box('beam', [x - 0.025, y, z - 0.025], [x + 0.025, y + 0.98, z + 0.025], { collide: false });
      }
      // side collider so people don't fall off the stairs sideways
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
      B.collider([x, FLOOR2 / 2 + 0.6, (8.7 + 2.15) / 2], [0.06, 1.2, len], 'wood', q);
    }
    B.box('beam', [9.28, 0, 8.6], [9.38, 1.1, 8.7]);
    B.box('beam', [10.88, 0, 8.6], [10.98, 1.1, 8.7]);
  }

  // ------------------------------------------------------------------ back staircase (storage -> VIP)
  B.stairs('concrete', 'x', -5.0, 1.6, [-13.85, -12.4], 0, FLOOR2, 'beam');
  B.box('beam', [-5.0, 0.9, -12.38], [1.6, 0.98, -12.32], { collide: false });
  {
    const len = Math.hypot(6.6, FLOOR2);
    const ang = Math.atan2(FLOOR2, 6.6);
    B.slab('trim', 'x', -1.7, -12.3, FLOOR2 / 2 + 0.98, len, 0.08, 0.08, ang, false);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    B.collider([-1.7, FLOOR2 / 2 + 0.6, -12.3], [len, 1.2, 0.06], 'wood', q);
  }

  // ------------------------------------------------------------------ balcony railings (breakable props) + posts
  const railLine = (axis: 'x' | 'z', c: number, a: number, b: number, y: number, rotForward: number) => {
    const len = b - a;
    const n = Math.max(1, Math.round(len / 1.2));
    const seg = len / n;
    for (let i = 0; i <= n; i++) {
      const t = a + seg * i;
      if (axis === 'x') B.box('beam', [t - 0.07, y, c - 0.07], [t + 0.07, y + 1.15, c + 0.07]);
      else B.box('beam', [c - 0.07, y, t - 0.07], [c + 0.07, y + 1.15, t + 0.07]);
    }
    for (let i = 0; i < n; i++) {
      const t = a + seg * (i + 0.5);
      const id = seg > 1.35 ? 'railing_15' : seg > 1.05 ? 'railing' : seg > 0.75 ? 'railing_09' : 'railing_06';
      const pos = axis === 'x' ? V(t, y, c) : V(c, y, t);
      props.spawn(id, pos, axis === 'x' ? 0 : Math.PI / 2, 0, { fixed: true });
    }
    void rotForward;
  };
  railLine('z', -11.0, -6.0, 8.85, FLOOR2, 0);
  railLine('z', 11.0, -6.0, 0.6, FLOOR2, 0);
  railLine('z', 11.0, 2.15, 8.85, FLOOR2, 0);
  railLine('x', 9.0, -11.0, 11.0, FLOOR2, 0);
  railLine('x', -6.0, -11.0, 11.0, FLOOR2, 0);
  // landing outer edge (x=9.35) and stair top side
  railLine('z', 9.35, 0.6, 2.15, FLOOR2, 0);
  railLine('x', 0.6, 9.35, 11.0, FLOOR2, 0);
  // stairwell guard in VIP
  railLine('x', -12.35, -5.0, 1.6, FLOOR2, 0);
  railLine('z', -5.0, -13.85, -12.35, FLOOR2, 0);
  // porch railing
  railLine('x', 15.4, -17.0, -2.0, 0.15, 0);
  railLine('x', 15.4, 2.0, 17.0, 0.15, 0);

  // ------------------------------------------------------------------ porch & street (outside)
  B.box('exterior', [-17.3, -0.3, 12.3], [17.3, 0.15, 15.5], { skip: ['ny'] });
  B.box('sidewalk', [-30, -0.3, 15.5], [30, 0.05, 18], { skip: ['ny'] });
  B.box('asphalt', [-30, -0.4, 18], [30, -0.1, 28], { skip: ['ny'] });
  B.box('sidewalk', [-30, -0.3, 28], [30, 0.05, 30], { skip: ['ny'] });
  // porch roof
  B.box('exterior', [-17.3, 3.4, 12.3], [17.3, 3.6, 15.6], { collide: false });
  for (const x of [-16.8, -9, -3, 3, 9, 16.8]) B.box('beam', [x - 0.1, 0.15, 15.3], [x + 0.1, 3.4, 15.5]);
  // invisible boundary so the street stays decorative
  B.collider([0, 2, 18.2], [60, 4, 0.3], 'concrete');
  B.collider([-17.6, 2, 15], [0.3, 4, 6], 'concrete');
  B.collider([17.6, 2, 15], [0.3, 4, 6], 'concrete');
  // facade across the street
  B.box('brick', [-30, -0.1, 30], [30, 12, 30.5], { collide: false });
  for (let x = -26; x < 26; x += 5) {
    B.box(Math.random() < 0.5 ? 'bulb' : 'black', [x, 3, 29.95], [x + 2.2, 4.5, 30.0], { collide: false });
    B.box(Math.random() < 0.4 ? 'bulb' : 'black', [x, 6.5, 29.95], [x + 2.2, 8, 30.0], { collide: false });
  }
  B.neon('MOTEL', [-14, 9.5, 29.9], Math.PI, '#ff3070', 1.6, { light: true });
  B.neon('PAWN', [9, 4.8, 29.9], Math.PI, '#30a0ff', 1.0, { light: true });
  // street lamps
  for (const x of [-12, 12]) {
    B.box('metal', [x - 0.08, 0, 17.0], [x + 0.08, 5.5, 17.16], { collide: false });
    B.box('bulbCool', [x - 0.3, 5.4, 16.9], [x + 0.3, 5.55, 17.3], { collide: false });
    B.light({ pos: [x, 5.2, 17], color: '#ffe0b0', intensity: 30, distance: 16, kind: 'point', priority: 0.4, zone: 'porch' });
  }
  // big outside sign + porch lamps
  B.neon('IRON HORSE', [0, 4.6, 12.42], 0, '#ff5020', 0.9, { frame: true, flicker: 0.03 });
  for (const x of [-2.2, 2.2]) {
    B.box('bulb', [x - 0.12, 2.9, 12.3], [x + 0.12, 3.15, 12.45], { collide: false });
    B.light({ pos: [x, 2.8, 12.9], color: '#ffc070', intensity: 10, distance: 7, kind: 'point', priority: 1.0, zone: 'porch' });
  }
  for (const x of [-10, 10]) B.light({ pos: [x, 3.0, 13.6], color: '#ffb060', intensity: 6, distance: 7, kind: 'point', priority: 0.6, zone: 'porch' });
  B.neon('OPEN', [-5.0, 2.0, 12.42], 0, '#ff3060', 0.5, { frame: true });
  B.neon('COLD BEER', [6.8, 2.1, 12.42], 0, '#30b0ff', 0.4, { frame: true, flicker: 0.1 });

  // ------------------------------------------------------------------ front doors
  doors.push(new Door(scene, V(-1.3, 0, 12.15), { width: 1.28, height: 2.85, rotY: 0, tex: 'woodPanel', window: true }));
  doors.push(new Door(scene, V(1.3, 0, 12.15), { width: 1.28, height: 2.85, rotY: Math.PI, tex: 'woodPanel', window: true }));

  // ------------------------------------------------------------------ BAR
  const barX0 = -15.0,
    barX1 = -14.3,
    barZ0 = -5.0,
    barZ1 = 7.8;
  B.box('barWood', [barX0, 0, barZ0], [barX1, 1.02, barZ1]);
  B.box('barWood', [barX0 - 0.05, 1.02, barZ0 - 0.05], [barX1 + 0.15, 1.1, barZ1 + 0.05], { uv: 0.8 });
  B.box('brass', [barX1 + 0.12, 0.18, barZ0], [barX1 + 0.18, 0.24, barZ1], { collide: false });
  B.box('black', [barX0, 0, barZ0], [barX1 + 0.02, 0.12, barZ1], { collide: false });
  // under-counter fridges behind bar
  B.box('steel', [-17, 0, -4.5], [-16.4, 0.95, 6.5]);
  B.box('barWood', [-17, 0.95, -4.8], [-16.35, 1.0, 6.8], { uv: 0.8 });
  // back bar shelves + mirror
  B.box('mirror', [-17.0, 1.25, -3.8], [-16.98, 2.7, 5.8], { collide: false });
  for (const y of [1.45, 1.9, 2.35]) {
    B.box('barWood', [-17, y - 0.03, -4.2], [-16.62, y, 6.2]);
  }
  B.box('barWood', [-17, 2.75, -4.4], [-16.5, 2.85, 6.4], { collide: false });
  // bottles on shelves (props; can be smashed)
  for (const y of [1.45, 1.9, 2.35]) {
    for (let z = -3.9; z < 6.0; z += 0.19) {
      if (Math.random() < 0.18) continue;
      props.spawn(Math.random() < 0.55 ? 'liquor' : 'bottle', V(-16.82, y + 0.002, z + rand(-0.03, 0.03)), rand(0, 6.28), -1, { sleeping: true });
    }
  }
  // beer taps on the counter
  for (const z of [-0.5, 3.0]) {
    B.box('steel', [-14.75, 1.1, z - 0.4], [-14.6, 1.55, z + 0.4], { collide: false });
    B.box('steel', [-14.8, 1.48, z - 0.45], [-14.5, 1.56, z + 0.45], { collide: false });
    for (let k = 0; k < 4; k++) B.box('black', [-14.55, 1.3, z - 0.32 + k * 0.21], [-14.45, 1.48, z - 0.28 + k * 0.21], { collide: false });
    taps.push(V(-14.5, 1.1, z));
  }
  // stuff on the counter
  props.spawn('register', V(-14.68, 1.1, 5.4), Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    const z = rand(-4.6, 7.4);
    if (Math.abs(z - 5.4) < 0.4 || Math.abs(z - (-0.5)) < 0.5 || Math.abs(z - 3) < 0.5) continue;
    props.spawn(pick(['mug', 'pint', 'bottle', 'shot', 'ashtray']), V(-14.62 + rand(-0.08, 0.1), 1.1, z), rand(0, 6.28));
  }
  props.spawn('napkins', V(-14.6, 1.1, 1.5));
  props.spawn('bat', V(-15.55, 0.05, 2.4), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0.12)) });
  props.spawn('tray', V(-16.6, 1.0, 6.5), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)) });
  // stools
  for (let z = -4.3; z <= 7.2; z += 1.05) {
    const st = props.spawn('stool', V(-13.65, 0, z), rand(0, 6.28));
    seats.push({ pos: V(-13.62, 0, z), yaw: -Math.PI / 2, kind: 'stool', prop: st, taken: null, zone: 'bar' });
  }
  // standing at the bar
  for (let z = -3.8; z < 7; z += 2.1) spots.push({ pos: V(-13.4, 0, z + 0.5), yaw: -Math.PI / 2, kind: 'bar', taken: null, zone: 'bar' });
  work.push({ kind: 'bartender', pos: V(-15.7, 0, 1.5), yaw: Math.PI / 2, patrol: [V(-15.7, 0, -3.5), V(-15.7, 0, 1.5), V(-15.7, 0, 6.2)] });
  // pendant lights over the bar
  for (const z of [-2.5, 1.5, 5.5]) {
    B.box('trim', [-14.62, 2.55, z - 0.01], [-14.6, FLOOR2 - 0.22, z + 0.01], { collide: false });
    B.box('lampShade', [-14.85, 2.4, z - 0.25], [-14.35, 2.58, z + 0.25], { collide: false });
    B.box('bulb', [-14.7, 2.36, z - 0.1], [-14.5, 2.42, z + 0.1], { collide: false });
    B.light({ pos: [-14.6, 2.25, z], color: '#ffc27a', intensity: 9, distance: 7, kind: 'point', priority: 1.1, zone: 'bar' });
  }
  B.light({ pos: [-16.6, 2.0, 1.0], color: '#ff9a40', intensity: 4, distance: 6, kind: 'point', priority: 0.7, zone: 'bar' });
  B.neon('BAR', [-16.95, 3.35, 1.0], Math.PI / 2, '#ff2a2a', 0.7);
  B.neon('COLD BEER', [-16.95, 3.3, -3.0], Math.PI / 2, '#3aa0ff', 0.35, { flicker: 0.08 });
  B.neon('WHISKEY', [-16.95, 3.3, 5.0], Math.PI / 2, '#ffb030', 0.35);

  // ------------------------------------------------------------------ booths along the front wall
  const booth = (cx: number, cz: number, facing: 1 | -1) => {
    // benches at cz + facing*0.85 and cz - facing*0.85, table between
    for (const s of [-1, 1]) {
      const bz = cz + s * 0.85;
      const back = bz + s * 0.3;
      B.box('vinyl', [cx - 1.0, 0, bz - 0.28], [cx + 1.0, 0.46, bz + 0.28]);
      B.box('vinyl', [cx - 1.0, 0.46, back - 0.08], [cx + 1.0, 1.2, back + 0.08]);
      B.box('trim', [cx - 1.0, 1.2, back - 0.1], [cx + 1.0, 1.26, back + 0.1], { collide: false });
      for (const dx of [-0.5, 0.5]) seats.push({ pos: V(cx + dx, 0, bz), yaw: s > 0 ? Math.PI : 0, kind: 'bench', taken: null, zone: 'hall' });
    }
    props.spawn('table_square', V(cx, 0, cz), 0);
    props.spawn(pick(['mug', 'pint', 'bottle']), V(cx + rand(-0.3, 0.3), 0.8, cz + rand(-0.2, 0.2)), 0);
    props.spawn(pick(['ashtray', 'ketchup', 'napkins', 'bottle']), V(cx + rand(-0.3, 0.3), 0.8, cz + rand(-0.2, 0.2)), 0);
    void facing;
  };
  booth(-8.9, 10.75, 1);
  booth(-4.4, 10.75, 1);
  booth(4.4, 10.75, 1);
  booth(8.9, 10.75, 1);
  // bouncer at the door
  work.push({ kind: 'bouncer', pos: V(-1.8, 0, 10.6), yaw: Math.PI });
  work.push({ kind: 'bouncer', pos: V(1.8, 0, 10.6), yaw: Math.PI });

  // ------------------------------------------------------------------ hall tables
  const tableSet = (x: number, z: number, kind: 'table_round' | 'table_square' | 'table_long', chairs: number) => {
    const t = props.spawn(kind, V(x, 0, z), kind === 'table_long' ? 0 : rand(-0.2, 0.2));
    const r = kind === 'table_long' ? 0 : kind === 'table_round' ? 0.75 : 0.8;
    if (kind === 'table_long') {
      for (let i = 0; i < chairs; i++) {
        const side = i % 2 ? 1 : -1;
        const cx = x - 0.6 + Math.floor(i / 2) * 0.6;
        const c = props.spawn('chair', V(cx, 0, z + side * 0.7), side > 0 ? Math.PI : 0);
        seats.push({ pos: V(cx, 0, z + side * 0.7), yaw: side > 0 ? Math.PI : 0, kind: 'chair', prop: c, taken: null, zone: 'hall' });
      }
    } else {
      for (let i = 0; i < chairs; i++) {
        const a = (i / chairs) * Math.PI * 2 + rand(-0.2, 0.2);
        const cx = x + Math.sin(a) * r,
          cz = z + Math.cos(a) * r;
        const yaw = a + Math.PI;
        const c = props.spawn('chair', V(cx, 0, cz), yaw + Math.PI);
        seats.push({ pos: V(cx, 0, cz), yaw, kind: 'chair', prop: c, taken: null, zone: 'hall' });
      }
    }
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) props.spawn(pick(['mug', 'pint', 'bottle', 'bottle', 'ashtray', 'shot', 'plate']), V(x + rand(-0.25, 0.25), 0.79, z + rand(-0.25, 0.25)), rand(0, 6.28));
    for (let k = 0; k < 2; k++) spots.push({ pos: V(x + rand(-1.2, 1.2), 0, z + (k ? 1.3 : -1.3)), yaw: k ? Math.PI : 0, kind: 'stand', taken: null, zone: 'hall' });
    return t;
  };
  tableSet(-8.6, 6.8, 'table_round', 3);
  tableSet(-5.6, 4.4, 'table_square', 4);
  tableSet(-8.4, 2.2, 'table_round', 3);
  tableSet(-1.6, 6.9, 'table_round', 3);
  tableSet(1.6, 4.2, 'table_square', 4);
  tableSet(5.6, 6.6, 'table_round', 3);
  tableSet(6.4, 2.4, 'table_long', 6);
  tableSet(-6.2, -1.2, 'table_round', 2);
  tableSet(6.4, -2.6, 'table_round', 2);
  // floor clutter
  props.spawn('trash_can', V(-12.6, 0, 8.6));
  props.spawn('plant', V(-12.6, 0, 11.4));
  props.spawn('plant', V(10.6, 0, 11.4));
  props.spawn('menu_board', V(2.6, 0, 9.8), 0.4);
  props.spawn('extinguisher', V(-12.6, 0, -5.4));
  // hall lights: big pendants hanging in the void
  for (const [x, z] of [
    [-6, 5.5],
    [0, 5.5],
    [6, 5.5],
    [-6, -1],
    [6, -1],
  ]) {
    B.box('trim', [x - 0.015, 6.4, z - 0.015], [x + 0.015, ROOF - 1.3, z + 0.015], { collide: false });
    B.box('black', [x - 0.45, 6.15, z - 0.45], [x + 0.45, 6.4, z + 0.45], { collide: false });
    B.box('bulb', [x - 0.3, 6.08, z - 0.3], [x + 0.3, 6.16, z + 0.3], { collide: false });
    B.light({ pos: [x, 5.8, z], color: '#ffcf96', intensity: 34, distance: 13, kind: 'point', priority: 1.3, zone: 'hall' });
  }
  // under-balcony small lights
  for (const z of [-3.5, 1, 5.5]) {
    B.box('bulb', [-12.2, FLOOR2 - 0.3, z - 0.15], [-11.9, FLOOR2 - 0.22, z + 0.15], { collide: false });
    B.light({ pos: [-12.1, FLOOR2 - 0.6, z], color: '#ffc080', intensity: 5, distance: 6, kind: 'point', priority: 0.6, zone: 'hall' });
  }
  for (const x of [-6, 0, 6]) {
    B.box('bulb', [x - 0.15, FLOOR2 - 0.3, 10.4], [x + 0.15, FLOOR2 - 0.22, 10.7], { collide: false });
    B.light({ pos: [x, FLOOR2 - 0.6, 10.5], color: '#ffc080', intensity: 6, distance: 6, kind: 'point', priority: 0.7, zone: 'hall' });
  }

  // ------------------------------------------------------------------ STAGE + dance floor + jukebox
  B.box('stage', [-4.6, 0, -5.9], [4.6, 0.55, -3.8]);
  B.box('stage', [-3.2, 0, -3.8], [3.2, 0.27, -3.45]);
  B.box('trim', [-4.6, 0.5, -3.85], [4.6, 0.56, -3.75], { collide: false });
  B.box('curtain', [-4.8, 0.55, -5.88], [4.8, FLOOR2 - 0.25, -5.82], { collide: false });
  for (let x = -4.6; x <= 4.6; x += 0.4) B.box('curtain', [x - 0.06, 0.55, -5.82], [x + 0.06, FLOOR2 - 0.25, -5.75], { collide: false });
  props.spawn('drum', V(0, 0.55, -5.0), 0, 0);
  props.spawn('drum', V(-0.8, 0.55, -4.6), 0, 1);
  props.spawn('drum', V(0.8, 0.55, -4.6), 0, 1);
  props.spawn('cymbal', V(-1.3, 0.55, -5.0));
  props.spawn('cymbal', V(1.3, 0.55, -5.2));
  props.spawn('amp', V(-2.9, 0.55, -5.3), 0.2);
  props.spawn('amp', V(2.9, 0.55, -5.3), -0.2);
  props.spawn('speaker', V(-4.1, 0.55, -4.4), 0.4);
  props.spawn('speaker', V(4.1, 0.55, -4.4), -0.4);
  props.spawn('mic_stand', V(0, 0.55, -4.05));
  props.spawn('mic_stand', V(-2.0, 0.55, -4.2));
  props.spawn('guitar', V(2.1, 0.62, -4.9), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2, 0.3, 0)) });
  work.push({ kind: 'guitarist', pos: V(-2.0, 0.55, -4.5), yaw: 0 });
  work.push({ kind: 'drummer', pos: V(0, 0.55, -5.45), yaw: 0 });
  work.push({ kind: 'singer', pos: V(0.0, 0.55, -4.45), yaw: 0 });
  B.neon('LIVE MUSIC', [0, 3.3, -5.7], 0, '#ff40c0', 0.42);
  B.light({ pos: [-3, 3.6, -2.5], color: '#ff30a0', intensity: 30, distance: 9, kind: 'spot', target: V(-1.5, 0.6, -4.8), angle: 0.6, penumbra: 0.5, priority: 1.2, disco: true, zone: 'stage' });
  B.light({ pos: [3, 3.6, -2.5], color: '#30c0ff', intensity: 30, distance: 9, kind: 'spot', target: V(1.5, 0.6, -4.8), angle: 0.6, penumbra: 0.5, priority: 1.2, disco: true, zone: 'stage' });

  // dance floor (animated emissive tiles)
  const dance = makeDanceFloor(8, 4.4);
  dance.position.set(0, 0.012, -1.2);
  scene.add(dance);
  B.collider([0, 0.006, -1.2], [8, 0.012, 4.4], 'tile');
  for (let i = 0; i < 12; i++) spots.push({ pos: V(rand(-3.5, 3.5), 0, rand(-3.1, 0.7)), yaw: rand(-1, 1), kind: 'dance', taken: null, zone: 'dance' });
  // disco ball
  const disco = makeDiscoBall();
  disco.position.set(0, 6.4, -1.2);
  scene.add(disco);
  B.box('trim', [-0.01, 6.7, -1.21], [0.01, ROOF - 0.3, -1.19], { collide: false });
  B.light({ pos: [0, 6.0, -1.2], color: '#ff40ff', intensity: 22, distance: 11, kind: 'point', priority: 1.0, disco: true, zone: 'dance' });
  B.light({ pos: [0, 5.0, 0.5], color: '#40ffd0', intensity: 16, distance: 10, kind: 'point', priority: 0.9, disco: true, zone: 'dance' });
  animated.push((t) => {
    disco.rotation.y = t * 0.6;
  });

  // jukebox
  const juke = makeJukebox();
  juke.position.set(-6.6, 0, -5.55);
  scene.add(juke);
  const jukeCol = B.collider([-6.6, 0.8, -5.55], [0.9, 1.6, 0.6], 'wood');
  spots.push({ pos: V(-6.6, 0, -4.6), yaw: Math.PI, kind: 'jukebox', taken: null, zone: 'hall' });
  B.light({ pos: [-6.6, 1.4, -4.9], color: '#ffb040', intensity: 6, distance: 5, kind: 'point', priority: 0.9, flicker: 0.0, zone: 'hall' });

  // ------------------------------------------------------------------ POOL area (right aisle)
  const poolTable = (cx: number, cz: number) => {
    const L = 2.6,
      W = 1.45;
    B.box('barWood', [cx - W / 2, 0.2, cz - L / 2], [cx + W / 2, 0.74, cz + L / 2]);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      B.box('barWood', [cx + dx * (W / 2 - 0.12) - 0.09, 0, cz + dz * (L / 2 - 0.12) - 0.09], [cx + dx * (W / 2 - 0.12) + 0.09, 0.2, cz + dz * (L / 2 - 0.12) + 0.09]);
    B.box('felt', [cx - W / 2 + 0.12, 0.74, cz - L / 2 + 0.12], [cx + W / 2 - 0.12, 0.78, cz + L / 2 - 0.12]);
    // cushions/rails
    B.box('barWood', [cx - W / 2, 0.74, cz - L / 2], [cx - W / 2 + 0.12, 0.84, cz + L / 2]);
    B.box('barWood', [cx + W / 2 - 0.12, 0.74, cz - L / 2], [cx + W / 2, 0.84, cz + L / 2]);
    B.box('barWood', [cx - W / 2, 0.74, cz - L / 2], [cx + W / 2, 0.84, cz - L / 2 + 0.12]);
    B.box('barWood', [cx - W / 2, 0.74, cz + L / 2 - 0.12], [cx + W / 2, 0.84, cz + L / 2]);
    // pockets
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ])
      B.box('black', [cx + dx * (W / 2 - 0.1) - 0.05, 0.84, cz + dz * (L / 2 - 0.1) - 0.05], [cx + dx * (W / 2 - 0.1) + 0.05, 0.845, cz + dz * (L / 2 - 0.1) + 0.05], { collide: false });
    // balls in a rack
    let k = 0;
    for (let row = 0; row < 5; row++)
      for (let i = 0; i <= row; i++) {
        props.spawn('pool_ball', V(cx + (i - row / 2) * 0.058, 0.78, cz - 0.6 - row * 0.05), 0, (k++ % 15) + 1, { sleeping: true });
      }
    props.spawn('pool_ball', V(cx, 0.78, cz + 0.6), 0, 0, { sleeping: true });
    props.spawn('pool_cue', V(cx + W / 2 - 0.25, 0.86, cz), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), sleeping: true });
    // hanging lamp
    B.box('trim', [cx - 0.01, 1.95, cz - 0.6], [cx + 0.01, FLOOR2 - 0.22, cz - 0.58], { collide: false });
    B.box('trim', [cx - 0.01, 1.95, cz + 0.58], [cx + 0.01, FLOOR2 - 0.22, cz + 0.6], { collide: false });
    B.box('lampShade', [cx - 0.3, 1.8, cz - 0.9], [cx + 0.3, 1.98, cz + 0.9], { collide: false });
    B.box('bulb', [cx - 0.22, 1.76, cz - 0.8], [cx + 0.22, 1.8, cz + 0.8], { collide: false });
    B.light({ pos: [cx, 1.7, cz], color: '#fff0c8', intensity: 26, distance: 6, kind: 'spot', target: V(cx, 0.7, cz), angle: 0.95, penumbra: 0.6, priority: 1.2, zone: 'pool' });
    poolTables.push({ center: V(cx, 0.78, cz), size: [W - 0.24, L - 0.24] });
    for (const [dx, dz, yaw] of [
      [-1.25, 0, Math.PI / 2],
      [1.25, -0.5, -Math.PI / 2],
      [0, 1.75, Math.PI],
      [0, -1.75, 0],
    ] as [number, number, number][])
      spots.push({ pos: V(cx + dx, 0, cz + dz), yaw, kind: 'pool', taken: null, zone: 'pool', data: { table: poolTables.length - 1 } });
  };
  poolTable(14.0, -2.8);
  poolTable(14.0, 3.4);
  // cue rack + extra cues
  B.box('barWood', [16.92, 0.9, 0.0], [17.0, 2.2, 0.9], { collide: false });
  for (let i = 0; i < 3; i++) props.spawn('pool_cue', V(16.7, 0.05, 0.15 + i * 0.3), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.12)), sleeping: true });
  // dartboards
  for (const z of [7.2, 8.6]) {
    const db = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 16), new THREE.MeshStandardMaterial({ map: dartTexture(), roughness: 0.8 }));
    db.rotation.z = Math.PI / 2;
    db.rotation.y = 0;
    db.position.set(16.97, 1.73, z);
    scene.add(db);
    B.box('barWood', [16.94, 1.38, z - 0.4], [17.0, 2.1, z + 0.4], { collide: false });
    spots.push({ pos: V(14.6, 0, z), yaw: -Math.PI / 2, kind: 'darts', taken: null, zone: 'pool' });
    for (let d = 0; d < 3; d++) props.spawn('dart', V(16.6, 0.95 + 0.02 * d, z + 0.3), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), sleeping: true });
  }
  B.box('barWood', [16.4, 0, 6.8], [17, 0.95, 9.0]);
  B.neon('POOL', [16.95, 3.0, 0.4], -Math.PI / 2, '#30ff60', 0.55);
  B.neon('DARTS', [16.95, 2.75, 7.9], -Math.PI / 2, '#ffe030', 0.32);
  for (const z of [-4.5, 0.4, 6.0]) B.light({ pos: [15.6, 3.2, z], color: '#ffc080', intensity: 9, distance: 8, kind: 'point', priority: 0.8, zone: 'pool' });

  // ------------------------------------------------------------------ arcade corner
  props.spawn('arcade', V(12.3, 0, 11.45), Math.PI, 0);
  props.spawn('arcade', V(13.15, 0, 11.45), Math.PI, 1);
  props.spawn('pinball', V(15.6, 0, 10.9), Math.PI);
  spots.push({ pos: V(12.3, 0, 10.6), yaw: 0, kind: 'arcade', taken: null, zone: 'arcade' });
  spots.push({ pos: V(13.15, 0, 10.6), yaw: 0, kind: 'arcade', taken: null, zone: 'arcade' });
  spots.push({ pos: V(15.6, 0, 9.85), yaw: 0, kind: 'arcade', taken: null, zone: 'arcade' });
  B.light({ pos: [13.5, 2.4, 10.2], color: '#6080ff', intensity: 6, distance: 6, kind: 'point', priority: 0.7, zone: 'arcade' });
  B.neon('GAMES', [12.6, 3.25, 11.88], Math.PI, '#ff40ff', 0.4);

  // ------------------------------------------------------------------ kitchen
  // counters along back wall
  B.box('steel', [-16.9, 0, -13.95], [-8.0, 0.92, -13.25]);
  B.box('steel', [-16.95, 0.92, -14.0], [-7.95, 0.97, -13.2]);
  // stove
  B.box('black', [-14.2, 0.97, -13.9], [-12.6, 1.0, -13.3], { collide: false });
  for (const dx of [-13.8, -13.0]) for (const dz of [-13.75, -13.45]) B.box('bulbRed', [dx - 0.12, 1.0, dz - 0.08], [dx + 0.12, 1.01, dz + 0.08], { collide: false });
  B.box('steel', [-14.4, 1.9, -14.0], [-12.4, 2.4, -13.3], { collide: false });
  // sink
  B.box('black', [-10.8, 0.9, -13.85], [-10.0, 0.97, -13.35], { collide: false });
  B.box('steel', [-10.45, 0.97, -13.95], [-10.35, 1.3, -13.85], { collide: false });
  // island
  B.box('steel', [-14.2, 0, -10.6], [-10.2, 0.92, -9.5]);
  B.box('barWood', [-14.25, 0.92, -10.65], [-10.15, 0.97, -9.45], { uv: 0.8 });
  // fridge
  B.box('steel', [-16.95, 0, -8.2], [-15.9, 2.2, -6.2]);
  B.box('black', [-15.92, 1.0, -7.3], [-15.86, 1.6, -7.2], { collide: false });
  // shelves
  B.box('steel', [-16.95, 1.4, -12.5], [-16.55, 1.44, -9.0], { collide: false });
  B.box('steel', [-16.95, 1.9, -12.5], [-16.55, 1.94, -9.0], { collide: false });
  // kitchen weapons & clutter
  props.spawn('knife', V(-11.6, 0.97, -13.6), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0.5, 0)), sleeping: true });
  props.spawn('knife', V(-11.3, 0.97, -13.55), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, -0.3, 0)), sleeping: true });
  props.spawn('cleaver', V(-12.2, 0.97, -10.1), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 1.2, 0)), sleeping: true });
  props.spawn('knife', V(-13.2, 0.97, -9.9), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 2.2, 0)), sleeping: true });
  props.spawn('pan', V(-13.4, 1.0, -13.6), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), sleeping: true });
  props.spawn('pan', V(-15.5, 0.97, -13.6), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0.4, 0)), sleeping: true });
  props.spawn('rolling_pin', V(-11.0, 0.97, -10.0), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0.2, 0)), sleeping: true });
  for (let i = 0; i < 5; i++) props.spawn('plate', V(-9.0, 0.97 + i * 0.02, -13.6), 0, 0, { sleeping: true });
  for (let i = 0; i < 4; i++) props.spawn('plate', V(-12.8 + i * 0.3, 0.97, -10.0), 0, 0, { sleeping: true });
  props.spawn('box', V(-16.6, 0, -12.8));
  props.spawn('box', V(-16.6, 0.33, -12.8));
  props.spawn('bucket', V(-8.5, 0, -11.5));
  props.spawn('trash_can', V(-8.3, 0, -7.0));
  props.spawn('extinguisher', V(-7.5, 0, -13.6));
  work.push({ kind: 'cook', pos: V(-13.3, 0, -12.7), yaw: Math.PI, patrol: [V(-13.3, 0, -12.7), V(-11.0, 0, -12.7), V(-12.2, 0, -11.2)] });
  work.push({ kind: 'waitress', pos: V(-9.0, 0, -8.0), yaw: 0 });
  for (const x of [-14.5, -10.0]) {
    B.box('bulbCool', [x - 0.6, FLOOR2 - 0.28, -10.1], [x + 0.6, FLOOR2 - 0.22, -9.9], { collide: false });
    B.light({ pos: [x, FLOOR2 - 0.5, -10], color: '#e8f4ff', intensity: 14, distance: 8, kind: 'point', priority: 0.9, zone: 'kitchen' });
  }
  doors.push(new Door(scene, V(-16.42, 0, -6.0), { width: 1.05, height: 2.25, rotY: 0, tex: 'woodPanel', sign: 'STAFF' }));
  // saloon doors hang at mid height
  doors.push(new Door(scene, V(-9.68, 0.45, -6.0), { width: 0.72, height: 1.3, rotY: 0, saloon: true, tex: 'woodPanel', color: '#c8a070' }));
  doors.push(new Door(scene, V(-8.22, 0.45, -6.0), { width: 0.72, height: 1.3, rotY: Math.PI, saloon: true, tex: 'woodPanel', color: '#c8a070' }));
  doors.push(new Door(scene, V(-7.0, 0, -10.48), { width: 1.15, height: 2.25, rotY: -Math.PI / 2, tex: 'woodPanel' }));

  // ------------------------------------------------------------------ storage
  for (const [x0, x1, z0, z1] of [
    [-6.8, -5.3, -11.8, -6.4],
    [4.4, 6.8, -13.8, -13.0],
  ]) {
    B.box('metal', [x0, 0, z0], [x1, 0.05, z1], { collide: false });
    for (const y of [0.05, 0.85, 1.65, 2.4]) B.box('metal', [x0, y, z0], [x1, y + 0.04, z1]);
    for (const xx of [x0 + 0.03, x1 - 0.03]) for (const zz of [z0 + 0.03, z1 - 0.03]) B.box('metal', [xx - 0.03, 0, zz - 0.03], [xx + 0.03, 2.45, zz + 0.03]);
  }
  for (let i = 0; i < 4; i++) props.spawn('box', V(-6.05, 0.89, -10.8 + i * 1.1), rand(-0.2, 0.2));
  for (let i = 0; i < 3; i++) props.spawn('crate_beer', V(-6.05, 1.69, -10.5 + i * 1.3), rand(-0.2, 0.2));
  for (let i = 0; i < 4; i++) props.spawn('keg', V(2.2 + (i % 2) * 0.45, 0, -10.0 + Math.floor(i / 2) * 0.45));
  props.spawn('keg', V(2.4, 0.61, -9.8));
  props.spawn('barrel', V(-1.0, 0, -8.0));
  props.spawn('barrel', V(-0.3, 0, -7.2));
  for (let i = 0; i < 5; i++) props.spawn('crate', V(4.0 + (i % 3) * 0.6, Math.floor(i / 3) * 0.46, -7.3), rand(-0.3, 0.3));
  props.spawn('crate_beer', V(5.0, 0, -11.5));
  props.spawn('crate_beer', V(5.0, 0.34, -11.5));
  props.spawn('mop', V(-4.4, 0.02, -7.0), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0)) });
  props.spawn('broom', V(-4.0, 0.02, -7.0), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, -0.1)) });
  props.spawn('bucket', V(-4.6, 0, -6.6));
  // workbench with tools
  B.box('barWood', [2.0, 0, -13.85], [4.2, 0.9, -13.0]);
  props.spawn('wrench', V(2.5, 0.9, -13.4), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0.4, 0)), sleeping: true });
  props.spawn('tire_iron', V(3.2, 0.92, -13.5), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 1.4, 0)), sleeping: true });
  props.spawn('chain', V(3.8, 0.92, -13.3), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), sleeping: true });
  B.box('bulb', [0.85, FLOOR2 - 0.34, -9.6], [1.05, FLOOR2 - 0.22, -9.4], { collide: false });
  B.light({ pos: [0.95, FLOOR2 - 0.6, -9.5], color: '#ffd080', intensity: 8, distance: 8, kind: 'point', priority: 0.7, flicker: 0.04, zone: 'storage' });
  B.box('bulb', [-3.2, FLOOR2 - 0.34, -12.8], [-3.0, FLOOR2 - 0.22, -12.6], { collide: false });
  B.light({ pos: [-3.1, FLOOR2 - 0.6, -12.0], color: '#ffd080', intensity: 6, distance: 7, kind: 'point', priority: 0.6, zone: 'storage' });
  doors.push(new Door(scene, V(5.02, 0, -6.0), { width: 1.26, height: 2.25, rotY: 0, tex: 'woodPanel', sign: 'STORAGE' }));
  // back door (exit for reinforcements)
  B.box('black', [3.4, 0, -13.98], [4.6, 2.2, -13.95], { collide: false });
  B.neon('EXIT', [4.0, 2.5, -13.9], 0, '#30ff60', 0.22, { light: false });

  // ------------------------------------------------------------------ restrooms
  const rrRoom = (z0: number, z1: number, mens: boolean) => {
    // stalls along the outer wall x=17
    const stalls = mens ? 2 : 3;
    const stallW = 1.3;
    for (let i = 0; i < stalls; i++) {
      const sz0 = z0 + 0.15 + i * stallW;
      // partition walls
      B.box('white', [15.4, 0.12, sz0 - 0.03], [17, 2.0, sz0 + 0.03]);
      // toilet
      B.box('white', [16.35, 0, sz0 + stallW / 2 - 0.22], [16.95, 0.42, sz0 + stallW / 2 + 0.22]);
      B.box('white', [16.75, 0.42, sz0 + stallW / 2 - 0.24], [16.95, 0.85, sz0 + stallW / 2 + 0.24]);
      spots.push({ pos: V(16.1, 0, sz0 + stallW / 2), yaw: Math.PI / 2, kind: 'piss', taken: null, zone: 'bathroom' });
      // stall door
      doors.push(new Door(scene, V(15.4, 0.12, sz0 + 0.04), { width: stallW - 0.1, height: 1.8, rotY: -Math.PI / 2, tex: 'woodPanel', color: '#8aa0b0', thickness: 0.04, maxAngle: 1.6 }));
    }
    B.box('white', [15.4, 0.12, z0 + 0.15 + stalls * stallW - 0.03], [17, 2.0, z0 + 0.15 + stalls * stallW + 0.03]);
    if (mens) {
      for (const z of [z1 - 0.9, z1 - 1.7]) {
        B.box('white', [16.7, 0.4, z - 0.22], [16.98, 1.2, z + 0.22]);
        spots.push({ pos: V(16.3, 0, z), yaw: Math.PI / 2, kind: 'piss', taken: null, zone: 'bathroom' });
      }
    }
    // sinks + mirror on the corridor-side wall (x=9.1)
    for (const z of [z0 + 1.2, z0 + 2.3]) {
      B.box('white', [9.1, 0.75, z - 0.3], [9.6, 0.9, z + 0.3]);
      B.box('steel', [9.1, 0.9, z - 0.04], [9.25, 1.15, z + 0.04], { collide: false });
    }
    const mirror = new GlassPane(scene, V(9.13, 1.65, z0 + 1.75), 1.9, 0.8, Math.PI / 2, undefined, 0xc8d8e0);
    glass.push(mirror);
    const lx = 12.5;
    B.box('bulbCool', [lx - 0.6, FLOOR2 - 0.28, (z0 + z1) / 2 - 0.1], [lx + 0.6, FLOOR2 - 0.22, (z0 + z1) / 2 + 0.1], { collide: false });
    B.light({ pos: [lx, FLOOR2 - 0.5, (z0 + z1) / 2], color: '#d8f0ff', intensity: 10, distance: 7, kind: 'point', priority: 0.8, flicker: mens ? 0.18 : 0.04, zone: 'bathroom' });
  };
  rrRoom(-14, -10.1, true);
  rrRoom(-9.9, -6.0, false);
  doors.push(new Door(scene, V(9.0, 0, -12.68), { width: 1.05, height: 2.15, rotY: Math.PI / 2, tex: 'woodPanel', sign: 'MEN' }));
  doors.push(new Door(scene, V(9.0, 0, -8.68), { width: 1.05, height: 2.15, rotY: Math.PI / 2, tex: 'woodPanel', sign: 'WOMEN' }));
  B.box('bulbCool', [7.6, FLOOR2 - 0.28, -10.2], [8.4, FLOOR2 - 0.22, -9.8], { collide: false });
  B.light({ pos: [8.0, FLOOR2 - 0.5, -10], color: '#d8f0ff', intensity: 6, distance: 6, kind: 'point', priority: 0.6, flicker: 0.1, zone: 'bathroom' });
  props.spawn('phone', V(7.4, 1.2, -13.6), Math.PI / 2, 0, { sleeping: true });
  B.box('metal', [7.1, 1.0, -13.9], [7.6, 1.2, -13.3]);
  props.spawn('mop', V(8.6, 0.02, -13.6), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0.1)) });
  props.spawn('bucket', V(8.3, 0, -13.2));
  B.neon('RESTROOMS', [8.05, 2.75, -5.88], 0, '#40d0ff', 0.2, { light: false });

  // ------------------------------------------------------------------ SECOND FLOOR: west balcony private booths
  const y = FLOOR2;
  for (const cz of [8.6, 3.6, -1.4]) {
    // half walls
    for (const s of [-1.3, 1.3]) B.box('panel', [-17, y, cz + s - 0.06], [-14.4, y + 1.45, cz + s + 0.06]);
    B.box('trim', [-17, y + 1.45, cz - 1.36], [-14.4, y + 1.52, cz + 1.36], { collide: false });
    // bench along the wall
    B.box('vinyl', [-17, y, cz - 1.2], [-16.4, y + 0.46, cz + 1.2]);
    B.box('vinyl', [-17, y + 0.46, cz - 1.2], [-16.85, y + 1.15, cz + 1.2]);
    for (const dz of [-0.6, 0.0, 0.6]) seats.push({ pos: V(-16.55, y, cz + dz), yaw: Math.PI / 2, kind: 'bench', taken: null, zone: 'balconyL' });
    props.spawn('table_square', V(-15.6, y, cz), 0);
    for (const dz of [-0.45, 0.45]) {
      const c = props.spawn('chair', V(-14.85, y, cz + dz), -Math.PI / 2);
      seats.push({ pos: V(-14.85, y, cz + dz), yaw: -Math.PI / 2 + Math.PI, kind: 'chair', prop: c, taken: null, zone: 'balconyL' });
    }
    for (let i = 0; i < 2; i++) props.spawn(pick(['bottle', 'mug', 'pint', 'liquor', 'ashtray']), V(-15.6 + rand(-0.25, 0.25), y + 0.79, cz + rand(-0.25, 0.25)));
    B.box('bulbRed', [-16.95, y + 2.0, cz - 0.15], [-16.9, y + 2.3, cz + 0.15], { collide: false });
    B.light({ pos: [-16.3, y + 2.2, cz], color: '#ff7050', intensity: 5, distance: 5, kind: 'point', priority: 0.6, zone: 'balconyL' });
  }
  // watching spots along railings
  for (let z = -4.5; z < 8.5; z += 2.2) spots.push({ pos: V(-11.65, y, z), yaw: Math.PI / 2, kind: 'watch', taken: null, zone: 'balconyL' });
  for (let z = -4.5; z < 8.5; z += 2.2) if (z < 0.4 || z > 2.4) spots.push({ pos: V(11.65, y, z), yaw: -Math.PI / 2, kind: 'watch', taken: null, zone: 'balconyR' });
  for (let x = -9; x < 9.5; x += 2.4) spots.push({ pos: V(x, y, 9.65), yaw: Math.PI, kind: 'watch', taken: null, zone: 'balconyF' });
  for (let x = -9; x < 9.5; x += 2.4) spots.push({ pos: V(x, y, -6.65), yaw: 0, kind: 'watch', taken: null, zone: 'vip' });
  // balcony tables near railings (east)
  for (const z of [-3.5, 4.8]) {
    props.spawn('table_round', V(12.4, y, z));
    for (const dz of [-0.75, 0.75]) {
      const c = props.spawn('stool', V(12.4, y, z + dz));
      seats.push({ pos: V(12.4, y, z + dz), yaw: dz > 0 ? Math.PI : 0, kind: 'stool', prop: c, taken: null, zone: 'balconyR' });
    }
    props.spawn(pick(['bottle', 'mug']), V(12.4, y + 0.79, z));
  }
  // east upstairs mini bar
  B.box('barWood', [15.6, y, -5.0], [16.2, y + 1.02, 1.0]);
  B.box('barWood', [15.55, y + 1.02, -5.05], [16.3, y + 1.1, 1.05], { uv: 0.8 });
  B.box('barWood', [16.6, y, -5.0], [17, y + 0.95, 1.0]);
  for (let z = -4.7; z < 0.8; z += 0.22) if (Math.random() < 0.75) props.spawn(pick(['bottle', 'liquor']), V(16.8, y + 0.95, z), 0, -1, { sleeping: true });
  for (let i = 0; i < 4; i++) props.spawn(pick(['mug', 'pint', 'shot']), V(15.9, y + 1.1, -4.4 + i * 1.4));
  for (const z of [-4.0, -2.0, 0.0]) {
    const c = props.spawn('stool', V(14.95, y, z));
    seats.push({ pos: V(14.95, y, z), yaw: Math.PI / 2, kind: 'stool', prop: c, taken: null, zone: 'balconyR' });
  }
  work.push({ kind: 'bartender2', pos: V(16.35, y, -2.0), yaw: -Math.PI / 2, patrol: [V(16.35, y, -4.4), V(16.35, y, 0.4)] });
  B.neon('SALOON', [16.95, y + 2.6, -2.0], -Math.PI / 2, '#ff8a20', 0.45);
  for (const z of [-4.5, 3.5]) B.light({ pos: [14.5, y + 2.6, z], color: '#ffc080', intensity: 9, distance: 8, kind: 'point', priority: 0.7, zone: 'balconyR' });
  B.light({ pos: [-14.0, y + 2.8, 6.0], color: '#ffc080', intensity: 8, distance: 8, kind: 'point', priority: 0.6, zone: 'balconyL' });
  B.light({ pos: [-14.0, y + 2.8, -3.0], color: '#ffc080', intensity: 8, distance: 8, kind: 'point', priority: 0.6, zone: 'balconyL' });
  // front balcony high tables
  for (const x of [-6, 0, 6]) {
    props.spawn('table_round', V(x, y, 10.9));
    props.spawn(pick(['bottle', 'mug', 'ashtray']), V(x, y + 0.79, 10.9));
    const c = props.spawn('chair', V(x + 0.75, y, 10.9), -Math.PI / 2);
    seats.push({ pos: V(x + 0.75, y, 10.9), yaw: Math.PI / 2, kind: 'chair', prop: c, taken: null, zone: 'balconyF' });
  }
  B.light({ pos: [0, y + 2.6, 10.8], color: '#ffc080', intensity: 9, distance: 9, kind: 'point', priority: 0.6, zone: 'balconyF' });
  // big neon sign hanging from the front balcony, facing the stage
  B.neon('THE IRON HORSE', [0, 3.35, 8.8], Math.PI, '#ff3020', 0.75, { frame: true, flicker: 0.02 });

  // ------------------------------------------------------------------ VIP lounge
  const vy = FLOOR2;
  const couchSet = (cx: number, cz: number) => {
    props.spawn('coffee_table', V(cx, vy, cz));
    const c1 = props.spawn('couch', V(cx, vy, cz - 1.1), 0, 1);
    for (const dx of [-0.6, 0, 0.6]) seats.push({ pos: V(cx + dx, vy, cz - 1.05), yaw: 0, kind: 'couch', prop: c1, taken: null, zone: 'vip' });
    const c2 = props.spawn('armchair', V(cx - 1.5, vy, cz), Math.PI / 2);
    seats.push({ pos: V(cx - 1.45, vy, cz), yaw: Math.PI / 2, kind: 'couch', prop: c2, taken: null, zone: 'vip' });
    for (let i = 0; i < 3; i++) props.spawn(pick(['liquor', 'shot', 'shot', 'ashtray', 'mug']), V(cx + rand(-0.4, 0.4), vy + 0.42, cz + rand(-0.15, 0.15)));
  };
  couchSet(-6.5, -9.2);
  couchSet(-1.0, -8.6);
  couchSet(5.5, -9.4);
  // boss throne
  const throne = props.spawn('armchair', V(8.5, vy, -12.4), 0);
  seats.push({ pos: V(8.5, vy, -12.35), yaw: 0, kind: 'couch', prop: throne, taken: null, zone: 'vip' });
  work.push({ kind: 'boss', pos: V(8.5, vy, -12.35), yaw: 0 });
  props.spawn('sledgehammer', V(9.3, vy + 0.02, -12.9), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0.1)) });
  props.spawn('trophy', V(4.5, vy + 1.02, -13.6), 0);
  // private bar
  B.box('barWood', [2.2, vy, -13.9], [7.0, vy + 1.02, -13.3]);
  B.box('barWood', [2.15, vy + 1.02, -13.95], [7.05, vy + 1.1, -13.25], { uv: 0.8 });
  for (let x = 2.5; x < 6.8; x += 0.3) if (Math.random() < 0.7) props.spawn(pick(['liquor', 'bottle', 'shot']), V(x, vy + 1.1, -13.6));
  B.box('carpet', [-11, vy, -6.0], [11, vy + 0.005, -5.95], { collide: false });
  B.neon('VIP', [0, vy + 3.0, -13.9], 0, '#c040ff', 0.8);
  for (const [x, z, c] of [
    [-6, -9.5, '#ff2040'],
    [0, -9.5, '#a040ff'],
    [6, -10, '#ff2040'],
  ] as [number, number, string][])
    B.light({ pos: [x, vy + 2.8, z], color: c, intensity: 10, distance: 8, kind: 'point', priority: 0.8, zone: 'vip' });
  // ceiling fans (visual)
  for (const [x, z] of [
    [-5, -10],
    [4, -10],
    [-14, 2],
    [14, 2],
  ]) {
    const fan = makeFan();
    fan.position.set(x, ROOF - 0.6, z);
    scene.add(fan);
    animated.push((t) => (fan.rotation.y = t * 4.5));
  }

  // ------------------------------------------------------------------ staff room
  for (let i = 0; i < 5; i++) B.box('metal', [-16.95, vy, -13.6 + i * 0.62], [-16.45, vy + 1.9, -13.05 + i * 0.62]);
  props.spawn('table_square', V(-13.5, vy, -10.5));
  for (const [dx, dz] of [
    [0.75, 0],
    [-0.75, 0],
  ]) {
    const c = props.spawn('chair', V(-13.5 + dx, vy, -10.5 + dz), dx > 0 ? -Math.PI / 2 : Math.PI / 2);
    seats.push({ pos: V(-13.5 + dx, vy, -10.5 + dz), yaw: dx > 0 ? Math.PI / 2 : -Math.PI / 2, kind: 'chair', prop: c, taken: null, zone: 'staff' });
  }
  props.spawn('couch', V(-13.8, vy, -7.0), Math.PI, 0);
  props.spawn('box', V(-11.6, vy, -13.5));
  props.spawn('extinguisher', V(-11.5, vy, -6.6));
  B.light({ pos: [-14, vy + 2.8, -10], color: '#fff0d8', intensity: 9, distance: 8, kind: 'point', priority: 0.6, flicker: 0.05, zone: 'staff' });
  doors.push(new Door(scene, V(-15.18, vy, -6.0), { width: 1.06, height: 2.25, rotY: 0, tex: 'woodPanel', sign: 'STAFF' }));

  // ------------------------------------------------------------------ card room
  props.spawn('table_round', V(14.0, vy, -10.0), 0, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const c = props.spawn('chair', V(14 + Math.sin(a) * 0.8, vy, -10 + Math.cos(a) * 0.8), a);
    seats.push({ pos: V(14 + Math.sin(a) * 0.8, vy, -10 + Math.cos(a) * 0.8), yaw: a + Math.PI, kind: 'chair', prop: c, taken: null, zone: 'poker' });
  }
  for (let i = 0; i < 3; i++) props.spawn(pick(['shot', 'liquor', 'ashtray']), V(14 + rand(-0.3, 0.3), vy + 0.79, -10 + rand(-0.3, 0.3)));
  B.box('lampShade', [13.7, vy + 1.9, -10.3], [14.3, vy + 2.05, -9.7], { collide: false });
  B.box('trim', [13.99, vy + 2.05, -10.01], [14.01, ROOF, -9.99], { collide: false });
  B.light({ pos: [14, vy + 1.8, -10], color: '#e8ffc8', intensity: 12, distance: 6, kind: 'spot', target: V(14, vy + 0.7, -10), angle: 0.9, penumbra: 0.6, priority: 0.7, zone: 'poker' });
  B.box('metal', [16.2, vy, -13.9], [17, vy + 1.1, -13.1]);
  doors.push(new Door(scene, V(13.42, vy, -6.0), { width: 1.06, height: 2.25, rotY: 0, tex: 'woodPanel' }));
  doors.push(new Door(scene, V(11.0, vy, -11.18), { width: 1.06, height: 2.25, rotY: -Math.PI / 2, tex: 'woodPanel' }));
  doors.push(new Door(scene, V(-11.0, vy, -11.18), { width: 1.06, height: 2.25, rotY: -Math.PI / 2, tex: 'woodPanel' }));

  // ------------------------------------------------------------------ office
  B.box('barWood', [15.2, vy, 9.2], [16.6, vy + 0.78, 10.2]);
  props.spawn('office_chair', V(15.9, vy, 10.7), Math.PI);
  props.spawn('file_cabinet', V(16.7, vy, 6.6), -Math.PI / 2);
  props.spawn('phone', V(15.5, vy + 0.78, 9.5), 0.3);
  props.spawn('liquor', V(16.2, vy + 0.78, 9.4));
  B.box('metal', [16.3, vy, 11.2], [17, vy + 1.0, 11.95]);
  B.light({ pos: [15.6, vy + 2.4, 9.5], color: '#ffe0a0', intensity: 7, distance: 6, kind: 'point', priority: 0.6, zone: 'office' });
  doors.push(new Door(scene, V(13.5, vy, 7.42), { width: 1.06, height: 2.25, rotY: -Math.PI / 2, tex: 'woodPanel', sign: 'OFFICE' }));

  // ------------------------------------------------------------------ wall decor
  const posters: [string, [number, number, number], number][] = [
    ['A', [-12.2, 2.0, 11.97], Math.PI],
    ['B', [10.9, 2.0, 11.97], Math.PI],
    ['C', [16.97, 2.2, -5.0], -Math.PI / 2],
    ['A', [-16.97, 6.0, 8.6], Math.PI / 2],
    ['B', [-16.97, 6.0, -1.4], Math.PI / 2],
    ['C', [16.97, 6.2, 5.5], -Math.PI / 2],
    ['A', [-4.0, 6.2, -13.9], 0],
  ];
  for (const [kind, p, r] of posters) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.8 }));
    m.position.set(...p);
    m.rotation.y = r;
    scene.add(m);
  }
  // motorcycle hung on the wall above the booths
  const bike = makeMotorcycle();
  bike.position.set(-3.4, 6.0, 11.85);
  bike.rotation.y = Math.PI;
  scene.add(bike);
  // license plates & guitars on walls
  for (let i = 0; i < 6; i++) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: pick(['#e8e0c0', '#c8d8e8', '#f0d020', '#e8e8e8']), roughness: 0.4, metalness: 0.4 }));
    plate.position.set(16.98, 2.4 + (i % 2) * 0.25, -5.5 + i * 0.45);
    plate.rotation.y = -Math.PI / 2;
    scene.add(plate);
  }

  // ------------------------------------------------------------------ global fill lights
  B.light({ pos: [0, 7.6, 2], color: '#ffcf9a', intensity: 30, distance: 22, kind: 'point', priority: 1.5, zone: 'hall' });

  B.build();
  scene.add(B.group);

  const bounds = new THREE.Box3(new THREE.Vector3(-17.2, -0.5, -14.2), new THREE.Vector3(17.2, 9.2, 15.4));
  return {
    builder: B,
    seats,
    spots,
    zones,
    work,
    entrances: [V(-0.5, 0.15, 14.2), V(0.5, 0.15, 14.6), V(4.0, 0, -13.3)],
    playerSpawn: { pos: V(0.0, 0.15, 14.6), yaw: 0 },
    doors,
    glass,
    bounds,
    danceFloor: dance,
    discoBall: disco,
    jukebox: { pos: V(-6.6, 0, -5.55), collider: jukeCol, health: 140, broken: false, mesh: juke },
    animated,
    taps,
    poolTables,
    lights: B.lights,
  };
}

// ------------------------------------------------------------------ special meshes
function makeDanceFloor(w: number, d: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uIntensity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uIntensity;
      varying vec2 vUv;
      vec3 hsv(float h, float s, float v) { vec3 k = vec3(1.0, 2.0/3.0, 1.0/3.0); vec3 p = abs(fract(vec3(h) + k) * 6.0 - 3.0); return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 g = vUv * vec2(8.0, 4.4);
        vec2 id = floor(g);
        vec2 f = fract(g);
        float edge = step(0.06, f.x) * step(0.06, f.y) * step(f.x, 0.94) * step(f.y, 0.94);
        float t = floor(uTime * 2.0 + uBeat);
        float h = hash(id + t * 0.37);
        float on = step(0.45, hash(id * 1.7 + t));
        // linear HDR: lit tiles exceed 1.0 so they bloom
        vec3 c = pow(hsv(fract(h + uTime * 0.05), 0.85, 1.0), vec3(2.2)) * (0.035 + on * (1.45 + uBeat * 1.1)) * uIntensity;
        vec3 col = mix(vec3(0.003), c, edge);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.toneMapped = false;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = false;
  return m;
}

function makeDiscoBall(): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const v = 120 + Math.random() * 135;
      g.fillStyle = `rgb(${v},${v},${v + 10})`;
      g.fillRect(x * 4, y * 4, 3, 3);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshStandardMaterial({ map: tex, metalness: 1, roughness: 0.15, emissive: new THREE.Color(0.25, 0.25, 0.3), emissiveMap: tex }));
  return ball;
}

function makeJukebox(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.6), new THREE.MeshStandardMaterial({ color: 0x6a1414, roughness: 0.4, metalness: 0.2 }));
  body.position.y = 0.625;
  g.add(body);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff8020, emissiveIntensity: 1.6, roughness: 0.3 }));
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 1.25;
  g.add(arch);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ map: jukeTexture(), emissive: 0xffffff, emissiveMap: jukeTexture(), emissiveIntensity: 0.9 }));
  front.position.set(0, 0.75, 0.301);
  g.add(front);
  for (const o of g.children) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  return g;
}

let _jukeTex: THREE.CanvasTexture | null = null;
function jukeTexture(): THREE.CanvasTexture {
  if (_jukeTex) return _jukeTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a0a0a';
  g.fillRect(0, 0, 64, 96);
  for (let i = 0; i < 64; i++) {
    g.fillStyle = `hsl(${(i * 7) % 360},90%,60%)`;
    g.fillRect(i, 0, 1, 6);
  }
  g.fillStyle = '#f0e0a0';
  g.fillRect(8, 12, 48, 30);
  g.fillStyle = '#1a1a1a';
  g.fillRect(12, 16, 40, 22);
  g.fillStyle = '#e8d8b0';
  for (let r = 0; r < 4; r++) g.fillRect(14, 18 + r * 5, 36, 2);
  for (let k = 0; k < 10; k++) {
    g.fillStyle = k % 2 ? '#f0f0f0' : '#d03030';
    g.fillRect(8 + k * 5, 50, 3, 3);
  }
  g.fillStyle = '#c8a040';
  for (let y = 60; y < 92; y += 3) g.fillRect(8, y, 48, 1);
  _jukeTex = new THREE.CanvasTexture(c);
  _jukeTex.colorSpace = THREE.SRGBColorSpace;
  _jukeTex.magFilter = THREE.NearestFilter;
  return _jukeTex;
}

function dartTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const dx = x - 31.5,
        dy = y - 31.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 20);
      let col = seg % 2 ? '#e8dcb8' : '#1a1a1a';
      if (r > 27 || (r > 15 && r < 18)) col = seg % 2 ? '#c02020' : '#208040';
      if (r < 5) col = '#c02020';
      if (r < 2.5) col = '#208040';
      if (r > 31) col = '#101010';
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function posterTexture(kind: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 88;
  const g = c.getContext('2d')!;
  const bg = kind === 'A' ? '#d8b040' : kind === 'B' ? '#2a4a8a' : '#c01818';
  g.fillStyle = '#1a1410';
  g.fillRect(0, 0, 64, 88);
  g.fillStyle = bg;
  g.fillRect(3, 3, 58, 82);
  g.fillStyle = kind === 'B' ? '#e8d8c0' : '#1a1410';
  g.font = 'bold 13px Bungee, Impact, sans-serif';
  g.textAlign = 'center';
  const lines = kind === 'A' ? ['LIVE', 'TONITE'] : kind === 'B' ? ['BIKE', 'NIGHT'] : ['NO', 'FIGHTING'];
  g.fillText(lines[0], 32, 22);
  g.fillText(lines[1], 32, 38);
  g.fillRect(12, 46, 40, 30);
  g.fillStyle = bg;
  g.beginPath();
  g.arc(32, 61, 10, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function makeMotorcycle(): THREE.Object3D {
  const g = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 0.9, roughness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9a1010, roughness: 0.3, metalness: 0.3 });
  const wheel = (x: number) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), black);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, -0.3, 0);
    g.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 8), chrome);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, -0.3, 0);
    g.add(hub);
  };
  wheel(-0.75);
  wheel(0.8);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.3), red);
  tank.position.set(0.1, 0.1, 0);
  g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.3), black);
  seat.position.set(-0.45, 0.05, 0);
  g.add(seat);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.28), chrome);
  engine.position.set(0.05, -0.2, 0);
  g.add(engine);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), chrome);
  fork.position.set(0.65, 0.05, 0);
  fork.rotation.z = -0.4;
  g.add(fork);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), chrome);
  bars.position.set(0.5, 0.45, 0);
  g.add(bars);
  const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), chrome);
  pipe.position.set(-0.3, -0.35, 0.18);
  g.add(pipe);
  g.scale.setScalar(1.1);
  return g;
}

function makeFan(): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.7 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 8), new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 }));
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 0.16), mat);
    blade.position.set(Math.cos((i * Math.PI) / 2) * 0.45, 0, Math.sin((i * Math.PI) / 2) * 0.45);
    blade.rotation.y = -(i * Math.PI) / 2;
    g.add(blade);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), mat);
  rod.position.y = 0.35;
  g.add(rod);
  return g;
}

/** Floor material under a point (footstep sounds / NPCs, which do not ray cast). */
export function surfaceAt(zones: Zone[], p: THREE.Vector3): SurfaceMaterial {
  switch (zoneAt(zones, p)?.name) {
    case 'kitchen':
    case 'bathroom':
      return 'tile';
    case 'storage':
      return 'concrete';
    case 'vip':
      return 'carpet';
    default:
      return 'wood';
  }
}

export function zoneAt(zones: Zone[], p: THREE.Vector3): Zone | null {
  // most specific first (smaller zones are listed before the generic hall)
  for (const z of zones) {
    if (p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z) return z;
  }
  return null;
}

void RAPIER;
void GROUPS;
void ctx;
