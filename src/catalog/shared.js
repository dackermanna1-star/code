// Shared parametric models for catalogue items. All sizes in meters,
// origin at bottom-center, front facing +Z (wall items: back at z=0 facing +Z).
import * as THREE from 'three';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, lathe, tube, at, rot, group, plane, decal, FONT, extrude, drawLabel, fitText, roundRect, labelTexture } from '../items/kit.js';
import { seeded } from '../core/utils.js';
import { canvas, toTexture, cached } from '../core/textures.js';

// ------------------------------------------------------------------ drinks
export function can({ color = '#e63946', color2 = '#ffffff', label = 'FIZZ', sub = '', h = 0.122, r = 0.033, key = null }) {
  const tex = labelTexture(`can:${key || label}:${color}:${color2}`, 256, 256, (ctx, w, hh) => {
    const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, color); g.addColorStop(1, shadeHex(color, 0.75));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = color2; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(w * 0.75, hh * 0.3, w * 0.35, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = color2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${hh * 0.2}px ${FONT}`;
    ctx.save(); ctx.translate(w * 0.25, hh * 0.5); ctx.rotate(-Math.PI / 2); fitText(ctx, label, 0, 0, hh * 0.85); ctx.restore();
    ctx.save(); ctx.translate(w * 0.75, hh * 0.5); ctx.rotate(-Math.PI / 2); fitText(ctx, label, 0, 0, hh * 0.85); ctx.restore();
    if (sub) { ctx.font = `600 ${hh * 0.07}px ${FONT}`; ctx.fillText(sub, w * 0.5, hh * 0.9); }
  });
  const body = cyl(r, r, h * 0.86, mat('#ffffff', { map: tex, rough: 0.25, metal: 0.6 }), 32);
  const g = group(at(body, 0, h * 0.5, 0));
  const alu = mat('#d7dadf', { rough: 0.25, metal: 1 });
  g.add(at(cyl(r * 0.82, r, h * 0.07, alu, 32), 0, h * 0.965, 0));
  g.add(at(cyl(r, r * 0.85, h * 0.07, alu, 32), 0, h * 0.035, 0));
  const tab = rbox(r * 0.5, 0.002, r * 0.3, 0.001, alu); tab.name = 'tab'; at(tab, 0, h + 0.001, r * 0.2); g.add(tab);
  return g;
}

export function bottle({ liquid = '#bfe6ff', cap = '#2a9d8f', label = 'AQUA', labelColor = '#ffffff', labelText = '#1d3557', h = 0.22, r = 0.034, glass = false, opacity = 0.35, key = null }) {
  const prof = [[0.001, 0], [r * 0.9, 0], [r, h * 0.05], [r, h * 0.62], [r * 0.85, h * 0.75], [r * 0.38, h * 0.88], [r * 0.36, h * 0.95], [0.001, h * 0.95]];
  const shell = lathe(prof, mat(glass ? '#e7f3ef' : '#ffffff', { rough: 0.05, opacity, transparent: true, envInt: 1.2 }), 32);
  const g = group(shell);
  const liq = lathe([[0.001, 0.004], [r * 0.92, 0.004], [r * 0.95, h * 0.05], [r * 0.95, h * 0.6], [0.001, h * 0.6]], mat(liquid, { rough: 0.1, opacity: 0.85, transparent: true }), 24);
  liq.userData.liquid = true; liq.position.y = 0.002;
  g.add(liq);
  const capM = cyl(r * 0.4, r * 0.4, h * 0.07, mat(cap, { rough: 0.4 }), 20); capM.name = 'cap'; at(capM, 0, h * 0.98, 0); g.add(capM);
  if (label) {
    const tex = labelTexture(`bottle:${key || label}:${labelColor}`, 256, 96, (ctx, w, hh) => { ctx.fillStyle = labelColor; ctx.fillRect(0, 0, w, hh); ctx.fillStyle = labelText; ctx.font = `900 ${hh * 0.5}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, label, w * 0.25, hh / 2, w * 0.45); fitText(ctx, label, w * 0.75, hh / 2, w * 0.45); });
    g.add(at(cyl(r * 1.01, r * 1.01, h * 0.22, mat('#fff', { map: tex, rough: 0.6 }), 32, undefined, true), 0, h * 0.35, 0));
  }
  return g;
}

