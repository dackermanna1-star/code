// Catalogue: fashion (see docs/CONTENT_GUIDE.md)
// Threadline basics, graphic tees & outfit sets, Maison Luxe pieces and
// Stockpile grail sneakers. Garments are modelled as flat-lay pieces (they
// read clearly in thumbnails & the wardrobe); shoes as staggered pairs with
// profile-extruded uppers and painted side panels.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, hemi, torus, cone, lathe, tube, extrude, shapeExtrude, at, rot, group, decal, labelTexture, FONT, fitText, tint } from '../items/kit.js';

const PI = Math.PI;

// =================================================================== textures
function patt(key, draw, rep, size = 128) { return labelTexture('fash:' + key, size, size, draw, { wrap: true, repeat: rep }); }
const twill = () => patt('twill', (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(30,40,60,0.16)'; x.lineWidth = 2;
  for (let i = -h; i < w + h; i += 6) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 260; i++) x.fillRect((i * 37) % w, (i * 53) % h, 2, 1);
}, [7, 7]);
function plaidTex(a, b, c) {
  return patt(`plaid:${a}:${b}:${c}`, (x, w, h) => {
    x.fillStyle = a; x.fillRect(0, 0, w, h);
    x.globalAlpha = 0.55; x.fillStyle = b; x.fillRect(0, h / 2, w, h / 2); x.fillRect(w / 2, 0, w / 2, h);
    x.globalAlpha = 0.85; x.fillStyle = c; x.fillRect(0, h * 0.24, w, 3); x.fillRect(w * 0.24, 0, 3, h);
    x.globalAlpha = 1;
  }, [9, 9]);
}
function stripeTex(a, b, k = 0.45, rep = 16) { return patt(`stripe:${a}:${b}:${k}:${rep}`, (x, w, h) => { x.fillStyle = a; x.fillRect(0, 0, w, h); x.fillStyle = b; x.fillRect(0, 0, w, h * k); }, [1, rep], 64); }
function waleTex(a, b, rep = 70) { return patt(`wale:${a}:${b}:${rep}`, (x, w, h) => { x.fillStyle = a; x.fillRect(0, 0, w, h); x.fillStyle = b; x.fillRect(0, 0, w * 0.35, h); }, [rep, 1], 32); }
function floralTex(bg, p1, p2) {
  return patt(`floral:${bg}:${p1}:${p2}`, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    const pts = [[22, 24, p1], [86, 38, p2], [52, 90, p1], [110, 106, p2], [14, 78, p2], [72, 8, p1], [100, 70, p1]];
    for (const [cx, cy, col] of pts) {
      x.fillStyle = '#6a8f4e'; x.beginPath(); x.ellipse(cx + 8, cy + 6, 6, 2.5, 0.6, 0, 7); x.fill();
      x.fillStyle = col; for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; x.beginPath(); x.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4.4, 0, 7); x.fill(); }
      x.fillStyle = '#f6c453'; x.beginPath(); x.arc(cx, cy, 2.6, 0, 7); x.fill();
    }
  }, [4, 4]);
}
const sequinTex = () => patt('sequin', (x, w, h) => {
  x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const v = 165 + ((i * 7 + j * 13) % 9) * 11; x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.arc(i * 8 + (j % 2) * 4 + 4, j * 8 + 4, 3.7, 0, 7); x.fill(); }
}, [14, 14]);
const quiltTex = () => patt('quilt', (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.14, '#f4f4f4'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.86, '#f0f0f0'); g.addColorStop(1, '#9a9a9a');
  x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, w, 2);
}, [1, 11], 64);
const furTex = () => patt('fur', (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const v = 200 + ((i * 97) % 55); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect((i * 31) % w, (i * 57 + (i >> 3)) % h, 2, 5); }
}, [3, 3]);
function checkerTex(a, b, rep) { return patt(`check:${a}:${b}:${rep}`, (x, w, h) => { x.fillStyle = a; x.fillRect(0, 0, w, h); x.fillStyle = b; x.fillRect(0, 0, w / 2, h / 2); x.fillRect(w / 2, h / 2, w / 2, h / 2); }, [rep, rep], 64); }

// =================================================================== fabrics
// Garments use non-sheen cloth: sheen washes colors out at the low thumbnail angle.
const cottonMap = () => MAT.fabric('#ffffff').map, knitMap = () => MAT.knit('#ffffff').map;
const ENV = 0.55;
function fab(kind, c) {
  switch (kind) {
    case 'knit': return mat(c, { rough: 1, map: knitMap(), envInt: ENV });
    case 'denim': return mat(c, { rough: 0.92, map: twill(), envInt: ENV });
    case 'nylon': return mat(c, { rough: 0.42, clearcoat: 0.3, envInt: 0.8 });
    case 'leather': return mat(c, { rough: 0.4, clearcoat: 0.5, envInt: 0.8 });
    case 'satin': return mat(c, { rough: 0.38, clearcoat: 0.15, envInt: 0.6 });
    case 'sequin': return mat(c, { rough: 0.25, metal: 0.75, map: sequinTex() });
    case 'fleece': return mat(c, { rough: 1, map: knitMap(), envInt: 0.5 });
    case 'fur': return mat(c, { rough: 1, map: furTex(), envInt: 0.6 });
    case 'puffer': return mat(c, { rough: 0.4, clearcoat: 0.4, map: quiltTex(), envInt: 0.8 });
    case 'pufferMetal': return mat(c, { rough: 0.22, metal: 0.75, map: quiltTex() });
    default: return mat(c, { rough: 0.92, map: cottonMap(), envInt: ENV });
  }
}
function patMat(p, fallback) {
  if (!p) return fallback;
  const o = { rough: 0.95, envInt: ENV };
  if (p.kind === 'plaid') return mat('#ffffff', { ...o, map: plaidTex(...p.c) });
  if (p.kind === 'stripe') return mat('#ffffff', { ...o, map: stripeTex(p.c[0], p.c[1], p.k, p.rep) });
  if (p.kind === 'floral') return mat('#ffffff', { ...o, map: floralTex(...p.c) });
  if (p.kind === 'wale') return mat('#ffffff', { ...o, map: waleTex(p.c[0], p.c[1]) });
  if (p.kind === 'check') return mat('#ffffff', { ...o, map: checkerTex(p.c[0], p.c[1], p.rep || 14) });
  return fallback;
}
const METAL = { gold: () => MAT.gold(), silver: () => MAT.chrome(), copper: () => mat('#b87333', { rough: 0.3, metal: 1 }), gunmetal: () => mat('#4a4d52', { rough: 0.3, metal: 1 }), rose: () => mat('#e0a98f', { rough: 0.25, metal: 1 }) };
const thread = (c = '#d9a441') => mat(c, { rough: 0.8 });

// =================================================================== flat-lay helpers
// Shape coordinates (x, y) lie flat on the floor; +y (collar/waist) points to -Z.
function slab(pts, d, bev, m, y0 = 0) { const e = extrude(pts, d, m, bev); e.rotation.x = -PI / 2; e.position.y = y0 + d / 2 + bev; return e; }
function seg(a, b, w, h, m, top) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const s = box(Math.hypot(dx, dy), h, w, m, { cast: false });
  s.rotation.y = Math.atan2(dy, dx);
  return at(s, (a[0] + b[0]) / 2, top + h / 2, -(a[1] + b[1]) / 2);
}
function stud(x, y, top, m, r = 0.0065) { return at(cyl(r, r, 0.004, m, 14), x, top + 0.002, -y); }
function flatDecal(w, h, key, draw, x, y, top) { const p = decal(w, h, key, draw, { tw: 256 }); p.rotation.x = -PI / 2; return at(p, x, top + 0.0012, -y); }
function curve(pts2, y, r, m) { return tube(pts2.map(([x, z]) => [x, y, -z]), r, m, 16, 5); }
const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function topOutline({ hw, len, sleeve, neckW, neckD, flare = 0, vneck = false, sleeveLen }) {
  const T = len / 2, B = -len / 2;
  const R = [];
  if (vneck) R.push([0, T - neckD], [neckW, T]);
  else for (let i = 0; i <= 5; i++) { const a = (i / 5) * PI / 2; R.push([neckW * Math.sin(a), T - neckD * Math.cos(a)]); }
  const sx = hw + 0.03, sy = T - 0.04;
  let sl = null;
  if (sleeve === 'none') {
    const s0 = neckW + 0.04;
    R.push([s0, T]);
    for (let i = 1; i <= 5; i++) { const a = (i / 5) * PI / 2; R.push([s0 + (hw - s0) * (1 - Math.cos(a)), T - 0.2 * Math.sin(a)]); }
  } else if (sleeve === 'short') {
    sl = [[sx, sy], [hw + 0.15, T - 0.15], [hw + 0.09, T - 0.235], [hw + 0.005, T - 0.18]];
    R.push(...sl);
  } else {
    const L = sleeveLen ?? len * 0.8;
    sl = [[sx, sy], [hw + 0.19, sy - L], [hw + 0.1, sy - L - 0.025], [hw + 0.005, T - 0.22]];
    R.push(...sl);
  }
  R.push([hw + flare, B], [0, B]);
  return { pts: [...R, ...mirrorPts(R.slice(1, -1))], sleeve: sl, T, B };
}

// A flat-lay top: tees, tanks, sweaters, hoodies, shirts, jackets, coats.
function flatTop(opt) {
  const o = { hw: 0.2, len: 0.62, sleeve: 'short', neck: 'crew', neckW: 0.07, neckD: 0.05, d: 0.008, bev: 0.005, fabric: 'cotton', ...opt };
  const base = fab(o.fabric, o.color);
  const m = patMat(o.pattern, base);
  const trimC = o.trim || o.color2 || tint(o.color, 0.86);
  const trim = fab(o.trimFabric || (o.fabric === 'denim' || o.fabric === 'puffer' || o.fabric === 'pufferMetal' ? 'cotton' : o.fabric), trimC);
  const vneck = ['v', 'lapel', 'cardigan'].includes(o.neck);
  const { pts, sleeve, T, B } = topOutline({ ...o, vneck });
  const g = group(slab(pts, o.d, o.bev, m));
  const top = o.d + o.bev * 2;
  const hw = o.hw;
  // sleeves in a contrast material (varsity)
  if (o.sleeveColor && sleeve) {
    const sm = fab(o.sleeveFabric || o.fabric, o.sleeveColor);
    for (const s of [1, -1]) { const p = sleeve.map(([x, y]) => [x * s, y]); g.add(slab(s > 0 ? p : p.reverse(), 0.001, 0.0035, sm, top - 0.006)); }
  }
  // cuffs / sleeve hems
  if (sleeve) {
    const [, o2, i2] = sleeve;
    const mid = along(o2, i2, 0.5), sh = along(sleeve[0], sleeve[3], 0.5);
    const ax = [sh[0] - mid[0], sh[1] - mid[1]], al = Math.hypot(...ax), ux = ax[0] / al, uy = ax[1] / al;
    const off = o.sleeve === 'long' ? 0.024 : 0.012;
    for (const s of [1, -1]) {
      const a = [(o2[0] + ux * off) * s, o2[1] + uy * off], b = [(i2[0] + ux * off) * s, i2[1] + uy * off];
      const cy = o.sleeveColor ? top + 0.0025 : top - 0.002;
      g.add(o.sleeve === 'long' && o.cuffs !== false ? seg(a, b, 0.045, 0.004, trim, cy) : seg(a, b, 0.004, 0.002, thread(tint(o.color, 0.7)), top));
    }
  }
  if (o.rib) g.add(seg([-hw - (o.flare || 0) + 0.004, B + 0.024], [hw + (o.flare || 0) - 0.004, B + 0.024], 0.045, 0.004, trim, top - 0.002));
  // collar
  const nW = o.neckW, nD = o.neckD;
  if (o.neck === 'crew' || o.neck === 'scoop') {
    const c = torus(nW, o.neck === 'scoop' ? 0.005 : 0.009, trim, 6, 24, PI); c.rotation.x = PI / 2; c.scale.set(1, nD / nW, 1); g.add(at(c, 0, top - 0.002, -T));
  } else if (o.neck === 'v' || o.neck === 'cardigan') {
    for (const s of [1, -1]) g.add(seg([s * nW, T - 0.004], [0, T - nD], 0.016, 0.003, trim, top - 0.001));
  } else if (o.neck === 'collar' || o.neck === 'polo') {
    const k = o.neck === 'polo' ? 0.8 : 1;
    const wing = [[0.004, T - nD + 0.004], [nW + 0.018 * k, T + 0.006], [nW + 0.014 * k, T - 0.03 * k], [0.045 * k, T - nD - 0.05 * k]];
    const cm = o.collarColor ? fab('cotton', o.collarColor) : o.pattern ? m : trim;
    g.add(seg([-nW - 0.01, T - 0.006], [nW + 0.01, T - 0.006], 0.024, 0.003, cm, top - 0.001));
    g.add(slab(wing, 0.001, 0.0028, cm, top - 0.002), slab(mirrorPts(wing), 0.001, 0.0028, cm, top - 0.002));
  } else if (o.neck === 'lapel') {
    const inner = [[-0.07, T - 0.012], [0.07, T - 0.012], [0, T - nD + 0.02]];
    g.add(slab(inner, 0.001, 0.002, fab('cotton', o.shirt || '#f2efe8'), top - 0.004));
    const lap = [[nW * 0.5, T + 0.004], [nW + 0.032, T - 0.012], [nW + 0.05, T - 0.075], [0.105, T - 0.13], [0.018, T - nD], [0.004, T - nD + 0.02], [nW * 0.4, T - 0.045]];
    const lm = o.lapelColor ? fab(o.fabric, o.lapelColor) : o.pattern ? m : fab(o.fabric, tint(o.color, 0.94));
    g.add(slab(lap, 0.001, 0.003, lm, top - 0.002), slab(mirrorPts(lap), 0.001, 0.003, lm, top - 0.002));
  } else if (o.neck === 'mock' || o.neck === 'turtle') {
    g.add(at(rbox(nW * 2 + 0.05, 0.026, o.neck === 'turtle' ? 0.075 : 0.055, 0.012, o.neck === 'turtle' ? trim : m), 0, top + 0.008, -(T - 0.012)));
  } else if (o.neck === 'hood') {
    const hood = [];
    for (let i = 0; i <= 20; i++) { const a = PI * 1.06 - (i / 20) * PI * 1.12; hood.push([Math.cos(a) * 0.145, T + 0.03 + Math.sin(a) * 0.12]); }
    hood.push([0.06, T - 0.06], [-0.06, T - 0.06]);
    g.add(slab(hood, Math.max(0.002, o.d - 0.004), o.bev, m));
    const rim = torus(0.088, 0.011, trim, 6, 24, PI); rim.rotation.x = -PI / 2; rim.scale.set(1, 0.85, 1); g.add(at(rim, 0, top - 0.004, -T + 0.02));
    g.add(seg([0, T + 0.06], [0, T + 0.145], 0.004, 0.002, thread(tint(o.color, 0.65)), top - 0.004));
  }
  // drawstrings
  if (o.strings) {
    const sm = mat(o.strings, { rough: 0.7 });
    for (const s of [1, -1]) {
      g.add(curve([[s * 0.035, T - nD + 0.01], [s * 0.042, T - nD - 0.07], [s * 0.034, T - nD - 0.16]], top + 0.004, 0.0035, sm));
      const ag = cyl(0.0045, 0.0045, 0.02, mat('#d8d8d8', { rough: 0.3, metal: 0.6 }), 8); ag.rotation.x = PI / 2; g.add(at(ag, s * 0.034, top + 0.004, -(T - nD - 0.17)));
    }
  }
  // closures
  const btnM = o.buttons === 'gold' ? MAT.gold() : o.buttons === 'copper' ? METAL.copper() : mat(o.buttons || '#f2efe6', { rough: 0.35, clearcoat: 0.6 });
  if (o.placket === 'buttons' || o.placket === 'henley' || o.placket === 'polo') {
    const end = o.placket === 'buttons' ? B + 0.012 : T - nD - (o.placket === 'polo' ? 0.1 : 0.16);
    g.add(seg([0, T - nD + 0.004], [0, end], 0.03, 0.002, o.pattern ? m : trim, top));
    const n = o.placket === 'buttons' ? Math.round((T - nD - B) / 0.085) : 3;
    for (let i = 0; i < n; i++) g.add(stud(0, T - nD - 0.025 - i * ((T - nD - 0.025 - end - 0.02) / Math.max(1, n - 1)), top + 0.002, btnM));
  } else if (o.placket === 'zip') {
    g.add(seg([0, T - (o.neck === 'mock' || o.neck === 'hood' ? 0.01 : nD) + 0.004], [0, B + 0.006], 0.008, 0.003, o.zipM || MAT.chrome(), top));
    g.add(at(rbox(0.012, 0.004, 0.028, 0.002, o.zipM || MAT.chrome()), 0.008, top + 0.005, -(T - 0.06)));
  } else if (o.placket === 'double') {
    for (const sx of [-0.055, 0.055]) for (let i = 0; i < 3; i++) g.add(stud(sx, T - nD + 0.02 - i * 0.085, top, btnM, 0.009));
  } else if (o.placket === 'snaps') {
    for (let i = 0; i < 5; i++) g.add(stud(0, T - 0.07 - i * 0.1, top, btnM, 0.007));
    g.add(seg([0, T - 0.04], [0, B + 0.01], 0.004, 0.002, thread(), top));
  }
  // pockets
  if (o.pocket === 'chest') g.add(at(rbox(0.075, 0.004, 0.085, 0.003, o.pattern ? m : trim), 0.1, top + 0.002, -(T - 0.21)));
  if (o.pocket === 'kangaroo') {
    const kp = [[-0.15, B + 0.065], [0.15, B + 0.065], [0.11, B + 0.23], [-0.11, B + 0.23]];
    g.add(slab(kp, 0.001, 0.003, fab(o.fabric, tint(o.color, 0.95)), top - 0.003));
    for (const s of [1, -1]) g.add(seg([s * 0.15, B + 0.07], [s * 0.11, B + 0.225], 0.005, 0.002, fab(o.fabric, tint(o.color, 0.75)), top + 0.0035));
  }
  if (o.pocket === 'flaps') for (const s of [1, -1]) {
    const fp = [[-0.048, 0.022], [0.048, 0.022], [0.048, -0.012], [0, -0.03], [-0.048, -0.012]].map(([x, y]) => [x + s * 0.1, y + T - 0.17]);
    g.add(slab(fp, 0.001, 0.0025, m, top - 0.001), stud(s * 0.1, T - 0.19, top + 0.004, btnM, 0.006));
  }
  if (o.pocket === 'side' || o.pocket === 'slits') for (const s of [1, -1]) {
    if (o.pocket === 'side') g.add(seg([s * 0.08, B + 0.2], [s * 0.18, B + 0.22], 0.04, 0.003, m, top));
    else g.add(seg([s * 0.12, B + 0.13], [s * 0.155, B + 0.27], 0.006, 0.002, mat('#1a1a1a', { rough: 0.8 }), top));
  }
  // belt (trench)
  if (o.belt) {
    const yw = T - o.len * 0.52;
    const bm = fab(o.fabric, tint(o.color, 0.88));
    g.add(seg([-hw - 0.012, yw], [hw + 0.012, yw], 0.045, 0.004, bm, top + 0.001));
    const bk = torus(0.02, 0.0035, o.beltBuckle === 'gold' ? MAT.gold() : mat('#2b2420', { rough: 0.4 }), 6, 4); bk.rotation.x = PI / 2; bk.scale.set(1.2, 0.9, 1); g.add(at(bk, 0.055, top + 0.007, -yw));
    g.add(seg([0.075, yw - 0.004], [0.13, yw - 0.13], 0.04, 0.004, bm, top + 0.001));
  }
  // prints, patches
  if (o.print) { const p = o.print; g.add(flatDecal(p.w || 0.22, p.h || p.w || 0.22, 'tee:' + p.key, p.draw, p.x || 0, T - (p.y ?? 0.22), top)); }
  if (o.patch) { const p = o.patch; g.add(flatDecal(p.w || 0.09, p.h || p.w || 0.09, 'patch:' + p.key, p.draw, p.x ?? -0.1, T - (p.y ?? 0.2), top + 0.001)); }
  if (o.extra) o.extra(g, { T, B, top, hw, m, trim });
  return g;
}

