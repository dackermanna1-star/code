// Procedural poses for special movement states when no clip covers them: airborne tuck, swimming
// (breaststroke / treading), freefall (arch / dive), parachute (hands on toggles), seated (driver /
// passenger / motorcycle), vault (one-hand plant) and climb (two-hand plant). Applied in world space.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { clamp, smoothstep } from '../../core/math';
import type { Character } from '../Character';
import type { Rig, Side } from './Rig';
import type { PoseContext } from './PoseContext';
import type { ProceduralAnimator, AnimFrameState } from './ProceduralAnimator';
import { applyTwoBoneIK, worldPos } from './IK';
import type { ClipKind } from './Clips';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _fwdS = new THREE.Vector3();
const _upS = new THREE.Vector3();
const _rightS = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();

/** Smooth 0→1→0 bump over [a, b]. */
function bump(t: number, a: number, b: number): number {
  const m = (a + b) / 2;
  return smoothstep(a, a + (m - a) * 0.6, t) * (1 - smoothstep(b - (b - m) * 0.6, b, t));
}

export class SpecialPoses {
  private cycle = 0;
  private swayT = 0;

  constructor(
    private readonly c: Character,
    private readonly rig: Rig,
    private readonly proc: ProceduralAnimator,
    private readonly pc: PoseContext,
  ) {}

  private arm(side: Side, target: THREE.Vector3, pole: THREE.Vector3, w = 1): void {
    const R = this.rig.bones;
    const up = R[`upperArm${side}`], lo = R[`lowerArm${side}`], hand = R[`hand${side}`];
    if (up && lo && hand) applyTwoBoneIK(up, lo, hand, target, pole, w);
  }

  private leg(side: Side, target: THREE.Vector3, pole: THREE.Vector3, w = 1): void {
    const R = this.rig.bones;
    const up = R[`upperLeg${side}`], lo = R[`lowerLeg${side}`], ft = R[`foot${side}`];
    if (up && lo && ft) applyTwoBoneIK(up, lo, ft, target, pole, w);
  }

  private sideVec(side: Side, out: THREE.Vector3, right = this.pc.right): THREE.Vector3 {
    return out.copy(right).multiplyScalar(side === 'R' ? 1 : -1);
  }

  /** Main pass (before the weapon layer). */
  apply(fs: AnimFrameState, kind: ClipKind, covered: boolean): void {
    const pc = this.pc;
    this.swayT += fs.dt;
    switch (kind) {
      case 'fall':
        this.proc.applyGround({ ...fs, near: false });
        if (!covered) this.airTuck();
        return;
      case 'vault':
      case 'climb':
        this.proc.applyGround({ ...fs, near: false });
        return;
      case 'seated':
        if (!covered) this.seated();
        this.proc.applyAim(fs, 0, [0.15, 0.2, 0.25, 0.15, 0.25]);
        return;
      case 'swim':
      case 'swimIdle':
        if (!covered) this.swim(fs, kind === 'swimIdle');
        return;
      case 'freefall':
        if (!covered) this.freefall(fs);
        return;
      case 'parachute':
        if (!covered) this.parachute(fs);
        return;
      default:
        this.proc.applyGround(fs);
    }
    void pc;
  }

  /** Pass after the weapon layer (hand plants / steering override the arms). */
  applyPostWeapon(fs: AnimFrameState, kind: ClipKind | null, armed: boolean): void {
    if (kind === 'vault' || kind === 'climb') this.traversalHands();
    else if (kind === 'seated' && !armed) this.seatedHands();
    else if (kind === 'swim' || kind === 'swimIdle') this.swimArms(fs, kind === 'swimIdle');
    else if (kind === 'freefall') this.freefallLimbs(fs);
    else if (kind === 'parachute') this.parachuteLimbs(fs);
  }

  // ── air ────────────────────────────────────────────────────────────────────
  private airTuck(): void {
    const pc = this.pc;
    const k = clamp(this.c.airTime * 3, 0, 1) * (this.c.velocity.y < -6 ? 0.5 : 1);
    for (const s of ['L', 'R'] as const) {
      const ft = this.rig.bones[`foot${s}`];
      const lo = this.rig.bones[`lowerLeg${s}`];
      if (!ft || !lo) continue;
      worldPos(ft, _t);
      _t.y += 0.16 * k * (s === 'L' ? 1 : 0.7);
      _t.addScaledVector(pc.fwd, 0.06 * k);
      worldPos(lo, _pole).addScaledVector(pc.fwd, 1);
      this.leg(s, _t, _pole);
    }
  }

