import * as THREE from 'three';
import { Ease, clamp, damp, noise } from './math';
import { Spring } from './Tween';

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  /** focus distance for DOF moments (world units) */
  focus?: number;
}

export const shot = (pos: [number, number, number], target: [number, number, number], fov = 40): Shot => ({
  pos: new THREE.Vector3(...pos),
  target: new THREE.Vector3(...target),
  fov,
});

/**
 * Station-based camera. Holds a "base" shot and blends toward new shots with
 * arcing, quaternion-slerped transitions. On top of the base shot it layers:
 *  - pointer parallax (the view leans slightly toward the cursor)
 *  - idle sway (slow noise)
 *  - trauma-based shake (impacts)
 *  - FOV punch (zoom kicks on satisfying moments)
 *  - look-offset nudges (small reframes toward the action)
 */
export class CameraRig {
  readonly base: Shot;
  private from: Shot | null = null;
  private to: Shot | null = null;
  private tT = 0;
  private tDur = 1;
  private tEase: (t: number) => number = Ease.inOutCubic;
  private tArc = 0;
  private tResolve: (() => void) | null = null;
  private qFrom = new THREE.Quaternion();
  private qTo = new THREE.Quaternion();

  private trauma = 0;
  private fovPunch = new Spring(0, 260, 16);
  private recoilPitch = new Spring(0, 230, 17);
  private recoilYaw = new Spring(0, 230, 17);
  /** FOV multiplier (aiming zooms in a touch) */
  zoom = 1;
  private zoomCur = 1;
  /** aiming: pushing the cursor to a screen edge turns the view (0 = off, 1 = on) */
  aimLook = 0;
  private aimLookCur = 0;
  /** accumulated aim-look turn (radians) */
  lookYaw = 0;
  lookPitch = 0;
  /** edge-scrolling needs a hovering mouse; touch screens only get the direct lean */
  edgeScroll = true;
  /** world-space lean while aiming (over the counter) */
  readonly lean = new THREE.Vector3();
  private leanCur = new THREE.Vector3();
  private nudge = new THREE.Vector3();
  private nudgeTarget = new THREE.Vector3();
  pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  parallax = 1;
  sway = 1;
  shakeScale = 1;
  motionScale = 1;
  private time = 0;

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpE = new THREE.Euler();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(readonly camera: THREE.PerspectiveCamera, initial: Shot) {
    this.base = { pos: initial.pos.clone(), target: initial.target.clone(), fov: initial.fov };
    this.applyBase();
  }

