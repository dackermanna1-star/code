// Obstacle framework: every obstacle owns its colliders (static or
// kinematic), its meshes and its editable parameters.

import * as THREE from 'three';
import { Collider } from '../../sim/colliders.ts';
import type { World, SubstepController } from '../../sim/world.ts';
import type { Heightfield } from '../../sim/terrain.ts';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
}

export interface ObstacleHost {
  world: World;
  scene: THREE.Scene;
  terrain: Heightfield;
  /** Spawn a dynamic prop (soft body) and return an opaque handle. */
  spawnProp(kind: string, x: number, y: number, z: number, yaw: number, opts?: { pitch?: number; roll?: number; vx?: number; vy?: number; vz?: number }): unknown;
  removeProp(handle: unknown): void;
  /** Play a positional sound effect. */
  sound(name: string, x: number, y: number, z: number, gain?: number): void;
  /** Register a looping positional sound owned by an obstacle. */
  loopSound(name: string): { set(x: number, y: number, z: number, gain: number, rate?: number): void; stop(): void } | null;
  emitSparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, speed: number): void;
  emitDust(x: number, y: number, z: number, count: number, color?: [number, number, number]): void;
}

export interface ObstacleType {
  id: string;
  name: string;
  category: 'Barriers' | 'Ramps & Stunts' | 'Hazards' | 'Machines' | 'Props';
  description: string;
  params: ParamDef[];
  create(host: ObstacleHost, x: number, z: number, yaw: number, params: Record<string, number>): Obstacle;
}

export const REGISTRY = new Map<string, ObstacleType>();

export function register(t: ObstacleType): void {
  REGISTRY.set(t.id, t);
}

let obstacleIds = 1;

export abstract class Obstacle implements SubstepController {
  readonly id = obstacleIds++;
  abstract readonly type: string;
  readonly host: ObstacleHost;
  x: number;
  z: number;
  y = 0;
  yaw: number;
  params: Record<string, number>;
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly kinematics: Collider[] = [];
  /** true when created by the map (not deletable by default in the editor) */
  builtin = false;
  enabled = true;
  protected R = new Float64Array(9);

  constructor(host: ObstacleHost, x: number, z: number, yaw: number, params: Record<string, number>) {
    this.host = host;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.params = { ...params };
  }

  /** Build colliders and meshes. Called on creation and after param edits. */
  abstract build(): void;

  init(): this {
    this.y = this.groundY();
    this.computeRot();
    this.build();
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.host.scene.add(this.group);
    this.group.userData.obstacle = this;
    this.group.traverse((o) => (o.userData.obstacle = this));
    if (this.kinematics.length || this.wantsSubsteps()) this.host.world.addController(this);
    return this;
  }

  protected wantsSubsteps(): boolean {
    return false;
  }

  protected groundY(): number {
    return this.host.terrain.heightAt(this.x, this.z);
  }

  protected computeRot(): void {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const r = this.R;
    r[0] = c; r[1] = 0; r[2] = s;
    r[3] = 0; r[4] = 1; r[5] = 0;
    r[6] = -s; r[7] = 0; r[8] = c;
  }

  /** Local -> world point. */
  toWorld(lx: number, ly: number, lz: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const r = this.R;
    return out.set(this.x + r[0] * lx + r[2] * lz, this.y + ly, this.z + r[6] * lx + r[8] * lz);
  }

  /** Local direction -> world. */
  dirWorld(lx: number, ly: number, lz: number, out: Float64Array | number[]): void {
    const r = this.R;
    out[0] = r[0] * lx + r[2] * lz;
    out[1] = ly;
    out[2] = r[6] * lx + r[8] * lz;
  }

  /** Add a static box collider in local coordinates (with optional local yaw/pitch). */
  protected staticBox(lx: number, ly: number, lz: number, hx: number, hy: number, hz: number, opts: ColliderOpts = {}): Collider {
    const c = Collider.box(hx, hy, hz);
    this.poseCollider(c, lx, ly, lz, opts);
    applyOpts(c, opts);
    this.host.world.addStatic(c);
    this.colliders.push(c);
    return c;
  }

