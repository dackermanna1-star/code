// HOLDOUT — what the mode adds to Last Lookout's valley: barricades across the way into each
// closed area (with the price painted on), quarantine fencing along the edge of the open ground,
// guns racked on boards, the supply crate with its beacon, the gunsmith's bench, the field-kit
// cabinets, pickups, grenades in flight. Built from the valley's own materials and pixel textures.
import * as THREE from 'three';
import { Bank } from '../render/geom.js';
import { sandbag, panel } from '../render/props.js';
import { Pix, drawText, textWidth, toTexture, hex, rng, createTextures, PROP_UV } from '../render/textures.js';
import { unlit, lambert } from '../render/worldMat.js';
import { AREAS, DOORS, LOCKERS, CRATE_SPOTS, BENCH, PERKS, GUNS, areaById, inRect } from './areas.js';

const PROPS_TEX = [128, 128];
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// pixel textures

/** A painted board: lines of text centred on a coloured ground. lines: [{ text, scale, color }] */
function boardTex(w, h, ground, lines, opts = {}) {
  const p = new Pix(w, h);
  const R = rng(opts.seed ?? 11);
  const g = hex(ground);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 0.82 + 0.18 * R() - (y % 6 === 0 && opts.planks ? 0.12 : 0);
      p.set(x, y, [g[0] * k, g[1] * k, g[2] * k], 1);
    }
  }
  if (opts.border) {
    const b = hex(opts.border);
    for (let x = 0; x < w; x++) {
      p.set(x, 0, b);
      p.set(x, h - 1, b);
    }
    for (let y = 0; y < h; y++) {
      p.set(0, y, b);
      p.set(w - 1, y, b);
    }
  }
  let total = 0;
  for (const L of lines) total += 7 * (L.scale ?? 1) + (L.gap ?? 2);
  let y = Math.round((h - total) / 2) + 1;
  for (const L of lines) {
    const s = L.scale ?? 1;
    const tw = textWidth(L.text, s);
    drawText(p, L.text, Math.round((w - tw) / 2), y, hex(L.color ?? 0xffffff), { scale: s, jitter: opts.jitter ?? 0, seed: (opts.seed ?? 1) + y, drip: opts.drip ?? 0 });
    y += 7 * s + (L.gap ?? 2);
  }
  return p;
}

/** An icon on a transparent square: kind 'ammo' | 'fury' | 'bounty' | 'shockwave' | perk ids. */
function iconTex(kind, color) {
  const S = 32, p = new Pix(S, S);
  p.fill([0, 0, 0], 0);
  const c = hex(color), dark = [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35], white = [1, 1, 1];
  const disc = (cx, cy, r, col, a = 1) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) p.set(x, y, col, a);
  };
  const rect = (x0, y0, w, h, col) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) p.set(x, y, col, 1);
  };
  disc(15.5, 15.5, 15.5, dark);
  disc(15.5, 15.5, 13.5, c);
  disc(15.5, 15.5, 11.5, dark);
  switch (kind) {
    case 'ammo':
      for (const x of [9, 14, 19]) {
        rect(x, 11, 4, 12, [0.95, 0.75, 0.3]);
        rect(x, 8, 4, 3, [0.8, 0.5, 0.25]);
        rect(x + 1, 7, 2, 1, [0.8, 0.5, 0.25]);
      }
      break;
    case 'fury':
      // a skull
      disc(15.5, 13, 7, white);
      rect(11, 17, 10, 6, white);
      disc(12.5, 13, 2, dark);
      disc(18.5, 13, 2, dark);
      for (const x of [12, 15, 18]) rect(x, 20, 1, 3, dark);
      break;
    case 'bounty':
      drawText(p, 'X2', 10, 12, white, { scale: 1 });
      rect(9, 9, 14, 1, white);
      rect(9, 22, 14, 1, white);
      break;
    case 'shockwave':
      for (const r of [4, 7, 10]) {
        for (let a = 0; a < 64; a++) {
          const t = (a / 64) * TAU;
          p.set(15.5 + Math.cos(t) * r, 15.5 + Math.sin(t) * r, white, 1);
        }
      }
      disc(15.5, 15.5, 2, white);
      break;
    case 'kevlar':
      // a shield
      for (let y = 8; y < 25; y++) {
        const w = y < 17 ? 8 : Math.max(0, 8 - (y - 17));
        rect(16 - w, y, w * 2, 1, white);
      }
      break;
    case 'quick':
      // a hand with motion lines
      rect(13, 12, 8, 10, white);
      for (const x of [13, 15, 17, 19]) rect(x, 8, 1, 4, white);
      rect(21, 15, 3, 2, white);
      for (const y of [11, 15, 19]) rect(7, y, 4, 1, white);
      break;
    case 'thirdArm':
      for (const [x, y] of [[9, 10], [15, 8], [21, 10]]) {
        rect(x, y, 3, 14, white);
        rect(x - 1, y - 2, 5, 3, white);
      }
      break;
    case 'adrenaline':
      // a heart with a pulse line
      disc(12.5, 13.5, 4, [1, 0.3, 0.3]);
      disc(19.5, 13.5, 4, [1, 0.3, 0.3]);
      for (let y = 14; y < 24; y++) {
        const w = 8 - (y - 14);
        if (w > 0) rect(16 - w, y, w * 2, 1, [1, 0.3, 0.3]);
      }
      for (let x = 6; x < 26; x++) p.set(x, x > 13 && x < 16 ? 10 + (x - 13) * 4 : x > 15 && x < 18 ? 22 - (x - 15) * 4 : 16, white, 1);
      break;
  }
  return p;
}

