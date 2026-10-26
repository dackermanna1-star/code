// Catalogue: hobbies — instruments, painting & drawing, journals, jigsaw
// puzzles, model kits, brick sets, knitting & cross-stitch, fitness gear,
// meditation and tabletop games.
// Conventions: meters, origin bottom-center, front faces +Z (see docs/CONTENT_GUIDE.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../game.js';
import { defineItems } from '../items/registry.js';
import { registerBehaviors } from '../items/behaviors/index.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, capsule, lathe, tube, at, rot, group, extrude, shapeExtrude } from '../items/kit.js';
import { labelTexture } from '../core/textures.js';
import { seeded, pick } from '../core/utils.js';
import { beanie } from './shared.js';
import { sgeo, mesh, txt, vgrad, circle, face, zcyl, xcyl } from './tech.js';

const PI = Math.PI;
const step = (o, n) => { o.userData.step = n; return o; };

// ------------------------------------------------------------------ instrument bodies
function splineShape(pts, n = 90) {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.Shape(curve.getPoints(n));
}
const GUITAR_PTS = (() => { const r = [[0, 0], [0.12, 0.018], [0.18, 0.1], [0.172, 0.2], [0.118, 0.27], [0.135, 0.34], [0.128, 0.42], [0.07, 0.47], [0, 0.478]]; return [...r, ...r.slice(1, -1).reverse().map(([x, y]) => [-x, y]), [0, 0]]; })();
const BASS_PTS = [[0, 0], [0.09, 0.008], [0.15, 0.05], [0.165, 0.12], [0.14, 0.19], [0.115, 0.24], [0.13, 0.3], [0.12, 0.35], [0.09, 0.33], [0.05, 0.3], [-0.05, 0.31], [-0.08, 0.36], [-0.105, 0.41], [-0.135, 0.38], [-0.125, 0.3], [-0.115, 0.24], [-0.14, 0.19], [-0.165, 0.12], [-0.15, 0.05], [-0.09, 0.008], [0, 0]];
const VIOLIN_PTS = (() => { const r = [[0, 0], [0.07, 0.008], [0.102, 0.06], [0.098, 0.12], [0.072, 0.15], [0.068, 0.185], [0.085, 0.215], [0.088, 0.27], [0.06, 0.315], [0, 0.325]]; return [...r, ...r.slice(1, -1).reverse().map(([x, y]) => [-x, y]), [0, 0]]; })();

// a stringed instrument standing upright (neck +Y), front +Z
function stringed({ key, pts, scale = 1, depth = 0.1, body, top = null, neckLen = 0.46, strings = 6, rosette = true, pickguard = null, pickups = 0, headC = '#2b1d14', board = '#2b1d14' }) {
  const g = new THREE.Group();
  const s = scale;
  const shape = sgeo(`shape:${key}`, () => new THREE.ShapeGeometry(splineShape(pts)));
  void shape;
  const bodyM = shapeExtrude(splineShape(pts), depth, body, `instr:${key}`, 0.006);
  bodyM.scale.set(s, s, 1); g.add(bodyM);
  const bh = Math.max(...pts.map((p) => p[1])) * s;
  if (top) {
    const tm = shapeExtrude(splineShape(pts), 0.002, top, `instrtop:${key}`, 0); tm.scale.set(s * 0.985, s * 0.985, 1); tm.position.set(0, bh * 0.0075, depth / 2 + 0.006); g.add(tm);
  }
  const fz = depth / 2 + 0.0085;
  if (rosette) {
    g.add(at(zcyl(0.042 * s, 0.042 * s, 0.002, mat('#1b120c', { rough: 0.9 }), 32), 0, bh * 0.66, fz));
    g.add(at(torus(0.05 * s, 0.004 * s, mat('#7a4b2a', { rough: 0.4 }), 6, 36), 0, bh * 0.66, fz - 0.001));
  }
  if (pickguard) { const pg = shapeExtrude(splineShape([[0.02, 0.1], [0.1, 0.12], [0.11, 0.22], [0.06, 0.29], [0.02, 0.27], [0.02, 0.1]], 40), 0.002, mat(pickguard, { rough: 0.3 }), `pg:${key}`, 0); pg.scale.set(s, s, 1); pg.position.z = fz - 0.001; g.add(pg); }
  for (let i = 0; i < pickups; i++) g.add(at(rbox(0.09 * s, 0.022 * s, 0.006, 0.004, mat('#111', { rough: 0.4 })), 0, bh * (0.38 + i * 0.16), fz));
  g.add(at(rbox(0.09 * s, 0.014 * s, 0.006, 0.003, mat(board, { rough: 0.5 })), 0, bh * 0.22, fz));
  const nw = (strings > 4 ? 0.048 : 0.04) * s;
  const neck = box(nw, neckLen, 0.02, mat(board, { rough: 0.5 })); g.add(at(neck, 0, bh + neckLen / 2 - 0.02, depth / 2 - 0.004));
  const frets = labelTexture(`frets:${key}`, 32, 256, (ctx, w, h) => { ctx.fillStyle = board; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d9d9d9'; for (let i = 1; i < 20; i++) { const y = h * (1 - Math.pow(0.94, i)) * 1.4; if (y < h) ctx.fillRect(0, y, w, 2); } for (const f of [3, 5, 7, 9]) circle(ctx, w / 2, h * (1 - Math.pow(0.94, f - 0.5)) * 1.4, 2.5, '#f1f1f1'); });
  const fb = face(nw * 0.96, neckLen - 0.02, `fb:${key}`, (ctx, w, h) => { ctx.drawImage(frets.image, 0, 0, w, h); }, { tw: 32, th: 256, rough: 0.5 });
  fb.rotation.z = PI; g.add(at(fb, 0, bh + neckLen / 2 - 0.02, depth / 2 + 0.0062));
  const head = rbox(nw * 1.6, 0.17 * s, 0.018, 0.01, mat(headC, { rough: 0.35, clearcoat: 0.4 })); head.rotation.x = -0.2; g.add(at(head, 0, bh + neckLen + 0.06 * s, depth / 2 - 0.012));
  for (let i = 0; i < strings; i++) { const side = i < strings / 2 ? -1 : 1; const k = i % (strings / 2); g.add(at(xcyl(0.005, 0.005, 0.03, MAT.chrome(), 8), side * nw * 1.05, bh + neckLen + (0.02 + k * 0.045) * s, depth / 2 - 0.01)); }
  const sm = MAT.metal('#d9dce1', 0.25);
  for (let i = 0; i < strings; i++) { const x = (i - (strings - 1) / 2) * nw * 0.16; g.add(at(box(0.0012, neckLen + bh * 0.5, 0.0012, sm), x, bh * 0.22 + (neckLen + bh * 0.5) / 2, fz + 0.002)); }
  return g;
}
function guitarStand(h = 0.62) {
  const m = mat('#1b1b1b', { rough: 0.4, metal: 0.6 });
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(tube([[s * 0.16, 0.0, 0.14], [s * 0.1, 0.12, 0.03], [0, h, -0.08]], 0.008, m, 10, 6));
  g.add(tube([[0, 0, -0.2], [0, h * 0.4, -0.12], [0, h, -0.08]], 0.008, m, 10, 6));
  g.add(tube([[-0.13, 0.13, 0.08], [0.13, 0.13, 0.08]], 0.008, mat('#2b2b2b', { rough: 0.9 }), 4, 6));
  g.add(at(rot(torus(0.035, 0.006, mat('#2b2b2b', { rough: 0.9 }), 6, 16, PI), 0, 0, PI), 0, h + 0.02, -0.08));
  return g;
}
function acousticGuitar() {
  const inst = stringed({ key: 'acoustic', pts: GUITAR_PTS, depth: 0.1, body: MAT.wood('#8a4f2a'), top: mat('#e2b77d', { rough: 0.45, clearcoat: 0.5 }), neckLen: 0.46 });
  inst.rotation.x = -0.22; inst.position.set(0, 0.11, 0.06);
  return group(guitarStand(0.66), inst);
}
function bassGuitar() {
  const inst = stringed({ key: 'bass', pts: BASS_PTS, depth: 0.045, body: mat('#9b2226', { rough: 0.2, clearcoat: 1 }), rosette: false, pickguard: '#fdf6e3', pickups: 2, strings: 4, neckLen: 0.62, board: '#3b2a1e', headC: '#e9d8a6' });
  inst.rotation.x = -0.2; inst.position.set(0, 0.1, 0.05);
  return group(guitarStand(0.6), inst);
}
function ukulele() {
  const inst = stringed({ key: 'uke', pts: GUITAR_PTS, scale: 0.5, depth: 0.06, body: MAT.wood('#b5651d'), top: mat('#d4915a', { rough: 0.45, clearcoat: 0.6 }), neckLen: 0.2, strings: 4 });
  inst.rotation.x = -0.25; inst.position.set(0, 0.012, 0.04);
  const st = mat('#1b1b1b', { rough: 0.4, metal: 0.5 });
  const g = group(inst);
  g.add(at(rbox(0.16, 0.012, 0.16, 0.005, st), 0, 0.006, 0.0));
  g.add(tube([[0, 0.012, -0.06], [0, 0.14, -0.05], [0, 0.22, -0.02]], 0.005, st, 8, 6));
  return g;
}
function violinInCase() {
  const g = new THREE.Group();
  const caseShape = [[-0.32, -0.08], [0.18, -0.12], [0.34, -0.11], [0.36, 0], [0.34, 0.11], [0.18, 0.12], [-0.32, 0.08], [-0.34, 0]];
  const shell = mat('#1b1b1b', { rough: 0.6 }), velvet = mat('#1d3557', { rough: 1, sheen: 1 });
  const base = extrude(caseShape, 0.06, shell, 0.008, undefined, 'vcase'); base.rotation.x = -PI / 2; g.add(at(base, 0, 0.038, 0));
  const lining = extrude(caseShape.map(([x, y]) => [x * 0.94, y * 0.85]), 0.004, velvet, 0, undefined, 'vlining'); lining.rotation.x = -PI / 2; g.add(at(lining, 0, 0.07, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.07, -0.11); lid.rotation.x = -1.75;
  const lshell = extrude(caseShape, 0.03, shell, 0.006, undefined, 'vlid'); lshell.rotation.x = -PI / 2; lid.add(at(lshell, 0, 0.0, 0.11));
  const ll = extrude(caseShape.map(([x, y]) => [x * 0.94, y * 0.85]), 0.002, velvet, 0, undefined, 'vlidlining'); ll.rotation.x = -PI / 2; lid.add(at(ll, 0, -0.016, 0.11));
  lid.add(at(rot(cyl(0.003, 0.003, 0.6, MAT.wood('#5a3519'), 8), 0, 0, PI / 2), 0, -0.02, 0.11));
  lid.add(at(xcyl(0.004, 0.004, 0.56, mat('#f8f4ec', { rough: 0.9 }), 6), 0, -0.022, 0.1));
  g.add(lid);
  const v = stringed({ key: 'violin', pts: VIOLIN_PTS, depth: 0.04, body: mat('#a0461f', { rough: 0.25, clearcoat: 1 }), rosette: false, neckLen: 0.2, strings: 4, board: '#111111', headC: '#7a3216' });
  for (const s of [-1, 1]) v.add(at(face(0.012, 0.06, 'fhole', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w * 0.7, 4); ctx.bezierCurveTo(0, h * 0.3, w, h * 0.7, w * 0.3, h - 4); ctx.stroke(); circle(ctx, w * 0.7, 6, 5, '#111'); circle(ctx, w * 0.3, h - 6, 5, '#111'); }, { tw: 32, th: 160, transparent: true }), s * 0.04, 0.15, 0.0285));
  v.add(at(rot(torus(0.012, 0.006, mat('#7a3216', { rough: 0.3 }), 6, 16, PI * 1.6), PI / 2, 0, 0), 0, 0.325 + 0.2 + 0.11, 0.0));
  v.add(at(rbox(0.06, 0.012, 0.03, 0.006, mat('#111', { rough: 0.4 })), 0.03, 0.03, 0.025));
  v.rotation.set(-PI / 2, 0, -PI / 2); v.scale.setScalar(0.9);
  g.add(at(v, -0.3, 0.095, 0));
  return g;
}
function keyboardOnStand() {
  const g = new THREE.Group();
  const st = mat('#1b1b1b', { rough: 0.4, metal: 0.6 });
  for (const s of [-1, 1]) for (const d of [-1, 1]) g.add(tube([[s * 0.32, 0, d * 0.22], [s * 0.32, 0.38, 0], [s * 0.32, 0.72, -d * 0.12]], 0.012, st, 6, 6));
  for (const s of [-1, 1]) g.add(at(xcyl(0.012, 0.012, 0.3, st, 8), s * 0.32, 0.72, 0).rotateY(PI / 2));
  for (const s of [-1, 1]) g.add(at(rbox(0.06, 0.02, 0.06, 0.008, MAT.rubber('#111')), s * 0.32, 0.38, 0));
  const y0 = 0.73;
  const body = rbox(0.98, 0.09, 0.32, 0.02, mat('#202124', { rough: 0.35 })); g.add(at(body, 0, y0 + 0.045, 0));
  const whites = labelTexture('keys:white', 1024, 64, (ctx, w, h) => { ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#9a9a9a'; for (let i = 0; i <= 36; i++) ctx.fillRect(i * w / 36, 0, 2, h); });
  const wk = new THREE.Mesh(sgeo('keys:wbox', () => new THREE.BoxGeometry(0.88, 0.022, 0.15)), [mat('#f8f8f6'), mat('#f8f8f6'), mat('#ffffff', { map: whites, rough: 0.3 }), mat('#f8f8f6'), mat('#f2f2f0', { rough: 0.3 }), mat('#f8f8f6')]);
  g.add(at(wk, 0, y0 + 0.07, 0.07));
  const blacks = sgeo('keys:black', () => { const parts = []; const kw = 0.88 / 36; for (let i = 0; i < 35; i++) { const n = i % 7; if (n === 2 || n === 6) continue; const b = new THREE.BoxGeometry(kw * 0.58, 0.016, 0.09); b.translate(-0.44 + (i + 1) * kw, 0, 0); parts.push(b); } return mergeGeometries(parts); });
  g.add(at(mesh(blacks, mat('#141414', { rough: 0.25, clearcoat: 0.6 })), 0, y0 + 0.085, 0.04));
  g.add(at(rot(face(0.88, 0.1, 'keys:panel', (ctx, w, h) => { ctx.fillStyle = '#202124'; ctx.fillRect(0, 0, w, h); for (const x of [0.06, 0.94]) for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) circle(ctx, w * x - 28 + c * 8, 12 + r * 12, 2.2, '#3a3b3f'); ctx.fillStyle = '#5ef2ff'; ctx.fillRect(w * 0.42, 14, w * 0.16, 28); txt(ctx, 'GRAND PIANO 01', w / 2, 28, 12, '#06323a', { font: 'monospace' }); ['#e63946', '#ffd166', '#2a9d8f', '#adb5bd', '#adb5bd', '#adb5bd'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(w * 0.2 + i * 26, 18, 18, 10); }); txt(ctx, 'VOLT · KEYS 61', w * 0.75, 30, 12, '#adb5bd'); }, { tw: 1024, th: 116 }), -PI / 2, 0, 0), 0, y0 + 0.0905, -0.08));
  for (const x of [-0.22, -0.16]) g.add(at(cyl(0.012, 0.012, 0.012, mat('#3a3b3f', { metal: 0.5, rough: 0.3 }), 16), x, y0 + 0.096, -0.1));
  return g;
}
function kalimba() {
  const g = new THREE.Group();
  g.add(at(rbox(0.13, 0.03, 0.1, 0.008, MAT.wood('#b5835a')), 0, 0.015, 0));
  g.add(at(rot(zcyl(0.013, 0.013, 0.002, mat('#2b1d14'), 24), PI / 2, 0, 0), 0, 0.0305, 0.028));
  g.add(at(xcyl(0.004, 0.004, 0.11, MAT.metal('#c8ccd2', 0.3), 8), 0, 0.034, -0.012));
  const steel = MAT.metal('#e3e6ea', 0.2);
  for (let i = 0; i < 17; i++) { const d = Math.abs(i - 8); const len = 0.075 - d * 0.0045; g.add(at(box(0.004, 0.0016, len, steel), -0.06 + i * 0.0075, 0.0335, -0.012 + len / 2 - 0.012)); }
  g.add(at(rot(face(0.05, 0.03, 'kalimba:art', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); txt(ctx, '♪ ✿ ♪', w / 2, h / 2, h * 0.5, '#5a3519'); }, { transparent: true, th: 154 }), -PI / 2, 0, 0), -0.03, 0.0305, 0.03));
  return g;
}
function harmonica() {
  const g = new THREE.Group();
  g.add(at(box(0.1, 0.011, 0.024, MAT.wood('#d9a066')), 0, 0.0135, 0));
  const chrome = MAT.chrome();
  for (const y of [0.0045, 0.0225]) g.add(at(rbox(0.104, 0.009, 0.026, 0.003, chrome), 0, y, 0));
  g.add(at(face(0.1, 0.011, 'harp:holes', (ctx, w, h) => { ctx.fillStyle = '#d9a066'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 10; i++) { ctx.fillStyle = '#2b1d14'; ctx.fillRect(6 + i * (w - 12) / 10, h * 0.25, (w - 12) / 10 - 6, h * 0.5); } }, { th: 28 }), 0, 0.0135, 0.0121));
  g.add(at(face(0.06, 0.008, 'harp:brand', (ctx, w, h) => { ctx.fillStyle = '#e8ebef'; ctx.fillRect(0, 0, w, h); txt(ctx, 'BLUES HARP · C', w / 2, h / 2, h * 0.6, '#555', { font: 'Georgia, serif' }); }, { th: 34 }), 0, 0.0225, 0.0131));
  return g;
}
function drumPad() {
  const g = new THREE.Group();
  g.add(at(cyl(0.16, 0.16, 0.025, MAT.wood('#3b2a1e'), 6), 0, 0.0125, 0));
  g.add(at(cyl(0.13, 0.13, 0.012, MAT.rubber('#2b2d33'), 40), 0, 0.031, 0));
  g.add(at(torus(0.13, 0.004, MAT.chrome(), 6, 40), 0, 0.037, 0).rotateX(PI / 2));
  g.add(at(rot(face(0.08, 0.02, 'pad:logo', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); txt(ctx, 'PRACTICE', w / 2, h / 2, h * 0.6, '#ffd166'); }, { transparent: true, th: 64 }), -PI / 2, 0, 0), 0, 0.0375, 0.06));
  for (const [x, r] of [[-0.02, 0.35], [0.03, -0.25]]) { const st = cyl(0.006, 0.0045, 0.4, MAT.wood('#e9c99a'), 10); st.rotation.set(PI / 2, 0, r); g.add(at(st, x, 0.045, 0.02)); }
  return g;
}

