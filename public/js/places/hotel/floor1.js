// The ground floor behind the lobby: the back-of-house corridor (painted
// brick, pipes, strip lights), the staff room with its lockers, the
// electrical room and the empty fuse box, Mr. Hale's office, the kitchen
// with the walk-in cold store, the restaurant and its bar, and the grand
// ballroom with the stage and the piano that plays by itself.
import * as THREE from 'three';
import { H } from './state.js';
import { FL, W, face, slab, rug, styles } from './shell.js';
import { Door } from './doors.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import * as P3 from './props3.js';
import { pickup, note } from './items.js';
import { NOTES } from './lore.js';
import { flat } from './materials.js';
import * as T from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

export function buildF1() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F1, nav = H.nav, O = H.obj;
  const F = 'F1';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, ...o });
  const hb = 11; // back of house ceilings

  // --- the back-of-house corridor -------------------------------------------------------------------------------------------------
  k.floor(-72, -22, -4, 4, y, M.tileFloor, { tile: 3 });
  k.ceiling(-72, -22, -4, 4, y + hb, M.ceilingDark);
  W('x', -4, -72, -58, y, hb, S.plaster, S.brick, { doors: [-65] });
  W('x', -4, -58, -46, y, hb, S.concrete, S.brick, { doors: [-52] });
  W('x', -4, -46, -22, y, hb, S.office, S.brick, { doors: [-30] });
  W('x', 4, -72, -44, y, hb, S.brick, S.kitchen, { doors: [-58] });
  W('x', 4, -44, -22, y, hb, S.brick, S.office);
  P3.pipeRun([[-72, y + hb - 0.8, -3], [-22.6, y + hb - 0.8, -3]], 0.3, M.pipe);
  P3.pipeRun([[-72, y + hb - 1.5, -2.2], [-40, y + hb - 1.5, -2.2], [-40, y + hb - 0.6, -2.2], [-23, y + hb - 0.6, -2.2]], 0.18, M.rust);
  P3.pipeRun([[-72, y + hb - 0.7, 3.1], [-22.6, y + hb - 0.7, 3.1]], 0.22, M.pipe);
  for (const x of [-64, -48, -32]) P.tubeLight(x, y + hb, 0, 0, { flicker: x === -48 ? 0.45 : 0.1, room: 'boh' });
  P.emergencyLight(-23, y + 9.6, 0, -PI / 2);
  O.dStaff = new Door({ x: -65, y, z: -4, axis: 'x', hinge: -1, swing: -1, plate: 1, style: 'staff', plateText: 'STAFF ROOM', plateStyle: 'enamel', name: 'Staff Room' });
  O.dElec = new Door({ x: -52, y, z: -4, axis: 'x', hinge: 1, swing: -1, plate: 1, style: 'metal', plateText: 'ELECTRICAL', plateStyle: 'enamel', name: 'Electrical Room' });
  O.dOffice = new Door({ x: -30, y, z: -4, axis: 'x', hinge: -1, swing: -1, plate: 1, style: 'guest', plateText: 'MANAGER', plateStyle: 'brass', name: "Manager's Office", locked: true, key: 'officeKey', lockedMsg: "The Manager's office. Locked. (There'll be a key at the front desk.)" });
  O.dKitchen = new Door({ x: -58, y, z: 4, axis: 'x', hinge: -1, swing: 1, plate: -1, style: 'staff', plateText: 'KITCHEN', plateStyle: 'enamel', name: 'Kitchen' });
  // odds and ends along the corridor
  k.at(-36, y, -3.2, 0).cyl(0, 1.6, 0, 0.45, 0.45, 2.6, flat(T.sign('FIRE', { w: 128, h: 128, style: 'enamel', bg: '#a01810', fg: '#f0e0d0', font: 'Impact' })), { seg: 10 });
  P2.housekeepingCart(-44, y, 2.4, 0.05);
  P.decal(-71.45, y + 6.2, 2.6, PI / 2, 1.4, 1.4, T.clockFace());
  P.decal(-41, y + 5.5, -3.45, 0, 3.4, 1, T.sign('NO GUESTS BEYOND THIS POINT', { w: 512, h: 96, style: 'enamel', bg: '#d8d0b8', fg: '#7a1010', font: 'Arial' }));
  for (const x of [-70, -65, -58, -52, -46, -38, -30, -25]) N(`c1:${x}`, x, 0);

  // --- the staff room -------------------------------------------------------------------------------------------------------------------
  {
    slab(-72, -58, -28, -4, y, hb, M.tileFloor, M.ceilingDark, { surface: 'tile' });
    W('z', -72, -28, -6, y, hb, null, S.plaster);
    face('z', -72, -6, -4, y, y + hb, 1, M.wallPlaster);
    W('x', -28, -72, -58, y, hb, null, S.plaster);
    W('z', -58, -28, -4, y, hb, S.plaster, S.concrete);
    O.lockers = [];
    for (const [i, z] of [-25.8, -23.2, -20.6, -18.0].entries()) {
      if (i === 1 || i === 3) O.lockers.push(P.locker(-70.35, y, z, PI / 2, { room: 'staff', label: true }));
      else lockerShell(-70.35, z);
    }
    k.at(-64.5, y, -14, 0).box(0, 2.6, 0, 3.6, 0.15, 6, M.woodMid);
    for (const [sx, sz] of [[-1.5, -2.6], [1.5, -2.6], [-1.5, 2.6], [1.5, 2.6]]) k.at(-64.5 + sx, y, -14 + sz, 0).box(0, 1.3, 0, 0.2, 2.6, 0.2, M.woodMid);
    k.solid(-66.3, -62.7, y, y + 2.7, -17, -11);
    P.chair(-66.8, y, -15.5, PI / 2, { seat: M.woodMid }); P.chair(-62.2, y, -12.5, -PI / 2, { seat: M.woodMid }); P.chair(-66.4, y, -10.5, 2.4, { fallen: true, seat: M.woodMid });
    k.at(-64.6, y + 2.68, -15.5, 0).cyl(0, 0.45, 0, 0.35, 0.4, 0.9, M.steel, { seg: 10 });
    for (let i = 0; i < 3; i++) k.at(-64.2 + i * 0.4, y + 2.68, -13 + i * 0.6, 0).cyl(0, 0.25, 0, 0.18, 0.15, 0.5, M.porcelain, { seg: 8 });
    O.radioStaff = P3.radio(-64.0, y + 2.68, -11.8, PI);
    P3.noticeBoard(-58.55, y + 5.5, -16, -PI / 2, { w: 5, h: 3.4 });
    P2.coatRack(-60, y, -7, { coat: true });
    pickup('batteryStaff', { pos: V(-65.2, y + 2.8, -16.4), kind: 'battery', give: 'battery' });
    P.tubeLight(-65, y + hb, -16, PI / 2, { room: 'staff', flicker: 0.2 });
    N('stf:a', -65, -7.5, { room: 'staff' }); N('stf:b', -61, -16, { room: 'staff', poi: true }); N('stf:l', -67.6, -21, { room: 'staff' }); N('stf:c', -61, -24, { room: 'staff' });
    nav.link('c1:-65', 'stf:a', { door: O.dStaff });
    for (const l of O.lockers) l.node = nav.get('stf:l');
  }
  // --- the electrical room ----------------------------------------------------------------------------------------------------------------
  {
    slab(-58, -46, -28, -4, y, hb, M.concrete, M.ceilingDark, { surface: 'concrete' });
    W('x', -28, -58, -46, y, hb, null, S.concrete);
    W('z', -46, -28, -4, y, hb, S.concrete, S.office);
    O.fuseBox = P2.fuseBox(-52, y + 5, -27.5, 0);
    for (const [x, w] of [[-56.4, 1.4], [-47.6, 1.6]]) k.at(x, y, -26.4, 0).box(0, 3.5, 0, w, 7, 1.8, M.steel);
    for (let i = 0; i < 3; i++) { const b = k.at(-57.5, y + 6 + i * 1.4, -12 - i * 3, PI / 2); b.box(0, 0, 0.3, 1.4, 1.1, 0.6, M.iron); b.cyl(0, 0.1, 0.62, 0.4, 0.4, 0.02, M.gauge, { rx: PI / 2, seg: 12 }); }
    P3.pipeRun([[-57, y + hb, -12], [-57, y + 4, -12], [-57, y + 4, -20]], 0.12, M.pipe, { flanges: false });
    P3.workbench(-48.0, y, -14, -PI / 2, { w: 6 });
    note('maintenance', { pos: V(-47.9, y + 3.27, -13.2), ry: 1.9, ...NOTES.maintenance });
    P.decal(-56.4, y + 8.2, -25.48, 0, 1.4, 1.4, T.sign('!', { w: 128, h: 128, style: 'enamel', bg: '#d8c020', fg: '#1a1a1a', size: 90 }));
    O.elecLight = P3.cageLight(-52, y + 9.2, -4.6, PI, { emergency: 0.35, room: 'elec', flicker: 0.2 });
    N('elec:a', -52, -7.5, { room: 'elec' }); N('elec:b', -52, -20, { room: 'elec', poi: true });
    nav.link('c1:-52', 'elec:a', { door: O.dElec });
  }
  // --- Mr. Hale's office ----------------------------------------------------------------------------------------------------------------
  {
    slab(-46, -22, -28, -4, y, hb, M.parquet, M.ceiling);
    W('x', -28, -46, -22, y, hb, null, S.office, { holes: [{ a: -33, b: -27, y0: y + 3, y1: y + 9 }] });
    W('z', -22, -28, -14, y, hb, S.office, null);
    P.windowAt('x', -28, -30, y + 3, 6, 6, 1, { curtainMat: M.velvetGreen });
    P.desk(-34, y, -18.5, 0, { w: 6.4, d: 3 });
    P.chair(-34, y, -21.6, 0, { seat: M.leather, solid: true });
    for (const x of [-37.5, -30.5]) P.chair(x, y, -13.8, PI + (x < -34 ? 0.3 : -0.3), { seat: M.velvetGreen });
    P.bankerLamp(-36.4, y + 2.82, -19.2, 0, { room: 'office' });
    P2.typewriter(-33.2, y + 2.82, -19.0, 0.1);
    P2.deskPhone(-31.6, y + 2.82, -19.6, -0.3);
    note('letter', { pos: V(-34.8, y + 2.89, -17.8), ry: 0.15, typed: true, ...NOTES.letter });
    note('clipping', { pos: V(-36.2, y + 2.89, -17.6), ry: -0.4, typed: true, w: 1.0, h: 1.3, ...NOTES.clipping });
    pickup('fuse1', { pos: V(-32.0, y + 2.97, -17.9), kind: 'fuse', give: 'fuse', ry: 0.4 });
    P2.bookcase(-44.7, y, -21, PI / 2, { w: 5, h: 9.5 });
    P2.bookcase(-44.7, y, -14.8, PI / 2, { w: 5, h: 9.5 });
    P2.safe(-43.6, y, -25.7, 0.25);
    P2.filingCabinet(-24.0, y, -26.4, -PI / 2 + 0.1, {});
    P2.filingCabinet(-24.0, y, -24.2, -PI / 2, { open: true });
    P2.globe(-40, y, -8, 0);
    P2.coatRack(-25.5, y, -6.8, { coat: true, hat: true });
    O.ward = P.wardrobe(-23.95, y, -17.5, -PI / 2, { room: 'office' });
    P2.portrait(-40, y + 6.8, -27.45, 0, { masked: true, w: 3.4, h: 4.2 });
    P.rugAt(-34, y, -15, 0, 10, 9, T.rug('office', '#3a1a10', '#140806', '#8a6a2a', 51));
    P2.gramophone(-44.2, y, -8.4, PI / 2 + 0.5);
    P.bowlLight(-34, y + hb, -15, { room: 'office', flicker: 0.1 });
    N('off:a', -30, -7.5, { room: 'office' }); N('off:b', -34, -11.5, { room: 'office', poi: true }); N('off:w', -26.4, -17.5, { room: 'office' }); N('off:d', -38, -22.5, { room: 'office' });
    nav.link('c1:-30', 'off:a', { door: O.dOffice });
    O.ward.node = nav.get('off:w');
  }
  // --- the kitchen ------------------------------------------------------------------------------------------------------------------------
  {
    slab(-72, -44, 4, 28, y, hb, M.tileFloor, M.ceilingDark, { surface: 'tile' });
    face('z', -72, 4, 16, y, y + hb, 1, M.subway);
    face('z', -72, 16, 24, y, y + hb, 1, M.steel);
    W('z', -72, 24, 28, y, hb, null, { mat: M.steel });
    W('z', -44, 4, 28, y, hb, S.kitchen, S.office, { doors: [{ at: 12, w: 4.4 }] });
    W('x', 28, -72, -62, y, 20, { mat: M.steel }, S.ball);
    W('x', 28, -62, -44, y, 20, S.kitchen, S.ball, { doors: [-50] });
    // the cold store
    W('z', -62, 16, 28, y, hb, { mat: M.steel }, S.kitchen, { doors: [22] });
    W('x', 16, -72, -62, y, hb, S.kitchen, { mat: M.steel });
    k.floor(-72, -62, 16, 28, y + 0.01, M.steel, { surface: 'metal', collide: false });
    k.box(-72, -62, y + hb - 1.2, y + hb - 1.1, 16, 28, M.steel, { faces: ['ny'] });
    O.dFreezer = new Door({ x: -62, y, z: 22, axis: 'z', hinge: -1, swing: 1, plate: 1, style: 'freezer', plateText: 'COLD STORE', plateStyle: 'enamel', name: 'Cold store' });
    P2.meatHooks(-67, y, 19.5, 0, 9, y + hb - 1.2);
    P2.meatHooks(-67, y, 24.5, 0, 9, y + hb - 1.2);
    P2.shelves(-70.7, y, 22, PI / 2, { w: 8, h: 7, d: 1.4, n: 4, fill: 'boxes', mat: M.steel });
    k.at(-70.5, y + 5.13, 25.2, PI / 2).box(0, 0, 0, 1.2, 0.8, 0.8, M.steel);
    pickup('fuse2', { pos: V(-70.4, y + 5.74, 25.2), kind: 'fuse', give: 'fuse', ry: 0.2 });
    O.freezerLight = P.tubeLight(-67, y + hb - 1.2, 22, PI / 2, { color: 0x9ac8ff, power: 9, circuit: 'battery', flicker: 0.25, room: 'freezer' });
    note('chef', { pos: V(-61.45, y + 5.2, 18.8), wall: true, ry: PI / 2, ...NOTES.chef });
    // the line: ranges, counters, pots, the sink
    P2.stove(-70.0, y, 10, PI / 2, { w: 9 });
    P2.steelCounter(-55, y, 11, 0, 9, 3, { pans: true });
    P2.steelCounter(-55, y, 18.5, 0, 9, 3, {});
    P2.potRack(-55, y + hb, 11, 0, { w: 7 });
    P2.potRack(-55, y + hb, 18.5, 0, { w: 7 });
    O.kitchenSink = P2.kitchenSink(-65, y, 6.1, 0);
    P2.shelves(-45.4, y, 24, -PI / 2, { w: 5, h: 8, d: 1.6, n: 4, fill: 'jars', mat: M.woodMid });
    O.pantry = P.wardrobe(-57, y, 26.0, PI, { room: 'kitchen', wood: M.woodMid });
    P3.barrel(-46.5, y, 6.5, {});
    k.at(-50, y, 15, 0.4).cyl(0, 0.3, 0, 0.6, 0.5, 0.6, M.steel, { seg: 12, rx: PI / 2 - 0.3 });
    for (const x of [-64, -55, -46]) P.tubeLight(x, y + hb, 15, PI / 2, { flicker: 0.12, room: 'kitchen' });
    N('kit:a', -58, 7.5, { room: 'kitchen' }); N('kit:b', -60.5, 15, { room: 'kitchen', poi: true }); N('kit:c', -48, 15, { room: 'kitchen' }); N('kit:d', -48.5, 23, { room: 'kitchen' }); N('kit:w', -57, 23.6, { room: 'kitchen' });
    N('kit:f', -60, 22, { room: 'kitchen' }); N('kit:r', -46.5, 12, { room: 'kitchen' }); N('kit:s', -50, 25.5, { room: 'kitchen' });
    N('frz:a', -64.5, 22, { room: 'freezer' }); N('frz:b', -68.5, 22, { room: 'freezer', poi: true });
    nav.link('c1:-58', 'kit:a', { door: O.dKitchen });
    nav.link('kit:f', 'frz:a', { door: O.dFreezer });
    O.pantry.node = nav.get('kit:w');
  }
  // --- the restaurant and its bar -------------------------------------------------------------------------------------------------------
  {
    slab(-44, -22, 4, 28, y, hb, M.parquet, M.ceiling);
    W('x', 28, -44, -22, y, 20, S.office, S.ball);
    O.dKitchenR = new Door({ x: -44, y, z: 12, axis: 'z', w: 4.4, hinge: -1, swing: 1, plate: 1, style: 'staff', name: 'Kitchen' });
    P2.bar(-33, y, 9.8, 0, 14);
    for (const x of [-38, -35.5, -33, -30.5, -28]) P2.barStool(x, y, 11.7);
    for (const [x, z] of [[-38.5, 17.5], [-29.5, 17.5], [-38.5, 23.8], [-29.5, 23.8]]) {
      P.roundTable(x, y, z, { r: 2.0, cloth: true });
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + x * 0.3; if (Math.random() < 0.2) P.chair(x + Math.cos(a) * 3.1, y, z + Math.sin(a) * 3.1, -a - PI / 2 + 1.2, { fallen: true }); else P.chair(x + Math.cos(a) * 3.0, y, z + Math.sin(a) * 3.0, Math.atan2(-Math.cos(a), -Math.sin(a)), {}); }
    }
    P.candles(-38.5, y + 2.9, 17.5, { n: 3 });
    O.gramophone = P2.gramophone(-24.4, y, 25.6, -PI * 0.75);
    P.chandelier(-33, y + hb, 20, { scale: 0.7, drop: 1.6, tiers: 1, room: 'dining' });
    for (const z of [8, 22]) P.sconce(-43.45, y + 5.6, z, PI / 2, { room: 'dining', flicker: 0.1 });
    N('rst:a', -40.5, 12.5, { room: 'dining' }); N('rst:b', -33.5, 14.5, { room: 'dining', poi: true }); N('rst:c', -24.5, 14.5, { room: 'dining' }); N('rst:d', -33.5, 21.5, { room: 'dining' }); N('rst:e', -24.5, 21.5, { room: 'dining' });
    nav.link('kit:r', 'rst:a', { door: O.dKitchenR });
  }
  // --- the grand ballroom --------------------------------------------------------------------------------------------------------------------
  ballroom();
}

