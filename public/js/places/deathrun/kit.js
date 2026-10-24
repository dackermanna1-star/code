// The building kit of the Pharaoh's tomb.
//  - Materials painted in paint.js (sandstone, carved and painted walls,
//    reliefs, starry ceilings, granite, gold, lapis, sand, rock, lava...).
//  - Geometry with UVs measured in studs, so a texture keeps one scale.
//  - Kit: static shapes merged into one mesh per material, plain static
//    colliders; everything placed relative to an origin (K.at), so each
//    hall of the course is built in its own coordinates.
//  - Mover: a moving thing (a trap) - its own meshes and a kinematic body
//    whose velocity follows the motion, so people standing on it ride it.
//  - LightPool: a handful of real point lights handed to the torches
//    nearest the camera (a tomb has hundreds of torches).
//  - Flames: flickering additive sprites.
import * as THREE from 'three';
import * as CANNON from '../../vendor/cannon-es.js';
import { GROUP } from '../../engine/Part.js';
import * as P from './paint.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const DEG = Math.PI / 180;

// --- materials --------------------------------------------------------------------------------------------------------------------------
// name: [texture maker | null, studs per repeat, colour, roughness, metalness, extra]
const DEFS = {
  sand: [() => P.sandCanvas(3), 16, 0xffffff, 0.95, 0],
  dune: [() => P.sandCanvas(7, [214, 176, 122]), 40, 0xffffff, 1, 0],
  grass: [() => P.sandCanvas(29, [96, 128, 58], false), 10, 0xffffff, 1, 0],
  ashlar: [() => P.ashlarCanvas(1), 8, 0xffffff, 0.9, 0],
  ashlarDark: [() => P.ashlarCanvas(8, [178, 150, 112]), 8, 0xffffff, 0.92, 0],
  ashlarPale: [() => P.ashlarCanvas(11, [226, 214, 188]), 8, 0xffffff, 0.85, 0],
  glyphs: [() => P.glyphWallCanvas(2), 8, 0xffffff, 0.9, 0],
  glyphsDark: [() => P.glyphWallCanvas(6, [178, 150, 112]), 8, 0xffffff, 0.92, 0],
  glyphsPaint: [() => P.glyphWallCanvas(9, [222, 206, 172], true), 8, 0xffffff, 0.85, 0],
  glyphsGranite: [() => P.glyphWallCanvas(19, [172, 110, 96]), 6, 0xffffff, 0.5, 0],
  floor: [() => P.floorCanvas(9), 8, 0xffffff, 0.8, 0],
  floorDark: [() => P.floorCanvas(13, [160, 140, 112]), 8, 0xffffff, 0.85, 0],
  stars: [() => P.starCanvas(), 8, 0xffffff, 0.9, 0],
  granite: [() => P.graniteCanvas(4), 4, 0xffffff, 0.45, 0],
  basalt: [() => P.graniteCanvas(17, [44, 42, 46]), 4, 0xffffff, 0.3, 0.1],
  gold: [() => P.goldCanvas(), 4, 0xffffff, 0.28, 1],
  lapis: [() => P.lapisCanvas(), 4, 0xffffff, 0.3, 0.1],
  faience: [() => P.faienceCanvas(), 4, 0xffffff, 0.35, 0.05],
  rock: [() => P.rockCanvas(21), 24, 0xffffff, 0.95, 0],
  rockDark: [() => P.rockCanvas(23, [92, 64, 60]), 20, 0xffffff, 0.95, 0],
  wood: [() => P.woodCanvas(), 6, 0xffffff, 0.8, 0],
  linen: [() => P.linenCanvas(), 6, 0xffffff, 0.9, 0],
  tent: [() => P.linenCanvas([228, 214, 186], ['#b8352b', '#e4d6b8', '#2a5caa', '#e4d6b8']), 8, 0xffffff, 0.9, 0],
  plaster: [null, 1, 0xe8dcc0, 0.9, 0],
  bronze: [null, 1, 0xb07a3a, 0.4, 0.8],
  iron: [null, 1, 0x5a5a60, 0.5, 0.7],
  black: [null, 1, 0x1a1816, 0.6, 0],
  bone: [null, 1, 0xe9e0c8, 0.7, 0],
  mud: [null, 1, 0x7a5a3a, 1, 0],
  palmTrunk: [null, 1, 0x7a5f40, 0.95, 0],
  leaf: [null, 1, 0x4f7a2a, 0.8, 0],
  croc: [null, 1, 0x3f5a32, 0.7, 0],
  teeth: [null, 1, 0xf2ecd8, 0.5, 0],
  red: [null, 1, 0xb8352b, 0.7, 0],
  blue: [null, 1, 0x2a5caa, 0.6, 0],
  green: [null, 1, 0x2f8f6b, 0.6, 0],
  white: [null, 1, 0xf0eadb, 0.7, 0],
  eyeGlow: [null, 1, 0xff3020, 0.4, 0, { emissive: 0xff2010, emissiveIntensity: 3 }],
  sunGlow: [null, 1, 0xffd060, 0.3, 0, { emissive: 0xffb030, emissiveIntensity: 3.5 }],
  greenFire: [null, 1, 0x60ff90, 1, 0, { emissive: 0x40ff70, emissiveIntensity: 3 }],
  portal: [null, 1, 0x60c0ff, 1, 0, { emissive: 0x40a0ff, emissiveIntensity: 2.5 }],
};
const MATS = {};
const SCALE = new Map();
export function mat(name) {
  if (MATS[name]) return MATS[name];
  const d = DEFS[name];
  if (!d) throw new Error('no material ' + name);
  const m = new THREE.MeshStandardMaterial({ map: d[0] ? P.tex(d[0]()) : null, color: d[2], roughness: d[3], metalness: d[4], ...(d[5] || {}) });
  m.name = name;
  MATS[name] = m; SCALE.set(m, d[1]);
  return m;
}
export function colorMat(hex, rough = 0.6, metal = 0, extra = {}) {
  const k = 'c' + hex + ':' + rough + ':' + metal + JSON.stringify(extra);
  if (!MATS[k]) { MATS[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, ...extra }); SCALE.set(MATS[k], 1); }
  return MATS[k];
}
export function allMaterials() { return Object.values(MATS); }
export function scaleOf(m) { return SCALE.get(m) || 1; }
const M = (m) => (typeof m === 'string' ? mat(m) : m);

