// Weapon holding layer: places the held weapon from the aim (low ready / shouldered / sprint / pistol /
// melee / throwable styles), adds recoil kick and action gestures (reload, switch, heal, throw), then
// solves both arms with two-bone IK onto the weapon's grip and grip_support nodes, orients the hands
// and curls the fingers around the grips.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { clamp, lerp, smoothstep } from '../../core/math';
import type { Character } from '../Character';
import type { Rig, Side, BoneKey } from './Rig';
import { FINGERS } from './Rig';
import type { PoseContext } from './PoseContext';
import { applyTwoBoneIK, quatFromBasis, setWorldQuat, worldPos, worldQuat, rotateWorld } from './IK';
import type { WeaponVisual } from './WeaponModels';

const _eye = new THREE.Vector3();
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** A weapon placement: grip position + orientation (world). */
interface Placement {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

function mkPlacement(): Placement {
  return { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
}

/** Rotation that maps (finger, palm) local vectors to target world vectors. */
function handQuat(fingerLocal: THREE.Vector3, palmLocal: THREE.Vector3, fingerW: THREE.Vector3, palmW: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  quatFromBasis(fingerLocal, palmLocal, _qa);
  quatFromBasis(fingerW, palmW, _qb);
  return out.copy(_qb).multiply(_qa.invert());
}

export class WeaponPose {
  private aimW = 0;
  private sprintW = 0;
  private lowW = 1;
  private readonly low = mkPlacement();
  private readonly aim = mkPlacement();
  private readonly sprint = mkPlacement();
  readonly grip = mkPlacement();
  /** 0..1 how much the arms follow the weapon (fades for unarmed transitions). */
  private armsW = 0;
  /** Set by the visual when rendered for the first-person camera. */
  firstPerson = false;

  constructor(
    private readonly c: Character,
    private readonly rig: Rig,
    private readonly pc: PoseContext,
  ) {}

  /** Eye point from the head bone (also used for the FPP camera). */
  eye(out: THREE.Vector3): THREE.Vector3 {
    const pc = this.pc;
    const head = this.rig.bones.head;
    if (!head) return out.copy(pc.origin).setY(pc.origin.y + 1.6);
    worldPos(head, out);
    // Eyes: ~8.5 cm above the head joint and ~10 cm forward (horizontal aim direction).
    _a.copy(pc.aimDir).setY(0);
    if (_a.lengthSq() < 1e-6) _a.copy(pc.fwd);
    _a.normalize();
    out.y += 0.085 * pc.scale;
    out.addScaledVector(_a, 0.1 * pc.scale);
    return out;
  }

  update(dt: number, wv: WeaponVisual | null, root: THREE.Object3D): void {
    const c = this.c;
    const pc = this.pc;
    const target = wv ? 1 : 0;
    this.armsW += (target - this.armsW) * Math.min(1, dt * 10);
    if (!wv) return;
    const style = wv.style;

    // ── base pose weights ──
    const now = ctx.engine.simTime;
    const firing = now - c.lastShotTime < 0.45;
    const busy = c.action.kind === 'useItem' || c.action.kind === 'interact' || c.action.kind === 'revive';
    const traversing = c.mode === 'traversal';
    const wantAim = !busy && !traversing && (c.isADS || c.isAiming || firing || (style === 'pistol' && c.intent.fire)) ? 1 : 0;
    const wantSprint = c.isSprinting && style !== 'pistol' && !traversing ? 1 : 0;
    const rate = Math.min(1, dt * 12);
    this.aimW += (wantAim - this.aimW) * rate;
    this.sprintW += (wantSprint * (1 - wantAim) - this.sprintW) * Math.min(1, dt * 8);
    this.lowW = Math.max(0, 1 - this.aimW - this.sprintW);

    this.eye(_eye);
    // Shouldered: the sight's eye point sits at the eye, barrel along the aim.
    quatFromBasis(pc.aimDir, pc.aimUp, this.aim.quat);
    const se = wv.sightEye;
    _s.set(0, style === 'pistol' ? 0.06 : 0.085, style === 'pistol' ? -0.5 : -0.15);
    if (se && se.parent) {
      // sight_eye in grip (weapon root) space
      se.updateWorldMatrix(true, false);
      wv.object.updateWorldMatrix(true, false);
      _m.copy(wv.object.matrixWorld).invert().multiply(se.matrixWorld);
      _s.setFromMatrixPosition(_m);
    }
    this.aim.pos.copy(_eye).sub(_p.copy(_s).applyQuaternion(this.aim.quat));
    if (!c.isADS) {
      // TPP shoulder aim: cheek a little off the sight.
      this.aim.pos.addScaledVector(pc.aimRight, 0.015).addScaledVector(pc.aimUp, -0.02);
    }

    // Low ready / sprint by style (offsets in the aim frame: x right, y up, z forward).
    const ar = pc.aimRight, au = pc.aimUp, ad = pc.aimDir;
    const lowOffset = (x: number, y: number, z: number, pitchDown: number, yawIn: number, rollR: number, out: Placement) => {
      out.pos.copy(_eye).addScaledVector(ar, x * pc.scale).addScaledVector(au, y * pc.scale).addScaledVector(ad, z * pc.scale);
      out.quat.copy(this.aim.quat);
      _q.setFromAxisAngle(ar, -pitchDown);
      out.quat.premultiply(_q);
      _q.setFromAxisAngle(au, yawIn);
      out.quat.premultiply(_q);
      _f.set(0, 0, 1).applyQuaternion(out.quat);
      _q.setFromAxisAngle(_f, rollR);
      out.quat.premultiply(_q);
    };
    switch (style) {
      case 'rifle':
        // First-person hip pose is raised so the weapon stays in the lower right of the view.
        if (this.firstPerson) lowOffset(0.11, -0.2, 0.3, 0.14, 0.06, -0.08, this.low);
        else lowOffset(0.13, -0.36, 0.22, 0.5, 0.2, -0.15, this.low);
        break;
      case 'pistol':
        if (this.firstPerson) lowOffset(0.08, -0.22, 0.38, 0.2, 0.05, 0, this.low);
        else lowOffset(0.05, -0.42, 0.3, 0.75, 0.05, 0, this.low);
        break;
      case 'melee':
        lowOffset(0.24, -0.62, 0.12, -0.4, 0.1, 0, this.low);
        lowOffset(0.24, -0.15, 0.1, -1.1, 0.3, 0, this.aim);
        break;
      case 'throwable':
        lowOffset(0.16, -0.36, 0.26, 0, 0, 0, this.low);
        lowOffset(0.26, 0.02, -0.12, 0.6, 0, 0, this.aim);
        break;
    }
    // Sprint: rifle across the chest (port arms), muzzle up-left.
    {
      const fw = pc.fwd, rt = pc.right;
      this.sprint.pos.copy(_eye).addScaledVector(rt, 0.08 * pc.scale).addScaledVector(_up, -0.55 * pc.scale).addScaledVector(fw, 0.24 * pc.scale);
      _f.copy(fw).multiplyScalar(0.35).addScaledVector(_up, 0.55).addScaledVector(rt, -0.75).normalize();
      _u.copy(fw).multiplyScalar(0.85).addScaledVector(_up, 0.3).normalize();
      quatFromBasis(_f, _u, this.sprint.quat);
    }

    // ── blend ──
    const g = this.grip;
    g.pos.set(0, 0, 0).addScaledVector(this.low.pos, this.lowW).addScaledVector(this.aim.pos, this.aimW).addScaledVector(this.sprint.pos, this.sprintW);
    const tot = this.lowW + this.aimW + this.sprintW;
    if (tot > 1e-4) g.pos.divideScalar(tot);
    g.quat.copy(this.low.quat).slerp(this.aim.quat, clamp(this.aimW / Math.max(1e-4, this.lowW + this.aimW), 0, 1));
    g.quat.slerp(this.sprint.quat, clamp(this.sprintW, 0, 1));

    // ── gestures ──
    this.applyGestures(g, wv, now);

    // ── recoil kick ──
    const ts = now - c.lastShotTime;
    if (ts >= 0 && ts < 0.3) {
      const k = Math.exp(-ts * 22);
      _f.set(0, 0, 1).applyQuaternion(g.quat);
      g.pos.addScaledVector(_f, -(style === 'pistol' ? 0.02 : 0.035) * k);
      _r.set(1, 0, 0).applyQuaternion(g.quat);
      _q.setFromAxisAngle(_r, -(style === 'pistol' ? 0.12 : 0.06) * k);
      g.quat.premultiply(_q);
    }

    // ── place the weapon object (child of the visual root) ──
    const obj = wv.object;
    _p.copy(g.pos);
    root.worldToLocal(_p);
    obj.position.copy(_p);
    worldQuat(root, _q).invert();
    obj.quaternion.copy(_q).multiply(g.quat);
    obj.updateMatrixWorld(true);

    // ── arms ──
    this.solveArms(wv);
  }

  private applyGestures(g: Placement, wv: WeaponVisual, now: number): void {
    const c = this.c;
    const pc = this.pc;
    const a = c.action;
    const fwdW = _f.set(0, 0, 1).applyQuaternion(g.quat);
    const rightW = _r.set(-1, 0, 0).applyQuaternion(g.quat);
    void now;
    if (a.kind === 'reload') {
      const p = clamp(a.progress / Math.max(0.01, a.duration), 0, 1);
      const env = smoothstep(0, 0.12, p) * (1 - smoothstep(0.85, 1, p));
      // Tilt the weapon (roll toward the body), raise the muzzle slightly, pull it in.
      _q.setFromAxisAngle(fwdW, 0.6 * env);
      g.quat.premultiply(_q);
      _q.setFromAxisAngle(rightW, 0.18 * env);
      g.quat.premultiply(_q);
      g.pos.addScaledVector(pc.up, -0.05 * env).addScaledVector(pc.fwd, -0.04 * env);
    } else if (a.kind === 'switchWeapon') {
      const p = clamp(a.progress / Math.max(0.01, a.duration), 0, 1);
      const down = Math.sin(p * Math.PI);
      _q.setFromAxisAngle(rightW, -0.9 * down);
      g.quat.premultiply(_q);
      g.pos.addScaledVector(pc.up, -0.25 * down);
    } else if (a.kind === 'useItem' || a.kind === 'interact' || a.kind === 'revive' || c.mode === 'traversal') {
      // Weapon lowered and turned aside while the hands are busy.
      _q.setFromAxisAngle(rightW, -0.8);
      g.quat.premultiply(_q);
      g.pos.addScaledVector(pc.up, -0.15).addScaledVector(pc.right, 0.12);
    }
    void wv;
  }

  /** Two-bone IK both arms onto the weapon; hand orientation + finger curls. */
  private solveArms(wv: WeaponVisual): void {
    const c = this.c;
    const pc = this.pc;
    const R = this.rig.bones;
    const w = this.armsW;
    if (w < 0.01) return;
    const obj = wv.object;
    const gq = worldQuat(obj, _q2);
    // Weapon frame vectors (world): barrel, top, weapon right (-X in asset space).
    const barrel = _f.set(0, 0, 1).applyQuaternion(gq);
    const top = _u.set(0, 1, 0).applyQuaternion(gq);
    const wRight = _r.set(-1, 0, 0).applyQuaternion(gq);
    const style = wv.style;
    const a = c.action;
    const busyLeft = a.kind === 'useItem' || c.mode === 'traversal' || a.kind === 'interact' || a.kind === 'revive';

    // Right hand on the grip: metacarpals up the grip, palm toward the weapon's left side.
    this.solveHand('R', obj.getWorldPosition(_p), _a.copy(top).multiplyScalar(0.9).addScaledVector(barrel, 0.45), _b.copy(wRight).negate(), w, style === 'melee' || style === 'throwable' ? 'fist' : 'trigger');

    // Left hand: support grip (rifle / pistol), or gesture targets.
    const handL = R.handL;
    if (!handL) return;
    let leftOn = style === 'rifle' || style === 'pistol' ? 1 : 0;
    let tgt: THREE.Vector3 | null = null;
    if (a.kind === 'reload' && leftOn) {
      const p = clamp(a.progress / Math.max(0.01, a.duration), 0, 1);
      const mag = wv.mag ? wv.mag.getWorldPosition(_p2) : _p2.copy(obj.position);
      const pouch = pc.pos('hips', _eye).addScaledVector(pc.right, -0.16).addScaledVector(pc.fwd, 0.12);
      pouch.y += 0.05;
      const sup = this.supportPoint(wv, _s);
      // support → mag (0.1-0.25) → pouch (0.35-0.5) → mag (0.6-0.75) → support (0.85-1)
      if (p < 0.1) tgt = sup;
      else if (p < 0.3) tgt = _p.copy(sup).lerp(mag, smoothstep(0.1, 0.25, p));
      else if (p < 0.55) tgt = _p.copy(mag).lerp(pouch, smoothstep(0.3, 0.48, p));
      else if (p < 0.8) tgt = _p.copy(pouch).lerp(mag, smoothstep(0.55, 0.75, p));
      else tgt = _p.copy(mag).lerp(sup, smoothstep(0.8, 0.95, p));
    } else if (busyLeft) {
      leftOn = 0;
    } else if (leftOn) {
      tgt = this.supportPoint(wv, _p);
    }
    if (tgt && leftOn) {
      // Support hand under the handguard: fingers forward/right, palm up toward the weapon.
      const fingerDir = _a.copy(barrel).multiplyScalar(style === 'pistol' ? 0.6 : 0.85).addScaledVector(wRight, 0.45).addScaledVector(top, 0.15);
      const palm = _b.copy(top).multiplyScalar(0.85).addScaledVector(wRight, 0.45);
      if (style === 'pistol') {
        fingerDir.copy(top).multiplyScalar(0.7).addScaledVector(barrel, 0.5).addScaledVector(wRight, 0.3);
        palm.copy(wRight).multiplyScalar(0.9).addScaledVector(top, 0.1);
      }
      this.solveHand('L', tgt, fingerDir, palm, w, 'support');
    }
  }

  private supportPoint(wv: WeaponVisual, out: THREE.Vector3): THREE.Vector3 {
    if (wv.support) return wv.support.getWorldPosition(out);
    const obj = wv.object;
    out.set(0, 0, wv.style === 'pistol' ? 0 : 0.35).applyMatrix4(obj.matrixWorld);
    return out;
  }

  /**
   * Put a hand's palm center at `palmTarget`, oriented so its finger direction / palm normal match the
   * given world vectors, then curl the fingers.
   */
  private solveHand(side: Side, palmTarget: THREE.Vector3, fingerDir: THREE.Vector3, palmNormal: THREE.Vector3, weight: number, grip: 'trigger' | 'support' | 'fist'): void {
    const R = this.rig.bones;
    const hr = this.rig.hand[side];
    const up = R[`upperArm${side}`], lo = R[`lowerArm${side}`], hand = R[`hand${side}`];
    if (!up || !lo || !hand || !hr) return;
    fingerDir.normalize();
    // Orthogonalize the palm normal against the finger direction.
    palmNormal.addScaledVector(fingerDir, -palmNormal.dot(fingerDir)).normalize();
    const handTarget = handQuat(hr.fingerLocal, hr.palmLocal, fingerDir, palmNormal, _qh);
    // Wrist target: palm center is ~8 cm along the fingers and ~3 cm out of the palm from the wrist joint.
    const s = this.pc.scale;
    const wrist = _eye.copy(palmTarget).addScaledVector(fingerDir, -0.075 * s).addScaledVector(palmNormal, -0.03 * s);
    // Elbow pole: down and outward, slightly back.
    worldPos(lo, _s);
    const pc = this.pc;
    const pole = _p2.copy(_s).addScaledVector(pc.up, -0.6).addScaledVector(pc.right, side === 'R' ? 0.45 : -0.45).addScaledVector(pc.fwd, -0.15);
    applyTwoBoneIK(up, lo, hand, wrist, pole, weight);
    // Hand orientation.
    worldQuat(hand, _q);
    _q.slerp(handTarget, weight);
    setWorldQuat(hand, _q, true);
    this.curlFingers(side, grip, weight);
  }

  private curlFingers(side: Side, grip: 'trigger' | 'support' | 'fist', weight: number): void {
    const R = this.rig.bones;
    const hand = R[`hand${side}`];
    const hr = this.rig.hand[side];
    if (!hand || !hr) return;
    const hq = worldQuat(hand, _qb);
    const palmW = _u.copy(hr.palmLocal).applyQuaternion(hq);
    for (const f of FINGERS) {
      const angles =
        f === 'thumb'
          ? [0.35, 0.3, 0.25]
          : grip === 'trigger' && f === 'index'
            ? [0.35, 0.55, 0.35]
            : grip === 'support'
              ? [0.7, 0.8, 0.5]
              : [1.15, 1.3, 0.7];
      for (let k = 1; k <= 3; k++) {
        const key = `${f}${k}${side}` as BoneKey;
        const b = R[key];
        if (!b) continue;
        // Start from rest (straight) fingers, then curl toward the palm.
        const restQ = this.rig.restLocal.get(b);
        if (restQ) {
          b.quaternion.copy(restQ);
          b.updateMatrixWorld(true);
        }
        const child = b.children.find((ch) => (ch as THREE.Bone).isBone);
        worldPos(b, _a);
        if (child) worldPos(child, _b).sub(_a);
        else _b.copy(hr.fingerLocal).applyQuaternion(hq);
        if (_b.lengthSq() < 1e-10) continue;
        _b.normalize();
        const axis = _s.crossVectors(_b, f === 'thumb' ? _p.copy(palmW).lerp(_b, 0.3) : palmW);
        if (axis.lengthSq() < 1e-8) continue;
        axis.normalize();
        _q.setFromAxisAngle(axis, angles[k - 1] * weight);
        rotateWorld(b, _q, true);
      }
    }
  }

  /** Blend helpers for other systems. */
  get aimWeight(): number {
    return this.aimW;
  }
}

export { lerp };
