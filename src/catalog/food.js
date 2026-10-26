// Catalogue: food — GrubHop restaurant meals, Dashr sweets & snacks, and the
// trash they leave behind. Models are built from kit primitives; parts tagged
// `userData.bite` vanish in order as you eat (see behaviors/consumables.js).
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mesh, mat, MAT, box, rbox, cyl, sph, hemi, torus, cone, capsule, lathe, tube, extrude, at, rot, scl, group, plane, decal, labelTexture, FONT, fitText, roundRect } from '../items/kit.js';
import { plate } from './shared.js';
import { seeded } from '../core/utils.js';

// =================================================================== helpers
// (exported: groceries.js and kitchen_appliances.js reuse them for dishes)
const GEO = new Map();
export function cgeo(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set(key, g); }
  return g;
}
export const bite = (o, n) => { o.userData.bite = n; return o; };
export const F = (c, rough = 0.65) => mat(c, { rough });
export const GL = (c) => mat(c, { rough: 0.2, clearcoat: 0.8 });
export const FLAT = (c, rough = 0.85) => mat(c, { rough, flat: true });
export const DS = (c, rough = 0.7) => mat(c, { rough, side: THREE.DoubleSide });
export const TR = (c, opacity = 0.75) => mat(c, { rough: 0.15, opacity, transparent: true });
const PI = Math.PI;

// 2D sector outline (shape y maps to world -z after slab())
export function sector(r, a0, a1, n = 10, r0 = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  if (r0 > 0) for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
  else pts.push([0, 0]);
  return pts;
}
// polar → world position on the XZ plane matching sector() angles
export const polar = (a, r, y = 0) => [Math.cos(a) * r, y, -Math.sin(a) * r];
// extruded 2D outline lying flat on XZ, bottom at y
export function slab(points, h, m, y = 0, bevel = 0.0015) {
  const e = extrude(points, h, m, bevel);
  e.rotation.x = -PI / 2; e.position.y = y + h / 2 + bevel;
  return e;
}
// U-shaped open half cylinder along X (taco shells)
export function shell(r, len, m) {
  const g = cgeo(`shell:${r}:${len}`, () => { const q = new THREE.CylinderGeometry(r, r, len, 18, 1, true, PI, PI); q.rotateZ(PI / 2); return q; });
  return mesh(g, m);
}
// partial cylinder (wedges of round things), axis Y, centered
export function cylPart(r, h, a0, len, m, seg = 12) {
  const g = cgeo(`cylp:${r}:${h}:${a0}:${len}:${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg, 1, false, a0, len));
  return mesh(g, m);
}
export function bowlShell(r, h, m, seg = 36) {
  return lathe([[0.001, 0], [r * 0.5, 0], [r * 0.95, h * 0.8], [r, h], [r * 0.94, h], [r * 0.88, h * 0.8], [r * 0.45, 0.007], [0.001, 0.007]], m, seg);
}
export function fill(r, h, m, y) { const f = cyl(r, r * 0.92, h, m, 28); return at(f, 0, y, 0); }
// small sauce / dip cup
export function dipCup(sauce, r = 0.022, cup = '#fbfaf7') {
  return group(lathe([[0.001, 0], [r * 0.8, 0], [r, r * 0.9], [r * 0.93, r * 0.9], [r * 0.74, 0.003], [0.001, 0.003]], MAT.ceramic(cup), 24), at(cyl(r * 0.9, r * 0.75, 0.004, GL(sauce), 20), 0, r * 0.68, 0));
}
export function chopsticks(len = 0.22, color = '#c9935a') {
  const m = mat(color, { rough: 0.6 });
  const one = (z) => at(rot(cyl(0.0022, 0.0035, len, m, 8), 0, 0, PI / 2), 0, 0, z);
  return group(one(-0.006), one(0.006));
}
export function fork(len = 0.16) {
  const m = MAT.metal('#d5d8dc', 0.25);
  const g = group(at(box(len * 0.62, 0.003, 0.012, m), -len * 0.19, 0, 0));
  for (let i = 0; i < 4; i++) g.add(at(box(len * 0.25, 0.002, 0.0022, m), len * 0.24, 0.0005, -0.0072 + i * 0.0048));
  g.add(at(box(0.012, 0.003, 0.02, m), len * 0.11, 0, 0));
  return g;
}
export function spoon(len = 0.15, color = null) {
  const m = color ? mat(color, { rough: 0.35 }) : MAT.metal('#d5d8dc', 0.25);
  const head = sph(0.013, m, 14, 10); head.scale.set(1.4, 0.3, 1);
  return group(at(box(len * 0.7, 0.003, 0.008, m), -len * 0.2, 0, 0), at(head, len * 0.3, 0, 0));
}
// lime/lemon wedge lying skin-down
export function citrusWedge(r = 0.022, rind = '#6bab2f', flesh = '#d7ee9c') {
  const g = group(rot(hemi(r, F(rind, 0.5)), PI, 0, 0), rot(at(cyl(r, r, 0.001, F(flesh, 0.4), 20), 0, 0.0005, 0), 0, 0, 0));
  g.scale.set(1, 0.55, 0.42); g.position.y = r * 0.55;
  return group(g);
}
// square-section lathe (rotation baked into the geometry so bounds stay tight)
export function lathe4(profile, m) {
  const key = 'lathe4:' + profile.map((p) => p.map((v) => Math.round(v * 1000)).join(',')).join(';');
  return mesh(cgeo(key, () => { const q = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), 4); q.rotateY(PI / 4); q.computeVertexNormals(); return q; }), m);
}
// cup / tub / bucket with a printed outer wall. Lathe UVs follow profile point
// index, so the label lives on its own 2-point wrap that spans the full texture.
export function labeledCup({ rb, rt, h, map, inner = '#f7f5f0', seg = 32, square = false, t = 0.003, rough = 0.6 }) {
  const prof = [[0.001, 0], [rb, 0], [rt, h], [rt - t, h], [rb - t, t], [0.001, t]];
  const wrap = [[rb * 1.006, 0.001], [rt * 1.006, h]];
  const wm = mat('#ffffff', { map, rough, flat: square });
  if (square) return group(lathe4(prof, mat(inner, { rough: 0.8, flat: true })), lathe4(wrap, wm));
  return group(lathe(prof, mat(inner, { rough: 0.7 }), seg), lathe(wrap, wm, seg));
}
// square-ish paper tray / basket
export function tray({ w = 0.16, d = null, h = 0.04, m = F('#f3eee4', 0.9) }) {
  const rt = w / Math.SQRT2, rb = rt * 0.82;
  const g = group(lathe4([[0.001, 0], [rb, 0], [rt, h], [rt - 0.003, h], [rb - 0.003, 0.003], [0.001, 0.003]], m));
  if (d) g.scale.z = d / w;
  return g;
}
// folded paper takeout pail with wire handle
export function pail({ label = 'WOK STAR', print = '#d62828', color = '#fbfaf7' } = {}) {
  const tex = TX(`pail:${label}:${print}`, 256, 128, (ctx, W, H) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = print; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of [0.125, 0.375, 0.625, 0.875]) {
      ctx.beginPath(); ctx.moveTo(W * x - 18, H * 0.5); ctx.lineTo(W * x, H * 0.3); ctx.lineTo(W * x + 18, H * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillRect(W * x - 12, H * 0.5, 24, 4); ctx.fillRect(W * x - 9, H * 0.5, 4, 22); ctx.fillRect(W * x + 5, H * 0.5, 4, 22);
      ctx.font = `900 ${H * 0.13}px ${FONT}`; fitText(ctx, label, W * x, H * 0.82, W * 0.22);
    }
  });
  const g = labeledCup({ rb: 0.045, rt: 0.064, h: 0.1, map: tex, inner: color, square: true, rough: 0.75 });
  g.add(at(rot(torus(0.05, 0.0014, MAT.metal('#9aa0a6', 0.3), 5, 24, PI), 0, PI / 4, 0), 0, 0.098, 0));
  return g;
}
export function liner(w, d, tex) { const p = plane(w, d, mat('#ffffff', { map: tex, rough: 0.9 })); p.rotation.x = -PI / 2; return p; }
// simple wavy noodle strands
export function noodles(n, { w = 0.1, d = 0.08, y = 0, r = 0.0028, m, amp = 0.006, seed = 1, waves = 4 }) {
  const rnd = seeded(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const z0 = -d / 2 + d * (i + 0.5) / n, pts = [];
    const ph = rnd() * 6;
    for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([-w / 2 + w * t, y + Math.sin(t * PI) * 0.004 + rnd() * 0.002, z0 + Math.sin(t * PI * waves + ph) * amp]); }
    out.push(tube(pts, r, m, 24, 5));
  }
  return out;
}
export function lcg(seed) { return seeded(seed); }

// ------------------------------------------------------------- textures
const TX = (key, w, h, draw, o) => labelTexture('food:' + key, w, h, draw, o);
function checkerTex(c = '#d62828', bg = '#ffffff', n = 8) {
  return TX(`check:${c}:${bg}:${n}`, 128, 128, (ctx, W, H) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = c; const s = W / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) ctx.fillRect(x * s, y * s, s, s); });
}
function speckTex(key, bg, specks, n = 60, size = 3, seed = 3) {
  return TX(`speck:${key}`, 128, 128, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const rnd = seeded(seed);
    for (let i = 0; i < n; i++) { ctx.fillStyle = specks[i % specks.length]; ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, size * (0.5 + rnd()), size * (0.4 + rnd() * 0.6), rnd() * 3, 0, 7); ctx.fill(); }
  }, { wrap: true });
}
function stripeTex(key, c1, c2, n = 10, vertical = true) {
  return TX(`stripe:${key}`, 128, 128, (ctx, W, H) => { for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? c2 : c1; if (vertical) ctx.fillRect(i * W / n, 0, W / n + 1, H); else ctx.fillRect(0, i * H / n, W, H / n + 1); } });
}
function bandLabel(key, bg, fg, title, sub = '', band = null) {
  return TX(`band:${key}`, 512, 128, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (band) { ctx.fillStyle = band; ctx.fillRect(0, H * 0.78, W, H * 0.22); ctx.fillRect(0, 0, W, H * 0.1); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of [0.25, 0.75]) {
      ctx.font = `900 ${H * 0.36}px ${FONT}`; fitText(ctx, title, W * x, H * (sub ? 0.4 : 0.47), W * 0.44);
      if (sub) { ctx.font = `700 ${H * 0.15}px ${FONT}`; fitText(ctx, sub, W * x, H * 0.66, W * 0.4); }
    }
  });
}
// texture for 4-sided lathe4 packaging: one centered logo per face
function faceLabel4(key, bg, fg, title, sub = '') {
  return TX(`face4:${key}`, 512, 128, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const x = W * (i + 0.5) / 4;
      ctx.font = `900 ${H * 0.26}px ${FONT}`; fitText(ctx, title, x, H * (sub ? 0.42 : 0.5), W * 0.2);
      if (sub) { ctx.font = `700 ${H * 0.12}px ${FONT}`; fitText(ctx, sub, x, H * 0.66, W * 0.2); }
    }
  });
}
function logoDecal(key, w, h, { bg = null, fg = '#ffffff', title, sub = '', emoji = '', round = 0 }) {
  return decal(w, h, 'food:logo:' + key, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 2, 2, W - 4, H - 4, round * W); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (emoji) { ctx.font = `${H * 0.34}px ${FONT}`; ctx.fillText(emoji, W / 2, H * 0.28); }
    ctx.fillStyle = fg; ctx.font = `900 ${H * (emoji ? 0.2 : 0.3)}px ${FONT}`; fitText(ctx, title, W / 2, H * (emoji ? 0.62 : sub ? 0.42 : 0.5), W * 0.86);
    if (sub) { ctx.font = `700 ${H * 0.12}px ${FONT}`; fitText(ctx, sub, W / 2, H * (emoji ? 0.84 : 0.7), W * 0.86); }
  }, { tw: 256, th: Math.round(256 * h / w) });
}
export { checkerTex, speckTex, stripeTex, bandLabel, logoDecal, faceLabel4 };

// =================================================================== burgers & sides (Smash Bros.)
// layers: array of kind strings, bottom → top (between the buns)
export function burgerStack({ bun = '#d18a3c', brioche = false, seeds = true, layers = ['patty', 'cheese', 'lettuce', 'tomato'], paper = '#e63946' }) {
  const g = new THREE.Group();
  const bunM = brioche ? mat(bun, { rough: 0.35, clearcoat: 0.5 }) : F(bun, 0.6);
  if (paper) { const p = liner(0.17, 0.17, checkerTex(paper, '#fff7ec', 6)); p.position.y = 0.001; g.add(p); }
  let y = 0.002;
  const parts = [];
  const put = (m, h, yy = y + h / 2) => { at(m, m.position.x, yy, m.position.z); g.add(m); parts.push(m); y += h; return m; };
  put(lathe([[0.001, 0], [0.05, 0], [0.056, 0.008], [0.056, 0.022], [0.001, 0.022]], F('#e9b773', 0.7), 28), 0.022, y);
  for (const k of layers) {
    if (k === 'patty') { put(group(at(cyl(0.064, 0.064, 0.004, FLAT('#4a2412', 0.9), 11), 0, -0.006, 0), cyl(0.058, 0.06, 0.016, F('#5c3019', 0.9), 26)), 0.016); }
    else if (k === 'cheese' || k === 'swiss') { const c = rbox(0.106, 0.004, 0.106, 0.0018, mat(k === 'swiss' ? '#efd27a' : '#f29a00', { rough: 0.35, clearcoat: 0.3 })); c.rotation.y = 0.75; put(c, 0.004); }
    else if (k === 'lettuce') put(rot(cyl(0.064, 0.062, 0.006, FLAT('#4f9a25', 0.7), 9), 0.04, 0.3, 0), 0.006);
    else if (k === 'tomato') put(cyl(0.049, 0.049, 0.008, F('#c8160e', 0.35), 20), 0.008);
    else if (k === 'onion') put(group(at(torus(0.035, 0.003, F('#e8d7ef', 0.4), 6, 20), 0, 0, 0), at(torus(0.024, 0.003, F('#d9b8e6', 0.4), 6, 18), 0.01, 0, 0.008)).rotateX(PI / 2), 0.004);
    else if (k === 'pickles') { const pg = group(); for (let i = 0; i < 4; i++) pg.add(at(cyl(0.014, 0.014, 0.003, F('#7a9a2f', 0.5), 12), Math.cos(i * 1.7) * 0.028, 0, Math.sin(i * 1.7) * 0.028)); put(pg, 0.003); }
    else if (k === 'bacon') {
      const bg2 = group();
      for (const z of [-0.016, 0.016]) { const b = tube([[-0.07, 0, z], [-0.035, 0.004, z + 0.004], [0, 0, z], [0.035, 0.004, z - 0.004], [0.07, 0, z]], 0.006, F('#9c3522', 0.6), 20, 6); b.scale.y = 0.45; bg2.add(b); }
      put(bg2, 0.006);
    } else if (k === 'mushroom') { const mg = group(); for (let i = 0; i < 6; i++) { const s = sph(0.014, F('#6e4a2c', 0.5), 10, 6); s.scale.set(1, 0.32, 0.8); mg.add(at(s, Math.cos(i * 1.05) * 0.03, 0, Math.sin(i * 1.05) * 0.03)); } put(mg, 0.006); }
    else if (k === 'avocado') { const ag = group(); for (let i = 0; i < 3; i++) { const s = capsule(0.01, 0.05, F('#9bc53d', 0.45)); s.rotation.z = PI / 2; s.scale.set(1, 1, 0.45); ag.add(at(s, 0, 0, -0.022 + i * 0.022)); } put(ag, 0.008); }
    else if (k === 'veggie') put(cyl(0.056, 0.058, 0.02, FLAT('#7a4a2a', 0.95), 14), 0.02);
    else if (k === 'chicken' || k === 'hotchicken') { const s = sph(0.07, mat('#ffffff', { map: speckTex(k, k === 'hotchicken' ? '#a3280c' : '#c47a2a', k === 'hotchicken' ? ['#7a1a06', '#d4501f', '#5c1404'] : ['#a35e1c', '#e2a24f'], 90, 3, 2), rough: 0.6, clearcoat: k === 'hotchicken' ? 0.5 : 0, flat: true }), 14, 8); s.scale.set(1.1, 0.26, 0.92); s.rotation.y = 0.4; put(s, 0.034); }
    else if (k === 'slaw') { const s = sph(0.05, F('#e8edd0', 0.8), 12, 6); s.scale.set(1, 0.18, 1); put(s, 0.01); }
    else if (k === 'sauce') put(cyl(0.05, 0.052, 0.003, GL('#f08a24'), 20), 0.003);
  }
  const top = lathe([[0.001, 0], [0.056, 0], [0.058, 0.01], [0.05, 0.026], [0.03, 0.038], [0.001, 0.04]], bunM, 28);
  at(top, 0, y, 0); g.add(top);
  const topG = group(top);
  if (seeds) for (let i = 0; i < 10; i++) { const a = i * 2.4, rr = 0.012 + (i % 3) * 0.012; const s = sph(0.0028, F('#f7ecd0', 0.6), 6, 4); s.scale.y = 0.45; topG.add(at(s, Math.cos(a) * rr, y + 0.04 - rr * rr * 4.2, Math.sin(a) * rr)); }
  g.add(topG);
  // eat from the top down
  bite(topG, 0);
  const n = parts.length;
  parts.forEach((p, i) => bite(p, i === 0 ? 50 : n - i));
  return g;
}
function friesCarton({ color = '#c8102e', label = 'SMASH', n = 16, fry = '#e9a52c', seed = 2 }) {
  const g = new THREE.Group();
  const tex = faceLabel4(`fries:${label}:${color}`, color, '#ffc93c', label);
  const cg = labeledCup({ rb: 0.042, rt: 0.058, h: 0.095, map: tex, inner: color, square: true }); cg.scale.z = 0.6; g.add(cg);
  const rnd = seeded(seed);
  const fm = F(fry, 0.7), fm2 = F('#d98a1c', 0.7);
  for (let i = 0; i < n; i++) {
    const f = box(0.0075, 0.1 + rnd() * 0.025, 0.0075, i % 3 ? fm : fm2);
    f.rotation.set((rnd() - 0.5) * 0.2, rnd() * 2, (rnd() - 0.5) * 0.3);
    at(f, (rnd() - 0.5) * 0.046, 0.1 + rnd() * 0.012, (rnd() - 0.5) * 0.018);
    g.add(bite(f, i % 5));
  }
  return g;
}
function onionRings() {
  const g = group(tray({ w: 0.15, d: 0.11, h: 0.03, m: FLAT('#f4ede1', 0.9) }));
  g.add(at(liner(0.13, 0.09, checkerTex('#e63946', '#fff7ec', 6)), 0, 0.004, 0));
  const m = FLAT('#c9822f', 0.95), m2 = FLAT('#d9973f', 0.95);
  const spots = [[-0.03, 0.016, -0.015, 0.25], [0.03, 0.016, -0.012, -0.2], [0, 0.017, 0.022, 0.1], [-0.012, 0.034, -0.004, 0.5], [0.022, 0.035, 0.012, -0.45], [-0.035, 0.03, 0.025, 0.9]];
  spots.forEach(([x, y, z, t], i) => { const r = torus(0.026, 0.0105, i % 2 ? m : m2, 7, 18); r.rotation.set(PI / 2 + t, 0, t * 0.5); g.add(bite(at(r, x, y, z), i)); });
  g.add(bite(at(dipCup('#c1121f', 0.018), 0.055, 0.004, 0.035), 9));
  return g;
}

// =================================================================== pizza (Slice House)
function pizzaBox({ print = '#c1121f', label = 'SLICE HOUSE', sub = 'NY STYLE · SINCE 1987', w = 0.37, open = true }) {
  const g = new THREE.Group();
  const cb = mat('#d9b68a', { rough: 0.92 });
  const hh = 0.042;
  g.add(at(box(w, 0.004, w, cb), 0, 0.002, 0));
  for (const s of [-1, 1]) { g.add(at(box(w, hh, 0.004, cb), 0, hh / 2, s * (w / 2 - 0.002))); g.add(at(box(0.004, hh, w, cb), s * (w / 2 - 0.002), hh / 2, 0)); }
  if (open) {
    const lid = new THREE.Group(); lid.position.set(0, hh, -w / 2);
    lid.add(at(box(w, 0.004, w, cb), 0, 0, w / 2));
    const d = decal(w * 0.9, w * 0.9, `food:pizzalid:${label}:${print}`, (ctx, W, H) => {
      ctx.fillStyle = '#f2e3c6'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = print; ctx.lineWidth = 8; ctx.strokeRect(12, 12, W - 24, H - 24);
      ctx.fillStyle = print; ctx.beginPath(); ctx.arc(W / 2, H * 0.38, W * 0.2, 0, 7); ctx.fill();
      ctx.font = `${W * 0.22}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🍕', W / 2, H * 0.39);
      ctx.font = `900 ${W * 0.1}px ${FONT}`; fitText(ctx, label, W / 2, H * 0.7, W * 0.8);
      ctx.font = `700 ${W * 0.05}px ${FONT}`; fitText(ctx, sub, W / 2, H * 0.8, W * 0.8);
    }, { tw: 256, th: 256 });
    d.rotation.x = PI / 2; at(d, 0, -0.0025, w / 2);
    lid.add(d);
    lid.rotation.x = -1.95;
    g.add(lid);
  }
  return g;
}
const PIZZA = {
  pepperoni: { cheese: '#f0a830', tops: [['pep', '#a3150c'], ['pep', '#8f1209']] },
  margherita: { cheese: '#c42a14', tops: [['mozz', '#fbf6ea'], ['basil', '#1f6b25']] },
  veggie: { cheese: '#eeaa38', tops: [['pepper', '#3f9b3a'], ['olive', '#1b1b1b'], ['mush', '#a77b56'], ['pepper', '#d63a24']] },
  bbq: { cheese: '#e8b04a', tops: [['chick', '#c98a4a'], ['onion', '#9b4f96']] },
};
// whole pizza; every slice is its own bite group
export function pizzaPie({ style = 'pepperoni', r = 0.16, slices = 8, y = 0, crust = '#b8682a' }) {
  const S = PIZZA[style];
  const g = new THREE.Group();
  const L = PI * 2 / slices, gap = 0.012;
  const baseM = F(crust, 0.75), cheeseM = mat(S.cheese, { rough: 0.45, clearcoat: 0.25 });
  for (let i = 0; i < slices; i++) {
    const s = new THREE.Group();
    s.add(slab(sector(r - 0.004, gap, L - gap, 6), 0.006, baseM, y));
    s.add(slab(sector(r - 0.014, gap + 0.01, L - gap - 0.01, 6), 0.004, cheeseM, y + 0.007));
    s.add(slab(sector(r, gap, L - gap, 6, r - 0.016), 0.01, baseM, y, 0.004));
    S.tops.forEach(([k, c], j) => {
      const a = L * (j % 2 ? 0.66 : 0.34), rr = r * (j % 2 ? 0.66 : 0.38) + (j > 1 ? 0.03 : 0);
      let t;
      if (k === 'pep') t = cyl(0.017, 0.017, 0.003, mat(c, { rough: 0.45, clearcoat: 0.3 }), 16);
      else if (k === 'mozz') { t = sph(0.018, F(c, 0.5), 12, 6); t.scale.y = 0.25; }
      else if (k === 'basil') { t = sph(0.016, F(c, 0.5), 10, 6); t.scale.set(1.5, 0.15, 0.8); t.rotation.y = a; }
      else if (k === 'pepper') { t = torus(0.008, 0.0025, F(c, 0.4), 6, 12, PI * 1.4); t.rotation.x = PI / 2; }
      else if (k === 'olive') { t = torus(0.006, 0.0028, F(c, 0.3), 6, 12); t.rotation.x = PI / 2; }
      else if (k === 'mush') { t = sph(0.011, F(c, 0.6), 10, 6); t.scale.set(1, 0.25, 0.8); }
      else if (k === 'chick') { t = rbox(0.016, 0.008, 0.012, 0.003, F(c, 0.7)); t.rotation.y = a * 3; }
      else { t = torus(0.01, 0.002, F(c, 0.4), 6, 14, PI); t.rotation.x = PI / 2; }
      const [px, , pz] = polar(a, rr);
      s.add(at(t, px, y + 0.0158, pz));
    });
    s.rotation.y = i * L;
    g.add(bite(s, i));
  }
  return g;
}
function pizzaInBox(style, print, label) {
  const g = pizzaBox({ print, label });
  const p = pizzaPie({ style, y: 0.004 });
  g.add(p);
  return g;
}
function garlicKnots() {
  const g = group(tray({ w: 0.16, d: 0.12, h: 0.035 }));
  g.add(at(liner(0.14, 0.1, checkerTex('#2a9d8f', '#fff7ec', 6)), 0, 0.004, 0));
  const tex = speckTex('knots', '#d18a35', ['#2f6b1f', '#f3d9a0', '#4d8f2a'], 90, 2.2);
  const m = mat('#ffffff', { map: tex, rough: 0.55 });
  [[-0.035, -0.02], [0, -0.025], [0.035, -0.018], [-0.03, 0.02], [0.005, 0.018], [0.038, 0.024]].forEach(([x, z], i) => {
    const k = group(rot(torus(0.012, 0.0072, m, 8, 16), PI / 2, 0, 0), rot(torus(0.011, 0.0068, m, 8, 16), 0.3, 0, 0), at(sph(0.0085, m, 10, 8), 0, 0.006, 0));
    k.rotation.y = i * 1.3;
    g.add(bite(at(k, x, 0.016, z), i));
  });
  g.add(at(dipCup('#b8261a', 0.019), -0.065, 0.004, 0.045));
  return g;
}
function cannoli() {
  const g = group(plate({ r: 0.1 }));
  const shellM = mat('#c98a45', { rough: 0.75 });
  const cream = F('#fbf3e3', 0.6), chip = F('#3b2314', 0.5), pist = F('#8fbf4d', 0.6);
  const prof = [[0.0145, 0], [0.012, 0.015], [0.0108, 0.045], [0.012, 0.075], [0.0145, 0.09]];
  [[-0.025, 0.55, 0.027], [0.025, -0.4, 0.027], [0, 0.1, 0.053]].forEach(([z, ry, y], i) => {
    const c = new THREE.Group();
    c.add(at(rot(lathe(prof, mat('#c98a45', { rough: 0.75, side: THREE.DoubleSide }), 18), 0, 0, PI / 2), 0.045, 0, 0));
    for (const s of [-1, 1]) {
      const e = sph(0.0118, cream, 12, 10); e.scale.x = 0.55; c.add(at(e, s * 0.047, 0, 0));
      c.add(at(sph(0.003, i === 1 ? pist : chip, 6, 4), s * 0.053, 0.004, 0.002));
    }
    c.rotation.y = ry; c.position.set(0, y, z);
    g.add(bite(c, i));
  });
  void shellM;
  return g;
}

