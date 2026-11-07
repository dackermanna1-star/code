// =============================================================================
// Apron-drive jet bridges: rotunda + fixed link on the terminal, three
// telescoping tunnel sections with window bands, drive column with a wheel
// bogie, rotating cab with bellows canopy, interior (floor, walls, lights,
// control console) and service stairs.
//
// Static bridges (other gates) are baked into airport-wide merged meshes.  The
// bridge of our own gate is articulated (separate part groups) and animates
// between 'stowed' and 'docked' (to the L1 door) poses.
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT, DOORS, outerHalfWidthAt } from '../../core/constants.js';
import { GATE_STAND_Z, TERMINAL_FACADE_Z } from '../layout.js';
import { GeoBuilder, PRIM, WHEEL, mat, easeInOut, clamp01, lerp } from './util.js';

export const JB = {
  floorY: 4.9,          // terminal departure level
  rotR: 2.3,
  rotDX: -17,           // rotunda position relative to the gate centreline
  rotZ: TERMINAL_FACADE_Z + 7,
  tunnels: [            // [length, outer width, outer height] – A (rotunda) .. C (cab)
    [11.5, 2.5, 2.85],
    [11.0, 2.66, 3.0],
    [10.2, 2.82, 3.15],
  ],
  cabD: 2.9, cabW: 3.5, cabH: 2.65,
  bellows: 0.85,
};

const C_WHITE = 0xd9dcdc, C_GREY = 0x8d9296, C_DARK = 0x2a2c2e, C_FLOOR = 0x3a3d42, C_WALL = 0xb4a994, C_CEIL = 0xd8d2c4;
const C_YELLOW = 0xd6a21a, C_RUBBER = 0x1a1a1a, C_STEEL = 0x6e7378;

/** Door target (airport-local) for an aircraft parked at gate x with fuselage stretch. */
export function doorTarget(gx, stretchFwd = 0) {
  const half = outerHalfWidthAt(0.95);
  return { x: gx - half, z: GATE_STAND_Z + DOORS.L1.z - stretchFwd, y: AIRCRAFT.groundHeight };
}

/** Docked / stowed pose for a bridge serving gate x. */
export function bridgePose(gx, kind = 'docked', stretchFwd = 0) {
  const R = { x: gx + JB.rotDX, z: JB.rotZ, y: JB.floorY };
  let C, phi, cabY, canopy;
  if (kind === 'docked') {
    const d = doorTarget(gx, stretchFwd);
    const reach = JB.cabD / 2 + JB.bellows - 0.05;
    C = { x: d.x - reach, z: d.z };
    phi = 0; cabY = d.y; canopy = 1;
  } else {
    // stowed: pulled back towards the terminal, cab turned parallel to the facade
    C = { x: gx - 4.5, z: GATE_STAND_Z - 28 };
    phi = 0.35; cabY = 3.25; canopy = 0;
  }
  const dx = C.x - R.x, dz = C.z - R.z;
  const Lh = Math.hypot(dx, dz);
  const psi = Math.atan2(-dz, dx);
  const theta = Math.atan2(cabY - R.y, Lh);
  return { R, Lh, psi, theta, phi, cabY, canopy };
}

export function lerpPose(a, b, t, out = {}) {
  out.R = a.R;
  out.Lh = lerp(a.Lh, b.Lh, t);
  let dp = b.psi - a.psi; while (dp > Math.PI) dp -= 2 * Math.PI; while (dp < -Math.PI) dp += 2 * Math.PI;
  out.psi = a.psi + dp * t;
  out.phi = lerp(a.phi, b.phi, t);
  out.cabY = lerp(a.cabY, b.cabY, t);
  out.theta = Math.atan2(out.cabY - a.R.y, out.Lh);
  out.canopy = lerp(a.canopy, b.canopy, t);
  return out;
}

// --------------------------------------------------------------------------- part geometry
// All parts are written into a set of builders { body, glass, lamp } with a base matrix.