// A flat-lay dress: bodice + flared skirt.
function flatDress(opt) {
  const o = { hw: 0.16, len: 0.86, hem: 0.34, neckW: 0.075, neckD: 0.08, d: 0.007, bev: 0.004, fabric: 'cotton', ...opt };
  const m = patMat(o.pattern, fab(o.fabric, o.color));
  const T = o.len / 2, B = -o.len / 2, W = T - 0.34;
  const R = [];
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * PI / 2; R.push([o.neckW * Math.sin(a), T - o.neckD * Math.cos(a)]); }
  if (o.sleeves) R.push([o.hw + 0.025, T - 0.03], [o.hw + 0.09, T - 0.11], [o.hw + 0.05, T - 0.165], [o.hw, T - 0.15]);
  else { const s0 = o.neckW + 0.018; R.push([s0, T]); for (let i = 1; i <= 4; i++) { const a = (i / 4) * PI / 2; R.push([s0 + (o.hw - s0) * (1 - Math.cos(a)), T - 0.17 * Math.sin(a)]); } }
  R.push([o.hw - 0.025, W], [o.hem * 0.92, B + 0.03], [o.hem, B], [0, B - 0.012]);
  const g = group(slab([...R, ...mirrorPts(R.slice(1, -1))], o.d, o.bev, m));
  const top = o.d + o.bev * 2;
  const tm = fab(o.fabric === 'sequin' ? 'satin' : o.fabric, o.trim || tint(o.color, 0.85));
  g.add(seg([-o.hw + 0.025, W], [o.hw - 0.025, W], o.sash ? 0.04 : 0.008, 0.003, o.sash ? fab('satin', o.sash) : tm, top));
  if (o.sash) { for (const s of [1, -1]) { const lp = torus(0.025, 0.008, fab('satin', o.sash), 6, 14); lp.rotation.x = PI / 2; lp.scale.set(1.3, 0.7, 1); g.add(at(lp, 0.07 + s * 0.03, top + 0.006, -W)); } }
  if (!o.sleeves) for (const s of [1, -1]) g.add(seg([s * (o.neckW + 0.009), T - 0.004], [s * (o.neckW + 0.012), T + 0.06], 0.008, 0.003, tm, top - 0.002));
  const c = torus(o.neckW, 0.005, tm, 6, 20, PI); c.rotation.x = PI / 2; c.scale.set(1, o.neckD / o.neckW, 1); g.add(at(c, 0, top - 0.002, -T));
  if (o.ruffle) g.add(seg([-o.hem + 0.01, B + 0.04], [o.hem - 0.01, B + 0.04], 0.05, 0.004, tm, top - 0.002));
  g.rotation.y = PI / 2; // lay long garments sideways so the silhouette reads
  return group(g);
}

// A flat-lay bottom: jeans, trousers, sweats, cargo, shorts, skirts.
function flatBottom(opt) {
  const o = { kind: 'pants', hw: 0.19, len: 0.84, rise: 0.28, out: 0.025, legW: 0.15, d: 0.009, bev: 0.005, fabric: 'cotton', detail: 'chino', ...opt };
  const base = fab(o.fabric, o.color);
  const m = patMat(o.pattern, base);
  const T = o.len / 2, B = -o.len / 2, hw = o.hw;
  let R;
  if (o.kind === 'skirt') {
    R = [[0, T], [hw, T], [hw + o.flare * 0.5, T - o.len * 0.45], [hw + o.flare, B], [0, B - 0.01]];
  } else {
    R = [[0, T], [hw, T], [hw + 0.018, T - 0.16], [hw + o.out, B], [hw + o.out - o.legW, B], [0, T - o.rise]];
  }
  const g = group(slab([...R, ...mirrorPts(R.slice(1, -1))], o.d, o.bev, m));
  const top = o.d + o.bev * 2;
  const wbM = o.detail === 'sweats' || o.detail === 'pj' ? fab(o.fabric === 'denim' ? 'cotton' : 'knit', o.waistColor || tint(o.color, 0.9)) : o.pattern ? m : fab(o.fabric, tint(o.color, 0.93));
  const wb = o.detail === 'sweats' || o.detail === 'pj' ? 0.06 : 0.042;
  g.add(seg([-hw + 0.003, T - wb / 2 - 0.002], [hw - 0.003, T - wb / 2 - 0.002], wb, 0.004, wbM, top - 0.002));
  const st = thread(o.stitch || (o.fabric === 'denim' ? '#d9a441' : tint(o.color, 0.7)));
  const hemL = [hw + o.out - o.legW, B], hemR = [hw + o.out, B];
  if (o.detail === 'jeans' || o.detail === 'chino' || o.detail === 'cargo' || o.detail === 'trouser') {
    const metal = o.fabric === 'denim' ? METAL.copper() : mat(tint(o.color, 0.6), { rough: 0.4 });
    g.add(stud(0.012, T - wb / 2 - 0.002, top + 0.002, metal, 0.008));
    g.add(curve([[0.035, T - wb - 0.002], [0.035, T - 0.15], [0.006, T - 0.19]], top + 0.0015, 0.0016, st));
    for (const s of [1, -1]) {
      if (o.detail === 'jeans') {
        g.add(curve([[s * (hw - 0.095), T - wb - 0.001], [s * (hw - 0.04), T - 0.1], [s * (hw + 0.012), T - 0.135]], top + 0.0015, 0.0018, st));
        g.add(stud(s * (hw + 0.008), T - wb - 0.004, top + 0.001, metal, 0.004));
      } else g.add(seg([s * (hw - 0.07), T - wb - 0.002], [s * (hw + 0.012), T - 0.16], 0.0035, 0.002, st, top));
      for (const lx of [0.075, hw - 0.025]) g.add(seg([s * lx, T - 0.002], [s * lx, T - wb - 0.006], 0.012, 0.004, wbM, top));
      if (o.detail === 'trouser' || o.detail === 'chino') g.add(seg([s * (hw * 0.55 + 0.01), T - wb - 0.03], [s * ((hemL[0] + hemR[0]) / 2), B + 0.02], 0.004, 0.0015, fab(o.fabric, tint(o.color, 1.12)), top));
      if (o.detail === 'cargo') {
        const cx = s * (hw - 0.02), cy = T - 0.46;
        g.add(at(rbox(0.1, 0.012, 0.13, 0.005, m), cx, top + 0.003, -cy));
        g.add(at(rbox(0.106, 0.006, 0.042, 0.003, fab(o.fabric, tint(o.color, 0.9))), cx, top + 0.011, -(cy + 0.05)));
        if (o.straps) { g.add(seg([s * (hw - 0.05), T - 0.6], [s * (hw - 0.09), T - 0.72], 0.022, 0.003, mat('#111', { rough: 0.6 }), top)); g.add(at(rbox(0.026, 0.006, 0.016, 0.002, MAT.chrome()), s * (hw - 0.05), top + 0.004, -(T - 0.6))); }
      }
    }
  }
  if (o.detail === 'sweats' || o.detail === 'pj') {
    const sm = mat(o.strings || '#f2f2f2', { rough: 0.7 });
    for (const s of [1, -1]) {
      g.add(curve([[s * 0.02, T - 0.03], [s * 0.035, T - 0.08], [s * 0.025, T - 0.14]], top + 0.004, 0.003, sm));
      if (o.pocketSlits !== false) g.add(seg([s * (hw - 0.03), T - 0.08], [s * (hw + 0.012), T - 0.2], 0.005, 0.002, mat('#1b1b1b', { rough: 0.9 }), top));
      if (o.piping) g.add(seg([s * (hw + 0.004), T - 0.065], [s * (hw + o.out - 0.006), B + 0.01], 0.006, 0.002, fab('cotton', o.piping), top));
    }
  }
  // leg hems
  for (const s of [1, -1]) {
    const a = [s * (hemL[0] + 0.004), B + 0.024], b = [s * (hemR[0] - 0.004), B + 0.024];
    if (o.kind === 'skirt') continue;
    if (o.cuffs) g.add(seg(a, b, 0.05, 0.004, fab('knit', o.cuffColor || tint(o.color, 0.9)), top - 0.002));
    else if (o.rolled) g.add(seg(a, b, 0.045, 0.005, fab(o.fabric, o.rolled), top - 0.002));
    else if (o.frayed) { g.add(seg([a[0], B + 0.006], [b[0], B + 0.006], 0.014, 0.003, MAT.fabric(o.frayed), top - 0.003)); g.add(at(rbox(0.055, 0.003, 0.05, 0.002, MAT.fabric('#f4f1ea')), s * (hw - 0.045), top - 0.004, -(B - 0.016))); }
    else g.add(seg(a, b, 0.004, 0.002, st, top));
  }
  if (o.kind === 'skirt') {
    if (o.pleats) for (let i = -o.pleats; i <= o.pleats; i++) { const t = i / (o.pleats + 1); g.add(seg([t * (hw - 0.02), T - wb - 0.004], [t * (hw + o.flare - 0.02), B + 0.006], 0.005, 0.0025, fab('cotton', tint(o.pattern ? '#000000' : o.color, 0.6)), top - 0.0005)); }
    if (o.pin) { g.add(seg([hw - 0.06, B + 0.14], [hw - 0.01, B + 0.2], 0.005, 0.003, MAT.gold(), top + 0.001)); g.add(at(sph(0.006, MAT.gold(), 10, 8), hw - 0.06, top + 0.003, -(B + 0.14))); }
    if (o.hemStripe) g.add(seg([-hw - o.flare + 0.012, B + 0.035], [hw + o.flare - 0.012, B + 0.035], 0.014, 0.003, fab('cotton', o.hemStripe), top + 0.0005));
    if (o.button) { for (let i = 0; i < 5; i++) g.add(stud(0.05, T - wb - 0.03 - i * 0.12, top + 0.002, mat(o.button, { rough: 0.35, clearcoat: 0.5 }), 0.008)); g.add(seg([0.05, T - wb], [0.05, B + 0.01], 0.022, 0.002, fab(o.fabric, tint(o.color, 0.94)), top)); }
    if (o.gathers) for (let i = -o.gathers; i <= o.gathers; i++) { const t = i / (o.gathers + 0.5); g.add(seg([t * (hw - 0.03), T - wb - 0.01], [t * (hw + o.flare - 0.04), B + 0.03], 0.012, 0.0015, fab(o.fabric, tint(o.color, 0.92)), top - 0.001)); }
  }
  if (o.kind !== 'skirt' && o.len > 0.6) { g.rotation.y = PI / 2; return group(g); }
  return g;
}

// =================================================================== tee prints
const ink = (x, c) => { x.fillStyle = c; x.strokeStyle = c; };
function txt(x, s, cx, cy, size, c, w = 900, maxW = 230, font = FONT) { x.font = `${w} ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; ink(x, c); fitText(x, s, cx, cy, maxW); }
const PRINTS = {
  sunset: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 30, 0, 150); g.addColorStop(0, '#ffd166'); g.addColorStop(0.5, '#f8961e'); g.addColorStop(1, '#e5446d');
    x.save(); x.beginPath(); x.arc(128, 150, 92, PI, 0); x.closePath(); x.clip(); x.fillStyle = g; x.fillRect(0, 40, w, 120);
    x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 5; i++) x.fillRect(0, 98 + i * 11, w, 3 + i * 1.3); x.restore();
    txt(x, 'SUNSET CLUB', 128, 186, 34, '#3d2c5c'); txt(x, 'EST. 1986 · DOWNTOWN', 128, 218, 15, '#3d2c5c', 700);
  },
  smiley: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    ink(x, '#ffd60a'); x.beginPath(); x.arc(128, 112, 82, 0, 7); x.fill(); x.lineWidth = 5; ink(x, '#1b1b1b'); x.stroke();
    x.beginPath(); x.ellipse(100, 92, 9, 18, 0, 0, 7); x.ellipse(156, 92, 9, 18, 0, 0, 7); x.fill();
    x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.arc(128, 116, 48, 0.2 * PI, 0.8 * PI); x.stroke();
    txt(x, 'HAVE A NICE DAY', 128, 222, 26, '#ff5d8f', 900);
  },
  ghosts: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    txt(x, 'STATIC', 128, 36, 46, '#f1f1f1', 900, 220, 'Georgia, serif');
    ink(x, '#e9e9e9'); x.beginPath(); x.moveTo(84, 190); x.lineTo(84, 120); x.arc(128, 120, 44, PI, 0); x.lineTo(172, 190);
    for (let i = 0; i < 4; i++) x.quadraticCurveTo(161 - i * 22, 172, 150 - i * 22, 190); x.fill();
    ink(x, '#111'); x.beginPath(); x.ellipse(112, 120, 7, 11, 0, 0, 7); x.ellipse(144, 120, 7, 11, 0, 0, 7); x.ellipse(128, 150, 9, 12, 0, 0, 7); x.fill();
    txt(x, 'GHOSTS', 128, 222, 40, '#f1f1f1', 900, 220, 'Georgia, serif'); txt(x, 'WORLD TOUR ’26', 128, 248, 13, '#b5b5b5', 700);
  },
  flame: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const tongue = (cx, hh, ww, c) => { ink(x, c); x.beginPath(); x.moveTo(cx - ww, 180); x.quadraticCurveTo(cx - ww * 1.1, 180 - hh * 0.5, cx, 180 - hh); x.quadraticCurveTo(cx + ww * 0.2, 180 - hh * 0.55, cx + ww, 180); x.fill(); };
    [[60, 90, 26], [100, 140, 32], [150, 120, 30], [196, 96, 26], [128, 165, 26]].forEach(([cx, hh, ww]) => tongue(cx, hh, ww, '#e63946'));
    [[60, 62, 16], [100, 104, 20], [150, 86, 18], [196, 66, 15], [128, 128, 15]].forEach(([cx, hh, ww]) => tongue(cx, hh, ww, '#f77f00'));
    [[100, 60, 10], [150, 50, 9], [128, 82, 8]].forEach(([cx, hh, ww]) => tongue(cx, hh, ww, '#ffd166'));
    x.save(); x.transform(1, 0, -0.2, 1, 25, 0); txt(x, 'HEAT CHECK', 128, 214, 40, '#ffffff', 900); x.restore();
  },
  catnap: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    ink(x, '#3d3a4b'); x.beginPath(); x.ellipse(128, 128, 70, 58, 0, 0, 7); x.fill();
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128 + s * 66, 104); x.lineTo(128 + s * 56, 50); x.lineTo(128 + s * 24, 78); x.fill(); }
    x.lineWidth = 5; x.lineCap = 'round'; ink(x, '#f6d8b8');
    for (const s of [-1, 1]) { x.beginPath(); x.arc(128 + s * 28, 122, 13, 0.15 * PI, 0.85 * PI); x.stroke(); }
    ink(x, '#f4a3b4'); x.beginPath(); x.moveTo(121, 144); x.lineTo(135, 144); x.lineTo(128, 152); x.fill();
    txt(x, 'z', 196, 66, 26, '#8ecae6', 800); txt(x, 'Z', 214, 40, 34, '#8ecae6', 800);
    txt(x, 'CAT NAP CLUB', 128, 218, 30, '#3d3a4b', 900);
  },
  angel: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    txt(x, 'angel', 128, 122, 78, '#ff4fa3', 700, 240, 'Georgia, serif');
    ink(x, '#ffb3d9');
    const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2, rr = i % 2 ? r * 0.35 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); };
    star(40, 70, 14); star(214, 160, 12); star(210, 64, 9); star(52, 172, 9);
    x.lineWidth = 4; x.strokeStyle = '#ffd166'; x.beginPath(); x.ellipse(128, 60, 34, 9, 0, 0, 7); x.stroke();
  },
  logo: (x, w, h) => { x.clearRect(0, 0, w, h); txt(x, 'THREADLINE', 128, 118, 40, '#f5f5f5', 900); x.fillStyle = '#f5f5f5'; x.fillRect(40, 146, 176, 5); txt(x, 'FRESH FITS · ZERO LINES', 128, 170, 14, '#f5f5f5', 700); },
  fairisle: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#f4efe6'; x.fillRect(0, 54, w, 148);
    x.fillStyle = '#1f6f50'; x.fillRect(0, 54, w, 10); x.fillRect(0, 192, w, 10);
    x.fillStyle = '#c1121f';
    for (let i = 0; i < 9; i++) { const cx = 14 + i * 29; x.save(); x.translate(cx, 128); for (let k = 0; k < 6; k++) { x.rotate(PI / 3); x.fillRect(-2, 0, 4, 34); x.fillRect(-7, 18, 14, 3); } x.restore(); }
    for (let i = 0; i < 26; i++) { x.fillStyle = i % 2 ? '#1f6f50' : '#c1121f'; x.beginPath(); x.moveTo(i * 10, 72); x.lineTo(i * 10 + 5, 80); x.lineTo(i * 10 + 10, 72); x.fill(); x.beginPath(); x.moveTo(i * 10, 184); x.lineTo(i * 10 + 5, 176); x.lineTo(i * 10 + 10, 184); x.fill(); }
  },
  varsity: (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.font = `900 220px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = 26; x.strokeStyle = '#f1e9d2'; x.strokeText('H', 128, 140); x.fillStyle = '#c1121f'; x.fillText('H', 128, 140);
  },
  yacht: (x, w, h) => { x.clearRect(0, 0, w, h); txt(x, 'YC', 128, 120, 120, '#f2e6c9', 900, 220, 'Georgia, serif'); x.fillStyle = '#c1121f'; x.fillRect(48, 196, 160, 10); },
  techlogo: (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = '#d6ff3a'; x.lineWidth = 12; x.beginPath(); x.moveTo(40, 170); x.lineTo(100, 70); x.lineTo(150, 150); x.lineTo(210, 60); x.stroke(); },
};

