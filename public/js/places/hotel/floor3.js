// The third floor: the long corridor (green damask over dark panelling, a
// red runner, brass sconces), Room 313 where you wake up, the ransacked 303,
// 304, the burned-out 306, 308 with its bathroom, the children's room 309,
// the Linen Room with the key box, the ice machine, the lift lobby with its
// two brass lifts, and the gallery that looks down into the atrium.
import * as THREE from 'three';
import { H } from './state.js';
import { FL, W, face, slab, rug, styles } from './shell.js';
import { Door, Elevator, doorFrame } from './doors.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import * as P3 from './props3.js';
import { pickup, note } from './items.js';
import { NOTES } from './lore.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { bake, boxGeo, M4 } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

export function buildF3() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F3, h = 12, nav = H.nav, O = H.obj;
  const F = 'F3';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, ...o });

  // --- the corridor -----------------------------------------------------------------------------------------------------------
  k.floor(-72, 72, -4, 4, y, M.planks);
  rug(-71.5, 71.5, -2.6, 2.6, y, M.runner, { rep: [143 / 8, 1] });
  k.ceiling(-72, 72, -4, 4, y + h, M.ceiling);
  const lintel = (a, b) => ({ a, b, y0: y, y1: y + 9.6 });
  // north side (z = -4): 301 303 305 | ice | lifts | linen 307 309 311
  W('x', -4, -72, -56, y, h, null, S.corridor, { doors: [-64] });
  W('x', -4, -56, -40, y, h, S.rose, S.corridor, { doors: [-48] });
  W('x', -4, -40, -24, y, h, null, S.corridor, { doors: [-32] });
  W('x', -4, -24, -12, y, h, S.tile, S.corridor, { holes: [lintel(-23.5, -12.5)] });
  W('x', -4, -12, 12, y, h, S.panel, S.corridor, { holes: [lintel(-11.5, 11.5)] });
  W('x', -4, 12, 24, y, h, S.plaster, S.corridor, { doors: [18] });
  W('x', -4, 24, 40, y, h, null, S.corridor, { doors: [32] });
  W('x', -4, 40, 56, y, h, S.child, S.corridor, { doors: [48] });
  W('x', -4, 56, 72, y, h, null, S.corridor, { doors: [64] });
  // south side (z = 4): 302 304 306 | gallery | 308 310 312
  W('x', 4, -72, -56, y, h, S.corridor, null, { doors: [-64] });
  W('x', 4, -56, -40, y, h, S.corridor, S.blue, { doors: [-48] });
  W('x', 4, -40, -18, y, h, S.corridor, S.burnt, { doors: [-29] });
  W('x', 4, -18, 18, y, h, S.corridor, S.corridor, { holes: [lintel(-17.5, 17.5)], noTrim: true });
  W('x', 4, 18, 40, y, h, S.corridor, S.burg, { doors: [24] });
  W('x', 4, 40, 56, y, h, S.corridor, null, { doors: [48] });
  W('x', 4, 56, 72, y, h, S.corridor, null, { doors: [64] });

  // the doors along it
  const guest = (n, x, side, o = {}) => new Door({ x, y, z: side * 4, axis: 'x', hinge: o.hinge ?? -1, swing: side, plate: -side, style: 'guest', number: n, locked: o.locked ?? true, lockedMsg: o.lockedMsg || `Room ${n}. It's locked.`, ...o });
  O.d301 = guest(301, -64, -1);
  O.d303 = guest(303, -48, -1, { locked: false });
  O.d305 = guest(305, -32, -1, { lockedMsg: 'Room 305. Locked. Someone inside is humming.' });
  O.dLinen = new Door({ x: 18, y, z: -4, axis: 'x', hinge: 1, swing: -1, plate: 1, style: 'staff', plateText: 'LINEN', plateStyle: 'enamel', name: 'Linen Room' });
  O.d307 = guest(307, 32, -1);
  O.d309 = guest(309, 48, -1, { locked: false });
  O.d311 = guest(311, 64, -1, { lockedMsg: 'Room 311. Locked. Something behind it is breathing, slow and wet.' });
  O.d302 = guest(302, -64, 1, { hanger: 'PLEASE DO NOT DISTURB', lockedMsg: 'Room 302. Locked. A card on the handle: PLEASE DO NOT DISTURB.' });
  O.d304 = guest(304, -48, 1, { locked: false, hinge: 1 });
  O.d308 = guest(308, 24, 1, { locked: false });
  O.d310 = guest(310, 48, 1);
  O.d312 = guest(312, 64, 1);
  // 306's door burned off its hinges: just the frame, the door lying inside
  doorFrame('x', -29, 4, y, 4, 8.4, 1, M.charred);
  k.at(-28.4, y + 0.2, 8.6, 0.25).box(0, 0, 0, 3.9, 0.3, 8.3, M.charred, { rx: 0.03, ry: 0 });

  // corridor lighting: sconces, bowls, emergency lamps, the exit sign
  const sc = (x, side, o) => P.sconce(x, y + 5.6, side * 3.5, side < 0 ? 0 : PI, { room: 'c3', ...o });
  for (const x of [-56, -40, 26, 40, 56]) sc(x, -1, { flicker: x === 40 ? 0.35 : 0.08, broken: x === 26 });
  for (const x of [-56, -40, 32, 56]) sc(x, 1, { flicker: x === -40 ? 0.4 : 0.08 });
  for (const x of [-60, -36, 36, 60]) P.bowlLight(x, y + h, 0, { flicker: x === -36 ? 0.3 : 0.06, broken: x === 60, room: 'c3' });
  P.emergencyLight(-71.4, y + 10.6, 2.6, PI / 2);
  P.emergencyLight(71.4, y + 10.6, -2.6, -PI / 2);
  P.emergencyLight(0, y + 10.4, 3.4, PI);
  P.exitSign(-71.4, y + 9.6, 0, PI / 2);
  // paintings, side tables, a room service tray, the housekeeping cart, writing on the wall
  P.painting(-60, y + 6, -3.5, 0, 2.4, 3, T.painting('sea', 3));
  P.painting(-56, y + 6, 3.5, PI, 2.4, 3, T.painting('lady', 4));
  P.painting(-40, y + 7.6, -3.5, 0, 2, 1.5, T.painting('forest', 5), { frame: 0.25 });
  P.painting(56, y + 6.2, 3.5, PI, 2.4, 3, T.painting('family', 6));
  P.painting(40, y + 7.6, -3.5, 0, 2.2, 1.6, T.painting('hotel', 7), { frame: 0.25 });
  for (const [x, side] of [[-37, -1], [56, -1], [-59.5, 1], [36, 1]]) consoleTable(x, side);
  serviceTray(-29.5, y, -2.4);
  P2.housekeepingCart(37, y, -2.5, PI);
  P.decal(-71.45, y + 6, -0.2, PI / 2, 6, 1.6, T.writing('THE STAIRS ARE SAFE', { w: 512, h: 128 }));
  P.decal(-66, y + 3.2, -3.45, 0, 1.2, 1.2, T.handprint());
  P.decal(-67.5, y + 4.4, -3.45, 0, 1.2, 1.2, T.handprint());
  P.decal(-69.2, y + 2.6, -3.45, 0, 1.2, 1.2, T.handprint());

  // --- nav: the corridor spine, with a point in front of every door -----------------------------------------------------------------
  const xs = [-70, -64, -56, -48, -40, -32, -29, -24, -18, -12, -6, 0, 6, 12, 18, 24, 32, 40, 48, 56, 64, 70];
  for (const x of xs) N(`c3:${x}`, x, 0, { poi: x % 24 === 0 || x === -70 || x === 70 });

  // --- Room 313 (yours) --------------------------------------------------------------------------------------------------------------
  room313();
  // --- 303: someone tore it apart looking for something ------------------------------------------------------------------------------
  {
    slab(-56, -40, -28, -4, y, h, M.carpetRed, M.ceiling);
    W('z', -56, -28, -4, y, h, null, S.rose);
    W('z', -40, -28, -4, y, h, S.rose, null);
    W('x', -28, -56, -40, y, h, null, S.rose, { holes: [{ a: -51, b: -45, y0: y + 3, y1: y + 9 }] });
    P.windowAt('x', -28, -48, y + 3, 6, 6, 1);
    P.bed(-50.6, y, -14, PI / 2 - 0.25, { messy: true });
    P.nightstand(-54.6, y, -19.5, PI / 2);
    O.ward303 = P.wardrobe(-41.95, y, -20, -PI / 2, { room: '303' });
    P.chair(-45, y, -10, 1.2, { fallen: true });
    P.dresser(-44, y, -26.2, 0.15, {});
    P2.suitcase(-48, y, -8.5, 0.4, 0, 0, 0, 1, M.leather, 0);
    for (let i = 0; i < 9; i++) paperOnFloor(-50 + Math.random() * 8, -22 + Math.random() * 14, i);
    P.decal(-55.45, y + 6.5, -10, PI / 2, 5, 1.4, T.writing('HE COUNTS THE GUESTS', { w: 512, h: 128 }));
    P.painting(-46, y + 0.3, -27.1, -0.4, 2.2, 2.8, T.painting('lady', 8));
    P.bowlLight(-48, y + h, -16, { broken: true, room: '303' });
    note('housekeeper', { pos: V(-47.2, y + 0.07, -12.5), ry: 0.6, ...NOTES.housekeeper });
    N('r303:a', -48, -7.5, { room: '303' }); N('r303:b', -47, -15, { room: '303', poi: true }); N('r303:w', -44.6, -20, { room: '303' });
    nav.link('c3:-48', 'r303:a', { door: O.d303 });
    O.ward303.node = nav.get('r303:w');
  }
  // --- 304: a guest's things, still unpacked ------------------------------------------------------------------------------------------
  {
    slab(-56, -40, 4, 28, y, h, M.carpetGreen, M.ceiling);
    W('z', -56, 4, 28, y, h, null, S.blue);
    W('z', -40, 4, 28, y, h, S.blue, S.burnt);
    W('x', 28, -56, -40, y, h, S.blue, S.ext, { holes: [{ a: -51, b: -45, y0: y + 3, y1: y + 9 }] });
    P.windowAt('x', 28, -48, y + 3, 6, 6, -1);
    P.bed(-51.3, y, 16, PI / 2, {});
    P.nightstand(-54.6, y, 10.5, PI / 2); P.nightstand(-54.6, y, 21.5, PI / 2);
    P.tableLamp(-54.6, y + 2.42, 21.5, { room: '304' });
    O.ward304 = P.wardrobe(-41.95, y, 9.5, -PI / 2, { room: '304' });
    P.dresser(-44.5, y, 26.2, PI);
    O.radio304 = P3.radio(-44.5, y + 3.4, 26.0, PI);
    P3.trunk(-49, y, 25.6, PI);
    P2.suitcase(-51, y + 2.1, 15.5, PI / 2 + 0.2, 0, 0, 0, 0.9, M.velvetGreen, 0);
    P.armchair(-43.5, y, 18, -PI / 2 - 0.4, {});
    pickup('battery304', { pos: V(-54.6, y + 2.52, 10.2), kind: 'battery', give: 'battery' });
    P.bowlLight(-48, y + h, 16, { room: '304', flicker: 0.2 });
    N('r304:a', -48, 7.5, { room: '304' }); N('r304:b', -46.5, 16, { room: '304', poi: true }); N('r304:w', -44.6, 9.5, { room: '304' });
    nav.link('c3:-48', 'r304:a', { door: O.d304 });
    O.ward304.node = nav.get('r304:w');
  }
  // --- 306: where the fire burned through ---------------------------------------------------------------------------------------------
  {
    slab(-40, -18, 4, 28, y, h, M.charred, null);
    k.ceiling(-40, -18, 4, 28, y + h, M.ceilingDark, { tint: '#3a3430' });
    W('x', 28, -40, -18, y, h, S.burnt, S.ext, { holes: [{ a: -32, b: -26, y0: y + 3, y1: y + 9 }] });
    P3.boards(-29, y + 3, 27.5, PI, 6, 6, { solid: false, n: 4, tint: '#4a3a30' });
    // the wall onto the atrium has burned through
    W('z', -18, 4, 10, y, h, S.burnt, S.corridor);
    W('z', -18, 10, 28, y, h, S.burnt, S.cream, { holes: [{ a: 14, b: 22, y0: y + 3.4, y1: y + 9.5 }] });
    P3.beam([-38, y + h - 0.5, 6], [-24, y + 0.4, 20], 0.9);
    P3.beam([-20, y + h - 0.3, 24], [-31, y + 1.2, 25], 0.7);
    P.bed(-35.3, y, 16, PI / 2, { wood: M.charred, spread: M.charred, solid: true });
    P.armchair(-24, y, 9, PI + 0.6, { fabric: M.charred });
    P3.debris(-29, y, 16, 8, 30);
    P3.debris(-22, y, 18, 3, 10);
    P.painting(-39.4, y + 6.5, 9, PI / 2, 2.6, 3.2, T.painting('family', 9));
    N('r306:a', -29, 7.5, { room: '306' }); N('r306:b', -27, 14, { room: '306', poi: true });
  }
  // --- the gallery over the atrium ---------------------------------------------------------------------------------------------------------------
  {
    k.floor(-18, 18, 4, 10, y, M.planks);
    rug(-14, 14, 4.6, 9.2, y, M.carpetRed);
    k.ceiling(-18, 18, 4, 10, y + h, M.ceiling);
    P3.balustrade('x', 10, -18, 18, y, { mat: M.woodDark, knob: M.brass });
    for (const x of [-10, 10]) P.armchair(x, y, 7.6, PI, { fabric: M.velvetGreen });
    P.roundTable(0, y, 7.4, { r: 1.2 });
    P.candles(0, y + 2.9, 7.4, { n: 3 });
    P3.wheelchair(14.5, y, 6.6, -2.4);
    N('g3:w', -12, 7, { floor: F }); N('g3:m', 0, 6.2, { floor: F, poi: true }); N('g3:e', 12, 7, { floor: F });
  }
  // --- 308: and its bathroom ----------------------------------------------------------------------------------------------------------------
  room308();
  // --- 309: the children's room ---------------------------------------------------------------------------------------------------------------
  room309();
  // --- the Linen Room -----------------------------------------------------------------------------------------------------------------------------
  {
    slab(12, 24, -28, -4, y, h, M.planks, M.ceilingDark);
    W('z', 12, -28, -14, y, h, null, S.plaster);
    W('z', 12, -14, -4, y, h, S.panel, S.plaster);
    W('z', 24, -28, -4, y, h, S.plaster, null);
    W('x', -28, 12, 24, y, h, null, S.plaster);
    P2.shelves(22.35, y, -18, -PI / 2, { w: 7, h: 9, d: 2.2, n: 5, fill: 'linen', mat: M.woodLight });
    P2.shelves(22.35, y, -10, -PI / 2, { w: 6, h: 9, d: 2.2, n: 5, fill: 'mixed', mat: M.woodLight });
    O.linenCupboard = P.wardrobe(13.95, y, -10, PI / 2, { room: 'linen', wood: M.woodLight });
    O.keyBox = P2.keyBox(17, y + 5.6, -27.5, 0);
    P2.housekeepingCart(18, y, -19.5, 0.3);
    P3.laundryBasket(14, y, -25.5);
    P3.laundryBasket(16.6, y, -25.8, { full: false });
    // an ironing board, folded against the wall
    k.at(21, y, -26.9, 0).box(0, 4, 0, 1.4, 8, 0.15, M.cloth, { rx: 0.08 });
    O.linenBulb = P3.hangingBulb(18, y + h, -15, { room: 'linen', flicker: 0.25 });
    N('lin:a', 18, -7.5, { room: 'linen' }); N('lin:b', 18, -15, { room: 'linen', poi: true }); N('lin:w', 16.6, -10, { room: 'linen' }); N('lin:k', 17, -23.5, { room: 'linen' });
    nav.link('c3:18', 'lin:a', { door: O.dLinen });
    O.linenCupboard.node = nav.get('lin:w');
  }
  // --- the ice machine's nook -------------------------------------------------------------------------------------------------------------------
  {
    slab(-24, -12, -12, -4, y, h - 1, M.hexFloor, M.ceiling);
    W('z', -24, -12, -4, y, h, null, S.tile);
    W('x', -12, -24, -12, y, h, null, S.tile);
    W('z', -12, -12, -4, y, h, S.tile, S.panel);
    O.iceMachine = P2.iceMachine(-18, y, -10.1, 0);
    k.at(-14.5, y, -10.5, 0).cyl(0, 0.6, 0, 0.6, 0.5, 1.2, M.steel, { seg: 10 });
    P.tubeLight(-18, y + h - 1, -8, 0, { flicker: 0.3, room: 'ice' });
    N('ice', -18, -7, { poi: true });
  }
  // --- the lift lobby -------------------------------------------------------------------------------------------------------------------------------
  {
    slab(-12, 12, -14, -4, y, h, M.marbleFloor, M.ceiling);
    W('x', -14, -12, 12, y, h, null, S.panel, { holes: [{ a: -7.5, b: -2.5, y0: y, y1: y + 8.4 }, { a: 2.5, b: 7.5, y0: y, y1: y + 8.4 }] });
    W('z', -12, -14, -12, y, h, null, S.panel);
    H.elev[3] = [new Elevator({ x: -5, y, z: -13.5, floor: 3, shown: 1 }), new Elevator({ x: 5, y, z: -13.5, floor: 3, shown: 3 })];
    P2.mirror(0, y + 5, -13.45, 0, 2.2, 4, { frame: M.gold });
    P.bowlLight(0, y + h, -9, { drop: 1.2, room: 'lifts', flicker: 0.1 });
    P3.bench(-8.5, y, -5.6, PI, 4);
    P2.pottedPalm(10, y, -12, 1, { dead: true });
    P2.pottedPalm(-10.5, y, -12.2, 1, { dead: true });
    k.at(9.8, y, -6, 0).lathe([[0.5, 0], [0.5, 0.1], [0.1, 0.3], [0.08, 3.0], [0.45, 3.2], [0.45, 3.4], [0, 3.4]], 0, 0, 0, M.brass, { seg: 10 });
    N('lift3', 0, -8, { poi: true });
    N('e3w:o', -5, -10.5, { tag: 'liftfront' }); N('e3e:o', 5, -10.5, { tag: 'liftfront' });
    const cw = nav.node('e3w:i', -5, y, -18.5, { floor: F, tag: 'car' }), ce = nav.node('e3e:i', 5, y, -18.5, { floor: F, tag: 'car' });
    cw.noAuto = ce.noAuto = true;
    nav.link('e3w:o', cw, { elevator: H.elev[3][0] }); nav.link('e3e:o', ce, { elevator: H.elev[3][1] });
  }
}

