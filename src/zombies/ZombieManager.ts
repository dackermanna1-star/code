import * as THREE from 'three';
import { G } from '../core/G';
import { GROUPS, RAPIER } from '../physics/Physics';
import { angleLerp, chance, clamp, rand, rayOBB, raySphere, wrapAngle } from '../core/math';
import { qRot } from '../core/qmath';
import { ARENA } from '../world/config';
import { woundKindFor } from '../fx/Wounds';
import { BodyRenderer } from './BodyRenderer';
import { FlowField } from './FlowField';
import { ALL_PARTS, Ragdoll, RagdollSystem, pushBody } from './Ragdolls';
import { P, PART_COUNT, PART_PARENT } from './skeleton';
import { ZTYPES, ZombieType } from './types';
import { S, Zombie, animateZombie } from './Zombie';

export type HitKind = 'bullet' | 'pellet' | 'explosion' | 'fire' | 'laser' | 'arrow' | 'melee' | 'energy';

export interface HitInfo {
  damage: number;
  part: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  stopping: number;
  pen: number;
  kind: HitKind;
  weapon?: string;
  headMul?: number;
  gore?: number;
  impulse?: number;
  /** Multiplier applied vs. elite (armored/brute/boss) targets. */
  eliteMul?: number;
  noBlood?: boolean;
  /** Damage already includes part/armor multipliers (aggregated pellets). */
  premult?: boolean;
  armoredHit?: boolean;
  /** Skip the wound decal (pellets place their own per pellet). */
  noWound?: boolean;
}

export interface ZombieHit {
  t: number;
  z: Zombie;
  part: number;
  /** The round meets the zombie's riot shield first. */
  shield?: boolean;
}

const PART_MUL = [1, 1, 2.5, 0.65, 0.6, 0.65, 0.6, 0.75, 0.7, 0.75, 0.7];
const TMP = new Float32Array(3);
const V3 = new Float32Array(3);
const _dir = { x: 0, z: 0 };
const _wp = new THREE.Vector3();

const CELL = 2;
const GMINX = -18;
const GMINZ = -16;
const GCOLS = 18;
const GROWS = 90;

export class ZombieManager {
  readonly list: Zombie[] = [];
  readonly flow = new FlowField();
  hpScale = 1;
  damageScale = 1;
  activeDist = 55;
  kills = 0;
  private gridHead = new Int32Array(GCOLS * GROWS).fill(-1);
  private gridNext = new Int32Array(4096);
  private inv = new Float32Array(16);
  onKill: ((z: Zombie, h: HitInfo) => void) | null = null;
  onGroan: ((z: Zombie) => void) | null = null;
  onAttack: ((z: Zombie, target: 'player' | 'struct') => void) | null = null;
  onHit: ((z: Zombie, h: HitInfo, dmg: number, armored: boolean) => void) | null = null;
  private time = 0;

  constructor(readonly renderer: BodyRenderer, readonly ragdolls: RagdollSystem) {}

  get aliveCount() {
    return this.list.length;
  }

  spawn(typeId: string, x: number, z: number, yaw = Math.PI): Zombie {
    const type = ZTYPES[typeId] ?? ZTYPES.walker;
    const zb = new Zombie(type, this.hpScale);
    zb.x = x;
    zb.z = z;
    zb.y = 0;
    zb.yaw = yaw;
    zb.index = this.list.length;
    this.list.push(zb);
    animateZombie(zb, 0, this.time);
    zb.prevPos.set(zb.partPos);
    return zb;
  }

  private bodyDims(z: Zombie) {
    const low = z.type.body.id === 'dog' || z.crawling;
    const r = (low ? 0.3 : z.type.body.radius) * z.scale;
    const hh = low ? 0 : 0.55 * z.scale;
    return { r, hh, cy: hh + r };
  }

