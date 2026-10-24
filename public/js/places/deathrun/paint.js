// Everything in the Pharaoh's tomb is painted on canvases here: sandstone
// ashlar, walls carved with columns of hieroglyphs, painted reliefs of the
// gods (Anubis, Horus, Thoth, Sobek, Bastet, Ra, Osiris and the Pharaoh
// himself) walking in procession under a khekher frieze, starry tomb
// ceilings, papyrus columns, granite, basalt, gold, lapis lazuli, faience,
// sand, palm fronds, reeds, flames and the sunset sky.
// The hieroglyphs are a small library of real signs (ankh, wedjat eye,
// scarab, owl, vulture, reed leaf, water, bread, mouth, viper, hand, leg,
// house, sun, feather of Maat, djed, was sceptre, cobra, quail chick, lion,
// basket, cloth, star, jar, duck, ka arms, seated man, sedge) drawn as paths.
import * as THREE from 'three';

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
export function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = o.clampS || o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = o.clampT || o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 8;
  return t;
}
export function grain(x, w, h, amt, r = Math.random) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
export function blobs(x, w, h, n, col, r0, r1, r = Math.random) {
  const clear = col.replace(/,\s*[\d.]+\)$/, ',0)');
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = r() * h, rr = r0 + r() * (r1 - r0);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (cx + ox + rr < 0 || cx + ox - rr > w || cy + oy + rr < 0 || cy + oy - rr > h) continue;
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr); g.addColorStop(0, col); g.addColorStop(1, clear);
      x.fillStyle = g; x.fillRect(cx + ox - rr, cy + oy - rr, rr * 2, rr * 2);
    }
  }
}

