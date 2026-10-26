// Catalogue: plants — houseplants, floor trees, succulents, hanging & wall
// planters, seasonal bouquets, herbs, a plant mister and decorative pots.
// Foliage is built from a curved, folded leaf geometry, cloned and merged per
// plant (cached), flagged userData.leaf so the plant behavior can wilt it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, lathe, tube, at, rot, group, decal, labelTexture, FONT } from '../items/kit.js';
import { seeded } from '../core/utils.js';
import { canvas, toTexture, cached } from '../core/textures.js';

const PI = Math.PI;
const GEO = new Map();
function sharedGeo(key, make) {
  let g = GEO.get('pl:' + key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set('pl:' + key, g); }
  return g;
}
function meshOf(geo, m, { cast = true, receive = true } = {}) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = receive; return o; }
function merged(key, m, make, leaf = true) {
  const o = meshOf(sharedGeo(key, () => mergeGeometries(make())), m);
  if (leaf) o.userData.leaf = true;
  return o;
}
const leafify = (o) => { o.userData.leaf = true; return o; };
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const tubeGeo = (pts, r, seg = 16, rad = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V)), seg, r, rad);
const leafMat = (c, o = {}) => mat(c, { rough: 0.5, side: THREE.DoubleSide, ...o });
const glossy = (c) => leafMat(c, { rough: 0.28, clearcoat: 0.5 });
const stemMat = (c = '#5d7a3a') => mat(c, { rough: 0.7 });
const barkMat = (c = '#6b4a32') => mat(c, { rough: 0.9 });

// A single leaf along +Y (base at origin). Top face is -Z; the tip droops toward +Z,
// edges fold up toward -Z. Pitch it toward +Z to lean it outward.
function leafGeo(key, { len, wid, fold = 0.25, droop = 0.25, segs = 8, shape = 'ovate', center = false }) {
  return sharedGeo('leaf:' + key, () => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      let w;
      if (shape === 'lance') w = Math.pow(Math.sin(PI * u), 0.85) * (1 - u * 0.35);
      else if (shape === 'round') w = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
      else if (shape === 'fiddle') w = Math.pow(Math.sin(PI * Math.pow(u, 1.45)), 0.65) * (0.86 + 0.14 * Math.cos((u - 0.8) * 7));
      else if (shape === 'heart') w = Math.pow(Math.sin(PI * Math.pow(u, 0.55)), 0.75) * (u < 0.12 ? 0.6 + u * 3.3 : 1);
      else if (shape === 'needle') w = 1 - u * 0.8;
      else w = Math.pow(Math.sin(PI * Math.pow(u, 0.8)), 0.8);
      w *= wid / 2;
      const y = u * len, zd = droop * u * u * len;
      for (const s of [-1, 0, 1]) { pos.push(s * w, y, zd - Math.abs(s) * w * fold); uv.push(0.5 + s * 0.5, u); }
    }
    for (let i = 0; i < segs; i++) { const a = i * 3; idx.push(a, a + 1, a + 4, a, a + 4, a + 3, a + 1, a + 2, a + 5, a + 1, a + 5, a + 4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    if (center) g.translate(0, -len / 2, 0);
    g.computeVertexNormals();
    return g;
  });
}
const _M = () => new THREE.Matrix4();
function xf(geo, { p = [0, 0, 0], yaw = 0, pitch = 0, spin = 0, rz = 0, s = 1, sy = 1 }) {
  const m = _M().makeScale(s, s * sy, s);
  if (rz) m.premultiply(_M().makeRotationZ(rz));
  if (spin) m.premultiply(_M().makeRotationY(spin));
  if (pitch) m.premultiply(_M().makeRotationX(pitch));
  if (yaw) m.premultiply(_M().makeRotationY(yaw));
  m.premultiply(_M().makeTranslation(p[0], p[1], p[2]));
  return geo.clone().applyMatrix4(m);
}
const dirOf = (yaw, pitch, len) => [Math.sin(yaw) * Math.sin(pitch) * len, Math.cos(pitch) * len, Math.cos(yaw) * Math.sin(pitch) * len];

