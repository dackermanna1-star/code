// Static pier dressing: substructure (pilings with tide marks, cap beams,
// joists, near-side bracing, rim boards, a ladder), the broken far railing,
// the low near railing with gaps, life rings, bollards, fish crates, rope
// coils, benches, a coin telescope, the abandoned ice-cream cart, the bait
// shop shack with its signs, and the gull perches.
import * as THREE from 'three';
import { PIER } from '../../config/world';
import { DECK_X0, JOISTS, type DeckHole } from './Deck';
import { GeoBuilder, beam, box, cone, cyl, rod, sphere, torus, type EnvMaterials } from './geo';
import { mulberry32 } from './noise';

export interface Perch {
  x: number;
  y: number;
  z: number;
  /** Facing (rad around y). */
  yaw: number;
}

/** Far-side lamp x positions and near-side ones. */
export const LAMPS_FAR = [-25, -17.5, -2.5, 5.5, 13.5];
export const LAMPS_NEAR = [-21, -9, 3, 15];
/** Bait shop footprint (x0, x1, z0, z1). */
export const BAIT_SHOP = { x0: -16.4, x1: -11.8, z0: -9.6, z1: -6.35 };

export interface PierBuild {
  group: THREE.Group;
  pilings: Array<{ x: number; z: number; r: number }>;
  perches: Perch[];
  /** Window glow material of the bait shop (level follows the time of day). */
  windowMat: THREE.MeshBasicMaterial;
  /** World positions of small lights (bait shop window …) for glow sprites. */
  glows: Array<{ p: THREE.Vector3; color: THREE.Color; size: number }>;
}