/** A painted relief (a 16 x 8 stud picture repeating along a wall). */
const RELIEFS = [];
export function reliefMat(variant = 0) {
  if (!RELIEFS[variant]) {
    const t = P.tex(P.reliefCanvas(variant));
    RELIEFS[variant] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
  }
  return RELIEFS[variant];
}
const SPECIAL = {};
export function special(name) {
  if (SPECIAL[name]) return SPECIAL[name];
  let m;
  if (name === 'column') m = new THREE.MeshStandardMaterial({ map: P.tex(P.columnCanvas(5), { clampT: true }), roughness: 0.85 });
  else if (name === 'capital') m = new THREE.MeshStandardMaterial({ map: P.tex(P.capitalCanvas(), { clampT: true }), roughness: 0.8 });
  else if (name === 'frond') m = new THREE.MeshStandardMaterial({ map: P.tex(P.frondCanvas(), { clamp: true }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  else if (name === 'reeds') m = new THREE.MeshStandardMaterial({ map: P.tex(P.reedCanvas(), { clamp: true }), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  else if (name === 'lava') {
    const L = P.lavaCanvases();
    const map = P.tex(L.col), em = P.tex(L.glow);
    m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.9 });
    m.userData.scroll = [map, em];
  }
  SPECIAL[name] = m;
  return m;
}

// --- geometry ------------------------------------------------------------------------------------------------------------------------------
/** A box with UVs in studs / scale (faces: +x -x +y -y +z -z). */
export function boxGeo(sx, sy, sz, scale = 1) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / scale, uv.getY(i) * dims[f][1] / scale); }
  return g;
}
/** A wedge: full height at +z, sloping down to -z. */
export function wedgeGeo(sx, sy, sz, scale = 1) {
  const x = sx / 2, y = sy / 2, z = sz / 2, L = Math.hypot(sy, sz) / scale, X = sx / scale, Y = sy / scale, Z = sz / scale;
  const Pp = [], U = [];
  const quad = (a, b, c, d, ua, ub, uc, ud) => { Pp.push(...a, ...b, ...c, ...a, ...c, ...d); U.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); };
  const tri = (a, b, c, ua, ub, uc) => { Pp.push(...a, ...b, ...c); U.push(...ua, ...ub, ...uc); };
  quad([-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z], [0, Z], [X, Z], [X, 0], [0, 0]);
  quad([-x, -y, z], [-x, y, z], [x, y, z], [x, -y, z], [0, 0], [0, Y], [X, Y], [X, 0]);
  quad([-x, -y, -z], [x, -y, -z], [x, y, z], [-x, y, z], [0, 0], [X, 0], [X, L], [0, L]);
  tri([-x, -y, -z], [-x, y, z], [-x, -y, z], [0, 0], [Z, Y], [Z, 0]);
  tri([x, -y, -z], [x, -y, z], [x, y, z], [0, 0], [Z, 0], [Z, Y]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
}
/** A frustum of a box: bottom sx x sz, top tx x tz (pylons, obelisks, pyramids, plinths). */
export function taperGeo(sx, sz, tx, tz, h, scale = 1) {
  const g = boxGeo(sx, h, sz, scale), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * tx / sx); p.setZ(i, p.getZ(i) * tz / sz); }
  g.computeVertexNormals();
  return g;
}
export function cylGeo(rt, rb, h, seg = 20, scale = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv, circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / scale, uv.getY(i) * h / scale);
  return g;
}
/** A lathe (profile [[r, y]...]) with u around (repeats times) and v from 0 at the bottom to 1 at the top. */
export function latheGeo(profile, seg = 24, repeats = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, seg);
  const uv = g.attributes.uv, p = g.attributes.position;
  const y0 = profile[0][1], y1 = profile[profile.length - 1][1];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeats, (p.getY(i) - y0) / (y1 - y0 || 1));
  return g;
}
/** A flat panel (a painted relief): w x h facing +z, u repeating every `uw` studs, v 0..1 over its height. */
export function panelGeo(w, h, uw = 16) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / uw);
  return g;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export function quatOf(rot, out = _q) {
  if (!rot) return out.identity();
  if (rot.isQuaternion) return out.copy(rot);
  if (typeof rot === 'number') return out.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  return out.setFromEuler(_e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'YXZ'));
}

