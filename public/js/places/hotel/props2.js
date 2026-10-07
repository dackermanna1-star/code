// More of the Ravenhurst's furniture: the bathrooms, the housekeeping and
// service pieces (key box, fuse box), the kitchen, the manager's office,
// the ballroom's piano and the bar, and the lobby's fireplace, clock and
// palms. Same conventions as props.js: authored in a local frame (origin on
// the floor, +z toward the room), placed with kit.at(x, y, z, ry).
import * as THREE from 'three';
import { H } from './state.js';
import { M4, bake, boxGeo, cylGeo, sphereGeo, latheGeo, extrudeGeo } from './kit.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { HidingSpot } from './doors.js';
import { WM, painting } from './props.js';

const at = (x, y, z, ry = 0) => H.kit.at(x, y, z, ry);
const rnd = (a, b) => a + Math.random() * (b - a);

/** A copy of a geometry turned inside out (the inside of a bowl or a tub). */
const flipCache = new Map();
function flipped(key, make) {
  let g = flipCache.get(key);
  if (g) return g;
  g = make().clone();
  const N = g.attributes.normal;
  for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  const I = g.index;
  if (I) for (let i = 0; i < I.count; i += 3) { const a = I.getX(i + 1); I.setX(i + 1, I.getX(i + 2)); I.setX(i + 2, a); }
  flipCache.set(key, g);
  return g;
}
const crackTex = () => T.canvasTex('cracks', 256, 256, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  const r = T.rng(77);
  x.strokeStyle = 'rgba(230,235,240,0.75)'; x.lineWidth = 1.4;
  const cx = w * 0.62, cy = h * 0.38;
  for (let i = 0; i < 14; i++) {
    let a = r() * Math.PI * 2, px = cx, py = cy;
    x.beginPath(); x.moveTo(px, py);
    for (let j = 0; j < 7; j++) { a += (r() - 0.5) * 0.7; const l = 8 + r() * 26; px += Math.cos(a) * l; py += Math.sin(a) * l; x.lineTo(px, py); }
    x.stroke();
  }
  for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(cx, cy, 10 + k * 16 + r() * 6, 0, 7); x.stroke(); }
}, { clamp: true });

// --- bathrooms ------------------------------------------------------------------------------------------------------------
/** A claw-foot bathtub (o.water: filled, dark; o.curtain: a shower curtain on a ring). Its length runs along local z. */
export function bathtub(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  const hemi = () => sphereGeo(1, 20, 0.5);
  b.geo(hemi(), 0, 1.9, 0, M.porcelain, { rx: Math.PI, s: [1.55, 1.5, 3.1] });
  b.geo(flipped('tub', hemi), 0, 1.9, 0, M.porcelain, { rx: Math.PI, s: [1.42, 1.38, 2.95] });
  b.torus(0, 1.9, 0, 1, 0.09, M.porcelain, { rx: Math.PI / 2, s: [1.49, 3.03, 1], seg: 28 });
  if (o.water !== false) b.cyl(0, 1.5, 0, 1, 1, 0.02, M.water, { s: [1.32, 1, 2.74], seg: 24 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.sphere(sx * 0.95, 0.55, sz * 2.05, 0.28, M.brass, { seg: 8 });
    b.cyl(sx * 1.05, 0.2, sz * 2.15, 0.12, 0.2, 0.4, M.brass, { seg: 6 });
  }
  // taps and the overflow at the foot end
  b.cyl(0, 2.25, -2.9, 0.07, 0.07, 0.7, M.brass, { seg: 6 });
  b.cyl(0, 2.6, -2.7, 0.06, 0.06, 0.5, M.brass, { rx: Math.PI / 2, seg: 6 });
  for (const sx of [-0.45, 0.45]) b.cyl(sx, 2.35, -2.95, 0.15, 0.15, 0.12, M.porcelain, { seg: 8 });
  if (o.curtain) {
    b.torus(0, 8.6, 0, 1, 0.05, M.brass, { rx: Math.PI / 2, s: [1.7, 3.3, 1], seg: 28 });
    b.cyl(0, 9.6, -3.2, 0.05, 0.05, 2.1, M.brass, { seg: 6 });
    const g = new THREE.CylinderGeometry(1, 1, 7.2, 32, 1, true, -Math.PI * 0.95, o.open ? Math.PI * 0.6 : Math.PI * 1.9);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const a = Math.atan2(P.getZ(i), P.getX(i)); const k = 1 + Math.sin(a * 16) * 0.035; P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); }
    g.computeVertexNormals();
    b.geo(g, 0, 5.0, 0, M.sheet, { s: [1.72, 1, 3.3], cast: true });
  }
  b.solid(0, 1.1, 0, 3.1, 2.2, 6.2);
  return b;
}
/** An old high-tank toilet with a pull chain. */
export function toilet(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.lathe([[0.42, 0], [0.48, 0.08], [0.34, 0.5], [0.4, 1.0], [0.62, 1.35], [0.66, 1.5], [0, 1.5]], 0, 0, 0.35, M.porcelain, { seg: 14, s: [1, 1, 1.25] });
  b.torus(0, 1.56, 0.4, 0.55, 0.08, M.woodDark, { rx: Math.PI / 2, s: [1, 1.3, 1], seg: 18 });
  b.box(0, 1.9, -0.55, 1.2, 0.8, 0.3, M.woodDark, { rx: -0.2 });
  b.box(0, 6.8, -0.35, 1.6, 0.9, 0.7, M.porcelain);
  b.box(0, 7.3, -0.35, 1.75, 0.1, 0.8, M.woodDark);
  b.cyl(-0.4, 4.0, -0.62, 0.06, 0.06, 5.6, M.brass, { seg: 6 });
  b.cyl(0.55, 5.6, -0.1, 0.012, 0.012, 2.2, M.brass, { seg: 3 });
  b.cyl(0.55, 4.45, -0.1, 0.07, 0.05, 0.3, M.porcelain, { seg: 6 });
  b.solid(0, 0.8, 0.2, 1.4, 1.6, 2);
}
/** A pedestal washbasin. */
export function sink(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.lathe([[0.45, 0], [0.5, 0.1], [0.24, 0.4], [0.2, 2.2], [0.5, 2.8], [0, 2.8]], 0, 0, 0, M.porcelain, { seg: 12 });
  b.box(0, 3.05, 0.05, 2.4, 0.5, 1.7, M.porcelain);
  b.geo(flipped('basin', () => sphereGeo(1, 14, 0.5)), 0, 3.3, 0.15, M.porcelain, { rx: Math.PI, s: [0.9, 0.42, 0.6] });
  for (const sx of [-0.55, 0.55]) { b.cyl(sx, 3.5, -0.6, 0.06, 0.06, 0.4, M.brass, { seg: 6 }); b.cyl(sx, 3.72, -0.5, 0.05, 0.04, 0.3, M.brass, { rx: Math.PI / 2, seg: 6 }); b.cyl(sx, 3.78, -0.6, 0.14, 0.14, 0.06, M.porcelain, { seg: 6 }); }
  b.solid(0, 1.6, 0, 2.4, 3.2, 1.7);
}
/** A wall mirror (o.cracked, o.frame material, o.text: something written on it). */
export function mirror(x, y, z, ry, w, h, o = {}) {
  const M = H.M, b = at(x, y, z, ry), fm = o.frame || M.gold;
  b.box(0, 0, 0.06, w, h, 0.08, M.mirror, { faces: ['pz'] });
  for (const s of [-1, 1]) { b.box(0, s * (h / 2 + 0.12), 0.1, w + 0.48, 0.24, 0.2, fm); b.box(s * (w / 2 + 0.12), 0, 0.1, 0.24, h, 0.2, fm); }
  if (o.cracked) b.box(0.3, 0.4, 0.12, w * 0.9, h * 0.9, 0.01, flat(crackTex(), { transparent: true, decal: true, rough: 0.2 }), { uv: 'local', faces: ['pz'], cast: false });
  if (o.text) b.box(0, 0, 0.13, w * 0.92, h * 0.6, 0.01, flat(T.writing(o.text, { w: 512, h: 256 }), { transparent: true, decal: true }), { uv: 'local', faces: ['pz'], cast: false });
  return b;
}
export function towelRail(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  for (const sx of [-1, 1]) b.cyl(sx * 1.1, 4.2, 0.25, 0.05, 0.05, 0.5, M.brass, { rx: Math.PI / 2, seg: 6 });
  b.cyl(0, 4.2, 0.45, 0.05, 0.05, 2.3, M.brass, { rz: Math.PI / 2, seg: 6 });
  if (o.towel !== false) { b.box(0, 3.5, 0.45, 1.5, 1.4, 0.12, M.linen); b.box(0, 4.25, 0.45, 1.5, 0.15, 0.2, M.linen); }
}

