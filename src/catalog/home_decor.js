// Catalogue: home decor — lighting, candles, scents, clocks, neon, aquariums,
// projectors, fans, robot vacuum, mirrors and decorative objects.
// Conventions: meters, origin bottom-center, front +Z (wall items: back-center at z=0).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, capsule, lathe, tube, extrude, at, rot, group, plane, disc, decal, FONT, fitText, labelTexture, woodGrain } from '../items/kit.js';
import { fabric, canvas, toTexture, cached, marble } from '../core/textures.js';
import { seeded } from '../core/utils.js';
import { bookSpines } from './core_furniture.js';

// ------------------------------------------------------------------ helpers
const GEO = new Map();
function sharedGeo(key, make) {
  let g = GEO.get('hd:' + key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set('hd:' + key, g); }
  return g;
}
function meshOf(geo, m, { cast = true, receive = true } = {}) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = receive; return o; }
function merged(key, m, make, o) { return meshOf(sharedGeo(key, () => mergeGeometries(make())), m, o); }
const named = (o, n) => { o.name = n; return o; };
const bulbify = (o) => { o.userData.bulb = true; return o; };
const brass = () => mat('#c9a35c', { rough: 0.25, metal: 1 });
const glow = (c, ei = 0) => mat(c, { emissive: c, ei, rough: 0.4 });
const texMat = (key, w, h, draw, o = {}) => mat('#ffffff', { map: labelTexture('hd:' + key, w, h, draw), rough: 0.5, ...o });
const PI = Math.PI;

