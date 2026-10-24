import * as THREE from 'three';
import { RAPIER, GROUPS, QG, type RBody, type RCollider, type ContactImpact } from '../physics/Physics';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import { type Appearance } from './Appearance';
import { CharacterModel, type PartHit } from './CharacterModel';
import { Animator } from './Animator';
import { Ragdoll } from './Ragdoll';
import { P, PART_COUNT, PARENT, IS_LIMB, PART_KIND, F, boxFaceCoords } from './Rig';
import { Pose } from './Pose';
import type { RemovedVoxel } from './VoxelPart';
import type { Expression } from './CharacterTexture';
import type { StanceName } from './PoseLibrary';
import { type Combatant, type HitInfo, type HitResult, emptyResult, newId } from '../game/Combat';
import { clamp, dampAngle, angleDiff, rand, chance, wrapAngle } from '../core/math';

export type CharState = 'active' | 'ragdoll' | 'gettingUp' | 'dead';

export interface CharacterStats {
  maxHealth: number;
  poise: number; // knockdown threshold (N*s)
  mass: number;
  speed: number; // run speed
  walkSpeed: number;
  armor: number; // damage reduction 0..0.5
  attackSpeed: number;
  damageMul: number;
  reach: number;
}

/** Item that a character can hold (implemented by the weapon/prop system). */
export interface HeldItem {
  readonly weaponId: string;
  readonly twoHanded: boolean;
  readonly object3d: THREE.Object3D;
  onHolderHit?(): void;
}

const PART_MUL = [0.9, 1.0, 1.7, 0.6, 0.5, 0.6, 0.5, 0.7, 0.55, 0.7, 0.55];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _removed: RemovedVoxel[] = [];
const UP = new THREE.Vector3(0, 1, 0);

export class Character implements Combatant {
  readonly id = newId();
  readonly isPlayer = false;
  readonly model: CharacterModel;
  readonly animator = new Animator();
  body: RBody;
  collider: RCollider;
  radius: number;
  halfHeight: number;
  state: CharState = 'active';
  ragdoll: Ragdoll | null = null;
  stats: CharacterStats;
  health: number;
  readonly partDamage = new Float32Array(PART_COUNT);
  alive = true;
  readonly position = new THREE.Vector3();
  yaw = 0;
  desiredYaw = 0;
  turnSpeed = 9;
  readonly desiredVel = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private knock = new THREE.Vector3();
  grounded = true;
  stunTimer = 0;
  staggerMeter = 0;
  bleedRate = 0;
  bleedTimer = 0;
  blocking = false;
  blockStart = 0;
  attackLock = 0; // can't start new attack until 0
  recovering = 0;
  combatMode = false;
  weapon: HeldItem | null = null;
  ambientStance: StanceName = 'relaxed';
  expressionTimer = 0;
  baseExpression: Expression = 'neutral';
  fallTimer = 0;
  lastAttacker: Combatant | null = null;
  lastHitTime = -100;
  deathTime = -1;
  killedBy: Combatant | null = null;
  /** time spent in current ragdoll */
  ragdollTime = 0;
  canGetUp = true;
  invulnTimer = 0;
  /** brain hook (NPCs) */
  brain: { onHit?(hit: HitInfo, res: HitResult): void; onKnockdown?(): void; onGetUp?(): void; onDeath?(): void } | null = null;
  /** interpolation */
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private renderPos = new THREE.Vector3();
  private lastYaw = 0;
  frame = 0;
  name: string;
  isBoss = false;
  removed = false;
  seatedOn: unknown = null;
  grabbedBy: Combatant | null = null;

