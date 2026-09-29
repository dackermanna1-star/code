// Dead Air 1 — set dressing pass: the crashed Sky 9 news helicopter, rooftop
// clutter (vents, stacks, pipe runs, dishes, antennas, tar patches, puddles),
// lived-in / looted apartments (furniture, luggage, debris, blood trails),
// wall art (posters, CEDA notices, survivor messages) and the clutter scatter.
import * as THREE from 'three';
import { sign, graffiti, stencil, poster, posterWall, wallMessages, physProp, textTexture, P } from './kit.js';
import { autoClutter, scatterClutter, edgeGrime, cables } from './clutter.js';
import { DF } from '../render/decals.js';
import { YA, F4, F3, YC, ZS, ZN, rng, roofVent, satDish, bloodTrail, scatterBlood } from './da1_common.js';

// ------------------------------------------------------------ small props
// turbine ("whirlybird") roof ventilator
export function turbineVent(L, x, y, z, s = 1) {
  const p = P.prop(L, x, y, z, rng() * 6.28);
  p.box(0, 0.03 * s, 0, 0.62 * s, 0.06 * s, 0.62 * s, 'metal', 0x8a8c88);
  p.frustum(0, 0.14 * s, 0, 0.2 * s, 0.28 * s, 0.16 * s, 'metal', 0x9a9c98, null, 12);
  p.cyl(0, 0.38 * s, 0, 0.19 * s, 0.34 * s, 'metal', 0xa8aaa6, null, 12);
  p.torus(0, 0.56 * s, 0, 0.22 * s, 0.025 * s, 'metalDark', null, [Math.PI / 2, 0, 0], 5, 16);
  p.sph(0, 0.74 * s, 0, 0.25 * s, 'metal', 0xb4b6b0, [1, 0.9, 1], 12);
  for (let k = 0; k < 14; k++) {
    const a = k * Math.PI / 7;
    p.box(Math.cos(a) * 0.245 * s, 0.72 * s, Math.sin(a) * 0.245 * s, 0.015 * s, 0.34 * s, 0.07 * s, 'metalDark', 0x6a6c68, [0, -a, 0.4]);
  }
  p.cyl(0, 0.97 * s, 0, 0.04 * s, 0.05 * s, 'metalDark', null, null, 8);
  p.col(0, 0.5 * s, 0, 0.56 * s, s, 0.56 * s, 'metal');
  return p;
}
// gooseneck exhaust (pipe up, 180° bend, open mouth down)
export function gooseneck(L, x, y, z, ry = 0, r = 0.1, h = 0.8) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.03, 0, r * 4, 0.06, r * 4, 'roof', 0x3a3834);
  p.frustum(0, 0.1, 0, r * 1.2, r * 1.9, 0.14, 'metalDark', 0x4a4a48, null, 10);
  p.cyl(0, h / 2, 0, r, h, 'metal', 0x9a9a94, null, 10);
  p.torus(r * 1.6, h, 0, r * 1.6, r, 'metal', 0x9a9a94, [0, 0, 0], 8, 12, Math.PI);
  p.cyl(r * 3.2, h - 0.12, 0, r, 0.24, 'metal', 0x9a9a94, null, 10);
  p.cyl(r * 3.2, h - 0.25, 0, r * 1.15, 0.03, 'metalDark', null, null, 10);
  p.col(r * 1.2, h / 2, 0, r * 5, h + r, r * 2.4, 'metal');
  return p;
}
// plumbing vent stack with a lead flashing boot
export function ventStack(L, x, y, z, r = 0.05, h = 0.45) {
  const p = P.prop(L, x, y, z, 0);
  p.box(0, 0.01, 0, r * 7, 0.02, r * 7, 'metalDark', 0x4a4a48);
  p.frustum(0, 0.08, 0, r * 1.3, r * 2.6, 0.14, 'metalDark', 0x5a5a58, null, 10);
  p.cyl(0, h / 2, 0, r, h, 'plastic', 0x2a2a2a, null, 10);
  p.cyl(0, h, 0, r * 0.75, 0.02, 'blackMatte', null, null, 10);
  return p;
}
// roof hatch (closed): curb, lid, hinges, handle
export function roofHatch(L, x, y, z, ry = 0, w = 0.9, d = 1.0) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.2, 0, w + 0.12, 0.4, d + 0.12, 'metal', 0x7a7c78);
  p.box(0, 0.43, 0, w + 0.2, 0.06, d + 0.2, 'metalDark', 0x5a5c58);
  for (let k = -1; k <= 1; k += 2) p.box(k * w * 0.3, 0.47, d / 2 + 0.08, 0.12, 0.04, 0.08, 'metalDark');
  p.box(0, 0.48, -d / 2 + 0.05, 0.3, 0.04, 0.04, 'chrome');
  p.col(0, 0.23, 0, w + 0.2, 0.46, d + 0.2, 'metal');
  return p;
}
// electrical disconnect box on a unistrut stand
export function disconnectBox(L, x, y, z, ry = 0) {
  const p = P.prop(L, x, y, z, ry);
  for (const sx of [-0.25, 0.25]) p.box(sx, 0.6, 0, 0.04, 1.2, 0.04, 'metalDark');
  p.box(0, 0.9, 0.02, 0.6, 0.04, 0.04, 'metalDark').box(0, 0.35, 0.02, 0.6, 0.04, 0.04, 'metalDark');
  p.box(0, 0.8, -0.06, 0.34, 0.44, 0.16, 'paintedGreen', 0x5a6a5a);
  p.box(0.19, 0.78, -0.06, 0.04, 0.16, 0.04, 'blackMatte');
  p.box(0, 0.8, -0.145, 0.12, 0.08, 0.005, 'paintedYellow', 0xd8b020);
  p.col(0, 0.6, 0, 0.6, 1.2, 0.2, 'metal');
  return p;
}
// pipe run on short timber blocks along a roof
export function pipeRun(L, pts, y, h = 0.3, r = 0.06, tint = 0x8a8c88, mat = 'metal') {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    P.pipe(L, ax, y + h, az, bx, y + h, bz, r, mat, tint);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(len / 1.8));
    const ang = Math.atan2(bz - az, bx - ax);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const s = P.prop(L, ax + (bx - ax) * t, y, az + (bz - az) * t, -ang);
      s.box(0, 0.05, 0, 0.12, 0.1, 0.36, 'woodDark', 0x4a3a2a).box(0, (h - r) / 2 + 0.05, 0, 0.04, h - r - 0.1, 0.04, 'metalDark');
      s.box(0, h - r - 0.02, 0, 0.05, 0.04, r * 2.6, 'metalDark');
    }
  }
}
// dark tar-sealed patches and seam strips over a roof (visual only; asphalt gets puddles)
export function tarPatches(L, x0, z0, x1, z1, y, n = 8, avoid = []) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
    if (avoid.some((a) => x > a[0] && x < a[2] && z > a[1] && z < a[3])) continue;
    const w = 0.7 + rng() * 2.4, d = 0.5 + rng() * 1.5;
    P.prop(L, x, y + 0.002 + (i % 5) * 0.0015, z, rng() * 3.14).box(0, 0.002, 0, w, 0.003, d, 'asphalt', rng.pick([0x2a2826, 0x222020, 0x302c28]));
  }
  // seams: long thin tar strips
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const alongX = rng() < 0.5;
    const c = alongX ? z0 + rng() * (z1 - z0) : x0 + rng() * (x1 - x0);
    const a = alongX ? x0 + rng() * (x1 - x0) * 0.5 : z0 + rng() * (z1 - z0) * 0.5;
    const len = 3 + rng() * 6;
    const yy = y + 0.0105 + i * 0.001;
    if (alongX) L.box(a, yy, c - 0.05, Math.min(x1, a + len), yy + 0.003, c + 0.05, 'asphalt', { collide: false, tint: 0x1c1a18 });
    else L.box(c - 0.05, yy, a, c + 0.05, yy + 0.003, Math.min(z1, a + len), 'asphalt', { collide: false, tint: 0x1c1a18 });
  }
}
// small rooftop water tank on a steel stand (plastic)
function polyTank(L, x, y, z, color = 0x2a4a3a) {
  const p = P.prop(L, x, y, z, 0);
  for (const [sx, sz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) p.box(sx, 0.4, sz, 0.08, 0.8, 0.08, 'metalDark');
  p.box(0, 0.82, 0, 1.4, 0.06, 1.4, 'metalDark');
  p.cyl(0, 1.55, 0, 0.72, 1.4, 'plastic', color, null, 18);
  for (let k = 0; k < 4; k++) p.torus(0, 1.05 + k * 0.33, 0, 0.72, 0.02, 'plastic', color, [Math.PI / 2, 0, 0], 4, 18);
  p.frustum(0, 2.34, 0, 0.3, 0.72, 0.18, 'plastic', color, null, 18);
  p.cyl(0, 2.47, 0, 0.26, 0.08, 'plastic', 0x1a1a1a, null, 14);
  p.tube(0.7, 1.0, 0, 0.9, 0.5, 0, 0.04, 'plastic', 0x2a2a2a);
  p.col(0, 1.2, 0, 1.5, 2.4, 1.5, 'plastic');
  return p;
}
// clothes / linen heap
function clothes(L, x, y, z, n = 5) {
  const p = P.prop(L, x, y, z, rng() * 6.28);
  for (let i = 0; i < n; i++) p.rbox((rng() - 0.5) * 0.6, 0.03 + i * 0.03, (rng() - 0.5) * 0.5, 0.35 + rng() * 0.3, 0.05, 0.3 + rng() * 0.25, 0.02, 'fabric', rng.pick([0x3a4a6a, 0x8a2a2a, 0xd8d0c0, 0x2a2a2a, 0x6a5a3a, 0x4a6a4a]), [0, rng() * 3, (rng() - 0.5) * 0.3]);
  return p;
}
// framed picture hanging crooked (x, y, z = wall point; ry faces the room)
function frame(L, x, y, z, ry, w = 0.5, h = 0.4) {
  const p = P.prop(L, x, y, z, ry);
  const tilt = (rng() - 0.5) * 0.25;
  p.box(0, 0, 0.015, w, h, 0.03, 'woodDark', rng.pick([0x3a2a1a, 0x8a7a5a, 0x1a1a1a]), [0, 0, tilt]);
  p.box(0, 0, 0.032, w - 0.08, h - 0.08, 0.005, 'paper', rng.pick([0x8a9aa8, 0xa89878, 0x6a7a5a, 0xb8a8a0]), [0, 0, tilt]);
  return p;
}
// knocked-over floor lamp
function fallenLamp(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.cyl(0, 0.02, 0, 0.16, 0.04, 'metalDark', null, null, 12);
  p.cylX(0.75, 0.05, 0, 0.012, 1.5, 'chrome', null, 6);
  p.frustum(1.55, 0.14, 0, 0.1, 0.2, 0.26, 'fabric', 0xd8c8a0, [0, 0, Math.PI / 2 - 0.3], 12);
}
// the Sky 9 news helicopter, rolled onto its right side, nose down, tail up
export function chopperWreck(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  const W = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.28, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0, -0.1, 'ZXY')), new THREE.Vector3(1, 1, 1));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Vp = new THREE.Vector3(), Vs = new THREE.Vector3();
  const put = (g, mat, pos, rot, sc, tint) => {
    E.set(...(rot || [0, 0, 0])); Q.setFromEuler(E);
    M.compose(Vp.set(...pos), Q, Vs.set(...(sc || [1, 1, 1]))).premultiply(W);
    g.applyMatrix4(M);
    p.geo(g, mat, 0, 0, 0, [0, 0, 0], [1, 1, 1], tint);
  };
  const navy = 0x1a2a4c, white = 0xd8d8d0;
  const cap = () => new THREE.CapsuleGeometry(1.1, 2.3, 6, 16).rotateZ(Math.PI / 2);
  put(cap(), 'carPaint', [0, 0, 0], null, [1, 1, 0.86], navy); // cabin
  put(cap(), 'carPaint', [0.05, -0.42, 0], null, [0.98, 0.62, 0.88], white); // two-tone belly
  put(new THREE.SphereGeometry(1.02, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateZ(-Math.PI / 2), 'glassDirty', [1.45, 0.12, 0], null, [1.05, 0.86, 0.84], 0x141c22); // canopy
  put(new THREE.BoxGeometry(0.9, 0.12, 1.2), 'blackMatte', [2.05, 0.35, 0.05], [0, 0, -0.5]); // smashed-in windscreen
  put(new THREE.SphereGeometry(0.26, 12, 8), 'metalDark', [2.2, -0.95, 0], null, null, 0x2a2a2a); // camera gimbal ball
  put(new THREE.SphereGeometry(0.1, 8, 6), 'glassDirty', [2.42, -0.98, 0], null, null, 0x0a1a2a);
  put(new THREE.BoxGeometry(2.0, 0.5, 1.15), 'carPaint', [-0.35, 1.12, 0], null, null, navy); // engine fairing
  put(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 12).rotateZ(Math.PI / 2), 'metalDark', [-1.55, 1.15, 0.28], null, null, 0x2a2624); // exhausts
  put(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 12).rotateZ(Math.PI / 2), 'metalDark', [-1.55, 1.15, -0.28], null, null, 0x2a2624);
  put(new THREE.CylinderGeometry(0.11, 0.15, 0.45, 10), 'metalDark', [0, 1.55, 0]); // mast
  put(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12), 'metalDark', [0, 1.82, 0]); // hub
  // blades: one long and drooping, one snapped, one bent back
  put(new THREE.BoxGeometry(0.3, 0.05, 4.2), 'blackMatte', [0.3, 1.55, 2.2], [0.22, 0.15, 0]);
  put(new THREE.BoxGeometry(0.3, 0.05, 1.3), 'blackMatte', [-0.6, 1.8, -0.75], [-0.05, 0.9, 0]);
  put(new THREE.BoxGeometry(0.3, 0.05, 2.6), 'blackMatte', [1.3, 1.6, -1.1], [-0.2, -0.8, 0.3]);
  // tail boom (cracked, kinked), fin, stabiliser, tail rotor
  put(new THREE.CylinderGeometry(0.2, 0.4, 5.0, 12).rotateZ(Math.PI / 2), 'carPaint', [-3.95, 0.35, 0], [0, 0.1, 0.06], null, navy);
  put(new THREE.BoxGeometry(1.1, 1.5, 0.1), 'carPaint', [-6.55, 0.95, 0.25], [0, 0.1, 0.4], null, navy);
  put(new THREE.BoxGeometry(0.5, 0.06, 1.8), 'carPaint', [-5.9, 0.42, 0.22], [0, 0.1, 0], null, white);
  put(new THREE.BoxGeometry(0.08, 1.3, 0.1), 'blackMatte', [-6.75, 1.25, 0.42], [0, 0, 0.6]);
  put(new THREE.BoxGeometry(0.08, 0.1, 1.2), 'blackMatte', [-6.75, 1.25, 0.42], [0.3, 0, 0]);
  put(new THREE.BoxGeometry(0.4, 0.06, 0.4), 'emissiveRed', [-6.9, 1.72, 0.3], [0, 0, 0.4]); // dead nav light
  // skids: one intact, one crushed under the fuselage
  put(new THREE.CylinderGeometry(0.05, 0.05, 3.8, 8).rotateZ(Math.PI / 2), 'metalDark', [0.1, -1.38, -0.92]);
  put(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8).rotateZ(Math.PI / 2), 'metalDark', [0.3, -1.05, 0.95], [0.4, 0.3, 0.1]);
  for (const sx of [-0.9, 0.9]) {
    put(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 8), 'metalDark', [sx, -1.05, -0.8], [-0.4, 0, 0]);
    put(new THREE.CylinderGeometry(0.045, 0.045, 0.45, 8), 'metalDark', [sx, -0.9, 0.82], [0.9, 0, 0]);
  }
  // open side door (up side), windows, torn skin
  put(new THREE.BoxGeometry(1.15, 1.0, 0.04), 'blackMatte', [0.15, 0.05, 0.93], null, null, 0x050505);
  for (const sz of [-0.93, 0.93]) put(new THREE.BoxGeometry(0.7, 0.45, 0.04), 'glassDirty', [1.05, 0.38, sz], null, null, 0x1a2228);
  put(new THREE.BoxGeometry(0.9, 0.5, 0.04), 'metalDark', [-1.2, -0.15, 0.95], [0, 0.2, 0.3], null, 0x2a2a2a);
  p.col(0, 1.25, 0, 4.8, 2.5, 2.8, 'metal');
  p.col(-4.4, 1.5, 0.2, 4.6, 1.2, 1.2, 'metal');
  // "SKY 9 NEWS" livery on both flanks: a text-textured quad following the roll (one draw call)
  const tex = textTexture('SKY 9  NEWS', { w: 512, h: 144, bg: '#1a2a4c', fg: '#f0f0e8', font: 'Arial Black, Impact, sans-serif', plain: true, clean: true });
  const lm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.25 });
  const lg = new THREE.PlaneGeometry(1.7, 0.48);
  const g2 = lg.clone().rotateY(Math.PI).translate(0, 0, -2 * 0.962);
  lg.translate(0, 0, 0);
  const both = new THREE.BufferGeometry();
  const merge = (a, b) => { const pa = [...a.attributes.position.array, ...b.attributes.position.array], na = [...a.attributes.normal.array, ...b.attributes.normal.array], ua = [...a.attributes.uv.array, ...b.attributes.uv.array]; const off = a.attributes.position.count; const idx = [...a.index.array, ...[...b.index.array].map((i) => i + off)]; both.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); both.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3)); both.setAttribute('uv', new THREE.Float32BufferAttribute(ua, 2)); both.setIndex(idx); };
  merge(lg, g2);
  const mesh = new THREE.Mesh(both, lm);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(p.base).multiply(W).multiply(new THREE.Matrix4().makeTranslation(-0.55, 0.28, 0.962));
  mesh.matrixWorldNeedsUpdate = true;
  mesh.receiveShadow = true;
  L.addObject(mesh);
  return p;
}