  /**
   * Shots are composed for 16:9. On narrower screens (tablets, phones) widen
   * the vertical FOV so the horizontal view keeps what the shot framed,
   * capped before the perspective distorts too much.
   */
  private fitAspect(fov: number): number {
    const aspect = this.camera.aspect;
    const design = 16 / 9;
    if (aspect >= design) return fov;
    const half = THREE.MathUtils.degToRad(fov / 2);
    const hHalf = Math.atan(Math.tan(half) * design);
    const wanted = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / aspect));
    return Math.min(wanted, Math.max(fov, 78));
  }

  get transitioning(): boolean {
    return this.to !== null;
  }

  private lookQuat(pos: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    this.tmpM.lookAt(pos, target, this.up);
    return out.setFromRotationMatrix(this.tmpM);
  }

  /** Blend to a new shot. `arc` lifts the path mid-way (meters). */
  go(next: Shot, duration = 0.7, opts: { ease?: (t: number) => number; arc?: number } = {}): Promise<void> {
    if (this.tResolve) this.tResolve();
    if (duration <= 0) {
      this.base.pos.copy(next.pos);
      this.base.target.copy(next.target);
      this.base.fov = next.fov;
      this.to = null;
      this.applyBase();
      return Promise.resolve();
    }
    // Start from the current (possibly mid-transition) base pose so interrupts are seamless.
    this.from = { pos: this.currentBasePos.clone(), target: this.base.target.clone(), fov: this.currentFov };
    this.qFrom.copy(this.currentBaseQuat);
    this.to = { pos: next.pos.clone(), target: next.target.clone(), fov: next.fov };
    this.lookQuat(this.to.pos, this.to.target, this.qTo);
    this.tT = 0;
    this.tDur = duration * this.motionScale + (1 - this.motionScale) * 0.15;
    this.tEase = opts.ease ?? Ease.inOutCubic;
    this.tArc = opts.arc ?? 0;
    return new Promise((r) => (this.tResolve = r));
  }

  private currentBasePos = new THREE.Vector3();
  private currentBaseQuat = new THREE.Quaternion();
  private currentFov = 40;

  private applyBase(): void {
    this.currentBasePos.copy(this.base.pos);
    this.lookQuat(this.base.pos, this.base.target, this.currentBaseQuat);
    this.currentFov = this.base.fov;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount * this.shakeScale, 0, 1);
  }

  punch(amount: number): void {
    this.fovPunch.kick(-amount * 60 * this.shakeScale);
  }

  /** Weapon recoil: the view snaps up (radians/s impulse) and springs back. */
  kick(pitch: number, yaw = 0): void {
    const k = 0.35 + 0.65 * this.shakeScale;
    this.recoilPitch.kick(pitch * k);
    this.recoilYaw.kick(yaw * k);
  }

  /** Small reframing offset (world space) that eases in/out. */
  setNudge(v: THREE.Vector3 | null): void {
    if (v) this.nudgeTarget.copy(v);
    else this.nudgeTarget.set(0, 0, 0);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.to && this.from) {
      this.tT += dt / this.tDur;
      const raw = clamp(this.tT);
      const e = this.tEase(raw);
      this.currentBasePos.lerpVectors(this.from.pos, this.to.pos, e);
      if (this.tArc) this.currentBasePos.y += Math.sin(Math.PI * e) * this.tArc;
      this.currentBaseQuat.slerpQuaternions(this.qFrom, this.qTo, e);
      this.currentFov = this.from.fov + (this.to.fov - this.from.fov) * e;
      if (raw >= 1) {
        this.base.pos.copy(this.to.pos);
        this.base.target.copy(this.to.target);
        this.base.fov = this.to.fov;
        this.to = null;
        this.from = null;
        this.applyBase();
        const r = this.tResolve;
        this.tResolve = null;
        r?.();
      }
    }

    const cam = this.camera;
    cam.position.copy(this.currentBasePos);
    cam.quaternion.copy(this.currentBaseQuat);

    // Nudge (world-space reframing)
    this.nudge.x = damp(this.nudge.x, this.nudgeTarget.x, 4, dt);
    this.nudge.y = damp(this.nudge.y, this.nudgeTarget.y, 4, dt);
    this.nudge.z = damp(this.nudge.z, this.nudgeTarget.z, 4, dt);
    cam.position.add(this.nudge);

    // Leaning in to aim
    this.leanCur.x = damp(this.leanCur.x, this.lean.x, 5, dt);
    this.leanCur.y = damp(this.leanCur.y, this.lean.y, 5, dt);
    this.leanCur.z = damp(this.leanCur.z, this.lean.z, 5, dt);
    cam.position.add(this.leanCur);
    this.aimLookCur = damp(this.aimLookCur, this.aimLook, 5, dt);
    const al = this.aimLookCur;

    // Pointer parallax in camera space
    this.pointerSmooth.x = damp(this.pointerSmooth.x, this.pointer.x, 3 + al * 3, dt);
    this.pointerSmooth.y = damp(this.pointerSmooth.y, this.pointer.y, 3 + al * 3, dt);
    const p = this.parallax * this.motionScale;
    this.tmpV.set(this.pointerSmooth.x * 0.03 * p, this.pointerSmooth.y * 0.018 * p, 0).applyQuaternion(cam.quaternion);
    cam.position.add(this.tmpV);
    // aiming: the cursor near an edge keeps turning the view that way (stable in the middle,
    // so the crosshair stays put on a target); a little direct lean toward the cursor on top
    if (this.aimLook > 0) {
      const edge = (v: number) => {
        if (!this.edgeScroll) return 0;
        const a = Math.abs(v);
        return a < 0.7 ? 0 : Math.sign(v) * Math.min(1, (a - 0.7) / 0.28) ** 2;
      };
      this.lookYaw = clamp(this.lookYaw - edge(this.pointer.x) * 1.15 * dt, -0.6, 0.6);
      this.lookPitch = clamp(this.lookPitch + edge(this.pointer.y) * 0.95 * dt, -0.62, 0.14);
    } else {
      this.lookYaw = damp(this.lookYaw, 0, 5, dt);
      this.lookPitch = damp(this.lookPitch, 0, 5, dt);
    }
    const yaw = -this.pointerSmooth.x * (0.012 * p + 0.05 * al) + this.lookYaw;
    const pitch = this.pointerSmooth.y * (0.008 * p + 0.04 * al) + this.lookPitch;

    // Idle sway
    const s = this.sway * this.motionScale;
    const t = this.time;
    const swayYaw = noise.noise2(t * 0.11, 3.7) * 0.004 * s;
    const swayPitch = noise.noise2(t * 0.09, 9.1) * 0.003 * s;
    const swayRoll = noise.noise2(t * 0.07, 17.3) * 0.002 * s;

    // Shake (trauma^2)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const shYaw = noise.noise2(t * 22, 1.1) * 0.02 * sh;
    const shPitch = noise.noise2(t * 22, 5.3) * 0.02 * sh;
    const shRoll = noise.noise2(t * 22, 8.8) * 0.03 * sh;

    const rp = this.recoilPitch.update(dt);
    const ry = this.recoilYaw.update(dt);
    this.tmpE.set(pitch + swayPitch + shPitch + rp, yaw + swayYaw + shYaw + ry, swayRoll + shRoll, 'YXZ');
    this.tmpQ.setFromEuler(this.tmpE);
    cam.quaternion.multiply(this.tmpQ);

    const punch = this.fovPunch.update(dt);
    this.zoomCur = damp(this.zoomCur, this.zoom, 6, dt);
    const fov = this.fitAspect(this.currentFov) * this.zoomCur + punch;
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