// --- Room 313 -------------------------------------------------------------------------------------------------------------------------
function room313() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F3, h = 12, nav = H.nav, O = H.obj, F = 'F3';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, room: '313', ...o });
  slab(80, 92, -12, -4, y, h, M.carpetRed, M.ceiling);
  slab(72, 92, -4, 12, y, h, M.carpetRed, M.ceiling);
  slab(72, 80, -12, -4, y, h, M.hexFloor, M.ceiling, { surface: 'tile' });
  // walls: the corridor end (with your door), the bathroom, the outside walls
  W('z', 72, -12, -4, y, h, null, S.tile);
  W('z', 72, -4, 4, y, h, S.corridor, S.rose, { doors: [0] });
  W('z', 72, 4, 12, y, h, null, S.rose);
  W('x', -12, 72, 80, y, h, null, S.tile);
  W('x', -12, 80, 92, y, h, null, S.rose);
  W('z', 80, -12, -4, y, h, S.tile, S.rose);
  W('x', -4, 72, 80, y, h, S.tile, S.rose, { doors: [{ at: 76, w: 3.4, h: 8 }] });
  W('z', 92, -12, 12, y, h, S.rose, S.ext);
  W('x', 12, 72, 92, y, h, S.rose, S.ext, { holes: [{ a: 83, b: 89, y0: y + 3, y1: y + 9.5 }] });
  O.d313 = new Door({ x: 72, y, z: 0, axis: 'z', hinge: -1, swing: 1, plate: 1, style: 'guest', number: 313, name: 'Room 313' });
  O.dBath313 = new Door({ x: 76, y, z: -4, axis: 'x', w: 3.4, h: 8, hinge: 1, swing: 1, style: 'plain', name: 'Bathroom' });
  O.window313 = P.windowAt('x', 12, 86, y + 3, 6, 6.5, -1);
  // the bed against the north wall, a nightstand each side (the phone and the flashlight on the left one)
  P.bed(86, y, -7.5, 0, { messy: true });
  P.nightstand(81.6, y, -10.7, 0); P.nightstand(90.4, y, -10.7, 0);
  O.phone = P.rotaryPhone(81.2, y + 2.42, -10.9, 0.3);
  P.tableLamp(90.4, y + 2.42, -10.9, { room: '313' });
  O.candle313 = P.candles(82.2, y + 2.42, -10.4, { n: 1, power: 5 });
  P.deskClock(90.0, y + 2.42, -10.2, -0.4);
  O.flashlightItem = pickup('flashlight', { pos: V(81.4, y + 2.55, -10.0), ry: 0.9, kind: 'flash', r: 5.5 });
  P.painting(86, y + 7.4, -11.5, 0, 3.6, 2.6, T.painting('hotel', 10));
  // the TV facing the bed, the desk with candles and the welcome card, an armchair by the window, the wardrobe
  O.tv = P.television(77, y, 10.4, PI);
  P.desk(73.8, y, 6.5, PI / 2, { w: 4.6, d: 2.6 });
  P.chair(76.2, y, 6.5, -PI / 2, {});
  P.candles(73.6, y + 2.82, 5.0, { n: 3 });
  P.bankerLamp(73.6, y + 2.82, 8.2, PI / 2, { room: '313' });
  note('welcome', { pos: V(74.2, y + 2.9, 6.6), ry: 1.4, ...NOTES.welcome });
  P.armchair(90, y, 9.2, -PI * 0.78, { fabric: M.velvetGreen });
  O.ward313 = P.wardrobe(90.05, y, 1, -PI / 2, { room: '313' });
  P.rugAt(84, y, 1.5, 0, 9, 7, T.rug('313', '#3a1a12', '#1a0a06', '#9a7a3a', 31));
  P.radiator(86, y, 11.1, PI, { n: 8 });
  P.bowlLight(84, y + h, 2, { room: '313', flicker: 0.12 });
  // the bathroom: tub, basin and mirror, the toilet, towels
  P2.bathtub(74.1, y, -8.3, 0, { water: true });
  P2.sink(78.6, y, -10.5, -PI / 2);
  P2.mirror(79.45, y + 5.6, -10.5, -PI / 2, 1.8, 2.6, { frame: M.brass, cracked: true });
  P2.toilet(76.6, y, -11.2, 0);
  P2.towelRail(79.45, y, -6.5, -PI / 2);
  P.sconce(79.45, y + 8, -10.5, -PI / 2, { room: '313b', power: 8, flicker: 0.2 });
  // nav
  N('r313:door', 75, 0); N('r313:mid', 82, 1, { poi: true }); N('r313:bed', 86.5, -2, { poi: true }); N('r313:win', 85, 8.5); N('r313:w', 87.2, 1);
  N('r313:bath', 76, -2.2); N('r313:tub', 77.5, -7.6);
  nav.link('c3:70', 'r313:door', { door: O.d313 });
  nav.link('r313:bath', 'r313:tub', { door: O.dBath313 });
  O.ward313.node = nav.get('r313:w');
  // where you wake up
  H.start = { bed: V(86, y + 2.6, -10.2), stand: V(84.5, y, -2.5), yaw: 0 };
}