const PERK_COLOR = { kevlar: 0x6f8f3a, quick: 0xe0b020, thirdArm: 0x9a4cd0, adrenaline: 0xd83a2a };
const PICKUP_COLOR = { ammo: 0xffb43a, fury: 0xff3a2a, bounty: 0x7fe05a, shockwave: 0x6ac8ff };

// ---------------------------------------------------------------------------------------------
// the boundary of the open ground

/**
 * Every stretch of an area's edge, with what lies on the other side: [{ a, b, x0, z0, x1, z1 }]
 * (b: the neighbouring area's id, or null at the edge of the valley). Each shared stretch once.
 */
export function boundarySegments() {
  const out = [];
  const areaAt = (x, z) => {
    for (const a of AREAS) if (inRect(a.rect, x, z)) return a.id;
    return null;
  };
  for (const A of AREAS) {
    const r = A.rect;
    const edges = [
      [[r.minX, r.minZ], [r.maxX, r.minZ], [0, -1]],
      [[r.maxX, r.minZ], [r.maxX, r.maxZ], [1, 0]],
      [[r.maxX, r.maxZ], [r.minX, r.maxZ], [0, 1]],
      [[r.minX, r.maxZ], [r.minX, r.minZ], [-1, 0]],
    ];
    for (const [p0, p1, n] of edges) {
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const steps = Math.round(len);
      let cur = null;
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
        const b = areaAt(x + n[0] * 0.5, z + n[1] * 0.5);
        const s0 = k / steps, s1 = (k + 1) / steps;
        if (cur && cur.b === b) cur.t1 = s1;
        else {
          if (cur) out.push(cur);
          cur = { a: A.id, b, t0: s0, t1: s1, p0, p1 };
        }
      }
      if (cur) out.push(cur);
    }
  }
  const segs = [];
  for (const s of out) {
    if (s.b && s.b < s.a) continue; // (shared stretches: once)
    const x0 = s.p0[0] + (s.p1[0] - s.p0[0]) * s.t0, z0 = s.p0[1] + (s.p1[1] - s.p0[1]) * s.t0;
    const x1 = s.p0[0] + (s.p1[0] - s.p0[0]) * s.t1, z1 = s.p0[1] + (s.p1[1] - s.p0[1]) * s.t1;
    segs.push({ a: s.a, b: s.b, x0, z0, x1, z1 });
  }
  return segs;
}

// ---------------------------------------------------------------------------------------------

export class HoldoutProps {
  /** scene: the level's scene; M: the level's materials; OM: object meshes (gun models). */
  constructor(scene, M, OM) {
    this.scene = scene;
    this.M = M;
    this.OM = OM;
    this.T = createTextures();
    this.root = new THREE.Group();
    this.root.name = 'holdout';
    scene.add(this.root);
    this.mats = {};
    this.texCache = new Map();
    this.doors = new Map(); // id -> { group, planks: [Mesh], fly: null }
    this.lockers = [];
    this.perks = new Map();
    this.pickups = new Map();
    this.grenades = new Map();
    this.fences = null;
    this.segments = boundarySegments();
    this.time = 0;
    this.glowTex = this.T.glow;
    this.buildMaterials();
    this.buildStatic();
  }

