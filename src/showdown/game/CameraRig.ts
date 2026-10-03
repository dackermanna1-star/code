import * as THREE from 'three';
import { SD } from '../core/SD';

const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export interface Shot {
  /** camera position over the shot (eased) */
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** look target over the shot */
  lookFrom: THREE.Vector3;
  lookTo: THREE.Vector3;
  dur: number;
  fov?: [number, number];
  roll?: [number, number];
  ease?: 'io' | 'out' | 'in' | 'lin';
  /** keep the final framing when the shot runs out (cutscenes cut, they never snap back to the eyes) */
  hold?: boolean;
  /** turn the view off the subject (radians, + = subject sits right of centre) */
  pan?: number;
  /** optional per-frame override: called with progress 0..1 */
  fn?: (k: number, pos: THREE.Vector3, look: THREE.Vector3) => void;
}

const ease = (e: Shot['ease'], t: number) => {
  t = Math.min(1, Math.max(0, t));
  if (e === 'in') return t * t * t;
  if (e === 'out') return 1 - Math.pow(1 - t, 3);
  if (e === 'lin') return t;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/**
 * The camera: first person by default (eye, yaw, pitch) with trauma shake,
 * FOV kicks and roll; or a scripted cinematic shot.
 */
export class CameraRig {
  trauma = 0;
  fovBase = 76;
  private fovKick = 0;
  private fovVel = 0;
  roll = 0;
  private rollTarget = 0;
  private t = 0;
  shot: Shot | null = null;
  private shotT = 0;
  onShotEnd: (() => void) | null = null;
  /** extra kick to the view (recoil, impacts), decays */
  readonly punch = new THREE.Vector2();
  private punchV = new THREE.Vector2();

  shake(amount: number) {
    this.trauma = Math.min(1.2, this.trauma + amount);
  }

  kick(fov: number) {
    this.fovVel += fov * 18;
  }

  /** Jolts the view (pitch, yaw) in radians. */
  jolt(pitch: number, yaw: number) {
    this.punchV.x += pitch * 30;
    this.punchV.y += yaw * 30;
  }

  leanTo(r: number) {
    this.rollTarget = r;
  }

  play(s: Shot, onEnd?: () => void) {
    this.shot = s;
    this.shotT = 0;
    this.onShotEnd = onEnd ?? null;
  }

  stopShot() {
    this.shot = null;
  }

  get inShot() {
    return !!this.shot;
  }

  update(dt: number, eye: THREE.Vector3, yaw: number, pitch: number) {
    this.t += dt;
    const cam = SD.camera;
    // springs, sub-stepped so they stay stable at any frame rate
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.fovVel += (-this.fovKick * 120 - this.fovVel * 16) * h;
      this.fovKick += this.fovVel * h;
      this.punchV.x += (-this.punch.x * 260 - this.punchV.x * 22) * h;
      this.punchV.y += (-this.punch.y * 260 - this.punchV.y * 22) * h;
      this.punch.x += this.punchV.x * h;
      this.punch.y += this.punchV.y * h;
    }
    this.roll += (this.rollTarget - this.roll) * (1 - Math.exp(-dt * 8));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.31 + o * 1.7) * 0.4;
    const sp = sh * 0.06;
    const sy = sh * 0.05;
    const sr = sh * 0.07;
    if (this.shot) {
      const s = this.shot;
      this.shotT += dt;
      const k = Math.min(1, this.shotT / s.dur);
      const e = ease(s.ease, k);
      const pos = _v.lerpVectors(s.from, s.to, e);
      const look = new THREE.Vector3().lerpVectors(s.lookFrom, s.lookTo, e);
      s.fn?.(k, pos, look);
      cam.position.copy(pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
      if (s.pan) cam.rotateY(s.pan);
      const r = s.roll ? s.roll[0] + (s.roll[1] - s.roll[0]) * e : 0;
      cam.rotateZ(r + n(29, 3) * sr);
      cam.rotateX(n(23, 1) * sp);
      cam.rotateY(n(19, 2) * sy);
      cam.fov = s.fov ? s.fov[0] + (s.fov[1] - s.fov[0]) * e : this.fovBase;
      cam.updateProjectionMatrix();
      if (k >= 1 && s.hold) {
        const cb = this.onShotEnd;
        this.onShotEnd = null;
        cb?.();
      } else if (k >= 1) {
        this.shot = null;
        const cb = this.onShotEnd;
        this.onShotEnd = null;
        cb?.();
      }
      return;
    }
    cam.position.copy(eye);
    cam.position.x += n(13, 5) * sh * 0.05;
    cam.position.y += n(17, 6) * sh * 0.05;
    cam.quaternion.setFromEuler(_e.set(pitch + this.punch.x + n(23, 1) * sp, yaw + this.punch.y + n(19, 2) * sy, this.roll + n(29, 3) * sr, 'YXZ'));
    cam.fov = this.fovBase + this.fovKick;
    cam.updateProjectionMatrix();
  }
}