// ------------------------------------------------------------ roofs
function dressRoofs(L, game, S) {
  // --- Building A (roof YA, x 0..32, z 16..44); greenhouse x 9.6..27 z 20.5..33.5, annex x 3..9.6 z 20.3..33.7
  const A = [[2.8, 20.2, 27.2, 34], [27.8, 21.8, 32, 25.4], [27.6, 38.5, 31.6, 43.5], [11, 36, 23, 41]];
  tarPatches(L, 0.4, 16.4, 31.6, 43.6, YA, 14, A);
  turbineVent(L, 1.6, YA, 35.5);
  turbineVent(L, 10.4, YA, 18.3, 0.9);
  gooseneck(L, 26, YA, 35, Math.PI / 2);
  gooseneck(L, 1.4, YA, 25.5, 0, 0.12, 0.9);
  for (const [x, z] of [[2.2, 19.5], [8.6, 35.5], [24.5, 42.8], [5.5, 42.6], [27.4, 19.8]]) ventStack(L, x, YA, z);
  roofHatch(L, 1.6, YA, 30, Math.PI / 2);
  pipeRun(L, [[1.0, 17.2], [9.6, 17.2], [9.6, 19.4]], YA, 0.28, 0.05, 0x9a4a2a, 'paintedRed'); // gas line
  pipeRun(L, [[12.5, 20.1], [12.5, 19.4], [26.8, 19.4]], YA, 0.2, 0.035, 0x8a8c88);
  disconnectBox(L, 14.3, YA, 17.1, 0);
  P.antenna(L, 1.4, YA, 17.6, 7);
  cables(L, [1.4, YA + 6.2, 17.6], [3.8, YA + 3.3, 21], 0.6, 0.012);
  cables(L, [1.4, YA + 5.2, 17.6], [9.6, YA + 1.2, 17.2], 0.9, 0.01);
  satDish(L, 31, YA, 30.2, -Math.PI / 2, 0.5);
  polyTank(L, 2.2, YA, 42.2, 0x2a3a4a);
  physProp(L, 'bucket', 3.2, YA, 43);
  P.plywood(L, 31.1, YA, 27.5, -Math.PI / 2, 1.2, 1.6, 0.18, false);
  // --- Building B roof (x 39..66, z 16..44)
  const B = [[39, 16, 44.2, 27.4], [45, 31, 58, 36.5], [55.4, 27.2, 58.6, 29.2], [57, 36, 63, 41.5], [58.5, 17.5, 64, 24]];
  tarPatches(L, 39.4, 16.4, 65.6, 43.6, YA, 16, B);
  turbineVent(L, 45.8, YA, 19.2);
  turbineVent(L, 54.2, YA, 25.6, 1.1);
  turbineVent(L, 63.4, YA, 32.6, 0.9);
  gooseneck(L, 50.2, YA, 22.5, 0.4);
  gooseneck(L, 62.8, YA, 42.6, -Math.PI / 2, 0.14, 1.0);
  for (const [x, z] of [[46.6, 29.6], [53.4, 30.2], [60.4, 26.6], [44.8, 36.2], [55, 42.8], [65, 24.5]]) ventStack(L, x, YA, z);
  roofHatch(L, 53.6, YA, 18.2, 0);
  pipeRun(L, [[44.5, 17.1], [58, 17.1], [58, 22.8]], YA, 0.3, 0.07, 0x8a8c88);
  pipeRun(L, [[65.2, 30.6], [65.2, 16.9], [62.6, 16.9]], YA, 0.25, 0.05, 0x9a4a2a, 'paintedRed');
  P.duct(L, 48, YA + 0.4, 20.3, 48, YA + 0.4, 23.6, 0.6, 0.4);
  P.duct(L, 51.2, YA + 0.4, 20.3, 51.2, YA + 0.4, 23.6, 0.6, 0.4);
  disconnectBox(L, 49.6, YA, 17.1, 0);
  disconnectBox(L, 53.5, YA, 32.9, Math.PI);
  P.antenna(L, 64.6, YA, 17.4, 9);
  cables(L, [64.6, YA + 7, 17.4], [61.2, YA + 6.5, 20.8], 0.8, 0.012);
  satDish(L, 44.8, YA + 3.25, 18.2, 2.4, 0.55); // on the bulkhead roof
  satDish(L, 46.8, YA, 42.8, 0.2, 0.45);
  physProp(L, 'bucket', 47.2, YA, 39.6);
  // --- Building C roof (bar, YC): the service strip behind the bar and the chopper corner
  tarPatches(L, 66.4, 31.6, 79.6, 43.6, YC, 8, [[70, 35, 78, 42]]);
  turbineVent(L, 67.4, YC, 42.6);
  gooseneck(L, 79, YC, 33, Math.PI);
  P.acUnit(L, 78.4, YC, 42.4, Math.PI);
  pipeRun(L, [[66.8, 32.2], [66.8, 43.3], [69.5, 43.3]], YC, 0.25, 0.05, 0x8a8c88);
  // --- D roof (14.4) seen from C: water tank, AC, antenna
  P.waterTower(L, 99, 14.4, 22);
  P.acUnit(L, 86, 14.4, 20, 0);
  P.acUnit(L, 89.5, 14.4, 20, 0);
  turbineVent(L, 93, 14.4, 38);
  // puddles on the tar
  for (const [x0, z0, x1, z1, y] of [[0.4, 34, 31, 43.5, YA], [0.4, 16.4, 31, 20, YA], [44, 27.5, 65.5, 43.5, YA], [44, 16.4, 65.5, 27, YA], [66.2, 16.4, 79.8, 43.6, YC]]) scatterClutter(L, [x0, y - 0.1, z0, x1, y + 0.5, z1], { kinds: ['water', 'grime', 'leaves'], density: 0.8, seed: Math.round(x0 * 7 + z0) });
}