function tunnelPart(B, M, len, w, h, x0 = 0) {
  const t = 0.07;
  const add = (b, geo, m, c) => b.add(geo, new THREE.Matrix4().multiplyMatrices(M, m), c);
  const xc = x0 + len / 2;
  // floor slab + carpet (interior)
  add(B.body, PRIM.box, mat(xc, -0.12, 0, 0, 0, 0, len, 0.24, w), C_GREY);
  add(B.body, PRIM.box, mat(xc, 0.005, 0, 0, 0, 0, len, 0.02, w - 2 * t), C_FLOOR);
  // roof
  add(B.body, PRIM.box, mat(xc, h - 0.3, 0, 0, 0, 0, len, 0.12, w), C_WHITE);
  add(B.body, PRIM.box, mat(xc, h - 0.37, 0, 0, 0, 0, len, 0.02, w - 2 * t), C_CEIL);
  // side walls: lower panel, window band (glass), upper panel – both sides
  for (const s of [-1, 1]) {
    const z = s * (w / 2 - t / 2);
    add(B.body, PRIM.box, mat(xc, 0.5, z, 0, 0, 0, len, 1.0, t), C_WHITE);
    add(B.body, PRIM.box, mat(xc, 0.5, z - s * 0.04, 0, 0, 0, len, 0.98, 0.01), C_WALL);
    add(B.body, PRIM.box, mat(xc, (h - 0.3 + 1.95) / 2, z, 0, 0, 0, len, h - 0.3 - 1.95, t), C_WHITE);
    add(B.body, PRIM.box, mat(xc, (h - 0.38 + 1.95) / 2, z - s * 0.04, 0, 0, 0, len, h - 0.38 - 1.95, 0.01), C_WALL);
    add(B.glass, PRIM.box, mat(xc, 1.475, z, 0, 0, 0, len, 0.95, 0.03), 0xffffff);
    // ribs (exterior frame every 1.25 m)
    for (let x = x0 + 0.4; x < x0 + len; x += 1.25) add(B.body, PRIM.box, mat(x, h / 2 - 0.15, s * (w / 2 + 0.02), 0, 0, 0, 0.08, h - 0.3, 0.05), C_GREY);
    // gutter / roof edge
    add(B.body, PRIM.box, mat(xc, h - 0.22, s * (w / 2 + 0.03), 0, 0, 0, len, 0.08, 0.08), C_GREY);
  }
  // roof light strip (interior)
  add(B.lamp, PRIM.box, mat(xc, h - 0.39, 0, 0, 0, 0, len - 1, 0.02, 0.2), 0xffffff);
  // roof cable tray / hoses on top
  add(B.body, PRIM.box, mat(xc, h - 0.18, w * 0.25, 0, 0, 0, len, 0.12, 0.3), C_STEEL);
}

