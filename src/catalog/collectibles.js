// Catalogue: collectibles — four blind-box figure series, two trading card
// sets with boosters, and Stockpile-grade pieces (designer art toys, limited
// figures, signed gear, models, trophies) that resell on the live market.
// Conventions: meters, origin bottom-center, front faces +Z (see docs/CONTENT_GUIDE.md).
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { SERIES, CARD_SETS } from '../items/behaviors/toys.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, capsule, lathe, tube, at, rot, group, extrude } from '../items/kit.js';
import { labelTexture, marble } from '../core/textures.js';
import { seeded } from '../core/utils.js';
import { sgeo, mesh, txt, vgrad, circle, face, zcyl, xcyl, handheldModel } from './tech.js';
import { basketball } from './toys.js';

const PI = Math.PI;
const vin = (c, o = {}) => mat(c, { rough: 0.32, clearcoat: 0.6, ...o });
const eyeM = () => mat('#121212', { rough: 0.1, clearcoat: 1 });
const shineM = () => mat('#ffffff', { emissive: '#ffffff', ei: 0.5 });
const glow = (c, ei = 1.2, o = {}) => mat(c, { emissive: c, ei, rough: 0.3, ...o });

// ------------------------------------------------------------------ figure kit
function figBase(c, key = null) {
  const g = group(at(cyl(0.03, 0.032, 0.006, vin(c), 36), 0, 0.003, 0));
  if (key === 'stars') {
    const top = face(0.058, 0.058, 'figbase:stars', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); const r = seeded(8); for (let i = 0; i < 30; i++) { const a = r() * PI * 2, d = r() * w * 0.45; circle(ctx, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1 + r() * 2.5, i % 5 ? '#ffffff' : '#ffd166'); } }, { transparent: true, th: 256 });
    top.rotation.x = -PI / 2; g.add(at(top, 0, 0.0062, 0));
  }
  return g;
}
// cute face on an (ellipsoid) head: eyes, highlights, blush and mouth hug the surface
function kface(g, head, o = {}) {
  const { y: cy, z: cz = 0, R, sx = 1, sy = 1, sz = 1 } = head;
  const surf = head.flat ? () => cz : (dx, dy) => cz + sz * R * Math.sqrt(Math.max(0.02, 1 - (dx / (R * sx)) ** 2 - (dy / (R * sy)) ** 2));
  const ey = o.ey ?? 0, dx = o.dx ?? R * 0.45, r = o.r ?? R * 0.17;
  for (const s of [-1, 1]) {
    const ez = surf(dx, ey);
    const e = sph(r, o.eyeMat || eyeM(), 12, 10); if (o.tall) e.scale.y = 1.3; g.add(at(e, s * dx, cy + ey, ez - r * 0.35));
    g.add(at(sph(r * 0.33, shineM(), 6, 4), s * dx + r * 0.3, cy + ey + r * 0.4, ez + r * 0.5));
    if (o.blush !== null) { const bx = dx + r * 1.4, by = ey - r * 1.9; const b = sph(r * 1.05, mat(o.blush || '#ff8fab', { rough: 1, opacity: 0.75, transparent: true }), 10, 6); b.scale.set(1, 0.55, 0.3); g.add(at(b, s * bx, cy + by, surf(bx, by) - r * 0.08)); }
  }
  const mm = mat(o.mouthC || '#3b2a1e', { rough: 0.6 });
  const my = ey - r * (o.mouthDrop ?? 1.9); const mz = (o.mouthZ ?? surf(0, my)) + 0.0004;
  if (o.mouth === 'smile' || o.mouth === undefined) g.add(at(rot(torus(r * 0.85, r * 0.2, mm, 4, 12, PI), 0, 0, PI), 0, cy + my + r * 0.4, mz));
  else if (o.mouth === 'w') for (const s of [-1, 1]) g.add(at(rot(torus(r * 0.5, r * 0.18, mm, 4, 10, PI), 0, 0, PI), s * r * 0.5, cy + my + r * 0.3, mz));
  else if (o.mouth === 'o') g.add(at(torus(r * 0.4, r * 0.18, mm, 4, 12), 0, cy + my, mz));
  else if (o.mouth === 'grin') { const gm = sph(r * 0.9, mat('#5c1a1b', { rough: 0.6 }), 10, 6, ); gm.scale.set(1.2, 0.6, 0.3); g.add(at(gm, 0, cy + my, mz - 0.0008)); }
}
function ears(g, m, mi, hy, R, { dx = 0.62, h = 0.016, r = 0.0095, tilt = 0.35, y = 0.75 } = {}) {
  for (const s of [-1, 1]) {
    const e = cone(r, h, m, 12); e.rotation.z = -s * tilt; e.scale.z = 0.7; g.add(at(e, s * R * dx, hy + R * y, -0.002));
    if (mi) { const ei = cone(r * 0.55, h * 0.6, mi, 10); ei.rotation.z = -s * tilt; ei.scale.z = 0.4; g.add(at(ei, s * R * dx * 0.98, hy + R * y - 0.001, 0.0035)); }
  }
}

// ---------------------------------------------------------------- Kawaii Cats
function catFig({ fur, fur2 = '#ffffff', earIn = '#ffafcc', base = '#ffc8dd', patches = [], stripes = null, extra = null, noBase = false, mat_ = null }) {
  const g = new THREE.Group();
  if (!noBase) g.add(figBase(base));
  const y0 = noBase ? 0 : 0.006;
  const m = mat_ || vin(fur), m2 = mat_ || vin(fur2);
  const body = sph(0.018, m, 20, 14); body.scale.set(1.05, 1.0, 0.95); g.add(at(body, 0, y0 + 0.017, 0));
  const chest = sph(0.012, m2, 14, 10); chest.scale.set(1, 1.1, 0.5); g.add(at(chest, 0, y0 + 0.018, 0.012));
  for (const s of [-1, 1]) g.add(at(sph(0.0068, m2, 10, 8), s * 0.009, y0 + 0.005, 0.014));
  g.add(tube([[0, y0 + 0.008, -0.015], [0.018, y0 + 0.01, -0.022], [0.027, y0 + 0.028, -0.016], [0.022, y0 + 0.042, -0.01]], 0.0045, m, 14, 8));
  const hy = y0 + 0.05, R = 0.026;
  const head = sph(R, m, 28, 20); head.scale.set(1.15, 0.95, 1); g.add(at(head, 0, hy, 0));
  const muz = sph(0.0085, m2, 12, 10); muz.scale.set(1.5, 0.85, 0.55); g.add(at(muz, 0, hy - 0.01, R * 0.9));
  g.add(at(sph(0.0024, vin('#ff8fab'), 8, 6), 0, hy - 0.0065, R * 0.97));
  for (const s of [-1, 1]) g.add(at(rot(torus(0.0024, 0.0007, mat('#3b2a1e'), 4, 10, PI), 0, 0, PI), s * 0.0024, hy - 0.0098, R * 0.955));
  ears(g, m, earIn ? vin(earIn) : null, hy, R);
  kface(g, { y: hy, R, sx: 1.15, sy: 0.95 }, { ey: 0.002, dx: 0.012, r: 0.0042, mouth: null });
  patches.forEach(([c, x, y, z, r, sc]) => { const p = sph(r, vin(c), 12, 10); if (sc) p.scale.set(...sc); g.add(at(p, x, y0 + y, z)); });
  if (stripes) for (let i = 0; i < 3; i++) { const st = capsule(0.0022, 0.012, vin(stripes)); st.rotation.set(PI / 2 - 0.6, 0, (i - 1) * 0.4); g.add(at(st, (i - 1) * 0.008, hy + 0.023, 0.006)); }
  if (extra) extra(g, { hy, R, y0, m, m2 });
  return g;
}
function sushiCat() {
  const g = group(figBase('#ffc8dd'));
  const rice = rbox(0.05, 0.022, 0.034, 0.009, mat('#fbfaf5', { rough: 0.75 })); g.add(at(rice, 0, 0.017, 0));
  const cat = catFig({ fur: '#9aa0a8', fur2: '#f1f3f5', noBase: true, stripes: '#6c757d' }); cat.scale.setScalar(0.82); cat.position.y = 0.024; g.add(cat);
  g.add(at(rbox(0.014, 0.0262, 0.0385, 0.002, mat('#1b3a2a', { rough: 0.6 })), 0, 0.0172, 0));
  return g;
}
function bobaCat() {
  const g = group(figBase('#ffc8dd'));
  const cup = lathe([[0.019, 0], [0.024, 0.045]], mat('#f4f9fb', { rough: 0.05, opacity: 0.35, transparent: true, side: THREE.DoubleSide }), 28);
  g.add(at(cup, 0, 0.006, 0));
  g.add(at(cyl(0.0225, 0.0185, 0.03, mat('#c8a27a', { rough: 0.3, opacity: 0.9, transparent: true }), 24), 0, 0.022, 0));
  for (let i = 0; i < 9; i++) { const a = i * 2.3; g.add(at(sph(0.0045, mat('#2b1a12', { rough: 0.2 }), 8, 6), Math.cos(a) * 0.012, 0.011 + (i % 3) * 0.004, Math.sin(a) * 0.012)); }
  const cat = catFig({ fur: '#f6bd60', fur2: '#fff8ee', noBase: true }); cat.scale.setScalar(0.85); cat.position.y = 0.022; g.add(cat);
  g.add(at(rot(cyl(0.003, 0.003, 0.07, mat('#ff70a6', { rough: 0.3 }), 8), 0.25, 0, -0.35), 0.016, 0.06, -0.008));
  return g;
}
function luckyCat() {
  const gold = mat('#e8b84a', { rough: 0.18, metal: 0.95 });
  return catFig({ fur: '#e8b84a', mat_: gold, earIn: '#c1121f', base: '#c1121f', extra: (g, { hy, y0 }) => {
    g.add(at(rot(torus(0.017, 0.0028, vin('#c1121f'), 6, 24), PI / 2, 0, 0), 0, hy - 0.022, 0.002));
    g.add(at(sph(0.0045, MAT.gold(), 10, 8), 0, hy - 0.027, 0.018));
    const arm = capsule(0.0055, 0.016, gold); arm.rotation.z = -0.3; g.add(at(arm, -0.02, hy - 0.002, 0.008));
    g.add(at(sph(0.007, gold, 10, 8), -0.023, hy + 0.012, 0.01));
    const coin = sph(0.009, mat('#ffd166', { rough: 0.15, metal: 1 }), 14, 10); coin.scale.set(0.75, 1.2, 0.25); g.add(at(coin, 0.012, y0 + 0.02, 0.019));
    g.add(at(face(0.014, 0.008, 'lucky:koban', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); txt(ctx, '福', w / 2, h / 2, h * 0.8, '#7a2e1e'); }, { transparent: true, th: 72 }), 0.012, y0 + 0.02, 0.0215));
  } });
}

