// Textures: the packed photo textures (texdata.js) loaded into texture
// arrays - one for the ground, one for walls, roofs, floors and bark - plus
// a few drawn in code (leaves, needles, grass blades, noise).
//
// Decoding the photos takes a moment, so each array starts out as a tiny
// placeholder in each texture's average colour and is swapped for the real
// thing as soon as it's ready (the materials hold the uniform, not the texture).
import * as THREE from 'three';
import { GROUND, SURF } from './texdata.js';
import { Simplex, rng } from './noise.js';

export const GROUND_KEYS = GROUND.map((t) => t.key);
export const SURF_KEYS = SURF.map((t) => t.key);
export const SURF_LAYER = Object.fromEntries(SURF.map((t, i) => [t.key, i]));
export const GROUND_LAYER = Object.fromEntries(GROUND.map((t, i) => [t.key, i]));

const cache = {};
let maxAniso = 4;

function placeholder(list, normal) {
  const n = list.length, data = new Uint8Array(4 * 4 * 4 * n);
  for (let l = 0; l < n; l++) {
    const c = normal ? [128, 128, 255] : hexRGB(list[l].avg);
    for (let p = 0; p < 16; p++) { const o = (l * 16 + p) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; }
  }
  const t = new THREE.DataArrayTexture(data, 4, 4, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (!normal) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

async function decode(url, size) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, size, size);
  return x.getImageData(0, 0, size, size).data;
}

async function build(list, field, size, normal) {
  const n = list.length, data = new Uint8Array(size * size * 4 * n);
  const imgs = await Promise.all(list.map((t) => (t[field] ? decode(t[field], size) : null)));
  imgs.forEach((px, l) => {
    if (px) data.set(px, l * size * size * 4);
    else { const c = normal ? [128, 128, 255] : hexRGB(list[l].avg); for (let p = 0; p < size * size; p++) { const o = (l * size * size + p) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; } }
  });
  const t = new THREE.DataArrayTexture(data, size, size, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.anisotropy = maxAniso;
  if (!normal) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * The texture arrays as uniforms: { groundCol, groundNor, surfCol, surfNor } each a {value}.
 * `ready` resolves when the real textures have replaced the placeholders.
 */
export function photoTextures(renderer) {
  if (cache.photos) return cache.photos;
  maxAniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const u = {
    groundCol: { value: placeholder(GROUND, false) },
    groundNor: { value: placeholder(GROUND, true) },
    surfCol: { value: placeholder(SURF, false) },
    surfNor: { value: placeholder(SURF, true) },
  };
  u.ready = Promise.all([
    build(GROUND, 'col', 512, false).then((t) => { u.groundCol.value = t; }),
    build(GROUND, 'nor', 256, true).then((t) => { u.groundNor.value = t; }),
    build(SURF, 'col', 512, false).then((t) => { u.surfCol.value = t; }),
    build(SURF, 'nor', 256, true).then((t) => { u.surfNor.value = t; }),
  ]).catch((e) => console.warn('outbreak textures', e));
  cache.photos = u;
  return u;
}
export const surfAvg = (key) => new THREE.Color(SURF.find((t) => t.key === key)?.avg || '#888888');
/** One photo texture on its own (loads in the background). */
export function photo(key, normal = false) {
  const ck = 'photo:' + key + normal;
  if (cache[ck]) return cache[ck];
  const t = [...SURF, ...GROUND].find((q) => q.key === key);
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = maxAniso;
  if (!normal) tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = normal ? t.nor : t.col;
  cache[ck] = tex;
  return tex;
}

// --- textures drawn in code ---------------------------------------------------------------------------------------------------------------
function canvasTex(key, w, h, draw, o = {}) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  if (!o.linear) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (o.nomip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  cache[key] = t;
  return t;
}

/** Tileable greyscale noise (for variation), 256x256. */
export function noiseTex() {
  return canvasTex('noise', 256, 256, (x, w, h) => {
    const n = new Simplex(5), img = x.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      // tileable: sample a torus
      const a = i / w * Math.PI * 2, b = j / h * Math.PI * 2;
      let v = 0, amp = 1, f = 1, s = 0;
      for (let o = 0; o < 5; o++) { v += amp * n.noise(Math.cos(a) * f * 1.2 + Math.cos(b) * 7.1 * f, Math.sin(a) * f * 1.2 + Math.sin(b) * f * 1.2); s += amp; amp *= 0.5; f *= 2; }
      const g = Math.round(128 + 127 * (v / s)), k = (j * w + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { linear: true });
}

/** A broadleaf foliage card: clusters of leaves with alpha. */
export function leafTex(kind = 'oak') {
  return canvasTex('leaf:' + kind, 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const r = rng(kind.length * 31 + 7);
    const pal = kind === 'birch' ? ['#5f8f2e', '#78a63a', '#4d7a26', '#8ab048', '#6a9a34'] : kind === 'bush' ? ['#3e6a24', '#4f7d2c', '#355c1e', '#5c8a34', '#2f5219'] : ['#3d6b22', '#4c7a2a', '#335d1c', '#58893a', '#2b4f16'];
    const leaf = (cx, cy, s, a, col) => {
      x.save(); x.translate(cx, cy); x.rotate(a);
      x.fillStyle = col;
      x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.55, -s * 0.2, 0, s); x.quadraticCurveTo(-s * 0.55, -s * 0.2, 0, -s); x.fill();
      x.strokeStyle = 'rgba(20,40,10,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -s * 0.9); x.lineTo(0, s * 0.9); x.stroke();
      x.restore();
    };
    // a few twigs, then layers of leaves heaped towards the middle
    x.strokeStyle = '#4a3a22'; x.lineWidth = 3;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(w / 2, h * 0.95); x.quadraticCurveTo(w / 2 + (r() - 0.5) * 80, h * 0.6, w * (0.15 + r() * 0.7), h * (0.1 + r() * 0.5)); x.stroke(); }
    const n = kind === 'bush' ? 260 : 340;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.46;
      const cx = w / 2 + Math.cos(a) * d * w, cy = h / 2 + Math.sin(a) * d * h * 0.92;
      const s = (kind === 'birch' ? 7 : 9) + r() * 7;
      leaf(cx, cy, s, r() * Math.PI * 2, pal[Math.floor(r() * pal.length)]);
    }
  });
}

