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
import { Kit, V, Piece, Mover, mat, special, colorMat, boxGeo, cylGeo, scaleOf, clamp, lerp, smooth, rnd } from './kit.js';
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
function button(C, trap, z) {
  const h = C.hall, K = C.K;
  const pos = K.W(BAL.mid + 2.4, h.balY, z);
  const b = A.scarabButton(C.world, pos, -Math.PI / 2);
  trap.button = b; trap.buttonPos = K.W(BAL.mid, h.balY, z);
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
  water(C, -420, 11, 3000, -1500, -9, { color: 0x2c6a62, repeat: 160, flow: 1.4 });
  K.span(-420, -17, 3000, 11, -15, -1500, colorMat(0x3a3020, 1), NC);
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
        const t0 = s.r * 0.18 + s.c * 0.06;
        const fall = seg(k, t0, t0 + 0.9), back = seg(k, 4.8, 6.6);
        const d = easeIn(fall) * 16 * (1 - easeInOut(back));
        _v.copy(s.m.home.pos); _v.y -= d;
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
    id: 'geysers', name: 'Sand Geysers', duration: 4.2, zone: { x0: -11, x1: 11, z0: -204, z1: -174 }, wait: [0, 0, -166], hide: [[0, 0, -189]],
    run(k) { for (const v of vents) v.col.set(k < 0.25 ? k / 0.25 * 0.3 : k < 3.4 ? 1 : 1 - seg(k, 3.4, 4.1)); },
    lethal(p, ch, k) { if (k < 0.2 || k > 3.6) return null; for (const v of vents) if (inColumn(p, v.x, v.z, 3.4, -1, 28)) return 'geyser'; return null; },
    onReset() { for (const v of vents) v.col.set(0); },
    sfx() { SFX.sand(W(0, 0, -189), 4); },
    when: (k) => k > 3.8,
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
const JET_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const JET_FS = `uniform float t, k; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float a = vUv.y;
    float f = 0.55 + 0.45 * sin(vUv.x * 37.699 + t * 21.0 - a * 26.0) * sin(vUv.x * 18.85 - t * 29.0 + a * 11.0);
    float edge = pow(abs(dot(vN, vV)), 0.7);
    vec3 c = mix(vec3(1.0, 0.92, 0.65) * 2.6, vec3(1.0, 0.32, 0.04) * 1.6, smoothstep(0.05, 0.8, a));
    gl_FragColor = vec4(c, k * edge * f * smoothstep(0.0, 0.06, a) * (1.0 - smoothstep(0.7, 1.0, a)));
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
    m.uniforms.t.value = t; m.uniforms.k.value = v;
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
  D(26, 3000, -37, -700);
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
      return nearBall(p, B, BR + 0.7, B.ph === 3 && Math.abs(p.x) < 10.8 ? 0.62 : 1) ? 'boulder' : null;
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
    jets.push({ z: zH, jet: flameJet(C, K.W(...S.P(0, 8.6 - 0.75 * u, 2.2 + 1.3 * u)), V(-s, -0.2, 0).normalize(), 19) });
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
    const b = lightShaft(2.6, 4.8, 92, 0xffe0a8, 0.075);
    b.position.copy(W(X0 - 1, 38, zc)); b.quaternion.setFromUnitVectors(V(0, 1, 0), SUN_DIR);
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
  R.gate(t8).walk(0, 0, -134);

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
    spearSecs.push({ m, side, s, t0: 0.35 + s * 0.12 });
  }
  const t9 = new Trap(C, {
    id: 'spears', name: 'Spear Wall', duration: 2.6, zone: { x0: -CX, x1: CX, z0: Z1, z1: Z0 }, wait: [0, 0, -144],
    run(k, dt) {
      for (const q of spearSecs) {
        const out = easeOut(seg(k, q.t0, q.t0 + 0.1)) * (1 - easeInOut(seg(k, q.t0 + 1.1, q.t0 + 1.6)));
        _v.copy(q.m.home.pos); _v.x -= q.side * 9 * out;
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
    when: (k) => k > 2.4,
  });
  button(C, t9, -173);
  R.gate(t9).walk(0, 0, -200).walk(0, 0, -224);
  gallery(C, -4, -216, { back: 'glyphsPaint', backH: 29, torchStep: 30 });
  portals(C, -10, -210);
  pit(C, (p) => (p.y - 3 < -20 ? 'fell' : null));
  h.start = W(0, 0, -6); h.end = W(0, 0, END);
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
  C.K.flush();
  // (until the last hall exists, the end of the causeway is the finish)
  const last = C.halls[C.halls.length - 1];
  C.finish = C.finish || { x0: last.O.x - 11, x1: last.O.x + 11, y0: last.O.y, z0: last.O.z - last.L, z1: last.O.z - last.L + 10 };
  C.finishZ = last.O.z - last.L;
  return C;
}