// ------------------------------------------------------------ apartments
function dressApartments(L, game, S) {
  const y4 = F4, y3 = F3;
  // 5th floor corridor: residents' bits and pieces, notices
  P.cooler(L, 53.8, y4, 28.75, 0.4, 0x2a5a9a, false);
  frame(L, 45.8, y4 + 1.6, 27.21, 0);
  frame(L, 52.2, y4 + 1.55, 29.19, Math.PI, 0.6, 0.45);
  poster(L, 'evac', 57.6, y4 + 1.5, 27.215, 0, 0.5, 0.72, { wet: 0.4, torn: 0.2 });
  poster(L, 'missing', 48.4, y4 + 1.45, 29.185, Math.PI, 0.3, 0.42, { title: 'RUTHIE OKAFOR' });
  poster(L, 'health', 42.2, y4 + 1.5, 29.185, Math.PI, 0.45, 0.62, { fade: 0.4 });
  L.decal(46.9, y4 + 1.2, 27.21, 0, 0, 1, 0.8, DF.HAND, { noRoll: true });
  L.decal(44.4, y4 + 1.0, 29.19, 0, 0, -1, 0.7, DF.SMEAR);
  P.suitcase(L, 49.3, y4, 28.8, 1.3, 0x7a1a14, false);
  // 5A: the Witch's living room — overturned chair, blood from the sofa to the door
  bloodTrail(L, 47.8, 21.4, 47.1, 26.6, y4, 6);
  clothes(L, 51.6, y4, 22.2, 5);
  frame(L, 50.2, y4 + 1.5, 16.33, 0, 0.7, 0.5);
  frame(L, 43.97, y4 + 1.6, 18.2, Math.PI / 2);
  P.trashBags(L, 45.2, y4, 26.2, 2);
  // 5C: somebody packed for the airport and never left
  P.rug(L, 43.4, y4 + 0.008, 38.5, 2.6, 3.4, 0x5a2a2a);
  P.suitcase(L, 45.1, y4 + 0.55, 34.4, 0.2, 0x2a3a5a, false);
  P.suitcase(L, 46.6, y4, 36.9, 1.4, 0x3a3a3a, true);
  clothes(L, 44.4, y4, 36.8, 6);
  P.lamp(L, 47.4, y4, 42.9);
  fallenLamp(L, 40.2, y4, 33.2, 0.6);
  P.bookshelf(L, 47.7, y4, 39.5, -Math.PI / 2);
  P.chair(L, 42.1, y4, 40.6, 2.2, 'woodDark', true);
  frame(L, 39.46, y4 + 1.6, 38.4, Math.PI / 2, 0.6, 0.45);
  frame(L, 39.46, y4 + 1.5, 43.0, Math.PI / 2, 0.4, 0.5);
  sign(L, 'GONE TO\nMETRO INTL\nGATE C\n— DAD', 47.83, y4 + 1.55, 42.2, -Math.PI / 2, 0.42, 0.42, { bg: '#f0ecd8', fg: '#1a1a6a', font: 'Comic Sans MS, Arial, sans-serif', weight: 'normal' });
  bloodTrail(L, 45.2, 35.8, 44.6, 30.2, y4, 5);
  // 4th floor corridor
  frame(L, 51.8, y3 + 1.6, 27.21, 0);
  poster(L, 'quarantine', 57.8, y3 + 1.5, 27.215, 0, 0.55, 0.78, { torn: 0.3 });
  poster(L, 'missing', 52.5, y3 + 1.4, 29.185, Math.PI, 0.3, 0.42, { title: 'THEO + MAE BRANDT' });
  poster(L, 'flyer', 59.2, y3 + 1.45, 29.185, Math.PI, 0.3, 0.42, { lines: ['TENANTS MEETING', 'ROOF GARDEN 7PM', 'RE: THE NOISES', 'BRING FLASHLIGHTS'] });
  wallMessages(L, 64.6, y3 + 1.6, 29.19, Math.PI, 1.5, 1.0, { lines: ['FIRE ESCAPE\n→ HOTEL', 'HARBORVIEW\nHAS A SAFE ROOM'], density: 0.7 });
  L.decal(62.4, y3 + 1.1, 27.21, 0, 0, 1, 0.8, DF.HAND, { noRoll: true });
  L.decal(63.4, y3 + 0.9, 29.19, 0, 0, -1, 0.9, DF.BLOOD2);
  physProp(L, 'trashcan', 53.6, y3, 28.6);
  P.corpse(L, 57.6, y3 + 0.01, 28.5, -0.3, 0x3a2a3a);
  L.decal(57.6, y3 + 0.012, 28.5, 0, 1, 0, 1.4, DF.POOL);
  // 4D (landing under the hole): the family room below the fire
  P.rug(L, 50.4, y3 + 0.008, 31.8, 2.2, 2.4, 0x3a3a5a);
  P.table(L, 51.2, y3, 42.4, 0.5, 1.2, 0.8, 'wood');
  P.chair(L, 50.2, y3, 42.9, 2.0, 'wood', true);
  P.chair(L, 52.3, y3, 41.6, -0.7, 'wood');
  P.lamp(L, 48.6, y3, 30);
  frame(L, 48.08, y3 + 1.6, 31.4, -Math.PI / 2, 0.6, 0.45);
  frame(L, 56.92, y3 + 1.5, 39.2, Math.PI / 2, 0.5, 0.4);
  clothes(L, 54.3, y3, 40.6, 4);
  P.suitcase(L, 53.9, y3, 31.2, 0.9, 0x5a4a3a, false);
  bloodTrail(L, 54.8, 36.5, 55.3, 30.0, y3, 6);
  graffiti(L, 'FLOOR\nGAVE WAY\nWATCH IT', 56.92, y3 + 1.6, 36.5, Math.PI / 2, 1.3, 0.8, '#b8201a');
  // 4E (supplies)
  P.rug(L, 61.5, y3 + 0.008, 38.2, 2.8, 2.2, 0x6a4a2a);
  P.tv(L, 65.3, y3, 37.2, -Math.PI / 2);
  P.lamp(L, 58, y3, 42.9);
  P.dresser(L, 58.2, y3, 32.2, Math.PI / 2);
  frame(L, 57.08, y3 + 1.6, 40.2, -Math.PI / 2);
  P.suitcase(L, 63.2, y3, 40.2, 2.2, 0x2a4a3a, true);
  clothes(L, 62.4, y3, 42.8, 5);
  wallMessages(L, 61.5, y3 + 1.7, 43.52, Math.PI, 1.6, 1.0, { lines: ['WE HID HERE 3 DAYS', 'TOOK THE CANNED FOOD\nSORRY'], density: 0.6 });
  // 4B (the burst room): a barricade that failed
  P.dresser(L, 60.5, y3, 26.2, Math.PI);
  P.chair(L, 59.2, y3, 25.6, 0.9, 'woodDark', true);
  P.bookshelf(L, 62.4, y3, 25.9, 0.2);
  P.plywood(L, 56.4, y3, 26.6, 0, 1.2, 1.9, 0.2, true);
  bloodTrail(L, 60.5, 25.4, 58, 19, y3, 6);
  scatterBlood(L, 55, 18, 64, 25, y3, 3);
  frame(L, 53.12, y3 + 1.6, 21.2, Math.PI / 2);
  clothes(L, 64.6, y3, 18.2, 5);
}

