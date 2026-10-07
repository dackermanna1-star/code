// The rest of the furniture: the basement (pipes, the boiler, the laundry,
// the workshop, storage), the fire's ruins (debris, charred beams, boards
// over doorways), the building's structure (columns, balustrades, stairs)
// and the children's room. Same conventions as props.js.
import * as THREE from 'three';
import { H } from './state.js';
import { M4, bake, boxGeo, cylGeo, sphereGeo } from './kit.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { WM } from './props.js';

const at = (x, y, z, ry = 0) => H.kit.at(x, y, z, ry);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

// --- pipes ------------------------------------------------------------------------------------------------------------------
/** A pipe along a world-space polyline, with elbows and flanges at the joints. */
export function pipeRun(pts, r = 0.25, mat = H.M.pipe, o = {}) {
  const k = H.kit, P = pts.map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], d = b.clone().sub(a), L = d.length();
    if (L < 0.01) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    k.geo(cylGeo(r, r, Math.round(L * 100) / 100, 8, true), m, mat, { cast: o.cast ?? false });
    // flanges every so often
    if (o.flanges !== false) for (let s = 4; s < L - 1; s += 6) { const mm = new THREE.Matrix4().compose(a.clone().addScaledVector(d, s / L), q, new THREE.Vector3(1, 1, 1)); k.geo(cylGeo(r * 1.35, r * 1.35, 0.22, 8), mm, mat, { cast: false }); }
  }
  for (let i = 1; i < P.length - 1; i++) k.geo(sphereGeo(r * 1.15, 8), new THREE.Matrix4().makeTranslation(P[i].x, P[i].y, P[i].z), mat, { cast: false });
}
export function valveWheel(x, y, z, ry, r = 0.6) {
  const M = H.M, b = at(x, y, z, ry);
  b.torus(0, 0, 0.3, r, 0.06, M.rust, { seg: 16 });
  for (let i = 0; i < 4; i++) b.box(0, 0, 0.3, r * 2, 0.08, 0.06, M.rust, { rz: i * Math.PI / 4 });
  b.cyl(0, 0, 0.15, 0.08, 0.08, 0.3, M.iron, { rx: Math.PI / 2, seg: 6 });
}

// --- the boiler room -------------------------------------------------------------------------------------------------------------
/** The great coal boiler: a riveted drum, the firebox door glowing, gauges, pipes up into the ceiling. */
export function boiler(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.6, 0, 9, 1.2, 8, M.concrete);
  b.cyl(0, 6.2, -0.5, 3.6, 3.6, 10, M.rust, { seg: 24 });
  b.sphere(0, 11.2, -0.5, 3.6, M.rust, { part: 0.5, seg: 20, s: [1, 0.45, 1] });
  for (let i = 0; i < 5; i++) b.torus(0, 2.0 + i * 2.2, -0.5, 3.65, 0.12, M.iron, { rx: Math.PI / 2, seg: 32 });
  // the firebox
  b.box(0, 3.0, 3.0, 4.4, 4.2, 1.6, M.iron);
  b.box(0, 3.2, 3.85, 2.6, 2.2, 0.2, M.iron, { tint: '#2a1a14' });
  for (let i = 0; i < 6; i++) b.box(-0.9 + i * 0.36, 3.2, 3.98, 0.12, 1.4, 0.06, M.black);
  b.cyl(1.1, 3.2, 4.05, 0.14, 0.14, 0.4, M.iron, { rx: Math.PI / 2, seg: 6 });
  const fx = H.lights.add({ pos: b.W(0, 3.2, 5.6), color: 0xff4a10, power: o.power ?? 18, range: 18, circuit: 'battery', flicker: 0.5, halo: 1.2 });
  H.lights.glow(fx, 'ember', WM(b, 0, 3.2, 3.99, 0, 0, 0, [2.0, 1.4, 1]), 1.4, 0xff4010);
  // gauges, a ladder, pipes
  for (const [gx, gy] of [[-2.4, 8.5], [-1.2, 9.1]]) { b.cyl(gx, gy, 2.9, 0.42, 0.42, 0.25, M.brass, { rx: Math.PI / 2, seg: 14 }); b.cyl(gx, gy, 3.04, 0.36, 0.36, 0.02, M.gauge, { rx: Math.PI / 2, seg: 14, cast: false }); }
  for (let i = 0; i < 10; i++) b.cyl(3.8, 1.5 + i * 1.0, 1.0, 0.05, 0.05, 1.0, M.iron, { rz: Math.PI / 2, seg: 4 });
  for (const sz of [0.7, 1.3]) b.cyl(3.8, 6, sz, 0.06, 0.06, 10, M.iron, { seg: 4 });
  b.cyl(0, 15, -0.5, 1.0, 1.0, 6, M.rust, { seg: 14 });
  b.solid(0, 6, -0.5, 7.4, 12, 7.4);
  b.solid(0, 2.5, 3.0, 4.4, 5, 1.6);
  return { fx, door: b.W(0, 3.2, 5.0) };
}
export function coalPile(x, y, z, r = 3) {
  const M = H.M, b = at(x, y, z, 0);
  b.sphere(0, 0, 0, r, M.black, { part: 0.5, seg: 10, s: [1, 0.5, 1] });
  for (let i = 0; i < 18; i++) { const a = Math.random() * 7, d = Math.random() * r * 1.1; b.geo(new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.2), Math.cos(a) * d, 0.1, Math.sin(a) * d, M.black, { cast: false }); }
  b.box(r + 0.8, 0.9, 0, 0.1, 1.8, 0.5, M.rust, { rz: 0.6 }); b.cyl(r + 1.3, 2.4, 0, 0.05, 0.05, 2, M.woodMid, { rz: 0.6, seg: 4 });
}
/** His chair by the furnace: a wing chair with sheets and a little nest of keys and masks. */
export function nest(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 1.15, 0.1, 3.0, 0.8, 2.8, M.velvetRed, { tint: '#6a5a5a' });
  b.box(0, 3.6, -1.15, 3.0, 4.4, 0.6, M.velvetRed, { tint: '#6a5a5a' });
  for (const sx of [-1, 1]) { b.box(sx * 1.35, 2.0, 0.2, 0.45, 1.0, 2.6, M.velvetRed, { tint: '#6a5a5a' }); b.box(sx * 1.35, 4.2, -0.6, 0.6, 2.2, 1.0, M.velvetRed, { ry: sx * 0.35, tint: '#6a5a5a' }); }
  for (let i = 0; i < 6; i++) b.sphere(rnd(-3, 3), 0.3, rnd(-1, 4), 1, M.sheet, { s: [rnd(1, 2), 0.35, rnd(1, 2)], seg: 8, tint: i % 2 ? '#8a8478' : '#6a6458' });
  // the old masks, lined up on a crate
  b.box(3.6, 1.0, 1.0, 2.2, 2.0, 1.6, M.woodMid);
  for (let i = 0; i < 3; i++) b.sphere(2.9 + i * 0.7, 2.25, 1.2, 0.28, M.porcelain, { s: [1, 1.3, 0.6], seg: 10, rx: 0.3 });
  b.solid(0, 1.6, 0, 3, 3.2, 3);
}

