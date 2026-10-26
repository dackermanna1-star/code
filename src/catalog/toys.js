// Catalogue: toys — balls, yo-yos, desk toys, puzzle cubes, snow globes,
// fidgets, squishies, rubber ducks, gliders and a whole shelf of plushies.
// Conventions: meters, origin bottom-center, front faces +Z (see docs/CONTENT_GUIDE.md).
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, capsule, lathe, tube, at, rot, group, hemi } from '../items/kit.js';
import { seeded } from '../core/utils.js';
import { labelTexture } from '../core/textures.js';
import { sgeo, mesh, txt, circle, face, zcyl, xcyl } from './tech.js';

const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const plush = (c) => mat(c, { rough: 1, sheen: 0.9 });
const gloss = (c) => mat(c, { rough: 0.25, clearcoat: 0.8 });
const eyeM = () => mat('#141414', { rough: 0.12, clearcoat: 1 });

// ------------------------------------------------------------------ balls
function sphereTex(key, draw) { return labelTexture(`ballt:${key}`, 512, 256, draw); }
function ballMesh(r, material) { const b = sph(r, material, 40, 24); return at(b, 0, r, 0); }
export function basketball() {
  const tex = sphereTex('basket', (ctx, w, h) => {
    ctx.fillStyle = '#e2662b'; ctx.fillRect(0, 0, w, h);
    const r = seeded(5); for (let i = 0; i < 2500; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(r() * w, r() * h, 2, 2); }
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    for (const x of [0.25, 0.75]) { ctx.beginPath(); ctx.moveTo(w * x, 0); ctx.lineTo(w * x, h); ctx.stroke(); }
    const curve = (u0, sgn) => { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const v = i / 40; ctx.lineTo((u0 + sgn * 0.13 * Math.sin(v * PI)) * w, v * h); } ctx.stroke(); };
    curve(0.5, 1); curve(0.5, -1); curve(0, 1); curve(1, -1);
  });
  return group(ballMesh(0.12, mat('#ffffff', { map: tex, rough: 0.75 })));
}
let ICO = null;
function icoDirs() {
  if (ICO) return ICO;
  const p = (1 + Math.sqrt(5)) / 2; const v = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a, b * p], [a, b * p, 0], [b * p, 0, a]);
  ICO = v.map((x) => new THREE.Vector3(...x).normalize());
  return ICO;
}
function soccerBall() {
  const r = 0.11;
  const g = group(ballMesh(r, mat('#f8f8f6', { rough: 0.35, clearcoat: 0.4 })));
  const capGeo = sgeo('soccer:cap', () => new THREE.SphereGeometry(r * 1.028, 5, 1, 0, PI * 2, 0, 0.36));
  const black = mat('#1b1b1e', { rough: 0.35, clearcoat: 0.4 });
  for (const d of icoDirs()) { const c = mesh(capGeo, black); c.quaternion.setFromUnitVectors(UP, d); c.position.set(0, r, 0); g.add(c); }
  return g;
}
function tennisBall() {
  const r = 0.033;
  const g = group(ballMesh(r, mat('#d4e83a', { rough: 1, sheen: 1 })));
  const pts = [];
  for (let i = 0; i < 48; i++) { const t = i / 48 * PI * 2; const v = new THREE.Vector3(Math.cos(t) + 0.45 * Math.cos(3 * t), Math.sin(t) - 0.45 * Math.sin(3 * t), 1.1 * Math.sin(2 * t)).normalize().multiplyScalar(r * 1.0); pts.push([v.x, v.y + r, v.z]); }
  g.add(tube(pts, 0.0011, mat('#fbfbf2', { rough: 0.9 }), 96, 5, true));
  return g;
}
function beachBall() {
  const tex = sphereTex('beach', (ctx, w, h) => {
    const cols = ['#e63946', '#ffd60a', '#3a86ff', '#ffffff', '#06d6a0', '#ff7b00'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w / 6, 0, w / 6 + 1, h); });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h * 0.07); ctx.fillRect(0, h * 0.93, w, h * 0.07);
  });
  const g = group(ballMesh(0.2, mat('#ffffff', { map: tex, rough: 0.2, clearcoat: 0.8 })));
  g.add(at(cyl(0.025, 0.025, 0.006, mat('#ffffff', { rough: 0.3 }), 20), 0, 0.401, 0));
  return g;
}
function bouncyBall() {
  const tex = sphereTex('bouncy', (ctx, w, h) => {
    const gg = ctx.createLinearGradient(0, 0, w, h); gg.addColorStop(0, '#7b2cbf'); gg.addColorStop(0.5, '#ff4fa3'); gg.addColorStop(1, '#5ef2ff');
    ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 10; for (let i = 0; i < 5; i++) { ctx.beginPath(); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * (0.15 + i * 0.18) + Math.sin(x * 0.03 + i) * 16); ctx.stroke(); }
    const r = seeded(2); for (let i = 0; i < 300; i++) circle(ctx, r() * w, r() * h, 1.2, 'rgba(255,255,255,0.9)');
  });
  return group(ballMesh(0.024, mat('#ffffff', { map: tex, rough: 0.08, clearcoat: 1 })));
}

// ------------------------------------------------------------------ yo-yos, kendama, slinky, tops
function yoyoModel({ c1 = '#e63946', c2 = '#ffffff', metal = false, key = 'red' } = {}) {
  const g = new THREE.Group();
  const R = 0.029;
  const pivot = new THREE.Group(); pivot.position.y = R + 0.001;
  const yo = new THREE.Group(); yo.name = 'yoyo';
  const shell = metal ? mat(c1, { rough: 0.15, metal: 0.9 }) : gloss(c1);
  const half = lathe([[0.004, 0], [R * 0.7, 0.001], [R, 0.006], [R * 0.98, 0.014], [R * 0.6, 0.017], [0.001, 0.017]], shell, 36);
  for (const s of [-1, 1]) {
    const h = half.clone(); h.rotation.x = s * PI / 2; h.position.z = s * 0.002; yo.add(h);
    const cap = face(R * 1.1, R * 1.1, `yoyo:cap:${key}`, (ctx, w, hh) => { ctx.clearRect(0, 0, w, hh); circle(ctx, w / 2, hh / 2, w * 0.36, c2); txt(ctx, '★', w / 2, hh / 2 + 4, w * 0.5, c1); }, { transparent: true, th: 128 });
    cap.rotation.y = s > 0 ? 0 : PI; cap.position.z = s * 0.0195; yo.add(cap);
  }
  yo.add(zcyl(0.003, 0.003, 0.005, MAT.chrome(), 10));
  const string = cyl(0.0009, 0.0009, 0.1, mat('#f4f1de', { rough: 0.9 }), 5); string.name = 'string'; string.scale.y = 0.01;
  pivot.add(string, yo);
  g.add(pivot);
  g.add(at(cyl(0.0009, 0.0009, 0.035, mat('#f4f1de', { rough: 0.9 }), 5), 0, 2 * R + 0.018, 0));
  g.add(at(rot(torus(0.008, 0.0015, mat('#f4f1de', { rough: 0.9 }), 6, 16), 0, PI / 2, 0), 0, 2 * R + 0.043, 0));
  return g;
}
function kendama() {
  const g = new THREE.Group();
  const wood = MAT.wood('#e3c08d');
  g.add(at(cyl(0.012, 0.014, 0.09, wood, 16), 0, 0.045, 0));
  g.add(at(lathe([[0.001, 0], [0.012, 0], [0.02, 0.008], [0.021, 0.012], [0.001, 0.012]], wood, 20), 0, 0.09, 0));
  const cross = new THREE.Group(); cross.position.set(0, 0.12, 0);
  cross.add(xcyl(0.016, 0.016, 0.075, wood, 20));
  for (const [s, r] of [[-1, 0.024], [1, 0.02]]) cross.add(at(rot(lathe([[0.001, 0], [r * 0.6, 0], [r, 0.012], [r * 0.9, 0.012], [0.001, 0.004]], wood, 24), 0, 0, -s * PI / 2), s * 0.04, 0, 0));
  g.add(cross);
  g.add(at(lathe([[0.016, 0], [0.012, 0.03], [0.004, 0.05], [0.001, 0.055]], wood, 16), 0, 0.12, 0));
  const ball = sph(0.03, mat('#d62828', { rough: 0.2, clearcoat: 1 }), 28, 18);
  g.add(at(ball, 0.0, 0.2, 0));
  g.add(at(rot(torus(0.0301, 0.002, mat('#fefae0', { rough: 0.5 }), 6, 32), PI / 2, 0, 0.3), 0, 0.2, 0));
  g.add(tube([[0.006, 0.1, 0.012], [0.035, 0.11, 0.03], [0.03, 0.16, 0.03], [0.012, 0.185, 0.02]], 0.0009, mat('#f4f1de'), 16, 4));
  return g;
}
function slinkyModel({ rainbow = false } = {}) {
  const g = new THREE.Group();
  const n = 18; const cols = ['#e63946', '#f77f00', '#ffd60a', '#80b918', '#3a86ff', '#7b2cbf'];
  for (let i = 0; i < n; i++) {
    const m = rainbow ? mat(cols[Math.floor(i / 3) % 6], { rough: 0.3, clearcoat: 0.6 }) : MAT.metal('#d7dbe0', 0.18);
    const t = torus(0.036, rainbow ? 0.0045 : 0.0028, m, 6, 32); t.rotation.x = PI / 2 + (i % 2 ? 0.03 : -0.03);
    g.add(at(t, 0, 0.004 + i * (rainbow ? 0.0068 : 0.0045), 0));
  }
  return g;
}
function topModel({ tin = false } = {}) {
  const g = new THREE.Group();
  if (tin) {
    const tex = labelTexture('top:tin', 256, 256, (ctx, w, h) => { const cols = ['#e63946', '#ffd60a', '#3a86ff', '#ffffff', '#2a9d8f', '#ff70a6']; for (let i = 0; i < 12; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(0, i * h / 12, w, h / 12 + 1); } ctx.fillStyle = 'rgba(255,255,255,0.4)'; for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 8, h); ctx.fill(); } });
    g.add(lathe([[0.001, 0], [0.004, 0.004], [0.03, 0.02], [0.06, 0.045], [0.068, 0.065], [0.06, 0.085], [0.03, 0.1], [0.008, 0.104], [0.001, 0.104]], mat('#ffffff', { map: tex, rough: 0.2, metal: 0.6 }), 40));
    g.add(at(cyl(0.004, 0.004, 0.09, MAT.chrome(), 10), 0, 0.14, 0));
    g.add(at(sph(0.014, mat('#e63946', { rough: 0.3, clearcoat: 1 }), 16, 12), 0, 0.19, 0));
  } else {
    const wood = MAT.wood('#d9a066');
    g.add(lathe([[0.001, 0], [0.003, 0.003], [0.024, 0.022], [0.036, 0.036], [0.034, 0.044], [0.016, 0.05], [0.006, 0.052], [0.001, 0.052]], wood, 32));
    for (const [y, r, c] of [[0.03, 0.03, '#e63946'], [0.038, 0.0355, '#264653']]) g.add(at(rot(torus(r, 0.0025, mat(c, { rough: 0.4 }), 6, 32), PI / 2, 0, 0), 0, y, 0));
    g.add(at(cyl(0.004, 0.005, 0.03, wood, 10), 0, 0.065, 0));
  }
  return g;
}

