// The course: the explorers' camp (the lobby) and eight halls, one after
// the other along -z, each built in its own coordinates (x across: the
// runners' way is x -11..11; the Pharaoh's gallery runs along the right,
// above a wall, x 12.6..24.5; y up from the hall's floor; z forward, negative).
//   1 The Nile Gate        the colossi, the causeway along the Nile
//   2 Avenue of the Sphinxes
//   3 The Hypostyle Hall
//   4 The Sacred Lake
//   5 The Tomb of the Scarabs
//   6 The Hall of Judgement
//   7 The Lake of Fire     (the underworld)
//   8 The Ascent of Ra     (inside the pyramid, up to the Eye of Ra)
// Each hall has three traps (traps.js) with their scarab buttons on the
// gallery, a portal at each end of the gallery, kill zones (the Nile, pits,
// lava), torches, and the route the runner bots follow.
import * as THREE from 'three';
import { Kit, V, Piece, Mover, mat, special, colorMat, boxGeo, wedgeGeo, taperGeo, cylGeo, scaleOf, quatOf, clamp, lerp, smooth, rnd } from './kit.js';
import * as A from './art.js';
import { Trap, at, seg, easeIn, easeOut, easeInOut, inBox, inColumn, inOBB } from './traps.js';
import { rng } from './paint.js';
import { lightShaft } from './fx.js';
import * as SFX from './audio.js';

export const CW = 11;          // half width of the runners' way
export const BAL = { x0: 12.6, x1: 24.5, mid: 18.5, h: 16 }; // the Pharaoh's gallery, h above the hall floor
// the sun: low in the west over the Nile (index.js lights the world with it)
export const SUN_DIR = new THREE.Vector3(-0.78, 0.36, 0.5).normalize();
const NC = { col: false };

// --- the context ---------------------------------------------------------------------------------------------------------------
function makeContext(world, FX) {
  const K = new Kit(world);
  const C = {
    world, K, FX, traps: [], halls: [], pits: [], spawns: [], updaters: [], portals: [], waters: [], lavas: [],
    sec: 0, time: () => world.time,
    hall: null,
    every(fn) { C.updaters.push(fn); },
    shake() {}, // (pos, strength): the game shakes the camera when it's near

  };
  return C;
}

/** Start building hall i at world origin (x, y, z). */
function beginHall(C, i, def, O) {
  C.sec = i; C.K.at(O.x, O.y, O.z);
  const h = { i, ...def, O: O.clone(), route: [], buttons: [], traps: [], start: null, end: null, balY: def.balY ?? BAL.h };
  C.halls[i] = h; C.hall = h;
  return h;
}

/** A route builder for the runner bots (local coordinates in, world out). */
function routeOf(C) {
  const h = C.hall, K = C.K;
  return {
    walk(x, y, z, o = {}) { h.route.push({ type: 'walk', p: K.W(x, y, z), ...o }); return this; },
    jump(from, to, o = {}) { h.route.push({ type: 'jump', from: K.W(...from), p: K.W(...to), ...o }); return this; },
    gate(trap, o = {}) { h.route.push({ type: 'gate', trap, p: trap.waitW, ...o }); return this; },
  };
}

/** A kill zone (a pit, the river, lava): fn(local p, feet) -> cause | null, for this hall. */
function pit(C, fn) { const O = C.K.o.clone(), sec = C.sec; C.pits.push({ sec, O, fn }); }

/** The wall between the runners and the gallery, the gallery itself (floor, back wall), torches on it. */
function gallery(C, z0, z1, o = {}) {
  const K = C.K, h = C.hall, y = h.balY;
  const lo = o.lo ?? -2, len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  // the wall (carved on the runners' side)
  if (o.wall !== false) {
    K.box(11.8, (lo + y + 3.2) / 2, zc, 1.6, y + 3.2 - lo, len, o.wall || 'glyphs');
    K.box(11.8, y + 3.6, zc, 2.2, 0.8, len, 'ashlarPale', NC);
  }
  // the floor of the gallery and what holds it up
  K.box((BAL.x0 + BAL.x1) / 2 + 0.4, y - 0.75, zc, BAL.x1 - BAL.x0 + 0.8, 1.5, len, o.floor || 'floor');
  if (o.fill !== false) K.box((BAL.x0 + 26) / 2, (lo + y - 1.5) / 2, zc, 26 - BAL.x0, y - 1.5 - lo, len, 'ashlar', NC);
  // the back wall
  K.box(25.25, y + (o.backH ?? 12) / 2, zc, 1.5, o.backH ?? 12, len, o.back || 'glyphsPaint');
  if (o.roof) K.box((BAL.x0 + 26) / 2, y + (o.backH ?? 12) + 0.6, zc, 26 - BAL.x0 + 2, 1.2, len, 'stars', NC);
  // walls across its ends
  if (o.caps !== false) for (const ze of [z0, z1]) K.box((BAL.x0 + 26) / 2, y + (o.backH ?? 12) / 2, ze, 26 - BAL.x0, o.backH ?? 12, 1, 'ashlar');
  // torches along the back wall
  if (o.torches !== false) for (let z = Math.max(z0, z1) - 12; z > Math.min(z0, z1) + 6; z -= o.torchStep ?? 28) A.torch(K, C.FX, 24.4, y + 5, z, -Math.PI / 2, { intensity: 45, range: 30 });
  h.balcony = { z0, z1, y };
}

/** A scarab button for a trap on the gallery (local z), and the trap's link to it. */
function button(C, trap, z, o = {}) {
  const h = C.hall, K = C.K, x = o.x ?? BAL.mid, rot = o.rot ?? -Math.PI / 2;
  const pos = K.W(x - Math.sin(rot) * 2.4, h.balY, z - Math.cos(rot) * 2.4);
  const b = A.scarabButton(C.world, pos, rot);
  trap.button = b; trap.buttonPos = K.W(x, h.balY, z);
  h.buttons.push(trap);
  b.arm(true);
  // a little plaque on the wall behind it with the trap's name
  return b;
}

/** The portals at the ends of a gallery (to the previous and the next hall). */
function portals(C, zStart, zEnd) {
  const h = C.hall, K = C.K;
  if (h.i > 0) { const p = A.portal(K, BAL.mid, h.balY, zStart, 0, 0xffb040); C.portals.push({ hall: h.i, dir: -1, ...p, at: K.W(BAL.mid, h.balY, zStart) }); }
  const p = A.portal(K, BAL.mid, h.balY, zEnd, 0, 0x60c0ff);
  C.portals.push({ hall: h.i, dir: 1, ...p, at: K.W(BAL.mid, h.balY, zEnd) });
  h.galleryStart = K.W(BAL.mid, h.balY, zStart - 7);
  h.galleryEnd = K.W(BAL.mid, h.balY, zEnd + 7);
}

/** Water: a big plane at local height y over a rectangle (and the kill zone under it if `kill`). */
function water(C, x0, x1, z0, z1, y, o = {}) {
  const m = waterMaterial(o.color ?? 0x2f6f6a, o);
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(C.K.W((x0 + x1) / 2, y, (z0 + z1) / 2));
  mesh.receiveShadow = true;
  C.world.scene.add(mesh);
  const w = { mesh, y, base: y, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), O: C.K.o.clone() };
  C.waters.push(w);
  return w;
}
let _waterN = null;
function waterNormals() {
  if (_waterN) return _waterN;
  const N = 256, hgt = new Float32Array(N * N), r = rng(41);
  const waves = Array.from({ length: 14 }, () => [Math.floor(r() * 6) + 1, Math.floor(r() * 6) - 3, r() * 6.28, 0.3 + r()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const [kx, ky, ph, a] of waves) v += Math.sin(((x * kx + y * ky) / N) * Math.PI * 2 + ph) * a / Math.hypot(kx, ky); hgt[y * N + x] = v; }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const dx = hgt[y * N + ((xx + 1) % N)] - hgt[y * N + ((xx + N - 1) % N)], dy = hgt[((y + 1) % N) * N + xx] - hgt[((y + N - 1) % N) * N + xx];
    const nx = -dx * 2.2, ny = -dy * 2.2, l = Math.hypot(nx, ny, 1), i = (y * N + xx) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  _waterN = new THREE.CanvasTexture(c); _waterN.wrapS = _waterN.wrapT = THREE.RepeatWrapping; _waterN.colorSpace = THREE.NoColorSpace;
  return _waterN;
}
const WATER_MATS = [];
export function waterMaterial(color, o = {}) {
  const n = waterNormals().clone(); n.needsUpdate = true;
  n.repeat.set(o.repeat ?? 24, o.repeat ?? 24);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.15, transparent: true, opacity: o.opacity ?? 0.86, normalMap: n, normalScale: new THREE.Vector2(0.5, 0.5), depthWrite: false });
  m.userData.flow = o.flow ?? 1;
  WATER_MATS.push(m);
  return m;
}
export function waterMaterials() { return WATER_MATS; }
export function updateWater(t) { for (const m of WATER_MATS) m.normalMap.offset.set(t * 0.012 * m.userData.flow, t * 0.008 * m.userData.flow); }

/** Lava: a glowing plane (it scrolls slowly). */
function lava(C, x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.abs(x1 - x0) / 40, uv.getY(i) * Math.abs(z1 - z0) / 40);
  const mesh = new THREE.Mesh(g, special('lava'));
  mesh.position.copy(C.K.W((x0 + x1) / 2, y, (z0 + z1) / 2));
  C.world.scene.add(mesh);
  C.lavas.push(mesh);
  return mesh;
}

// --- moving pieces ------------------------------------------------------------------------------------------------------------------
/** A Mover at local position (x, y, z) of the current hall. */
function mover(C, piece, x, y, z, quat = null) { return new Mover(C.world, piece, C.K.W(x, y, z), quat); }
const Q = (ax, ay, az, deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ax, ay, az).normalize(), deg * Math.PI / 180);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _qq = new THREE.Quaternion();

// --- the lobby: the explorers' camp at the oasis ------------------------------------------------------------------------------------------
function buildCamp(C) {
  const K = C.K; K.at(0, 0, 0);
  // the ground: a big sand floor (with a hole for the pool), an invisible fence
  for (const [x0, x1, z0, z1] of [[-75, 75, 35, 92], [-75, 75, 128, 165], [-75, -46, 92, 128], [-14, 75, 92, 128]]) K.span(x0, -2, z0, x1, 0, z1, 'sand');
  for (const [x, z, sx, sz] of [[-76, 100, 2, 140], [76, 100, 2, 140], [0, 168, 152, 2], [0, 34, 152, 2]]) K.col(x, 10, z, sx, 24, sz);
  // the oasis: a pool among palms
  const pool = water(C, -46, -14, 92, 128, -0.7, { color: 0x2d8a86, repeat: 6, opacity: 0.82 });
  pool.camp = true;
  K.span(-46, -4, 92, -14, -3, 128, 'sand');
  for (const [x0, x1, z0, z1] of [[-47, -13, 91, 92.6], [-47, -13, 127.4, 129], [-47, -45.4, 92, 128], [-14.6, -13, 92, 128]]) K.span(x0, -3, z0, x1, 0.25, z1, 'ashlarPale');
  for (const [x0, x1, z0, z1] of [[-56, -4, 82, 91], [-56, -4, 129, 138], [-56, -47, 91, 129], [-13, -4, 91, 129]]) K.span(x0, -0.2, z0, x1, 0.08, z1, 'grass', NC);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; A.palm(K, -30 + Math.cos(a) * 21, 0, 110 + Math.sin(a) * 23, 16 + (i % 4) * 3, i + 3); }
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3; A.reeds(K, -30 + Math.cos(a) * 15, 0, 110 + Math.sin(a) * 17, 0.7, a); }
  // tents (striped linen over poles), crates, a campfire, the expedition flag
  for (const [x, z, r] of [[22, 120, 0.3], [44, 104, -0.4], [30, 82, 0.9], [-8, 146, 0]]) {
    const S = A.sub(K, x, 0, z, r, 1);
    S.taper(0, 4.5, 0, 14, 10, 0.4, 10, 9, 'tent', NC);
    S.box(0, 4.5, 0, 12, 9, 8, 'tent', { draw: false });
    S.cyl(0, 5, 5.2, 0.2, 10, 'wood', NC); S.cyl(0, 5, -5.2, 0.2, 10, 'wood', NC);
    S.box(0, 4.2, 5.05, 4, 8, 0.1, colorMat(0x2a1a10, 1), NC);
  }
  for (const [x, z] of [[12, 96], [14, 99], [10, 100], [36, 136], [38, 133], [-12, 72]]) A.chest(K, x, 0, z, (x * 7) % 3);
  A.brazier(K, C.FX, 4, 0, 112, { h: 1.2, size: 2.4 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.box(4 + Math.cos(a) * 4, 0.6, 112 + Math.sin(a) * 4, 2.2, 1.2, 1, 'wood', { rot: [0, -a * 57.3, 0] }); }
  K.cyl(56, 9, 70, 0.3, 18, 'wood', NC); K.box(58.8, 16, 70, 5.4, 3, 0.1, 'red', NC);
  // jars, an excavation pit with a ladder, a sphinx being dug out of the sand
  for (let i = 0; i < 8; i++) A.jar(K, -62 + (i % 4) * 2.3, 0, 60 + Math.floor(i / 4) * 2.5, 1 + (i % 3) * 0.2);
  A.sphinx(K, 46, -2.5, 52, Math.PI * 0.85, 1.6, 'man', { plinth: false });
  K.box(46, 0.2, 52, 30, 0.4, 24, 'dune', NC);
  A.obelisk(K, -56, 0, 148, 30, 3.2);
  // the hall of fame and the volunteer altar (filled in by the game)
  A.anubis(K, 0, 0, 160, Math.PI, 18);
  C.campCentre = V(0, 0, 100);
  for (let i = 0; i < 12; i++) C.spawns.push({ camp: true, pos: V(-16 + (i % 6) * 6.4, 0.2, 78 + Math.floor(i / 6) * 8), yaw: 0 });
}

