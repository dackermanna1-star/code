import * as THREE from 'three';
import type { Arena, Obstacle } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { put, wallLamp, neonSign, signBoard, wire } from './blocks';
import { Windows } from './street';
import { RNG } from '../../core/math';
import { softGlowTexture } from '../textures';
import { buildCity, skyTexture } from '../city';
import { buildRooftop } from '../rooftop';
import { meridianOnSkyline } from './club';

/**
 * THE ROOFTOPS: chapter three's level. North from the Lantern's roof, over the gaps between the
 * blocks, in the rain: down onto a roof of washing lines, up a ladder onto an office block's roof
 * under a lit billboard (men up there with torches, watching), across another gap onto a tenement's
 * roof of chimneys and aerials, and up its fire escape onto the tallest roof of all - the neon one,
 * where Kael is waiting.
 *
 * The neon roof is the rooftop arena, as it's built for the endless fights (its floor at 0); the
 * rest are blocks round it, their roofs below it, the street far below them all (a fall there is
 * the end). x east, z south; Meridian on the skyline to the north.
 */
const STREET = -24;
export const ROOFS = {
  street: STREET,
  start: { x: -2.5, z: 129.5, yaw: Math.PI },
  r1: { x0: -12, x1: 12, z0: 112, z1: 136, y: -6 },
  r2: { x0: -16, x1: 8, z0: 84, z1: 109.4, y: -7.4 },
  r3: { x0: -6, x1: 22, z0: 56, z1: 84, y: -3.4 },
  r4: { x0: -18, x1: 6, z0: 13.4, z1: 53.2, y: -3.4 },
  /** Where the gaps are crossed (no parapet there: an edge to run and jump from). */
  jump1: { x0: -7, x1: -1, z: 112 },
  jump2: { x0: -4.5, x1: 1.5, z: 56 },
  /** On the washing-line roof, up the office block's wall. */
  ladder2: { x: 2.0, z: 84.4, yaw: Math.PI },
  /** On the tenement roof, up to the neon roof's fire-escape landing. */
  ladder4: { x: 0, z: 13.75, yaw: Math.PI },
  hatch: { x: -5.4, z: 133 },
  shed2: { x: -12.4, z: 104.6 },
  billboard: { x: 19.2, z0: 60, z1: 80 },
  waterTower: { x: -12, z: 30 },
};

/** A knee-high parapet round a roof (ledges: bodies go over them), open where `gaps` say. */
function parapets(k: LevelKit, M: Materials, r: { x0: number; x1: number; z0: number; z1: number; y: number }, gaps: { side: 'n' | 's' | 'e' | 'w'; a: number; b: number }[] = [], skip: ('n' | 's' | 'e' | 'w')[] = []) {
  const mat = M.concrete(0x7a7670);
  const cope = M.concrete(0x9a968e);
  const H = 0.9, T = 0.3;
  const run = (side: 'n' | 's' | 'e' | 'w', from: number, to: number) => {
    if (to - from < 0.2) return;
    let b: [number, number, number, number, number, number];
    if (side === 'n') b = [from, to, r.y, r.y + H, r.z0, r.z0 + T];
    else if (side === 's') b = [from, to, r.y, r.y + H, r.z1 - T, r.z1];
    else if (side === 'w') b = [r.x0, r.x0 + T, r.y, r.y + H, from, to];
    else b = [r.x1 - T, r.x1, r.y, r.y + H, from, to];
    k.solid(b, mat, { kind: 'ledge', name: 'parapet', material: 'concrete' });
    put(k, new THREE.BoxGeometry(b[1] - b[0] + 0.06, 0.06, b[5] - b[4] + 0.1), cope, (b[0] + b[1]) / 2, r.y + H + 0.03, (b[4] + b[5]) / 2, 0, false);
  };
  for (const side of ['n', 's', 'w', 'e'] as const) {
    if (skip.includes(side)) continue;
    const lo = side === 'n' || side === 's' ? r.x0 : r.z0 + T;
    const hi = side === 'n' || side === 's' ? r.x1 : r.z1 - T;
    const gs = gaps.filter((g) => g.side === side).sort((p, q) => p.a - q.a);
    let at = lo;
    for (const g of gs) {
      run(side, at, g.a);
      at = g.b;
    }
    run(side, at, hi);
  }
}

