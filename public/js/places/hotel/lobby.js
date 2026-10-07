// The grand lobby: a marble floor with the raven in the middle, the atrium
// rising four storeys to a stained-glass skylight, the great chandelier,
// the central staircase (burned away at the top where the second floor
// fell in), the colonnade, the fireplace, the clock stopped at 3:33, the
// front desk with its register and keys, the lifts - and the front doors,
// chained shut from the inside.
import * as THREE from 'three';
import { H } from './state.js';
import { FL, W, slab, rug, styles } from './shell.js';
import { Door, Elevator } from './doors.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import * as P3 from './props3.js';
import { pickup, note } from './items.js';
import { NOTES } from './lore.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { bake, torusGeo, boxGeo, M4 } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

export function buildLobby() {
  const k = H.kit, M = H.M, S = styles(), y = FL.F1, nav = H.nav, O = H.obj, F = 'F1';
  const h = 14, top = 45;
  const N = (id, x, z, o = {}) => nav.node(id, x, y, z, { floor: F, room: 'lobby', ...o });
  const soot = { ...S.cream, mat: M.wallCream };

  // --- floor and ceilings -----------------------------------------------------------------------------------------------------------
  k.floor(-22, 22, -14, 60, y, M.marbleFloor);
  k.ceiling(-22, 22, -14, 4, y + h, M.ceiling);
  k.ceiling(-22, -6, 4, 10, y + h, M.ceilingDark);
  k.ceiling(6, 22, 4, 10, y + h, M.ceilingDark);
  k.ceiling(-22, 22, 36, 60, y + h, M.ceiling);
  k.ceiling(-22, -18, 10, 36, y + h, M.ceiling);
  k.ceiling(18, 22, 10, 36, y + h, M.ceiling);
  // the raven in the floor
  k.at(0, y, 47, 0).cyl(0, 0.03, 0, 4.6, 4.6, 0.06, flat(T.crest(), { rough: 0.25 }), { seg: 48, cast: false });
  k.at(0, y, 47, 0).torus(0, 0.04, 0, 4.75, 0.12, M.brass, { rx: PI / 2, seg: 48, cast: false });

  // --- the walls ------------------------------------------------------------------------------------------------------------------------
  W('x', -14, -22, 22, y, h, null, S.cream, { holes: [{ a: -7.5, b: -2.5, y0: y, y1: y + 8.4 }, { a: 2.5, b: 7.5, y0: y, y1: y + 8.4 }] });
  W('z', -22, -14, -4, y, h, S.office, S.cream);
  W('z', -22, -4, 4, y, h, S.brick, S.cream, { doors: [0] });
  W('z', -22, 4, 28, y, h, S.office, S.cream, { holes: [{ a: 10, b: 18, y0: y, y1: y + 10 }] });
  W('z', -22, 28, 60, y, 20, S.ball, S.cream, { doors: [{ at: 46, w: 8, h: 9.6 }] });
  W('z', 22, -14, 60, y, h, S.cream, null, { holes: [{ a: 43, b: 49, y0: y, y1: y + 9 }] });
  W('x', 60, -22, 22, y, h, S.cream, S.ext, { holes: [{ a: -4, b: 4, y0: y, y1: y + 10 }, { a: -15.5, b: -10.5, y0: y + 3, y1: y + 11 }, { a: 10.5, b: 15.5, y0: y + 3, y1: y + 11 }, { a: -4, b: 4, y0: y + 10.4, y1: y + 13.2 }] });
  for (const x of [-13, 13]) P.windowAt('x', 60, x, y + 3, 5, 8, -1, { curtainMat: M.velvetRed, power: 6 });
  // the fanlight over the doors
  k.box(-4, 4, y + 10.4, y + 13.2, 59.7, 59.75, M.stained, { faces: ['nz'], uv: 'local', rep: [1, 0.4] });
  for (const x of [-2, 0, 2]) k.box(x - 0.08, x + 0.08, y + 10.4, y + 13.2, 59.4, 59.6, M.iron);
  k.box(-4.3, 4.3, y + 10.0, y + 10.4, 59.2, 60.4, M.woodDark);
  // the east wing is shut
  P3.boards(21.4, y, 46, -PI / 2, 6, 9, { sign: 'EAST WING\nCLOSED', solid: true, mat: M.woodDark, tint: '#8a7050' });

  // --- the atrium: colonnade, the void up to the skylight, the burned balcony --------------------------------------------------------
  for (const x of [-18, 18]) for (const z of [10, 18.67, 27.33, 36]) P3.column(x, y, y + 12.6, z, { r: 0.95 });
  for (const x of [-18, 18]) k.box(x - 1.1, x + 1.1, y + 12.6, y + h, 9, 37, M.wallCream, { faces: ['ny', 'nx', 'px', 'nz', 'pz'] });
  for (const z of [10, 36]) k.box(-18, 18, y + 12.6, y + h, z - 1.1, z + 1.1, M.wallCream, { faces: ['ny', 'nz', 'pz'] });
  for (const x of [-18, 18]) k.box(x - 1.15, x + 1.15, y + 12.9, y + 13.1, 9, 37, M.gold, { faces: ['nx', 'px'] });
  // the void's walls, sooty low down where the fire came up
  W('z', -18, 10, 28, FL.F2 - 1, 16, null, soot, { tint: '#7a7268' });
  W('z', -18, 28, 36, FL.F2 - 1, 16, S.ext, soot, { tint: '#7a7268' });
  W('z', 18, 10, 28, FL.F2 - 1, 16, soot, null, { tint: '#7a7268' });
  W('z', 18, 28, 36, FL.F2 - 1, 16, soot, S.ext, { tint: '#7a7268' });
  W('z', -18, 28, 36, FL.F3, 12, S.ext, S.cream);
  W('z', 18, 28, 36, FL.F3, 12, S.cream, S.ext);
  W('z', -18, 10, 36, FL.F3 + 12, top - FL.F3 - 12, S.ext, S.cream);
  W('z', 18, 10, 36, FL.F3 + 12, top - FL.F3 - 12, S.cream, S.ext);
  W('x', 36, -18, 18, FL.F2 - 1, top - FL.F2 + 1, S.cream, S.ext, { holes: [{ a: -9, b: 9, y0: 19, y1: 40 }] });
  W('x', 10, -18, 18, FL.F3 + 12, top - FL.F3 - 12, null, S.cream);
  W('z', -18, 4, 10, FL.F2, 15, null, S.burnt);
  W('z', 18, 4, 10, FL.F2, 15, S.burnt, null);
  atriumWindow(0, 19, 36, 18, 21);
  O.atriumLight = H.lights.add({ pos: V(0, 26, 31), color: 0x8aa4e0, power: 12, range: 46, circuit: 'window', flicker: 0, halo: 0 });
  // the skylight
  k.box(-18, 18, top, top + 0.3, 10, 36, M.stained, { faces: ['ny'], uv: 'local', rep: [2, 1.5] });
  for (let x = -18; x <= 18; x += 6) k.box(x - 0.2, x + 0.2, top - 0.6, top, 10, 36, M.iron);
  for (let z = 10; z <= 36; z += 6.5) k.box(-18, 18, top - 0.6, top, z - 0.2, z + 0.2, M.iron);
  H.lights.add({ pos: V(0, top - 3, 23), color: 0x7a90c8, power: 9, range: 40, circuit: 'window', flicker: 0, halo: 0 });
  // the second-floor gallery, burned and fallen in where the staircase reached it
  for (const [a, b] of [[-18, -6], [6, 18]]) k.box(a, b, FL.F2 - 1, FL.F2, 4, 10, M.charred, { faces: ['py', 'pz', a < 0 ? 'px' : 'nx'] });
  k.box(-18, 18, FL.F3 - 0.6, FL.F3 - 0.1, 4, 10, M.ceilingDark, { faces: ['ny', 'pz'], tint: '#3a3430' });
  W('x', 4, -18, 18, FL.F2, 15, null, S.burnt, { holes: [{ a: -3, b: 3, y0: FL.F2, y1: FL.F2 + 9 }] });
  P3.balustrade('x', 10, -18, 18, FL.F2, { mat: M.charred, broken: [[-8, 8], [11, 14]], solid: false });
  P3.beam([-6, FL.F2, 7], [-3, FL.F2 - 6, 11], 0.7);
  P3.beam([6, FL.F2 + 0.2, 5], [7.5, FL.F2 - 4.5, 9.5], 0.5);
  P3.beam([-1, FL.F2 + 12, 4.5], [-4, FL.F2 + 3, 9], 0.6);
  // the great chandelier
  O.chandelier = P.chandelier(0, top, 22, { scale: 2.3, drop: 8.5, tiers: 3, power: 160, range: 60, emergency: 0.07, room: 'lobby' });

  // --- the grand staircase, broken off at the top --------------------------------------------------------------------------------------
  const nSteps = 20, gone = 14;
  P3.stairs('z', 34, 10, -5, 5, y, FL.F2, { n: nSteps, solidBelow: true, floorY: y, mat: M.marbleWhite, carpet: M.carpetRed, carpetW: 0.7, rods: true, skip: (i) => i >= gone, surface: 'carpet' });
  const zEnd = 34 - (34 - 10) / nSteps * gone, yEnd = FL.F2 / nSteps * gone;
  for (const x of [-5.25, 5.25]) {
    sbalustrade(x, 34, zEnd + 0.4, y, yEnd);
    k.at(x, y, 34.6, 0).box(0, 2.6, 0, 1.0, 5.2, 1.0, M.marbleWhite);
    k.at(x, y, 34.6, 0).lathe([[0.2, 5.2], [0.35, 5.6], [0.15, 6.2], [0.1, 6.8], [0, 6.9]], 0, 0, 0, M.brass, { seg: 10 });
    const fx = H.lights.add({ pos: V(x, y + 7.6, 34.6), color: 0xffc888, power: 14, range: 16, circuit: 'main', flicker: 0.05, emergency: 0.18, halo: 1.8, room: 'lobby' });
    H.lights.glow(fx, 'globe', M4(x, y + 7.5, 34.6, 0, 0, 0, 1.2), 0.6);
  }
  // the broken end: a barrier, debris, a beam and the burned balusters below it
  k.solid(-5, 5, yEnd, yEnd + 4, zEnd - 0.6, zEnd, { name: 'Rail' });
  k.box(-5, 5, yEnd - 1.2, yEnd, zEnd - 0.4, zEnd, M.charred, { faces: ['nz', 'py'] });
  P3.debris(0, y, 14, 5, 26, { plaster: M.marbleWhite });
  P3.debris(-1, yEnd, zEnd + 1.2, 1.6, 6);
  P3.beam([-4, y + 0.4, 12], [3, y + 2.6, 17], 0.6);

  // --- the fireplace, the portrait, armchairs; the clock --------------------------------------------------------------------------------
  O.fire = P2.fireplace(16, y, -13.5, 0);
  P2.portrait(16, y + 10.9, -13.45, 0, { w: 3.0, h: 3.6 });
  P.sofa(16, y, -3.6, PI, { fabric: M.velvetGreen, w: 7 });
  P.armchair(10.4, y, -8.4, 2.2, { fabric: M.velvetRed });
  P.armchair(19.9, y, -6.6, -2.5, { fabric: M.velvetRed });
  P.coffeeTable(16, y, -7.6, 0);
  P.rugAt(16, y, -7, 0, 11, 8, T.rug('fire', '#3a1610', '#120604', '#a07a36', 61));
  O.clock = P2.grandfatherClock(-16, y, -12.7, 0);
  P.armchair(-15.5, y, -4.5, 0.4, { fabric: M.velvetGreen, sheet: true });
  P2.pottedPalm(-20, y, 6.6, 1.1);
  // --- the front desk ------------------------------------------------------------------------------------------------------------------------
  reception();
  // --- the lifts --------------------------------------------------------------------------------------------------------------------------------
  H.elev[1] = [new Elevator({ x: -5, y, z: -13.5, floor: 1, shown: 1 }), new Elevator({ x: 5, y, z: -13.5, floor: 1, shown: 3 })];
  // --- the south end: the doors, the trolley, benches, palms ----------------------------------------------------------------------------------
  O.front = new Door({ x: 0, y, z: 60, axis: 'x', w: 8, h: 10, style: 'glass', double: true, swing: -1, plate: -1, name: 'Front doors', locked: true, lockedMsg: () => (H.inv.has('boltCutters') ? 'Chained shut. Use the bolt cutters on the chain.' : 'The front doors. A heavy chain is wound through the handles and padlocked.') });
  O.front.sealed = true;
  O.chain = chain(0, y + 4.2, 59.55);
  P2.luggageTrolley(11, y, 53.5, 0.4);
  P2.pottedPalm(-7.5, y, 57.6, 1.2);
  P2.pottedPalm(7.5, y, 57.6, 1.2);
  P2.pottedPalm(-20, y, 38.5, 1.1);
  P2.pottedPalm(20, y, 33.5, 1.1);
  P3.bench(-20.5, y, 30, PI / 2, 6);
  P3.bench(20.5, y, 38.5, -PI / 2, 6);
  P3.bench(-20.5, y, 54, PI / 2, 6);
  P.rugAt(0, y, 53, 0, 9, 7, T.rug('door', '#2a1612', '#0e0604', '#8a6a2a', 62));
  P.emergencyLight(0, y + 13.2, 59.4, PI);
  P.exitSign(0, y + 9.2, 59.4, PI);
  P.emergencyLight(-21.4, y + 9.6, 3.0, PI / 2);
  // wall lights
  P.sconce(-11.5, y + 7.2, -13.45, 0, { room: 'lobby' });
  for (const z of [-6, 24, 37, 55]) P.sconce(-21.45, y + 7.2, z, PI / 2, { room: 'lobby', flicker: z === 37 ? 0.4 : 0.08 });
  for (const z of [6, 34, 54]) P.sconce(21.45, y + 7.2, z, -PI / 2, { room: 'lobby' });
  for (const x of [-8.5, 8.5]) P.sconce(x, y + 7.2, 59.45, PI, { room: 'lobby' });

  // --- nav ---------------------------------------------------------------------------------------------------------------------------------------
  const pts = [
    ['L:nw', -17, -9], ['L:n', 0, -9, true], ['L:w0', -17, 0], ['L:c0', -8, 0], ['L:e0', 8, 1], ['L:ne', 19, 3, true],
    ['L:w1', -12, 11], ['L:w2', -12, 21], ['L:w3', -12, 30], ['L:arch', -19, 14], ['L:e1', 11, 10], ['L:e2', 10.5, 21, true], ['L:e3', 10.5, 30],
    ['L:desk', 19.8, 30.5], ['L:keys', 20, 21],
    ['L:s1', -12, 40], ['L:s2', 0, 40, true], ['L:s3', 12, 40], ['L:ball', -19, 46], ['L:s4', -10, 50], ['L:s5', 0, 55], ['L:s6', 9.5, 47],
  ];
  for (const [id, x, z, poi] of pts) N(id, x, z, { poi: !!poi });
  N('e1w:o', -5, -10.5, { tag: 'liftfront' }); N('e1e:o', 5, -10.5, { tag: 'liftfront' });
  const cw = nav.node('e1w:i', -5, y, -18.5, { floor: F, tag: 'car' }), ce = nav.node('e1e:i', 5, y, -18.5, { floor: F, tag: 'car' });
  cw.noAuto = ce.noAuto = true;
  nav.link('e1w:o', cw, { elevator: H.elev[1][0] }); nav.link('e1e:o', ce, { elevator: H.elev[1][1] });
  O.dLobbyBOH = new Door({ x: -22, y, z: 0, axis: 'z', hinge: 1, swing: -1, plate: 1, style: 'staff', plateText: 'STAFF ONLY', plateStyle: 'enamel', name: 'Staff door' });
  nav.link('c1:-25', 'L:w0', { door: O.dLobbyBOH });
  O.dBall = new Door({ x: -22, y, z: 46, axis: 'z', w: 8, h: 9.6, style: 'double', double: true, swing: -1, name: 'Ballroom' });
  nav.node('b:door', -25.5, y, 46, { floor: F, room: 'ball' });
  nav.link('L:ball', 'b:door', { door: O.dBall });
}

