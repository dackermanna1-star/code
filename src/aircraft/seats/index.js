// =============================================================================
// SEATS MODULE — all 154 passenger seats of the Halcyon 737-800.
//
//   business rows 1-4  : 2-2 leather recliners (leg rest, armrest trays, console)
//   economy rows 6-29  : 3-3 slimline seats (seatback tray + IFE recess, pocket,
//                        liftable armrests); row 6 bulkhead trays in the armrests;
//                        exit rows 16/17 (rows 15 & 16 do not recline)
//
// Everything is instanced: one InstancedMesh (multi-material groups) per part
// type, ~45 draw calls for the whole cabin. Animated parts (backrest recline,
// tray tables + latches, armrests, leg rests, bi-fold armrest trays, belts)
// only rewrite the instance matrices of the seat that changes.
//
// API (docs/ARCHITECTURE.md §6):
//   list: SeatDescriptor[]   byId(id)
//   setTray(id, v) setRecline(id, v) setBelt(id, on) setArmrest(id, idx, up)
//   setLegrest(id, v) readCard(id) closeCard()
// SeatDescriptor = SEAT_LIST entry + { position, eye, standPoint, screenAnchor,
//   screenSize, state: { tray, recline, belt, armrests: [l, r], occupied, legrest } }
//   (state values are the animated 0..1 values; eyeIncludesRecline = true)
// =============================================================================
import * as THREE from 'three';
import { SEAT_LIST, SEAT, ROWS, AISLE, ZONES, DEG } from '../../core/constants.js';
import * as P from './parts.js';
import * as TX from './textures.js';
import { createMaterials, materialsFor } from './materials.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
const easeOutBack = (t, s = 0.7) => { t = clamp01(t) - 1; return t * t * ((s + 1) * t + s) + 1; };