// ------------------------------------------------------------ wall art (street / hotel / office)
function wallArt(L, game, S) {
  // street-level facades on the north side of Harbor St (face +z)
  posterWall(L, 60.4, 1.5, ZS + 0.03, 0, 2.6, 1.6, { kinds: ['movie', 'concert', 'flyer', 'missing', 'evac'] });
  poster(L, 'evac', 51.2, 1.6, ZS + 0.04, 0, 0.55, 0.8, { wet: 0.5 });
  poster(L, 'airline', 36.6, 2.0, ZS + 0.04, 0, 1.2, 0.8, { title: 'SKYLINE AIR', torn: 0.25 });
  graffiti(L, 'CEDA\nLIED', 52.8, 1.4, ZS + 0.07, 0, 1.4, 0.8, '#d8d8c8', { style: 'stencil' });
  // D ground floor (Sterling Mutual lobby glass is at z 44.03; the piers)
  poster(L, 'quarantine', 103.6, 1.5, ZS + 0.06, 0, 0.55, 0.78, { torn: 0.4 });
  graffiti(L, 'RUN', 104.8, 2.3, ZS + 0.07, 0, 1.3, 0.6, '#e05a1a', { style: 'throwup', color2: '#141414' });
  // hotel base (south side, faces -z)
  posterWall(L, 95.2, 1.5, 63.97, Math.PI, 2.8, 1.6, { kinds: ['evac', 'health', 'missing', 'flyer', 'quarantine'] });
  poster(L, 'evac', 106.4, 1.7, 63.97, Math.PI, 0.55, 0.8, { wet: 0.3 });
  poster(L, 'airline', 74.6, 2.2, 63.97, Math.PI, 1.2, 0.8, { title: 'FLY NEWBURG', torn: 0.2 });
  stencil(L, 'EVAC POINT\nMETRO INTL →', 100.2, 2.1, 63.97, Math.PI, 2.0, 0.6, '#e8e0c8');
  graffiti(L, 'HOTEL IS SAFE\nKITCHEN →', 125.4, 1.7, 63.97, Math.PI, 1.8, 0.9, '#e8e8e0');
  graffiti(L, 'KESS', 78.4, 1.2, 63.97, Math.PI, 1.2, 0.5, '#e0a010', { style: 'tag' });
  // stencil arrows on the road toward the loading dock
  stencil(L, 'SERVICE ENTRANCE →', 110.5, 0.16, 62.9, 0, 2.2, 0.35, '#e8e0c8');
  // office (D): CEDA health notice + survivor scrawl
  poster(L, 'health', 84.88, YC + 1.5, 22.4, -Math.PI / 2, 0.45, 0.62, { fade: 0.2 });
  poster(L, 'evac', 91.8, YC + 1.55, 34.43, Math.PI, 0.5, 0.72, { torn: 0.2 });
  wallMessages(L, 85.08, YC + 1.6, 32.2, Math.PI / 2, 1.6, 1.0, { lines: ['WINDOW → TRUCK\n→ HOTEL', 'SAW A PLANE\nLAND 9PM'], density: 0.7 });
}