// --- 1. the Nile Gate -----------------------------------------------------------------------------------------------------------------
function hall1(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z); // (W: for things done later, when the kit has moved on)
  const h = beginHall(C, 0, { name: 'The Nile Gate', sub: 'First Hall', look: 'day', L: 240 }, O);
  const R = routeOf(C);
  // the yard where the runners wait for the gates to open
  K.box(-2.5, -1, -17, 27, 2, 40, 'floor');
  K.box(-3, 7, 2, 30, 18, 2, 'glyphs');
  K.box(-17, 7, -17, 2, 18, 40, 'glyphs');
  for (const z of [-6, -30]) for (const x of [-15]) A.brazier(K, FX, x + 2, 0, z, { h: 4 });
  for (let i = 0; i < 12; i++) C.spawns.push({ hall: 0, pos: K.W(-12 + (i % 4) * 6.5, 0.2, -8 - Math.floor(i / 4) * 7), yaw: 0 });
  // the cliff, its carved facade, the colossi, the gate
  K.span(-130, -20, -60, -11, 56, -37, 'rock'); K.span(26, -20, -60, 96, 56, -37, 'rock');
  K.span(-11, 26, -60, 12.6, 56, -37, 'rock'); K.span(12.6, 30, -60, 26, 56, -37, 'rock');
  for (let i = 0; i < 9; i++) K.box(-120 + i * 27, 56 + (i % 3) * 5, -50 - (i % 2) * 6, 26, 10 + (i % 4) * 4, 22, 'rock', { ...NC, rot: [0, i * 13, (i % 2) * 6] });
  crags(K, -130, -37, -64, -37, () => [-4, 52], 22, 11);
  crags(K, -130, -38, -130, -60, () => [-8, 52], 8, 12);
  crags(K, 64, -37, 96, -37, () => [-2, 52], 10, 13);
  crags(K, 96, -38, 96, -60, () => [-2, 52], 6, 14);
  for (const [x0, x1, y0] of [[-64, -11, 0], [26, 64, 0], [-11, 12.6, 26], [12.6, 26, 30]]) K.span(x0, y0, -37.2, x1, 56, -36, 'ashlarPale');
  K.span(-66, 56, -38, 66, 57.4, -35.2, 'ashlarPale', NC);
  K.span(-66, 57.4, -38.4, 66, 58.6, -34.6, 'lapis', NC);
  for (let i = 0; i < 18; i++) { const bx = -60 + i * 7.06; K.box(bx, 60, -36.6, 2.2, 2.8, 2.4, 'ashlarPale', NC); K.box(bx, 62.1, -36.0, 1.6, 1.5, 1.6, 'ashlarPale', NC); }
  for (const x of [-28, -51, 39, 62]) A.colossus(K, x, 0, -24, 0, 46, { painted: false });
  // the carved facade: a niche with the sun over the gate, a frieze, cartouches
  K.box(0, 38, -35.7, 10, 14, 0.6, 'ashlarDark', NC);
  K.cyl(0, 41, -35.2, 3.4, 0.6, 'gold', { ...NC, rot: [90, 0, 0] });
  for (const sx of [-1, 1]) K.box(sx * 8, 41.6, -35.3, 10, 1.6, 0.3, 'lapis', NC);
  K.relief(-40, 49, -35.9, 40, 10, 0, 2); K.relief(42, 49, -35.9, 40, 10, 0, 1);
  K.relief(0, 30.5, -35.9, 22, 8, 0, 0);
  // the gate: two granite leaves on hinges, opened by the round (not a trap)
  const leaves = [];
  for (const s of [-1, 1]) {
    const P = new Piece();
    P.box(-s * 5.5, 13, 0, 11, 26, 1.6, 'granite');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) P.box(-s * (2.8 + c * 5.4), 4 + r * 6, 0.9, 1, 1, 0.3, 'gold', { col: false });
    P.box(-s * 5.5, 13, 0.85, 1.6, 22, 0.2, 'gold', { col: false });
    leaves.push({ m: mover(C, P, s * 11, 0, -37), s });
  }
  h.gate = {
    leaves, k: 0, open: false,
    set(k) { this.k = k; for (const L of leaves) L.m.set(L.m.home.pos, Q(0, 1, 0, -L.s * 100 * easeInOut(k)), 1 / 60); },
  };
  // the tunnel through the cliff
  K.box(0, -1, -48, 22, 2, 24, 'floor');
  K.box(-11.6, 13, -48, 1.2, 26, 24, 'glyphsDark');
  K.box(0, 26.5, -48, 22, 1, 24, 'stars', NC);
  for (const z of [-42, -54]) { A.torch(K, FX, -10.9, 6, z, Math.PI / 2); A.torch(K, FX, 10.9, 6, z, -Math.PI / 2); }
  R.walk(0, 0, -34, { r: 2 }).walk(0, 0, -62);
  // the causeway along the Nile
  const zA = -60, zB = -240;
  for (const [a, b] of [[zA, -78], [-118, zB]]) {
    K.box(0, -1, (a + b) / 2, 22, 2, Math.abs(b - a), 'floor');
    K.box(0, -7, (a + b) / 2, 22, 10, Math.abs(b - a), 'ashlar');
  }
  for (let z = zA - 6; z > zB; z -= 12) { K.box(-10.5, 0.5, z, 1, 1, 1, 'ashlarPale', NC); }
  // under the causeway: the Nile, its reeds and its crocodiles
  water(C, -420, 11, 3000, -690, -9, { color: 0x2c6a62, repeat: 160, flow: 1.4 });
  K.span(-420, -17, 3000, 11, -15, -690, colorMat(0x3a3020, 1), NC);
  for (let z = -66; z > -236; z -= 9) A.reeds(K, -14 - (z % 3), -10, z, 0.8 + (z % 5) * 0.06, z);
  for (const [x, z, r] of [[-60, -120, 0.4], [-110, -200, -0.3], [-80, -330, 2.6], [-150, -420, 0.1]]) A.felucca(K, x, -9.4, z, r, 1.3);
  pit(C, (p) => (p.y - 3 < -6.5 && p.x < 11 ? 'nile' : null));
  // the west bank across the river: palms, the pyramids of Giza on the horizon
  for (let i = 0; i < 30; i++) A.palm(K, -430 - (i % 5) * 18, -2, -60 - i * 30, 18 + (i % 3) * 5, i + 40, { col: false });
  A.pyramid(K, -1100, -2, -500, 460, 290, { far: true });
  A.pyramid(K, -1150, -2, -980, 420, 270, { far: true });
  A.pyramid(K, -1000, -2, -1300, 220, 140, { far: true });
  // behind the gallery: the cliffs
  for (let z = -60; z > -460; z -= 50) A.cliff(K, 70, 0, z - 25, 90, 52 + ((z / 50) % 3) * 8, 50, { col: false });

  // ---- trap 1: the collapsing causeway (slabs fall into the Nile, rise again)
  const slabs = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    const P = new Piece();
    P.box(0, -1, 0, 10.9, 2, 9.9, 'floor');
    P.box(0, -4, 0, 10.9, 4, 9.9, 'ashlar', { col: false });
    slabs.push({ m: mover(C, P, c ? 5.5 : -5.5, 0, -83 - r * 10), r, c });
  }
  for (let i = 0; i < 6; i++) crocHead(C, -8 + (i % 3) * 7, -9.2, -84 - Math.floor(i / 3) * 18, (i * 1.7) % 6);
  const t1 = new Trap(C, {
    id: 'causeway', name: 'Collapsing Causeway', duration: 7, zone: { x0: -11, x1: 11, z0: -118, z1: -78 }, wait: [0, 0, -70],
    run(k, dt) {
      for (const s of slabs) {
        // they shake, then go one row after another from the near end (the far end gives you a chance)
        const t0 = 0.45 + s.r * 0.3 + s.c * 0.08;
        const fall = seg(k, t0, t0 + 0.9), back = seg(k, 4.8, 6.6);
        const d = easeIn(fall) * 16 * (1 - easeInOut(back));
        _v.copy(s.m.home.pos); _v.y -= d;
        if (k < t0) _v.x += Math.sin(k * 70 + s.r * 3 + s.c) * 0.08;
        s.m.set(_v, Q(1, 0, s.c ? 1 : -1, 22 * fall * (1 - back)), dt);
      }
      at(this, k, 0.9, () => { SFX.splash(W(0, -9, -92), 1.4); C.FX.dust.puff(W(0, -8, -98), 0xe8f4f0, 30, 3, 14, 1.4, 6); });
      at(this, k, 4.8, () => SFX.grind(W(0, 0, -98), 1.8, 0.6));
    },
    onReset() { for (const s of slabs) s.m.reset(); },
    sfx() { SFX.grind(W(0, 0, -98), 2.2, 0.8); },
    when: (k) => k > 6.8,
  });
  button(C, t1, -98);
  R.gate(t1).walk(0, 0, -122);

  // ---- trap 2: the toppling obelisk
  K.box(7, 1.5, -148, 7, 3, 7, 'granite');
  K.box(7, 3.2, -148, 6.4, 0.4, 6.4, 'gold', NC);
  const obP = new Piece();
  const obH = 42, obW = 5;
  {
    const shaft = new THREE.Mesh(boxTaper(obW, obW, obW * 0.72, obW * 0.72, obH * 0.92), mat('glyphsGranite'));
    shaft.position.set(obW / 2, obH * 0.46, 0); shaft.castShadow = true; obP.group.add(shaft);
    const cap = new THREE.Mesh(boxTaper(obW * 0.72, obW * 0.72, 0.02, 0.02, obH * 0.08, 2), mat('gold'));
    cap.position.set(obW / 2, obH * 0.96, 0); cap.castShadow = true; obP.group.add(cap);
    obP.box(obW / 2, obH / 2, 0, obW, obH, obW, 'granite', { draw: false });
  }
  const ob = mover(C, obP, 7 - obW / 2, 3.4, -148);
  const t2 = new Trap(C, {
    id: 'obelisk', name: 'Toppling Obelisk', duration: 5, zone: { x0: -11, x1: 11, z0: -152, z1: -144 }, wait: [-6, 0, -134],
    run(k, dt) {
      const fall = easeIn(seg(k, 0, 1.0)), off = seg(k, 2.2, 3.8);
      const ang = 92 * fall + 40 * easeIn(off);
      _v.copy(ob.home.pos); _v.x -= 40 * easeIn(off); _v.y -= 26 * easeIn(off);
      ob.set(_v, Q(0, 0, 1, ang), dt);
      if (k > 4.2) ob.visible(false);
      at(this, k, 1.0, () => { SFX.slam(W(-12, 0, -148), 1.2); C.shake(W(-12, 0, -148), 0.6); C.FX.dust.puff(W(-8, 1, -148), 0xc9a878, 40, 4, 16, 1.6, 2); });
      at(this, k, 2.6, () => SFX.splash(W(-30, -9, -148), 1.6));
    },
    lethal(p) {
      if (this.k > 3.4) return null;
      // the shaft as an oriented box: from the pivot, along its rotated up-axis
      const q = ob.quat, c = _v2.set(obW / 2, obH / 2, 0).applyQuaternion(q).add(ob.pos).sub(this.O);
      return inOBB(p, c, _v.set(obW / 2, obH / 2, obW / 2), q, 0.6) && this.k > 0.25 ? 'obelisk' : null;
    },
    onReset() { ob.reset(); },
    sfx() { SFX.grind(W(7, 3, -148), 1.1, 0.8); },
    when: (k) => k > 1.2,
  });
  button(C, t2, -148);
  R.gate(t2).walk(-6, 0, -156);

  // ---- trap 3: the sand geysers
  const vents = [];
  for (const z of [-178, -200]) for (const x of [-7, 0, 7]) {
    K.cyl(x, -0.02, z, 2.4, 0.1, 'bronze', { ...NC, seg: 16 });
    for (let i = 0; i < 4; i++) K.box(x, 0.02, z - 1.5 + i, 4.2, 0.08, 0.25, 'black', NC);
    vents.push({ x, z, col: sandColumn(C, K.W(x, 0, z)) });
  }
  const t3 = new Trap(C, {
    id: 'geysers', name: 'Sand Geysers', duration: 4.8, zone: { x0: -11, x1: 11, z0: -204, z1: -174 }, wait: [0, 0, -166], hide: [[0, 0, -189]],
    run(k) {
      for (const v of vents) {
        v.col.set(k < 0.9 ? 0.12 + 0.06 * Math.sin(k * 40) : k < 1.1 ? (k - 0.9) / 0.2 : k < 4.1 ? 1 : 1 - seg(k, 4.1, 4.7));
        if (k < 0.9 && Math.random() < 0.4) C.FX.dust.puff(W(v.x + rnd(-1.5, 1.5), 0.3, v.z + rnd(-1.5, 1.5)), 0xd9b27a, 2, 1.5, 4, 0.7, 2);
      }
    },
    lethal(p, ch, k) { if (k < 0.95 || k > 4.3) return null; for (const v of vents) if (inColumn(p, v.x, v.z, 3.4, -1, 28)) return 'geyser'; return null; },
    onReset() { for (const v of vents) v.col.set(0); },
    sfx() { SFX.sand(W(0, 0, -189), 4); },
    when: (k) => k > 4.5,
  });
  button(C, t3, -189);
  R.gate(t3).walk(0, 0, -238);
  gallery(C, 3, -238, { lo: -12, back: 'glyphs' });
  portals(C, -4, -232);
  h.start = K.W(0, 0, -20); h.end = K.W(0, 0, -240);
  return h;
}

// --- shared trap furniture -------------------------------------------------------------------------------------------------------------
/** A tapered box geometry (bottom sx x sz centred on y = 0 .. h? no: centred), for movers. */
function boxTaper(sx, sz, tx, tz, h, scale = 6) {
  const g = boxGeo(sx, h, sz, scale), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * tx / sx); p.setZ(i, p.getZ(i) * tz / sz); }
  g.computeVertexNormals();
  return g;
}
/** A crocodile's head poking out of the water, jaws opening and shutting now and then. */
function crocHead(C, x, y, z, ph) {
  const P = new Piece();
  P.box(0, 0, 0, 2.6, 1.2, 3, 'croc', { col: false });
  P.box(0, -0.1, 2.6, 1.8, 0.6, 3.4, 'croc', { col: false });
  for (const sx of [-0.7, 0.7]) P.ball(sx, 0.7, 0.6, 0.35, 'croc');
  for (const sx of [-0.7, 0.7]) P.ball(sx, 0.85, 0.75, 0.15, 'eyeGlow');
  const jaw = new THREE.Group(); jaw.position.set(0, -0.4, 1); P.group.add(jaw);
  const jm = new THREE.Mesh(boxGeo(1.7, 0.4, 3.2), mat('croc')); jm.position.set(0, 0, 1.6); jaw.add(jm);
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(boxGeo(0.12, 0.3, 0.12), mat('teeth')); t.position.set((i % 2 ? 0.75 : -0.75), 0.25, 0.4 + i * 0.45); jaw.add(t); }
  const m = mover(C, P, x, y, z, Q(0, 1, 0, (ph * 60) % 360));
  C.every((t) => { const k = Math.max(0, Math.sin(t * 0.9 + ph)); jaw.rotation.x = k * 0.5; m.group.position.y = m.home.pos.y + Math.sin(t * 0.7 + ph) * 0.25; });
}
/** A column of sand blasting up from a vent (set(0..1) for its strength). */
function sandColumn(C, pos) {
  const g = new THREE.CylinderGeometry(2.2, 3.4, 26, 16, 6, true); g.translate(0, 13, 0);
  const m = new THREE.MeshStandardMaterial({ color: 0xd9b27a, transparent: true, opacity: 0, roughness: 1, depthWrite: false, side: THREE.DoubleSide, emissive: 0x3a2a10 });
  const mesh = new THREE.Mesh(g, m); mesh.position.copy(pos); mesh.visible = false;
  C.world.scene.add(mesh);
  const parts = C.FX.dust ? C.FX.dust : null;
  let k = 0;
  C.every((t) => {
    if (k <= 0) { mesh.visible = false; return; }
    mesh.visible = true; m.opacity = 0.75 * k; mesh.scale.set(0.8 + 0.2 * Math.sin(t * 30), 0.3 + 0.7 * k, 0.8 + 0.2 * Math.cos(t * 27));
    mesh.rotation.y = t * 5;
    if (parts && Math.random() < k * 0.8) parts.puff(pos.clone().add(V((Math.random() - 0.5) * 3, Math.random() * 22 * k, (Math.random() - 0.5) * 3)), 0xd9b27a, 4, 2.5);
  });
  return { set(v) { k = v; } };
}

// --- more shared pieces ------------------------------------------------------------------------------------------------------------------------
/** UVs in studs from the positions, projected along each face's main axis. */
function planarUV(g, scale) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
  }
  return g;
}
/** A block whose bottom and top slope along z (a wall beside a ramp): yb0..yt0 at z0, yb1..yt1 at z1. It collides as the box around it. */
function shearBox(C, x0, x1, z0, z1, yb0, yt0, yb1, yt1, m, o = {}) {
  const mm = typeof m === 'string' ? mat(m) : m;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.abs(x1 - x0), sz = Math.abs(z1 - z0);
  const g = new THREE.BoxGeometry(sx, 1, sz), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (cz + p.getZ(i) - z0) / (z1 - z0);
    p.setY(i, p.getY(i) > 0 ? yt0 + (yt1 - yt0) * u : yb0 + (yb1 - yb0) * u);
  }
  planarUV(g, scaleOf(mm));
  C.K.geo(g, mm, cx, 0, cz, null, o);
  if (o.col !== false) { const lo = Math.min(yb0, yb1), hi = Math.max(yt0, yt1); C.K.col(cx, (lo + hi) / 2, cz, sx, hi - lo, sz); }
}
/** A dune: a low dome of sand (UVs from the ground plan, so the sand keeps its scale). */
function dune(K, x, y, z, rx, ry, rz, rot = 0) {
  const g = new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(rx, ry, rz); g.rotateY(rot);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + x) / 40, (p.getZ(i) + z) / 40);
  K.geo(g, 'dune', x, y, z, null, { noShadow: true });
}
/** Is the body of (local) p within r of the centre c? sx < 1 squeezes the distance across: a boulder that fills the way. */
function nearBall(p, c, r, sx = 1) {
  for (const dy of [-2.2, 0, 1.8]) if (Math.hypot((p.x - c.x) * sx, p.y + dy - c.y, p.z - c.z) < r) return true;
  return false;
}
/** Broken rock along a line (a cliff's ragged edge): n blocks from (x0, z0) to (x1, z1), between the heights ys(z) = [lo, hi]. */
function crags(K, x0, z0, x1, z1, ys, n, seed, m = 'rock') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const t = (i + r() * 0.8) / n, x = x0 + (x1 - x0) * t + (r() - 0.5) * 3, z = z0 + (z1 - z0) * t + (r() - 0.5) * 3, [lo, hi] = ys(z);
    K.box(x, lo + r() * (hi - lo), z, 6 + r() * 12, 4 + r() * 11, 5 + r() * 9, m, { col: false, rot: [(r() - 0.5) * 34, r() * 180, (r() - 0.5) * 34] });
  }
}
const JET_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vUv = uv; vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const JET_FS = `uniform float t, k; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  void main(){
    float a = vUv.y;
    vec3 q = vec3(vP.x * 0.55, vP.y * 0.32 - t * 7.0, vP.z * 0.55);
    float n = n3(q) * 0.6 + n3(q * 2.1 + 3.1) * 0.4;
    float edge = pow(abs(dot(vN, vV)), 1.2);
    float body = smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.5 + n * 0.4, 1.0, a));
    float heat = clamp(edge * (0.55 + n * 0.85) - a * 0.4, 0.0, 1.0);
    vec3 c = mix(vec3(0.85, 0.1, 0.02), vec3(1.0, 0.5, 0.1), smoothstep(0.12, 0.55, heat));
    c = mix(c, vec3(1.0, 0.86, 0.5), smoothstep(0.62, 0.95, heat));
    gl_FragColor = vec4(c * 1.7, k * body * (0.2 + heat) * 0.9);
  }`;
