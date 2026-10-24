// Dynamic props: small node-beam bodies (crates, barrels, cones, concrete
// blocks, steel beams, containers, barriers, tires, pins) rendered with
// instancing from a best-fit rigid transform. Detached car wheels are also
// props.

import * as THREE from 'three';
import { SoftBodyBuilder, SoftBody, Mat, BEAM_NODEFORM, type BeamOptions } from '../sim/softbody.ts';
import type { World } from '../sim/world.ts';
import { mat3FromEuler } from '../sim/math.ts';
import { MAT, texBox } from './obstacles/assets.ts';
import { buildWheel, type RimStyle } from '../render/wheelMesh.ts';

export interface PropDef {
  id: string;
  name: string;
  build(): SoftBody;
  geometry(): THREE.BufferGeometry;
  material(): THREE.Material | THREE.Material[];
  max: number;
}

function boxBody(w: number, h: number, d: number, mass: number, k: number, c: number, mat: number, friction: number, beam: Partial<BeamOptions> = {}, segs = 1): SoftBody {
  const b = new SoftBodyBuilder();
  b.addPart('prop');
  const ids: number[][] = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const nStations = segs + 1;
  const nodeMass = mass / (nStations * 4);
  for (let s = 0; s < nStations; s++) {
    const z = -hd + (d * s) / segs;
    const ring: number[] = [];
    for (const [x, y] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) ring.push(b.addNode(x, y, z, { mass: nodeMass, material: mat, friction }));
    ids.push(ring);
  }
  const all = ids.flat();
  // connect every node within neighbouring stations
  for (let s = 0; s < nStations; s++) {
    for (let t = s; t < Math.min(nStations, s + 2); t++) {
      for (const a of ids[s]) for (const bb of ids[t]) if (a !== bb) b.addBeam(a, bb, { k, c, ...beam });
    }
  }
  void all;
  for (let s = 0; s < nStations - 1; s++) {
    const r0 = ids[s], r1 = ids[s + 1];
    for (let e = 0; e < 4; e++) b.addQuad(r0[e], r0[(e + 1) % 4], r1[(e + 1) % 4], r1[e]);
  }
  b.addQuad(ids[0][0], ids[0][1], ids[0][2], ids[0][3]);
  const last = ids[nStations - 1];
  b.addQuad(last[0], last[1], last[2], last[3]);
  const body = b.build();
  body.kind = 'prop';
  body.canSleep = true;
  return body;
}

function cylBody(r: number, h: number, sides: number, mass: number, k: number, c: number, mat: number, friction: number, axis: 'y' | 'x' = 'y', topR = r): SoftBody {
  const b = new SoftBodyBuilder();
  b.addPart('prop');
  const rings: number[][] = [];
  const centers: number[] = [];
  const n = sides * 2 + 2;
  const nm = mass / n;
  for (let s = 0; s < 2; s++) {
    const y = s === 0 ? -h / 2 : h / 2;
    const rr = s === 0 ? r : topR;
    const ring: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const p = axis === 'y' ? [Math.cos(a) * rr, y, Math.sin(a) * rr] : [y, Math.cos(a) * rr, Math.sin(a) * rr];
      ring.push(b.addNode(p[0], p[1], p[2], { mass: nm, material: mat, friction }));
    }
    rings.push(ring);
    const cp = axis === 'y' ? [0, y, 0] : [y, 0, 0];
    centers.push(b.addNode(cp[0], cp[1], cp[2], { mass: nm, material: mat, friction, collide: false, softCollide: false }));
  }
  for (let s = 0; s < 2; s++) {
    const ring = rings[s];
    for (let i = 0; i < sides; i++) {
      b.addBeam(ring[i], ring[(i + 1) % sides], { k, c });
      b.addBeam(ring[i], ring[(i + 2) % sides], { k, c });
      b.addBeam(ring[i], centers[s], { k, c });
      b.addBeam(ring[i], centers[1 - s], { k, c });
    }
  }
  for (let i = 0; i < sides; i++) {
    b.addBeam(rings[0][i], rings[1][i], { k, c });
    b.addBeam(rings[0][i], rings[1][(i + 1) % sides], { k, c });
    b.addBeam(rings[0][(i + 1) % sides], rings[1][i], { k, c });
    b.addQuad(rings[0][i], rings[0][(i + 1) % sides], rings[1][(i + 1) % sides], rings[1][i]);
    b.addTri(centers[0], rings[0][(i + 1) % sides], rings[0][i]);
    b.addTri(centers[1], rings[1][i], rings[1][(i + 1) % sides]);
  }
  b.addBeam(centers[0], centers[1], { k, c });
  const body = b.build();
  body.kind = 'prop';
  body.canSleep = true;
  return body;
}