function cabPart(B, M) {
  const add = (b, geo, m, c) => b.add(geo, new THREE.Matrix4().multiplyMatrices(M, m), c);
  const D = JB.cabD, W = JB.cabW, H = JB.cabH, t = 0.08;
  // floor
  add(B.body, PRIM.box, mat(0, -0.14, 0, 0, 0, 0, D, 0.28, W), C_GREY);
  add(B.body, PRIM.box, mat(0, 0.006, 0, 0, 0, 0, D - 0.1, 0.02, W - 0.16), 0x45484c);
  // roof + ceiling with a light panel
  add(B.body, PRIM.box, mat(0, H + 0.06, 0, 0, 0, 0, D, 0.14, W), C_WHITE);
  add(B.body, PRIM.box, mat(0, H - 0.02, 0, 0, 0, 0, D - 0.1, 0.02, W - 0.1), C_CEIL);
  add(B.lamp, PRIM.box, mat(-0.2, H - 0.04, 0, 0, 0, 0, 1.0, 0.02, 0.5), 0xffffff);
  // +z side wall with a window (operator side), -z side only a short front pier (the tunnel
  // joins the cab through the open back / -z corner, whatever the swivel angle)
  {
    const z = W / 2 - t / 2;
    add(B.body, PRIM.box, mat(0, 0.55, z, 0, 0, 0, D, 1.1, t), C_WHITE);
    add(B.body, PRIM.box, mat(0, H - 0.3, z, 0, 0, 0, D, 0.6, t), C_WHITE);
    add(B.body, PRIM.box, mat(-D / 2 + 0.35, 1.5, z, 0, 0, 0, 0.7, 0.8, t), C_WHITE);
    add(B.body, PRIM.box, mat(D / 2 - 0.3, 1.5, z, 0, 0, 0, 0.6, 0.8, t), C_WHITE);
    add(B.glass, PRIM.box, mat(0.15, 1.5, z, 0, 0, 0, 1.3, 0.8, 0.03), 0xffffff);
    add(B.body, PRIM.box, mat(0, H / 2, z - 0.05, 0, 0, 0, D - 0.1, H - 0.05, 0.01), C_WALL);
    add(B.body, PRIM.box, mat(-D / 2 + t / 2, H / 2, W / 4, 0, 0, 0, t, H, W / 2), C_WHITE);
    add(B.body, PRIM.box, mat(-D / 2 + t / 2 + 0.05, H / 2, W / 4, 0, 0, 0, 0.01, H - 0.05, W / 2 - 0.1), C_WALL);
    add(B.body, PRIM.box, mat(D / 2 - 0.45, H / 2, -W / 2 + t / 2, 0, 0, 0, 0.9, H, t), C_WHITE);
    add(B.body, PRIM.box, mat(D / 2 - 0.45, H / 2, -W / 2 + t / 2 + 0.05, 0, 0, 0, 0.88, H - 0.05, 0.01), C_WALL);
  }
  // front frame around the opening (towards the aircraft)
  for (const s of [-1, 1]) add(B.body, PRIM.box, mat(D / 2 - 0.05, H / 2, s * (W / 2 - 0.55), 0, 0, 0, 0.1, H, 1.1), C_WHITE);
  add(B.body, PRIM.box, mat(D / 2 - 0.05, H - 0.2, 0, 0, 0, 0, 0.1, 0.4, W), C_WHITE);
  // control console (operator side, +z) with screens
  add(B.body, PRIM.box, mat(D / 2 - 0.45, 0.5, W / 2 - 0.4, 0, 0, 0, 0.6, 1.0, 0.5), 0x34383d);
  add(B.body, PRIM.box, mat(D / 2 - 0.45, 1.02, W / 2 - 0.4, 0, 0, -0.35, 0.62, 0.06, 0.52), 0x2a2d31);
  add(B.lamp, PRIM.box, mat(D / 2 - 0.47, 1.06, W / 2 - 0.4, 0, 0, -0.35, 0.3, 0.012, 0.22), 0x6fb6ff);
  // floor bumper + leveling plate (yellow/black) at the threshold
  add(B.body, PRIM.box, mat(D / 2 + 0.15, -0.05, 0, 0, 0, 0, 0.5, 0.06, 1.6), 0x505458);
  add(B.body, PRIM.box, mat(D / 2 + 0.38, -0.1, 0, 0, 0, 0, 0.1, 0.12, 1.7), C_YELLOW);
  // exterior skirt below the cab floor
  add(B.body, PRIM.box, mat(0, -0.45, 0, 0, 0, 0, D - 0.2, 0.35, W - 0.3), C_STEEL);
  // service door + stairs on the -z side (away from the nose)
  const sz = W / 2;
  add(B.body, PRIM.box, mat(-0.95, 1.0, sz + 0.02, 0, 0, 0, 0.8, 2.0, 0.04), 0xb9bbbb);
  return { stairsAt: new THREE.Vector3(-0.95, 0, sz) };
}