// =================================================================== shoes
// Side profiles [u (toe +), v (up)] of the upper, sitting on the midsole.
const PROF = {
  low: { pts: [[-0.136, 0], [-0.141, 0.03], [-0.139, 0.058], [-0.128, 0.07], [-0.105, 0.066], [-0.075, 0.058], [-0.05, 0.062], [-0.03, 0.074], [-0.015, 0.07], [0.03, 0.058], [0.075, 0.044], [0.11, 0.033], [0.132, 0.022], [0.142, 0.01], [0.14, 0]], lace: [[-0.028, 0.07], [0.062, 0.047]], open: [-0.087, 0.061, 0.04], n: 5 },
  high: { pts: [[-0.136, 0], [-0.142, 0.04], [-0.14, 0.1], [-0.132, 0.13], [-0.11, 0.134], [-0.075, 0.128], [-0.05, 0.14], [-0.036, 0.132], [-0.012, 0.1], [0.03, 0.07], [0.075, 0.05], [0.11, 0.036], [0.133, 0.024], [0.143, 0.01], [0.14, 0]], lace: [[-0.035, 0.124], [0.062, 0.052]], open: [-0.093, 0.13, 0.035], n: 7 },
  runner: { pts: [[-0.132, 0], [-0.14, 0.03], [-0.141, 0.062], [-0.132, 0.076], [-0.108, 0.064], [-0.072, 0.055], [-0.045, 0.06], [-0.026, 0.07], [0.0, 0.064], [0.05, 0.048], [0.095, 0.035], [0.128, 0.022], [0.143, 0.008], [0.14, 0]], lace: [[-0.024, 0.066], [0.058, 0.044]], open: [-0.088, 0.058, 0.036], n: 5 },
  slipon: { pts: [[-0.136, 0], [-0.141, 0.03], [-0.139, 0.055], [-0.126, 0.064], [-0.09, 0.056], [-0.05, 0.054], [-0.025, 0.06], [0.03, 0.052], [0.08, 0.04], [0.115, 0.03], [0.135, 0.019], [0.143, 0.008], [0.14, 0]], open: [-0.075, 0.056, 0.05] },
  chelsea: { pts: [[-0.134, 0], [-0.141, 0.04], [-0.137, 0.12], [-0.132, 0.172], [-0.12, 0.18], [-0.042, 0.178], [-0.028, 0.17], [-0.02, 0.12], [0.01, 0.085], [0.06, 0.06], [0.105, 0.042], [0.132, 0.026], [0.143, 0.01], [0.14, 0]], open: [-0.08, 0.178, 0.036] },
  combat: { pts: [[-0.134, 0], [-0.142, 0.05], [-0.138, 0.15], [-0.132, 0.2], [-0.115, 0.205], [-0.05, 0.2], [-0.032, 0.206], [-0.022, 0.19], [-0.006, 0.12], [0.03, 0.08], [0.075, 0.056], [0.112, 0.04], [0.135, 0.026], [0.145, 0.01], [0.14, 0]], lace: [[-0.024, 0.19], [0.05, 0.066]], open: [-0.083, 0.2, 0.03], n: 8 },
  shearling: { pts: [[-0.13, 0], [-0.142, 0.04], [-0.14, 0.15], [-0.136, 0.2], [-0.12, 0.21], [-0.03, 0.21], [-0.016, 0.2], [-0.012, 0.13], [0.02, 0.085], [0.07, 0.062], [0.115, 0.045], [0.138, 0.028], [0.145, 0.012], [0.14, 0]], open: [-0.075, 0.208, 0.04] },
  hiker: { pts: [[-0.134, 0], [-0.142, 0.04], [-0.14, 0.1], [-0.132, 0.14], [-0.11, 0.146], [-0.075, 0.138], [-0.048, 0.15], [-0.034, 0.142], [-0.012, 0.106], [0.03, 0.074], [0.075, 0.054], [0.112, 0.038], [0.134, 0.025], [0.145, 0.01], [0.14, 0]], lace: [[-0.034, 0.134], [0.06, 0.056]], open: [-0.092, 0.14, 0.034], n: 7 },
  loafer: { pts: [[-0.134, 0], [-0.14, 0.025], [-0.137, 0.048], [-0.125, 0.056], [-0.09, 0.05], [-0.05, 0.045], [-0.02, 0.05], [0.02, 0.05], [0.07, 0.044], [0.11, 0.034], [0.133, 0.022], [0.143, 0.009], [0.14, 0]], open: [-0.07, 0.046, 0.05] },
};
const SU = 0.32, SV = 0.24;
// Paint the flat sides of an upper: color blocks, logo, stitching (mapped in profile coordinates).
function shoeArt(key, o, prof) {
  const t = labelTexture('shoe:' + key, 256, 192, (x, w, h) => {
    const P = (u, v) => [((u + SU / 2) / SU) * w, (1 - v / SV) * h];
    const poly = (pts, c) => { x.fillStyle = c; x.beginPath(); pts.forEach(([u, v], i) => { const [px, py] = P(u, v); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath(); x.fill(); };
    x.fillStyle = o.upper; x.fillRect(0, 0, w, h);
    if (o.checker) { const n = 16; for (let j = 0; j < n; j++) for (let i = 0; i < n * 1.4; i++) if ((i + j) % 2) { x.fillStyle = o.checker; x.fillRect(i * w / (n * 1.4), j * h / n, w / (n * 1.4) + 0.5, h / n + 0.5); } }
    if (o.vamp) poly([[0.02, -0.02], [0.0, 0.2], [0.2, 0.2], [0.2, -0.02]], o.vamp);
    if (o.collar) poly([[-0.2, 0.25], [-0.2, prof === 'low' ? 0.05 : 0.095], [-0.12, prof === 'low' ? 0.05 : 0.09], [-0.035, prof === 'low' ? 0.064 : 0.112], [-0.02, 0.25]], o.collar);
    if (o.heel) poly([[-0.2, -0.02], [-0.2, prof === 'high' || prof === 'hiker' ? 0.1 : 0.072], [-0.128, prof === 'high' || prof === 'hiker' ? 0.1 : 0.066], [-0.1, 0.045], [-0.075, 0.02], [-0.06, -0.02]], o.heel);
    if (o.toe) poly([[0.055, -0.02], [0.05, 0.022], [0.075, 0.04], [0.105, 0.045], [0.2, 0.05], [0.2, -0.02]], o.toe);
    const L = PROF[prof].lace;
    if (o.eyestay && L) { const [[u0, v0], [u1, v1]] = L; poly([[u0 - 0.012, v0 + 0.02], [u1 + 0.014, v1 + 0.006], [u1 + 0.006, v1 - 0.016], [u0 - 0.02, v0 - 0.02]], o.eyestay); }
    if (o.foxing) { poly([[-0.2, -0.02], [0.2, -0.02], [0.2, 0.013], [-0.2, 0.013]], o.foxing); if (o.foxStripe) poly([[-0.2, 0.004], [0.2, 0.004], [0.2, 0.008], [-0.2, 0.008]], o.foxStripe); }
    if (o.gore) poly([[-0.1, 0.2], [-0.072, 0.085], [-0.044, 0.2]], o.gore);
    if (o.perf) { x.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { const [px, py] = P(0.088 + i * 0.01, 0.022 + j * 0.01); x.beginPath(); x.arc(px, py, 1.4, 0, 7); x.fill(); } }
    const lc = o.logoColor || '#111111';
    const big = prof === 'high' ? 1.12 : 1;
    if (o.logo === 'swoosh' || o.logo === 'reverse') {
      const f = o.logo === 'reverse' ? -1 : 1;
      const Q = (u, v) => P(f * u * big, v * big + (prof === 'high' ? 0.006 : 0));
      x.fillStyle = lc; x.beginPath(); x.moveTo(...Q(-0.115, 0.03)); x.quadraticCurveTo(...Q(-0.03, -0.012), ...Q(0.078, 0.062)); x.quadraticCurveTo(...Q(-0.02, 0.022), ...Q(-0.088, 0.046)); x.quadraticCurveTo(...Q(-0.13, 0.05), ...Q(-0.115, 0.03)); x.fill();
    } else if (o.logo === 'stripes') {
      for (let i = 0; i < 3; i++) poly([[-0.03 + i * 0.024, 0.066], [-0.018 + i * 0.024, 0.066], [0.012 + i * 0.024, 0.004], [0.0 + i * 0.024, 0.004]], lc);
    } else if (o.logo === 'star') {
      const [cx, cy] = P(-0.098, 0.088); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.fill(); x.fillStyle = lc; x.beginPath();
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 10) * PI * 2, r = i % 2 ? 4.5 : 11; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill();
    } else if (o.logo === 'wave') {
      x.strokeStyle = lc; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(...P(-0.125, 0.018)); x.bezierCurveTo(...P(-0.08, 0.075), ...P(-0.04, -0.01), ...P(0.02, 0.04)); x.bezierCurveTo(...P(0.04, 0.055), ...P(0.06, 0.03), ...P(0.07, 0.04)); x.stroke();
    } else if (o.logo === 'bolt') {
      poly([[-0.07, 0.07], [-0.03, 0.07], [-0.045, 0.045], [-0.005, 0.045], [-0.07, 0.006], [-0.052, 0.034], [-0.09, 0.034]], lc);
    } else if (o.logo === 'n') {
      poly([[-0.075, 0.012], [-0.06, 0.012], [-0.06, 0.045], [-0.03, 0.012], [-0.015, 0.012], [-0.015, 0.064], [-0.03, 0.064], [-0.03, 0.03], [-0.06, 0.064], [-0.075, 0.064]], lc);
    }
    if (o.stitch) { x.strokeStyle = o.stitch; x.lineWidth = 1.2; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(...P(-0.15, 0.016)); x.lineTo(...P(0.15, 0.016)); x.stroke(); x.setLineDash([]); }
    if (o.paint) o.paint(x, P);
  });
  t.repeat.set(1 / SU, 1 / SV); t.offset.set(0.5, 0);
  return t;
}

// Footprint half-width along the shoe (u = toe +): rounded heel, narrow waist, wide ball, round toe.
function footW(u) {
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let w = 0.04 + 0.011 * ss(-0.07, 0.04, u) - 0.003 * Math.exp(-(((u + 0.025) / 0.03) ** 2));
  if (u < -0.095) { const t = (u + 0.095) / 0.062; w *= Math.sqrt(Math.max(0, 1 - t * t)); }
  if (u > 0.045) { const t = (u - 0.045) / 0.112; w *= Math.sqrt(Math.max(0, 1 - t * t)); }
  return w;
}
function footprint(scale = 1) {
  const R = [];
  for (let i = 0; i <= 30; i++) { const u = -0.157 + (i / 30) * 0.314; R.push([Math.max(0.004, footW(u) * scale), -u]); }
  return [...R, ...R.slice().reverse().map(([x, y]) => [-x, y])];
}
// Upper = side profile extruded across the foot, then tapered to the footprint (cached per profile).
const taperCache = new Map();
// Resample a closed polyline with a centripetal Catmull-Rom curve (smooth heel collars & toes).
function smoothPts(pts, n = 64) { return new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal').getSpacedPoints(n).slice(0, n).map((v) => [v.x, v.y]); }
// Smooth normals across faces sharing a vertex position when they are < ~55 degrees apart.
function smoothNormals(geo, cosT = 0.57) {
  const pos = geo.attributes.position, n = pos.count, fn = new Float32Array(n * 3), map = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const f = c.sub(b).cross(a.sub(b)).normalize();
    for (let k = 0; k < 3; k++) { fn.set([f.x, f.y, f.z], (i + k) * 3); const key = `${Math.round(pos.getX(i + k) * 1e5)},${Math.round(pos.getY(i + k) * 1e5)},${Math.round(pos.getZ(i + k) * 1e5)}`; let l = map.get(key); if (!l) map.set(key, (l = [])); l.push(i + k); }
  }
  const out = new Float32Array(n * 3);
  for (const l of map.values()) for (const i of l) {
    let x = 0, y = 0, z = 0;
    for (const j of l) { const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2]; if (d > cosT) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; } }
    const len = Math.hypot(x, y, z) || 1; out[i * 3] = x / len; out[i * 3 + 1] = y / len; out[i * 3 + 2] = z / len;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}
function upperMesh(profKey, dep, bev, mats) {
  const key = `${profKey}:${dep}:${bev}`;
  let geo = taperCache.get(key);
  if (!geo) {
    const sh = new THREE.Shape(smoothPts(PROF[profKey].pts).map(([x, y]) => new THREE.Vector2(x, y)));
    geo = new THREE.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 4 });
    geo.translate(0, 0, -dep / 2);
    const pos = geo.attributes.position, half = dep / 2 + bev;
    for (let i = 0; i < pos.count; i++) { const k = Math.min(1, Math.max(0.12, (footW(pos.getX(i)) - 0.003) / half)); pos.setZ(i, pos.getZ(i) * k); }
    smoothNormals(geo); geo.userData.shared = true;
    taperCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mats); m.castShadow = m.receiveShadow = true;
  return m;
}
// One shoe built along +Z. Returns a function so pairs share geometry & materials.
function shoeBuilder(o) {
  const pk = o.prof || 'low', prof = PROF[pk];
  const bev = o.bev ?? 0.011;
  const dep = o.width ?? 0.076;
  const pm = { rough: o.rough ?? 0.5, metal: o.metal || 0, clearcoat: o.gloss || 0 };
  const art = mat('#ffffff', { ...pm, map: shoeArt(o.key, o, pk) });
  const wall = o.checker ? mat('#ffffff', { ...pm, map: checkerTex(o.upper, o.checker, 26) }) : mat(o.upper, pm);
  const os = o.outsole ?? 0.01, mh = o.mid ?? 0.022;
  const midM = o.midM || mat(o.sole || '#f4f4f2', { rough: 0.6, emissive: o.glowSole, ei: o.glowSole ? 1.5 : undefined });
  const outM = mat(o.out || o.sole || '#e9e9e6', { rough: 0.85 });
  const lace = mat(o.lace || '#ffffff', { rough: 0.75 });
  const lin = mat(o.lining || '#2a2a2a', { rough: 0.9 });
  const base = os + mh;
  const fpOut = footprint(1.04), fpMid = footprint(1.0);
  return () => {
    const s = new THREE.Group();
    s.add(slab(fpOut, Math.max(0.001, os - 0.004), 0.002, outM));
    if (o.mid2) { s.add(slab(fpMid, mh * 0.5 - 0.004, 0.002, midM, os)); s.add(slab(footprint(0.985), mh * 0.5 - 0.004, 0.002, mat(o.mid2, { rough: 0.6 }), os + mh * 0.5)); }
    else s.add(slab(fpMid, Math.max(0.001, mh - 0.006), 0.003, midM, os));
    const up = upperMesh(pk, dep, bev, [art, wall]); up.rotation.y = -PI / 2; at(up, 0, base - 0.002, 0); s.add(up);
    if (prof.open) { const [ou, ov, orr] = prof.open; const op = cyl(orr, orr, 0.004, lin, 20); op.scale.set(0.8, 1, 1.25); at(op, 0, base + ov + bev - 0.0035, ou); s.add(op); }
    if (prof.lace && !o.noLaces) {
      const [[u0, v0], [u1, v1]] = prof.lace; const n = prof.n || 5;
      const ang = Math.atan2(v1 - v0, u1 - u0);
      const tg = rbox(0.046, 0.036, 0.012, 0.005, o.tongue ? mat(o.tongue, pm) : wall); tg.rotation.x = -0.35; at(tg, 0, base + v0 + bev + 0.006, u0 - 0.006); s.add(tg);
      for (let i = 0; i < n; i++) { const t = (i + 0.4) / n; const u = u0 + (u1 - u0) * t; const l = rbox(Math.min(0.064, footW(u) * 2 * 0.62 + 0.012), 0.005, 0.008, 0.002, lace); l.rotation.x = -ang; at(l, 0, base + v0 + (v1 - v0) * t + bev - 0.002, u); s.add(l); }
    }
    if (o.tab) s.add(at(rbox(0.024, 0.032, 0.008, 0.003, mat(o.tab, { rough: 0.5 })), 0, base + prof.pts[3][1] - 0.008, -0.15));
    if (o.extra) o.extra(s, { base, bev, prof });
    return s;
  };
}
// Pairs are displayed side-on (toes toward +X) like on a sneaker wall: the profile faces the viewer.
function pairOf(one, { gap = 0.058, stagger = 0.05, splay = 0.08 } = {}) {
  const r = one(); r.position.set(-stagger * 0.4, 0, gap); r.rotation.y = PI / 2 - splay * 0.25;
  const l = one(); l.position.set(stagger * 0.6, 0, -gap); l.rotation.y = PI / 2 + splay;
  return group(r, l);
}
const sneakerPair = (o) => pairOf(shoeBuilder(o));

// Stiletto pump (custom geometry: arched sole, side walls, pointed vamp, heel).
function pumpBuilder({ color = '#111', gloss = 0.7, sole = '#1b1b1b', insole = '#d9c3a5', heelH = 0.085, platform = 0, strap = null, metal = 0 }) {
  const up = mat(color, { rough: metal ? 0.22 : 0.3, clearcoat: gloss, metal });
  const sm = mat(sole, { rough: 0.5, clearcoat: 0.4 });
  const im = mat(insole, { rough: 0.8 });
  const H = heelH, P = platform;
  const top = [[-0.13, H + P], [-0.1, H + P - 0.002], [-0.06, H * 0.72 + P], [-0.015, H * 0.3 + P], [0.03, P + 0.004], [0.14, P]];
  const strip = (th) => [...top, ...top.slice().reverse().map(([u, v]) => [u, v - th])];
  const side = [[-0.133, H + P], [-0.135, H + P + 0.045], [-0.118, H + P + 0.05], [-0.07, H * 0.72 + P + 0.03], [-0.02, H * 0.3 + P + 0.04], [0.02, P + 0.042], [0.03, P + 0.004], [-0.015, H * 0.3 + P], [-0.06, H * 0.72 + P], [-0.1, H + P - 0.002]];
  return () => {
    const s = new THREE.Group();
    const so = extrude(strip(0.008), 0.058, sm, 0.002); so.rotation.y = -PI / 2; at(so, 0, 0.008, 0); s.add(so);
    const ins = extrude(strip(0.002), 0.052, im, 0.001); ins.rotation.y = -PI / 2; at(ins, 0, 0.0095, 0); s.add(ins);
    for (const x of [-0.03, 0.03]) { const w = extrude(side, 0.003, up, 0.0015); w.rotation.y = -PI / 2; at(w, x, 0.008, 0); s.add(w); }
    const back = extrude([[-0.135, H + P], [-0.135, H + P + 0.045], [-0.12, H + P + 0.05], [-0.12, H + P]], 0.06, up, 0.002); back.rotation.y = -PI / 2; at(back, 0, 0.008, 0); s.add(back);
    const vamp = lathe([[0.0001, 0], [0.012, 0.012], [0.022, 0.035], [0.028, 0.075], [0.03, 0.115], [0.0001, 0.116]], up, 24);
    vamp.rotation.x = -PI / 2; vamp.scale.set(1, 1, 0.8); at(vamp, 0, P + 0.024, 0.15); s.add(vamp);
    if (P) s.add(at(rbox(0.066, P + 0.004, 0.13, 0.008, sm), 0, (P + 0.004) / 2, 0.075));
    s.add(at(cyl(0.007, 0.0045, H + P - 0.004, sm, 12), 0, (H + P) / 2, -0.115));
    if (strap) { const st = torus(0.036, 0.004, mat(strap, { rough: 0.3, clearcoat: 0.6 }), 6, 20); st.rotation.y = PI / 2; st.scale.set(1, 0.6, 1); at(st, 0, H + P + 0.03, -0.1); s.add(st); }
    return s;
  };
}