// ------------------------------------------------------------------ art supplies
function easelModel() {
  const g = new THREE.Group();
  const wood = MAT.wood('#c49a6c');
  for (const s of [-1, 1]) { const l = box(0.035, 1.7, 0.035, wood); l.rotation.set(-0.12, 0, s * 0.1); g.add(at(l, s * 0.2, 0.84, 0.04)); }
  const back = box(0.035, 1.55, 0.035, wood); back.rotation.x = 0.38; g.add(at(back, 0, 0.73, -0.24));
  g.add(at(box(0.5, 0.03, 0.03, wood), 0, 0.42, 0.08));
  g.add(at(box(0.62, 0.035, 0.08, wood), 0, 0.62, 0.1));
  g.add(at(box(0.62, 0.012, 0.012, wood), 0, 0.642, 0.135));
  const canvasM = mat('#fbfaf6', { rough: 0.95 });
  const cv = group(at(box(0.5, 0.6, 0.022, canvasM), 0, 0, 0));
  cv.add(at(face(0.46, 0.56, 'easel:sketch', (ctx, w, h) => { ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(80,80,80,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.4, w * 0.18, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.75); ctx.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.9, h * 0.78); ctx.stroke(); ctx.fillStyle = 'rgba(244,162,97,0.5)'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.4, w * 0.12, 0, 7); ctx.fill(); }, { th: 312, rough: 0.95 }), 0, 0, 0.0115));
  cv.rotation.x = -0.12; g.add(at(cv, 0, 0.94, 0.09));
  g.add(at(box(0.08, 0.05, 0.05, wood), 0, 1.27, 0.06));
  const tray = group(at(rbox(0.2, 0.012, 0.06, 0.004, mat('#ffffff', { rough: 0.4 })), 0, 0, 0));
  ['#e63946', '#ffd166', '#3a86ff', '#2a9d8f'].forEach((c, i) => tray.add(at(cyl(0.01, 0.01, 0.003, mat(c, { rough: 0.3 }), 12), -0.07 + i * 0.045, 0.007, 0)));
  g.add(at(tray, 0.12, 0.645, 0.1));
  for (let i = 0; i < 2; i++) { const b = cyl(0.003, 0.003, 0.2, MAT.wood('#7a4b2a'), 6); b.rotation.set(PI / 2, 0, 0.3 + i * 0.2); g.add(at(b, -0.18 + i * 0.04, 0.648, 0.1)); }
  return g;
}
function drawingTablet() {
  const g = new THREE.Group();
  const t = new THREE.Group(); t.position.set(0, 0.03, 0.03); t.rotation.x = -0.95;
  t.add(at(rbox(0.38, 0.24, 0.014, 0.01, mat('#1b1b1e', { rough: 0.35 })), 0, 0.12, 0));
  const scr = face(0.33, 0.2, 'drawtab:scr', (ctx, w, h) => { ctx.fillStyle = '#f8f9fa'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#2b2d42'; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, 14, 22, h); ['#e63946', '#ffd166', '#2a9d8f', '#3a86ff', '#7b2cbf'].forEach((c, i) => circle(ctx, 11, 30 + i * 18, 6, c)); ctx.strokeStyle = '#3a86ff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(70, 120); ctx.bezierCurveTo(100, 40, 160, 40, 190, 100); ctx.bezierCurveTo(210, 140, 160, 150, 140, 120); ctx.stroke(); circle(ctx, 150, 80, 18, 'rgba(255,112,166,0.5)'); }, { emissive: true, ei: 0.6, th: 156 });
  t.add(at(scr, 0, 0.125, 0.0075));
  g.add(t);
  for (const s of [-1, 1]) { const leg = box(0.02, 0.012, 0.16, mat('#2b2b2b', { metal: 0.6, rough: 0.3 })); leg.rotation.x = 0.4; g.add(at(leg, s * 0.15, 0.05, -0.08)); }
  const pen = capsule(0.005, 0.13, mat('#1b1b1e', { rough: 0.3 })); pen.rotation.set(0, 0.3, PI / 2); g.add(at(pen, 0.05, 0.006, 0.14));
  return g;
}
function paintSet() {
  const g = new THREE.Group();
  const wood = MAT.wood('#a47148');
  g.add(at(rbox(0.32, 0.04, 0.22, 0.006, wood), 0, 0.02, 0));
  g.add(at(box(0.3, 0.002, 0.2, mat('#2b2d42', { rough: 1, sheen: 0.6 })), 0, 0.041, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.04, -0.11); lid.rotation.x = -1.85;
  lid.add(at(rbox(0.32, 0.02, 0.22, 0.006, wood), 0, 0.01, 0.11));
  lid.add(at(face(0.16, 0.05, 'paintset:label', (ctx, w, h) => { ctx.fillStyle = '#f4ede1'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#a47148'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8); txt(ctx, 'ArtHaus', w / 2, h * 0.42, h * 0.32, '#2b2d42', { font: 'Georgia, serif' }); txt(ctx, 'ACRYLIC · 12', w / 2, h * 0.76, h * 0.18, '#a47148'); }, { th: 80 }), 0, -0.001, 0.11).rotateX(PI / 2).rotateZ(PI));
  g.add(lid);
  const cols = ['#ffffff', '#ffd60a', '#ff9f1c', '#e63946', '#ff70a6', '#7b2cbf', '#3a86ff', '#48cae4', '#2a9d8f', '#80b918', '#7f5539', '#1b1b1b'];
  cols.forEach((c, i) => { const r = Math.floor(i / 6), k = i % 6; const tb = capsule(0.008, 0.055, MAT.metal('#d9dce1', 0.3)); tb.rotation.x = PI / 2; tb.scale.y = 1; g.add(at(tb, -0.115 + k * 0.03, 0.05, -0.05 + r * 0.075)); g.add(at(xcyl(0.0085, 0.0085, 0.02, mat(c, { rough: 0.3 }), 12).rotateY(PI / 2), -0.115 + k * 0.03, 0.05, -0.05 + r * 0.075 - 0.002)); g.add(at(zcyl(0.005, 0.005, 0.012, mat(c, { rough: 0.3 }), 10), -0.115 + k * 0.03, 0.05, -0.05 + r * 0.075 + 0.04)); });
  for (let i = 0; i < 3; i++) { const b = cyl(0.003, 0.0035, 0.2, mat(['#e63946', '#1b1b1b', '#ffd166'][i], { rough: 0.3 }), 8); b.rotation.set(PI / 2, 0, PI / 2); g.add(at(b, 0.01, 0.046, 0.085 + i * 0.008)); }
  return g;
}

// ------------------------------------------------------------------ journals
function journalModel({ key, cover, coverDraw, band = null, ribbon = '#c1121f', w = 0.15, h = 0.21, t = 0.024, pen = false }) {
  const tex = labelTexture(`journal:${key}`, 256, Math.round(256 * h / w), coverDraw);
  const pages = mat('#fbf6ea', { rough: 0.95 });
  const cm = mat('#ffffff', { map: tex, rough: 0.7 });
  const side = mat(cover, { rough: 0.7 });
  const b = mesh(sgeo(`jgeo:${w}:${t}:${h}`, () => new THREE.BoxGeometry(w, t, h)), [pages, side, cm, side, pages, pages]);
  b.position.y = t / 2;
  const g = group(b);
  if (band) g.add(at(box(0.006, t + 0.002, h + 0.002, mat(band, { rough: 0.6 })), w * 0.32, t / 2, 0));
  if (ribbon) { const r = box(0.008, 0.001, 0.05, mat(ribbon, { rough: 0.6 })); r.rotation.x = 0.4; g.add(at(r, -w * 0.15, 0.008, h / 2 + 0.018)); }
  if (pen) { const p = capsule(0.005, 0.13, mat('#1b1b1b', { rough: 0.3, metal: 0.4 })); p.rotation.set(PI / 2, 0, 0); g.add(at(p, w / 2 + 0.006, t + 0.004, 0)); g.add(at(box(0.004, 0.003, 0.04, MAT.gold()), w / 2 + 0.006, t + 0.009, -0.04)); }
  return g;
}

// ------------------------------------------------------------------ jigsaw puzzles
function patchGeo(cols, rows, i, j, W, H) {
  return sgeo(`jig:${cols}:${rows}:${i}:${j}:${W}:${H}`, () => {
    const g = new THREE.PlaneGeometry(W / cols, H / rows);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / cols, (rows - 1 - j + uv.getY(k)) / rows);
    return g;
  });
}
function jigsawArt(key, draw) {
  return labelTexture(`jigart:${key}`, 512, 360, (ctx, w, h) => {
    draw(ctx, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
    const cw = w / 16, ch = h / 11;
    for (let r = 1; r < 11; r++) { ctx.beginPath(); for (let c = 0; c < 16; c++) { const x = c * cw; ctx.lineTo(x, r * ch); ctx.lineTo(x + cw * 0.38, r * ch); ctx.arc(x + cw / 2, r * ch + ((r + c) % 2 ? 4 : -4), 4.5, PI, 0, (r + c) % 2 === 0); ctx.lineTo(x + cw, r * ch); } ctx.stroke(); }
    for (let c = 1; c < 16; c++) { ctx.beginPath(); for (let r = 0; r < 11; r++) { const y = r * ch; ctx.lineTo(c * cw, y); ctx.lineTo(c * cw, y + ch * 0.38); ctx.arc(c * cw + ((r + c) % 2 ? 4 : -4), y + ch / 2, 4.5, -PI / 2, PI / 2, (r + c) % 2 === 1); ctx.lineTo(c * cw, y + ch); } ctx.stroke(); }
  });
}
const JIG_ART = {
  mountain(ctx, w, h) {
    vgrad(ctx, w, h, ['#ff9e64', '#ffcf7a', '#ffe8c2'], 0, h * 0.5);
    circle(ctx, w * 0.62, h * 0.38, 40, '#fff6d5');
    const ridge = (y, amp, col, seed) => { const r = seeded(seed); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h); let yy = y; for (let x = 0; x <= w; x += 16) { yy += (r() - 0.5) * amp; ctx.lineTo(x, Math.min(h, yy - Math.sin(x * 0.012 + seed) * amp * 2)); } ctx.lineTo(w, h); ctx.fill(); };
    ridge(h * 0.42, 22, '#6d597a', 1); ridge(h * 0.5, 18, '#355070', 2);
    vgrad(ctx, w, h, ['#e56b6f', '#355070'], h * 0.6, h);
    ctx.fillStyle = 'rgba(255,246,213,0.45)'; for (let i = 0; i < 8; i++) ctx.fillRect(w * 0.55 + Math.sin(i) * 20, h * 0.62 + i * 10, 60 - i * 6, 3);
    ctx.fillStyle = '#1b2a3a'; for (let i = 0; i < 14; i++) { const x = i * 40 + (i % 2) * 12; ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 14, h * 0.72 - (i % 3) * 14); ctx.lineTo(x + 28, h); ctx.fill(); }
  },
  catcafe(ctx, w, h) {
    ctx.fillStyle = '#f4e3c3'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7f5539'; ctx.fillRect(0, h * 0.7, w, h * 0.3);
    ctx.fillStyle = '#a3c4bc'; ctx.fillRect(w * 0.08, h * 0.08, w * 0.38, h * 0.45); ctx.fillStyle = '#7f5539'; ctx.fillRect(w * 0.26, h * 0.08, 6, h * 0.45);
    const cats = [['#f4a261', 0.2, 0.68], ['#2b2d42', 0.45, 0.62], ['#fdfcf7', 0.7, 0.66], ['#adb5bd', 0.86, 0.4]];
    for (const [c, x, y] of cats) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(w * x, h * y, 36, 26, 0, 0, 7); ctx.fill(); circle(ctx, w * x + 26, h * y - 22, 20, c); ctx.beginPath(); ctx.moveTo(w * x + 12, h * y - 34); ctx.lineTo(w * x + 16, h * y - 52); ctx.lineTo(w * x + 26, h * y - 40); ctx.moveTo(w * x + 30, h * y - 40); ctx.lineTo(w * x + 38, h * y - 52); ctx.lineTo(w * x + 42, h * y - 32); ctx.fill(); }
    for (const x of [0.58, 0.72]) { ctx.fillStyle = '#ffffff'; ctx.fillRect(w * x, h * 0.2, 30, 34); ctx.fillStyle = '#6f4e37'; ctx.fillRect(w * x + 3, h * 0.2 + 3, 24, 6); }
    ctx.fillStyle = '#e76f51'; ctx.fillRect(w * 0.55, h * 0.1, w * 0.4, 30); txt(ctx, 'CAT CAFÉ', w * 0.75, h * 0.1 + 16, 22, '#fff');
  },
};
function jigsawModel(key, artKey, boxC) {
  const g = new THREE.Group();
  const W = 0.5, H = 0.35, cols = 5, rows = 4;
  g.add(at(rbox(W + 0.04, 0.008, H + 0.04, 0.004, MAT.wood('#d6b58a')), 0, 0.004, 0));
  const tex = jigsawArt(artKey, JIG_ART[artKey]);
  const pm = mat('#ffffff', { map: tex, rough: 0.6 });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const corner = (i === 0 || i === cols - 1) && (j === 0 || j === rows - 1);
    const edgeTB = j === 0 || j === rows - 1, edgeLR = i === 0 || i === cols - 1;
    const st = corner ? 0 : edgeTB ? 1 : edgeLR ? 2 : 3 + ((i + j) % 3);
    const p = step(mesh(patchGeo(cols, rows, i, j, W, H), pm), st);
    p.rotation.x = -PI / 2; p.position.set(-W / 2 + (i + 0.5) * W / cols, 0.0085, -H / 2 + (j + 0.5) * H / rows);
    g.add(p);
  }
  const lid = new THREE.Group(); lid.position.set(0.31, 0, -0.02); lid.rotation.y = -0.35;
  lid.add(at(rbox(0.2, 0.04, 0.15, 0.004, mat(boxC, { rough: 0.5 })), 0, 0.02, 0));
  const lidArt = face(0.18, 0.126, `jiglid:${key}`, (ctx, w, h) => { ctx.drawImage(tex.image, 0, 0, w, h); }, { tw: 256, th: 180 }); lidArt.rotation.x = -PI / 2; lid.add(at(lidArt, 0, 0.0405, -0.005));
  g.add(lid);
  const r = seeded(key.length);
  for (let k = 0; k < 6; k++) { const pc = box(0.022, 0.003, 0.02, pm); pc.rotation.y = r() * 3; g.add(at(pc, -0.32 + r() * 0.08, 0.0015, -0.1 + r() * 0.25)); }
  return g;
}

// ------------------------------------------------------------------ model kits & brick sets
function runner(c = '#9aa0a8') {
  const m = mat(c, { rough: 0.5 });
  const g = new THREE.Group();
  g.add(at(box(0.18, 0.004, 0.004, m), 0, 0.002, -0.05), at(box(0.18, 0.004, 0.004, m), 0, 0.002, 0.05), at(box(0.004, 0.004, 0.1, m), -0.09, 0.002, 0), at(box(0.004, 0.004, 0.1, m), 0.09, 0.002, 0), at(box(0.18, 0.003, 0.003, m), 0, 0.0015, 0));
  for (let i = 0; i < 5; i++) g.add(at(rbox(0.02, 0.005, 0.016, 0.002, m), -0.06 + i * 0.03, 0.0025, -0.025 + (i % 2) * 0.05));
  return g;
}
function shipKit() {
  const g = new THREE.Group();
  const wood = MAT.wood('#7a4b2a');
  g.add(at(rbox(0.36, 0.015, 0.1, 0.004, MAT.wood('#3b2a1e')), 0, 0.0075, 0));
  for (const x of [-0.08, 0.08]) g.add(at(box(0.012, 0.04, 0.05, MAT.wood('#3b2a1e')), x, 0.035, 0));
  const hullPts = [[-0.17, 0.09], [-0.15, 0.04], [-0.1, 0.0], [0.1, 0.0], [0.16, 0.04], [0.2, 0.1], [0.12, 0.085], [-0.12, 0.085]];
  g.add(step(at(extrude(hullPts, 0.07, wood, 0.004, undefined, 'shiphull'), 0, 0.045, 0), 0));
  g.add(step(at(box(0.33, 0.006, 0.072, MAT.wood('#d9a066')), 0, 0.132, 0), 1));
  g.add(step(at(rbox(0.06, 0.03, 0.05, 0.004, wood), -0.11, 0.15, 0), 1));
  for (const [x, hh] of [[-0.06, 0.26], [0.06, 0.3]]) g.add(step(at(cyl(0.004, 0.005, hh, MAT.wood('#5a3519'), 8), x, 0.135 + hh / 2, 0), 2));
  g.add(step(at(rot(cyl(0.003, 0.003, 0.12, MAT.wood('#5a3519'), 6), 0, 0, 1.2), 0.2, 0.16, 0), 2));
  const sail = mat('#f4ede1', { rough: 0.95, side: THREE.DoubleSide });
  const sailGeo = sgeo('sail', () => { const gg = new THREE.CylinderGeometry(0.2, 0.2, 1, 12, 1, true, -0.35, 0.7); gg.translate(0, 0, -0.2); return gg; });
  for (const [x, y, sw, sh, st] of [[-0.06, 0.22, 0.12, 0.09, 3], [0.06, 0.24, 0.14, 0.1, 3], [-0.06, 0.32, 0.1, 0.07, 4], [0.06, 0.35, 0.11, 0.08, 4]]) { const s = mesh(sailGeo, sail); s.scale.set(sw / 0.137, sh, 1); g.add(step(at(s, x, y, 0.004), st)); }
  for (const x of [-0.06, 0.06]) g.add(step(at(face(0.03, 0.018, 'ship:flag', (ctx, w, h) => { ctx.fillStyle = '#c1121f'; ctx.fillRect(0, 0, w, h); txt(ctx, '★', w / 2, h / 2, h * 0.7, '#ffd166'); }, { th: 154 }), x + 0.016, 0.135 + (x < 0 ? 0.26 : 0.3) - 0.01, 0), 5));
  g.add(step(tube([[0.2, 0.16, 0], [0.06, 0.44, 0], [-0.06, 0.4, 0], [-0.17, 0.14, 0]], 0.0012, mat('#3b2a1e'), 24, 4), 5));
  return g;
}
function mechKit() {
  const g = new THREE.Group();
  const white = mat('#f1f3f5', { rough: 0.4 }), blue = mat('#1d4ed8', { rough: 0.4 }), red = mat('#e63946', { rough: 0.4 }), yel = mat('#ffd60a', { rough: 0.4 }), grey = mat('#6c757d', { rough: 0.5 });
  g.add(at(rbox(0.16, 0.012, 0.12, 0.004, mat('#1b1b1b', { rough: 0.3 })), 0, 0.006, 0));
  const rn = runner(); rn.position.set(0.2, 0, 0.02); rn.rotation.y = 0.4; g.add(rn);
  for (const s of [-1, 1]) {
    g.add(step(at(rbox(0.03, 0.014, 0.05, 0.004, red), s * 0.025, 0.019, 0.006), 0));
    g.add(step(at(rbox(0.026, 0.06, 0.03, 0.006, white), s * 0.025, 0.055, 0), 0));
    g.add(step(at(rbox(0.024, 0.05, 0.028, 0.006, white), s * 0.025, 0.11, -0.002), 0));
    g.add(step(at(rbox(0.03, 0.018, 0.032, 0.004, blue), s * 0.025, 0.084, 0.004), 0));
  }
  g.add(step(at(rbox(0.06, 0.03, 0.04, 0.006, red), 0, 0.145, 0), 1));
  g.add(step(at(rbox(0.07, 0.06, 0.045, 0.008, blue), 0, 0.19, 0), 1));
  g.add(step(at(rbox(0.04, 0.025, 0.012, 0.003, yel), 0, 0.2, 0.025), 1));
  for (const s of [-1, 1]) {
    g.add(step(at(rbox(0.024, 0.07, 0.026, 0.006, white), s * 0.055, 0.17, 0), 2));
    g.add(step(at(rbox(0.026, 0.02, 0.026, 0.004, red), s * 0.055, 0.125, 0.004), 2));
    g.add(step(at(rbox(0.046, 0.028, 0.046, 0.008, white), s * 0.06, 0.215, 0), 5));
  }
  g.add(step(at(rbox(0.032, 0.03, 0.032, 0.008, white), 0, 0.236, 0.004), 3));
  g.add(step(at(box(0.022, 0.006, 0.004, mat('#5ef2ff', { emissive: '#5ef2ff', ei: 1.2 })), 0, 0.238, 0.021), 3));
  for (const s of [-1, 1]) { const v = cone(0.003, 0.03, yel, 6); v.rotation.z = -s * 1.0; g.add(step(at(v, s * 0.016, 0.258, 0.016), 5)); }
  g.add(step(at(rbox(0.05, 0.05, 0.025, 0.006, grey), 0, 0.19, -0.035), 4));
  for (const s of [-1, 1]) g.add(step(at(zcyl(0.007, 0.009, 0.02, grey, 10), s * 0.016, 0.16, -0.05).rotateX(-0.6), 4));
  const rifle = group(at(box(0.012, 0.016, 0.1, grey), 0, 0, 0), at(box(0.008, 0.024, 0.012, grey), 0, -0.015, -0.02)); rifle.position.set(0.075, 0.14, 0.04); g.add(step(rifle, 4));
  return g;
}
function planeKit() {
  const g = new THREE.Group();
  const red = mat('#c1121f', { rough: 0.35 }), cream = mat('#fefae0', { rough: 0.5 }), wood = MAT.wood('#7a4b2a');
  g.add(at(rbox(0.16, 0.012, 0.12, 0.004, mat('#1b1b1b', { rough: 0.3 })), 0, 0.006, 0));
  g.add(at(cyl(0.005, 0.006, 0.09, MAT.chrome(), 8), 0, 0.055, 0));
  const p = new THREE.Group(); p.position.y = 0.11; p.rotation.y = -0.5;
  p.add(step(at(rot(capsule(0.022, 0.16, red), PI / 2, 0, 0), 0, 0, 0), 0));
  p.add(step(at(rbox(0.3, 0.008, 0.06, 0.003, cream), 0, -0.016, 0.03), 1));
  p.add(step(at(rbox(0.32, 0.008, 0.06, 0.003, cream), 0, 0.05, 0.03), 2));
  for (const s of [-1, 1]) for (const z of [0.01, 0.05]) p.add(step(at(cyl(0.0025, 0.0025, 0.066, wood, 6), s * 0.1, 0.017, z), 2));
  p.add(step(at(rbox(0.11, 0.006, 0.04, 0.003, cream), 0, 0.005, -0.1), 3));
  p.add(step(at(rbox(0.006, 0.05, 0.04, 0.003, red), 0, 0.03, -0.1), 3));
  p.add(step(at(zcyl(0.024, 0.02, 0.02, MAT.metal('#adb5bd', 0.3), 16), 0, 0, 0.1), 4));
  const prop = group(at(box(0.11, 0.012, 0.004, wood), 0, 0, 0)); prop.rotation.z = 0.4; prop.position.z = 0.112; p.add(step(prop, 4));
  for (const s of [-1, 1]) { p.add(step(at(xcyl(0.014, 0.014, 0.008, MAT.rubber('#111'), 14), s * 0.04, -0.052, 0.04), 5)); p.add(step(at(rot(cyl(0.002, 0.002, 0.036, wood, 6), 0, 0, s * 0.3), s * 0.032, -0.034, 0.04), 5)); }
  p.add(step(at(sph(0.011, mat('#7f5539', { rough: 0.6 }), 12, 8), 0, 0.024, -0.02), 5));
  g.add(p);
  return g;
}
function studTex(c) {
  return labelTexture(`studs:${c}`, 128, 128, (ctx, w, h) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { circle(ctx, x * 16 + 8, y * 16 + 8, 5.5, 'rgba(255,255,255,0.28)'); circle(ctx, x * 16 + 9, y * 16 + 9, 5, 'rgba(0,0,0,0.12)'); circle(ctx, x * 16 + 8, y * 16 + 8, 5, c); } });
}
const brick = (c) => mat(c, { rough: 0.3, clearcoat: 0.5 });
function brickCourse(w, d, h, y, c, st, gaps = null) {
  const g = new THREE.Group();
  const m = brick(c);
  g.add(at(box(w, h, 0.016, m), 0, y + h / 2, d / 2 - 0.008), at(box(w, h, 0.016, m), 0, y + h / 2, -d / 2 + 0.008));
  g.add(at(box(0.016, h, d - 0.032, m), -w / 2 + 0.008, y + h / 2, 0), at(box(0.016, h, d - 0.032, m), w / 2 - 0.008, y + h / 2, 0));
  if (gaps) gaps(g);
  return step(g, st);
}
function brickHouse() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(sgeo('bplate', () => new THREE.BoxGeometry(0.26, 0.006, 0.2)), [brick('#2d6a4f'), brick('#2d6a4f'), mat('#ffffff', { map: studTex('#40916c'), rough: 0.4 }), brick('#2d6a4f'), brick('#2d6a4f'), brick('#2d6a4f')]);
  base.position.y = 0.003; g.add(base);
  const W = 0.16, D = 0.12;
  g.add(brickCourse(W, D, 0.032, 0.006, '#fefae0', 0));
  g.add(brickCourse(W, D, 0.032, 0.038, '#e9c46a', 1));
  g.add(brickCourse(W, D, 0.032, 0.07, '#fefae0', 2));
  g.add(step(at(box(0.034, 0.05, 0.004, brick('#9b2226')), 0.03, 0.031, D / 2 + 0.002), 1));
  g.add(step(at(sph(0.003, MAT.gold(), 6, 4), 0.04, 0.031, D / 2 + 0.005), 1));
  for (const x of [-0.045, 0.045]) { g.add(step(at(box(0.034, 0.026, 0.004, mat('#a2d2ff', { rough: 0.05, clearcoat: 1 })), x, 0.086, D / 2 + 0.002), 3)); g.add(step(at(box(0.04, 0.005, 0.008, brick('#ffffff')), x, 0.071, D / 2 + 0.004), 3)); }
  const roofM = brick('#c1121f');
  for (const s of [-1, 1]) { const r = new THREE.Mesh(sgeo('roof', () => new THREE.BoxGeometry(W + 0.03, 0.01, 0.1)), [roofM, roofM, mat('#ffffff', { map: studTex('#d62828'), rough: 0.4 }), roofM, roofM, roofM]); r.rotation.x = s * 0.68; r.position.set(0, 0.137, s * 0.031); r.castShadow = true; g.add(step(r, 4)); }
  for (const s of [-1, 1]) { const gab = extrude([[-D / 2 + 0.006, 0], [D / 2 - 0.006, 0], [0, 0.055]], 0.014, brick('#fefae0'), 0, undefined, 'gable'); gab.rotation.y = PI / 2; g.add(step(at(gab, s * (W / 2 - 0.007), 0.102, 0), 4)); }
  g.add(step(at(box(0.02, 0.04, 0.02, brick('#6c757d')), 0.05, 0.165, -0.02), 5));
  g.add(step(at(cyl(0.005, 0.005, 0.03, brick('#7f5539'), 8), -0.105, 0.021, 0.07), 5), step(at(cone(0.022, 0.05, brick('#52b788'), 8), -0.105, 0.06, 0.07), 5));
  const fig = group(at(box(0.012, 0.012, 0.008, brick('#1d4ed8')), 0, 0.012, 0), at(box(0.014, 0.012, 0.008, brick('#e63946')), 0, 0.024, 0), at(cyl(0.005, 0.005, 0.008, brick('#ffd60a'), 12), 0, 0.034, 0));
  fig.position.set(0.075, 0.006, 0.085); g.add(step(fig, 5));
  return g;
}
function brickRocket() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(sgeo('rpad', () => new THREE.BoxGeometry(0.2, 0.012, 0.2)), [brick('#6c757d'), brick('#6c757d'), mat('#ffffff', { map: studTex('#adb5bd'), rough: 0.4 }), brick('#6c757d'), brick('#6c757d'), brick('#6c757d')]);
  pad.position.y = 0.006; g.add(pad);
  g.add(at(box(0.012, 0.3, 0.012, brick('#e63946')), -0.07, 0.162, -0.04), at(box(0.04, 0.008, 0.012, brick('#e63946')), -0.05, 0.24, -0.04));
  const white = brick('#f8f9fa');
  const stages = [[0.05, 0.08, 0.012, 1, white], [0.042, 0.08, 0.092, 2, brick('#f8f9fa')], [0.034, 0.06, 0.172, 3, white]];
  for (const [r, h, y, st, m] of stages) { g.add(step(at(cyl(r, r, h, m, 20), 0, y + h / 2, 0), st)); g.add(step(at(rot(torus(r + 0.001, 0.003, brick('#1d4ed8'), 6, 24), PI / 2, 0, 0), 0, y + h, 0), st)); }
  g.add(step(at(face(0.03, 0.05, 'rocket:usa', (ctx, w, h) => { ctx.fillStyle = '#f8f9fa'; ctx.fillRect(0, 0, w, h); txt(ctx, 'B R I C K', w / 2, h / 2, h * 0.14, '#1d4ed8', { rot: PI / 2 }); }, { th: 400 }), 0, 0.13, 0.0425), 2));
  g.add(step(at(cone(0.034, 0.07, brick('#e63946'), 20), 0, 0.267, 0), 4));
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; const f = box(0.004, 0.04, 0.03, brick('#e63946')); f.rotation.y = -a; g.add(step(at(f, Math.cos(a) * 0.055, 0.035, Math.sin(a) * 0.055), 1)); }
  for (const s of [-1, 1]) { g.add(step(at(cyl(0.016, 0.016, 0.1, white, 14), s * 0.068, 0.062, 0), 5)); g.add(step(at(cone(0.016, 0.03, brick('#1d4ed8'), 14), s * 0.068, 0.127, 0), 5)); }
  g.add(step(at(rot(cone(0.03, 0.05, mat('#ff9f1c', { emissive: '#ff7b00', ei: 1.2, opacity: 0.9, transparent: true }), 14), PI, 0, 0), 0, 0.0, 0), 5));
  return g;
}

