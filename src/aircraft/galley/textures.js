// Procedural canvas artwork for the galley / lavatory / door module:
//   * a 2048² placard atlas (lav, galley, door, cockpit door and crew placards,
//     cart branding, magazine covers, keypad face, door instructions ...)
//   * a 1024² glow atlas (lit signs, indicator LEDs, oven timers, diffusers)
//   * a fabric weave normal map
//   * the forward attendant panel (FAP) touchscreen (redrawn on state change)
// Every entry returns an atlas rectangle [u0, v0, u1, v1] for geom.js uvRect.
import * as THREE from 'three';
import { AIRLINE } from '../../core/constants.js';
import { rng } from '../../core/util.js';

const FONT = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";
const COND = "'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";
const RED = '#c4161c', AMBER = '#f2a900', GREEN = '#1b8a3a', NAVY = AIRLINE.colors.primary, TEAL = AIRLINE.colors.secondary, GOLD = AIRLINE.colors.accent;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function text(ctx, s, x, y, size, color = '#111', { align = 'center', weight = '700', font = FONT, base = 'middle', maxW = 0 } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  if (maxW) ctx.fillText(s, x, y, maxW); else ctx.fillText(s, x, y);
}
function lines(ctx, arr, x, y, size, lh, color, opts = {}) { arr.forEach((s, i) => text(ctx, s, x, y + i * lh, size, color, opts)); }
/** Slightly aged label background: off-white with a faint border, grime and a tiny print grain. */
function label(ctx, w, h, { bg = '#f4f2ec', border = '#2a2a2a', bw = 3, r = 8, seed = 1, grime = 0.05 } = {}) {
  ctx.fillStyle = border; rr(ctx, 0, 0, w, h, r); ctx.fill();
  ctx.fillStyle = bg; rr(ctx, bw, bw, w - 2 * bw, h - 2 * bw, Math.max(1, r - bw)); ctx.fill();
  const R = rng(seed);
  ctx.save();
  for (let i = 0; i < 18; i++) {
    ctx.globalAlpha = grime * R(); ctx.fillStyle = '#6b6457';
    ctx.beginPath(); ctx.arc(R() * w, R() * h, 2 + R() * Math.min(w, h) * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function noSmokingIcon(ctx, cx, cy, r, lw = 0) {
  lw = lw || r * 0.16;
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // cigarette
  ctx.fillStyle = '#111'; ctx.fillRect(cx - r * 0.62, cy - r * 0.02, r * 0.95, r * 0.2);
  ctx.fillRect(cx + r * 0.38, cy - r * 0.02, r * 0.14, r * 0.2);
  ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.moveTo(cx + r * 0.6, cy - r * 0.08); ctx.bezierCurveTo(cx + r * 0.5, cy - r * 0.3, cx + r * 0.72, cy - r * 0.38, cx + r * 0.62, cy - r * 0.58); ctx.stroke();
  // ring + slash
  ctx.strokeStyle = RED; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - (r - lw) * 0.72, cy - (r - lw) * 0.72); ctx.lineTo(cx + (r - lw) * 0.72, cy + (r - lw) * 0.72); ctx.stroke();
  ctx.restore();
}
function person(ctx, cx, cy, s, color, skirt = false) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.78, s * 0.13, 0, Math.PI * 2); ctx.fill();
  if (skirt) { ctx.beginPath(); ctx.moveTo(cx - s * 0.14, cy - s * 0.6); ctx.lineTo(cx + s * 0.14, cy - s * 0.6); ctx.lineTo(cx + s * 0.28, cy + s * 0.05); ctx.lineTo(cx - s * 0.28, cy + s * 0.05); ctx.fill(); }
  else rr(ctx, cx - s * 0.2, cy - s * 0.6, s * 0.4, s * 0.62, s * 0.08), ctx.fill();
  ctx.fillRect(cx - s * 0.16, cy, s * 0.12, s * 0.5); ctx.fillRect(cx + s * 0.04, cy, s * 0.12, s * 0.5);
}

