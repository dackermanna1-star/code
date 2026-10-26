// Core furniture & appliances used to furnish the starting apartment.
// Convention: meters, origin at bottom-center, the "front" faces +Z.
import * as THREE from 'three';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, lathe, tube, at, rot, group, plane, decal, FONT, extrude, labelBox } from '../items/kit.js';
import { fabric, canvas, toTexture, cached } from '../core/textures.js';
import { seeded } from '../core/utils.js';

const legs = (w, d, h, m, inset = 0.06, r = 0.018, taper = 0.7) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => at(cyl(r * taper, r, h, m, 10), sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)));

function rugTexture(seed, c1, c2, c3, style = 'geo') {
  return cached(`rug:${seed}:${c1}:${c2}:${c3}:${style}`, () => {
    const W = 512, H = 360; const c = canvas(W, H); const ctx = c.getContext('2d');
    const rnd = seeded(seed);
    ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
    if (style === 'geo') {
      ctx.strokeStyle = c2; ctx.lineWidth = 10;
      ctx.strokeRect(22, 22, W - 44, H - 44);
      ctx.lineWidth = 4; ctx.strokeRect(40, 40, W - 80, H - 80);
      for (let i = 0; i < 7; i++) {
        const x = 80 + i * 58; ctx.fillStyle = i % 2 ? c2 : c3;
        ctx.beginPath(); ctx.moveTo(x, H / 2 - 40); ctx.lineTo(x + 26, H / 2); ctx.lineTo(x, H / 2 + 40); ctx.lineTo(x - 26, H / 2); ctx.fill();
      }
    } else if (style === 'abstract') {
      for (let i = 0; i < 9; i++) { ctx.fillStyle = [c2, c3][i % 2]; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 90, 20 + rnd() * 60, rnd() * 3, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (style === 'stripe') {
      for (let x = 0; x < W; x += 36) { ctx.fillStyle = (x / 36) % 2 ? c2 : c1; ctx.fillRect(x, 0, 18, H); }
    }
    const img = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { wrap: false });
  });
}

function bookSpines(n, h, seed) {
  const rnd = seeded(seed);
  const cols = ['#8c2f39', '#2f5d62', '#e0a458', '#3d405b', '#81b29a', '#f2cc8f', '#5e548e', '#d1495b', '#264653', '#ede0d4', '#bc6c25', '#606c38'];
  const g = new THREE.Group();
  let x = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.025 + rnd() * 0.025, hh = h * (0.72 + rnd() * 0.28), d = 0.16 + rnd() * 0.05;
    const b = box(w, hh, d, mat(cols[Math.floor(rnd() * cols.length)], { rough: 0.7 }));
    at(b, x + w / 2, hh / 2, 0);
    if (rnd() < 0.08) { b.rotation.z = -0.25; b.position.y += 0.01; }
    g.add(b); x += w + 0.002;
  }
  g.userData.width = x;
  return g;
}

// ------------------------------------------------------------------ models
function sofa({ color = '#8e9aaf', w = 2.2, legC = '#3b2a20' } = {}) {
  const f = MAT.fabric(color);
  const g = new THREE.Group();
  const d = 0.95, sh = 0.42;
  g.add(at(rbox(w, 0.22, d, 0.04, f), 0, 0.2, 0)); // base
  g.add(at(rbox(w - 0.36, 0.5, 0.24, 0.08, f), 0, 0.55, -d / 2 + 0.14)); // back
  for (const s of [-1, 1]) g.add(at(rbox(0.2, 0.42, d, 0.07, f), s * (w / 2 - 0.1), 0.4, 0)); // arms
  const n = Math.round((w - 0.4) / 0.6);
  const cw = (w - 0.4) / n;
  for (let i = 0; i < n; i++) {
    g.add(at(rbox(cw - 0.02, 0.14, d - 0.3, 0.06, f), -w / 2 + 0.2 + cw * (i + 0.5), sh - 0.02, 0.1)); // seat cushions
    const back = rbox(cw - 0.04, 0.42, 0.16, 0.08, f); back.rotation.x = -0.12;
    g.add(at(back, -w / 2 + 0.2 + cw * (i + 0.5), 0.66, -d / 2 + 0.3));
  }
  // throw pillows
  g.add(at(rot(rbox(0.38, 0.38, 0.12, 0.06, MAT.knit('#e9c46a')), -0.15, 0.3, 0.12), -w / 2 + 0.42, 0.62, -0.12));
  g.add(at(rot(rbox(0.36, 0.36, 0.12, 0.06, MAT.fabric('#f4f1de')), -0.12, -0.25, -0.1), w / 2 - 0.42, 0.62, -0.12));
  for (const p of legs(w - 0.1, d - 0.1, 0.1, mat(legC, { rough: 0.5 }), 0.05, 0.025)) g.add(p);
  return g;
}