function coneBody(r: number, h: number, mass: number): SoftBody {
  const b = new SoftBodyBuilder();
  b.addPart('prop');
  const base: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    base.push(b.addNode(Math.cos(a) * r, -h * 0.3, Math.sin(a) * r, { mass: mass * 0.22, material: Mat.PLASTIC, friction: 0.7 }));
  }
  const tip = b.addNode(0, h * 0.7, 0, { mass: mass * 0.12, material: Mat.PLASTIC, friction: 0.5 });
  const k = 1.4e4, c = 6;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) b.addBeam(base[i], base[j], { k, c });
  for (const n of base) b.addBeam(n, tip, { k, c });
  for (let i = 0; i < 4; i++) b.addTri(base[i], base[(i + 1) % 4], tip);
  b.addQuad(base[0], base[3], base[2], base[1]);
  const body = b.build();
  body.kind = 'prop';
  body.canSleep = true;
  return body;
}

/** Detached wheel: two rings of rim/tread nodes plus two hub nodes. */
export function wheelBody(radius: number, width: number, mass: number): SoftBody {
  const b = new SoftBodyBuilder();
  b.addPart('wheel');
  const sides = 12;
  const rings: number[][] = [];
  const hubs: number[] = [];
  for (let s = 0; s < 2; s++) {
    const x = s === 0 ? -width / 2 : width / 2;
    const ring: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      ring.push(b.addNode(x, Math.cos(a) * radius, Math.sin(a) * radius, { mass: (mass * 0.8) / (sides * 2), material: Mat.RUBBER, friction: 0.9 }));
    }
    rings.push(ring);
    hubs.push(b.addNode(x, 0, 0, { mass: mass * 0.1, material: Mat.METAL, friction: 0.5, collide: false, softCollide: false }));
  }
  const k = 3.0e5, c = 60;
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < sides; i++) {
      b.addBeam(rings[s][i], rings[s][(i + 1) % sides], { k, c, flags: BEAM_NODEFORM });
      b.addBeam(rings[s][i], rings[s][(i + 3) % sides], { k, c, flags: BEAM_NODEFORM });
      b.addBeam(rings[s][i], hubs[s], { k, c, flags: BEAM_NODEFORM });
      b.addBeam(rings[s][i], hubs[1 - s], { k, c, flags: BEAM_NODEFORM });
    }
  }
  for (let i = 0; i < sides; i++) {
    b.addBeam(rings[0][i], rings[1][i], { k, c, flags: BEAM_NODEFORM });
    b.addBeam(rings[0][i], rings[1][(i + 1) % sides], { k, c, flags: BEAM_NODEFORM });
    b.addBeam(rings[0][(i + 1) % sides], rings[1][i], { k, c, flags: BEAM_NODEFORM });
    b.addQuad(rings[0][i], rings[0][(i + 1) % sides], rings[1][(i + 1) % sides], rings[1][i]);
  }
  b.addBeam(hubs[0], hubs[1], { k, c, flags: BEAM_NODEFORM });
  const body = b.build();
  body.kind = 'debris';
  body.canSleep = true;
  return body;
}

function bowlingPinGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const prof = [[0, 0], [0.22, 0], [0.3, 0.25], [0.33, 0.55], [0.26, 0.85], [0.14, 1.05], [0.13, 1.15], [0.17, 1.32], [0.15, 1.48], [0.06, 1.58], [0, 1.6]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y - 0.8));
  const g = new THREE.LatheGeometry(pts, 20);
  return g;
}