function slideBuilder({ bed = '#111', strap = '#111', logo = null, logoColor = '#fff', key }) {
  const bm = mat(bed, { rough: 0.7 }), sm = mat(strap, { rough: 0.55 });
  return () => {
    const s = new THREE.Group();
    s.add(at(rbox(0.104, 0.03, 0.28, 0.012, bm), 0, 0.015, 0));
    s.add(at(rbox(0.088, 0.004, 0.25, 0.002, mat(tint(bed, 0.8), { rough: 0.9 })), 0, 0.031, 0));
    const st = tube([[-0.054, 0.03, 0], [-0.05, 0.058, 0], [0, 0.072, 0], [0.05, 0.058, 0], [0.054, 0.03, 0]], 0.009, sm, 16, 6); st.scale.z = 4.2; at(st, 0, 0, 0.035); s.add(st);
    if (logo) { const d = decal(0.07, 0.03, 'slide:' + key, (x, w, h) => { x.clearRect(0, 0, w, h); txt(x, logo, w / 2, h / 2, h * 0.75, logoColor, 900, w * 0.9); }, { tw: 256 }); d.rotation.x = -PI / 2 + 0.3; at(d, 0, 0.078, 0.042); s.add(d); }
    return s;
  };
}

// =================================================================== hats
function capModel({ color = '#111', brim = null, logo = null, logoColor = '#fff', button = null, key }) {
  const m = mat(color, { rough: 0.85, sheen: 0.4 });
  const g = new THREE.Group();
  const crown = hemi(0.093, m); crown.scale.set(1, 0.78, 1.06); g.add(crown);
  for (let i = 0; i < 3; i++) { const sm = torus(0.093, 0.0012, mat(tint(color, 0.7)), 4, 24, PI); sm.rotation.set(0, (i / 3) * PI, 0); sm.scale.set(1, 0.78, 1.06); g.add(sm); }
  g.add(at(sph(0.009, mat(button || color, { rough: 0.7 }), 10, 8), 0, 0.072, 0));
  const b = cyl(0.088, 0.088, 0.007, mat(brim || color, { rough: 0.85 }), 28); b.scale.set(0.98, 1, 0.82); b.rotation.x = 0.1; at(b, 0, 0.011, 0.07); g.add(b);
  if (logo) { const l = decal(0.07, 0.045, 'cap:' + key, (x, w, h) => { x.clearRect(0, 0, w, h); txt(x, logo, w / 2, h / 2, h * 0.72, logoColor, 900, w * 0.92, logo.length <= 2 ? 'Georgia, serif' : FONT); }, { tw: 160, th: 104 }); l.rotation.x = -0.42; at(l, 0, 0.046, 0.083); g.add(l); }
  g.add(at(rbox(0.05, 0.016, 0.006, 0.003, mat(tint(color, 0.8))), 0, 0.012, -0.098));
  return g;
}
function beanieModel({ color = '#c1121f', cuff = null, pom = null, patch = null, key }) {
  const m = MAT.knit(color);
  const g = new THREE.Group();
  g.add(at(cyl(0.088, 0.09, 0.075, m, 28), 0, 0.0375, 0));
  const dome = hemi(0.088, m); dome.scale.y = 0.95; at(dome, 0, 0.075, 0); g.add(dome);
  g.add(at(cyl(0.094, 0.095, 0.05, MAT.knit(cuff || tint(color, 0.92)), 28), 0, 0.027, 0));
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; const r = rbox(0.004, 0.046, 0.003, 0.0015, MAT.knit(tint(cuff || color, 0.8))); r.rotation.y = -a; g.add(at(r, Math.sin(a) * 0.095, 0.027, Math.cos(a) * 0.095)); }
  if (pom) g.add(at(sph(0.034, mat(pom, { rough: 1, sheen: 1, map: furTex() }), 14, 12), 0, 0.178, 0));
  if (patch) g.add(at(decal(0.04, 0.025, 'beanie:' + key, patch, { tw: 128 }), 0, 0.03, 0.0955));
  return g;
}
function bucketModel({ color = '#e9e2cf', band = null, fabric = 'cotton', key, logo = null, logoColor = '#111' }) {
  const m = fab(fabric, color);
  const g = new THREE.Group();
  g.add(lathe([[0.155, 0.0], [0.157, 0.004], [0.12, 0.024], [0.088, 0.036], [0.084, 0.098], [0.0001, 0.1], [0.0001, 0.092], [0.08, 0.09], [0.083, 0.032], [0.115, 0.018], [0.152, 0.0]], m, 36));
  for (let i = 0; i < 3; i++) g.add(at(torus(0.135 - i * 0.012, 0.0009, thread(tint(color, 0.7)), 4, 36), 0, 0.009 + i * 0.006, 0)).children.at(-1).rotation.x = PI / 2;
  if (band) g.add(at(cyl(0.0895, 0.0905, 0.016, fab(fabric, band), 32), 0, 0.046, 0));
  if (logo) { const l = decal(0.06, 0.03, 'bucket:' + key, (x, w, h) => { x.clearRect(0, 0, w, h); txt(x, logo, w / 2, h / 2, h * 0.7, logoColor, 900, w * 0.9); }, { tw: 160 }); at(l, 0, 0.07, 0.0865); g.add(l); }
  return g;
}
function beretModel({ color = '#1b1b1b' }) {
  const m = mat(color, { rough: 1, sheen: 0.6 });
  const g = new THREE.Group();
  const top = sph(0.13, m, 32, 16); top.scale.set(1, 0.24, 1); top.rotation.z = 0.06; at(top, 0.008, 0.032, 0); g.add(top);
  g.add(at(rot(torus(0.085, 0.009, m, 8, 32), PI / 2, 0, 0), 0, 0.01, 0));
  g.add(at(cyl(0.003, 0.004, 0.018, m, 8), 0.012, 0.068, 0));
  return g;
}
function crownModel() {
  const gold = mat('#e8b94a', { rough: 0.18, metal: 1 });
  const g = new THREE.Group();
  g.add(lathe([[0.084, 0], [0.09, 0], [0.09, 0.06], [0.084, 0.06], [0.084, 0]], gold, 40));
  const vel = hemi(0.082, mat('#9d0208', { rough: 0.9, sheen: 1 })); vel.scale.y = 0.95; at(vel, 0, 0.04, 0); g.add(vel);
  g.add(at(sph(0.012, gold, 12, 10), 0, 0.124, 0));
  g.add(at(rot(torus(0.088, 0.004, gold, 6, 40), PI / 2, 0, 0), 0, 0.003, 0), at(rot(torus(0.088, 0.004, gold, 6, 40), PI / 2, 0, 0), 0, 0.058, 0));
  const gems = ['#e63946', '#3a86ff', '#2a9d8f', '#e63946', '#3a86ff', '#2a9d8f', '#e63946', '#3a86ff'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8;
    const sp = cone(0.022, 0.048, gold, 4); sp.rotation.y = -a; sp.scale.set(0.5, 1, 1); at(sp, Math.cos(a) * 0.087, 0.084, Math.sin(a) * 0.087); g.add(sp);
    g.add(at(sph(0.0065, mat('#f6f1e7', { rough: 0.2, clearcoat: 1 }), 10, 8), Math.cos(a) * 0.087, 0.11, Math.sin(a) * 0.087));
    const gm = sph(0.0085, mat(gems[i], { rough: 0.08, clearcoat: 1, metal: 0.2 }), 8, 6); gm.scale.set(1, 1.2, 0.6); gm.rotation.y = -a + PI / 2; at(gm, Math.cos(a - PI / 8) * 0.092, 0.03, Math.sin(a - PI / 8) * 0.092); g.add(gm);
  }
  return g;
}

// =================================================================== eyewear
function lensOutline(kind) {
  const pts = [], N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * PI * 2, c = Math.cos(a), s = Math.sin(a);
    let x, y;
    if (kind === 'round') { x = c * 0.023; y = s * 0.023; }
    else if (kind === 'wayfarer') { x = Math.sign(c) * Math.abs(c) ** 0.55 * 0.026 * (s > 0 ? 1.02 : 0.9); y = Math.sign(s) * Math.abs(s) ** 0.7 * 0.019 + (s > 0 ? 0.002 : 0); }
    else if (kind === 'aviator') { x = c * 0.027; y = s > 0 ? s * 0.018 : s * 0.029 * (1 - 0.35 * c); }
    else if (kind === 'cat') { x = c * 0.027; y = s * 0.017 + (s > 0 ? Math.max(0, c) ** 3 * 0.012 : 0); }
    else if (kind === 'oval') { x = c * 0.022; y = s * 0.011; }
    else { x = c * 0.025; y = s * 0.02; }
    pts.push([x, y]);
  }
  return pts;
}
function offsetPts(pts, t) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] + (dy / l) * t, p[1] - (dx / l) * t];
  });
}
function glassesModel({ kind = 'wayfarer', frame = '#111', lens = '#2b2b2b', wire = false, sun = true, mirror = false, tort = false, key }) {
  const t = wire ? 0.0018 : kind === 'oval' ? 0.0035 : 0.0045;
  const fm = tort ? mat('#ffffff', { rough: 0.3, clearcoat: 0.8, map: patt('tort', (x, w, h) => { x.fillStyle = '#6b3d1f'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { x.fillStyle = i % 3 ? 'rgba(30,14,6,0.55)' : 'rgba(214,150,70,0.5)'; x.beginPath(); x.ellipse((i * 41) % w, (i * 67) % h, 6 + (i % 5) * 2, 3 + (i % 3), i, 0, 7); x.fill(); } }, [40, 40]) })
    : wire ? mat(frame, { rough: 0.2, metal: 1 }) : mat(frame, { rough: 0.25, clearcoat: 0.8 });
  const lm = mirror ? mat(lens, { rough: 0.05, metal: 1, envInt: 1.6 }) : mat(lens, { rough: 0.05, opacity: sun ? 0.82 : 0.16, transparent: true, metal: sun ? 0.2 : 0, depthWrite: !sun ? false : undefined });
  const lp = lensOutline(kind);
  const hh = Math.max(...lp.map((p) => p[1])) , lo = Math.min(...lp.map((p) => p[1])), hwid = Math.max(...lp.map((p) => p[0]));
  const cy = -lo + t + 0.001, cx = hwid + (wire ? 0.009 : 0.007);
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    const p = s > 0 ? lp : lp.map(([x, y]) => [-x, y]).reverse();
    const sh = new THREE.Shape(offsetPts(p, t).map(([x, y]) => new THREE.Vector2(x, y)));
    sh.holes.push(new THREE.Path(p.map(([x, y]) => new THREE.Vector2(x, y))));
    const rim = shapeExtrude(sh, wire ? 0.0016 : 0.005, fm, `glasses:${kind}:${s}:${t}:${wire}`, wire ? 0.0006 : 0.0012);
    at(rim, s * cx, cy, 0); g.add(rim);
    const ln = extrude(p, 0.0012, lm, 0); at(ln, s * cx, cy, 0); g.add(ln);
    const ex = s * (cx + hwid + t);
    const tm = box(wire ? 0.0025 : 0.005, wire ? 0.0025 : 0.007, 0.13, fm); tm.rotation.x = -0.04; at(tm, ex, cy + hh * 0.55, -0.066); g.add(tm);
    const tip = box(wire ? 0.0025 : 0.005, wire ? 0.0025 : 0.006, 0.04, wire ? mat('#2b2b2b', { rough: 0.5 }) : fm); tip.rotation.x = -0.75; at(tip, ex, cy + hh * 0.55 - 0.016, -0.143); g.add(tip);
    if (wire) g.add(at(sph(0.0035, mat('#f2f2f2', { rough: 0.2, opacity: 0.6, transparent: true }), 8, 6), s * 0.008, cy - 0.006, -0.006));
  }
  if (wire) { const br = tube([[-cx + hwid * 0.75, cy + hh * 0.9, 0], [0, cy + hh * 1.05, 0.002], [cx - hwid * 0.75, cy + hh * 0.9, 0]], 0.0013, fm, 12, 5); g.add(br); if (kind === 'aviator') g.add(tube([[-cx + hwid, cy + hh * 0.35, 0], [0, cy + hh * 0.42, 0.002], [cx - hwid, cy + hh * 0.35, 0]], 0.0013, fm, 12, 5)); }
  else g.add(at(box(2 * (cx - hwid) + 0.004, 0.006, 0.005, fm), 0, cy + hh * 0.45, 0));
  void key;
  return g;
}
function shieldModel({ frame = '#111', lens = '#9ad1ff' }) {
  const fm = mat(frame, { rough: 0.3, clearcoat: 0.6 });
  const lm = mat(lens, { rough: 0.12, metal: 0.55, clearcoat: 1, envInt: 1.1 });
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, x = -0.07 + t * 0.14; pts.push([x, 0.028 + Math.cos(t * PI * 2) * 0.002]); }
  for (let i = 16; i >= 0; i--) { const t = i / 16, x = -0.07 + t * 0.14; const nose = Math.exp(-((x / 0.012) ** 2)) * 0.016; pts.push([x, -0.012 - Math.sin(t * PI) * 0.012 + nose + Math.abs(x) * 0.12]); }
  const g = new THREE.Group();
  const ln = extrude(pts, 0.002, lm, 0.001); at(ln, 0, 0.028, 0.004); ln.rotation.y = 0; g.add(ln);
  g.add(at(rbox(0.148, 0.007, 0.01, 0.003, fm), 0, 0.058, 0.002));
  for (const s of [1, -1]) { const tm = box(0.005, 0.008, 0.13, fm); tm.rotation.x = -0.05; at(tm, s * 0.073, 0.052, -0.064); g.add(tm); const tip = box(0.005, 0.007, 0.04, fm); tip.rotation.x = -0.8; at(tip, s * 0.073, 0.036, -0.14); g.add(tip); }
  return g;
}

// =================================================================== watches & jewelry
function dialDraw({ face = '#f2ead8', ink2 = '#1b1b1b', accent = null, numbers = false, brand = '', lume = false, date = false }) {
  return (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const c = w / 2, r = w * 0.48;
    const g = x.createRadialGradient(c * 0.8, c * 0.7, 4, c, c, r); g.addColorStop(0, face); g.addColorStop(1, tint(face, 0.82)); x.fillStyle = g; x.beginPath(); x.arc(c, c, r, 0, 7); x.fill();
    if (accent) { x.strokeStyle = accent; x.lineWidth = r * 0.16; x.beginPath(); x.arc(c, c, r * 0.9, 0, 7); x.stroke(); }
    x.fillStyle = ink2; x.strokeStyle = ink2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 - PI / 2, r0 = r * (accent ? 0.66 : 0.78), r1 = r * (accent ? 0.78 : 0.9);
      if (numbers && i % 3 === 0) { txt(x, String(i === 0 ? 12 : i), c + Math.cos(a) * r * 0.7, c + Math.sin(a) * r * 0.7, r * 0.26, ink2, 800); continue; }
      x.lineWidth = i % 3 === 0 ? 7 : 3.5; x.beginPath(); x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); x.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); x.stroke();
      if (lume) { x.fillStyle = '#e8ffd6'; x.beginPath(); x.arc(c + Math.cos(a) * r0 * 0.92, c + Math.sin(a) * r0 * 0.92, 4, 0, 7); x.fill(); x.fillStyle = ink2; }
    }
    if (brand) txt(x, brand, c, c - r * 0.36, r * 0.13, ink2, 700, r);
    if (date) { x.fillStyle = '#ffffff'; x.fillRect(c + r * 0.42, c - 9, 22, 18); txt(x, '26', c + r * 0.42 + 11, c, 13, '#111', 800); }
    x.lineCap = 'round';
    const hand = (a, len, wd) => { x.lineWidth = wd; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len); x.stroke(); };
    hand(-PI / 2 - (2 / 12) * PI * 2, r * 0.48, 9); hand(-PI / 2 + (10 / 60) * PI * 2, r * 0.72, 6);
    x.strokeStyle = '#c1121f'; hand(PI * 0.3, r * 0.8, 2.2);
    x.fillStyle = ink2; x.beginPath(); x.arc(c, c, 7, 0, 7); x.fill();
  };
}
function watchModel({ kind = 'round', caseM, strapM, strapColor = null, dial, bezel = null, key, R = 0.029, sw = 0.019, screen = null }) {
  const g = new THREE.Group();
  const sm = strapM || mat(strapColor || '#5a3a22', { rough: 0.5, clearcoat: 0.2 });
  const ring = lathe([[R, -sw / 2], [R + 0.0032, -sw / 2], [R + 0.0032, sw / 2], [R, sw / 2], [R, -sw / 2]], sm, 44); ring.rotation.z = PI / 2; at(ring, 0, R + 0.0032, 0); g.add(ring);
  const cyY = R + 0.0032, zf = R + 0.0032;
  if (kind === 'round') {
    const cr = 0.02, cd = 0.011;
    const c = cyl(cr, cr * 0.95, cd, caseM, 36); c.rotation.x = PI / 2; at(c, 0, cyY, zf + cd / 2); g.add(c);
    const d = decal(cr * 1.86, cr * 1.86, 'dial:' + key, dial, { tw: 256 }); at(d, 0, cyY, zf + cd + 0.0006); g.add(d);
    const bz = torus(cr * 0.97, 0.0022, bezel || caseM, 8, 40); at(bz, 0, cyY, zf + cd + 0.0004); g.add(bz);
    const gl = cyl(cr * 0.93, cr * 0.93, 0.0016, mat('#ffffff', { rough: 0.02, opacity: 0.12, transparent: true, envInt: 2 }), 32); gl.rotation.x = PI / 2; at(gl, 0, cyY, zf + cd + 0.0012); g.add(gl);
    const cw = cyl(0.0032, 0.0032, 0.005, caseM, 12); cw.rotation.z = PI / 2; at(cw, cr + 0.002, cyY, zf + cd / 2); g.add(cw);
    for (const sy of [1, -1]) for (const sx of [1, -1]) g.add(at(box(0.0035, 0.01, 0.006, caseM), sx * 0.0075, cyY + sy * (cr + 0.002), zf + 0.003));
  } else {
    const W = kind === 'digital' ? 0.034 : 0.036, H = kind === 'digital' ? 0.036 : 0.044, D = kind === 'digital' ? 0.01 : 0.012;
    g.add(at(rbox(W, H, D, kind === 'digital' ? 0.003 : 0.009, caseM), 0, cyY, zf + D / 2));
    const sc = decal(W * (kind === 'digital' ? 0.72 : 0.84), H * (kind === 'digital' ? 0.5 : 0.84), 'screen:' + key, screen, { tw: 192, emissive: kind !== 'digital', ei: 0.9 }); at(sc, 0, cyY + (kind === 'digital' ? 0.002 : 0), zf + D + 0.0006); g.add(sc);
    const btn = cyl(0.0028, 0.0028, 0.005, caseM, 10); btn.rotation.z = PI / 2; at(btn, W / 2 + 0.002, cyY + 0.006, zf + D / 2); g.add(btn);
    if (kind === 'digital') { const b2 = btn.clone(); b2.position.y -= 0.012; g.add(b2); const b3 = btn.clone(); b3.position.x = -b3.position.x; g.add(b3); }
  }
  return g;
}
function linkTex(base, line) { return labelTexture(`fash:links:${base}:${line}`, 256, 32, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); x.fillStyle = line; for (let i = 0; i < 32; i++) x.fillRect(i * 8, 0, 1.5, h); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, h * 0.42, w, h * 0.16); }, { wrap: true, repeat: [3, 1] }); }