function armchair({ color = '#c08552' } = {}) {
  const f = MAT.leather(color);
  const g = new THREE.Group();
  g.add(at(rbox(0.82, 0.2, 0.8, 0.05, f), 0, 0.3, 0));
  g.add(at(rbox(0.6, 0.12, 0.6, 0.05, f), 0, 0.45, 0.06));
  const back = rbox(0.78, 0.55, 0.14, 0.06, f); back.rotation.x = -0.15; g.add(at(back, 0, 0.68, -0.33));
  for (const s of [-1, 1]) g.add(at(rbox(0.12, 0.26, 0.76, 0.05, f), s * 0.36, 0.5, 0));
  const wood = MAT.wood('#5a3e2b');
  for (const [x, z] of [[-0.34, -0.32], [0.34, -0.32], [-0.34, 0.32], [0.34, 0.32]]) { const l = cyl(0.015, 0.022, 0.22, wood, 8); l.rotation.set(z * 0.4, 0, -x * 0.4); g.add(at(l, x, 0.11, z)); }
  return g;
}

function coffeeTable() {
  const wood = MAT.wood('#b07d4f');
  const black = mat('#1e1e1e', { rough: 0.4, metal: 0.6 });
  const g = group(at(rbox(1.15, 0.045, 0.62, 0.02, wood), 0, 0.42, 0), at(rbox(1.05, 0.02, 0.52, 0.01, wood), 0, 0.12, 0));
  for (const s of [-1, 1]) {
    g.add(at(box(0.02, 0.4, 0.5, black), s * 0.5, 0.2, 0));
  }
  // props: coaster & tray
  g.add(at(cyl(0.05, 0.05, 0.006, mat('#d4a373', { rough: 0.9 }), 20), 0.32, 0.446, 0.12));
  return g;
}

function rug({ w = 2.4, d = 1.7, c1 = '#e6dccd', c2 = '#7d5a50', c3 = '#c97c5d', style = 'geo', seed = 1 } = {}) {
  const tex = rugTexture(seed, c1, c2, c3, style);
  const m = mat('#ffffff', { map: tex, rough: 1, sheen: 0.4 });
  const r = rbox(w, 0.014, d, 0.006, m, { cast: false, receive: true });
  r.position.y = 0.007;
  // fringe
  const g = group(r);
  const fr = mat(c1, { rough: 1 });
  for (const s of [-1, 1]) g.add(at(box(0.06, 0.004, d * 0.96, fr, { cast: false }), s * (w / 2 + 0.03), 0.003, 0));
  return g;
}

function tvModel({ w = 1.23, h = 0.71, stand = 'feet' } = {}) {
  const frame = mat('#111214', { rough: 0.35, metal: 0.3 });
  const g = new THREE.Group();
  const by = stand === 'wall' ? 0 : 0.07;
  g.add(at(rbox(w, h, 0.035, 0.008, frame), 0, by + h / 2, 0));
  const screen = plane(w - 0.02, h - 0.02, MAT.screen(), { cast: false, receive: false });
  screen.name = 'screen'; at(screen, 0, by + h / 2, 0.0181); g.add(screen);
  g.add(at(box(w * 0.3, 0.02, 0.012, mat('#222')), 0, by + 0.012, 0.02));
  if (stand === 'feet') for (const s of [-1, 1]) { const f = box(0.02, 0.075, 0.2, frame); f.rotation.z = s * 0.3; g.add(at(f, s * (w / 2 - 0.12), 0.037, 0)); }
  const led = sph(0.004, mat('#ff3b30', { emissive: '#ff3b30', ei: 1 }), 8, 6); g.add(at(led, w / 2 - 0.05, by + 0.012, 0.022));
  return g;
}

function mediaConsole() {
  const wood = MAT.wood('#a47148');
  const g = new THREE.Group();
  g.add(at(rbox(1.6, 0.42, 0.42, 0.015, wood), 0, 0.3, 0));
  const front = mat('#8c5e3c', { rough: 0.6, map: wood.map });
  for (let i = 0; i < 3; i++) {
    const p = box(0.5, 0.36, 0.01, front); at(p, -0.53 + i * 0.53, 0.3, 0.212); g.add(p);
    // slatted fronts
    for (let k = 0; k < 9; k++) g.add(at(box(0.012, 0.34, 0.008, mat('#6e4a2f', { rough: 0.6 })), -0.53 + i * 0.53 - 0.22 + k * 0.055, 0.3, 0.219));
  }
  for (const p of legs(1.5, 0.36, 0.09, mat('#2b2b2b', { rough: 0.4, metal: 0.6 }), 0.04, 0.015, 1)) g.add(p);
  // soundbar & router
  g.add(at(rbox(0.8, 0.06, 0.09, 0.02, mat('#1b1b1b', { rough: 0.5 })), 0, 0.54, 0.1));
  return g;
}

function floorLamp({ shade = '#f3ead8' } = {}) {
  const metal = mat('#2d2d2d', { rough: 0.35, metal: 0.8 });
  const g = group(
    at(cyl(0.16, 0.17, 0.025, metal, 32), 0, 0.012, 0),
    at(cyl(0.012, 0.012, 1.42, metal, 10), 0, 0.72, 0),
  );
  const sm = mat(shade, { rough: 0.9, side: THREE.DoubleSide, emissive: '#ffd9a8', ei: 0 });
  const s = cyl(0.17, 0.23, 0.3, sm, 32, undefined, true); at(s, 0, 1.5, 0); s.userData.bulb = true; g.add(s);
  const bulb = sph(0.04, mat('#fff6e0', { emissive: '#fff1d0', ei: 0 }), 12, 8); bulb.userData.bulb = true; at(bulb, 0, 1.45, 0); g.add(bulb);
  return g;
}

