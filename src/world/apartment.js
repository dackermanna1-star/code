// The apartment shell: rooms, walls, windows, built-in cabinetry and lighting.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { G } from '../game.js';
import { allLayers } from '../core/engine.js';
import { floorMaterial, wallMaterial, FLOORS } from './finishes.js';
import { mat, MAT, box, rbox, cyl, at, group, plane, tube } from '../items/kit.js';
import { tiles, marble } from '../core/textures.js';
import { buildKitchen } from './fixtures/kitchen.js';
import { buildBathroom } from './fixtures/bathroom.js';
import { buildDoors, buildSwitches } from './fixtures/doors.js';
import { buildBlinds } from './fixtures/blinds.js';
import { buildCloset } from './fixtures/closet.js';
import { buildCorridor } from './fixtures/corridor.js';

export const H = 2.9; // ceiling height
export const EXT_T = 0.3; // exterior wall thickness
export const INT_T = 0.12; // interior wall thickness

export const ROOMS = {
  living: { name: 'Living Room', x0: -7, x1: 1, z0: -5, z1: 1 },
  kitchen: { name: 'Kitchen', x0: -7, x1: -2, z0: 1, z1: 5 },
  entry: { name: 'Entryway', x0: -2, x1: 1, z0: 1, z1: 5 },
  bath: { name: 'Bathroom', x0: 1, x1: 4, z0: 1.5, z1: 5 },
  bedroom: { name: 'Bedroom', x0: 1, x1: 7, z0: -5, z1: 1.5 },
  closet: { name: 'Walk-in Closet', x0: 4, x1: 7, z0: 1.5, z1: 5 },
};
export const ROOM_ORDER = ['living', 'kitchen', 'entry', 'bedroom', 'bath', 'closet'];

export function roomAt(x, z) {
  for (const id of ['bath', 'closet', 'bedroom', 'kitchen', 'entry', 'living']) {
    const r = ROOMS[id];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
  }
  return z > 5 ? 'corridor' : 'outside';
}