  // ── swimming ───────────────────────────────────────────────────────────────
  private swim(fs: AnimFrameState, idle: boolean): void {
    const c = this.c;
    const pc = this.pc;
    const speed = Math.hypot(c.velocity.x, c.velocity.z, idle ? 0 : c.velocity.y);
    this.cycle = (this.cycle + fs.dt * (idle ? 0.55 : 0.4 + speed * 0.22)) % 1;
    const hips = pc.pos('hips', _a);
    if (idle) {
      hips.copy(pc.origin).addScaledVector(_up, this.rig.hipHeight * 0.98 + Math.sin(this.cycle * Math.PI * 4) * 0.03);
      pc.setWorldPos('hips', hips, true);
      pc.rotate('neck', pc.right, 0.1, true);
    } else {
      // Body near horizontal; underwater the body follows the view pitch.
      const tilt = c.underwater ? clamp(fs.aimPitch, -1.2, 0.8) : 0.1;
      const lie = -Math.PI / 2 + 0.35 + tilt;
      hips.copy(pc.origin).addScaledVector(_up, this.rig.hipHeight * 1.05).addScaledVector(pc.fwd, -0.35);
      // At the surface the body floats just under the water line with the head out.
      if (!c.underwater) hips.y = Math.max(hips.y, c.waterSurface - 0.32 * pc.scale);
      pc.setWorldPos('hips', hips, false);
      pc.rotate('hips', pc.right, lie, false);
      pc.refresh();
      pc.rotate('neck', pc.right, c.underwater ? 0.25 : 0.95, false);
      pc.rotate('head', pc.right, c.underwater ? 0.1 : 0.3, false);
      pc.refresh();
      // Frog kick.
      const ph = this.cycle * Math.PI * 2;
      const kick = Math.max(0, Math.sin(ph));
      for (const s of ['L', 'R'] as const) {
        const hip = pc.pos(`upperLeg${s}`, _b);
        // Body axis (neck → hips) points toward the feet.
        pc.pos('hips', _axis).sub(pc.pos('neck', _pole)).normalize();
        _t.copy(hip).addScaledVector(_axis, this.rig.legLength * (0.95 - 0.35 * kick));
        _t.addScaledVector(this.sideVec(s, _a), 0.12 + 0.22 * kick);
        _pole.copy(hip).addScaledVector(_axis, 0.4).addScaledVector(this.sideVec(s, _a), 0.6).addScaledVector(_up, -0.3);
        this.leg(s, _t, _pole);
      }
    }
  }

  private swimArms(fs: AnimFrameState, idle: boolean): void {
    const pc = this.pc;
    const ph = this.cycle * Math.PI * 2;
    for (const s of ['L', 'R'] as const) {
      const sh = pc.pos(`upperArm${s}`, _b);
      if (idle) {
        // Treading water: hands sweep horizontally in front of the chest.
        _t.copy(sh).addScaledVector(pc.fwd, 0.3).addScaledVector(this.sideVec(s, _a), 0.2 + 0.18 * Math.sin(ph + (s === 'L' ? 0 : Math.PI)));
        _t.y -= 0.35;
      } else {
        // Breaststroke: reach forward, sweep out, pull back under the chest.
        const reach = 0.25 + 0.35 * (0.5 + 0.5 * Math.cos(ph));
        const out = 0.1 + 0.32 * Math.max(0, Math.sin(ph));
        _t.copy(sh).addScaledVector(pc.aimDir.y < -0.3 && this.c.underwater ? pc.aimDir : pc.fwd, reach).addScaledVector(this.sideVec(s, _a), out);
        _t.y -= 0.08;
      }
      _pole.copy(sh).addScaledVector(this.sideVec(s, _a), 0.6).addScaledVector(_up, -0.4);
      this.arm(s, _t, _pole);
    }
    void fs;
  }

  // ── freefall ───────────────────────────────────────────────────────────────
  private freefall(fs: AnimFrameState): void {
    const c = this.c;
    const pc = this.pc;
    const dive = clamp((-c.velocity.y - 47) / 16, 0, 1);
    const hips = pc.pos('hips', _a).copy(pc.origin).addScaledVector(_up, 0.9);
    pc.setWorldPos('hips', hips, false);
    pc.rotate('hips', pc.right, -Math.PI / 2 - dive * 0.75, false);
    pc.refresh();
    // Arch: chest and head up.
    pc.rotate('spine', pc.right, 0.12, false);
    pc.rotate('chest', pc.right, 0.12, false);
    pc.rotate('neck', pc.right, 0.7 - dive * 0.3, false);
    pc.rotate('head', pc.right, 0.3, false);
    pc.refresh();
    void fs;
  }