/** A jet of fire from `from` along `dir` (a unit vector): set(0..1) for its strength. */
function flameJet(C, from, dir, len, o = {}) {
  const g = new THREE.CylinderGeometry(o.r1 ?? 4.4, o.r0 ?? 0.8, len, 24, 8, true); g.translate(0, len / 2, 0);
  const m = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, k: { value: 0 } }, vertexShader: JET_VS, fragmentShader: JET_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(from); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir); mesh.visible = false; mesh.renderOrder = 6;
  C.world.scene.add(mesh);
  const L = C.FX.lights.add(from.clone().addScaledVector(dir, len * 0.45), 0xff7a30, 0, 46, 1); L.on = false;
  let v = 0;
  const p = V();
  C.every((t) => {
    mesh.visible = v > 0.01; L.on = v > 0.05;
    if (!mesh.visible) return;
    m.uniforms.t.value = t; m.uniforms.k.value = v * (o.gain ?? 1);
    L.intensity = 160 * v;
    mesh.scale.set(1, 0.25 + 0.75 * v, 1);
    if (Math.random() < v * 1.5) {
      p.copy(from).addScaledVector(dir, Math.random() * len * 0.9);
      C.FX.glow.emit(p, { x: dir.x * 22 + rnd(-4, 4), y: dir.y * 22 + rnd(0, 7), z: dir.z * 22 + rnd(-4, 4) }, Math.random() < 0.5 ? 0xffb040 : 0xff5a10, rnd(0.8, 1.8), rnd(0.25, 0.55), -8);
    }
  });
  return { set(k) { v = k; }, mesh };
}
let _khopesh = null;
/** A khopesh blade: a crescent hanging from (0, 0), its edge down to y -3, its tips at x +-4.75 (in the xy plane). */
function khopeshGeo() {
  if (_khopesh) return _khopesh;
  const s = new THREE.Shape();
  const arc = (cx, cy, r, a0, a1, n, first) => {
    for (let i = 0; i <= n; i++) {
      const a = (a0 + ((a1 - a0) * i) / n) * Math.PI / 180, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (first && i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
  };
  arc(0, 3.2, 6.2, 220, 320, 16, true);
  arc(0, 4.9, 5.8, 315, 225, 14, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -0.18);
  return (_khopesh = g);
}

// --- the desert around it all ------------------------------------------------------------------------------------------------------------------
function desert(C) {
  const K = C.K; K.at(0, 0, 0);
  const D = (x0, x1, z0, z1, top = -0.1) => K.span(x0, -22, z0, x1, top, z1, 'dune', { noShadow: true });
  // the east bank, where the camp and the temple stand (its edge drops to the Nile at x -80)
  D(-80, 3000, 165, 3000);
  D(-80, -75, 35, 165);
  D(75, 3000, 35, 165);
  D(-80, 3000, -37, 35);
  D(26, 3000, -37, -690);
  // north of the temple the ground rises to a plateau (the tombs are cut down into it; the river keeps to the west)
  D(26, 3000, -690, -920, 12);
  K.span(-110, -22, -690, -99, 12, -3000, 'dune', { noShadow: true });
  for (const [x0, x1, z0, z1] of [[-99, -8, -920, -952], [8, 3000, -920, -952], [-99, 3000, -952, -1600], [-99, -14, -1600, -1830], [27, 3000, -1600, -1830], [-99, 3000, -1830, -3000]]) K.span(x0, 8, z0, x1, 12, z1, 'dune', { noShadow: true, col: false });
  water(C, -420, -110, -690, -3000, -9, { color: 0x2c6a62, repeat: 120, flow: 1.4 });
  K.span(-420, -17, -690, -110, -15, -3000, colorMat(0x3a3020, 1), NC);
  // the west bank beyond the river, a little lower
  D(-3000, -420, 3000, -3000, -2);
  // palms and papyrus along the bank by the camp
  for (let i = 0; i < 7; i++) A.palm(K, -78.5, 0, 42 + i * 19, 15 + (i % 3) * 4, i + 70, { col: false });
  for (let i = 0; i < 9; i++) A.reeds(K, -82 - (i % 2) * 3, -9.5, 20 + i * 18, 0.9, i);
  // dunes rolling away to the horizon
  const r = rng(77);
  for (let i = 0; i < 60; i++) {
    const side = i % 3;
    let x, z;
    if (side === 0) { x = -520 - r() * 2300; z = 1600 - r() * 4200; }
    else if (side === 1) { x = 140 + r() * 2400; z = 700 - r() * 1300; }
    else { x = -60 + (r() - 0.5) * 2600; z = 260 + r() * 2200; }
    if (side === 2 && x > -110 && x < 130 && z < 420) continue;
    dune(K, x, side === 0 ? -2.5 : -0.6, z, 60 + r() * 190, 6 + r() * 28, 40 + r() * 130, r() * Math.PI);
  }
}

// --- 2. the Avenue of the Sphinxes -------------------------------------------------------------------------------------------------------------
function hall2(C, O) {
  const K = C.K, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 1, { name: 'Avenue of the Sphinxes', sub: 'Second Hall', look: 'day', L: 230, balY: 28 }, O);
  const R = routeOf(C);
  // the way climbs a ramp, from z -12 (y 0) to z -112 (y 12), cut through the plateau: on the left a wall
  // with niches to hide in (and ram sphinxes along its top), on the right the wall of the Pharaoh's gallery
  const R0 = -12, R1 = -112, TOP = 12, TH = Math.atan2(TOP, R0 - R1);
  const yAt = (z) => (z >= R0 ? 0 : z <= R1 ? TOP : ((R0 - z) / (R0 - R1)) * TOP);
  const WALL = 10, top = (z) => yAt(z) + WALL;
  const NL = [-30, -52, -74, -96], NR = [-41, -63, -85, -107], NW = 3.5, NH = 8, yb = h.balY;

  // the way: the end of the causeway, the ramp (wide enough to run under the niches), the terrace at the top
  K.span(-11, -2, 2, 11, 0, R0, 'floor');
  K.span(-11, -12, 2, 11, -2, R0, 'ashlar', NC);
  K.box(-0.25, TOP / 2 - Math.cos(TH), (R0 + R1) / 2 - Math.sin(TH), 33.5, 2, Math.hypot(R0 - R1, TOP) + 0.3, 'floor', { rot: [TH * 180 / Math.PI, 0, 0] });
  K.span(-11, TOP - 2, R1, 11, TOP, -175, 'floor');
  K.span(-11, TOP - 2, -215, 11, TOP, -232, 'floor');

  // the left side: the plateau (rock under sand), its retaining wall with the niches, a coping along the top
  const secs = [[-13, R1], [R1, -233]];
  for (const [a, b] of secs) {
    shearBox(C, -122, -17, a, b, -12, top(a) - 1, -12, top(b) - 1, 'rock');
    shearBox(C, -122, -13, a, b, top(a) - 1, top(a), top(b) - 1, top(b), 'dune', NC);
    shearBox(C, -13, -10.6, a, b, top(a) - 1, top(a) + 0.6, top(b) - 1, top(b) + 0.6, 'ashlarPale', NC);
  }
  K.span(-122, -12, -12.4, -11, top(-13) + 0.6, -13, 'ashlar');
  const segL = [[-13, -26.5], [-33.5, -48.5], [-55.5, -70.5], [-77.5, -92.5], [-99.5, R1]];
  for (const [a, b] of segL) shearBox(C, -17, -11, a, b, -12, top(a) - 1, -12, top(b) - 1, 'ashlar');
  K.span(-17, -12, R1, -11, TOP + WALL - 1, -233, 'glyphs');
  for (const zc of NL) {
    const a = zc + NW, b = zc - NW, yN = yAt(zc);
    shearBox(C, -17, -11, a, b, yN + NH, top(a) - 1, yN + NH, top(b) - 1, 'ashlar');
    K.box(-11.3, yN + NH + 0.6, zc, 1, 1.2, NW * 2 + 1.4, 'ashlarPale', NC);
    K.relief(-16.94, yN + NH / 2, zc, NW * 2 - 0.2, NH - 0.6, Math.PI / 2, 3);
  }
  crags(K, -122, -13, -122, -233, (z) => [-10, top(z) - 3], 34, 5);
  crags(K, -120, -13, -20, -13, () => [-10, 6], 14, 6);
  // ram sphinxes along the top of the wall, looking down on the way; palms behind them
  for (let z = -22; z > -214; z -= 12) A.sphinx(K, -24, top(z) - 0.45, z, Math.PI / 2, 1.15, 'ram', { col: false });
  for (let i = 0; i < 9; i++) { const z = -30 - i * 22; A.palm(K, -48 - (i % 3) * 16, top(z) - 0.5, z, 16 + (i % 4) * 3, i + 90, { col: false }); }

  // the right side: the gallery's wall (carved, in the sun), with niches too
  const wt = yb + 3.2, lo = -6;
  for (const [a, b] of [[2, -37.5], [-44.5, -59.5], [-66.5, -81.5], [-88.5, -103.5], [-110.5, -219]]) {
    K.span(11, lo, a, 12.6, wt, b, 'glyphs');
    K.span(12.6, lo, a, 26, yb - 1.5, b, 'ashlar');
  }
  for (const zc of NR) {
    const a = zc + NW, b = zc - NW, yN = yAt(zc);
    K.span(11, yN + NH, a, 12.6, wt, b, 'glyphs');
    K.span(12.6, yN + NH, a, 26, yb - 1.5, b, 'ashlar');
    K.span(16.5, lo, a, 26, yN + NH, b, 'ashlar');
    K.box(11.3, yN + NH + 0.6, zc, 1, 1.2, NW * 2 + 1.4, 'ashlarPale', NC);
    K.relief(16.44, yN + NH / 2, zc, NW * 2 - 0.2, NH - 0.6, -Math.PI / 2, 2);
  }
  K.box(11.8, wt + 0.4, -108.5, 2.2, 0.8, 221, 'ashlarPale', NC);
  for (let z = -18; z > -210; z -= 40) K.relief(10.94, 26.5, z, 38, 7, -Math.PI / 2, 0);
  gallery(C, 0, -219, { wall: false, fill: false, back: 'glyphsPaint', torchStep: 32 });

  // the pylon at the top: the gate of the temple
  A.pylon(K, 0, TOP, -226, 0, { towerW: 34, h: 46, depth: 14, gate: 22, gateH: 26, poles: 'left' });

  // ---- trap 4: the rolling boulder, perched over an arch at the top of the ramp
  K.span(-17, TOP + WALL - 1, -115, -11, 31.2, -123, 'ashlar');
  K.span(-13, 31.2, -115, 10.6, 35, -123, 'ashlarPale');
  K.span(-13.4, 30.4, -114.6, 10.9, 31.2, -123.4, 'gold', NC);
  K.cyl(0, 33.1, -114.85, 1.5, 0.3, 'gold', { ...NC, rot: [90, 0, 0] });
  for (const sx of [-1, 1]) { K.box(sx * 5.2, 33.2, -114.85, 7, 1, 0.2, 'lapis', NC); K.box(sx * 5, 35.8, -119, 1.6, 1.6, 6, 'bronze', NC); }
  const BR = 10.5;
  const bg = new THREE.IcosahedronGeometry(BR, 3);
  {
    const p = bg.attributes.position, uv = bg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.035 * (Math.sin(x * 0.55 + 1.3) + Math.sin(y * 0.62 + 0.4) + Math.sin(z * 0.48 + 2.1)) + 0.02 * Math.sin(x * 1.7 + y * 1.3 - z * 1.1);
      p.setXYZ(i, x * n, y * n, z * n);
      uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2);
    }
    bg.computeVertexNormals();
  }
  const boulder = new THREE.Mesh(bg, mat('rock'));
  boulder.castShadow = true; boulder.receiveShadow = true;
  C.world.scene.add(boulder);
  const B = {};
  const homeB = () => { Object.assign(B, { x: 0, y: 35 + BR, z: -119, vy: 0, v: 0, head: 0, ph: 0, splashed: false }); boulder.quaternion.identity(); boulder.position.copy(W(B.x, B.y, B.z)); };
  homeB();
  const _ax = V(), _bq = new THREE.Quaternion();
  const t4 = new Trap(C, {
    id: 'boulder', name: 'Rolling Boulder', duration: 7, zone: { x0: -17, x1: 16.5, z0: -114, z1: 0 }, wait: [7, 0, 4],
    hide: [...NL.map((z) => [-15, yAt(z), z]), ...NR.map((z) => [14.5, yAt(z), z])],
    run(k, dt) {
      if (k < 0.45) { boulder.position.copy(W(Math.sin(k * 38) * 0.18 * k, B.y, B.z)); return; }
      dt = Math.min(dt, 1 / 20);
      if (B.ph === 0) { B.ph = 1; B.v = 5; }
      if (B.ph === 1) {
        B.v += 22 * dt; B.z += B.v * dt;
        if (B.z > -114) { B.ph = 2; B.vy = 0; }
      } else if (B.ph === 2) {
        B.z += B.v * dt; B.vy -= 196 * dt; B.y += B.vy * dt;
        if (B.y <= yAt(B.z) + BR) {
          B.y = yAt(B.z) + BR; B.ph = 3; B.v = Math.max(B.v, 16);
          SFX.slam(W(B.x, B.y - BR, B.z), 1.4); SFX.grind(W(0, TOP / 2, -60), 2.8, 1);
          C.shake(W(B.x, B.y, B.z), 0.9);
          C.FX.dust.puff(W(B.x, B.y - BR + 1, B.z), 0xc9a878, 40, 5, 18, 1.6, 2);
        }
      } else if (B.ph === 3) {
        B.v = Math.min(44, B.v + 24 * dt);
        if (B.z > -16) B.head = Math.min(1.5, B.head + 1.9 * dt);
        B.x -= Math.sin(B.head) * B.v * dt; B.z += Math.cos(B.head) * B.v * dt;
        if (B.x > -12.5) B.y = yAt(B.z) + BR; else { B.ph = 4; B.vy = 0; }
        if (Math.random() < 0.6) C.FX.dust.puff(W(B.x + rnd(-6, 6), B.y - BR + 0.5, B.z - 4), 0xc9a878, 2, 3, 6, 1, 1);
      } else if (B.ph === 4) {
        B.v *= 1 - 1.2 * dt;
        B.x -= Math.sin(B.head) * B.v * dt; B.z += Math.cos(B.head) * B.v * dt;
        B.vy -= 196 * dt; B.y += B.vy * dt;
        if (B.y - BR < -9 && !B.splashed) { B.splashed = true; SFX.splash(W(B.x, -9, B.z), 2); C.FX.dust.puff(W(B.x, -8, B.z), 0xe8f4f0, 60, 5, 26, 1.6, 8); }
        if (B.y < -15 + BR) { B.y = -15 + BR; B.ph = 5; B.v = 0; }
      }
      if (B.v > 0) { _ax.set(Math.cos(B.head), 0, Math.sin(B.head)); _bq.setFromAxisAngle(_ax, (B.v * dt) / BR); boulder.quaternion.premultiply(_bq); }
      boulder.position.copy(W(B.x, B.y, B.z));
    },
    lethal(p) {
      if (B.ph < 2 || B.ph > 4) return null;
      // (on the ramp it fills the way from wall to wall; at the bottom it's just a ball)
      return nearBall(p, B, BR + 0.7, B.ph === 3 && B.z < -14 && p.z < -12 && Math.abs(p.x) < 10.8 ? 0.62 : 1) ? 'boulder' : null;
    },
    onReset() { homeB(); },
    sfx() { SFX.grind(W(0, 35, -119), 1.2, 0.8); },
    when: (k) => k > 5.2,
  });
  button(C, t4, -60);
  R.gate(t4).walk(0, 0, -10).walk(0, TOP, -114, { r: 2.5 }).walk(0, TOP, -120);

  // ---- trap 5: the flame sphinxes - great heads on the walls breathe fire across the way
  const eyeM = mat('eyeGlow').clone(); eyeM.emissiveIntensity = 0.25;
  const jets = [];
  for (const [zH, s] of [[-132, -1], [-144, 1], [-156, -1], [-168, 1]]) {
    const S = A.sub(K, s * 11, TOP, zH, -s * Math.PI / 2, 1), u = 2;
    S.box(0, 1.6, 1.6, 6.4, 3.2, 3.2, 'ashlar', NC);
    A.pharaohHead(S, 0, 8.6, 2.2, u, 'ashlarPale', { painted: true });
    S.col(0, 6, 2, 6.4, 12, 4.4);
    for (const ex of [-0.5, 0.5]) {
      const e = new THREE.Mesh(boxGeo(1.0, 0.3, 0.1), eyeM);
      e.position.copy(K.W(...S.P(ex * u, 8.6 + 0.35 * u, 2.2 + 1.27 * u))); e.quaternion.copy(S.R(0));
      C.world.scene.add(e);
    }
    jets.push({ z: zH, jet: flameJet(C, K.W(...S.P(0, 8.6 - 0.75 * u, 2.2 + 1.3 * u)), V(-s, -0.2, 0).normalize(), 19, { gain: 0.75 }) });
  }
  const t5 = new Trap(C, {
    id: 'flames', name: 'Flame Sphinxes', duration: 4.6, zone: { x0: -11, x1: 11, z0: -171, z1: -129 }, wait: [0, TOP, -121],
    hide: [[0, TOP, -138], [0, TOP, -150], [0, TOP, -162]],
    run(k) {
      eyeM.emissiveIntensity = 0.25 + 5 * Math.min(1, k / 0.4) * (1 - seg(k, 4.2, 4.6));
      const v = k < 0.5 ? 0 : k < 0.65 ? (k - 0.5) / 0.15 : k < 4.1 ? 1 : Math.max(0, 1 - (k - 4.1) / 0.25);
      for (const j of jets) j.jet.set(v);
      at(this, k, 0.5, () => SFX.fire(W(0, TOP + 5, -150), 3.8, 0.8));
    },
    lethal(p, ch, k) {
      if (k < 0.55 || k > 4.25 || Math.abs(p.x) > 11.5 || p.y - 3 > TOP + 9) return null;
      for (const j of jets) if (Math.abs(p.z - j.z) < 2.8) return 'flame';
      return null;
    },
    onReset() { eyeM.emissiveIntensity = 0.25; for (const j of jets) j.jet.set(0); },
    sfx() { SFX.tone(110, 0.6, { type: 'sawtooth', to: 220, vol: 0.12, lp: 600, pos: W(0, TOP, -150) }); },
    when: (k) => k > 4.35,
  });
  button(C, t5, -150);
  R.gate(t5).walk(0, TOP, -171);

  // ---- trap 6: the sinking sands - the floor turns to quicksand and goes down
  K.span(-11, -6, -175, 11, -3.2, -215, 'sand');
  K.span(-11, -6, -172, 11, TOP - 2, -175, 'ashlarDark');
  K.span(-11, -6, -215, 11, TOP - 2, -218, 'ashlarDark');
  const sands = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    const P = new Piece();
    P.box(0, -3, 0, 10.98, 6, 9.98, 'sand');
    sands.push({ m: mover(C, P, c ? 5.5 : -5.5, TOP, -180 - r * 10), r, c });
  }
  const t6 = new Trap(C, {
    id: 'sands', name: 'Sinking Sands', duration: 6.2, zone: { x0: -11, x1: 11, z0: -215, z1: -175 }, wait: [0, TOP, -170],
    run(k, dt) {
      for (const s of sands) {
        const t0 = 0.25 + s.r * 0.12 + s.c * 0.05;
        _v.copy(s.m.home.pos); _v.y -= 9 * easeIn(seg(k, t0, t0 + 1.1)) * (1 - easeInOut(seg(k, 4.6, 6.0)));
        s.m.set(_v, null, dt);
      }
      if (k < 4.6 && Math.random() < 0.8) C.FX.dust.puff(W(rnd(-10, 10), TOP + 0.3, rnd(-213, -177)), 0xd9b27a, 3, 3, 3, 1.2, 4);
    },
    lethal(p, ch, k) { return k > 0.5 && k < 5.2 && Math.abs(p.x) < 11.5 && p.z < -174 && p.z > -216 && p.y - 3 < TOP - 3 ? 'sands' : null; },
    onReset() { for (const s of sands) s.m.reset(); },
    sfx() { SFX.sand(W(0, TOP, -195), 4.5); },
    when: (k) => k > 6,
  });
  button(C, t6, -195);
  R.gate(t6).walk(0, TOP, -222).walk(0, TOP, -236);
  portals(C, -6, -212);
  pit(C, (p) => (p.y - 3 < -20 ? 'fell' : null));
  h.start = W(0, 0, -6); h.end = W(0, TOP, -230);
  return h;
}