class Atlas {
  constructor(W, H, bg = null) {
    this.W = W; this.H = H; this.c = canvas(W, H); this.ctx = this.c.getContext('2d');
    if (bg) { this.ctx.fillStyle = bg; this.ctx.fillRect(0, 0, W, H); }
    this.x = 0; this.y = 0; this.rowH = 0; this.rects = {};
  }
  add(name, w, h, draw) {
    const pad = 4;
    if (this.x + w + pad > this.W) { this.x = 0; this.y += this.rowH + pad; this.rowH = 0; }
    if (this.y + h > this.H) { console.warn('[galley] atlas full', name); return; }
    const { ctx } = this;
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    try { draw(ctx, w, h); } catch (e) { console.warn('[galley] atlas draw failed', name, e); }
    ctx.restore();
    const ix = 1.5, iy = 1.5;
    this.rects[name] = [(this.x + ix) / this.W, 1 - (this.y + h - iy) / this.H, (this.x + w - ix) / this.W, 1 - (this.y + iy) / this.H];
    this.x += w + pad; this.rowH = Math.max(this.rowH, h);
  }
  rect(name) { return this.rects[name] || this.rects.white || [0, 0, 0.001, 0.001]; }
  texture(maxAniso) {
    const t = new THREE.CanvasTexture(this.c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
}

export function createTextures(app) {
  const aniso = app.assets?.maxAnisotropy || 4;
  const P = new Atlas(2048, 3072, '#f2f0ea');
  const G = new Atlas(1024, 1024, '#000');
  buildPlacards(P);
  buildGlow(G);
  const atlas = P.texture(aniso);
  const glow = G.texture(aniso);
  const weaveNormal = weave(aniso);
  const fap = createFap(aniso);
  return {
    atlas, glow, weaveNormal,
    fapTexture: fap.texture, fap,
    rect: (n) => P.rect(n),
    glowRect: (n) => G.rect(n),
  };
}

// =============================================================================== placards
function buildPlacards(A) {
  A.add('white', 32, 32, (c, w, h) => { c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h); });
  A.add('black', 32, 32, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); });
  A.add('red', 32, 32, (c, w, h) => { c.fillStyle = RED; c.fillRect(0, 0, w, h); });

  // ---------------------------------------------------------------- lavatory
  A.add('noSmoking', 256, 256, (c, w, h) => { label(c, w, h, { r: 18, bw: 4, seed: 3, border: '#bbb' }); noSmokingIcon(c, w / 2, h / 2, 104); });
  A.add('lavNoSmoke', 512, 200, (c, w, h) => {
    label(c, w, h, { seed: 4 });
    noSmokingIcon(c, 96, h / 2, 72);
    lines(c, ['NO SMOKING', 'IN LAVATORY'], 340, 70, 46, 56, '#111', { font: COND });
    text(c, 'FEDERAL LAW PROHIBITS SMOKING', 340, 168, 19, '#333', { weight: '600' });
  });
  A.add('smokeDetector', 512, 170, (c, w, h) => {
    label(c, w, h, { seed: 5, bg: '#fbfaf5' });
    lines(c, ['FEDERAL LAW PROVIDES FOR A PENALTY OF UP TO $2,000', 'FOR TAMPERING WITH, DISABLING OR DESTROYING', 'THE SMOKE DETECTOR INSTALLED IN THIS LAVATORY'], w / 2, 42, 21, 30, '#111', { weight: '700', font: COND });
    text(c, 'Il est interdit de fumer / Rauchen verboten', w / 2, 140, 18, '#444', { weight: '500' });
  });
  A.add('water', 512, 100, (c, w, h) => {
    label(c, w, h, { seed: 6 });
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(60, 22); c.bezierCurveTo(78, 46, 84, 58, 84, 66); c.arc(60, 66, 24, 0, Math.PI); c.bezierCurveTo(36, 58, 42, 46, 60, 22); c.fill();
    c.strokeStyle = RED; c.lineWidth = 7; c.beginPath(); c.arc(60, 54, 38, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(34, 28); c.lineTo(86, 80); c.stroke();
    lines(c, ['WATER NOT SUITABLE', 'FOR DRINKING'], 300, 36, 32, 36, '#111', { font: COND });
  });
  A.add('towels', 256, 70, (c, w, h) => { label(c, w, h, { bg: '#e9e9e6', seed: 7 }); text(c, 'TOWELS', w / 2, h / 2 + 2, 40, '#222', { font: COND }); });
  A.add('push', 256, 110, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h); label(c, w, h, { bg: '#dcdcd8', seed: 8, border: '#999' });
    text(c, 'PUSH', w / 2, 44, 46, '#222', { font: COND }); text(c, 'TOWEL DISPOSAL', w / 2, 86, 24, '#444', { font: COND });
  });
  A.add('flush', 160, 160, (c, w, h) => {
    c.fillStyle = '#c9ccce'; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 76); g.addColorStop(0, '#2f6fb5'); g.addColorStop(0.85, '#1d4f8a'); g.addColorStop(1, '#0d2c50');
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, 76, 0, Math.PI * 2); c.fill();
    text(c, 'FLUSH', w / 2, h / 2 + 2, 36, '#fff', { font: COND });
  });
  A.add('call', 160, 160, (c, w, h) => {
    c.fillStyle = '#2b2d30'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8e6e0'; c.beginPath(); c.arc(w / 2, h / 2 - 8, 50, 0, Math.PI * 2); c.fill();
    person(c, w / 2, h / 2 + 2, 70, '#2b2d30', true);
    text(c, 'ATTENDANT CALL', w / 2, h - 16, 17, '#eee', { font: COND });
  });
  A.add('baby', 512, 260, (c, w, h) => {
    label(c, w, h, { seed: 9, bg: '#f3f2ee', border: '#c9c9c4' });
    c.fillStyle = '#1f5e9a'; rr(c, 30, 30, 200, 200, 22); c.fill();
    // adult + baby on table pictogram
    c.fillStyle = '#fff'; c.fillRect(56, 150, 150, 14);
    c.beginPath(); c.arc(90, 134, 13, 0, Math.PI * 2); c.fill(); rr(c, 100, 126, 80, 22, 10); c.fill();
    c.beginPath(); c.arc(170, 62, 17, 0, Math.PI * 2); c.fill(); rr(c, 158, 80, 26, 70, 8); c.fill();
    c.fillRect(150, 100, 26, 10);
    lines(c, ['BABY CHANGING', 'TABLE', 'MAX 16 kg / 35 lb', 'PULL DOWN TO OPEN'], 370, 70, 32, 44, '#222', { font: COND });
  });
  A.add('lavSign', 256, 256, (c, w, h) => {
    label(c, w, h, { bg: '#ecebe6', border: '#888', r: 14, seed: 10 });
    person(c, 86, 150, 120, '#333'); person(c, 170, 150, 120, '#333', true);
    c.fillStyle = '#333'; c.fillRect(126, 40, 4, 170);
    text(c, 'LAVATORY', w / 2, 232, 26, '#333', { font: COND });
  });
  A.add('lockFlag', 256, 64, (c, w, h) => {
    c.fillStyle = '#1d8a3c'; c.fillRect(0, 0, w / 2, h); c.fillStyle = '#c5161d'; c.fillRect(w / 2, 0, w / 2, h);
    text(c, 'VACANT', w / 4, h / 2 + 1, 30, '#fff', { font: COND }); text(c, 'OCCUPIED', 3 * w / 4, h / 2 + 1, 28, '#fff', { font: COND });
  });
  A.add('lockLabel', 256, 70, (c, w, h) => { c.fillStyle = '#c3c6c8'; c.fillRect(0, 0, w, h); text(c, '◀  LOCK', w / 2, h / 2, 34, '#222', { font: COND }); });
  A.add('ashtray', 256, 96, (c, w, h) => { c.fillStyle = '#bfc2c4'; c.fillRect(0, 0, w, h); text(c, 'ASHTRAY', w / 2, h / 2, 40, '#2a2a2a', { font: COND }); });
  A.add('oxygen', 512, 110, (c, w, h) => { label(c, w, h, { seed: 11, border: '#aaa' }); lines(c, ['OXYGEN MASKS', 'PULL MASK DOWN TO START FLOW'], w / 2, 36, 30, 40, '#222', { font: COND }); });
  A.add('soap', 192, 64, (c, w, h) => { c.fillStyle = '#e4e4e0'; c.fillRect(0, 0, w, h); text(c, 'SOAP', w / 2, h / 2, 34, '#333', { font: COND }); });
  A.add('returnPlacard', 384, 96, (c, w, h) => { label(c, w, h, { seed: 12 }); text(c, 'RETURN TO SEAT', w / 2, h / 2, 40, '#222', { font: COND }); });
  A.add('grime', 256, 256, (c, w, h) => {
    c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h);
    const R = rng(13);
    for (let i = 0; i < 200; i++) { c.globalAlpha = 0.05 * R(); c.fillStyle = '#7a705e'; c.beginPath(); c.arc(R() * w, R() * h, 3 + R() * 20, 0, Math.PI * 2); c.fill(); }
  });

  // ---------------------------------------------------------------- galley
  A.add('cart', 512, 300, (c, w, h) => {
    // aluminium cart door: a branded panel with a navy stripe + the airline wordmark
    c.fillStyle = '#d8dadc'; c.fillRect(0, 0, w, h);
    c.fillStyle = NAVY; c.fillRect(0, 0, w, 120);
    c.fillStyle = TEAL; c.fillRect(0, 120, w, 14);
    c.fillStyle = GOLD; c.fillRect(0, 134, w, 5);
    // stylised halcyon bird
    c.save(); c.translate(84, 60); c.fillStyle = GOLD;
    c.beginPath(); c.moveTo(-40, 8); c.quadraticCurveTo(-6, -36, 40, -24); c.quadraticCurveTo(6, -14, -6, 18); c.quadraticCurveTo(-20, 18, -40, 8); c.fill();
    c.restore();
    text(c, AIRLINE.name.toUpperCase(), 300, 60, 46, '#f3f1ea', { font: COND, weight: '700' });
    text(c, 'ATLAS STD · FULL SIZE · MAX GROSS 85 kg', w / 2, 190, 24, '#333', { font: COND, weight: '700' });
    text(c, 'P/N 7210-112-04   S/N 0' + 41837, w / 2, 224, 20, '#444', { font: COND, weight: '500' });
    c.fillStyle = '#e8e8e8'; rr(c, 150, 248, 212, 40, 6); c.fill(); c.strokeStyle = '#555'; c.lineWidth = 2; c.stroke();
    text(c, 'BRAKE ON / OFF', w / 2, 268, 22, '#222', { font: COND });
    const R = rng(14);
    for (let i = 0; i < 40; i++) { c.globalAlpha = 0.25 * R(); c.strokeStyle = '#888'; c.lineWidth = 1 + R(); const x0 = R() * w, y0 = R() * h; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + 10 + R() * 50, y0 + (R() - 0.5) * 6); c.stroke(); }
    c.globalAlpha = 1;
  });
  A.add('cartFlag', 128, 64, (c, w, h) => { c.fillStyle = GREEN; c.fillRect(0, 0, w, h); text(c, 'BRAKE', w / 2, h / 2, 26, '#fff', { font: COND }); });
  A.add('cartBrakeRed', 128, 64, (c, w, h) => { c.fillStyle = RED; c.fillRect(0, 0, w, h); text(c, 'BRAKE', w / 2, h / 2, 26, '#fff', { font: COND }); });
  const tag = (name, s, w = 256, h = 64, bg = '#1d1f22', fg = '#e9e7e1', size = 32) => A.add(name, w, h, (c) => {
    c.fillStyle = bg; rr(c, 0, 0, w, h, 6); c.fill(); text(c, s, w / 2, h / 2 + 1, size, fg, { font: COND });
  });
  tag('oven1', 'OVEN 1'); tag('oven2', 'OVEN 2'); tag('oven3', 'OVEN 3'); tag('oven4', 'OVEN 4');
  tag('coffee', 'COFFEE MAKER'); tag('boiler', 'WATER BOILER'); tag('chiller', 'AIR CHILLER'); tag('compactor', 'TRASH COMPACTOR', 320, 64, '#1d1f22', '#e9e7e1', 30);
  tag('waste', 'WASTE', 192, 56); tag('galleyPower', 'GALLEY POWER', 256, 56, '#1d1f22', '#e9e7e1', 28);
  tag('stowage', 'STOWAGE', 192, 56, '#cfd1cf', '#222', 30);
  tag('g1', 'G1', 96, 64, NAVY, '#fff', 40); tag('g4', 'G4', 96, 64, NAVY, '#fff', 40);
  tag('drawer', 'STANDARD UNIT', 256, 56, '#cfd1cf', '#222', 28);
  tag('coats', 'CREW COATS', 256, 56, '#cfd1cf', '#222', 30);
  tag('interphone', 'INTERPHONE', 256, 56);
  tag('flashlight', 'FLASHLIGHT', 256, 56, '#cfd1cf', '#222', 30);
  tag('megaphone', 'MEGAPHONE', 256, 56, '#cfd1cf', '#222', 30);
  A.add('secure', 512, 96, (c, w, h) => { label(c, w, h, { border: RED, bw: 5, seed: 15 }); lines(c, ['SECURE ALL ITEMS FOR', 'TAXI, TAKEOFF AND LANDING'], w / 2, 32, 30, 34, RED, { font: COND }); });
  A.add('maxLoad', 256, 64, (c, w, h) => { label(c, w, h, { seed: 16 }); text(c, 'MAX LOAD 25 kg / 55 lb', w / 2, h / 2, 24, '#222', { font: COND }); });
  A.add('hot', 256, 96, (c, w, h) => {
    c.fillStyle = AMBER; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10);
    lines(c, ['CAUTION', 'HOT SURFACE'], w / 2, 36, 28, 30, '#111', { font: COND });
  });
  A.add('latch', 160, 60, (c, w, h) => { c.fillStyle = '#d2d4d2'; c.fillRect(0, 0, w, h); text(c, 'PUSH ▸ OPEN', w / 2, h / 2, 24, '#222', { font: COND }); });
  A.add('firstAid', 256, 140, (c, w, h) => {
    label(c, w, h, { bg: '#f7f7f4', seed: 17 });
    c.fillStyle = '#16884a'; rr(c, 20, 26, 88, 88, 10); c.fill(); c.fillStyle = '#fff'; c.fillRect(54, 38, 20, 64); c.fillRect(32, 60, 64, 20);
    lines(c, ['FIRST AID', 'KIT'], 180, 54, 34, 38, '#111', { font: COND });
  });
  A.add('pbe', 256, 140, (c, w, h) => {
    label(c, w, h, { bg: AMBER, border: '#111', seed: 18 });
    lines(c, ['PBE', 'PROTECTIVE', 'BREATHING EQUIP.'], w / 2, 34, 30, 34, '#111', { font: COND });
  });
  A.add('extinguisher', 256, 140, (c, w, h) => {
    label(c, w, h, { bg: '#fbfbf8', border: RED, bw: 6, seed: 19 });
    lines(c, ['FIRE', 'EXTINGUISHER', 'HALON 1211'], w / 2, 36, 30, 34, RED, { font: COND });
  });
  A.add('extLabel', 256, 200, (c, w, h) => {
    c.fillStyle = '#c2181f'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f6f3ea'; rr(c, 16, 16, w - 32, h - 32, 8); c.fill();
    lines(c, ['HALON 1211', 'BCF', '1. PULL PIN', '2. AIM AT BASE', '3. SQUEEZE'], w / 2, 40, 22, 30, '#111', { font: COND });
  });
  A.add('emergencyEquip', 256, 120, (c, w, h) => {
    label(c, w, h, { bg: '#f7f7f4', seed: 20 });
    lines(c, ['EMERGENCY', 'EQUIPMENT'], w / 2, 42, 32, 38, RED, { font: COND });
  });
  A.add('jumpseat', 384, 80, (c, w, h) => { label(c, w, h, { seed: 21 }); lines(c, ['ATTENDANT SEAT', 'SEAT MUST BE STOWED WHEN NOT OCCUPIED'], w / 2, 26, 22, 28, '#222', { font: COND }); });
  A.add('cb', 512, 300, (c, w, h) => {
    c.fillStyle = '#26292c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d8d8d8'; c.lineWidth = 2; c.strokeRect(10, 10, w - 20, h - 20);
    text(c, 'GALLEY CIRCUIT BREAKERS', w / 2, 30, 24, '#eee', { font: COND });
    const labels = ['OVEN 1', 'OVEN 2', 'BOILER', 'COFFEE', 'CHILLER', 'LIGHTS', 'COMPACT', 'OUTLET'];
    for (let i = 0; i < 8; i++) {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 70 + col * 124, y = 100 + row * 110;
      text(c, labels[i], x, y - 34, 19, '#ddd', { font: COND });
      c.fillStyle = '#111'; c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#aaa'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2); c.stroke();
      text(c, i % 3 === 0 ? '15' : '10', x, y + 40, 16, '#bbb', { font: COND });
    }
  });
  A.add('logoPanel', 512, 160, (c, w, h) => {
    c.fillStyle = NAVY; c.fillRect(0, 0, w, h);
    c.save(); c.translate(90, 80); c.fillStyle = GOLD;
    c.beginPath(); c.moveTo(-56, 12); c.quadraticCurveTo(-8, -50, 56, -34); c.quadraticCurveTo(8, -20, -8, 26); c.quadraticCurveTo(-28, 26, -56, 12); c.fill();
    c.restore();
    text(c, AIRLINE.name, 310, 80, 54, '#f3f1ea', { font: FONT, weight: '300' });
  });

  // ---------------------------------------------------------------- doors
  A.add('doorInstr', 512, 400, (c, w, h) => {
    label(c, w, h, { bg: '#f6f4ee', border: '#222', bw: 4, seed: 22 });
    c.fillStyle = RED; c.fillRect(4, 4, w - 8, 64);
    text(c, 'EMERGENCY OPERATION', w / 2, 37, 38, '#fff', { font: COND });
    const steps = ['1  VERIFY GIRT BAR IN FLOOR BRACKETS', '2  ROTATE HANDLE FULLY IN DIRECTION', '    OF ARROW', '3  PUSH DOOR OUT – SLIDE INFLATES', '    AUTOMATICALLY', '4  IF SLIDE DOES NOT INFLATE', '    PULL MANUAL INFLATION HANDLE'];
    steps.forEach((s, i) => text(c, s, 24, 104 + i * 40, 27, '#111', { align: 'left', font: COND }));
  });
  A.add('doorArrow', 256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#c8cacb'; c.fillRect(0, 0, w, h);
    c.strokeStyle = RED; c.lineWidth = 18; c.beginPath(); c.arc(w / 2, h / 2, 86, Math.PI * 0.95, Math.PI * 1.95); c.stroke();
    c.fillStyle = RED; c.beginPath(); const a = Math.PI * 1.95, x = w / 2 + 86 * Math.cos(a), y = h / 2 + 86 * Math.sin(a); c.moveTo(x - 26, y - 22); c.lineTo(x + 28, y - 4); c.lineTo(x - 4, y + 34); c.fill();
    text(c, 'OPEN', w / 2, h / 2 + 50, 46, RED, { font: COND });
  });
  A.add('girtBar', 512, 110, (c, w, h) => {
    c.fillStyle = AMBER; c.fillRect(0, 0, w, h);
    for (let i = -2; i < 20; i++) { c.fillStyle = '#111'; c.beginPath(); c.moveTo(i * 40, 0); c.lineTo(i * 40 + 20, 0); c.lineTo(i * 40 - 10, h); c.lineTo(i * 40 - 30, h); c.fill(); }
    c.fillStyle = '#f5f2e8'; rr(c, 30, 18, w - 60, h - 36, 8); c.fill();
    lines(c, ['GIRT BAR – ATTACH TO FLOOR BRACKETS', 'WHEN SLIDE IS ARMED'], w / 2, 40, 24, 30, '#111', { font: COND });
  });
  A.add('slideFlag', 512, 72, (c, w, h) => {
    for (let i = -2; i < 22; i++) { c.fillStyle = i % 2 ? '#e8101a' : '#f6c400'; c.beginPath(); c.moveTo(i * 30, 0); c.lineTo(i * 30 + 30, 0); c.lineTo(i * 30 + 6, h); c.lineTo(i * 30 - 24, h); c.fill(); }
    c.fillStyle = '#e8101a'; rr(c, 120, 10, 272, 52, 6); c.fill();
    text(c, 'SLIDE ARMED', w / 2, h / 2 + 1, 36, '#fff', { font: COND });
  });
  A.add('armedInd', 256, 96, (c, w, h) => {
    c.fillStyle = '#c5161d'; c.fillRect(0, 0, w / 2, h); c.fillStyle = '#e9e8e2'; c.fillRect(w / 2, 0, w / 2, h);
    text(c, 'ARMED', w / 4, h / 2, 30, '#fff', { font: COND }); text(c, 'DISARMED', 3 * w / 4, h / 2, 26, '#1a1a1a', { font: COND });
  });
  A.add('bustle', 512, 128, (c, w, h) => {
    c.fillStyle = '#c4c6c5'; c.fillRect(0, 0, w, h);
    text(c, 'EMERGENCY ESCAPE SLIDE', w / 2, 40, 34, '#222', { font: COND });
    text(c, 'DO NOT STOW ITEMS AGAINST DOOR', w / 2, 86, 24, '#333', { font: COND });
  });
  A.add('manual', 384, 64, (c, w, h) => { c.fillStyle = RED; c.fillRect(0, 0, w, h); text(c, 'MANUAL INFLATION', w / 2, h / 2, 30, '#fff', { font: COND }); });
  A.add('assist', 256, 56, (c, w, h) => { label(c, w, h, { seed: 23 }); text(c, 'ASSIST HANDLE', w / 2, h / 2, 26, '#222', { font: COND }); });
  for (const id of ['L1', 'R1', 'L2', 'R2']) A.add('door' + id, 128, 128, (c, w, h) => { c.fillStyle = '#2b2f33'; rr(c, 0, 0, w, h, 14); c.fill(); text(c, id, w / 2, h / 2 + 3, 64, '#f0eee8', { font: COND }); });
  A.add('doorWarn', 512, 96, (c, w, h) => { label(c, w, h, { border: RED, bw: 5, seed: 24 }); lines(c, ['ATTENTION – CHECK SLIDE ARMING', 'BEFORE OPENING DOOR'], w / 2, 32, 28, 32, RED, { font: COND }); });

  // ---------------------------------------------------------------- cockpit door
  A.add('crewOnly', 512, 170, (c, w, h) => {
    label(c, w, h, { bg: '#f5f3ee', border: '#1b1b1b', bw: 5, seed: 25 });
    text(c, 'FLIGHT DECK', w / 2, 58, 58, '#151515', { font: COND });
    c.fillStyle = RED; c.fillRect(30, 96, w - 60, 4);
    text(c, 'CREW ONLY', w / 2, 132, 40, RED, { font: COND });
  });
  A.add('keypad', 256, 340, (c, w, h) => {
    c.fillStyle = '#1b1d1f'; c.fillRect(0, 0, w, h);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    keys.forEach((k, i) => {
      const x = 40 + (i % 3) * 88, y = 70 + Math.floor(i / 3) * 70;
      const g = c.createLinearGradient(x - 30, y - 24, x + 30, y + 24); g.addColorStop(0, '#d9dbdc'); g.addColorStop(1, '#9fa3a6');
      c.fillStyle = g; rr(c, x - 28, y - 24, 56, 48, 8); c.fill();
      text(c, k, x, y + 2, 30, '#222', { font: FONT });
    });
    text(c, 'ENTRY REQUEST', w / 2, 24, 20, '#ddd', { font: COND });
  });
  A.add('decomp', 256, 64, (c, w, h) => { c.fillStyle = '#c9cac6'; c.fillRect(0, 0, w, h); text(c, 'DECOMPRESSION PANEL', w / 2, h / 2, 22, '#333', { font: COND }); });
  A.add('louvre', 256, 128, (c, w, h) => {
    c.fillStyle = '#c4c5c1'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { c.fillStyle = '#5a5c5c'; c.fillRect(14, 10 + i * 13, w - 28, 6); c.fillStyle = '#e4e4df'; c.fillRect(14, 16 + i * 13, w - 28, 2); }
  });

  // ---------------------------------------------------------------- reading material (magazine rack)
  A.add('mag1', 192, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b6d8f'); g.addColorStop(0.6, '#e7a65a'); g.addColorStop(1, '#3a2c2a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(140, 130, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1b1b1b'; c.beginPath(); c.moveTo(0, 210); c.lineTo(50, 168); c.lineTo(90, 190); c.lineTo(140, 150); c.lineTo(192, 196); c.lineTo(192, 256); c.lineTo(0, 256); c.fill();
    text(c, 'SKYWARD', w / 2, 34, 40, '#fff', { font: COND });
    text(c, 'Coastal escapes', 14, 72, 16, '#fff', { align: 'left', weight: '600' });
    text(c, 'HALCYON INFLIGHT', w / 2, 242, 13, '#eee', { weight: '600' });
  });
  A.add('mag2', 192, 256, (c, w, h) => {
    c.fillStyle = '#101418'; c.fillRect(0, 0, w, h);
    c.fillStyle = GOLD; c.fillRect(0, 0, w, 52);
    text(c, 'DUTY FREE', w / 2, 27, 34, '#111', { font: COND });
    const R = rng(26);
    for (let i = 0; i < 5; i++) { c.fillStyle = `hsl(${R() * 360},45%,55%)`; rr(c, 20 + (i % 3) * 56, 76 + Math.floor(i / 3) * 90, 40, 70, 8); c.fill(); }
    text(c, 'Spring collection', w / 2, 238, 16, '#ddd', { weight: '500' });
  });
  A.add('mag3', 192, 256, (c, w, h) => {
    c.fillStyle = '#f1efe7'; c.fillRect(0, 0, w, h);
    text(c, 'The Port Solano', w / 2, 22, 16, '#222', { font: 'Georgia, serif', weight: '700' });
    text(c, 'Herald', w / 2, 46, 30, '#111', { font: 'Georgia, serif', weight: '700' });
    c.fillStyle = '#111'; c.fillRect(10, 64, w - 20, 2);
    const R = rng(27);
    c.fillStyle = '#9a9890'; c.fillRect(10, 74, 110, 70);
    for (let i = 0; i < 26; i++) { c.fillStyle = '#6d6b66'; c.fillRect(i < 10 ? 128 : 10, 76 + (i < 10 ? i : i - 10) * 7 + (i < 10 ? 0 : 74), (i < 10 ? 54 : 172) * (0.6 + 0.4 * R()), 3); }
  });
}