export function takeawayCup({ color = '#ffffff', sleeve = '#a47148', lid = '#ffffff', liquid = '#6f4e37', h = 0.15, r = 0.045, logo = '☕', straw = null, clear = false, pearls = false, key = null }) {
  const g = new THREE.Group();
  const prof = [[0.001, 0], [r * 0.72, 0], [r, h], [0.001, h]];
  if (clear) {
    g.add(lathe([[r * 0.72, 0], [r, h]], mat('#f0f6f7', { rough: 0.05, opacity: 0.3, transparent: true, side: THREE.DoubleSide }), 32));
    const liq = lathe([[0.001, 0.003], [r * 0.7, 0.003], [r * 0.95, h * 0.9], [0.001, h * 0.9]], mat(liquid, { rough: 0.3, opacity: 0.92, transparent: true }), 24);
    liq.userData.liquid = true; g.add(liq);
    if (pearls) for (let i = 0; i < 14; i++) { const a = i * 2.4; g.add(at(sph(0.007, mat('#2b1a12', { rough: 0.2 }), 8, 6), Math.cos(a) * r * 0.45 * (0.4 + (i % 3) * 0.3), 0.01 + (i % 4) * 0.008, Math.sin(a) * r * 0.45 * (0.4 + (i % 3) * 0.3))); }
  } else {
    g.add(lathe(prof, mat(color, { rough: 0.6 }), 32));
    const liq = cyl(r * 0.9, r * 0.9, 0.002, mat(liquid, { rough: 0.2 }), 20); liq.userData.liquid = true; at(liq, 0, h * 0.9, 0); liq.visible = false; g.add(liq);
    if (sleeve) {
      const tex = labelTexture(`sleeve:${key || logo}:${sleeve}`, 256, 64, (ctx, w, hh) => { ctx.fillStyle = sleeve; ctx.fillRect(0, 0, w, hh); ctx.fillStyle = '#fff'; ctx.font = `${hh * 0.6}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(logo, w * 0.25, hh / 2); ctx.fillText(logo, w * 0.75, hh / 2); });
      g.add(at(cyl(r * 0.94, r * 0.84, h * 0.35, mat('#fff', { map: tex, rough: 0.9 }), 32, undefined, true), 0, h * 0.45, 0));
    }
  }
  g.add(at(cyl(r * 1.02, r * 1.02, 0.012, mat(lid, { rough: 0.4 }), 32), 0, h + 0.004, 0));
  g.add(at(cyl(r * 0.6, r * 0.9, 0.012, mat(lid, { rough: 0.4 }), 32), 0, h + 0.014, 0));
  if (straw) g.add(at(rot(cyl(0.004, 0.004, h * 0.9, mat(straw, { rough: 0.3 }), 8), 0.12, 0, 0.08), 0.01, h + 0.02, 0));
  return g;
}

export function mug({ color = '#f4f1de', liquid = '#5a3a22', h = 0.095, r = 0.04, foam = null }) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [r * 0.95, 0], [r, h], [r * 0.92, h], [r * 0.88, 0.008], [0.001, 0.008]], MAT.ceramic(color), 32));
  g.add(at(rot(torus(r * 0.48, 0.007, MAT.ceramic(color), 8, 20, Math.PI), 0, 0, -Math.PI / 2), r + 0.004, h * 0.52, 0));
  const lgeo = new THREE.CylinderGeometry(r * 0.88, r * 0.88, h * 0.72, 24); lgeo.translate(0, h * 0.36, 0);
  const liq = new THREE.Mesh(lgeo, mat(liquid, { rough: 0.15 })); liq.position.y = 0.01; liq.userData.liquid = true;
  g.add(liq);
  if (foam) { const f = cyl(r * 0.87, r * 0.87, 0.006, mat(foam, { rough: 0.8 }), 24); f.userData.bite = 0; at(f, 0, h * 0.86, 0); g.add(f); }
  return g;
}

export function glassTumbler({ liquid = '#ffb703', h = 0.12, r = 0.035, ice = true, garnish = null }) {
  const g = new THREE.Group();
  g.add(lathe([[r * 0.85, 0], [r, h]], mat('#eef7f8', { rough: 0.03, opacity: 0.28, transparent: true, side: THREE.DoubleSide }), 32));
  g.add(at(cyl(r * 0.85, r * 0.85, 0.006, mat('#eef7f8', { rough: 0.03, opacity: 0.4, transparent: true }), 24), 0, 0.003, 0));
  const liq = lathe([[0.001, 0.006], [r * 0.84, 0.006], [r * 0.96, h * 0.82], [0.001, h * 0.82]], mat(liquid, { rough: 0.15, opacity: 0.85, transparent: true }), 24);
  liq.userData.liquid = true; g.add(liq);
  if (ice) for (let i = 0; i < 3; i++) g.add(at(rot(rbox(0.018, 0.018, 0.018, 0.004, mat('#ffffff', { rough: 0.05, opacity: 0.5, transparent: true })), i, i * 2, 0), Math.cos(i * 2) * r * 0.4, h * 0.7, Math.sin(i * 2) * r * 0.4));
  if (garnish) g.add(at(rot(cyl(r * 0.6, r * 0.6, 0.004, mat(garnish, { rough: 0.5 }), 16), 0, 0, 1.2), r * 0.9, h, 0));
  return g;
}

// ------------------------------------------------------------------ food
export function plate({ r = 0.12, color = '#fbfaf7' } = {}) {
  return lathe([[0.001, 0], [r * 0.6, 0], [r * 0.65, 0.008], [r, 0.02], [r * 0.98, 0.022], [r * 0.62, 0.012], [0.001, 0.012]], MAT.ceramic(color), 40);
}
export function bowl({ r = 0.085, h = 0.06, color = '#fbfaf7', contents = null, toppings = [] } = {}) {
  const g = group(lathe([[0.001, 0], [r * 0.5, 0], [r * 0.95, h * 0.8], [r, h], [r * 0.94, h], [r * 0.88, h * 0.8], [r * 0.45, 0.008], [0.001, 0.008]], MAT.ceramic(color), 40));
  if (contents) {
    const c = cyl(r * 0.88, r * 0.6, h * 0.6, mat(contents, { rough: 0.5 }), 32); at(c, 0, h * 0.5, 0); c.userData.bite = 9; g.add(c);
    toppings.forEach(([col, n, size, kind], ti) => {
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + ti, rr = r * 0.55 * Math.sqrt((i + 1) / n);
        const t = kind === 'disc' ? cyl(size, size, size * 0.3, mat(col, { rough: 0.6 }), 12) : kind === 'box' ? rbox(size, size * 0.5, size, size * 0.2, mat(col, { rough: 0.6 })) : sph(size, mat(col, { rough: 0.5 }), 10, 8);
        at(t, Math.cos(a) * rr, h * 0.82, Math.sin(a) * rr); t.userData.bite = i % 4; g.add(t);
      }
    });
  }
  return g;
}
export function burger({ bun = '#d4924a', patty = '#5a3320', cheese = '#ffc93c', lettuce = '#6aa84f', tomato = '#d62828', double = false } = {}) {
  const g = new THREE.Group();
  let y = 0;
  const add = (m, hh) => { at(m, 0, y + hh / 2, 0); g.add(m); y += hh; return m; };
  add(cyl(0.055, 0.05, 0.022, mat(bun, { rough: 0.6 }), 28), 0.022).userData.bite = 3;
  const layers = double ? 2 : 1;
  for (let i = 0; i < layers; i++) {
    add(cyl(0.058, 0.058, 0.018, mat(patty, { rough: 0.85 }), 28), 0.018).userData.bite = 2;
    const ch = rbox(0.12, 0.004, 0.12, 0.002, mat(cheese, { rough: 0.4 })); ch.rotation.y = 0.6; add(ch, 0.004).userData.bite = 2;
  }
  add(cyl(0.06, 0.06, 0.006, mat(lettuce, { rough: 0.7 }), 12), 0.006).userData.bite = 1;
  add(cyl(0.048, 0.048, 0.008, mat(tomato, { rough: 0.4 }), 20), 0.008).userData.bite = 1;
  const top = lathe([[0.001, 0], [0.055, 0], [0.057, 0.008], [0.05, 0.022], [0.03, 0.033], [0.001, 0.035]], mat(bun, { rough: 0.5 }), 28);
  top.userData.bite = 0; at(top, 0, y, 0); g.add(top);
  for (let i = 0; i < 9; i++) { const a = i * 2.1; const s = sph(0.003, mat('#f5ebd3', { rough: 0.6 }), 6, 4); s.scale.y = 0.4; s.userData.bite = 0; at(s, Math.cos(a) * 0.03 * (i % 3 + 1) / 2, y + 0.033 - (i % 3) * 0.004, Math.sin(a) * 0.03 * (i % 3 + 1) / 2); g.add(s); }
  return g;
}
export function pizzaSlice({ sauce = '#c1121f', cheese = '#ffd166', crust = '#d4924a', toppings = '#9d0208', n = 4 } = {}) {
  const g = new THREE.Group();
  const shape = [[0, 0], [0.075, 0.16], [-0.075, 0.16]];
  const base = extrude(shape, 0.012, mat(cheese, { rough: 0.45 }), 0.002); base.rotation.x = -Math.PI / 2; at(base, 0, 0.008, 0.07); base.userData.bite = 1; g.add(base);
  const cr = rot(cyl(0.012, 0.012, 0.155, mat(crust, { rough: 0.7 }), 12), 0, 0, Math.PI / 2); at(cr, 0, 0.012, -0.09); cr.userData.bite = 3; g.add(cr);
  for (let i = 0; i < n; i++) { const p = cyl(0.012, 0.012, 0.004, mat(toppings, { rough: 0.5 }), 14); p.userData.bite = i < 2 ? 0 : 2; at(p, (i % 2 ? 1 : -1) * 0.02, 0.016, 0.03 - i * 0.03); g.add(p); }
  void sauce;
  return g;
}
export function foodBox({ w = 0.14, h = 0.09, d = 0.1, color = '#ffffff', print = '#c1121f', label = '' }) {
  return labelBox(w, h, d, mat(color, { rough: 0.8 }), `foodbox:${label}:${print}`, (ctx, W, H) => drawLabel(ctx, W, H, { bg: color, fg: print, accent: print, title: label, stripe: false }), { round: 0.004 });
}
export function takeoutPail({ color = '#ffffff', print = '#c1121f', label = '' }) {
  const g = new THREE.Group();
  const tex = labelTexture(`pail:${label}:${print}`, 256, 128, (ctx, W, H) => { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.fillStyle = print; ctx.font = `900 ${H * 0.35}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, label, W * 0.25, H / 2, W * 0.4); fitText(ctx, label, W * 0.75, H / 2, W * 0.4); });
  g.add(lathe([[0.001, 0], [0.045, 0], [0.06, 0.1], [0.001, 0.1]], mat('#fff', { map: tex, rough: 0.8 }), 4));
  g.children[0].rotation.y = Math.PI / 4;
  g.add(at(rot(torus(0.04, 0.002, mat('#888', { metal: 1, rough: 0.3 }), 6, 20, Math.PI), 0, Math.PI / 2, 0), 0, 0.1, 0));
  return g;
}
export function fruit({ color = '#c1121f', r = 0.038, stem = true, squash = 0.92 }) {
  const g = new THREE.Group();
  const f = sph(r, mat(color, { rough: 0.35, clearcoat: 0.5 }), 24, 16); f.scale.y = squash; at(f, 0, r * squash, 0); g.add(f);
  if (stem) g.add(at(cyl(0.002, 0.002, 0.018, mat('#5a3e2b'), 6), 0, r * squash * 2 + 0.006, 0));
  return g;
}
export function banana() {
  const g = new THREE.Group();
  const curve = [[-0.08, 0.02, 0], [-0.04, 0.008, 0], [0, 0.005, 0], [0.04, 0.008, 0], [0.08, 0.025, 0]];
  g.add(tube(curve, 0.016, mat('#ffd60a', { rough: 0.5 }), 20, 10));
  g.add(at(cyl(0.004, 0.006, 0.02, mat('#5a4a2a'), 6), 0.088, 0.03, 0).rotateZ(-0.6));
  return g;
}
export function wrapBar({ color = '#e9c46a', print = '#264653', label = 'BAR', w = 0.13, h = 0.018, d = 0.04 }) {
  return labelBox(w, h, d, mat(color, { rough: 0.3, metal: 0.3 }), `bar:${label}:${color}`, (ctx, W, H) => drawLabel(ctx, W, H, { bg: color, fg: print, accent: print, title: label, stripe: false, titleSize: 0.3 }), { th: 80 });
}

// ------------------------------------------------------------------ groceries & product packaging
export function carton({ color = '#ffffff', accent = '#1d70b8', label = 'MILK', w = 0.075, h = 0.2 }) {
  const g = new THREE.Group();
  const body = labelBox(w, h * 0.8, w, mat(color, { rough: 0.7 }), `carton:${label}:${accent}`, (ctx, W, H) => drawLabel(ctx, W, H, { bg: color, fg: accent, accent, title: label, sub: 'FRESH · 1L' }), { back: true, th: 320 });
  at(body, 0, h * 0.4, 0); g.add(body);
  const roof = extrude([[-w / 2, 0], [w / 2, 0], [0, h * 0.18]], w, mat(color, { rough: 0.7 }), 0.001); at(roof, 0, h * 0.8, 0); roof.rotation.y = Math.PI / 2; g.add(roof);
  g.add(at(cyl(0.012, 0.012, 0.012, mat(accent, { rough: 0.4 }), 12), 0.01, h * 0.86, 0.02));
  return g;
}
export function productBox({ w = 0.12, h = 0.16, d = 0.06, color = '#ffffff', accent = '#e63946', label = 'PRODUCT', sub = '', emoji = '', pattern = null, round = 0 }) {
  return labelBox(w, h, d, mat(color, { rough: 0.6 }), `pbox:${label}:${color}:${accent}:${sub}`, (ctx, W, H) => drawLabel(ctx, W, H, { bg: color, fg: accent, accent, title: label, sub, emoji, pattern }), { th: Math.round(256 * h / w), round: round || undefined });
}
export function jar({ color = '#f4a261', lid = '#2b2b2b', label = 'JAM', h = 0.1, r = 0.04, glass = true, fill = null }) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [r, 0], [r, h * 0.85], [r * 0.85, h * 0.92], [0.001, h * 0.92]], glass ? mat('#eef6f7', { rough: 0.05, opacity: 0.35, transparent: true }) : MAT.ceramic(color), 28));
  if (glass) { const f = cyl(r * 0.94, r * 0.94, h * 0.7, mat(fill || color, { rough: 0.4 }), 24); f.userData.liquid = true; at(f, 0, h * 0.36, 0); g.add(f); }
  g.add(at(cyl(r * 0.88, r * 0.88, h * 0.12, mat(lid, { rough: 0.4, metal: 0.3 }), 28), 0, h * 0.97, 0));
  if (label) { const tex = labelTexture(`jar:${label}:${color}`, 256, 96, (ctx, W, H) => drawLabel(ctx, W, H, { bg: '#fffaf0', fg: '#333', accent: color, title: label, stripe: false, titleSize: 0.3 })); g.add(at(cyl(r * 1.01, r * 1.01, h * 0.35, mat('#fff', { map: tex, rough: 0.7 }), 28, undefined, true), 0, h * 0.42, 0)); }
  return g;
}
export function pumpBottle({ color = '#f2e9e4', liquid = null, pump = '#222222', label = 'SOAP', h = 0.18, r = 0.035, accent = '#6d6875' }) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [r, 0], [r * 1.02, h * 0.7], [r * 0.6, h * 0.82], [r * 0.3, h * 0.85], [0.001, h * 0.85]], mat(color, { rough: 0.15, clearcoat: 0.6, opacity: liquid ? 0.75 : 1, transparent: !!liquid }), 32));
  g.add(at(cyl(r * 0.25, r * 0.25, h * 0.12, mat(pump, { rough: 0.3 }), 16), 0, h * 0.9, 0));
  g.add(at(rbox(r * 0.9, h * 0.04, r * 0.4, 0.004, mat(pump, { rough: 0.3 })), r * 0.3, h * 0.98, 0));
  if (label) { const tex = labelTexture(`pump:${label}:${color}:${accent}`, 256, 128, (ctx, W, H) => { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.fillStyle = accent; ctx.font = `700 ${H * 0.28}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, label, W * 0.25, H / 2, W * 0.42); fitText(ctx, label, W * 0.75, H / 2, W * 0.42); }); g.add(at(cyl(r * 1.025, r * 1.025, h * 0.3, mat('#fff', { map: tex, rough: 0.4 }), 32, undefined, true), 0, h * 0.35, 0)); }
  return g;
}
export function squeezeTube({ color = '#ffffff', cap = '#2a9d8f', label = 'PASTE', accent = '#2a9d8f', len = 0.17 }) {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push([t * len, 0]); }
  const body = rbox(len, 0.03, 0.045, 0.014, mat(color, { rough: 0.3, clearcoat: 0.4 }));
  at(body, 0, 0.022, 0); g.add(body);
  g.add(at(box(0.012, 0.006, 0.048, mat(color, { rough: 0.3 })), -len / 2 - 0.004, 0.022, 0));
  g.add(at(rot(cyl(0.012, 0.014, 0.025, mat(cap, { rough: 0.4 }), 16), 0, 0, Math.PI / 2), len / 2 + 0.012, 0.022, 0));
  const lab = decal(len * 0.75, 0.035, `tube:${label}:${accent}`, (ctx, W, H) => { ctx.fillStyle = accent; ctx.font = `900 ${H * 0.6}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, label, W / 2, H / 2, W * 0.9); }, { tw: 256, th: 64 });
  lab.rotation.x = -Math.PI / 2; at(lab, 0, 0.0375, 0); g.add(lab);
  void prof;
  return g;
}
export function sprayBottle({ glass = '#f7d6e0', liquid = '#ffd1dc', cap = '#c9a86a', shape = 'round', h = 0.1, r = 0.032 }) {
  const g = new THREE.Group();
  const bodyM = mat(glass, { rough: 0.02, opacity: 0.55, transparent: true, clearcoat: 1, envInt: 1.5 });
  if (shape === 'square') g.add(at(rbox(r * 2, h * 0.75, r * 1.3, 0.008, bodyM), 0, h * 0.375, 0));
  else g.add(at(sph(r, bodyM, 24, 16), 0, r, 0));
  const liq = shape === 'square' ? rbox(r * 1.8, h * 0.6, r * 1.1, 0.006, mat(liquid, { rough: 0.1, opacity: 0.8, transparent: true })) : sph(r * 0.85, mat(liquid, { rough: 0.1, opacity: 0.8, transparent: true }), 16, 12);
  at(liq, 0, shape === 'square' ? h * 0.33 : r * 0.9, 0); liq.userData.liquid = true; g.add(liq);
  const top = shape === 'square' ? h * 0.75 : r * 2;
  g.add(at(cyl(r * 0.25, r * 0.25, 0.012, MAT.gold(), 12), 0, top + 0.006, 0));
  g.add(at(rbox(r * 0.9, h * 0.25, r * 0.9, 0.006, mat(cap, { rough: 0.25, metal: 0.6 })), 0, top + 0.012 + h * 0.125, 0));
  return g;
}