// ---------------------------------------------------------------- Space Dinos
function dinoFig({ skin, belly = '#fefae0', suit = null, extra = null, noBase = false, m_ = null }) {
  const g = new THREE.Group();
  if (!noBase) g.add(figBase('#1d3557', 'stars'));
  const y0 = noBase ? 0 : 0.006;
  const m = m_ || vin(skin), mb = m_ || vin(belly), ms = suit ? vin(suit) : m;
  const body = sph(0.019, ms, 20, 14); body.scale.set(1, 1.1, 1); g.add(at(body, 0, y0 + 0.021, 0));
  if (!suit) { const b = sph(0.013, mb, 14, 10); b.scale.set(1, 1.2, 0.5); g.add(at(b, 0, y0 + 0.02, 0.013)); }
  for (const s of [-1, 1]) { g.add(at(capsule(0.0065, 0.008, ms), s * 0.009, y0 + 0.006, 0.004)); const a = capsule(0.0035, 0.008, ms); a.rotation.x = -1.1; g.add(at(a, s * 0.014, y0 + 0.026, 0.012)); }
  g.add(tube([[0, y0 + 0.014, -0.014], [0, y0 + 0.01, -0.03], [0.008, y0 + 0.006, -0.042]], 0.0065, m, 12, 8));
  const hy = y0 + 0.052, R = 0.022;
  const head = sph(R, m, 28, 20); head.scale.set(1, 0.92, 1.05); g.add(at(head, 0, hy, 0.003));
  const sn = sph(0.014, m, 18, 12); sn.scale.set(1.2, 0.8, 1); g.add(at(sn, 0, hy - 0.007, 0.019));
  for (const s of [-1, 1]) g.add(at(sph(0.0016, eyeM(), 6, 4), s * 0.004, hy - 0.004, 0.0325));
  kface(g, { y: hy, z: 0.003, R, sy: 0.92, sz: 1.05 }, { ey: 0.006, dx: 0.0115, r: 0.0042, mouth: 'smile', mouthZ: 0.0322, mouthDrop: 4.2 });
  if (extra) extra(g, { hy, R, y0, m, ms });
  return g;
}
function helmet(g, hy) {
  g.add(at(sph(0.034, MAT.glass('#e8f4ff', 0.22), 28, 20), 0, hy + 0.002, 0.004));
  g.add(at(rot(torus(0.026, 0.004, vin('#e9ecef'), 8, 28), PI / 2, 0, 0), 0, hy - 0.028, 0.004));
}
const astroRex = () => dinoFig({ skin: '#80b918', suit: '#f1f3f5', extra: (g, { hy, y0 }) => {
  helmet(g, hy);
  g.add(at(rbox(0.026, 0.026, 0.012, 0.004, vin('#adb5bd')), 0, y0 + 0.024, -0.02));
  g.add(at(face(0.014, 0.01, 'rex:patch', (ctx, w, h) => { ctx.fillStyle = '#1d3557'; ctx.fillRect(0, 0, w, h); txt(ctx, '★ REX-1', w / 2, h / 2, h * 0.35, '#ffd166'); }, { th: 90 }), 0, y0 + 0.028, 0.0185));
} });
const stegoPilot = () => dinoFig({ skin: '#f4a261', belly: '#ffe8d6', extra: (g, { hy, y0 }) => {
  for (let i = 0; i < 5; i++) { const t = i / 4; const p = cone(0.007, 0.014, vin('#e76f51'), 4); p.scale.z = 0.35; p.rotation.x = -0.4 - t * 0.9; g.add(at(p, 0, hy + 0.012 - t * 0.04, -0.012 - t * 0.022)); }
  for (const s of [-1, 1]) g.add(at(torus(0.0055, 0.0018, vin('#6c757d'), 6, 16), s * 0.008, hy + 0.017, 0.018));
  g.add(at(rot(torus(0.019, 0.002, vin('#6c757d'), 6, 24, PI), 0, 0, 0), 0, hy + 0.008, 0.004));
  g.add(tube([[-0.01, y0 + 0.034, 0.016], [0, y0 + 0.031, 0.02], [0.012, y0 + 0.034, 0.017], [0.02, y0 + 0.024, 0.0]], 0.003, vin('#e63946'), 12, 6));
} });
const triRover = () => dinoFig({ skin: '#4cc9f0', belly: '#e0fbfc', extra: (g, { hy }) => {
  const fr = cyl(0.028, 0.028, 0.004, vin('#7209b7'), 24, undefined); fr.rotation.x = PI / 2 - 0.35; g.add(at(fr, 0, hy + 0.01, -0.012));
  for (let i = 0; i < 7; i++) { const a = PI * (0.1 + i * 0.8 / 6); g.add(at(sph(0.003, vin('#ffd166'), 6, 4), Math.cos(a) * 0.026, hy + 0.01 + Math.sin(a) * 0.024, -0.008)); }
  for (const s of [-1, 1]) { const h = cone(0.0035, 0.016, vin('#fefae0'), 10); h.rotation.x = 0.9; g.add(at(h, s * 0.01, hy + 0.017, 0.016)); }
  const n = cone(0.003, 0.01, vin('#fefae0'), 10); n.rotation.x = 1.2; g.add(at(n, 0, hy - 0.002, 0.034));
} });
function jetPtero() {
  const g = group(figBase('#1d3557', 'stars'));
  const m = vin('#b5838d'), mw = vin('#e5989b', { side: THREE.DoubleSide });
  const body = sph(0.016, m, 18, 12); body.scale.set(1, 1.3, 0.9); g.add(at(body, 0, 0.032, 0));
  const head = sph(0.017, m, 20, 14); g.add(at(head, 0, 0.06, 0.004));
  const beak = cone(0.008, 0.026, vin('#ffd166'), 10); beak.rotation.x = PI / 2; g.add(at(beak, 0, 0.056, 0.03));
  const crest = cone(0.006, 0.02, m, 8); crest.rotation.x = -1.9; g.add(at(crest, 0, 0.072, -0.016));
  kface(g, { y: 0.06, z: 0.004, R: 0.017 }, { ey: 0.004, dx: 0.008, r: 0.0034, mouth: null });
  for (const s of [-1, 1]) {
    const w = extrude([[0, 0], [0.045, 0.012], [0.04, -0.006], [0.028, -0.012], [0.014, -0.016]], 0.002, mw, 0.0005, undefined, 'ptero:wing');
    w.scale.x = s; w.rotation.y = -s * 0.35; g.add(at(w, s * 0.012, 0.042, -0.004));
    g.add(at(cyl(0.006, 0.006, 0.026, vin('#adb5bd'), 14), s * 0.008, 0.03, -0.018));
    g.add(at(rot(cone(0.0055, 0.016, glow('#ff9f1c', 1.6), 10), PI, 0, 0), s * 0.008, 0.01, -0.018));
  }
  for (const s of [-1, 1]) g.add(at(capsule(0.0035, 0.008, m), s * 0.006, 0.014, 0.004));
  return g;
}
function moonBronto() {
  const g = group(figBase('#1d3557', 'stars'));
  const rock = sph(0.026, vin('#adb5bd', { rough: 0.8, clearcoat: 0 }), 18, 10); rock.scale.set(1.05, 0.38, 1); g.add(at(rock, 0, 0.008, 0));
  for (const [x, z, r] of [[-0.012, 0.01, 0.005], [0.014, -0.006, 0.004]]) { const c = cyl(r, r * 0.7, 0.002, vin('#868e96', { rough: 0.9, clearcoat: 0 }), 12); g.add(at(c, x, 0.0165, z)); }
  const m = vin('#9d4edd'), mb = vin('#e0aaff');
  const body = sph(0.02, m, 20, 14); body.scale.set(1, 0.85, 1.25); g.add(at(body, 0, 0.033, -0.004));
  const bl = sph(0.015, mb, 14, 10); bl.scale.set(1, 0.6, 1.2); g.add(at(bl, 0, 0.026, 0.0));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) g.add(at(cyl(0.005, 0.0055, 0.016, m, 10), x * 0.011, 0.022, z * 0.012 - 0.004));
  g.add(tube([[0, 0.04, 0.012], [0, 0.058, 0.02], [0, 0.072, 0.018]], 0.0062, m, 12, 8));
  g.add(tube([[0, 0.032, -0.024], [0.008, 0.026, -0.038], [0.018, 0.022, -0.044]], 0.005, m, 10, 6));
  const head = sph(0.012, m, 18, 12); head.scale.set(1, 0.9, 1.25); g.add(at(head, 0, 0.078, 0.024));
  kface(g, { y: 0.078, z: 0.024, R: 0.012, sy: 0.9, sz: 1.25 }, { ey: 0.003, dx: 0.0058, r: 0.0026, mouth: 'smile' });
  g.add(at(rot(cyl(0.0006, 0.0006, 0.03, mat('#888'), 4), 0, 0, -0.2), 0.022, 0.03, 0.012));
  g.add(at(face(0.014, 0.01, 'bronto:flag', (ctx, w, h) => { ctx.fillStyle = '#e63946'; ctx.fillRect(0, 0, w, h); txt(ctx, '★', w / 2, h / 2, h * 0.8, '#fff'); }, { th: 72 }), 0.032, 0.04, 0.012));
  return g;
}
function ufoRaptor() {
  const g = group(figBase('#1d3557', 'stars'));
  g.add(at(cyl(0.003, 0.006, 0.014, glow('#7bf1a8', 1.2, { opacity: 0.6, transparent: true }), 10), 0, 0.013, 0));
  const saucer = lathe([[0.001, 0], [0.012, 0], [0.036, 0.006], [0.038, 0.009], [0.03, 0.013], [0.001, 0.013]], MAT.metal('#c8ccd2', 0.2), 36);
  g.add(at(saucer, 0, 0.02, 0));
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.add(at(sph(0.0022, glow(['#ff4fa3', '#ffd166', '#5ef2ff'][i % 3], 1.5), 6, 4), Math.cos(a) * 0.034, 0.028, Math.sin(a) * 0.034)); }
  const m = vin('#e63946');
  const head = sph(0.015, m, 18, 12); head.scale.set(1, 0.9, 1.25); g.add(at(head, 0, 0.05, 0.004));
  const sn = sph(0.009, m, 14, 10); sn.scale.set(1, 0.7, 1.3); g.add(at(sn, 0, 0.046, 0.018));
  const neck = cyl(0.009, 0.012, 0.016, m, 14); g.add(at(neck, 0, 0.038, 0));
  kface(g, { y: 0.05, z: 0.004, R: 0.015, sz: 1.25 }, { ey: 0.004, dx: 0.0075, r: 0.0032, mouth: 'grin', mouthZ: 0.028, mouthDrop: 2.6 });
  for (const s of [-1, 1]) { const c = cone(0.0025, 0.008, vin('#ffd166'), 6); c.rotation.z = -s * 0.5; g.add(at(c, s * 0.008, 0.064, -0.004)); }
  g.add(at(hemi_(0.022, MAT.glass('#d8f3ff', 0.25)), 0, 0.033, 0));
  return g;
}
function hemi_(r, m) { return mesh(sgeo(`hemi:${r}`, () => new THREE.SphereGeometry(r, 24, 12, 0, PI * 2, 0, PI / 2)), m); }
const galaxyRex = () => {
  const holo = mat('#9d4edd', { rough: 0.05, metal: 0.4, clearcoat: 1, emissive: '#3a0ca3', ei: 0.6, opacity: 0.88, transparent: true });
  return dinoFig({ skin: '#9d4edd', m_: holo, extra: (g, { hy, y0 }) => {
    const r = seeded(12);
    for (let i = 0; i < 14; i++) { const a = r() * PI * 2; g.add(at(sph(0.0016, glow(i % 3 ? '#ffffff' : '#ffd166', 2), 6, 4), Math.cos(a) * 0.012, y0 + 0.01 + r() * 0.05, Math.sin(a) * 0.012)); }
    for (let i = 0; i < 4; i++) { const sp = cone(0.004, 0.01, glow('#5ef2ff', 1.5), 6); sp.rotation.x = -0.5 - i * 0.3; g.add(at(sp, 0, hy + 0.018 - i * 0.012, -0.012 - i * 0.009)); }
  } });
};