// ------------------------------------------------------------------ puzzle cubes
const CUBE_COLS = ['#ffffff', '#ffd500', '#c41e3a', '#ff5800', '#0051ba', '#009e60'];
function stickerFace(key, cols, rows, seed, pastel) {
  const pal = pastel ? ['#fdfcdc', '#fed9b7', '#f07167', '#ffafcc', '#a2d2ff', '#b9fbc0'] : CUBE_COLS;
  return labelTexture(`cubef:${key}:${cols}x${rows}:${seed}:${pastel}`, 32 * cols, 32 * rows, (ctx, w, h) => {
    const r = seeded(seed);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { ctx.fillStyle = pal[Math.floor(r() * 6)]; const p = 3; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x * 32 + p, y * 32 + p, 32 - 2 * p, 32 - 2 * p, 5) : ctx.rect(x * 32 + p, y * 32 + p, 32 - 2 * p, 32 - 2 * p); ctx.fill(); }
  });
}
function puzzleCube({ n = 3, size = 0.057, pastel = false } = {}) {
  const g = new THREE.Group();
  const core = mat('#121212', { rough: 0.35 });
  const c = size / n; const lowH = size - c;
  const stick = (w, h, key, cols, rows, seed) => { const tex = stickerFace(key, cols, rows, seed, pastel); return new THREE.Mesh(sgeo(`cplane:${w.toFixed(4)}:${h.toFixed(4)}`, () => new THREE.PlaneGeometry(w, h)), mat('#ffffff', { map: tex, rough: 0.25, clearcoat: 0.6 })); };
  g.add(at(rbox(size, lowH, size, 0.004, core), 0, lowH / 2, 0));
  const sides = [[0, 0, 1, 0], [PI / 2, 1, 0, 0], [PI, 0, -1, 0], [-PI / 2, -1, 0, 0]];
  sides.forEach(([ry, sx, sz], i) => { const s = stick(size * 0.98, lowH * 0.98, `low${n}${i}`, n, n - 1, 11 + i * 7 + n); s.rotation.y = ry; s.position.set(sx * (size / 2 + 0.0004), lowH / 2, sz * (size / 2 + 0.0004)); g.add(s); });
  const layer = new THREE.Group(); layer.name = 'layer'; layer.position.y = lowH;
  layer.add(at(rbox(size, c, size, 0.004, core), 0, c / 2, 0));
  const top = stick(size * 0.98, size * 0.98, `top${n}`, n, n, 5 + n); top.rotation.x = -PI / 2; top.position.y = c + 0.0004; layer.add(top);
  sides.forEach(([ry, sx, sz], i) => { const s = stick(size * 0.98, c * 0.96, `up${n}${i}`, n, 1, 31 + i * 3 + n); s.rotation.y = ry; s.position.set(sx * (size / 2 + 0.0004), c / 2, sz * (size / 2 + 0.0004)); layer.add(s); });
  layer.rotation.y = 0.18;
  g.add(layer);
  return g;
}