// --- the laundry --------------------------------------------------------------------------------------------------------------------
export function washingMachine(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 2.6, 0, 3.6, 5.2, 3.4, M.steel);
  b.torus(0, 2.6, 1.72, 1.05, 0.14, M.chrome, { seg: 20 });
  b.cyl(0, 2.6, 1.7, 1.0, 1.0, 0.06, M.glass, { rx: Math.PI / 2, seg: 18 });
  b.cyl(0, 2.6, 1.3, 0.95, 0.95, 0.06, M.black, { rx: Math.PI / 2, seg: 18 });
  b.box(1.25, 2.6, 1.85, 0.2, 0.6, 0.2, M.chrome);
  b.box(0, 4.7, 1.72, 3.2, 0.6, 0.06, M.iron);
  for (let i = 0; i < 3; i++) b.cyl(-0.9 + i * 0.6, 4.7, 1.8, 0.14, 0.14, 0.12, M.black, { rx: Math.PI / 2, seg: 8 });
  b.solid(0, 2.6, 0, 3.6, 5.2, 3.4);
}
/** A line across the room with sheets hanging; the sheets are returned so they can sway. */
export function clothesline(x0, z0, x1, z1, y, o = {}) {
  const M = H.M, k = H.kit;
  const a = new THREE.Vector3(x0, y, z0), b = new THREE.Vector3(x1, y, z1), d = b.clone().sub(a), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  k.geo(cylGeo(0.025, 0.025, Math.round(L * 10) / 10, 4), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), M.rope, { cast: false });
  const sheets = [];
  const n = o.n ?? Math.floor(L / 4.5), yaw = Math.atan2(-d.z, d.x);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, w = 3.2 + Math.random() * 0.8, h = 5.5 + Math.random() * 1.5;
    const g = new THREE.PlaneGeometry(w, h, 6, 4); g.translate(0, -h / 2, 0);
    const P = g.attributes.position;
    for (let j = 0; j < P.count; j++) P.setZ(j, Math.sin(P.getX(j) * 2.2) * 0.12 + Math.sin(P.getY(j) * 0.9) * 0.1);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.sheet); m.castShadow = true; m.receiveShadow = true;
    m.position.copy(a).addScaledVector(d, t); m.position.y += 0.02; m.rotation.y = yaw;
    H.world.scene.add(m);
    sheets.push({ m, ph: Math.random() * 6, yaw });
  }
  return sheets;
}
export function laundryBasket(x, y, z, o = {}) {
  const M = H.M, b = at(x, y, z, 0);
  b.cyl(0, 1.0, 0, 1.2, 1.0, 2.0, M.woodLight, { seg: 12, open: true, tint: '#c8b080' });
  b.cyl(0, 0.05, 0, 1.0, 1.0, 0.1, M.woodLight, { seg: 12 });
  if (o.full !== false) b.sphere(0, 1.8, 0, 1.15, M.linen, { s: [1, 0.5, 1], seg: 10 });
}