function bellowsPart(B, M) {
  // accordion canopy: arches of rubberised fabric between the cab front and the fuselage
  const add = (b, geo, m, c) => b.add(geo, new THREE.Matrix4().multiplyMatrices(M, m), c);
  const W = 2.3, H = 2.45, n = 6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * JB.bellows;
    const shrink = i * 0.025;
    const c = i % 2 ? 0x1c1d1f : 0x2b2c2f;
    add(B.body, PRIM.box, mat(x, H - shrink, 0, 0, 0, 0, 0.12, 0.1, W - shrink), c);
    for (const s of [-1, 1]) add(B.body, PRIM.box, mat(x, (H - shrink) / 2 + 0.05, s * (W - shrink) / 2, 0, 0, 0, 0.12, H - shrink, 0.1), c);
  }
  // fabric skins between the arches
  add(B.body, PRIM.box, mat(JB.bellows / 2, H + 0.02, 0, 0, 0, 0, JB.bellows, 0.03, W), 0x232427);
  for (const s of [-1, 1]) add(B.body, PRIM.box, mat(JB.bellows / 2, H / 2 + 0.05, s * W / 2, 0, 0, 0, JB.bellows, H, 0.03), 0x232427);
  // floor plate + rubber nose bumper
  add(B.body, PRIM.box, mat(JB.bellows / 2, -0.02, 0, 0, 0, 0, JB.bellows, 0.05, 1.5), 0x4a4d50);
  add(B.body, PRIM.box, mat(JB.bellows - 0.05, 0.03, 0, 0, 0, 0, 0.12, 0.1, 1.4), C_RUBBER);
}

function stairsPart(B, M, height) {
  const add = (b, geo, m, c) => b.add(geo, new THREE.Matrix4().multiplyMatrices(M, m), c);
  const steps = Math.max(6, Math.round(height / 0.19));
  const rise = height / steps, run = 0.26;
  // landing
  add(B.body, PRIM.box, mat(0, -0.05, -0.7, 0, 0, 0, 1.1, 0.08, 1.4), C_STEEL);
  for (let i = 0; i < steps; i++) {
    const x = -0.55 - (i + 1) * run;
    add(B.body, PRIM.box, mat(x, -(i + 1) * rise, -0.95, 0, 0, 0, run + 0.02, 0.04, 0.9), C_STEEL);
  }
  const len = Math.hypot(steps * run, height);
  const ang = Math.atan2(height, steps * run);
  for (const z of [-0.5, -1.4]) {
    add(B.body, PRIM.box, mat(-0.55 - steps * run / 2, -height / 2, z, 0, 0, ang, len, 0.18, 0.05), C_YELLOW);
    add(B.body, PRIM.box, mat(-0.55 - steps * run / 2, -height / 2 + 1.0, z, 0, 0, ang, len, 0.05, 0.05), C_YELLOW);
    for (let k = 0; k <= 3; k++) {
      const f = k / 3, x = -0.55 - steps * run * f;
      add(B.body, PRIM.box, mat(x, -height * f + 0.5, z, 0, 0, 0, 0.05, 1.0, 0.05), C_YELLOW);
    }
  }
  // landing posts to the ground (only the bottom of the stair touches the ground)
  add(B.body, PRIM.box, mat(-0.55 - steps * run, -height + 0.05, -0.95, 0, 0, 0, 0.4, 0.1, 1.0), C_STEEL);
}