// =============================================================================== glow atlas
function buildGlow(A) {
  A.add('white', 64, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  A.add('diffuser', 256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e9eef2'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#e9eef2');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(200,205,210,0.35)'; for (let i = 0; i < w; i += 8) c.fillRect(i, 0, 1, h);
  });
  A.add('strip', 256, 32, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9aa0a4'); g.addColorStop(0.3, '#ffffff'); g.addColorStop(0.7, '#ffffff'); g.addColorStop(1, '#9aa0a4');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const dot = (name, col) => A.add(name, 48, 48, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  dot('ledGreen', '#20ff60'); dot('ledRed', '#ff2010'); dot('ledAmber', '#ffae10'); dot('ledBlue', '#3aa0ff'); dot('ledWhite', '#ffffff');
  A.add('occupied', 256, 112, (c, w, h) => {
    c.fillStyle = '#120a02'; c.fillRect(0, 0, w, h);
    person(c, 52, 70, 70, '#ffb020'); person(c, 98, 70, 70, '#ffb020', true);
    text(c, 'OCCUPIED', 180, h / 2 + 2, 34, '#ffb020', { font: COND });
  });
  A.add('returnSeat', 384, 112, (c, w, h) => {
    c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h);
    // seat + belt pictogram
    c.fillStyle = '#fff'; rr(c, 30, 22, 26, 62, 8); c.fill(); rr(c, 40, 70, 54, 18, 6); c.fill();
    c.beginPath(); c.arc(70, 26, 11, 0, Math.PI * 2); c.fill(); rr(c, 60, 38, 22, 36, 8); c.fill();
    c.fillStyle = '#ffb020'; c.fillRect(54, 60, 40, 7);
    lines(c, ['RETURN', 'TO SEAT'], 240, 38, 38, 40, '#fff', { font: COND });
  });
  A.add('vacantLamp', 128, 64, (c, w, h) => { c.fillStyle = '#031006'; c.fillRect(0, 0, w, h); text(c, 'VACANT', w / 2, h / 2, 30, '#32e070', { font: COND }); });
  A.add('ovenTimer', 192, 64, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    text(c, '18:00', 120, h / 2 + 2, 44, '#ff4a2a', { font: "'DejaVu Sans Mono', 'Courier New', monospace", weight: '700' });
    c.fillStyle = '#20ff60'; c.beginPath(); c.arc(22, h / 2, 7, 0, Math.PI * 2); c.fill();
  });
  A.add('ovenIdle', 192, 64, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    text(c, '--:--', 120, h / 2 + 2, 44, '#7a1d10', { font: "'DejaVu Sans Mono', 'Courier New', monospace", weight: '700' });
  });
  A.add('coffeeReady', 192, 64, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#20ff60'; c.beginPath(); c.arc(24, h / 2, 9, 0, Math.PI * 2); c.fill();
    text(c, 'READY', 112, h / 2 + 2, 32, '#a8ffb8', { font: COND });
  });
  A.add('brewing', 192, 64, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffae10'; c.beginPath(); c.arc(24, h / 2, 9, 0, Math.PI * 2); c.fill();
    text(c, 'HEAT', 112, h / 2 + 2, 32, '#ffd890', { font: COND });
  });
  A.add('chillerDisp', 128, 56, (c, w, h) => {
    c.fillStyle = '#04080c'; c.fillRect(0, 0, w, h);
    text(c, '4°C', w / 2, h / 2 + 2, 34, '#62c8ff', { font: "'DejaVu Sans Mono', monospace", weight: '700' });
  });
  A.add('keyLeds', 128, 32, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    for (const [x, col] of [[20, '#ff3020'], [64, '#30ff60'], [108, '#ffae10']]) { const g = c.createRadialGradient(x, h / 2, 1, x, h / 2, 12); g.addColorStop(0, '#fff'); g.addColorStop(0.4, col); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(x - 14, 0, 28, h); }
  });
  A.add('panelBacklit', 256, 96, (c, w, h) => {
    c.fillStyle = '#05080b'; c.fillRect(0, 0, w, h);
    text(c, 'ATTND', 56, 30, 22, '#9fd7ff', { font: COND }); text(c, 'RESET', 56, 66, 22, '#9fd7ff', { font: COND });
    text(c, 'LAV', 150, 30, 22, '#9fd7ff', { font: COND }); text(c, 'EMER', 150, 66, 22, '#ff8a5a', { font: COND });
    text(c, 'WORK', 222, 30, 22, '#9fd7ff', { font: COND }); text(c, 'LTS', 222, 66, 22, '#9fd7ff', { font: COND });
  });
}