// =================================================================== sushi & Japanese (Koi Sushi Bar)
function fishTex(key, base, line) {
  return TX(`fish:${key}`, 128, 64, (ctx, W, H) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = line; ctx.lineWidth = 3;
    for (let x = -H; x < W; x += 16) { ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + H * 0.4, H * 0.5, x + H * 0.9, 0); ctx.stroke(); }
  });
}
function makiTop(key, rice, nori, fills) {
  return TX(`maki:${key}`, 128, 128, (ctx, W, H) => {
    ctx.fillStyle = rice; ctx.fillRect(0, 0, W, H);
    const rnd = seeded(5);
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 4, 2, rnd() * 3, 0, 7); ctx.fill(); }
    if (nori) { ctx.strokeStyle = nori; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.3, 0, 7); ctx.stroke(); }
    fills.forEach(([c, x, y, r]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(W * x, H * y, W * r, 0, 7); ctx.fill(); });
  });
}
function nigiri(fish, y = 0) {
  const g = new THREE.Group();
  g.add(at(rbox(0.046, 0.02, 0.022, 0.009, F('#f7f4ec', 0.9)), 0, y + 0.01, 0));
  const f = rbox(0.058, 0.008, 0.028, 0.0038, mat('#ffffff', { map: fish, rough: 0.3, clearcoat: 0.5 }));
  f.rotation.z = 0.06; g.add(at(f, 0, y + 0.023, 0));
  return g;
}
function maki(top, side, r = 0.016, h = 0.022) {
  return cyl(r, r, h, [mat(side, { rough: side === '#f4f1e8' ? 0.9 : 0.5 }), mat('#ffffff', { map: top, rough: 0.7 }), mat(side, { rough: 0.7 })], 20);
}
function geta(w = 0.28, d = 0.12) {
  const wood = MAT.wood('#c49a6c');
  return group(at(rbox(w, 0.016, d, 0.003, wood), 0, 0.024, 0), at(box(0.018, 0.016, d * 0.92, wood), -w * 0.32, 0.008, 0), at(box(0.018, 0.016, d * 0.92, wood), w * 0.32, 0.008, 0));
}
function wasabiGinger(g, x, y, z) {
  const w = sph(0.011, F('#9cc75a', 0.8), 10, 8); w.scale.y = 0.8; g.add(at(w, x, y + 0.008, z));
  for (let i = 0; i < 3; i++) { const p = sph(0.012, mat('#f6c2b4', { rough: 0.4, opacity: 0.9, transparent: true }), 10, 6); p.scale.set(1, 0.25, 0.7); p.rotation.z = 0.3 * i; g.add(at(p, x + 0.025, y + 0.004 + i * 0.003, z + (i - 1) * 0.006)); }
}
function sushiPlatter() {
  const g = geta(0.3, 0.13);
  const salmon = fishTex('salmon', '#ff5a1f', 'rgba(255,235,215,0.8)');
  const tuna = fishTex('tuna', '#a8102a', 'rgba(255,170,180,0.35)');
  const ebi = fishTex('ebi', '#ff7b3a', 'rgba(255,255,255,0.95)');
  const tops = [salmon, salmon, tuna, ebi];
  tops.forEach((t, i) => { const n = nigiri(t, 0.032); n.rotation.y = 0.15; g.add(bite(at(n, -0.11 + i * 0.05, 0, -0.025), i)); });
  const mt = makiTop('tekka', '#f7f4ec', null, [['#c22a3f', 0.5, 0.5, 0.17]]);
  const mk = makiTop('kappa', '#f7f4ec', null, [['#6fa83a', 0.5, 0.5, 0.15], ['#d8efb0', 0.5, 0.5, 0.07]]);
  for (let i = 0; i < 4; i++) g.add(bite(at(maki(i % 2 ? mk : mt, '#1d2a1c'), -0.085 + i * 0.036, 0.043, 0.032), 4 + i));
  wasabiGinger(g, 0.1, 0.032, 0.03);
  return g;
}
function californiaRoll() {
  const g = new THREE.Group();
  g.add(at(rbox(0.2, 0.012, 0.11, 0.004, mat('#151515', { rough: 0.4 })), 0, 0.006, 0));
    const side = mat('#ffffff', { map: speckTex('tobiko', '#f4f1e8', ['#f2762e', '#f59a3a'], 90, 2), rough: 0.8 });
  const top = makiTop('cali', '#f4f1e8', '#1d2a1c', [['#f05d4f', 0.42, 0.45, 0.09], ['#9bc53d', 0.58, 0.47, 0.08], ['#e7f2c8', 0.5, 0.6, 0.06]]);
  for (let i = 0; i < 8; i++) {
    const m = cyl(0.018, 0.018, 0.022, [side, mat('#ffffff', { map: top, rough: 0.7 }), side], 20);
    const row = Math.floor(i / 4), col = i % 4;
    g.add(bite(at(m, -0.078 + col * 0.037, 0.026, -0.02 + row * 0.04), i));
  }
  wasabiGinger(g, 0.062, 0.014, 0.0);
  return g;
}
function misoSoup() {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.03, 0], [0.032, 0.008], [0.05, 0.02], [0.058, 0.055], [0.055, 0.056], [0.046, 0.022], [0.03, 0.008], [0.001, 0.008]], mat('#2b1110', { rough: 0.25, clearcoat: 0.9 }), 32));
  g.add(at(torus(0.0565, 0.0018, mat('#b3261e', { rough: 0.3, clearcoat: 0.8 }), 6, 36), 0, 0.0555, 0).rotateX(PI / 2));
  g.add(bite(at(cyl(0.053, 0.04, 0.03, mat('#c79a4b', { rough: 0.3, opacity: 0.95, transparent: true }), 28), 0, 0.034, 0), 9));
  const tofu = F('#fbf7ec', 0.6), wak = F('#24401f', 0.5), sc = F('#6fbf4a', 0.5);
  [[-0.015, 0.01], [0.012, -0.014], [0.02, 0.016], [-0.02, -0.018]].forEach(([x, z], i) => g.add(bite(at(rot(box(0.01, 0.008, 0.01, tofu), 0, i, 0), x, 0.049, z), i)));
  for (let i = 0; i < 3; i++) { const w = sph(0.009, wak, 8, 6); w.scale.set(1.6, 0.2, 0.7); w.rotation.y = i * 2; g.add(bite(at(w, Math.cos(i * 2.1) * 0.03, 0.05, Math.sin(i * 2.1) * 0.03), i)); }
  for (let i = 0; i < 5; i++) g.add(bite(at(rot(torus(0.003, 0.0012, sc, 5, 10), PI / 2, 0, 0), Math.cos(i * 1.3) * 0.012, 0.05, Math.sin(i * 1.3) * 0.012), 0));
  return g;
}
function edamame() {
  const g = group(bowlShell(0.07, 0.045, MAT.ceramic('#2e4c6d')));
  const rnd = seeded(8);
  const pod = F('#4f8f1f', 0.55), pod2 = F('#62a32a', 0.55);
  for (let i = 0; i < 12; i++) {
    const p = capsule(0.0068, 0.032, i % 2 ? pod : pod2); p.scale.z = 0.7;
    p.rotation.set(PI / 2 + (rnd() - 0.5) * 0.6, 0, rnd() * PI);
    const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * 0.035;
    g.add(bite(at(p, Math.cos(a) * rr, 0.04 + (0.035 - rr) * 0.5 + (i > 7 ? 0.01 : 0), Math.sin(a) * rr), i % 6));
  }
  for (let i = 0; i < 6; i++) g.add(at(box(0.0025, 0.0025, 0.0025, F('#ffffff', 0.3)), Math.cos(i * 2) * 0.02, 0.062, Math.sin(i * 2) * 0.02));
  return g;
}
function hanamiDango() {
  const g = new THREE.Group();
  g.add(at(rbox(0.2, 0.008, 0.09, 0.003, mat('#efe3cf', { rough: 0.6 })), 0, 0.004, 0));
  const cols = ['#f3a6bd', '#fbf6ee', '#9ccc65'];
  [[-0.022, 0.25], [0.022, 0.08]].forEach(([z, ry], k) => {
    const s = new THREE.Group();
    s.add(at(rot(cyl(0.002, 0.002, 0.17, F('#d8b77e', 0.7), 6), 0, 0, PI / 2), 0, 0, 0));
    cols.forEach((c, i) => s.add(bite(at(sph(0.0155, mat(c, { rough: 0.55, clearcoat: 0.2 }), 18, 12), -0.03 + i * 0.031, 0, 0), k * 3 + i)));
    s.position.set(0, 0.024, z); s.rotation.y = ry;
    g.add(s);
  });
  const leaf = sph(0.02, F('#5a8f3d', 0.5), 10, 6); leaf.scale.set(1.8, 0.12, 0.8); leaf.rotation.y = 0.6;
  g.add(at(leaf, 0.07, 0.01, 0.03));
  return g;
}

export { pizzaBox };

