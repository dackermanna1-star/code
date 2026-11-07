// Lavatories: complete small rooms (walls, ceiling, floor pan) with a bi-fold
// door, lock + occupied indicator, vacuum toilet (lid, seat, flush valve),
// vanity with sink / faucet / soap, paper towel dispenser, waste flap, mirror
// (planar reflection when the player is near, env-mapped otherwise), lights,
// "Return to seat" sign, call button, baby changing table, grab handle,
// ashtray and placards.
//
// Every lavatory is built in a RIGHT-HAND frame (inboard wall at x = X0 > 0,
// outboard towards +x, door in the aft-facing wall z = zMax) and mirrored for
// the left-hand ones.
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
import { Kit, T, mul, MIRROR_X, box, boxMM, rbox, cyl, plane, plate, frame, tube, grabHandle, lathe, slab, ccw, worldUV, Anim, smoothstep, clamp , flipX } from './geom.js';
import { Mirror } from './mirror.js';

const CY = AIRCRAFT.fuselage.centerY;
const R_IN = 1.635;           // lav outboard wall, interior surface
const R_OUT = 1.665;          // exterior (towards the lining)
const TW = 0.03;              // wall thickness
const YC = 2.02;              // interior ceiling
const TOP = 2.2;              // walls go up into the cabin ceiling
const arcX = (y, r) => { const d = y - CY; return Math.sqrt(Math.max(0, r * r - d * d)); };
const arcY = (x, r) => CY + Math.sqrt(Math.max(0, r * r - x * x));

const C = {
  wall: [0.87, 0.87, 0.85],        // light grey-beige laminate
  wallOut: [0.84, 0.84, 0.82],
  white: [0.93, 0.93, 0.91],
  floor: [0.24, 0.25, 0.27],
  grey: [0.55, 0.56, 0.57],
  dark: [0.07, 0.07, 0.075],
  door: [0.78, 0.78, 0.76],
  seat: [0.88, 0.88, 0.86],
};

/** Outline of a lav fore/aft wall in (x, y) for the right-hand frame, optionally with a door notch. */
/** Plate with a rectangular window (indicator bezel), facing +Z. */
function windowPlate(w, h, hw, hh, d) {
  const g = slab(ccw([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]), -d / 2, d / 2,
    [[[-hw / 2, -hh / 2], [-hw / 2, hh / 2], [hw / 2, hh / 2], [hw / 2, -hh / 2]]]);
  return g;
}

function wallOutline(X0, notch = null) {
  const pts = [[X0, 0]];
  if (notch) pts.push([notch[0], 0], [notch[0], notch[2]], [notch[1], notch[2]], [notch[1], 0]);
  const xEdge = 0.672;
  const yEdge = arcY(xEdge, R_OUT);
  for (let i = 0; i <= 16; i++) { const y = (yEdge * i) / 16; pts.push([arcX(y, R_OUT), y]); }
  pts.push([xEdge, TOP], [X0, TOP]);
  return ccw(pts);
}

/** Interior skin outline (floor to the lav ceiling). */
function interiorOutline(xa, notch = null) {
  const pts = [[xa, 0]];
  if (notch) pts.push([notch[0], 0], [notch[0], notch[2]], [notch[1], notch[2]], [notch[1], 0]);
  for (let i = 0; i <= 16; i++) { const y = (YC * i) / 16; pts.push([arcX(y, R_IN), y]); }
  pts.push([xa, YC]);
  return ccw(pts);
}

/**
 * Build one lavatory.
 * def: { id, side: 'left'|'right', X0 (abs inboard boundary), zMin, zMax, jumpseatWall (bool) }
 */
