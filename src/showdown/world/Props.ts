import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { Builder } from './Build';

/** A box whose top face is pulled in front and back (car cabins, roofs). */
function cabinGeo(insetFront: number, insetBack: number) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      const x = p.getX(i);
      p.setX(i, x > 0 ? x - insetFront : x + insetBack);
    }
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}
const CABIN = cabinGeo(0.22, 0.14);
const CABIN_VAN = cabinGeo(0.08, 0.0);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14);
const BRANCH = new THREE.CylinderGeometry(0.6, 1, 1, 5);

export type CarKind = 'sedan' | 'taxi' | 'van' | 'kei' | 'bus' | 'truck';
export interface CarModel {
  geo: THREE.BufferGeometry;
  /** half extents for the collider */
  half: THREE.Vector3;
  /** y of the collider centre above the ground */
  cy: number;
  mass: number;
}

const GLASS = 0x223040;
const TIRE = 0x161616;
const HUB = 0xb9bcc0;
const TRIM = 0x2b2c30;
const HEAD = 0xfff4d8;
const TAIL = 0xb0101a;

const carCache = new Map<string, CarModel>();
/** Car built along +X (front), y up from the ground. */
export function carModel(kind: CarKind, color: number): CarModel {
  const key = kind + color;
  const hit = carCache.get(key);
  if (hit) return hit;
  const b = new Builder();
  let L = 4.6;
  let W = 1.74;
  let H = 1.48;
  const wheels = (r: number, xs: number[], z: number) => {
    for (const x of xs)
      for (const s of [-1, 1]) {
        b.add(WHEEL, TIRE, x, r, s * z, Math.PI / 2, 0, 0, r, 0.24, r);
        b.add(WHEEL, HUB, x, r, s * (z + 0.11), Math.PI / 2, 0, 0, r * 0.55, 0.04, r * 0.55);
      }
  };
  if (kind === 'sedan' || kind === 'taxi') {
    L = 4.65;
    W = 1.72;
    H = 1.48;
    b.box(L, 0.62, W, color, 0, 0.62, 0);
    b.box(L - 0.1, 0.12, W - 0.06, color, 0, 0.98, 0);
    b.add(CABIN, color, -0.25, 1.28, 0, 0, 0, 0, 2.5, 0.5, W - 0.12);
    // glass band
    b.add(CABIN, GLASS, -0.25, 1.27, 0, 0, 0, 0, 2.52, 0.4, W - 0.1);
    b.box(0.08, 0.22, W - 0.1, TRIM, L / 2, 0.45, 0);
    b.box(0.08, 0.22, W - 0.1, TRIM, -L / 2, 0.45, 0);
    for (const s of [-1, 1]) {
      b.box(0.06, 0.12, 0.34, HEAD, L / 2 + 0.01, 0.78, s * 0.62);
      b.box(0.06, 0.12, 0.34, TAIL, -L / 2 - 0.01, 0.8, s * 0.62);
    }
    if (kind === 'taxi') {
      b.box(0.5, 0.2, 0.22, 0xf2efe6, -0.3, 1.63, 0);
      b.box(0.52, 0.06, 0.24, 0xe0b020, -0.3, 1.55, 0);
    }
    wheels(0.33, [1.4, -1.35], 0.78);
  } else if (kind === 'kei') {
    L = 3.4;
    W = 1.48;
    H = 1.7;
    b.box(L, 0.7, W, color, 0, 0.6, 0);
    b.add(CABIN_VAN, color, -0.15, 1.3, 0, 0, 0, 0, 2.9, 0.75, W - 0.06);
    b.add(CABIN_VAN, GLASS, -0.1, 1.33, 0, 0, 0, 0, 2.92, 0.5, W - 0.04);
    for (const s of [-1, 1]) {
      b.box(0.06, 0.14, 0.26, HEAD, L / 2 + 0.01, 0.75, s * 0.52);
      b.box(0.06, 0.16, 0.2, TAIL, -L / 2 - 0.01, 0.8, s * 0.55);
    }
    wheels(0.28, [1.1, -1.1], 0.66);
  } else if (kind === 'van') {
    L = 4.7;
    W = 1.7;
    H = 1.98;
    b.box(L, 1.0, W, color, 0, 0.82, 0);
    b.add(CABIN_VAN, color, -0.2, 1.62, 0, 0, 0, 0, 4.2, 0.62, W - 0.04);
    b.box(0.6, 0.5, W - 0.02, GLASS, 1.9, 1.62, 0, 0, 0, -0.35);
    b.box(3.2, 0.36, W + 0.01, GLASS, -0.4, 1.66, 0);
    for (const s of [-1, 1]) {
      b.box(0.06, 0.14, 0.3, HEAD, L / 2 + 0.01, 0.82, s * 0.6);
      b.box(0.06, 0.24, 0.16, TAIL, -L / 2 - 0.01, 0.95, s * 0.7);
    }
    wheels(0.32, [1.5, -1.45], 0.76);
  } else if (kind === 'truck') {
    L = 7.2;
    W = 2.2;
    H = 3.1;
    b.box(1.8, 1.9, W, color, 2.6, 1.45, 0);
    b.box(0.08, 0.8, W - 0.2, GLASS, 3.51, 1.85, 0);
    b.box(5.2, 2.6, W + 0.1, 0xe8e6e0, -0.9, 1.9, 0);
    b.box(5.3, 0.25, W, TRIM, -0.9, 0.55, 0);
    wheels(0.45, [2.6, -0.4, -2.4], 0.95);
  } else {
    // city bus, Toei green
    L = 10.6;
    W = 2.5;
    H = 3.1;
    b.box(L, 2.3, W, 0xf1f0ea, 0, 1.6, 0);
    b.box(L - 0.4, 0.95, W + 0.02, GLASS, -0.1, 2.05, 0);
    b.box(L + 0.02, 0.32, W + 0.03, 0x1f8f55, 0, 1.05, 0);
    b.box(L - 0.6, 0.25, W - 0.3, 0xdddcd6, 0, 2.85, 0);
    b.box(0.08, 1.2, W - 0.2, GLASS, L / 2, 1.95, 0);
    b.box(0.1, 0.3, 1.6, 0x101010, L / 2 + 0.01, 2.62, 0);
    for (const s of [-1, 1]) b.box(0.06, 0.16, 0.3, HEAD, L / 2 + 0.01, 0.72, s * 0.9);
    wheels(0.5, [3.5, -3.4], 1.1);
  }
  const geo = b.build();
  const model: CarModel = { geo, half: new THREE.Vector3(L / 2, H / 2, W / 2), cy: H / 2, mass: kind === 'bus' ? 11000 : kind === 'truck' ? 7000 : 1200 };
  carCache.set(key, model);
  return model;
}

