// Procedural canvas textures for the coach interior: sticker / placard atlas
// (lit decals), back-lit signs, PSU face, speaker & A/C grilles, window frit
// (black ceramic border with dot fade), aisle-runner and curtain jacquard
// patterns, plastic mottling and the floor contact-shadow (AO) map.
import * as THREE from 'three';
import { SEAT_LIST, OPERATOR } from '../core/constants.js';
import { rng } from '../../core/util.js';
import { L } from './layout.js';

export let FONT = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";

/** Try to load Inter for crisp, consistent sign typography (falls back silently). */
export async function loadFonts() {
  try {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const f = new FontFace('BusInter', 'url(assets/ui/fonts/inter-var.woff2)', { weight: '100 900' });
    const done = await Promise.race([f.load().then(() => true), new Promise((r) => setTimeout(() => r(false), 2500))]);
    if (done) { document.fonts.add(f); FONT = "BusInter, " + FONT; }
  } catch { /* keep fallback */ }
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, wrap = THREE.ClampToEdgeWrapping, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = wrap;
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  if (!mip) t.minFilter = THREE.LinearFilter;
  return t;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function font(px, weight = 600) { return `${weight} ${px}px ${FONT}`; }
function text(ctx, s, x, y, px, { weight = 600, color = '#fff', align = 'center', base = 'middle', maxW = 0, spacing = 0 } = {}) {
  ctx.save();
  ctx.font = font(px, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  if (maxW) { const w = ctx.measureText(s).width; if (w > maxW) { ctx.translate(x, y); ctx.scale(maxW / w, 1); ctx.fillText(s, align === 'center' ? 0 : 0, 0); ctx.restore(); return; } }
  ctx.fillText(s, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------- pictograms
function picHammer(ctx, cx, cy, s, color = '#fff') {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.6); ctx.fillStyle = color;
  ctx.fillRect(-s * 0.06, -s * 0.05, s * 0.12, s * 0.55);           // handle
  rr(ctx, -s * 0.28, -s * 0.2, s * 0.56, s * 0.18, s * 0.04); ctx.fill();   // head
  ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.2); ctx.lineTo(-s * 0.4, -s * 0.11); ctx.lineTo(-s * 0.28, -s * 0.02); ctx.fill();
  ctx.restore();
  // shards
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.03);
  for (let i = 0; i < 5; i++) { const a = -2.4 + i * 0.35; ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy - s * 0.2); ctx.lineTo(cx - s * 0.32 + Math.cos(a) * s * 0.22, cy - s * 0.2 + Math.sin(a) * s * 0.22); ctx.stroke(); }
  ctx.restore();
}
function picBelt(ctx, cx, cy, s, color = '#fff') {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.32, s * 0.12, 0, Math.PI * 2); ctx.fill();          // head
  rr(ctx, cx - s * 0.17, cy - s * 0.17, s * 0.34, s * 0.42, s * 0.08); ctx.fill();             // torso
  ctx.fillRect(cx - s * 0.17, cy + s * 0.18, s * 0.42, s * 0.12);                                // thighs
  ctx.fillRect(cx + s * 0.17, cy + s * 0.18, s * 0.11, s * 0.3);                                 // shins
  ctx.lineWidth = s * 0.07; ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(cx - s * 0.24, cy - s * 0.12); ctx.lineTo(cx + s * 0.22, cy + s * 0.22); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = s * 0.045;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.26, cy - s * 0.14); ctx.lineTo(cx + s * 0.24, cy + s * 0.24); ctx.stroke();
  ctx.restore();
}
function picNoSmoke(ctx, cx, cy, s) {
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.fillRect(cx - s * 0.3, cy - s * 0.04, s * 0.48, s * 0.1);
  ctx.fillStyle = '#b5281e'; ctx.fillRect(cx + s * 0.18, cy - s * 0.04, s * 0.1, s * 0.1);
  ctx.strokeStyle = '#555'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(cx + s * 0.3, cy - s * 0.1); ctx.quadraticCurveTo(cx + s * 0.36, cy - s * 0.2, cx + s * 0.3, cy - s * 0.3); ctx.stroke();
  ctx.strokeStyle = '#c8201b'; ctx.lineWidth = s * 0.09;
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s * 0.31, cy - s * 0.31); ctx.lineTo(cx + s * 0.31, cy + s * 0.31); ctx.stroke();
  ctx.restore();
}
function picWC(ctx, cx, cy, s, color = '#fff') {
  ctx.save(); ctx.fillStyle = color;
  // man
  ctx.beginPath(); ctx.arc(cx - s * 0.22, cy - s * 0.3, s * 0.08, 0, Math.PI * 2); ctx.fill();
  rr(ctx, cx - s * 0.33, cy - s * 0.2, s * 0.22, s * 0.3, s * 0.05); ctx.fill();
  ctx.fillRect(cx - s * 0.3, cy + s * 0.08, s * 0.07, s * 0.3); ctx.fillRect(cx - s * 0.21, cy + s * 0.08, s * 0.07, s * 0.3);
  // woman
  ctx.beginPath(); ctx.arc(cx + s * 0.22, cy - s * 0.3, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.22, cy - s * 0.2); ctx.lineTo(cx + s * 0.36, cy + s * 0.14); ctx.lineTo(cx + s * 0.08, cy + s * 0.14); ctx.closePath(); ctx.fill();
  ctx.fillRect(cx + s * 0.15, cy + s * 0.12, s * 0.06, s * 0.26); ctx.fillRect(cx + s * 0.23, cy + s * 0.12, s * 0.06, s * 0.26);
  ctx.fillRect(cx - s * 0.015, cy - s * 0.38, s * 0.03, s * 0.76);
  ctx.restore();
}
function picCross(ctx, cx, cy, s, color = '#fff') { ctx.fillStyle = color; ctx.fillRect(cx - s * 0.12, cy - s * 0.35, s * 0.24, s * 0.7); ctx.fillRect(cx - s * 0.35, cy - s * 0.12, s * 0.7, s * 0.24); }
function picExtinguisher(ctx, cx, cy, s) {
  ctx.save(); ctx.fillStyle = '#fff';
  rr(ctx, cx - s * 0.12, cy - s * 0.18, s * 0.24, s * 0.55, s * 0.08); ctx.fill();
  ctx.fillRect(cx - s * 0.05, cy - s * 0.3, s * 0.1, s * 0.13);
  ctx.lineWidth = s * 0.05; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.27); ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.3, cx + s * 0.28, cy + s * 0.05); ctx.stroke();
  ctx.restore();
}
function picWifi(ctx, cx, cy, s, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.09; ctx.lineCap = 'round';
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy + s * 0.25, s * 0.16 * i, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.25, s * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function picStep(ctx, cx, cy, s, color = '#111') {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.4, cy + s * 0.35); ctx.lineTo(cx - s * 0.4, cy + s * 0.05); ctx.lineTo(cx - s * 0.05, cy + s * 0.05); ctx.lineTo(cx - s * 0.05, cy - s * 0.25); ctx.lineTo(cx + s * 0.4, cy - s * 0.25); ctx.lineTo(cx + s * 0.4, cy + s * 0.35); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function hazard(ctx, x, y, w, h, stripe = 14) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#f2c21b'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#111';
  for (let i = -h; i < w + h; i += stripe * 2) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + stripe, y + h); ctx.lineTo(x + i + stripe + h, y); ctx.lineTo(x + i + h, y); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------------------- atlas