  buildMaterials() {
    const T = this.T;
    this.mats.glowAdd = (color, opacity = 1) => new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mats.bulb = unlit({ color: 0xffe2a8, intensity: 2.2, vertexColors: false });
    this.mats.beam = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mats.ring = new THREE.MeshBasicMaterial({ map: T.glow, color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mats.grenade = lambert({ color: 0x3c4a2a, vertexColors: false });
    // (plain box meshes carry no vertex colours: their own plank materials)
    this.mats.plank = lambert({ map: T.greyPlanks, vertexColors: false }, { wet: 0.25 });
    this.mats.plankRed = lambert({ map: T.redPlanks, vertexColors: false }, { wet: 0.25 });
    this.mats.keepOut = unlit({ map: this.tex('keepout', () => boardTex(52, 16, 0xc8b860, [{ text: 'KEEP OUT', color: 0xa01810 }], { border: 0x201810, seed: 3 })), vertexColors: false, intensity: 0.7 });
  }

  tex(key, make) {
    let t = this.texCache.get(key);
    if (!t) {
      t = toTexture(make(), { repeat: false, mips: false });
      this.texCache.set(key, t);
    }
    return t;
  }

  /**
   * A sign: an unlit painted board (readable at night, as if lamp-lit), the same face both ways
   * (two planes back to back, so the lettering never reads mirrored). opts.alphaTest: cut out.
   */
  signMesh(key, w, h, make, intensity = 0.85, opts = {}) {
    const t = this.tex(key, make);
    const m = unlit({ map: t, vertexColors: false, intensity, alphaTest: opts.alphaTest });
    const geo = new THREE.PlaneGeometry(w, h);
    const g = new THREE.Group();
    const front = new THREE.Mesh(geo, m), back = new THREE.Mesh(geo, m);
    front.position.z = 0.006;
    back.position.z = -0.006;
    back.rotation.y = Math.PI;
    g.add(front, back);
    g.userData.material = m;
    return g;
  }

  glow(color, size, opacity = 1) {
    const s = new THREE.Sprite(this.mats.glowAdd(color, opacity));
    s.scale.set(size, size, 1);
    return s;
  }

  // -------------------------------------------------------------------------------------------
  buildStatic() {
    for (const d of DOORS) this.buildDoor(d);
    for (const l of LOCKERS) this.buildLocker(l);
    for (const p of PERKS) this.buildPerk(p);
    this.buildBench();
    this.buildCrate();
  }

  /** A barricade: two posts, planks nailed across, sandbags, the price on a board. */
  buildDoor(d) {
    const M = this.M, R = rng(d.id.length * 31 + d.pos[0] * 7);
    const yaw = d.axis === 'x' ? 0 : Math.PI / 2;
    const group = new THREE.Group();
    group.position.set(d.pos[0], 0, d.pos[1]);
    group.rotation.y = yaw;
    const bank = new Bank();
    const W = bank.b('planks');
    W.setColor(0.55, 0.5, 0.44);
    W.box(-2.15, 1.15, 0, 0.2, 2.3, 0.2, { uv: [1, 1] });
    W.box(2.15, 1.15, 0, 0.2, 2.3, 0.2, { uv: [1, 1] });
    for (let k = 0; k < 5; k++) sandbag(bank, -1.8 + k * 0.9, 0.12, 0.35, 0.6, (R() - 0.5) * 0.3);
    for (let k = 0; k < 4; k++) sandbag(bank, -1.35 + k * 0.9, 0.36, 0.35, 0.6, (R() - 0.5) * 0.3);
    for (const m of bank.meshes(M, group)) m.matrixAutoUpdate = true;
    // the planks: separate so they can be torn away
    const planks = [];
    const geo = new THREE.BoxGeometry(4.7, 0.24, 0.05);
    for (let k = 0; k < 7; k++) {
      const pm = new THREE.Mesh(geo, k % 3 === 1 ? this.mats.plankRed : this.mats.plank);
      pm.position.set((R() - 0.5) * 0.3, 0.45 + k * 0.26 + (R() - 0.5) * 0.06, (k % 2 ? 0.13 : -0.13));
      pm.rotation.z = (R() - 0.5) * 0.22;
      pm.rotation.y = (R() - 0.5) * 0.05;
      group.add(pm);
      planks.push(pm);
    }
    const price = `${d.price}`;
    // the price on a board nailed over the planks, on both faces of the barricade
    for (const side of [1, -1]) {
      const sign = this.signMesh(`door-${d.price}`, 1.2, 0.65, () => boardTex(48, 26, 0x2a2418, [{ text: 'CLEAR', color: 0xd8c890 }, { text: price, scale: 2, color: 0xffc040 }], { border: 0x100c08, seed: d.price }));
      sign.position.set(side * 0.3, 1.45, side * 0.2);
      sign.rotation.set(0, side > 0 ? 0 : Math.PI, side * 0.05);
      group.add(sign);
      planks.push(sign);
    }
    // a work lamp on the left post
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), this.mats.bulb);
    bulb.position.set(-2.15, 2.42, 0);
    const g = this.glow(0xffc070, 2.2, 0.55);
    g.position.copy(bulb.position);
    group.add(bulb, g);
    this.root.add(group);
    this.doors.set(d.id, { door: d, group, planks, fly: null, lamp: [bulb, g] });
  }