// --- the workshop and storage ----------------------------------------------------------------------------------------------------------
export function workbench(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = o.w ?? 8;
  b.box(0, 3.1, 0, w, 0.3, 3, M.woodMid);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.3), 1.5, sz * 1.2, 0.35, 3, 0.35, M.woodMid);
  b.box(0, 0.6, 0, w - 0.6, 0.12, 2.6, M.woodMid);
  // a vise, tools, a lamp
  b.box(w / 2 - 1, 3.6, 1.2, 1, 0.7, 0.8, M.iron); b.cyl(w / 2 - 1, 3.6, 1.8, 0.05, 0.05, 1.2, M.chrome, { rz: Math.PI / 2, seg: 4 });
  b.box(-1.5, 3.32, 0.4, 1.6, 0.12, 0.2, M.woodLight, { ry: 0.3 }); b.box(-0.9, 3.32, 0.5, 0.5, 0.2, 0.25, M.iron, { ry: 0.3 });
  b.box(0.5, 3.35, -0.5, 1.6, 0.18, 0.6, M.rust);
  for (let i = 0; i < 8; i++) b.cyl(-w / 2 + 1 + Math.random() * (w - 2), 3.3, Math.random() * 2 - 1, 0.05, 0.05, 0.12, M.chrome, { seg: 4 });
  b.box(-w / 2 + 1.2, 3.6, -0.6, 1.6, 0.7, 1.0, M.steel); // a toolbox
  b.solid(0, 1.6, 0, w, 3.3, 3);
}
export function pegboardPanel(x, y, z, ry, w = 7, h = 4) {
  at(x, y, z, ry).box(0, 0, 0.05, w, h, 0.1, H.M.pegboard, { uv: 'local' });
}
export function crate(x, y, z, ry = 0, s = 3, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, s / 2, 0, s, s, s, o.mat || M.woodLight, { tint: o.tint || '#a08060' });
  for (const sy of [0.1, 0.9]) for (const f of [-1, 1]) { b.box(0, s * sy, f * (s / 2 + 0.04), s + 0.1, 0.25, 0.08, M.woodMid); b.box(f * (s / 2 + 0.04), s * sy, 0, 0.08, 0.25, s + 0.1, M.woodMid); }
  if (o.label) b.box(0, s * 0.55, s / 2 + 0.09, s * 0.6, s * 0.3, 0.01, flat(T.sign(o.label, { w: 256, h: 96, style: 'paint', fg: 'rgba(30,20,10,0.8)', font: 'Impact, Arial' }), { transparent: true }), { uv: 'local', faces: ['pz'], cast: false });
  if (o.solid !== false) b.solid(0, s / 2, 0, s, s, s);
  return b;
}
export function barrel(x, y, z, o = {}) {
  const M = H.M, b = at(x, y, z, o.ry || 0);
  if (o.fallen) { b.cyl(0, 1.2, 0, 1.2, 1.2, 3.4, M.rust, { rz: Math.PI / 2, seg: 14 }); b.solid(0, 1.2, 0, 3.4, 2.4, 2.4); return; }
  b.lathe([[1.1, 0], [1.25, 0.3], [1.35, 1.7], [1.25, 3.1], [1.1, 3.4], [0, 3.4]], 0, 0, 0, o.mat || M.rust, { seg: 16 });
  for (const yy of [0.4, 1.7, 3.0]) b.torus(0, yy, 0, 1.3 + (yy === 1.7 ? 0.05 : -0.05), 0.05, M.iron, { rx: Math.PI / 2, seg: 18 });
  b.solid(0, 1.7, 0, 2.5, 3.4, 2.5);
}
/** Furniture under a dust sheet: kind 'chair'|'table'|'tall'|'sofa'|'figure'. */
export function sheeted(x, y, z, ry, kind = 'chair') {
  const M = H.M, b = at(x, y, z, ry);
  if (kind === 'chair') { b.sphere(0, 2.2, 0, 1, M.sheet, { s: [1.7, 2.3, 1.6], seg: 10, part: 0.75 }); b.box(0, 0.6, 0, 3, 1.2, 2.8, M.sheet); b.solid(0, 2, 0, 3, 4, 2.8); }
  else if (kind === 'table') { b.box(0, 2.7, 0, 5, 0.2, 3, M.sheet); for (const s of [-1, 1]) b.box(0, 1.6, s * 1.55, 5.2, 2.2, 0.08, M.sheet, { rx: s * 0.12 }); b.solid(0, 1.4, 0, 5, 2.8, 3); }
  else if (kind === 'sofa') { b.sphere(0, 2.0, 0, 1, M.sheet, { s: [3.6, 2.0, 1.6], seg: 12, part: 0.7 }); b.box(0, 0.7, 0, 7, 1.4, 3, M.sheet); b.solid(0, 1.6, 0, 7, 3.2, 3); }
  else if (kind === 'figure') { // a sheet over something the shape of a person
    b.sphere(0, 6.6, 0, 0.8, M.sheet, { seg: 10, s: [1, 1.15, 1] });
    b.cyl(0, 3.2, 0, 1.0, 1.8, 6.2, M.sheet, { seg: 14, open: true });
    b.solid(0, 3.5, 0, 2.4, 7, 2.4);
  } else { b.box(0, 3.5, 0, 3.2, 7, 2, M.sheet); b.sphere(0, 7.0, 0, 1, M.sheet, { s: [1.65, 0.35, 1.05], seg: 8 }); b.solid(0, 3.5, 0, 3.2, 7, 2); }
}
/** A shop mannequin: returned as its own object (it isn't always where you left it). */
export function mannequin(x, y, z, ry, o = {}) {
  const M = H.M, parts = [];
  parts.push([cylGeo(0.9, 0.9, 0.15, 14), M4(0, 0.08, 0)], [cylGeo(0.07, 0.07, 3.2, 6), M4(0, 1.7, 0)]);
  parts.push([sphereGeo(1, 12), M4(0, 4.6, 0, 0, 0, 0, [0.85, 1.35, 0.55])], [sphereGeo(1, 12), M4(0, 3.6, 0, 0, 0, 0, [0.75, 0.6, 0.5])]);
  parts.push([cylGeo(0.25, 0.3, 0.8, 8), M4(0, 6.1, 0)], [sphereGeo(0.55, 12), M4(0, 6.9, 0.02, 0, 0, 0, [0.85, 1.1, 0.95])]);
  for (const s of [-1, 1]) parts.push([cylGeo(0.18, 0.15, 2.8, 6), M4(s * 1.05, 4.2, 0.1, 0.1, 0, s * 0.12)]);
  const m = new THREE.Mesh(bake(parts), o.mat || M.wax);
  m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, y, z); m.rotation.y = ry;
  H.world.scene.add(m);
  H.kit.solid(x - 0.8, x + 0.8, y, y + 7.4, z - 0.8, z + 0.8, { name: 'Prop' });
  return m;
}