  protected staticCollider(c: Collider, lx: number, ly: number, lz: number, opts: ColliderOpts = {}): Collider {
    this.poseCollider(c, lx, ly, lz, opts);
    applyOpts(c, opts);
    this.host.world.addStatic(c);
    this.colliders.push(c);
    return c;
  }

  protected kinematicCollider(c: Collider, opts: ColliderOpts = {}): Collider {
    applyOpts(c, opts);
    c.kinematic = true;
    this.host.world.addKinematic(c);
    this.kinematics.push(c);
    c.owner = this;
    return c;
  }

  /** Set a collider pose from local position and local rotation (pitch about X, roll about Z, yaw about Y). */
  protected poseCollider(c: Collider, lx: number, ly: number, lz: number, opts: { pitch?: number; roll?: number; yaw?: number; rot?: ArrayLike<number> } = {}): void {
    const p = this.toWorld(lx, ly, lz, _v);
    c.setPosition(p.x, p.y, p.z);
    const local = new Float64Array(9);
    if (opts.rot) local.set(opts.rot as ArrayLike<number>);
    else eulerMat(opts.pitch ?? 0, opts.yaw ?? 0, opts.roll ?? 0, local);
    mul3(this.R, local, c.rot);
    c.updateBounds();
  }

  /** Called every physics substep (kinematic motion). */
  preSubstep?(t: number, dt: number): void;
  /** Per-frame visual update. */
  update(_dt: number, _time: number): void {}
  /** Reset dynamic state (e.g. respawn dropped objects). */
  reset(): void {}

  rebuild(): void {
    this.clearPhysics();
    this.group.clear();
    this.y = this.groundY();
    this.computeRot();
    this.build();
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.group.traverse((o) => (o.userData.obstacle = this));
    this.group.updateMatrixWorld(true);
    if (this.kinematics.length || this.wantsSubsteps()) this.host.world.addController(this);
  }

  protected clearPhysics(): void {
    for (const c of this.colliders) this.host.world.removeStatic(c);
    for (const c of this.kinematics) this.host.world.removeKinematic(c);
    this.colliders.length = 0;
    this.kinematics.length = 0;
    this.host.world.removeController(this);
  }

  dispose(): void {
    this.clearPhysics();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.sharedGeo) m.geometry?.dispose();
    });
  }

  setEnabled(e: boolean): void {
    this.enabled = e;
    for (const c of [...this.colliders, ...this.kinematics]) c.enabled = e;
    this.group.visible = e;
  }
}

export interface ColliderOpts {
  pitch?: number;
  roll?: number;
  yaw?: number;
  rot?: ArrayLike<number>;
  friction?: number;
  surface?: number;
  flags?: number;
  restitution?: number;
  tag?: string;
  harshness?: number;
}

function applyOpts(c: Collider, o: ColliderOpts): void {
  if (o.friction !== undefined) c.friction = o.friction;
  if (o.surface !== undefined) c.surface = o.surface;
  if (o.flags !== undefined) c.flags |= o.flags;
  if (o.restitution !== undefined) c.restitution = o.restitution;
  if (o.tag !== undefined) c.tag = o.tag;
  if (o.harshness !== undefined) c.harshness = o.harshness;
}

const _v = new THREE.Vector3();

export function eulerMat(pitch: number, yaw: number, roll: number, out: Float64Array): Float64Array {
  // R = Ry * Rx * Rz
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const t = new Float64Array(9);
  mul3(ry, rx, t);
  mul3(t, rz, out);
  return out;
}

export function mul3(a: ArrayLike<number>, b: ArrayLike<number>, out: Float64Array): Float64Array {
  const r = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  out.set(r);
  return out;
}

/** Copy a row-major 3x3 rotation + position into an Object3D (world). */
export function applyPose(o: THREE.Object3D, R: ArrayLike<number>, x: number, y: number, z: number): void {
  _m4.set(R[0], R[1], R[2], x, R[3], R[4], R[5], y, R[6], R[7], R[8], z, 0, 0, 0, 1);
  o.matrix.copy(_m4);
  o.matrix.decompose(o.position, o.quaternion, o.scale);
}
const _m4 = new THREE.Matrix4();