// --- 308: the room with the bathroom -----------------------------------------------------------------------------------------------------------
function room308() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F3, h = 12, nav = H.nav, O = H.obj, F = 'F3';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, room: '308', ...o });
  slab(18, 40, 4, 18, y, h, M.carpetRed, M.ceiling);
  slab(18, 40, 18, 28, y, h, M.tileFloor, M.ceiling, { surface: 'tile' });
  W('z', 18, 4, 10, y, h, S.corridor, S.burg);
  W('z', 18, 10, 18, y, h, S.cream, S.burg);
  W('z', 18, 18, 28, y, h, S.cream, S.tile);
  W('z', 40, 4, 18, y, h, S.burg, null);
  W('z', 40, 18, 28, y, h, S.tile, null);
  W('x', 18, 18, 40, y, h, S.burg, S.tile, { doors: [{ at: 30, w: 3.4, h: 8 }] });
  W('x', 28, 18, 40, y, h, S.tile, S.ext, { holes: [{ a: 26, b: 32, y0: y + 3, y1: y + 9 }] });
  O.dBath308 = new Door({ x: 30, y, z: 18, axis: 'x', w: 3.4, h: 8, hinge: -1, swing: 1, style: 'plain', name: 'Bathroom' });
  P.bed(35.3, y, 11, -PI / 2, {});
  P.nightstand(38.6, y, 5.6, -PI / 2);
  P.tableLamp(38.6, y + 2.42, 5.6, { room: '308', flicker: 0.3 });
  P.dresser(20.2, y, 12, PI / 2, {});
  P.armchair(22.5, y, 6.5, PI * 0.8, { fabric: M.velvetRed });
  P.bowlLight(29, y + h, 11, { room: '308', broken: true });
  // the bathroom (the scare: something behind the shower curtain)
  P.windowAt('x', 28, 29, y + 3, 6, 6, -1, { curtains: false });
  P2.bathtub(29, y, 24.85, PI / 2, { water: true });
  O.bath = { center: V(29, y, 24.85) };
  // the curtain: closed, with a shape behind it - and the same curtain drawn back, for afterwards
  const mkCurtain = (open) => {
    const g = new THREE.CylinderGeometry(1, 1, 7.2, 32, 1, true, -PI * 0.95, open ? PI * 0.55 : PI * 1.9);
    const Pp = g.attributes.position;
    for (let i = 0; i < Pp.count; i++) { const a = Math.atan2(Pp.getZ(i), Pp.getX(i)); const kk = 1 + Math.sin(a * 16) * 0.035; Pp.setX(i, Pp.getX(i) * kk); Pp.setZ(i, Pp.getZ(i) * kk); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.sheet); m.castShadow = true; m.receiveShadow = true;
    m.position.set(29, y + 5.0, 24.85); m.scale.set(3.3, 1, 1.72); m.rotation.y = PI / 2;
    H.world.scene.add(m);
    return m;
  };
  k.at(29, y, 24.85, PI / 2).torus(0, 8.6, 0, 1, 0.05, M.brass, { rx: PI / 2, s: [1.7, 3.3, 1], seg: 28 });
  O.curtainClosed = mkCurtain(false);
  O.curtainOpen = mkCurtain(true); O.curtainOpen.visible = false;
  const fig = new THREE.Mesh(bake([[new THREE.CylinderGeometry(0.5, 0.9, 6.5, 10), M4(0, 3.25, 0)], [new THREE.SphereGeometry(0.62, 10, 8), M4(0, 7.1, 0, 0, 0, 0.3)], [new THREE.CylinderGeometry(0.16, 0.12, 4.2, 6), M4(0.95, 4.4, 0, 0, 0, 0.12)], [new THREE.CylinderGeometry(0.16, 0.12, 4.2, 6), M4(-0.95, 4.4, 0, 0, 0, -0.12)]]), new THREE.MeshBasicMaterial({ color: 0x050404 }));
  fig.position.set(29.4, y + 1.2, 25.2); H.world.scene.add(fig);
  O.tubFigure = fig;
  P2.sink(38.6, y, 21, -PI / 2);
  O.mirror308 = P2.mirror(39.45, y + 5.6, 21, -PI / 2, 2, 2.8, { frame: M.gold });
  const writ = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), flat(T.writing('HE KNOWS\nYOUR ROOM', { w: 512, h: 320 }), { transparent: true, decal: true }));
  writ.position.set(39.3, y + 5.6, 21); writ.rotation.y = -PI / 2; writ.visible = false; H.world.scene.add(writ);
  O.mirrorWriting = writ;
  P2.toilet(19.2, y, 22, PI / 2);
  P2.towelRail(35, y, 18.55, 0);
  O.bathBulb = P3.hangingBulb(30, y + h, 23, { circuit: 'event', drop: 2, power: 10, room: '308b' });
  O.bathBulb.on = true;
  N('r308:a', 24, 7.5); N('r308:b', 28, 11, { poi: true }); N('r308:c', 30, 15.5); N('r308:d', 30, 20.8);
  nav.link('c3:24', 'r308:a', { door: O.d308 });
  nav.link('r308:c', 'r308:d', { door: O.dBath308 });
}

