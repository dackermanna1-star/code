// Chapter 1 — THE APARTMENTS
// Rooftop start (news chopper flyby) -> down through a burning apartment block
// (skylight drop / stairs, collapsed floor) -> east stairwell -> lobby ->
// Hawthorne Avenue (wrecks, car alarms, military roadblock) -> pharmacy
// detour -> back alley -> Grand Street -> subway entrance -> station safe room.
import * as THREE from 'three';
import { room, ceilingLight, wallLamp, street, floorWithHoles, facade, sign, graffiti, safeRoom, supplies, fireSource, burningBarrel, physProp, alarmCar, hittable, usable, P, railSegment } from './kit.js';
import { Door, WindowPane } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { Helicopter } from './helicopter.js';
import { makeRng } from '../core/math.js';

const F0 = 0, F1 = 3.6, F2 = 7.2, F3 = 10.8, ROOF = 14.4;
const rng = makeRng(101);

// Calls fn(xa, za, xb, zb) for the rectangles tiling x0..x1 / z0..z1 minus the holes.
function aroundHoles(x0, z0, x1, z1, holes, fn) {
  const xs = [x0, x1], zs = [z0, z1];
  for (const h of holes) { xs.push(h[0], h[2]); zs.push(h[1], h[3]); }
  const ux = [...new Set(xs)].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
  const uz = [...new Set(zs)].filter((v) => v >= z0 && v <= z1).sort((a, b) => a - b);
  for (let i = 0; i < ux.length - 1; i++) {
    for (let k = 0; k < uz.length - 1; k++) {
      const cx = (ux[i] + ux[i + 1]) / 2, cz = (uz[k] + uz[k + 1]) / 2;
      if (holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3])) continue;
      fn(ux[i], uz[k], ux[i + 1], uz[k + 1]);
    }
  }
}
// Floor slab (finish on top + ceiling underneath) with rectangular holes.
function slab(L, x0, z0, x1, z1, y, holes, floorMat = 'concreteFloor', ceilMat = 'ceiling') {
  aroundHoles(x0, z0, x1, z1, holes, (xa, za, xb, zb) => {
    L.box(xa, y - 0.3, za, xb, y - 0.06, zb, ceilMat);
    L.box(xa, y - 0.06, za, xb, y, zb, floorMat);
  });
}

// Furnished apartment. doorWall: 'n'|'s' (corridor side), win: side with windows.
function apartment(L, x0, z0, x1, z1, y, o) {
  const h = 3.3;
  const floorMat = o.floor ?? rng.pick(['woodFloor', 'woodFloorDark', 'carpet', 'carpetBlue']);
  const wallMat = o.wall ?? rng.pick(['wallpaper', 'wallpaperGreen', 'wallpaperRose', 'plaster', 'plasterDirty']);
  const walls = { n: {}, s: {}, e: {}, w: {} };
  walls[o.doorWall] = { mat: 'plasterDirty', open: [{ at: o.doorAt, w: 1.0, door: o.door !== false, hinge: o.hinge ?? 1, opened: o.doorOpen, locked: o.locked }] };
  if (o.noWall) for (const k of o.noWall) walls[k] = false;
  const { doors } = room(L, { x0, z0, x1, z1, y, h, floor: false, ceil: false, wall: wallMat, walls, light: false, reverb: 'room' });
  // o.swing: -1 turns an initially open leaf the other way (into the apartment instead of
  // across the corridor, where it blocks bots: the nav grid ignores door leaves)
  if (o.swing && doors[0]) { doors[0].dirSign = o.swing; doors[0].updateCollider(); }
  // floor finish (o.holes: leave collapsed parts of the floor open)
  aroundHoles(x0, z0, x1, z1, o.holes || [], (xa, za, xb, zb) => L.box(xa, y - 0.02, za, xb, y + 0.005, zb, floorMat, { collide: false }));
  // partition between living & bedroom (perpendicular to X), with an opening
  const px = o.partX ?? x0 + (x1 - x0) * 0.58;
  const zc = (z0 + z1) / 2;
  L.wallZ(z0, z1, px, y, y + h, wallMat, 0.14, [{ a: zc - 0.5, b: zc + 0.5, y0: y, y1: y + 2.15 }]);
  const lightOn = o.lights !== false;
  ceilingLight(L, (x0 + px) / 2, y + h, zc, { on: lightOn && rng() < 0.7, flicker: rng() < 0.3 ? 0.6 : 0, intensity: 9 });
  ceilingLight(L, (px + x1) / 2, y + h, zc, { on: lightOn && rng() < 0.5, flicker: rng() < 0.3 ? 0.7 : 0, intensity: 7 });
  // living room (x0..px)
  const inner = 0.35;
  const wallSide = o.doorWall === 'n' ? z1 : z0; // far wall from corridor
  const sgn = o.doorWall === 'n' ? -1 : 1; // direction from far wall towards corridor
  const corrSide = o.doorWall === 'n' ? z0 : z1;
  const inward = o.doorWall === 'n' ? 1 : -1;
  if (!o.empty) {
    const lx = (x0 + px) / 2;
    P.sofa(L, lx, y, wallSide + sgn * 0.6, o.doorWall === 'n' ? 0 : Math.PI, rng.pick([0x5a3a2a, 0x3a4a5a, 0x6a5a3a, 0x4a2a3a]));
    P.rug(L, lx, y + 0.005, zc, 2.6, 2.0, rng.pick([0x6a2a2a, 0x2a3a5a, 0x5a4a2a]));
    P.table(L, lx, y, zc, 0, 1.0, 0.6, 'woodDark');
    const tvx = Math.abs(o.doorAt - lx) < 1.6 ? (o.doorAt > lx ? x0 + 1.0 : px - 1.0) : lx;
    P.tv(L, tvx, y, corrSide + inward * 0.45, o.doorWall === 'n' ? Math.PI : 0);
    if (rng() < 0.6) P.chair(L, x0 + 0.8, y, zc + 0.5, rng() * 6, 'woodDark', rng() < 0.4);
    P.lamp(L, x0 + inner + 0.2, y, wallSide + sgn * 0.4);
    P.bookshelf(L, x0 + inner, y, zc, -Math.PI / 2);
    // kitchenette along the corridor-side wall
    const kz = o.doorWall === 'n' ? z0 + 0.34 : z1 - 0.34;
    const kx = o.doorAt < (x0 + px) / 2 ? (o.doorAt + px) / 2 + 0.3 : (x0 + o.doorAt) / 2 - 0.3;
    if (Math.abs(kx - o.doorAt) > 1.7 && Math.abs(kx - tvx) > 1.8 && kx > x0 + 1.4 && kx < px - 1.4) {
      P.counter(L, kx, y, kz, o.doorWall === 'n' ? Math.PI : 0, 2.2);
      P.cabinetWall(L, kx, y, kz, o.doorWall === 'n' ? Math.PI : 0, 2.2);
    }
    // bedroom (px..x1)
    P.bed(L, (px + x1) / 2, y, wallSide + sgn * 1.1, o.doorWall === 'n' ? 0 : Math.PI, rng.pick([0x8a8a9a, 0x6a2a2a, 0x3a4a6a, 0xa89878]));
    P.dresser(L, x1 - inner - 0.3, y, zc - sgn * 1.5, Math.PI / 2);
    if (rng() < 0.5) P.papers(L, (x0 + px) / 2, y + 0.01, zc, 1.8, 8);
    // story beats: bodies & blood
    if (rng() < 0.45) {
      const bx = x0 + 1 + rng() * (x1 - x0 - 2), bz = zc + (rng() - 0.5) * 3;
      P.corpse(L, bx, y + 0.01, bz, rng() * 6);
      L.decal(bx, y + 0.012, bz, 0, 1, 0, 1.6, DF.POOL);
    }
    for (let i = 0; i < 2; i++) if (rng() < 0.6) L.decal(x0 + 0.5 + rng() * (x1 - x0 - 1), y + 0.013, z0 + 0.5 + rng() * (z1 - z0 - 1), 0, 1, 0, 0.8 + rng(), DF.SMEAR);
    if (rng() < 0.5) L.decal(px + (rng() < 0.5 ? -0.08 : 0.08), y + 1.2, zc + 1.3, rng() < 0.5 ? -1 : 1, 0, 0, 0.7, DF.HAND, { noRoll: true });
  }
  // items
  if (o.items) for (const it of o.items) L.item(it.type, it.x, y + (it.onTable ? 0.78 : 0.02), it.z, { chance: it.chance ?? 0.5 });
  L.ambience(x0, y, z0, x1, y + h, z1, 'apartments');
}