function tableLamp({ base = '#c9ada7', shade = '#f2e9e4' } = {}) {
  const g = new THREE.Group();
  g.add(at(lathe([[0, 0], [0.07, 0], [0.09, 0.05], [0.1, 0.14], [0.06, 0.24], [0.02, 0.27], [0, 0.27]], MAT.ceramic(base), 28), 0, 0, 0));
  g.add(at(cyl(0.006, 0.006, 0.08, MAT.gold(), 8), 0, 0.3, 0));
  const sm = mat(shade, { rough: 0.9, side: THREE.DoubleSide, emissive: '#ffd9a8', ei: 0 });
  const s = cyl(0.1, 0.15, 0.17, sm, 28, undefined, true); s.userData.bulb = true; at(s, 0, 0.4, 0); g.add(s);
  return g;
}

function bookshelf() {
  const wood = MAT.wood('#d6b58a');
  const g = new THREE.Group();
  const W = 0.9, H = 1.9, D = 0.32;
  g.add(at(box(0.025, H, D, wood), -W / 2, H / 2, 0), at(box(0.025, H, D, wood), W / 2, H / 2, 0), at(box(W, 0.02, D, mat('#c9a77c', { rough: 0.7 })), 0, H / 2, -D / 2 + 0.01));
  const ys = [0.04, 0.42, 0.8, 1.18, 1.56, 1.89];
  for (const y of ys) g.add(at(box(W, 0.025, D, wood), 0, y, 0));
  // books on 3 shelves, decor on others
  for (const [i, y] of [[0, 0.06], [2, 0.82], [3, 1.2]]) {
    const b = bookSpines(10 + i, 0.3, 11 + i);
    b.position.set(-W / 2 + 0.03, y, 0.0);
    g.add(b);
  }
  g.add(at(lathe([[0, 0], [0.06, 0], [0.07, 0.1], [0.04, 0.18], [0.045, 0.2], [0, 0.2]], MAT.ceramic('#6b9080'), 20), 0.25, 0.445, 0));
  g.add(at(sph(0.06, mat('#f4a261', { rough: 0.6 }), 16, 12), -0.2, 1.64, 0.02));
  return g;
}

function sideTable() {
  const wood = MAT.wood('#8d6346');
  return group(at(cyl(0.24, 0.24, 0.03, wood, 32), 0, 0.53, 0), at(cyl(0.035, 0.05, 0.5, wood, 16), 0, 0.27, 0), at(cyl(0.18, 0.2, 0.02, wood, 32), 0, 0.01, 0));
}

function diningTable() {
  const wood = MAT.wood('#c49a6c');
  return group(
    at(cyl(0.55, 0.55, 0.04, wood, 48), 0, 0.74, 0),
    at(cyl(0.06, 0.09, 0.68, wood, 20), 0, 0.37, 0),
    at(cyl(0.3, 0.32, 0.04, wood, 32), 0, 0.02, 0),
  );
}

function diningChair({ seatC = '#e9e2d6' } = {}) {
  const wood = MAT.wood('#7a5236');
  const g = group(at(rbox(0.44, 0.05, 0.44, 0.02, mat(seatC, { rough: 0.8, sheen: 0.4 })), 0, 0.46, 0));
  for (const p of legs(0.42, 0.42, 0.44, wood, 0.03, 0.016, 0.8)) g.add(p);
  for (const s of [-1, 1]) g.add(at(cyl(0.012, 0.014, 0.42, wood, 8), s * 0.18, 0.68, -0.19));
  g.add(at(rbox(0.42, 0.14, 0.03, 0.012, wood), 0, 0.86, -0.2));
  return g;
}

function barStool() {
  const metal = mat('#1f1f1f', { rough: 0.35, metal: 0.8 });
  return group(
    at(cyl(0.18, 0.18, 0.06, mat('#c08552', { rough: 0.5, clearcoat: 0.3 }), 28), 0, 0.68, 0),
    at(cyl(0.022, 0.022, 0.64, metal, 10), 0, 0.33, 0),
    at(rot(torus(0.15, 0.01, metal, 6, 28), Math.PI / 2, 0, 0), 0, 0.28, 0),
    at(cyl(0.2, 0.22, 0.02, metal, 28), 0, 0.01, 0),
  );
}

function bed({ duvet = '#dfe7ec', frame = '#c2a27c' } = {}) {
  const wood = MAT.wood(frame);
  const g = new THREE.Group();
  const W = 1.65, L = 2.15;
  g.add(at(rbox(W + 0.08, 0.28, L + 0.04, 0.02, wood), 0, 0.2, 0));
  const head = rbox(W + 0.08, 1.05, 0.08, 0.03, MAT.fabric('#b7a99a')); at(head, 0, 0.6, -L / 2 - 0.02); g.add(head);
  const mattress = rbox(W, 0.22, L - 0.04, 0.05, mat('#f4f4f2', { rough: 0.9 })); mattress.name = 'sheet'; at(mattress, 0, 0.44, 0.01); g.add(mattress);
  const duv = rbox(W + 0.04, 0.09, L * 0.66, 0.04, MAT.fabric(duvet)); duv.name = 'duvet'; at(duv, 0, 0.58, L * 0.16); g.add(duv);
  const fold = rbox(W + 0.05, 0.1, 0.22, 0.045, MAT.fabric(duvet)); fold.name = 'duvet'; at(fold, 0, 0.6, -L * 0.18); g.add(fold);
  for (const s of [-1, 1]) {
    const p = rbox(0.62, 0.14, 0.38, 0.07, MAT.fabric('#f7f5f0')); p.name = 'pillow'; p.rotation.x = -0.25; at(p, s * 0.38, 0.63, -L / 2 + 0.28); g.add(p);
  }
  const throwB = rbox(W * 0.95, 0.03, 0.45, 0.012, MAT.knit('#c9b79c')); at(throwB, 0, 0.635, L / 2 - 0.35); g.add(throwB);
  for (const p of legs(W, L, 0.08, wood, 0.06, 0.03, 0.9)) g.add(p);
  return g;
}