  /** A gun on a board: the real model racked, its name and price below, a lamp over it. */
  buildLocker(l) {
    const M = this.M, G = GUNS[l.gun];
    const yaw = Math.atan2(l.face[0] - l.pos[0], l.face[1] - l.pos[1]);
    const group = new THREE.Group();
    group.position.set(l.pos[0], 0, l.pos[1]);
    group.rotation.y = yaw;
    const bank = new Bank();
    const W = bank.b('planks');
    W.setColor(0.62, 0.56, 0.48);
    W.box(0, 1.35, -0.05, 1.5, 0.9, 0.06, { uv: [1, 1] });
    W.setColor(0.42, 0.38, 0.32);
    W.box(-0.68, 0.9, -0.1, 0.1, 1.8, 0.1, { uv: [1, 1] });
    W.box(0.68, 0.9, -0.1, 0.1, 1.8, 0.1, { uv: [1, 1] });
    W.box(0, 1.86, 0.05, 1.7, 0.06, 0.3, { uv: [1, 1] });
    for (const m of bank.meshes(M, group)) m.matrixAutoUpdate = true;
    let gun = null;
    try {
      gun = this.OM.createWeaponModel(l.gun);
      gun.rotation.y = Math.PI / 2; // (barrel along local -z: point it along the board)
      gun.position.set(0.05, 1.42, 0.06);
      gun.scale.setScalar(1.05);
      group.add(gun);
    } catch (e) {
      void e;
    }
    const sign = this.signMesh(`locker-${l.gun}-${l.price}`, 1.3, 0.33, () => boardTex(80, 20, 0x1a1a14, [{ text: G.name, color: 0xe8d8a0 }, { text: `${l.price}`, color: 0xffc040 }], { seed: l.price }));
    sign.position.set(0, 1.05, 0);
    group.add(sign);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), this.mats.bulb);
    bulb.position.set(0, 1.8, 0.12);
    const g = this.glow(0xffd090, 1.8, 0.5);
    g.position.set(0, 1.75, 0.16);
    group.add(bulb, g);
    this.root.add(group);
    this.lockers.push({ locker: l, group, gun });
  }

  /** A field-kit cabinet: a steel locker painted the kit's colour, its emblem lit up. */
  buildPerk(p) {
    const M = this.M, col = PERK_COLOR[p.id];
    const yaw = Math.atan2(p.face[0] - p.pos[0], p.face[1] - p.pos[1]);
    const group = new THREE.Group();
    group.position.set(p.pos[0], 0, p.pos[1]);
    group.rotation.y = yaw;
    const bank = new Bank();
    const S = bank.b('steel');
    const c = new THREE.Color(col);
    S.setColor(c.r * 0.9 + 0.1, c.g * 0.9 + 0.1, c.b * 0.9 + 0.1);
    S.box(0, 0.98, 0, 0.9, 1.96, 0.5, { uv: [1, 1] });
    S.setColor(0.25, 0.25, 0.24);
    S.box(0, 0.04, 0, 0.96, 0.08, 0.56, { uv: [1, 1] });
    for (const m of bank.meshes(M, group)) m.matrixAutoUpdate = true;
    const em = this.signMesh(`perk-${p.id}`, 0.66, 0.66, () => iconTex(p.id, col), 1.15, { alphaTest: 0.4 });
    em.position.set(0, 1.35, 0.25);
    const name = this.signMesh(`perkname-${p.id}`, 0.84, 0.24, () => boardTex(64, 18, 0x101010, [{ text: p.name.split(' ')[0], color: col }, { text: `${p.price}`, color: 0xffffff }], { seed: p.price, border: col }), 1.1);
    name.position.set(0, 0.8, 0.25);
    const top = this.glow(col, 2.6, 0.75);
    top.position.set(0, 2.15, 0);
    const front = this.glow(col, 1.6, 0.35);
    front.position.set(0, 1.3, 0.45);
    group.add(em, name, top, front);
    this.root.add(group);
    this.perks.set(p.id, { perk: p, group, top });
  }

  buildBench() {
    const M = this.M, b = BENCH;
    const group = new THREE.Group();
    group.position.set(b.pos[0], 0, b.pos[1]);
    group.rotation.y = Math.atan2(b.face[0] - b.pos[0], b.face[1] - b.pos[1]);
    const bank = new Bank();
    const W = bank.b('planks');
    W.setColor(0.6, 0.48, 0.36);
    W.box(0, 0.9, 0, 2.1, 0.08, 0.85, { uv: [1, 1] });
    W.setColor(0.4, 0.33, 0.26);
    for (const [x, z] of [[-0.95, -0.35], [0.95, -0.35], [-0.95, 0.35], [0.95, 0.35]]) W.box(x, 0.45, z, 0.09, 0.9, 0.09, { uv: [1, 1] });
    W.box(0, 0.25, 0, 1.9, 0.04, 0.7, { uv: [1, 1] });
    // pegboard
    W.setColor(0.5, 0.42, 0.3);
    W.box(0, 1.55, -0.42, 2.1, 1.2, 0.04, { uv: [1, 1] });
    const S = bank.b('steel');
    S.setColor(0.35, 0.36, 0.34);
    S.box(0.7, 1.02, 0.15, 0.22, 0.16, 0.14, { uv: [1, 1] }); // vice
    S.box(0.7, 1.13, 0.15, 0.06, 0.06, 0.34, { uv: [1, 1] });
    S.box(-0.6, 1.0, 0.1, 0.5, 0.12, 0.08, { uv: [1, 1] }); // a barrel being worked
    for (const [x, y, w, h] of [[-0.8, 1.7, 0.06, 0.4], [-0.6, 1.75, 0.3, 0.06], [-0.3, 1.6, 0.05, 0.5], [0.2, 1.7, 0.4, 0.08], [0.5, 1.5, 0.08, 0.3]]) S.box(x, y, -0.39, w, h, 0.03, { uv: [1, 1] });
    const P = bank.b('props');
    P.setColor(1, 1, 1);
    P.box(-0.2, 0.36, 0.1, 0.5, 0.18, 0.3, { atlas: { tex: PROPS_TEX, all: PROP_UV.ammoBox } });
    P.box(0.3, 1.0, 0.15, 0.36, 0.12, 0.2, { atlas: { tex: PROPS_TEX, all: PROP_UV.ammoBox } });
    for (const m of bank.meshes(M, group)) m.matrixAutoUpdate = true;
    const sign = this.signMesh('bench', 1.3, 0.4, () => boardTex(56, 18, 0x222a30, [{ text: 'GUNSMITH', color: 0x8fd0ff }, { text: `${b.price}`, color: 0xffffff }], { seed: 5, border: 0x8fd0ff }), 1.0);
    sign.position.set(0, 2.32, -0.4);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), this.mats.bulb);
    bulb.position.set(0, 2.05, 0);
    const g = this.glow(0xbfe4ff, 3, 0.6);
    g.position.set(0, 2.0, 0);
    group.add(sign, bulb, g);
    this.root.add(group);
    this.bench = { group, glow: g };
  }

  /** The supply crate: a stencilled box with a lid, a lantern and a beacon of light over it. */
  buildCrate() {
    const group = new THREE.Group();
    const crateTex = this.tex('crate', () => {
      const p = boardTex(64, 32, 0x3e4a2a, [{ text: 'SUPPLY', scale: 1, color: 0xe0c040 }, { text: 'CRATE', color: 0xe0c040 }], { planks: true, seed: 21, jitter: 1 });
      return p;
    });
    const mat = lambert({ map: crateTex, vertexColors: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 0.7), mat);
    body.position.y = 0.31;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.62, -0.35);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 0.74), mat);
    lid.position.set(0, 0.04, 0.35);
    lidPivot.add(lid);
    const glowIn = this.glow(0xfff0b0, 1.6, 0);
    glowIn.position.set(0, 0.75, 0);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 40, 10, 1, true), this.mats.beam);
    beam.position.y = 20;
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), this.mats.bulb);
    lantern.position.set(0.5, 0.74, 0.2);
    const lg = this.glow(0xffc060, 1.5, 0.6);
    lg.position.copy(lantern.position);
    const show = new THREE.Group(); // the guns spinning up out of it
    show.position.y = 0.9;
    group.add(body, lidPivot, glowIn, beam, lantern, lg, show);
    this.root.add(group);
    this.crate = { group, lidPivot, glowIn, beam, show, models: {}, cur: null, state: 'idle', t: 0, swap: 0, lift: 0, gun: null, spot: null };
  }

  crateModel(type) {
    const C = this.crate;
    if (!C.models[type]) {
      try {
        const m = this.OM.createWeaponModel(type);
        m.rotation.y = Math.PI / 2;
        m.scale.setScalar(1.15);
        m.visible = false;
        C.show.add(m);
        C.models[type] = m;
      } catch (e) {
        C.models[type] = new THREE.Group();
      }
    }
    return C.models[type];
  }

  showCrateGun(type) {
    const C = this.crate;
    if (C.cur) C.cur.visible = false;
    C.cur = type ? this.crateModel(type) : null;
    if (C.cur) C.cur.visible = true;
  }

  placeCrate(spot) {
    const C = this.crate;
    C.spot = spot;
    if (!spot) {
      C.group.visible = false;
      return;
    }
    C.group.visible = true;
    C.group.position.set(spot.pos[0], 0, spot.pos[1]);
    const area = areaById(spot.area);
    C.group.rotation.y = Math.atan2((area.rect.minX + area.rect.maxX) / 2 - spot.pos[0], (area.rect.minZ + area.rect.maxZ) / 2 - spot.pos[1]);
  }

  // -------------------------------------------------------------------------------------------
  /** Fencing along every stretch of the edge between open ground and closed (gaps at barricades). */
  rebuildFences(open, doorsOpen) {
    if (this.fences) {
      this.root.remove(this.fences);
      this.fences.traverse((o) => o.geometry && o.geometry.dispose());
    }
    const group = new THREE.Group();
    const bank = new Bank();
    const Ch = bank.b('chain');
    Ch.setColor(1, 1, 1);
    const S = bank.b('steel');
    S.setColor(0.6, 0.58, 0.52);
    const H = 2.4;
    const signs = [];
    const doorGaps = DOORS.filter((d) => !doorsOpen.has(d.id)).map((d) => ({ x: d.pos[0], z: d.pos[1], axis: d.axis }));
    for (const s of this.segments) {
      const aOpen = open.has(s.a), bOpen = s.b ? open.has(s.b) : false;
      if (!(aOpen || bOpen) || (aOpen && bOpen)) continue;
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const ux = (s.x1 - s.x0) / len, uz = (s.z1 - s.z0) / len;
      // the open side's normal (for the posts' outriggers)
      // cut out a gap where a barricade stands on this line
      let spans = [[0, len]];
      for (const g of doorGaps) {
        const onLine = Math.abs((g.x - s.x0) * uz - (g.z - s.z0) * ux) < 0.3;
        if (!onLine) continue;
        const t = (g.x - s.x0) * ux + (g.z - s.z0) * uz;
        if (t < -2.5 || t > len + 2.5) continue;
        const next = [];
        for (const [a, b] of spans) {
          if (t + 2.25 <= a || t - 2.25 >= b) next.push([a, b]);
          else {
            if (t - 2.25 > a) next.push([a, t - 2.25]);
            if (t + 2.25 < b) next.push([t + 2.25, b]);
          }
        }
        spans = next;
      }
      for (const [a, b] of spans) {
        if (b - a < 0.3) continue;
        const x0 = s.x0 + ux * a, z0 = s.z0 + uz * a, x1 = s.x0 + ux * b, z1 = s.z0 + uz * b;
        const L = b - a;
        Ch.quad([x0, 0.05, z0], [x1, 0.05, z1], [x1, H, z1], [x0, H, z0], [0, 0], [L / 0.5, 0], [L / 0.5, H / 0.5], [0, H / 0.5], [uz, 0, -ux]);
        S.beam([x0, H, z0], [x1, H, z1], 0.05);
        const n = Math.max(1, Math.round(L / 3));
        for (let k = 0; k <= n; k++) {
          const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
          S.cyl(x, 0, z, 0.05, H + 0.15, { seg: 5, caps: 'top', uv: [1, 1] });
          if (k % 6 === 3) signs.push([x, z, ux, uz]);
        }
      }
    }
    for (const m of bank.meshes(this.M, group)) m.matrixAutoUpdate = true;
    // KEEP OUT boards
    if (signs.length) {
      // (both faces, back to back: the lettering reads right from either side)
      const geo = new THREE.PlaneGeometry(1.1, 0.36);
      const inst = new THREE.InstancedMesh(geo, this.mats.keepOut, signs.length * 2);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
      signs.forEach(([x, z, ux, uz], i) => {
        for (const side of [0, 1]) {
          const th = Math.atan2(-uz, ux) + side * Math.PI;
          e.set(0, th, 0);
          q.setFromEuler(e);
          const nx = Math.sin(th) * 0.03, nz = Math.cos(th) * 0.03;
          m4.compose(new THREE.Vector3(x + ux * 1.4 + nx, 1.35, z + uz * 1.4 + nz), q, one);
          inst.setMatrixAt(i * 2 + side, m4);
        }
      });
      group.add(inst);
    }
    this.fences = group;
    this.root.add(group);
  }

  // -------------------------------------------------------------------------------------------
  /** Bring the props in line with a new run of the game. */
  reset(game) {
    for (const [, d] of this.doors) {
      d.group.visible = true;
      d.fly = null;
      for (const p of d.planks) {
        p.visible = true;
        if (p.userData.home) {
          p.position.copy(p.userData.home.p);
          p.rotation.copy(p.userData.home.r);
        }
      }
      for (const o of d.lamp) o.visible = true;
    }
    for (const [, p] of this.perks) p.top.material.opacity = 0.75;
    for (const p of this.pickups.values()) this.root.remove(p.group);
    this.pickups.clear();
    for (const g of this.grenades.values()) this.root.remove(g);
    this.grenades.clear();
    const C = this.crate;
    C.state = 'idle';
    C.t = 0;
    this.showCrateGun(null);
    C.lidPivot.rotation.x = 0;
    C.group.position.y = 0;
    this.placeCrate(game.crate.spot);
    this.rebuildFences(game.open, game.doorsOpen);
  }

  /** Game events that change the props. */
  onEvent(e, game) {
    switch (e.type) {
      case 'doorOpened': {
        const d = this.doors.get(e.door.id);
        if (d && !d.fly) {
          d.fly = { t: 0, v: d.planks.map(() => ({ vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), rx: (Math.random() - 0.5) * 9, rz: (Math.random() - 0.5) * 9 })) };
          for (const p of d.planks) p.userData.home = p.userData.home || { p: p.position.clone(), r: p.rotation.clone() };
        }
        this.rebuildFences(game.open, game.doorsOpen);
        break;
      }
      case 'crate':
        this.crateEvent(e);
        break;
      case 'perk': {
        const p = this.perks.get(e.id);
        if (p) p.top.material.opacity = 0.15;
        break;
      }
      case 'pickupDrop':
        this.addPickup(e.pickup);
        break;
      case 'pickup':
      case 'pickupGone': {
        const p = this.pickups.get(e.pickup.id);
        if (p) {
          this.root.remove(p.group);
          this.pickups.delete(e.pickup.id);
        }
        break;
      }
      case 'grenadeThrow': {
        const m = new THREE.Mesh(this.grenadeGeo || (this.grenadeGeo = new THREE.IcosahedronGeometry(0.05, 0)), this.mats.grenade);
        m.scale.set(1, 1.3, 1);
        m.userData.g = e.grenade;
        this.grenades.set(e.grenade.id, m);
        this.root.add(m);
        break;
      }
      case 'explosion':
        for (const [id, m] of this.grenades) {
          if (m.userData.g.t >= m.userData.g.fuse - 1e-6) {
            this.root.remove(m);
            this.grenades.delete(id);
          }
        }
        break;
    }
  }

  crateEvent(e) {
    const C = this.crate;
    C.state = e.state;
    C.t = 0;
    if (e.state === 'rolling') {
      C.gun = e.gun;
      C.swap = 0;
    } else if (e.state === 'offer') this.showCrateGun(e.gun);
    else if (e.state === 'taken' || e.state === 'expired') this.showCrateGun(null);
    else if (e.state === 'leaving') this.showCrateGun(null);
    else if (e.state === 'arrived') {
      this.placeCrate(e.spot);
      C.group.position.y = 0;
      C.lidPivot.rotation.x = 0;
    }
  }

  addPickup(p) {
    const col = PICKUP_COLOR[p.kind];
    const group = new THREE.Group();
    group.position.set(p.pos.x, 0, p.pos.z);
    const icon = this.signMesh(`pickup-${p.kind}`, 0.62, 0.62, () => iconTex(p.kind, col), 1.4, { alphaTest: 0.4 });
    icon.position.y = 0.9;
    const halo = this.glow(col, 2.2, 0.8);
    halo.position.y = 0.9;
    const ring = new THREE.Mesh(this.ringGeo || (this.ringGeo = new THREE.PlaneGeometry(2.2, 2.2)), this.mats.ring.clone());
    ring.material.color.set(col);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(icon, halo, ring);
    this.root.add(group);
    this.pickups.set(p.id, { p, group, icon, halo, ring });
  }

  // -------------------------------------------------------------------------------------------
  update(dt, game, camera) {
    this.time += dt;
    const t = this.time;
    // barricades torn down: planks fly, then the lot goes
    for (const [, d] of this.doors) {
      if (!d.fly) continue;
      const F = d.fly;
      F.t += dt;
      d.planks.forEach((p, i) => {
        const v = F.v[i];
        v.vy -= 9.8 * dt;
        p.position.x += v.vx * dt;
        p.position.y = Math.max(0.05, p.position.y + v.vy * dt);
        p.position.z += v.vz * dt;
        p.rotation.x += v.rx * dt;
        p.rotation.z += v.rz * dt;
        if (p.position.y <= 0.05) {
          v.vx *= 0.8;
          v.vz *= 0.8;
          v.rx *= 0.7;
          v.rz *= 0.7;
          v.vy = Math.abs(v.vy) * 0.25;
        }
      });
      if (F.t > 2.5) {
        for (const p of d.planks) p.visible = false;
        for (const o of d.lamp) o.visible = false;
      }
    }
    // perk lights pulse
    for (const [id, p] of this.perks) {
      if (game.perks.has(id)) continue;
      p.top.material.opacity = 0.6 + 0.2 * Math.sin(t * 2.2 + id.length);
    }
    // the crate
    const C = this.crate;
    C.t += dt;
    const lidTarget = C.state === 'rolling' || C.state === 'offer' ? -1.9 : 0;
    C.lidPivot.rotation.x += (lidTarget - C.lidPivot.rotation.x) * Math.min(1, dt * 6);
    C.beam.material.opacity = 0.1 + 0.05 * Math.sin(t * 1.3) + (C.state === 'rolling' ? 0.12 : 0);
    C.glowIn.material.opacity = C.state === 'rolling' || C.state === 'offer' ? 0.9 : Math.max(0, C.glowIn.material.opacity - dt * 2);
    if (C.state === 'rolling') {
      // the guns flick past, slowing down
      C.swap -= dt;
      if (C.swap <= 0) {
        const pool = Object.keys(GUNS);
        this.showCrateGun(pool[Math.floor(Math.random() * pool.length)]);
        C.swap = 0.06 + 0.3 * Math.pow(C.t / 3.6, 2.2);
      }
      C.show.position.y = 0.75 + Math.min(1, C.t / 1.2) * 0.55;
      C.show.rotation.y += dt * 2;
    } else if (C.state === 'offer') {
      // the gun hangs there, sinking back into the crate as the offer runs out
      C.show.position.y = 1.3 - Math.max(0, C.t - 2) * 0.07;
      C.show.rotation.y += dt * 0.9;
    } else if (C.state === 'leaving') {
      C.group.position.y += dt * (C.t < 1 ? 0.3 : 6 * C.t);
      C.group.rotation.y += dt * C.t * 3;
      if (C.t > 3.5) C.group.visible = false;
    }
    // pickups bob, spin, and blink out at the end
    for (const [, P] of this.pickups) {
      const p = P.p;
      P.icon.position.y = 0.9 + 0.12 * Math.sin(t * 2.4 + p.id);
      P.icon.rotation.y += dt * 2.2;
      P.halo.position.y = P.icon.position.y;
      const left = p.life - p.t;
      P.group.visible = left > 5 || Math.sin(t * (left > 2 ? 10 : 22)) > -0.2;
      P.ring.material.opacity = 0.5 + 0.2 * Math.sin(t * 3);
    }
    // grenades in flight
    for (const [, m] of this.grenades) {
      const g = m.userData.g;
      m.position.set(g.pos.x, g.pos.y, g.pos.z);
      m.rotation.x += g.spin.x * dt;
      m.rotation.y += g.spin.y * dt;
      m.rotation.z += g.spin.z * dt;
    }
    void camera;
  }

  dispose() {
    this.scene.remove(this.root);
  }

  setVisible(on) {
    this.root.visible = on;
  }
}