function jewelryBox(inner, { box: bc = '#1b1b1b', lining = '#f2ece0' } = {}) {
  const bm = mat(bc, { rough: 0.85, sheen: 0.6 }), lm = mat(lining, { rough: 0.6, sheen: 0.8 });
  const g = new THREE.Group();
  g.add(at(rbox(0.13, 0.034, 0.13, 0.006, bm), 0, 0.017, 0));
  g.add(at(rbox(0.118, 0.008, 0.118, 0.004, lm), 0, 0.031, 0));
  const hinge = new THREE.Group(); at(hinge, 0, 0.034, -0.065); hinge.rotation.x = -1.85;
  hinge.add(at(rbox(0.13, 0.016, 0.13, 0.006, bm), 0, 0.008, 0.065));
  hinge.add(at(rbox(0.116, 0.004, 0.116, 0.002, lm), 0, -0.0005, 0.065));
  g.add(hinge);
  inner.position.y = 0.036; g.add(inner);
  return g;
}
function chainLoop({ metal, links = 26, a = 0.044, b = 0.038, r = 0.0055, tubeR = 0.0016, flat = true }) {
  const g = new THREE.Group();
  for (let i = 0; i < links; i++) {
    const t = (i / links) * PI * 2;
    const tx = -a * Math.sin(t), tz = b * Math.cos(t);
    const l = torus(r, tubeR, metal, 6, 12); l.scale.set(1.45, 1, 1);
    l.rotation.set(flat ? (i % 2 ? PI / 2 : PI / 2 - 0.6) : i % 2 ? PI / 2 : 0, -Math.atan2(tz, tx), 0, 'YXZ');
    at(l, Math.cos(t) * a, tubeR + 0.001, Math.sin(t) * b); g.add(l);
  }
  return g;
}

// =================================================================== bags, audio, scarves
function backpackModel({ color = '#1b1b1b', trim = '#2b2b2b', kind = 'tech' }) {
  const m = kind === 'canvas' ? MAT.fabric(color) : mat(color, { rough: 0.55, clearcoat: 0.2 });
  const tm = kind === 'canvas' ? MAT.leather(trim) : mat(trim, { rough: 0.6 });
  const g = new THREE.Group();
  g.add(at(rbox(0.3, 0.43, 0.14, 0.05, m), 0, 0.215, 0));
  g.add(at(rbox(0.23, 0.16, 0.05, 0.022, m), 0, 0.12, 0.072));
  g.add(at(rot(torus(0.035, 0.007, tm, 6, 14, PI), 0, 0, 0), 0, 0.425, -0.01));
  for (const s of [1, -1]) { g.add(at(rbox(0.05, 0.34, 0.026, 0.012, tm), s * 0.07, 0.22, -0.078)); }
  if (kind === 'canvas') {
    g.add(at(rbox(0.29, 0.15, 0.03, 0.02, m), 0, 0.37, 0.06));
    for (const s of [1, -1]) { g.add(at(box(0.026, 0.17, 0.006, tm), s * 0.07, 0.29, 0.088)); g.add(at(torus(0.012, 0.0025, MAT.gold(), 6, 4), s * 0.07, 0.25, 0.092)); }
  } else {
    g.add(at(box(0.25, 0.006, 0.006, MAT.chrome()), 0, 0.2, 0.098));
    g.add(at(box(0.2, 0.012, 0.004, mat('#e8e8e8', { emissive: '#9a9a9a', ei: 0.2, rough: 0.3 })), 0, 0.33, 0.071));
    g.add(at(rbox(0.012, 0.03, 0.006, 0.003, mat('#d6ff3a', { rough: 0.5 })), 0.11, 0.19, 0.1));
  }
  return g;
}
function headphonesModel({ color = '#e9e4dc', accent = '#c9a86a', pad = null }) {
  const m = mat(color, { rough: 0.45, clearcoat: 0.3 });
  const am = mat(accent, { rough: 0.3, metal: 0.8 });
  const pm = mat(pad || tint(color, 0.85), { rough: 0.9, sheen: 0.5 });
  const g = new THREE.Group();
  g.add(at(torus(0.088, 0.007, am, 8, 32, PI), 0, 0.1, 0));
  const cush = torus(0.083, 0.012, pm, 8, 24, PI * 0.6); cush.rotation.z = PI * 0.2; at(cush, 0, 0.1, 0); g.add(cush);
  for (const s of [1, -1]) {
    g.add(at(box(0.006, 0.03, 0.014, am), s * 0.09, 0.09, 0));
    const cup = cyl(0.042, 0.04, 0.032, m, 28); cup.rotation.z = PI / 2; cup.scale.set(1, 1, 0.82); at(cup, s * 0.094, 0.044, 0); g.add(cup);
    const ear = torus(0.03, 0.011, pm, 8, 20); ear.rotation.y = PI / 2; ear.scale.set(1, 0.82, 1); at(ear, s * 0.075, 0.044, 0); g.add(ear);
    const cap = cyl(0.026, 0.026, 0.003, am, 24); cap.rotation.z = PI / 2; cap.scale.set(1, 1, 0.82); at(cap, s * 0.111, 0.044, 0); g.add(cap);
  }
  return g;
}
function scarfModel({ color = '#c1121f', fabric = 'knit', pattern = null, fringe = null }) {
  const m = patMat(pattern, fab(fabric, color));
  const g = new THREE.Group();
  g.add(at(rbox(0.17, 0.026, 0.3, 0.012, m), 0, 0.013, 0));
  const l2 = rbox(0.165, 0.024, 0.28, 0.011, m); l2.rotation.y = 0.04; g.add(at(l2, 0.004, 0.038, -0.006));
  const l3 = rbox(0.16, 0.022, 0.23, 0.01, m); l3.rotation.y = -0.05; g.add(at(l3, -0.003, 0.061, -0.03));
  const fm = fab(fabric === 'knit' ? 'knit' : 'cotton', fringe || color);
  for (let i = 0; i < 9; i++) { const f = cyl(0.0035, 0.0035, 0.05, fm, 6); f.rotation.x = PI / 2 - 0.15; at(f, -0.068 + i * 0.017, 0.006, 0.172); g.add(f); }
  return g;
}

// =================================================================== item helpers
const W = (slot, style, color, o = {}) => ({ type: 'wear', slot, style, color, ...o });
const CL = (o) => ({ category: 'clothing', stores: ['threadline'], ...o });
const SH = (o) => ({ category: 'shoes', stores: ['threadline'], tags: ['resell'], ...o });
const AC = (o) => ({ category: 'accessories', stores: ['threadline'], ...o });