// --- housekeeping and service ----------------------------------------------------------------------------------------------------------------
export function housekeepingCart(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl(sx * 1.9, 2.4, sz * 0.9, 0.06, 0.06, 4.4, M.chrome, { seg: 6 }); b.sphere(sx * 1.9, 0.18, sz * 0.9, 0.18, M.rubber, { seg: 6 }); }
  for (const yy of [0.6, 2.2, 3.8]) b.box(0, yy, 0, 3.9, 0.1, 1.9, M.steel);
  for (let i = 0; i < 4; i++) { b.box(-1.2 + i * 0.75, 2.5, 0, 0.6, 0.5, 1.4, M.linen); b.box(-1.2 + i * 0.75, 4.15, 0.1, 0.6, 0.6, 1.2, M.linen, { ry: rnd(-0.1, 0.1) }); }
  for (let i = 0; i < 5; i++) b.cyl(-1.4 + i * 0.4, 1.0, -0.5, 0.12, 0.12, 0.7, M.bottle, { seg: 6, tint: ['#9ab', '#ba8', '#8a8', '#caa', '#99c'][i] });
  b.sphere(2.6, 2.4, 0, 1.0, M.sheet, { s: [0.6, 1.6, 0.9], seg: 10 });
  b.cyl(2.3, 4.3, 0, 0.04, 0.04, 1.1, M.chrome, { rz: Math.PI / 2, seg: 4 });
  b.solid(0.3, 2.2, 0, 4.8, 4.4, 2);
}
/** Shelves. o: {w, h, d, n, mat, fill: 'linen'|'boxes'|'jars'|'books'|'bottles'|'tins'|'mixed'}. */
export function shelves(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = o.w ?? 6, h = o.h ?? 8, d = o.d ?? 1.8, n = o.n ?? 4, mat = o.mat || M.woodMid;
  const metal = mat === M.steel || mat === M.rust;
  for (const sx of [-1, 1]) {
    if (metal) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.08), h / 2, sz * (d / 2 - 0.08), 0.16, h, 0.16, mat);
    else b.box(sx * (w / 2 - 0.1), h / 2, 0, 0.2, h, d, mat);
  }
  if (!metal) b.box(0, h / 2, -d / 2 + 0.05, w, h, 0.1, mat);
  const r = T.rng(Math.floor(x * 7 + z * 13 + 101));
  for (let i = 0; i < n; i++) {
    const yy = 0.4 + i * (h - 0.6) / (n - 1 || 1);
    b.box(0, yy, 0, w - 0.1, 0.12, d, mat);
    if (i === n - 1 && o.top !== true) continue;
    const kind = o.fill === 'mixed' ? ['linen', 'boxes', 'jars', 'tins', 'bottles'][Math.floor(r() * 5)] : o.fill;
    let px = -w / 2 + 0.3;
    const room = (h - 0.6) / (n - 1 || 1) - 0.3;
    while (px < w / 2 - 0.6) {
      if (r() < 0.18) { px += 0.5 + r(); continue; }
      if (kind === 'linen') { const ww = 1.1 + r() * 0.4; const hh = Math.min(room, 0.25 * (2 + Math.floor(r() * 4))); b.box(px + ww / 2, yy + 0.06 + hh / 2, 0.05, ww, hh, d * 0.8, M.linen, { tint: r() < 0.3 ? '#d8d0c0' : null }); px += ww + 0.1; }
      else if (kind === 'boxes') { const s = 0.8 + r() * Math.min(1.2, room - 0.5); b.box(px + s / 2, yy + 0.06 + s / 2, 0, s * (1 + r() * 0.4), s, Math.min(d - 0.2, s * 1.2), M.cardboard, { ry: rnd(-0.15, 0.15) }); px += s * 1.4 + 0.1; }
      else if (kind === 'jars') { const rr = 0.18 + r() * 0.12, hh = 0.5 + r() * 0.4; b.cyl(px + rr, yy + 0.06 + hh / 2, rnd(-0.3, 0.3), rr, rr, hh, M.bottle, { seg: 8, tint: ['#a87', '#998', '#cb9', '#776'][Math.floor(r() * 4)] }); px += rr * 2 + 0.1; }
      else if (kind === 'tins') { const rr = 0.22, hh = 0.5; b.cyl(px + rr, yy + 0.06 + hh / 2, rnd(-0.3, 0.3), rr, rr, hh, M.rust, { seg: 8 }); px += rr * 2 + 0.06; }
      else if (kind === 'bottles') { const hh = 0.9 + r() * 0.5; b.cyl(px + 0.15, yy + 0.06 + hh * 0.35, 0, 0.15, 0.15, hh * 0.7, M.bottle, { seg: 7, tint: ['#5a8a5a', '#8a5a2a', '#a0a0a0', '#3a5a3a', '#6a2a1a'][Math.floor(r() * 5)] }); b.cyl(px + 0.15, yy + 0.06 + hh * 0.85, 0, 0.05, 0.1, hh * 0.3, M.bottle, { seg: 6, tint: '#4a6a4a' }); px += 0.36; }
      else if (kind === 'books') { const ww = 1.2 + r() * 1.5; b.box(px + ww / 2, yy + 0.06 + 0.55, 0, ww, 1.1 * (0.8 + r() * 0.3), d * 0.75, M.books, { uvOff: [r(), 0] }); px += ww + 0.05; }
      else { px += 1; }
    }
  }
  b.solid(0, h / 2, 0, w, h, d);
  return b;
}
/** The key box on the Linen Room wall: a steel cabinet with a four-digit keypad. */
export function keyBox(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0, 0.3, 2.4, 3.0, 0.6, M.steel);
  b.box(-0.7, 0.9, 0.62, 0.7, 0.9, 0.06, M.black);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box(-0.92 + c * 0.22, 1.18 - r * 0.2, 0.66, 0.16, 0.14, 0.04, M.chrome);
  b.box(-0.7, 1.45, 0.64, 0.5, 0.12, 0.04, flat(T.sign('0000', { w: 128, h: 32, style: 'plain', bg: '#102010', fg: '#40ff60', font: 'monospace' }), { emissive: 0.6 }), { uv: 'local', faces: ['pz'], cast: false });
  b.box(0, -1.6, 0.3, 0.1, 0.2, 0.1, M.steel);
  // the door (hinged on its left edge)
  const pivot = new THREE.Group();
  pivot.position.copy(b.W(-0.2, 0, 0.62)); pivot.rotation.y = ry;
  const g = bake([[boxGeo(1.4, 2.8, 0.08), M4(0.7, 0, 0)], [boxGeo(0.1, 0.5, 0.12), M4(1.25, 0, 0.08)]]);
  const door = new THREE.Mesh(g, M.steel); door.castShadow = true; pivot.add(door);
  H.world.scene.add(pivot);
  // the hooks inside
  for (let i = 0; i < 6; i++) { const cx = 0.1 + (i % 3) * 0.35, cy = 0.8 - Math.floor(i / 3) * 1.0; b.cyl(cx, cy, 0.45, 0.03, 0.03, 0.3, M.brass, { rx: Math.PI / 2, seg: 4 }); if (i !== 2) b.box(cx, cy - 0.3, 0.55, 0.12, 0.45, 0.03, M.brass); }
  return { b, pivot, pos: b.W(-0.2, 0.3, 1.2), keyPos: b.W(0.8, 0.5, 0.55), open() { pivot.userData.target = -1.9; }, update(dt) { const t = pivot.userData.target ?? 0; const r = pivot.rotation.y - ry; if (Math.abs(r - t) > 1e-3) pivot.rotation.y = ry + r + Math.sign(t - r) * Math.min(Math.abs(t - r), dt * 3); } };
}
/** The main fuse box: three empty sockets and the big lever. */
export function fuseBox(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0, 0.45, 4.2, 5.2, 0.9, M.steel);
  b.box(0, 0, 0.92, 3.8, 4.8, 0.04, M.iron);
  b.box(0, 2.3, 0.95, 2.4, 0.4, 0.02, flat(T.sign('DANGER - MAIN SUPPLY', { w: 256, h: 40, style: 'enamel', bg: '#d8c020', fg: '#1a1a1a' })), { uv: 'local', faces: ['pz'], cast: false });
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const sx = -1.2 + i * 1.0;
    b.box(sx, 0.6, 1.0, 0.5, 1.6, 0.12, M.black);
    for (const sy of [1.25, -0.05]) b.box(sx, sy + 0.6 - 0.6, 1.08, 0.3, 0.2, 0.12, M.brass);
    slots.push({ pos: b.W(sx, 0.6, 1.25), i });
  }
  b.box(0, -1.4, 1.0, 3.2, 0.6, 0.06, flat(T.sign('1         2         3', { w: 256, h: 40, style: 'plain', bg: '#1a1a1a', fg: '#c8c0a0' })), { uv: 'local', faces: ['pz'], cast: false });
  // conduits up to the ceiling
  for (const sx of [-1.4, -0.5, 0.5, 1.4]) b.cyl(sx, 6, 0.4, 0.14, 0.14, 7, M.pipe, { seg: 6 });
  // the lever, on the right side
  b.box(2.35, 0, 0.6, 0.5, 2.0, 0.6, M.steel);
  const pivot = new THREE.Group(); pivot.position.copy(b.W(2.65, 0, 0.6)); pivot.rotation.y = ry;
  const arm = new THREE.Group(); pivot.add(arm); arm.rotation.x = -0.7;
  const lever = new THREE.Mesh(bake([[boxGeo(0.14, 1.8, 0.14), M4(0.1, 0.9, 0)], [cylGeo(0.14, 0.14, 0.7, 8), M4(0.1, 1.85, 0, 0, 0, Math.PI / 2)]]), M.iron);
  lever.castShadow = true; arm.add(lever);
  const knob = new THREE.Mesh(sphereGeo(0.2, 8), new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.4 })); knob.position.set(0.48, 1.85, 0); arm.add(knob);
  H.world.scene.add(pivot);
  // warning lamp
  const fx = H.lights.add({ pos: b.W(1.5, 2.3, 1.4), color: 0xff3010, power: 2.5, range: 6, circuit: 'event', flicker: 0.2, halo: 0.8 });
  fx.on = true;
  H.lights.glow(fx, 'bulb', WM(b, 1.5, 2.3, 1.05, 0, 0, 0, 0.8), 1.5);
  return { b, slots, lever: arm, pos: b.W(0, 0.3, 1.8), leverPos: b.W(2.65, 0.4, 1.6), lamp: fx };
}
export function iceMachine(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 3, 0, 3.4, 6, 2.6, M.steel);
  b.box(0, 4.3, 1.31, 2.6, 2.0, 0.04, M.chrome);
  b.box(0, 1.8, 1.31, 2.2, 1.3, 0.05, M.black);
  b.box(0, 5.6, 1.32, 2.8, 0.5, 0.02, flat(T.sign('ICE', { w: 128, h: 40, style: 'enamel', bg: '#204a7a', fg: '#e8e8e8', font: 'Arial' }), { emissive: 0.1 }), { uv: 'local', faces: ['pz'], cast: false });
  b.solid(0, 3, 0, 3.4, 6, 2.6);
  return b.W(0, 3, 1.5);
}