// ------------------------------------------------------------ clutter scatter
function scatter(L) {
  // roofs + deck
  autoClutter(L, { theme: 'rooftop', box: [0, 16, 66, 44], yMin: YA - 0.5, yMax: YA + 0.5, density: 1.3, seed: 911 });
  autoClutter(L, { theme: 'rooftop', box: [66, 16, 80, 44], yMin: YC - 0.5, yMax: YC + 0.5, density: 1.2, seed: 912 });
  // apartments + office
  autoClutter(L, { theme: 'city', box: [39, 16, 66, 44], yMin: F3 - 0.5, yMax: F4 + 0.5, density: 1.5, seed: 913 });
  autoClutter(L, { theme: 'office', box: [80, 16, 104, 44], yMin: YC - 0.5, yMax: YC + 0.5, density: 1.4, seed: 914 });
  // street + dock + service corridor
  autoClutter(L, { theme: 'city', box: [62, 44, 132, 70], yMax: 2, density: 1.6, seed: 915 });
  autoClutter(L, { theme: 'hospital', box: [106, 70, 124, 92], yMin: 0.8, yMax: 2, density: 1.0, seed: 916 });
  edgeGrime(L, 39.3, 27.2, 65.7, 29.2, F4, { strength: 0.8 });
  edgeGrime(L, 46.3, 27.2, 65.7, 29.2, F3, { strength: 0.8 });
  edgeGrime(L, 115, 70.2, 117.4, 84.4, 1.2, { strength: 0.7 });
}

export function buildDressing(L, game, S) {
  dressRoofs(L, game, S);
  dressApartments(L, game, S);
  wallArt(L, game, S);
  scatter(L);
}