// ------------------------------------------------------------------ pots
const SOIL = () => mat('#3b2a1e', { rough: 1 });
const POT_PROFILES = {
  terracotta: (r, h) => [[0.001, 0], [r * 0.74, 0], [r * 0.93, h * 0.8], [r * 1.04, h * 0.82], [r * 1.05, h], [r * 0.97, h], [r * 0.94, h * 0.84], [0.001, h * 0.84]],
  cylinder: (r, h) => [[0.001, 0], [r * 0.96, 0], [r, h * 0.04], [r, h], [r * 0.92, h], [r * 0.92, h * 0.9], [0.001, h * 0.9]],
  taper: (r, h) => [[0.001, 0], [r * 0.68, 0], [r * 0.72, h * 0.05], [r, h], [r * 0.93, h], [r * 0.66, h * 0.12], [0.001, h * 0.12]],
  belly: (r, h) => [[0.001, 0], [r * 0.6, 0], [r * 0.95, h * 0.35], [r, h * 0.6], [r * 0.85, h], [r * 0.78, h], [r * 0.8, h * 0.6], [0.001, h * 0.3]],
  bowl: (r, h) => [[0.001, 0], [r * 0.55, 0], [r * 0.92, h * 0.6], [r, h], [r * 0.93, h], [r * 0.85, h * 0.62], [0.001, h * 0.25]],
};
function pot({ style = 'terracotta', color = '#c46a45', r = 0.1, h = 0.12, m = null, soilAt = 0.86 }) {
  const pm = m || (style === 'terracotta' ? mat(color, { rough: 0.9 }) : MAT.ceramic(color));
  return group(lathe(POT_PROFILES[style](r, h), pm, 32), at(cyl(r * (style === 'bowl' ? 0.85 : 0.9), r * 0.9, 0.012, SOIL(), 24), 0, h * soilAt, 0));
}
function weaveTex() {
  return cached('pl:weave', () => { const c = canvas(64, 64); const ctx = c.getContext('2d'); ctx.fillStyle = '#7a5a34'; ctx.fillRect(0, 0, 64, 64); for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#d9b886' : '#c49a64'; ctx.fillRect(x + 1, y + 1, 6, 6); } return toTexture(c, { repeat: [10, 3] }); });
}
function basket(r, h, color = '#c49a64') {
  const t = weaveTex();
  return group(lathe([[0.001, 0], [r * 0.9, 0], [r, h], [r * 0.95, h], [0.001, h * 0.9]], mat(color, { map: t, rough: 0.95 }), 36), at(rot(torus(r * 0.98, 0.012, mat('#8a6438', { rough: 0.9 }), 6, 36), PI / 2, 0, 0), 0, h, 0), at(cyl(r * 0.92, r * 0.92, 0.012, SOIL(), 24), 0, h * 0.88, 0));
}

// ------------------------------------------------------------------ plants
function fiddleLeaf() {
  const g = basket(0.2, 0.34);
  const pts = [[0, 0.3, 0], [0.02, 0.75, 0.01], [-0.01, 1.15, 0], [0.012, 1.52, 0.02]];
  g.add(meshOf(tubeGeo(pts, 0.018, 20, 6), barkMat('#7a5a40')));
  const L = leafGeo('fiddle', { len: 0.34, wid: 0.25, fold: 0.18, droop: 0.28, shape: 'fiddle', segs: 10 });
  const build = (odd) => () => { const rnd = seeded(odd ? 3 : 4); const out = []; for (let i = odd; i < 26; i += 2) { const t = i / 26; const y = 0.55 + t * 1.0; out.push(xf(L, { p: [Math.sin(t * 7) * 0.012, y, 0], yaw: i * 2.4, pitch: 1.15 - t * 0.6 + rnd() * 0.15, spin: (rnd() - 0.5) * 0.4, s: 0.8 + rnd() * 0.35 + (1 - t) * 0.1 })); } return out; };
  g.add(merged('fiddleA', glossy('#2f5a2a'), build(0)), merged('fiddleB', glossy('#3d6b30'), build(1)));
  return g;
}
function zzPlant() {
  const g = pot({ style: 'cylinder', color: '#f2efe9', r: 0.1, h: 0.16 });
  const L = leafGeo('zz', { len: 0.075, wid: 0.036, fold: 0.15, droop: 0.1 });
  const stems = [], leaves = [];
  for (let k = 0; k < 8; k++) {
    const phi = k * 2.3, top = 0.42 + (k % 3) * 0.08;
    const P = (t) => [Math.sin(phi) * (0.02 + 0.13 * t * t), 0.14 + top * t, Math.cos(phi) * (0.02 + 0.13 * t * t)];
    stems.push([P(0), P(0.33), P(0.66), P(1)]);
    for (let j = 0; j < 7; j++) { const t = 0.35 + j * 0.1; for (const s of [-1, 1]) leaves.push(xf(L, { p: P(t), yaw: phi + s * 1.3, pitch: 1.05 + j * 0.04, s: 0.85 + j * 0.03 })); }
  }
  g.add(merged('zzStems', stemMat('#4a6b2a'), () => stems.map((p) => tubeGeo(p, 0.006, 12, 5)), false));
  g.add(merged('zzLeaves', glossy('#1f4a1f'), () => leaves));
  return g;
}
function ribbedSphere() {
  return sharedGeo('ribbed', () => { const g = new THREE.SphereGeometry(1, 36, 18); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 1 + Math.cos(a * 12) * 0.07; p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); return g; });
}
function cactusTrio() {
  const g = new THREE.Group();
  const cm = (c) => mat(c, { rough: 0.6 });
  const rs = ribbedSphere();
  [-0.11, 0, 0.11].forEach((x, i) => { const p = pot({ r: 0.048, h: 0.075 }); p.position.set(x, 0, i === 1 ? -0.02 : 0.02); g.add(p); });
  const saguaro = leafify(meshOf(rs, cm('#4f7a3a'))); saguaro.scale.set(0.024, 0.1, 0.024); g.add(at(saguaro, -0.11, 0.155, 0.02));
  for (const s of [-1, 1]) { const arm = leafify(meshOf(rs, cm('#4f7a3a'))); arm.scale.set(0.014, 0.04, 0.014); g.add(at(arm, -0.11 + s * 0.03, 0.17 + (s > 0 ? 0.02 : 0), 0.02)); const el = leafify(meshOf(rs, cm('#4f7a3a'))); el.scale.set(0.012, 0.016, 0.012); el.rotation.z = s * 1.2; g.add(at(el, -0.11 + s * 0.02, 0.135 + (s > 0 ? 0.02 : 0), 0.02)); }
  const barrel = leafify(meshOf(rs, cm('#5f8a44'))); barrel.scale.set(0.042, 0.038, 0.042); g.add(at(barrel, 0, 0.098, -0.02));
  for (let k = 0; k < 6; k++) { const pe = sph(0.009, mat('#ff6fa8', { rough: 0.5 }), 8, 6); pe.scale.set(0.6, 0.4, 1.4); pe.rotation.y = k * PI / 3; g.add(at(pe, Math.sin(k * PI / 3) * 0.008, 0.138, -0.02 + Math.cos(k * PI / 3) * 0.008)); }
  g.add(at(sph(0.006, mat('#ffd166'), 8, 6), 0, 0.14, -0.02));
  [[0, 0.1, 0, 0], [-0.025, 0.14, 0, 0.5], [0.022, 0.135, 0, -0.45], [0.032, 0.175, 0, -0.2]].forEach(([dx, y, , r]) => { const pad = leafify(sph(0.03, cm('#7aa04a'), 16, 12)); pad.scale.set(0.75, 1, 0.3); pad.rotation.z = r; g.add(at(pad, 0.11 + dx, y, 0.02)); });
  return g;
}
function rosetteGeo(key, n = 3, per = 8, len = 0.04) {
  return sharedGeo('ros:' + key, () => {
    const L = leafGeo('rosLeaf:' + len, { len, wid: len * 0.62, fold: 0.5, droop: -0.15, segs: 6 });
    const out = [];
    for (let r = 0; r < n; r++) for (let k = 0; k < per; k++) out.push(xf(L, { yaw: k / per * PI * 2 + r * 0.4, pitch: 0.35 + r * 0.45, s: 0.65 + r * 0.25 }));
    return mergeGeometries(out);
  });
}
function succulentBowl() {
  const g = pot({ style: 'bowl', color: '#9a9690', r: 0.14, h: 0.07, m: mat('#a8a49c', { rough: 0.85 }), soilAt: 0.8 });
  const rnd = seeded(6);
  g.add(merged('pebbles', mat('#d9d4ca', { rough: 0.8 }), () => Array.from({ length: 40 }, () => { const a = rnd() * PI * 2, r = Math.sqrt(rnd()) * 0.11; return new THREE.SphereGeometry(0.008 + rnd() * 0.006, 6, 4).scale(1, 0.6, 1).translate(Math.cos(a) * r, 0.062, Math.sin(a) * r); }), false));
  const ros = rosetteGeo('ech');
  [[-0.05, 0.02, '#8fb3a6', 1.0], [0.055, -0.03, '#b98aa0', 0.85], [0.02, 0.06, '#6f9a5a', 0.75], [-0.02, -0.06, '#9fc0b0', 0.7]].forEach(([x, z, c, s]) => { const m = leafify(meshOf(ros, leafMat(c, { rough: 0.6 }))); m.scale.setScalar(s); g.add(at(m, x, 0.06, z)); });
  return g;
}
function bonsai() {
  const g = group(at(rbox(0.32, 0.05, 0.22, 0.01, MAT.ceramic('#2f5a7a')), 0, 0.025, 0), at(box(0.3, 0.008, 0.2, SOIL()), 0, 0.048, 0));
  const moss = leafify(sph(0.08, mat('#5a8a3a', { rough: 1 }), 16, 10)); moss.scale.set(1.6, 0.18, 1.1); g.add(at(moss, -0.02, 0.052, 0));
  const bark = barkMat('#5a4434');
  g.add(meshOf(tubeGeo([[0, 0.045, 0], [0.03, 0.1, 0.01], [-0.025, 0.16, 0], [0.02, 0.22, -0.01], [0.07, 0.26, 0]], 0.016, 24, 7), bark));
  g.add(meshOf(tubeGeo([[-0.02, 0.15, 0], [-0.07, 0.19, 0.01], [-0.11, 0.2, 0.02]], 0.008, 12, 5), bark), meshOf(tubeGeo([[0.02, 0.22, -0.01], [0.05, 0.29, -0.02], [0.03, 0.33, -0.02]], 0.007, 12, 5), bark));
  const pads = [[-0.11, 0.21, 0.02, 0.06], [0.08, 0.27, 0.0, 0.065], [0.03, 0.34, -0.02, 0.05], [0.13, 0.23, 0.03, 0.045]];
  const rnd = seeded(9);
  g.add(merged('bonsaiPads', mat('#3f6b2a', { rough: 0.85 }), () => pads.flatMap(([x, y, z, r]) => Array.from({ length: 6 }, () => new THREE.SphereGeometry(r * (0.45 + rnd() * 0.3), 10, 6).scale(1, 0.45, 1).translate(x + (rnd() - 0.5) * r, y + rnd() * r * 0.3, z + (rnd() - 0.5) * r)))));
  return g;
}
function orchid() {
  const g = pot({ style: 'cylinder', color: '#f7f5f0', r: 0.065, h: 0.13 });
  const L = leafGeo('orchidLeaf', { len: 0.16, wid: 0.06, fold: 0.15, droop: 0.55 });
  g.add(merged('orchidLeaves', glossy('#2f5a2a'), () => [0, 2.2, 4.1, 5.3].map((yaw, i) => xf(L, { p: [0, 0.115, 0], yaw, pitch: 1.0 + (i % 2) * 0.15, s: 1 - i * 0.06 }))));
  g.add(at(cyl(0.0025, 0.0025, 0.36, mat('#6b8a4a', { rough: 0.6 }), 5), 0.01, 0.29, 0.0));
  const spike = [[0.01, 0.12, 0], [0.012, 0.3, 0], [0.02, 0.43, 0.02], [0.07, 0.47, 0.05], [0.12, 0.44, 0.07], [0.15, 0.39, 0.08]];
  g.add(meshOf(tubeGeo(spike, 0.003, 24, 4), stemMat('#5a6b3a')));
  const curve = new THREE.CatmullRomCurve3(spike.map(V));
  const P = leafGeo('orchidPetal', { len: 0.042, wid: 0.038, fold: -0.1, droop: 0, shape: 'round', segs: 6 });
  const flowers = [0.62, 0.7, 0.78, 0.86, 0.94, 1.0].map((t) => curve.getPoint(t));
  g.add(merged('orchidFlowers', leafMat('#fbf3f7', { rough: 0.35 }), () => flowers.flatMap((c, i) => [0, 1, 2, 3, 4].map((k) => xf(P, { p: [c.x, c.y - 0.008, c.z + 0.012], rz: k / 5 * PI * 2 + PI / 5, s: 0.9 - i * 0.04 })))));
  g.add(merged('orchidLips', leafMat('#d63c8a', { rough: 0.4 }), () => flowers.map((c, i) => new THREE.SphereGeometry(0.009 * (1 - i * 0.04), 8, 6).scale(1, 0.8, 0.6).translate(c.x, c.y - 0.01, c.z + 0.016))));
  return g;
}
function peaceLily() {
  const g = pot({ style: 'taper', color: '#5f6366', r: 0.1, h: 0.16 });
  const L = leafGeo('lily', { len: 0.2, wid: 0.07, fold: 0.3, droop: 0.4, shape: 'lance' });
  const rnd = seeded(12); const pets = [], lv = [];
  for (let k = 0; k < 14; k++) { const yaw = k * 2.4, pitch = 0.35 + rnd() * 0.5, h = 0.1 + rnd() * 0.12; const tip = dirOf(yaw, pitch, h); const base = [0, 0.14, 0]; const top = [base[0] + tip[0], base[1] + tip[1], base[2] + tip[2]]; pets.push(tubeGeo([base, [top[0] * 0.5, base[1] + tip[1] * 0.55, top[2] * 0.5], top], 0.003, 8, 4)); lv.push(xf(L, { p: top, yaw, pitch: pitch + 0.25, s: 0.85 + rnd() * 0.3 })); }
  g.add(merged('lilyPetioles', stemMat('#3f6b2a'), () => pets, false), merged('lilyLeaves', glossy('#1f4a24'), () => lv));
  const S = leafGeo('spathe', { len: 0.085, wid: 0.06, fold: 0.9, droop: -0.3 });
  const tops = [[0.03, 0.44, 0.04, 0.2], [-0.05, 0.4, -0.02, -0.5], [0.06, 0.38, -0.05, 2.6]];
  g.add(merged('lilyStalks', stemMat('#4f7a3a'), () => tops.map(([x, y, z]) => tubeGeo([[0, 0.14, 0], [x * 0.4, y * 0.6, z * 0.4], [x, y, z]], 0.0028, 10, 4)), false));
  g.add(merged('lilySpathes', leafMat('#fbfaf4', { rough: 0.4 }), () => tops.map(([x, y, z, yaw]) => xf(S, { p: [x, y - 0.012, z], yaw, pitch: 0.25 }))));
  g.add(merged('lilySpadix', mat('#efe2a8', { rough: 0.7 }), () => tops.map(([x, y, z]) => new THREE.CapsuleGeometry(0.005, 0.03, 4, 8).translate(x, y + 0.02, z)), false));
  return g;
}
function birdOfParadise() {
  const g = pot({ style: 'cylinder', color: '#b9b6b0', r: 0.22, h: 0.4, m: mat('#bdb9b2', { rough: 0.85 }) });
  const L = leafGeo('bird', { len: 0.48, wid: 0.18, fold: 0.18, droop: 0.22, shape: 'lance', segs: 10 });
  const rnd = seeded(21); const pets = [], lv = [];
  for (let k = 0; k < 10; k++) {
    const side = k % 2 ? 1 : -1;
    const yaw = (side > 0 ? 0 : PI) + (rnd() - 0.5) * 1.6, pitch = 0.08 + Math.floor(k / 2) * 0.12 + rnd() * 0.08, h = 0.55 + rnd() * 0.45;
    const d = dirOf(yaw, pitch, h); const base = [0, 0.36, 0]; const top = [d[0], 0.36 + d[1], d[2]];
    pets.push(tubeGeo([base, [top[0] * 0.5, 0.36 + d[1] * 0.5, top[2] * 0.5], top], 0.009, 10, 5));
    lv.push(xf(L, { p: top, yaw, pitch: pitch + 0.15, spin: (rnd() - 0.5) * 0.5, s: 0.85 + rnd() * 0.25 }));
  }
  g.add(merged('birdStalks', stemMat('#5a7a3a'), () => pets, false), merged('birdLeaves', glossy('#2f6a3a'), () => lv));
  return g;
}
function oliveTree() {
  const g = pot({ r: 0.2, h: 0.36 });
  const bark = barkMat('#7a6a5a');
  const br = [[[0, 0.3, 0], [0.02, 0.7, 0.01], [-0.01, 1.0, 0]], [[-0.01, 0.95, 0], [-0.15, 1.2, 0.05], [-0.25, 1.35, 0.05]], [[0, 1.0, 0], [0.12, 1.25, -0.04], [0.2, 1.42, -0.02]], [[0, 1.0, 0], [0.02, 1.3, 0.1], [0.0, 1.55, 0.08]]];
  g.add(merged('oliveBranches', bark, () => br.map((p, i) => tubeGeo(p, i ? 0.012 : 0.022, 12, 6)), false));
  const L = leafGeo('olive', { len: 0.1, wid: 0.024, fold: 0.15, droop: 0.15, shape: 'lance', segs: 5 });
  const clusters = [[-0.24, 1.38, 0.05, 0.2], [0.2, 1.45, -0.02, 0.2], [0, 1.58, 0.08, 0.2], [-0.05, 1.3, -0.08, 0.18], [0.12, 1.25, 0.12, 0.15]];
  const leaves = (seed) => () => { const rnd = seeded(seed); const out = []; for (const [x, y, z, r] of clusters) for (let i = 0; i < 40; i++) { const a = rnd() * PI * 2, rr = Math.cbrt(rnd()) * r; out.push(xf(L, { p: [x + Math.cos(a) * rr, y + (rnd() - 0.4) * r * 0.9, z + Math.sin(a) * rr], yaw: rnd() * PI * 2, pitch: 0.6 + rnd() * 1.6, s: 0.8 + rnd() * 0.4 })); } return out; };
  g.add(merged('oliveA', leafMat('#4a5e3e', { rough: 0.65 }), leaves(1)), merged('oliveB', leafMat('#6f8360', { rough: 0.65 }), leaves(2)));
  const rnd = seeded(5);
  g.add(merged('olives', mat('#2b2433', { rough: 0.3, clearcoat: 0.6 }), () => Array.from({ length: 10 }, () => { const c = clusters[Math.floor(rnd() * clusters.length)]; return new THREE.SphereGeometry(0.009, 8, 6).scale(1, 1.3, 1).translate(c[0] + (rnd() - 0.5) * 0.2, c[1] - 0.05 + (rnd() - 0.5) * 0.1, c[2] + (rnd() - 0.5) * 0.2); }), false));
  return g;
}
function moneyTree() {
  const g = pot({ style: 'belly', color: '#2f3e4a', r: 0.1, h: 0.14 });
  const bark = barkMat('#8a6a48');
  g.add(merged('moneyBraid', bark, () => [0, 1, 2].map((k) => tubeGeo(Array.from({ length: 9 }, (_, i) => { const a = k * PI * 2 / 3 + i * 0.9; return [Math.cos(a) * 0.012, 0.12 + i * 0.05, Math.sin(a) * 0.012]; }), 0.009, 32, 5)), false));
  const L = leafGeo('moneyLeaflet', { len: 0.1, wid: 0.038, fold: 0.15, droop: 0.25, shape: 'ovate' });
  const rnd = seeded(14); const pets = [], lv = [];
  for (let k = 0; k < 8; k++) {
    const yaw = k * 2.4, pitch = 0.3 + rnd() * 0.6, h = 0.15 + rnd() * 0.12;
    const d = dirOf(yaw, pitch, h); const top = [d[0], 0.52 + d[1], d[2]];
    pets.push(tubeGeo([[0, 0.52, 0], [top[0] * 0.5, 0.52 + d[1] * 0.6, top[2] * 0.5], top], 0.003, 8, 4));
    for (let j = 0; j < 5; j++) lv.push(xf(L, { p: top, yaw: yaw + (j - 2) * 0.55, pitch: 1.3 + Math.abs(j - 2) * 0.1, s: 0.9 - Math.abs(j - 2) * 0.12 }));
  }
  g.add(merged('moneyPetioles', stemMat('#4f7a3a'), () => pets, false), merged('moneyLeaves', glossy('#3f7a2a'), () => lv));
  return g;
}
function rubberTree() {
  const g = pot({ style: 'cylinder', color: '#1f1f22', r: 0.15, h: 0.28 });
  g.add(meshOf(tubeGeo([[0, 0.25, 0], [0.01, 0.6, 0], [-0.01, 0.95, 0.01], [0, 1.18, 0]], 0.014, 16, 6), barkMat('#5a4a3a')));
  const L = leafGeo('rubber', { len: 0.27, wid: 0.135, fold: 0.1, droop: 0.25, shape: 'ovate' });
  const rnd = seeded(31);
  g.add(merged('rubberLeaves', glossy('#2a3424'), () => Array.from({ length: 15 }, (_, i) => { const t = i / 15; return xf(L, { p: [0, 0.45 + t * 0.72, 0], yaw: i * 2.4, pitch: 1.3 - t * 0.7 + rnd() * 0.1, s: 0.8 + (1 - t) * 0.3 }); })));
  const sheath = leafify(cone(0.012, 0.08, mat('#b23a3a', { rough: 0.4 }), 8)); g.add(at(sheath, 0, 1.22, 0));
  return g;
}
function calatheaTex() {
  return labelTexture('pl:calathea', 64, 128, (ctx, W, H) => {
    ctx.fillStyle = '#a6c98c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2f5a32';
    for (let i = 0; i < 7; i++) { const y = H * (0.12 + i * 0.12); for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W / 2 + s * W * 0.2, y, W * 0.14 * (1 - i * 0.07), H * 0.035, s * 0.5, 0, 7); ctx.fill(); } }
    ctx.fillRect(W / 2 - 1.5, 0, 3, H);
    ctx.strokeStyle = '#2f5a32'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, W, H);
  });
}
function calathea() {
  const g = pot({ style: 'cylinder', color: '#efe9df', r: 0.1, h: 0.15 });
  g.add(at(rot(torus(0.1, 0.005, mat('#2b2b2b'), 4, 32), PI / 2, 0, 0), 0, 0.075, 0));
  const L = leafGeo('calathea', { len: 0.17, wid: 0.075, fold: 0.15, droop: 0.12, shape: 'ovate' });
  const rnd = seeded(41); const pets = [], lv = [];
  for (let k = 0; k < 12; k++) { const yaw = k * 2.4, pitch = 0.2 + rnd() * 0.45, h = 0.12 + rnd() * 0.14; const d = dirOf(yaw, pitch, h); const top = [d[0], 0.13 + d[1], d[2]]; pets.push(tubeGeo([[0, 0.13, 0], top], 0.0028, 4, 4)); lv.push(xf(L, { p: top, yaw, pitch: pitch + 0.45, s: 0.85 + rnd() * 0.25 })); }
  g.add(merged('calPetioles', stemMat('#7a4a5a'), () => pets, false), merged('calLeaves', leafMat('#ffffff', { map: calatheaTex(), rough: 0.45 }), () => lv));
  return g;
}
function pilea() {
  const g = pot({ style: 'bowl', color: '#f3efe8', r: 0.085, h: 0.08 });
  g.add(meshOf(tubeGeo([[0, 0.06, 0], [0.005, 0.14, 0], [0, 0.2, 0.004]], 0.006, 8, 5), stemMat('#6b8a4a')));
  const L = leafGeo('pileaCoin', { len: 0.055, wid: 0.055, fold: -0.08, droop: 0, shape: 'round', center: true, segs: 8 });
  const rnd = seeded(51); const pets = [], lv = [];
  for (let k = 0; k < 16; k++) {
    const by = 0.08 + (k / 16) * 0.12, yaw = k * 2.4, pitch = 0.5 + (1 - k / 16) * 0.8, len = 0.06 + rnd() * 0.05;
    const d = dirOf(yaw, pitch, len); const top = [d[0], by + d[1], d[2]];
    pets.push(tubeGeo([[0, by, 0], [d[0] * 0.5, by + d[1] * 0.7, d[2] * 0.5], top], 0.0018, 6, 3));
    const off = dirOf(yaw, pitch + 0.3, 0.028); lv.push(xf(L, { p: [top[0] + off[0], top[1] + off[1], top[2] + off[2]], yaw, pitch: pitch + 0.3, s: 0.75 + (1 - k / 16) * 0.35 }));
  }
  g.add(merged('pileaPetioles', stemMat('#7aa04a'), () => pets, false), merged('pileaLeaves', glossy('#4f8a2f'), () => lv));
  return g;
}
function aloe() {
  const g = pot({ r: 0.08, h: 0.1 });
  const L = leafGeo('aloe', { len: 0.2, wid: 0.04, fold: 0.6, droop: 0.12, shape: 'lance', segs: 7 });
  g.add(merged('aloeLeaves', leafMat('#7fa37a', { rough: 0.55 }), () => Array.from({ length: 12 }, (_, i) => xf(L, { p: [0, 0.085, 0], yaw: i * 2.4, pitch: 0.15 + (i / 12) * 0.85, s: 1 - (i / 12) * 0.3 }))));
  return g;
}
function lemonTree() {
  const g = group(at(rbox(0.38, 0.38, 0.38, 0.02, mat('#f4f2ee', { rough: 0.5 })), 0, 0.19, 0), at(box(0.34, 0.01, 0.34, SOIL()), 0, 0.37, 0));
  g.add(meshOf(tubeGeo([[0, 0.36, 0], [0.01, 0.7, 0], [-0.01, 0.95, 0.01]], 0.02, 12, 6), barkMat('#7a6a5a')));
  const L = leafGeo('lemonLeaf', { len: 0.08, wid: 0.035, fold: 0.15, droop: 0.15 });
  const leaves = (seed) => () => { const rnd = seeded(seed); return Array.from({ length: 110 }, () => { const a = rnd() * PI * 2, e = Math.acos(rnd() * 2 - 1), r = 0.24 + rnd() * 0.08; return xf(L, { p: [Math.cos(a) * Math.sin(e) * r, 1.15 + Math.cos(e) * r * 0.85, Math.sin(a) * Math.sin(e) * r], yaw: a + PI / 2, pitch: 0.6 + rnd() * 1.4, s: 0.8 + rnd() * 0.4 }); }); };
  g.add(merged('lemonA', glossy('#2f6a2a'), leaves(3)), merged('lemonB', glossy('#3f7f30'), leaves(4)));
  const rnd = seeded(8);
  g.add(merged('lemons', mat('#f6d32d', { rough: 0.4, clearcoat: 0.4 }), () => Array.from({ length: 9 }, () => { const a = rnd() * PI * 2, e = 0.8 + rnd() * 1.4; return new THREE.SphereGeometry(0.03, 12, 10).scale(1, 1.25, 1).translate(Math.cos(a) * Math.sin(e) * 0.3, 1.15 + Math.cos(e) * 0.26, Math.sin(a) * Math.sin(e) * 0.3); }), false));
  return g;
}
function herbGarden() {
  const g = group(at(rbox(0.46, 0.09, 0.16, 0.008, MAT.wood('#b48a5a')), 0, 0.045, 0));
  const lbl = (name) => decal(0.04, 0.016, 'pl:herb:' + name, (ctx, W, H) => { ctx.fillStyle = '#f4ecd8'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#3b2a1e'; ctx.font = `700 ${H * 0.6}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, W / 2, H / 2 + 1); }, { tw: 128, th: 52 });
  g.add(at(lbl('BASIL'), -0.14, 0.045, 0.081), at(lbl('MINT'), 0, 0.045, 0.081), at(lbl('ROSEMARY'), 0.14, 0.045, 0.081));
  for (const x of [-0.14, 0, 0.14]) { const p = pot({ r: 0.06, h: 0.09 }); p.position.set(x, 0.07, 0); g.add(p); }
  const rnd = seeded(61);
  const B = leafGeo('basil', { len: 0.045, wid: 0.032, fold: 0.5, droop: 0.15 });
  g.add(merged('basil', leafMat('#5fa83a', { rough: 0.45 }), () => Array.from({ length: 30 }, (_, i) => xf(B, { p: [-0.14 + (rnd() - 0.5) * 0.05, 0.15 + rnd() * 0.08, (rnd() - 0.5) * 0.05], yaw: rnd() * PI * 2, pitch: 0.7 + rnd() * 0.8, s: 0.8 + rnd() * 0.4 }))));
  const Mi = leafGeo('mint', { len: 0.035, wid: 0.022, fold: 0.3, droop: 0.1 });
  g.add(merged('mint', leafMat('#3f7a3a', { rough: 0.6 }), () => Array.from({ length: 38 }, () => xf(Mi, { p: [(rnd() - 0.5) * 0.08, 0.15 + rnd() * 0.06, (rnd() - 0.5) * 0.07], yaw: rnd() * PI * 2, pitch: 0.9 + rnd() * 0.7, s: 0.8 + rnd() * 0.4 }))));
  const R = leafGeo('rosemary', { len: 0.018, wid: 0.004, fold: 0, droop: 0.1, shape: 'needle', segs: 2 });
  g.add(merged('rosemary', leafMat('#4a6b4a', { rough: 0.7 }), () => { const out = []; for (let s = 0; s < 7; s++) { const bx = 0.14 + (rnd() - 0.5) * 0.06, bz = (rnd() - 0.5) * 0.05, h = 0.1 + rnd() * 0.06, lean = (rnd() - 0.5) * 0.3; out.push(tubeGeo([[bx, 0.14, bz], [bx + lean * 0.05, 0.14 + h, bz]], 0.002, 3, 3)); for (let k = 0; k < 14; k++) out.push(xf(R, { p: [bx + lean * 0.05 * k / 14, 0.15 + k / 14 * h, bz], yaw: k * 2.1, pitch: 0.9, s: 1 })); } return out; }));
  return g;
}

// ---------------------------------------------------------------- cut flowers & seasonal
function glassVase(r = 0.06, h = 0.2, tint = '#e6f2ef') {
  return group(
    lathe([[r * 0.8, 0], [r, h * 0.1], [r * 0.85, h * 0.7], [r * 0.7, h], [r * 0.75, h]], mat(tint, { rough: 0.04, opacity: 0.3, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 32),
    at(cyl(r * 0.8, r * 0.8, 0.008, mat(tint, { rough: 0.04, opacity: 0.5, transparent: true }), 24), 0, 0.004, 0),
    at(lathe([[0.001, 0.008], [r * 0.82, 0.008], [r * 0.96, h * 0.1], [r * 0.88, h * 0.55], [0.001, h * 0.55]], mat('#cfe8ea', { rough: 0.05, opacity: 0.35, transparent: true, depthWrite: false }), 24), 0, 0, 0),
  );
}
function tulips() {
  const g = glassVase(0.055, 0.2);
  const rnd = seeded(71); const heads = [];
  const stems = Array.from({ length: 9 }, (_, i) => { const yaw = i * 2.4, pitch = 0.1 + rnd() * 0.35, len = 0.22 + rnd() * 0.1; const d = dirOf(yaw, pitch, len); const top = [d[0], 0.15 + d[1], d[2]]; heads.push([top, i % 3]); return tubeGeo([[0, 0.02, 0], [d[0] * 0.3, 0.15, d[2] * 0.3], top], 0.0032, 10, 4); });
  g.add(merged('tulipStems', stemMat('#5f8a3a'), () => stems, false));
  const L = leafGeo('tulipLeaf', { len: 0.16, wid: 0.035, fold: 0.4, droop: 0.4, shape: 'lance' });
  g.add(merged('tulipLeaves', leafMat('#6f9a5a'), () => [0.5, 2.6, 4.4].map((yaw) => xf(L, { p: [0, 0.17, 0], yaw, pitch: 0.4 }))));
  const cup = (c) => lathe([[0.001, 0], [0.012, 0.004], [0.019, 0.02], [0.018, 0.038], [0.012, 0.05], [0.001, 0.046]], leafMat(c, { rough: 0.4, side: THREE.FrontSide }), 6);
  const cols = ['#e8476a', '#f6c445', '#f08aa8'];
  heads.forEach(([p, c]) => { const h = leafify(cup(cols[c])); h.rotation.y = c; g.add(at(h, p[0], p[1] - 0.004, p[2])); });
  return g;
}
function petalRing(key, n, len, wid, color, cup = 0.2) {
  return sharedGeo('ring:' + key, () => { const P = leafGeo('ringPetal:' + key, { len, wid, fold: 0.2, droop: cup, shape: 'lance', segs: 4 }); return mergeGeometries(Array.from({ length: n }, (_, k) => xf(P, { rz: k / n * PI * 2 }))); });
}
function sunflowers() {
  const jug = mat('#3f6a8a', { rough: 0.3, clearcoat: 0.6 });
  const g = group(lathe([[0.001, 0], [0.06, 0], [0.075, 0.06], [0.07, 0.14], [0.05, 0.19], [0.055, 0.21], [0.045, 0.21], [0.001, 0.05]], jug, 32), at(rot(torus(0.04, 0.008, jug, 6, 16, PI), 0, 0, -PI / 2), 0.07, 0.13, 0));
  const heads = [[-0.08, 0.46, 0.05, 0.3], [0.07, 0.5, 0.02, -0.2], [0.0, 0.56, -0.04, 0.0], [-0.03, 0.4, 0.09, 0.15], [0.1, 0.4, 0.07, -0.4]];
  g.add(merged('sunStems', stemMat('#5a7a2a'), () => heads.map(([x, y, z]) => tubeGeo([[0, 0.15, 0], [x * 0.4, y * 0.7, z * 0.4], [x, y, z - 0.01]], 0.005, 10, 5)), false));
  const L = leafGeo('sunLeaf', { len: 0.1, wid: 0.07, fold: 0.2, droop: 0.4, shape: 'heart' });
  g.add(merged('sunLeaves', leafMat('#4f7a2a'), () => [[0.03, 0.28, 0.02, 0.6], [-0.04, 0.32, -0.01, 3.4], [0.01, 0.36, -0.03, 2.0]].map(([x, y, z, yaw]) => xf(L, { p: [x, y, z], yaw, pitch: 1.2 }))));
  const ring = petalRing('sun', 22, 0.065, 0.022, '#f6c12d', -0.1);
  heads.forEach(([x, y, z, tilt]) => {
    const head = new THREE.Group(); head.position.set(x, y, z); head.rotation.set(-0.35, tilt, 0);
    head.add(leafify(meshOf(ring, leafMat('#f6b81d', { rough: 0.5 }))));
    const c = leafify(cyl(0.024, 0.026, 0.014, mat('#4a2e14', { rough: 0.9 }), 20)); c.rotation.x = PI / 2; head.add(at(c, 0, 0, 0.004));
    g.add(head);
  });
  return g;
}
function poinsettia() {
  const foil = mat('#c9a35c', { rough: 0.25, metal: 1 });
  const g = pot({ style: 'taper', color: '#b8282a', r: 0.085, h: 0.12 });
  g.add(lathe([[0.07, 0.0], [0.1, 0.08], [0.115, 0.13], [0.105, 0.13], [0.09, 0.08]], foil, 12));
  const G = leafGeo('poinGreen', { len: 0.09, wid: 0.05, fold: 0.2, droop: 0.3 });
  g.add(merged('poinGreen', leafMat('#2f5a2a'), () => Array.from({ length: 10 }, (_, i) => xf(G, { p: [0, 0.13, 0], yaw: i * 0.63, pitch: 1.25, s: 1 }))));
  const R = leafGeo('poinRed', { len: 0.075, wid: 0.032, fold: 0.15, droop: 0.15, shape: 'lance' });
  const tops = [[0, 0.22, 0], [0.07, 0.19, 0.03], [-0.06, 0.19, -0.03], [0.0, 0.18, 0.08], [-0.02, 0.19, -0.08]];
  g.add(merged('poinRed', leafMat('#c8102e', { rough: 0.45 }), () => tops.flatMap(([x, y, z], j) => Array.from({ length: 7 }, (_, k) => xf(R, { p: [x, y, z], yaw: k / 7 * PI * 2 + j, pitch: 1.2, s: j ? 0.85 : 1 })))));
  g.add(merged('poinCenters', mat('#e8c53a', { rough: 0.6 }), () => tops.map(([x, y, z]) => new THREE.SphereGeometry(0.008, 8, 6).translate(x, y + 0.006, z)), false));
  return g;
}
function peonies() {
  const g = group(lathe([[0.001, 0], [0.055, 0], [0.07, 0.06], [0.06, 0.16], [0.045, 0.2], [0.06, 0.22], [0.05, 0.22], [0.001, 0.06]], MAT.ceramic('#f6f3ee'), 32));
  g.add(at(rot(torus(0.035, 0.007, MAT.ceramic('#f6f3ee'), 6, 16, PI), 0, 0, -PI / 2), 0.06, 0.13, 0));
  const heads = [[-0.06, 0.34, 0.03], [0.06, 0.36, -0.01], [0.0, 0.4, -0.05], [0.02, 0.31, 0.08], [-0.08, 0.3, -0.06]];
  g.add(merged('peonyStems', stemMat('#4f7a3a'), () => heads.map(([x, y, z]) => tubeGeo([[0, 0.15, 0], [x * 0.5, y * 0.75, z * 0.5], [x, y, z]], 0.0035, 8, 4)), false));
  const L = leafGeo('peonyLeaf', { len: 0.08, wid: 0.03, fold: 0.2, droop: 0.4, shape: 'lance' });
  g.add(merged('peonyLeaves', leafMat('#3f6b3a'), () => Array.from({ length: 9 }, (_, i) => xf(L, { p: [Math.sin(i) * 0.03, 0.24, Math.cos(i) * 0.03], yaw: i * 0.7, pitch: 1.1 }))));
  const P = leafGeo('peonyPetal', { len: 0.035, wid: 0.035, fold: 0.6, droop: -0.4, shape: 'round', segs: 5 });
  const bloom = sharedGeo('peonyBloom', () => mergeGeometries([...Array.from({ length: 10 }, (_, k) => xf(P, { yaw: k / 10 * PI * 2, pitch: 1.35 })), ...Array.from({ length: 8 }, (_, k) => xf(P, { yaw: k / 8 * PI * 2 + 0.4, pitch: 0.85, s: 0.9 })), ...Array.from({ length: 6 }, (_, k) => xf(P, { yaw: k / 6 * PI * 2 + 0.2, pitch: 0.4, s: 0.7 })), new THREE.SphereGeometry(0.022, 12, 8).scale(1, 0.8, 1).translate(0, 0.014, 0)]));
  const cols = ['#f4a7b9', '#f7c6d0', '#e87a9a', '#f4a7b9', '#fbe3e8'];
  heads.forEach(([x, y, z], i) => { const b = leafify(meshOf(bloom, leafMat(cols[i], { rough: 0.6 }))); b.rotation.set(-0.3, i, 0.1); b.scale.setScalar(1.35); g.add(at(b, x, y, z)); });
  return g;
}

// ---------------------------------------------------------------- hanging / wall planters (origin at wall, z = 0)
function pearlStrands(key, n, top, rimR, cz) {
  return sharedGeo(key, () => {
    const rnd = seeded(key.length * 7); const out = [];
    for (let s = 0; s < n; s++) {
      const a = (s / n) * PI * 2 + rnd() * 0.3, L = 0.25 + rnd() * 0.35;
      const sx = Math.cos(a) * rimR, sz = Math.sin(a) * rimR;
      const curve = new THREE.CatmullRomCurve3([V([sx * 0.4, top + 0.01, cz + sz * 0.4]), V([sx * 1.05, top + 0.02, cz + sz * 1.05]), V([sx * 1.25, top - 0.06, cz + sz * 1.25]), V([sx * 1.35 + (rnd() - 0.5) * 0.03, top - L * 0.6, cz + sz * 1.3]), V([sx * 1.4, top - L, cz + sz * 1.3])]);
      for (let k = 0; k < 30; k++) { const p = curve.getPoint(k / 30); out.push(new THREE.SphereGeometry(0.0065, 6, 4).translate(p.x, p.y, p.z)); }
    }
    return mergeGeometries(out);
  });
}
function wallHook(g, z = 0.18) {
  const m = mat('#1d1d1f', { rough: 0.35, metal: 0.7 });
  g.add(at(rbox(0.05, 0.08, 0.012, 0.004, m), 0, 0.26, 0.006));
  g.add(meshOf(sharedGeo('hookArm:' + z, () => tubeGeo([[0, 0.25, 0.01], [0, 0.27, z * 0.5], [0, 0.26, z], [0, 0.23, z + 0.01]], 0.005, 12, 5)), m));
}
function hangingPearls() {
  const g = new THREE.Group(); const z = 0.17;
  wallHook(g, z);
  g.add(meshOf(sharedGeo('pearlChains', () => mergeGeometries([0, 1, 2].map((k) => { const a = k * PI * 2 / 3; return tubeGeo([[0, 0.23, z], [Math.cos(a) * 0.08, 0.05, z + Math.sin(a) * 0.08]], 0.0015, 4, 3); }))), mat('#c9a35c', { rough: 0.3, metal: 1 })));
  g.add(at(lathe([[0.001, -0.05], [0.04, -0.05], [0.075, -0.02], [0.085, 0.03], [0.08, 0.05], [0.07, 0.05], [0.072, 0.02], [0.001, 0.0]], MAT.ceramic('#e9e4dc'), 32), 0, 0, z));
  g.add(at(cyl(0.072, 0.072, 0.01, SOIL(), 20), 0, 0.04, z));
  const pearls = leafify(meshOf(pearlStrands('pearls', 14, 0.045, 0.06, z), leafMat('#7fa86a', { rough: 0.4 })));
  g.add(pearls);
  return g;
}
function trailingWallPlanter() {
  const g = new THREE.Group();
  const potGeo = sharedGeo('halfPot', () => { const gg = new THREE.CylinderGeometry(0.11, 0.08, 0.14, 24, 1, false, -PI / 2, PI); gg.translate(0, 0, 0); return gg; });
  g.add(meshOf(potGeo, MAT.ceramic('#f2d7c4')), at(box(0.22, 0.14, 0.006, MAT.ceramic('#f2d7c4')), 0, 0, 0.003));
  const soilTop = meshOf(sharedGeo('halfSoil', () => new THREE.CircleGeometry(0.1, 20, PI, PI).rotateX(-PI / 2)), SOIL()); soilTop.position.y = 0.06; g.add(soilTop);
  const L = leafGeo('heartleaf', { len: 0.05, wid: 0.045, fold: 0.15, droop: 0.15, shape: 'heart' });
  const vines = [[-0.12, -0.45, 0.06], [-0.05, -0.6, 0.09], [0.04, -0.52, 0.1], [0.12, -0.38, 0.06], [0.2, -0.25, 0.04], [-0.2, -0.22, 0.04]];
  const rnd = seeded(77); const st = [], lv = [];
  for (const [ex, ey, ez] of vines) {
    const curve = new THREE.CatmullRomCurve3([V([0, 0.06, 0.05]), V([ex * 0.6, 0.07, 0.11]), V([ex, 0.0, ez + 0.05]), V([ex * 1.05, ey * 0.6, ez]), V([ex * 1.1, ey, ez])]);
    st.push(new THREE.TubeGeometry(curve, 24, 0.002, 3));
    for (let k = 0; k < 10; k++) { const p = curve.getPoint(0.1 + k * 0.09); lv.push(xf(L, { p: [p.x, p.y, p.z], yaw: (k % 2 ? 0.6 : -0.6), pitch: 2.4 + rnd() * 0.5, s: 0.8 + rnd() * 0.4 })); }
  }
  for (let k = 0; k < 8; k++) lv.push(xf(L, { p: [(rnd() - 0.5) * 0.14, 0.06, 0.03 + rnd() * 0.06], yaw: rnd() * PI * 2, pitch: 0.6 + rnd() * 0.5, s: 1.1 }));
  g.add(merged('vineStems', stemMat('#6b8a3a'), () => st, false), merged('heartLeaves', glossy('#3f8a2a'), () => lv));
  return g;
}
function fernFrondGeo() {
  return sharedGeo('frond', () => {
    const P = leafGeo('fernPinna', { len: 0.03, wid: 0.008, fold: 0, droop: 0, shape: 'lance', segs: 3 });
    const out = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V([0, 0, 0]), V([0, 0.12, 0.08]), V([0, 0.12, 0.25]), V([0, -0.02, 0.36])]), 16, 0.0018, 3)];
    const curve = new THREE.CatmullRomCurve3([V([0, 0, 0]), V([0, 0.12, 0.08]), V([0, 0.12, 0.25]), V([0, -0.02, 0.36])]);
    for (let k = 1; k < 24; k++) { const t = k / 24; const p = curve.getPoint(t); for (const s of [-1, 1]) out.push(xf(P, { p: [p.x, p.y, p.z], rz: -s * 1.35, s: 1.1 - t * 0.7 })); }
    return mergeGeometries(out);
  });
}
function macrameFern() {
  const g = new THREE.Group(); const z = 0.2;
  wallHook(g, z);
  const cord = mat('#efe6d6', { rough: 1 });
  g.add(at(rot(torus(0.018, 0.004, MAT.wood('#b48a5a'), 6, 16), 0, PI / 2, 0), 0, 0.215, z));
  g.add(meshOf(sharedGeo('hangerCords', () => mergeGeometries([0, 1, 2, 3].map((k) => { const a = k * PI / 2 + PI / 4; return tubeGeo([[0, 0.2, z], [Math.cos(a) * 0.05, 0.08, z + Math.sin(a) * 0.05], [Math.cos(a) * 0.09, -0.06, z + Math.sin(a) * 0.09], [Math.cos(a) * 0.05, -0.16, z + Math.sin(a) * 0.05], [0, -0.19, z]], 0.003, 16, 4); }))), cord));
  g.add(meshOf(sharedGeo('hangerTassel', () => mergeGeometries(Array.from({ length: 10 }, (_, i) => new THREE.CylinderGeometry(0.0025, 0.0025, 0.12, 3).translate(Math.cos(i) * 0.008, -0.25, z + Math.sin(i) * 0.008)))), cord));
  g.add(at(lathe([[0.001, -0.15], [0.05, -0.15], [0.085, -0.1], [0.09, -0.05], [0.08, -0.05], [0.001, -0.06]], MAT.ceramic('#ffffff'), 28), 0, 0, z));
  const fr = fernFrondGeo();
  g.add(merged('fernFronds', leafMat('#4f8a2a', { rough: 0.6 }), () => Array.from({ length: 16 }, (_, i) => xf(fr, { p: [0, -0.06, z], yaw: (i / 15 - 0.5) * PI * 1.24, pitch: (i % 3) * 0.12 - 0.1, s: 0.8 + (i % 4) * 0.07 * (1 - Math.abs(i / 15 - 0.5)) }))));
  return g;
}