// ---------------------------------------------------------------- Food Friends
const FB = '#d8f3dc';
function slicePts(cx = 0) {
  const p = [[-0.022, 0], [0.022, 0], [0.023, 0.034]];
  for (let i = 0; i <= 10; i++) { const a = -0.2 + i / 10 * (PI * 0.55); p.push([0.012 + Math.cos(a) * 0.013, 0.038 + Math.sin(a) * 0.012]); }
  for (let i = 0; i <= 10; i++) { const a = PI * 0.45 + i / 10 * (PI * 0.75); p.push([-0.012 + Math.cos(a) * 0.013, 0.038 + Math.sin(a) * 0.012]); }
  p.push([-0.023, 0.034]);
  return p.map(([x, y]) => [x + cx, y]);
}
function toastFig() {
  const g = group(figBase(FB));
  const pts = slicePts();
  g.add(at(extrude(pts, 0.012, vin('#c68642'), 0.002, undefined, 'toast:crust'), 0, 0.009, 0));
  const inner = pts.map(([x, y]) => [x * 0.84, y * 0.86 + 0.003]);
  g.add(at(extrude(inner, 0.0135, vin('#f8e1b5'), 0.0015, undefined, 'toast:crumb'), 0, 0.009, 0));
  const butter = rbox(0.014, 0.004, 0.011, 0.0015, vin('#ffe066')); butter.rotation.set(0.15, 0.3, -0.1); g.add(at(butter, 0.004, 0.06, 0.004));
  kface(g, { y: 0.034, z: 0.0084, R: 0.03, flat: true }, { ey: 0, dx: 0.008, r: 0.0034, mouth: 'smile' });
  for (const s of [-1, 1]) { g.add(at(capsule(0.0032, 0.006, vin('#c68642')), s * 0.009, 0.006, 0.002)); const a = capsule(0.0028, 0.01, vin('#c68642')); a.rotation.z = s * 0.9; g.add(at(a, s * 0.027, 0.026, 0)); }
  return g;
}
function roundedTri(r, R) {
  const pts = [];
  for (let k = 0; k < 3; k++) { const c = -PI / 2 + k * PI * 2 / 3 + PI; const cx = Math.cos(c + PI) * R, cy = Math.sin(c + PI) * R; for (let i = 0; i <= 8; i++) { const a = c + PI - PI / 3 + i / 8 * (PI * 2 / 3); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } }
  return pts;
}
function onigiriFig() {
  const g = group(figBase(FB));
  const tri = roundedTri(0.011, 0.02).map(([x, y]) => [x, -y]);
  const minY = Math.min(...tri.map((p) => p[1]));
  g.add(at(extrude(tri.map(([x, y]) => [x, y - minY]), 0.022, vin('#fbfbf8', { rough: 0.7, clearcoat: 0.2 }), 0.003, undefined, 'onigiri'), 0, 0.006, 0));
  g.add(at(rbox(0.024, 0.016, 0.03, 0.002, mat('#1b3a2a', { rough: 0.6 })), 0, 0.015, 0));
  kface(g, { y: 0.034, z: 0.0142, R: 0.03, flat: true }, { ey: 0.002, dx: 0.008, r: 0.0034, mouth: 'o' });
  g.add(at(sph(0.0035, vin('#e63946'), 8, 6), 0.006, 0.05, 0.012));
  return g;
}
function avocadoFig() {
  const g = group(figBase(FB));
  const skin = sph(0.025, vin('#386641'), 24, 16); skin.scale.set(1, 1.28, 0.62); g.add(at(skin, 0, 0.038, -0.002));
  const flesh = sph(0.022, vin('#dde5b6'), 24, 16); flesh.scale.set(1, 1.25, 0.55); g.add(at(flesh, 0, 0.038, 0.002));
  const fl2 = sph(0.016, vin('#a7c957'), 20, 12); fl2.scale.set(1, 1.2, 0.5); g.add(at(fl2, 0, 0.036, 0.004));
  const pit = sph(0.009, vin('#7f4f24'), 16, 12); pit.scale.z = 0.7; g.add(at(pit, 0, 0.028, 0.0095));
  kface(g, { y: 0.05, z: 0.004, R: 0.016, sx: 1, sy: 1.2, sz: 0.5 }, { ey: 0, dx: 0.0065, r: 0.0028, mouth: 'smile', mouthDrop: 2.2 });
  for (const s of [-1, 1]) { const a = capsule(0.0028, 0.01, vin('#386641')); a.rotation.z = s * 0.7; g.add(at(a, s * 0.026, 0.032, 0)); g.add(at(capsule(0.003, 0.004, vin('#386641')), s * 0.008, 0.009, 0)); }
  return g;
}
function donutFig() {
  const g = group(figBase(FB));
  const dough = torus(0.018, 0.011, vin('#e9b872'), 16, 32); g.add(at(dough, 0, 0.037, 0));
  const icing = torus(0.018, 0.0105, vin('#ff8fab'), 16, 32); icing.scale.z = 0.62; g.add(at(icing, 0, 0.038, 0.0035));
  const cols = ['#ffffff', '#ffd166', '#5ef2ff', '#7bf1a8', '#7b2cbf'];
  for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2 + 0.2; if (a > 1.0 && a < 2.2) continue; const s = capsule(0.0012, 0.004, vin(cols[i % 5])); s.rotation.set(PI / 2, 0, a * 3); g.add(at(s, Math.cos(a) * 0.019, 0.038 + Math.sin(a) * 0.019, 0.0105)); }
  kface(g, { y: 0.055, z: 0.004, R: 0.012, sz: 0.62 }, { ey: 0.002, dx: 0.008, r: 0.0028, mouth: 'smile', mouthDrop: 1.6 });
  for (const s of [-1, 1]) g.add(at(capsule(0.0032, 0.006, vin('#e9b872')), s * 0.01, 0.009, 0));
  return g;
}
function dumplingFig() {
  const g = group(figBase(FB));
  const d = sph(0.026, vin('#f8f4ec', { rough: 0.5 }), 28, 18); d.scale.set(1.2, 0.85, 0.95); g.add(at(d, 0, 0.022, 0));
  for (let i = 0; i < 7; i++) { const t = (i - 3) / 3; const p = sph(0.0065, vin('#f1ebde', { rough: 0.5 }), 10, 8); p.scale.set(0.6, 1, 0.7); p.rotation.z = t * 0.4; g.add(at(p, t * 0.022, 0.042 - Math.abs(t) * 0.006, -0.002)); }
  kface(g, { y: 0.024, z: 0, R: 0.026, sx: 1.2, sy: 0.85, sz: 0.95 }, { ey: 0.002, dx: 0.009, r: 0.0034, mouth: 'w' });
  return g;
}
function strawberryMilk() {
  const g = group(figBase(FB));
  const W = 0.03, H = 0.036;
  const pink = vin('#ffafcc');
  g.add(at(rbox(W, H, W, 0.003, pink), 0, 0.006 + H / 2, 0));
  const roof = extrude([[-W / 2, 0], [W / 2, 0], [0, 0.012]], W * 0.98, vin('#ffc8dd'), 0.001, undefined, 'milkroof'); roof.rotation.y = PI / 2; g.add(at(roof, 0, 0.006 + H, 0));
  g.add(at(box(0.004, 0.006, W * 0.98, vin('#ffc8dd')), 0, 0.006 + H + 0.014, 0));
  g.add(at(face(W * 0.86, 0.012, 'smilk:label', (ctx, w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); txt(ctx, '🍓 MILK', w / 2, h / 2 + 1, h * 0.62, '#e5383b', { max: w * 0.9 }); }, { th: 104 }), 0, 0.014, W / 2 + 0.0004));
  kface(g, { y: 0.032, z: W / 2 + 0.0005, R: 0.03, flat: true }, { ey: 0.002, dx: 0.0075, r: 0.0032, mouth: 'smile' });
  g.add(at(rot(cyl(0.0022, 0.0022, 0.03, vin('#ffffff'), 8), 0, 0, -0.25), 0.006, 0.062, 0.004));
  return g;
}
function goldenCroissant() {
  const g = group(figBase('#ffd166'));
  const gold = mat('#e2a93b', { rough: 0.2, metal: 0.9 });
  const segs = [[-0.026, 0.012, 0.6, 0.0075], [-0.014, 0.019, 0.25, 0.01], [0, 0.021, 0, 0.012], [0.014, 0.019, -0.25, 0.01], [0.026, 0.012, -0.6, 0.0075]];
  for (const [x, y, rz, r] of segs) { const s = capsule(r, 0.006, gold); s.rotation.z = PI / 2 + rz; s.scale.z = 0.8; g.add(at(s, x, y + 0.006, 0)); }
  kface(g, { y: 0.027, z: 0, R: 0.012, sz: 0.8 }, { ey: 0, dx: 0.0055, r: 0.0026, mouth: 'smile', mouthDrop: 1.6 });
  const crown = cyl(0.008, 0.009, 0.006, MAT.gold(), 5); g.add(at(crown, 0, 0.042, 0));
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; g.add(at(cone(0.002, 0.005, MAT.gold(), 5), Math.cos(a) * 0.0075, 0.047, Math.sin(a) * 0.0075)); }
  g.add(at(sph(0.0022, vin('#e63946'), 8, 6), 0, 0.043, 0.0085));
  return g;
}