function columnPart(B, M, height) {
  // drive column: two telescopic legs, cross beam and a bogie with two wheels
  const add = (b, geo, m, c) => b.add(geo, new THREE.Matrix4().multiplyMatrices(M, m), c);
  for (const s of [-1, 1]) {
    add(B.body, PRIM.box, mat(0, -height / 2, s * 0.85, 0, 0, 0, 0.32, height, 0.32), C_GREY);
    add(B.body, PRIM.box, mat(0, -height * 0.7, s * 0.85, 0, 0, 0, 0.26, height * 0.6, 0.26), C_STEEL);
  }
  add(B.body, PRIM.box, mat(0, -0.2, 0, 0, 0, 0, 0.4, 0.3, 2.3), C_GREY);
  add(B.body, PRIM.box, mat(0, -height + 0.75, 0, 0, 0, 0, 1.6, 0.35, 2.1), C_YELLOW);
  add(B.body, PRIM.box, mat(0.9, -height + 0.85, 0, 0, 0, 0, 0.3, 0.6, 1.2), C_DARK);
  for (const s of [-1, 1]) {
    add(B.body, WHEEL, mat(0, -height + 0.46, s * 0.75, 0, Math.PI / 2, 0, 0.32, 0.92, 0.92), C_RUBBER);
    add(B.body, WHEEL, mat(0, -height + 0.46, s * 0.75, 0, Math.PI / 2, 0, 0.34, 0.5, 0.5), 0x777777);
  }
}

/** Rotunda, column and fixed link to the terminal (static). */
export function addRotunda(B, gx) {
  const x = gx + JB.rotDX, z = JB.rotZ, y = JB.floorY;
  B.body.add(PRIM.cyl16, mat(x, y + 1.45, z, 0, 0, 0, JB.rotR * 2, 3.0, JB.rotR * 2), C_WHITE);
  B.body.add(PRIM.cyl16, mat(x, y + 3.0, z, 0, 0, 0, JB.rotR * 2 + 0.2, 0.15, JB.rotR * 2 + 0.2), C_GREY);
  B.glass.add(PRIM.cyl16, mat(x, y + 1.5, z, 0, 0, 0, JB.rotR * 2 + 0.04, 0.9, JB.rotR * 2 + 0.04), 0xffffff);
  B.body.add(PRIM.cyl12, mat(x, y / 2, z, 0, 0, 0, 0.9, y, 0.9), C_GREY);
  B.body.add(PRIM.box, mat(x, 0.2, z, 0, 0, 0, 1.6, 0.4, 1.6), 0x8a8a86);
  // fixed link to the facade
  const z0 = TERMINAL_FACADE_Z, z1 = z - JB.rotR * 0.6;
  const len = z1 - z0;
  B.body.add(PRIM.box, mat(x, y + 1.4, (z0 + z1) / 2, 0, 0, 0, 2.6, 2.9, len), C_WHITE);
  B.glass.add(PRIM.box, mat(x, y + 1.55, (z0 + z1) / 2, 0, 0, 0, 2.64, 0.9, len - 0.6), 0xffffff);
  B.body.add(PRIM.box, mat(x, y - 0.25, (z0 + z1) / 2, 0, 0, 0, 2.8, 0.3, len), C_GREY);
  // stair tower / service door down to the apron
  B.body.add(PRIM.box, mat(x - 2.6, y / 2, z0 + 1.5, 0, 0, 0, 2.2, y, 2.6), 0xb7b9b8);
}

/** Write a complete bridge at a pose into builders (static bridges). */
export function addBridgeStatic(B, pose) {
  const M = new THREE.Matrix4();
  const parts = partMatrices(pose);
  const T = JB.tunnels;
  tunnelPart(B, parts.A, T[0][0], T[0][1], T[0][2], JB.rotR * 0.7);
  tunnelPart(B, parts.B, T[1][0], T[1][1], T[1][2]);
  tunnelPart(B, parts.C, T[2][0], T[2][1], T[2][2]);
  const cab = cabPart(B, parts.cab);
  bellowsPart(B, M.copy(parts.cab).multiply(mat(JB.cabD / 2, 0, 0)));
  stairsPart(B, new THREE.Matrix4().copy(parts.cab).multiply(mat(cab.stairsAt.x, 0, cab.stairsAt.z, 0, Math.PI / 2, 0)), pose.cabY);
  columnPart(B, parts.col, parts.colHeight);
}