// --- 3. the Hypostyle Hall -----------------------------------------------------------------------------------------------------------------------
function hall3(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 2, { name: 'The Hypostyle Hall', sub: 'Third Hall', look: 'temple', L: 220 }, O);
  const R = routeOf(C);
  const X0 = -52, END = -220, ROOF = 45;
  // the floor, the platform the temple stands on (its feet in the Nile), the roof (stars inside, stone outside)
  K.span(X0, -2, 2, 11, 0, END, 'floor');
  K.span(X0 - 2, -32, 2, 26, -2, END, 'ashlar', NC);
  K.span(X0 - 2, ROOF, 2, 26, ROOF + 1, END, 'stars', NC);
  K.span(X0 - 3, ROOF + 1, 3, 27, ROOF + 3, END - 1, 'ashlar', NC);
  K.span(X0 - 3.4, ROOF + 3, 3.4, 27.4, ROOF + 3.8, END - 1.4, 'ashlarPale', NC);
  // the front wall (behind the pylon) and the back wall with its great door
  for (const [x0, x1] of [[X0 - 2, -11], [11, 26]]) K.span(x0, 0, -1, x1, ROOF, -4, 'glyphsDark');
  K.span(-11, 26, -1, 11, ROOF, -4, 'glyphsDark');
  for (const [x0, x1] of [[X0 - 2, -10], [10, 26]]) K.span(x0, 0, END + 4, x1, ROOF, END, 'glyphsDark');
  K.span(-10, 22, END + 4, 10, ROOF, END, 'glyphsDark');
  A.cornice(K, 0, 24.6, END + 4.4, 26, 1.6, 0);
  K.cyl(0, 27, END + 4.2, 1.6, 0.4, 'gold', { ...NC, rot: [90, 0, 0] });
  for (const sx of [-1, 1]) K.box(sx * 5.4, 27.2, END + 4.15, 7.4, 1.1, 0.2, 'lapis', NC);
  // the left wall: reliefs of the procession inside, clerestory windows with stone grilles high up
  const WIN = [];
  for (let z = -12; z > END + 4; z -= 20) WIN.push(z);
  K.span(X0 - 2, -2, 2, X0, 34, END, 'glyphsPaint');
  K.span(X0 - 2, 42, 2, X0, ROOF, END, 'ashlar');
  let zp = 2;
  for (const zc of WIN) { K.span(X0 - 2, 34, zp, X0, 42, zc + 4, 'ashlar'); zp = zc - 4; for (const dz of [-1.4, 1.4]) K.box(X0 - 1, 38, zc + dz, 1.2, 8, 0.7, 'ashlar', NC); }
  K.span(X0 - 2, 34, zp, X0, 42, END, 'ashlar');
  for (let i = 0, z = -22; z > END + 20; z -= 40, i++) K.relief(X0 + 0.06, 20, z, 36, 14, Math.PI / 2, i % 2 ? 2 : 0);
  for (const zc of WIN) {
    const b = lightShaft(2.6, 4.8, Math.min(92, (zc - END - 3) / 0.5), 0xffe0a8, 0.075);
    b.position.copy(W(X0 + 1.5, 38, zc)); b.quaternion.setFromUnitVectors(V(0, 1, 0), SUN_DIR);
    C.world.scene.add(b);
  }
  // the forest of columns: the tall row along the nave (with screen walls between), the aisles beyond
  K.span(-15.5, 0, -4, -14, 8, END + 4, 'glyphsPaint');
  A.cornice(K, -14.75, 9, (END) / 2, -END - 8, 2.2, Math.PI / 2);
  for (const x of [-15, -27.5, -40]) {
    for (let z = -12; z > END + 4; z -= 20) {
      if (x < -20 && z < -185) continue;
      A.column(K, x, 0, z, 42, 3);
    }
    K.span(x - 2.5, 42.7, -4, x + 2.5, ROOF, END + 4, 'ashlar', NC);
  }
  // the colossus at the end of the aisles, braziers among the columns, torches along the nave
  A.colossus(K, -33, 0, -204, 0, 40, { painted: true });
  for (const z of [-22, -62, -102, -142, -182]) A.brazier(K, FX, -21.2, 0, z, { h: 4 });
  for (const z of [-42, -122]) A.brazier(K, FX, -46, 0, z, { h: 4 });
  for (let z = -14; z > END + 10; z -= 24) A.torch(K, FX, 10.9, 7.5, z, -Math.PI / 2, { intensity: 50, range: 30 });
  for (const x of [-8, 8]) A.torch(K, FX, x, 12, END + 4.1, 0, { intensity: 60 });

  // ---- trap 7: the falling ceiling - three granite blocks the size of houses
  K.span(-13.2, 33, -16, 13.2, ROOF, -17.5, 'granite', NC);
  K.span(-13.2, 33, -59, 13.2, ROOF, -60.5, 'granite', NC);
  for (const sx of [-1, 1]) K.span(sx * 11, 33, -16, sx * 13.2, ROOF, -60.5, 'granite', NC);
  const blocks = [];
  for (let i = 0; i < 3; i++) {
    const P = new Piece();
    P.box(0, 5, 0, 21.9, 10, 13, 'granite');
    for (const sz of [-1, 1]) P.box(0, 5, sz * 6.51, 18, 7, 0.05, 'glyphsGranite', { col: false });
    blocks.push({ m: mover(C, P, 0, ROOF - 10, -24.5 - i * 13.5), t0: 0.7 + i * 0.28 });
  }
  const t7 = new Trap(C, {
    id: 'ceiling', name: 'Falling Ceiling', duration: 5.6, zone: { x0: -11, x1: 11, z0: -58, z1: -18 }, wait: [0, 0, -9],
    run(k, dt) {
      for (const b of blocks) {
        const drop = easeIn(seg(k, b.t0, b.t0 + 0.42)), up = easeInOut(seg(k, b.t0 + 2.4, b.t0 + 4.4));
        _v.copy(b.m.home.pos); _v.y -= (ROOF - 10) * drop * (1 - up);
        if (k < b.t0) _v.y += Math.sin(k * 60 + b.t0 * 9) * 0.06;
        b.m.set(_v, null, dt);
        at(this, k, b.t0 + 0.42, () => { const p = W(0, 0, b.m.home.pos.z - O.z); SFX.slam(p, 1.3); C.shake(p, 1); C.FX.dust.puff(p.clone().add(V(0, 1, 0)), 0xb8a080, 46, 5, 22, 1.8, 1.5); });
      }
      if (k < 0.9 && Math.random() < 0.9) C.FX.dust.puff(W(rnd(-10, 10), ROOF - 11, rnd(-56, -20)), 0xc9b08a, 2, 1.5, 1, 1.6, 9);
    },
    lethal(p, ch, k) {
      if (Math.abs(p.x) > 11.6) return null;
      for (const b of blocks) {
        if (k < b.t0 || k > b.t0 + 0.6) continue;
        const bz = b.m.pos.z - O.z, bottom = b.m.pos.y - O.y;
        if (Math.abs(p.z - bz) < 7.3 && bottom < p.y + 2.5 && bottom > p.y - 5) return 'crush';
      }
      return null;
    },
    onReset() { for (const b of blocks) b.m.reset(); },
    sfx() { SFX.grind(W(0, ROOF - 10, -38), 1, 0.9); },
    when: (k) => k > 5.3,
  });
  button(C, t7, -38);
  R.walk(0, 0, -6).gate(t7).walk(0, 0, -64);

  // ---- trap 8: the khopesh pendulums - great blades hung from the roof, let go to swing across the nave
  const AMP = 8.3 * Math.PI / 180, ARM = ROOF - 4.2, OM = Math.sqrt(196.2 / ARM), PER = (2 * Math.PI) / OM;
  const blades = [];
  [-90, -102, -114, -126].forEach((zb, i) => {
    K.box(0, ROOF - 1, zb, 2.6, 2, 2.6, 'bronze', NC);
    K.cyl(0, ROOF - 1, zb, 0.5, 3.4, 'gold', { ...NC, rot: [90, 0, 0] });
    const P = new Piece();
    P.add(cylGeo(0.32, 0.32, ARM - 3.5, 8), 'bronze', 0, -1.5 - (ARM - 3.5) / 2, 0);
    P.add(boxGeo(0.8, 2.6, 0.7), 'gold', 0, -ARM + 0.4, 0);
    P.add(khopeshGeo(), 'gold', 0, -ARM, 0);
    P.box(0, -ARM - 1, 0, 8.6, 4.2, 0.6, 'gold', { draw: false });
    blades.push({ m: mover(C, P, 0, ROOF, zb, Q(0, 0, 1, (-AMP * 180) / Math.PI)), z: zb, ph: i * 0.42, a: -AMP });
  });
  const t8 = new Trap(C, {
    id: 'pendulums', name: 'Khopesh Pendulums', duration: 2 * PER + 1.3, zone: { x0: -11, x1: 11, z0: -130, z1: -86 }, wait: [0, 0, -80],
    hide: [[0, 0, -96], [0, 0, -108], [0, 0, -120]],
    run(k, dt) {
      for (const b of blades) {
        const s = k - b.ph;
        b.a = s > 0 && s < 2 * PER ? -AMP * Math.cos(OM * s) : -AMP;
        b.m.set(b.m.home.pos, Q(0, 0, 1, (b.a * 180) / Math.PI), dt);
        b.live = s > 0 && s < 2 * PER;
        if (b.live && Math.abs(Math.sin(OM * s)) > 0.995 && !b.sw) { b.sw = true; SFX.swoosh(W(0, 4, b.z), 0.35); } else if (Math.abs(Math.sin(OM * s)) < 0.9) b.sw = false;
      }
    },
    lethal(p) {
      for (const b of blades) {
        if (!b.live || Math.abs(p.z - b.z) > 1.7) continue;
        const c = Math.cos(b.a), sn = Math.sin(b.a);
        for (const dy of [-2.2, 0, 1.8]) {
          const dx = p.x, dyy = p.y + dy - ROOF;
          const lx = dx * c + dyy * sn, ly = -dx * sn + dyy * c;
          if (Math.abs(lx) < 5.4 && ly > -ARM - 3.7 && ly < -ARM + 1.6) return 'blade';
        }
      }
      return null;
    },
    onReset() { for (const b of blades) { b.a = -AMP; b.live = false; b.m.reset(); } },
    sfx() { SFX.tone(70, 1.2, { type: 'sawtooth', vol: 0.12, lp: 300, pos: W(0, ROOF, -108) }); },
    when: (k) => k > 2 * PER + 1.25,
  });
  button(C, t8, -108);
  R.gate(t8).walk(0, 0, -134, { ox: 4.5, w: 2 });

  // ---- trap 9: the spear corridor - the nave narrows between two walls full of holes
  const Z0 = -150, Z1 = -196, CX = 4.5;
  K.span(-14, 0, Z0, -CX, 10, Z1, 'glyphsDark'); K.span(CX, 0, Z0, 11, 10, Z1, 'glyphsDark');
  for (const sx of [-1, 1]) K.span(sx * CX, 10, Z0 + 0.4, sx * (CX + 1), 10.8, Z1 - 0.4, 'gold', NC);
  const SECT = (Z0 - Z1) / 4, spearSecs = [];
  const shaft = cylGeo(0.17, 0.17, 9.6, 6), tip = new THREE.ConeGeometry(0.42, 1.6, 6);
  for (let s = 0; s < 4; s++) for (const side of [-1, 1]) {
    const P = new Piece();
    for (let j = 0; j < 2; j++) for (const y of [1.4, 3.6, 5.8]) {
      const z = -(j * SECT / 2 + (side > 0 ? SECT / 4 : 0) + SECT / 8);
      P.add(shaft, 'bronze', side * 6.4, y, z, [0, 0, 90]);
      P.add(tip, 'gold', side * 0.8, y, z, [0, 0, side * 90]);
      K.box(side * CX - side * 0.02, y, Z0 - s * SECT + z, 0.06, 0.7, 0.7, 'black', NC);
    }
    const m = mover(C, P, side * (CX + 0.2), 0, Z0 - s * SECT);
    spearSecs.push({ m, side, s, t0: 0.65 + s * 0.12 });
  }
  const t9 = new Trap(C, {
    id: 'spears', name: 'Spear Wall', duration: 2.9, zone: { x0: -CX, x1: CX, z0: Z1, z1: Z0 }, wait: [0, 0, -144],
    run(k, dt) {
      for (const q of spearSecs) {
        const out = easeOut(seg(k, q.t0, q.t0 + 0.1)) * (1 - easeInOut(seg(k, q.t0 + 1.1, q.t0 + 1.6)));
        _v.copy(q.m.home.pos); _v.x -= q.side * (9 * out + (k < q.t0 ? 0.35 + 0.25 * Math.sin(k * 55 + q.s) : 0));
        q.m.set(_v, null, dt);
        if (q.side > 0) at(this, k, q.t0, () => SFX.spears(W(0, 3, Z0 - q.s * SECT - SECT / 2)));
      }
    },
    lethal(p, ch, k) {
      if (Math.abs(p.x) > CX + 0.5 || p.y - 3 > 7) return null;
      for (const q of spearSecs) {
        const z0 = Z0 - q.s * SECT;
        if (k > q.t0 + 0.05 && k < q.t0 + 1.15 && p.z < z0 + 0.6 && p.z > z0 - SECT - 0.6) return 'spears';
      }
      return null;
    },
    onReset() { for (const q of spearSecs) q.m.reset(); },
    sfx() { SFX.burst(0.6, { kind: 'white', type: 'bandpass', f: 3200, q: 2, vol: 0.18, pos: W(0, 3, -172) }); },
    when: (k) => k > 2.7,
  });
  button(C, t9, -173);
  R.gate(t9).walk(0, 0, -200, { w: 1.5 }).walk(0, 0, -224);
  gallery(C, -4, -216, { back: 'glyphsPaint', backH: 29, torchStep: 30 });
  portals(C, -10, -210);
  pit(C, (p) => (p.y - 3 < -20 ? 'fell' : null));
  h.start = W(0, 0, -6); h.end = W(0, 0, END);
  return h;
}

/** Sobek: a great crocodile head wearing the god's crown (sun disk, plumes), facing +x; its upper jaw hinges. */
function sobekHead(C, s = 1.25, crown = true) {
  const g = new THREE.Group(), croc = mat('croc'), teeth = mat('teeth');
  const add = (parent, geo, m, x, y, z, rot) => { const me = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m); me.position.set(x, y, z); if (rot) quatOf(rot, me.quaternion); me.castShadow = true; parent.add(me); return me; };
  add(g, boxGeo(6, 3.2, 5), croc, 0, 0.6, 0);
  add(g, boxGeo(5, 7, 4.4), croc, -2.6, -3.4, 0);
  add(g, boxGeo(11, 1, 3.4), croc, 7.5, -0.6, 0);
  for (let i = 0; i < 9; i++) for (const sz of [-1.45, 1.45]) add(g, boxGeo(0.25, 0.6, 0.25), teeth, 3 + i * 1.1, 0.1, sz);
  for (const sz of [-1.4, 1.4]) { add(g, new THREE.SphereGeometry(0.9, 10, 8), croc, 1.2, 2.2, sz); add(g, new THREE.SphereGeometry(0.42, 8, 6), 'eyeGlow', 1.75, 2.35, sz); }
  for (let i = 0; i < 5; i++) add(g, boxGeo(0.8, 0.5, 0.8), croc, -0.4 - i * 1.2, 2.3 - i * 0.25, 0);
  const jaw = new THREE.Group(); jaw.position.set(2.6, 0.5, 0); g.add(jaw);
  add(jaw, boxGeo(11, 1.3, 3.6), croc, 5.5, 0.3, 0);
  add(jaw, boxGeo(1.8, 0.8, 2.6), croc, 10.3, 1.1, 0);
  for (let i = 0; i < 9; i++) for (const sz of [-1.55, 1.55]) add(jaw, boxGeo(0.25, 0.7, 0.25), teeth, 1 + i * 1.1, -0.55, sz);
  // the crown: the sun disk between two tall plumes, a cobra in front
  if (crown) {
    add(g, cylGeo(1.9, 1.9, 0.4, 20), 'gold', -0.6, 5.4, 0, [0, 0, 90]);
    for (const sz of [-0.9, 0.9]) { add(g, boxGeo(0.5, 6.5, 1.3), 'white', -1.4, 7.4, sz); add(g, boxGeo(0.52, 1.2, 1.32), 'blue', -1.4, 9.9, sz); }
    add(g, boxGeo(0.4, 1.3, 0.5), 'gold', 0.8, 4.2, 0);
  }
  g.scale.setScalar(s);
  C.world.scene.add(g);
  return { group: g, jaw };
}