/** A building under a roof: its walls down to the street, its windows, the roof itself (walkable). */
function building(k: LevelKit, M: Materials, W: Windows, rng: RNG, r: { x0: number; x1: number; z0: number; z1: number; y: number }, wall: THREE.Material, o: { faces?: ('n' | 's' | 'e' | 'w')[]; floorH?: number } = {}) {
  k.solid([r.x0, r.x1, STREET, r.y - 0.02, r.z0, r.z1], wall, { kind: false, tile: 2.6 });
  const top = k.deck(r.x0, r.x1, r.z0, r.z1, r.y, M.roofFloor(), null, { thick: r.y - STREET, dense: true, name: 'roof', kind: 'wall' });
  top.climb = false;
  const fh = o.floorH ?? 3.2;
  const floors = Math.floor((r.y - STREET - 2) / fh);
  for (const f of o.faces ?? ['n', 's', 'e', 'w']) {
    const [ax, az, bx, bz] = f === 'n' ? [r.x0, r.z0, r.x1, r.z0] : f === 's' ? [r.x1, r.z1, r.x0, r.z1] : f === 'w' ? [r.x0, r.z1, r.x0, r.z0] : [r.x1, r.z0, r.x1, r.z1];
    // (the windows face out: Windows.face puts the face's outside on the left walking a -> b)
    W.face(k, M, ax, az, bx, bz, STREET + 3.4, floors, rng, { floorH: fh, pitch: 3.4, sills: false, skip: () => rng.next() < 0.12 });
  }
  return top;
}