function nightstand() {
  const wood = MAT.wood('#c2a27c');
  const g = group(at(rbox(0.48, 0.5, 0.4, 0.015, wood), 0, 0.33, 0));
  g.add(at(box(0.44, 0.18, 0.01, mat('#b08d68', { rough: 0.6, map: wood.map })), 0, 0.45, 0.2));
  g.add(at(cyl(0.012, 0.012, 0.02, MAT.gold(), 12), 0, 0.45, 0.212).rotateX(Math.PI / 2));
  for (const p of legs(0.44, 0.36, 0.08, mat('#2b2b2b', { metal: 0.6, rough: 0.4 }), 0.03, 0.012, 1)) g.add(p);
  return g;
}

function desk() {
  const wood = MAT.wood('#e4d2b8');
  const metal = mat('#262626', { rough: 0.35, metal: 0.7 });
  const g = group(at(rbox(1.45, 0.035, 0.72, 0.01, wood), 0, 0.74, 0));
  for (const s of [-1, 1]) { g.add(at(box(0.05, 0.72, 0.05, metal), s * 0.66, 0.36, 0)); g.add(at(box(0.05, 0.03, 0.66, metal), s * 0.66, 0.015, 0)); }
  g.add(at(box(1.3, 0.04, 0.03, metal), 0, 0.68, -0.3));
  // desk mat
  g.add(at(rbox(0.9, 0.004, 0.36, 0.01, mat('#2f3e46', { rough: 1 }), { cast: false }), 0, 0.76, 0.15));
  return g;
}

function pcSetup() {
  const g = new THREE.Group();
  const dark = mat('#141518', { rough: 0.35, metal: 0.3 });
  // monitor
  const mon = group(at(rbox(0.66, 0.38, 0.03, 0.01, dark), 0, 0, 0));
  const screen = plane(0.63, 0.355, MAT.screen(), { cast: false, receive: false }); screen.name = 'screen'; at(screen, 0, 0, 0.0155); mon.add(screen);
  mon.position.set(0, 0.36, -0.12); g.add(mon);
  g.add(at(box(0.04, 0.17, 0.04, dark), 0, 0.12, -0.15), at(rbox(0.22, 0.012, 0.16, 0.006, dark), 0, 0.006, -0.13));
  // keyboard & mouse
  const kb = rbox(0.42, 0.022, 0.13, 0.008, mat('#e8e6e3', { rough: 0.5 })); at(kb, -0.04, 0.011, 0.14); g.add(kb);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) g.add(at(box(0.022, 0.008, 0.022, mat('#ffffff', { rough: 0.4 }), { cast: false }), -0.04 - 0.19 + c * 0.0285, 0.025, 0.1 + r * 0.027));
  g.add(at(rbox(0.06, 0.03, 0.1, 0.02, mat('#e8e6e3', { rough: 0.4 })), 0.27, 0.015, 0.15));
  // tower with RGB
  const tw = new THREE.Group();
  tw.add(at(rbox(0.21, 0.45, 0.42, 0.01, dark), 0, 0.225, 0));
  const glass = box(0.005, 0.4, 0.38, mat('#1a2a3a', { opacity: 0.45, transparent: true, rough: 0.05 })); at(glass, -0.106, 0.23, 0); tw.add(glass);
  for (let i = 0; i < 3; i++) { const fan = torus(0.05, 0.008, mat('#ffffff', { emissive: '#7b5cff', ei: 2 }), 6, 24); fan.rotation.y = Math.PI / 2; fan.userData.rgb = true; at(fan, -0.09, 0.1 + i * 0.12, 0.12); tw.add(fan); }
  const strip = box(0.004, 0.4, 0.01, mat('#ffffff', { emissive: '#3fd2ff', ei: 2 })); strip.userData.rgb = true; at(strip, -0.1, 0.23, -0.17); tw.add(strip);
  tw.position.set(0.56, 0, -0.05); g.add(tw);
  // mug & plant
  g.add(at(lathe([[0.035, 0], [0.04, 0.09], [0.037, 0.09], [0.032, 0.006], [0, 0.006]], MAT.ceramic('#e76f51'), 24), -0.38, 0, -0.05));
  return g;
}