// --- ruins of the fire ----------------------------------------------------------------------------------------------------------------------------
/** Charred planks, plaster and ash scattered round (x, z). */
export function debris(x, y, z, r = 4, n = 14, o = {}) {
  const M = H.M, b = at(x, y, z, 0), rr = T.rng(Math.floor(x * 31 + z * 17 + 5));
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * r, px = Math.cos(a) * d, pz = Math.sin(a) * d, kind = rr();
    if (kind < 0.55) b.box(px, 0.15 + rr() * 0.4, pz, 0.3 + rr() * 0.3, 0.18, 2 + rr() * 4, M.charred, { ry: rr() * 3, rx: (rr() - 0.5) * 0.4, rz: (rr() - 0.5) * 0.3 });
    else if (kind < 0.85) b.geo(new THREE.DodecahedronGeometry(0.25 + rr() * 0.5), px, 0.15, pz, o.plaster || M.crown, { s: [1, 0.5, 1], cast: false });
    else b.box(px, 0.04, pz, 1 + rr() * 2, 0.06, 1 + rr() * 2, M.black, { ry: rr() * 3, cast: false });
  }
}
/** A charred beam from one point to another (world space), square section s. */
export function beam(p0, p1, s = 0.8, mat = H.M.charred) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = b.clone().sub(a), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  H.kit.geo(boxGeo(s, L, s, mat.userData.tile ? [mat.userData.tile, mat.userData.tile] : [4, 4]), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), mat, { cast: true });
}
/** Planks nailed across a doorway (w wide, h high, centred at x, z; ry faces out). o.solid blocks it. */
export function boards(x, y, z, ry, w = 4.4, h = 8, o = {}) {
  const M = H.M, b = at(x, y, z, ry), rr = T.rng(Math.floor(x * 5 + z * 3));
  const n = o.n ?? 6;
  for (let i = 0; i < n; i++) {
    const yy = 0.8 + i * (h - 1.4) / (n - 1) + (rr() - 0.5) * 0.6;
    b.box(0, yy, 0.25 + (i % 2) * 0.12, w + 1.2, 0.6 + rr() * 0.25, 0.15, o.mat || M.woodLight, { rz: (rr() - 0.5) * 0.35, tint: o.tint || '#7a6650' });
    for (const s of [-1, 1]) b.cyl(s * (w / 2 + 0.3), yy, 0.36 + (i % 2) * 0.12, 0.05, 0.05, 0.05, M.iron, { rx: Math.PI / 2, seg: 4 });
  }
  if (o.sign) b.box(0, h * 0.55, 0.5, 3.4, 1.4, 0.05, flat(T.sign(o.sign, { w: 256, h: 96, style: 'enamel', bg: '#c8b890', fg: '#7a1010', font: 'Impact, Arial' }), { rough: 0.8 }), { uv: 'local', faces: ['pz'], cast: false, rz: 0.06 });
  if (o.solid !== false) b.solid(0, h / 2, 0.3, w + 0.6, h, 0.4);
}