// ------------------------------------------------------------------ knitting & cross-stitch
function yarnTex(c) {
  return labelTexture(`yarn:${c}`, 128, 128, (ctx, w, h) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; for (let i = -h; i < w + h; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h * 0.6, h); ctx.stroke(); } ctx.strokeStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < w; i += 9) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i + 20); ctx.stroke(); } });
}
const yarnBall = (c, r) => sph(r, mat('#ffffff', { map: yarnTex(c), rough: 1, sheen: 0.6 }), 20, 14);
function basket() {
  const tex = labelTexture('wicker', 128, 64, (ctx, w, h) => { ctx.fillStyle = '#c8a27a'; ctx.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) { ctx.fillStyle = '#a47148'; ctx.fillRect(x, y, 8, 8); } });
  return lathe([[0.001, 0], [0.1, 0], [0.12, 0.08], [0.125, 0.1], [0.118, 0.1], [0.11, 0.084], [0.092, 0.008], [0.001, 0.008]], mat('#ffffff', { map: tex, rough: 0.9, side: THREE.DoubleSide }), 32);
}
function scarfKit({ c1 = '#e63946', c2 = '#fefae0' } = {}) {
  const g = group(at(basket(), -0.12, 0, 0));
  g.add(at(yarnBall(c1, 0.05), -0.14, 0.07, -0.02), at(yarnBall(c2, 0.042), -0.08, 0.06, 0.03));
  for (const s of [-1, 1]) { const n = cyl(0.003, 0.003, 0.3, MAT.wood('#d9a066'), 6); n.rotation.set(0.2, 0, s * 0.5 - 0.3); g.add(at(n, -0.12 + s * 0.02, 0.14, -0.02)); g.add(at(sph(0.007, MAT.wood('#d9a066'), 8, 6), -0.12 + s * 0.02 - Math.sin(s * 0.5 - 0.3) * 0.15, 0.14 + Math.cos(s * 0.5 - 0.3) * 0.15, -0.02)); }
  for (let i = 0; i < 6; i++) { const seg = rbox(0.1, 0.012, 0.075, 0.005, MAT.knit(i % 2 ? c2 : c1)); seg.rotation.y = -0.15 + i * 0.05; g.add(step(at(seg, 0.02 + i * 0.07, 0.006 + (i === 0 ? 0.004 : 0), 0.06 - i * 0.012), i)); }
  for (let k = 0; k < 5; k++) g.add(step(at(box(0.003, 0.002, 0.03, MAT.knit(c1)), 0.39 + 0.006, 0.006, 0.02 - 0.03 + k * 0.014).rotateY(0.1), 5));
  return g;
}
function beanieKit({ c = '#264653', pom = '#f4a261' } = {}) {
  const g = group(at(basket(), -0.1, 0, -0.02));
  g.add(at(yarnBall(c, 0.05), -0.12, 0.07, -0.03), at(yarnBall(pom, 0.035), -0.06, 0.055, 0.02));
  const km = MAT.knit(c);
  const bx = 0.12;
  for (let i = 0; i < 4; i++) g.add(step(at(cyl(0.085, 0.085, 0.022, km, 28, undefined, true), bx, 0.011 + i * 0.022, 0), i));
  g.add(step(at(torus(0.087, 0.006, MAT.knit(c), 6, 30), bx, 0.011, 0).rotateX(PI / 2), 0));
  const dome = mesh(sgeo('beaniedome', () => new THREE.SphereGeometry(0.085, 24, 10, 0, PI * 2, 0, PI / 2)), km); dome.scale.y = 0.8; g.add(step(at(dome, bx, 0.099, 0), 4));
  g.add(step(at(sph(0.025, MAT.knit(pom), 12, 10), bx, 0.17, 0), 5));
  g.add(at(rot(torus(0.09, 0.0025, MAT.metal('#c8ccd2', 0.3), 6, 40), PI / 2, 0, 0.15), bx, 0.09 + 0.0, 0));
  return g;
}
function crossStitch() {
  const g = new THREE.Group();
  const hoop = new THREE.Group(); hoop.position.set(0, 0.012, 0); hoop.rotation.x = -PI / 2;
  hoop.add(at(torus(0.1, 0.006, MAT.wood('#d9a066'), 8, 48), 0, 0, 0));
  hoop.add(at(torus(0.106, 0.004, MAT.wood('#c49a6c'), 8, 48), 0, 0, 0));
  hoop.add(at(box(0.02, 0.012, 0.012, MAT.wood('#c49a6c')), 0, 0.11, 0), at(xcyl(0.003, 0.003, 0.03, MAT.chrome(), 8), 0, 0.118, 0));
  hoop.add(at(mesh(sgeo('aida', () => new THREE.CircleGeometry(0.1, 40)), mat('#ffffff', { map: labelTexture('aida', 128, 128, (ctx, w, h) => { ctx.fillStyle = '#fbf6ea'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < w; i += 4) { ctx.fillRect(i, 0, 1, h); ctx.fillRect(0, i, w, 1); } }), rough: 1 })), 0, 0, 0.001));
  const PAT = ['..RR..RR..', '.RRRRRRRR.', 'RRRPRRRRRR', 'RRRRRRRRRR', '.RRRRRRRR.', '..RRRRRR..', '...RRRR...', '....RR....', 'G........G', 'GG..YY..GG'];
  const cols = { R: '#e63946', P: '#ffafcc', G: '#52b788', Y: '#ffd166' };
  for (let s = 0; s < 6; s++) {
    const rowsFor = [[0, 1], [2, 3], [4], [5], [6, 7], [8, 9]][s];
    const tex = labelTexture(`xstitch:${s}`, 160, 160, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); rowsFor.forEach((r) => [...PAT[r]].forEach((ch, c) => { if (!cols[ch]) return; ctx.strokeStyle = cols[ch]; ctx.lineWidth = 4; const x = c * 16, y = r * 16; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 14, y + 14); ctx.moveTo(x + 14, y + 2); ctx.lineTo(x + 2, y + 14); ctx.stroke(); })); });
    const p = mesh(sgeo('xsplane', () => new THREE.PlaneGeometry(0.12, 0.12)), mat('#ffffff', { map: tex, transparent: true, rough: 0.9, depthWrite: false }));
    p.position.z = 0.0015 + s * 0.0001; hoop.add(step(p, s));
  }
  g.add(hoop);
  for (const [i, c] of [[0, '#e63946'], [1, '#52b788'], [2, '#ffd166']]) { const sk = capsule(0.008, 0.04, mat(c, { rough: 1, sheen: 0.5 })); sk.rotation.set(0, 0.4 + i * 0.3, PI / 2); g.add(at(sk, 0.16, 0.008, -0.05 + i * 0.03)); }
  return g;
}
function scarfModel(c1, c2) {
  const g = new THREE.Group();
  const L = 0.26, W = 0.11;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) { const seg = rbox(L / 5, 0.016, W, 0.006, MAT.knit(k % 2 ? c2 : c1)); g.add(at(seg, -L / 2 + (k + 0.5) * L / 5, 0.008 + i * 0.016, 0)); }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) g.add(at(box(0.035, 0.003, 0.005, MAT.knit(c1)), s * (L / 2 + 0.016), 0.004, -W / 2 + 0.01 + k * 0.018));
  return g;
}