// =============================================================================== fabric weave normal
function weave(aniso) {
  const W = 128, c = canvas(W, W), x = c.getContext('2d');
  const img = x.createImageData(W, W);
  const R = rng(31);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const cell = 8;
    const u = (i % cell) / cell, v = (j % cell) / cell;
    const over = ((Math.floor(i / cell) + Math.floor(j / cell)) & 1) === 0;
    // threads: bumps across u (warp) or v (weft)
    const t = over ? Math.sin(u * Math.PI) : Math.sin(v * Math.PI);
    const dx = over ? Math.cos(u * Math.PI) * 0.55 : 0;
    const dy = over ? 0 : Math.cos(v * Math.PI) * 0.55;
    const n = (R() - 0.5) * 0.15;
    const k = (j * W + i) * 4;
    img.data[k] = Math.round((dx + n) * 0.5 * 255 + 128);
    img.data[k + 1] = Math.round((dy - n) * 0.5 * 255 + 128);
    img.data[k + 2] = Math.round(200 + 55 * t);
    img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  return t;
}

// =============================================================================== FAP touchscreen
export const LIGHT_SCENES = [
  { mode: 'boarding', label: 'BOARDING' },
  { mode: 'bright', label: 'BRIGHT' },
  { mode: 'cruise', label: 'CRUISE' },
  { mode: 'dim', label: 'DIM' },
  { mode: 'night', label: 'NIGHT' },
];