// =================================================================== noodles (Noodle Nook)
function narutoTex() {
  return TX('naruto', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#fbf8f2'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e8578a'; ctx.lineWidth = 7; ctx.beginPath();
    for (let t = 0; t < 14; t += 0.1) { const r = 4 + t * 3.4; const x = W / 2 + Math.cos(t) * r, y = H / 2 + Math.sin(t) * r; t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  });
}
// a deep noodle bowl; returns { g, y } where y is the broth surface
export function noodleBowl({ r = 0.1, h = 0.078, outer = '#1f1f1f', rim = '#b3261e', broth = '#e9d3a6', brothOpacity = 1 }) {
  const g = group(lathe([[0.001, 0], [r * 0.42, 0], [r * 0.45, 0.01], [r * 0.9, h * 0.75], [r, h], [r * 0.95, h], [r * 0.86, h * 0.75], [r * 0.4, 0.016], [0.001, 0.016]], mat(outer, { rough: 0.3, clearcoat: 0.7 }), 40));
  if (rim) g.add(at(rot(torus(r * 0.975, 0.0025, mat(rim, { rough: 0.3, clearcoat: 0.6 }), 6, 48), PI / 2, 0, 0), 0, h - 0.0015, 0));
  const y = h * 0.82;
  const b = cyl(r * 0.885, r * 0.42, y - 0.016, brothOpacity < 1 ? mat(broth, { rough: 0.15, opacity: brothOpacity, transparent: true }) : mat(broth, { rough: 0.25 }), 36);
  g.add(bite(at(b, 0, 0.016 + (y - 0.016) / 2, 0), 20));
  return { g, y };
}
function ramenEgg(x, y, z, ry = 0) {
  const e = new THREE.Group();
  const w = hemi(0.017, F('#fbf6ea', 0.35)); w.rotation.x = PI; e.add(w);
  e.add(at(cyl(0.0168, 0.0168, 0.001, F('#f7f1e3', 0.4), 20), 0, 0.0005, 0));
  e.add(at(cyl(0.0095, 0.0095, 0.002, mat('#f08c1a', { rough: 0.2, clearcoat: 0.8 }), 16), 0, 0.0015, 0));
  e.scale.set(1.3, 1, 1); e.rotation.set(-0.2, ry, 0.15);
  return at(e, x, y + 0.006, z);
}
function chashu(x, y, z, t = 0) {
  const c = group(cyl(0.028, 0.028, 0.006, F('#7a3f22', 0.6), 22), at(cyl(0.023, 0.023, 0.0064, F('#d9a38a', 0.55), 22), 0, 0, 0));
  c.rotation.set(0.25 + t, t * 2, -0.1);
  return at(c, x, y + 0.004, z);
}
function ramen({ broth = '#ead7ad', toppings = 'tonkotsu' }) {
  const { g, y } = noodleBowl({ broth });
  g.add(...noodles(6, { w: 0.11, d: 0.07, y: y + 0.001, r: 0.0026, m: F('#f2d27a', 0.45), seed: 4 }).map((n, i) => bite(at(n, 0, 0, 0.012), 10 + (i % 3))));
  g.children.slice(-6).forEach((n) => { n.rotation.y = 0.5; });
  const sc = F('#5cb340', 0.5);
  if (toppings === 'tonkotsu') {
    g.add(bite(ramenEgg(0.04, y, 0.03, 0.3), 3), bite(ramenEgg(0.058, y, -0.004, -0.4), 4));
    g.add(bite(chashu(-0.035, y, 0.035, 0), 5), bite(chashu(-0.05, y, 0.002, 0.15), 6));
    const nori = box(0.045, 0.06, 0.0012, F('#1b2a1d', 0.5)); nori.rotation.set(-0.35, 0, 0);
    g.add(bite(at(nori, 0.0, y + 0.018, -0.06), 2));
    const nt = narutoTex();
    g.add(bite(at(rot(cyl(0.014, 0.014, 0.004, [F('#fbf8f2', 0.5), mat('#fff', { map: nt, rough: 0.5 }), F('#fbf8f2', 0.5)], 20), 0.2, 0, 0.1), 0.012, y + 0.004, 0.05), 1));
  } else {
    // spicy miso: chili oil, corn, sprouts, ground pork, half egg
    for (let i = 0; i < 5; i++) { const o = cyl(0.008 + (i % 3) * 0.003, 0.008, 0.0006, mat('#d4380d', { rough: 0.1, opacity: 0.8, transparent: true }), 14); g.add(at(o, Math.cos(i * 1.9) * 0.05, y + 0.0007, Math.sin(i * 1.9) * 0.05)); }
    const corn = F('#f6c431', 0.45);
    for (let i = 0; i < 8; i++) g.add(bite(at(rbox(0.006, 0.005, 0.006, 0.002, corn), 0.03 + (i % 3) * 0.007, y + 0.004, 0.025 + Math.floor(i / 3) * 0.007), 3));
    const pork = sph(0.02, FLAT('#6b3a22', 0.9), 9, 6); pork.scale.set(1.2, 0.35, 1); g.add(bite(at(pork, -0.035, y + 0.004, 0.025), 5));
    const sp = F('#f3efd8', 0.5);
    for (let i = 0; i < 4; i++) g.add(bite(at(rot(cyl(0.0015, 0.0015, 0.04, sp, 5), PI / 2, i * 0.4, 0.3), -0.03, y + 0.006, -0.03 + i * 0.006), 4));
    g.add(bite(ramenEgg(0.045, y, -0.025, 0.8), 6));
  }
  for (let i = 0; i < 7; i++) g.add(bite(at(rot(torus(0.0035, 0.0013, sc, 5, 10), PI / 2, 0, 0), Math.cos(i * 2.3) * 0.022, y + 0.008, Math.sin(i * 2.3) * 0.022), 0));
  const cs = chopsticks(0.24); cs.rotation.y = -0.35; g.add(at(cs, 0.02, 0.083, 0));
  return g;
}
function udon() {
  const { g, y } = noodleBowl({ broth: '#a8692c', outer: '#efe4d0', rim: '#3a5a8c', brothOpacity: 0.92 });
  g.add(...noodles(5, { w: 0.12, d: 0.075, y: y + 0.002, r: 0.0055, m: F('#f7f1e1', 0.55), seed: 9, waves: 2.5 }).map((n, i) => bite(n, 10 + (i % 3))));
  // two tempura shrimp leaning on the rim
  [[0.02, -0.5], [0.045, -0.2]].forEach(([z, ry], i) => {
    const s = new THREE.Group();
    const body = tube([[-0.05, 0, 0], [-0.015, 0.006, 0], [0.025, 0.004, 0], [0.045, -0.006, 0]], 0.011, FLAT('#d99a3f', 0.95), 16, 9);
    s.add(body);
    const tail = cone(0.011, 0.02, F('#e3471c', 0.5), 6); tail.rotation.z = -PI / 2 - 0.3; s.add(at(tail, 0.056, -0.008, 0));
    s.rotation.set(0, ry, 0.35); s.position.set(-0.01, y + 0.02, z - 0.03);
    g.add(bite(s, 3 + i));
  });
  const fc = group(cyl(0.012, 0.012, 0.004, F('#fbf8f2', 0.5), 18), at(torus(0.012, 0.0016, F('#e8578a', 0.5), 5, 20), 0, 0, 0).rotateX(PI / 2));
  g.add(bite(at(rot(fc, 0.2, 0, 0), -0.045, y + 0.003, 0.03), 1));
  const sc = F('#5cb340', 0.5);
  for (let i = 0; i < 6; i++) g.add(bite(at(rot(torus(0.0035, 0.0013, sc, 5, 10), PI / 2, 0, 0), -0.03 + Math.cos(i * 2.3) * 0.012, y + 0.006, -0.025 + Math.sin(i * 2.3) * 0.012), 0));
  return g;
}
function pho() {
  const { g, y } = noodleBowl({ r: 0.11, h: 0.072, broth: '#b9823d', outer: '#fbfaf7', rim: '#2f6fa8', brothOpacity: 0.85 });
  g.add(...noodles(5, { w: 0.12, d: 0.08, y: y - 0.002, r: 0.002, m: F('#fbf8f0', 0.4), seed: 12 }).map((n, i) => bite(n, 10 + (i % 3))));
  const beef = F('#a8553f', 0.6);
  for (let i = 0; i < 5; i++) { const b = sph(0.022, beef, 12, 6); b.scale.set(1.2, 0.07, 0.75); b.rotation.y = i * 1.2; g.add(bite(at(b, -0.03 + (i % 3) * 0.022, y + 0.002, -0.025 + Math.floor(i / 3) * 0.035 + (i % 2) * 0.006), 3 + (i % 3))); }
  const basil = F('#2e7d32', 0.45);
  for (let i = 0; i < 4; i++) { const l = sph(0.012, basil, 10, 6); l.scale.set(1.6, 0.14, 0.8); l.rotation.y = i * 0.9; g.add(bite(at(l, 0.035 + (i % 2) * 0.012, y + 0.005, 0.02 - i * 0.012), 1)); }
  const jal = F('#4caf50', 0.4);
  for (let i = 0; i < 3; i++) g.add(bite(at(rot(torus(0.006, 0.0022, jal, 6, 12), PI / 2, 0, 0), -0.04 + i * 0.012, y + 0.004, 0.045), 0));
  g.add(bite(at(rot(citrusWedge(0.02), 0, 0.8, 0), 0.06, y - 0.004, 0.045), 2));
  const sp = spoon(0.14, '#fbfaf7'); sp.rotation.set(0, 0.6, 0.35); g.add(at(sp, 0.07, y + 0.02, -0.02));
  return g;
}
function gyoza() {
  const g = new THREE.Group();
  g.add(at(rbox(0.22, 0.012, 0.11, 0.005, MAT.ceramic('#25303b')), 0, 0.006, 0));
  const skin = F('#efdcae', 0.5), crisp = FLAT('#a85a17', 0.8);
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Group();
    const top = sph(0.021, skin, 14, 10); top.scale.set(0.75, 0.62, 1.45); d.add(at(top, 0, 0.012, 0));
    const bot = sph(0.021, crisp, 12, 6); bot.scale.set(0.98, 0.3, 1.6); d.add(at(bot, 0, 0.006, 0));
    const pleat = torus(0.024, 0.0022, skin, 5, 14, PI * 0.8); pleat.rotation.set(0, PI / 2, PI * 0.1); pleat.scale.set(1, 0.75, 1);
    d.add(at(pleat, -0.002, 0.009, 0));
    d.position.set(-0.08 + i * 0.026, 0.012, -0.01); d.rotation.y = -0.15;
    g.add(bite(d, i));
  }
  const dish = group(lathe([[0.001, 0], [0.024, 0], [0.028, 0.012], [0.025, 0.012], [0.021, 0.003], [0.001, 0.003]], MAT.ceramic('#fbfaf7'), 24), at(cyl(0.023, 0.02, 0.003, mat('#4a2511', { rough: 0.1, clearcoat: 1 }), 20), 0, 0.007, 0));
  g.add(at(dish, 0.075, 0.012, 0.03));
  return g;
}

// =================================================================== Mexican (Taco Loco)
function tortillaTex(key, base, spot) { return speckTex(`tort:${key}`, base, [spot], 45, 3.5, 21); }
function taco({ shellCol = '#e9c27a', spot = '#b07a32', fillings = [], seed = 1 }) {
  const t = new THREE.Group();
  const s = shell(0.034, 0.11, mat('#ffffff', { map: tortillaTex(shellCol, shellCol, spot), rough: 0.75, side: THREE.DoubleSide }));
  s.scale.set(1, 1.35, 0.62); t.add(at(s, 0, 0.046, 0));
  const rnd = seeded(seed);
  fillings.forEach(([kind, c, n]) => {
    for (let i = 0; i < n; i++) {
      let m;
      if (kind === 'cube') m = rbox(0.013, 0.011, 0.012, 0.003, F(c, 0.6));
      else if (kind === 'leaf') { m = sph(0.008, F(c, 0.5), 8, 6); m.scale.set(1.2, 0.35, 0.9); }
      else if (kind === 'shred') { m = box(0.03, 0.0025, 0.0035, F(c, 0.6)); }
      else if (kind === 'fish') { m = capsule(0.011, 0.07, FLAT(c, 0.9)); m.rotation.z = PI / 2; m.scale.set(1, 1, 0.8); }
      else if (kind === 'drizzle') { m = tube([[-0.045, 0, 0], [-0.025, 0.002, 0.006], [-0.005, 0, -0.006], [0.015, 0.002, 0.006], [0.035, 0, -0.005], [0.048, 0, 0.003]], 0.0022, GL(c), 24, 5); }
      else m = sph(0.005, F(c, 0.5), 6, 5);
      if (kind !== 'fish' && kind !== 'drizzle') m.rotation.y = rnd() * PI;
      const x = kind === 'fish' || kind === 'drizzle' ? 0 : (rnd() - 0.5) * 0.085;
      const z = kind === 'fish' || kind === 'drizzle' ? 0 : (rnd() - 0.5) * 0.02;
      const y = kind === 'fish' ? 0.042 : kind === 'drizzle' ? 0.06 : 0.044 + rnd() * 0.01 + (kind === 'leaf' || kind === 'shred' || kind === 'dot' ? 0.008 : 0);
      t.add(at(m, x, y, z));
    }
  });
  return t;
}
function tacoTray(kind) {
  const g = group(tray({ w: 0.17, d: 0.15, h: 0.03, m: FLAT('#f3eee4', 0.9) }));
  g.add(at(liner(0.15, 0.13, checkerTex('#2a9d8f', '#fff7ec', 7)), 0, 0.004, 0));
  const pastor = [['cube', '#b8380f', 7], ['cube', '#f5b700', 3], ['dot', '#fbf6ee', 5], ['leaf', '#2d7a27', 6]];
  const fish = [['fish', '#c98428', 1], ['shred', '#6a1f7a', 7], ['shred', '#b8d77a', 4], ['drizzle', '#f7f2e6', 1], ['leaf', '#2d7a27', 4]];
  for (let i = 0; i < 3; i++) {
    const t = taco(kind === 'fish' ? { shellCol: '#ecd29a', spot: '#b9813f', fillings: fish, seed: i + 3 } : { shellCol: '#e0b25a', spot: '#9a5f22', fillings: pastor, seed: i + 7 });
    t.rotation.z = (i - 1) * 0.06; t.position.set(0, 0.004, -0.045 + i * 0.045);
    g.add(bite(t, i));
  }
  g.add(at(rot(citrusWedge(0.02), 0, 0.4, 0), 0.06, 0.004, 0.065));
  return g;
}
function burritoFillTex() {
  return TX('burritofill', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#f3e3bd'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.45, 0, 7); ctx.fill();
    const rnd = seeded(31);
    const cols = ['#6b3a1f', '#7a2e1c', '#f2f0e6', '#d4381c', '#4f8f31', '#f6c64a', '#3b2216'];
    for (let i = 0; i < 70; i++) { const a = rnd() * 7, r = Math.sqrt(rnd()) * W * 0.4; ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.ellipse(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, 5 + rnd() * 5, 3 + rnd() * 4, rnd() * 3, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#e9cf9a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.46, 0, 7); ctx.stroke();
  });
}
function burrito() {
  const g = new THREE.Group();
  g.add(at(liner(0.24, 0.16, checkerTex('#2a9d8f', '#fff7ec', 8)), 0, 0.001, 0));
  const tort = mat('#ffffff', { map: tortillaTex('flour', '#f1ddb0', '#cf9f5f'), rough: 0.75 });
  const cap = mat('#ffffff', { map: burritoFillTex(), rough: 0.7 });
  const foil = mat('#dfe3e8', { rough: 0.25, metal: 0.9, flat: true });
  const R = 0.034;
  [[-0.04, 0.1, 0], [0.04, -0.15, 1]].forEach(([z, ry, k]) => {
    const half = new THREE.Group();
    const front = cyl(R, R, 0.05, [tort, cap, cap], 22); front.rotation.z = -PI / 2; at(front, 0.025, 0, 0);
    const back = cyl(R, R, 0.055, [tort, cap, cap], 22); back.rotation.z = -PI / 2; at(back, -0.0275, 0, 0);
    const wrap = cyl(R + 0.0012, R + 0.0012, 0.045, foil, 10, undefined, true); wrap.rotation.z = -PI / 2; at(wrap, -0.035, 0, 0);
    const end = cone(R + 0.001, 0.02, foil, 10); end.rotation.z = PI / 2; at(end, -0.067, 0, 0);
    half.add(bite(front, k), bite(group(back, wrap, end), 2 + k));
    half.position.set(0, R + 0.002, z); half.rotation.set(0, ry, 0.12);
    g.add(half);
  });
  return g;
}
function quesadilla() {
  const g = group(plate({ r: 0.12, color: '#f7efe2' }));
  const tort = F('#e8c27c', 0.75), cheese = mat('#f6b93b', { rough: 0.35, clearcoat: 0.3 }), mark = F('#8a5420', 0.9);
  const L = PI / 2;
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Group();
    w.add(slab(sector(0.088, 0.04, L - 0.04, 8), 0.004, tort, 0.012));
    w.add(slab(sector(0.091, 0.05, L - 0.05, 8), 0.004, cheese, 0.0175));
    w.add(slab(sector(0.088, 0.04, L - 0.04, 8), 0.004, tort, 0.022));
    for (let k = 0; k < 2; k++) { const [x, , z] = polar(L / 2, 0.035 + k * 0.025); const b = box(0.04 - k * 0.006, 0.001, 0.004, mark); b.rotation.y = L / 2 + PI / 2 + 0.6; w.add(at(b, x, 0.0295, z)); }
    w.rotation.y = i * L + 0.2;
    g.add(bite(w, i));
  }
  g.add(at(dipCup('#fbf7ef', 0.02), 0.075, 0.012, 0.06), at(dipCup('#d63d1e', 0.02), -0.075, 0.012, 0.06));
  return g;
}
function nachos() {
  const g = group(tray({ w: 0.18, d: 0.14, h: 0.035, m: mat('#d62828', { rough: 0.5, flat: true }) }));
  g.add(at(liner(0.15, 0.115, checkerTex('#d62828', '#fff7ec', 8)), 0, 0.004, 0));
  const chip = F('#e8a92e', 0.6), chip2 = F('#d48f1f', 0.6);
  const rnd = seeded(17);
  const tri = [[0, 0.028], [-0.024, -0.014], [0.024, -0.014]];
  for (let i = 0; i < 18; i++) {
    const c = extrude(tri, 0.0018, i % 3 ? chip : chip2, 0.0008);
    const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * 0.055;
    c.rotation.set(-PI / 2 + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.6, rnd() * PI * 2);
    g.add(bite(at(c, Math.cos(a) * rr, 0.012 + (0.055 - rr) * 0.35 + rnd() * 0.012, Math.sin(a) * rr * 0.75), i % 6));
  }
  const ch = GL('#f2a51a');
  for (let i = 0; i < 6; i++) { const b = sph(0.016, ch, 12, 8); b.scale.set(1.2, 0.3, 1); g.add(bite(at(b, Math.cos(i * 1.1) * 0.03, 0.03 + (i % 2) * 0.006, Math.sin(i * 1.1) * 0.022), i % 6)); }
  const jal = F('#3f9b3a', 0.4);
  for (let i = 0; i < 5; i++) g.add(bite(at(rot(torus(0.007, 0.0025, jal, 6, 12), PI / 2 + 0.2, 0, 0), Math.cos(i * 1.6) * 0.025, 0.04, Math.sin(i * 1.6) * 0.018), i % 6));
  const sc = sph(0.016, F('#fbf8f2', 0.5), 12, 8); sc.scale.y = 0.6; g.add(bite(at(sc, 0.008, 0.044, 0.004), 5));
  const pico = F('#d63d1e', 0.5);
  for (let i = 0; i < 6; i++) g.add(bite(at(box(0.006, 0.005, 0.006, pico), -0.02 + (i % 3) * 0.012, 0.042, -0.012 + Math.floor(i / 3) * 0.02), i % 6));
  return g;
}
function churros() {
  const g = new THREE.Group();
  g.add(at(liner(0.2, 0.12, checkerTex('#e76f51', '#fff7ec', 8)), 0, 0.001, 0));
  const star = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2, r = i % 2 ? 0.0078 : 0.011; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const m = mat('#ffffff', { map: speckTex('cinsugar', '#b0682a', ['#f3dcae', '#7a3f12', '#fff3d6'], 140, 1.6), rough: 0.85 });
  [[-0.03, 0.08], [0, -0.05], [0.03, 0.12]].forEach(([z, ry], i) => {
    const c = extrude(star, 0.15, m, 0.001, undefined, 'churro');
    c.rotation.set(0, PI / 2 + ry, 0);
    g.add(bite(at(c, -0.02, 0.012, z), i));
  });
  const cup = group(lathe([[0.001, 0], [0.026, 0], [0.03, 0.04], [0.027, 0.04], [0.023, 0.003], [0.001, 0.003]], MAT.ceramic('#fbfaf7'), 24), at(cyl(0.027, 0.024, 0.004, GL('#3d2314'), 20), 0, 0.033, 0));
  g.add(at(cup, 0.075, 0.001, 0.02));
  return g;
}

// =================================================================== bowls & salads (Green Bowl)
export function kraftBowl(r = 0.09, h = 0.06) { return bowlShell(r, h, F('#c9a57a', 0.9)); }
function scatter(g, n, make, { cx = 0, cz = 0, rad = 0.02, y = 0, tag = 0, seed = 1, spin = true }) {
  const rnd = seeded(seed);
  for (let i = 0; i < n; i++) {
    const m = make(i); const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * rad;
    if (spin) m.rotation.y = rnd() * PI;
    g.add(bite(at(m, cx + Math.cos(a) * rr, y + rnd() * 0.004, cz + Math.sin(a) * rr), typeof tag === 'function' ? tag(i) : tag));
  }
}
function pokeBowl() {
  const g = group(kraftBowl(0.095, 0.06));
  const y = 0.052;
  g.add(bite(fill(0.085, 0.03, F('#f7f4ec', 0.95), 0.038), 9));
  const salmon = mat('#ffffff', { map: fishTex('salmon', '#f47b4f', 'rgba(255,240,225,0.75)'), rough: 0.35, clearcoat: 0.4 });
  scatter(g, 7, () => rbox(0.016, 0.013, 0.016, 0.003, salmon), { cx: -0.03, cz: -0.02, rad: 0.022, y: y + 0.006, tag: (i) => i % 3, seed: 2 });
  for (let i = 0; i < 4; i++) { const s = capsule(0.009, 0.04, F('#7fae2e', 0.45)); s.rotation.set(0, 0.6, PI / 2); s.scale.set(1, 1, 0.45); g.add(bite(at(s, 0.03 + i * 0.006, y + 0.006, -0.025 + i * 0.011), 3 + (i % 2))); }
  scatter(g, 9, () => sph(0.0065, F('#7cb342', 0.5), 8, 6), { cx: 0.025, cz: 0.035, rad: 0.016, y: y + 0.004, tag: 5, seed: 3 });
  scatter(g, 6, () => rbox(0.012, 0.01, 0.012, 0.002, F('#f59e00', 0.4)), { cx: -0.028, cz: 0.035, rad: 0.016, y: y + 0.005, tag: 6, seed: 4 });
  scatter(g, 8, () => box(0.022, 0.0025, 0.003, F('#4caf50', 0.4)), { cx: 0.0, cz: 0.0, rad: 0.012, y: y + 0.006, tag: 7, seed: 5 });
  g.add(bite(tube([[-0.05, y + 0.013, -0.01], [-0.03, y + 0.014, 0.01], [-0.01, y + 0.013, -0.012], [0.01, y + 0.014, 0.01], [0.03, y + 0.013, -0.008]], 0.0018, GL('#f77f3a'), 24, 5), 0));
  return g;
}
function caesarSalad() {
  const g = group(bowlShell(0.11, 0.05, MAT.ceramic('#fbfaf7')));
  const y = 0.03;
  const rom = [F('#3f8a1f', 0.55), F('#5ea52a', 0.55), F('#8cc24a', 0.55)];
  const rnd = seeded(14);
  for (let i = 0; i < 10; i++) {
    const l = sph(0.03, rom[i % 3], 12, 8); l.scale.set(1.5, 0.22, 0.6);
    const a = i / 10 * PI * 2, rr = 0.03 + (i % 2) * 0.025;
    l.rotation.set((rnd() - 0.5) * 0.6, -a + 0.4, (rnd() - 0.5) * 0.5);
    g.add(bite(at(l, Math.cos(a) * rr, y + 0.006 + (i % 3) * 0.004, Math.sin(a) * rr), 6 + (i % 3)));
  }
  const chicken = F('#d6a067', 0.65), grill = F('#7a4a22', 0.9);
  for (let i = 0; i < 4; i++) { const c = group(rbox(0.04, 0.008, 0.016, 0.003, chicken), at(box(0.04, 0.0012, 0.003, grill), 0, 0.0042, 0)); c.rotation.y = 0.5; g.add(bite(at(c, -0.02 + i * 0.012, y + 0.022, -0.01 + i * 0.012), 3 + (i % 3))); }
  scatter(g, 7, () => rbox(0.012, 0.012, 0.012, 0.003, FLAT('#d9a24f', 0.9)), { rad: 0.06, y: y + 0.02, tag: (i) => i % 3, seed: 6 });
  scatter(g, 6, () => box(0.014, 0.0012, 0.008, F('#f6efcf', 0.6)), { rad: 0.05, y: y + 0.03, tag: 0, seed: 7 });
  return g;
}
function acaiBowl() {
  const g = group(lathe([[0.001, 0], [0.04, 0], [0.075, 0.03], [0.088, 0.055], [0.083, 0.056], [0.07, 0.032], [0.038, 0.007], [0.001, 0.007]], FLAT('#6d4426', 0.85), 18));
  const y = 0.05;
  g.add(bite(fill(0.08, 0.03, F('#4a1f5c', 0.45), 0.036), 9));
  for (let i = 0; i < 5; i++) g.add(bite(at(rot(cyl(0.011, 0.011, 0.004, F('#f7e8b0', 0.5), 16), 0.15, 0, 0), -0.04 + i * 0.012, y + 0.004, -0.03 + i * 0.006), i % 3));
  for (let i = 0; i < 3; i++) { const s = cone(0.012, 0.022, F('#d62828', 0.4), 14); s.rotation.set(PI / 2, 0, i); g.add(bite(at(s, 0.03 + (i % 2) * 0.01, y + 0.008, -0.02 + i * 0.012), 3)); }
  scatter(g, 8, () => sph(0.0055, GL('#2b2d6e'), 8, 6), { cx: 0.03, cz: 0.03, rad: 0.014, y: y + 0.005, tag: 4, seed: 9 });
  scatter(g, 9, () => rbox(0.009, 0.006, 0.008, 0.002, FLAT('#c8923e', 0.9)), { cx: -0.025, cz: 0.025, rad: 0.018, y: y + 0.004, tag: (i) => 5 + (i % 2), seed: 10 });
  scatter(g, 5, () => box(0.012, 0.001, 0.005, F('#fbfaf3', 0.6)), { cx: 0, cz: 0, rad: 0.01, y: y + 0.01, tag: 0, seed: 11 });
  return g;
}
function wrapHalves({ tort = '#a5c96b', spiral = ['#f6efe0', '#4f8f31', '#d63d1e', '#e8c38a'] }) {
  const g = new THREE.Group();
  g.add(at(liner(0.18, 0.13, checkerTex('#52b788', '#fbf8f0', 8)), 0, 0.001, 0));
  const top = TX(`wrapspiral:${spiral.join()}`, 128, 128, (ctx, W, H) => {
    ctx.fillStyle = spiral[0]; ctx.fillRect(0, 0, W, H);
    for (let k = 1; k < spiral.length; k++) { ctx.strokeStyle = spiral[k]; ctx.lineWidth = 7; ctx.beginPath(); for (let t = 0; t < 12; t += 0.15) { const r = 6 + t * 4.3 + k * 2; const x = W / 2 + Math.cos(t + k) * r, yy = H / 2 + Math.sin(t + k) * r; t ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke(); }
    ctx.strokeStyle = tort; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.46, 0, 7); ctx.stroke();
  });
  const side = F(tort, 0.7);
  [[-0.033, 0.1], [0.033, -0.12]].forEach(([x, t], i) => {
    const h = cyl(0.03, 0.031, 0.075, [side, mat('#fff', { map: top, rough: 0.7 }), side], 22);
    h.rotation.set(t, 0, t * 0.8); g.add(bite(at(h, x, 0.0385, 0), i));
  });
  return g;
}