// ------------------------------------------------------------------ snow globes
function globeBase({ base = '#6b4423', plate = '#c9a86a', label = '', key = 'g' }) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.06, 0], [0.062, 0.006], [0.056, 0.03], [0.048, 0.04], [0.001, 0.04]], base === 'wood' ? MAT.wood('#7a4b2a') : mat(base, { rough: 0.3, clearcoat: 0.6 }), 40));
  const p = face(0.05, 0.014, `globe:plate:${key}`, (ctx, w, h) => { ctx.fillStyle = plate; ctx.fillRect(0, 0, w, h); txt(ctx, label, w / 2, h / 2 + 1, h * 0.6, '#3b2a14', { font: 'Georgia, serif', max: w * 0.9 }); }, { th: 72 });
  p.rotation.x = -0.18; g.add(at(p, 0, 0.02, 0.0575));
  return g;
}
const GLOBE_C = [0, 0.092, 0], GLOBE_R = 0.058;
function snowGlobe(scene, o) {
  const g = globeBase(o);
  g.add(at(cyl(0.05, 0.05, 0.004, mat(o.ground || '#ffffff', { rough: 0.8 }), 32), 0, 0.042, 0));
  const inner = new THREE.Group(); inner.position.y = 0.044; scene(inner); g.add(inner);
  g.add(at(sph(GLOBE_R, MAT.glass('#eef8ff', 0.22), 40, 28), ...GLOBE_C));
  return g;
}
const SCENES = {
  winter(s) {
    const w = mat('#fbfbfb', { rough: 0.6 });
    s.add(at(sph(0.016, w, 16, 12), 0, 0.014, 0), at(sph(0.012, w, 16, 12), 0, 0.037, 0), at(sph(0.009, w, 14, 10), 0, 0.055, 0));
    s.add(at(cyl(0.008, 0.008, 0.004, mat('#222'), 14), 0, 0.064, 0), at(cyl(0.005, 0.005, 0.01, mat('#222'), 14), 0, 0.07, 0));
    s.add(at(rot(cone(0.0025, 0.012, mat('#f77f00'), 8), PI / 2, 0, 0), 0, 0.055, 0.014));
    s.add(at(rot(torus(0.011, 0.003, mat('#c1121f'), 6, 16), PI / 2, 0, 0), 0, 0.047, 0));
    for (const [x, z, h] of [[-0.03, -0.01, 0.04], [0.03, -0.015, 0.05], [0.022, 0.02, 0.03]]) { s.add(at(cone(0.012, h, mat('#2d6a4f', { rough: 0.7 }), 8), x, h / 2, z)); }
  },
  spring(s) {
    s.add(at(cyl(0.004, 0.006, 0.05, MAT.wood('#5a3b26'), 8), 0, 0.025, 0));
    const pink = mat('#ffafcc', { rough: 0.7 }); const pink2 = mat('#ffc8dd', { rough: 0.7 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; s.add(at(sph(0.016, i % 2 ? pink : pink2, 12, 10), Math.cos(a) * 0.014, 0.058 + (i % 3) * 0.005, Math.sin(a) * 0.014)); }
    s.add(at(sph(0.018, pink, 12, 10), 0, 0.068, 0));
    for (let i = 0; i < 5; i++) s.add(at(sph(0.003, mat('#ffd166'), 6, 4), Math.cos(i * 2) * 0.03, 0.004, Math.sin(i * 2) * 0.03));
  },
  summer(s) {
    s.add(at(cyl(0.048, 0.048, 0.004, mat('#4cc9f0', { rough: 0.1, clearcoat: 1 }), 32), 0, 0.001, 0));
    const sand = sph(0.03, mat('#f2d49b', { rough: 0.9 }), 20, 12); sand.scale.y = 0.35; s.add(at(sand, 0, 0.002, 0));
    s.add(tube([[0, 0.008, 0], [0.004, 0.03, 0], [0.012, 0.055, 0]], 0.0028, MAT.wood('#8d6346'), 10, 6));
    for (let k = 0; k < 6; k++) { const leaf = sph(0.014, mat('#40916c', { rough: 0.6 }), 10, 6); leaf.scale.set(1.4, 0.2, 0.45); leaf.rotation.set(0, k * 1.05, -0.4); s.add(at(leaf, 0.012 + Math.cos(k * 1.05) * 0.012, 0.055, -Math.sin(k * 1.05) * 0.012)); }
    s.add(at(sph(0.004, mat('#5a3b26'), 8, 6), 0.012, 0.052, 0.004));
  },
  autumn(s) {
    const p = sph(0.022, mat('#f77f00', { rough: 0.45 }), 20, 14); p.scale.y = 0.75; s.add(at(p, 0.008, 0.016, 0.006));
    for (let i = 0; i < 6; i++) { const rib = torus(0.0215, 0.0025, mat('#e85d04', { rough: 0.5 }), 6, 20); rib.rotation.y = i * PI / 6; rib.scale.y = 0.75; s.add(at(rib, 0.008, 0.016, 0.006)); }
    s.add(at(cyl(0.003, 0.004, 0.012, mat('#5a3b26'), 8), 0.008, 0.035, 0.006));
    s.add(at(cyl(0.003, 0.005, 0.045, MAT.wood('#5a3b26'), 8), -0.025, 0.022, -0.015));
    for (let i = 0; i < 5; i++) s.add(at(sph(0.012, mat(['#e85d04', '#d00000', '#ffba08'][i % 3], { rough: 0.7 }), 10, 8), -0.025 + Math.cos(i * 1.3) * 0.01, 0.05 + (i % 2) * 0.008, -0.015 + Math.sin(i * 1.3) * 0.01));
  },
  city(s) {
    const r = seeded(4);
    for (let i = 0; i < 9; i++) { const h = 0.02 + r() * 0.05; const b = box(0.012, h, 0.012, mat(['#3d405b', '#4a4e69', '#22223b'][i % 3], { rough: 0.5 })); s.add(at(b, -0.036 + (i % 5) * 0.018, h / 2, (i < 5 ? -0.012 : 0.012) + (i % 2) * 0.004)); }
    s.add(at(cyl(0.001, 0.0015, 0.03, MAT.chrome(), 6), 0.0, 0.085, -0.008));
    for (let i = 0; i < 6; i++) s.add(at(box(0.003, 0.003, 0.0005, mat('#ffe8a3', { emissive: '#ffd166', ei: 1 })), -0.036 + (i % 5) * 0.018, 0.015 + (i % 3) * 0.01, -0.0055));
  },
};

// ------------------------------------------------------------------ desk toys, games & optics
function magic8() {
  const tex = labelTexture('8ball', 512, 256, (ctx, w, h) => { ctx.fillStyle = '#0d0d0f'; ctx.fillRect(0, 0, w, h); circle(ctx, w * 0.25, h * 0.42, 34, '#fbfbfb'); txt(ctx, '8', w * 0.25, h * 0.42 + 2, 44, '#0d0d0f', { weight: 900 }); });
  return group(at(sph(0.05, mat('#ffffff', { map: tex, rough: 0.1, clearcoat: 1 }), 40, 24), 0, 0.05, 0));
}
function polyDice() {
  const g = new THREE.Group();
  const gem = (c) => mat(c, { rough: 0.1, clearcoat: 1, opacity: 0.85, transparent: true, flat: true });
  const add = (key, make, c, x, z, s, ry) => { const d = mesh(sgeo(key, make), gem(c)); d.scale.setScalar(s); d.rotation.set(0.4, ry, 0.2); g.add(at(d, x, s * 0.85, z)); };
  add('d20', () => new THREE.IcosahedronGeometry(1, 0), '#7b2cbf', 0, 0, 0.012, 0.3);
  add('d12', () => new THREE.DodecahedronGeometry(1, 0), '#3a86ff', 0.032, -0.012, 0.011, 1);
  add('d8', () => new THREE.OctahedronGeometry(1, 0), '#ff4fa3', -0.03, -0.01, 0.011, 2);
  add('d6', () => new THREE.BoxGeometry(1.2, 1.2, 1.2), '#06d6a0', -0.012, 0.03, 0.008, 0.5);
  add('d4', () => new THREE.TetrahedronGeometry(1, 0), '#ffd166', 0.026, 0.026, 0.011, 1.5);
  g.add(at(rbox(0.11, 0.004, 0.09, 0.002, MAT.leather('#3b2a1e')), 0, 0.002, 0.008));
  return g;
}
function pipTex(n) {
  return labelTexture(`pips:${n}`, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, w, h);
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] };
    for (const [x, y] of P[n]) circle(ctx, x * 16, y * 16, n === 1 ? 8 : 6, n === 1 ? '#c1121f' : '#1b1b1b');
  });
}
function classicDice() {
  const g = new THREE.Group();
  const mats = [1, 6, 2, 5, 3, 4].map((n) => mat('#ffffff', { map: pipTex(n), rough: 0.3, clearcoat: 0.5 }));
  const geo = sgeo('d6pip', () => new THREE.BoxGeometry(0.018, 0.018, 0.018));
  for (const [x, z, ry] of [[-0.014, 0, 0.3], [0.014, 0.008, -0.5]]) { const d = mesh(geo, mats); d.rotation.y = ry; g.add(at(d, x, 0.009, z)); }
  return g;
}
function cardFace(rank, suit, red) {
  return (ctx, w, h) => { ctx.fillStyle = '#fbfbf8'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2); const c = red ? '#c1121f' : '#1b1b1b'; txt(ctx, rank, 16, 18, 20, c, { weight: 800 }); txt(ctx, suit, 16, 38, 16, c); txt(ctx, suit, w / 2, h / 2, 60, c); };
}
function cardDeck() {
  const g = new THREE.Group();
  const back = labelTexture('cardback', 128, 176, (ctx, w, h) => { ctx.fillStyle = '#fbfbf8'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#b5172b'; ctx.fillRect(6, 6, w - 12, h - 12); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; for (let i = -h; i < w + h; i += 10) { ctx.beginPath(); ctx.moveTo(i, 6); ctx.lineTo(i + h, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 6); ctx.stroke(); } circle(ctx, w / 2, h / 2, 18, '#fbfbf8'); txt(ctx, '♠', w / 2, h / 2 + 2, 24, '#b5172b'); });
  const side = mat('#b5172b', { rough: 0.6 });
  const deck = new THREE.Mesh(sgeo('deckbox', () => new THREE.BoxGeometry(0.066, 0.092, 0.022)), [side, side, side, side, mat('#ffffff', { map: back, rough: 0.4 }), mat('#ffffff', { map: back, rough: 0.4 })]);
  deck.castShadow = true; deck.rotation.y = -0.25; g.add(at(deck, -0.05, 0.046, -0.03));
  const cards = [['A', '♠', false], ['K', '♥', true], ['Q', '♦', true], ['J', '♣', false]];
  cards.forEach(([r, s, red], i) => { const c = face(0.063, 0.088, `card:${r}${s}`, cardFace(r, s, red), { th: 176 }); c.rotation.set(-PI / 2, 0, 0.5 - i * 0.28); g.add(at(c, 0.04 + i * 0.012, 0.0012 + i * 0.0006, 0.02 - Math.abs(i - 1.5) * 0.004)); });
  return g;
}
function kaleidoscope() {
  const g = new THREE.Group();
  const tex = labelTexture('kalei:paper', 256, 128, (ctx, w, h) => { ctx.fillStyle = '#3c096c'; ctx.fillRect(0, 0, w, h); const cols = ['#ffd166', '#ff4fa3', '#5ef2ff', '#7bf1a8']; for (let i = 0; i < 40; i++) { const x = (i * 37) % w, y = (i * 53) % h; ctx.fillStyle = cols[i % 4]; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; const r = k % 2 ? 4 : 10; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); } });
  g.add(at(xcyl(0.022, 0.022, 0.2, mat('#ffffff', { map: tex, rough: 0.55 }), 32), 0, 0.03, 0));
  g.add(at(xcyl(0.025, 0.025, 0.012, MAT.gold(), 32), 0.1, 0.03, 0), at(xcyl(0.025, 0.025, 0.012, MAT.gold(), 32), -0.1, 0.03, 0));
  g.add(at(xcyl(0.027, 0.027, 0.03, mat('#e9f5ff', { rough: 0.05, opacity: 0.5, transparent: true }), 32), 0.12, 0.03, 0));
  ['#ff4fa3', '#ffd166', '#5ef2ff', '#7bf1a8', '#ff7b00'].forEach((c, i) => g.add(at(sph(0.005, mat(c, { rough: 0.1, emissive: c, ei: 0.3 }), 8, 6), 0.112 + (i % 3) * 0.008, 0.02 + (i % 2) * 0.012, -0.01 + i * 0.005)));
  g.add(at(xcyl(0.008, 0.012, 0.008, mat('#1b1b1b'), 20), -0.11, 0.03, 0));
  for (const x of [-0.06, 0.06]) g.add(at(box(0.015, 0.012, 0.04, MAT.wood('#7a4b2a')), x, 0.006, 0));
  return g;
}
function newtonsCradle() {
  const g = new THREE.Group();
  const top = 0.15, L = 0.09, br = 0.0125;
  g.add(at(rbox(0.2, 0.02, 0.12, 0.006, MAT.wood('#3b2a1e')), 0, 0.01, 0));
  const chrome = MAT.chrome();
  for (const z of [-0.045, 0.045]) g.add(tube([[-0.085, 0.02, z], [-0.085, top - 0.01, z], [-0.075, top, z], [0.075, top, z], [0.085, top - 0.01, z], [0.085, 0.02, z]], 0.003, chrome, 32, 6));
  const thread = mat('#e9ecef', { rough: 0.8 });
  const ballM = mat('#e8ebef', { rough: 0.05, metal: 1 });
  const sl = Math.hypot(0.045, L);
  const ang = Math.atan2(0.045, L);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * br * 2.02;
    const piv = new THREE.Group(); piv.position.set(x, top, 0);
    for (const s of [-1, 1]) { const t = cyl(0.0005, 0.0005, sl, thread, 4); t.position.set(0, -L / 2, s * 0.0225); t.rotation.x = s * ang; piv.add(t); }
    piv.add(at(sph(br, ballM, 20, 14), 0, -L - br * 0.6, 0));
    if (i === 0) piv.name = 'pivotL'; if (i === 4) piv.name = 'pivotR';
    g.add(piv);
  }
  return g;
}