// ------------------------------------------------------------------ fitness & wellness
function yogaMat() {
  const g = new THREE.Group();
  const tex = labelTexture('yogamat', 256, 96, (ctx, w, h) => { vgrad(ctx, w, h, ['#9b87f5', '#7b6ae0']); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(w * 0.85, h / 2, 6 + i * 6, 0, 7); ctx.stroke(); } ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(w * 0.08, h * 0.1, 2, h * 0.8); });
  const m = mesh(sgeo('yogamatgeo', () => new THREE.BoxGeometry(0.61, 0.006, 1.6)), [mat('#7b6ae0', { rough: 0.9 }), mat('#7b6ae0', { rough: 0.9 }), mat('#ffffff', { map: tex, rough: 0.92 }), mat('#7b6ae0', { rough: 0.9 }), mat('#7b6ae0', { rough: 0.9 }), mat('#7b6ae0', { rough: 0.9 })]);
  m.position.set(0, 0.003, 0.0); m.rotation.y = 0; g.add(m);
  const roll = xcyl(0.035, 0.035, 0.61, mat('#7b6ae0', { rough: 0.9 }), 24); g.add(at(roll, 0, 0.035, -0.82));
  g.add(at(xcyl(0.02, 0.02, 0.612, mat('#6a59cc', { rough: 0.9 }), 20), 0, 0.035, -0.82));
  const block = rbox(0.15, 0.075, 0.23, 0.015, mat('#c8b6ff', { rough: 0.95 })); block.rotation.y = 0.4; g.add(at(block, 0.42, 0.0375, 0.4));
  return g;
}
function dumbbell(c = '#2b2d42', label = '10') {
  const g = new THREE.Group();
  g.add(at(xcyl(0.012, 0.012, 0.12, MAT.chrome(), 12), 0, 0.04, 0));
  const head = mat(c, { rough: 0.85 });
  for (const s of [-1, 1]) { const h = xcyl(0.04, 0.04, 0.045, head, 6); h.rotation.x = PI / 6; g.add(at(h, s * 0.08, 0.04, 0)); g.add(at(face(0.03, 0.02, `db:${label}:${c}`, (ctx, w, hh) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, hh); txt(ctx, label, w / 2, hh / 2, hh * 0.7, '#ffd166'); }, { th: 170 }), s * 0.08, 0.04, 0.0347)); }
  return g;
}
function kettlebell() {
  const g = new THREE.Group();
  const m = mat('#ff6b6b', { rough: 0.4, clearcoat: 0.4 });
  const b = sph(0.085, m, 28, 20); b.scale.y = 0.92; g.add(at(b, 0, 0.078, 0));
  g.add(at(cyl(0.06, 0.06, 0.012, mat('#2b2d42', { rough: 0.8 }), 24), 0, 0.006, 0));
  g.add(at(torus(0.055, 0.014, mat('#2b2d42', { rough: 0.5 }), 10, 24, PI), 0, 0.14, 0));
  g.add(at(face(0.05, 0.03, 'kb:12', (ctx, w, h) => { ctx.fillStyle = '#ff6b6b'; ctx.fillRect(0, 0, w, h); txt(ctx, '12 KG', w / 2, h / 2, h * 0.5, '#ffffff', { weight: 900 }); }, { th: 154 }), 0, 0.08, 0.0795));
  return g;
}
function jumpRope() {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * PI * 4; const r = 0.06 + (i / 40) * 0.025; pts.push([Math.cos(t) * r, 0.006 + i * 0.0006, Math.sin(t) * r * 0.8]); }
  g.add(tube(pts, 0.0035, mat('#ff006e', { rough: 0.5 }), 80, 6));
  for (const [x, z, r] of [[0.14, 0.02, 0.2], [0.13, -0.05, -0.4]]) { const hdl = capsule(0.011, 0.09, mat('#1b1b1b', { rough: 0.4 })); hdl.rotation.set(0, r, PI / 2); g.add(at(hdl, x, 0.011, z)); }
  return g;
}
function exerciseBike() {
  const g = new THREE.Group();
  const frame = mat('#2b2d42', { rough: 0.35, metal: 0.4 }), accent = mat('#e63946', { rough: 0.3 });
  for (const z of [-0.45, 0.42]) g.add(at(rbox(0.5, 0.04, 0.07, 0.015, frame), 0, 0.02, z));
  g.add(tube([[0, 0.04, -0.42], [0, 0.4, -0.18], [0, 0.72, -0.2]], 0.03, frame, 16, 10));
  g.add(tube([[0, 0.04, 0.4], [0, 0.45, 0.25], [0, 0.95, 0.32]], 0.03, frame, 16, 10));
  g.add(at(xcyl(0.2, 0.2, 0.05, accent, 40), 0, 0.3, 0.2));
  g.add(at(xcyl(0.17, 0.17, 0.056, MAT.metal('#adb5bd', 0.3), 40), 0, 0.3, 0.2));
  g.add(at(xcyl(0.03, 0.03, 0.2, MAT.chrome(), 16), 0, 0.33, 0.0));
  for (const s of [-1, 1]) { g.add(at(box(0.02, 0.12, 0.02, MAT.chrome()), s * 0.09, 0.33 + s * 0.05, s * 0.02)); g.add(at(rbox(0.09, 0.02, 0.05, 0.008, frame), s * 0.13, 0.33 + s * 0.11, s * 0.02)); }
  g.add(at(rbox(0.2, 0.06, 0.28, 0.03, mat('#1b1b1b', { rough: 0.6 })), 0, 0.76, -0.24));
  g.add(at(rot(capsule(0.016, 0.4, mat('#1b1b1b', { rough: 0.8 })), 0, 0, PI / 2), 0, 0.98, 0.35));
  for (const s of [-1, 1]) g.add(at(rot(capsule(0.016, 0.1, mat('#1b1b1b', { rough: 0.8 })), PI / 2, 0, 0), s * 0.2, 0.98, 0.4));
  const con = rbox(0.18, 0.12, 0.03, 0.01, mat('#1b1b1b', { rough: 0.3 })); con.rotation.x = -0.6; g.add(at(con, 0, 1.03, 0.3));
  const scr = face(0.15, 0.09, 'bike:screen', (ctx, w, h) => { ctx.fillStyle = '#0b132b'; ctx.fillRect(0, 0, w, h); txt(ctx, '23.4 km/h', w / 2, h * 0.32, 22, '#5ef2ff', { font: 'monospace' }); txt(ctx, '♥ 128   ⚡ 212 kcal', w / 2, h * 0.7, 14, '#ff4fa3', { font: 'monospace' }); }, { emissive: true, ei: 0.8, th: 154 });
  scr.rotation.x = -0.6; g.add(at(scr, 0, 1.035, 0.317));
  return g;
}
function treadmill() {
  const g = new THREE.Group();
  const frame = mat('#1f2023', { rough: 0.35, metal: 0.3 });
  g.add(at(rbox(0.75, 0.14, 1.75, 0.03, frame), 0, 0.09, -0.05));
  const belt = labelTexture('belt', 64, 256, (ctx, w, h) => { ctx.fillStyle = '#2b2d33'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2); });
  g.add(at(rot(face(0.5, 1.6, 'treadbelt', (ctx, w, h) => { ctx.drawImage(belt.image, 0, 0, w, h); }, { tw: 64, th: 256, rough: 0.9 }), -PI / 2, 0, 0), 0, 0.1605, -0.08));
  for (const s of [-1, 1]) g.add(at(rbox(0.1, 0.02, 1.5, 0.008, mat('#adb5bd', { rough: 0.4, metal: 0.4 })), s * 0.31, 0.165, -0.1));
  for (const s of [-1, 1]) { const up = rbox(0.06, 1.1, 0.06, 0.02, frame); up.rotation.x = -0.18; g.add(at(up, s * 0.33, 0.68, 0.72)); g.add(at(rot(capsule(0.018, 0.45, mat('#3a3b3f', { rough: 0.7 })), PI / 2, 0, 0), s * 0.33, 1.08, 0.48)); }
  const con = rbox(0.75, 0.2, 0.12, 0.03, frame); con.rotation.x = -0.4; g.add(at(con, 0, 1.28, 0.62));
  const scr = face(0.4, 0.13, 'tread:screen', (ctx, w, h) => { ctx.fillStyle = '#0b132b'; ctx.fillRect(0, 0, w, h); txt(ctx, '8.5 km/h', w * 0.3, h * 0.45, 30, '#7bf1a8', { font: 'monospace' }); txt(ctx, '2.14 km · 14:52', w * 0.72, h * 0.45, 18, '#ffd166', { font: 'monospace' }); ctx.fillStyle = '#5ef2ff'; for (let i = 0; i < 20; i++) ctx.fillRect(14 + i * 24, h - 18 - (i % 5) * 4, 16, 8 + (i % 5) * 4); }, { emissive: true, ei: 0.8, th: 84 });
  scr.rotation.x = -0.4; g.add(at(scr, 0, 1.3, 0.685));
  g.add(at(sph(0.012, mat('#e63946', { rough: 0.3 }), 10, 8), 0.3, 1.24, 0.69));
  return g;
}
function meditationCushion() {
  const g = new THREE.Group();
  g.add(at(rbox(0.7, 0.05, 0.7, 0.025, MAT.fabric('#6b705c')), 0, 0.025, 0));
  const zafu = sph(0.18, MAT.fabric('#bc6c25'), 32, 18); zafu.scale.y = 0.45; g.add(at(zafu, 0, 0.12, 0));
  const pleat = torus(0.075, 0.018, MAT.fabric('#a5541c'), 10, 36); pleat.rotation.x = PI / 2; pleat.scale.z = 0.6; g.add(at(pleat, 0, 0.19, 0));
  g.add(at(cyl(0.018, 0.018, 0.01, MAT.fabric('#a5541c'), 16), 0, 0.2, 0));
  const bowl = lathe([[0.001, 0], [0.04, 0], [0.065, 0.035], [0.07, 0.06], [0.064, 0.06], [0.06, 0.04], [0.035, 0.008], [0.001, 0.008]], mat('#c9a227', { rough: 0.25, metal: 0.9 }), 32);
  g.add(at(bowl, 0.26, 0.05, 0.24));
  const mallet = cyl(0.008, 0.008, 0.15, MAT.wood('#5a3519'), 8); mallet.rotation.set(PI / 2, 0, 0.6); g.add(at(mallet, 0.2, 0.06, 0.28));
  return g;
}

