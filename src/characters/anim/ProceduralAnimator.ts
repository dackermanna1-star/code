// Procedural pose layer applied after the clip mixer, in world space, rig-agnostic:
//   stance synthesis (crouch / prone / knocked when clips are missing), lower-body orientation for
//   forward-only clip sets, aim offset over the spine, lean, foot IK on slopes/stairs, jump/land, hit
//   reactions. Weapon holding & gestures live in WeaponPose, special states in SpecialPoses.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { clamp, lerp, smoothstep, wrapAngle, DEG } from '../../core/math';
import { Mask } from '../../core/Physics';
import type { Character } from '../Character';
import type { Rig, Side } from './Rig';
import { PoseContext } from './PoseContext';
import { applyTwoBoneIK, aimBone, worldPos, worldQuat, setWorldQuat } from './IK';
import type { LocoOutput } from './Locomotion';
import type { HitReaction } from './types';
import { STANCE_HEIGHT, LEAN_OFFSET } from '../constants';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);

export interface AnimFrameState {
  dt: number;
  /** Visual (root) yaw of the body. */
  bodyYaw: number;
  /** View angles used for aiming (render-rate for the player). */
  aimYaw: number;
  aimPitch: number;
  loco: LocoOutput;
  /** Whether this character is close enough for foot IK raycasts. */
  near: boolean;
}

interface FootState {
  offset: number;
  normal: THREE.Vector3;
}

export class ProceduralAnimator {
  readonly pc: PoseContext;
  private readonly c: Character;
  private readonly rig: Rig;
  // smoothed values
  private hipYaw = 0;
  private pelvisDip = 0;
  private pelvisDipVel = 0;
  private lastLand = -10;
  private readonly feet: Record<Side, FootState> = {
    L: { offset: 0, normal: new THREE.Vector3(0, 1, 0) },
    R: { offset: 0, normal: new THREE.Vector3(0, 1, 0) },
  };
  private pelvisOffset = 0;
  // hit reaction spring (axis-angle on the upper body)
  private readonly hitAxis = new THREE.Vector3(1, 0, 0);
  private hitAngle = 0;
  private hitVel = 0;
  private readonly footPos: Record<Side, THREE.Vector3> = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private readonly footQuat: Record<Side, THREE.Quaternion> = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
  /** Lean roll (rad) per unit lean, computed from the rig so the eye moves LEAN_OFFSET. */
  private leanRoll = 0.5;
  crawlPhase = 0;

  constructor(c: Character, rig: Rig) {
    this.c = c;
    this.rig = rig;
    this.pc = new PoseContext(rig);
    const rp = rig.restPos;
    if (rp.spine && rp.head) {
      const L = Math.max(0.3, rp.head.y - rp.spine.y);
      this.leanRoll = Math.asin(clamp(LEAN_OFFSET / L, 0, 0.9));
    }
  }

  /** Blend weights for stance synthesis from the continuous stance height. */
  stanceWeights(): { crouch: number; prone: number } {
    const h = this.c.stanceHeight;
    const prone = clamp((STANCE_HEIGHT.crouch - h) / (STANCE_HEIGHT.crouch - STANCE_HEIGHT.prone), 0, 1);
    const crouch = clamp((STANCE_HEIGHT.stand - h) / (STANCE_HEIGHT.stand - STANCE_HEIGHT.crouch), 0, 1) * (1 - prone);
    return { crouch, prone };
  }

  hit(r: HitReaction): void {
    // Upper body flinches away from the hit direction.
    const dir = r.direction;
    const amt = clamp(r.amount / 40, 0.15, 1);
    if (dir && dir.lengthSq() > 1e-6) {
      _a.copy(dir).setY(0).normalize();
      this.hitAxis.crossVectors(_up, _a).normalize();
    } else {
      this.hitAxis.copy(this.pc.right).negate();
    }
    this.hitVel += amt * (r.zone === 'head' ? 9 : 6);
  }