// --- structure --------------------------------------------------------------------------------------------------------------------------------------
/** A marble column from y0 to y1 (o.r radius, o.mat, o.square). */
export function column(x, y0, y1, z, o = {}) {
  const M = H.M, b = at(x, y0, z, 0), r = o.r ?? 1.1, h = y1 - y0, mat = o.mat || M.marbleWhite;
  b.box(0, 0.3, 0, r * 2.8, 0.6, r * 2.8, o.base || M.marbleBlack);
  b.torus(0, 0.75, 0, r * 1.12, r * 0.18, mat, { rx: Math.PI / 2, seg: 20 });
  if (o.square) b.box(0, h / 2, 0, r * 2, h - 1.8, r * 2, mat);
  else b.lathe([[r * 1.0, 0.8], [r * 1.02, h * 0.33], [r * 0.9, h - 1.3], [r * 1.0, h - 1.15], [r * 1.0, h - 1.0]], 0, 0, 0, mat, { seg: 18 });
  b.lathe([[r * 0.95, h - 1.0], [r * 1.25, h - 0.6], [r * 1.5, h - 0.4]], 0, 0, 0, o.cap || M.gold, { seg: 18 });
  b.box(0, h - 0.2, 0, r * 3.2, 0.4, r * 3.2, mat);
  b.solid(0, h / 2, 0, r * 2.2, h, r * 2.2);
}
/** A balustrade: balusters, a handrail, posts at the ends; collides up to the rail. axis 'x': along x at z = c. */
export function balustrade(axis, c, a0, a1, y, o = {}) {
  const M = H.M, h = o.h ?? 3.6, mat = o.mat || M.woodDark, bal = o.baluster || mat, L = a1 - a0;
  const ry = axis === 'x' ? 0 : Math.PI / 2;
  const cx = axis === 'x' ? (a0 + a1) / 2 : c, cz = axis === 'x' ? c : (a0 + a1) / 2;
  const b = at(cx, y, cz, ry);
  const sgn = axis === 'x' ? 1 : -1; // local x runs along the axis
  b.box(0, h - 0.15, 0, L, 0.3, 0.55, mat);
  b.box(0, 0.25, 0, L, 0.5, 0.45, mat);
  const n = Math.max(2, Math.round(L / 1.1));
  const broken = o.broken || [];
  for (let i = 1; i < n; i++) {
    const lx = (-L / 2 + i * L / n) * sgn;
    if (broken.some(([p, q]) => { const wa = (axis === 'x' ? cx : cz) + lx * sgn; return wa > p && wa < q; })) continue;
    b.lathe([[0.18, 0.5], [0.28, 0.9], [0.14, 1.6], [0.26, 2.4], [0.12, 3.0], [0.16, h - 0.3]], lx, 0, 0, bal, { seg: 8 });
  }
  for (const s of [-1, 1]) { b.box(s * L / 2, h / 2 + 0.2, 0, 0.8, h + 0.4, 0.8, mat); b.sphere(s * L / 2, h + 0.55, 0, 0.35, o.knob || mat, { seg: 8 }); }
  if (o.solid !== false) {
    if (axis === 'x') H.kit.solid(a0, a1, y, y + h + 0.6, c - 0.3, c + 0.3, { name: 'Rail' });
    else H.kit.solid(c - 0.3, c + 0.3, y, y + h + 0.6, a0, a1, { name: 'Rail' });
  }
}
/**
 * A straight flight of stairs climbing from s = a (height ya) to s = b (height yb), where s is z (or x when
 * o.axis === 'x'), between w0..w1 across. The treads are drawn; one sloping ramp collides (so walking up and down
 * is smooth). o.mat treads, o.carpet a runner up the middle, o.skip(i) leaves step i out (a collapsed flight),
 * o.solidBelow fills down to the floor (a grand staircase) instead of a floating flight with a sloped soffit.
 */