  private freefallLimbs(fs: AnimFrameState): void {
    const c = this.c;
    const pc = this.pc;
    const dive = clamp((-c.velocity.y - 47) / 16, 0, 1);
    const flutter = Math.sin(this.swayT * 9) * 0.02;
    for (const s of ['L', 'R'] as const) {
      const sh = pc.pos(`upperArm${s}`, _b);
      const side = this.sideVec(s, _a);
      // Arched: hands out to the side, forward and up. Diving: swept back along the body.
      _t.copy(sh).addScaledVector(side, 0.5 * (1 - dive) + 0.18 * dive).addScaledVector(pc.fwd, 0.18 * (1 - dive) - 0.55 * dive);
      _t.y += 0.18 * (1 - dive) + flutter;
      _pole.copy(sh).addScaledVector(side, 0.3).addScaledVector(pc.fwd, -0.4).addScaledVector(_up, -0.3);
      this.arm(s, _t, _pole);
      const hip = pc.pos(`upperLeg${s}`, _b);
      _t.copy(hip).addScaledVector(pc.fwd, -0.65).addScaledVector(side, 0.28 * (1 - dive) + 0.08);
      _t.y += 0.25 * (1 - dive) - flutter;
      _pole.copy(hip).addScaledVector(pc.fwd, -0.3).addScaledVector(_up, -0.5).addScaledVector(side, 0.2);
      this.leg(s, _t, _pole);
    }
    void fs;
  }

  // ── parachute ──────────────────────────────────────────────────────────────
  private parachute(fs: AnimFrameState): void {
    const c = this.c;
    const pc = this.pc;
    const lean = clamp(c.intent.moveY, -1, 1) * 0.15;
    const sway = Math.sin(this.swayT * 1.3) * 0.05;
    const hips = pc.pos('hips', _a).copy(pc.origin).addScaledVector(_up, this.rig.hipHeight + 0.05);
    pc.setWorldPos('hips', hips, false);
    pc.rotate('hips', pc.right, -lean, false);
    pc.rotate('hips', pc.fwd, sway, false);
    pc.refresh();
    this.proc.applyAim(fs, 0, [0.05, 0.05, 0.1, 0.3, 0.4]);
    // Legs dangle slightly forward.
    for (const s of ['L', 'R'] as const) {
      const hip = pc.pos(`upperLeg${s}`, _b);
      _t.copy(hip).addScaledVector(_up, -this.rig.legLength * 0.95).addScaledVector(pc.fwd, 0.18 + Math.sin(this.swayT * 2 + (s === 'L' ? 0 : 1)) * 0.04).addScaledVector(this.sideVec(s, _a), 0.06);
      _pole.copy(hip).addScaledVector(pc.fwd, 1);
      this.leg(s, _t, _pole);
    }
  }

  private parachuteLimbs(fs: AnimFrameState): void {
    const c = this.c;
    const pc = this.pc;
    const open = c.sky.chuteOpen;
    for (const s of ['L', 'R'] as const) {
      const sh = pc.pos(`upperArm${s}`, _b);
      // Steering: pulling the toggle on the side of the turn.
      const pull = clamp((s === 'L' ? -1 : 1) * c.intent.moveX, 0, 1) * 0.25 + (c.intent.moveY < 0 ? 0.2 : 0);
      _t.copy(sh).addScaledVector(this.sideVec(s, _a), 0.08).addScaledVector(pc.fwd, 0.04);
      _t.y += (0.55 - pull) * open + 0.1 * (1 - open);
      _pole.copy(sh).addScaledVector(this.sideVec(s, _a), 0.6).addScaledVector(_up, -0.2);
      this.arm(s, _t, _pole);
    }
    void fs;
  }

  // ── seated ─────────────────────────────────────────────────────────────────
  private seatFrame(): void {
    const q = this.c.visual?.root.quaternion ?? _q.identity();
    _fwdS.set(0, 0, 1).applyQuaternion(q);
    _upS.set(0, 1, 0).applyQuaternion(q);
    _rightS.set(-1, 0, 0).applyQuaternion(q);
  }

  private seated(): void {
    const pc = this.pc;
    this.seatFrame();
    const moto = /motor/.test(this.c.vehicle?.kind ?? '');
    const hips = _a.copy(pc.origin).addScaledVector(_upS, 0.5);
    pc.setWorldPos('hips', hips, true);
    for (const s of ['L', 'R'] as const) {
      const hip = pc.pos(`upperLeg${s}`, _b);
      const side = _t.copy(_rightS).multiplyScalar(s === 'R' ? 1 : -1);
      const target = _a.copy(hip).addScaledVector(_fwdS, moto ? 0.3 : 0.45).addScaledVector(_upS, moto ? -0.35 : -0.44).addScaledVector(side, moto ? 0.2 : 0.06);
      _pole.copy(hip).addScaledVector(_fwdS, 0.8).addScaledVector(_upS, 0.3);
      this.leg(s, target, _pole);
    }
  }

