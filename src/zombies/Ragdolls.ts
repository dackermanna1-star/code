import { G } from '../core/G';
import { RAPIER, GROUPS } from '../physics/Physics';
import { qRot, qRotInv } from '../core/qmath';
import { clamp, rand, rayOBB } from '../core/math';
import { BodyDef, P, PART_COUNT, PART_PARENT, PART_SIDE, PART_TO_TYPE, PT, partDef } from './skeleton';
import { BodyRenderer, FxState, InstBatch, bodyIndex, writeTRS } from './BodyRenderer';
import type { ZombieType } from './types';
import type { Zombie } from './Zombie';

const TMP = new Float32Array(3);
const TMP2 = new Float32Array(3);
const MAT = new Float32Array(16);

export interface PartHit {
  t: number;
  part: number;
  kind: 'ragdoll' | 'corpse';
  ragdoll?: Ragdoll;
  corpse?: Corpse;
}

interface Bleeder {
  part: number;
  ox: number;
  oy: number;
  oz: number;
  t: number;
  rate: number;
}

let rid = 1;

export class Ragdoll {
  readonly id = rid++;
  readonly bodies: (RAPIER.RigidBody | null)[] = new Array(PART_COUNT).fill(null);
  readonly joints: (RAPIER.ImpulseJoint | null)[] = new Array(PART_COUNT).fill(null);
  readonly partPos = new Float32Array(PART_COUNT * 3);
  readonly partQuat = new Float32Array(PART_COUNT * 4);
  readonly partScale = new Float32Array(PART_COUNT * 3);
  mask = 0;
  age = 0;
  restT = 0;
  checkT = 0;
  thud = false;
  zombie: Zombie | null = null;
  bleeders: Bleeder[] = [];
  readonly fx: FxState;
  fireT = 0;
  minY = 0;
  /** Corpse this ragdoll froze into (for attached props). */
  corpse: Corpse | null = null;
  constructor(readonly type: ZombieType, readonly skin: number) {
    this.fx = { blood: 0, flash: 0, burn: 0, eyes: 0, fire: 0 };
  }
  get body(): BodyDef {
    return this.type.body;
  }
  has(p: number) {
    return (this.mask & (1 << p)) !== 0;
  }
  /** World-space center of the pelvis (or first existing part). */
  center(out: Float32Array) {
    let p = this.has(P.Pelvis) ? P.Pelvis : this.has(P.Torso) ? P.Torso : 0;
    for (let i = 0; i < PART_COUNT && !this.has(p); i++) p = i;
    out[0] = this.partPos[p * 3];
    out[1] = this.partPos[p * 3 + 1];
    out[2] = this.partPos[p * 3 + 2];
    return out;
  }
}

export interface Corpse {
  id: number;
  type: ZombieType;
  skin: number;
  fx: FxState;
  mask: number;
  partPos: Float32Array;
  partQuat: Float32Array;
  partScale: Float32Array;
  slots: number[];
  body: RAPIER.RigidBody | null;
  x: number;
  z: number;
  top: number;
  cell: number;
  alive: boolean;
  burnT: number;
  /** Ragdoll this corpse was woken into (for attached props). */
  woke?: Ragdoll | null;
}

const CELL = 2;
const GMINX = -18;
const GMINZ = -16;
const GCOLS = 18;
const GROWS = 90;

/**
 * Active ragdolls (physics) and frozen corpses (static instances + simple
 * fixed colliders). Corpses persist for the whole day; explosions and heavy
 * hits wake them back into ragdolls.
 */
export class RagdollSystem {
  active: Ragdoll[] = [];
  corpses: Corpse[] = [];
  maxActive = 42;
  maxCorpses = 2400;
  corpseColliders = true;
  private grid: number[][] = [];
  private cid = 1;
  maxCorpseTop = 0.5;
  onThud: ((x: number, y: number, z: number, strength: number) => void) | null = null;

  constructor(private renderer: BodyRenderer) {
    for (let i = 0; i < GCOLS * GROWS; i++) this.grid.push([]);
  }