function deskChair() {
  const dark = mat('#222', { rough: 0.5 });
  const f = MAT.fabric('#3d5a80');
  const g = new THREE.Group();
  g.add(at(rbox(0.5, 0.08, 0.48, 0.03, f), 0, 0.5, 0));
  const back = rbox(0.46, 0.62, 0.07, 0.04, f); back.rotation.x = -0.1; g.add(at(back, 0, 0.88, -0.24));
  g.add(at(cyl(0.025, 0.03, 0.36, mat('#888', { metal: 1, rough: 0.3 }), 12), 0, 0.3, 0));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = box(0.3, 0.025, 0.04, dark); leg.rotation.y = a; leg.position.set(Math.cos(a) * 0.15, 0.06, -Math.sin(a) * 0.15); g.add(leg); g.add(at(sph(0.025, dark, 10, 8), Math.cos(a) * 0.29, 0.025, -Math.sin(a) * 0.29)); }
  for (const s of [-1, 1]) g.add(at(rbox(0.05, 0.03, 0.26, 0.012, dark), s * 0.27, 0.68, 0.02), at(box(0.02, 0.16, 0.02, dark), s * 0.27, 0.6, 0.0));
  return g;
}

function dresser() {
  const wood = MAT.wood('#9c6644');
  const g = group(at(rbox(1.2, 0.78, 0.48, 0.015, wood), 0, 0.47, 0));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    g.add(at(box(0.57, 0.23, 0.01, mat('#8a5a3b', { rough: 0.6, map: wood.map })), -0.295 + c * 0.59, 0.21 + r * 0.25, 0.241));
    g.add(at(rbox(0.12, 0.016, 0.02, 0.006, MAT.gold()), -0.295 + c * 0.59, 0.26 + r * 0.25, 0.25));
  }
  for (const p of legs(1.14, 0.42, 0.08, wood, 0.04, 0.02, 0.6)) g.add(p);
  return g;
}

function plantPot(potC = '#e8e1d6', h = 0.32, r = 0.17) {
  return group(
    lathe([[0, 0], [r * 0.8, 0], [r, h * 0.95], [r * 1.04, h], [r * 0.96, h], [r * 0.9, h * 0.85], [0, h * 0.85]], MAT.ceramic(potC), 32),
    at(cyl(r * 0.88, r * 0.88, 0.02, mat('#3b2a1e', { rough: 1 }), 24), 0, h * 0.85, 0),
  );
}

function monstera() {
  const g = plantPot('#d9d2c5', 0.36, 0.2);
  const leafMat = mat('#2f6b3a', { rough: 0.55, side: THREE.DoubleSide });
  const stemMat = mat('#4f7a3a', { rough: 0.7 });
  const rnd = seeded(42);
  // split-leaf shape
  const leafShape = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24 * Math.PI * 2;
    let rr = 0.5 + 0.5 * Math.sin(t / 2) ** 0.6;
    const notch = Math.abs(Math.sin(t * 4)) < 0.25 && t > 0.5 && t < 5.8 ? 0.7 : 1;
    leafShape.push([Math.cos(t) * 0.18 * rr * notch, Math.sin(t) * 0.22 * rr * notch + 0.2]);
  }
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rnd() * 0.5;
    const h = 0.55 + rnd() * 0.55;
    const len = 0.25 + rnd() * 0.15;
    const sx = Math.cos(a) * len, sz = Math.sin(a) * len;
    g.add(tube([[0, 0.3, 0], [sx * 0.4, 0.3 + h * 0.6, sz * 0.4], [sx, 0.3 + h, sz]], 0.008, stemMat, 12, 6));
    const leaf = extrude(leafShape, 0.004, leafMat, 0, undefined, 'monsteraLeaf');
    leaf.userData.leaf = true;
    leaf.position.set(sx, 0.3 + h, sz);
    leaf.rotation.set(-0.9 - rnd() * 0.4, -a + Math.PI / 2, 0);
    leaf.scale.setScalar(0.9 + rnd() * 0.4);
    g.add(leaf);
  }
  return g;
}

function snakePlant() {
  const g = plantPot('#2f3437', 0.26, 0.13);
  const rnd = seeded(7);
  for (let i = 0; i < 9; i++) {
    const h = 0.4 + rnd() * 0.35;
    const leaf = extrude([[-0.03, 0], [0.03, 0], [0.012, h], [0, h + 0.04], [-0.012, h]], 0.006, mat(rnd() < 0.5 ? '#3e6b48' : '#5b8a54', { rough: 0.5 }), 0.002);
    leaf.userData.leaf = true;
    const a = rnd() * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.06, 0.22, Math.sin(a) * 0.06);
    leaf.rotation.set((rnd() - 0.5) * 0.25, a, (rnd() - 0.5) * 0.25);
    g.add(leaf);
  }
  return g;
}

function pothos() {
  const g = plantPot('#c9a690', 0.16, 0.11);
  const rnd = seeded(5);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 0.05 + rnd() * 0.12;
    const l = sph(0.035, mat(rnd() < 0.3 ? '#a3c26b' : '#4d8b31', { rough: 0.5 }), 10, 6);
    l.scale.set(1, 0.35, 1.3); l.userData.leaf = true;
    l.position.set(Math.cos(a) * r, 0.15 + rnd() * 0.08 - Math.max(0, r - 0.11) * 2, Math.sin(a) * r);
    l.rotation.set(rnd(), rnd() * 3, rnd());
    g.add(l);
  }
  return g;
}

