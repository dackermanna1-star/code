import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { RAPIER, GROUPS, type SurfaceMaterial, type RCollider } from '../physics/Physics';
import { levelTexture } from '../render/LevelTextures';

export interface MatDef {
  tex: string;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  /** meters per texture repeat */
  uv?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  surface: SurfaceMaterial;
  shadow?: boolean;
  receive?: boolean;
}

type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

interface Accum {
  pos: number[];
  nor: number[];
  uv: number[];
  idx: number[];
}

export interface BoxOpts {
  collide?: boolean;
  skip?: Face[];
  surface?: SurfaceMaterial;
  /** override uv scale */
  uv?: number;
  /** uv offset to break repetition */
  uvOff?: [number, number];
  rotY?: number;
  /** cast shadows (default per material) */
  shadow?: boolean;
}

export interface VirtualLight {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  decay?: number;
  kind: 'point' | 'spot';
  target?: THREE.Vector3;
  angle?: number;
  penumbra?: number;
  flicker?: number;
  /** importance multiplier for the light manager */
  priority?: number;
  /** animate with music / disco */
  disco?: boolean;
  /** current animated multiplier */
  mul?: number;
  zone?: string;
  on?: boolean;
}

const FACES: { f: Face; n: [number, number, number]; c: number[][] }[] = [
  { f: 'px', n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { f: 'nx', n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { f: 'py', n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { f: 'ny', n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { f: 'pz', n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { f: 'nz', n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/** Accumulates static level geometry per material and creates colliders. */
export class LevelBuilder {
  readonly mats = new Map<string, { def: MatDef; mat: THREE.MeshStandardMaterial; acc: Accum }>();
  readonly lights: VirtualLight[] = [];
  readonly group = new THREE.Group();
  readonly colliders: RCollider[] = [];
  /** extra meshes (glass, neon, special) */
  readonly extras: THREE.Object3D[] = [];
  bounds = new THREE.Box3();

  constructor(public scene: THREE.Scene) {
    this.group.name = 'level';
    scene.add(this.group);
  }

  defineMat(key: string, def: MatDef): void {
    const tex = levelTexture(def.tex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: def.color ?? 0xffffff,
      roughness: def.roughness ?? 0.85,
      metalness: def.metalness ?? 0,
    });
    if (def.emissive) {
      mat.emissive = new THREE.Color(def.emissive);
      mat.emissiveIntensity = def.emissiveIntensity ?? 1;
      mat.emissiveMap = tex;
    }
    this.mats.set(key, { def, mat, acc: { pos: [], nor: [], uv: [], idx: [] } });
  }

  material(key: string): THREE.MeshStandardMaterial {
    return this.mats.get(key)!.mat;
  }

  /** Axis-aligned (or Y-rotated) box from min/max corners. */
  box(matKey: string, min: [number, number, number], max: [number, number, number], o: BoxOpts = {}): void {
    const cx = (min[0] + max[0]) / 2,
      cy = (min[1] + max[1]) / 2,
      cz = (min[2] + max[2]) / 2;
    const sx = Math.abs(max[0] - min[0]),
      sy = Math.abs(max[1] - min[1]),
      sz = Math.abs(max[2] - min[2]);
    this.cbox(matKey, [cx, cy, cz], [sx, sy, sz], o);
  }

  /** Box from center and size. */
  cbox(matKey: string, c: [number, number, number], s: [number, number, number], o: BoxOpts = {}): void {
    const m = this.mats.get(matKey);
    if (!m) throw new Error('no material ' + matKey);
    const acc = m.acc;
    const uvScale = o.uv ?? m.def.uv ?? 1;
    const rot = o.rotY ?? 0;
    _q.setFromAxisAngle(Y, rot);
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const off = o.uvOff ?? [0, 0];
    for (const face of FACES) {
      if (o.skip?.includes(face.f)) continue;
      const base = acc.pos.length / 3;
      _n.set(face.n[0], face.n[1], face.n[2]).applyQuaternion(_q);
      for (let k = 0; k < 4; k++) {
        const cc = face.c[k];
        // local corner
        const lx = (cc[0] - 0.5) * s[0],
          ly = (cc[1] - 0.5) * s[1],
          lz = (cc[2] - 0.5) * s[2];
        _v.set(lx, ly, lz).applyQuaternion(_q);
        const wx = c[0] + _v.x,
          wy = c[1] + _v.y,
          wz = c[2] + _v.z;
        acc.pos.push(wx, wy, wz);
        acc.nor.push(_n.x, _n.y, _n.z);
        // uv in the box's local frame but world-scaled (so textures tile continuously)
        let u = 0,
          v = 0;
        // world-aligned coordinates for axis aligned boxes, local for rotated
        const ux = rot === 0 ? wx : lx + c[0];
        const uz = rot === 0 ? wz : lz + c[2];
        if (face.f === 'px' || face.f === 'nx') {
          u = face.f === 'px' ? -uz : uz;
          v = wy;
        } else if (face.f === 'py' || face.f === 'ny') {
          u = ux;
          v = -uz;
        } else {
          u = face.f === 'pz' ? ux : -ux;
          v = wy;
        }
        acc.uv.push(u / uvScale + off[0], v / uvScale + off[1]);
      }
      acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      void hx;
      void hy;
      void hz;
    }
    if (o.collide !== false) {
      const desc = RAPIER.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2)
        .setTranslation(c[0], c[1], c[2])
        .setCollisionGroups(GROUPS.STATIC)
        .setFriction(0.8);
      if (rot !== 0) desc.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      const col = ctx.physics.world.createCollider(desc);
      ctx.physics.register(col, { kind: 'static', material: o.surface ?? m.def.surface });
      this.colliders.push(col);
    }
    this.bounds.expandByPoint(new THREE.Vector3(c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2));
    this.bounds.expandByPoint(new THREE.Vector3(c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2));
  }

  /** Invisible collider only. */
  collider(c: [number, number, number], s: [number, number, number], surface: SurfaceMaterial, rot?: THREE.Quaternion): RCollider {
    const desc = RAPIER.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2)
      .setTranslation(c[0], c[1], c[2])
      .setCollisionGroups(GROUPS.STATIC)
      .setFriction(0.8);
    if (rot) desc.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    const col = ctx.physics.world.createCollider(desc);
    ctx.physics.register(col, { kind: 'static', material: surface });
    this.colliders.push(col);
    return col;
  }

  /**
   * Wall along X (constant z) from x0..x1, y0..y1, thickness t centered on z.
   * openings: [xa, xb, ya, yb] cut out (doors/windows).
   */
  wallX(matKey: string, z: number, x0: number, x1: number, y0: number, y1: number, t: number, openings: [number, number, number, number][] = [], o: BoxOpts = {}): void {
    const xs = new Set<number>([x0, x1]);
    for (const op of openings) {
      xs.add(Math.max(x0, Math.min(x1, op[0])));
      xs.add(Math.max(x0, Math.min(x1, op[1])));
    }
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i],
        b = sorted[i + 1];
      if (b - a < 1e-4) continue;
      const mid = (a + b) / 2;
      const ops = openings.filter((op) => mid > op[0] && mid < op[1]);
      if (ops.length === 0) this.box(matKey, [a, y0, z - t / 2], [b, y1, z + t / 2], o);
      else {
        const op = ops[0];
        if (op[2] > y0 + 1e-3) this.box(matKey, [a, y0, z - t / 2], [b, op[2], z + t / 2], o);
        if (op[3] < y1 - 1e-3) this.box(matKey, [a, op[3], z - t / 2], [b, y1, z + t / 2], o);
      }
    }
  }

  /** Wall along Z (constant x). openings: [za, zb, ya, yb]. */
  wallZ(matKey: string, x: number, z0: number, z1: number, y0: number, y1: number, t: number, openings: [number, number, number, number][] = [], o: BoxOpts = {}): void {
    const zs = new Set<number>([z0, z1]);
    for (const op of openings) {
      zs.add(Math.max(z0, Math.min(z1, op[0])));
      zs.add(Math.max(z0, Math.min(z1, op[1])));
    }
    const sorted = [...zs].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i],
        b = sorted[i + 1];
      if (b - a < 1e-4) continue;
      const mid = (a + b) / 2;
      const ops = openings.filter((op) => mid > op[0] && mid < op[1]);
      if (ops.length === 0) this.box(matKey, [x - t / 2, y0, a], [x + t / 2, y1, b], o);
      else {
        const op = ops[0];
        if (op[2] > y0 + 1e-3) this.box(matKey, [x - t / 2, y0, a], [x + t / 2, op[2], b], o);
        if (op[3] < y1 - 1e-3) this.box(matKey, [x - t / 2, op[3], a], [x + t / 2, y1, b], o);
      }
    }
  }

  /**
   * Straight staircase. Steps go from (start, y0) to (end, y1) along axis 'x' or 'z'.
   * `across` = [a, b] range on the perpendicular axis.
   */
  stairs(matKey: string, axis: 'x' | 'z', start: number, end: number, across: [number, number], y0: number, y1: number, stringerMat?: string): void {
    const rise = y1 - y0;
    const run = end - start;
    const n = Math.max(2, Math.round(Math.abs(rise) / 0.19));
    const stepRise = rise / n;
    const stepRun = run / n;
    for (let i = 0; i < n; i++) {
      const a = start + stepRun * i;
      const b = a + stepRun;
      const top = y0 + stepRise * (i + 1);
      const bottom = top - Math.max(stepRise * 1.6, 0.12);
      if (axis === 'z') this.box(matKey, [across[0], Math.max(y0, bottom), Math.min(a, b)], [across[1], top, Math.max(a, b)], { collide: false });
      else this.box(matKey, [Math.min(a, b), Math.max(y0, bottom), across[0]], [Math.max(a, b), top, across[1]], { collide: false });
    }
    // stringers (side boards)
    if (stringerMat) {
      const len = Math.hypot(run, rise);
      const ang = Math.atan2(rise, Math.abs(run));
      for (const side of [across[0] - 0.04, across[1] + 0.04]) {
        const cAlong = (start + end) / 2;
        const cy = (y0 + y1) / 2 - 0.12;
        const g = new THREE.Group();
        void g;
        this.slab(stringerMat, axis, cAlong, side, cy, len, 0.08, 0.32, run > 0 ? ang : -ang, false);
      }
    }
    // smooth ramp collider covering the step noses
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    const cAlong = (start + end) / 2;
    const cAcross = (across[0] + across[1]) / 2;
    const width = Math.abs(across[1] - across[0]);
    const thick = 0.2;
    const cy = (y0 + y1) / 2 - thick / 2 + 0.02;
    const q = new THREE.Quaternion();
    if (axis === 'z') {
      // slope along z: rotate around x. positive run toward +z rising -> rotation about x of -ang
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang);
      this.collider([cAcross, cy, cAlong], [width, thick, len], 'wood', q);
    } else {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      this.collider([cAlong, cy, cAcross], [len, thick, width], 'wood', q);
    }
  }

  /** Rotated slab (used for stair stringers / ramps): visual only unless collide. */
  slab(matKey: string, axis: 'x' | 'z', along: number, across: number, cy: number, len: number, thickAcross: number, height: number, angle: number, collide: boolean): void {
    const m = this.mats.get(matKey)!;
    const acc = m.acc;
    const geo = new THREE.BoxGeometry(axis === 'x' ? len : thickAcross, height, axis === 'x' ? thickAcross : len);
    const q = new THREE.Quaternion();
    if (axis === 'z') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
    else q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(axis === 'x' ? along : across, cy, axis === 'x' ? across : along), q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mat);
    const base = acc.pos.length / 3;
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      acc.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      acc.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      acc.uv.push(uv.getX(i) * len, uv.getY(i));
    }
    const idx = geo.getIndex()!;
    for (let i = 0; i < idx.count; i++) acc.idx.push(base + idx.getX(i));
    if (collide) {
      this.collider([axis === 'x' ? along : across, cy, axis === 'x' ? across : along], [axis === 'x' ? len : thickAcross, height, axis === 'x' ? thickAcross : len], m.def.surface, q);
    }
  }

  light(l: Omit<VirtualLight, 'color' | 'pos'> & { pos: [number, number, number]; color: THREE.ColorRepresentation; target?: THREE.Vector3 }): VirtualLight {
    const vl: VirtualLight = { ...l, pos: new THREE.Vector3(...l.pos), color: new THREE.Color(l.color), mul: 1, on: true };
    this.lights.push(vl);
    return vl;
  }

  /** Neon text sign: emissive plane with glow. */
  neon(text: string, pos: [number, number, number], rotY: number, color: string, height = 0.5, opts: { font?: string; flicker?: number; light?: boolean; frame?: boolean } = {}): THREE.Mesh {
    const c = document.createElement('canvas');
    const font = opts.font ?? "bold 120px 'Bungee', 'Impact', sans-serif";
    const g = c.getContext('2d')!;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 80;
    c.width = w;
    c.height = 180;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 28;
    g.strokeStyle = color;
    g.lineWidth = 7;
    g.strokeText(text, w / 2, 92);
    g.shadowBlur = 12;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeText(text, w / 2, 92);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const aspect = w / 180;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), mat);
    mesh.position.set(...pos);
    mesh.rotation.y = rotY;
    mesh.renderOrder = 5;
    this.group.add(mesh);
    this.extras.push(mesh);
    if (opts.frame) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(height * aspect * 1.04, height * 1.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
      back.position.set(0, 0, -0.04);
      mesh.add(back);
    }
    if (opts.light !== false) {
      const n = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
      this.light({ pos: [pos[0] + n.x * 0.6, pos[1], pos[2] + n.z * 0.6], color, intensity: 5 * height, distance: 5 + height * 4, kind: 'point', flicker: opts.flicker, priority: 0.8 });
    }
    (mesh.userData as any).flicker = opts.flicker ?? 0;
    return mesh;
  }

  /** Finalize merged meshes. */
  build(): void {
    for (const [key, m] of this.mats) {
      if (m.acc.pos.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.acc.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(m.acc.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(m.acc.uv, 2));
      g.setIndex(m.acc.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m.mat);
      mesh.name = 'level_' + key;
      mesh.castShadow = m.def.shadow ?? true;
      mesh.receiveShadow = m.def.receive ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
  }
}