  constructor(
    public app: Appearance,
    spawn: THREE.Vector3,
    yaw: number,
    stats: Partial<CharacterStats> = {},
  ) {
    this.name = app.name;
    this.model = new CharacterModel(app);
    const b = app.build;
    this.stats = {
      maxHealth: 100,
      poise: 300,
      mass: 75 * b.bulk * b.height,
      speed: 5.2,
      walkSpeed: 1.4,
      armor: 0,
      attackSpeed: 1,
      damageMul: 1,
      reach: 1.0,
      ...stats,
    };
    this.health = this.stats.maxHealth;
    this.radius = clamp(0.27 * Math.max(b.bulk, 0.95), 0.25, 0.4);
    const totalH = this.model.rig.height * 0.96;
    this.halfHeight = Math.max(0.3, totalH / 2 - this.radius);
    const { world } = ctx.physics;
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y + this.halfHeight + this.radius + 0.02, spawn.z)
      .lockRotations()
      .setLinearDamping(0)
      .setCanSleep(true);
    this.body = world.createRigidBody(bd);
    const vol = Math.PI * this.radius * this.radius * (2 * this.halfHeight + (4 / 3) * this.radius);
    const cd = RAPIER.ColliderDesc.capsule(this.halfHeight, this.radius)
      .setCollisionGroups(GROUPS.CHAR)
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setDensity(this.stats.mass / vol);
    this.collider = world.createCollider(cd, this.body);
    ctx.physics.register(this.collider, { kind: 'character', material: 'flesh', entity: this });
    this.yaw = this.desiredYaw = yaw;
    this.lastYaw = yaw;
    this.readBody();
    this.prevPos.copy(this.currPos);
    this.renderPos.copy(this.currPos);
    this.updateRoot();
    this.animator.onFootstep = (_foot, intensity) => {
      if (this.state !== 'active') return;
      events.emit('footstep', { pos: this.position, material: 'wood', intensity, isPlayer: false });
    };
    this.model.root.userData.character = this;
  }

  get upright(): boolean {
    return this.state === 'active' || this.state === 'gettingUp';
  }

  get canAct(): boolean {
    return this.state === 'active' && this.alive && this.stunTimer <= 0 && this.attackLock <= 0;
  }

  get healthFrac(): number {
    return this.health / this.stats.maxHealth;
  }

  invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  // ---------------------------------------------------------------- positions
  private readBody(): void {
    const t = this.body.translation();
    this.currPos.set(t.x, t.y - this.halfHeight - this.radius, t.z);
  }

  headPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.state === 'ragdoll' || this.state === 'dead') {
      return this.model.partCenter(P.HEAD, out);
    }
    return out.set(this.position.x, this.position.y + this.model.rig.eyeHeight, this.position.z);
  }

  chestPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.state === 'ragdoll' || this.state === 'dead') return this.model.partCenter(P.TORSO, out);
    return out.set(this.position.x, this.position.y + this.model.rig.bindWorld[P.TORSO].y + 0.22, this.position.z);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** world point -> yaw toward it */
  yawTo(p: THREE.Vector3): number {
    return Math.atan2(p.x - this.position.x, p.z - this.position.z);
  }

  faceTowards(p: THREE.Vector3): void {
    this.desiredYaw = this.yawTo(p);
  }

  lookAt(p: THREE.Vector3 | null, weight = 1): void {
    const a = this.animator;
    if (!p) {
      a.lookWeight = 0;
      return;
    }
    const dy = this.yawTo(p) - this.yaw;
    const head = this.headPosition(_v3);
    const dist = Math.hypot(p.x - head.x, p.z - head.z);
    a.lookYaw = wrapAngle(dy);
    a.lookPitch = Math.atan2(p.y - head.y, Math.max(dist, 0.1));
    a.lookWeight = Math.abs(a.lookYaw) < 1.8 ? weight : 0;
  }

  teleport(p: THREE.Vector3, yaw?: number): void {
    this.body.setTranslation({ x: p.x, y: p.y + this.halfHeight + this.radius + 0.02, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.readBody();
    this.prevPos.copy(this.currPos);
    this.renderPos.copy(this.currPos);
    if (yaw !== undefined) this.yaw = this.desiredYaw = this.lastYaw = yaw;
    this.updateRoot();
  }

  // ---------------------------------------------------------------- simulation
  fixedUpdate(dt: number): void {
    if (this.removed) return;
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    this.attackLock = Math.max(0, this.attackLock - dt);
    this.staggerMeter = Math.max(0, this.staggerMeter - dt * this.stats.poise * 0.35);
    // bleeding
    if (this.bleedRate > 0 && this.alive) {
      this.bleedTimer -= dt;
      this.health -= this.bleedRate * dt;
      this.bleedRate = Math.max(0, this.bleedRate - dt * 0.6);
      if (this.bleedTimer <= 0) {
        this.bleedTimer = 0.12 + Math.random() * 0.2;
        this.chestPosition(_v);
        events.emit('bleed', { pos: _v.clone(), amount: Math.min(1, this.bleedRate / 8) });
      }
      if (this.health <= 0) this.die(null, 'bleed');
    }

    if (this.state === 'ragdoll' || this.state === 'dead') {
      const r = this.ragdoll;
      if (r) {
        r.update(dt);
        this.ragdollTime += dt;
        if (this.state === 'ragdoll' && this.alive && this.canGetUp) {
          if ((this.ragdollTime > 1.4 && r.restTime > 0.35) || this.ragdollTime > 6) this.beginGetUp();
        }
        if (this.state === 'dead' && r.restTime > 4 && !r.frozen) {
          // let corpses sleep; Rapier handles it, freezing only when count is high (CharacterManager)
        }
      }
      return;
    }

    this.groundCheck();
    const lv = this.body.linvel();
    this.velocity.set(lv.x, lv.y, lv.z);
    if (this.grabbedBy) {
      // the grabber drives our capsule
      this.yaw = dampAngle(this.yaw, this.desiredYaw, 12, dt);
      return;
    }
    // knockback decays with friction
    const kd = this.grounded ? 6.5 : 1.0;
    this.knock.multiplyScalar(Math.max(0, 1 - kd * dt));
    let tx = 0,
      tz = 0;
    if (this.state === 'active' && this.stunTimer <= 0) {
      tx = this.desiredVel.x;
      tz = this.desiredVel.z;
    }
    const accel = this.grounded ? 22 : 3;
    const hvx = this.velocity.x - this.knock.x;
    const hvz = this.velocity.z - this.knock.z;
    let nvx = hvx,
      nvz = hvz;
    const dx = tx - hvx,
      dz = tz - hvz;
    const dl = Math.sqrt(dx * dx + dz * dz);
    if (dl > 1e-4) {
      const k = Math.min(1, (accel * dt) / dl);
      nvx += dx * k;
      nvz += dz * k;
    }
    let vy = this.velocity.y;
    if (this.grounded && vy < 0.5) vy = Math.min(vy, -0.3);
    this.body.setLinvel({ x: nvx + this.knock.x, y: vy, z: nvz + this.knock.z }, true);

    // falling off ledges
    if (!this.grounded) {
      this.fallTimer += dt;
      if (this.velocity.y < -7.5 && this.fallTimer > 0.35) this.knockDown(null, new THREE.Vector3(this.velocity.x, this.velocity.y, this.velocity.z), P.TORSO);
    } else {
      if (this.fallTimer > 0.5 && this.velocity.y < -6) {
        // landed hard on feet
        this.applyDamage(Math.max(0, (-this.velocity.y - 6) * 8), null, 'fall');
      }
      this.fallTimer = 0;
    }

    // turning
    const turnRate = this.state === 'active' ? this.turnSpeed : 0;
    this.yaw = dampAngle(this.yaw, this.desiredYaw, turnRate, dt);
  }

  private groundCheck(): void {
    const t = this.body.translation();
    _v.set(t.x, t.y, t.z);
    _v2.set(0, -1, 0);
    const hit = ctx.physics.raycast(_v, _v2, this.halfHeight + this.radius + 0.18, QG.MOVE, this.body);
    this.grounded = !!hit;
  }

  /** after physics step */
  capture(): void {
    if (this.state === 'ragdoll' || this.state === 'dead') {
      this.ragdoll?.capture();
      return;
    }
    this.prevPos.copy(this.currPos);
    this.readBody();
  }

  private updateRoot(): void {
    this.model.root.position.copy(this.renderPos);
    this.model.root.rotation.set(0, this.yaw, 0);
  }

  /** per render frame */
  update(dt: number, alpha: number, frame: number): void {
    if (this.removed) return;
    this.frame = frame;
    const a = this.animator;
    if (this.state === 'ragdoll' || this.state === 'dead') {
      this.ragdoll?.syncModel(alpha);
      this.position.copy(this.model.root.position);
    } else {
      this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
      this.position.copy(this.renderPos);
      // local velocity for locomotion
      const sy = Math.sin(this.yaw),
        cy = Math.cos(this.yaw);
      const vx = this.velocity.x,
        vz = this.velocity.z;
      // local: z forward = (sin, cos), x left = (cos, -sin)
      a.localVel.set(vx * cy - vz * sy, 0, vx * sy + vz * cy);
      a.yawRate = angleDiff(this.lastYaw, this.yaw) / Math.max(dt, 1e-4);
      this.lastYaw = this.yaw;
      a.combat = this.combatMode;
      this.updateStance();
      a.update(dt);
      this.model.applyPose(a.pose);
      this.updateRoot();
      this.model.updateMatrices(frame);
      this.model.trackCenters();
    }
    // expression recovery
    if (this.expressionTimer > 0) {
      this.expressionTimer -= dt;
      if (this.expressionTimer <= 0 && this.alive) this.model.setExpression(this.baseExpression);
    }
    this.model.flushParts();
    this.model.atlas.flush();
  }

  private updateStance(): void {
    const a = this.animator;
    let s: StanceName = this.ambientStance;
    if (this.combatMode) {
      if (this.weapon) s = this.weapon.twoHanded ? 'carry2h' : 'carry1h';
      else s = 'guard';
    }
    if (this.blocking) s = 'block';
    a.setStance(s);
  }

  setExpression(e: Expression, duration = 0): void {
    if (!this.alive && e !== 'dead') return;
    this.model.setExpression(e);
    if (duration > 0) this.expressionTimer = duration;
    else {
      this.baseExpression = e;
      this.expressionTimer = 0;
    }
  }

  // ---------------------------------------------------------------- combat: receiving
  raycastHitbox(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, inflate: number): PartHit | null {
    if (this.removed) return null;
    this.model.updateMatrices(this.state === 'active' || this.state === 'gettingUp' ? this.frame : undefined);
    return this.model.raycast(origin, dir, maxDist, inflate);
  }

  receiveHit(hit: HitInfo): HitResult {
    const res = emptyResult(hit.part);
    if (this.removed) return res;
    if (this.invulnTimer > 0 && hit.source === 'melee') return res;
    const part = hit.part >= 0 ? hit.part : P.TORSO;
    res.part = part;
    if (this.model.severed[part] || this.model.destroyed[part]) return res;

    // ---- blocking
    if (this.blocking && this.alive && this.state === 'active' && !hit.unblockable && hit.attacker) {
      const toAtt = hit.attacker.position;
      const facing = Math.abs(angleDiff(this.yaw, this.yawTo(toAtt)));
      if (facing < 1.25) {
        const now = ctx.time.elapsed;
        const parry = now - this.blockStart < 0.2 && !hit.heavy;
        res.blocked = true;
        res.parried = parry;
        const chip = hit.heavy ? 0.35 : hit.kick ? 0.25 : 0.12;
        const dmg = parry ? 0 : hit.damage * chip;
        this.health -= dmg;
        res.damage = dmg;
        _v.copy(hit.dir).setY(0).normalize().multiplyScalar((hit.force / this.stats.mass) * (hit.heavy ? 0.8 : 0.4));
        this.knock.add(_v);
        this.animator.impulse(P.TORSO, -2, 0, 0);
        if (hit.heavy || hit.kick) {
          // guard broken
          this.blocking = false;
          this.stunTimer = 0.6;
          this.animator.play('stagger');
        }
        events.emit('block', { target: this, attacker: hit.attacker, pos: hit.point, parry });
        events.emit('hit', { target: this, hit, result: res });
        this.brain?.onHit?.(hit, res);
        if (this.health <= 0) this.die(hit, 'blocked');
        return res;
      }
    }

    // ---- damage
    const crit = hit.crit ? 1.5 : 1;
    let dmg = hit.damage * PART_MUL[part] * crit * (1 - this.stats.armor);
    if (this.state === 'ragdoll' && this.alive) dmg *= 1.25; // ground and pound
    const wasAlive = this.alive;
    if (this.alive) {
      this.health -= dmg;
      this.lastAttacker = hit.attacker;
      this.lastHitTime = ctx.time.elapsed;
    }
    this.partDamage[part] += dmg;
    res.damage = dmg;

    // ---- visual damage: blood paint + carving
    this.applyVisualDamage(hit, part, dmg, res);

    // bleeding
    if (hit.bleed) this.bleedRate = Math.min(12, this.bleedRate + hit.bleed);
    else if (hit.type === 'sharp') this.bleedRate = Math.min(12, this.bleedRate + dmg * 0.08);

    // ---- reactions
    const localDir = this.toLocalDir(hit.dir, _v2);
    if (this.state === 'active' || this.state === 'gettingUp') {
      const k = clamp(dmg / 12, 0.4, 3.5);
      if (part === P.HEAD) {
        this.animator.impulse(P.HEAD, localDir.z * 9 * k, (localDir.x * 2 - (hit.local?.x ?? 0) * 6) * k, -localDir.x * 7 * k);
        this.animator.impulse(P.TORSO, localDir.z * 3 * k, 0, -localDir.x * 2.5 * k);
      } else {
        this.animator.impulse(P.TORSO, localDir.z * 6 * k, -localDir.x * 2 * k, -localDir.x * 5 * k);
        this.animator.impulse(P.HEAD, localDir.z * 4 * k, 0, -localDir.x * 3 * k);
      }
      if (IS_LIMB[part]) this.animator.impulse(part, localDir.z * 8 * k, 0, -localDir.x * 8 * k);
      if (this.alive) this.setExpression('pain', 0.5 + Math.random() * 0.4);
    }

    // knockback
    const mass = this.stats.mass;
    const resist = this.state === 'gettingUp' ? 0.6 : 1;
    const kv = (hit.force / mass) * resist;
    this.staggerMeter += hit.force;
    const lift = hit.lift ?? 0;
    if (this.state === 'active' || this.state === 'gettingUp') {
      const poise = this.stats.poise * (this.blocking ? 1.5 : 1);
      const dying = this.health <= 0;
      const knock = hit.knockdown || dying || hit.force > poise || this.staggerMeter > poise * 1.6;
      if (knock) {
        _v.copy(hit.dir).multiplyScalar(kv).add(this.velocity);
        _v.y += lift * kv + (hit.kick ? 1.2 : 0.5);
        this.knockDown(hit, _v, part);
        res.knockedDown = true;
      } else {
        _v.copy(hit.dir).setY(0).normalize().multiplyScalar(kv * 0.9);
        this.knock.add(_v);
        const stun = (hit.stun ?? 0) + clamp(hit.force / poise, 0.1, 0.9) * 0.55;
        this.stunTimer = Math.max(this.stunTimer, stun);
        this.attackLock = Math.max(this.attackLock, stun * 0.8);
        // interrupt attacks
        if (this.animator.action && this.animator.actionId !== 'stagger') {
          if (hit.force > poise * 0.45) this.animator.play(part === P.TORSO && localDir.z < -0.3 && hit.force > poise * 0.6 ? 'doubleOver' : 'stagger');
          else this.animator.play('flinch');
        } else if (hit.force > poise * 0.45) {
          this.animator.play(part === P.TORSO && localDir.z < -0.3 && hit.force > poise * 0.6 ? 'doubleOver' : 'stagger');
        }
      }
    } else if (this.ragdoll) {
      // hitting a body on the ground
      _v.copy(hit.dir).multiplyScalar(hit.force * 0.55);
      _v.y += lift * hit.force * 0.5;
      this.ragdoll.applyImpulse(part, _v, hit.point);
      _v.copy(hit.dir).multiplyScalar(hit.force * 0.25);
      this.ragdoll.applyImpulseAll(_v, part, 0.3);
      if (this.alive) this.ragdollTime = Math.min(this.ragdollTime, 0.6);
    }

    // death
    if (wasAlive && this.alive && this.health <= 0) {
      this.die(hit, res.headDestroyed ? 'headExplode' : res.decapitated ? 'decapitated' : 'beaten');
    }
    res.killed = wasAlive && !this.alive;
    if (wasAlive) this.brain?.onHit?.(hit, res);
    events.emit('hit', { target: this, hit, result: res });
    events.emit('noise', { pos: hit.point, radius: 12, kind: 'hit', source: hit.attacker, target: this });
    return res;
  }

  private toLocalDir(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    return out.set(dir.x * cy - dir.z * sy, dir.y, dir.x * sy + dir.z * cy);
  }

  private applyVisualDamage(hit: HitInfo, part: number, dmg: number, res: HitResult): void {
    const model = this.model;
    model.updateMatrices(this.state === 'active' || this.state === 'gettingUp' ? this.frame : undefined);
    // local hit point
    let local = hit.local;
    if (!local) {
      local = _v3.copy(hit.point).applyMatrix4(model.boxInv[part]);
      const h = model.half[part];
      local.x = clamp(local.x, -h.x, h.x);
      local.y = clamp(local.y, -h.y, h.y);
      local.z = clamp(local.z, -h.z, h.z);
    }
    const h = model.half[part];
    const st = { s: 0, t: 0 };
    // pick the face the hit came from
    const dirLocal = _v.copy(hit.dir).transformDirection(model.boxInv[part]);
    let face = hit.face ?? -1;
    if (face < 0) {
      // choose by direction opposite the hit direction
      const ax = Math.abs(dirLocal.x),
        ay = Math.abs(dirLocal.y),
        az = Math.abs(dirLocal.z);
      if (ax >= ay && ax >= az) face = dirLocal.x > 0 ? F.NX : F.PX;
      else if (ay >= az) face = dirLocal.y > 0 ? F.NY : F.PY;
      else face = dirLocal.z > 0 ? F.NZ : F.PZ;
    }
    boxFaceCoords(local.x, local.y, local.z, h.x, h.y, h.z, st, face);
    const s = st.s;
    const t = st.t;
    const blunt = hit.type === 'blunt' || hit.type === 'fall' || hit.type === 'crush' || hit.type === 'force';
    const bruise = blunt && this.partDamage[part] < 18 && dmg < 14;
    const atlas = model.atlas;
    atlas.paintBlood(part, face, s, t, clamp(0.08 + dmg * 0.006, 0.08, 0.35), clamp(dmg / 25, 0.2, 1.2), bruise);
    if (!bruise && part === P.HEAD && Math.random() < 0.7) {
      // drip onto the shirt
      atlas.paintBlood(P.TORSO, F.PZ, 0.5 + (Math.random() - 0.5) * 0.4, Math.random() * 0.25, 0.12, 0.5);
    }

    // carving
    const carveMul = hit.carve ?? 1;
    if (carveMul <= 0) return;
    const threshold = part === P.HEAD ? 14 : 30;
    if (this.partDamage[part] < threshold && dmg < 30) return;
    _removed.length = 0;
    let radius = 0;
    let maxRemove = 0;
    const kind = PART_KIND[part];
    if (hit.type === 'sharp') {
      radius = 0.04 + dmg * 0.001;
      maxRemove = Math.round(6 + dmg * 0.45);
    } else if (hit.type === 'pierce') {
      radius = 0.03 + dmg * 0.0008;
      maxRemove = Math.round(4 + dmg * 0.35);
    } else {
      radius = 0.038 + dmg * 0.0017;
      maxRemove = Math.round(4 + dmg * 0.5);
    }
    if (kind !== 'head') {
      radius *= 0.85;
      maxRemove = Math.round(maxRemove * 0.7);
    }
    radius *= carveMul;
    maxRemove = Math.round(maxRemove * carveMul);
    const dirBias = hit.type === 'pierce' ? dirLocal.clone().normalize() : dirLocal.clone().normalize().multiplyScalar(0.6);
    const vs = model.ensureVoxels(part).vs.x;
    local = local!.clone();
    local.x += (Math.random() - 0.5) * vs * 2.2;
    local.y += (Math.random() - 0.5) * vs * 2.2;
    local.z += (Math.random() - 0.5) * vs * 2.2;
    if (hit.type === 'sharp') {
      // slash: carve along a short line perpendicular to the blade travel
      const perp = new THREE.Vector3().crossVectors(dirLocal, UP).normalize();
      if (perp.lengthSq() < 0.1) perp.set(1, 0, 0);
      for (let k = -1; k <= 1; k++) {
        const p = local!.clone().addScaledVector(perp, k * radius * 1.1);
        model.carve(part, p, radius * 0.75, dirBias, Math.ceil(maxRemove / 3), _removed);
      }
    } else {
      model.carve(part, local!, radius, dirBias, maxRemove, _removed);
    }
    if (_removed.length > 0) {
      events.emit('carve', { target: this, part, removed: _removed.slice(), hit, color: this.partColor(part) });
    }
    // fatal head damage
    const vox = model.voxels[part];
    if (part === P.HEAD && vox && !model.destroyed[P.HEAD]) {
      const lethal = this.health <= 0 || !this.alive;
      const bigBlow = hit.heavy || dmg > 24 || hit.source === 'rage' || hit.source === 'stomp';
      if (vox.integrity < 0.82 || (lethal && bigBlow && hit.type !== 'sharp')) {
        this.explodeHead(hit);
        res.headDestroyed = true;
      }
    }
    // dismemberment
    const dm = hit.dismember ?? 0;
    if (dm > 0 && !model.severed[part] && !model.detached[part]) {
      const limbThresh = kind === 'head' ? 45 : kind === 'uarm' || kind === 'thigh' ? 40 : 28;
      const integrity = vox ? vox.integrity : 1;
      if (this.partDamage[part] * dm > limbThresh || integrity < 0.62) {
        if (part === P.HEAD) {
          if (this.health <= 0 || !this.alive) {
            this.sever(P.HEAD, hit);
            res.decapitated = true;
          }
        } else if (IS_LIMB[part]) {
          this.sever(part, hit);
          res.severed = part;
        }
      }
    }
  }

  partColor(part: number): string {
    const a = this.app;
    switch (PART_KIND[part]) {
      case 'head':
        return a.skin;
      case 'torso':
        return a.topColor;
      case 'pelvis':
      case 'thigh':
      case 'shin':
        return a.bottomColor;
      default:
        return a.skin;
    }
  }

  explodeHead(hit: HitInfo | null): void {
    const model = this.model;
    if (model.destroyed[P.HEAD]) return;
    _removed.length = 0;
    model.obliterate(P.HEAD, _removed);
    const head = model.partCenter(P.HEAD, new THREE.Vector3());
    const dir = hit ? hit.dir.clone() : new THREE.Vector3(0, 1, 0);
    events.emit('headExplode', { target: this, point: head, dir });
    if (_removed.length && hit) events.emit('carve', { target: this, part: P.HEAD, removed: _removed.slice(), hit, color: this.app.skin });
    if (this.ragdoll) this.ragdoll.removePart(P.HEAD);
    model.atlas.soakPart(P.TORSO, 0.8);
    this.bleedRate = 0;
    if (this.alive) this.die(hit, 'headExplode');
  }

  /** Sever a part (limb/head) into a gib. */
  sever(part: number, hit: HitInfo | null): void {
    const model = this.model;
    if (model.severed[part] || model.detached[part]) return;
    const pos = model.partCenter(part, new THREE.Vector3());
    const dir = hit ? hit.dir.clone() : new THREE.Vector3(0, 1, 0);
    if (this.ragdoll) {
      // break the joint; the part keeps simulating and rendering through its bone
      this.ragdoll.detach(part);
      model.detached[part] = true;
      this.canGetUp = false;
    } else {
      // spawn a gib for this part and its children
      const parts = [part];
      for (let c = 0; c < PART_COUNT; c++) if (PARENT[c] === part) parts.push(c);
      for (const p of parts) {
        model.updateMatrices();
        const mesh = model.detachPartMesh(p);
        const vel = this.velocity.clone().addScaledVector(dir, 3 + Math.random() * 2);
        vel.y += 2.5;
        ctx.gibs?.spawn(mesh, model.half[p], vel, this);
      }
      if (part === P.UARM_R || part === P.LARM_R) this.dropWeapon();
    }
    events.emit('sever', { target: this, part, point: pos, dir });
    this.bleedRate = Math.min(14, this.bleedRate + 8);
    if (part === P.HEAD) {
      this.die(hit, 'decapitated');
    } else if (PART_KIND[part] === 'thigh' || PART_KIND[part] === 'shin') {
      if (this.state === 'active') this.knockDown(hit, this.velocity.clone(), P.PELVIS);
      this.canGetUp = false;
      this.bleedRate = 14;
    }
  }

  /** Our attack was parried: big stagger window. */
  parried(_by: Combatant): void {
    if (this.state !== 'active') return;
    this.animator.play('parried');
    this.stunTimer = 1.1;
    this.attackLock = 1.25;
    this.blocking = false;
    this.setExpression('shock', 1.0);
  }

  applyDamage(amount: number, attacker: Combatant | null, cause: string): void {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) this.die(null, cause, attacker);
  }

  // ---------------------------------------------------------------- state changes
  knockDown(hit: HitInfo | null, vel: THREE.Vector3, part: number): void {
    if (this.state === 'ragdoll' || this.state === 'dead') return;
    this.dropWeapon(vel);
    this.blocking = false;
    this.animator.stopAction(false);
    // make sure matrices reflect the latest pose
    this.model.updateMatrices();
    this.body.setEnabled(false);
    this.ragdoll = new Ragdoll(this.model, vel, this, 1 / 60, this);
    if (hit) {
      _v.copy(hit.dir).multiplyScalar(hit.force * 0.35);
      _v.y += (hit.lift ?? 0) * hit.force * 0.3;
      this.ragdoll.applyImpulse(part, _v, hit.point);
    }
    this.state = this.alive ? 'ragdoll' : 'dead';
    this.ragdollTime = 0;
    if (this.alive) this.setExpression('ko', 0);
    events.emit('knockdown', { victim: this, hit });
    this.brain?.onKnockdown?.();
  }

  private beginGetUp(): void {
    const r = this.ragdoll;
    if (!r) return;
    const o = r.orientation();
    // floor height beneath pelvis
    _v.copy(o.pelvis);
    _v2.set(0, -1, 0);
    const hit = ctx.physics.raycast(_v.set(o.pelvis.x, o.pelvis.y + 0.2, o.pelvis.z), _v2, 3, QG.WORLD);
    const floorY = hit ? hit.point.y : o.pelvis.y - 0.15;
    // yaw: face-up get-up -> head is toward -Z (stand facing feet); face-down -> head toward +Z
    let yaw = Math.atan2(o.headDir.x, o.headDir.z);
    if (o.faceUp) yaw += Math.PI;
    const rootPos = new THREE.Vector3(o.pelvis.x, floorY, o.pelvis.z);
    // keep the capsule out of walls: test free space
    const pose = new Pose();
    r.toPose(rootPos, yaw, pose);
    r.dispose();
    this.ragdoll = null;
    this.body.setEnabled(true);
    this.teleport(rootPos, yaw);
    this.state = 'gettingUp';
    this.model.root.position.copy(rootPos);
    this.model.root.rotation.set(0, yaw, 0);
    this.animator.startFromPose(pose, 0.3);
    this.animator.play(o.faceUp ? 'getUpBack' : 'getUpFront', {
      speed: 1.0 + Math.random() * 0.25,
      onEnd: () => {
        if (this.state === 'gettingUp') {
          this.state = 'active';
          this.brain?.onGetUp?.();
        }
      },
    });
    this.setExpression('angry', 0);
    this.stunTimer = 0;
    this.staggerMeter = 0;
  }

  die(hit: HitInfo | null, cause: string, attacker?: Combatant | null): void {
    if (!this.alive) return;
    this.alive = false;
    this.health = Math.min(this.health, 0);
    this.deathTime = ctx.time.elapsed;
    this.killedBy = hit?.attacker ?? attacker ?? this.lastAttacker;
    if (this.state === 'active' || this.state === 'gettingUp') {
      const v = this.velocity.clone();
      if (hit) {
        v.addScaledVector(hit.dir, hit.force / this.stats.mass);
        v.y += 0.8 + (hit.lift ?? 0) * 2;
      }
      this.knockDown(hit, v, hit?.part ?? P.TORSO);
    }
    this.state = 'dead';
    this.model.setExpression('dead');
    this.blocking = false;
    this.brain?.onDeath?.();
    events.emit('death', { victim: this, hit, cause });
    const head = this.headPosition(new THREE.Vector3());
    events.emit('noise', { pos: head, radius: 16, kind: 'death', source: this.killedBy, target: this });
  }

  onRagdollImpact(part: number, ev: ContactImpact): void {
    const strength = ev.impulse;
    if (strength < 4) return;
    events.emit('ragdollImpact', { pos: ev.point.clone(), strength, part, target: this });
    // impact damage only for violent velocity changes (thrown into walls, long falls)
    const body = this.ragdoll?.bodies[part];
    const mass = body ? body.mass() : 10;
    const dv = strength / Math.max(mass, 1);
    if (dv > 7.5) {
      const dmg = (dv - 7.5) * 5.5;
      if (this.alive && this.ragdollTime > 0.05) {
        this.health -= dmg;
        if (this.health <= 0) this.die(null, 'impact', this.lastAttacker);
      }
      if (dmg > 5) {
        const local = ev.point.clone().applyMatrix4(this.model.boxInv[part]);
        const h = this.model.half[part];
        local.x = clamp(local.x, -h.x, h.x);
        local.y = clamp(local.y, -h.y, h.y);
        local.z = clamp(local.z, -h.z, h.z);
        this.partDamage[part] += dmg;
        const fakeHit: HitInfo = {
          attacker: this.lastAttacker,
          damage: dmg,
          type: 'fall',
          part,
          point: ev.point.clone(),
          dir: ev.dir.clone().normalize(),
          force: 0,
          source: 'impact',
          local,
          carve: part === P.HEAD ? 0.7 : 0.4,
        };
        this.applyVisualDamage(fakeHit, part, dmg, emptyResult(part));
      }
    }
  }

  dropWeapon(vel?: THREE.Vector3): void {
    if (!this.weapon) return;
    const w = this.weapon;
    this.weapon = null;
    ctx.weapons?.dropFromCharacter(this, w, vel);
  }

  dispose(): void {
    this.removed = true;
    this.ragdoll?.dispose();
    this.ragdoll = null;
    ctx.physics.removeBody(this.body);
    this.model.root.removeFromParent();
    this.model.dispose();
  }
}

// silence unused helpers (kept for future tuning)
void chance;
void rand;
void _q;
void _m;