export function buildLav(ctx, def) {
  const { M, tex, parts, glowers } = ctx;
  const mirror = def.side === 'left';
  const W = mirror ? MIRROR_X : new THREE.Matrix4();
  // conjugated placement for symmetric pieces (keeps text readable and the winding positive)
  const wm = (m) => (mirror ? mul(MIRROR_X, m, MIRROR_X) : m);
  // placards: pre-flip so they read correctly once the whole room is mirrored
  const pl = (g) => (mirror ? flipX(g) : g);
  const X0 = def.X0, Z0 = def.zMin, Z1 = def.zMax;
  const xa = X0 + TW, za = Z0 + TW, zb = Z1 - TW;
  const xd0 = xa + 0.02, xd1 = xd0 + 0.58, dh = 1.86;          // door opening
  const xv1 = 0.985;                                               // vanity outboard edge
  const zv = za + 0.42;                                            // vanity front
  const xs = (xa + xv1) / 2, zs = za + 0.2;                         // sink centre
  const zt = za + 0.675, xtb = 1.25;                               // toilet centre (bowl)
  const R = (n) => tex.rect(n);
  // interior AO: corners of the small room, floor contact, under the counter
  const roomAO = (x, y, z, nx, ny, nz) => {
    const ax = Math.abs(x);
    let ao = 0.6 + 0.4 * smoothstep(0.0, 0.3, y);
    const dWall = Math.min(ax - xa, z - za, zb - z, Math.max(0, arcX(clamp(y, 0, 2), R_IN) - ax));
    ao *= 0.78 + 0.22 * smoothstep(0.0, 0.16, dWall);
    if (y > YC - 0.12) ao *= 0.86 + 0.14 * smoothstep(YC, YC - 0.12, y);
    if (ny < -0.5) ao *= 0.85;
    return ao;
  };
  const kit = new Kit(roomAO);
  const out = new Kit();      // exterior faces (cabin side) use the cabin-like default AO

  // ======================================================================= walls
  // inboard wall (two faces: interior + aisle side) – box spanning the full depth
  out.add('plastic', worldUV(boxMM(X0, 0, Z0, xa, TOP, Z1, [1, 10, 4]), 1.2), null, { color: C.wallOut });
  // back wall (Z0) and door wall (Z1, with the door notch)
  const back = slab(wallOutline(X0), Z0, za);
  out.add('plastic', worldUV(back, 1.2), null, { color: C.wallOut });
  const door = slab(wallOutline(X0, [xd0, xd1, dh]), zb, Z1);
  out.add('plastic', worldUV(door, 1.2), null, { color: C.wallOut });
  // interior skins (slightly inset copies so the interior gets the room AO + a cleaner colour)
  kit.add('plastic', worldUV(boxMM(xa, 0.0, za, xa + 0.002, YC, zb, [1, 10, 6]), 2.6), null, { color: C.wall });
  const backIn = slab(interiorOutline(xa), za, za + 0.002);
  kit.add('plastic', worldUV(backIn, 2.6), null, { color: C.wall });
  const doorIn = slab(interiorOutline(xa, [xd0, xd1, dh]), zb - 0.002, zb);
  kit.add('plastic', worldUV(doorIn, 2.6), null, { color: C.wall });
  // outboard curved wall (interior face): cylinder patch r = R_IN from the floor up to the ceiling
  {
    const p0 = Math.asin((0 - CY) / R_IN), p1 = Math.asin((YC - CY) / R_IN);
    const n = 18;
    const g = new THREE.BufferGeometry();
    const pos = [], nor = [], uv = [], idx = [];
    const zs2 = [za, za + 0.25, za + 0.5, za + 0.75, zb];
    for (let j = 0; j < zs2.length; j++) for (let i = 0; i <= n; i++) {
      const p = p0 + (p1 - p0) * i / n;
      pos.push(R_IN * Math.cos(p), CY + R_IN * Math.sin(p), zs2[j]);
      nor.push(-Math.cos(p), -Math.sin(p), 0);
      uv.push(zs2[j] * 2.6, (p * R_IN) * 2.6);
    }
    for (let j = 0; j < zs2.length - 1; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    kit.add('plastic', g, null, { color: C.wall });
  }
  // ceiling (interior) + top cap
  const xc1 = arcX(YC, R_IN);
  kit.add('plastic', worldUV(boxMM(xa, YC, za, xc1, YC + 0.03, zb, [4, 1, 4]), 1.4), null, { color: C.white });
  // light diffuser frame in the ceiling
  kit.add('rubber', box(0.36, 0.01, 0.26), T((xa + xc1) / 2 + 0.02, YC - 0.004, za + 0.36), { color: C.grey });
  // smoke detector + oxygen mask door + speaker
  kit.add('plastic', cyl(0.05, 0.055, 0.025, 24), T((xa + xc1) / 2, YC - 0.012, zb - 0.22), { color: C.white });
  kit.add('rubber', cyl(0.012, 0.012, 0.006, 12), T((xa + xc1) / 2 + 0.02, YC - 0.027, zb - 0.22), { color: [0.15, 0.6, 0.2] });
  kit.add('plastic', box(0.2, 0.008, 0.14), T((xa + xc1) / 2 - 0.02, YC - 0.004, za + 0.7), { color: C.wall });
  kit.add('placard', pl(plane(0.17, 0.036)), T((xa + xc1) / 2 - 0.02, YC - 0.0085, za + 0.7, Math.PI / 2, 0, 0), { uvRect: R('oxygen') });
  kit.add('rubber', cyl(0.04, 0.04, 0.006, 20), T(xa + 0.1, YC - 0.003, zb - 0.22), { color: C.grey });

  // floor pan with a raised lip at the door
  kit.add('plastic', worldUV(boxMM(xa, 0, za, arcX(0, R_IN) - 0.01, 0.012, zb, [6, 1, 6]), 2.5), null, { color: C.floor, ao: (x, y, z) => 0.7 + 0.3 * smoothstep(0, 0.1, Math.min(Math.abs(x) - xa, z - za, zb - z)) });
  kit.add('steel', boxMM(xd0, 0, zb - 0.01, xd1, 0.02, Z1 + 0.01), null, { color: [0.85, 0.85, 0.85] });
  // drain grille near the toilet
  kit.add('steel', cyl(0.035, 0.035, 0.004, 16), T(1.0, 0.013, zt - 0.3), { color: [0.6, 0.6, 0.6] });

  // ======================================================================= vanity + sink
  kit.add('plastic', worldUV(boxMM(xa, 0.012, za, xv1, 0.80, zv, [3, 6, 3]), 1.5), null, { color: C.wall });
  // vanity front details: cabinet door seam + latch, waste flap frame
  kit.add('rubber', boxMM(xa + 0.03, 0.06, zv, xv1 - 0.03, 0.062, zv + 0.002), null, { color: C.dark });
  kit.add('steel', boxMM(xs - 0.13, 0.46, zv - 0.004, xs + 0.13, 0.73, zv + 0.006), null, { color: [0.75, 0.75, 0.76] });
  kit.add('rubber', boxMM(xs - 0.11, 0.48, zv + 0.004, xs + 0.11, 0.71, zv + 0.007), null, { color: C.dark });
  kit.add('placard', pl(plane(0.07, 0.022)), T(xs + 0.22, 0.4, zv + 0.003), { uvRect: R('latch') });
  kit.add('chrome', rbox(0.05, 0.016, 0.012, 0.005), T(xs + 0.22, 0.36, zv + 0.007));
  // counter top with an oval sink hole (shape in (x, -z), extruded up)
  {
    const pts = ccw([[xa, -za], [xv1 + 0.01, -za], [xv1 + 0.01, -(zv + 0.02)], [xa, -(zv + 0.02)]]);
    const hole = [];
    for (let i = 0; i < 32; i++) { const a = -(i / 32) * Math.PI * 2; hole.push([xs + 0.155 * Math.cos(a), -(zs + 0.115 * Math.sin(a))]); }
    const g = slab(pts, 0.80, 0.845, [hole]);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    worldUV(g, 2);
    kit.add('gloss', g, null, { color: C.white });
    // rounded front nosing
    const nose = cyl(0.0225, 0.0225, xv1 - xa + 0.01, 12);
    kit.add('gloss', nose, T((xa + xv1 + 0.01) / 2, 0.8225, zv + 0.02, 0, 0, Math.PI / 2), { color: C.white });
    // splash-back
    kit.add('gloss', boxMM(xa, 0.845, za, xv1, 0.98, za + 0.012), null, { color: C.white });
  }
  // stainless bowl (lathe, squashed to an oval)
  {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push([0.01 + 0.15 * Math.sin(a), -0.12 * Math.cos(a)]); }
    pts.push([0.165, 0.002]);
    const g = lathe(pts, 32);
    g.scale(1, 1, 0.115 / 0.155);
    // lathe normals face outward; we look at the inside: flip faces by mirroring y-scale trick
    const inv = g.index.array; for (let i = 0; i < inv.length; i += 3) { const t = inv[i + 1]; inv[i + 1] = inv[i + 2]; inv[i + 2] = t; }
    const N = g.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    kit.add('steel', g, T(xs, 0.845, zs), { color: [0.9, 0.9, 0.9], ao: (x, y) => 0.55 + 0.45 * smoothstep(0.72, 0.84, y) });
    kit.add('rubber', cyl(0.02, 0.02, 0.004, 16), T(xs, 0.728, zs), { color: [0.25, 0.25, 0.26] });
  }
  // faucet (push-button, gooseneck) + soap nozzle
  kit.add('chrome', cyl(0.022, 0.026, 0.05, 20), T(xs, 0.87, za + 0.05));
  kit.add('chrome', tube([[xs, 0.89, za + 0.05], [xs, 0.96, za + 0.06], [xs, 0.985, za + 0.11], [xs, 0.965, za + 0.15]], 0.011, 10, 20));
  kit.add('chrome', cyl(0.018, 0.018, 0.02, 20), T(xs, 0.905, za + 0.05));
  kit.add('chrome', cyl(0.016, 0.016, 0.012, 20), T(xs - 0.075, 0.85, za + 0.045));     // tap push button
  kit.add('rubber', cyl(0.011, 0.011, 0.004, 16), T(xs - 0.075, 0.857, za + 0.045), { color: [0.12, 0.3, 0.6] });
  kit.add('chrome', cyl(0.014, 0.016, 0.03, 16), T(xs + 0.16, 0.86, za + 0.045));
  kit.add('chrome', tube([[xs + 0.16, 0.875, za + 0.045], [xs + 0.16, 0.9, za + 0.06], [xs + 0.16, 0.893, za + 0.09]], 0.007, 8, 12));
  kit.add('placard', pl(plane(0.05, 0.017)), T(xs + 0.16, 0.92, za + 0.0135), { uvRect: R('soap') });
  kit.add('placard', pl(plane(0.2, 0.039)), T(xs - 0.02, 0.94, za + 0.0135), { uvRect: R('water') });

  // ======================================================================= mirror + lights
  const mw = xv1 - xa - 0.06, mh = 0.6, mx = (xa + xv1) / 2, my = 1.33;
  kit.add('steel', frame(mw + 0.03, mh + 0.03, 0.022, 0.012, 0.004), T(mx, my, za + 0.008), { color: [0.85, 0.85, 0.86] });
  // valance with the light strip above the mirror
  kit.add('plastic', boxMM(xa, 1.66, za, xv1 - 0.02, 1.74, za + 0.075), null, { color: C.white });
  // "return to seat" sign housing
  kit.add('rubber', box(0.2, 0.065, 0.02), T(mx, 1.83, za + 0.01), { color: C.dark });
  // no smoking + smoke detector placards
  kit.add('placard', pl(plane(0.2, 0.078)), T(xa + 0.0025, 1.55, za + 0.6, 0, Math.PI / 2, 0), { uvRect: R('lavNoSmoke') });
  kit.add('placard', pl(plane(0.26, 0.086)), T((xd0 + xd1) / 2, 1.935, zb - 0.0025, 0, Math.PI, 0), { uvRect: R('smokeDetector') });

  // ======================================================================= towel dispenser (inboard wall)
  const tz = za + 0.6;
  kit.add('steel', rbox(0.06, 0.26, 0.24, 0.012), T(xa + 0.03, 1.18, tz), { color: [0.85, 0.85, 0.86] });
  kit.add('rubber', box(0.002, 0.012, 0.16), T(xa + 0.061, 1.065, tz), { color: C.dark });
  kit.add('plastic', boxMM(xa + 0.05, 1.03, tz - 0.07, xa + 0.064, 1.066, tz + 0.07), null, { color: [0.97, 0.96, 0.93], ao: false });   // towel edge
  kit.add('placard', pl(plane(0.1, 0.027)), T(xa + 0.0605, 1.25, tz, 0, Math.PI / 2, 0), { uvRect: R('towels') });

  // ======================================================================= toilet
  const tx0 = 1.04, tx1 = 1.56;
  kit.add('gloss', rbox(tx1 - tx0, 0.38, 0.42, 0.05, 3), T((tx0 + tx1) / 2, 0.19, zt), { color: C.white });
  kit.add('gloss', rbox(0.165, 0.26, 0.42, 0.03, 2), T(1.4825, 0.49, zt), { color: C.white });     // rear shroud
  kit.add('steel', box(0.16, 0.006, 0.34), T(1.47, 0.62, zt, 0, 0, 0.0), { color: [0.85, 0.85, 0.86] });
  // bowl rim (stainless) + inside
  {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; pts.push([0.03 + 0.14 * Math.sin(a), -0.22 * Math.cos(a)]); }
    pts.push([0.175, 0.004]);
    const g = lathe(pts, 28);
    g.scale(1.15, 1, 0.9);
    const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    const N = g.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    kit.add('steel', g, T(xtb, 0.385, zt), { color: [0.85, 0.85, 0.85], ao: (x, y) => 0.4 + 0.6 * smoothstep(0.18, 0.38, y) });
    kit.add('rubber', cyl(0.035, 0.035, 0.005, 16), T(xtb, 0.168, zt), { color: [0.04, 0.04, 0.04] });
  }
  // seat ring (stays down)
  {
    const s = new THREE.Shape();
    s.absellipse(0, 0, 0.2, 0.18, 0, Math.PI * 2, false, 0);
    const h = new THREE.Path(); h.absellipse(0, 0, 0.135, 0.115, 0, Math.PI * 2, true, 0); s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
    g.rotateX(-Math.PI / 2);
    kit.add('gloss', g, T(xtb - 0.01, 0.386, zt), { color: C.seat });
  }
  // flush button on the rear shroud top
  kit.add('placard', pl(plane(0.05, 0.05)), T(1.43, 0.6232, zt + 0.1, -Math.PI / 2, 0, 0), { uvRect: R('flush') });
  kit.add('chrome', frame(0.058, 0.058, 0.006, 0.006, 0.029), T(1.43, 0.623, zt + 0.1, -Math.PI / 2, 0, 0));

  // grab handle (door wall, inside, beside the toilet) + call button + changing table hinge rail
  kit.add('chrome', grabHandle(0.28, 0.055, 0.012), T(1.24, 0.82, zb, 0, Math.PI, 0));
  for (const dx of [-0.14, 0.14]) kit.add('chrome', cyl(0.02, 0.02, 0.012, 16), T(1.24 + dx, 0.82, zb - 0.006, Math.PI / 2, 0, 0));
  kit.add('rubber', rbox(0.07, 0.07, 0.02, 0.008), T(1.15, 1.55, zb - 0.01), { color: C.dark });
  kit.add('placard', pl(plane(0.05, 0.05)), T(1.15, 1.55, zb - 0.0205, 0, Math.PI, 0), { uvRect: R('call') });
  kit.add('steel', boxMM(1.07, 0.93, zb - 0.025, 1.5, 0.955, zb), null, { color: [0.7, 0.7, 0.72] });
  kit.add('placard', pl(plane(0.15, 0.076)), T(1.29, 1.62, zb - 0.0025, 0, Math.PI, 0), { uvRect: R('baby') });

  // lock (interior, on the wall beside the free edge of the door): plate + slot
  const lockX = xd1 + 0.065, lockY = 1.12;
  kit.add('steel', rbox(0.1, 0.06, 0.012, 0.006), T(lockX, lockY, zb - 0.006), { color: [0.82, 0.82, 0.84] });
  kit.add('rubber', box(0.07, 0.012, 0.002), T(lockX, lockY, zb - 0.0125), { color: C.dark });
  kit.add('placard', pl(plane(0.06, 0.016)), T(lockX, lockY + 0.045, zb - 0.0025, 0, Math.PI, 0), { uvRect: R('lockLabel') });

  // ======================================================================= exterior details (cabin side)
  // ashtray + lock indicator window + LAVATORY sign on the inboard wall exterior, by the door corner
  const ox = X0 - 0.001;          // outside face of the inboard wall (aisle side)
  out.add('steel', rbox(0.016, 0.07, 0.12, 0.004), T(ox - 0.008, 1.0, Z1 - 0.12), { color: [0.75, 0.75, 0.76] });
  out.add('rubber', box(0.004, 0.012, 0.08), T(ox - 0.017, 1.02, Z1 - 0.12), { color: C.dark });
  out.add('placard', pl(plane(0.08, 0.03)), T(ox - 0.0165, 0.975, Z1 - 0.12, 0, -Math.PI / 2, 0), { uvRect: R('ashtray') });
  out.add('steel', windowPlate(0.16, 0.05, 0.046, 0.026, 0.006), T(ox - 0.006, 1.25, Z1 - 0.12, 0, -Math.PI / 2, 0), { color: [0.8, 0.8, 0.82] });
  out.add('placard', pl(plane(0.15, 0.15)), T(ox - 0.0015, 1.52, Z1 - 0.13, 0, -Math.PI / 2, 0), { uvRect: R('lavSign') });
  // door surround (thin aluminium jamb trim)
  out.add('steel', boxMM(xd0 - 0.015, 0, Z1 - 0.004, xd0, dh, Z1 + 0.006), null, { color: [0.75, 0.75, 0.76] });
  out.add('steel', boxMM(xd1, 0, Z1 - 0.004, xd1 + 0.015, dh, Z1 + 0.006), null, { color: [0.75, 0.75, 0.76] });
  out.add('steel', boxMM(xd0 - 0.015, dh, Z1 - 0.004, xd1 + 0.015, dh + 0.015, Z1 + 0.006), null, { color: [0.75, 0.75, 0.76] });
  // header track for the bi-fold door (inside)
  kit.add('steel', boxMM(xd0, dh - 0.02, zb - 0.02, xd1, dh, zb), null, { color: [0.7, 0.7, 0.72] });
  // occupied sign housing above the door (outside)
  out.add('rubber', box(0.25, 0.1, 0.02), T((xd0 + xd1) / 2, 1.955, Z1 + 0.01), { color: C.dark });

  // ======================================================================= dynamic parts
  const place = (m) => m;   // parts are placed in the right-hand frame; PartInstance mirrors
  const leafW = 0.285, leafH = 1.835, hingeX = xd0 + 0.004, hingeZ = Z1 - TW / 2, leafY = 0.012;
  const leafA = parts.lavLeaf.add(T(0, 0, 0), mirror);
  const leafB = parts.lavLeaf.add(T(0, 0, 0), mirror);
  const _la = new THREE.Matrix4(), _lb = new THREE.Matrix4();
  const doorAnim = new Anim(0.75, (e) => {
    const th = e * 1.36;     // ~78 degrees
    // leaf A: hinge at the jamb, rotates into the room; leaf B: free end slides along the header track
    const ax = hingeX + Math.cos(th) * leafW / 2, az = hingeZ - Math.sin(th) * leafW / 2;
    _la.makeRotationY(th).setPosition(ax, leafY, az);
    const qx = hingeX + 2 * leafW * Math.cos(th);
    const bx = qx - Math.cos(th) * leafW / 2, bz = hingeZ - Math.sin(th) * leafW / 2;
    _lb.makeRotationY(Math.PI - th).setPosition(bx, leafY, bz);
    leafA.setLocal(_la); leafB.setLocal(_lb);
  });
  // lid: hinge axis along z at the rear of the seat; part-local: hinge axis = x, lid extends along -z
  const lid = parts.lavLid.add(T(1.375, 0.432, zt, 0, Math.PI / 2, 0), mirror);
  const _lm = new THREE.Matrix4();
  const lidAnim = new Anim(0.6, (e) => { _lm.makeRotationX(e * 1.6); lid.setLocal(_lm); });
  // flush valve (dark flap at the bottom of the bowl)
  const valve = parts.lavValve.add(T(xtb, 0.172, zt), mirror);
  const _vm = new THREE.Matrix4();
  const valveAnim = new Anim(0.18, (e) => { _vm.makeRotationX(-e * 1.3); valve.setLocal(_vm); });
  // waste flap (pivot at the top edge, swings inward)
  const flap = parts.lavFlap.add(T(xs, 0.71, zv + 0.006), mirror);
  const _fm = new THREE.Matrix4();
  const flapAnim = new Anim(0.25, (e) => { _fm.makeRotationX(e * 0.9); flap.setLocal(_fm); });
  // changing table (hinged at the bottom on the door wall; folds down towards -z)
  const table = parts.lavTable.add(T(1.285, 0.955, zb - 0.012, 0, Math.PI, 0), mirror);
  const _tm = new THREE.Matrix4();
  const tableAnim = new Anim(0.9, (e) => { _tm.makeRotationX(e * Math.PI / 2); table.setLocal(_tm); });
  // lock knob (slides along x) + outside flag (VACANT / OCCUPIED strip behind the window)
  const knob = parts.lavKnob.add(T(lockX, lockY, zb - 0.014), mirror);
  const flag = parts.lavFlag.add(T(ox - 0.0035, 1.25, Z1 - 0.12, 0, -Math.PI / 2, 0), mirror);
  const _km = new THREE.Matrix4(), _fl = new THREE.Matrix4();
  const lockAnim = new Anim(0.22, (e) => {
    _km.makeTranslation(-0.022 + e * 0.044, 0, 0); knob.setLocal(_km);
    _fl.makeTranslation(0.025 - e * 0.05, 0, 0); flag.setLocal(_fl);
  });
  // water stream (scaled in y; hidden when off)
  const water = parts.water.add(T(xs, 0.967, za + 0.15), mirror);
  const _wm = new THREE.Matrix4();
  let waterLen = 0;
  const setWater = (len) => {
    if (len <= 0.001) { water.setHidden(true); return; }
    _wm.makeScale(1, len, 1); water.setLocal(_wm);
  };
  setWater(0);

  // ======================================================================= mirror (planar + cheap)
  const mirrorMat = wm(T(mx, my, za + 0.0105));
  const mGeo = new THREE.PlaneGeometry(mw, mh);
  const cheap = new THREE.Mesh(mGeo, M.mirror);
  cheap.name = `galley-${def.id}-mirror-cheap`;
  cheap.matrixAutoUpdate = false; cheap.matrix.copy(mirrorMat);
  ctx.root.add(cheap);
  let planar = null;
  if (ctx.mirrorEnabled) {
    planar = new Mirror(mGeo, { size: ctx.mirrorSize, reversedDepth: ctx.reversedDepth, far: 6 });
    planar.matrixAutoUpdate = false; planar.matrix.copy(mirrorMat);
    planar.visible = false; planar.active = false;
    planar.name = `galley-${def.id}-mirror`;
    ctx.root.add(planar);
  }

  // ======================================================================= glowing bits
  const gW = (m) => wm(m);
  const diffuser = glowers.add(gW(T((xa + xc1) / 2 + 0.02, YC - 0.0105, za + 0.36, Math.PI / 2, 0, 0)), 0.33, 0.23, tex.glowRect('diffuser'), [1.0, 0.98, 0.95], 0.6);
  const strip = glowers.add(gW(T(mx, 1.655, za + 0.04, Math.PI / 2, 0, 0)), xv1 - xa - 0.08, 0.05, tex.glowRect('strip'), [1.0, 0.97, 0.92], 0.6);
  const ret = glowers.add(gW(T(mx, 1.83, za + 0.0205)), 0.18, 0.053, tex.glowRect('returnSeat'), [1, 1, 1], 0);
  const occ = glowers.add(gW(T((xd0 + xd1) / 2, 1.955, Z1 + 0.0205)), 0.22, 0.085, tex.glowRect('occupied'), [1.0, 0.75, 0.3], 0.03);
  const callLed = glowers.add(gW(T(1.15, 1.592, zb - 0.0205, 0, Math.PI, 0)), 0.012, 0.012, tex.glowRect('ledAmber'), [1, 0.6, 0.2], 0.02);

  // ======================================================================= lamp (box-limited local light)
  const p = new THREE.Vector3((xa + xc1) / 2 + 0.02, YC - 0.05, za + 0.36).applyMatrix4(W);
  const p2 = new THREE.Vector3(xa - 0.004, -0.05, za - 0.004).applyMatrix4(W);
  const p3 = new THREE.Vector3(1.7, YC + 0.004, zb + 0.004).applyMatrix4(W);
  const lamp = { pos: p, min: p2.clone().min(p3), max: p2.clone().max(p3) };

  // ======================================================================= colliders (world)
  const box3 = (x0, z0, x1, z1, y1 = 2.2) => {
    const a = new THREE.Vector3(x0, 0, z0).applyMatrix4(W), b = new THREE.Vector3(x1, y1, z1).applyMatrix4(W);
    return [a.clone().min(b), a.clone().max(b)];
  };
  const colliders = [
    box3(X0, Z0, xa, Z1), box3(X0, Z0, 1.75, za), box3(X0, zb, xd0, Z1), box3(xd1, zb, 1.75, Z1),
    box3(xa, za, xv1, zv, 0.84), box3(tx0, zt - 0.21, 1.75, zt + 0.21, 0.6),
  ];
  const doorCollider = box3(xd0, zb - 0.01, xd1, Z1 + 0.01);
  // interaction occluders (cheap proxies for the walls)
  const occluders = [
    { c: [(X0 + xa) / 2, 1.1, (Z0 + Z1) / 2], s: [TW, 2.2, Z1 - Z0] },
    { c: [(X0 + 1.6) / 2, 1.1, Z0 + TW / 2], s: [1.6 - X0, 2.2, TW] },
    { c: [(xd1 + 1.6) / 2, 1.1, Z1 - TW / 2], s: [1.6 - xd1, 2.2, TW] },
    { c: [(xd0 + xd1) / 2, (dh + 2.2) / 2, Z1 - TW / 2], s: [xd1 - xd0, 2.2 - dh, TW] },
    { c: [(xa + 1.4) / 2, YC + 0.02, (za + zb) / 2], s: [1.4 - xa, 0.04, zb - za] },
  ];

  // world-space bounds (for the player-proximity test / API)
  const bounds = new THREE.Box3(lamp.min.clone(), lamp.max.clone());
  bounds.min.y = 0; bounds.max.y = 2.1;

  // proxies for interactions (in the right-hand frame, transformed to world)
  const proxies = {
    doorOut: { c: [(xd0 + xd1) / 2, 1.0, Z1 + 0.02], s: [xd1 - xd0, 1.8, 0.04] },
    doorIn: { c: [(xd0 + xd1) / 2, 1.0, zb - 0.05], s: [xd1 - xd0, 1.8, 0.04] },
    lock: { c: [lockX, lockY, zb - 0.02], s: [0.12, 0.08, 0.04] },
    lid: { c: [xtb, 0.45, zt], s: [0.42, 0.12, 0.4] },
    flush: { c: [1.45, 0.63, zt + 0.06], s: [0.14, 0.04, 0.2] },
    faucet: { c: [xs, 0.93, za + 0.09], s: [0.22, 0.12, 0.14] },
    soap: { c: [xs + 0.16, 0.88, za + 0.06], s: [0.06, 0.06, 0.08] },
    towel: { c: [xa + 0.04, 1.15, tz], s: [0.08, 0.3, 0.26] },
    flap: { c: [xs, 0.6, zv + 0.02], s: [0.26, 0.28, 0.04] },
    table: { c: [1.285, 1.2, zb - 0.03], s: [0.46, 0.55, 0.06] },
    call: { c: [1.15, 1.55, zb - 0.03], s: [0.09, 0.09, 0.04] },
  };

  // ======================================================================= state machine
  const audioPos = new THREE.Vector3((xd0 + xd1) / 2, 1.2, Z1).applyMatrix4(W);
  const state = {
    id: def.id, side: def.side, locked: false, doorOpen: false, lidOpen: false, tableDown: false,
    light: 0.25, lightTarget: 0.25, flicker: 0, waterT: 0, flushT: 0, flapT: 0, callT: 0,
  };
  return {
    def, state, kit, out, mirror, W, bounds, lamp, colliders, doorCollider, occluders, proxies, audioPos,
    anims: { door: doorAnim, lid: lidAnim, valve: valveAnim, flap: flapAnim, table: tableAnim, lock: lockAnim },
    glow: { diffuser, strip, ret, occ, callLed },
    cheapMirror: cheap, planarMirror: planar,
    setWater, get waterLen() { return waterLen; }, set waterLen(v) { waterLen = v; },
    mirrorCenter: new THREE.Vector3(mx, my, za).applyMatrix4(W),
  };
}