const C = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export function buildPier(mats: EnvMaterials, holes: DeckHole[]): PierBuild {
  const rnd = mulberry32(911);
  const group = new THREE.Group();
  group.name = 'PierDressing';
  const wood = new GeoBuilder();
  const dark = new GeoBuilder();
  const metal = new GeoBuilder();
  const rust = new GeoBuilder();
  const paint = new GeoBuilder();
  const rubber = new GeoBuilder();
  const cloth = new GeoBuilder();
  const glow = new GeoBuilder();
  const pilings: PierBuild['pilings'] = [];
  const perches: Perch[] = [];
  const glows: PierBuild['glows'] = [];

  // ---- substructure ---------------------------------------------------------
  const pileZ = [-5.85, -2.0, 2.0, 5.85];
  const tideCol: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void = (p, _n, out) => {
    const y = p.y;
    if (y > -1.55) out.set(0x3e352d).multiplyScalar(0.9 + 0.2 * Math.sin(p.y * 7 + p.x));
    else if (y > -2.15) out.set(0x8c877a).multiplyScalar(0.75 + 0.35 * (Math.sin(p.x * 31 + p.y * 47 + p.z * 13) * 0.5 + 0.5));
    else out.set(0x1d281b);
  };
  for (let x = DECK_X0 + 1; x <= PIER.maxX - 0.3; x += 3) {
    for (const z of pileZ) {
      const r = 0.17 + rnd() * 0.04;
      const px = x + (rnd() - 0.5) * 0.15;
      const pz = z + (rnd() - 0.5) * 0.08;
      pilings.push({ x: px, z: pz, r });
      wood.add(cyl(r * 0.95, r, 4.8, 9), tideCol, { p: [px, -0.52 - 2.4, pz], r: [(rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.03] });
    }
    // Cap beam across the pier.
    dark.add(box(0.3, 0.3, 12.5), C(0x2e2620), { p: [x, -0.37, 0] });
    // Near-side X bracing to the next bent.
    if (x + 3 <= PIER.maxX) {
      const zb = 6.05;
      const a1 = beam({ x: x + 0.15, y: -0.6, z: zb }, { x: x + 2.85, y: -2.25, z: zb }, 0.08, 0.2);
      wood.add(a1.geo, C(0x31291f), a1.m);
      const a2 = beam({ x: x + 0.15, y: -2.25, z: zb + 0.09 }, { x: x + 2.85, y: -0.6, z: zb + 0.09 }, 0.08, 0.2);
      wood.add(a2.geo, C(0x2c241c), a2.m);
    }
  }
  // Ferry-end pilings (the pier head) for foam.
  for (let z = -5.5; z <= 5.5; z += 2.75) pilings.push({ x: PIER.maxX - 0.2, z, r: 0.2 });
  // Joists along x.
  const len = PIER.maxX - DECK_X0;
  for (const z of JOISTS) dark.add(box(len, 0.16, 0.09), C(0x2a221b), { p: [DECK_X0 + len / 2, -0.135, z] });
  // Rim boards (fascia) on both edges, and walings under them.
  wood.add(box(len, 0.32, 0.07), C(0x3a3027), { p: [DECK_X0 + len / 2, -0.19, PIER.maxZ + 0.13] });
  wood.add(box(len, 0.32, 0.07), C(0x3a3027), { p: [DECK_X0 + len / 2, -0.19, PIER.minZ - 0.13] });
  wood.add(box(len, 0.22, 0.1), C(0x2f271f), { p: [DECK_X0 + len / 2, -0.62, PIER.maxZ + 0.1] });
  // Pier head end (facing the ferry).
  wood.add(box(0.08, 0.32, 12.3), C(0x3a3027), { p: [PIER.maxX + 0.04, -0.19, 0] });
  // Joist ends showing in the broken board spots + splintered stubs.
  for (const h of holes) {
    const cz = (h.z0 + h.z1) / 2;
    wood.add(box(h.x1 - h.x0, 0.03, 0.06), C(0x5a4632), { p: [(h.x0 + h.x1) / 2, -0.03, h.z0 < 0 ? h.z1 - 0.02 : h.z0 + 0.02], r: [0.3, 0, 0] });
    void cz;
  }
  // Ladder down to the water (near side).
  {
    const lx = 8.4;
    const zl = PIER.maxZ + 0.24;
    for (const dx of [-0.24, 0.24]) {
      const r1 = rod({ x: lx + dx, y: 0.85, z: zl - 0.25 }, { x: lx + dx, y: 0.85, z: zl }, 0.025);
      rust.add(r1.geo, C(0x5a3020), r1.m);
      const r2 = rod({ x: lx + dx, y: 0.85, z: zl }, { x: lx + dx, y: -3.3, z: zl }, 0.025);
      rust.add(r2.geo, C(0x5a3020), r2.m);
    }
    for (let y = 0.6; y > -3.2; y -= 0.32) {
      const r = rod({ x: lx - 0.24, y, z: zl }, { x: lx + 0.24, y, z: zl }, 0.018);
      rust.add(r.geo, C(0x4a281a), r.m);
    }
  }

  // ---- far railing (broken) ------------------------------------------------------
  const zf = PIER.minZ + 0.06;
  const farBroken = (x: number) => (x > 3 && x < 7.5) || (x > BAIT_SHOP.x0 - 0.2 && x < BAIT_SHOP.x1 + 0.2);
  for (let x = DECK_X0 + 1; x <= PIER.maxX - 1; x += 2) {
    if (farBroken(x)) continue;
    const lean = (rnd() - 0.5) * 0.06 + (x > 10 && x < 13 ? 0.25 : 0);
    const h = 1.08 + (rnd() - 0.5) * 0.05;
    wood.add(box(0.1, h, 0.1), C(0x4a3e33, 0.85 + rnd() * 0.3), { p: [x, h / 2, zf], r: [lean * 0.4, 0, lean] });
    if (rnd() < 0.55) perches.push({ x, y: h, z: zf, yaw: rnd() * Math.PI * 2 });
    const nx = x + 2;
    if (nx > PIER.maxX - 1 || farBroken(nx)) continue;
    // Rails, some broken.
    const r = rnd();
    if (x > -20.5 && x < -19.5) {
      // Snapped top rail hanging down at one end.
      const b = beam({ x, y: 1.0, z: zf }, { x: x + 1.7, y: 0.25, z: zf - 0.05 }, 0.06, 0.11);
      wood.add(b.geo, C(0x544536), b.m);
      wood.add(box(2, 0.06, 0.09), C(0x4d4032), { p: [x + 1, 0.55, zf] });
    } else if (x > 10 && x < 13) {
      const b = beam({ x, y: 1.0, z: zf }, { x: x + 2, y: 0.62, z: zf + 0.06 }, 0.06, 0.11);
      wood.add(b.geo, C(0x544536), b.m);
    } else {
      wood.add(box(2.02, 0.065, 0.12), C(0x574838, 0.85 + rnd() * 0.3), { p: [x + 1, 1.02, zf], r: [0, 0, (rnd() - 0.5) * 0.02] });
      if (r > 0.15) wood.add(box(2.0, 0.055, 0.09), C(0x4d4032, 0.85 + rnd() * 0.3), { p: [x + 1, 0.55, zf] });
    }
  }
  // Fallen railing piece lying at the gap.
  {
    const b = beam({ x: 3.6, y: 0.04, z: -5.4 }, { x: 5.4, y: 0.04, z: -5.75 }, 0.06, 0.11);
    wood.add(b.geo, C(0x574838), b.m);
  }

  // ---- near railing (low, with gaps) -----------------------------------------------
  const zn = PIER.maxZ - 0.05;
  const nearGap = (x: number) => (x > -9 && x < -5) || (x > 6 && x < 9.5) || (x > 15.5 && x < 17.5);
  for (let x = DECK_X0 + 1.5; x <= PIER.maxX - 1; x += 2.5) {
    if (nearGap(x)) continue;
    const h = 0.6 + (rnd() - 0.5) * 0.05;
    const tilt = (rnd() - 0.5) * 0.08;
    wood.add(box(0.09, h, 0.09), C(0x4a3e33, 0.85 + rnd() * 0.3), { p: [x, h / 2, zn], r: [tilt, 0, 0] });
    if (rnd() < 0.3) perches.push({ x, y: h, z: zn, yaw: rnd() * Math.PI * 2 });
    const nx = x + 2.5;
    if (nx > PIER.maxX - 1 || nearGap(nx)) continue;
    if (rnd() < 0.85) wood.add(box(2.52, 0.06, 0.1), C(0x564736, 0.85 + rnd() * 0.3), { p: [x + 1.25, 0.58, zn] });
  }

  // ---- life rings --------------------------------------------------------------------
  const lifeRing = (x: number, y: number, z: number, rotY: number) => {
    const ringCol = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
      const a = Math.atan2(p.y - y, (p.x - x) * Math.cos(rotY) - (p.z - z) * Math.sin(rotY));
      out.set(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0 ? 0xd2401c : 0xe8e2d6);
    };
    paint.add(torus(0.3, 0.075, 6, 20), ringCol, { p: [x, y, z], r: [0, rotY, 0] });
    const r = rod({ x: x - 0.25, y: y + 0.32, z }, { x: x + 0.25, y: y + 0.32, z }, 0.012);
    cloth.add(r.geo, C(0xc8b88a), r.m);
  };
  lifeRing(-23, 0.78, zf + 0.09, 0);
  lifeRing(1, 0.78, zf + 0.09, 0);
  lifeRing(17, 0.78, zf + 0.09, 0);
  lifeRing(-11.5, 0.42, zn + 0.08, 0);

  // ---- bollards ------------------------------------------------------------------------
  const bollard = (x: number, z: number) => {
    metal.add(cyl(0.13, 0.16, 0.42, 10), C(0x24282c), { p: [x, 0.21, z] });
    metal.add(cyl(0.2, 0.17, 0.08, 10), C(0x24282c), { p: [x, 0.45, z] });
    perches.push({ x, y: 0.5, z, yaw: rnd() * 6.28 });
  };
  for (const x of [-19.9, -7.8, 11.5, 19.6]) bollard(x, PIER.minZ + 0.32);
  for (const x of [-19, 4.5, 21.4]) bollard(x, PIER.maxZ - 0.3);

  // ---- fish crates, rope, clutter -------------------------------------------------------------
  const crateCols = [0x2b5d8a, 0xa8392b, 0x2f7a4a, 0xc79a2a, 0x2b5d8a];
  const crateStack = (x: number, z: number, n: number) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const col = C(crateCols[Math.floor(rnd() * crateCols.length)], 0.8 + rnd() * 0.3);
      const rot = (rnd() - 0.5) * 0.25;
      const w = 0.62;
      const d = 0.42;
      const h = 0.27;
      const ox = (rnd() - 0.5) * 0.06;
      plasticCrate(paint, x + ox, y, z, w, h, d, rot, col);
      y += h;
    }
  };
  crateStack(-10.9, -5.55, 3);
  crateStack(-10.2, -5.6, 2);
  crateStack(-10.55, -5.12, 1);
  crateStack(-4.6, -5.55, 2);
  crateStack(-3.95, -5.55, 4);
  crateStack(12.2, 5.55, 2);
  crateStack(-24.4, 5.55, 2);
  // Wooden fish boxes with ice + fish.
  const fishBox = (x: number, z: number, rot: number) => {
    wood.add(box(0.7, 0.22, 0.45), C(0x7a5a3a), { p: [x, 0.11, z], r: [0, rot, 0] });
    paint.add(box(0.62, 0.02, 0.38), C(0xc8d4dc), { p: [x, 0.215, z], r: [0, rot, 0] });
    for (let k = 0; k < 4; k++) {
      paint.add(sphere(0.06, 6, 4), C(0x8a9aa6), { p: [x + (k - 1.5) * 0.14, 0.24, z + (rnd() - 0.5) * 0.15], r: [0, rot, 0], s: [1.8, 0.6, 0.7] });
    }
  };
  fishBox(-13.2, -5.5, 0.1);
  fishBox(-17, 5.5, -0.15);
  // Rope coils.
  const coil = (x: number, z: number) => {
    for (let i = 0; i < 4; i++) cloth.add(torus(0.28 - i * 0.02, 0.045, 5, 18), C(0xb7a37a, 0.85 + 0.1 * i), { p: [x, 0.045 + i * 0.07, z], r: [Math.PI / 2, 0, 0] });
  };
  coil(-19.0, -5.45);
  coil(14.6, 5.5);
  coil(20.2, -5.4);
  // Benches facing the sea (far side).
  const bench = (x: number) => {
    for (let k = 0; k < 3; k++) wood.add(box(1.6, 0.04, 0.1), C(0x6a4a30), { p: [x, 0.45, -5.15 - k * 0.12] });
    for (let k = 0; k < 2; k++) wood.add(box(1.6, 0.1, 0.035), C(0x6a4a30), { p: [x, 0.7 + k * 0.14, -4.98], r: [-0.15, 0, 0] });
    for (const dx of [-0.65, 0.65]) metal.add(box(0.05, 0.45, 0.45), C(0x1f2a26), { p: [x + dx, 0.22, -5.25] });
  };
  bench(-21.6);
  bench(9.6);
  // Coin telescope at the railing.
  {
    const tx = 0.6;
    const tz = -5.55;
    paint.add(cyl(0.06, 0.09, 1.0, 8), C(0x2a5a8a), { p: [tx, 0.5, tz] });
    paint.add(cyl(0.13, 0.11, 0.42, 10), C(0x2a5a8a), { p: [tx, 1.15, tz - 0.05], r: [Math.PI / 2 - 0.3, 0, 0] });
    metal.add(cyl(0.09, 0.09, 0.05, 10), C(0x9a9a9a), { p: [tx, 1.21, tz - 0.27], r: [Math.PI / 2 - 0.3, 0, 0] });
    perches.push({ x: tx, y: 1.32, z: tz, yaw: 0.4 });
  }
  // Abandoned ice-cream cart with a parasol (far side, left).
  {
    const cx = -27.2;
    const cz = -5.0;
    paint.add(box(1.3, 0.75, 0.75), C(0xe6d9c0), { p: [cx, 0.55, cz] });
    paint.add(box(1.32, 0.12, 0.77), C(0xd75a7a), { p: [cx, 0.85, cz] });
    rubber.add(cyl(0.22, 0.22, 0.08, 12), C(0x1a1a1a), { p: [cx - 0.45, 0.22, cz + 0.4], r: [Math.PI / 2, 0, 0] });
    rubber.add(cyl(0.22, 0.22, 0.08, 12), C(0x1a1a1a), { p: [cx + 0.45, 0.22, cz + 0.4], r: [Math.PI / 2, 0, 0] });
    metal.add(cyl(0.02, 0.02, 1.4, 6), C(0x999999), { p: [cx, 1.6, cz] });
    const umb = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
      const a = Math.atan2(p.z - cz, p.x - cx);
      out.set(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10) % 2 === 0 ? 0xd75a7a : 0xf2ede0);
    };
    cloth.add(cone(1.0, 0.45, 10), umb, { p: [cx, 2.4, cz], r: [0.25, 0, 0.18] });
    perches.push({ x: cx + 0.1, y: 2.6, z: cz - 0.05, yaw: 1.2 });
  }
  // Suitcases and bags near the gangway (the queue's luggage).
  {
    const bags: Array<[number, number, number, number, number, number]> = [
      [19.6, -2.6, 0.55, 0.35, 0.22, 0x7a2b2b],
      [19.9, -2.9, 0.45, 0.3, 0.2, 0x2b4a6a],
      [19.7, -2.75, 0.4, 0.28, 0.18, 0xc7a25a],
      [20.2, 2.6, 0.6, 0.4, 0.24, 0x3a3a3a],
      [20.6, 2.9, 0.35, 0.3, 0.3, 0x5a6b3a],
    ];
    let yS = 0;
    for (const [x, z, w, h, d, c] of bags) {
      const y = x === 19.7 ? yS : 0;
      paint.add(box(w, h, d), C(c), { p: [x, y + h / 2, z], r: [0, (rnd() - 0.5) * 0.6, 0] });
      if (x === 19.6) yS = h;
    }
  }

  // ---- bait shop shack ----------------------------------------------------------------
  {
    const { x0, x1, z0, z1 } = BAIT_SHOP;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = x1 - x0;
    const d = z1 - z0;
    const H = 2.55;
    // Platform behind the far edge.
    wood.add(box(w + 1.2, 0.1, d + 0.4), C(0x4a3f34), { p: [cx, -0.05, cz - 0.15] });
    for (const px of [x0 - 0.4, x1 + 0.4]) for (const pz of [z0 - 0.2, -6.4]) wood.add(cyl(0.16, 0.18, 4.4, 8), tideCol, { p: [px, -2.3, pz] });
    // Clapboard walls (faded sea-green with horizontal boards).
    const clap = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
      const band = Math.floor(p.y / 0.2);
      out.set(0x6d9690).multiplyScalar(0.78 + 0.18 * ((band * 7) % 3) / 2 + 0.06 * Math.sin(p.x * 3 + p.z * 2));
    };
    wood.add(box(w, H, d), clap, { p: [cx, H / 2, cz] });
    // Corner trims.
    for (const px of [x0, x1]) wood.add(box(0.1, H, 0.1), C(0xe8e0d0), { p: [px, H / 2, z1] });
    // Pitched corrugated roof (ridge along x).
    const roofCol = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
      out.set(0x6a3328).multiplyScalar(0.75 + 0.25 * (Math.sin(p.x * 22) * 0.5 + 0.5));
    };
    const pitch = 0.45;
    const rw = d / 2 + 0.35;
    rust.add(box(w + 0.5, 0.05, rw / Math.cos(pitch)), roofCol, { p: [cx, H + Math.tan(pitch) * rw * 0.5 - 0.02, cz + rw / 2 - 0.05], r: [pitch, 0, 0] });
    rust.add(box(w + 0.5, 0.05, rw / Math.cos(pitch)), roofCol, { p: [cx, H + Math.tan(pitch) * rw * 0.5 - 0.02, cz - rw / 2 + 0.05], r: [-pitch, 0, 0] });
    // Gable ends.
    {
      const sh = new THREE.Shape();
      sh.moveTo(-d / 2, 0);
      sh.lineTo(d / 2, 0);
      sh.lineTo(0, Math.tan(pitch) * d / 2);
      sh.lineTo(-d / 2, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: w - 0.02, bevelEnabled: false });
      g.translate(0, 0, -(w - 0.02) / 2);
      g.rotateY(Math.PI / 2);
      wood.add(g, C(0x6d9690, 0.9), { p: [cx, H, cz] });
    }
    const front = z1 + 0.01;
    // Door (left), window (right) with a lit interior.
    wood.add(box(0.85, 1.95, 0.05), C(0x2d4a5a), { p: [x0 + 0.85, 0.98, front + 0.02] });
    metal.add(sphere(0.04, 6, 4), C(0xc8a050), { p: [x0 + 1.15, 1.0, front + 0.06] });
    // A "BACK IN 5 MIN" card hanging askew.
    paint.add(box(0.36, 0.2, 0.01), C(0xe8dcc0), { p: [x0 + 0.85, 1.55, front + 0.06], r: [0, 0, 0.18] });
    glow.add(box(1.5, 0.95, 0.03), C(0xffb060, 1.0), { p: [x1 - 1.2, 1.45, front + 0.01] });
    // Window frame + cross bars.
    for (const [dx, dy, ww, hh] of [
      [0, 0.5, 1.62, 0.07],
      [0, -0.5, 1.62, 0.07],
      [-0.78, 0, 0.07, 1.05],
      [0.78, 0, 0.07, 1.05],
      [0, 0, 1.5, 0.04],
      [0, 0, 0.04, 0.95],
    ]) wood.add(box(ww, hh, 0.05), C(0xe8e0d0), { p: [x1 - 1.2 + dx, 1.45 + dy, front + 0.04] });
    glows.push({ p: new THREE.Vector3(x1 - 1.2, 1.45, front + 0.3), color: new THREE.Color(1.0, 0.6, 0.25), size: 1.6 });
    // Striped awning over the window.
    const awn = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => out.set(Math.floor((p.x + 40) / 0.25) % 2 === 0 ? 0xc0392b : 0xf0e8d8);
    cloth.add(box(1.9, 0.04, 0.75), awn, { p: [x1 - 1.2, 2.12, front + 0.33], r: [0.38, 0, 0] });
    // Live bait cool box and a bucket, rods leaning on the wall.
    paint.add(box(0.8, 0.5, 0.5), C(0xe8e8e8), { p: [x0 + 2.0, 0.25, front + 0.45] });
    paint.add(box(0.82, 0.08, 0.52), C(0x2a6aa8), { p: [x0 + 2.0, 0.54, front + 0.45] });
    paint.add(cyl(0.16, 0.13, 0.32, 10), C(0xd8a020), { p: [x1 - 0.25, 0.16, front + 0.35] });
    for (let k = 0; k < 3; k++) {
      const r = rod({ x: x1 + 0.12 + k * 0.08, y: 0.0, z: front + 0.2 }, { x: x1 + 0.02 + k * 0.1, y: 2.4 + k * 0.15, z: front - 0.1 }, 0.012, 4);
      dark.add(r.geo, C(0x222222), r.m);
    }
    perches.push({ x: cx - 0.6, y: H + Math.tan(pitch) * d / 2 + 0.02, z: cz, yaw: 0.3 });
    perches.push({ x: cx + 1.1, y: H + Math.tan(pitch) * d / 2 + 0.02, z: cz, yaw: -0.5 });
  }

  // ---- build meshes ----------------------------------------------------------------
  const add = (b: GeoBuilder, mat: THREE.Material, name: string, shadow = true) => {
    if (!b.count) return;
    const m = b.mesh(mat, name);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  };
  add(wood, mats.wood, 'PierWood');
  add(dark, mats.wetWood, 'PierDarkWood');
  add(metal, mats.metal, 'PierMetal');
  add(rust, mats.rust, 'PierRust');
  add(paint, mats.paint, 'PierPaint');
  add(rubber, mats.rubber, 'PierRubber');
  add(cloth, mats.cloth, 'PierCloth');
  const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  windowMat.name = 'PierWindows';
  add(glow, windowMat, 'PierWindows', false);

  // Signs (canvas textures).
  group.add(signMesh('BAIT & TACKLE', '#f3e6c8', '#7a1f17', 2.6, 0.5, new THREE.Vector3((BAIT_SHOP.x0 + BAIT_SHOP.x1) / 2, 2.95, BAIT_SHOP.z1 + 0.18), 0));
  group.add(signMesh('LIVE BAIT · ICE · TEA', '#1d2b2a', '#e8e0c8', 1.1, 0.42, new THREE.Vector3(BAIT_SHOP.x0 + 2.0, 1.0, BAIT_SHOP.z1 + 0.04), 0, true));
  {
    // Departure board by the gangway.
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), mats.metal);
    post.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(post.geometry.attributes.position.count * 3).fill(0.15), 3));
    post.position.set(20.9, 0.8, -5.45);
    g.add(post);
    g.add(signMesh('LAST FERRY ⚓ 21:30', '#101820', '#f2b33d', 1.3, 0.42, new THREE.Vector3(20.9, 1.55, -5.4), 0, true));
    group.add(g);
  }
  return { group, pilings, perches, windowMat, glows };
}