// ---------------------------------------------------------------- glass & air
function terrarium() {
  const g = new THREE.Group();
  const brass = mat('#c9a35c', { rough: 0.3, metal: 1 });
  const R = 0.12, Hh = 0.16, roof = 0.1;
  g.add(at(cyl(R, R, 0.012, brass, 6), 0, 0.006, 0));
  g.add(at(cyl(R * 0.97, R * 0.97, 0.03, mat('#d9c49a', { rough: 1 }), 6), 0, 0.027, 0));
  g.add(at(cyl(R * 0.95, R * 0.95, 0.012, mat('#8a7a6a', { rough: 0.9 }), 6), 0, 0.046, 0));
  g.add(at(cyl(R, R, Hh, MAT.glass('#e6f4f2', 0.16), 6, undefined, true), 0, 0.012 + Hh / 2, 0));
  g.add(at(cone(R, roof, MAT.glass('#e6f4f2', 0.16), 6), 0, 0.012 + Hh + roof / 2, 0));
  g.add(meshOf(sharedGeo('terrFrame', () => { const out = []; for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2, b = (i + 1) / 6 * PI * 2; const p0 = [Math.sin(a) * R, 0.012, Math.cos(a) * R]; const pt = [Math.sin(a) * R, 0.012 + Hh, Math.cos(a) * R]; const pb = [Math.sin(b) * R, 0.012 + Hh, Math.cos(b) * R]; out.push(tubeGeo([p0, pt], 0.003, 1, 4), tubeGeo([pt, pb], 0.003, 1, 4), tubeGeo([pt, [0, 0.012 + Hh + roof, 0]], 0.003, 1, 4)); } return mergeGeometries(out); }), brass));
  const moss = leafify(sph(0.06, mat('#4f8a2f', { rough: 1 }), 14, 10)); moss.scale.set(1.3, 0.35, 1.1); g.add(at(moss, -0.03, 0.055, 0.02));
  const ros = leafify(meshOf(rosetteGeo('ech'), leafMat('#8fb3a6', { rough: 0.6 }))); ros.scale.setScalar(0.65); g.add(at(ros, 0.045, 0.052, -0.02));
  const P = leafGeo('miniFern', { len: 0.07, wid: 0.02, fold: 0.1, droop: 0.4, shape: 'lance' });
  g.add(merged('terrFern', leafMat('#3f7a2a'), () => Array.from({ length: 7 }, (_, i) => xf(P, { p: [-0.04, 0.06, -0.03], yaw: i * 0.9, pitch: 0.4 + (i % 3) * 0.25 }))));
  g.add(at(sph(0.012, mat('#f4f1ea', { rough: 0.6 }), 8, 6), 0.02, 0.054, 0.06), at(sph(0.009, mat('#bdb7aa', { rough: 0.6 }), 8, 6), 0.05, 0.053, 0.04));
  return g;
}
function airPlants() {
  const g = group(meshOf(sharedGeo('driftwood', () => tubeGeo([[-0.16, 0.02, 0], [-0.06, 0.035, 0.02], [0.04, 0.025, -0.01], [0.15, 0.04, 0.01]], 0.018, 24, 7)), mat('#b9a58a', { rough: 0.95 })));
  g.add(meshOf(sharedGeo('driftwood2', () => tubeGeo([[-0.02, 0.03, 0], [0.04, 0.06, 0.03], [0.08, 0.08, 0.02]], 0.008, 8, 5)), mat('#b9a58a', { rough: 0.95 })));
  const L = leafGeo('tilland', { len: 0.085, wid: 0.01, fold: 0.2, droop: 0.6, shape: 'needle', segs: 6 });
  const tuft = sharedGeo('tuft', () => mergeGeometries(Array.from({ length: 16 }, (_, k) => xf(L, { yaw: k * 2.4, pitch: 0.3 + (k % 4) * 0.25, s: 0.8 + (k % 3) * 0.15 }))));
  [[-0.1, 0.045, 0.0, '#7f9f78'], [0.03, 0.04, -0.01, '#93ad84'], [0.1, 0.065, 0.02, '#6f9468']].forEach(([x, y, z, c]) => g.add(at(leafify(meshOf(tuft, leafMat(c, { rough: 0.7 }))), x, y, z)));
  const bloom = leafify(cone(0.006, 0.03, mat('#e8477a', { rough: 0.5 }), 6)); g.add(at(bloom, 0.03, 0.065, -0.01));
  return g;
}