// --- the kit -------------------------------------------------------------------------------------------------------------------------------
export class Kit {
  constructor(world) {
    this.world = world;
    this.batches = new Map();
    this.group = new THREE.Group(); this.group.name = 'static';
    world.scene.add(this.group);
    this.bodies = [];
    this.o = V();
  }
  /** Build relative to this origin from now on. */
  at(x, y, z) { this.o.set(x, y, z); return this; }
  W(x, y, z) { return V(this.o.x + x, this.o.y + y, this.o.z + z); }

  /** Add geometry (in its own frame) to the merged drawing at x,y,z (local to the origin). */
  geo(g, material, x, y, z, rot = null, o = {}) {
    const m = M(material);
    _m4.compose(_p.set(this.o.x + x, this.o.y + y, this.o.z + z), quatOf(rot), o.scale ? _s.set(...o.scale) : _s.set(1, 1, 1));
    const gg = g.index ? g.toNonIndexed() : g.clone();
    gg.applyMatrix4(_m4);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    if (!gg.attributes.normal) gg.computeVertexNormals();
    const key = m.uuid + (o.noShadow ? ':n' : '');
    let b = this.batches.get(key);
    if (!b) { b = { mat: m, geos: [], cast: !o.noShadow }; this.batches.set(key, b); }
    b.geos.push(gg);
    return gg;
  }
  box(x, y, z, sx, sy, sz, material, o = {}) {
    const m = M(material);
    if (o.draw !== false) this.geo(boxGeo(sx, sy, sz, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col !== false) return this.col(x, y, z, sx, sy, sz, o.rot, o);
    return null;
  }
  /** A box from corner to corner. */
  span(x0, y0, z0, x1, y1, z1, material, o = {}) { return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), material, o); }
  wedge(x, y, z, sx, sy, sz, material, o = {}) {
    const m = M(material);
    this.geo(wedgeGeo(sx, sy, sz, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, cy = -hy / 3, cz = hz / 3;
    const verts = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]].map(([a, b, c]) => new CANNON.Vec3(a, b - cy, c - cz));
    const faces = [[0, 1, 2, 3], [3, 2, 5, 4], [0, 4, 5, 1], [0, 3, 4], [1, 5, 2]];
    return this._body(new CANNON.ConvexPolyhedron({ vertices: verts, faces }), x, y, z, o.rot, o, new CANNON.Vec3(0, cy, cz));
  }
  /** A frustum (tapering block): its collider is the bottom box unless o.col === false. */
  taper(x, y, z, sx, sz, tx, tz, h, material, o = {}) {
    const m = M(material);
    this.geo(taperGeo(sx, sz, tx, tz, h, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    return this.col(x, y, z, (sx + tx) / 2, h, (sz + tz) / 2, o.rot, o);
  }
  cyl(x, y, z, r, h, material, o = {}) {
    const m = M(material);
    this.geo(cylGeo(o.rTop ?? r, r, h, o.seg || 20, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    if (o.round) return this._body(new CANNON.Cylinder(o.rTop ?? r, r, h, 12), x, y, z, o.rot, o);
    return this.col(x, y, z, r * 1.7, h, r * 1.7, o.rot, o);
  }
  ball(x, y, z, r, material, o = {}) {
    const m = M(material);
    this.geo(new THREE.SphereGeometry(r, o.seg || 16, Math.max(8, (o.seg || 16) >> 1)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    return this._body(new CANNON.Sphere(r), x, y, z, null, o);
  }
  /** A painted relief on a wall: centre x,y,z, w x h, facing `face` (radians about y; 0 = facing +z). */
  relief(x, y, z, w, h, face, variant = 0) { this.geo(panelGeo(w, h, 16 * h / 8), reliefMat(variant), x, y, z, face, { noShadow: true }); }

  col(x, y, z, sx, sy, sz, rot = null, o = {}) { return this._body(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)), x, y, z, rot, o); }
  _body(shape, x, y, z, rot, o = {}, offset = null) {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.world.defaultPhysMaterial });
    b.addShape(shape, offset || undefined);
    b.position.set(this.o.x + x, this.o.y + y, this.o.z + z);
    const q = quatOf(rot);
    b.quaternion.set(q.x, q.y, q.z, q.w);
    b.collisionFilterGroup = GROUP.WORLD;
    b.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.CHARACTER | GROUP.DEBRIS;
    if (o.climb) b.part = { shape: 'Truss', tags: new Set(['climbable']), name: 'Ladder' };
    if (o.tag) b.tag = o.tag;
    b.updateAABB();
    this.world.physics.addBody(b);
    this.bodies.push(b);
    return b;
  }

  /** Merge everything added so far into one mesh per material. */
  flush() {
    for (const b of this.batches.values()) {
      if (!b.geos.length) continue;
      let n = 0;
      for (const g of b.geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of b.geos) {
        pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.group.add(mesh);
      b.geos = [];
    }
  }
}

/**
 * A group of meshes drawn as one thing (not merged with the static world), for things that move.
 * Build it with the same calls as the Kit (box, cyl, wedge, geo) in its own frame.
 */
export class Piece {
  constructor() { this.group = new THREE.Group(); this.shapes = []; }
  add(g, material, x, y, z, rot = null, o = {}) {
    const m = M(material);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z); quatOf(rot, mesh.quaternion);
    if (o.scale) mesh.scale.set(...o.scale);
    mesh.castShadow = !o.noShadow; mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  box(x, y, z, sx, sy, sz, material, o = {}) {
    const m = M(material);
    const mesh = o.draw === false ? null : this.add(boxGeo(sx, sy, sz, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col !== false) this.shapes.push({ shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)), offset: new CANNON.Vec3(x, y, z), quat: o.rot ? (() => { const q = quatOf(o.rot); return new CANNON.Quaternion(q.x, q.y, q.z, q.w); })() : undefined });
    return mesh;
  }
  cyl(x, y, z, r, h, material, o = {}) {
    const m = M(material);
    const mesh = this.add(cylGeo(o.rTop ?? r, r, h, o.seg || 20, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col) this.shapes.push({ shape: new CANNON.Box(new CANNON.Vec3(r * 0.85, h / 2, r * 0.85)), offset: new CANNON.Vec3(x, y, z) });
    return mesh;
  }
  wedge(x, y, z, sx, sy, sz, material, o = {}) { const m = M(material); return this.add(wedgeGeo(sx, sy, sz, o.uv || scaleOf(m)), m, x, y, z, o.rot, o); }
  ball(x, y, z, r, material, o = {}) {
    const mesh = this.add(new THREE.SphereGeometry(r, o.seg || 20, Math.max(10, (o.seg || 20) >> 1)), material, x, y, z, o.rot, o);
    if (o.col) this.shapes.push({ shape: new CANNON.Sphere(r), offset: new CANNON.Vec3(x, y, z) });
    return mesh;
  }
}

const _dq = new THREE.Quaternion(), _qi = new THREE.Quaternion();
/** A moving thing: a Piece placed in the world with a kinematic body (if it has shapes). */
export class Mover {
  constructor(world, piece, pos, quat = null) {
    this.world = world;
    this.group = piece.group;
    this.group.position.copy(pos); if (quat) this.group.quaternion.copy(quat);
    world.scene.add(this.group);
    this.pos = this.group.position.clone(); this.quat = this.group.quaternion.clone();
    this.home = { pos: this.pos.clone(), quat: this.quat.clone() };
    if (piece.shapes.length) {
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: world.defaultPhysMaterial });
      for (const s of piece.shapes) b.addShape(s.shape, s.offset, s.quat);
      b.collisionFilterGroup = GROUP.WORLD;
      b.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.CHARACTER | GROUP.DEBRIS;
      b.position.set(pos.x, pos.y, pos.z); b.quaternion.set(this.quat.x, this.quat.y, this.quat.z, this.quat.w);
      world.physics.addBody(b);
      this.body = b;
    }
  }
  /** Move to pos/quat; dt > 0 gives the body the velocity of this motion (for riders). */
  set(pos, quat = null, dt = 0) {
    const b = this.body;
    if (b) {
      if (dt > 0) {
        b.velocity.set((pos.x - this.pos.x) / dt, (pos.y - this.pos.y) / dt, (pos.z - this.pos.z) / dt);
        if (quat) {
          _dq.copy(quat).multiply(_qi.copy(this.quat).invert());
          if (_dq.w < 0) { _dq.x = -_dq.x; _dq.y = -_dq.y; _dq.z = -_dq.z; _dq.w = -_dq.w; }
          const s = Math.sqrt(Math.max(0, 1 - _dq.w * _dq.w)), ang = 2 * Math.acos(clamp(_dq.w, -1, 1));
          if (s > 1e-5) b.angularVelocity.set(_dq.x / s * ang / dt, _dq.y / s * ang / dt, _dq.z / s * ang / dt); else b.angularVelocity.set(0, 0, 0);
        }
      } else { b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); }
      b.position.set(pos.x, pos.y, pos.z);
      if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    }
    this.pos.copy(pos); if (quat) this.quat.copy(quat);
    this.group.position.copy(pos); if (quat) this.group.quaternion.copy(quat);
  }
  /** Stop riding along (zero velocity) without moving. */
  still() { if (this.body) { this.body.velocity.set(0, 0, 0); this.body.angularVelocity.set(0, 0, 0); } }
  reset() { this.set(this.home.pos, this.home.quat, 0); this.visible(true); this.solid(true); }
  visible(on) { this.group.visible = on; }
  solid(on) {
    const b = this.body; if (!b) return;
    const has = this.world.physics.bodies.includes(b);
    if (on && !has) this.world.physics.addBody(b); else if (!on && has) this.world.physics.removeBody(b);
  }
}