export const PROP_DEFS: PropDef[] = [
  {
    id: 'crate',
    name: 'Wooden Crate',
    build: () => boxBody(1.1, 1.1, 1.1, 70, 1.8e5, 40, Mat.WOOD, 0.6),
    geometry: () => texBox(1.1, 1.1, 1.1, 1.1),
    material: () => new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 }),
    max: 120,
  },
  {
    id: 'barrel',
    name: 'Oil Drum',
    build: () => cylBody(0.3, 0.9, 6, 45, 1.5e5, 40, Mat.METAL, 0.45),
    geometry: () => new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16),
    material: () => [new THREE.MeshStandardMaterial({ color: 0x1e5aa8, roughness: 0.45, metalness: 0.6 })],
    max: 160,
  },
  {
    id: 'cone',
    name: 'Traffic Cone',
    build: () => coneBody(0.2, 0.72, 4),
    geometry: () => {
      const g = new THREE.ConeGeometry(0.19, 0.72, 14);
      g.translate(0, 0.72 / 2 - 0.72 * 0.3, 0);
      return g;
    },
    material: () => MAT.orange(),
    max: 200,
  },
  {
    id: 'block',
    name: 'Concrete Block',
    build: () => boxBody(2.2, 1.4, 1.4, 4500, 1.2e7, 2500, Mat.CONCRETE, 0.7, { flags: BEAM_NODEFORM }),
    geometry: () => texBox(2.2, 1.4, 1.4, 1),
    material: () => MAT.concrete(),
    max: 30,
  },
  {
    id: 'beam',
    name: 'Steel I-Beam',
    build: () => boxBody(0.4, 0.5, 7, 480, 3e6, 600, Mat.METAL, 0.4, { yieldC: 8e4, yieldT: 8e4 }, 3),
    geometry: () => iBeamGeometry(7),
    material: () => MAT.darkSteel(),
    max: 20,
  },
  {
    id: 'container',
    name: 'Shipping Container',
    build: () => boxBody(2.44, 2.6, 6.1, 2300, 3e6, 800, Mat.METAL, 0.45, { yieldC: 1.2e5, yieldT: 2e5 }, 2),
    geometry: () => texBox(2.44, 2.6, 6.1, 1.2),
    material: () => MAT.corrugated('#b3261e'),
    max: 12,
  },
  {
    id: 'jerseyProp',
    name: 'Loose Barrier',
    build: () => boxBody(0.6, 0.8, 3, 1600, 5e6, 1000, Mat.CONCRETE, 0.7, { flags: BEAM_NODEFORM }),
    geometry: () => texBox(0.6, 0.8, 3, 1),
    material: () => MAT.white(),
    max: 40,
  },
  {
    id: 'tire',
    name: 'Loose Tire',
    build: () => cylBody(0.34, 0.24, 8, 11, 6e4, 20, Mat.RUBBER, 0.9, 'x'),
    geometry: () => {
      const g = new THREE.TorusGeometry(0.26, 0.1, 10, 20);
      g.rotateY(Math.PI / 2);
      return g;
    },
    material: () => MAT.rubber(),
    max: 120,
  },
  {
    id: 'pin',
    name: 'Giant Bowling Pin',
    build: () => cylBody(0.3, 1.6, 5, 30, 8e4, 25, Mat.PLASTIC, 0.5, 'y', 0.16),
    geometry: () => bowlingPinGeometry(),
    material: () => new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35 }),
    max: 40,
  },
];

function iBeamGeometry(len: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const w = 0.2, h = 0.25, t = 0.04, web = 0.03;
  s.moveTo(-w, -h);
  s.lineTo(w, -h);
  s.lineTo(w, -h + t);
  s.lineTo(web, -h + t);
  s.lineTo(web, h - t);
  s.lineTo(w, h - t);
  s.lineTo(w, h);
  s.lineTo(-w, h);
  s.lineTo(-w, h - t);
  s.lineTo(-web, h - t);
  s.lineTo(-web, -h + t);
  s.lineTo(-w, -h + t);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  return g;
}

let crateTex: THREE.Texture | null = null;
function crateTexture(): THREE.Texture {
  if (crateTex) return crateTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#a4794a';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#9a6f42' : '#ad8253';
    x.fillRect(0, i * 32, 256, 30);
  }
  x.strokeStyle = '#6b4a2b';
  x.lineWidth = 18;
  x.strokeRect(9, 9, 238, 238);
  x.beginPath();
  x.moveTo(18, 18);
  x.lineTo(238, 238);
  x.stroke();
  crateTex = new THREE.CanvasTexture(c);
  crateTex.colorSpace = THREE.SRGBColorSpace;
  return crateTex;
}

export interface Prop {
  def: PropDef;
  body: SoftBody;
  slot: number;
  q: Float64Array;
  /** extra visual for detached wheels */
  object?: THREE.Object3D;
  age: number;
  /** removes itself after this many seconds (debris) */
  ttl: number;
}

interface KindRuntime {
  def: PropDef;
  mesh: THREE.InstancedMesh;
  free: number[];
  /** offset from body rest origin to geometry origin */
  restCenter: THREE.Vector3;
}

