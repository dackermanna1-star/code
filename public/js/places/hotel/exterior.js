// Outside: the porch with its columns and lanterns, the steps down to the
// gravel drive, dead trees and gas lamps in the rain, the iron gates - and
// the hotel itself seen from the drive: red brick, rows of dark windows (a
// few lit), the great arched window over the atrium, the towers.
import * as THREE from 'three';
import { H } from './state.js';
import { FL, W, face, styles } from './shell.js';
import * as P from './props.js';
import * as P3 from './props3.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { M4 } from './kit.js';

const PI = Math.PI;

export function buildExterior() {
  const k = H.kit, M = H.M, S = styles(), O = H.obj;
  const grass = new THREE.MeshStandardMaterial({ color: 0x141a10, roughness: 1, vertexColors: true }); grass.userData.tile = 8;
  const gravel = new THREE.MeshStandardMaterial({ map: M.concrete.map, color: 0x6a645a, roughness: 1, vertexColors: true }); gravel.userData = { tile: 6, surface: 'gravel' };
  const slate = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7, metalness: 0.1, vertexColors: true }); slate.userData.tile = 4;
  const lit = new THREE.MeshBasicMaterial({ color: 0x7a5228, vertexColors: true }); lit.userData.tile = 4;
  const dark = M.mirror;

  // --- the ground, the drive --------------------------------------------------------------------------------------------------------
  k.floor(-160, 160, 60.5, 260, -3, grass, { surface: 'grass' });
  k.box(-9, 9, -3, -2.96, 76, 205, gravel, { faces: ['py'] });
  k.box(-160, 160, -3.2, -3, -60, 60.5, grass, { faces: ['py'] });
  // the porch: floor, columns, the roof and the hotel's name, lanterns, steps, balustrades
  k.floor(-20, 20, 60.5, 72, FL.F1, M.marbleBlack, { surface: 'marble' });
  k.box(-20, 20, -3, 0, 71.9, 72, M.marbleBlack, { faces: ['pz'] });
  for (const x of [-18, -7.5, 7.5, 18]) P3.column(x, 0, 14, 71, { r: 0.9 });
  k.box(-21, 21, 14, 15.4, 60.5, 73.5, M.wallCream, { faces: ['ny', 'py', 'pz', 'nx', 'px'] });
  k.box(-21.4, 21.4, 15.4, 15.9, 60.5, 74, M.crown);
  k.box(-9, 9, 15.9, 18.6, 72.9, 73.2, flat(T.sign('THE RAVENHURST', { w: 512, h: 96, style: 'brass' }), { metal: 0.6, rough: 0.4 }), { uv: 'local', faces: ['pz'] });
  for (const s of [-1, 1]) {
    const b = k.at(s * 6.2, 6.6, 60.95, 0);
    b.box(0, 0, 0, 0.9, 1.4, 0.9, M.iron); b.box(0, 0.9, 0, 1.1, 0.25, 1.1, M.iron); b.box(0, -0.9, -0.3, 0.2, 0.6, 0.6, M.iron);
    const fx = H.lights.add({ pos: b.W(0, 0, 0.6), color: 0xffb060, power: 8, range: 16, circuit: 'battery', flicker: 0.3, halo: 1.6 });
    H.lights.glow(fx, 'bulb', M4(s * 6.2, 6.6, 60.95, 0, 0, 0, 2.2), 1.4);
  }
  P3.stairs('z', 76, 72, -12, 12, -3, 0, { n: 4, solidBelow: true, floorY: -3.5, mat: M.marbleBlack, surface: 'marble' });
  for (const x of [-20, 20]) P3.balustrade('z', x, 60.5, 72, 0, { mat: M.marbleWhite, h: 3.4 });
  // --- the front of the building --------------------------------------------------------------------------------------------------------
  // the east wing: dark windows, a flat roof
  const ew = [30, 40, 50, 60, 68];
  W('x', 60, 22, 72, 0, 15, null, S.ext, { holes: ew.map((x) => ({ a: x - 2.2, b: x + 2.2, y0: 3, y1: 11 })), ends: true });
  for (const x of ew) win(x, 3, 60.5, 4.4, 8, x === 50 ? lit : dark, 1);
  k.box(22, 72, 14.6, 15.2, 28, 60.6, slate, { faces: ['py', 'pz'] });
  k.box(-72, -22, 20, 20.6, 28, 60.6, slate, { faces: ['py', 'pz'] });
  k.box(-22, 22, 14.2, 15.0, 36, 60.6, slate, { faces: ['py', 'pz'] });
  k.box(-72.5, 72.5, 14.4, 15.4, 60.4, 61.3, M.crown, { faces: ['py', 'pz', 'ny'] });
  // the upper floors' facade (z = 28): the burned second floor, the third, the cornice and the mansard roof
  const bays = [-64, -48, -29, 29, 48, 64];
  W('x', 28, -72, -18, FL.F2, 15, null, S.ext, { holes: bays.filter((x) => x < 0).map((x) => ({ a: x - 3, b: x + 3, y0: FL.F2 + 3, y1: FL.F2 + 9 })), collide: false });
  W('x', 28, 18, 72, FL.F2, 15, null, S.ext, { holes: bays.filter((x) => x > 0).map((x) => ({ a: x - 3, b: x + 3, y0: FL.F2 + 3, y1: FL.F2 + 9 })), collide: false });
  for (const x of bays) win(x, FL.F2 + 3, 28.5, 6, 6, dark, 1, true);
  W('x', 28, -72, -56, FL.F3, 12, null, S.ext, { holes: [{ a: -67, b: -61, y0: FL.F3 + 3, y1: FL.F3 + 9 }], collide: false });
  W('x', 28, 40, 72, FL.F3, 12, null, S.ext, { holes: [{ a: 45, b: 51, y0: FL.F3 + 3, y1: FL.F3 + 9 }, { a: 61, b: 67, y0: FL.F3 + 3, y1: FL.F3 + 9 }], collide: false });
  win(-64, FL.F3 + 3, 28.5, 6, 6, lit, 1);
  win(48, FL.F3 + 3, 28.5, 6, 6, dark, 1);
  win(64, FL.F3 + 3, 28.5, 6, 6, dark, 1);
  // soot above the burned second-floor windows
  for (const x of bays.slice(0, 3)) P.decal(x, FL.F2 + 11, 28.56, 0, 7, 5, sootTex());
  k.box(-72.5, -18, FL.F3 + 12, FL.F3 + 13.2, 27.6, 29.2, M.crown, { faces: ['py', 'pz', 'ny', 'nx'] });
  k.box(18, 72.5, FL.F3 + 12, FL.F3 + 13.2, 27.6, 29.2, M.crown, { faces: ['py', 'pz', 'ny', 'px'] });
  roof(-72.5, -18, 28, FL.F3 + 13.2, slate);
  roof(18, 72.5, 28, FL.F3 + 13.2, slate);
  for (const x of [-56, -40, 40, 56]) dormer(x, FL.F3 + 13.2, 25.5, slate, x === -40 ? lit : dark);
  // the atrium's bay rises above, with its great window (you can see the stained glass from the drive)
  k.box(-19, 19, 45, 46.4, 9, 37, M.crown, { faces: ['py', 'pz', 'nx', 'px'] });
  k.box(-18, 18, 46.4, 47, 10, 36, slate, { faces: ['py'] });
  // the stair tower and 313's tower
  face('x', 24, -92, -72, -15, 47, 1, M.brickRed);
  face('z', -92, -6, 24, -15, 47, -1, M.brickRed);
  k.box(-93, -71, 47, 48.4, -7, 25, M.crown, { faces: ['py', 'pz', 'nx'] });
  k.box(-92, -72, 48.4, 49, -6, 24, slate, { faces: ['py'] });
  face('x', 12, 72, 92, 0, 30, 1, M.brickRed);
  face('z', 92, -12, 12, 0, 30, 1, M.brickRed);
  k.box(71.5, 93, FL.F3 + 12, FL.F3 + 13.4, -13, 13, M.crown, { faces: ['py', 'pz', 'px'] });
  roof(71.5, 93, 13, FL.F3 + 13.4, slate, 10);
  win(82, 15 + 3, 12.5, 4.4, 7, dark, 1);
  // 313's window, from outside: a curtain of light that comes on at the end, and someone standing in it
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 6.2), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false }));
  glow.position.set(86, FL.F3 + 6.25, 11.7); H.world.scene.add(glow);
  const fig = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6.2), new THREE.MeshBasicMaterial({ map: silhouetteTex(), transparent: true, opacity: 0, depthWrite: false }));
  fig.position.set(86.2, FL.F3 + 6.2, 11.75); fig.renderOrder = 6; H.world.scene.add(fig);
  O.window313Out = { glow, fig };

  // --- the drive: gas lamps, dead trees, the gates -------------------------------------------------------------------------------------------------
  for (const [i, z] of [92, 118, 144, 170].entries()) for (const s of [-1, 1]) {
    const b = k.at(s * 11, -3, z, 0);
    b.lathe([[0.6, 0], [0.5, 0.4], [0.18, 0.8], [0.14, 9], [0.3, 9.4], [0, 9.5]], 0, 0, 0, M.iron, { seg: 8 });
    b.box(0, 10.3, 0, 1.2, 1.6, 1.2, M.iron, { tint: '#3a3a3a' }); b.cyl(0, 11.3, 0, 0.1, 0.9, 0.5, M.iron, { seg: 4 });
    const fx = H.lights.add({ pos: b.W(0, 10.3, 0), color: 0xffa850, power: 10, range: 18, circuit: 'battery', flicker: 0.25, halo: 2.2, broken: (i + (s > 0 ? 1 : 0)) % 3 === 2 });
    H.lights.glow(fx, 'globe', M4(s * 11, 7.3, z, 0, 0, 0, [1.4, 2.4, 1.4]), 0.7);
    k.solid(s * 11 - 0.5, s * 11 + 0.5, -3, 7, z - 0.5, z + 0.5);
  }
  const r = T.rng(77);
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1, x = side * (17 + r() * 60), z = 66 + r() * 190;
    if (Math.abs(x) < 26 && z < 80) continue;
    deadTree(x, -3, z, 9 + r() * 12, r);
  }
  for (const s of [-1, 1]) {
    const b = k.at(s * 13, -3, 205, 0);
    b.box(0, 7, 0, 3, 14, 3, M.brickRed); b.box(0, 14.4, 0, 3.6, 0.8, 3.6, M.marbleWhite); b.sphere(0, 15.6, 0, 1.0, M.marbleWhite, { seg: 10 });
    const g = k.at(s * 11.5, -3, 205, s * 1.1);
    for (let i = 0; i < 9; i++) g.cyl(-s * (0.5 + i * 1.1), 6, 0, 0.1, 0.1, 12, M.iron, { seg: 4 });
    for (const yy of [1.2, 6.5, 11.5]) g.box(-s * 5, yy, 0, 10, 0.3, 0.2, M.iron);
    k.solid(s * 13 - 1.5, s * 13 + 1.5, -3, 12, 203.5, 206.5);
    for (let x = s * 15; Math.abs(x) < 120; x += s * 1.4) k.at(x, -3, 205, 0).cyl(0, 4.5, 0, 0.08, 0.08, 9, M.iron, { seg: 4, cast: false });
    k.box(Math.min(s * 15, s * 120), Math.max(s * 15, s * 120), 5, 5.25, 204.9, 205.1, M.iron);
    k.solid(Math.min(s * 15, s * 120), Math.max(s * 15, s * 120), -3, 10, 204.5, 205.5);
  }
  // keep you near the house (invisible walls far out)
  k.solid(-162, -160, -10, 40, 60, 260); k.solid(160, 162, -10, 40, 60, 260); k.solid(-160, 160, -10, 40, 258, 260);
}