function lockerShell(x, z) {
  const M = H.M, b = H.kit.at(x, FL.F1, z, PI / 2), w = 2.4, d = 2.2, h = 7.8;
  b.box(0, h / 2, 0, w, h, d, M.steel);
  b.box(0, h / 2, d / 2 + 0.02, w - 0.15, h - 0.2, 0.04, M.steel, { tint: '#c8c8c8' });
  for (let yy = h - 1.0; yy > h - 2.6; yy -= 0.3) b.box(0, yy, d / 2 + 0.06, 1.2, 0.1, 0.06, M.black);
  b.box(0.85, h * 0.5, d / 2 + 0.1, 0.15, 0.6, 0.15, M.steel);
  b.solid(0, h / 2, 0, w, h, d);
}

function ballroom() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F1, nav = H.nav, O = H.obj, F = 'F1';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, room: 'ball', ...o });
  const hh = 20;
  k.floor(-72, -22, 28, 60, y, M.parquet);
  k.ceiling(-72, -22, 28, 60, y + hh, M.ceiling);
  // a coffered ceiling
  for (let x = -66; x < -22; x += 8) k.box(x - 0.4, x + 0.4, y + hh - 1.2, y + hh, 28, 60, M.crown, { faces: ['ny', 'nx', 'px'] });
  for (let z = 32; z < 60; z += 8) k.box(-72, -22, y + hh - 1.2, y + hh, z - 0.4, z + 0.4, M.crown, { faces: ['ny', 'nz', 'pz'] });
  W('z', -72, 28, 60, y, hh, S.ext, S.ball);
  const wins = [-64, -54, -44, -34, -27];
  W('x', 60, -72, -22, y, hh, S.ball, S.ext, { holes: wins.map((x) => ({ a: x - 2.5, b: x + 2.5, y0: y + 3, y1: y + 15 })) });
  for (const x of wins) P.windowAt('x', 60, x, y + 3, 5, 12, -1, { power: 9, range: 18 });
  O.dBallKitchen = new Door({ x: -50, y, z: 28, axis: 'x', hinge: 1, swing: 1, plate: -1, style: 'staff', name: 'Kitchen' });
  // the stage: a platform with steps either side, the proscenium, the curtains
  const sy = 2.5;
  k.box(-72, -60, y, y + sy, 31, 57, M.planks, { faces: ['py', 'px', 'nz', 'pz'] });
  k.box(-60.3, -59.9, y + 0.2, y + sy - 0.1, 31, 57, M.velvetRed, { faces: ['px'] });
  k.solid(-72, -60, y, y + sy, 31, 57, { name: 'Stage', surface: 'wood' });
  P3.stairs('x', -56.8, -60, 31.6, 34.6, y, y + sy, { mat: M.woodDark, n: 3, solidBelow: true, floorY: y, surface: 'wood' });
  P3.stairs('x', -56.8, -60, 53.4, 56.4, y, y + sy, { mat: M.woodDark, n: 3, solidBelow: true, floorY: y, surface: 'wood' });
  const prosc = k.at(-60, y, 44, PI / 2);
  for (const s of [-1, 1]) prosc.box(s * 13.4, 8.5, 0, 1.6, 17, 1.4, M.gold);
  prosc.box(0, 17.6, 0, 28.4, 2.4, 1.4, M.gold);
  prosc.box(0, 15.8, 0.2, 25.4, 1.4, 0.3, M.velvetRed);
  P.curtains(-71.3, y + sy, y + 16, 44, PI / 2, 25, { mat: M.velvetRed, open: false, dz: 0 });
  for (const s of [-1, 1]) k.at(-60.6, 0, 44 + s * 11.6, PI / 2).geo(pleatGeo(), 0, y + sy + 6.5, 0, M.velvetRed, { cast: true });
  for (let i = 0; i < 7; i++) { const z = 34 + i * 3.6; k.at(-60.6, y + sy, z, PI / 2).box(0, 0.25, 0, 0.7, 0.5, 0.5, M.brass); }
  O.piano = P2.grandPiano(-64.5, y + sy, 47.6, 0);
  pickup('fuse3', { pos: O.piano.keys.clone().add(V(0.6, 0.15, 0.1)), kind: 'fuse', give: 'fuse', ry: 0.1 });
  O.ballWard = P.wardrobe(-69.6, y + sy, 34.5, PI / 2, { room: 'stage', wood: M.woodMid });
  P3.mannequin(-70.2, y + sy, 51, PI / 2 + 0.6, { mat: M.wax });
  P3.trunk(-69.6, y + sy, 55.2, PI / 2, { tint: '#6a5a4a' });
  // tables laid for the ball, some knocked over; a chandelier that fell
  const tables = [[-52, 36], [-42, 36], [-32, 36], [-52, 52], [-42, 52], [-32, 52], [-28, 44]];
  for (const [x, z] of tables) {
    P.roundTable(x, y, z, { r: 2.4, cloth: true });
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.5 + x; if ((i + x) % 3 === 0) P.chair(x + Math.cos(a) * 3.6, y, z + Math.sin(a) * 3.6, a, { fallen: true }); else P.chair(x + Math.cos(a) * 3.4, y, z + Math.sin(a) * 3.4, Math.atan2(-Math.cos(a), -Math.sin(a)), { seat: M.velvetRed }); }
  }
  for (const [x, z] of [[-52, 36], [-32, 52], [-42, 52]]) P.candles(x, y + 2.9, z, { n: 3, power: 4 });
  note('programme', { pos: V(-41.4, y + 2.92, 35.4), ry: 0.5, ...NOTES.programme });
  P.chandelier(-47, y + hh, 44, { scale: 1.5, drop: 4, tiers: 2, room: 'ball' });
  P.chandelier(-33, y + hh, 36, { scale: 1.1, drop: 3, tiers: 2, room: 'ball', flicker: 0.2 });
  fallenChandelier(-40, 44);
  for (const z of [34, 44, 54]) P.sconce(-22.6, y + 7, z, -PI / 2, { room: 'ball', flicker: 0.1 });
  for (const x of [-59, -44, -36, -28]) P.sconce(x, y + 7, 28.6, 0, { room: 'ball', flicker: 0.1 });
  // nav
  const pts = [['b:a', -50, 31.5], ['b:b', -37, 31.5], ['b:c', -26, 36], ['b:d', -47, 44, true], ['b:e', -34, 44], ['b:f', -26, 50], ['b:g', -47, 57], ['b:h', -37, 57], ['b:i', -55, 44], ['b:j', -55, 33], ['b:k', -55, 56]];
  for (const [id, x, z, poi] of pts) N(id, x, z, { poi: !!poi });
  nav.node('b:s1', -63, y + sy, 41, { floor: F, room: 'ball' }); nav.node('b:s2', -63, y + sy, 52, { floor: F, room: 'ball', poi: true }); nav.node('b:s3', -66.6, y + sy, 34.5, { floor: F, room: 'ball' });
  nav.node('b:st1', -58.5, y + 1.25, 33.1, { floor: F }).noAuto = true; nav.node('b:st2', -58.5, y + 1.25, 54.9, { floor: F }).noAuto = true;
  nav.link('b:j', 'b:st1'); nav.link('b:st1', 'b:s1'); nav.link('b:k', 'b:st2'); nav.link('b:st2', 'b:s2');
  nav.link('b:a', 'kit:s', { door: O.dBallKitchen });
  O.ballWard.node = nav.get('b:s3');
}