// ------------------------------------------------------------------ tabletop games
function memoryGame() {
  const g = new THREE.Group();
  const boxArt = labelTexture('memory:lid', 256, 256, (ctx, w, h) => { vgrad(ctx, w, h, ['#ffd166', '#ff9f1c']); txt(ctx, 'MEMORY', w / 2, 52, 40, '#ffffff', { stroke: '#9c2c2c', lw: 8, weight: 900 }); txt(ctx, 'MATCH', w / 2, 96, 40, '#ffffff', { stroke: '#9c2c2c', lw: 8, weight: 900 }); const em = ['🐶', '🐱', '🐸', '🦊']; em.forEach((e, i) => { const x = 50 + i * 52; ctx.fillStyle = '#fff'; roundRect_(ctx, x - 22, 140, 44, 54, 8); ctx.fill(); txt(ctx, e, x, 168, 28, '#000', { weight: 400 }); }); txt(ctx, 'CRITTERS EDITION', w / 2, 226, 16, '#9c2c2c'); });
  const side = mat('#ff9f1c', { rough: 0.5 });
  const lid = mesh(sgeo('memlid', () => new THREE.BoxGeometry(0.24, 0.04, 0.24)), [side, side, mat('#fff', { map: boxArt, rough: 0.5 }), side, side, side]);
  lid.rotation.set(1.25, -0.15, 0); lid.position.set(0.0, 0.12, -0.27); g.add(lid);
  g.add(at(rbox(0.23, 0.035, 0.23, 0.004, mat('#9c2c2c', { rough: 0.5 })), 0.0, 0.0175, -0.17));
  const back = labelTexture('memory:back', 64, 64, (ctx, w, h) => { ctx.fillStyle = '#3a86ff'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, h - 12); txt(ctx, '?', w / 2, h / 2 + 2, 30, '#ffffff', { weight: 900 }); });
  const tileGeo = sgeo('memtile', () => new THREE.BoxGeometry(0.05, 0.004, 0.05));
  const em = ['🐶', '🐱', '🐸', '🦊', '🐼', '🐷'];
  const r = seeded(6);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
    const up = (i + j * 4) % 5 === 1;
    const topM = up ? mat('#fff', { map: labelTexture(`memface:${(i + j) % 6}`, 64, 64, (ctx, w, h) => { ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, h); txt(ctx, em[(i + j) % 6], w / 2, h / 2 + 2, 40, '#000', { weight: 400 }); }), rough: 0.5 }) : mat('#fff', { map: back, rough: 0.5 });
    const t = mesh(tileGeo, [mat('#fff'), mat('#fff'), topM, mat('#fff'), mat('#fff'), mat('#fff')]);
    t.rotation.y = (r() - 0.5) * 0.2; g.add(at(t, -0.09 + i * 0.06, 0.002, 0.04 + j * 0.06));
  }
  return g;
}
function gardenParty() {
  const g = new THREE.Group();
  const boardTex = labelTexture('garden:board', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#95d5b2'; ctx.fillRect(0, 0, w, h);
    const path = []; for (let i = 0; i < 9; i++) path.push([24 + i * 26, 24]); for (let i = 1; i < 9; i++) path.push([232, 24 + i * 26]); for (let i = 1; i < 8; i++) path.push([232 - i * 26, 232]); for (let i = 1; i < 6; i++) path.push([50, 232 - i * 26]);
    const cols = ['#ffd166', '#ff70a6', '#ffffff', '#a0c4ff'];
    path.forEach(([x, y], i) => { ctx.fillStyle = cols[i % 4]; roundRect_(ctx, x - 11, y - 11, 22, 22, 5); ctx.fill(); });
    for (const [x, y, c] of [[100, 100, '#e63946'], [150, 130, '#ffd166'], [120, 170, '#c77dff'], [170, 90, '#ff70a6']]) { for (let k = 0; k < 6; k++) circle(ctx, x + Math.cos(k) * 9, y + Math.sin(k) * 9, 6, c); circle(ctx, x, y, 5, '#ffd60a'); }
    txt(ctx, 'GARDEN PARTY', w / 2, h / 2 + 4, 16, '#1b4332', { weight: 900 });
  });
  const edge = mat('#2d6a4f', { rough: 0.5 });
  const board = mesh(sgeo('gboard', () => new THREE.BoxGeometry(0.34, 0.01, 0.34)), [edge, edge, mat('#fff', { map: boardTex, rough: 0.5 }), edge, edge, edge]);
  board.position.y = 0.005; g.add(board);
  const pawn = (c) => group(lathe([[0.001, 0], [0.012, 0], [0.012, 0.004], [0.006, 0.012], [0.005, 0.022], [0.001, 0.022]], mat(c, { rough: 0.3, clearcoat: 0.5 }), 16), at(sph(0.0075, mat(c, { rough: 0.3, clearcoat: 0.5 }), 12, 8), 0, 0.027, 0));
  [['#e63946', -0.13, -0.15], ['#3a86ff', -0.1, -0.15], ['#ffd60a', 0.12, 0.0], ['#7b2cbf', 0.0, 0.15]].forEach(([c, x, z]) => g.add(at(pawn(c), x, 0.01, z)));
  const dm = [1, 6, 2, 5, 3, 4].map((n) => mat('#fff', { map: labelTexture(`gpip:${n}`, 32, 32, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); txt(ctx, String(n), w / 2, h / 2 + 1, 22, '#2d6a4f', { weight: 900 }); }), rough: 0.4 }));
  for (const [x, z, ry] of [[0.2, 0.12, 0.3], [0.22, 0.16, 1.1]]) { const d = mesh(sgeo('gdie', () => new THREE.BoxGeometry(0.018, 0.018, 0.018)), dm); d.rotation.y = ry; g.add(at(d, x, 0.009, z)); }
  return g;
}
function chessSet() {
  const g = new THREE.Group();
  const tex = labelTexture('chessboard', 256, 256, (ctx, w, h) => { ctx.fillStyle = '#5a3519'; ctx.fillRect(0, 0, w, h); const s = (w - 24) / 8; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { ctx.fillStyle = (r + c) % 2 ? '#7a4b2a' : '#f1d9b5'; ctx.fillRect(12 + c * s, 12 + r * s, s, s); } });
  const edge = MAT.wood('#5a3519');
  const board = mesh(sgeo('chessgeo', () => new THREE.BoxGeometry(0.4, 0.025, 0.4)), [edge, edge, mat('#fff', { map: tex, rough: 0.35, clearcoat: 0.4 }), edge, edge, edge]);
  board.position.y = 0.0125; g.add(board);
  const sq = (0.4 - 0.4 * 24 / 256) / 8;
  const pos = (c, r) => [-0.4 / 2 + 0.4 * 12 / 256 + (c + 0.5) * sq, 0.025, -0.4 / 2 + 0.4 * 12 / 256 + (r + 0.5) * sq];
  const W = mat('#f4ede1', { rough: 0.3, clearcoat: 0.6 }), B = mat('#1b1b1b', { rough: 0.3, clearcoat: 0.6 });
  const base = [[0.001, 0], [0.016, 0], [0.016, 0.005], [0.012, 0.008]];
  const PIECES = {
    p: [...base, [0.007, 0.014], [0.005, 0.026], [0.009, 0.028], [0.001, 0.028]],
    r: [...base, [0.01, 0.012], [0.01, 0.036], [0.013, 0.038], [0.013, 0.046], [0.001, 0.046]],
    b: [...base, [0.007, 0.016], [0.006, 0.034], [0.009, 0.038], [0.007, 0.048], [0.002, 0.054], [0.001, 0.054]],
    q: [...base, [0.008, 0.016], [0.006, 0.042], [0.012, 0.05], [0.009, 0.058], [0.001, 0.058]],
    k: [...base, [0.009, 0.016], [0.007, 0.046], [0.012, 0.052], [0.01, 0.06], [0.001, 0.06]],
  };
  const piece = (t, m) => {
    if (t === 'n') { const n = group(lathe([...base, [0.009, 0.014], [0.001, 0.016]], m, 20)); const head = rbox(0.012, 0.032, 0.022, 0.005, m); head.rotation.x = -0.35; n.add(at(head, 0, 0.03, 0.002)); n.add(at(rbox(0.011, 0.012, 0.02, 0.004, m), 0, 0.04, 0.012)); return n; }
    const pc = group(lathe(PIECES[t], m, 20));
    if (t === 'k') pc.add(at(box(0.003, 0.014, 0.003, m), 0, 0.066, 0), at(box(0.01, 0.003, 0.003, m), 0, 0.066, 0));
    if (t === 'q') pc.add(at(sph(0.004, m, 8, 6), 0, 0.061, 0));
    if (t === 'p') pc.add(at(sph(0.0065, m, 12, 8), 0, 0.03, 0));
    return pc;
  };
  const layout = [['k', 6, 7, W], ['r', 5, 7, W], ['p', 5, 6, W], ['p', 6, 6, W], ['p', 7, 5, W], ['n', 5, 5, W], ['q', 3, 4, W], ['b', 2, 6, W], ['k', 6, 0, B], ['r', 0, 0, B], ['p', 6, 1, B], ['p', 5, 2, B], ['p', 1, 1, B], ['b', 4, 3, B], ['q', 3, 1, B], ['n', 2, 2, B]];
  for (const [t, c, r, m] of layout) { const p = piece(t, m); const [x, y, z] = pos(c, r); p.position.set(x, y, z); if (t === 'n') p.rotation.y = m === W ? PI : 0; g.add(p); }
  const fallen = piece('p', B); fallen.rotation.z = PI / 2; g.add(at(fallen, 0.23, 0.01, 0.1));
  return g;
}
function roundRect_(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ------------------------------------------------------------------ behaviors added by this catalogue
const CHESS_END = [
  ['Checkmate! A smothered mate with the knight. Chef\'s kiss.', 'win'],
  ['You win — your opponent (also you) resigns gracefully.', 'win'],
  ['Stalemate. Two kings staring at each other forever.', 'draw'],
  ['Draw by repetition. The pieces are as tired as you are.', 'draw'],
  ['You blundered your queen on move 12. Character building!', 'loss'],
  ['Scholar\'s mate. You were the scholar\'s victim.', 'loss'],
];
registerBehaviors({
  chess: {
    subtitle: (inst) => `Record ${inst.st.w || 0}W · ${inst.st.d || 0}D · ${inst.st.l || 0}L`,
    world(inst) { return [{ key: 'E', label: 'Play a game of chess', run: () => HOBBY.chessPlay(inst) }]; },
    held(inst) { return [{ key: 'LMB', label: 'Play a game of chess', run: () => HOBBY.chessPlay(inst) }]; },
  },
});
const HOBBY = {
  async chessPlay(inst) {
    const iv = setInterval(() => G.audio.play('clink', { pitch: 1.6 + Math.random() * 0.4, volume: 0.35 }), 900);
    const ok = await G.ui.progress('Thinking three moves ahead…', 10, { icon: '♟️' });
    clearInterval(iv);
    if (!ok) return;
    const [text, res] = pick(CHESS_END);
    if (res === 'win') { inst.st.w = (inst.st.w || 0) + 1; G.audio.play('success'); G.needs.add({ fun: 12, comfort: 3 }); G.needs.addBuff('inTheZone', 240); }
    else if (res === 'draw') { inst.st.d = (inst.st.d || 0) + 1; G.needs.add({ fun: 8, comfort: 2 }); G.needs.addBuff('reflective', 180); }
    else { inst.st.l = (inst.st.l || 0) + 1; G.audio.play('thud', { soft: true }); G.needs.add({ fun: 6 }); }
    G.ui.toast(`♟️ ${text}`, { duration: 4, kind: res === 'win' ? 'good' : undefined });
    G.events.emit('act', 'boardgame', { game: 'chess', result: res });
  },
};

// ------------------------------------------------------------------ definitions
const H = (o) => ({ category: 'hobby', ...o });
const INSTR = (o) => H({ emoji: '🎵', ...o });
const PROJ = (o) => H({ emoji: '🧩', ...o });
defineItems([
  // -------------------------------------------------------------- instruments
  INSTR({ id: 'guitar_acoustic', name: 'Dreadnought Acoustic Guitar', price: 249, stores: ['volt', 'primo'], furniture: true, place: 'floor', brand: 'Volt Music', desc: 'Spruce top, mahogany back, and a stand to show it off. Campfire songs, now indoors.', build: acousticGuitar, use: { type: 'instrument', kind: 'guitar' }, emoji: '🎸' }),
  INSTR({ id: 'bass_electric', name: 'Cherry Electric Bass', price: 399, stores: ['volt'], furniture: true, place: 'floor', rarity: 'uncommon', brand: 'Volt Music', desc: 'A glossy cherry-red four-string with a cream pickguard. Rattles the coffee mugs.', build: bassGuitar, use: { type: 'instrument', kind: 'bass' }, emoji: '🎸' }),
  INSTR({ id: 'ukulele_koa', name: 'Koa Concert Ukulele', price: 89, stores: ['volt', 'primo', 'arthaus'], brand: 'Volt Music', desc: 'Four nylon strings of pure sunshine, on a little desktop stand.', build: ukulele, use: { type: 'instrument', kind: 'ukulele' }, emoji: '🪕' }),
  INSTR({ id: 'violin_case', name: 'Student Violin & Case', price: 229, stores: ['volt', 'primo'], rarity: 'uncommon', brand: 'Volt Music', desc: 'A full-size violin with bow, nestled in a velvet-lined case. Neighbors: be brave.', build: violinInCase, use: { type: 'instrument', kind: 'violin' }, emoji: '🎻' }),
  INSTR({ id: 'keyboard_61', name: 'Stage Keyboard & Stand', price: 349, stores: ['volt'], furniture: true, place: 'floor', brand: 'Volt Music', desc: '61 touch-sensitive keys on an X-stand. Plays piano, organ and questionable synth brass.', build: keyboardOnStand, use: { type: 'instrument', kind: 'keys' }, emoji: '🎹' }),
  INSTR({ id: 'kalimba', name: 'Walnut Kalimba', price: 29, stores: ['primo', 'arthaus', 'volt'], brand: 'Volt Music', desc: 'A 17-tine thumb piano with a dreamy, music-box chime.', build: kalimba, use: { type: 'instrument', kind: 'kalimba' }, emoji: '🎼' }),
  INSTR({ id: 'harmonica', name: 'Blues Harp Harmonica', price: 24, stores: ['primo', 'volt'], brand: 'Volt Music', desc: 'Ten holes in the key of C. Instant train-whistle melancholy.', build: harmonica, use: { type: 'instrument', kind: 'harmonica' }, emoji: '🎶' }),
  INSTR({ id: 'drum_pad', name: 'Practice Drum Pad & Sticks', price: 39, stores: ['volt', 'primo'], brand: 'Volt Music', desc: 'Rubber practice pad and maple sticks. All the rudiments, a fraction of the noise.', build: drumPad, use: { type: 'instrument', kind: 'drums' }, emoji: '🥁' }),
  // -------------------------------------------------------------- art
  H({ id: 'easel_studio', name: 'Studio A-Frame Easel', price: 149, stores: ['arthaus'], furniture: true, place: 'floor', brand: 'ArtHaus', desc: 'A beechwood easel with a paint tray. Bring a blank canvas and make something to hang.', build: easelModel, use: { type: 'easel' }, emoji: '🎨' }),
  H({ id: 'drawing_tablet', name: 'Pen Display Drawing Tablet', price: 399, stores: ['volt', 'arthaus'], rarity: 'uncommon', brand: 'Volt', desc: 'A 13" pen display. Paint digitally — no canvas needed — and print it framed.', build: drawingTablet, use: { type: 'easel', free: true }, emoji: '✍️' }),
  H({ id: 'paint_set', name: 'ArtHaus Acrylic Paint Box', price: 45, stores: ['arthaus', 'primo'], brand: 'ArtHaus', desc: 'Twelve acrylic tubes and three brushes in a wooden box. Pairs with any easel.', build: paintSet, use: { type: 'decor', verb: 'Admire', lines: ['Twelve colors of pure potential.', 'You smell fresh paint and possibility.', 'Cadmium yellow is calling your name.'] }, emoji: '🖌️' }),
  // -------------------------------------------------------------- journals
  H({ id: 'journal_leather', name: 'Leather Travel Journal', price: 32, stores: ['arthaus', 'primo'], brand: 'ArtHaus', desc: 'Tan leather with a wrap band and a red ribbon. For thoughts, plans and doodles.', build: () => journalModel({ key: 'leather', cover: '#a0522d', band: '#5a3519', coverDraw: (ctx, w, h) => { ctx.fillStyle = '#a0522d'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(60,30,10,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.strokeRect(12, 12, w - 24, h - 24); ctx.setLineDash([]); txt(ctx, 'J O U R N A L', w / 2, h * 0.3, 18, 'rgba(60,30,10,0.55)', { font: 'Georgia, serif' }); } }), use: { type: 'journal' }, emoji: '📔' }),
  H({ id: 'journal_floral', name: 'Floral Linen Journal', price: 18, stores: ['arthaus', 'primo'], brand: 'ArtHaus', desc: 'A cloth-bound journal covered in wildflowers. Lined pages, elastic band.', build: () => journalModel({ key: 'floral', cover: '#f4ede1', band: '#e76f51', ribbon: '#2a9d8f', coverDraw: (ctx, w, h) => { ctx.fillStyle = '#f4ede1'; ctx.fillRect(0, 0, w, h); const r = seeded(14); for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, c = ['#e76f51', '#f4a261', '#2a9d8f', '#e9c46a', '#ffafcc'][i % 5]; for (let k = 0; k < 5; k++) circle(ctx, x + Math.cos(k * 1.26) * 7, y + Math.sin(k * 1.26) * 7, 5, c); circle(ctx, x, y, 3.5, '#fefae0'); } ctx.fillStyle = '#fefae0'; ctx.fillRect(w * 0.2, h * 0.4, w * 0.6, h * 0.14); txt(ctx, 'Notes & Dreams', w / 2, h * 0.47, 20, '#264653', { font: 'Georgia, serif', weight: 400 }); } }), use: { type: 'journal' }, emoji: '📓' }),
  H({ id: 'notebook_dotgrid', name: 'Dot Grid Notebook & Pen', price: 24, stores: ['arthaus', 'primo', 'volt'], brand: 'ArtHaus', desc: 'A minimalist black dot-grid notebook with a gold-clip pen. Bullet journal approved.', build: () => journalModel({ key: 'dotgrid', cover: '#1b1b1b', band: '#1b1b1b', ribbon: '#ffd166', pen: true, coverDraw: (ctx, w, h) => { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, w, h); for (let y = 20; y < h; y += 16) for (let x = 20; x < w; x += 16) circle(ctx, x, y, 1.2, 'rgba(255,255,255,0.12)'); txt(ctx, 'DOT·GRID', w / 2, h * 0.86, 14, '#c9a86a', { weight: 700 }); } }), use: { type: 'journal' }, emoji: '📒' }),
  // -------------------------------------------------------------- puzzles, kits & builds
  PROJ({ id: 'jigsaw_mountain', name: 'Alpine Sunset Jigsaw (1000 pc)', price: 22, stores: ['primo', 'arthaus'], brand: 'Puzzlecraft', desc: 'A mountain lake at golden hour. Corners first, then the edges, then the sky that never ends.', build: () => jigsawModel('mountain', 'mountain', '#355070'), use: { type: 'project', steps: 6, sessions: 3, seconds: 12, verb: 'Work on the puzzle', icon: '🧩', sound: 'click', doneText: 'Every last piece in place. You consider gluing it.' } }),
  PROJ({ id: 'jigsaw_cat_cafe', name: 'Cat Café Jigsaw (500 pc)', price: 16, stores: ['primo', 'arthaus'], brand: 'Puzzlecraft', desc: 'Four lounging cats and a lot of very similar latte foam. Cozy chaos.', build: () => jigsawModel('catcafe', 'catcafe', '#e76f51'), use: { type: 'project', steps: 6, sessions: 2, seconds: 10, verb: 'Work on the puzzle', icon: '🧩', sound: 'click', doneText: 'All four cats assembled. They look smug about it.' } }),
  PROJ({ id: 'model_kit_ship', name: 'Clipper Ship Model Kit', price: 59, stores: ['primo', 'arthaus'], rarity: 'uncommon', brand: 'Bench & Glue', desc: 'Build a two-masted wooden clipper: hull, deck, masts, sails and rigging.', build: shipKit, use: { type: 'project', steps: 6, sessions: 4, seconds: 12, verb: 'Build the ship', icon: '⛵', sound: 'click', doneText: 'She\'s seaworthy (for a shelf). Full sails ahead!' }, emoji: '⛵' }),
  PROJ({ id: 'model_kit_mech', name: 'Guardian Mech Model Kit (1/144)', price: 39, stores: ['primo', 'volt', 'arthaus'], brand: 'Bench & Glue', desc: 'Snap-fit robot model: legs, torso, arms, head and a very large backpack.', build: mechKit, use: { type: 'project', steps: 6, sessions: 3, seconds: 10, verb: 'Snap parts together', icon: '🤖', sound: 'click', doneText: 'The Guardian stands ready to defend your bookshelf.' }, emoji: '🤖' }),
  PROJ({ id: 'model_kit_biplane', name: 'Vintage Biplane Model Kit', price: 34, stores: ['primo', 'arthaus'], brand: 'Bench & Glue', desc: 'A red-and-cream barnstormer with a spinning prop and a tiny pilot.', build: planeKit, use: { type: 'project', steps: 6, sessions: 3, seconds: 10, verb: 'Glue the next part', icon: '✈️', sound: 'click', doneText: 'Chocks away! It looks ready for an air show.' }, emoji: '✈️' }),
  PROJ({ id: 'brick_set_house', name: 'Brickville Townhouse Set', price: 49, stores: ['primo', 'kollectiv'], brand: 'Brickville', desc: '412 snap-together bricks: walls, windows, a red roof, a tree and one tiny resident.', build: brickHouse, use: { type: 'project', steps: 6, sessions: 3, seconds: 10, verb: 'Snap bricks together', icon: '🧱', sound: 'click', doneText: 'The tiny resident moves in. Rent: zero.' }, emoji: '🏠' }),
  PROJ({ id: 'brick_set_rocket', name: 'Brickville Moon Rocket Set', price: 69, stores: ['primo', 'kollectiv'], rarity: 'uncommon', brand: 'Brickville', desc: 'A three-stage rocket with boosters and a launch tower. Countdown not included.', build: brickRocket, use: { type: 'project', steps: 6, sessions: 4, seconds: 10, verb: 'Build the next stage', icon: '🚀', sound: 'click', doneText: 'T-minus zero! Liftoff (in your imagination).' }, emoji: '🚀' }),
  PROJ({ id: 'knitting_kit_scarf', name: 'Chunky Scarf Knitting Kit', price: 38, stores: ['arthaus', 'primo'], brand: 'Purl & Co', desc: 'Merino yarn, bamboo needles and a basket. Knit a striped scarf you can actually wear.', build: () => scarfKit({}), use: { type: 'project', steps: 6, sessions: 4, seconds: 12, verb: 'Knit a few rows', icon: '🧶', sound: 'click', produces: 'scarf_handknit', consumeOnDone: true, doneText: 'A cozy handmade scarf!' }, emoji: '🧶' }),
  PROJ({ id: 'knitting_kit_beanie', name: 'Pom-Pom Beanie Knitting Kit', price: 29, stores: ['arthaus', 'primo'], brand: 'Purl & Co', desc: 'Circular needles and teal yarn to knit a ribbed beanie, pom-pom and all.', build: () => beanieKit({}), use: { type: 'project', steps: 6, sessions: 3, seconds: 12, verb: 'Knit a few rounds', icon: '🧶', sound: 'click', produces: 'beanie_handknit', consumeOnDone: true, doneText: 'A handmade beanie!' }, emoji: '🧶' }),
  PROJ({ id: 'cross_stitch_heart', name: 'Cross-Stitch Heart Hoop Kit', price: 19, stores: ['arthaus', 'primo'], brand: 'Purl & Co', desc: 'A beginner cross-stitch: a bold red heart over a little garden. Hoop, floss and needle included.', build: crossStitch, use: { type: 'project', steps: 6, sessions: 3, seconds: 10, verb: 'Stitch a few rows', icon: '🪡', sound: 'click', doneText: 'Your stitched heart is done. Hang it with pride.' }, emoji: '🪡' }),
  { id: 'scarf_handknit', name: 'Handknit Striped Scarf', category: 'accessories', price: 0, stores: [], hidden: true, tags: ['soft', 'homemade'], desc: 'Knit by you, row by row. Imperfect in all the right places.', build: () => scarfModel('#e63946', '#fefae0'), use: { type: 'wear', slot: 'accessory', style: 'scarf', color: '#e63946', fabric: 'knit', vibe: ['cozy', 'cottage'], points: 8, comfy: true }, emoji: '🧣' },
  { id: 'beanie_handknit', name: 'Handknit Pom Beanie', category: 'accessories', price: 0, stores: [], hidden: true, tags: ['soft', 'homemade'], desc: 'Your own ribbed beanie with a peach pom-pom. Warmth you made yourself.', build: () => beanie({ color: '#264653', pom: '#f4a261' }), use: { type: 'wear', slot: 'hat', style: 'beanie', color: '#264653', color2: '#f4a261', fabric: 'knit', vibe: ['cozy', 'street'], points: 7, comfy: true }, emoji: '🧢' },
  // -------------------------------------------------------------- fitness & wellness
  H({ id: 'yoga_mat', name: 'Lavender Yoga Mat & Block', price: 39, stores: ['primo'], tags: ['rug', 'soft'], noCollide: true, place: 'floor', brand: 'Flowstate', desc: 'Grippy 6mm mat with a cork-soft block. Unroll it and flow through a sun salutation.', build: yogaMat, use: { type: 'workout', verb: 'Do yoga', label: 'Flowing through sun salutations…', seconds: 12, standAt: [0, 0, 0.45], eye: 1.25, pitch: -0.55, needs: { energy: -3, comfort: 10, fun: 5, hygiene: -2 }, buff: 'zen', icon: '🧘' }, emoji: '🧘' }),
  H({ id: 'dumbbells_hex', name: 'Hex Dumbbells (2 × 10 lb)', price: 45, stores: ['primo'], brand: 'Flowstate', desc: 'Rubber-coated hex dumbbells that never roll away. Curl while the kettle boils.', build: () => group(at(dumbbell(), 0, 0, -0.05), at(dumbbell(), 0, 0, 0.05)), use: { type: 'workout', handheld: true, verb: 'Do some curls', needs: { energy: -4, hygiene: -3, fun: 3 } }, emoji: '🏋️' }),
  H({ id: 'kettlebell', name: 'Coral Kettlebell (12 kg)', price: 54, stores: ['primo'], brand: 'Flowstate', desc: 'A cheerful coral kettlebell. Swing it, squat it, mostly look at it.', build: kettlebell, use: { type: 'workout', handheld: true, verb: 'Kettlebell swings', needs: { energy: -5, hygiene: -4, fun: 3 } }, emoji: '🏋️' }),
  H({ id: 'jump_rope', name: 'Speed Jump Rope', price: 14, stores: ['primo'], brand: 'Flowstate', desc: 'A hot-pink speed rope with ball-bearing handles. Boxer cardio, living-room edition.', build: jumpRope, use: { type: 'workout', handheld: true, verb: 'Skip rope', needs: { energy: -4, hygiene: -3, fun: 4 } }, emoji: '🪢' }),
  H({ id: 'exercise_bike', name: 'Studio Spin Bike', price: 699, stores: ['primo', 'volt'], furniture: true, place: 'floor', rarity: 'uncommon', brand: 'Flowstate', desc: 'A heavy-flywheel spin bike with a stats display. Ride to nowhere, feel amazing.', build: exerciseBike, use: { type: 'workout', verb: 'Ride the bike', label: 'Spin class (party of one)…', seconds: 12, standAt: [0, 0, -0.22], faceBack: true, eye: 1.42, pitch: -0.2, sound: 'fan', needs: { energy: -9, hygiene: -8, fun: 7, comfort: 3 }, buff: 'endorphins', icon: '🚴' }, emoji: '🚴' }),
  H({ id: 'treadmill', name: 'Folding Treadmill', price: 899, stores: ['primo', 'volt'], furniture: true, place: 'floor', rarity: 'uncommon', brand: 'Flowstate', desc: 'Quiet belt, handrails and a big stats console. A morning run, rain or shine.', build: treadmill, use: { type: 'workout', verb: 'Go for a run', label: 'Running nowhere, fast…', seconds: 12, standAt: [0, 0, -0.15], faceBack: true, y: 0.17, eye: 1.6, pitch: -0.08, sound: 'hum', needs: { energy: -10, hygiene: -9, fun: 6, comfort: 2 }, buff: 'endorphins', icon: '🏃' }, emoji: '🏃' }),
  H({ id: 'meditation_cushion', name: 'Zafu Meditation Set', price: 79, stores: ['primo', 'arthaus'], place: 'floor', tags: ['soft'], brand: 'Flowstate', desc: 'A buckwheat zafu on a cotton zabuton, plus a brass singing bowl. Breathe in, breathe out.', build: meditationCushion, use: { type: 'meditate' }, emoji: '🧘' }),
  // -------------------------------------------------------------- tabletop games
  H({ id: 'boardgame_memory', name: 'Memory Match: Critters', price: 19.99, stores: ['primo', 'kollectiv'], brand: 'Tabletop Co', desc: 'Flip two tiles, find the pair. Deceptively cutthroat for a game with puppies on it.', build: memoryGame, use: { type: 'boardgame', game: 'memory_match' }, emoji: '🧠' }),
  H({ id: 'boardgame_garden', name: 'Garden Party Board Game', price: 29.99, stores: ['primo', 'kollectiv'], brand: 'Tabletop Co', desc: 'Race your pawn around the flower path, collecting blooms. Includes a memory mini-game.', build: gardenParty, use: { type: 'boardgame', game: 'memory_match' }, emoji: '🌼' }),
  H({ id: 'chess_set', name: 'Walnut Chess Set', price: 69, stores: ['primo', 'arthaus'], rarity: 'uncommon', brand: 'Tabletop Co', desc: 'A weighted walnut set mid-game. Play yourself, win (or lose to) yourself.', build: chessSet, use: { type: 'chess' }, emoji: '♟️' }),
]);