// --- hieroglyphs (unit square, y down; fill and stroke in the current colours) ------------------------------------------------
const PI2 = Math.PI * 2;
function poly(x, pts, close = true) { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); if (close) x.closePath(); }
export const GLYPHS = {
  ankh(x) { x.lineWidth = 0.09; x.beginPath(); x.ellipse(0.5, 0.22, 0.14, 0.18, 0, 0, PI2); x.stroke(); x.fillRect(0.2, 0.4, 0.6, 0.09); x.fillRect(0.455, 0.4, 0.09, 0.56); },
  eye(x) {
    x.lineWidth = 0.065;
    x.beginPath(); x.moveTo(0.08, 0.36); x.quadraticCurveTo(0.5, 0.1, 0.92, 0.36); x.quadraticCurveTo(0.5, 0.58, 0.08, 0.36); x.stroke();
    x.beginPath(); x.arc(0.5, 0.35, 0.1, 0, PI2); x.fill();
    x.beginPath(); x.moveTo(0.08, 0.16); x.quadraticCurveTo(0.5, 0.0, 0.95, 0.18); x.stroke();
    x.beginPath(); x.moveTo(0.4, 0.47); x.lineTo(0.3, 0.92); x.stroke();
    x.beginPath(); x.moveTo(0.56, 0.48); x.quadraticCurveTo(0.6, 0.78, 0.8, 0.8); x.quadraticCurveTo(0.95, 0.72, 0.84, 0.6); x.stroke();
  },
  scarab(x) {
    x.beginPath(); x.ellipse(0.5, 0.62, 0.2, 0.27, 0, 0, PI2); x.fill();
    x.beginPath(); x.ellipse(0.5, 0.31, 0.12, 0.07, 0, 0, PI2); x.fill();
    x.beginPath(); x.arc(0.5, 0.11, 0.09, 0, PI2); x.fill();
    x.lineWidth = 0.05;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(0.5 + s * 0.16, 0.5 + i * 0.13); x.lineTo(0.5 + s * 0.36, 0.42 + i * 0.2); x.stroke(); }
  },
  owl(x) {
    x.beginPath(); x.ellipse(0.42, 0.6, 0.22, 0.3, -0.2, 0, PI2); x.fill();
    x.beginPath(); x.arc(0.6, 0.28, 0.15, 0, PI2); x.fill();
    poly(x, [0.5, 0.18, 0.55, 0.04, 0.6, 0.16]); x.fill(); poly(x, [0.66, 0.16, 0.74, 0.04, 0.75, 0.2]); x.fill();
    poly(x, [0.73, 0.28, 0.84, 0.34, 0.73, 0.38]); x.fill();
    poly(x, [0.22, 0.78, 0.06, 0.96, 0.32, 0.88]); x.fill();
    x.lineWidth = 0.05; x.beginPath(); x.moveTo(0.45, 0.88); x.lineTo(0.45, 0.98); x.moveTo(0.55, 0.86); x.lineTo(0.58, 0.98); x.stroke();
  },
  vulture(x) {
    x.beginPath(); x.ellipse(0.42, 0.62, 0.26, 0.2, -0.35, 0, PI2); x.fill();
    x.lineWidth = 0.08; x.beginPath(); x.moveTo(0.58, 0.48); x.quadraticCurveTo(0.68, 0.3, 0.64, 0.18); x.stroke();
    x.beginPath(); x.arc(0.66, 0.16, 0.07, 0, PI2); x.fill();
    poly(x, [0.7, 0.12, 0.84, 0.18, 0.72, 0.22]); x.fill();
    poly(x, [0.2, 0.72, 0.02, 0.9, 0.3, 0.82]); x.fill();
    x.lineWidth = 0.05; x.beginPath(); x.moveTo(0.42, 0.78); x.lineTo(0.42, 0.98); x.moveTo(0.52, 0.76); x.lineTo(0.56, 0.98); x.stroke();
  },
  reed(x) { x.beginPath(); x.moveTo(0.46, 0.98); x.bezierCurveTo(0.3, 0.6, 0.4, 0.2, 0.62, 0.02); x.bezierCurveTo(0.6, 0.3, 0.58, 0.6, 0.56, 0.98); x.closePath(); x.fill(); },
  water(x) { x.lineWidth = 0.07; x.beginPath(); x.moveTo(0.04, 0.5); for (let i = 0; i < 8; i++) x.lineTo(0.04 + (i + 0.5) * 0.115, i % 2 ? 0.42 : 0.58); x.lineTo(0.96, 0.5); x.stroke(); },
  loaf(x) { x.beginPath(); x.arc(0.5, 0.78, 0.3, Math.PI, 0); x.closePath(); x.fill(); },
  mouth(x) { x.beginPath(); x.moveTo(0.06, 0.5); x.quadraticCurveTo(0.5, 0.28, 0.94, 0.5); x.quadraticCurveTo(0.5, 0.72, 0.06, 0.5); x.fill(); },
  viper(x) {
    x.lineWidth = 0.1; x.beginPath(); x.moveTo(0.06, 0.66); x.bezierCurveTo(0.25, 0.5, 0.4, 0.8, 0.6, 0.62); x.quadraticCurveTo(0.7, 0.54, 0.78, 0.6); x.stroke();
    x.beginPath(); x.ellipse(0.82, 0.58, 0.09, 0.06, 0, 0, PI2); x.fill();
    x.lineWidth = 0.04; x.beginPath(); x.moveTo(0.8, 0.52); x.lineTo(0.76, 0.4); x.moveTo(0.86, 0.52); x.lineTo(0.88, 0.4); x.stroke();
  },
  hand(x) { poly(x, [0.08, 0.56, 0.7, 0.5, 0.94, 0.54, 0.94, 0.62, 0.7, 0.64, 0.08, 0.68]); x.fill(); poly(x, [0.5, 0.5, 0.66, 0.38, 0.72, 0.42, 0.6, 0.52]); x.fill(); },
  leg(x) { poly(x, [0.42, 0.04, 0.54, 0.04, 0.56, 0.82, 0.86, 0.84, 0.86, 0.94, 0.4, 0.94]); x.fill(); },
  house(x) { x.lineWidth = 0.08; poly(x, [0.4, 0.84, 0.12, 0.84, 0.12, 0.2, 0.88, 0.2, 0.88, 0.84, 0.6, 0.84], false); x.stroke(); },
  sun(x) { x.lineWidth = 0.09; x.beginPath(); x.arc(0.5, 0.5, 0.3, 0, PI2); x.stroke(); x.beginPath(); x.arc(0.5, 0.5, 0.08, 0, PI2); x.fill(); },
  feather(x) { x.beginPath(); x.moveTo(0.48, 0.98); x.lineTo(0.44, 0.3); x.bezierCurveTo(0.42, 0.1, 0.56, 0.0, 0.68, 0.08); x.bezierCurveTo(0.6, 0.12, 0.6, 0.3, 0.6, 0.5); x.lineTo(0.56, 0.98); x.closePath(); x.fill(); },
  djed(x) { x.fillRect(0.4, 0.3, 0.2, 0.68); for (let i = 0; i < 4; i++) x.fillRect(0.22, 0.06 + i * 0.07, 0.56, 0.045); x.fillRect(0.3, 0.92, 0.4, 0.06); },
  was(x) {
    x.fillRect(0.46, 0.18, 0.08, 0.72);
    poly(x, [0.46, 0.18, 0.4, 0.06, 0.66, 0.02, 0.62, 0.1, 0.54, 0.12, 0.54, 0.22]); x.fill();
    x.lineWidth = 0.06; x.beginPath(); x.moveTo(0.5, 0.88); x.lineTo(0.42, 0.98); x.moveTo(0.5, 0.88); x.lineTo(0.58, 0.98); x.stroke();
  },
  cobra(x) {
    x.beginPath(); x.ellipse(0.56, 0.32, 0.14, 0.24, 0, 0, PI2); x.fill();
    x.lineWidth = 0.1; x.beginPath(); x.moveTo(0.56, 0.5); x.bezierCurveTo(0.56, 0.8, 0.2, 0.7, 0.18, 0.9); x.lineTo(0.7, 0.94); x.stroke();
  },
  chick(x) {
    x.beginPath(); x.ellipse(0.46, 0.6, 0.2, 0.24, 0.3, 0, PI2); x.fill();
    x.beginPath(); x.arc(0.62, 0.3, 0.11, 0, PI2); x.fill(); poly(x, [0.7, 0.28, 0.82, 0.32, 0.7, 0.36]); x.fill();
    x.lineWidth = 0.05; x.beginPath(); x.moveTo(0.44, 0.82); x.lineTo(0.42, 0.98); x.moveTo(0.52, 0.82); x.lineTo(0.56, 0.98); x.stroke();
  },
  lion(x) {
    x.beginPath(); x.ellipse(0.46, 0.66, 0.34, 0.14, 0, 0, PI2); x.fill();
    x.beginPath(); x.ellipse(0.8, 0.5, 0.12, 0.14, 0, 0, PI2); x.fill();
    x.fillRect(0.7, 0.72, 0.26, 0.08); x.fillRect(0.12, 0.72, 0.2, 0.08);
    x.lineWidth = 0.05; x.beginPath(); x.moveTo(0.14, 0.62); x.quadraticCurveTo(0.02, 0.5, 0.1, 0.4); x.stroke();
  },
  basket(x) { x.beginPath(); x.arc(0.5, 0.5, 0.36, 0, Math.PI); x.closePath(); x.fill(); x.fillRect(0.8, 0.38, 0.08, 0.14); },
  cloth(x) { x.lineWidth = 0.1; x.beginPath(); x.moveTo(0.3, 0.96); x.lineTo(0.3, 0.4); x.bezierCurveTo(0.3, 0.08, 0.74, 0.08, 0.7, 0.36); x.lineTo(0.56, 0.5); x.stroke(); },
  star(x) { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.16 : 0.44; x.lineTo(0.5 + Math.cos(a) * r, 0.52 + Math.sin(a) * r); } x.closePath(); x.fill(); },
  jar(x) { x.beginPath(); x.moveTo(0.36, 0.1); x.lineTo(0.64, 0.1); x.quadraticCurveTo(0.6, 0.2, 0.7, 0.36); x.quadraticCurveTo(0.84, 0.7, 0.56, 0.96); x.lineTo(0.44, 0.96); x.quadraticCurveTo(0.16, 0.7, 0.3, 0.36); x.quadraticCurveTo(0.4, 0.2, 0.36, 0.1); x.fill(); },
  duck(x) {
    x.beginPath(); x.ellipse(0.44, 0.62, 0.3, 0.16, 0.1, 0, PI2); x.fill();
    x.lineWidth = 0.08; x.beginPath(); x.moveTo(0.66, 0.54); x.quadraticCurveTo(0.74, 0.36, 0.7, 0.26); x.stroke();
    x.beginPath(); x.arc(0.72, 0.24, 0.07, 0, PI2); x.fill(); poly(x, [0.76, 0.22, 0.92, 0.26, 0.76, 0.3]); x.fill();
  },
  ka(x) { x.lineWidth = 0.09; x.beginPath(); x.moveTo(0.16, 0.06); x.lineTo(0.16, 0.6); x.lineTo(0.84, 0.6); x.lineTo(0.84, 0.06); x.stroke(); x.fillRect(0.44, 0.6, 0.12, 0.36); },
  seated(x) {
    x.beginPath(); x.arc(0.56, 0.16, 0.1, 0, PI2); x.fill();
    poly(x, [0.48, 0.26, 0.64, 0.26, 0.66, 0.6, 0.86, 0.62, 0.86, 0.96, 0.74, 0.96, 0.74, 0.74, 0.4, 0.74]); x.fill();
    x.lineWidth = 0.06; x.beginPath(); x.moveTo(0.6, 0.34); x.lineTo(0.78, 0.46); x.stroke();
  },
  sedge(x) { x.lineWidth = 0.06; x.beginPath(); x.moveTo(0.5, 0.96); x.lineTo(0.5, 0.2); x.moveTo(0.5, 0.6); x.quadraticCurveTo(0.3, 0.4, 0.22, 0.24); x.moveTo(0.5, 0.6); x.quadraticCurveTo(0.7, 0.4, 0.78, 0.24); x.stroke(); for (const px of [0.22, 0.5, 0.78]) { x.beginPath(); x.ellipse(px, 0.14, 0.07, 0.1, 0, 0, PI2); x.fill(); } },
};
const GLYPH_NAMES = Object.keys(GLYPHS);
/** Draw glyph `name` in the box (x0, y0, size). */
export function glyph(x, name, x0, y0, s, fill, stroke = fill) {
  x.save(); x.translate(x0, y0); x.scale(s, s); x.fillStyle = fill; x.strokeStyle = stroke; x.lineCap = 'round'; x.lineJoin = 'round';
  GLYPHS[name](x); x.restore();
}
/** A column of glyphs down from (cx, y0), each `s` tall, until y1. Returns the y it stopped at. */
function glyphColumn(x, r, cx, y0, y1, s, colors) {
  let y = y0;
  while (y + s <= y1) {
    const name = GLYPH_NAMES[Math.floor(r() * GLYPH_NAMES.length)];
    // small signs share a line in pairs (as the scribes did)
    if ((name === 'loaf' || name === 'mouth' || name === 'water' || name === 'basket') && y + s * 0.6 <= y1) {
      const n2 = ['loaf', 'mouth', 'water', 'basket', 'sun'][Math.floor(r() * 5)];
      glyph(x, name, cx - s * 0.5, y - s * 0.05, s * 0.55, colors());
      glyph(x, n2, cx - s * 0.5, y + s * 0.38, s * 0.5, colors());
      y += s * 0.92;
      continue;
    }
    glyph(x, name, cx - s / 2, y, s, colors());
    y += s * 1.08;
  }
  return y;
}

