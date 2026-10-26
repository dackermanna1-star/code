// Catalogue: tech — TVs, consoles & game cases, speakers, turntables & vinyl,
// headphones, laptops, cameras, optics, VR, streaming gear, RC toys, gadgets.
// Conventions: meters, origin bottom-center, front faces +Z (see docs/CONTENT_GUIDE.md).
import * as THREE from 'three';
import { G } from '../game.js';
import { defineItems } from '../items/registry.js';
import { registerBehaviors, HANDLERS } from '../items/behaviors/index.js';
import { mat, MAT, box, rbox, cyl, sph, torus, capsule, lathe, tube, at, rot, group, plane, decal, extrude, labelTexture, FONT, roundRect, tint } from '../items/kit.js';
import { seeded } from '../core/utils.js';

// ------------------------------------------------------------------ shared helpers (also used by the other hobby/toy catalogues)
const GEO = new Map();
// cached custom geometry (flagged shared so thumbnails never dispose it)
export function sgeo(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set(key, g); }
  return g;
}
export function mesh(geo, material) { const o = new THREE.Mesh(geo, material); o.castShadow = o.receiveShadow = true; return o; }
// canvas text with optional outline & squeeze-to-fit
export function txt(ctx, s, x, y, size, color, o = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 800} ${size}px ${o.font || FONT}`;
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width;
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.max && w > o.max) ctx.scale(o.max / w, 1);
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || size * 0.2; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(s, 0, 0);
  ctx.restore();
}
export function vgrad(ctx, W, H, stops, y0 = 0, y1 = H) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
}
export function circle(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
// a face-forward (+Z) textured plane, cached by key
export function face(w, h, key, draw, o = {}) { return decal(w, h, key, draw, { tw: o.tw || 256, th: o.th, emissive: o.emissive, ei: o.ei ?? 1, transparent: o.transparent ?? false, rough: o.rough ?? 0.45 }); }
// a cylinder whose axis points along Z (discs, lenses, knobs facing +Z)
export function zcyl(rt, rb, h, m, seg = 24) { return rot(cyl(rt, rb, h, m, seg), Math.PI / 2, 0, 0); }
// a cylinder whose axis points along X (wheels, barrels lying sideways)
export function xcyl(rt, rb, h, m, seg = 24) { return rot(cyl(rt, rb, h, m, seg), 0, 0, Math.PI / 2); }
// square frustum along Z, big end (w×h) at +Z, small end scaled by k (geometry pre-rotated so bounds stay tight)
function frustum(w, h, len, k, material) {
  const geo = sgeo(`frustum:${k}`, () => { const g = new THREE.CylinderGeometry(0.7071 * k, 0.7071, 1, 4); g.rotateY(Math.PI / 4); g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g; });
  const m = mesh(geo, material); m.scale.set(w, h, len); return m;
}
const dark = () => mat('#16171a', { rough: 0.4, metal: 0.2 });
const rubber = () => MAT.rubber('#1d1d1f');
const led = (c, ei = 1.6) => mat(c, { emissive: c, ei, rough: 0.4 });
const glassLens = () => mat('#1a2a3a', { rough: 0.05, metal: 0.4, clearcoat: 1 });

// ------------------------------------------------------------------ TVs
function colorBars(ctx, W, H) {
  const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * W / 7, 0, W / 7 + 1, H * 0.68); });
  const low = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  low.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * W / 7, H * 0.68, W / 7 + 1, H * 0.08); });
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, H * 0.76, W, H * 0.24);
  ctx.fillStyle = '#fff'; ctx.fillRect(W * 0.18, H * 0.78, W * 0.16, H * 0.2);
  txt(ctx, 'VOLT', W * 0.7, H * 0.88, H * 0.12, '#eee', { weight: 900 });
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
}
function crtTV() {
  const g = new THREE.Group();
  const wood = MAT.wood('#8a5a3b');
  const W = 0.8, H = 0.6, D = 0.42, by = 0.13;
  g.add(at(rbox(W, H, D, 0.035, wood), 0, by + H / 2, -0.01));
  g.add(at(rbox(W - 0.06, H - 0.06, 0.02, 0.012, mat('#2b2724', { rough: 0.55 })), 0, by + H / 2, D / 2 - 0.012));
  // tube housing
  g.add(at(frustum(0.56, 0.44, 0.2, 0.62, mat('#3a2a20', { rough: 0.6, flat: true })), 0, by + H / 2 + 0.02, -D / 2 - 0.105));
  // screen with rounded silver surround
  const sx = -0.09, sy = by + H / 2 + 0.005;
  g.add(at(rbox(0.54, 0.44, 0.03, 0.05, mat('#b9b4aa', { rough: 0.3, metal: 0.5 })), sx, sy, D / 2 + 0.002));
  g.add(at(rbox(0.49, 0.39, 0.03, 0.045, mat('#0c0c0d', { rough: 0.3 })), sx, sy, D / 2 + 0.008));
  const scr = face(0.45, 0.35, 'crt:bars', colorBars, { emissive: true, ei: 0.35, th: 196 });
  scr.name = 'screen'; g.add(at(scr, sx, sy, D / 2 + 0.024));
  // control column: dials + speaker slots
  const knob = mat('#d8d3c8', { rough: 0.25, metal: 0.6 });
  for (const [i, y] of [[0, 0.17], [1, 0.07]]) {
    const k = zcyl(0.032, 0.036, 0.03, knob, 28); at(k, 0.27, sy + y, D / 2 + 0.01); g.add(k);
    g.add(at(box(0.008, 0.05, 0.006, mat('#222')), 0.27, sy + y, D / 2 + 0.028)).children.at(-1).rotation.z = i ? 0.8 : -0.4;
  }
  g.add(at(face(0.11, 0.14, 'crt:grille', (ctx, w, h) => { ctx.fillStyle = '#2b2724'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#0d0c0b'; for (let y = 8; y < h - 4; y += 14) { roundRect(ctx, 10, y, w - 20, 7, 3); ctx.fill(); } }), 0.27, sy - 0.14, D / 2 + 0.0005));
  g.add(at(sph(0.006, led('#ff3b30', 1.2), 8, 6), 0.32, sy - 0.24, D / 2 + 0.002));
  // mid-century legs
  const legM = MAT.wood('#5a3b26');
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = cyl(0.012, 0.02, 0.15, legM, 10); l.rotation.set(z * 0.18, 0, -x * 0.18); g.add(at(l, x * 0.31, 0.07, z * 0.13)); }
  // rabbit-ear antenna
  const chrome = MAT.chrome();
  g.add(at(sph(0.04, mat('#2b2724', { rough: 0.4 }), 16, 8), 0, by + H, -0.05));
  for (const s of [-1, 1]) { g.add(tube([[0, by + H + 0.03, -0.05], [s * 0.16, by + H + 0.3, -0.08]], 0.003, chrome, 4, 6)); g.add(at(sph(0.007, chrome, 8, 6), s * 0.16, by + H + 0.3, -0.08)); }
  return g;
}
function oledArt(ctx, W, H) {
  vgrad(ctx, W, H, ['#0b1026', '#1f2c6b', '#3d1c5e']);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = ['rgba(94,231,255,0.5)', 'rgba(126,255,170,0.45)', 'rgba(255,111,181,0.35)'][i]; ctx.lineWidth = 26 - i * 6;
    ctx.beginPath(); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * (0.3 + i * 0.08) + Math.sin(x * 0.012 + i) * 30); ctx.stroke();
  }
  ctx.fillStyle = '#0a0c18'; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * 0.8 - Math.abs(Math.sin(x * 0.01)) * 60 - (x % 48)); ctx.lineTo(W, H); ctx.fill();
  const r = seeded(9); for (let i = 0; i < 60; i++) circle(ctx, r() * W, r() * H * 0.5, r() * 1.4, '#fff');
}
function oledTV() {
  const W = 1.45, H = 0.835, by = 0.075;
  const frame = mat('#121316', { rough: 0.3, metal: 0.5 });
  const g = new THREE.Group();
  g.add(at(box(W, H, 0.006, frame), 0, by + H / 2, 0));
  const scr = face(W - 0.012, H - 0.012, 'oled:art', oledArt, { emissive: true, ei: 0.55, tw: 512 }); scr.name = 'screen';
  g.add(at(scr, 0, by + H / 2, 0.0035));
  g.add(at(rbox(W * 0.78, H * 0.42, 0.035, 0.01, frame), 0, by + H * 0.24, -0.02));
  const metal = MAT.metal('#3a3c40', 0.35);
  g.add(at(rbox(0.56, 0.014, 0.28, 0.007, metal), 0, 0.007, -0.03), at(box(0.14, by, 0.03, metal), 0, by / 2 + 0.01, -0.035));
  g.add(at(face(0.07, 0.012, 'oled:logo', (ctx, w, h) => { ctx.fillStyle = '#121316'; ctx.fillRect(0, 0, w, h); txt(ctx, 'VOLT OLED', w / 2, h / 2, h * 0.7, '#9aa0a8'); }, { th: 44 }), 0, by - 0.002, 0.004));
  return g;
}

// ------------------------------------------------------------------ consoles & handhelds
function retroConsole() {
  const g = new THREE.Group();
  const shell = mat('#d5d5db', { rough: 0.45 }), shell2 = mat('#a9a9b6', { rough: 0.45 });
  g.add(at(rbox(0.22, 0.05, 0.17, 0.014, shell), 0, 0.025, 0));
  g.add(at(rbox(0.17, 0.016, 0.11, 0.007, shell2), 0, 0.054, -0.015));
  g.add(at(box(0.11, 0.006, 0.014, mat('#2a2a30')), 0, 0.062, -0.015));
  const slider = mat('#8f7fd1', { rough: 0.35 });
  g.add(at(rbox(0.026, 0.012, 0.018, 0.004, slider), -0.06, 0.054, 0.055), at(rbox(0.026, 0.012, 0.018, 0.004, shell2), 0.06, 0.054, 0.055));
  const l = box(0.008, 0.008, 0.004, led('#ff2a2a', 0.8)); l.name = 'led'; g.add(at(l, -0.085, 0.032, 0.086));
  for (const x of [-0.035, 0.035]) g.add(at(rbox(0.03, 0.016, 0.006, 0.003, mat('#3a3a44')), x, 0.026, 0.085));
  g.add(at(rot(face(0.09, 0.022, 'retro:logo', (ctx, w, h) => { ctx.fillStyle = '#d5d5db'; ctx.fillRect(0, 0, w, h); txt(ctx, 'PIXEL CLASSIC', w / 2, h / 2, h * 0.5, '#5a4fa3', { weight: 900, max: w * 0.9 }); }, { th: 64 }), -Math.PI / 2, 0, 0), 0, 0.0505, 0.055));
  // two dog-bone controllers with cords
  const cbody = mat('#cfcfd6', { rough: 0.45 });
  const btnC = ['#e63946', '#ffd60a', '#2a9d8f', '#3a86ff'];
  for (const s of [-1, 1]) {
    const c = new THREE.Group();
    c.add(at(rot(capsule(0.02, 0.06, cbody), 0, 0, Math.PI / 2), 0, 0.02, 0));
    c.add(at(box(0.026, 0.006, 0.008, mat('#2a2a30')), -0.032, 0.039, 0), at(box(0.008, 0.006, 0.026, mat('#2a2a30')), -0.032, 0.039, 0));
    btnC.forEach((col, i) => { const a = i * Math.PI / 2; c.add(at(cyl(0.005, 0.005, 0.006, mat(col, { rough: 0.3 }), 12), 0.032 + Math.cos(a) * 0.01, 0.039, Math.sin(a) * 0.01)); });
    c.position.set(s * 0.08, 0, 0.17); c.rotation.y = s * -0.25;
    g.add(c);
    g.add(tube([[s * 0.035, 0.02, 0.085], [s * 0.05, 0.004, 0.11], [s * 0.07, 0.004, 0.14], [s * 0.08, 0.02, 0.15]], 0.002, mat('#8d8d97'), 12, 4));
  }
  return g;
}
export function handheldModel({ body = '#7fd1c7', btn = '#d6336c', key = 'pp' } = {}) {
  const g = new THREE.Group();
  const W = 0.09, H = 0.148, D = 0.03;
  g.add(at(rbox(W, H, D, 0.012, mat(body, { rough: 0.35, clearcoat: 0.3 })), 0, H / 2, 0));
  g.add(at(rbox(0.076, 0.064, 0.004, 0.008, mat('#3d4451', { rough: 0.4 })), 0, 0.104, D / 2));
  const scr = face(0.052, 0.046, `hh:screen:${key}`, (ctx, w, h) => {
    ctx.fillStyle = '#9bbc0f'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#306230'; for (let x = 0; x < w; x += 24) ctx.fillRect(x, h * 0.8, 20, h * 0.2);
    ctx.fillStyle = '#0f380f'; ctx.fillRect(w * 0.3, h * 0.55, 22, 26); ctx.fillRect(w * 0.3 + 4, h * 0.48, 14, 12);
    circle(ctx, w * 0.7, h * 0.35, 9, '#8bac0f'); circle(ctx, w * 0.7, h * 0.35, 6, '#306230');
  }, { emissive: true, ei: 0.5, th: 226 });
  g.add(at(scr, 0, 0.106, D / 2 + 0.0025));
  g.add(at(face(0.05, 0.008, `hh:brand:${key}`, (ctx, w, h) => { ctx.fillStyle = body; ctx.fillRect(0, 0, w, h); txt(ctx, 'PocketPal', w / 2, h / 2, h * 0.75, '#2b2f3a', { weight: 900, font: 'Georgia, serif' }); }, { th: 40 }), -0.008, 0.066, D / 2 + 0.0005));
  const blk = mat('#222428', { rough: 0.4 });
  g.add(at(box(0.026, 0.008, 0.006, blk), -0.022, 0.042, D / 2 + 0.002), at(box(0.008, 0.026, 0.006, blk), -0.022, 0.042, D / 2 + 0.002));
  const bm = mat(btn, { rough: 0.3, clearcoat: 0.5 });
  g.add(at(zcyl(0.0065, 0.0065, 0.006, bm, 14), 0.032, 0.048, D / 2 + 0.002), at(zcyl(0.0065, 0.0065, 0.006, bm, 14), 0.018, 0.04, D / 2 + 0.002));
  for (const x of [-0.008, 0.008]) g.add(at(rot(capsule(0.0022, 0.008, blk), 0, 0, 1.0), x, 0.02, D / 2 + 0.001));
  for (let i = 0; i < 5; i++) g.add(at(rot(box(0.0025, 0.016, 0.002, blk), 0, 0, -0.5), 0.022 + i * 0.005, 0.014, D / 2 + 0.0005));
  return g;
}

// ------------------------------------------------------------------ game cases & cover art
const ART = {
  star_blaster(ctx, W, H) {
    const r = seeded(1);
    for (let i = 0; i < 80; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; ctx.fillRect(r() * W, 34 + r() * H, 2, 2); }
    circle(ctx, W * 0.8, H * 0.45, 38, '#ff7b54'); circle(ctx, W * 0.84, H * 0.42, 12, '#e8603c');
    ctx.strokeStyle = '#ffd6a5'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(W * 0.8, H * 0.45, 62, 13, -0.3, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#5ef2ff'; ctx.lineWidth = 4; for (const x of [-12, 12]) { ctx.beginPath(); ctx.moveTo(W * 0.45 + x, H * 0.62); ctx.lineTo(W * 0.45 + x + 34, H * 0.3); ctx.stroke(); }
    ctx.save(); ctx.translate(W * 0.42, H * 0.76); ctx.rotate(0.3);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-12, 26); ctx.lineTo(0, 60); ctx.lineTo(12, 26); ctx.fill();
    ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(32, 30); ctx.lineTo(0, 18); ctx.lineTo(-32, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(9, 4); ctx.lineTo(-9, 4); ctx.fill();
    ctx.restore();
    for (const [x, y] of [[0.22, 0.4], [0.6, 0.27]]) { circle(ctx, W * x, H * y - 4, 9, '#bde0fe'); ctx.fillStyle = '#7bf1a8'; ctx.beginPath(); ctx.ellipse(W * x, H * y, 24, 8, 0, 0, 7); ctx.fill(); }
  },
  snake_byte(ctx, W, H) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 34; y < H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const path = [[2, 14], [3, 14], [4, 14], [5, 14], [6, 14], [6, 13], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [10, 11], [10, 10], [11, 10], [12, 10], [12, 11], [12, 12], [12, 13], [12, 14], [12, 15]];
    path.forEach(([x, y], i) => { ctx.fillStyle = i === path.length - 1 ? '#d8f3a0' : i % 2 ? '#7bd35a' : '#9be26b'; roundRect(ctx, x * 16 + 1, y * 16 + 1, 14, 14, 4); ctx.fill(); });
    ctx.fillStyle = '#111'; ctx.fillRect(12 * 16 + 3, 15 * 16 + 9, 3, 3); ctx.fillRect(12 * 16 + 10, 15 * 16 + 9, 3, 3);
    circle(ctx, 4 * 16 + 8, 9 * 16 + 8, 10, '#ff4d4d'); ctx.fillStyle = '#5cb85c'; ctx.beginPath(); ctx.ellipse(4 * 16 + 12, 9 * 16 - 4, 6, 3, -0.6, 0, 7); ctx.fill();
    txt(ctx, 'SCORE 0420', W / 2, H - 52, 16, '#c9f29b', { weight: 700, font: 'monospace' });
  },
  jump_quest(ctx, W, H) {
    for (const [x, y, s] of [[0.2, 0.42, 1], [0.75, 0.33, 0.8]]) { ctx.fillStyle = '#fff'; for (const [dx, r] of [[-18, 14], [0, 20], [20, 14]]) { ctx.beginPath(); ctx.arc(W * x + dx * s, H * y, r * s, 0, 7); ctx.fill(); } }
    ctx.fillStyle = '#8d5524'; ctx.fillRect(0, H - 60, W, 60); ctx.fillStyle = '#57cc04'; ctx.fillRect(0, H - 64, W, 12);
    for (const x of [0.25, 0.4, 0.55]) { ctx.fillStyle = '#ffb703'; ctx.fillRect(W * x, H * 0.5, 30, 30); ctx.strokeStyle = '#a05a00'; ctx.lineWidth = 3; ctx.strokeRect(W * x, H * 0.5, 30, 30); txt(ctx, '?', W * x + 15, H * 0.5 + 16, 22, '#fff'); }
    for (const [x, y] of [[0.7, 0.55], [0.8, 0.5], [0.9, 0.55]]) { circle(ctx, W * x, H * y, 8, '#ffd60a'); circle(ctx, W * x, H * y, 4, '#f4a100'); }
    ctx.save(); ctx.translate(W * 0.62, H * 0.7);
    ctx.fillStyle = '#e63946'; roundRect(ctx, -14, -10, 28, 30, 8); ctx.fill();
    circle(ctx, 0, -22, 15, '#ffd6a5'); ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, -26, 16, Math.PI, 0); ctx.fill(); ctx.fillRect(0, -28, 22, 5);
    circle(ctx, 5, -21, 2.5, '#222'); ctx.fillStyle = '#1d3557'; ctx.fillRect(-14, 16, 10, 12); ctx.fillRect(6, 10, 10, 12);
    ctx.restore();
  },
  pong_royale(ctx, W, H) {
    ctx.fillStyle = '#05050c'; ctx.fillRect(0, 34, W, H);
    ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W / 2, 90); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.shadowBlur = 18; ctx.shadowColor = '#5ef2ff'; ctx.fillStyle = '#5ef2ff'; ctx.fillRect(22, H * 0.45, 12, 70);
    ctx.shadowColor = '#ff4fa3'; ctx.fillStyle = '#ff4fa3'; ctx.fillRect(W - 34, H * 0.6, 12, 70);
    ctx.shadowColor = '#fff'; circle(ctx, W * 0.62, H * 0.55, 9, '#fff'); ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(W / 2 - 34, H * 0.36); ctx.lineTo(W / 2 - 34, H * 0.28); ctx.lineTo(W / 2 - 17, H * 0.33); ctx.lineTo(W / 2, H * 0.25); ctx.lineTo(W / 2 + 17, H * 0.33); ctx.lineTo(W / 2 + 34, H * 0.28); ctx.lineTo(W / 2 + 34, H * 0.36); ctx.fill();
    txt(ctx, '11 : 09', W / 2, H - 50, 22, '#fff', { font: 'monospace' });
  },
  rhythm_pop(ctx, W, H) {
    const cols = ['#ff4fa3', '#5ef2ff', '#7bf1a8', '#ffd23f']; const ar = ['←', '↓', '↑', '→'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(28 + i * 52, 100, 44, H - 130); for (let k = 0; k < 2; k++) { const y = 130 + ((i * 53 + k * 90) % 160); circle(ctx, 50 + i * 52, y, 18, cols[i]); txt(ctx, ar[i], 50 + i * 52, y + 1, 22, '#fff', { weight: 900 }); } }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(24, H - 70, W - 48, 40);
    for (const [x, y, s] of [[0.15, 0.32, 26], [0.86, 0.4, 30], [0.75, 0.84, 22]]) txt(ctx, '♪', W * x, H * y, s, '#fff');
  },
  slice_party(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 40; y < H; y += 28) ctx.fillRect(0, y, W, 2);
    const fruit = [[0.3, 0.45, 30, '#2d6a4f', '#e63946'], [0.72, 0.55, 26, '#f77f00', '#ffb703'], [0.42, 0.75, 24, '#6a994e', '#c7e8a0']];
    for (const [x, y, r, rind, flesh] of fruit) { circle(ctx, W * x, H * y, r, rind); circle(ctx, W * x, H * y, r * 0.82, flesh); }
    for (let i = 0; i < 7; i++) circle(ctx, W * 0.3 - 12 + i * 4, H * 0.45 - 6 + (i % 3) * 6, 2.5, '#222');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.shadowBlur = 14; ctx.shadowColor = '#fff';
    ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.82); ctx.quadraticCurveTo(W * 0.5, H * 0.35, W * 0.95, H * 0.42); ctx.stroke(); ctx.shadowBlur = 0;
    for (let i = 0; i < 12; i++) circle(ctx, W * (0.55 + Math.cos(i) * 0.12), H * (0.5 + Math.sin(i * 1.7) * 0.06), 3, '#ff6b6b');
  },
  fishing_frenzy(ctx, W, H) {
    vgrad(ctx, W, H, ['#ffe8a3', '#ffc078'], 34, 110); vgrad(ctx, W, H, ['#4cc9f0', '#03045e'], 110, H);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 110 + Math.sin(x * 0.08) * 4); ctx.stroke();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W * 0.6, 34); ctx.lineTo(W * 0.6, H * 0.62); ctx.stroke();
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W * 0.6 - 6, H * 0.62, 6, 0, Math.PI); ctx.stroke();
    for (const [x, y, s, c] of [[0.3, 0.55, 1.3, '#ff9f1c'], [0.75, 0.75, 1, '#ff4d6d'], [0.35, 0.85, 0.8, '#ffd60a']]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(W * x, H * y, 24 * s, 12 * s, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W * x - 20 * s, H * y); ctx.lineTo(W * x - 36 * s, H * y - 12 * s); ctx.lineTo(W * x - 36 * s, H * y + 12 * s); ctx.fill();
      circle(ctx, W * x + 12 * s, H * y - 3 * s, 3 * s, '#111');
    }
    for (let i = 0; i < 6; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(W * 0.4 + i * 6, H * 0.45 - i * 14, 3 + i % 3, 0, 7); ctx.stroke(); }
  },
  breakout_blitz(ctx, W, H) {
    const cols = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
    cols.forEach((c, r) => { for (let i = 0; i < 6; i++) { if ((r + i) % 5 === 3) continue; ctx.fillStyle = c; ctx.fillRect(10 + i * 40, 100 + r * 18, 36, 14); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(10 + i * 40, 100 + r * 18, 36, 4); } });
    ctx.fillStyle = '#e0e1dd'; roundRect(ctx, W * 0.36, H - 56, 70, 12, 6); ctx.fill();
    for (let i = 0; i < 6; i++) circle(ctx, W * 0.36 + 60 - i * 9, H - 84 - i * 14, 7 - i, `rgba(255,255,255,${1 - i * 0.15})`);
  },
  dungeon_dash(ctx, W, H) {
    for (let y = 34; y < H; y += 22) for (let x = (y / 22) % 2 ? -20 : 0; x < W; x += 40) { ctx.fillStyle = (x + y) % 3 ? '#4a3f45' : '#3e3439'; ctx.fillRect(x + 1, y + 1, 38, 20); }
    ctx.fillStyle = '#6b4226'; ctx.fillRect(28, 120, 8, 40); circle(ctx, 32, 112, 12, '#ff9f1c'); circle(ctx, 32, 108, 7, '#ffe066');
    ctx.fillStyle = '#8d5524'; roundRect(ctx, W * 0.58, H * 0.72, 70, 44, 6); ctx.fill(); ctx.fillStyle = '#ffd60a'; ctx.fillRect(W * 0.58, H * 0.72 + 14, 70, 6); ctx.fillRect(W * 0.58 + 31, H * 0.72 + 10, 8, 14);
    ctx.save(); ctx.translate(W * 0.36, H * 0.66);
    ctx.fillStyle = '#adb5bd'; roundRect(ctx, -20, -20, 40, 52, 8); ctx.fill(); circle(ctx, 0, -32, 20, '#ced4da');
    ctx.fillStyle = '#212529'; ctx.fillRect(-12, -36, 24, 5); ctx.fillStyle = '#e63946'; ctx.fillRect(-3, -60, 6, 14);
    ctx.fillStyle = '#e9ecef'; ctx.fillRect(24, -50, 6, 60); ctx.fillStyle = '#ffd60a'; ctx.fillRect(18, 6, 18, 5);
    ctx.restore();
    circle(ctx, W * 0.85, H * 0.5, 12, '#f1f3f5'); ctx.fillStyle = '#212529'; ctx.fillRect(W * 0.85 - 6, H * 0.5 - 3, 4, 4); ctx.fillRect(W * 0.85 + 2, H * 0.5 - 3, 4, 4);
  },
  word_bloom(ctx, W, H) {
    ctx.strokeStyle = '#2d6a4f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, H * 0.9); ctx.bezierCurveTo(W * 0.3, H * 0.6, W * 0.6, H, W, H * 0.7); ctx.stroke();
    for (const [x, y, c] of [[0.2, 0.5, '#ff70a6'], [0.78, 0.45, '#ffd166'], [0.5, 0.88, '#a0c4ff']]) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; circle(ctx, W * x + Math.cos(a) * 16, H * y + Math.sin(a) * 16, 11, c); } circle(ctx, W * x, H * y, 9, '#fff3b0'); }
    'WORD'.split('').forEach((ch, i) => { ctx.save(); ctx.translate(48 + i * 46, H * 0.66 + (i % 2) * 8); ctx.rotate((i - 1.5) * 0.08); ctx.fillStyle = '#fdf0d5'; roundRect(ctx, -18, -18, 36, 36, 5); ctx.fill(); ctx.strokeStyle = '#bc6c25'; ctx.lineWidth = 2; ctx.stroke(); txt(ctx, ch, 0, 1, 24, '#6b3e1e', { font: 'Georgia, serif' }); ctx.restore(); });
  },
};
function coverDraw(gm, extra = null) {
  return (ctx, W, H) => {
    vgrad(ctx, W, H, [gm.c1, gm.c2], 34, H);
    ART[gm.id](ctx, W, H);
    txt(ctx, gm.name.toUpperCase(), W / 2, 66, 32, '#fff', { stroke: '#111', lw: 7, max: W - 26, weight: 900 });
    ctx.fillStyle = gm.platform === 'pocket' ? '#d6336c' : '#1d4ed8'; ctx.fillRect(0, 0, W, 34);
    txt(ctx, gm.platform === 'pocket' ? 'PocketPal' : 'NOVA BOX', 12, 17, 15, '#fff', { align: 'left', weight: 900 });
    txt(ctx, '⚡', W - 18, 17, 16, '#ffe000');
    ctx.fillStyle = '#fff'; ctx.fillRect(10, H - 44, 26, 34); ctx.fillStyle = '#111'; ctx.fillRect(12, H - 42, 22, 22);
    txt(ctx, 'E', 23, H - 31, 16, '#fff', { weight: 900 }); txt(ctx, 'ALL', 23, H - 15, 7, '#111');
    txt(ctx, 'VOLT GAMES', W - 12, H - 18, 11, '#fff', { align: 'right', stroke: 'rgba(0,0,0,0.5)', lw: 3 });
    if (extra) extra(ctx, W, H);
  };
}
function gameCase(gm, { edition = null } = {}) {
  const W = 0.135, H = 0.17, D = 0.014;
  const shellC = gm.platform === 'pocket' ? '#c9184a' : '#1d4ed8';
  const g = group(at(rbox(W, H, D, 0.003, mat(shellC, { rough: 0.35 })), 0, H / 2, 0));
  const key = `game:${gm.id}${edition ? ':ce' : ''}`;
  const extra = edition ? (ctx, w, h) => { ctx.fillStyle = '#d4a017'; ctx.fillRect(0, h - 64, w, 18); txt(ctx, edition, w / 2, h - 55, 11, '#1b1b1b', { weight: 900 }); } : null;
  const cov = face(W - 0.005, H - 0.005, key, coverDraw(gm, extra), { th: 320, rough: 0.3 });
  g.add(at(cov, 0, H / 2, D / 2 + 0.0006));
  const spine = face(H - 0.008, D - 0.003, `${key}:spine`, (ctx, w, h) => { ctx.fillStyle = shellC; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, h * 1.2, h); txt(ctx, gm.name.toUpperCase(), w * 0.55, h / 2, h * 0.6, '#fff', { max: w * 0.7, weight: 900 }); }, { th: 24 });
  spine.rotation.set(0, -Math.PI / 2, Math.PI / 2); g.add(at(spine, -W / 2 - 0.0006, H / 2, 0));
  if (edition) { g.add(at(rbox(W + 0.01, 0.03, D + 0.02, 0.004, MAT.gold()), 0, 0.015, 0)); }
  return g;
}

// ------------------------------------------------------------------ speakers & radios
function pillSpeaker({ color = '#ff6b6b', cap = '#2b2d42', key = 'pill' } = {}) {
  const g = new THREE.Group();
  const R = 0.036, L = 0.16;
  g.add(at(xcyl(R, R, L, MAT.fabric(color), 36), 0, R + 0.004, 0));
  const capM = mat(cap, { rough: 0.85 });
  for (const s of [-1, 1]) g.add(at(xcyl(R * 1.06, R * 1.06, 0.02, capM, 36), s * (L / 2 + 0.008), R + 0.004, 0));
  const radiator = xcyl(R * 0.72, R * 0.72, 0.006, mat(tint(cap, 1.4), { rough: 0.5 }), 28); radiator.name = 'cone';
  g.add(at(radiator, L / 2 + 0.019, R + 0.004, 0));
  g.add(at(rbox(0.08, 0.006, 0.016, 0.003, capM), 0, 2 * R + 0.006, 0));
  g.add(at(rot(face(0.07, 0.012, `pill:${key}`, (ctx, w, h) => { ctx.fillStyle = cap; ctx.fillRect(0, 0, w, h); ['−', '⏯', '+', '✱'].forEach((c, i) => txt(ctx, c, w * (0.14 + i * 0.24), h / 2, h * 0.7, '#fff')); }, { th: 44 }), -Math.PI / 2, 0, 0), 0, 2 * R + 0.0095, 0));
  g.add(at(rot(torus(0.016, 0.004, capM, 8, 20), 0, Math.PI / 2, 0), -L / 2 - 0.022, R + 0.03, 0));
  return g;
}
function wooferGroup(r, coneC = '#1d1d1f') {
  const w = new THREE.Group();
  const depth = r * 0.32;
  w.add(zcyl(r * 1.12, r * 1.12, 0.004, mat('#2a2a2c', { rough: 0.4, metal: 0.3 }), 32));
  w.add(at(rot(lathe([[r * 0.18, 0], [r * 0.88, depth]], mat(coneC, { rough: 0.7, side: THREE.DoubleSide }), 32), Math.PI / 2, 0, 0), 0, 0, 0.002));
  w.add(at(torus(r * 0.92, r * 0.08, MAT.rubber('#111'), 8, 32), 0, 0, 0.002 + depth));
  const dust = sph(r * 0.2, mat(tint(coneC, 1.3), { rough: 0.4 }), 16, 8); dust.scale.z = 0.5; w.add(at(dust, 0, 0, 0.004));
  return w;
}
function bookshelfSpeakers() {
  const g = new THREE.Group();
  const wood = MAT.wood('#6b4423');
  const baffle = mat('#1e1e20', { rough: 0.6 });
  [-1, 1].forEach((s, i) => {
    const sp = new THREE.Group();
    sp.add(at(rbox(0.165, 0.27, 0.21, 0.008, wood), 0, 0.135 + 0.008, 0));
    sp.add(at(box(0.15, 0.255, 0.006, baffle), 0, 0.143, 0.104));
    const wf = wooferGroup(0.052, '#c8a46a'); at(wf, 0, 0.1, 0.107); if (i === 0) wf.name = 'cone'; sp.add(wf);
    sp.add(at(zcyl(0.024, 0.024, 0.006, MAT.metal('#555', 0.4), 24), 0, 0.215, 0.107));
    const tw = sph(0.013, mat('#d8d0bd', { rough: 0.3, metal: 0.4 }), 16, 10); tw.scale.z = 0.5; sp.add(at(tw, 0, 0.215, 0.11));
    sp.add(at(face(0.05, 0.01, 'bss:logo', (ctx, w, h) => { ctx.fillStyle = '#1e1e20'; ctx.fillRect(0, 0, w, h); txt(ctx, 'VOLT · AUDIO', w / 2, h / 2, h * 0.7, '#c9a86a'); }, { th: 40 }), 0, 0.03, 0.1075));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sp.add(at(cyl(0.01, 0.01, 0.008, MAT.rubber('#111'), 10), x * 0.065, 0.004, z * 0.085));
    sp.position.x = s * 0.17; sp.rotation.y = -s * 0.12;
    g.add(sp);
  });
  return g;
}
function boombox() {
  const g = new THREE.Group();
  const W = 0.52, H = 0.25, D = 0.12;
  const silver = mat('#c4c8cf', { rough: 0.3, metal: 0.65 });
  const black = mat('#1b1c20', { rough: 0.45 });
  g.add(at(rbox(W, H, D, 0.025, silver), 0, H / 2, 0));
  g.add(at(rbox(W - 0.02, 0.03, D + 0.004, 0.01, black), 0, 0.016, 0));
  const grilleTex = face(0.15, 0.15, 'boom:grille', (ctx, w, h) => { ctx.fillStyle = '#18181b'; ctx.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 10) for (let x = (y / 10) % 2 ? 6 : 11; x < w; x += 10) circle(ctx, x, y, 3, '#2d2e33'); }, { transparent: false });
  void grilleTex;
  [-1, 1].forEach((s, i) => {
    const sp = new THREE.Group();
    sp.add(zcyl(0.085, 0.085, 0.012, MAT.chrome(), 40));
    sp.add(at(zcyl(0.076, 0.076, 0.004, black, 40), 0, 0, 0.006));
    const wf = wooferGroup(0.058, '#26272b'); at(wf, 0, 0, 0.004); sp.add(wf);
    for (let k = 0; k < 5; k++) sp.add(at(box(0.15, 0.004, 0.004, mat('#9aa0a8', { metal: 0.8, rough: 0.3 })), 0, -0.06 + k * 0.03, 0.022));
    if (i === 0) wf.name = 'cone';
    at(sp, s * 0.165, 0.115, D / 2 + 0.002); g.add(sp);
  });
  g.add(at(rbox(0.15, 0.08, 0.012, 0.01, black), 0, 0.105, D / 2 + 0.002));
  g.add(at(face(0.12, 0.06, 'boom:tape', (ctx, w, h) => { ctx.fillStyle = '#3a3d44'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f4f1de'; roundRect(ctx, 12, 14, w - 24, h - 26, 8); ctx.fill(); ctx.fillStyle = '#e63946'; ctx.fillRect(12, 22, w - 24, 12); for (const x of [0.33, 0.67]) { circle(ctx, w * x, h * 0.62, 18, '#2b2b2b'); circle(ctx, w * x, h * 0.62, 8, '#fff'); } txt(ctx, 'MIXTAPE', w / 2, 28, 10, '#fff'); }, { th: 128 }), 0, 0.105, D / 2 + 0.009));
  g.add(at(face(0.4, 0.035, 'boom:dial', (ctx, w, h) => { ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ffb703'; for (let i = 0; i < 40; i++) ctx.fillRect(10 + i * (w - 20) / 40, h * 0.55, 2, i % 5 ? 6 : 12); txt(ctx, 'FM  88  92  96  100  104  108', w / 2, h * 0.28, h * 0.3, '#ffb703', { max: w * 0.9 }); ctx.fillStyle = '#ff3b30'; ctx.fillRect(w * 0.62, 4, 3, h - 8); }, { th: 24, emissive: true, ei: 0.4 }), 0, 0.215, D / 2 + 0.001));
  const keyC = ['#e63946', '#1b1c20', '#1b1c20', '#1b1c20', '#1b1c20', '#2a9d8f'];
  keyC.forEach((c, i) => g.add(at(rbox(0.028, 0.014, 0.04, 0.004, mat(c, { rough: 0.4 })), -0.085 + i * 0.034, H + 0.004, 0.02)));
  for (const s of [-1, 1]) g.add(at(box(0.02, 0.05, 0.03, black), s * 0.2, H + 0.02, 0));
  g.add(tube([[-0.2, H + 0.04, 0], [-0.15, H + 0.075, 0], [0.15, H + 0.075, 0], [0.2, H + 0.04, 0]], 0.012, black, 20, 8));
  g.add(at(rot(cyl(0.004, 0.0025, 0.34, MAT.chrome(), 8), 0, 0, -0.45), 0.24 + 0.075, H + 0.14, -0.04));
  for (const s of [-1, 1]) g.add(at(zcyl(0.014, 0.016, 0.014, MAT.chrome(), 20), s * 0.235, 0.215, D / 2 + 0.004));
  return g;
}
function smartSpeaker({ fabricC = '#9aa5b1', top = '#2b2f36' } = {}) {
  const g = group(at(cyl(0.05, 0.053, 0.15, MAT.fabric(fabricC), 40), 0, 0.077, 0));
  g.add(at(cyl(0.053, 0.053, 0.004, MAT.rubber('#222'), 40), 0, 0.002, 0));
  g.add(at(cyl(0.05, 0.05, 0.008, mat(top, { rough: 0.25, clearcoat: 0.6 }), 40), 0, 0.156, 0));
  const ring = rot(torus(0.042, 0.0035, mat('#9ff3ff', { emissive: '#4fd8ff', ei: 0.4, rough: 0.3 }), 8, 48), Math.PI / 2, 0, 0); ring.name = 'ring';
  g.add(at(ring, 0, 0.16, 0));
  for (const x of [-0.016, 0.016]) g.add(at(cyl(0.004, 0.004, 0.002, mat('#555', { rough: 0.3 }), 10), x, 0.161, 0));
  return g;
}
function smartPuck() {
  const g = group(lathe([[0.001, 0], [0.044, 0], [0.05, 0.008], [0.051, 0.03], [0.047, 0.042], [0.001, 0.042]], MAT.fabric('#4a4e57'), 40));
  g.add(at(cyl(0.046, 0.046, 0.006, mat('#2b2d33', { rough: 0.3, clearcoat: 0.5 }), 40), 0, 0.043, 0));
  const ring = rot(torus(0.044, 0.0028, mat('#bde0fe', { emissive: '#7aa7ff', ei: 0.4 }), 8, 48), Math.PI / 2, 0, 0); ring.name = 'ring';
  g.add(at(ring, 0, 0.046, 0));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; g.add(at(cyl(0.004, 0.004, 0.002, mat('#888'), 10), Math.cos(a) * 0.02, 0.0465, Math.sin(a) * 0.02)); }
  return g;
}
function jukebox() {
  const g = new THREE.Group();
  const W = 0.86, D = 0.6, bodyH = 1.0, R = W / 2;
  const wood = MAT.wood('#7a2e1e');
  g.add(at(rbox(W, 0.06, D, 0.01, mat('#151515', { rough: 0.5 })), 0, 0.03, 0));
  g.add(at(rbox(W, bodyH - 0.06, D, 0.02, wood), 0, 0.03 + bodyH / 2, 0));
  const arch = mesh(sgeo('juke:arch', () => new THREE.CylinderGeometry(R, R, D * 0.94, 48, 1, false, -Math.PI / 2, Math.PI)), wood);
  arch.rotation.x = -Math.PI / 2; g.add(at(arch, 0, bodyH, 0));
  const fz = D / 2;
  // window with record carousel
  const back = mesh(sgeo('juke:win', () => new THREE.CircleGeometry(R * 0.7, 40, 0, Math.PI)), mat('#1c1020', { rough: 0.5 }));
  g.add(at(back, 0, bodyH + 0.0, fz * 0.94 + 0.002));
  for (let i = 0; i < 7; i++) { const a = Math.PI * (0.15 + i * 0.7 / 6); const d = zcyl(0.075, 0.075, 0.004, mat('#111', { rough: 0.15, clearcoat: 1 }), 28); d.rotation.set(Math.PI / 2, 0, 0); g.add(at(d, Math.cos(a) * 0.17, bodyH + 0.02 + Math.sin(a) * 0.12, fz * 0.94 + 0.008 + (i % 2) * 0.004)); g.add(at(zcyl(0.024, 0.024, 0.005, mat(['#e63946', '#ffd166', '#06d6a0', '#118ab2'][i % 4]), 16), Math.cos(a) * 0.17, bodyH + 0.02 + Math.sin(a) * 0.12, fz * 0.94 + 0.011 + (i % 2) * 0.004)); }
  g.add(at(rot(cyl(0.012, 0.012, 0.22, MAT.chrome(), 12), 0, 0, Math.PI / 2), 0, bodyH + 0.02, fz * 0.94 + 0.012));
  const glass = mesh(sgeo('juke:glass', () => new THREE.CircleGeometry(R * 0.72, 40, 0, Math.PI)), MAT.glass('#f2e6ff', 0.18));
  g.add(at(glass, 0, bodyH, fz * 0.94 + 0.03));
  // neon arcs + side bubble tubes
  const neonC = ['#ff4fa3', '#5ef2ff', '#ffd23f'];
  neonC.forEach((c, i) => { const n = torus(R * (0.97 - i * 0.1), 0.012, mat(c, { emissive: c, ei: 1.8, rough: 0.3 }), 8, 48, Math.PI); n.userData.jukeNeon = i; g.add(at(n, 0, bodyH, fz * 0.94 + 0.012)); });
  for (const s of [-1, 1]) { const p = cyl(0.03, 0.03, bodyH - 0.12, mat('#ffb347', { emissive: '#ff8c1a', ei: 1.4, rough: 0.25, opacity: 0.9, transparent: true }), 20); p.userData.jukeNeon = 3; g.add(at(p, s * (W / 2 - 0.035), 0.06 + (bodyH - 0.12) / 2, fz - 0.03)); }
  // selector panel, title strips, grille
  const panel = box(W - 0.16, 0.08, 0.16, MAT.chrome()); panel.rotation.x = 0.5; g.add(at(panel, 0, bodyH - 0.12, fz - 0.02));
  g.add(at(rot(face(W - 0.2, 0.06, 'juke:titles', (ctx, w, h) => { ctx.fillStyle = '#fdf6e3'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 2; for (let c = 0; c < 6; c++) for (let r = 0; r < 2; r++) { ctx.strokeRect(6 + c * (w - 12) / 6, 6 + r * (h - 12) / 2, (w - 12) / 6 - 4, (h - 12) / 2 - 4); ctx.fillStyle = '#333'; ctx.fillRect(14 + c * (w - 12) / 6, 14 + r * (h - 12) / 2, (w - 12) / 6 - 20, 3); } }, { th: 64 }), -0.5, 0, 0), 0, bodyH - 0.1, fz + 0.025));
  for (let i = 0; i < 10; i++) g.add(at(rbox(0.04, 0.02, 0.02, 0.006, mat(i % 2 ? '#fdf6e3' : '#e63946', { rough: 0.3 })), -0.27 + i * 0.06, bodyH - 0.22, fz + 0.005));
  g.add(at(face(W - 0.2, 0.42, 'juke:grille', (ctx, w, h) => { vgrad(ctx, w, h, ['#e9ecef', '#adb5bd']); ctx.fillStyle = '#2b2b2b'; for (let y = 10; y < h - 6; y += 14) for (let x = 10; x < w - 6; x += 14) circle(ctx, x, y, 4, '#343a40'); }, { th: 210, rough: 0.25 }), 0, 0.38, fz + 0.001));
  g.add(at(face(0.3, 0.06, 'juke:badge', (ctx, w, h) => { ctx.fillStyle = '#c9a86a'; roundRect(ctx, 0, 0, w, h, h / 2); ctx.fill(); txt(ctx, 'Maison Luxe · 1956', w / 2, h / 2, h * 0.42, '#3b2a14', { font: 'Georgia, serif', max: w * 0.9 }); }, { th: 52, transparent: true }), 0, 0.13, fz + 0.002));
  return g;
}
function cathedralRadio() {
  const g = new THREE.Group();
  const prof = [[-0.15, 0], [0.15, 0], [0.15, 0.16]];
  for (let i = 1; i < 16; i++) { const a = i / 16 * Math.PI; prof.push([Math.cos(a) * 0.15, 0.16 + Math.sin(a) * 0.13]); }
  prof.push([-0.15, 0.16]);
  g.add(at(extrude(prof, 0.15, MAT.wood('#7b4b2a'), 0.008, undefined, 'radio:body'), 0, 0, 0));
  const inner = [[-0.1, 0.11], [0.1, 0.11], [0.1, 0.17]];
  for (let i = 1; i < 12; i++) { const a = i / 12 * Math.PI; inner.push([Math.cos(a) * 0.1, 0.17 + Math.sin(a) * 0.09]); }
  inner.push([-0.1, 0.17]);
  g.add(at(extrude(inner, 0.004, MAT.fabric('#d9c39a'), 0.0, undefined, 'radio:cloth'), 0, 0, 0.086));
  const fret = MAT.wood('#5a3519');
  for (const x of [-0.05, 0, 0.05]) g.add(at(box(0.008, 0.16 - Math.abs(x), 0.008, fret), x, 0.19 - Math.abs(x) * 0.5, 0.09));
  g.add(at(torus(0.06, 0.005, fret, 6, 24, Math.PI), 0, 0.2, 0.09));
  const dial = face(0.1, 0.035, 'radio:dial', (ctx, w, h) => { ctx.fillStyle = '#f2d49b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#5a3519'; for (let i = 0; i < 12; i++) ctx.fillRect(8 + i * (w - 16) / 11, h * 0.55, 2, h * 0.3); txt(ctx, '55  70  90  110  140', w / 2, h * 0.28, h * 0.26, '#5a3519', { max: w * 0.9 }); ctx.fillStyle = '#c1121f'; ctx.fillRect(w * 0.4, 2, 2, h - 4); }, { th: 90, emissive: true, ei: 0.45 });
  dial.userData.bulb = true;
  g.add(at(dial, 0, 0.068, 0.0838));
  for (const x of [-0.09, 0, 0.09]) g.add(at(zcyl(0.014, 0.016, 0.018, mat('#3b2412', { rough: 0.4 }), 18), x, 0.03, 0.085));
  return g;
}

// ------------------------------------------------------------------ turntables & vinyl
function grooveTex(label) {
  return labelTexture(`grooves:${label}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, w, h);
    for (let r = 40; r < 126; r += 2) { ctx.strokeStyle = r % 6 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, 7); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(0.7, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, 126, 0, 7); ctx.fill();
    if (label) { circle(ctx, w / 2, h / 2, 38, label); circle(ctx, w / 2, h / 2, 3, '#000'); }
  });
}
// a vinyl disc lying in the XZ plane (axis Y)
function recordDisc(r, label) {
  const geo = sgeo(`disc:${r}`, () => new THREE.CylinderGeometry(r, r, 0.002, 64));
  const side = mat('#0e0e10', { rough: 0.3 });
  const top = mat('#ffffff', { map: grooveTex(label), rough: 0.22, clearcoat: 0.8 });
  return mesh(geo, [side, top, top]);
}
function tonearm(x, y, z, len = 0.23) {
  const mirror = new THREE.Group(); mirror.scale.x = -1; mirror.position.set(x, y, z);
  const arm = new THREE.Group(); arm.name = 'arm';
  const metal = MAT.chrome();
  arm.add(at(cyl(0.018, 0.022, 0.03, mat('#2b2b2b', { metal: 0.6, rough: 0.3 }), 20), 0, 0.015, 0));
  arm.add(tube([[0, 0.03, -0.01], [0, 0.034, len * 0.5], [-0.01, 0.033, len * 0.85], [-0.03, 0.03, len]], 0.0035, metal, 16, 6));
  arm.add(at(rot(box(0.016, 0.006, 0.03, mat('#1b1b1b')), 0, 0.5, 0), -0.034, 0.026, len + 0.005));
  arm.add(at(zcyl(0.012, 0.012, 0.03, metal, 16), 0, 0.032, -0.03));
  mirror.add(arm);
  return mirror;
}
function turntableModel({ plinth = '#7a4b2a', walnut = true } = {}) {
  const g = new THREE.Group();
  const W = 0.45, D = 0.35, H = 0.075;
  g.add(at(rbox(W, H, D, 0.01, walnut ? MAT.wood(plinth) : mat(plinth, { rough: 0.3 })), 0, 0.015 + H / 2, 0));
  g.add(at(box(W - 0.03, 0.004, D - 0.03, mat('#18181a', { rough: 0.35, metal: 0.3 })), 0, 0.015 + H + 0.002, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(cyl(0.022, 0.026, 0.016, mat('#202022', { metal: 0.6, rough: 0.3 }), 16), x * 0.19, 0.008, z * 0.14));
  const top = 0.015 + H + 0.004;
  const platter = new THREE.Group(); platter.name = 'platter'; platter.position.set(-0.04, top, 0);
  platter.add(at(cyl(0.152, 0.152, 0.02, MAT.metal('#b8bcc4', 0.25), 64), 0, 0.01, 0));
  platter.add(at(cyl(0.149, 0.149, 0.003, MAT.rubber('#1b1b1b'), 48), 0, 0.0215, 0));
  const discG = new THREE.Group(); discG.name = 'disc'; discG.position.y = 0.024;
  discG.add(recordDisc(0.15, null));
  const lab = cyl(0.045, 0.045, 0.0024, mat('#ffffff', { rough: 0.6 }), 32); lab.name = 'discLabel'; discG.add(lab);
  platter.add(discG);
  platter.add(at(cyl(0.003, 0.003, 0.03, MAT.chrome(), 8), 0, 0.03, 0));
  platter.add(at(box(0.01, 0.0012, 0.04, mat('#e9ecef')), 0.1, 0.0216, 0));
  g.add(platter);
  g.add(tonearm(0.165, top, -0.11, 0.23));
  g.add(at(cyl(0.02, 0.02, 0.012, MAT.chrome(), 20), -0.18, top + 0.006, 0.14));
  for (const [i, x] of [[0, 0.11], [1, 0.15]]) g.add(at(rbox(0.03, 0.006, 0.018, 0.003, mat(i ? '#e9ecef' : '#c1121f')), x, top + 0.003, 0.14));
  g.add(at(sph(0.004, led('#ff3b30'), 8, 6), -0.19, 0.055, D / 2));
  return g;
}
function suitcaseTurntable() {
  const g = new THREE.Group();
  const W = 0.36, D = 0.28, H = 0.11;
  const shell = mat('#3f88c5', { rough: 0.55, map: MAT.fabric('#fff').map });
  const trim = mat('#f1e3c8', { rough: 0.6 });
  g.add(at(rbox(W, H, D, 0.012, shell), 0, H / 2, 0));
  g.add(at(box(W - 0.02, 0.006, D - 0.02, mat('#141414', { rough: 0.6 })), 0, H + 0.001, 0));
  for (const s of [-1, 1]) g.add(at(box(0.012, H + 0.002, 0.012, trim), s * (W / 2 - 0.004), H / 2, D / 2 - 0.004));
  g.add(at(face(0.1, 0.05, 'suit:grille', (ctx, w, h) => { ctx.fillStyle = '#f1e3c8'; roundRect(ctx, 0, 0, w, h, 14); ctx.fill(); for (let y = 10; y < h - 4; y += 10) for (let x = 10; x < w - 6; x += 10) circle(ctx, x, y, 2.6, '#7a6a55'); }, { th: 128, transparent: true }), -0.09, 0.055, D / 2 + 0.001));
  for (const x of [0.05, 0.1]) g.add(at(zcyl(0.011, 0.012, 0.012, mat('#f1e3c8', { rough: 0.3 }), 16), x, 0.055, D / 2 + 0.004));
  g.add(tube([[-0.05, 0.035, D / 2 + 0.006], [-0.05, 0.035, D / 2 + 0.03], [0.05, 0.035, D / 2 + 0.03], [0.05, 0.035, D / 2 + 0.006]], 0.007, trim, 12, 6));
  // open lid behind
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); lid.rotation.x = -1.85;
  lid.add(at(rbox(W, 0.05, D, 0.012, shell), 0, 0.025, D / 2));
  lid.add(at(box(W - 0.02, 0.002, D - 0.02, mat('#c9b48a', { rough: 0.95 })), 0, -0.0005, D / 2));
  g.add(lid);
  const platter = new THREE.Group(); platter.name = 'platter'; platter.position.set(-0.03, H + 0.004, 0);
  platter.add(at(cyl(0.122, 0.122, 0.01, MAT.metal('#9aa0a8', 0.3), 48), 0, 0.005, 0));
  const discG = new THREE.Group(); discG.name = 'disc'; discG.position.y = 0.011;
  discG.add(recordDisc(0.12, null));
  const lab = cyl(0.04, 0.04, 0.0024, mat('#ffffff', { rough: 0.6 }), 32); lab.name = 'discLabel'; discG.add(lab);
  platter.add(discG, at(cyl(0.003, 0.003, 0.024, MAT.chrome(), 8), 0, 0.012, 0));
  g.add(platter);
  g.add(tonearm(0.13, H + 0.004, -0.08, 0.18));
  return g;
}
const VINYL_ART = {
  lofi(ctx, w, h, c) {
    vgrad(ctx, w, h, [c.c1, c.c2]);
    ctx.fillStyle = '#2b2d42'; ctx.fillRect(w * 0.2, h * 0.12, w * 0.6, h * 0.48);
    vgrad(ctx, w, h, ['#22223b', '#4a4e69'], h * 0.14, h * 0.58); ctx.fillStyle = '#2b2d42'; ctx.fillRect(w * 0.49, h * 0.12, w * 0.02, h * 0.48); ctx.fillRect(w * 0.2, h * 0.35, w * 0.6, 4);
    circle(ctx, w * 0.68, h * 0.22, 14, '#fff3b0');
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(w * 0.22 + i * 26, h * 0.42 - (i % 3) * 14, 22, 80); }
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(0, h * 0.62, w, h * 0.06);
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(w * 0.32, h * 0.56, 22, 18, 0, 0, 7); ctx.fill(); circle(ctx, w * 0.32 + 14, h * 0.48, 12, '#222');
    ctx.beginPath(); ctx.moveTo(w * 0.32 + 6, h * 0.44); ctx.lineTo(w * 0.32 + 9, h * 0.4); ctx.lineTo(w * 0.32 + 13, h * 0.44); ctx.moveTo(w * 0.32 + 16, h * 0.44); ctx.lineTo(w * 0.32 + 21, h * 0.4); ctx.lineTo(w * 0.32 + 23, h * 0.45); ctx.fill();
    ctx.fillStyle = '#f4f1de'; ctx.fillRect(w * 0.6, h * 0.53, 22, 22); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.63, h * 0.5); ctx.quadraticCurveTo(w * 0.6, h * 0.46, w * 0.64, h * 0.42); ctx.stroke();
  },
  window(ctx, w, h, c) {
    vgrad(ctx, w, h, [c.c1, c.c2]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; const r = seeded(4);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h * 0.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14 + r() * 20); ctx.stroke(); circle(ctx, x - 3, y + 30, 2.5, 'rgba(255,255,255,0.5)'); }
    ctx.fillStyle = '#354f52'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(w * 0.75 + Math.cos(i) * 18, h * 0.66 - i * 10, 9, 22, i - 2, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#b07d62'; ctx.fillRect(w * 0.68, h * 0.7, 36, 26);
  },
  jazz(ctx, w, h, c) {
    ctx.fillStyle = c.c1; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c.c2; ctx.fillRect(0, h * 0.55, w, h * 0.45);
    circle(ctx, w * 0.72, h * 0.32, 48, '#ffd166');
    ctx.strokeStyle = '#111'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(w * 0.25, h * 0.15); ctx.quadraticCurveTo(w * 0.3, h * 0.45, w * 0.22, h * 0.48); ctx.quadraticCurveTo(w * 0.14, h * 0.5, w * 0.16, h * 0.42); ctx.stroke(); ctx.lineCap = 'butt';
    circle(ctx, w * 0.17, h * 0.43, 12, '#111');
    txt(ctx, c.short || 'JAZZ', w * 0.05, h * 0.72, h * 0.18, '#fff', { align: 'left', weight: 900, max: w * 0.9 });
  },
  keys(ctx, w, h, c) {
    ctx.fillStyle = c.c1; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h * 0.55); ctx.rotate(-0.35);
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(-w, -40, w * 2, 80); ctx.fillStyle = '#111'; for (let i = -12; i < 12; i++) { ctx.fillRect(i * 22, -40, 2, 80); if ([0, 1, 3, 4, 5].includes(((i % 7) + 7) % 7)) ctx.fillRect(i * 22 + 14, -40, 12, 48); }
    ctx.restore();
    txt(ctx, c.short || 'MIDNIGHT', w * 0.5, h * 0.17, h * 0.13, c.c2, { weight: 900, font: 'Georgia, serif', max: w * 0.9 });
  },
  synth(ctx, w, h, c) {
    vgrad(ctx, w, h, [c.c1, '#ff4fa3', '#ffb347'], 0, h * 0.6);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#ffd166' : '#ff7b54'; ctx.beginPath(); ctx.arc(w / 2, h * 0.6, 70, Math.PI, 0); ctx.fill(); }
    circle(ctx, w / 2, h * 0.6, 0, '#000'); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(w / 2, h * 0.6, 70, Math.PI, 0); ctx.fill();
    ctx.fillStyle = c.c1; for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 70, h * 0.6 - 10 - i * 12, 140, 3 + i * 0.6);
    ctx.fillStyle = '#1a0933'; ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.strokeStyle = '#ff4fa3'; ctx.lineWidth = 2; for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 8, h * 0.6); ctx.lineTo(w / 2 + i * 50, h); ctx.stroke(); }
    for (let y = 0; y < 6; y++) { const yy = h * 0.6 + Math.pow(y / 6, 2) * h * 0.4 + 2; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
    for (const s of [-1, 1]) { ctx.strokeStyle = '#1a0933'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w / 2 + s * 100, h * 0.62); ctx.lineTo(w / 2 + s * 96, h * 0.32); ctx.stroke(); ctx.fillStyle = '#1a0933'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(w / 2 + s * 96 + Math.cos(k * 1.3) * 16, h * 0.32 + Math.sin(k * 1.3) * 6, 18, 5, k * 1.3, 0, 7); ctx.fill(); } }
  },
  heart(ctx, w, h, c) {
    vgrad(ctx, w, h, [c.c1, c.c2]);
    const r = seeded(7); for (let i = 0; i < 50; i++) circle(ctx, r() * w, r() * h, r() * 1.6, '#fff');
    const g = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.8); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#9aa5b1'); g.addColorStop(0.5, '#3d405b'); g.addColorStop(1, '#e0e1dd');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.78); ctx.bezierCurveTo(w * 0.1, h * 0.5, w * 0.2, h * 0.18, w / 2, h * 0.36); ctx.bezierCurveTo(w * 0.8, h * 0.18, w * 0.9, h * 0.5, w / 2, h * 0.78); ctx.fill();
    txt(ctx, c.short || '', w / 2, h * 0.9, h * 0.08, '#fff', { weight: 900, max: w * 0.9 });
  },
  ripples(ctx, w, h, c) {
    vgrad(ctx, w, h, [c.c1, c.c2]);
    for (const [x, y, n] of [[0.3, 0.35, 5], [0.7, 0.6, 6], [0.45, 0.8, 4]]) for (let i = 1; i <= n; i++) { ctx.strokeStyle = `rgba(255,255,255,${0.5 - i * 0.07})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(w * x, h * y, i * 14, i * 6, 0, 0, 7); ctx.stroke(); }
  },
  chip(ctx, w, h, c) {
    ctx.fillStyle = c.c1; ctx.fillRect(0, 0, w, h);
    const sprite = ['..RRRRR...', '.RRRRRRRR.', '.BBBSSBS..', 'BSBSSSBSSS', 'BSBBSSSBSS', 'BBSSSSBBBB', '...SSSSSS.', '..RRBRRR..', '.RRRBRRBRR', 'RRRRBBBBRR', 'SSRBYBBYBR', 'SSSBBBBBBS', 'SSBBBBBBBS', '..BBB.BBB.', '.BBB...BBB', 'BBBB...BBBB'];
    const cols = { R: '#e63946', B: '#1d3557', S: '#f4a261', Y: '#ffd60a' };
    const px = 9, ox = w / 2 - 5 * px, oy = h * 0.22;
    sprite.forEach((row, y) => [...row].forEach((ch, x) => { if (cols[ch]) { ctx.fillStyle = cols[ch]; ctx.fillRect(ox + x * px, oy + y * px, px, px); } }));
    ctx.fillStyle = c.c2; for (let x = 0; x < w; x += 16) ctx.fillRect(x, h * 0.86, 14, 14);
    txt(ctx, '8-BIT', w / 2, h * 0.12, h * 0.1, '#fff', { font: 'monospace', weight: 900 });
  },
  egg(ctx, w, h, c) {
    ctx.fillStyle = c.c1; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.strokeStyle = c.c2; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * 80, h / 2 + Math.sin(a) * 80); ctx.lineTo(w / 2 + Math.cos(a) * 110, h / 2 + Math.sin(a) * 110); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2; const r = 62 + Math.sin(a * 5) * 7; ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } ctx.fill();
    circle(ctx, w / 2, h / 2, 30, '#ffb703'); circle(ctx, w / 2 - 9, h / 2 - 9, 7, '#ffe8a3');
    circle(ctx, w / 2 - 9, h / 2 + 2, 3, '#3d2c1e'); circle(ctx, w / 2 + 9, h / 2 + 2, 3, '#3d2c1e'); ctx.strokeStyle = '#3d2c1e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(w / 2, h / 2 + 8, 7, 0.2, Math.PI - 0.2); ctx.stroke();
  },
  diary(ctx, w, h, c) {
    ctx.fillStyle = c.c1; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; for (let y = 20; y < h; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = '#ff006e'; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(30, h); ctx.stroke();
    for (const [x, y, s] of [[0.6, 0.4, 40], [0.3, 0.7, 26], [0.8, 0.78, 18]]) { ctx.fillStyle = c.c2; ctx.beginPath(); ctx.moveTo(w * x, h * y + s * 0.7); ctx.bezierCurveTo(w * x - s * 1.2, h * y - s * 0.2, w * x - s * 0.5, h * y - s, w * x, h * y - s * 0.35); ctx.bezierCurveTo(w * x + s * 0.5, h * y - s, w * x + s * 1.2, h * y - s * 0.2, w * x, h * y + s * 0.7); ctx.fill(); }
    txt(ctx, 'dear diary…', w * 0.55, h * 0.15, 20, '#7b2cbf', { font: 'Georgia, serif', weight: 400 });
  },
  palm(ctx, w, h, c) {
    vgrad(ctx, w, h, [c.c1, c.c2], 0, h * 0.62); vgrad(ctx, w, h, ['#118ab2', '#073b4c'], h * 0.62, h);
    circle(ctx, w * 0.62, h * 0.5, 40, '#ffd166');
    ctx.fillStyle = '#073b4c'; ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; for (let y = 0; y < 4; y++) { ctx.beginPath(); for (let x = 0; x <= w; x += 6) ctx.lineTo(x, h * (0.68 + y * 0.08) + Math.sin(x * 0.1 + y) * 3); ctx.stroke(); }
    ctx.strokeStyle = '#3d2c1e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(w * 0.25, h * 0.95); ctx.quadraticCurveTo(w * 0.2, h * 0.5, w * 0.32, h * 0.24); ctx.stroke();
    ctx.fillStyle = '#2d6a4f'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(w * 0.32 + Math.cos(k) * 26, h * 0.24 + Math.sin(k * 2) * 8, 34, 7, k * 1.05, 0, 7); ctx.fill(); }
  },
};
function vinylCover(rec) {
  return (ctx, w, h) => {
    VINYL_ART[rec.art](ctx, w, h, rec);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, h - 34, w, 34);
    txt(ctx, rec.name, 10, h - 23, 13, '#fff', { align: 'left', max: w - 20 });
    txt(ctx, rec.artist.toUpperCase(), 10, h - 9, 9, 'rgba(255,255,255,0.75)', { align: 'left', weight: 600, max: w - 20 });
    if (rec.gold) { ctx.fillStyle = '#d4a017'; ctx.beginPath(); ctx.moveTo(w - 70, 0); ctx.lineTo(w, 0); ctx.lineTo(w, 70); ctx.fill(); txt(ctx, 'GOLD', w - 22, 22, 13, '#1b1b1b', { rot: Math.PI / 4 }); }
  };
}
function vinylModel(rec) {
  const g = new THREE.Group();
  const S = 0.315;
  const sleeve = rbox(S, S, 0.004, 0.0015, mat('#e9e4d8', { rough: 0.85 }));
  g.add(at(sleeve, -0.03, S / 2, 0));
  g.add(at(face(S - 0.002, S - 0.002, `vinyl:${rec.id}`, vinylCover(rec), { rough: 0.6 }), -0.03, S / 2, 0.0022));
  const d = recordDisc(0.149, rec.gold ? null : rec.color); d.rotation.x = Math.PI / 2;
  if (rec.gold) d.material = [MAT.gold(), MAT.gold(), MAT.gold()];
  g.add(at(d, 0.045, S / 2, -0.004));
  return g;
}

// ------------------------------------------------------------------ headphones & portable audio
function headphonesModel({ band = '#1d1d1f', cup = '#2b2b2e', pad = '#3a3a3d', accent = '#c9a86a', scale = 1 } = {}) {
  const g = new THREE.Group();
  const cupM = mat(cup, { rough: 0.35, clearcoat: 0.4 });
  const padM = mat(pad, { rough: 0.8, sheen: 0.4 });
  const cy = 0.048;
  for (const s of [-1, 1]) {
    g.add(at(xcyl(0.046, 0.046, 0.03, cupM, 36), s * 0.085, cy, 0));
    g.add(at(xcyl(0.042, 0.042, 0.016, padM, 32), s * 0.064, cy, 0));
    g.add(at(xcyl(0.03, 0.03, 0.004, mat(accent, { metal: 0.8, rough: 0.25 }), 32), s * 0.101, cy, 0));
    g.add(at(rot(torus(0.05, 0.004, MAT.metal('#9aa0a8', 0.3), 6, 24, Math.PI), 0, Math.PI / 2, 0), s * 0.085, cy, 0));
  }
  g.add(at(torus(0.088, 0.008, mat(band, { rough: 0.4 }), 10, 40, Math.PI), 0, cy + 0.048, 0));
  g.add(at(rot(torus(0.081, 0.011, padM, 10, 32, Math.PI * 0.5), 0, 0, Math.PI * 0.25), 0, cy + 0.048, 0));
  g.scale.setScalar(scale);
  return group(g);
}
function walkman() {
  const g = new THREE.Group();
  g.add(at(rbox(0.11, 0.08, 0.03, 0.006, mat('#2f6690', { rough: 0.35, metal: 0.3 })), 0, 0.04, 0));
  g.add(at(face(0.09, 0.055, 'walkman:win', (ctx, w, h) => { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(180,200,220,0.35)'; roundRect(ctx, 8, 8, w - 16, h - 16, 8); ctx.fill(); ctx.fillStyle = '#f4f1de'; ctx.fillRect(22, 22, w - 44, h - 50); ctx.fillStyle = '#ff7b00'; ctx.fillRect(22, 30, w - 44, 10); for (const x of [0.35, 0.65]) { circle(ctx, w * x, h * 0.62, 16, '#333'); circle(ctx, w * x, h * 0.62, 7, '#eee'); } txt(ctx, 'AUTO-REVERSE', w / 2, h - 12, 10, '#9fb7cc'); }, { th: 160 }), 0, 0.04, 0.0155));
  ['#ff7b00', '#ddd', '#ddd', '#ddd'].forEach((c, i) => g.add(at(rbox(0.018, 0.008, 0.014, 0.003, mat(c, { rough: 0.4 })), -0.03 + i * 0.02, 0.083, 0)));
  const hp = new THREE.Group();
  hp.add(at(torus(0.05, 0.0025, MAT.metal('#c0c4ca', 0.3), 6, 28, Math.PI), 0, 0.03, 0));
  for (const s of [-1, 1]) { const f = sph(0.022, mat('#ff7b00', { rough: 1 }), 14, 10); f.scale.x = 0.6; hp.add(at(f, s * 0.05, 0.022, 0)); }
  hp.position.set(0.11, 0, 0.0); hp.rotation.y = -0.6;
  g.add(hp);
  g.add(tube([[0.02, 0.083, 0], [0.04, 0.1, 0.01], [0.07, 0.07, 0.02], [0.1, 0.03, 0.02]], 0.0015, mat('#222'), 16, 4));
  return g;
}

// ------------------------------------------------------------------ computers
function laptopModel({ body = '#c9ccd1', key = 'air' } = {}) {
  const g = new THREE.Group();
  const W = 0.31, D = 0.215;
  const alu = mat(body, { rough: 0.3, metal: 0.7 });
  g.add(at(rbox(W, 0.014, D, 0.005, alu), 0, 0.007, 0));
  const kb = face(W * 0.86, D * 0.44, `laptop:kb:${key}`, (ctx, w, h) => { ctx.fillStyle = tint(body, 0.85); ctx.fillRect(0, 0, w, h); const cols = 14, rows = 5; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const kw = (w - 8) / cols; ctx.fillStyle = '#1e1f22'; roundRect(ctx, 4 + c * kw + 1, 4 + r * (h - 8) / rows + 1, (r === 4 && c > 3 && c < 9) ? kw * 5 - 2 : kw - 2, (h - 8) / rows - 2, 3); ctx.fill(); if (r === 4 && c > 3 && c < 9) c += 4; } }, { th: 128 });
  kb.rotation.x = -Math.PI / 2; g.add(at(kb, 0, 0.0142, -0.025));
  const tp = plane(0.1, 0.062, mat(tint(body, 0.92), { rough: 0.25, metal: 0.5 })); tp.rotation.x = -Math.PI / 2; g.add(at(tp, 0, 0.0142, 0.066));
  const lid = new THREE.Group(); lid.position.set(0, 0.014, -D / 2 + 0.004); lid.rotation.x = -0.3;
  lid.add(at(rbox(W, D, 0.006, 0.005, alu), 0, D / 2, -0.003));
  lid.add(at(plane(W - 0.008, D - 0.01, mat('#0b0c0f', { rough: 0.2 })), 0, D / 2, 0.0002));
  const scr = face(W - 0.024, D - 0.03, `laptop:scr:${key}`, (ctx, w, h) => { const gg = ctx.createLinearGradient(0, 0, w, h); gg.addColorStop(0, '#4361ee'); gg.addColorStop(1, '#f72585'); ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(w * 0.3, h * 1.1, h * 0.8, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, h - 14, w, 14); }, { emissive: true, ei: 0.5, th: 164 });
  scr.name = 'screen'; lid.add(at(scr, 0, D / 2 + 0.004, 0.0006));
  const logo = face(0.03, 0.03, 'laptop:logo', (ctx, w, h) => { ctx.clearRect(0, 0, w, h); txt(ctx, '⚡', w / 2, h / 2 + 2, h * 0.8, '#eef0f2'); }, { transparent: true, th: 64 });
  logo.rotation.y = Math.PI; lid.add(at(logo, 0, D / 2, -0.0062));
  g.add(lid);
  return g;
}
function tabletModel() {
  const g = new THREE.Group();
  const t = new THREE.Group(); t.position.set(0, 0.012, 0.03); t.rotation.x = -0.32;
  t.add(at(rbox(0.25, 0.175, 0.007, 0.012, mat('#3a3d44', { rough: 0.3, metal: 0.6 })), 0, 0.0875, 0));
  t.add(at(plane(0.24, 0.165, mat('#08090b', { rough: 0.15 })), 0, 0.0875, 0.0036));
  const scr = face(0.228, 0.152, 'tablet:scr', (ctx, w, h) => { vgrad(ctx, w, h, ['#ffafcc', '#a2d2ff']); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = ['#fff', '#ffd166', '#06d6a0', '#118ab2'][(i + j) % 4]; roundRect(ctx, 30 + i * 52, 28 + j * 46, 34, 34, 9); ctx.fill(); } }, { emissive: true, ei: 0.5, th: 172 });
  scr.name = 'screen'; t.add(at(scr, 0, 0.0875, 0.0038));
  t.add(at(rbox(0.25, 0.175, 0.004, 0.012, MAT.leather('#d4a373')), 0, 0.0875, -0.0055));
  g.add(t);
  const flap = box(0.25, 0.004, 0.13, MAT.leather('#d4a373')); flap.rotation.x = 0.62; g.add(at(flap, 0, 0.055, -0.05));
  g.add(at(rbox(0.26, 0.006, 0.06, 0.003, MAT.leather('#c08552')), 0, 0.003, 0.03));
  g.add(at(rot(capsule(0.0045, 0.15, mat('#f8f9fa', { rough: 0.3 })), 0, 0, Math.PI / 2), 0, 0.0045, 0.085));
  return g;
}
function curvedMonitorArt(ctx, w, h) {
  ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
  vgrad(ctx, w, h, ['#10002b', '#5a189a', '#ff4fa3'], 0, h * 0.6);
  circle(ctx, w / 2, h * 0.55, 60, '#ffd166');
  ctx.fillStyle = '#10002b'; ctx.fillRect(0, h * 0.6, w, h * 0.4);
  ctx.strokeStyle = '#5ef2ff'; ctx.lineWidth = 2;
  for (let i = -10; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 10, h * 0.6); ctx.lineTo(w / 2 + i * 60, h); ctx.stroke(); }
  ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(w / 2 - 40, h * 0.92); ctx.lineTo(w / 2 + 40, h * 0.92); ctx.lineTo(w / 2 + 28, h * 0.8); ctx.lineTo(w / 2 - 28, h * 0.8); ctx.fill();
  txt(ctx, 'LAP 2/3   1:02.44', 70, 18, 14, '#fff', { font: 'monospace' }); txt(ctx, '214 KM/H', w - 60, h - 20, 16, '#ffd166', { font: 'monospace' });
  ctx.restore();
}
function gamingMonitor() {
  const g = new THREE.Group();
  const R = 1.0, L = 0.68, H = 0.34, y = 0.33;
  const shellGeo = sgeo('mon:shell', () => new THREE.CylinderGeometry(R + 0.012, R + 0.012, H + 0.02, 40, 1, true, Math.PI - L / 2 - 0.01, L + 0.02));
  const scrGeo = sgeo('mon:scr', () => new THREE.CylinderGeometry(R, R, H, 40, 1, true, Math.PI - L / 2, L));
  const shell = mesh(shellGeo, mat('#18191c', { rough: 0.4, metal: 0.3, side: THREE.DoubleSide }));
  g.add(at(shell, 0, y, R - 0.002));
  const tex = labelTexture('mon:art', 512, 256, curvedMonitorArt);
  const sm = mat('#ffffff', { map: tex, emissive: '#ffffff', ei: 0.7, rough: 0.3, side: THREE.BackSide }); sm.emissiveMap = tex;
  g.add(at(mesh(scrGeo, sm), 0, y, R));
  g.add(at(rbox(0.06, 0.24, 0.03, 0.01, mat('#18191c', { rough: 0.4 })), 0, 0.17, -0.06));
  const strip = box(0.25, 0.006, 0.006, led('#7b5cff', 2)); g.add(at(strip, 0, y - 0.05, -0.048));
  for (const s of [-1, 1]) { const leg = rbox(0.22, 0.012, 0.035, 0.006, mat('#e63946', { rough: 0.3, metal: 0.5 })); leg.rotation.y = s * 0.55; g.add(at(leg, s * 0.09, 0.006, -0.03)); }
  return g;
}
function mechKeyboard() {
  const g = new THREE.Group();
  g.add(at(rbox(0.36, 0.03, 0.13, 0.006, mat('#2b2d42', { rough: 0.35, metal: 0.4 })), 0, 0.015, 0));
  const glow = box(0.35, 0.004, 0.12, led('#ff4fa3', 1.6)); g.add(at(glow, 0, 0.031, 0));
  for (let r = 0; r < 5; r++) {
    const row = face(0.33, 0.021, `kb:row:${r}`, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const n = r === 4 ? 8 : 14 - (r === 0 ? 0 : 1);
      const kw = w / 15;
      let x = 1;
      for (let i = 0; i < n; i++) {
        let kws = kw; if (r === 4 && i === 3) kws = kw * 6; if (r === 3 && (i === 0 || i === n - 1)) kws = kw * 2; if (r === 2 && i === 0) kws = kw * 1.6; if (r === 1 && i === 0) kws = kw * 1.4;
        const accent = (r === 0 && i === 0) || (r === 2 && i === n - 1);
        ctx.fillStyle = accent ? '#ff70a6' : r === 4 && i === 3 ? '#fdf0d5' : '#e9ecef';
        roundRect(ctx, x + 1, 1, kws - 3, h - 3, 5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 1, h - 6, kws - 3, 3);
        x += kws;
      }
    }, { th: 36, transparent: true });
    const keys = box(0.33, 0.012, 0.021, mat('#f1f3f5', { rough: 0.5 }));
    const rowG = group(keys, at(rot(row, -Math.PI / 2, 0, 0), 0, 0.0062, 0));
    rowG.rotation.x = (r - 2) * 0.06;
    g.add(at(rowG, 0, 0.039 + (r === 0 ? 0.004 : 0), -0.046 + r * 0.023));
  }
  g.add(tube([[0, 0.02, -0.065], [0, 0.015, -0.1], [0.04, 0.008, -0.13], [0.1, 0.006, -0.14]], 0.003, mat('#ff70a6', { rough: 0.4 }), 16, 6));
  return g;
}

// ------------------------------------------------------------------ cameras & optics
function instantCamera({ color = '#a8e6cf', key = 'mint' } = {}) {
  const g = new THREE.Group();
  const shell = mat(color, { rough: 0.4, clearcoat: 0.3 });
  g.add(at(rbox(0.118, 0.125, 0.072, 0.022, shell), 0, 0.0625, 0));
  g.add(at(zcyl(0.034, 0.036, 0.028, mat('#f8f9fa', { rough: 0.3 }), 32), 0, 0.055, 0.045));
  g.add(at(zcyl(0.026, 0.026, 0.01, mat('#1b1b1b', { rough: 0.3 }), 32), 0, 0.055, 0.058));
  const lens = sph(0.018, glassLens(), 20, 12); lens.scale.z = 0.5; g.add(at(lens, 0, 0.055, 0.062));
  g.add(at(rbox(0.034, 0.024, 0.006, 0.003, mat('#fafafa', { emissive: '#ffffff', ei: 0.15, rough: 0.1 })), 0.033, 0.104, 0.036));
  g.add(at(rbox(0.02, 0.016, 0.006, 0.003, glassLens()), -0.036, 0.104, 0.036));
  g.add(at(cyl(0.008, 0.008, 0.008, mat('#ff6b6b', { rough: 0.3 }), 16), 0.04, 0.127, 0.0));
  const photo = new THREE.Group();
  photo.add(at(box(0.054, 0.04, 0.0015, mat('#fbfbf8', { rough: 0.6 })), 0, 0, 0));
  photo.add(at(face(0.046, 0.03, 'photo:mini', (ctx, w, h) => { vgrad(ctx, w, h, ['#ffb4a2', '#6d6875']); circle(ctx, w * 0.6, h * 0.45, 16, '#ffe8a3'); }, { th: 168 }), 0, 0.003, 0.0009));
  g.add(at(photo, -0.01, 0.135, -0.006));
  g.add(at(face(0.06, 0.012, `instax:${key}`, (ctx, w, h) => { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); txt(ctx, 'snapsy', w / 2, h / 2, h * 0.75, '#fff', { font: 'Georgia, serif', weight: 700 }); }, { th: 52 }), 0, 0.015, 0.0362));
  return g;
}
function dslr() {
  const g = new THREE.Group();
  const body = mat('#1d1e20', { rough: 0.55 });
  g.add(at(rbox(0.14, 0.09, 0.06, 0.012, body), 0, 0.045, 0));
  g.add(at(rbox(0.036, 0.088, 0.078, 0.016, mat('#141416', { rough: 0.9 })), -0.055, 0.045, 0.006));
  g.add(at(rbox(0.058, 0.03, 0.052, 0.008, body), 0.005, 0.098, -0.002));
  g.add(at(face(0.03, 0.008, 'dslr:brand', (ctx, w, h) => { ctx.fillStyle = '#1d1e20'; ctx.fillRect(0, 0, w, h); txt(ctx, 'VOLTA', w / 2, h / 2, h * 0.8, '#e8e8e8'); }, { th: 36 }), 0.005, 0.104, 0.0242));
  const lens = new THREE.Group(); lens.position.set(0.008, 0.045, 0.03);
  lens.add(at(zcyl(0.034, 0.034, 0.03, mat('#222', { rough: 0.4 }), 32), 0, 0, 0.015));
  lens.add(at(zcyl(0.036, 0.036, 0.022, MAT.rubber('#151515'), 40), 0, 0, 0.042));
  lens.add(at(zcyl(0.035, 0.033, 0.03, mat('#202020', { rough: 0.35 }), 32), 0, 0, 0.068));
  lens.add(at(zcyl(0.0352, 0.0352, 0.003, mat('#c1121f', { rough: 0.3 }), 32), 0, 0, 0.058));
  const glass = sph(0.028, glassLens(), 24, 12); glass.scale.z = 0.35; lens.add(at(glass, 0, 0, 0.082));
  g.add(lens);
  g.add(at(cyl(0.012, 0.012, 0.008, mat('#2b2b2b', { metal: 0.5, rough: 0.3 }), 20), 0.05, 0.094, -0.005));
  g.add(at(cyl(0.006, 0.006, 0.006, MAT.chrome(), 12), -0.055, 0.092, 0.012));
  for (const s of [-1, 1]) g.add(at(rot(torus(0.006, 0.0015, MAT.chrome(), 6, 12), 0, Math.PI / 2, 0), s * 0.071, 0.08, 0));
  return g;
}
function filmCamera() {
  const g = new THREE.Group();
  g.add(at(rbox(0.135, 0.05, 0.036, 0.006, mat('#1b1b1b', { rough: 0.9, map: MAT.fabric('#fff').map })), 0, 0.025, 0));
  g.add(at(rbox(0.137, 0.03, 0.038, 0.006, MAT.metal('#d9dbde', 0.25)), 0, 0.062, 0));
  g.add(at(rbox(0.137, 0.004, 0.038, 0.002, MAT.metal('#d9dbde', 0.25)), 0, 0.002, 0));
  for (const x of [-0.045, -0.015]) g.add(at(rbox(0.016, 0.012, 0.004, 0.002, glassLens()), x, 0.064, 0.019));
  g.add(at(rbox(0.018, 0.012, 0.004, 0.002, mat('#f4f1de', { rough: 0.2, metal: 0.3 })), 0.04, 0.064, 0.019));
  const lens = new THREE.Group(); lens.position.set(0.01, 0.035, 0.018);
  lens.add(at(zcyl(0.022, 0.022, 0.02, MAT.metal('#c8ccd2', 0.25), 32), 0, 0, 0.01));
  lens.add(at(zcyl(0.024, 0.024, 0.008, MAT.metal('#2b2b2b', 0.4), 32), 0, 0, 0.022));
  const glass = sph(0.016, glassLens(), 20, 10); glass.scale.z = 0.4; lens.add(at(glass, 0, 0, 0.027));
  g.add(lens);
  g.add(at(cyl(0.01, 0.01, 0.01, MAT.chrome(), 16), -0.05, 0.082, 0), at(cyl(0.007, 0.007, 0.012, MAT.chrome(), 12), 0.045, 0.083, 0.005));
  g.add(at(rot(box(0.03, 0.003, 0.006, MAT.chrome()), 0, 0.5, 0), 0.05, 0.08, -0.01));
  g.add(at(face(0.03, 0.008, 'film:logo', (ctx, w, h) => { ctx.fillStyle = '#d9dbde'; ctx.fillRect(0, 0, w, h); txt(ctx, 'NOIR 35', w / 2, h / 2, h * 0.75, '#1b1b1b', { font: 'Georgia, serif' }); }, { th: 36 }), -0.025, 0.074, 0.0191));
  return g;
}
function telescopeModel() {
  const g = new THREE.Group();
  const metal = MAT.metal('#2b2d30', 0.35);
  const apex = [0, 0.95, 0];
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 6; g.add(tube([apex, [Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2], [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38]], 0.013, metal, 8, 6)); g.add(at(sph(0.018, MAT.rubber('#111'), 10, 8), Math.cos(a) * 0.38, 0.01, Math.sin(a) * 0.38)); }
  const tray = cyl(0.13, 0.13, 0.01, metal, 3); tray.rotation.y = Math.PI / 6; g.add(at(tray, 0, 0.5, 0));
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(at(cyl(0.012, 0.012, 0.03, MAT.chrome(), 12), Math.cos(a) * 0.06, 0.52, Math.sin(a) * 0.06)); }
  g.add(at(rbox(0.08, 0.1, 0.08, 0.01, mat('#3a3d42', { metal: 0.5, rough: 0.35 })), 0, 1.0, 0));
  const ota = new THREE.Group(); ota.position.set(0, 1.1, 0); ota.rotation.x = -0.32;
  const white = mat('#f2f3f5', { rough: 0.25, clearcoat: 0.6 });
  ota.add(zcyl(0.048, 0.048, 0.72, white, 36));
  ota.add(at(zcyl(0.056, 0.054, 0.16, white, 36), 0, 0, 0.42));
  ota.add(at(zcyl(0.05, 0.05, 0.006, mat('#1b2838', { rough: 0.05, metal: 0.5, clearcoat: 1 }), 32), 0, 0, 0.39));
  ota.add(at(zcyl(0.058, 0.058, 0.02, mat('#1b1b1b', { rough: 0.5 }), 36), 0, 0, 0.5));
  for (const z of [-0.12, 0.14]) ota.add(at(zcyl(0.056, 0.056, 0.03, metal, 36), 0, 0, z));
  ota.add(at(zcyl(0.024, 0.024, 0.09, mat('#1b1b1b', { rough: 0.4 }), 20), 0, 0, -0.4));
  ota.add(at(rbox(0.04, 0.04, 0.04, 0.006, mat('#1b1b1b', { rough: 0.4 })), 0, 0, -0.46));
  ota.add(at(cyl(0.014, 0.014, 0.07, mat('#111', { rough: 0.5 }), 16), 0, 0.045, -0.46));
  ota.add(at(zcyl(0.014, 0.014, 0.16, white, 16), 0, 0.07, 0.05), at(box(0.01, 0.02, 0.01, metal), 0, 0.055, 0.05));
  g.add(ota);
  return g;
}
function binocularsModel() {
  const g = new THREE.Group();
  const armor = mat('#2f3e2f', { rough: 0.85 });
  for (const s of [-1, 1]) {
    g.add(at(zcyl(0.026, 0.03, 0.11, armor, 28), s * 0.034, 0.031, 0));
    g.add(at(zcyl(0.031, 0.031, 0.014, mat('#1b1b1b', { rough: 0.5 }), 28), s * 0.034, 0.031, 0.06));
    const lens = sph(0.024, glassLens(), 18, 10); lens.scale.z = 0.25; g.add(at(lens, s * 0.034, 0.031, 0.066));
    g.add(at(zcyl(0.017, 0.019, 0.03, MAT.rubber('#151515'), 20), s * 0.03, 0.031, -0.068));
  }
  g.add(at(rbox(0.03, 0.02, 0.07, 0.006, mat('#1b1b1b', { rough: 0.4 })), 0, 0.034, -0.01));
  g.add(at(xcyl(0.011, 0.011, 0.024, mat('#3a3a3a', { metal: 0.6, rough: 0.3 }), 20), 0, 0.05, -0.03));
  g.add(tube([[-0.06, 0.04, -0.04], [-0.08, 0.02, -0.1], [0, 0.005, -0.14], [0.08, 0.02, -0.1], [0.06, 0.04, -0.04]], 0.0025, mat('#c1121f', { rough: 0.7 }), 24, 4));
  return g;
}

// ------------------------------------------------------------------ VR, streaming, lighting
function vrHeadset() {
  const g = new THREE.Group();
  const white = mat('#f4f5f7', { rough: 0.3, clearcoat: 0.5 });
  g.add(at(rbox(0.18, 0.1, 0.075, 0.03, white), 0, 0.05, 0.02));
  g.add(at(rbox(0.165, 0.085, 0.01, 0.025, mat('#121318', { rough: 0.1, clearcoat: 1 })), 0, 0.05, 0.058));
  for (const [x, y] of [[-0.06, 0.07], [0.06, 0.07], [-0.07, 0.03], [0.07, 0.03]]) g.add(at(zcyl(0.005, 0.005, 0.003, glassLens(), 12), x, y, 0.064));
  g.add(at(rbox(0.16, 0.085, 0.03, 0.02, MAT.fabric('#3a3a3d')), 0, 0.05, -0.03));
  const strap = mat('#2b2d33', { rough: 0.6 });
  const ring = rot(torus(0.085, 0.01, strap, 8, 40), Math.PI / 2, 0, 0); ring.scale.set(1, 1.25, 1); g.add(at(ring, 0, 0.05, -0.12));
  g.add(at(rot(torus(0.1, 0.009, strap, 8, 32, Math.PI), 0, Math.PI / 2, 0), 0, 0.05, -0.1));
  g.add(at(rbox(0.07, 0.06, 0.02, 0.015, white), 0, 0.05, -0.225));
  for (const s of [-1, 1]) g.add(at(rbox(0.01, 0.02, 0.04, 0.004, mat('#555')), s * 0.092, 0.05, -0.02));
  return g;
}
function webcamModel() {
  const g = new THREE.Group();
  const black = mat('#18191b', { rough: 0.4 });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(tube([[0, 0.06, 0], [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05]], 0.003, black, 4, 6)); }
  g.add(at(cyl(0.006, 0.006, 0.03, black, 10), 0, 0.075, 0));
  g.add(at(rbox(0.095, 0.03, 0.032, 0.014, black), 0, 0.105, 0));
  g.add(at(zcyl(0.013, 0.013, 0.006, MAT.metal('#555', 0.3), 24), 0, 0.105, 0.016));
  const glass = sph(0.009, glassLens(), 16, 10); glass.scale.z = 0.4; g.add(at(glass, 0, 0.105, 0.02));
  g.add(at(sph(0.002, led('#5eff7a', 1.5), 6, 4), 0.025, 0.11, 0.0165));
  g.add(at(face(0.03, 0.006, 'webcam:brand', (ctx, w, h) => { ctx.fillStyle = '#18191b'; ctx.fillRect(0, 0, w, h); txt(ctx, 'STREAMR HD', w / 2, h / 2, h * 0.7, '#aaa'); }, { th: 28 }), -0.03, 0.097, 0.0162));
  return g;
}
function micModel({ body = '#3b3d42' } = {}) {
  const g = new THREE.Group();
  const m = mat(body, { rough: 0.3, metal: 0.7 });
  g.add(at(cyl(0.06, 0.066, 0.014, m, 32), 0, 0.007, 0));
  g.add(at(cyl(0.008, 0.01, 0.05, m, 12), 0, 0.035, 0));
  g.add(at(rot(torus(0.042, 0.006, m, 8, 28, Math.PI), 0, 0, Math.PI), 0, 0.105, 0));
  g.add(at(capsule(0.031, 0.08, m), 0, 0.125, 0));
  const grille = labelTexture('mic:grille', 128, 128, (ctx, w, h) => { ctx.fillStyle = '#c9ccd1'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#6c7178'; ctx.lineWidth = 2; for (let i = -w; i < w * 2; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke(); } });
  const gr = sph(0.0322, mat('#ffffff', { map: grille, rough: 0.35, metal: 0.6 }), 24, 14); gr.scale.y = 1.35; g.add(at(gr, 0, 0.17, 0));
  for (const s of [-1, 1]) g.add(at(xcyl(0.01, 0.01, 0.012, MAT.chrome(), 16), s * 0.047, 0.105, 0));
  g.add(at(zcyl(0.007, 0.007, 0.004, led('#ff3b30', 1.2), 14), 0, 0.12, 0.031));
  return g;
}
function ringLight() {
  const g = new THREE.Group();
  const black = mat('#1b1b1d', { rough: 0.4, metal: 0.4 });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(tube([[0, 0.55, 0], [Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32]], 0.009, black, 4, 6)); }
  g.add(at(cyl(0.012, 0.012, 1.0, black, 12), 0, 0.95, 0));
  g.add(at(rbox(0.04, 0.06, 0.03, 0.006, black), 0, 1.15, 0.015));
  const ring = torus(0.18, 0.024, mat('#ffffff', { rough: 0.3, emissive: '#fff6ee', ei: 0 }), 12, 64); ring.userData.bulb = true;
  g.add(at(ring, 0, 1.6, 0.01));
  g.add(at(torus(0.18, 0.026, black, 8, 48), 0, 1.6, -0.006));
  for (const a of [Math.PI / 2, -Math.PI / 2]) g.add(at(box(0.008, 0.18, 0.008, black), 0, 1.6 + Math.sin(a) * 0.09, 0));
  g.add(at(rbox(0.075, 0.15, 0.008, 0.008, mat('#2b2d42', { rough: 0.2, clearcoat: 1 })), 0, 1.6, 0.012));
  g.add(at(box(0.09, 0.012, 0.016, black), 0, 1.53, 0.01));
  return g;
}

// ------------------------------------------------------------------ arcade, RC, small gadgets
function arcadeCabinet() {
  const g = new THREE.Group();
  const prof = [[-0.36, 0], [0.32, 0], [0.32, 0.86], [0.44, 0.93], [0.44, 0.99], [0.24, 1.04], [0.17, 1.45], [0.26, 1.5], [0.26, 1.74], [-0.36, 1.74]];
  const sideM = mat('#131317', { rough: 0.45 });
  const Wi = 0.62;
  for (const s of [-1, 1]) {
    const p = extrude(prof, 0.024, sideM, 0.004, undefined, 'arcade:side'); p.rotation.y = -Math.PI / 2; g.add(at(p, s * (Wi / 2 + 0.012), 0, 0));
    const art = face(0.5, 0.75, 'arcade:sideart', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = seeded(3); for (let i = 0; i < 60; i++) circle(ctx, r() * w, r() * h, r() * 2, '#fff');
      ctx.strokeStyle = '#ff4fa3'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, h * 0.85); ctx.lineTo(w, h * 0.25); ctx.stroke();
      ctx.strokeStyle = '#5ef2ff'; ctx.beginPath(); ctx.moveTo(0, h * 0.95); ctx.lineTo(w, h * 0.35); ctx.stroke();
      txt(ctx, 'STAR', w * 0.5, h * 0.42, 54, '#ffd23f', { stroke: '#7b2cbf', lw: 8, rot: -0.5, weight: 900 }); txt(ctx, 'BLASTER', w * 0.55, h * 0.56, 44, '#ffd23f', { stroke: '#7b2cbf', lw: 8, rot: -0.5, weight: 900 });
    }, { transparent: true, th: 384 });
    art.rotation.y = s * Math.PI / 2; g.add(at(art, s * (Wi / 2 + 0.029), 0.75, -0.02));
  }
  const body = mat('#1d1d24', { rough: 0.5 });
  g.add(at(box(Wi, 1.72, 0.56, body), 0, 0.86, -0.08));
  g.add(at(box(Wi, 0.86, 0.12, body), 0, 0.43, 0.26));
  g.add(at(face(0.3, 0.4, 'arcade:door', (ctx, w, h) => { ctx.fillStyle = '#2b2b33'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#555'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12); for (const x of [0.33, 0.67]) { ctx.fillStyle = '#ff2d2d'; roundRect(ctx, w * x - 18, h * 0.25, 36, 60, 6); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(w * x - 3, h * 0.29, 6, 30); txt(ctx, '25¢', w * x, h * 0.52, 18, '#fff'); } }, { th: 340, emissive: true, ei: 0.25 }), 0, 0.42, 0.321));
  const cp = new THREE.Group(); cp.position.set(0, 0.985, 0.34); cp.rotation.x = 0.245;
  cp.add(box(Wi, 0.05, 0.22, mat('#2d2d38', { rough: 0.4 })));
  cp.add(at(rot(face(Wi, 0.22, 'arcade:cp', (ctx, w, h) => { vgrad(ctx, w, h, ['#3c096c', '#10002b']); ctx.strokeStyle = '#ff4fa3'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8); }, { th: 90 }), -Math.PI / 2, 0, 0), 0, 0.0255, 0));
  cp.add(at(cyl(0.006, 0.006, 0.06, MAT.chrome(), 8), -0.15, 0.055, 0), at(sph(0.02, mat('#e63946', { rough: 0.2, clearcoat: 1 }), 16, 12), -0.15, 0.09, 0));
  ['#ffd23f', '#5ef2ff', '#7bf1a8', '#ff4fa3'].forEach((c, i) => cp.add(at(cyl(0.016, 0.016, 0.014, mat(c, { rough: 0.25, clearcoat: 0.8 }), 20), 0.03 + (i % 2) * 0.05 + Math.floor(i / 2) * 0.05, 0.03, -0.03 + (i % 2) * 0.05)));
  g.add(cp);
  const sg = new THREE.Group(); sg.position.set(0, 1.245, 0.2); sg.rotation.x = -0.17;
  sg.add(box(Wi, 0.44, 0.05, mat('#0a0a0d', { rough: 0.3 })));
  const scr = face(0.46, 0.36, 'arcade:screen', (ctx, w, h) => { ctx.fillStyle = '#05010f'; ctx.fillRect(0, 0, w, h); const r = seeded(5); for (let i = 0; i < 40; i++) { ctx.fillStyle = `hsl(${r() * 360},90%,65%)`; ctx.fillRect(r() * w, r() * h, 3, 3); } txt(ctx, 'STAR BLASTER', w / 2, h * 0.38, 26, '#fff', { font: 'monospace' }); txt(ctx, 'INSERT COIN', w / 2, h * 0.62, 16, '#ffd23f', { font: 'monospace' }); }, { emissive: true, ei: 0.7, th: 200 });
  scr.name = 'screen'; sg.add(at(scr, 0, 0, 0.0262));
  g.add(sg);
  g.add(at(box(Wi, 0.29, 0.1, body), 0, 1.6, 0.21));
  const marquee = face(Wi - 0.02, 0.2, 'arcade:marquee', (ctx, w, h) => { vgrad(ctx, w, h, ['#ff4fa3', '#7b2cbf', '#10002b']); txt(ctx, 'STAR BLASTER', w / 2, h * 0.5, h * 0.42, '#ffd23f', { stroke: '#10002b', lw: 8, weight: 900, max: w * 0.92 }); }, { emissive: true, ei: 1.1, th: 84 });
  g.add(at(marquee, 0, 1.615, 0.261));
  g.add(at(box(Wi, 0.02, 0.62, body), 0, 1.73, -0.05));
  return g;
}
function rcCar({ color = '#e63946', key = 'red' } = {}) {
  const g = new THREE.Group();
  const darkM = mat('#1f1f22', { rough: 0.5 });
  const paint = mat(color, { rough: 0.2, clearcoat: 1 });
  g.add(at(rbox(0.15, 0.022, 0.29, 0.008, darkM), 0, 0.045, 0));
  g.add(at(rbox(0.13, 0.055, 0.15, 0.022, paint), 0, 0.085, -0.02));
  g.add(at(rbox(0.12, 0.03, 0.09, 0.012, paint), 0, 0.07, 0.095));
  g.add(at(rot(rbox(0.11, 0.035, 0.05, 0.01, mat('#22303c', { rough: 0.05, metal: 0.5, clearcoat: 1 })), -0.6, 0, 0), 0, 0.1, 0.045));
  g.add(at(rbox(0.16, 0.008, 0.045, 0.004, paint), 0, 0.14, -0.13));
  for (const s of [-1, 1]) g.add(at(box(0.008, 0.035, 0.02, darkM), s * 0.05, 0.12, -0.13));
  for (const s of [-1, 1]) g.add(at(sph(0.008, led('#fff8d6', 1.2), 8, 6), s * 0.04, 0.072, 0.142));
  g.add(at(rot(face(0.05, 0.05, `rc:num:${key}`, (ctx, w, h) => { circle(ctx, w / 2, h / 2, w / 2 - 2, '#fff'); txt(ctx, '7', w / 2, h / 2 + 2, h * 0.7, '#111', { weight: 900 }); }, { transparent: true, th: 64 }), -Math.PI / 2, 0, 0), 0, 0.1131, -0.02));
  g.add(at(cyl(0.0015, 0.0015, 0.16, mat('#111'), 6), 0.05, 0.18, -0.09));
  const tire = MAT.rubber('#151515'); const rim = mat('#ffd60a', { rough: 0.3, metal: 0.4 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Group(); w.userData.wheel = true; w.position.set(x * 0.095, 0.042, z * 0.095);
    w.add(xcyl(0.042, 0.042, 0.04, tire, 20));
    w.add(at(xcyl(0.026, 0.026, 0.042, rim, 6), 0, 0, 0));
    for (let k = 0; k < 6; k++) { const tread = box(0.041, 0.006, 0.012, tire); const a = k / 6 * Math.PI * 2; tread.position.set(0, Math.cos(a) * 0.042, Math.sin(a) * 0.042); tread.rotation.x = -a; w.add(tread); }
    g.add(w);
  }
  return g;
}
function droneModel() {
  const g = new THREE.Group();
  const shell = mat('#d9dce1', { rough: 0.35, clearcoat: 0.4 });
  const darkM = mat('#2b2d33', { rough: 0.4 });
  g.add(at(rbox(0.085, 0.04, 0.13, 0.018, shell), 0, 0.05, 0));
  const top = sph(0.04, shell, 20, 12); top.scale.set(1, 0.4, 1.4); g.add(at(top, 0, 0.068, -0.005));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = box(0.13, 0.012, 0.016, darkM); arm.rotation.y = Math.atan2(-z, x); g.add(at(arm, x * 0.055, 0.055, z * 0.055));
    g.add(at(cyl(0.015, 0.015, 0.022, darkM, 16), x * 0.1, 0.062, z * 0.1));
    const prop = new THREE.Group(); prop.userData.prop = true; prop.position.set(x * 0.1, 0.077, z * 0.1); prop.rotation.y = x * z;
    prop.add(box(0.12, 0.002, 0.014, mat('#f1f3f5', { rough: 0.4 })), cyl(0.005, 0.005, 0.008, MAT.chrome(), 8));
    g.add(prop);
  }
  for (const s of [-1, 1]) g.add(at(box(0.006, 0.006, 0.11, darkM), s * 0.035, 0.004, 0), at(box(0.006, 0.026, 0.006, darkM), s * 0.035, 0.018, 0.035), at(box(0.006, 0.026, 0.006, darkM), s * 0.035, 0.018, -0.035));
  g.add(at(sph(0.014, darkM, 14, 10), 0, 0.026, 0.05));
  const l = sph(0.007, glassLens(), 10, 8); g.add(at(l, 0, 0.026, 0.062));
  g.add(at(sph(0.004, led('#5eff7a'), 6, 4), 0.03, 0.05, 0.066), at(sph(0.004, led('#ff3b30'), 6, 4), -0.03, 0.05, -0.066));
  return g;
}
function ereaderModel() {
  const g = new THREE.Group();
  const d = new THREE.Group(); d.position.set(0, 0.008, 0.02); d.rotation.x = -0.28;
  d.add(at(rbox(0.115, 0.16, 0.008, 0.008, mat('#2b2b2e', { rough: 0.5 })), 0, 0.08, 0));
  d.add(at(face(0.092, 0.122, 'ereader:page', (ctx, w, h) => { ctx.fillStyle = '#e9e7e1'; ctx.fillRect(0, 0, w, h); txt(ctx, 'Chapter One', w / 2, 22, 13, '#333', { font: 'Georgia, serif', weight: 700 }); ctx.fillStyle = '#7c7a76'; for (let y = 42; y < h - 16; y += 11) ctx.fillRect(14, y, w - 28 - ((y * 7) % 30), 4); txt(ctx, '12%', w / 2, h - 8, 8, '#777'); }, { th: 340, rough: 0.85 }), 0, 0.086, 0.0042));
  d.add(at(rbox(0.12, 0.165, 0.003, 0.008, MAT.leather('#386641')), 0, 0.08, -0.0055));
  g.add(d);
  const flap = box(0.115, 0.003, 0.12, MAT.leather('#386641')); flap.rotation.x = 0.85; g.add(at(flap, 0, 0.044, -0.03));
  return g;
}

// ------------------------------------------------------------------ behaviors added by this catalogue
// Streaming gear (webcam / microphone) and an animated jukebox.
registerBehaviors({
  streamgear: {
    subtitle: () => (G.games?.canStream?.() ? (G.state.flags.streaming ? '🔴 Streaming is ON' : 'Streaming ready') : 'Pair a webcam with a mic to stream'),
    held(inst) {
      const mic = inst.def.tags.includes('microphone');
      return [{ key: 'LMB', label: mic ? 'Test the mic' : 'Wave at the camera', run: () => {
        G.audio.play(mic ? 'beep' : 'shutter', { pitch: mic ? 1.4 : 1 });
        G.hand.play(mic ? 'raise' : 'wave');
        G.ui.toast(mic ? 'Check, check… one, two. You sound like a podcast now.' : 'Looking great on camera. Very stream-ready.', { icon: mic ? '🎙️' : '🎥', duration: 3 });
        G.needs.add({ fun: 1 });
      } }];
    },
    world(inst) {
      const ok = G.games?.canStream?.();
      return [{ key: 'E', label: ok ? (G.state.flags.streaming ? 'Stop streaming' : 'Go live when gaming') : 'Streaming setup', run: () => {
        if (!G.games.canStream()) { G.ui.toast(`You need both a webcam and a microphone to stream games for tips. ${inst.def.tags.includes('webcam') ? 'Mic missing!' : 'Webcam missing!'}`, { icon: '🎥', kind: 'bad', duration: 4 }); return; }
        G.state.flags.streaming = !G.state.flags.streaming;
        G.audio.play(G.state.flags.streaming ? 'powerup' : 'click');
        G.ui.toast(G.state.flags.streaming ? '🔴 Streaming ON — play any video game to earn tips!' : 'Streaming off. Back to playing for fun.', { icon: '🎮', duration: 3 });
      } }];
    },
  },
  jukebox: {
    world: (inst) => HANDLERS.speaker.world(inst),
    onEnterWorld: (inst) => HANDLERS.speaker.onEnterWorld(inst),
    onLeaveWorld: (inst) => HANDLERS.speaker.onLeaveWorld(inst),
    dispose: (inst) => HANDLERS.speaker.dispose(inst),
    init(inst) {
      const tubes = [];
      inst.model.traverse((o) => { if (o.isMesh && o.userData.jukeNeon != null) { o.material = o.material.clone(); tubes.push(o); } });
      inst.runtime.tubes = tubes;
    },
    update(inst, dt) {
      HANDLERS.speaker.update(inst, dt);
      const playing = inst.runtime.music?.playing;
      const t = performance.now() * 0.001;
      for (const o of inst.runtime.tubes || []) {
        const k = o.userData.jukeNeon;
        if (playing) { o.material.emissive.setHSL((t * 0.15 + k * 0.22) % 1, 0.95, 0.55); o.material.emissiveIntensity = 1.6 + (inst.runtime.beat || 0) * 1.5; }
        else o.material.emissiveIntensity = 0.9;
      }
    },
  },
});

// ------------------------------------------------------------------ data
const GAME_LIST = [
  { id: 'star_blaster', name: 'Star Blaster', price: 29.99, c1: '#0b0d3b', c2: '#3c096c', emoji: '🚀', desc: 'Arcade space shooter. Dodge, blast and chase the high score through endless alien waves.' },
  { id: 'snake_byte', name: 'Snake Byte', price: 14.99, c1: '#0b3d20', c2: '#1b5e20', emoji: '🐍', platform: 'pocket', desc: 'Eat the bits, grow longer, never bite your own tail. Dangerously "one more go".' },
  { id: 'jump_quest', name: 'Jump Quest', price: 39.99, c1: '#74c0fc', c2: '#d0ebff', emoji: '🍄', platform: 'pocket', desc: 'A bouncy platformer with coins, clouds and one very determined little hero.' },
  { id: 'pong_royale', name: 'Pong Royale', price: 19.99, c1: '#05050c', c2: '#14142b', emoji: '🏓', desc: 'Neon paddles, one ball, a crown on the line. Rivalries have ended friendships.' },
  { id: 'rhythm_pop', name: 'Rhythm Pop', price: 34.99, c1: '#ff4fa3', c2: '#5a189a', emoji: '🎵', desc: 'Tap to the beat of 30 catchy tracks. Flashy combos, zero dignity required.' },
  { id: 'slice_party', name: 'Slice Party', price: 19.99, c1: '#ffb703', c2: '#f77f00', emoji: '🍉', desc: 'Swipe flying fruit, dodge the bombs, become one with the smoothie.' },
  { id: 'fishing_frenzy', name: 'Fishing Frenzy', price: 24.99, c1: '#ffe8a3', c2: '#03045e', emoji: '🎣', desc: 'Cast, reel, brag. Thirty fish species and one legendary old boot.' },
  { id: 'breakout_blitz', name: 'Breakout Blitz', price: 14.99, c1: '#10002b', c2: '#3c096c', emoji: '🧱', desc: 'Smash rainbow bricks, grab power-ups, keep that ball alive.' },
  { id: 'dungeon_dash', name: 'Dungeon Dash', price: 44.99, c1: '#2b2024', c2: '#1a1416', emoji: '🗡️', desc: 'A bite-sized roguelike: loot, dodge, die, repeat. Then just one more run.' },
  { id: 'word_bloom', name: 'Word Bloom', price: 19.99, c1: '#d8f3dc', c2: '#95d5b2', emoji: '🌼', desc: 'Grow a flower garden by spelling words. Cozy, clever, surprisingly competitive.' },
];
const RECORDS = [
  { id: 'vinyl_dusty_tapes', name: 'Dusty Tapes, Vol. 1', artist: 'Mellow Fern', station: 'lofi', color: '#e9c46a', art: 'lofi', c1: '#f7c59f', c2: '#e07a5f', price: 27.99, desc: 'Warm crackle, sleepy chords, a cat on every track (allegedly).' },
  { id: 'vinyl_rainy_window', name: 'Rainy Window Sessions', artist: 'kōhī club', station: 'lofi', color: '#8fb3c9', art: 'window', c1: '#5c677d', c2: '#a3b1c6', price: 26.99, desc: 'Beats recorded during an actual thunderstorm. Best with tea.' },
  { id: 'vinyl_blue_hour', name: 'Blue Hour at the Velvet', artist: 'The Ezra Coal Quartet', station: 'jazz', color: '#3a86ff', art: 'jazz', c1: '#1d3557', c2: '#457b9d', short: 'BLUE HOUR', price: 31.99, desc: 'Live from a smoky basement club. You can hear the ice clinking.' },
  { id: 'vinyl_midnight_standards', name: 'Midnight Standards', artist: 'Lou Marlowe Trio', station: 'jazz', color: '#d4a017', art: 'keys', c1: '#111111', c2: '#d4a017', short: 'MIDNIGHT', price: 29.99, desc: 'Walking bass and brushed drums for very late dinners.' },
  { id: 'vinyl_neon_highway', name: 'Neon Highway', artist: 'Laser Dolphin', station: 'synth', color: '#ff4fa3', art: 'synth', c1: '#240046', price: 29.99, desc: 'Retro arps for driving nowhere at night. Sunglasses recommended indoors.' },
  { id: 'vinyl_chrome_hearts', name: 'Chrome Hearts \'84', artist: 'VHS Vacation', station: 'synth', color: '#7b5cff', art: 'heart', c1: '#3c096c', c2: '#ff4fa3', short: 'CHROME HEARTS', price: 28.99, desc: 'Big pads, bigger hair. A love letter to rewinding tapes.' },
  { id: 'vinyl_rain_on_glass', name: 'Rain on Glass', artist: 'Stillwater', station: 'ambient', color: '#5bb3a8', art: 'ripples', c1: '#264653', c2: '#5bb3a8', price: 24.99, desc: 'Slow, warm drones. Turns any apartment into a spa.' },
  { id: 'vinyl_8bit_heroes', name: '8-Bit Heroes OST', artist: 'Chipkid', station: 'chip', color: '#7ad151', art: 'chip', c1: '#5c94fc', c2: '#c84c0c', price: 34.99, desc: 'Every bleep you loved as a kid, pressed on glorious green wax.' },
  { id: 'vinyl_sunny_side', name: 'Sunny Side Up', artist: 'The Daydreamers', station: 'pop', color: '#ffb347', art: 'egg', c1: '#ffd166', c2: '#ff9f1c', price: 27.99, desc: 'Handclaps, jangly guitars and the cheeriest breakfast on wax.' },
  { id: 'vinyl_bedroom_diaries', name: 'Bedroom Diaries', artist: 'Juniper June', station: 'pop', color: '#ff8fab', art: 'diary', c1: '#ffc8dd', c2: '#ff006e', price: 26.99, desc: 'Whispery hooks written under a duvet. Certified heart-on-sleeve.' },
  { id: 'vinyl_nocturnes', name: 'Nocturnes for a Quiet Flat', artist: 'Clara Weiss', station: 'classical', color: '#d8d0c0', art: 'keys', c1: '#f1e9da', c2: '#3d405b', short: 'NOCTURNES', price: 32.99, desc: 'Gentle piano études for rainy Sundays and fresh sheets.' },
  { id: 'vinyl_cafe_copacabana', name: 'Café Copacabana', artist: 'Tito & the Breeze', station: 'bossa', color: '#e0784f', art: 'palm', c1: '#ffb4a2', c2: '#e5989b', price: 28.99, desc: 'Breezy nylon guitar and shakers. Smells faintly of sunscreen.' },
];

const E = (o) => ({ category: 'electronics', ...o });
const GAME_ITEMS = GAME_LIST.map((gm) => ({
  id: `game_${gm.id}`, name: gm.name, category: 'games', price: gm.price, stores: ['volt', 'primo'], brand: 'Volt Games', emoji: gm.emoji,
  desc: gm.desc, build: () => gameCase(gm), use: { type: 'game', game: gm.id },
}));
const VINYL_ITEMS = RECORDS.map((rec) => ({
  id: rec.id, name: `${rec.name} (Vinyl)`, category: 'books', price: rec.price, stores: ['volt', 'primo'], brand: rec.artist, emoji: '💿',
  desc: rec.desc, build: () => vinylModel(rec), use: { type: 'vinyl', station: rec.station, color: rec.color },
}));
const goldRec = { ...RECORDS[4], id: 'vinyl_neon_highway_gold', gold: true, short: 'NEON HIGHWAY' };

defineItems([
  // -------------------------------------------------------------- TVs
  E({ id: 'tv_crt_32', name: 'RetroVision 32" TV', price: 279, stores: ['volt', 'primo'], furniture: true, place: 'surface', rarity: 'uncommon', brand: 'Volt', desc: 'A modern set in a walnut 70s cabinet. Rabbit ears purely for vibes.', build: crtTV, use: { type: 'tv' }, emoji: '📺' }),
  E({ id: 'tv_oled_65', name: 'Volt 65" OLED TV', price: 1999, stores: ['volt', 'luxe'], furniture: true, place: 'surface', rarity: 'rare', brand: 'Volt', desc: 'Inky blacks, eye-searing color, thinner than your phone. Cinema night, every night.', build: oledTV, use: { type: 'tv' }, emoji: '📺' }),
  // -------------------------------------------------------------- consoles
  E({ id: 'console_pixel_classic', name: 'Pixel Classic Mini', price: 79, stores: ['volt', 'primo'], brand: 'Volt', desc: 'A palm-sized retro console with two corded pads. Pong Royale & Breakout Blitz built in. Place near a TV.', build: retroConsole, use: { type: 'console', bundled: ['pong_royale', 'breakout_blitz'] }, emoji: '🕹️' }),
  E({ id: 'handheld_pocketpal', name: 'PocketPal Handheld', price: 149, stores: ['volt', 'primo'], brand: 'Volt', desc: 'Pocketable console with a chunky green screen. Snake Byte & Jump Quest preloaded — play anywhere.', build: () => handheldModel({}), use: { type: 'handheld', bundled: ['snake_byte', 'jump_quest'] }, emoji: '🎮' }),
  ...GAME_ITEMS,
  { id: 'game_star_blaster_ce', name: 'Star Blaster: Collector\'s Edition', category: 'games', price: 129, stores: ['stockpile'], tags: ['resell'], resale: 160, rarity: 'rare', brand: 'Volt Games', emoji: '🚀', desc: 'Sealed launch-day collector\'s edition with a gold slipcase. Plays exactly the same, flexes much harder.', build: () => gameCase(GAME_LIST[0], { edition: 'COLLECTOR\'S EDITION' }), use: { type: 'game', game: 'star_blaster' } },
  // -------------------------------------------------------------- speakers & radio
  E({ id: 'speaker_pill', name: 'Pill Bluetooth Speaker', price: 59, stores: ['volt', 'primo'], brand: 'Volt Audio', desc: 'Fits in a cup holder, fills a room. The end cap thumps to the beat.', build: () => pillSpeaker({}), use: { type: 'speaker', station: 'pop', volume: 0.5 }, emoji: '🔊' }),
  E({ id: 'speaker_pill_mint', name: 'Pill Speaker — Mint', price: 59, stores: ['volt'], brand: 'Volt Audio', desc: 'Same big sound, in a minty fresh fabric.', build: () => pillSpeaker({ color: '#95d5b2', cap: '#1b4332', key: 'mint' }), use: { type: 'speaker', station: 'lofi', volume: 0.5 }, emoji: '🔊' }),
  E({ id: 'speakers_bookshelf', name: 'Walnut Bookshelf Speakers (Pair)', price: 299, stores: ['volt'], rarity: 'uncommon', brand: 'Volt Audio', desc: 'Two warm-sounding walnut cabinets with silk tweeters. Audiophile-adjacent.', build: bookshelfSpeakers, use: { type: 'speaker', station: 'jazz', volume: 0.7 }, emoji: '🔈' }),
  E({ id: 'boombox_retro', name: 'Retro Boombox', price: 119, stores: ['volt', 'primo'], brand: 'Volt Audio', desc: 'Chrome, twin woofers and a mixtape deck. Shoulder-mountable; neighbors not included.', build: boombox, use: { type: 'radio', station: 'pop', stations: ['pop', 'chip', 'synth', 'lofi'], volume: 0.7 }, emoji: '📻' }),
  E({ id: 'smart_speaker_homie', name: 'Homie Smart Speaker', price: 99, stores: ['volt', 'primo'], brand: 'Homie', desc: '"Hey Homie…" Tells jokes, weather, your balance, and plays music.', build: () => smartSpeaker({}), use: { type: 'smartspeaker', station: 'lofi', volume: 0.5 }, emoji: '🔵' }),
  E({ id: 'smart_speaker_mini', name: 'Homie Mini', price: 39, stores: ['volt', 'primo'], brand: 'Homie', desc: 'A puck-sized Homie for the bedside. Small speaker, big opinions.', build: smartPuck, use: { type: 'smartspeaker', station: 'ambient', volume: 0.4 }, emoji: '🔵' }),
  E({ id: 'radio_cathedral', name: 'Cathedral Tube Radio', price: 149, stores: ['volt', 'luxe', 'primo'], rarity: 'uncommon', brand: 'Volt Audio', desc: 'A 1930s-style walnut radio with a glowing dial. Everything sounds like a broadcast from 1938.', build: cathedralRadio, use: { type: 'radio', station: 'jazz', stations: ['jazz', 'classical', 'bossa', 'lofi'], lofiFilter: 2600, volume: 0.6 }, emoji: '📻' }),
  E({ id: 'jukebox_1956', name: '1956 Starliner Jukebox', price: 6800, stores: ['luxe'], furniture: true, rarity: 'epic', brand: 'Maison Luxe', desc: 'Bubble tubes, neon arcs and a chrome carousel of 45s. The neon cycles to the music.', build: jukebox, use: { type: 'jukebox', station: 'pop', volume: 0.75 }, emoji: '🎶' }),
  // -------------------------------------------------------------- turntables & vinyl
  E({ id: 'turntable_walnut', name: 'Walnut Turntable', price: 349, stores: ['volt', 'arthaus'], rarity: 'uncommon', brand: 'Volt Audio', desc: 'Belt-drive deck on a walnut plinth. Hold a record and press E to drop the needle.', build: () => turntableModel({}), use: { type: 'turntable' }, emoji: '💿' }),
  E({ id: 'turntable_suitcase', name: 'Suitcase Record Player', price: 79, stores: ['volt', 'primo', 'arthaus'], brand: 'Volt Audio', desc: 'Denim-blue suitcase deck with a built-in speaker. Start a collection on a budget.', build: suitcaseTurntable, use: { type: 'turntable' }, emoji: '💿' }),
  ...VINYL_ITEMS,
  { id: 'vinyl_neon_highway_gold', name: 'Neon Highway — Gold Pressing', category: 'books', price: 149, stores: ['stockpile'], tags: ['resell'], resale: 190, rarity: 'epic', brand: 'Laser Dolphin', emoji: '📀', desc: 'Numbered 24-karat-look pressing. 500 made. Plays the synthwave station like a dream.', build: () => vinylModel(goldRec), use: { type: 'vinyl', station: 'synth', color: '#d4a017' } },
  // -------------------------------------------------------------- headphones
  E({ id: 'headphones_studio', name: 'Studio Monitor Headphones', price: 179, stores: ['volt', 'primo'], brand: 'Volt Audio', desc: 'Closed-back, over-ear, brass-accented. Puts you squarely In The Zone.', build: () => headphonesModel({}), use: { type: 'headphones' }, emoji: '🎧' }),
  E({ id: 'headphones_cloud', name: 'Cloud Wireless Headphones', price: 249, stores: ['volt', 'primo'], rarity: 'uncommon', brand: 'Volt Audio', desc: 'Pastel lilac, noise-cancelling, pillow-soft cushions. The city goes quiet.', build: () => headphonesModel({ band: '#c8b6ff', cup: '#e7c6ff', pad: '#f8f0ff', accent: '#ffffff' }), use: { type: 'headphones' }, emoji: '🎧' }),
  E({ id: 'headphones_gold', name: 'Aurum Reference Headphones', price: 1299, stores: ['luxe'], rarity: 'epic', brand: 'Maison Luxe', desc: 'Lambskin pads, gold-plated cups. Hear things in songs that weren\'t even recorded.', build: () => headphonesModel({ band: '#2b1d14', cup: '#d4a017', pad: '#3b2a1e', accent: '#fff3c4' }), use: { type: 'headphones' }, emoji: '🎧' }),
  E({ id: 'cassette_walkman', name: 'Tape Walkabout', price: 49, stores: ['volt', 'primo'], brand: 'Volt Audio', desc: 'Cassette player with foam-pad headphones. Auto-reverse! Pure nostalgia.', build: walkman, use: { type: 'headphones' }, emoji: '📼' }),
  // -------------------------------------------------------------- computers
  E({ id: 'laptop_air', name: 'Volt Air Laptop', price: 1199, stores: ['volt', 'primo'], rarity: 'uncommon', brand: 'Volt', desc: '13" featherweight laptop. Shop, freelance and game from the couch.', build: () => laptopModel({}), use: { type: 'computer', laptop: true, portable: true, userPos: [0, 0, 0.6], eye: 1.15, pitch: -0.25 }, emoji: '💻' }),
  E({ id: 'laptop_rose', name: 'Volt Air — Rose Gold', price: 1249, stores: ['volt', 'luxe'], rarity: 'uncommon', brand: 'Volt', desc: 'The same featherweight laptop, in a blushing rose-gold finish.', build: () => laptopModel({ body: '#e8b4a0', key: 'rose' }), use: { type: 'computer', laptop: true, portable: true, userPos: [0, 0, 0.6], eye: 1.15, pitch: -0.25 }, emoji: '💻' }),
  E({ id: 'tablet_slate', name: 'Slate Tablet & Folio', price: 599, stores: ['volt', 'primo'], brand: 'Volt', desc: '11" tablet in a leather folio with a stylus. Works like a tiny computer.', build: tabletModel, use: { type: 'computer', portable: true, userPos: [0, 0, 0.55], eye: 1.15, pitch: -0.3 }, emoji: '📱' }),
  E({ id: 'monitor_curved', name: 'Curved Gaming Monitor', price: 449, stores: ['volt'], brand: 'Volt', desc: '34" ultrawide, 165 Hz, wraps your whole field of view. Currently showing a very fast car.', build: gamingMonitor, use: { type: 'decor', verb: 'Admire the refresh rate', lines: ['165 Hz. You can feel it.', 'Ultrawide: now you can see the enemies coming.', 'The curve is ergonomically perfect and spiritually immersive.'] }, emoji: '🖥️' }),
  E({ id: 'keyboard_mech', name: 'Clacky Mechanical Keyboard', price: 129, stores: ['volt'], brand: 'Volt', desc: 'Tactile switches, pink accents, RGB underglow and a coiled cable. Pure ASMR.', build: mechKeyboard, use: { type: 'clicker', verb: 'Clack', sound: 'type' }, emoji: '⌨️' }),
  E({ id: 'ereader_ember', name: 'Ember e-Reader', price: 139, stores: ['volt', 'primo'], brand: 'Volt', desc: 'Glare-free ink screen in a forest-green folio. Preloaded with a cozy mystery.', build: ereaderModel, use: { type: 'ereader', pages: 24, genre: 'Cozy Mystery', author: 'Preloaded — Pip Halloway' }, emoji: '📖' }),
  // -------------------------------------------------------------- cameras & optics
  E({ id: 'camera_instant', name: 'Snapsy Instant Camera', price: 79, stores: ['volt', 'primo'], brand: 'Snapsy', desc: 'Prints memories with a warm vintage tint. Every photo lands in your gallery.', build: () => instantCamera({}), use: { type: 'camera', filter: 'vintage' }, emoji: '📸' }),
  E({ id: 'camera_instant_pink', name: 'Snapsy Instant — Blush', price: 79, stores: ['volt', 'kollectiv'], brand: 'Snapsy', desc: 'The blush-pink Snapsy. Vintage filter, maximum cute.', build: () => instantCamera({ color: '#ffafcc', key: 'pink' }), use: { type: 'camera', filter: 'vintage' }, emoji: '📸' }),
  E({ id: 'camera_dslr', name: 'Volta DSLR Camera', price: 1099, stores: ['volt'], rarity: 'rare', brand: 'Volta', desc: '24MP body with a fast zoom lens. Punchy, vivid colors straight out of the camera.', build: dslr, use: { type: 'camera', filter: 'vivid' }, emoji: '📷' }),
  E({ id: 'camera_film_noir', name: 'Noir 35 Rangefinder', price: 389, stores: ['volt', 'luxe'], rarity: 'uncommon', brand: 'Volta', desc: 'Chrome-topped 35mm rangefinder loaded with moody black-and-white film.', build: filmCamera, use: { type: 'camera', filter: 'noir' }, emoji: '📷' }),
  E({ id: 'telescope_refractor', name: 'Stargazer Refractor Telescope', price: 329, stores: ['volt'], furniture: true, place: 'floor', rarity: 'uncommon', brand: 'Volt', desc: '80mm refractor on a sturdy tripod. Point it out the window and spy on the city (politely).', build: telescopeModel, use: { type: 'telescope', fov: 10 }, emoji: '🔭' }),
  E({ id: 'binoculars', name: 'Birdwatcher Binoculars', price: 119, stores: ['volt', 'primo'], brand: 'Volt', desc: '10×42 binoculars. Pigeons, balconies and rooftop drama in crisp detail.', build: binocularsModel, use: { type: 'telescope', fov: 20 }, emoji: '🔭' }),
  // -------------------------------------------------------------- VR & streaming
  E({ id: 'vr_headset', name: 'Volt VR Headset', price: 399, stores: ['volt'], rarity: 'rare', brand: 'Volt', desc: 'Standalone VR. Put it on and dance through Rhythm Pop in glorious 360°.', build: vrHeadset, use: { type: 'vr', game: 'rhythm_pop' }, emoji: '🥽' }),
  E({ id: 'webcam_hd', name: 'Streamr HD Webcam', price: 69, stores: ['volt', 'primo'], tags: ['webcam'], brand: 'Streamr', desc: '1080p webcam on a mini tripod. With a mic, you can stream your games for tips.', build: webcamModel, use: { type: 'streamgear' }, emoji: '🎥' }),
  E({ id: 'mic_podcast', name: 'Podcast USB Microphone', price: 129, stores: ['volt', 'primo'], tags: ['microphone'], brand: 'Streamr', desc: 'Broadcast-grade condenser mic. Pair with a webcam to go live.', build: () => micModel({}), use: { type: 'streamgear' }, emoji: '🎙️' }),
  E({ id: 'mic_podcast_rose', name: 'Podcast Mic — Rose Gold', price: 139, stores: ['volt'], tags: ['microphone'], brand: 'Streamr', desc: 'The podcast mic in rose gold. Same pristine audio, extra sparkle.', build: () => micModel({ body: '#d8a48f' }), use: { type: 'streamgear' }, emoji: '🎙️' }),
  { id: 'ring_light', name: 'Creator Ring Light', category: 'lighting', price: 59, stores: ['volt', 'primo'], furniture: true, place: 'floor', brand: 'Streamr', desc: '18" dimmable ring light on a tripod with a phone clamp. Flattering at any hour.', build: ringLight, use: { type: 'light', bulb: [0, 1.6, 0.15], intensity: 3.2, distance: 4.5, color: '#fff4ea', ei: 2.2, startOn: false }, emoji: '💡' },
  // -------------------------------------------------------------- arcade & RC
  E({ id: 'arcade_star_blaster', name: 'Star Blaster Arcade Cabinet', price: 2499, stores: ['volt', 'luxe'], furniture: true, place: 'floor', rarity: 'epic', brand: 'Volt Games', desc: 'Full-size upright cabinet with a glowing marquee, real joystick and free play. Coins optional.', build: arcadeCabinet, use: { type: 'arcade', game: 'star_blaster', title: 'STAR BLASTER' }, emoji: '👾' }),
  E({ id: 'rc_car', name: 'Turbo RC Buggy', price: 69, stores: ['volt', 'primo'], brand: 'Volt', desc: 'Big-wheeled remote control buggy. Drive it under the couch and back. Repeat.', build: () => rcCar({}), use: { type: 'rc', speed: 3.4 }, emoji: '🏎️' }),
  E({ id: 'rc_car_blue', name: 'Turbo RC Buggy — Azure', price: 69, stores: ['volt'], brand: 'Volt', desc: 'The Turbo Buggy in racing blue. Same zoom, cooler paint.', build: () => rcCar({ color: '#3a86ff', key: 'blue' }), use: { type: 'rc', speed: 3.4 }, emoji: '🏎️' }),
  E({ id: 'drone_mini', name: 'Hover Mini Drone', price: 199, stores: ['volt'], rarity: 'uncommon', brand: 'Volt', desc: 'Palm-sized quadcopter. Space/C to climb and dive. Mind the ceiling fan.', build: droneModel, use: { type: 'rc', speed: 2.6, drone: true }, emoji: '🛸' }),
]);