const _R = new Float64Array(9);
const _T = new Float64Array(3);
const _m = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class PropManager {
  readonly group = new THREE.Group();
  readonly props: Prop[] = [];
  private kinds = new Map<string, KindRuntime>();
  private world: World;

  constructor(world: World) {
    this.world = world;
    for (const def of PROP_DEFS) {
      const geo = def.geometry();
      const mat = def.material();
      const mesh = new THREE.InstancedMesh(geo, mat, def.max);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < def.max; i++) mesh.setMatrixAt(i, _zero);
      mesh.count = def.max;
      this.group.add(mesh);
      const free: number[] = [];
      for (let i = def.max - 1; i >= 0; i--) free.push(i);
      // body rest centroid is the box center for our builders (built centered)
      this.kinds.set(def.id, { def, mesh, free, restCenter: new THREE.Vector3() });
    }
  }

  spawn(kind: string, x: number, y: number, z: number, yaw = 0, opts: { pitch?: number; roll?: number; vx?: number; vy?: number; vz?: number } = {}): Prop | null {
    const k = this.kinds.get(kind);
    if (!k) return null;
    let slot = k.free.pop();
    if (slot === undefined) {
      // recycle the oldest prop of this kind
      const oldest = this.props.filter((p) => p.def.id === kind).sort((a, b) => b.age - a.age)[0];
      if (!oldest) return null;
      this.remove(oldest);
      slot = k.free.pop()!;
    }
    const body = k.def.build();
    const R = mat3FromEuler(opts.pitch ?? 0, yaw, opts.roll ?? 0);
    body.place(R, x, y, z, opts.vx ?? 0, opts.vy ?? 0, opts.vz ?? 0);
    this.world.liftClear(body);
    body.owner = null;
    this.world.addBody(body);
    const p: Prop = { def: k.def, body, slot, q: new Float64Array([0, 0, 0, 1]), age: 0, ttl: Infinity };
    // warm start rotation
    const qq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1));
    p.q.set([qq.x, qq.y, qq.z, qq.w]);
    this.props.push(p);
    this.updateProp(p);
    return p;
  }

  /** Spawn a detached car wheel as a rolling prop. */
  spawnWheel(radius: number, width: number, profile: number, style: RimStyle, pos: THREE.Vector3, rot: THREE.Quaternion, vel: THREE.Vector3, spin: number, axle: THREE.Vector3): Prop {
    const body = wheelBody(radius, width, 24);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(rot).elements;
    const R = new Float64Array([m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]);
    body.place(R, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z);
    // add spin: v += w x r
    const r = body.rest;
    for (let i = 0; i < body.n; i++) {
      const lx = r[i * 3], ly = r[i * 3 + 1], lz = r[i * 3 + 2];
      const wx = R[0] * lx + R[1] * ly + R[2] * lz, wy = R[3] * lx + R[4] * ly + R[5] * lz, wz = R[6] * lx + R[7] * ly + R[8] * lz;
      const ox = axle.x * spin, oy = axle.y * spin, oz = axle.z * spin;
      body.vel[i * 3] += oy * wz - oz * wy;
      body.vel[i * 3 + 1] += oz * wx - ox * wz;
      body.vel[i * 3 + 2] += ox * wy - oy * wx;
    }
    this.world.addBody(body);
    const parts = buildWheel(radius, width, profile, style);
    this.group.add(parts.root);
    const def: PropDef = { id: 'wheel', name: 'Wheel', build: () => body, geometry: () => new THREE.BufferGeometry(), material: () => MAT.rubber(), max: 0 };
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1));
    const p: Prop = { def, body, slot: -1, q: new Float64Array([q.x, q.y, q.z, q.w]), object: parts.root, age: 0, ttl: 90 };
    this.props.push(p);
    this.updateProp(p);
    return p;
  }

  remove(p: Prop): void {
    const i = this.props.indexOf(p);
    if (i < 0) return;
    this.props.splice(i, 1);
    this.world.removeBody(p.body);
    if (p.object) {
      p.object.removeFromParent();
    } else {
      const k = this.kinds.get(p.def.id)!;
      k.mesh.setMatrixAt(p.slot, _zero);
      k.mesh.instanceMatrix.needsUpdate = true;
      k.free.push(p.slot);
    }
  }

  clear(filter?: (p: Prop) => boolean): void {
    for (const p of [...this.props]) if (!filter || filter(p)) this.remove(p);
  }

  private updateProp(p: Prop): void {
    p.body.fitRigid(nodesAll(p.body), _R, _T, p.q);
    _m.set(_R[0], _R[1], _R[2], _T[0], _R[3], _R[4], _R[5], _T[1], _R[6], _R[7], _R[8], _T[2], 0, 0, 0, 1);
    if (p.object) {
      p.object.matrixAutoUpdate = false;
      p.object.matrix.copy(_m);
      p.object.matrixWorldNeedsUpdate = true;
    } else {
      const k = this.kinds.get(p.def.id)!;
      k.mesh.setMatrixAt(p.slot, _m);
      k.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt: number): void {
    for (const p of [...this.props]) {
      p.age += dt;
      if (p.age > p.ttl || p.body.min[1] < -200) {
        this.remove(p);
        continue;
      }
      if (p.body.sleeping) continue;
      this.updateProp(p);
    }
  }

  /** World position of a prop (center). */
  center(p: Prop, out: THREE.Vector3): THREE.Vector3 {
    const c = new Float64Array(3);
    p.body.centerOfMass(c);
    return out.set(c[0], c[1], c[2]);
  }
}

const allCache = new WeakMap<SoftBody, Int32Array>();
function nodesAll(b: SoftBody): Int32Array {
  let a = allCache.get(b);
  if (!a) {
    a = new Int32Array(b.n);
    for (let i = 0; i < b.n; i++) a[i] = i;
    allCache.set(b, a);
  }
  return a;
}