// =================================================================== Indian (Saffron Curry House)
export function thali({ curry = '#d4561a', chunks = '#b8521f', chunkShape = 'chicken', swirl = '#fbf3e6' }) {
  const steel = MAT.metal('#cfd3d8', 0.22);
  const g = group(lathe([[0.001, 0], [0.13, 0], [0.138, 0.016], [0.134, 0.017], [0.126, 0.004], [0.001, 0.004]], steel, 40));
  // curry katori
  const k = group(lathe([[0.001, 0], [0.04, 0], [0.052, 0.036], [0.049, 0.037], [0.037, 0.004], [0.001, 0.004]], steel, 28));
  k.add(bite(at(cyl(0.048, 0.039, 0.022, mat(curry, { rough: 0.35, clearcoat: 0.3 }), 24), 0, 0.019, 0), 8));
  for (let i = 0; i < 4; i++) {
    const c = chunkShape === 'paneer' ? rbox(0.014, 0.012, 0.014, 0.002, F('#fbf4e2', 0.6)) : rbox(0.016, 0.012, 0.014, 0.004, F(chunks, 0.7));
    c.rotation.y = i; k.add(bite(at(c, Math.cos(i * 1.6) * 0.018, 0.031, Math.sin(i * 1.6) * 0.018), 4 + i % 2));
  }
  k.add(bite(at(rot(torus(0.012, 0.002, F(swirl, 0.4), 5, 20, PI * 1.5), PI / 2, 0, 0), 0, 0.0315, 0), 4));
  for (let i = 0; i < 3; i++) { const l = sph(0.004, F('#3f8f3a', 0.5), 6, 4); l.scale.y = 0.3; k.add(bite(at(l, -0.01 + i * 0.01, 0.032, 0.012 - i * 0.008), 4)); }
  g.add(at(k, -0.05, 0.004, -0.035));
  // rice mound
  const rice = sph(0.045, mat('#ffffff', { map: speckTex('basmati', '#fbf8ef', ['#efe6cf', '#f6d36b'], 120, 1.6, 7), rough: 0.9 }), 20, 12, undefined); rice.scale.set(1, 0.45, 0.85);
  g.add(bite(at(rice, 0.055, 0.004, -0.03), 6));
  g.add(at(sph(0.004, F('#3f8f3a'), 6, 4), 0.055, 0.025, -0.03));
  // naan
  const naan = sph(0.06, mat('#ffffff', { map: speckTex('naan', '#efcf8f', ['#7a4a1f', '#a76a2c', '#e8b36a'], 40, 3.5, 5), rough: 0.8 }), 18, 10);
  naan.scale.set(1.2, 0.12, 0.62); naan.rotation.set(0.12, 0.25, 0);
  g.add(bite(at(naan, 0.0, 0.016, 0.065), 2));
  // pickle & raita
  g.add(at(dipCup('#c6461d', 0.016, '#cfd3d8'), -0.095, 0.004, 0.035), at(dipCup('#f3f3ea', 0.016, '#cfd3d8'), 0.095, 0.004, 0.035));
  return g;
}
function biryani() {
  const g = new THREE.Group();
  const clay = mat('#a4552c', { rough: 0.85 });
  g.add(lathe([[0.001, 0], [0.05, 0], [0.075, 0.035], [0.075, 0.06], [0.066, 0.075], [0.068, 0.08], [0.062, 0.08], [0.058, 0.074], [0.066, 0.06], [0.066, 0.036], [0.045, 0.008], [0.001, 0.008]], clay, 32));
  g.add(at(rot(torus(0.07, 0.003, mat('#e9c46a', { rough: 0.4, metal: 0.6 }), 6, 40), PI / 2, 0, 0), 0, 0.045, 0));
  const rice = sph(0.062, mat('#ffffff', { map: speckTex('biryani', '#f7efd8', ['#f2a71b', '#f6d36b', '#e07a1f', '#fbf8ef'], 160, 2, 13), rough: 0.9 }), 24, 12);
  rice.scale.set(1, 0.32, 1); g.add(bite(at(rice, 0, 0.07, 0), 9));
  const leg = group(capsule(0.014, 0.03, FLAT('#a8501f', 0.8)), at(cyl(0.004, 0.004, 0.022, F('#f3ead8', 0.5), 8), 0, 0.026, 0), at(sph(0.0055, F('#f3ead8', 0.5), 8, 6), 0, 0.038, 0));
  leg.rotation.set(0, 0, -0.9); g.add(bite(at(leg, -0.012, 0.087, 0.01), 3));
  g.add(bite(ramenEgg(0.025, 0.08, 0.018, 0.4), 2));
  scatter(g, 8, () => { const o = box(0.014, 0.0025, 0.003, F('#7a3e14', 0.7)); return o; }, { rad: 0.035, y: 0.088, tag: 0, seed: 21 });
  scatter(g, 4, () => { const l = sph(0.006, F('#3f8f3a', 0.5), 6, 4); l.scale.set(1.5, 0.3, 0.8); return l; }, { rad: 0.03, y: 0.09, tag: 1, seed: 22 });
  g.add(at(dipCup('#f3f3ea', 0.02), 0.095, 0, 0.04));
  return g;
}
function samosas() {
  const g = group(plate({ r: 0.115 }));
  const m = mat('#ffffff', { map: speckTex('samosa', '#d9a04c', ['#b97a2e', '#f0c072', '#a8692a'], 80, 2.4, 9), rough: 0.75, flat: true });
  [[-0.035, -0.02, 0.2], [0.03, -0.03, 1.4], [0, 0.035, 2.5]].forEach(([x, z, ry], i) => {
    const s = cone(0.04, 0.05, m, 3); s.rotation.set(0, ry, 0); s.scale.set(1, 1, 0.8);
    g.add(bite(at(s, x, 0.037, z), i));
  });
  g.add(at(dipCup('#4c8f3a', 0.02), 0.07, 0.012, 0.05), at(dipCup('#6b2b16', 0.02), 0.075, 0.012, -0.02));
  return g;
}
function naanBasket() {
  const g = group(lathe([[0.001, 0], [0.07, 0], [0.09, 0.045], [0.086, 0.046], [0.066, 0.005], [0.001, 0.005]], mat('#ffffff', { map: stripeTex('wicker', '#b07a3e', '#8a5a2a', 16, false), rough: 0.9 }), 28));
  g.children[0].scale.z = 0.7;
  g.add(at(liner(0.12, 0.08, checkerTex('#e9a03b', '#fff7ec', 6)), 0, 0.006, 0));
  const tex = speckTex('garlicnaan', '#efcf8f', ['#7a4a1f', '#3f8f3a', '#f8f1d7', '#a76a2c'], 70, 3, 8);
  for (let i = 0; i < 3; i++) {
    const n = sph(0.06, mat('#ffffff', { map: tex, rough: 0.75 }), 18, 10); n.scale.set(1.15, 0.13, 0.55);
    n.rotation.set(0.5 - i * 0.35, 0.2 * i, 0.25 * (i - 1));
    g.add(bite(at(n, -0.012 + i * 0.012, 0.03 + i * 0.006, -0.02 + i * 0.02), i));
  }
  return g;
}

// =================================================================== Chinese & Thai (Wok Star)
function bambooTex() { return stripeTex('bamboo', '#d8b26e', '#c39a55', 6, false); }
function dumplingSteamer() {
  const g = new THREE.Group();
  const bam = mat('#ffffff', { map: bambooTex(), rough: 0.8 });
  g.add(at(cyl(0.1, 0.1, 0.05, bam, 32, undefined, true), 0, 0.025, 0));
  g.add(at(cyl(0.098, 0.098, 0.004, F('#c9a060', 0.8), 32), 0, 0.008, 0));
  g.add(at(rot(torus(0.1, 0.004, F('#b88b45', 0.7), 6, 40), PI / 2, 0, 0), 0, 0.05, 0));
  g.add(at(cyl(0.092, 0.092, 0.002, F('#f3edd9', 0.9), 32), 0, 0.011, 0));
  const skin = mat('#f6eed9', { rough: 0.45, flat: true });
  const prof = [[0.001, 0], [0.019, 0], [0.022, 0.006], [0.019, 0.017], [0.01, 0.026], [0.003, 0.031], [0.001, 0.032]];
  for (let i = 0; i < 7; i++) {
    const a = i / 6 * PI * 2;
    const d = lathe(prof, skin, 12); d.rotation.y = i;
    g.add(bite(at(d, i === 6 ? 0 : Math.cos(a) * 0.055, 0.012, i === 6 ? 0 : Math.sin(a) * 0.055), i));
  }
  const lid = group(cyl(0.1, 0.1, 0.03, bam, 32, undefined, true), at(cyl(0.098, 0.098, 0.003, F('#c9a060', 0.8), 32), 0, 0.014, 0));
  lid.rotation.x = -1.2; g.add(at(lid, 0, 0.09, -0.12));
  return g;
}
function pailWithFood(label, print, kind) {
  const g = pail({ print, label });
  const y = 0.1;
  if (kind === 'orange') {
    const m = mat('#d65f12', { rough: 0.3, clearcoat: 0.7, flat: true });
    const rnd = seeded(5);
    for (let i = 0; i < 9; i++) { const c = sph(0.016, m, 7, 5); c.scale.set(1.1, 0.8, 0.9); c.rotation.set(rnd() * 3, rnd() * 3, 0); const a = i * 2.4, rr = (i % 3) * 0.014; g.add(bite(at(c, Math.cos(a) * rr, y + 0.006 + (i < 3 ? 0.012 : 0), Math.sin(a) * rr), i % 5)); }
    for (let i = 0; i < 3; i++) { const b = group(sph(0.011, FLAT('#2f7d32', 0.8), 7, 5), at(cyl(0.003, 0.004, 0.012, F('#7cb342', 0.6), 6), 0, -0.01, 0)); b.rotation.z = 0.5 * (i - 1); g.add(bite(at(b, -0.028 + i * 0.026, y + 0.016, 0.02 - i * 0.01), i)); }
    for (let i = 0; i < 8; i++) g.add(at(box(0.002, 0.0015, 0.004, F('#fbf3e0', 0.5)), Math.cos(i) * 0.015, y + 0.03, Math.sin(i * 1.3) * 0.015));
  } else {
    const nd = F('#c99a4f', 0.5);
    g.add(...noodles(7, { w: 0.075, d: 0.06, y: y + 0.004, r: 0.003, m: nd, seed: 31, amp: 0.008 }).map((n, i) => bite(n, i % 5)));
    const top = noodles(4, { w: 0.06, d: 0.04, y: y + 0.012, r: 0.003, m: nd, seed: 32, amp: 0.01 });
    top.forEach((n, i) => { n.rotation.y = 1.2; g.add(bite(n, i % 4)); });
    for (let i = 0; i < 5; i++) { const c = box(0.02, 0.003, 0.003, F('#f08a24', 0.5)); c.rotation.y = i; g.add(bite(at(c, -0.02 + i * 0.01, y + 0.018, 0.01 - i * 0.005), i % 4)); }
    for (let i = 0; i < 3; i++) { const l = sph(0.012, F('#4f9a3a', 0.5), 8, 6); l.scale.set(1.4, 0.2, 0.8); l.rotation.y = i; g.add(bite(at(l, 0.02 - i * 0.015, y + 0.017, -0.015 + i * 0.012), i)); }
  }
  const cs = chopsticks(0.2); cs.rotation.set(0, 0.4, -1.1); g.add(at(cs, 0.03, 0.13, -0.01));
  return g;
}
function padThai() {
  const g = group(plate({ r: 0.125 }));
  const nd = F('#d08a3e', 0.45);
  const strands = noodles(9, { w: 0.13, d: 0.09, y: 0.018, r: 0.0048, m: nd, seed: 41, amp: 0.008 });
  strands.forEach((n, i) => { n.scale.y = 0.6; n.rotation.y = 0.4; g.add(bite(n, 3 + (i % 3))); });
  const top = noodles(6, { w: 0.1, d: 0.06, y: 0.026, r: 0.0048, m: nd, seed: 42, amp: 0.01 });
  scatter(g, 6, () => rbox(0.012, 0.004, 0.009, 0.002, F('#f6c443', 0.5)), { rad: 0.035, y: 0.036, tag: 2, seed: 44 });
  scatter(g, 8, () => box(0.016, 0.0025, 0.0025, F('#3f8f2a', 0.5)), { rad: 0.04, y: 0.04, tag: 0, seed: 45 });
  top.forEach((n, i) => { n.scale.y = 0.6; n.rotation.y = -0.6; g.add(bite(n, 2 + (i % 2))); });
  const shrimp = F('#f2855e', 0.45);
  for (let i = 0; i < 3; i++) { const s = group(torus(0.013, 0.006, shrimp, 8, 14, PI * 1.3), at(cone(0.006, 0.012, F('#e0471c', 0.5), 6), 0.013, -0.004, 0)); s.rotation.set(PI / 2 - 0.2, 0, i * 2); g.add(bite(at(s, -0.03 + i * 0.03, 0.04, 0.01 - (i % 2) * 0.02), 1)); }
  scatter(g, 10, () => rbox(0.004, 0.003, 0.004, 0.001, F('#c99c5f', 0.7)), { rad: 0.03, y: 0.045, tag: 0, seed: 43 });
  for (let i = 0; i < 4; i++) { const s = cyl(0.0016, 0.0016, 0.035, F('#f6f1dc', 0.5), 5); s.rotation.set(PI / 2, 0, i * 0.5 + 0.3); g.add(bite(at(s, 0.055, 0.03, -0.01 + i * 0.008), 0)); }
  g.add(at(rot(citrusWedge(0.022), 0, -0.6, 0), -0.07, 0.012, 0.055));
  return g;
}
function springRolls() {
  const g = new THREE.Group();
  g.add(at(rbox(0.2, 0.012, 0.11, 0.005, MAT.ceramic('#fbfaf7')), 0, 0.006, 0));
  const m = mat('#ffffff', { map: speckTex('springroll', '#d99a3e', ['#b8772a', '#efc271', '#c4842f'], 90, 2.5, 4), rough: 0.7, flat: true });
  for (let i = 0; i < 4; i++) { const r = capsule(0.012, 0.075, m); r.rotation.set(0, 0.25, PI / 2); g.add(bite(at(r, -0.02, 0.024 + (i === 3 ? 0.02 : 0), -0.04 + (i % 3) * 0.028 + (i === 3 ? 0.014 : 0)), i)); }
  const dish = group(lathe([[0.001, 0], [0.024, 0], [0.028, 0.014], [0.025, 0.014], [0.021, 0.003], [0.001, 0.003]], MAT.ceramic('#d64933'), 24), at(cyl(0.024, 0.02, 0.003, mat('#e8501a', { rough: 0.1, clearcoat: 1, opacity: 0.85, transparent: true }), 20), 0, 0.009, 0));
  g.add(at(dish, 0.07, 0.012, 0.01));
  return g;
}