// --- 4. the Sacred Lake -----------------------------------------------------------------------------------------------------------------------------
function hall4(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 3, { name: 'The Sacred Lake', sub: 'Fourth Hall', look: 'lake', L: 230 }, O);
  const R = routeOf(C);
  const WL = -0.6, BED = -12, XW = -95; // the water's level, the lake's bed, the precinct wall
  // the lake: a stone basin (its bed, its water; the flood basin at the end has a water of its own)
  K.span(XW, BED - 2, 2, 11, BED, -200, 'ashlarDark', NC);
  water(C, XW, 11, -8, -136, WL, { color: 0x2a7a70, repeat: 14, opacity: 0.8, flow: 0.5 });
  const flood = water(C, XW, 11, -140, -188, WL, { color: 0x2f7a72, repeat: 6, opacity: 0.82, flow: 2.5 });
  // the quay we come in on (steps down into the water), the walk along the precinct wall, the far quay
  K.span(XW, -2, 2, 11, 0, -10, 'floor');
  K.span(XW, BED, 2, 11, -2, -10, 'ashlar', NC);
  for (let i = 0; i < 4; i++) K.span(XW + 8, -0.9 - i * 0.9, -10 - i * 1.4, -14, -0.4 - i * 0.9, -11.4 - i * 1.4, 'ashlarPale', NC);
  K.span(XW, -2, -10, XW + 8, 0, -188, 'floor');
  K.span(XW, BED, -10, XW + 8, -2, -188, 'ashlar', NC);
  K.span(XW, BED, -188, 11, 0, -200, 'floor');
  // the precinct wall and its portico along the lake
  K.span(XW - 4, BED, 4, XW, 20.4, -232, 'ashlarPale');
  K.span(XW, 0, 4, -54, 12, 2, 'ashlarPale');
  A.cornice(K, XW - 2, 21.6, -114, 236, 4.4, Math.PI / 2);
  for (let z = -22; z > -186; z -= 20) A.column(K, XW + 6, 0, z, 16, 1.5, { col: false });
  K.span(XW + 4.3, 18, -10, XW + 7.7, 19.6, -188, 'ashlar', NC);
  K.span(XW, 19.6, -10, XW + 8.4, 20.4, -188, 'ashlarPale', NC);
  for (let z = -40; z > -186; z -= 40) K.relief(XW + 0.06, 9, z, 36, 12, Math.PI / 2, 2);
  // the plateau beyond the far quay, where the tomb goes down into the rock
  K.span(XW - 4, -22, -200, 26, 0, -232, 'dune');
  for (const [x, z, hh] of [[-80, -194, 17], [-62, -196, 20], [-44, -194, 15], [-86, -214, 19], [-30, -220, 16], [-72, -226, 22]]) A.palm(K, x, 0, z, hh, x * 3 + z, { col: false });
  // a kiosk out on the water, a jackal on its shrine inside
  K.span(-60, BED, -96, -44, 0.4, -112, 'ashlarPale');
  let ct = 0;
  for (const [x, z] of [[-58, -98], [-46, -98], [-58, -110], [-46, -110]]) ct = A.column(K, x, 0.4, z, 14, 1.1, { col: false });
  K.span(-61, ct, -95, -43, ct + 1.4, -113, 'ashlarPale', NC);
  K.span(-61.4, ct + 1.4, -94.6, -42.6, ct + 2, -113.4, 'gold', NC);
  A.jackalShrine(K, -52, 0.4, -104, Math.PI / 2, 1.3);
  // lotus flowers and papyrus on the water
  const r = rng(404), petal = colorMat(0xf2a6c0, 0.5), pad = colorMat(0x3d7a33, 0.65);
  for (let i = 0; i < 46; i++) {
    const x = XW + 10 + r() * 80, z = -14 - r() * 116;
    if (x > -16) continue;
    K.cyl(x, WL + 0.05, z, 0.9 + r() * 0.9, 0.1, pad, { ...NC, seg: 12, noShadow: true });
    if (r() < 0.5) K.geo(new THREE.ConeGeometry(0.45, 0.9, 6), petal, x, WL + 0.5, z, 0, { noShadow: true });
  }
  for (let z = -16; z > -186; z -= 13) A.reeds(K, XW + 9.5, BED + 9, z, 0.6 + (z % 3) * 0.05, z);

  // ---- trap 10: the lotus pads - the way across is a field of great lotus leaves; they sink
  const ROWS = [-15, -24.5, -34, -43.5, -53, -62.5], pads = [];
  ROWS.forEach((z, i) => {
    for (const [j, x] of (i % 2 ? [-9.5, -3.5, 3.5] : [-7, 0, 7]).entries()) {
      const rr = 2.9 + ((i * 3 + j * 2) % 4) * 0.12;
      const P = new Piece();
      P.cyl(0, -0.25, 0, rr, 0.5, pad, { col: true, seg: 22 });
      P.cyl(0, -3.6, 0, 0.35, 6.2, pad, { seg: 8 });
      if ((i + j) % 3 === 0) for (let q = 0; q < 6; q++) P.add(new THREE.ConeGeometry(0.4, 1.1, 5), petal, Math.cos(q) * 0.8 + rr * 0.4, 0.4, Math.sin(q) * 0.8, [Math.cos(q) * 25, 0, Math.sin(q) * 25]);
      pads.push({ m: mover(C, P, x, WL + 0.75, z), t0: 0.15 + i * 0.13 + j * 0.05 });
    }
    K.cyl(i % 2 ? -3.5 : 0, BED + 3, z, 1.2, 6, 'ashlarDark', NC);
  });
  K.span(-11, BED, -69, 11, 0, -78, 'floor');
  for (const sx of [-1, 1]) A.obelisk(K, sx * 9.4, 0, -73.5, 13, 1.3, { base: 1.4 });
  const t10 = new Trap(C, {
    id: 'lotus', name: 'Sinking Lotus', duration: 6.4, zone: { x0: -11, x1: 11, z0: -68, z1: -11 }, wait: [0, 0, -7],
    run(k, dt) {
      for (const q of pads) {
        const d = 5 * easeIn(seg(k, q.t0, q.t0 + 0.8)) * (1 - easeInOut(seg(k, 4.7, 6.2)));
        _v.copy(q.m.home.pos); _v.y -= d;
        q.m.set(_v, null, dt);
        if (d > 0.3 && d < 4.8 && Math.random() < 0.25) C.FX.dust.puff(q.m.pos.clone().add(V(rnd(-2, 2), 0.3, rnd(-2, 2))), 0xdff4f0, 2, 1.6, 3, 0.8, -1);
      }
      at(this, k, 0.5, () => SFX.splash(W(0, 0, -40), 1.2));
    },
    lethal(p, ch, k) { return k > 0.3 && p.y - 3 < WL - 0.6 ? 'lotus' : null; },
    onReset() { for (const q of pads) q.m.reset(); },
    sfx() { SFX.tone(220, 0.8, { type: 'sine', to: 110, vol: 0.12, pos: W(0, 0, -40) }); },
    when: (k) => k > 6.2,
  });
  button(C, t10, -40);
  R.walk(0, 0, -5).gate(t10);
  {
    const path = [[0, -8], [0, -15], [-3.5, -24.5], [0, -34], [3.5, -43.5], [0, -53], [-3.5, -62.5], [0, -71.5]];
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i], L = Math.hypot(bx - ax, bz - az), f = i === 1 ? 0.6 : 1.4;
      R.jump([ax + ((bx - ax) / L) * f, 0.4, az + ((bz - az) / L) * f], [bx, i === path.length - 1 ? 0 : 0.4, bz]);
    }
  }

  // ---- trap 11: Sobek's jaws - the crocodile god waits in the water beside a narrow bridge
  K.span(-4, -2, -78, 4, 0, -130, 'floor');
  K.span(-3, BED, -78, 3, -2, -130, 'ashlar', NC);
  K.span(-11, BED, -130, 11, 0, -140, 'floor');
  K.span(XW + 8, BED, -134, -11, 3.5, -140, 'ashlarPale');
  const crocs = [];
  for (const [zh, dly] of [[-94, 0.3], [-116, 1.25]]) {
    const S = sobekHead(C);
    const home = W(-25, -2.6, zh);
    S.group.position.copy(home);
    crocs.push({ ...S, z: zh, dly, home });
  }
  const t11 = new Trap(C, {
    id: 'sobek', name: "Sobek's Jaws", duration: 3.6, zone: { x0: -11, x1: 11, z0: -130, z1: -78 }, wait: [0, 0, -74],
    hide: [[0, 0, -105], [0, 0, -76]],
    run(k) {
      for (const c of crocs) {
        const s = k - c.dly, up = easeOut(seg(s, 0, 0.42)), back = easeInOut(seg(s, 1.1, 1.9));
        const f = up * (1 - back);
        c.group.position.set(c.home.x + 15 * f, c.home.y + 3.6 * f, c.home.z);
        c.group.rotation.z = 0.12 * f;
        c.jaw.rotation.z = s < 0.42 ? 0.95 * up : s < 0.56 ? 0.95 * (1 - (s - 0.42) / 0.14) : 0;
        at(this, k, c.dly, () => SFX.splash(W(-22, 0, c.z), 1.2));
        at(this, k, c.dly + 0.5, () => { SFX.chomp(W(0, 1, c.z), true); C.shake(W(0, 0, c.z), 0.5); C.FX.dust.puff(W(-6, 0, c.z), 0xdff4f0, 24, 2.6, 12, 1, 6); });
      }
    },
    lethal(p, ch, k) {
      for (const c of crocs) {
        const s = k - c.dly;
        if (s > 0.38 && s < 0.75 && Math.abs(p.z - c.z) < 4.4 && p.x > -9 && p.x < 6.5 && p.y - 3 < 5) return 'sobek';
      }
      return null;
    },
    onReset() { for (const c of crocs) { c.group.position.copy(c.home); c.group.rotation.z = 0; c.jaw.rotation.z = 0; } },
    sfx() { SFX.groan(W(-20, 0, -105)); },
    when: (k) => k > 3.3,
  });
  button(C, t11, -105);
  R.walk(0, 0, -75).gate(t11).walk(0, 0, -133, { w: 1 });

  // ---- trap 12: the flood - lion-headed spouts fill the basin; get up on an altar
  K.span(-11, BED, -140, 11, 0, -188, 'floor');
  const alts = [[-6, -151], [6, -164], [-6, -177]];
  for (const [x, z] of alts) {
    K.box(x, 0.55, z, 6, 1.1, 6, 'ashlarPale');
    K.box(x, 1.65, z, 4.2, 1.1, 4.2, 'ashlar');
    K.box(x, 2.75, z, 2.8, 1.1, 2.8, 'gold');
  }
  const spouts = [];
  for (const z of [-151, -164, -177]) {
    K.box(10.2, 5, z, 1.8, 2.6, 2.6, 'ashlarPale', NC);
    K.box(9.25, 4.6, z, 0.1, 0.8, 1.2, 'black', NC);
    for (const sz of [-0.6, 0.6]) K.box(9.3, 5.7, z + sz, 0.2, 0.3, 0.4, 'black', NC);
    spouts.push(W(9, 4.6, z));
  }
  const _sv = { x: 0, y: 0, z: 0 };
  const t12 = new Trap(C, {
    id: 'flood', name: 'Flood of the Nile', duration: 6.4, zone: { x0: -11, x1: 11, z0: -188, z1: -140 }, wait: [0, 0, -136],
    hide: alts.map(([x, z]) => [x, 3.3, z]),
    run(k) {
      const lv = WL + 3.2 * easeInOut(seg(k, 0.5, 1.7)) * (1 - easeInOut(seg(k, 4.4, 6.2)));
      flood.mesh.position.y = O.y + lv; flood.y = lv;
      if (k < 4.6) for (const sp of spouts) for (let i = 0; i < 3; i++) {
        _sv.x = -12 - Math.random() * 6; _sv.y = 3 + Math.random() * 3; _sv.z = (Math.random() - 0.5) * 3;
        C.FX.dust.emit(sp, _sv, Math.random() < 0.5 ? 0xd8f0f4 : 0x9fd0d8, 1.2 + Math.random(), 0.8, 30, 0.2);
      }
    },
    lethal(p) { const lv = flood.y; return lv > 0.3 && p.y - 3 < lv - 0.6 && Math.abs(p.x) < 11.5 && p.z < -139.5 && p.z > -188.5 ? 'flood' : null; },
    onReset() { flood.mesh.position.y = O.y + WL; flood.y = WL; },
    sfx() { SFX.burst(5, { kind: 'brown', type: 'lowpass', f: 700, vol: 0.55, a: 0.5, pos: W(4, 2, -164) }); SFX.splash(W(6, 2, -164), 1.5); },
    when: (k) => k > 6.1,
  });
  button(C, t12, -164);
  R.walk(0, 0, -136).gate(t12).walk(0, 0, -194).walk(0, 0, -226).walk(0, 0, -238);

  // the way down into the tomb: a portal at the head of the stair
  for (const sx of [-1, 1]) K.box(sx * 8, 7, -229, 3.4, 14, 3.4, 'glyphsDark');
  A.jackalShrine(K, -14.5, 0, -224, 0, 1.15);
  K.box(0, 15.2, -229, 20, 2.4, 4, 'glyphsDark');
  A.cornice(K, 0, 17, -229, 21, 4.4, 0);
  K.cyl(0, 15.2, -226.9, 1.3, 0.3, 'gold', { ...NC, rot: [90, 0, 0] });
  for (const sx of [-1, 1]) K.box(sx * 4.6, 15.3, -226.95, 6, 0.9, 0.2, 'lapis', NC);
  gallery(C, 0, -228, { lo: BED, back: 'glyphsPaint' });
  portals(C, -6, -222);
  pit(C, (p) => (p.z > -200 && p.y - 3 < WL - 0.7 ? 'lake' : null));
  h.start = W(0, 0, -6); h.end = W(0, 0, -230);
  return h;
}

/** A mummy: a blocky body wrapped in linen, arms out in front (it faces +z), glowing eyes; legs and arms on hinges. */
function mummyModel() {
  const g = new THREE.Group(), L = mat('linen');
  const box = (parent, sx, sy, sz, x, y, z, m = L) => { const me = new THREE.Mesh(boxGeo(sx, sy, sz, 1), m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; };
  box(g, 2, 2, 1, 0, 3, 0);
  const head = box(g, 1.25, 1.25, 1.25, 0, 4.65, 0);
  for (const sx of [-0.28, 0.28]) box(head, 0.24, 0.14, 0.05, sx, 0.12, 0.64, mat('eyeGlow'));
  const legs = [], arms = [];
  for (const sx of [-0.5, 0.5]) {
    const leg = new THREE.Group(); leg.position.set(sx, 2, 0); g.add(leg); box(leg, 0.98, 2, 1, 0, -1, 0); legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(sx * 3, 3.7, 0); g.add(arm); box(arm, 0.95, 0.95, 2.3, 0, 0, 1.05); arms.push(arm);
  }
  // loose wrappings trailing
  box(g, 0.3, 1.4, 0.06, 0.6, 2.4, -0.53); box(g, 0.25, 1.1, 0.06, -0.8, 1.6, 0.53);
  return { g, legs, arms, head };
}

// --- 5. the Tomb of the Scarabs ---------------------------------------------------------------------------------------------------------------
function hall5(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 4, { name: 'The Tomb of the Scarabs', sub: 'Fifth Hall', look: 'tomb', L: 230, balY: -12 }, O);
  const R = routeOf(C);
  const F = -24, CEIL = -4, END = -230, PIT = -36; // the floor (24 under the desert), the ceiling (just under the sand), the end, the spike pit
  // the stair cut down into the plateau, the door into the rock
  for (let i = 0; i < 40; i++) K.span(-6, F, -2 - i * 1.1, 6, -0.6 * (i + 1), -2 - (i + 1) * 1.1, i % 8 === 7 ? 'ashlar' : 'ashlarPale');
  for (const sx of [-1, 1]) K.span(sx * 6, F, 0, sx * 8.5, 0, -46, 'glyphsDark');
  K.span(-8.5, CEIL - 4, -32, 8.5, CEIL, -34, 'glyphsDark');
  A.cornice(K, 0, CEIL - 3.4, -31.6, 17, 1.4, 0);
  K.cyl(0, CEIL - 5.6, -31.5, 1.1, 0.3, 'gold', { ...NC, rot: [90, 0, 0] });
  for (const sx of [-1, 1]) K.box(sx * 3.6, CEIL - 5.5, -31.55, 5, 0.8, 0.2, 'lapis', NC);
  K.span(-8.5, CEIL, -32, 8.5, 0, -46, 'rock', NC);
  for (let z = -12; z > -44; z -= 10) for (const sx of [-1, 1]) A.torch(K, FX, sx * 5.9, -0.6 * ((-2 - z) / 1.1) + 4.5, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { intensity: 40, range: 26 });
  // the tomb: a long painted corridor, a starry ceiling, the spike pit under its trapdoors
  K.span(-13, F, -46, -6, CEIL, -48, 'glyphsDark'); K.span(6, F, -46, 11, CEIL, -48, 'glyphsDark');
  K.span(-11, F - 2, -46, 11, F, -60, 'floorDark');
  K.span(-11, F - 2, -96, 11, F, END - 2, 'floorDark');
  K.span(-11, PIT - 2, -60, 11, PIT, -96, 'ashlarDark', NC);
  K.span(-11, PIT, -58, 11, F - 2, -60, 'ashlarDark', NC); K.span(-11, PIT, -96, 11, F - 2, -98, 'ashlarDark', NC);
  K.span(-13, PIT - 2, -46, -11, CEIL, END - 2, 'glyphsPaint');
  K.span(-13, CEIL, -46, 26, CEIL + 1, END - 2, 'stars', NC);
  for (let i = 0, z = -60; z > END + 10; z -= 34, i++) K.relief(-10.94, F + 9, z, 30, 10, Math.PI / 2, i % 2 ? 2 : 0);
  for (let z = -52; z > END + 4; z -= 18) A.torch(K, FX, -10.9, F + 7, z, Math.PI / 2, { intensity: 50, range: 30 });
  for (let z = -61; z > END + 4; z -= 18) A.torch(K, FX, 10.9, F + 7, z, -Math.PI / 2, { intensity: 50, range: 30 });

  // ---- trap 13: the trapdoors - the floor drops away over a pit of bronze spikes
  for (let x = -9.5; x < 10; x += 2.5) for (let z = -62; z > -95; z -= 3) K.geo(new THREE.ConeGeometry(0.45, 2.6, 6), 'bronze', x + ((z | 0) % 2) * 0.6, PIT + 1.3, z, 0);
  const doors = [];
  for (let r = 0; r < 4; r++) for (const s of [-1, 1]) {
    const P = new Piece();
    P.box(-s * 5.5, -0.5, 0, 10.98, 1, 8.98, 'floorDark');
    P.box(-s * 5.5, -1.1, 0, 10.4, 0.2, 8.4, 'bronze', { col: false });
    doors.push({ m: mover(C, P, s * 11, F, -64.5 - r * 9), s, t0: 0.25 + r * 0.1 });
  }
  const t13 = new Trap(C, {
    id: 'trapdoors', name: 'Trapdoors', duration: 5, zone: { x0: -11, x1: 11, z0: -96, z1: -60 }, wait: [0, F, -54],
    run(k, dt) {
      for (const d of doors) {
        const a = 92 * easeIn(seg(k, d.t0, d.t0 + 0.32)) * (1 - easeInOut(seg(k, 3.6, 4.8)));
        d.m.set(d.m.home.pos, Q(0, 0, 1, d.s * a), dt);
      }
      at(this, k, 0.3, () => { SFX.slam(W(0, F, -78), 0.8); C.shake(W(0, F, -78), 0.4); });
      at(this, k, 3.6, () => SFX.grind(W(0, F, -78), 1.2, 0.6));
    },
    onReset() { for (const d of doors) d.m.reset(); },
    sfx() { SFX.tone(180, 0.25, { type: 'square', vol: 0.08, pos: W(0, F, -78) }); },
    when: (k) => k > 4.8,
  });
  button(C, t13, -78);
  pit(C, (p) => (p.z < -59 && p.z > -97 && p.y - 3 < F - 4 ? 'spikes' : null));
  R.walk(0, 0, -1, { w: 1.5 }).walk(0, F, -50, { w: 2 }).gate(t13).walk(0, F, -100);

  // ---- trap 14: the scarab swarm - beetles pour out of the walls; get up on a sarcophagus
  const refuges = [[-6, -116], [6, -129], [-6, -142]];
  for (const [x, z] of refuges) {
    K.box(x, F + 0.55, z + 4.6, 3.6, 1.1, 1.6, 'ashlar');
    K.box(x, F + 1.1, z, 3.6, 2.2, 7.4, 'granite');
    K.box(x, F + 2.3, z, 3.2, 0.2, 6.8, 'gold', NC);
    K.box(x, F + 2.42, z - 2.2, 1.6, 0.06, 1.4, colorMat(0xd9a060, 0.4, 0.6), NC);
  }
  const vents = [];
  for (const z of [-114, -128, -142]) for (const s of [-1, 1]) { K.box(s * 10.95, F + 0.9, z, 0.1, 1.6, 3, 'black', NC); vents.push([s * 10.5, z]); }
  const NB = 420, bug = new THREE.SphereGeometry(1, 7, 5);
  bug.scale(0.32, 0.17, 0.44);
  const swarm = new THREE.InstancedMesh(bug, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.7, color: 0xffffff }), NB);
  swarm.frustumCulled = false; swarm.visible = false; swarm.castShadow = false;
  C.world.scene.add(swarm);
  const bugs = [], _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(1, 1, 1), _p = V(), _c = new THREE.Color();
  for (let i = 0; i < NB; i++) { swarm.setColorAt(i, _c.set(Math.random() < 0.25 ? 0xd4a032 : 0x2a2416)); bugs.push({ x: 0, z: 0, tx: 0, tz: 0, h: 0, sp: 8 + Math.random() * 6, v: vents[i % vents.length], d: Math.random() * 0.5 }); }
  const inRefuge = (x, z) => refuges.some(([rx, rz]) => Math.abs(x - rx) < 2.3 && Math.abs(z - rz) < 4.3);
  const newTarget = (b) => { for (let n = 0; n < 6; n++) { b.tx = rnd(-10.4, 10.4); b.tz = rnd(-150, -108); if (!inRefuge(b.tx, b.tz)) return; } };
  const t14 = new Trap(C, {
    id: 'scarabs', name: 'Scarab Swarm', duration: 6.2, zone: { x0: -11, x1: 11, z0: -150, z1: -108 }, wait: [0, F, -103],
    hide: refuges.map(([x, z]) => [x, F + 2.4, z]),
    onFire() { swarm.visible = true; for (const b of bugs) { b.x = b.v[0]; b.z = b.v[1] + rnd(-1.2, 1.2); newTarget(b); } },
    run(k, dt) {
      const home = k > 4.8;
      for (let i = 0; i < NB; i++) {
        const b = bugs[i];
        if (k < b.d) { _s.set(0, 0, 0); _m.compose(_p.set(0, -999, 0), _q, _s); swarm.setMatrixAt(i, _m); continue; }
        const tx = home ? b.v[0] : b.tx, tz = home ? b.v[1] : b.tz, dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
        if (d < 0.8 && !home) newTarget(b);
        const sp = b.sp * Math.min(1, d);
        b.h = Math.atan2(dx, dz) + Math.sin(k * 9 + i) * 0.5;
        b.x += Math.sin(b.h) * sp * dt; b.z += Math.cos(b.h) * sp * dt;
        if (inRefuge(b.x, b.z)) { b.x -= Math.sin(b.h) * sp * dt * 1.5; newTarget(b); }
        const gone = home && d < 0.9;
        _q.setFromAxisAngle(_Y, b.h); _s.setScalar(gone ? 0 : 1);
        _m.compose(_p.set(O.x + b.x, O.y + F + 0.17 + Math.abs(Math.sin(k * 20 + i)) * 0.06, O.z + b.z), _q, _s);
        swarm.setMatrixAt(i, _m);
      }
      swarm.instanceMatrix.needsUpdate = true;
      if (k > 6) swarm.visible = false;
    },
    lethal(p, ch, k) { return k > 0.9 && k < 5 && p.y - 3 < F + 1.2 && Math.abs(p.x) < 11 && p.z < -107 && p.z > -151 ? 'scarab' : null; },
    onReset() { swarm.visible = false; },
    sfx() { SFX.scarabs(W(0, F, -129), 5.5); },
    when: (k) => k > 5.6,
  });
  if (swarm.instanceColor) swarm.instanceColor.needsUpdate = true;
  button(C, t14, -129);
  R.gate(t14).walk(0, F, -154);

  // ---- trap 15: the rise of the mummies - the dead step out of their niches and come for you
  const mums = [];
  for (const [z, s] of [[-166, -1], [-176, 1], [-186, -1], [-196, 1], [-204, -1]]) {
    const nx = s * 9.4;
    K.box(s * 10.55, F + 3.4, z, 0.8, 6.8, 3.4, 'gold', NC);
    K.box(s * 10.5, F + 3.4, z, 0.8, 6, 2.6, 'lapis', NC);
    K.box(s * 9.4, F + 0.2, z, 2.6, 0.4, 2.6, 'ashlarDark', NC);
    const M = mummyModel();
    const home = { x: nx, z };
    M.g.position.copy(W(nx, F, z)); M.g.rotation.y = -s * Math.PI / 2;
    C.world.scene.add(M.g);
    mums.push({ ...M, home, x: nx, z, face: -s * Math.PI / 2, s });
  }
  const seen = [];
  const t15 = new Trap(C, {
    id: 'mummies', name: 'Rise of the Mummies', duration: 10, zone: { x0: -11, x1: 11, z0: -208, z1: -158 }, wait: [0, F, -155],
    run(k, dt) {
      for (const M of mums) {
        let tx = null, tz = null, best = 26;
        for (const q of seen) { const d = Math.hypot(q.x - M.x, q.z - M.z); if (d < best) { best = d; tx = q.x; tz = q.z; } }
        const out = k < 1.2;
        if (out) { tx = M.home.x - M.s * 4; tz = M.home.z; }
        if (k > 9) { M.g.position.y = O.y + F - 6 * seg(k, 9, 9.8); if (Math.random() < 0.3) C.FX.dust.puff(W(M.x, F + 2, M.z), 0xcfc2a0, 2, 2, 3, 1, -1); continue; }
        if (tx != null && k > 0.5) {
          const dx = tx - M.x, dz = tz - M.z, d = Math.hypot(dx, dz), sp = out ? 5 : 12.5;
          if (d > 0.6) { M.x += (dx / d) * sp * dt; M.z += (dz / d) * sp * dt; M.face = Math.atan2(dx, dz); }
          if (!out) { M.x = clamp(M.x, -10, 10); M.z = clamp(M.z, -208, -158); }
        }
        const sw = k > 0.5 ? Math.sin(k * 9 + M.home.z) * 0.6 : 0;
        M.legs[0].rotation.x = sw; M.legs[1].rotation.x = -sw;
        M.arms[0].rotation.x = -0.15 + sw * 0.15; M.arms[1].rotation.x = -0.15 - sw * 0.15;
        M.g.position.set(O.x + M.x, O.y + F + Math.abs(sw) * 0.2, O.z + M.z);
        M.g.rotation.y = M.face; M.head.rotation.z = Math.sin(k * 3 + M.home.z) * 0.15;
      }
      seen.length = 0;
      at(this, k, 0.4, () => SFX.groan(W(0, F, -182)));
      at(this, k, 4, () => SFX.groan(W(0, F, -190)));
    },
    lethal(p, ch, k) {
      seen.push(_l2.set(p.x, 0, p.z).clone());
      if (k < 1.0 || k > 9) return null;
      for (const M of mums) if (Math.hypot(p.x - M.x, p.z - M.z) < 2.3 && p.y - 3 < F + 4) return 'mummy';
      return null;
    },
    onReset() { for (const M of mums) { M.x = M.home.x; M.z = M.home.z; M.face = -M.s * Math.PI / 2; M.g.position.copy(W(M.x, F, M.z)); M.g.rotation.y = M.face; for (const l of [...M.legs, ...M.arms]) l.rotation.x = 0; } },
    sfx() { SFX.grind(W(0, F, -182), 1.4, 0.7); },
    when: (k) => k > 9.6,
  });
  for (const T of [t13, t14, t15]) T.zoneY = F;
  button(C, t15, -182);
  R.gate(t15).walk(0, F, -214).walk(0, F, -236);
  // a burial chamber's worth of things along the end of the corridor
  A.coffin(K, -7, F, -222, 0, 1);
  A.canopics(K, 7, F, -220, -Math.PI / 2);
  for (const z of [-224, -227]) A.chest(K, 8, F, z, 0.3);
  gallery(C, -50, -228, { lo: PIT, backH: 8, wall: 'glyphsDark', back: 'glyphsPaint', torchStep: 30 });
  portals(C, -56, -222);
  pit(C, (p) => (p.y - 3 < PIT - 6 ? 'fell' : null));
  h.start = W(0, F, -50); h.end = W(0, F, END);
  return h;
}
const _Y = V(0, 1, 0), _l2 = V();