const ATLAS_W = 2048, ATLAS_H = 2048;
function buildAtlas() {
  const c = canvas(ATLAS_W, ATLAS_H), x = c.getContext('2d');
  x.clearRect(0, 0, ATLAS_W, ATLAS_H);
  const rects = {};
  let cx = 4, cy = 4, rowH = 0;
  const place = (name, w, h, draw) => {
    if (cx + w + 4 > ATLAS_W) { cx = 4; cy += rowH + 6; rowH = 0; }
    x.save(); x.translate(cx, cy); x.beginPath(); x.rect(0, 0, w, h); x.clip(); draw(x, w, h); x.restore();
    rects[name] = [cx / ATLAS_W, 1 - (cy + h) / ATLAS_H, (cx + w) / ATLAS_W, 1 - cy / ATLAS_H];
    cx += w + 6; rowH = Math.max(rowH, h);
  };
  const R = rng(77);
  const aged = (ctx, w, h, k = 0.05) => {           // print wear / dust on stickers
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${R() * k})`; ctx.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
  };
  // EMERGENCY EXIT window sticker (on the glass, inside), 0.24 x 0.075 m
  place('exitSticker', 480, 150, (g, w, h) => {
    g.fillStyle = '#c8191d'; rr(g, 0, 0, w, h, 10); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 4; rr(g, 6, 6, w - 12, h - 12, 7); g.stroke();
    picHammer(g, 72, 82, 100);
    text(g, 'EMERGENCY EXIT', 290, 58, 46, { weight: 800, maxW: 300 });
    text(g, 'Break glass with hammer', 290, 108, 25, { weight: 500, maxW: 300 });
    aged(g, w, h);
  });
  // hammer holder placard
  place('hammerSign', 200, 120, (g, w, h) => {
    g.fillStyle = '#c8191d'; rr(g, 0, 0, w, h, 8); g.fill();
    picHammer(g, 50, 66, 70);
    text(g, 'EMERGENCY', 135, 42, 24, { weight: 800, maxW: 120 });
    text(g, 'HAMMER', 135, 72, 24, { weight: 800, maxW: 120 });
    text(g, 'pull down', 135, 100, 16, { weight: 500 });
  });
  // roof hatch label
  place('hatchLabel', 600, 120, (g, w, h) => {
    g.fillStyle = '#1d7a3a'; rr(g, 0, 0, w, h, 8); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(40, 30); g.lineTo(70, 30); g.lineTo(70, 18); g.lineTo(95, 60); g.lineTo(70, 102); g.lineTo(70, 90); g.lineTo(40, 90); g.closePath(); g.fill();
    text(g, 'EMERGENCY EXIT', 340, 42, 40, { weight: 800, maxW: 460 });
    text(g, '1  Turn handle   2  Push hatch up', 340, 88, 26, { weight: 500, maxW: 460 });
  });
  place('noSmoking', 160, 160, (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 12); g.fill(); picNoSmoke(g, 80, 80, 130); });
  place('beltReminder', 360, 200, (g, w, h) => {
    g.fillStyle = '#0e3b43'; rr(g, 0, 0, w, h, 14); g.fill();
    g.fillStyle = '#f2b134'; g.fillRect(0, h - 12, w, 12);
    picBelt(g, 72, 96, 110, '#fff');
    text(g, 'Please', 240, 52, 30, { weight: 500 });
    text(g, 'fasten your', 240, 92, 30, { weight: 700, maxW: 210 });
    text(g, 'seatbelt', 240, 132, 30, { weight: 700 });
  });
  place('wifi', 340, 150, (g, w, h) => {
    g.fillStyle = '#ffffff'; rr(g, 0, 0, w, h, 14); g.fill();
    picWifi(g, 64, 66, 90, '#0e3b43');
    text(g, 'Free Wi-Fi', 210, 48, 34, { weight: 800, color: '#0e3b43' });
    text(g, OPERATOR.wifi, 210, 92, 24, { weight: 500, color: '#333', maxW: 220 });
    text(g, 'USB at every seat', 210, 124, 18, { weight: 500, color: '#666' });
  });
  place('firstAid', 160, 160, (g, w, h) => { g.fillStyle = '#138a3e'; rr(g, 0, 0, w, h, 10); g.fill(); picCross(g, 80, 70, 100); text(g, 'FIRST AID', 80, 140, 20, { weight: 800 }); });
  place('extinguisher', 160, 160, (g, w, h) => { g.fillStyle = '#c8191d'; rr(g, 0, 0, w, h, 10); g.fill(); picExtinguisher(g, 80, 70, 110); text(g, 'FIRE', 80, 134, 18, { weight: 800 }); text(g, 'EXTINGUISHER', 80, 152, 14, { weight: 700 }); });
  place('doorRelease', 280, 200, (g, w, h) => {
    g.fillStyle = '#f2c21b'; rr(g, 0, 0, w, h, 8); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 4; rr(g, 6, 6, w - 12, h - 12, 6); g.stroke();
    text(g, 'EMERGENCY', w / 2, 36, 30, { weight: 900, color: '#111' });
    text(g, 'DOOR RELEASE', w / 2, 68, 26, { weight: 800, color: '#111' });
    text(g, '1  Lift the red cover', 24, 110, 19, { weight: 600, color: '#111', align: 'left' });
    text(g, '2  Turn the handle', 24, 138, 19, { weight: 600, color: '#111', align: 'left' });
    text(g, '3  Push the door open', 24, 166, 19, { weight: 600, color: '#111', align: 'left' });
  });
  place('doorLean', 300, 70, (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 6); g.fill(); text(g, 'Do not lean against the door', w / 2, h / 2, 22, { weight: 700, color: '#c8191d', maxW: w - 20 }); });
  place('dataPlate', 260, 150, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d9dcdf'); gr.addColorStop(1, '#aeb3b8'); g.fillStyle = gr; rr(g, 0, 0, w, h, 6); g.fill();
    for (const [px, py] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) { g.fillStyle = '#777'; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill(); }
    text(g, 'ARDEN VOYAGER 13', w / 2, 30, 20, { weight: 800, color: '#222' });
    text(g, 'Seats 47 + 1 + 1', w / 2, 62, 18, { weight: 600, color: '#333' });
    text(g, 'Standing 0', w / 2, 86, 18, { weight: 600, color: '#333' });
    text(g, `Reg. ${'CX 214 PS'}   Fleet 2147`, w / 2, 118, 14, { weight: 500, color: '#444' });
  });
  place('operator', 760, 150, (g, w, h) => {
    g.fillStyle = '#0e3b43'; rr(g, 0, 0, w, h, 10); g.fill();
    g.strokeStyle = '#f2b134'; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(40, 100 - i * 18); g.bezierCurveTo(70, 70 - i * 18, 100, 120 - i * 18, 140, 80 - i * 18); g.stroke(); }
    text(g, 'COASTLINE', 430, 62, 64, { weight: 800, color: '#ffffff', spacing: 4 });
    text(g, 'E X P R E S S', 430, 112, 34, { weight: 600, color: '#f2b134', spacing: 8 });
  });
  place('wcDoor', 200, 200, (g, w, h) => { g.fillStyle = '#e9ecec'; rr(g, 0, 0, w, h, 16); g.fill(); g.fillStyle = '#0e3b43'; rr(g, 12, 12, w - 24, h - 24, 12); g.fill(); picWC(g, 100, 92, 140); text(g, 'WC', 100, 172, 26, { weight: 800 }); });
  place('wcRules', 360, 300, (g, w, h) => {
    g.fillStyle = '#ffffff'; rr(g, 0, 0, w, h, 10); g.fill();
    g.fillStyle = '#0e3b43'; g.fillRect(0, 0, w, 54);
    text(g, 'Dear passengers', w / 2, 28, 26, { weight: 700 });
    const lines = ['Please do not throw paper towels,', 'nappies or other objects into', 'the toilet.', '', 'Water is not suitable for drinking.', '', 'Please leave the toilet as you', 'would wish to find it. Thank you!'];
    lines.forEach((s, i) => text(g, s, 20, 84 + i * 27, 19, { weight: 500, color: '#222', align: 'left' }));
  });
  place('flush', 140, 60, (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 8); g.fill(); text(g, 'FLUSH', w / 2, h / 2, 28, { weight: 800, color: '#0e3b43' }); });
  place('noDrink', 200, 70, (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 8); g.fill(); text(g, 'Not drinking water', w / 2, h / 2, 20, { weight: 700, color: '#c8191d', maxW: w - 16 }); });
  place('mindStep', 300, 90, (g, w, h) => { hazard(g, 0, 0, w, 16, 12); hazard(g, 0, h - 16, w, 16, 12); g.fillStyle = '#f2c21b'; g.fillRect(0, 16, w, h - 32); picStep(g, 44, 45, 50); text(g, 'Mind the step', 180, 46, 30, { weight: 800, color: '#111' }); });
  place('cctv', 220, 120, (g, w, h) => {
    g.fillStyle = '#f2c21b'; rr(g, 0, 0, w, h, 10); g.fill();
    g.fillStyle = '#111'; rr(g, 20, 34, 64, 30, 6); g.fill(); g.fillRect(84, 42, 18, 14); g.fillRect(44, 64, 10, 22);
    text(g, 'CCTV', 156, 40, 30, { weight: 900, color: '#111' });
    text(g, 'in operation', 156, 74, 18, { weight: 600, color: '#111' });
  });
  place('barrier', 260, 60, (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 6); g.fill(); text(g, 'Keep closed while driving', w / 2, h / 2, 20, { weight: 700, color: '#222', maxW: w - 14 }); });
  place('guideSeat', 220, 60, (g, w, h) => { g.fillStyle = '#e8e8e4'; rr(g, 0, 0, w, h, 6); g.fill(); text(g, 'Tour guide seat', w / 2, h / 2, 22, { weight: 700, color: '#333' }); });
  place('hatchHandle', 160, 50, (g, w, h) => { g.fillStyle = '#c8191d'; rr(g, 0, 0, w, h, 6); g.fill(); text(g, 'TURN  ⟳', w / 2, h / 2, 24, { weight: 800 }); });
  place('beltSmall', 120, 120, (g, w, h) => { g.fillStyle = '#ffffff'; rr(g, 0, 0, w, h, 14); g.fill(); g.fillStyle = '#0e3b43'; rr(g, 8, 8, w - 16, h - 16, 10); g.fill(); picBelt(g, 60, 64, 84, '#fff'); });
  place('noStand', 260, 120, (g, w, h) => {
    g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 8); g.fill();
    text(g, 'No standing', 130, 40, 26, { weight: 800, color: '#c8191d' });
    text(g, 'beyond this point while', 130, 72, 18, { weight: 500, color: '#222' });
    text(g, 'the coach is moving', 130, 96, 18, { weight: 500, color: '#222' });
  });
  place('ventLabel', 140, 40, (g, w, h) => { g.fillStyle = '#d8d8d4'; g.fillRect(0, 0, w, h); text(g, 'VENT  ▲ ▼', w / 2, h / 2, 20, { weight: 700, color: '#333' }); });
  // seat numbers: dark labels with white digits (rack nose), one cell per seat
  for (const s of SEAT_LIST) {
    place('seat' + s.id, 92, 56, (g, w, h) => {
      g.fillStyle = '#26292c'; rr(g, 0, 0, w, h, 8); g.fill();
      text(g, String(s.number), s.isWindow ? 38 : 54, 30, 34, { weight: 700, color: '#f1f1ee' });
      // window / aisle pictogram
      g.fillStyle = '#9aa0a4';
      if (s.isWindow) { g.fillRect(70, 14, 14, 26); g.fillStyle = '#26292c'; g.fillRect(73, 17, 8, 20); }
      else { g.fillRect(10, 18, 4, 22); g.fillRect(18, 18, 4, 22); }
    });
  }
  // luggage tags / misc printed items for props
  place('bagTag', 120, 60, (g, w, h) => { g.fillStyle = '#f4f0e6'; rr(g, 0, 0, w, h, 6); g.fill(); g.fillStyle = '#0e3b43'; g.fillRect(0, 0, 28, h); text(g, 'PSX', 74, 30, 26, { weight: 800, color: '#111' }); });
  place('cupPrint', 256, 128, (g, w, h) => {
    g.fillStyle = '#f5f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6b3d26'; g.beginPath(); g.arc(128, 64, 34, 0, Math.PI * 2); g.fill();
    text(g, 'CAFÉ', 128, 64, 22, { weight: 800, color: '#f5f1ea' });
  });
  const t = tex(c, { aniso: 8 });
  return { texture: t, rects };
}

// ---------------------------------------------------------------------------- back-lit signs (emissive)
function buildSigns() {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rects = {};
  const cell = (name, x0, y0, w, h, draw) => { g.save(); g.translate(x0, y0); draw(g, w, h); g.restore(); rects[name] = [x0 / W, 1 - (y0 + h) / H, (x0 + w) / W, 1 - y0 / H]; };
  cell('belt', 0, 0, 128, 128, (x, w, h) => { picBelt(x, 64, 66, 96, '#fff'); });
  cell('noSmoke', 128, 0, 128, 128, (x, w, h) => {
    x.strokeStyle = '#fff'; x.lineWidth = 9; x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.fillRect(26, 58, 62, 13); x.beginPath(); x.moveTo(30, 30); x.lineTo(98, 98); x.stroke();
  });
  cell('wc', 256, 0, 128, 128, (x) => { picWC(x, 64, 58, 90, '#fff'); text(x, 'WC', 64, 112, 22, { weight: 800 }); });
  cell('call', 384, 0, 128, 128, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 40, 0, Math.PI * 2); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(64, 50, 10, 0, Math.PI * 2); x.fill(); rr(x, 50, 64, 28, 26, 6); x.fill(); });
  cell('exit', 0, 128, 256, 64, (x, w, h) => { text(x, 'EXIT', 128, 34, 46, { weight: 800 }); });
  cell('step', 256, 128, 256, 64, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = '#fff'; x.beginPath(); x.arc(16 + i * 32, 32, 9, 0, Math.PI * 2); x.fill(); } });
  cell('white', 0, 192, 64, 64, (x) => { x.fillStyle = '#fff'; x.fillRect(8, 8, 48, 48); });
  const t = tex(c, { aniso: 4 });
  return { texture: t, rects };
}

// ---------------------------------------------------------------------------- PSU face
// u = along the coach (0 = forward end), v = across (0 = aisle side, 1 = window side)
export const PSU = { len: 0.62, wid: L.psuX1 - L.psuX0 };
function buildPSU() {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const px = (a) => a / PSU.len * W, py = (b) => b / PSU.wid * H;
  g.fillStyle = '#dcdcd7'; g.fillRect(0, 0, W, H);
  // moulded panel edge + shallow recess
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#cfcfca'); grd.addColorStop(0.08, '#e2e2dd'); grd.addColorStop(0.92, '#e2e2dd'); grd.addColorStop(1, '#c8c8c3');
  g.fillStyle = grd; rr(g, 6, 6, W - 12, H - 12, 18); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; rr(g, 6, 6, W - 12, H - 12, 18); g.stroke();
  // speaker grille (rear part of the unit)
  const sx = px(0.50), sy = py(PSU.wid / 2);
  g.fillStyle = '#c4c4bf'; g.beginPath(); g.ellipse(sx, sy, px(0.075), py(0.075), 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a2b2c';
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
    const xx = sx + i * 7.2, yy = sy + j * 7.2;
    if ((xx - sx) ** 2 / px(0.07) ** 2 + (yy - sy) ** 2 / py(0.07) ** 2 < 1) { g.beginPath(); g.arc(xx, yy, 2.1, 0, Math.PI * 2); g.fill(); }
  }
  // recesses for lights / nozzles (darker rings so the 3D parts sit in them)
  for (const b of [0.07, PSU.wid - 0.07]) {
    for (const [a, r] of [[0.14, 0.032], [0.27, 0.034]]) { g.fillStyle = 'rgba(40,40,40,0.35)'; g.beginPath(); g.arc(px(a), py(b), px(r), 0, Math.PI * 2); g.fill(); }
    // light switch bezel
    g.fillStyle = 'rgba(40,40,40,0.25)'; rr(g, px(0.355) - 14, py(b) - 12, 28, 24, 5); g.fill();
  }
  // printed icons: reading lamp + fan next to the switches
  g.fillStyle = '#6b6e70';
  for (const b of [0.07, PSU.wid - 0.07]) {
    const ix = px(0.395), iy = py(b);
    g.beginPath(); g.moveTo(ix, iy - 8); g.lineTo(ix + 8, iy + 6); g.lineTo(ix - 8, iy + 6); g.closePath(); g.fill();
  }
  // sign window (seatbelt / no smoking)
  g.fillStyle = '#1a1b1c'; rr(g, px(0.06) - 4, py(PSU.wid / 2) - 26, px(0.13), 52, 6); g.fill();
  // call button ring
  g.fillStyle = 'rgba(40,40,40,0.3)'; g.beginPath(); g.arc(px(0.36), py(PSU.wid / 2), 15, 0, Math.PI * 2); g.fill();
  // screws
  for (const [a, b] of [[0.02, 0.02], [0.6, 0.02], [0.02, PSU.wid - 0.02], [0.6, PSU.wid - 0.02]]) { g.fillStyle = '#9a9a96'; g.beginPath(); g.arc(px(a), py(b), 3.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#666'; g.lineWidth = 1; g.beginPath(); g.moveTo(px(a) - 2, py(b)); g.lineTo(px(a) + 2, py(b)); g.stroke(); }
  return tex(c, { aniso: 8 });
}

// ---------------------------------------------------------------------------- grilles: speaker (u 0..0.5), A/C slots (0.5..1)
function buildGrille() {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#d3d3ce'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#28292a';
  for (let i = 0; i < 36; i++) for (let j = 0; j < 36; j++) { const xx = 6 + i * 6.9, yy = 6 + j * 6.9; if ((xx - 128) ** 2 + (yy - 128) ** 2 < 118 * 118) { g.beginPath(); g.arc(xx, yy, 2.2, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = '#bdbdb8'; g.fillRect(256, 0, 256, 256);
  for (let i = 0; i < 12; i++) { const yy = 14 + i * 19.5; g.fillStyle = '#1e1f20'; rr(g, 268, yy, 232, 10, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(270, yy + 10, 228, 2); }
  return tex(c, { aniso: 8 });
}

// ---------------------------------------------------------------------------- window frit (alpha)
// u along the edge (metres * 4, repeat), v from the glass edge (0, solid) to the inner edge of the fade (1)
function buildFrit() {
  const W = 256, H = 128, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  const solid = 0.55;
  g.fillRect(0, H * (1 - solid), W, H * solid);    // canvas y down: v=0 at the bottom row
  const n = 8, step = W / n;
  for (let r = 0; r < 7; r++) {
    const v = solid - (r + 1) * 0.06;           // centre of this dot row (v)
    const rad = step * 0.48 * (1 - (r + 0.5) / 7.5);
    for (let i = 0; i <= n; i++) {
      const xx = i * step + (r % 2 ? step / 2 : 0), yy = H * (1 - v);
      g.beginPath(); g.arc(xx, yy, Math.max(0.6, rad), 0, Math.PI * 2); g.fill();
    }
  }
  const t = tex(c, { srgb: false, wrap: THREE.RepeatWrapping, aniso: 8 });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------- runner pattern (x2 multiplier)
function buildRunner() {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d');   // u across the runner, v = 0.9 m along
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, W, H);
  const R = rng(31);
  // tufted rows texture is in the PBR maps; here: subtle teal/gold fleck pattern + bound edges
  for (let i = 0; i < 900; i++) {
    const t = R();
    g.fillStyle = t < 0.5 ? `rgba(70,140,150,${0.25 + R() * 0.3})` : t < 0.62 ? `rgba(200,160,70,${0.2 + R() * 0.25})` : `rgba(30,30,32,${0.3 + R() * 0.3})`;
    const x = 22 + R() * (W - 44), y = R() * H;
    g.fillRect(x, y, 2 + R() * 2, 3 + R() * 5);
  }
  // diagonal 'wave' motif (operator pattern), tone on tone
  g.strokeStyle = 'rgba(160,170,175,0.22)'; g.lineWidth = 5;
  for (let k = -2; k < 6; k++) { g.beginPath(); for (let y = 0; y <= H; y += 8) { const xx = W / 2 + Math.sin((y / H) * Math.PI * 2 + k) * 60; if (y === 0) g.moveTo(xx, y + k * 90); else g.lineTo(xx, y + k * 90); } g.stroke(); }
  // bound edges (darker binding tape with stitching)
  for (const ex of [0, W - 20]) {
    g.fillStyle = 'rgb(48,50,54)'; g.fillRect(ex, 0, 20, H);
    g.strokeStyle = 'rgba(140,140,140,0.4)'; g.setLineDash([6, 5]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(ex + (ex ? 4 : 16), 0); g.lineTo(ex + (ex ? 4 : 16), H); g.stroke(); g.setLineDash([]);
  }
  return tex(c, { wrap: THREE.RepeatWrapping, aniso: 8 });
}

// ---------------------------------------------------------------------------- curtain jacquard (x2 multiplier)
function buildCurtainPattern() {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, W, H);
  // vertical woven stripes of varying tone, a thin gold thread, and a bottom hem band
  const stripes = [[0, 40, 118], [40, 18, 140], [58, 70, 122], [128, 8, 175], [136, 52, 112], [188, 30, 136], [218, 38, 120]];
  for (const [x, w, v] of stripes) { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, w, H); }
  g.fillStyle = 'rgb(205,170,95)'; g.fillRect(130, 0, 3, H);
  const R = rng(4);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},0.04)`; g.fillRect(R() * W, R() * H, 1, 2 + R() * 6); }
  // hem at the bottom (v near 0 -> canvas bottom)
  g.fillStyle = 'rgb(92,92,92)'; g.fillRect(0, H - 22, W, 22);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, H - 24, W, 2);
  return tex(c, { wrap: THREE.RepeatWrapping, aniso: 8 });
}