/** Geometry for the instanced lav parts (built once, shared by the three lavs). */
export function lavPartGeometries(tex) {
  const K = (fn) => { const k = new Kit(() => 1); fn(k); return k; };
  const leafW = 0.285, leafH = 1.835, t = 0.024;
  // door leaf (x-centred, bottom at y = 0): laminate panel with a recessed field and a louvre strip
  const leaf = K((k) => {
    k.add('plastic', worldUV(rbox(leafW - 0.004, leafH, t, 0.006, 2).translate(0, leafH / 2, 0), 1.4), null, { color: C.door });
    for (const s of [1, -1]) {
      k.add('plastic', worldUV(box(leafW - 0.07, leafH - 0.5, 0.004).translate(0, leafH / 2 + 0.12, s * (t / 2 + 0.0015)), 1.4), null, { color: [0.82, 0.82, 0.8] });
      k.add('rubber', box(leafW - 0.06, 0.12, 0.004).translate(0, 0.12, s * (t / 2 + 0.001)), null, { color: [0.3, 0.3, 0.31] });
    }
  });
  const leafChrome = K((k) => {
    for (const s of [1, -1]) {
      k.add('chrome', rbox(0.11, 0.028, 0.018, 0.006).translate(0, 1.0, s * (t / 2 + 0.008)));
      for (let i = 0; i < 6; i++) k.add('chrome', box(leafW - 0.08, 0.006, 0.003).translate(0, 0.08 + i * 0.016, s * (t / 2 + 0.0035)), null, { color: [0.6, 0.6, 0.62] });
    }
  });
  // toilet lid: hinge axis = local x, lid extends towards -z (closed: horizontal)
  const lid = K((k) => {
    const s = new THREE.Shape(); s.absellipse(0, 0, 0.19, 0.205, 0, Math.PI * 2, false, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 28 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0.0, -0.2);
    k.add('gloss', g, null, { color: C.seat });
    k.add('chrome', cyl(0.012, 0.012, 0.16, 12).rotateZ(Math.PI / 2).translate(0, 0.004, 0.0));
  });
  const valve = K((k) => { k.add('rubber', cyl(0.036, 0.036, 0.006, 20).translate(0, 0, 0), null, { color: [0.05, 0.05, 0.05] }); });
  const flap = K((k) => {
    k.add('steel', box(0.21, 0.22, 0.006).translate(0, -0.11, 0), null, { color: [0.82, 0.82, 0.83] });
  });
  const flapPlac = K((k) => { k.add('placard', plane(0.1, 0.043).translate(0, -0.11, 0.0035), null, { uvRect: tex.rect('push') }); });
  // changing table: hinge at the bottom edge (local x axis), folded = vertical along +y, plate faces +z
  const table = K((k) => {
    k.add('plastic', worldUV(rbox(0.43, 0.5, 0.025, 0.02, 2).translate(0, 0.26, 0.012), 1.5), null, { color: [0.86, 0.86, 0.84] });
    k.add('plastic', box(0.36, 0.38, 0.006).translate(0, 0.27, -0.002), null, { color: [0.62, 0.72, 0.8] });   // changing pad (faces the wall when stowed)
    k.add('rubber', cyl(0.01, 0.01, 0.42, 10).rotateZ(Math.PI / 2).translate(0, 0.0, 0.01), null, { color: [0.3, 0.3, 0.3] });
    k.add('chrome', rbox(0.1, 0.02, 0.016, 0.006).translate(0, 0.48, 0.03));
  });
  const knob = K((k) => { k.add('chrome', rbox(0.03, 0.022, 0.016, 0.006)); });
  const flagG = K((k) => { k.add('placard', plane(0.1, 0.03), null, { uvRect: tex.rect('lockFlag') }); });
  const water = new THREE.CylinderGeometry(0.0045, 0.006, 1, 10, 6, true).translate(0, -0.5, 0);
  return { leaf, leafChrome, lid, valve, flap, flapPlac, table, knob, flag: flagG, water };
}