  /** Record the clip foot transforms (before pelvis edits) so legs can be re-solved to them. */
  captureFeet(): void {
    for (const s of ['L', 'R'] as const) {
      const f = this.rig.bones[`foot${s}`];
      if (!f) continue;
      worldPos(f, this.footPos[s]);
      worldQuat(f, this.footQuat[s]);
    }
  }

  /** Ground-locomotion procedural pass (stand / crouch / prone / knocked). */
  applyGround(st: AnimFrameState): void {
    const c = this.c;
    const pc = this.pc;
    const dt = st.dt;
    const R = this.rig.bones;
    if (!R.hips) return;
    const { crouch, prone } = this.stanceWeights();
    const knocked = c.lifeState === 'knocked';
    const moving = 1 - st.loco.idleWeight;

    // ── lower-body orientation (forward-only clip sets) ──
    const wantHip = st.loco.forwardOnly && !st.loco.synthProne && !knocked ? st.loco.hipYaw * moving : 0;
    this.hipYaw += (wantHip - this.hipYaw) * Math.min(1, dt * 10);

    // ── pelvis: landing dip spring ──
    if (c.lastLandTime > this.lastLand + 0.01) {
      this.lastLand = c.lastLandTime;
      this.pelvisDipVel -= clamp(c.lastLandImpact * 0.09, 0, 1.4);
    }
    const k = 120, d = 18;
    this.pelvisDipVel += (-k * this.pelvisDip - d * this.pelvisDipVel) * dt;
    this.pelvisDip = clamp(this.pelvisDip + this.pelvisDipVel * dt, -0.3, 0.05);

    // ── stance synthesis ──
    const synthCrouch = st.loco.synthCrouch || (st.loco.synthProne && crouch > 0);
    if (knocked) {
      this.applyKnocked(st);
    } else if (st.loco.synthProne && prone > 0) {
      this.applyProne(st, prone, crouch);
    } else {
      // Twist the legs toward the movement direction, then counter-rotate the spine.
      if (Math.abs(this.hipYaw) > 1e-3) {
        pc.rotate('hips', _up, this.hipYaw, true);
        pc.rotate('spine', _up, -this.hipYaw * 0.4, false);
        pc.rotate('chest', _up, -this.hipYaw * 0.3, false);
        pc.rotate('upperChest', _up, -this.hipYaw * 0.3, false);
        pc.refresh('spine');
      }
      this.captureFeet();
      let drop = this.pelvisDip;
      if (synthCrouch) drop -= this.rig.hipHeight * 0.36 * crouch;
      const needLegs = synthCrouch || Math.abs(drop) > 0.004 || (st.near && c.isGrounded) || Math.abs(this.pelvisOffset) > 0.004;
      if (Math.abs(drop) > 1e-4 || synthCrouch) {
        const hipsPos = pc.pos('hips', _p);
        hipsPos.y += drop;
        if (synthCrouch) hipsPos.addScaledVector(pc.fwd, -0.06 * crouch);
        pc.setWorldPos('hips', hipsPos, true);
      }
      if (synthCrouch) pc.rotate('spine', pc.right, -16 * DEG * crouch, true);
      // Legs back onto the clip's foot positions (plus terrain offsets).
      if (needLegs) this.solveLegs(st, synthCrouch ? crouch : 0);
    }

    this.applyAim(st, prone);
    this.applyLean();
    this.applyHit(dt);
  }