// --- Egyptian figures in profile (for the painted reliefs) ---------------------------------------------------------------------------
const SKIN = { man: '#a84a28', woman: '#dfae5c', osiris: '#3f8a58', black: '#1d1a19', blue: '#2f5f9e' };
const KILT = '#f1ead6';
/**
 * A figure walking to the right (or left with dir = -1), feet on groundY, h tall.
 * kind: man | woman | pharaoh | jackal (Anubis) | falcon (Horus) | ra | ibis (Thoth) | croc (Sobek) | cat (Bastet) | osiris
 * holds: ankh | was | offering | lotus | scales | none
 */
export function figure(x, cx, gy, h, kind = 'man', dir = 1, holds = 'was', o = {}) {
  x.save(); x.translate(cx, gy); x.scale(dir, 1);
  const u = h / 100; // 1 unit = 1% of the height
  const woman = kind === 'woman' || kind === 'cat';
  const skin = o.skin || (kind === 'osiris' ? SKIN.osiris : woman ? SKIN.woman : SKIN.man);
  const ink = '#2a1d16';
  x.lineJoin = 'round'; x.lineCap = 'round';
  const fillStroke = (c) => { x.fillStyle = c; x.fill(); x.strokeStyle = ink; x.lineWidth = u * 0.7; x.stroke(); };
  // the back arm (hangs down, holds an ankh)
  x.beginPath(); x.moveTo(-10 * u, -76 * u); x.lineTo(-14 * u, -52 * u); x.lineTo(-11 * u, -50 * u); x.lineTo(-7 * u, -74 * u); x.closePath(); fillStroke(skin);
  if (kind !== 'osiris') { x.save(); x.translate(-17 * u, -52 * u); x.scale(u * 9, u * 13); x.fillStyle = '#d9a82e'; x.strokeStyle = '#d9a82e'; GLYPHS.ankh(x); x.restore(); }
  // the legs, striding (Osiris stands wrapped like a mummy)
  if (kind === 'osiris') {
    x.beginPath(); x.moveTo(-8 * u, -78 * u); x.lineTo(9 * u, -78 * u); x.lineTo(8 * u, -2 * u); x.lineTo(-7 * u, -2 * u); x.closePath(); fillStroke('#f4f0e2');
    for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(-7 * u, (-70 + i * 10) * u); x.lineTo(8 * u, (-66 + i * 10) * u); x.strokeStyle = 'rgba(80,60,40,0.4)'; x.lineWidth = u * 0.6; x.stroke(); }
  } else if (woman) {
    x.beginPath(); x.moveTo(-3 * u, -40 * u); x.lineTo(-9 * u, -2 * u); x.lineTo(-4 * u, -2 * u); x.closePath(); fillStroke(skin);
    x.beginPath(); x.moveTo(3 * u, -40 * u); x.lineTo(8 * u, -2 * u); x.lineTo(13 * u, -2 * u); x.closePath(); fillStroke(skin);
    // a sheath dress from the chest to the ankles
    x.beginPath(); x.moveTo(-8 * u, -70 * u); x.lineTo(8 * u, -70 * u); x.lineTo(9 * u, -8 * u); x.lineTo(-7 * u, -8 * u); x.closePath(); fillStroke(o.dress || '#f3ecd6');
    x.beginPath(); x.moveTo(-6 * u, -70 * u); x.lineTo(-4 * u, -84 * u); x.moveTo(6 * u, -70 * u); x.lineTo(4 * u, -84 * u); x.strokeStyle = '#b8352b'; x.lineWidth = u * 1.4; x.stroke();
  } else {
    x.lineWidth = u * 4.8; x.strokeStyle = skin;
    x.beginPath(); x.moveTo(-3 * u, -40 * u); x.lineTo(-7 * u, -20 * u); x.lineTo(-12 * u, -3 * u); x.stroke();
    x.beginPath(); x.moveTo(3 * u, -40 * u); x.lineTo(8 * u, -20 * u); x.lineTo(13 * u, -3 * u); x.stroke();
    x.fillStyle = skin;
    x.beginPath(); x.ellipse(-10 * u, -1.5 * u, 6 * u, 1.8 * u, 0, 0, PI2); x.fill();
    x.beginPath(); x.ellipse(16 * u, -1.5 * u, 6 * u, 1.8 * u, 0, 0, PI2); x.fill();
    // the kilt, with its pleats and front panel
    x.beginPath(); x.moveTo(-8 * u, -54 * u); x.lineTo(8 * u, -54 * u); x.lineTo(14 * u, -30 * u); x.lineTo(-9 * u, -32 * u); x.closePath(); fillStroke(o.kilt || KILT);
    x.strokeStyle = 'rgba(120,100,70,0.5)'; x.lineWidth = u * 0.5;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo((-8 + i * 3) * u, -53 * u); x.lineTo((-8 + i * 4.3) * u, -31 * u); x.stroke(); }
    x.beginPath(); x.moveTo(4 * u, -54 * u); x.lineTo(14 * u, -30 * u); x.lineTo(5 * u, -31 * u); x.closePath(); x.fillStyle = kind === 'pharaoh' ? '#d9a82e' : '#e8dfc4'; x.fill();
    x.fillStyle = kind === 'pharaoh' ? '#2a5caa' : '#b8352b'; x.fillRect(-8 * u, -56 * u, 16 * u, 3 * u);
  }
  // the torso (shoulders seen from the front)
  x.beginPath(); x.moveTo(-12 * u, -78 * u); x.lineTo(12 * u, -78 * u); x.lineTo(6 * u, -54 * u); x.lineTo(-6 * u, -54 * u); x.closePath(); fillStroke(woman ? o.dress || '#f3ecd6' : skin);
  if (woman) { x.beginPath(); x.moveTo(-12 * u, -78 * u); x.lineTo(12 * u, -78 * u); x.lineTo(9 * u, -70 * u); x.lineTo(-9 * u, -70 * u); x.closePath(); fillStroke(skin); }
  // the broad collar (wesekh): blue, red, green and gold rows
  const cols = ['#2a5caa', '#b8352b', '#2f8f6b', '#d9a82e'];
  for (let i = 3; i >= 0; i--) { x.beginPath(); x.arc(0, -79 * u, (5 + i * 2.6) * u, 0.15, Math.PI - 0.15); x.lineWidth = u * 2.6; x.strokeStyle = cols[i]; x.stroke(); }
  // the front arm, reaching forward with whatever it holds
  x.beginPath(); x.moveTo(8 * u, -77 * u); x.lineTo(22 * u, -64 * u); x.lineTo(22 * u, -60 * u); x.lineTo(7 * u, -71 * u); x.closePath(); fillStroke(skin);
  x.fillStyle = '#d9a82e'; x.fillRect(12 * u, -71 * u, 3 * u, 3 * u);
  if (holds === 'was') {
    x.fillStyle = '#c99a2e'; x.strokeStyle = ink; x.lineWidth = u * 0.5;
    x.fillRect(22 * u, -104 * u, 2 * u, 102 * u);
    poly(x, [22 * u, -104 * u, 20 * u, -110 * u, 30 * u, -112 * u, 28 * u, -107 * u, 24 * u, -106 * u]); x.fill();
  } else if (holds === 'offering') {
    x.fillStyle = '#d9a82e'; x.beginPath(); x.ellipse(27 * u, -64 * u, 8 * u, 2.5 * u, 0, 0, PI2); x.fill();
    for (const [dx, c] of [[-4, '#b8352b'], [0, '#2f8f6b'], [4, '#e8b44a']]) { x.fillStyle = c; x.beginPath(); x.arc((27 + dx) * u, -68 * u, 3 * u, 0, PI2); x.fill(); }
  } else if (holds === 'lotus') {
    x.strokeStyle = '#2f8f6b'; x.lineWidth = u; x.beginPath(); x.moveTo(23 * u, -62 * u); x.quadraticCurveTo(30 * u, -70 * u, 30 * u, -82 * u); x.stroke();
    x.fillStyle = '#5a8fd0'; poly(x, [26 * u, -82 * u, 30 * u, -94 * u, 34 * u, -82 * u, 30 * u, -80 * u]); x.fill();
  } else if (holds === 'scales') {
    x.fillStyle = '#c99a2e'; x.fillRect(23 * u, -96 * u, 2 * u, 34 * u); x.fillRect(12 * u, -96 * u, 24 * u, 2 * u);
    for (const px of [12, 36]) { x.beginPath(); x.moveTo(px * u, -94 * u); x.lineTo((px - 4) * u, -80 * u); x.lineTo((px + 4) * u, -80 * u); x.closePath(); x.strokeStyle = '#c99a2e'; x.lineWidth = u * 0.6; x.stroke(); x.beginPath(); x.ellipse(px * u, -80 * u, 5 * u, 1.6 * u, 0, 0, PI2); x.fill(); }
  }
  // the head
  head(x, kind, u, skin, ink);
  x.restore();
}
function head(x, kind, u, skin, ink) {
  const eye = (ex, ey) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 2.4 * u, 1.2 * u, 0, 0, PI2); x.fill(); x.fillStyle = ink; x.beginPath(); x.arc(ex + 0.5 * u, ey, 0.9 * u, 0, PI2); x.fill(); x.strokeStyle = ink; x.lineWidth = u * 0.8; x.beginPath(); x.moveTo(ex - 2.4 * u, ey); x.lineTo(ex + 4.5 * u, ey - 0.5 * u); x.stroke(); };
  const neck = () => { x.fillStyle = kind === 'jackal' ? SKIN.black : kind === 'croc' ? '#3d6b3a' : skin; x.fillRect(-3 * u, -86 * u, 7 * u, 8 * u); };
  neck();
  if (kind === 'jackal') {
    x.fillStyle = SKIN.black;
    x.beginPath(); x.ellipse(0, -90 * u, 6 * u, 5.5 * u, 0, 0, PI2); x.fill();
    poly(x, [3 * u, -93 * u, 17 * u, -88 * u, 16 * u, -85 * u, 3 * u, -85 * u]); x.fill();
    poly(x, [-3 * u, -93 * u, -1 * u, -107 * u, 3 * u, -94 * u]); x.fill(); poly(x, [1 * u, -94 * u, 4 * u, -106 * u, 6 * u, -93 * u]); x.fill();
    x.fillStyle = '#d9a82e'; x.beginPath(); x.ellipse(3 * u, -91 * u, 1.6 * u, 0.9 * u, 0, 0, PI2); x.fill();
    // the striped headcloth behind
    x.fillStyle = '#2a5caa'; x.fillRect(-9 * u, -92 * u, 6 * u, 16 * u); x.fillStyle = '#d9a82e'; for (let i = 0; i < 4; i++) x.fillRect(-9 * u, (-90 + i * 4) * u, 6 * u, 1.4 * u);
  } else if (kind === 'falcon' || kind === 'ra') {
    x.fillStyle = '#2f5f9e'; x.beginPath(); x.ellipse(0, -91 * u, 6.5 * u, 6 * u, 0, 0, PI2); x.fill();
    x.fillStyle = '#e9dfc2'; x.beginPath(); x.ellipse(2 * u, -88 * u, 4 * u, 3 * u, 0, 0, PI2); x.fill();
    x.fillStyle = '#1d1a19'; poly(x, [5 * u, -93 * u, 12 * u, -90 * u, 9 * u, -86 * u, 6 * u, -87 * u]); x.fill();
    eye(2 * u, -92 * u);
    x.fillStyle = '#2f8f6b'; x.fillRect(-9 * u, -92 * u, 6 * u, 15 * u);
    if (kind === 'ra') {
      const g = x.createRadialGradient(0, -106 * u, 1 * u, 0, -106 * u, 10 * u); g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#d4462a');
      x.fillStyle = g; x.beginPath(); x.arc(0, -106 * u, 9 * u, 0, PI2); x.fill();
      x.fillStyle = '#d9a82e'; x.beginPath(); x.ellipse(-1 * u, -97 * u, 2 * u, 3 * u, 0, 0, PI2); x.fill();
    } else {
      // the double crown of the two lands
      x.fillStyle = '#b8352b'; poly(x, [-7 * u, -96 * u, 6 * u, -96 * u, 6 * u, -103 * u, -2 * u, -103 * u, -2 * u, -112 * u, -7 * u, -112 * u]); x.fill();
      x.fillStyle = '#f3ecd6'; x.beginPath(); x.ellipse(1.5 * u, -106 * u, 3.6 * u, 9 * u, 0, 0, PI2); x.fill();
    }
  } else if (kind === 'ibis') {
    x.fillStyle = '#f2ede0'; x.beginPath(); x.ellipse(0, -91 * u, 5.5 * u, 5 * u, 0, 0, PI2); x.fill();
    x.strokeStyle = '#1d1a19'; x.lineWidth = u * 2.2; x.beginPath(); x.moveTo(4 * u, -92 * u); x.quadraticCurveTo(16 * u, -92 * u, 20 * u, -80 * u); x.stroke();
    eye(1 * u, -92 * u);
    x.fillStyle = '#2a5caa'; x.fillRect(-9 * u, -92 * u, 6 * u, 15 * u);
    x.fillStyle = '#e9dfc2'; x.beginPath(); x.arc(0, -101 * u, 4 * u, Math.PI, 0); x.fill();
  } else if (kind === 'croc') {
    x.fillStyle = '#3d6b3a'; x.beginPath(); x.ellipse(0, -90 * u, 6 * u, 5 * u, 0, 0, PI2); x.fill();
    poly(x, [3 * u, -93 * u, 20 * u, -90 * u, 20 * u, -86 * u, 3 * u, -85 * u]); x.fill();
    x.strokeStyle = '#f2ede0'; x.lineWidth = u * 0.7; x.beginPath(); for (let i = 0; i < 6; i++) { x.moveTo((6 + i * 2.4) * u, -87.5 * u); x.lineTo((7.2 + i * 2.4) * u, -86 * u); } x.stroke();
    eye(1 * u, -92 * u);
    x.fillStyle = '#2a5caa'; x.fillRect(-9 * u, -92 * u, 6 * u, 15 * u);
    x.fillStyle = '#e8dfc4'; poly(x, [-4 * u, -95 * u, 0, -108 * u, 4 * u, -95 * u]); x.fill();
  } else if (kind === 'cat') {
    x.fillStyle = '#1d1a19'; x.beginPath(); x.ellipse(1 * u, -91 * u, 6 * u, 5.5 * u, 0, 0, PI2); x.fill();
    poly(x, [-3 * u, -94 * u, -2 * u, -104 * u, 2 * u, -95 * u]); x.fill(); poly(x, [2 * u, -95 * u, 5 * u, -104 * u, 6 * u, -93 * u]); x.fill();
    poly(x, [5 * u, -91 * u, 9 * u, -88 * u, 5 * u, -86 * u]); x.fill();
    x.fillStyle = '#9ad06a'; x.beginPath(); x.ellipse(3.5 * u, -92 * u, 1.4 * u, 0.9 * u, 0, 0, PI2); x.fill();
  } else {
    // human: a face in profile, a wig or the Pharaoh's nemes, the Osiris crown
    x.fillStyle = skin;
    x.beginPath(); x.moveTo(-2 * u, -84 * u); x.lineTo(4 * u, -84 * u); x.lineTo(7 * u, -88 * u); x.lineTo(6.2 * u, -90 * u); x.lineTo(8 * u, -93 * u); x.lineTo(5 * u, -98 * u); x.lineTo(-4 * u, -98 * u); x.closePath(); x.fill();
    eye(2.4 * u, -93 * u);
    if (kind === 'pharaoh') {
      x.fillStyle = '#d9a82e'; poly(x, [-8 * u, -99 * u, 4 * u, -100 * u, 5 * u, -95 * u, 0, -95 * u, -2 * u, -86 * u, -6 * u, -76 * u, -11 * u, -76 * u, -10 * u, -94 * u]); x.fill();
      x.fillStyle = '#2a5caa'; for (let i = 0; i < 6; i++) x.fillRect(-10 * u, (-98 + i * 3.6) * u, 9 * u, 1.5 * u);
      x.fillStyle = '#d9a82e'; x.beginPath(); x.arc(5 * u, -100 * u, 1.6 * u, 0, PI2); x.fill();
      x.fillStyle = '#2a1d16'; x.fillRect(3 * u, -84 * u, 2 * u, 6 * u); // the false beard
    } else if (kind === 'osiris') {
      x.fillStyle = '#f3ecd6'; x.beginPath(); x.ellipse(0, -106 * u, 4.5 * u, 10 * u, 0, 0, PI2); x.fill();
      x.fillStyle = '#d9a82e'; poly(x, [-9 * u, -104 * u, -5 * u, -112 * u, -4 * u, -100 * u]); x.fill(); poly(x, [9 * u, -104 * u, 5 * u, -112 * u, 4 * u, -100 * u]); x.fill();
      x.fillStyle = '#2a1d16'; x.fillRect(3 * u, -84 * u, 2 * u, 7 * u);
    } else {
      x.fillStyle = '#1d1a19'; poly(x, [-9 * u, -99 * u, 3 * u, -100 * u, 4 * u, -96 * u, -1 * u, -95 * u, -1 * u, -84 * u, -10 * u, kind === 'woman' ? -70 * u : -80 * u]); x.fill();
      if (kind === 'woman') { x.fillStyle = '#b8352b'; x.fillRect(-8 * u, -99 * u, 12 * u, 1.6 * u); }
    }
  }
}