function createFap(aniso) {
  const W = 512, H = 320, c = canvas(W, H), x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  let lastKey = '';
  function draw(s) {
    // s: { mode, doors: {L1:{open, armed}, ...}, page, time }
    const key = `${s.mode}|${s.page}|${Object.entries(s.doors).map(([k, d]) => k + (d.open ? 'o' : 'c') + (d.armed ? 'a' : 'd')).join('')}|${s.flash ? 1 : 0}`;
    if (key === lastKey) return false;
    lastKey = key;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d1a26'); g.addColorStop(1, '#07101a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // header
    x.fillStyle = '#183049'; x.fillRect(0, 0, W, 38);
    text(x, 'FWD ATTENDANT PANEL', 14, 20, 18, '#d6e6f4', { align: 'left', font: COND });
    text(x, AIRLINE.flightNumber, W - 14, 20, 18, '#8fb3d1', { align: 'right', font: COND });
    // tabs
    const tabs = ['LIGHTS', 'DOORS', 'TEMP', 'WATER'];
    tabs.forEach((tb, i) => {
      const on = i === 0;
      x.fillStyle = on ? '#2a5a86' : '#14283b'; rr(x, 8 + i * 124, 46, 116, 32, 5); x.fill();
      text(x, tb, 66 + i * 124, 63, 17, on ? '#fff' : '#7d98b0', { font: COND });
    });
    // lighting scenes
    text(x, 'CABIN LIGHTING SCENE', 14, 98, 15, '#8fb3d1', { align: 'left', font: COND });
    LIGHT_SCENES.forEach((sc, i) => {
      const on = sc.mode === s.mode;
      const bx = 10 + i * 100, by = 110;
      x.fillStyle = on ? (s.flash ? '#5fb0ff' : '#3a8ad6') : '#1a3046'; rr(x, bx, by, 92, 64, 7); x.fill();
      if (on) { x.strokeStyle = '#cfe8ff'; x.lineWidth = 2; rr(x, bx, by, 92, 64, 7); x.stroke(); }
      const col = { boarding: '#7aa8ff', bright: '#fff6e8', cruise: '#9cc2ff', dim: '#ffb26a', night: '#7a5cff' }[sc.mode];
      x.fillStyle = col; x.fillRect(bx + 10, by + 10, 72, 8);
      text(x, sc.label, bx + 46, by + 42, 17, on ? '#fff' : '#9db6cc', { font: COND });
    });
    // doors
    text(x, 'DOORS / SLIDES', 14, 196, 15, '#8fb3d1', { align: 'left', font: COND });
    // fuselage outline
    x.strokeStyle = '#47698a'; x.lineWidth = 2;
    rr(x, 60, 210, 392, 96, 40); x.stroke();
    const pos = { L1: [92, 214], R1: [92, 302], L2: [420, 214], R2: [420, 302] };
    for (const [id, [px, py]] of Object.entries(pos)) {
      const d = s.doors[id] || {};
      const col = d.open ? '#ffae10' : d.armed ? '#2fe070' : '#cfd8df';
      x.fillStyle = col; x.fillRect(px - 16, py - 5, 32, 10);
      const lbl = `${id} ${d.open ? 'OPEN' : 'CLOSED'}${d.open ? '' : d.armed ? ' · ARMED' : ' · DISARM'}`;
      text(x, lbl, px < 200 ? px + 26 : px - 26, py < 250 ? py + 18 : py - 18, 14, col, { align: px < 200 ? 'left' : 'right', font: COND });
    }
    text(x, 'TAP TO SELECT', W / 2, 258, 13, '#56718a', { font: COND });
    t.needsUpdate = true;
    return true;
  }
  return { texture: t, draw };
}