/** A conifer branch card: a dense spray of needled branchlets, seen from above. */
export function needleTex() {
  return canvasTex('needles2', 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const r = rng(77);
    const pal = ['#1d3518', '#26421f', '#18301a', '#2f4d25', '#223d1c', '#355a2a'];
    const needles = (px, py, ang, len, dens) => {
      for (let i = 0; i < dens; i++) {
        const t = r(), qx = px + Math.cos(ang) * len * t, qy = py + Math.sin(ang) * len * t;
        const nl = (1 - t * 0.55) * (6 + r() * 6);
        for (const s of [-1, 1]) {
          const a = ang + s * (0.75 + r() * 0.5);
          x.strokeStyle = pal[Math.floor(r() * pal.length)]; x.lineWidth = 1.4 + r() * 0.8;
          x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + Math.cos(a) * nl, qy + Math.sin(a) * nl); x.stroke();
        }
      }
    };
    // the main stem up the middle, branchlets off it, needles everywhere
    const cx = w / 2;
    x.strokeStyle = '#3b2b1a'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, h); x.lineTo(cx, 6); x.stroke();
    for (let i = 0; i < 16; i++) {
      const t = i / 16, py = h - 8 - t * (h - 20), len = (1 - t) * 100 + 18;
      for (const s of [-1, 1]) {
        const a = -Math.PI / 2 + s * (0.85 + r() * 0.35);
        x.strokeStyle = '#3b2b1a'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(cx, py); x.lineTo(cx + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
        needles(cx, py, a, len, Math.round(len * 0.9));
      }
    }
    needles(cx, h, -Math.PI / 2, h - 10, 140);
  });
}

/** Grass blades for the grass field: a strip of blades with alpha. */
export function grassBladeTex() {
  return canvasTex('blades', 128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 38; i++) {
      const bx = 4 + r() * (w - 8), lean = (r() - 0.5) * 30, top = h * (0.05 + r() * 0.35);
      const g = 90 + r() * 60;
      const grad = x.createLinearGradient(0, h, 0, top);
      grad.addColorStop(0, `rgb(${40 + r() * 20},${g * 0.55},${20})`); grad.addColorStop(1, `rgb(${100 + r() * 40},${g + 40},${40 + r() * 20})`);
      x.fillStyle = grad;
      x.beginPath(); x.moveTo(bx - 2.2, h); x.quadraticCurveTo(bx + lean * 0.3, (h + top) / 2, bx + lean, top); x.quadraticCurveTo(bx + lean * 0.3 + 1, (h + top) / 2, bx + 2.2, h); x.fill();
    }
  }, { clamp: true });
}

/** Little white and yellow flowers for meadows. */
export function flowerTex() {
  return canvasTex('flowers', 64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const r = rng(12);
    x.strokeStyle = '#3d6a24'; x.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const fx = 8 + r() * 48, fy = 6 + r() * 26;
      x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + (r() - 0.5) * 6, h); x.stroke();
      x.fillStyle = r() < 0.5 ? '#f4f0e0' : r() < 0.5 ? '#f2d43a' : '#c8a0e8';
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; x.beginPath(); x.arc(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 2.2, 0, 7); x.fill(); }
      x.fillStyle = '#e8b020'; x.beginPath(); x.arc(fx, fy, 1.6, 0, 7); x.fill();
    }
  }, { clamp: true });
}

/** A tileable water normal map from summed waves. */
export function waterNormalTex() {
  return canvasTex('waterN', 256, 256, (x, w, h) => {
    const img = x.createImageData(w, h), r = rng(3);
    const waves = [];
    for (let i = 0; i < 28; i++) { const kx = Math.round((r() - 0.5) * 14), ky = Math.round((r() - 0.5) * 14); if (!kx && !ky) continue; waves.push({ kx, ky, a: 1 / (Math.hypot(kx, ky) ** 1.15), p: r() * 6.28 }); }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let dx = 0, dy = 0;
      for (const v of waves) { const ph = (v.kx * i / w + v.ky * j / h) * Math.PI * 2 + v.p; const c = Math.cos(ph) * v.a; dx += c * v.kx; dy += c * v.ky; }
      const nx = -dx * 0.06, ny = -dy * 0.06, l = Math.hypot(nx, ny, 1);
      const k = (j * w + i) * 4;
      img.data[k] = Math.round((nx / l * 0.5 + 0.5) * 255); img.data[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); img.data[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { linear: true });
}

export { canvasTex };