// --- textures ------------------------------------------------------------------------------------------------------------------------------------
const CACHE = {};
const once = (k, f) => CACHE[k] || (CACHE[k] = f());

/** Sandstone ashlar: courses of blocks, each a little different, with worn edges and sand in the joints. */
export function ashlarCanvas(seed = 1, base = [214, 186, 140], o = {}) {
  return canvas(512, 512, (x, w, h) => {
    const r = rng(seed);
    const [R, Gc, B] = base;
    x.fillStyle = `rgb(${R - 40},${Gc - 40},${B - 40})`; x.fillRect(0, 0, w, h);
    const rows = o.rows || 4, rh = h / rows;
    for (let row = 0; row < rows; row++) {
      let bx = -r() * 60;
      while (bx < w) {
        const bw = 90 + r() * 120, l = (r() - 0.5) * 22, warm = (r() - 0.5) * 10;
        const y0 = row * rh;
        const g = x.createLinearGradient(0, y0, 0, y0 + rh);
        g.addColorStop(0, `rgb(${R + l + 8 + warm},${Gc + l + 6},${B + l})`); g.addColorStop(1, `rgb(${R + l - 10 + warm},${Gc + l - 12},${B + l - 14})`);
        x.fillStyle = g;
        for (const ox of [0, w]) x.fillRect(bx + 2 - ox, y0 + 2, bw - 4, rh - 4);
        // a chipped corner now and then
        if (r() < 0.35) { x.fillStyle = `rgba(${R - 60},${Gc - 60},${B - 60},0.5)`; x.beginPath(); x.moveTo(bx + bw - 2, y0 + 2); x.lineTo(bx + bw - 2 - 6 - r() * 14, y0 + 2); x.lineTo(bx + bw - 2, y0 + 8 + r() * 12); x.fill(); }
        bx += bw;
      }
    }
    blobs(x, w, h, 60, `rgba(${R - 70},${Gc - 70},${B - 60},0.10)`, 10, 60, r);
    blobs(x, w, h, 30, `rgba(255,240,210,0.08)`, 20, 80, r);
    // pitting
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R - 90},${Gc - 90},${B - 80},${0.15 + r() * 0.25})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    grain(x, w, h, 16, r);
  });
}