export function streetLight() {
  const b = new Builder();
  b.cyl(0.07, 0.11, 8.5, 0x5d6168, 0, 4.25, 0);
  b.box(0.35, 0.5, 0.35, 0x4a4d52, 0, 0.25, 0);
  b.box(2.4, 0.09, 0.09, 0x5d6168, 1.15, 8.35, 0, 0, 0, 0.08);
  b.box(0.75, 0.16, 0.34, 0x6d7177, 2.3, 8.42, 0);
  b.box(0.6, 0.04, 0.26, 0xfff6e0, 2.3, 8.33, 0);
  return b.build();
}

/** Japanese horizontal signal on an arm over the road (+X). */
export function trafficSignal() {
  const b = new Builder();
  b.cyl(0.1, 0.13, 6.4, 0x6e7278, 0, 3.2, 0);
  b.box(6.6, 0.12, 0.12, 0x6e7278, 3.3, 6.0, 0);
  b.box(0.12, 0.12, 0.9, 0x6e7278, 0, 3.0, 0.45);
  const hx = 5.2;
  b.box(1.3, 0.48, 0.32, 0x2e3136, hx, 5.65, 0);
  b.box(1.42, 0.06, 0.4, 0x2e3136, hx, 5.92, -0.04);
  const lamps = [0x26e0b8, 0x4a3a10, 0x3a0d0d];
  lamps.forEach((c, i) => b.cyl(0.16, 0.16, 0.06, c, hx - 0.42 + i * 0.42, 5.65, -0.17, Math.PI / 2, 0, 0, 12));
  // pedestrian signal on the pole
  b.box(0.38, 0.62, 0.26, 0x2e3136, 0.24, 2.6, 0);
  b.box(0.3, 0.24, 0.04, 0x1fa080, 0.24, 2.45, -0.14);
  b.box(0.3, 0.24, 0.04, 0x2a0a0a, 0.24, 2.77, -0.14);
  return b.build();
}

