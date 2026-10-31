import * as THREE from 'three';
import { Animator, PlayOptions } from '../anim/animator';
import { AimPoint, AimProvider, ClipEvent, ClipPlayer, getClip } from '../anim/clip';
import { B, BONE_COUNT, SkeletonDef } from '../anim/skeleton';
import { CharacterLibrary, CharacterModel, Variant } from '../character/library';
import { Wound } from '../character/material';
import { angleDiff, clamp, rotY, wrapAngle, yawFromDir } from '../core/math';
import { HitInfo, HitResult } from './types';
import type { Game } from '../game';
import type { Ragdoll } from '../world/ragdoll';
import type { Weapon } from './weapons';

let NEXT_ID = 1;

const AIM_LOCAL: Record<string, [number, [number, number, number]]> = {
  head: [B.head, [0, 0.07, 0.07]],
  jaw: [B.head, [0, -0.01, 0.08]],
  neck: [B.neck, [0, 0.03, 0.04]],
  chest: [B.chest, [0, 0.06, 0.11]],
  gut: [B.spine, [0, 0.0, 0.12]],
  hips: [B.hips, [0, 0, 0.08]],
  back: [B.chest, [0, 0.05, -0.12]],
  knee: [B.shinL, [0, 0, 0.06]],
  legs: [B.thighL, [0, -0.25, 0.08]],
};
const PARTNER_BONES: Record<string, number> = {
  'p.head': B.head, 'p.neck': B.neck, 'p.chest': B.chest, 'p.hips': B.hips, 'p.handL': B.handL, 'p.handR': B.handR,
  'p.farmL': B.farmL, 'p.farmR': B.farmR, 'p.footL': B.footL, 'p.footR': B.footR, 'p.shinL': B.shinL, 'p.shinR': B.shinR,
  'p.uarmL': B.uarmL, 'p.uarmR': B.uarmR,
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export abstract class Fighter implements AimProvider {
  id = NEXT_ID++;
  model: CharacterModel;
  anim: Animator;
  def: SkeletonDef;
  x = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  radius = 0.38;
  hp = 100;
  maxHp = 100;
  alive = true;
  /** Logical state name (subclass specific). */
  state = 'idle';
  stateTime = 0;
  /** Seconds of invulnerability remaining (i-frames). */
  invuln = 0;
  /** Seconds remaining that this fighter cannot act (hitstun). */
  stun = 0;
  /** Character is on the ground / in ragdoll. */
  down = false;
  /** Fighter is locked in a paired animation (counter/finisher/grab). */
  paired: Fighter | null = null;
  /** Hit-stop remaining (frozen). */
  freeze = 0;
  /** Corpse/ragdoll lifecycle handled elsewhere when dead. */
  dead = false;
  /** Collision against other fighters enabled. */
  solid = true;
  /** Ignore wall collisions (e.g. entering through door). */
  ghostWalls = false;
  bleedRate = 0; // drops per second while bleeding
  bleedTimer = 0;
  brokenArm = 0; // 1 left, -1 right
  brokenLeg = 0;
  scale = 1;
  ragdoll: Ragdoll | null = null;
  weapon: Weapon | null = null;
  abstract team: 'player' | 'enemy';

  constructor(public game: Game, lib: CharacterLibrary, public variant: Variant) {
    this.model = new CharacterModel(lib, variant);
    this.def = variant.def;
    this.anim = new Animator(this.def, this.model);
    this.scale = this.def.scale;
    this.radius = 0.36 * this.def.scale * Math.max(1, this.def.spec.bulk * 0.95);
  }

  spawn(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.anim.initAt(x, z, yaw);
    this.model.group.position.set(x, 0, z);
    this.model.group.rotation.y = yaw;
    this.game.scene.add(this.model.group);
  }

  // ------------------------------------------------------------------ aim
  aimPoint(p: AimPoint, out: THREE.Vector3): boolean {
    if (p.startsWith('p.')) {
      const partner = this.paired;
      if (!partner) return false;
      const b = PARTNER_BONES[p];
      if (b === undefined) return false;
      partner.anim.boneWorld(b, out);
      return true;
    }
    return this.bodyPoint(p, out);
  }
  /** World position of a body point of THIS fighter. */
  bodyPoint(p: string, out: THREE.Vector3): boolean {
    const a = AIM_LOCAL[p];
    if (!a) return false;
    _v.set(a[1][0], a[1][1], a[1][2]).multiplyScalar(this.scale);
    this.anim.boneLocalToWorld(a[0], _v, out);
    return true;
  }
  /** Aim provider that resolves target points on `target` and partner points on `partner`. */
  aimAt(target: Fighter | null): AimProvider {
    const self = this;
    return {
      aimPoint(p: AimPoint, out: THREE.Vector3) {
        if (p.startsWith('p.')) return self.aimPoint(p, out);
        if (!target) return false;
        return target.bodyPoint(p, out);
      },
    };
  }

  // ------------------------------------------------------------------ animation helpers
  /**
   * Play a clip. If `target` is given the clip is oriented towards it and root-warped so contact happens
   * at `reach` meters (distance between roots).
   */
  play(name: string, opt: PlayOptions & { target?: Fighter | null; reach?: number; maxWarp?: number; faceTarget?: boolean; back?: boolean } = {}): ClipPlayer {
    const clip = getClip(name);
    let originYaw = opt.originYaw ?? this.yaw;
    const target = opt.target ?? null;
    if (target && opt.faceTarget !== false) {
      const dirYaw = yawFromDir(target.x - this.x, target.z - this.z);
      originYaw = opt.back ? wrapAngle(dirYaw + Math.PI) : dirYaw;
    }
    const p = this.anim.playClip(clip, { ...opt, originYaw, originX: opt.originX ?? this.x, originZ: opt.originZ ?? this.z, aim: opt.aim ?? this.aimAt(target) });
    if (target && opt.reach !== undefined && clip.warp) {
      this.warpTo(p, target, opt.reach, opt.maxWarp ?? 3.5, !!opt.back);
    }
    return p;
  }

  /** Compute warp so that at the clip's warp end the root is `reach` from target. */
  warpTo(p: ClipPlayer, target: Fighter, reach: number, maxWarp: number, back = false) {
    const clip = p.clip;
    if (!clip.warp) return;
    const tEnd = clip.warp[1];
    // predict target position a bit ahead
    const lead = Math.min(0.25, tEnd);
    const tx = target.x + target.vx * lead, tz = target.z + target.vz * lead;
    const r = p.rootAt(tEnd, { x: 0, z: 0, yaw: 0 });
    // desired root at contact
    let dx = r.x - tx, dz = r.z - tz;
    let d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      dx = -Math.sin(p.originYaw);
      dz = -Math.cos(p.originYaw);
      d = 1;
    }
    let wantX: number, wantZ: number;
    if (back) {
      // for back attacks the target is behind the authored contact point: aim the authored offset onto target
      wantX = tx + (dx / d) * reach;
      wantZ = tz + (dz / d) * reach;
    } else {
      // approach along the line from origin to target
      const ox = p.originX - tx, oz = p.originZ - tz;
      const od = Math.hypot(ox, oz) || 1;
      wantX = tx + (ox / od) * reach;
      wantZ = tz + (oz / od) * reach;
    }
    let wx = wantX - r.x, wz = wantZ - r.z;
    const wl = Math.hypot(wx, wz);
    if (wl > maxWarp) {
      wx *= maxWarp / wl;
      wz *= maxWarp / wl;
    }
    p.setWarp(wx, wz, 0, this.def);
  }

  get clip() {
    return this.anim.mode === 'clip' ? this.anim.clip : null;
  }
  clipTime() {
    return this.clip?.time ?? 0;
  }

  distTo(o: Fighter) {
    return Math.hypot(o.x - this.x, o.z - this.z);
  }
  /** Signed angle from this fighter's facing to the direction of o. */
  angleTo(o: Fighter) {
    return angleDiff(this.yaw, yawFromDir(o.x - this.x, o.z - this.z));
  }
  faceTowards(x: number, z: number, rate: number, dt: number) {
    const want = yawFromDir(x - this.x, z - this.z);
    const d = angleDiff(this.yaw, want);
    const step = rate * dt;
    this.yaw = wrapAngle(this.yaw + clamp(d, -step, step));
  }

  // ------------------------------------------------------------------ wounds
  /** Add a wound at a world point; finds nearest bone and converts to bind-pose space. */
  woundAt(world: THREE.Vector3, type: 0 | 1 | 2, radius: number, intensity: number, drip = 0) {
    let best = -1;
    let bd = Infinity;
    for (let i = 1; i < BONE_COUNT; i++) {
      this.anim.boneWorld(i, _v);
      const d = _v.distanceToSquared(world);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return;
    this.anim.boneWorldRot(best, _q);
    this.anim.boneWorld(best, _v);
    _v2.copy(world).sub(_v).applyQuaternion(_q.invert());
    // clamp local offset so wounds stay on the body surface region of that bone
    if (_v2.length() > 0.25 * this.scale) _v2.setLength(0.25 * this.scale);
    const bind = this.def.rest[best].clone().add(_v2);
    const w: Wound = { pos: bind, radius: radius * this.scale, type, intensity, drip, seed: Math.random() * 50 };
    this.model.addWound(w);
  }

  // ------------------------------------------------------------------ per-frame
  /** Logic update (subclass). Movement intent goes into vx/vz or clips. */
  abstract think(dt: number): void;
  /** Handle a clip event (hits etc.). */
  abstract onEvent(ev: ClipEvent): void;
  abstract takeHit(h: HitInfo): HitResult;

  /** Integrate root motion / velocity and resolve collisions. Called after think(). */
  move(dt: number) {
    if (this.anim.mode === 'clip' && this.anim.clip) {
      const c = this.anim.clip;
      this.anim.advanceClip(dt);
      for (const ev of this.anim.events) this.onEvent(ev);
      // the clip may have been replaced by an event handler
      const c2 = this.anim.clip;
      if (this.anim.mode === 'clip' && c2) {
        if (c2 !== c) c2.computeRoot();
        let nx = c2.rootX, nz = c2.rootZ;
        const [cx, cz] = this.game.arena.collide(nx, nz, this.radius * 0.8, this.ghostWalls);
        if (cx !== nx || cz !== nz) {
          c2.blockX += cx - nx;
          c2.blockZ += cz - nz;
          nx = cx;
          nz = cz;
        }
        this.vx = (nx - this.x) / Math.max(dt, 1e-4);
        this.vz = (nz - this.z) / Math.max(dt, 1e-4);
        this.x = nx;
        this.z = nz;
        this.yaw = c2.rootYaw;
      }
    } else if (this.anim.mode === 'loco') {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const [cx, cz] = this.game.arena.collide(this.x, this.z, this.radius, this.ghostWalls);
      this.x = cx;
      this.z = cz;
    }
  }

  /** Pose + render transform. */
  animate(dt: number) {
    if (this.anim.mode === 'loco') {
      this.anim.locoIn.velX = this.vx;
      this.anim.locoIn.velZ = this.vz;
    }
    this.anim.update(dt, this.x, this.z, this.yaw);
    this.model.group.position.set(this.x, 0, this.z);
    this.model.group.rotation.y = this.yaw;
    this.model.syncWounds();
  }

  /** Local direction helpers. */
  localDir(dx: number, dz: number): [number, number] {
    return rotY(dx, dz, -this.yaw);
  }
}