// ------------------------------------------------------------------ lamps
function arcLamp() {
  const steel = MAT.metal('#d8dade', 0.18);
  const g = group(at(rbox(0.3, 0.1, 0.3, 0.01, mat('#ffffff', { map: marble({ base: '#f1eee9', vein: '#8d8780', seed: 12 }), rough: 0.2, clearcoat: 0.6 })), 0, 0.05, -0.58));
  g.add(tube([[0, 0.09, -0.58], [0, 1.15, -0.62], [0, 1.8, -0.35], [0, 2.0, 0.1], [0, 1.95, 0.45], [0, 1.82, 0.62]], 0.012, steel, 48, 8));
  const shade = lathe([[0.001, 0.19], [0.05, 0.185], [0.125, 0.14], [0.185, 0.055], [0.195, 0.0], [0.2, 0.0], [0.19, 0.06], [0.13, 0.15], [0.05, 0.195], [0.001, 0.2]], mat('#d8dade', { rough: 0.18, metal: 1 }), 40);
  g.add(at(shade, 0, 1.6, 0.62));
  g.add(at(bulbify(disc(0.18, glow('#fff2d8'))), 0, 1.605, 0.62).rotateX(PI / 2));
  g.add(at(bulbify(sph(0.05, glow('#fff6e0'), 14, 10)), 0, 1.66, 0.62));
  return g;
}
function mushroomLamp({ color = '#e9a23b' } = {}) {
  const gl = mat(color, { rough: 0.12, clearcoat: 1, emissive: color, ei: 0.15 });
  const g = group(lathe([[0.001, 0], [0.075, 0], [0.078, 0.01], [0.04, 0.03], [0.03, 0.12], [0.034, 0.2], [0.001, 0.2]], gl, 32));
  g.add(at(bulbify(lathe([[0.001, 0.01], [0.12, 0.004], [0.14, 0.0], [0.135, 0.03], [0.11, 0.075], [0.06, 0.11], [0.001, 0.12]], gl, 40)), 0, 0.19, 0));
  return g;
}
function deskLampSmart() {
  const wh = mat('#f3f3f1', { rough: 0.3, clearcoat: 0.5 });
  const g = group(at(cyl(0.075, 0.08, 0.02, wh, 32), 0, 0.01, 0), at(cyl(0.012, 0.012, 0.01, glow('#7ad3ff', 1.5), 12), 0.05, 0.022, 0.03));
  const a1 = cyl(0.01, 0.01, 0.3, wh, 10); a1.rotation.x = -0.35; g.add(at(a1, 0, 0.16, -0.05));
  g.add(at(sph(0.016, MAT.metal('#bbbbbb'), 10, 8), 0, 0.3, -0.1));
  const a2 = cyl(0.009, 0.009, 0.28, wh, 10); a2.rotation.x = 1.15; g.add(at(a2, 0, 0.36, 0.03));
  const head = group(rbox(0.16, 0.025, 0.06, 0.012, wh));
  head.add(at(bulbify(box(0.14, 0.003, 0.045, glow('#fff7ea'))), 0, -0.013, 0));
  head.rotation.x = 0.15; head.position.set(0, 0.405, 0.15); g.add(head);
  return g;
}
function lavaLamp({ liquid = '#7a3db8', base = '#c8ccd2' } = {}) {
  const metal = MAT.metal(base, 0.22);
  const g = group(
    lathe([[0.001, 0], [0.07, 0], [0.055, 0.14], [0.042, 0.15], [0.001, 0.15]], metal, 32),
    lathe([[0.001, 0.36], [0.022, 0.36], [0.035, 0.42], [0.001, 0.42]], metal, 24),
    lathe([[0.042, 0.148], [0.06, 0.25], [0.023, 0.36]], MAT.glass('#f0e8ff', 0.3), 32),
    at(lathe([[0.001, 0.15], [0.04, 0.15], [0.056, 0.25], [0.021, 0.358], [0.001, 0.358]], mat(liquid, { rough: 0.1, opacity: 0.55, transparent: true, depthWrite: false }), 32), 0, 0, 0),
  );
  const blobM = mat('#ff8a3d', { emissive: '#ff6a1a', ei: 0.4, rough: 0.3 });
  [[0, 0.19, 0.026, 0.03], [0.012, 0.26, 0.018, 0.04], [-0.01, 0.31, 0.013, 0.03], [0.004, 0.165, 0.035, 0.0]].forEach(([x, y, r, range], i) => {
    const b = bulbify(sph(r, blobM, 16, 12)); b.scale.y = i === 3 ? 0.5 : 1.25; at(b, x, y, 0);
    if (range) { b.userData.blob = true; b.userData.baseY = y; b.userData.range = range; }
    g.add(b);
  });
  return g;
}
function saltRockGeo() {
  return sharedGeo('saltRock', () => {
    const geo = new THREE.IcosahedronGeometry(0.1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = Math.sin(x * 61.3 + y * 17.1) * 43758.5 + Math.sin(z * 31.7 + x * 7.3) * 1543.1;
      const k = 0.82 + (h - Math.floor(h)) * 0.32;
      p.setXYZ(i, x * k, y * k * 1.35 + 0.12, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  });
}
function saltLamp() {
  const rock = meshOf(saltRockGeo(), mat('#f2a07b', { rough: 0.55, flat: true, emissive: '#ff8a5c', ei: 0.2 }));
  return group(at(cyl(0.085, 0.09, 0.04, MAT.wood('#8a5a3b'), 24), 0, 0.02, 0), at(bulbify(rock), 0, 0.045, 0));
}
function paperLantern() {
  const paper = mat('#f6efe1', { rough: 0.9, emissive: '#ffe4b8', ei: 0.2, side: THREE.DoubleSide });
  const prof = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push([0.001 + Math.sin(t * PI) * 0.21 + (i === 0 || i === 16 ? 0.05 : 0), 0.2 + t * 0.95]); }
  const g = group(bulbify(lathe(prof, paper, 36)));
  g.add(merged('lanternRibs', mat('#c9bba5', { rough: 0.8 }), () => {
    const out = [];
    for (let i = 1; i < 16; i++) { const t = i / 16; out.push(new THREE.TorusGeometry(Math.sin(t * PI) * 0.21 + 0.002, 0.0025, 4, 36).rotateX(PI / 2).translate(0, 0.2 + t * 0.95, 0)); }
    return out;
  }));
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; const l = cyl(0.005, 0.005, 0.32, mat('#2b2b2b', { metal: 0.6, rough: 0.4 }), 6); l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); g.add(at(l, Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08)); }
  g.add(at(bulbify(sph(0.04, glow('#fff1d0'), 12, 8)), 0, 0.6, 0));
  return g;
}
function rgbBars() {
  const blk = mat('#151517', { rough: 0.4 });
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(at(cyl(0.045, 0.05, 0.02, blk, 24), s * 0.2, 0.01, 0));
    g.add(at(bulbify(cyl(0.016, 0.016, 0.36, mat('#c9a8ff', { emissive: '#a970ff', ei: 1, rough: 0.3 }), 16)), s * 0.2, 0.2, 0));
    g.add(at(cyl(0.018, 0.018, 0.012, blk, 16), s * 0.2, 0.386, 0));
  }
  return g;
}
function stringLights() {
  const g = new THREE.Group();
  const pts = [], bulbs = [];
  const N = 13, W = 1.4;
  for (let i = 0; i <= 26; i++) { const t = i / 26; const x = -W / 2 + t * W; const sw = (t * 2) % 1; pts.push([x, -Math.sin(sw * PI) * 0.12 + 0.06, 0.012]); }
  g.add(tube(pts, 0.002, mat('#2a2a2a', { rough: 0.6 }), 80, 4));
  for (let i = 0; i < N; i++) { const t = (i + 0.5) / N; const sw = (t * 2) % 1; bulbs.push([-W / 2 + t * W, -Math.sin(sw * PI) * 0.12 + 0.06 - 0.025, 0.014]); }
  const b = merged('stringBulbs', glow('#fff0c8', 0.3), () => bulbs.map(([x, y, z]) => new THREE.SphereGeometry(0.014, 10, 8).scale(1, 1.25, 1).translate(x, y, z)), { cast: false });
  g.add(bulbify(b));
  g.add(merged('stringCaps', mat('#3a3a3a', { rough: 0.5 }), () => bulbs.map(([x, y, z]) => new THREE.CylinderGeometry(0.006, 0.006, 0.014, 6).translate(x, y + 0.02, z))));
  for (const x of [-W / 2, 0, W / 2]) g.add(at(cyl(0.006, 0.006, 0.012, MAT.metal('#c0c0c0'), 8).rotateX(PI / 2), x, 0.06, 0.006));
  return g;
}
function sunsetLamp() {
  const blk = mat('#1b1b1d', { rough: 0.35, metal: 0.4 });
  const g = group(at(cyl(0.06, 0.065, 0.02, blk, 24), 0, 0.01, 0), at(cyl(0.008, 0.008, 0.26, blk, 8), 0, 0.14, 0));
  const head = group(rot(cyl(0.06, 0.06, 0.06, blk, 28), PI / 2, 0, 0));
  head.add(at(bulbify(rot(cyl(0.052, 0.052, 0.004, glow('#ff8a3d', 0.5), 28), PI / 2, 0, 0)), 0, 0, 0.031));
  head.add(at(rot(torus(0.056, 0.005, MAT.chrome(), 6, 28), 0, 0, 0), 0, 0, 0.032));
  head.rotation.x = -0.5; head.position.set(0, 0.3, 0.01); g.add(head);
  return g;
}
function tiffanyTex() {
  return cached('hd:tiffany', () => {
    const W = 256, H = 128; const c = canvas(W, H); const ctx = c.getContext('2d');
    const cols = ['#c8762a', '#e2a13a', '#2f6b4f', '#7a2e2e', '#e8c766', '#3b6a8a'];
    const rnd = seeded(5);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 16; q++) { ctx.fillStyle = r === 1 ? cols[(q % 2) + 2] : r === 3 ? '#e2a13a' : cols[Math.floor(rnd() * cols.length)]; ctx.fillRect(q * 16, r * 32, 16, 32); }
    ctx.fillStyle = '#7a2e2e'; for (let q = 0; q < 16; q++) { ctx.beginPath(); ctx.arc(q * 16 + 8, 48, 6, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#2d2418'; ctx.lineWidth = 2.5;
    for (let r = 0; r <= 4; r++) { ctx.beginPath(); ctx.moveTo(0, r * 32); ctx.lineTo(W, r * 32); ctx.stroke(); }
    for (let q = 0; q <= 16; q++) { ctx.beginPath(); ctx.moveTo(q * 16, 0); ctx.lineTo(q * 16, H); ctx.stroke(); }
    return toTexture(c, { wrap: false });
  });
}
function tiffanyLamp() {
  const bronze = mat('#5b4026', { rough: 0.35, metal: 0.8 });
  const g = group(lathe([[0.001, 0], [0.11, 0], [0.11, 0.015], [0.06, 0.04], [0.03, 0.1], [0.022, 0.25], [0.03, 0.36], [0.001, 0.36]], bronze, 32));
  const t = tiffanyTex();
  const shadeM = mat('#ffffff', { map: t, rough: 0.2, clearcoat: 0.6, side: THREE.DoubleSide, emissive: '#ffffff', ei: 0 });
  shadeM.emissiveMap = t;
  g.add(at(bulbify(lathe([[0.24, 0], [0.22, 0.06], [0.17, 0.15], [0.09, 0.21], [0.03, 0.235], [0.001, 0.24]], shadeM, 48)), 0, 0.32, 0));
  g.add(at(sph(0.022, bronze, 10, 8), 0, 0.57, 0));
  g.add(at(rot(torus(0.24, 0.006, bronze, 6, 48), PI / 2, 0, 0), 0, 0.32, 0));
  return g;
}
function cloudLight() {
  const m = mat('#ffffff', { rough: 0.85, emissive: '#ffffff', ei: 0.1 });
  const g = new THREE.Group();
  for (const [x, y, r] of [[-0.17, -0.03, 0.09], [-0.06, 0.05, 0.12], [0.08, 0.06, 0.11], [0.18, -0.02, 0.085], [0.02, -0.05, 0.1]]) {
    const s = bulbify(sph(r, m, 20, 14)); s.scale.z = 0.45; g.add(at(s, x, y, r * 0.45));
  }
  return g;
}
function fireplace() {
  const g = new THREE.Group();
  const wh = mat('#f1eee8', { rough: 0.45 });
  g.add(at(box(1.2, 0.05, 0.34, mat('#ffffff', { map: marble({ base: '#f3f1ec', vein: '#9a948b', seed: 21 }), rough: 0.2, clearcoat: 0.5 })), 0, 1.0, 0.0));
  for (const s of [-1, 1]) g.add(at(box(0.22, 0.98, 0.3, wh), s * 0.49, 0.49, 0));
  g.add(at(box(0.76, 0.2, 0.3, wh), 0, 0.88, 0), at(box(0.76, 0.08, 0.3, wh), 0, 0.04, 0));
  g.add(at(box(0.76, 0.7, 0.02, mat('#141212', { rough: 0.6 })), 0, 0.43, -0.12));
  g.add(at(box(0.74, 0.68, 0.006, MAT.glass('#c8c0b8', 0.12)), 0, 0.43, 0.14));
  g.add(at(box(0.76, 0.02, 0.26, mat('#1e1b1a', { rough: 0.8 })), 0, 0.09, 0.0));
  const logM = mat('#5a3a24', { rough: 0.9 });
  for (const [x, a] of [[-0.12, 0.2], [0.1, -0.25], [0, 0.05]]) { const l = cyl(0.035, 0.035, 0.38, logM, 10); l.rotation.set(0, a, PI / 2); g.add(at(l, x * 0.5, x === 0 ? 0.17 : 0.13, x === 0 ? -0.02 : 0.03)); }
  const flameShape = (h) => [[-0.05, 0], [0.05, 0], [0.04, h * 0.4], [0.012, h * 0.85], [0, h], [-0.015, h * 0.8], [-0.045, h * 0.35]];
  const fm = mat('#ffb347', { emissive: '#ff7a1a', ei: 0.6, rough: 0.5, opacity: 0.9, transparent: true });
  [[-0.18, 0.2, 0.0], [-0.06, 0.28, 0.02], [0.06, 0.24, -0.01], [0.17, 0.18, 0.01]].forEach(([x, h, z], i) => g.add(at(bulbify(extrude(flameShape(h), 0.01, fm, 0.004, { cast: false }, 'fpFlame' + i)), x, 0.15, z)));
  const ember = bulbify(box(0.5, 0.012, 0.12, mat('#ff5a1a', { emissive: '#ff4a0a', ei: 0.6 }))); g.add(at(ember, 0, 0.104, 0.02));
  return g;
}

// ------------------------------------------------------------------ candles
const FLAME_M = () => mat('#ffd27a', { emissive: '#ffab3d', ei: 3, rough: 0.4 });
function flame(x, y, z) {
  const f = lathe([[0.001, 0], [0.005, 0.005], [0.0065, 0.011], [0.0045, 0.02], [0.0015, 0.027], [0.001, 0.032]], FLAME_M(), 12, { cast: false, receive: false });
  f.userData.flame = true;
  return group(at(cyl(0.0012, 0.0012, 0.012, mat('#2a2a2a'), 5), x, y + 0.006, z), at(f, x, y + 0.009, z));
}
function jarCandle({ glass = '#e9e1d4', opacity = 0.45, wax = '#f3e6cf', label = 'VANILLA BEAN', sub = 'soy candle', accent = '#8a6a4a', labelBg = '#fbf6ee', h = 0.1, r = 0.045, key }) {
  const g = group(
    lathe([[r * 0.95, 0], [r, 0.006], [r, h], [r * 0.95, h]], mat(glass, { rough: 0.05, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 32),
    at(cyl(r * 0.95, r * 0.95, 0.008, mat(glass, { rough: 0.05, opacity: 0.6, transparent: true }), 32), 0, 0.004, 0),
    at(cyl(r * 0.93, r * 0.93, h * 0.68, mat(wax, { rough: 0.6 }), 32), 0, 0.008 + h * 0.34, 0),
  );
  const tex = labelTexture('hd:candle:' + key, 256, 96, (ctx, W, H) => {
    ctx.fillStyle = labelBg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const cx of [W * 0.25, W * 0.75]) { ctx.font = `800 ${H * 0.26}px Georgia, serif`; fitText(ctx, label, cx, H * 0.42, W * 0.44); ctx.font = `500 ${H * 0.14}px ${FONT}`; fitText(ctx, sub, cx, H * 0.72, W * 0.4); }
  });
  g.add(at(cyl(r * 1.005, r * 1.005, h * 0.4, mat('#ffffff', { map: tex, rough: 0.7 }), 32, undefined, true), 0, h * 0.45, 0));
  g.add(flame(0, 0.008 + h * 0.68, 0));
  return g;
}
function tinCandle({ tin = '#cfd3d8', wax = '#c9b6e4', label = 'LAVENDER', accent = '#6d597a', key }) {
  const metal = MAT.metal(tin, 0.3);
  const r = 0.042, h = 0.045;
  const g = group(at(cyl(r + 0.002, r + 0.002, 0.012, metal, 32), 0, 0.006, 0));
  g.add(at(lathe([[0.001, 0], [r, 0], [r, h], [r - 0.002, h], [r - 0.002, 0.003], [0.001, 0.003]], metal, 32), 0, 0.012, 0));
  g.add(at(cyl(r - 0.003, r - 0.003, h * 0.75, mat(wax, { rough: 0.6 }), 32), 0, 0.012 + h * 0.375, 0));
  g.add(flame(0, 0.012 + h * 0.75, 0));
  // lid leaning against the back of the tin, label facing out
  const lid = group(cyl(r + 0.003, r + 0.003, 0.01, metal, 32));
  const top = decal(0.07, 0.07, 'hd:tin:' + key, (ctx, W, H) => { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fbf7f0'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, 7); ctx.fill(); ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${H * 0.16}px Georgia, serif`; fitText(ctx, label, W / 2, H / 2, W * 0.8); ctx.font = `500 ${H * 0.08}px ${FONT}`; ctx.fillText('· travel tin ·', W / 2, H * 0.68); }, { tw: 128, th: 128 });
  top.rotation.x = -PI / 2; at(top, 0, 0.0052, 0); lid.add(top);
  lid.rotation.x = 1.3; lid.position.set(0, 0.045, -0.056); g.add(lid);
  return g;
}
function pumpkinCandle() {
  const wax = mat('#e8812f', { rough: 0.55 });
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; const s = sph(0.045, wax, 16, 12); s.scale.set(0.6, 0.85, 1); s.rotation.y = -a; g.add(at(s, Math.cos(a) * 0.035, 0.04, Math.sin(a) * 0.035)); }
  g.add(at(cyl(0.035, 0.03, 0.01, wax, 20), 0, 0.075, 0));
  const stem = cyl(0.007, 0.01, 0.03, mat('#5e7a3a', { rough: 0.8 }), 8); stem.rotation.z = 0.3; g.add(at(stem, 0.02, 0.09, 0));
  g.add(flame(-0.01, 0.078, 0.006));
  return g;
}
function pillarTrio() {
  const g = group(at(cyl(0.13, 0.13, 0.012, mat('#ffffff', { map: marble({ base: '#efece6', vein: '#a19b92', seed: 3 }), rough: 0.2, clearcoat: 0.6 }), 40), 0, 0.006, 0));
  const wax = mat('#f6f0e4', { rough: 0.65 });
  [[-0.06, 0.16, 0.04], [0.04, 0.12, -0.03], [0.07, 0.085, 0.06]].forEach(([x, h, z]) => {
    g.add(at(lathe([[0.001, 0], [0.036, 0], [0.036, h], [0.03, h - 0.004], [0.001, h - 0.01]], wax, 32), x, 0.012, z));
    g.add(flame(x, 0.012 + h - 0.01, z));
  });
  return g;
}
function bowlCandle() {
  const g = group(lathe([[0.001, 0], [0.06, 0], [0.095, 0.03], [0.1, 0.065], [0.094, 0.065], [0.088, 0.032], [0.055, 0.006], [0.001, 0.006]], MAT.ceramic('#4f7d8c'), 40));
  g.add(at(cyl(0.088, 0.075, 0.045, mat('#d9eef0', { rough: 0.6 }), 40), 0, 0.03, 0));
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + 0.5; g.add(flame(Math.cos(a) * 0.04, 0.052, Math.sin(a) * 0.04)); }
  return g;
}

// ------------------------------------------------------------------ scent devices
function woodDiffuser() {
  const wood = mat('#b07d4f', { rough: 0.5, map: woodGrain(5), clearcoat: 0.3 });
  const g = group(lathe([[0.001, 0], [0.075, 0], [0.072, 0.03], [0.05, 0.13], [0.035, 0.15], [0.001, 0.15]], wood, 40));
  g.add(at(cyl(0.034, 0.036, 0.012, mat('#f4f1ea', { rough: 0.4 }), 24), 0, 0.155, 0));
  g.add(at(cyl(0.008, 0.008, 0.004, mat('#333'), 12), 0, 0.162, 0));
  g.add(at(bulbify(rot(torus(0.074, 0.004, mat('#ffd9a8', { emissive: '#ffb870', ei: 0 }), 6, 40), PI / 2, 0, 0)), 0, 0.012, 0));
  g.add(at(cyl(0.006, 0.006, 0.004, glow('#bfe9ff', 0.8), 10).rotateX(PI / 2), 0, 0.03, 0.073));
  return g;
}
function cloudHumidifier() {
  const wh = mat('#fbfbfb', { rough: 0.35, clearcoat: 0.4 });
  const g = group(at(cyl(0.1, 0.105, 0.03, wh, 32), 0, 0.015, 0));
  for (const [x, y, z, r] of [[-0.06, 0.08, 0, 0.065], [0.0, 0.11, 0, 0.08], [0.065, 0.08, 0, 0.06], [0.02, 0.07, 0.04, 0.05], [-0.03, 0.07, -0.04, 0.055]]) g.add(at(sph(r, wh, 24, 16), x, y, z));
  g.add(at(bulbify(rot(cyl(0.012, 0.012, 0.004, mat('#9fd8ff', { emissive: '#6cc4ff', ei: 0 }), 16), PI / 2, 0, 0)), 0, 0.09, 0.079));
  for (const s of [-1, 1]) g.add(at(sph(0.005, mat('#333'), 8, 6), s * 0.02, 0.125, 0.07));
  g.add(at(rot(torus(0.008, 0.002, mat('#333'), 4, 12, PI), 0, 0, PI), 0, 0.11, 0.076));
  return g;
}
function reedDiffuser() {
  const g = group(
    lathe([[0.001, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.07], [0.03, 0.09], [0.012, 0.1], [0.012, 0.115], [0.001, 0.115]], mat('#e9d6b8', { rough: 0.05, opacity: 0.55, transparent: true, depthWrite: false }), 32),
    at(cyl(0.046, 0.046, 0.05, mat('#e8b26a', { rough: 0.1, opacity: 0.8, transparent: true }), 32), 0, 0.027, 0),
    at(cyl(0.014, 0.014, 0.012, MAT.gold(), 16), 0, 0.112, 0),
  );
  g.add(merged('reeds', mat('#5a4030', { rough: 0.8 }), () => Array.from({ length: 8 }, (_, i) => { const a = i / 8 * PI * 2; return new THREE.CylinderGeometry(0.0018, 0.0018, 0.3, 4).translate(0, 0.15, 0).rotateX(Math.sin(a) * 0.25).rotateZ(Math.cos(a) * 0.25).translate(0, 0.08, 0); })));
  const lab = decal(0.05, 0.03, 'hd:reedlabel', (ctx, W, H) => { ctx.fillStyle = '#fbf7f0'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#5a4030'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${H * 0.3}px Georgia, serif`; ctx.fillText('AMBER', W / 2, H * 0.42); ctx.font = `500 ${H * 0.16}px ${FONT}`; ctx.fillText('& sea salt', W / 2, H * 0.72); }, { tw: 160, th: 96 });
  g.add(at(lab, 0, 0.045, 0.0505));
  return g;
}

// ------------------------------------------------------------------ clocks
function hands(g, x, y, z, lenH, lenM, color = '#1e1e1e', w = 0.008) {
  const m = mat(color, { rough: 0.4 });
  const hp = named(new THREE.Group(), 'hourHand'); hp.position.set(x, y, z);
  hp.add(at(box(w, lenH, 0.002, m), 0, lenH / 2 - lenH * 0.15, 0));
  const mp = named(new THREE.Group(), 'minuteHand'); mp.position.set(x, y, z + 0.003);
  mp.add(at(box(w * 0.7, lenM, 0.002, m), 0, lenM / 2 - lenM * 0.12, 0));
  hp.rotation.z = -(10 + 10 / 60) / 12 * PI * 2; mp.rotation.z = -10 / 60 * PI * 2;
  g.add(hp, mp, at(rot(cyl(w * 0.9, w * 0.9, 0.006, m, 12), PI / 2, 0, 0), x, y, z + 0.004));
}
function ticks(key, r, len, w, z, every = 1, n = 12) {
  return merged(key, mat('#222', { rough: 0.5 }), () => Array.from({ length: n }, (_, i) => { const a = i / n * PI * 2; const big = i % every === 0; return new THREE.BoxGeometry(big ? w * 1.6 : w, big ? len : len * 0.6, 0.002).translate(0, r - (big ? len : len * 0.6) / 2, z).rotateZ(-a); }), { cast: false });
}
function wallClockMinimal({ rim = '#1e1e1e', face = '#fbfaf7' } = {}) {
  const R = 0.16;
  const g = group(at(rot(cyl(R, R, 0.04, mat(rim, { rough: 0.35 }), 48), PI / 2, 0, 0), 0, 0, 0.02));
  g.add(at(rot(cyl(R - 0.012, R - 0.012, 0.004, mat(face, { rough: 0.6 }), 48), PI / 2, 0, 0), 0, 0, 0.04));
  const t = ticks('minTicks', R - 0.022, 0.022, 0.005, 0, 1); t.position.z = 0.043; g.add(t);
  hands(g, 0, 0, 0.045, 0.085, 0.125);
  g.add(at(rot(cyl(R, R, 0.003, MAT.glass('#ffffff', 0.08), 48), PI / 2, 0, 0), 0, 0, 0.056));
  return g;
}
function sunburstClock() {
  const g = new THREE.Group();
  const gold = MAT.gold();
  g.add(merged('sunRays', gold, () => {
    const out = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2, L = i % 2 ? 0.2 : 0.25; out.push(new THREE.CylinderGeometry(0.004, 0.006, L, 6).translate(0, 0.12 + L / 2, 0.012).rotateZ(a)); out.push(new THREE.SphereGeometry(0.012, 8, 6).translate(0, 0.12 + L + 0.008, 0.012).rotateZ(a)); }
    return out;
  }));
  g.add(at(rot(cyl(0.13, 0.13, 0.035, gold, 48), PI / 2, 0, 0), 0, 0, 0.018));
  g.add(at(rot(cyl(0.11, 0.11, 0.004, mat('#f7f2e6', { rough: 0.6 }), 48), PI / 2, 0, 0), 0, 0, 0.036));
  const t = ticks('sunTicks', 0.098, 0.016, 0.004, 0, 3); t.position.z = 0.039; g.add(t);
  hands(g, 0, 0, 0.041, 0.055, 0.085, '#1e1e1e', 0.006);
  return g;
}
function catClock() {
  const blk = mat('#151515', { rough: 0.25, clearcoat: 0.8 });
  const sh = [[-0.07, -0.2], [0.07, -0.2], [0.09, -0.05], [0.085, 0.1], [0.075, 0.14], [0.09, 0.26], [0.04, 0.2], [-0.04, 0.2], [-0.09, 0.26], [-0.075, 0.14], [-0.085, 0.1], [-0.09, -0.05]];
  const g = group(at(extrude(sh, 0.03, blk, 0.006, undefined, 'catClockBody'), 0, 0, 0.015));
  g.add(tube([[0.05, -0.19, 0.02], [0.09, -0.25, 0.02], [0.05, -0.33, 0.022], [0.08, -0.4, 0.02]], 0.008, blk, 20, 6));
  g.add(at(rot(cyl(0.062, 0.062, 0.004, mat('#fbfaf6', { rough: 0.5 }), 40), PI / 2, 0, 0), 0, -0.07, 0.04));
  for (const s of [-1, 1]) {
    const e = sph(0.022, mat('#ffffff', { rough: 0.3 }), 14, 10); e.scale.set(1, 1.2, 0.4); g.add(at(e, s * 0.035, 0.14, 0.037));
    const p = sph(0.01, mat('#2a2a2a', { rough: 0.2 }), 10, 8); p.scale.z = 0.4; g.add(at(p, s * 0.035 + 0.006, 0.138, 0.046));
  }
  g.add(at(rot(cone(0.012, 0.03, mat('#d63c3c', { rough: 0.4 }), 3), 0, 0, PI / 2), -0.014, 0.04, 0.04), at(rot(cone(0.012, 0.03, mat('#d63c3c', { rough: 0.4 }), 3), 0, 0, -PI / 2), 0.014, 0.04, 0.04));
  g.add(at(sph(0.008, MAT.gold(), 8, 6), 0, 0.04, 0.045));
  const t = ticks('catTicks', 0.056, 0.01, 0.004, 0, 3); t.position.set(0, -0.07, 0.0425); g.add(t);
  hands(g, 0, -0.07, 0.044, 0.032, 0.048, '#151515', 0.005);
  return g;
}
function flipClock() {
  const g = group(at(rbox(0.19, 0.1, 0.08, 0.02, mat('#f2efe9', { rough: 0.4 })), 0, 0.05, 0));
  const c = canvas(256, 128); const tex = toTexture(c, { wrap: false });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.075), m); p.name = 'digital';
  const draw = (txt) => {
    const ctx = c.getContext('2d'); const W = 256, H = 128;
    ctx.fillStyle = '#f2efe9'; ctx.fillRect(0, 0, W, H);
    const [hm, ap] = String(txt).split(' ');
    const digits = (hm || '').replace(':', '').padStart(4, ' ');
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 58 + (i > 1 ? 12 : 0);
      ctx.fillStyle = '#1d1d1f'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, 14, 52, 100, 8) : ctx.rect(x, 14, 52, 100); ctx.fill();
      ctx.fillStyle = '#f7f4ee'; ctx.font = `700 76px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(digits[i].trim(), x + 26, 68);
      ctx.fillStyle = '#000'; ctx.fillRect(x, 63, 52, 2);
    }
    if (ap) { ctx.fillStyle = '#e07a5f'; ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(ap, 6, 10); }
    tex.needsUpdate = true;
  };
  p.userData.draw = draw; draw('10:10 AM');
  g.add(at(p, 0, 0.05, 0.0405));
  g.add(at(box(0.15, 0.012, 0.06, mat('#1d1d1f', { rough: 0.5 })), 0, 0.006, 0));
  return g;
}
function grandfatherClock() {
  const wood = MAT.wood('#5a3420');
  const dark = mat('#3e2416', { rough: 0.45, clearcoat: 0.5, map: woodGrain(2) });
  const g = group(
    at(box(0.5, 0.25, 0.32, wood), 0, 0.125, 0),
    at(box(0.4, 1.1, 0.26, dark), 0, 0.8, 0),
    at(box(0.5, 0.5, 0.3, wood), 0, 1.6, 0),
    at(box(0.54, 0.04, 0.34, wood), 0, 0.27, 0),
    at(box(0.54, 0.04, 0.34, wood), 0, 1.33, 0),
  );
  const arch = [[-0.27, 0], [0.27, 0], [0.27, 0.06]];
  for (let i = 0; i <= 10; i++) { const a = i / 10 * PI; arch.push([Math.cos(a) * 0.27, 0.06 + Math.sin(a) * 0.12]); }
  arch.push([-0.27, 0.06]);
  g.add(at(extrude(arch, 0.32, wood, 0.004, undefined, 'gfArch'), 0, 1.85, 0));
  for (const s of [-1, 1]) g.add(at(sph(0.02, MAT.gold(), 10, 8), s * 0.22, 2.0, 0.12));
  g.add(at(rot(cyl(0.17, 0.17, 0.01, MAT.gold(), 40), PI / 2, 0, 0), 0, 1.62, 0.152));
  g.add(at(rot(cyl(0.15, 0.15, 0.004, mat('#f4ecd8', { rough: 0.6 }), 40), PI / 2, 0, 0), 0, 1.62, 0.158));
  const t = ticks('gfTicks', 0.14, 0.02, 0.005, 0, 3); t.position.set(0, 1.62, 0.161); g.add(t);
  hands(g, 0, 1.62, 0.164, 0.08, 0.12, '#1a1a1a', 0.007);
  g.add(at(box(0.3, 0.85, 0.01, mat('#1a120c', { rough: 0.5 })), 0, 0.82, 0.125));
  g.add(at(cyl(0.004, 0.004, 0.6, MAT.gold(), 6), 0, 0.98, 0.135), at(rot(cyl(0.07, 0.07, 0.01, MAT.gold(), 32), PI / 2, 0, 0), 0, 0.66, 0.136));
  for (const x of [-0.08, 0.08]) g.add(at(cyl(0.022, 0.022, 0.16, MAT.gold(), 16), x, 1.0 + (x > 0 ? 0.05 : 0), 0.135));
  g.add(at(box(0.32, 0.88, 0.006, MAT.glass('#f0f6f7', 0.15)), 0, 0.82, 0.133));
  return g;
}

// ------------------------------------------------------------------ neon (single-stroke tube font, x-height = 1 unit)
const ell = (cx, cy, rx, ry, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const ring = (cx, rx) => ({ pts: ell(cx, 0.5, rx, 0.5, 0, PI * 2, 16).slice(0, -1), closed: true });
const line = (...pts) => ({ pts });
const GLYPHS = {
  a: { w: 0.82, s: [ring(0.38, 0.38), line([0.78, 1], [0.78, 0])] },
  b: { w: 0.84, s: [line([0.04, 1.55], [0.04, 0]), ring(0.44, 0.38)] },
  c: { w: 0.78, s: [{ pts: ell(0.42, 0.5, 0.4, 0.5, 0.75, PI * 2 - 0.75, 14) }] },
  d: { w: 0.82, s: [ring(0.38, 0.38), line([0.78, 1.55], [0.78, 0])] },
  e: { w: 0.8, s: [{ pts: [[0.04, 0.5], [0.8, 0.5], ...ell(0.42, 0.5, 0.38, 0.5, 0, PI * 2 - 0.8, 14).slice(1)] }] },
  g: { w: 0.82, s: [ring(0.38, 0.38), line([0.78, 1], [0.78, 0], [0.74, -0.3], [0.5, -0.5], [0.22, -0.46], [0.06, -0.3])] },
  h: { w: 0.78, s: [line([0.04, 1.55], [0.04, 0]), line([0.04, 0.55], [0.18, 0.88], [0.42, 1], [0.66, 0.88], [0.74, 0.55], [0.74, 0])] },
  i: { w: 0.12, s: [line([0.06, 1], [0.06, 0])], dot: [0.06, 1.38] },
  l: { w: 0.12, s: [line([0.06, 1.55], [0.06, 0])] },
  m: { w: 1.08, s: [line([0.04, 1], [0.04, 0]), line([0.04, 0.6], [0.14, 0.9], [0.3, 1], [0.46, 0.88], [0.52, 0.6], [0.52, 0]), line([0.52, 0.6], [0.62, 0.9], [0.78, 1], [0.94, 0.88], [1.0, 0.6], [1.0, 0])] },
  n: { w: 0.78, s: [line([0.04, 1], [0.04, 0]), line([0.04, 0.55], [0.18, 0.88], [0.42, 1], [0.66, 0.88], [0.74, 0.55], [0.74, 0])] },
  o: { w: 0.84, s: [ring(0.42, 0.42)] },
  r: { w: 0.58, s: [line([0.04, 1], [0.04, 0]), line([0.04, 0.55], [0.16, 0.86], [0.36, 1], [0.58, 0.96])] },
  s: { w: 0.68, s: [line([0.64, 0.88], [0.42, 1], [0.16, 0.95], [0.06, 0.76], [0.2, 0.56], [0.5, 0.45], [0.66, 0.26], [0.58, 0.06], [0.34, 0], [0.04, 0.12])] },
  t: { w: 0.52, s: [line([0.2, 1.4], [0.2, 0.2], [0.28, 0.03], [0.5, 0.02]), line([0.0, 1], [0.48, 1])] },
  u: { w: 0.78, s: [line([0.04, 1], [0.04, 0.42], [0.14, 0.1], [0.38, 0], [0.62, 0.1], [0.74, 0.42]), line([0.74, 1], [0.74, 0])] },
  v: { w: 0.74, s: [line([0, 1], [0.3, 0.12], [0.37, 0], [0.44, 0.12], [0.74, 1])] },
  y: { w: 0.74, s: [line([0, 1], [0.36, 0.05]), line([0.74, 1], [0.48, 0.1], [0.3, -0.35], [0.06, -0.52])] },
  z: { w: 0.7, s: [line([0.02, 1], [0.62, 1], [0.66, 0.96], [0.06, 0.04], [0.1, 0], [0.7, 0])] },
  ' ': { w: 0.4, s: [] },
};
const neonMat = (c) => mat(c, { emissive: c, ei: 0.85, rough: 0.3 });
function neonPanel(g, w, h, z = 0.006) {
  g.add(at(rbox(w, h, 0.008, 0.01, mat('#17181d', { rough: 0.08, clearcoat: 1, opacity: 0.9, transparent: true }), { cast: false }), 0, 0, z));
  g.add(merged('standoffs:' + w.toFixed(2) + ':' + h.toFixed(2), MAT.chrome(), () => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10).rotateX(PI / 2).translate(x * (w / 2 - 0.025), y * (h / 2 - 0.025), 0.012))));
}
function neonWord(lines, color, xh = 0.1) {
  const g = new THREE.Group();
  const m = neonMat(color);
  const LH = 2.0, R = 0.075, spacing = 0.2;
  const widths = lines.map((ln) => [...ln].reduce((s, ch) => s + (GLYPHS[ch]?.w ?? 0.5) + spacing, -spacing));
  const word = new THREE.Group();
  lines.forEach((ln, li) => {
    let x = -widths[li] / 2;
    const y = (lines.length - 1) / 2 * LH - li * LH - 0.5;
    for (const ch of ln) {
      const gl = GLYPHS[ch]; if (!gl) continue;
      const lg = new THREE.Group(); lg.position.set(x, y, 0);
      for (const st of gl.s) {
        const t = tube(st.pts.map(([px, py]) => [px, py, 0]), R, m, Math.max(12, st.pts.length * 8), 6, !!st.closed, { cast: false, receive: false });
        t.userData.neon = true; lg.add(t);
      }
      if (gl.dot) { const d = sph(R * 1.3, m, 8, 6, { cast: false }); d.userData.neon = true; lg.add(at(d, gl.dot[0], gl.dot[1], 0)); }
      word.add(lg); x += gl.w + spacing;
    }
  });
  word.scale.setScalar(xh); word.position.z = 0.03; g.add(word);
  const w = Math.max(...widths) * xh + 0.14, h = lines.length * LH * xh + 0.06;
  neonPanel(g, w, h);
  return g;
}
function neonShape(curves, panelW, panelH) {
  const g = new THREE.Group();
  for (const { pts, color, closed = true, r = 0.0075 } of curves) {
    const t = tube(pts.map(([x, y]) => [x, y, 0.03]), r, neonMat(color), Math.max(24, pts.length * 4), 6, closed, { cast: false, receive: false });
    t.userData.neon = true; g.add(t);
  }
  neonPanel(g, panelW, panelH);
  return g;
}
const heartPts = (s, dx = 0, dy = 0) => Array.from({ length: 40 }, (_, i) => { const t = i / 40 * PI * 2; return [dx + s * 16 * Math.sin(t) ** 3 / 17, dy + s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]; });
const starPts = (cx, cy, r1, r2, n = 5) => Array.from({ length: n * 2 }, (_, i) => { const a = PI / 2 + i * PI / n; const r = i % 2 ? r2 : r1; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
function moonPts() {
  const outer = ell(0, 0, 0.17, 0.17, 0.75, PI * 2 - 0.75, 20);
  const inner = ell(0.08, 0.02, 0.13, 0.13, PI * 2 - 1.25, 1.25, 16).slice(1, -1);
  return [...outer, ...inner];
}
const boltPts = [[0.03, 0.2], [-0.09, -0.01], [-0.01, -0.01], [-0.05, -0.2], [0.09, 0.04], [0.01, 0.04]];

// ------------------------------------------------------------------ aquariums
function stripeTex(key, base, stripe, n = 3) {
  return labelTexture('hd:fish:' + key, 64, 64, (ctx, W, H) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    if (stripe) for (let i = 0; i < n; i++) { const y = H * (0.25 + i * 0.25); ctx.fillStyle = '#111'; ctx.fillRect(0, y - 6, W, 12); ctx.fillStyle = stripe; ctx.fillRect(0, y - 4, W, 8); }
  });
}
function fish({ body = '#ff7f11', fin = '#ffffff', stripe = null, len = 0.05, r = 0.12, key = 'f' }) {
  const g = new THREE.Group();
  const b = sph(len / 2, mat('#ffffff', { map: stripeTex(key, body, stripe), rough: 0.3, clearcoat: 0.6 }), 14, 10);
  b.rotation.z = PI / 2; b.scale.set(0.62, 1, 0.38); g.add(b);
  const tail = cone(len * 0.24, len * 0.36, mat(fin, { rough: 0.4 }), 8); tail.rotation.z = PI / 2; tail.scale.z = 0.25; g.add(at(tail, len * 0.62, 0, 0));
  const dorsal = cone(len * 0.12, len * 0.2, mat(fin, { rough: 0.4 }), 6); dorsal.scale.z = 0.2; g.add(at(dorsal, len * 0.05, len * 0.32, 0));
  for (const s of [-1, 1]) g.add(at(sph(len * 0.06, mat('#111'), 6, 4), -len * 0.32, len * 0.06, s * len * 0.15));
  g.userData.fish = true; g.userData.r = r;
  return g;
}
function gravelTex() {
  return cached('hd:gravel', () => {
    const S = 128; const c = canvas(S, S); const ctx = c.getContext('2d'); const rnd = seeded(8);
    ctx.fillStyle = '#c9b48c'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) { ctx.fillStyle = ['#e8dcc4', '#a88d62', '#7d6a50', '#f4efe4', '#5f5546'][Math.floor(rnd() * 5)]; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 3, 0, 7); ctx.fill(); }
    return toTexture(c, { repeat: [2, 1] });
  });
}
function tankShell(g, W, H, D, y0, rimC = '#141414') {
  const rim = mat(rimC, { rough: 0.4 });
  g.add(at(box(W, H, D, MAT.glass('#e6f6f8', 0.18)), 0, y0 + H / 2, 0));
  g.add(at(box(W - 0.01, H * 0.86, D - 0.01, mat('#6fc3e0', { rough: 0.1, opacity: 0.22, transparent: true, depthWrite: false }), { cast: false }), 0, y0 + H * 0.43 + 0.005, 0));
  g.add(at(box(W - 0.01, 0.035, D - 0.01, mat('#ffffff', { map: gravelTex(), rough: 0.95 })), 0, y0 + 0.022, 0));
  g.add(at(box(W + 0.006, 0.014, D + 0.006, rim), 0, y0 + 0.007, 0), at(box(W + 0.006, 0.014, D + 0.006, rim), 0, y0 + H - 0.007, 0));
}
function weeds(key, n, W, D, y0, h, color) {
  const rnd = seeded(key.length * 13);
  return merged('weeds:' + key, mat(color, { rough: 0.6 }), () => Array.from({ length: n }, () => {
    const x = (rnd() - 0.5) * W * 0.85, z = -D * 0.3 + (rnd() - 0.5) * D * 0.3, hh = h * (0.5 + rnd() * 0.5), bend = (rnd() - 0.5) * 0.06;
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, y0, z), new THREE.Vector3(x + bend, y0 + hh * 0.5, z), new THREE.Vector3(x - bend * 0.5, y0 + hh, z + bend)]), 8, 0.004, 4);
  }));
}
function nanoTank() {
  const g = new THREE.Group();
  const W = 0.45, H = 0.3, D = 0.25;
  tankShell(g, W, H, D, 0);
  g.add(weeds('nano', 14, W, D, 0.03, 0.22, '#3f8f4a'));
  const rock = meshOf(sharedGeo('rock1', () => new THREE.DodecahedronGeometry(0.05, 0)), mat('#6b6460', { rough: 0.9, flat: true })); rock.scale.set(1.3, 0.8, 1); g.add(at(rock, 0.12, 0.06, -0.04));
  g.add(at(box(W + 0.01, 0.02, D + 0.01, mat('#1d1d1f', { rough: 0.4 })), 0, H + 0.01, 0));
  g.add(at(fish({ body: '#3f6fd8', fin: '#d63c7a', len: 0.05, r: 0.13, key: 'betta' }), 0.1, 0.17, 0));
  g.add(at(fish({ body: '#ff9f1c', fin: '#ffd166', len: 0.035, r: 0.1, key: 'gold' }), -0.08, 0.12, 0.02));
  g.add(at(fish({ body: '#e63946', fin: '#9be7ff', len: 0.03, r: 0.15, key: 'tetra', stripe: '#4cc9f0' }), 0.02, 0.21, -0.02));
  return g;
}
function reefTank() {
  const g = new THREE.Group();
  const W = 1.0, H = 0.5, D = 0.45, y0 = 0.76;
  const cab = mat('#1a1a1c', { rough: 0.3, clearcoat: 0.6 });
  g.add(at(box(W, 0.74, D, cab), 0, 0.37, 0), at(box(0.004, 0.6, 0.004, mat('#333')), 0, 0.38, D / 2 + 0.002));
  for (const s of [-1, 1]) g.add(at(box(0.012, 0.12, 0.012, MAT.chrome()), s * 0.06, 0.45, D / 2 + 0.008));
  tankShell(g, W, H, D, y0, '#101012');
  const rockM = mat('#8a7d6e', { rough: 0.95, flat: true });
  for (const [x, z, s] of [[-0.25, -0.08, 1.4], [0.18, -0.1, 1.7], [0.38, 0.02, 1.0]]) { const r = meshOf(sharedGeo('rock1', () => new THREE.DodecahedronGeometry(0.05, 0)), rockM); r.scale.set(s * 1.4, s, s); g.add(at(r, x, y0 + 0.07, z)); }
  const coral = [['#ff5e8a', -0.3, 0.17, 'ball'], ['#ffb347', 0.12, 0.2, 'branch'], ['#7b5cff', 0.25, 0.18, 'ball'], ['#3fd2c7', -0.12, 0.12, 'branch'], ['#ff7a5c', 0.4, 0.14, 'fan']];
  for (const [c, x, y, kind] of coral) {
    const m = mat(c, { rough: 0.6, emissive: c, ei: 0.15 });
    if (kind === 'ball') { const b = sph(0.05, m, 14, 10); b.scale.y = 0.7; g.add(at(b, x, y0 + y - 0.04, -0.06)); }
    else if (kind === 'fan') { const f = sph(0.08, m, 14, 10); f.scale.set(1, 1.1, 0.12); g.add(at(f, x, y0 + y, -0.12)); }
    else g.add(merged('coralBranch:' + c, m, () => Array.from({ length: 6 }, (_, i) => new THREE.CylinderGeometry(0.006, 0.01, 0.12, 6).translate(0, 0.06, 0).rotateZ((i - 2.5) * 0.25).rotateX((i % 2 - 0.5) * 0.4).translate(x, y0 + y - 0.07, -0.05))));
  }
  g.add(weeds('reef', 10, W, D, y0 + 0.03, 0.25, '#2f9a5a'));
  g.add(at(box(W + 0.01, 0.03, D + 0.01, mat('#1d1d1f', { rough: 0.4 })), 0, y0 + H + 0.015, 0));
  const fishes = [
    [{ body: '#ff7a1a', fin: '#ff7a1a', stripe: '#ffffff', len: 0.07, r: 0.3, key: 'clown' }, 0.98],
    [{ body: '#2f6fe0', fin: '#ffd23f', len: 0.09, r: 0.38, key: 'tang' }, 1.08],
    [{ body: '#ffd23f', fin: '#ffd23f', len: 0.06, r: 0.22, key: 'yellow' }, 1.12],
    [{ body: '#ff7a1a', fin: '#ff7a1a', stripe: '#ffffff', len: 0.06, r: 0.18, key: 'clown2' }, 0.92],
    [{ body: '#9b5de5', fin: '#f15bb5', len: 0.045, r: 0.34, key: 'gramma' }, 1.16],
  ];
  fishes.forEach(([o, y], i) => g.add(at(fish(o), Math.cos(i * 1.7) * o.r, y, Math.sin(i * 1.3) * 0.08)));
  return g;
}

// ------------------------------------------------------------------ projectors
function galaxyProjector() {
  const g = group(at(cyl(0.09, 0.1, 0.06, mat('#1b1c22', { rough: 0.35 }), 32), 0, 0.03, 0));
  const tex = labelTexture('hd:galaxyDome', 256, 128, (ctx, W, H) => {
    const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2b1a5a'); gr.addColorStop(0.5, '#5b2a8a'); gr.addColorStop(1, '#173a6a');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const rnd = seeded(77);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = ['#ffffff', '#9fe7ff', '#ffb3f0'][i % 3]; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, rnd() * 1.6 + 0.4, 0, 7); ctx.fill(); }
  });
  const dm = mat('#ffffff', { map: tex, rough: 0.15, clearcoat: 1, emissive: '#ffffff', ei: 0.7 }); dm.emissiveMap = tex;
  g.add(at(lathe([[0.085, 0], [0.084, 0.03], [0.07, 0.07], [0.04, 0.095], [0.001, 0.1]], dm, 40), 0, 0.06, 0));
  g.add(at(cyl(0.006, 0.006, 0.004, glow('#5ef0ff', 1.2), 10).rotateX(PI / 2), 0.05, 0.03, 0.082));
  g.add(at(cyl(0.006, 0.006, 0.004, glow('#ff5ec8', 1.2), 10).rotateX(PI / 2), 0.025, 0.03, 0.095));
  return g;
}
function astronautProjector() {
  const wh = mat('#f4f4f2', { rough: 0.45 });
  const g = group(at(cyl(0.06, 0.065, 0.02, mat('#2b2b33', { rough: 0.5 }), 24), 0, 0.01, 0));
  g.add(at(capsule(0.04, 0.05, wh), 0, 0.1, 0));
  for (const s of [-1, 1]) { g.add(at(capsule(0.017, 0.035, wh), s * 0.022, 0.045, 0.01)); const arm = capsule(0.015, 0.04, wh); arm.rotation.z = s * 0.9; g.add(at(arm, s * 0.055, 0.13, 0)); }
  g.add(at(rbox(0.06, 0.07, 0.03, 0.01, wh), 0, 0.11, -0.045));
  g.add(at(sph(0.05, wh, 24, 16), 0, 0.19, 0));
  const visor = sph(0.038, mat('#1a1040', { rough: 0.05, metal: 0.6, clearcoat: 1, emissive: '#7b5cff', ei: 0.35 }), 20, 14); visor.scale.set(1.05, 0.8, 0.6); g.add(at(visor, 0, 0.19, 0.03));
  g.add(at(rot(torus(0.05, 0.006, mat('#d9d9d9', { rough: 0.3, metal: 0.6 }), 6, 24), PI / 2, 0, 0), 0, 0.15, 0));
  return g;
}

// ------------------------------------------------------------------ fans & purifier
function deskFan({ color = '#a8d5c2' } = {}) {
  const body = mat(color, { rough: 0.3, clearcoat: 0.6 });
  const chrome = MAT.chrome();
  const g = group(lathe([[0.001, 0], [0.11, 0], [0.11, 0.012], [0.08, 0.035], [0.02, 0.045], [0.001, 0.045]], body, 40), at(cyl(0.012, 0.014, 0.2, chrome, 12), 0, 0.14, -0.02));
  for (let i = 0; i < 3; i++) g.add(at(cyl(0.008, 0.008, 0.008, mat('#f4efe6', { rough: 0.4 }), 10), -0.03 + i * 0.03, 0.035, 0.07));
  const head = named(new THREE.Group(), 'head'); head.position.set(0, 0.26, -0.02);
  const motor = sph(0.055, body, 20, 14); motor.scale.z = 1.3; head.add(at(motor, 0, 0, -0.06));
  head.add(merged('fanCage', chrome, () => {
    const out = [new THREE.TorusGeometry(0.13, 0.004, 6, 48).translate(0, 0, 0.035), new THREE.TorusGeometry(0.13, 0.004, 6, 48).translate(0, 0, -0.025), new THREE.TorusGeometry(0.08, 0.002, 4, 36).translate(0, 0, 0.04), new THREE.TorusGeometry(0.04, 0.002, 4, 24).translate(0, 0, 0.044)];
    for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; out.push(new THREE.CylinderGeometry(0.0015, 0.0015, 0.12, 3).translate(0, 0.07, 0.04).rotateZ(a)); out.push(new THREE.CylinderGeometry(0.0015, 0.0015, 0.12, 3).translate(0, 0.07, -0.025).rotateZ(a)); }
    return out;
  }, { cast: false }));
  head.add(at(rot(cyl(0.022, 0.022, 0.01, body, 20), PI / 2, 0, 0), 0, 0, 0.045));
  const rotor = named(new THREE.Group(), 'rotor'); rotor.position.z = 0.005;
  const blade = [[0.015, -0.02], [0.09, -0.045], [0.115, -0.01], [0.11, 0.03], [0.06, 0.035], [0.015, 0.015]];
  for (let i = 0; i < 4; i++) { const b = extrude(blade, 0.003, mat('#f4efe6', { rough: 0.3, opacity: 0.92, transparent: true }), 0.001, { cast: false }, 'fanBlade'); b.rotation.z = i * PI / 2; rotor.add(b); }
  rotor.add(rot(cyl(0.02, 0.02, 0.02, chrome, 16), PI / 2, 0, 0));
  head.add(rotor);
  g.add(head);
  return g;
}
function towerFan() {
  const wh = mat('#f2f2f0', { rough: 0.35 });
  const g = group(at(cyl(0.15, 0.16, 0.03, wh, 36), 0, 0.015, 0), at(cyl(0.03, 0.03, 0.06, wh, 16), 0, 0.05, 0));
  const head = named(new THREE.Group(), 'head');
  head.add(at(rbox(0.18, 0.86, 0.12, 0.05, wh), 0, 0.5, -0.03));
  for (const s of [-1, 1]) head.add(at(rbox(0.03, 0.86, 0.15, 0.012, wh), s * 0.075, 0.5, 0.02));
  head.add(at(rbox(0.18, 0.14, 0.18, 0.06, wh), 0, 0.86, 0), at(rbox(0.18, 0.1, 0.18, 0.05, wh), 0, 0.12, 0));
  head.add(at(box(0.12, 0.62, 0.005, mat('#2a2a2c', { rough: 0.6 })), 0, 0.48, 0.03));
  const rotor = named(new THREE.Group(), 'rotor'); rotor.rotation.x = -PI / 2; rotor.position.set(0, 0.17, 0.06);
  rotor.add(merged('towerImpeller', mat('#6f7378', { rough: 0.5 }), () => Array.from({ length: 10 }, (_, i) => { const a = i / 10 * PI * 2; return new THREE.BoxGeometry(0.03, 0.004, 0.62).translate(0.022, 0, 0.31).rotateZ(a); })));
  head.add(rotor);
  head.add(merged('towerGrille', mat('#d9d9d6', { rough: 0.4 }), () => Array.from({ length: 13 }, (_, i) => new THREE.BoxGeometry(0.005, 0.62, 0.01).translate(-0.054 + i * 0.009, 0.48, 0.092))));
  head.add(at(rbox(0.12, 0.02, 0.08, 0.008, mat('#1d1d1f', { rough: 0.3 })), 0, 0.93, 0.0));
  const led = decal(0.06, 0.016, 'hd:towerLed', (ctx, W, H) => { ctx.fillStyle = '#081018'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#5ef0ff'; ctx.font = `700 ${H * 0.7}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('22°', W / 2, H / 2); }, { tw: 128, th: 36, emissive: true });
  led.rotation.x = -PI / 2; head.add(at(led, 0, 0.941, 0.0));
  g.add(head);
  return g;
}
function airPurifier() {
  const tex = labelTexture('hd:perf', 256, 128, (ctx, W, H) => { ctx.fillStyle = '#f4f4f2'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#bdbdb8'; for (let y = 6; y < H; y += 8) for (let x = (y / 8) % 2 ? 4 : 8; x < W; x += 8) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); } });
  const body = mat('#ffffff', { map: tex, rough: 0.45 });
  const g = group(at(cyl(0.13, 0.13, 0.42, body, 48), 0, 0.21, 0), at(cyl(0.13, 0.13, 0.08, mat('#f4f4f2', { rough: 0.35 }), 48), 0, 0.46, 0));
  g.add(at(cyl(0.11, 0.11, 0.006, mat('#2a2a2c', { rough: 0.5 }), 40), 0, 0.5, 0));
  const rotor = named(new THREE.Group(), 'rotor'); rotor.rotation.x = -PI / 2; rotor.position.y = 0.505;
  rotor.add(merged('purifierBlades', mat('#8a8f96', { rough: 0.4 }), () => Array.from({ length: 7 }, (_, i) => new THREE.BoxGeometry(0.08, 0.02, 0.003).translate(0.05, 0, 0).rotateX(0.5).rotateZ(i / 7 * PI * 2))));
  g.add(rotor);
  g.add(merged('purifierGrille', mat('#d9d9d6', { rough: 0.4 }), () => Array.from({ length: 4 }, (_, i) => new THREE.TorusGeometry(0.025 + i * 0.027, 0.002, 4, 40).rotateX(PI / 2).translate(0, 0.512, 0))));
  g.add(at(rot(torus(0.035, 0.003, glow('#5ef0b0', 1.2), 4, 24), 0, 0, 0), 0, 0.46, 0.131));
  return g;
}

// ------------------------------------------------------------------ robot vacuum
function robotVacuum() {
  const g = group(
    at(cyl(0.17, 0.17, 0.075, mat('#2a2b2f', { rough: 0.3, clearcoat: 0.8 }), 48), 0, 0.05, 0),
    at(cyl(0.162, 0.162, 0.004, mat('#111214', { rough: 0.15, clearcoat: 1 }), 48), 0, 0.0895, 0),
    at(cyl(0.04, 0.04, 0.022, mat('#e8e8e6', { rough: 0.35 }), 24), 0, 0.1, -0.06),
    at(cyl(0.012, 0.012, 0.004, glow('#5ef0ff', 1.4), 16), 0, 0.093, 0.08),
  );
  const bump = torus(0.172, 0.012, MAT.metal('#a9adb3', 0.3), 6, 32, PI); bump.rotation.set(PI / 2, 0, 0); g.add(at(bump, 0, 0.035, 0));
  const brush = named(new THREE.Group(), 'brush'); brush.position.set(0.12, 0.012, 0.11);
  for (let i = 0; i < 3; i++) { const b = box(0.06, 0.003, 0.004, mat('#d1495b', { rough: 0.7 })); b.rotation.y = i * PI * 2 / 3; b.position.set(Math.cos(i * PI * 2 / 3) * 0.03, 0, -Math.sin(i * PI * 2 / 3) * 0.03); brush.add(b); }
  brush.add(cyl(0.01, 0.01, 0.008, mat('#333'), 10));
  g.add(brush);
  return g;
}

// ------------------------------------------------------------------ decorative objects
function budVases() {
  const g = new THREE.Group();
  [['#c8823a', -0.06, 0.13, '#f6f1e7', 'daisy'], ['#6e9a6a', 0.0, 0.17, '#e86a92', 'tulip'], ['#d99aa8', 0.065, 0.1, '#7aa35a', 'sprig']].forEach(([c, x, h, fc, kind], i) => {
    const vm = mat(c, { rough: 0.05, opacity: 0.6, transparent: true, depthWrite: false });
    g.add(at(lathe([[0.001, 0], [0.028, 0], [0.033, h * 0.3], [0.022, h * 0.7], [0.009, h * 0.9], [0.011, h], [0.001, h]], vm, 28), x, 0, i * 0.02 - 0.02));
    const stemTop = h + 0.08 + i * 0.03;
    g.add(tube([[x, h * 0.5, i * 0.02 - 0.02], [x + 0.005, h, i * 0.02 - 0.02], [x + 0.015, stemTop, i * 0.02 - 0.02]], 0.0025, mat('#4f7a3a', { rough: 0.6 }), 8, 4));
    const fm = mat(fc, { rough: 0.6 });
    if (kind === 'daisy') { for (let k = 0; k < 8; k++) { const p = sph(0.008, fm, 6, 4); p.scale.set(1.8, 0.4, 0.7); p.rotation.y = k * PI / 4; g.add(at(p, x + 0.015 + Math.cos(k * PI / 4) * 0.012, stemTop, i * 0.02 - 0.02 - Math.sin(k * PI / 4) * 0.012)); } g.add(at(sph(0.006, mat('#f2c14e'), 8, 6), x + 0.015, stemTop + 0.002, i * 0.02 - 0.02)); }
    else if (kind === 'tulip') { const t = sph(0.016, fm, 12, 10); t.scale.y = 1.4; g.add(at(t, x + 0.015, stemTop + 0.01, i * 0.02 - 0.02)); }
    else for (let k = 0; k < 5; k++) { const l = sph(0.008, fm, 6, 4); l.scale.set(0.6, 0.3, 1.5); g.add(at(l, x + 0.01 + (k % 2 ? 0.008 : -0.008), h + 0.02 + k * 0.014, i * 0.02 - 0.02)); }
  });
  return g;
}
function pampasVase() {
  const g = group(lathe([[0.001, 0], [0.07, 0], [0.09, 0.08], [0.085, 0.2], [0.05, 0.3], [0.045, 0.34], [0.05, 0.36], [0.04, 0.36], [0.001, 0.05]], MAT.ceramic('#efe6d8'), 40));
  const plume = mat('#e8d5b0', { rough: 1, sheen: 1 });
  const stems = [[-0.08, 0.72, -0.1], [0.06, 0.78, 0.05], [0.0, 0.84, 0.0], [0.1, 0.66, -0.05], [-0.05, 0.7, 0.09]];
  g.add(merged('pampasStems', mat('#c9b48c', { rough: 0.8 }), () => stems.map(([x, h, z]) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(x * 0.4, h * 0.6, z * 0.4), new THREE.Vector3(x, h - 0.12, z)]), 10, 0.003, 4))));
  for (const [x, h, z] of stems) { const p = capsule(0.035, 0.16, plume); p.rotation.set(z * 1.2, 0, -x * 1.2); g.add(at(p, x * 1.15, h, z * 1.15)); }
  return g;
}
function bubbleVase({ color = '#c8785a' } = {}) {
  const prof = [[0.001, 0]];
  for (let i = 0; i <= 20; i++) { const y = i / 20 * 0.26; prof.push([0.06 + Math.sin(i / 20 * PI * 4) * 0.018 + Math.sin(i / 20 * PI) * 0.02, y]); }
  prof.push([0.05, 0.26], [0.045, 0.02], [0.001, 0.02]);
  return group(lathe(prof, mat(color, { rough: 0.85 }), 40));
}
function amphora() {
  const terr = mat('#b8643c', { rough: 0.85 });
  const g = group(lathe([[0.001, 0], [0.07, 0], [0.06, 0.03], [0.14, 0.2], [0.16, 0.32], [0.13, 0.45], [0.07, 0.53], [0.065, 0.6], [0.085, 0.62], [0.075, 0.63], [0.055, 0.62], [0.001, 0.1]], terr, 40));
  for (const s of [-1, 1]) g.add(tube([[s * 0.065, 0.58, 0], [s * 0.13, 0.6, 0], [s * 0.14, 0.5, 0], [s * 0.11, 0.44, 0]], 0.012, terr, 16, 6));
  g.add(merged('amphoraBands', mat('#2b1d14', { rough: 0.9 }), () => [new THREE.TorusGeometry(0.157, 0.004, 4, 48).rotateX(PI / 2).translate(0, 0.3, 0), new THREE.TorusGeometry(0.15, 0.004, 4, 48).rotateX(PI / 2).translate(0, 0.36, 0)]));
  return g;
}
function knotSculpture() {
  const k = meshOf(sharedGeo('knot', () => new THREE.TorusKnotGeometry(0.06, 0.014, 120, 10, 2, 3)), MAT.gold());
  return group(at(box(0.12, 0.05, 0.12, mat('#ffffff', { map: marble({ base: '#2a2a2a', vein: '#bdbdbd', seed: 9 }), rough: 0.25, clearcoat: 0.6 })), 0, 0.025, 0), at(cyl(0.006, 0.006, 0.04, MAT.gold(), 8), 0, 0.07, 0), at(k, 0, 0.16, 0));
}
function stackedStones() {
  const g = new THREE.Group();
  let y = 0;
  [[0.075, '#4a4744', 0.45], [0.06, '#b9ad9c', 0.5], [0.048, '#2f2e2c', 0.55], [0.036, '#d8cfc2', 0.6], [0.026, '#6d6862', 0.65]].forEach(([r, c, sq], i) => {
    const s = sph(r, mat(c, { rough: 0.35, clearcoat: 0.3 }), 24, 16); s.scale.set(1.1, sq, 1); s.rotation.y = i;
    y += r * sq; at(s, (i % 2 ? 0.006 : -0.004), y, 0); y += r * sq * 0.92; g.add(s);
  });
  return g;
}
function archBookends() {
  const m = mat('#ffffff', { map: marble({ base: '#efe8df', vein: '#b5a99a', seed: 15 }), rough: 0.25, clearcoat: 0.5 });
  const arch = [[-0.07, 0], [0.07, 0]];
  for (let i = 0; i <= 12; i++) { const a = i / 12 * PI; arch.push([Math.cos(a) * 0.07, 0.11 + Math.sin(a) * 0.07]); }
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const b = extrude(arch, 0.05, m, 0.003, undefined, 'archBookend'); b.rotation.y = PI / 2; g.add(at(b, s * 0.13, 0, 0)); }
  const books = bookSpines(9, 0.22, 63); books.position.set(-0.1, 0, -0.02); g.add(books);
  return g;
}
function orbBowl() {
  const g = group(lathe([[0.001, 0], [0.06, 0], [0.13, 0.05], [0.14, 0.07], [0.132, 0.07], [0.06, 0.012], [0.001, 0.012]], mat('#3a3633', { rough: 0.35, clearcoat: 0.5 }), 40));
  g.add(at(sph(0.04, mat('#5a7a3a', { rough: 1, map: fabric({ base: '#ffffff', seed: 12, knit: true }) }), 16, 12), -0.04, 0.05, 0.01));
  g.add(at(sph(0.034, MAT.gold(), 20, 14), 0.045, 0.045, -0.015));
  g.add(at(sph(0.03, MAT.wood('#a57650'), 16, 12), 0.01, 0.042, 0.055));
  return g;
}
function discoTex() {
  return cached('hd:disco', () => {
    const W = 256, H = 128; const c = canvas(W, H); const ctx = c.getContext('2d'); const rnd = seeded(4);
    for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) { const v = 120 + rnd() * 135; ctx.fillStyle = `rgb(${v},${v},${v + 10})`; ctx.fillRect(x, y, 5, 5); }
    return toTexture(c, { wrap: false });
  });
}
function discoBall() {
  const g = group(lathe([[0.001, 0], [0.05, 0], [0.05, 0.01], [0.02, 0.03], [0.015, 0.06], [0.001, 0.06]], mat('#1b1b1b', { rough: 0.3, metal: 0.6 }), 24));
  const b = sph(0.1, mat('#ffffff', { map: discoTex(), rough: 0.12, metal: 1, flat: true }), 28, 18); g.add(at(b, 0, 0.16, 0));
  return g;
}
function checkerTex(c1, c2, key) { return labelTexture('hd:check:' + key, 128, 128, (ctx, W, H) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? c1 : c2; ctx.fillRect(x * 32, y * 32, 32, 32); } }); }
function pillow({ w = 0.45, h = 0.45, d = 0.14, m }) {
  const p = rbox(w, h, d, Math.min(d / 2 - 0.002, 0.065), m);
  p.rotation.x = -0.18;
  return group(at(p, 0, h / 2 - 0.01, -0.02));
}
function mushroomPillow() {
  const cap = mat('#ffffff', { map: labelTexture('hd:mushcap', 128, 64, (ctx, W, H) => { ctx.fillStyle = '#d64a3a'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fbf3e6'; for (const [x, y, r] of [[20, 20, 7], [60, 14, 6], [100, 24, 8], [40, 40, 5], [84, 46, 6], [118, 8, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } }), rough: 1, sheen: 0.8 });
  const g = group(at(cyl(0.09, 0.11, 0.16, MAT.knit('#f3e9d8'), 24), 0, 0.08, 0));
  const c = sph(0.17, cap, 28, 16); c.scale.set(1, 0.6, 1); g.add(at(c, 0, 0.17, 0));
  for (const s of [-1, 1]) g.add(at(sph(0.008, mat('#2a2a2a'), 8, 6), s * 0.035, 0.11, 0.09));
  g.add(at(rot(torus(0.012, 0.003, mat('#2a2a2a'), 4, 12, PI), 0, 0, PI), 0, 0.095, 0.095));
  return g;
}
function tasselPillow() {
  const v = mat('#7a8f86', { rough: 0.6, sheen: 1, map: fabric({ base: '#ffffff', seed: 6, scale: 2 }) });
  const g = pillow({ w: 0.55, h: 0.32, d: 0.13, m: v });
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const t = cone(0.012, 0.05, mat('#e2c290', { rough: 0.9 }), 8); t.rotation.z = x * 2.3 * (y > 0 ? 0.6 : 1); g.add(at(t, x * 0.285, 0.15 + y * 0.165, -0.02 + (y > 0 ? -0.03 : 0.03))); }
  return g;
}
function chunkyKnitTex() {
  return cached('hd:chunky', () => {
    const S = 128; const c = canvas(S, S); const ctx = c.getContext('2d');
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) for (const s of [-1, 1]) { const g = ctx.createRadialGradient(x + 8 + s * 4, y + 8, 1, x + 8 + s * 4, y + 8, 8); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#8a8a8a'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + 8 + s * 4, y + 8, 4, 8, s * 0.5, 0, 7); ctx.fill(); }
    return toTexture(c, { repeat: [3, 3] });
  });
}
function chunkyBlanket({ color = '#efe6d6' } = {}) {
  const m = mat(color, { map: chunkyKnitTex(), rough: 1, sheen: 0.6 });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(at(rbox(0.5 - i * 0.01, 0.06, 0.34, 0.028, m), i * 0.006, 0.03 + i * 0.058, i * 0.004));
  const fold = cyl(0.03, 0.03, 0.48, m, 16); fold.rotation.z = PI / 2; g.add(at(fold, 0, 0.12, 0.17));
  return g;
}
function blanketBasket() {
  const rat = mat('#c49a6c', { map: labelTexture('hd:weave', 64, 64, (ctx, W, H) => { ctx.fillStyle = '#8a6438'; ctx.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#e2c28f' : '#c9a36e'; ctx.fillRect(x + 1, y + 1, 6, 6); } }), rough: 0.9 });
  const g = group(lathe([[0.001, 0], [0.18, 0], [0.21, 0.4], [0.2, 0.4], [0.17, 0.012], [0.001, 0.012]], rat, 36));
  for (const s of [-1, 1]) g.add(at(rot(torus(0.04, 0.008, mat('#5a4030', { rough: 0.7 }), 6, 16, PI), 0, PI / 2, 0), s * 0.21, 0.36, 0));
  const b1 = cyl(0.07, 0.07, 0.36, MAT.knit('#d9c7a7'), 20); b1.rotation.set(0.25, 0, 0.3); g.add(at(b1, -0.05, 0.42, -0.04));
  const b2 = cyl(0.065, 0.065, 0.34, MAT.fabric('#7a8f86'), 20); b2.rotation.set(-0.3, 0, -0.25); g.add(at(b2, 0.07, 0.4, 0.05));
  return g;
}
const mirrorMat = () => mat('#dfe7ec', { rough: 0.03, metal: 1, envInt: 1.6 });
function archMirror() {
  const outline = (w, h) => { const pts = [[-w / 2, 0], [w / 2, 0]]; for (let i = 0; i <= 16; i++) { const a = i / 16 * PI; pts.push([Math.cos(a) * w / 2, h - w / 2 + Math.sin(a) * w / 2]); } return pts; };
  const g = new THREE.Group();
  const frame = extrude(outline(0.62, 1.72), 0.03, mat('#1b1b1b', { rough: 0.35, metal: 0.5 }), 0.004, undefined, 'archFrame');
  const glass = extrude(outline(0.56, 1.66), 0.006, mirrorMat(), 0.001, undefined, 'archGlass');
  const lean = group(at(frame, 0, 0, 0), at(glass, 0, 0.03, 0.02));
  lean.rotation.x = -0.09; lean.position.set(0, 0.0, 0.06);
  g.add(lean);
  return g;
}
function sunburstMirror() {
  const g = new THREE.Group();
  g.add(merged('mirrorRays', MAT.gold(), () => Array.from({ length: 32 }, (_, i) => { const a = i / 32 * PI * 2, L = i % 2 ? 0.16 : 0.22; return new THREE.BoxGeometry(0.012, L, 0.006).translate(0, 0.19 + L / 2, 0.01).rotateZ(a); })));
  g.add(at(rot(torus(0.19, 0.016, MAT.gold(), 8, 48), 0, 0, 0), 0, 0, 0.016));
  const m = sph(0.18, mirrorMat(), 40, 20); m.scale.z = 0.12; g.add(at(m, 0, 0, 0.012));
  return g;
}
function wavyMirror() {
  const pts = (k) => Array.from({ length: 48 }, (_, i) => { const a = i / 48 * PI * 2; const r = (0.26 + Math.sin(a * 6) * 0.025) * k; return [Math.cos(a) * r * 0.85, Math.sin(a) * r * 1.35]; });
  return group(
    at(extrude(pts(1.16), 0.012, mat('#f2a7b8', { rough: 0.3, clearcoat: 0.5 }), 0.003, undefined, 'wavyBack'), 0, 0, 0.006),
    at(extrude(pts(1), 0.006, mirrorMat(), 0.002, undefined, 'wavyGlass'), 0, 0, 0.016),
  );
}
function globeTex() {
  return cached('hd:globe', () => {
    const W = 256, H = 128; const c = canvas(W, H); const ctx = c.getContext('2d'); const rnd = seeded(23);
    ctx.fillStyle = '#7fa7a0'; ctx.fillRect(0, 0, W, H);
    const blobs = [[40, 40, 26, 22], [60, 80, 14, 26], [130, 35, 30, 16], [140, 70, 18, 28], [190, 45, 34, 20], [215, 95, 16, 10], [128, 118, 60, 6]];
    for (const [x, y, rx, ry] of blobs) { ctx.fillStyle = rnd() < 0.5 ? '#e8d9b0' : '#d9c48f'; ctx.beginPath(); for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2; const r = 0.75 + rnd() * 0.45; ctx.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r); } ctx.fill(); }
    ctx.strokeStyle = 'rgba(70,60,40,0.35)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 21) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    return toTexture(c, { wrap: false });
  });
}
function deskGlobe() {
  const g = group(lathe([[0.001, 0], [0.08, 0], [0.08, 0.02], [0.05, 0.03], [0.02, 0.06], [0.015, 0.1], [0.001, 0.1]], MAT.wood('#6b4529'), 32));
  const tilt = group(at(sph(0.12, mat('#ffffff', { map: globeTex(), rough: 0.45, clearcoat: 0.4 }), 32, 20), 0, 0, 0), rot(torus(0.132, 0.005, brass(), 6, 40, PI * 1.2), 0, 0, -PI * 0.1));
  tilt.rotation.z = 0.41; tilt.position.y = 0.235; g.add(tilt);
  return g;
}
function ceramicMushrooms() {
  const g = new THREE.Group();
  const stem = MAT.ceramic('#f4ecdf');
  [[-0.05, 0.11, 0.05, '#d64a3a'], [0.03, 0.08, 0.04, '#e9a23b'], [0.06, 0.055, 0.03, '#9aa38a']].forEach(([x, h, r, c], i) => {
    g.add(at(lathe([[0.001, 0], [r * 0.45, 0], [r * 0.38, h * 0.6], [r * 0.32, h], [0.001, h]], stem, 20), x, 0, i * 0.03 - 0.02));
    g.add(at(lathe([[0.001, 0], [r, 0.002], [r * 1.05, r * 0.25], [r * 0.8, r * 0.6], [r * 0.4, r * 0.8], [0.001, r * 0.85]], MAT.ceramic(c), 28), x, h - 0.004, i * 0.03 - 0.02));
  });
  return g;
}
function bookStack() {
  const g = new THREE.Group();
  [['#1f3b4d', 0.32, 0.24, 0.035, 0], ['#e9c46a', 0.29, 0.22, 0.03, 0.2], ['#c8553d', 0.26, 0.2, 0.025, -0.12]].reduce((y, [c, w, d, t, r]) => {
    const b = box(w, t, d, mat(c, { rough: 0.6 })); b.rotation.y = r; g.add(at(b, 0, y + t / 2, 0));
    const pages = box(w - 0.01, t * 0.7, d + 0.002, mat('#f6f1e4', { rough: 0.9 })); pages.rotation.y = r; g.add(at(pages, 0.006, y + t / 2, 0));
    return y + t;
  }, 0);
  g.add(at(sph(0.04, MAT.gold(), 20, 14), 0.06, 0.09 + 0.035, 0.02));
  return g;
}
function luckyCat() {
  const wh = MAT.ceramic('#fbfaf6');
  const g = group(at(sph(0.06, wh, 24, 16), 0, 0.06, 0));
  g.children[0].scale.set(1, 1.05, 0.85);
  g.add(at(sph(0.05, wh, 24, 16), 0, 0.15, 0.005));
  for (const s of [-1, 1]) { const e = cone(0.018, 0.03, wh, 8); e.rotation.z = -s * 0.3; g.add(at(e, s * 0.03, 0.2, 0)); g.add(at(cone(0.01, 0.018, mat('#f4a7b9'), 8), s * 0.03, 0.199, 0.006).rotateZ(-s * 0.3)); }
  const paw = capsule(0.014, 0.04, wh); paw.rotation.z = -0.2; g.add(at(paw, 0.055, 0.17, 0.02));
  g.add(at(capsule(0.014, 0.02, wh), -0.03, 0.06, 0.05).rotateX(PI / 2));
  g.add(at(rot(torus(0.042, 0.006, mat('#d62839', { rough: 0.4 }), 6, 24), PI / 2, 0, 0), 0, 0.112, 0.002));
  g.add(at(sph(0.009, MAT.gold(), 10, 8), 0, 0.104, 0.044));
  const coin = rbox(0.045, 0.03, 0.006, 0.01, MAT.gold()); g.add(at(coin, 0.0, 0.055, 0.052));
  const face = decal(0.06, 0.04, 'hd:catface', (ctx, W, H) => { ctx.clearRect(0, 0, W, H); ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(W / 2 + s * W * 0.2, H * 0.4, W * 0.07, PI * 1.1, PI * 1.9); ctx.stroke(); } ctx.beginPath(); ctx.arc(W / 2 - 5, H * 0.65, 5, 0, PI); ctx.arc(W / 2 + 5, H * 0.65, 5, 0, PI); ctx.stroke(); ctx.fillStyle = '#f4a7b9'; ctx.beginPath(); ctx.arc(W / 2, H * 0.57, 3, 0, 7); ctx.fill(); }, { tw: 128, th: 84 });
  g.add(at(face, 0, 0.15, 0.054));
  return g;
}

// ------------------------------------------------------------------ definitions
const L = (o) => ({ category: 'lighting', ...o });
const D = (o) => ({ category: 'decor', ...o });
const admire = (lines, extra = {}) => ({ type: 'decor', lines, ...extra });
const neonDef = (o) => D({ place: 'wall', emoji: '💡', stores: ['volt', 'nestly'], ...o, use: { type: 'neon', color: o.color } });

defineItems([
  // ---------------------------------------------------------- lighting
  L({ id: 'lamp_arc_marble', name: 'Marble Arc Floor Lamp', price: 289, stores: ['nestly', 'luxe'], rarity: 'uncommon', furniture: true, place: 'floor', emoji: '💡', desc: 'A sweeping steel arc on a marble block — reading light that reaches over the sofa.', build: arcLamp, use: { type: 'light', bulb: [0, 1.55, 0.62], intensity: 4, distance: 6, color: '#ffd8a8' } }),
  L({ id: 'lamp_mushroom_amber', name: 'Amber Mushroom Lamp', price: 89, stores: ['nestly', 'primo'], emoji: '🍄', desc: 'Glossy glass mushroom with a warm, honeyed glow.', build: () => mushroomLamp({}), use: { type: 'light', bulb: [0, 0.25, 0], intensity: 1.8, distance: 3.5, color: '#ffbf69' } }),
  L({ id: 'lamp_mushroom_cream', name: 'Opal Mushroom Lamp', price: 89, stores: ['nestly'], emoji: '🍄', desc: 'The milky-white version. Looks like a tiny glowing marshmallow.', build: () => mushroomLamp({ color: '#f3ede2' }), use: { type: 'light', bulb: [0, 0.25, 0], intensity: 1.8, distance: 3.5, color: '#fff0d6' } }),
  L({ id: 'lamp_desk_smart', name: 'Halo Smart Desk Lamp', price: 59, stores: ['volt', 'primo'], brand: 'Halo', emoji: '💡', desc: 'Adjustable LED arm with nine colour scenes. Press R to cycle moods.', build: deskLampSmart, use: { type: 'light', bulb: [0, 0.36, 0.15], intensity: 2.2, distance: 3.5, color: '#fff4e6', smart: true } }),
  L({ id: 'lamp_lava_purple', name: 'Groovy Lava Lamp', price: 39, stores: ['primo', 'volt'], emoji: '🫧', desc: 'Molten orange wax drifting through violet goo. Hypnotic since 1963.', build: () => lavaLamp({}), use: { type: 'light', bulb: [0, 0.25, 0], intensity: 1.4, distance: 3, color: '#ff8a3d', lava: true, ei: 1.6 } }),
  L({ id: 'lamp_lava_teal', name: 'Teal Lava Lamp', price: 39, stores: ['primo', 'volt'], emoji: '🫧', desc: 'Same slow-motion blobs, swimming in ocean teal.', build: () => lavaLamp({ liquid: '#1f8a8a', base: '#2b2b2f' }), use: { type: 'light', bulb: [0, 0.25, 0], intensity: 1.4, distance: 3, color: '#ff9f5a', lava: true, ei: 1.6 } }),
  L({ id: 'lamp_salt', name: 'Himalayan Salt Lamp', price: 35, stores: ['glow', 'nestly', 'primo'], emoji: '🧂', desc: 'A chunk of pink rock salt with a bulb inside. Vibes: immaculate. Science: debatable.', build: saltLamp, use: { type: 'light', bulb: [0, 0.14, 0], intensity: 1.3, distance: 2.8, color: '#ff9a6a', ei: 1.2 } }),
  L({ id: 'lamp_paper_lantern', name: 'Paper Floor Lantern', price: 159, stores: ['nestly'], furniture: true, place: 'floor', emoji: '🏮', desc: 'Washi paper stretched over bamboo ribs. Glows like a soft full moon.', build: paperLantern, use: { type: 'light', bulb: [0, 0.65, 0], intensity: 3, distance: 5, color: '#ffd9a8', ei: 0.9 } }),
  L({ id: 'lamp_rgb_bars', name: 'Chroma RGB Light Bars', price: 49, stores: ['volt'], brand: 'Chroma', emoji: '🌈', desc: 'Two bars that slowly cycle the whole rainbow. Your setup just got +20 FPS (visually).', build: rgbBars, use: { type: 'light', bulb: [0, 0.25, 0.05], intensity: 2.2, distance: 4, color: '#a970ff', rainbow: true, ei: 2.2 } }),
  L({ id: 'lights_string_fairy', name: 'Fairy String Lights', price: 19, stores: ['primo', 'nestly'], place: 'wall', emoji: '✨', desc: 'Thirteen warm globe bulbs on a draped wire. Instant golden hour, any hour.', build: stringLights, use: { type: 'light', bulb: [0, 0, 0.2], intensity: 1.6, distance: 3.5, color: '#ffd79a', ei: 2 } }),
  L({ id: 'lamp_sunset', name: 'Sunset Projection Lamp', price: 29, stores: ['volt', 'primo'], emoji: '🌅', desc: 'Throws a glowing sunset halo onto your wall. Smart: cycle colours with R.', build: sunsetLamp, use: { type: 'light', bulb: [0, 0.32, 0.12], intensity: 3, distance: 4, color: '#ff7b3d', smart: true, ei: 2.5 } }),
  L({ id: 'lamp_tiffany', name: 'Stained Glass Table Lamp', price: 890, stores: ['luxe'], rarity: 'rare', emoji: '🪟', desc: 'Hand-leaded glass in amber, emerald and garnet on a bronze base. Heirloom energy.', build: tiffanyLamp, use: { type: 'light', bulb: [0, 0.42, 0], intensity: 2.2, distance: 4, color: '#ffd29a', ei: 1.4 } }),
  L({ id: 'lamp_cloud_wall', name: 'Cloud Wall Light', price: 59, stores: ['nestly', 'volt'], place: 'wall', emoji: '☁️', desc: 'A puffy cloud that glows in nine dreamy colours. Press R to change.', build: cloudLight, use: { type: 'light', bulb: [0, 0, 0.2], intensity: 1.6, distance: 3.5, color: '#fff4e6', smart: true, ei: 1.2 } }),
  D({ id: 'fireplace_electric', name: 'Electric Mantel Fireplace', price: 449, stores: ['nestly', 'luxe'], rarity: 'uncommon', furniture: true, place: 'floor', emoji: '🔥', desc: 'Flickering LED flames and a marble mantel. All the cozy, none of the chimney.', build: fireplace, use: { type: 'light', bulb: [0, 0.3, 0.2], intensity: 2.6, distance: 4.5, color: '#ff8a3d', flicker: true, ei: 2.2 } }),

  // ---------------------------------------------------------- candles
  D({ id: 'candle_vanilla', name: 'Vanilla Bean Candle', price: 24, stores: ['glow', 'nestly', 'primo'], emoji: '🕯️', desc: 'Hand-poured soy wax in a frosted jar. Smells like a bakery hug. ~50h burn.', build: () => jarCandle({ key: 'vanilla' }), use: { type: 'candle', burn: 3000, flame: [0, 0.1, 0], scent: 'Vanilla Bean' } }),
  D({ id: 'candle_lavender_tin', name: 'Lavender Travel Tin', price: 14, stores: ['glow', 'primo'], emoji: '🕯️', desc: 'A pocket-sized tin of calm. Lavender and chamomile. ~20h burn.', build: () => tinCandle({ key: 'lavender' }), use: { type: 'candle', burn: 1200, flame: [0, 0.07, 0], scent: 'Lavender & Chamomile' } }),
  D({ id: 'candle_pumpkin', name: 'Pumpkin Spice Candle', price: 19, stores: ['nestly', 'primo', 'glow'], season: 'autumn', emoji: '🎃', desc: 'A wax pumpkin that smells exactly like your favourite autumn latte.', build: pumpkinCandle, use: { type: 'candle', burn: 1500, flame: [0, 0.095, 0], scent: 'Pumpkin Spice' } }),
  D({ id: 'candle_pillar_trio', name: 'Pillar Candle Trio', price: 29, stores: ['nestly', 'primo'], emoji: '🕯️', desc: 'Three ivory pillars on a marble tray. Dinner-party ready.', build: pillarTrio, use: { type: 'candle', burn: 2400, flame: [-0.06, 0.17, 0.04], scent: 'Unscented' } }),
  D({ id: 'candle_black_fig', name: 'Black Fig & Cedar Candle', price: 78, stores: ['luxe', 'glow'], rarity: 'uncommon', emoji: '🕯️', desc: 'Smoked glass, gilt label, notes of ripe fig and cedarwood. Very fancy hotel lobby.', build: () => jarCandle({ key: 'fig', glass: '#1b1b1d', opacity: 0.85, wax: '#2b2a2a', label: 'FIGUIER', sub: 'fig · cedar · musk', accent: '#c9a35c', labelBg: '#151515', h: 0.11, r: 0.05 }), use: { type: 'candle', burn: 3600, flame: [0, 0.11, 0], scent: 'Black Fig & Cedar' } }),
  D({ id: 'candle_sea_salt', name: 'Sea Salt Three-Wick Candle', price: 36, stores: ['glow', 'nestly'], emoji: '🌊', desc: 'Three wicks in a glazed ceramic bowl. Sea salt, driftwood and a little sunshine.', build: bowlCandle, use: { type: 'candle', burn: 2700, flame: [0, 0.08, 0], scent: 'Sea Salt & Driftwood' } }),
  D({ id: 'candle_fireside_pine', name: 'Fireside Pine Candle', price: 22, stores: ['nestly', 'primo', 'glow'], season: 'winter', emoji: '🌲', desc: 'Balsam fir, clove and woodsmoke in a festive red jar. Snow day in a candle.', build: () => jarCandle({ key: 'pine', glass: '#9b1d20', opacity: 0.75, wax: '#f4efe6', label: 'FIRESIDE', sub: 'pine · clove · smoke', accent: '#1f4d36', labelBg: '#f4efe6' }), use: { type: 'candle', burn: 3000, flame: [0, 0.1, 0], scent: 'Fireside Pine' } }),

  // ---------------------------------------------------------- scent & air
  D({ id: 'diffuser_wood', name: 'Woodgrain Aroma Diffuser', price: 39, stores: ['glow', 'nestly'], emoji: '🌫️', desc: 'Ultrasonic mist with a warm glow ring. Add drops, breathe out.', build: woodDiffuser, use: { type: 'diffuser', buff: 'calm', mist: '#ffffff' } }),
  D({ id: 'humidifier_cloud', name: 'Little Cloud Humidifier', price: 45, stores: ['primo', 'volt', 'glow'], emoji: '☁️', desc: 'A smiling cloud that puffs cool mist. Your skin and your plants say thanks.', build: cloudHumidifier, use: { type: 'diffuser', buff: 'freshRoom', mist: '#e8f6ff' } }),
  D({ id: 'diffuser_reed', name: 'Amber Reed Diffuser', price: 32, stores: ['glow', 'nestly', 'luxe'], emoji: '🎋', desc: 'Rattan reeds wicking amber & sea salt oil. Flip them weekly.', build: reedDiffuser, use: admire(['You flip the reeds. A fresh waft of amber fills the air.', 'Smells like a boutique hotel. Nice.'], { verb: 'Flip the reeds' }) }),

  // ---------------------------------------------------------- clocks
  D({ id: 'clock_wall_minimal', name: 'Minimal Wall Clock', price: 35, stores: ['nestly', 'primo'], place: 'wall', emoji: '🕰️', desc: 'Silent sweep movement, clean face, zero ticking at 3 AM.', build: () => wallClockMinimal({}), use: { type: 'clock' } }),
  D({ id: 'clock_wall_sage', name: 'Sage Wall Clock', price: 39, stores: ['nestly'], place: 'wall', emoji: '🕰️', desc: 'The minimal clock in a soft sage rim with a cream face.', build: () => wallClockMinimal({ rim: '#8fa58a', face: '#f7f1e6' }), use: { type: 'clock' } }),
  D({ id: 'clock_wall_sunburst', name: 'Gilded Sunburst Clock', price: 159, stores: ['nestly', 'luxe'], rarity: 'uncommon', place: 'wall', emoji: '☀️', desc: 'Mid-century starburst rays in brushed gold. Time, but glamorous.', build: sunburstClock, use: { type: 'clock' } }),
  D({ id: 'clock_wall_cat', name: 'Tick-Tock Cat Clock', price: 45, stores: ['nestly', 'primo'], place: 'wall', emoji: '🐈‍⬛', desc: 'A grinning retro cat with a bow tie and a swishy tail. Judges your schedule.', build: catClock, use: { type: 'clock' } }),
  D({ id: 'clock_flip', name: 'Retro Flip Clock', price: 49, stores: ['volt', 'nestly'], emoji: '⏱️', desc: 'Satisfying flip-card digits that show the real time.', build: flipClock, use: { type: 'clock' } }),
  D({ id: 'clock_grandfather', name: 'Walnut Grandfather Clock', price: 2400, stores: ['luxe'], rarity: 'rare', furniture: true, place: 'floor', emoji: '🕰️', desc: 'Two metres of carved walnut, brass pendulum and Westminster dignity.', build: grandfatherClock, use: { type: 'clock' } }),

  // ---------------------------------------------------------- neon
  neonDef({ id: 'neon_cozy', name: '"cozy" Neon Sign', price: 79, color: '#ffb26b', desc: 'Warm amber script that says exactly how you feel.', build: () => neonWord(['cozy'], '#ffb26b', 0.11) }),
  neonDef({ id: 'neon_heart', name: 'Pink Heart Neon', price: 69, color: '#ff4fa3', desc: 'A hot-pink heart that buzzes softly. Love, but make it electric.', build: () => neonShape([{ pts: heartPts(0.17), color: '#ff4fa3' }, { pts: heartPts(0.11, 0, 0.005), color: '#ff9fd0', r: 0.005 }], 0.42, 0.4) }),
  neonDef({ id: 'neon_moon', name: 'Moon & Star Neon', price: 75, color: '#9fd8ff', stores: ['volt', 'nestly', 'kollectiv'], desc: 'A dreamy crescent moon with a twinkly star for bedroom walls.', build: () => neonShape([{ pts: moonPts(), color: '#9fd8ff' }, { pts: starPts(0.15, 0.1, 0.06, 0.025), color: '#ffe680', r: 0.005 }], 0.48, 0.44) }),
  neonDef({ id: 'neon_dnd', name: '"do not disturb" Neon', price: 89, color: '#ff3b3b', desc: 'Red two-line script for gaming sessions, naps and introvert hours.', build: () => neonWord(['do not', 'disturb'], '#ff3b3b', 0.075) }),
  neonDef({ id: 'neon_good_vibes', name: '"good vibes" Neon', price: 89, color: '#ff5ec8', desc: 'Magenta script with major beach-bar-in-your-living-room energy.', build: () => neonWord(['good', 'vibes'], '#ff5ec8', 0.085) }),
  neonDef({ id: 'neon_game_on', name: '"game on" Neon + Bolt', price: 99, color: '#5ef0ff', rarity: 'uncommon', desc: 'Electric cyan script with a lightning bolt. Required for streamer credibility.', build: () => { const g = neonWord(['game on'], '#5ef0ff', 0.085); g.children[0].position.x -= 0.05; const b = tube(boltPts.map(([x, y]) => [x * 0.5 + 0.295, y * 0.5, 0.03]), 0.006, neonMat('#ffe14d'), 24, 6, true, { cast: false }); b.userData.neon = true; g.add(b); return g; } }),

  // ---------------------------------------------------------- aquariums
  D({ id: 'aquarium_nano', name: 'Nano Aquarium', price: 129, stores: ['primo', 'volt'], emoji: '🐠', desc: 'A 30-litre tank with a betta, a goldfish and a neon tetra. Feed them daily.', build: nanoTank, use: { type: 'aquarium' } }),
  D({ id: 'aquarium_reef', name: 'Reef Aquarium & Cabinet', price: 1899, stores: ['luxe'], rarity: 'epic', furniture: true, place: 'floor', emoji: '🐡', desc: 'A glowing coral reef with clownfish and a blue tang. Living room, meet ocean.', build: reefTank, use: { type: 'aquarium' } }),

  // ---------------------------------------------------------- projectors
  D({ id: 'projector_galaxy', name: 'Galaxy Star Projector', price: 39, stores: ['volt', 'primo'], emoji: '🌌', desc: 'Covers your ceiling in a slow-turning nebula. Bedtime: upgraded.', build: galaxyProjector, use: { type: 'projector', colors: ['#7b5cff', '#3fd2ff', '#ff5ec8', '#ffffff'] } }),
  D({ id: 'projector_astronaut', name: 'Astronaut Aurora Projector', price: 59, stores: ['volt', 'primo'], rarity: 'uncommon', emoji: '👩‍🚀', desc: 'A tiny spacefarer who beams green aurora and stars from their visor.', build: astronautProjector, use: { type: 'projector', colors: ['#3dffb0', '#3fd2ff', '#b8f2c9', '#ffffff'] } }),

  // ---------------------------------------------------------- fans & air
  D({ id: 'fan_desk_retro', name: 'Retro Oscillating Desk Fan', price: 45, stores: ['primo', 'volt', 'nestly'], emoji: '🌀', desc: 'Mint enamel and chrome, oscillates gently. Summer survival tool.', build: () => deskFan({}), use: { type: 'fan' } }),
  D({ id: 'fan_tower', name: 'Slim Tower Fan', price: 89, stores: ['volt', 'primo'], furniture: true, place: 'floor', emoji: '🌬️', desc: 'Quiet, oscillating, takes up no room. Breeze on demand.', build: towerFan, use: { type: 'fan' } }),
  D({ id: 'air_purifier', name: 'PureAir HEPA Purifier', price: 199, stores: ['volt', 'primo'], furniture: true, place: 'floor', brand: 'PureAir', emoji: '🍃', desc: 'True HEPA filter, whisper-quiet. The green ring means the air is chef\'s kiss.', build: airPurifier, use: { type: 'fan', sound: 'hum' } }),

  // ---------------------------------------------------------- robot vacuum
  D({ id: 'robot_vacuum', name: 'Roomie Robot Vacuum', price: 299, stores: ['volt', 'primo'], brand: 'Roomie', emoji: '🤖', desc: 'Bumps around cleaning so you don\'t have to. Sometimes gets stuck under the sofa.', build: robotVacuum, use: { type: 'vacuum' } }),

  // ---------------------------------------------------------- vases & sculpture
  D({ id: 'vase_bud_trio', name: 'Coloured Glass Bud Vases', price: 29, stores: ['nestly', 'primo'], tags: ['glass'], emoji: '🌼', desc: 'Three tinted bud vases with a daisy, a tulip and a sprig of greenery.', build: budVases, use: admire(['Three tiny flowers doing big emotional labour.', 'The light through the tinted glass is gorgeous.']) }),
  D({ id: 'vase_pampas', name: 'Pampas Grass Vase', price: 59, stores: ['nestly'], emoji: '🌾', desc: 'Fluffy dried pampas plumes in a cream ceramic vase. Boho mandatory.', build: pampasVase, use: admire(['Fluffy. So fluffy.', 'It sheds a little. Worth it.', 'Your apartment just gained 30 aesthetic points.']) }),
  D({ id: 'vase_bubble_terracotta', name: 'Wavy Terracotta Vase', price: 49, stores: ['nestly', 'arthaus'], emoji: '🏺', desc: 'Hand-thrown with playful ripples. Beautiful empty, better with stems.', build: () => bubbleVase({}), use: admire(['The ripples catch the light like a pond.', 'Handmade — no two are the same.']) }),
  D({ id: 'vase_bubble_blue', name: 'Wavy Cobalt Vase', price: 49, stores: ['nestly'], emoji: '🏺', desc: 'The same rippled vase, glazed in deep cobalt.', build: () => bubbleVase({ color: '#2f4f8f' }), use: admire(['A little wave frozen in clay.', 'Cobalt and cream: always a win.']) }),
  D({ id: 'vase_amphora', name: 'Terracotta Amphora', price: 159, stores: ['luxe', 'nestly'], rarity: 'uncommon', emoji: '🏺', desc: 'A big two-handled amphora with painted bands. Mediterranean villa, downtown edition.', build: amphora, use: admire(['You half expect to find olive oil inside.', 'Ancient Greek influencer vibes.']) }),
  D({ id: 'sculpture_knot', name: 'Brass Infinity Knot', price: 89, stores: ['nestly', 'luxe'], emoji: '➰', desc: 'A polished brass trefoil knot on a black marble plinth. Mathematically elegant.', build: knotSculpture, use: admire(['You try to follow the loop. You lose track. Zen.', 'It has no beginning and no end. Like your to-do list.']) }),
  D({ id: 'sculpture_stones', name: 'Balanced Stone Cairn', price: 35, stores: ['nestly', 'glow'], emoji: '🪨', desc: 'Five polished river stones stacked in perfect calm.', build: stackedStones, use: admire(['Perfectly balanced, as all things should be.', 'Breathe in. Breathe out. Don\'t bump the table.'], { verb: 'Contemplate' }) }),
  D({ id: 'bookends_marble_arch', name: 'Marble Arch Bookends', price: 39, stores: ['nestly', 'arthaus'], emoji: '📚', desc: 'Two hefty marble arches holding up a row of good intentions.', build: archBookends, use: admire(['The books stand tall. Unread, but tall.', 'Architectural AND literary.']) }),
  D({ id: 'bowl_decor_orbs', name: 'Decorative Bowl & Orbs', price: 45, stores: ['nestly', 'primo'], emoji: '🥣', desc: 'A dark lacquer bowl with a moss ball, a brass orb and a wooden sphere.', build: orbBowl, use: admire(['You roll the brass orb around. Satisfying.', 'It holds nothing useful. That\'s the point.']) }),
  D({ id: 'disco_ball', name: 'Mini Disco Ball', price: 34, stores: ['primo', 'volt', 'nestly'], emoji: '🪩', desc: 'Four hundred tiny mirrors on a stand. Saturday night, permanently.', build: discoBall, use: admire(['You give it a spin. Sparkles everywhere.', 'Dance break? Dance break.', 'It catches the light and throws it around the room.'], { verb: 'Spin it' }) }),
  D({ id: 'lucky_cat', name: 'Lucky Waving Cat', price: 19, stores: ['primo', 'nestly'], emoji: '🐱', desc: 'A ceramic maneki-neko holding a gold coin. Beckons good fortune (and customers).', build: luckyCat, use: admire(['It waves at you. You wave back.', 'Good fortune incoming. Probably.', 'The gold coin says "10 million ryō". Nice.'], { verb: 'Pat for luck' }) }),
  D({ id: 'mushroom_ceramics', name: 'Ceramic Mushroom Trio', price: 24, stores: ['nestly', 'arthaus'], emoji: '🍄', desc: 'Three glazed toadstools for shelves, windowsills and cottagecore dreams.', build: ceramicMushrooms, use: admire(['A tiny forest floor on your shelf.', 'Cottagecore achieved.']) }),
  D({ id: 'books_coffee_table', name: 'Coffee Table Book Stack', price: 49, stores: ['nestly', 'arthaus'], emoji: '📖', desc: 'Three oversized art books and a brass sphere. Signals taste; requires no reading.', build: bookStack, use: admire(['"Interiors of Copenhagen". You flip a page. Gorgeous.', 'They make you look cultured from across the room.'], { verb: 'Leaf through' }) }),
  D({ id: 'globe_desk', name: 'Vintage Desk Globe', price: 59, stores: ['nestly', 'arthaus'], emoji: '🌍', desc: 'A sepia-toned globe on a walnut base. Spin it and pick your next trip.', build: deskGlobe, use: admire(['You spin it and stop it with a finger: somewhere very far away.', 'Wanderlust intensifies.'], { verb: 'Spin the globe' }) }),

  // ---------------------------------------------------------- soft things
  D({ id: 'pillow_checker', name: 'Checkerboard Throw Pillow', price: 29, stores: ['nestly', 'primo'], tags: ['soft'], emoji: '🟩', desc: 'Sage and cream checks. Adds instant personality to any sofa.', build: () => pillow({ m: mat('#ffffff', { map: checkerTex('#9cae9b', '#f3ece0', 'sage'), rough: 1, sheen: 0.6 }) }), use: admire(['Fluffed. Perfect.', 'It\'s giving 2020s apartment tour.'], { squish: true, verb: 'Fluff' }) }),
  D({ id: 'pillow_mushroom', name: 'Mushroom Plush Pillow', price: 34, stores: ['nestly', 'kollectiv'], tags: ['soft'], emoji: '🍄', desc: 'A squishy toadstool with a tiny smile. Huggable cottagecore.', build: mushroomPillow, use: admire(['It\'s smiling at you!', 'The softest fungus you\'ll ever meet.'], { squish: true, verb: 'Boop' }) }),
  D({ id: 'pillow_velvet_tassel', name: 'Velvet Tassel Lumbar Pillow', price: 39, stores: ['nestly', 'luxe'], tags: ['soft'], emoji: '🛋️', desc: 'Sage velvet with jute tassels. Lumbar support, but make it elegant.', build: tasselPillow, use: admire(['You karate-chop the top. Designer pillow achieved.', 'So plush.'], { squish: true, verb: 'Chop' }) }),
  D({ id: 'blanket_chunky_knit', name: 'Chunky Knit Throw', price: 89, stores: ['nestly', 'luxe'], tags: ['soft'], emoji: '🧶', desc: 'Giant hand-knit loops of merino. Weighs about as much as a cat. Twice as cozy.', build: () => chunkyBlanket({}), use: admire(['You run your hand over the giant loops. Bliss.', 'Officially the coziest object you own.'], { squish: true }) }),
  D({ id: 'blanket_chunky_blush', name: 'Blush Chunky Knit Throw', price: 89, stores: ['nestly'], tags: ['soft'], emoji: '🧶', desc: 'The same giant merino loops in a soft blush pink.', build: () => chunkyBlanket({ color: '#e8c1bd' }), use: admire(['Pink, puffy, perfect.', 'A blanket that doubles as a mood.'], { squish: true }) }),
  D({ id: 'basket_blankets', name: 'Woven Blanket Basket', price: 69, stores: ['nestly', 'primo'], tags: ['soft'], furniture: true, place: 'floor', emoji: '🧺', desc: 'A seagrass basket with two rolled throws. Movie night is always prepared.', build: blanketBasket, use: admire(['Two blankets, ready for deployment.', 'Organised AND cozy.'], { squish: true }) }),

  // ---------------------------------------------------------- mirrors (decorative, not reflective)
  D({ id: 'mirror_arched_floor', name: 'Arched Floor Mirror', price: 249, stores: ['nestly', 'primo'], furniture: true, place: 'floor', emoji: '🪞', desc: 'A tall slim black arch that leans against the wall and bounces light around.', build: archMirror, use: admire(['Looking good. Seriously.', 'Outfit check: passed.', 'The room looks twice as big. Mirror magic.'], { verb: 'Check yourself out' }) }),
  D({ id: 'mirror_sunburst', name: 'Sunburst Wall Mirror', price: 149, stores: ['nestly', 'luxe'], place: 'wall', emoji: '🪞', desc: 'A round convex mirror ringed in golden rays. Hollywood Regency charm.', build: sunburstMirror, use: admire(['A little sun on your wall.', 'Your reflection looks extra glamorous in gold.'], { verb: 'Check yourself out' }) }),
  D({ id: 'mirror_wavy', name: 'Squiggle Mirror', price: 189, stores: ['nestly', 'arthaus'], rarity: 'uncommon', place: 'wall', emoji: '🪞', desc: 'A wavy mirror on a bubblegum-pink backing. The most photographed thing you\'ll own.', build: wavyMirror, use: admire(['Mirror selfie time.', 'The squiggles make everything feel playful.'], { verb: 'Take a mirror selfie' }) }),
]);

void cone; void plane; void disc;