// ------------------------------------------------------------------ bubbles, squishies, ducks
function giantWand() {
  const g = new THREE.Group();
  g.add(at(cyl(0.008, 0.008, 0.38, MAT.wood('#c9a66b'), 10), 0, 0.19, 0));
  g.add(at(rot(torus(0.08, 0.006, MAT.knit('#ff70a6'), 8, 40), 0, 0, 0), 0, 0.47, 0));
  g.add(at(rot(torus(0.07, 0.003, MAT.knit('#ffd166'), 6, 40), 0, 0, 0), 0, 0.47, 0.004));
  g.add(at(cyl(0.012, 0.012, 0.08, mat('#ff70a6', { rough: 0.6 }), 12), 0, 0.04, 0));
  return g;
}
function bubbleGun() {
  const g = new THREE.Group();
  const body = gloss('#2ec4b6'), acc = gloss('#ff9f1c');
  g.add(at(rbox(0.05, 0.06, 0.16, 0.02, body), 0, 0.1, 0.0));
  g.add(at(rot(rbox(0.04, 0.09, 0.045, 0.014, body), 0.3, 0, 0), 0, 0.045, -0.05));
  g.add(at(rbox(0.012, 0.025, 0.012, 0.004, acc), 0, 0.06, -0.012));
  g.add(at(zcyl(0.028, 0.03, 0.03, acc, 24), 0, 0.105, 0.09));
  g.add(at(torus(0.022, 0.004, mat('#ffffff', { rough: 0.3 }), 6, 24), 0, 0.105, 0.108));
  g.add(at(cyl(0.022, 0.022, 0.05, mat('#e0fbfc', { rough: 0.05, opacity: 0.55, transparent: true }), 20), 0, 0.155, -0.02));
  g.add(at(cyl(0.02, 0.02, 0.035, mat('#ffb3de', { rough: 0.2, opacity: 0.8, transparent: true }), 20), 0, 0.148, -0.02));
  g.add(at(cyl(0.023, 0.023, 0.01, acc, 20), 0, 0.185, -0.02));
  return g;
}
function squishyPeach() {
  const g = new THREE.Group();
  const p = sph(0.05, mat('#ffb4a2', { rough: 0.95, sheen: 1 }), 32, 20); p.scale.set(1, 0.92, 0.95); g.add(at(p, 0, 0.046, 0));
  const blush = sph(0.035, mat('#ff7b7b', { rough: 1, sheen: 1, opacity: 0.6, transparent: true }), 20, 12); blush.scale.set(1, 0.9, 0.5); g.add(at(blush, 0.014, 0.05, 0.03));
  g.add(at(rot(torus(0.0472, 0.0022, mat('#f28482', { rough: 1 }), 6, 24, PI / 2), 0, -0.5, 0), 0, 0.046, 0.0));
  g.add(at(cyl(0.002, 0.003, 0.01, mat('#6b4423'), 6), 0, 0.093, 0));
  const leaf = sph(0.014, mat('#52b788', { rough: 0.5 }), 12, 8); leaf.scale.set(1.5, 0.25, 0.7); leaf.rotation.z = 0.35; g.add(at(leaf, 0.017, 0.094, 0));
  for (const s of [-1, 1]) g.add(at(sph(0.004, eyeM(), 8, 6), s * 0.014, 0.05, 0.047));
  g.add(at(rot(torus(0.005, 0.0012, eyeM(), 6, 12, PI), 0, 0, PI), 0, 0.042, 0.048));
  return g;
}
function mochiCat() {
  const g = new THREE.Group();
  const m = mat('#fdfcf7', { rough: 1, sheen: 1 });
  const b = sph(0.05, m, 32, 20); b.scale.set(1.15, 0.72, 1); g.add(at(b, 0, 0.036, 0));
  for (const s of [-1, 1]) { const e = cone(0.017, 0.026, m, 12); e.rotation.z = -s * 0.4; g.add(at(e, s * 0.033, 0.07, 0)); const ei = cone(0.01, 0.016, mat('#ffafcc', { rough: 1 }), 10); ei.rotation.z = -s * 0.4; g.add(at(ei, s * 0.033, 0.069, 0.006)); }
  for (const s of [-1, 1]) { g.add(at(sph(0.0045, eyeM(), 8, 6), s * 0.016, 0.045, 0.047)); g.add(at(rot(cyl(0.007, 0.007, 0.001, mat('#ffafcc', { rough: 1 }), 12), PI / 2, 0, 0), s * 0.027, 0.037, 0.046)); }
  g.add(at(sph(0.003, mat('#ff8fab'), 8, 6), 0, 0.039, 0.05));
  g.add(at(sph(0.012, mat('#ffd166', { rough: 1 }), 10, 8), -0.03, 0.06, -0.01));
  return g;
}
function squeakyDino() {
  const g = new THREE.Group();
  const m = gloss('#80b918');
  const body = sph(0.04, m, 24, 16); body.scale.set(0.9, 0.9, 1.2); g.add(at(body, 0, 0.042, 0));
  g.add(at(sph(0.03, m, 20, 14), 0, 0.09, 0.035));
  const snout = sph(0.02, m, 16, 12); snout.scale.set(1.1, 0.8, 1); g.add(at(snout, 0, 0.085, 0.06));
  for (const s of [-1, 1]) { g.add(at(sph(0.008, mat('#ffffff', { rough: 0.2 }), 10, 8), s * 0.016, 0.105, 0.055)); g.add(at(sph(0.0045, eyeM(), 8, 6), s * 0.017, 0.106, 0.062)); g.add(at(capsule(0.009, 0.012, m), s * 0.022, 0.012, 0.02)); }
  g.add(tube([[0, 0.04, -0.04], [0, 0.03, -0.07], [0.01, 0.015, -0.095]], 0.012, m, 12, 10));
  for (let i = 0; i < 4; i++) g.add(at(cone(0.008, 0.016, gloss('#ffd60a'), 8), 0, 0.12 - i * 0.018 + (i === 0 ? 0 : 0), 0.03 - i * 0.025));
  return g;
}
function duckModel({ body = '#ffd60a', beak = '#f77f00', bodyMat = null, extra = null } = {}) {
  const y = bodyMat || gloss(body);
  const b = sph(0.04, y, 24, 16); b.scale.set(1, 0.85, 1.2);
  const g = group(at(b, 0, 0.035, 0));
  const tail = cone(0.016, 0.025, y, 12); tail.rotation.x = -2.2; g.add(at(tail, 0, 0.05, -0.045));
  g.add(at(sph(0.026, y, 20, 14), 0, 0.078, 0.02));
  const bk = sph(0.012, gloss(beak), 14, 10); bk.scale.set(1.2, 0.5, 1.3); g.add(at(bk, 0, 0.073, 0.048));
  for (const s of [-1, 1]) g.add(at(sph(0.0042, eyeM(), 8, 6), s * 0.013, 0.086, 0.04));
  for (const s of [-1, 1]) { const wing = sph(0.018, y, 12, 8); wing.scale.set(0.4, 0.7, 1.2); g.add(at(wing, s * 0.037, 0.04, -0.005)); }
  if (extra) extra(g);
  return g;
}

