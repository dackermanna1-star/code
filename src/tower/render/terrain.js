import * as THREE from 'three';
import { riverZ, riverW, channelY } from '../level/layout.js';
import { lambert, WORLD, FOG_PARS } from './worldMat.js';
import { SKY, SKY_GLSL } from './sky.js';
import { vnoise, hash2, rng } from './textures.js';

/**
 * The ground: one curvilinear grid (rows follow the river's banks so the channel is crisp with few
 * vertices; flat playfield; hills rising beyond it), shaded by a painted macro map (fields, yards,
 * roads' shoulders, scorch marks, ambient-occlusion blobs; 0.6 m texels, linear) times tiled
 * pixel-art detail (grass / dirt, nearest), and lit by the sun through a baked map of long dusk
 * shadows. Roads are textured strips laid on top; the river is a strip mirroring the sky.
 */

export const MACRO = { x0: -300, z0: -300, size: 600, px: 1024 };

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function noise2(x, z, seed) {
  return vnoise(x, z, 65536, 65536, seed);
}

/** Ground height for meshes: the river channel, flat playfield, hills beyond it. */
export function groundY(x, z) {
  let y = channelY(x, z);
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m > 262) {
    const k = smooth(262, 620, m);
    const valley = smooth(18, 120, Math.abs(z - riverZ(x)));
    let h = 0, a = 1, f = 1 / 200;
    for (let o = 0; o < 4; o++) {
      h += a * noise2(x * f, z * f, 31 + o);
      a *= 0.5;
      f *= 2.1;
    }
    y += k * k * valley * (4 + 30 * h);
  }
  return y;
}

// ---------------------------------------------------------------------------------------------
// The grid

function gridMesh() {
  const xs = [];
  for (let x = -760; x < -300; x += 23) xs.push(x);
  for (let x = -300; x <= 300; x += 6) xs.push(x);
  for (let x = 323; x <= 760; x += 23) xs.push(x);
  if (xs[xs.length - 1] < 760) xs.push(760);
  // rows: functions of x
  const rows = [];
  for (let z = -760; z < -300; z += 23) rows.push(() => z);
  for (let z = -300; z <= 48; z += 6) rows.push(() => z);
  const top = (x) => riverZ(x) - riverW(x) - 2.4;
  const bot = (x) => riverZ(x) + riverW(x) + 2.4;
  for (let k = 1; k <= 5; k++) rows.push((x) => 48 + (top(x) - 48) * (k / 6));
  for (const o of [-2.4, -1.2, 0, 1.3, 3]) rows.push((x) => riverZ(x) - riverW(x) - o);
  rows.push((x) => riverZ(x));
  for (const o of [3, 1.3, 0, -1.2, -2.4]) rows.push((x) => riverZ(x) + riverW(x) - o);
  for (let k = 1; k <= 5; k++) rows.push((x) => bot(x) + (160 - bot(x)) * (k / 6));
  for (let z = 160; z <= 298; z += 6) rows.push(() => z);
  for (let z = 300; z <= 760; z += 23) rows.push(() => z);
  if (rows[rows.length - 1](0) < 760) rows.push(() => 760);
  const nx = xs.length, nz = rows.length;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = rows[j](x);
      const k = (j * nx + i) * 3;
      pos[k] = x;
      pos[k + 1] = groundY(x, z);
      pos[k + 2] = z;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Macro paint

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rotRect(g, cx, cz, w, d, yaw, grow = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hw = w / 2 + grow, hd = d / 2 + grow;
  g.beginPath();
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    g.lineTo(x, z);
  }
  g.closePath();
}

function polyline(g, pts) {
  g.beginPath();
  pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
}

/** Smooth a polyline (Catmull-Rom) into points every `step` metres. */
export function smoothLine(pts, step = 4) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

function riverPts(x0, x1, off = 0) {
  const out = [];
  for (let x = x0; x <= x1; x += 4) out.push([x, riverZ(x) + off]);
  return out;
}