// scratch objects (no per-frame allocations)
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _s = new THREE.Matrix4();
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _ray = new THREE.Ray(), _p = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const _hid = new THREE.Matrix4(), _hv = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------
// Instanced part set with cached inverse matrices + cheap box-proxy raycasting
// ------------------------------------------------------------------------------------------------
class Inst {
  constructor(root, name, built, materials, count, { shadow = true, receive = true, dynamic = false, boxes = null, labels = false } = {}) {
    this.name = name;
    this.count = count;
    this.mesh = new THREE.InstancedMesh(built.geometry, materials, count);
    this.mesh.name = `seats-${name}`;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = receive;
    if (dynamic) this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mats = Array.from({ length: count }, () => new THREE.Matrix4());
    this.inv = Array.from({ length: count }, () => new THREE.Matrix4());
    this.vis = new Uint8Array(count);
    this.dirty = false;
    this.boxes = boxes;
    if (labels) {
      built.geometry.setAttribute('aLabelA', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
      built.geometry.setAttribute('aLabelB', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
    }
    if (boxes) {
      const self = this;
      this.mesh.raycast = function (raycaster, intersects) { self.raycast(raycaster, intersects); };
    } else {
      this.mesh.raycast = () => {};
    }
    root.add(this.mesh);
  }
  set(i, m, visible = true) {
    this.mats[i].copy(m);
    this.vis[i] = visible ? 1 : 0;
    if (visible) this.inv[i].copy(m).invert();
    this.mesh.setMatrixAt(i, visible ? m : _hid.copy(HIDDEN).setPosition(_hv.setFromMatrixPosition(m)));
    this.dirty = true;
  }
  label(i, which, rect) {
    const a = this.mesh.geometry.attributes[which === 'B' ? 'aLabelB' : 'aLabelA'];
    if (!a) return;
    a.setXYZW(i, rect[0], rect[1], rect[2], rect[3]);
    a.needsUpdate = true;
  }
  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
  finishInit() {
    this.flush();
    this.mesh.computeBoundingSphere();
    if (this.mesh.boundingSphere) this.mesh.boundingSphere.radius += 0.6;
    this.mesh.computeBoundingBox?.();
  }
  raycast(raycaster, intersects) {
    const ray = raycaster.ray, far = raycaster.far, near = raycaster.near;
    const reach = (far === Infinity ? 1e6 : far) + 1.6;
    let best = null;
    for (let i = 0; i < this.count; i++) {
      if (!this.vis[i] || i >= this.mesh.count) continue;
      const e = this.mats[i].elements;
      const dx = e[12] - ray.origin.x, dy = e[13] - ray.origin.y, dz = e[14] - ray.origin.z;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      _ray.copy(ray).applyMatrix4(this.inv[i]);
      for (const b of this.boxes) {
        if (!_ray.intersectBox(b.box, _p)) continue;
        _v.copy(_p).applyMatrix4(this.mats[i]);
        const d = _v.distanceTo(ray.origin);
        if (d < near || d > far) continue;
        if (!best || d < best.distance) best = { distance: d, point: _v.clone(), object: this.mesh, instanceId: i, tag: b.tag, local: _p.clone(), face: null };
      }
    }
    if (best) intersects.push(best);
  }
}
const bx = (min, max, tag) => ({ box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), tag });

// ------------------------------------------------------------------------------------------------
export async function init(app) {
  const root = new THREE.Group();
  root.name = 'seats';
  app.cabinRoot.add(root);
  const detail = app.quality?.detail ?? 1;
  const q = detail >= 2 ? 1 : detail === 1 ? 0.8 : 0.5;
  const E = P.ECON, B = P.BUS;

  // --- textures & materials -------------------------------------------------------------------
  const tex = {
    plac: TX.placardAtlas(), lit: TX.literatureAtlas(), paper: TX.paperAtlas(), tray: TX.trayTexture(),
    coverE: TX.coverTexture(), coverB: TX.coverTexture({ business: true }), webbing: TX.webbingTexture(),
  };
  const M = createMaterials(app, tex);

  // --- seat records ---------------------------------------------------------------------------
  const rowIndex = new Map(ROWS.map((r, i) => [r.row, i]));
  const recs = SEAT_LIST.map((s, i) => ({ d: s, i, bus: s.cls === 'business', ci: -1, row: ROWS[rowIndex.get(s.row)] }));
  const econ = recs.filter((r) => !r.bus), bus = recs.filter((r) => r.bus);
  econ.forEach((r, k) => { r.ci = k; });
  bus.forEach((r, k) => { r.ci = k; });
  const recById = new Map(recs.map((r) => [r.d.id, r]));
  const seatInFront = (r) => {
    const k = rowIndex.get(r.d.row);
    const prev = ROWS[k - 1];
    if (!prev || prev.cls !== r.d.cls) return null;
    return recById.get(`${prev.row}${r.d.letter}`) || null;
  };

  // per-seat geometry parameters: base tilt, max recline (obstacles behind: lavs, class divider)
  const obstacleBehind = (r) => {
    if (!r.bus && r.d.row === 29) return ZONES.aftLavs.zMin;
    if (r.bus && r.d.row === 4) return ZONES.classDividerZ - 0.03;
    return Infinity;
  };
  const topOffset = (D, a) => D.back.pivotZ + D.back.H * Math.sin(a) + D.back.zbTop * Math.cos(a);
  for (const r of recs) {
    const D = r.bus ? B : E;
    r.D = D;
    const lim = obstacleBehind(r) - r.d.z - 0.006;
    let tilt = D.back.tilt;
    while (tilt > 0 && topOffset(D, tilt) > lim) tilt -= 0.25 * DEG;
    r.tilt = Math.max(0, tilt);
    let maxRec = (D.reclineDeg) * DEG;
    if (!r.bus && (r.d.row === 15 || r.d.row === 16)) maxRec = 0;     // exit rows: no recline
    while (maxRec > 0 && topOffset(D, r.tilt + maxRec) > lim) maxRec -= 0.25 * DEG;
    r.maxRec = maxRec > 1.5 * DEG ? maxRec : 0;
    r.recP = 0; r.recT = 0; r.trayP = 0; r.trayT = 0; r.legP = 0; r.legT = 0; r.belt = false;
    r.active = false;
  }

  // --- descriptors ----------------------------------------------------------------------------
  const list = recs.map((r) => {
    const s = r.d, D = r.D;
    const eyeZ = D.eyeZ - 0.7 * (Math.sin(D.back.tilt) - Math.sin(r.tilt));
    const desc = {
      ...s,
      position: new THREE.Vector3(s.x, D.cushion.top, s.z),
      eye: new THREE.Vector3(s.x, SEAT.seatedEyeHeight, s.z + eyeZ),
      standPoint: new THREE.Vector3(0, 0, s.z + 0.05),
      screenAnchor: null,
      screenSize: r.bus ? { w: 0.294, h: 0.165 } : { w: 0.218, h: 0.136 },
      state: { tray: 0, recline: 0, belt: false, armrests: [0, 0], occupied: false, legrest: 0 },
      eyeIncludesRecline: true,
      canRecline: r.maxRec > 0,
      trayInArmrest: false,
    };
    r.desc = desc;
    r.eye0 = desc.eye.clone();
    return desc;
  });

  // --- geometry builds -----------------------------------------------------------------------
  const geo = {
    eStatic: P.buildSeatStatic(E, q, tex), bStatic: P.buildSeatStatic(B, q, tex),
    eBack: P.buildBack(E, q, tex), bBack: P.buildBack(B, q, tex),
    tray: P.buildTray(E), latch: P.buildLatch(),
    arm: P.buildArmrest(false), armBulk: P.buildArmrest(true), button: P.buildButton(),
    eBlock: P.buildEconBlock(tex), bBlock: P.buildBusBlock(tex), legrest: P.buildLegrest(),
    trayA: P.buildArmTrayHalf(false), trayB: P.buildArmTrayHalf(true),
    belts: P.buildBelts(), mount: P.buildMount(tex),
  };

  const nE = econ.length, nB = bus.length;
  const EC = E.cushion, BC = B.cushion, EB = E.back, BB = B.back;
  const backBoxes = (D) => {
    const b = D.back, a = b.a0 + 0.01, mid = (b.zf + b.zb) / 2;
    return [
      bx([-a, b.yb, -0.08], [a, b.H + 0.01, mid], 'front'),
      bx([-a, b.yb, mid], [a, b.H + 0.01, b.zb + 0.004], 'rear'),
      bx([-D.pocket.hw, D.pocket.y0, b.zb], [D.pocket.hw, D.pocket.y1 + 0.035, b.zb + 0.032], 'lit'),
    ];
  };
  const I = {};
  I.eStatic = new Inst(root, 'econ-static', geo.eStatic, materialsFor(M, geo.eStatic.keys), nE, { labels: true, boxes: [bx([-EC.hw, 0.33, EC.z0], [EC.hw, EC.top + 0.012, EC.z1], 'cushion')] });
  I.bStatic = new Inst(root, 'bus-static', geo.bStatic, materialsFor(M, geo.bStatic.keys), nB, { labels: true, boxes: [bx([-BC.hw, 0.33, BC.z0], [BC.hw, BC.top + 0.012, BC.z1], 'cushion')] });
  I.eBack = new Inst(root, 'econ-back', geo.eBack, materialsFor(M, geo.eBack.keys), nE, { dynamic: true, labels: true, boxes: backBoxes(E) });
  I.bBack = new Inst(root, 'bus-back', geo.bBack, materialsFor(M, geo.bBack.keys, { cloth: M.clothB }), nB, { dynamic: true, labels: true, boxes: backBoxes(B) });
  const T = E.tray;
  I.tray = new Inst(root, 'econ-tray', geo.tray, materialsFor(M, geo.tray.keys), nE, { dynamic: true, boxes: [bx([-T.w / 2, 0, -0.005], [T.w / 2, T.len + 0.012, T.t + 0.006], 'tray')] });
  I.latch = new Inst(root, 'econ-latch', geo.latch, materialsFor(M, geo.latch.keys), nE, { dynamic: true, shadow: false, boxes: [bx([-0.03, -0.014, 0], [0.03, 0.014, 0.032], 'tray')] });

  // economy armrests: 4 stations per triple
  const EA = E.arm;
  const armBox = [bx([-0.03, -0.04, EA.front - EA.pivotZ - 0.01], [0.03, EA.top - EA.pivotY + 0.008, 0.05], 'arm')];
  const arms = [];
  const eBlocks = [];
  for (const row of ROWS) {
    if (row.cls !== 'economy') continue;
    for (const side of ['left', 'right']) {
      const letters = side === 'left' ? ['A', 'B', 'C'] : ['D', 'E', 'F'];
      const bxX = row.x[side === 'left' ? 'B' : 'E'];
      const block = { row, side, x: bxX, z: row.z, seats: letters.map((L) => recById.get(`${row.row}${L}`)), arms: [] };
      for (let st = 0; st < 4; st++) {
        const wall = (side === 'left' && st === 0) || (side === 'right' && st === 3);
        const arm = { id: arms.length, block, st, x: bxX + (st - 1.5) * EA.pitch, z: row.z, bulk: row.row === 6, liftable: row.row !== 6 && !wall, p: 0, t: 0, active: false, left: block.seats[st - 1] || null, right: block.seats[st] || null, idx: -1 };
        arms.push(arm); block.arms.push(arm);
      }
      block.seats.forEach((r, k) => { r.block = block; r.k = k; r.armL = block.arms[k]; r.armR = block.arms[k + 1]; });
      eBlocks.push(block);
    }
  }
  const armsN = arms.filter((a) => !a.bulk), armsB = arms.filter((a) => a.bulk);
  armsN.forEach((a, k) => { a.idx = k; a.inst = 'arm'; });
  armsB.forEach((a, k) => { a.idx = k; a.inst = 'armBulk'; });
  I.arm = new Inst(root, 'econ-armrest', geo.arm, materialsFor(M, geo.arm.keys), armsN.length, { dynamic: true, boxes: armBox });
  I.armBulk = new Inst(root, 'econ-armrest-bulkhead', geo.armBulk, materialsFor(M, geo.armBulk.keys), armsB.length, { boxes: [bx([-0.03, -0.26, -0.39], [0.03, EA.top - EA.pivotY + 0.008, 0.05], 'armtray')] });
  I.button = new Inst(root, 'recline-button', geo.button, materialsFor(M, geo.button.keys), nE + nB, { dynamic: true, shadow: false, boxes: [bx([-0.004, -0.016, -0.016], [0.016, 0.016, 0.016], 'button')] });
  I.eBlock = new Inst(root, 'econ-frame', geo.eBlock, materialsFor(M, geo.eBlock.keys), eBlocks.length, { labels: true });

  // business pairs
  const bBlocks = [];
  for (const row of ROWS) {
    if (row.cls !== 'business') continue;
    for (const side of ['left', 'right']) {
      const letters = side === 'left' ? ['A', 'C'] : ['D', 'F'];
      const seats = letters.map((L) => recById.get(`${row.row}${L}`));
      const block = { row, side, x: (row.x[letters[0]] + row.x[letters[1]]) / 2, z: row.z, seats, idx: bBlocks.length };
      seats.forEach((r, k) => { r.block = block; r.k = k; });
      bBlocks.push(block);
    }
  }
  const BA = B.arm;
  I.bBlock = new Inst(root, 'bus-frame', geo.bBlock, materialsFor(M, geo.bBlock.keys), bBlocks.length, {
    labels: true,
    boxes: [
      bx([-BA.x - BA.w / 2, 0.3, -0.26], [-BA.x + BA.w / 2, BA.top + 0.01, 0.25], 'armL'),
      bx([BA.x - BA.w / 2, 0.3, -0.26], [BA.x + BA.w / 2, BA.top + 0.01, 0.25], 'armR'),
      bx([-0.1, 0.3, -0.29], [0.1, 0.665, 0.22], 'console'),
    ],
  });
  const L = B.legrest;
  I.legrest = new Inst(root, 'bus-legrest', geo.legrest, materialsFor(M, geo.legrest.keys), nB, { dynamic: true, boxes: [bx([-L.w / 2, -L.len, -0.03], [L.w / 2, 0.0, L.t], 'legrest')] });

  // armrest trays (business all seats, economy row 6)
  const armTrays = [];
  for (const r of recs) {
    if (!(r.bus || r.d.row === 6)) continue;
    let sigma, xArm, top, stowZ, dep, sx, sz;
    if (r.bus) {
      sigma = (r.d.letter === 'A' || r.d.letter === 'D') ? 1 : -1;
      xArm = r.block.x + (sigma > 0 ? -BA.x : BA.x);
      top = BA.top; stowZ = -0.03; dep = -0.17; sx = 1; sz = 1;
    } else {
      const map = { A: [0, 1], B: [1, 1], C: [3, -1], D: [0, 1], E: [2, -1], F: [3, -1] };
      const [st, sg] = map[r.d.letter];
      sigma = sg; xArm = r.block.arms[st].x; top = EA.top; stowZ = -0.19; dep = -0.165; sx = 0.19 / P.ARMTRAY.wHalf; sz = 0.88;
      r.trayStation = st;
    }
    const at = { idx: armTrays.length, seat: r, sigma, xArm, top, stowZ, dep, sx, sz };
    armTrays.push(at);
    r.armTray = at;
    r.desc.trayInArmrest = true;
  }
  I.trayA = new Inst(root, 'arm-tray-a', geo.trayA, materialsFor(M, geo.trayA.keys), armTrays.length, { dynamic: true, boxes: [bx([-P.ARMTRAY.wHalf / 2, -0.01, -P.ARMTRAY.depth / 2], [P.ARMTRAY.wHalf / 2, 0.012, P.ARMTRAY.depth / 2], 'armtray')] });
  I.trayB = new Inst(root, 'arm-tray-b', geo.trayB, materialsFor(M, geo.trayB.keys), armTrays.length, { dynamic: true, boxes: [bx([-P.ARMTRAY.wHalf / 2, -0.01, -P.ARMTRAY.depth / 2], [P.ARMTRAY.wHalf / 2, 0.012, P.ARMTRAY.depth / 2], 'armtray')] });

  // belts (shared by both classes; business instances scaled)
  const N = recs.length;
  I.beltL = new Inst(root, 'belt-loose', geo.belts.loose, materialsFor(M, geo.belts.loose.keys), N, { dynamic: true, shadow: detail >= 2 });
  I.beltF = new Inst(root, 'belt-fastened', geo.belts.fastened, materialsFor(M, geo.belts.fastened.keys), 16, { dynamic: true, boxes: [bx([-0.21, EC.top + 0.07, -0.06], [0.21, EC.top + 0.2, 0.17], 'belt')] });

  I.beltF.mesh.frustumCulled = false;
  // bulkhead screen mounts (rows 1 and 6)
  const mountSeats = recs.filter((r) => !seatInFront(r));
  I.mount = new Inst(root, 'bulkhead-mount', geo.mount, materialsFor(M, geo.mount.keys), mountSeats.length, { shadow: false });

  // --- back pivots + screen anchors ---------------------------------------------------------
  for (const r of recs) {
    const pv = new THREE.Object3D();
    pv.name = `seat-back-pivot-${r.d.id}`;
    pv.matrixAutoUpdate = false;
    root.add(pv);
    r.pivot = pv;
  }
  const anchorFrom = (m, a) => { m.decompose(a.position, a.quaternion, a.scale); a.updateMatrix(); };
  mountSeats.forEach((r, k) => {
    const s = r.d;
    let x = s.x, y, z;
    if (r.bus) { z = ZONES.businessFrontBulkheadZ + 0.034; y = 0.93; } else { z = ZONES.classDividerZ + 0.03; y = 0.95; if (Math.abs(x) < 0.6) x = Math.sign(x) * 0.545; }
    const a = new THREE.Object3D();
    a.name = `screenAnchor-${s.id}`;
    a.position.set(x, y, z + 0.03);
    root.add(a);
    r.desc.screenAnchor = a;
    _m.makeTranslation(x, y, z + 0.028);
    I.mount.set(k, _m);
  });
  for (const r of recs) {
    const host = seatInFront(r);
    r.host = host;
    if (host) {
      host.behind = r;
      const a = new THREE.Object3D();
      a.name = `screenAnchor-${r.d.id}`;
      anchorFrom((r.bus ? geo.bBack : geo.eBack).anchor, a);
      host.pivot.add(a);
      r.desc.screenAnchor = a;
    }
    // economy seatback trays are hosted by the seat in front
    if (!r.bus && host) r.trayHost = host;
  }

  // --- matrices -----------------------------------------------------------------------------
  const backMatrix = (r, out) => {
    const D = r.D;
    const ang = r.tilt + r.maxRec * easeInOutSine(r.recP);
    out.makeRotationX(ang);
    out.setPosition(r.d.x, D.back.pivotY, r.d.z + D.back.pivotZ);
    return out;
  };
  const trayAngles = (p) => {
    const latch = ease(p / 0.22) * 90 * DEG;
    const drop = p <= 0.2 ? 0 : easeOutBack((p - 0.2) / 0.8, 0.55);
    return [latch, drop];
  };
  function updateBack(r) {
    backMatrix(r, _m);
    (r.bus ? I.bBack : I.eBack).set(r.ci, _m);
    r.pivot.matrix.copy(_m);
    r.pivot.matrixWorldNeedsUpdate = true;
    if (!r.bus) updateSeatTray(r);
    if (r.bottle !== undefined) updateBottle(r);
    // eye follows the recline (head rotates about the pivot, ~85 %)
    const rec = r.maxRec * easeInOutSine(r.recP) * 0.85;
    const D = r.D;
    const py = D.back.pivotY, pz = r.d.z + D.back.pivotZ;
    const ey = r.eye0.y - py, ez = r.eye0.z - pz;
    const c = Math.cos(rec), s = Math.sin(rec);
    r.desc.eye.set(r.eye0.x, py + ey * c - ez * s, pz + ey * s + ez * c);
    r.desc.state.recline = easeInOutSine(r.recP);
  }
  // tray on the back of `host` (deployed by the passenger behind)
  function updateSeatTray(host) {
    const pas = host.behind && !host.behind.bus ? host.behind : null;
    const p = pas ? pas.trayP : host.ajar || 0;
    const [latch, drop] = trayAngles(p);
    backMatrix(host, _m);
    const zb = E.back.zb;
    _m2.makeRotationX(drop * (90 * DEG - E.back.tilt));
    _m2.setPosition(0, T.hingeY, zb);
    _m3.multiplyMatrices(_m, _m2);
    I.tray.set(host.ci, _m3);
    _m2.makeRotationZ(latch);
    _m2.setPosition(0, E.latchY, zb);
    _m3.multiplyMatrices(_m, _m2);
    I.latch.set(host.ci, _m3);
  }
  function updateArm(a) {
    const ang = 100 * DEG * easeInOutSine(a.p);
    _m.makeRotationX(ang);
    _m.setPosition(a.x, EA.pivotY, a.z + EA.pivotZ);
    (a.bulk ? I.armBulk : I.arm).set(a.idx, _m);
    // the button of the seat to the right of this armrest rides on it
    if (a.right) {
      _m2.makeTranslation(EA.w / 2 - 0.002, -0.014, EA.front - EA.pivotZ + 0.045);
      _m3.multiplyMatrices(_m, _m2);
      I.button.set(a.right.ci, _m3);
    }
    const v = easeInOutSine(a.p);
    if (a.left) a.left.desc.state.armrests[1] = v;
    if (a.right) a.right.desc.state.armrests[0] = v;
  }
  function updateLegrest(r) {
    const ang = (L.foldDeg + (L.openDeg - L.foldDeg) * easeInOutSine(r.legP)) * DEG;
    _m.makeRotationX(ang);
    _m.setPosition(r.d.x, L.y, r.d.z + L.z);
    I.legrest.set(r.ci, _m);
    r.desc.state.legrest = easeInOutSine(r.legP);
  }
  function updateArmTray(at) {
    const p = at.seat.trayP;
    const T2 = P.ARMTRAY, t = T2.t, sg = at.sigma;
    const w = T2.wHalf * at.sx;
    const rise = ease(p / 0.3), sw = ease((p - 0.3) / 0.4), uf = ease((p - 0.7) / 0.3);
    const axisX = at.xArm - sg * t / 2, axisY = at.top + t;
    const riseY = -(w + 0.035) * (1 - rise);
    const zc = at.seat.d.z + at.stowZ + (at.dep - at.stowZ) * sw;
    // A: T(axis) * Rz(sg*PI/2*(1-sw)) * T(sg*w/2, -t/2, 0) * S
    _m.makeRotationZ(sg * Math.PI / 2 * (1 - sw));
    _m.setPosition(axisX, axisY + riseY, zc);
    _m2.makeTranslation(sg * w / 2, -t / 2, 0);
    _m.multiply(_m2);                                  // A centre frame (unscaled)
    _s.makeScale(at.sx, 1, at.sz);
    _m3.multiplyMatrices(_m, _s);
    const visible = p > 0.001;
    I.trayA.set(at.idx, _m3, visible);
    // B: A * T(sg*w/2, t/2, 0) * Rz(sg*PI*(1-uf)) * T(sg*w/2, -t/2, 0) * S
    _m2.makeTranslation(sg * w / 2, t / 2, 0);
    _m.multiply(_m2);
    _m2.makeRotationZ(sg * Math.PI * (1 - uf));
    _m.multiply(_m2);
    _m2.makeTranslation(sg * w / 2, -t / 2, 0);
    _m.multiply(_m2);
    _m.multiply(_s);
    I.trayB.set(at.idx, _m, visible);
    at.seat.desc.state.tray = p;
  }
  function updateBelt(r) {
    _m.makeTranslation(r.d.x, 0, r.d.z);
    if (r.bus) { _s.makeScale(BC.hw / EC.hw, 1, (BC.z1 - BC.z0) / (EC.z1 - EC.z0)); _m.multiply(_s); _m.elements[13] = BC.top - EC.top; }
    I.beltL.set(r.i, _m, !r.belt);
    // fastened belts are compacted into the first slots (mesh.count = number fastened)
    const k = fastened.indexOf(r);
    if (r.belt && k < 0) { if (fastened.length >= I.beltF.count) { const old = fastened.shift(); old.belt = false; I.beltL.set(old.i, _m3.makeTranslation(old.d.x, 0, old.d.z), true); old.desc.state.belt = false; } fastened.push(r); }
    if (!r.belt && k >= 0) fastened.splice(k, 1);
    for (let j = 0; j < fastened.length; j++) {
      const f = fastened[j];
      _m2.makeTranslation(f.d.x, 0, f.d.z);
      if (f.bus) { _s.makeScale(BC.hw / EC.hw, 1, (BC.z1 - BC.z0) / (EC.z1 - EC.z0)); _m2.multiply(_s); _m2.elements[13] = BC.top - EC.top; }
      I.beltF.set(j, _m2);
    }
    for (let j = fastened.length; j < I.beltF.count; j++) I.beltF.vis[j] = 0;
    I.beltF.mesh.count = Math.max(0, fastened.length);
    r.desc.state.belt = r.belt;
  }
  const fastened = [];

  // --- initial placement --------------------------------------------------------------------
  const rnd = mulberry(738);
  const tint = new THREE.Color();
  for (const r of recs) {
    _m.makeTranslation(r.d.x, 0, r.d.z);
    (r.bus ? I.bStatic : I.eStatic).set(r.ci, _m);
    const v = 0.94 + 0.08 * rnd();
    tint.setRGB(v, v, v * (0.99 + 0.02 * rnd()));
    (r.bus ? I.bStatic : I.eStatic).mesh.setColorAt(r.ci, tint);
    (r.bus ? I.bBack : I.eBack).mesh.setColorAt(r.ci, tint);
    updateBack(r);
    updateBelt(r);
    if (r.bus) {
      updateLegrest(r);
      // business recline button on the console top
      const blk = r.block;
      const bx0 = blk.x + (r.k === 0 ? -0.032 : 0.032);
      _m.makeRotationZ(Math.PI / 2);
      _m.setPosition(bx0, 0.656, blk.z + 0.1);
      I.button.set(nE + r.ci, _m);
    }
    // labels: row label on the backrest sides (economy), exit-row placard on rows 15/16 backs
    if (!r.bus) {
      I.eBack.label(r.ci, 'A', tex.plac.labelRect(r.d.row, r.d.side));
      I.eBack.label(r.ci, 'B', (r.d.row === 15 || r.d.row === 16) ? tex.plac.rect('exitrow') : tex.plac.rect('none'));
    } else {
      I.bBack.label(r.ci, 'A', tex.plac.rect('none'));
      I.bBack.label(r.ci, 'B', tex.plac.rect('none'));
    }
  }
  for (const a of arms) updateArm(a);
  eBlocks.forEach((b, k) => { _m.makeTranslation(b.x, 0, b.z); I.eBlock.set(k, _m); });
  bBlocks.forEach((b, k) => { _m.makeTranslation(b.x, 0, b.z); I.bBlock.set(k, _m); I.bBlock.label(k, 'A', tex.plac.labelRect(b.row.row, b.side)); });
  for (const at of armTrays) updateArmTray(at);
  for (const r of recs) if (!r.bus && !r.behind) updateSeatTray(r);

  // a tray table left slightly ajar by the cleaning crew
  const ajar = recById.get('24C');
  if (ajar && ajar.trayHost) { ajar.trayP = 0.245; ajar.trayT = 0; updateSeatTray(ajar.trayHost); ajar.trayT = ajar.trayP; }

  // --- dressing (pillows, blankets, newspapers, headphones, bottles) ------------------------
  const dress = buildDressing(app, root, M, tex, recs, recById, I, E, B);
  function updateBottle(host) { dress.updateBottle(host, backMatrix(host, _m2)); }
  for (const r of recs) if (r.bottle !== undefined) updateBottle(r);

  for (const k of Object.keys(I)) I[k].finishInit();
  if (I.eStatic.mesh.instanceColor) I.eStatic.mesh.instanceColor.needsUpdate = true;

  // --- animation ----------------------------------------------------------------------------
  const active = [];
  const activeArms = [];
  const touch = (r) => { if (!r.active) { r.active = true; active.push(r); } };
  const approach = (v, t, rate, dt) => (v < t ? Math.min(t, v + rate * dt) : Math.max(t, v - rate * dt));
  function step(dt) {
    for (let k = active.length - 1; k >= 0; k--) {
      const r = active[k];
      let busy = false;
      if (r.recP !== r.recT) { r.recP = approach(r.recP, r.recT, r.bus ? 1 / 3.2 : 1 / 1.7, dt); updateBack(r); busy = true; }
      if (r.trayP !== r.trayT) {
        r.trayP = approach(r.trayP, r.trayT, r.armTray ? 1 / 1.6 : 1 / 0.95, dt);
        if (r.armTray) updateArmTray(r.armTray);
        else if (r.trayHost) { updateSeatTray(r.trayHost); r.desc.state.tray = r.trayP; }
        busy = true;
      }
      if (r.legP !== r.legT) { r.legP = approach(r.legP, r.legT, 1 / 2.6, dt); updateLegrest(r); busy = true; }
      if (!busy) { r.active = false; active[k] = active[active.length - 1]; active.pop(); }
    }
    for (let k = activeArms.length - 1; k >= 0; k--) {
      const a = activeArms[k];
      a.p = approach(a.p, a.t, 1 / 0.55, dt);
      updateArm(a);
      if (a.p === a.t) { a.active = false; activeArms[k] = activeArms[activeArms.length - 1]; activeArms.pop(); }
    }
    for (const k in I) I[k].flush();
    cardStep(dt);
  }
  app.addUpdate((dt) => step(dt), 40, 'seats');

  // --- sounds / helpers -----------------------------------------------------------------------
  const play = (name, pos, volume = 1) => { try { app.audio?.play?.(name, { position: pos, volume }); } catch { /* optional */ } };
  const seatPos = (r, dy = 0.5) => new THREE.Vector3(r.d.x, dy, r.d.z);
  const toast = (t, ms = 2600) => { try { app.hud?.toast?.(t, ms); } catch { /* optional */ } };

  // --- public setters -----------------------------------------------------------------------
  function setTray(id, v) {
    const r = recById.get(String(id).toUpperCase());
    if (!r || !(r.trayHost || r.armTray)) return false;
    const t = typeof v === 'number' ? clamp01(v) : (v ? 1 : 0);
    if (t === r.trayT) return true;
    const opening = t > r.trayP;
    r.trayT = t;
    touch(r);
    const where = r.trayHost ? new THREE.Vector3(r.d.x, 0.75, r.trayHost.d.z + 0.45) : seatPos(r, 0.66);
    play(opening ? 'tray_open' : 'tray_close', where, 0.9);
    return true;
  }
  function setRecline(id, v) {
    const r = recById.get(String(id).toUpperCase());
    if (!r || r.maxRec <= 0) return false;
    const t = typeof v === 'number' ? clamp01(v) : (v ? 1 : 0);
    if (t === r.recT) return true;
    r.recT = t;
    touch(r);
    play('button_press', seatPos(r, 0.64), 0.6);
    play('recline', seatPos(r, 0.8), 0.8);
    return true;
  }
  function setBelt(id, on) {
    const r = recById.get(String(id).toUpperCase());
    if (!r) return false;
    on = !!on;
    if (r.belt === on) return true;
    r.belt = on;
    updateBelt(r);
    play(on ? 'belt_buckle' : 'belt_unbuckle', seatPos(r, 0.6), 1);
    return true;
  }
  function setArmrest(id, idx, up) {
    const r = recById.get(String(id).toUpperCase());
    if (!r || r.bus) return false;
    const a = idx ? r.armR : r.armL;
    if (!a || !a.liftable) return false;
    const t = up ? 1 : 0;
    if (a.t === t) return true;
    a.t = t;
    if (!a.active) { a.active = true; activeArms.push(a); }
    play('armrest', new THREE.Vector3(a.x, 0.62, a.z), 0.8);
    return true;
  }
  function setLegrest(id, v) {
    const r = recById.get(String(id).toUpperCase());
    if (!r || !r.bus) return false;
    const t = typeof v === 'number' ? clamp01(v) : (v ? 1 : 0);
    if (t === r.legT) return true;
    r.legT = t;
    touch(r);
    play('recline', seatPos(r, 0.35), 0.6);
    return true;
  }

  // --- safety card (3D card + focus mode; HUD / toast fallbacks) ---------------------------------
  const card = createCard(app, root, tex);
  function readCard(id) {
    const r = id ? recById.get(String(id).toUpperCase()) : null;
    return card.open(r, backMatrix);
  }
  function cardStep(dt) { card.step(dt); }

  // --- interactions ---------------------------------------------------------------------------
  const playerSeat = () => { try { return app.player?.seat || null; } catch { return null; } };
  const sitAction = (r) => {
    if (playerSeat() === r.d.id || !app.player?.sit) return null;
    return { label: `Sit in ${r.d.id}`, run: () => app.player.sit(r.d.id) };
  };
  const beltAction = (r) => ({ label: r.belt ? 'Unfasten seatbelt' : 'Fasten seatbelt', run: () => setBelt(r.d.id, !r.belt) });
  const trayAction = (r) => ({ label: r.trayT > 0.5 ? (r.armTray ? 'Stow tray table' : 'Raise tray table') : 'Lower tray table', run: () => setTray(r.d.id, r.trayT > 0.5 ? 0 : 1) });
  const reclineAction = (r) => (r.maxRec > 0
    ? { label: r.recT > 0.5 ? 'Return seat upright' : 'Recline seat', run: () => setRecline(r.d.id, r.recT > 0.5 ? 0 : 1) }
    : { label: 'This seat does not recline', run: () => toast(r.d.exitRow || r.d.row === 15 ? 'Seats next to the emergency exits do not recline.' : 'This seat does not recline.') });
  const near = (hit, r, d = 1.6) => hit.distance < d || playerSeat() === r.d.id;
  const resolvers = {
    eStatic: (hit) => { const r = econ[hit.instanceId]; return playerSeat() === r.d.id ? beltAction(r) : sitAction(r); },
    bStatic: (hit) => { const r = bus[hit.instanceId]; return playerSeat() === r.d.id ? beltAction(r) : sitAction(r); },
    eBack: (hit) => {
      const r = econ[hit.instanceId];
      if (hit.tag === 'lit') return { label: 'Read the safety card', run: () => readCard(r.behind ? r.behind.d.id : r.d.id) };
      if (hit.tag === 'rear' && r.behind && !r.behind.bus) return near(hit, r.behind) ? trayAction(r.behind) : null;
      return sitAction(r);
    },
    bBack: (hit) => {
      const r = bus[hit.instanceId];
      if (hit.tag === 'lit') return { label: 'Read the safety card', run: () => readCard(r.behind ? r.behind.d.id : r.d.id) };
      return sitAction(r);
    },
    tray: (hit) => { const h = econ[hit.instanceId]; return h.behind ? trayAction(h.behind) : null; },
    latch: (hit) => { const h = econ[hit.instanceId]; return h.behind ? trayAction(h.behind) : null; },
    arm: (hit) => {
      const a = armsN[hit.instanceId];
      const sat = playerSeat();
      // front end of the armrest carries the recline button of the seat to its right
      if (a.right && sat === a.right.d.id && hit.local && hit.local.z < EA.front - EA.pivotZ + 0.08) return reclineAction(a.right);
      if (!a.liftable) return null;
      const r = a.right && a.left ? (sat === a.left.d.id ? a.left : a.right) : (a.right || a.left);
      if (!r) return null;
      return { label: a.t > 0.5 ? 'Lower armrest' : 'Raise armrest', run: () => setArmrest(r.d.id, r.armL === a ? 0 : 1, a.t < 0.5) };
    },
    armBulk: (hit) => {
      const a = armsB[hit.instanceId];
      const owner = a.block.seats.find((s) => s.trayStation === a.st);
      if (owner && playerSeat() === owner.d.id) return trayAction(owner);
      if (a.right && playerSeat() === a.right.d.id && hit.local && hit.local.z < EA.front - EA.pivotZ + 0.08) return reclineAction(a.right);
      return owner && near(hit, owner, 1.8) ? trayAction(owner) : null;
    },
    button: (hit) => { const k = hit.instanceId; const r = k < nE ? econ[k] : bus[k - nE]; return near(hit, r, 1.7) ? reclineAction(r) : null; },
    beltF: (hit) => { const r = fastened[hit.instanceId]; if (!r) return null; return playerSeat() === r.d.id ? beltAction(r) : null; },
    legrest: (hit) => { const r = bus[hit.instanceId]; return near(hit, r, 1.8) ? { label: r.legT > 0.5 ? 'Retract leg rest' : 'Extend leg rest', run: () => setLegrest(r.d.id, r.legT > 0.5 ? 0 : 1) } : null; },
    bBlock: (hit) => {
      const blk = bBlocks[hit.instanceId];
      const sat = playerSeat();
      if (hit.tag === 'armL' || hit.tag === 'armR') {
        const r = blk.seats[hit.tag === 'armL' ? 0 : 1];
        return near(hit, r, 1.8) ? trayAction(r) : null;
      }
      const r = blk.seats[(hit.local && hit.local.x > 0) ? 1 : 0];
      if (sat === blk.seats[0].d.id || sat === blk.seats[1].d.id) {
        const mine = recById.get(sat);
        return { label: mine.legT > 0.5 ? 'Retract leg rest' : 'Extend leg rest', run: () => setLegrest(mine.d.id, mine.legT > 0.5 ? 0 : 1) };
      }
      return near(hit, r, 1.7) ? reclineAction(r) : null;
    },
    trayA: (hit) => trayAction(armTrays[hit.instanceId].seat),
    trayB: (hit) => trayAction(armTrays[hit.instanceId].seat),
  };
  const handles = [];
  let cacheHit = null, cacheRes = null, cacheFrame = -1;
  const resolve = (kind, hit) => {
    if (hit === cacheHit && cacheFrame === app.frame) return cacheRes;
    cacheHit = hit; cacheFrame = app.frame;
    try { cacheRes = resolvers[kind](hit); } catch (e) { console.error('[seats] interaction', e); cacheRes = null; }
    return cacheRes;
  };
  if (app.interactions?.add) {
    for (const kind of Object.keys(resolvers)) {
      const inst = I[kind === 'beltF' ? 'beltF' : kind];
      if (!inst) continue;
      handles.push(app.interactions.add({
        object: inst.mesh,
        label: (hit) => resolve(kind, hit)?.label || '',
        enabled: (hit) => !!resolve(kind, hit),
        onInteract: (hit) => { const a = resolve(kind, hit); cacheHit = null; a?.run?.(); },
        maxDistance: 2.1,
        priority: kind === 'button' || kind === 'latch' ? 2 : 1,
      }));
    }
  }

  // --- colliders ------------------------------------------------------------------------------
  const colliderIds = [];
  if (app.colliders?.addBox) {
    const exitAhead = new Set([15, 16]);       // rows whose back faces an over-wing exit passage
    for (const row of ROWS) {
      const D = row.cls === 'business' ? B : E;
      const backTop = row.cls === 'business' ? 0.56 : (exitAhead.has(row.row) ? 0.31 : 0.5);
      const front = row.cls === 'business' ? -0.3 : (row.exitRow ? -0.2 : -0.225);
      const inner = row.cls === 'business' ? AISLE.businessHalfWidth : 0.252;
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -1.72 : inner, x1 = s < 0 ? -inner : 1.72;
        colliderIds.push(app.colliders.addBox([x0, 0, row.z + front], [x1, row.cls === 'business' ? BB.pivotY + BB.H : EB.pivotY + EB.H, row.z + backTop], { tag: 'seats' }));
      }
      void D;
    }
  }