// ------------------------------------------------------------------ gliders & fidgets
function paperPlane() {
  const geo = sgeo('paperplane', () => {
    const nose = [0, 0.03, 0.13], tl = [-0.09, 0.042, -0.12], tc = [0, 0.03, -0.12], tr = [0.09, 0.042, -0.12], kb = [0, 0.0, -0.12];
    const v = [...nose, ...tl, ...tc, ...nose, ...tc, ...tr, ...nose, ...tc, ...kb];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
  });
  const m = mesh(geo, mat('#f8f9fa', { rough: 0.9, side: THREE.DoubleSide }));
  const g = group(m);
  g.add(tube([[0, 0.031, 0.1], [0, 0.031, -0.118]], 0.0008, mat('#c9d6df'), 2, 4));
  const stripe = mesh(sgeo('paperplane:stripe', () => { const v = [-0.04, 0.0365, -0.06, -0.06, 0.0395, -0.1, -0.052, 0.0384, -0.1, 0.04, 0.0365, -0.06, 0.06, 0.0395, -0.1, 0.052, 0.0384, -0.1]; const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); gg.computeVertexNormals(); return gg; }), mat('#3a86ff', { rough: 0.9, side: THREE.DoubleSide }));
  stripe.position.y = 0.0006; g.add(stripe);
  return g;
}
function frisbee() {
  const g = group(lathe([[0.001, 0.024], [0.08, 0.023], [0.118, 0.019], [0.134, 0.01], [0.136, 0.001], [0.13, 0.0], [0.127, 0.012], [0.11, 0.016], [0.001, 0.0165]], mat('#ff595e', { rough: 0.35, clearcoat: 0.5, side: THREE.DoubleSide }), 48));
  const top = face(0.2, 0.2, 'frisbee:top', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; for (const r of [0.42, 0.36]) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w * r, 0, 7); ctx.stroke(); } txt(ctx, 'AERO', w / 2, h / 2, 46, '#ffffff', { weight: 900 }); }, { transparent: true });
  top.rotation.x = -PI / 2; g.add(at(top, 0, 0.0245, 0));
  return g;
}
function spinner3({ m, cap }) {
  const g = new THREE.Group();
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * PI * 2;
    rotor.add(at(cyl(0.022, 0.022, 0.011, m, 28), Math.cos(a) * 0.036, 0, Math.sin(a) * 0.036));
    rotor.add(at(cyl(0.013, 0.013, 0.0125, cap, 20), Math.cos(a) * 0.036, 0, Math.sin(a) * 0.036));
    const arm = box(0.036, 0.011, 0.022, m); arm.rotation.y = -a; rotor.add(at(arm, Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018));
  }
  rotor.add(cyl(0.014, 0.014, 0.016, cap, 20), at(cyl(0.009, 0.009, 0.0165, MAT.chrome(), 16), 0, 0, 0));
  rotor.position.y = 0.008;
  g.add(rotor);
  return g;
}
function popIt() {
  const g = new THREE.Group();
  const cols = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4'];
  g.add(at(rbox(0.13, 0.008, 0.13, 0.02, mat('#6a4c93', { rough: 0.6 })), 0, 0.004, 0));
  for (let r = 0; r < 5; r++) {
    const m = mat(cols[r], { rough: 0.55 });
    g.add(at(rbox(0.12, 0.004, 0.022, 0.004, m), 0, 0.009, -0.048 + r * 0.024));
    for (let c = 0; c < 5; c++) { const d = hemi(0.0095, m); d.scale.y = (r + c) % 3 === 0 ? -0.25 : 0.55; g.add(at(d, -0.048 + c * 0.024, 0.011, -0.048 + r * 0.024)); }
  }
  return g;
}