  private makeBody(z: Zombie) {
    const world = G.physics.world;
    const { r, hh, cy } = this.bodyDims(z);
    const dom = z.type.id === 'boss' ? 3 : z.type.id === 'brute' ? 2 : 0;
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(z.x, z.y + cy + 0.02, z.z)
        .lockRotations()
        .setLinearDamping(0)
        .setDominanceGroup(dom)
        .setCanSleep(false),
    );
    const desc = hh > 0 ? RAPIER.ColliderDesc.capsule(hh, r) : RAPIER.ColliderDesc.ball(r);
    world.createCollider(desc.setMass(z.type.mass).setFriction(0).setRestitution(0).setCollisionGroups(GROUPS.zombie), rb);
    z.body = rb;
    z.physOn = true;
  }

  private dropBody(z: Zombie) {
    if (z.body) {
      try {
        G.physics.world.removeRigidBody(z.body);
      } catch {
        /* world reset */
      }
    }
    z.body = null;
    z.physOn = false;
  }

  private rebuildGrid() {
    this.gridHead.fill(-1);
    if (this.gridNext.length < this.list.length) this.gridNext = new Int32Array(this.list.length * 2);
    for (let i = 0; i < this.list.length; i++) {
      const z = this.list[i];
      z.index = i;
      const cx = clamp(Math.floor((z.x - GMINX) / CELL), 0, GCOLS - 1);
      const cz = clamp(Math.floor((z.z - GMINZ) / CELL), 0, GROWS - 1);
      const c = cz * GCOLS + cx;
      this.gridNext[i] = this.gridHead[c];
      this.gridHead[c] = i;
    }
  }

  /** Living zombies within radius of (x, z). */
  queryRadius(x: number, z: number, radius: number, out: Zombie[]) {
    out.length = 0;
    const c0x = clamp(Math.floor((x - radius - GMINX) / CELL), 0, GCOLS - 1);
    const c1x = clamp(Math.floor((x + radius - GMINX) / CELL), 0, GCOLS - 1);
    const c0z = clamp(Math.floor((z - radius - GMINZ) / CELL), 0, GROWS - 1);
    const c1z = clamp(Math.floor((z + radius - GMINZ) / CELL), 0, GROWS - 1);
    const r2 = radius * radius;
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        let i = this.gridHead[cz * GCOLS + cx];
        while (i >= 0) {
          const zb = this.list[i];
          if (zb && zb.alive) {
            const dx = zb.x - x;
            const dz = zb.z - z;
            if (dx * dx + dz * dz <= r2) out.push(zb);
          }
          i = this.gridNext[i];
        }
      }
    return out;
  }

  // -------------------------------------------------------------------------
  /** AI + steering. Runs before the physics step. */
  update(dt: number) {
    this.time += dt;
    this.rebuildGrid();
    const pl = G.player;
    const px = pl ? pl.pos.x : 0;
    const pz = pl ? pl.pos.z : 0;
    const playerAlive = pl ? pl.alive : false;
    this.flow.update(dt, px, pz);
    const structs = G.structures;
    const neigh: Zombie[] = [];

    for (let i = 0; i < this.list.length; i++) {
      const z = this.list[i];
      if (!z.alive) continue;
      const t = z.type;
      z.stateT -= dt;
      z.attackCd -= dt;
      z.spawnT += dt;
      if (z.fx.flash > 0) z.fx.flash = Math.max(0, z.fx.flash - dt * 9);
      z.updateSprings(dt);
      if (z.slowT > 0) z.slowT -= dt;
      else z.slow = 1;

      // burning
      if (z.burning > 0) {
        z.burning -= dt;
        z.fx.fire = 1;
        z.fx.burn = Math.min(0.85, z.fx.burn + dt * 0.12);
        const dmg = z.burnDps * dt;
        z.hp -= dmg;
        if (Math.random() < dt * 16) {
          const pi = Math.floor(Math.random() * PART_COUNT);
          if (z.has(pi)) G.fx?.fireAt(z.partPos[pi * 3] + rand(-0.1, 0.1), z.partPos[pi * 3 + 1] + 0.1, z.partPos[pi * 3 + 2] + rand(-0.1, 0.1), 0.7);
        }
        // spread
        if (Math.random() < dt * 1.2) {
          this.queryRadius(z.x, z.z, 1.0 * z.scale, neigh);
          for (const o of neigh) if (o !== z && o.burning <= 0 && Math.random() < 0.5) this.ignite(o, z.burnDps * 0.8, 4, z.burnSource);
        }
        if (z.hp <= 0) {
          this.kill(z, { damage: dmg, part: P.Torso, x: z.x, y: z.y + 1, z: z.z, dx: 0, dy: 0, dz: 0, stopping: 0, pen: 0, kind: 'fire', weapon: z.burnSource });
          continue;
        }
        if (z.burning <= 0) z.fx.fire = 0;
      }

      // wounded: blood drips
      if ((z.hp < z.maxHp * 0.6 || z.wounds.length > 0) && z.state !== 'down') {
        z.dripT -= dt;
        if (z.dripT <= 0) {
          z.dripT = rand(0.55, 1.2) / Math.min(2, 1 + z.wounds.length * 0.2);
          const w = z.wounds.length ? z.wounds[Math.floor(Math.random() * z.wounds.length)] : null;
          if (w && G.wounds && !(z.missing & (1 << w.part))) {
            G.wounds.worldPos(w, z.partPos, z.partQuat, _wp);
            G.fx?.drip(_wp.x, _wp.y, _wp.z);
          } else G.fx?.bloodDrip(z.x + rand(-0.2, 0.2), z.z + rand(-0.2, 0.2), 0.5 + (1 - z.hp / z.maxHp));
        }
      }
      // groans
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = rand(3.5, 9);
        this.onGroan?.(z);
      }

      if (z.state === 'down') {
        // driven by ragdoll; hold position at pelvis for queries
        const r: Ragdoll = z.ragdoll;
        if (r) {
          r.center(V3);
          z.x = V3[0];
          z.z = V3[2];
        }
        continue;
      }

      // --- physics LOD
      const dxp = px - z.x;
      const dzp = pz - z.z;
      const distP = Math.hypot(dxp, dzp);
      const nearStructs = structs ? z.z < structs.maxZ + 12 : false;
      const wantPhys = distP < this.activeDist || nearStructs;
      if (wantPhys && !z.physOn) this.makeBody(z);
      else if (!wantPhys && z.physOn && distP > this.activeDist + 8) this.dropBody(z);

      if (z.state === 'getup') {
        z.vx = 0;
        z.vz = 0;
        if (z.stateT <= 0) z.state = 'walk';
        this.applyVel(z, 0, 0, dt);
        continue;
      }
      if (z.trappedT > 0) {
        z.trappedT -= dt;
        this.applyVel(z, 0, 0, dt);
        continue;
      }
      if (z.voidT > 0) {
        // Infinite Void: endless information, no action. They stand and twitch.
        z.voidT -= dt;
        if (z.state === 'attack') z.state = 'walk';
        if (Math.random() < dt * 6) {
          z.kickSpring(S.TorsoPitch, rand(-2.5, 2.5));
          z.kickSpring(S.HeadRoll, rand(-3, 3));
          z.kickSpring(S.HeadPitch, rand(-2, 2));
        }
        this.applyVel(z, 0, 0, dt);
        continue;
      }

      // --- desired direction
      let dirX = dxp / (distP || 1);
      let dirZ = dzp / (distP || 1);
      if (!playerAlive) {
        // wander / feast around the player's body
        dirX = Math.sin(z.id + this.time * 0.2);
        dirZ = Math.cos(z.id * 1.7 + this.time * 0.15);
      } else if (t.smart && distP > 2.5) {
        if (this.flow.sample(z.x, z.z, _dir)) {
          dirX = _dir.x;
          dirZ = _dir.z;
        }
      }

      // --- attacks
      const reach = t.attackRange * Math.max(1, z.scale * 0.9);
      if (z.state === 'attack') {
        z.attackT += dt;
        const strikeAt = t.attackTime * 0.45;
        if (!z.attackHit && z.attackT >= strikeAt) {
          z.attackHit = true;
          this.strike(z, reach);
        }
        if (z.attackT >= t.attackTime) {
          z.state = 'walk';
          z.attackCd = rand(0.05, 0.3);
        }
        // face target
        let fx = dirX;
        let fz = dirZ;
        const tgt = z.attackTarget;
        if (tgt && tgt !== 'player' && tgt.x !== undefined) {
          fx = tgt.x - z.x;
          fz = tgt.z - z.z;
        }
        z.yaw = angleLerp(z.yaw, Math.atan2(fx, fz), Math.min(1, dt * 8));
        const lunge = t.gait === 'dog' ? 1.5 : 0;
        this.applyVel(z, Math.sin(z.yaw) * lunge * (z.attackT < strikeAt ? 1 : 0), Math.cos(z.yaw) * lunge * (z.attackT < strikeAt ? 1 : 0), dt);
        continue;
      }
      if (playerAlive && z.attackCd <= 0 && distP < reach + 0.4 && Math.abs(G.player.pos.y - z.y) < 1.6) {
        this.beginAttack(z, 'player');
        this.applyVel(z, 0, 0, dt);
        continue;
      }
      // blocked by a structure?
      if (structs && z.attackCd <= 0) {
        const s = structs.blockingFor(z, dirX, dirZ);
        if (s) {
          if (t.explode) {
            this.beginAttack(z, s);
          } else if (!t.smart || s.fullyBlocking || Math.random() < 0.02) {
            this.beginAttack(z, s);
            this.applyVel(z, 0, 0, dt);
            continue;
          }
        }
      }

      // --- move
      let speed = z.speed * z.slow;
      if (z.legDamage > 0) speed *= clamp(1 - (z.legDamage / z.maxHp) * 0.7, 0.35, 1);
      if (z.burning > 0) speed *= 1.25;
      if (z.spawnT < 1) speed *= z.spawnT;
      // far-off stragglers hurry up so waves arrive as a front, not a trickle
      if (z.z > ARENA.approachZ && z.speed < 3.5) speed *= 1 + Math.min(1, (z.z - ARENA.approachZ) / 30) * 1.6;
      const desiredYaw = Math.atan2(dirX, dirZ);
      const turn = t.gait === 'run' || t.gait === 'dog' ? 9 : 4.5;
      const dy = wrapAngle(desiredYaw - z.yaw);
      z.yaw += clamp(dy, -turn * dt, turn * dt);
      // move mostly where we face (zombies lumber)
      const fwdX = Math.sin(z.yaw);
      const fwdZ = Math.cos(z.yaw);
      const align = Math.max(0.2, Math.cos(dy));
      let vx = fwdX * speed * align;
      let vz = fwdZ * speed * align;
      if (!z.physOn) {
        // cheap separation for far zombies
        this.queryRadius(z.x, z.z, 0.9, neigh);
        for (const o of neigh) {
          if (o === z) continue;
          const ox = z.x - o.x;
          const oz = z.z - o.z;
          const d = Math.hypot(ox, oz) || 0.01;
          const push = (0.9 - d) * 2.5;
          vx += (ox / d) * push;
          vz += (oz / d) * push;
        }
      }
      // Infinity: the closer they get, the slower they move; they never arrive
      const inf = G.gojo?.infinityRadius ?? 0;
      if (inf > 0 && distP < inf + 0.6) {
        const nx = dxp / (distP || 1);
        const nz = dzp / (distP || 1);
        const inward = vx * nx + vz * nz;
        const k = clamp((distP - inf) / 0.6, 0, 1);
        if (inward > 0) {
          vx -= nx * inward * (1 - k * k);
          vz -= nz * inward * (1 - k * k);
        }
        if (distP < inf) {
          vx -= nx * (inf - distP) * 6;
          vz -= nz * (inf - distP) * 6;
        }
      }
      this.applyVel(z, vx, vz, dt);
    }
  }

  private applyVel(z: Zombie, vx: number, vz: number, dt: number) {
    const kd = Math.exp(-dt * 5);
    z.knockX *= kd;
    z.knockZ *= kd;
    vx += z.knockX;
    vz += z.knockZ;
    if (z.physOn && z.body) {
      const v = z.body.linvel();
      z.body.setLinvel({ x: vx, y: Math.min(v.y, 6), z: vz }, true);
    } else {
      z.x += vx * dt;
      z.z += vz * dt;
      z.x = clamp(z.x, -ARENA.halfWidth + 0.4, ARENA.halfWidth - 0.4);
      z.z = clamp(z.z, ARENA.zMin + 0.5, ARENA.zMax - 0.5);
      z.vx = vx;
      z.vz = vz;
    }
  }

  private beginAttack(z: Zombie, target: any) {
    z.state = 'attack';
    z.attackT = 0;
    z.attackHit = false;
    z.attackTarget = target;
    this.onAttack?.(z, target === 'player' ? 'player' : 'struct');
  }

  private strike(z: Zombie, reach: number) {
    const t = z.type;
    const tgt = z.attackTarget;
    if (t.explode) {
      this.kill(z, { damage: 999, part: P.Torso, x: z.x, y: z.y + 1, z: z.z, dx: 0, dy: 1, dz: 0, stopping: 0, pen: 0, kind: 'explosion' });
      return;
    }
    if (tgt === 'player') {
      const pl = G.player;
      const d = Math.hypot(pl.pos.x - z.x, pl.pos.z - z.z);
      if (pl.alive && d < reach + 0.6) {
        pl.damage(t.damage * this.damageScale, new THREE.Vector3(z.x, z.y + 1, z.z));
      }
    } else if (tgt && tgt.alive) {
      G.structures.damage(tgt, t.structDamage * this.damageScale, z);
      G.fx?.structureHit?.(tgt, z);
    }
  }

  /** Reads positions back from physics and animates. Runs after the physics step. */
  postPhysics(dt: number) {
    for (let i = 0; i < this.list.length; i++) {
      const z = this.list[i];
      if (!z.alive || z.state === 'down') continue;
      const ox = z.x;
      const oz = z.z;
      if (z.physOn && z.body) {
        const tr = z.body.translation();
        const { cy } = this.bodyDims(z);
        z.x = tr.x;
        z.z = tr.z;
        z.y = Math.max(0, tr.y - cy - 0.02);
        const v = z.body.linvel();
        z.vx = v.x;
        z.vz = v.z;
        z.vy = v.y;
        if (tr.y < -3) {
          z.body.setTranslation({ x: tr.x, y: 2, z: tr.z }, true);
        }
      }
      z.moved = Math.hypot(z.x - ox, z.z - oz);
      z.prevPos.set(z.partPos);
      animateZombie(z, dt, this.time);
    }
  }

  // -------------------------------------------------------------------------
  /** Ray vs. living (standing) zombies. One hit (nearest part) per zombie. */
  rayHits(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: ZombieHit[]) {
    for (let i = 0; i < this.list.length; i++) {
      const z = this.list[i];
      if (!z.alive || z.state === 'down') continue;
      const h = z.type.body.id === 'dog' ? 0.45 : 0.95;
      const ts = raySphere(ox, oy, oz, dx, dy, dz, z.x, z.y + h * z.scale, z.z, 1.15 * z.scale);
      if (ts < 0 || ts > maxT) continue;
      let best = Infinity;
      let bestPart = -1;
      for (let p = 0; p < PART_COUNT; p++) {
        if (!z.has(p)) continue;
        const t = this.ragdolls.rayPart(z.type.body, z.partPos, z.partQuat, z.partScale, p, ox, oy, oz, dx, dy, dz, maxT);
        if (t >= 0 && t < best) {
          best = t;
          bestPart = p;
        }
      }
      // a riot shield in the way takes the round first
      if (z.shieldHp > 0) {
        const st = this.rayShield(z, ox, oy, oz, dx, dy, dz, maxT);
        if (st >= 0 && st < best) {
          out.push({ t: st, z, part: bestPart >= 0 ? bestPart : P.Torso, shield: true });
          continue;
        }
      }
      if (bestPart >= 0) out.push({ t: best, z, part: bestPart });
    }
  }

  /** Apply a hit. Returns true if it killed. */
  /** Part/armor/elite multiplier for a hit on a part. */
  partFactor(z: Zombie, part: number, kind: HitKind, pen: number, headMul?: number, eliteMul?: number) {
    const t = z.type;
    let mul = kind === 'explosion' || kind === 'fire' ? 1 : PART_MUL[part] ?? 1;
    if (part === P.Head && headMul) mul = headMul;
    let armored = false;
    if (t.armor > 0 && t.armorParts.includes(part) && (kind === 'bullet' || kind === 'pellet' || kind === 'arrow')) {
      const f = clamp(0.15 + (0.85 * pen) / t.armor, 0.15, 1);
      mul *= f;
      armored = f < 0.7;
    }
    if (eliteMul && (t.armor > 0 || t.id === 'brute' || t.id === 'boss')) mul *= eliteMul;
    this._pf.mul = mul;
    this._pf.armored = armored;
    return this._pf;
  }
  private _pf = { mul: 1, armored: false };

  damage(z: Zombie, h: HitInfo): boolean {
    if (!z.alive) return false;
    const t = z.type;
    let mul = 1;
    let armored = !!h.armoredHit;
    if (!h.premult) {
      const pf = this.partFactor(z, h.part, h.kind, h.pen, h.headMul, h.eliteMul);
      mul = pf.mul;
      armored = pf.armored;
    }
    const dmg = h.damage * mul;
    z.hp -= dmg;
    if (!h.noWound && !armored) this.addWound(z, h, dmg);
    z.lastHitBy = h.weapon ?? h.kind;
    z.lastHitT = this.time;
    z.fx.flash = 1;
    this.onHit?.(z, h, dmg, armored);

    // blood / sparks
    if (!h.noBlood) {
      if (armored) G.fx?.sparks(h.x, h.y, h.z, -h.dx, -h.dy, -h.dz, 8);
      else if (h.kind !== 'fire') G.fx?.bloodHit(h.x, h.y, h.z, h.dx, h.dy, h.dz, clamp(dmg / 6, 0.35, 2.5), h.kind);
    }
    // body-wide blood builds slowly and stays patchy; wounds carry the per-hit detail
    if (h.kind !== 'fire') z.fx.blood = Math.min(0.45, z.fx.blood + 0.025 + dmg * 0.01);

    if (z.hp <= 0) {
      this.kill(z, { ...h, damage: dmg });
      return true;
    }
    // ---- non-lethal reactions
    const power = clamp((h.stopping / 90) * (1 - t.knockResist), 0.1, 3.5);
    // hit direction in zombie local frame
    const cy = Math.cos(-z.yaw);
    const sy = Math.sin(-z.yaw);
    const ldx = h.dx * cy + h.dz * sy;
    const ldz = -h.dx * sy + h.dz * cy;
    switch (h.part) {
      case P.Head:
        // a head wound leaves the head lolling
        z.headTilt = clamp(z.headTilt + (Math.random() < 0.5 ? -1 : 1) * 0.18, -0.75, 0.75);
        z.kickSpring(S.HeadPitch, ldz * 14 * power);
        z.kickSpring(S.HeadRoll, -ldx * 10 * power);
        z.kickSpring(S.HeadYaw, rand(-4, 4) * power);
        z.kickSpring(S.TorsoPitch, ldz * 4 * power);
        break;
      case P.UArmL:
      case P.LArmL:
        z.kickSpring(S.ArmL, -ldz * 16 * power);
        z.kickSpring(S.TorsoYaw, ldx * 3 * power + 2 * power);
        break;
      case P.UArmR:
      case P.LArmR:
        z.kickSpring(S.ArmR, -ldz * 16 * power);
        z.kickSpring(S.TorsoYaw, ldx * 3 * power - 2 * power);
        break;
      case P.ULegL:
      case P.LLegL:
        z.kickSpring(S.LegL, -ldz * 10 * power);
        z.kickSpring(S.Pelvis, ldz * 2 * power);
        z.legDamage += dmg;
        break;
      case P.ULegR:
      case P.LLegR:
        z.kickSpring(S.LegR, -ldz * 10 * power);
        z.kickSpring(S.Pelvis, ldz * 2 * power);
        z.legDamage += dmg;
        break;
      default:
        // gut shots hunch them over
        z.hunch = Math.min(0.6, z.hunch + 0.04 + dmg * 0.01);
        z.kickSpring(S.TorsoPitch, ldz * 9 * power);
        z.kickSpring(S.TorsoRoll, -ldx * 6 * power);
        z.kickSpring(S.TorsoYaw, rand(-3, 3) * power);
        z.kickSpring(S.HeadPitch, ldz * 5 * power);
        z.kickSpring(S.Pelvis, ldz * 3 * power);
    }
    // shove
    const kv = (h.stopping / 100) * 1.5 * (1 - t.knockResist);
    z.knockX += h.dx * kv;
    z.knockZ += h.dz * kv;
    if (z.state === 'attack' && power > 1.2) {
      z.state = 'walk';
      z.attackCd = 0.3;
    }
    // blowing limbs off living zombies
    const tearing = h.kind === 'pellet' || h.kind === 'bullet' || h.kind === 'laser' || h.kind === 'explosion';
    const human = t.body.id !== 'dog' && t.id !== 'boss';
    const isArm = h.part === P.UArmL || h.part === P.UArmR || h.part === P.LArmL || h.part === P.LArmR;
    const rip = (dmg / z.maxHp) * 0.5 + (h.gore ?? 0);
    if (isArm && human && tearing && dmg >= Math.max(2.5, z.maxHp * 0.22) && Math.random() < 0.35 + rip) {
      this.severLiving(z, h.part, h);
    }
    // shot-off legs: down they go, and they come back crawling
    const legHit = h.part >= P.ULegL;
    if (legHit && human && tearing && !z.crawling && z.has(h.part) && t.knockResist < 0.9 &&
      (dmg >= Math.max(2.5, z.maxHp * 0.22) || z.legDamage > z.maxHp * 0.55) && Math.random() < 0.2 + rip + (z.legDamage > z.maxHp * 0.55 ? 0.5 : 0)) {
      this.severLiving(z, h.part, h);
      z.crawling = true;
      z.speed = Math.min(z.speed, rand(0.85, 1.35));
      z.legDamage = 0;
      this.knockdown(z, h, 0.6);
      return false;
    }
    // knockdown
    const kd = h.kind === 'explosion' ? power * 0.6 : (power - 1.4) * 0.45 + (legHit && z.legDamage > z.maxHp * 0.45 ? 0.35 : 0);
    if (t.knockResist < 0.9 && Math.random() < kd) this.knockdown(z, h);
    return false;
  }

  ignite(z: Zombie, dps: number, dur: number, source = 'fire') {
    if (!z.alive) return;
    z.burning = Math.max(z.burning, dur);
    z.burnDps = Math.max(z.burnDps, dps);
    z.burnSource = source;
    z.fx.fire = 1;
  }

  private severLiving(z: Zombie, part: number, h: HitInfo) {
    // detach the whole limb chain from the hit part down
    const parts = [part];
    for (let i = 0; i < PART_COUNT; i++) if (PART_PARENT[i] === part) parts.push(i);
    let mask = 0;
    for (const p of parts) if (z.has(p)) mask |= 1 << p;
    if (!mask) return;
    z.missing |= mask;
    const r = this.ragdolls.spawn(z.type, z.skin, z.fx, z.partPos, z.partQuat, z.partScale, mask, (p, out) => {
      out[0] = z.vx + h.dx * 3 + rand(-1, 1);
      out[1] = 2 + rand(0, 2);
      out[2] = z.vz + h.dz * 3 + rand(-1, 1);
    });
    r.bleeders.push({ part, ox: 0, oy: 0, oz: 0, t: 1.2, rate: 0 });
    const parent = PART_PARENT[part];
    const px = z.partPos[part * 3];
    const py = z.partPos[part * 3 + 1];
    const pz = z.partPos[part * 3 + 2];
    G.fx?.bloodBurst(px, py, pz, 1.2);
    G.fx?.gore(px, py, pz, 4, z.skin);
    z.dripT = 0;
    void parent;
    z.armPose = 2;
    this.onSever?.(z, part);
  }
  onSever: ((z: Zombie, part: number) => void) | null = null;

  /** Non-lethal knockdown: zombie becomes a ragdoll, then gets back up. */
  knockdown(z: Zombie, h: HitInfo | null, impulseScale = 1) {
    if (!z.alive || z.state === 'down' || z.type.id === 'boss') return;
    this.dropBody(z);
    z.state = 'down';
    const mask = ALL_PARTS & ~z.missing;
    const r = this.ragdolls.spawn(z.type, z.skin, z.fx, z.partPos, z.partQuat, z.partScale, mask, (p, out) => this.partVel(z, p, out));
    r.zombie = z;
    r.wounds = z.wounds;
    r.accHidden = z.accHidden;
    z.ragdoll = r;
    if (h) this.applyHitImpulse(r, h, impulseScale);
  }

  /** Called by the ragdoll system when a knocked-down zombie has settled. */
  beginGetup(z: Zombie, r: Ragdoll) {
    if (!z.alive) return;
    z.fromPos.set(r.partPos);
    z.fromQuat.set(r.partQuat);
    // root at pelvis ground position, facing along the torso's projected forward
    r.center(V3);
    z.x = clamp(V3[0], -ARENA.halfWidth + 0.5, ARENA.halfWidth - 0.5);
    z.z = V3[2];
    z.y = Math.max(0, r.minY - 0.1);
    qRot(TMP, 0, r.partQuat, P.Torso * 4, 0, 0, 1);
    if (Math.hypot(TMP[0], TMP[2]) > 0.2) z.yaw = Math.atan2(TMP[0], TMP[2]);
    this.ragdolls.destroy(r);
    z.ragdoll = null;
    z.state = 'getup';
    z.getupDur = rand(0.9, 1.4);
    z.stateT = z.getupDur;
    z.knockX = 0;
    z.knockZ = 0;
    this.makeBody(z);
  }

  private partVel(z: Zombie, p: number, out: Float32Array) {
    out[0] = z.vx + (z.partPos[p * 3] - z.prevPos[p * 3]) * 30;
    out[1] = z.vy * 0.5 + (z.partPos[p * 3 + 1] - z.prevPos[p * 3 + 1]) * 30;
    out[2] = z.vz + (z.partPos[p * 3 + 2] - z.prevPos[p * 3 + 2]) * 30;
    // guard against teleports
    const m = Math.hypot(out[0], out[1], out[2]);
    if (m > 12) {
      out[0] *= 12 / m;
      out[1] *= 12 / m;
      out[2] *= 12 / m;
    }
  }

  private applyHitImpulse(r: Ragdoll, h: HitInfo, scale = 1) {
    const mag = (h.impulse ?? h.stopping * 0.95) * scale;
    if (mag <= 0) return;
    const ix = h.dx * mag;
    const iy = (h.dy * 0.5 + 0.12) * mag;
    const iz = h.dz * mag;
    const part = r.has(h.part) ? h.part : r.has(P.Torso) ? P.Torso : P.Pelvis;
    this.ragdolls.applyImpulse(r, part, ix * 0.6, iy * 0.6, iz * 0.6, h.x, h.y, h.z);
    if (r.has(P.Torso) && part !== P.Torso) this.ragdolls.applyImpulse(r, P.Torso, ix * 0.3, iy * 0.3, iz * 0.3);
    if (r.has(P.Pelvis)) this.ragdolls.applyImpulse(r, P.Pelvis, ix * 0.25, iy * 0.2, iz * 0.25);
  }

  private shieldIndex(z: Zombie) {
    return z.type.accessories?.findIndex((a) => a.acc === 'shield') ?? -1;
  }

  /** Shield-local ray test: returns hit distance or -1. */
  rayShield(z: Zombie, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    if (z.shieldHp <= 0) return -1;
    const pos = z.state === 'down' && z.ragdoll ? z.ragdoll.partPos : z.partPos;
    const quat = z.state === 'down' && z.ragdoll ? z.ragdoll.partQuat : z.partQuat;
    const i = P.Torso;
    const qx = quat[i * 4], qy = quat[i * 4 + 1], qz = quat[i * 4 + 2], qw = quat[i * 4 + 3];
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const r00 = 1 - (yy + zz), r10 = xy + wz, r20 = xz - wy;
    const r01 = xy - wz, r11 = 1 - (xx + zz), r21 = yz + wx;
    const r02 = xz + wy, r12 = yz - wx, r22 = 1 - (xx + yy);
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    const m = this._sm;
    m[0] = r00; m[1] = r01; m[2] = r02;
    m[4] = r10; m[5] = r11; m[6] = r12;
    m[8] = r20; m[9] = r21; m[10] = r22;
    m[12] = -(r00 * px + r10 * py + r20 * pz);
    m[13] = -(r01 * px + r11 * py + r21 * pz);
    m[14] = -(r02 * px + r12 * py + r22 * pz);
    const sc = z.scale;
    return rayOBB(ox, oy, oz, dx, dy, dz, m, 0, 0.33 * sc, 0.54 * sc, 0.045 * sc, -0.05 * sc, 0.16 * sc, 0.36 * sc, maxT);
  }
  private _sm = new Float32Array(16);

  /** A round struck the shield. Returns penetration left after it (<= 0: stopped). */
  hitShield(z: Zombie, dmg: number, pen: number, x: number, y: number, zz: number, dx: number, dz: number) {
    const sh = z.type.shield!;
    z.shieldHp -= dmg * (pen >= sh.armor ? 0.6 : 1.4);
    G.fx?.sparks(x, y, zz, -dx, 0.2, -dz, pen >= sh.armor ? 6 : 12);
    G.audio?.play('hitArmor', { x, y, z: zz, volume: 0.9, pitch: 0.8 });
    z.kickSpring(S.TorsoPitch, 1.5);
    if (z.shieldHp <= 0) this.dropShield(z, dx * 3, dz * 3);
    return pen - sh.armor;
  }

  /** Shield breaks off / falls away as a physical piece. */
  dropShield(z: Zombie, vx: number, vz: number) {
    const k = this.shieldIndex(z);
    z.shieldHp = 0;
    if (k < 0 || z.accHidden & (1 << k)) return;
    z.accHidden |= 1 << k;
    const i = P.Torso;
    const x = z.partPos[i * 3], y = z.partPos[i * 3 + 1] + 0.15, zz = z.partPos[i * 3 + 2];
    const fwx = Math.sin(z.yaw), fwz = Math.cos(z.yaw);
    G.fx?.splinters?.spawn(x + fwx * 0.35, y, zz + fwz * 0.35, vx + fwx, rand(1, 2.5), vz + fwz, 0.6, 1.0, 0.05, 0x6d8090);
    G.fx?.sparks(x + fwx * 0.35, y, zz + fwz * 0.35, fwx, 0.5, fwz, 14);
    G.audio?.play('structBreak_metal', { x, y, z: zz, volume: 0.8 });
    if (z.armPose === 4) z.armPose = 0; // now it reaches for you
  }

  /** Pins a wound decal where a projectile struck (entry, or exit when it passes through). */
  addWound(z: Zombie, h: HitInfo, dmg: number, exit = false) {
    if (!G.wounds) return;
    const kind = exit ? (h.kind === 'bullet' ? 'exit' : null) : woundKindFor(h.kind, dmg, h.stopping);
    if (!kind) return;
    const down = z.state === 'down' && z.ragdoll;
    const r: Ragdoll | null = down ? z.ragdoll : null;
    const pos = r ? r.partPos : z.partPos;
    const quat = r ? r.partQuat : z.partQuat;
    const scl = r ? r.partScale : z.partScale;
    G.wounds.add(z.wounds, z.type.body, pos, quat, scl, h.part, h.x, h.y, h.z, h.dx, h.dy, h.dz, kind);
  }

  kill(z: Zombie, h: HitInfo) {
    if (!z.alive) return;
    z.alive = false;
    z.fx.eyes = 0;
    this.kills++;
    const wasDown = z.state === 'down' && z.ragdoll;
    let r: Ragdoll;
    if (wasDown) {
      r = z.ragdoll;
      r.zombie = null;
      r.fx.blood = z.fx.blood;
      r.fx.burn = z.fx.burn;
      z.ragdoll = null;
    } else {
      this.dropBody(z);
      const mask = ALL_PARTS & ~z.missing;
      r = this.ragdolls.spawn(z.type, z.skin, z.fx, z.partPos, z.partQuat, z.partScale, mask, (p, out) => this.partVel(z, p, out));
    }
    r.wounds = z.wounds;
    if (z.shieldHp > 0) this.dropShield(z, h.dx * 2, h.dz * 2);
    r.accHidden = z.accHidden;
    z.deathRagdoll = r;
    if (z.burning > 0) r.fireT = Math.max(r.fireT, 3 + Math.random() * 3);
    // gore
    const headshot = h.part === P.Head;
    if (headshot && r.has(P.Head) && h.kind !== 'fire' && (h.damage >= 6 || h.kind === 'pellet' || Math.random() < 0.35 || h.stopping >= 150)) {
      const hx = z.partPos[P.Head * 3], hy = z.partPos[P.Head * 3 + 1] + 0.15 * z.scale, hz = z.partPos[P.Head * 3 + 2];
      this.ragdolls.removePart(r, P.Head);
      G.fx?.headPop(hx, hy, hz, h.dx, h.dy, h.dz, z.skin);
      this.onHeadPop?.(z);
    }
    const isLimb = h.part >= P.UArmL && h.part !== P.Head;
    if (isLimb && h.kind !== 'fire' && (h.damage >= 5 || h.stopping >= 150) && Math.random() < 0.6 + (h.gore ?? 0) && r.joints[h.part]) {
      this.ragdolls.sever(r, h.part);
      G.fx?.gore(h.x, h.y, h.z, 3, z.skin);
    }
    if (h.kind !== 'explosion') this.applyHitImpulse(r, h);
    if (h.kind === 'fire') G.fx?.bloodBurst(z.x, z.y + 1, z.z, 0.2);
    else if (!h.noBlood) G.fx?.bloodBurst(h.x, h.y, h.z, clamp(h.damage / 10, 0.4, 1.5));
    this.remove(z);
    this.onKill?.(z, h);
    if (z.type.explode) {
      const e = z.type.explode;
      G.explosions?.explode(z.x, z.y + 0.9 * z.scale, z.z, e.radius, e.damage, { source: 'zombie', structures: true, player: true, gore: 1, big: true });
    }
  }
  onHeadPop: ((z: Zombie) => void) | null = null;

  /** Erased from existence (Hollow Purple): no ragdoll, no corpse, still counts as a kill. */
  vaporize(z: Zombie, h: HitInfo) {
    if (!z.alive) return;
    z.alive = false;
    z.fx.eyes = 0;
    this.kills++;
    this.dropBody(z);
    if (z.ragdoll) this.ragdolls.destroy(z.ragdoll);
    z.ragdoll = null;
    this.remove(z);
    this.onKill?.(z, h);
  }

  private remove(z: Zombie) {
    const i = this.list.indexOf(z);
    if (i >= 0) {
      const last = this.list.pop()!;
      if (last !== z) this.list[i] = last;
    }
  }

  /**
   * Explosion damage vs. living zombies (VFX handled by the Explosions module).
   */
  explode(x: number, y: number, z: number, radius: number, damage: number, gore = 0.5, source = 'explosion') {
    const hits: Zombie[] = [];
    this.queryRadius(x, z, radius + 1, hits);
    for (const zb of hits) {
      if (!zb.alive) continue;
      const cx = zb.x;
      const cyy = zb.y + 0.9 * zb.scale;
      const cz = zb.z;
      const dx = cx - x;
      const dy = cyy - y;
      const dz = cz - z;
      const d = Math.hypot(dx, dy * 0.6, dz);
      if (d > radius) continue;
      const f = Math.pow(1 - d / radius, 0.7);
      const inv = 1 / Math.max(0.2, d);
      const h: HitInfo = {
        damage: damage * f,
        part: P.Torso,
        x: cx,
        y: cyy,
        z: cz,
        dx: dx * inv,
        dy: Math.max(0.3, dy * inv),
        dz: dz * inv,
        stopping: 400 * f,
        pen: 200,
        kind: 'explosion',
        weapon: source,
        noBlood: true,
      };
      const wasDown = zb.state === 'down';
      const killed = this.damage(zb, h);
      if (killed) {
        // the ragdoll was just created; find it (last spawned for this zombie)
        const r = this.ragdolls.active[this.ragdolls.active.length - 1];
        if (r && zb.type.id !== 'boss') this.dismember(r, f, gore, zb);
      } else if (!wasDown && zb.alive && f > 0.25 && zb.type.knockResist < 0.9) {
        this.knockdown(zb, null);
      }
    }
  }

  /** Explosive dismemberment on a fresh corpse. */
  dismember(r: Ragdoll, f: number, gore: number, zb: Zombie) {
    const cx = zb.x, cy = zb.y + 1, cz = zb.z;
    if (f > 0.82 && Math.random() < 0.55 + gore * 0.3 && zb.type.id !== 'brute') {
      // blown apart: every joint snaps
      for (let i = 1; i < PART_COUNT; i++) if (r.joints[i]) this.ragdolls.sever(r, i, i === P.Head || Math.random() < 0.4);
      if (r.has(P.Head) && Math.random() < 0.5) {
        this.ragdolls.removePart(r, P.Head);
        G.fx?.headPop(cx, cy + 0.6, cz, 0, 1, 0, zb.skin);
      }
      G.fx?.gore(cx, cy, cz, 14 + Math.round(gore * 10), zb.skin);
      G.fx?.bloodBurst(cx, cy, cz, 3);
      return;
    }
    const limbs = [P.UArmL, P.UArmR, P.ULegL, P.ULegR, P.LArmL, P.LArmR, P.LLegL, P.LLegR, P.Head];
    const n = Math.floor(f * (2 + gore * 3) * Math.random() + (f > 0.5 ? 1 : 0));
    for (let k = 0; k < n; k++) {
      const p = limbs[Math.floor(Math.random() * limbs.length)];
      if (r.joints[p]) {
        this.ragdolls.sever(r, p);
        G.fx?.gore(cx, cy, cz, 3, zb.skin);
      }
    }
    G.fx?.bloodBurst(cx, cy, cz, 1 + f * 2);
  }

  /** Brief stagger from being hit by a flying body etc. */
  bump(z: Zombie, dx: number, dz: number, strength: number) {
    if (!z.alive || z.state === 'down') return;
    z.knockX += dx * strength * (1 - z.type.knockResist);
    z.knockZ += dz * strength * (1 - z.type.knockResist);
    z.kickSpring(S.TorsoPitch, -4 * strength);
    z.kickSpring(S.Pelvis, 2 * strength);
    if (strength > 2.5 && Math.random() < 0.35) this.knockdown(z, null);
  }

  /** Flying ragdolls knock over living zombies they slam into. */
  ragdollCollisions() {
    const near: Zombie[] = [];
    for (const r of this.ragdolls.active) {
      if (r.age > 1.5) continue;
      const b = r.bodies[P.Torso] ?? r.bodies[P.Pelvis];
      if (!b) continue;
      const v = b.linvel();
      const sp = Math.hypot(v.x, v.z);
      if (sp < 3.5) continue;
      const t = b.translation();
      if (t.y > 2.2) continue;
      this.queryRadius(t.x, t.z, 0.9, near);
      for (const z of near) {
        if (z.ragdoll === r) continue;
        this.bump(z, v.x / sp, v.z / sp, sp * 0.45);
      }
    }
  }

  /** Draws wounds on living zombies and fresh ragdolls (corpses are baked). */
  renderWounds() {
    const W = G.wounds;
    if (!W) return;
    W.beginFrame();
    for (const z of this.list) {
      if (!z.alive || z.wounds.length === 0) continue;
      if (z.state === 'down' && z.ragdoll) W.push(z.wounds, z.ragdoll.partPos, z.ragdoll.partQuat, z.ragdoll.mask);
      else W.push(z.wounds, z.partPos, z.partQuat, ALL_PARTS & ~z.missing);
    }
    for (const r of this.ragdolls.active) if (!r.zombie) W.push(r.wounds, r.partPos, r.partQuat, r.mask);
    W.endFrame();
  }

  render() {
    const rend = this.renderer;
    const hide = G.gojo?.domainHides as ((x: number, z: number) => boolean) | undefined;
    for (const z of this.list) {
      if (!z.alive) continue;
      if (hide && hide(z.x, z.z)) continue;
      if (z.state === 'down' && z.ragdoll) {
        const r: Ragdoll = z.ragdoll;
        pushBody(rend, z.type, z.skin, z.fx, r.partPos, r.partQuat, r.partScale, r.mask, z.accHidden);
      } else {
        pushBody(rend, z.type, z.skin, z.fx, z.partPos, z.partQuat, z.partScale, ALL_PARTS & ~z.missing, z.accHidden);
      }
    }
  }

  /** Silently removes one zombie (no ragdoll, no reward). */
  clearOne(z: Zombie) {
    this.dropBody(z);
    if (z.ragdoll) this.ragdolls.destroy(z.ragdoll);
    z.ragdoll = null;
    z.alive = false;
    this.remove(z);
  }

  /** Removes every zombie (new day / reset). */
  clear() {
    for (const z of this.list) {
      this.dropBody(z);
      if (z.ragdoll) this.ragdolls.destroy(z.ragdoll);
      z.alive = false;
    }
    this.list.length = 0;
  }

  nearest(x: number, z: number, maxDist: number, filter?: (z: Zombie) => boolean): Zombie | null {
    let best: Zombie | null = null;
    let bd = maxDist * maxDist;
    for (const zb of this.list) {
      if (!zb.alive) continue;
      if (filter && !filter(zb)) continue;
      const d = (zb.x - x) ** 2 + (zb.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = zb;
      }
    }
    return best;
  }
}

export { chance };
