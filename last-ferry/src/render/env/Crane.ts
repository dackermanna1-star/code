// The cargo crane (far side, x ≈ -6): a rusty yellow lattice slewing crane on
// its own platform behind the railing, its jib reaching over the deck. From
// the jib tip the hoist wire holds a netted pallet of fish crates; under the
// pallet dangles the hazard-striped hook block at gun height (CRANE.hook*):
// shoot it and the pallet drops.
//
// States (from the logic, see CraneView): 'hanging' (rehung: lowered in from
// above for ~1.2 s), 'falling' (CRANE.dropTime s free fall, then smashed),
// 'down' (crates smashed and scattered as a barricade, radius CRANE.radius),
// 'gone' (the barricade is cleared away).
import * as THREE from 'three';
import { CRANE } from '../../config/world';
import type { CraneState } from '../../core/events';
import { GeoBuilder, beam, box, cyl, rod, torus, type EnvMaterials } from './geo';
import type { Glows } from './Lamps';
import { mulberry32 } from './noise';
import type { Perch } from './Pier';

/** Crane foot (behind the far railing, left of the hook) and the jib tip right above the hook. */
const BASE = new THREE.Vector3(CRANE.hookX - 3.4, 0, -7.7);
const TIP = new THREE.Vector3(CRANE.hookX, 8.6, CRANE.hookZ);
/** Top of the crate stack (where the slings meet the hook ring). */
const RING_Y = CRANE.palletY + 2.15;
const PALLET_W = 1.7;
const PALLET_D = 1.3;
const CRATE_COLS = [0x2b5d8a, 0xa8392b, 0x2f7a4a, 0xc79a2a, 0x2b5d8a, 0xa8392b];

interface DebrisPiece {
  mesh: THREE.Object3D;
  /** Rest pose. */
  pos: THREE.Vector3;
  rot: THREE.Euler;
  /** Impact scatter start (on the deck under the pallet). */
  from: THREE.Vector3;
}

export class Crane {
  readonly group = new THREE.Group();
  readonly perches: Perch[] = [];
  /** The hanging load (pallet + crates + net + slings + hook block); origin at the pallet bottom centre. */
  private load = new THREE.Group();
  private hook = new THREE.Group();
  private wire: THREE.Mesh;
  private wireMat: THREE.MeshStandardMaterial;
  private debris = new THREE.Group();
  private pieces: DebrisPiece[] = [];
  private state: CraneState = 'hanging';
  private stateTime = 10;
  private synced = false;
  private warnGlow: number;
  private workGlow: number;
  /** Work light under the jib (null on low quality). */
  readonly workLight: THREE.PointLight | null;
  /** Cut wire end swinging after the drop. */
  private whip = 0;

