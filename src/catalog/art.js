// Catalogue: wall art — posters, framed prints, gallery canvases, tapestries,
// macramé and luxe statement pieces. Every canvas is painted procedurally.
// Wall items: origin at the back-center (z = 0 touches the wall), artwork faces +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineItems } from '../items/registry.js';
import { mat, MAT, box, rbox, cyl, sph, at, rot, group, plane, labelTexture, fitText, FONT } from '../items/kit.js';
import { seeded } from '../core/utils.js';

const PI = Math.PI;
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = '"Courier New", Courier, monospace';
const GEO = new Map();
function sharedGeo(key, make) {
  let g = GEO.get('art:' + key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set('art:' + key, g); }
  return g;
}
function meshOf(geo, m, { cast = true, receive = true } = {}) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = receive; return o; }

// ------------------------------------------------------------------ painting helpers
function artTex(key, w, h, draw, res = 512) {
  const tw = Math.round(res * Math.min(1, w / h)), th = Math.round(res * Math.min(1, h / w));
  return labelTexture('art2:' + key, tw, th, draw);
}
function grainOver(ctx, W, H, amt = 14, seed = 1) {
  const img = ctx.getImageData(0, 0, W, H); const rnd = seeded(seed);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * amt; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
function txt(ctx, s, x, y, size, color, { weight = 800, font = FONT, align = 'center', maxW = null, base = 'middle' } = {}) {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.font = `${weight} ${Math.round(size)}px ${font}`;
  if (maxW) fitText(ctx, s, x, y, maxW); else ctx.fillText(s, x, y);
}
function spaced(s, n = 1) { return s.split('').join(' '.repeat(n)); }
function blob(ctx, cx, cy, r, lobes, rnd, jag = 0.35) {
  ctx.beginPath();
  const n = lobes * 6;
  for (let i = 0; i <= n; i++) { const a = i / n * PI * 2; const rr = r * (1 + Math.sin(a * lobes) * jag * (0.6 + rnd() * 0.4)); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
}
function gradient(ctx, W, H, stops, x0 = 0, y0 = 0, x1 = 0, y1 = H) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => g.addColorStop(t, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ frames & mounts
const FRAMES = {
  black: () => mat('#1b1b1b', { rough: 0.45 }),
  white: () => mat('#f4f2ee', { rough: 0.5 }),
  oak: () => MAT.wood('#c9a173'),
  walnut: () => MAT.wood('#5c3b24'),
  gold: () => mat('#d4ad5a', { rough: 0.25, metal: 1 }),
  brass: () => mat('#b89656', { rough: 0.32, metal: 1 }),
};
function framedArt({ w, h, key, draw, frame = 'black', fw = 0.022, depth = 0.028, matW = 0, ornate = false, res = 512 }) {
  const g = new THREE.Group();
  const fm = FRAMES[frame]();
  const W = w + matW * 2, H = h + matW * 2;
  const bar = (bw, bh, x, y, d, r = 0.004) => g.add(at(rbox(bw, bh, d, Math.min(r, bw / 2 - 0.001, bh / 2 - 0.001), fm), x, y, d / 2));
  bar(W + fw * 2, fw, 0, H / 2 + fw / 2, depth); bar(W + fw * 2, fw, 0, -H / 2 - fw / 2, depth);
  bar(fw, H, -W / 2 - fw / 2, 0, depth); bar(fw, H, W / 2 + fw / 2, 0, depth);
  if (ornate) {
    const iw = fw * 0.45, d2 = depth + 0.012;
    bar(W + iw * 2, iw, 0, H / 2 + iw / 2, d2, 0.006); bar(W + iw * 2, iw, 0, -H / 2 - iw / 2, d2, 0.006);
    bar(iw, H, -W / 2 - iw / 2, 0, d2, 0.006); bar(iw, H, W / 2 + iw / 2, 0, d2, 0.006);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(sph(fw * 0.55, fm, 10, 8), x * (W / 2 + fw / 2), y * (H / 2 + fw / 2), depth + 0.004));
  }
  g.add(at(box(W, H, 0.004, mat('#f6f3ec', { rough: 0.95 })), 0, 0, 0.004));
  const art = plane(w, h, mat('#ffffff', { map: artTex(key, w, h, draw, res), rough: 0.6 }), { cast: false, receive: true });
  g.add(at(art, 0, 0, 0.0065));
  g.add(at(plane(W, H, mat('#ffffff', { rough: 0.04, opacity: 0.07, transparent: true, envInt: 2, depthWrite: false }), { cast: false, receive: false }), 0, 0, depth - 0.006));
  return g;
}
function poster({ w, h, key, draw, mount = 'tape', res = 512 }) {
  const g = group(at(plane(w, h, mat('#ffffff', { map: artTex(key, w, h, draw, res), rough: 0.55 }), { cast: false, receive: true }), 0, 0, 0.002));
  g.add(at(box(w, h, 0.001, mat('#efefef', { rough: 0.9 }), { cast: false }), 0, 0, 0.0008));
  if (mount === 'tape') {
    const tape = mat('#f1e3b6', { rough: 0.7, opacity: 0.8, transparent: true });
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const t = box(0.055, 0.02, 0.001, tape, { cast: false }); t.rotation.z = x * y * 0.7; g.add(at(t, x * (w / 2 - 0.008), y * (h / 2 - 0.008), 0.003)); }
  } else if (mount === 'pins') {
    for (const [x, y] of [[-1, 1], [1, 1]]) g.add(at(sph(0.007, mat(x < 0 ? '#e63946' : '#2a9d8f', { rough: 0.3, clearcoat: 0.8 }), 10, 8), x * (w / 2 - 0.02), y * (h / 2 - 0.02), 0.006));
  } else if (mount === 'clips') {
    const wood = MAT.wood('#c9a173');
    g.add(at(rot(cyl(0.008, 0.008, w + 0.06, wood, 10), 0, 0, PI / 2), 0, h / 2 + 0.004, 0.008), at(rot(cyl(0.008, 0.008, w + 0.06, wood, 10), 0, 0, PI / 2), 0, -h / 2 - 0.004, 0.008));
    g.add(at(box(0.002, 0.08, 0.002, mat('#555')), 0, h / 2 + 0.05, 0.004));
  }
  return g;
}
function canvasArt({ w, h, key, draw, depth = 0.035, res = 512 }) {
  const tex = artTex(key, w, h, draw, res);
  const front = mat('#ffffff', { map: tex, rough: 0.7 });
  const side = mat('#d6d6d6', { map: tex, rough: 0.8 });
  const back = mat('#d9cdb4', { rough: 1 });
  const m = new THREE.Mesh(sharedGeo(`cv:${w}:${h}:${depth}`, () => new THREE.BoxGeometry(w, h, depth)), [side, side, side, side, front, back]);
  m.castShadow = m.receiveShadow = true;
  return group(at(m, 0, 0, depth / 2));
}
function tapestry({ w, h, key, draw, dowel = '#b48a5a', fringe = '#efe6d6' }) {
  const geo = sharedGeo(`tap:${w}:${h}`, () => {
    const gg = new THREE.PlaneGeometry(w, h, 24, 6); const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.014 + Math.sin(x / w * PI * 5) * 0.006 * (0.4 + (h / 2 - y) / h)); }
    gg.computeVertexNormals(); return gg;
  });
  const g = group(meshOf(geo, mat('#ffffff', { map: artTex(key, w, h, draw), rough: 1, sheen: 0.5, side: THREE.DoubleSide })));
  const wood = MAT.wood(dowel);
  g.add(at(rot(cyl(0.012, 0.012, w + 0.12, wood, 12), 0, 0, PI / 2), 0, h / 2 + 0.004, 0.02));
  for (const s of [-1, 1]) g.add(at(sph(0.016, wood, 10, 8), s * (w / 2 + 0.06), h / 2 + 0.004, 0.02));
  g.add(meshOf(sharedGeo(`tapString:${w}:${h}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-w / 2 - 0.03, h / 2, 0.02), new THREE.Vector3(0, h / 2 + 0.14, 0.006), new THREE.Vector3(w / 2 + 0.03, h / 2, 0.02)], false, 'catmullrom', 0.01), 20, 0.0025, 4)), mat('#d9c7a7', { rough: 0.9 })));
  g.add(meshOf(sharedGeo(`tapFringe:${w}:${h}`, () => mergeGeometries(Array.from({ length: Math.round(w / 0.025) }, (_, i) => new THREE.CylinderGeometry(0.003, 0.002, 0.07, 4).translate(-w / 2 + 0.0125 + i * 0.025, -h / 2 - 0.035, 0.015 + Math.sin((-w / 2 + i * 0.025) / w * PI * 5) * 0.006)))), mat(fringe, { rough: 1 })));
  return g;
}
function macrame() {
  const W = 0.46, N = 12, H = 0.62;
  const g = new THREE.Group();
  const wood = MAT.wood('#b48a5a');
  g.add(at(rot(cyl(0.013, 0.013, W + 0.14, wood, 12), 0, 0, PI / 2), 0, H / 2, 0.03));
  const cotton = mat('#f1e8d8', { rough: 1, sheen: 0.4 });
  const xs = Array.from({ length: N }, (_, i) => -W / 2 + 0.02 + i * (W - 0.04) / (N - 1));
  const geo = sharedGeo('macrameCords', () => {
    const parts = [];
    const knots = [];
    xs.forEach((x0, i) => {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const y = H / 2 - 0.02 - k * 0.06;
        const dir = (i % 2 ? -1 : 1) * (k % 2 ? 1 : 0);
        const lim = Math.abs(i - (N - 1) / 2) < 4 - Math.abs(k - 4) * 0.8 ? 1 : 0;
        pts.push(new THREE.Vector3(x0 + dir * 0.012 * lim, y, 0.03 + (k % 2) * 0.004));
        if (lim && k % 2 && i % 2 === 0) knots.push([x0 + 0.012, y, 0.034]);
      }
      const tail = H / 2 - 0.02 - 8 * 0.06;
      pts.push(new THREE.Vector3(x0 + (i - N / 2) * 0.004, tail - 0.18 - Math.abs(i - (N - 1) / 2) * -0.012 - (5.5 - Math.abs(i - 5.5)) * 0.02, 0.028));
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0045, 5));
    });
    for (const [x, y, z] of knots) parts.push(new THREE.SphereGeometry(0.011, 8, 6).translate(x, y, z));
    for (let i = 0; i < N; i++) parts.push(new THREE.SphereGeometry(0.009, 8, 6).translate(xs[i], H / 2 - 0.012, 0.035));
    return mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p));
  });
  g.add(meshOf(geo, cotton));
  g.add(meshOf(sharedGeo('macrameHang', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-W / 2 - 0.05, H / 2, 0.03), new THREE.Vector3(0, H / 2 + 0.12, 0.01), new THREE.Vector3(W / 2 + 0.05, H / 2, 0.03)]), 20, 0.003, 4)), cotton));
  return g;
}

// ------------------------------------------------------------------ canvases (draw functions)
function drawMidCentury(ctx, W, H) {
  ctx.fillStyle = '#f1e8d8'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c8664a'; ctx.beginPath(); ctx.moveTo(W * 0.12, H * 0.85); ctx.lineTo(W * 0.12, H * 0.5); ctx.arc(W * 0.37, H * 0.5, W * 0.25, PI, 0); ctx.lineTo(W * 0.62, H * 0.85); ctx.fill();
  ctx.fillStyle = '#e0a83e'; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.28, W * 0.15, 0, 7); ctx.fill();
  ctx.fillStyle = '#8fa58a'; ctx.beginPath(); ctx.arc(W * 0.74, H * 0.85, W * 0.2, PI, 0); ctx.fill();
  ctx.strokeStyle = '#2a2622'; ctx.lineWidth = W * 0.012; ctx.beginPath(); ctx.arc(W * 0.37, H * 0.5, W * 0.16, PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(W * 0.72, H * 0.28, W * 0.21, PI * 0.8, PI * 1.5); ctx.stroke();
  ctx.fillStyle = '#2a2622'; ctx.fillRect(W * 0.08, H * 0.85, W * 0.84, H * 0.007);
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(W * (0.16 + i * 0.05), H * 0.92, W * 0.009, 0, 7); ctx.fill(); }
  grainOver(ctx, W, H, 16, 3);
}
function drawBauhaus(ctx, W, H) {
  ctx.fillStyle = '#ece4d4'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d7312c'; ctx.beginPath(); ctx.arc(W * 0.62, H * 0.3, W * 0.24, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(W * 0.36, H * 0.5); ctx.rotate(0.26); ctx.fillStyle = '#1f4e9c'; ctx.fillRect(-W * 0.16, -W * 0.16, W * 0.32, W * 0.32); ctx.restore();
  ctx.fillStyle = '#f1b51c'; ctx.beginPath(); ctx.moveTo(W * 0.55, H * 0.72); ctx.lineTo(W * 0.88, H * 0.72); ctx.lineTo(W * 0.715, H * 0.45); ctx.fill();
  ctx.fillStyle = '#161616'; ctx.fillRect(W * 0.1, H * 0.08, W * 0.035, H * 0.68); ctx.fillRect(W * 0.1, H * 0.73, W * 0.8, H * 0.012);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#d7312c'; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.66, W * 0.07, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  txt(ctx, 'BAUHAUS', W * 0.1, H * 0.83, W * 0.15, '#161616', { weight: 900, align: 'left', maxW: W * 0.8 });
  txt(ctx, 'AUSSTELLUNG · FORM & FARBE', W * 0.1, H * 0.9, W * 0.035, '#161616', { weight: 600, align: 'left' });
  txt(ctx, '1923', W * 0.9, H * 0.9, W * 0.05, '#d7312c', { weight: 900, align: 'right' });
  grainOver(ctx, W, H, 12, 5);
}
function drawSunsetRiso(ctx, W, H) {
  const bands = ['#2b1e4a', '#4a2a6a', '#7a3a7a', '#b84a6e', '#e2685a', '#f2925a', '#f6b768', '#f8d79a'];
  bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * H * 0.075, W, H * 0.08); });
  ctx.fillStyle = '#f8d79a'; ctx.fillRect(0, H * 0.6, W, H * 0.4);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H * 0.62); ctx.clip();
  ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(W / 2, H * 0.62, W * 0.3, 0, 7); ctx.fill();
  for (let i = 0; i < 5; i++) { ctx.fillStyle = bands[6]; ctx.fillRect(0, H * (0.48 + i * 0.03), W, H * (0.004 + i * 0.003)); }
  ctx.restore();
  ctx.fillStyle = '#2b1e4a';
  for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.35 + i * 0.25; ctx.beginPath(); ctx.moveTo(0, H * (0.68 + i * 0.07)); for (let x = 0; x <= W; x += W / 30) ctx.lineTo(x, H * (0.68 + i * 0.07) + Math.sin(x / W * 9 + i * 2) * H * 0.012); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill(); }
  ctx.globalAlpha = 1;
  txt(ctx, spaced('SOLSTICE'), W / 2, H * 0.93, W * 0.06, '#f8d79a', { weight: 700 });
  grainOver(ctx, W, H, 26, 8);
}
function leafOutline(ctx, x, y, len, ang, wid) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wid, -len * 0.5, 0, -len); ctx.quadraticCurveTo(-wid, -len * 0.5, 0, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * 0.9); ctx.stroke(); ctx.restore();
}
function drawBotanical(variant) {
  return (ctx, W, H) => {
    ctx.fillStyle = '#f5f0e6'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#24402f'; ctx.lineWidth = W * 0.016; ctx.lineCap = 'round';
    const cx = W / 2, by = H * 0.85;
    if (variant === 0) { // fern
      ctx.beginPath(); ctx.moveTo(cx, by); ctx.quadraticCurveTo(cx + W * 0.05, H * 0.5, cx - W * 0.02, H * 0.14); ctx.stroke();
      for (let i = 0; i < 12; i++) { const t = i / 12; const y = by - t * (by - H * 0.16); const x = cx + Math.sin(t * 2.5) * W * 0.03; const L = W * 0.22 * (1 - t * 0.7); leafOutline(ctx, x, y, L, -1.2, L * 0.25); leafOutline(ctx, x, y, L, 1.2, L * 0.25); }
    } else if (variant === 1) { // eucalyptus
      ctx.beginPath(); ctx.moveTo(cx, by); ctx.bezierCurveTo(cx - W * 0.1, H * 0.6, cx + W * 0.1, H * 0.4, cx, H * 0.12); ctx.stroke();
      for (let i = 0; i < 9; i++) { const t = i / 9; const y = by - t * (by - H * 0.15); const x = cx + Math.sin(t * 5) * W * 0.05; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * W * 0.09, y, W * 0.07 * (1 - t * 0.4), W * 0.05 * (1 - t * 0.4), s * 0.3, 0, 7); ctx.stroke(); } }
    } else { // monstera
      ctx.beginPath(); ctx.moveTo(cx, by); ctx.quadraticCurveTo(cx - W * 0.02, H * 0.65, cx, H * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, H * 0.38, W * 0.32, H * 0.2, 0, 0, 7); ctx.stroke();
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const a = -PI / 2 + s * (0.4 + i * 0.45); ctx.beginPath(); ctx.moveTo(cx, H * 0.5); ctx.lineTo(cx + Math.cos(a) * W * 0.3, H * 0.38 + Math.sin(a) * H * 0.18); ctx.stroke(); }
      ctx.fillStyle = '#f5f0e6'; for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * W * (0.12 + i * 0.06), H * (0.32 + i * 0.06), W * 0.02, H * 0.02, 0, 0, 7); ctx.stroke(); }
    }
    txt(ctx, ['Polypodium', 'Eucalyptus', 'Monstera'][variant], W / 2, H * 0.93, W * 0.06, '#2f4a3a', { weight: 400, font: SERIF });
    grainOver(ctx, W, H, 10, 11 + variant);
  };
}
const HERO = ['..1111..', '.111111.', '.1232321', '.1222221', '..12221.', '.444444.', '44444444', '.445544.', '.44..44.', '.66..66.'];
function drawPixelQuest(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#1a1440'], [0.6, '#3b2a7a'], [1, '#e2685a']]);
  const rnd = seeded(31); const px = W / 64;
  ctx.fillStyle = '#ffffff'; for (let i = 0; i < 60; i++) ctx.fillRect(Math.floor(rnd() * 64) * px, Math.floor(rnd() * 40) * px, px, px);
  const cols = ['#2b1e4a', '#3e2a6a'];
  cols.forEach((c, k) => { ctx.fillStyle = c; let h = 20 + k * 6; for (let x = 0; x < 64; x++) { h += Math.floor(rnd() * 3) - 1 + (x % 12 < 6 ? 0.3 : -0.3); ctx.fillRect(x * px, H - (h + 10 - k * 6) * px * 0.9, px, H); } });
  ctx.fillStyle = '#2f6b3a'; ctx.fillRect(0, H * 0.86, W, H * 0.14); ctx.fillStyle = '#4caf50'; ctx.fillRect(0, H * 0.86, W, px);
  const pal = { 1: '#6b3a1a', 2: '#f4c79a', 3: '#111', 4: '#e63946', 5: '#ffd166', 6: '#3b2a1a' };
  const s = px * 2.4, ox = W / 2 - 4 * s, oy = H * 0.86 - 10 * s;
  HERO.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(ox + x * s, oy + y * s, s + 0.5, s + 0.5); } }));
  ctx.fillStyle = '#ffd166'; for (const [x, y] of [[12, 30], [50, 34], [30, 26]]) { ctx.fillRect(x * px, y * px, px * 2, px * 2); }
  txt(ctx, 'PIXEL', W / 2 + px, H * 0.16 + px, W * 0.17, '#e63946', { weight: 900, font: MONO });
  txt(ctx, 'PIXEL', W / 2, H * 0.16, W * 0.17, '#ffd166', { weight: 900, font: MONO });
  txt(ctx, 'QUEST', W / 2 + px, H * 0.27 + px, W * 0.17, '#e63946', { weight: 900, font: MONO });
  txt(ctx, 'QUEST', W / 2, H * 0.27, W * 0.17, '#ffd166', { weight: 900, font: MONO });
  txt(ctx, '▶ PRESS START', W / 2, H * 0.94, W * 0.05, '#ffffff', { weight: 700, font: MONO });
  ctx.imageSmoothingEnabled = false;
}
function credits(ctx, W, H, y, color) {
  ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(W * 0.018)}px ${FONT}`;
  ctx.fillText('A HOMEBODY PICTURES PRODUCTION · DIRECTED BY R. COUCH · MUSIC BY LO-FI BEATS TO STUDY TO', W / 2, y, W * 0.9);
  ctx.fillText('STARRING A VERY TIRED DELIVERY DRIVER · PRODUCED BY THE NIGHT OWL CAFÉ · RATED PG-13', W / 2, y + W * 0.025, W * 0.9);
  ctx.globalAlpha = 1;
}
function drawLastSlice(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#140a2e'], [0.55, '#5a1a6a'], [1, '#e2456a']]);
  const rnd = seeded(12); ctx.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { ctx.globalAlpha = rnd(); ctx.fillRect(rnd() * W, rnd() * H * 0.6, 1.5, 1.5); } ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(W / 2, H * 0.4, W / 2, H * 0.85); g.addColorStop(0, 'rgba(255,230,150,0.55)'); g.addColorStop(1, 'rgba(255,230,150,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W * 0.45, H * 0.42); ctx.lineTo(W * 0.55, H * 0.42); ctx.lineTo(W * 0.85, H * 0.85); ctx.lineTo(W * 0.15, H * 0.85); ctx.fill();
  ctx.save(); ctx.translate(W / 2, H * 0.3); ctx.rotate(0.15);
  ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.moveTo(-W * 0.26, -H * 0.08); ctx.lineTo(W * 0.26, -H * 0.08); ctx.lineTo(0, H * 0.13); ctx.fill();
  ctx.fillStyle = '#c47a2c'; ctx.beginPath(); ctx.ellipse(0, -H * 0.085, W * 0.27, H * 0.025, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#b8282a'; for (const [x, y] of [[-0.1, -0.03], [0.08, -0.04], [0, 0.03], [-0.02, -0.05], [0.12, -0.06]]) { ctx.beginPath(); ctx.arc(W * x, H * y, W * 0.025, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#0c0718'; let x = 0; while (x < W) { const bw = W * (0.05 + rnd() * 0.08), bh = H * (0.1 + rnd() * 0.18); ctx.fillRect(x, H * 0.85 - bh, bw - 2, bh); x += bw; } ctx.fillRect(0, H * 0.85, W, H);
  txt(ctx, 'IN SPACE, NO ONE CAN HEAR YOU ORDER.', W / 2, H * 0.05, W * 0.035, '#ffe0f0', { weight: 600 });
  txt(ctx, 'THE LAST', W / 2, H * 0.875, W * 0.07, '#ffcf5a', { weight: 900 });
  txt(ctx, 'SLICE', W / 2, H * 0.935, W * 0.17, '#ffcf5a', { weight: 900, maxW: W * 0.8 });
  credits(ctx, W, H, H * 0.975, '#ffe0f0');
}
function drawMoonMotel(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#06232a'], [0.7, '#0f4a50'], [1, '#1d6a66']]);
  ctx.fillStyle = '#f6efd2'; ctx.beginPath(); ctx.arc(W * 0.68, H * 0.24, W * 0.17, 0, 7); ctx.fill();
  ctx.fillStyle = '#06232a'; ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.fillStyle = '#0a1a1e'; ctx.fillRect(W * 0.1, H * 0.55, W * 0.8, H * 0.18);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i === 3 ? '#ffd27a' : '#20383c'; ctx.fillRect(W * (0.14 + i * 0.125), H * 0.6, W * 0.07, H * 0.08); }
  ctx.strokeStyle = '#0a1a1e'; ctx.lineWidth = W * 0.015; ctx.beginPath(); ctx.moveTo(W * 0.2, H * 0.55); ctx.lineTo(W * 0.2, H * 0.36); ctx.stroke();
  ctx.save(); ctx.shadowColor = '#ff4fa3'; ctx.shadowBlur = W * 0.03; ctx.strokeStyle = '#ff7ac0'; ctx.lineWidth = W * 0.008; ctx.strokeRect(W * 0.08, H * 0.27, W * 0.3, H * 0.09); txt(ctx, 'MOTEL', W * 0.23, H * 0.315, W * 0.07, '#ffb3dc', { weight: 800 }); txt(ctx, 'VACANCY', W * 0.23, H * 0.39, W * 0.035, '#7affd4', { weight: 700 }); ctx.restore();
  ctx.fillStyle = '#041418'; ctx.save(); ctx.translate(W * 0.88, H * 0.72); ctx.fillRect(-W * 0.008, -H * 0.3, W * 0.016, H * 0.3);
  for (let i = 0; i < 7; i++) { ctx.save(); ctx.translate(0, -H * 0.3); ctx.rotate(-PI / 2 + (i - 3) * 0.45); ctx.beginPath(); ctx.ellipse(W * 0.08, 0, W * 0.09, W * 0.018, 0, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.restore();
  txt(ctx, 'Moon Motel', W / 2, H * 0.84, W * 0.13, '#f6efd2', { weight: 700, font: SERIF, maxW: W * 0.86 });
  txt(ctx, 'CHECK IN. NEVER CHECK OUT.', W / 2, H * 0.9, W * 0.032, '#7affd4', { weight: 700 });
  credits(ctx, W, H, H * 0.95, '#a8d8d0');
}
function drawWifiQuote(ctx, W, H) {
  ctx.fillStyle = '#e8b04a'; ctx.fillRect(0, 0, W, H);
  const lines = [['HOME IS', '#1f1f1f'], ['WHERE THE', '#fff6e6'], ['WIFI', '#1f1f1f'], ['CONNECTS', '#fff6e6'], ['AUTOMATICALLY', '#1f1f1f']];
  let y = H * 0.12;
  lines.forEach(([s, c], i) => { const size = i === 2 ? H * 0.22 : H * 0.1; y += size * 0.5; txt(ctx, s, W / 2, y, size, c, { weight: 900, maxW: W * 0.84 }); y += size * 0.55 + H * 0.02; });
  ctx.fillStyle = '#1f1f1f'; for (let i = 0; i < 3; i++) { ctx.lineWidth = W * 0.012; ctx.strokeStyle = '#1f1f1f'; ctx.beginPath(); ctx.arc(W * 0.86, H * 0.47, W * (0.03 + i * 0.03), -PI * 0.75, -PI * 0.25); ctx.stroke(); }
  grainOver(ctx, W, H, 10, 2);
}
function drawCityMap(ctx, W, H) {
  ctx.fillStyle = '#f2ece0'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(W * 0.06, H * 0.05, W * 0.88, H * 0.76); ctx.clip();
  ctx.fillStyle = '#d8ccb2'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#a9c48e'; ctx.fillRect(W * 0.55, H * 0.15, W * 0.2, H * 0.25); ctx.fillRect(W * 0.12, H * 0.55, W * 0.12, H * 0.1);
  ctx.save(); ctx.translate(W / 2, H * 0.43); ctx.rotate(0.18);
  ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'butt';
  for (let i = -12; i <= 12; i++) { ctx.lineWidth = i % 4 === 0 ? W * 0.018 : W * 0.008; ctx.beginPath(); ctx.moveTo(i * W * 0.05, -H); ctx.lineTo(i * W * 0.05, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-W, i * W * 0.05); ctx.lineTo(W, i * W * 0.05); ctx.stroke(); }
  ctx.lineWidth = W * 0.02; ctx.strokeStyle = '#f2b84a'; ctx.beginPath(); ctx.moveTo(-W, -H * 0.3); ctx.lineTo(W, H * 0.4); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#6fa8c8'; ctx.lineWidth = W * 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-W * 0.1, H * 0.7); ctx.bezierCurveTo(W * 0.3, H * 0.6, W * 0.5, H * 0.9, W * 1.1, H * 0.58); ctx.stroke();
  ctx.fillStyle = '#d64a3a'; ctx.beginPath(); ctx.arc(W * 0.44, H * 0.38, W * 0.018, 0, 7); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2; ctx.strokeRect(W * 0.06, H * 0.05, W * 0.88, H * 0.76);
  txt(ctx, spaced('DOWNTOWN'), W / 2, H * 0.87, W * 0.075, '#2b2b2b', { weight: 700, maxW: W * 0.88 });
  txt(ctx, '40.7128° N  ·  74.0060° W', W / 2, H * 0.93, W * 0.03, '#6b6b6b', { weight: 500 });
}
function catHead(ctx, x, y, r, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * 0.9, y - r * 0.2); ctx.lineTo(x + s * r * 0.75, y - r * 1.35); ctx.lineTo(x + s * r * 0.2, y - r * 0.85); ctx.fill(); }
}
function drawPopCats(ctx, W, H) {
  const q = [['#ff4fa3', '#1f1fbf', '#ffe14d'], ['#22d3ee', '#ff6b1a', '#1a1a1a'], ['#ffe14d', '#d7312c', '#22d3ee'], ['#ff8c1a', '#7b2cbf', '#ffffff']];
  q.forEach(([bg, cat, eye], i) => {
    const x0 = (i % 2) * W / 2, y0 = Math.floor(i / 2) * H / 2;
    ctx.fillStyle = bg; ctx.fillRect(x0, y0, W / 2, H / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = 4; yy < H / 2; yy += 9) for (let xx = (yy / 9) % 2 ? 4 : 8; xx < W / 2; xx += 9) { ctx.beginPath(); ctx.arc(x0 + xx, y0 + yy, 2.2, 0, 7); ctx.fill(); }
    catHead(ctx, x0 + W / 4, y0 + H / 4 + H * 0.03, W * 0.13, cat);
    ctx.fillStyle = eye; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x0 + W / 4 + s * W * 0.05, y0 + H / 4 + H * 0.02, W * 0.022, W * 0.03, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x0 + W / 4 - W * 0.015, y0 + H / 4 + H * 0.075); ctx.lineTo(x0 + W / 4 + W * 0.015, y0 + H / 4 + H * 0.075); ctx.lineTo(x0 + W / 4, y0 + H / 4 + H * 0.095); ctx.fill();
  });
}
function drawWow(ctx, W, H) {
  ctx.fillStyle = '#ffe14d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ff4fa3'; for (let y = 6; y < H; y += 14) for (let x = (y / 14) % 2 ? 6 : 13; x < W; x += 14) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
  const burst = (r1, r2, c) => { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; const r = i % 2 ? r2 : r1 * (0.85 + (i % 4) * 0.08); ctx.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); };
  burst(W * 0.5, W * 0.3, '#111'); burst(W * 0.46, W * 0.27, '#e63946');
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.15);
  ctx.font = `900 ${W * 0.26}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111'; ctx.fillText('WOW!', W * 0.02, W * 0.02); ctx.lineWidth = W * 0.02; ctx.strokeStyle = '#111'; ctx.strokeText('WOW!', 0, 0); ctx.fillStyle = '#ffffff'; ctx.fillText('WOW!', 0, 0);
  ctx.restore();
}
function ridge(ctx, W, H, base, amp, rnd, color, steps = 40) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
  let y = base;
  for (let i = 0; i <= steps; i++) { y += (rnd() - 0.5) * amp; y = Math.min(base + amp, Math.max(base - amp * 2, y)); ctx.lineTo(i / steps * W, y); }
  ctx.lineTo(W, H); ctx.fill();
}
function drawMountains(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#f6c9a8'], [0.45, '#f4dcc0'], [1, '#c9d6de']]);
  ctx.fillStyle = '#fff3e0'; ctx.beginPath(); ctx.arc(W * 0.7, H * 0.32, H * 0.1, 0, 7); ctx.fill();
  const rnd = seeded(17);
  ['#a9b9c9', '#7f95ab', '#56708a', '#33485f'].forEach((c, i) => ridge(ctx, W, H, H * (0.42 + i * 0.12), H * 0.07, rnd, c, 30 + i * 6));
  ctx.fillStyle = '#1f2d3a';
  for (let i = 0; i < 26; i++) { const x = rnd() * W, h = H * (0.08 + rnd() * 0.1), y = H * (0.9 + rnd() * 0.08); ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.28, y); ctx.lineTo(x - h * 0.28, y); ctx.fill(); }
  grainOver(ctx, W, H, 10, 17);
}
function drawOcean(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#cfe7ee'], [0.42, '#f6efe0'], [0.43, '#3f8fa6'], [1, '#14506a']]);
  ctx.fillStyle = '#fff7e0'; ctx.beginPath(); ctx.arc(W * 0.25, H * 0.3, H * 0.08, 0, 7); ctx.fill();
  const rnd = seeded(4);
  for (let i = 0; i < 7; i++) {
    const y = H * (0.48 + i * 0.075), amp = H * 0.012 * (1 + i * 0.4);
    ctx.fillStyle = ['#4f9fb6', '#3f8fa6', '#2f7f96', '#24708a', '#1a607c', '#14506a', '#0e4560'][i];
    ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += W / 40) ctx.lineTo(x, y + Math.sin(x / W * (8 + i) + i * 1.3) * amp); ctx.lineTo(W, H); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5 + i * 0.4; ctx.beginPath(); for (let x = 0; x <= W; x += W / 40) { const yy = y + Math.sin(x / W * (8 + i) + i * 1.3) * amp; if (rnd() < 0.6) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); } ctx.stroke();
  }
  ctx.fillStyle = '#f2d3a0'; ctx.beginPath(); ctx.moveTo(W * 0.6, H); ctx.quadraticCurveTo(W * 0.8, H * 0.86, W, H * 0.82); ctx.lineTo(W, H); ctx.fill();
  grainOver(ctx, W, H, 8, 4);
}
function drawCatPortrait(ctx, W, H) {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, W * 0.1, W / 2, H * 0.5, W * 0.8); g.addColorStop(0, '#5a4128'); g.addColorStop(1, '#1a120b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7a1424'; ctx.beginPath(); ctx.ellipse(W / 2, H * 1.0, W * 0.48, H * 0.38, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9a35c'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(W / 2, H * (0.74 + i * 0.05), W * 0.012, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#f4efe2'; ctx.strokeStyle = '#c9c0ae'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; ctx.beginPath(); ctx.ellipse(W / 2 + Math.cos(a) * W * 0.2, H * 0.62 + Math.sin(a) * H * 0.05, W * 0.06, H * 0.04, a, 0, 7); ctx.fill(); ctx.stroke(); }
  catHead(ctx, W / 2, H * 0.45, W * 0.21, '#8a8580');
  ctx.fillStyle = '#e8e2d8'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.52, W * 0.11, H * 0.06, 0, 0, 7); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#9ac46a'; ctx.beginPath(); ctx.ellipse(W / 2 + s * W * 0.08, H * 0.42, W * 0.04, H * 0.03, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(W / 2 + s * W * 0.08, H * 0.42, W * 0.008, H * 0.026, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#f4efe2'; ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + s * W * 0.06, H * (0.51 + k * 0.012)); ctx.lineTo(W / 2 + s * W * 0.25, H * (0.49 + k * 0.025)); ctx.stroke(); }
  }
  ctx.fillStyle = '#d98a94'; ctx.beginPath(); ctx.moveTo(W / 2 - W * 0.02, H * 0.49); ctx.lineTo(W / 2 + W * 0.02, H * 0.49); ctx.lineTo(W / 2, H * 0.51); ctx.fill();
  ctx.fillStyle = '#c9a35c'; ctx.beginPath(); ctx.moveTo(W * 0.4, H * 0.22); for (let i = 0; i <= 4; i++) ctx.lineTo(W * (0.4 + i * 0.05), H * (i % 2 ? 0.2 : 0.14)); ctx.lineTo(W * 0.6, H * 0.22); ctx.fill();
  const rnd = seeded(66); for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,220' : '0,0,0'},0.05)`; ctx.fillRect(rnd() * W, rnd() * H, 6 + rnd() * 10, 2); }
  grainOver(ctx, W, H, 14, 6);
}
function drawSaturn(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#0b1030'], [0.7, '#1f2a5a'], [1, '#e2a05a']]);
  const rnd = seeded(9); ctx.fillStyle = '#fff'; for (let i = 0; i < 120; i++) { ctx.globalAlpha = 0.4 + rnd() * 0.6; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * 0.75, rnd() * 1.6, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
  const cx = W * 0.52, cy = H * 0.42, r = W * 0.22;
  ctx.strokeStyle = '#e8c88f'; ctx.lineWidth = W * 0.03; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.8, r * 0.45, -0.3, PI, PI * 2); ctx.stroke();
  const pg = ctx.createLinearGradient(cx, cy - r, cx, cy + r); pg.addColorStop(0, '#f2d9a0'); pg.addColorStop(0.5, '#d9a25a'); pg.addColorStop(1, '#a8683a');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip(); ctx.strokeStyle = 'rgba(120,70,30,0.35)'; ctx.lineWidth = W * 0.015; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(cx, cy + i * r * 0.28, r * 1.2, r * 0.12, -0.3, 0, 7); ctx.stroke(); } ctx.restore();
  ctx.strokeStyle = '#e8c88f'; ctx.lineWidth = W * 0.03; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.8, r * 0.45, -0.3, 0, PI); ctx.stroke();
  ctx.fillStyle = '#cfd6e6'; ctx.beginPath(); ctx.arc(W * 0.18, H * 0.2, W * 0.04, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(W * 0.2, H * 0.68); ctx.rotate(-0.6); ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(0, 0, W * 0.03, W * 0.08, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(-W * 0.03, W * 0.04); ctx.lineTo(-W * 0.05, W * 0.09); ctx.lineTo(W * 0.05, W * 0.09); ctx.lineTo(W * 0.03, W * 0.04); ctx.fill(); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-W * 0.02, W * 0.09); ctx.lineTo(0, W * 0.16); ctx.lineTo(W * 0.02, W * 0.09); ctx.fill(); ctx.restore();
  txt(ctx, 'VISIT', W / 2, H * 0.8, W * 0.08, '#f2d9a0', { weight: 700, font: SERIF });
  txt(ctx, 'SATURN', W / 2, H * 0.88, W * 0.17, '#f2d9a0', { weight: 900, maxW: W * 0.86 });
  txt(ctx, 'THE JEWEL OF THE SOLAR SYSTEM', W / 2, H * 0.95, W * 0.032, '#0b1030', { weight: 700 });
  grainOver(ctx, W, H, 14, 9);
}
function drawWave(ctx, W, H) {
  ctx.fillStyle = '#efe3c6'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d9c9a6'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(W * (0.6 + i * 0.08), H * (0.15 + (i % 2) * 0.05), W * 0.08, H * 0.03, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#1f3a5f'; ctx.beginPath(); ctx.moveTo(W * 0.62, H * 0.72); ctx.lineTo(W * 0.75, H * 0.5); ctx.lineTo(W * 0.88, H * 0.72); ctx.fill();
  ctx.fillStyle = '#efe3c6'; ctx.beginPath(); ctx.moveTo(W * 0.715, H * 0.56); ctx.lineTo(W * 0.75, H * 0.5); ctx.lineTo(W * 0.785, H * 0.56); ctx.lineTo(W * 0.765, H * 0.55); ctx.lineTo(W * 0.75, H * 0.57); ctx.lineTo(W * 0.735, H * 0.55); ctx.fill();
  const blue = ['#1f3a5f', '#2f5a85', '#6f9bc0'];
  ctx.fillStyle = blue[0];
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.55); ctx.bezierCurveTo(W * 0.1, H * 0.2, W * 0.45, H * 0.05, W * 0.6, H * 0.25);
  ctx.bezierCurveTo(W * 0.66, H * 0.33, W * 0.6, H * 0.42, W * 0.52, H * 0.38); ctx.bezierCurveTo(W * 0.46, H * 0.35, W * 0.48, H * 0.28, W * 0.53, H * 0.29);
  ctx.bezierCurveTo(W * 0.4, H * 0.2, W * 0.2, H * 0.45, W * 0.35, H * 0.8); ctx.lineTo(W * 0.6, H * 0.85); ctx.bezierCurveTo(W * 0.75, H * 0.75, W * 0.9, H * 0.8, W, H * 0.76); ctx.lineTo(W, H); ctx.fill();
  ctx.strokeStyle = blue[2]; ctx.lineWidth = W * 0.006; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(W * 0.04 + i * W * 0.03, H * 0.95); ctx.bezierCurveTo(W * (0.1 + i * 0.03), H * (0.5 + i * 0.02), W * 0.35, H * (0.2 + i * 0.03), W * (0.55 - i * 0.01), H * (0.27 + i * 0.015)); ctx.stroke(); }
  ctx.fillStyle = '#fbf6ea'; const rnd = seeded(3);
  for (let i = 0; i < 26; i++) { const t = i / 26; const x = W * (0.1 + t * 0.5), y = H * (0.42 - Math.sin(t * PI) * 0.24 + (t > 0.85 ? (t - 0.85) * 1.2 : 0)); ctx.beginPath(); ctx.arc(x, y, W * (0.012 + rnd() * 0.012), 0, 7); ctx.fill(); }
  ctx.fillStyle = '#b8282a'; ctx.fillRect(W * 0.86, H * 0.06, W * 0.07, H * 0.12); txt(ctx, '浪', W * 0.895, H * 0.12, W * 0.05, '#efe3c6', { weight: 700, font: SERIF });
  grainOver(ctx, W, H, 14, 21);
}
function drawMemphis(ctx, W, H) {
  ctx.fillStyle = '#fbd3d0'; ctx.fillRect(0, 0, W, H);
  const rnd = seeded(41); const cols = ['#1a1a1a', '#22b8b0', '#ffd23f', '#5b5bd6', '#ff6b4a'];
  for (let i = 0; i < 34; i++) {
    const x = rnd() * W * 0.9, y = rnd() * H * 0.92, c = cols[Math.floor(rnd() * cols.length)], s = W * (0.08 + rnd() * 0.09), k = i % 5;
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = W * 0.02; ctx.lineCap = 'round';
    if (k === 0) { ctx.beginPath(); for (let t = 0; t <= 1; t += 0.05) ctx.lineTo(x + t * s * 2, y + Math.sin(t * PI * 3) * s * 0.3); ctx.stroke(); }
    else if (k === 1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s * 0.2); ctx.lineTo(x + s * 0.3, y + s); ctx.fill(); }
    else if (k === 2) { for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(x + a * s * 0.3, y + b * s * 0.3, s * 0.06, 0, 7); ctx.fill(); } }
    else if (k === 3) { ctx.beginPath(); for (let t = 0; t <= 6; t++) ctx.lineTo(x + t * s * 0.25, y + (t % 2) * s * 0.25); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, s * 0.5, PI, 0); ctx.stroke(); }
  }
}
function drawCutouts(ctx, W, H) {
  ctx.fillStyle = '#f4ecdc'; ctx.fillRect(0, 0, W, H);
  const rnd = seeded(8);
  const shape = (cx, cy, s, rot, c) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, s);
    for (let i = 0; i <= 10; i++) { const t = i / 10; const y = s - t * s * 2; const w = Math.sin(t * PI) * s * 0.35 + (i % 2 ? s * 0.18 : 0); ctx.lineTo(w, y); }
    for (let i = 10; i >= 0; i--) { const t = i / 10; const y = s - t * s * 2; const w = Math.sin(t * PI) * s * 0.35 + (i % 2 ? 0 : s * 0.18); ctx.lineTo(-w, y); }
    ctx.fill(); ctx.restore();
  };
  shape(W * 0.35, H * 0.4, H * 0.28, 0.15, '#2442a8'); shape(W * 0.7, H * 0.62, H * 0.22, -0.3, '#e5674a'); shape(W * 0.25, H * 0.78, H * 0.12, 0.8, '#e0a83e');
  ctx.fillStyle = '#e5674a'; for (let i = 0; i < 4; i++) blob(ctx, W * (0.15 + rnd() * 0.7), H * (0.1 + rnd() * 0.8), W * 0.035, 5, rnd, 0.4);
  ctx.fillStyle = '#2442a8'; blob(ctx, W * 0.78, H * 0.2, W * 0.08, 6, rnd, 0.3);
  grainOver(ctx, W, H, 10, 8);
}
function drawColorField(ctx, W, H) {
  ctx.fillStyle = '#5a1418'; ctx.fillRect(0, 0, W, H);
  const soft = (x, y, w, h, c) => { ctx.save(); ctx.filter = `blur(${Math.round(W * 0.012)}px)`; ctx.fillStyle = c; ctx.fillRect(x, y, w, h); ctx.restore(); };
  soft(W * 0.08, H * 0.06, W * 0.84, H * 0.5, '#c2272d'); soft(W * 0.1, H * 0.08, W * 0.8, H * 0.46, '#d63a2e');
  soft(W * 0.08, H * 0.62, W * 0.84, H * 0.3, '#e8862a'); soft(W * 0.1, H * 0.64, W * 0.8, H * 0.26, '#f0a03a');
  const rnd = seeded(19); for (let i = 0; i < 1600; i++) { ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,200,150' : '60,0,0'},0.04)`; ctx.fillRect(rnd() * W, rnd() * H, 10 + rnd() * 30, 2 + rnd() * 3); }
  grainOver(ctx, W, H, 10, 19);
}
function drawGesture(ctx, W, H) {
  ctx.fillStyle = '#f2eee6'; ctx.fillRect(0, 0, W, H);
  const rnd = seeded(7); const cols = ['#111111', '#d7312c', '#f1b51c', '#1f4e9c', '#111111', '#e8e2d6'];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)]; ctx.globalAlpha = 0.75 + rnd() * 0.25; ctx.lineWidth = W * (0.006 + rnd() * 0.035);
    ctx.beginPath(); let x = rnd() * W, y = rnd() * H; ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { const nx = x + (rnd() - 0.5) * W * 0.4, ny = y + (rnd() - 0.5) * H * 0.4; ctx.quadraticCurveTo((x + nx) / 2 + (rnd() - 0.5) * W * 0.2, (y + ny) / 2 + (rnd() - 0.5) * H * 0.2, nx, ny); x = nx; y = ny; }
    ctx.stroke();
    if (rnd() < 0.3) { ctx.lineWidth = W * 0.004; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 4, y + H * (0.05 + rnd() * 0.15)); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  grainOver(ctx, W, H, 12, 7);
}
function drawKintsugiGround(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#1c1c1e'], [1, '#0e0e10']], 0, 0, W, H);
  const rnd = seeded(51); for (let i = 0; i < 2000; i++) { ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`; ctx.fillRect(rnd() * W, rnd() * H, 3 + rnd() * 6, 1 + rnd() * 2); }
  grainOver(ctx, W, H, 10, 51);
}
function kintsugiVeins(w, h) {
  return sharedGeo(`kintsugi:${w}:${h}`, () => {
    const rnd = seeded(88); const parts = [];
    const walk = (x, y, ang, n, r) => {
      const pts = [new THREE.Vector3(x, y, 0)];
      for (let i = 0; i < n; i++) { ang += (rnd() - 0.5) * 1.1; x += Math.cos(ang) * 0.07; y += Math.sin(ang) * 0.07; x = Math.max(-w / 2 + 0.02, Math.min(w / 2 - 0.02, x)); y = Math.max(-h / 2 + 0.02, Math.min(h / 2 - 0.02, y)); pts.push(new THREE.Vector3(x, y, 0)); if (rnd() < 0.18 && r > 0.003) walk(x, y, ang + (rnd() < 0.5 ? 0.9 : -0.9), 3 + Math.floor(rnd() * 4), r * 0.6); }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 4, r, 5));
    };
    walk(-w / 2 + 0.02, h * 0.2, -0.3, 16, 0.006); walk(w * 0.1, h / 2 - 0.02, -1.8, 13, 0.005); walk(w / 2 - 0.02, -h * 0.25, 2.9, 10, 0.0045);
    return mergeGeometries(parts.map((p) => p.toNonIndexed()));
  });
}
function drawLakeLuna(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#f7d9a6'], [0.4, '#f0b67f'], [0.41, '#7aa8b8'], [1, '#2f6f86']]);
  ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.3, W * 0.12, 0, 7); ctx.fill();
  ctx.fillStyle = '#5a7a8a'; ctx.beginPath(); ctx.moveTo(0, H * 0.41); ctx.lineTo(W * 0.2, H * 0.24); ctx.lineTo(W * 0.35, H * 0.34); ctx.lineTo(W * 0.5, H * 0.2); ctx.lineTo(W * 0.68, H * 0.36); ctx.lineTo(W * 0.82, H * 0.26); ctx.lineTo(W, H * 0.41); ctx.fill();
  ctx.fillStyle = '#3e5a6a'; ctx.beginPath(); ctx.moveTo(0, H * 0.41); ctx.lineTo(W * 0.12, H * 0.33); ctx.lineTo(W * 0.3, H * 0.41); ctx.fill(); ctx.beginPath(); ctx.moveTo(W * 0.6, H * 0.41); ctx.lineTo(W * 0.85, H * 0.31); ctx.lineTo(W, H * 0.38); ctx.lineTo(W, H * 0.41); ctx.fill();
  ctx.fillStyle = 'rgba(255,243,214,0.6)'; for (let i = 0; i < 8; i++) ctx.fillRect(W * (0.44 + (i % 2) * 0.03), H * (0.43 + i * 0.03), W * (0.1 - i * 0.008), H * 0.006);
  ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.58); ctx.lineTo(W * 0.3, H * 0.47); ctx.lineTo(W * 0.37, H * 0.58); ctx.fill();
  ctx.fillStyle = '#7a2e2e'; ctx.fillRect(W * 0.25, H * 0.58, W * 0.14, H * 0.015);
  ctx.fillStyle = '#1f3a4a'; ctx.fillRect(0, H * 0.74, W, H * 0.26);
  txt(ctx, spaced('LAKE LUNA'), W / 2, H * 0.82, W * 0.1, '#f7d9a6', { weight: 800, maxW: W * 0.9 });
  txt(ctx, 'BY OVERNIGHT RAIL · NORTHERN LINES', W / 2, H * 0.9, W * 0.035, '#7aa8b8', { weight: 600 });
  grainOver(ctx, W, H, 14, 13);
}
function drawGig(ctx, W, H) {
  ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#ff6fa8'; ctx.beginPath(); ctx.arc(W * 0.55, H * 0.42, W * 0.36, 0, 7); ctx.fill();
  ctx.fillStyle = '#2bb673';
  ctx.save(); ctx.translate(W * 0.45, H * 0.45); ctx.rotate(-0.4); ctx.beginPath(); ctx.ellipse(0, 0, W * 0.3, H * 0.2, 0, 0, 7); ctx.fill(); ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#f4efe2'; ctx.lineWidth = W * 0.02; ctx.save(); ctx.translate(W * 0.45, H * 0.45); ctx.rotate(-0.4); for (let i = -3; i <= 3; i++) { if (!i) continue; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(i * W * 0.08, -H * 0.2); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-W * 0.3, 0); ctx.lineTo(W * 0.3, 0); ctx.stroke(); ctx.restore();
  txt(ctx, 'THE', W * 0.08, H * 0.1, W * 0.07, '#2bb673', { weight: 900, align: 'left' });
  txt(ctx, 'HOUSEPLANTS', W / 2, H * 0.78, W * 0.15, '#1a1a1a', { weight: 900, maxW: W * 0.92 });
  txt(ctx, 'LIVE AT THE ATTIC', W / 2, H * 0.86, W * 0.06, '#ff6fa8', { weight: 800 });
  txt(ctx, 'FRI · 9PM · $12 · ALL AGES', W / 2, H * 0.92, W * 0.04, '#1a1a1a', { weight: 600 });
  grainOver(ctx, W, H, 22, 31);
}
function drawSkylinePhoto(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#1a1a1a'], [0.55, '#5a5a5a'], [0.56, '#2a2a2a'], [1, '#111111']]);
  const rnd = seeded(14); let x = 0;
  const bld = [];
  while (x < W) { const bw = W * (0.03 + rnd() * 0.06), bh = H * (0.12 + rnd() * 0.32); bld.push([x, bw, bh]); x += bw + 1; }
  for (const [bx, bw, bh] of bld) {
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(bx, H * 0.56 - bh, bw, bh);
    ctx.fillStyle = '#d9d9d9'; for (let wy = H * 0.56 - bh + 4; wy < H * 0.55; wy += 6) for (let wx = bx + 2; wx < bx + bw - 2; wx += 5) if (rnd() < 0.3) ctx.fillRect(wx, wy, 2, 3);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#d9d9d9'; for (let wy = 0; wy < bh * 0.6; wy += 5) if (rnd() < 0.4) ctx.fillRect(bx + 2, H * 0.57 + wy, bw - 4, 1.5); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.14, W * 0.03, 0, 7); ctx.fill();
  grainOver(ctx, W, H, 30, 14);
}
function drawLemons(ctx, W, H) {
  ctx.fillStyle = '#f7f3ea'; ctx.fillRect(0, 0, W, H);
  const s = W / 4;
  for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
    ctx.fillStyle = '#2350a0';
    for (const [cx, cy] of [[x, y], [x + s, y], [x, y + s], [x + s, y + s]]) { ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, 7); ctx.fill(); }
    ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2, r = k % 2 ? s * 0.08 : s * 0.2; ctx.lineTo(x + s / 2 + Math.cos(a) * r, y + s / 2 + Math.sin(a) * r); } ctx.fill();
    ctx.strokeStyle = '#9cb7e0'; ctx.lineWidth = 2; ctx.strokeRect(x, y, s, s);
  }
  const rnd = seeded(5);
  for (let i = 0; i < 6; i++) {
    const x = W * (0.18 + (i % 3) * 0.32 + (rnd() - 0.5) * 0.08), y = H * (0.2 + Math.floor(i / 3) * 0.38 + (rnd() - 0.5) * 0.08), a = rnd() * PI;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#2f6b2a'; ctx.beginPath(); ctx.ellipse(W * 0.12, -W * 0.05, W * 0.09, W * 0.032, 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#f6c917'; ctx.beginPath(); ctx.ellipse(0, 0, W * 0.13, W * 0.095, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.13, 0, W * 0.02, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-W * 0.04, -W * 0.035, W * 0.045, W * 0.016, -0.3, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f7f3ea'; ctx.fillRect(W * 0.2, H * 0.86, W * 0.6, H * 0.09);
  txt(ctx, 'LIMONI', W / 2, H * 0.905, W * 0.09, '#2350a0', { weight: 700, font: SERIF });
}
function drawStarMap(ctx, W, H) {
  ctx.fillStyle = '#101a33'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.4, r = W * 0.38;
  ctx.strokeStyle = '#e8d9b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, 7); ctx.clip();
  const rnd = seeded(27); const stars = [];
  for (let i = 0; i < 160; i++) { const a = rnd() * PI * 2, rr = Math.sqrt(rnd()) * r; const s = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rnd() * 1.8 + 0.4]; stars.push(s); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s[0], s[1], s[2], 0, 7); ctx.fill(); }
  ctx.strokeStyle = 'rgba(232,217,176,0.7)'; ctx.lineWidth = 1;
  for (let c = 0; c < 6; c++) { const k = Math.floor(rnd() * 150); ctx.beginPath(); for (let j = 0; j < 5; j++) { const s = stars[(k + j * 3) % stars.length]; j ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); } ctx.stroke(); }
  ctx.restore();
  txt(ctx, 'THE NIGHT WE MOVED IN', W / 2, H * 0.86, W * 0.06, '#e8d9b0', { weight: 600, font: SERIF, maxW: W * 0.86 });
  txt(ctx, 'DOWNTOWN · 23:41', W / 2, H * 0.92, W * 0.032, '#9aa6c4', { weight: 500 });
}
function drawCorgi(ctx, W, H) {
  ctx.fillStyle = '#bfe3dd'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f6cfa0'; ctx.beginPath(); ctx.arc(W / 2, H * 0.45, W * 0.38, 0, 7); ctx.fill();
  const cx = W / 2, cy = H * 0.47;
  ctx.fillStyle = '#e08a3a';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * W * 0.08, cy - H * 0.1); ctx.lineTo(cx + s * W * 0.25, cy - H * 0.33); ctx.lineTo(cx + s * W * 0.28, cy - H * 0.04); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.26, H * 0.17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx, cy - H * 0.15); ctx.quadraticCurveTo(cx + W * 0.06, cy, cx + W * 0.16, cy + H * 0.12); ctx.lineTo(cx - W * 0.16, cy + H * 0.12); ctx.quadraticCurveTo(cx - W * 0.06, cy, cx, cy - H * 0.15); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.08, W * 0.14, H * 0.08, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2a2a'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * W * 0.1, cy - H * 0.01, W * 0.025, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.05, W * 0.035, H * 0.022, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.12, W * 0.035, H * 0.04, 0, 0, PI); ctx.fill();
  ctx.fillStyle = '#ff9fb0'; for (const s of [-1, 1]) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx + s * W * 0.16, cy + H * 0.05, W * 0.03, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
  txt(ctx, 'GOOD BOY', W / 2, H * 0.9, W * 0.13, '#2a5a5a', { weight: 900, maxW: W * 0.86 });
}
function drawCoffeeGuide(ctx, W, H) {
  ctx.fillStyle = '#f4ece0'; ctx.fillRect(0, 0, W, H);
  txt(ctx, 'COFFEE GUIDE', W / 2, H * 0.08, W * 0.08, '#3b2414', { weight: 900 });
  const drinks = [['ESPRESSO', [['#3b2414', 1]]], ['MACCHIATO', [['#3b2414', 0.7], ['#f6efe4', 0.3]]], ['CAPPUCCINO', [['#3b2414', 0.34], ['#d9b48a', 0.33], ['#f6efe4', 0.33]]], ['LATTE', [['#3b2414', 0.25], ['#d9b48a', 0.6], ['#f6efe4', 0.15]]], ['MOCHA', [['#3b2414', 0.3], ['#6b3a1a', 0.35], ['#f6efe4', 0.35]]], ['AMERICANO', [['#3b2414', 0.35], ['#8a5a3a', 0.65]]]];
  drinks.forEach(([name, layers], i) => {
    const cx = W * (0.25 + (i % 2) * 0.5), cy = H * (0.28 + Math.floor(i / 2) * 0.27), cw = W * 0.26, ch = H * 0.13;
    let y = cy + ch / 2;
    layers.forEach(([c, f]) => { const hh = ch * f; ctx.fillStyle = c; ctx.fillRect(cx - cw / 2 + 3, y - hh, cw - 6, hh); y -= hh; });
    ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - cw / 2, cy - ch / 2); ctx.lineTo(cx - cw / 2, cy + ch / 2); ctx.lineTo(cx + cw / 2, cy + ch / 2); ctx.lineTo(cx + cw / 2, cy - ch / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + cw / 2 + W * 0.025, cy, W * 0.03, -PI / 2, PI / 2); ctx.stroke();
    txt(ctx, name, cx, cy + ch / 2 + H * 0.035, W * 0.04, '#3b2414', { weight: 700 });
  });
  grainOver(ctx, W, H, 10, 15);
}
function drawSunTapestry(ctx, W, H) {
  ctx.fillStyle = '#f1e6d2'; ctx.fillRect(0, 0, W, H);
  const cols = ['#c8664a', '#e0a83e', '#d9b48a', '#8fa58a'];
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(W / 2, H * 0.95, W * (0.45 - i * 0.08), PI, 0); ctx.fill(); });
  ctx.fillStyle = '#f1e6d2'; ctx.beginPath(); ctx.arc(W / 2, H * 0.95, W * 0.13, PI, 0); ctx.fill();
  ctx.fillStyle = '#c8664a'; ctx.beginPath(); ctx.arc(W / 2, H * 0.3, W * 0.13, 0, 7); ctx.fill();
  ctx.strokeStyle = '#c8664a'; ctx.lineWidth = W * 0.012; ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * W * 0.17, H * 0.3 + Math.sin(a) * W * 0.17); ctx.lineTo(W / 2 + Math.cos(a) * W * (i % 2 ? 0.24 : 0.28), H * 0.3 + Math.sin(a) * W * (i % 2 ? 0.24 : 0.28)); ctx.stroke(); }
  ctx.fillStyle = '#3a2a22'; const rnd = seeded(2);
  for (let i = 0; i < 14; i++) { const x = rnd() * W, y = rnd() * H * 0.55; if (Math.hypot(x - W / 2, y - H * 0.3) < W * 0.3) continue; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2, r = k % 2 ? W * 0.006 : W * 0.016; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); }
  grainOver(ctx, W, H, 18, 2);
}
function drawMushroomTapestry(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#1d3a2e'], [1, '#2f5a40']]);
  ctx.fillStyle = '#f4ead2'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.16, W * 0.08, 0, 7); ctx.fill();
  const rnd = seeded(12);
  ctx.strokeStyle = '#6fa060'; ctx.lineWidth = W * 0.006;
  for (let i = 0; i < 8; i++) { const x = rnd() * W, y = H * (0.7 + rnd() * 0.3); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + W * 0.05, y - H * 0.15, x + W * 0.12, y - H * 0.2); ctx.stroke(); for (let k = 1; k < 8; k++) { const t = k / 8; const px = x + t * W * 0.1, py = y - t * H * 0.18; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - W * 0.03, py - H * 0.01); ctx.moveTo(px, py); ctx.lineTo(px + W * 0.02, py + H * 0.02); ctx.stroke(); } }
  const shroom = (x, y, s, cap) => {
    ctx.fillStyle = '#f4ead2'; ctx.beginPath(); ctx.moveTo(x - s * 0.18, y); ctx.lineTo(x - s * 0.13, y - s * 0.8); ctx.lineTo(x + s * 0.13, y - s * 0.8); ctx.lineTo(x + s * 0.18, y); ctx.fill();
    ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(x, y - s * 0.8, s * 0.5, s * 0.35, 0, PI, 0); ctx.fill();
    ctx.fillStyle = '#f4ead2'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + (k - 2) * s * 0.17, y - s * (0.9 + (k % 2) * 0.12), s * 0.04, 0, 7); ctx.fill(); }
  };
  shroom(W * 0.3, H * 0.92, W * 0.42, '#d64a3a'); shroom(W * 0.62, H * 0.94, W * 0.3, '#e0a83e'); shroom(W * 0.82, H * 0.96, W * 0.18, '#d64a3a'); shroom(W * 0.12, H * 0.97, W * 0.14, '#e0a83e');
  ctx.fillStyle = '#f4ead2'; for (let i = 0; i < 30; i++) { ctx.globalAlpha = rnd(); ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * 0.5, 1.5, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
  grainOver(ctx, W, H, 18, 12);
}
function drawImpressionist(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#f0c27a'], [0.35, '#e98a5a'], [0.5, '#8a5a8a'], [0.52, '#3a5a8a'], [1, '#1f3a5a']]);
  const rnd = seeded(101);
  const pal = (y) => y < 0.3 ? ['#ffd79a', '#f6a96a', '#ffe9c0', '#e98a5a'] : y < 0.5 ? ['#e98a5a', '#b86a8a', '#ffb07a', '#8a5a8a'] : ['#3a6a9a', '#ffcf8a', '#2a4a7a', '#5a8aba', '#1f3a5a'];
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * H, p = pal(y / H);
    ctx.fillStyle = p[Math.floor(rnd() * p.length)]; ctx.globalAlpha = 0.55 + rnd() * 0.4;
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.5); ctx.fillRect(-W * 0.012, -H * 0.004, W * (0.016 + rnd() * 0.012), H * 0.008); ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff1c0'; ctx.beginPath(); ctx.arc(W * 0.62, H * 0.42, W * 0.045, 0, 7); ctx.fill();
  for (let i = 0; i < 40; i++) { ctx.fillStyle = rnd() < 0.5 ? '#ffe9a0' : '#ffcf7a'; ctx.globalAlpha = 0.8; ctx.fillRect(W * 0.62 - W * 0.04 + (rnd() - 0.5) * W * 0.06 * (1 + i / 20), H * (0.53 + i * 0.01), W * (0.02 + rnd() * 0.03), H * 0.006); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1a2230'; ctx.beginPath(); ctx.moveTo(W * 0.15, H * 0.62); ctx.lineTo(W * 0.3, H * 0.62); ctx.lineTo(W * 0.27, H * 0.65); ctx.lineTo(W * 0.17, H * 0.65); ctx.fill(); ctx.fillRect(W * 0.22, H * 0.5, W * 0.004, H * 0.12);
  grainOver(ctx, W, H, 10, 101);
}
function drawCoast(ctx, W, H) {
  gradient(ctx, W, H, [[0, '#cfe0e6'], [0.45, '#f6d9b8'], [0.46, '#5f9fb2'], [0.7, '#2f6f86'], [0.71, '#e2c79a'], [1, '#b8955e']]);
  ctx.fillStyle = '#c8664a'; ctx.beginPath(); ctx.arc(W * 0.66, H * 0.35, H * 0.07, 0, 7); ctx.fill();
  ctx.fillStyle = '#8fa58a'; ctx.beginPath(); ctx.moveTo(0, H * 0.46); ctx.quadraticCurveTo(W * 0.12, H * 0.3, W * 0.25, H * 0.46); ctx.fill();
  ctx.fillStyle = '#6f8a6a'; ctx.beginPath(); ctx.moveTo(W * 0.82, H * 0.46); ctx.quadraticCurveTo(W * 0.92, H * 0.36, W, H * 0.42); ctx.lineTo(W, H * 0.46); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { ctx.beginPath(); for (let x = 0; x <= W; x += W / 60) ctx.lineTo(x, H * (0.5 + i * 0.035) + Math.sin(x / W * 30 + i) * 2); ctx.stroke(); }
  grainOver(ctx, W, H, 12, 44);
}
const subDraw = (draw, i, n) => (ctx, W, H) => { ctx.save(); ctx.translate(-i * W, 0); draw(ctx, W * n, H); ctx.restore(); };
function triptych({ w, h, gap, key, draw }) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const c = canvasArt({ w, h, key: key + i, draw: subDraw(draw, i, 3) }); c.position.x = (i - 1) * (w + gap); g.add(c); }
  return g;
}

// ------------------------------------------------------------------ definitions
const A = (o) => ({ category: 'art', place: 'wall', emoji: '🖼️', ...o, use: { type: 'decor', verb: o.verb || 'Admire', lines: o.lines } });
const FR = (o) => A({ tags: ['framed'], ...o });

defineItems([
  // ---------------------------------------------------------- posters & everyday prints
  FR({ id: 'art_midcentury_arch', name: 'Mid-Century Arches Print', price: 79, stores: ['arthaus', 'nestly'], desc: 'Terracotta arch, mustard sun, sage hill — framed in natural oak.', lines: ['Warm, calm, very "I have my life together".', 'The shapes balance perfectly. You feel balanced too.'], build: () => framedArt({ w: 0.5, h: 0.7, key: 'midcentury', draw: drawMidCentury, frame: 'oak' }) }),
  A({ id: 'art_bauhaus_poster', name: 'Bauhaus Exhibition Poster', price: 24, stores: ['arthaus'], desc: 'Primary colours and bold geometry, taped up gallery-casual.', lines: ['Form follows function. Function: looking cool.', 'Red circle, blue square, yellow triangle. Iconic.'], build: () => poster({ w: 0.5, h: 0.7, key: 'bauhaus', draw: drawBauhaus }) }),
  FR({ id: 'art_riso_solstice', name: '"Solstice" Riso Print', price: 49, stores: ['arthaus', 'nestly'], desc: 'Grainy risograph sunset in purples and peaches, white frame with a mat.', lines: ['You can almost feel the warmth.', 'The grain makes it feel handmade. Because it is.'], build: () => framedArt({ w: 0.36, h: 0.48, key: 'riso', draw: drawSunsetRiso, frame: 'white', matW: 0.05 }) }),
  FR({ id: 'art_botanical_trio', name: 'Botanical Line Art Trio', price: 89, stores: ['arthaus', 'nestly', 'greenhouse'], desc: 'Three single-line botanicals — fern, eucalyptus, monstera — in slim black frames.', lines: ['Plants that never need watering. Finally.', 'Clean lines, very calming.'], build: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const f = framedArt({ w: 0.22, h: 0.3, key: 'botanical' + i, draw: drawBotanical(i), frame: 'black', fw: 0.014, depth: 0.022, matW: 0.03, res: 384 }); f.position.x = (i - 1) * 0.34; g.add(f); } return g; } }),
  A({ id: 'art_pixel_quest', name: '"Pixel Quest" Game Poster', price: 19, stores: ['arthaus', 'volt'], desc: 'An 8-bit adventure poster for a game that only exists in your heart.', lines: ['PRESS START. You press nothing. It\'s a poster.', 'Instant +5 nostalgia.'], build: () => poster({ w: 0.45, h: 0.6, key: 'pixelquest', draw: drawPixelQuest, mount: 'pins' }) }),
  FR({ id: 'art_movie_last_slice', name: '"The Last Slice" Movie Poster', price: 39, stores: ['arthaus', 'volt'], desc: 'Framed one-sheet for a cult sci-fi film about the final pizza in the galaxy.', lines: ['In space, no one can hear you order.', 'Two thumbs up. Extra cheese.'], build: () => framedArt({ w: 0.6, h: 0.9, key: 'lastslice', draw: drawLastSlice, frame: 'black', fw: 0.018 }) }),
  FR({ id: 'art_movie_moon_motel', name: '"Moon Motel" Movie Poster', price: 39, stores: ['arthaus'], desc: 'Teal neo-noir one-sheet. Check in. Never check out.', lines: ['A thriller, a romance, and a very good neon sign.', 'You hear a synth soundtrack in your head.'], build: () => framedArt({ w: 0.6, h: 0.9, key: 'moonmotel', draw: drawMoonMotel, frame: 'black', fw: 0.018 }) }),
  FR({ id: 'art_quote_wifi', name: '"Home Is Where the WiFi…" Print', price: 35, stores: ['arthaus', 'primo', 'nestly'], desc: 'Bold typographic truth in mustard and black.', lines: ['Truer words have never been framed.', 'Connected. Home.'], build: () => framedArt({ w: 0.5, h: 0.7, key: 'wifi', draw: drawWifiQuote, frame: 'white' }) }),
  FR({ id: 'art_city_map', name: 'Downtown Street Map Print', price: 69, stores: ['arthaus', 'nestly'], desc: 'A minimalist map of your neighbourhood with a little red pin on home.', lines: ['You find your building. There\'s the pin. Home.', 'You trace the route to the good ramen place.'], build: () => framedArt({ w: 0.5, h: 0.7, key: 'citymap', draw: drawCityMap, frame: 'walnut', matW: 0.04 }) }),
  A({ id: 'art_pop_cats', name: 'Pop Art Cats Canvas', price: 129, stores: ['arthaus', 'nestly'], rarity: 'uncommon', desc: 'Four neon cats on Ben-Day dots. Very 1960s gallery, very internet.', lines: ['Four cats, four moods, zero patience.', 'Fifteen minutes of fame, times four.'], build: () => canvasArt({ w: 0.6, h: 0.6, key: 'popcats', draw: drawPopCats }) }),
  A({ id: 'art_comic_wow', name: '"WOW!" Comic Print', price: 18, stores: ['arthaus', 'primo'], desc: 'A comic-book explosion of pure enthusiasm, taped to the wall.', lines: ['WOW indeed.', 'It\'s loud. You love it.'], build: () => poster({ w: 0.4, h: 0.5, key: 'wow', draw: drawWow }) }),
  A({ id: 'art_mountains_canvas', name: 'Dusk Mountains Canvas', price: 149, stores: ['arthaus', 'nestly'], desc: 'Layered blue ridgelines fading into a peach sky. Gallery-wrapped.', lines: ['You can almost hear the wind.', 'One day you\'ll hike that. Today you\'ll look at it.'], build: () => canvasArt({ w: 0.9, h: 0.6, key: 'mountains', draw: drawMountains }) }),
  FR({ id: 'art_ocean_waves', name: 'Ocean Waves Print', price: 89, stores: ['arthaus', 'nestly'], desc: 'Rolling teal swells and a sandy curve. Instant vacation.', lines: ['You swear you smell sunscreen.', 'The waves are oddly hypnotic.'], build: () => framedArt({ w: 0.7, h: 0.5, key: 'ocean', draw: drawOcean, frame: 'white', matW: 0.04 }) }),
  FR({ id: 'art_cat_portrait', name: '"Sir Whiskers" Oil Portrait', price: 149, stores: ['arthaus', 'luxe'], rarity: 'uncommon', desc: 'A distinguished cat in an Elizabethan ruff, in an ornate gilt frame.', lines: ['His Lordship gazes down upon you, unimpressed.', 'Sir Whiskers, 3rd Earl of the Windowsill.', 'The eyes follow you around the room.'], build: () => framedArt({ w: 0.4, h: 0.5, key: 'catportrait', draw: drawCatPortrait, frame: 'gold', fw: 0.05, depth: 0.035, ornate: true }) }),
  FR({ id: 'art_visit_saturn', name: '"Visit Saturn" Travel Poster', price: 45, stores: ['arthaus', 'volt'], desc: 'Retro-futurist space tourism ad. Rings included.', lines: ['Booking a flight. Any day now.', 'The jewel of the solar system. Allegedly.'], build: () => framedArt({ w: 0.5, h: 0.7, key: 'saturn', draw: drawSaturn, frame: 'black' }) }),
  FR({ id: 'art_great_wave', name: 'Great Wave Woodblock Print', price: 99, stores: ['arthaus', 'nestly'], rarity: 'uncommon', desc: 'An ukiyo-e inspired curling wave in Prussian blue, with a tiny Mount Fuji.', lines: ['The foam looks like reaching claws. Dramatic.', 'Timeless. Like the original, but in your apartment.'], build: () => framedArt({ w: 0.66, h: 0.46, key: 'wave', draw: drawWave, frame: 'walnut', matW: 0.04 }) }),
  A({ id: 'art_memphis_canvas', name: 'Memphis Pattern Canvas', price: 79, stores: ['arthaus'], desc: 'Squiggles, zigzags and confetti dots on bubblegum pink. 1986 called.', lines: ['Chaos, but make it design.', 'Somehow it goes with everything.'], build: () => canvasArt({ w: 0.6, h: 0.6, key: 'memphis', draw: drawMemphis }) }),
  FR({ id: 'art_paper_cutouts', name: 'Paper Cut-Outs Print', price: 69, stores: ['arthaus', 'nestly'], desc: 'Joyful organic shapes in cobalt, coral and ochre, inspired by a famous pair of scissors.', lines: ['Shapes dancing across the page.', 'You want to go buy scissors and paper.'], build: () => framedArt({ w: 0.45, h: 0.6, key: 'cutouts', draw: drawCutouts, frame: 'oak', matW: 0.05 }) }),
  FR({ id: 'art_lake_luna', name: '"Lake Luna" Travel Poster', price: 45, stores: ['arthaus'], desc: 'Art deco railway poster of a sunset lake and a lone sailboat.', lines: ['Overnight rail to somewhere quiet. Someday.', 'The reflections shimmer.'], build: () => framedArt({ w: 0.5, h: 0.7, key: 'lakeluna', draw: drawLakeLuna, frame: 'black' }) }),
  A({ id: 'art_gig_houseplants', name: '"The Houseplants" Gig Poster', price: 22, stores: ['arthaus'], desc: 'Two-colour riso poster from the best show you never went to.', lines: ['They were great live. Probably.', 'You hum a song you\'ve never heard.'], build: () => poster({ w: 0.45, h: 0.6, key: 'gig', draw: drawGig }) }),
  FR({ id: 'art_photo_skyline', name: 'Night Skyline Photograph', price: 119, stores: ['arthaus', 'nestly'], rarity: 'uncommon', desc: 'Black-and-white gelatin print of downtown at night, wide white mat.', lines: ['Your city, in silver.', 'Somewhere in there is your window.'], build: () => framedArt({ w: 0.56, h: 0.4, key: 'skyline', draw: drawSkylinePhoto, frame: 'black', fw: 0.016, matW: 0.08 }) }),
  FR({ id: 'art_lemons', name: 'Limoni Kitchen Print', price: 39, stores: ['nestly', 'arthaus', 'primo'], desc: 'Amalfi lemons on blue-and-white tiles. Perfect above the counter.', lines: ['When life gives you lemons, frame them.', 'Instant Mediterranean holiday.'], build: () => framedArt({ w: 0.4, h: 0.5, key: 'lemons', draw: drawLemons, frame: 'white' }) }),
  FR({ id: 'art_star_map', name: '"The Night We Moved In" Star Map', price: 49, stores: ['arthaus', 'nestly'], desc: 'The sky above downtown on the night you got your keys.', lines: ['The stars, exactly as they were. Sentimental.', 'You trace a constellation with your finger.'], build: () => framedArt({ w: 0.4, h: 0.5, key: 'starmap', draw: drawStarMap, frame: 'black' }) }),
  FR({ id: 'art_good_boy', name: '"Good Boy" Corgi Print', price: 45, stores: ['arthaus', 'kollectiv'], desc: 'A blushing corgi in pastel mint. Who\'s a good boy? This one.', lines: ['He IS a good boy.', 'The little tongue! You can\'t.'], build: () => framedArt({ w: 0.35, h: 0.45, key: 'corgi', draw: drawCorgi, frame: 'oak' }) }),
  FR({ id: 'art_coffee_guide', name: 'Coffee Guide Print', price: 35, stores: ['nestly', 'primo', 'arthaus'], desc: 'Espresso to Americano in tidy cross-sections. Educational AND caffeinated.', lines: ['You finally understand what a macchiato is.', 'Now you want a latte.'], build: () => framedArt({ w: 0.4, h: 0.5, key: 'coffee', draw: drawCoffeeGuide, frame: 'black' }) }),

  // ---------------------------------------------------------- textiles
  A({ id: 'tapestry_boho_sun', name: 'Boho Sun Tapestry', price: 49, stores: ['nestly', 'arthaus', 'primo'], tags: ['soft'], emoji: '☀️', desc: 'Woven cotton with a terracotta sun and rainbow arches, on a wooden dowel.', lines: ['Good morning, sunshine.', 'Covers a crack in the wall perfectly.'], build: () => tapestry({ w: 0.9, h: 1.15, key: 'sunTap', draw: drawSunTapestry }) }),
  A({ id: 'tapestry_mushroom_forest', name: 'Mushroom Forest Tapestry', price: 49, stores: ['nestly', 'arthaus'], tags: ['soft'], emoji: '🍄', desc: 'A moonlit forest floor of toadstools and ferns. Cottagecore wall goals.', lines: ['A whole forest, no bugs.', 'The mushrooms seem to glow in the moonlight.'], build: () => tapestry({ w: 0.9, h: 1.15, key: 'mushTap', draw: drawMushroomTapestry, fringe: '#d9c7a7' }) }),
  A({ id: 'art_macrame', name: 'Diamond Macramé Hanging', price: 59, stores: ['nestly', 'arthaus'], tags: ['soft'], emoji: '🪢', desc: 'Hand-knotted cotton cord in a diamond pattern on a driftwood-toned dowel.', lines: ['Someone tied about a thousand knots for this.', 'Peak 1970s, in the best way.'], build: macrame }),
  A({ id: 'art_triptych_coast', name: 'Coastal Triptych Canvases', price: 289, stores: ['nestly', 'arthaus', 'luxe'], rarity: 'uncommon', desc: 'One calm coastline split across three gallery-wrapped canvases.', lines: ['Three canvases, one horizon.', 'You feel the sea breeze across all three.'], build: () => triptych({ w: 0.4, h: 0.6, gap: 0.05, key: 'coast', draw: drawCoast }) }),

  // ---------------------------------------------------------- statement pieces (luxe)
  A({ id: 'art_color_field', name: '"Untitled (Ember)" Colour Field', price: 5800, stores: ['luxe'], rarity: 'epic', emoji: '🟥', desc: 'A towering canvas of glowing crimson and amber fields. Stand close. Feel things.', lines: ['You stand close. The colours hum.', 'It\'s just two rectangles. It\'s also everything.', 'A critic would call this "luminous". You agree.'], verb: 'Contemplate', build: () => canvasArt({ w: 1.2, h: 1.5, key: 'colorfield', draw: drawColorField, depth: 0.045, res: 768 }) }),
  A({ id: 'art_gesture_large', name: '"Gesture No. 7" Abstract Canvas', price: 2400, stores: ['luxe', 'arthaus'], rarity: 'rare', emoji: '🎨', desc: 'Huge, fearless brushstrokes and drips in black, red and cadmium yellow.', lines: ['Your kid could NOT have done this.', 'Pure energy, frozen mid-splash.', 'You find a new shape every time you look.'], verb: 'Contemplate', build: () => canvasArt({ w: 1.4, h: 1.0, key: 'gesture', draw: drawGesture, depth: 0.045, res: 768 }) }),
  A({ id: 'art_kintsugi', name: '"Kintsugi Nocturne"', price: 8500, stores: ['luxe'], rarity: 'legendary', emoji: '✨', desc: 'Raised veins of real gold leaf across a matte black canvas. Broken, and more beautiful for it.', lines: ['The gold catches the light as you move.', 'Beauty in the cracks. You feel strangely seen.', 'It\'s the most expensive thing you own. Worth it.'], verb: 'Contemplate', build: () => { const g = canvasArt({ w: 1.0, h: 1.0, key: 'kintsugi', draw: drawKintsugiGround, depth: 0.045 }); g.add(at(meshOf(kintsugiVeins(1.0, 1.0), mat('#e2b44f', { rough: 0.18, metal: 1 })), 0, 0, 0.046)); return g; } }),
  FR({ id: 'art_bay_at_dusk', name: '"The Bay at Dusk" Oil Painting', price: 3200, stores: ['luxe'], rarity: 'rare', emoji: '🌅', desc: 'Shimmering impressionist dabs of sunset over the harbour, in a heavy gilt frame.', lines: ['Up close: dabs of paint. Step back: a sunset.', 'The water actually seems to shimmer.', 'Museum vibes, in your living room.'], verb: 'Step back and admire', build: () => framedArt({ w: 0.9, h: 0.66, key: 'impressionist', draw: drawImpressionist, frame: 'gold', fw: 0.065, depth: 0.045, ornate: true, res: 768 }) }),
]);

void box; void rot; void group;
