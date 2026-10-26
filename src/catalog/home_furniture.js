// Catalogue: home furniture — sofas, seating, tables, beds, storage & display, rugs.
// Conventions: meters, origin bottom-center, front +Z (wall shelves: back-center at z=0).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, lathe, tube, extrude, shapeExtrude, at, rot, group, plane, decal, FONT } from '../items/kit.js';
import { fabric, canvas, toTexture, cached, marble } from '../core/textures.js';
import { seeded } from '../core/utils.js';
import { rugTexture, bookSpines } from './core_furniture.js';
import { bottle, glassTumbler, sneaker } from './shared.js';

// ------------------------------------------------------------------ helpers
const GEO = new Map();
function sharedGeo(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set(key, g); }
  return g;
}
function meshOf(geo, m, { cast = true, receive = true } = {}) {
  const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = receive; return o;
}
// merge many small primitives (buttons, slats, flutes) into one cached mesh
function merged(key, m, make) { return meshOf(sharedGeo('hf:' + key, () => mergeGeometries(make())), m); }
const noRay = (o) => { o.raycast = () => {}; return o; }; // purely visual (glass doors you reach through)

const velvet = (c) => mat(c, { rough: 0.62, sheen: 1, map: fabric({ base: '#ffffff', seed: 6, scale: 2 }) });
const blackMetal = () => mat('#1d1d1f', { rough: 0.35, metal: 0.75 });
const brass = () => mat('#c9a35c', { rough: 0.25, metal: 1 });
const lacquer = (c) => mat(c, { rough: 0.28, clearcoat: 0.7 });
const clearGlass = () => mat('#e8f4f6', { rough: 0.04, opacity: 0.22, transparent: true, envInt: 1.5, depthWrite: false });