/** A plastic fish crate: open box with slotted sides. */
function plasticCrate(b: GeoBuilder, x: number, y: number, z: number, w: number, h: number, d: number, rot: number, col: THREE.Color): void {
  const c2 = col.clone().multiplyScalar(0.75);
  b.add(box(w, 0.03, d), c2, { p: [x, y + 0.015, z], r: [0, rot, 0] });
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const off = (lx: number, lz: number): [number, number, number] => [x + lx * cs + lz * sn, 0, z - lx * sn + lz * cs];
  for (const s of [-1, 1]) {
    const [ax, , az] = off(0, (s * d) / 2);
    b.add(box(w, h, 0.025), col, { p: [ax, y + h / 2, az], r: [0, rot, 0] });
    const [bx, , bz] = off((s * w) / 2, 0);
    b.add(box(0.025, h, d), col, { p: [bx, y + h / 2, bz], r: [0, rot, 0] });
  }
}

/** A flat sign with canvas-rendered text (MeshStandardMaterial so it is lit). */
export function signMesh(text: string, bg: string, fg: string, w: number, h: number, pos: THREE.Vector3, rotY: number, small = false): THREE.Mesh {
  const cv = document.createElement('canvas');
  const scale = 128;
  cv.width = Math.round(w * scale * 2);
  cv.height = Math.round(h * scale * 2);
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, cv.width, cv.height);
  // Weathering: speckles and a darker border.
  const r = mulberry32(text.length * 97);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
    g.fillRect(r() * cv.width, r() * cv.height, 1 + r() * 3, 1 + r() * 3);
  }
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = cv.height * 0.06;
  g.strokeRect(0, 0, cv.width, cv.height);
  g.fillStyle = fg;
  const fs = cv.height * (small ? 0.42 : 0.6);
  g.font = `900 ${fs}px "Georgia", "Times New Roman", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = fs;
  while (g.measureText(text).width > cv.width * 0.9 && size > 8) {
    size *= 0.92;
    g.font = `900 ${size}px "Georgia", "Times New Roman", serif`;
  }
  g.fillText(text, cv.width / 2, cv.height * 0.54);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.position.copy(pos);
  m.rotation.y = rotY;
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}
