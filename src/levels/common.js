// Shared level-construction helpers.
import * as THREE from 'three';
import { prop, PROPS } from './props.js';
import { SURF } from '../engine/collision.js';
import { mulberry32 } from '../engine/textures.js';

const warned = new Set();
/** Place a prop; missing props degrade to a neutral box (and warn once). */
export function P(L, name, x, y, z, rot = 0, opts = {}) {
  if (PROPS[name]) {
    try { return prop(L, name, x, y, z, rot, opts); } catch (e) { if (!warned.has(name)) { warned.add(name); console.warn('prop failed', name, e); } }
  } else if (!warned.has(name)) { warned.add(name); console.warn('missing prop', name); }
  L.push([x, y, z], rot); L.box([-0.4, 0, -0.4], [0.4, 0.8, 0.4], 'woodDark'); L.pop();
  return { topY: y + 0.8 };
}

/** Wall segment; openings: [{at, w, h, y0}] measured from (x0,z0). Front (mat) faces left of travel (for +x travel: -z). */
export function wallSeg(L, x0, z0, x1, z1, y, h, mat, mat2, openings = [], opts = {}) {
  L.wall(x0, z0, x1, z1, y, y + h, mat, { thick: opts.exterior ? 0.3 : 0.16, mat2, openings, caps: opts.caps, top: opts.top, trim: opts.trim });
}

/**
 * Furnished hotel guest room. Sides: n = z0 (min z), s = z1, w = x0, e = x1.
 * The door-side wall is NOT built (the corridor builds it). The window side is the exterior facade.
 * r: {x0,z0,x1,z1,y, door, window, number, seed, items:[], trashed, barricade, soot, burning, suite}
 */
