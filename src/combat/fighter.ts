import * as THREE from 'three';
import { Animator, PlayOptions } from '../anim/animator';
import { AimPoint, AimProvider, Clip, ClipEvent, ClipPlayer, CLIPS, getClip } from '../anim/clip';
import { B, BONE_COUNT, SkeletonDef } from '../anim/skeleton';
import { CharacterLibrary, CharacterModel, Variant } from '../character/library';
import { Wound } from '../character/material';
import { angleDiff, clamp, rotY, wrapAngle, yawFromDir } from '../core/math';
import { HitInfo, HitResult } from './types';
import type { Game } from '../game';
import type { RagdollLike } from '../world/ragdollTypes';
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
const _feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
const _feetYaw: [number, number] = [0, 0];

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
  /** Seconds of gentle separation left: just let go from a paired move, maybe still overlapping. */
  sepSoft = 0;
  /** Seconds walking since the last move / ragdoll (its collision fills back in; see move). */
  private locoAge = 1;
  /** Ignore wall collisions (e.g. entering through door). */
  ghostWalls = false;
  bleedRate = 0; // drops per second while bleeding
  bleedTimer = 0;
  brokenArm = 0; // 1 left, -1 right
  brokenLeg = 0;
  scale = 1;
  ragdoll: RagdollLike | null = null;
  /** Render height offset (climbing up onto the roof); the simulation stays on the floor. */
  lift = 0;
  weapon: Weapon | null = null;
  abstract team: 'player' | 'enemy' | 'neutral';

  constructor(public game: Game, lib: CharacterLibrary, public variant: Variant) {
    this.model = new CharacterModel(lib, variant);
    this.def = variant.def;
    this.anim = new Animator(this.def, this.model);
    const ground = (x: number, z: number) => this.game.corpses?.heightAt(x, z) ?? 0;
    this.anim.ground = ground;
    this.anim.loco.ground = ground;
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
      const b = PARTNER_BONES[p];
      if (b === undefined) return false;
      const partner = this.paired;
      const cached = this.aimCache.get(p);
      // a partner thrown or knocked into a ragdoll mid-move no longer follows the paired track:
      // hold the point where it was let go, so the hands ease off instead of jumping (a body that
      // was already on the floor when the move began is tracked live)
      const mode = partner?.anim.mode;
      const physical = mode === 'external' || mode === 'frozen';
      const wasAnimated = this.aimLiveMode !== null && this.aimLiveMode !== 'external' && this.aimLiveMode !== 'frozen';
      if (!partner || (physical && wasAnimated)) {
        if (!cached) return false;
        out.copy(cached);
        return true;
      }
      partner.anim.boneWorld(b, out);
      if (cached) cached.copy(out);
      else this.aimCache.set(p, out.clone());
      this.aimLiveMode = mode ?? null;
      return true;
    }
    return this.bodyPoint(p, out);
  }
  /** Last partner points seen during a paired move (held once the partner is released). */
  private aimCache = new Map<string, THREE.Vector3>();
  private aimLiveMode: string | null = null;
  /** Forget partner points (a new paired move begins). */
  clearAimCache() {
    this.aimCache.clear();
    this.aimLiveMode = null;
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
  play(name: string, opt: PlayOptions & { target?: Fighter | null; reach?: number; maxWarp?: number; faceTarget?: boolean; back?: boolean; anySide?: boolean } = {}): ClipPlayer {
    let originYaw = opt.originYaw ?? this.yaw;
    const target = opt.target ?? null;
    if (target && opt.faceTarget !== false) {
      const dirYaw = yawFromDir(target.x - this.x, target.z - this.z);
      originYaw = opt.back ? wrapAngle(dirYaw + Math.PI) : dirYaw;
    }
    let clip = getClip(name);
    // (hand-made clips whose footwork depends on the stance - the back moves - ask for it: anySide)
    if ((clip.footFromStart && opt.anySide !== false) || opt.anySide === true) clip = this.stanceVariant(clip, originYaw, opt.originX ?? this.x, opt.originZ ?? this.z);
    const p = this.anim.playClip(clip, { ...opt, originYaw, originX: opt.originX ?? this.x, originZ: opt.originZ ?? this.z, aim: opt.aim ?? this.aimAt(target) });
    if (target && opt.reach !== undefined && clip.warp) {
      // a captured strike moves the body no further than a real lunge (its feet step with it);
      // the rest of any distance is walked or run first, never slid
      const cap = clip.footFromStart ? clip.lunge : Infinity;
      this.warpTo(p, target, opt.reach, Math.min(cap, opt.maxWarp ?? 3.5), !!opt.back);
    }
    return p;
  }

  /**
   * A captured clip starts in the capture's stance. Of the clip and its mirror, the one whose feet
   * start nearer to where this fighter stands plays - a jab comes off whichever hand leads now -
   * so the feet never have to swap places to begin a move.
   */
  private stanceVariant(clip: Clip, originYaw: number, ox: number, oz: number): Clip {
    const alt = CLIPS.get(clip.name.endsWith('_m') ? clip.name.slice(0, -2) : clip.name + '_m');
    if (!alt || alt.footFromStart !== clip.footFromStart) return clip;
    this.anim.currentFeet(_feet, _feetYaw);
    const cost = (c: Clip) => {
      let sum = 0;
      for (let side = 0; side < 2; side++) {
        const f = side === 0 ? c.keys[0].lf : c.keys[0].rf;
        const [rx, rz] = rotY(f.p[0] * this.scale, f.p[2] * this.scale, originYaw);
        sum += (ox + rx - _feet[side].x) ** 2 + (oz + rz - _feet[side].z) ** 2;
      }
      return sum;
    };
    return cost(alt) < cost(clip) * 0.7 ? alt : clip;
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
    const w: Wound = { pos: bind, radius: radius * this.scale, type, intensity, drip, seed: Math.random() * 50, born: this.game.time };
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
      // A move keeps a slimmer collision than walking (and passes props), so a body can come out of
      // one a hand's width inside a wall or a crate: the full body fills back in over a quarter
      // second instead of being snapped out by that width in one frame.
      this.locoAge += dt;
      const fill = Math.min(1, this.locoAge / 0.25);
      const [cx, cz] = this.game.arena.collide(this.x, this.z, this.radius * (0.8 + 0.2 * fill), this.ghostWalls);
      this.x = cx;
      this.z = cz;
      // (couches, carts and drums are walked round, not through)
      this.game.props?.collideFighter(this, fill);
    }
    if (this.anim.mode !== 'loco') this.locoAge = 0;
  }

  /**
   * Displace the root (collision separation). A clip carries the offset in its root correction,
   * so its world-planted feet stay where they are instead of sliding with the body.
   */
  shove(dx: number, dz: number) {
    this.x += dx;
    this.z += dz;
    const c = this.anim.mode === 'clip' ? this.anim.clip : null;
    if (c) {
      c.blockX += dx;
      c.blockZ += dz;
      c.computeRoot();
    }
  }

  /** Pose + render transform. */
  animate(dt: number) {
    if (this.anim.mode === 'loco') {
      this.anim.locoIn.velX = this.vx;
      this.anim.locoIn.velZ = this.vz;
    }
    this.anim.update(dt, this.x, this.z, this.yaw);
    this.model.group.position.set(this.x, this.lift, this.z);
    this.model.group.rotation.y = this.yaw;
    this.model.secondary(dt);
    this.model.syncWounds(this.game.time);
  }

  /** Local direction helpers. */
  localDir(dx: number, dz: number): [number, number] {
    return rotY(dx, dz, -this.yaw);
  }
}