/** A sloped balustrade up the side of the grand staircase (and a collider so you can't step off the side). */
function sbalustrade(x, za, zb, ya, yb) {
  const k = H.kit, M = H.M, n = Math.round(Math.abs(zb - za) / 1.2);
  const a = V(x, ya + 3.6, za), b = V(x, yb + 3.6, zb), d = b.clone().sub(a), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  k.geo(boxGeo(0.45, L, 0.5), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)), M.woodDark, { cast: false });
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = za + (zb - za) * t, yy = ya + (yb - ya) * t;
    k.at(x, yy, z, 0).lathe([[0.16, 0], [0.26, 0.4], [0.12, 1.2], [0.24, 2.0], [0.11, 2.8], [0.15, 3.4]], 0, 0, 0, M.marbleWhite, { seg: 8, cast: false });
  }
  const ang = Math.atan2(-(yb - ya), zb - za) / (PI / 180), c = a.clone().add(b).multiplyScalar(0.5);
  const p = H.world.add({ size: [0.5, 6, L], position: [x, c.y - 1.6, c.z], rotation: [ang, 0, 0], transparency: 1, name: 'Rail', top: 'Smooth', bottom: 'Smooth' });
  k.colliders.push(p);
}

/** The great window over the atrium: an arch of stained glass in iron tracery, the storm behind it. */
function atriumWindow(x, y0, z, w, h) {
  const k = H.kit, M = H.M;
  k.box(x - w / 2, x + w / 2, y0, y0 + h, z - 0.3, z - 0.25, M.stained, { faces: ['nz', 'pz'], uv: 'local', rep: [1, 1.2] });
  const b = k.at(x, y0, z - 0.55, PI);
  for (let i = 1; i < 4; i++) b.box(-w / 2 + i * w / 4, h / 2, 0, 0.3, h, 0.4, M.iron);
  for (let i = 1; i < 6; i++) b.box(0, i * h / 6, 0, w, 0.25, 0.4, M.iron);
  b.box(0, -0.4, 0.6, w + 1.4, 0.8, 1.4, M.wallCream);
  for (const s of [-1, 1]) b.box(s * (w / 2 + 0.5), h / 2, 0.3, 1.0, h + 0.8, 0.8, M.wallCream);
  b.box(0, h + 0.4, 0.3, w + 2, 0.8, 0.8, M.wallCream);
  const glow = H.lights.add({ pos: V(x, y0 + h / 2, z - 1.5), color: 0x9ab0e8, power: 0, range: 1, circuit: 'window', flicker: 0, halo: 9 });
  void glow;
}

