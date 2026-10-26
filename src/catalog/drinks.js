// Catalogue: drinks — coffee, boba, smoothies & juices, sodas, energy drinks,
// sparkling water, kombucha, shakes and seasonal sippers, plus their empties.
// Liquid meshes carry userData.liquid (geometry origin at the bottom) so the
// level visibly drops with every sip.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mesh, mat, MAT, box, rbox, cyl, sph, torus, cone, lathe, tube, at, rot, group, FONT, fitText, labelTexture } from '../items/kit.js';
import { can, bottle } from './shared.js';
import { cgeo, bite, F, GL, whip, citrusWedge, speckTex } from './food.js';
import { seeded } from '../core/utils.js';

const PI = Math.PI;
const TX = (key, w, h, draw, o) => labelTexture('drink:' + key, w, h, draw, o);

// ------------------------------------------------------------------ liquids
function sampleStops(stops, t, out) {
  if (t <= stops[0][0]) return out.set(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return out.set(c0).lerp(new THREE.Color(c1), k);
    }
  }
  return out.set(stops[stops.length - 1][1]);
}
// tapered liquid body (origin at the bottom) with a vertical colour gradient
export function liquidGeo(r0, r1, h, stops, seg = 24) {
  const key = `liq:${r0}:${r1}:${h}:${seg}:${stops.map((s) => s.join('@')).join('|')}`;
  return cgeo(key, () => {
    const n = 10;
    const prof = [new THREE.Vector2(0.0001, 0.002)];
    for (let i = 0; i <= n; i++) { const t = i / n; prof.push(new THREE.Vector2(r0 + (r1 - r0) * t, 0.002 + (h - 0.002) * t)); }
    prof.push(new THREE.Vector2(0.0001, h));
    const g = new THREE.LatheGeometry(prof, seg);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { sampleStops(stops, pos.getY(i) / h, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}
export function liquid(r0, r1, h, stops, { opacity = 0.93, rough = 0.25 } = {}) {
  if (typeof stops === 'string') stops = [[0, stops], [1, stops]];
  const m = mesh(liquidGeo(r0, r1, h, stops), mat('#ffffff', { vertexColors: true, rough, opacity, transparent: opacity < 1, depthWrite: opacity >= 1 }));
  m.userData.liquid = true;
  return m;
}
// plain cylinder liquid whose top face can carry a texture (latte art, foam)
function topLiquid(r0, r1, h, side, topMat) {
  const geo = cgeo(`tliq:${r0}:${r1}:${h}`, () => { const q = new THREE.CylinderGeometry(r1, r0, h, 28); q.translate(0, h / 2, 0); return q; });
  const m = mesh(geo, [mat(side, { rough: 0.3 }), topMat, mat(side, { rough: 0.3 })]);
  m.userData.liquid = true;
  return m;
}

// ------------------------------------------------------------------ cups
const CLEAR = () => mat('#eef6f8', { rough: 0.08, opacity: 0.16, transparent: true, side: THREE.DoubleSide, depthWrite: false });
const ICE = () => mat('#ffffff', { rough: 0.05, opacity: 0.45, transparent: true, depthWrite: false });
function straw(color, len, r = 0.0042, stripe = null) {
  const m = stripe ? mat('#ffffff', { map: TX(`straw:${color}:${stripe}`, 32, 128, (ctx, W, H) => { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.fillStyle = stripe; for (let y = -W; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + W); ctx.lineTo(W, y + W + 8); ctx.lineTo(0, y + 8); ctx.fill(); } }), rough: 0.5 }) : mat(color, { rough: 0.35 });
  return cyl(r, r, len, m, 10);
}
function filmTex(key, bg, fg, emoji, text) {
  return TX(`film:${key}`, 128, 128, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg; ctx.globalAlpha = 0.25; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc((i % 3 + 0.5) * W / 3, (Math.floor(i / 3) + 0.5) * H / 3, 9, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${H * 0.32}px ${FONT}`; ctx.fillText(emoji, W / 2, H * 0.42);
    ctx.font = `900 ${H * 0.13}px ${FONT}`; fitText(ctx, text, W / 2, H * 0.74, W * 0.7);
  });
}
// clear plastic cup: boba, iced coffee, smoothies, shakes...
export function clearCup({ stops, r0 = 0.032, r1 = 0.046, h = 0.15, fill = 0.86, ice = 0, pearls = 0, pearl = '#2b1a12', pearlOpacity = 1,
  top = 'flat', film = null, strawColor = '#222222', strawStripe = null, strawR = 0.0042, whipTop = false, garnish = null, opaque = false, drizzle = null, bits = null, seed = 1 }) {
  const g = new THREE.Group();
  g.add(lathe([[r0, 0], [r1, h]], CLEAR(), 32));
  g.add(at(cyl(r0, r0, 0.002, CLEAR(), 24), 0, 0.001, 0));
  g.add(at(rot(torus(r1, 0.0015, CLEAR(), 6, 36), PI / 2, 0, 0), 0, h, 0));
  const lh = h * fill;
  g.add(liquid(r0 * 0.96, r0 * 0.96 + (r1 - r0) * fill * 0.97, lh, stops, { opacity: opaque ? 1 : pearls ? 0.8 : 0.88 }));
  const rnd = seeded(seed);
  for (let i = 0; i < pearls; i++) {
    const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * r0 * 0.75;
    const p = sph(0.0062, mat(pearl, { rough: 0.15, clearcoat: 0.8, opacity: pearlOpacity, transparent: true }), 8, 6); p.renderOrder = 2;
    g.add(bite(at(p, Math.cos(a) * rr, 0.007 + Math.floor(i / 9) * 0.009 + rnd() * 0.003, Math.sin(a) * rr), i % 5));
  }
  for (let i = 0; i < ice; i++) {
    const c = rbox(0.019, 0.019, 0.019, 0.004, ICE()); c.rotation.set(rnd(), rnd() * 2, rnd());
    const a = i * 2.2, rr = r1 * 0.45;
    g.add(bite(at(c, Math.cos(a) * rr, lh - 0.012 - (i % 2) * 0.02, Math.sin(a) * rr), 9));
  }
  if (bits) for (let i = 0; i < bits.n; i++) { const b = rbox(0.009, 0.008, 0.009, 0.002, mat(bits.color, { rough: 0.4, opacity: 0.9, transparent: true })); b.renderOrder = 2; const a = rnd() * 7, rr = rnd() * r0 * 0.8; g.add(bite(at(b, Math.cos(a) * rr, 0.01 + rnd() * lh * 0.6, Math.sin(a) * rr), i % 5)); }
  if (drizzle) g.add(bite(at(tube([[-r1 * 0.6, 0, 0], [-r1 * 0.2, 0.003, r1 * 0.4], [r1 * 0.2, 0, -r1 * 0.4], [r1 * 0.6, 0.003, 0]], 0.0022, GL(drizzle), 20, 5), 0, lh + 0.002, 0), 0));
  if (whipTop) { const w = whip(r1 * 0.55); g.add(bite(at(w, 0, lh - 0.004, 0), 0)); }
  if (garnish) g.add(bite(at(garnish, 0, top === 'dome' ? h + 0.004 : lh, 0), 0));
  if (top === 'flat') {
    g.add(at(cyl(r1 * 1.03, r1 * 1.03, 0.006, mat('#f4f7f8', { rough: 0.2, opacity: 0.55, transparent: true }), 32), 0, h + 0.003, 0));
  } else if (top === 'dome') {
    g.add(at(lathe([[r1 * 1.03, 0], [r1 * 1.0, 0.012], [r1 * 0.8, 0.032], [r1 * 0.45, 0.045], [r1 * 0.2, 0.048], [r1 * 0.2, 0.052]], CLEAR(), 32), 0, h, 0));
  } else if (top === 'film') {
    const tex = film || filmTex('plain', '#ffffff', '#c08497', '🧋', 'BOBA BLISS');
    g.add(at(cyl(r1 * 1.02, r1 * 1.02, 0.0016, [CLEAR(), mat('#ffffff', { map: tex, rough: 0.4, opacity: 0.88, transparent: true }), CLEAR()], 32), 0, h + 0.001, 0));
  }
  if (strawColor) {
    const sl = h * 1.25;
    const s = straw(strawColor, sl, strawR, strawStripe); s.rotation.set(0.12, 0, -0.12);
    g.add(at(s, r1 * 0.2, h + (top === 'dome' ? 0.052 : 0) - sl * 0.5 + 0.06, 0));
  }
  return g;
}
function bobaFilm(key, bg, fg, emoji) { return filmTex(key, bg, fg, emoji, 'BOBA BLISS'); }

// paper hot cup with sleeve and lid (flat sip-lid or clear dome with toppings)
export function paperCup({ cup = '#fbfaf7', sleeve = '#a47148', ink = '#ffffff', logo = 'THE BEANERY', icon = '☕', lid = '#fbfaf7', dome = null, h = 0.13, r = 0.043, key = null }) {
  const g = new THREE.Group();
  const r0 = r * 0.72;
  g.add(lathe([[0.001, 0], [r0, 0], [r, h], [r * 0.96, h], [r0 * 0.96, 0.004], [0.001, 0.004]], mat(cup, { rough: 0.6 }), 32));
  if (sleeve) {
    const tex = TX(`sleeve:${key || logo}:${sleeve}:${ink}`, 512, 128, (ctx, W, H) => {
      ctx.fillStyle = sleeve; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const x of [0.25, 0.75]) { ctx.font = `${H * 0.42}px ${FONT}`; ctx.fillText(icon, W * x - W * 0.12, H * 0.52); ctx.font = `900 ${H * 0.22}px ${FONT}`; fitText(ctx, logo, W * x + W * 0.05, H * 0.52, W * 0.26); }
    });
    const ya = h * 0.3, yb = h * 0.68, ra = r0 + (r - r0) * 0.3, rb = r0 + (r - r0) * 0.68;
    g.add(lathe([[ra + 0.0018, ya], [rb + 0.0018, yb]], mat('#ffffff', { map: tex, rough: 0.85 }), 32));
  }
  const lm = mat(lid, { rough: 0.35 });
  if (!dome) {
    g.add(at(cyl(r * 1.05, r * 1.05, 0.007, lm, 32), 0, h + 0.0035, 0));
    g.add(at(cyl(r * 0.78, r * 0.95, 0.009, lm, 32), 0, h + 0.0115, 0));
    g.add(at(rbox(0.012, 0.002, 0.005, 0.001, mat('#1d1d1d')), 0, h + 0.0162, r * 0.6));
  } else {
    g.add(at(cyl(r * 1.05, r * 1.05, 0.006, lm, 32), 0, h + 0.003, 0));
    const w = whip(r * 0.6, dome.cream || '#fbf8f2'); g.add(bite(at(w, 0, h + 0.004, 0), 0));
    if (dome.drizzle) g.add(bite(at(tube([[-r * 0.5, 0, 0], [-r * 0.15, 0.012, r * 0.3], [r * 0.15, 0.022, -r * 0.3], [r * 0.4, 0.012, 0.004]], 0.0022, GL(dome.drizzle), 20, 5), 0, h + 0.012, 0), 0));
    if (dome.dust) for (let i = 0; i < 10; i++) g.add(bite(at(box(0.0025, 0.0012, 0.0025, mat(dome.dust, { rough: 0.8 })), Math.cos(i * 2.4) * r * 0.35 * ((i % 3) / 2 + 0.3), h + 0.026 - (i % 3) * 0.006, Math.sin(i * 2.4) * r * 0.35 * ((i % 3) / 2 + 0.3)), 0));
    if (dome.marsh) for (let i = 0; i < 5; i++) g.add(bite(at(rot(rbox(0.011, 0.009, 0.011, 0.003, mat('#fdf8f3', { rough: 0.7 })), i, i * 2, 0), Math.cos(i * 1.3) * r * 0.55, h + 0.012 + (i % 2) * 0.008, Math.sin(i * 1.3) * r * 0.55), 0));
    g.add(at(lathe([[r * 1.05, 0], [r * 1.02, 0.012], [r * 0.82, 0.033], [r * 0.45, 0.046], [r * 0.18, 0.05], [r * 0.18, 0.054]], CLEAR(), 32), 0, h + 0.002, 0));
  }
  return g;
}
// ceramic cup & saucer with latte art
function latteArt(key, crema, foam, kind) {
  return TX(`art:${key}`, 128, 128, (ctx, W, H) => {
    ctx.fillStyle = crema; ctx.fillRect(0, 0, W, H);
    const gr = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,30,10,0.35)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = foam;
    if (kind === 'heart') {
      ctx.beginPath(); ctx.moveTo(W / 2, H * 0.78); ctx.bezierCurveTo(W * 0.1, H * 0.5, W * 0.25, H * 0.18, W / 2, H * 0.36); ctx.bezierCurveTo(W * 0.75, H * 0.18, W * 0.9, H * 0.5, W / 2, H * 0.78); ctx.fill();
    } else if (kind === 'rosetta') {
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(W / 2, H * (0.25 + i * 0.09), W * (0.28 - i * 0.035), H * 0.045, 0, 0, PI); ctx.fill(); }
      ctx.fillRect(W / 2 - 2, H * 0.2, 4, H * 0.62);
    } else { ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.36, 0, 7); ctx.fill(); ctx.fillStyle = crema; ctx.globalAlpha = 0.5; for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.arc(W / 2 + Math.cos(i) * W * 0.18, H / 2 + Math.sin(i * 1.7) * H * 0.18, 2, 0, 7); ctx.fill(); } }
  });
}
export function cupSaucer({ cup = '#fbfaf7', crema = '#b97a45', foam = '#fbf3e6', art = 'heart', r = 0.042, h = 0.06, saucer = true, key = null }) {
  const g = new THREE.Group();
  let y0 = 0;
  if (saucer) { g.add(lathe([[0.001, 0], [0.05, 0], [0.072, 0.012], [0.07, 0.013], [0.048, 0.005], [0.001, 0.005]], MAT.ceramic(cup), 36)); y0 = 0.005; }
  const c = group(lathe([[0.001, 0], [r * 0.5, 0], [r * 0.6, 0.006], [r, h], [r * 0.94, h], [r * 0.56, 0.01], [0.001, 0.01]], MAT.ceramic(cup), 32));
  c.add(at(rot(torus(r * 0.36, 0.0055, MAT.ceramic(cup), 8, 18, PI * 1.2), 0, 0, -PI * 0.6), r * 0.96, h * 0.55, 0));
  const tex = latteArt(key || art + crema, crema, foam, art);
  c.add(at(topLiquid(r * 0.6, r * 0.92, h * 0.86, crema, mat('#ffffff', { map: tex, rough: 0.5 })), 0, 0.008, 0));
  c.position.y = y0;
  g.add(c);
  if (saucer) { const sp = group(at(box(0.07, 0.003, 0.008, MAT.metal('#d5d8dc', 0.25)), 0, 0, 0), at(sph(0.009, MAT.metal('#d5d8dc', 0.25), 12, 8), 0.04, 0, 0)); sp.children[1].scale.set(1.4, 0.3, 1); sp.rotation.y = -0.6; g.add(at(sp, 0.035, 0.014, 0.035)); }
  return g;
}
// terracotta kulhad (lassi, chai)
function kulhad(liq, topCol, specks) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.026, 0], [0.034, 0.03], [0.038, 0.075], [0.035, 0.076], [0.031, 0.03], [0.022, 0.006], [0.001, 0.006]], mat('#b0582c', { rough: 0.9, flat: true }), 18));
  const tex = speckTex(`lassi:${topCol}`, topCol, specks, 30, 2.2, 4);
  g.add(at(topLiquid(0.024, 0.034, 0.064, liq, mat('#ffffff', { map: tex, rough: 0.6 })), 0, 0.006, 0));
  return g;
}
function masonJar({ stops, slices = '#f6d743', strawColor = '#f4a7b9' }) {
  const g = new THREE.Group();
  const glass = mat('#eef7f4', { rough: 0.04, opacity: 0.28, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  g.add(lathe([[0.036, 0], [0.04, 0.01], [0.04, 0.13], [0.034, 0.145], [0.034, 0.16]], glass, 32));
  g.add(at(cyl(0.036, 0.036, 0.003, glass, 24), 0, 0.0015, 0));
  for (let i = 0; i < 3; i++) g.add(at(rot(torus(0.0345, 0.0016, glass, 5, 30), PI / 2, 0, 0), 0, 0.147 + i * 0.005, 0));
  g.add(at(rot(torus(0.03, 0.005, glass, 8, 18, PI), 0, 0, -PI / 2), 0.04, 0.08, 0));
  g.add(liquid(0.038, 0.035, 0.13, stops, { opacity: 0.75 }));
  const sm = mat('#ffffff', { transparent: true, map: TX(`lemon:${slices}`, 64, 64, (ctx, W, H) => { ctx.fillStyle = slices; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff9d8'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.42, 0, 7); ctx.fill(); ctx.strokeStyle = slices; ctx.lineWidth = 3; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + Math.cos(i * PI / 4) * W * 0.42, H / 2 + Math.sin(i * PI / 4) * H * 0.42); ctx.stroke(); } }), rough: 0.4 });
  [[0.012, 0.05, 0.2, 1.2], [-0.014, 0.09, -0.3, 0.9], [0.005, 0.12, 0.6, 1.4]].forEach(([x, y, rz, rx], i) => { const sl = cyl(0.02, 0.02, 0.004, [F(slices, 0.4), sm, sm], 16); sl.renderOrder = 2; g.add(bite(at(rot(sl, rx, 0, rz), x, y, (i - 1) * 0.01), 3 + i)); });
  for (let i = 0; i < 4; i++) { const c = rbox(0.02, 0.02, 0.02, 0.004, ICE()); c.rotation.set(i, i * 2, 0); g.add(bite(at(c, Math.cos(i * 1.6) * 0.016, 0.11 - (i % 2) * 0.02, Math.sin(i * 1.6) * 0.016), 9)); }
  for (let i = 0; i < 2; i++) { const l = sph(0.008, F('#3f9b3a', 0.45), 8, 6); l.scale.set(1.5, 0.2, 0.8); l.rotation.y = i * 1.5; g.add(bite(at(l, -0.01 + i * 0.012, 0.128, 0.01), 0)); }
  const s = straw(strawColor, 0.19, 0.0036, '#ffffff'); s.rotation.set(0.1, 0, -0.15); g.add(at(s, 0.012, 0.115, 0));
  return g;
}
// plastic cold-pressed juice bottle with a band label
function juiceBottle({ liquid: lc, label, labelColor, ink = '#ffffff', cap = '#2b2b2b', key }) {
  return bottle({ liquid: lc, cap, label, labelColor, labelText: ink, h: 0.2, r: 0.032, opacity: 0.35, key });
}
function smoothieGarnish(kind) {
  if (kind === 'strawberry') { const s = cone(0.011, 0.02, F('#c8102e', 0.4), 12); s.rotation.x = PI; return group(at(s, 0.012, 0.012, 0), at(cone(0.007, 0.004, F('#3f8f2a'), 6), 0.012, 0.024, 0)); }
  if (kind === 'kiwi') { const k = cyl(0.016, 0.016, 0.004, [F('#6b4a2a'), F('#7cbf3a', 0.4), F('#7cbf3a', 0.4)], 16); k.rotation.set(1.2, 0, 0.2); return group(at(k, 0.015, 0.012, 0)); }
  if (kind === 'mango') return group(at(rbox(0.014, 0.012, 0.014, 0.003, F('#f59e00', 0.4)), -0.01, 0.008, 0.004), at(rbox(0.012, 0.01, 0.012, 0.003, F('#f7b733', 0.4)), 0.01, 0.007, -0.006));
  return group(at(sph(0.006, GL('#2b2d6e'), 8, 6), 0, 0.006, 0), at(sph(0.006, GL('#2b2d6e'), 8, 6), 0.012, 0.006, 0.004), at(sph(0.007, GL('#8a1538'), 8, 6), -0.01, 0.007, -0.004));
}

// ------------------------------------------------------------------ empties
function emptyCoffeeCup() { const g = paperCup({ sleeve: null }); return g; }
function emptyPlasticCup() { const g = new THREE.Group(); g.add(lathe([[0.032, 0], [0.046, 0.15]], CLEAR(), 32), at(cyl(0.032, 0.032, 0.002, CLEAR(), 24), 0, 0.001, 0), at(cyl(0.047, 0.047, 0.006, mat('#f4f7f8', { rough: 0.2, opacity: 0.55, transparent: true }), 32), 0, 0.153, 0)); const s = straw('#222222', 0.18); s.rotation.set(0.12, 0, -0.12); g.add(at(s, 0.01, 0.12, 0)); return g; }
function emptyGlassBottle() { return bottle({ liquid: '#ffffff', cap: '#c9a86a', label: '', glass: true, opacity: 0.4, h: 0.21 }); }

// ------------------------------------------------------------------ definitions
const sip = (o) => ({ category: 'drink', rarity: 'common', ...o, use: { type: 'drink', ...o.use } });
const cafe = (restaurant, o) => sip({ stores: ['dashr'], restaurant, ...o });
const shop = (o) => sip({ stores: ['freshcart', 'dashr'], restaurant: 'nightowl', ...o });
const MILKTEA = [[0, '#8a5530'], [1, '#c4915e']];

defineItems([
  // ---------------------------------------------- The Beanery (coffee)
  cafe('beanery', { id: 'latte_vanilla', name: 'Vanilla Latte', price: 5.25, emoji: '☕', desc: 'Double shot, steamed milk, a whisper of Madagascar vanilla.', build: () => paperCup({}), use: { sips: 5, hot: true, needs: { thirst: 18, energy: 22, comfort: 4 }, buff: 'caffeinated', buffMin: 180, leftover: 'empty_coffee_cup', emoji: '☕' } }),
  cafe('beanery', { id: 'cappuccino', name: 'Cappuccino', price: 4.75, emoji: '☕', desc: 'Velvety microfoam with a latte-art heart. Sip before it fades.', build: () => cupSaucer({}), use: { sips: 4, hot: true, needs: { thirst: 12, energy: 24, comfort: 5 }, buff: 'caffeinated', buffMin: 180, emoji: '☕' } }),
  cafe('beanery', { id: 'mocha_whip', name: 'Mocha with Whip', price: 5.75, emoji: '🍫', desc: 'Espresso, dark chocolate, steamed milk and a mountain of whipped cream.', build: () => paperCup({ sleeve: '#5a3a22', dome: { drizzle: '#3b1d10' }, key: 'mocha' }), use: { sips: 5, hot: true, needs: { thirst: 16, energy: 20, fun: 5, comfort: 5 }, buff: 'caffeinated', buffMin: 160, emoji: '☕' } }),
  cafe('beanery', { id: 'iced_matcha_latte', name: 'Iced Matcha Latte', price: 5.95, emoji: '🍵', desc: 'Ceremonial-grade matcha poured over oat milk and ice.', build: () => clearCup({ stops: [[0, '#ece4cf'], [0.45, '#dfe3c0'], [0.6, '#6ea832'], [1, '#4f8f1f']], ice: 4, strawColor: '#3f7d2a', seed: 4 }), use: { sips: 5, needs: { thirst: 24, energy: 14 }, buff: 'calm', buffMin: 150, leftover: 'empty_plastic_cup', emoji: '🍵' } }),
  cafe('beanery', { id: 'iced_caramel_macchiato', name: 'Iced Caramel Macchiato', price: 5.75, emoji: '🧋', desc: 'Milk and ice, espresso floated on top, caramel crosshatch.', build: () => clearCup({ stops: [[0, '#efe3cc'], [0.62, '#dcc29b'], [0.76, '#6b3a18'], [1, '#3f1e0a']], ice: 4, drizzle: '#c9741c', strawColor: '#1d1d1d', seed: 5 }), use: { sips: 5, needs: { thirst: 22, energy: 22, fun: 3 }, buff: 'caffeinated', buffMin: 180, leftover: 'empty_plastic_cup', emoji: '🧊' } }),
  cafe('beanery', { id: 'pumpkin_spice_latte', name: 'Pumpkin Spice Latte', price: 6.25, season: 'autumn', rarity: 'uncommon', emoji: '🎃', desc: 'Sweater weather in a cup. Whipped cream, pumpkin spice dust.', build: () => paperCup({ sleeve: '#d9662b', icon: '🍂', logo: 'PSL SEASON', dome: { dust: '#a0521e' }, key: 'psl' }), use: { sips: 5, hot: true, needs: { thirst: 16, energy: 18, comfort: 10, fun: 4 }, buff: 'cozy', buffMin: 240, leftover: 'empty_coffee_cup', emoji: '🎃' } }),
  cafe('beanery', { id: 'hot_chocolate', name: 'Peppermint Hot Chocolate', price: 4.95, season: 'winter', rarity: 'uncommon', emoji: '❄️', desc: 'Rich cocoa, peppermint, whipped cream and mini marshmallows.', build: () => paperCup({ cup: '#c8102e', sleeve: '#1f6b3a', icon: '❄️', logo: 'COCOA', dome: { marsh: true, drizzle: '#3b1d10' }, key: 'cocoa' }), use: { sips: 5, hot: true, needs: { thirst: 16, comfort: 14, fun: 5 }, buff: 'cozy', buffMin: 240, leftover: 'empty_coffee_cup', emoji: '☕' } }),
  cafe('beanery', { id: 'sakura_latte', name: 'Iced Sakura Latte', price: 6.25, season: 'spring', rarity: 'uncommon', emoji: '🌸', desc: 'Cherry-blossom syrup, espresso and milk in soft pink layers.', build: () => clearCup({ stops: [[0, '#f07da0'], [0.5, '#f4b3c6'], [0.8, '#c9946c'], [1, '#9a5f38']], ice: 3, strawColor: '#f48fb1', seed: 6 }), use: { sips: 5, needs: { thirst: 22, energy: 16, comfort: 5 }, buff: 'caffeinated', buffMin: 150, leftover: 'empty_plastic_cup', emoji: '🌸' } }),
  // ---------------------------------------------- Boba Bliss
  cafe('bobabliss', { id: 'boba_milk_tea', name: 'Classic Pearl Milk Tea', price: 5.5, emoji: '🧋', desc: 'Black tea, creamy milk, chewy brown-sugar tapioca. The original.', build: () => clearCup({ stops: MILKTEA, pearls: 18, top: 'film', film: bobaFilm('classic', '#fbf3e6', '#a0522d', '🧋'), strawColor: '#1d1d1d', strawR: 0.006, seed: 7 }), use: { sips: 6, open: 'cup', sound: 'slurp', needs: { thirst: 28, fun: 6, energy: 6 }, buff: 'sugarRush', buffMin: 90, leftover: 'empty_plastic_cup', emoji: '🧋' } }),
  cafe('bobabliss', { id: 'boba_brown_sugar', name: 'Tiger Brown Sugar Milk', price: 6.25, rarity: 'uncommon', emoji: '🐯', desc: 'Fresh milk striped with caramelised brown-sugar syrup and warm pearls.', build: () => clearCup({ stops: [[0, '#4a1f08'], [0.3, '#8a4a1c'], [0.55, '#e0c49c'], [1, '#f3e6cf']], pearls: 22, top: 'film', film: bobaFilm('tiger', '#fbf3e6', '#6b3313', '🐯'), strawColor: '#6b3313', strawR: 0.006, seed: 8 }), use: { sips: 6, open: 'cup', sound: 'slurp', needs: { thirst: 26, fun: 8, comfort: 4 }, buff: 'sugarRush', buffMin: 120, leftover: 'empty_plastic_cup', emoji: '🧋' } }),
  cafe('bobabliss', { id: 'boba_taro', name: 'Taro Milk Tea', price: 5.95, emoji: '💜', desc: 'Nutty, vanilla-ish, unmistakably lavender. With pearls, obviously.', build: () => clearCup({ stops: [[0, '#8a63c4'], [1, '#a98bd8']], pearls: 18, top: 'film', film: bobaFilm('taro', '#f3ecfb', '#7b5ea7', '💜'), strawColor: '#7b5ea7', strawR: 0.006, seed: 9 }), use: { sips: 6, open: 'cup', sound: 'slurp', needs: { thirst: 26, fun: 6, comfort: 4 }, buff: 'sugarRush', buffMin: 90, leftover: 'empty_plastic_cup', emoji: '🧋' } }),
  cafe('bobabliss', { id: 'boba_matcha', name: 'Matcha Boba Latte', price: 6, emoji: '🍵', desc: 'Earthy matcha over milk and honey pearls. Calm, but chewy.', build: () => clearCup({ stops: [[0, '#e8e2cc'], [0.4, '#b9d48c'], [0.7, '#6ea832'], [1, '#4f8f1f']], pearls: 16, top: 'film', film: bobaFilm('matcha', '#eef6e3', '#4f8f2a', '🍵'), strawColor: '#4f8f2a', strawR: 0.006, seed: 10 }), use: { sips: 6, open: 'cup', sound: 'slurp', needs: { thirst: 26, energy: 10, fun: 4 }, buff: 'calm', buffMin: 120, leftover: 'empty_plastic_cup', emoji: '🧋' } }),
  cafe('bobabliss', { id: 'boba_strawberry', name: 'Strawberry Milk Boba', price: 5.95, emoji: '🍓', desc: 'Real strawberry purée swirled into milk, with jelly pearls.', build: () => clearCup({ stops: [[0, '#c8102e'], [0.3, '#e85a74'], [0.6, '#f2a2b4'], [1, '#f7c8d2']], pearls: 14, pearl: '#c8102e', pearlOpacity: 0.85, bits: { n: 5, color: '#d1202f' }, top: 'film', film: bobaFilm('straw', '#fde8ee', '#d1202f', '🍓'), strawColor: '#f48fb1', strawR: 0.006, seed: 11 }), use: { sips: 6, open: 'cup', sound: 'slurp', needs: { thirst: 26, fun: 8 }, buff: 'sugarRush', buffMin: 90, leftover: 'empty_plastic_cup', emoji: '🍓' } }),
  cafe('bobabliss', { id: 'boba_mango_passion', name: 'Mango Passion Fruit Tea', price: 5.75, emoji: '🥭', desc: 'Bright fruit tea loaded with popping boba that bursts with juice.', build: () => clearCup({ stops: [[0, '#e07a00'], [0.6, '#f29a10'], [1, '#f5b733']], pearls: 16, pearl: '#ff8c1a', pearlOpacity: 0.75, ice: 3, top: 'film', film: bobaFilm('mango', '#fff5dc', '#f08a00', '🥭'), strawColor: '#f08a00', strawR: 0.006, seed: 12 }), use: { sips: 6, open: 'cup', sound: 'slurp', needs: { thirst: 32, fun: 6 }, buff: 'sugarRush', buffMin: 90, leftover: 'empty_plastic_cup', emoji: '🥭' } }),
  // ---------------------------------------------- Blendz (smoothies & juice)
  cafe('blendz', { id: 'smoothie_strawberry_banana', name: 'Strawberry Banana Smoothie', price: 7.5, emoji: '🍓', tags: ['healthy'], desc: 'The crowd-pleaser: strawberries, banana, yogurt and a little honey.', build: () => clearCup({ stops: [[0, '#d63a4f'], [1, '#ef7a8a']], opaque: true, top: 'dome', garnish: smoothieGarnish('strawberry'), strawColor: '#ef476f', strawR: 0.005, fill: 0.95, seed: 13 }), use: { sips: 6, sound: 'slurp', needs: { thirst: 30, hunger: 10, energy: 6 }, buff: 'vitalized', buffMin: 200, leftover: 'empty_plastic_cup', emoji: '🥤' } }),
  cafe('blendz', { id: 'smoothie_green', name: 'Green Machine Smoothie', price: 7.95, emoji: '🥬', tags: ['healthy'], desc: 'Spinach, kale, kiwi, apple and ginger. Tastes better than it sounds.', build: () => clearCup({ stops: [[0, '#4f8f1f'], [1, '#7cb342']], opaque: true, top: 'dome', garnish: smoothieGarnish('kiwi'), strawColor: '#2d6a4f', strawR: 0.005, fill: 0.95, seed: 14 }), use: { sips: 6, sound: 'slurp', needs: { thirst: 30, hunger: 8, energy: 10 }, buff: 'vitalized', buffMin: 240, leftover: 'empty_plastic_cup', emoji: '🥤' } }),
  cafe('blendz', { id: 'smoothie_mango', name: 'Mango Tango Smoothie', price: 7.5, emoji: '🥭', tags: ['healthy'], desc: 'Mango, pineapple, coconut water and a squeeze of lime.', build: () => clearCup({ stops: [[0, '#f08a00'], [1, '#f7b733']], opaque: true, top: 'dome', garnish: smoothieGarnish('mango'), strawColor: '#f4a261', strawR: 0.005, fill: 0.95, seed: 15 }), use: { sips: 6, sound: 'slurp', needs: { thirst: 32, hunger: 8, fun: 4 }, buff: 'vitalized', buffMin: 200, leftover: 'empty_plastic_cup', emoji: '🥤' } }),
  cafe('blendz', { id: 'smoothie_berry_blast', name: 'Berry Blast Smoothie', price: 7.95, emoji: '🫐', tags: ['healthy'], desc: 'Blueberries, raspberries, açaí and banana. Deep purple, deeply good.', build: () => clearCup({ stops: [[0, '#4a1f5c'], [1, '#7b2d6e']], opaque: true, top: 'dome', garnish: smoothieGarnish('berry'), strawColor: '#9d4edd', strawR: 0.005, fill: 0.95, seed: 16 }), use: { sips: 6, sound: 'slurp', needs: { thirst: 30, hunger: 8, energy: 8 }, buff: 'vitalized', buffMin: 220, leftover: 'empty_plastic_cup', emoji: '🥤' } }),
  cafe('blendz', { id: 'juice_orange_fresh', name: 'Fresh-Pressed OJ', price: 5.5, emoji: '🍊', tags: ['healthy'], desc: 'Cold-pressed this morning. Pulp: yes.', build: () => juiceBottle({ liquid: '#f59e00', label: 'SUNRISE OJ', labelColor: '#f77f00', key: 'oj' }), use: { sips: 5, open: 'bottle', needs: { thirst: 32, energy: 6 }, buff: 'vitalized', buffMin: 150, leftover: 'empty_bottle', emoji: '🍊' } }),
  cafe('blendz', { id: 'juice_green_cold', name: 'Cold-Pressed Green Juice', price: 8.5, emoji: '🥒', tags: ['healthy'], desc: 'Celery, cucumber, spinach, lemon. Wellness in a bottle.', build: () => juiceBottle({ liquid: '#6ea832', label: 'GREEN 01', labelColor: '#2d6a4f', key: 'greenjuice' }), use: { sips: 5, open: 'bottle', needs: { thirst: 30, energy: 8 }, buff: 'vitalized', buffMin: 240, leftover: 'empty_bottle', emoji: '🥒' } }),
  cafe('blendz', { id: 'lemonade_fresh', name: 'Fresh Strawberry Lemonade', price: 4.95, season: 'summer', emoji: '🍋', desc: 'Hand-squeezed lemons, strawberry swirl, mint, lots of ice. In a mason jar.', build: () => masonJar({ stops: [[0, '#e0405a'], [0.3, '#f2c230'], [1, '#f6d84a']] }), use: { sips: 5, needs: { thirst: 40, fun: 5 }, buff: 'sugarRush', buffMin: 90, leftover: 'empty_glass_bottle', emoji: '🍋' } }),
  // ---------------------------------------------- restaurant drinks
  sip({ id: 'milkshake_chocolate', name: 'Chocolate Milkshake', price: 6.5, stores: ['grubhop'], restaurant: 'smashbros', emoji: '🥤', desc: 'Hand-spun, thick enough to stand a straw in. Whip and a cherry.', build: () => clearCup({ stops: [[0, '#4a2817'], [1, '#6b3e26']], opaque: true, top: 'dome', whipTop: true, garnish: group(at(sph(0.009, GL('#c1121f'), 14, 10), 0, 0.03, 0)), strawColor: '#d62828', strawStripe: '#ffffff', strawR: 0.005, fill: 0.92, seed: 17 }), use: { sips: 6, sound: 'slurp', needs: { thirst: 18, hunger: 12, fun: 10 }, buff: 'treatYoself', buffMin: 120, leftover: 'empty_plastic_cup', emoji: '🥤' } }),
  sip({ id: 'milkshake_strawberry', name: 'Strawberry Milkshake', price: 6.95, stores: ['dashr'], restaurant: 'scoops', emoji: '🍓', desc: 'Strawberry ice cream blended with real berries. Pink perfection.', build: () => clearCup({ stops: [[0, '#f27a8c'], [1, '#f8b6c4']], opaque: true, top: 'dome', whipTop: true, garnish: smoothieGarnish('strawberry'), strawColor: '#f48fb1', strawStripe: '#ffffff', strawR: 0.005, fill: 0.92, seed: 18 }), use: { sips: 6, sound: 'slurp', needs: { thirst: 18, hunger: 12, fun: 10 }, buff: 'treatYoself', buffMin: 120, leftover: 'empty_plastic_cup', emoji: '🥤' } }),
  sip({ id: 'mango_lassi', name: 'Mango Lassi', price: 4.5, stores: ['grubhop'], restaurant: 'curryhouse', emoji: '🥭', desc: 'Alphonso mango, yogurt, cardamom, served in a clay kulhad.', build: () => kulhad('#f08a00', '#f29a10', ['#3f8f2a', '#c0392b', '#ffd36b']), use: { sips: 4, needs: { thirst: 26, hunger: 6, comfort: 4 }, buff: 'vitalized', buffMin: 120, emoji: '🥭' } }),
  sip({ id: 'thai_iced_tea', name: 'Thai Iced Tea', price: 4.75, stores: ['grubhop'], restaurant: 'wokstar', emoji: '🧡', desc: 'Strong spiced tea, sweetened condensed milk, a cascade of cream.', build: () => clearCup({ stops: [[0, '#c43c08'], [0.6, '#e0601a'], [0.8, '#ecb486'], [1, '#f7e3cc']], ice: 4, strawColor: '#d9541a', seed: 19 }), use: { sips: 5, needs: { thirst: 30, energy: 10 }, buff: 'caffeinated', buffMin: 120, leftover: 'empty_plastic_cup', emoji: '🧋' } }),
  sip({ id: 'horchata', name: 'Horchata', price: 3.95, stores: ['grubhop'], restaurant: 'tacoloco', emoji: '🥛', desc: 'Creamy rice-cinnamon cooler. Put out the salsa fire.', build: () => clearCup({ stops: [[0, '#efe2c8'], [1, '#f8f1e2']], ice: 4, opaque: true, strawColor: '#2a9d8f', seed: 20, drizzle: '#a0632a' }), use: { sips: 5, needs: { thirst: 34, comfort: 4 }, leftover: 'empty_plastic_cup', emoji: '🥛' } }),
  // ---------------------------------------------- cans & bottles (FreshCart / Night Owl)
  shop({ id: 'soda_orange', name: 'Sunny Orange Soda', price: 1.99, emoji: '🍊', desc: 'Neon-orange, sticky-sweet, extremely bubbly.', build: () => can({ color: '#f77f00', color2: '#fff3b0', label: 'SUNNY', key: 'sunny' }), use: { sips: 5, open: 'can', fizzy: true, needs: { thirst: 26, fun: 4 }, buff: 'sugarRush', buffMin: 60, leftover: 'empty_can' } }),
  shop({ id: 'soda_root_beer', name: 'Grizzly Root Beer', price: 1.99, emoji: '🐻', desc: 'Creamy vanilla-sassafras root beer. Bear approved.', build: () => can({ color: '#5a2d14', color2: '#f2c14e', label: 'GRIZZLY', key: 'grizzly' }), use: { sips: 5, open: 'can', fizzy: true, needs: { thirst: 26, fun: 4, comfort: 2 }, buff: 'sugarRush', buffMin: 60, leftover: 'empty_can' } }),
  shop({ id: 'energy_blitz', name: 'BLITZ Energy', price: 3.29, emoji: '⚡', desc: '160 mg of caffeine and a flavor called "Voltage". Use responsibly.', build: () => can({ color: '#111111', color2: '#7fff00', label: 'BLITZ', sub: 'ENERGY', h: 0.155, r: 0.029, key: 'blitz' }), use: { sips: 5, open: 'can', fizzy: true, needs: { thirst: 18, energy: 38, fun: 3 }, buff: 'caffeinated', buffMin: 240, leftover: 'empty_can', emoji: '⚡' } }),
  shop({ id: 'energy_blitz_zero', name: 'BLITZ Zero Sugar', price: 3.29, emoji: '💗', desc: 'All the zap, none of the sugar. Tastes like a pink highlighter.', build: () => can({ color: '#f8f8f8', color2: '#ff2e88', label: 'BLITZ', sub: 'ZERO SUGAR', h: 0.155, r: 0.029, key: 'blitzzero' }), use: { sips: 5, open: 'can', fizzy: true, needs: { thirst: 18, energy: 34 }, buff: 'caffeinated', buffMin: 220, leftover: 'empty_can', emoji: '⚡' } }),
  shop({ id: 'sparkling_lemon', name: 'Spritz Lemon Sparkling Water', price: 1.49, emoji: '🍋', tags: ['healthy'], desc: 'Zero calories, all fizz, a lemony whisper.', build: () => can({ color: '#fbe38e', color2: '#2b7a3d', label: 'SPRITZ', sub: 'LEMON', h: 0.15, r: 0.029, key: 'spritzlemon' }), use: { sips: 5, open: 'can', fizzy: true, needs: { thirst: 34 }, leftover: 'empty_can', emoji: '🫧' } }),
  shop({ id: 'sparkling_grapefruit', name: 'Spritz Grapefruit Sparkling Water', price: 1.49, emoji: '🍊', tags: ['healthy'], desc: 'Pink grapefruit bubbles for the discerning hydrator.', build: () => can({ color: '#f7a8a8', color2: '#8a1538', label: 'SPRITZ', sub: 'GRAPEFRUIT', h: 0.15, r: 0.029, key: 'spritzgf' }), use: { sips: 5, open: 'can', fizzy: true, needs: { thirst: 34 }, leftover: 'empty_can', emoji: '🫧' } }),
  shop({ id: 'kombucha_ginger', name: 'Ginger Kombucha', price: 3.99, emoji: '🫚', tags: ['healthy', 'glass'], desc: 'Raw, living, tangy. Your gut sends its regards.', build: () => bottle({ liquid: '#c27c2c', cap: '#1d1d1d', label: 'BUCHA', labelColor: '#f4e3c1', labelText: '#7a3e14', glass: true, opacity: 0.45, h: 0.21, key: 'bucha' }), use: { sips: 5, open: 'bottle', fizzy: true, needs: { thirst: 28, energy: 4 }, buff: 'vitalized', buffMin: 150, leftover: 'empty_glass_bottle', emoji: '🫚' } }),
  shop({ id: 'iced_tea_peach', name: 'Peach Iced Tea', price: 2.29, emoji: '🍑', desc: 'Brewed black tea and ripe peach. Porch-swing energy.', build: () => bottle({ liquid: '#d9802e', cap: '#f4a261', label: 'PEACH TEA', labelColor: '#ffd6a5', labelText: '#9c4a1a', h: 0.22, key: 'peachtea' }), use: { sips: 5, open: 'bottle', needs: { thirst: 36, energy: 4 }, buff: 'calm', buffMin: 60, leftover: 'empty_bottle', emoji: '🍑' } }),
  // ---------------------------------------------- empties
  { id: 'empty_coffee_cup', name: 'Empty Coffee Cup', category: 'misc', price: 0, hidden: true, stores: [], tags: ['trash'], desc: 'A lipstick-free rim and a lingering aroma.', build: emptyCoffeeCup },
  { id: 'empty_plastic_cup', name: 'Empty Plastic Cup', category: 'misc', price: 0, hidden: true, stores: [], tags: ['trash', 'recyclable'], desc: 'Rinse and recycle. Leftover ice optional.', build: emptyPlasticCup },
  { id: 'empty_glass_bottle', name: 'Empty Glass Bottle', category: 'misc', price: 0, hidden: true, stores: [], tags: ['trash', 'recyclable', 'glass'], desc: 'Recycle it for the deposit.', build: emptyGlassBottle },
]);

void rot; void sph; void cone; void box; void citrusWedge;
export { clearCup as bobaCup, kulhad };
