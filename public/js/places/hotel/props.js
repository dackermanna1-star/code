// Furniture and fittings. Each prop is authored in its own frame (origin on
// the floor at its centre, +z is its front) and placed with b = kit.at(x, y,
// z, ry). Static pieces merge into the hotel's batches; lights register
// with the light system; wardrobes and lockers become hiding places.
import * as THREE from 'three';
import { H } from './state.js';
import { M4, bake, boxGeo, cylGeo, sphereGeo, DEG } from './kit.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { HidingSpot } from './doors.js';

const at = (x, y, z, ry = 0) => H.kit.at(x, y, z, ry);
/** a world matrix for a local transform in builder b */
export const WM = (b, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => M4(x, y, z, rx, ry, rz, s).premultiply(b.m);
const rnd = (a, b) => a + Math.random() * (b - a);

// --- lights -----------------------------------------------------------------------------------------------------------
/** A wall sconce: brass plate, curved arms, two tulip shades. (ry: faces into the room) */
export function sconce(x, y, z, ry, o = {}) {
  const b = at(x, y, z, ry), M = H.M;
  b.box(0, 0, 0.06, 0.55, 1.1, 0.12, M.brass);
  for (const s of [-1, 1]) {
    b.cyl(s * 0.35, 0.05, 0.45, 0.05, 0.05, 0.9, M.brass, { rz: s * 1.0, rx: 0.4, seg: 6 });
    b.cyl(s * 0.68, 0.32, 0.8, 0.05, 0.08, 0.28, M.brass, { seg: 8 });
  }
  const fx = H.lights.add({ pos: b.W(0, 0.6, 1.1), color: o.color ?? 0xffb468, power: o.power ?? 16, range: o.range ?? 13, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.08, emergency: o.emergency ?? 0.24, broken: o.broken, halo: 1.3, room: o.room });
  for (const s of [-1, 1]) {
    H.lights.glow(fx, 'tulip', WM(b, s * 0.68, 0.72, 0.8, 0, 0, 0, 0.8), 0.75);
    H.lights.glow(fx, 'bulb', WM(b, s * 0.68, 0.62, 0.8, 0, 0, 0, 0.8), 1.4);
  }
  return fx;
}
/** A crystal chandelier hanging from the ceiling at height ceil. */
export function chandelier(x, ceil, z, o = {}) {
  const M = H.M, s = o.scale ?? 1, drop = o.drop ?? 3.5 * s, tiers = o.tiers ?? 2;
  const b = at(x, ceil - drop, z, 0);
  b.cyl(0, drop / 2, 0, 0.06, 0.06, drop, M.brass, { seg: 6 });
  b.lathe([[0, -1.2 * s], [0.25 * s, -1.0 * s], [0.4 * s, -0.4 * s], [0.18 * s, 0], [0.3 * s, 0.4 * s], [0.12 * s, 0.9 * s], [0, 1.0 * s]], 0, 0, 0, M.brass, { seg: 12 });
  const fx = H.lights.add({ pos: b.W(0, -0.5 * s, 0), color: o.color ?? 0xffc078, power: o.power ?? 70 * s, range: o.range ?? 26 * s, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.04, emergency: o.emergency ?? 0.09, halo: 3.2 * s, broken: o.broken });
  for (let t = 0; t < tiers; t++) {
    const R = (2.2 - t * 0.9) * s, n = 8 - t * 3, yy = -0.6 * s + t * 0.9 * s;
    b.torus(0, yy, 0, R, 0.05 * s, M.brass, { rx: Math.PI / 2, seg: 24 });
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, cx = Math.cos(a) * R, cz = Math.sin(a) * R;
      b.cyl(cx, yy + 0.25 * s, cz, 0.07 * s, 0.07 * s, 0.5 * s, M.porcelain, { seg: 6 });
      H.lights.glow(fx, 'flame', WM(b, cx, yy + 0.52 * s, cz, 0, 0, 0, s * 1.4), 1.2);
      H.lights.glow(fx, 'bulb', WM(b, cx, yy + 0.62 * s, cz, 0, 0, 0, s * 0.8), 1.0);
      // hanging crystals
      for (const dd of [0.3, 0.6]) b.geo(new THREE.OctahedronGeometry(0.1 * s), cx * (1 - dd * 0.15), yy - dd * s, cz * (1 - dd * 0.15), M.glass, { s: [1, 2.2, 1], cast: false });
    }
  }
  // strings of crystal drops
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; for (let j = 0; j < 4; j++) b.geo(new THREE.OctahedronGeometry(0.07 * s), Math.cos(a) * 1.4 * s, -0.9 * s - j * 0.22 * s, Math.sin(a) * 1.4 * s, M.glass, { s: [1, 1.8, 1], cast: false }); }
  return fx;
}
/** A glass bowl light on a rod (corridors, rooms). */
export function bowlLight(x, ceil, z, o = {}) {
  const M = H.M, b = at(x, ceil, z, 0), drop = o.drop ?? 1.6;
  b.cyl(0, -drop / 2, 0, 0.05, 0.05, drop, M.brass, { seg: 6 });
  b.cyl(0, -0.08, 0, 0.35, 0.35, 0.16, M.brass, { seg: 10 });
  const fx = H.lights.add({ pos: b.W(0, -drop - 0.3, 0), color: o.color ?? 0xffbc78, power: o.power ?? 26, range: o.range ?? 16, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.06, emergency: o.emergency ?? 0.17, halo: 2, broken: o.broken, room: o.room });
  H.lights.glow(fx, 'bowl', WM(b, 0, -drop, 0, Math.PI, 0, 0, 0.75), 0.8);
  H.lights.glow(fx, 'bulb', WM(b, 0, -drop - 0.15, 0), 1.6);
  b.torus(0, -drop, 0, 0.68, 0.04, M.brass, { rx: Math.PI / 2 });
  return fx;
}
/** A fluorescent tube in a metal housing (back of house, kitchen, basement). */
export function tubeLight(x, ceil, z, ry = 0, o = {}) {
  const M = H.M, b = at(x, ceil, z, ry);
  b.box(0, -0.2, 0, 4.4, 0.25, 0.7, M.steel);
  for (const s of [-1, 1]) b.cyl(s * 1.8, 0.25, 0, 0.02, 0.02, 0.6, M.iron, { seg: 4 });
  const fx = H.lights.add({ pos: b.W(0, -0.6, 0), color: o.color ?? 0xd8e8ff, power: o.power ?? 32, range: o.range ?? 20, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.12, emergency: o.emergency ?? 0, kind: 'tube', halo: 1.8, broken: o.broken, room: o.room });
  H.lights.glow(fx, 'tube', WM(b, 0, -0.42, 0.15), 1.2);
  H.lights.glow(fx, 'tube', WM(b, 0, -0.42, -0.15), 1.2);
  return fx;
}
/** A battery emergency lamp: a small red (or amber) caged bulb. */
export function emergencyLight(x, y, z, ry = 0, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0, 0.15, 0.7, 0.45, 0.3, M.iron);
  b.sphere(0, -0.05, 0.4, 0.22, M.iron, { seg: 6, s: [1, 1, 0.6] });
  const fx = H.lights.add({ pos: b.W(0, 0, 0.8), color: o.color ?? 0xff2a1a, power: o.power ?? 7, range: o.range ?? 12, circuit: 'emergency', flicker: o.flicker ?? 0.15, halo: 1.6 });
  H.lights.glow(fx, 'bulb', WM(b, 0, -0.05, 0.42, 0, 0, 0, 1.1), 1.5);
  return fx;
}
/** An EXIT sign over a door (it has its own battery). */
export function exitSign(x, y, z, ry = 0) {
  const b = at(x, y, z, ry), M = H.M;
  b.box(0, 0, 0, 2.2, 0.8, 0.3, M.iron);
  b.box(0, 0, 0.16, 2.0, 0.65, 0.02, flat(T.sign('EXIT', { style: 'exit', w: 192, h: 64 }), { emissive: 1.4 }), { uv: 'local', faces: ['pz'], cast: false });
  const fx = H.lights.add({ pos: b.W(0, -0.2, 0.6), color: 0xff2a20, power: 3, range: 8, circuit: 'emergency', flicker: 0.04, halo: 1.2 });
  return fx;
}
/** A table lamp with a drum shade; returns its fixture. */
export function tableLamp(x, y, z, o = {}) {
  const M = H.M, b = at(x, y, z, o.ry || 0);
  b.lathe([[0, 0], [0.5, 0], [0.55, 0.12], [0.3, 0.3], [0.42, 0.9], [0.3, 1.5], [0.1, 1.7], [0.06, 2.1], [0, 2.1]], 0, 0, 0, o.base || M.brass, { seg: 12 });
  const fx = H.lights.add({ pos: b.W(0, 2.6, 0), color: o.color ?? 0xffb060, power: o.power ?? 12, range: o.range ?? 11, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.05, emergency: o.emergency ?? 0, halo: 1.6, broken: o.broken, room: o.room });
  H.lights.glow(fx, 'drum', WM(b, 0, 2.7, 0, 0, 0, 0, [1, 0.9, 1]), 0.45, o.shade ?? 0xffd8a0);
  H.lights.glow(fx, 'bulb', WM(b, 0, 2.45, 0), 1.6);
  return fx;
}
/** A banker's lamp (green glass shade) for desks. */
export function bankerLamp(x, y, z, ry = 0, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.cyl(0, 0.08, 0, 0.45, 0.5, 0.16, M.brass);
  b.cyl(0, 0.6, 0, 0.05, 0.05, 1.0, M.brass, { seg: 6 });
  const fx = H.lights.add({ pos: b.W(0, 0.9, 0.3), color: 0xffd8a0, power: o.power ?? 7, range: 9, circuit: o.circuit || 'main', flicker: 0.04, emergency: 0, halo: 1, room: o.room });
  H.lights.glow(fx, 'globe', WM(b, 0, 1.15, 0, 0, 0, 0, [1.3, 0.35, 0.6]), 0.5, 0x40c070);
  H.lights.glow(fx, 'bulb', WM(b, 0, 1.0, 0, 0, 0, 0, 0.7), 1.4);
  return fx;
}
/** Candles (a candelabra) - someone keeps them lit. */
export function candles(x, y, z, o = {}) {
  const M = H.M, b = at(x, y, z, o.ry || 0), n = o.n ?? 3;
  b.lathe([[0, 0], [0.4, 0], [0.12, 0.2], [0.08, 1.1], [0, 1.1]], 0, 0, 0, M.brass, { seg: 10 });
  const fx = H.lights.add({ pos: b.W(0, 1.8, 0), color: 0xff9a40, power: o.power ?? 6, range: 9, circuit: 'battery', flicker: 0.35, halo: 1.1 });
  for (let i = 0; i < n; i++) {
    const cx = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.2;
    if (n > 1) b.box(cx / 2, 1.1, 0, Math.abs(cx) + 0.1, 0.06, 0.06, M.brass);
    b.cyl(cx, 1.4, 0, 0.08, 0.08, 0.6 - (i % 2) * 0.15, M.porcelain, { seg: 8 });
    H.lights.glow(fx, 'flame', WM(b, cx, 1.72 - (i % 2) * 0.15, 0, 0, 0, 0, 1.3), 1.5, 0xffa040);
  }
  return fx;
}