export function buildRoofs(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  // ---- the neon roof, as the endless mode builds it
  const rt = buildRooftop(a, blood, Math.max(1, pointLights - 1), shadowMapSize);
  // (one key light for the whole level - it follows her - one sky, and one rain)
  rt.moon.removeFromParent();
  rt.moon.target.removeFromParent();
  rt.hemi.removeFromParent();
  a.group.traverse((o) => {
    if ((o as THREE.LineSegments).isLineSegments && (o as THREE.LineSegments).material instanceof THREE.ShaderMaterial) {
      const u = ((o as THREE.LineSegments).material as THREE.ShaderMaterial).uniforms;
      if (u?.uFlash && u?.uTime) o.visible = false;
    }
  });
  // (the way up onto it from the south: through the fire escape's gap in the parapet)
  a.obstacles = a.obstacles.filter((o) => !(o.name === 'gate' && o.ghost && o.minZ > 10));
  const k = new LevelKit(a, blood, Math.max(2, pointLights - 1), shadowMapSize, { bounds: { minX: -36, maxX: 34, minZ: -26, maxZ: 140 }, density: 0.62 });
  k.ambientLight = 0.12;
  const M = new Materials(blood, true);
  const rng = new RNG(3131);
  const W = new Windows(61);
  a.fog = { color: 0x0e0c16, density: 0.016 };
  a.background = skyTexture(11);
  a.camBounds = { out: 2.5, maxY: 14, walls: true };
  a.farPlane = 650; // (Meridian, the way she is going: 300 m north and 230 m up)
  a.wet = true;
  // a body dropped this far below the roof it stood on has gone over the edge
  a.fallDeath = 4;
  // between the blocks there's only the drop: everywhere but the neon roof (and what's built on top)
  const RX = 13.4, RZ = 11.4;
  a.pits.push({ minX: -40, maxX: 40, minZ: -30, maxZ: -RZ }, { minX: -40, maxX: 40, minZ: RZ, maxZ: 145 }, { minX: -40, maxX: -RX, minZ: -RZ, maxZ: RZ }, { minX: RX, maxX: 40, minZ: -RZ, maxZ: RZ });

  const brick = M.brick('red'), brick2 = M.brick('brown'), brick3 = M.brickPainted('yellow');
  const iron = M.iron();

  // ---------------------------------------------------------------------- the neon roof's building, and its landing
  k.solid([-RX, RX, STREET, -0.04, -RZ, RZ], M.brick('brown'), { kind: false, tile: 2.6 });
  for (const f of ['n', 'e', 'w', 's'] as const) {
    const [ax, az, bx, bz] = f === 'n' ? [-RX, -RZ, RX, -RZ] : f === 's' ? [RX, RZ, -RX, RZ] : f === 'w' ? [-RX, RZ, -RX, -RZ] : [RX, -RZ, RX, RZ];
    W.face(k, M, ax, az, bx, bz, STREET + 3.4, 6, rng, { floorH: 3.3, pitch: 3.4, sills: false });
  }
  // the fire-escape landing outside the south gap: a grate to stand on, its side rails
  k.block([-1.45, 1.45, -0.26, 0, 11.38, 13.38], 'crate', 'landing', true);
  k.block([-1.52, -1.42, 0, 1.0, 11.38, 13.38], 'wall', 'landing rail');
  k.block([1.42, 1.52, 0, 1.0, 11.38, 13.38], 'wall', 'landing rail');
  // (the other ways onto it, for whoever comes running: the north fire escape's landing and the two
  // stair huts stand out over the drop - boards under them, or a man walking in falls six floors)
  k.block([-1.45, 1.45, -0.26, 0, -13.38, -11.38], 'crate', 'landing', true);
  k.block([13.0, 16.9, -0.26, 0, -1.3, 1.3], 'crate', 'stair hut floor', true);
  k.block([-16.9, -13.0, -0.26, 0, -1.3, 1.3], 'crate', 'stair hut floor', true);

  // ---------------------------------------------------------------------- R1: the Lantern's roof
  {
    const r = ROOFS.r1;
    building(k, M, W, rng, r, M.paint(0x3a2c30, 0.8, 0.05), { faces: ['n', 'e', 'w'] });
    parapets(k, M, r, [{ side: 'n', a: ROOFS.jump1.x0, b: ROOFS.jump1.x1 }]);
    // the hatch she came up through, its lid thrown back; AC units, the water tank, vents
    const H = ROOFS.hatch;
    k.solid([H.x - 0.8, H.x + 0.8, r.y, r.y + 0.4, H.z - 0.7, H.z + 0.7], M.steel(), { kind: 'crate', name: 'hatch' });
    put(k, new THREE.BoxGeometry(1.4, 0.05, 1.1), M.dark(), H.x, r.y + 0.41, H.z, 0, false);
    put(k, new THREE.BoxGeometry(0.05, 1.1, 1.2), M.steel(), H.x - 0.85, r.y + 0.95, H.z, 0, true);
    for (const [x, z] of [[4, 120], [-8, 124], [6, 128]] as [number, number][]) k.solid([x - 1.0, x + 1.0, r.y, r.y + 1.4, z - 0.7, z + 0.7], M.paint(0x8a8c88, 0.6, 0.4), { kind: 'crate', name: 'ac unit', walk: true });
    k.solid([6, 9, r.y, r.y + 3.4, 114, 117], M.wood(), { kind: 'crate', name: 'water tank' });
    // the club's sign on the street edge, its back to the roof
    neonSign(k, ['THE LANTERN'], '#ffb040', r.x1 + 0.2, r.y + 2.4, 124, Math.PI / 2, 9, 2.0, { intensity: 40 });
    put(k, new THREE.BoxGeometry(0.3, 3.2, 9.4), iron, r.x1 - 0.1, r.y + 1.6, 124, 0, true);
    k.spot([0, r.y + 3, 126], 0xff9a60, 60, 14);
    k.spot([H.x, r.y + 1.8, H.z], 0xffd0a0, 20, 7);
    k.spot([-4, r.y + 2.6, 114], 0x9aa8d8, 40, 12);
  }

  // ---------------------------------------------------------------------- R2: the washing-line roof
  const sheets: { m: THREE.Mesh; ph: number }[] = [];
  {
    const r = ROOFS.r2;
    building(k, M, W, rng, r, brick, { faces: ['s', 'e', 'w'] });
    parapets(k, M, r, [{ side: 's', a: ROOFS.jump1.x0 - 0.5, b: ROOFS.jump1.x1 + 0.5 }, { side: 'n', a: -6, b: 8 }]);
    // the stair shed (the way the KX men come up), a lamp over its door
    const S = ROOFS.shed2;
    k.solid([S.x - 1.8, S.x + 1.8, r.y, r.y + 2.8, S.z - 1.6, S.z + 1.6], brick2, { kind: 'wall', name: 'stair shed' });
    put(k, new THREE.BoxGeometry(1.1, 2.1, 0.05), M.dark(), S.x + 0.6, r.y + 1.05, S.z - 1.62, 0, false);
    wallLamp(k, M, S.x + 0.6, r.y + 2.35, S.z - 1.62, Math.PI, { color: 0xffc890, intensity: 14 });
    // washing lines between poles, sheets and shirts hung on them (the wind takes them)
    const sheetMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide });
    for (const [x0, x1, z] of [[-14, -2, 92], [-14, -2, 96.5], [-14, -2, 101]] as [number, number, number][]) {
      for (const x of [x0, x1]) {
        put(k, new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6), iron, x, r.y + 1.15, z, 0, true);
        k.block([x - 0.08, x + 0.08, r.y, r.y + 2.3, z - 0.08, z + 0.08], 'prop', 'pole');
      }
      wire(k, M, new THREE.Vector3(x0, r.y + 2.2, z), new THREE.Vector3(x1, r.y + 2.2, z), 0.18);
      for (let x = x0 + 0.9; x < x1 - 0.6; x += 1.5 + rng.next() * 0.6) {
        const w = 0.8 + rng.next() * 0.6, h = 0.8 + rng.next() * 0.7;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), sheetMat(rng.pick([0xe8e4dc, 0xd8c8a8, 0x9ab0c8, 0xc89a9a, 0xe0e0e0, 0x6a8a6a])));
        m.position.set(x, r.y + 2.15, z);
        m.castShadow = true;
        k.g.add(m);
        sheets.push({ m, ph: rng.next() * 6 });
      }
    }
    // planters, a table and chairs, a grill, string lights
    for (const [x, z] of [[2, 106], [5, 106], [5, 98], [5, 90]] as [number, number][]) {
      k.solid([x - 1.0, x + 1.0, r.y, r.y + 0.6, z - 0.4, z + 0.4], M.wood(), { kind: 'crate', name: 'planter', walk: true });
      for (let i = 0; i < 5; i++) put(k, new THREE.SphereGeometry(0.22 + rng.next() * 0.1, 7, 5), M.paint(0x2a4a24, 0.9, 0), x - 0.8 + i * 0.4, r.y + 0.75, z, 0, false);
    }
    k.solid([-1.0, 0.6, r.y, r.y + 0.75, 88.4, 89.6], M.paint(0xd8d8d0, 0.6, 0.1), { kind: 'crate', name: 'table' });
    put(k, new THREE.CylinderGeometry(0.3, 0.25, 0.8, 10), M.paint(0x1a1a1a, 0.5, 0.4), -4, r.y + 0.4, 88, 0, true);
    for (let i = 0; i < 9; i++) {
      put(k, new THREE.SphereGeometry(0.05, 6, 4), M.glow(0xffd8a0, 2.4), -14 + i * 1.5, r.y + 2.1 - Math.sin((i / 8) * Math.PI) * 0.25, 87, 0, false);
    }
    wire(k, M, new THREE.Vector3(-14, r.y + 2.2, 87), new THREE.Vector3(-2, r.y + 2.2, 87), 0.3);
    k.spot([-8, r.y + 2.2, 87], 0xffd0a0, 30, 10);
    k.spot([-8, r.y + 2.6, 98], 0x9aa8d8, 34, 12);
    k.spot([2, r.y + 2.6, 104], 0xffc890, 26, 10);
    // the office block's wall over the north edge: the ladder up it
    k.ladder(ROOFS.ladder2.x, ROOFS.ladder2.z, ROOFS.ladder2.yaw, r.y, ROOFS.r3.y, iron);
    wallLamp(k, M, 3.6, ROOFS.r3.y - 1.0, 84.02, 0, { color: 0xd8e0ff, intensity: 10 });
  }

  // ---------------------------------------------------------------------- R3: the office block, under the billboard
  {
    const r = ROOFS.r3;
    building(k, M, W, rng, r, M.concrete(0x7a7a80), { faces: ['n', 'e', 'w'] });
    parapets(k, M, r, [{ side: 'n', a: ROOFS.jump2.x0, b: ROOFS.jump2.x1 }, { side: 's', a: ROOFS.ladder2.x - 0.8, b: ROOFS.ladder2.x + 0.8 }]);
    // the billboard: a steel frame along the east side, its face to the street, floodlit
    const B = ROOFS.billboard;
    for (let z = B.z0; z <= B.z1; z += 4) {
      put(k, new THREE.BoxGeometry(0.2, 9, 0.2), iron, B.x, r.y + 4.5, z, 0, true);
      put(k, new THREE.BoxGeometry(1.6, 0.12, 0.12), iron, B.x - 0.7, r.y + 3, z, 0, false);
      k.block([B.x - 0.12, B.x + 0.12, r.y, r.y + 9, z - 0.12, z + 0.12], 'pillar', 'billboard leg');
    }
    put(k, new THREE.BoxGeometry(0.15, 5, B.z1 - B.z0 + 1), M.paint(0x1a1a1e, 0.7, 0.3), B.x + 0.35, r.y + 6.5, (B.z0 + B.z1) / 2, 0, true);
    signBoard(k, 'MERIDIAN · LIVE ABOVE IT ALL', B.x + 0.45, r.y + 6.5, (B.z0 + B.z1) / 2, Math.PI / 2, B.z1 - B.z0, 4.6, { bg: '#0a1020', fg: '#ffd8a0', lit: true, font: '"Oswald", sans-serif' });
    put(k, new THREE.BoxGeometry(1.4, 0.12, B.z1 - B.z0), iron, B.x - 0.6, r.y + 3.9, (B.z0 + B.z1) / 2, 0, false);
    for (let z = B.z0 + 2; z < B.z1; z += 6) k.spot([B.x + 2, r.y + 4, z], 0xfff0d0, 60, 10);
    // skylights, AC units, a vent stack, the radio mast and its red lamp
    for (const [x, z] of [[2, 64], [2, 70], [2, 76], [8, 64], [8, 70], [8, 76]] as [number, number][]) {
      k.solid([x - 1.2, x + 1.2, r.y, r.y + 0.65, z - 1.6, z + 1.6], M.glass(0x2a3a48), { kind: 'crate', name: 'skylight', walk: true });
      put(k, new THREE.BoxGeometry(2.3, 0.02, 3.1), M.glow(0x8aa0c0, 0.35), x, r.y + 0.66, z, 0, false);
    }
    for (const [x, z] of [[-2, 60], [14, 80], [-2, 80]] as [number, number][]) k.solid([x - 1.1, x + 1.1, r.y, r.y + 1.5, z - 0.75, z + 0.75], M.paint(0x8a8c88, 0.6, 0.4), { kind: 'crate', name: 'ac unit', walk: true });
    k.solid([12.5, 13.5, r.y, r.y + 2.6, 58.5, 59.5], M.steel(), { kind: 'pillar', name: 'vent' });
    put(k, new THREE.CylinderGeometry(0.06, 0.1, 10, 6), iron, -4, r.y + 5, 82, 0, true);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    red.position.set(-4, r.y + 10.1, 82);
    k.g.add(red);
    k.updates.push(() => (red.visible = Math.floor(performance.now() / 800) % 2 === 0));
    // the work lamps on the frame's back, down over the roof's east half (the west half dim
    // between them: a place to sneak)
    for (const z of [63, 71, 78]) {
      put(k, new THREE.BoxGeometry(0.3, 0.22, 0.4), M.glow(0xfff4e0, 2.0), B.x - 0.5, r.y + 5.2, z, 0, false);
      k.spot([B.x - 3.5, r.y + 4.6, z], 0xffe8c8, 38, 13);
    }
    k.spot([4, r.y + 3, 60], 0x9aa8d8, 30, 11);
    k.spot([-3, r.y + 2.6, 75], 0x8a98c8, 20, 9);
  }

  // ---------------------------------------------------------------------- R4: the tenement roof
  {
    const r = ROOFS.r4;
    building(k, M, W, rng, r, brick3, { faces: ['e', 'w', 's'] });
    parapets(k, M, r, [{ side: 's', a: ROOFS.jump2.x0 - 0.5, b: ROOFS.jump2.x1 + 0.5 }, { side: 'n', a: -1.25, b: 1.25 }]);
    // chimney stacks, aerials, satellite dishes, a skylight row, the water tower on its legs
    for (const [x, z] of [[-14, 48], [-6, 44], [2, 40], [-16, 22], [3, 20]] as [number, number][]) {
      k.solid([x - 0.6, x + 0.6, r.y, r.y + 1.6, z - 0.45, z + 0.45], brick2, { kind: 'pillar', name: 'chimney' });
      for (let i = 0; i < 3; i++) put(k, new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8), M.paint(0x8a5a3a, 0.8, 0), x - 0.35 + i * 0.35, r.y + 1.75, z, 0, false);
    }
    for (const [x, z] of [[-10, 46], [-2, 34], [4, 28]] as [number, number][]) {
      put(k, new THREE.CylinderGeometry(0.02, 0.03, 2.6, 5), iron, x, r.y + 1.3, z, 0, false);
      put(k, new THREE.BoxGeometry(1.2, 0.03, 0.03), iron, x, r.y + 2.4, z, 0.6, false);
      put(k, new THREE.BoxGeometry(0.8, 0.03, 0.03), iron, x, r.y + 2.1, z, 0.6, false);
    }
    for (const [x, z, ry] of [[-17.4, 38, Math.PI / 2], [5.4, 32, -Math.PI / 2]] as [number, number, number][]) {
      const dish = new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, 0.9);
      dish.rotateX(-Math.PI / 2);
      put(k, dish, M.paint(0xd8d8d0, 0.5, 0.2), x, r.y + 1.5, z, ry, true);
    }
    for (const z of [26, 31, 36]) {
      k.solid([-8, -5, r.y, r.y + 0.6, z - 1.2, z + 1.2], M.glass(0x2a3a48), { kind: 'crate', name: 'skylight', walk: true });
      put(k, new THREE.BoxGeometry(2.9, 0.02, 2.3), M.glow(0xb0a080, 0.4), -6.5, r.y + 0.61, z, 0, false);
    }
    const T = ROOFS.waterTower;
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]] as [number, number][]) {
      put(k, new THREE.BoxGeometry(0.16, 4, 0.16), iron, T.x + dx, r.y + 2, T.z + dz, 0, true);
      k.block([T.x + dx - 0.1, T.x + dx + 0.1, r.y, r.y + 4, T.z + dz - 0.1, T.z + dz + 0.1], 'pillar', 'tower leg');
    }
    const tank = new THREE.CylinderGeometry(1.9, 1.9, 3.2, 16);
    put(k, tank, M.wood(), T.x, r.y + 5.6, T.z, 0, true);
    put(k, new THREE.ConeGeometry(2.05, 1.1, 16), M.paint(0x3a3a3c, 0.7, 0.2), T.x, r.y + 7.75, T.z, 0, true);
    put(k, new THREE.BoxGeometry(4.2, 0.12, 4.2), iron, T.x, r.y + 4.0, T.z, 0, true);
    k.block([T.x - 2.1, T.x + 2.1, r.y + 3.94, r.y + 4.06, T.z - 2.1, T.z + 2.1], 'crate', 'tower deck', true);
    k.ladder(T.x + 2.3, T.z, -Math.PI / 2, r.y, r.y + 4.06, iron);
    // the way up onto the neon roof: its fire escape's ladder
    k.ladder(ROOFS.ladder4.x, ROOFS.ladder4.z, ROOFS.ladder4.yaw, r.y, 0, iron);
    k.spot([0, r.y + 2.5, 16], 0xffb070, 36, 11);
    k.spot([-8, r.y + 2.6, 46], 0x9aa8d8, 36, 12);
    k.spot([-6, r.y + 2.4, 30], 0xffc890, 26, 10);
  }

  // ---------------------------------------------------------------------- the blocks round about, the street far below
  for (const [x0, x1, z0, z1, top, mat] of [
    [-34, -20, 70, 110, 6, brick2], [-34, -22, 30, 66, 14, M.concrete(0x6a6a70)], [-34, -18, -24, 20, 22, M.concrete(0x5a5a64)],
    [16, 32, 92, 132, 4, brick], [26, 34, 50, 88, 18, M.concrete(0x6a6670)], [16, 30, -24, 40, 10, brick3],
  ] as [number, number, number, number, number, THREE.Material][]) {
    k.solid([x0, x1, STREET, top, z0, z1], mat, { kind: 'wall', name: 'block', tile: 2.6 });
    const faceX = x0 < 0 ? x1 : x0;
    const [az, bz] = x0 < 0 ? [z0, z1] : [z1, z0];
    W.face(k, M, faceX, az, faceX, bz, STREET + 3.4, Math.floor((top - STREET - 2) / 3.2), rng, { pitch: 3.6, sills: false, skip: () => rng.next() < 0.2 });
  }
  neonSign(k, ['HOTEL'], '#ff3a6a', -20.1, 2, 50, Math.PI / 2, 4, 1.4, { intensity: 30, flicker: 0.4 });
  neonSign(k, ['NOODLES · 24H'], '#3ac8ff', 15.9, -10, 104, -Math.PI / 2, 5, 1.2, { intensity: 24 });
  // the street: wet asphalt, lamps, a car's lights crawling along it
  k.floor(-40, 40, -30, 145, M.asphalt(), { y: STREET, paint: false, tile: 6 });
  for (let z = -20; z < 140; z += 18) {
    for (const x of [-22, 18]) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: 0xffa050, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(3, 3, 1);
      glow.position.set(x, STREET + 6, z);
      k.g.add(glow);
    }
  }
  const car = new THREE.Group();
  for (const dx of [-0.6, 0.6]) {
    const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: 0xfff0d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    hl.scale.set(1.2, 1.2, 1);
    hl.position.set(dx, 0.7, 0);
    car.add(hl);
  }
  car.position.set(-2, STREET, 140);
  k.g.add(car);
  let carT = 0;
  k.updates.push((dt) => {
    carT += dt;
    car.position.z = 140 - ((carT * 9) % 170);
  });

  // ---------------------------------------------------------------------- the city, Meridian on the skyline (north)
  meridianOnSkyline(k, 30, -300, 1.1);
  buildCity(k.g, rng, [{ n: 30, r0: 110, r1: 170, top0: 10, top1: 50 }, { n: 26, r0: 180, r1: 260, top0: 30, top1: 90 }], { bottom: STREET, tint: 0x8a8aa8 });
  k.rain({ count: 2200, w: 40, h: 16 });
  W.finish(k);
  const key = k.keyLight(0xa8b0d8, 2.2, new THREE.Vector3(0.3, 1, 0.5), 26);
  const baseKey = key.intensity;
  const hemi = new THREE.HemisphereLight(0x8a88b8, 0x3a3040, 2.6);
  k.g.add(hemi);
  const baseHemi = hemi.intensity;
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(0, 2, 30),
    update: (dt) => {
      rt.update?.(dt);
      // the lightning lights the whole level, not just the neon roof
      key.intensity = baseKey * (1 + (a.flash ?? 0) * 2.5);
      hemi.intensity = baseHemi * (1 + (a.flash ?? 0) * 3);
      for (const s of sheets) {
        const t = performance.now() / 1000 + s.ph;
        s.m.rotation.x = 0.18 + Math.sin(t * 1.7) * 0.16 + Math.sin(t * 4.3) * 0.04;
      }
    },
  });
  return { ...parts, dust: rt.dust, dressing: rt.dressing };
}

/** (for the script: the parapet obstacles of a roof, if it needs one gone) */
export function roofParapets(a: Arena, r: { x0: number; x1: number; z0: number; z1: number; y: number }): Obstacle[] {
  return a.obstacles.filter((o) => o.name === 'parapet' && (o.y0 ?? 0) === r.y && o.minX >= r.x0 - 0.01 && o.maxX <= r.x1 + 0.01 && o.minZ >= r.z0 - 0.01 && o.maxZ <= r.z1 + 0.01);
}