// --- the kitchen -------------------------------------------------------------------------------------------------------------------------------------
export function stove(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), w = o.w ?? 7;
  b.box(0, 1.6, 0, w, 3.2, 3, M.iron);
  b.box(0, 3.25, 0, w + 0.1, 0.1, 3.1, M.steel);
  for (let i = 0; i < Math.floor(w / 1.8); i++) for (const sz of [-0.7, 0.7]) { const cx = -w / 2 + 0.9 + i * 1.8; b.cyl(cx, 3.32, sz, 0.55, 0.55, 0.06, M.black, { seg: 12 }); b.torus(cx, 3.36, sz, 0.42, 0.05, M.iron, { rx: Math.PI / 2, seg: 12 }); }
  for (let i = 0; i < 2; i++) { const cx = (i - 0.5) * w * 0.5; b.box(cx, 1.4, 1.52, w * 0.42, 1.8, 0.05, M.steel); b.cyl(cx, 2.15, 1.7, 0.06, 0.06, w * 0.3, M.chrome, { rz: Math.PI / 2, seg: 6 }); }
  for (let i = 0; i < 6; i++) b.cyl(-w / 2 + 0.7 + i * (w - 1.4) / 5, 2.75, 1.56, 0.12, 0.12, 0.15, M.black, { rx: Math.PI / 2, seg: 8 });
  // the hood
  b.box(0, 9.2, -0.3, w + 0.6, 0.4, 3.6, M.steel);
  b.box(0, 9.8, -0.6, w - 1, 1.0, 2.6, M.steel);
  b.box(0, 11.5, -1.0, 2, 2.6, 1.6, M.steel);
  // a pot or two
  b.cyl(-w / 2 + 0.9, 3.9, 0.7, 0.55, 0.5, 1.1, M.steel, { seg: 12 });
  b.cyl(w / 2 - 2.7, 3.55, -0.7, 0.6, 0.55, 0.4, M.iron, { seg: 12 }); b.cyl(w / 2 - 1.6, 3.55, -0.7, 0.05, 0.05, 1.4, M.iron, { rz: Math.PI / 2, seg: 4 });
  b.solid(0, 1.65, 0, w, 3.3, 3);
}
export function steelCounter(x, y, z, ry, w = 8, d = 3, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 3.2, 0, w, 0.12, d, M.steel);
  b.box(0, 3.0, d / 2 - 0.05, w, 0.3, 0.08, M.steel);
  b.box(0, 0.8, 0, w - 0.3, 0.08, d - 0.3, M.steel);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * (w / 2 - 0.2), 1.6, sz * (d / 2 - 0.2), 0.08, 0.08, 3.1, M.steel, { seg: 6 });
  const r = T.rng(Math.floor(x * 3 + z * 5 + 7));
  if (o.items !== false) for (let i = 0; i < Math.floor(w / 2.2); i++) {
    const cx = -w / 2 + 1 + i * 2.2 + r() * 0.5, k = r();
    if (k < 0.3) b.cyl(cx, 3.6, rnd(-0.6, 0.6), 0.5, 0.45, 0.7, M.steel, { seg: 10 });
    else if (k < 0.5) { b.box(cx, 3.32, 0, 1.4, 0.12, 0.9, M.woodLight); b.box(cx + 0.2, 3.42, 0.1, 0.9, 0.02, 0.12, M.chrome, { ry: 0.4 }); }
    else if (k < 0.7) b.cyl(cx, 3.5, rnd(-0.6, 0.6), 0.25, 0.25, 0.5, M.bottle, { seg: 8, tint: '#c8b080' });
    else if (k < 0.85) for (let j = 0; j < 3; j++) b.cyl(cx, 3.3 + j * 0.08, 0, 0.6, 0.6, 0.06, M.porcelain, { seg: 12 });
  }
  // hanging under the shelf: pans
  if (o.pans) for (let i = 0; i < 3; i++) b.cyl(-w / 2 + 1.5 + i * 2, 0.95, 0, 0.6, 0.6, 0.15, M.iron, { seg: 12 });
  b.solid(0, 1.6, 0, w, 3.3, d);
}
export function potRack(x, ceil, z, ry, o = {}) {
  const M = H.M, b = at(x, ceil, z, ry), w = o.w ?? 6;
  for (const sx of [-1, 1]) b.cyl(sx * (w / 2 - 0.3), -1.2, 0, 0.03, 0.03, 2.4, M.iron, { seg: 4 });
  b.box(0, -2.4, 0, w, 0.12, 0.12, M.iron); b.box(0, -2.4, 0, 0.12, 0.12, 1.6, M.iron);
  for (let i = 0; i < Math.floor(w / 0.9); i++) {
    const cx = -w / 2 + 0.6 + i * 0.9, r = 0.35 + (i % 3) * 0.12, drop = 0.6 + (i % 2) * 0.4;
    b.cyl(cx, -2.4 - drop / 2, 0, 0.015, 0.015, drop, M.iron, { seg: 3 });
    b.cyl(cx, -2.4 - drop - r, 0.05, r, r, 0.12, i % 3 ? M.iron : M.rust, { rx: Math.PI / 2, seg: 12 });
  }
}
export function kitchenSink(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  steelCounter(x, y, z, ry, 6, 3, { items: false });
  b.box(0, 3.0, 0, 4, 0.5, 2.2, M.chrome, { faces: ['ny', 'pz', 'nz', 'px', 'nx'] });
  b.box(0, 2.78, 0, 3.8, 0.06, 2.0, M.black);
  b.cyl(0, 4.0, -1.2, 0.07, 0.07, 1.6, M.chrome, { seg: 6 }); b.cyl(0, 4.75, -0.8, 0.06, 0.06, 0.9, M.chrome, { rx: Math.PI / 2, seg: 6 });
  return b.W(0, 3.6, 0);
}
/** Meat hooks on a rail with sheeted shapes hanging from them (the walk-in freezer). */
export function meatHooks(x, y, z, ry, w, ceil) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, ceil - y - 1, 0, w, 0.2, 0.3, M.steel);
  const r = T.rng(Math.floor(x * 11 + z));
  for (let i = 0; i < Math.floor(w / 2.2); i++) {
    const cx = -w / 2 + 1.2 + i * 2.2;
    b.cyl(cx, ceil - y - 1.5, 0, 0.03, 0.03, 1, M.steel, { seg: 3 });
    if (r() < 0.75) {
      const h = 3.2 + r() * 1.6;
      b.sphere(cx, ceil - y - 2 - h / 2, 0, 1, M.sheet, { s: [0.75, h / 2, 0.6], seg: 10, ry: r() * 3 });
      if (r() < 0.4) b.box(cx, ceil - y - 2 - h + 0.1, 0.2, 0.6, 0.5, 0.4, M.sheet, { tint: '#6a2a28' });
    }
  }
}