// =================================================================== fried chicken (Cluck Hut)
function drumstick(m) {
  const d = new THREE.Group();
  const meat = sph(0.022, m, 9, 7); meat.scale.set(1, 1.5, 1); d.add(meat);
  d.add(at(cyl(0.004, 0.005, 0.03, F('#f3ead8', 0.5), 8), 0, 0.042, 0));
  d.add(at(sph(0.0065, F('#f3ead8', 0.5), 8, 6), 0, 0.058, 0));
  return d;
}
function chickenBucket() {
  const g = new THREE.Group();
  const tex = TX('bucket', 256, 128, (ctx, W, H) => {
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#d62828'; ctx.fillRect(i * W / 16, 0, W / 16 + 1, H); }
    for (const x of [0.25, 0.75]) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(W * x, H * 0.5, H * 0.32, 0, 7); ctx.fill(); ctx.fillStyle = '#f77f00'; ctx.font = `${H * 0.32}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🐔', W * x, H * 0.48); }
  });
  g.add(labeledCup({ rb: 0.07, rt: 0.09, h: 0.13, map: tex, seg: 36 }));
  g.add(at(rot(torus(0.089, 0.003, F('#ffffff', 0.5), 6, 40), PI / 2, 0, 0), 0, 0.13, 0));
  const m = mat('#ffffff', { map: speckTex('fried', '#c47a2a', ['#a35e1c', '#e2a24f', '#8f4f17'], 90, 3, 2), rough: 0.9, flat: true });
  const spots = [[-0.03, 0.13, -0.02, -0.4, 0.2], [0.03, 0.135, -0.025, 0.35, 0.3], [0, 0.14, 0.03, 0.1, -0.4], [-0.04, 0.12, 0.03, -0.6, -0.3], [0.045, 0.12, 0.025, 0.6, -0.2]];
  spots.forEach(([x, y, z, rz, rx], i) => { const d = drumstick(m); d.rotation.set(rx, 0, rz); g.add(bite(at(d, x, y, z), i)); });
  for (let i = 0; i < 2; i++) { const t = sph(0.032, m, 9, 7); t.scale.set(1.2, 0.7, 0.9); t.rotation.y = i; g.add(bite(at(t, -0.015 + i * 0.03, 0.125, -0.005 + i * 0.01), 5 + i)); }
  return g;
}
function redBasket(w = 0.17, d = 0.13) {
  const g = group(tray({ w, d, h: 0.032, m: mat('#d62828', { rough: 0.4, flat: true }) }));
  const p = liner(w * 0.85, d * 0.85, checkerTex('#d62828', '#fff7ec', 8)); p.position.y = 0.005; p.rotation.z = 0.15;
  g.add(p);
  return g;
}
function wings() {
  const g = redBasket(0.18, 0.14);
  const m = mat('#ffffff', { map: speckTex('buffalo', '#c8401a', ['#9e2a10', '#e35d2a', '#7a1f0c'], 70, 2.5, 5), rough: 0.3, clearcoat: 0.8, flat: true });
  const rnd = seeded(27);
  for (let i = 0; i < 8; i++) {
    let w;
    if (i % 2) { w = capsule(0.017, 0.038, m); w.scale.set(1, 1, 0.6); w.rotation.set(PI / 2, rnd() * 3, 0.3); }
    else { w = group(sph(0.021, m, 9, 7), at(cyl(0.008, 0.013, 0.028, m, 8), 0, 0.021, 0), at(sph(0.007, F('#f3ead8', 0.5), 6, 5), 0, 0.036, 0)); w.rotation.set(PI / 2 - 0.3, rnd() * 3, rnd()); }
    const a = i * 0.785 + rnd() * 0.3, rr = 0.025 + (i % 3) * 0.012;
    g.add(bite(at(w, -0.015 + Math.cos(a) * rr * 1.2, 0.022 + (i > 4 ? 0.016 : 0), Math.sin(a) * rr), i));
  }
  for (let i = 0; i < 3; i++) { const c = box(0.075, 0.009, 0.011, F('#a4c95c', 0.5)); c.rotation.set(0, 0.2 + i * 0.08, 0.1); g.add(at(c, 0.045, 0.015 + i * 0.004, -0.025 + i * 0.014)); }
  g.add(at(dipCup('#f6f2e3', 0.019), 0.055, 0.006, 0.045));
  return g;
}
function tendersBasket() {
  const g = redBasket(0.18, 0.14);
  const m = mat('#ffffff', { map: speckTex('tender', '#d08b36', ['#ad6a22', '#ebb562', '#93551a'], 90, 3, 3), rough: 0.9, flat: true });
  for (let i = 0; i < 4; i++) { const t = sph(0.045, m, 9, 6); t.rotation.set(0, 0.3 - i * 0.15, 0); t.scale.set(1, 0.3, 0.38); g.add(bite(at(t, -0.022, 0.018 + (i === 3 ? 0.013 : 0), -0.042 + (i % 3) * 0.028 + (i === 3 ? 0.014 : 0)), i)); }
  const fm = F('#f4bd4f', 0.7);
  for (let i = 0; i < 10; i++) { const f = box(0.007, 0.007, 0.07, fm); f.rotation.set(0.1, -0.3 + (i % 4) * 0.12, 0.1); g.add(bite(at(f, 0.045 + (i % 3) * 0.008, 0.012 + Math.floor(i / 4) * 0.006, -0.01 + (i % 5) * 0.005), 4 + (i % 2))); }
  g.add(at(dipCup('#e9b215', 0.019), 0.06, 0.006, 0.048));
  return g;
}

// =================================================================== breakfast (Sunny Side Diner)
export function pancakeStack(n = 4, { blue = true, y0 = 0.012 } = {}) {
  const g = new THREE.Group();
  const side = F('#ecc488', 0.75), top = F('#bd7432', 0.65);
  for (let i = 0; i < n; i++) { const p = cyl(0.066, 0.068, 0.011, [side, top, top], 28); p.rotation.y = i; g.add(bite(at(p, (i % 2) * 0.003, y0 + 0.0055 + i * 0.011, (i % 3) * 0.002), n - i + 1)); }
  const ty = y0 + n * 0.011;
  g.add(bite(at(cyl(0.05, 0.055, 0.0025, mat('#9a4d0e', { rough: 0.08, clearcoat: 1, opacity: 0.85, transparent: true }), 24), 0, ty + 0.001, 0), 0));
  for (let i = 0; i < 4; i++) { const d = capsule(0.004, 0.012, mat('#9a4d0e', { rough: 0.08, clearcoat: 1, opacity: 0.85, transparent: true })); const a = i * 1.7 + 0.4; g.add(bite(at(d, Math.cos(a) * 0.064, ty - 0.008, Math.sin(a) * 0.064), 0)); }
  g.add(bite(at(rot(rbox(0.026, 0.01, 0.022, 0.003, F('#ffe08a', 0.35)), 0, 0.4, 0), 0, ty + 0.007, 0), 1));
  if (blue) for (let i = 0; i < 6; i++) g.add(bite(at(sph(0.0058, GL('#2d2a6e'), 10, 8), Math.cos(i * 1.05) * 0.03, ty + 0.005, Math.sin(i * 1.05) * 0.03), 1));
  return g;
}
export function waffleTex() {
  return TX('waffle', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#c47a2c'; ctx.fillRect(0, 0, W, H);
    const n = 6, s = W / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { ctx.fillStyle = '#9a5a1c'; ctx.fillRect(x * s + 5, y * s + 5, s - 10, s - 10); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x * s + 5, y * s + 5, s - 10, 3); }
  });
}
export function waffle(m) {
  const side = F('#d08a3a', 0.7);
  return box(0.09, 0.016, 0.09, [side, side, mat('#ffffff', { map: waffleTex(), rough: 0.7 }), side, side, side]);
}
export function whip(r = 0.018, color = '#fbf8f2') {
  const m = F(color, 0.6);
  return group(at(torus(r * 0.8, r * 0.45, m, 8, 18), 0, r * 0.4, 0).rotateX(PI / 2), at(torus(r * 0.5, r * 0.36, m, 8, 16), 0, r * 0.95, 0).rotateX(PI / 2), at(cone(r * 0.5, r * 0.9, m, 12), 0, r * 1.5, 0));
}
function wafflePlate() {
  const g = group(plate({ r: 0.12 }));
  const w1 = waffle(); g.add(bite(at(rot(w1, 0, 0.3, 0), -0.02, 0.02, 0.005), 3));
  const w2 = waffle(); g.add(bite(at(rot(w2, 0.12, -0.4, 0.05), 0.025, 0.034, -0.012), 2));
  g.add(bite(at(whip(0.017), 0.025, 0.045, -0.01), 0));
  for (let i = 0; i < 4; i++) { const s = hemi(0.013, F('#d1202f', 0.4)); s.scale.set(1, 1.3, 0.8); s.rotation.set(-PI / 2 + 0.3, i * 1.5, 0); g.add(bite(at(s, -0.05 + i * 0.022, 0.045 - (i % 2) * 0.012, 0.04 - (i % 2) * 0.01), 1)); }
  g.add(at(dipCup('#9a4d0e', 0.017), 0.08, 0.012, 0.05));
  return g;
}
function eggsBenedict() {
  const g = group(plate({ r: 0.12, color: '#cfe3ec' }));
  const muffin = cyl(0.036, 0.036, 0.012, [F('#c99a5a', 0.8), F('#e9d2a2', 0.85), F('#c99a5a', 0.8)], 22);
  [[-0.035, -0.01], [0.035, 0.012]].forEach(([x, z], i) => {
    const s = new THREE.Group();
    s.add(at(muffin.clone(), 0, 0.018, 0));
    s.add(at(cyl(0.034, 0.034, 0.005, F('#d47a6a', 0.55), 20), 0, 0.0265, 0));
    const egg = sph(0.026, F('#fbf8f1', 0.35), 18, 12); egg.scale.set(1, 0.55, 1); s.add(at(egg, 0, 0.034, 0));
    const hol = hemi(0.028, GL('#f6c445')); hol.scale.set(1.05, 0.55, 1.05); s.add(at(hol, 0, 0.034, 0));
    for (let k = 0; k < 4; k++) s.add(at(box(0.006, 0.0015, 0.0015, F('#3f8f3a', 0.5)), Math.cos(k * 1.4) * 0.01, 0.05, Math.sin(k * 1.4) * 0.01));
    s.position.set(x, 0, z);
    g.add(bite(s, i * 2));
  });
  const hb = rbox(0.06, 0.016, 0.04, 0.006, mat('#ffffff', { map: speckTex('hashbrown', '#d49a45', ['#b77a2c', '#f0c779', '#8f5a1d'], 90, 2, 3), rough: 0.9 }));
  hb.rotation.y = 0.5; g.add(bite(at(hb, 0.02, 0.02, -0.06), 1));
  return g;
}
function avocadoToast() {
  const g = new THREE.Group();
  g.add(at(rbox(0.24, 0.015, 0.14, 0.005, MAT.wood('#b58457')), 0, 0.0075, 0));
  [[-0.05, 0.15], [0.05, -0.12]].forEach(([x, ry], i) => {
    const t = new THREE.Group();
    t.add(at(rbox(0.09, 0.014, 0.1, 0.006, F('#9c5f26', 0.85)), 0, 0.007, 0));
    t.add(at(rbox(0.08, 0.003, 0.09, 0.002, F('#e4c189', 0.9)), 0, 0.0145, 0));
    const av = rbox(0.074, 0.008, 0.082, 0.004, mat('#ffffff', { map: speckTex('avosmash', '#9cc256', ['#6f9a2e', '#c4dd84', '#557f1f'], 70, 3, 4), rough: 0.6 }));
    t.add(at(av, 0, 0.019, 0));
    for (let k = 0; k < 3; k++) t.add(at(group(cyl(0.011, 0.011, 0.002, F('#d43f5e', 0.4), 16), at(cyl(0.009, 0.009, 0.0022, F('#fbf2f2', 0.4), 16), 0, 0, 0)), -0.02 + k * 0.02, 0.0245, 0.02 - k * 0.018));
    for (let k = 0; k < 8; k++) t.add(at(box(0.002, 0.001, 0.002, F('#b81d13', 0.5)), Math.cos(k * 2.3) * 0.025, 0.0245, Math.sin(k * 2.3) * 0.03));
    if (i === 0) t.add(bite(ramenEgg(0.012, 0.018, -0.015, 0.5), 0));
    t.position.set(x, 0.015, 0); t.rotation.y = ry;
    g.add(bite(t, 1 + i * 2));
  });
  return g;
}
export function friedEgg() {
  const e = new THREE.Group();
  const w = cyl(0.04, 0.042, 0.005, F('#fbfaf3', 0.4), 13); w.scale.z = 0.85; e.add(w);
  const y = sph(0.016, mat('#ffb703', { rough: 0.2, clearcoat: 0.8 }), 14, 10); y.scale.y = 0.55; e.add(at(y, 0.004, 0.004, 0));
  return e;
}
export function baconStrip(len = 0.1) {
  const b = tube([[-len / 2, 0, 0], [-len / 4, 0.004, 0.003], [0, 0, 0], [len / 4, 0.004, -0.003], [len / 2, 0, 0]], 0.008, mat('#ffffff', { map: stripeTex('bacon2', '#8a2412', '#e2a98c', 5, false), rough: 0.6 }), 20, 6);
  b.scale.y = 0.35;
  return b;
}
function bigBreakfast() {
  const g = group(plate({ r: 0.13, color: '#cfe3ec' }));
  g.add(bite(at(friedEgg(), -0.035, 0.016, -0.035), 2), bite(at(rot(friedEgg(), 0, 1, 0), 0.03, 0.016, -0.045), 3));
  for (let i = 0; i < 3; i++) g.add(bite(at(rot(baconStrip(0.1), 0, 0.15, 0), 0.0, 0.016 + i * 0.002, 0.02 + i * 0.016), 4 + i));
  for (let i = 0; i < 2; i++) { const s = capsule(0.011, 0.05, GL('#7a3b1c')); s.rotation.set(0, 0.2, PI / 2); g.add(bite(at(s, -0.065, 0.024, 0.04 + i * 0.024), 1)); }
  const hb = rbox(0.055, 0.015, 0.04, 0.006, mat('#ffffff', { map: speckTex('hashbrown', '#d49a45', ['#b77a2c', '#f0c779', '#8f5a1d'], 90, 2, 3), rough: 0.9 }));
  hb.rotation.y = -0.3; g.add(bite(at(hb, 0.07, 0.02, 0.035), 0));
  const tst = slab([[0, 0], [0.07, 0], [0, 0.07]], 0.01, F('#c98b45', 0.85), 0.012);
  tst.rotation.z = 0.6; g.add(bite(at(tst, 0.05, 0.02, -0.01), 7));
  return g;
}

// =================================================================== donuts (Glazed & Confused)
const SPRINKLES = ['#ff5d8f', '#ffd23f', '#3ec1d3', '#7ae582', '#ffffff', '#9b5de5'];
export function donut({ glaze = '#f48fb1', dough = '#d9a35a', sprinkles = 0, drizzle = null, seed = 1 }) {
  const g = new THREE.Group();
  g.add(at(rot(torus(0.03, 0.016, F(dough, 0.75), 12, 28), PI / 2, 0, 0), 0, 0.016, 0));
  if (glaze) { const gz = torus(0.0305, 0.0158, mat(glaze, { rough: 0.25, clearcoat: 0.6 }), 12, 28); gz.rotation.x = PI / 2; gz.scale.set(1.02, 1.02, 0.6); g.add(at(gz, 0, 0.0225, 0)); }
  const rnd = seeded(seed);
  for (let i = 0; i < sprinkles; i++) {
    const a = rnd() * PI * 2, rr = 0.03 + (rnd() - 0.5) * 0.02;
    const s = capsule(0.0016, 0.006, F(SPRINKLES[i % SPRINKLES.length], 0.4)); s.rotation.set(PI / 2, 0, rnd() * PI);
    g.add(at(s, Math.cos(a) * rr, 0.0325, Math.sin(a) * rr));
  }
  if (drizzle) g.add(at(tube([[-0.035, 0, -0.02], [-0.01, 0, 0.03], [0.01, 0, -0.03], [0.035, 0, 0.02]], 0.0022, GL(drizzle), 20, 5), 0, 0.033, 0));
  return g;
}
function boxWithLid({ w, d, h, color, print, label, sub = '', angle = -1.9, window = false }) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.8 });
  g.add(at(box(w, 0.004, d, m), 0, 0.002, 0));
  for (const s of [-1, 1]) { g.add(at(box(w, h, 0.004, m), 0, h / 2, s * (d / 2 - 0.002))); g.add(at(box(0.004, h, d, m), s * (w / 2 - 0.002), h / 2, 0)); }
  const lid = new THREE.Group(); lid.position.set(0, h, -d / 2);
  lid.add(at(box(w, 0.003, d, window ? TR('#f4f7f8', 0.3) : m), 0, 0, d / 2));
  if (label) {
    const dc = decal(w * 0.8, d * 0.6, `food:lid:${label}:${color}`, (ctx, W, H) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = print; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${H * 0.3}px ${FONT}`; fitText(ctx, label, W / 2, H * 0.42, W * 0.9);
      if (sub) { ctx.font = `700 ${H * 0.14}px ${FONT}`; fitText(ctx, sub, W / 2, H * 0.75, W * 0.9); }
    }, { tw: 256 });
    dc.rotation.x = PI / 2; at(dc, 0, -0.002, d / 2); lid.add(dc);
  }
  lid.rotation.x = angle;
  g.add(lid);
  return g;
}
function donutBox() {
  const g = boxWithLid({ w: 0.3, d: 0.2, h: 0.06, color: '#ffb3c6', print: '#c9184a', label: 'GLAZED & CONFUSED', sub: 'HALF DOZEN · MADE FRESH' });
  const kinds = [{ glaze: '#f48fb1', sprinkles: 3 }, { glaze: '#4a2c1d', sprinkles: 3 }, { glaze: '#fff6e8' }, { glaze: '#c97b2c', drizzle: '#fff6e8' }, { glaze: '#a0d8ef', sprinkles: 3 }, { glaze: '#4a2c1d', drizzle: '#f48fb1' }];
  kinds.forEach((k, i) => g.add(bite(at(donut({ ...k, seed: i + 2 }), -0.096 + (i % 3) * 0.096, 0.004, -0.048 + Math.floor(i / 3) * 0.096), i)));
  return g;
}
function waxPaper() { const p = box(0.12, 0.001, 0.12, mat('#fbf8f0', { rough: 0.4, opacity: 0.8, transparent: true })); p.rotation.y = 0.3; return at(p, 0, 0.0005, 0); }
// a single donut split into bite-sized arcs
function singleDonut(o) {
  const g = group(waxPaper());
  const L = PI * 2 / 4;
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Group();
    s.add(at(rot(torus(0.03, 0.016, F(o.dough || '#d9a35a', 0.75), 12, 8, L), PI / 2, 0, 0), 0, 0.016, 0));
    const gz = torus(0.0305, 0.0158, mat(o.glaze, { rough: 0.25, clearcoat: 0.6 }), 12, 8, L); gz.rotation.x = PI / 2; gz.scale.set(1.02, 1.02, 0.6); s.add(at(gz, 0, 0.0225, 0));
    const rnd = seeded(i + 3);
    for (let k = 0; k < (o.sprinkles || 0); k++) { const a = -(rnd() * L), rr = 0.03 + (rnd() - 0.5) * 0.02; const sp = capsule(0.0016, 0.006, F(SPRINKLES[(k + i) % SPRINKLES.length], 0.4)); sp.rotation.set(PI / 2, 0, rnd() * PI); s.add(at(sp, Math.cos(a) * rr, 0.0325, Math.sin(a) * rr)); }
    if (o.drizzle) for (let k = 0; k < 2; k++) { const a = -L * (0.3 + k * 0.4); const dz = cyl(0.0022, 0.0022, 0.034, GL(o.drizzle), 6); dz.rotation.set(PI / 2, 0, -a + 0.4); s.add(at(dz, Math.cos(a) * 0.03, 0.0335, Math.sin(a) * 0.03)); }
    s.rotation.y = i * L;
    g.add(bite(s, i));
  }
  return g;
}
function bostonCream() {
  const g = group(waxPaper());
  const L = PI;
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Group();
    const d = mesh(cgeo(`bc:${i}`, () => new THREE.SphereGeometry(0.04, 22, 14, i * L, L)), F('#d9a35a', 0.7)); d.scale.y = 0.55; s.add(at(d, 0, 0.022, 0));
    const c = mesh(cgeo(`bct:${i}`, () => new THREE.SphereGeometry(0.0405, 22, 8, i * L, L, 0, PI * 0.33)), GL('#3b2014')); c.scale.y = 0.6; s.add(at(c, 0, 0.022, 0));
    g.add(bite(s, i));
  }
  const cream = sph(0.009, F('#f7e3a2', 0.5), 10, 8); cream.scale.y = 0.7; g.add(bite(at(cream, 0.038, 0.016, 0.005), 0));
  return g;
}
function mapleBar() {
  const g = group(waxPaper());
  const L = 0.11;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    const b = rbox(L / 3 + 0.014, 0.026, 0.045, 0.012, F('#d9a35a', 0.7)); s.add(at(b, 0, 0.013, 0));
    s.add(at(rbox(L / 3 + 0.01, 0.008, 0.042, 0.004, GL('#b8662a')), 0, 0.025, 0));
    for (let k = 0; k < 3; k++) s.add(at(rbox(0.008, 0.004, 0.006, 0.0015, F('#8f2c1c', 0.6)), -0.01 + k * 0.01, 0.0295, -0.012 + ((k + i) % 3) * 0.012));
    s.position.x = -L / 3 + i * (L / 3);
    g.add(bite(s, 2 - i));
  }
  return g;
}