// ---------------------------------------------------------------- care & pots
function plantMister() {
  return group(
    lathe([[0.001, 0], [0.032, 0], [0.034, 0.012], [0.034, 0.1], [0.026, 0.12], [0.012, 0.13], [0.012, 0.14], [0.001, 0.14]], mat('#c9853a', { rough: 0.05, opacity: 0.75, transparent: true }), 28),
    at(cyl(0.03, 0.03, 0.07, mat('#e8f3f1', { rough: 0.1, opacity: 0.4, transparent: true }), 24), 0, 0.045, 0),
    at(cyl(0.013, 0.013, 0.02, mat('#c9a35c', { rough: 0.25, metal: 1 }), 16), 0, 0.15, 0),
    at(rbox(0.02, 0.05, 0.03, 0.006, mat('#c9a35c', { rough: 0.25, metal: 1 })), 0, 0.185, 0),
    at(rot(cyl(0.005, 0.004, 0.035, mat('#c9a35c', { rough: 0.25, metal: 1 }), 10), PI / 2, 0, 0), 0, 0.2, 0.03),
    at(rot(rbox(0.012, 0.03, 0.008, 0.003, mat('#c9a35c', { rough: 0.25, metal: 1 })), 0.4, 0, 0), 0, 0.175, 0.022),
  );
}
function potTrio() {
  const tm = mat('#c46a45', { rough: 0.9 });
  const g = new THREE.Group();
  [[-0.12, 0.055, 0.065], [0.0, 0.075, 0.09], [0.14, 0.06, 0.075]].forEach(([x, r, h]) => {
    g.add(at(lathe(POT_PROFILES.terracotta(r, h).slice(0, 6).concat([[r * 0.9, h * 0.1], [0.001, h * 0.1]]), tm, 28), x, 0.01, 0));
    g.add(at(cyl(r * 0.95, r * 0.9, 0.012, tm, 28), x, 0.006, 0));
  });
  return g;
}
function facePlanter() {
  const g = group(lathe([[0.001, 0], [0.05, 0], [0.075, 0.04], [0.08, 0.1], [0.072, 0.14], [0.066, 0.14], [0.07, 0.1], [0.001, 0.02]], MAT.ceramic('#f6f3ee'), 36));
  const face = decal(0.09, 0.07, 'pl:face', (ctx, W, H) => { ctx.clearRect(0, 0, W, H); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(W / 2 + s * W * 0.2, H * 0.32, W * 0.09, 0.15 * PI, 0.85 * PI); ctx.stroke(); for (let k = 0; k < 3; k++) { ctx.beginPath(); const a = 0.35 * PI + k * 0.15 * PI; ctx.moveTo(W / 2 + s * W * 0.2 + Math.cos(a) * W * 0.09, H * 0.32 + Math.sin(a) * W * 0.09); ctx.lineTo(W / 2 + s * W * 0.2 + Math.cos(a) * W * 0.13, H * 0.32 + Math.sin(a) * W * 0.13); ctx.stroke(); } } ctx.beginPath(); ctx.moveTo(W / 2, H * 0.4); ctx.quadraticCurveTo(W / 2 + W * 0.05, H * 0.58, W / 2 - W * 0.02, H * 0.6); ctx.stroke(); ctx.fillStyle = '#d96a6a'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.8, W * 0.07, H * 0.05, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(240,140,140,0.45)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(W / 2 + s * W * 0.32, H * 0.6, W * 0.07, 0, 7); ctx.fill(); } }, { tw: 192, th: 150 });
  g.add(at(face, 0, 0.085, 0.0802));
  return g;
}