/** Sandstone carved with columns of hieroglyphs (incised: dark inside, a lit lower edge). */
export function glyphWallCanvas(seed = 2, base = [214, 186, 140], painted = false) {
  const c = ashlarCanvas(seed, base, { rows: 4 });
  const x = c.getContext('2d'), w = c.width, h = c.height, r = rng(seed * 7 + 3);
  const [R, Gc, B] = base;
  const cols = 5, cw = w / cols;
  x.strokeStyle = `rgba(${R - 80},${Gc - 80},${B - 70},0.55)`; x.lineWidth = 2;
  for (let i = 0; i <= cols; i++) { x.beginPath(); x.moveTo(i * cw + 1, 0); x.lineTo(i * cw + 1, h); x.stroke(); }
  const pal = painted ? ['#2a5caa', '#2f8f6b', '#b8352b', '#2a5caa', '#1f4f8a'] : null;
  for (let i = 0; i < cols; i++) {
    const cx = i * cw + cw / 2, s = cw * 0.62;
    let y = r() * 10;
    while (y + s < h) {
      const name = GLYPH_NAMES[Math.floor(r() * GLYPH_NAMES.length)];
      if (painted) glyph(x, name, cx - s / 2, y, s, pal[Math.floor(r() * pal.length)]);
      else {
        glyph(x, name, cx - s / 2 + 1.5, y + 1.5, s, `rgba(255,236,200,0.55)`); // the lit lower edge of the cut
        glyph(x, name, cx - s / 2, y, s, `rgba(${R - 95},${Gc - 100},${B - 95},0.85)`);
      }
      y += s * 1.1;
    }
  }
  return c;
}