function caneTex() {
  return cached('hf:cane', () => {
    const S = 128; const c = canvas(S, S); const ctx = c.getContext('2d');
    ctx.fillStyle = '#4a3420'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#e4c896'; ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    for (let i = 0; i <= S; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.strokeStyle = '#d6b680';
    for (let i = -S; i <= S * 2; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, S); ctx.lineTo(i + S, 0); ctx.stroke(); }
    return toTexture(c, { repeat: [5, 3] });
  });
}
function rattanTex() {
  return cached('hf:rattan', () => {
    const S = 128; const c = canvas(S, S); const ctx = c.getContext('2d');
    ctx.fillStyle = '#8a6438'; ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 16) {
      const off = (y / 8) % 2 ? 8 : 0;
      const g = ctx.createLinearGradient(x + off, y, x + off, y + 8);
      g.addColorStop(0, '#c99a5e'); g.addColorStop(0.5, '#e2b77a'); g.addColorStop(1, '#a87c46');
      ctx.fillStyle = g; ctx.fillRect(x + off + 1, y + 1, 14, 6);
    }
    return toTexture(c, { repeat: [8, 6] });
  });
}
function travertineTex() {
  return cached('hf:travertine', () => {
    const S = 256; const c = canvas(S, S); const ctx = c.getContext('2d'); const rnd = seeded(31);
    ctx.fillStyle = '#e3d5bf'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${170 + rnd() * 40},${150 + rnd() * 30},${120 + rnd() * 30},0.25)`; ctx.fillRect(0, rnd() * S, S, 1 + rnd() * 5); }
    for (let i = 0; i < 160; i++) { ctx.fillStyle = 'rgba(140,115,85,0.45)'; ctx.beginPath(); ctx.ellipse(rnd() * S, rnd() * S, 1 + rnd() * 5, 0.6 + rnd() * 1.2, 0, 0, 7); ctx.fill(); }
    return toTexture(c);
  });
}
const marbleMat = (base = '#f2efe9', vein = '#8f8a84', seed = 4) => mat('#ffffff', { map: marble({ base, vein, seed }), rough: 0.18, clearcoat: 0.6 });

function taperLegs(pts, h, m, rTop = 0.022, rBot = 0.013, splay = 0) {
  return pts.map(([x, z]) => {
    const l = cyl(rTop, rBot, h, m, 10);
    l.rotation.set(z * splay, 0, -x * splay);
    return at(l, x, h / 2, z);
  });
}
function bunFeet(pts, m, r = 0.045) { return pts.map(([x, z]) => { const f = sph(r, m, 12, 8); f.scale.y = 0.9; return at(f, x, r * 0.9, z); }); }

// ------------------------------------------------------------------ sofas
function sectional({ color = '#b9b3a8', W = 2.8, D = 1.65 } = {}) {
  const f = MAT.fabric(color);
  const g = new THREE.Group();
  const md = 0.95, zb = -D / 2, cw = 0.95;
  g.add(at(rbox(W - cw, 0.22, md, 0.04, f), -cw / 2, 0.2, zb + md / 2));
  g.add(at(rbox(cw, 0.22, D, 0.04, f), W / 2 - cw / 2, 0.2, 0));
  g.add(at(rbox(W - 0.36, 0.5, 0.24, 0.08, f), 0, 0.55, zb + 0.12));
  g.add(at(rbox(0.2, 0.42, md, 0.07, f), -W / 2 + 0.1, 0.4, zb + md / 2));
  g.add(at(rbox(0.2, 0.42, D, 0.07, f), W / 2 - 0.1, 0.4, 0));
  const L1 = W - 0.2 - cw, cwid = L1 / 2;
  for (let i = 0; i < 2; i++) g.add(at(rbox(cwid - 0.02, 0.14, 0.66, 0.06, f), -W / 2 + 0.2 + cwid * (i + 0.5), 0.43, zb + 0.58));
  g.add(at(rbox(cw - 0.22, 0.14, D - 0.3, 0.06, f), W / 2 - 0.2 - (cw - 0.2) / 2, 0.43, 0.1));
  const bw = (W - 0.4) / 3;
  for (let i = 0; i < 3; i++) { const b = rbox(bw - 0.04, 0.44, 0.17, 0.08, f); b.rotation.x = -0.12; g.add(at(b, -W / 2 + 0.2 + bw * (i + 0.5), 0.67, zb + 0.32)); }
  g.add(at(rot(rbox(0.4, 0.4, 0.12, 0.06, MAT.knit('#d98c5f')), -0.15, 0.3, 0.12), -W / 2 + 0.45, 0.66, zb + 0.42));
  g.add(at(rot(rbox(0.38, 0.38, 0.12, 0.06, velvet('#3f5e5a')), -0.12, -0.25, -0.1), W / 2 - 0.45, 0.66, zb + 0.42));
  g.add(at(rot(rbox(0.36, 0.36, 0.12, 0.06, MAT.fabric('#f1ece2')), -0.14, 0.1, 0.05), W / 2 - 0.85, 0.65, zb + 0.4));
  const dark = mat('#2a2522', { rough: 0.6 });
  for (const [x, z] of [[-W / 2 + 0.08, zb + 0.08], [-W / 2 + 0.08, zb + md - 0.08], [W / 2 - 0.08, zb + 0.08], [W / 2 - 0.08, D / 2 - 0.08], [W / 2 - cw + 0.08, D / 2 - 0.08], [0, zb + 0.08]]) g.add(at(box(0.05, 0.09, 0.05, dark), x, 0.045, z));
  return g;
}

function loveseat({ color = '#d39b2a' } = {}) {
  const f = velvet(color);
  const W = 1.5, D = 0.86;
  const g = group(
    at(rbox(W - 0.1, 0.2, D, 0.05, f), 0, 0.27, 0),
    at(rbox(W - 0.12, 0.48, 0.2, 0.08, f), 0, 0.6, -D / 2 + 0.1),
  );
  for (const s of [-1, 1]) {
    g.add(at(rbox(0.17, 0.3, D - 0.02, 0.07, f), s * (W / 2 - 0.085), 0.47, 0));
    g.add(at(rot(cyl(0.105, 0.105, D - 0.02, f, 20), Math.PI / 2, 0, 0), s * (W / 2 - 0.075), 0.62, 0));
  }
  const cw = (W - 0.34) / 2;
  for (let i = 0; i < 2; i++) g.add(at(rbox(cw - 0.01, 0.13, D - 0.28, 0.06, f), -cw / 2 + i * cw, 0.43, 0.07));
  const pts = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) pts.push([-0.48 + c * 0.24 + (r ? 0.12 : 0), 0.62 + r * 0.16, -D / 2 + 0.205]);
  g.add(merged('loveseatButtons', mat(color, { rough: 0.5 }), () => pts.filter((p) => Math.abs(p[0]) < 0.6).map(([x, y, z]) => new THREE.SphereGeometry(0.014, 8, 6).translate(x, y, z))));
  g.add(at(rot(rbox(0.38, 0.38, 0.12, 0.06, MAT.knit('#f4efe6')), -0.15, 0.2, 0.1), 0.38, 0.66, -0.2));
  for (const p of taperLegs([[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]], 0.18, MAT.wood('#5a3a24'), 0.02, 0.012, 0.25)) g.add(p);
  return g;
}

function futon({ color = '#3e5c76' } = {}) {
  const wood = MAT.wood('#c49a6c');
  const f = MAT.fabric(color);
  const W = 1.95, D = 0.9;
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.03);
    g.add(at(box(0.05, 0.62, 0.05, wood), x, 0.31, -D / 2 + 0.05), at(box(0.05, 0.55, 0.05, wood), x, 0.275, D / 2 - 0.06));
    g.add(at(rbox(0.07, 0.04, D, 0.01, wood), x, 0.57, 0), at(box(0.04, 0.05, D - 0.1, wood), x, 0.12, 0));
    for (let k = 0; k < 3; k++) g.add(at(box(0.02, 0.32, 0.05, wood), x, 0.36, -0.2 + k * 0.2));
  }
  g.add(at(box(W - 0.08, 0.04, D - 0.1, wood), 0, 0.27, 0.0));
  g.add(at(rbox(W - 0.1, 0.16, 0.74, 0.06, f), 0, 0.36, 0.06));
  const back = rbox(W - 0.1, 0.16, 0.7, 0.06, f); back.rotation.x = -1.25; g.add(at(back, 0, 0.7, -D / 2 + 0.12));
  const tufts = [];
  for (let i = 0; i < 6; i++) { tufts.push([-0.75 + i * 0.3, 0.442, 0.06]); tufts.push([-0.75 + i * 0.3, 0.72, -D / 2 + 0.2]); }
  g.add(merged('futonTufts', mat('#2a3d50', { rough: 0.8 }), () => tufts.map(([x, y, z]) => new THREE.SphereGeometry(0.012, 6, 4).translate(x, y, z))));
  g.add(at(rot(rbox(0.36, 0.36, 0.12, 0.06, MAT.fabric('#e9c46a')), -0.3, 0.3, 0.1), -0.6, 0.62, -0.18));
  return g;
}

function chesterfield({ color = '#5e1b1b' } = {}) {
  const f = mat(color, { rough: 0.42, clearcoat: 0.35 });
  const W = 2.1, D = 0.92;
  const g = group(
    at(rbox(W, 0.28, D, 0.05, f), 0, 0.24, 0),
    at(rbox(W - 0.1, 0.44, 0.24, 0.06, f), 0, 0.6, -D / 2 + 0.12),
    at(rot(cyl(0.11, 0.11, W - 0.36, f, 20), 0, 0, Math.PI / 2), 0, 0.82, -D / 2 + 0.13),
  );
  for (const s of [-1, 1]) {
    g.add(at(rbox(0.24, 0.44, D, 0.06, f), s * (W / 2 - 0.12), 0.6, 0));
    g.add(at(rot(cyl(0.13, 0.13, D, f, 20), Math.PI / 2, 0, 0), s * (W / 2 - 0.1), 0.8, 0));
    g.add(at(rot(cyl(0.135, 0.135, 0.02, f, 20), Math.PI / 2, 0, 0), s * (W / 2 - 0.1), 0.8, D / 2));
  }
  for (let i = 0; i < 3; i++) g.add(at(rbox((W - 0.5) / 3 - 0.01, 0.13, D - 0.3, 0.05, f), -(W - 0.5) / 3 + i * (W - 0.5) / 3, 0.44, 0.1));
  const pts = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) { const x = -0.78 + c * 0.195 + (r % 2 ? 0.0975 : 0); if (Math.abs(x) < 0.82) pts.push([x, 0.56 + r * 0.1, -D / 2 + 0.243]); }
  for (const s of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) pts.push([s * (W / 2 + 0.001), 0.48 + r * 0.12, -0.25 + c * 0.25 + (r ? 0.125 : 0)]);
  g.add(merged('chesterButtons', mat(color, { rough: 0.3, clearcoat: 0.5 }), () => pts.map(([x, y, z]) => new THREE.SphereGeometry(0.013, 8, 6).translate(x, y, z))));
  for (const p of bunFeet([[-0.95, -0.36], [0.95, -0.36], [-0.95, 0.36], [0.95, 0.36]], MAT.wood('#3a2416'), 0.05)) g.add(p);
  return g;
}

function curveSofa({ color = '#efe7da' } = {}) {
  const f = MAT.knit(color);
  const g = new THREE.Group();
  const R = 1.7, arc = 1.9, N = 7, zc = 1.07;
  const seg = (rr, len, h, d, y, rad) => {
    for (let i = 0; i < N; i++) {
      const th = -arc / 2 + arc * (i + 0.5) / N;
      const m = rbox(len, h, d, rad, f);
      m.position.set(rr * Math.sin(th), y, zc - rr * Math.cos(th)); m.rotation.y = -th;
      g.add(m);
    }
  };
  const chord = (rr) => 2 * rr * Math.sin(arc / (2 * N)) + 0.06;
  seg(R - 0.47, chord(R - 0.47), 0.3, 0.9, 0.18, 0.08);
  seg(R - 0.13, chord(R - 0.13), 0.42, 0.24, 0.58, 0.1);
  g.add(at(rot(rbox(0.4, 0.4, 0.13, 0.06, velvet('#c46a4a')), -0.25, 0.35, 0.08), -0.45, 0.55, -0.27));
  g.add(at(rot(rbox(0.38, 0.38, 0.13, 0.06, MAT.knit('#9aa38a')), -0.25, -0.35, -0.08), 0.47, 0.55, -0.27));
  return g;
}

// ------------------------------------------------------------------ chairs
function barrelChair({ color = '#efe8dc' } = {}) {
  const f = MAT.knit(color);
  const g = group(at(cyl(0.38, 0.38, 0.32, f, 32), 0, 0.17, 0), at(cyl(0.34, 0.36, 0.13, f, 32), 0, 0.39, 0.02));
  const N = 6, arc = 3.6, R = 0.31;
  for (let i = 0; i < N; i++) {
    const th = -arc / 2 + arc * (i + 0.5) / N;
    const m = rbox(0.24, 0.42, 0.13, 0.06, f);
    m.position.set(R * Math.sin(th), 0.52, -R * Math.cos(th)); m.rotation.y = -th; g.add(m);
  }
  g.add(at(cyl(0.36, 0.37, 0.02, mat('#6b4a32', { rough: 0.5 }), 32), 0, 0.01, 0));
  return g;
}

function rockingChair() {
  const wood = MAT.wood('#8a5a3b');
  const g = new THREE.Group();
  const arc = 0.78, RR = 1.1;
  for (const s of [-1, 1]) {
    const r = torus(RR, 0.02, wood, 6, 28, arc);
    r.rotation.set(0, Math.PI / 2, -Math.PI / 2 - arc / 2);
    g.add(at(r, s * 0.25, RR + 0.02, 0));
    g.add(at(cyl(0.018, 0.02, 0.4, wood, 8), s * 0.23, 0.23, 0.18));
    const post = cyl(0.02, 0.022, 1.02, wood, 8); post.rotation.x = -0.16; g.add(at(post, s * 0.23, 0.55, -0.24));
    g.add(at(rbox(0.06, 0.03, 0.5, 0.012, wood), s * 0.26, 0.66, 0.02));
    g.add(at(cyl(0.014, 0.016, 0.22, wood, 8), s * 0.26, 0.54, 0.2));
  }
  g.add(at(rbox(0.5, 0.04, 0.46, 0.012, wood), 0, 0.43, 0.0));
  for (let i = 0; i < 5; i++) { const sp = cyl(0.009, 0.009, 0.5, wood, 6); sp.rotation.x = -0.16; g.add(at(sp, -0.16 + i * 0.08, 0.72, -0.27)); }
  const rail = rbox(0.52, 0.08, 0.03, 0.012, wood); rail.rotation.x = -0.16; g.add(at(rail, 0, 1.0, -0.31));
  g.add(at(rbox(0.44, 0.05, 0.4, 0.02, MAT.fabric('#a7b99e')), 0, 0.47, 0.02));
  const throwB = rbox(0.4, 0.42, 0.04, 0.015, MAT.knit('#e6d3b3')); throwB.rotation.x = -0.16; g.add(at(throwB, 0, 0.74, -0.24));
  return g;
}

function gamingChair({ main = '#d62839', dark = '#151517' } = {}) {
  const red = mat(main, { rough: 0.45, clearcoat: 0.3 });
  const blk = mat(dark, { rough: 0.55 });
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = box(0.32, 0.03, 0.045, blk); leg.rotation.y = a; leg.position.set(Math.cos(a) * 0.16, 0.07, -Math.sin(a) * 0.16); g.add(leg);
    g.add(at(sph(0.028, blk, 10, 8), Math.cos(a) * 0.31, 0.028, -Math.sin(a) * 0.31));
  }
  g.add(at(cyl(0.025, 0.03, 0.36, MAT.chrome(), 12), 0, 0.27, 0));
  g.add(at(rbox(0.5, 0.1, 0.5, 0.035, blk), 0, 0.5, 0.02));
  for (const s of [-1, 1]) g.add(at(rbox(0.07, 0.11, 0.48, 0.03, red), s * 0.25, 0.54, 0.02));
  // racing back: red shell with harness slots + black centre panel
  const sh = new THREE.Shape();
  sh.moveTo(-0.22, 0); sh.lineTo(0.22, 0); sh.lineTo(0.25, 0.45); sh.quadraticCurveTo(0.29, 0.6, 0.2, 0.66); sh.lineTo(0.17, 0.9);
  sh.quadraticCurveTo(0.16, 0.98, 0.08, 0.98); sh.lineTo(-0.08, 0.98); sh.quadraticCurveTo(-0.16, 0.98, -0.17, 0.9); sh.lineTo(-0.2, 0.66); sh.quadraticCurveTo(-0.29, 0.6, -0.25, 0.45); sh.lineTo(-0.22, 0);
  for (const s of [-1, 1]) { const h = new THREE.Path(); h.absellipse(s * 0.1, 0.74, 0.03, 0.05, 0, Math.PI * 2); sh.holes.push(h); }
  const back = group(at(shapeExtrude(sh, 0.09, red, 'gamingBack', 0.02), 0, 0, 0));
  back.add(at(rbox(0.26, 0.5, 0.03, 0.02, blk), 0, 0.3, 0.058));
  back.add(at(rbox(0.22, 0.1, 0.07, 0.04, blk), 0, 0.88, 0.07));
  back.add(at(rbox(0.28, 0.13, 0.08, 0.05, blk), 0, 0.18, 0.08));
  back.rotation.x = -0.13; back.position.set(0, 0.53, -0.22); g.add(back);
  for (const s of [-1, 1]) g.add(at(box(0.03, 0.2, 0.03, blk), s * 0.3, 0.62, -0.02), at(rbox(0.07, 0.035, 0.26, 0.012, blk), s * 0.3, 0.73, 0.02));
  return g;
}

function beanBag({ color = '#e8dcc8', knit = true } = {}) {
  const f = knit ? MAT.knit(color) : mat(color, { rough: 0.35, clearcoat: 0.3 });
  const g = group(lathe([[0, 0], [0.4, 0.01], [0.48, 0.1], [0.5, 0.22], [0.46, 0.34], [0.36, 0.42], [0.18, 0.38], [0, 0.34]], f, 36));
  const hump = sph(0.36, f, 28, 20); hump.scale.set(1.15, 0.85, 0.65); g.add(at(hump, 0, 0.45, -0.22));
  for (const s of [-1, 1]) { const arm = sph(0.16, f, 16, 12); arm.scale.set(0.8, 0.7, 1.3); g.add(at(arm, s * 0.34, 0.36, 0.0)); }
  return g;
}

function floorCushion({ color = '#c46a4a', vel = true } = {}) {
  const f = vel ? velvet(color) : MAT.fabric(color);
  const g = group(lathe([[0, 0], [0.3, 0], [0.36, 0.035], [0.375, 0.09], [0.36, 0.15], [0.3, 0.18], [0, 0.185]], f, 40));
  g.add(at(rot(torus(0.375, 0.008, mat(color, { rough: 0.5 }), 6, 48), Math.PI / 2, 0, 0), 0, 0.09, 0));
  const b = sph(0.025, mat(color, { rough: 0.4 }), 12, 8); b.scale.y = 0.5; g.add(at(b, 0, 0.183, 0));
  for (let i = 0; i < 4; i++) { const t = sph(0.007, mat('#e2c290', { rough: 0.6 }), 6, 4); g.add(at(t, Math.cos(i * 1.57) * 0.16, 0.168, Math.sin(i * 1.57) * 0.16)); }
  return g;
}

function eggChair() {
  const g = new THREE.Group();
  const metal = blackMetal();
  g.add(at(cyl(0.4, 0.43, 0.035, metal, 40), 0, 0.018, 0));
  g.add(tube([[0, 0.03, -0.36], [0, 0.8, -0.46], [0, 1.55, -0.42], [0, 1.95, -0.2], [0, 2.02, 0.02], [0, 1.96, 0.06]], 0.025, metal, 40, 10));
  g.add(at(cyl(0.006, 0.006, 0.28, MAT.metal('#8a8a8a'), 6), 0, 1.82, 0.06));
  const rattan = mat('#ffffff', { map: rattanTex(), rough: 0.75, side: THREE.DoubleSide });
  const R = 0.5, sy = 1.3, cy = 1.0;
  const lower = meshOf(sharedGeo('hf:eggLower', () => new THREE.SphereGeometry(R, 36, 12, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4)), rattan);
  const upper = meshOf(sharedGeo('hf:eggUpper', () => new THREE.SphereGeometry(R, 36, 18, Math.PI / 2 + 1.25, Math.PI * 2 - 2.5, 0, Math.PI * 0.6)), rattan);
  for (const m of [lower, upper]) { m.scale.set(1, sy, 1); m.position.set(0, cy, 0.06); g.add(m); }
  const rim = torus(R * Math.sin(Math.PI * 0.6), 0.018, mat('#b58a52', { rough: 0.6 }), 6, 40); rim.rotation.x = Math.PI / 2;
  g.add(at(rim, 0, cy + R * sy * Math.cos(Math.PI * 0.6), 0.06));
  const cush = MAT.fabric('#f1ece2');
  const seat = sph(0.32, cush, 24, 14); seat.scale.set(1, 0.3, 1); g.add(at(seat, 0, 0.57, 0.08));
  const back = rbox(0.5, 0.6, 0.15, 0.07, cush); back.rotation.x = -0.25; g.add(at(back, 0, 0.92, -0.2));
  g.add(at(rot(rbox(0.3, 0.3, 0.1, 0.05, MAT.knit('#c46a4a')), -0.2, 0.25, 0.1), 0.12, 0.72, -0.02));
  return g;
}

function papasan({ color = '#c96f53' } = {}) {
  const rattan = mat('#ffffff', { map: rattanTex(), rough: 0.75 });
  const g = group(
    at(cyl(0.3, 0.36, 0.3, rattan, 28, undefined, true), 0, 0.15, 0),
    at(rot(torus(0.33, 0.03, mat('#b58a52', { rough: 0.6 }), 8, 32), Math.PI / 2, 0, 0), 0, 0.3, 0),
  );
  const bowl = group(
    lathe([[0, 0], [0.25, 0.02], [0.5, 0.14], [0.62, 0.3], [0.64, 0.32], [0.6, 0.31], [0.48, 0.17], [0.25, 0.06], [0, 0.04]], rattan, 40),
    at(lathe([[0, 0], [0.3, 0.02], [0.5, 0.12], [0.58, 0.25], [0.55, 0.3], [0.45, 0.22], [0.25, 0.14], [0, 0.13]], MAT.fabric(color), 40), 0, 0.04, 0),
  );
  bowl.rotation.x = 0.32; bowl.position.set(0, 0.3, -0.04); g.add(bowl);
  g.add(at(rot(rbox(0.32, 0.32, 0.11, 0.05, MAT.knit('#f4efe6')), -0.5, 0.1, 0), 0, 0.62, -0.2));
  return g;
}

// ------------------------------------------------------------------ tables
function nestingTables() {
  const top = marbleMat('#f4f1ec', '#9d968c', 7);
  const b = brass();
  const g = new THREE.Group();
  const table = (r, h, x, z, ph) => {
    g.add(at(cyl(r, r, 0.022, top, 40), x, h - 0.011, z));
    g.add(at(rot(torus(r, 0.006, b, 6, 40), Math.PI / 2, 0, 0), x, h - 0.022, z));
    for (let i = 0; i < 3; i++) { const a = ph + i * Math.PI * 2 / 3; const l = cyl(0.008, 0.008, h - 0.02, b, 8); l.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08); g.add(at(l, x + Math.cos(a) * r * 0.8, (h - 0.02) / 2, z + Math.sin(a) * r * 0.8)); }
  };
  table(0.3, 0.5, -0.1, -0.05, 0.3);
  table(0.22, 0.4, 0.26, 0.16, 1.2);
  return g;
}

function consoleTable() {
  const wood = MAT.wood('#6e4a2f');
  const g = group(
    at(rbox(1.2, 0.035, 0.36, 0.01, wood), 0, 0.78, 0),
    at(rbox(1.1, 0.11, 0.32, 0.008, wood), 0, 0.7, 0),
    at(rbox(1.1, 0.025, 0.3, 0.008, wood), 0, 0.17, 0),
  );
  const front = mat('#5c3d26', { rough: 0.6, map: wood.map });
  for (const s of [-1, 1]) {
    g.add(at(box(0.52, 0.085, 0.01, front), s * 0.275, 0.7, 0.161));
    g.add(at(sph(0.012, brass(), 10, 8), s * 0.275, 0.7, 0.172));
  }
  for (const [x, z] of [[-0.57, -0.15], [0.57, -0.15], [-0.57, 0.15], [0.57, 0.15]]) g.add(at(cyl(0.02, 0.014, 0.76, wood, 8), x, 0.38, z));
  return g;
}

function glassCoffeeTable() {
  const b = brass();
  const W = 1.1, D = 0.6, H = 0.42;
  const g = group(at(rbox(W + 0.02, 0.012, D + 0.02, 0.004, MAT.glass('#dff1ee', 0.35)), 0, H + 0.006, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(box(0.02, H, 0.02, b), x * W / 2, H / 2, z * D / 2));
  for (const y of [H - 0.01, 0.12]) {
    for (const s of [-1, 1]) { g.add(at(box(W, 0.018, 0.018, b), 0, y, s * D / 2)); g.add(at(box(0.018, 0.018, D, b), s * W / 2, y, 0)); }
  }
  g.add(at(box(W - 0.02, 0.008, D - 0.02, MAT.glass('#dff1ee', 0.4)), 0, 0.13, 0));
  const books = bookSpines(4, 0.22, 77); books.rotation.z = Math.PI / 2; books.position.set(0.15, 0.135, 0.05); books.rotation.y = 0.2;
  g.add(books);
  return g;
}

function travertineTable() {
  const t = mat('#ffffff', { map: travertineTex(), rough: 0.7 });
  return group(at(cyl(0.5, 0.5, 0.06, t, 56), 0, 0.37, 0), at(cyl(0.3, 0.3, 0.34, t, 48), 0, 0.17, 0), at(cyl(0.285, 0.285, 0.01, mat('#a89070', { rough: 0.8 }), 40), 0, 0.341, 0));
}

function standingDesk() {
  const top = MAT.wood('#7b5236');
  const frame = mat('#e9e9ea', { rough: 0.35, metal: 0.5 });
  const g = group(at(rbox(1.4, 0.03, 0.7, 0.01, top), 0, 1.06, 0));
  for (const s of [-1, 1]) {
    g.add(at(box(0.075, 0.03, 0.66, frame), s * 0.58, 0.015, 0));
    g.add(at(box(0.075, 0.5, 0.055, frame), s * 0.58, 0.28, -0.02));
    g.add(at(box(0.064, 0.52, 0.046, frame), s * 0.58, 0.76, -0.02));
  }
  g.add(at(box(1.12, 0.04, 0.05, frame), 0, 1.02, -0.02));
  g.add(at(box(0.9, 0.08, 0.12, mat('#2b2b2b', { rough: 0.6 })), 0, 0.98, -0.24));
  const pad = rbox(0.12, 0.025, 0.05, 0.008, mat('#202020', { rough: 0.4 })); g.add(at(pad, 0.5, 1.03, 0.34));
  const disp = decal(0.04, 0.014, 'hf:deskdisp', (ctx, w, h) => { ctx.fillStyle = '#081018'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#5ef0ff'; ctx.font = `700 ${h * 0.8}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('109.5', w / 2, h / 2 + 1); }, { tw: 128, th: 44, emissive: true, ei: 1.4 });
  at(disp, 0.49, 1.03, 0.3651); g.add(disp);
  g.add(at(rbox(0.9, 0.004, 0.36, 0.01, mat('#d9cbb6', { rough: 1 }), { cast: false }), -0.05, 1.077, 0.12));
  return g;
}