// =================================================================== ice cream (Big Scoops)
function coneTex() {
  return TX('waffcone', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#d99a4e'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#a8692a'; ctx.lineWidth = 3;
    for (let i = -8; i < 16; i++) { ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16 + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * 16, H); ctx.lineTo(i * 16 + H, 0); ctx.stroke(); }
  }, { wrap: true, repeat: [3, 1] });
}
export function scoop(color, r = 0.03, speck = null) {
  const m = speck ? mat('#ffffff', { map: speckTex(`scoop:${color}:${speck}`, color, [speck], 40, 2.2, 6), rough: 0.6 }) : F(color, 0.6);
  const s = group(at(sph(r, m, 20, 14), 0, r * 0.85, 0), at(rot(torus(r * 0.92, r * 0.18, m, 8, 22), PI / 2, 0, 0), 0, r * 0.25, 0));
  return s;
}
function iceCreamCone() {
  const g = new THREE.Group();
  const c = cone(0.032, 0.12, mat('#ffffff', { map: coneTex(), rough: 0.8 }), 24); c.rotation.x = PI; g.add(bite(at(c, 0, 0.06, 0), 3));
  g.add(bite(at(rot(torus(0.032, 0.004, F('#c98a40', 0.7), 6, 24), PI / 2, 0, 0), 0, 0.12, 0), 3));
  g.add(bite(at(scoop('#9fe2c1', 0.03, '#3b2314'), 0, 0.112, 0), 1));
  g.add(bite(at(scoop('#f7a1b5', 0.028), 0.002, 0.155, 0.002), 0));
  return g;
}
function sundae() {
  const g = new THREE.Group();
  const glass = mat('#eef7f8', { rough: 0.03, opacity: 0.3, transparent: true, side: THREE.DoubleSide });
  g.add(lathe([[0.001, 0], [0.04, 0], [0.042, 0.004], [0.008, 0.01], [0.006, 0.04], [0.02, 0.05], [0.055, 0.08], [0.062, 0.11]], glass, 32));
  g.add(at(cone(0.05, 0.05, F('#f7ecd2', 0.6), 20), 0, 0.075, 0).rotateX(PI));
  g.add(bite(at(scoop('#f7ecd2', 0.03), -0.022, 0.09, 0.008), 3), bite(at(scoop('#6b3e26', 0.03), 0.022, 0.09, -0.006), 3), bite(at(scoop('#f7ecd2', 0.03), 0, 0.125, 0), 2));
  for (let i = 0; i < 5; i++) { const d = capsule(0.005, 0.016, GL('#3b1d10')); d.rotation.z = 0.2 * (i - 2); g.add(bite(at(d, Math.cos(i * 1.3) * 0.028, 0.14 - (i % 2) * 0.01, Math.sin(i * 1.3) * 0.028), 1)); }
  g.add(bite(at(cyl(0.024, 0.03, 0.005, GL('#3b1d10'), 20), 0, 0.165, 0), 1));
  g.add(bite(at(whip(0.022), 0, 0.165, 0), 0));
  g.add(bite(group(at(sph(0.009, GL('#c1121f'), 14, 10), 0, 0.215, 0), at(tube([[0, 0.222, 0], [0.004, 0.235, 0], [0.012, 0.242, 0]], 0.0012, F('#4a7a2a'), 8, 4), 0, 0, 0)), 0));
  scatter(g, 8, () => rbox(0.004, 0.003, 0.004, 0.001, F('#d9b37a', 0.7)), { rad: 0.02, y: 0.172, tag: 0, seed: 3 });
  const sp = spoon(0.2); sp.rotation.set(0, 0.5, 1.1); g.add(at(sp, 0.04, 0.16, 0.0));
  return g;
}
function pint() {
  const g = new THREE.Group();
  const tex = bandLabel('pint', '#2b2d6e', '#ffd6e0', 'BIG SCOOPS', 'COOKIE DOUGH', '#ffd6e0');
  g.add(labeledCup({ rb: 0.04, rt: 0.046, h: 0.1, map: tex, rough: 0.5 }));
  const ic = cyl(0.043, 0.039, 0.085, F('#f6ead0', 0.6), 28); ic.geometry = cgeo('pintfill', () => { const q = new THREE.CylinderGeometry(0.043, 0.039, 0.085, 28); q.translate(0, 0.0425, 0); return q; });
  ic.userData.liquid = true; g.add(at(ic, 0, 0.006, 0));
  for (let i = 0; i < 6; i++) g.add(bite(at(rbox(0.01, 0.007, 0.009, 0.002, F('#b07a45', 0.8)), Math.cos(i * 1.2) * 0.022, 0.092, Math.sin(i * 1.2) * 0.022), i));
  const lid = group(cyl(0.047, 0.047, 0.012, mat('#ffd6e0', { rough: 0.5 }), 32), at(cyl(0.04, 0.04, 0.0005, mat('#2b2d6e', { rough: 0.5 }), 24), 0, 0.0062, 0));
  lid.rotation.set(-1.2, 0, 0); g.add(at(lid, 0, 0.05, -0.065));
  const sp = spoon(0.15); sp.rotation.set(0, 0.3, -1.1); g.add(at(sp, 0.02, 0.13, 0));
  return g;
}
function bananaSplit() {
  const g = new THREE.Group();
  const dish = lathe([[0.001, 0], [0.04, 0], [0.042, 0.006], [0.06, 0.04], [0.057, 0.04], [0.04, 0.009], [0.001, 0.009]], mat('#cfe8f3', { rough: 0.05, opacity: 0.55, transparent: true }), 32);
  dish.scale.set(2.1, 1, 0.9); g.add(dish);
  const ban = F('#f3df9b', 0.5);
  for (const z of [-0.03, 0.03]) { const b = capsule(0.013, 0.17, ban); b.rotation.set(0, 0, PI / 2); b.scale.set(1, 1, 0.65); g.add(bite(at(b, 0, 0.022, z), 4)); }
  [['#f7ecd2', -0.05], ['#6b3e26', 0], ['#f7a1b5', 0.05]].forEach(([c, x], i) => {
    g.add(bite(at(scoop(c, 0.027), x, 0.02, 0), 1 + i));
    g.add(bite(at(whip(0.013), x, 0.068, 0), 0));
    g.add(bite(at(sph(0.007, GL('#c1121f'), 12, 8), x, 0.1, 0), 0));
  });
  g.add(bite(at(tube([[-0.07, 0.07, 0.01], [-0.04, 0.072, -0.012], [-0.01, 0.07, 0.012], [0.02, 0.072, -0.012], [0.06, 0.07, 0.01]], 0.0025, GL('#3b1d10'), 30, 5), 0, 0, 0), 0));
  return g;
}
function rocketPop() {
  const g = new THREE.Group();
  g.add(at(rbox(0.01, 0.06, 0.003, 0.0015, F('#e6c48c', 0.8)), 0, 0.03, 0));
  const tier = (c, rb, rt, h, y, n) => bite(at(cyl(rt, rb, h, mat(c, { rough: 0.3, clearcoat: 0.5 }), 24), 0, y + h / 2, 0), n);
  g.add(tier('#2a6fdb', 0.019, 0.017, 0.035, 0.05, 2), tier('#f8f9fa', 0.017, 0.014, 0.03, 0.085, 1));
  const top = cone(0.014, 0.035, mat('#e5383b', { rough: 0.3, clearcoat: 0.5 }), 24); g.add(bite(at(top, 0, 0.1325, 0), 0));
  g.add(at(rbox(0.06, 0.003, 0.06, 0.0015, mat('#fbf8f0', { rough: 0.4 })), 0, 0.0015, 0));
  return g;
}

// =================================================================== bakery (Crumb Bakery)
function croissant() {
  const g = new THREE.Group();
  g.add(at(liner(0.18, 0.12, checkerTex('#dda15e', '#fbf6ec', 6)), 0, 0.001, 0));
  const m = mat('#b8661c', { rough: 0.4, clearcoat: 0.6 }), m2 = mat('#d48a32', { rough: 0.4, clearcoat: 0.6 });
  const n = 7, R = 0.055;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;            // -1 .. 1 along the crescent
    const a = t * 1.15;
    const r = 0.027 * (1 - Math.abs(t) * 0.55);
    const s = sph(r, i % 2 ? m2 : m, 18, 12);
    s.scale.set(0.62, 0.78, 1.45);
    s.rotation.y = -a;
    const x = Math.sin(a) * R, z = R - Math.cos(a) * R - 0.02;
    g.add(bite(at(s, x, r * 0.78 + 0.001, z), [0, 2, 4, 6, 5, 3, 1][i]));
  }
  return g;
}
function cupcake({ cake = '#8e1d2b', frost = '#f8f1e4', liner: lc = '#d23b4a', topping = 'crumbs' }) {
  const g = new THREE.Group();
  g.add(bite(lathe([[0.001, 0], [0.026, 0], [0.033, 0.04], [0.031, 0.04], [0.024, 0.003], [0.001, 0.003]], mat(lc, { rough: 0.7, flat: true }), 18), 3));
  const d = hemi(0.034, F(cake, 0.8)); d.scale.y = 0.45; g.add(bite(at(d, 0, 0.038, 0), 2));
  const fm = F(frost, 0.55);
  const fr = group(at(rot(torus(0.022, 0.011, fm, 10, 22), PI / 2, 0, 0), 0, 0.052, 0), at(rot(torus(0.014, 0.009, fm, 10, 18), PI / 2, 0, 0), 0, 0.066, 0), at(cone(0.012, 0.022, fm, 14), 0, 0.083, 0));
  g.add(bite(fr, 0));
  if (topping === 'crumbs') for (let i = 0; i < 5; i++) g.add(bite(at(box(0.004, 0.004, 0.004, F(cake, 0.8)), Math.cos(i * 1.3) * 0.016, 0.07 - (i % 2) * 0.01, Math.sin(i * 1.3) * 0.016), 0));
  return g;
}
function cakeSlice() {
  const g = group(plate({ r: 0.1 }));
  const sponge = F('#4a2617', 0.85), ganache = mat('#2b150c', { rough: 0.25, clearcoat: 0.6 });
  const A = 0.48, R = 0.105, a0 = PI / 2 - A / 2, a1 = PI / 2 + A / 2;
  const cuts = [0, 0.04, 0.075, R];
  for (let k = 0; k < 3; k++) {
    const p = new THREE.Group();
    const pts = sector(cuts[k + 1], a0, a1, 6, cuts[k] || 0);
    const layers = [[sponge, 0.024, 0.012], [ganache, 0.005, 0.039], [sponge, 0.024, 0.047], [ganache, 0.006, 0.074]];
    for (const [m, h, y] of layers) p.add(slab(pts, h, m, y, 0.0008));
    g.add(bite(p, k));
  }
  const b = group(at(sph(0.009, GL('#b5172b'), 14, 10), 0, 0, 0), at(sph(0.0085, GL('#c71f37'), 14, 10), 0.012, 0, 0.004));
  const [bx, , bz] = polar(PI / 2, 0.09);
  g.add(bite(at(b, bx, 0.09, bz), 2));
  for (let i = 0; i < 4; i++) { const [cx, , cz] = polar(PI / 2 + (i - 1.5) * 0.08, 0.06); const c = box(0.008, 0.0015, 0.004, F('#5c3a22', 0.5)); c.rotation.y = i; g.add(bite(at(c, cx, 0.083, cz), 1)); }
  g.children.slice(1).forEach((c) => { c.position.z += 0.05; });
  const f = fork(0.14); f.rotation.y = -0.6; g.add(at(f, 0.05, 0.016, 0.03));
  return g;
}
function cookieModel(color = '#c98b4a', chips = '#3b2314', seed = 1) {
  const c = new THREE.Group();
  c.add(at(cyl(0.04, 0.041, 0.011, FLAT(color, 0.9), 14), 0, 0.0055, 0));
  const rnd = seeded(seed);
  for (let i = 0; i < 6; i++) { const a = rnd() * 7, r = Math.sqrt(rnd()) * 0.03; c.add(at(rbox(0.008, 0.005, 0.007, 0.0015, F(chips, 0.5)), Math.cos(a) * r, 0.0115, Math.sin(a) * r)); }
  return c;
}
export { cookieModel };
function cookieBag() {
  const g = new THREE.Group();
  const bag = group(at(box(0.11, 0.13, 0.06, F('#c49a6c', 0.9)), 0, 0.065, 0), at(box(0.11, 0.025, 0.065, F('#b48a5c', 0.9)), 0, 0.142, -0.002));
  const lg = logoDecal('crumbbag', 0.08, 0.06, { title: 'CRUMB', sub: 'BAKERY', fg: '#5a3a1a', emoji: '🥐' }); lg.position.set(0, 0.075, 0.0305); bag.add(lg);
  g.add(at(bag, 0, 0, -0.06));
  [[0.0, 0.0, 0.2], [0.035, 0.011, 0.6], [-0.025, 0.022, 0.4]].forEach(([x, y, t], i) => { const c = cookieModel('#c98b4a', '#3b2314', i + 2); c.rotation.set(t * 0.3, t, 0); g.add(bite(at(c, x, y, 0.025 - i * 0.012), 2 - i)); });
  return g;
}
function cinnamonRoll() {
  const g = new THREE.Group();
  g.add(at(liner(0.13, 0.13, checkerTex('#dda15e', '#fbf6ec', 6)), 0, 0.001, 0));
  const top = TX('cinroll', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#d99a4c'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#6a300c'; ctx.lineWidth = 6; ctx.beginPath();
    for (let t = 0; t < 18; t += 0.1) { const r = 2 + t * 3.3; const x = W / 2 + Math.cos(t) * r, y = H / 2 + Math.sin(t) * r; t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  });
  const side = mat('#ffffff', { map: speckTex('cinside', '#c7843a', ['#8a4a17', '#e0a860'], 60, 4, 8), rough: 0.7 });
  g.add(bite(at(cyl(0.046, 0.05, 0.045, [side, mat('#fff', { map: top, rough: 0.6 }), side], 28), 0, 0.0235, 0), 1));
  const ic = mat('#fbf8f0', { rough: 0.3, clearcoat: 0.4 });
  const icing = group();
  for (let i = 0; i < 4; i++) icing.add(at(tube([[-0.04, 0, -0.03 + i * 0.02], [-0.013, 0.003, -0.022 + i * 0.02], [0.013, 0, -0.03 + i * 0.02], [0.04, 0.002, -0.022 + i * 0.02]], 0.0028, ic, 16, 5), 0, 0.047, 0));
  const pool = cyl(0.02, 0.022, 0.003, ic, 16); icing.add(at(pool, 0.005, 0.0465, 0));
  g.add(bite(icing, 0));
  return g;
}
function macaron(c, filling = '#fbf3e6') {
  const m = mat(c, { rough: 0.45 });
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const h = sph(0.019, m, 16, 10); h.scale.set(1, 0.42, 1); g.add(at(h, 0, s * 0.0065, 0)); }
  g.add(at(cyl(0.0165, 0.0165, 0.006, F(filling, 0.5), 18), 0, 0, 0));
  g.rotation.x = PI / 2 - 0.25;
  return g;
}
function macaronBox() {
  const g = new THREE.Group();
  g.add(at(rbox(0.17, 0.008, 0.06, 0.003, mat('#f4e1e8', { rough: 0.6 })), 0, 0.004, 0));
  g.add(at(rbox(0.17, 0.045, 0.06, 0.004, TR('#f4f7f8', 0.22)), 0, 0.0265, 0));
  const cols = ['#f27aa4', '#8fd16f', '#a98be0', '#f8d44a', '#6b3a22', '#f3e2c4'];
  cols.forEach((c, i) => g.add(bite(at(macaron(c, i === 4 ? '#4a2a18' : '#fbf3e6'), -0.068 + i * 0.027, 0.028, 0), i)));
  return g;
}
function pumpkinPie() {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.1, 0], [0.122, 0.03], [0.118, 0.031], [0.097, 0.004], [0.001, 0.004]], MAT.metal('#c9ccd0', 0.35), 40));
  const L = PI * 2 / 6;
  const fillM = mat('#c4661f', { rough: 0.45, clearcoat: 0.2 }), crust = F('#d99a4e', 0.75);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group();
    s.add(slab(sector(0.104, 0.008, L - 0.008, 6), 0.018, fillM, 0.006, 0.001));
    s.add(slab(sector(0.118, 0.008, L - 0.008, 6, 0.103), 0.016, crust, 0.012, 0.004));
    const [x, , z] = polar(L / 2, 0.06);
    s.add(at(whip(0.011), x, 0.027, z));
    s.rotation.y = i * L;
    g.add(bite(s, i));
  }
  return g;
}
function gingerbreadShape() {
  const pts = [[0.008, 0.02], [0.035, 0.016], [0.042, 0.008], [0.038, 0], [0.014, 0.004], [0.016, -0.02], [0.03, -0.045], [0.026, -0.053], [0.016, -0.052], [0, -0.028], [-0.016, -0.052], [-0.026, -0.053], [-0.03, -0.045], [-0.016, -0.02], [-0.014, 0.004], [-0.038, 0], [-0.042, 0.008], [-0.035, 0.016], [-0.008, 0.02]];
  for (let a = 240; a >= -60; a -= 20) { const r = a * PI / 180; pts.push([0.017 * Math.cos(r), 0.036 + 0.017 * Math.sin(r)]); }
  return pts;
}
function gingerbreadMen() {
  const g = group(plate({ r: 0.12, color: '#e8f1f2' }));
  const m = mat('#a8622a', { rough: 0.8 }), ice = F('#fbfaf5', 0.4), red = GL('#d62828');
  [[-0.045, 0.01, 0.2], [0.045, -0.005, -0.25], [0, 0.03, 0.05]].forEach(([x, y, r], i) => {
    const s = new THREE.Group();
    s.add(slab(gingerbreadShape(), 0.007, m, 0, 0.0015));
    for (const [px, pz] of [[-0.006, -0.038], [0.006, -0.038], [0, -0.01], [0, 0.002]]) s.add(at(sph(0.0028, pz > -0.02 ? red : ice, 8, 6), px, 0.0105, pz));
    s.add(at(rot(torus(0.007, 0.0012, ice, 4, 10, PI), PI / 2, 0, PI), 0, 0.0105, -0.03));
    for (const sx of [-1, 1]) s.add(at(rot(cyl(0.0012, 0.0012, 0.012, ice, 4), PI / 2, 0, 0), sx * 0.034, 0.0105, -0.008));
    s.rotation.y = r; s.position.set(x, 0.012 + y * 0.3, (i - 1) * 0.012 + (i === 2 ? 0.03 : 0));
    g.add(bite(s, i));
  });
  return g;
}

// =================================================================== convenience snacks (Night Owl Mart)
export function snackBag({ color = '#ffd23f', accent = '#d62828', label = 'CRUNCHOS', sub = 'SEA SALT', emoji = '🥔', chip = '#f2c14e', w = 0.15, h = 0.2, chips = true }) {
  const g = new THREE.Group();
  const foil = mat(color, { rough: 0.25, metal: 0.35, clearcoat: 0.5 });
  const bag = new THREE.Group();
  bag.add(at(rbox(w, h, 0.05, 0.022, foil), 0, h / 2, 0));
  bag.add(at(box(w * 0.98, 0.014, 0.012, foil), 0, h - 0.002, 0), at(box(w * 0.98, 0.014, 0.012, foil), 0, 0.006, 0));
  const lab = logoDecal(`bag:${label}:${color}`, w * 0.86, h * 0.68, { bg: color, fg: accent, title: label, sub, emoji, round: 0.08 });
  lab.position.set(0, h * 0.5, 0.0255); bag.add(lab);
  bag.rotation.x = -0.12;
  g.add(bite(at(bag, 0, 0.004, -0.01), 9));
  if (chips) {
    const cm = FLAT(chip, 0.6);
    [[-0.04, 0.05, 0.3], [0.02, 0.06, 1.2], [0.045, 0.045, 2.2]].forEach(([x, z, r], i) => { const c = sph(0.022, cm, 9, 6); c.scale.set(1, 0.12, 0.8); c.rotation.set(0.2, r, 0.15); g.add(bite(at(c, x, 0.004, z), i)); });
  }
  return g;
}
function candyBar() {
  const g = new THREE.Group();
  const wrap = mat('#6a2c91', { rough: 0.3, metal: 0.4 });
  const wr = labelBoxSimple(0.075, 0.016, 0.042, wrap, 'NOVA', '#ffd23f', '#6a2c91');
  g.add(bite(at(wr, -0.0325, 0.008, 0), 9));
  g.add(at(rot(box(0.006, 0.02, 0.046, mat('#c0c4ca', { rough: 0.3, metal: 0.9, flat: true })), 0, 0, 0.12), 0.006, 0.009, 0));
  const ch = mat('#4a2716', { rough: 0.35, clearcoat: 0.4 });
  for (let i = 0; i < 3; i++) g.add(bite(at(rbox(0.017, 0.012, 0.038, 0.003, ch), 0.019 + i * 0.019, 0.007, 0), 2 - i));
  return g;
}
function labelBoxSimple(w, h, d, bodyMat, title, fg, bg) {
  const m = box(w, h, d, bodyMat);
  const t = decal(w * 0.95, d * 0.8, `food:bar:${title}:${bg}`, (ctx, W, H) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = fg; ctx.font = `900 ${H * 0.55}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, title, W / 2, H / 2, W * 0.8); }, { tw: 256 });
  t.rotation.x = -PI / 2; t.position.y = h / 2 + 0.0005; m.add(t);
  return m;
}
function popcornBucket() {
  const g = new THREE.Group();
  const tex = TX('popcorn', 256, 128, (ctx, W, H) => {
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#fbf8f0' : '#d62828'; ctx.fillRect(i * W / 16, 0, W / 16 + 1, H); }
    ctx.fillStyle = '#fbf8f0'; ctx.fillRect(0, H * 0.38, W, H * 0.26); ctx.fillStyle = '#d62828'; ctx.font = `900 ${H * 0.2}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'POPCORN', W * 0.25, H * 0.51, W * 0.4); fitText(ctx, 'POPCORN', W * 0.75, H * 0.51, W * 0.4);
  });
  g.add(labeledCup({ rb: 0.045, rt: 0.065, h: 0.15, map: tex }));
  const pm = [FLAT('#fff1c4', 0.7), FLAT('#ffe08a', 0.7), FLAT('#fff8e3', 0.7)];
  const rnd = seeded(51);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * 0.055;
    const p = sph(0.012 + rnd() * 0.004, pm[i % 3], 7, 5); p.rotation.set(rnd() * 3, rnd() * 3, 0);
    g.add(bite(at(p, Math.cos(a) * rr, 0.152 + (0.055 - rr) * 0.45 + rnd() * 0.01, Math.sin(a) * rr), i % 5));
  }
  return g;
}
function cupNoodles() {
  const g = new THREE.Group();
  const tex = bandLabel('cupnoodle', '#fbf8f0', '#d62828', 'NOODLE', 'MIDNIGHT CUP', '#d62828');
  g.add(labeledCup({ rb: 0.034, rt: 0.045, h: 0.1, map: tex, rough: 0.5 }));
  const broth = cyl(0.041, 0.035, 0.07, mat('#d9a14a', { rough: 0.25 }), 24); g.add(bite(at(broth, 0, 0.055, 0), 9));
  g.add(...noodles(5, { w: 0.06, d: 0.05, y: 0.09, r: 0.0022, m: F('#f2d27a', 0.45), seed: 61, amp: 0.008 }).map((n, i) => bite(n, i % 4)));
  for (let i = 0; i < 6; i++) g.add(bite(at(rbox(0.006, 0.003, 0.006, 0.001, F(['#f08a24', '#5cb340', '#f6c431'][i % 3], 0.5)), Math.cos(i * 1.1) * 0.022, 0.093, Math.sin(i * 1.1) * 0.022), i % 4));
  const lid = cylPart(0.046, 0.002, 0, PI * 1.2, mat('#f4f4f4', { rough: 0.3, metal: 0.6 }), 20);
  lid.rotation.set(-1.25, 0, 0); g.add(at(lid, 0, 0.12, -0.04));
  const f = fork(0.13); f.rotation.set(0, 0.5, -0.9); g.add(at(f, 0.005, 0.12, 0.01));
  return g;
}