// ------------------------------------------------------------------ clothing
export function foldedGarment({ color = '#ffffff', color2 = null, print = null, style = 'tee', fabricKind = 'cotton', w = 0.3, d = 0.24 }) {
  const m = fabricKind === 'knit' ? MAT.knit(color) : fabricKind === 'denim' ? mat(color, { rough: 0.9, map: MAT.fabric('#fff').map }) : MAT.fabric(color);
  const h = style === 'hoodie' || style === 'sweater' || style === 'jacket' ? 0.07 : style === 'pants' || style === 'jeans' ? 0.05 : 0.035;
  const g = group(at(rbox(w, h, d, Math.min(h / 2 - 0.001, 0.02), m), 0, h / 2, 0));
  g.add(at(rbox(w * 0.98, h * 0.4, d * 0.4, Math.min(h * 0.2 - 0.001, 0.01), m), 0, h + h * 0.18, -d * 0.3));
  if (style === 'hoodie') g.add(at(rot(torus(0.06, 0.018, m, 8, 16, Math.PI), -Math.PI / 2, 0, 0), 0, h + 0.005, -d * 0.28));
  if (color2) g.add(at(box(w * 0.98, 0.004, d * 0.12, mat(color2, { rough: 0.9 }), { cast: false }), 0, h + 0.001, d * 0.36));
  if (print) {
    const p = decal(w * 0.45, w * 0.45, `print:${print.key || print.text}:${print.fg}`, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = print.fg || '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (print.emoji) { ctx.font = `${H * 0.6}px ${FONT}`; ctx.fillText(print.emoji, W / 2, H / 2); }
      else { ctx.font = `900 ${H * 0.28}px ${FONT}`; fitText(ctx, print.text || '', W / 2, H / 2, W * 0.9); }
    }, { tw: 256, th: 256 });
    p.rotation.x = -Math.PI / 2; at(p, 0, h + 0.002, d * 0.08); g.add(p);
  }
  return g;
}
export function sneaker({ upper = '#ffffff', accent = '#e63946', sole = '#f2f2f2', lace = '#ffffff', high = false, chunky = false, swoosh = true }) {
  const g = new THREE.Group();
  const one = (side) => {
    const s = new THREE.Group();
    const L = 0.29, W = 0.105;
    const sh = chunky ? 0.045 : 0.03;
    s.add(at(rbox(L, sh, W, sh / 2 - 0.001, mat(sole, { rough: 0.6 })), 0, sh / 2, 0));
    const up = rbox(L * 0.94, high ? 0.13 : 0.075, W * 0.92, 0.035, mat(upper, { rough: 0.55 }));
    at(up, -0.005, sh + (high ? 0.065 : 0.035), 0); s.add(up);
    const toe = sph(W * 0.47, mat(upper, { rough: 0.55 }), 16, 12); toe.scale.set(1.3, 0.75, 1); at(toe, L * 0.32, sh + 0.025, 0); s.add(toe);
    if (high) s.add(at(rbox(0.11, 0.07, W * 0.9, 0.03, mat(upper, { rough: 0.55 })), -0.08, sh + 0.15, 0));
    // accent swoosh/stripe both sides
    if (swoosh) for (const z of [-1, 1]) { const sw = tube([[-0.1, sh + 0.02, z * W * 0.47], [0, sh + 0.015, z * W * 0.48], [0.06, sh + 0.05, z * W * 0.47], [0.09, sh + 0.065, z * W * 0.45]], 0.008, mat(accent, { rough: 0.4 }), 12, 6); s.add(sw); }
    s.add(at(rbox(0.11, 0.012, W * 0.5, 0.005, mat(lace, { rough: 0.7 })), 0.04, sh + (high ? 0.11 : 0.072), 0));
    s.add(at(rbox(0.04, 0.05, W * 0.6, 0.015, mat(accent, { rough: 0.5 })), -L * 0.47, sh + 0.04, 0));
    s.position.z = side * 0.065;
    return s;
  };
  g.add(one(-1), one(1));
  g.rotation.y = -Math.PI / 2; // toes point +Z
  return group(g);
}
export function capHat({ color = '#1d3557', brim = null, logo = null }) {
  const g = new THREE.Group();
  g.add(at(hemiMesh(0.09, mat(color, { rough: 0.8 })), 0, 0, 0));
  const b = cyl(0.085, 0.085, 0.008, mat(brim || color, { rough: 0.8 }), 24, undefined); b.scale.set(0.7, 1, 1); at(b, 0, 0.004, 0.08); g.add(b);
  g.add(at(sph(0.01, mat(color, { rough: 0.8 }), 8, 6), 0, 0.09, 0));
  if (logo) { const l = decal(0.06, 0.04, `caplogo:${logo.text}:${logo.fg}`, (ctx, W, H) => { ctx.fillStyle = logo.fg; ctx.font = `900 ${H * 0.7}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(logo.text, W / 2, H / 2); }, { tw: 128, th: 96 }); l.rotation.x = -0.35; at(l, 0, 0.045, 0.082); g.add(l); }
  return g;
}
export function beanie({ color = '#c1121f', pom = '#ffffff' }) {
  const m = MAT.knit(color);
  const g = group(at(hemiMesh(0.09, m), 0, 0.03, 0), at(cyl(0.092, 0.092, 0.04, m, 24), 0, 0.02, 0));
  if (pom) g.add(at(sph(0.025, MAT.knit(pom), 12, 10), 0, 0.12, 0));
  return g;
}
function hemiMesh(r, m) { const me = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); me.castShadow = true; return me; }

// ------------------------------------------------------------------ books & paper
export function bookModel({ color = '#3d405b', title = 'Untitled', author = '', w = 0.14, h = 0.21, t = 0.03, accent = '#f2cc8f', style = 0, key = null }) {
  const cover = labelTexture(`book:${key || title}:${color}`, 256, 384, (ctx, W, H) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent;
    if (style === 0) { ctx.fillRect(0, H * 0.62, W, H * 0.06); }
    else if (style === 1) { ctx.beginPath(); ctx.arc(W / 2, H * 0.42, W * 0.28, 0, 7); ctx.fill(); }
    else { for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.1, H * (0.15 + i * 0.08), W * (0.3 + (i % 3) * 0.2), 6); }
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${W * 0.12}px Georgia, serif`;
    const words = title.split(' '); let line = '', y = H * 0.75; const lines = [];
    for (const wd of words) { if ((line + ' ' + wd).length > 14) { lines.push(line); line = wd; } else line = (line + ' ' + wd).trim(); }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.12 + i * W * 0.14));
    ctx.font = `500 ${W * 0.07}px ${FONT}`; ctx.fillText(author.toUpperCase(), W / 2, y + H * 0.12);
  });
  const body = mat(color, { rough: 0.6 });
  const pages = mat('#f6f1e4', { rough: 0.95 });
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, t, h), [pages, body, mat('#ffffff', { map: cover, rough: 0.55 }), body, pages, pages]);
  b.castShadow = b.receiveShadow = true;
  at(b, 0, t / 2, 0); g.add(b);
  return g;
}