// ---------------------------------------------------------------- Cryptid Crew
const CB = '#2d3a2e';
function forestBase() {
  const g = figBase(CB);
  for (const [x, z] of [[-0.02, -0.016], [0.022, -0.012]]) g.add(at(cone(0.006, 0.016, vin('#1b4332'), 7), x, 0.014, z));
  return g;
}
function bigfootFig() {
  const g = group(forestBase());
  const fur = vin('#7f5539', { rough: 0.6 }), skin = vin('#d4a373');
  const b = sph(0.02, fur, 20, 14); b.scale.set(1.05, 1.2, 0.9); g.add(at(b, 0, 0.027, 0));
  const hy = 0.058;
  g.add(at(sph(0.02, fur, 24, 16), 0, hy, 0));
  const fp = sph(0.013, skin, 18, 12); fp.scale.set(1.15, 1, 0.5); g.add(at(fp, 0, hy - 0.002, 0.014));
  kface(g, { y: hy - 0.002, z: 0.014, R: 0.013, sx: 1.15, sz: 0.5 }, { ey: 0.002, dx: 0.0055, r: 0.0026, mouth: 'smile', mouthDrop: 2.0 });
  for (let i = 0; i < 4; i++) { const t = cone(0.004, 0.009, fur, 6); t.rotation.z = (i - 1.5) * 0.4; g.add(at(t, (i - 1.5) * 0.006, hy + 0.02, 0)); }
  const up = capsule(0.0055, 0.018, fur); up.rotation.z = 2.6; g.add(at(up, 0.022, 0.05, 0.004));
  g.add(at(sph(0.006, skin, 10, 8), 0.03, 0.064, 0.006));
  const dn = capsule(0.0055, 0.016, fur); dn.rotation.z = 0.3; g.add(at(dn, -0.022, 0.026, 0.004));
  for (const s of [-1, 1]) { const f = sph(0.008, skin, 12, 8); f.scale.set(0.9, 0.45, 1.5); g.add(at(f, s * 0.009, 0.009, 0.008)); }
  return g;
}
function nessieFig() {
  const g = group(figBase('#0077b6'));
  g.add(at(cyl(0.03, 0.03, 0.004, mat('#48cae4', { rough: 0.1, clearcoat: 1, opacity: 0.85, transparent: true }), 32), 0, 0.008, 0));
  const m = vin('#2a9d8f'), mb = vin('#e9f5db');
  for (const [z, r] of [[-0.006, 0.01], [-0.022, 0.007]]) { const h = torus(r, 0.0055, m, 10, 20, PI); h.rotation.y = PI / 2; g.add(at(h, 0, 0.009, z)); }
  g.add(tube([[0, 0.008, 0.014], [0, 0.03, 0.016], [0, 0.048, 0.01], [0, 0.058, 0.012]], 0.0065, m, 16, 8));
  const head = sph(0.012, m, 18, 12); head.scale.set(1, 0.85, 1.35); g.add(at(head, 0, 0.062, 0.016));
  kface(g, { y: 0.064, z: 0.016, R: 0.012, sy: 0.85, sz: 1.35 }, { ey: 0.002, dx: 0.0055, r: 0.0026, mouth: 'smile', mouthDrop: 2.2 });
  for (const s of [-1, 1]) { const sp = cone(0.0025, 0.007, mb, 6); g.add(at(sp, s * 0.004, 0.072, 0.012)); }
  for (let i = 0; i < 3; i++) g.add(at(rot(torus(0.008 + i * 0.006, 0.0008, mat('#caf0f8', { rough: 0.2 }), 4, 24), PI / 2, 0, 0), 0, 0.0102, 0.014));
  return g;
}
function mothmanFig() {
  const g = group(forestBase());
  const m = vin('#3d3b45'), wing = vin('#5e548e', { side: THREE.DoubleSide });
  const b = sph(0.019, m, 20, 14); b.scale.set(1, 1.35, 0.9); g.add(at(b, 0, 0.032, 0));
  g.add(at(rot(torus(0.014, 0.006, vin('#f1e3d3', { rough: 0.9 }), 8, 20), PI / 2, 0, 0), 0, 0.048, 0));
  g.add(at(sph(0.016, m, 20, 14), 0, 0.062, 0.002));
  for (const s of [-1, 1]) {
    const e = sph(0.0058, glow('#ff1e1e', 2.2), 12, 8); e.scale.set(1, 1.2, 0.6); g.add(at(e, s * 0.0075, 0.064, 0.0145));
    const w = sph(0.026, wing, 18, 12); w.scale.set(1, 1.3, 0.12); w.rotation.set(0, s * 0.5, s * -0.5); g.add(at(w, s * 0.024, 0.045, -0.01));
    g.add(at(rot(cyl(0.004, 0.004, 0.001, vin('#ff9f1c'), 12), PI / 2, s * 0.5, 0), s * 0.032, 0.054, -0.0035));
    g.add(tube([[s * 0.004, 0.076, 0.004], [s * 0.01, 0.088, 0.006], [s * 0.016, 0.092, 0.0]], 0.0009, m, 8, 4));
  }
  return g;
}
function jackalopeFig() {
  const g = group(forestBase());
  const m = vin('#c8a27a'), m2 = vin('#fff1e6'), antler = vin('#f2e8cf', { rough: 0.5 });
  const b = sph(0.019, m, 20, 14); b.scale.set(1, 1.05, 1); g.add(at(b, 0, 0.022, 0));
  const bl = sph(0.012, m2, 14, 10); bl.scale.set(1, 1.1, 0.5); g.add(at(bl, 0, 0.022, 0.013));
  g.add(at(sph(0.007, m2, 10, 8), 0, 0.016, -0.02));
  const hy = 0.052; const head = sph(0.019, m, 22, 16); head.scale.set(1.1, 0.95, 1); g.add(at(head, 0, hy, 0.003));
  kface(g, { y: hy, z: 0.003, R: 0.019, sx: 1.1, sy: 0.95 }, { ey: 0.002, dx: 0.0075, r: 0.0029, mouth: 'w' });
  for (const s of [-1, 1]) {
    const e = capsule(0.0045, 0.02, m); e.rotation.z = -s * 0.35; e.scale.z = 0.5; g.add(at(e, s * 0.013, hy + 0.024, -0.006));
    g.add(tube([[s * 0.006, hy + 0.016, 0.002], [s * 0.01, hy + 0.03, 0.004], [s * 0.016, hy + 0.04, 0.002]], 0.0018, antler, 8, 5));
    g.add(tube([[s * 0.0095, hy + 0.028, 0.004], [s * 0.003, hy + 0.036, 0.006]], 0.0014, antler, 4, 5));
    g.add(tube([[s * 0.013, hy + 0.035, 0.003], [s * 0.022, hy + 0.038, 0.004]], 0.0013, antler, 4, 5));
    g.add(at(capsule(0.004, 0.006, m), s * 0.009, 0.007, 0.01));
  }
  return g;
}
function yetiFig() {
  const g = group(figBase('#a2d2ff'));
  const fur = vin('#f8f9fa', { rough: 0.7 }), skin = vin('#90b4ce');
  const r = seeded(21);
  const b = sph(0.021, fur, 20, 14); b.scale.set(1.1, 1.15, 0.95); g.add(at(b, 0, 0.028, 0));
  for (let i = 0; i < 10; i++) { const a = r() * PI * 2; g.add(at(sph(0.007, fur, 10, 8), Math.cos(a) * 0.019, 0.016 + r() * 0.03, Math.sin(a) * 0.016)); }
  const hy = 0.06; g.add(at(sph(0.02, fur, 22, 16), 0, hy, 0));
  const fp = sph(0.012, skin, 18, 12); fp.scale.set(1.2, 1, 0.5); g.add(at(fp, 0, hy - 0.002, 0.015));
  kface(g, { y: hy - 0.002, z: 0.015, R: 0.012, sx: 1.2, sz: 0.5 }, { ey: 0.002, dx: 0.005, r: 0.0025, mouth: 'o', mouthDrop: 2.0, blush: '#ff8fab' });
  for (const s of [-1, 1]) { const h = cone(0.004, 0.012, vin('#adb5bd'), 8); h.rotation.z = -s * 0.6; g.add(at(h, s * 0.016, hy + 0.017, 0)); const a = capsule(0.007, 0.016, fur); a.rotation.z = s * 0.35; g.add(at(a, s * 0.025, 0.03, 0.004)); }
  return g;
}
function krakenFig() {
  const g = group(figBase('#023e8a'));
  const m = vin('#b5179e'), dots = vin('#f7aef8');
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.3; const c = Math.cos(a), s = Math.sin(a); g.add(tube([[c * 0.008, 0.02, s * 0.008], [c * 0.02, 0.01, s * 0.02], [c * 0.03, 0.008, s * 0.03], [c * 0.034 - s * 0.006, 0.014, s * 0.034 + c * 0.006]], 0.0042, m, 14, 8)); g.add(at(sph(0.0016, dots, 6, 4), c * 0.024, 0.0125, s * 0.024)); }
  const head = sph(0.022, m, 24, 18); head.scale.set(1, 1.25, 1); g.add(at(head, 0, 0.042, 0));
  for (let i = 0; i < 5; i++) { const a = i * 1.3; g.add(at(sph(0.003, dots, 8, 6), Math.cos(a) * 0.012, 0.055 + (i % 2) * 0.008, -0.012 + Math.sin(a) * 0.006)); }
  kface(g, { y: 0.038, z: 0, R: 0.022, sy: 1.25 }, { ey: 0, dx: 0.009, r: 0.0042, mouth: 'o', tall: true });
  return g;
}
function visitorFig() {
  const g = group(figBase('#1b1b1b'));
  const ring = face(0.058, 0.058, 'visitor:crop', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#7bf1a8'; ctx.lineWidth = 3; for (const r of [26, 18, 10]) { ctx.beginPath(); ctx.arc(w / 2, h / 2, r * w / 64, 0, 7); ctx.stroke(); } }, { transparent: true, emissive: true, ei: 1.2, th: 256 });
  ring.rotation.x = -PI / 2; g.add(at(ring, 0, 0.0062, 0));
  const skin = mat('#9ef01a', { rough: 0.25, clearcoat: 0.8, emissive: '#38b000', ei: 0.55 });
  const b = capsule(0.009, 0.016, skin); g.add(at(b, 0, 0.026, 0));
  for (const s of [-1, 1]) { g.add(at(capsule(0.0035, 0.012, skin), s * 0.005, 0.01, 0)); const a = capsule(0.0028, 0.016, skin); a.rotation.z = s * 0.35; g.add(at(a, s * 0.013, 0.026, 0.002)); }
  const head = sph(0.022, skin, 28, 20); head.scale.set(1.05, 1.2, 0.95); g.add(at(head, 0, 0.06, 0));
  for (const s of [-1, 1]) { const e = sph(0.0085, mat('#050505', { rough: 0.05, clearcoat: 1 }), 16, 12); e.scale.set(0.75, 1.25, 0.45); e.rotation.z = s * 0.55; g.add(at(e, s * 0.0095, 0.058, 0.0175)); g.add(at(sph(0.0018, shineM(), 6, 4), s * 0.0085 + 0.002, 0.063, 0.021)); }
  g.add(at(rot(torus(0.0025, 0.0006, mat('#1b4332'), 4, 10, PI), 0, 0, PI), 0, 0.044, 0.0205));
  return g;
}

// ---------------------------------------------------------------- blind boxes
function blindBoxModel(sid) {
  const S = SERIES_ART[sid];
  const W = 0.075, H = 0.092;
  const front = labelTexture(`bb:front:${sid}`, 256, 314, (ctx, w, h) => {
    vgrad(ctx, w, h, [S.c1, S.c2]);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 0; y < h; y += 26) for (let x = (y / 26) % 2 ? 0 : 13; x < w; x += 26) circle(ctx, x, y, 4, 'rgba(255,255,255,0.2)');
    txt(ctx, S.name.toUpperCase(), w / 2, 46, 36, '#ffffff', { stroke: S.ink, lw: 8, weight: 900, max: w - 20 });
    txt(ctx, 'SERIES 1', w / 2, 82, 14, S.ink, { weight: 800 });
    circle(ctx, w / 2, h * 0.56, 66, 'rgba(255,255,255,0.85)');
    txt(ctx, S.emoji, w / 2, h * 0.56, 70, '#000');
    txt(ctx, '?', w * 0.82, h * 0.42, 40, S.ink, { weight: 900, stroke: '#fff', lw: 6 });
    ctx.fillStyle = S.ink; ctx.fillRect(0, h - 52, w, 52);
    txt(ctx, '1 RANDOM FIGURE · COLLECT ALL', w / 2, h - 34, 12, '#ffffff', { max: w - 16 });
    txt(ctx, 'KOLLECTIV', w / 2, h - 14, 11, S.c1, { weight: 900 });
  });
  const side = labelTexture(`bb:side:${sid}`, 256, 314, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    txt(ctx, 'COLLECT THEM ALL', w / 2, 24, 16, S.ink, { weight: 900 });
    const n = S.items.length;
    for (let i = 0; i < n; i++) { const cx = 46 + (i % 3) * 82, cy = 70 + Math.floor(i / 3) * 76; circle(ctx, cx, cy, 30, i === n - 1 ? '#1b1b1b' : S.c1); txt(ctx, i === n - 1 ? '?' : S.icons[i] || S.emoji, cx, cy + 2, i === n - 1 ? 30 : 30, i === n - 1 ? '#ffd166' : '#000', { weight: 900 }); }
    txt(ctx, 'SECRET ★', w * 0.5, h - 18, 13, S.ink, { weight: 900 });
  });
  const top = labelTexture(`bb:top:${sid}`, 256, 256, (ctx, w, h) => { vgrad(ctx, w, h, [S.c2, S.c1]); txt(ctx, S.emoji, w / 2, h / 2, 110, '#000'); });
  const geo = sgeo('blindbox', () => new THREE.BoxGeometry(W, H, W));
  const mats = [mat('#fff', { map: side, rough: 0.5 }), mat('#fff', { map: side, rough: 0.5 }), mat('#fff', { map: top, rough: 0.5 }), mat(S.c2, { rough: 0.6 }), mat('#fff', { map: front, rough: 0.45 }), mat('#fff', { map: front, rough: 0.45 })];
  const b = mesh(geo, mats); b.position.y = H / 2;
  const g = group(b);
  g.add(at(box(W * 0.3, 0.0015, W + 0.002, mat('#ffffff', { rough: 0.2, opacity: 0.55, transparent: true })), 0, H + 0.0004, 0));
  return g;
}