// --- 309: the children's room ----------------------------------------------------------------------------------------------------------------------------
function room309() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F3, h = 12, nav = H.nav, O = H.obj, F = 'F3';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, room: '309', ...o });
  slab(40, 56, -28, -4, y, h, M.planks, M.ceiling);
  W('z', 40, -28, -4, y, h, null, S.child);
  W('z', 56, -28, -4, y, h, S.child, null);
  W('x', -28, 40, 56, y, h, null, S.child, { holes: [{ a: 45, b: 51, y0: y + 3, y1: y + 9 }] });
  P.windowAt('x', -28, 48, y + 3, 6, 6, 1, { curtainMat: M.velvetGreen });
  P.bed(43.6, y, -23.5, PI / 2, { w: 4, l: 6, spread: M.bedspread });
  P.bed(43.6, y, -14.5, PI / 2, { w: 4, l: 6, spread: M.linen });
  P3.doll(43.2, y + 2.2, -14.5, PI / 2 + 0.3);
  O.ward309 = P.wardrobe(54.05, y, -20, -PI / 2, { room: '309', wood: M.woodLight });
  O.horse = P3.rockingHorse(51, y, -9.5, -0.5);
  P3.toyBlocks(48, y, -13);
  P.roundTable(47.5, y, -26, { r: 1.1 });
  O.musicBox = P3.musicBox(46.8, y + 2.9, -26.3, 0.3);
  P.rugAt(48, y, -17, 0.1, 7, 8, T.rug('kids', '#4a3a5a', '#2a1a2a', '#c8a050', 41));
  // the drawings, taped up
  P.decal(55.45, y + 5.4, -14, -PI / 2, 2.2, 2.2, T.crayonDrawing('tallman', 1));
  P.decal(55.45, y + 5.0, -10.5, -PI / 2, 2.2, 2.2, T.crayonDrawing('lights', 2));
  P.decal(40.55, y + 5.4, -8.5, PI / 2, 2.2, 2.2, T.crayonDrawing('hide', 3));
  O.nightlight = P.tableLamp(48.3, y + 2.9, -25.6, { color: 0xff8aa0, power: 4, range: 8, circuit: 'battery', flicker: 0.1, shade: 0xffb0c8, room: '309' });
  note('diary', { pos: V(43.4, y + 2.12, -23.0), ry: 0.4, ...NOTES.diary });
  N('r309:a', 48, -7.5); N('r309:b', 48.5, -17, { poi: true }); N('r309:w', 51.4, -20);
  nav.link('c3:48', 'r309:a', { door: O.d309 });
  O.ward309.node = nav.get('r309:w');
}