function alarmClock() {
  const g = new THREE.Group();
  const body = cyl(0.07, 0.07, 0.05, mat('#e07a5f', { rough: 0.35, clearcoat: 0.6 }), 32); body.rotation.x = Math.PI / 2; at(body, 0, 0.085, 0); g.add(body);
  const face = cyl(0.06, 0.06, 0.004, mat('#fdfcf8', { rough: 0.5 }), 32); face.rotation.x = Math.PI / 2; at(face, 0, 0.085, 0.026); g.add(face);
  const hourPivot = new THREE.Group(); hourPivot.name = 'hourHand'; hourPivot.position.set(0, 0.085, 0.03);
  hourPivot.add(at(box(0.005, 0.03, 0.002, mat('#222')), 0, 0.013, 0)); g.add(hourPivot);
  const minPivot = new THREE.Group(); minPivot.name = 'minuteHand'; minPivot.position.set(0, 0.085, 0.031);
  minPivot.add(at(box(0.003, 0.045, 0.002, mat('#222')), 0, 0.02, 0)); g.add(minPivot);
  for (const s of [-1, 1]) { g.add(at(sph(0.025, MAT.metal('#d9d9d9'), 16, 8), s * 0.045, 0.15, 0)); g.add(at(cyl(0.006, 0.006, 0.04, MAT.metal('#999')), s * 0.045, 0.02, 0)); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(at(box(0.003, 0.008, 0.002, mat('#555')), Math.sin(a) * 0.05, 0.085 + Math.cos(a) * 0.05, 0.029)); }
  return g;
}

function coffeeMachine() {
  const g = new THREE.Group();
  const body = mat('#2b2d31', { rough: 0.35, metal: 0.4 });
  const steel = MAT.metal('#c9ccd0', 0.25);
  g.add(at(rbox(0.22, 0.34, 0.3, 0.02, body), 0, 0.17, -0.02));
  g.add(at(rbox(0.22, 0.06, 0.12, 0.02, body), 0, 0.31, 0.18));
  g.add(at(rbox(0.2, 0.012, 0.12, 0.004, steel), 0, 0.012, 0.18));
  g.add(at(cyl(0.012, 0.012, 0.03, steel, 12), 0, 0.27, 0.18));
  const glow = sph(0.008, mat('#3fd2ff', { emissive: '#3fd2ff', ei: 0 }), 8, 6); glow.name = 'glow'; at(glow, 0.07, 0.25, 0.131); g.add(glow);
  g.add(at(cyl(0.05, 0.05, 0.12, mat('#cfe5f0', { opacity: 0.4, transparent: true, rough: 0.05 }), 20), -0.06, 0.4, -0.08));
  return g;
}

function toaster() {
  const g = new THREE.Group();
  g.add(at(rbox(0.28, 0.18, 0.16, 0.04, mat('#a8dadc', { rough: 0.3, clearcoat: 0.8 })), 0, 0.09, 0));
  for (const s of [-1, 1]) g.add(at(box(0.2, 0.01, 0.03, mat('#222')), 0, 0.181, s * 0.035));
  const lever = box(0.02, 0.03, 0.03, mat('#333')); lever.name = 'lever'; at(lever, 0.15, 0.13, 0); g.add(lever);
  const glow = box(0.16, 0.004, 0.012, mat('#2a0c06', { emissive: '#ff5a1f', ei: 0 }), { cast: false }); glow.name = 'glow'; at(glow, 0, 0.183, 0); g.add(glow);
  g.add(at(cyl(0.014, 0.014, 0.01, MAT.chrome(), 16), 0.141, 0.06, 0.04).rotateZ(Math.PI / 2));
  return g;
}

function consoleBox() {
  const g = new THREE.Group();
  g.add(at(rbox(0.3, 0.07, 0.24, 0.015, mat('#f2f2f2', { rough: 0.3 })), 0, 0.035, 0));
  g.add(at(box(0.3, 0.012, 0.24, mat('#1b1b1b', { rough: 0.4 })), 0, 0.072, 0));
  const led = box(0.08, 0.004, 0.004, mat('#ffffff', { emissive: '#3fd2ff', ei: 0.6 })); led.name = 'led'; at(led, 0, 0.04, 0.121); g.add(led);
  // controller
  const c = group(at(rbox(0.14, 0.025, 0.08, 0.02, mat('#1f1f1f', { rough: 0.4 })), 0, 0.012, 0));
  for (const s of [-1, 1]) c.add(at(cyl(0.008, 0.008, 0.01, mat('#444'), 10), s * 0.035, 0.028, -0.01));
  c.position.set(0.24, 0, 0.05); c.rotation.y = -0.4; g.add(c);
  return g;
}

function fruitBowl() {
  const g = group(lathe([[0, 0], [0.06, 0], [0.14, 0.06], [0.15, 0.07], [0.14, 0.07], [0.06, 0.01], [0, 0.01]], MAT.wood('#8d5b3a'), 32));
  const fr = [['#c1121f', 0.035], ['#f4a261', 0.034], ['#99c24d', 0.033], ['#c1121f', 0.034], ['#ffbe0b', 0.03]];
  fr.forEach(([c, r], i) => g.add(at(sph(r, mat(c, { rough: 0.4, clearcoat: 0.4 }), 16, 12), Math.cos(i * 1.3) * 0.06, 0.05 + (i > 2 ? 0.03 : 0), Math.sin(i * 1.3) * 0.06)));
  return g;
}