/** A painted relief, 2:1 (16 x 8 studs): the khekher frieze, columns of text over a procession of the gods, a dado. */
export function reliefCanvas(variant = 0) {
  return canvas(1024, 512, (x, w, h) => {
    const r = rng(100 + variant * 17);
    // the plaster ground
    x.fillStyle = variant === 3 ? '#e7dcc1' : '#ebdfc4'; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 50, 'rgba(200,170,120,0.18)', 20, 90, r);
    blobs(x, w, h, 18, 'rgba(160,120,80,0.12)', 30, 100, r);
    // the khekher frieze on top
    const kh = 42;
    for (let i = 0; i < w / 24; i++) {
      const cx = i * 24 + 12, col = ['#2a5caa', '#b8352b', '#2f8f6b', '#d9a82e'][i % 4];
      x.fillStyle = col; x.beginPath(); x.moveTo(cx - 8, kh); x.lineTo(cx - 8, 14); x.quadraticCurveTo(cx, 2, cx + 8, 14); x.lineTo(cx + 8, kh); x.closePath(); x.fill();
      x.fillStyle = '#ebdfc4'; x.beginPath(); x.arc(cx, 16, 3.5, 0, PI2); x.fill(); x.fillRect(cx - 6, 28, 12, 3);
    }
    const band = (y, cols) => cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, y + i * 6, w, 6); });
    band(kh, ['#1d1a19', '#d9a82e', '#2a5caa', '#b8352b', '#2f8f6b']);
    // columns of hieroglyphs above the figures
    const top = kh + 34, textBottom = 192;
    const nCols = 22, cw = w / nCols;
    x.strokeStyle = 'rgba(42,29,22,0.7)'; x.lineWidth = 1.5;
    for (let i = 0; i <= nCols; i++) { x.beginPath(); x.moveTo(i * cw, top); x.lineTo(i * cw, textBottom); x.stroke(); }
    const pal = ['#2a5caa', '#2a5caa', '#2f8f6b', '#b8352b', '#1d1a19'];
    for (let i = 0; i < nCols; i++) glyphColumn(x, r, i * cw + cw / 2, top + 4, textBottom - 2, cw * 0.72, () => pal[Math.floor(r() * pal.length)]);
    // the procession
    const ground = 452, fh = 250;
    const casts = [
      [['jackal', 'was'], ['pharaoh', 'offering'], ['ibis', 'was']],
      [['ra', 'was'], ['woman', 'lotus'], ['pharaoh', 'offering']],
      [['jackal', 'scales'], ['osiris', 'none'], ['falcon', 'was']],
      [['croc', 'was'], ['cat', 'ankh'], ['falcon', 'was']],
    ][variant % 4];
    casts.forEach(([kind, holds], i) => {
      const cx = 150 + i * 340;
      // a little cartouche of their name above them
      x.strokeStyle = '#2a1d16'; x.lineWidth = 2; x.fillStyle = 'rgba(217,168,46,0.25)';
      x.beginPath(); x.ellipse(cx + 40, 214, 18, 26, 0, 0, PI2); x.fill(); x.stroke(); x.fillRect(cx + 24, 240, 32, 3);
      glyph(x, GLYPH_NAMES[Math.floor(r() * GLYPH_NAMES.length)], cx + 30, 196, 20, '#2a5caa');
      glyph(x, GLYPH_NAMES[Math.floor(r() * GLYPH_NAMES.length)], cx + 30, 214, 20, '#b8352b');
      figure(x, cx, ground, fh, kind, 1, holds);
      // between them, an offering table or a lotus
      if (i < 2) {
        const ox = cx + 190;
        if ((i + variant) % 2) {
          x.fillStyle = '#c99a2e'; x.fillRect(ox - 4, ground - 70, 8, 70); x.fillRect(ox - 30, ground - 74, 60, 6);
          for (const [dx, c] of [[-18, '#b8352b'], [-6, '#e8b44a'], [6, '#2f8f6b'], [18, '#b8352b']]) { x.fillStyle = c; x.beginPath(); x.ellipse(ox + dx, ground - 82, 6, 9, 0, 0, PI2); x.fill(); }
        } else {
          x.strokeStyle = '#2f8f6b'; x.lineWidth = 4;
          for (const d of [-14, 0, 14]) { x.beginPath(); x.moveTo(ox, ground); x.quadraticCurveTo(ox + d, ground - 60, ox + d * 1.5, ground - 110 - Math.abs(d) * 2); x.stroke(); x.fillStyle = '#5a8fd0'; poly(x, [ox + d * 1.5 - 8, ground - 110 - Math.abs(d) * 2, ox + d * 1.5, ground - 132 - Math.abs(d) * 2, ox + d * 1.5 + 8, ground - 110 - Math.abs(d) * 2]); x.fill(); }
        }
      }
    });
    // the ground line and the dado
    band(ground, ['#1d1a19', '#d9a82e']);
    x.fillStyle = '#b8352b'; x.fillRect(0, ground + 12, w, 22);
    x.fillStyle = '#1d1a19'; x.fillRect(0, ground + 34, w, h - ground - 34);
    for (let i = 0; i < w / 32; i++) { x.fillStyle = '#d9a82e'; x.fillRect(i * 32 + 4, ground + 40, 20, 4); }
    // age: flaking paint, dirt
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(214,190,150,${0.4 + r() * 0.4})`; x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 14, 2 + r() * 8, r() * 3, 0, PI2); x.fill(); }
    blobs(x, w, h, 26, 'rgba(110,80,50,0.10)', 20, 120, r);
    grain(x, w, h, 12, r);
  });
}

/** The starry ceiling of a tomb: deep blue with five-pointed yellow stars. */
export function starCanvas() {
  return canvas(512, 512, (x, w, h) => {
    const r = rng(77);
    x.fillStyle = '#1b2c66'; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 30, 'rgba(10,20,50,0.35)', 30, 100, r);
    const n = 8;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const cx = (i + 0.5 + (j % 2) * 0.5) * w / n + (r() - 0.5) * 6, cy = (j + 0.5) * h / n + (r() - 0.5) * 6;
      glyph(x, 'star', cx - 24, cy - 26, 48, `rgb(${226 + r() * 20},${186 + r() * 20},${70 + r() * 30})`);
    }
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(214,190,150,${0.2 + r() * 0.3})`; x.beginPath(); x.ellipse(r() * w, r() * h, 2 + r() * 10, 1 + r() * 6, r() * 3, 0, PI2); x.fill(); }
    grain(x, w, h, 10, r);
  });
}

/** Limestone floor slabs, worn smooth, sand in the joints. */
export function floorCanvas(seed = 9, base = [205, 188, 156]) {
  return canvas(512, 512, (x, w, h) => {
    const r = rng(seed);
    const [R, Gc, B] = base;
    x.fillStyle = `rgb(${R - 50},${Gc - 52},${B - 54})`; x.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const l = (r() - 0.5) * 24;
      x.fillStyle = `rgb(${R + l},${Gc + l},${B + l})`;
      x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      if (r() < 0.25) { x.strokeStyle = `rgba(${R - 80},${Gc - 80},${B - 80},0.5)`; x.lineWidth = 1; x.beginPath(); let px = i * s + r() * s, py = j * s + 3; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 20; py += s / 7; x.lineTo(px, py); } x.stroke(); }
    }
    blobs(x, w, h, 40, 'rgba(230,200,150,0.18)', 10, 70, r);
    blobs(x, w, h, 30, `rgba(${R - 90},${Gc - 90},${B - 90},0.10)`, 20, 80, r);
    grain(x, w, h, 14, r);
  });
}

/** Desert sand with wind ripples. */
export function sandCanvas(seed = 3, base = [222, 190, 136], ripples = true) {
  return canvas(512, 512, (x, w, h) => {
    const r = rng(seed);
    const [R, Gc, B] = base;
    x.fillStyle = `rgb(${R},${Gc},${B})`; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 40, `rgba(${R + 20},${Gc + 16},${B + 10},0.3)`, 30, 120, r);
    blobs(x, w, h, 40, `rgba(${R - 40},${Gc - 40},${B - 40},0.16)`, 30, 120, r);
    if (ripples) for (let i = 0; i < 60; i++) {
      const y0 = r() * h, a = 0.08 + r() * 0.08;
      x.strokeStyle = `rgba(${R - 60},${Gc - 60},${B - 60},${a})`; x.lineWidth = 2 + r() * 2;
      x.beginPath(); for (let xx = -10; xx <= w + 10; xx += 8) x.lineTo(xx, y0 + Math.sin(xx * 0.03 + i) * 6 + Math.sin(xx * 0.011) * 10); x.stroke();
    }
    for (let i = 0; i < 6000; i++) { const l = (r() - 0.5) * 60; x.fillStyle = `rgba(${R + l},${Gc + l},${B + l},0.5)`; x.fillRect(r() * w, r() * h, 1, 1); }
    grain(x, w, h, 12, r);
  });
}

