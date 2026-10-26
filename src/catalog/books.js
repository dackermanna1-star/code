// Catalogue: books & media — novels across genres, comics, magazines and
// coffee-table art books. Every cover is painted procedurally.
// Books lie flat (cover on +Y, spine at -X, top edge toward -Z), like shared.bookModel.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, at, group } from '../items/kit.js';
import { labelTexture } from '../core/textures.js';
import { seeded } from '../core/utils.js';
import { bookModel } from './shared.js';
import { sgeo, mesh, txt, vgrad, circle } from './tech.js';

const PI = Math.PI;
const SERIF = 'Georgia, "Times New Roman", serif';

function pagesTex(c = '#f6f1e4') {
  return labelTexture(`pages:${c}`, 64, 64, (ctx, w, h) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(120,100,70,0.18)'; ctx.lineWidth = 1; for (let y = 2; y < h; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } });
}
function spineTex(key, color, title, author, ink) {
  return labelTexture(`spine:${key}`, 512, 64, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, 6, w, 2); ctx.fillRect(0, h - 8, w, 2);
    txt(ctx, title.toUpperCase(), w * 0.42, h / 2, h * 0.42, ink, { font: SERIF, weight: 700, max: w * 0.62 });
    txt(ctx, author.toUpperCase(), w * 0.88, h / 2, h * 0.26, ink, { weight: 600, max: w * 0.2 });
  });
}
// a book lying flat with a custom painted cover
function paintedBook({ key, w = 0.135, h = 0.205, t = 0.028, color = '#3d405b', ink = '#ffffff', title, author = '', draw, back = null, gloss = false, pageC = '#f6f1e4' }) {
  const cover = labelTexture(`cover:${key}`, 256, Math.round(256 * h / w), (ctx, W, H) => draw(ctx, W, H));
  const pages = mat('#ffffff', { map: pagesTex(pageC), rough: 0.95 });
  const coverM = mat('#ffffff', { map: cover, rough: gloss ? 0.38 : 0.6 });
  const spine = mat('#ffffff', { map: spineTex(key, color, title, author, ink), rough: gloss ? 0.3 : 0.6 });
  const backM = mat(back || color, { rough: 0.6 });
  // BoxGeometry maps the -X face with u along Z, so the spine title already runs along the book's length
  const geo = sgeo(`bookgeo:${w}:${t}:${h}`, () => new THREE.BoxGeometry(w, t, h));
  const b = mesh(geo, [pages, spine, coverM, backM, pages, pages]);
  b.position.y = t / 2;
  return group(b);
}
// stand a flat book face-out (cover toward +Z), leaning back on a little display stand
function faceOut(book, { w, h, t, lean = 0.2, stand = 'acrylic', sleeve = false }) {
  const inner = group(book); inner.rotation.x = PI / 2; inner.position.set(0, h / 2, -t);
  const piv = group(inner);
  if (sleeve) {
    piv.add(at(new THREE.Mesh(sgeo(`board:${w}:${h}`, () => new THREE.BoxGeometry(w + 0.004, h + 0.004, 0.0015)), mat('#f8f9fa', { rough: 0.9 })), 0, h / 2 + 0.001, -t - 0.001));
    piv.add(at(new THREE.Mesh(sgeo(`sleeve:${w}:${h}`, () => new THREE.BoxGeometry(w + 0.008, h + 0.03, t + 0.006)), mat('#f4f9ff', { rough: 0.1, opacity: 0.07, transparent: true, depthWrite: false })), 0, h / 2 + 0.014, -t / 2));
  }
  piv.rotation.x = -lean;
  const g = group(piv);
  const sm = stand === 'wire' ? mat('#2b2b2b', { rough: 0.35, metal: 0.8 }) : mat('#eef6ff', { rough: 0.05, opacity: 0.45, transparent: true });
  const back = new THREE.Mesh(sgeo(`standback:${stand}:${h}`, () => new THREE.BoxGeometry(stand === 'wire' ? 0.006 : w * 0.5, h * 0.62, 0.004)), sm);
  back.rotation.x = -lean - 0.32; back.position.set(0, h * 0.3, -0.02 - h * 0.12);
  g.add(back);
  g.add(at(new THREE.Mesh(sgeo(`standlip:${stand}:${w}`, () => new THREE.BoxGeometry(stand === 'wire' ? w * 0.8 : w * 0.7, 0.012, 0.006)), sm), 0, 0.006, 0.006));
  g.add(at(new THREE.Mesh(sgeo(`standfoot:${stand}:${w}`, () => new THREE.BoxGeometry(stand === 'wire' ? w * 0.8 : w * 0.7, 0.003, 0.05 + h * 0.12)), sm), 0, 0.0015, -0.012 - h * 0.05));
  return g;
}
const title = (ctx, s, x, y, size, color, o = {}) => txt(ctx, s, x, y, size, color, { font: SERIF, weight: 700, ...o });
function wrap(ctx, s, x, y, size, color, maxChars, lh = 1.12, o = {}) {
  const words = s.split(' '); const lines = []; let line = '';
  for (const wd of words) { if ((line + ' ' + wd).trim().length > maxChars && line) { lines.push(line); line = wd; } else line = (line + ' ' + wd).trim(); }
  lines.push(line);
  lines.forEach((l, i) => title(ctx, l, x, y + i * size * lh, size, color, o));
}