/** A stand-in for the Kit that builds into a Piece, so the statue builders of art.js can make things that move. */
function pieceKit(C) {
  const P = new Piece(), M = (m) => (typeof m === 'string' ? mat(m) : m);
  const add = (g, m, x, y, z, rot, o = {}) => {
    const me = new THREE.Mesh(g, M(m)); me.position.set(x, y, z); quatOf(rot, me.quaternion);
    if (o.scale) me.scale.set(...o.scale);
    me.castShadow = !o.noShadow; me.receiveShadow = true; P.group.add(me); return me;
  };
  return {
    P, world: C.world, o: V(), W: (x, y, z) => V(x, y, z),
    geo: (g, m, x, y, z, rot, o) => add(g, m, x, y, z, rot, o),
    box: (x, y, z, sx, sy, sz, m, o = {}) => add(boxGeo(sx, sy, sz, scaleOf(M(m))), m, x, y, z, o.rot, o),
    wedge: (x, y, z, sx, sy, sz, m, o = {}) => add(wedgeGeo(sx, sy, sz, scaleOf(M(m))), m, x, y, z, o.rot, o),
    taper: (x, y, z, sx, sz, tx, tz, hh, m, o = {}) => add(taperGeo(sx, sz, tx, tz, hh, scaleOf(M(m))), m, x, y, z, o.rot, o),
    cyl: (x, y, z, r, hh, m, o = {}) => add(cylGeo(o.rTop ?? r, r, hh, o.seg || 16, scaleOf(M(m))), m, x, y, z, o.rot, o),
    ball: (x, y, z, r, m, o = {}) => add(new THREE.SphereGeometry(r, 14, 8), m, x, y, z, o.rot, o),
    col: () => null, relief: () => null,
  };
}
/** A thin rod from a to b (local to a Piece): chains, ropes. */
function rod(P, a, b, r, m) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const me = P.add(cylGeo(r, r, L, 5), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize()), { noShadow: true });
  return me;
}

// --- 6. the Hall of Judgement ------------------------------------------------------------------------------------------------------------------------
function hall6(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 5, { name: 'The Hall of Judgement', sub: 'Sixth Hall', look: 'judgement', L: 200, balY: 12 }, O);
  const R = routeOf(C);
  const CEIL = 20, END = -200, XL = -42, GREEN = 0x60ff90;
  // the hall: black floors, a starry ceiling, the walls painted with the judgement of the dead
  K.span(-11, -2, 2, 11, 0, -72, 'floorDark');
  K.span(-11, -2, -116, 11, 0, END, 'floorDark');
  K.span(XL, -2, 2, -11, 0, END, 'floorDark');
  K.span(XL - 2, CEIL, 2, 26, CEIL + 1, END, 'stars', NC);
  K.span(XL - 2, -2, 2, XL, CEIL, END, 'glyphsPaint');
  for (let i = 0, z = -24; z > END + 20; z -= 40, i++) K.relief(XL + 0.06, 10, z, 34, 12, Math.PI / 2, i % 2 ? 0 : 2);
  K.span(XL - 2, 0, 2, -11, CEIL, -1, 'glyphsDark');
  K.span(XL - 2, 0, END + 3, -11, CEIL, END, 'glyphsDark');
  K.span(-11, 14, END + 3, 11, CEIL, END, 'glyphsDark');
  A.cornice(K, 0, 15.6, END + 3.6, 23, 1.6, 0);
  // the way is fenced off from the hall by a low screen wall with Osiride pillars; beyond it sit the judges of the dead
  K.span(-13, 0, -1, -11.4, 7, END + 3, 'glyphsPaint');
  A.cornice(K, -12.2, 7.6, (END + 2) / 2, -END - 4, 2, Math.PI / 2);
  for (const z of [-8, -64, -122, -176, -190]) {
    K.box(-13.4, CEIL / 2, z, 2.6, CEIL, 3, 'glyphsPaint');
    const S = A.sub(K, -11.4, 0, z, Math.PI / 2, 1);
    S.box(0, 0.5, 0.6, 2.6, 1, 1.6, 'ashlar', NC);
    S.taper(0, 4.4, 0.6, 2.2, 1.3, 1.6, 1.1, 6.8, 'white', NC);
    S.box(0, 8.4, 0.7, 1.1, 1.2, 1, 'green', NC);
    S.cyl(0, 9.6, 0.6, 0.55, 1.4, 'white', { ...NC, rTop: 0.3 });
    for (const sx of [-0.45, 0.45]) S.box(sx, 6.4, 1.25, 0.25, 2.4, 0.2, 'gold', NC);
    S.col(0, 5, 0.8, 2.6, 10, 1.6);
  }
  for (let z = -10; z > END + 14; z -= 14) A.colossus(K, XL + 4.5, 0, z, Math.PI / 2, 7, { mat: 'basalt' });
  for (const z of [-20, -60, -100, -140]) A.brazier(K, FX, -22, 0, z, { h: 4, color: GREEN, lightColor: 0x40ff80, intensity: 90 });
  A.colossus(K, -27, 0, -184, 0, 18, { painted: true, mat: 'green' });
  for (const x of [-35, -19]) A.brazier(K, FX, x, 0, -172, { h: 3, color: GREEN, lightColor: 0x40ff80, intensity: 80 });
  for (let z = -12; z > END + 8; z -= 20) A.torch(K, FX, 10.9, 7.5, z, -Math.PI / 2, { color: 0x9affb0, lightColor: 0x50ff90, intensity: 45, range: 28 });

  // ---- trap 16: Anubis' sweep - in a chamber of its own the god turns, his staff sweeping the floor; jump it, or hide in a corner
  const AC = -42;
  for (const z of [-30, -54]) { K.span(-11, 0, z + 0.75, -4, 13, z - 0.75, 'glyphsDark'); K.span(4, 0, z + 0.75, 11, 13, z - 0.75, 'glyphsDark'); K.span(-4, 9, z + 0.75, 4, 13, z - 0.75, 'glyphsDark'); }
  K.cyl(0, 0.15, AC, 3.4, 0.3, 'gold', NC);
  const PK = pieceKit(C);
  A.anubis(PK, 0, 0.3, 0, 0, 15, { plinth: false, staff: false, col: false });
  PK.box(0, 1.15, 0, 21.8, 0.5, 0.5, 'gold');
  for (const sx of [-1, 1]) { PK.box(sx * 10.8, 1.15, 0, 0.6, 1.2, 0.9, 'gold'); PK.box(sx * 2.4, 1.15, 0, 1, 1, 1, 'lapis'); }
  PK.P.box(0, 4, 0, 3.4, 8, 3.4, 'basalt', { draw: false });
  const anu = mover(C, PK.P, 0, 0, AC);
  let ang = 0, dAng = 0;
  const t16 = new Trap(C, {
    id: 'sweep', name: "Anubis' Sweep", duration: 7.6, zone: { x0: -11, x1: 11, z0: -53, z1: -31 }, wait: [0, 0, -26],
    hide: [[-9, 0, AC + 9], [9, 0, AC + 9], [-9, 0, AC - 9], [9, 0, AC - 9]],
    run(k, dt) {
      const w = 2.6 * smooth(seg(k, 0.3, 1.3)) * (1 - smooth(seg(k, 6.2, 7.4)));
      dAng = w * dt; ang += dAng;
      anu.set(anu.home.pos, Q(0, 1, 0, (ang * 180) / Math.PI), dt);
      if (w > 1 && Math.random() < 0.5) C.FX.dust.puff(W(Math.cos(-ang) * 10, 0.5, AC + Math.sin(-ang) * 10), 0x6a7a60, 1, 1.5, 2, 0.6, -1);
      at(this, k, 0.2, () => SFX.grind(W(0, 2, AC), 7, 0.6));
    },
    lethal(p) {
      if (Math.abs(dAng) < 1e-4 || p.y - 3 > 1.5) return null;
      const dx = p.x, dz = p.z - AC, r = Math.hypot(dx, dz);
      if (r > 11.4 || r < 1.4) return null;
      for (const off of [0, Math.PI]) {
        const d = Math.atan2(Math.sin(Math.atan2(dz, dx) + ang + off), Math.cos(Math.atan2(dz, dx) + ang + off));
        if (Math.abs(d) * r < 0.85 + Math.abs(dAng) * r) return 'sweep';
      }
      return null;
    },
    onReset() { ang = 0; dAng = 0; anu.reset(); },
    sfx() { SFX.gong(W(0, 4, AC), 0.4); },
    when: (k) => k > 7.3,
  });
  button(C, t16, -42);
  R.walk(0, 0, -6).gate(t16).walk(0, 0, -33, { w: 1.5 }).walk(-6.5, 0, -37.5, { w: 0.5 }).walk(-6.5, 0, -46.5, { w: 0.5 }).walk(0, 0, -51, { w: 1.5 }).walk(0, 0, -60);

  // ---- trap 17: the scales of Maat - the way crosses Ammit's pit on the pans of a great balance; the heavy pan tips
  const PZ0 = -72, PZ1 = -116, PB = -18, PC = -94;
  K.span(-11, PB - 2, PZ0, 11, PB, PZ1, 'basalt', NC);
  K.span(-11, PB, PZ0 + 2, 11, -2, PZ0, 'ashlarDark', NC); K.span(-11, PB, PZ1, 11, -2, PZ1 - 2, 'ashlarDark', NC);
  K.span(-13, PB, PZ0, -11, 0, PZ1, 'ashlarDark', NC);
  K.span(-4, PB, PC + 4, 4, 0, PC - 4, 'granite');
  K.box(0, 8, PC, 1.4, 16, 1.4, 'gold', NC);
  K.box(0, 16.6, PC, 2.4, 1.2, 2.4, 'gold', NC);
  const ammit = sobekHead(C, 1.1, false);
  ammit.group.position.copy(W(-7.5, PB - 1, PC)); ammit.group.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.25); ammit.jaw.rotation.z = 0.7;
  for (const [x, z] of [[-8, -76], [8, -76], [-8, -112], [8, -112], [-9, -94], [9, -86], [9, -102]]) { FX.flames.add(W(x, PB + 0.3, z), 3.2, GREEN); }
  FX.lights.add(W(0, PB + 4, PC), 0x40ff80, 120, 50, 1);
  const beamP = new Piece();
  beamP.box(0, 0, 0, 1.2, 1.2, 28, 'gold', { col: false });
  beamP.box(0, 2.6, 0, 0.5, 4.4, 1.6, 'white', { col: false });
  for (const dz of [-13.6, 13.6]) beamP.box(0, 0, dz, 1.8, 1.8, 1, 'lapis', { col: false });
  const beam = mover(C, beamP, 0, 16, PC);
  const pans = [13, -13].map((dz) => {
    const P = new Piece();
    P.box(0, -0.5, 0, 11.5, 1, 9.5, 'gold');
    P.box(0, -1.15, 0, 10.6, 0.3, 8.6, 'bronze', { col: false });
    for (const [cx, cz] of [[-5.5, -4.5], [5.5, -4.5], [-5.5, 4.5], [5.5, 4.5]]) rod(P, V(cx, 0, cz), V(0, 16, 0), 0.09, 'bronze');
    return { m: mover(C, P, 0, 0, PC + dz), dz, tip: 0 };
  });
  const seen6 = [], prev6 = [];
  let th = 0, heavy = 0;
  const panAt = (q, th0, tip, dt) => {
    _v.set(O.x, O.y - q.dz * Math.sin(th0), O.z + PC + q.dz * Math.cos(th0));
    q.m.set(_v, Q(0, 0, 1, tip), dt);
  };
  const t17 = new Trap(C, {
    id: 'scales', name: 'Scales of Maat', duration: 4.5, zone: { x0: -11, x1: 11, z0: PZ1, z1: PZ0 }, wait: [0, 0, -67],
    hide: [[0, 0, PC]],
    onFire() {
      const n = [0, 0];
      for (const p of [...prev6, ...seen6]) pans.forEach((q, i) => { if (Math.abs(p.z - (PC + q.dz)) < 5 && Math.abs(p.x) < 6) n[i]++; });
      heavy = n[0] === n[1] ? (Math.random() < 0.5 ? 0 : 1) : n[0] > n[1] ? 0 : 1;
    },
    run(k, dt) {
      seen6.length = 0;
      const tilt = 30 * easeIn(seg(k, 0.3, 1.0)) * (1 - easeInOut(seg(k, 3.2, 4.3)));
      th = ((heavy === 0 ? 1 : -1) * tilt * Math.PI) / 180;
      beam.set(beam.home.pos, Q(1, 0, 0, (th * 180) / Math.PI), dt);
      pans.forEach((q, i) => panAt(q, th, i === heavy ? 80 * easeIn(seg(k, 1.0, 1.35)) * (1 - easeInOut(seg(k, 3.0, 3.6))) * (heavy ? -1 : 1) : 0, dt));
      at(this, k, 0.3, () => SFX.grind(W(0, 10, PC), 1.2, 0.8));
      at(this, k, 1.1, () => { SFX.chomp(W(0, PB, PC), true); C.shake(W(0, 0, PC), 0.5); });
    },
    lethal(p) { seen6.push(p.clone()); return null; },
    idle() { prev6.length = 0; prev6.push(...seen6); seen6.length = 0; },
    onReset() { th = 0; beam.reset(); for (const q of pans) q.m.reset(); },
    sfx() { SFX.tone(392, 1.2, { type: 'triangle', vol: 0.1, to: 196, pos: W(0, 10, PC) }); },
    when: (k) => k > 4.3,
  });
  t17.alwaysLethal = true; // (it looks at who stands on which pan before it fires)
  button(C, t17, PC);
  R.walk(0, 0, -66).gate(t17)
    .jump([0, 0, -71], [0, 0, -81]).jump([0, 0, -84.5], [0, 0, -94]).jump([0, 0, -97.5], [0, 0, -107]).jump([0, 0, -110.5], [0, 0, -120]);
  pit(C, (p) => (p.z < PZ0 + 1 && p.z > PZ1 - 1 && Math.abs(p.x) < 11.5 && p.y - 3 < -6 ? 'ammit' : null));

  // ---- trap 18: the closing walls
  const CZ0 = -128, CZ1 = -166, NS = 4, SL = (CZ0 - CZ1) / NS;
  for (const s of [-1, 1]) K.span(s * 10, 0, CZ0, s * 11, 10, CZ1, 'ashlarDark');
  for (const s of [-1, 1]) K.span(s * 8, 9.6, CZ0 + 0.5, s * 11, 10.4, CZ1 - 0.5, 'gold', NC);
  const cw = [];
  for (let i = 0; i < NS; i++) for (const s of [-1, 1]) {
    const P = new Piece();
    P.box(0, 4.75, 0, 2, 9.5, SL - 0.12, 'glyphsDark');
    P.box(-s * 1.02, 4.75, 0, 0.06, 9.5, 0.5, 'gold', { col: false });
    cw.push({ m: mover(C, P, s * 9, 0, CZ0 - SL * (i + 0.5)), s, i, t0: 0.3 + i * 0.15, x: 8 });
  }
  const t18 = new Trap(C, {
    id: 'walls', name: 'Closing Walls', duration: 3.6, zone: { x0: -8, x1: 8, z0: CZ1, z1: CZ0 }, wait: [0, 0, -123],
    run(k, dt) {
      for (const w of cw) {
        w.x = 8 - 6.8 * easeIn(seg(k, w.t0, w.t0 + 0.45)) * (1 - easeInOut(seg(k, w.t0 + 1.6, w.t0 + 2.6)));
        _v.copy(w.m.home.pos); _v.x = O.x + w.s * (w.x + 1);
        w.m.set(_v, null, dt);
        if (w.s > 0) at(this, k, w.t0 + 0.45, () => { SFX.slam(W(0, 3, CZ0 - SL * (w.i + 0.5)), 0.8); C.shake(W(0, 3, CZ0 - SL * (w.i + 0.5)), 0.4); });
      }
    },
    lethal(p) {
      for (const w of cw) {
        if (w.s < 0 || w.x > 1.6 || p.y - 3 > 9.5) continue;
        const zc = CZ0 - SL * (w.i + 0.5);
        if (Math.abs(p.z - zc) < SL / 2 + 0.3 && Math.abs(p.x) < 8) return 'walls';
      }
      return null;
    },
    onReset() { for (const w of cw) { w.x = 8; w.m.reset(); } },
    sfx() { SFX.grind(W(0, 3, -147), 1.0, 0.8); },
    when: (k) => k > 3.4,
  });
  button(C, t18, -147);
  R.walk(0, 0, -123).gate(t18).walk(0, 0, -172, { w: 2.5 }).walk(0, 0, -204);
  gallery(C, 0, -197, { lo: -20, backH: 8, wall: 'glyphsDark', back: 'glyphsPaint', torchStep: 30 });
  portals(C, -6, -191);
  pit(C, (p) => (p.y - 3 < -30 ? 'fell' : null));
  h.start = W(0, 0, -6); h.end = W(0, 0, END);
  return h;
}

