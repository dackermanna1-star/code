/**
 * Skeletal ragdolls built from `model.userData.bones` (mobs workstream format):
 *   { name, obj: THREE.Object3D, size: [w,h,d], parent: string|null, pivot: Vector3, mass?,
 *     center?: Vector3 (box centre in bone-local space; default: bounds of the bone's own meshes) }
 *
 * One cuboid body per bone; spherical joints with per-axis (twist/swing) limits for necks,
 * shoulders, hips and tails, limited revolute joints for elbows and knees; joint motors add
 * a little "muscle" damping. The current pose at death is the joints' neutral pose.
 * Bodies inherit the entity velocity and receive the killing impulse (DamageSource.dir ×
 * impulse at `point`; explosions push every part radially). Bone objects are driven from the
 * bodies every frame. After ~12 s the corpse sinks into the ground and the entity is removed.
 *
 * Contract with entities: while a ragdoll is active `entity.data.ragdoll === true` (animation
 * must stop), `entity.data.keepBodyTicks` is set (deathRemoveTicks should return it). If the
 * entity is removed earlier, the corpse model is kept in the ragdoll system's own scene.
 */
import * as THREE from 'three';
import type * as RAPIER_NS from '@dimforge/rapier3d-compat';
import { GROUP, type PhysBody, type PhysicsWorld } from './rapierWorld';
import type { GameSystem } from '../game/systems';
import type { Game } from '../game/game';
import type { DamageSource } from '../entity/entity';

export interface RagdollBone {
  name: string;
  obj: THREE.Object3D;
  size: [number, number, number];
  parent: string | null;
  pivot?: THREE.Vector3;
  mass?: number;
  center?: THREE.Vector3;
}

type Part = 'head' | 'upperArm' | 'lowerArm' | 'upperLeg' | 'lowerLeg' | 'tail' | 'torso' | 'other';
export function classifyBone(name: string): Part {
  const n = name.toLowerCase();
  if (/head|neck|skull|jaw/.test(n)) return 'head';
  if (/forearm|lower_?arm|elbow|hand/.test(n)) return 'lowerArm';
  if (/arm|shoulder|wing/.test(n)) return 'upperArm';
  if (/shin|calf|lower_?leg|knee|foot/.test(n)) return 'lowerLeg';
  if (/leg|thigh|hip/.test(n)) return 'upperLeg';
  if (/tail/.test(n)) return 'tail';
  if (/body|torso|chest|pelvis|spine|hips/.test(n)) return 'torso';
  return 'other';
}
const MASS_FRACTION: Record<Part, number> = { head: 0.08, upperArm: 0.04, lowerArm: 0.025, upperLeg: 0.1, lowerLeg: 0.06, tail: 0.02, torso: 0.45, other: 0.05 };

interface RBone {
  def: RagdollBone;
  body: PhysBody;
  /** box centre in bone-local space (scaled to world units by `scale`) */
  center: THREE.Vector3;
  scale: THREE.Vector3;
  parent: RBone | null;
  part: Part;
}

export class Ragdoll {
  readonly bones: RBone[] = [];
  readonly joints: RAPIER_NS.ImpulseJoint[] = [];
  age = 0;
  life = 12;
  sink = 0;
  removed = false;
  private _p = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private _m = new THREE.Matrix4();
  private _inv = new THREE.Matrix4();

  constructor(readonly pw: PhysicsWorld, readonly model: THREE.Object3D, readonly entity: any = null) {}

  get root(): RBone {
    return this.bones[0];
  }

  /** Lowest point of the body (for the entity's feet position). */
  bottom() {
    let y = Infinity;
    for (const b of this.bones) y = Math.min(y, b.body.pos.y - b.body.radius * 0.6);
    return y;
  }

  /** Drive the bone objects from the (interpolated) bodies. */
  drive(alpha: number) {
    const parentOf = this.model.parent;
    parentOf?.updateWorldMatrix(true, false);
    this.model.updateMatrixWorld(true);
    const sink = this.sink * 0.9;
    for (const b of this.bones) {
      const o = b.def.obj;
      b.body.interpolate(alpha, this._p, this._q);
      this._p.y -= sink;
      // body centre -> bone origin
      const off = b.center.clone().multiply(b.scale).applyQuaternion(this._q);
      this._p.sub(off);
      this._m.compose(this._p, this._q, b.scale);
      if (o.parent) {
        this._inv.copy(o.parent.matrixWorld).invert();
        this._m.premultiply(this._inv);
      }
      this._m.decompose(o.position, o.quaternion, o.scale);
      o.updateMatrixWorld(true);
    }
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    for (const j of this.joints) if (j.isValid()) this.pw.rw.removeImpulseJoint(j, false);
    for (const b of this.bones) this.pw.removeBody(b.body);
  }
}