/** The front desk: a long counter, the bell, the register, the key cubbies behind with the office key. */
function reception() {
  const k = H.kit, M = H.M, y = FL.F1, O = H.obj;
  const x0 = 13.5, x1 = 18.5, z0 = 14, z1 = 28;
  k.box(x0 + 0.3, x1, y, y + 3.6, z0, z1, M.panel, { faces: ['nx', 'px', 'nz', 'pz'] });
  k.box(x0, x1 + 0.2, y + 3.6, y + 3.85, z0 - 0.2, z1 + 0.2, M.marbleBlack);
  k.box(x0 + 0.1, x0 + 0.3, y + 0.2, y + 3.4, z0 + 0.4, z1 - 0.4, M.gold, { faces: ['nx'] });
  k.solid(x0, x1 + 0.2, y, y + 3.9, z0 - 0.2, z1 + 0.2, { name: 'Desk' });
  k.at(x0 - 0.02, y + 2.4, 21, -PI / 2).box(0, 0, 0, 4.2, 0.8, 0.05, flat(T.sign('RECEPTION', { w: 256, h: 48, style: 'brass' }), { metal: 0.7, rough: 0.35 }), { uv: 'local', faces: ['pz'], cast: false });
  O.bell = P2.serviceBell(x0 + 0.6, y + 3.85, 21.2);
  O.ledger = P2.ledger(x0 + 1.6, y + 3.85, 18.2, -PI / 2 + 0.15);
  P2.deskPhone(x0 + 1.4, y + 3.85, 25.4, -PI / 2 - 0.3);
  P.bankerLamp(x0 + 2.4, y + 3.85, 15.4, -PI / 2, { room: 'lobby' });
  P.candles(x0 + 2.2, y + 3.85, 23.4, { n: 2, power: 5 });
  note('register', { noMesh: true, pos: O.ledger.clone(), title: NOTES.register.title, text: () => NOTES.register.text(H.playerName || 'You') });
  // behind the desk: the cubbies, the bell board, a chair
  k.box(21.3, 21.5, y + 3.2, y + 9.2, 15.5, 27, M.cubbies, { faces: ['nx'], uv: 'local' });
  k.box(21.0, 21.5, y + 3.0, y + 3.2, 15.3, 27.2, M.woodDark);
  k.box(21.0, 21.5, y + 9.2, y + 9.6, 15.3, 27.2, M.woodDark);
  k.box(21.3, 21.5, y + 9.8, y + 11.4, 17, 25.5, flat(bellBoard(), { rough: 0.5 }), { faces: ['nx'], uv: 'local' });
  P.chair(20, y, 25.5, -PI / 2 - 0.4, { seat: M.leather });
  O.officeKey = pickup('officeKey', { pos: V(21.05, y + 7.2, 19.4), kind: 'key', ry: PI / 2, rz: 0.2, r: 5 });
}
function bellBoard() {
  return T.canvasTex('bellboard', 256, 64, (x, w, h) => {
    x.fillStyle = '#2a1608'; x.fillRect(0, 0, w, h);
    const rooms = ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313'];
    rooms.forEach((r, i) => {
      const cx = 10 + i * 18.6;
      x.fillStyle = '#0a0604'; x.fillRect(cx - 7, 10, 14, 26);
      x.fillStyle = r === '313' ? '#c01010' : '#e8dcc0';
      if (r === '313' || r === '302') x.fillRect(cx - 5, 22, 10, 12);
      x.fillStyle = '#c8a050'; x.font = 'bold 8px Georgia'; x.textAlign = 'center'; x.fillText(r, cx, 50);
    });
  });
}
/** The chain wound through the front door handles, with its padlock (a group, so it can fall when it's cut). */
function chain(x, y, z) {
  const M = H.M, g = new THREE.Group(), parts = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), px = -2.2 + t * 4.4, py = -Math.sin(t * PI) * 0.9 + Math.sin(t * PI * 3) * 0.12;
    parts.push([torusGeo(0.16, 0.05, 8), M4(px, py, 0, 0, i % 2 ? PI / 2 : 0, 0.3)]);
  }
  for (let i = 0; i < 8; i++) parts.push([torusGeo(0.16, 0.05, 8), M4(-2.3 + Math.sin(i) * 0.1, 0.3 - i * 0.3, 0.1, 0, i % 2 ? PI / 2 : 0, PI / 2)]);
  const links = new THREE.Mesh(bake(parts), M.iron); links.castShadow = true;
  const lock = new THREE.Mesh(bake([[boxGeo(0.7, 0.8, 0.3), M4(0.3, -1.4, 0.05)], [torusGeo(0.24, 0.06, 10, PI), M4(0.3, -1.0, 0.05)]]), M.brass);
  g.add(links, lock);
  g.position.set(x, y, z);
  H.world.scene.add(g);
  return { g, pos: V(x + 0.3, y - 1.2, z - 0.6) };
}