// ---------------------------------------------------------------- trading cards
const MB = (id, name, rarity, emoji, color, value) => ({ id: 'mb_' + id, name, rarity, emoji, color, value });
const SA = (id, name, rarity, emoji, color, value) => ({ id: 'sa_' + id, name, rarity, emoji, color, value });
CARD_SETS.mythic_beasts = {
  name: 'Mythic Beasts',
  cards: [
    MB('pixie', 'Pixie Sprite', 'common', '🧚', '#f9c74f', 0.3), MB('golem', 'Mossy Golem', 'common', '🪨', '#6a994e', 0.25), MB('moth', 'Glow Moth', 'common', '🦋', '#4cc9f0', 0.3),
    MB('bogfrog', 'Bog Frog', 'common', '🐸', '#80b918', 0.25), MB('wisp', 'Will-o\'-Wisp', 'common', '🕯️', '#90e0ef', 0.35), MB('imp', 'Mushroom Imp', 'common', '🍄', '#e63946', 0.3),
    MB('cloudpup', 'Cloud Pup', 'common', '☁️', '#bde0fe', 0.4), MB('ember', 'Ember Lizard', 'common', '🦎', '#f77f00', 0.35), MB('tidecrab', 'Tide Crab', 'common', '🦀', '#ff6b6b', 0.25),
    MB('thornfox', 'Thorn Fox', 'common', '🦊', '#bc6c25', 0.4),
    MB('moonowl', 'Moon Owl', 'uncommon', '🦉', '#5a189a', 1.5), MB('stormram', 'Storm Ram', 'uncommon', '🐏', '#adb5bd', 1.25), MB('frostwolf', 'Frost Wolf', 'uncommon', '🐺', '#a2d2ff', 2),
    MB('coral', 'Coral Serpent', 'uncommon', '🐍', '#ff8fab', 1.75), MB('ironbark', 'Ironbark Ent', 'uncommon', '🌳', '#386641', 1.5), MB('sandwyrm', 'Sand Wyrm', 'uncommon', '🪱', '#e9c46a', 2.5),
    MB('thunderbird', 'Thunderbird', 'rare', '⚡', '#ffd60a', 8), MB('kitsune', 'Nine-Tail Kitsune', 'rare', '🦊', '#ff9f1c', 12), MB('griffin', 'Golden Griffin', 'rare', '🦅', '#d4a017', 9),
    MB('kraken', 'Abyssal Kraken', 'rare', '🐙', '#3c096c', 10),
    MB('phoenix', 'Phoenix Reborn', 'epic', '🔥', '#ff4800', 35), MB('leviathan', 'Leviathan', 'epic', '🐋', '#023e8a', 28), MB('unicorn', 'Unicorn Queen', 'epic', '🦄', '#e0aaff', 42),
    MB('elderdragon', 'Elder Dragon (Holo)', 'legendary', '🐉', '#d00000', 180),
  ],
};
CARD_SETS.snack_attack = {
  name: 'Snack Attack',
  cards: [
    SA('gummy', 'Grumpy Gummy', 'common', '🍬', '#ff70a6', 0.25), SA('pretzel', 'Sir Pretzel', 'common', '🥨', '#bc6c25', 0.25), SA('popcorn', 'Pop Corn', 'common', '🍿', '#ffd166', 0.3),
    SA('nugget', 'Lil\' Nugget', 'common', '🍗', '#e9c46a', 0.3), SA('cheese', 'Cheesy Puff', 'common', '🧀', '#ffb703', 0.25), SA('soda', 'Soda Pop', 'common', '🥤', '#e63946', 0.3),
    SA('taco', 'Taco Tom', 'common', '🌮', '#f4a261', 0.35), SA('mallow', 'Mallow Bun', 'common', '🍡', '#ffc8dd', 0.35), SA('fries', 'Fry Guy', 'common', '🍟', '#ffd60a', 0.3),
    SA('wasabi', 'Wasabi Ninja', 'uncommon', '🍣', '#80b918', 1.5), SA('ramen', 'Ramen Ronin', 'uncommon', '🍜', '#c1121f', 1.75), SA('pancake', 'Pancake Stack', 'uncommon', '🥞', '#dda15e', 1.25),
    SA('hotdog', 'Hot Dog Hero', 'uncommon', '🌭', '#e76f51', 1.5), SA('boba', 'Boba Bandit', 'uncommon', '🧋', '#a47148', 2),
    SA('pizza', 'Pizza Paladin', 'rare', '🍕', '#f77f00', 7), SA('donut', 'Donut Duke', 'rare', '🍩', '#ff8fab', 8), SA('curry', 'Curry Kaiju', 'rare', '🍛', '#e9a03b', 10),
    SA('burger', 'Burger Behemoth', 'epic', '🍔', '#9c2c2c', 30), SA('sundae', 'Sundae Sorceress', 'epic', '🍨', '#c77dff', 34),
    SA('fortune', 'Golden Fortune Cookie', 'legendary', '🥠', '#d4a017', 150),
  ],
};
function boosterModel({ key, c1, c2, title, emoji, big = false }) {
  const W = big ? 0.08 : 0.066, H = big ? 0.13 : 0.112, D = big ? 0.012 : 0.006;
  const art = labelTexture(`booster:${key}`, 256, Math.round(256 * H / W), (ctx, w, h) => {
    const gg = ctx.createLinearGradient(0, 0, w, h); gg.addColorStop(0, c1); gg.addColorStop(0.5, c2); gg.addColorStop(1, c1);
    ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = -h; i < w; i += 30) { ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h * 0.6, 0); ctx.lineTo(i + h * 0.6 + 12, 0); ctx.lineTo(i + 12, h); ctx.fill(); }
    for (let i = 0; i < 8; i++) { ctx.fillStyle = '#c0c0c0'; ctx.beginPath(); ctx.moveTo(i * w / 8, 0); ctx.lineTo((i + 0.5) * w / 8, 12); ctx.lineTo((i + 1) * w / 8, 0); ctx.fill(); ctx.beginPath(); ctx.moveTo(i * w / 8, h); ctx.lineTo((i + 0.5) * w / 8, h - 12); ctx.lineTo((i + 1) * w / 8, h); ctx.fill(); }
    txt(ctx, title.toUpperCase(), w / 2, 48, 30, '#ffffff', { stroke: '#1b1b1b', lw: 7, weight: 900, max: w - 24 });
    circle(ctx, w / 2, h * 0.52, 74, 'rgba(255,255,255,0.25)');
    txt(ctx, emoji, w / 2, h * 0.52, 92, '#000');
    txt(ctx, big ? 'COLLECTOR BOX · 12 CARDS' : 'BOOSTER · 5 CARDS', w / 2, h - 44, 14, '#ffffff', { stroke: '#1b1b1b', lw: 4, max: w - 20 });
    txt(ctx, '✦ HOLO CHANCE ✦', w / 2, h - 24, 12, '#ffd166', { max: w - 20 });
  });
  const foil = mat('#ffffff', { map: art, rough: 0.25, metal: 0.55, clearcoat: 1 });
  const edge = mat('#c9ccd2', { rough: 0.3, metal: 0.8 });
  const p = mesh(sgeo(`booster:${big}`, () => new THREE.BoxGeometry(W, H, D)), [edge, edge, edge, edge, foil, foil]);
  p.position.y = H / 2; p.rotation.x = big ? 0 : -0.06;
  return group(p);
}

