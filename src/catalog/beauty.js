// Catalogue: beauty (see docs/CONTENT_GUIDE.md)
// Glow's perfumes, skincare, shower & bath goodies, dental, hair tools and
// vitamins; Maison Luxe fragrances & creams; Nestly bedding sets.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, lathe, tube, extrude, at, rot, group, decal, labelTexture, FONT, fitText, tint } from '../items/kit.js';
import { pumpBottle, squeezeTube } from './shared.js';

const PI = Math.PI;

// =================================================================== materials & labels
const glassM = (c = '#f4f8fa', opacity = 0.32) => mat(c, { rough: 0.04, opacity, transparent: true, clearcoat: 1, envInt: 1.5 });
const liquidM = (c, opacity = 0.85) => mat(c, { rough: 0.1, opacity, transparent: true });
const plastic = (c, rough = 0.35) => mat(c, { rough, clearcoat: 0.4 });
const GOLD = () => mat('#e0b456', { rough: 0.2, metal: 1 });
function txt(x, s, cx, cy, size, c, w = 800, maxW = 1e4, font = FONT) { x.font = `${w} ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = c; fitText(x, s, cx, cy, maxW); }
const SERIF = 'Georgia, "Times New Roman", serif';
// Flat label facing +Z.
function plate(w, h, key, draw, z, y, x = 0) { return at(decal(w, h, 'beauty:' + key, draw, { tw: 256, transparent: false }), x, y, z); }
// Wrap-around label on a cylinder; the drawing's horizontal center faces +Z.
function band(r, h, y, key, draw, { tw = 512, th = 160, rough = 0.45 } = {}) {
  const tex = labelTexture('beautyband:' + key, tw, th, draw);
  const m = cyl(r, r, h, mat('#ffffff', { map: tex, rough }), 36, undefined, true);
  m.rotation.y = PI + 0.5; return at(m, 0, y, 0); // centered slightly right of front: faces the viewer in shelves & thumbnails
}
// A simple centered brand label (used for plates & bands).
const brandLabel = ({ bg, ink, title, sub = '', accent = null, serif = false, frac = 0.36 }) => (x, w, h) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  const cw = w * frac, cx = w / 2;
  if (accent) { x.fillStyle = accent; x.fillRect(cx - cw / 2, h * 0.72, cw, h * 0.08); }
  txt(x, title, cx, sub ? h * 0.4 : h * 0.5, Math.min(h * 0.32, 90), ink, serif ? 600 : 900, cw * 0.92, serif ? SERIF : FONT);
  if (sub) txt(x, sub, cx, h * 0.64, h * 0.12, ink, 600, cw * 0.9);
};

// =================================================================== fragrance
function perfume({ shape = 'flacon', glass = '#fde2ea', liquid = '#f7a8c4', cap = '#e0b456', capKind = 'gold', label = 'ROSE', ink = '#7a3b52', labelBg = '#fff6f2', key }) {
  const g = new THREE.Group();
  const gm = glassM(glass, 0.38), lm = liquidM(liquid, 0.8);
  const capM = capKind === 'gold' ? GOLD() : capKind === 'crystal' ? glassM(cap, 0.55) : plastic(cap, 0.25);
  const lbl = brandLabel({ bg: labelBg, ink, title: label, serif: true, frac: 1 });
  let top = 0.08;
  if (shape === 'flacon') {
    g.add(lathe([[0.0001, 0], [0.03, 0], [0.042, 0.018], [0.044, 0.042], [0.036, 0.066], [0.014, 0.078], [0.011, 0.084], [0.0001, 0.084]], gm, 36));
    g.add(lathe([[0.0001, 0.006], [0.028, 0.006], [0.037, 0.02], [0.038, 0.04], [0.031, 0.058], [0.0001, 0.06]], lm, 28));
    g.add(plate(0.036, 0.016, key, lbl, 0.0445, 0.036));
    top = 0.084;
  } else if (shape === 'square') {
    g.add(at(rbox(0.068, 0.078, 0.036, 0.007, gm), 0, 0.039, 0));
    g.add(at(rbox(0.056, 0.062, 0.025, 0.004, lm), 0, 0.036, 0));
    g.add(plate(0.04, 0.018, key, lbl, 0.0185, 0.042));
    top = 0.078;
  } else if (shape === 'tall') {
    g.add(at(cyl(0.022, 0.022, 0.11, gm, 32), 0, 0.055, 0));
    g.add(at(cyl(0.018, 0.018, 0.09, lm, 24), 0, 0.048, 0));
    g.add(band(0.0222, 0.03, 0.055, key, brandLabel({ bg: labelBg, ink, title: label, frac: 0.3 })));
    top = 0.11;
  } else if (shape === 'octagon') {
    const b = cyl(0.033, 0.033, 0.082, mat(glass, { rough: 0.08, clearcoat: 1, opacity: 0.92, transparent: true }), 8); b.rotation.y = PI / 8; g.add(at(b, 0, 0.041, 0));
    g.add(plate(0.03, 0.02, key, lbl, 0.0306, 0.042));
    top = 0.082;
  } else if (shape === 'heart') {
    const H = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * PI * 2; H.push([16 * Math.sin(t) ** 3 * 0.0026, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.0026]); }
    const hm = extrude(H, 0.026, gm, 0.008); at(hm, 0, 0.052, 0); g.add(hm);
    const lq = extrude(H, 0.018, lm, 0.004); lq.scale.set(0.8, 0.8, 1); at(lq, 0, 0.05, 0); g.add(lq);
    g.add(at(rbox(0.05, 0.008, 0.03, 0.003, GOLD()), 0, 0.004, 0));
    top = 0.088;
  } else if (shape === 'stopper') {
    g.add(lathe([[0.0001, 0], [0.026, 0], [0.034, 0.03], [0.03, 0.075], [0.016, 0.098], [0.009, 0.104], [0.0001, 0.104]], gm, 36));
    g.add(lathe([[0.0001, 0.006], [0.023, 0.006], [0.029, 0.03], [0.026, 0.068], [0.0001, 0.07]], lm, 28));
    g.add(plate(0.03, 0.016, key, lbl, 0.0335, 0.036));
    g.add(at(cyl(0.011, 0.011, 0.012, GOLD(), 16), 0, 0.108, 0));
    const st = sph(0.026, glassM(cap, 0.6), 24, 16); st.scale.set(1, 1.15, 0.55); g.add(at(st, 0, 0.142, 0));
    return g;
  }
  g.add(at(cyl(0.009, 0.009, 0.01, GOLD(), 16), 0, top + 0.005, 0));
  if (shape === 'octagon') { const c = cyl(0.03, 0.03, 0.044, capM, 8); c.rotation.y = PI / 8; g.add(at(c, 0, top + 0.032, 0)); }
  else if (capKind === 'crystal') { const c = sph(0.02, capM, 8, 6); c.scale.set(1, 0.85, 1); g.add(at(c, 0, top + 0.026, 0)); }
  else if (shape === 'tall') g.add(at(cyl(0.022, 0.022, 0.034, capM, 32), 0, top + 0.027, 0));
  else g.add(at(rbox(0.03, 0.03, 0.03, 0.006, capM), 0, top + 0.025, 0));
  return g;
}
// Plastic body-mist bottle with a spray actuator under a clear cap.
function mistBottle({ color = '#fde4c8', ink = '#a0522d', title = 'VANILLA', sub = 'BODY MIST', key }) {
  const g = new THREE.Group();
  const m = plastic(color, 0.3);
  g.add(lathe([[0.0001, 0], [0.026, 0], [0.028, 0.006], [0.028, 0.15], [0.02, 0.164], [0.011, 0.168], [0.0001, 0.168]], m, 32));
  g.add(band(0.0282, 0.1, 0.075, key, brandLabel({ bg: color, ink, title, sub, frac: 0.3 })));
  g.add(at(cyl(0.011, 0.011, 0.016, mat('#f4f4f4', { rough: 0.4 }), 16), 0, 0.176, 0));
  g.add(at(rot(cyl(0.002, 0.002, 0.006, mat('#222'), 6), PI / 2, 0, 0), 0, 0.18, 0.011));
  g.add(at(cyl(0.022, 0.022, 0.034, glassM('#ffffff', 0.25), 24), 0, 0.185, 0));
  return g;
}
// Aerosol can (body spray, room spray).
function aerosol({ color = '#2b59c3', cap = '#ffffff', key, draw, r = 0.026, h = 0.17 }) {
  const g = new THREE.Group();
  const alu = mat('#d7dade', { rough: 0.25, metal: 1 });
  g.add(at(cyl(r, r, 0.006, alu, 28), 0, 0.003, 0));
  g.add(band(r, h - 0.012, (h - 0.012) / 2 + 0.006, key, draw, { rough: 0.3 }));
  g.add(at(cyl(r, r, h - 0.012, mat(color, { rough: 0.3, metal: 0.4 }), 28), 0, (h - 0.012) / 2 + 0.006, 0));
  g.children.at(-1).scale.set(0.995, 1, 0.995);
  g.add(at(lathe([[r, 0], [r * 0.9, 0.012], [r * 0.45, 0.02], [0.0001, 0.021]], alu, 28), 0, h - 0.006, 0));
  g.add(at(cyl(r * 1.02, r * 1.02, 0.04, plastic(cap, 0.3), 28), 0, h + 0.006, 0));
  return g;
}

// =================================================================== skincare
function sachet({ bg = '#f4f4f4', draw, key, w = 0.11, h = 0.16 }) {
  const g = new THREE.Group();
  const foil = mat(bg, { rough: 0.35, metal: 0.25, clearcoat: 0.5 });
  g.add(at(rbox(w, h, 0.01, 0.004, foil), 0, h / 2, 0));
  g.add(at(box(w, 0.012, 0.004, mat(tint(bg, 0.9), { rough: 0.4, metal: 0.3 })), 0, h - 0.006, 0));
  g.add(at(decal(w * 0.94, h * 0.86, 'mask:' + key, draw, { tw: 256, transparent: false }), 0, h * 0.47, 0.0052));
  return g;
}
const maskArt = (bg, title, sub, face) => (x, w, h) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  face(x, w / 2, h * 0.42, w * 0.3);
  txt(x, title, w / 2, h * 0.8, h * 0.08, '#1b1b1b', 900, w * 0.86);
  txt(x, sub, w / 2, h * 0.9, h * 0.045, '#444', 600, w * 0.86);
};
function dropperBottle({ glass = '#c9772f', liquid = '#ffb347', bulb = '#151515', ink = '#3b2414', title = 'VIT C', key }) {
  const g = new THREE.Group();
  g.add(lathe([[0.0001, 0], [0.019, 0], [0.02, 0.004], [0.02, 0.062], [0.013, 0.07], [0.008, 0.074], [0.0001, 0.074]], glassM(glass, 0.72), 28));
  g.add(at(cyl(0.016, 0.016, 0.045, liquidM(liquid, 0.7), 20), 0, 0.03, 0));
  g.add(band(0.0204, 0.032, 0.032, key, brandLabel({ bg: '#fbf6ef', ink, title, sub: 'SERUM 30ML', frac: 0.32 })));
  g.add(at(cyl(0.011, 0.011, 0.014, mat(bulb, { rough: 0.3, clearcoat: 0.6 }), 20), 0, 0.081, 0));
  const b = sph(0.009, mat(bulb, { rough: 0.6 }), 16, 12); b.scale.y = 1.6; g.add(at(b, 0, 0.098, 0));
  return g;
}
function creamJar({ color = '#f6dfe3', lid = '#f2f2f2', ink = '#7a3b52', title = 'CLOUD', sub = 'MOISTURIZER', key, r = 0.036, h = 0.042, lidGold = false }) {
  const g = new THREE.Group();
  g.add(lathe([[0.0001, 0], [r * 0.92, 0], [r, 0.006], [r, h * 0.82], [r * 0.9, h * 0.86], [0.0001, h * 0.86]], MAT.ceramic(color), 36));
  g.add(band(r + 0.0003, h * 0.42, h * 0.42, key, brandLabel({ bg: color, ink, title, sub, frac: 0.34, serif: true }), { th: 96 }));
  g.add(at(cyl(r * 1.01, r * 1.01, h * 0.3, lidGold ? GOLD() : plastic(lid, 0.25), 36), 0, h * 0.86 + h * 0.15, 0));
  return g;
}

// =================================================================== shower & bath
function showerBottle({ color = '#f1e3c8', cap = '#3b2a1e', ink = '#3b2a1e', title = 'ARGAN', sub = 'SHAMPOO', accent = null, key, h = 0.2, w = 0.07, d = 0.042, flip = false }) {
  const g = new THREE.Group();
  g.add(at(rbox(w, h, d, 0.016, plastic(color, 0.25)), 0, h / 2, 0));
  g.add(plate(w * 0.78, h * 0.42, key, (x, W, H) => {
    x.fillStyle = color; x.fillRect(0, 0, W, H);
    if (accent) { x.fillStyle = accent; x.beginPath(); x.arc(W / 2, H * 0.3, W * 0.2, 0, 7); x.fill(); }
    txt(x, title, W / 2, H * 0.6, H * 0.15, ink, 900, W * 0.9); txt(x, sub, W / 2, H * 0.78, H * 0.08, ink, 600, W * 0.9);
  }, d / 2 + 0.0008, h * 0.45));
  if (flip) { const c = cyl(0.026, 0.028, 0.03, plastic(cap, 0.3), 24); c.scale.z = 0.7; g.add(at(c, 0, h + 0.012, 0)); g.add(at(rbox(0.03, 0.006, 0.014, 0.003, plastic(tint(cap, 0.85), 0.3)), 0, h + 0.028, 0.006)); }
  else { g.add(at(cyl(0.012, 0.014, 0.012, plastic(cap, 0.3), 16), 0, h + 0.006, 0)); g.add(at(cyl(0.006, 0.006, 0.03, plastic(cap, 0.3), 12), 0, h + 0.026, 0)); g.add(at(rbox(0.05, 0.012, 0.018, 0.004, plastic(cap, 0.3)), 0.012, h + 0.044, 0)); }
  return g;
}
function bathBomb({ color = '#ff8fb1', speck = '#ffffff', topping = null, swirl = null, key }) {
  const tex = labelTexture('bomb:' + key, 256, 128, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    if (swirl) { for (let i = 0; i < 7; i++) { x.strokeStyle = swirl[i % swirl.length]; x.globalAlpha = 0.75; x.lineWidth = 10 + (i % 3) * 5; x.beginPath(); for (let u = 0; u <= w; u += 8) x.lineTo(u, h * (0.15 + i * 0.12) + Math.sin(u * 0.05 + i) * 12); x.stroke(); } x.globalAlpha = 1; }
    for (let i = 0; i < 260; i++) { x.fillStyle = i % 4 ? speck : tint(color, 0.8); x.globalAlpha = 0.65; x.fillRect((i * 53) % w, (i * 29 + (i >> 2)) % h, 2, 2); }
    x.globalAlpha = 1;
  });
  const g = new THREE.Group();
  g.add(at(sph(0.034, mat('#ffffff', { map: tex, rough: 0.95 }), 32, 20), 0, 0.034, 0));
  g.add(at(rot(torus(0.0342, 0.0016, mat(tint(color, 0.85), { rough: 1 }), 6, 40), PI / 2, 0, 0), 0, 0.034, 0));
  if (topping === 'petals') for (let i = 0; i < 6; i++) { const p = sph(0.008, mat(i % 2 ? '#e0577a' : '#f49cb3', { rough: 0.8 }), 10, 6); p.scale.set(1, 0.3, 0.7); p.rotation.set(0.3, i, 0.2); g.add(at(p, Math.cos(i * 1.1) * 0.012, 0.066 + (i % 2) * 0.001, Math.sin(i * 1.1) * 0.012)); }
  if (topping === 'glitter') for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = 0.03; g.add(at(box(0.004, 0.004, 0.004, mat('#ffe08a', { rough: 0.15, metal: 1 })), Math.cos(a) * rr * Math.sin(i), 0.034 + Math.cos(i * 0.7) * 0.02, Math.sin(a) * rr * Math.sin(i) + 0.012)); }
  if (topping === 'leaf') { const l = sph(0.012, mat('#4f8a3a', { rough: 0.6 }), 10, 8); l.scale.set(0.5, 0.2, 1); l.rotation.y = 0.6; g.add(at(l, 0.004, 0.068, 0)); }
  if (topping === 'honey') { g.add(at(sph(0.012, mat('#e9a42a', { rough: 0.1, clearcoat: 1, opacity: 0.9, transparent: true }), 12, 8), 0, 0.064, 0)); }
  if (topping === 'star') { const S = []; for (let i = 0; i < 10; i++) { const a = PI / 2 + (i / 10) * PI * 2, rr = i % 2 ? 0.006 : 0.014; S.push([Math.cos(a) * rr, Math.sin(a) * rr]); } const st = extrude(S, 0.004, mat('#ffe066', { rough: 0.3, metal: 0.4 }), 0.001); st.rotation.x = -PI / 2; g.add(at(st, 0, 0.069, 0)); }
  return g;
}
function soapBar({ color = '#efe2c4', speck = null, stamp = 'OAT', ink = null, dish = '#b5835a', key }) {
  const g = new THREE.Group();
  const wood = MAT.wood(dish);
  g.add(at(rbox(0.12, 0.012, 0.085, 0.004, wood), 0, 0.006, 0));
  for (let i = 0; i < 5; i++) g.add(at(rbox(0.11, 0.006, 0.01, 0.003, wood), 0, 0.015, -0.032 + i * 0.016));
  const tex = speck ? labelTexture('soapspeck:' + key, 128, 128, (x, w, h) => { x.fillStyle = color; x.fillRect(0, 0, w, h); for (let i = 0; i < 180; i++) { x.fillStyle = speck; x.globalAlpha = 0.6; x.fillRect((i * 37) % w, (i * 61 + i) % h, 2, 2); } x.globalAlpha = 1; }) : null;
  g.add(at(rbox(0.092, 0.03, 0.062, 0.012, mat(tex ? '#ffffff' : color, { rough: 0.6, map: tex })), 0, 0.033, 0));
  const st = decal(0.06, 0.035, 'soapstamp:' + key, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = ink || tint(color, 0.75); x.lineWidth = 4; x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, 7); x.stroke(); txt(x, stamp, w / 2, h / 2, h * 0.36, ink || tint(color, 0.7), 800, w * 0.75, SERIF); }, { tw: 192 });
  st.rotation.x = -PI / 2; g.add(at(st, 0, 0.0485, 0));
  return g;
}
function amberPump({ glass = '#7a4a1c', pump = '#151515', ink = '#2b2420', title = 'MAISON', sub = 'HAND WASH', key, h = 0.19 }) {
  const g = new THREE.Group();
  g.add(lathe([[0.0001, 0], [0.032, 0], [0.034, 0.006], [0.034, h * 0.72], [0.02, h * 0.8], [0.012, h * 0.83], [0.0001, h * 0.83]], mat(glass, { rough: 0.08, clearcoat: 1, opacity: 0.88, transparent: true }), 32));
  g.add(band(0.0343, h * 0.3, h * 0.36, key, (x, w, hh) => { x.fillStyle = '#efe7d6'; x.fillRect(0, 0, w, hh); txt(x, title, w / 2, hh * 0.34, hh * 0.16, ink, 600, w * 0.26, SERIF); x.fillStyle = ink; x.fillRect(w * 0.42, hh * 0.5, w * 0.16, 2); txt(x, sub, w / 2, hh * 0.68, hh * 0.1, ink, 600, w * 0.26); }));
  g.add(at(cyl(0.013, 0.013, 0.016, mat(pump, { rough: 0.3 }), 16), 0, h * 0.85, 0));
  g.add(at(cyl(0.005, 0.005, 0.03, mat(pump, { rough: 0.3 }), 12), 0, h * 0.9, 0));
  g.add(at(rbox(0.016, 0.012, 0.05, 0.004, mat(pump, { rough: 0.3 })), 0, h * 0.97, 0.014));
  return g;
}

// =================================================================== dental, hair, vitamins, nails
function sonicBrush({ color = '#e8b4a0', accent = '#f6f1ec' }) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.25, metal: 0.6, clearcoat: 0.8 });
  g.add(at(cyl(0.032, 0.036, 0.03, plastic(accent, 0.3), 32), 0, 0.015, 0));
  g.add(at(cyl(0.012, 0.014, 0.16, m, 24), 0, 0.11, 0));
  g.add(at(sph(0.012, m, 16, 10), 0, 0.19, 0));
  g.add(at(cyl(0.0045, 0.006, 0.05, plastic(accent, 0.3), 12), 0, 0.22, 0));
  g.add(at(rbox(0.012, 0.02, 0.012, 0.005, plastic(accent, 0.3)), 0, 0.252, 0.004));
  g.add(at(rbox(0.01, 0.016, 0.01, 0.003, mat('#7fd3ff', { rough: 0.9 })), 0, 0.252, 0.013));
  g.add(at(rot(cyl(0.004, 0.004, 0.003, mat('#ffffff', { emissive: '#ffffff', ei: 0.4 }), 14), PI / 2, 0, 0), 0, 0.12, 0.0125));
  g.add(at(rot(torus(0.005, 0.0012, plastic(accent), 6, 14), 0, 0, 0), 0, 0.12, 0.0125));
  return g;
}
function hairDryer({ color = '#f2c6d0', accent = '#e0b456' }) {
  const g = new THREE.Group();
  const m = plastic(color, 0.3);
  const hand = rbox(0.034, 0.13, 0.04, 0.015, m); hand.rotation.x = -0.18; g.add(at(hand, 0, 0.065, -0.012));
  g.add(at(rbox(0.042, 0.012, 0.046, 0.005, plastic(tint(color, 0.85))), 0, 0.006, -0.002));
  const body = cyl(0.04, 0.04, 0.15, m, 32); body.rotation.x = PI / 2; g.add(at(body, 0, 0.16, 0.005));
  const noz = cyl(0.026, 0.034, 0.05, plastic(tint(color, 0.9)), 28); noz.rotation.x = PI / 2; g.add(at(noz, 0, 0.16, 0.105));
  const rim = torus(0.026, 0.003, mat(accent, { rough: 0.2, metal: 1 }), 6, 24); g.add(at(rim, 0, 0.16, 0.13));
  const back = cyl(0.041, 0.041, 0.01, mat('#2b2b2b', { rough: 0.8 }), 28); back.rotation.x = PI / 2; g.add(at(back, 0, 0.16, -0.073));
  for (let i = -2; i <= 2; i++) g.add(at(box(0.07, 0.002, 0.012, mat('#555', { rough: 0.6 })), 0, 0.16 + i * 0.012, -0.079));
  g.add(at(rbox(0.012, 0.024, 0.008, 0.003, mat(accent, { rough: 0.3, metal: 0.8 })), 0, 0.09, 0.012));
  g.add(tube([[0, 0.01, -0.03], [0, 0.004, -0.08], [0.04, 0.004, -0.12], [0.1, 0.004, -0.1]], 0.004, mat('#eeeeee', { rough: 0.6 }), 20, 6));
  return g;
}
function flatIron({ color = '#1b1b1d', plate: pc = '#c9b8a6' }) {
  const g = new THREE.Group();
  const m = plastic(color, 0.35);
  for (const s of [0, 1]) { const a = rbox(0.034, 0.016, 0.27, 0.007, m); a.rotation.x = s ? -0.06 : 0; g.add(at(a, 0, 0.008 + s * 0.024, s ? 0.006 : 0)); g.add(at(box(0.026, 0.004, 0.1, mat(pc, { rough: 0.3, clearcoat: 0.6 })), 0, s ? 0.024 : 0.017, 0.08 + s * 0.002)); }
  g.add(at(rbox(0.036, 0.04, 0.04, 0.012, m), 0, 0.02, -0.12));
  g.add(at(box(0.006, 0.004, 0.012, mat('#ff4d6d', { emissive: '#ff4d6d', ei: 1.2 })), 0, 0.045, -0.04));
  g.add(tube([[0, 0.02, -0.14], [0, 0.006, -0.18], [0.05, 0.004, -0.2], [0.09, 0.004, -0.17]], 0.0035, mat('#2b2b2b', { rough: 0.7 }), 20, 6));
  return g;
}
function gummyJar({ jar = '#f7f7f7', lid = '#ff8c42', gummies = ['#ff595e', '#ffca3a', '#8ac926', '#ff924c'], title = 'MULTI', sub = 'GUMMIES', ink = '#ff6b35', key, clear = true }) {
  const g = new THREE.Group();
  if (clear) {
    g.add(lathe([[0.0001, 0], [0.032, 0], [0.034, 0.006], [0.034, 0.088], [0.026, 0.095], [0.0001, 0.095]], glassM('#ffffff', 0.25), 32));
    for (let i = 0; i < 14; i++) { const a = i * 2.39, rr = 0.012 + (i % 3) * 0.008; const gm = sph(0.008, mat(gummies[i % gummies.length], { rough: 0.25, clearcoat: 0.8, opacity: 0.92, transparent: true }), 10, 8); gm.scale.set(1, 1.2, 0.8); gm.rotation.set(i, i * 0.5, 0); g.add(at(gm, Math.cos(a) * rr, 0.01 + Math.floor(i / 4) * 0.016, Math.sin(a) * rr)); }
    g.add(band(0.0343, 0.034, 0.048, key, brandLabel({ bg: '#ffffff', ink, title, sub, frac: 0.34 })));
  } else {
    g.add(lathe([[0.0001, 0], [0.03, 0], [0.032, 0.006], [0.032, 0.085], [0.024, 0.093], [0.0001, 0.093]], plastic(jar, 0.3), 32));
    g.add(band(0.0322, 0.055, 0.045, key, (x, w, h) => { x.fillStyle = jar; x.fillRect(0, 0, w, h); x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(w / 2 - 22, h * 0.3, 16, 0, 7); x.fill(); x.fillStyle = jar; x.beginPath(); x.arc(w / 2 - 14, h * 0.25, 14, 0, 7); x.fill(); txt(x, title, w / 2, h * 0.58, h * 0.2, ink, 900, w * 0.3); txt(x, sub, w / 2, h * 0.8, h * 0.1, ink, 600, w * 0.3); }));
  }
  g.add(at(cyl(0.028, 0.028, 0.022, plastic(lid, 0.3), 32), 0, (clear ? 0.095 : 0.093) + 0.01, 0));
  return g;
}
function nailPolish({ color = '#c1121f', cap = '#111', metal = false }) {
  const g = new THREE.Group();
  g.add(at(rbox(0.036, 0.04, 0.036, 0.008, glassM('#ffffff', 0.14)), 0, 0.02, 0));
  g.add(at(rbox(0.031, 0.032, 0.031, 0.006, mat(color, { rough: metal ? 0.15 : 0.3, metal: metal ? 1 : 0, envInt: metal ? 1 : 0.6 })), 0, 0.019, 0));
  g.add(at(cyl(0.008, 0.008, 0.008, glassM('#ffffff', 0.4), 12), 0, 0.044, 0));
  g.add(at(cyl(0.0085, 0.0085, 0.05, mat(cap, { rough: 0.25, clearcoat: 0.8 }), 20), 0, 0.072, 0));
  return g;
}

// =================================================================== bedding
function beddingSet({ color = '#f4f2ec', color2 = '#ffffff', tex = null, band: bc = '#7f187f', title = 'NESTLY', key }) {
  const g = new THREE.Group();
  const m = tex ? mat('#ffffff', { map: tex, rough: 0.95 }) : MAT.fabric(color);
  const m2 = tex ? mat('#ffffff', { map: tex, rough: 0.95 }) : MAT.fabric(color2);
  g.add(at(rbox(0.42, 0.06, 0.32, 0.024, m2), 0, 0.03, 0));
  g.add(at(rbox(0.41, 0.03, 0.31, 0.012, MAT.fabric(tint(color2, 0.97))), 0, 0.075, 0));
  g.add(at(rbox(0.42, 0.095, 0.32, 0.03, m), 0, 0.1375, 0));
  for (let i = 0; i < 2; i++) g.add(at(box(0.3, 0.002, 0.002, MAT.fabric(tint(color, 0.8)), { cast: false }), 0.04, 0.12 + i * 0.03, 0.1605));
  g.add(at(box(0.12, 0.185, 0.326, mat('#f2ead8', { rough: 0.9 })), 0, 0.0925, 0));
  g.add(at(decal(0.11, 0.17, 'bedband:' + key, (x, w, h) => { x.fillStyle = '#f2ead8'; x.fillRect(0, 0, w, h); x.fillStyle = bc; x.fillRect(0, 0, w, h * 0.18); txt(x, title, w / 2, h * 0.09, h * 0.08, '#ffffff', 900, w * 0.9); x.fillStyle = color; x.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.3); x.strokeStyle = '#333'; x.strokeRect(w * 0.2, h * 0.3, w * 0.6, h * 0.3); txt(x, 'QUEEN', w / 2, h * 0.72, h * 0.07, '#333', 800, w * 0.9); txt(x, 'DUVET · SHEET · 2 SHAMS', w / 2, h * 0.84, h * 0.045, '#555', 600, w * 0.9); }, { tw: 128, transparent: false }), 0, 0.0925, 0.1635));
  return g;
}
const stripeBed = () => labelTexture('bed:ticking', 128, 128, (x, w, h) => { x.fillStyle = '#f2efe6'; x.fillRect(0, 0, w, h); x.fillStyle = '#2b3a66'; for (let i = 0; i < 8; i++) x.fillRect(i * 16 + 4, 0, 5, h); }, { wrap: true, repeat: [3, 3] });
const galaxyBed = () => labelTexture('bed:galaxy', 256, 256, (x, w, h) => {
  const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1b1446'); gr.addColorStop(0.5, '#3a1c71'); gr.addColorStop(1, '#0f2b5b'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 5; i++) { const rg = x.createRadialGradient((i * 97) % w, (i * 61) % h, 2, (i * 97) % w, (i * 61) % h, 70); rg.addColorStop(0, 'rgba(255,120,200,0.35)'); rg.addColorStop(1, 'rgba(255,120,200,0)'); x.fillStyle = rg; x.fillRect(0, 0, w, h); }
  for (let i = 0; i < 160; i++) { x.fillStyle = i % 9 ? 'rgba(255,255,255,0.85)' : '#ffe9a8'; const r = i % 13 ? 1 : 2.2; x.beginPath(); x.arc((i * 73) % w, (i * 151) % h, r, 0, 7); x.fill(); }
}, { wrap: true, repeat: [2, 2] });

// =================================================================== definitions
const B = (o) => ({ category: 'hygiene', stores: ['glow'], tags: ['bathroom'], ...o });
const scentBuff = (scent, o = {}) => ({ type: 'spray', uses: 40, buff: 'scented', buffMin: 300, scent, verb: 'Spritz perfume', ...o });
const lbl = (bg, ink, title, sub) => brandLabel({ bg, ink, title, sub, frac: 1 });

defineItems([
  // ------------------------------------------------------------ fragrance
  B({ id: 'perfume_rose_petal', name: 'Rose Petal Eau de Parfum', price: 68, rarity: 'uncommon', tags: ['glass', 'bathroom'], desc: 'Dewy rose, pink peony and a whisper of musk in a round crystal flacon.', build: () => perfume({ shape: 'flacon', glass: '#fde2ea', liquid: '#f58fb2', capKind: 'crystal', cap: '#f9c6d6', label: 'ROSE', ink: '#a03a5d', key: 'rose' }), use: scentBuff('rose & peony', { mist: '#ffd1e0' }) }),
  B({ id: 'cologne_cedar_sea', name: 'Cedar & Sea Cologne', price: 72, rarity: 'uncommon', tags: ['glass', 'bathroom'], desc: 'Salt spray, cedarwood and vetiver. Smells like a cabin with an ocean view.', build: () => perfume({ shape: 'square', glass: '#cfe3ee', liquid: '#5a9fc8', capKind: 'plastic', cap: '#1b1b1b', label: 'CEDAR & SEA', ink: '#1d3557', labelBg: '#eef5f8', key: 'cedar' }), use: scentBuff('cedar, sea salt & vetiver', { verb: 'Spritz cologne', mist: '#d9f0ff' }) }),
  B({ id: 'perfume_cherry_crush', name: 'Cherry Crush Eau de Toilette', price: 48, tags: ['glass', 'bathroom'], desc: 'Black cherry, cotton candy and vanilla in a heart-shaped bottle. Extremely 2004.', build: () => perfume({ shape: 'heart', glass: '#ff9fb8', liquid: '#d6153f', capKind: 'gold', key: 'cherry' }), use: scentBuff('black cherry & vanilla', { mist: '#ffc2d1', buffMin: 240 }) }),
  B({ id: 'cologne_blue_sport', name: 'Blue Sport Cologne', price: 55, stores: ['glow', 'primo'], tags: ['glass', 'bathroom'], desc: 'Bergamot, mint and "locker room, but nice". Fresh as a cold shower.', build: () => perfume({ shape: 'tall', glass: '#bfe0ff', liquid: '#2e86de', capKind: 'plastic', cap: '#1d3557', label: 'BLUE SPORT', ink: '#ffffff', labelBg: '#1d3557', key: 'bluesport' }), use: scentBuff('bergamot & mint', { verb: 'Spritz cologne', mist: '#d9f0ff', buffMin: 240 }) }),
  B({ id: 'perfume_maison_oud_noir', name: 'Maison No. 7 Oud Noir', price: 345, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', tags: ['glass', 'bathroom'], desc: 'Smoked oud, black leather and saffron in a faceted onyx flacon. Enter rooms differently.', build: () => perfume({ shape: 'octagon', glass: '#1a1a1d', capKind: 'gold', label: 'N°7', ink: '#e0b456', labelBg: '#1a1a1d', key: 'oud' }), use: scentBuff('oud, leather & saffron', { buffMin: 600, mist: '#f2e6c9', needs: { comfort: 4 } }) }),
  B({ id: 'perfume_maison_minuit', name: 'Maison Fleur de Minuit', price: 290, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', tags: ['glass', 'bathroom'], desc: 'Night-blooming jasmine and amber under a hand-cut crystal stopper.', build: () => perfume({ shape: 'stopper', glass: '#e5dcff', liquid: '#8a63d2', cap: '#c9b6ff', label: 'MINUIT', ink: '#3d2a6b', labelBg: '#f6f1ff', key: 'minuit' }), use: scentBuff('night jasmine & amber', { buffMin: 540, mist: '#e6dcff', needs: { comfort: 4 } }) }),
  // ------------------------------------------------------------ mists & deodorant
  B({ id: 'mist_vanilla_cloud', name: 'Vanilla Cloud Body Mist', price: 14, stores: ['glow', 'primo'], desc: 'Warm vanilla and toasted coconut. Spray generously, smell like a bakery.', build: () => mistBottle({ color: '#fbe6cc', ink: '#a0522d', title: 'VANILLA', sub: 'CLOUD MIST', key: 'vanilla' }), use: { type: 'spray', uses: 30, buff: 'scented', buffMin: 150, scent: 'vanilla & coconut', verb: 'Mist yourself', mist: '#fff1dc' } }),
  B({ id: 'mist_citrus_splash', name: 'Citrus Splash Body Mist', price: 14, stores: ['glow', 'primo'], desc: 'Grapefruit, lime zest and a splash of sparkle. A morning in a bottle.', build: () => mistBottle({ color: '#ffe08a', ink: '#e76f51', title: 'CITRUS', sub: 'SPLASH MIST', key: 'citrus' }), use: { type: 'spray', uses: 30, buff: 'scented', buffMin: 150, scent: 'grapefruit & lime', verb: 'Mist yourself', mist: '#fff7d6' } }),
  B({ id: 'deodorant_fresh_cotton', name: 'Fresh Cotton Deodorant', price: 7, stores: ['glow', 'primo', 'freshcart'], desc: '48-hour protection that smells like laundry day.', build: () => { const g = new THREE.Group(); const b = cyl(0.03, 0.03, 0.09, plastic('#e8f1fb', 0.3), 28); b.scale.z = 0.55; g.add(at(b, 0, 0.045, 0)); const c = cyl(0.031, 0.031, 0.035, plastic('#2b59c3', 0.3), 28); c.scale.z = 0.56; g.add(at(c, 0, 0.1075, 0)); g.add(plate(0.04, 0.05, 'deo', lbl('#e8f1fb', '#2b59c3', 'COTTON', '48H FRESH'), 0.0168, 0.045)); return g; }, use: { type: 'skincare', uses: 40, verb: 'Apply deodorant', needs: { hygiene: 8 }, buff: 'fresh', buffMin: 240, sound: 'squish' } }),
  B({ id: 'bodyspray_arctic', name: 'Arctic Blast Body Spray', price: 6, stores: ['primo', 'freshcart'], desc: 'An icy cloud of "is that axe?". Use responsibly. Please.', build: () => aerosol({ color: '#0b3d91', cap: '#111', key: 'arctic', draw: (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b3d91'); gr.addColorStop(1, '#03133a'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.strokeStyle = '#8fd3ff'; x.lineWidth = 4; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(w * 0.42, h * (0.2 + i * 0.05)); x.lineTo(w * 0.58, h * (0.3 + i * 0.05)); x.stroke(); } txt(x, 'ARCTIC', w / 2, h * 0.55, h * 0.13, '#ffffff', 900, w * 0.3); txt(x, 'BLAST', w / 2, h * 0.68, h * 0.09, '#8fd3ff', 900, w * 0.3); } }), use: { type: 'spray', uses: 30, buff: 'fresh', buffMin: 120, needs: { hygiene: 5 }, scent: 'arctic mint', verb: 'Spray body spray', mist: '#e9f6ff' } }),
  // ------------------------------------------------------------ room fragrance
  B({ id: 'roomspray_linen_breeze', name: 'Linen Breeze Room Spray', price: 8, stores: ['glow', 'primo', 'freshcart'], tags: [], desc: 'Fresh laundry on a sunny line. Two sprays and the room forgets last night\'s takeout.', build: () => aerosol({ color: '#e9f2fb', cap: '#7fb3e0', key: 'linen', r: 0.03, h: 0.18, draw: (x, w, h) => { x.fillStyle = '#eef5fc'; x.fillRect(0, 0, w, h); x.fillStyle = '#9cc5e8'; for (let i = 0; i < 4; i++) { x.beginPath(); for (let u = 0; u <= w; u += 6) x.lineTo(u, h * (0.12 + i * 0.05) + Math.sin(u * 0.04 + i) * 4); x.lineTo(w, 0); x.lineTo(0, 0); x.fill(); } txt(x, 'LINEN', w / 2, h * 0.55, h * 0.12, '#2f5f8a', 900, w * 0.3); txt(x, 'BREEZE · ROOM SPRAY', w / 2, h * 0.68, h * 0.05, '#2f5f8a', 700, w * 0.3); } }), use: { type: 'spray', uses: 30, buff: 'freshRoom', buffMin: 240, needs: { comfort: 3 }, scent: 'clean linen', verb: 'Freshen the room', mist: '#f2f8ff' } }),
  B({ id: 'roommist_fig_cedar', name: 'Fig & Cedar Room Mist', price: 28, stores: ['glow', 'nestly'], tags: ['glass'], rarity: 'uncommon', desc: 'Green fig, cedar and a hint of smoke in an apothecary bottle. Instant boutique-hotel lobby.', build: () => { const g = amberPump({ glass: '#5c3714', title: 'FIG & CEDAR', sub: 'ROOM MIST', key: 'fig', h: 0.17 }); return g; }, use: { type: 'spray', uses: 40, buff: 'freshRoom', buffMin: 360, needs: { comfort: 5 }, scent: 'green fig & cedar', verb: 'Mist the room', mist: '#eef3e6' } }),
  // ------------------------------------------------------------ sheet masks
  ...[
    ['sheetmask_panda', 'Hydrating Panda Sheet Mask', '#eef1f4', '#f4f4f4', 4.5, 'glowing', 'Hyaluronic essence and a very judgemental panda face. Wear for 20 min of pure silliness.', 'PANDA', 'HYDRATING MASK', (x, cx, cy, r) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.fillStyle = '#1b1b1b'; for (const s of [-1, 1]) { x.beginPath(); x.arc(cx + s * r * 0.8, cy - r * 0.8, r * 0.35, 0, 7); x.fill(); x.beginPath(); x.ellipse(cx + s * r * 0.38, cy - r * 0.05, r * 0.2, r * 0.28, s * 0.5, 0, 7); x.fill(); } x.beginPath(); x.ellipse(cx, cy + r * 0.32, r * 0.12, r * 0.08, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(cx + s * r * 0.36, cy - r * 0.08, r * 0.06, 0, 7); x.fill(); } }],
    ['sheetmask_green_tea', 'Green Tea Calming Mask', '#d9ecd0', '#cfe8c0', 4.5, 'glowing', 'Matcha-soaked cotton that cools you down after a long day.', 'GREEN TEA', 'CALMING MASK', (x, cx, cy, r) => { x.fillStyle = '#6a994e'; for (const s of [-1, 1]) { x.save(); x.translate(cx + s * r * 0.3, cy); x.rotate(s * 0.5); x.beginPath(); x.ellipse(0, 0, r * 0.35, r * 0.85, 0, 0, 7); x.fill(); x.strokeStyle = '#d9ecd0'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -r * 0.7); x.lineTo(0, r * 0.7); x.stroke(); x.restore(); } }],
    ['sheetmask_charcoal', 'Charcoal Detox Sheet Mask', '#3a3a3d', '#2b2b2b', 5, 'glowing', 'Bamboo charcoal for your pores, plus the thrill of looking like a villain.', 'CHARCOAL', 'DETOX MASK', (x, cx, cy, r) => { x.fillStyle = '#1b1b1b'; x.beginPath(); x.ellipse(cx, cy, r * 0.8, r, 0, 0, 7); x.fill(); x.fillStyle = '#f2f2f2'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * r * 0.32, cy - r * 0.15, r * 0.16, r * 0.1, 0, 0, 7); x.fill(); } x.fillRect(cx - r * 0.25, cy + r * 0.4, r * 0.5, r * 0.06); }],
  ].map(([id, name, bg, overlay, price, buff, desc, title, sub, face]) => B({ id, name, price, stores: ['glow', 'primo'], tags: ['bathroom'], desc, build: () => sachet({ bg, key: id, draw: maskArt(bg === '#3a3a3d' ? '#d8d8d8' : bg, title, sub, face) }), use: { type: 'skincare', single: true, overlay, overlaySec: 25, buff, buffMin: 240, needs: { comfort: 6, fun: 4 }, verb: 'Apply sheet mask', sound: 'squish' } })),
  B({ id: 'sheetmask_gold_foil', name: '24K Gold Foil Mask', price: 12, stores: ['glow', 'luxe'], rarity: 'uncommon', desc: 'Actual flakes of gold leaf for skin that looks expensive. Single use, maximum drama.', build: () => sachet({ bg: '#e9c46a', key: 'goldmask', draw: maskArt('#f3dc9b', '24K GOLD', 'LUMINOUS MASK', (x, cx, cy, r) => { const gr = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gr.addColorStop(0, '#b8860b'); gr.addColorStop(0.5, '#ffe58a'); gr.addColorStop(1, '#b8860b'); x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, r * 0.8, r, 0, 0, 7); x.fill(); x.fillStyle = '#f3dc9b'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * r * 0.32, cy - r * 0.15, r * 0.15, r * 0.09, 0, 0, 7); x.fill(); } }) }), use: { type: 'skincare', single: true, overlay: '#e9c46a', overlaySec: 30, buff: 'pampered', buffMin: 300, needs: { comfort: 10, fun: 5 }, verb: 'Apply gold mask', sound: 'squish' } }),
  // ------------------------------------------------------------ skincare
  B({ id: 'serum_vitamin_c', name: 'Vitamin C Glow Serum', price: 24, desc: 'Three drops of bottled sunshine. Results may include being asked "did you sleep?".', build: () => dropperBottle({ key: 'vitc' }), use: { type: 'skincare', uses: 20, verb: 'Apply serum', buff: 'glowing', buffMin: 300, needs: { comfort: 3 }, sound: 'squish' } }),
  B({ id: 'moisturizer_cloud_cream', name: 'Cloud Cream Moisturizer', price: 32, stores: ['glow', 'primo'], desc: 'Whipped ceramide cream that feels like a pillow for your face.', build: () => creamJar({ key: 'cloud' }), use: { type: 'skincare', uses: 25, verb: 'Moisturize', buff: 'glowing', buffMin: 240, needs: { comfort: 4 }, sound: 'squish' } }),
  B({ id: 'eyepatch_gold_hydrogel', name: 'Gold Hydrogel Eye Patches', price: 22, desc: '30 pairs of shimmering under-eye patches. Undo one (1) late night at a time.', build: () => { const g = new THREE.Group(); g.add(lathe([[0.0001, 0], [0.04, 0], [0.042, 0.005], [0.042, 0.04], [0.0001, 0.04]], glassM('#fff8e6', 0.3), 32)); for (let i = 0; i < 7; i++) { const p = torus(0.014, 0.005, mat('#e8b94a', { rough: 0.2, metal: 0.7, opacity: 0.9, transparent: true }), 6, 12, PI); p.rotation.set(-PI / 2 + 0.4, i * 0.9, 0); p.scale.set(1, 1, 0.35); g.add(at(p, Math.cos(i * 0.9) * 0.012, 0.008 + i * 0.004, Math.sin(i * 0.9) * 0.012)); } g.add(at(cyl(0.043, 0.043, 0.016, GOLD(), 32), 0, 0.048, 0)); g.add(band(0.0423, 0.018, 0.02, 'eyegold', brandLabel({ bg: '#1b1b1b', ink: '#e8b94a', title: 'GOLD EYE', frac: 0.3 }), { th: 64 })); return g; }, use: { type: 'skincare', uses: 15, verb: 'Apply eye patches', overlay: '#f3d99a', overlaySec: 15, buff: 'glowing', buffMin: 240, needs: { energy: 3, comfort: 3 }, sound: 'squish' } }),
  B({ id: 'lipbalm_cherry', name: 'Cherry Lip Balm', price: 3.5, stores: ['glow', 'primo', 'freshcart'], tags: [], desc: 'Shea butter, cherry tint, pocket-sized. You will lose it within a week.', build: () => { const g = new THREE.Group(); g.add(at(cyl(0.0085, 0.0085, 0.045, plastic('#ffffff', 0.3), 20), 0, 0.0225, 0)); g.add(band(0.0087, 0.03, 0.022, 'lipbalm', brandLabel({ bg: '#c1121f', ink: '#ffffff', title: 'CHERRY', frac: 0.42 }), { tw: 256, th: 128 })); g.add(at(cyl(0.0088, 0.0088, 0.024, plastic('#c1121f', 0.25), 20), 0, 0.057, 0)); return g; }, use: { type: 'skincare', uses: 30, verb: 'Apply lip balm', needs: { comfort: 2 }, buff: 'glowing', buffMin: 60, sound: 'squish' } }),
  B({ id: 'sunscreen_spf50', name: 'Daily SPF 50 Sunscreen', price: 16, stores: ['glow', 'primo', 'freshcart'], desc: 'Invisible, non-greasy, dermatologist-approved. Yes, even indoors. Yes, even today.', build: () => showerBottle({ color: '#ffd166', cap: '#f77f00', ink: '#9c4a00', title: 'SPF 50', sub: 'DAILY SUNSCREEN', accent: '#ff9f1c', key: 'spf', h: 0.15, w: 0.058, d: 0.034, flip: true }), use: { type: 'skincare', uses: 20, verb: 'Apply sunscreen', buff: 'glowing', buffMin: 180, needs: { comfort: 2 }, sound: 'squish' } }),
  B({ id: 'claymask_pink', name: 'Pink Clay Mask', price: 26, desc: 'French pink clay that dries to a satisfying crackle. Ten minutes of not talking.', build: () => { const g = new THREE.Group(); g.add(lathe([[0.0001, 0], [0.04, 0], [0.042, 0.006], [0.042, 0.038], [0.038, 0.042], [0.036, 0.034], [0.0001, 0.034]], MAT.ceramic('#ffffff'), 32)); g.add(at(cyl(0.0365, 0.0365, 0.003, mat('#e8a0a8', { rough: 0.9 }), 32), 0, 0.035, 0)); g.add(band(0.0423, 0.02, 0.02, 'clay', brandLabel({ bg: '#ffffff', ink: '#c0596a', title: 'PINK CLAY', frac: 0.3 }), { th: 64 })); const lid = cyl(0.043, 0.043, 0.014, MAT.ceramic('#f4c6cc'), 32); lid.rotation.set(1.2, 0, 0.1); g.add(at(lid, 0.012, 0.03, -0.055)); return g; }, use: { type: 'skincare', uses: 8, verb: 'Apply clay mask', overlay: '#e8a5a5', overlaySec: 30, buff: 'pampered', buffMin: 240, needs: { comfort: 8, hygiene: 6 }, sound: 'squish' } }),
  B({ id: 'cream_maison_regenerante', name: 'Maison La Crème Régénérante', price: 380, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', tags: ['glass', 'bathroom'], desc: 'Sea-kelp ferment, gold peptides, a jar heavier than your laptop. Skin, forgiven.', build: () => creamJar({ color: '#f3efe7', ink: '#3b3530', title: 'LA CRÈME', sub: 'MAISON LUXE', key: 'lacreme', r: 0.044, h: 0.05, lidGold: true }), use: { type: 'skincare', uses: 30, verb: 'Apply La Crème', buff: 'pampered', buffMin: 480, needs: { comfort: 10 }, sound: 'squish' } }),
  // ------------------------------------------------------------ shower
  B({ id: 'shampoo_argan_oil', name: 'Argan Oil Shampoo', price: 12, stores: ['glow', 'primo'], desc: 'Moroccan argan oil for glossy, frizz-free hair. Used automatically when you shower.', build: () => showerBottle({ color: '#f0dcb4', cap: '#5a3a1a', ink: '#5a3a1a', title: 'ARGAN', sub: 'SHAMPOO', accent: '#d9a441', key: 'arganS' }), use: { type: 'shampoo', uses: 14, scent: 'argan & warm amber' } }),
  B({ id: 'conditioner_argan_oil', name: 'Argan Oil Conditioner', price: 12, stores: ['glow', 'primo'], desc: 'The silky other half to the argan shampoo. Detangles even your worst decisions.', build: () => showerBottle({ color: '#5a3a1a', cap: '#f0dcb4', ink: '#f0dcb4', title: 'ARGAN', sub: 'CONDITIONER', accent: '#d9a441', key: 'arganC', flip: true }), use: { type: 'conditioner', uses: 14, scent: 'argan & warm amber' } }),
  B({ id: 'shampoo_tea_tree', name: 'Tea Tree Mint Shampoo', price: 11, stores: ['glow', 'primo', 'freshcart'], desc: 'A tingly scalp wake-up call with tea tree and peppermint.', build: () => showerBottle({ color: '#d8f3dc', cap: '#2d6a4f', ink: '#1b4332', title: 'TEA TREE', sub: 'MINT SHAMPOO', accent: '#52b788', key: 'teatree', h: 0.21, w: 0.066 }), use: { type: 'shampoo', uses: 12, scent: 'tea tree & peppermint' } }),
  B({ id: 'conditioner_coconut_milk', name: 'Coconut Milk Conditioner', price: 10, stores: ['glow', 'primo', 'freshcart'], desc: 'Pairs with the Coconut Shampoo for a full tropical-vacation hair situation.', build: () => showerBottle({ color: '#fefae0', cap: '#bc6c25', ink: '#7f4a1e', title: 'COCONUT', sub: 'CONDITIONER', accent: '#dda15e', key: 'cocoC', flip: true }), use: { type: 'conditioner', uses: 12, scent: 'coconut & vanilla' } }),
  B({ id: 'bodywash_cherry_blossom', name: 'Cherry Blossom Body Wash', price: 9, stores: ['glow', 'primo'], desc: 'Silky foam that smells like a spring afternoon in a park.', build: () => pumpBottle({ color: '#ffd6e0', label: 'BLOSSOM', accent: '#c9184a', h: 0.22, r: 0.037 }), use: { type: 'bodywash', uses: 12, scent: 'cherry blossom & white tea' } }),
  B({ id: 'bodywash_charcoal_cedar', name: 'Charcoal & Cedar Body Wash', price: 10, stores: ['glow', 'primo'], desc: 'Deep-cleaning charcoal with smoky cedar. For people who own a flannel.', build: () => showerBottle({ color: '#2b2b2e', cap: '#c9a86a', ink: '#e9e4d8', title: 'CHARCOAL', sub: 'CEDAR BODY WASH', accent: '#4a4a4f', key: 'charcoalBW', h: 0.22, flip: true }), use: { type: 'bodywash', uses: 12, scent: 'charcoal & cedar' } }),
  // ------------------------------------------------------------ bath bombs
  ...[
    ['bathbomb_galaxy', 'Galaxy Bath Bomb', '#6a3fc7', 8, null, ['#2b1a6b', '#ff70d4', '#4cc9f0'], 'star', 'Swirls the tub into a purple nebula with a shimmer of stardust.'],
    ['bathbomb_rose_petal', 'Rose Petal Bath Bomb', '#ff8fb1', 7, '#ffffff', null, 'petals', 'Fizzes pink and releases real dried rose petals. Romance level: candles optional.'],
    ['bathbomb_ocean_mist', 'Ocean Mist Bath Bomb', '#4cc9f0', 7, '#ffffff', ['#90e0ef', '#0077b6'], null, 'Sea salt and eucalyptus turn your bath a lagoon blue.'],
    ['bathbomb_honey_lemon', 'Honey Lemon Bath Bomb', '#ffd23f', 7, '#fff3b0', null, 'honey', 'Golden, zesty and sweet. Like a hot toddy you can sit in.'],
    ['bathbomb_matcha_mint', 'Matcha Mint Bath Bomb', '#8fcf7a', 7, '#e9f5db', null, 'leaf', 'Green tea and spearmint for a very zen, very green soak.'],
    ['bathbomb_golden_hour', 'Golden Hour Glitter Bomb', '#f4a259', 12, '#ffe8a3', ['#ffbe0b', '#fb5607'], 'glitter', 'Sunset-orange fizz with biodegradable gold glitter. Your tub becomes the main character.'],
  ].map(([id, name, color, price, speck, swirl, topping, desc]) => B({ id, name, price, stores: ['glow', 'primo'], rarity: price > 10 ? 'uncommon' : 'common', tags: ['bathroom', 'ball'], desc, build: () => bathBomb({ color, speck: speck || '#ffffff', swirl, topping, key: id }), use: { type: 'bathbomb', color } })),
  // ------------------------------------------------------------ soaps
  B({ id: 'soap_oatmeal_honey', name: 'Oatmeal & Honey Bar Soap', price: 8, stores: ['glow', 'freshcart'], desc: 'Cold-pressed oat bar on a little cedar dish. Gentle, cozy and very photogenic.', build: () => soapBar({ color: '#ead7b0', speck: '#a8834f', stamp: 'OAT', key: 'oat' }), use: { type: 'soap', uses: 30, scent: 'oat & honey' } }),
  B({ id: 'soap_charcoal_bar', name: 'Activated Charcoal Bar', price: 9, stores: ['glow'], desc: 'Jet-black detox bar that lathers bright white. Science? Magic? Both.', build: () => soapBar({ color: '#2a2a2c', stamp: 'DETOX', ink: '#555559', dish: '#d9c3a0', key: 'charcoal' }), use: { type: 'soap', uses: 30, scent: 'charcoal & tea tree' } }),
  B({ id: 'handsoap_sweet_orange', name: 'Sweet Orange Hand Soap', price: 6.5, stores: ['glow', 'primo', 'freshcart'], desc: 'Zesty orange foam that makes handwashing almost fun.', build: () => pumpBottle({ color: '#ffd8a8', label: 'ORANGE', accent: '#e8590c', h: 0.18 }), use: { type: 'soap', uses: 25, scent: 'sweet orange' } }),
  B({ id: 'handsoap_maison_resurrection', name: 'Maison Aromatique Hand Wash', price: 48, stores: ['luxe', 'glow'], brand: 'Maison Luxe', rarity: 'uncommon', tags: ['glass', 'bathroom'], desc: 'Mandarin rind, rosemary and cedar in an amber apothecary bottle. The flex of fancy sinks.', build: () => amberPump({ key: 'maisonsoap' }), use: { type: 'soap', uses: 40, scent: 'mandarin, rosemary & cedar' } }),
  // ------------------------------------------------------------ dental
  B({ id: 'toothpaste_charcoal_white', name: 'Charcoal Whitening Toothpaste', price: 6, stores: ['glow', 'primo', 'freshcart'], desc: 'Jet-black paste, sparkling-white results. Terrifying the first time.', build: () => squeezeTube({ color: '#1f1f22', cap: '#c9a86a', accent: '#c9a86a', label: 'CHARCOAL' }), use: { type: 'toothpaste', uses: 20, color: '#1b1b1b' } }),
  B({ id: 'toothpaste_cinnamon_spark', name: 'Cinnamon Spark Toothpaste', price: 4.5, stores: ['glow', 'primo', 'freshcart'], desc: 'Spicy-sweet red gel for people who find mint boring.', build: () => squeezeTube({ color: '#ffffff', cap: '#c1121f', accent: '#c1121f', label: 'CINNAMON' }), use: { type: 'toothpaste', uses: 20, color: '#e63946' } }),
  B({ id: 'toothbrush_rose_sonic', name: 'Rose Gold Sonic Toothbrush', price: 89, stores: ['glow', 'volt'], rarity: 'uncommon', desc: 'Five modes, a smart timer and a charging dock prettier than most jewellery.', build: () => sonicBrush({}), use: { type: 'toothbrush', electric: true } }),
  // ------------------------------------------------------------ hair
  B({ id: 'hairdryer_ionic_pro', name: 'Ionic Pro Hair Dryer', price: 79, stores: ['glow', 'primo'], rarity: 'uncommon', desc: '1875 watts of ionic airflow in blush pink. Hold it and blow-dry for a good hair day.', build: () => hairDryer({}), use: { type: 'hairdryer' } }),
  B({ id: 'straightener_ceramic', name: 'Ceramic Flat Iron', price: 59, stores: ['glow', 'primo'], desc: 'Floating ceramic plates heat up in 30 seconds. Sleek hair, sleek vibes.', build: () => flatIron({}), use: { type: 'hairdryer' } }),
  // ------------------------------------------------------------ vitamins
  B({ id: 'vitamins_multi_gummies', name: 'Daily Multivitamin Gummies', price: 12, stores: ['glow', 'primo', 'freshcart'], tags: [], desc: 'Fruity gummies with all the letters of the vitamin alphabet. Two a day, not twelve.', build: () => gummyJar({ key: 'multi' }), use: { type: 'vitamins', uses: 30, buff: 'vitalized', needs: { energy: 4 } } }),
  B({ id: 'vitamins_melatonin_sleep', name: 'Sleepy Melatonin Gummies', price: 11, stores: ['glow', 'primo', 'freshcart'], tags: [], desc: 'Blackberry-lavender melatonin chews. Take one, get dreamy, sleep like a cat.', build: () => gummyJar({ clear: false, jar: '#3d2a6b', lid: '#b9a0e0', title: 'SLEEPY', sub: 'MELATONIN', ink: '#ffe9a8', key: 'melatonin' }), use: { type: 'vitamins', uses: 30, buff: 'dreamy', needs: { comfort: 4 } } }),
  // ------------------------------------------------------------ nails
  ...[
    ['nailpolish_cherry_red', 'Cherry Red Nail Polish', '#b5121b', false, 9, 'Classic glossy red. Two coats, instant confidence.'],
    ['nailpolish_lilac_haze', 'Lilac Haze Nail Polish', '#b9a0e0', false, 9, 'Soft pastel lilac that goes with every hoodie in your wardrobe.'],
    ['nailpolish_chrome_mirror', 'Chrome Mirror Nail Polish', '#c9ccd2', true, 12, 'Liquid-metal chrome finish. You will stare at your hands all day.'],
  ].map(([id, name, color, metal, price, desc]) => B({ id, name, price, stores: ['glow', 'primo'], tags: ['glass', 'bathroom'], rarity: metal ? 'uncommon' : 'common', desc, build: () => nailPolish({ color, metal }), use: { type: 'skincare', uses: 10, verb: 'Paint nails', buff: 'pampered', buffMin: 180, needs: { fun: 4, comfort: 3 }, sound: 'click' } })),
]);

// =================================================================== bedding (Nestly)
const BED = (o) => ({ category: 'decor', stores: ['nestly'], tags: ['soft'], packaging: 'box', ...o });
defineItems([
  BED({ id: 'bedding_cloud_white', name: 'Cloud White Percale Bedding Set', price: 129, desc: 'Crisp 400-thread-count percale in hotel white. Aim at your bed and press R to change the sheets.', build: () => beddingSet({ color: '#f6f4ee', color2: '#ffffff', key: 'white' }), use: { type: 'bedding', color: '#f6f4ee', color2: '#ffffff' } }),
  BED({ id: 'bedding_sage_linen', name: 'Sage Washed Linen Bedding Set', price: 189, rarity: 'uncommon', desc: 'Stonewashed European linen in soft sage. Wrinkles are part of the charm.', build: () => beddingSet({ color: '#a3b49a', color2: '#e3e9db', key: 'sage' }), use: { type: 'bedding', color: '#a3b49a', color2: '#e3e9db' } }),
  BED({ id: 'bedding_terracotta_linen', name: 'Terracotta Linen Bedding Set', price: 179, rarity: 'uncommon', desc: 'Sun-baked terracotta with oat shams. Desert-boutique-hotel energy.', build: () => beddingSet({ color: '#c46a4b', color2: '#efd9c8', key: 'terracotta' }), use: { type: 'bedding', color: '#c46a4b', color2: '#efd9c8' } }),
  BED({ id: 'bedding_navy_ticking', name: 'Navy Ticking Stripe Bedding Set', price: 139, desc: 'Classic navy ticking stripes on cream cotton. Like sleeping in a seaside cottage.', build: () => beddingSet({ color: '#2b3a66', color2: '#f2efe6', tex: stripeBed(), band: '#2b3a66', key: 'ticking' }), use: { type: 'bedding', color: '#ffffff', color2: '#ffffff', map: stripeBed } }),
  BED({ id: 'bedding_blush_velvet', name: 'Blush Velvet Duvet Set', price: 159, rarity: 'uncommon', desc: 'Plush blush-pink velvet that begs for a weekend lie-in.', build: () => beddingSet({ color: '#e8b4b8', color2: '#f6e1e3', key: 'blush' }), use: { type: 'bedding', color: '#e8b4b8', color2: '#f6e1e3' } }),
  BED({ id: 'bedding_galaxy_dreams', name: 'Galaxy Dreams Bedding Set', price: 119, rarity: 'rare', desc: 'A nebula-print duvet with a scatter of stars. Fall asleep somewhere past Saturn.', build: () => beddingSet({ color: '#3a1c71', color2: '#1b1446', tex: galaxyBed(), band: '#1b1446', key: 'galaxy' }), use: { type: 'bedding', color: '#ffffff', color2: '#ffffff', map: galaxyBed } }),
]);
void rot; void box;