// --- bedroom ----------------------------------------------------------------------------------------------------------------
export function bed(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = o.w ?? 6, l = o.l ?? 8;
  const wood = o.wood || M.woodDark;
  // frame and legs
  b.box(0, 0.9, 0, w, 0.5, l, wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.25), 0.35, sz * (l / 2 - 0.25), 0.4, 0.7, 0.4, wood);
  // headboard with posts and a crest, footboard
  b.box(0, 2.6, -l / 2 + 0.15, w - 0.6, 3.6, 0.3, wood);
  b.box(0, 2.9, -l / 2 + 0.32, w - 1.6, 2.2, 0.06, M.velvetRed);
  b.cyl(0, 4.4, -l / 2 + 0.15, 0.9, 0.9, 0.3, wood, { rx: Math.PI / 2, seg: 16 });
  for (const sx of [-1, 1]) {
    b.lathe([[0.22, 0], [0.22, 3.6], [0.3, 3.8], [0.1, 4.3], [0.18, 4.5], [0, 4.8]], sx * (w / 2 - 0.2), 0, -l / 2 + 0.15, wood, { seg: 8 });
    b.lathe([[0.2, 0], [0.2, 2.4], [0.28, 2.55], [0.12, 2.9], [0, 3.0]], sx * (w / 2 - 0.2), 0, l / 2 - 0.15, wood, { seg: 8 });
  }
  b.box(0, 1.8, l / 2 - 0.15, w - 0.6, 1.4, 0.25, wood);
  // mattress, sheets, the bedspread draped over, pillows
  b.box(0, 1.55, 0.05, w - 0.5, 0.8, l - 0.7, M.linen);
  const messy = o.messy ? 0.25 : 0;
  b.box(0, 2.0, 0.9, w - 0.2, 0.18, l * 0.68, o.spread || M.bedspread, { ry: messy });
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.05), 1.45, 0.9, 0.1, 1.0, l * 0.68, o.spread || M.bedspread, { ry: messy * 0.5 });
  b.box(0, 1.45, l / 2 - 0.3, w - 0.2, 1.0, 0.1, o.spread || M.bedspread);
  for (const sx of [-1, 1]) b.sphere(sx * w * 0.22, 2.15, -l / 2 + 1.1, 0.5, M.linen, { s: [1.9, 0.6, 1], seg: 10, ry: messy * sx });
  if (o.solid !== false) b.solid(0, 1.2, 0, w, 2.4, l);
  return b;
}
export function nightstand(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), wood = o.wood || M.woodDark;
  b.box(0, 1.25, 0, 1.9, 2.1, 1.6, wood);
  b.box(0, 2.35, 0, 2.05, 0.12, 1.75, wood);
  b.box(0, 1.65, 0.81, 1.6, 0.6, 0.04, M.woodMid);
  b.sphere(0, 1.65, 0.88, 0.07, M.brass, { seg: 6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.8, 0.12, sz * 0.65, 0.2, 0.25, 0.2, wood);
  b.solid(0, 1.2, 0, 1.9, 2.4, 1.6);
  return b;
}
/** A louvred wardrobe you can hide in. Returns the HidingSpot. */
export function wardrobe(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), wood = o.wood || M.woodDark;
  const w = 4.6, d = 2.8, h = 8.4;
  // carcass: back, sides, top with a cornice, plinth, floor
  b.box(0, h / 2, -d / 2 + 0.1, w, h, 0.2, wood);
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.1), h / 2, 0, 0.2, h, d, wood);
  b.box(0, h - 0.1, 0, w, 0.2, d, wood);
  b.box(0, h + 0.15, 0.05, w + 0.4, 0.3, d + 0.3, wood);
  b.box(0, 0.25, 0.05, w + 0.1, 0.5, d + 0.1, wood);
  b.box(0, 0.55, 0, w - 0.4, 0.1, d - 0.4, M.woodMid);
  // inside: a rail with two coats hanging
  b.cyl(0, h - 1.0, -0.1, 0.05, 0.05, w - 0.4, M.brass, { rz: Math.PI / 2, seg: 6 });
  for (const cx of [-1.2, 1.1]) { b.box(cx, h - 3.4, -0.15, 0.25, 4.6, 1.3, M.black, { ry: rnd(-0.2, 0.2) }); b.box(cx, h - 1.3, -0.15, 0.3, 0.4, 1.5, M.black); }
  // the doors (louvred), hinged at the outer edges
  const leaves = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const hp = b.W(s * (w / 2 - 0.2), 0, d / 2);
    pivot.position.copy(hp); pivot.rotation.y = ry;
    const lw = w / 2 - 0.25, parts = [];
    const cx = -s * lw / 2;
    parts.push([boxGeo(lw, 0.6, 0.16), M4(cx, 0.9, 0)], [boxGeo(lw, 0.6, 0.16), M4(cx, h - 0.6, 0)], [boxGeo(0.4, h - 1.2, 0.16), M4(-s * 0.2, h / 2, 0)], [boxGeo(0.4, h - 1.2, 0.16), M4(-s * (lw - 0.2), h / 2, 0)]);
    parts.push([boxGeo(lw, 0.25, 0.16), M4(cx, h * 0.5, 0)]);
    for (let yy = 1.4; yy < h - 1.0; yy += 0.42) if (Math.abs(yy - h * 0.5) > 0.3) parts.push([boxGeo(lw - 0.8, 0.22, 0.06), M4(cx, yy, 0, 0.7, 0, 0)]);
    parts.push([sphereGeo(0.09, 6), M4(-s * (lw - 0.35), h * 0.5, 0.15)]);
    const mesh = new THREE.Mesh(bake(parts), wood); mesh.castShadow = true; mesh.receiveShadow = true;
    pivot.add(mesh);
    H.world.scene.add(pivot);
    leaves.push({ pivot, sign: s, base: ry });
  }
  b.solid(0, h / 2, -0.1, w, h, d - 0.2);
  const spot = new HidingSpot({
    kind: 'wardrobe', name: 'wardrobe',
    front: b.W(0, 0, d / 2 + 1.8), inside: b.W(0, 6.0, 0.45), out: b.W(0, 0, d / 2 + 2.4), yaw: ry, leaves, node: o.node, room: o.room,
  });
  return spot;
}
/** A staff locker you can squeeze into. */
export function locker(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = 2.4, d = 2.2, h = 7.8;
  const mat = o.mat || M.steel;
  b.box(0, h / 2, -d / 2 + 0.05, w, h, 0.1, mat);
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.05), h / 2, 0, 0.1, h, d, mat);
  b.box(0, h - 0.05, 0, w, 0.1, d, mat); b.box(0, 0.05, 0, w, 0.1, d, mat);
  const pivot = new THREE.Group(); pivot.position.copy(b.W(-(w / 2 - 0.05), 0, d / 2)); pivot.rotation.y = ry;
  const parts = [[boxGeo(w - 0.15, h - 0.2, 0.08), M4((w - 0.15) / 2, h / 2, 0)]];
  for (let yy = h - 1.0; yy > h - 2.6; yy -= 0.3) parts.push([boxGeo(1.2, 0.1, 0.12), M4((w - 0.15) / 2, yy, 0.03)]);
  parts.push([boxGeo(0.15, 0.6, 0.15), M4(w - 0.45, h * 0.5, 0.08)]);
  if (o.label) parts.push([boxGeo(0.8, 0.35, 0.1), M4((w - 0.15) / 2, h - 0.6, 0.04)]);
  const mesh = new THREE.Mesh(bake(parts), mat); mesh.castShadow = true; pivot.add(mesh); H.world.scene.add(pivot);
  b.solid(0, h / 2, 0, w, h, d);
  return new HidingSpot({ kind: 'locker', name: 'locker', front: b.W(0, 0, d / 2 + 1.7), inside: b.W(0, 6.05, 0.25), out: b.W(0, 0, d / 2 + 2.3), yaw: ry, leaves: [{ pivot, sign: 1, base: ry }], node: o.node, room: o.room, narrow: true });
}
export function desk(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), wood = o.wood || M.woodDark, w = o.w ?? 5, d = o.d ?? 2.6;
  b.box(0, 2.75, 0, w, 0.15, d, wood);
  for (const sx of [-1, 1]) { b.box(sx * (w / 2 - 0.7), 1.35, 0, 1.3, 2.65, d - 0.1, wood); b.box(sx * (w / 2 - 0.7), 2.2, d / 2 - 0.04, 1.1, 0.5, 0.04, M.woodMid); b.box(sx * (w / 2 - 0.7), 1.3, d / 2 - 0.04, 1.1, 0.9, 0.04, M.woodMid); b.sphere(sx * (w / 2 - 0.7), 2.2, d / 2 + 0.04, 0.06, M.brass, { seg: 6 }); }
  b.box(0, 2.45, -d / 2 + 0.1, w - 2.8, 0.5, 0.1, wood);
  b.solid(0, 1.4, 0, w, 2.8, d);
  return b;
}
export function chair(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), wood = o.wood || M.woodDark;
  if (o.fallen) { b.box(0, 0.3, 0, 1.6, 0.25, 1.6, wood, { rx: 0.1 }); b.box(0, 0.8, -1.0, 1.6, 0.2, 1.8, wood, { rx: -1.4 }); b.box(0, 0.45, 0.1, 1.5, 0.12, 1.5, o.seat || M.velvetRed); return b; }
  b.box(0, 1.6, 0, 1.6, 0.2, 1.6, wood);
  b.box(0, 1.75, 0.05, 1.45, 0.14, 1.4, o.seat || M.velvetRed);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.68, 0.75, sz * 0.68, 0.18, 1.5, 0.18, wood);
  for (const sx of [-1, 1]) b.box(sx * 0.68, 2.9, -0.7, 0.18, 2.4, 0.18, wood);
  b.box(0, 3.9, -0.7, 1.5, 0.4, 0.15, wood); b.box(0, 2.8, -0.7, 0.5, 1.6, 0.1, wood);
  if (o.solid) b.solid(0, 1.0, 0, 1.6, 2.0, 1.6);
  return b;
}
export function armchair(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), f = o.fabric || M.velvetRed, wood = M.woodDark;
  b.box(0, 1.15, 0.1, 3.0, 0.8, 2.8, f);
  b.box(0, 1.65, 0.3, 2.3, 0.35, 2.2, f);
  b.box(0, 3.3, -1.15, 3.0, 3.8, 0.6, f, { rx: -0.08 });
  for (const sx of [-1, 1]) { b.box(sx * 1.35, 2.0, 0.2, 0.45, 1.0, 2.6, f); b.box(sx * 1.35, 3.8, -0.7, 0.6, 1.8, 1.0, f, { ry: sx * 0.3 }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 1.2, 0.35, sz * 1.1 + 0.1, 0.13, 0.09, 0.7, wood, { seg: 6 });
  if (o.sheet) b.sphere(0, 2.4, 0, 2.1, M.sheet, { s: [0.85, 1.25, 0.9], seg: 10 });
  b.solid(0, 1.2, 0, 3, 2.4, 2.8);
  return b;
}
export function sofa(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), f = o.fabric || M.velvetRed, w = o.w ?? 7;
  b.box(0, 1.1, 0.1, w, 0.8, 3.0, f);
  for (let i = 0; i < 3; i++) b.box((i - 1) * (w - 1.2) / 3, 1.65, 0.3, (w - 1.3) / 3 - 0.08, 0.35, 2.3, f);
  b.box(0, 2.9, -1.2, w, 3.0, 0.6, f, { rx: -0.06 });
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.25), 2.0, 0.1, 0.5, 1.2, 3.0, f);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * (w / 2 - 0.3), 0.35, sz * 1.2 + 0.1, 0.13, 0.09, 0.7, M.woodDark, { seg: 6 });
  b.solid(0, 1.3, 0, w, 2.6, 3);
  return b;
}
export function roundTable(x, y, z, o = {}) {
  const M = H.M, b = at(x, y, z, o.ry || 0), r = o.r ?? 2.2;
  if (o.cloth) {
    b.cyl(0, 2.85, 0, r + 0.2, r + 0.2, 0.08, M.cloth, { seg: 20 });
    b.cyl(0, 1.75, 0, r + 0.2, r + 0.55, 2.2, M.cloth, { seg: 20, open: true });
  } else {
    b.cyl(0, 2.8, 0, r, r, 0.15, o.top || M.woodDark, { seg: 20 });
    b.lathe([[0, 0], [0.9, 0], [0.9, 0.15], [0.25, 0.4], [0.18, 1.8], [0.35, 2.7], [0, 2.75]], 0, 0, 0, M.woodDark, { seg: 10 });
  }
  b.solid(0, 1.4, 0, r * 1.5, 2.8, r * 1.5);
  return b;
}
export function coffeeTable(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 1.3, 0, 4, 0.18, 2.2, M.marbleBlack);
  b.box(0, 1.1, 0, 3.7, 0.22, 1.9, M.woodDark);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 1.6, 0.55, sz * 0.75, 0.1, 0.07, 1.1, M.woodDark, { seg: 6 });
  b.solid(0, 0.7, 0, 4, 1.4, 2.2);
  return b;
}
export function dresser(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = o.w ?? 4.4;
  b.box(0, 1.7, 0, w, 3.2, 1.8, M.woodDark);
  b.box(0, 3.35, 0, w + 0.15, 0.12, 1.95, M.woodDark);
  for (let r = 0; r < 3; r++) { b.box(0, 0.7 + r * 0.95, 0.92, w - 0.4, 0.75, 0.05, M.woodMid); for (const sx of [-1, 1]) b.sphere(sx * w * 0.25, 0.7 + r * 0.95, 0.98, 0.07, M.brass, { seg: 6 }); }
  if (o.mirror !== false) {
    b.box(0, 5.4, -0.75, 3.0, 3.6, 0.2, M.woodDark);
    b.box(0, 5.4, -0.63, 2.5, 3.1, 0.05, M.mirror, { faces: ['pz'] });
  }
  b.solid(0, 1.7, 0, w, 3.4, 1.8);
  return b;
}
/** A framed painting on a wall (ry faces out from the wall). */
export function painting(x, y, z, ry, w, h, tex, o = {}) {
  const M = H.M, b = at(x, y, z, ry), fw = o.frame ?? 0.4, fm = o.frameMat || M.gold;
  b.box(0, h / 2 + fw / 2, 0.12, w + fw * 2, fw, 0.24, fm); b.box(0, -h / 2 - fw / 2, 0.12, w + fw * 2, fw, 0.24, fm);
  b.box(-w / 2 - fw / 2, 0, 0.12, fw, h, 0.24, fm); b.box(w / 2 + fw / 2, 0, 0.12, fw, h, 0.24, fm);
  b.box(0, 0, 0.06, w, h, 0.06, flat(tex, { rough: 0.6 }), { uv: 'local', faces: ['pz'], cast: false, rotate: o.tilt });
  return b;
}
/** A flat decal on a wall (writing, handprints, a poster). */
export function decal(x, y, z, ry, w, h, tex, o = {}) {
  const b = at(x, y, z, ry);
  b.box(0, 0, 0.02, w, h, 0.02, flat(tex, { transparent: true, decal: true, rough: 0.9 }), { uv: 'local', faces: ['pz'], cast: false });
  return b;
}
export function rugAt(x, y, z, ry, w, l, tex) {
  const b = at(x, y, z, ry);
  b.box(0, 0.04, 0, w, 0.08, l, flat(tex, { rough: 1 }), { uv: 'local', faces: ['py'], cast: false });
}
export function radiator(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), n = o.n ?? 10;
  for (let i = 0; i < n; i++) b.box((i - (n - 1) / 2) * 0.32, 1.6, 0, 0.22, 2.6, 0.7, M.iron);
  b.box(0, 0.35, 0, n * 0.32, 0.12, 0.5, M.iron); b.box(0, 2.85, 0, n * 0.32, 0.12, 0.5, M.iron);
  for (const sx of [-1, 1]) b.cyl(sx * (n * 0.16), 0.2, 0, 0.1, 0.1, 0.4, M.iron, { seg: 6 });
}
/** An old television on legs; returns the screen mesh (its texture shows static). */
export function television(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 2.7, 0, 3.0, 2.4, 2.2, M.woodMid);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 1.2, 0.75, sz * 0.8, 0.08, 0.05, 1.5, M.woodDark, { seg: 6 });
  b.box(0.95, 2.7, 1.11, 0.8, 1.8, 0.04, M.woodDark);
  for (let i = 0; i < 2; i++) b.cyl(0.95, 3.1 - i * 0.6, 1.16, 0.12, 0.12, 0.1, M.brass, { rx: Math.PI / 2, seg: 8 });
  b.cyl(-0.3, 4.4, 0, 0.03, 0.03, 1.8, M.chrome, { rz: 0.5, seg: 4 }); b.cyl(0.3, 4.4, 0, 0.03, 0.03, 1.8, M.chrome, { rz: -0.5, seg: 4 });
  b.solid(0, 2, 0, 3, 3.9, 2.2);
  const tex = T.tvStatic();
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.45), screenMat);
  screen.position.copy(b.W(-0.42, 2.75, 1.12)); screen.rotation.y = ry;
  H.world.scene.add(screen);
  const fx = H.lights.add({ pos: b.W(-0.4, 2.8, 2.2), color: 0xa8c0ff, power: 9, range: 10, circuit: 'event', flicker: 0.4, halo: 0.6 });
  fx.on = false;
  return { screen, tex, fx, pos: b.W(-0.4, 2.7, 1.2) };
}
export function rotaryPhone(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.25, 0, 0.9, 0.5, 1.0, M.black, { rx: 0.15 });
  b.cyl(0, 0.52, 0.15, 0.3, 0.3, 0.05, M.chrome, { rx: Math.PI / 2 - 0.4, seg: 12 });
  b.box(0, 0.72, -0.15, 1.1, 0.18, 0.25, M.black); for (const sx of [-1, 1]) b.sphere(sx * 0.5, 0.7, -0.15, 0.17, M.black, { seg: 6 });
  return b.W(0, 0.4, 0);
}
export function deskClock(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.5, 0, 0.9, 1.0, 0.45, M.woodDark);
  b.cyl(0, 0.55, 0.23, 0.36, 0.36, 0.02, flat(T.clockFace(), { rough: 0.5 }), { rx: Math.PI / 2, seg: 16, cast: false });
}
export function curtains(x, y0, y1, z, ry, w, o = {}) {
  // pleated drapes either side of a window, a pelmet above
  const M = H.M, b = at(x, 0, z, ry), h = y1 - y0, mat = o.mat || M.curtain, dz = o.dz ?? 0.45;
  const cw = Math.max(1.2, w * (o.open === false ? 0.52 : 0.28));
  const g = pleat(cw, h, Math.max(4, Math.round(cw * 2.2)));
  for (const s of [-1, 1]) b.geo(g, s * (w / 2 - cw / 2), y0 + h / 2, dz, mat, { cast: true });
  b.box(0, y1 + 0.35, dz - 0.05, w + 1.2, 0.8, 0.5, o.pelmet || M.woodDark);
}
const pleatCache = new Map();
function pleat(w, h, folds) {
  const key = `${w}:${h}:${folds}`;
  if (pleatCache.has(key)) return pleatCache.get(key);
  const g = new THREE.PlaneGeometry(w, h, folds * 4, 1), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setZ(i, Math.sin((x / w + 0.5) * folds * Math.PI * 2) * 0.14); }
  g.computeVertexNormals();
  pleatCache.set(key, g);
  return g;
}
/** A window in a wall opening: frame, mullions, glass with the storm behind, rain running down, moonlight. */
export function windowAt(axis, c, a, y0, w, h, side, o = {}) {
  // axis 'x': the wall is along x at z = c, centred at x = a, room on the side 'side' (+1: +z)
  const M = H.M, ry = axis === 'x' ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
  const x = axis === 'x' ? a : c, z = axis === 'x' ? c : a;
  const b = at(x, y0, z, ry);
  b.box(0, h / 2, -0.25, w, h, 0.05, M.window, { uv: 'local', faces: ['pz'], cast: false });
  const rain = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.rain);
  rain.position.copy(b.W(0, h / 2, -0.2)); rain.rotation.y = ry; H.world.scene.add(rain);
  const fm = o.frame || M.woodDark;
  b.box(0, h + 0.15, 0, w + 0.6, 0.3, 0.6, fm); b.box(0, -0.15, 0.2, w + 0.8, 0.3, 1.0, fm);
  for (const s of [-1, 1]) b.box(s * (w / 2 + 0.15), h / 2, 0, 0.3, h, 0.6, fm);
  b.box(0, h * 0.62, -0.15, w, 0.2, 0.25, fm);
  b.box(0, h / 2, -0.15, 0.2, h, 0.25, fm);
  if (o.curtains !== false) curtains(x, y0 - 0.6, y0 + h + 0.5, z, ry, w + 2.4, { mat: o.curtainMat, dz: 0.85, open: o.open });
  const fx = H.lights.add({ pos: b.W(0, h * 0.6, 2.2), color: 0x6a88c8, power: o.power ?? 7, range: o.range ?? 14, circuit: 'window', flicker: 0, halo: 0 });
  return { fx, b, ry, x, z };
}