const tmpBox = new THREE.Box3();

/** Box centre (bone-local) of the bone's own meshes, excluding child bones. */
function ownBounds(obj: THREE.Object3D, boneObjs: Set<THREE.Object3D>): THREE.Box3 | null {
  const out = new THREE.Box3();
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const visit = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (boneObjs.has(c)) continue;
      const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g?.attributes?.position) {
        if (!g.boundingBox) g.computeBoundingBox();
        tmpBox.copy(g.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        out.union(tmpBox);
      }
      visit(c);
    }
  };
  visit(obj);
  return out.isEmpty() ? null : out;
}

/** Quaternion whose rotated basis is (x, y, x×y). */
function frameQuat(x: THREE.Vector3, y: THREE.Vector3): THREE.Quaternion {
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const yy = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yy, z));
}

export interface RagdollOptions {
  /** Initial velocity of every part (entity velocity, b/s). */
  velocity?: THREE.Vector3;
  /** Total mass when bones have no `mass` (kg). */
  mass?: number;
}

/** Build a ragdoll for a model with `userData.bones`. Returns null when the model has no bones. */
export function buildRagdoll(pw: PhysicsWorld, model: THREE.Object3D, entity: any = null, opts: RagdollOptions = {}): Ragdoll | null {
  const defs = model.userData?.bones as RagdollBone[] | undefined;
  if (!defs?.length) return null;
  const R = pw.R;
  model.updateWorldMatrix(true, true);
  // parents first
  const byName = new Map(defs.map((d) => [d.name, d]));
  const order: RagdollBone[] = [];
  const seen = new Set<string>();
  const add = (d: RagdollBone) => {
    if (seen.has(d.name)) return;
    if (d.parent && byName.has(d.parent)) add(byName.get(d.parent)!);
    seen.add(d.name);
    order.push(d);
  };
  defs.forEach(add);
  const boneObjs = new Set(defs.map((d) => d.obj));
  const totalMass = opts.mass ?? entity?.mass ?? 60;
  const rd = new Ragdoll(pw, model, entity);
  const modelQ = new THREE.Quaternion();
  model.getWorldQuaternion(modelQ);
  const lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(modelQ);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(modelQ);
  const map = new Map<string, RBone>();
  for (const d of order) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    d.obj.matrixWorld.decompose(pos, q, s);
    const part = classifyBone(d.name);
    let center = d.center?.clone();
    if (!center) {
      const bb = ownBounds(d.obj, boneObjs);
      center = bb ? bb.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, -d.size[1] / 2, 0);
    }
    const half: [number, number, number] = [Math.max(0.03, d.size[0] * s.x * 0.46), Math.max(0.03, d.size[1] * s.y * 0.48), Math.max(0.03, d.size[2] * s.z * 0.46)];
    const c = center.clone().multiply(s).applyQuaternion(q).add(pos);
    const mass = d.mass ?? MASS_FRACTION[part] * totalMass;
    const body = pw.addBody({
      kind: 'ragdoll', owner: rd, position: c, rotation: q, linvel: opts.velocity,
      shape: { type: 'box', half }, mass: Math.max(0.5, mass), friction: 0.8, restitution: 0.05,
      group: GROUP.RAGDOLL, linearDamping: 0.12, angularDamping: 0.9, solverIterations: 4, impacts: part === 'torso' || part === 'head',
    });
    body.userData.sound = 'wool';
    const rb: RBone = { def: d, body, center, scale: s, parent: d.parent ? map.get(d.parent) ?? null : null, part };
    map.set(d.name, rb);
    rd.bones.push(rb);
    if (!rb.parent) continue;
    // ---- joint at the bone origin (the pivot)
    const P = rb.parent.body;
    const a1 = pos.clone().sub(P.pos).applyQuaternion(P.quat.clone().invert());
    const a2 = pos.clone().sub(c).applyQuaternion(q.clone().invert());
    const twist = c.clone().sub(pos);
    if (twist.lengthSq() < 1e-6) twist.set(0, -1, 0).applyQuaternion(q);
    twist.normalize();
    let lat = lateral.clone().addScaledVector(twist, -lateral.dot(twist));
    if (lat.lengthSq() < 1e-4) lat = forward.clone().addScaledVector(twist, -forward.dot(twist));
    lat.normalize();
    const hinge = part === 'lowerArm' || part === 'lowerLeg';
    // world joint frame: spherical X = twist, Y = lateral; revolute X = lateral (hinge)
    const Rj = hinge ? frameQuat(lat, twist) : frameQuat(twist, lat);
    const f1 = P.quat.clone().invert().multiply(Rj);
    const f2 = q.clone().invert().multiply(Rj);
    let j: RAPIER_NS.ImpulseJoint;
    const v = (x: THREE.Vector3) => ({ x: x.x, y: x.y, z: x.z });
    if (hinge) {
      j = pw.rw.createImpulseJoint(R.JointData.revolute(v(a1), v(a2), { x: 1, y: 0, z: 0 }), P.rb, body.rb, true);
      j.setLocalFrame1(v(a1), f1);
      j.setLocalFrame2(v(a2), f2);
      // + = limb tip swings forward: elbows bend forward, knees backward
      const raw = (j as any).rawSet;
      if (part === 'lowerArm') raw.jointSetLimits(j.handle, R.JointAxis.AngX, -0.05, 2.3);
      else raw.jointSetLimits(j.handle, R.JointAxis.AngX, -2.3, 0.05);
      raw.jointConfigureMotorVelocity(j.handle, R.JointAxis.AngX, 0, 0.4);
    } else {
      j = pw.rw.createImpulseJoint(R.JointData.spherical(v(a1), v(a2)), P.rb, body.rb, true);
      j.setLocalFrame1(v(a1), f1);
      j.setLocalFrame2(v(a2), f2);
      // [twist], [flex about lateral: + forward], [sideways]
      const L: Record<string, [number, number][]> = {
        head: [[-0.6, 0.6], [-0.5, 0.75], [-0.45, 0.45]],
        upperArm: [[-0.9, 0.9], [-0.9, 2.4], [-1.4, 1.4]],
        upperLeg: [[-0.4, 0.4], [-0.45, 1.7], [-0.6, 0.6]],
        tail: [[-0.3, 0.3], [-0.9, 0.9], [-0.9, 0.9]],
      };
      const lim = L[part] ?? [[-0.35, 0.35], [-0.6, 0.6], [-0.6, 0.6]];
      const raw = (j as any).rawSet;
      raw.jointSetLimits(j.handle, R.JointAxis.AngX, lim[0][0], lim[0][1]);
      raw.jointSetLimits(j.handle, R.JointAxis.AngY, lim[1][0], lim[1][1]);
      raw.jointSetLimits(j.handle, R.JointAxis.AngZ, lim[2][0], lim[2][1]);
      for (const ax of [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ]) raw.jointConfigureMotorVelocity(j.handle, ax, 0, 0.25);
    }
    j.setContactsEnabled(false);
    rd.joints.push(j);
  }
  return rd;
}