// ------------------------------------------------------------------ plushies
function eyes(g, y, z, dx, r = 0.009, shine = true) {
  for (const s of [-1, 1]) { g.add(at(sph(r, eyeM(), 12, 10), s * dx, y, z)); if (shine) g.add(at(sph(r * 0.32, mat('#ffffff', { emissive: '#ffffff', ei: 0.3 }), 6, 4), s * dx + r * 0.3, y + r * 0.35, z + r * 0.75)); }
}
function cheeks(g, y, z, dx, c = '#ff8fab') {
  for (const s of [-1, 1]) { const d = rot(cyl(0.011, 0.011, 0.002, mat(c, { rough: 1, opacity: 0.75, transparent: true }), 14), PI / 2, 0, 0); d.rotation.y = s * 0.35; g.add(at(d, s * dx, y, z)); }
}
// a sitting plush animal: body + head + paws, plus per-species ears/face/tail
export function sitter({ c, c2 = null, ear = 'round', earC = null, size = 1, muzzle = true, nose = '#3b2a1e', tail = null, extra = null, headR = 0.072 }) {
  const g = new THREE.Group();
  const m = plush(c), m2 = plush(c2 || c);
  const body = sph(0.075, m, 28, 20); body.scale.set(1, 1.08, 0.92); g.add(at(body, 0, 0.078, 0));
  const belly = sph(0.052, m2, 24, 16); belly.scale.set(1, 1.1, 0.55); g.add(at(belly, 0, 0.074, 0.045));
  const hy = 0.078 + 0.075 + headR * 0.72;
  const head = sph(headR, m, 32, 22); head.scale.set(1.06, 0.96, 1); g.add(at(head, 0, hy, 0.005));
  if (muzzle) { const mz = sph(0.028, m2, 18, 12); mz.scale.set(1.25, 0.85, 0.8); g.add(at(mz, 0, hy - 0.022, headR * 0.86)); }
  g.add(at(sph(0.0085, mat(nose, { rough: 0.3, clearcoat: 0.6 }), 10, 8), 0, hy - (muzzle ? 0.012 : 0.02), headR * (muzzle ? 1.12 : 0.99)));
  eyes(g, hy + 0.008, headR * 0.86, 0.028);
  cheeks(g, hy - 0.018, headR * 0.86, 0.045);
  const eM = plush(earC || c);
  if (ear === 'round') for (const s of [-1, 1]) { const e = sph(0.024, m, 14, 10); e.scale.z = 0.6; g.add(at(e, s * 0.052, hy + 0.055, -0.005)); const ei = sph(0.014, eM, 10, 8); ei.scale.z = 0.4; g.add(at(ei, s * 0.052, hy + 0.053, 0.006)); }
  if (ear === 'cat') for (const s of [-1, 1]) { const e = cone(0.024, 0.04, m, 12); e.scale.z = 0.55; e.rotation.z = -s * 0.32; g.add(at(e, s * 0.045, hy + 0.068, 0)); const ei = cone(0.013, 0.024, eM, 10); ei.scale.z = 0.4; ei.rotation.z = -s * 0.32; g.add(at(ei, s * 0.044, hy + 0.064, 0.007)); }
  if (ear === 'long') for (const s of [-1, 1]) { const e = capsule(0.018, 0.08, m); e.scale.z = 0.5; e.rotation.z = -s * 0.18; g.add(at(e, s * 0.032, hy + 0.1, -0.01)); const ei = capsule(0.01, 0.065, eM); ei.scale.z = 0.3; ei.rotation.z = -s * 0.18; g.add(at(ei, s * 0.032, hy + 0.1, -0.002)); }
  for (const s of [-1, 1]) {
    const arm = capsule(0.021, 0.045, m); arm.rotation.set(0.5, 0, s * 0.55); g.add(at(arm, s * 0.07, 0.1, 0.035));
    const leg = capsule(0.025, 0.035, m); leg.rotation.x = PI / 2 - 0.15; g.add(at(leg, s * 0.045, 0.026, 0.06));
    const pad = rot(cyl(0.017, 0.017, 0.003, m2, 14), PI / 2 - 0.15, 0, 0); g.add(at(pad, s * 0.045, 0.029, 0.093));
  }
  if (tail === 'bun') g.add(at(sph(0.024, m2, 12, 10), 0, 0.04, -0.07));
  if (tail === 'long') g.add(tube([[0, 0.03, -0.06], [0.05, 0.02, -0.09], [0.09, 0.05, -0.06], [0.1, 0.09, -0.03]], 0.012, m, 20, 8));
  if (tail === 'curl') g.add(at(rot(torus(0.022, 0.01, m, 8, 20, PI * 1.5), 0, PI / 2, 0.5), 0, 0.1, -0.07));
  if (extra) extra(g, hy, m, m2);
  if (size !== 1) g.scale.setScalar(size);
  return group(g);
}
function frogPlush() {
  const g = new THREE.Group();
  const m = plush('#7cb518'), m2 = plush('#e9f5db');
  const b = sph(0.085, m, 28, 20); b.scale.set(1.15, 0.8, 1); g.add(at(b, 0, 0.068, 0));
  const belly = sph(0.06, m2, 20, 14); belly.scale.set(1.1, 0.75, 0.6); g.add(at(belly, 0, 0.06, 0.05));
  for (const s of [-1, 1]) { g.add(at(sph(0.03, m, 16, 12), s * 0.045, 0.128, 0.02)); g.add(at(sph(0.022, plush('#ffffff'), 14, 10), s * 0.045, 0.132, 0.036)); g.add(at(sph(0.012, eyeM(), 10, 8), s * 0.045, 0.133, 0.055)); }
  g.add(at(rot(torus(0.035, 0.0035, plush('#c1121f'), 6, 24, PI * 0.8), 0, 0, PI * 1.1), 0, 0.1, 0.07));
  cheeks(g, 0.09, 0.083, 0.06);
  for (const s of [-1, 1]) { const leg = sph(0.03, m, 14, 10); leg.scale.set(1, 0.5, 1.4); g.add(at(leg, s * 0.075, 0.016, 0.05)); }
  return g;
}
function whalePlush() {
  const g = new THREE.Group();
  const m = plush('#5e9ed6'), m2 = plush('#eaf4fb');
  const b = sph(0.1, m, 32, 20); b.scale.set(0.85, 0.65, 1.35); g.add(at(b, 0, 0.065, 0));
  const belly = sph(0.085, m2, 24, 16); belly.scale.set(0.78, 0.45, 1.25); g.add(at(belly, 0, 0.045, 0.012));
  g.add(tube([[0, 0.07, -0.12], [0, 0.09, -0.17], [0, 0.11, -0.19]], 0.025, m, 12, 10));
  for (const s of [-1, 1]) { const f = sph(0.035, m, 14, 10); f.scale.set(1.4, 0.25, 0.7); f.rotation.y = s * 0.5; g.add(at(f, s * 0.035, 0.12, -0.205)); const fin = sph(0.03, m, 14, 10); fin.scale.set(1.3, 0.25, 0.7); fin.rotation.z = -s * 0.5; g.add(at(fin, s * 0.085, 0.035, 0.03)); }
  eyes(g, 0.07, 0.11, 0.048, 0.009);
  cheeks(g, 0.055, 0.105, 0.06);
  g.add(at(rot(torus(0.012, 0.0022, eyeM(), 6, 14, PI), 0, 0, PI), 0, 0.055, 0.13));
  for (let i = 0; i < 3; i++) g.add(at(sph(0.006, mat('#bde0fe', { rough: 0.2, opacity: 0.8, transparent: true }), 8, 6), (i - 1) * 0.012, 0.17 + Math.abs(i - 1) * -0.012, 0.0));
  g.add(at(cyl(0.004, 0.004, 0.04, mat('#bde0fe', { rough: 0.2, opacity: 0.8, transparent: true }), 8), 0, 0.15, 0));
  return g;
}
function axolotlPlush() {
  const g = new THREE.Group();
  const m = plush('#ffafcc'), gill = plush('#ff5d8f');
  const b = sph(0.06, m, 24, 16); b.scale.set(1, 0.75, 1.5); g.add(at(b, 0, 0.045, -0.02));
  const head = sph(0.06, m, 28, 18); head.scale.set(1.35, 0.95, 1); g.add(at(head, 0, 0.07, 0.07));
  g.add(tube([[0, 0.05, -0.1], [0, 0.055, -0.15], [0, 0.06, -0.19]], 0.02, m, 12, 8));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const gl = capsule(0.008, 0.028, gill); gl.rotation.z = -s * (0.6 + i * 0.5); g.add(at(gl, s * (0.078 + Math.sin(i * 0.9) * 0.008), 0.09 + (1 - i) * 0.018, 0.06)); }
  eyes(g, 0.082, 0.123, 0.04, 0.007);
  cheeks(g, 0.066, 0.122, 0.055, '#ff5d8f');
  g.add(at(rot(torus(0.018, 0.0025, eyeM(), 6, 16, PI), 0, 0, PI), 0, 0.068, 0.128));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const l = capsule(0.012, 0.016, m); l.rotation.z = x * 1.2; g.add(at(l, x * 0.058, 0.014, z * 0.035)); }
  return g;
}
function dinoPlush() {
  return sitter({ c: '#52b788', c2: '#d8f3dc', ear: 'none', muzzle: true, nose: '#2d6a4f', tail: null, extra: (g, hy, m) => {
    g.add(tube([[0, 0.04, -0.06], [0, 0.03, -0.11], [0.02, 0.02, -0.16]], 0.022, m, 14, 10));
    for (let i = 0; i < 6; i++) { const sp = cone(0.018, 0.032, plush('#ffd166'), 8); sp.scale.z = 0.55; const t = i / 5; sp.rotation.x = -t * 1.2; g.add(at(sp, 0, hy + 0.08 - t * 0.17, 0.01 - t * 0.1 - Math.sin(t * PI) * 0.03)); }
  } });
}
function jumboBear() {
  return sitter({ c: '#b08968', c2: '#ede0d4', ear: 'round', earC: '#ede0d4', size: 4.2, extra: (g, hy) => {
    for (const s of [-1, 1]) { const bw = cone(0.016, 0.03, plush('#c1121f'), 10); bw.rotation.z = s * PI / 2; g.add(at(bw, s * 0.016, hy - 0.072, 0.06)); }
    g.add(at(sph(0.008, plush('#9d0208'), 10, 8), 0, hy - 0.072, 0.062));
  } });
}

