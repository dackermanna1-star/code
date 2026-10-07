// Loot in the world. Every loot spot (a shelf, a table, a locker, the floor
// by a bed) rolls its table when you come near - the same roll every time
// until you take what's there; then it's empty until it restocks, half an hour
// or so later. Items lying about are small models: tins, bottles, boxes of
// rounds, folded clothes, guns (the real models), axes. Things you drop stay
// where you dropped them. Bodies carry what they had on them.
import * as THREE from 'three';
import { O } from '../state.js';
import { ITEMS, rollLoot } from './items.js';
import { makeItem, def } from './inventory.js';
import { rng, hashStr } from '../noise.js';
import { buildGun } from '../../warzone/guns.js';

const STUD = 1 / 0.33; // studs per metre for the gun models
const RESPAWN = 1800; // seconds before a looted spot restocks

// --- item models ------------------------------------------------------------------------------------------------------------
const G = {}, M = {};
const geo = (k, fn) => G[k] || (G[k] = fn());
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); return M[k] || (M[k] = new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0 })); };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };

/** A small 3D model of an item, its base at y = 0. */
export function itemModel(it) {
  const d = def(it), g = new THREE.Group(), col = it.tint || d.color || '#888888';
  const s = 1.35;
  switch (d.shape) {
    case 'can': case 'soda': {
      const h = d.shape === 'soda' ? 0.42 : 0.5, r = d.shape === 'soda' ? 0.12 : 0.16;
      g.add(mesh(geo('can' + h, () => new THREE.CylinderGeometry(r * s, r * s, h * s, 12)), mat(col, { r: 0.4, m: 0.3 }), 0, h * s / 2));
      g.add(mesh(geo('canTop' + h, () => new THREE.CylinderGeometry(r * s * 0.98, r * s * 0.98, 0.02, 12)), mat('#b8bcc0', { r: 0.3, m: 0.8 }), 0, h * s + 0.01));
      break;
    }
    case 'tin': g.add(mesh(geo('tin', () => new THREE.BoxGeometry(0.42 * s, 0.13 * s, 0.28 * s)), mat(col, { r: 0.4, m: 0.4 }), 0, 0.065 * s)); break;
    case 'bottle': case 'jar': case 'spray': {
      const h = d.shape === 'jar' ? 0.42 : 0.7, r = d.shape === 'jar' ? 0.18 : 0.13;
      g.add(mesh(geo('btl' + d.shape, () => new THREE.CylinderGeometry(r * s, r * s, h * s, 10)), mat(col, { r: 0.15 }), 0, h * s / 2));
      g.add(mesh(geo('neck' + d.shape, () => new THREE.CylinderGeometry(0.05 * s, r * 0.7 * s, 0.18 * s, 8)), mat(col, { r: 0.15 }), 0, h * s + 0.09 * s));
      break;
    }
    case 'canteen': g.add(mesh(geo('canteen', () => new THREE.CylinderGeometry(0.28 * s, 0.28 * s, 0.14 * s, 12).rotateX(Math.PI / 2)), mat(col), 0, 0.3 * s)); break;
    case 'fruit': g.add(mesh(geo('fruit', () => new THREE.SphereGeometry(0.14 * s, 10, 8)), mat(col, { r: 0.5 }), 0, 0.14 * s)); break;
    case 'roll': case 'rag': g.add(mesh(geo('roll', () => new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.2 * s, 10).rotateZ(Math.PI / 2)), mat(col, { r: 0.9 }), 0, 0.12 * s)); break;
    case 'pills': case 'battery': case 'injector': g.add(mesh(geo('pills', () => new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.2 * s, 8)), mat(col, { r: 0.4 }), 0, 0.1 * s)); break;
    case 'medkit': {
      g.add(mesh(geo('medkit', () => new THREE.BoxGeometry(0.6 * s, 0.25 * s, 0.42 * s)), mat('#d8302a', { r: 0.5 }), 0, 0.125 * s));
      g.add(mesh(geo('cross1', () => new THREE.BoxGeometry(0.28 * s, 0.01, 0.08 * s)), mat('#ffffff'), 0, 0.255 * s));
      g.add(mesh(geo('cross2', () => new THREE.BoxGeometry(0.08 * s, 0.01, 0.28 * s)), mat('#ffffff'), 0, 0.256 * s));
      break;
    }
    case 'ammobox': case 'ammocan': g.add(mesh(geo('ammo' + d.shape, () => (d.shape === 'ammocan' ? new THREE.BoxGeometry(0.5 * s, 0.35 * s, 0.22 * s) : new THREE.BoxGeometry(0.3 * s, 0.18 * s, 0.2 * s))), mat(col, { r: 0.6 }), 0, (d.shape === 'ammocan' ? 0.175 : 0.09) * s)); break;
    case 'mag': case 'magCurved': g.add(mesh(geo('mag' + d.h, () => new THREE.BoxGeometry(0.1 * s, 0.32 * s * d.h * 0.6, 0.2 * s).rotateZ(Math.PI / 2)), mat(col, { r: 0.5, m: 0.3 }), 0, 0.05 * s)); break;
    case 'shirt': case 'coat': case 'pants': case 'vest': {
      const k = d.shape === 'vest' ? 0.16 : 0.12;
      g.add(mesh(geo('cloth' + d.shape, () => new THREE.BoxGeometry(0.9 * s, k * s, 0.7 * s)), mat(col, { r: 0.95 }), 0, k * s / 2));
      if (d.camo) g.add(mesh(geo('clothcamo', () => new THREE.BoxGeometry(0.5 * s, 0.01, 0.4 * s)), mat('#3a3a2a', { r: 1 }), 0.1, k * s + 0.005, 0.05));
      break;
    }
    case 'beanie': case 'cap': case 'ushanka': case 'helmet': case 'headtorch':
      g.add(mesh(geo('hat' + d.shape, () => new THREE.SphereGeometry(0.32 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat(col, { r: d.shape === 'helmet' ? 0.6 : 0.95 }), 0, 0));
      break;
    case 'pack': {
      g.add(mesh(geo('pack', () => new THREE.BoxGeometry(0.8 * s, 1.0 * s, 0.45 * s)), mat(col, { r: 0.9 }), 0, 0.5 * s));
      g.add(mesh(geo('packTop', () => new THREE.BoxGeometry(0.7 * s, 0.25 * s, 0.4 * s)), mat(col, { r: 0.9 }), 0, 1.1 * s));
      g.rotation.x = -1.2;
      break;
    }
    case 'knife': case 'machete': case 'screwdriver': {
      const L = d.shape === 'machete' ? 1.3 : d.shape === 'screwdriver' ? 0.45 : 0.55;
      g.add(mesh(geo('blade' + d.shape, () => new THREE.BoxGeometry(L * s, 0.02, 0.09 * s)), mat('#c8ccd0', { r: 0.25, m: 0.9 }), L * s / 2, 0.03));
      g.add(mesh(geo('handle' + d.shape, () => new THREE.BoxGeometry(0.32 * s, 0.07 * s, 0.07 * s)), mat(d.shape === 'screwdriver' ? '#d8a828' : '#3a2a1a'), -0.16 * s, 0.04));
      break;
    }
    case 'pipe': case 'bat': case 'crowbar': {
      const L = d.shape === 'bat' ? 2.4 : 1.9;
      g.add(mesh(geo('stick' + d.shape, () => new THREE.CylinderGeometry(d.shape === 'bat' ? 0.09 : 0.06, d.shape === 'bat' ? 0.05 : 0.06, L * s, 8).rotateZ(Math.PI / 2)), mat(col, { r: d.shape === 'bat' ? 0.6 : 0.4, m: d.shape === 'bat' ? 0 : 0.7 }), 0, 0.08));
      if (d.shape === 'crowbar') g.add(mesh(geo('crowHook', () => new THREE.BoxGeometry(0.06, 0.06, 0.35)), mat(col, { m: 0.7 }), L * s / 2, 0.08, 0.15));
      break;
    }
    case 'hatchet': case 'axe': case 'sledge': case 'shovel': {
      const L = d.shape === 'hatchet' ? 1.2 : 2.6;
      g.add(mesh(geo('haft' + d.shape, () => new THREE.CylinderGeometry(0.05, 0.05, L * s, 8).rotateZ(Math.PI / 2)), mat('#8a6a4a'), 0, 0.06));
      const head = d.shape === 'shovel' ? new THREE.BoxGeometry(0.5, 0.04, 0.42) : d.shape === 'sledge' ? new THREE.BoxGeometry(0.3, 0.25, 0.6) : new THREE.BoxGeometry(0.3, 0.06, 0.5);
      g.add(mesh(geo('axehead' + d.shape, () => head), mat(d.shape === 'axe' ? '#c8302a' : '#6a6e72', { m: 0.6, r: 0.4 }), L * s / 2, 0.08, d.shape === 'shovel' ? 0 : 0.15));
      break;
    }
    case 'torch': case 'flare': case 'tube': g.add(mesh(geo('torch' + d.shape, () => new THREE.CylinderGeometry(0.08 * s, 0.06 * s, 0.5 * s, 8).rotateZ(Math.PI / 2)), mat(col, { r: 0.4, m: 0.4 }), 0, 0.08 * s)); break;
    case 'optic': case 'scope': g.add(mesh(geo('optic' + d.shape, () => new THREE.CylinderGeometry(0.07 * s, 0.07 * s, (d.shape === 'scope' ? 0.5 : 0.25) * s, 10).rotateZ(Math.PI / 2)), mat(col, { r: 0.3, m: 0.6 }), 0, 0.1 * s)); break;
    case 'book': case 'mapitem': case 'tape': case 'opener': case 'compass': case 'binoculars': case 'radio': case 'grip': case 'splint': case 'ivbag': case 'pouch': case 'bag': case 'box': case 'bar': case 'loaf': default: {
      const w = Math.min(1.2, 0.2 + d.w * 0.2) * s, h = Math.min(0.5, 0.1 + d.h * 0.08) * s, dd = Math.min(1.0, 0.18 + d.h * 0.16) * s;
      g.add(mesh(geo('box' + d.w + 'x' + d.h, () => new THREE.BoxGeometry(w, h, dd)), mat(col, { r: 0.75 }), 0, h / 2));
    }
  }
  if (d.gun) {
    g.clear();
    try {
      const atts = Object.values(it.attach || {}).filter(Boolean);
      const info = buildGun(d.gun, atts);
      const m = info.group;
      m.scale.setScalar(STUD);
      m.rotation.set(0, 0, Math.PI / 2); // lying on its side
      m.position.y = 0.08;
      if (d.tint) m.traverse((o) => { if (o.isMesh && o.material?.color && o.material.metalness > 0.5) { o.material = o.material.clone(); o.material.color.setHex(d.tint); } });
      g.add(m);
    } catch (e) { g.add(mesh(geo('gunfallback', () => new THREE.BoxGeometry(2, 0.3, 0.2)), mat('#2a2a2a'))); }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// --- the loot about the place ------------------------------------------------------------------------------------------------
export class Loot {
  constructor(world) {
    this.world = world;
    this.spots = new Map(); // key -> spot
    this.grid = new Map(); // 64-stud cells -> spots
    this.taken = {}; // key -> time it was emptied
    this.gen = {}; // key -> how many times it has restocked
    this.picked = {}; // key -> which of its rolls have been taken (a part-looted spot keeps the rest)
    this.items = []; // world items: { it, x, y, z, yaw, mesh, spot, r }
    this.dropped = []; // items people left (saved)
    this.t = 0; // game seconds (for restocking)
    this._scan = 0;
  }
  _cell(x, z) { return Math.floor(x / 64) * 100003 + Math.floor(z / 64); }
  addSpot(s) {
    if (this.spots.has(s.key)) return;
    this.spots.set(s.key, s);
    const k = this._cell(s.x, s.z);
    let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(s);
  }
  removeSpot(s) {
    const S = this.spots.get(s.key); if (!S) return;
    this.despawn(S);
    this.spots.delete(s.key);
    const l = this.grid.get(this._cell(S.x, S.z)); if (l) { const i = l.indexOf(S); if (i >= 0) l.splice(i, 1); }
  }
  /** Spots near a point. */
  spotsNear(x, z, R, fn) {
    for (let i = Math.floor((x - R) / 64); i <= Math.floor((x + R) / 64); i++) for (let j = Math.floor((z - R) / 64); j <= Math.floor((z + R) / 64); j++) {
      const l = this.grid.get(i * 100003 + j); if (!l) continue;
      for (const s of l) if (Math.abs(s.x - x) < R && Math.abs(s.z - z) < R) fn(s);
    }
  }
  /** Fill a spot (if it isn't empty from being looted). */
  spawn(s) {
    if (s.spawned) return;
    s.spawned = true; s.live = [];
    const tk = this.taken[s.key];
    if (tk !== undefined) {
      if (this.t - tk < RESPAWN) return;
      delete this.taken[s.key]; delete this.picked[s.key]; this.gen[s.key] = (this.gen[s.key] || 0) + 1;
    }
    const r = rng(hashStr(s.key) + (this.gen[s.key] || 0) * 7919 + 1);
    const n = s.n ?? (r() < 0.12 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      let id = rollLoot(s.cat, r);
      if (!id && O.lootBoost && r() < O.lootBoost) id = rollLoot(s.cat, r);
      if (!id) continue;
      const it = makeItem(id, { cond: rollCond(r, s.cat) });
      // guns from a good place come with something to shoot
      const d = def(it);
      if (d.gun && d.mag && r() < 0.6) it.mag = makeItem(d.mag, { n: Math.floor(ITEMS[d.mag].cap * r() * 0.8) });
      if (d.gun && d.internal && r() < 0.5) it.rounds = Math.floor(d.internal * r());
      const sp = s.spread ?? 0.8;
      const a = r() * Math.PI * 2, rr = r() * sp, yaw = r() * Math.PI * 2;
      if (this.picked[s.key]?.includes(i)) continue; // taken already (after all the rolls, so the rest stay the same)
      const w = this._place(it, s.x + Math.cos(a) * rr, s.y, s.z + Math.sin(a) * rr, yaw, s);
      w.idx = i;
    }
  }
  despawn(s) {
    if (!s.spawned) return;
    for (const w of s.live || []) this._remove(w);
    s.live = []; s.spawned = false;
  }
  _place(it, x, y, z, yaw, spot = null) {
    const m = itemModel(it);
    m.position.set(x, y + 0.02, z); m.rotation.y = yaw;
    this.world.scene.add(m);
    const d = def(it);
    const w = { it, x, y, z, yaw, mesh: m, spot, r: Math.max(0.5, Math.min(1.6, (d.w + d.h) * 0.22)) };
    this.items.push(w);
    if (spot) spot.live.push(w);
    return w;
  }
  _remove(w) {
    this.world.scene.remove(w.mesh);
    const i = this.items.indexOf(w); if (i >= 0) this.items.splice(i, 1);
  }
  /** Take an item off the ground (it's yours now). */
  take(w) {
    this._remove(w);
    if (w.spot) {
      const l = w.spot.live; l.splice(l.indexOf(w), 1);
      (this.picked[w.spot.key] ||= []).push(w.idx);
      if (!l.length) this.taken[w.spot.key] = this.t;
    }
    const di = this.dropped.indexOf(w); if (di >= 0) this.dropped.splice(di, 1);
    return w.it;
  }
  /** Leave an item on the ground near (x, y, z). */
  drop(it, x, y, z) {
    const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const gy = O.phys.groundAt(px, y + 2, pz, 0.3, 3);
    const w = this._place(it, px, gy, pz, Math.random() * Math.PI * 2, null);
    this.dropped.push(w);
    if (this.dropped.length > 260) { const old = this.dropped.shift(); this._remove(old); }
    return w;
  }
  /** Items within r of a point. */
  near(p, r) { const out = []; for (const w of this.items) if (Math.abs(w.x - p.x) < r && Math.abs(w.z - p.z) < r && Math.abs(w.y - p.y) < r + 4) out.push(w); return out; }

  update(dt, pos) {
    this.t += dt;
    this._scan -= dt;
    if (this._scan > 0) return;
    this._scan = 0.5;
    // fill spots near you, empty the ones far away
    const R = 75;
    this.spotsNear(pos.x, pos.z, R, (s) => { if (!s.spawned && Math.abs(s.y - pos.y) < 60) this.spawn(s); });
    for (const s of this.spots.values()) if (s.spawned && (Math.abs(s.x - pos.x) > R + 40 || Math.abs(s.z - pos.z) > R + 40)) this.despawn(s);
  }
  save() { return { taken: this.taken, gen: this.gen, picked: this.picked, t: this.t, dropped: this.dropped.map((w) => ({ x: +w.x.toFixed(2), y: +w.y.toFixed(2), z: +w.z.toFixed(2), it: serItem(w.it) })) }; }
  load(o, deser) {
    if (!o) return;
    this.taken = o.taken || {}; this.gen = o.gen || {}; this.picked = o.picked || {}; this.t = o.t || 0;
    for (const d of o.dropped || []) { const it = deser(d.it); if (it) this.dropped.push(this._place(it, d.x, d.y, d.z, Math.random() * 6.28, null)); }
  }
}

function rollCond(r, cat) {
  const x = r();
  const good = cat === 'bunker' || cat === 'crash' ? 0.35 : 0;
  return Math.min(1, x < 0.15 - good ? 0.12 + r() * 0.2 : x < 0.45 - good ? 0.32 + r() * 0.2 : x < 0.8 ? 0.55 + r() * 0.2 : 0.75 + r() * 0.25);
}

/** Plain data for an item (and what's in it). */
export function serItem(it) {
  if (!it) return null;
  return { id: it.id, n: it.n, cond: +it.cond.toFixed(3), tint: it.tint, attach: it.attach, chamber: it.chamber, rounds: it.rounds, mag: it.mag ? serItem(it.mag) : null, on: it.on, charge: it.charge, dirty: it.dirty, jammed: it.jammed || undefined, grid: it.grid ? it.grid.items.map((c) => ({ ...serItem(c), x: c.x, y: c.y, rot: c.rot })) : undefined };
}
export function deserItem(o) {
  if (!o || !ITEMS[o.id]) return null;
  const it = makeItem(o.id, { n: o.n, cond: o.cond, tint: o.tint, attach: o.attach, chamber: o.chamber, rounds: o.rounds, charge: o.charge });
  if (o.mag) it.mag = deserItem(o.mag);
  it.on = !!o.on; it.dirty = !!o.dirty; it.jammed = !!o.jammed;
  if (o.grid && it.grid) for (const c of o.grid) { const ci = deserItem(c); if (ci && it.grid.fits(ci, c.x | 0, c.y | 0, !!c.rot)) it.grid.put(ci, c.x | 0, c.y | 0, !!c.rot); }
  return it;
}
