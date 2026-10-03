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
 * bodies every frame. After ~20 s the corpse fades (dithered) while it sinks into the ground and
 * the entity is removed. Settled corpses are put to sleep (no endless twitching). Dismembered
 * bones (and their subtrees) are left out (`RagdollOptions.exclude`) - see game/gore.
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
  /** `mass` was explicitly authored (otherwise it is re-derived from volume x tissue density). */
  massFixed?: boolean;
  center?: THREE.Vector3;
}

export type Part = 'head' | 'upperArm' | 'lowerArm' | 'upperLeg' | 'lowerLeg' | 'tail' | 'torso' | 'other';
export function classifyBone(name: string): Part {
  const n = name.toLowerCase();
  if (/head|neck|skull|jaw/.test(n)) return 'head';
  if (/forearm|lower_?arm|elbow|hand|^fore/.test(n)) return 'lowerArm';
  if (/arm|shoulder|wing/.test(n)) return 'upperArm';
  if (/shin|calf|lower_?leg|knee|foot/.test(n)) return 'lowerLeg';
  if (/leg|thigh|hip/.test(n)) return 'upperLeg';
  if (/tail/.test(n)) return 'tail';
  if (/body|torso|chest|pelvis|spine|hips/.test(n)) return 'torso';
  return 'other';
}
/** Relative tissue density per part: bone box volume x this = share of the body mass (torso heaviest). */
const PART_DENSITY: Record<Part, number> = { head: 0.35, upperArm: 0.9, lowerArm: 0.8, upperLeg: 1.1, lowerLeg: 0.9, tail: 0.6, torso: 1.9, other: 0.9 };

/** Mass (kg) of each bone: explicit masses win, otherwise volume x part density, normalised to `total`. */
export function boneMasses(defs: RagdollBone[], total: number): Map<string, number> {
  const w = defs.map((d) => d.size[0] * d.size[1] * d.size[2] * PART_DENSITY[classifyBone(d.name)]);
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const out = new Map<string, number>();
  defs.forEach((d, i) => out.set(d.name, d.massFixed && d.mass !== undefined ? d.mass : Math.max(0.4, (w[i] / sum) * total)));
  return out;
}

/** The bone `name` plus every bone below it. */
export function subtreeNames(defs: { name: string; parent: string | null }[], name: string): Set<string> {
  const out = new Set<string>([name]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of defs) if (d.parent && out.has(d.parent) && !out.has(d.name)) { out.add(d.name); grew = true; }
  }
  return out;
}

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
  /** Seconds the corpse lies there before it fades and sinks. */
  life = 20;
  sink = 0;
  removed = false;
  /** Time every body has been (nearly) at rest. */
  restT = 0;
  asleep = false;
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
  /** Bones (names) to leave out, e.g. dismembered subtrees. */
  exclude?: Set<string>;
  /** Initial velocity of every part (entity velocity, b/s). */
  velocity?: THREE.Vector3;
  /** Total mass when bones have no `mass` (kg). */
  mass?: number;
}

/** Build a ragdoll for a model with `userData.bones`. Returns null when the model has no bones. */
export function buildRagdoll(pw: PhysicsWorld, model: THREE.Object3D, entity: any = null, opts: RagdollOptions = {}): Ragdoll | null {
  const allDefs = model.userData?.bones as RagdollBone[] | undefined;
  if (!allDefs?.length) return null;
  const totalMass = opts.mass ?? entity?.mass ?? 60;
  const masses = boneMasses(allDefs, totalMass);
  const defs = opts.exclude?.size ? allDefs.filter((d) => !opts.exclude!.has(d.name)) : allDefs;
  if (!defs.length) return null;
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
    const mass = masses.get(d.name) ?? 1;
    // Friction/restitution combine with the terrain surface (min / max rules): flesh itself is
    // grippy and dead, so ice stays slippery and slime still bounces.
    const body = pw.addBody({
      kind: 'ragdoll', owner: rd, position: c, rotation: q, linvel: opts.velocity,
      shape: { type: 'box', half }, mass, friction: 0.9, restitution: 0.02,
      // corpses collide with the world but not with themselves / each other: no initial
      // interpenetration between neighbouring limbs and no pile-up explosions
      group: GROUP.RAGDOLL, filter: 0xffff & ~GROUP.RAGDOLL,
      linearDamping: part === 'torso' ? 0.18 : 0.3, angularDamping: part === 'torso' ? 1.2 : 1.8, solverIterations: 4,
      impacts: part === 'torso' || part === 'head',
    });
    body.userData.sound = 'wool';
    // speed limits keep depenetration / explosions from flinging parts
    body.onStep = (b) => {
      if (b.rb.isSleeping()) return;
      const v = b.rb.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 24) b.rb.setLinvel({ x: v.x * 24 / sp, y: v.y * 24 / sp, z: v.z * 24 / sp }, true);
      const a = b.rb.angvel();
      const as = Math.hypot(a.x, a.y, a.z);
      if (as > 18) b.rb.setAngvel({ x: a.x * 18 / as, y: a.y * 18 / as, z: a.z * 18 / as }, true);
    };
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
      raw.jointConfigureMotorVelocity(j.handle, R.JointAxis.AngX, 0, 0.8);
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
      for (const ax of [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ]) raw.jointConfigureMotorVelocity(j.handle, ax, 0, part === 'head' ? 0.6 : 0.45);
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