// --- lights -------------------------------------------------------------------------------------------------------------------------------
/** A few real point lights, given each moment to the torches nearest the camera (and flickering). */
export class LightPool {
  constructor(scene, n = 8) {
    this.sources = [];
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 40, 2);
      l.position.set(0, -9999, 0);
      scene.add(l);
      this.lights.push({ l, src: null, k: 0 });
    }
    this.t = 0; this.pickT = 0;
  }
  add(pos, color = 0xff9a40, intensity = 70, range = 38, flicker = 1) {
    const s = { pos: pos.clone(), color: new THREE.Color(color), intensity, range, flicker, ph: Math.random() * 10, on: true };
    this.sources.push(s);
    return s;
  }
  update(dt, cam) {
    this.t += dt;
    if ((this.pickT -= dt) <= 0) {
      this.pickT = 0.2;
      // the nearest lit sources
      const near = this.sources.filter((s) => s.on).map((s) => [s, s.pos.distanceToSquared(cam)]).sort((a, b) => a[1] - b[1]).slice(0, this.lights.length).map((a) => a[0]);
      const keep = new Set(near);
      for (const L of this.lights) if (L.src && !keep.has(L.src)) L.src = null;
      for (const s of near) if (!this.lights.some((L) => L.src === s)) { const free = this.lights.find((L) => !L.src); if (free) { free.src = s; free.k = 0; } }
    }
    for (const L of this.lights) {
      const s = L.src;
      L.k = s ? Math.min(1, L.k + dt * 3) : Math.max(0, L.k - dt * 3);
      if (!s) { L.l.intensity = 0; continue; }
      L.l.position.copy(s.pos); L.l.color.copy(s.color); L.l.distance = s.range;
      const fl = s.flicker ? 0.82 + 0.12 * Math.sin(this.t * 11 + s.ph) + 0.08 * Math.sin(this.t * 23.7 + s.ph * 3) : 1;
      L.l.intensity = s.intensity * fl * L.k;
    }
  }
}