/** Apply the killing blow: point impulse on the hit part plus a share on the whole body. */
export function applyKillImpulse(rd: Ragdoll, src: DamageSource | null) {
  if (!src) return;
  const pw = rd.pw;
  const total = rd.bones.reduce((a, b) => a + b.body.mass, 0);
  if (src.explosion || src.type === 'explosion') {
    const c = src.point ?? rd.root.body.pos;
    const dv = Math.min(16, 3 + (src.impulse ?? 2) * 2.2);
    for (const b of rd.bones) {
      const d = b.body.pos.clone().sub(c);
      d.y = Math.abs(d.y) + 0.4;
      d.normalize().multiplyScalar(dv * b.body.mass * (0.8 + Math.random() * 0.4));
      pw.applyImpulse(b.body, d);
    }
    return;
  }
  if (!src.dir) return;
  const dir = src.dir.clone().normalize();
  const w = src.weapon ?? '';
  const heavy = /_axe$|mace|trident/.test(w) ? 1.5 : /_sword$/.test(w) ? 1.0 : w === 'arrow' ? 0.7 : 0.6;
  const mag = Math.min(8, (src.impulse ?? 1) * 1.6) * heavy; // m/s of whole-body velocity change
  // whole body shove (falls in the hit direction) ...
  for (const b of rd.bones) pw.applyImpulse(b.body, dir.clone().multiplyScalar(mag * 0.55 * b.body.mass));
  // ... and a concentrated push on the part that was hit (spin / limb reaction)
  const p = src.point;
  let hit = rd.root;
  if (p) {
    let best = Infinity;
    for (const b of rd.bones) {
      const d = b.body.pos.distanceToSquared(p);
      if (d < best) { best = d; hit = b; }
    }
  }
  const J = dir.clone().multiplyScalar(mag * 0.45 * total * (w === 'arrow' ? 0.6 : 1));
  if (/_axe$/.test(w)) J.y -= mag * 0.15 * total; // chop drives down
  pw.applyImpulse(hit.body, J, p ?? hit.body.pos);
}