  /** Distribute view pitch (and yaw offset from the body) over spine, neck and head. */
  applyAim(st: AnimFrameState, prone: number, weights?: number[]): void {
    const pc = this.pc;
    const armed = !!this.c.activeWeapon;
    const pitch = clamp(st.aimPitch, -1.2, 1.2) * (1 - prone * 0.6);
    const yawOff = clamp(wrapAngle(st.aimYaw - st.bodyYaw), -1.4, 1.4);
    const w = weights ?? (armed ? [0.22, 0.24, 0.26, 0.12, 0.16] : [0.12, 0.12, 0.16, 0.25, 0.35]);
    const bones = ['spine', 'chest', 'upperChest', 'neck', 'head'] as const;
    for (let i = 0; i < bones.length; i++) {
      if (Math.abs(yawOff) > 1e-3) pc.rotate(bones[i], _up, yawOff * w[i], false);
      // Axis: right of the aim (after yaw) so pitch follows the turned torso.
      _axis.set(Math.cos(st.aimYaw), 0, -Math.sin(st.aimYaw));
      pc.rotate(bones[i], _axis, pitch * w[i], false);
    }
    pc.refresh('spine');
  }

  private applyLean(): void {
    const lean = this.c.lean;
    if (Math.abs(lean) < 1e-3) return;
    const pc = this.pc;
    const a = lean * this.leanRoll;
    pc.rotate('spine', pc.fwd, a * 0.35, false);
    pc.rotate('chest', pc.fwd, a * 0.35, false);
    pc.rotate('upperChest', pc.fwd, a * 0.3, false);
    pc.rotate('neck', pc.fwd, -a * 0.25, false);
    pc.refresh('spine');
  }

  private applyHit(dt: number): void {
    const k = 260, d = 22;
    this.hitVel += (-k * this.hitAngle - d * this.hitVel) * dt;
    this.hitAngle += this.hitVel * dt;
    if (Math.abs(this.hitAngle) < 1e-4 && Math.abs(this.hitVel) < 1e-3) return;
    const a = clamp(this.hitAngle, -0.5, 0.5);
    this.pc.rotate('chest', this.hitAxis, a * 0.5, false);
    this.pc.rotate('upperChest', this.hitAxis, a * 0.3, false);
    this.pc.rotate('neck', this.hitAxis, a * 0.4, false);
    this.pc.refresh('chest');
  }

  /**
   * Re-solve both legs to the recorded clip foot positions, adding terrain foot IK offsets on detailed
   * characters. `bend` > 0 forces a forward knee pole (crouch).
   */
  solveLegs(st: AnimFrameState, bend: number): void {
    const pc = this.pc;
    const c = this.c;
    const useFootIK = st.near && c.isGrounded && c.mode === 'ground';
    let minOff = 0;
    for (const s of ['L', 'R'] as const) {
      const f = this.feet[s];
      let target = 0;
      if (useFootIK) {
        const fp = this.footPos[s];
        _a.set(fp.x, pc.origin.y + 0.55, fp.z);
        const hit = ctx.physics.raycast(_a, _down, 1.2, { mask: Mask.CharacterMove, excludeCollider: c.body.collider });
        if (hit && hit.normal.y > 0.5) {
          target = clamp(hit.point.y - pc.origin.y, -0.45, 0.45);
          f.normal.lerp(hit.normal, Math.min(1, st.dt * 12));
        }
      } else f.normal.lerp(_up, Math.min(1, st.dt * 8));
      f.offset += (target - f.offset) * Math.min(1, st.dt * 14);
      minOff = Math.min(minOff, f.offset);
    }
    // Lower the pelvis so the lower foot can reach.
    this.pelvisOffset += (minOff - this.pelvisOffset) * Math.min(1, st.dt * 10);
    if (Math.abs(this.pelvisOffset) > 1e-3) {
      pc.pos('hips', _p);
      _p.y += this.pelvisOffset;
      pc.setWorldPos('hips', _p, true);
    }
    for (const s of ['L', 'R'] as const) {
      const up = this.rig.bones[`upperLeg${s}`];
      const lo = this.rig.bones[`lowerLeg${s}`];
      const ft = this.rig.bones[`foot${s}`];
      if (!up || !lo || !ft) continue;
      const fs = this.feet[s];
      _c.copy(this.footPos[s]);
      _c.y += fs.offset;
      // Pole: knee forward (and slightly outward).
      worldPos(lo, _b);
      _p.copy(_b).addScaledVector(pc.fwd, 0.5 + bend).addScaledVector(pc.right, s === 'R' ? 0.08 : -0.08);
      if (Math.abs(this.hipYaw) > 1e-3) _p.sub(_b).applyAxisAngle(_up, this.hipYaw).add(_b);
      applyTwoBoneIK(up, lo, ft, _c, _p, 1);
      // Keep the clip's foot orientation, tilted to the ground normal.
      _q.setFromUnitVectors(_up, fs.normal);
      _q2.copy(_q).multiply(this.footQuat[s]);
      setWorldQuat(ft, _q2, true);
    }
  }