  constructor(private mats: EnvMaterials, private glows: Glows, quality: 'low' | 'medium' | 'high' = 'high') {
    this.group.name = 'Crane';
    this.buildCrane();
    this.buildLoad();
    this.buildDebris();
    // Hoist wire: a unit-length cylinder scaled every frame between the tip and the load.
    this.wireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.8 });
    this.wire = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true).translate(0, -0.5, 0), this.wireMat);
    this.wire.castShadow = true;
    this.wire.position.copy(TIP);
    this.group.add(this.wire);
    this.warnGlow = glows.add(TIP.clone().add(new THREE.Vector3(0, 0.25, 0)), new THREE.Color(3.0, 0.15, 0.08), 0.9);
    // Work lamp under the jib, lighting the pallet and the deck around it.
    const wl = TIP.clone().add(new THREE.Vector3(-0.6, -0.35, -0.9));
    this.workGlow = glows.add(wl, new THREE.Color(2.4, 2.1, 1.6), 1.1);
    this.workLight = quality === 'low' ? null : new THREE.PointLight(0xffe2b8, 0, 13, 2);
    if (this.workLight) {
      this.workLight.position.copy(wl);
      this.group.add(this.workLight);
    }
    const lampG = new GeoBuilder();
    lampG.add(box(0.3, 0.2, 0.25), new THREE.Color(0x2a2a2a), { p: [wl.x, wl.y + 0.12, wl.z] });
    const lm = lampG.mesh(this.mats.metal);
    this.group.add(lm);
    this.setState('hanging', 10);
  }

  private buildCrane(): void {
    const yellow = new GeoBuilder();
    const steel = new GeoBuilder();
    const conc = new GeoBuilder();
    const rust = new THREE.Color(0x8a4a22);
    const yel = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
      // Faded safety yellow with rust creeping up from the joints.
      const r = Math.sin(p.x * 13.1 + p.y * 7.3 + p.z * 5.7) * 0.5 + 0.5;
      out.set(0xd8a21c).lerp(rust, 0.15 + 0.35 * r * r);
    };
    // Platform on its own piles behind the far railing.
    conc.add(box(3.4, 0.35, 3.2), new THREE.Color(0x55524c), { p: [BASE.x, -0.15, BASE.z] });
    for (const dx of [-1.4, 1.4]) for (const dz of [-1.3, 1.3]) conc.add(cyl(0.2, 0.22, 4.6, 8), new THREE.Color(0x3a3530), { p: [BASE.x + dx, -2.5, BASE.z + dz] });
    // Pedestal + slewing ring.
    conc.add(box(1.7, 0.6, 1.7), new THREE.Color(0x6a665e), { p: [BASE.x, 0.3, BASE.z] });
    steel.add(cyl(0.75, 0.8, 0.25, 16), new THREE.Color(0x2a2a2a), { p: [BASE.x, 0.72, BASE.z] });
    // Lattice tower (1.1 m square, 0.85 → 5.6 m).
    const y0 = 0.85;
    const y1 = 6.2;
    const hs = 0.55;
    const corners: Array<[number, number]> = [
      [-hs, -hs],
      [hs, -hs],
      [hs, hs],
      [-hs, hs],
    ];
    for (const [dx, dz] of corners) yellow.add(box(0.1, y1 - y0, 0.1), yel, { p: [BASE.x + dx, (y0 + y1) / 2, BASE.z + dz] });
    const levels = 5;
    for (let i = 0; i < levels; i++) {
      const ya = y0 + ((y1 - y0) * i) / levels;
      const yb = y0 + ((y1 - y0) * (i + 1)) / levels;
      for (let c = 0; c < 4; c++) {
        const [ax, az] = corners[c];
        const [bx, bz] = corners[(c + 1) % 4];
        const flip = i % 2 === 0;
        const b = beam(
          { x: BASE.x + ax, y: flip ? ya : yb, z: BASE.z + az },
          { x: BASE.x + bx, y: flip ? yb : ya, z: BASE.z + bz },
          0.05,
        );
        yellow.add(b.geo, yel, b.m);
        yellow.add(box(Math.abs(bx - ax) + 0.05, 0.05, Math.abs(bz - az) + 0.05), yel, { p: [BASE.x + (ax + bx) / 2, yb, BASE.z + (az + bz) / 2] });
      }
    }
    // Operator cab on top (faces the deck), counterweight behind.
    const cabY = y1 + 0.7;
    yellow.add(box(1.5, 1.4, 1.5), yel, { p: [BASE.x, cabY, BASE.z - 0.1] });
    yellow.add(box(1.7, 0.12, 1.75), new THREE.Color(0x2a2a2a), { p: [BASE.x, cabY + 0.76, BASE.z - 0.1] });
    // Cab windows (dark glass; lit at night by the glow material below).
    steel.add(box(1.2, 0.6, 0.04), new THREE.Color(0x16202a), { p: [BASE.x, cabY + 0.2, BASE.z + 0.66] });
    steel.add(box(0.04, 0.55, 1.0), new THREE.Color(0x16202a), { p: [BASE.x - 0.76, cabY + 0.2, BASE.z] });
    conc.add(box(1.4, 1.1, 0.9), new THREE.Color(0x4a4640), { p: [BASE.x, cabY - 0.1, BASE.z - 1.25] });
    // Hazard stripes on the counterweight.
    for (let i = 0; i < 4; i++) yellow.add(box(0.18, 1.12, 0.02), new THREE.Color(0x111111), { p: [BASE.x - 0.55 + i * 0.36, cabY - 0.1, BASE.z - 1.71], r: [0, 0, 0.6] });
    // Jib: lattice boom from the cab to the tip (two bottom chords, one top chord, lacing).
    const root = new THREE.Vector3(BASE.x + 0.4, cabY + 0.4, BASE.z + 0.6);
    const tip = TIP.clone().add(new THREE.Vector3(0, 0.15, 0));
    const jibDir = tip.clone().sub(root).normalize();
    const jibSide = new THREE.Vector3().crossVectors(jibDir, new THREE.Vector3(0, 1, 0)).normalize();
    const chordsB = [-0.32, 0.32].map((dx) => [root.clone().addScaledVector(jibSide, dx).add(new THREE.Vector3(0, -0.2, 0)), tip.clone().addScaledVector(jibSide, dx * 0.4).add(new THREE.Vector3(0, -0.12, 0))]);
    const chordT = [root.clone().add(new THREE.Vector3(0, 0.38, 0)), tip.clone().add(new THREE.Vector3(0, 0.12, 0))];
    for (const [a, b] of [...chordsB, chordT]) {
      const bm = beam(a, b, 0.09);
      yellow.add(bm.geo, yel, bm.m);
    }
    const seg = 7;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg;
      const t1 = (i + 1) / seg;
      const pt = (ch: THREE.Vector3[], t: number) => ch[0].clone().lerp(ch[1], t);
      for (const ch of chordsB) {
        const a = pt(ch, t0);
        const b = pt(chordT, (t0 + t1) / 2);
        const c = pt(ch, t1);
        const l1 = beam(a, b, 0.04);
        yellow.add(l1.geo, yel, l1.m);
        const l2 = beam(b, c, 0.04);
        yellow.add(l2.geo, yel, l2.m);
      }
      const a = pt(chordsB[0], t1);
      const b = pt(chordsB[1], t1);
      const l3 = beam(a, b, 0.04);
      yellow.add(l3.geo, yel, l3.m);
    }
    // Sheave at the tip, and the luffing cables back to the cab roof.
    steel.add(cyl(0.22, 0.22, 0.12, 12), new THREE.Color(0x333333), { p: [tip.x, tip.y, tip.z], r: [0, Math.atan2(jibSide.x, jibSide.z) + Math.PI / 2, Math.PI / 2] });
    for (const dx of [-0.25, 0.25]) {
      const r = rod({ x: BASE.x + dx, y: cabY + 0.85, z: BASE.z - 0.6 }, { x: tip.x + jibSide.x * dx * 0.3, y: tip.y + 0.15, z: tip.z - 0.3 }, 0.015, 4);
      steel.add(r.geo, new THREE.Color(0x222222), r.m);
    }
    // Warning light housing.
    steel.add(cyl(0.07, 0.07, 0.2, 8), new THREE.Color(0x441111), { p: [tip.x, tip.y + 0.25, tip.z] });
    // A little "SWL 2T" plate and a ladder up the tower (rungs).
    for (let y = 1.0; y < y1; y += 0.32) steel.add(box(0.45, 0.025, 0.025), new THREE.Color(0x3a3a3a), { p: [BASE.x, y, BASE.z + hs + 0.12] });
    const add = (b: GeoBuilder, mat: THREE.Material, name: string) => {
      const m = b.mesh(mat, name);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    };
    add(yellow, this.mats.paint, 'CraneYellow');
    add(steel, this.mats.metal, 'CraneSteel');
    add(conc, this.mats.stone, 'CraneBase');
    // Cab interior light.
    const cabLight = new GeoBuilder();
    cabLight.add(box(1.1, 0.5, 0.02), new THREE.Color(1.4, 0.9, 0.45), { p: [BASE.x, cabY + 0.2, BASE.z + 0.63] });
    const cl = cabLight.mesh(this.mats.glow, 'CraneCabLight');
    this.group.add(cl);
    this.perches.push({ x: tip.x - 0.1, y: tip.y + 0.55, z: tip.z - 0.6, yaw: 0.5 });
    this.perches.push({ x: BASE.x + 0.3, y: cabY + 0.85, z: BASE.z - 0.3, yaw: 2.4 });
  }

  /** Pallet with stacked, netted crates, four slings to a ring, the hook block below. */
  private buildLoad(): void {
    const rnd = mulberry32(31);
    const b = new GeoBuilder();
    const wood = new GeoBuilder();
    const steel = new GeoBuilder();
    // Pallet.
    for (let i = 0; i < 5; i++) wood.add(box(PALLET_W, 0.03, 0.2), new THREE.Color(0x8a6a44).multiplyScalar(0.8 + rnd() * 0.3), { p: [0, 0.135, -PALLET_D / 2 + 0.13 + i * 0.26] });
    for (const dx of [-0.7, 0, 0.7]) wood.add(box(0.12, 0.1, PALLET_D), new THREE.Color(0x6a5034), { p: [dx, 0.07, 0] });
    // Crates: 3 layers of 2 × 2.
    const cw = 0.8;
    const cd = 0.6;
    const ch = 0.6;
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          if (layer === 2 && i === 1 && j === 0) continue;
          const col = new THREE.Color(CRATE_COLS[(layer * 4 + i * 2 + j) % CRATE_COLS.length]).multiplyScalar(0.75 + rnd() * 0.3);
          const x = (i - 0.5) * (cw + 0.02);
          const z = (j - 0.5) * (cd + 0.02);
          const y = 0.15 + layer * ch + ch / 2;
          b.add(box(cw, ch, cd), col, { p: [x, y, z], r: [0, (rnd() - 0.5) * 0.06, 0] });
          // Darker rim + slots read as plastic crates.
          b.add(box(cw + 0.01, 0.05, cd + 0.01), col.clone().multiplyScalar(0.6), { p: [x, y + ch / 2 - 0.03, z] });
          b.add(box(cw * 0.5, 0.08, 0.01), new THREE.Color(0x111111), { p: [x, y + 0.12, z + cd / 2 + 0.005] });
        }
      }
    }
    // Cargo net: a few ropes over the stack.
    const top = 0.15 + 3 * ch;
    const netCol = new THREE.Color(0x3d4a2a);
    for (let k = -2; k <= 2; k++) {
      const x = k * 0.36;
      for (const [a, c] of [
        [new THREE.Vector3(x, 0.15, PALLET_D / 2 + 0.02), new THREE.Vector3(x, top + 0.02, PALLET_D / 2 + 0.02)],
        [new THREE.Vector3(x, 0.15, -PALLET_D / 2 - 0.02), new THREE.Vector3(x, top + 0.02, -PALLET_D / 2 - 0.02)],
        [new THREE.Vector3(x, top + 0.03, -PALLET_D / 2), new THREE.Vector3(x, top + 0.03, PALLET_D / 2)],
      ]) {
        const r = rod(a, c, 0.012, 4);
        b.add(r.geo, netCol, r.m);
      }
    }
    for (let k = 0; k < 4; k++) {
      const y = 0.3 + k * 0.45;
      for (const s of [-1, 1]) {
        const r = rod({ x: -PALLET_W / 2, y, z: (s * PALLET_D) / 2 + s * 0.02 }, { x: PALLET_W / 2, y, z: (s * PALLET_D) / 2 + s * 0.02 }, 0.012, 4);
        b.add(r.geo, netCol, r.m);
      }
    }
    // Slings from the pallet corners to the ring.
    const ringY = RING_Y - CRANE.palletY;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = rod({ x: (sx * PALLET_W) / 2, y: 0.12, z: (sz * PALLET_D) / 2 }, { x: 0, y: ringY, z: 0 }, 0.016, 4);
      steel.add(r.geo, new THREE.Color(0x2a2a2a), r.m);
    }
    steel.add(torus(0.12, 0.03, 6, 12), new THREE.Color(0x333333), { p: [0, ringY + 0.06, 0], r: [0, 0, 0] });
    const mk = (g: GeoBuilder, mat: THREE.Material) => {
      const m = g.mesh(mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.load.add(m);
    };
    mk(b, this.mats.plastic);
    mk(wood, this.mats.wood);
    mk(steel, this.mats.metal);

    // Hook block (striped) on a chain under the pallet: centre at CRANE hook height.
    const hb = new GeoBuilder();
    const hy = (CRANE.hookY0 + CRANE.hookY1) / 2 - CRANE.palletY;
    const stripe = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => out.set((((p.x + p.y * 1.2 + 10) / 0.11) | 0) % 3 === 0 ? 0x161616 : 0xffc21a);
    hb.add(new THREE.BoxGeometry(0.56, 0.5, 0.36, 6, 6, 1), stripe, { p: [0, hy + 0.1, 0] });
    hb.add(cyl(0.16, 0.16, 0.32, 12), new THREE.Color(0x2a2a2a), { p: [0, hy + 0.22, 0], r: [Math.PI / 2, 0, 0] });
    // The hook itself.
    hb.add(cyl(0.035, 0.035, 0.22, 6), new THREE.Color(0x444444), { p: [0, hy - 0.2, 0] });
    hb.add(torus(0.13, 0.04, 6, 12, Math.PI * 1.35), new THREE.Color(0x555555), { p: [0.02, hy - 0.4, 0], r: [0, 0, -0.6] });
    // Chain up to the pallet.
    for (let y = hy + 0.32; y < 0.0; y += 0.09) {
      hb.add(torus(0.04, 0.012, 4, 8), new THREE.Color(0x3a3a3a), { p: [0, y, 0], r: [0, (y * 37) % 2 > 1 ? Math.PI / 2 : 0, Math.PI / 2] });
    }
    const hm = hb.mesh(this.mats.paint, 'HookBlock');
    hm.castShadow = true;
    this.hook.add(hm);
    this.load.add(this.hook);
    this.load.position.set(CRANE.hookX, CRANE.palletY, CRANE.hookZ);
    this.group.add(this.load);
  }

  /** The smashed barricade: broken crates, planks, fish and ice, scattered within CRANE.radius. */
  private buildDebris(): void {
    const rnd = mulberry32(77);
    const R = CRANE.radius;
    const cx = CRANE.hookX;
    const cz = CRANE.hookZ;
    const plastic = this.mats.plastic;
    const addPiece = (geo: THREE.BufferGeometry, color: THREE.Color, mat: THREE.Material, x: number, y: number, z: number, rot: THREE.Euler) => {
      const g = new GeoBuilder();
      g.add(geo, color);
      const m = g.mesh(mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.set(x, y, z);
      m.rotation.copy(rot);
      this.debris.add(m);
      this.pieces.push({ mesh: m, pos: m.position.clone(), rot: rot.clone(), from: new THREE.Vector3(cx + (x - cx) * 0.2, CRANE.palletY * 0.5, cz + (z - cz) * 0.2) });
    };
    // Tumbled whole crates (a ring-ish wall) and smashed halves.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
      const d = R * (0.45 + rnd() * 0.5);
      const x = cx + Math.cos(a) * d * 1.05;
      const z = cz + Math.sin(a) * d * 0.9;
      const col = new THREE.Color(CRATE_COLS[i % CRATE_COLS.length]).multiplyScalar(0.7 + rnd() * 0.3);
      const broken = rnd() < 0.45;
      const h = broken ? 0.28 : 0.6;
      const rot = new THREE.Euler((rnd() - 0.5) * (broken ? 0.9 : 0.4), rnd() * Math.PI, (rnd() - 0.5) * (broken ? 0.9 : 0.5));
      addPiece(new THREE.BoxGeometry(0.8, h, 0.6), col, plastic, x, h / 2 + 0.02, z, rot);
      if (rnd() < 0.5) addPiece(new THREE.BoxGeometry(0.8, 0.6, 0.6), col.clone().multiplyScalar(0.9), plastic, x + (rnd() - 0.5) * 0.4, 0.6 + 0.3, z + (rnd() - 0.5) * 0.3, new THREE.Euler(rnd() * 0.6, rnd() * 3, rnd() * 0.6));
    }
    // Pallet planks.
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd() - 0.5) * R * 1.4;
      const z = cz + (rnd() - 0.5) * R * 1.2;
      addPiece(new THREE.BoxGeometry(1.0 + rnd() * 0.6, 0.035, 0.2), new THREE.Color(0x8a6a44).multiplyScalar(0.8 + rnd() * 0.3), this.mats.wood, x, 0.03 + rnd() * 0.12, z, new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * Math.PI, (rnd() - 0.5) * 0.3));
    }
    // Fish everywhere.
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * R * 1.05;
      const g = new THREE.SphereGeometry(0.07, 6, 4);
      g.scale(2.6, 0.7, 0.9);
      const tail = new THREE.ConeGeometry(0.06, 0.12, 4);
      tail.rotateZ(Math.PI / 2);
      tail.translate(-0.24, 0, 0);
      const gb = new GeoBuilder();
      const fishCol = new THREE.Color(rnd() < 0.3 ? 0xa86a4a : 0x8a9aa8).multiplyScalar(0.8 + rnd() * 0.4);
      gb.add(g, fishCol);
      gb.add(tail, fishCol.clone().multiplyScalar(0.7));
      const m = gb.mesh(this.mats.wetWood);
      m.castShadow = true;
      m.position.set(cx + Math.cos(a) * d, 0.05, cz + Math.sin(a) * d * 0.85);
      m.rotation.set(0, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
      this.debris.add(m);
      this.pieces.push({ mesh: m, pos: m.position.clone(), rot: m.rotation.clone(), from: new THREE.Vector3(cx, 0.8, cz) });
    }
    // Ice chips (shiny little boxes).
    const ice = new GeoBuilder();
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * R;
      ice.add(box(0.06, 0.04, 0.05), new THREE.Color(0.75, 0.85, 0.95), { p: [cx + Math.cos(a) * d, 0.02, cz + Math.sin(a) * d * 0.9], r: [rnd(), rnd() * 3, rnd()] });
    }
    const im = ice.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85 }));
    this.debris.add(im);
    // The net, flattened over the middle of the pile.
    const net = new GeoBuilder();
    for (let k = -4; k <= 4; k++) {
      const r1 = rod({ x: cx + k * 0.3, y: 0.05, z: cz - 1.0 }, { x: cx + k * 0.3 + 0.2, y: 0.25, z: cz + 1.0 }, 0.014, 4);
      net.add(r1.geo, new THREE.Color(0x3d4a2a), r1.m);
      const r2 = rod({ x: cx - 1.2, y: 0.1, z: cz + k * 0.24 }, { x: cx + 1.3, y: 0.18, z: cz + k * 0.24 + 0.1 }, 0.014, 4);
      net.add(r2.geo, new THREE.Color(0x3d4a2a), r2.m);
    }
    this.debris.add(net.mesh(this.mats.cloth));
    this.debris.visible = false;
    this.group.add(this.debris);
  }

  // ------------------------------------------------------------------ state

  setState(state: CraneState, stateTime = 0): void {
    if (state !== this.state) {
      if (state === 'falling') this.whip = 1;
    }
    this.state = state;
    this.stateTime = stateTime;
    this.synced = true;
  }

  get currentState(): CraneState {
    return this.state;
  }

  hookPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.hook.getWorldPosition(out).add(new THREE.Vector3(0, (CRANE.hookY0 + CRANE.hookY1) / 2 - CRANE.palletY + 0.1, 0));
  }

  update(dt: number, time: number, lamps: number): void {
    if (!this.synced) this.stateTime += dt;
    this.synced = false;
    const t = this.stateTime;
    const drop = CRANE.dropTime;
    const g = (2 * CRANE.palletY) / (drop * drop);
    let loadY = CRANE.palletY;
    let showLoad = true;
    let showDebris = false;
    let wireLen = TIP.y - RING_Y;
    let debrisK = 1;
    switch (this.state) {
      case 'hanging': {
        // Lowered in from above when rehung.
        const k = Math.min(1, t / 1.2);
        const e = 1 - (1 - k) * (1 - k);
        loadY = CRANE.palletY + (1 - e) * 4.5;
        wireLen = TIP.y - (RING_Y + (loadY - CRANE.palletY));
        break;
      }
      case 'falling': {
        if (t < drop) {
          loadY = CRANE.palletY - 0.5 * g * t * t;
          wireLen = 0.6 + t * 1.5;
        } else {
          showLoad = false;
          showDebris = true;
          wireLen = 0.6;
          debrisK = Math.min(1, (t - drop) / 0.25);
        }
        break;
      }
      case 'down':
        showLoad = false;
        showDebris = true;
        wireLen = 0.6;
        debrisK = Math.min(1, t / 0.25 + (t > 0.05 ? 1 : 0));
        break;
      case 'gone':
        showLoad = false;
        showDebris = t < 0.6;
        debrisK = 1;
        wireLen = 0.6;
        break;
    }
    // Gentle sway of the hanging load (hook swings more).
    const sway = this.state === 'hanging' ? 1 : 0;
    this.load.visible = showLoad;
    this.load.position.set(CRANE.hookX + Math.sin(time * 0.9) * 0.02 * sway, Math.max(0, loadY), CRANE.hookZ + Math.sin(time * 0.7 + 1) * 0.03 * sway);
    this.load.rotation.set(Math.sin(time * 0.7) * 0.01 * sway, Math.sin(time * 0.23) * 0.06 * sway, (this.state === 'falling' ? Math.min(1, t / drop) * 0.12 : 0) + Math.sin(time * 0.9) * 0.008 * sway);
    this.hook.rotation.set(Math.sin(time * 1.3) * 0.08 * sway, 0, Math.sin(time * 1.1 + 0.5) * 0.1 * sway);
    // Wire.
    this.whip = Math.max(0, this.whip - dt * 0.4);
    const swing = this.state === 'hanging' ? 0 : Math.sin(time * 2.6) * 0.35 * (0.3 + this.whip);
    this.wire.scale.set(1, Math.max(0.05, wireLen), 1);
    this.wire.rotation.set(swing * 0.5, 0, swing);
    // Debris scatter animation (burst out from the impact, settle).
    this.debris.visible = showDebris;
    if (showDebris) {
      const fadeOut = this.state === 'gone' ? Math.max(0, 1 - t / 0.6) : 1;
      for (const p of this.pieces) {
        const k = debrisK;
        const e = 1 - (1 - k) * (1 - k);
        p.mesh.position.lerpVectors(p.from, p.pos, e);
        p.mesh.position.y += Math.sin(k * Math.PI) * 0.6 * (1 - k * 0.5);
        if (this.state === 'gone') p.mesh.position.y -= (1 - fadeOut) * 0.7;
        p.mesh.rotation.set(p.rot.x * e + (1 - e) * 2, p.rot.y, p.rot.z * e);
        p.mesh.scale.setScalar(fadeOut < 1 ? Math.max(0.01, fadeOut) : 1);
      }
    }
    // Warning light blink (only once the lamps are on).
    const blink = Math.sin(time * 3.2) > 0.3 ? 1 : 0.08;
    this.glows.set(this.warnGlow, blink * (0.25 + 0.75 * lamps));
    this.glows.set(this.workGlow, lamps);
    if (this.workLight) this.workLight.intensity = 30 * lamps;
  }
}