export function stairs(axis, a, b, w0, w1, ya, yb, o = {}) {
  const M = H.M, k = H.kit, n = o.n ?? Math.max(1, Math.round(Math.abs(yb - ya) / 0.75));
  const rise = (yb - ya) / n, run = (b - a) / n, alongX = axis === 'x';
  if (w1 < w0) [w0, w1] = [w1, w0];
  const front = alongX ? (run > 0 ? 'nx' : 'px') : (run > 0 ? 'nz' : 'pz');
  const sides = alongX ? ['nz', 'pz'] : ['nx', 'px'];
  const B = (s0, s1, y0, y1, ww0, ww1, mat, faces, tile) => (alongX ? k.box(Math.min(s0, s1), Math.max(s0, s1), y0, y1, ww0, ww1, mat, { faces, tile }) : k.box(ww0, ww1, y0, y1, Math.min(s0, s1), Math.max(s0, s1), mat, { faces, tile }));
  let last = n;
  for (let i = 0; i < n; i++) {
    if (o.skip?.(i)) { last = Math.min(last, i); continue; }
    const p0 = a + run * i, p1 = a + run * (i + 1), top = ya + rise * (i + 1);
    const bottom = o.solidBelow ? (o.floorY ?? Math.min(ya, yb)) : top - Math.abs(rise) - 0.55;
    B(p0 - Math.sign(run) * 0.08, p1, bottom, top, w0, w1, o.mat || M.woodDark, ['py', front, ...sides]);
    if (o.carpet) { const cw = (w1 - w0) * (o.carpetW ?? 0.62), cm = (w0 + w1) / 2; B(p0 - Math.sign(run) * 0.1, p1, top - 0.02, top + 0.05, cm - cw / 2, cm + cw / 2, o.carpet, ['py', front], [4, 4]); }
    if (o.rods) { const cw = (w1 - w0) * 0.66, cm = (w0 + w1) / 2; if (alongX) k.box(p0 + run * 0.05 - 0.04, p0 + run * 0.05 + 0.04, top + 0.03, top + 0.12, cm - cw / 2, cm + cw / 2, M.brass); else k.box(cm - cw / 2, cm + cw / 2, top + 0.03, top + 0.12, p0 + run * 0.05 - 0.04, p0 + run * 0.05 + 0.04, M.brass); }
  }
  // the sloped soffit under a floating flight
  const len = Math.hypot(b - a, yb - ya), sm = (a + b) / 2, ym = (ya + yb) / 2;
  if (!o.solidBelow && o.soffit !== false) {
    const ang = Math.atan2(yb - ya, b - a);
    const m = alongX ? M4(sm, ym - 0.95, (w0 + w1) / 2, 0, 0, ang) : M4((w0 + w1) / 2, ym - 0.95, sm, -ang, 0, 0);
    k.geo(boxGeo(alongX ? len : w1 - w0, 0.3, alongX ? w1 - w0 : len), m, o.soffitMat || o.mat || M.woodDark, { cast: false });
  }
  // the ramp you actually walk on (along the treads' back edges: flush with both landings)
  const rb = a + run * last, ryb = ya + rise * last;
  if (last > 0) {
    const L = Math.hypot(rb - a, ryb - ya), mid = [(a + rb) / 2, (ya + ryb) / 2];
    const rot = alongX ? [0, 0, Math.atan2(ryb - ya, rb - a) / (Math.PI / 180)] : [Math.atan2(-(ryb - ya), rb - a) / (Math.PI / 180), 0, 0];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * Math.PI / 180, 0, rot[2] * Math.PI / 180, 'YXZ'));
    const nrm = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    if (nrm.y < 0) nrm.negate();
    const c = alongX ? new THREE.Vector3(mid[0], mid[1], (w0 + w1) / 2) : new THREE.Vector3((w0 + w1) / 2, mid[1], mid[0]);
    c.addScaledVector(nrm, -0.5);
    const p = H.world.add({ size: alongX ? [L, 1, w1 - w0] : [w1 - w0, 1, L], position: [c.x, c.y, c.z], rotation: rot, transparency: 1, name: 'Stair', top: 'Smooth', bottom: 'Smooth' });
    p.userData.surface = o.surface || (o.carpet ? 'carpet' : 'wood');
    k.colliders.push(p);
  }
  // the stringers along the open sides
  for (const [w, open] of [[w0, o.stringer0 !== false], [w1, o.stringer1 !== false]]) {
    if (!open || o.solidBelow) continue;
    const ang = Math.atan2(yb - ya, b - a);
    const m = alongX ? M4(sm, ym - 0.25, w, 0, 0, ang) : M4(w, ym - 0.25, sm, -ang, 0, 0);
    k.geo(boxGeo(alongX ? len + 0.6 : 0.3, 1.5, alongX ? 0.3 : len + 0.6), m, o.stringer || o.mat || M.woodDark, { cast: false });
  }
}
/** A ceiling lamp that's just a bare bulb on a flex (basement, storage). */
export function hangingBulb(x, ceil, z, o = {}) {
  const M = H.M, b = at(x, ceil, z, 0), drop = o.drop ?? 2.5;
  b.cyl(0, -drop / 2, 0, 0.02, 0.02, drop, M.black, { seg: 3 });
  b.cyl(0, -drop - 0.15, 0, 0.12, 0.12, 0.3, M.brass, { seg: 6 });
  const fx = H.lights.add({ pos: b.W(0, -drop - 0.5, 0), color: o.color ?? 0xffb060, power: o.power ?? 14, range: o.range ?? 14, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.15, emergency: o.emergency ?? 0, halo: 1.4, broken: o.broken, room: o.room });
  H.lights.glow(fx, 'bulb', WM(b, 0, -drop - 0.45, 0, 0, 0, 0, 1.4), 2);
  return fx;
}
/** A caged bulkhead lamp on a wall. */
export function cageLight(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0, 0.1, 0.8, 0.8, 0.2, M.iron);
  b.sphere(0, 0, 0.3, 0.38, M.iron, { seg: 6, s: [1, 1, 0.7] });
  const fx = H.lights.add({ pos: b.W(0, 0, 1.0), color: o.color ?? 0xffc080, power: o.power ?? 9, range: o.range ?? 12, circuit: o.circuit || 'main', flicker: o.flicker ?? 0.12, emergency: o.emergency ?? 0, halo: 1.3, broken: o.broken, room: o.room });
  H.lights.glow(fx, 'bulb', WM(b, 0, 0, 0.35, 0, 0, 0, 1.3), 1.6);
  return fx;
}