// =================================================================== leftovers (hidden trash)
function emptyPizzaBox() { return pizzaBox({ open: false }); }
function closedLid(g, w, d, h, m, decalKey, draw) { g.add(at(box(w, 0.004, d, m), 0, h, 0)); if (draw) { const dc = decal(w * 0.8, d * 0.8, decalKey, draw, { tw: 256 }); dc.rotation.x = -PI / 2; at(dc, 0, h + 0.0025, 0); g.add(dc); } return g; }
export function emptyBowl(color = '#c9a57a') { return group(bowlShell(0.09, 0.06, F(color, 0.9)), at(cyl(0.07, 0.04, 0.002, F('#b6905f', 0.9), 20), 0, 0.03, 0)); }
function emptyFoodTray() { return tray({ w: 0.16, d: 0.12, h: 0.035, m: FLAT('#ece4d4', 0.95) }); }
function emptyPail() { return pail(); }
function emptyBucket() { const g = chickenBucket(); g.children.splice(2); return g; }
function emptyDonutBox() { const g = boxWithLid({ w: 0.3, d: 0.2, h: 0.06, color: '#ffb3c6', print: '#c9184a', label: '', angle: 0 }); return closedLid(g, 0.3, 0.2, 0.062, mat('#ffb3c6', { rough: 0.8 }), 'food:lidtop:donut', (ctx, W, H) => { ctx.fillStyle = '#ffb3c6'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#c9184a'; ctx.font = `900 ${H * 0.18}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, 'GLAZED & CONFUSED', W / 2, H / 2, W * 0.9); }); }
function emptyPint() { const g = pint(); g.children.splice(1, 7); return g; }
function emptyBakeryBag() { const b = rbox(0.11, 0.025, 0.16, 0.01, FLAT('#c49a6c', 0.95)); b.rotation.y = 0.4; return group(at(b, 0, 0.0125, 0)); }
function emptyChipBag() { const b = rbox(0.15, 0.012, 0.19, 0.005, mat('#c9cdd2', { rough: 0.3, metal: 0.7, flat: true })); b.rotation.y = -0.3; return group(at(b, 0, 0.006, 0)); }
function emptyNoodleCup() { const g = cupNoodles(); g.children.splice(1); return g; }
function emptyFryCarton() { return friesCarton({ n: 0 }); }
function closedPizzaBox() {
  const g = pizzaBox({ open: false });
  return closedLid(g, 0.37, 0.37, 0.044, mat('#d9b68a', { rough: 0.92 }), 'food:lidtop:pizza', (ctx, W, H) => { ctx.fillStyle = '#d9b68a'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#c1121f'; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, W * 0.2, 0, 7); ctx.fill(); ctx.font = `${W * 0.2}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🍕', W / 2, H * 0.43); ctx.fillStyle = '#c1121f'; ctx.font = `900 ${W * 0.1}px ${FONT}`; fitText(ctx, 'SLICE HOUSE', W / 2, H * 0.78, W * 0.8); });
}
void emptyPizzaBox; void scl; void plane;

// =================================================================== definitions
// GrubHop meal / Dashr treat shorthand
const meal = (restaurant, o) => ({ category: 'food', stores: ['grubhop'], restaurant, rarity: 'common', ...o, use: { type: 'eat', sound: 'bite', ...o.use } });
const treat = (restaurant, o) => ({ category: 'food', stores: ['dashr'], restaurant, rarity: 'common', ...o, use: { type: 'eat', sound: 'bite', sweet: true, ...o.use } });
const trash = (o) => ({ category: 'misc', price: 0, hidden: true, stores: [], tags: ['trash'], ...o });

defineItems([
  // ------------------------------------------------ Smash Bros. Burgers
  meal('smashbros', { id: 'burger_bacon_double', name: 'Bacon Double Smash', price: 14.5, emoji: '🥓', desc: 'Two lacy-edged patties, double cheese, crispy bacon. A two-napkin situation.', build: () => burgerStack({ layers: ['patty', 'cheese', 'bacon', 'patty', 'cheese', 'pickles', 'sauce'] }), use: { bites: 6, needs: { hunger: 60, fun: 6 }, buff: 'wellFed', buffMin: 240, crumbs: '#d18a3c', hot: true, cuisine: 'american', leftover: 'wrapper', emoji: '🍔' } }),
  meal('smashbros', { id: 'burger_mushroom_swiss', name: 'Shroom & Swiss Burger', price: 13.5, emoji: '🍄', desc: 'Garlicky mushrooms, melty Swiss and grilled onions on a glossy brioche bun.', build: () => burgerStack({ brioche: true, seeds: false, bun: '#b8642a', layers: ['patty', 'swiss', 'mushroom', 'onion', 'lettuce'], paper: '#6d4c41' }), use: { bites: 5, needs: { hunger: 50, fun: 4, comfort: 3 }, buff: 'wellFed', buffMin: 200, crumbs: '#b8642a', hot: true, cuisine: 'american', leftover: 'wrapper', emoji: '🍔' } }),
  meal('smashbros', { id: 'burger_garden', name: 'Garden Smash (Veggie)', price: 12.5, emoji: '🌱', desc: 'Plant-based patty, avocado, crunchy lettuce and tomato. Tastes like a win.', build: () => burgerStack({ layers: ['veggie', 'avocado', 'lettuce', 'tomato', 'onion'], paper: '#52b788' }), use: { bites: 5, needs: { hunger: 45, fun: 3 }, buff: 'wellFed', buffMin: 180, crumbs: '#d18a3c', hot: true, healthy: true, cuisine: 'american', leftover: 'wrapper', emoji: '🍔' } }),
  meal('smashbros', { id: 'fries_classic', name: 'Shoestring Fries', price: 4.5, emoji: '🍟', desc: 'Crispy, salty, gone in sixty seconds.', build: () => friesCarton({}), use: { bites: 4, needs: { hunger: 20, fun: 4 }, sound: 'crunch', crumbs: '#f4bd4f', hot: true, cuisine: 'american', leftover: 'empty_fry_carton' } }),
  meal('smashbros', { id: 'onion_rings', name: 'Beer-Battered Onion Rings', price: 5.5, emoji: '🧅', desc: 'Golden rings with a shatter-crisp crunch and a cup of ketchup.', build: onionRings, use: { bites: 5, needs: { hunger: 20, fun: 4 }, sound: 'crunch', crumbs: '#c9822f', hot: true, cuisine: 'american', leftover: 'empty_food_tray' } }),
  // ------------------------------------------------ Slice House Pizza
  meal('slicehouse', { id: 'pizza_pepperoni_whole', name: 'Whole Pepperoni Pizza', price: 19.99, emoji: '🍕', packaging: 'box', desc: 'Eight cup-and-char pepperoni slices. Share it, or don\'t.', build: () => pizzaInBox('pepperoni'), use: { bites: 8, needs: { hunger: 60, fun: 12, comfort: 6 }, buff: 'wellFed', buffMin: 300, crumbs: '#c98238', hot: true, cuisine: 'italian', leftover: 'empty_pizza_box' } }),
  meal('slicehouse', { id: 'pizza_margherita_whole', name: 'Margherita Pizza', price: 17.99, emoji: '🍕', packaging: 'box', desc: 'San Marzano sauce, fresh mozzarella, basil. Classic for a reason.', build: () => pizzaInBox('margherita'), use: { bites: 8, needs: { hunger: 55, fun: 10, comfort: 6 }, buff: 'wellFed', buffMin: 300, crumbs: '#c98238', hot: true, cuisine: 'italian', leftover: 'empty_pizza_box' } }),
  meal('slicehouse', { id: 'pizza_veggie_whole', name: 'Garden Veggie Pizza', price: 18.99, emoji: '🫑', packaging: 'box', desc: 'Peppers, olives and mushrooms. Technically a salad.', build: () => pizzaInBox('veggie'), use: { bites: 8, needs: { hunger: 55, fun: 10, comfort: 5 }, buff: 'wellFed', buffMin: 300, crumbs: '#c98238', hot: true, cuisine: 'italian', leftover: 'empty_pizza_box' } }),
  meal('slicehouse', { id: 'garlic_knots', name: 'Garlic Knots', price: 6.5, emoji: '🧄', desc: 'Six buttery knots, parsley, parmesan and a cup of marinara.', build: garlicKnots, use: { bites: 6, needs: { hunger: 22, comfort: 4 }, crumbs: '#e3a453', hot: true, cuisine: 'italian', leftover: 'empty_food_tray' } }),
  meal('slicehouse', { id: 'cannoli_trio', name: 'Cannoli Trio', price: 8.5, emoji: '🥐', desc: 'Crackly shells, sweet ricotta, chocolate chips & pistachio.', build: cannoli, use: { bites: 3, needs: { hunger: 18, fun: 6 }, buff: 'sugarRush', buffMin: 90, sound: 'crunch', crumbs: '#c98a45', sweet: true, cuisine: 'italian', emoji: '😋' } }),
  // ------------------------------------------------ Koi Sushi Bar
  meal('koisushi', { id: 'sushi_platter', name: 'Chef\'s Sushi Platter', price: 29, rarity: 'uncommon', emoji: '🍣', desc: 'Salmon, tuna and ebi nigiri plus tekka & kappa maki on a wooden geta.', build: sushiPlatter, use: { bites: 8, needs: { hunger: 55, fun: 6, comfort: 4 }, buff: 'wellFed', buffMin: 240, crumbs: '#f7f4ec', healthy: true, cuisine: 'japanese' } }),
  meal('koisushi', { id: 'california_roll', name: 'California Roll', price: 9.5, emoji: '🍱', desc: 'Crab, avocado and cucumber rolled inside-out in orange tobiko.', build: californiaRoll, use: { bites: 8, needs: { hunger: 32, fun: 3 }, crumbs: '#f7f4ec', healthy: true, cuisine: 'japanese' } }),
  meal('koisushi', { id: 'miso_soup', name: 'Miso Soup', price: 3.5, emoji: '🥣', desc: 'Silky tofu, wakame and scallions in a warm lacquer bowl.', build: misoSoup, use: { bites: 4, needs: { hunger: 12, thirst: 10, comfort: 8 }, buff: 'cozy', buffMin: 120, sound: 'slurp', hot: true, healthy: true, cuisine: 'japanese' } }),
  meal('koisushi', { id: 'edamame_bowl', name: 'Sea Salt Edamame', price: 5.5, emoji: '🫛', desc: 'Steamed pods, flaky salt. Pop, pop, pop.', build: edamame, use: { bites: 6, needs: { hunger: 15, fun: 2 }, crumbs: '#7cb342', healthy: true, cuisine: 'japanese' } }),
  meal('koisushi', { id: 'hanami_dango', name: 'Hanami Dango', price: 6.5, season: 'spring', rarity: 'uncommon', emoji: '🍡', desc: 'Pink, white and green mochi skewers — cherry-blossom season only.', build: hanamiDango, use: { bites: 6, needs: { hunger: 15, fun: 6, comfort: 4 }, buff: 'calm', buffMin: 120, crumbs: '#f3a6bd', sweet: true, cuisine: 'japanese', emoji: '🌸' } }),
  // ------------------------------------------------ Noodle Nook
  meal('noodlenook', { id: 'ramen_tonkotsu', name: 'Tonkotsu Ramen', price: 16.5, emoji: '🍜', desc: '18-hour pork broth, chashu, jammy ajitama egg, nori and naruto.', build: () => ramen({ toppings: 'tonkotsu' }), use: { bites: 6, needs: { hunger: 58, comfort: 10, thirst: 6 }, buff: 'cozy', buffMin: 240, sound: 'slurp', hot: true, cuisine: 'japanese', crumbs: '#f2d27a' } }),
  meal('noodlenook', { id: 'ramen_spicy_miso', name: 'Spicy Miso Ramen', price: 16.75, emoji: '🌶️', desc: 'Red miso broth, chili oil, sweet corn, ground pork and sprouts. Brings the heat.', build: () => ramen({ broth: '#c9572b', toppings: 'miso' }), use: { bites: 6, needs: { hunger: 58, comfort: 8, fun: 5 }, buff: 'wellFed', buffMin: 240, sound: 'slurp', hot: true, cuisine: 'japanese', crumbs: '#f2d27a' } }),
  meal('noodlenook', { id: 'udon_tempura', name: 'Tempura Udon', price: 15.5, emoji: '🍤', desc: 'Thick, bouncy udon in dashi with two crunchy tempura shrimp.', build: udon, use: { bites: 6, needs: { hunger: 52, comfort: 8 }, buff: 'cozy', buffMin: 200, sound: 'slurp', hot: true, cuisine: 'japanese', crumbs: '#d99a3f' } }),
  meal('noodlenook', { id: 'pho_beef', name: 'Beef Pho', price: 15, emoji: '🍲', desc: 'Star-anise broth, rice noodles, thin-sliced beef, basil and lime.', build: pho, use: { bites: 6, needs: { hunger: 50, thirst: 8, comfort: 8 }, buff: 'cozy', buffMin: 200, sound: 'slurp', hot: true, healthy: true, cuisine: 'vietnamese', crumbs: '#fbf8f0' } }),
  meal('noodlenook', { id: 'gyoza_plate', name: 'Pan-Fried Gyoza (6)', price: 8.5, emoji: '🥟', desc: 'Pork & cabbage dumplings with crispy lace bottoms and dipping sauce.', build: gyoza, use: { bites: 6, needs: { hunger: 25, fun: 3 }, crumbs: '#b36a24', hot: true, cuisine: 'japanese' } }),
  // ------------------------------------------------ Taco Loco
  meal('tacoloco', { id: 'tacos_al_pastor', name: 'Tacos al Pastor (3)', price: 11.5, emoji: '🌮', desc: 'Spit-roasted pork, pineapple, onion and cilantro on charred corn tortillas.', build: () => tacoTray('pastor'), use: { bites: 5, needs: { hunger: 42, fun: 5 }, buff: 'wellFed', buffMin: 180, crumbs: '#e9c27a', hot: true, cuisine: 'mexican', leftover: 'empty_food_tray' } }),
  meal('tacoloco', { id: 'tacos_baja_fish', name: 'Baja Fish Tacos (3)', price: 12.5, emoji: '🐟', desc: 'Beer-battered fish, purple cabbage, lime crema on flour tortillas.', build: () => tacoTray('fish'), use: { bites: 5, needs: { hunger: 40, fun: 5 }, buff: 'wellFed', buffMin: 180, crumbs: '#f2e2b8', hot: true, cuisine: 'mexican', leftover: 'empty_food_tray' } }),
  meal('tacoloco', { id: 'burrito_carne_asada', name: 'Carne Asada Burrito', price: 12.75, emoji: '🌯', desc: 'Foil-wrapped, cut in half, packed with steak, rice, beans and salsa.', build: burrito, use: { bites: 6, needs: { hunger: 60, fun: 4 }, buff: 'wellFed', buffMin: 260, crumbs: '#f1ddb0', hot: true, cuisine: 'mexican', leftover: 'wrapper' } }),
  meal('tacoloco', { id: 'quesadilla', name: 'Three-Cheese Quesadilla', price: 10.5, emoji: '🧀', desc: 'Griddled, gooey, with sour cream and salsa roja.', build: quesadilla, use: { bites: 4, needs: { hunger: 40, comfort: 5 }, buff: 'wellFed', buffMin: 160, crumbs: '#e8c27c', hot: true, cuisine: 'mexican' } }),
  meal('tacoloco', { id: 'nachos_loaded', name: 'Loaded Nachos', price: 11, emoji: '🫔', desc: 'Chips buried in queso, jalapeños, pico and crema. Messy by design.', build: nachos, use: { bites: 6, needs: { hunger: 38, fun: 8 }, sound: 'crunch', crumbs: '#eab54d', cuisine: 'mexican', leftover: 'empty_food_tray' } }),
  meal('tacoloco', { id: 'churros', name: 'Churros & Chocolate', price: 6, emoji: '🍫', desc: 'Cinnamon-sugar churros with a cup of thick dipping chocolate.', build: churros, use: { bites: 3, needs: { hunger: 16, fun: 6 }, buff: 'sugarRush', buffMin: 90, sound: 'crunch', crumbs: '#c98642', sweet: true, cuisine: 'mexican' } }),
  // ------------------------------------------------ Green Bowl
  meal('greenbowl', { id: 'poke_bowl_salmon', name: 'Salmon Poke Bowl', price: 16.5, emoji: '🥗', desc: 'Sushi rice, salmon, avocado, mango, edamame, seaweed salad and spicy mayo.', build: pokeBowl, use: { bites: 6, needs: { hunger: 50, fun: 3 }, buff: 'vitalized', buffMin: 240, healthy: true, cuisine: 'hawaiian', crumbs: '#f7f4ec', leftover: 'empty_paper_bowl' } }),
  meal('greenbowl', { id: 'salad_caesar_chicken', name: 'Grilled Chicken Caesar', price: 13.5, emoji: '🥬', desc: 'Crisp romaine, garlicky croutons, shaved parmesan, char-grilled chicken.', build: caesarSalad, use: { bites: 5, needs: { hunger: 42 }, buff: 'vitalized', buffMin: 200, sound: 'crunch', healthy: true, cuisine: 'american', crumbs: '#8bc34a' } }),
  meal('greenbowl', { id: 'acai_bowl', name: 'Açaí Power Bowl', price: 12.5, emoji: '🫐', desc: 'Thick açaí blend, banana, berries, granola and coconut in a coconut shell.', build: acaiBowl, use: { bites: 5, needs: { hunger: 32, energy: 8, fun: 4 }, buff: 'vitalized', buffMin: 240, healthy: true, sweet: true, cuisine: 'brazilian', crumbs: '#4a1f5c' } }),
  meal('greenbowl', { id: 'wrap_chicken_pesto', name: 'Pesto Chicken Wrap', price: 12, emoji: '🌯', desc: 'Spinach tortilla, basil pesto, chicken, tomato and greens. Lunch, handled.', build: () => wrapHalves({}), use: { bites: 3, needs: { hunger: 40 }, buff: 'vitalized', buffMin: 160, healthy: true, cuisine: 'mediterranean', crumbs: '#a5c96b' } }),
  // ------------------------------------------------ Saffron Curry House
  meal('curryhouse', { id: 'thali_butter_chicken', name: 'Butter Chicken Thali', price: 18.5, emoji: '🍛', desc: 'Velvety butter chicken, saffron basmati, garlic naan, raita and pickle.', build: () => thali({}), use: { bites: 6, needs: { hunger: 60, comfort: 10 }, buff: 'wellFed', buffMin: 300, hot: true, cuisine: 'indian', crumbs: '#efcf8f' } }),
  meal('curryhouse', { id: 'thali_palak_paneer', name: 'Palak Paneer Thali', price: 16.5, emoji: '🥬', desc: 'Creamy spinach with soft paneer cubes, basmati, naan and raita.', build: () => thali({ curry: '#4c7a2a', chunkShape: 'paneer' }), use: { bites: 6, needs: { hunger: 55, comfort: 8 }, buff: 'wellFed', buffMin: 280, hot: true, healthy: true, cuisine: 'indian', crumbs: '#efcf8f' } }),
  meal('curryhouse', { id: 'biryani_chicken', name: 'Hyderabadi Chicken Biryani', price: 18, emoji: '🍚', desc: 'Saffron-layered rice slow-cooked in a clay handi, crispy onions on top.', build: biryani, use: { bites: 6, needs: { hunger: 58, comfort: 6, fun: 4 }, buff: 'wellFed', buffMin: 300, hot: true, cuisine: 'indian', crumbs: '#f7efd8' } }),
  meal('curryhouse', { id: 'samosas', name: 'Samosa Trio', price: 7, emoji: '🔺', desc: 'Flaky pastry stuffed with spiced potato & peas, with mint and tamarind chutneys.', build: samosas, use: { bites: 3, needs: { hunger: 24, fun: 3 }, sound: 'crunch', hot: true, cuisine: 'indian', crumbs: '#d9a04c' } }),
  meal('curryhouse', { id: 'garlic_naan', name: 'Garlic Naan Basket', price: 4.75, emoji: '🫓', desc: 'Blistered from the tandoor, brushed with garlic butter & cilantro.', build: naanBasket, use: { bites: 3, needs: { hunger: 18, comfort: 4 }, hot: true, cuisine: 'indian', crumbs: '#efcf8f' } }),
  // ------------------------------------------------ Wok Star
  meal('wokstar', { id: 'dumplings_xlb', name: 'Soup Dumplings (7)', price: 10.5, emoji: '🥟', desc: 'Xiao long bao in a bamboo steamer. Nibble, sip, then devour.', build: dumplingSteamer, use: { bites: 7, needs: { hunger: 30, comfort: 6 }, buff: 'cozy', buffMin: 120, hot: true, cuisine: 'chinese', crumbs: '#f6eed9' } }),
  meal('wokstar', { id: 'orange_chicken', name: 'Orange Chicken', price: 13, emoji: '🍊', desc: 'Crispy chicken tossed in sticky orange glaze, with broccoli, in the classic pail.', build: () => pailWithFood('WOK STAR', '#d62828', 'orange'), use: { bites: 5, needs: { hunger: 50, fun: 6 }, buff: 'wellFed', buffMin: 220, hot: true, cuisine: 'chinese', crumbs: '#d65f12', leftover: 'empty_takeout_pail' } }),
  meal('wokstar', { id: 'lo_mein', name: 'Veggie Lo Mein', price: 12, emoji: '🥡', desc: 'Wok-tossed noodles with carrots, bok choy and a soy-sesame glaze.', build: () => pailWithFood('WOK STAR', '#d62828', 'noodles'), use: { bites: 5, needs: { hunger: 48, comfort: 4 }, buff: 'wellFed', buffMin: 200, sound: 'slurp', hot: true, cuisine: 'chinese', crumbs: '#c99a4f', leftover: 'empty_takeout_pail' } }),
  meal('wokstar', { id: 'pad_thai', name: 'Shrimp Pad Thai', price: 14.5, emoji: '🍤', desc: 'Tamarind-glazed rice noodles, shrimp, peanuts, sprouts and lime.', build: padThai, use: { bites: 5, needs: { hunger: 52, fun: 4 }, buff: 'wellFed', buffMin: 220, hot: true, cuisine: 'thai', crumbs: '#e3a868' } }),
  meal('wokstar', { id: 'spring_rolls', name: 'Crispy Spring Rolls (4)', price: 6.5, emoji: '🥢', desc: 'Shatteringly crisp veggie rolls with sweet chili sauce.', build: springRolls, use: { bites: 4, needs: { hunger: 18, fun: 3 }, sound: 'crunch', hot: true, cuisine: 'chinese', crumbs: '#d99a3e' } }),
  // ------------------------------------------------ Cluck Hut
  meal('cluckhut', { id: 'chicken_bucket', name: '7-Piece Chicken Bucket', price: 24.99, emoji: '🍗', desc: 'Buttermilk-brined, extra crispy, served in the iconic striped bucket.', build: chickenBucket, use: { bites: 7, needs: { hunger: 60, fun: 8, comfort: 6 }, buff: 'wellFed', buffMin: 300, sound: 'crunch', hot: true, cuisine: 'southern', crumbs: '#c47a2a', leftover: 'empty_chicken_bucket' } }),
  meal('cluckhut', { id: 'wings_buffalo', name: 'Buffalo Wings (8)', price: 13.5, emoji: '🔥', desc: 'Sticky, saucy, with celery sticks and cool ranch.', build: wings, use: { bites: 8, needs: { hunger: 40, fun: 8 }, buff: 'wellFed', buffMin: 180, hot: true, cuisine: 'american', crumbs: '#c8401a' } }),
  meal('cluckhut', { id: 'tenders_basket', name: 'Tender Basket', price: 12, emoji: '🍗', desc: 'Four golden tenders, fries and honey mustard in a checkered basket.', build: tendersBasket, use: { bites: 6, needs: { hunger: 45, fun: 5 }, buff: 'wellFed', buffMin: 200, sound: 'crunch', hot: true, cuisine: 'american', crumbs: '#d08b36' } }),
  meal('cluckhut', { id: 'chicken_sandwich_hot', name: 'Nashville Hot Chicken Sandwich', price: 12.5, emoji: '🌶️', desc: 'Cayenne-glazed fried chicken, pickles and slaw on brioche. Sweat responsibly.', build: () => burgerStack({ brioche: true, seeds: false, bun: '#b8642a', layers: ['slaw', 'hotchicken', 'pickles'], paper: '#f77f00' }), use: { bites: 5, needs: { hunger: 50, fun: 6 }, buff: 'wellFed', buffMin: 220, hot: true, cuisine: 'southern', crumbs: '#b8642a', leftover: 'wrapper' } }),
  // ------------------------------------------------ Sunny Side Diner
  meal('sunnyside', { id: 'pancake_stack', name: 'Blueberry Pancake Stack', price: 11, emoji: '🥞', desc: 'Four fluffy buttermilk pancakes, whipped butter, real maple syrup.', build: () => group(plate({ r: 0.1, color: '#cfe3ec' }), pancakeStack(4)), use: { bites: 5, needs: { hunger: 45, comfort: 8, fun: 4 }, buff: 'wellFed', buffMin: 220, sweet: true, hot: true, cuisine: 'american', crumbs: '#bd7432' } }),
  meal('sunnyside', { id: 'waffles_berry', name: 'Strawberry Waffles', price: 12, emoji: '🧇', desc: 'Belgian waffles, fresh strawberries and a cloud of whipped cream.', build: wafflePlate, use: { bites: 5, needs: { hunger: 42, fun: 6 }, buff: 'sugarRush', buffMin: 120, sweet: true, hot: true, cuisine: 'american', crumbs: '#c47a2c' } }),
  meal('sunnyside', { id: 'eggs_benedict', name: 'Eggs Benedict', price: 15, emoji: '🍳', desc: 'Poached eggs, Canadian bacon and lemony hollandaise on English muffins.', build: eggsBenedict, use: { bites: 5, needs: { hunger: 48, comfort: 8 }, buff: 'wellFed', buffMin: 240, hot: true, cuisine: 'american', crumbs: '#f6c445' } }),
  meal('sunnyside', { id: 'avocado_toast', name: 'Smashed Avocado Toast', price: 12.5, emoji: '🥑', desc: 'Sourdough, smashed avo, radish, chili flakes and a jammy egg.', build: avocadoToast, use: { bites: 4, needs: { hunger: 35, energy: 4 }, buff: 'vitalized', buffMin: 180, sound: 'crunch', healthy: true, cuisine: 'american', crumbs: '#9c5f26' } }),
  meal('sunnyside', { id: 'breakfast_platter', name: 'Lumberjack Breakfast', price: 14.5, emoji: '🍽️', desc: 'Two eggs, bacon, sausage, hash browns and toast. Naps not included.', build: bigBreakfast, use: { bites: 6, needs: { hunger: 60, comfort: 6, energy: 4 }, buff: 'wellFed', buffMin: 300, hot: true, cuisine: 'american', crumbs: '#c98b45' } }),
  // ------------------------------------------------ Glazed & Confused (Dashr)
  treat('glazed', { id: 'donut_box_six', name: 'Half-Dozen Donut Box', price: 14.99, emoji: '🍩', packaging: 'box', desc: 'Six fresh donuts: strawberry, chocolate, vanilla, maple and friends.', build: donutBox, use: { bites: 6, needs: { hunger: 45, fun: 12 }, buff: 'sugarRush', buffMin: 150, crumbs: '#d9a35a', leftover: 'empty_donut_box' } }),
  treat('glazed', { id: 'donut_strawberry_sprinkle', name: 'Strawberry Sprinkle Donut', price: 2.95, emoji: '🍩', desc: 'Pink glaze, rainbow sprinkles. The cartoon donut, made real.', build: () => singleDonut({ glaze: '#f48fb1', sprinkles: 4 }), use: { bites: 4, needs: { hunger: 12, fun: 5 }, buff: 'sugarRush', buffMin: 60, crumbs: '#d9a35a' } }),
  treat('glazed', { id: 'donut_chocolate', name: 'Chocolate Frosted Donut', price: 3.25, emoji: '🍫', desc: 'Fudgy chocolate frosting with a vanilla drizzle.', build: () => singleDonut({ glaze: '#4a2c1d', drizzle: '#fff6e8' }), use: { bites: 4, needs: { hunger: 12, fun: 5 }, buff: 'sugarRush', buffMin: 60, crumbs: '#4a2c1d' } }),
  treat('glazed', { id: 'donut_boston_cream', name: 'Boston Cream', price: 3.5, emoji: '🍮', desc: 'Pillowy, custard-filled, crowned with chocolate ganache.', build: bostonCream, use: { bites: 3, needs: { hunger: 14, fun: 5 }, buff: 'sugarRush', buffMin: 60, crumbs: '#d9a35a' } }),
  treat('glazed', { id: 'maple_bacon_bar', name: 'Maple Bacon Bar', price: 4.25, emoji: '🥓', desc: 'A long john with maple glaze and candied bacon. Sweet, salty, perfect.', build: mapleBar, use: { bites: 3, needs: { hunger: 16, fun: 6 }, buff: 'sugarRush', buffMin: 60, crumbs: '#b8662a' } }),
  // ------------------------------------------------ Big Scoops (Dashr)
  treat('scoops', { id: 'icecream_cone_double', name: 'Double Scoop Waffle Cone', price: 6.25, emoji: '🍦', desc: 'Mint chip and strawberry stacked on a fresh waffle cone.', build: iceCreamCone, use: { bites: 4, needs: { hunger: 14, fun: 8, comfort: 4 }, buff: 'sugarRush', buffMin: 90, sound: 'slurp', crumbs: '#d99a4e' } }),
  treat('scoops', { id: 'sundae_hot_fudge', name: 'Hot Fudge Sundae', price: 8.75, emoji: '🍨', desc: 'Three scoops, hot fudge, whipped cream, nuts and a cherry on top.', build: sundae, use: { bites: 5, needs: { hunger: 20, fun: 12, comfort: 6 }, buff: 'treatYoself', buffMin: 120, sound: 'slurp', crumbs: '#3b1d10' } }),
  treat('scoops', { id: 'icecream_pint', name: 'Cookie Dough Pint', price: 7.99, emoji: '🍪', desc: 'A whole pint, a spoon, and absolutely no plans to share.', build: pint, use: { bites: 6, needs: { hunger: 22, fun: 10, comfort: 8 }, buff: 'treatYoself', buffMin: 120, sound: 'slurp', crumbs: '#f6ead0', leftover: 'empty_icecream_cup' } }),
  treat('scoops', { id: 'banana_split', name: 'Banana Split', price: 10.5, emoji: '🍌', desc: 'Vanilla, chocolate and strawberry between banana halves, fudge drizzle.', build: bananaSplit, use: { bites: 5, needs: { hunger: 24, fun: 12 }, buff: 'sugarRush', buffMin: 150, sound: 'slurp', crumbs: '#f3df9b' } }),
  treat('scoops', { id: 'popsicle_rocket', name: 'Rocket Pop', price: 2.5, season: 'summer', emoji: '🚀', desc: 'Cherry, lemon, blue raspberry. Tastes exactly like July.', build: rocketPop, use: { bites: 3, needs: { hunger: 6, thirst: 8, fun: 6 }, buff: 'sugarRush', buffMin: 60, sound: 'slurp', crumbs: '#e5383b' } }),
  // ------------------------------------------------ Crumb Bakery (Dashr)
  treat('crumb', { id: 'croissant_butter', name: 'Butter Croissant', price: 4.25, emoji: '🥐', desc: '81 flaky layers. Crumbs everywhere. Worth it.', build: croissant, use: { bites: 4, needs: { hunger: 18, comfort: 4 }, sound: 'crunch', crumbs: '#e0a052', sweet: false, cuisine: 'french' } }),
  treat('crumb', { id: 'cupcake_red_velvet', name: 'Red Velvet Cupcake', price: 4.5, emoji: '🧁', desc: 'Cocoa-kissed red velvet with a tall cream cheese swirl.', build: () => cupcake({}), use: { bites: 3, needs: { hunger: 12, fun: 6 }, buff: 'sugarRush', buffMin: 90, crumbs: '#8e1d2b' } }),
  treat('crumb', { id: 'cake_slice_chocolate', name: 'Triple Chocolate Cake', price: 7.5, emoji: '🍰', desc: 'Devil\'s food layers, silky ganache and fresh raspberries.', build: cakeSlice, use: { bites: 3, needs: { hunger: 18, fun: 8, comfort: 5 }, buff: 'treatYoself', buffMin: 120, crumbs: '#4a2617' } }),
  treat('crumb', { id: 'cookies_choc_chip', name: 'Chocolate Chip Cookies (3)', price: 5.5, emoji: '🍪', desc: 'Crispy edges, gooey middles, still warm from the oven.', build: cookieBag, use: { bites: 3, needs: { hunger: 15, fun: 6, comfort: 4 }, buff: 'sugarRush', buffMin: 90, crumbs: '#c98b4a', hot: true, leftover: 'empty_bakery_bag' } }),
  treat('crumb', { id: 'cinnamon_roll', name: 'Cinnamon Roll', price: 5.25, emoji: '🌀', desc: 'Soft, swirly, generously iced. Smells like Saturday morning.', build: cinnamonRoll, use: { bites: 3, needs: { hunger: 18, comfort: 6 }, buff: 'cozy', buffMin: 120, crumbs: '#e2a960', hot: true } }),
  treat('crumb', { id: 'macarons_six', name: 'Macaron Box (6)', price: 14, rarity: 'uncommon', emoji: '🌈', desc: 'Raspberry, pistachio, lavender, lemon, chocolate & vanilla. Très chic.', build: macaronBox, use: { bites: 6, needs: { hunger: 12, fun: 8, comfort: 4 }, buff: 'treatYoself', buffMin: 150, crumbs: '#f7a8c4', cuisine: 'french' } }),
  treat('crumb', { id: 'pumpkin_pie', name: 'Whole Pumpkin Pie', price: 21, season: 'autumn', rarity: 'uncommon', emoji: '🥧', desc: 'Spiced pumpkin custard, flaky crust, a whipped cream dollop per slice.', build: pumpkinPie, use: { bites: 6, needs: { hunger: 45, comfort: 12, fun: 6 }, buff: 'cozy', buffMin: 240, crumbs: '#d99a4e' } }),
  treat('crumb', { id: 'gingerbread_men', name: 'Gingerbread Cookies (3)', price: 7.5, season: 'winter', rarity: 'uncommon', emoji: '🎄', desc: 'Molasses-spiced little guys with icing smiles. Bite the leg first.', build: gingerbreadMen, use: { bites: 3, needs: { hunger: 14, fun: 6, comfort: 6 }, buff: 'cozy', buffMin: 180, sound: 'crunch', crumbs: '#a8622a' } }),
  // ------------------------------------------------ Night Owl Mart (Dashr)
  treat('nightowl', { id: 'chips_sea_salt', name: 'Crunchos Sea Salt Chips', price: 2.49, stores: ['dashr', 'freshcart'], emoji: '🥔', desc: 'Kettle-cooked and loud. Not for movie theaters.', build: () => snackBag({}), use: { bites: 5, sweet: false, needs: { hunger: 14, fun: 5 }, sound: 'crunch', crumbs: '#f2c14e', leftover: 'empty_chip_bag' } }),
  treat('nightowl', { id: 'chips_blaze', name: 'Blaze Hot Chips', price: 2.49, stores: ['dashr', 'freshcart'], emoji: '🔥', desc: 'Neon-red, dangerously spicy, finger-staining.', build: () => snackBag({ color: '#d62828', accent: '#ffd23f', label: 'BLAZE', sub: 'EXTREME HEAT', emoji: '🔥', chip: '#e2401c' }), use: { bites: 5, sweet: false, needs: { hunger: 14, fun: 7 }, sound: 'crunch', crumbs: '#e2401c', leftover: 'empty_chip_bag' } }),
  treat('nightowl', { id: 'candy_bar_nova', name: 'Nova Caramel Bar', price: 1.79, stores: ['dashr', 'freshcart'], emoji: '🍫', desc: 'Milk chocolate, caramel, a cosmic amount of nougat.', build: candyBar, use: { bites: 4, needs: { hunger: 10, fun: 5, energy: 3 }, buff: 'sugarRush', buffMin: 60, crumbs: '#4a2716', leftover: 'wrapper' } }),
  treat('nightowl', { id: 'popcorn_bucket', name: 'Kettle Corn Bucket', price: 4.99, emoji: '🍿', desc: 'Sweet-salty kettle corn. Mandatory for movie night.', build: popcornBucket, use: { bites: 5, needs: { hunger: 14, fun: 8 }, sound: 'crunch', crumbs: '#fff1c4' } }),
  treat('nightowl', { id: 'cup_noodles', name: 'Midnight Cup Noodles', price: 2.29, stores: ['dashr', 'freshcart'], emoji: '🍜', desc: 'Already steeped and steaming. 2 AM gourmet.', build: cupNoodles, use: { bites: 4, sweet: false, needs: { hunger: 25, comfort: 6, thirst: 4 }, buff: 'cozy', buffMin: 60, sound: 'slurp', hot: true, crumbs: '#f2d27a', leftover: 'empty_noodle_cup' } }),
  // ------------------------------------------------ leftovers
  trash({ id: 'empty_pizza_box', name: 'Empty Pizza Box', tags: ['trash', 'recyclable'], desc: 'Greasy cardboard. Recycle it.', build: closedPizzaBox }),
  trash({ id: 'empty_food_tray', name: 'Empty Paper Tray', desc: 'A few crumbs and a sauce smear. Trash.', build: emptyFoodTray }),
  trash({ id: 'empty_fry_carton', name: 'Empty Fry Carton', desc: 'Not a single fry left. Respect.', build: emptyFryCarton }),
  trash({ id: 'empty_takeout_pail', name: 'Empty Takeout Pail', desc: 'The folded paper pail, now emptied.', build: emptyPail }),
  trash({ id: 'empty_paper_bowl', name: 'Empty Paper Bowl', desc: 'Compostable, allegedly.', build: () => emptyBowl() }),
  trash({ id: 'empty_chicken_bucket', name: 'Empty Chicken Bucket', desc: 'Bones and memories.', build: emptyBucket }),
  trash({ id: 'empty_donut_box', name: 'Empty Donut Box', tags: ['trash', 'recyclable'], desc: 'Only a glaze stain remains.', build: emptyDonutBox }),
  trash({ id: 'empty_icecream_cup', name: 'Empty Ice Cream Pint', desc: 'Scraped clean. No regrets.', build: emptyPint }),
  trash({ id: 'empty_bakery_bag', name: 'Crumpled Bakery Bag', tags: ['trash', 'recyclable'], desc: 'Kraft paper and buttery crumbs.', build: emptyBakeryBag }),
  trash({ id: 'empty_chip_bag', name: 'Empty Chip Bag', desc: 'Crinkly, flattened, finished.', build: emptyChipBag }),
  trash({ id: 'empty_noodle_cup', name: 'Empty Noodle Cup', desc: 'The broth was the best part.', build: emptyNoodleCup }),
]);
export { scatter, taco, ramenEgg, fishTex, cupcake };
