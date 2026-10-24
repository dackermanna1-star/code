import * as THREE from 'three';
import { RAPIER, GROUPS, CG, groups, type RBody, type RCollider, type ContactImpact, type PhysOwner } from '../physics/Physics';
import { PROPS, type PropDef } from './PropDefs';
import { GeoBuilder } from '../render/GeoBuilder';
import { buildPropAtlas } from '../render/PropAtlas';
import { WEAPONS, type WeaponDef } from '../weapons/WeaponDefs';
import { events } from '../game/events';
import { ctx } from '../game/ctx';
import type { Combatant, DamageType, HitInfo } from '../game/Combat';
import { P } from '../characters/Rig';
import type { Character } from '../characters/Character';
import { rand, clamp } from '../core/math';

const D2R = Math.PI / 180;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const PICK_GROUPS = groups(0xffff, CG.PROP);

let nextPropId = 1;

export type PropState = 'free' | 'held' | 'stuck' | 'gone';

export class Prop {
  readonly id = nextPropId++;
  body: RBody | null = null;
  colliders: RCollider[] = [];
  instanceId = -1;
  health: number;
  state: PropState = 'free';
  holder: Combatant | null = null;
  thrownBy: Combatant | null = null;
  thrownTime = -100;
  thrownSpin = 0;
  hitDuringThrow = new Set<Combatant>();
  durability: number;
  prevPos = new THREE.Vector3();
  currPos = new THREE.Vector3();
  prevRot = new THREE.Quaternion();
  currRot = new THREE.Quaternion();
  lastSpeed = 0;
  lastVel = new THREE.Vector3();
  lastImpactSound = -10;
  bloody = 0;
  dirty = true;
  awake = true;
  /** liquid remaining for drinks */
  full = true;
  owner: PhysOwner;
  /** interaction cooldown */
  usedAt = -10;
  reservedBy: unknown = null;
  /** static until broken (railings, shelves) */
  fixed = false;

  constructor(
    public def: PropDef,
    public variant: number,
  ) {
    this.health = def.health ?? 60;
    const w = def.weapon ? WEAPONS[def.weapon] : null;
    this.durability = w ? w.durability : Infinity;
    this.owner = { kind: 'prop', material: def.material, entity: this };
  }

  get weapon(): WeaponDef | null {
    return this.def.weapon ? WEAPONS[this.def.weapon] : null;
  }

  position(out: THREE.Vector3): THREE.Vector3 {
    if (this.body) {
      const t = this.body.translation();
      return out.set(t.x, t.y, t.z);
    }
    return out.copy(this.currPos);
  }
}

function makePropMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.62, metalness: 0.05 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 2.2;');
  };
  mat.customProgramCacheKey = () => 'propmat';
  return mat;
}

/** All dynamic props: physics, batched rendering, breakage, throwing. */
export class PropSystem {
  readonly atlas: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  readonly batch: THREE.BatchedMesh;
  private geoIds = new Map<string, number>();
  private geoCache = new Map<string, THREE.BufferGeometry>();
  readonly props: Prop[] = [];
  private byCollider = new Map<number, Prop>();
  totalBroken = 0;
  onBreak: ((p: Prop) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.atlas = buildPropAtlas();
    this.material = makePropMaterial(this.atlas);
    this.batch = new THREE.BatchedMesh(3000, 260000, 420000, this.material);
    this.batch.castShadow = true;
    this.batch.receiveShadow = true;
    this.batch.perObjectFrustumCulled = true;
    this.batch.frustumCulled = false;
    scene.add(this.batch);
    ctx.props = this as any;
  }

  geometry(defId: string, variant: number): THREE.BufferGeometry {
    const key = defId + ':' + variant;
    let g = this.geoCache.get(key);
    if (!g) {
      const b = new GeoBuilder();
      PROPS[defId].build(b, variant);
      g = b.build();
      this.geoCache.set(key, g);
    }
    return g;
  }

  private geoId(defId: string, variant: number): number {
    const key = defId + ':' + variant;
    let id = this.geoIds.get(key);
    if (id === undefined) {
      id = this.batch.addGeometry(this.geometry(defId, variant));
      this.geoIds.set(key, id);
    }
    return id;
  }