// --- the office -------------------------------------------------------------------------------------------------------------------------------------
export function filingCabinet(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry), mat = o.mat || M.steel;
  b.box(0, 2.6, 0, 1.8, 5.2, 2.4, mat);
  for (let i = 0; i < 4; i++) { b.box(0, 0.75 + i * 1.25, 1.21, 1.6, 1.1, 0.04, mat, { tint: '#d8d8d8' }); b.box(0, 0.95 + i * 1.25, 1.27, 0.6, 0.1, 0.08, M.chrome); b.box(0, 1.15 + i * 1.25, 1.24, 0.4, 0.2, 0.02, M.paper); }
  if (o.open) { b.box(0, 0.75 + 2 * 1.25, 2.1, 1.5, 1.0, 1.8, mat); for (let i = 0; i < 8; i++) b.box(0, 3.4, 1.4 + i * 0.2, 1.3, 0.9, 0.04, M.paper, { rx: rnd(-0.2, 0.2) }); }
  b.solid(0, 2.6, 0, 1.8, 5.2, 2.4);
}
export function safe(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 2.0, 0, 3, 3.6, 2.8, M.iron);
  b.box(0, 2.0, 1.41, 2.6, 3.2, 0.04, M.iron, { tint: '#3a1a12' });
  b.cyl(0.4, 2.4, 1.5, 0.35, 0.35, 0.12, M.chrome, { rx: Math.PI / 2, seg: 16 });
  b.cyl(-0.6, 1.8, 1.5, 0.1, 0.1, 0.25, M.brass, { rx: Math.PI / 2, seg: 8 }); b.box(-0.6, 1.8, 1.65, 0.6, 0.12, 0.08, M.brass);
  b.box(0, 3.5, 1.43, 1.8, 0.25, 0.02, flat(T.sign('HALE & SONS', { w: 256, h: 40, style: 'brass' }), { metal: 0.6, rough: 0.4 }), { uv: 'local', faces: ['pz'], cast: false });
  b.solid(0, 1.9, 0, 3, 3.8, 2.8);
}
export function bookcase(x, y, z, ry, o = {}) {
  const M = H.M, w = o.w ?? 5, h = o.h ?? 10;
  const b = shelves(x, y, z, ry, { w, h, d: 1.6, n: o.n ?? 6, mat: M.woodDark, fill: 'books' });
  b.box(0, h + 0.2, 0.1, w + 0.4, 0.4, 1.9, M.woodDark);
  b.box(0, 0.25, 0.05, w + 0.1, 0.5, 1.7, M.woodDark);
  return b;
}
export function globe(x, y, z, ry = 0) {
  const M = H.M, b = at(x, y, z, ry);
  b.lathe([[0.9, 0], [0.9, 0.15], [0.2, 0.35], [0.12, 2.2], [0.3, 2.5], [0, 2.6]], 0, 0, 0, M.woodDark, { seg: 10 });
  b.torus(0, 3.6, 0, 1.05, 0.05, M.brass, { seg: 24, rz: 0.4 });
  b.sphere(0, 3.6, 0, 1.0, flat(T.canvasTex('globe', 256, 128, (c, w, hh) => { c.fillStyle = '#8a7a50'; c.fillRect(0, 0, w, hh); const r = T.rng(5); c.fillStyle = '#4a5a3a'; for (let i = 0; i < 12; i++) { c.beginPath(); c.ellipse(r() * w, 20 + r() * (hh - 40), 10 + r() * 30, 8 + r() * 20, r() * 3, 0, 7); c.fill(); } c.strokeStyle = 'rgba(40,30,20,0.4)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, hh); c.stroke(); } }), { rough: 0.5 }), { seg: 16 });
}
export function typewriter(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.25, 0.1, 1.6, 0.5, 1.2, M.black, { rx: 0.15 });
  b.cyl(0, 0.65, -0.45, 0.16, 0.16, 1.9, M.black, { rz: Math.PI / 2, seg: 10 });
  b.box(0, 0.95, -0.5, 1.1, 0.7, 0.02, M.paper, { rx: -0.25 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) b.cyl(-0.6 + c * 0.17 + r * 0.05, 0.5 - r * 0.07, 0.45 - r * 0.18, 0.06, 0.06, 0.04, M.chrome, { seg: 6 });
}
export function coatRack(x, y, z, o = {}) {
  const M = H.M, b = at(x, y, z, o.ry || 0);
  b.lathe([[0.8, 0], [0.8, 0.1], [0.12, 0.3], [0.1, 6.8], [0.18, 7.2], [0, 7.4]], 0, 0, 0, M.woodDark, { seg: 8 });
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; b.cyl(Math.cos(a) * 0.4, 6.8, Math.sin(a) * 0.4, 0.04, 0.04, 0.9, M.brass, { rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, seg: 4 }); }
  if (o.coat) { b.box(0.5, 4.6, 0, 0.5, 4.2, 1.6, M.black, { rz: 0.05 }); b.box(0.5, 6.5, 0, 0.6, 0.6, 1.8, M.black); }
  if (o.hat) { b.cyl(-0.5, 7.0, 0, 0.45, 0.5, 0.7, M.black, { seg: 12 }); b.cyl(-0.5, 6.67, 0, 0.8, 0.8, 0.05, M.black, { seg: 14 }); }
  b.solid(0, 3.5, 0, 1, 7, 1);
}

// --- the ballroom and the bar ---------------------------------------------------------------------------------------------------------------------------
/** A grand piano: the curved case, the propped lid, the keyboard (facing local +z). Returns where its keys are. */
export function grandPiano(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  const s = new THREE.Shape();
  s.moveTo(-2.4, 0); s.lineTo(2.4, 0); s.lineTo(2.4, 1.6);
  s.bezierCurveTo(2.4, 3.2, 0.6, 3.6, 0.5, 5.4); s.bezierCurveTo(0.4, 7.2, -0.2, 7.9, -1.2, 7.9);
  s.bezierCurveTo(-2.0, 7.9, -2.4, 7.5, -2.4, 6.8); s.lineTo(-2.4, 0);
  const caseG = extrudeGeo(s, 1.2);
  b.geo(caseG, 0, 3.4, -0.6, M.lacquer, { rx: -Math.PI / 2 });
  // the lid, propped up on its stick
  const lid = extrudeGeo(s, 0.08);
  lid.translate(2.4, 0, 0); lid.rotateY(-0.72); lid.translate(-2.4, 0, 0); // hinged along the straight side
  b.geo(lid, 0, 4.04, -0.6, M.lacquer, { rx: -Math.PI / 2 });
  b.cyl(0.4, 4.8, -4.0, 0.04, 0.04, 2.6, M.lacquer, { rz: -0.35, seg: 4 });
  // keyboard and its cheeks
  b.box(0, 3.4, 0.45, 4.6, 0.3, 1.1, M.lacquer);
  b.box(0, 3.58, 0.55, 4.2, 0.06, 0.9, M.keys, { uv: 'local', faces: ['py'] });
  for (const sx of [-1, 1]) b.box(sx * 2.25, 3.75, 0.45, 0.2, 0.5, 1.1, M.lacquer);
  b.box(0, 4.0, 0.0, 4.2, 0.6, 0.12, M.lacquer);
  b.box(0, 4.35, 0.05, 1.6, 0.1, 0.6, M.paper, { rx: -1.2 });
  // legs and the lyre with its pedals
  for (const [lx, lz] of [[-2.0, 0.4], [2.0, 0.4], [-0.9, -6.6]]) b.lathe([[0.3, 0], [0.22, 0.4], [0.28, 1.0], [0.18, 2.6], [0.3, 2.9], [0, 2.9]], lx, 0, lz, M.lacquer, { seg: 10 });
  b.box(0, 1.6, -0.6, 0.8, 2.2, 0.15, M.lacquer);
  for (const px of [-0.25, 0, 0.25]) b.box(px, 0.3, -0.35, 0.12, 0.06, 0.4, M.brass);
  // the bench
  b.box(0, 1.9, 2.4, 3.2, 0.4, 1.3, M.lacquer); b.box(0, 2.12, 2.4, 3.0, 0.1, 1.15, M.velvetRed);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 1.4, 0.85, 2.4 + sz * 0.5, 0.15, 1.7, 0.15, M.lacquer);
  b.solid(0, 2.2, -3.4, 4.8, 4.4, 8);
  return { b, keys: b.W(0, 3.7, 0.5), bench: b.W(0, 2.2, 2.4) };
}
export function barStool(x, y, z) {
  const M = H.M, b = at(x, y, z, 0);
  b.lathe([[0.7, 0], [0.7, 0.1], [0.1, 0.25], [0.08, 3.4], [0, 3.4]], 0, 0, 0, M.brass, { seg: 10 });
  b.torus(0, 1.3, 0, 0.5, 0.04, M.brass, { rx: Math.PI / 2, seg: 12 });
  b.cyl(0, 3.55, 0, 0.75, 0.7, 0.3, M.leather, { seg: 14 });
}
/** The bar: a long counter (local x, from -w/2 to w/2) with a brass foot rail, the back bar with bottles and a mirror. */
export function bar(x, y, z, ry, w) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 1.9, 0, w, 3.8, 1.6, M.panel);
  b.box(0, 3.9, 0.1, w + 0.4, 0.2, 2.2, M.marbleBlack);
  b.cyl(0, 0.5, 1.25, 0.08, 0.08, w, M.brass, { rz: Math.PI / 2, seg: 8 });
  for (let i = 0; i < Math.floor(w / 4) + 1; i++) b.cyl(-w / 2 + i * 4, 0.25, 1.1, 0.05, 0.05, 0.5, M.brass, { seg: 4 });
  // back bar on the wall behind (at local z -4.5)
  b.box(0, 1.9, -4.4, w, 3.8, 1.6, M.woodDark);
  b.box(0, 3.85, -4.4, w + 0.2, 0.15, 1.7, M.marbleBlack);
  b.box(0, 7, -5.1, w - 2, 5, 0.1, M.mirror, { faces: ['pz'] });
  b.box(0, 9.6, -4.9, w, 0.4, 0.6, M.woodDark);
  for (let i = 0; i < 2; i++) b.box(0, 5.4 + i * 2, -4.85, w - 2.2, 0.1, 0.6, M.glass);
  const r = T.rng(13);
  for (let row = 0; row < 3; row++) {
    let px = -w / 2 + 1.4;
    while (px < w / 2 - 1.4) {
      const hh = 0.9 + r() * 0.6, yy = row === 0 ? 3.95 : 5.45 + (row - 1) * 2;
      if (r() < 0.85) { b.cyl(px, yy + hh * 0.35, -4.75, 0.17, 0.17, hh * 0.7, M.bottle, { seg: 7, tint: ['#5a8a5a', '#8a5a2a', '#b0b0b0', '#3a5a3a', '#7a2a1a', '#c8a050'][Math.floor(r() * 6)] }); b.cyl(px, yy + hh * 0.85, -4.75, 0.05, 0.11, hh * 0.3, M.bottle, { seg: 6, tint: '#4a6a4a' }); }
      px += 0.42 + r() * 0.2;
    }
  }
  // glasses and a bottle on the counter
  for (let i = 0; i < 5; i++) b.cyl(-w / 2 + 2 + i * 2.6 + r(), 4.25, 0.3, 0.14, 0.11, 0.5, M.glass, { seg: 8 });
  b.solid(0, 2, 0, w, 4, 1.8);
  b.solid(0, 2, -4.4, w, 4, 1.8);
}
/** A gramophone on its cabinet (it plays by itself). */
export function gramophone(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 1.6, 0, 2.2, 3.2, 2.0, M.woodDark);
  b.box(0, 3.4, 0, 1.6, 0.4, 1.6, M.woodMid);
  b.cyl(0, 3.65, 0, 0.7, 0.7, 0.06, M.black, { seg: 18 });
  b.cyl(0.7, 4.0, -0.6, 0.06, 0.06, 0.8, M.brass, { seg: 6 });
  b.lathe([[0.08, 0], [0.12, 0.5], [0.3, 1.2], [0.8, 1.8], [1.4, 2.1], [1.45, 2.15]], 0.6, 4.3, -0.5, M.brass, { seg: 16, rx: -0.9, ry: 0.3 });
  b.solid(0, 1.6, 0, 2.2, 3.2, 2);
  return b.W(0, 4.4, 0);
}