/** Bare winter ginkgo: trunk and a fan of branches. */
export function tree(seed: number) {
  const r = mulberry32(seed);
  const b = new Builder();
  const bark = 0x4a3f36;
  const h = 5 + r() * 2;
  b.cyl(0.12, 0.2, h, bark, 0, h / 2, 0, 0, 0, 0, 7);
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const y = h * (0.45 + r() * 0.5);
    const len = 1.6 + r() * 1.8;
    const tilt = 0.5 + r() * 0.5;
    const cx = Math.cos(a) * Math.sin(tilt) * len * 0.5;
    const cz = Math.sin(a) * Math.sin(tilt) * len * 0.5;
    const cy = y + Math.cos(tilt) * len * 0.5;
    const e = new THREE.Euler(0, -a, -tilt, 'YXZ');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(0.05, len, 0.05));
    b.addM(BRANCH, new THREE.Color(bark), m);
  }
  // tree guard grate
  b.box(1.4, 0.05, 1.4, 0x3b3d40, 0, 0.17, 0);
  return b.build();
}

export function guardRail(len: number) {
  const b = new Builder();
  const n = Math.max(2, Math.round(len / 2) + 1);
  for (let i = 0; i < n; i++) b.cyl(0.04, 0.04, 0.9, 0xe9ecef, -len / 2 + (i / (n - 1)) * len, 0.45, 0);
  b.box(len, 0.07, 0.06, 0xe9ecef, 0, 0.85, 0);
  b.box(len, 0.05, 0.05, 0xe9ecef, 0, 0.45, 0);
  return b.build();
}

export function vendingMachine(color: number) {
  const b = new Builder();
  b.box(1.0, 1.83, 0.75, color, 0, 0.92, 0);
  b.box(0.86, 0.75, 0.04, 0xdfe8ef, 0, 1.35, 0.38);
  const cans = [0xd02020, 0x2060d0, 0xf0c020, 0x20a050, 0xf06090, 0x804020];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 6; i++) b.box(0.09, 0.17, 0.02, cans[(i + row * 2) % cans.length], -0.33 + i * 0.13, 1.12 + row * 0.24, 0.405);
  b.box(0.3, 0.18, 0.06, 0x202020, -0.2, 0.42, 0.39);
  b.box(0.14, 0.24, 0.04, 0xb0b0b0, 0.3, 0.8, 0.39);
  return b.build();
}

export function bench() {
  const b = new Builder();
  b.box(1.8, 0.06, 0.45, 0x8a6a4a, 0, 0.45, 0);
  b.box(1.8, 0.35, 0.05, 0x8a6a4a, 0, 0.7, -0.2);
  for (const s of [-1, 1]) b.box(0.06, 0.45, 0.45, 0x3a3c40, s * 0.75, 0.22, 0);
  return b.build();
}

export function planter() {
  const b = new Builder();
  b.box(3.2, 0.55, 1.2, 0x9a9690, 0, 0.28, 0);
  for (let i = 0; i < 4; i++) b.sphere(0.48, 0x3c6b3a, -1.15 + i * 0.77, 0.75, 0, 1, 0.75, 1);
  return b.build();
}

/** Blue direction gantry over a road (spanning X), sign faces -Z. */
export function signGantry(span: number) {
  const b = new Builder();
  for (const s of [-1, 1]) b.cyl(0.18, 0.2, 7.2, 0x8a8f96, (s * span) / 2, 3.6, 0);
  b.box(span, 0.35, 0.35, 0x8a8f96, 0, 7.0, 0);
  return b.build();
}

export function busStop() {
  const b = new Builder();
  b.box(4.2, 0.08, 1.6, 0x4a4f58, 0, 2.6, 0);
  for (const s of [-1, 1]) b.box(0.08, 2.6, 0.08, 0x4a4f58, s * 2.0, 1.3, -0.7);
  b.box(4.0, 1.8, 0.04, 0x9fb3c4, 0, 1.4, -0.72);
  b.box(2.6, 0.06, 0.4, 0x6a6e74, 0, 0.5, -0.45);
  b.cyl(0.05, 0.05, 2.6, 0x4a4f58, 2.6, 1.3, 0.3);
  b.box(0.5, 0.5, 0.05, 0x1f8f55, 2.6, 2.4, 0.3);
  return b.build();
}