// --- the children's room ----------------------------------------------------------------------------------------------------------------------------------
/** A rocking horse (its own object: it rocks by itself). */
export function rockingHorse(x, y, z, ry) {
  const M = H.M;
  const parts = [
    [boxGeo(2.6, 1.2, 0.9), M4(0, 2.4, 0)], [boxGeo(0.6, 1.6, 0.6), M4(1.3, 3.2, 0, 0, 0, -0.5)], [boxGeo(1.2, 0.6, 0.55), M4(1.95, 3.9, 0, 0, 0, -0.2)],
    [boxGeo(0.25, 1.0, 0.3), M4(-1.5, 2.6, 0, 0, 0, 0.8)],
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([boxGeo(0.25, 1.6, 0.25), M4(sx * 0.9, 1.4, sz * 0.35, sz * 0.12, 0, sx * 0.25)]);
  const body = new THREE.Mesh(bake(parts), H.M.woodLight); body.castShadow = true;
  const rockers = new THREE.Mesh(bake([-0.45, 0.45].map((sz) => [new THREE.TorusGeometry(4, 0.12, 4, 16, 1.0).rotateZ(-Math.PI / 2 - 0.5), M4(0, 4.6, sz)])), M.woodDark);
  const g = new THREE.Group(); g.add(body, rockers);
  g.position.set(x, y, z); g.rotation.y = ry;
  H.world.scene.add(g);
  H.kit.solid(x - 1.8, x + 1.8, y, y + 3.5, z - 1.8, z + 1.8, { name: 'Prop' });
  return g;
}
/** The music box (it plays its tune when you come in). */
export function musicBox(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.3, 0, 1.2, 0.6, 0.9, M.woodLight, { tint: '#d8a0a0' });
  b.box(0, 0.62, -0.45, 1.2, 0.06, 0.9, M.woodLight, { rx: -1.1, tint: '#d8a0a0' });
  b.cyl(0, 0.75, 0, 0.04, 0.04, 0.3, M.brass, { seg: 4 });
  b.sphere(0, 1.05, 0, 0.12, M.porcelain, { seg: 8 }); b.cyl(0, 0.92, 0, 0.18, 0.05, 0.3, M.porcelain, { seg: 8 });
  b.box(0.7, 0.3, 0, 0.3, 0.06, 0.06, M.brass);
  return b.W(0, 0.6, 0);
}
/** A porcelain doll sitting up (o.facing: turned toward something). */
export function doll(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.cyl(0, 0.45, 0, 0.32, 0.45, 0.9, o.dress || M.velvetGreen, { seg: 10 });
  b.sphere(0, 1.15, 0, 0.3, M.porcelain, { seg: 10 });
  b.sphere(0, 1.25, -0.06, 0.32, M.black, { seg: 8, part: 0.6, s: [1, 1, 1] });
  for (const s of [-1, 1]) { b.cyl(s * 0.35, 0.7, 0.05, 0.07, 0.07, 0.6, M.porcelain, { rz: s * 0.3, seg: 5 }); b.cyl(s * 0.15, 0.1, 0.45, 0.08, 0.08, 0.7, M.porcelain, { rx: Math.PI / 2, seg: 5 }); }
  for (const s of [-1, 1]) b.sphere(s * 0.1, 1.18, 0.27, 0.035, M.black, { seg: 4 });
}
export function toyBlocks(x, y, z, n = 7) {
  const b = at(x, y, z, Math.random() * 3), cols = ['#a83030', '#3060a8', '#d8b030', '#40884a', '#d87030'];
  for (let i = 0; i < n; i++) b.box(rnd(-1.5, 1.5), 0.3 + (i > 4 ? 0.6 : 0), rnd(-1.5, 1.5), 0.6, 0.6, 0.6, H.M.woodLight, { ry: rnd(0, 1.5), tint: cols[i % cols.length] });
}
export function wheelchair(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  for (const s of [-1, 1]) { b.torus(s * 1.2, 1.8, -0.2, 1.7, 0.07, M.chrome, { ry: Math.PI / 2, seg: 20 }); b.torus(s * 1.2, 1.8, -0.2, 1.75, 0.09, M.rubber, { ry: Math.PI / 2, seg: 20 }); b.cyl(s * 0.9, 0.35, 1.3, 0.35, 0.35, 0.1, M.rubber, { rz: Math.PI / 2, seg: 10 }); }
  b.box(0, 2.1, 0.2, 2.2, 0.15, 2.0, M.leather);
  b.box(0, 3.4, -0.85, 2.2, 2.6, 0.1, M.leather, { rx: -0.1 });
  for (const s of [-1, 1]) { b.cyl(s * 1.1, 2.8, -0.9, 0.05, 0.05, 3.8, M.chrome, { rx: -0.1, seg: 6 }); b.cyl(s * 1.1, 2.9, 0.3, 0.05, 0.05, 2.2, M.chrome, { rx: Math.PI / 2, seg: 6 }); }
  b.solid(0, 2, 0, 2.8, 4, 3);
}
export function noticeBoard(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = o.w ?? 5, h = o.h ?? 3.5;
  b.box(0, 0, 0.08, w, h, 0.16, M.cardboard, { tint: '#9a7a50' });
  for (const s of [-1, 1]) { b.box(0, s * (h / 2 + 0.1), 0.1, w + 0.4, 0.2, 0.2, M.woodDark); b.box(s * (w / 2 + 0.1), 0, 0.1, 0.2, h, 0.2, M.woodDark); }
  const r = T.rng(Math.floor(x * 9 + z * 7));
  for (let i = 0; i < 6; i++) b.box(rnd(-w / 2 + 0.7, w / 2 - 0.7), rnd(-h / 2 + 0.7, h / 2 - 0.7), 0.18, 0.9 + r() * 0.4, 1.1 + r() * 0.3, 0.01, flat(T.paper(Math.floor(r() * 5) + 3, { typed: r() < 0.5 }), { rough: 0.95 }), { uv: 'local', faces: ['pz'], cast: false, rz: (r() - 0.5) * 0.3 });
}
/** A wooden tabletop radio (it crackles into life now and then). */
export function radio(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.75, 0, 2.0, 1.5, 0.9, M.woodMid);
  b.sphere(0, 1.5, 0, 1, M.woodMid, { part: 0.5, s: [1.0, 0.45, 0.45], seg: 12 });
  b.box(0, 0.95, 0.46, 1.3, 0.8, 0.02, M.cloth, { tint: '#8a7a5a' });
  for (const s of [-1, 1]) b.cyl(s * 0.5, 0.3, 0.48, 0.12, 0.12, 0.1, M.brass, { rx: Math.PI / 2, seg: 8 });
  return b.W(0, 0.8, 0.5);
}
export function bench(x, y, z, ry, w = 6) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 1.7, 0, w, 0.3, 1.8, M.velvetRed);
  b.box(0, 1.45, 0, w, 0.25, 1.9, M.woodDark);
  for (const s of [-1, 1]) b.box(s * (w / 2 - 0.3), 0.7, 0, 0.3, 1.4, 1.6, M.woodDark);
  b.solid(0, 0.9, 0, w, 1.8, 1.8);
}
export function trunk(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 1.0, 0, 3.6, 2.0, 2.0, M.leather, { tint: o.tint });
  b.cyl(0, 2.0, 0, 1.0, 1.0, 3.6, M.leather, { rz: Math.PI / 2, seg: 12, s: [1, 1, 0.4], tint: o.tint });
  for (const sx of [-1.2, 0, 1.2]) b.box(sx, 1.2, 0, 0.2, 2.5, 2.08, M.brass);
  b.solid(0, 1.2, 0, 3.6, 2.4, 2);
}