const FIELD_STYLE = {
  corn: { base: '#3f3322', row: '#2f2618', alt: '#5e4e32', mask: 0.15, spacing: 0.9, w: 0.35 },
  hay: { base: '#8a7a47', row: '#a59157', alt: '#7a6b3c', mask: 0.75, spacing: 6, w: 1.1 },
  plough: { base: '#4b3a27', row: '#33281b', alt: '#5a4730', mask: 0.0, spacing: 0.9, w: 0.4 },
  stubble: { base: '#958250', row: '#7d6b3e', alt: '#a8935c', mask: 0.45, spacing: 1.6, w: 0.45 },
  pasture: { base: '#5c5f34', row: '#555830', alt: '#6c6b3c', mask: 1.0, spacing: 0, w: 0 },
  fallow: { base: '#68653a', row: '#575630', alt: '#7a7445', mask: 0.85, spacing: 0, w: 0 },
};

/** Paint the macro albedo (RGB) + detail mask (A: 1 grass .. 0 dirt) and the dusk shadow map. */
function paintGround(L, sunAz) {
  const S = L.scenery;
  const N = MACRO.px, W = MACRO.size, X0 = MACRO.x0, Z0 = MACRO.z0;
  const R = rng(77);
  // 1. low-frequency base at 256, smoothed up to 1024
  const B = 256;
  const base = mkCanvas(B, B), bg = base.getContext('2d');
  const bi = bg.createImageData(B, B);
  for (let j = 0; j < B; j++) {
    for (let i = 0; i < B; i++) {
      const x = X0 + ((i + 0.5) * W) / B, z = Z0 + ((j + 0.5) * W) / B;
      const n1 = noise2(x / 140, z / 140, 1), n2 = noise2(x / 38, z / 38, 2), n3 = noise2(x / 12, z / 12, 3);
      const moist = smooth(70, 12, Math.abs(z - riverZ(x)));
      let dry = Math.min(1, Math.max(0, 0.35 + (n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.6 - moist * 0.5));
      // olive <-> ochre, darker greener by the river
      let r = 0x5c + (0x8e - 0x5c) * dry, g = 0x5c + (0x7c - 0x5c) * dry, b = 0x33 + (0x4a - 0x33) * dry;
      r -= moist * 14;
      g -= moist * 4;
      b -= moist * 6;
      const k = 0.9 + (n3 - 0.5) * 0.22;
      const o = (j * B + i) * 4;
      bi.data[o] = r * k;
      bi.data[o + 1] = g * k;
      bi.data[o + 2] = b * k;
      bi.data[o + 3] = 255;
    }
  }
  bg.putImageData(bi, 0, 0);
  const col = mkCanvas(N, N), cg = col.getContext('2d');
  cg.imageSmoothingEnabled = true;
  cg.drawImage(base, 0, 0, N, N);
  const msk = mkCanvas(N, N), mg = msk.getContext('2d');
  mg.fillStyle = '#fff';
  mg.fillRect(0, 0, N, N);
  for (const g of [cg, mg]) g.setTransform(N / W, 0, 0, N / W, (-X0 * N) / W, (-Z0 * N) / W);
  const grey = (v) => `rgb(${v * 255},${v * 255},${v * 255})`;

  // 2. fields with rows
  for (const f of S.fields) {
    const st = FIELD_STYLE[f.kind];
    cg.save();
    cg.beginPath();
    cg.rect(f.minX, f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
    cg.clip();
    cg.fillStyle = st.base;
    cg.fillRect(f.minX, f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
    // patchy variation
    for (let k = 0; k < (f.maxX - f.minX) * (f.maxZ - f.minZ) / 120; k++) {
      cg.fillStyle = st.alt;
      cg.globalAlpha = 0.18 + R() * 0.2;
      cg.beginPath();
      cg.ellipse(f.minX + R() * (f.maxX - f.minX), f.minZ + R() * (f.maxZ - f.minZ), 2 + R() * 6, 1.5 + R() * 4, R() * 3, 0, Math.PI * 2);
      cg.fill();
    }
    cg.globalAlpha = 1;
    if (st.spacing) {
      const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
      cg.translate(cx, cz);
      cg.rotate(-(f.rows ?? 0));
      const span = Math.hypot(f.maxX - f.minX, f.maxZ - f.minZ);
      cg.strokeStyle = st.row;
      cg.lineWidth = st.w;
      for (let o = -span / 2; o < span / 2; o += st.spacing) {
        cg.globalAlpha = 0.55 + R() * 0.35;
        cg.beginPath();
        cg.moveTo(-span / 2, o);
        cg.lineTo(span / 2, o);
        cg.stroke();
      }
      cg.globalAlpha = 1;
    }
    cg.restore();
    // a darker margin (ditch / weeds)
    cg.strokeStyle = '#3c3a22';
    cg.globalAlpha = 0.5;
    cg.lineWidth = 1.4;
    cg.strokeRect(f.minX, f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
    cg.globalAlpha = 1;
    mg.fillStyle = grey(st.mask);
    mg.fillRect(f.minX, f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
  }

  // 3. the river's banks: mud and wet stones
  for (const [w, c, m] of [[3.6, '#4d4430', 0.35], [1.4, '#3a3226', 0.1]]) {
    cg.strokeStyle = c;
    mg.strokeStyle = grey(m);
    for (const side of [-1, 1]) {
      for (let x = -300; x < 300; x += 4) {
        const zA = riverZ(x) + side * (riverW(x) + w * 0.5), zB = riverZ(x + 4) + side * (riverW(x + 4) + w * 0.5);
        for (const g of [cg, mg]) {
          g.lineWidth = w + 1.5;
          g.beginPath();
          g.moveTo(x, zA);
          g.lineTo(x + 4, zB);
          g.stroke();
        }
      }
    }
  }
  // the bed under the water: dark
  cg.fillStyle = '#2a2a22';
  cg.beginPath();
  for (let x = -300; x <= 300; x += 4) cg.lineTo(x, riverZ(x) - riverW(x) + 0.5);
  for (let x = 300; x >= -300; x -= 4) cg.lineTo(x, riverZ(x) + riverW(x) - 0.5);
  cg.fill();

  // 4. road shoulders (the strips cover the middle)
  for (const r of S.roads) {
    const pts = smoothLine(r.pts, 4);
    for (const [extra, c, a, m] of [[4.5, '#6e6448', 0.45, 0.4], [1.6, '#776a4c', 0.75, 0.15]]) {
      cg.strokeStyle = c;
      cg.globalAlpha = a;
      cg.lineWidth = r.width + extra;
      cg.lineJoin = 'round';
      polyline(cg, pts);
      cg.stroke();
      mg.strokeStyle = grey(m);
      mg.lineWidth = r.width + extra;
      polyline(mg, pts);
      mg.stroke();
    }
    cg.globalAlpha = 1;
  }

  // 5. the compound: gravel; the trodden yard round it; tyre tracks
  cg.fillStyle = '#5e5442';
  cg.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const r = 15 + 4 * noise2(Math.cos(a) * 2, Math.sin(a) * 2, 9) + (Math.abs(Math.cos(2 * a)) > 0.92 ? 6 : 0);
    cg.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  cg.fill();
  mg.fillStyle = grey(0.1);
  mg.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.2) mg.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
  mg.fill();
  cg.fillStyle = '#6a6252';
  cg.fillRect(-7.5, -7.5, 15, 15);
  mg.fillStyle = grey(0);
  mg.fillRect(-7.5, -7.5, 15, 15);
  cg.strokeStyle = '#3e3424';
  cg.lineWidth = 0.35;
  cg.globalAlpha = 0.6;
  for (const s of [-1, 1]) {
    cg.beginPath();
    cg.moveTo(-0.8 * s - 2, 7.5);
    cg.bezierCurveTo(-3, 6, -6, 2, -7.5, 0.9 * s);
    cg.stroke();
    cg.beginPath();
    cg.moveTo(0.85 * s, -7.5);
    cg.lineTo(0.85 * s, -16);
    cg.stroke();
  }
  cg.globalAlpha = 1;

  // 6. building footprints: foundations, trodden earth round them, ambient occlusion
  const burnt = [];
  for (const b of S.buildings) {
    const [w, d] = b.size;
    cg.fillStyle = '#4e4636';
    cg.globalAlpha = 0.55;
    rotRect(cg, b.pos[0], b.pos[1], w, d, b.yaw, 3.5);
    cg.fill();
    mg.fillStyle = grey(0.25);
    rotRect(mg, b.pos[0], b.pos[1], w, d, b.yaw, 3);
    mg.fill();
    cg.fillStyle = '#000';
    cg.globalAlpha = 0.18;
    rotRect(cg, b.pos[0], b.pos[1], w, d, b.yaw, 1.6);
    cg.fill();
    cg.globalAlpha = 0.25;
    rotRect(cg, b.pos[0], b.pos[1], w, d, b.yaw, 0.6);
    cg.fill();
    cg.globalAlpha = 1;
    if (b.burnt > 0.3) burnt.push([b.pos[0], b.pos[1], Math.max(w, d) * 0.8 + 4, b.burnt]);
  }
  // scorched ground round the burnt houses
  for (const [x, z, r, k] of burnt) {
    const gr = cg.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, `rgba(22,18,14,${0.7 * k})`);
    gr.addColorStop(0.6, `rgba(30,24,18,${0.45 * k})`);
    gr.addColorStop(1, 'rgba(30,24,18,0)');
    cg.fillStyle = gr;
    cg.fillRect(x - r, z - r, 2 * r, 2 * r);
  }
  // the farmyard and the village street: bare packed earth
  for (const [pts, c] of [
    [[[8, -78], [30, -84], [46, -94], [42, -110], [20, -112], [8, -96]], '#5e4c34'],
    [[[-140, -16], [-240, -14], [-240, 12], [-140, 14]], '#564834'],
    [[[92, -14], [132, -16], [132, 22], [92, 24]], '#6a6a64'],
  ]) {
    cg.fillStyle = c;
    cg.globalAlpha = 0.7;
    polyline(cg, pts);
    cg.fill();
    mg.fillStyle = grey(0.1);
    polyline(mg, pts);
    mg.fill();
  }
  cg.globalAlpha = 1;
  // the gas station apron: concrete slabs with oil stains
  cg.fillStyle = '#77756c';
  cg.fillRect(94, -20, 40, 40);
  cg.strokeStyle = '#5a5850';
  cg.lineWidth = 0.15;
  for (let x = 94; x <= 134; x += 4) { cg.beginPath(); cg.moveTo(x, -20); cg.lineTo(x, 20); cg.stroke(); }
  for (let z = -20; z <= 20; z += 4) { cg.beginPath(); cg.moveTo(94, z); cg.lineTo(134, z); cg.stroke(); }
  for (let k = 0; k < 26; k++) {
    cg.fillStyle = `rgba(20,18,16,${0.15 + R() * 0.25})`;
    cg.beginPath();
    cg.ellipse(98 + R() * 14, -6 + R() * 18, 0.5 + R() * 1.6, 0.4 + R(), R() * 3, 0, Math.PI * 2);
    cg.fill();
  }
  mg.fillStyle = grey(0);
  mg.fillRect(94, -20, 40, 40);
  // the cemetery: darker, greener grass
  {
    const C = S.cemetery;
    cg.fillStyle = '#4c5430';
    cg.globalAlpha = 0.6;
    cg.fillRect(C.minX, C.minZ, C.maxX - C.minX, C.maxZ - C.minZ);
    cg.globalAlpha = 1;
  }
  // AO blobs under the wrecks, bales, trees
  const blob = (x, z, r, a) => {
    const gr = cg.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    cg.fillStyle = gr;
    cg.fillRect(x - r, z - r, 2 * r, 2 * r);
  };
  for (const w of S.wrecks) blob(w.pos[0], w.pos[1], (L.scenery.carDims[w.type][0] + 1.2), 0.45);
  for (const [x, z] of S.bales) blob(x, z, 1.8, 0.4);
  for (const t of S.trees) blob(t.pos[0], t.pos[1], t.h * 0.45, 0.35);
  {
    const O = S.orchard;
    for (let x = O.minX + 3; x < O.maxX; x += O.dx) for (let z = O.minZ + 3; z < O.maxZ; z += O.dz) blob(x, z, 3.2, 0.32);
  }
  blob(0, 0, 9, 0.25);
  // worn footpaths: farm to windmill, compound to the outhouse, the cornfield track
  cg.strokeStyle = '#5a4a32';
  cg.lineWidth = 0.9;
  cg.globalAlpha = 0.55;
  for (const pts of [[[8, -96], [14, -108], [20, -116]], [[2, 7.5], [8, 12], [13, 15]], [[-12, -8], [-20, -18], [-27, -26]]]) {
    polyline(cg, smoothLine(pts, 2));
    cg.stroke();
  }
  cg.globalAlpha = 1;

  // 7. (the detail mask goes into the shadow map's green channel: a canvas's alpha channel is
  // premultiplied and would wipe the colour wherever the mask is 0)
  cg.setTransform(1, 0, 0, 1, 0, 0);
  mg.setTransform(1, 0, 0, 1, 0, 0);
  const out = col;

  // 8. the dusk shadow map (R: 1 lit .. 0 shadowed), 512 px
  const SN = 512;
  const sh = mkCanvas(SN, SN), sg = sh.getContext('2d');
  sg.fillStyle = '#fff';
  sg.fillRect(0, 0, SN, SN);
  sg.setTransform(SN / W, 0, 0, SN / W, (-X0 * SN) / W, (-Z0 * SN) / W);
  const dx = -Math.cos(sunAz), dz = -Math.sin(sunAz); // shadows fall away from the sun
  const K = 3.6, CAP = 70;
  const hull = (pts) => {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const castPoly = (foot, h0, h1, k = 0.8) => {
    const l0 = Math.min(CAP, h0 * K), l1 = Math.min(CAP, h1 * K);
    const pts = [];
    for (const [x, z] of foot) pts.push([x + dx * l0, z + dz * l0], [x + dx * l1, z + dz * l1]);
    const hp = hull(pts);
    const cx = foot.reduce((s, p) => s + p[0], 0) / foot.length, cz = foot.reduce((s, p) => s + p[1], 0) / foot.length;
    const gr = sg.createLinearGradient(cx + dx * l0, cz + dz * l0, cx + dx * (l1 + 2), cz + dz * (l1 + 2));
    gr.addColorStop(0, `rgba(0,0,0,${k})`);
    gr.addColorStop(1, `rgba(0,0,0,${k * 0.25})`);
    sg.fillStyle = gr;
    polyline(sg, hp);
    sg.fill();
  };
  const rectFoot = (cx, cz, w, d, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
  };
  const circFoot = (cx, cz, r) => {
    const out2 = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) out2.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    return out2;
  };
  for (const b of S.buildings) {
    const h = b.size[2] + (b.type === 'barn' ? 4 : b.type === 'house' ? 2.2 : 1);
    castPoly(rectFoot(b.pos[0], b.pos[1], b.size[0], b.size[1], b.yaw), 0, h);
    if (b.type === 'church') {
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      castPoly(rectFoot(b.pos[0] + fx * (b.size[1] / 2 + 1.9), b.pos[1] + fz * (b.size[1] / 2 + 1.9), 3.6, 3.6, b.yaw), 0, 24, 0.75);
    }
  }
  for (const s of S.silos) castPoly(circFoot(s.pos[0], s.pos[1], s.r), 0, s.h + s.r);
  castPoly(circFoot(S.waterTower.pos[0], S.waterTower.pos[1], S.waterTower.r), S.waterTower.h - 4, S.waterTower.h + 2, 0.7);
  for (const w of S.wrecks) {
    const d = S.carDims[w.type];
    castPoly(rectFoot(w.pos[0], w.pos[1], d[0] * 2, d[2] * 2, w.yaw), 0, d[1] * 2, 0.7);
  }
  for (const [x, z] of S.bales) castPoly(circFoot(x, z, 0.8), 0, 1.6, 0.7);
  for (const t of S.trees) castPoly(circFoot(t.pos[0], t.pos[1], t.h * 0.3), t.h * 0.35, t.h, 0.55);
  {
    const O = S.orchard;
    for (let x = O.minX + 3; x < O.maxX; x += O.dx) for (let z = O.minZ + 3; z < O.maxZ; z += O.dz) castPoly(circFoot(x, z, 2.2), 1.6, 5, 0.5);
  }
  // the tower: legs and cabin
  castPoly(circFoot(0, 0, 2.3), 20.5, 24.8, 0.65);
  for (const [x, z] of L.tower.legs) {
    sg.strokeStyle = 'rgba(0,0,0,0.5)';
    sg.lineWidth = 0.35;
    sg.beginPath();
    sg.moveTo(x, z);
    sg.lineTo(x * 0.58 + dx * Math.min(CAP, 21 * K), z * 0.58 + dz * Math.min(CAP, 21 * K));
    sg.stroke();
  }
  // the corn casts a low band on its east side
  for (const f of S.fields) if (f.kind === 'corn') castPoly([[f.minX, f.minZ], [f.maxX, f.minZ], [f.maxX, f.maxZ], [f.minX, f.maxZ]], 0, 2.2, 0.45);
  // merge: R = sun (shadow map), G = detail mask (1 grass .. 0 dirt)
  sg.setTransform(1, 0, 0, 1, 0, 0);
  const small = mkCanvas(SN, SN), smg = small.getContext('2d');
  smg.imageSmoothingEnabled = true;
  smg.drawImage(msk, 0, 0, SN, SN);
  const si = sg.getImageData(0, 0, SN, SN), mi = smg.getImageData(0, 0, SN, SN);
  for (let k = 0; k < SN * SN; k++) {
    si.data[k * 4 + 1] = mi.data[k * 4];
    si.data[k * 4 + 2] = 255;
    si.data[k * 4 + 3] = 255;
  }
  sg.putImageData(si, 0, 0);
  return { macro: out, shadow: sh };
}

// ---------------------------------------------------------------------------------------------

const GROUND_PARS = /* glsl */ `
uniform sampler2D tMacro;
uniform sampler2D tShadow;
uniform sampler2D tGrassD;
uniform sampler2D tDirtD;
uniform vec4 uMacroRect;
uniform vec3 uHillA;
uniform vec3 uHillB;
uniform float uShadowK;
`;

const GROUND_MAP = /* glsl */ `
float groundSun = 1.0;
{
  vec2 muv = (vWorldPos.xz - uMacroRect.xy) * uMacroRect.zw;
  float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
  vec4 mac = texture2D(tMacro, clamp(muv, 0.0, 1.0));
  vec4 shm = texture2D(tShadow, clamp(muv, 0.0, 1.0));
  vec2 duv = vWorldPos.xz * 0.3125;
  vec3 dg = texture2D(tGrassD, duv).rgb;
  vec3 dd = texture2D(tDirtD, duv * 1.25 + 0.37).rgb;
  vec3 det = mix(dd, dg, shm.g) * 2.0;
  float hn = texture2D(tDirtD, vWorldPos.xz * 0.0037).r * 2.0 - 0.5;
  vec3 hill = mix(uHillA, uHillB, clamp(hn + vWorldPos.y * 0.008, 0.0, 1.0)) * dg * 2.0;
  vec3 alb = mix(hill, mac.rgb * det, inside);
  // the wet bank below the ground plane
  alb *= 1.0 - 0.35 * smoothstep(-0.05, -0.5, vWorldPos.y) * inside;
  diffuseColor.rgb *= alb;
  groundSun = mix(1.0, mix(1.0, shm.r, inside), uShadowK);
}
`;

/** Ground mesh + material. */
export function buildGround(L, T, sunAz) {
  const { macro, shadow } = paintGround(L, sunAz);
  const tMacro = new THREE.CanvasTexture(macro);
  tMacro.flipY = false;
  tMacro.colorSpace = THREE.SRGBColorSpace;
  tMacro.minFilter = THREE.LinearMipmapLinearFilter;
  tMacro.magFilter = THREE.LinearFilter;
  const tShadow = new THREE.CanvasTexture(shadow);
  tShadow.flipY = false;
  tShadow.minFilter = THREE.LinearMipmapLinearFilter;
  tShadow.magFilter = THREE.LinearFilter;
  const uniforms = {
    tMacro: { value: tMacro }, tShadow: { value: tShadow }, tGrassD: { value: T.grassDetail }, tDirtD: { value: T.dirtDetail },
    uMacroRect: { value: new THREE.Vector4(MACRO.x0, MACRO.z0, 1 / MACRO.size, 1 / MACRO.size) },
    uHillA: { value: new THREE.Color(0x2a3020) }, uHillB: { value: new THREE.Color(0x4a4a2e) },
    uShadowK: { value: 1 },
  };
  const mat = lambert({ vertexColors: false, color: 0xffffff }, {
    fragPars: GROUND_PARS, mapFrag: GROUND_MAP, uniforms, dirMul: 'groundSun', wet: 0.3, key: 'ground',
  });
  const mesh = new THREE.Mesh(gridMesh(), mat);
  mesh.name = 'ground';
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Roads

/** Add a road's strip to builder `b` at height y; skip the stretches over `gaps` ([z0, z1, x0, x1]). */
export function roadStrip(b, road, y, tileLen, gaps = []) {
  const P = smoothLine(road.pts, 3);
  const hw = road.width / 2;
  let s = 0;
  let prev = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
    let tx = c[0] - a[0], tz = c[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    if (i > 0) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const nx = -tz, nz = tx;
    const cur = { l: [P[i][0] + nx * hw, y, P[i][1] + nz * hw], r: [P[i][0] - nx * hw, y, P[i][1] - nz * hw], v: s / tileLen, x: P[i][0], z: P[i][1] };
    if (prev) {
      const mx = (prev.x + cur.x) / 2, mz = (prev.z + cur.z) / 2;
      const skip = gaps.some(([z0, z1, x0, x1]) => mz > z0 && mz < z1 && mx > x0 && mx < x1);
      if (!skip) b.quad(prev.r, cur.r, cur.l, prev.l, [1, prev.v], [1, cur.v], [0, cur.v], [0, prev.v], [0, 1, 0]);
    }
    prev = cur;
  }
}

// ---------------------------------------------------------------------------------------------
// River water

export function buildWater(T) {
  const pos = [], uv = [], across = [], idx = [];
  let n = 0;
  for (let x = -760; x <= 760; x += 4) {
    const zc = riverZ(x), w = riverW(x) + 1.6;
    pos.push(x, -0.5, zc - w, x, -0.5, zc + w);
    uv.push(x / 24, 0, x / 24, 1);
    across.push(-1, 1);
    if (n > 0) {
      const k = (n - 1) * 2;
      idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
  geo.setIndex(idx);
  const uniforms = { ...SKY, tRipple: { value: T.ripples }, uDeep: { value: new THREE.Color(0x1a2224) } };
  for (const k of Object.keys(WORLD)) uniforms[k] = WORLD[k];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float across;
      varying vec3 vWorldPos;
      varying float vAcross;
      void main() {
        vAcross = across;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tRipple;
      uniform vec3 uDeep;
      uniform float uRain;
      uniform float uNight;
      varying vec3 vWorldPos;
      varying float vAcross;
      ${FOG_PARS}
      ${SKY_GLSL}
      void main() {
        vec3 V = normalize(vWorldPos - cameraPosition);
        vec2 p = vWorldPos.xz;
        float r1 = texture2D(tRipple, p * vec2(0.045, 0.11) + vec2(uTime * 0.035, 0.0)).r;
        float r2 = texture2D(tRipple, p * vec2(0.08, 0.05) - vec2(uTime * 0.021, uTime * 0.008)).r;
        float rr = texture2D(tRipple, p * 0.5 + vec2(uTime * 0.7, -uTime * 0.9)).r;
        vec3 N = normalize(vec3((r1 - 0.45) * 0.16 + (rr - 0.4) * 0.25 * uRain, 1.0, (r2 - 0.45) * 0.16));
        vec3 R = reflect(V, N);
        R.y = max(R.y, 0.004);
        vec3 sky = skyColor(normalize(R));
        float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-V, N), 0.0), 4.0);
        // the banks' trees darken the reflection near the edges
        float edge = smoothstep(0.55, 1.0, abs(vAcross));
        vec3 c = mix(uDeep, sky * (1.0 - 0.55 * edge), clamp(fres, 0.0, 1.0) * 0.92);
        float gl = pow(max(dot(normalize(R), uSunDir), 0.0), 220.0) * uSunVis;
        c += uSunColor * gl * 2.5 * (1.0 - edge);
        c *= 1.0 - 0.25 * uRain;
        gl_FragColor = vec4(applyWorldFog(c, vWorldPos), 1.0);
      }`,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'river';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