const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
/** World (airport-local) matrices for each moving part of a pose. */
export function partMatrices(pose, out = {}) {
  const { R, Lh, psi, theta, phi, cabY } = pose;
  const L = Lh / Math.cos(theta);
  const base = (out.base || (out.base = new THREE.Matrix4())).compose(
    new THREE.Vector3(R.x, R.y, R.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, psi, theta, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const T = JB.tunnels;
  const xA = 0, xC = L - T[2][0] + 0.2;
  const xB = Math.min(L - 0.3 - T[1][0], Math.max(JB.rotR * 0.7, (xA + JB.rotR * 0.7 + T[0][0] + xC) / 2 - T[1][0] / 2));
  out.A = (out.A || new THREE.Matrix4()).copy(base);
  out.B = (out.B || new THREE.Matrix4()).multiplyMatrices(base, _m1.makeTranslation(xB, -0.0, 0));
  out.C = (out.C || new THREE.Matrix4()).multiplyMatrices(base, _m1.makeTranslation(xC, 0, 0));
  // cab: at the tunnel end, level, own yaw
  const cx = R.x + Math.cos(psi) * Lh, cz = R.z - Math.sin(psi) * Lh;
  out.cab = (out.cab || new THREE.Matrix4()).compose(new THREE.Vector3(cx, cabY, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), phi), new THREE.Vector3(1, 1, 1));
  // drive column under tunnel C, vertical
  const lc = L - JB.cabD / 2 - 2.6;
  const px = R.x + Math.cos(psi) * Math.cos(theta) * lc, pz = R.z - Math.sin(psi) * Math.cos(theta) * lc;
  const py = R.y + Math.sin(theta) * lc - 0.25;
  out.col = (out.col || new THREE.Matrix4()).compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), psi), new THREE.Vector3(1, 1, 1));
  out.colHeight = py;
  void _m2;
  return out;
}

/** Articulated own-gate bridge. */
export class ActiveBridge {
  constructor(gx, mats, { stretchFwd = 0 } = {}) {
    this.gx = gx;
    this.group = new THREE.Group();
    this.group.name = 'jetbridge-own';
    this.docked = bridgePose(gx, 'docked', stretchFwd);
    this.stowed = bridgePose(gx, 'stowed');
    this.pose = lerpPose(this.stowed, this.docked, 1);
    this.t = 1;              // 0 = stowed, 1 = docked
    this.target = 1;
    this.anim = null;
    const mk = () => ({ body: new GeoBuilder(), glass: new GeoBuilder(), lamp: new GeoBuilder() });
    const I = new THREE.Matrix4();
    const T = JB.tunnels;
    const parts = {};
    const build = (name, fn) => {
      const B = mk();
      fn(B);
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      for (const [k, m] of [['body', mats.body], ['glass', mats.glass], ['lamp', mats.lamp]]) {
        if (B[k].empty) continue;
        const mesh = new THREE.Mesh(B[k].build(), m);
        mesh.castShadow = k !== 'lamp'; mesh.receiveShadow = k !== 'lamp';
        g.add(mesh);
      }
      g.name = `bridge-${name}`;
      this.group.add(g);
      parts[name] = g;
    };
    build('A', (B) => tunnelPart(B, I, T[0][0], T[0][1], T[0][2], JB.rotR * 0.7));
    build('B', (B) => tunnelPart(B, I, T[1][0], T[1][1], T[1][2]));
    build('C', (B) => tunnelPart(B, I, T[2][0], T[2][1], T[2][2]));
    let stairs;
    build('cab', (B) => { stairs = cabPart(B, I).stairsAt; });
    build('bellows', (B) => bellowsPart(B, I));
    this.stairsAt = stairs;
    this.stairsGroup = null;
    this.parts = parts;
    this.mats = mats;
    this._colH = -1;
    this._stairH = -1;
    this.mx = {};
    this.apply();
  }

  _rebuildColumn(h) {
    if (this.parts.col) { this.group.remove(this.parts.col); this.parts.col.children.forEach((c) => c.geometry.dispose()); }
    const B = { body: new GeoBuilder(), glass: new GeoBuilder(), lamp: new GeoBuilder() };
    columnPart(B, new THREE.Matrix4(), h);
    const g = new THREE.Group(); g.matrixAutoUpdate = false;
    const mesh = new THREE.Mesh(B.body.build(), this.mats.body); mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    this.group.add(g);
    this.parts.col = g;
    this._colH = h;
  }