  // ── prone synthesis ────────────────────────────────────────────────────────
  private applyProne(st: AnimFrameState, w: number, crouchW: number): void {
    const pc = this.pc;
    const c = this.c;
    const dt = st.dt;
    // Crawl phase by distance (≈0.9 m per full cycle).
    const speed = Math.hypot(c.velocity.x, c.velocity.z);
    this.crawlPhase = (this.crawlPhase + (speed * dt) / 0.9) % 1;
    const moving = clamp(speed / 0.6, 0, 1);
    const ph = this.crawlPhase * Math.PI * 2;

    // Body lies forward: rotate the hips about the body right axis, tilted with the ground slope.
    const lie = (-Math.PI / 2 + c.pronePitch) * w;
    const roll = Math.sin(ph) * 0.06 * moving * w;
    const hips = pc.pos('hips', _p);
    _a.copy(pc.origin).addScaledVector(pc.fwd, -0.18 * pc.scale);
    _a.y += 0.17 * pc.scale + Math.sin(c.pronePitch) * -0.18;
    hips.lerp(_a, w);
    // Coming from a crouch: blend the intermediate kneel height.
    if (crouchW > 0) hips.y -= this.rig.hipHeight * 0.36 * crouchW * (1 - w);
    pc.setWorldPos('hips', hips, false);
    pc.rotate('hips', pc.right, lie, false);
    pc.rotate('hips', pc.fwd, roll, false);
    pc.refresh();
    // Head & neck look forward.
    pc.rotate('neck', pc.right, 0.95 * w, false);
    pc.rotate('head', pc.right, 0.35 * w, false);
    // Legs lie straight back along the ground (slightly spread); the crawl swings one knee out and
    // forward at a time (frog crawl).
    const cp = Math.cos(c.pronePitch), spn = Math.sin(c.pronePitch);
    for (const s of ['L', 'R'] as const) {
      const up = this.rig.bones[`upperLeg${s}`], lo = this.rig.bones[`lowerLeg${s}`], ft = this.rig.bones[`foot${s}`];
      if (!up || !lo || !ft) continue;
      const side = s === 'R' ? 1 : -1;
      const pull = Math.max(0, Math.sin(ph + (s === 'L' ? 0 : Math.PI))) * moving;
      // back along the body, following the slope, a touch down so the feet rest on the ground
      _c.copy(pc.fwd).multiplyScalar(-cp).addScaledVector(_up, -spn - 0.06).addScaledVector(pc.right, side * 0.12);
      _axis.copy(_c).addScaledVector(pc.right, side * 1.0 * pull).addScaledVector(pc.fwd, 0.55 * pull).normalize();
      worldPos(lo, _a);
      aimBone(up, _a, _axis, w, true);
      _b.copy(_c).addScaledVector(pc.right, -side * 0.35 * pull).normalize();
      worldPos(ft, _a);
      aimBone(lo, _a, _b, w, true);
    }
    // Unarmed: forearms rest on the ground in front of the face.
    if (!c.activeWeapon) {
      for (const s of ['L', 'R'] as const) {
        const ua = this.rig.bones[`upperArm${s}`], la = this.rig.bones[`lowerArm${s}`], hd = this.rig.bones[`hand${s}`];
        if (!ua || !la || !hd) continue;
        const side = s === 'R' ? 1 : -1;
        const reach = Math.max(0, Math.sin(ph + (s === 'L' ? Math.PI : 0))) * moving;
        pc.pos(`upperArm${s}`, _c).addScaledVector(pc.fwd, (0.32 + 0.18 * reach) * pc.scale).addScaledVector(pc.right, side * 0.12 * pc.scale);
        _c.y = pc.origin.y + 0.06 + Math.sin(c.pronePitch) * 0.4;
        worldPos(la, _b);
        _a.copy(_b).addScaledVector(pc.right, side * 0.6).addScaledVector(_up, -0.4);
        applyTwoBoneIK(ua, la, hd, _c, _a, w);
      }
    }
    pc.refresh();
  }