export function hotelRoom(L, r) {
  const { x0, z0, x1, z1, y } = r;
  const H = r.h || 3.0;
  const rnd = mulberry32(r.seed || 1);
  const floorMat = r.soot ? 'sootCarpet' : (['carpetGreen', 'carpetRed', 'carpetBlue', 'carpetBrown'][(r.seed || 0) % 4]);
  const wallMat = r.soot ? 'sootPaper' : 'roomPaper';
  L.floor(x0, z0, x1, z1, y, floorMat);
  L.ceiling(x0, z0, x1, z1, y + H, 'ceiling');
  const inset = 0.08;
  const sides = {
    n: [x1, z0 + inset, x0, z0 + inset], s: [x0, z1 - inset, x1, z1 - inset],
    w: [x0 + inset, z0, x0 + inset, z1], e: [x1 - inset, z1, x1 - inset, z0],
  };
  for (const k of ['n', 's', 'e', 'w']) {
    if (k === r.door) continue;
    const [a, b, c, d] = sides[k];
    if (k === r.window) {
      // exterior wall: front faces outward; use facade outside, wallpaper inside
      const len = Math.hypot(c - a, d - b);
      const op = r.noWindow ? [] : [{ at: len / 2, w: 1.6, h: 1.5, y0: 0.9 }];
      // walls built with direction so that the front faces outward
      L.wall(a, b, c, d, y, y + H, wallMat, { thick: 0.16, mat2: 'facade', openings: op, caps: false });
      if (!r.noWindow) {
        const mx = (a + c) / 2, mz = (b + d) / 2;
        const along = new THREE.Vector3(c - a, 0, d - b).normalize();
        const p0 = new THREE.Vector3(mx, y + 0.9, mz).addScaledVector(along, -0.8), p1 = new THREE.Vector3(mx, y + 0.9, mz).addScaledVector(along, 0.8);
        L.quad(p0, p1, p1.clone().setY(y + 2.4), p0.clone().setY(y + 2.4), 'glass', { bullet: false, subdivide: false, uvMode: 'local', uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
        L.quad(p1, p0, p0.clone().setY(y + 2.4), p1.clone().setY(y + 2.4), 'glass', { bullet: false, collide: false, subdivide: false, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
      }
    } else {
      L.wall(a, b, c, d, y, y + H, wallMat, { thick: 0.16, mat2: wallMat, caps: false });
    }
  }
  // furniture: bed against the wall to the right of the window (or a side wall)
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  // orient room so that "back" = window side
  const facing = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[r.window || 'n'];
  // local frame: +z points from window into the room
  const toWorld = (lx, lz) => { const c = Math.cos(facing), s = Math.sin(facing); return [cx + lx * c + lz * s, cz - lx * s + lz * c]; };
  const rw = (r.window === 'n' || r.window === 's') ? w : d; // width along window wall
  const rd = (r.window === 'n' || r.window === 's') ? d : w; // depth
  const bedX = -rw / 2 + 1.25 + rnd() * 0.3, bedZ = -rd / 2 + 1.6;
  let [bx, bz] = toWorld(bedX, bedZ);
  if (r.trashed) P(L, 'bed', bx, y, bz, facing + Math.PI / 2 + 0.35, { messy: true });
  else P(L, 'bed', bx, y, bz, facing + Math.PI / 2, {});
  let [nx, nz] = toWorld(bedX - 0.05, bedZ - 1.35);
  const ns = P(L, 'nightstand', nx, y, nz, facing + Math.PI / 2);
  let [lx, lz] = toWorld(rw / 2 - 0.4, 0.2);
  P(L, 'dresser', lx, y, lz, facing - Math.PI / 2);
  P(L, 'tv', lx, y + 0.8, lz, facing - Math.PI / 2);
  if (rnd() < 0.6) { const [ax, az] = toWorld(rw / 2 - 0.7, -rd / 2 + 0.8); P(L, 'armchair', ax, y, az, facing - Math.PI / 4); }
  if (r.suite) { const [sx, sz] = toWorld(0, rd / 2 - 1.2); P(L, 'sofa', sx, y, sz, facing + Math.PI); P(L, 'coffee_table', sx, y, sz - 1.1 * Math.cos(facing) * 0, facing); }
  if (r.trashed || rnd() < 0.3) { const [px, pz] = toWorld((rnd() - 0.5) * rw * 0.5, (rnd() - 0.5) * rd * 0.4); P(L, 'blood_pool', px, y, pz, rnd() * 6); if (rnd() < 0.5) P(L, 'body', px, y, pz, rnd() * 6, { pose: rnd() < 0.5 ? 'back' : 'front' }); }
  if (r.barricade) { const [px, pz] = toWorld(0, rd / 2 - 0.9); P(L, 'barricade_furniture', px, y, pz, facing); }
  // items on the nightstand / dresser / floor
  const spots = [[nx, ns && ns.topY !== undefined ? ns.topY : y + 0.6, nz], [lx, y + 0.8, lz]];
  (r.items || []).forEach((id, i) => {
    const s = spots[i % spots.length];
    L.marker('item', [s[0] + (rnd() - 0.5) * 0.2, s[1], s[2] + (rnd() - 0.5) * 0.2], { id, chance: 0.65 });
  });
  // lamp light
  const [llx, llz] = toWorld(bedX - 0.05, bedZ - 1.35);
  if (!r.dark) L.light([llx, y + 1.3, llz], r.burning ? 0xff7030 : 0xffd090, r.burning ? 7 : 4.5, r.burning ? 1.3 : 0.55, { flicker: r.burning ? 1 : (rnd() < 0.3 ? 0.6 : 0) });
  if (r.burning) {
    const [fx, fz] = toWorld(bedX, bedZ);
    L.marker('fire', [fx, y, fz], { radius: 1.1, permanent: true });
    L.marker('smoke', [cx, y + 2.6, cz], { ceiling: true });
  }
  if (r.number) {
    // room number plaque on the corridor side of the door wall
    const dside = sides[r.door];
    if (dside) {
      // number on corridor side next to the door opening (approximate: centre of wall)
    }
  }
}

/**
 * Switchback stair core between two floors.
 * variant 'east': footprint x[x0,x0+6] z[z0,z0+7.6], doors on the x0+6 wall at z0+5.75..6.95 (both levels).
 * variant 'north': footprint x[x0,x0+7.6] z[z0,z0+6], doors on the z0+6 wall at x0+5.75..6.95.
 */
export function stairCore(L, o) {
  const { x0, z0, yTop, yBot } = o;
  const north = o.variant === 'north';
  const M = (u, v) => north ? [x0 + v, z0 + u] : [x0 + u, z0 + v];
  const yMid = (yTop + yBot) / 2;
  const rect = (u0, v0, u1, v1) => { const a = M(u0, v0), b = M(u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const wm = o.wall || 'concrete';
  const H = 3.0;
  // bottom floor of the core
  let r = rect(0, 0, 6, 7.6); L.floor(r[0], r[1], r[2], r[3], yBot, 'stairConcrete');
  // top landing slab (u 3..6, v 5.6..7.6)
  r = rect(3, 5.6, 6, 7.6); L.slab(r[0], r[1], r[2], r[3], yTop, 0.2, 'stairConcrete', 'stairConcrete', { edges: true });
  // mid landing slab (u 0..6, v 0..2)
  r = rect(0, 0, 6, 2); L.slab(r[0], r[1], r[2], r[3], yMid, 0.2, 'stairConcrete', 'stairConcrete', { edges: true });
  // flights: A from mid (v=2) up to top (v=5.6) at u 3.1..5.9 ; B from bottom (v=5.6) up to mid (v=2) at u 0.1..2.9
  const dirPlus = north ? 'e' : 's', dirMinus = north ? 'w' : 'n';
  const fa = M(4.5, 2), fb = M(1.5, 5.6);
  L.stairs([fa[0], yMid, fa[1]], dirPlus, 2.8, yTop - yMid, 3.6, 10, 'stairConcrete', { under: true });
  L.stairs([fb[0], yBot, fb[1]], dirMinus, 2.8, yMid - yBot, 3.6, 10, 'stairConcrete', { under: true });
  // block the space under flight A and the mid landing at the bottom level
  r = rect(3.0, 0.1, 6, 5.5); L.box([r[0], yBot, r[1]], [r[2], yMid - 0.05, r[3]], 'stairConcrete');
  // centre divider wall between flights
  r = rect(2.95, 2, 3.05, 5.6); L.box([r[0], yBot, r[1]], [r[2], yTop + 1.0, r[3]], 'stairConcrete');
  // railing on the top landing edge over the bottom area (u 3..6 at v=5.6 is the flight A top; rail along u=3 for v 5.6..7.6)
  r = rect(2.95, 5.6, 3.05, 7.6); L.box([r[0], yTop, r[1]], [r[2], yTop + 1.0, r[3]], 'metalDark');
  // walls (u=0, v=0, v=7.6 full; u=6 with door openings at both levels)
  const top = yTop + H;
  const WL = (u0, v0, u1, v1, mat, mat2, openings) => { const a = M(u0, v0), b = M(u1, v1); L.wall(a[0], a[1], b[0], b[1], yBot, top, mat, { thick: 0.2, mat2, openings, caps: false }); };
  // orientation: we want the inside face to use the stair material
  WL(0, 7.6, 0, 0, wm, wm, []);
  WL(0, 0, 6, 0, wm, wm, []);
  WL(6, 7.6, 0, 7.6, wm, wm, []);
  WL(6, 0, 6, 7.6, wm, wm, [{ at: 6.35, w: 1.2, h: 2.2, y0: 0 }, { at: 6.35, w: 1.2, h: 2.2, y0: yTop - yBot }]);
  // ceiling over the core
  r = rect(0, 0, 6, 7.6); L.ceiling(r[0], r[1], r[2], r[3], top, 'stairConcrete');
  if (o.housing) {
    r = rect(-0.1, -0.1, 6.1, 7.7); L.box([r[0], top, r[1]], [r[2], top + 0.3, r[3]], 'roof');
  }
}

/** Ring of distant skyline billboards around (cx, cz). */
export function skylineRing(L, cx, cz, radius, height, seed = 3) {
  if (!L.matDefs.skylineFar) L.defMat('skylineFar', { tex: ['skyline', { seed, color: 'rgb(36,30,32)' }], unlit: true, alphaTest: 0.5, surf: SURF.CONCRETE, color: 0xc8b8a8 });
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = new THREE.Vector3(cx + Math.cos(a0) * radius, -2, cz + Math.sin(a0) * radius);
    const p1 = new THREE.Vector3(cx + Math.cos(a1) * radius, -2, cz + Math.sin(a1) * radius);
    // facing inward
    L.quad(p1, p0, p0.clone().setY(height), p1.clone().setY(height), 'skylineFar', { collide: false, subdivide: false, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  }
}

/** Scatter generic city buildings in a ring. */
export function cityBlocks(L, o) {
  const rnd = mulberry32(o.seed || 1);
  const placed = [];
  for (let i = 0; i < (o.count || 40); i++) {
    const a = rnd() * Math.PI * 2, r = o.inner + rnd() * (o.outer - o.inner);
    const x = o.cx + Math.cos(a) * r, z = o.cz + Math.sin(a) * r;
    const sx = 10 + rnd() * 18, sz = 10 + rnd() * 18, h = (o.minH || 10) + rnd() * (o.maxH || 40);
    if (placed.some((p) => Math.abs(p[0] - x) < (p[2] + sx) / 2 + 4 && Math.abs(p[1] - z) < (p[3] + sz) / 2 + 4)) continue;
    placed.push([x, z, sx, sz]);
    const m = o.mats[(rnd() * o.mats.length) | 0];
    L.box([x - sx / 2, (o.baseY || -0.3), z - sz / 2], [x + sx / 2, h, z + sz / 2], { side: m, top: 'roof', bottom: 'roof' }, { collide: false, maxQuad: 9, faces: { ny: false } });
    if (rnd() < 0.3) L.light([x, h + 2, z], 0xff6a20, 18, 0.6);
  }
}

/** Bots gather at these points when their leader stands in the named zone (elevators etc.). */
export function gatherZone(w, zoneName, points) {
  const z = w.builder.zones.find((zz) => zz.name === zoneName);
  if (!z) return;
  w.gatherZones = w.gatherZones || [];
  w.gatherZones.push({ box: z.box, points: points.map((p) => new THREE.Vector3(...p)) });
}

/** Ambient smoke: drifting ceiling layers and smoke seeping from under doors. */
export function smokeEmitter(w, markers) {
  const em = {
    t: 0,
    update(dt) {
      const cam = w.camPos; if (!cam) return;
      this.t -= dt;
      if (this.t > 0) return;
      this.t = 0.12;
      for (const m of markers) {
        if (m.pos.distanceToSquared(cam) > 30 * 30) continue;
        if (Math.random() > 0.35) continue;
        if (m.door) w.effects.smokePuff(m.pos.x + (Math.random() - 0.5) * 0.6, m.pos.y, m.pos.z + (Math.random() - 0.5) * 0.6, { size: 0.5, life: 2.5, vy: 0.35, a: 0.45, r: 0.18, g: 0.16, b: 0.14 });
        else w.effects.smokePuff(m.pos.x + (Math.random() - 0.5) * 3, m.pos.y - Math.random() * 0.3, m.pos.z + (Math.random() - 0.5) * 3, { size: 2.2, grow: 0.4, life: 5, vy: 0.02, vx: (Math.random() - 0.5) * 0.3, a: 0.35, r: 0.14, g: 0.12, b: 0.1 });
      }
    },
  };
  w.interactables.push(em);
  return em;
}