  /** Build a standalone mesh (for held items / stuck knives). */
  makeMesh(p: Prop): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(p.def.id, p.variant), this.material);
    m.castShadow = true;
    return m;
  }

  spawn(defId: string, pos: THREE.Vector3, rotY = 0, variant = -1, opts: { rot?: THREE.Quaternion; vel?: THREE.Vector3; angVel?: THREE.Vector3; sleeping?: boolean; fixed?: boolean } = {}): Prop {
    const def = PROPS[defId];
    if (!def) throw new Error('unknown prop ' + defId);
    const v = variant >= 0 ? variant % (def.variants ?? 1) : Math.floor(Math.random() * (def.variants ?? 1));
    const p = new Prop(def, v);
    const q = opts.rot ? opts.rot.clone() : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    p.fixed = !!opts.fixed || !!def.fixed;
    this.createBody(p, pos, q, opts.vel, opts.angVel, opts.sleeping);
    p.instanceId = this.batch.addInstance(this.geoId(def.id, v));
    _m.compose(pos, q, _s);
    this.batch.setMatrixAt(p.instanceId, _m);
    p.currPos.copy(pos);
    p.prevPos.copy(pos);
    p.currRot.copy(q);
    p.prevRot.copy(q);
    this.props.push(p);
    return p;
  }

  private createBody(p: Prop, pos: THREE.Vector3, q: THREE.Quaternion, vel?: THREE.Vector3, angVel?: THREE.Vector3, sleeping?: boolean): void {
    const def = p.def;
    const { world } = ctx.physics;
    const bd = (p.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCcdEnabled(!!def.ccd)
      .setLinearDamping(0.05)
      .setAngularDamping(0.3)
      .setCanSleep(true);
    if (vel) bd.setLinvel(vel.x, vel.y, vel.z);
    if (angVel) bd.setAngvel({ x: angVel.x, y: angVel.y, z: angVel.z });
    if (sleeping) bd.setSleeping(true);
    const body = world.createRigidBody(bd);
    // compute total volume for density
    let vol = 0;
    for (const c of def.colliders) vol += colliderVolume(c.shape, c.size);
    const density = def.mass / Math.max(vol, 1e-5);
    p.colliders = [];
    for (const c of def.colliders) {
      let cd: RAPIER.ColliderDesc;
      if (c.shape === 'box') cd = RAPIER.ColliderDesc.cuboid(c.size[0] / 2, c.size[1] / 2, c.size[2] / 2);
      else if (c.shape === 'cyl') cd = RAPIER.ColliderDesc.cylinder(c.size[1] / 2, c.size[0]);
      else cd = RAPIER.ColliderDesc.ball(c.size[0]);
      if (c.pos) cd.setTranslation(c.pos[0], c.pos[1], c.pos[2]);
      if (c.rot) {
        _e.set(c.rot[0] * D2R, c.rot[1] * D2R, c.rot[2] * D2R);
        _q.setFromEuler(_e);
        cd.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      }
      cd.setDensity(density)
        .setFriction(def.friction ?? 0.6)
        .setRestitution(def.restitution ?? 0.15)
        .setCollisionGroups(GROUPS.PROP)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(Math.max(3, def.mass * 26));
      const col = world.createCollider(cd, body);
      p.owner.onContactForce = (ev) => this.onContact(p, ev);
      ctx.physics.register(col, p.owner);
      this.byCollider.set(col.handle, p);
      p.colliders.push(col);
    }
    p.body = body;
    p.awake = !sleeping;
  }

  private removeBody(p: Prop): void {
    if (!p.body) return;
    for (const c of p.colliders) this.byCollider.delete(c.handle);
    ctx.physics.removeBody(p.body);
    p.body = null;
    p.colliders = [];
  }

  propOf(c: RCollider | null | undefined): Prop | null {
    if (!c) return null;
    return this.byCollider.get(c.handle) ?? null;
  }

  remove(p: Prop): void {
    this.removeBody(p);
    if (p.instanceId >= 0) {
      this.batch.deleteInstance(p.instanceId);
      p.instanceId = -1;
    }
    p.state = 'gone';
    const i = this.props.indexOf(p);
    if (i >= 0) this.props.splice(i, 1);
  }

  // ------------------------------------------------------------------ holding
  /** Take the prop into someone's hands: body removed, batch instance hidden. */
  take(p: Prop, holder: Combatant): void {
    this.removeBody(p);
    if (p.instanceId >= 0) this.batch.setVisibleAt(p.instanceId, false);
    p.state = 'held';
    p.holder = holder;
    p.thrownBy = null;
  }

  /** Release a held prop into the world. */
  release(p: Prop, pos: THREE.Vector3, rot: THREE.Quaternion, vel: THREE.Vector3, angVel?: THREE.Vector3, thrownBy?: Combatant): void {
    if (p.state === 'gone') return;
    this.createBody(p, pos, rot, vel, angVel);
    if (p.instanceId >= 0) this.batch.setVisibleAt(p.instanceId, true);
    p.state = 'free';
    p.holder = null;
    p.currPos.copy(pos);
    p.prevPos.copy(pos);
    p.currRot.copy(rot);
    p.prevRot.copy(rot);
    p.awake = true;
    if (thrownBy) {
      p.thrownBy = thrownBy;
      p.thrownTime = ctx.time.elapsed;
      p.hitDuringThrow.clear();
    }
    p.lastSpeed = vel.length();
    p.lastVel.copy(vel);
  }

  // ------------------------------------------------------------------ simulation
  capture(): void {
    for (const p of this.props) {
      const b = p.body;
      if (!b || p.fixed) continue;
      const sleeping = b.isSleeping();
      if (sleeping && !p.awake) continue;
      p.awake = !sleeping;
      p.prevPos.copy(p.currPos);
      p.prevRot.copy(p.currRot);
      const t = b.translation();
      const r = b.rotation();
      p.currPos.set(t.x, t.y, t.z);
      p.currRot.set(r.x, r.y, r.z, r.w);
      const lv = b.linvel();
      p.lastVel.set(lv.x, lv.y, lv.z);
      p.lastSpeed = p.lastVel.length();
      p.dirty = true;
      // fell out of the world
      if (t.y < -10) this.remove(p);
    }
  }

  update(alpha: number): void {
    for (const p of this.props) {
      if (!p.body || p.instanceId < 0) continue;
      if (!p.dirty) continue;
      _p.lerpVectors(p.prevPos, p.currPos, alpha);
      _q.slerpQuaternions(p.prevRot, p.currRot, alpha);
      _m.compose(_p, _q, _s);
      this.batch.setMatrixAt(p.instanceId, _m);
      if (!p.awake) p.dirty = false;
    }
  }

  // ------------------------------------------------------------------ impacts & damage
  private onContact(p: Prop, ev: ContactImpact): void {
    if (p.state !== 'free') return;
    const imp = ev.impulse;
    if (p.fixed) {
      const bi = p.def.breakImpulse;
      if (bi !== undefined && imp > bi * 0.35) {
        p.health -= imp;
        if (imp > bi || p.health <= 0) this.breakProp(p, ev.dir.clone().negate(), imp);
      }
      return;
    }
    const now = ctx.time.elapsed;
    const other = ev.otherOwner;
    // thrown or fast-moving prop hitting a character
    if (other && (other.kind === 'character' || other.kind === 'player' || other.kind === 'ragdoll')) {
      const target = (other.kind === 'player' ? ctx.player : other.entity) as Combatant | undefined;
      if (target && target !== p.thrownBy && !p.hitDuringThrow.has(target)) {
        const speed = p.lastSpeed;
        const thrown = p.thrownBy && now - p.thrownTime < 3;
        if ((thrown && speed > 3) || speed > 6) {
          p.hitDuringThrow.add(target);
          this.projectileHit(p, target, ev, speed, !!thrown);
          if (p.state !== 'free') return;
        }
      }
    }
    // impact sound / fx
    if (imp > 0.4 && now - p.lastImpactSound > 0.08) {
      p.lastImpactSound = now;
      events.emit('impact', { pos: ev.point.clone(), normal: ev.dir.clone(), material: p.def.material, strength: clamp(imp / (p.def.mass * 4 + 2), 0.05, 1.5), otherMaterial: other?.material });
    }
    // breaking from impacts
    const bi = p.def.breakImpulse;
    if (bi !== undefined && imp > bi) {
      this.breakProp(p, ev.dir.clone().negate(), imp);
    } else if (bi !== undefined && imp > bi * 0.4) {
      p.health -= imp * 0.8;
      if (p.health <= 0) this.breakProp(p, ev.dir.clone().negate(), imp);
    }
  }

  private projectileHit(p: Prop, target: Combatant, ev: ContactImpact, speed: number, thrown: boolean): void {
    const w = p.weapon;
    const base = thrown && w ? w.throwDamage : 4 + p.def.mass * 2.2;
    const dmg = base * clamp(speed / (w ? w.throwSpeed : 12), 0.35, 1.6);
    const dir = p.lastVel.clone().normalize();
    // find exact part
    let part: number = P.TORSO;
    let hitPoint = ev.point.clone();
    let local: THREE.Vector3 | undefined;
    if (!target.isPlayer) {
      const from = p.prevPos.clone().addScaledVector(dir, -0.4);
      const h = target.raycastHitbox(from, dir, 2.5, 0.1);
      if (h) {
        part = h.part;
        hitPoint = h.world.clone();
        local = h.local.clone();
      }
    } else {
      const head = target.headPosition(_v);
      if (Math.abs(hitPoint.y - head.y) < 0.25) part = P.HEAD;
    }
    const sharp = w && (w.type === 'sharp' || w.type === 'pierce') && w.sticks;
    const hit: HitInfo = {
      attacker: p.thrownBy,
      damage: dmg,
      type: sharp ? 'pierce' : 'blunt',
      part,
      point: hitPoint,
      dir,
      force: p.def.mass * speed * (thrown ? 22 : 14) + 60,
      source: 'thrown',
      local,
      heavy: p.def.mass > 4,
      carve: sharp ? 1.2 : 0.8,
      bleed: sharp ? 4 : 0,
      dismember: sharp && w?.id === 'cleaver' ? 1.2 : 0,
      stun: 0.4,
    };
    const res = target.receiveHit(hit);
    if (thrown && p.thrownBy?.isPlayer && res.damage > 0) {
      ctx.time.hitStop(0.05);
      (p.thrownBy as any).stats.hits++;
    }
    // sticky blades lodge in the target
    if (sharp && !target.isPlayer && res.damage > 0 && Math.random() < 0.85) {
      this.stickInto(p, target as Character, part, hitPoint, dir);
      return;
    }
    if (w?.shatterOnThrow || (p.def.breakImpulse !== undefined && p.def.breakImpulse < 6)) this.breakProp(p, dir.clone().negate(), 10);
    // bounce back a bit
    if (p.body) {
      const v = p.lastVel.clone().multiplyScalar(-0.25);
      v.y = Math.abs(v.y) + 1;
      p.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    }
  }

  stickInto(p: Prop, ch: Character, part: number, point: THREE.Vector3, dir: THREE.Vector3): void {
    this.removeBody(p);
    if (p.instanceId >= 0) {
      this.batch.deleteInstance(p.instanceId);
      p.instanceId = -1;
    }
    p.state = 'stuck';
    const mesh = this.makeMesh(p);
    ch.model.updateMatrices();
    const bone = ch.model.bones[part];
    // orient blade (+Y of prop) along the throw direction, buried a bit
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    const world = new THREE.Matrix4().compose(point.clone().addScaledVector(dir, 0.06), q, new THREE.Vector3(1, 1, 1));
    const inv = bone.matrixWorld.clone().invert();
    world.premultiply(inv);
    world.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // grip end sticks out: shift so the tip is inside
    mesh.position.addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(mesh.quaternion), -0.12);
    bone.add(mesh);
    const i = this.props.indexOf(p);
    if (i >= 0) this.props.splice(i, 1);
  }

  /** Melee hit on a prop. */
  hitProp(collider: RCollider, point: THREE.Vector3, dir: THREE.Vector3, impulse: number, damage: number, type: DamageType | string, attacker: unknown): void {
    const p = this.propOf(collider);
    if (!p || !p.body) return;
    if (p.fixed) {
      events.emit('impact', { pos: point.clone(), normal: dir.clone().negate(), material: p.def.material, strength: clamp(impulse / 20, 0.2, 1.2), otherMaterial: 'flesh' });
      p.health -= damage * 1.5 + impulse * 0.5;
      if (p.health <= 0) this.breakProp(p, dir, impulse);
      return;
    }
    p.body.applyImpulseAtPoint({ x: dir.x * impulse, y: dir.y * impulse + impulse * 0.25, z: dir.z * impulse }, { x: point.x, y: point.y, z: point.z }, true);
    p.awake = true;
    events.emit('impact', { pos: point.clone(), normal: dir.clone().negate(), material: p.def.material, strength: clamp(impulse / 20, 0.2, 1.2), otherMaterial: 'flesh' });
    if (p.def.health === Infinity) return;
    p.health -= damage * (type === 'blunt' ? 1.2 : 0.8);
    if (p.def.breakImpulse !== undefined && p.def.breakImpulse < 6) p.health = 0;
    if (p.health <= 0) this.breakProp(p, dir, impulse);
    void attacker;
  }

  /** Break a prop into pieces with effects. */
  breakProp(p: Prop, dir: THREE.Vector3, impulse: number): void {
    if (p.state === 'gone') return;
    const def = p.def;
    const pos = p.state === 'free' ? p.position(new THREE.Vector3()) : p.currPos.clone();
    const rot = p.currRot.clone();
    const vel = p.lastVel.clone();
    // center of the prop for effects
    const center = pos.clone();
    if (def.colliders[0]?.pos) center.add(new THREE.Vector3(...def.colliders[0].pos).applyQuaternion(rot));
    const fx = ctx.fx;
    if (fx) {
      const col = def.debrisColor ?? '#888888';
      const n = clamp(Math.round(def.mass * 3 + 6), 6, 40);
      if (def.breakFx === 'glass') {
        fx.debris(center, _v.copy(dir).normalize(), n, col, 'glass', 0.025, 3.5);
        fx.debris(center, _v.copy(dir).normalize(), Math.ceil(n / 2), '#e8f4f0', 'glass', 0.018, 3);
      } else if (def.breakFx === 'wood') {
        fx.debris(center, _v.copy(dir).normalize(), n, col, 'splinter', 0.03, 3);
        fx.dust(center, 4, '#8a7a6a');
      } else if (def.breakFx === 'ceramic') {
        fx.debris(center, _v.copy(dir).normalize(), n, col, 'debris', 0.03, 3);
      } else if (def.breakFx === 'metal' || def.breakFx === 'plastic') {
        fx.debris(center, _v.copy(dir).normalize(), n, col, 'debris', 0.03, 3);
        if (def.breakFx === 'metal') fx.sparkBurst(center, dir, 10, 0xffd080);
      } else if (def.breakFx === 'paper') {
        fx.debris(center, _v.copy(dir).normalize(), n, col, 'debris', 0.04, 2);
      }
      if (def.liquid !== undefined && p.full) fx.liquidSplash(center, 18, def.liquid);
    }
    events.emit('impact', { pos: center.clone(), normal: dir.clone(), material: def.material, strength: 1.4, otherMaterial: 'break' as any });
    events.emit('noise', { pos: center.clone(), radius: 10, kind: 'break', source: null });
    // pieces
    if (def.pieces) {
      for (const pc of def.pieces) {
        const off = new THREE.Vector3(...(pc.pos ?? [0, 0, 0])).applyQuaternion(rot);
        const ppos = pos.clone().add(off);
        const prot = rot.clone();
        if (pc.rot) {
          _e.set(pc.rot[0] * D2R, pc.rot[1] * D2R, pc.rot[2] * D2R);
          prot.multiply(_q.setFromEuler(_e));
        }
        const pv = vel.clone().addScaledVector(dir, rand(0.5, 2.5)).add(new THREE.Vector3(rand(-1, 1), rand(0.5, 2.5), rand(-1, 1)));
        const piece = this.spawn(pc.id, ppos, 0, p.variant, { rot: prot, vel: pv, angVel: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)) });
        piece.bloody = p.bloody;
      }
    }
    // glass bottles sometimes leave a usable broken bottle
    if (def.weapon === 'bottle' && p.state === 'free' && Math.random() < 0.3) {
      this.spawn('broken_bottle', pos.clone().add(new THREE.Vector3(0, 0.05, 0)), Math.random() * 6, p.variant, { vel: vel.clone().multiplyScalar(0.3) });
    }
    this.totalBroken++;
    this.onBreak?.(p);
    this.remove(p);
  }

  /** Paint a prop with blood (per-instance tint). */
  bloodyProp(p: Prop, amount: number): void {
    if (p.instanceId < 0) return;
    p.bloody = Math.min(1, p.bloody + amount);
    _c.setRGB(1, 1 - p.bloody * 0.6, 1 - p.bloody * 0.62);
    this.batch.setColorAt(p.instanceId, _c);
  }

  // ------------------------------------------------------------------ queries
  /** Raycast for a pickable/interactive prop. */
  findPickup(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, filter?: (p: Prop) => boolean): Prop | null {
    const hit = ctx.physics.sphereCast(origin, dir, 0.09, maxDist, PICK_GROUPS);
    let p = hit ? this.propOf(hit.collider) : null;
    if (p && filter && !filter(p)) p = null;
    if (p) {
      // make sure static geometry isn't in the way
      const wall = ctx.physics.raycast(origin, dir, hit!.toi, groups(0xffff, CG.STATIC));
      if (wall) return null;
      return p;
    }
    // fallback: nearest small prop near the aim ray
    let best: Prop | null = null;
    let bestD = 0.22;
    for (const q of this.props) {
      if (!q.body || (filter && !filter(q))) continue;
      q.position(_v);
      if (q.def.colliders[0]?.pos) _v.y += q.def.colliders[0].pos[1];
      _v2.subVectors(_v, origin);
      const along = _v2.dot(dir);
      if (along < 0.2 || along > maxDist) continue;
      const perp = Math.sqrt(Math.max(0, _v2.lengthSq() - along * along));
      if (perp < bestD) {
        bestD = perp;
        best = q;
      }
    }
    return best;
  }

  /** Nearest free weapon prop within radius (for AI). */
  nearestWeapon(pos: THREE.Vector3, radius: number, minValue = 0.2): Prop | null {
    let best: Prop | null = null;
    let bestScore = Infinity;
    const r2 = radius * radius;
    for (const p of this.props) {
      if (p.state !== 'free' || !p.body || p.reservedBy) continue;
      const w = p.weapon;
      if (!w || w.aiValue < minValue) continue;
      p.position(_v);
      if (Math.abs(_v.y - pos.y) > 1.6) continue;
      const d2 = (_v.x - pos.x) ** 2 + (_v.z - pos.z) ** 2;
      if (d2 > r2) continue;
      const score = d2 / (0.3 + w.aiValue);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  nearestThrowable(pos: THREE.Vector3, radius: number): Prop | null {
    let best: Prop | null = null;
    let bestD = radius * radius;
    for (const p of this.props) {
      if (p.state !== 'free' || !p.body || p.reservedBy) continue;
      if (p.def.mass > 9 || p.def.mass < 0.1) continue;
      p.position(_v);
      if (Math.abs(_v.y - pos.y) > 1.6) continue;
      const d2 = (_v.x - pos.x) ** 2 + (_v.z - pos.z) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = p;
      }
    }
    return best;
  }

  clear(): void {
    for (const p of this.props.slice()) this.remove(p);
  }
}

function colliderVolume(shape: string, size: number[]): number {
  if (shape === 'box') return size[0] * size[1] * size[2];
  if (shape === 'cyl') return Math.PI * size[0] * size[0] * size[1];
  return (4 / 3) * Math.PI * size[0] ** 3;
}