function writingDesk() {
  const wood = MAT.wood('#9c6a43');
  const g = group(at(rbox(1.2, 0.03, 0.58, 0.01, wood), 0, 0.75, 0));
  g.add(at(rbox(0.42, 0.16, 0.54, 0.01, wood), 0.36, 0.655, 0));
  g.add(at(rbox(0.66, 0.08, 0.5, 0.008, wood), -0.2, 0.695, 0));
  const front = mat('#8a5b38', { rough: 0.5, map: wood.map });
  g.add(at(box(0.38, 0.13, 0.01, front), 0.36, 0.655, 0.272), at(box(0.62, 0.06, 0.01, front), -0.2, 0.695, 0.252));
  g.add(at(rbox(0.1, 0.014, 0.016, 0.005, brass()), 0.36, 0.67, 0.284), at(rbox(0.1, 0.014, 0.016, 0.005, brass()), -0.2, 0.695, 0.264));
  for (const p of taperLegs([[-0.54, -0.22], [0.54, -0.22], [-0.54, 0.22], [0.54, 0.22]], 0.6, wood, 0.022, 0.014, 0.12)) g.add(p);
  return g;
}

// ------------------------------------------------------------------ beds
function bedLinens(g, W, L, y, duvetC, pillowC, throwC, nPillows = 2) {
  const duv = rbox(W + 0.04, 0.09, L * 0.66, 0.04, MAT.fabric(duvetC)); duv.name = 'duvet'; g.add(at(duv, 0, y + 0.04, L * 0.16));
  const fold = rbox(W + 0.05, 0.1, 0.22, 0.045, MAT.fabric(duvetC)); fold.name = 'duvet'; g.add(at(fold, 0, y + 0.06, -L * 0.18));
  for (let i = 0; i < nPillows; i++) {
    const x = nPillows === 1 ? 0 : -W / 2 + W * (i + 0.5) / nPillows;
    const p = rbox(Math.min(0.62, W / nPillows - 0.06), 0.14, 0.38, 0.07, MAT.fabric(pillowC)); p.name = 'pillow'; p.rotation.x = -0.25; g.add(at(p, x, y + 0.09, -L / 2 + 0.28));
  }
  if (throwC) g.add(at(rbox(W * 0.95, 0.03, 0.45, 0.012, MAT.knit(throwC)), 0, y + 0.095, L / 2 - 0.35));
}