// Scale BoxGeometry UVs so textures map at 1 unit = 1 meter
function meterUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0], uv.getY(idx) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export class Apartment {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'apartment';
    scene.add(this.root);
    this.colliders = []; // {minX,maxX,minZ,maxZ, enabled, tag}
    this.solids = []; // meshes used for raycasts (placement, physics)
    this.wallMeshes = [];
    this.floorMeshes = {};
    this.wallMats = {};
    this.edgeMat = mat('#f3f1ed', { rough: 0.85 });
    this.extMat = mat('#8d8a86', { rough: 0.9 });
    this.roomLights = {}; // room -> [{light, base, emissive?: mesh/material}]
    this.fixtures = [];
    this.updaters = [];
    this.windows = [];
  }

  build() {
    RectAreaLightUniformsLib.init();
    const st = G.state.home;
    for (const id of ROOM_ORDER) this.wallMats[id] = wallMaterial(st.walls[id]);
    this.wallMats.ext = this.extMat;
    this.wallMats.corridor = wallMaterial('#cfc6b8');

    this._floorsAndCeiling();
    this._walls();
    this._windows();
    this._kitchenCabinetry();
    this._lights();
    buildDoors(this);
    buildSwitches(this);
    buildKitchen(this);
    buildBathroom(this);
    buildCloset(this);
    buildBlinds(this);
    buildCorridor(this);
    this._exteriorLedge();
    this.applyLights();
  }

  addSolid(mesh, { surface = false, wall = false, step = null } = {}) {
    mesh.userData.solid = true;
    if (surface) mesh.userData.surface = true;
    if (wall) mesh.userData.wall = true;
    if (step) mesh.userData.step = step;
    this.solids.push(mesh);
    return mesh;
  }

  addCollider(minX, maxX, minZ, maxZ, tag = 'static', yMax = 3) {
    const c = { minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), enabled: true, tag, yMax };
    this.colliders.push(c);
    return c;
  }

  // ---------------------------------------------------------------- floors
  _floorsAndCeiling() {
    const st = G.state.home;
    for (const id of ROOM_ORDER) {
      const r = ROOMS[id];
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      // world-meter UVs
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + (r.x0 + w / 2), -(pos.getZ(i) + (r.z0 + d / 2)));
      const m = new THREE.Mesh(geo, floorMaterial(st.floors[id]));
      m.position.set(r.x0 + w / 2, 0, r.z0 + d / 2);
      m.receiveShadow = true;
      m.name = 'floor_' + id;
      m.userData.room = id;
      this.root.add(m);
      this.addSolid(m, { surface: true, step: FLOORS[st.floors[id]]?.step || 'wood' });
      this.floorMeshes[id] = m;
    }
    // structural slab under everything (also blocks low sun)
    const slab = box(16, 0.3, 14, this.extMat, { cast: true, receive: false });
    at(slab, 0, -0.151, 1);
    this.root.add(slab);
    // ceiling as a thick box so it also casts sun shadows
    const ceilMat = mat('#f6f4f0', { rough: 0.95 });
    const ceil = box(14.6, 0.25, 12.6, ceilMat, { cast: true, receive: true });
    at(ceil, 0, H + 0.125, 1);
    ceil.name = 'ceiling';
    this.root.add(ceil);
    this.addSolid(ceil);
    // crown shadow gap trim along the perimeter (subtle architectural detail)
    const trim = mat('#e9e6e0', { rough: 0.8 });
    const t1 = box(14, 0.03, 0.03, trim, { cast: false }); at(t1, 0, H - 0.015, -4.84); this.root.add(t1);
  }

  // ---------------------------------------------------------------- walls
  // axis 'x' = wall runs along x at constant z (side A = north(-z), side B = south(+z))
  // axis 'z' = wall runs along z at constant x (side A = west(-x), side B = east(+x))
  // ranges: [[upTo, roomA, roomB], ...] in increasing order along the wall, so
  // a single wall can face different rooms (needed for per-room paint).
  wall(axis, c, a, b, t, ranges, openings = []) {
    const pieces = [];
    const ops = [...openings].sort((p, q) => p.a - q.a);
    let cur = a;
    const add = (s, e, y0, y1) => { if (e - s > 0.005 && y1 - y0 > 0.005) pieces.push({ s, e, y0, y1 }); };
    for (const o of ops) {
      add(cur, o.a, 0, H);
      if (o.bottom > 0) add(o.a, o.b, 0, o.bottom);
      if (o.top < H) add(o.a, o.b, o.top, H);
      cur = o.b;
    }
    add(cur, b, 0, H);
    // split pieces at range boundaries
    const cuts = ranges.map((r) => r[0]).filter((v) => v > a && v < b);
    const split = [];
    for (const p of pieces) {
      let s0 = p.s;
      for (const cpos of cuts) if (cpos > p.s + 0.005 && cpos < p.e - 0.005) { split.push({ ...p, s: s0, e: cpos }); s0 = cpos; }
      split.push({ ...p, s: s0 });
    }
    const roomsFor = (mid) => { for (const r of ranges) if (mid <= r[0] + 1e-6) return [r[1], r[2]]; const l = ranges[ranges.length - 1]; return [l[1], l[2]]; };
    for (const p of split) {
      const len = p.e - p.s, h = p.y1 - p.y0, mid = (p.s + p.e) / 2;
      const [sideA, sideB] = roomsFor(mid);
      const matA = this.wallMats[sideA] || this.extMat;
      const matB = this.wallMats[sideB] || this.extMat;
      let geo, mats, pos;
      if (axis === 'x') {
        geo = meterUV(new THREE.BoxGeometry(len, h, t), len, h, t);
        mats = [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, matB, matA];
        pos = [mid, p.y0 + h / 2, c];
      } else {
        geo = meterUV(new THREE.BoxGeometry(t, h, len), t, h, len);
        mats = [matB, matA, this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat];
        pos = [c, p.y0 + h / 2, mid];
      }
      const m = new THREE.Mesh(geo, mats);
      m.position.set(...pos);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.wallAxis = axis; m.userData.sides = [sideA, sideB];
      this.root.add(m);
      this.addSolid(m, { wall: true });
      this.wallMeshes.push(m);
      if (p.y0 < 1.0) {
        if (axis === 'x') this.addCollider(p.s, p.e, c - t / 2, c + t / 2, 'wall');
        else this.addCollider(c - t / 2, c + t / 2, p.s, p.e, 'wall');
      }
      if (p.y0 === 0) {
        for (const [side, sign] of [[sideA, -1], [sideB, 1]]) {
          if (!ROOMS[side] && side !== 'corridor') continue;
          const bb = box(axis === 'x' ? len : 0.015, 0.09, axis === 'x' ? 0.015 : len, mat('#f4f2ee', { rough: 0.5 }), { cast: false });
          if (axis === 'x') at(bb, mid, 0.045, c + sign * (t / 2 + 0.0075));
          else at(bb, c + sign * (t / 2 + 0.0075), 0.045, mid);
          this.root.add(bb);
        }
      }
    }
  }

  _walls() {
    const E = EXT_T, I = INT_T;
    // North exterior (floor-to-ceiling windows), z = -5
    this.wall('x', -5 - E / 2, -7 - E, 7 + E, E, [[1, 'ext', 'living'], [99, 'ext', 'bedroom']], [
      { a: -6.85, b: 0.8, bottom: 0.08, top: 2.72 },
      { a: 1.2, b: 6.85, bottom: 0.08, top: 2.72 },
    ]);
    // West exterior x = -7 (living windows, kitchen solid)
    this.wall('z', -7 - E / 2, -5, 5 + E, E, [[1, 'ext', 'living'], [99, 'ext', 'kitchen']], [{ a: -4.85, b: 0.85, bottom: 0.08, top: 2.72 }]);
    // South exterior z = 5 (front door to the corridor)
    this.wall('x', 5 + E / 2, -7, 7, E, [[-4.2, 'kitchen', 'ext'], [-2, 'kitchen', 'corridor'], [1, 'entry', 'corridor'], [3.2, 'bath', 'corridor'], [4, 'bath', 'ext'], [99, 'closet', 'ext']], [{ a: -1.1, b: -0.1, bottom: 0, top: 2.18 }]);
    // East exterior x = 7 (bedroom window)
    this.wall('z', 7 + E / 2, -5 - E, 5 + E, E, [[1.5, 'bedroom', 'ext'], [99, 'closet', 'ext']], [{ a: -4.6, b: -2.7, bottom: 0.85, top: 2.45 }]);
    // Interior x = 1 (living/entry | bedroom/bath)
    this.wall('z', 1, -5, 5, I, [[1, 'living', 'bedroom'], [1.5, 'entry', 'bedroom'], [99, 'entry', 'bath']], [
      { a: -0.25, b: 0.65, bottom: 0, top: 2.15 },
      { a: 2.6, b: 3.5, bottom: 0, top: 2.15 },
    ]);
    // Interior z = 1.5 (bedroom | bath & closet)
    this.wall('x', 1.5, 1 + I / 2, 7, I, [[4, 'bedroom', 'bath'], [99, 'bedroom', 'closet']], [{ a: 5.0, b: 6.2, bottom: 0, top: 2.25 }]);
    // Interior x = 4 (bath | closet)
    this.wall('z', 4, 1.5 + I / 2, 5, I, [[99, 'bath', 'closet']]);
    // Partial wall x = -2 (kitchen | entry), z 2.6..5
    this.wall('z', -2, 2.6, 5, I, [[99, 'kitchen', 'entry']]);
  }

  setWallColor(room, color) {
    this.wallMats[room]?.color.set(color);
    G.state.home.walls[room] = color;
  }

  setFloor(room, id) {
    const m = this.floorMeshes[room];
    if (!m) return;
    m.material = floorMaterial(id);
    m.userData.step = FLOORS[id]?.step || 'wood';
    G.state.home.floors[room] = id;
  }

  // ---------------------------------------------------------------- windows
  _windows() {
    const frameMat = mat('#2a2c30', { rough: 0.45, metal: 0.6 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: '#d6e6ee', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide });
    this.glassMat = glassMat;
    const sillMat = mat('#e9e5de', { rough: 0.35 });
    const mk = (axis, c, a, b, bottom, top, id, room) => {
      const len = b - a, h = top - bottom;
      const g = new THREE.Group();
      g.name = 'window_' + id;
      const panes = Math.max(1, Math.round(len / 1.55));
      const pw = len / panes;
      const fT = 0.05;
      const addBar = (x, y, w, hh) => {
        const m = box(w, hh, 0.07, frameMat, { cast: true });
        m.position.set(x, y, 0); g.add(m);
      };
      // frame
      addBar(0, bottom + fT / 2, len, fT);
      addBar(0, top - fT / 2, len, fT);
      addBar(-len / 2 + fT / 2, (bottom + top) / 2, fT, h);
      addBar(len / 2 - fT / 2, (bottom + top) / 2, fT, h);
      for (let i = 1; i < panes; i++) addBar(-len / 2 + i * pw, (bottom + top) / 2, 0.045, h);
      if (h > 2) addBar(0, bottom + 0.45, len, 0.035); // low transom
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, h), glassMat);
      glass.position.set(0, (bottom + top) / 2, 0);
      glass.renderOrder = 2;
      g.add(glass);
      // interior sill
      const sill = box(len + 0.06, 0.04, 0.16, sillMat, { cast: false });
      sill.position.set(0, bottom - 0.0, 0.1);
      if (bottom > 0.3) g.add(sill);
      if (axis === 'x') { g.position.set((a + b) / 2, 0, c); }
      else { g.rotation.y = Math.PI / 2; g.position.set(c, 0, (a + b) / 2); if (id === 'bed_e') g.rotation.y = -Math.PI / 2; }
      this.root.add(g);
      this.windows.push({ id, room, axis, c, a, b, bottom, top, group: g, glass });
      return g;
    };
    mk('x', -5 - EXT_T / 2 + 0.02, -6.85, 0.8, 0.08, 2.72, 'living_n', 'living');
    mk('x', -5 - EXT_T / 2 + 0.02, 1.2, 6.85, 0.08, 2.72, 'bed_n', 'bedroom');
    mk('z', -7 - EXT_T / 2 + 0.02, -4.85, 0.85, 0.08, 2.72, 'living_w', 'living');
    mk('z', 7 + EXT_T / 2 - 0.02, -4.6, -2.7, 0.85, 2.45, 'bed_e', 'bedroom');
    // Window "rect" lights: soft daylight pouring in from the sky
    this.windowLights = [];
    const addRect = (w, h, pos, look, room) => {
      const l = new THREE.RectAreaLight('#cfe2ff', 0, w, h);
      l.position.set(...pos); l.lookAt(...look);
      allLayers(l);
      this.root.add(l);
      this.windowLights.push({ light: l, room, area: w * h });
    };
    addRect(7.6, 2.5, [-3.0, 1.4, -4.9], [-3.0, 1.2, 0], 'living');
    addRect(5.6, 2.5, [-6.9, 1.4, -2.0], [0, 1.2, -2.0], 'living');
    addRect(5.6, 2.5, [4.0, 1.4, -4.9], [4.0, 1.2, 0], 'bedroom');
    addRect(1.9, 1.6, [6.9, 1.65, -3.65], [0, 1.4, -3.65], 'bedroom');
  }

  _exteriorLedge() {
    // concrete ledge / planter outside the floor-to-ceiling windows hides the vertical drop
    const ledgeMat = mat('#a9a49c', { rough: 0.85 });
    const l1 = box(15, 0.35, 0.9, ledgeMat, { cast: false }); at(l1, 0, -0.1, -5.75); this.root.add(l1);
    const l2 = box(0.9, 0.35, 7, ledgeMat, { cast: false }); at(l2, -7.75, -0.1, -2.0); this.root.add(l2);
    const rail = mat('#30343a', { rough: 0.4, metal: 0.7 });
    const r1 = box(15, 0.04, 0.04, rail); at(r1, 0, 1.05, -6.15); this.root.add(r1);
    const r2 = box(0.04, 0.04, 7, rail); at(r2, -8.15, 1.05, -2.0); this.root.add(r2);
    const glassRail = mat('#bcd3dc', { opacity: 0.18, transparent: true, rough: 0.05, depthWrite: false });
    const g1 = box(15, 1.0, 0.015, glassRail, { cast: false }); at(g1, 0, 0.55, -6.15); this.root.add(g1);
    const g2 = box(0.015, 1.0, 7, glassRail, { cast: false }); at(g2, -8.15, 0.55, -2.0); this.root.add(g2);
    // building corner columns visible outside
    const col = box(0.6, 3.6, 0.6, mat('#7c7a76', { rough: 0.8 })); at(col, -7.45, 1.5, -5.45); this.root.add(col);
  }

  // ---------------------------------------------------------------- kitchen built-ins
  _kitchenCabinetry() {
    const g = new THREE.Group(); g.name = 'kitchen_cabinets';
    const cabMat = mat('#3f4a45', { rough: 0.55 }); // deep green-grey fronts
    this.cabinetMat = cabMat;
    const carcass = mat('#f0ede8', { rough: 0.7 });
    const handle = mat('#c9a66b', { rough: 0.25, metal: 1 });
    const top = mat('#ffffff', { map: marble({ base: '#f2f0ec', vein: '#a39d94' }), rough: 0.2, clearcoat: 0.3 });
    top.map.repeat.set(0.5, 0.5);
    const CH = 0.9, CD = 0.62, TOP = 0.04;
    const addFront = (x, z, w, h, y, faceDir, drawer = false) => {
      // faceDir: 'e' (+x) or 'n' (-z)
      const f = rbox(faceDir === 'e' ? 0.02 : w - 0.006, h - 0.006, faceDir === 'e' ? w - 0.006 : 0.02, 0.004, cabMat);
      f.position.set(x, y, z);
      g.add(f);
      const hl = drawer ? 0.22 : 0.012, hh = drawer ? 0.012 : 0.2;
      const hd = box(faceDir === 'e' ? 0.015 : hl, hh, faceDir === 'e' ? hl : 0.015, handle);
      if (faceDir === 'e') hd.position.set(x + 0.02, drawer ? y + h / 2 - 0.06 : y + h / 2 - 0.16, z + (drawer ? 0 : -w / 2 + 0.06));
      else hd.position.set(x + (drawer ? 0 : w / 2 - 0.06), drawer ? y + h / 2 - 0.06 : y + h / 2 - 0.16, z - 0.02);
      g.add(hd);
    };
    // West run: x from -7 to -6.38, z 1.35..4.38 (corner with south run)
    const wx0 = -7, wz0 = 1.35, wz1 = 5;
    const wBody = box(CD, CH - 0.1, wz1 - wz0, carcass); at(wBody, wx0 + CD / 2, 0.1 + (CH - 0.1) / 2, (wz0 + wz1) / 2); g.add(wBody);
    const wKick = box(CD - 0.06, 0.1, wz1 - wz0, mat('#222', { rough: 0.9 })); at(wKick, wx0 + CD / 2 - 0.03, 0.05, (wz0 + wz1) / 2); g.add(wKick);
    // fronts along the west run (facing +x)
    const fx = wx0 + CD + 0.0;
    const segs = [[1.35, 1.95, 'drawer3'], [1.95, 2.55, 'door'], [2.55, 3.45, 'sink'], [3.45, 4.38, 'door2']];
    for (const [a, b, kind] of segs) {
      const w = b - a, zc = (a + b) / 2;
      if (kind === 'drawer3') { for (let i = 0; i < 3; i++) addFront(fx, zc, w, (CH - 0.1) / 3, 0.1 + (CH - 0.1) / 6 + i * (CH - 0.1) / 3, 'e', true); }
      else if (kind === 'door2') { addFront(fx, a + w / 4, w / 2, CH - 0.1, 0.1 + (CH - 0.1) / 2, 'e'); addFront(fx, a + 3 * w / 4, w / 2, CH - 0.1, 0.1 + (CH - 0.1) / 2, 'e'); }
      else addFront(fx, zc, w, CH - 0.1, 0.1 + (CH - 0.1) / 2, 'e');
    }
    // countertop west (with sink cutout handled by kitchen.js placing basin over it)
    const tw1 = box(CD + 0.03, TOP, 2.55 - 1.35, top); at(tw1, wx0 + (CD + 0.03) / 2, CH + TOP / 2, (1.35 + 2.55) / 2); g.add(tw1); this.addSolid(tw1, { surface: true });
    const tw2 = box(CD + 0.03, TOP, wz1 - 3.45, top); at(tw2, wx0 + (CD + 0.03) / 2, CH + TOP / 2, (3.45 + wz1) / 2); g.add(tw2); this.addSolid(tw2, { surface: true });
    // sink strips (front & back of the basin)
    const ts1 = box(0.12, TOP, 0.9, top); at(ts1, wx0 + CD + 0.03 - 0.06, CH + TOP / 2, 3.0); g.add(ts1); this.addSolid(ts1, { surface: true });
    const ts2 = box(0.1, TOP, 0.9, top); at(ts2, wx0 + 0.05, CH + TOP / 2, 3.0); g.add(ts2);
    this.addCollider(wx0, wx0 + CD + 0.03, wz0, wz1, 'counter', CH);
    // South run: z from 4.38 to 5, x from -6.38 to -3.1 (stove at -4.6)
    const sx0 = -6.38, sx1 = -3.1, sz0 = 5 - CD;
    const sBody = box(sx1 - sx0, CH - 0.1, CD, carcass); at(sBody, (sx0 + sx1) / 2, 0.1 + (CH - 0.1) / 2, sz0 + CD / 2); g.add(sBody);
    const sSegs = [[-6.38, -5.4, 'door'], [-5.4, -5.0, 'drawer3'], [-3.9, -3.1, 'door']];
    for (const [a, b, kind] of sSegs) {
      const w = b - a, xc = (a + b) / 2;
      if (kind === 'drawer3') { for (let i = 0; i < 3; i++) addFront(xc, sz0, w, (CH - 0.1) / 3, 0.1 + (CH - 0.1) / 6 + i * (CH - 0.1) / 3, 'n', true); }
      else addFront(xc, sz0, w, CH - 0.1, 0.1 + (CH - 0.1) / 2, 'n');
    }
    // countertop pieces either side of the range (range spans x -5.0..-3.9)
    for (const [a, b] of [[sx0, -5.0], [-3.9, sx1]]) {
      const ts = box(b - a, TOP, CD + 0.03, top); at(ts, (a + b) / 2, CH + TOP / 2, sz0 + (CD - 0.03) / 2); g.add(ts); this.addSolid(ts, { surface: true });
    }
    this.addCollider(sx0, sx1, sz0 - 0.03, 5, 'counter', CH);
    // backsplash: subway tiles on the walls behind the counters
    const sub = tiles({ base: '#f4f1ea', grout: '#d8d2c8', cols: 6, rows: 12, hexPattern: true, seed: 2 });
    const bsMat = mat('#ffffff', { map: sub.map, rough: 0.2, clearcoat: 0.5 });
    const bsW = plane(wz1 - wz0, 0.62, bsMat); bsW.rotation.y = Math.PI / 2; at(bsW, -7 + 0.003, CH + TOP + 0.31, (wz0 + wz1) / 2); g.add(bsW);
    const bsS = plane(-3.1 - -7, 0.62, bsMat); bsS.rotation.y = Math.PI; at(bsS, (-7 + -3.1) / 2, CH + TOP + 0.31, 5 - 0.003); g.add(bsS);
    // upper cabinets along west wall (with LED strip underneath)
    const UY = 1.62, UH = 0.85, UD = 0.36;
    const upW = box(UD, UH, 2.2, carcass); at(upW, -7 + UD / 2, UY + UH / 2, 2.9); g.add(upW);
    for (let i = 0; i < 4; i++) addFront(-7 + UD, 1.8 + 0.275 + i * 0.55, 0.55, UH, UY + UH / 2, 'e');
    const upS = box(1.25, UH, UD, carcass); at(upS, -6.38 + 1.25 / 2 - 0.62, UY + UH / 2, 5 - UD / 2); g.add(upS);
    for (let i = 0; i < 2; i++) addFront(-7 + 0.32 + i * 0.625, 5 - UD, 0.62, UH, UY + UH / 2, 'n');
    const upS2 = box(0.8, UH, UD, carcass); at(upS2, -3.5, UY + UH / 2, 5 - UD / 2); g.add(upS2);
    addFront(-3.5, 5 - UD, 0.8, UH, UY + UH / 2, 'n');
    // LED strips under uppers
    const led = mat('#fff3df', { emissive: '#ffe6c4', ei: 2.5 });
    this.kitchenLed = led;
    const l1 = box(0.02, 0.01, 2.1, led, { cast: false }); at(l1, -7 + UD - 0.05, UY - 0.006, 2.9); g.add(l1);
    const l2 = box(1.2, 0.01, 0.02, led, { cast: false }); at(l2, -6.4, UY - 0.006, 5 - UD + 0.05); g.add(l2);
    // Kitchen island with waterfall marble top
    const ix = -4.4, iz = 2.4, iw = 2.3, id = 0.95;
    const iBody = box(iw - 0.08, CH - 0.06, id - 0.12, mat('#2f3a36', { rough: 0.5 })); at(iBody, ix, (CH - 0.06) / 2, iz); g.add(iBody);
    const iTop = box(iw, 0.05, id, top); at(iTop, ix, CH + 0.025, iz); g.add(iTop); this.addSolid(iTop, { surface: true });
    const iSideL = box(0.05, CH, id, top); at(iSideL, ix - iw / 2 + 0.025, CH / 2, iz); g.add(iSideL);
    const iSideR = box(0.05, CH, id, top); at(iSideR, ix + iw / 2 - 0.025, CH / 2, iz); g.add(iSideR);
    // fluted island front (facing the stools / living room)
    for (let i = 0; i < 26; i++) {
      const f = cyl(0.022, 0.022, CH - 0.12, mat('#2f3a36', { rough: 0.45 }), 10); at(f, ix - iw / 2 + 0.12 + i * ((iw - 0.24) / 25), (CH - 0.12) / 2 + 0.03, iz - id / 2 + 0.07); g.add(f);
    }
    this.addCollider(ix - iw / 2, ix + iw / 2, iz - id / 2, iz + id / 2, 'island', CH);
    this.root.add(g);
  }

  // ---------------------------------------------------------------- lighting
  _lights() {
    const fixtureMat = mat('#fff7ea', { emissive: '#fff1db', ei: 0 });
    const addLight = (room, x, y, z, { intensity = 9, distance = 9, color = null, recessed = true, pendant = null, name = '', fakeOnly = false } = {}) => {
      let l = null;
      if (!fakeOnly) {
        l = new THREE.PointLight(color || G.state.home.lightColor[room] || '#ffe0b8', 0, distance, 2);
        l.position.set(x, y, z);
        l.castShadow = false;
        allLayers(l);
        this.root.add(l);
      }
      let em = null;
      if (recessed) {
        const m = fixtureMat.clone();
        const trim = cyl(0.1, 0.1, 0.012, mat('#e9e7e3', { rough: 0.4, metal: 0.3 }), 24, { cast: false }); at(trim, x, H - 0.006, z); this.root.add(trim);
        const disc = cyl(0.075, 0.075, 0.004, m, 24, { cast: false }); at(disc, x, H - 0.013, z); this.root.add(disc);
        em = m;
      }
      if (pendant) { em = pendant; }
      (this.roomLights[room] ||= []).push({ light: l, base: intensity, emissive: em, name });
      return l;
    };
    // living: two zones + dining pendant
    // (few lights keeps the forward renderer fast; emissive trims sell the rest)
    addLight('living', -3.0, H - 0.1, -2.2, { intensity: 18, distance: 12 });
    for (const [x, z] of [[-4.6, -3.6], [-1.4, -3.6], [-1.4, -0.4], [-4.6, -0.4]]) addLight('living', x, H - 0.1, z, { intensity: 0, distance: 0.1, fakeOnly: true });
    // dining pendant (big paper lantern)
    const lanternMat = mat('#fff8ee', { emissive: '#ffd9a8', ei: 0, rough: 0.9 });
    const lantern = group(
      at(cyl(0.004, 0.004, 0.9, mat('#222')), 0, 0.45, 0),
      at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), lanternMat), 0, -0.05, 0),
    );
    lantern.children[1].scale.y = 0.85;
    lantern.position.set(-5.6, H - 0.95, -0.6);
    this.root.add(lantern);
    addLight('living', -5.6, H - 1.05, -0.6, { intensity: 7, recessed: false, pendant: lanternMat, distance: 7 });
    // kitchen: pendants over island
    const pendMat = mat('#fff3df', { emissive: '#ffe1b5', ei: 0 });
    for (const px of [-5.1, -3.7]) {
      const shade = group(
        at(cyl(0.003, 0.003, 1.05, mat('#1c1c1c')), 0, 0.52, 0),
        at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#1f2421', { rough: 0.35, metal: 0.6, side: THREE.DoubleSide })), 0, -0.02, 0),
        at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), pendMat), 0, -0.04, 0),
      );
      shade.position.set(px, H - 1.05, 2.4);
      this.root.add(shade);
    }
    addLight('kitchen', -4.4, H - 1.15, 2.4, { intensity: 9, recessed: false, pendant: pendMat, distance: 8 });
    addLight('kitchen', -5.9, H - 0.1, 3.6, { intensity: 0, distance: 0.1, fakeOnly: true });
    (this.roomLights.kitchen).push({ light: null, base: 0, emissive: this.kitchenLed, emissiveBase: 2.5 });
    addLight('entry', -0.5, H - 0.1, 3.2, { intensity: 7 });
    addLight('bedroom', 3.8, H - 0.1, -2.2, { intensity: 13, distance: 11 });
    addLight('bedroom', 2.6, H - 0.1, -4.0, { intensity: 0, distance: 0.1, fakeOnly: true });
    addLight('bath', 2.5, H - 0.1, 3.2, { intensity: 8, color: '#f6f3ff' });
    addLight('closet', 5.5, H - 0.1, 3.2, { intensity: 7 });

    // Sun / moon
    const sun = (this.sun = new THREE.DirectionalLight('#fff1dc', 2));
    sun.castShadow = true;
    const s = G.engine.quality.shadowSize;
    sun.shadow.mapSize.set(s, s);
    const cam = sun.shadow.camera;
    cam.left = -10; cam.right = 10; cam.top = 10; cam.bottom = -10; cam.near = 1; cam.far = 80;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    sun.target.position.set(0, 0, 0);
    allLayers(sun);
    this.scene.add(sun, sun.target);
    // Gentle fill so corners never go pitch black
    this.ambient = new THREE.HemisphereLight('#dfe8ff', '#4a3f35', 0.15);
    allLayers(this.ambient);
    this.scene.add(this.ambient);
  }

  setRoomLight(room, on) {
    G.state.home.lights[room] = on;
    this.applyLights();
  }

  setRoomLightColor(room, color) {
    G.state.home.lightColor[room] = color;
    for (const e of this.roomLights[room] || []) if (e.light) e.light.color.set(color);
    this.applyLights();
  }

  applyLights() {
    const st = G.state.home;
    for (const [room, list] of Object.entries(this.roomLights)) {
      const on = !!st.lights[room];
      for (const e of list) {
        if (e.light) e.light.intensity = on ? e.base : 0;
        if (e.emissive) {
          e.emissive.emissiveIntensity = on ? (e.emissiveBase ?? 3) : 0;
          if (e.light && on) e.emissive.emissive?.set(st.lightColor[room]);
        }
      }
    }
    G.events?.emit('lightsChanged');
  }

  update(dt) {
    for (const u of this.updaters) u(dt);
  }
}