// =================================================================== TOPS
const plainTees = [
  ['tee_black', 'Essential Black Tee', '#1f1f22', ['basic', 'dark']],
  ['tee_sage', 'Sage Garment-Dyed Tee', '#8aa47f', ['basic', 'cottage']],
  ['tee_rose', 'Dusty Rose Tee', '#cf8a93', ['basic', 'cozy']],
  ['tee_sky', 'Sky Blue Pocket Tee', '#7fb0e0', ['basic', 'preppy'], 'chest'],
];
const graphicTees = [
  ['tee_sunset_club', 'Sunset Club Graphic Tee', '#f3ead7', ['retro', 'street'], 'sunset', 'A faded sunset and a club you\'re definitely a member of now.'],
  ['tee_nice_day', '"Have a Nice Day" Tee', '#ffffff', ['y2k', 'retro'], 'smiley', 'The smiley says what you\'re too tired to.'],
  ['tee_static_ghosts', 'Static Ghosts Band Tee', '#1b1b1d', ['dark', 'street'], 'ghosts', 'You\'ve never heard them. Wear it anyway.'],
  ['tee_heat_check', 'Heat Check Flame Tee', '#111214', ['street', 'party'], 'flame', 'Hand-drawn flames. Instant main character.'],
  ['tee_cat_nap', 'Cat Nap Club Tee', '#f6efe4', ['cozy', 'cottage'], 'catnap', 'Official uniform of professional nappers.'],
];
defineItems([
  ...plainTees.map(([id, name, color, vibe, pocket]) => CL({
    id, name, price: pocket ? 24 : 20, stores: ['threadline', 'primo'], desc: pocket ? 'Heavyweight cotton with a chest pocket for nothing in particular.' : 'Heavyweight cotton, boxy fit. Goes with literally everything.',
    build: () => flatTop({ color, pocket }), use: W('top', 'tee', color, { vibe, points: 4 }),
  })),
  ...graphicTees.map(([id, name, color, vibe, print, desc]) => CL({
    id, name, price: 32, desc, rarity: 'uncommon',
    build: () => flatTop({ color, print: { key: print, draw: PRINTS[print], w: 0.24, y: 0.25 } }), use: W('top', 'tee', color, { vibe, points: 5 }),
  })),
  CL({ id: 'tee_ringer_retro', name: 'Retro Ringer Tee', price: 28, desc: 'Contrast collar and cuffs, straight out of a 1978 yearbook.', build: () => flatTop({ color: '#f4ecd8', color2: '#c0392b', neck: 'crew' }), use: W('top', 'tee', '#f4ecd8', { color2: '#c0392b', vibe: ['retro', 'sporty'], points: 5 }) }),
  CL({ id: 'tee_breton_stripe', name: 'Breton Stripe Tee', price: 36, desc: 'Navy-and-cream stripes. Pairs with a baguette and an opinion.', build: () => flatTop({ color: '#f1ece0', pattern: { kind: 'stripe', c: ['#f1ece0', '#24345c'], k: 0.4 }, trim: '#f1ece0', sleeve: 'long', sleeveLen: 0.46, cuffs: false }), use: W('top', 'longsleeve', '#24345c', { vibe: ['preppy', 'cottage'], points: 6 }) }),
  CL({ id: 'tee_baby_angel', name: 'Y2K "Angel" Baby Tee', price: 26, desc: 'Cropped, tiny and very sparkly. Peak 2003 energy.', build: () => flatTop({ color: '#ffd6e8', color2: '#ff8fc2', hw: 0.16, len: 0.44, neckW: 0.06, print: { key: 'angel', draw: PRINTS.angel, w: 0.2, y: 0.17 } }), use: W('top', 'tee', '#ffd6e8', { color2: '#ff8fc2', vibe: ['y2k', 'party'], points: 6 }) }),
  CL({ id: 'tank_ribbed_white', name: 'Ribbed Tank Top', price: 16, stores: ['threadline', 'primo'], desc: 'Stretchy rib knit. Gym, layering, or a heatwave.', build: () => flatTop({ color: '#f4f4f1', sleeve: 'none', fabric: 'knit', neck: 'scoop', neckW: 0.085, neckD: 0.1, hw: 0.17, len: 0.6 }), use: W('top', 'tank', '#f4f4f1', { fabric: 'knit', vibe: ['sporty', 'basic'], points: 3 }) }),
  CL({ id: 'polo_pique_navy', name: 'Piqué Polo Shirt', price: 48, desc: 'Three buttons, crisp collar, country-club approved.', build: () => flatTop({ color: '#1f2f56', neck: 'polo', placket: 'polo', buttons: '#f2efe6', neckW: 0.06, neckD: 0.04 }), use: W('top', 'tee', '#1f2f56', { color2: '#f2efe6', vibe: ['preppy', 'sporty'], points: 6 }) }),
  // hoodies
  ...[
    ['hoodie_midnight', 'Midnight Heavyweight Hoodie', '#1d1e22', ['street', 'dark'], 65, 'Dense 500gsm fleece in near-black. Hood up, world off.'],
    ['hoodie_lilac', 'Lilac Cloud Hoodie', '#b49ce0', ['cozy', 'y2k'], 58, 'Brushed-back fleece in the softest lilac. Matches the Cloud sweats.'],
    ['hoodie_oat', 'Oat Milk Hoodie', '#e7dcc8', ['cozy', 'basic'], 58, 'A warm oat neutral. Like a latte you can wear.'],
  ].map(([id, name, color, vibe, price, desc]) => CL({ id, name, price, desc, build: () => flatTop({ color, sleeve: 'long', neck: 'hood', fabric: 'fleece', pocket: 'kangaroo', strings: '#f2f0ea', rib: true, d: 0.012, bev: 0.006 }), use: W('top', 'hoodie', color, { vibe, points: 6, comfy: true }) })),
  CL({ id: 'hoodie_logo_threadline', name: 'Threadline Logo Hoodie', price: 72, rarity: 'uncommon', desc: 'The house logo, puff-printed across the chest. Merch, but make it fashion.', build: () => flatTop({ color: '#2c3e66', sleeve: 'long', neck: 'hood', fabric: 'fleece', pocket: 'kangaroo', strings: '#ffffff', rib: true, d: 0.012, bev: 0.006, print: { key: 'tllogo', draw: PRINTS.logo, w: 0.26, y: 0.24 } }), use: W('top', 'hoodie', '#2c3e66', { vibe: ['street', 'sporty'], points: 7, comfy: true }) }),
  CL({ id: 'hoodie_tech_fleece', name: 'Tech Fleece Zip Hoodie', price: 130, rarity: 'uncommon', desc: 'Bonded fleece, taped seams, full zip. Looks fast standing still.', build: () => flatTop({ color: '#3a3d42', sleeve: 'long', neck: 'hood', fabric: 'nylon', placket: 'zip', zipM: mat('#111', { rough: 0.4 }), pocket: 'slits', rib: true, d: 0.01, extra: (g, k) => g.add(at(decal(0.06, 0.06, 'patch:tech', PRINTS.techlogo, { tw: 128 }), -0.11, k.top + 0.002, -(k.T - 0.18))).children.at(-1).rotation.set(-PI / 2, 0, 0) }), use: W('top', 'hoodie', '#3a3d42', { vibe: ['techwear', 'sporty'], points: 7, comfy: true }) }),
  // knitwear
  CL({ id: 'sweater_cable_cream', name: 'Cable-Knit Fisherman Sweater', price: 98, rarity: 'uncommon', desc: 'Chunky cables in undyed cream wool. Smells faintly of sea air (it doesn\'t).', build: () => flatTop({ color: '#efe6d2', sleeve: 'long', fabric: 'knit', rib: true, d: 0.014, bev: 0.006, extra: (g, k) => { for (const x of [-0.11, -0.04, 0.04, 0.11]) g.add(seg([x, k.T - 0.07], [x, k.B + 0.05], 0.026, 0.005, MAT.knit('#e4d9c2'), k.top - 0.001)); } }), use: W('top', 'sweater', '#efe6d2', { fabric: 'knit', vibe: ['preppy', 'cottage', 'cozy'], points: 7, comfy: true }) }),
  CL({ id: 'sweater_fair_isle', name: 'Fair Isle Holiday Sweater', price: 64, season: 'winter', desc: 'Snowflakes, zig-zags, festive cheer. Seasonal — gone by spring.', build: () => flatTop({ color: '#b51f2c', sleeve: 'long', fabric: 'knit', rib: true, trim: '#1f6f50', d: 0.013, print: { key: 'fairisle', draw: PRINTS.fairisle, w: 0.4, h: 0.4, y: 0.24 } }), use: W('top', 'sweater', '#b51f2c', { color2: '#1f6f50', fabric: 'knit', vibe: ['cozy', 'party'], points: 7, comfy: true }) }),
  CL({ id: 'turtleneck_black', name: 'Black Ribbed Turtleneck', price: 58, desc: 'Fine-rib merino. Instantly 30% more mysterious.', build: () => flatTop({ color: '#18181b', sleeve: 'long', fabric: 'knit', neck: 'turtle', rib: true, hw: 0.18 }), use: W('top', 'sweater', '#18181b', { fabric: 'knit', vibe: ['dark', 'luxe', 'formal'], points: 7 }) }),
  CL({ id: 'sweater_cashmere_camel', name: 'Maison Cashmere Crewneck', price: 420, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Grade-A Mongolian cashmere in camel. Quiet luxury, very loud price.', build: () => flatTop({ color: '#c19a6b', sleeve: 'long', fabric: 'knit', rib: true, d: 0.011 }), use: W('top', 'sweater', '#c19a6b', { fabric: 'knit', vibe: ['luxe', 'cozy'], points: 9, comfy: true }) }),
  CL({ id: 'cardigan_grandpa', name: 'Grandpa Cardigan', price: 74, desc: 'Shawl collar, leather buttons, deep pockets for butterscotch candies.', build: () => flatTop({ color: '#8a6f4e', sleeve: 'long', fabric: 'knit', neck: 'cardigan', neckD: 0.26, placket: 'buttons', buttons: '#4a2f1d', rib: true, pocket: 'side', d: 0.013 }), use: W('top', 'sweater', '#8a6f4e', { fabric: 'knit', vibe: ['cottage', 'cozy', 'dark'], points: 7, comfy: true }) }),
  // shirts
  CL({ id: 'flannel_buffalo', name: 'Buffalo Check Flannel', price: 54, desc: 'Brushed red-and-black check. Chop wood or just look like you could.', build: () => flatTop({ color: '#a4161a', pattern: { kind: 'plaid', c: ['#b3161c', '#151515', '#151515'] }, sleeve: 'long', neck: 'collar', placket: 'buttons', buttons: '#1b1b1b', pocket: 'chest' }), use: W('top', 'shirt', '#a4161a', { color2: '#1b1b1b', vibe: ['cozy', 'street', 'retro'], points: 6, comfy: true }) }),
  CL({ id: 'shirt_oxford_blue', name: 'Blue Oxford Shirt', price: 59, desc: 'Button-down collar, crisp oxford weave. Interview-ready, nap-compatible.', build: () => flatTop({ color: '#a9c4e4', sleeve: 'long', neck: 'collar', placket: 'buttons', pocket: 'chest', trim: '#9fbbdc' }), use: W('top', 'shirt', '#a9c4e4', { color2: '#ffffff', vibe: ['preppy', 'formal'], points: 6 }) }),
  CL({ id: 'shirt_linen_camp', name: 'Linen Camp Shirt', price: 62, season: 'summer', desc: 'Breezy linen with a lazy camp collar. Summer only, like a good tan.', build: () => flatTop({ color: '#e9dcc0', sleeve: 'short', neck: 'collar', placket: 'buttons', buttons: '#7a5c3c', neckW: 0.075, neckD: 0.12 }), use: W('top', 'shirt', '#e9dcc0', { vibe: ['boho', 'retro', 'cottage'], points: 6 }) }),
  CL({ id: 'shirt_silk_noir', name: 'Maison Silk Charmeuse Shirt', price: 380, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Liquid black silk that catches every light. Wear it to absolutely nothing important.', build: () => flatTop({ color: '#141416', fabric: 'satin', sleeve: 'long', neck: 'collar', placket: 'buttons', buttons: 'gold' }), use: W('top', 'shirt', '#141416', { color2: '#c9a86a', vibe: ['luxe', 'party', 'dark'], points: 9 }) }),
  // jackets & coats
  CL({ id: 'jacket_denim_trucker', name: 'Classic Denim Trucker Jacket', price: 98, desc: 'Mid-wash 13oz denim with copper shanks. Gets better every year.', build: () => flatTop({ color: '#5b7fae', fabric: 'denim', sleeve: 'long', neck: 'collar', placket: 'snaps', buttons: 'copper', pocket: 'flaps', rib: true, trim: '#56789f', d: 0.012 }), use: W('top', 'jacket', '#5b7fae', { color2: '#f4f1ea', vibe: ['street', 'retro', 'basic'], points: 7 }) }),
  CL({ id: 'jacket_bomber_olive', name: 'Olive MA-1 Bomber', price: 120, desc: 'Flight-jacket nylon, orange lining, sleeve zip pocket. Cleared for takeoff.', build: () => flatTop({ color: '#5b6346', fabric: 'nylon', sleeve: 'long', neck: 'mock', placket: 'zip', rib: true, trim: '#2f3324', pocket: 'slits', d: 0.016, bev: 0.008, extra: (g, k) => g.add(at(rbox(0.05, 0.004, 0.035, 0.003, MAT.chrome()), -0.33, k.top + 0.001, -(k.T - 0.24)).rotateY(0.35)) }), use: W('top', 'jacket', '#5b6346', { color2: '#f77f00', vibe: ['street', 'techwear'], points: 7 }) }),
  CL({ id: 'jacket_varsity', name: 'Varsity Letterman Jacket', price: 165, rarity: 'uncommon', desc: 'Wool body, leather sleeves, chenille "H". You were never on a team. Doesn\'t matter.', build: () => flatTop({ color: '#1d2b53', sleeveColor: '#f1e9d2', sleeveFabric: 'leather', sleeve: 'long', neck: 'mock', placket: 'snaps', buttons: '#f1e9d2', rib: true, trim: '#1d2b53', d: 0.014, patch: { key: 'varsityH', draw: PRINTS.varsity, w: 0.11, x: -0.11, y: 0.2 }, extra: (g, k) => { for (const y of [0.016, 0.032]) g.add(seg([-k.hw + 0.006, k.B + y], [k.hw - 0.006, k.B + y], 0.006, 0.003, fab('knit', '#c1121f'), k.top + 0.001)); } }), use: W('top', 'jacket', '#1d2b53', { color2: '#f1e9d2', vibe: ['retro', 'preppy', 'sporty'], points: 8 }) }),
  CL({ id: 'puffer_glacier_black', name: 'Glacier Puffer Jacket', price: 220, rarity: 'uncommon', desc: '700-fill down in glossy black. Rated for blizzards and walking to the mailbox.', build: () => flatTop({ color: '#202124', fabric: 'puffer', sleeve: 'long', neck: 'mock', placket: 'zip', zipM: mat('#0d0d0d', { rough: 0.3 }), pocket: 'slits', d: 0.03, bev: 0.014, hw: 0.22 }), use: W('top', 'puffer', '#202124', { vibe: ['street', 'techwear', 'cozy'], points: 7, comfy: true }) }),
  CL({ id: 'puffer_metallic_silver', name: 'Metallic Silver Puffer', price: 240, season: 'winter', rarity: 'rare', desc: 'Liquid-silver quilting that reflects the whole party. Winter capsule only.', build: () => flatTop({ color: '#c9ccd2', fabric: 'pufferMetal', sleeve: 'long', neck: 'mock', placket: 'zip', pocket: 'slits', d: 0.03, bev: 0.014, hw: 0.22 }), use: W('top', 'puffer', '#c9ccd2', { vibe: ['y2k', 'party', 'street'], points: 8, comfy: true }) }),
  CL({ id: 'coat_trench_classic', name: 'Classic Trench Coat', price: 260, rarity: 'uncommon', desc: 'Double-breasted gabardine with a belted waist. Mysterious walks in the rain mandatory.', build: () => flatTop({ color: '#c8ad84', sleeve: 'long', neck: 'lapel', neckD: 0.3, placket: 'double', buttons: '#4a3524', belt: true, beltBuckle: 'dark', len: 0.88, flare: 0.05, pocket: 'side', d: 0.011 }), use: W('top', 'coat', '#c8ad84', { color2: '#f2efe8', vibe: ['dark', 'formal', 'luxe'], points: 8 }) }),
  CL({ id: 'jacket_storm_shell', name: 'Storm Shell Jacket', price: 280, rarity: 'uncommon', desc: 'Three-layer waterproof shell, laser-cut vents, zero visible logos. Techwear core.', build: () => flatTop({ color: '#26282c', fabric: 'nylon', sleeve: 'long', neck: 'hood', placket: 'zip', zipM: mat('#0b0b0b', { rough: 0.35 }), pocket: 'slits', len: 0.68, d: 0.01, extra: (g, k) => { for (const s of [1, -1]) g.add(seg([s * 0.035, k.T - 0.12], [s * 0.18, k.T - 0.2], 0.018, 0.003, mat('#3a3d42', { rough: 0.3, clearcoat: 0.6 }), k.top)); g.add(seg([-0.09, k.B + 0.32], [0.09, k.B + 0.32], 0.006, 0.002, mat('#d6ff3a', { rough: 0.4 }), k.top)); } }), use: W('top', 'jacket', '#26282c', { color2: '#3a3d42', vibe: ['techwear', 'dark'], points: 8 }) }),
  CL({ id: 'blazer_tweed', name: 'Herringbone Tweed Blazer', price: 190, desc: 'Elbow patches included. Overthinking poetry not included (but likely).', build: () => flatTop({ color: '#6b5a48', pattern: { kind: 'check', c: ['#6b5a48', '#5d4d3d'], rep: 60 }, sleeve: 'long', neck: 'lapel', neckD: 0.32, shirt: '#f4f1ea', lapelColor: '#5f4f3f', placket: 'double', buttons: '#2b1d14', pocket: 'side', cuffs: false, len: 0.7, d: 0.011, extra: (g, k) => { for (const s of [1, -1]) g.add(at(rbox(0.05, 0.004, 0.07, 0.02, MAT.leather('#4a2f1d')), s * 0.355, k.top + 0.001, -(k.T - 0.38)).rotateY(s * 0.35)); } }), use: W('top', 'jacket', '#6b5a48', { color2: '#f4f1ea', vibe: ['dark', 'preppy', 'formal'], points: 8 }) }),
  CL({ id: 'jacket_moto_leather', name: 'Moto Leather Jacket', price: 350, rarity: 'rare', desc: 'Buttery black leather, asymmetric zip, silver hardware. Instant rock-star posture.', build: () => flatTop({ color: '#131313', fabric: 'leather', sleeve: 'long', neck: 'lapel', neckD: 0.2, shirt: '#1d1d1d', len: 0.56, rib: false, d: 0.012, extra: (g, k) => { g.add(seg([0.06, k.T - 0.05], [0.03, k.B + 0.01], 0.008, 0.003, MAT.chrome(), k.top + 0.001)); for (const s of [1, -1]) g.add(seg([s * 0.07, k.B + 0.2], [s * 0.16, k.B + 0.24], 0.005, 0.003, MAT.chrome(), k.top)); g.add(seg([-k.hw, k.B + 0.04], [k.hw, k.B + 0.04], 0.04, 0.003, mat('#1f1f1f', { rough: 0.4, clearcoat: 0.5 }), k.top)); } }), use: W('top', 'jacket', '#131313', { color2: '#c8ccd2', vibe: ['street', 'dark', 'party'], points: 8 }) }),
  // dresses
  CL({ id: 'dress_prairie_floral', name: 'Prairie Floral Midi Dress', price: 88, season: 'spring', desc: 'Tiny flowers, puff sleeves, a ruffled hem. Picnic not included. Spring collection.', build: () => flatDress({ color: '#f2c6b4', pattern: { kind: 'floral', c: ['#f4cdb9', '#c8324a', '#3d5a9c'] }, sleeves: true, ruffle: true, trim: '#e9b8a4' }), use: W('top', 'dress', '#f2c6b4', { color2: '#c8324a', vibe: ['cottage', 'boho'], points: 7 }) }),
  CL({ id: 'dress_satin_slip', name: 'Emerald Satin Slip Dress', price: 145, rarity: 'uncommon', desc: 'Bias-cut emerald satin on whisper-thin straps. Effortless, allegedly.', build: () => flatDress({ color: '#17604c', fabric: 'satin', hem: 0.3, neckD: 0.06 }), use: W('top', 'dress', '#17604c', { vibe: ['party', 'luxe'], points: 8 }) }),
  CL({ id: 'dress_disco_sequin', name: 'Disco Sequin Mini Dress', price: 120, rarity: 'uncommon', desc: 'Ten thousand sequins and zero chill. Mirrorball not required.', build: () => flatDress({ color: '#c9a3ff', fabric: 'sequin', len: 0.66, hem: 0.27, sash: null }), use: W('top', 'dress', '#c9a3ff', { vibe: ['party', 'y2k'], points: 8 }) }),
  CL({ id: 'pj_top_flannel', name: 'Flannel Pajama Shirt', price: 34, stores: ['threadline', 'primo'], desc: 'Soft blue-check flannel with contrast piping. Pairs with the matching pants & 11 hours of sleep.', build: () => flatTop({ color: '#7b9acc', pattern: { kind: 'plaid', c: ['#8eaad6', '#f4f4f4', '#2f4a7d'] }, sleeve: 'long', neck: 'collar', collarColor: '#2f4a7d', placket: 'buttons', buttons: '#f4f4f4', pocket: 'chest', trim: '#2f4a7d' }), use: W('top', 'shirt', '#7b9acc', { color2: '#2f4a7d', vibe: ['cozy'], points: 4, comfy: true }) }),
]);

// =================================================================== BOTTOMS
defineItems([
  CL({ id: 'jeans_washed_black', name: 'Washed Black Slim Jeans', price: 72, desc: 'Faded black denim with a slim taper. Goes with every hoodie you own.', build: () => flatBottom({ color: '#2e2f33', fabric: 'denim', detail: 'jeans', legW: 0.14, out: 0.0, stitch: '#8a8a8a' }), use: W('bottom', 'jeans', '#2e2f33', { vibe: ['street', 'dark', 'basic'], points: 6 }) }),
  CL({ id: 'jeans_baggy_lightwash', name: 'Vintage Baggy Light-Wash Jeans', price: 84, desc: 'Super wide, super light, super 1996. Rolled cuffs for good measure.', build: () => flatBottom({ color: '#9bb6d6', fabric: 'denim', detail: 'jeans', legW: 0.2, out: 0.06, rolled: '#b8cbe2' }), use: W('bottom', 'jeans', '#9bb6d6', { vibe: ['street', 'retro', 'y2k'], points: 6 }) }),
  CL({ id: 'jeans_lowrise_flare', name: 'Low-Rise Flare Jeans', price: 78, desc: 'Dangerously low rise, dramatically flared hem. The early 2000s called; they want them back.', build: () => flatBottom({ color: '#4f74a8', fabric: 'denim', detail: 'jeans', legW: 0.21, out: 0.075, rise: 0.24 }), use: W('bottom', 'jeans', '#4f74a8', { vibe: ['y2k', 'party'], points: 6 }) }),
  CL({ id: 'joggers_fleece_black', name: 'Fleece Joggers', price: 55, stores: ['threadline', 'primo'], desc: 'Tapered fleece joggers with ribbed cuffs. Gym? Couch? Both.', build: () => flatBottom({ color: '#1f2023', fabric: 'fleece', detail: 'sweats', cuffs: true, legW: 0.13, out: -0.01 }), use: W('bottom', 'sweats', '#1f2023', { vibe: ['sporty', 'cozy', 'street'], points: 5, comfy: true }) }),
  CL({ id: 'sweats_lilac_cloud', name: 'Lilac Cloud Sweatpants', price: 52, desc: 'The matching bottoms to the Lilac Cloud Hoodie. Commit to the set.', build: () => flatBottom({ color: '#b49ce0', fabric: 'fleece', detail: 'sweats', cuffs: true, legW: 0.15, out: 0.01 }), use: W('bottom', 'sweats', '#b49ce0', { vibe: ['cozy', 'y2k'], points: 5, comfy: true }) }),
  CL({ id: 'cargo_utility_olive', name: 'Utility Cargo Pants', price: 78, desc: 'Six pockets, zero plans to fill them. Relaxed straight fit.', build: () => flatBottom({ color: '#6b6b4a', detail: 'cargo', legW: 0.17, out: 0.03 }), use: W('bottom', 'pants', '#6b6b4a', { vibe: ['street', 'techwear'], points: 6 }) }),
  CL({ id: 'cargo_tactical_black', name: 'Tactical Strap Cargos', price: 128, rarity: 'uncommon', desc: 'Water-repellent ripstop, articulated knees, buckled straps that serve no purpose.', build: () => flatBottom({ color: '#1c1d20', fabric: 'nylon', detail: 'cargo', straps: true, cuffs: true, cuffColor: '#151515', legW: 0.14, out: 0.0 }), use: W('bottom', 'pants', '#1c1d20', { vibe: ['techwear', 'dark'], points: 7 }) }),
  CL({ id: 'chinos_khaki', name: 'Slim Khaki Chinos', price: 60, stores: ['threadline', 'primo'], desc: 'Pressed crease, slim leg. Dress them up, dress them down, never iron them.', build: () => flatBottom({ color: '#cbb48a', detail: 'chino', legW: 0.14, out: 0.0 }), use: W('bottom', 'pants', '#cbb48a', { vibe: ['preppy', 'basic'], points: 5 }) }),
  CL({ id: 'trousers_plaid_wool', name: 'Plaid Wool Trousers', price: 96, desc: 'Charcoal check with a sharp crease. Pairs well with old libraries.', build: () => flatBottom({ color: '#4a4a4f', pattern: { kind: 'plaid', c: ['#4b4c52', '#2d2e33', '#8a7a5a'] }, detail: 'trouser', legW: 0.15, out: 0.01 }), use: W('bottom', 'pants', '#4a4a4f', { vibe: ['dark', 'formal', 'preppy'], points: 7 }) }),
  CL({ id: 'trousers_maison_wool', name: 'Maison Pleated Wool Trousers', price: 450, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Super 150s wool in ivory with a fluid wide leg. Do not, under any circumstance, eat pasta.', build: () => flatBottom({ color: '#ece4d4', detail: 'trouser', legW: 0.19, out: 0.05 }), use: W('bottom', 'pants', '#ece4d4', { vibe: ['luxe', 'formal'], points: 9 }) }),
  CL({ id: 'pants_corduroy_rust', name: 'Rust Corduroy Pants', price: 68, season: 'autumn', desc: 'Wide-wale cord in pumpkin-spice rust. Autumn collection, crunchy leaves sold separately.', build: () => flatBottom({ color: '#a4532a', pattern: { kind: 'wale', c: ['#a4532a', '#87411f'] }, detail: 'chino', legW: 0.16, out: 0.02 }), use: W('bottom', 'pants', '#a4532a', { vibe: ['retro', 'cottage'], points: 6 }) }),
  CL({ id: 'shorts_denim_cutoff', name: 'Denim Cutoff Shorts', price: 42, season: 'summer', desc: 'Frayed hems, pocket bags peeking out. Summer drop only.', build: () => flatBottom({ kind: 'pants', color: '#7f9cc4', fabric: 'denim', detail: 'jeans', len: 0.4, rise: 0.25, legW: 0.17, out: 0.045, frayed: '#e8eef6' }), use: W('bottom', 'shorts', '#7f9cc4', { vibe: ['retro', 'y2k'], points: 5 }) }),
  CL({ id: 'shorts_running', name: 'Split-Hem Running Shorts', price: 38, stores: ['threadline', 'primo'], desc: 'Featherweight shell with contrast piping. 5-inch inseam, infinite confidence.', build: () => flatBottom({ color: '#2b59c3', fabric: 'nylon', detail: 'sweats', len: 0.36, rise: 0.25, legW: 0.165, out: 0.05, piping: '#ffffff', pocketSlits: false, strings: '#ffffff' }), use: W('bottom', 'shorts', '#2b59c3', { color2: '#ffffff', vibe: ['sporty'], points: 4, comfy: true }) }),
  CL({ id: 'skirt_tennis_pleated', name: 'Pleated Tennis Skirt', price: 48, desc: 'Crisp white pleats with a navy stripe. Love-all.', build: () => flatBottom({ kind: 'skirt', color: '#f7f7f4', len: 0.36, hw: 0.17, flare: 0.08, pleats: 4, hemStripe: '#24345c' }), use: W('bottom', 'skirt', '#f7f7f4', { vibe: ['preppy', 'sporty', 'y2k'], points: 6 }) }),
  CL({ id: 'skirt_plaid_mini', name: 'Plaid Kilt Mini Skirt', price: 54, desc: 'Red tartan pleats with a gold safety pin. School-girl, if the school was a punk band.', build: () => flatBottom({ kind: 'skirt', color: '#9b1d20', pattern: { kind: 'plaid', c: ['#a3191f', '#1d2b4f', '#e9c46a'] }, len: 0.36, hw: 0.17, flare: 0.07, pleats: 4, pin: true }), use: W('bottom', 'skirt', '#9b1d20', { vibe: ['dark', 'y2k', 'preppy'], points: 6 }) }),
  CL({ id: 'skirt_linen_midi', name: 'Linen Button Midi Skirt', price: 62, desc: 'Sage linen that swishes when you walk. Pairs with wildflowers.', build: () => flatBottom({ kind: 'skirt', color: '#a3b49a', len: 0.68, hw: 0.16, flare: 0.12, button: '#f4efe4', gathers: 2 }), use: W('bottom', 'skirt', '#a3b49a', { vibe: ['cottage', 'boho'], points: 6 }) }),
  CL({ id: 'pj_pants_flannel', name: 'Flannel Pajama Pants', price: 30, stores: ['threadline', 'primo'], desc: 'The other half of the flannel pajama set. Elastic waist, zero judgement.', build: () => flatBottom({ color: '#7b9acc', pattern: { kind: 'plaid', c: ['#8eaad6', '#f4f4f4', '#2f4a7d'] }, detail: 'pj', waistColor: '#2f4a7d', piping: '#2f4a7d', legW: 0.17, out: 0.03, pocketSlits: false }), use: W('bottom', 'sweats', '#7b9acc', { vibe: ['cozy'], points: 3, comfy: true }) }),
]);

// =================================================================== SHOES
const pullLoop = (y, c = '#2b2b2b') => (s, k) => { const t = torus(0.009, 0.0032, mat(c, { rough: 0.7 }), 6, 14, PI); t.rotation.y = PI / 2; s.add(at(t, 0, k.base + y + k.bev - 0.002, -0.143)); };
const ltd = (o) => SH({ stores: ['stockpile'], limited: true, tags: ['resell'], ...o });
defineItems([
  SH({ id: 'sneaker_court_classic', name: 'Court Classic Leather Sneakers', price: 95, stores: ['threadline', 'primo'], desc: 'Clean white leather, perforated toe, green heel tab. The sneaker equivalent of a white tee.', build: () => sneakerPair({ key: 'court', upper: '#f6f5f1', perf: true, tab: '#1f6f50', sole: '#f6f5f1', out: '#e9e6dd', heel: '#f0eee8', stitch: 'rgba(0,0,0,0.25)' }), use: W('shoes', 'sneakers', '#f6f5f1', { color2: '#1f6f50', vibe: ['basic', 'preppy'], points: 6 }) }),
  SH({ id: 'sneaker_canvas_hitop', name: 'Canvas Hi-Top Sneakers', price: 65, desc: 'Black canvas, rubber toe cap, star patch. Has been cool since 1917.', build: () => sneakerPair({ key: 'canvashi', prof: 'high', upper: '#1d1d1f', toe: '#f1ede2', foxing: '#f1ede2', foxStripe: '#1d1d1f', logo: 'star', logoColor: '#1d1d1f', sole: '#f1ede2', out: '#d9d3c4', mid: 0.02, lace: '#f1ede2', rough: 0.9 }), use: W('shoes', 'sneakers', '#1d1d1f', { color2: '#f1ede2', vibe: ['retro', 'street'], points: 5 }) }),
  SH({ id: 'sneaker_checker_slipon', name: 'Checkerboard Slip-Ons', price: 60, desc: 'Black-and-white checks, waffle sole, no laces to tie. Skate or nap, your call.', build: () => sneakerPair({ key: 'checker', prof: 'slipon', upper: '#f4f2ee', checker: '#1b1b1b', foxing: '#f4f2ee', sole: '#f4f2ee', out: '#b8794a', mid: 0.02, rough: 0.85, extra: (s, k) => { for (const sx of [1, -1]) s.add(at(rbox(0.004, 0.03, 0.03, 0.002, mat('#1b1b1b', { rough: 0.9 })), sx * 0.048, k.base + 0.04, -0.03)); } }), use: W('shoes', 'sneakers', '#1b1b1b', { color2: '#f4f2ee', vibe: ['street', 'retro'], points: 5 }) }),
  SH({ id: 'sneaker_cloud_runner', name: 'Cloud Runner Knit Sneakers', price: 130, desc: 'Sock-like knit, a ridiculous amount of foam, and a neon flash. Running optional.', build: () => sneakerPair({ key: 'cloudrun', prof: 'runner', upper: '#c9ccd1', logo: 'wave', logoColor: '#d6ff3a', heel: '#aeb2b8', tab: '#d6ff3a', sole: '#fafafa', mid: 0.034, out: '#2b2b2b', lace: '#2b2b2b', rough: 0.95 }), use: W('shoes', 'sneakers', '#c9ccd1', { color2: '#d6ff3a', vibe: ['sporty'], points: 7, comfy: true }) }),
  SH({ id: 'sneaker_dad_9000', name: 'Dad Shoe 9000', price: 110, desc: 'Chunky, layered, gloriously ugly. Your actual dad is confused but proud.', build: () => sneakerPair({ key: 'dad9000', upper: '#f3f1ec', toe: '#c9c9cf', heel: '#b6b8c1', eyestay: '#3a4a7a', logo: 'n', logoColor: '#3a4a7a', sole: '#f6f4ef', mid2: '#cfd3dc', mid: 0.046, out: '#8a8f99', lace: '#f3f1ec' }), use: W('shoes', 'sneakers', '#f3f1ec', { color2: '#3a4a7a', vibe: ['y2k', 'street'], points: 6, comfy: true }) }),
  SH({ id: 'sneaker_trail_shell', name: 'Trail Shell Runners', price: 150, desc: 'Black ripstop uppers, lugged sole, reflective bolt. Built for mountains, worn to the corner store.', build: () => sneakerPair({ key: 'trail', prof: 'runner', upper: '#1e1f22', heel: '#2c2e33', toe: '#2c2e33', logo: 'bolt', logoColor: '#a7aab0', tab: '#d6ff3a', sole: '#2a2b2e', mid: 0.03, out: '#121212', lace: '#121212', rough: 0.6 }), use: W('shoes', 'sneakers', '#1e1f22', { color2: '#2a2b2e', vibe: ['techwear', 'sporty', 'dark'], points: 7 }) }),
  SH({ id: 'sneaker_platform_pastel', name: 'Pastel Platform Sneakers', price: 85, desc: 'Cotton-candy pink on a sky-blue platform. Instant 5cm of extra confidence.', build: () => sneakerPair({ key: 'platform', upper: '#fbe1ee', logo: 'stripes', logoColor: '#b79cff', heel: '#f7cfe2', sole: '#ffffff', mid2: '#cfe6ff', mid: 0.05, out: '#b79cff', lace: '#ffffff' }), use: W('shoes', 'sneakers', '#fbe1ee', { color2: '#cfe6ff', vibe: ['y2k', 'party'], points: 6 }) }),
  // hype pairs (retail + resale market)
  SH({ id: 'sneaker_hicourt_windy', name: 'Hi-Court \'85 "Windy City"', price: 180, stores: ['threadline', 'stockpile'], rarity: 'rare', resale: 135, desc: 'Red, white and black leather in the colorway that started it all. Sells out in seconds.', build: () => sneakerPair({ key: 'windy', prof: 'high', upper: '#f7f6f2', toe: '#c8102e', heel: '#c8102e', eyestay: '#c8102e', collar: '#141414', logo: 'swoosh', logoColor: '#141414', sole: '#f7f6f2', out: '#c8102e', lace: '#f7f6f2', perf: true, gloss: 0.3, rough: 0.4 }), use: W('shoes', 'sneakers', '#c8102e', { color2: '#f7f6f2', vibe: ['street', 'retro'], points: 8 }) }),
  SH({ id: 'sneaker_duo_low_panda', name: 'Duo Low "Panda"', price: 115, stores: ['threadline', 'stockpile'], rarity: 'rare', resale: 88, desc: 'Black overlays on white leather. Goes with everything, which is why everyone has them.', build: () => sneakerPair({ key: 'panda', upper: '#f7f7f5', toe: '#161616', heel: '#161616', eyestay: '#161616', logo: 'swoosh', logoColor: '#161616', sole: '#f7f7f5', out: '#161616', lace: '#f7f7f5', perf: true, gloss: 0.3, rough: 0.4 }), use: W('shoes', 'sneakers', '#f7f7f5', { color2: '#161616', vibe: ['street', 'basic'], points: 7 }) }),
  SH({ id: 'sneaker_cloudknit_zebra', name: 'Cloudknit 350 "Zebra"', price: 230, stores: ['threadline', 'stockpile'], rarity: 'rare', resale: 170, desc: 'Zebra-striped primeknit on a full-length foam bed. Restocks are rumoured, never confirmed.', build: () => sneakerPair({ key: 'zebra', prof: 'runner', upper: '#f2f2ef', sole: '#f7f4ec', mid: 0.032, out: '#e4ddcc', lace: '#f2f2ef', tab: '#f2f2ef', rough: 0.95, paint: (x, P) => { x.fillStyle = '#1b1b1b'; for (let i = 0; i < 12; i++) { const u = -0.13 + i * 0.024; x.beginPath(); x.moveTo(...P(u, 0.0)); x.quadraticCurveTo(...P(u + 0.03, 0.035), ...P(u + 0.008, 0.08)); x.lineTo(...P(u + 0.016, 0.08)); x.quadraticCurveTo(...P(u + 0.04, 0.035), ...P(u + 0.01, 0.0)); x.fill(); } x.fillStyle = '#c8102e'; x.fillRect(...P(-0.03, 0.028), 60, 7); }, noLaces: false }), use: W('shoes', 'sneakers', '#f2f2ef', { color2: '#1b1b1b', vibe: ['street', 'sporty'], points: 8, comfy: true }) }),
  // Stockpile grails (limited 6 PM drops only)
  ltd({ id: 'grail_hoverlace_mag', name: 'Hoverlace Mag "Future"', price: 2500, rarity: 'legendary', resale: 1200, desc: 'Self-lacing, light-up, straight out of 2015\'s idea of the future. Only a handful exist.', build: () => sneakerPair({ key: 'mag', prof: 'high', upper: '#a7adb4', collar: '#8b9198', heel: '#8b9198', sole: '#bfe6ff', glowSole: '#5fc8ff', mid: 0.036, out: '#c9d1da', noLaces: true, rough: 0.55, extra: (s, k) => { s.add(at(rbox(0.088, 0.026, 0.07, 0.008, mat('#d9dee4', { rough: 0.4 })), 0, k.base + 0.112, -0.09)); s.add(at(box(0.09, 0.008, 0.024, mat('#7fd6ff', { emissive: '#7fd6ff', ei: 1.6 })), 0, k.base + 0.112, -0.09)); s.add(at(rbox(0.094, 0.014, 0.05, 0.004, mat('#7fd6ff', { emissive: '#5fc8ff', ei: 2 })), 0, k.base + 0.075, -0.115)); for (let i = 0; i < 2; i++) s.add(at(rot(rbox(0.082, 0.01, 0.026, 0.004, mat('#c9ced4', { rough: 0.5 })), -0.65, 0, 0), 0, k.base + 0.1 - i * 0.026, -0.022 + i * 0.036)); } }), use: W('shoes', 'sneakers', '#a7adb4', { color2: '#7fd6ff', vibe: ['techwear', 'street', 'retro'], points: 10 }) }),
  ltd({ id: 'grail_desert_reverse_mocha', name: 'Desert Low "Reverse Mocha"', price: 150, rarity: 'epic', resale: 480, desc: 'Sail leather, mocha suede overlays and a backwards swoosh. Raffle-only, bot-proof, mythical.', build: () => sneakerPair({ key: 'mocha', upper: '#efe6d4', toe: '#5b3a29', heel: '#5b3a29', eyestay: '#5b3a29', logo: 'reverse', logoColor: '#3b2416', sole: '#efe2c8', out: '#5b3a29', lace: '#efe6d4', rough: 0.85 }), use: W('shoes', 'sneakers', '#5b3a29', { color2: '#efe6d4', vibe: ['street', 'retro'], points: 9 }) }),
  ltd({ id: 'grail_zip_tie_ten', name: 'Zip-Tie Hi "The Ten"', price: 190, rarity: 'epic', resale: 520, desc: 'Deconstructed white leather, exposed foam and that red zip-tie. Everything is in quotation marks.', build: () => sneakerPair({ key: 'ziptie', prof: 'high', upper: '#f4f3ef', collar: '#e6e3da', logo: 'swoosh', logoColor: '#1b1b1b', sole: '#f4f3ef', out: '#ff6b1a', lace: '#f4f3ef', tab: '#ff6b1a', paint: (x, P) => { x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1.5; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(...P(-0.13, 0.11)); x.lineTo(...P(0.12, 0.03)); x.stroke(); x.setLineDash([]); }, extra: (s, k) => s.add(at(rot(rbox(0.012, 0.004, 0.04, 0.002, mat('#e0201c', { rough: 0.4, clearcoat: 0.5 })), 0.4, 0, 0.3), 0.03, k.base + 0.12, -0.04)) }), use: W('shoes', 'sneakers', '#f4f3ef', { color2: '#ff6b1a', vibe: ['street', 'y2k'], points: 9 }) }),
  ltd({ id: 'grail_diamond_low', name: 'Diamond Low "Sparkle"', price: 120, rarity: 'epic', resale: 450, desc: 'Robin\'s-egg blue with a faux-croc black overlay and a silver swoosh. Tents were pitched for these.', build: () => sneakerPair({ key: 'diamond', upper: '#81d8d0', toe: '#141414', heel: '#141414', eyestay: '#141414', logo: 'swoosh', logoColor: '#c9ccd2', sole: '#f7f7f5', out: '#81d8d0', lace: '#81d8d0', gloss: 0.4 }), use: W('shoes', 'sneakers', '#81d8d0', { color2: '#141414', vibe: ['street', 'luxe'], points: 9 }) }),
  ltd({ id: 'grail_pharaoh_gold', name: 'Pharaoh High "Gold Rush"', price: 350, rarity: 'legendary', resale: 1100, desc: 'Mirror-gold leather with black accents. Ships in a wooden crate. Wear at your own (financial) risk.', build: () => sneakerPair({ key: 'pharaoh', prof: 'high', upper: '#e2b44f', metal: 0.85, rough: 0.28, collar: '#c99a33', logo: 'wave', logoColor: '#141414', sole: '#141414', out: '#e2b44f', lace: '#141414', tab: '#141414' }), use: W('shoes', 'sneakers', '#e2b44f', { color2: '#141414', metal: true, vibe: ['luxe', 'party', 'street'], points: 10 }) }),
  // boots, loafers, heels, slides
  SH({ id: 'boots_chelsea_black', name: 'Black Leather Chelsea Boots', price: 180, desc: 'Polished calf leather, elastic gussets, pull tabs. Slip on, look composed.', build: () => sneakerPair({ key: 'chelsea', prof: 'chelsea', upper: '#1a1a1b', gore: '#38383b', sole: '#1a1a1b', mid: 0.012, out: '#2b1d14', outsole: 0.014, gloss: 0.7, rough: 0.35, width: 0.07, extra: pullLoop(0.178) }), use: W('shoes', 'boots', '#1a1a1b', { color2: '#2b1d14', vibe: ['dark', 'formal', 'street'], points: 7 }) }),
  SH({ id: 'boots_combat_lug', name: 'Lug-Sole Combat Boots', price: 160, desc: 'Eight eyelets, yellow welt stitching, a tank-tread sole. Stomp responsibly.', build: () => sneakerPair({ key: 'combat', prof: 'combat', upper: '#161617', stitch: '#e9c46a', sole: '#161617', mid: 0.018, out: '#0c0c0c', outsole: 0.018, lace: '#141414', tongue: '#161617', tab: '#e9c46a', gloss: 0.5, rough: 0.4, extra: pullLoop(0.2, '#e9c46a') }), use: W('shoes', 'boots', '#161617', { color2: '#e9c46a', vibe: ['street', 'dark', 'techwear'], points: 7 }) }),
  SH({ id: 'boots_shearling_tan', name: 'Cozy Shearling Boots', price: 140, desc: 'Sheepskin outside, fluffy cloud inside. The slipper that decided to go outdoors.', build: () => sneakerPair({ key: 'shearling', prof: 'shearling', upper: '#c49a6c', sole: '#e8dcc8', mid: 0.016, out: '#8a6a4a', rough: 1, bev: 0.016, width: 0.07, lining: '#efe4cf', extra: (s, k) => { const t = torus(0.042, 0.014, mat('#f3ead8', { rough: 1, sheen: 1, map: furTex() }), 8, 22); t.rotation.x = PI / 2; t.scale.set(1.05, 1.35, 1); s.add(at(t, 0, k.base + 0.21 + k.bev, -0.075)); } }), use: W('shoes', 'boots', '#c49a6c', { color2: '#f3ead8', vibe: ['cozy', 'cottage'], points: 5, comfy: true }) }),
  SH({ id: 'boots_trailhead_hiker', name: 'Trailhead Hiking Boots', price: 150, desc: 'Waxed suede, red laces, Vibram-style lugs. Ready for any trail, including the one to the fridge.', build: () => sneakerPair({ key: 'hiker', prof: 'hiker', upper: '#8a6a48', toe: '#4a3426', heel: '#4a3426', eyestay: '#4a3426', foxing: '#3a2a1e', sole: '#e3d8c4', mid: 0.018, out: '#2b2b2b', outsole: 0.016, lace: '#c1121f', rough: 0.9 }), use: W('shoes', 'boots', '#8a6a48', { color2: '#c1121f', vibe: ['cottage', 'techwear', 'retro'], points: 6 }) }),
  SH({ id: 'loafers_penny_brown', name: 'Penny Loafers', price: 160, desc: 'Burnished brown leather with a moc toe and a slot for your lucky penny.', build: () => sneakerPair({ key: 'penny', prof: 'loafer', upper: '#4a2618', sole: '#2b1a12', mid: 0.008, outsole: 0.012, out: '#24150d', gloss: 0.7, rough: 0.32, width: 0.07, lining: '#c9a27c', extra: (s, k) => { const y = k.base + k.bev; s.add(at(box(0.1, 0.008, 0.026, mat('#3d1f13', { rough: 0.35, clearcoat: 0.7 })), 0, y + 0.049, 0.0)); s.add(at(rbox(0.032, 0.004, 0.008, 0.002, mat('#140a06')), 0, y + 0.054, 0.0)); s.add(tube([[-0.032, y + 0.05, 0.018], [-0.034, y + 0.043, 0.08], [0, y + 0.029, 0.124], [0.034, y + 0.043, 0.08], [0.032, y + 0.05, 0.018]], 0.0018, mat('#2a140b', { rough: 0.7 }), 24, 5)); } }), use: W('shoes', 'loafers', '#4a2618', { color2: '#2b1a12', vibe: ['preppy', 'dark', 'formal'], points: 7 }) }),
  SH({ id: 'loafers_maison_horsebit', name: 'Maison Horsebit Loafers', price: 850, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', resale: 470, desc: 'Glossy black calfskin with a gold horsebit. The official shoe of having an accountant.', build: () => sneakerPair({ key: 'horsebit', prof: 'loafer', upper: '#121213', sole: '#3b1f12', mid: 0.008, outsole: 0.012, out: '#2b170d', gloss: 0.9, rough: 0.25, width: 0.07, lining: '#c9a27c', extra: (s, k) => { const y = k.base + k.bev + 0.052; s.add(at(rot(cyl(0.003, 0.003, 0.07, MAT.gold(), 10), 0, 0, PI / 2), 0, y, 0.0)); for (const sx of [1, -1]) { const r = torus(0.008, 0.0025, MAT.gold(), 6, 14); r.rotation.x = PI / 2 - 0.4; s.add(at(r, sx * 0.038, y - 0.002, 0.0)); } } }), use: W('shoes', 'loafers', '#121213', { color2: '#c9a86a', vibe: ['luxe', 'formal'], points: 9 }) }),
  SH({ id: 'heels_black_patent', name: 'Black Patent Stiletto Pumps', price: 120, desc: 'Pointed toe, 9cm stiletto, mirror shine. Click-clack with intent.', build: () => pairOf(pumpBuilder({ color: '#0f0f10' }), { gap: 0.05 }), use: W('shoes', 'heels', '#0f0f10', { vibe: ['party', 'formal', 'dark'], points: 7 }) }),
  SH({ id: 'heels_maison_rouge', name: 'Maison Rouge-Sole Stilettos', price: 795, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', resale: 440, desc: 'Nude patent leather, 10cm heel, and the famous lacquered red sole. Flash it on the stairs.', build: () => pairOf(pumpBuilder({ color: '#e3c2a6', sole: '#c1121f', heelH: 0.095 }), { gap: 0.045 }), use: W('shoes', 'heels', '#e3c2a6', { color2: '#c1121f', vibe: ['luxe', 'party'], points: 9 }) }),
  SH({ id: 'heels_platform_silver', name: 'Silver Platform Heels', price: 95, desc: 'Mirror-silver straps on a chunky platform. Built for the dance floor, survives the after-party.', build: () => pairOf(pumpBuilder({ color: '#aeb3bb', metal: 0.9, sole: '#9fa4ad', platform: 0.022, heelH: 0.085, strap: '#d4d7dc' }), { gap: 0.045 }), use: W('shoes', 'heels', '#d4d7dc', { metal: true, vibe: ['party', 'y2k'], points: 7 }) }),
  SH({ id: 'slides_pool_black', name: 'Logo Pool Slides', price: 30, stores: ['threadline', 'primo'], tags: [], desc: 'Contoured foam footbed and a fat logo strap. Socks optional, judgement included.', build: () => pairOf(slideBuilder({ bed: '#151515', strap: '#151515', logo: 'THREADLINE', key: 'tlslide' }), { gap: 0.06, splay: 0.12 }), use: W('shoes', 'slippers', '#151515', { vibe: ['sporty', 'cozy', 'street'], points: 3, comfy: true }) }),
]);

// =================================================================== HATS
defineItems([
  AC({ id: 'cap_threadline_black', name: 'Threadline Logo Cap', price: 28, desc: 'Six-panel cotton twill with an embroidered TL. The quickest bad-hair-day fix.', build: () => capModel({ color: '#1a1a1c', logo: 'TL', logoColor: '#f4f4f4', key: 'tl' }), use: W('hat', 'cap', '#1a1a1c', { vibe: ['street', 'basic'], points: 4 }) }),
  AC({ id: 'cap_yacht_club', name: 'Yacht Club Cap', price: 34, desc: 'Navy wool with a cream monogram. You don\'t own a boat. Nobody needs to know.', build: () => capModel({ color: '#1d2b4f', logo: 'YC', logoColor: '#f2e6c9', button: '#f2e6c9', key: 'yc' }), use: W('hat', 'cap', '#1d2b4f', { vibe: ['preppy', 'retro'], points: 5 }) }),
  AC({ id: 'cap_gone_fishing', name: '"Gone Fishing" Dad Cap', price: 26, desc: 'Washed stone canvas with a brown brim and an out-of-office message.', build: () => capModel({ color: '#ddd3bd', brim: '#7a5c3c', logo: 'GONE FISHING', logoColor: '#7a5c3c', key: 'fish' }), use: W('hat', 'cap', '#ddd3bd', { color2: '#7a5c3c', vibe: ['retro', 'cottage'], points: 4 }) }),
  AC({ id: 'cap_featherweight_run', name: 'Featherweight Running Cap', price: 30, stores: ['threadline', 'primo'], desc: 'Perforated, sweat-wicking and lighter than your excuses.', build: () => capModel({ color: '#f4f5f6', brim: '#1b1b1b', logo: 'RUN', logoColor: '#1b1b1b', key: 'run' }), use: W('hat', 'cap', '#f4f5f6', { color2: '#1b1b1b', vibe: ['sporty'], points: 4 }) }),
  AC({ id: 'beanie_mustard_watch', name: 'Cuffed Watch Beanie', price: 24, desc: 'Chunky rib in mustard with a tiny leather patch. Fisherman approved.', build: () => beanieModel({ color: '#d4a017', key: 'mustard', patch: (x, w, h) => { x.fillStyle = '#7a4a2a'; x.fillRect(0, 0, w, h); txt(x, 'TL', w / 2, h / 2, h * 0.6, '#f2e0c0', 900); } }), use: W('hat', 'beanie', '#d4a017', { fabric: 'knit', vibe: ['cozy', 'street'], points: 4, comfy: true }) }),
  AC({ id: 'beanie_snow_pom', name: 'Pom-Pom Snow Beanie', price: 28, season: 'winter', desc: 'Cranberry knit, cream cuff, a pom-pom the size of a snowball. Winter-only.', build: () => beanieModel({ color: '#b5172b', cuff: '#efe6d2', pom: '#f7f2e6', key: 'snow' }), use: W('hat', 'beanie', '#b5172b', { color2: '#f7f2e6', fabric: 'knit', vibe: ['cozy', 'party'], points: 5, comfy: true }) }),
  AC({ id: 'beanie_tech_black', name: 'Tech Fleece Beanie', price: 26, desc: 'Black grid-fleece with a neon-green tab. Stealth mode: on.', build: () => beanieModel({ color: '#1b1c1f', key: 'tech', patch: (x, w, h) => { x.fillStyle = '#d6ff3a'; x.fillRect(0, 0, w, h); } }), use: W('hat', 'beanie', '#1b1c1f', { fabric: 'knit', vibe: ['techwear', 'dark'], points: 4 }) }),
  AC({ id: 'bucket_fuzzy_pink', name: 'Fuzzy Faux-Fur Bucket Hat', price: 38, desc: 'Bubblegum faux fur. Every pet you meet will try to make friends.', build: () => bucketModel({ color: '#ff9cc8', fabric: 'fur' }), use: W('hat', 'bucket', '#ff9cc8', { vibe: ['y2k', 'party'], points: 6 }) }),
  AC({ id: 'bucket_canvas_khaki', name: 'Canvas Bucket Hat', price: 32, desc: 'Stitched brim, washed khaki canvas. Festival season, any season.', build: () => bucketModel({ color: '#cdbb93', band: '#3b3324', logo: 'TL', logoColor: '#3b3324', key: 'khaki' }), use: W('hat', 'bucket', '#cdbb93', { vibe: ['street', 'retro'], points: 5 }) }),
  AC({ id: 'beret_wool_black', name: 'Black Wool Beret', price: 36, desc: 'Felted Basque wool, worn at a deliberate tilt. Poetry readings optional.', build: () => beretModel({ color: '#1b1b1d' }), use: W('hat', 'beret', '#1b1b1d', { vibe: ['dark', 'cottage', 'luxe'], points: 5 }) }),
  AC({ id: 'crown_party_gold', name: 'Royal Party Crown', price: 24, stores: ['threadline', 'primo'], rarity: 'uncommon', desc: 'Gold-tone, faux-jewelled, velvet-lined. Declares you ruler of the living room.', build: crownModel, use: W('hat', 'crown', '#e8b94a', { vibe: ['party', 'luxe'], points: 6 }) }),
]);

// =================================================================== EYEWEAR
defineItems([
  AC({ id: 'sunnies_wayfarer_black', name: 'Classic Black Wayfarers', price: 45, stores: ['threadline', 'primo'], desc: 'Glossy acetate, dark green lenses. Cool since the 1950s, still cool now.', build: () => glassesModel({ kind: 'wayfarer', frame: '#121212', lens: '#1e2b22' }), use: W('glasses', 'sun', '#121212', { lens: '#1e2b22', vibe: ['street', 'retro', 'basic'], points: 5 }) }),
  AC({ id: 'sunnies_aviator_gold', name: 'Gold Aviator Sunglasses', price: 85, desc: 'Teardrop lenses, double bridge, thin gold wire. Top-gun energy.', build: () => glassesModel({ kind: 'aviator', wire: true, frame: '#d4af37', lens: '#3d4b3a' }), use: W('glasses', 'sun', '#d4af37', { lens: '#3d4b3a', vibe: ['retro', 'street', 'luxe'], points: 6 }) }),
  AC({ id: 'glasses_round_wire', name: 'Round Wire Frames', price: 60, desc: 'Antique-brass circles with clear lenses. +10 to perceived literacy.', build: () => glassesModel({ kind: 'round', wire: true, frame: '#a8864f', lens: '#dbe9f2', sun: false }), use: W('glasses', 'round', '#a8864f', { lens: '#dbe9f2', vibe: ['dark', 'cottage', 'preppy'], points: 5 }) }),
  AC({ id: 'sunnies_tiny_y2k', name: 'Tiny Oval Y2K Shades', price: 25, desc: 'Barely-there pink lenses that protect from absolutely nothing. Iconic.', build: () => glassesModel({ kind: 'oval', frame: '#f2f2f2', lens: '#ff6fae' }), use: W('glasses', 'sun', '#f2f2f2', { lens: '#ff6fae', vibe: ['y2k', 'party'], points: 5 }) }),
  AC({ id: 'sunnies_sport_shield', name: 'Sport Shield Sunglasses', price: 70, desc: 'One wraparound ice-blue mirror lens. Makes you 12% more aerodynamic.', build: () => shieldModel({ frame: '#151515', lens: '#2f8fe0' }), use: W('glasses', 'sun', '#151515', { lens: '#8fd3ff', vibe: ['sporty', 'techwear'], points: 6 }) }),
  AC({ id: 'sunnies_maison_cateye', name: 'Maison Cat-Eye Sunglasses', price: 420, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Hand-polished tortoiseshell acetate with gradient lenses. Paparazzi sold separately.', build: () => glassesModel({ kind: 'cat', frame: '#6b3d1f', tort: true, lens: '#3a2a22' }), use: W('glasses', 'sun', '#6b3d1f', { lens: '#3a2a22', vibe: ['luxe', 'party', 'retro'], points: 9 }) }),
]);

// =================================================================== ACCESSORIES
const goldLinks = () => mat('#ffffff', { map: linkTex('#e6bf5c', '#8a6a22'), rough: 0.2, metal: 1 });
const steelLinks = () => mat('#ffffff', { map: linkTex('#d9dce1', '#7e838b'), rough: 0.18, metal: 1 });
const smartScreen = (x, w, h) => {
  x.fillStyle = '#05070a'; x.fillRect(0, 0, w, h);
  const ring = (r, c, f) => { x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 9; x.beginPath(); x.arc(w / 2, h * 0.42, r, 0, 7); x.stroke(); x.strokeStyle = c; x.beginPath(); x.arc(w / 2, h * 0.42, r, -PI / 2, -PI / 2 + f * PI * 2); x.stroke(); };
  x.lineCap = 'round'; ring(w * 0.34, '#ff2d55', 0.8); ring(w * 0.24, '#a6ff00', 0.62); ring(w * 0.14, '#33d6ff', 0.9);
  txt(x, '10:10', w / 2, h * 0.84, h * 0.13, '#ffffff', 700);
};
const lcdScreen = (x, w, h) => { x.fillStyle = '#b9c2a4'; x.fillRect(0, 0, w, h); txt(x, '12:58', w / 2, h * 0.56, h * 0.62, '#1f2618', 700, w * 0.9, 'monospace'); txt(x, 'ALARM CHRONO', w / 2, h * 0.12, h * 0.12, '#1f2618', 700); };
defineItems([
  AC({ id: 'watch_field_leather', name: 'Everyday Field Watch', price: 145, desc: 'Brushed steel, cream dial with big numerals, a brown leather strap that ages well.', build: () => watchModel({ caseM: MAT.chrome(), strapColor: '#6b4226', dial: dialDraw({ face: '#f1e8d4', numbers: true, brand: 'THREADLINE' }), key: 'field' }), use: W('accessory', 'watch', '#c8ccd2', { metal: true, vibe: ['basic', 'preppy', 'cottage'], points: 6 }) }),
  AC({ id: 'watch_pulse_smart', name: 'Pulse Smart Fitness Watch', price: 299, stores: ['threadline', 'primo', 'volt'], rarity: 'uncommon', desc: 'Tracks steps, sleep and how long you\'ve been "resting your eyes".', build: () => watchModel({ kind: 'smart', caseM: mat('#1d1e21', { rough: 0.3, metal: 0.6 }), strapM: mat('#2a2c30', { rough: 0.8 }), screen: smartScreen, key: 'pulse' }), use: W('accessory', 'watch', '#1d1e21', { vibe: ['sporty', 'techwear'], points: 7 }) }),
  AC({ id: 'watch_retro_digital', name: 'Retro Gold Digital Watch', price: 29, desc: 'Gold-tone steel, green LCD, alarm chime that will scare your cat. A 1985 classic.', build: () => watchModel({ kind: 'digital', caseM: mat('#d8b45a', { rough: 0.25, metal: 1 }), strapM: goldLinks(), screen: lcdScreen, key: 'digital' }), use: W('accessory', 'watch', '#d8b45a', { metal: true, vibe: ['retro', 'y2k'], points: 5 }) }),
  AC({ id: 'watch_maison_royale', name: 'Maison Royale Gold Chronometer', price: 9800, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'epic', desc: '18k yellow gold, fluted bezel, champagne dial, three-link bracelet. Tells time and tells everyone.', build: () => watchModel({ caseM: mat('#e2b44f', { rough: 0.16, metal: 1 }), strapM: goldLinks(), bezel: mat('#f0c860', { rough: 0.1, metal: 1 }), dial: dialDraw({ face: '#efd9a8', ink2: '#5a4320', brand: 'MAISON', date: true }), key: 'royale' }), use: W('accessory', 'watch', '#e2b44f', { metal: true, vibe: ['luxe', 'party'], points: 10 }) }),
  AC({ id: 'watch_maison_abyss', name: 'Maison Abyss Diver', price: 4600, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'epic', desc: 'Steel diver with an emerald ceramic bezel and glowing markers. Waterproof to 300m, or one bath.', build: () => watchModel({ caseM: mat('#d9dce1', { rough: 0.15, metal: 1 }), strapM: steelLinks(), bezel: mat('#0f6b45', { rough: 0.15, clearcoat: 1 }), dial: dialDraw({ face: '#0d5c3c', ink2: '#f2f2f2', accent: '#0a4a30', lume: true, brand: 'MAISON', date: true }), key: 'abyss' }), use: W('accessory', 'watch', '#d9dce1', { metal: true, vibe: ['luxe', 'sporty'], points: 10 }) }),
  AC({ id: 'chain_cuban_gold', name: 'Maison Gold Cuban Link Chain', price: 1450, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Heavy 14k Cuban links in a velvet box. Ten out of ten streetwear grails agree.', build: () => jewelryBox(chainLoop({ metal: mat('#e8bd52', { rough: 0.15, metal: 1 }), links: 28, r: 0.0058, tubeR: 0.0021 })), use: W('accessory', 'chain', '#e2b44f', { metal: true, vibe: ['street', 'luxe', 'party'], points: 9 }) }),
  AC({ id: 'chain_sterling_rope', name: 'Sterling Rope Chain', price: 65, desc: 'Twisted sterling silver rope, 22 inches. Subtle flex.', build: () => jewelryBox(chainLoop({ metal: MAT.chrome(), links: 32, r: 0.0042, tubeR: 0.0013, flat: false }), { box: '#2b2f3a', lining: '#1b1f2a' }), use: W('accessory', 'chain', '#d7dade', { metal: true, vibe: ['street', 'basic', 'dark'], points: 5 }) }),
  AC({ id: 'necklace_maison_pearl', name: 'Maison Freshwater Pearl Necklace', price: 680, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Hand-knotted freshwater pearls with a gold clasp. Grandmother-approved, runway-ready.', build: () => { const g = new THREE.Group(); const pm = mat('#f6f0e6', { rough: 0.18, clearcoat: 1, sheen: 0.6 }); for (let i = 0; i < 30; i++) { const t = (i / 30) * PI * 2; g.add(at(sph(0.0048, pm, 12, 10), Math.cos(t) * 0.043, 0.0048, Math.sin(t) * 0.038)); } g.add(at(rbox(0.01, 0.004, 0.006, 0.002, MAT.gold()), 0, 0.004, -0.04)); return jewelryBox(g, { box: '#6b1d2f', lining: '#3a0f1c' }); }, use: W('accessory', 'necklace', '#f6f0e6', { vibe: ['luxe', 'cottage', 'party'], points: 8 }) }),
  AC({ id: 'headphones_cloud_wear', name: 'Cloud Over-Ear Headphones', price: 199, rarity: 'uncommon', desc: 'Cream protein-leather cups and a brushed-gold band. Mostly worn around the neck, for the look.', build: () => headphonesModel({ color: '#ece6dc', accent: '#c9a86a' }), use: W('accessory', 'headphones', '#ece6dc', { vibe: ['street', 'techwear', 'cozy'], points: 6 }) }),
  AC({ id: 'scarf_chunky_knit', name: 'Chunky Knit Scarf', price: 38, desc: 'Oatmeal wool knitted on comically large needles. Wrap twice, hide from the world.', build: () => scarfModel({ color: '#ddcdb0', fringe: '#ddcdb0' }), use: W('accessory', 'scarf', '#ddcdb0', { vibe: ['cozy', 'cottage'], points: 5, comfy: true }) }),
  AC({ id: 'scarf_maison_cashmere', name: 'Maison Cashmere Check Scarf', price: 395, stores: ['luxe'], brand: 'Maison Luxe', rarity: 'rare', desc: 'Brushed cashmere in a camel house check. Soft enough to forgive the price tag.', build: () => scarfModel({ color: '#c8a77a', fabric: 'cotton', pattern: { kind: 'plaid', c: ['#c8a77a', '#1f1f1f', '#b5172b'] }, fringe: '#c8a77a' }), use: W('accessory', 'scarf', '#c8a77a', { vibe: ['luxe', 'dark', 'preppy'], points: 8, comfy: true }) }),
  AC({ id: 'backpack_commuter_tech', name: 'Commuter Tech Backpack', price: 160, desc: 'Water-resistant shell, reflective strip, a laptop sleeve for the laptop you never take out.', build: () => backpackModel({ color: '#1c1d20', trim: '#26282c', kind: 'tech' }), use: W('accessory', 'backpack', '#1c1d20', { vibe: ['techwear', 'street'], points: 6 }) }),
  AC({ id: 'backpack_canvas_rucksack', name: 'Canvas Rucksack', price: 85, desc: 'Waxed olive canvas, leather straps, brass buckles. Smells faintly of adventure.', build: () => backpackModel({ color: '#6f7350', trim: '#6b4226', kind: 'canvas' }), use: W('accessory', 'backpack', '#6f7350', { vibe: ['cottage', 'retro'], points: 5 }) }),
]);
void cone; void hemi; void curve;