/** A window set into a facade: frame and sill, dark (or lit) glass. */
function win(x, y0, z, w, h, mat, side = 1, broken = false) {
  const k = H.kit, M = H.M, b = k.at(x, y0, z, side > 0 ? 0 : PI);
  b.box(0, h / 2, -0.25, w, h, 0.05, broken ? M.black : mat, { uv: 'local', faces: ['pz'], cast: false });
  b.box(0, -0.15, 0.25, w + 0.8, 0.3, 0.7, M.wallCream);
  b.box(0, h + 0.3, 0.1, w + 0.8, 0.6, 0.4, M.wallCream);
  b.box(0, h / 2, -0.1, 0.2, h, 0.2, M.woodDark); b.box(0, h * 0.6, -0.1, w, 0.2, 0.2, M.woodDark);
  if (broken) for (let i = 0; i < 3; i++) b.box((i - 1) * w * 0.3, h * (0.3 + i * 0.2), 0.05, w * 0.4, 0.4, 0.1, M.charred, { rz: (i - 1) * 0.3 });
}
/** A mansard roof sloping back from the cornice line at z0 (height y0), x0..x1. */
function roof(x0, x1, z0, y0, mat, depth = 14) {
  const k = H.kit, ang = 1.05, L = depth / Math.cos(ang) * 0.6;
  k.geo(new THREE.BoxGeometry(x1 - x0, 0.6, L), M4((x0 + x1) / 2, y0 + Math.sin(ang) * L / 2, z0 - Math.cos(ang) * L / 2, ang, 0, 0), mat, { cast: false });
  k.box(x0, x1, y0 + Math.sin(ang) * L, y0 + Math.sin(ang) * L + 0.4, z0 - Math.cos(ang) * L - depth, z0 - Math.cos(ang) * L + 0.2, mat, { faces: ['py', 'pz'] });
}
function dormer(x, y, z, slate, glass) {
  const k = H.kit, M = H.M, b = k.at(x, y, z, 0);
  b.box(0, 2.6, 0, 4.4, 5.2, 3, M.brickRed);
  b.box(0, 2.4, 1.52, 2.6, 3.4, 0.05, glass, { faces: ['pz'] });
  b.box(0, 5.6, 0, 5.2, 0.6, 3.6, M.crown);
  b.geo(new THREE.ConeGeometry(3.4, 2.6, 4, 1).rotateY(PI / 4), 0, 7.2, 0, slate, { s: [1, 1, 0.75] });
}
function deadTree(x, y, z, h, r) {
  const k = H.kit, M = H.M, b = k.at(x, y, z, r() * 6);
  const bark = M.charred;
  b.cyl(0, h / 2, 0, 0.35, 0.9, h, bark, { seg: 7, rz: (r() - 0.5) * 0.15 });
  for (let i = 0; i < 6; i++) {
    const a = r() * PI * 2, yy = h * (0.45 + r() * 0.5), L = 2 + r() * h * 0.35, tilt = 0.5 + r() * 0.7;
    b.cyl(Math.cos(a) * L * 0.25 * Math.sin(tilt), yy + L * 0.35, Math.sin(a) * L * 0.25 * Math.sin(tilt), 0.06, 0.22, L, bark, { seg: 4, rz: -Math.cos(a) * tilt, rx: Math.sin(a) * tilt });
  }
  k.solid(x - 0.8, x + 0.8, y, y + h, z - 0.8, z + 0.8);
}
function sootTex() {
  return T.canvasTex('soot', 128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const g = x.createRadialGradient(w / 2, h * 0.9, 4, w / 2, h * 0.7, 70);
    g.addColorStop(0, 'rgba(8,6,5,0.9)'); g.addColorStop(1, 'rgba(8,6,5,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, { clamp: true });
}
function silhouetteTex() {
  return T.canvasTex('silhouette', 128, 320, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#060404';
    x.beginPath(); x.moveTo(30, h); x.lineTo(36, 120); x.quadraticCurveTo(64, 96, 92, 120); x.lineTo(98, h); x.fill();
    x.fillRect(22, 118, 8, 150); x.fillRect(98, 118, 8, 150);
    x.beginPath(); x.ellipse(64, 78, 20, 26, 0.2, 0, 7); x.fill();
    x.fillStyle = '#e8e0d0'; x.beginPath(); x.ellipse(66, 78, 15, 20, 0.2, 0, 7); x.fill();
    x.fillStyle = '#000'; x.fillRect(57, 72, 5, 3); x.fillRect(70, 72, 5, 3);
    x.strokeStyle = '#300'; x.lineWidth = 2; x.beginPath(); x.moveTo(54, 86); x.quadraticCurveTo(66, 96, 78, 86); x.stroke();
  }, { clamp: true });
}