  private cellOf(x: number, z: number) {
    const cx = clamp(Math.floor((x - GMINX) / CELL), 0, GCOLS - 1);
    const cz = clamp(Math.floor((z - GMINZ) / CELL), 0, GROWS - 1);
    return cz * GCOLS + cx;
  }

  /**
   * Builds a ragdoll from a posed body. `vel` gives initial linear velocity of
   * each part (world). Parts not in `mask` are skipped.
   */
  spawn(
    type: ZombieType,
    skin: number,
    fx: FxState,
    partPos: Float32Array,
    partQuat: Float32Array,
    partScale: Float32Array,
    mask: number,
    vel: (part: number, out: Float32Array) => void,
  ): Ragdoll {
    const world = G.physics.world;
    const r = new Ragdoll(type, skin);
    r.fx.blood = fx.blood;
    r.fx.burn = fx.burn;
    r.fx.fire = fx.fire;
    r.fireT = fx.fire > 0 ? 4 : 0;
    r.mask = mask;
    r.partScale.set(partScale);
    const body = type.body;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!(mask & (1 << i))) continue;
      const d = partDef(body, i);
      const sx = partScale[i * 3], sy = partScale[i * 3 + 1], sz = partScale[i * 3 + 2];
      qRot(TMP, 0, partQuat, i * 4, d.center[0] * sx, d.center[1] * sy, d.center[2] * sz);
      const cx = partPos[i * 3] + TMP[0];
      const cy = Math.max(partPos[i * 3 + 1] + TMP[1], 0.05);
      const cz = partPos[i * 3 + 2] + TMP[2];
      vel(i, TMP2);
      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(cx, cy, cz)
          .setRotation({ x: partQuat[i * 4], y: partQuat[i * 4 + 1], z: partQuat[i * 4 + 2], w: partQuat[i * 4 + 3] })
          .setLinvel(TMP2[0], TMP2[1], TMP2[2])
          .setAngvel({ x: rand(-1, 1), y: rand(-1, 1), z: rand(-1, 1) })
          .setLinearDamping(0.08)
          .setAngularDamping(0.9)
          .setCanSleep(true),
      );
      const pt = PART_TO_TYPE[i];
      world.createCollider(
        RAPIER.ColliderDesc.cuboid((d.size[0] * sx) / 2, (d.size[1] * sy) / 2, (d.size[2] * sz) / 2)
          .setDensity(body.density[pt] * (type.mass / 80) ** 0.5)
          .setFriction(0.85)
          .setRestitution(0.05)
          .setCollisionGroups(GROUPS.ragdoll),
        rb,
      );
      r.bodies[i] = rb;
      r.partPos[i * 3] = partPos[i * 3];
      r.partPos[i * 3 + 1] = partPos[i * 3 + 1];
      r.partPos[i * 3 + 2] = partPos[i * 3 + 2];
      for (let k = 0; k < 4; k++) r.partQuat[i * 4 + k] = partQuat[i * 4 + k];
    }
    // joints
    for (let i = 1; i < PART_COUNT; i++) {
      const p = PART_PARENT[i];
      const a = r.bodies[p];
      const b = r.bodies[i];
      if (!a || !b) continue;
      this.makeJoint(r, i);
    }
    this.active.push(r);
    this.enforceBudget();
    return r;
  }

  private makeJoint(r: Ragdoll, i: number) {
    const world = G.physics.world;
    const p = PART_PARENT[i];
    const a = r.bodies[p]!;
    const b = r.bodies[i]!;
    const body = r.body;
    const ta = a.translation();
    const qa = a.rotation();
    // anchor = child's pivot in world
    const d = partDef(body, i);
    const sx = r.partScale[i * 3], sy = r.partScale[i * 3 + 1], sz = r.partScale[i * 3 + 2];
    const tb = b.translation();
    const qb = b.rotation();
    const qbArr = [qb.x, qb.y, qb.z, qb.w];
    qRot(TMP, 0, qbArr, 0, -d.center[0] * sx, -d.center[1] * sy, -d.center[2] * sz);
    const ax = tb.x + TMP[0], ay = tb.y + TMP[1], az = tb.z + TMP[2];
    const qaArr = [qa.x, qa.y, qa.z, qa.w];
    qRotInv(TMP2, 0, qaArr, 0, ax - ta.x, ay - ta.y, az - ta.z);
    const a1 = { x: TMP2[0], y: TMP2[1], z: TMP2[2] };
    const a2 = { x: -d.center[0] * sx, y: -d.center[1] * sy, z: -d.center[2] * sz };
    const lim = body.limits[i];
    let j: RAPIER.ImpulseJoint;
    if (body.hinge[i]) {
      j = world.createImpulseJoint(RAPIER.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 }), a, b, true);
      (j as RAPIER.RevoluteImpulseJoint).setLimits(lim[0], lim[1]);
    } else {
      j = world.createImpulseJoint(RAPIER.JointData.spherical(a1, a2), a, b, true);
      const raw = (j as any).rawSet;
      raw.jointSetLimits(j.handle, 3, lim[0], lim[1]);
      raw.jointSetLimits(j.handle, 4, lim[2], lim[3]);
      raw.jointSetLimits(j.handle, 5, lim[4], lim[5]);
    }
    j.setContactsEnabled(false);
    r.joints[i] = j;
  }

  /** Detach a part (and its children) from its parent. */
  sever(r: Ragdoll, part: number, spurt = true) {
    const j = r.joints[part];
    if (j) {
      try {
        G.physics.world.removeImpulseJoint(j, true);
      } catch {
        /* already gone */
      }
      r.joints[part] = null;
      if (spurt) {
        const parent = PART_PARENT[part];
        if (parent >= 0 && r.has(parent)) {
          // stump on the parent side bleeds
          const d = partDef(r.body, part);
          void d;
          r.bleeders.push({ part: parent, ox: 0, oy: 0, oz: 0, t: 2.5, rate: 0 });
        }
        r.bleeders.push({ part, ox: 0, oy: 0, oz: 0, t: 1.5, rate: 0 });
      }
    }
  }

  /** Remove a part entirely (head pop). */
  removePart(r: Ragdoll, part: number) {
    const b = r.bodies[part];
    if (b) {
      // children lose their joint to this part
      for (let i = 0; i < PART_COUNT; i++) if (PART_PARENT[i] === part && r.joints[i]) this.sever(r, i, false);
      if (r.joints[part]) this.sever(r, part, false);
      G.physics.world.removeRigidBody(b);
      r.bodies[part] = null;
    }
    r.mask &= ~(1 << part);
    const parent = PART_PARENT[part];
    if (parent >= 0 && r.has(parent)) r.bleeders.push({ part: parent, ox: 0, oy: 0, oz: 0, t: 3, rate: 0 });
  }

  applyImpulse(r: Ragdoll, part: number, ix: number, iy: number, iz: number, px?: number, py?: number, pz?: number) {
    const b = r.bodies[part];
    if (!b) return;
    if (px !== undefined) b.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, { x: px, y: py!, z: pz! }, true);
    else b.applyImpulse({ x: ix, y: iy, z: iz }, true);
  }

  private enforceBudget() {
    if (this.active.length <= this.maxActive) return;
    // freeze the most settled (or oldest) non-recovering ragdolls
    const cands = this.active.filter((r) => !r.zombie);
    cands.sort((a, b) => b.restT - a.restT || b.age - a.age);
    let over = this.active.length - this.maxActive;
    for (const r of cands) {
      if (over <= 0) break;
      if (r.age < 0.6 && r.restT <= 0) continue;
      this.freeze(r);
      over--;
    }
  }

  update(dt: number) {
    const world = G.physics.world;
    void world;
    for (let k = this.active.length - 1; k >= 0; k--) {
      const r = this.active[k];
      r.age += dt;
      let maxV = 0;
      let minY = 99;
      for (let i = 0; i < PART_COUNT; i++) {
        const b = r.bodies[i];
        if (!b) continue;
        const t = b.translation();
        const q = b.rotation();
        const d = partDef(r.body, i);
        const sx = r.partScale[i * 3], sy = r.partScale[i * 3 + 1], sz = r.partScale[i * 3 + 2];
        r.partQuat[i * 4] = q.x;
        r.partQuat[i * 4 + 1] = q.y;
        r.partQuat[i * 4 + 2] = q.z;
        r.partQuat[i * 4 + 3] = q.w;
        qRot(TMP, 0, r.partQuat, i * 4, d.center[0] * sx, d.center[1] * sy, d.center[2] * sz);
        r.partPos[i * 3] = t.x - TMP[0];
        r.partPos[i * 3 + 1] = t.y - TMP[1];
        r.partPos[i * 3 + 2] = t.z - TMP[2];
        if (t.y < minY) minY = t.y;
        if (i === P.Torso || i === P.Pelvis || i === P.Head) {
          const v = b.linvel();
          const sp = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
          if (sp > maxV) maxV = sp;
          if (!r.thud && t.y < 0.35 * r.partScale[1] && v.y < -1.5) {
            r.thud = true;
            this.onThud?.(t.x, t.y, t.z, Math.min(1, -v.y / 6));
          }
        }
        // fell out of the world / flew away
        if (t.y < -5 || Math.abs(t.x) > 60 || t.z < -60 || t.z > 250) {
          b.setTranslation({ x: clamp(t.x, -12, 12), y: 1, z: clamp(t.z, -8, 140) }, true);
          b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
      r.minY = minY;
      if (r.fx.flash > 0) r.fx.flash = Math.max(0, r.fx.flash - dt * 8);
      if (r.fireT > 0) {
        r.fireT -= dt;
        r.fx.burn = Math.min(1, r.fx.burn + dt * 0.25);
        r.fx.fire = r.fireT > 0 ? 1 : 0;
        if (r.fireT > 0 && Math.random() < dt * 14) {
          const i = Math.floor(Math.random() * PART_COUNT);
          if (r.has(i)) G.fx?.fireAt(r.partPos[i * 3], r.partPos[i * 3 + 1] + 0.1, r.partPos[i * 3 + 2], 0.6);
        }
      }
      // bleeding stumps
      for (let bi = r.bleeders.length - 1; bi >= 0; bi--) {
        const bl = r.bleeders[bi];
        bl.t -= dt;
        if (bl.t <= 0 || !r.has(bl.part)) {
          r.bleeders.splice(bi, 1);
          continue;
        }
        bl.rate += dt * 30 * Math.min(1, bl.t);
        while (bl.rate > 1) {
          bl.rate -= 1;
          const i = bl.part;
          G.fx?.bloodSpurt(r.partPos[i * 3], r.partPos[i * 3 + 1] + 0.05, r.partPos[i * 3 + 2], Math.min(1, bl.t));
        }
      }
      // settle detection
      r.checkT -= dt;
      if (r.checkT <= 0) {
        r.checkT = 0.15;
        if (maxV < 0.35) r.restT += 0.15;
        else r.restT = Math.max(0, r.restT - 0.3);
        const asleep = r.bodies.every((b) => !b || b.isSleeping());
        if (r.zombie) {
          if ((r.restT > 0.45 || asleep || r.age > 4) && r.age > 0.8) {
            G.zombies?.beginGetup(r.zombie, r);
          }
        } else if ((r.restT > 0.6 || asleep || r.age > 14) && r.age > 1.0) {
          this.freeze(r);
        }
      }
    }
  }

  /** Removes a ragdoll's physics (used when a knocked-down zombie gets up). */
  destroy(r: Ragdoll) {
    const world = G.physics.world;
    for (let i = 0; i < PART_COUNT; i++) {
      const b = r.bodies[i];
      if (b) world.removeRigidBody(b);
      r.bodies[i] = null;
      r.joints[i] = null;
    }
    const idx = this.active.indexOf(r);
    if (idx >= 0) this.active.splice(idx, 1);
  }

  /** Converts a settled ragdoll into a static corpse. */
  freeze(r: Ragdoll) {
    const idx = this.active.indexOf(r);
    if (idx < 0) return;
    // capture final transforms (already in partPos/partQuat from the last update)
    this.destroy(r);
    if (r.zombie) return;
    if (r.mask === 0) return;
    r.corpse = this.addCorpse(r.type, r.skin, r.fx, r.partPos, r.partQuat, r.partScale, r.mask, r.fireT > 0 ? r.fireT : 0);
  }

  addCorpse(type: ZombieType, skin: number, fx: FxState, partPos: Float32Array, partQuat: Float32Array, partScale: Float32Array, mask: number, burnT = 0) {
    if (this.corpses.length >= this.maxCorpses) this.removeCorpse(this.corpses[0]);
    const c: Corpse = {
      id: this.cid++,
      type,
      skin,
      fx: { blood: fx.blood, flash: 0, burn: fx.burn, eyes: 0, fire: burnT > 0 ? 1 : 0 },
      mask,
      partPos: new Float32Array(partPos),
      partQuat: new Float32Array(partQuat),
      partScale: new Float32Array(partScale),
      slots: new Array(PART_COUNT + 4).fill(-1),
      body: null,
      x: 0,
      z: 0,
      top: 0,
      cell: 0,
      alive: true,
      burnT,
    };
    // position (pelvis or any part)
    let anchor = P.Pelvis;
    if (!(mask & (1 << anchor))) for (let i = 0; i < PART_COUNT; i++) if (mask & (1 << i)) { anchor = i; break; }
    c.x = partPos[anchor * 3];
    c.z = partPos[anchor * 3 + 2];
    let top = 0;
    for (let i = 0; i < PART_COUNT; i++) if (mask & (1 << i)) top = Math.max(top, partPos[i * 3 + 1] + 0.2);
    c.top = top;
    this.maxCorpseTop = Math.max(this.maxCorpseTop, top);
    this.writeCorpseInstances(c);
    if (this.corpseColliders) this.buildCorpseColliders(c);
    c.cell = this.cellOf(c.x, c.z);
    this.grid[c.cell].push(c.id);
    this.corpses.push(c);
    this.byId.set(c.id, c);
    return c;
  }
  private byId = new Map<number, Corpse>();

  private writeCorpseInstances(c: Corpse) {
    const bi = bodyIndex(c.type.body);
    for (let i = 0; i < PART_COUNT; i++) {
      if (!(c.mask & (1 << i))) continue;
      const batch = this.renderer.batch(false, bi, PART_TO_TYPE[i], PART_SIDE[i]);
      const slot = batch.alloc(c, i);
      if (slot < 0) continue;
      c.slots[i] = slot;
      writeTRS(MAT, 0, c.partPos[i * 3], c.partPos[i * 3 + 1], c.partPos[i * 3 + 2], c.partQuat[i * 4], c.partQuat[i * 4 + 1], c.partQuat[i * 4 + 2], c.partQuat[i * 4 + 3], c.partScale[i * 3], c.partScale[i * 3 + 1], c.partScale[i * 3 + 2]);
      batch.write(slot, MAT, 0, c.skin, c.fx);
    }
    const acc = c.type.accessories;
    if (acc) {
      acc.forEach((a, k) => {
        if (!(c.mask & (1 << a.part))) return;
        const batch = this.renderer.statAcc[a.acc];
        const key = PART_COUNT + k;
        const slot = batch.alloc(c, key);
        if (slot < 0) return;
        c.slots[key] = slot;
        const i = a.part;
        writeTRS(MAT, 0, c.partPos[i * 3], c.partPos[i * 3 + 1], c.partPos[i * 3 + 2], c.partQuat[i * 4], c.partQuat[i * 4 + 1], c.partQuat[i * 4 + 2], c.partQuat[i * 4 + 3], c.partScale[i * 3], c.partScale[i * 3 + 1], c.partScale[i * 3 + 2]);
        batch.write(slot, MAT, 0, 0, c.fx);
      });
    }
  }

  private buildCorpseColliders(c: Corpse) {
    const world = G.physics.world;
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const body = c.type.body;
    for (const i of [P.Pelvis, P.Torso, P.Head, P.ULegL, P.ULegR, P.LLegL, P.LLegR]) {
      if (!(c.mask & (1 << i))) continue;
      const d = partDef(body, i);
      const sx = c.partScale[i * 3], sy = c.partScale[i * 3 + 1], sz = c.partScale[i * 3 + 2];
      qRot(TMP, 0, c.partQuat, i * 4, d.center[0] * sx, d.center[1] * sy, d.center[2] * sz);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid((d.size[0] * sx) / 2, (d.size[1] * sy) / 2, (d.size[2] * sz) / 2)
          .setTranslation(c.partPos[i * 3] + TMP[0], c.partPos[i * 3 + 1] + TMP[1], c.partPos[i * 3 + 2] + TMP[2])
          .setRotation({ x: c.partQuat[i * 4], y: c.partQuat[i * 4 + 1], z: c.partQuat[i * 4 + 2], w: c.partQuat[i * 4 + 3] })
          .setFriction(0.9)
          .setCollisionGroups(GROUPS.corpse),
        rb,
      );
    }
    c.body = rb;
  }

  removeCorpse(c: Corpse) {
    if (!c.alive) return;
    c.alive = false;
    const bi = bodyIndex(c.type.body);
    for (let i = 0; i < PART_COUNT; i++) {
      if (c.slots[i] >= 0) this.renderer.batch(false, bi, PART_TO_TYPE[i], PART_SIDE[i]).free(c.slots[i]);
      c.slots[i] = -1;
    }
    const acc = c.type.accessories;
    if (acc) acc.forEach((a, k) => {
      const key = PART_COUNT + k;
      if (c.slots[key] >= 0) this.renderer.statAcc[a.acc].free(c.slots[key]);
      c.slots[key] = -1;
    });
    if (c.body) G.physics.world.removeRigidBody(c.body);
    c.body = null;
    const cell = this.grid[c.cell];
    const gi = cell.indexOf(c.id);
    if (gi >= 0) cell.splice(gi, 1);
    const li = this.corpses.indexOf(c);
    if (li >= 0) this.corpses.splice(li, 1);
    this.byId.delete(c.id);
  }

  /** Wakes a corpse back into a ragdoll. */
  unfreeze(c: Corpse): Ragdoll | null {
    if (!c.alive) return null;
    this.removeCorpse(c);
    const r = this.spawn(c.type, c.skin, c.fx, c.partPos, c.partQuat, c.partScale, c.mask, (_p, out) => {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
    });
    r.fireT = c.burnT;
    c.woke = r;
    return r;
  }

  /** Corpses whose anchor lies within radius of (x, z). */
  corpsesNear(x: number, z: number, radius: number, out: Corpse[] = []) {
    out.length = 0;
    const c0x = clamp(Math.floor((x - radius - GMINX) / CELL), 0, GCOLS - 1);
    const c1x = clamp(Math.floor((x + radius - GMINX) / CELL), 0, GCOLS - 1);
    const c0z = clamp(Math.floor((z - radius - GMINZ) / CELL), 0, GROWS - 1);
    const c1z = clamp(Math.floor((z + radius - GMINZ) / CELL), 0, GROWS - 1);
    const r2 = radius * radius;
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        for (const id of this.grid[cz * GCOLS + cx]) {
          const c = this.byId.get(id);
          if (!c) continue;
          const dx = c.x - x;
          const dz = c.z - z;
          if (dx * dx + dz * dz <= r2) out.push(c);
        }
      }
    return out;
  }

  /** Radial blast: pushes ragdolls, wakes corpses (budgeted). */
  blast(x: number, y: number, z: number, radius: number, force: number, wakeBudget = 14) {
    const near: Corpse[] = [];
    this.corpsesNear(x, z, radius, near);
    near.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
    let woke = 0;
    for (const c of near) {
      if (woke >= wakeBudget) break;
      if (this.unfreeze(c)) woke++;
    }
    for (const r of this.active) {
      for (let i = 0; i < PART_COUNT; i++) {
        const b = r.bodies[i];
        if (!b) continue;
        const t = b.translation();
        const dx = t.x - x;
        const dy = t.y - y;
        const dz = t.z - z;
        const d = Math.hypot(dx, dy, dz);
        if (d > radius) continue;
        const f = force * (1 - d / radius) * b.mass();
        const inv = 1 / Math.max(0.3, d);
        // mostly outward, with enough lift to tumble bodies a few meters up
        b.applyImpulse({ x: dx * inv * f, y: (Math.max(0.15, dy * inv) * 0.5 + 0.6) * f, z: dz * inv * f }, true);
        b.applyTorqueImpulse({ x: rand(-1, 1) * f * 0.02, y: rand(-1, 1) * f * 0.02, z: rand(-1, 1) * f * 0.02 }, true);
      }
    }
  }

  /** Ray test against active ragdolls and (low) corpses. Returns hits sorted by t. */
  rayTest(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: PartHit[]) {
    for (const r of this.active) {
      for (let i = 0; i < PART_COUNT; i++) {
        if (!r.has(i)) continue;
        const t = this.rayPart(r.type.body, r.partPos, r.partQuat, r.partScale, i, ox, oy, oz, dx, dy, dz, maxT);
        if (t >= 0) out.push({ t, part: i, kind: 'ragdoll', ragdoll: r });
      }
    }
    // corpses: only along the part of the ray inside the corpse height slab
    const top = this.maxCorpseTop + 0.3;
    let t0 = 0;
    let t1 = maxT;
    if (Math.abs(dy) > 1e-5) {
      const ta = (0 - oy) / dy;
      const tb = (top - oy) / dy;
      t0 = Math.max(0, Math.min(ta, tb));
      t1 = Math.min(maxT, Math.max(ta, tb));
    } else if (oy > top || oy < 0) return;
    if (t1 <= t0) return;
    const seen = new Set<number>();
    const step = 1.0;
    for (let t = t0; t <= t1 + step; t += step) {
      const tt = Math.min(t, t1);
      const px = ox + dx * tt;
      const pz = oz + dz * tt;
      const cx = Math.floor((px - GMINX) / CELL);
      const cz = Math.floor((pz - GMINZ) / CELL);
      for (let ddz = -1; ddz <= 1; ddz++)
        for (let ddx = -1; ddx <= 1; ddx++) {
          const gx = cx + ddx;
          const gz = cz + ddz;
          if (gx < 0 || gz < 0 || gx >= GCOLS || gz >= GROWS) continue;
          for (const id of this.grid[gz * GCOLS + gx]) {
            if (seen.has(id)) continue;
            seen.add(id);
            const c = this.byId.get(id);
            if (!c) continue;
            for (let i = 0; i < PART_COUNT; i++) {
              if (!(c.mask & (1 << i))) continue;
              const th = this.rayPart(c.type.body, c.partPos, c.partQuat, c.partScale, i, ox, oy, oz, dx, dy, dz, maxT);
              if (th >= 0) out.push({ t: th, part: i, kind: 'corpse', corpse: c });
            }
          }
        }
      if (tt >= t1) break;
    }
  }

  private inv = new Float32Array(16);
  rayPart(body: BodyDef, pos: Float32Array, quat: Float32Array, scl: Float32Array, i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    const d = partDef(body, i);
    const sx = scl[i * 3], sy = scl[i * 3 + 1], sz = scl[i * 3 + 2];
    // inverse rigid transform (rotation^T, -R^T p)
    const qx = quat[i * 4], qy = quat[i * 4 + 1], qz = quat[i * 4 + 2], qw = quat[i * 4 + 3];
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
    // R columns
    const r00 = 1 - (yy + zz), r10 = xy + wz, r20 = xz - wy;
    const r01 = xy - wz, r11 = 1 - (xx + zz), r21 = yz + wx;
    const r02 = xz + wy, r12 = yz - wx, r22 = 1 - (xx + yy);
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    const m = this.inv;
    // R^T in column-major: m[0]=r00 m[1]=r01 m[2]=r02 ; m[4]=r10 ...
    m[0] = r00; m[1] = r01; m[2] = r02;
    m[4] = r10; m[5] = r11; m[6] = r12;
    m[8] = r20; m[9] = r21; m[10] = r22;
    m[12] = -(r00 * px + r10 * py + r20 * pz);
    m[13] = -(r01 * px + r11 * py + r21 * pz);
    m[14] = -(r02 * px + r12 * py + r22 * pz);
    return rayOBB(ox, oy, oz, dx, dy, dz, m, 0, (d.size[0] * sx) / 2, (d.size[1] * sy) / 2, (d.size[2] * sz) / 2, d.center[0] * sx, d.center[1] * sy, d.center[2] * sz, maxT);
  }

  /** Push active ragdolls into dynamic render batches. */
  render(renderer: BodyRenderer) {
    for (const r of this.active) {
      if (r.zombie) continue; // knocked-down zombies render through the zombie path
      pushBody(renderer, r.type, r.skin, r.fx, r.partPos, r.partQuat, r.partScale, r.mask);
    }
  }

  /** Update corpse visuals (burning) occasionally. */
  updateCorpses(dt: number) {
    for (const c of this.corpses) {
      if (c.burnT > 0) {
        c.burnT -= dt;
        c.fx.burn = Math.min(1, c.fx.burn + dt * 0.3);
        c.fx.fire = c.burnT > 0 ? 1 : 0;
        if (Math.random() < dt * 8) G.fx?.fireAt(c.x + rand(-0.4, 0.4), 0.2, c.z + rand(-0.4, 0.4), 0.5);
        this.refreshCorpseFx(c);
      }
    }
  }

  refreshCorpseFx(c: Corpse) {
    const bi = bodyIndex(c.type.body);
    for (let i = 0; i < PART_COUNT; i++) {
      if (c.slots[i] < 0) continue;
      this.renderer.batch(false, bi, PART_TO_TYPE[i], PART_SIDE[i]).write(c.slots[i], null, 0, c.skin, c.fx);
    }
  }

  clear() {
    for (const r of [...this.active]) this.destroy(r);
    for (const c of [...this.corpses]) this.removeCorpse(c);
    this.corpses = [];
    this.active = [];
    this.byId.clear();
    for (const g of this.grid) g.length = 0;
    this.maxCorpseTop = 0.5;
    this.renderer.clearStatic();
  }
}