  private seatedHands(): void {
    const c = this.c;
    const pc = this.pc;
    this.seatFrame();
    const driver = c.seatIndex === 0;
    const moto = /motor/.test(c.vehicle?.kind ?? '');
    const boat = !!c.vehicle?.isBoat;
    const steer = clamp(c.intent.vehicle.steer, -1, 1);
    const hips = pc.pos('hips', _b);
    for (const s of ['L', 'R'] as const) {
      const sideSign = s === 'R' ? 1 : -1;
      if (driver && !boat) {
        // Steering wheel / handlebars.
        _t.copy(hips).addScaledVector(_fwdS, moto ? 0.55 : 0.42).addScaledVector(_upS, moto ? 0.5 : 0.48).addScaledVector(_rightS, sideSign * (moto ? 0.3 : 0.18));
        if (!moto) _t.addScaledVector(_upS, -steer * sideSign * 0.06);
        else _t.addScaledVector(_fwdS, steer * sideSign * 0.05);
      } else if (driver && boat) {
        _t.copy(hips).addScaledVector(_fwdS, 0.35).addScaledVector(_upS, 0.4).addScaledVector(_rightS, sideSign * 0.2);
      } else {
        // Hands resting on the thighs.
        _t.copy(hips).addScaledVector(_fwdS, 0.32).addScaledVector(_upS, 0.08).addScaledVector(_rightS, sideSign * 0.13);
      }
      _pole.copy(pc.pos(`lowerArm${s}`, _a)).addScaledVector(_rightS, sideSign * 0.5).addScaledVector(_upS, -0.4);
      this.arm(s, _t, _pole);
    }
  }

  // ── vault / climb hand plants ──────────────────────────────────────────────
  private traversalHands(): void {
    const tr = this.c.traversal;
    if (!tr) return;
    const pc = this.pc;
    const t = tr.t;
    const leftSide = _rightS.crossVectors(_up, tr.dir).normalize(); // left of the move direction
    if (tr.kind === 'vault') {
      const w = bump(t, 0.08, 0.7);
      if (w > 0.01) {
        _t.copy(tr.start).addScaledVector(tr.dir, tr.info.faceDist + Math.min(0.3, tr.info.thickness * 0.5)).addScaledVector(leftSide, 0.12);
        _t.y = tr.info.topY + 0.03;
        _pole.copy(pc.pos('lowerArmL', _a)).addScaledVector(leftSide, 0.5).addScaledVector(tr.dir, -0.3);
        this.arm('L', _t, _pole, w);
      }
      // Legs tuck over the obstacle.
      const tuck = bump(t, 0.15, 0.85);
      if (tuck > 0.01) {
        for (const s of ['L', 'R'] as const) {
          const hip = pc.pos(`upperLeg${s}`, _b);
          _t.copy(hip).addScaledVector(_up, -this.rig.legLength * (1 - 0.45 * tuck)).addScaledVector(tr.dir, 0.25 * tuck).addScaledVector(leftSide, (s === 'L' ? 1 : -1) * 0.08 - 0.25 * tuck);
          _pole.copy(hip).addScaledVector(tr.dir, 1);
          this.leg(s, _t, _pole);
        }
      }
    } else {
      const w = bump(t, 0.02, 0.92);
      for (const s of ['L', 'R'] as const) {
        const sign = s === 'L' ? 1 : -1;
        _t.copy(tr.start).addScaledVector(tr.dir, tr.info.faceDist + 0.1).addScaledVector(leftSide, sign * 0.24);
        _t.y = tr.info.topY + 0.03;
        _pole.copy(pc.pos(`lowerArm${s}`, _a)).addScaledVector(leftSide, sign * 0.5).addScaledVector(_up, -0.5);
        this.arm(s, _t, _pole, w);
      }
      const knee = bump(t, 0.2, 0.85);
      for (const s of ['L', 'R'] as const) {
        const hip = pc.pos(`upperLeg${s}`, _b);
        const step = s === 'L' ? knee : knee * 0.5;
        _t.copy(hip).addScaledVector(_up, -this.rig.legLength * (1 - 0.5 * step)).addScaledVector(tr.dir, 0.3 * step);
        _pole.copy(hip).addScaledVector(tr.dir, 1);
        this.leg(s, _t, _pole);
      }
    }
    void ctx;
  }
}