// ---------------------------------------------------------------------------- plastic mottle
function buildMottle() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, W, H);
  const R = rng(12);
  for (let i = 0; i < 60; i++) {
    const x = R() * W, y = R() * H, r = 10 + R() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 222 + Math.floor(R() * 30);
    gr.addColorStop(0, `rgba(${v},${v},${v - 2},0.25)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,120,118,${R() * 0.12})`; g.fillRect(R() * W, R() * H, 1, 1); }
  return tex(c, { wrap: THREE.RepeatWrapping, aniso: 4 });
}

// ---------------------------------------------------------------------------- floor contact shadows
export const FLOOR_RECT = { x0: -1.3, z0: -6.6, w: 2.6, d: 13.2 };
function buildFloorAO() {
  const W = 256, H = 1024, c = canvas(W, H), g = c.getContext('2d');
  const X = (x) => (x - FLOOR_RECT.x0) / FLOOR_RECT.w * W;
  const Z = (z) => (z - FLOOR_RECT.z0) / FLOOR_RECT.d * H;   // canvas y = z (flipY=false on this texture)
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.filter = 'blur(6px)';
  // under every seat: soft shadow of the cushion + darker leg footprints
  for (const s of SEAT_LIST) {
    const x0 = X(s.x - 0.2), x1 = X(s.x + 0.2), z0 = Z(s.z - 0.24), z1 = Z(s.z + 0.3);
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x0, z0, x1 - x0, z1 - z0);
  }
  // walls & convectors, partitions, rear wall
  for (const sx of [-1, 1]) {
    const gr = g.createLinearGradient(X(sx * 0.95), 0, X(sx * 1.2), 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = gr; g.fillRect(Math.min(X(sx * 0.95), X(sx * 1.25)), 0, Math.abs(X(sx * 1.25) - X(sx * 0.95)), H);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, Z(L.rearZ - 0.15), W, Z(L.rearZ + 0.2) - Z(L.rearZ - 0.15));
  g.fillRect(X(-1.2), Z(L.deckZ0 - 0.02), X(-0.2) - X(-1.2), Z(L.deckZ0 + 0.18) - Z(L.deckZ0 - 0.02));
  g.fillRect(X(0.3), Z(L.rightPartZ - 0.02), X(1.2) - X(0.3), Z(L.rightPartZ + 0.14) - Z(L.rightPartZ - 0.02));
  // toilet box & stairwell rims
  g.fillRect(X(0.12), Z(L.wc.z0 - 0.05), X(0.28) - X(0.12), Z(L.wc.z1 + 0.05) - Z(L.wc.z0 - 0.05));
  // step / platform edges: a thin shadow line on the aisle side of each nosing
  g.filter = 'blur(2px)';
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (const sx of [-1, 1]) { const a = X(sx * (L.aisleX - 0.015)), b = X(sx * (L.aisleX + 0.005)); g.fillRect(Math.min(a, b), Z(L.deckZ0), Math.abs(b - a), H); }
  g.filter = 'none';
  const t = tex(c, { srgb: false, aniso: 4 });
  t.flipY = false;
  return t;
}

export async function createTextures(app) {
  await loadFonts();
  const atlas = buildAtlas();
  const signs = buildSigns();
  const T = {
    atlas: atlas.texture, rect: (n) => atlas.rects[n] || [0, 0, 0.001, 0.001],
    signs: signs.texture, signRect: (n) => signs.rects[n] || [0, 0, 0.001, 0.001],
    psu: buildPSU(), grille: buildGrille(), frit: buildFrit(), runner: buildRunner(),
    curtainPattern: buildCurtainPattern(), plasticMottle: buildMottle(), floorAO: buildFloorAO(),
    floorAORect: new THREE.Vector4(FLOOR_RECT.x0, FLOOR_RECT.z0, 1 / FLOOR_RECT.w, 1 / FLOOR_RECT.d),
  };
  T.plasticMottle.repeat.set(1 / 0.9, 1 / 0.9);
  return T;
}

/** uv transform helper: map a unit-square uv into an atlas rect. */
export const uvRect = (r) => (u, v) => [r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v];