/** Writes a posed body into the dynamic batches. */
export function pushBody(renderer: BodyRenderer, type: ZombieType, skin: number, fx: FxState, partPos: Float32Array, partQuat: Float32Array, partScale: Float32Array, mask: number) {
  const bi = bodyIndex(type.body);
  for (let i = 0; i < PART_COUNT; i++) {
    if (!(mask & (1 << i))) continue;
    const batch: InstBatch = renderer.batch(true, bi, PART_TO_TYPE[i], PART_SIDE[i]);
    if (batch.count >= batch.capacity) continue;
    const slot = batch.count++;
    writeTRS(batch.mat, slot * 16, partPos[i * 3], partPos[i * 3 + 1], partPos[i * 3 + 2], partQuat[i * 4], partQuat[i * 4 + 1], partQuat[i * 4 + 2], partQuat[i * 4 + 3], partScale[i * 3], partScale[i * 3 + 1], partScale[i * 3 + 2]);
    batch.write(slot, null, 0, skin, fx);
  }
  const acc = type.accessories;
  if (acc) {
    for (const a of acc) {
      if (!(mask & (1 << a.part))) continue;
      const batch = renderer.dynAcc[a.acc];
      if (batch.count >= batch.capacity) continue;
      const slot = batch.count++;
      const i = a.part;
      writeTRS(batch.mat, slot * 16, partPos[i * 3], partPos[i * 3 + 1], partPos[i * 3 + 2], partQuat[i * 4], partQuat[i * 4 + 1], partQuat[i * 4 + 2], partQuat[i * 4 + 3], partScale[i * 3], partScale[i * 3 + 1], partScale[i * 3 + 2]);
      batch.write(slot, null, 0, 0, fx);
    }
  }
}

export const ALL_PARTS = (1 << PART_COUNT) - 1;
export { PT };