/** Dithered fade of a model whose materials carry `u_fade` (entity materials). */
export function setModelFade(model: THREE.Object3D, f: number) {
  const rig = model.userData?.rig as { setFade?(f: number): void } | undefined;
  if (rig?.setFade) rig.setFade(f);
  else model.traverse((o: any) => { const u = o.material?.uniforms?.u_fade; if (u) u.value = f; });
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
    // the gore system may decide that parts come off with the killing blow
    const gore = g.gore as { planDismember?(e: any, s: DamageSource | null): string[]; detach?(e: any, names: string[], s: DamageSource | null, rd: Ragdoll): void } | null;
    let plan: string[] = [];
    try {
      plan = gore?.planDismember?.(entity, source) ?? [];
    } catch (e) {
      console.warn('dismember plan failed', e);
    }
    const defs = entity.model.userData.bones as RagdollBone[];
    const exclude = new Set<string>();
    for (const n of plan) for (const m of subtreeNames(defs, n)) exclude.add(m);
    const rd = buildRagdoll(pw, entity.model, entity, { velocity: entity.vel?.clone(), mass: entity.mass, exclude });
    if (!rd) return null;
    applyKillImpulse(rd, source);
    if (plan.length) {
      try {
        gore?.detach?.(entity, plan, source, rd);
      } catch (e) {
        console.warn('dismember failed', e);
      }
    }
    // keep the cost bounded: the oldest corpses go first
    if (this.active.size >= this.maxActive) {
      const oldest = [...this.active].sort((a, b) => b.age - a.age)[0];
      if (oldest) this.end(oldest);
    }
    entity.data.ragdoll = true;
    entity.data.keepBodyTicks = Math.ceil((rd.life + 3.4) * 20);
    this.active.add(rd);
    g.events.emit('ragdollStart', { entity, ragdoll: rd });
    return rd;
  }

  private end(rd: Ragdoll) {
    rd.dispose();
    this.active.delete(rd);
    if (rd.model.parent === this.scene) rd.model.removeFromParent();
    setModelFade(rd.model, 1);
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
        // sink into the ground while dissolving
        rd.sink += dt * 0.4;
        setModelFade(rd.model, Math.max(0, 1 - rd.sink / 0.95));
        if (rd.sink > 1) { this.end(rd); continue; }
      } else this.settle(rd, dt);
      rd.drive(alpha);
      if (doLight) {
        const p = rd.root.body.pos;
        const L = game.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z));
        const v = [((L >>> 12) & 15) / 15, ((L >>> 8) & 15) / 15, ((L >>> 4) & 15) / 15, (L & 15) / 15];
        rd.model.traverse((o: any) => o.material?.uniforms?.u_light?.value?.set?.(v[0], v[1], v[2], v[3]));
      }
    }
  }

  /** Put corpses that came to rest to sleep (joint motors would keep them twitching forever). */
  private settle(rd: Ragdoll, dt: number) {
    if (rd.asleep) {
      if (!rd.root.body.rb.isSleeping()) { rd.asleep = false; rd.restT = 0; }
      return;
    }
    let calm = true;
    for (const b of rd.bones) {
      if (b.body.rb.isSleeping()) continue;
      const v = b.body.rb.linvel(), a = b.body.rb.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > 0.12 * 0.12 || a.x * a.x + a.y * a.y + a.z * a.z > 0.3 * 0.3) { calm = false; break; }
    }
    rd.restT = calm ? rd.restT + dt : 0;
    if (rd.restT > 1.0 && rd.age > 1.5) {
      for (const b of rd.bones) b.body.rb.sleep();
      rd.asleep = true;
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
