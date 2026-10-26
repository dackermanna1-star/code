// Catalogue: groceries — FreshCart ingredients, the stove/oven recipes that
// use them, the homemade dishes those recipes produce, and cookbooks that
// teach the fancier (learn: true) recipes.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { registerRecipes } from '../world/cooking.js';
import { mat, MAT, box, rbox, cyl, sph, hemi, torus, cone, lathe, tube, at, rot, group, decal, FONT, fitText, labelTexture } from '../items/kit.js';
import { productBox, jar, carton, bottle, fruit, plate, bookModel } from './shared.js';
import {
  bite, F, GL, FLAT, sector, slab, polar, bowlShell, fill, fork, citrusWedge, labeledCup, liner, noodles,
  checkerTex, speckTex, stripeTex, snackBag, pancakeStack, friedEgg, baconStrip, cookieModel, pizzaPie, scatter, taco, fishTex, scoop, lcg,
} from './food.js';

const PI = Math.PI;
const TX = (key, w, h, draw, o) => labelTexture('groc:' + key, w, h, draw, o);
const WRAP = () => mat('#ffffff', { rough: 0.05, opacity: 0.16, transparent: true, depthWrite: false });

// ------------------------------------------------------------------ packaging helpers
function sticker(key, w, h, { bg = '#ffffff', fg = '#1b4332', title, sub = '' }) {
  return decal(w, h, 'groc:stk:' + key, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H * 0.12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${H * 0.3}px ${FONT}`; fitText(ctx, title, W / 2, H * 0.45, W * 0.9);
    if (sub) { ctx.font = `700 ${H * 0.17}px ${FONT}`; fitText(ctx, sub, W / 2, H * 0.76, W * 0.9); }
  }, { tw: 256 });
}
function topSticker(g, key, x, y, z, w, h, o) { const s = sticker(key, w, h, o); s.rotation.x = -PI / 2; g.add(at(s, x, y, z)); return s; }
// foam meat tray under cling film with a price sticker
function meatTray(content, { tray = '#f7f7f4', w = 0.2, d = 0.14, label, sub }) {
  const g = new THREE.Group();
  g.add(at(rbox(w, 0.018, d, 0.006, mat(tray, { rough: 0.8 })), 0, 0.009, 0));
  content.position.y = 0.018; g.add(content);
  g.add(at(rbox(w + 0.002, 0.048, d + 0.002, 0.012, WRAP()), 0, 0.024, 0));
  topSticker(g, label + tray, w * 0.25, 0.0485, d * 0.22, 0.07, 0.04, { title: label, sub, fg: '#1b4332' });
  return g;
}
function paperBag({ color = '#f4efe6', ink = '#1d3557', title, sub = '', emoji = '', w = 0.11, h = 0.2, d = 0.07 }) {
  const g = group(productBox({ w, h, d, color, accent: ink, label: title, sub, emoji }));
  g.children[0].position.y = h / 2;
  g.add(at(rbox(w * 0.98, 0.03, d * 0.45, 0.004, mat(color, { rough: 0.9 })), 0, h + 0.012, 0));
  return g;
}
function pouch(o) { const g = snackBag({ chips: false, ...o }); return g; }
function tub({ color = '#ffffff', ink = '#1d70b8', title, sub = '', lid = '#e8eef2', r0 = 0.045, r1 = 0.052, h = 0.075 }) {
  const tex = TX(`tub:${title}:${color}`, 512, 128, (ctx, W, H) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of [0.25, 0.75]) { ctx.font = `900 ${H * 0.3}px ${FONT}`; fitText(ctx, title, W * x, H * 0.42, W * 0.4); if (sub) { ctx.font = `700 ${H * 0.15}px ${FONT}`; fitText(ctx, sub, W * x, H * 0.72, W * 0.4); } }
  });
  const g = labeledCup({ rb: r0, rt: r1, h, map: tex });
  g.add(at(cyl(r1 * 1.04, r1 * 1.04, 0.008, mat(lid, { rough: 0.3, metal: lid === '#c0c4ca' ? 0.8 : 0 }), 32), 0, h + 0.004, 0));
  return g;
}

// ------------------------------------------------------------------ produce models
function broccoliHead(s = 1) {
  const g = new THREE.Group();
  g.add(at(cyl(0.012 * s, 0.016 * s, 0.06 * s, F('#8cbf5a', 0.6), 10), 0, 0.03 * s, 0));
  const fl = [FLAT('#2f6b1f', 0.9), FLAT('#3d7f27', 0.9)];
  for (let i = 0; i < 8; i++) { const a = i / 7 * PI * 2, rr = i === 7 ? 0 : 0.022 * s; g.add(at(sph(0.02 * s, fl[i % 2], 8, 6), Math.cos(a) * rr, 0.065 * s + (i === 7 ? 0.012 * s : 0), Math.sin(a) * rr)); }
  return g;
}
function pepper(color, s = 1) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.2, clearcoat: 0.8 });
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; const l = sph(0.026 * s, m, 14, 10); l.scale.set(0.8, 1.25, 0.8); g.add(at(l, Math.cos(a) * 0.012 * s, 0.032 * s, Math.sin(a) * 0.012 * s)); }
  g.add(at(cyl(0.004 * s, 0.006 * s, 0.018 * s, F('#3f7d2a', 0.5), 6), 0, 0.068 * s, 0));
  return g;
}
function onion(s = 1) {
  const m = mat('#c4802f', { rough: 0.35, clearcoat: 0.4 });
  const b = sph(0.033 * s, m, 16, 12); b.scale.y = 0.88;
  return group(at(b, 0, 0.03 * s, 0), at(cone(0.012 * s, 0.025 * s, m, 10), 0, 0.068 * s, 0), at(cyl(0.006 * s, 0.002 * s, 0.006 * s, F('#e8d7b0'), 6), 0, 0.001, 0));
}
function potato(s = 1, seed = 1) {
  const p = sph(0.03 * s, mat('#ffffff', { map: speckTex('potato', '#b58145', ['#8a5a2a', '#cf9c5c'], 30, 2.5, 6), rough: 0.9 }), 12, 8);
  const r = lcg(seed); p.scale.set(1.35 + r() * 0.2, 0.75, 0.95); p.rotation.y = r() * 3;
  return p;
}
function avocado(half = false) {
  const skin = FLAT('#2f3d14', 0.6);
  if (!half) { const g = group(at(sph(0.032, skin, 12, 9), 0, 0.03, 0), at(sph(0.022, skin, 10, 8), 0, 0.064, 0)); g.children[0].scale.y = 0.95; return g; }
  const g = new THREE.Group();
  const shellM = hemi(0.032, skin); shellM.rotation.x = PI; shellM.scale.set(1, 0.6, 1.35); g.add(at(shellM, 0, 0.02, 0));
  const flesh = cyl(0.031, 0.031, 0.002, F('#c9dc7a', 0.5), 20); flesh.scale.z = 1.35; g.add(at(flesh, 0, 0.021, 0));
  const inner = cyl(0.022, 0.022, 0.0022, F('#e6ec9c', 0.5), 18); inner.scale.z = 1.3; g.add(at(inner, 0, 0.0215, 0.004));
  g.add(at(sph(0.014, GL('#6b3a1f'), 14, 10), 0, 0.022, 0.008));
  return g;
}
function lettuceHead() {
  const g = new THREE.Group();
  const cols = ['#2f7a1f', '#3f8f27', '#5ea52a', '#8cc24a'];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2, inner = i % 3 === 0;
    const l = sph(0.05, F(cols[(i + (inner ? 2 : 0)) % 4], 0.5), 12, 10); l.scale.set(0.62, 1.9, 0.18);
    l.rotation.set(0, -a + PI / 2, -(inner ? 0.18 : 0.42));
    g.add(at(l, Math.cos(a) * (inner ? 0.014 : 0.03), 0.09, Math.sin(a) * (inner ? 0.014 : 0.03)));
  }
  g.add(at(cyl(0.022, 0.026, 0.02, F('#e8efc8', 0.6), 12), 0, 0.01, 0));
  return g;
}
function strawberry() { const s = cone(0.011, 0.022, GL('#c8102e'), 12); s.rotation.x = PI; return group(at(s, 0, 0.011, 0), at(cone(0.008, 0.004, F('#3f8f2a'), 6), 0, 0.023, 0)); }

// ------------------------------------------------------------------ ingredient models
function spaghettiBox() {
  const g = group(at(productBox({ w: 0.075, h: 0.24, d: 0.035, color: '#1d4e89', accent: '#fbd34d', label: 'SPAGHETTI', sub: 'N°5 · BRONZE CUT', pattern: 'stripes' }), 0, 0.12, 0));
  g.add(at(cyl(0.012, 0.012, 0.05, mat('#ffffff', { map: stripeTex('pasta', '#f2d27a', '#e8c25a', 18, true), rough: 0.6 }), 14), 0.01, 0.255, 0));
  return g;
}
function macaroniBox() {
  const g = group(at(productBox({ w: 0.13, h: 0.17, d: 0.05, color: '#ffd23f', accent: '#1d4e89', label: 'ELBOWS', sub: 'MACARONI · 1 LB' }), 0, 0.085, 0));
  for (let i = 0; i < 4; i++) g.add(at(rot(torus(0.008, 0.003, F('#f2c14e', 0.5), 6, 10, PI * 0.9), PI / 2, 0, i * 1.3), -0.04 + i * 0.026, 0.003, 0.05));
  return g;
}
function lasagnaBox() {
  const g = group(at(productBox({ w: 0.2, h: 0.09, d: 0.035, color: '#c1121f', accent: '#fff3d6', label: 'LASAGNE', sub: 'OVEN-READY SHEETS' }), 0, 0.045, 0));
  for (let i = 0; i < 2; i++) { const s = box(0.17, 0.003, 0.07, mat('#ffffff', { map: stripeTex('lasheet', '#f2d27a', '#e6be5a', 10, false), rough: 0.6 })); s.rotation.set(0.05, 0.1 * i, 0); g.add(at(s, 0.005, 0.0015 + i * 0.003, 0.055)); }
  return g;
}
function chickenTray() {
  const c = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = sph(0.045, mat('#f2b3a3', { rough: 0.35, clearcoat: 0.4 }), 16, 10); b.scale.set(1.45, 0.28, 0.75); b.rotation.y = 0.3 - i * 0.2; c.add(at(b, (i - 0.5) * 0.06, 0.008, (i - 0.5) * 0.04)); }
  return meatTray(c, { label: 'CHICKEN', sub: 'BREAST · 2 PC' });
}
function marbleTex() {
  return TX('marble', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#a8241c'; ctx.fillRect(0, 0, W, H);
    const r = lcg(9); ctx.strokeStyle = 'rgba(255,236,226,0.75)';
    for (let i = 0; i < 26; i++) { ctx.lineWidth = 1 + r() * 2.5; ctx.beginPath(); let x = r() * W, y = r() * H; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
  });
}
function steakModel(sear = false) {
  const top = sear ? mat('#ffffff', { map: TX('sear', 128, 128, (ctx, W, H) => { ctx.fillStyle = '#5a2a14'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 7; for (let i = -2; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * 28, 0); ctx.lineTo(i * 28 + 60, H); ctx.stroke(); } }), rough: 0.6 }) : mat('#ffffff', { map: marbleTex(), rough: 0.45 });
  const s = cyl(0.058, 0.06, 0.024, [F(sear ? '#6b3a1f' : '#efd7c8', 0.6), top, top], 22); s.scale.x = 1.3;
  return s;
}
function steakTray() {
  const c = group(at(steakModel(), 0, 0.012, 0));
  const sprig = group(tube([[-0.04, 0, 0], [0, 0.002, 0.005], [0.04, 0, 0]], 0.0015, F('#4a5a2a'), 8, 4));
  for (let i = 0; i < 8; i++) { const n = box(0.012, 0.0015, 0.002, F('#3f6b2a', 0.5)); n.rotation.y = (i % 2 ? 0.6 : -0.6); sprig.add(at(n, -0.035 + i * 0.01, 0.002, (i % 2 ? 0.003 : -0.003))); }
  c.add(at(sprig, 0.01, 0.026, 0.035));
  return meatTray(c, { tray: '#1d1d1d', label: 'RIBEYE', sub: 'USDA PRIME' });
}
function salmonTray() {
  const f = rbox(0.15, 0.022, 0.062, 0.008, mat('#ffffff', { map: fishTex('salmon', '#ff5a1f', 'rgba(255,235,215,0.8)'), rough: 0.3, clearcoat: 0.5 }));
  const c = group(at(f, 0, 0.011, 0));
  c.add(at(rot(cyl(0.018, 0.018, 0.003, [F('#f6d743'), F('#fff3a8', 0.4), F('#fff3a8')], 16), 0.2, 0, 0), 0.05, 0.025, 0.01));
  return meatTray(c, { label: 'SALMON', sub: 'WILD · SKIN-ON' });
}
function groundBeefTray() {
  const m = sph(0.06, mat('#ffffff', { map: speckTex('mince', '#b0362c', ['#e88a7a', '#7a1a12', '#f4c4b4'], 160, 2, 2), rough: 0.7 }), 18, 10);
  m.scale.set(1.3, 0.32, 0.95);
  return meatTray(group(at(m, 0, 0.006, 0)), { label: 'GROUND BEEF', sub: '85% LEAN' });
}
function baconPack() {
  const g = new THREE.Group();
  g.add(at(box(0.22, 0.012, 0.11, mat('#fbf6ec', { rough: 0.7 })), 0, 0.006, 0));
  for (let i = 0; i < 4; i++) g.add(at(baconStrip(0.19), 0, 0.016, -0.036 + i * 0.024));
  g.add(at(rbox(0.222, 0.02, 0.112, 0.006, WRAP()), 0, 0.012, 0));
  const band = box(0.06, 0.022, 0.113, mat('#ffffff', { map: TX('baconband', 128, 128, (ctx, W, H) => { ctx.fillStyle = '#7a1f12'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#ffd6a5'; ctx.font = `900 ${H * 0.26}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BACON', W / 2, H / 2); }), rough: 0.6 }));
  g.add(at(band, -0.07, 0.012, 0));
  return g;
}
function tofuTub() {
  const g = new THREE.Group();
  g.add(at(rbox(0.12, 0.045, 0.09, 0.008, mat('#eef6f8', { rough: 0.1, opacity: 0.35, transparent: true, depthWrite: false })), 0, 0.0225, 0));
  g.add(at(rbox(0.1, 0.04, 0.074, 0.004, F('#f6f1e1', 0.7)), 0, 0.021, 0));
  topSticker(g, 'tofu', 0, 0.0455, 0, 0.11, 0.08, { title: 'TOFU', sub: 'EXTRA FIRM · ORGANIC', fg: '#2a9d8f' });
  return g;
}
function veggieTray() {
  const c = new THREE.Group();
  c.add(at(broccoliHead(0.6), -0.05, 0, -0.02), at(broccoliHead(0.55), -0.035, 0, 0.03));
  for (let i = 0; i < 6; i++) c.add(at(cyl(0.011, 0.011, 0.005, F('#f07a1a', 0.5), 14), 0.01 + (i % 3) * 0.02, 0.003 + Math.floor(i / 3) * 0.005, -0.03 + (i % 2) * 0.012));
  for (let i = 0; i < 5; i++) { const p = box(0.05, 0.006, 0.008, F(i % 2 ? '#d62828' : '#f6c431', 0.4)); p.rotation.y = 0.3 * i; c.add(at(p, 0.04, 0.006, 0.02 + i * 0.006)); }
  for (let i = 0; i < 3; i++) { const p = capsule2(); p.rotation.set(0, i, PI / 2); c.add(at(p, 0.02 - i * 0.02, 0.01, 0.045)); }
  return meatTray(c, { w: 0.2, d: 0.14, label: 'STIR-FRY', sub: 'VEGGIE MIX' });
}
function capsule2() { const s = sph(0.008, F('#5fa82a', 0.5), 10, 8); s.scale.set(1, 1, 3); return s; }
function peppersTrio() { return group(at(pepper('#c8102e'), -0.04, 0, 0), at(pepper('#f6b500'), 0.035, 0, -0.01), at(rot(pepper('#3f8f2a'), 0, 1, 0.1), 0, 0, 0.045)); }
function onionsNet() { return group(at(onion(), -0.035, 0, 0), at(onion(0.95), 0.035, 0, 0.005), at(onion(0.9), 0, 0, 0.05), at(rot(onion(0.9), 0, 0, 1.4), 0.0, 0.03, -0.045)); }
function cheddarBlock() {
  const g = new THREE.Group();
  g.add(at(rbox(0.12, 0.04, 0.07, 0.004, mat('#ec8f00', { rough: 0.45 })), 0, 0.02, 0));
  g.add(at(rbox(0.122, 0.042, 0.072, 0.005, WRAP()), 0, 0.021, 0));
  const band = box(0.05, 0.043, 0.073, mat('#ffffff', { map: TX('cheddarband', 128, 128, (ctx, W, H) => { ctx.fillStyle = '#1d3557'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#ffd23f'; ctx.font = `900 ${H * 0.2}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, 'CHEDDAR', W / 2, H * 0.42, W * 0.9); ctx.font = `700 ${H * 0.13}px ${FONT}`; fitText(ctx, 'AGED SHARP', W / 2, H * 0.66, W * 0.9); }), rough: 0.6 }));
  g.add(at(band, 0.02, 0.0215, 0));
  return g;
}
function mozzarellaBag() {
  const g = new THREE.Group();
  g.add(at(sph(0.04, mat('#fbf8f0', { rough: 0.3, clearcoat: 0.5 }), 20, 14), 0, 0.038, 0));
  g.add(at(sph(0.044, WRAP(), 20, 14), 0, 0.04, 0));
  g.add(at(cone(0.012, 0.03, WRAP(), 10), 0, 0.095, 0).rotateX(PI));
  g.add(at(cyl(0.006, 0.006, 0.008, F('#1d70b8', 0.4), 8), 0, 0.083, 0));
  const lab = sticker('mozz', 0.05, 0.03, { title: 'MOZZARELLA', sub: 'FIOR DI LATTE', fg: '#1d70b8' }); lab.rotation.x = -0.4; g.add(at(lab, 0, 0.05, 0.042));
  return g;
}
function parmesanWedge() {
  const g = new THREE.Group();
  g.add(slab(sector(0.1, PI / 2 - 0.3, PI / 2 + 0.3, 6), 0.06, mat('#ffffff', { map: speckTex('parm2', '#e3bf55', ['#d4a93c', '#efd27a'], 60, 1.6, 3), rough: 0.8 }), 0, 0.001));
  g.add(slab(sector(0.104, PI / 2 - 0.3, PI / 2 + 0.3, 6, 0.094), 0.062, F('#c48a2c', 0.7), 0, 0.001));
  g.children.forEach((c) => { c.position.z += 0.05; });
  const s = sticker('parm', 0.05, 0.03, { title: 'PARMIGIANO', sub: '24 MONTHS', fg: '#c1121f' }); s.rotation.x = -PI / 2; g.add(at(s, 0, 0.0635, 0.02));
  return g;
}
function butterBox() {
  const g = group(at(productBox({ w: 0.13, h: 0.035, d: 0.065, color: '#fbf3c8', accent: '#1d70b8', label: 'BUTTER', sub: 'SALTED · 4 STICKS' }), 0, 0.0175, 0));
  g.add(at(rbox(0.1, 0.03, 0.03, 0.003, mat('#ffe27a', { rough: 0.35 })), 0.02, 0.05, 0.005), at(box(0.05, 0.031, 0.031, mat('#fbfbf8', { rough: 0.5 })), 0.045, 0.05, 0.005));
  return g;
}
function kernelsJar() { return jar({ color: '#f6c431', lid: '#c1121f', label: 'POPCORN', h: 0.13, r: 0.04, fill: '#f2b31c' }); }
function teaBox() {
  const g = group(at(productBox({ w: 0.12, h: 0.075, d: 0.07, color: '#2d6a4f', accent: '#fefae0', label: 'GREEN TEA', sub: '20 BAGS · SENCHA', emoji: '🍵' }), 0, 0.0375, 0));
  const bag = group(at(rbox(0.04, 0.05, 0.004, 0.004, F('#f3ead5', 0.9)), 0, 0.025, 0), at(rbox(0.016, 0.02, 0.002, 0.001, F('#2d6a4f', 0.6)), 0.035, 0.07, 0.0), at(tube([[0, 0.05, 0], [0.02, 0.065, 0.002], [0.035, 0.06, 0]], 0.0006, F('#ffffff'), 8, 3), 0, 0, 0));
  bag.rotation.set(-0.3, 0.3, 0); g.add(at(bag, 0.07, 0, 0.045));
  return g;
}
function cocoaTin() { return jar({ color: '#5a2d14', lid: '#c9a86a', label: 'COCOA', h: 0.12, r: 0.042, glass: false }); }
function orangesNet() {
  const g = new THREE.Group();
  [[-0.04, 0, 0], [0.04, 0, 0.005], [0, 0, 0.05], [0, 0.055, 0.015]].forEach(([x, y, z], i) => { const o = fruit({ color: '#f57c00', r: 0.036, stem: false, squash: 0.95 }); g.add(at(o, x, y, z)); void i; });
  const leaf = sph(0.014, F('#2f7d32', 0.4), 8, 6); leaf.scale.set(1.6, 0.2, 0.7); leaf.rotation.z = 0.4; g.add(at(leaf, 0.012, 0.125, 0.015));
  const tag = sticker('oranges', 0.04, 0.025, { title: 'NAVEL', sub: 'CALIFORNIA', fg: '#e85d04' }); tag.rotation.x = -0.5; g.add(at(tag, 0.0, 0.03, 0.09));
  return g;
}
function avocadoTrio() { return group(at(rot(avocado(), 0, 0, 1.45), -0.03, 0.03, -0.02), at(rot(avocado(), 0.1, 1.2, 1.5), 0.02, 0.03, -0.045), at(avocado(true), 0.01, 0, 0.035)); }
function berryPunnet() {
  const g = new THREE.Group();
  g.add(at(rbox(0.13, 0.06, 0.1, 0.008, mat('#eef6f8', { rough: 0.1, opacity: 0.3, transparent: true, depthWrite: false })), 0, 0.03, 0));
  for (let i = 0; i < 6; i++) g.add(at(rot(strawberry(), 0.6 * (i % 2), i, 0.3), -0.04 + (i % 3) * 0.035, 0.012 + Math.floor(i / 3) * 0.02, -0.02 + Math.floor(i / 3) * 0.02));
  for (let i = 0; i < 9; i++) g.add(at(sph(0.007, GL('#2b2d6e'), 10, 8), 0.0 + (i % 3) * 0.015, 0.05, -0.01 + Math.floor(i / 3) * 0.015));
  topSticker(g, 'berries', 0, 0.0605, 0, 0.08, 0.05, { title: 'BERRY MIX', sub: 'LOCAL · 1 LB', fg: '#c8102e' });
  return g;
}
function tortillaPack() {
  const g = new THREE.Group();
  g.add(at(cyl(0.1, 0.1, 0.022, mat('#ffffff', { map: speckTex('tortpack', '#efdcac', ['#c99a5a'], 30, 3, 4), rough: 0.7 }), 32), 0, 0.012, 0));
  g.add(at(cyl(0.104, 0.104, 0.028, WRAP(), 32), 0, 0.014, 0));
  topSticker(g, 'tortilla', 0, 0.0285, 0.02, 0.1, 0.06, { title: 'TORTILLAS', sub: 'FLOUR · 10 CT', fg: '#2a9d8f' });
  return g;
}
function ramenPacks() {
  const g = new THREE.Group();
  const cols = ['#e63946', '#f77f00', '#2a9d8f', '#e63946', '#6a4c93'];
  cols.forEach((c, i) => { const p = rbox(0.13, 0.024, 0.1, 0.008, mat(c, { rough: 0.35, metal: 0.2 })); p.rotation.y = (i % 2 ? 0.08 : -0.06); g.add(at(p, (i % 2) * 0.004, 0.012 + i * 0.024, 0)); });
  topSticker(g, 'ramen', 0, 0.1215, 0, 0.11, 0.08, { bg: '#fff3e0', title: 'RAMEN ×5', sub: 'TONKOTSU · 3-MIN', fg: '#e63946' });
  return g;
}
function doughBag() {
  const g = new THREE.Group();
  const d = sph(0.06, mat('#efdcb4', { rough: 0.55 }), 20, 14); d.scale.set(1.15, 0.6, 1); g.add(at(d, 0, 0.036, 0));
  g.add(at(rbox(0.17, 0.08, 0.15, 0.03, WRAP()), 0, 0.04, 0));
  g.add(at(cyl(0.006, 0.006, 0.03, F('#c1121f', 0.5), 8), 0.09, 0.03, 0).rotateZ(PI / 2));
  const s = sticker('dough', 0.06, 0.035, { title: 'PIZZA DOUGH', sub: 'MAKES 1 × 14"', fg: '#c1121f' }); s.rotation.x = -PI / 2; g.add(at(s, 0, 0.081, 0.03));
  return g;
}
function yogurtTub() { return tub({ title: 'GREEK YOGURT', sub: 'PLAIN · 0% FAT', ink: '#1d70b8', lid: '#c0c4ca' }); }

// ------------------------------------------------------------------ ingredients
const ing = (o) => ({ category: 'grocery', stores: ['freshcart'], rarity: 'common', ...o, use: { type: 'ingredient', uses: o.uses ?? 1 } });
defineItems([
  ing({ id: 'pasta_spaghetti', name: 'Bronze-Cut Spaghetti', price: 2.79, uses: 3, emoji: '🍝', desc: 'Rough-textured durum spaghetti. Sauce clings to it lovingly.', build: spaghettiBox }),
  ing({ id: 'pasta_macaroni', name: 'Elbow Macaroni', price: 1.99, uses: 3, emoji: '🧀', desc: 'Little elbows destined for cheese sauce.', build: macaroniBox }),
  ing({ id: 'lasagna_sheets', name: 'Lasagne Sheets', price: 3.49, uses: 2, emoji: '🟨', desc: 'Oven-ready, no boiling required.', build: lasagnaBox }),
  ing({ id: 'tomato_sauce', name: 'San Marzano Marinara', price: 5.49, uses: 3, emoji: '🍅', desc: 'Slow-simmered tomatoes, garlic and basil. Nonna-approved.', build: () => jar({ color: '#c1121f', lid: '#2b2b2b', label: 'MARINARA', h: 0.14, r: 0.042, fill: '#b5170b' }) }),
  ing({ id: 'rice_jasmine', name: 'Jasmine Rice (2 lb)', price: 6.49, uses: 6, emoji: '🍚', desc: 'Fragrant long-grain rice. The foundation of many dinners.', build: () => pouch({ color: '#f4efe6', accent: '#2d6a4f', label: 'JASMINE', sub: 'THAI RICE · 2 LB', emoji: '🍚', w: 0.14, h: 0.2 }) }),
  ing({ id: 'chicken_breast', name: 'Chicken Breasts (2)', price: 8.99, uses: 2, emoji: '🍗', desc: 'Free-range, boneless, skinless.', build: chickenTray }),
  ing({ id: 'steak_ribeye', name: 'Ribeye Steak', price: 17.99, rarity: 'uncommon', emoji: '🥩', desc: 'Beautifully marbled, 1.5" thick. Treat yourself.', build: steakTray }),
  ing({ id: 'salmon_fillet', name: 'Wild Salmon Fillet', price: 12.99, emoji: '🐟', desc: 'Bright, buttery, sustainably caught.', build: salmonTray }),
  ing({ id: 'ground_beef', name: 'Ground Beef (1 lb)', price: 7.49, uses: 2, emoji: '🥩', desc: 'For tacos, lasagna and late-night ambitions.', build: groundBeefTray }),
  ing({ id: 'bacon_pack', name: 'Thick-Cut Bacon', price: 6.99, uses: 3, emoji: '🥓', desc: 'Applewood-smoked. Your kitchen will smell incredible.', build: baconPack }),
  ing({ id: 'tofu_firm', name: 'Extra-Firm Tofu', price: 2.99, emoji: '⬜', desc: 'Press it, cube it, crisp it.', build: tofuTub }),
  ing({ id: 'veggie_mix', name: 'Stir-Fry Veggie Mix', price: 4.49, emoji: '🥦', desc: 'Broccoli, carrots, peppers and snap peas, pre-chopped.', build: veggieTray }),
  ing({ id: 'broccoli', name: 'Broccoli Crown', price: 2.29, emoji: '🥦', desc: 'Tiny trees. Roast them and they become delicious.', build: () => broccoliHead(1.3) }),
  ing({ id: 'bell_peppers', name: 'Bell Pepper Trio', price: 3.99, uses: 2, emoji: '🫑', desc: 'Red, yellow and green. Crunchy, sweet, photogenic.', build: peppersTrio }),
  ing({ id: 'onions', name: 'Yellow Onions', price: 2.49, uses: 3, emoji: '🧅', desc: 'Will make you cry. Will make dinner better.', build: onionsNet }),
  ing({ id: 'potatoes', name: 'Yukon Gold Potatoes', price: 4.99, uses: 4, emoji: '🥔', desc: 'Buttery-fleshed all-rounders. Roast, mash, fry.', build: () => group(at(potato(1, 1), -0.035, 0.022, 0), at(potato(1, 2), 0.035, 0.022, 0.01), at(potato(0.9, 3), 0, 0.02, 0.045), at(potato(0.95, 4), 0, 0.055, 0.012), at(potato(0.9, 5), 0.0, 0.02, -0.04)) }),
  ing({ id: 'lettuce', name: 'Romaine Lettuce', price: 2.49, uses: 2, emoji: '🥬', desc: 'Crisp hearts for salads and tacos.', build: lettuceHead }),
  ing({ id: 'cheese_cheddar', name: 'Aged Cheddar Block', price: 5.49, uses: 3, emoji: '🧀', desc: 'Sharp, crumbly, melts like a dream.', build: cheddarBlock }),
  ing({ id: 'mozzarella', name: 'Fresh Mozzarella', price: 4.99, uses: 2, emoji: '🧀', desc: 'Milky, soft, born to melt on pizza.', build: mozzarellaBag }),
  ing({ id: 'parmesan', name: 'Parmigiano Reggiano', price: 9.99, uses: 4, rarity: 'uncommon', emoji: '🧀', desc: 'Aged 24 months. Grate generously.', build: parmesanWedge }),
  ing({ id: 'butter', name: 'Salted Butter', price: 4.99, uses: 4, emoji: '🧈', desc: 'Four sticks of golden potential.', build: butterBox }),
  ing({ id: 'flour', name: 'All-Purpose Flour', price: 3.99, uses: 5, emoji: '🌾', desc: 'Unbleached flour for pancakes, cookies and bread.', build: () => paperBag({ title: 'FLOUR', sub: 'ALL-PURPOSE · 5 LB', emoji: '🌾', ink: '#7a4a1f' }) }),
  ing({ id: 'sugar', name: 'Cane Sugar', price: 3.49, uses: 5, emoji: '🍬', desc: 'Pure cane sugar. Sweetens everything, including moods.', build: () => paperBag({ title: 'SUGAR', sub: 'PURE CANE · 4 LB', emoji: '🍬', ink: '#1d70b8', w: 0.1, h: 0.16 }) }),
  ing({ id: 'berries', name: 'Mixed Berries', price: 5.99, uses: 2, emoji: '🍓', tags: ['healthy'], desc: 'Strawberries and blueberries for smoothies and galettes.', build: berryPunnet }),
  ing({ id: 'tortillas', name: 'Flour Tortillas (10)', price: 3.49, uses: 3, emoji: '🫓', desc: 'Soft, pliable, ready for tacos.', build: tortillaPack }),
  ing({ id: 'ramen_packs', name: 'Instant Ramen 5-Pack', price: 4.99, uses: 5, stores: ['freshcart', 'primo'], emoji: '🍜', desc: 'Add boiling water (an electric kettle works). Dorm-room classic.', build: ramenPacks }),
  ing({ id: 'popcorn_kernels', name: 'Popcorn Kernels', price: 3.99, uses: 5, stores: ['freshcart', 'primo'], emoji: '🍿', desc: 'Heirloom yellow kernels. Needs a microwave.', build: kernelsJar }),
  ing({ id: 'tea_bags', name: 'Sencha Green Tea', price: 4.99, uses: 8, stores: ['freshcart', 'primo'], emoji: '🍵', desc: '20 bags of grassy, calming sencha. Use with a kettle.', build: teaBox }),
  ing({ id: 'cocoa_powder', name: 'Dutch Cocoa Powder', price: 5.99, uses: 5, emoji: '🍫', desc: 'For hot cocoa, lava cakes and chocolate ice cream.', build: cocoaTin }),
  ing({ id: 'oranges', name: 'Navel Oranges (4)', price: 5.49, uses: 2, emoji: '🍊', tags: ['healthy'], desc: 'Sweet, seedless and very juicy.', build: orangesNet }),
  ing({ id: 'avocados', name: 'Hass Avocados (3)', price: 4.99, uses: 3, emoji: '🥑', tags: ['healthy'], desc: 'Perfectly ripe today. Tomorrow? Unknowable.', build: avocadoTrio }),
  ing({ id: 'chocolate_chips', name: 'Chocolate Chips', price: 3.99, uses: 3, emoji: '🍫', desc: 'Semi-sweet morsels. Some will be eaten straight from the bag.', build: () => pouch({ color: '#5a2d14', accent: '#f2c14e', label: 'CHOC CHIPS', sub: 'SEMI-SWEET', emoji: '🍫', w: 0.13, h: 0.17 }) }),
  ing({ id: 'pizza_dough', name: 'Fresh Pizza Dough', price: 3.49, emoji: '🍕', desc: 'One ball of slow-proofed dough. Makes a 14" pie.', build: doughBag }),
  ing({ id: 'curry_sauce', name: 'Tikka Masala Simmer Sauce', price: 5.49, uses: 2, emoji: '🍛', desc: 'Tomato, cream and garam masala. Just add chicken.', build: () => jar({ color: '#e07a1f', lid: '#7a1f12', label: 'TIKKA', h: 0.12, r: 0.042, fill: '#d4561a' }) }),
  ing({ id: 'heavy_cream', name: 'Heavy Cream', price: 3.99, uses: 3, emoji: '🥛', desc: 'For ice cream, sauces and whipped clouds.', build: () => carton({ color: '#fbf8f0', accent: '#6a4c93', label: 'CREAM', w: 0.06, h: 0.15 }) }),
  ing({ id: 'yogurt', name: 'Greek Yogurt', price: 4.49, uses: 3, emoji: '🥛', tags: ['healthy'], desc: 'Thick, tangy, protein-packed. Smoothie MVP.', build: yogurtTub }),
  ing({ id: 'maple_syrup', name: 'Pure Maple Syrup', price: 9.99, uses: 5, emoji: '🍁', desc: 'Grade A amber from Vermont. Not "pancake syrup".', build: () => bottle({ liquid: '#a0521e', cap: '#7a1f12', label: 'MAPLE', labelColor: '#fff3d6', labelText: '#a0521e', glass: true, opacity: 0.4, h: 0.2, r: 0.032, key: 'maple' }) }),
]);

// ------------------------------------------------------------------ homemade dish models
const plateOf = (r = 0.12, color) => plate({ r, color });
function spaghettiPlate() {
  const g = group(plateOf(0.12, '#f4efe6'));
  const nd = [F('#e8b850', 0.45), F('#f0c860', 0.45)];
  for (let k = 0; k < 5; k++) {
    const pts = [];
    for (let i = 0; i <= 36; i++) { const t = i / 36, a = t * PI * 5 + k * 1.3, r = 0.075 * (1 - t * 0.65) * (1 - k * 0.04); pts.push([Math.cos(a) * r, 0.016 + t * 0.032 + k * 0.003, Math.sin(a) * r]); }
    g.add(bite(tube(pts, 0.0045, nd[k % 2], 120, 5), 2 + k));
  }
  const sauce = sph(0.038, GL('#a8120a'), 16, 10); sauce.scale.set(1, 0.35, 1); g.add(bite(at(sauce, 0, 0.05, 0), 1));
  for (let i = 0; i < 3; i++) { const l = sph(0.01, F('#1f6b25', 0.45), 8, 6); l.scale.set(1.6, 0.18, 0.8); l.rotation.y = i * 2; g.add(bite(at(l, -0.008 + i * 0.008, 0.06, 0.004 - i * 0.004), 0)); }
  scatter(g, 8, () => box(0.006, 0.0012, 0.002, F('#f6efcf', 0.6)), { rad: 0.02, y: 0.059, tag: 0, seed: 5 });
  const f = fork(0.16); f.rotation.set(0, -0.5, 0); g.add(at(f, 0.06, 0.02, 0.05));
  return g;
}
function steakFrites() {
  const g = group(plateOf(0.13, '#2b2d31'));
  const inner = F('#c4544a', 0.5), crust = mat('#ffffff', { map: TX('sear2', 64, 64, (ctx, W, H) => { ctx.fillStyle = '#4a220e'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#1e0c04'; ctx.lineWidth = 5; for (let i = -2; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * 18, 0); ctx.lineTo(i * 18 + 40, H); ctx.stroke(); } }), rough: 0.6 });
  for (let i = 0; i < 5; i++) { const s = box(0.016, 0.024, 0.07, [inner, inner, crust, F('#4a220e'), F('#6b2a14'), F('#6b2a14')]); s.rotation.set(0, 0.2 + i * 0.08, -0.45); g.add(bite(at(s, -0.075 + i * 0.024, 0.026, -0.015 - i * 0.004), 2 + i)); }
  g.add(bite(at(rbox(0.018, 0.008, 0.016, 0.003, F('#ffe27a', 0.3)), -0.02, 0.042, -0.015), 0));
  for (let i = 0; i < 6; i++) { const p = hemi(0.017, mat('#ffffff', { map: speckTex('roastpot', '#d99a3e', ['#8a5a1d', '#3f6b2a', '#f2c46a'], 40, 2, 5), rough: 0.55 })); p.scale.set(1.15, 0.8, 1); p.rotation.y = i; g.add(bite(at(p, 0.035 + (i % 3) * 0.024, 0.012, 0.0 + Math.floor(i / 3) * 0.03 - 0.005), 7 + (i % 3))); }
  const sprig = group(tube([[-0.04, 0, 0], [0, 0.003, 0.005], [0.04, 0, 0]], 0.0015, F('#4a5a2a'), 8, 4));
  for (let i = 0; i < 8; i++) { const n = box(0.012, 0.0015, 0.002, F('#3f6b2a', 0.5)); n.rotation.y = (i % 2 ? 0.6 : -0.6); sprig.add(at(n, -0.035 + i * 0.01, 0.002, (i % 2 ? 0.003 : -0.003))); }
  g.add(bite(at(rot(sprig, 0, 0.4, 0), -0.02, 0.016, 0.05), 0));
  return g;
}
function salmonBowl() {
  const g = group(bowlShell(0.09, 0.055, MAT.ceramic('#22313f')));
  g.add(bite(fill(0.08, 0.026, F('#f7f4ec', 0.95), 0.036), 9));
  const sal = rbox(0.08, 0.02, 0.04, 0.007, mat('#ffffff', { map: fishTex('salmon', '#ff5a1f', 'rgba(255,235,215,0.8)'), rough: 0.3 }));
  sal.rotation.y = 0.3; g.add(bite(at(sal, -0.012, 0.058, -0.012), 3));
  const glaze = rbox(0.078, 0.004, 0.038, 0.002, GL('#7a2e0e')); glaze.rotation.y = 0.3; g.add(bite(at(glaze, -0.012, 0.068, -0.012), 2));
  for (let i = 0; i < 4; i++) { const s = sph(0.012, F('#7fae2e', 0.4), 12, 8); s.scale.set(1.8, 0.5, 0.6); s.rotation.y = -0.6 + i * 0.25; g.add(bite(at(s, 0.035 + i * 0.002, 0.054, 0.012 + i * 0.01), 4 + (i % 2))); }
  scatter(g, 10, (i) => box(0.0025, 0.0018, 0.0015, F(i % 2 ? '#ffffff' : '#1d1d1d', 0.5)), { cx: -0.012, cz: -0.012, rad: 0.025, y: 0.072, tag: 0, seed: 8 });
  for (let i = 0; i < 6; i++) g.add(bite(at(rot(torus(0.0035, 0.0013, F('#5cb340', 0.5), 5, 10), PI / 2, 0, 0), -0.04 + i * 0.007, 0.052, 0.04 - (i % 2) * 0.006), 0));
  return g;
}
function stirFry() {
  const g = group(bowlShell(0.1, 0.05, MAT.ceramic('#f4efe6')));
  g.add(bite(fill(0.09, 0.022, F('#f7f4ec', 0.95), 0.03), 9));
  scatter(g, 8, () => rbox(0.015, 0.014, 0.015, 0.003, GL('#d9963c')), { cx: -0.025, cz: -0.015, rad: 0.026, y: 0.048, tag: (i) => 2 + (i % 3), seed: 21 });
  for (let i = 0; i < 4; i++) g.add(bite(at(broccoliHead(0.45), 0.03 + (i % 2) * 0.02, 0.032, -0.02 + Math.floor(i / 2) * 0.03), 5 + (i % 2)));
  scatter(g, 6, () => cyl(0.009, 0.009, 0.004, F('#f07a1a', 0.5), 12), { cx: 0, cz: 0.04, rad: 0.02, y: 0.048, tag: 1, seed: 22 });
  scatter(g, 5, () => box(0.03, 0.005, 0.007, GL('#c8102e')), { cx: -0.02, cz: 0.035, rad: 0.018, y: 0.05, tag: 1, seed: 23 });
  scatter(g, 12, () => box(0.0025, 0.0018, 0.0015, F('#f8f1dd', 0.5)), { rad: 0.05, y: 0.06, tag: 0, seed: 24 });
  return g;
}
function omelette() {
  const g = group(plateOf(0.12, '#cfe3ec'));
  const om = sph(0.06, mat('#ffffff', { map: speckTex('omelette', '#f2c23a', ['#d99a1c', '#f7d76a'], 30, 4, 3), rough: 0.5 }), 20, 12);
  om.scale.set(1.25, 0.32, 0.72); om.rotation.y = 0.3;
  g.add(bite(at(om, -0.005, 0.016, 0), 3));
  for (let i = 0; i < 4; i++) { const p = box(0.02, 0.006, 0.007, F(i % 2 ? '#c8102e' : '#3f8f2a', 0.4)); p.rotation.y = 0.3 + i * 0.4; g.add(bite(at(p, -0.05 + i * 0.03, 0.017, 0.042 - Math.abs(i - 1.5) * 0.006), 2)); }
  const ooze = tube([[-0.04, 0.018, 0.04], [-0.01, 0.02, 0.045], [0.02, 0.018, 0.043]], 0.004, GL('#f29a00'), 12, 5); g.add(bite(ooze, 1));
  for (let i = 0; i < 8; i++) g.add(bite(at(box(0.008, 0.0015, 0.0015, F('#3f8f2a', 0.5)), -0.02 + (i % 4) * 0.012, 0.036, -0.01 + Math.floor(i / 4) * 0.012), 0));
  const t = slab([[0, 0], [0.06, 0], [0, 0.06]], 0.01, F('#c98b45', 0.85), 0); t.rotation.z = 2.5; g.add(bite(at(t, 0.06, 0.018, -0.04), 4));
  return g;
}
function homePancakes() {
  const g = group(plateOf(0.11, '#f4efe6'), pancakeStack(3, { blue: false }));
  for (let i = 0; i < 4; i++) { const s = hemi(0.012, GL('#c8102e')); s.scale.set(1, 1.3, 0.8); s.rotation.set(-PI / 2 + 0.3, i * 1.5, 0); g.add(bite(at(s, Math.cos(i * 1.6) * 0.025, 0.05, Math.sin(i * 1.6) * 0.025), 1)); }
  for (let i = 0; i < 3; i++) g.add(bite(at(cyl(0.011, 0.011, 0.004, F('#f7e8b0', 0.5), 14), 0.075, 0.016, -0.03 + i * 0.025), 0));
  return g;
}
function grilledCheese() {
  const g = group(plateOf(0.11, '#f4efe6'));
  const bread = mat('#b8661e', { rough: 0.7 });
  [[-0.025, 0.4, -0.15], [0.03, -0.5, 0.2]].forEach(([x, ry, tilt], i) => {
    const s = new THREE.Group();
    const tri = [[0, 0], [0.09, 0], [0, 0.09]];
    s.add(slab(tri, 0.012, bread, 0, 0.002));
    s.add(slab([[-0.004, -0.004], [0.1, -0.004], [-0.004, 0.1]], 0.008, GL('#f08c00'), 0.015, 0.0015));
    s.add(slab(tri, 0.012, bread, 0.024, 0.002));
    s.position.set(x, 0.014, 0.03); s.rotation.set(tilt, ry, 0);
    g.add(bite(s, i));
  });
  const pk = sph(0.012, F('#6b8f2a', 0.5), 12, 8); pk.scale.set(4, 1, 1); pk.rotation.y = 0.6; g.add(at(pk, 0.04, 0.022, -0.06));
  return g;
}
function homeTacos() {
  const g = group(plateOf(0.13, '#e9f2ef'));
  const beef = [['cube', '#5a2d14', 8], ['shred', '#5ea52a', 6], ['dot', '#f29a00', 6], ['dot', '#c8102e', 3]];
  for (let i = 0; i < 3; i++) { const t = taco({ shellCol: '#e8a83a', spot: '#a8661e', fillings: beef, seed: i + 30 }); t.position.set(0, 0.012, -0.045 + i * 0.045); g.add(bite(t, i)); }
  g.add(at(rot(citrusWedge(0.02), 0, 0.5, 0), 0.075, 0.012, 0.07));
  return g;
}
function curryBowl() {
  const g = group(bowlShell(0.1, 0.05, MAT.ceramic('#f4efe6')));
  const rice = sph(0.045, F('#fbf8ef', 0.9), 18, 10); rice.scale.set(1, 0.45, 0.85); g.add(bite(at(rice, -0.04, 0.03, 0), 6));
  const c = cyl(0.06, 0.05, 0.02, GL('#d4561a'), 24); c.scale.set(0.9, 1, 1); g.add(bite(at(c, 0.025, 0.035, 0), 5));
  scatter(g, 6, () => rbox(0.016, 0.012, 0.014, 0.004, F('#e9a46a', 0.6)), { cx: 0.03, rad: 0.03, y: 0.046, tag: (i) => 2 + (i % 3), seed: 31 });
  g.add(bite(at(rot(torus(0.014, 0.002, F('#fbf3e6', 0.4), 5, 20, PI * 1.5), PI / 2, 0, 0), 0.03, 0.047, 0.01), 1));
  scatter(g, 6, () => { const l = sph(0.005, F('#2f7d32', 0.5), 6, 4); l.scale.y = 0.3; return l; }, { rad: 0.04, y: 0.052, tag: 0, seed: 32 });
  return g;
}
function macCheese() {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.085, 0], [0.09, 0.04], [0.084, 0.041], [0.08, 0.006], [0.001, 0.006]], mat('#1f1f1f', { rough: 0.5, metal: 0.6 }), 32));
  g.add(at(rot(cyl(0.01, 0.012, 0.09, mat('#1f1f1f', { rough: 0.5, metal: 0.6 }), 10), 0, 0, PI / 2 - 0.15), 0.13, 0.035, 0));
  g.add(bite(fill(0.08, 0.02, GL('#f0a020'), 0.022), 9));
  const mm = [mat('#f2b52a', { rough: 0.35, clearcoat: 0.4 }), mat('#e89a18', { rough: 0.35, clearcoat: 0.4 })];
  const rnd = lcg(41);
  for (let i = 0; i < 26; i++) { const t = torus(0.009, 0.0035, mm[i % 2], 6, 10, PI * 0.9); t.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * 0.068; g.add(bite(at(t, Math.cos(a) * rr, 0.035 + rnd() * 0.008, Math.sin(a) * rr), i % 6)); }
  scatter(g, 10, () => rbox(0.008, 0.004, 0.008, 0.002, F('#b8742a', 0.8)), { rad: 0.06, y: 0.043, tag: 0, seed: 42 });
  return g;
}
function homePizza() {
  const g = new THREE.Group();
  const wood = MAT.wood('#b5844f');
  g.add(at(cyl(0.18, 0.18, 0.014, wood, 40), 0, 0.007, 0));
  g.add(at(rbox(0.12, 0.014, 0.05, 0.006, wood), 0.22, 0.007, 0));
  g.add(at(cyl(0.008, 0.008, 0.016, MAT.metal('#9aa0a6'), 10), 0.265, 0.007, 0));
  g.add(pizzaPie({ style: 'margherita', r: 0.155, y: 0.014, crust: '#a85a1e' }));
  return g;
}
function cookieSheet() {
  const g = new THREE.Group();
  const al = MAT.metal('#c9ccd0', 0.35);
  g.add(at(box(0.32, 0.006, 0.23, al), 0, 0.003, 0));
  for (const s of [-1, 1]) { g.add(at(box(0.32, 0.016, 0.006, al), 0, 0.008, s * 0.115)); g.add(at(box(0.006, 0.016, 0.23, al), s * 0.16, 0.008, 0)); }
  g.add(at(box(0.29, 0.001, 0.2, F('#efe3c8', 0.9)), 0, 0.0065, 0));
  for (let i = 0; i < 6; i++) g.add(bite(at(cookieModel('#b8742a', '#2b150c', i + 11), -0.09 + (i % 3) * 0.09, 0.007, -0.05 + Math.floor(i / 3) * 0.1), i));
  return g;
}
function bananaBread() {
  const g = new THREE.Group();
  g.add(at(rbox(0.28, 0.016, 0.13, 0.005, MAT.wood('#c49a6c')), 0, 0.008, 0));
  const crumb = F('#c9944e', 0.85), crust = F('#6b3a18', 0.7);
  for (let i = 0; i < 3; i++) {
    const seg = group(at(box(0.045, 0.06, 0.085, [crust, crust, crust, crust, i === 0 ? crumb : crust, crust]), 0, 0.03, 0));
    const top = cyl(0.043, 0.043, 0.045, F('#5a2e12', 0.75), 16, undefined); top.rotation.z = PI / 2; top.scale.set(1, 1, 0.4); seg.add(at(top, 0, 0.06, 0));
    seg.position.set(-0.07 + i * 0.045, 0.016, 0); g.add(bite(seg, 2 + i));
  }
  for (let i = 0; i < 2; i++) { const sl = box(0.085, 0.016, 0.06, [crust, crust, crumb, crumb, crust, crust]); sl.rotation.y = 0.2 + i * 0.25; g.add(bite(at(sl, 0.07 + i * 0.02, 0.024 + i * 0.016, 0.005 - i * 0.01), i)); }
  return g;
}
function homeBreakfast() {
  const g = group(plateOf(0.12, '#bcd6e3'));
  g.add(bite(at(friedEgg(), -0.03, 0.015, -0.025), 2), bite(at(rot(friedEgg(), 0, 1.2, 0), 0.035, 0.015, -0.035), 3));
  for (let i = 0; i < 3; i++) g.add(bite(at(rot(baconStrip(0.09), 0, -0.2, 0), 0.0, 0.016 + i * 0.002, 0.025 + i * 0.016), 4 + i));
  const t = slab([[0, 0], [0.065, 0], [0, 0.065]], 0.01, F('#c98b45', 0.85), 0); t.rotation.z = -0.9; g.add(bite(at(t, -0.07, 0.019, 0.04), 1));
  g.add(bite(at(rbox(0.016, 0.006, 0.014, 0.002, F('#ffe27a', 0.3)), -0.055, 0.03, 0.03), 0));
  return g;
}
function sheetPanChicken() {
  const g = new THREE.Group();
  const al = MAT.metal('#3a3d42', 0.4);
  g.add(at(box(0.3, 0.006, 0.22, al), 0, 0.003, 0));
  for (const s of [-1, 1]) { g.add(at(box(0.3, 0.02, 0.006, al), 0, 0.01, s * 0.11)); g.add(at(box(0.006, 0.02, 0.22, al), s * 0.15, 0.01, 0)); }
  const skin = mat('#ffffff', { map: speckTex('roastchk2', '#a8561a', ['#6b300c', '#3f6b2a', '#d98a3a'], 60, 2.5, 4), rough: 0.35, clearcoat: 0.6, flat: true });
  [[-0.08, -0.04], [0.0, 0.03], [0.08, -0.03]].forEach(([x, z], i) => { const c = sph(0.042, skin, 11, 8); c.scale.set(1.15, 0.6, 0.9); c.rotation.set(0.15, i, 0.1); g.add(bite(at(c, x, 0.022, z), 3 + i)); });
  scatter(g, 9, (i) => rbox(0.024, 0.02, 0.022, 0.006, mat('#ffffff', { map: speckTex('roastpot', '#d99a3e', ['#8a5a1d', '#3f6b2a', '#f2c46a'], 40, 2, 5), rough: 0.55 })), { rad: 0.1, y: 0.016, tag: (i) => i % 3, seed: 51 });
  for (let i = 0; i < 4; i++) g.add(bite(at(broccoliHead(0.45), -0.11 + i * 0.07, 0.004, 0.065), i % 3));
  return g;
}
function lasagnaDish() {
  const g = new THREE.Group();
  const cer = MAT.ceramic('#b3261e');
  g.add(at(rbox(0.26, 0.012, 0.19, 0.008, cer), 0, 0.006, 0));
  for (const s of [-1, 1]) { g.add(at(rbox(0.26, 0.06, 0.014, 0.006, cer), 0, 0.03, s * 0.088)); g.add(at(rbox(0.014, 0.06, 0.19, 0.006, cer), s * 0.123, 0.03, 0)); }
  const side = mat('#ffffff', { map: TX('lasagnaside', 64, 64, (ctx, W, H) => { const cols = ['#f2d27a', '#b5170b', '#fbf3e0', '#f2d27a', '#a8321e', '#f2d27a', '#d9902a']; cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * H / 7, W, H / 7 + 1); }); }), rough: 0.6 });
  const top = mat('#ffffff', { map: speckTex('lasagnatop2', '#d9862a', ['#8a3a0e', '#f6c55a', '#b5170b', '#6b2a0c'], 110, 3.5, 6), rough: 0.45 });
  for (let i = 0; i < 6; i++) { if (i === 5) continue; const p = box(0.074, 0.05, 0.078, [side, side, top, side, side, side]); g.add(bite(at(p, -0.077 + (i % 3) * 0.077, 0.037, -0.04 + Math.floor(i / 3) * 0.08), i)); }
  for (let i = 0; i < 3; i++) { const l = sph(0.012, F('#1f6b25', 0.45), 8, 6); l.scale.set(1.6, 0.18, 0.8); l.rotation.y = i * 2; g.add(at(l, -0.02 + i * 0.02, 0.064, 0.0)); }
  return g;
}
function lavaCake() {
  const g = group(plateOf(0.1, '#f4efe6'));
  const top = mat('#ffffff', { map: speckTex('powdered', '#3b1d10', ['#fbfaf5', '#f0ebe0'], 90, 2.5, 8), rough: 0.8 });
  g.add(bite(at(cyl(0.034, 0.038, 0.042, [F('#3b1d10', 0.7), top, top], 24), -0.01, 0.033, -0.01), 3));
  const lava = sph(0.03, GL('#2b0f06'), 16, 10); lava.scale.set(1.1, 0.15, 1.4); g.add(bite(at(lava, -0.005, 0.014, 0.03), 2));
  g.add(bite(at(scoop('#f7ecd2', 0.018), 0.05, 0.012, -0.015), 1));
  for (let i = 0; i < 3; i++) g.add(bite(at(sph(0.0075, GL('#c71f37'), 12, 8), 0.035 + i * 0.012, 0.018, 0.045 - (i % 2) * 0.012), 0));
  const mint = sph(0.009, F('#3f9b3a', 0.45), 8, 6); mint.scale.set(1.5, 0.2, 0.8); g.add(bite(at(mint, -0.01, 0.056, -0.01), 0));
  return g;
}
function berryGalette() {
  const g = new THREE.Group();
  g.add(at(rbox(0.24, 0.014, 0.24, 0.006, MAT.wood('#c49a6c')), 0, 0.007, 0));
  g.add(at(liner(0.2, 0.2, checkerTex('#f2e3c6', '#fbf6ec', 4)), 0, 0.0145, 0));
  const dough = mat('#ffffff', { map: speckTex('galette', '#d9953e', ['#f6e3b4', '#a8661e', '#ffffff'], 70, 2, 9), rough: 0.6 });
  g.add(bite(at(cyl(0.08, 0.082, 0.012, dough, 28), 0, 0.021, 0), 4));
  g.add(bite(at(cyl(0.062, 0.062, 0.012, GL('#5a1238'), 24), 0, 0.03, 0), 3));
  for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; const p = rbox(0.045, 0.012, 0.03, 0.006, dough); p.rotation.set(0, -a, 0.35); g.add(bite(at(p, Math.cos(a) * 0.066, 0.034, Math.sin(a) * 0.066), 1 + (i % 2))); }
  scatter(g, 12, (i) => sph(0.0075, GL(i % 3 ? '#2b2d6e' : '#c71f37'), 10, 8), { rad: 0.04, y: 0.04, tag: 0, seed: 61 });
  return g;
}

// ------------------------------------------------------------------ dishes (hidden; produced by cooking)
const dish = (o) => ({ category: 'food', price: 0, hidden: true, stores: [], tags: ['homemade'], rarity: 'common', ...o, use: { type: 'eat', sound: 'bite', hot: true, ...o.use } });
defineItems([
  dish({ id: 'dish_spaghetti', name: 'Spaghetti Pomodoro', emoji: '🍝', desc: 'Twirled spaghetti, bright tomato sauce, basil and parmesan. Made by you.', build: spaghettiPlate, use: { bites: 5, needs: { hunger: 58, comfort: 10, fun: 4 }, buff: 'wellFed', buffMin: 320, sound: 'slurp', cuisine: 'italian', crumbs: '#f0cf6a' } }),
  dish({ id: 'dish_steak_frites', name: 'Pan-Seared Steak & Potatoes', rarity: 'rare', emoji: '🥩', desc: 'Butter-basted ribeye, crispy herb potatoes. Restaurant who?', build: steakFrites, use: { bites: 6, needs: { hunger: 65, comfort: 12, fun: 8, energy: 6 }, buff: 'wellFed', buffMin: 420, cuisine: 'french', crumbs: '#6b3a1f' } }),
  dish({ id: 'dish_salmon_bowl', name: 'Teriyaki Salmon Bowl', rarity: 'uncommon', emoji: '🍣', desc: 'Glazed salmon on fluffy rice with avocado, sesame and scallion.', build: salmonBowl, use: { bites: 5, needs: { hunger: 60, energy: 8, comfort: 6 }, buff: 'vitalized', buffMin: 360, healthy: true, cuisine: 'japanese', crumbs: '#f7f4ec' } }),
  dish({ id: 'dish_stir_fry', name: 'Crispy Tofu Stir-Fry', emoji: '🥢', desc: 'Golden tofu and crunchy veg tossed in a glossy sauce over rice.', build: stirFry, use: { bites: 5, needs: { hunger: 55, energy: 6 }, buff: 'vitalized', buffMin: 300, healthy: true, cuisine: 'chinese', crumbs: '#d9963c' } }),
  dish({ id: 'dish_omelette', name: 'Cheesy Pepper Omelette', emoji: '🍳', desc: 'Fluffy eggs folded over melty cheddar and sweet peppers.', build: omelette, use: { bites: 4, needs: { hunger: 48, energy: 6, comfort: 6 }, buff: 'wellFed', buffMin: 260, healthy: true, cuisine: 'french', crumbs: '#f2c23a' } }),
  dish({ id: 'dish_pancakes', name: 'Homemade Buttermilk Pancakes', emoji: '🥞', desc: 'Your own fluffy stack with butter, syrup and strawberries.', build: homePancakes, use: { bites: 5, needs: { hunger: 50, comfort: 12, fun: 6 }, buff: 'wellFed', buffMin: 300, sweet: true, cuisine: 'american', crumbs: '#bd7432' } }),
  dish({ id: 'dish_grilled_cheese', name: 'Golden Grilled Cheese', emoji: '🧀', desc: 'Buttery, crispy, with a cheese pull worth filming.', build: grilledCheese, use: { bites: 3, needs: { hunger: 45, comfort: 14 }, buff: 'cozy', buffMin: 240, sound: 'crunch', cuisine: 'american', crumbs: '#c9852e' } }),
  dish({ id: 'dish_tacos', name: 'Taco Night Tacos', emoji: '🌮', desc: 'Seasoned beef, crisp lettuce and cheddar. It\'s always Taco Tuesday at home.', build: homeTacos, use: { bites: 5, needs: { hunger: 55, fun: 10 }, buff: 'wellFed', buffMin: 300, sound: 'crunch', cuisine: 'mexican', crumbs: '#e8a83a' } }),
  dish({ id: 'dish_chicken_curry', name: 'Chicken Tikka Masala', emoji: '🍛', desc: 'Tender chicken in a creamy spiced sauce with basmati.', build: curryBowl, use: { bites: 5, needs: { hunger: 62, comfort: 12 }, buff: 'wellFed', buffMin: 360, cuisine: 'indian', crumbs: '#d4561a' } }),
  dish({ id: 'dish_mac_cheese', name: 'Skillet Mac & Cheese', emoji: '🧀', desc: 'Bubbling, golden, extremely cheesy. Peak comfort food.', build: macCheese, use: { bites: 5, needs: { hunger: 58, comfort: 16, fun: 4 }, buff: 'cozy', buffMin: 300, cuisine: 'american', crumbs: '#f2b52a' } }),
  dish({ id: 'dish_pizza_home', name: 'Homemade Margherita', emoji: '🍕', desc: 'Your very own pie, blistered crust and all, on a wooden peel.', build: homePizza, use: { bites: 8, needs: { hunger: 65, fun: 14, comfort: 10 }, buff: 'wellFed', buffMin: 360, cuisine: 'italian', crumbs: '#a85a1e' } }),
  dish({ id: 'dish_cookies', name: 'Fresh-Baked Cookies', emoji: '🍪', desc: 'A whole tray, warm and gooey. The apartment smells amazing.', build: cookieSheet, use: { bites: 6, needs: { hunger: 30, fun: 12, comfort: 10 }, buff: 'sugarRush', buffMin: 180, sweet: true, crumbs: '#b8742a' } }),
  dish({ id: 'dish_banana_bread', name: 'Banana Bread', emoji: '🍌', desc: 'Moist, cinnamon-kissed and a great use for spotty bananas.', build: bananaBread, use: { bites: 5, needs: { hunger: 40, comfort: 12, fun: 4 }, buff: 'cozy', buffMin: 300, sweet: true, crumbs: '#c9944e' } }),
  dish({ id: 'dish_big_breakfast', name: 'Bacon & Eggs Breakfast', emoji: '🍳', desc: 'Sizzling bacon, sunny eggs and buttered toast. A proper start.', build: homeBreakfast, use: { bites: 5, needs: { hunger: 58, energy: 10, comfort: 8 }, buff: 'wellFed', buffMin: 320, cuisine: 'american', crumbs: '#c98b45' } }),
  dish({ id: 'dish_sheet_pan_chicken', name: 'Sheet-Pan Roast Chicken', emoji: '🍗', desc: 'Herby roast chicken, crispy potatoes and charred broccoli. One pan, zero stress.', build: sheetPanChicken, use: { bites: 6, needs: { hunger: 65, comfort: 10, energy: 6 }, buff: 'wellFed', buffMin: 380, healthy: true, cuisine: 'american', crumbs: '#c27a2a' } }),
  dish({ id: 'dish_lasagna', name: 'Sunday Lasagna', rarity: 'rare', emoji: '🍝', desc: 'Layers upon layers of ragù, pasta and bubbling cheese.', build: lasagnaDish, use: { bites: 5, needs: { hunger: 65, comfort: 16, fun: 8 }, buff: 'wellFed', buffMin: 420, cuisine: 'italian', crumbs: '#e0962a' } }),
  dish({ id: 'dish_lava_cake', name: 'Molten Lava Cake', rarity: 'rare', emoji: '🌋', desc: 'Crack it open and watch the chocolate flow. With vanilla ice cream.', build: lavaCake, use: { bites: 4, needs: { hunger: 25, fun: 16, comfort: 12 }, buff: 'treatYoself', buffMin: 240, sweet: true, cuisine: 'french', crumbs: '#3b1d10' } }),
  dish({ id: 'dish_berry_galette', name: 'Rustic Berry Galette', rarity: 'rare', emoji: '🥧', desc: 'Flaky free-form pastry folded around jammy berries.', build: berryGalette, use: { bites: 5, needs: { hunger: 35, fun: 12, comfort: 12 }, buff: 'cozy', buffMin: 300, sweet: true, cuisine: 'french', crumbs: '#d9953e' } }),
]);

// ------------------------------------------------------------------ recipes
registerRecipes([
  { id: 'spaghetti_pomodoro', name: 'Spaghetti Pomodoro', method: 'stove', cookware: 'pot', seconds: 10, ingredients: ['pasta_spaghetti', 'tomato_sauce'], makes: 'dish_spaghetti', color: '#c1121f' },
  { id: 'steak_frites', name: 'Pan-Seared Steak & Potatoes', method: 'stove', cookware: 'pan', seconds: 14, ingredients: ['steak_ribeye', 'potatoes', 'butter'], makes: 'dish_steak_frites', color: '#6b3a1f', learn: true },
  { id: 'salmon_teriyaki', name: 'Teriyaki Salmon Bowl', method: 'stove', cookware: 'pan', seconds: 12, ingredients: ['salmon_fillet', 'rice_jasmine', 'avocados'], makes: 'dish_salmon_bowl', color: '#ff7a3d', learn: true },
  { id: 'tofu_stir_fry', name: 'Crispy Tofu Stir-Fry', method: 'stove', cookware: 'pan', seconds: 10, ingredients: ['veggie_mix', 'tofu_firm', 'rice_jasmine'], makes: 'dish_stir_fry', color: '#6aa84f' },
  { id: 'pepper_omelette', name: 'Cheesy Pepper Omelette', method: 'stove', cookware: 'pan', seconds: 8, ingredients: ['eggs', 'cheese_cheddar', 'bell_peppers'], makes: 'dish_omelette', color: '#f2c23a' },
  { id: 'buttermilk_pancakes', name: 'Buttermilk Pancakes', method: 'stove', cookware: 'pan', seconds: 10, ingredients: ['flour', 'eggs', 'milk'], makes: 'dish_pancakes', color: '#e3b067' },
  { id: 'grilled_cheese', name: 'Grilled Cheese', method: 'stove', cookware: 'pan', seconds: 8, ingredients: ['bread', 'cheese_cheddar', 'butter'], makes: 'dish_grilled_cheese', color: '#d99a3e' },
  { id: 'beef_tacos', name: 'Beef Tacos', method: 'stove', cookware: 'pan', seconds: 10, ingredients: ['tortillas', 'ground_beef', 'lettuce'], makes: 'dish_tacos', color: '#6b3a1f' },
  { id: 'chicken_tikka', name: 'Chicken Tikka Masala', method: 'stove', cookware: 'pot', seconds: 14, ingredients: ['chicken_breast', 'curry_sauce', 'rice_jasmine'], makes: 'dish_chicken_curry', color: '#d4561a' },
  { id: 'mac_and_cheese', name: 'Skillet Mac & Cheese', method: 'stove', cookware: 'pot', seconds: 10, ingredients: ['pasta_macaroni', 'cheese_cheddar', 'milk'], makes: 'dish_mac_cheese', color: '#f2b52a' },
  { id: 'bacon_and_eggs', name: 'Bacon & Eggs', method: 'stove', cookware: 'pan', seconds: 9, ingredients: ['bacon_pack', 'eggs', 'bread'], makes: 'dish_big_breakfast', color: '#9b3b23' },
  { id: 'homemade_pizza', name: 'Homemade Margherita', method: 'oven', seconds: 14, ingredients: ['pizza_dough', 'tomato_sauce', 'mozzarella'], makes: 'dish_pizza_home', color: '#c1121f' },
  { id: 'choc_chip_cookies', name: 'Chocolate Chip Cookies', method: 'oven', seconds: 12, ingredients: ['flour', 'sugar', 'chocolate_chips', 'butter'], makes: 'dish_cookies', color: '#c98b4a' },
  { id: 'banana_bread', name: 'Banana Bread', method: 'oven', seconds: 16, ingredients: ['flour', 'banana', 'sugar', 'eggs'], makes: 'dish_banana_bread', color: '#a0632a' },
  { id: 'sheet_pan_chicken', name: 'Sheet-Pan Roast Chicken', method: 'oven', seconds: 16, ingredients: ['chicken_breast', 'potatoes', 'broccoli'], makes: 'dish_sheet_pan_chicken', color: '#c27a2a' },
  { id: 'sunday_lasagna', name: 'Sunday Lasagna', method: 'oven', seconds: 18, ingredients: ['lasagna_sheets', 'ground_beef', 'tomato_sauce', 'mozzarella'], makes: 'dish_lasagna', color: '#b5170b', learn: true },
  { id: 'lava_cake', name: 'Molten Lava Cake', method: 'oven', seconds: 12, ingredients: ['flour', 'eggs', 'cocoa_powder', 'butter'], makes: 'dish_lava_cake', color: '#3b1d10', learn: true },
  { id: 'berry_galette', name: 'Rustic Berry Galette', method: 'oven', seconds: 14, ingredients: ['flour', 'butter', 'berries', 'sugar'], makes: 'dish_berry_galette', color: '#5a1238', learn: true },
]);

// ------------------------------------------------------------------ cookbooks (teach learn: true recipes)
const book = (o) => ({ category: 'books', stores: ['primo'], rarity: 'uncommon', ...o });
defineItems([
  book({ id: 'cookbook_bistro', name: 'Bistro Nights', price: 24.99, emoji: '📕', desc: 'Restaurant-level dinners for two (or one, no judgement). Teaches Steak & Potatoes and Teriyaki Salmon.', build: () => bookModel({ color: '#1b3a4b', accent: '#e9c46a', title: 'Bistro Nights', author: 'Chef Léa Moreau', style: 1, t: 0.028, w: 0.17, h: 0.23 }), use: { type: 'cookbook', recipes: ['steak_frites', 'salmon_teriyaki'], pages: 8, genre: 'Cookbook', author: 'Léa Moreau' } }),
  book({ id: 'cookbook_nonna', name: 'Nonna\'s Sunday Kitchen', price: 21.99, emoji: '📗', desc: 'Handwritten family secrets, splattered with sauce. Teaches Sunday Lasagna.', build: () => bookModel({ color: '#7a1f12', accent: '#f4e3c1', title: 'Nonna\'s Sunday Kitchen', author: 'Rosa Bellini', style: 0, t: 0.03, w: 0.17, h: 0.23 }), use: { type: 'cookbook', recipes: ['sunday_lasagna', 'spaghetti_pomodoro'], pages: 8, genre: 'Cookbook', author: 'Rosa Bellini' } }),
  book({ id: 'cookbook_sweet', name: 'Sweet Tooth Bakeshop', price: 22.99, emoji: '📘', desc: 'Desserts that make guests gasp. Teaches Molten Lava Cake and Berry Galette.', build: () => bookModel({ color: '#f48fb1', accent: '#5a2d14', title: 'Sweet Tooth Bakeshop', author: 'Pip Sugarman', style: 2, t: 0.026, w: 0.17, h: 0.23 }), use: { type: 'cookbook', recipes: ['lava_cake', 'berry_galette'], pages: 8, genre: 'Cookbook', author: 'Pip Sugarman' } }),
]);

void rbox; void noodles; void polar; void FLAT; void stripeTex;