// ------------------------------------------------------------------ definitions
const T = (o) => ({ category: 'toys', ...o });
const P = (o) => T({ tags: ['soft'], emoji: '🧸', ...o, use: { type: 'decor', verb: 'Admire', squish: true, ...o.use } });
defineItems([
  // -------------------------------------------------------------- balls
  T({ id: 'basketball', name: 'Indoor Basketball', price: 29.99, stores: ['primo', 'kollectiv'], tags: ['ball'], desc: 'Grippy pebbled leather. Dribble it down the hallway at 2 AM (please don\'t).', build: basketball, use: { type: 'ball', bounce: 0.8 }, emoji: '🏀' }),
  T({ id: 'soccer_ball', name: 'Classic Soccer Ball', price: 24.99, stores: ['primo'], tags: ['ball'], desc: 'Black-and-white pentagons, size 5. Kick it gently, the TV is right there.', build: soccerBall, use: { type: 'ball', bounce: 0.7 }, emoji: '⚽' }),
  T({ id: 'tennis_ball', name: 'Fuzzy Tennis Ball', price: 3.49, stores: ['primo'], tags: ['ball'], desc: 'Bounces off walls with a satisfying pok. The official toy of being bored.', build: tennisBall, use: { type: 'ball', bounce: 0.78 }, emoji: '🎾' }),
  T({ id: 'beach_ball', name: 'Rainbow Beach Ball', price: 5.99, stores: ['primo', 'kollectiv'], tags: ['ball', 'soft'], season: 'summer', desc: 'Floaty, striped and full of summer air. Indoor beach day unlocked.', build: beachBall, use: { type: 'ball', bounce: 0.6 }, emoji: '🏖️' }),
  T({ id: 'bouncy_ball', name: 'Galaxy Super Bouncy Ball', price: 1.99, stores: ['primo', 'kollectiv'], tags: ['ball'], desc: 'A swirl of glitter rubber that bounces almost forever. Almost.', build: bouncyBall, use: { type: 'ball', bounce: 0.93 }, emoji: '🔮' }),
  // -------------------------------------------------------------- skill toys
  T({ id: 'yoyo_classic', name: 'Classic Butterfly Yo-Yo', price: 6.99, stores: ['primo', 'kollectiv'], desc: 'Cherry red with star caps. Walk the dog, rock the baby, untangle forever.', build: () => yoyoModel({}), use: { type: 'yoyo' }, emoji: '🪀' }),
  T({ id: 'yoyo_pro', name: 'Ballbearing Pro Yo-Yo', price: 24.99, stores: ['kollectiv'], rarity: 'uncommon', desc: 'Anodized aluminum with a ball bearing for long sleepers. Show-off certified.', build: () => yoyoModel({ c1: '#7b5cff', c2: '#5ef2ff', metal: true, key: 'pro' }), use: { type: 'yoyo' }, emoji: '🪀' }),
  T({ id: 'kendama', name: 'Maple Kendama', price: 19.99, stores: ['kollectiv', 'primo'], desc: 'Cup, spike and a glossy red ball. Land a trick, feel unstoppable.', build: kendama, use: { type: 'kendama' }, emoji: '🎯' }),
  T({ id: 'slinky_metal', name: 'Original Metal Slinky', price: 5.99, stores: ['primo'], desc: 'A coil of springy steel that has been walking down stairs since forever.', build: () => slinkyModel({}), use: { type: 'slinky' }, emoji: '➰' }),
  T({ id: 'slinky_rainbow', name: 'Rainbow Plastic Slinky', price: 4.99, stores: ['primo', 'kollectiv'], desc: 'Chunky rainbow coils. Boing, but colorful.', build: () => slinkyModel({ rainbow: true }), use: { type: 'slinky' }, emoji: '🌈' }),
  T({ id: 'spinning_top', name: 'Wooden Spinning Top', price: 8.99, stores: ['primo', 'kollectiv'], desc: 'Hand-turned beech with painted rings. Spins longer than you think.', build: () => topModel({}), use: { type: 'top' }, emoji: '🌀' }),
  T({ id: 'spinning_top_tin', name: 'Tin Pump Top', price: 14.99, stores: ['primo'], desc: 'Pump the plunger and watch the stripes blur into a hum. Pure retro joy.', build: () => topModel({ tin: true }), use: { type: 'top' }, emoji: '🌀' }),
  T({ id: 'puzzle_cube', name: 'Speed Puzzle Cube 3×3', price: 12.99, stores: ['primo', 'kollectiv'], desc: 'Smooth-turning 3×3. Arrives scrambled; your sanity may too.', build: () => puzzleCube({ n: 3 }), use: { type: 'cube' }, emoji: '🧊' }),
  T({ id: 'puzzle_cube_4x4', name: 'Pastel Revenge Cube 4×4', price: 19.99, stores: ['kollectiv'], rarity: 'uncommon', desc: 'Sixteen stickers a side, in soft pastels. For when 3×3 got too easy.', build: () => puzzleCube({ n: 4, size: 0.062, pastel: true }), use: { type: 'cube' }, emoji: '🧊' }),
  // -------------------------------------------------------------- snow globes
  T({ id: 'snowglobe_winter', name: 'Snowman Snow Globe', price: 24.99, stores: ['primo', 'kollectiv'], season: 'winter', desc: 'A cheerful snowman with a red scarf among tiny pines. Shake for a blizzard.', build: () => snowGlobe(SCENES.winter, { base: 'wood', label: 'Let It Snow', key: 'winter' }), use: { type: 'snowglobe', center: GLOBE_C, r: GLOBE_R, flake: '#ffffff' }, emoji: '☃️' }),
  T({ id: 'snowglobe_spring', name: 'Cherry Blossom Globe', price: 26.99, stores: ['primo', 'kollectiv'], season: 'spring', desc: 'A tiny sakura tree in bloom. Shake it and pink petals drift down.', build: () => snowGlobe(SCENES.spring, { base: '#ffc8dd', plate: '#fdf0d5', label: 'Hanami', key: 'spring', ground: '#d8f3dc' }), use: { type: 'snowglobe', center: GLOBE_C, r: GLOBE_R, flake: '#ffafcc' }, emoji: '🌸' }),
  T({ id: 'snowglobe_summer', name: 'Desert Island Globe', price: 24.99, stores: ['primo', 'kollectiv'], season: 'summer', desc: 'One palm, one island, endless golden glitter. Vacation in a jar.', build: () => snowGlobe(SCENES.summer, { base: '#48cae4', plate: '#fefae0', label: 'Paradise', key: 'summer', ground: '#90e0ef' }), use: { type: 'snowglobe', center: GLOBE_C, r: GLOBE_R, flake: '#ffd166' }, emoji: '🏝️' }),
  T({ id: 'snowglobe_autumn', name: 'Pumpkin Patch Globe', price: 24.99, stores: ['primo', 'kollectiv'], season: 'autumn', desc: 'A plump pumpkin and a fiery maple. Shake for a swirl of falling leaves.', build: () => snowGlobe(SCENES.autumn, { base: 'wood', plate: '#ffd8a8', label: 'Harvest', key: 'autumn', ground: '#a98467' }), use: { type: 'snowglobe', center: GLOBE_C, r: GLOBE_R, flake: '#f77f00' }, emoji: '🎃' }),
  T({ id: 'snowglobe_city', name: 'Downtown Snow Globe', price: 34.99, stores: ['kollectiv', 'primo'], rarity: 'uncommon', desc: 'Your city skyline with lit windows. Snow falls on the downtown you never leave.', build: () => snowGlobe(SCENES.city, { base: '#1d3557', plate: '#e9ecef', label: 'Downtown', key: 'city', ground: '#e9ecef' }), use: { type: 'snowglobe', center: GLOBE_C, r: GLOBE_R, flake: '#ffffff' }, emoji: '🏙️' }),
  // -------------------------------------------------------------- tabletop & desk toys
  T({ id: 'magic_8_ball', name: 'Magic 8 Ball', price: 12.99, stores: ['primo', 'kollectiv'], desc: 'Ask it anything. Signs point to fun.', build: magic8, use: { type: 'eightball' }, emoji: '🎱' }),
  T({ id: 'dice_polyhedral', name: 'Gemstone Polyhedral Dice', price: 14.99, stores: ['kollectiv', 'primo'], desc: 'Translucent d4 to d20 on a leather tray. Roll for initiative (and dinner).', build: polyDice, use: { type: 'dice', sides: 20 }, emoji: '🎲' }),
  T({ id: 'dice_classic', name: 'Classic Dice Pair', price: 3.99, stores: ['primo'], desc: 'Two ivory-white d6 with a lucky red one. Snake eyes not guaranteed.', build: classicDice, use: { type: 'dice', sides: 6 }, emoji: '🎲' }),
  T({ id: 'playing_cards', name: 'Royal Playing Cards', price: 5.99, stores: ['primo', 'kollectiv'], desc: 'A crisp red-back deck. Shuffle, draw, or settle in for solitaire.', build: cardDeck, use: { type: 'cards' }, emoji: '🃏' }),
  T({ id: 'kaleidoscope', name: 'Brass Kaleidoscope', price: 16.99, stores: ['primo', 'kollectiv'], desc: 'Point it at a lamp and fall into an endless mandala.', build: kaleidoscope, use: { type: 'kaleidoscope' }, emoji: '🔭' }),
  T({ id: 'newtons_cradle', name: 'Newton\'s Cradle', price: 29.99, stores: ['primo'], desc: 'Five chrome balls and some very satisfying physics. Click… clack… click…', build: newtonsCradle, use: { type: 'cradle' }, emoji: '⚪' }),
  // -------------------------------------------------------------- bubbles
  T({ id: 'bubble_wand_giant', name: 'Giant Bubble Wand', price: 12.99, stores: ['primo', 'kollectiv'], desc: 'A big yarn loop for wobbly, room-sized bubbles. Mind the plants.', build: giantWand, use: { type: 'bubbles', uses: 25, count: 5, big: true }, emoji: '🫧' }),
  T({ id: 'bubble_gun', name: 'Bubble Blaster', price: 14.99, stores: ['primo', 'kollectiv'], desc: 'Pull the trigger, unleash a pink bubble storm. Pew pew, but soapy.', build: bubbleGun, use: { type: 'bubbles', uses: 40, count: 30, tint: '#ffd6ec' }, emoji: '🔫' }),
  // -------------------------------------------------------------- squishies, squeakers & ducks
  T({ id: 'squishy_peach', name: 'Slow-Rise Peach Squishy', price: 7.99, stores: ['kollectiv', 'primo'], tags: ['soft'], desc: 'Smells faintly of peach. Squeeze it and watch it slowly puff back up.', build: squishyPeach, use: { type: 'squish', verb: 'Squish', sound: 'squish', comfort: 3, fun: 1.5 }, emoji: '🍑' }),
  T({ id: 'squishy_mochi_cat', name: 'Mochi Cat Squishy', price: 8.99, stores: ['kollectiv'], tags: ['soft'], desc: 'A round little cat made of pure squish. It does not judge you.', build: mochiCat, use: { type: 'squish', verb: 'Squish', sound: 'squish', comfort: 3.5, fun: 1.5 }, emoji: '🐱' }),
  T({ id: 'squeaky_dino', name: 'Squeaky Dino', price: 6.99, stores: ['primo', 'kollectiv'], tags: ['soft'], desc: 'A glossy green rubber dinosaur with an absurdly loud squeak.', build: squeakyDino, use: { type: 'squeak', verb: 'Squeak', fun: 2 }, emoji: '🦖' }),
  T({ id: 'duck_pirate', name: 'Captain Quack Duck', price: 6.99, stores: ['primo', 'kollectiv'], tags: ['soft'], desc: 'A rubber duck in a tricorn hat. Commands the bathtub seas.', build: () => duckModel({ extra: (g) => { const hat = cyl(0.03, 0.034, 0.012, mat('#1b1b1b', { rough: 0.5 }), 3); hat.rotation.y = PI / 6; g.add(at(hat, 0, 0.104, 0.02)); g.add(at(sph(0.006, MAT.gold(), 8, 6), 0, 0.106, 0.045)); g.add(at(rot(cyl(0.008, 0.008, 0.002, mat('#111'), 12), PI / 2, 0, 0), 0.013, 0.086, 0.043)); } }), use: { type: 'squeak', verb: 'Squeak' }, emoji: '🏴‍☠️' }),
  T({ id: 'duck_unicorn', name: 'Unicorn Duck', price: 6.99, stores: ['primo', 'kollectiv'], tags: ['soft'], desc: 'Pearly white, golden horn, rainbow mane. Squeaks in sparkles.', build: () => duckModel({ body: '#fdf6ff', beak: '#ffafcc', extra: (g) => { g.add(at(rot(cone(0.006, 0.026, MAT.gold(), 10), -0.35, 0, 0), 0, 0.108, 0.03)); ['#ff595e', '#ffca3a', '#8ac926', '#1982c4'].forEach((c, i) => g.add(at(sph(0.008, mat(c, { rough: 0.4 }), 8, 6), 0, 0.1 - i * 0.012, -0.002 - i * 0.006))); } }), use: { type: 'squeak', verb: 'Squeak' }, emoji: '🦄' }),
  T({ id: 'duck_disco', name: 'Disco Duck', price: 8.99, stores: ['kollectiv'], tags: ['soft'], rarity: 'uncommon', desc: 'Mirror-ball chrome finish and tiny shades. The bathtub is now a club.', build: () => duckModel({ bodyMat: mat('#e8ebef', { rough: 0.08, metal: 1 }), beak: '#ff4fa3', extra: (g) => { g.add(at(rbox(0.04, 0.01, 0.004, 0.002, mat('#111', { rough: 0.1, clearcoat: 1 })), 0, 0.087, 0.045)); } }), use: { type: 'squeak', verb: 'Squeak' }, emoji: '🪩' }),
  // -------------------------------------------------------------- gliders & fidgets
  T({ id: 'paper_plane', name: 'Origami Paper Plane', price: 0.99, stores: ['primo'], tags: ['recyclable'], desc: 'Folded with precision (and a racing stripe). Launch it across the living room.', build: paperPlane, use: { type: 'glider' }, emoji: '✈️' }),
  T({ id: 'frisbee', name: 'Aero Flying Disc', price: 12.99, stores: ['primo', 'kollectiv'], desc: 'A classic 175g flying disc. Indoor frisbee: a high-risk, high-reward sport.', build: frisbee, use: { type: 'glider' }, emoji: '🥏' }),
  T({ id: 'fidget_spinner_gold', name: 'Brass Fidget Spinner', price: 12.99, stores: ['kollectiv'], rarity: 'uncommon', desc: 'Machined solid brass with ceramic bearings. Spins for nearly four minutes.', build: () => spinner3({ m: MAT.gold(), cap: mat('#7a5c1e', { metal: 1, rough: 0.3 }) }), use: { type: 'spinner' }, emoji: '🌀' }),
  T({ id: 'fidget_spinner_glow', name: 'Glow-in-the-Dark Spinner', price: 8.99, stores: ['primo', 'kollectiv'], desc: 'Ghostly green plastic that glows after the lights go out.', build: () => spinner3({ m: mat('#b8f2a0', { emissive: '#7bf1a8', ei: 0.5, rough: 0.3 }), cap: mat('#2d6a4f', { rough: 0.4 }) }), use: { type: 'spinner' }, emoji: '🌀' }),
  T({ id: 'pop_it', name: 'Rainbow Pop-It', price: 6.99, stores: ['primo', 'kollectiv'], desc: 'Twenty-five silicone bubbles to pop, flip and pop again. Endlessly.', build: popIt, use: { type: 'clicker', verb: 'Pop', sound: 'pop' }, emoji: '🌈' }),
  // -------------------------------------------------------------- plushies
  P({ id: 'plush_bear', name: 'Honey Teddy Bear', price: 24.99, stores: ['kollectiv', 'primo'], desc: 'A classic honey-brown teddy with a red bow tie. Excellent listener.', build: () => sitter({ c: '#c68b59', c2: '#f3d5b5', ear: 'round', earC: '#f3d5b5', extra: (g, hy) => { for (const s of [-1, 1]) { const bw = cone(0.012, 0.022, plush('#c1121f'), 10); bw.rotation.z = s * PI / 2; g.add(at(bw, s * 0.012, hy - 0.072, 0.058)); } g.add(at(sph(0.006, plush('#9d0208'), 8, 6), 0, hy - 0.072, 0.06)); } }), use: { lines: ['The bear has seen things. It keeps your secrets.', 'Still fluffy after all these years.', 'Bear hug: initiated.'] } }),
  P({ id: 'plush_bunny', name: 'Lop Bunny Plush', price: 22.99, stores: ['kollectiv', 'primo'], desc: 'Blush-pink bunny with floppy ears and a pom-pom tail.', build: () => sitter({ c: '#ffd6e0', c2: '#fff0f3', ear: 'long', earC: '#ff8fab', nose: '#ff5d8f', tail: 'bun' }), use: { lines: ['Ears: maximally floppy.', 'It smells faintly of strawberries. Somehow.', 'The bunny approves of your life choices.'] } }),
  P({ id: 'plush_cat', name: 'Tabby Cat Plush', price: 21.99, stores: ['kollectiv'], desc: 'A grey tabby that never knocks things off your desk. Unlike some cats.', build: () => sitter({ c: '#9aa0a8', c2: '#f1f3f5', ear: 'cat', earC: '#ffc2d1', nose: '#ff8fab', tail: 'long', extra: (g, hy) => { for (const s of [-1, 1]) for (let i = 0; i < 2; i++) g.add(at(rot(cyl(0.0008, 0.0008, 0.04, mat('#555'), 4), 0, 0, PI / 2 + s * (0.1 + i * 0.15)), s * 0.055, hy - 0.016 - i * 0.006, 0.07)); for (let i = 0; i < 3; i++) { const st = capsule(0.006, 0.02, plush('#6c757d')); st.rotation.set(PI / 2 - 0.5, 0, (i - 1) * 0.35); g.add(at(st, (i - 1) * 0.018, hy + 0.06, 0.03)); } } }), use: { lines: ['It purrs if you believe hard enough.', 'Low-maintenance cat. No litter box required.', 'The tabby stares into the middle distance. Classic.'] } }),
  P({ id: 'plush_shiba', name: 'Shiba Inu Plush', price: 26.99, stores: ['kollectiv'], rarity: 'uncommon', desc: 'Toasty orange shiba with a curly tail and a smug little smile. Much soft.', build: () => sitter({ c: '#d9822b', c2: '#fff8ee', ear: 'cat', earC: '#fff8ee', nose: '#1b1b1b', tail: 'curl' }), use: { lines: ['Much soft. Very plush. Wow.', 'The shiba is smug about something.', 'Good dog. Best dog. Plush dog.'] } }),
  P({ id: 'plush_dino', name: 'Dino Buddy Plush', price: 24.99, stores: ['kollectiv', 'primo'], desc: 'A chunky green dinosaur with soft yellow spikes. Rawr means "I love you".', build: dinoPlush, use: { lines: ['Rawr! (Affectionate.)', 'Extinct? Not on your shelf.', 'The spikes are 100% huggable.'] }, emoji: '🦕' }),
  P({ id: 'plush_frog', name: 'Froggy Bean Plush', price: 18.99, stores: ['kollectiv', 'primo'], desc: 'A squat, grinning frog full of beans. Ribbit energy only.', build: frogPlush, use: { lines: ['Ribbit.', 'This frog is having a great day and so are you.', 'Sits perfectly on any shelf, like a little green loaf.'] }, emoji: '🐸' }),
  P({ id: 'plush_whale', name: 'Blue Whale Pillow', price: 29.99, stores: ['kollectiv', 'primo'], desc: 'A big squishy whale with a water-spout tuft. Doubles as a nap pillow.', build: whalePlush, use: { lines: ['A whale of a good time.', 'It spouts tiny fabric bubbles of joy.', 'Ocean vibes, zero salt.'] }, emoji: '🐳' }),
  P({ id: 'plush_axolotl', name: 'Axolotl Plush', price: 23.99, stores: ['kollectiv'], rarity: 'uncommon', desc: 'Bubblegum-pink axolotl with frilly gills and a permanent smile.', build: axolotlPlush, use: { lines: ['Smiling since the Aztecs.', 'Those gills are pure fluff.', 'Regenerates your mood.'] }, emoji: '🦎' }),
  P({ id: 'plush_bear_jumbo', name: 'Jumbo Hug Bear', price: 129, stores: ['kollectiv'], furniture: true, place: 'floor', rarity: 'rare', desc: 'Over a meter of cuddly bear. Takes up a whole armchair. Worth it.', build: jumboBear, use: { lines: ['It\'s bigger than your armchair. You regret nothing.', 'The ultimate cuddle buddy has arrived.', 'You sink into a hug that lasts a lifetime.'] } }),
]);