function daybed() {
  const wood = MAT.wood('#e0c49c');
  const W = 1.0, L = 2.0;
  const g = group(at(rbox(W + 0.06, 0.12, L + 0.06, 0.02, wood), 0, 0.3, 0));
  for (const s of [-1, 1]) {
    g.add(at(rbox(W + 0.1, 0.06, 0.06, 0.02, wood), 0, 0.88, s * (L / 2 + 0.03)));
    for (const x of [-1, 1]) g.add(at(cyl(0.028, 0.028, 0.9, wood, 10), x * (W / 2 + 0.03), 0.45, s * (L / 2 + 0.03)));
  }
  g.add(at(rbox(0.05, 0.05, L + 0.06, 0.02, wood), -W / 2 - 0.03, 0.78, 0));
  g.add(merged('daybedSpindles', wood, () => {
    const out = [];
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) out.push(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 6).translate(-W / 2 + 0.1 + i * (W - 0.2) / 6, 0.6, s * (L / 2 + 0.03)));
    for (let i = 0; i < 13; i++) out.push(new THREE.CylinderGeometry(0.011, 0.011, 0.42, 6).translate(-W / 2 - 0.03, 0.57, -L / 2 + 0.12 + i * (L - 0.24) / 12));
    return out;
  }));
  const mattress = rbox(W, 0.18, L - 0.04, 0.05, mat('#f4f4f2', { rough: 0.9 })); mattress.name = 'sheet'; g.add(at(mattress, 0, 0.45, 0));
  bedLinens(g, W, L, 0.5, '#e8c7b8', '#f7f2ea', null, 1);
  for (const s of [-1, 1]) { const b = cyl(0.11, 0.11, W - 0.12, MAT.fabric('#b5838d'), 20); b.rotation.z = Math.PI / 2; g.add(at(b, 0, 0.65, s * (L / 2 - 0.14))); }
  for (const p of taperLegs([[-0.5, -0.97], [0.5, -0.97], [-0.5, 0.97], [0.5, 0.97]], 0.24, wood, 0.03, 0.03)) g.add(p);
  return g;
}

function curtainGeo() {
  return sharedGeo('hf:drape', () => {
    const geo = new THREE.PlaneGeometry(0.42, 1.9, 24, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 46) * 0.025); }
    geo.computeVertexNormals();
    return geo;
  });
}

function canopyBed() {
  const W = 1.95, L = 2.15;
  const post = mat('#2b1d14', { rough: 0.4, clearcoat: 0.4 });
  const b = brass();
  const g = group(at(rbox(W + 0.1, 0.3, L + 0.06, 0.04, velvet('#2f3b4c')), 0, 0.24, 0));
  const head = rbox(W + 0.1, 1.15, 0.14, 0.06, velvet('#2f3b4c')); g.add(at(head, 0, 0.8, -L / 2 - 0.04));
  const tufts = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) { const x = -0.84 + c * 0.21 + (r % 2 ? 0.105 : 0); if (Math.abs(x) < 0.92) tufts.push([x, 0.75 + r * 0.17, -L / 2 + 0.031]); }
  g.add(merged('canopyTufts', mat('#253041', { rough: 0.5 }), () => tufts.map(([x, y, z]) => new THREE.SphereGeometry(0.014, 8, 6).translate(x, y, z))));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = x * (W / 2 + 0.08), pz = z * (L / 2 + 0.06);
    g.add(at(cyl(0.032, 0.036, 2.2, post, 12), px, 1.1, pz));
    g.add(at(sph(0.045, b, 14, 10), px, 2.23, pz));
    const d = meshOf(curtainGeo(), mat('#fbf7f0', { rough: 0.9, opacity: 0.45, transparent: true, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
    d.rotation.y = x > 0 ? -Math.PI / 2 + 0.3 * z : Math.PI / 2 - 0.3 * z;
    g.add(at(d, px - x * 0.02, 1.2, pz - z * 0.2));
    g.add(at(rot(torus(0.06, 0.012, b, 6, 16), Math.PI / 2, 0, 0), px, 1.05, pz));
  }
  for (const s of [-1, 1]) { g.add(at(box(W + 0.2, 0.05, 0.05, post), 0, 2.18, s * (L / 2 + 0.06))); g.add(at(box(0.05, 0.05, L + 0.16, post), s * (W / 2 + 0.08), 2.18, 0)); }
  const mattress = rbox(W, 0.24, L - 0.04, 0.05, mat('#f7f5f1', { rough: 0.9 })); mattress.name = 'sheet'; g.add(at(mattress, 0, 0.5, 0.01));
  bedLinens(g, W, L, 0.62, '#efe6d8', '#fbf8f2', '#b08d57', 3);
  const euro = rbox(0.6, 0.5, 0.14, 0.07, velvet('#7a8f86')); euro.name = 'pillow'; euro.rotation.x = -0.2;
  g.add(at(euro.clone(), -0.32, 0.88, -L / 2 + 0.16), at(euro, 0.32, 0.88, -L / 2 + 0.16));
  return g;
}

function japandiBed() {
  const wood = MAT.wood('#c8a47a');
  const W = 1.6, L = 2.05;
  const g = group(at(rbox(W + 0.36, 0.16, L + 0.24, 0.02, wood), 0, 0.1, 0.05));
  g.add(at(box(W + 0.36, 0.04, 0.06, wood), 0, 0.98, -L / 2 - 0.05));
  g.add(merged('japandiSlats', wood, () => Array.from({ length: 15 }, (_, i) => new THREE.BoxGeometry(0.06, 0.78, 0.035).translate(-W / 2 - 0.12 + i * (W + 0.24) / 14, 0.57, -L / 2 - 0.05))));
  const mattress = rbox(W, 0.22, L - 0.04, 0.05, mat('#f4f3ef', { rough: 0.9 })); mattress.name = 'sheet'; g.add(at(mattress, 0, 0.29, 0));
  bedLinens(g, W, L, 0.4, '#a3b18a', '#ece6da', '#e7dccb', 2);
  return g;
}

function metalBed() {
  const m = blackMetal();
  const W = 0.99, L = 1.95;
  const g = new THREE.Group();
  for (const [s, h] of [[-1, 0.95], [1, 0.62]]) {
    const z = s * (L / 2 + 0.02);
    for (const x of [-1, 1]) g.add(at(cyl(0.018, 0.018, h, m, 8), x * (W / 2 + 0.02), h / 2, z));
    g.add(at(rot(cyl(0.014, 0.014, W + 0.04, m, 8), 0, 0, Math.PI / 2), 0, h - 0.04, z));
    g.add(at(rot(cyl(0.012, 0.012, W + 0.04, m, 8), 0, 0, Math.PI / 2), 0, 0.32, z));
  }
  g.add(merged('metalBedBars', m, () => {
    const out = [];
    for (let i = 0; i < 9; i++) { const x = -W / 2 + 0.1 + i * (W - 0.2) / 8; out.push(new THREE.CylinderGeometry(0.008, 0.008, 0.59, 6).translate(x, 0.615, -L / 2 - 0.02)); out.push(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6).translate(x, 0.45, L / 2 + 0.02)); }
    return out;
  }));
  for (const s of [-1, 1]) g.add(at(box(0.03, 0.08, L, m), s * (W / 2), 0.28, 0));
  const mattress = rbox(W, 0.18, L - 0.03, 0.05, mat('#f4f4f2', { rough: 0.9 })); mattress.name = 'sheet'; g.add(at(mattress, 0, 0.41, 0));
  bedLinens(g, W, L, 0.46, '#9bb7d4', '#ffffff', '#f2cc8f', 1);
  return g;
}