// ------------------------------------------------------------------ cover painters
const COVERS = {
  catcafe(ctx, W, H) {
    vgrad(ctx, W, H, ['#2a9d8f', '#1d5c63']);
    ctx.fillStyle = '#f4e3c3'; ctx.fillRect(W * 0.18, H * 0.34, W * 0.64, H * 0.36); ctx.fillStyle = '#e9c46a'; ctx.fillRect(W * 0.18, H * 0.34, W * 0.64, H * 0.03);
    ctx.fillStyle = '#7f5539'; ctx.fillRect(W * 0.49, H * 0.34, W * 0.02, H * 0.36); ctx.fillRect(W * 0.18, H * 0.52, W * 0.64, H * 0.015);
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(W * 0.34, H * 0.66, 26, 20, 0, 0, 7); ctx.fill(); circle(ctx, W * 0.34, H * 0.6, 15, '#1b1b1b');
    ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.575); ctx.lineTo(W * 0.31, H * 0.545); ctx.lineTo(W * 0.33, H * 0.57); ctx.moveTo(W * 0.35, H * 0.57); ctx.lineTo(W * 0.37, H * 0.545); ctx.lineTo(W * 0.38, H * 0.575); ctx.fill();
    circle(ctx, W * 0.33, H * 0.6, 2.5, '#ffd166'); circle(ctx, W * 0.36, H * 0.6, 2.5, '#ffd166');
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W * 0.66, H * 0.58, 22, 0, 7); ctx.stroke(); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(W * 0.66 + 16, H * 0.58 + 16); ctx.lineTo(W * 0.66 + 40, H * 0.58 + 40); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(W * 0.66, H * 0.58, 18, 0, 7); ctx.fill();
    wrap(ctx, 'The Cat Café Caper', W / 2, H * 0.12, 30, '#fefae0', 13);
    title(ctx, 'PIP HALLOWAY', W / 2, H * 0.9, 16, '#e9c46a', { weight: 600 });
    title(ctx, 'A Whisker Lane Mystery', W / 2, H * 0.8, 13, '#fefae0', { weight: 400 });
  },
  bookmark(ctx, W, H) {
    ctx.fillStyle = '#6a040f'; ctx.fillRect(0, 0, W, H);
    const cols = ['#e9c46a', '#264653', '#f4a261', '#2a9d8f', '#e76f51'];
    for (let i = 0; i < 5; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(W * 0.2 + (i % 2) * 8, H * (0.72 - i * 0.065), W * 0.6 - (i % 2) * 16, H * 0.055); }
    ctx.fillStyle = '#d4d4d4'; ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.3); ctx.lineTo(W * 0.53, H * 0.48); ctx.lineTo(W * 0.47, H * 0.48); ctx.fill();
    ctx.fillStyle = '#3d2c1e'; ctx.fillRect(W * 0.44, H * 0.48, W * 0.12, 8); ctx.fillRect(W * 0.485, H * 0.48, W * 0.03, 30);
    for (let i = 0; i < 4; i++) { const x = W * (0.2 + i * 0.18), y = H * (0.86 - (i % 2) * 0.03); circle(ctx, x, y, 7, 'rgba(255,255,255,0.35)'); for (let k = 0; k < 3; k++) circle(ctx, x - 8 + k * 8, y - 10, 3.5, 'rgba(255,255,255,0.35)'); }
    wrap(ctx, 'Death by Bookmark', W / 2, H * 0.1, 30, '#fefae0', 12);
    title(ctx, 'AGATHA CRUMPET', W / 2, H * 0.95, 14, '#e9c46a', { weight: 600 });
  },
  freighter(ctx, W, H) {
    vgrad(ctx, W, H, ['#03001c', '#301e67', '#5b8fb9']);
    const r = seeded(3); for (let i = 0; i < 90; i++) circle(ctx, r() * W, r() * H, r() * 1.4, '#fff');
    const gg = ctx.createRadialGradient(W * 0.3, H * 0.75, 10, W * 0.3, H * 0.75, 120); gg.addColorStop(0, '#ffb347'); gg.addColorStop(1, '#b5179e');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.78, 110, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(W * 0.62, H * 0.42); ctx.rotate(-0.35);
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(-60, -8, 110, 16); ctx.fillRect(-40, -18, 30, 36); ctx.fillRect(0, -16, 20, 32); ctx.fillStyle = '#5ef2ff'; ctx.fillRect(-70, -5, 12, 10);
    ctx.fillStyle = '#ff7b00'; ctx.beginPath(); ctx.moveTo(-72, -6); ctx.lineTo(-100, 0); ctx.lineTo(-72, 6); ctx.fill(); ctx.restore();
    txt(ctx, 'STARLIGHT', W / 2, H * 0.1, 34, '#5ef2ff', { weight: 900 }); txt(ctx, 'FREIGHTER', W / 2, H * 0.18, 34, '#5ef2ff', { weight: 900 });
    txt(ctx, 'OCTAVIA REYES', W / 2, H * 0.94, 14, '#ffffff', { weight: 700 });
  },
  signal(ctx, W, H) {
    vgrad(ctx, W, H, ['#001219', '#005f73', '#0a9396']);
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = ['rgba(148,210,189,0.6)', 'rgba(233,216,166,0.35)', 'rgba(126,255,170,0.3)'][i]; ctx.lineWidth = 18 - i * 4; ctx.beginPath(); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * (0.22 + i * 0.07) + Math.sin(x * 0.02 + i * 2) * 14); ctx.stroke(); }
    for (let i = 1; i <= 4; i++) { ctx.strokeStyle = `rgba(255,255,255,${0.6 - i * 0.12})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.56, i * 22, PI * 1.15, PI * 1.85); ctx.stroke(); }
    ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.62, 40, 18, -0.4, 0, PI); ctx.fill(); ctx.fillRect(W * 0.49, H * 0.64, 6, 40); ctx.fillStyle = '#001219'; ctx.fillRect(0, H * 0.74, W, H * 0.26);
    txt(ctx, 'THE LAST', W / 2, H * 0.1, 22, '#e9d8a6', { weight: 600 }); txt(ctx, 'SIGNAL', W / 2, H * 0.17, 40, '#ffffff', { weight: 900 });
    txt(ctx, 'J. T. OKAFOR', W / 2, H * 0.9, 15, '#94d2bd', { weight: 700 });
  },
  teacup(ctx, W, H) {
    vgrad(ctx, W, H, ['#240046', '#5a189a']);
    const r = seeded(11); for (let i = 0; i < 40; i++) txt(ctx, '✦', r() * W, r() * H, 6 + r() * 10, 'rgba(255,214,102,0.7)', { weight: 400 });
    ctx.fillStyle = '#fdf0d5'; ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.6); ctx.lineTo(W * 0.7, H * 0.6); ctx.quadraticCurveTo(W * 0.68, H * 0.78, W * 0.5, H * 0.78); ctx.quadraticCurveTo(W * 0.32, H * 0.78, W * 0.3, H * 0.6); ctx.fill();
    ctx.strokeStyle = '#fdf0d5'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.66, 14, -PI / 2, PI / 2); ctx.stroke();
    ctx.fillStyle = '#fdf0d5'; ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.8, 70, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,102,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.58); ctx.bezierCurveTo(W * 0.3, H * 0.48, W * 0.7, H * 0.42, W * 0.48, H * 0.32); ctx.bezierCurveTo(W * 0.4, H * 0.28, W * 0.62, H * 0.24, W * 0.56, H * 0.2); ctx.stroke();
    wrap(ctx, 'The Teacup Wizard', W / 2, H * 0.08, 28, '#ffd166', 12);
    title(ctx, 'ROWAN THISTLE', W / 2, H * 0.92, 15, '#e0aaff', { weight: 600 });
  },
  dragon(ctx, W, H) {
    vgrad(ctx, W, H, ['#081c15', '#1b4332', '#52b788']);
    circle(ctx, W * 0.7, H * 0.3, 40, '#fefae0');
    ctx.fillStyle = '#2d3a2e'; ctx.fillRect(W * 0.42, H * 0.38, 40, H * 0.5); ctx.beginPath(); ctx.moveTo(W * 0.4, H * 0.38); ctx.lineTo(W * 0.42 + 20, H * 0.28); ctx.lineTo(W * 0.42 + 44, H * 0.38); ctx.fill();
    circle(ctx, W * 0.42 + 20, H * 0.46, 6, '#ffd166');
    ctx.strokeStyle = '#d00000'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W * 0.15, H * 0.82); ctx.bezierCurveTo(W * 0.1, H * 0.6, W * 0.75, H * 0.7, W * 0.8, H * 0.52); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#d00000'; ctx.beginPath(); ctx.moveTo(W * 0.8, H * 0.52); ctx.lineTo(W * 0.92, H * 0.47); ctx.lineTo(W * 0.84, H * 0.58); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W * 0.45, H * 0.68); ctx.lineTo(W * 0.62, H * 0.5); ctx.lineTo(W * 0.6, H * 0.66); ctx.fill();
    for (let i = 0; i < 8; i++) { ctx.fillStyle = '#081c15'; ctx.beginPath(); ctx.moveTo(i * 36 - 10, H); ctx.lineTo(i * 36 + 8, H * 0.78 - (i % 3) * 12); ctx.lineTo(i * 36 + 26, H); ctx.fill(); }
    wrap(ctx, 'Dragon of Willowmere', W / 2, H * 0.08, 27, '#fefae0', 12);
  },
  latte(ctx, W, H) {
    ctx.fillStyle = '#ffc8dd'; ctx.fillRect(0, 0, W, H);
    for (const [x, rot] of [[0.33, -0.15], [0.67, 0.15]]) {
      ctx.save(); ctx.translate(W * x, H * 0.58); ctx.rotate(rot);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, 42, 14, 0, 0, 7); ctx.fill(); ctx.fillRect(-42, 0, 84, 50); ctx.beginPath(); ctx.ellipse(0, 50, 42, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#b08968'; ctx.beginPath(); ctx.ellipse(0, 0, 36, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fefae0'; ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-16, -4, -8, -10, 0, -3); ctx.bezierCurveTo(8, -10, 16, -4, 0, 6); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 6; i++) txt(ctx, '♥', W * (0.15 + i * 0.14), H * (0.36 - (i % 2) * 0.04), 14 + (i % 3) * 4, '#ff5d8f', { weight: 400 });
    wrap(ctx, 'Love at First Latte', W / 2, H * 0.1, 30, '#9d174d', 12, 1.1, { font: 'Georgia, serif' });
    title(ctx, 'SUNNY DAYE', W / 2, H * 0.9, 15, '#9d174d', { weight: 600 });
  },
  rooftop(ctx, W, H) {
    vgrad(ctx, W, H, ['#ff7b54', '#ffb26b', '#ffd56b']);
    circle(ctx, W * 0.5, H * 0.55, 46, '#fff3b0');
    ctx.fillStyle = '#3d2c48'; let x = 0; const r = seeded(9); while (x < W) { const bw = 20 + r() * 30, bh = H * (0.1 + r() * 0.2); ctx.fillRect(x, H * 0.68 - bh, bw - 3, bh); x += bw; }
    ctx.fillStyle = '#2b1d33'; ctx.fillRect(0, H * 0.68, W, H * 0.32);
    ctx.strokeStyle = '#2b1d33'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, H * 0.4); ctx.quadraticCurveTo(W / 2, H * 0.5, W, H * 0.4); ctx.stroke();
    for (let i = 1; i < 10; i++) { const t = i / 10; circle(ctx, W * t, H * 0.4 + Math.sin(t * PI) * H * 0.05 + 4, 3.5, '#fff3b0'); }
    for (const sx of [0.42, 0.56]) { circle(ctx, W * sx, H * 0.6, 10, '#2b1d33'); ctx.fillStyle = '#2b1d33'; ctx.fillRect(W * sx - 9, H * 0.6 + 8, 18, 40); }
    wrap(ctx, 'Rooftop Summer', W / 2, H * 0.1, 32, '#6a040f', 10, 1.05, { font: 'Georgia, serif' });
    title(ctx, 'MARISOL VEGA', W / 2, H * 0.92, 14, '#ffd56b', { weight: 600 });
  },
  stayin(ctx, W, H) {
    ctx.fillStyle = '#f4ede1'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3d405b'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.28, H * 0.68); ctx.lineTo(W * 0.28, H * 0.5); ctx.quadraticCurveTo(W * 0.28, H * 0.4, W * 0.4, H * 0.4); ctx.lineTo(W * 0.58, H * 0.4); ctx.quadraticCurveTo(W * 0.7, H * 0.4, W * 0.7, H * 0.5); ctx.lineTo(W * 0.7, H * 0.68); ctx.moveTo(W * 0.28, H * 0.58); ctx.lineTo(W * 0.7, H * 0.58); ctx.moveTo(W * 0.32, H * 0.68); ctx.lineTo(W * 0.32, H * 0.72); ctx.moveTo(W * 0.66, H * 0.68); ctx.lineTo(W * 0.66, H * 0.72); ctx.stroke();
    ctx.fillStyle = '#e07a5f'; ctx.fillRect(W * 0.78, H * 0.62, 22, 26);
    ctx.fillStyle = '#81b29a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(W * 0.78 + 11 + Math.cos(i * 1.2 - 2) * 14, H * 0.58 + Math.sin(i * 1.2 - 2) * 12, 6, 12, i * 1.2, 0, 7); ctx.fill(); }
    txt(ctx, 'THE ART OF', W / 2, H * 0.12, 18, '#3d405b', { weight: 500 }); txt(ctx, 'STAYING IN', W / 2, H * 0.2, 32, '#3d405b', { weight: 900 });
    txt(ctx, 'Small rituals for a big, quiet life', W / 2, H * 0.28, 11, '#e07a5f', { weight: 500 });
    txt(ctx, 'DR. HYGGE LARSEN', W / 2, H * 0.9, 13, '#3d405b', { weight: 700 });
  },
  habits(ctx, W, H) {
    ctx.fillStyle = '#a3b18a'; ctx.fillRect(0, 0, W, H);
    const icons = ['☕', '🪴', '🕯️', '📖', '🧦', '🍵'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) txt(ctx, icons[(r * 4 + c) % icons.length], W * (0.17 + c * 0.22), H * (0.38 + r * 0.12), 26, '#000', { weight: 400 });
    ctx.fillStyle = '#344e41'; ctx.fillRect(0, 0, W, H * 0.3);
    wrap(ctx, 'Tiny Habits, Cozy Life', W / 2, H * 0.1, 26, '#fefae0', 13, 1.1, { font: 'Inter, sans-serif', weight: 900 });
    txt(ctx, 'JUNE OKONKWO', W / 2, H * 0.93, 14, '#344e41', { weight: 800 });
  },
  apartment(ctx, W, H) {
    ctx.fillStyle = '#6d7b8d'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4a5568'; ctx.fillRect(W * 0.12, H * 0.28, W * 0.76, H * 0.72);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { const lit = r === 2 && c === 1; ctx.fillStyle = lit ? '#ffd166' : '#2d3748'; ctx.fillRect(W * (0.18 + c * 0.17), H * (0.33 + r * 0.12), W * 0.1, H * 0.07); if (lit) { ctx.fillStyle = 'rgba(255,209,102,0.25)'; ctx.fillRect(W * (0.18 + c * 0.17) - 8, H * (0.33 + r * 0.12) - 8, W * 0.1 + 16, H * 0.07 + 16); } }
    title(ctx, 'Apartment 4B', W / 2, H * 0.12, 32, '#fefae0', { weight: 400 });
    title(ctx, 'a novel', W / 2, H * 0.2, 14, '#e2e8f0', { weight: 400 });
    title(ctx, 'MARA VELL', W / 2, H * 0.95, 14, '#fefae0');
  },
  smallhours(ctx, W, H) {
    ctx.fillStyle = '#14213d'; ctx.fillRect(0, 0, W, H);
    circle(ctx, W * 0.5, H * 0.5, 60, '#fca311'); circle(ctx, W * 0.5 + 22, H * 0.5 - 12, 56, '#14213d');
    const r = seeded(17); for (let i = 0; i < 30; i++) circle(ctx, r() * W, r() * H, r() * 1.5, '#e5e5e5');
    title(ctx, 'small hours', W / 2, H * 0.16, 34, '#e5e5e5', { weight: 400 });
    title(ctx, 'poems for 3 a.m.', W / 2, H * 0.24, 13, '#fca311', { weight: 400 });
    title(ctx, 'ELIAS MOON', W / 2, H * 0.88, 14, '#e5e5e5', { weight: 400 });
  },
  // ---------------------------------------------------------------- comics
  cosmo(ctx, W, H) {
    vgrad(ctx, W, H, ['#03045e', '#7209b7']);
    const r = seeded(4); for (let i = 0; i < 40; i++) circle(ctx, r() * W, r() * H, 1.5, '#fff');
    circle(ctx, W * 0.8, H * 0.75, 50, '#ff9f1c'); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(W * 0.8, H * 0.75, 72, 16, -0.3, 0, 7); ctx.stroke();
    ctx.save(); ctx.translate(W * 0.42, H * 0.55); ctx.rotate(-0.5);
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(-70, 40); ctx.lineTo(-30, 20); ctx.lineTo(-10, 30); ctx.fill();
    ctx.fillStyle = '#3a86ff'; ctx.fillRect(-12, -20, 24, 50); circle(ctx, 0, -34, 15, '#ffd6a5'); ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.lineTo(0, 6); ctx.fill();
    ctx.fillStyle = '#3a86ff'; ctx.fillRect(10, -18, 40, 9); circle(ctx, 54, -14, 7, '#ffd6a5'); ctx.restore();
    comicMast(ctx, W, H, 'CAPTAIN', 'COSMO', '#ffd60a', '#e63946', '#1');
  },
  ninjas(ctx, W, H) {
    ctx.fillStyle = '#ff9f1c'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W / 2, H * 0.6); const a = i / 18 * PI * 2; ctx.lineTo(W / 2 + Math.cos(a) * 300, H * 0.6 + Math.sin(a) * 300); ctx.stroke(); }
    for (const [x, c] of [[0.3, '#2a9d8f'], [0.7, '#e63946']]) { ctx.save(); ctx.translate(W * x, H * 0.62); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-18, -10, 36, 60); circle(ctx, 0, -24, 18, '#1b1b1b'); ctx.fillStyle = c; ctx.fillRect(-18, -30, 36, 8); ctx.fillStyle = '#fff'; ctx.fillRect(-10, -27, 6, 3); ctx.fillRect(4, -27, 6, 3); ctx.restore(); }
    for (const [x, y, rr] of [[0.5, 0.42, 0.4], [0.18, 0.4, -0.6], [0.82, 0.38, 0.9]]) { ctx.save(); ctx.translate(W * x, H * y); ctx.rotate(rr); ctx.fillStyle = '#f4d35e'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(14, 14); ctx.lineTo(-14, 14); ctx.fill(); ctx.fillStyle = '#c1121f'; circle(ctx, 0, 4, 3.5, '#c1121f'); circle(ctx, -4, 9, 3, '#c1121f'); ctx.fillStyle = '#d4a373'; ctx.fillRect(-15, 12, 30, 5); ctx.restore(); }
    comicMast(ctx, W, H, 'PIZZA', 'NINJAS', '#ffffff', '#1b1b1b', '#7');
  },
  mothgirl(ctx, W, H) {
    vgrad(ctx, W, H, ['#10002b', '#3c096c']);
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#240046' : '#1a0033'; const bw = W / 12; const bh = H * (0.15 + ((i * 7) % 5) * 0.06); ctx.fillRect(i * bw, H - bh, bw, bh); for (let k = 0; k < 4; k++) ctx.fillStyle = '#ffd166', ctx.fillRect(i * bw + 4, H - bh + 8 + k * 14, 4, 4); }
    circle(ctx, W * 0.75, H * 0.3, 28, '#fefae0');
    ctx.save(); ctx.translate(W * 0.45, H * 0.52);
    for (const s of [-1, 1]) { ctx.fillStyle = '#c77dff'; ctx.beginPath(); ctx.ellipse(s * 40, -10, 40, 54, s * 0.4, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd166'; circle(ctx, s * 44, -16, 10, '#ffd166'); circle(ctx, s * 44, -16, 5, '#10002b'); }
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-9, -20, 18, 56); circle(ctx, 0, -32, 13, '#ffd6a5'); ctx.fillStyle = '#5a189a'; ctx.fillRect(-13, -36, 26, 6);
    ctx.restore();
    comicMast(ctx, W, H, 'MOTH', 'GIRL', '#e0aaff', '#10002b', '#12');
  },
  robopals(ctx, W, H) {
    ctx.fillStyle = '#90e0ef'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 14) for (let x = (y / 14) % 2 ? 0 : 7; x < W; x += 14) circle(ctx, x, y, 2.5, 'rgba(255,255,255,0.5)');
    for (const [x, c, s] of [[0.32, '#ff595e', 1], [0.68, '#ffca3a', 0.85]]) { ctx.save(); ctx.translate(W * x, H * 0.62); ctx.scale(s, s); ctx.fillStyle = c; ctx.fillRect(-30, -20, 60, 60); ctx.fillStyle = '#e9ecef'; ctx.fillRect(-26, -64, 52, 40); circle(ctx, -12, -44, 8, '#1b1b1b'); circle(ctx, 12, -44, 8, '#1b1b1b'); circle(ctx, -10, -46, 3, '#fff'); circle(ctx, 14, -46, 3, '#fff'); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-2, -82, 4, 18); circle(ctx, 0, -84, 6, c); ctx.fillStyle = '#495057'; ctx.fillRect(-46, -14, 16, 8); ctx.fillRect(30, -14, 16, 8); ctx.restore(); }
    txt(ctx, '♥', W / 2, H * 0.5, 26, '#ff006e', { weight: 400 });
    comicMast(ctx, W, H, 'ROBO', 'PALS', '#ffffff', '#3a86ff', '#3');
  },
};
function comicMast(ctx, W, H, l1, l2, fill, stroke, issue) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H * 0.24);
  ctx.fillStyle = stroke; ctx.fillRect(0, H * 0.24 - 6, W, 6);
  txt(ctx, l1, W * 0.44, H * 0.07, 30, fill, { weight: 900, stroke, lw: 8, max: W * 0.8 });
  txt(ctx, l2, W * 0.44, H * 0.165, 44, fill, { weight: 900, stroke, lw: 9, max: W * 0.8 });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(W - 54, 8, 46, 56); ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2; ctx.strokeRect(W - 54, 8, 46, 56);
  txt(ctx, issue, W - 31, 28, 22, '#1b1b1b', { weight: 900 }); txt(ctx, '$3.99', W - 31, 52, 11, '#1b1b1b', { weight: 700 });
}
// ---------------------------------------------------------------- magazines
function magCover(mast, bg, accent, art, lines) {
  return (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    art(ctx, W, H);
    txt(ctx, mast, W / 2, H * 0.08, 58, accent, { weight: 900, font: 'Didot, "Bodoni MT", Georgia, serif', max: W * 0.92 });
    lines.forEach(([s, y, size, c], i) => txt(ctx, s, 14, H * y, size, c, { align: 'left', weight: i === 0 ? 900 : 700, max: W * 0.55 }));
    ctx.fillStyle = '#ffffff'; ctx.fillRect(W - 46, H - 40, 36, 30); ctx.fillStyle = '#111'; for (let i = 0; i < 12; i++) ctx.fillRect(W - 44 + i * 2.8, H - 37, i % 3 ? 1.2 : 2, 20);
  };
}
const MAGS = {
  nest: magCover('NEST', '#f1e9da', '#7f187f', (ctx, W, H) => {
    ctx.fillStyle = '#e9d8c4'; ctx.fillRect(0, H * 0.25, W, H * 0.75);
    ctx.fillStyle = '#7f5539'; ctx.fillRect(W * 0.62, H * 0.3, W * 0.22, H * 0.34);
    ctx.fillStyle = '#9b2226'; ctx.fillRect(W * 0.28, H * 0.62, W * 0.62, H * 0.12); ctx.fillRect(W * 0.28, H * 0.54, W * 0.62, H * 0.1);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(W * 0.34, H * 0.56, 26, 22);
    ctx.fillStyle = '#2d6a4f'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(W * 0.16 + Math.cos(i) * 18, H * 0.5 + Math.sin(i * 2) * 20, 9, 24, i, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#b08968'; ctx.fillRect(W * 0.1, H * 0.6, 34, 40);
  }, [['THE COZY ISSUE', 0.2, 18, '#7f187f'], ['47 ways to nest', 0.27, 12, '#333'], ['Rugs that hug', 0.86, 12, '#333']]),
  pixel: magCover('PIXEL', '#10002b', '#5ef2ff', (ctx, W, H) => {
    vgrad(ctx, W, H, ['#10002b', '#3c096c'], H * 0.2, H);
    ctx.fillStyle = '#ff4fa3'; ctx.beginPath(); ctx.arc(W * 0.6, H * 0.55, 70, 0, 7); ctx.fill();
    ctx.fillStyle = '#e9ecef'; ctx.fillRect(W * 0.42, H * 0.5, 110, 50); for (const x of [0.48, 0.74]) circle(ctx, W * x, H * 0.58, 12, '#adb5bd');
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(W * 0.52, H * 0.52, 12, 4); ctx.fillRect(W * 0.535, H * 0.5, 4, 12);
    ['#ff595e', '#ffca3a', '#8ac926', '#1982c4'].forEach((c, i) => circle(ctx, W * 0.68 + (i % 2) * 10, H * 0.52 + Math.floor(i / 2) * 10, 4, c));
  }, [['GAME OF THE YEAR?!', 0.2, 16, '#ffd166'], ['Star Blaster review', 0.27, 12, '#e0aaff'], ['Speedrun secrets', 0.86, 12, '#ffffff']]),
  bloom: magCover('BLOOM', '#d8f3dc', '#1b4332', (ctx, W, H) => {
    ctx.fillStyle = '#2d6a4f';
    for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(W * (0.5 + Math.cos(i * 1.3) * 0.18), H * (0.55 + Math.sin(i * 1.3) * 0.12)); ctx.rotate(i * 1.3); ctx.beginPath(); ctx.ellipse(0, 0, 34, 56, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#d8f3dc'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(-14, -30 + k * 18, 10, 3, 0.3, 0, 7); ctx.fill(); } ctx.fillStyle = '#2d6a4f'; ctx.restore(); }
    ctx.fillStyle = '#bc6c25'; ctx.fillRect(W * 0.38, H * 0.78, W * 0.24, H * 0.18);
  }, [['PLANT PARENTHOOD', 0.2, 16, '#1b4332'], ['Monstera myths', 0.27, 12, '#40916c'], ['Never overwater again', 0.88, 11, '#1b4332']]),
  thread: magCover('THREAD', '#ffe5ec', '#111111', (ctx, W, H) => {
    vgrad(ctx, W, H, ['#ffe5ec', '#ffc2d1'], H * 0.2, H);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.38); ctx.lineTo(W * 0.68, H * 0.98); ctx.lineTo(W * 0.32, H * 0.98); ctx.fill();
    circle(ctx, W * 0.5, H * 0.33, 22, '#e0ac85'); ctx.fillStyle = '#3d2c1e'; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.31, 24, PI, 0); ctx.fill(); ctx.fillRect(W * 0.5 - 24, H * 0.31, 8, 40);
    ctx.fillStyle = '#ff006e'; ctx.fillRect(W * 0.38, H * 0.48, W * 0.24, 10);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(W * 0.47, H * 0.38, 2, 40);
  }, [['STREET STYLE NOW', 0.2, 16, '#ff006e'], ['The new denim', 0.27, 12, '#111'], ['Fits that slap', 0.86, 12, '#111']]),
};
// ---------------------------------------------------------------- art books
const ARTBOOK = {
  chromatic(ctx, W, H) {
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, W, H);
    const cols = ['#e63946', '#f77f00', '#fcbf49', '#80b918', '#2a9d8f', '#277da1', '#5a189a', '#ff70a6', '#3d405b'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(W * 0.1 + (i % 3) * W * 0.27, H * 0.25 + Math.floor(i / 3) * H * 0.2, W * 0.24, H * 0.17); });
    txt(ctx, 'CHROMATIC', W / 2, H * 0.1, 30, '#111', { weight: 900, max: W * 0.86 });
    txt(ctx, 'A CENTURY OF COLOR', W / 2, H * 0.17, 11, '#555', { weight: 600 });
  },
  concrete(ctx, W, H) {
    ctx.fillStyle = '#a8a8a8'; ctx.fillRect(0, 0, W, H);
    const r = seeded(5); for (let i = 0; i < 1500; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; ctx.fillRect(r() * W, r() * H, 2, 2); }
    ctx.fillStyle = '#6c757d'; ctx.fillRect(W * 0.15, H * 0.38, W * 0.7, H * 0.5); ctx.fillStyle = '#495057'; for (let r2 = 0; r2 < 4; r2++) for (let c = 0; c < 6; c++) ctx.fillRect(W * 0.19 + c * W * 0.105, H * 0.42 + r2 * H * 0.11, W * 0.07, H * 0.07);
    ctx.fillStyle = '#343a40'; ctx.fillRect(W * 0.08, H * 0.36, W * 0.84, H * 0.03);
    txt(ctx, 'BRUTAL', W * 0.08, H * 0.12, 34, '#1b1b1b', { align: 'left', weight: 900 }); txt(ctx, 'BEAUTY', W * 0.08, H * 0.22, 34, '#1b1b1b', { align: 'left', weight: 900 });
    txt(ctx, 'Concrete architecture 1950–1980', W * 0.08, H * 0.3, 10, '#1b1b1b', { align: 'left', weight: 600 });
  },
  catsworld(ctx, W, H) {
    ctx.fillStyle = '#fdf0d5'; ctx.fillRect(0, 0, W, H);
    const cats = ['#f4a261', '#2b2d42', '#adb5bd', '#fefae0'];
    cats.forEach((c, i) => { const x = W * (0.25 + (i % 2) * 0.5), y = H * (0.42 + Math.floor(i / 2) * 0.3); ctx.fillStyle = '#e9d8c4'; ctx.fillRect(x - 46, y - 46, 92, 92); circle(ctx, x, y + 10, 26, c); circle(ctx, x, y - 14, 20, c); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 18, y - 22); ctx.lineTo(x - 12, y - 42); ctx.lineTo(x - 4, y - 28); ctx.moveTo(x + 18, y - 22); ctx.lineTo(x + 12, y - 42); ctx.lineTo(x + 4, y - 28); ctx.fill(); circle(ctx, x - 7, y - 15, 2.5, c === '#2b2d42' ? '#ffd166' : '#1b1b1b'); circle(ctx, x + 7, y - 15, 2.5, c === '#2b2d42' ? '#ffd166' : '#1b1b1b'); });
    txt(ctx, 'CATS OF THE WORLD', W / 2, H * 0.1, 22, '#bc6c25', { weight: 900, max: W * 0.86, font: SERIF });
    txt(ctx, 'A photographic love letter', W / 2, H * 0.17, 10, '#7f5539', { weight: 600 });
  },
};

// ------------------------------------------------------------------ definitions
const NOVEL = (id, name, genre, author, price, color, ink, coverKey, desc, o = {}) => ({
  id, name, category: 'books', price, stores: o.stores || ['primo'], brand: author, emoji: '📖', rarity: o.rarity || 'common', desc,
  build: () => paintedBook({ key: id, title: name, author, color, ink, draw: COVERS[coverKey], t: o.t || 0.028, w: o.w || 0.135, h: o.h || 0.205, gloss: o.gloss }),
  use: { type: 'book', genre, author, pages: o.pages || 12 },
});
const COMIC = (id, name, coverKey, color, price, desc, palette, lines) => ({
  id, name, category: 'books', price, stores: ['primo', 'arthaus', 'kollectiv'], brand: 'Kapow Comics', emoji: '💥', desc,
  build: () => faceOut(paintedBook({ key: id, title: name, author: 'Kapow', color, ink: '#ffffff', draw: COVERS[coverKey], t: 0.004, w: 0.17, h: 0.26, gloss: true, pageC: '#fbf8ef' }), { w: 0.17, h: 0.26, t: 0.004, sleeve: true }),
  use: { type: 'comic', pages: 8, palette, lines },
});
const MAG = (id, name, magKey, color, price, desc, genre) => ({
  id, name, category: 'books', price, stores: ['primo', 'arthaus'], brand: name.split(' ')[0], emoji: '📰', desc,
  build: () => faceOut(paintedBook({ key: id, title: name, author: 'Monthly', color, ink: '#ffffff', draw: MAGS[magKey], t: 0.005, w: 0.21, h: 0.275, gloss: true, pageC: '#ffffff' }), { w: 0.21, h: 0.275, t: 0.005, stand: 'wire', lean: 0.24 }),
  use: { type: 'magazine', pages: 6, genre },
});
defineItems([
  NOVEL('book_cat_cafe_caper', 'The Cat Café Caper', 'Cozy Mystery', 'Pip Halloway', 13.99, '#1d5c63', '#fefae0', 'catcafe', 'Someone is stealing scones from the cat café, and the prime suspect has whiskers.'),
  NOVEL('book_death_by_bookmark', 'Death by Bookmark', 'Cozy Mystery', 'Agatha Crumpet', 12.99, '#6a040f', '#fefae0', 'bookmark', 'A bookshop owner, a missing first edition, and a very suspicious tote bag.', { t: 0.024 }),
  NOVEL('book_starlight_freighter', 'Starlight Freighter', 'Sci-Fi', 'Octavia Reyes', 16.99, '#301e67', '#5ef2ff', 'freighter', 'A rust-bucket cargo ship, a crew of misfits, and one crate that should not be opened.', { t: 0.034, pages: 14 }),
  NOVEL('book_last_signal', 'The Last Signal', 'Sci-Fi', 'J. T. Okafor', 15.99, '#005f73', '#e9d8a6', 'signal', 'An arctic radio astronomer hears a message from a star that died 400 years ago.'),
  NOVEL('book_teacup_wizard', 'The Teacup Wizard', 'Fantasy', 'Rowan Thistle', 14.99, '#3c096c', '#ffd166', 'teacup', 'An apprentice wizard whose only spell makes tea must somehow save the kingdom.', { pages: 14 }),
  NOVEL('book_dragon_willowmere', 'Dragon of Willowmere', 'Fantasy', 'Rowan Thistle', 27.99, '#1b4332', '#fefae0', 'dragon', 'Hardcover epic: a sleepy village, an ancient dragon, and a very long nap interrupted.', { t: 0.045, w: 0.155, h: 0.235, pages: 18, rarity: 'uncommon' }),
  NOVEL('book_love_first_latte', 'Love at First Latte', 'Romance', 'Sunny Daye', 11.99, '#ff8fab', '#9d174d', 'latte', 'Two baristas, one espresso machine, and a rivalry that froths into something more.', { t: 0.022, gloss: true }),
  NOVEL('book_rooftop_summer', 'Rooftop Summer', 'Romance', 'Marisol Vega', 13.99, '#ff7b54', '#6a040f', 'rooftop', 'String lights, a heatwave and the neighbor who keeps borrowing your ladder.', { gloss: true }),
  NOVEL('book_art_staying_in', 'The Art of Staying In', 'Self-Help', 'Dr. Hygge Larsen', 18.99, '#f4ede1', '#3d405b', 'stayin', 'A gentle guide to rituals, rest and loving your four walls. Highly relevant.', { t: 0.024 }),
  NOVEL('book_tiny_habits', 'Tiny Habits, Cozy Life', 'Self-Help', 'June Okonkwo', 16.99, '#344e41', '#fefae0', 'habits', 'Water a plant. Light a candle. Make tea. Repeat. Small steps to a softer life.', { t: 0.02 }),
  NOVEL('book_apartment_4b', 'Apartment 4B', 'Literary Fiction', 'Mara Vell', 17.99, '#4a5568', '#fefae0', 'apartment', 'A quiet novel about the lives behind one lit window in a sleeping city.', { stores: ['primo', 'arthaus'] }),
  NOVEL('book_small_hours', 'Small Hours', 'Poetry', 'Elias Moon', 14.99, '#14213d', '#fca311', 'smallhours', 'Poems for insomniacs, night owls and anyone who has watched the moon from a kitchen.', { t: 0.014, w: 0.13, h: 0.19, pages: 8, stores: ['arthaus', 'primo'] }),
  // -------------------------------------------------------------- comics
  COMIC('comic_captain_cosmo', 'Captain Cosmo #1', 'cosmo', '#03045e', 4.99, 'The origin of the galaxy\'s most polite superhero. Cape included (drawn).', ['#03045e', '#7209b7', '#e63946', '#ffd60a', '#3a86ff'], ['To the stars!', 'Not on my watch, Dr. Void!', 'ZOOOOM!', 'Did you remember the snacks?', 'KA-BLAM!', 'The galaxy needs us.', 'Please, call me Cosmo.']),
  COMIC('comic_pizza_ninjas', 'Pizza Ninjas #7', 'ninjas', '#ff9f1c', 3.99, 'Two ninjas, infinite pepperoni shuriken. Delivery in 30 minutes or less.', ['#ff9f1c', '#e63946', '#2a9d8f', '#f4d35e', '#1b1b1b'], ['HI-YAH!', 'Extra cheese, extra justice!', 'SHWING!', 'That\'s nacho pizza!', 'Delivery for… DANGER.', 'CHOMP!', 'Cowabunga, but legally distinct!']),
  COMIC('comic_moth_girl', 'Moth Girl #12', 'mothgirl', '#3c096c', 4.99, 'She\'s drawn to the light — and to justice. The rooftop chase you\'ve been waiting for.', ['#10002b', '#3c096c', '#c77dff', '#ffd166', '#240046'], ['FLUTTER!', 'The porch lights are calling…', 'Not tonight, Lampkeeper!', 'WHOOSH!', 'Every light has a shadow.', 'Wings out!']),
  COMIC('comic_robo_pals', 'Robo Pals #3', 'robopals', '#3a86ff', 3.99, 'Two tiny robots learn about friendship, oil changes, and feelings.', ['#90e0ef', '#ff595e', '#ffca3a', '#3a86ff', '#e9ecef'], ['BEEP BOOP!', 'Friendship.exe loaded!', 'Do robots dream of oil?', 'BZZT!', 'High five! *clank*', 'Best pals forever (warranty included).']),
  // -------------------------------------------------------------- magazines
  MAG('mag_nest', 'Nest — The Cozy Issue', 'nest', '#7f187f', 6.99, 'Home & interiors monthly: forty-seven ways to make your place feel like a hug.', 'Home & Design'),
  MAG('mag_pixel', 'Pixel — Gaming Monthly', 'pixel', '#10002b', 7.99, 'Reviews, cheats and an exclusive Star Blaster high-score guide.', 'Gaming'),
  MAG('mag_bloom', 'Bloom — Plant Parenthood', 'bloom', '#1b4332', 6.49, 'Everything about houseplants, from monsteras to the one you keep forgetting to water.', 'Gardening'),
  MAG('mag_thread', 'Thread — Street Style', 'thread', '#ff006e', 7.49, 'Fashion monthly: the new denim, the best sneakers, and fits that slap.', 'Fashion'),
  // -------------------------------------------------------------- coffee-table art books
  { id: 'artbook_chromatic', name: 'Chromatic: A Century of Color', category: 'books', price: 59, stores: ['arthaus'], rarity: 'uncommon', brand: 'ArtHaus Press', emoji: '🎨', desc: 'An enormous coffee-table book of color in art and design. Makes any table look curated.', build: () => paintedBook({ key: 'artbook_chromatic', title: 'Chromatic', author: 'ArtHaus', color: '#111111', ink: '#ffffff', draw: ARTBOOK.chromatic, w: 0.25, h: 0.3, t: 0.042, gloss: true }), use: { type: 'book', genre: 'Art', author: 'ArtHaus Press', pages: 10 } },
  { id: 'artbook_brutal_beauty', name: 'Brutal Beauty', category: 'books', price: 49, stores: ['arthaus'], brand: 'ArtHaus Press', emoji: '🏛️', desc: 'Concrete architecture photographed with love. Heavy in every sense.', build: () => paintedBook({ key: 'artbook_brutal_beauty', title: 'Brutal Beauty', author: 'ArtHaus', color: '#6c757d', ink: '#ffffff', draw: ARTBOOK.concrete, w: 0.24, h: 0.3, t: 0.038 }), use: { type: 'book', genre: 'Architecture', author: 'ArtHaus Press', pages: 10 } },
  { id: 'artbook_cats_world', name: 'Cats of the World', category: 'books', price: 39, stores: ['arthaus', 'primo'], brand: 'ArtHaus Press', emoji: '🐈', desc: 'Three hundred pages of extremely photogenic cats from every continent.', build: () => paintedBook({ key: 'artbook_cats_world', title: 'Cats of the World', author: 'ArtHaus', color: '#bc6c25', ink: '#fdf0d5', draw: ARTBOOK.catsworld, w: 0.26, h: 0.26, t: 0.032, gloss: true }), use: { type: 'book', genre: 'Photography', author: 'ArtHaus Press', pages: 10 } },
  // a cheap classic using the shared bookModel
  { id: 'book_pocket_classics', name: 'Pocket Classics: Short Stories', category: 'books', price: 8.99, stores: ['primo', 'arthaus'], brand: 'Penny Press', emoji: '📕', desc: 'A dog-eared paperback of timeless short stories. Fits in any coat pocket.', build: () => bookModel({ color: '#9b2226', accent: '#e9d8a6', title: 'Pocket Classics', author: 'Various', style: 2, w: 0.11, h: 0.175, t: 0.022, key: 'pocketclassics' }), use: { type: 'book', genre: 'Classics', author: 'Various', pages: 10 } },
]);
void mesh;