// --- little things -------------------------------------------------------------------------------------------------------------------------------------
function consoleTable(x, side) {
  const M = H.M, y = FL.F3, b = H.kit.at(x, y, side * 3.0, side < 0 ? 0 : PI);
  b.box(0, 2.7, 0, 3, 0.15, 1.0, M.woodDark);
  for (const sx of [-1, 1]) b.cyl(sx * 1.3, 1.35, 0, 0.08, 0.06, 2.7, M.woodDark, { seg: 6 });
  b.lathe([[0.2, 0], [0.35, 0.3], [0.2, 1.0], [0.12, 1.3], [0.2, 1.5], [0, 1.5]], 0, 2.78, 0, M.porcelain, { seg: 10 });
  for (let i = 0; i < 5; i++) b.cyl(Math.sin(i) * 0.25, 4.6, Math.cos(i) * 0.15, 0.02, 0.02, 1.6, M.woodMid, { rz: Math.sin(i * 2) * 0.4, seg: 3, tint: '#5a4a30' });
  H.kit.solid(x - 1.5, x + 1.5, y, y + 2.8, side * 3.0 - 0.5, side * 3.0 + 0.5);
}
function serviceTray(x, y, z) {
  const M = H.M, b = H.kit.at(x, y, z, 0.3);
  b.box(0, 0.05, 0, 2.2, 0.1, 1.5, M.chrome);
  b.cyl(-0.4, 0.15, 0, 0.55, 0.55, 0.06, M.porcelain, { seg: 14 });
  b.sphere(-0.4, 0.2, 0, 0.5, M.chrome, { part: 0.5, seg: 12 });
  b.cyl(0.6, 0.35, 0.3, 0.15, 0.12, 0.5, M.glass, { seg: 8 });
  b.box(0.5, 0.12, -0.4, 0.8, 0.02, 0.5, M.linen);
}
function paperOnFloor(x, z, i) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15), flat(T.paper(20 + (i % 5), { typed: i % 2 === 0 }), { rough: 0.95, decal: true }));
  m.position.set(x, FL.F3 + 0.08 + i * 0.002, z); m.rotation.set(-PI / 2, 0, Math.random() * 6);
  H.world.scene.add(m);
}