// ------------------------------------------------------------------ wall shelves (origin back-center, z=0 at wall)
function floatingShelf({ w = 0.6, d = 0.22, color = '#c8a47a' } = {}) {
  return group(at(rbox(w, 0.036, d, 0.006, MAT.wood(color)), 0, 0, d / 2));
}
function shelfTrio({ color = '#6e4a2f' } = {}) {
  const wood = MAT.wood(color);
  return group(
    at(rbox(0.5, 0.034, 0.2, 0.006, wood), -0.16, 0.33, 0.1),
    at(rbox(0.62, 0.034, 0.2, 0.006, wood), 0.12, 0, 0.1),
    at(rbox(0.44, 0.034, 0.2, 0.006, wood), -0.1, -0.33, 0.1),
  );
}
function hexShelves() {
  const m = MAT.wood('#d9b98a');
  const ring = sharedGeo('hf:hexRing', () => {
    const s = new THREE.Shape(); const h = new THREE.Path();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const p = [Math.cos(a) * 0.21, Math.sin(a) * 0.21]; const q = [Math.cos(a) * 0.19, Math.sin(a) * 0.19]; if (i) { s.lineTo(...p); h.lineTo(...q); } else { s.moveTo(...p); h.moveTo(...q); } }
    s.closePath(); h.closePath(); s.holes.push(h);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }); geo.computeVertexNormals(); return geo;
  });
  const back = sharedGeo('hf:hexBack', () => new THREE.CircleGeometry(0.2, 6));
  const g = new THREE.Group();
  const cells = [[-0.325, -0.094], [0, 0.094], [0.325, -0.094]];
  cells.forEach(([x, y], i) => {
    g.add(at(meshOf(ring, m), x, y, 0));
    g.add(at(meshOf(back, mat(['#e9dccb', '#c9d6c3', '#e8c7b8'][i], { rough: 0.9 }), { cast: false }), x, y, 0.002));
  });
  return g;
}
function pictureLedge() {
  const wood = MAT.wood('#e4cfae');
  return group(at(box(0.9, 0.025, 0.1, wood), 0, 0, 0.05), at(box(0.9, 0.035, 0.012, wood), 0, 0.03, 0.094), at(box(0.9, 0.06, 0.018, wood), 0, -0.02, 0.009));
}

// ------------------------------------------------------------------ floor storage
function ladderShelf() {
  const wood = MAT.wood('#5a3a24');
  const g = new THREE.Group();
  const lean = -0.2;
  for (const s of [-1, 1]) { const r = box(0.04, 1.86, 0.03, wood); r.rotation.x = lean; g.add(at(r, s * 0.31, 0.92, 0.0)); }
  const zr = (y) => 0.18 - y * Math.tan(-lean) - 0.0;
  for (const y of [0.32, 0.72, 1.1, 1.45]) {
    const front = zr(y) + 0.02, d = front + 0.2;
    g.add(at(rbox(0.6, 0.022, d, 0.004, wood), 0, y, front - d / 2));
  }
  const books = bookSpines(7, 0.22, 21); books.position.set(-0.27, 0.331, -0.04); g.add(books);
  return g;
}

function cubeShelf() {
  const white = mat('#f3f1ec', { rough: 0.5 });
  const g = new THREE.Group();
  const S = 1.12, T = 0.03, D = 0.39, y0 = 0.04;
  g.add(at(box(S, T, D, white), 0, y0 + T / 2, 0), at(box(S, T, D, white), 0, y0 + S - T / 2, 0));
  for (const x of [-S / 2 + T / 2, S / 2 - T / 2]) g.add(at(box(T, S, D, white), x, y0 + S / 2, 0));
  const c = (S - T) / 3;
  for (let i = 1; i < 3; i++) { g.add(at(box(T, S - 2 * T, D, white), -S / 2 + T / 2 + c * i, y0 + S / 2, 0)); g.add(at(box(S - 2 * T, T, D, white), 0, y0 + T / 2 + c * i, 0)); }
  g.add(at(box(S, S, 0.006, mat('#e6e2da', { rough: 0.6 })), 0, y0 + S / 2, -D / 2 + 0.003));
  const bins = [[0, 0, '#8fa8a0'], [2, 0, '#d9a36e'], [1, 1, '#8fa8a0'], [0, 2, '#d9a36e']];
  for (const [col, row, color] of bins) {
    const x = -S / 2 + T + c * (col + 0.5) - T / 2, y = y0 + T + c * row + (c - T) / 2 - 0.005;
    g.add(at(rbox(c - T - 0.02, c - T - 0.03, D - 0.04, 0.02, MAT.fabric(color)), x, y, 0.01));
    g.add(at(rbox(0.1, 0.03, 0.01, 0.012, mat('#2b2b2b', { rough: 0.8 })), x, y + 0.08, D / 2 - 0.004));
  }
  for (const [x, z] of [[-0.5, -0.15], [0.5, -0.15], [-0.5, 0.15], [0.5, 0.15]]) g.add(at(cyl(0.02, 0.02, 0.04, mat('#c8a47a', { rough: 0.5 }), 8), x, 0.02, z));
  return g;
}

function displayCabinet() {
  const m = blackMetal();
  const W = 0.82, H = 1.8, D = 0.4;
  const g = group(at(box(W, 0.08, D, m), 0, 0.04, 0), at(box(W, 0.06, D, m), 0, H - 0.03, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(box(0.025, H, 0.025, m), x * (W / 2 - 0.0125), H / 2, z * (D / 2 - 0.0125)));
  g.add(at(box(W - 0.03, H - 0.14, 0.006, mat('#151517', { rough: 0.3 })), 0, H / 2, -D / 2 + 0.01));
  for (const y of [0.5, 0.9, 1.3]) g.add(at(box(W - 0.05, 0.008, D - 0.05, MAT.glass('#e0f0f2', 0.35)), 0, y, 0));
  g.add(at(box(W - 0.05, 0.004, D - 0.05, mat('#2a2a2c', { rough: 0.5 })), 0, 0.082, 0));
  for (const x of [-1, 1]) g.add(noRay(at(box(0.004, H - 0.14, D - 0.04, clearGlass()), x * (W / 2 - 0.005), H / 2, 0)));
  g.add(noRay(at(box(W - 0.04, H - 0.14, 0.004, clearGlass()), 0, H / 2, D / 2 - 0.006)));
  g.add(at(box(0.012, 0.3, 0.02, MAT.chrome()), W / 2 - 0.06, H / 2, D / 2 + 0.008));
  const led = box(W - 0.08, 0.008, 0.02, mat('#fffaf0', { emissive: '#fff4e0', ei: 0.6 })); led.userData.bulb = true; g.add(at(led, 0, H - 0.065, D / 2 - 0.05));
  for (const y of [0.49, 0.89, 1.29]) { const l2 = box(W - 0.08, 0.004, 0.012, mat('#fffaf0', { emissive: '#fff4e0', ei: 0.6 })); l2.userData.bulb = true; g.add(at(l2, 0, y + 0.395, D / 2 - 0.04)); }
  return g;
}

function sneakerWall() {
  const g = new THREE.Group();
  const cw = 0.4, ch = 0.25, D = 0.4, rows = 4;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) cells.push([(c - 0.5) * (cw + 0.01), 0.02 + r * (ch + 0.01)]);
  g.add(merged('sneakFloors', mat('#f4f4f2', { rough: 0.4 }), () => cells.map(([x, y]) => new THREE.BoxGeometry(cw, 0.016, D).translate(x, y + 0.008, 0))));
  g.add(noRay(merged('sneakShells', clearGlass(), () => cells.map(([x, y]) => new THREE.BoxGeometry(cw, ch - 0.016, D).translate(x, y + 0.016 + (ch - 0.016) / 2, 0)))));
  g.add(merged('sneakTrim', mat('#141416', { rough: 0.4 }), () => cells.flatMap(([x, y]) => [
    new THREE.BoxGeometry(cw, 0.012, 0.012).translate(x, y + ch - 0.006, D / 2 - 0.006),
    new THREE.BoxGeometry(cw, 0.012, 0.012).translate(x, y + 0.022, D / 2 - 0.006),
    new THREE.BoxGeometry(0.012, ch - 0.02, 0.012).translate(x - cw / 2 + 0.006, y + ch / 2 + 0.01, D / 2 - 0.006),
    new THREE.BoxGeometry(0.012, ch - 0.02, 0.012).translate(x + cw / 2 - 0.006, y + ch / 2 + 0.01, D / 2 - 0.006),
    new THREE.BoxGeometry(0.016, 0.02, 0.012).translate(x, y + ch - 0.02, D / 2 + 0.004),
  ])));
  const led = merged('sneakLed', mat('#ffffff', { emissive: '#bfe9ff', ei: 0.8 }), () => cells.map(([x, y]) => new THREE.BoxGeometry(cw - 0.06, 0.004, 0.012).translate(x, y + ch - 0.016, -D / 2 + 0.03)));
  led.userData.bulb = true; g.add(led);
  const pair = sneaker({ upper: '#ffffff', accent: '#e63946', sole: '#f2f2f2', high: true });
  pair.scale.setScalar(0.92); pair.rotation.y = 0.35; pair.position.set(cells[6][0], cells[6][1] + 0.017, 0); g.add(pair);
  const pair2 = sneaker({ upper: '#1d3557', accent: '#f4a261', sole: '#ffffff' });
  pair2.scale.setScalar(0.92); pair2.rotation.y = -0.3; pair2.position.set(cells[3][0], cells[3][1] + 0.017, 0); g.add(pair2);
  return g;
}

function tvStandFluted() {
  const W = 1.8;
  const wh = lacquer('#f1eee8');
  const oak = MAT.wood('#d1ac7f');
  const g = group(at(rbox(W, 0.46, 0.42, 0.012, wh), 0, 0.33, 0), at(rbox(W + 0.02, 0.03, 0.44, 0.008, oak), 0, 0.575, 0));
  g.add(merged('flutes', wh, () => Array.from({ length: 72 }, (_, i) => new THREE.CylinderGeometry(0.011, 0.011, 0.4, 8, 1, false, -Math.PI / 2, Math.PI).translate(-W / 2 + 0.04 + i * (W - 0.08) / 71, 0.33, 0.21))));
  for (const x of [-0.3, 0.3]) g.add(at(box(0.004, 0.42, 0.012, mat('#d8d3cb', { rough: 0.6 })), x, 0.33, 0.222));
  for (const [x, z] of [[-0.82, -0.14], [0.82, -0.14], [-0.82, 0.14], [0.82, 0.14]]) g.add(at(cyl(0.035, 0.035, 0.1, oak, 14), x, 0.05, z));
  return g;
}
function tvStandIndustrial() {
  const m = blackMetal();
  const wood = MAT.wood('#8c6239');
  const W = 1.5, D = 0.4;
  const g = new THREE.Group();
  for (const y of [0.08, 0.3, 0.53]) g.add(at(rbox(W, 0.03, D, 0.006, wood), 0, y, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(box(0.03, 0.56, 0.03, m), x * (W / 2 - 0.02), 0.28, z * (D / 2 - 0.02)));
  for (const s of [-1, 1]) { const xb = box(0.012, 0.5, 0.012, m); xb.rotation.x = 0.68; g.add(at(xb, s * (W / 2 - 0.02), 0.31, -D / 2 + 0.02)); }
  const b = bookSpines(5, 0.17, 41); b.position.set(-0.68, 0.1, 0); g.add(b);
  g.add(at(rbox(0.2, 0.13, 0.2, 0.03, mat('#cdb79e', { rough: 0.9 })), 0.5, 0.16, 0));
  return g;
}
function tvStandCane() {
  const W = 1.6;
  const wood = MAT.wood('#6b4529');
  const cane = mat('#ffffff', { map: caneTex(), rough: 0.7 });
  const g = group(at(rbox(W, 0.5, 0.42, 0.012, wood), 0, 0.43, 0));
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.03 + (W - 0.06) * (i + 0.5) / 4;
    g.add(at(plane(0.34, 0.42, cane, { cast: false, receive: true }), x, 0.43, 0.2115));
    g.add(at(box(0.012, 0.44, 0.012, wood), x - 0.18, 0.43, 0.212));
    g.add(at(cyl(0.01, 0.01, 0.012, brass(), 10).rotateX(Math.PI / 2), x + (i % 2 ? -0.15 : 0.15), 0.43, 0.22));
  }
  for (const p of taperLegs([[-0.74, -0.16], [0.74, -0.16], [-0.74, 0.16], [0.74, 0.16]], 0.18, wood, 0.022, 0.015, 0.15)) g.add(p);
  return g;
}