  _rebuildStairs(h) {
    if (this.stairsGroup) { this.parts.cab.remove(this.stairsGroup); this.stairsGroup.geometry.dispose(); }
    const B = { body: new GeoBuilder(), glass: new GeoBuilder(), lamp: new GeoBuilder() };
    stairsPart(B, mat(this.stairsAt.x, 0, this.stairsAt.z, 0, Math.PI / 2, 0), h);
    const mesh = new THREE.Mesh(B.body.build(), this.mats.body); mesh.castShadow = true; mesh.receiveShadow = true;
    this.parts.cab.add(mesh);
    mesh.matrixAutoUpdate = false;
    this.stairsGroup = mesh;
    this._stairH = h;
  }

  apply() {
    const P = this.pose;
    const m = partMatrices(P, this.mx);
    for (const k of ['A', 'B', 'C', 'cab', 'col']) {
      if (k === 'col' && Math.abs(m.colHeight - this._colH) > 0.05) this._rebuildColumn(m.colHeight);
      const g = this.parts[k];
      g.matrix.copy(m[k]);
      g.matrixWorldNeedsUpdate = true;
    }
    if (Math.abs(P.cabY - this._stairH) > 0.08) this._rebuildStairs(P.cabY);
    // canopy: extends towards the fuselage when docked
    const bel = this.parts.bellows;
    bel.matrix.copy(m.cab).multiply(_m1.makeTranslation(JB.cabD / 2 - (1 - P.canopy) * (JB.bellows - 0.12), 0, 0));
    bel.matrixWorldNeedsUpdate = true;
  }

  /** Begin moving to docked (true) / stowed (false). */
  set(connected, instant = false) {
    this.target = connected ? 1 : 0;
    if (instant) { this.t = this.target; this.anim = null; lerpPoseSeq(this, this.t); this.apply(); return; }
    this.anim = { dir: connected ? 1 : -1 };
  }

  get moving() { return !!this.anim; }

  update(dt) {
    if (!this.anim) return false;
    const dur = 26;
    this.t = clamp01(this.t + this.anim.dir * dt / dur);
    lerpPoseSeq(this, this.t);
    this.apply();
    if ((this.anim.dir > 0 && this.t >= 1) || (this.anim.dir < 0 && this.t <= 0)) { this.anim = null; return true; }
    return false;
  }
}

/**
 * Sequenced motion (t: 0 stowed .. 1 docked): canopy in the last 12 %, a slow
 * straight final approach (last 25 %), the swing / telescoping before that.
 */
function lerpPoseSeq(br, t) {
  const S = br.stowed, D = br.docked;
  // intermediate "pre-docked" pose: 2.2 m back along the cab axis, canopy retracted
  if (!br._pre) {
    br._pre = { ...D, R: D.R, canopy: 0 };
    const cx = D.R.x + Math.cos(D.psi) * D.Lh - 2.2, cz = D.R.z - Math.sin(D.psi) * D.Lh;
    const dx = cx - D.R.x, dz = cz - D.R.z;
    br._pre.Lh = Math.hypot(dx, dz); br._pre.psi = Math.atan2(-dz, dx); br._pre.cabY = D.cabY + 0.12;
    br._pre.theta = Math.atan2(br._pre.cabY - D.R.y, br._pre.Lh);
  }
  const pre = br._pre;
  const out = br.pose;
  if (t < 0.63) lerpPose(S, pre, easeInOut(t / 0.63), out);
  else if (t < 0.88) lerpPose(pre, { ...D, canopy: 0 }, easeInOut((t - 0.63) / 0.25), out);
  else { lerpPose(D, D, 0, out); out.canopy = easeInOut((t - 0.88) / 0.12); }
}