  // ── knocked (DBNO) synthesis: kneeling crawl, one hand on the ground ───────
  private applyKnocked(st: AnimFrameState): void {
    const pc = this.pc;
    const c = this.c;
    const speed = Math.hypot(c.velocity.x, c.velocity.z);
    this.crawlPhase = (this.crawlPhase + (speed * st.dt) / 0.7) % 1;
    const moving = clamp(speed / 0.5, 0, 1);
    const ph = this.crawlPhase * Math.PI * 2;
    // Kneel: hips at ~0.55 of the leg length, torso pitched forward.
    const hips = pc.pos('hips', _p);
    hips.copy(pc.origin).addScaledVector(pc.fwd, -0.05);
    hips.y += this.rig.legLength * 0.55 + Math.sin(ph * 2) * 0.02 * moving;
    pc.setWorldPos('hips', hips, true);
    pc.rotate('spine', pc.right, -0.45, false);
    pc.rotate('chest', pc.right, -0.2, false);
    pc.rotate('neck', pc.right, 0.45, false);
    pc.refresh();
    // Knees on the ground behind, shins flat.
    for (const s of ['L', 'R'] as const) {
      const up = this.rig.bones[`upperLeg${s}`], lo = this.rig.bones[`lowerLeg${s}`], ft = this.rig.bones[`foot${s}`];
      if (!up || !lo || !ft) continue;
      const step = Math.sin(ph + (s === 'L' ? 0 : Math.PI)) * 0.12 * moving;
      _c.copy(pc.origin).addScaledVector(pc.fwd, -0.45 + step).addScaledVector(pc.right, s === 'R' ? 0.13 : -0.13);
      _c.y += 0.12;
      worldPos(lo, _b);
      _a.copy(_b).addScaledVector(pc.fwd, 1.0);
      _a.y -= 0.4;
      applyTwoBoneIK(up, lo, ft, _c, _a, 1);
    }
    // Left hand on the ground ahead; right hand holds the stomach.
    const handL = this.rig.bones.handL, loL = this.rig.bones.lowerArmL, upL = this.rig.bones.upperArmL;
    if (handL && loL && upL) {
      _c.copy(pc.origin).addScaledVector(pc.fwd, 0.35 + Math.sin(ph) * 0.12 * moving).addScaledVector(pc.right, -0.22);
      _c.y += 0.04;
      worldPos(loL, _b);
      _a.copy(_b).addScaledVector(pc.right, -0.5);
      applyTwoBoneIK(upL, loL, handL, _c, _a, 1);
    }
    const handR = this.rig.bones.handR, loR = this.rig.bones.lowerArmR, upR = this.rig.bones.upperArmR;
    if (handR && loR && upR) {
      pc.pos('spine', _c).addScaledVector(pc.fwd, 0.18).addScaledVector(pc.right, 0.02);
      worldPos(loR, _b);
      _a.copy(_b).addScaledVector(pc.right, 0.5);
      applyTwoBoneIK(upR, loR, handR, _c, _a, 1);
    }
  }
}

export { lerp, smoothstep };