function barCart() {
  const b = brass();
  const g = new THREE.Group();
  const W = 0.72, D = 0.42;
  for (const y of [0.18, 0.62]) {
    g.add(at(box(W, 0.008, D, mat('#c8d6d8', { rough: 0.05, metal: 1 })), 0, y, 0));
    for (const s of [-1, 1]) { g.add(at(box(W, 0.035, 0.008, b), 0, y + 0.014, s * D / 2)); g.add(at(box(0.008, 0.035, D, b), s * W / 2, y + 0.014, 0)); }
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(cyl(0.01, 0.01, 0.8, b, 8), x * W / 2, 0.47, z * D / 2));
  g.add(tube([[W / 2, 0.84, -D / 2], [W / 2 + 0.08, 0.86, -D / 4], [W / 2 + 0.08, 0.86, D / 4], [W / 2, 0.84, D / 2]], 0.01, b, 16, 6));
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) g.add(at(rot(cyl(0.06, 0.06, 0.025, mat('#1b1b1b', { rough: 0.6 }), 16), 0, 0, Math.PI / 2), x * W / 2, 0.06, z * D / 2));
  const b1 = bottle({ liquid: '#b5651d', cap: '#1b1b1b', label: 'RYE', labelColor: '#f3ead8', labelText: '#3b2414', glass: true, h: 0.28, r: 0.04, key: 'cartRye' }); b1.position.set(-0.2, 0.624, -0.06); g.add(b1);
  const b2 = bottle({ liquid: '#e8f3f1', cap: '#2a9d8f', label: 'GIN', labelColor: '#2a9d8f', labelText: '#ffffff', glass: true, h: 0.26, r: 0.036, key: 'cartGin' }); b2.position.set(-0.08, 0.624, 0.06); g.add(b2);
  const gl = glassTumbler({ liquid: '#c8771e', ice: true, garnish: '#f4a261' }); gl.position.set(0.14, 0.624, 0.05); g.add(gl);
  const gl2 = glassTumbler({ liquid: '#e8f3f1', ice: false }); gl2.position.set(0.24, 0.624, -0.07); g.add(gl2);
  g.add(at(cyl(0.07, 0.06, 0.13, MAT.chrome(), 24), 0.12, 0.25, 0));
  return g;
}

// ------------------------------------------------------------------ rugs
function rugTex2(key, draw, W = 512, H = 360) {
  return cached('hfrug:' + key, () => {
    const c = canvas(W, H); const ctx = c.getContext('2d');
    draw(ctx, W, H);
    const rnd = seeded(key.length * 7 + 3);
    const img = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { wrap: false });
  });
}
function persianDraw(ctx, W, H) {
  const red = '#8c2f2b', navy = '#23324a', cream = '#efe3c8', gold = '#c9973f';
  ctx.fillStyle = red; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = navy; ctx.fillRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = cream; ctx.fillRect(22, 22, W - 44, H - 44);
  ctx.fillStyle = red; ctx.fillRect(34, 34, W - 68, H - 68);
  // border motifs
  ctx.fillStyle = navy;
  for (let x = 30; x < W - 20; x += 22) { ctx.beginPath(); ctx.arc(x, 28, 4, 0, 7); ctx.arc(x, H - 28, 4, 0, 7); ctx.fill(); }
  for (let y = 30; y < H - 20; y += 22) { ctx.beginPath(); ctx.arc(28, y, 4, 0, 7); ctx.arc(W - 28, y, 4, 0, 7); ctx.fill(); }
  // field pattern
  ctx.strokeStyle = 'rgba(239,227,200,0.35)'; ctx.lineWidth = 2;
  for (let x = 50; x < W - 40; x += 28) for (let y = 50; y < H - 40; y += 28) { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.stroke(); }
  // central medallion
  const cx = W / 2, cy = H / 2;
  const diamond = (rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, cy - ry); ctx.lineTo(cx + rx, cy); ctx.lineTo(cx, cy + ry); ctx.lineTo(cx - rx, cy); ctx.fill(); };
  diamond(150, 120, navy); diamond(128, 100, gold); diamond(110, 84, cream); diamond(88, 66, red);
  ctx.fillStyle = navy; ctx.beginPath(); ctx.ellipse(cx, cy, 40, 30, 0, 0, 7); ctx.fill();
  ctx.fillStyle = gold; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 55, cy + Math.sin(a) * 42, 9, 5, a, 0, 7); ctx.fill(); }
  ctx.fillStyle = cream; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 7); ctx.fill();
  for (const [x, y] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) { ctx.fillStyle = navy; ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 22); ctx.lineTo(x - 22, y); ctx.fill(); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); }
}
function checkerDraw(c1, c2) {
  return (ctx, W, H) => {
    const img = ctx.createImageData(W, H);
    const a = new THREE.Color(c1), b = new THREE.Color(c2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x + Math.sin(y * 0.035) * 12, v = y + Math.sin(x * 0.03) * 12;
      const k = (Math.floor(u / 64) + Math.floor(v / 64)) & 1;
      const c = k ? a : b; const i = (y * W + x) * 4;
      img.data[i] = c.r * 255; img.data[i + 1] = c.g * 255; img.data[i + 2] = c.b * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
}
function juteDraw(ctx, W, H) {
  ctx.fillStyle = '#c9a774'; ctx.fillRect(0, 0, W, H);
  for (let r = 4; r < W / 2; r += 6) { ctx.strokeStyle = r % 12 ? '#b8925e' : '#d8bb8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 7); ctx.stroke(); }
  ctx.strokeStyle = '#efe3c8'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.4, 0, 7); ctx.stroke();
}
function shagDraw(base) {
  return (ctx, W, H) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const rnd = seeded(9);
    for (let i = 0; i < 2600; i++) { const x = rnd() * W, y = rnd() * H, a = rnd() * 6.3; ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,100,80,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.stroke(); }
  };
}
function rainbowDraw(ctx, W, H) {
  ctx.fillStyle = '#f3ebdf'; ctx.fillRect(0, 0, W, H);
  const cols = ['#c8553d', '#e7a15b', '#f2cc8f', '#9cae9b', '#5f7f8a'];
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(W / 2, H * 0.82, W * 0.38 - i * 34, Math.PI, 0); ctx.fill(); });
  ctx.fillStyle = '#f3ebdf'; ctx.beginPath(); ctx.arc(W / 2, H * 0.82, W * 0.38 - cols.length * 34, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#e7a15b'; for (const [x, y] of [[70, 70], [W - 80, 90], [110, H - 50]]) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill(); }
}
function flatRug({ w, d, tex, round = false, fringe = null, sheen = 0.4, edge = null }) {
  const m = mat('#ffffff', { map: tex, rough: 1, sheen });
  const g = new THREE.Group();
  if (round) { const r = cyl(w / 2, w / 2, 0.014, m, 64, { cast: false, receive: true }); r.position.y = 0.007; g.add(r); }
  else { const r = rbox(w, 0.014, d, 0.006, m, { cast: false, receive: true }); r.position.y = 0.007; g.add(r); }
  if (fringe) for (const s of [-1, 1]) g.add(at(box(0.06, 0.004, d * 0.96, mat(fringe, { rough: 1 }), { cast: false }), s * (w / 2 + 0.03), 0.003, 0));
  if (edge) g.add(at(rot(torus(w / 2, 0.009, mat(edge, { rough: 1 }), 6, 64), Math.PI / 2, 0, 0), 0, 0.009, 0));
  return g;
}
function cowhideRug() {
  const rnd = seeded(12);
  const outline = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    const leg = Math.abs(Math.cos(a * 2)) ** 6 * 0.35;
    const r = 0.75 + leg + (rnd() - 0.5) * 0.08;
    outline.push([Math.cos(a) * r * 1.15, Math.sin(a) * r * 0.85]);
  }
  const base = extrude(outline, 0.008, mat('#e9dcc6', { rough: 0.85, sheen: 0.6 }), 0.002, { cast: false, receive: true }, 'cowhideBase');
  base.rotation.x = -Math.PI / 2; base.position.y = 0.006;
  const g = group(base);
  const spotM = mat('#4a3426', { rough: 0.85, sheen: 0.6 });
  const spots = [[-0.55, 0.15, 0.28], [0.2, -0.25, 0.32], [0.55, 0.3, 0.22], [-0.1, 0.45, 0.18], [-0.35, -0.4, 0.17]];
  spots.forEach(([x, y, r], i) => {
    const pts = []; const rr = seeded(40 + i);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const q = r * (0.7 + rr() * 0.5); pts.push([Math.cos(a) * q * 1.2, Math.sin(a) * q * 0.85]); }
    const s = extrude(pts, 0.002, spotM, 0.001, { cast: false, receive: true }, 'cowspot' + i);
    s.rotation.x = -Math.PI / 2; s.position.set(x, 0.0125, -y); g.add(s);
  });
  return g;
}