// --- flames ----------------------------------------------------------------------------------------------------------------------------------
let flameTex = null, glowTex = null;
export function flameTexture() { return flameTex || (flameTex = P.tex(P.flameCanvas(), { clamp: true })); }
export function glowTexture() { return glowTex || (glowTex = P.tex(P.glowCanvas(), { clamp: true })); }
/** Flickering flames (torches, braziers): additive sprites. */
export class Flames {
  constructor(scene) {
    this.scene = scene; this.list = []; this.t = 0;
    this.mats = {};
  }
  _mat(color) {
    const k = String(color);
    if (!this.mats[k]) this.mats[k] = new THREE.SpriteMaterial({ map: flameTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    return this.mats[k];
  }
  add(pos, size = 1.6, color = 0xffc070) {
    const s = new THREE.Sprite(this._mat(color));
    s.position.copy(pos); s.scale.set(size, size * 2, 1);
    s.center.set(0.5, 0.1);
    this.scene.add(s);
    const f = { s, size, ph: Math.random() * 10, base: pos.clone(), on: true };
    this.list.push(f);
    return f;
  }
  update(dt, cam) {
    this.t += dt;
    for (const f of this.list) {
      if (!f.on) { f.s.visible = false; continue; }
      // (far ones don't need to flicker)
      const d2 = f.base.distanceToSquared(cam);
      f.s.visible = d2 < 500 * 500;
      if (d2 > 160 * 160) continue;
      const k = 0.85 + 0.15 * Math.sin(this.t * 13 + f.ph) + 0.08 * Math.sin(this.t * 29 + f.ph * 2);
      f.s.scale.set(f.size * (0.9 + 0.1 * Math.sin(this.t * 17 + f.ph)), f.size * 2 * k, 1);
    }
  }
}