/** Converts dying entities' models into ragdolls (`game.ragdolls`). */
export class RagdollSystem implements GameSystem {
  readonly name = 'ragdolls';
  readonly active = new Set<Ragdoll>();
  /** Corpses whose entity was removed before the ragdoll ended. */
  readonly scene = new THREE.Scene();
  private game!: Game;
  private lightT = 0;
  /** Max simultaneous ragdolls. */
  maxActive = 10;

  init(game: Game) {
    this.game = game;
    (game as any).ragdolls = this;
    const ex = game.renderExtras;
    (ex.gbuffer ??= []).push(this.scene);
    (ex.shadow ??= []).push(this.scene);
    game.events.on('entityDeath', ({ entity, source }: any) => {
      try {
        this.onDeath(entity, source);
      } catch (e) {
        console.warn('ragdoll failed', e);
      }
    });
    game.events.on('entityRemoved', ({ entity }: any) => {
      for (const rd of this.active) {
        if (rd.entity !== entity || rd.removed) continue;
        if (entity === game.player) { this.end(rd); continue; }
        // keep the corpse until the ragdoll ends
        this.scene.add(rd.model);
      }
    });
  }

  onDeath(entity: any, source: DamageSource | null) {
    const g = this.game;
    const pw = g.physics as PhysicsWorld | null;
    if (!pw || !g.settings.ragdolls || !entity?.model?.userData?.bones) return null;
    if (entity === g.player && g.cameraCtl?.perspective === 'first') {
      // still ragdoll (visible in third person / to others), cheap enough
    }
    const rd = buildRagdoll(pw, entity.model, entity, { velocity: entity.vel?.clone(), mass: entity.mass });
    if (!rd) return null;
    applyKillImpulse(rd, source);
    // keep the cost bounded: the oldest corpses go first
    if (this.active.size >= this.maxActive) {
      const oldest = [...this.active].sort((a, b) => b.age - a.age)[0];
      if (oldest) this.end(oldest);
    }
    entity.data.ragdoll = true;
    entity.data.keepBodyTicks = Math.ceil((rd.life + 1.6) * 20);
    this.active.add(rd);
    g.events.emit('ragdollStart', { entity, ragdoll: rd });
    return rd;
  }

  private end(rd: Ragdoll) {
    rd.dispose();
    this.active.delete(rd);
    if (rd.model.parent === this.scene) rd.model.removeFromParent();
    const e = rd.entity;
    if (e) {
      e.data.ragdoll = false;
      if (!e.removed && e !== this.game.player) e.remove();
    }
  }

  physics(game: Game) {
    for (const rd of this.active) {
      const e = rd.entity;
      if (!e || e.removed || rd.removed) continue;
      const r = rd.root.body.pos;
      e.vel.set(0, 0, 0);
      e.pos.set(r.x, Math.max(rd.bottom(), r.y - 1.5), r.z);
      e.updateBox?.();
    }
    void game;
  }

  update(game: Game, dt: number, alpha: number) {
    this.lightT += dt;
    const doLight = this.lightT > 0.25;
    if (doLight) this.lightT = 0;
    for (const rd of [...this.active]) {
      const e = rd.entity;
      // player respawned: give the model back to the animation
      if (e === game.player && !e.dead) { this.end(rd); continue; }
      if (rd.bones.some((b) => b.body.removed)) { this.end(rd); continue; }
      rd.age += dt;
      if (rd.age > rd.life) {
        if (rd.sink === 0) for (const b of rd.bones) b.body.rb.setBodyType(game.physics.R.RigidBodyType.Fixed, false);
        rd.sink += dt * 0.5;
        if (rd.sink > 1.1) { this.end(rd); continue; }
      }
      rd.drive(alpha);
      if (doLight) {
        const p = rd.root.body.pos;
        const L = game.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z));
        const v = [((L >>> 12) & 15) / 15, ((L >>> 8) & 15) / 15, ((L >>> 4) & 15) / 15, (L & 15) / 15];
        rd.model.traverse((o: any) => o.material?.uniforms?.u_light?.value?.set?.(v[0], v[1], v[2], v[3]));
      }
    }
  }

  onWorldChange() {
    for (const rd of [...this.active]) {
      rd.removed = true; // bodies were dropped with the old world
      this.active.delete(rd);
      if (rd.model.parent === this.scene) rd.model.removeFromParent();
    }
  }
}