// ------------------------------------------------------------------ definitions
const F = (o) => ({ furniture: true, category: 'furniture', place: 'floor', ...o });
const look = (...lines) => ({ type: 'decor', verb: 'Inspect', lines });
const RUG = (o) => F({ tags: ['rug', 'soft'], noCollide: true, emoji: '🟫', use: { type: 'decor', verb: 'Wiggle your toes', lines: o.lines }, ...o });

defineItems([
  // ---------------------------------------------------------- sofas
  F({ id: 'sofa_sectional_oat', name: 'Oatmeal L-Sectional', price: 1899, stores: ['nestly'], rarity: 'uncommon', emoji: '🛋️', desc: 'A sprawling L-shape with a chaise built for movie marathons. Seats 4, naps 2.', build: () => sectional({}), use: { type: 'seat', seats: [[-0.79, -0.2], [0.04, -0.2], [0.83, -0.1], [0.83, 0.45]], height: 0.45, comfort: 0.85, lie: true, lieHead: [-1.0, 0, -0.25], width: 2.8 } }),
  F({ id: 'sofa_loveseat_mustard', name: 'Mustard Velvet Loveseat', price: 649, stores: ['nestly', 'primo'], emoji: '🛋️', desc: 'Roll arms, tufted back and a colour that says "I own a record player".', build: () => loveseat({}), use: { type: 'seat', seats: [[-0.33, 0.1], [0.33, 0.1]], height: 0.45, comfort: 0.7, width: 1.5 } }),
  F({ id: 'sofa_loveseat_blush', name: 'Blush Velvet Loveseat', price: 649, stores: ['nestly'], emoji: '🛋️', desc: 'The same plush loveseat in a soft millennial pink.', build: () => loveseat({ color: '#d8a3a0' }), use: { type: 'seat', seats: [[-0.33, 0.1], [0.33, 0.1]], height: 0.45, comfort: 0.7, width: 1.5 } }),
  F({ id: 'futon_denim', name: 'Pine Futon', price: 299, stores: ['primo', 'nestly'], emoji: '🛋️', desc: 'Sofa by day, guest bed by night, dorm-room nostalgia forever.', build: () => futon({}), use: { type: 'seat', seats: [[-0.5, 0.05], [0.5, 0.05]], height: 0.44, comfort: 0.5, lie: true, lieHead: [-0.75, 0, 0.05], width: 1.95 } }),
  F({ id: 'sofa_chesterfield', name: 'Oxblood Chesterfield', price: 3450, stores: ['luxe'], rarity: 'rare', emoji: '🛋️', desc: 'Hand-buttoned leather, rolled arms, and the gravitas of a gentlemen\'s club.', build: () => chesterfield({}), use: { type: 'seat', seats: [[-0.55, 0.1], [0, 0.1], [0.55, 0.1]], height: 0.46, comfort: 0.8, lie: true, lieHead: [-0.75, 0, 0.1], width: 2.1 } }),
  F({ id: 'sofa_curve_boucle', name: 'Crescent Bouclé Sofa', price: 4200, stores: ['luxe'], rarity: 'epic', emoji: '🛋️', desc: 'A sculptural curve of cloud-soft bouclé. Conversation pit energy.', build: () => curveSofa({}), use: { type: 'seat', seats: [[-0.71, -0.05], [0, -0.18], [0.71, -0.05]], height: 0.42, comfort: 0.85 } }),

  // ---------------------------------------------------------- seating
  F({ id: 'chair_barrel_boucle', name: 'Bouclé Barrel Chair', price: 389, stores: ['nestly'], emoji: '🪑', desc: 'A plump little tub of a chair that hugs you back.', build: () => barrelChair({}), use: { type: 'seat', seats: [[0, 0.04]], height: 0.47, comfort: 0.7 } }),
  F({ id: 'chair_barrel_sage', name: 'Sage Barrel Chair', price: 389, stores: ['nestly', 'primo'], emoji: '🪑', desc: 'Same huggable tub chair, in calming sage.', build: () => barrelChair({ color: '#9aa38a' }), use: { type: 'seat', seats: [[0, 0.04]], height: 0.47, comfort: 0.7 } }),
  F({ id: 'chair_rocking', name: 'Porch Rocking Chair', price: 259, stores: ['nestly'], emoji: '🪑', desc: 'Solid ash rocker with a cushion and a throw. Grandma-approved.', build: rockingChair, use: { type: 'seat', seats: [[0, 0.02]], height: 0.48, comfort: 0.6, verb: 'Rock' } }),
  F({ id: 'chair_gaming', name: 'Apex Racing Gaming Chair', price: 329, stores: ['volt', 'nestly'], emoji: '🎮', brand: 'Apex', desc: 'Bucket seat, harness slots you\'ll never use and +10 to clutch plays.', build: () => gamingChair({}), use: { type: 'seat', seats: [[0, 0.02]], height: 0.52, comfort: 0.55 } }),
  F({ id: 'chair_gaming_pink', name: 'Apex Racing Chair — Sakura', price: 349, stores: ['volt'], emoji: '🎮', brand: 'Apex', desc: 'Pastel pink and white. Your stream overlay will match.', build: () => gamingChair({ main: '#f4a7c1', dark: '#f5f2f4' }), use: { type: 'seat', seats: [[0, 0.02]], height: 0.52, comfort: 0.55 } }),
  F({ id: 'bean_bag_sherpa', name: 'Sherpa Bean Bag', price: 149, stores: ['nestly', 'primo'], tags: ['soft'], emoji: '🫘', desc: 'Fluffy teddy fabric, filled with shredded memory foam. Swallows you whole.', build: () => beanBag({}), use: { type: 'seat', seats: [[0, 0.08]], height: 0.36, comfort: 0.8, sound: 'squish', verb: 'Flop down' } }),
  F({ id: 'bean_bag_navy', name: 'Classic Bean Bag', price: 89, stores: ['primo'], tags: ['soft'], emoji: '🫘', desc: 'Wipe-clean nylon in navy. Peak gaming posture (do not tell your chiropractor).', build: () => beanBag({ color: '#2f4a6d', knit: false }), use: { type: 'seat', seats: [[0, 0.08]], height: 0.36, comfort: 0.7, sound: 'squish', verb: 'Flop down' } }),
  F({ id: 'cushion_floor_terracotta', name: 'Velvet Floor Cushion', price: 59, stores: ['nestly', 'primo'], tags: ['soft'], noCollide: true, emoji: '🟠', desc: 'A plump tufted pouf for low tables, tea and sitting cross-legged.', build: () => floorCushion({}), use: { type: 'seat', seats: [[0, 0]], height: 0.19, comfort: 0.45 } }),
  F({ id: 'cushion_floor_mustard', name: 'Linen Floor Cushion', price: 49, stores: ['nestly'], tags: ['soft'], noCollide: true, emoji: '🟡', desc: 'Stonewashed linen pouf in sunny mustard.', build: () => floorCushion({ color: '#d9a43b', vel: false }), use: { type: 'seat', seats: [[0, 0]], height: 0.19, comfort: 0.45 } }),
  F({ id: 'chair_egg_hanging', name: 'Hanging Rattan Egg Chair', price: 1450, stores: ['luxe', 'nestly'], rarity: 'rare', emoji: '🥚', desc: 'Hand-woven rattan cocoon on a steel arc. Sway, read, ignore emails.', build: eggChair, use: { type: 'seat', seats: [[0, 0.1]], height: 0.62, comfort: 0.9, verb: 'Curl up' } }),
  F({ id: 'chair_papasan', name: 'Papasan Chair', price: 199, stores: ['primo', 'nestly'], emoji: '🪺', desc: 'A giant rattan saucer with a squishy cushion. Very 1998, very comfy.', build: () => papasan({}), use: { type: 'seat', seats: [[0, 0.02]], height: 0.42, comfort: 0.75, verb: 'Sink in' } }),

  // ---------------------------------------------------------- tables
  F({ id: 'table_nesting_marble', name: 'Marble Nesting Tables', price: 249, stores: ['nestly'], emoji: '⚪', desc: 'Two brass-legged marble rounds that tuck together. Instant extra surface.', build: nestingTables, use: look('Two tables for the space of one. Efficient AND chic.', 'The marble is cool to the touch.') }),
  F({ id: 'table_console_walnut', name: 'Walnut Console Table', price: 219, stores: ['nestly', 'primo'], emoji: '🪵', desc: 'Slim enough for a hallway, with two drawers for keys and mystery cables.', build: consoleTable, use: look('You check the drawers. Three spare keys, none of which open anything.', 'The perfect drop zone.') }),
  F({ id: 'table_coffee_glass', name: 'Brass & Glass Coffee Table', price: 349, stores: ['nestly'], emoji: '🔲', desc: 'Floating glass on a slim brass frame, with a shelf for coffee-table books.', build: glassCoffeeTable, use: look('Fingerprint count: already three.', 'It makes the room feel bigger. Allegedly.') }),
  F({ id: 'table_coffee_travertine', name: 'Travertine Drum Table', price: 1450, stores: ['luxe'], rarity: 'rare', emoji: '🪨', desc: 'A solid slab of honed Italian travertine. Weighs as much as a small car.', build: travertineTable, use: look('Millions of years of limestone, now holding your remote.', 'The tiny pits in the stone are part of the charm.') }),
  F({ id: 'desk_standing', name: 'Lift Standing Desk', price: 499, stores: ['nestly', 'volt'], emoji: '🧍', desc: 'Dual-motor sit/stand desk with a walnut top. Stand up for yourself.', build: standingDesk, use: { type: 'decor', verb: 'Adjust height', lines: ['Whirrrr… it settles at standing height. You feel 4% more productive.', 'You press the preset button. Posture: elite.', 'Up, down, up again. The motor hums approvingly.'] } }),
  F({ id: 'desk_writing', name: 'Mid-Century Writing Desk', price: 329, stores: ['nestly', 'primo'], emoji: '✍️', desc: 'Splayed legs, a drawer for letters, and big main-character energy.', build: writingDesk, use: look('A desk made for handwritten letters you will definitely write.', 'The drawer glides like butter.') }),

  // ---------------------------------------------------------- beds
  F({ id: 'bed_daybed', name: 'Spindle Daybed', price: 699, stores: ['nestly'], emoji: '🛏️', desc: 'Twin daybed with turned spindles and bolsters — lounge by day, sleep by night.', build: daybed, use: { type: 'bed', length: 2.0, width: 1.0, height: 0.55, quality: 0.95 } }),
  F({ id: 'bed_canopy', name: 'Velvet Canopy King Bed', price: 3900, stores: ['luxe'], rarity: 'epic', emoji: '👑', desc: 'Four posts, sheer drapes, tufted velvet headboard. Wake up like royalty.', build: canopyBed, use: { type: 'bed', length: 2.15, width: 1.95, height: 0.72, quality: 1.35 } }),
  F({ id: 'bed_japandi', name: 'Japandi Platform Bed', price: 849, stores: ['nestly'], rarity: 'uncommon', emoji: '🛏️', desc: 'Low oak platform with a slatted headboard. Calm, minimal, very good sleep.', build: japandiBed, use: { type: 'bed', length: 2.05, width: 1.6, height: 0.5, quality: 1.15 } }),
  F({ id: 'bed_metal_twin', name: 'Metal Twin Bed', price: 249, stores: ['primo'], emoji: '🛏️', desc: 'Black steel frame, twin mattress, cheerful blue duvet. It does the job.', build: metalBed, use: { type: 'bed', length: 1.95, width: 0.99, height: 0.55, quality: 0.85 } }),

  // ---------------------------------------------------------- wall shelves
  F({ id: 'shelf_floating_oak', name: 'Floating Oak Shelf', place: 'wall', furniture: false, price: 39, stores: ['nestly', 'primo'], emoji: '➖', desc: 'Hidden brackets, 60 cm of display space. Plants and trinkets go on top.', build: () => floatingShelf({}), use: look('It floats! (There are brackets. Don\'t tell anyone.)', 'Perfect for a tiny plant and a candle.') }),
  F({ id: 'shelf_floating_walnut_long', name: 'Long Walnut Wall Shelf', place: 'wall', furniture: false, price: 59, stores: ['nestly'], emoji: '➖', desc: 'A full metre of floating walnut for books, records and collectibles.', build: () => floatingShelf({ w: 1.0, d: 0.24, color: '#6e4a2f' }), use: look('Room for a whole shelfie.', 'Level. You checked twice.') }),
  F({ id: 'shelf_floating_trio', name: 'Staggered Shelf Trio', place: 'wall', price: 79, stores: ['nestly'], emoji: '📚', desc: 'Three offset floating shelves for a curated gallery-wall look.', build: () => shelfTrio({}), use: look('Three little stages for your favourite things.', 'Curated. Intentional. Slightly crooked? No, perfect.') }),
  F({ id: 'shelf_hex_honeycomb', name: 'Honeycomb Hex Shelves', place: 'wall', price: 69, stores: ['nestly', 'primo'], emoji: '⬡', desc: 'Three pine hexagons — tiny nooks for succulents and figures.', build: hexShelves, use: look('Bees would be proud.', 'Each hexagon is a little diorama waiting to happen.') }),
  F({ id: 'shelf_picture_ledge', name: 'Picture Ledge', place: 'wall', furniture: false, price: 35, stores: ['nestly', 'arthaus'], emoji: '🖼️', desc: 'A slim lipped ledge for leaning photos, postcards and small prints.', build: pictureLedge, use: look('A shelf for things you can\'t commit to hanging.', 'The lip keeps everything from sliding off.') }),

  // ---------------------------------------------------------- floor storage & display
  F({ id: 'shelf_ladder', name: 'Leaning Ladder Shelf', price: 149, stores: ['nestly', 'primo'], emoji: '🪜', desc: 'Four tiers leaning casually against the wall, like it owns the place.', build: ladderShelf, use: look('It leans. On purpose.', 'Books on the bottom, plants up top. Classic.') }),
  F({ id: 'shelf_cube_3x3', name: 'Cube Storage Shelf', price: 129, stores: ['primo', 'nestly'], emoji: '🔳', desc: 'Nine cubbies and four fabric bins. Hides clutter, shows off the rest.', build: cubeShelf, use: look('Out of sight, out of mind. The bins know your secrets.', 'Nine cubes of organisational potential.') }),
  F({ id: 'cabinet_display_glass', name: 'Lit Glass Display Cabinet', category: 'furniture', price: 599, stores: ['nestly', 'luxe'], rarity: 'uncommon', emoji: '🏆', desc: 'Black steel and glass with LED shelf lighting. A museum for your collectibles.', build: displayCabinet, use: { type: 'light', bulb: [0, 1.6, 0.1], intensity: 1.2, distance: 2.5, color: '#fff4e0', ei: 1.8 } }),
  F({ id: 'case_sneaker_wall', name: 'Drop-Front Sneaker Display', price: 279, stores: ['nestly', 'volt'], rarity: 'uncommon', emoji: '👟', desc: 'Eight clear stackable boxes with LED trim. Your grails deserve a stage.', build: sneakerWall, use: { type: 'light', bulb: [0, 0.9, 0.18], intensity: 1.0, distance: 2.2, color: '#d6f0ff', ei: 2 } }),
  F({ id: 'tv_stand_fluted', name: 'Fluted Lacquer TV Stand', price: 449, stores: ['nestly'], emoji: '📺', desc: 'Creamy fluted doors on an oak base. Hides the console clutter beautifully.', build: tvStandFluted, use: look('The fluting catches the light just so.', 'Somewhere inside: 14 tangled HDMI cables.') }),
  F({ id: 'tv_stand_industrial', name: 'Industrial TV Stand', price: 179, stores: ['primo'], emoji: '📺', desc: 'Steel frame and rough-sawn shelves. Loft vibes on a budget.', build: tvStandIndustrial, use: look('Exposed steel. Very warehouse-conversion.', 'Sturdy enough to hold a TV and your hopes.') }),
  F({ id: 'tv_stand_cane', name: 'Walnut & Cane Media Console', price: 529, stores: ['nestly', 'luxe'], emoji: '📺', desc: 'Woven cane doors and tapered legs — a mid-century crowd-pleaser.', build: tvStandCane, use: look('The cane webbing lets the remote signals through. Clever.', 'Retro, but make it now.') }),
  F({ id: 'bar_cart_brass', name: 'Brass Bar Cart', price: 249, stores: ['nestly', 'luxe'], emoji: '🍸', desc: 'Two mirrored tiers, a chrome ice bucket and a couple of bottles for show.', build: barCart, use: { type: 'decor', verb: 'Play bartender', lines: ['You arrange the bottles by height. Then by colour. Then back.', 'Shaken, not stirred. (There is nothing in the shaker.)', 'The cart squeaks charmingly as you nudge it.'] } }),

  // ---------------------------------------------------------- rugs
  RUG({ id: 'rug_persian_red', name: 'Vintage Persian Rug', price: 389, stores: ['nestly', 'luxe'], rarity: 'uncommon', desc: 'Hand-knotted look with a deep red field and a navy medallion.', lines: ['Every room needs one good rug.', 'The pattern hides crumbs remarkably well.'], build: () => flatRug({ w: 2.4, d: 1.7, tex: rugTex2('persian', persianDraw), fringe: '#efe3c8' }) }),
  RUG({ id: 'rug_checker_sage', name: 'Wavy Checker Rug', price: 199, stores: ['nestly'], desc: 'Groovy wobbly checks in sage and cream.', lines: ['The squares are wiggling. Or is it you?', 'Peak 2020s apartment.'], build: () => flatRug({ w: 2.0, d: 1.5, tex: rugTex2('checker', checkerDraw('#9cae9b', '#f1eadf')) }) }),
  RUG({ id: 'rug_round_jute', name: 'Round Jute Rug', price: 149, stores: ['nestly', 'primo'], desc: 'Braided natural jute, 1.6 m across. Earthy and indestructible.', lines: ['Scratchy in the best way.', 'Smells faintly of a summer market.'], build: () => flatRug({ w: 1.6, d: 1.6, round: true, tex: rugTex2('jute', juteDraw, 360, 360), sheen: 0, edge: '#b8925e' }) }),
  RUG({ id: 'rug_shag_cream', name: 'Cloud Shag Rug', price: 179, stores: ['nestly', 'primo'], desc: 'Ankle-deep cream shag. Toes: delighted. Vacuum: terrified.', lines: ['You sink in a full centimetre.', 'Socks off. Immediately.'], build: () => flatRug({ w: 2.0, d: 1.4, tex: rugTex2('shag', shagDraw('#efe6d6')), sheen: 1 }) }),
  RUG({ id: 'rug_runner_stripe', name: 'Striped Hall Runner', price: 89, stores: ['primo', 'nestly'], desc: 'A long cotton runner in navy and cream stripes.', lines: ['A runway for your daily kitchen-to-couch commute.', 'Stripes make the hallway look longer!'], build: () => flatRug({ w: 0.75, d: 2.4, tex: rugTexture(8, '#f1ebe0', '#2f4a6d', '#2f4a6d', 'stripe'), fringe: '#f1ebe0' }) }),
  RUG({ id: 'rug_geo_navy', name: 'Navy Kilim Rug', price: 229, stores: ['nestly'], desc: 'Flatweave kilim with gold diamonds on a deep navy ground.', lines: ['The diamonds line up perfectly with the coffee table. Fate.', 'Flat, tough and good-looking.'], build: () => flatRug({ w: 2.3, d: 1.6, tex: rugTexture(19, '#24324a', '#d9a44a', '#c8553d', 'geo'), fringe: '#e9dfcc' }) }),
  RUG({ id: 'rug_rainbow_arch', name: 'Rainbow Arch Rug', price: 139, stores: ['nestly', 'primo'], desc: 'Tufted retro rainbow in warm earth tones.', lines: ['A rainbow you can stand on.', 'Instant good mood, underfoot.'], build: () => flatRug({ w: 1.8, d: 1.2, tex: rugTex2('rainbow', rainbowDraw) }) }),
  RUG({ id: 'rug_cowhide', name: 'Faux Cowhide Rug', price: 299, stores: ['luxe', 'nestly'], rarity: 'uncommon', desc: 'An organic-shaped faux hide with chocolate spots. No cows were harmed.', lines: ['Moo.', 'Ranch chic, apartment edition.'], build: cowhideRug }),
]);

void sph; void FONT; void plane;