// Generic poster/print/frame. draw(ctx, W, H) paints the artwork.
export function wallArt({ w = 0.5, h = 0.7, draw, key, frame = '#1b1b1b', frameW = 0.02, depth = 0.025, mat_ = 0.0, emissive = false, glass = true }) {
  const g = new THREE.Group();
  const res = 512;
  const tex = labelTexture(`art:${key}`, Math.round(res * Math.min(1, w / h)), Math.round(res * Math.min(1, h / w)), draw);
  const artM = emissive ? mat('#ffffff', { map: tex, emissive: '#ffffff', ei: 0.6, rough: 0.4 }) : mat('#ffffff', { map: tex, rough: 0.55 });
  if (emissive) artM.emissiveMap = tex;
  if (frame) {
    const fm = mat(frame, { rough: 0.4, metal: frame === '#c9a86a' ? 0.8 : 0 });
    g.add(at(box(w + frameW * 2, frameW, depth, fm), 0, h / 2 + frameW / 2, depth / 2), at(box(w + frameW * 2, frameW, depth, fm), 0, -h / 2 - frameW / 2, depth / 2));
    g.add(at(box(frameW, h, depth, fm), -w / 2 - frameW / 2, 0, depth / 2), at(box(frameW, h, depth, fm), w / 2 + frameW / 2, 0, depth / 2));
    g.add(at(box(w, h, 0.004, mat('#f4f1ea', { rough: 0.9 })), 0, 0, 0.002));
    const art = plane(w - mat_ * 2, h - mat_ * 2, artM, { cast: false, receive: true }); at(art, 0, 0, 0.005); g.add(art);
    if (glass) { const gl = plane(w, h, mat('#ffffff', { rough: 0.05, opacity: 0.06, transparent: true, envInt: 2 }), { cast: false, receive: false }); at(gl, 0, 0, depth - 0.003); g.add(gl); }
  } else {
    const art = plane(w, h, artM, { cast: false, receive: true }); at(art, 0, 0, 0.002); g.add(art);
    // tape corners
    for (const [x, y] of [[-1, 1], [1, 1]]) { const tp = box(0.05, 0.018, 0.001, mat('#f1e3b6', { rough: 0.7, opacity: 0.8, transparent: true }), { cast: false }); tp.rotation.z = x * 0.6; at(tp, x * (w / 2 - 0.01), y * (h / 2 - 0.01), 0.003); g.add(tp); }
  }
  return g;
}

// ------------------------------------------------------------------ helpers
export function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
export function artCanvas(key, w, h, draw) { return cached(`artc:${key}`, () => { const c = canvas(w, h); draw(c.getContext('2d'), w, h); return toTexture(c, { wrap: false }); }); }
export { seeded, labelBox };

import { labelBox } from '../items/kit.js';
void cone; void roundRect;