  // --- player hooks: hide dressing on the occupied seat ---------------------------------------
  app.events.on('player:sit', ({ seatId }) => dress.setHidden(seatId, true));
  app.events.on('player:stand', ({ seatId }) => dress.setHidden(seatId, false));

  const byIdMap = new Map(list.map((d) => [d.id, d]));
  const api = {
    list,
    byId: (id) => byIdMap.get(String(id).toUpperCase()) || null,
    setTray, setRecline, setBelt, setArmrest, setLegrest,
    readCard, closeCard: () => card.close(),
    seatInFront: (id) => { const r = recById.get(String(id).toUpperCase()); return r?.host ? r.host.desc : null; },
    meshes: Object.fromEntries(Object.entries(I).map(([k, v]) => [k, v.mesh])),
    root,
    _internal: { recs, I, arms, armTrays, geo, M, tex, colliderIds, handles, card },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------------------------------------
// Realism dressing: business pillows + blankets on every seat; a few economy seats with a blanket
// and pillow, headphones, a newspaper; water bottles in some seat pockets.
// ------------------------------------------------------------------------------------------------
function buildDressing(app, root, M, tex, recs, recById, I, E, B) {
  const pillowG = P.buildPillow(), blanketG = P.buildBlanket(), paper = P.buildNewspaper(tex), bottleG = P.buildBottle();
  const econPB = ['7B', '9E', '11F', '14A', '18C', '20D', '23E', '25A', '27F', '12C', '21B'];
  const phones = ['8D', '10A', '15E', '19B', '22F', '26C', '16F', '28A'];
  const news = ['9A', '17D', '21C', '24F', '11B'];
  const bottles = ['6D', '8B', '10E', '12A', '15C', '17F', '19D', '21A', '23B', '26E', '28C', '14F', '11D'];
  const rnd = mulberry(4821);
  const items = [];   // { inst, idx, seat, m }
  const pill = [], blank = [], pap = [];
  for (const r of recs) {
    const id = r.d.id;
    if (r.bus) {
      pill.push({ r, m: new THREE.Matrix4().makeRotationX(-75 * DEG).setPosition(r.d.x + (rnd() - 0.5) * 0.04, 0.64, r.d.z + 0.235) });
      blank.push({ r, m: new THREE.Matrix4().makeRotationY((rnd() - 0.5) * 0.3).setPosition(r.d.x, 0.483, r.d.z - 0.1) });
    } else if (econPB.includes(id)) {
      pill.push({ r, m: new THREE.Matrix4().makeRotationX(-73 * DEG).setPosition(r.d.x + (rnd() - 0.5) * 0.04, 0.61, r.d.z + 0.2) });
      blank.push({ r, m: new THREE.Matrix4().makeRotationY((rnd() - 0.5) * 0.4).setPosition(r.d.x, 0.468, r.d.z - 0.08) });
    }
    if (phones.includes(id)) pap.push({ r, kind: 'box', m: new THREE.Matrix4().makeRotationY((rnd() - 0.5) * 0.9).setPosition(r.d.x + 0.06, 0.462, r.d.z - 0.06) });
    if (news.includes(id)) pap.push({ r, kind: 'news', m: new THREE.Matrix4().makeRotationY((rnd() - 0.5) * 0.5).setPosition(r.d.x - 0.01, 0.448, r.d.z - 0.04) });
  }
  const mk = (name, built, mats, arr) => {
    if (!arr.length) return null;
    const mesh = new THREE.InstancedMesh(built.geometry, mats, arr.length);
    mesh.name = `seats-${name}`; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.raycast = () => {};
    arr.forEach((it, k) => { mesh.setMatrixAt(k, it.m); it.mesh = mesh; it.k = k; items.push(it); });
    mesh.computeBoundingSphere();
    root.add(mesh);
    return mesh;
  };
  mk('pillow', pillowG, materialsFor(M, pillowG.keys), pill);
  mk('blanket', blanketG, materialsFor(M, blanketG.keys), blank);
  mk('headphones', paper.box, materialsFor(M, paper.box.keys), pap.filter((p) => p.kind === 'box'));
  mk('newspaper', paper.news, materialsFor(M, paper.news.keys), pap.filter((p) => p.kind === 'news'));
  // water bottles in seat pockets (ride with the backrest)
  const hosts = bottles.map((id) => recById.get(id)).filter(Boolean);
  const bottleMesh = new THREE.InstancedMesh(bottleG.geometry, materialsFor(M, bottleG.keys), Math.max(1, hosts.length));
  bottleMesh.name = 'seats-bottles'; bottleMesh.castShadow = false; bottleMesh.receiveShadow = true;
  bottleMesh.raycast = () => {};
  bottleMesh.renderOrder = 2;
  hosts.forEach((h, k) => { h.bottle = k; });
  root.add(bottleMesh);
  const local = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  return {
    updateBottle(host, backM) {
      const D = host.D;
      const x = (host.ci % 2 ? -1 : 1) * 0.105;
      local.makeTranslation(x, D.pocket.y0 + 0.03, D.back.zb + 0.021);
      tmp.multiplyMatrices(backM, local);
      bottleMesh.setMatrixAt(host.bottle, tmp);
      bottleMesh.instanceMatrix.needsUpdate = true;
      if (!bottleMesh.boundingSphere || bottleMesh.userData.n !== hosts.length) { bottleMesh.computeBoundingSphere(); bottleMesh.boundingSphere.radius += 0.5; bottleMesh.userData.n = hosts.length; }
    },
    setHidden(seatId, hidden) {
      for (const it of items) {
        if (it.r.d.id !== seatId) continue;
        it.mesh.setMatrixAt(it.k, hidden ? HIDDEN : it.m);
        it.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Safety card: an open bi-fold card that slides out of the seat pocket into the passenger's hands;
// the player's focus mode frames it (Esc / Tab / right-click puts it back).
// ------------------------------------------------------------------------------------------------
function createCard(app, root, tex) {
  let texture = null;
  const group = new THREE.Group();
  group.name = 'seats-safety-card';
  group.visible = false;
  root.add(group);
  const pages = [];
  let mats = null;
  const build = () => {
    texture = TX.safetyCardTexture();
    const front = (u0) => {
      const g = new THREE.BoxGeometry(0.215, 0.296, 0.0012);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5);
      return g;
    };
    const fm = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 });
    const bm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e9e5d8'), roughness: 0.7 });
    mats = [bm, bm, bm, bm, fm, bm];
    for (const [u0, s] of [[0, -1], [0.5, 1]]) {
      const hinge = new THREE.Group();
      const m = new THREE.Mesh(front(u0), mats);
      m.position.x = s * 0.1075;
      m.castShadow = false; m.receiveShadow = false;
      m.raycast = () => {};
      hinge.add(m);
      group.add(hinge);
      pages.push({ hinge, s });
    }
  };
  const st = { open: false, t: 0, dir: 0, from: new THREE.Matrix4(), to: new THREE.Matrix4(), offFocus: null, viaFocus: false };
  const pf = new THREE.Vector3(), pt = new THREE.Vector3(), qf = new THREE.Quaternion(), qt = new THREE.Quaternion(), sc = new THREE.Vector3();
  const apply = () => {
    const k = easeInOutSine(st.t);
    st.from.decompose(pf, qf, sc); st.to.decompose(pt, qt, sc);
    group.position.lerpVectors(pf, pt, k);
    // lift in an arc out of the pocket
    group.position.y += Math.sin(Math.PI * k) * 0.06;
    group.quaternion.slerpQuaternions(qf, qt, k);
    const fold = (1 - k) * 86 * DEG + k * 9 * DEG;
    for (const p of pages) p.hinge.rotation.y = -p.s * fold;
    group.updateMatrixWorld(true);
  };
  return {
    open(r, backMatrix) {
      if (st.open) return true;
      const cam = app.camera;
      const hasFocus = !!app.player?.focusOn;
      if (!hasFocus) {
        if (app.hud?.showCard) { if (!texture) build(); try { app.hud.showCard(texture); return true; } catch { /* fall through */ } }
        try { app.hud?.toast?.('Safety card: fasten your seat belt, note the nearest exit, oxygen masks drop from above, life vest under your seat.', 6000); } catch { /* optional */ }
        return false;
      }
      if (!texture) build();
      // from: the pocket of the seat in front (or the seat itself)
      const host = r?.host || r;
      if (host) {
        backMatrix(host, st.from);
        _m.makeTranslation(0.02, host.D.pocket.y1 - 0.02, host.D.back.zb + 0.012);
        st.from.multiply(_m);
      } else st.from.copy(cam.matrixWorld);
      // to: in front of the eye, slightly below the line of sight, facing the eye
      cam.updateMatrixWorld();
      const eye = _v.setFromMatrixPosition(cam.matrixWorld).clone();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      fwd.y = Math.min(fwd.y, -0.15); fwd.normalize();
      const pos = eye.clone().addScaledVector(fwd, 0.42);
      const o = new THREE.Object3D();
      o.position.copy(pos);
      o.lookAt(eye);
      o.updateMatrix();
      st.to.copy(o.matrix);
      st.t = 0; st.dir = 1; st.open = true;
      group.visible = true;
      apply();
      try { app.audio?.play?.('paper', { position: pos, volume: 0.9 }); } catch { /* optional */ }
      // frame the card with the player's focus mode once it has slid out
      setTimeout(() => {
        if (!st.open) return;
        const anchor = new THREE.Object3D();
        anchor.position.copy(pos); anchor.quaternion.copy(o.quaternion);
        anchor.updateMatrixWorld(true);
        root.add(anchor);
        st.anchor = anchor;
        try { st.viaFocus = !!app.player.focusOn(anchor, { distance: 0.36, duration: 0.6 }); } catch { st.viaFocus = false; }
        try { app.hud?.toast?.('Esc to put the safety card back', 2500); } catch { /* optional */ }
      }, 450);
      if (!st.offFocus) {
        st.offFocus = app.events.on('player:focus', ({ on }) => { if (!on && st.open && st.t > 0.5) this.close(); });
      }
      return true;
    },
    close() {
      if (!st.open) return false;
      st.dir = -1;
      st.open = false;
      try { app.audio?.play?.('paper', { position: group.position.clone(), volume: 0.7 }); } catch { /* optional */ }
      if (st.anchor) { root.remove(st.anchor); st.anchor = null; }
      if (st.viaFocus) { st.viaFocus = false; try { if (app.player?.focused) app.player.releaseFocus(); } catch { /* ignore */ } }
      return true;
    },
    step(dt) {
      if (st.dir === 0) return;
      st.t = clamp01(st.t + st.dir * dt / 0.7);
      apply();
      if (st.dir < 0 && st.t <= 0) { st.dir = 0; group.visible = false; }
      if (st.dir > 0 && st.t >= 1) st.dir = 0;
      // standing up / walking away puts the card back
      if (st.open && st.t >= 1 && !st.viaFocus && app.player && !app.player.focused) {
        const p = app.camera.position;
        if (p.distanceTo(group.position) > 1.2) this.close();
      }
    },
    get isOpen() { return st.open; },
    group,
  };
}