// ------------------------------------------------------------------ definitions
const F = (o) => ({ furniture: true, category: 'furniture', place: 'floor', ...o });
defineItems([
  F({ id: 'sofa_cloud', name: 'Cloud Sofa', price: 899, stores: ['nestly'], desc: 'A deep three-seater you\'ll never want to leave. Seats 3, naps 1.', build: () => sofa({ color: '#8e9aaf' }), use: { type: 'seat', seats: [[-0.62, 0.12], [0, 0.12], [0.62, 0.12]], height: 0.45, comfort: 0.7, lie: true, lieHead: [-0.85, 0, 0.05], width: 2.2 }, emoji: '🛋️' }),
  F({ id: 'sofa_velvet', name: 'Emerald Velvet Sofa', price: 1249, stores: ['nestly'], rarity: 'uncommon', desc: 'Plush velvet in a deep jewel green.', build: () => sofa({ color: '#2d6a4f', w: 2.0 }), use: { type: 'seat', seats: [[-0.5, 0.12], [0.5, 0.12]], height: 0.45, comfort: 0.8, lie: true, lieHead: [-0.75, 0, 0.05], width: 2.0 }, emoji: '🛋️' }),
  F({ id: 'armchair_leather', name: 'Cognac Lounge Chair', price: 549, stores: ['nestly'], desc: 'Butter-soft leather and a perfect reading slouch.', build: () => armchair({}), use: { type: 'seat', seats: [[0, 0.05]], height: 0.47, comfort: 0.65 }, emoji: '💺' }),
  F({ id: 'coffee_table_oak', name: 'Oak Coffee Table', price: 229, stores: ['nestly', 'primo'], desc: 'Two tiers: one for snacks, one for magazines you\'ll never read.', build: coffeeTable, noCollide: false, use: { type: 'table' } }),
  F({ id: 'rug_terracotta', name: 'Terracotta Diamond Rug', price: 189, stores: ['nestly'], tags: ['rug', 'soft'], desc: 'Hand-tufted, softens footsteps and the whole room.', build: () => rug({}), noCollide: true, emoji: '🟫', use: { type: 'decor', verb: 'Wiggle your toes', lines: ['Plush. Your feet say thank you.', 'The diamonds look extra crisp after a vacuum.'] } }),
  F({ id: 'rug_abstract', name: 'Blush Abstract Rug', price: 219, stores: ['nestly'], tags: ['rug', 'soft'], desc: 'Soft organic shapes in blush and sage.', build: () => rug({ c1: '#efe6dd', c2: '#e3b5a4', c3: '#9cae9b', style: 'abstract', seed: 4, w: 2.0, d: 1.5 }), noCollide: true, use: { type: 'decor', verb: 'Wiggle your toes', lines: ['Soft as a cloud with opinions about color.', 'The blobs look like a map of a country that doesn\'t exist.'] } }),
  { id: 'tv_55', name: 'Volt 55" 4K TV', category: 'electronics', price: 649, stores: ['volt', 'primo'], furniture: true, place: 'surface', desc: 'Crisp 4K, eight channels of questionable programming, console-ready.', build: () => tvModel({}), use: { type: 'tv' }, emoji: '📺' },
  F({ id: 'media_console', name: 'Slatted Media Console', price: 399, stores: ['nestly'], desc: 'Walnut slats, hides cables, holds your TV and your secrets.', build: mediaConsole, use: { type: 'drawers', verb: 'Open cabinet', capacity: 16, accepts: ['electronics', 'games', 'books', 'toys', 'hobby', 'collectibles', 'accessories', 'decor'] } }),
  F({ id: 'lamp_floor_arc', name: 'Linen Floor Lamp', category: 'lighting', price: 129, stores: ['nestly', 'primo'], desc: 'Warm, diffused light for the coziest corner.', build: () => floorLamp({}), use: { type: 'light', bulb: [0, 1.45, 0], intensity: 4, distance: 6, color: '#ffd6a0' } }),
  { id: 'lamp_table_ceramic', name: 'Ceramic Table Lamp', category: 'lighting', price: 69, stores: ['nestly', 'primo'], desc: 'A soft glow for nightstands and side tables.', build: () => tableLamp({}), use: { type: 'light', bulb: [0, 0.38, 0], intensity: 2.2, distance: 4, color: '#ffd2a0' } },
  F({ id: 'bookshelf_oak', name: 'Open Bookshelf', price: 199, stores: ['nestly', 'primo'], desc: 'Five shelves of possibility. Comes pre-loaded with books you\'ll pretend to have read.', build: bookshelf, use: { type: 'drawers', verb: 'Browse shelves', capacity: 24, sound: 'rustle', accepts: ['books', 'collectibles', 'games', 'toys', 'decor', 'art', 'hobby', 'plants'] } }),
  F({ id: 'side_table_round', name: 'Round Side Table', price: 89, stores: ['nestly'], desc: 'Exactly where your drink needs to be.', build: sideTable, use: { type: 'table' } }),
  F({ id: 'dining_table_round', name: 'Pedestal Dining Table', price: 349, stores: ['nestly'], desc: 'Seats two, or one plus a plant.', build: diningTable, use: { type: 'table' } }),
  F({ id: 'chair_dining', name: 'Bentwood Dining Chair', price: 119, stores: ['nestly'], desc: 'Café vibes at home.', build: () => diningChair({}), use: { type: 'seat', seats: [[0, 0.02]], height: 0.47, comfort: 0.35 } }),
  F({ id: 'stool_bar', name: 'Cognac Bar Stool', price: 99, stores: ['nestly'], desc: 'Counter-height stool for island breakfasts.', build: barStool, use: { type: 'seat', seats: [[0, 0]], height: 0.7, comfort: 0.3 } }),
  F({ id: 'bed_queen', name: 'Linen Platform Bed', price: 999, stores: ['nestly'], desc: 'Queen bed with an upholstered headboard. Sleep quality: excellent.', build: () => bed({}), use: { type: 'bed', length: 2.15, width: 1.65, height: 0.6, quality: 1.1 }, emoji: '🛏️' }),
  F({ id: 'nightstand_oak', name: 'Oak Nightstand', price: 129, stores: ['nestly'], desc: 'Drawer for snacks. Top for lamps.', build: nightstand, use: { type: 'drawers', capacity: 8 } }),
  F({ id: 'desk_minimal', name: 'Minimal Work Desk', price: 279, stores: ['nestly', 'primo'], desc: 'A clean, wide desk for work and play.', build: desk, use: { type: 'table', verb: 'Clear the desk' } }),
  { id: 'pc_setup', name: 'Battlestation PC Setup', category: 'electronics', price: 1499, stores: ['volt'], desc: 'RGB tower, 27" monitor, clacky keyboard. Opens your desktop: shop, work gigs, games.', build: pcSetup, use: { type: 'computer', userPos: [0, 0, 0.75], eye: 1.18, pitch: -0.08 }, emoji: '🖥️' },
  F({ id: 'chair_desk', name: 'Ergo Desk Chair', price: 249, stores: ['nestly', 'volt'], desc: 'Lumbar support for long gaming sessions.', build: deskChair, use: { type: 'seat', seats: [[0, 0.02]], height: 0.52, comfort: 0.45 } }),
  F({ id: 'dresser_walnut', name: 'Six-Drawer Dresser', price: 449, stores: ['nestly'], desc: 'Six drawers of folded clothes and chaos.', build: dresser, use: { type: 'drawers', capacity: 30, accepts: ['clothing', 'shoes', 'accessories', 'hygiene', 'books', 'toys', 'collectibles', 'hobby', 'decor', 'electronics'] } }),
  F({ id: 'plant_monstera', name: 'Monstera Deliciosa', category: 'plants', price: 79, stores: ['greenhouse', 'nestly'], desc: 'The iconic split-leaf plant. Water it about once a day.', build: monstera, use: { type: 'plant', thirst: 1 }, emoji: '🪴' }),
  { id: 'plant_snake', name: 'Snake Plant', category: 'plants', price: 39, stores: ['greenhouse', 'primo'], desc: 'Nearly indestructible. Perfect for beginners.', build: snakePlant, use: { type: 'plant', thirst: 0.5 }, emoji: '🌱' },
  { id: 'plant_pothos', name: 'Golden Pothos', category: 'plants', price: 25, stores: ['greenhouse'], desc: 'A trailing vine that grows fast and forgives easily.', build: pothos, use: { type: 'plant', thirst: 1.2 }, emoji: '🌿' },
  { id: 'clock_alarm', name: 'Retro Alarm Clock', category: 'decor', price: 29, stores: ['primo'], desc: 'Twin bells, real ticking hands, shows the game time.', build: alarmClock, use: { type: 'clock' }, emoji: '⏰' },
  { id: 'coffee_machine', name: 'Barista Pro Coffee Maker', category: 'kitchen', price: 189, stores: ['primo', 'volt'], desc: 'Brews coffee for free. Add milk for lattes, beans for espresso.', build: coffeeMachine, use: { type: 'station', verb: 'Brew', anim: 'steam', loop: 'bubbling', out: [0, 0.03, 0.17], recipes: [
    { label: 'Brew a coffee', free: true, makes: 'coffee_mug', seconds: 5, out: [0, 0.03, 0.17] },
    { label: 'Make a latte', needs: ['milk'], makes: 'latte_mug', seconds: 7, out: [0, 0.03, 0.17] },
  ] }, emoji: '☕' },
  { id: 'toaster', name: 'Pastel Toaster', category: 'kitchen', price: 49, stores: ['primo'], desc: 'Two slots, one perfect pop. Needs bread.', build: toaster, use: { type: 'station', verb: 'Toast', anim: 'pop', loop: 'hum', out: [-0.25, 0, 0.05], recipes: [{ label: 'Toast some bread', needs: ['bread'], makes: 'toast', seconds: 6 }] }, emoji: '🍞' },
  { id: 'console_nova', name: 'Nova Box Console', category: 'electronics', price: 499, stores: ['volt'], desc: 'Next-gen console with two games included. Place it near a TV.', build: consoleBox, use: { type: 'console', bundled: ['neon_drift', 'block_drop'] }, emoji: '🎮' },
  { id: 'fruit_bowl', name: 'Wooden Fruit Bowl', category: 'decor', price: 35, stores: ['nestly'], desc: 'Decorative, but feel free to admire it.', build: fruitBowl, use: { type: 'decor', lines: ['Still life with fruit. Very artistic.', 'The apples are looking especially shiny today.'] } },
]);

export { sofa, armchair, rug, rugTexture, bookSpines, plantPot, legs, tvModel, floorLamp, tableLamp, bed, diningChair };
void sph; void cone; void torus; void decal; void FONT; void labelBox; void fabric;
