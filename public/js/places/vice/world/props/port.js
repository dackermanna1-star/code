// The Port of Vice City: a container terminal on the south quay (four big
// ship-to-shore gantry cranes reaching out over a docked container ship,
// stacks of containers in the yard with rubber-tyred gantries and light
// towers, fences along the streets) and two cruise ships moored along the
// north quay, lit up at night. Bollards line both quays.
//
// Containers are boxes with a drawn texture (corrugation, doors, the line's
// name) tinted per box; everything is merged per chunk.
import * as THREE from 'three';
import { L, tint, shade, cyl, cylAB, rnd, GROUND, TAU, canvasTex } from './kit.js';
import { frame } from './beach.js';
import { place } from './furniture.js';

const CL = 37, CW = 7.6, CH = 8.2;         // a 40 ft container in studs
const COLOURS = [0x1f5fa8, 0xb03a2e, 0x2d6a4f, 0xd9772a, 0xd8d8d4, 0xe2b52b, 0x1f8a8a, 0x6b3e26, 0x283d70, 0x8a8f96, 0xc2c7cc, 0x7a1f3d];
const BRANDS = ['VICE LINE', 'CORAL', 'OCEAN STAR', 'SUNRISE', 'ATLANTICA', 'FLAMINGO'];

// ---- the container texture: R = shading, G = where the name is (white paint) -----------------
let _atlas = null;
function containerAtlas() {
  if (_atlas) return _atlas;
  const rr = rnd(77);
  _atlas = canvasTex(1024, 512, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    // the corrugated sheet everywhere (R = shading, ribs every 6 px), drawn as pixels
    const img = x.createImageData(w, h), d = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4, rib = Math.sin((i / 6) * Math.PI * 2);
      d[k] = 165 + rib * 55; d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // rows 0-6: long sides, each with a name (rows 0-5) and a frame
    for (let k = 0; k < 7; k++) {
      const y0 = k * 64;
      x.fillStyle = 'rgb(110,0,0)'; x.fillRect(0, y0, w, 4); x.fillRect(0, y0 + 60, w, 4); x.fillRect(0, y0, 10, 64); x.fillRect(w - 10, y0, 10, 64);
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${rr() * 0.12})`; x.fillRect(rr() * w, y0 + 40 + rr() * 20, 20 + rr() * 60, 4 + rr() * 8); }
      if (k < BRANDS.length) {
        x.fillStyle = 'rgb(230,255,0)'; x.font = 'bold 34px Arial, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center';
        x.fillText(BRANDS[k], w / 2, y0 + 33);
      }
    }
    // row 7: the door end (left half) and the front end (right half)
    const y0 = 448;
    for (let i = 0; i < 512; i += 6) { x.fillStyle = i % 12 ? 'rgb(190,0,0)' : 'rgb(150,0,0)'; x.fillRect(512 + i, y0, 6, 64); }
    x.fillStyle = 'rgb(205,0,0)'; x.fillRect(0, y0, 512, 64);
    x.fillStyle = 'rgb(120,0,0)'; x.fillRect(254, y0, 4, 64);
    for (const bx of [60, 150, 360, 450]) { x.fillStyle = 'rgb(90,0,0)'; x.fillRect(bx, y0 + 2, 6, 60); }
    x.fillStyle = 'rgb(110,0,0)'; x.fillRect(0, y0, 512, 5); x.fillRect(0, y0 + 59, 512, 5);
  }, { linear: true });
  return _atlas;
}
export function containerMaterial() {
  const mat = new THREE.MeshStandardMaterial({ map: containerAtlas(), roughness: 0.62, metalness: 0.25 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 tint; varying vec3 vTint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = tint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;').replace('#include <map_fragment>', `{
  vec4 t = texture2D(map, vMapUv);
  float sh = t.r * 1.15;
  diffuseColor.rgb *= mix(vTint * sh, vec3(0.9) * (0.75 + 0.25 * sh), t.g);
}`);
  };
  mat.customProgramCacheKey = () => 'vc-container';
  return mat;
}

/** One container: centre (x, z), bottom y, heading (its length along local z), colour, brand row. */
export function container(g, x, y, z, h, col, brand) {
  const c = Math.cos(h), s = Math.sin(h), hx = CW / 2, hz = CL / 2;
  const W = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const tnt = tint(col, 1.15), row = brand < 0 ? 6 : brand;
  const v0 = 1 - (row + 1) / 8, v1 = 1 - row / 8, e0 = 1 - 8 / 8, e1 = 1 - 7 / 8;
  const o = (uvs) => ({ tint: tnt, uvs });
  // long sides (+x and -x)
  g.quad(W(hx, 0, hz), W(hx, 0, -hz), W(hx, CH, -hz), W(hx, CH, hz), o([[0, v0], [1, v0], [1, v1], [0, v1]]));
  g.quad(W(-hx, 0, -hz), W(-hx, 0, hz), W(-hx, CH, hz), W(-hx, CH, -hz), o([[0, v0], [1, v0], [1, v1], [0, v1]]));
  // the ends: doors at -z, the front at +z
  g.quad(W(-hx, 0, hz), W(hx, 0, hz), W(hx, CH, hz), W(-hx, CH, hz), o([[0.5, e0], [1, e0], [1, e1], [0.5, e1]]));
  g.quad(W(hx, 0, -hz), W(-hx, 0, -hz), W(-hx, CH, -hz), W(hx, CH, -hz), o([[0, e0], [0.5, e0], [0.5, e1], [0, e1]]));
  // the roof
  g.quad(W(-hx, CH, hz), W(hx, CH, hz), W(hx, CH, -hz), W(-hx, CH, -hz), { tint: shade(tnt, 0.9), uvs: [[0, 1 - 7 / 8], [0.12, 1 - 7 / 8], [0.12, 1 - 6 / 8], [0, 1 - 6 / 8]] });
}

export function buildPort(P) {
  const r = rnd(1958);
  const yard = (x0, z0, x1, z1) => containerYard(P, x0, z0, x1, z1, r);
  // the yards (inside the blocks, clear of the streets and the crane quay)
  yard(1278, -846, 1484, -770);
  yard(1556, -846, 1690, -770);
  yard(1278, -672, 1484, -596);
  yard(1556, -672, 1694, -596);
  yard(1278, -526, 1484, -478);
  yard(1556, -526, 1688, -478);
  // ship-to-shore cranes on the south quay, over the container ship
  const qz = quayZ(P, 1300, -380);
  for (const x of [1100, 1320, 1440, 1620]) stsCrane(P, x, quayZ(P, x, -380), r);
  cargoShip(P, 1290, qz + 62, 640, 96, r);
  // cruise ships on the north quay
  cruiseShip(P, 1035, quayZ(P, 1035, -990) - 58, Math.PI / 2, 500, 86, { hull: 0x1d3557, band: 0x2ec4b6, funnel: 0x2ec4b6, name: 'VICE OF THE SEAS' }, 1);
  cruiseShip(P, 1590, quayZ(P, 1590, -1000) - 58, -Math.PI / 2, 520, 90, { hull: 0xfdfcf7, band: 0xef476f, funnel: 0xef476f, name: 'FLAMINGO' }, 2);
  // bollards along both quays
  for (let x = 900; x < 1660; x += 24) {
    for (const zc of [-990, -380]) {
      const z = quayZ(P, x, zc), inward = zc < -700 ? 1 : -1;
      if (P.roads.clear(x, z + inward * 3) < 1) continue;
      place(P, 'bollard', x, z + inward * 2.5, 0, null, GROUND);
    }
  }
  // light towers round the yard
  for (const [x, z] of [[1260, -760], [1540, -760], [1260, -580], [1540, -580], [1700, -680], [1260, -470], [1540, -470]]) lightTower(P, x, z);
  // fences along the yard's streets
  for (const [ax, az, bx, bz] of [[1270, -852, 1490, -852], [1550, -852, 1696, -852], [1270, -762, 1490, -762], [1550, -762, 1696, -762], [1270, -678, 1490, -678], [1550, -678, 1696, -678], [1270, -588, 1490, -588], [1550, -588, 1696, -588], [1270, -532, 1490, -532], [1550, -532, 1690, -532]]) fence(P, ax, az, bx, bz, 9);
}

/** The z of the quay face (the seawall) near x, looking from zGuess. */
function quayZ(P, x, zGuess) {
  // walk until the coast distance crosses 0
  let z = zGuess, d = P.ground.coastAt(x, z);
  for (let k = 0; k < 40 && Math.abs(d) > 0.5; k++) { const d2 = P.ground.coastAt(x, z + 1); const gr = d2 - d || 1e-3; z -= d / gr; d = P.ground.coastAt(x, z); }
  return z;
}

function containerYard(P, x0, z0, x1, z1, r) {
  // rows along x (each container's length along x), with a truck lane between
  const len = x1 - x0, bays = Math.floor((len + 3) / (CL + 3));
  const rows = Math.floor((z1 - z0) / (CW + 0.6));
  for (let b = 0; b < bays; b++) for (let q = 0; q < rows; q++) {
    if (q === Math.floor(rows / 2) && rows > 6) continue; // a lane
    const x = x0 + CL / 2 + b * (CL + 3), z = z0 + CW / 2 + 0.3 + q * (CW + 0.6);
    if (!P.free(x, z, CL / 2) || P.roads.clear(x, z) < CL / 2 - 4) continue;
    const n = Math.max(1, Math.min(5, Math.round(1 + r() * 4.2 - (b === 0 ? 1 : 0))));
    for (let k = 0; k < n; k++) {
      const gg = P.C.get('cont', x, z);
      const col = COLOURS[Math.floor(r() * COLOURS.length)], brand = r() < 0.75 ? Math.floor(r() * BRANDS.length) : -1;
      container(gg, x + (r() - 0.5) * 0.4, GROUND + k * CH, z, Math.PI / 2 + (r() - 0.5) * 0.01, col, brand);
    }
    P.box(x, GROUND + n * CH / 2, z, CL / 2, n * CH / 2, CW / 2, Math.PI / 2, 'metal', { container: true, cover: true });
  }
}

// ---- a ship-to-shore gantry crane ----------------------------------------------------------
function stsCrane(P, x, qz, r) {
  const g = P.C.get('surf', x, qz - 40), red = tint(0xc8402a, 1.1), white = tint(0xf2f2ee, 1.1), dark = [0.18, 0.18, 0.2];
  const o = (t, sc = 10) => ({ lay: L.concrete, tint: t, scale: sc, rough: 0.55 });
  const zs = qz - 8, zl = qz - 86;                    // seaside and landside rails
  const LX = 24, H0 = GROUND, PT = 104, BY = 132;     // half leg spacing, portal top, boom height
  // legs, with sill beams joining them at the bottom (low, cars pass between)
  for (const lx of [-LX, LX]) for (const lz of [zs, zl]) g.box(x + lx, (H0 + PT) / 2 + 1.5, lz, 1.6, (PT - H0) / 2 - 1.5, 1.6, 0, o(red));
  for (const lx of [-LX, LX]) { g.box(x + lx, H0 + 2.0, (zs + zl) / 2, 1.4, 1.2, (zs - zl) / 2 + 2, 0, o(red)); g.box(x + lx, PT, (zs + zl) / 2, 1.8, 2.4, (zs - zl) / 2 + 2, 0, o(red)); }
  for (const lz of [zs, zl]) g.box(x, PT + 1, lz, LX + 2, 2.6, 1.8, 0, o(red));
  // diagonal bracing on the sides
  for (const lx of [-LX, LX]) { cylAB(g, [x + lx, H0 + 30, zs], [x + lx, PT - 4, zl], 0.7, 0.7, 5, o(red)); cylAB(g, [x + lx, H0 + 30, zl], [x + lx, PT - 4, zs], 0.7, 0.7, 5, o(red)); }
  // the bogies on the rails
  for (const lx of [-LX, LX]) for (const lz of [zs, zl]) g.box(x + lx, H0 + 1.5, lz, 3.4, 1.5, 6, 0, o(dark, 4));
  // upper posts to the boom, and the A-frame
  for (const lx of [-LX + 6, LX - 6]) { g.box(x + lx, (PT + BY) / 2, zs - 2, 1.4, (BY - PT) / 2, 1.4, 0, o(red)); g.box(x + lx, (PT + BY) / 2, zl + 6, 1.4, (BY - PT) / 2, 1.4, 0, o(red)); }
  const apex = [BY + 70, zs - 12];
  for (const lx of [-12, 12]) {
    cylAB(g, [x + lx * 1.4, BY, zs - 2], [x + lx * 0.6, apex[0], apex[1]], 1.2, 0.9, 6, o(red));
    cylAB(g, [x + lx * 1.4, BY, zl + 6], [x + lx * 0.6, apex[0], apex[1]], 1.0, 0.8, 6, o(red));
  }
  g.box(x, apex[0], apex[1], 9, 1.4, 1.4, 0, o(red));
  // the boom: two girders from behind the landside legs out over the water
  const zb0 = zl - 34, zb1 = zs + 150, zm = (zb0 + zb1) / 2, bh = (zb1 - zb0) / 2;
  for (const lx of [-9, 9]) { g.box(x + lx, BY, zm, 1.4, 3.2, bh, 0, o(white)); }
  for (let z = zb0 + 6; z < zb1; z += 14) g.box(x, BY + 2.6, z, 9, 0.5, 0.5, 0, o(white));
  // stays from the apex to the boom tip and its back end
  for (const lx of [-8, 8]) { cylAB(g, [x + lx * 0.6, apex[0], apex[1]], [x + lx, BY + 3, zb1 - 2], 0.35, 0.35, 4, o(white)); cylAB(g, [x + lx * 0.6, apex[0], apex[1]], [x + lx, BY + 3, zb0 + 10], 0.35, 0.35, 4, o(white)); }
  // the machinery house at the back, the trolley and its cab, the spreader on its cables
  g.box(x, BY + 9, zb0 + 16, 11, 6, 13, 0, o(white, 6));
  const tz = zs + 30 + r() * 80, sy = 30 + r() * 50;
  g.box(x, BY - 4.5, tz, 8, 2.2, 7, 0, o(white, 4));
  g.box(x + 4, BY - 10, tz - 3, 3.5, 3.2, 3.5, 0, o(white, 4));
  P.C.get('win', x, tz).quad([x + 0.4, BY - 12, tz + 0.55], [x + 7.6, BY - 12, tz + 0.55], [x + 7.6, BY - 8, tz + 0.55], [x + 0.4, BY - 8, tz + 0.55], { lay: L.whiteTiles, tint: [0.1, 0.13, 0.16], rough: 0.1, glow: 1 });
  for (const lx of [-3, 3]) for (const lz of [-3, 3]) cylAB(g, [x + lx, BY - 6.5, tz + lz], [x + lx * 0.8, sy + 2, tz + lz], 0.12, 0.12, 3, o(dark, 4));
  g.box(x, sy, tz, CL / 2 + 1, 1.3, 4.2, Math.PI / 2, o(tint(0xe8b52b), 4));
  // floodlights under the boom and red warning lights on top
  const gl = P.C.get('surf', x, zs);
  for (const z of [zs + 20, zs + 70, zs + 120]) gl.box(x, BY - 3.6, z, 2.4, 0.3, 1.2, 0, { lay: L.whiteTiles, tint: [1, 0.95, 0.85], glow: 1 });
  gl.box(x, apex[0] + 1.8, apex[1], 0.7, 0.5, 0.7, 0, { lay: L.whiteTiles, tint: [1, 0.15, 0.1], glow: 1 });
  gl.box(x, BY + 3.6, zb1 - 2, 0.6, 0.5, 0.6, 0, { lay: L.whiteTiles, tint: [1, 0.15, 0.1], glow: 1 });
  // collision: the four legs
  for (const lx of [-LX, LX]) for (const lz of [zs, zl]) P.box(x + lx, (H0 + PT) / 2, lz, 3.4, (PT - H0) / 2, 6, 0, 'metal', { crane: true });
}

// ---- a rubber-tyred gantry over a yard, a light tower, a fence ----------------------------------
function lightTower(P, x, z) {
  if (!P.free(x, z, 3) || P.roads.clear(x, z) < 2) return;
  const g = P.C.get('surf', x, z);
  cyl(g, x, GROUND, z, 1.3, 105, 8, { lay: L.concrete, tint: [0.75, 0.76, 0.78], scale: 10 });
  g.box(x, GROUND + 105, z, 5, 0.6, 5, 0, { lay: L.concrete, tint: [0.35, 0.36, 0.38] });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.box(x + Math.cos(a) * 3.4, GROUND + 107.5, z + Math.sin(a) * 3.4, 2.2, 2, 2.2, a, { lay: L.whiteTiles, tint: [1, 0.96, 0.85], glow: 1, rough: 0.2 }); }
  P.box(x, GROUND + 52, z, 1.4, 52, 1.4, 0, 'metal', { pole: true });
}
export function fence(P, ax, az, bx, bz, h = 8) {
  const len = Math.hypot(bx - ax, bz - az); if (len < 1) return;
  const ux = (bx - ax) / len, uz = (bz - az) / len, n = Math.ceil(len / 10);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (P.roads.clear(mx, mz) < 0.5 || !P.free(mx, mz, 0.5)) continue;
    const y0 = P.gy(x0, z0), y1 = P.gy(x1, z1);
    P.C.get('fence', mx, mz).quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + h, z1], [x0, y0 + h, z0], { scale: 4 });
    const gd = P.C.get('detail', mx, mz);
    gd.box(x0, y0 + h / 2, z0, 0.2, h / 2, 0.2, 0, { lay: L.concrete, tint: [0.6, 0.62, 0.64] });
    cylAB(gd, [x0, y0 + h, z0], [x1, y1 + h, z1], 0.12, 0.12, 4, { lay: L.concrete, tint: [0.6, 0.62, 0.64] });
    P.box(mx, (y0 + y1) / 2 + h / 2, mz, 0.25, h / 2, len / n / 2, Math.atan2(ux, uz), 'metal', { fence: true });
  }
}

// ---- ships ----------------------------------------------------------------------------------
/**
 * A hull: length L along local z (bow at +z), beam W, from y = -keel up to y = top.
 * Stations along the length give a pointed, raked bow and a rounded stern.
 */
export function hull(g, F, Lh, W, keel, top, cTop, cBot, splitY) {
  const N = 26, st = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -Lh / 2 + t * Lh;
    const bow = Math.max(0, (t - 0.78) / 0.22), stern = Math.max(0, (0.06 - t) / 0.06);
    const wTop = W / 2 * Math.sqrt(Math.max(0, 1 - bow * bow)) * (1 - stern * 0.25);
    const wBot = W / 2 * Math.sqrt(Math.max(0, 1 - Math.min(1, bow * 1.15) ** 2)) * (1 - stern * 0.4) * 0.92;
    st.push({ z, zt: z + bow * 14, wTop: Math.max(wTop, 0.2), wBot: Math.max(wBot, 0.1) });
  }
  for (let i = 0; i < N; i++) {
    const a = st[i], b = st[i + 1];
    for (const sx of [-1, 1]) {
      const A0 = [sx * a.wBot, -keel, a.z], B0 = [sx * b.wBot, -keel, b.z], A1 = [sx * a.wTop, top, a.zt], B1 = [sx * b.wTop, top, b.zt];
      const lerpY = (p, q, y) => { const t = (y - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, y, p[2] + (q[2] - p[2]) * t]; };
      const Am = lerpY(A0, A1, splitY), Bm = lerpY(B0, B1, splitY);
      const q = sx > 0 ? (p0, p1, p2, p3, o) => F.quad(p1, p0, p3, p2, o) : (p0, p1, p2, p3, o) => F.quad(p0, p1, p2, p3, o);
      q(A0, B0, Bm, Am, { lay: L.concrete, tint: cBot, scale: 12, rough: 0.5 });
      q(Am, Bm, B1, A1, { lay: L.concrete, tint: cTop, scale: 12, rough: 0.45 });
    }
  }
  // the deck
  for (let i = 0; i < N; i++) {
    const a = st[i], b = st[i + 1];
    F.quad([-a.wTop, top, a.zt], [a.wTop, top, a.zt], [b.wTop, top, b.zt], [-b.wTop, top, b.zt], { lay: L.concrete, tint: [0.55, 0.42, 0.36], scale: 14 });
  }
  // the transom
  const s0 = st[0];
  F.quad([s0.wBot, -keel, s0.z], [-s0.wBot, -keel, s0.z], [-s0.wTop, top, s0.zt], [s0.wTop, top, s0.zt], { lay: L.concrete, tint: cTop, scale: 12 });
  return st;
}

export function cargoShip(P, x, z, Lh, W, r) {
  const h = Math.PI / 2, g = P.C.get('surf', x, z), F = frame(g, x, 0, z, h);
  const top = 22, keel = 14;
  hull(g, F, Lh, W, keel, top, tint(0x1f2a44, 1.1), tint(0x8c2b22, 1.1), 2.5);
  // a white band below the deck edge, the name at the bow is too small to bother with
  // the superstructure at the stern: accommodation block and bridge with wings
  const sz = -Lh / 2 + 60, white = tint(0xf4f4f0, 1.1);
  F.box(0, top + 30, sz, W / 2 - 8, 30, 18, { lay: L.stucco, tint: white, scale: 8 });
  F.box(0, top + 62, sz + 4, W / 2 + 2, 2.2, 10, { lay: L.stucco, tint: white, scale: 8 });
  const gw = P.C.get('win', x, z), FW = frame(gw, x, 0, z, h);
  for (let k = 0; k < 6; k++) { const y = top + 6 + k * 9; FW.quad([-(W / 2 - 8.1), y, sz + 18.1], [W / 2 - 8.1, y, sz + 18.1], [W / 2 - 8.1, y + 3.2, sz + 18.1], [-(W / 2 - 8.1), y + 3.2, sz + 18.1], { lay: L.whiteTiles, tint: [0.12, 0.15, 0.18], rough: 0.1, glow: 0.5 }); }
  FW.quad([-(W / 2), top + 60.5, sz + 14.1], [W / 2, top + 60.5, sz + 14.1], [W / 2, top + 64, sz + 14.1], [-(W / 2), top + 64, sz + 14.1], { lay: L.whiteTiles, tint: [0.1, 0.13, 0.16], rough: 0.08, glow: 0.8 });
  // funnel and mast
  F.box(0, top + 72, sz - 14, 7, 12, 8, { lay: L.stucco, tint: tint(0x283d70, 1.2), scale: 6 });
  F.box(0, top + 82, sz - 14, 7.2, 2.2, 8.2, { lay: L.stucco, tint: tint(0xd62828, 1.2), scale: 6 });
  F.tube([0, top + 64, sz + 6], [0, top + 88, sz + 6], 0.5, 0.3, 5, { lay: L.concrete, tint: white });
  // the forecastle and a foremast
  F.box(0, top + 4, Lh / 2 - 46, W / 2 - 14, 4, 18, { lay: L.concrete, tint: tint(0x1f2a44, 1.1), scale: 8 });
  F.tube([0, top, Lh / 2 - 50], [0, top + 30, Lh / 2 - 50], 0.8, 0.5, 5, { lay: L.concrete, tint: white });
  // containers on deck: bays between the bridge and the bow, stacked on hatch covers
  const gc = (cx, cz) => P.C.get('cont', cx, cz);
  const bays = Math.floor((Lh / 2 - 70 - (sz + 22)) / (CL + 2.5));
  const across = Math.floor((W - 10) / CW);
  for (let b = 0; b < bays; b++) {
    const lz = sz + 22 + CL / 2 + b * (CL + 2.5);
    F.box(0, top + 1, lz, W / 2 - 4, 1, CL / 2 + 0.6, { lay: L.shutter, tint: [0.4, 0.42, 0.45], scale: 6 });
    for (let q = 0; q < across; q++) {
      const lx = -((across - 1) * CW) / 2 + q * CW;
      const n = 2 + Math.floor(r() * 4.5 - Math.abs(q - across / 2) / across * 2);
      for (let k = 0; k < n; k++) {
        const w = F.W(lx, 0, lz);
        container(gc(w[0], w[2]), w[0], top + 2 + k * CH, w[2], h, COLOURS[Math.floor(r() * COLOURS.length)], r() < 0.7 ? Math.floor(r() * BRANDS.length) : -1);
      }
    }
  }
  // collision: the hull and the bridge
  P.box(x, (top - keel) / 2, z, Lh / 2, (top + keel) / 2, W / 2 - 2, 0, 'metal', { ship: true });
  const bw = F.W(0, 0, sz);
  P.box(bw[0], top + 32, bw[2], 18, 32, W / 2 - 8, 0, 'metal', { ship: true });
}

export function cruiseShip(P, x, z, h, Lh, W, liv, seed) {
  const r = rnd(seed * 71 + 5);
  const g = P.C.get('surf', x, z), F = frame(g, x, 0, z, h);
  const top = 30, keel = 12, white = tint(0xfbfbf7, 1.12), FR = 70;
  hull(g, F, Lh, W, keel, top, liv.hull === 0xfdfcf7 ? white : tint(liv.hull, 1.1), tint(liv.hull === 0xfdfcf7 ? 0x1d3557 : liv.hull, 0.9), 4);
  // the superstructure: decks stepping back at the front, each with a band of windows/balconies
  const gw = P.C.get('win', x, z), FW = frame(gw, x, 0, z, h);
  const decks = 8, DH = 8.5;
  for (let k = 0; k < decks; k++) {
    const y0 = top + k * DH, zb = -Lh / 2 + 22 + k * 2.5, zf = Lh / 2 - FR - k * k * 0.75, hw = W / 2 - 1 - (k > 5 ? (k - 5) * 4 : 0);
    F.box(0, y0 + DH / 2, (zb + zf) / 2, hw, DH / 2, (zf - zb) / 2, { lay: L.stucco, tint: white, scale: 8 });
    // balconies: dark glass bands down both sides and across the front, lit at night
    for (const sx of [-1, 1]) FW.quad([sx * (hw + 0.06), y0 + 2.2, sx > 0 ? zf - 4 : zb + 6], [sx * (hw + 0.06), y0 + 2.2, sx > 0 ? zb + 6 : zf - 4], [sx * (hw + 0.06), y0 + 6.8, sx > 0 ? zb + 6 : zf - 4], [sx * (hw + 0.06), y0 + 6.8, sx > 0 ? zf - 4 : zb + 6], { lay: L.whiteTiles, tint: [0.08, 0.11, 0.15], rough: 0.22, glow: 0.75, scale: 4 });
    FW.quad([-hw + 2, y0 + 2.2, zf + 0.06], [hw - 2, y0 + 2.2, zf + 0.06], [hw - 2, y0 + 6.8, zf + 0.06], [-hw + 2, y0 + 6.8, zf + 0.06], { lay: L.whiteTiles, tint: [0.08, 0.11, 0.15], rough: 0.22, glow: 0.6, scale: 4 });
    // a coloured band on the promenade deck
    if (k === 1) for (const sx of [-1, 1]) F.box(sx * (hw + 0.1), y0 + 0.7, (zb + zf) / 2, 0.1, 0.7, (zf - zb) / 2, { lay: L.stucco, tint: tint(liv.band, 1.2) });
  }
  // the bridge and its wings at the front of deck 6
  const yb = top + 6 * DH, zbf = Lh / 2 - FR - 36 * 0.75 + 8;
  F.box(0, yb + 4, zbf, W / 2 + 5, 4, 7, { lay: L.stucco, tint: white, scale: 8 });
  FW.quad([-(W / 2 + 5), yb + 4.5, zbf + 7.06], [W / 2 + 5, yb + 4.5, zbf + 7.06], [W / 2 + 5, yb + 7.5, zbf + 7.06], [-(W / 2 + 5), yb + 7.5, zbf + 7.06], { lay: L.whiteTiles, tint: [0.08, 0.1, 0.13], rough: 0.05, glow: 0.9 });
  // lifeboats along both sides under the promenade
  for (let lz = -Lh / 2 + 70; lz < Lh / 2 - FR - 40; lz += 17) for (const sx of [-1, 1]) {
    F.box(sx * (W / 2 + 2.6), top + DH * 2 + 2.2, lz, 2.4, 2.2, 6.5, { lay: L.stucco, tint: tint(0xff8c1a, 1.2), scale: 4 });
    F.box(sx * (W / 2 + 2.6), top + DH * 2 + 4.6, lz, 2.0, 0.6, 5.6, { lay: L.stucco, tint: white, scale: 4 });
  }
  // the top deck: a pool, sun decks, a water slide and the funnel
  const yt = top + decks * DH, zm = -Lh / 2 + 22 + (Lh - FR - 22 - 60) / 2;
  F.quad([-14, yt + 0.12, zm - 20], [14, yt + 0.12, zm - 20], [14, yt + 0.12, zm + 20], [-14, yt + 0.12, zm + 20], { lay: L.whiteTiles, tint: tint(0x38c6e8, 1.1), rough: 0.05, scale: 6 });
  F.quad([-26, yt + 0.06, zm - 60], [26, yt + 0.06, zm - 60], [26, yt + 0.06, zm + 60], [-26, yt + 0.06, zm + 60], { lay: L.deck, tint: [0.85, 0.75, 0.62], scale: 8 });
  const fz = -Lh / 2 + 70;
  F.box(0, yt + 14, fz, 9, 14, 16, { lay: L.stucco, tint: white, scale: 6 });
  F.box(0, yt + 25, fz - 2, 9.3, 3.5, 16.3, { lay: L.stucco, tint: tint(liv.funnel, 1.2), scale: 6 });
  F.box(0, yt + 29.5, fz - 3, 7, 1.2, 12, { lay: L.concrete, tint: [0.12, 0.12, 0.12] });
  // a twisting water slide (the ship's party piece)
  const sc = tint(r() < 0.5 ? 0xffd166 : 0x06d6a0, 1.2), sz0 = zm + 40;
  let prev = null;
  for (let k = 0; k <= 28; k++) {
    const t = k / 28, a = t * TAU * 1.5, y = yt + 24 - t * 22, px = Math.cos(a) * 10, pz = sz0 + Math.sin(a) * 10;
    const p = [px, y, pz];
    if (prev) F.tube(prev, p, 1.4, 1.4, 6, { lay: L.stucco, tint: k % 4 < 2 ? sc : tint(0xef476f, 1.2) });
    prev = p;
  }
  F.box(0, yt + 12, sz0, 1.2, 12, 1.2, { lay: L.concrete, tint: white });
  // a radar mast over the bridge
  F.tube([0, yt, zbf - 20], [0, yt + 26, zbf - 20], 0.7, 0.4, 5, { lay: L.concrete, tint: white });
  F.box(0, yt + 22, zbf - 20, 6, 0.4, 0.6, { lay: L.concrete, tint: white });
  F.box(0, yt + 26.5, zbf - 20, 0.5, 0.5, 0.5, { lay: L.whiteTiles, tint: [1, 0.2, 0.1], glow: 1 });
  // collision: the hull and the superstructure
  P.box(x, (top - keel) / 2, z, W / 2 - 1, (top + keel) / 2, Lh / 2 - 6, h, 'metal', { ship: true });
  const c = F.W(0, 0, (-Lh / 2 + 22 + Lh / 2 - FR) / 2);
  P.box(c[0], top + decks * DH / 2, c[2], W / 2 - 1, decks * DH / 2, (Lh - FR - 22) / 2, h, 'metal', { ship: true });
}