// --- the lobby ------------------------------------------------------------------------------------------------------------------------------------------------
/** The fireplace: a marble surround, the mantel, glowing embers (someone keeps it burning). Returns its light. */
export function fireplace(x, y, z, ry, o = {}) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.25, 0.9, 9, 0.5, 2.6, M.marbleBlack);
  for (const sx of [-1, 1]) { b.box(sx * 3.1, 3.2, 0.4, 1.4, 5.4, 1.2, M.marbleWhite); b.box(sx * 3.1, 3.2, 1.05, 1.1, 4.6, 0.1, M.marbleBlack); }
  b.box(0, 6.4, 0.4, 7.6, 1.2, 1.2, M.marbleWhite);
  b.box(0, 7.15, 0.5, 8.6, 0.3, 1.6, M.marbleBlack);
  b.box(0, 3.2, -0.1, 4.8, 5.4, 0.4, M.black);
  b.box(0, 3.5, 0.2, 4.8, 0.1, 1.0, M.black);
  // the grate and logs
  for (let i = 0; i < 5; i++) b.box(-1.6 + i * 0.8, 0.9, 0.5, 0.08, 0.8, 0.08, M.iron);
  b.box(0, 0.6, 0.5, 3.6, 0.1, 1.2, M.iron);
  b.cyl(-0.3, 1.0, 0.4, 0.3, 0.3, 2.8, M.charred, { rz: Math.PI / 2 - 0.15, seg: 8 });
  b.cyl(0.4, 1.4, 0.6, 0.25, 0.25, 2.4, M.charred, { rz: Math.PI / 2 + 0.25, ry: 0.3, seg: 8 });
  const fx = H.lights.add({ pos: b.W(0, 2.0, 2.2), color: 0xff6a20, power: 14, range: 16, circuit: 'battery', flicker: 0.45, halo: 0.6 });
  for (let i = 0; i < 6; i++) H.lights.glow(fx, 'ember', WM(b, -1.2 + i * 0.5, 0.75 + (i % 2) * 0.2, 0.5 + (i % 3) * 0.15, -Math.PI / 2, 0, 0, [0.6, 0.4, 1]), 0.9, i % 2 ? 0xff5010 : 0xff8020);
  for (let i = 0; i < 4; i++) H.lights.glow(fx, 'flame', WM(b, -0.9 + i * 0.6, 1.3, 0.5, 0, 0, 0, 2.5 + (i % 2)), 0.7, 0xff7020);
  // things on the mantel
  if (o.clock !== false) { b.box(0, 7.8, 0.5, 1.4, 1.0, 0.6, M.woodDark); b.cyl(0, 7.9, 0.82, 0.4, 0.4, 0.04, flat(T.clockFace(), { rough: 0.5 }), { rx: Math.PI / 2, seg: 14, cast: false }); }
  for (const sx of [-1, 1]) { b.lathe([[0.3, 0], [0.12, 0.2], [0.08, 0.9], [0.25, 1.0], [0, 1.05]], sx * 3.2, 7.3, 0.5, M.brass, { seg: 8 }); b.cyl(sx * 3.2, 8.7, 0.5, 0.08, 0.08, 0.5, M.wax, { seg: 6 }); }
  b.solid(0, 3.6, 0.4, 9, 7.2, 1.4);
  return fx;
}
/** The grandfather clock, stopped at 3:33. Returns the pendulum (it starts again when the power comes back). */
export function grandfatherClock(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.6, 0, 2.6, 1.2, 1.6, M.woodDark);
  b.box(0, 4.2, 0, 2.0, 6.0, 1.3, M.woodDark);
  b.box(0, 4.0, 0.66, 1.2, 4.6, 0.04, M.glass);
  b.box(0, 8.6, 0, 2.6, 2.8, 1.6, M.woodDark);
  b.lathe([[1.4, 0], [1.4, 0.2], [0.9, 0.6], [0.2, 1.0], [0.2, 1.3], [0, 1.4]], 0, 10, 0, M.woodDark, { seg: 4, s: [1, 1, 0.6] });
  b.cyl(0, 8.6, 0.81, 1.05, 1.05, 0.04, flat(T.clockFace({ style: 'g' }), { rough: 0.5 }), { rx: Math.PI / 2, seg: 20, cast: false });
  b.torus(0, 8.6, 0.84, 1.08, 0.08, M.brass, { seg: 24 });
  for (const sx of [-1, 1]) b.lathe([[0.15, 0], [0.15, 2.6], [0.22, 2.7], [0, 2.8]], sx * 1.2, 7.2, 0.7, M.woodDark, { seg: 8 });
  const pivot = new THREE.Group(); pivot.position.copy(b.W(0, 6.4, 0.2)); pivot.rotation.y = ry;
  const p = new THREE.Mesh(bake([[cylGeo(0.03, 0.03, 3.4, 4), M4(0, -1.7, 0)], [cylGeo(0.4, 0.4, 0.08, 16), M4(0, -3.5, 0, Math.PI / 2, 0, 0)]]), M.brass);
  pivot.add(p); H.world.scene.add(pivot);
  for (const sx of [-0.4, 0.4]) b.cyl(sx, 5.0, 0.2, 0.14, 0.14, 1.0, M.brass, { seg: 8 });
  b.solid(0, 5, 0, 2.6, 10, 1.6);
  return { pendulum: pivot, pos: b.W(0, 8.6, 1.2) };
}
export function pottedPalm(x, y, z, s = 1, o = {}) {
  const M = H.M, b = at(x, y, z, Math.random() * 6);
  b.lathe([[0.6 * s, 0], [0.8 * s, 0.2 * s], [0.65 * s, 0.5 * s], [1.0 * s, 1.6 * s], [1.15 * s, 2.0 * s], [1.0 * s, 2.1 * s]], 0, 0, 0, o.pot || M.brass, { seg: 14 });
  b.cyl(0, 1.95 * s, 0, 0.95 * s, 0.95 * s, 0.05, M.black, { seg: 12 });
  const dead = o.dead;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rnd(-0.2, 0.2), len = (3 + rnd(0, 1.5)) * s, droop = dead ? 1.9 : 1.1 + rnd(0, 0.4);
    b.cyl(Math.cos(a) * 0.3, 2.0 * s + len * 0.3, Math.sin(a) * 0.3, 0.03, 0.05, len * 0.7, M.woodMid, { rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, seg: 4 });
    b.box(Math.cos(a) * len * 0.45, 2.0 * s + len * 0.55, Math.sin(a) * len * 0.45, len, 0.02, 0.9 * s, M.leaf, { ry: -a, rz: 0.55 - droop * 0.3, tint: dead ? '#7a6a40' : null });
  }
  b.solid(0, 1.2 * s, 0, 2 * s, 2.4 * s, 2 * s);
}
export function luggageTrolley(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.7, 0, 5, 0.25, 2.6, M.velvetRed);
  b.box(0, 0.55, 0, 5.1, 0.12, 2.7, M.brass);
  for (const sx of [-1, 1]) { b.cyl(sx * 2.4, 3.7, 0, 0.08, 0.08, 6, M.brass, { seg: 6 }); b.torus(sx * 2.4, 6.7, 0, 1.2, 0.08, M.brass, { arc: Math.PI, ry: Math.PI / 2, seg: 12 }); }
  b.cyl(0, 6.7, 1.2, 0.08, 0.08, 4.8, M.brass, { rz: Math.PI / 2, seg: 6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 2.2, 0.25, sz * 1.1, 0.25, 0.25, 0.15, M.rubber, { rz: Math.PI / 2, seg: 10 });
  suitcase(x, y, z, ry, -1.0, 0.85, 0, 1.0, M.leather);
  suitcase(x, y, z, ry, 1.2, 0.85, 0, 0.8, M.velvetGreen);
  suitcase(x, y, z, ry, -0.8, 2.25, 0.1, 0.75, M.leather, 0.2);
  b.solid(0, 3.4, 0, 5.2, 6.8, 2.8);
}
export function suitcase(x, y, z, ry, lx, ly, lz, s = 1, mat = H.M.leather, rot = 0) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(lx, ly + 0.7 * s, lz, 2.6 * s, 1.4 * s, 1.0 * s, mat, { ry: rot });
  b.box(lx, ly + 1.45 * s, lz, 0.9 * s, 0.12, 0.15, M.leather, { ry: rot });
  for (const sx of [-1, 1]) b.box(lx + sx * 0.9 * s, ly + 0.7 * s, lz, 0.12, 1.45 * s, 1.05 * s, M.brass, { ry: rot });
}
/** A service bell on the desk. */
export function serviceBell(x, y, z) {
  const M = H.M, b = at(x, y, z, 0);
  b.cyl(0, 0.05, 0, 0.42, 0.45, 0.1, M.woodDark, { seg: 12 });
  b.sphere(0, 0.12, 0, 0.36, M.brass, { part: 0.5, seg: 14 });
  b.cyl(0, 0.52, 0, 0.04, 0.04, 0.12, M.brass, { seg: 6 }); b.sphere(0, 0.6, 0, 0.07, M.brass, { seg: 6 });
  return b.W(0, 0.3, 0);
}
/** An open book (the guest register). */
export function ledger(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.box(s * 0.75, 0.05, 0, 1.5, 0.1, 2.0, M.leather, { rz: s * -0.06 });
    b.box(s * 0.72, 0.13, 0, 1.38, 0.08, 1.9, M.paper, { rz: s * -0.06, tint: '#e8dcc0' });
  }
  return b.W(0, 0.3, 0);
}
/** A table telephone switchboard of the 1950s for the front desk. */
export function deskPhone(x, y, z, ry) {
  const M = H.M, b = at(x, y, z, ry);
  b.box(0, 0.3, 0, 1.3, 0.6, 1.0, M.black);
  b.box(0, 0.7, -0.05, 1.5, 0.22, 0.3, M.black);
  for (const sx of [-1, 1]) b.sphere(sx * 0.65, 0.7, -0.05, 0.2, M.black, { seg: 6 });
  b.cyl(0, 0.62, 0.3, 0.3, 0.3, 0.04, M.chrome, { rx: Math.PI / 2 - 0.4, seg: 12 });
  return b.W(0, 0.6, 0);
}
/** A portrait of Hale over the fireplace (the face is a porcelain smile when o.masked). */
export function portrait(x, y, z, ry, o = {}) {
  return painting(x, y, z, ry, o.w ?? 3.2, o.h ?? 4, T.portraitHale(!!o.masked), { frame: 0.5 });
}