// ------------------------------------------------------------------ definitions
const P = (o) => ({ category: 'plants', emoji: '🪴', ...o, use: { type: 'plant', thirst: o.thirst } });
const BIG = (o) => P({ furniture: true, place: 'floor', ...o });

defineItems([
  // ---------------------------------------------------------- floor plants & trees
  BIG({ id: 'plant_fiddle_leaf', name: 'Fiddle Leaf Fig', price: 89, stores: ['greenhouse', 'nestly'], rarity: 'uncommon', thirst: 0.9, emoji: '🌳', desc: 'Big violin-shaped leaves in a woven basket. Dramatic, photogenic, a little needy.', build: fiddleLeaf }),
  BIG({ id: 'plant_bird_of_paradise', name: 'Bird of Paradise', price: 129, stores: ['greenhouse', 'nestly'], rarity: 'uncommon', thirst: 0.9, emoji: '🌿', desc: 'Giant paddle leaves that fan out like a tropical resort lobby.', build: birdOfParadise }),
  BIG({ id: 'plant_olive_tree', name: 'Potted Olive Tree', price: 149, stores: ['greenhouse', 'nestly', 'luxe'], rarity: 'uncommon', thirst: 0.7, emoji: '🫒', desc: 'Silvery-green leaves and a few real olives. Mediterranean calm in terracotta.', build: oliveTree }),
  BIG({ id: 'plant_rubber_tree', name: 'Burgundy Rubber Tree', price: 69, stores: ['greenhouse', 'primo'], thirst: 0.7, emoji: '🌱', desc: 'Glossy, almost-black leaves on a single stem. Tough, tall and handsome.', build: rubberTree }),
  BIG({ id: 'plant_lemon_tree', name: 'Meyer Lemon Tree', price: 179, stores: ['greenhouse', 'luxe'], rarity: 'rare', thirst: 1.0, emoji: '🍋', desc: 'A little indoor citrus tree, heavy with fragrant lemons. Smells like sunshine.', build: lemonTree }),

  // ---------------------------------------------------------- tabletop houseplants
  P({ id: 'plant_zz', name: 'ZZ Plant', price: 35, stores: ['greenhouse', 'primo', 'nestly'], thirst: 0.35, desc: 'Waxy leaves on arching stems. Thrives on neglect — perfect for busy weeks.', build: zzPlant }),
  P({ id: 'plant_money_tree', name: 'Braided Money Tree', price: 45, stores: ['greenhouse', 'nestly'], thirst: 0.8, emoji: '🌳', desc: 'Three braided trunks and a canopy of five-fingered leaves. Prosperity sold separately.', build: moneyTree }),
  P({ id: 'plant_peace_lily', name: 'Peace Lily', price: 32, stores: ['greenhouse', 'primo'], thirst: 1.3, emoji: '🤍', desc: 'Dark glossy leaves and elegant white blooms. Droops dramatically when thirsty.', build: peaceLily }),
  P({ id: 'plant_orchid', name: 'White Phalaenopsis Orchid', price: 39, stores: ['greenhouse', 'nestly', 'primo'], thirst: 0.6, emoji: '🌸', desc: 'Arching spray of white moth orchids. Water sparingly, admire generously.', build: orchid }),
  P({ id: 'plant_calathea', name: 'Rattlesnake Calathea', price: 29, stores: ['greenhouse', 'nestly'], thirst: 1.2, emoji: '🌿', desc: 'Leaves painted with dark spots that fold up at night. Literally a prayer plant.', build: calathea }),
  P({ id: 'plant_pilea', name: 'Pilea "Coin Plant"', price: 22, stores: ['greenhouse', 'primo'], thirst: 0.9, emoji: '🪙', desc: 'Perfectly round leaves on little stalks. The friendliest plant on the shelf.', build: pilea }),
  P({ id: 'plant_aloe', name: 'Aloe Vera', price: 18, stores: ['greenhouse', 'primo', 'glow'], thirst: 0.3, emoji: '🌵', desc: 'Spiky, soothing, low-maintenance. A tiny first-aid kit with leaves.', build: aloe }),
  P({ id: 'plant_cactus_trio', name: 'Mini Cactus Trio', price: 29, stores: ['greenhouse', 'primo', 'nestly'], thirst: 0.25, emoji: '🌵', desc: 'A saguaro, a flowering barrel and a bunny-ear in matching terracotta.', build: cactusTrio }),
  P({ id: 'plant_succulent_bowl', name: 'Succulent Garden Bowl', price: 34, stores: ['greenhouse', 'nestly'], thirst: 0.3, emoji: '🪴', desc: 'Four plump echeverias nestled in pebbles in a concrete bowl.', build: succulentBowl }),
  P({ id: 'plant_bonsai', name: 'Juniper Bonsai', price: 69, stores: ['greenhouse', 'luxe', 'nestly'], rarity: 'uncommon', thirst: 1.0, emoji: '🌲', desc: 'A twisted little juniper in a glazed tray. Patience, in plant form.', build: bonsai }),
  P({ id: 'plant_terrarium', name: 'Geometric Terrarium', price: 49, stores: ['greenhouse', 'nestly', 'arthaus'], thirst: 0.3, emoji: '🫙', desc: 'A brass-framed glass hexagon holding a tiny mossy world.', build: terrarium }),
  P({ id: 'plant_air_trio', name: 'Air Plants on Driftwood', price: 19, stores: ['greenhouse', 'primo'], thirst: 0.3, emoji: '🌾', desc: 'Three soil-free tillandsias perched on driftwood. Mist them and they\'re happy.', build: airPlants }),
  P({ id: 'plant_herb_garden', name: 'Kitchen Herb Garden', price: 34, stores: ['greenhouse', 'freshcart', 'primo'], tags: ['kitchen'], thirst: 1.4, emoji: '🌿', desc: 'Basil, mint and rosemary in a wooden windowsill box. Snip, cook, repeat.', build: herbGarden }),

  // ---------------------------------------------------------- hanging & wall planters
  P({ id: 'plant_string_of_pearls', name: 'Hanging String of Pearls', place: 'wall', price: 42, stores: ['greenhouse', 'nestly'], thirst: 0.5, emoji: '🟢', desc: 'Beaded strands spilling from a hanging ceramic bowl on a wall hook.', build: hangingPearls }),
  P({ id: 'plant_wall_philodendron', name: 'Trailing Philodendron Wall Pot', place: 'wall', price: 38, stores: ['greenhouse', 'nestly', 'primo'], thirst: 1.0, emoji: '💚', desc: 'Heart-shaped leaves cascading from a blush half-moon wall planter.', build: trailingWallPlanter }),
  P({ id: 'plant_macrame_fern', name: 'Macramé Hanging Fern', place: 'wall', price: 45, stores: ['greenhouse', 'nestly'], thirst: 1.4, emoji: '🌿', desc: 'A lush Boston fern in a knotted cotton hanger. Peak 70s greenhouse.', build: macrameFern }),

  // ---------------------------------------------------------- bouquets & seasonal
  P({ id: 'bouquet_tulips', name: 'Spring Tulip Bouquet', price: 35, stores: ['greenhouse', 'freshcart', 'nestly'], season: 'spring', tags: ['glass'], thirst: 1.5, emoji: '🌷', desc: 'Pink, coral and butter-yellow tulips in a glass vase. Spring, delivered.', build: tulips }),
  P({ id: 'bouquet_sunflowers', name: 'Autumn Sunflowers', price: 32, stores: ['greenhouse', 'freshcart', 'nestly'], season: 'autumn', thirst: 1.5, emoji: '🌻', desc: 'Five big golden sunflowers in a blue enamel jug. Pure harvest cheer.', build: sunflowers }),
  P({ id: 'plant_poinsettia', name: 'Holiday Poinsettia', price: 29, stores: ['greenhouse', 'primo', 'nestly'], season: 'winter', thirst: 1.0, emoji: '🎄', desc: 'Scarlet bracts in a gold-foil wrap. Instantly festive.', build: poinsettia }),
  P({ id: 'bouquet_peonies', name: 'Peony Pitcher Bouquet', price: 49, stores: ['greenhouse', 'nestly', 'luxe'], rarity: 'uncommon', thirst: 1.5, emoji: '🌸', desc: 'Lush blush peonies in a white ceramic pitcher. Smells like a garden party.', build: peonies }),

  // ---------------------------------------------------------- care & pots
  { id: 'plant_mister', name: 'Amber Glass Plant Mister', category: 'plants', price: 14, stores: ['greenhouse', 'primo', 'nestly'], emoji: '💦', desc: 'A brass-topped mister for humidity-loving leaves. Works like a tiny watering can.', build: plantMister, use: { type: 'wateringcan' } },
  { id: 'pots_terracotta_trio', name: 'Terracotta Pot Trio', category: 'decor', price: 25, stores: ['greenhouse', 'primo'], emoji: '🏺', desc: 'Three classic clay pots with saucers, waiting for their plant era.', build: potTrio, use: { type: 'decor', lines: ['Three empty pots, full of potential.', 'Classic terracotta. Plants love breathing clay.'] } },
  { id: 'pot_face_planter', name: 'Sleepy Face Planter', category: 'decor', price: 32, stores: ['greenhouse', 'nestly', 'arthaus'], emoji: '😌', desc: 'A ceramic pot with a dreamy, blushing face. Plant optional, vibes mandatory.', build: facePlanter, use: { type: 'decor', lines: ['It looks so peaceful.', 'You whisper "goodnight" to it. Weird? Maybe.'] } },
]);

void rot; void tube; void box;