/** Apophis, the serpent of chaos: a great snake's head (facing +x) with a hinged jaw, and a body of segments to drag behind it. */
function serpent(C, n = 14) {
  const g = new THREE.Group(), skin = colorMat(0x6a4a86, 0.35, 0.35, { emissive: 0x200818, emissiveIntensity: 1 }), belly = colorMat(0xd8a040, 0.4, 0.4, { emissive: 0x402000, emissiveIntensity: 1 }), fang = mat('teeth');
  const add = (parent, geo, m, x, y, z, rot) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); if (rot) quatOf(rot, me.quaternion); me.castShadow = true; parent.add(me); return me; };
  add(g, boxGeo(7, 3.2, 5.6), skin, 0, 0.6, 0);
  add(g, boxGeo(5, 1.8, 4.6), skin, 5.4, 0.4, 0);
  add(g, boxGeo(9, 1.2, 4.8), belly, 2.6, -1.6, 0);
  for (const sz of [-1.6, 1.6]) { add(g, new THREE.SphereGeometry(0.7, 10, 8), mat('eyeGlow'), 4.2, 1.9, sz); add(g, boxGeo(3.4, 0.6, 1.2), skin, 3.6, 2.4, sz * 1.05, [0, 0, -12]); }
  for (const sz of [-1.2, 1.2]) add(g, new THREE.ConeGeometry(0.35, 2.2, 6), fang, 6.6, -0.9, sz, [180, 0, 0]);
  const jaw = new THREE.Group(); jaw.position.set(-1.5, -1, 0); g.add(jaw);
  add(jaw, boxGeo(8.6, 1.1, 4.4), skin, 4.3, -0.6, 0);
  for (const sz of [-1.1, 1.1]) add(jaw, new THREE.ConeGeometry(0.3, 1.4, 6), fang, 7.6, 0.3, sz);
  g.scale.setScalar(1.35);
  C.world.scene.add(g);
  const segs = [];
  for (let i = 0; i < n; i++) { const r = 2.6 - i * 0.08; const s = add(C.world.scene, new THREE.SphereGeometry(r, 14, 10), i % 3 === 1 ? belly : skin, 0, -999, 0); s.scale.set(1, 0.85, 1); segs.push(s); }
  return { group: g, jaw, segs };
}

// --- 7. the Lake of Fire ------------------------------------------------------------------------------------------------------------------------------
function hall7(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 6, { name: 'The Lake of Fire', sub: 'Seventh Hall', look: 'duat', L: 240, balY: -12 }, O);
  const R = routeOf(C);
  const P0 = -28, LV = -34, CEIL = 19, END = -240, XL = -72; // the paths, the lava, the cavern's roof
  // down into the underworld: a stair cut in the rock
  K.span(-11, -2, 2, 11, 0, -2, 'floorDark');
  for (let i = 0; i < 40; i++) K.span(-8, P0, -2 - i, 8, -0.7 * (i + 1), -3 - i, i % 10 === 9 ? 'basalt' : 'rockDark');
  for (const sx of [-1, 1]) K.span(sx * 8, P0, 2, sx * 11, CEIL, -42, 'rockDark');
  K.span(-11, 9, 2, 11, CEIL, -2, 'rockDark');
  K.span(-11, CEIL, 2, 11, CEIL + 2, -40, 'rockDark', NC);
  for (let z = -8; z > -40; z -= 10) for (const sx of [-1, 1]) A.torch(K, FX, sx * 7.9, -0.7 * (-2 - z) + 4.5, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { color: 0xff9050, intensity: 40, range: 24 });
  // the cavern: a lake of fire under a roof of rock, its walls ragged
  K.span(XL - 2, CEIL, -40, 26, CEIL + 2, END, 'rockDark', NC);
  K.span(XL - 2, LV - 6, -40, XL, CEIL, END, 'rockDark');
  K.span(XL - 2, LV - 6, -40, -11, CEIL, -43, 'rockDark');
  for (const [x0, x1, y0, y1] of [[XL - 2, -7, LV - 6, CEIL], [7, 26, LV - 6, CEIL], [-7, 7, P0 + 14, CEIL], [-7, 7, LV - 6, P0]]) K.span(x0, y0, END + 3, x1, y1, END, 'rockDark');
  K.span(XL, LV - 8, -40, 11, LV - 6, END, 'basalt', NC);
  lava(C, XL, 11, -42, END + 2, LV);
  crags(K, XL + 2, -46, XL + 2, END + 6, () => [LV, CEIL - 4], 26, 71, 'rockDark');
  crags(K, XL + 4, -42, -14, -42, () => [LV, CEIL - 4], 10, 72, 'rockDark');
  const r = rng(707);
  for (let i = 0; i < 26; i++) { const x = XL + 6 + r() * 74, z = -50 - r() * 180, hh = 3 + r() * 9; if (x > -14) continue; K.taper(x, CEIL - hh / 2, z, 0.3, 0.3, 2 + r() * 2.5, 2 + r() * 2.5, hh, 'rockDark', { ...NC, rot: [180, r() * 90, 0] }); }
  for (let i = 0; i < 9; i++) { const x = XL + 5 + r() * 9, z = -60 - r() * 160; K.taper(x, (LV + CEIL) / 2, z, 5 + r() * 4, 5 + r() * 4, 2.5, 2.5, CEIL - LV, 'rockDark', NC); }
  for (let i = 0; i < 10; i++) FX.lights.add(W(XL + 10 + (i % 5) * 14, LV + 3, -55 - i * 18), 0xff5a18, 110, 46, 1);
  // the boat of Ra crossing the lake of night
  const barque = new Piece();
  barque.box(0, 0.8, 0, 4, 1.6, 22, 'gold', { col: false });
  for (const s of [-1, 1]) barque.add(taperGeo(4, 3, 1, 1, 5, 4), 'gold', 0, 2.6, s * 12, [s * -35, 0, 0]);
  barque.box(0, 3, 0, 3, 3, 5, 'lapis', { col: false });
  barque.add(cylGeo(2.2, 2.2, 0.4, 24), 'sunGlow', 0, 7.2, 0, [0, 0, 90]);
  const bq = mover(C, barque, -42, LV - 0.4, -120);
  FX.lights.add(W(-42, LV + 9, -120), 0xffc060, 90, 40, 0);
  C.every((t) => { const a = t * 0.05; bq.group.position.set(O.x - 42 + Math.sin(a) * 10, O.y + LV - 0.4 + Math.sin(t * 0.9) * 0.3, O.z - 120 + Math.cos(a) * 40); bq.group.rotation.y = a + Math.PI / 2; bq.group.rotation.z = Math.sin(t * 0.7) * 0.03; });

  // ---- trap 19: the fire pillars - the vents in the rock path breathe columns of fire
  K.span(-11, LV - 6, -42, 11, P0, -92, 'rockDark');
  K.span(-11, P0 - 0.2, -42, 11, P0 + 0.01, -92, 'basalt', NC);
  const vents = [[-6, -56], [6, -56], [0, -70], [-9, -70], [9, -70], [-6, -84], [6, -84]];
  const pillars = vents.map(([x, z]) => {
    K.cyl(x, P0 + 0.06, z, 2.2, 0.12, 'black', { ...NC, seg: 14 });
    K.cyl(x, P0 + 0.07, z, 1.5, 0.12, colorMat(0xff5010, 0.6, 0, { emissive: 0xff3000, emissiveIntensity: 2 }), { ...NC, seg: 12 });
    return { x, z, jet: flameJet(C, W(x, P0, z), V(0, 1, 0), 26, { r0: 1.8, r1: 3.8, gain: 0.45 }) };
  });
  const t19 = new Trap(C, {
    id: 'firepillars', name: 'Fire Pillars', duration: 4.6, zone: { x0: -11, x1: 11, z0: -90, z1: -48 }, wait: [0, P0, -46],
    hide: [[0, P0, -56], [-4.5, P0, -70], [4.5, P0, -70], [0, P0, -84]],
    run(k) {
      const v = k < 0.45 ? 0.08 * (k / 0.45) : k < 0.6 ? (k - 0.45) / 0.15 : k < 4.0 ? 1 : Math.max(0, 1 - (k - 4.0) / 0.4);
      for (const p of pillars) p.jet.set(v);
      at(this, k, 0.45, () => SFX.fire(W(0, P0 + 4, -70), 3.8, 0.9));
    },
    lethal(p, ch, k) { if (k < 0.5 || k > 4.1) return null; for (const q of pillars) if (inColumn(p, q.x, q.z, 3.1, P0 - 1, P0 + 26)) return 'fire'; return null; },
    onReset() { for (const p of pillars) p.jet.set(0); },
    sfx() { SFX.burst(0.5, { kind: 'brown', type: 'lowpass', f: 300, vol: 0.4, pos: W(0, P0, -70) }); },
    when: (k) => k > 4.4,
  });
  t19.zoneY = P0;
  button(C, t19, -70);
  R.walk(0, 0, -1, { w: 2 }).walk(0, P0, -44, { w: 2.5 }).gate(t19).walk(0, P0, -94);

  // ---- trap 20: the bridge of ash - it crumbles into the fire from the near end; run!
  K.span(-11, LV - 6, -92, 11, P0, -96, 'rockDark');
  const NSG = 11, bseg = [];
  for (let i = 0; i < NSG; i++) {
    const P = new Piece();
    P.box(0, -0.8, 0, 6, 1.6, 4.9, 'rockDark');
    P.box(0, -2.2, 0, 4.4, 1.4, 4.2, 'basalt', { col: false });
    for (const sx of [-2.8, 2.8]) P.box(sx, 0.35, 0, 0.4, 0.7, 4.9, 'basalt', { col: false });
    bseg.push({ m: mover(C, P, 0, P0, -98.5 - i * 5), i, t0: 0.4 + (i * 5) / 13, rx: rnd(-1, 1), rz: rnd(-1, 1) });
  }
  const t20 = new Trap(C, {
    id: 'bridge', name: 'Bridge of Ash', duration: 9, zone: { x0: -4, x1: 4, z0: -151, z1: -96 }, wait: [0, P0, -94],
    run(k, dt) {
      for (const b of bseg) {
        const f = easeIn(seg(k, b.t0, b.t0 + 1.1)), back = easeInOut(seg(k, 6.6, 8.6)), d = f * (1 - back);
        _v.copy(b.m.home.pos); _v.y -= 14 * d;
        b.m.set(_v, Q(b.rx, 0, b.rz, 40 * d), dt);
        if (k > b.t0 && k < b.t0 + 0.12 && Math.random() < 0.7) C.FX.glow.puff(b.m.pos.clone(), 0xff7a20, 4, 1.4, 6, 0.8, 4);
        at(this, k, b.t0, () => { if (b.i % 3 === 0) SFX.grind(b.m.pos, 0.7, 0.5); });
      }
    },
    onReset() { for (const b of bseg) b.m.reset(); },
    sfx() { SFX.slam(W(0, P0, -98), 0.5); },
    when: (k) => k > 8.6,
  });
  t20.zoneY = P0;
  button(C, t20, -122);
  K.span(-11, LV - 6, -150.5, 11, P0, -160, 'rockDark');
  R.gate(t20).walk(0, P0, -154, { w: 0.6 });

  // ---- trap 21: Apophis - the serpent rises out of the fire and strikes across the path
  K.span(-11, LV - 6, -160, 11, P0, END + 3, 'rockDark');
  K.span(-11, P0 - 0.2, -160, 11, P0 + 0.01, END + 3, 'basalt', NC);
  const snakes = [];
  for (const [zs, dly] of [[-172, 0.35], [-194, 1.55]]) {
    const S = serpent(C);
    const home = W(-34, LV - 3, zs);
    S.group.position.copy(home);
    snakes.push({ ...S, z: zs, dly, home });
  }
  const placeBody = (sn, f) => {
    // from the coil in the lava to the back of the head
    const hx = sn.group.position.x - O.x, hy = sn.group.position.y - O.y;
    for (let i = 0; i < sn.segs.length; i++) {
      const t = i / (sn.segs.length - 1);
      const x = lerp(hx - 4, -46, t), y = lerp(hy, LV - 1, t) + Math.sin(t * Math.PI) * (4 + 10 * f), z = sn.z + Math.sin(t * 5 + sn.z) * 3 * (1 - t * 0.5);
      sn.segs[i].position.copy(W(x, y, z));
    }
  };
  for (const s of snakes) placeBody(s, 0);
  const t21 = new Trap(C, {
    id: 'apophis', name: 'Apophis', duration: 4.2, zone: { x0: -11, x1: 11, z0: -206, z1: -162 }, wait: [0, P0, -156],
    hide: [[0, P0, -183]],
    run(k) {
      for (const s of snakes) {
        const t = k - s.dly, up = easeOut(seg(t, 0, 0.5)), back = easeInOut(seg(t, 1.2, 2.1)), f = up * (1 - back);
        s.group.position.set(s.home.x + 30 * f, s.home.y + 13 * f, s.home.z);
        s.group.rotation.z = -0.25 * f;
        s.jaw.rotation.z = t < 0.5 ? -0.9 * up : t < 0.62 ? -0.9 * (1 - (t - 0.5) / 0.12) : 0;
        placeBody(s, f);
        at(this, k, s.dly, () => { SFX.burst(0.7, { kind: 'pink', type: 'bandpass', f: 500, to: 2400, q: 1.2, vol: 0.4, pos: W(-20, P0, s.z) }); C.FX.glow.puff(W(-30, LV + 1, s.z), 0xff6a20, 30, 2, 18, 1.2, 4); });
        at(this, k, s.dly + 0.55, () => { SFX.chomp(W(0, P0 + 2, s.z), true); C.shake(W(0, P0, s.z), 0.6); });
      }
    },
    lethal(p, ch, k) {
      for (const s of snakes) { const t = k - s.dly; if (t > 0.42 && t < 0.8 && Math.abs(p.z - s.z) < 4.6 && p.x > -12 && p.x < 7 && p.y - 3 < P0 + 6) return 'serpent'; }
      return null;
    },
    onReset() { for (const s of snakes) { s.group.position.copy(s.home); s.group.rotation.z = 0; s.jaw.rotation.z = 0; placeBody(s, 0); } },
    sfx() { SFX.groan(W(-30, LV, -183)); },
    when: (k) => k > 4,
  });
  t21.zoneY = P0;
  button(C, t21, -183);
  R.gate(t21).walk(0, P0, -212).walk(0, P0, -244);
  // the door at the far end, into the foundations of the pyramid
  K.span(-11, P0, END + 3, 11, P0 + 0.01, END, 'basalt', NC);
  for (const sx of [-1, 1]) K.box(sx * 8.5, P0 + 7, END + 4, 3, 14, 2, 'gold');
  K.box(0, P0 + 15, END + 4, 20, 2.4, 2.2, 'gold');
  gallery(C, -44, -236, { lo: LV - 6, backH: 30, wall: 'rockDark', back: 'rockDark', floor: 'basalt', torchStep: 34 });
  portals(C, -50, -230);
  pit(C, (p) => (p.y - 3 < LV + 1 ? 'lava' : null));
  h.start = W(0, 0, -2); h.end = W(0, P0, END);
  return h;
}