/** Speckled granite (red Aswan granite or black). */
export function graniteCanvas(seed = 4, base = [150, 92, 82]) {
  return canvas(256, 256, (x, w, h) => {
    const r = rng(seed);
    const [R, Gc, B] = base;
    x.fillStyle = `rgb(${R},${Gc},${B})`; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const k = r();
      x.fillStyle = k < 0.35 ? `rgba(30,24,24,${0.5 + r() * 0.5})` : k < 0.6 ? `rgba(235,225,215,${0.4 + r() * 0.5})` : `rgba(${R + 40},${Gc + 20},${B + 20},0.6)`;
      x.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    grain(x, w, h, 10, r);
  });
}

/** Hammered gold. */
export function goldCanvas() {
  return canvas(256, 256, (x, w, h) => {
    const r = rng(12);
    x.fillStyle = '#d7a434'; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 80, 'rgba(255,224,130,0.35)', 6, 20, r);
    blobs(x, w, h, 80, 'rgba(150,100,20,0.25)', 6, 20, r);
    grain(x, w, h, 10, r);
  });
}
/** Lapis lazuli: deep blue, flecks of pyrite gold and white calcite veins. */
export function lapisCanvas() {
  return canvas(256, 256, (x, w, h) => {
    const r = rng(14);
    x.fillStyle = '#1c3a8c'; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 40, 'rgba(40,80,190,0.4)', 10, 50, r);
    blobs(x, w, h, 30, 'rgba(10,25,80,0.4)', 10, 50, r);
    for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(220,225,240,0.25)'; x.lineWidth = 1 + r() * 2; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 12; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(240,200,90,${0.5 + r() * 0.5})`; x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  });
}
/** Turquoise faience. */
export function faienceCanvas() {
  return canvas(256, 256, (x, w, h) => {
    const r = rng(15);
    x.fillStyle = '#2aa79b'; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 50, 'rgba(90,210,190,0.35)', 8, 40, r);
    blobs(x, w, h, 40, 'rgba(10,90,90,0.3)', 8, 40, r);
    grain(x, w, h, 10, r);
  });
}
/** Rough rock (cliffs, the underworld): mottled, cracked, with a few faint strata. */
export function rockCanvas(seed = 21, base = [150, 120, 90]) {
  return canvas(512, 512, (x, w, h) => {
    const r = rng(seed);
    const [R, Gc, B] = base;
    x.fillStyle = `rgb(${R},${Gc},${B})`; x.fillRect(0, 0, w, h);
    blobs(x, w, h, 120, `rgba(${R + 45},${Gc + 38},${B + 30},0.22)`, 6, 40, r);
    blobs(x, w, h, 120, `rgba(${R - 60},${Gc - 55},${B - 50},0.26)`, 6, 40, r);
    blobs(x, w, h, 30, `rgba(${R - 40},${Gc - 40},${B - 30},0.3)`, 30, 110, r);
    // cracks
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(${R - 90},${Gc - 85},${B - 75},${0.25 + r() * 0.35})`; x.lineWidth = 0.8 + r() * 1.6;
      let px = r() * w, py = r() * h, a = r() * Math.PI * 2; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 9; k++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * 12; py += Math.sin(a) * 12; x.lineTo(px, py); }
      x.stroke();
    }
    // faint strata
    for (let i = 0; i < 6; i++) { const y0 = r() * h; x.strokeStyle = `rgba(${R - 50},${Gc - 50},${B - 40},${0.06 + r() * 0.08})`; x.lineWidth = 2 + r() * 5; x.beginPath(); for (let xx = -10; xx <= w + 10; xx += 24) x.lineTo(xx, y0 + Math.sin(xx * 0.015 + i) * 14 + (r() - 0.5) * 8); x.stroke(); }
    grain(x, w, h, 30, r);
  });
}
/** Cedar planks. */
export function woodCanvas(base = [120, 76, 44]) {
  return canvas(256, 256, (x, w, h) => {
    const r = rng(31);
    const [R, Gc, B] = base;
    for (let i = 0; i < 8; i++) {
      const l = (r() - 0.5) * 20;
      x.fillStyle = `rgb(${R + l},${Gc + l},${B + l})`; x.fillRect(0, i * 32, w, 32);
      for (let k = 0; k < 10; k++) { x.strokeStyle = `rgba(${R - 50},${Gc - 40},${B - 30},0.25)`; x.lineWidth = 1; const py = i * 32 + r() * 32; x.beginPath(); x.moveTo(0, py); x.bezierCurveTo(w * 0.3, py + (r() - 0.5) * 6, w * 0.7, py + (r() - 0.5) * 6, w, py); x.stroke(); }
      x.fillStyle = 'rgba(30,15,5,0.5)'; x.fillRect(0, i * 32, w, 1.5);
    }
    grain(x, w, h, 10, r);
  });
}
/** Linen (sails, tents). */
export function linenCanvas(base = [236, 226, 204], stripes = null) {
  return canvas(256, 256, (x, w, h) => {
    const r = rng(33);
    const [R, Gc, B] = base;
    x.fillStyle = `rgb(${R},${Gc},${B})`; x.fillRect(0, 0, w, h);
    if (stripes) stripes.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, (i * 2 + 0.5) * h / (stripes.length * 2), w, h / (stripes.length * 2)); });
    for (let i = 0; i < w; i += 2) { x.fillStyle = 'rgba(0,0,0,0.03)'; x.fillRect(i, 0, 1, h); x.fillRect(0, i, w, 1); }
    blobs(x, w, h, 20, 'rgba(160,140,110,0.12)', 10, 60, r);
    grain(x, w, h, 8, r);
  });
}
/** A papyrus column: plain shaft, then painted bands and stems near the top (v runs up the shaft). */
export function columnCanvas(seed = 5) {
  return canvas(256, 1024, (x, w, h) => {
    const r = rng(seed);
    const base = ashlarCanvas(seed, [214, 188, 146], { rows: 16 });
    x.drawImage(base, 0, 0, w, h);
    // carved columns of glyphs on the lower half
    for (let i = 0; i < 3; i++) {
      const cx = (i + 0.5) * w / 3;
      for (let y = h * 0.42; y < h - 40; y += 46) glyph(x, GLYPH_NAMES[Math.floor(r() * GLYPH_NAMES.length)], cx - 20, y, 40, ['#2a5caa', '#b8352b', '#2f8f6b'][Math.floor(r() * 3)]);
    }
    // painted bands under the capital
    const bands = ['#1d1a19', '#d9a82e', '#2a5caa', '#d9a82e', '#b8352b', '#d9a82e', '#2f8f6b', '#d9a82e', '#1d1a19'];
    bands.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, 40 + i * 12, w, 12); });
    // the bundle of stems
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#2f8f6b' : '#3f9f7b'; x.fillRect(i * w / 16, 150, w / 16 - 2, 200); }
    for (let i = 0; i < 16; i++) { x.fillStyle = '#d9a82e'; x.beginPath(); x.moveTo(i * w / 16, 350); x.lineTo((i + 0.5) * w / 16, 390); x.lineTo((i + 1) * w / 16, 350); x.fill(); }
    // top band (the abacus is a separate block)
    x.fillStyle = '#2a5caa'; x.fillRect(0, 0, w, 40);
    blobs(x, w, h, 30, 'rgba(120,90,60,0.12)', 10, 60, r);
  });
}
/** The papyrus capital: an open umbel painted with green and blue sepals (u around, v up). */
export function capitalCanvas() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#d6bf92'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const cx = (i + 0.5) * w / 12;
      x.fillStyle = i % 2 ? '#2f8f6b' : '#2a5caa';
      x.beginPath(); x.moveTo(cx - 8, h); x.quadraticCurveTo(cx - 10, h * 0.4, cx, h * 0.1); x.quadraticCurveTo(cx + 10, h * 0.4, cx + 8, h); x.fill();
      x.fillStyle = '#d9a82e'; x.fillRect(cx - 1.5, h * 0.2, 3, h * 0.8);
    }
    x.fillStyle = '#b8352b'; x.fillRect(0, 0, w, 18);
    x.fillStyle = '#1d1a19'; x.fillRect(0, h - 14, w, 14);
  });
}

/** An alpha texture: a palm frond (a midrib with leaflets), pointing up the canvas. */
export function frondCanvas() {
  return canvas(256, 512, (x, w, h) => {
    const r = rng(41);
    x.clearRect(0, 0, w, h);
    x.strokeStyle = '#5a6a2a'; x.lineWidth = 5; x.beginPath(); x.moveTo(w / 2, h); x.quadraticCurveTo(w / 2 + 8, h / 2, w / 2, 4); x.stroke();
    for (let i = 0; i < 46; i++) {
      const t = i / 46, py = h - t * h * 0.98, len = (1 - Math.abs(t - 0.45) * 1.4) * w * 0.48;
      for (const s of [-1, 1]) {
        const g = 90 + r() * 60;
        x.strokeStyle = `rgb(${g * 0.55},${g},${g * 0.32})`; x.lineWidth = 4 + (1 - t) * 3;
        x.beginPath(); x.moveTo(w / 2, py); x.quadraticCurveTo(w / 2 + s * len * 0.5, py - 10, w / 2 + s * len, py + 16 + r() * 10); x.stroke();
      }
    }
  });
}
/** An alpha texture: a clump of papyrus and reeds. */
export function reedCanvas() {
  return canvas(512, 512, (x, w, h) => {
    const r = rng(43);
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 44; i++) {
      const bx = w * 0.15 + r() * w * 0.7, top = h * (0.08 + r() * 0.4), lean = (r() - 0.5) * 80;
      const g = 100 + r() * 60;
      x.strokeStyle = `rgb(${g * 0.5},${g},${g * 0.35})`; x.lineWidth = 3 + r() * 3;
      x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + lean * 0.3, (h + top) / 2, bx + lean, top); x.stroke();
      if (r() < 0.55) {
        // a papyrus umbel
        x.strokeStyle = `rgb(${g * 0.6},${g * 1.05},${g * 0.4})`; x.lineWidth = 1.5;
        for (let k = 0; k < 14; k++) { const a = -Math.PI / 2 + (k / 13 - 0.5) * 2.4; x.beginPath(); x.moveTo(bx + lean, top); x.lineTo(bx + lean + Math.cos(a) * 30, top + Math.sin(a) * 30); x.stroke(); }
      }
    }
  });
}
/** A flame: soft teardrop, white-hot core (an additive sprite). */
export function flameCanvas() {
  return once('flameC', () => canvas(128, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.62, w * 0.5);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.95)'); g.addColorStop(0.6, 'rgba(255,110,20,0.55)'); g.addColorStop(1, 'rgba(160,30,0,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(w / 2, 6); x.bezierCurveTo(w * 0.8, h * 0.4, w * 0.95, h * 0.75, w / 2, h - 6); x.bezierCurveTo(w * 0.05, h * 0.75, w * 0.2, h * 0.4, w / 2, 6); x.fill();
  }));
}
/** A soft round glow. */
export function glowCanvas() {
  return once('glowC', () => canvas(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }));
}
/** Molten rock: a dark crust with glowing cracks (colour) and the glow alone (emissive). */
export function lavaCanvases() {
  return once('lava', () => {
    // cells (computed small, drawn big): distance to the nearest of some points; the cracks where two are equally near
    const r = rng(51), M = 128, N = 512;
    const pts = Array.from({ length: 40 }, () => [r() * M, r() * M]);
    const crack = new Float32Array(M * M);
    for (let y = 0; y < M; y++) for (let xx = 0; xx < M; xx++) {
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts) for (const ox of [-M, 0, M]) for (const oy of [-M, 0, M]) {
        const d = Math.hypot(xx - px - ox, y - py - oy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      crack[y * M + xx] = Math.max(0, 1 - (d2 - d1) / 2.6);
    }
    const small = (f) => canvas(M, M, (x) => {
      const img = x.createImageData(M, M);
      for (let i = 0; i < M * M; i++) { const [cr, cg, cb] = f(crack[i]); img.data[i * 4] = cr; img.data[i * 4 + 1] = cg; img.data[i * 4 + 2] = cb; img.data[i * 4 + 3] = 255; }
      x.putImageData(img, 0, 0);
    });
    const big = (c, noise) => canvas(N, N, (x) => { x.imageSmoothingEnabled = true; x.drawImage(c, 0, 0, N, N); if (noise) grain(x, N, N, noise, r); });
    const col = big(small((k) => [40 + k * 215, 22 + k * 120, 18 + k * 20]), 16);
    const glow = big(small((k) => { k = Math.pow(k, 1.5); return [255 * k, 120 * k, 20 * k]; }), 0);
    return { col, glow };
  });
}

/** The sky at the golden hour: the sun low in the west over the Nile, warm haze, the first stars in the east. */
export function skyCanvas(sunAz = -1.9, sunEl = 0.16) {
  return canvas(2048, 1024, (x, w, h) => {
    const r = rng(61);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d2552'); g.addColorStop(0.22, '#3c4a8c'); g.addColorStop(0.38, '#9a7fa8'); g.addColorStop(0.45, '#f0a46c'); g.addColorStop(0.495, '#ffd59a'); g.addColorStop(0.5, '#f4c890'); g.addColorStop(0.56, '#b98c66'); g.addColorStop(1, '#6a4e3a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // the sun: its glow spreads along the horizon
    const sx = ((sunAz / PI2 + 0.5) % 1 + 1) % 1 * w, sy = h * (0.5 - sunEl / Math.PI);
    for (const ox of [-w, 0, w]) {
      const gl = x.createRadialGradient(sx + ox, sy, 0, sx + ox, sy, 520); gl.addColorStop(0, 'rgba(255,230,170,0.85)'); gl.addColorStop(0.15, 'rgba(255,190,110,0.5)'); gl.addColorStop(1, 'rgba(255,150,80,0)');
      x.save(); x.translate(sx + ox, sy); x.scale(1.8, 0.6); x.translate(-(sx + ox), -sy); x.fillStyle = gl; x.fillRect(sx + ox - 600, sy - 600, 1200, 1200); x.restore();
      const disc = x.createRadialGradient(sx + ox, sy, 0, sx + ox, sy, 26); disc.addColorStop(0, 'rgba(255,255,235,1)'); disc.addColorStop(0.7, 'rgba(255,240,190,1)'); disc.addColorStop(1, 'rgba(255,220,150,0)');
      x.fillStyle = disc; x.beginPath(); x.arc(sx + ox, sy, 26, 0, PI2); x.fill();
    }
    // long thin clouds lit from below
    for (let i = 0; i < 26; i++) {
      const cy = h * (0.3 + r() * 0.16), cx = r() * w, len = 120 + r() * 380;
      const near = Math.max(0, 1 - Math.min(Math.abs(cx - sx), w - Math.abs(cx - sx)) / (w * 0.4));
      x.fillStyle = `rgba(${200 + near * 55},${120 + near * 90},${110 + near * 40},${0.25 + r() * 0.25})`;
      for (const ox of [-w, 0, w]) { x.beginPath(); x.ellipse(cx + ox, cy, len, 4 + r() * 7, 0, 0, PI2); x.fill(); }
    }
    // stars in the darker sky, away from the sun
    for (let i = 0; i < 700; i++) {
      const px = r() * w, py = r() * h * 0.3;
      const away = Math.min(Math.abs(px - sx), w - Math.abs(px - sx)) / (w / 2);
      x.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.6) * away * (1 - py / (h * 0.3))})`; x.fillRect(px, py, r() < 0.06 ? 2 : 1, 1);
    }
  });
}

export { once };