// ---------------------------------------------------------------- Stockpile pieces & art toys
function displayPlinth(w = 0.3, d = 0.3, c = '#1b1b1b') { return at(rbox(w, 0.04, d, 0.006, mat(c, { rough: 0.35, metal: 0.2 })), 0, 0.02, 0); }
function plaque(w, h, key, line1, line2) {
  return face(w, h, `plaque:${key}`, (ctx, W, H) => { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#f4d58d'); g.addColorStop(0.5, '#bf9b30'); g.addColorStop(1, '#f4d58d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); txt(ctx, line1, W / 2, H * 0.36, H * 0.3, '#3b2a14', { font: 'Georgia, serif', max: W * 0.9 }); if (line2) txt(ctx, line2, W / 2, H * 0.72, H * 0.22, '#3b2a14', { font: 'Georgia, serif', weight: 600, max: W * 0.9 }); }, { th: Math.round(256 * h / w), rough: 0.3 });
}
function signedBall() {
  const g = group(displayPlinth(0.28, 0.28, '#3b2a1e'));
  const ball = basketball(); ball.position.y = 0.05; g.add(ball);
  const sigGeo = sgeo('sigpatch', () => new THREE.SphereGeometry(0.1206, 16, 8, PI / 2 - 0.55, 1.1, PI / 2 - 0.42, 0.7));
  const sigTex = labelTexture('signature:ball', 256, 160, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(30, 100); ctx.bezierCurveTo(50, 20, 70, 140, 90, 70); ctx.bezierCurveTo(100, 40, 120, 120, 140, 80); ctx.bezierCurveTo(160, 50, 170, 110, 200, 70); ctx.lineTo(230, 60); ctx.stroke(); ctx.beginPath(); ctx.moveTo(60, 125); ctx.lineTo(210, 115); ctx.stroke(); txt(ctx, '#23', 200, 135, 28, '#111', { font: 'cursive', weight: 700 }); });
  g.add(at(mesh(sigGeo, mat('#ffffff', { map: sigTex, transparent: true, rough: 0.7, depthWrite: false })), 0, 0.17, 0));
  g.add(at(rbox(0.26, 0.26, 0.26, 0.004, MAT.glass('#f2f8ff', 0.16)), 0, 0.17, 0));
  g.add(at(plaque(0.12, 0.025, 'ball', 'GAME-WINNER · 2016 FINALS', 'Authenticated'), 0, 0.02, 0.1405));
  return g;
}
function vintageConsole() {
  const g = new THREE.Group();
  const hh = handheldModel({ body: '#cfcac0', btn: '#8b1e3f', key: 'vintage' }); hh.rotation.y = 0.2; hh.position.set(0.035, 0, 0.04); g.add(hh);
  const art = labelTexture('vintage:box', 256, 330, (ctx, w, h) => {
    vgrad(ctx, w, h, ['#2b2d42', '#8d99ae']);
    ctx.strokeStyle = '#ef233c'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-10, h * 0.7); ctx.lineTo(w + 10, h * 0.45); ctx.stroke();
    txt(ctx, 'PocketPal', w / 2, 54, 44, '#ffffff', { font: 'Georgia, serif', weight: 900, stroke: '#ef233c', lw: 6 });
    txt(ctx, 'PORTABLE VIDEO GAME SYSTEM', w / 2, 92, 12, '#edf2f4', { max: w - 20 });
    ctx.fillStyle = '#cfcac0'; ctx.fillRect(w * 0.32, h * 0.38, w * 0.36, h * 0.42); ctx.fillStyle = '#9bbc0f'; ctx.fillRect(w * 0.37, h * 0.42, w * 0.26, h * 0.14);
    txt(ctx, '© 1989 · VOLT', w / 2, h - 18, 12, '#edf2f4');
  });
  const b = mesh(sgeo('vintage:boxgeo', () => new THREE.BoxGeometry(0.15, 0.19, 0.05)), [mat('#2b2d42'), mat('#2b2d42'), mat('#8d99ae'), mat('#8d99ae'), mat('#fff', { map: art, rough: 0.6 }), mat('#2b2d42')]);
  b.position.set(-0.04, 0.095, -0.04); b.rotation.y = 0.15; g.add(b);
  return g;
}
function bloxbear({ m }) {
  const g = new THREE.Group();
  g.add(at(rbox(0.16, 0.012, 0.12, 0.005, MAT.glass('#ffffff', 0.4)), 0, 0.006, 0));
  for (const s of [-1, 1]) g.add(at(rbox(0.045, 0.065, 0.055, 0.012, m), s * 0.026, 0.045, 0));
  g.add(at(rbox(0.1, 0.085, 0.066, 0.018, m), 0, 0.118, 0));
  for (const s of [-1, 1]) { const a = rbox(0.03, 0.075, 0.036, 0.012, m); a.rotation.z = s * 0.12; g.add(at(a, s * 0.066, 0.115, 0)); }
  g.add(at(rbox(0.13, 0.105, 0.105, 0.04, m), 0, 0.215, 0));
  for (const s of [-1, 1]) g.add(at(zcyl(0.024, 0.024, 0.024, m, 28), s * 0.046, 0.272, -0.005));
  const sn = rbox(0.04, 0.026, 0.02, 0.009, m); g.add(at(sn, 0, 0.198, 0.052));
  for (const s of [-1, 1]) g.add(at(sph(0.006, mat('#111', { rough: 0.1, clearcoat: 1 }), 10, 8), s * 0.025, 0.225, 0.052));
  return g;
}
function dripSmiley() {
  const g = new THREE.Group();
  const y = mat('#ffd60a', { rough: 0.15, clearcoat: 1 });
  const pool = sph(0.075, y, 32, 12); pool.scale.set(1, 0.07, 1); g.add(at(pool, 0, 0.002, 0));
  const cy = 0.064;
  g.add(at(sph(0.06, y, 40, 28), 0, cy, 0));
  const r = seeded(31);
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2 + r() * 0.3; if (Math.sin(a) > 0.75) continue; const len = 0.012 + r() * 0.022; const dy = 0.012 + len / 2; const rr = Math.sqrt(0.06 * 0.06 - dy * dy) - 0.001; const d = capsule(0.0068 + r() * 0.003, len, y); d.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(at(d, Math.cos(a) * rr, cy - dy, Math.sin(a) * rr)); }
  for (let i = 0; i < 5; i++) { const a = i * 1.7; const b = sph(0.01, y, 12, 8); b.scale.y = 0.4; g.add(at(b, Math.cos(a) * 0.066, 0.004, Math.sin(a) * 0.066)); }
  for (const s of [-1, 1]) { const e = capsule(0.0065, 0.014, mat('#111', { rough: 0.2 })); e.scale.z = 0.5; g.add(at(e, s * 0.02, cy + 0.015, 0.056)); }
  g.add(at(rot(torus(0.03, 0.004, mat('#111', { rough: 0.2 }), 6, 24, PI * 0.8), 0, 0, PI * 1.1), 0, cy - 0.003, 0.05));
  return g;
}
function hollowPal({ c = '#8e7dbe', c2 = '#d8cff0' } = {}) {
  const g = new THREE.Group();
  const m = vin(c, { rough: 0.5, clearcoat: 0.3 }), m2 = vin(c2, { rough: 0.5, clearcoat: 0.3 });
  const body = capsule(0.035, 0.04, m); body.rotation.x = -0.35; g.add(at(body, 0, 0.065, -0.01));
  for (const s of [-1, 1]) {
    const thigh = capsule(0.018, 0.05, m); thigh.rotation.x = -1.0; g.add(at(thigh, s * 0.024, 0.06, 0.03));
    const shin = capsule(0.016, 0.045, m); shin.rotation.x = 0.25; g.add(at(shin, s * 0.024, 0.04, 0.06));
    const foot = rbox(0.03, 0.016, 0.05, 0.008, m2); g.add(at(foot, s * 0.024, 0.008, 0.07));
    g.add(tube([[s * 0.04, 0.1, -0.005], [s * 0.04, 0.085, 0.04], [s * 0.012, 0.08, 0.07]], 0.011, m, 12, 8));
  }
  const head = sph(0.048, m2, 32, 22); head.scale.set(1.1, 0.95, 1); g.add(at(head, 0, 0.15, 0.01));
  for (const s of [-1, 1]) { const e = capsule(0.014, 0.06, m); e.rotation.z = -s * 0.15; e.scale.z = 0.6; g.add(at(e, s * 0.03, 0.22, 0.0)); }
  for (const s of [-1, 1]) for (const r of [0.7, -0.7]) { const x = box(0.016, 0.0035, 0.003, mat('#3b2a1e')); x.rotation.z = r; g.add(at(x, s * 0.018, 0.155, 0.056)); }
  g.add(at(rbox(0.03, 0.006, 0.004, 0.002, mat('#3b2a1e')), 0, 0.132, 0.056));
  return g;
}
function neonKaiju() {
  const g = new THREE.Group();
  const skin = mat('#7bf1a8', { rough: 0.1, clearcoat: 1, emissive: '#2dc653', ei: 0.7, opacity: 0.9, transparent: true });
  const spike = glow('#ccff33', 1.6);
  g.add(at(cyl(0.05, 0.055, 0.012, mat('#111', { rough: 0.3 }), 32), 0, 0.006, 0));
  const body = sph(0.04, skin, 24, 18); body.scale.set(1, 1.2, 0.95); g.add(at(body, 0, 0.06, 0));
  for (const s of [-1, 1]) { g.add(at(capsule(0.014, 0.02, skin), s * 0.022, 0.025, 0.01)); const a = capsule(0.008, 0.02, skin); a.rotation.set(-1, 0, s * 0.4); g.add(at(a, s * 0.035, 0.07, 0.03)); }
  g.add(tube([[0, 0.04, -0.03], [0, 0.03, -0.07], [0.02, 0.02, -0.1]], 0.014, skin, 14, 10));
  const head = sph(0.032, skin, 24, 18); head.scale.set(1, 0.9, 1.15); g.add(at(head, 0, 0.115, 0.012));
  kface(g, { y: 0.115, z: 0.012, R: 0.032, sy: 0.9, sz: 1.15 }, { ey: 0.006, dx: 0.013, r: 0.005, mouth: 'grin', blush: null });
  for (let i = 0; i < 6; i++) { const t = i / 5; const sp = cone(0.009, 0.022, spike, 5); sp.rotation.x = -0.3 - t * 1.2; g.add(at(sp, 0, 0.15 - t * 0.09, -0.012 - t * 0.04)); }
  return g;
}
function classicCar({ color = '#c1121f', key = 'red' } = {}) {
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.15, clearcoat: 1, metal: 0.3 });
  const prof = [[-0.125, 0.018], [0.12, 0.018], [0.126, 0.03], [0.118, 0.042], [0.06, 0.046], [0.025, 0.05], [-0.04, 0.05], [-0.09, 0.047], [-0.126, 0.04]];
  const bodyM = extrude(prof, 0.088, paint, 0.006, undefined, 'car:classic'); bodyM.rotation.y = -PI / 2; g.add(bodyM);
  g.add(at(rbox(0.08, 0.008, 0.07, 0.003, mat('#e9d8a6', { rough: 0.7 })), 0, 0.054, -0.01));
  for (const z of [-0.035, 0.01]) g.add(at(rbox(0.074, 0.02, 0.02, 0.006, mat('#e9d8a6', { rough: 0.7 })), 0, 0.062, z));
  const ws = rbox(0.09, 0.03, 0.003, 0.002, MAT.glass('#e8f4ff', 0.35)); ws.rotation.x = -0.4; g.add(at(ws, 0, 0.065, 0.032));
  for (const z of [-0.128, 0.128]) g.add(at(rbox(0.1, 0.008, 0.008, 0.003, MAT.chrome()), 0, 0.026, z));
  for (const s of [-1, 1]) g.add(at(zcyl(0.007, 0.007, 0.004, mat('#fff8d6', { emissive: '#fff1c1', ei: 0.4 }), 14), s * 0.032, 0.036, 0.129));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.add(at(xcyl(0.02, 0.02, 0.016, MAT.rubber('#151515'), 22), x * 0.045, 0.02, z * 0.075)); g.add(at(xcyl(0.012, 0.012, 0.017, MAT.chrome(), 16), x * 0.045, 0.02, z * 0.075)); }
  g.position.y = 0.04; return group(g);
}
function caseOver(inner, w, h, d, key, line1, line2) {
  const g = group(at(rbox(w + 0.02, 0.04, d + 0.02, 0.005, mat('#111', { rough: 0.3 })), 0, 0.02, 0), inner);
  g.add(at(rbox(w, h, d, 0.003, MAT.glass('#f4f9ff', 0.14)), 0, 0.04 + h / 2, 0));
  g.add(at(plaque(w * 0.5, 0.022, key, line1, line2), 0, 0.02, d / 2 + 0.0105));
  return g;
}
function f1Car() {
  const g = new THREE.Group();
  const livery = mat('#00a6a6', { rough: 0.15, clearcoat: 1 }), black = mat('#1b1b1b', { rough: 0.4 });
  g.add(at(rot(capsule(0.016, 0.17, livery), PI / 2, 0, 0), 0, 0.026, 0));
  for (const s of [-1, 1]) g.add(at(rbox(0.03, 0.022, 0.08, 0.008, livery), s * 0.03, 0.024, -0.02));
  g.add(at(rbox(0.13, 0.004, 0.025, 0.002, black), 0, 0.01, 0.12));
  for (const s of [-1, 1]) g.add(at(box(0.004, 0.016, 0.03, livery), s * 0.064, 0.016, 0.12));
  g.add(at(rbox(0.1, 0.004, 0.03, 0.002, livery), 0, 0.07, -0.105), at(box(0.004, 0.05, 0.03, black), -0.05, 0.047, -0.105), at(box(0.004, 0.05, 0.03, black), 0.05, 0.047, -0.105));
  g.add(at(sph(0.011, mat('#ffd60a', { rough: 0.2, clearcoat: 1 }), 16, 12), 0, 0.044, 0.0));
  g.add(at(rot(torus(0.018, 0.0025, black, 6, 20, PI), 0, PI / 2, 0), 0, 0.044, 0.008));
  g.add(at(face(0.03, 0.03, 'f1:num', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); txt(ctx, '44', w / 2, h / 2, h * 0.7, '#ffffff', { weight: 900 }); }, { transparent: true, th: 128 }), 0, 0.0425, 0.06).rotateX(-PI / 2));
  for (const [x, z, r] of [[-1, 1, 0.024], [1, 1, 0.024], [-1, -1, 0.028], [1, -1, 0.028]]) g.add(at(xcyl(r, r, 0.03, MAT.rubber('#141414'), 24), x * 0.058, r, z * 0.08));
  return g;
}
function trophy() {
  const g = new THREE.Group();
  const mtex = marble({ base: '#f2f0ec', vein: '#9a958d', seed: 4 });
  g.add(at(box(0.12, 0.06, 0.12, mat('#ffffff', { map: mtex, rough: 0.2, clearcoat: 0.6 })), 0, 0.03, 0));
  g.add(at(box(0.09, 0.03, 0.09, mat('#111', { rough: 0.25, clearcoat: 0.6 })), 0, 0.075, 0));
  const gold = MAT.gold();
  g.add(at(lathe([[0.001, 0], [0.03, 0], [0.03, 0.006], [0.012, 0.012], [0.008, 0.05], [0.014, 0.06], [0.05, 0.1], [0.055, 0.16], [0.052, 0.16], [0.045, 0.105], [0.001, 0.105]], gold, 40), 0, 0.09, 0));
  for (const s of [-1, 1]) g.add(at(rot(torus(0.028, 0.005, gold, 8, 20, PI * 1.2), 0, 0, s > 0 ? -PI * 0.6 : PI * 0.4), s * 0.052, 0.21, 0));
  g.add(at(plaque(0.09, 0.03, 'trophy', 'CITY LEAGUE CHAMPIONS', '1998 · MVP'), 0, 0.03, 0.0605));
  g.add(at(face(0.05, 0.05, 'trophy:star', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); txt(ctx, '★', w / 2, h / 2 + 3, h * 0.9, '#7a5c1e'); }, { transparent: true, th: 128 }), 0, 0.215, 0.047).rotateX(-0.15));
  return g;
}
function tinRobot() {
  const g = new THREE.Group();
  const tin = mat('#c1121f', { rough: 0.25, metal: 0.6 }), silver = MAT.metal('#c8ccd2', 0.25);
  const chest = labelTexture('tinrobot:chest', 128, 128, (ctx, w, h) => { ctx.fillStyle = '#c1121f'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ffd166'; roundRect_(ctx, 18, 18, w - 36, 52, 8); ctx.fill(); for (let i = 0; i < 3; i++) { circle(ctx, 34 + i * 30, 44, 11, '#1b1b1b'); ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(34 + i * 30, 44); ctx.lineTo(34 + i * 30 + 7, 37); ctx.stroke(); } for (let i = 0; i < 4; i++) circle(ctx, 26 + i * 25, 96, 7, ['#3a86ff', '#80b918', '#ffd166', '#fff'][i]); ctx.fillStyle = '#ffd166'; for (const x of [6, w - 6]) for (let y = 8; y < h; y += 18) circle(ctx, x, y, 2.5, '#ffd166'); });
  for (const s of [-1, 1]) { g.add(at(rbox(0.026, 0.05, 0.03, 0.004, silver), s * 0.018, 0.03, 0)); g.add(at(rbox(0.032, 0.012, 0.045, 0.004, tin), s * 0.018, 0.006, 0.006)); }
  const body = mesh(sgeo('tinbody', () => new THREE.BoxGeometry(0.07, 0.075, 0.045)), [tin, tin, tin, tin, mat('#fff', { map: chest, rough: 0.3, metal: 0.4 }), tin]); body.position.y = 0.095; g.add(body);
  for (const s of [-1, 1]) { const a = capsule(0.009, 0.045, silver); a.rotation.set(-0.5, 0, s * 0.25); g.add(at(a, s * 0.046, 0.1, 0.01)); g.add(at(torus(0.008, 0.003, tin, 6, 12, PI * 1.4), s * 0.052, 0.068, 0.03)); }
  g.add(at(rbox(0.056, 0.05, 0.048, 0.008, silver), 0, 0.16, 0));
  for (const s of [-1, 1]) { g.add(at(zcyl(0.009, 0.009, 0.004, mat('#ffd166', { emissive: '#ffb703', ei: 0.6 }), 16), s * 0.013, 0.168, 0.025)); g.add(at(xcyl(0.008, 0.008, 0.008, tin, 12), s * 0.032, 0.16, 0)); }
  for (let i = 0; i < 4; i++) g.add(at(box(0.024, 0.002, 0.002, mat('#1b1b1b')), 0, 0.147 + i * 0.004, 0.0245));
  g.add(at(cyl(0.002, 0.002, 0.03, silver, 6), 0, 0.2, 0), at(sph(0.006, mat('#ffd166', { emissive: '#ff9f1c', ei: 0.8 }), 10, 8), 0, 0.216, 0));
  g.add(at(xcyl(0.003, 0.003, 0.02, silver, 8), 0, 0.1, -0.03).rotateY(PI / 2));
  g.add(at(rot(torus(0.012, 0.003, MAT.gold(), 6, 16), 0, 0, 0), 0, 0.1, -0.044));
  return g;
}
function roundRect_(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function jeweledEgg() {
  const g = new THREE.Group();
  const gold = MAT.gold();
  g.add(at(lathe([[0.001, 0], [0.035, 0], [0.036, 0.006], [0.012, 0.014], [0.008, 0.03], [0.02, 0.04], [0.001, 0.04]], gold, 36), 0, 0, 0));
  const tex = labelTexture('egg:enamel', 256, 256, (ctx, w, h) => { vgrad(ctx, w, h, ['#3a0ca3', '#4361ee', '#3a0ca3']); ctx.strokeStyle = '#e2b44f'; ctx.lineWidth = 8; for (const y of [0.3, 0.5, 0.7]) { ctx.beginPath(); ctx.moveTo(0, h * y); ctx.lineTo(w, h * y); ctx.stroke(); } ctx.lineWidth = 3; for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, h * 0.3); ctx.lineTo(x + 16, h * 0.5); ctx.lineTo(x + 32, h * 0.3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, h * 0.7); ctx.lineTo(x + 16, h * 0.5); ctx.lineTo(x + 32, h * 0.7); ctx.stroke(); } for (let x = 16; x < w; x += 32) { circle(ctx, x, h * 0.4, 4, '#ffffff'); circle(ctx, x, h * 0.6, 4, '#ffffff'); } });
  const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16; const y = t * 0.12; const r = 0.045 * Math.sin(PI * t) ** 0.85 * (1 - 0.18 * t); prof.push([Math.max(0.001, r), y]); }
  g.add(at(lathe(prof, mat('#ffffff', { map: tex, rough: 0.12, clearcoat: 1 }), 40), 0, 0.034, 0));
  const ruby = mat('#d00000', { rough: 0.05, clearcoat: 1, metal: 0.2 }), dia = mat('#f8f9fa', { rough: 0.02, clearcoat: 1, metal: 0.3 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.add(at(sph(0.0045, i % 2 ? ruby : dia, 10, 8), Math.cos(a) * 0.045, 0.094, Math.sin(a) * 0.045)); }
  g.add(at(cyl(0.006, 0.01, 0.01, gold, 12), 0, 0.157, 0), at(sph(0.007, ruby, 12, 10), 0, 0.167, 0));
  return g;
}
function gradedSlab() {
  const g = new THREE.Group();
  const s = new THREE.Group(); s.rotation.x = -0.12; s.position.set(0, 0.012, 0.01);
  s.add(at(rbox(0.086, 0.142, 0.008, 0.004, MAT.glass('#f2f8ff', 0.35)), 0, 0.071, 0));
  s.add(at(face(0.074, 0.022, 'slab:label', (ctx, w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d00000'; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6); txt(ctx, 'ELDER DRAGON · HOLO', 8, h * 0.4, 14, '#111', { align: 'left', max: w * 0.65 }); txt(ctx, 'MYTHIC BEASTS #24', 8, h * 0.7, 10, '#555', { align: 'left' }); txt(ctx, '10', w - 26, h / 2, 36, '#d00000', { weight: 900 }); txt(ctx, 'GEM MINT', w - 26, h - 14, 8, '#111'); }, { th: 76 }), 0, 0.126, 0.0042));
  s.add(at(face(0.063, 0.088, 'slab:card', (ctx, w, h) => { const gg = ctx.createLinearGradient(0, 0, w, h); gg.addColorStop(0, '#ffd166'); gg.addColorStop(0.35, '#ff4fa3'); gg.addColorStop(0.65, '#5ef2ff'); gg.addColorStop(1, '#ffd166'); ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(8, 8, w - 16, h - 16); ctx.fillStyle = '#d00000'; ctx.fillRect(14, 30, w - 28, h * 0.48); txt(ctx, '🐉', w / 2, 30 + h * 0.24, 80, '#000'); txt(ctx, 'Elder Dragon', w / 2, 20, 16, '#ffd166'); txt(ctx, 'LEGENDARY ✦ 9000', w / 2, h - 34, 12, '#fff'); }, { th: 350, rough: 0.2 }), 0, 0.058, 0.0042));
  g.add(s);
  g.add(at(rbox(0.1, 0.012, 0.05, 0.003, mat('#1b1b1b', { rough: 0.3 })), 0, 0.006, 0.005));
  return g;
}

// ---------------------------------------------------------------- series data
const FIG_PRICE = { common: 8, uncommon: 14, rare: 30, epic: 85, legendary: 140 };
const SERIES_ART = {
  kawaii_cats: { name: 'Kawaii Cats', c1: '#ffc8dd', c2: '#ff70a6', ink: '#7b2cbf', emoji: '🐱', icons: ['🐱', '🐯', '🐈‍⬛', '🐾', '🍣', '🧋'] },
  space_dinos: { name: 'Space Dinos', c1: '#3a0ca3', c2: '#4cc9f0', ink: '#10002b', emoji: '🦖', icons: ['🧑‍🚀', '🦕', '🛞', '🦅', '🌙', '🛸'] },
  food_friends: { name: 'Food Friends', c1: '#fff3b0', c2: '#ffb703', ink: '#9c2c2c', emoji: '🍙', icons: ['🍞', '🍙', '🥑', '🍩', '🥟', '🍓'] },
  cryptid_crew: { name: 'Cryptid Crew', c1: '#344e41', c2: '#a3b18a', ink: '#081c15', emoji: '👣', icons: ['👣', '🦕', '🦋', '🐇', '❄️', '🐙'] },
};
const FIGS = {
  kawaii_cats: [
    ['kc_mochi', 'Mochi', 'common', () => catFig({ fur: '#fdfcf7' }), 'A plump snow-white kitty with rosy ears.', ['Mochi is softer than it looks (it is vinyl).', 'Peak loaf energy.'], '🐱'],
    ['kc_tabby', 'Marmalade', 'common', () => catFig({ fur: '#f4a261', fur2: '#fff1e6', stripes: '#c8692e' }), 'An orange tabby with tiger stripes and zero thoughts.', ['One brain cell, fully dedicated to snacks.', 'Orange cat behavior: certified.'], '🐯'],
    ['kc_tuxedo', 'Tux', 'common', () => catFig({ fur: '#2b2d42', fur2: '#ffffff', earIn: '#ffafcc' }), 'A dapper tuxedo cat, always dressed for the occasion.', ['Dressed for a gala. Attending a nap.', 'Formalwear, but make it fluffy.'], '🐈‍⬛'],
    ['kc_calico', 'Patches', 'uncommon', () => catFig({ fur: '#fffaf0', patches: [['#f4a261', 0.014, 0.056, 0.012, 0.011, [1, 1, 0.8]], ['#2b2d42', -0.016, 0.06, 0.008, 0.01, [1, 1, 0.8]], ['#f4a261', -0.01, 0.022, 0.008, 0.01, [1, 1, 0.8]]] }), 'A calico with perfectly random patches. No two spots alike.', ['Every patch is a little map.', 'Calico: three colors, infinite attitude.'], '🐾'],
    ['kc_sushi', 'Sushi Cat', 'uncommon', sushiCat, 'A grey kitty napping on a pillow of rice, wrapped in nori.', ['Nigiri, but make it purr.', 'Do not dip in soy sauce.'], '🍣'],
    ['kc_boba', 'Boba Cat', 'rare', bobaCat, 'A tabby peeking out of a milk tea, pearls and all.', ['Tapioca pearls & cat ears: the perfect drink.', 'Extra boba, extra cat.'], '🧋'],
    ['kc_lucky', 'Golden Lucky Cat', 'legendary', luckyCat, 'SECRET FIGURE! A gilded maneki-neko waving good fortune your way.', ['Its paw is waving fortune directly at you.', 'You feel luckier just looking at it.', 'The rarest cat in the series. Wow.'], '✨'],
  ],
  space_dinos: [
    ['sd_rex', 'Astro Rex', 'common', astroRex, 'A little T-rex in a puffy spacesuit. Tiny arms, giant leap.', ['Houston, we have a T-rex.', 'Its arms can\'t reach the helmet visor. Brave anyway.'], '🧑‍🚀'],
    ['sd_stego', 'Stego Pilot', 'common', stegoPilot, 'A stegosaurus ace with flight goggles and a red scarf.', ['Cleared for takeoff, plates and all.', 'Ace pilot. Terrible at parallel parking.'], '🦕'],
    ['sd_tri', 'Tri-Rover', 'common', triRover, 'A triceratops explorer with a star-studded frill.', ['Three horns, zero fear.', 'Mapping craters since the Cretaceous.'], '🦖'],
    ['sd_ptero', 'Jetpack Ptero', 'uncommon', jetPtero, 'A pterodactyl who decided wings weren\'t fast enough.', ['Wings AND a jetpack. Overachiever.', 'Fwoosh!'], '🦅'],
    ['sd_bronto', 'Moonwalk Bronto', 'uncommon', moonBronto, 'A long-necked brontosaurus planting a flag on the moon.', ['One small step for a dino…', 'The neck makes for great crater views.'], '🌙'],
    ['sd_raptor', 'UFO Raptor', 'rare', ufoRaptor, 'A cheeky raptor joyriding a tiny flying saucer.', ['Abducting snacks across the galaxy.', 'Zero licence. Maximum speed.'], '🛸'],
    ['sd_galaxy', 'Galaxy Rex', 'epic', galaxyRex, 'SECRET FIGURE! A translucent nebula T-rex full of stars.', ['There are whole galaxies inside it.', 'It glows faintly, like a night sky.'], '🌌'],
  ],
  food_friends: [
    ['ff_toast', 'Butter Toast', 'common', toastFig, 'A happy slice of toast with a pat of butter on top.', ['Golden brown and full of optimism.', 'Butter side up, always.'], '🍞'],
    ['ff_onigiri', 'Onigiri', 'common', onigiriFig, 'A rice ball with a nori belt and a surprised little face.', ['Filled with plum and good vibes.', '"O!" says onigiri.'], '🍙'],
    ['ff_avocado', 'Avo', 'common', avocadoFig, 'An avocado half proudly showing off its pit.', ['Perfectly ripe, for exactly one minute.', 'Toast\'s best friend.'], '🥑'],
    ['ff_donut', 'Sprinkle Donut', 'uncommon', donutFig, 'A strawberry-frosted donut covered in rainbow sprinkles.', ['Calories don\'t count on collectibles.', 'Sprinkles: non-negotiable.'], '🍩'],
    ['ff_dumpling', 'Dumpling', 'uncommon', dumplingFig, 'A pleated soup dumpling with chubby cheeks.', ['Handle with chopsticks and care.', 'Soupy on the inside, sweet on the outside.'], '🥟'],
    ['ff_milk', 'Strawberry Milk', 'rare', strawberryMilk, 'A pink milk carton with a bendy straw and a big smile.', ['Shaken, not stirred.', 'Pink, sweet, and a little nostalgic.'], '🍓'],
    ['ff_croissant', 'Golden Croissant', 'legendary', goldenCroissant, 'SECRET FIGURE! A gilded croissant wearing a tiny crown.', ['Flaky, buttery, and 24-karat fabulous.', 'Royalty of the breakfast table.'], '🥐'],
  ],
  cryptid_crew: [
    ['cc_bigfoot', 'Bigfoot', 'common', bigfootFig, 'A friendly Sasquatch caught mid-wave. Blurry photo not included.', ['Proof! Finally, actual proof.', 'He waves at hikers. They never wave back.'], '👣'],
    ['cc_nessie', 'Nessie', 'common', nessieFig, 'The Loch Ness monster, popping up for a hello.', ['Surfaced just for you.', 'Lochs are overrated. Shelves are cozy.'], '🦕'],
    ['cc_mothman', 'Mothman', 'common', mothmanFig, 'Fuzzy, red-eyed and surprisingly huggable.', ['Drawn to your desk lamp.', 'Those eyes see everything. Especially lamps.'], '🦋'],
    ['cc_jackalope', 'Jackalope', 'uncommon', jackalopeFig, 'A bunny with antlers. Legend says it sings at night.', ['Half bunny, half deer, all legend.', 'Hops in a mysteriously majestic way.'], '🐇'],
    ['cc_yeti', 'Yeti', 'uncommon', yetiFig, 'A shaggy snow-white yeti with chilly blue cheeks.', ['Abominable? Adorable.', 'Prefers its apartment at 16°C.'], '❄️'],
    ['cc_kraken', 'Baby Kraken', 'rare', krakenFig, 'A teeny purple kraken. The seas tremble (slightly).', ['Release the (tiny) kraken!', 'Six tentacles of pure mischief.'], '🐙'],
    ['cc_visitor', 'The Visitor', 'legendary', visitorFig, 'SECRET FIGURE! A glowing alien standing on a crop circle.', ['It came in peace. And for your snacks.', 'It glows faintly in the dark. Spooky-cute.'], '👽'],
  ],
};
for (const [sid, list] of Object.entries(FIGS)) { SERIES_ART[sid].items = list; SERIES[sid] = { name: SERIES_ART[sid].name, items: list.map((f) => f[0]) }; }

const figureItems = Object.entries(FIGS).flatMap(([sid, list]) => list.map(([id, name, rarity, build, desc, lines, emoji]) => ({
  id, name, category: 'collectibles', price: FIG_PRICE[rarity], rarity, desc, build, emoji, brand: `${SERIES_ART[sid].name} · Kollectiv`,
  stores: ['epic', 'legendary'].includes(rarity) ? ['stockpile'] : [], tags: ['resell'], resale: FIG_PRICE[rarity],
  use: { type: 'decor', verb: 'Admire', lines },
})));
const BOX_PRICE = { kawaii_cats: 12.99, space_dinos: 14.99, food_friends: 12.99, cryptid_crew: 14.99 };
const boxItems = Object.keys(FIGS).map((sid) => ({
  id: `blindbox_${sid}`, name: `${SERIES_ART[sid].name} Blind Box`, category: 'collectibles', price: BOX_PRICE[sid], stores: ['kollectiv', 'primo'], brand: 'Kollectiv', emoji: '🎁',
  desc: `One of ${FIGS[sid].length} ${SERIES_ART[sid].name} figures, including a super-rare secret. Which one will you get?`,
  build: () => blindBoxModel(sid), use: { type: 'blindbox', series: sid },
}));

const C = (o) => ({ category: 'collectibles', ...o });
const R = (o) => C({ tags: ['resell'], stores: ['stockpile'], ...o });
defineItems([
  ...figureItems,
  ...boxItems,
  // -------------------------------------------------------------- trading cards
  C({ id: 'booster_mythic_beasts', name: 'Mythic Beasts Booster Pack', price: 4.99, stores: ['kollectiv', 'primo'], brand: 'Kollectiv TCG', emoji: '🐉', desc: '5 cards from the Mythic Beasts set. One slot is boosted — the Elder Dragon holo is out there.', build: () => boosterModel({ key: 'mb', c1: '#3c096c', c2: '#d00000', title: 'Mythic Beasts', emoji: '🐉' }), use: { type: 'cardpack', set: 'mythic_beasts', count: 5 } }),
  C({ id: 'booster_box_mythic', name: 'Mythic Beasts Collector Box', price: 34.99, stores: ['kollectiv'], rarity: 'uncommon', brand: 'Kollectiv TCG', emoji: '🎴', desc: 'A foil collector box with 12 Mythic Beasts cards. Bigger rip, bigger odds.', build: () => boosterModel({ key: 'mbbox', c1: '#d4a017', c2: '#3c096c', title: 'Mythic Beasts', emoji: '🐉', big: true }), use: { type: 'cardpack', set: 'mythic_beasts', count: 12 } }),
  C({ id: 'booster_snack_attack', name: 'Snack Attack Booster Pack', price: 3.99, stores: ['kollectiv', 'primo'], brand: 'Kollectiv TCG', emoji: '🍔', desc: '5 cards of battling snacks. Can you pull the Golden Fortune Cookie?', build: () => boosterModel({ key: 'sa', c1: '#ff9f1c', c2: '#e63946', title: 'Snack Attack', emoji: '🍔' }), use: { type: 'cardpack', set: 'snack_attack', count: 5 } }),
  C({ id: 'booster_box_snack', name: 'Snack Attack Party Box', price: 24.99, stores: ['kollectiv'], brand: 'Kollectiv TCG', emoji: '🎴', desc: '12 Snack Attack cards in a glittery party box. Share the snacks (not the rares).', build: () => boosterModel({ key: 'sabox', c1: '#ff70a6', c2: '#ffd166', title: 'Snack Attack', emoji: '🍩', big: true }), use: { type: 'cardpack', set: 'snack_attack', count: 12 } }),
  R({ id: 'graded_elder_dragon', name: 'Graded Elder Dragon Holo (Gem Mint 10)', price: 650, resale: 720, rarity: 'epic', emoji: '🐉', desc: 'A perfect-10 slabbed holo of the rarest Mythic Beasts card. Do not touch. Do not breathe.', build: gradedSlab, use: { type: 'decor', verb: 'Admire the holo', lines: ['The holo foil shimmers like dragon fire.', 'Gem Mint 10. Flawless corners. Flawless vibes.', 'You tilt it in the light. Breathtaking.'] } }),
  // -------------------------------------------------------------- Stockpile collectibles
  R({ id: 'signed_basketball', name: 'Signed Game-Winner Basketball', price: 450, resale: 520, rarity: 'rare', emoji: '🏀', desc: 'Authenticated game ball, signed in sharpie, sealed in an acrylic cube.', build: signedBall, use: { type: 'decor', verb: 'Admire', lines: ['Swish. You can practically hear the buzzer.', 'The signature is a masterpiece of loops.', 'Authenticated, appreciated, untouchable.'] } }),
  R({ id: 'vintage_pocketpal', name: '1989 PocketPal (Complete in Box)', price: 380, resale: 430, rarity: 'rare', emoji: '🕹️', desc: 'The original grey brick, with the box it came in. A museum piece that still smells like 1989.', build: vintageConsole, use: { type: 'decor', verb: 'Admire', lines: ['Four AA batteries of pure nostalgia.', 'The box alone is worth more than your first car.', 'That green screen glow… iconic.'] } }),
  R({ id: 'designer_bloxbear_chrome', name: 'Bloxbear 400% — Mirror Chrome', price: 650, resale: 900, rarity: 'epic', limited: true, stores: ['kollectiv', 'stockpile'], emoji: '🐻', desc: 'Limited drop! A towering mirror-chrome Bloxbear. Reflects your excellent taste.', build: () => bloxbear({ m: mat('#eef1f5', { rough: 0.04, metal: 1 }) }), use: { type: 'decor', verb: 'Admire', lines: ['You can see your reflection. You look rich.', 'Chrome so shiny it has its own weather.', 'A limited drop that collectors fight over.'] } }),
  R({ id: 'designer_bloxbear_pastel', name: 'Bloxbear 400% — Cotton Candy', price: 220, resale: 240, rarity: 'rare', stores: ['kollectiv', 'stockpile'], emoji: '🐻', desc: 'The iconic block bear in a dreamy pink-to-blue gradient finish.', build: () => bloxbear({ m: mat('#ffc8dd', { rough: 0.2, clearcoat: 1 }) }), use: { type: 'decor', verb: 'Admire', lines: ['Cotton candy, but make it art.', 'A bear-shaped mood board.'] } }),
  R({ id: 'designer_drip_smiley', name: 'Drip Smile Sculpture', price: 260, resale: 290, rarity: 'rare', stores: ['kollectiv', 'stockpile'], emoji: '😊', desc: 'A melting smiley art toy in glossy resin. Happiness, but make it sticky.', build: dripSmiley, use: { type: 'decor', verb: 'Admire', lines: ['Smiling through the meltdown.', 'Art that feels like a Monday.', 'Drip, drip, delight.'] } }),
  R({ id: 'designer_hollow_pal', name: 'Hollow Pal — Dusk Edition', price: 480, resale: 700, rarity: 'epic', limited: true, stores: ['kollectiv', 'stockpile'], emoji: '🫥', desc: 'Limited drop! A pensive vinyl pal hugging its knees, X-eyes and all. Collectors line up at midnight for these.', build: () => hollowPal({}), use: { type: 'decor', verb: 'Contemplate', lines: ['It\'s thinking about something deep. Or nothing at all.', 'Sitting with its feelings. Relatable.', 'Collectors would trade a kidney for this.'] } }),
  R({ id: 'limited_neon_kaiju', name: 'Neon Kaiju (Glow Edition)', price: 160, resale: 300, rarity: 'epic', limited: true, stores: ['kollectiv', 'stockpile'], emoji: '🦖', desc: 'Limited drop! A glow-in-the-dark kaiju in translucent radioactive green.', build: neonKaiju, use: { type: 'decor', verb: 'Admire', lines: ['RAWR (glowingly).', 'It glows a little brighter when no one is looking.', 'Tokyo is safe. Your shelf is not.'] } }),
  R({ id: 'model_car_convertible', name: '1:18 Riviera Convertible Model', price: 129, resale: 150, rarity: 'uncommon', stores: ['stockpile', 'luxe'], emoji: '🚗', desc: 'A die-cast cherry-red 1960s convertible with chrome bumpers, in a dust-proof case.', build: () => caseOver(classicCar({}), 0.3, 0.12, 0.13, 'car', 'RIVIERA CONVERTIBLE', '1:18 · DIE-CAST'), use: { type: 'decor', verb: 'Admire', lines: ['Top down, hair up, imaginary road trip.', 'The chrome bumpers gleam.', 'Vroom (quietly, it\'s a model).'] } }),
  R({ id: 'model_car_f1', name: '1:18 Formula Racer Model', price: 159, resale: 175, rarity: 'uncommon', stores: ['stockpile', 'volt'], emoji: '🏎️', desc: 'A detailed teal-liveried open-wheel racer, #44, on a black display base.', build: () => group(at(rbox(0.16, 0.012, 0.3, 0.004, mat('#111', { rough: 0.3 })), 0, 0.006, 0), at(f1Car(), 0, 0.012, 0)), use: { type: 'decor', verb: 'Admire', lines: ['Lights out and away we go!', 'Aerodynamic down to the tiny wing.', 'Fastest thing in the apartment (standing still).'] } }),
  R({ id: 'trophy_champion', name: 'City League Champion Trophy', price: 249, resale: 260, rarity: 'uncommon', stores: ['stockpile', 'luxe'], emoji: '🏆', desc: 'A gleaming gold cup on a marble base. You didn\'t win it, but nobody needs to know.', build: trophy, use: { type: 'decor', verb: 'Polish', lines: ['You polish it. You feel like a champion.', 'MVP: Most Valuable Purchaser.', 'The crowd goes wild (in your head).'] } }),
  R({ id: 'tin_robot', name: 'Vintage Wind-Up Tin Robot', price: 189, resale: 220, rarity: 'rare', stores: ['stockpile', 'kollectiv'], emoji: '🤖', desc: 'A 1950s-style lithographed tin robot with glowing eyes and a wind-up key.', build: tinRobot, use: { type: 'decor', verb: 'Admire', lines: ['BEEP BOOP. (It does not actually beep.)', 'Gauges all reading: adorable.', 'Built when the future was shiny and red.'] } }),
  R({ id: 'jeweled_egg', name: 'Imperial Jeweled Egg', price: 2400, resale: 2600, rarity: 'legendary', stores: ['luxe', 'stockpile'], emoji: '🥚', desc: 'Guilloché enamel, gold filigree, rubies and diamonds on a gilded stand. Extremely not for breakfast.', build: jeweledEgg, use: { type: 'decor', verb: 'Admire', lines: ['Fit for an empress. Currently on your shelf.', 'The rubies catch the light like tiny embers.', 'Do NOT make an omelette.'] } }),
]);