const pleatCache = {};
function pleatGeo() {
  if (pleatCache.g) return pleatCache.g;
  const g = new THREE.PlaneGeometry(3.4, 13, 24, 1), Pp = g.attributes.position;
  for (let i = 0; i < Pp.count; i++) Pp.setZ(i, Math.sin(Pp.getX(i) * 5.5) * 0.18);
  g.computeVertexNormals();
  return (pleatCache.g = g);
}
function fallenChandelier(x, z) {
  const M = H.M, b = H.kit.at(x, FL.F1, z, 0.6);
  b.torus(0, 0.4, 0, 3.0, 0.08, M.brass, { rx: PI / 2 + 0.25, seg: 24 });
  b.torus(0.4, 0.9, 0.2, 1.8, 0.07, M.brass, { rx: PI / 2 - 0.4, rz: 0.3, seg: 20 });
  b.lathe([[0, -1.5], [0.4, -1.2], [0.6, -0.4], [0.3, 0], [0, 0.4]], 0.2, 0.9, 0, M.brass, { rz: 1.3, seg: 10 });
  b.cyl(-2.6, 0.12, 3.6, 0.06, 0.06, 7, M.brass, { rx: PI / 2, rz: 0.4, seg: 4 });
  for (let i = 0; i < 40; i++) { const a = Math.random() * 7, d = Math.random() * 5; b.geo(new THREE.OctahedronGeometry(0.08 + Math.random() * 0.08), Math.cos(a) * d, 0.06, Math.sin(a) * d, M.glass, { s: [1, 1.8, 1], cast: false }); }
  H.kit.solid(x - 2.8, x + 2.8, FL.F1, FL.F1 + 1.2, z - 2.8, z + 2.8, { name: 'Prop' });
}
