// The basement: a concrete corridor under the pipes, the storage room full
// of sheeted furniture and mannequins, the workshop (the bolt cutters are
// missing from the pegboard), the laundry with its rows of hanging sheets,
// and the boiler room - where he sits in front of the furnace.
import * as THREE from 'three';
import { H } from './state.js';
import { FL, W, face, slab, styles } from './shell.js';
import { Door, Elevator } from './doors.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import * as P3 from './props3.js';
import { pickup, note } from './items.js';
import { NOTES } from './lore.js';
import * as T from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

export function buildBasement() {
  const k = H.kit, M = H.M, S = styles(), y = FL.B, h = 10, nav = H.nav, O = H.obj, F = 'B';
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, ...o });
  const brick = S.redbrick, conc = S.concrete;

  // --- the corridor ---------------------------------------------------------------------------------------------------------------
  slab(-72, -12, -4, 4, y, h, M.concrete, M.ceilingDark, { surface: 'concrete' });
  W('x', -4, -72, -52, y, h, brick, conc, { doors: [-62] });
  W('x', -4, -52, -32, y, h, conc, conc, { doors: [-42] });
  W('x', -4, -32, -12, y, h, null, conc);
  W('x', 4, -72, -40, y, h, conc, brick, { doors: [-56] });
  W('x', 4, -40, -12, y, h, conc, S.tile, { doors: [-26] });
  P3.pipeRun([[-72, y + h - 1, -2.6], [-12, y + h - 1, -2.6]], 0.45, M.pipe);
  P3.pipeRun([[-72, y + h - 0.6, -1.2], [-30, y + h - 0.6, -1.2], [-30, y + h - 0.6, 3.2], [-12, y + h - 0.6, 3.2]], 0.25, M.rust);
  P3.pipeRun([[-70, y + h - 1.9, 3.3], [-46, y + h - 1.9, 3.3], [-46, y + 3, 3.3]], 0.15, M.pipe, { flanges: false });
  P3.valveWheel(-46, y + 4.5, 3.0, PI, 0.5);
  for (const x of [-66, -50, -34, -18]) P3.cageLight(x, y + 8.2, -3.45, 0, { flicker: x === -34 ? 0.55 : 0.25, room: 'bcor' });
  P.emergencyLight(-71.4, y + 8.6, 2.4, PI / 2);
  P.decal(-50, y + 5.2, 3.45, PI, 6, 1.3, T.writing('HE IS DOWN HERE', { w: 512, h: 112 }));
  for (const x of [-70, -62, -56, -50, -42, -34, -26, -18, -12]) N(`cB:${x}`, x, 0);
  O.dStorage = new Door({ x: -62, y, z: -4, axis: 'x', hinge: -1, swing: -1, plate: 1, style: 'plain', plateText: 'STORAGE', plateStyle: 'enamel', name: 'Storage' });
  O.dWork = new Door({ x: -42, y, z: -4, axis: 'x', hinge: 1, swing: -1, plate: 1, style: 'plain', plateText: 'WORKSHOP', plateStyle: 'enamel', name: 'Workshop' });
  O.dBoiler = new Door({ x: -56, y, z: 4, axis: 'x', hinge: -1, swing: 1, plate: -1, style: 'metal', plateText: 'BOILER ROOM', plateStyle: 'enamel', name: 'Boiler room' });
  O.dLaundry = new Door({ x: -26, y, z: 4, axis: 'x', hinge: 1, swing: 1, plate: -1, style: 'plain', plateText: 'LAUNDRY', plateStyle: 'enamel', name: 'Laundry' });

  // --- the lift vestibule ---------------------------------------------------------------------------------------------------------------
  {
    slab(-12, 0, -14, 4, y, h, M.concrete, M.ceilingDark, { surface: 'concrete' });
    W('x', -14, -12, 0, y, h, null, conc, { holes: [{ a: -7.5, b: -2.5, y0: y, y1: y + 8.4 }] });
    W('z', 0, -14, 4, y, h, conc, null);
    W('x', 4, -12, 0, y, h, conc, null);
    W('z', -12, -14, -4, y, h, null, conc);
    H.elev[0] = [new Elevator({ x: -5, y, z: -13.5, floor: 0, shown: 1 })];
    P.tubeLight(-6, y + h, -4, 0, { flicker: 0.3, room: 'bvest' });
    P3.crate(-1.8, y, 1.8, 0.2, 2.6, { label: 'LINENS' });
    N('eBw:o', -5, -10.5, { tag: 'liftfront' }); N('vB', -6, -2, { poi: true });
    const cw = nav.node('eBw:i', -5, y, -18.5, { floor: F, tag: 'car' }); cw.noAuto = true;
    nav.link('eBw:o', cw, { elevator: H.elev[0][0] });
  }
  // --- storage -------------------------------------------------------------------------------------------------------------------------------
  {
    slab(-72, -52, -28, -4, y, h, M.concrete, M.ceilingDark, { surface: 'concrete' });
    W('z', -72, -28, -6, y, h, null, brick);
    face('z', -72, -6, -4, y, y + h, 1, M.brickRed);
    W('x', -28, -72, -52, y, h, null, brick);
    W('z', -52, -28, -4, y, h, brick, conc);
    for (const [x, z, s] of [[-70, -26, 3], [-70, -22.6, 3], [-66.6, -26, 2.6], [-70, -26, 2.2]]) P3.crate(x, y + (s === 2.2 ? 3 : 0), z, Math.random() * 0.3, s, { label: s === 3 ? 'RAVENHURST' : null });
    P3.sheeted(-63, y, -24.5, 0.2, 'sofa');
    P3.sheeted(-57, y, -25, -0.3, 'tall');
    P3.sheeted(-55, y, -18, 0.8, 'chair');
    P3.sheeted(-69, y, -15, 1.4, 'table');
    O.storageFigure = P3.sheeted(-58.5, y, -11, 2.6, 'figure');
    P3.trunk(-66, y, -8, 0.1);
    O.mannequins = [P3.mannequin(-62, y, -17, 0.3), P3.mannequin(-60, y, -20.5, -0.4), P3.mannequin(-66.5, y, -19, 0.9)];
    for (let i = 0; i < 4; i++) P.painting(-71.2 + i * 0.25, y + 2.3, -11 + i * 0.6, PI / 2 - 0.25, 2.4, 3, T.painting(['sea', 'lady', 'forest', 'family'][i], 30 + i), { frame: 0.3 });
    P.chair(-54.5, y, -8, 2.1, { fallen: true });
    P3.hangingBulb(-62, y + h, -16, { flicker: 0.35, room: 'storage', power: 10 });
    N('sto:a', -62, -7.5, { room: 'storage' }); N('sto:b', -62, -13, { room: 'storage', poi: true }); N('sto:c', -55, -13, { room: 'storage' });
    nav.link('cB:-62', 'sto:a', { door: O.dStorage });
  }
  // --- the workshop ------------------------------------------------------------------------------------------------------------------------------
  {
    slab(-52, -32, -28, -4, y, h, M.concrete, M.ceilingDark, { surface: 'concrete' });
    W('x', -28, -52, -32, y, h, null, conc);
    W('z', -32, -28, -4, y, h, conc, null);
    P3.workbench(-42, y, -26.0, 0, { w: 9 });
    P3.pegboardPanel(-42, y + 6.2, -27.45, 0, 8, 4);
    note('workshop', { pos: V(-40.4, y + 3.27, -25.6), ry: 0.3, ...NOTES.workshop });
    P2.shelves(-33.3, y, -18, -PI / 2, { w: 7, h: 8, d: 1.6, n: 4, fill: 'tins', mat: M.steel });
    O.workLocker = P.locker(-33.6, y, -9.5, -PI / 2, { room: 'workshop' });
    P3.barrel(-50, y, -9, {});
    P3.barrel(-49.6, y, -12.2, { fallen: true, ry: 0.4 });
    k.at(-50.9, y, -20, PI / 2).box(0, 5, 0, 1.6, 10, 0.2, M.woodLight, { rx: -0.12 });
    pickup('batteryWork', { pos: V(-33.4, y + 3.07, -15.8), kind: 'battery', give: 'battery' });
    P3.cageLight(-42, y + 8, -4.55, PI, { room: 'workshop', flicker: 0.2 });
    N('wrk:a', -42, -7.5, { room: 'workshop' }); N('wrk:b', -42, -16, { room: 'workshop', poi: true }); N('wrk:l', -36.8, -9.5, { room: 'workshop' });
    nav.link('cB:-42', 'wrk:a', { door: O.dWork });
    O.workLocker.node = nav.get('wrk:l');
  }
  // --- the boiler room ------------------------------------------------------------------------------------------------------------------------------
  {
    slab(-72, -40, 4, 34, y, h, M.concrete, M.ceilingDark, { surface: 'concrete' });
    face('z', -72, 4, 24, y, y + h, 1, M.brickRed);
    W('z', -72, 24, 34, y, h, null, brick);
    W('x', 34, -72, -40, y, h, brick, null);
    W('z', -40, 4, 34, y, h, brick, S.tile, { holes: [{ a: 24, b: 28.5, y0: y, y1: y + 8.4 }] });
    O.boiler = P3.boiler(-64.5, y, 19, PI / 2, { power: 20 });
    O.nest = P3.nest(-55, y, 19, -PI / 2);
    O.cutters = pickup('boltCutters', { pos: V(-53.0, y + 2.0, 17.6), kind: 'cutters', rx: 0.25, rz: -0.35, ry: -0.6, r: 5.5 });
    P3.coalPile(-68.5, y, 30, 3.2);
    P3.pipeRun([[-64.5, y + 7, 22.5], [-64.5, y + 8.6, 26], [-50, y + 8.6, 26], [-50, y + 8.6, 33.4]], 0.4, M.rust);
    P3.pipeRun([[-61, y + 9, 15], [-61, y + 9, 5], [-44, y + 9, 5]], 0.3, M.pipe);
    for (const [x, z] of [[-44.5, 12], [-44.5, 22]]) P3.valveWheel(x, y + 4.8, z, -PI / 2, 0.6);
    for (let i = 0; i < 5; i++) k.at(-48 + i * 1.7, y + h, 30 - i * 2.4, 0).cyl(0, -1.5 - (i % 3), 0, 0.05, 0.05, 3 + (i % 3) * 2, M.iron, { seg: 4 });
    P.decal(-56, y + 5.4, 33.45, PI, 9, 3.2, T.writing('EVERY GUEST IS WELCOME\nNO GUEST MAY LEAVE', { w: 768, h: 256 }));
    note('basement', { pos: V(-56, y + 5, 32.5), r: 9, ...NOTES.basement });
    P3.cageLight(-71.45, y + 7.5, 10, PI / 2, { broken: true, room: 'boiler' });
    N('boi:a', -56, 7.5, { room: 'boiler' }); N('boi:b', -50.5, 13, { room: 'boiler', poi: true }); N('boi:c', -50.5, 25, { room: 'boiler' }); N('boi:d', -58, 29, { room: 'boiler' }); N('boi:e', -43, 26, { room: 'boiler' }); N('boi:h', -68.6, 12, { room: 'boiler' });
    nav.link('cB:-56', 'boi:a', { door: O.dBoiler });
  }
  // --- the laundry ----------------------------------------------------------------------------------------------------------------------------------
  {
    slab(-40, -12, 4, 34, y, h, M.tileFloor, M.ceilingDark, { surface: 'tile' });
    W('z', -12, 4, 34, y, h, S.tile, null);
    W('x', 34, -40, -12, y, h, S.tile, null);
    for (const z of [8.5, 13.5, 18.5, 23.5]) P3.washingMachine(-14.2, y, z, -PI / 2);
    O.sheets = [];
    for (const z of [12, 19, 26]) O.sheets.push(...P3.clothesline(-38.5, z, -18.5, z, y + 8.2));
    for (const [x, z] of [[-36, 31], [-33, 31.5], [-17, 30.5]]) P3.laundryBasket(x, y, z);
    O.laundryWard = P.wardrobe(-35, y, 5.95, 0, { room: 'laundry', wood: M.woodLight });
    k.at(-22, y, 31.2, 0).cyl(0, h / 2 + 2.5, 0, 1.2, 1.2, h - 3, M.steel, { seg: 12, open: true });
    k.at(-22, y, 31.2, 0).sphere(0, 0.4, 0, 2.2, M.linen, { part: 0.5, s: [1.2, 0.6, 1], seg: 10 });
    for (const x of [-34, -20]) P.tubeLight(x, y + h, 19, PI / 2, { flicker: 0.3, room: 'laundry' });
    N('lau:a', -26, 7.5, { room: 'laundry' }); N('lau:b', -28, 15.5, { room: 'laundry', poi: true }); N('lau:c', -28, 22.5, { room: 'laundry' }); N('lau:d', -28, 29.5, { room: 'laundry' }); N('lau:e', -36.5, 26, { room: 'laundry' }); N('lau:w', -35, 9.2, { room: 'laundry' });
    nav.link('cB:-26', 'lau:a', { door: O.dLaundry });
    O.laundryWard.node = nav.get('lau:w');
  }
}