// --- 8. the Ascent of Ra -------------------------------------------------------------------------------------------------------------------------------
function hall8(C, O) {
  const K = C.K, FX = C.FX, W = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const h = beginHall(C, 7, { name: 'The Ascent of Ra', sub: 'Eighth Hall', look: 'ascent', L: 230, balY: 64 }, O);
  const R = routeOf(C);
  const G0 = -20, G1 = -120, TOPY = 50, END = -228; // the Grand Gallery climbs from z -20 (y 0) to z -120 (y 50)
  const slope = (z) => clamp((G0 - z) / 2, 0, TOPY);
  // the pyramid itself, standing on the plateau over all this
  A.pyramid(K, 0, 52, -115, 320, 200, { far: true });
  // the chamber under the pyramid where we come in
  K.span(-11, -2, 4, 11, 0, G0, 'floorDark');
  for (const sx of [-1, 1]) K.span(sx * 11, -2, 4, sx * 13, 16, G0, 'granite');
  K.span(-13, 16, 4, 13, 18, G0, 'granite', NC);
  for (const sx of [-1, 1]) A.torch(K, FX, sx * 10.9, 6, -8, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { intensity: 50 });
  // the Grand Gallery: a stair in a trough between two ledges, under a corbelled vault
  for (let i = 0; i < 50; i++) {
    const za = G0 - 2 * i, zb = za - 2, y = i + 1;
    K.span(-6, y - 1.6, za, 6, y, zb, i % 5 === 4 ? 'granite' : 'ashlarDark');
    for (const sx of [-1, 1]) K.span(sx * 6, y - 0.5, za, sx * 11, y + 1.1, zb, 'granite');
  }
  for (const sx of [-1, 1]) {
    const x0 = sx * 11, x1 = sx * 13, ge = sx > 0 ? -112 : G1; // (on the right the gallery's wall takes over at the top)
    shearBox(C, Math.min(x0, x1), Math.max(x0, x1), G0, ge, slope(G0) - 2, slope(G0) + 14, slope(ge) - 2, slope(ge) + 14, 'granite');
    for (let j = 1; j <= 4; j++) {
      const xi = sx * (11 - 0.8 * j);
      shearBox(C, Math.min(xi, x0), Math.max(xi, x0), G0, ge, slope(G0) + 12 + 2 * j, slope(G0) + 14 + 2 * j, slope(ge) + 12 + 2 * j, slope(ge) + 14 + 2 * j, 'granite', NC);
    }
  }
  shearBox(C, -8, 8, G0, G1, slope(G0) + 22, slope(G0) + 24, slope(G1) + 22, slope(G1) + 24, 'granite', NC);
  K.span(-13, 16, G0, 13, 26, G0 - 1.5, 'granite', NC);
  for (let z = G0 - 14; z > G1 + 6; z -= 16) for (const sx of [-1, 1]) A.torch(K, FX, sx * 10.9, slope(z) + 8, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { intensity: 46, range: 30 });

  // ---- trap 22: the granite plugs - three blocks slide down the trough; get up on a ledge
  const plugs = [];
  for (let i = 0; i < 3; i++) {
    const P = new Piece();
    P.box(0, 3.5, 0, 11.8, 7, 8.6, 'granite');
    P.box(0, 3.5, 4.32, 9, 4.4, 0.05, 'glyphsGranite', { col: false });
    const m = mover(C, P, 0, TOPY + 14, G1 + 2 - i * 0.01);
    m.visible(false); m.solid(false);
    plugs.push({ m, t0: 0.4 + i * 0.55, z: G1, v: 0, ph: 0 });
  }
  const tilt = Q(1, 0, 0, (Math.atan2(1, 2) * 180) / Math.PI);
  const placePlug = (q, dt) => {
    let y;
    if (q.ph === 1) y = slope(q.z) + 1; else if (q.ph === 2) y = slope(q.z) + 1 - q.sink; else y = TOPY + 14;
    _v.set(O.x, O.y + y, O.z + q.z);
    q.m.set(_v, tilt, dt);
  };
  const t22 = new Trap(C, {
    id: 'plugs', name: 'Granite Plugs', duration: 6.6, zone: { x0: -11, x1: 11, z0: G1, z1: G0 }, wait: [0, 0, -12],
    hide: [-30, -46, -62, -78, -94, -110].flatMap((z) => [[8.5, slope(z) + 1.1, z], [-8.5, slope(z) + 1.1, z]]),
    run(k, dt) {
      dt = Math.min(dt, 1 / 20);
      for (const q of plugs) {
        if (k < q.t0) continue;
        if (q.ph === 0) { q.ph = 1; q.z = G1 + 4; q.v = 6; q.sink = 0; q.m.visible(true); q.m.solid(true); SFX.slam(W(0, TOPY, G1), 0.7); }
        if (q.ph === 1) {
          q.v = Math.min(36, q.v + 30 * dt); q.z += q.v * dt;
          if (Math.random() < 0.6) C.FX.dust.puff(W(rnd(-5, 5), slope(q.z) + 1, q.z - 4), 0x9a8a70, 2, 2.5, 4, 1, 1);
          if (q.z > G0 - 8) { q.ph = 2; q.z = G0 - 8; SFX.slam(W(0, 4, G0 - 8), 1.2); C.shake(W(0, 4, G0 - 8), 0.8); C.FX.dust.puff(W(0, 5, G0 - 8), 0x9a8a70, 40, 5, 16, 1.6, 2); }
        } else if (q.ph === 2) { q.sink = Math.min(12, q.sink + 30 * dt); if (q.sink >= 12) { q.ph = 3; q.m.visible(false); q.m.solid(false); } }
        if (q.ph < 3) placePlug(q, dt);
      }
      at(this, k, 0.2, () => SFX.grind(W(0, TOPY - 10, G1 + 10), 5, 0.9));
    },
    lethal(p) {
      if (Math.abs(p.x) > 6.4) return null;
      for (const q of plugs) {
        if (q.ph !== 1) continue;
        const bottom = slope(q.z) + 1, feet = p.y - 3;
        if (Math.abs(p.z - q.z) < 5.3 && feet < bottom + 7 && feet > bottom - 3) return 'plug';
      }
      return null;
    },
    onReset() { for (const q of plugs) { q.ph = 0; q.m.reset(); q.m.visible(false); q.m.solid(false); } },
    sfx() { SFX.tone(98, 1.4, { type: 'sawtooth', vol: 0.12, lp: 400, pos: W(0, TOPY, G1) }); },
    when: (k) => k > 6.2,
  });
  t22.zoneY = 25; t22.zoneH = 40;
  // the Pharaoh's bridge across the top of the gallery, looking straight down it
  K.span(-11, 62.5, -114, 12.6, 64, -122, 'floor');
  K.span(-11, 64, -113.4, 12.6, 65.2, -114, 'ashlarPale');
  for (const sx of [-1, 1]) K.box(sx * 9.5, 66, -114.2, 1.2, 4, 1.2, 'gold', NC);
  button(C, t22, -118, { x: 0, rot: Math.PI });
  R.walk(0, 0, -4).walk(0, 0, -12).gate(t22).walk(0, TOPY, -121, { r: 2.5, w: 2.5 });

  // ---- trap 23: the sunbeams of Ra - the floor of the antechamber is a board of sixteen stones; the sun burns down on them in turn
  const AZ0 = -125, AZ1 = -145, ROOF = 78;
  K.span(-11, TOPY - 2, G1, 11, TOPY, AZ0, 'floorDark');
  K.span(-11, TOPY - 2, AZ0, 11, TOPY, AZ1, 'granite');
  for (let i = 1; i < 4; i++) { K.box(-10 + i * 5, TOPY + 0.02, (AZ0 + AZ1) / 2, 0.15, 0.05, 20, 'gold', NC); K.box(0, TOPY + 0.02, AZ0 - i * 5, 20, 0.05, 0.15, 'gold', NC); }
  K.span(-13, TOPY - 2, G1, -11, ROOF, -150, 'glyphsGranite');
  K.span(-13, ROOF, G1, 26, ROOF + 2, END - 2, 'granite', NC);
  const tiles = [], glowM = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = -7.5 + i * 5, z = AZ0 - 2.5 - j * 5;
    const gm = glowM.clone();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8).rotateX(-Math.PI / 2), gm); glow.position.copy(W(x, TOPY + 0.08, z)); C.world.scene.add(glow);
    const beam = lightShaft(2.1, 2.5, ROOF - TOPY, 0xfff0b8, 0.5); beam.position.copy(W(x, ROOF, z)); beam.visible = false; C.world.scene.add(beam);
    K.box(x, ROOF - 0.05, z, 2.4, 0.2, 2.4, 'black', NC);
    tiles.push({ i, j, x, z, gm, beam, on: 0 });
  }
  const WAVES = [
    { t: 0.3, set: (t) => (t.i + t.j) % 2 === 0 && !(t.i === 0 && t.j === 0) && !(t.i === 3 && t.j === 3) },
    { t: 2.0, set: (t) => (t.i + t.j) % 2 === 1 },
    { t: 3.7, set: (t) => t.j === 1 || t.j === 2 },
  ];
  const t23 = new Trap(C, {
    id: 'sunbeams', name: 'Sunbeams of Ra', duration: 5.4, zone: { x0: -10, x1: 10, z0: AZ1, z1: AZ0 }, wait: [0, TOPY, -122],
    hide: [[-7.5, TOPY, AZ0 - 2.5], [7.5, TOPY, AZ1 + 2.5]],
    run(k) {
      for (const t of tiles) {
        let warn = 0, burn = 0;
        for (const w of WAVES) if (w.set(t)) { if (k > w.t && k < w.t + 0.7) warn = (k - w.t) / 0.7; if (k >= w.t + 0.7 && k < w.t + 1.5) burn = 1; }
        t.on = burn;
        t.gm.opacity = burn ? 0.85 : warn * 0.35;
        t.beam.visible = burn > 0 || warn > 0.6;
        t.beam.material.uniforms.a.value = burn ? 0.55 : 0.12;
        if (burn && Math.random() < 0.3) C.FX.glow.puff(W(t.x + rnd(-2, 2), TOPY + 0.5, t.z + rnd(-2, 2)), 0xffd070, 2, 1.2, 3, 0.6, -3);
      }
      for (const w of WAVES) at(this, k, w.t + 0.7, () => { SFX.burst(0.8, { kind: 'pink', type: 'highpass', f: 1800, vol: 0.3, pos: W(0, TOPY + 4, -135) }); SFX.tone(1320, 0.8, { type: 'sine', vol: 0.06, pos: W(0, TOPY + 4, -135) }); });
    },
    lethal(p) {
      if (p.y - 3 > TOPY + 8) return null;
      const i = Math.floor((p.x + 10) / 5), j = Math.floor((AZ0 - p.z) / 5);
      const t = tiles.find((q) => q.i === i && q.j === j);
      return t && t.on ? 'sunbeam' : null;
    },
    onReset() { for (const t of tiles) { t.on = 0; t.gm.opacity = 0; t.beam.visible = false; } },
    sfx() { SFX.tone(660, 0.5, { type: 'sine', to: 990, vol: 0.1, pos: W(0, TOPY + 4, -135) }); },
    when: (k) => k > 5.2,
  });
  t23.zoneY = TOPY;
  button(C, t23, -135);
  R.walk(0, TOPY, -123).gate(t23).walk(0, TOPY, -147.5);

  // ---- trap 24: the falling capstones - stepping stones over a deep well; they drop one by one
  const WZ0 = -150, WZ1 = -192, WB = 12;
  K.span(-11, TOPY - 2, AZ1, 11, TOPY, WZ0, 'floorDark');
  K.span(-11, WB - 2, WZ0, 11, WB, WZ1, 'basalt', NC);
  for (let x = -9; x < 10; x += 3) for (let z = WZ0 - 2; z > WZ1 + 1; z -= 3) K.geo(new THREE.ConeGeometry(0.5, 3, 6), 'bronze', x + ((z | 0) % 2) * 0.8, WB + 1.5, z, 0);
  K.span(-13, WB - 2, -150, -11, ROOF, END - 2, 'glyphsGranite');
  K.span(11, WB - 2, -150, 13, TOPY - 10, WZ1 - 1, 'glyphsGranite');
  K.span(-11, WB, WZ0 + 0.01, 11, TOPY - 2, WZ0 - 1, 'granite', NC); K.span(-11, WB, WZ1, 11, TOPY - 2, WZ1 - 1, 'granite', NC);
  const STONES = [[0, -155], [-5, -163], [0, -171], [5, -179], [0, -187]], caps = [];
  STONES.forEach(([x, z], i) => {
    const P = new Piece();
    P.box(0, -1.2, 0, 5, 2.4, 5, 'granite');
    P.box(0, 0.06, 0, 4.6, 0.12, 4.6, 'gold', { col: false });
    P.add(cylGeo(0.7, 1.2, TOPY - WB - 4, 8), 'granite', 0, -2.4 - (TOPY - WB - 4) / 2, 0);
    caps.push({ m: mover(C, P, x, TOPY, z), t0: 0.3 + i * 0.4, rx: rnd(-1, 1), rz: rnd(-1, 1) });
  });
  const t24 = new Trap(C, {
    id: 'capstones', name: 'Falling Capstones', duration: 9, zone: { x0: -11, x1: 11, z0: WZ1, z1: WZ0 }, wait: [0, TOPY, -147],
    run(k, dt) {
      for (const c of caps) {
        const f = easeIn(seg(k, c.t0, c.t0 + 1.2)), back = easeInOut(seg(k, 6.5, 8.5)), d = f * (1 - back);
        _v.copy(c.m.home.pos); _v.y -= (TOPY - WB) * d;
        c.m.set(_v, Q(c.rx, 0, c.rz, 25 * d), dt);
        if (k > c.t0 && k < c.t0 + 0.1 && Math.random() < 0.7) C.FX.dust.puff(c.m.pos.clone(), 0xa89878, 6, 2, 5, 1, 2);
        at(this, k, c.t0, () => SFX.grind(c.m.pos, 0.6, 0.5));
        at(this, k, c.t0 + 1.2, () => SFX.slam(W(c.m.home.pos.x - O.x, WB, c.m.home.pos.z - O.z), 0.6));
      }
    },
    onReset() { for (const c of caps) c.m.reset(); },
    sfx() { SFX.grind(W(0, TOPY, -170), 0.5, 0.6); },
    when: (k) => k > 8.6,
  });
  t24.zoneY = TOPY;
  button(C, t24, -171);
  R.gate(t24);
  {
    const path = [[0, -149], ...STONES, [0, -195]];
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i], L = Math.hypot(bx - ax, bz - az), f = i === 1 ? 0.4 : 1.4;
      R.jump([ax + ((bx - ax) / L) * f, TOPY, az + ((bz - az) / L) * f], [bx, TOPY, bz]);
    }
  }
  pit(C, (p) => (p.z < WZ0 + 0.5 && p.z > WZ1 - 0.5 && p.y - 3 < TOPY - 6 ? 'capstone' : null));

  // ---- the King's Chamber: red granite, the empty sarcophagus, the Eye of Ra
  K.span(-11, TOPY - 2, WZ1, 11, TOPY, END - 2, 'floorDark');
  K.span(-13, TOPY - 2, END + 2, 26, ROOF, END - 2, 'granite');
  K.span(-11, TOPY + 0.01, -200, 11, TOPY + 0.05, END + 2, 'granite', NC);
  A.coffin(K, -7, TOPY, -214, 0, 1.3);
  for (const sx of [-1, 1]) A.brazier(K, FX, sx * 8.5, TOPY, -202, { h: 3.5, color: 0xffd070, lightColor: 0xffc060, intensity: 120 });
  // the Eye: an almond of gold, a lapis pupil that wakes, the falcon's markings, the sun disk above
  const EZ = END + 2.1, EY = TOPY + 12;
  K.geo(new THREE.SphereGeometry(1, 24, 12).scale(5.2, 2.1, 0.5), 'gold', 0, EY, EZ, 0);
  K.box(0, EY + 3.2, EZ + 0.2, 11, 0.9, 0.5, 'gold', NC);
  K.box(-0.8, EY - 4.2, EZ + 0.2, 0.9, 4.6, 0.5, 'gold', NC);
  K.geo(new THREE.TorusGeometry(1.6, 0.42, 8, 16, Math.PI * 1.4), 'gold', 3.6, EY - 5.2, EZ + 0.2, [0, 0, 160]);
  const pupilM = colorMat(0x1f3c8c, 0.3, 0.3, { emissive: 0xffd060, emissiveIntensity: 0 }).clone();
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 12), pupilM); pupil.position.copy(W(0.4, EY, EZ + 0.5)); C.world.scene.add(pupil);
  const discM = colorMat(0xffd060, 0.3, 0, { emissive: 0xffb030, emissiveIntensity: 0.6 }).clone();
  const disc = new THREE.Mesh(cylGeo(3.4, 3.4, 0.5, 32), discM); disc.position.copy(W(0, EY + 8.5, EZ + 0.3)); disc.rotation.x = Math.PI / 2; C.world.scene.add(disc);
  for (const sx of [-1, 1]) K.box(sx * 4.6, EY + 8.5, EZ + 0.3, 3, 1.4, 0.4, 'lapis', NC);
  const apex = lightShaft(5, 14, 900, 0xffe7a0, 0.0);
  apex.position.copy(W(0, 52 + 199, -115)); apex.rotation.x = Math.PI; apex.visible = false; C.world.scene.add(apex);
  const chamberLight = FX.lights.add(W(0, EY, END + 8), 0xffd070, 0, 60, 0);
  const shaft = lightShaft(3, 7, 30, 0xffe7a0, 0); shaft.position.copy(W(0, ROOF, -212)); C.world.scene.add(shaft);
  C.eye = {
    k: 0,
    open(on) { this.on = on; },
    update(dt) {
      this.k = clamp(this.k + (this.on ? dt / 2 : -dt), 0, 1);
      pupilM.emissiveIntensity = 3 * this.k; discM.emissiveIntensity = 0.6 + 3 * this.k;
      apex.material.uniforms.a.value = 0.5 * this.k; apex.visible = this.k > 0.01;
      shaft.material.uniforms.a.value = 0.45 * this.k; shaft.visible = this.k > 0.01;
      chamberLight.intensity = 180 * this.k; chamberLight.on = this.k > 0.01;
    },
  };
  C.every((t, dt) => C.eye.update(dt));
  C.finish = { x0: O.x - 11, x1: O.x + 11, y0: O.y + TOPY, z0: O.z + END + 2, z1: O.z - 200 };
  R.walk(0, TOPY, -206).walk(0, TOPY, -212);
  gallery(C, -112, END + 2, { lo: TOPY - 10, backH: 14, wall: false, back: 'glyphsPaint', floor: 'floorDark', torchStep: 30 });
  for (const [a, b, y0, y1] of [[-112, -114, TOPY - 10, 67.2], [-114, -122, TOPY - 10, 62.5], [-122, END + 2, TOPY - 10, 67.2]]) K.span(11, y0, a, 12.6, y1, b, 'glyphsGranite');
  K.span(10.7, 67.2, -122, 12.9, 68, END + 2, 'ashlarPale', NC);
  portals(C, -125, -222);
  pit(C, (p) => (p.y - 3 < -12 ? 'fell' : null));
  h.start = W(0, 0, -4); h.end = W(0, TOPY, END);
  return h;
}

// --- the whole course -------------------------------------------------------------------------------------------------------------------
export function buildCourse(world, FX) {
  const C = makeContext(world, FX);
  buildCamp(C);
  desert(C);
  hall1(C, V(0, 0, 0));
  hall2(C, V(0, 0, -240));
  hall3(C, V(0, 12, -470));
  hall4(C, V(0, 12, -690));
  hall5(C, V(0, 12, -920));
  hall6(C, V(0, -12, -1150));
  hall7(C, V(0, -12, -1350));
  hall8(C, V(0, -40, -1590));
  C.K.flush();
  // (the finish is the King's Chamber; without it, the end of the last hall)
  const last = C.halls[C.halls.length - 1];
  C.finish = C.finish || { x0: last.O.x - 11, x1: last.O.x + 11, y0: last.O.y, z0: last.O.z - last.L, z1: last.O.z - last.L + 10 };
  C.finishZ = C.finish ? (C.finish.z0 + C.finish.z1) / 2 : last.O.z - last.L;
  return C;
}