// Exterior brick wall segment with window openings + glass for one floor.
function extWallX(L, x0, x1, z, y, wins, mat = 'brick') {
  L.wallX(x0, x1, z, y - 0.3, y + 3.3, mat, 0.4, wins.map((w) => ({ a: w - 0.6, b: w + 0.6, y0: y + 0.9, y1: y + 2.4 })));
  for (const w of wins) new WindowPane(L, w - 0.6, y + 0.9, z - 0.02, w + 0.6, y + 2.4, z + 0.02, { dirty: true });
}
function extWallZ(L, z0, z1, x, y, wins, mat = 'brick') {
  L.wallZ(z0, z1, x, y - 0.3, y + 3.3, mat, 0.4, wins.map((w) => ({ a: w - 0.6, b: w + 0.6, y0: y + 0.9, y1: y + 2.4 })));
  for (const w of wins) new WindowPane(L, x - 0.02, y + 0.9, w - 0.6, x + 0.02, y + 2.4, w + 0.6, { dirty: true });
}

export default {
  id: 'apartments',
  title: 'The Apartments',
  def: {
    director: { wanderers: 24, mobInterval: [80, 140], mobSize: [12, 20], tank: 0.25, witches: 0.75, relax: [30, 50], outfit: 'civilian', maxSpecials: 2 },
  },
  build(L, game) {
    L.env = Object.assign(L.env, {
      fog: 0x0c0e14, fogDensity: 0.018, hemiSky: 0x3a4660, hemiGround: 0x1a1612, hemiIntensity: 0.45, envIntensity: 0.12,
      moon: { dir: [-0.35, 1, 0.45], intensity: 0.55, color: 0x8a9ac0 }, exposure: 1.1, reverb: 'outdoor', ambience: 'city',
      skyOpts: { hospitalAz: 0.62, hospitalH: 260, moonAz: 0.28, fires: 9, rotation: 0 },
    });
    L.menuCam = { x: 25, y: ROOF + 1.6, z: 17, yaw: 2.4, pitch: -0.05 };

    // =========================================================== BUILDING A
    // exterior shell per floor (south = street side with windows, east = alley side)
    for (const [fy, lvl] of [[F0, 0], [F1, 1], [F2, 2], [F3, 3]]) {
      const hasInterior = lvl === 2 || lvl === 3;
      if (lvl === 0) {
        // lobby storefront: big windows + entrance gap (x 18..21)
        L.wallX(0, 32, 20, fy, fy + 3.3, 'brickTan', 0.4, [{ a: 9, b: 13, y0: 0.9, y1: 2.8 }, { a: 18, b: 21, y0: 0, y1: 2.6 }, { a: 25, b: 30, y0: 0.9, y1: 2.8 }]);
        new WindowPane(L, 9, 0.9, 19.98, 13, 2.8, 20.02, { dirty: true });
        new WindowPane(L, 25, 0.9, 19.98, 30, 2.8, 20.02, { dirty: true });
      } else if (hasInterior) {
        extWallX(L, 0, 32, 20, fy, [3, 7, 14, 17.5, 24, 28.5], 'brickTan');
      } else {
        L.box(0, fy - 0.3, 19.8, 32, fy + 3.3, 20.2, 'brickTan');
        for (const w of [3, 7, 14, 17.5, 24, 28.5]) L.box(w - 0.6, fy + 0.9, 20.2, w + 0.6, fy + 2.4, 20.24, 'glassDirty', { collide: false, tint: 0x141a1e });
      }
      if (hasInterior) extWallZ(L, 0, 20, 32, fy, [3, 6, 14, 17], 'brickTan');
      else { L.box(31.8, fy - 0.3, 0, 32.2, fy + 3.3, 20, 'brickTan'); if (lvl === 1) for (const w of [3, 6, 14, 17]) L.box(32.2, fy + 0.9, w - 0.6, 32.24, fy + 2.4, w + 0.6, 'glassDirty', { collide: false, tint: 0x141a1e }); }
      L.box(-0.2, fy - 0.3, 0, 0.2, fy + 3.3, 20, 'brickTan');
      L.box(0, fy - 0.3, -0.2, 32, fy + 3.3, 0.2, 'brickTan');
      // cornice line between floors
      L.box(-0.1, fy - 0.35, 20.2, 32.1, fy - 0.2, 20.35, 'concrete', { collide: false });
    }
    // roof slab + parapet + coping
    const skylight = [18, 3, 19.8, 4.8];
    slab(L, 0, 0, 32, 20, ROOF, [[0.2, 0.2, 2.8, 7.6], skylight], 'roof', 'ceiling');
    L.box(-0.2, ROOF, -0.2, 32.2, ROOF + 1.1, 0.25, 'brickTan');
    L.box(-0.2, ROOF, 19.75, 32.2, ROOF + 1.1, 20.2, 'brickTan');
    L.box(-0.2, ROOF, 0, 0.25, ROOF + 1.1, 20, 'brickTan');
    L.box(31.75, ROOF, 0, 32.2, ROOF + 1.1, 20, 'brickTan');
    L.box(-0.3, ROOF + 1.1, -0.3, 32.3, ROOF + 1.2, 0.35, 'concrete', { collide: false });
    L.box(-0.3, ROOF + 1.1, 19.65, 32.3, ROOF + 1.2, 20.3, 'concrete', { collide: false });
    L.box(-0.3, ROOF + 1.1, 0, 0.35, ROOF + 1.2, 20, 'concrete', { collide: false });
    L.box(31.65, ROOF + 1.1, 0, 32.3, ROOF + 1.2, 20, 'concrete', { collide: false });
    // skylight frame + breakable glass
    L.box(skylight[0] - 0.15, ROOF, skylight[1] - 0.15, skylight[2] + 0.15, ROOF + 0.35, skylight[1], 'metalDark');
    L.box(skylight[0] - 0.15, ROOF, skylight[3], skylight[2] + 0.15, ROOF + 0.35, skylight[3] + 0.15, 'metalDark');
    L.box(skylight[0] - 0.15, ROOF, skylight[1], skylight[0], ROOF + 0.35, skylight[3], 'metalDark');
    L.box(skylight[2], ROOF, skylight[1], skylight[2] + 0.15, ROOF + 0.35, skylight[3], 'metalDark');
    new WindowPane(L, skylight[0], ROOF + 0.3, skylight[1], skylight[2], ROOF + 0.34, skylight[3], { dirty: true });

    // ---- roof: bulkhead over the west stairs
    L.box(0.2, ROOF, 0.2, 7, ROOF + 2.8, 0.45, 'brickDark');
    L.wallZ(0.2, 9.4, 7, ROOF, ROOF + 2.8, 'brickDark', 0.25, [{ a: 7.95, b: 9.05, y0: ROOF, y1: ROOF + 2.2 }]);
    L.box(0.2, ROOF, 9.3, 7.1, ROOF + 2.8, 9.55, 'brickDark');
    L.box(0.2, ROOF, 0.2, 0.45, ROOF + 2.8, 9.4, 'brickDark');
    L.box(0.1, ROOF + 2.8, 0.1, 7.2, ROOF + 3.05, 9.65, 'roof');
    new Door(L, 7, ROOF, 8.5, 'z', { width: 1.0, hinge: -1 });
    ceilingLight(L, 4.5, ROOF + 2.8, 5, { type: 'cage', intensity: 6, flicker: 0.5 });
    sign(L, 'ROOF ACCESS', 7.15, ROOF + 2.45, 8.5, Math.PI / 2, 1.0, 0.25, { bg: '#b0a888', fg: '#1a1a1a' });
    // railing along the stair hole at roof level
    L.box(2.8, ROOF, 0.45, 2.9, ROOF + 1.05, 7.6, 'metalDark', { flags: F_SOLID | F_SHOOT });
    // west stairs: F3 -> roof
    L.stairs(0.5, 2.2, 2.7, 7.6, F3, ROOF, '+z', 'concrete', { thin: true });
    // rooftop dressing
    P.acUnit(L, 12, ROOF, 3, 0);
    P.acUnit(L, 26, ROOF, 15, Math.PI / 2);
    P.waterTower(L, 27, ROOF, 5);
    P.antenna(L, 9.5, ROOF, 18.5, 9);
    for (const [x, z] of [[15, 7.5], [22, 11], [5, 15]]) { L.box(x - 0.35, ROOF, z - 0.35, x + 0.35, ROOF + 1.1, z + 0.35, 'metal'); L.box(x - 0.45, ROOF + 1.1, z - 0.45, x + 0.45, ROOF + 1.25, z + 0.45, 'metalDark'); }
    P.pipe(L, 14, ROOF + 0.3, 1, 14, ROOF + 0.3, 12, 0.08, 'rust');
    P.pipe(L, 14, ROOF + 0.3, 12, 20, ROOF + 0.3, 12, 0.08, 'rust');
    // clothesline between posts
    for (const x of [9, 17]) L.box(x - 0.04, ROOF, 15.9, x + 0.04, ROOF + 1.9, 16.1, 'metalDark');
    P.pipe(L, 9, ROOF + 1.85, 16, 17, ROOF + 1.8, 16, 0.006, 'fabric', 0xdddddd);
    for (let i = 0; i < 4; i++) L.box(10 + i * 1.8, ROOF + 1.2, 15.98, 10.8 + i * 1.8, ROOF + 1.8, 16.02, 'fabric', { collide: false, tint: rng.pick([0xd8d8d0, 0x6a8ab0, 0xb04040, 0xd8c890]) });
    // start supplies under a tarp
    supplies(L, 14.5, ROOF, 9.5, 0, ['smg', 'pumpShotgun', 'smg', 'pumpShotgun'], { w: 2.2 });
    supplies(L, 17.5, ROOF, 9.5, 0, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 1.8 });
    L.item('pipebomb', 12.4, ROOF + 0.02, 10.4, { chance: 0.6 });
    L.box(12.6, ROOF + 2.1, 8.4, 19.4, ROOF + 2.15, 10.9, 'fabric', { collide: false, tint: 0x4a5a3a });
    for (const [x, z] of [[12.7, 8.5], [19.3, 8.5], [12.7, 10.8], [19.3, 10.8]]) L.box(x - 0.03, ROOF, z - 0.03, x + 0.03, ROOF + 2.1, z + 0.03, 'metalDark', { collide: false });
    L.light(16, ROOF + 1.9, 9.6, 0xffe2b0, 8, 8, { flicker: 0.1 });
    P.sandbags(L, 20, ROOF, 13, 0.3, 3, 2);
    P.corpse(L, 21, ROOF + 0.01, 16, 1.2, 0x3a4a3a);
    L.decal(21, ROOF + 0.02, 16, 0, 1, 0, 2, DF.POOL);
    graffiti(L, 'GO TO\nMERCY', 31.73, ROOF + 0.6, 10, -Math.PI / 2, 1.6, 0.9, '#c8c8c0');
    // survivors start near the supplies
    L.survivorStart.push({ x: 15, y: ROOF, z: 12, yaw: 0 }, { x: 17, y: ROOF, z: 12.2, yaw: 0.2 }, { x: 13.5, y: ROOF, z: 12.8, yaw: -0.3 }, { x: 16, y: ROOF, z: 13.6, yaw: 0 });
    L.flowStart = [15, ROOF, 12];

    // ================================================================ F3
    // corridor
    L.box(0.2, F3 - 0.02, 9.4, 31.8, F3 + 0.005, 11.4, 'carpetGray', { collide: false });
    for (let x = 3; x < 30; x += 6) ceilingLight(L, x, F3 + 3.3, 10.4, { type: 'fluoro', intensity: 9, flicker: x > 20 ? 0.8 : 0.25 });
    L.reverb(0.4, F3, 9.4, 31.6, F3 + 3.3, 11.4, 'room');
    L.ambience(0.4, F3, 0.4, 31.6, F3 + 3.3, 19.6, 'apartments');
    // stair enclosure (west) walls on F3
    L.wallX(0.4, 7, 9.4, F3, F3 + 3.3, 'plasterDirty', 0.14, [{ a: 4.65, b: 5.75, y1: F3 + 2.2 }]);
    new Door(L, 5.2, F3, 9.4, 'x', { width: 1.0, open: true });
    L.wallZ(0.4, 9.4, 7, F3, F3 + 3.3, 'plasterDirty', 0.2);
    L.box(0.4, F3 - 0.02, 0.4, 7, F3 + 0.005, 9.4, 'concreteFloor', { collide: false });
    sign(L, '3', 5.2, F3 + 2.5, 9.31, 0, 0.4, 0.4, { bg: '#2a4a8a', fg: '#fff' });
    // apartments F3 north (door on south wall = z 9.4)
    apartment(L, 7, 0.4, 15.5, 9.4, F3, { doorWall: 's', doorAt: 11.5, hinge: -1, noWall: ['w'], items: [{ type: 'pills', x: 9, z: 7.6, chance: 0.4 }] });
    apartment(L, 15.5, 0.4, 24, 9.4, F3, { doorWall: 's', doorAt: 17.5, doorOpen: true, swing: -1, noWall: ['w'], items: [{ type: 'melee', x: 21, z: 2.5, chance: 0.5 }] });
    apartment(L, 24, 0.4, 31.6, 9.4, F3, { doorWall: 's', doorAt: 26.5, locked: true, lights: false, noWall: ['w', 'e'] });
    // apartments F3 south (door on north wall = z 11.4)
    apartment(L, 0.4, 11.4, 10.8, 19.6, F3, { doorWall: 'n', doorAt: 5.5, doorOpen: false, hinge: -1, noWall: ['s'], items: [{ type: 'throwable', x: 3, z: 17, chance: 0.5 }] });
    apartment(L, 10.8, 11.4, 21.2, 19.6, F3, { doorWall: 'n', doorAt: 14.5, doorOpen: true, noWall: ['s', 'w'] });
    // 3F: burning apartment with the collapsed floor
    const hole3 = [27, 14, 29.6, 16.6];
    apartment(L, 21.2, 11.4, 31.6, 19.6, F3, { doorWall: 'n', doorAt: 23.3, doorOpen: true, empty: true, lights: false, partX: 25.5, noWall: ['s', 'w', 'e'], holes: [hole3] });
    P.sofa(L, 23.5, F3, 18.6, Math.PI, 0x3a2a20);
    P.bed(L, 28.2, F3, 18.2, Math.PI, 0x4a3a30);
    P.debris(L, 28.3, F3, 13, 1.0, 'woodDark', 10);
    P.debris(L, 26, F3, 16.5, 0.7, 'plaster', 6);
    fireSource(L, 24.2, F3, 13.2, 1.1);
    fireSource(L, 30.5, F3, 12.5, 0.9);
    fireSource(L, 23.5, F3, 17.2, 0.8);
    L.decal(28.3, F3 + 3.29, 15.3, 0, -1, 0, 4, DF.SCORCH);
    // corridor east end: collapsed ceiling + fire blocks the way
    L.box(28, F3, 9.45, 31.55, F3 + 3.3, 11.35, 'plasterDirty', { tint: 0x5a5048 });
    P.debris(L, 27, F3, 10.4, 0.8, 'plaster', 10);
    fireSource(L, 27.2, F3, 10.4, 0.8);
    L.decal(27.5, F3 + 1.5, 9.48, 0, 0, 1, 2.5, DF.SCORCH);
    // skylight bedroom landing: a mattress under the skylight in 3B's bedroom area
    P.bed(L, 18.9, F3, 4.0, 0, 0x6a6a7a);
    // voice: jump down
    L.trigger(25, F3, 12, 31, F3 + 3, 19, () => game.voice.say(game.survivors.find((s) => s.char.id === 'bill') || game.player, 'lead', 2, { text: 'Floor\'s gone - everybody jump down, together!' }), {});

    // ================================================================ F3 slab (floor of F3 / ceiling of F2)
    slab(L, 0.2, 0.2, 31.8, 19.8, F3, [hole3], 'concreteFloor', 'ceiling');
    P.debris(L, 28.3, F2, 15.3, 1.2, 'plaster', 14);
    L.decal(28.3, F2 + 0.02, 15.3, 0, 1, 0, 3, DF.SCORCH, { alpha: 0.7 });
    // ================================================================ F2
    L.box(0.2, F2 - 0.02, 9.4, 31.8, F2 + 0.005, 11.4, 'carpetGray', { collide: false });
    L.wallX(24.4, 31.8, 9.4, F2, F2 + 3.3, 'concreteDark', 0.2, [{ a: 25.2, b: 26.4, y1: F2 + 2.2 }]);
    const d2 = new Door(L, 25.8, F2, 9.4, 'x', { width: 1.1, open: true, hinge: -1, material: 'paintedGreen' });
    d2.dirSign = -1; d2.updateCollider();
    // ry 0: the sign's front faces the corridor, so its glow light lands on that side
    sign(L, 'EXIT', 25.8, F2 + 2.55, 9.53, 0, 0.6, 0.2, { bg: '#0a2a0a', fg: '#3aff5a', glow: 1.5, lightColor: 0x30ff50, lightIntensity: 2 });
    for (let x = 3; x < 30; x += 6) ceilingLight(L, x, F2 + 3.3, 10.4, { type: 'fluoro', intensity: 9, flicker: 0.3, on: x !== 9 });
    L.reverb(0.4, F2, 9.4, 31.6, F2 + 3.3, 11.4, 'room');
    L.ambience(0.4, F2, 0.4, 31.6, F2 + 3.3, 19.6, 'apartments');
    // west end of the corridor is blocked by a barricade of furniture
    P.sofa(L, 3.2, F2, 10.4, Math.PI / 2, 0x3a3a3a);
    L.box(0.4, F2, 9.45, 2.2, F2 + 2.4, 11.35, 'woodDark', { tint: 0x7a6a5a });
    P.dresser(L, 4.4, F2, 10.4, Math.PI / 2);
    L.box(2.2, F2, 9.45, 5.2, F2 + 1.6, 11.35, 'woodDark', { visible: false });
    graffiti(L, 'THEY HEAR\nEVERYTHING', 8.5, F2 + 1.6, 11.28, Math.PI, 1.8, 0.9, '#8a1a14');
    apartment(L, 0.4, 0.4, 12, 9.4, F2, { doorWall: 's', doorAt: 7.5, locked: true, lights: false });
    apartment(L, 12, 0.4, 24.3, 9.4, F2, { doorWall: 's', doorAt: 18, doorOpen: false, hinge: -1, noWall: ['w', 'e'], items: [{ type: 'health', x: 14, z: 2, chance: 0.6 }] });
    apartment(L, 0.4, 11.4, 10.8, 19.6, F2, { doorWall: 'n', doorAt: 7.5, locked: true, noWall: ['s'] });
    apartment(L, 10.8, 11.4, 21.2, 19.6, F2, { doorWall: 'n', doorAt: 13.5, doorOpen: true, noWall: ['s', 'w'], items: [{ type: 'ammo', x: 12, z: 18.6, chance: 0.5 }] });
    apartment(L, 21.2, 11.4, 31.6, 19.6, F2, { doorWall: 'n', doorAt: 23.4, doorOpen: false, partX: 26, noWall: ['s', 'w', 'e'] });
    L.decal(24.1, F2 + 0.013, 12.5, 0, 1, 0, 1.2, DF.BLOOD3);

    // ================================================================ F2 slab / F1 slab (skip east shaft)
    const shaft = [24.4, 0.2, 31.8, 7.8];
    slab(L, 0.2, 0.2, 31.8, 19.8, F2, [shaft], 'concreteFloor', 'ceiling');
    slab(L, 0.2, 0.2, 31.8, 19.8, F1, [shaft], 'concreteFloor', 'ceiling');
    // F1 is inaccessible: solid fill so nothing spawns there
    L.box(0.4, F1, 0.4, 24.3, F2 - 0.3, 19.6, 'concreteDark', { visible: false });
    L.box(24.3, F1, 9.5, 31.6, F2 - 0.3, 19.6, 'concreteDark', { visible: false });

    // ================================================================ EAST STAIR SHAFT (F2 -> F0)
    const sm = 'concrete';
    L.box(24.3, F0, 0.2, 24.5, F2 + 3.3, 9.3, 'concreteDark');
    for (const [yTop, yMid, yBot] of [[F2, F2 - 1.8, F1], [F1, F1 - 1.8, F0]]) {
      // south landing at yTop (F2 landing is part of slab); F1 landing:
      L.stairs(28.1, 5.1, 31.5, 7.8, yMid, yTop, '+z', sm, { thin: true });
      L.box(24.5, yMid - 0.3, 3.4, 31.5, yMid, 5.1, sm);
      L.stairs(24.5, 5.1, 27.9, 7.8, yBot, yMid, '-z', sm, { thin: true });
      L.box(27.9, yBot, 5.1, 28.1, yTop + 1.0, 7.8, 'metalDark', { flags: F_SOLID | F_SHOOT });
      ceilingLight(L, 28, yTop + 3.2, 4.2, { type: 'cage', intensity: 6, flicker: yTop === F1 ? 0.7 : 0.2 });
    }
    L.box(24.5, F0, 0.2, 31.6, F0 + 0.02, 3.4, sm, { collide: false });
    L.reverb(24.4, F0, 0.2, 31.6, F2 + 3.3, 9.4, 'stairwell');
    // F1 door (locked) on the landing
    L.wallX(24.4, 31.8, 9.4, F1, F1 + 3.3, 'concreteDark', 0.2, [{ a: 25.2, b: 26.4, y1: F1 + 2.2 }]);
    new Door(L, 25.8, F1, 9.4, 'x', { width: 1.1, locked: true, material: 'paintedGreen' });
    sign(L, '2', 25.8, F2 + 2.5, 9.28, 0, 0.35, 0.35, { bg: '#2a4a8a', fg: '#fff' });
    sign(L, '1', 25.8, F1 + 2.5, 9.28, 0, 0.35, 0.35, { bg: '#2a4a8a', fg: '#fff' });
    graffiti(L, 'DOWN ↓', 31.78, F2 + 1.4, 8.6, -Math.PI / 2, 1.2, 0.6, '#d8d8c8');
    L.decal(26, F1 + 1.2, 9.28, 0, 0, -1, 0.7, DF.HAND, { noRoll: true });
    L.decal(29.5, F1 + 0.02, 8.5, 0, 1, 0, 1.4, DF.POOL);
    P.corpse(L, 29.5, F1 + 0.02, 8.5, 0.3);
    // scripted mob when entering the shaft: they pour down from the floors above
    L.trigger(24.5, F2, 7.8, 31.5, F2 + 3, 9.4, () => {
      game.director.spawnMob(14, { where: 'behind', minD: 10, maxD: 35 });
      game.voice.say(game.survivors[1], 'hordeIncoming', 2);
    });

    // ================================================================ F0 LOBBY
    const lobbyY = F0;
    L.box(0.2, -0.3, 0.2, 31.8, 0, 19.8, 'marble', { ao: 1 });
    L.wallX(8, 24.4, 9.4, F0, F1 - 0.3, 'marble', 0.2);
    L.wallX(24.4, 31.8, 9.4, F0, F1 - 0.3, 'concreteDark', 0.2, [{ a: 25.2, b: 26.4, y1: 2.2 }]);
    const d0 = new Door(L, 25.8, F0, 9.4, 'x', { width: 1.1, open: true, hinge: -1, material: 'paintedGreen' });
    d0.dirSign = -1; d0.updateCollider();
    L.wallZ(9.4, 19.6, 8, F0, F1 - 0.3, 'plaster', 0.2, [{ a: 11.5, b: 12.6, y1: 2.2 }]);
    new Door(L, 8, F0, 12.05, 'z', { width: 1.0 });
    L.box(0.4, F0, 0.4, 24.3, F1 - 0.3, 9.3, 'concreteDark', { visible: false }); // closed-off north side
    // lobby furniture
    for (let x = 10; x < 24; x += 0.62) L.box(x, 0.9, 9.42, x + 0.58, 2.1, 9.62, 'metalClean', { collide: false, tint: 0x9a8a5a }); // mailboxes
    L.box(9.9, 0, 9.4, 24.1, 0.9, 9.7, 'woodDark');
    P.receptionDesk(L, 16, 0, 14, 0, 3.5);
    P.bench(L, 12, 0, 18.4, Math.PI);
    P.bench(L, 28, 0, 18.4, Math.PI);
    P.planter(L, 9.2, 0, 18.8);
    P.planter(L, 30.8, 0, 18.8);
    P.rug(L, 19.5, 0.005, 16.5, 4, 5, 0x4a1a1a);
    // elevator (out of order)
    L.box(18.9, 0, 9.55, 21.1, 2.4, 9.62, 'metalClean', { collide: false });
    L.box(19.98, 0, 9.5, 20.02, 2.4, 9.64, 'blackMatte', { collide: false });
    sign(L, 'OUT OF\nORDER', 20, 1.5, 9.66, Math.PI, 0.7, 0.45, { bg: '#e8e0c8', fg: '#8a1010' });
    ceilingLight(L, 16, 3.3, 14, { type: 'bulb', intensity: 11, flicker: 0.5 });
    ceilingLight(L, 26, 3.3, 15, { type: 'bulb', intensity: 8, on: false });
    L.reverb(8, 0, 9.4, 31.6, 3.3, 19.6, 'hall');
    L.ambience(0.4, 0, 0.4, 31.6, 3.3, 19.6, 'apartments');
    P.corpse(L, 21, 0.01, 12.5, 2.2, 0x2a2a3a);
    L.decal(21, 0.012, 12.5, 0, 1, 0, 2.2, DF.POOL);
    L.decal(22.5, 0.012, 13.6, 0, 1, 0, 1.4, DF.SMEAR, { roll: 0.4 });
    L.item('health', 17, 1.17, 14, { chance: 0.6 });
    L.item('ammo', 14.5, 0.01, 12.2, { chance: 0.7 });
    // laundry room (west)
    room(L, { x0: 0.4, z0: 9.4, x1: 8, z1: 19.6, y: 0, h: 3.3, floor: false, ceil: false, wall: 'plasterDirty', walls: { n: false, s: false, w: false, e: false }, light: { type: 'fluoro', intensity: 8, flicker: 0.6 } });
    L.box(0.4, -0.02, 9.6, 7.9, 0.006, 19.6, 'tileFloor', { collide: false });
    L.box(0.4, 0, 9.4, 8, 3.3, 9.6, 'plasterDirty');
    for (let i = 0; i < 4; i++) { P.prop(L, 1.2 + i * 1.5, 0, 18.9, 0).box(0, 0.45, 0, 0.7, 0.9, 0.7, 'paintedWhite').col(0, 0.45, 0, 0.7, 0.9, 0.7, 'metal'); }
    L.item('pills', 2.2, 0.92, 18.9, { chance: 0.7 });
    L.item('throwable', 5.5, 0.92, 18.9, { chance: 0.5 });
    // front entrance canopy
    L.box(17.4, 3.0, 20.2, 21.6, 3.15, 22.2, 'metalDark', { collide: false });
    sign(L, 'THE ROSEWOOD', 19.5, 3.45, 20.25, Math.PI, 3, 0.45, { fg: '#d8c890', font: 'Georgia, serif' });

    // ================================================================ STREET: HAWTHORNE AVE
    street(L, -30, 20, 96, 37, 'x', { sidewalk: 3 });
    sign(L, 'HAWTHORNE AV', 34.5, 3.2, 21.3, 0, 1.6, 0.35, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
    L.box(34.45, 0, 21.2, 34.55, 3.02, 21.4, 'metalDark');
    for (const x of [-18, 6, 30, 54]) P.streetLight(L, x, 0.15, 21.6, Math.PI, { flicker: x === 30 ? 0.7 : 0, on: x !== 54 });
    for (const x of [-6, 18, 42, 66]) P.streetLight(L, x, 0.15, 35.4, 0, { on: x !== -6 });
    P.trafficLight(L, 95.5, 0.15, 21.5, Math.PI);
    P.hydrant(L, 24, 0.15, 21.2);
    P.mailbox(L, 12, 0.15, 21.4, Math.PI);
    P.newsBox(L, 27, 0.15, 21.3, Math.PI);
    P.newsBox(L, 28, 0.15, 21.3, Math.PI, 0x1a4a8a);
    P.trashCan(L, 36, 0.15, 35.2);
    P.bench(L, 48, 0.15, 35.4, 0);
    // wrecked & parked cars
    P.car(L, -8, 0, 24.4, Math.PI / 2 + 0.1);
    P.car(L, 5, 0, 32.2, -Math.PI / 2);
    P.car(L, 24, 0, 26.5, 0.4, { burnt: true });
    fireSource(L, 24, 0.8, 26.5, 0.9, { hazard: false });
    alarmCar(L, 36, 0, 24.3, Math.PI / 2, 0x8a8a88);
    P.car(L, 46, 0, 31.8, -Math.PI / 2 + 0.25, { police: true });
    hittable(L, 'car', 58, 0, 25, Math.PI / 2 - 0.2, { color: 0x2a3a5a });
    alarmCar(L, 62, 0, 32.4, -Math.PI / 2, 0x7a1a14);
    P.van(L, -18, 0, 31.5, Math.PI / 2);
    physProp(L, 'cone', 44, 0, 28);
    physProp(L, 'cone', 45.2, 0, 29.5);
    physProp(L, 'trashcan', 20, 0.15, 21.8);
    physProp(L, 'propane', 31, 0.15, 21.6);
    physProp(L, 'gascan', 50, 0, 30.2);
    P.trashBags(L, 33.5, 0.15, 21.6, 5);
    P.papers(L, 30, 0.01, 28, 6, 18);
    for (let i = 0; i < 8; i++) L.decal(-10 + rng() * 80, 0.012, 23 + rng() * 10, 0, 1, 0, 0.8 + rng() * 1.2, DF.BLOOD1 + (i % 4));
    // military roadblock across the avenue (x 70..72)
    P.sandbags(L, 71, 0, 26, Math.PI / 2, 6, 4);
    P.sandbags(L, 71, 0, 31.5, Math.PI / 2, 5, 4);
    L.box(70.5, 0, 20, 72, 3, 37, 'metal', { visible: false }); // blocker
    P.fenceChain(L, 71.5, 20, 71.5, 37, 0, 3.2);
    P.truck(L, 76, 0, 28, Math.PI / 2 + 0.3, 0x3a4a2a);
    fireSource(L, 76, 3.2, 26.5, 1.6, { hazard: false });
    P.barricade(L, 68.5, 0, 24, Math.PI / 2);
    P.barricade(L, 68.5, 0, 33, Math.PI / 2);
    sign(L, 'QUARANTINE ZONE\nNO ENTRY', 71.4, 2.2, 28.5, -Math.PI / 2, 2.4, 1.1, { bg: '#d8c030', fg: '#101010', border: '#101010' });
    P.bodyBag(L, 67, 0.01, 27, 0.2);
    P.bodyBag(L, 67.2, 0.01, 29, 0.1);
    P.bodyBag(L, 66.8, 0.01, 31, -0.2);
    supplies(L, 66, 0.15, 21.6, Math.PI, ['ammo'], { w: 1.2 });
    L.item('tier1', 65.2, 0.15 + 0.78, 21.8, { chance: 0.8 });
    L.item('pipebomb', 66.6, 0.95, 21.6, { chance: 0.5 });
    L.light(66, 2.5, 22, 0xffd0a0, 10, 9, { flicker: 0.2 });
    burningBarrel(L, 64, 0.15, 34.5);

    // ================================================================ BUILDINGS AROUND THE STREET
    // north side: building B (x 38..62), east facades
    facade(L, 38, 0, 62, 20, 0, 13, { mat: 'brick', faces: ['s', 'w'], lit: 0.05 });
    facade(L, 62, 0, 96, 20, 0, 18, { mat: 'brickDark', faces: ['s', 'e'], lit: 0.06 });
    facade(L, -30, 0, 0, 20, 0, 16.5, { mat: 'brickDark', faces: ['s', 'e'], lit: 0.05 });
    facade(L, -30, -30, 96, 0, 0, 24, { mat: 'concrete', faces: ['s'], lit: 0.04, parapet: false });
    // alley between A and B (x 32..38) -- dead end, dressing
    L.floor(32, 0, 38, 20, 0.15, 'concreteDark', 0.5);
    P.dumpster(L, 35, 0.15, 6, Math.PI / 2);
    P.trashBags(L, 34, 0.15, 10, 5);
    burningBarrel(L, 36.5, 0.15, 14);
    for (let y = 3.3; y < 13; y += 3.6) { L.box(36.6, y, 4, 37.9, y + 0.08, 12, 'metalDark', { collide: false }); P.pipe(L, 36.8, y + 1, 4, 36.8, y + 1, 12, 0.02, 'metalDark'); }
    // storefront block south of the avenue (z 37..54)
    facade(L, -30, 37, 34, 54, 0, 12, { mat: 'brickTan', faces: ['n'], lit: 0.07, skipBelow: 3.2 });
    // shop windows on the storefronts
    for (const [x0, x1, name, col] of [[-26, -14, 'EDDIE\'S DINER', '#ff5a3a'], [-12, 2, 'LAUNDROMAT', '#6ab0ff'], [4, 16, 'BOOKS & MORE', '#ffd080'], [18, 32, 'LIQUOR', '#ff3a8a']]) {
      L.box(x0 + 0.5, 0.6, 36.95, x1 - 0.5, 2.8, 37.0, 'glassDirty', { collide: false, tint: 0x151c20 });
      L.box(x0, 2.9, 36.2, x1, 3.05, 37, 'fabric', { collide: false, tint: rng.pick([0x7a1a14, 0x1a3a6a, 0x2a4a2a, 0x6a5a2a]) });
      sign(L, name, (x0 + x1) / 2, 3.5, 36.95, 0, Math.min(6, x1 - x0 - 1), 0.6, { fg: col, glow: rng() < 0.6 ? 1.6 : 0, lightColor: parseInt(col.slice(1), 16), lightIntensity: 3 });
    }
    facade(L, 48, 37, 96, 46.7, 0, 14, { mat: 'brick', faces: ['n'], lit: 0.05, skipBelow: 3.2 });
    // ================================================================ PHARMACY (x 34..48, z 37..47)
    const phY = 0;
    L.floor(34, 37, 48, 47, 0.15, 'linoleum', 0.3);
    L.ceiling(34, 37, 48, 47, 3.6, 'ceiling');
    L.wallX(34, 48, 37, 0, 3.6, 'brickTan', 0.3, [{ a: 35, b: 39.5, y0: 0.8, y1: 2.9 }, { a: 40.2, b: 41.8, y0: 0, y1: 2.4 }, { a: 42.5, b: 47, y0: 0.8, y1: 2.9 }]);
    new WindowPane(L, 42.5, 0.8, 36.98, 47, 2.9, 37.02, { dirty: true }); // left window intact, right one smashed
    L.box(35, 0.3, 36.8, 39.5, 0.8, 37.2, 'metalDark', { collide: false });
    L.wallZ(37, 47, 34, 0, 3.6, 'plasterBlue', 0.3);
    L.wallZ(37, 47, 48, 0, 3.6, 'plasterBlue', 0.3);
    L.wallX(34, 48, 47, 0, 3.6, 'plasterBlue', 0.3, [{ a: 45, b: 46.2, y1: 2.4 }]);
    new Door(L, 45.6, 0.15, 47, 'x', { width: 1.1, material: 'paintedWhite' });
    sign(L, 'PHARMACY', 41, 3.3, 36.8, 0, 3.4, 0.6, { fg: '#40ff70', glow: 2.2, lightColor: 0x40ff70, lightIntensity: 5 });
    sign(L, '+', 45.5, 3.3, 36.8, 0, 0.6, 0.6, { fg: '#40ff70', glow: 2.2, light: false });
    for (let z = 39.5; z < 45; z += 2.2) {
      const p = P.prop(L, 38, 0.15, z, 0);
      p.box(0, 0.8, 0, 6, 1.6, 0.6, 'metal', 0xc8c8c0).col(0, 0.8, 0, 6, 1.6, 0.6, 'metal');
      for (let k = 0; k < 18; k++) p.box(-2.7 + (k % 9) * 0.65, 0.45 + Math.floor(k / 9) * 0.5, -0.33, 0.12, 0.2, 0.06, 'plastic', rng.pick([0xd8d8d0, 0xc86818, 0x3a6aa0, 0xd02020, 0x40a060]));
    }
    P.counter(L, 45, 0.15, 41, Math.PI / 2, 4);
    ceilingLight(L, 38, 3.6, 40, { type: 'fluoro', intensity: 10, flicker: 0.4 });
    ceilingLight(L, 44, 3.6, 43, { type: 'fluoro', intensity: 10, on: false });
    L.reverb(34, 0, 37, 48, 3.6, 47, 'room');
    L.item('pills', 38, 1.8, 39.2, { chance: 0.8 });
    L.item('pills', 36.5, 1.8, 43.6, { chance: 0.6 });
    L.item('medkit', 45, 1.1, 40.2, { chance: 0.5 });
    L.item('ammo', 46.5, 0.16, 45.6, { chance: 0.9 });
    L.item('tier1', 45, 1.1, 42.3, { chance: 0.6 });
    P.corpse(L, 42, 0.16, 45, 1, 0xd8d8d0);
    L.decal(42, 0.17, 45, 0, 1, 0, 1.5, DF.POOL);
    graffiti(L, 'NO MORE\nPILLS', 47.83, 1.8, 42, -Math.PI / 2, 1.6, 0.8, '#1a1a8a');

    // ================================================================ BACK ALLEY (z 47..54, x 34..104)
    L.floor(34, 47, 96, 55, 0.15, 'concreteDark', 0.5);
    L.box(30, 0, 54.8, 96, 12, 55.3, 'brickDark');
    L.box(29.7, 0, 47, 34, 12, 55, 'brickDark'); // west dead end
    for (const [x, ry] of [[52, 0], [66, Math.PI], [83, 0]]) P.dumpster(L, x, 0.15, 53.6, ry);
    P.trashBags(L, 58, 0.15, 53.5, 6);
    P.trashBags(L, 75, 0.15, 48.2, 4);
    burningBarrel(L, 70, 0.15, 53.8);
    for (let x = 40; x < 100; x += 12) ceilingLight(L, x, 4.5, 47.3, { type: 'cage', intensity: 7, flicker: x % 24 === 4 ? 0.8 : 0.1, on: x !== 64 });
    for (const x of [44, 60, 76, 92]) { L.box(x, 3.4, 47.2, x + 4, 3.48, 48.6, 'metalDark', { collide: false }); L.box(x, 6.8, 47.2, x + 4, 6.88, 48.6, 'metalDark', { collide: false }); }
    graffiti(L, 'SUBWAY →', 60, 1.8, 54.75, Math.PI, 2, 0.8, '#d8d8c8');
    L.reverb(34, 0, 47, 104, 12, 55, 'room');
    L.witchSpots.push({ x: 80, y: 0.15, z: 51.5 }, { x: 57, y: 0.15, z: 50.5 });
    physProp(L, 'propane', 62, 0.15, 48.2);
    physProp(L, 'box', 88, 0.15, 53.4);
    physProp(L, 'box', 88.6, 0.15, 52.8);

    // ================================================================ GRAND STREET (x 96..112) & SUBWAY ENTRANCE
    const stairHole = [101.4, 3, 106.6, 12.8];
    street(L, 96, -20, 114, 55, 'z', { sidewalk: 3, holes: [stairHole], noSidewalk: [[20, 37], [47, 55]] });
    facade(L, 114, -30, 140, 60, 0, 20, { mat: 'concrete', faces: ['w'], lit: 0.06 });
    facade(L, 90, -30, 96, 20, 0, 22, { mat: 'concrete', faces: ['e'], lit: 0.04, parapet: false });
    facade(L, 96, -30, 114, -20, 0, 22, { mat: 'concreteDark', faces: ['n'], lit: 0.03 });
    L.box(96, 0, 55, 114, 12, 56, 'brickDark');
    P.streetLight(L, 98.4, 0.15, 37.8, -Math.PI / 2, { flicker: 0.4 });
    P.streetLight(L, 111.6, 0.15, 8, Math.PI / 2);
    P.car(L, 106, 0, 40, 0.15, { taxi: true, color: 0xd8b020 });
    P.car(L, 103, 0, 20, Math.PI + 0.3, { burnt: true });
    fireSource(L, 103, 0.8, 20, 0.8, { hazard: false });
    P.bench(L, 112.4, 0.15, 41, Math.PI / 2);
    sign(L, 'GRAND ST', 98.6, 3.2, 44, Math.PI / 2, 1.3, 0.3, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
    L.box(98.5, 0, 43.95, 98.7, 3.04, 44.05, 'metalDark');
    // subway entrance: stairs down from z=12.8 (street) to z=3 (y=-6), tunnel to the concourse
    const SY = -6;
    L.stairs(101.7, 3, 106.3, 12.8, SY, 0, '+z', 'tileFloor', { stepH: 0.2 });
    for (const [xa, xb] of [[101.4, 101.7], [106.3, 106.6]]) {
      L.box(xa, SY, -3, xb, 0, 12.8, 'tileSubway');
      L.box(xa, 0, 3, xb, 1.1, 12.8, 'metal', { tint: 0x2a5a3a });
    }
    L.box(101.4, SY + 3.4, -3.2, 106.6, -0.5, 3, 'concrete');
    sign(L, 'SUBWAY', 104, 2.2, 12.95, 0, 2.6, 0.55, { bg: '#1a3a1a', fg: '#e8f0e8', glow: 1.2, lightColor: 0x80ffa0, lightIntensity: 3 });
    sign(L, 'Hawthorne St Station', 104, 1.65, 12.95, Math.PI, 2.6, 0.3, { bg: '#1a3a1a', fg: '#d0d8d0' });
    L.box(102.7, 1.35, 12.85, 105.3, 2.55, 12.9, 'metal', { collide: false, tint: 0x2a5a3a });
    for (const x of [101.55, 106.45]) { L.box(x - 0.08, 0, 12.8, x + 0.08, 2.6, 13.0, 'metal', { tint: 0x2a5a3a }); L.box(x - 0.15, 2.6, 12.75, x + 0.15, 2.9, 13.05, 'emissiveGreen', { collide: false }); }
    L.reverb(101.5, SY, -3, 106.5, 0.2, 13, 'tunnel');
    L.ambience(86, SY - 2, -32, 113, -0.1, 13, 'subway');
    ceilingLight(L, 104, SY + 3.4, 0, { type: 'fluoro', intensity: 8, flicker: 0.5 });

    // ================================================================ STATION CONCOURSE (y -6)
    const cx0 = 86, cx1 = 113, cz0 = -32, cz1 = -3;
    L.floor(cx0, cz0, cx1, cz1, SY, 'tileFloor', 0.4);
    L.floor(101.4, cz1, 106.6, 3, SY, 'tileFloor', 0.4);
    L.ceiling(cx0, cz0, cx1, cz1, SY + 4, 'concrete', 0.4);
    L.box(cx0 - 0.4, SY, cz0, cx0, SY + 4.4, cz1, 'tileSubway');
    L.box(cx1, SY, cz0, cx1 + 0.4, SY + 4.4, cz1, 'tileSubway');
    L.box(cx0, SY, cz0 - 0.4, cx1, SY + 4.4, cz0, 'tileSubway');
    L.wallX(cx0, cx1, cz1, SY, SY + 4, 'tileSubway', 0.4, [{ a: 101.7, b: 106.3, y0: SY, y1: SY + 3.4 }]);
    for (let x = cx0 + 4; x < cx1; x += 6) for (let z = cz0 + 5; z < cz1; z += 8) { if (x > 99 && z < -23) continue; L.box(x - 0.35, SY, z - 0.35, x + 0.35, SY + 4, z + 0.35, 'tileGreen'); }
    for (let x = cx0 + 3; x < cx1; x += 5) ceilingLight(L, x, SY + 4, -8, { type: 'fluoro', intensity: 10, flicker: x > 100 ? 0.2 : 0.7, on: x !== 96 });
    for (let x = cx0 + 3; x < cx1; x += 5) ceilingLight(L, x, SY + 4, -20, { type: 'fluoro', intensity: 9, flicker: 0.4, on: x % 2 === 0 });
    L.reverb(cx0, SY, cz0, cx1, SY + 4, cz1, 'hall');
    // ticket booth + turnstile line (z = -14)
    const tb = P.prop(L, 92, SY, -14, 0);
    tb.box(0, 1.2, 0, 3, 2.4, 2.2, 'metalClean', 0x9aa0a0).col(0, 1.2, 0, 3, 2.4, 2.2, 'metal');
    tb.box(0, 1.5, -1.11, 2.6, 0.9, 0.02, 'glassDirty', 0x303838);
    sign(L, 'TOKENS', 92, SY + 2.55, -15.13, 0, 1.2, 0.3, { bg: '#1a1a1a', fg: '#ffd040' });
    for (let x = 95; x < 110; x += 1.3) if (Math.abs(x - 102.8) > 0.5) P.turnstile(L, x, SY, -14);
    L.box(94.5, SY, -14.1, 102.0, SY + 1.0, -13.9, 'metalClean', { visible: false, flags: F_SOLID });
    L.box(103.6, SY, -14.1, 110.5, SY + 1.0, -13.9, 'metalClean', { visible: false, flags: F_SOLID });
    P.debris(L, 102.8, SY, -14.4, 0.4, 'metalClean', 4);
    L.box(110.5, SY, -14.1, 113, SY + 2.5, -13.9, 'metal', { tint: 0x5a5a58 });
    L.box(86, SY, -14.1, 90.5, SY + 2.5, -13.9, 'metal', { tint: 0x5a5a58 });
    // signage & ads
    sign(L, 'TO TRAINS ↓', 104, SY + 3.68, -3.22, Math.PI, 2.4, 0.4, { bg: '#1a1a1a', fg: '#fff' });
    for (const [z, t] of [[-6, 'VISIT\nMERCY HOSPITAL\nWE CARE'], [-12, 'FAIRVIEW\nTRANSIT'], [-24, 'KEEP CALM\nSTAY INSIDE']]) sign(L, t, cx0 + 0.02, SY + 2, z, Math.PI / 2, 2.4, 1.3, { bg: '#e8e4d8', fg: '#2a2a3a' });
    P.bench(L, 88, SY, -6, Math.PI / 2);
    P.bench(L, 88, SY, -22, Math.PI / 2);
    P.vending(L, 111.9, SY, -8, -Math.PI / 2);
    P.trashCan(L, 96, SY, -5);
    P.papers(L, 100, SY + 0.01, -10, 6, 20);
    for (let i = 0; i < 6; i++) L.decal(88 + rng() * 22, SY + 0.012, -30 + rng() * 25, 0, 1, 0, 1 + rng(), DF.BLOOD1 + (i % 4));
    P.corpse(L, 97, SY + 0.01, -19, 0.4, 0x1a2a4a);
    // safe room (end) at x 100..110, z -32..-24, door on north wall (z -24) at x 103
    const sr = safeRoom(L, { x0: 100, z0: -31.6, x1: 110, z1: -24, y: SY, h: 3.4, doorWall: 's', doorAt: 103, end: true, wall: 'tileSubway', floor: false,
      graffiti: ['THE PILOT\nIS REAL', 'HOSPITAL\nSTILL SAFE?', '47 DAYS', 'LOUIS\nWAS HERE?', 'DONT DRINK\nTHE WATER'] });
    supplies(L, 105, SY, -30.6, 0, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.0 });
    supplies(L, 108.2, SY, -27, Math.PI / 2, ['tier1', 'ammo'], { w: 1.4 });
    L.item('pills', 101.2, SY + 0.02, -30.8, { chance: 0.6 });
    sign(L, 'SAFE ROOM', 103, SY + 2.6, -23.88, Math.PI, 1.3, 0.35, { bg: '#8a1a14', fg: '#fff' });
    L.trigger(96, SY, -24, 110, SY + 3, -3, () => { game.voice.say(game.survivors[2], 'safeRoom', 2); game.session.objective('Get inside the safe room and close the door'); });
    L.flowEnd = [105, SY, -28];

    // ================================================================ backdrop skyline blocks
    facade(L, -60, -60, -30, 70, 0, 30, { mat: 'concreteDark', lit: 0.05, faces: ['e'] });
    facade(L, -30, 55, 96, 80, 0, 22, { mat: 'brickDark', lit: 0.05, faces: ['n'] });
    facade(L, 140, -60, 170, 80, 0, 36, { mat: 'concrete', lit: 0.05, faces: ['w'] });
    // Mercy Hospital landmark far away (north-west), visible from the roof
    facade(L, -140, -330, -80, -290, 0, 110, { mat: 'concrete', lit: 0.12, faces: ['s', 'e'] });
    sign(L, 'MERCY', -110, 100, -289.6, 0, 26, 7, { fg: '#ff3a2a', glow: 3, lightColor: 0xff3020, lightIntensity: 20 });
    // kill volume below the world
    L.killZone(-200, -60, -400, 300, -30, 200);

    // ================================================================ script
    const heli = new Helicopter(game, { color: 0x2a3a5a, stripe: 0xe0e0d8 });
    L.dynamics.push(heli);
    L.script = {
      start() {
        L.after(2.5, () => {
          heli.fly([
            { x: 180, y: 60, z: -60, t: 0 }, { x: 60, y: 32, z: 5, t: 7 }, { x: 16, y: 28, z: 10, t: 11 }, { x: -60, y: 45, z: -60, t: 18 }, { x: -160, y: 90, z: -280, t: 30 },
          ], { hideAtEnd: true });
          heli.setSearchlight(true);
          L.after(5.5, () => game.voice.script('introChopper'));
        });
        L.after(1, () => game.session.objective('Get to the subway'));
      },
    };
  },
  onStart(game, session) {
    game.voice.script('ch1Start');
  },
};
