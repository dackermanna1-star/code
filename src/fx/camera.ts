import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle } from '../core/math';
import { Arena, HALF_D, HALF_W, WALL_H } from '../world/arena';

export interface Shot {
  /** Focus point (world). */
  focus: THREE.Vector3;
  /** Camera position (world). */
  pos: THREE.Vector3;
  fov: number;
  duration: number;
  blendIn: number;
  blendOut: number;
  /** Orbit speed rad/s around focus during the shot. */
  orbit: number;
}

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = Math.PI; // camera behind player looking +Z? yaw = direction from focus to camera
  pitch = 0.3;
  dist = 5;
  focus = new THREE.Vector3(0, 1.2, 0);
  private focusVel = new THREE.Vector3();
  private trauma = 0;
  private shakeT = 0;
  fovBase = 58;
  fovKick = 0;
  private shot: (Shot & { t: number; startPos: THREE.Vector3; startFocus: THREE.Vector3 }) | null = null;
  private cineBlend = 0;
  private lastPos = new THREE.Vector3();
  private lastLook = new THREE.Vector3();
  autoYawTarget: number | null = null;
  framingDist = 0;
  shakeScale = 1;
  sensitivity = 1;
  invertY = false;
  private idleTime = 0;
  private collK = 1;

  constructor(aspect: number, public arena: Arena) {
    this.camera = new THREE.PerspectiveCamera(this.fovBase, aspect, 0.05, 120);
  }

  addTrauma(t: number) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  playShot(s: Shot) {
    this.shot = { ...s, t: 0, startPos: this.camera.position.clone(), startFocus: this.lastLook.clone() };
  }
  get inCinematic() {
    return this.shot !== null && this.cineBlend > 0.5;
  }
  endShot() {
    if (this.shot) this.shot.t = Math.max(this.shot.t, this.shot.duration);
  }

  update(dt: number, realDt: number, target: THREE.Vector3, lookDX: number, lookDY: number, nearbyEnemies: number, moving: boolean) {
    // ---- input orbit
    const sens = 0.0024 * this.sensitivity;
    this.yaw -= lookDX * sens;
    this.pitch += lookDY * sens * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.15, 1.05);
    if (Math.abs(lookDX) + Math.abs(lookDY) > 0.5) this.idleTime = 0;
    else this.idleTime += realDt;
    if (this.autoYawTarget !== null && this.idleTime > 1.2) {
      this.yaw = dampAngle(this.yaw, this.autoYawTarget, 1.2, realDt);
    }
    // ---- framing distance
    const want = 4.6 + Math.min(2.6, nearbyEnemies * 0.42) + this.framingDist;
    this.dist = damp(this.dist, want, 1.6, realDt);
    // ---- focus follow (critically damped)
    const desired = target.clone();
    desired.y += 0.25;
    const k = 14;
    const accel = desired.clone().sub(this.focus).multiplyScalar(k * k).addScaledVector(this.focusVel, -2 * k);
    this.focusVel.addScaledVector(accel, realDt);
    this.focus.addScaledVector(this.focusVel, realDt);
    if (this.focus.distanceTo(desired) > 4) this.focus.copy(desired);

    // ---- orbit camera position
    const cp = Math.cos(this.pitch);
    const offs = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const d = this.dist;
    const wantPos = this.focus.clone().addScaledVector(offs, d);
    // collision against arena bounds & tall obstacles: pull in fast, ease back out slowly
    const solved = this.resolveCollision(this.focus, wantPos.clone());
    const ck = solved.distanceTo(this.focus) / Math.max(0.01, wantPos.distanceTo(this.focus));
    this.collK = ck < this.collK ? damp(this.collK, ck, 30, realDt) : damp(this.collK, ck, 3.5, realDt);
    let pos = this.focus.clone().addScaledVector(wantPos.sub(this.focus), Math.min(this.collK, ck + 0.02));
    pos = this.resolveCollision(this.focus, pos);
    let look = this.focus.clone();
    let fov = this.fovBase;

    // ---- cinematic shot blending
    if (this.shot) {
      const s = this.shot;
      s.t += realDt;
      const inK = smoothstep(0, s.blendIn, s.t);
      const outK = 1 - smoothstep(s.duration, s.duration + s.blendOut, s.t);
      this.cineBlend = Math.min(inK, outK);
      // orbit around focus
      const rel = s.pos.clone().sub(s.focus);
      const ang = s.orbit * s.t;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const relR = new THREE.Vector3(rel.x * c + rel.z * sn, rel.y, -rel.x * sn + rel.z * c);
      let cpos = s.focus.clone().add(relR);
      cpos = this.resolveCollision(s.focus, cpos);
      const e = this.cineBlend * this.cineBlend * (3 - 2 * this.cineBlend);
      pos.lerp(cpos, e);
      look.lerp(s.focus, e);
      fov = lerp(fov, s.fov, e);
      if (s.t > s.duration + s.blendOut) {
        this.shot = null;
        this.cineBlend = 0;
        // after a shot, align orbit yaw to where the camera ended up to avoid snapping
        const dv = pos.clone().sub(this.focus);
        this.yaw = Math.atan2(dv.x, dv.z);
      }
    }

    // ---- shake
    this.shakeT += realDt;
    const tr = this.trauma * this.trauma * this.shakeScale;
    if (tr > 0.0001) {
      const n = (f: number, o: number) => Math.sin(this.shakeT * f + o) * 0.6 + Math.sin(this.shakeT * f * 2.3 + o * 1.7) * 0.4;
      pos.x += n(31, 1) * 0.06 * tr;
      pos.y += n(27, 2) * 0.06 * tr;
      pos.z += n(35, 3) * 0.06 * tr;
      look.x += n(23, 4) * 0.03 * tr;
      look.y += n(29, 5) * 0.03 * tr;
    }
    this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    this.fovKick = damp(this.fovKick, 0, 6, realDt);
    this.camera.fov = fov + this.fovKick;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.lastPos.copy(pos);
    this.lastLook.copy(look);
    void moving;
    void dt;
  }

  /** Keep camera within the room and in front of pillars/crates between focus and camera. */
  resolveCollision(focus: THREE.Vector3, pos: THREE.Vector3) {
    const m = 0.35;
    // segment vs obstacle boxes (2D slab test)
    const dir = pos.clone().sub(focus);
    const len = dir.length();
    let tMin = 1;
    for (const o of this.arena.obstacles) {
      if (o.kind === 'wall') continue;
      if (o.h < 1.0) continue;
      const t = segBox2D(focus.x, focus.z, pos.x, pos.z, o.minX - m, o.maxX + m, o.minZ - m, o.maxZ + m);
      if (t !== null && t < tMin) {
        // only if the obstacle is tall enough at that height
        const y = focus.y + dir.y * t;
        if (y < o.h + 0.2) tMin = t;
      }
    }
    if (tMin < 1) pos = focus.clone().addScaledVector(dir, Math.max(0.15, tMin - 0.02 / Math.max(len, 1e-3)));
    pos.x = clamp(pos.x, -HALF_W + m, HALF_W - m);
    pos.z = clamp(pos.z, -HALF_D + m, HALF_D - m);
    pos.y = clamp(pos.y, 0.3, WALL_H - 1.2);
    return pos;
  }

  /** Camera-relative movement basis: returns world (x,z) for input (mx right, my forward). */
  moveBasis(mx: number, my: number): [number, number] {
    // view forward on the XZ plane (camera -> focus); screen right = (-fz, fx)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    return [fx * my + rx * mx, fz * my + rz * mx];
  }

  forwardYaw() {
    return wrapAngle(this.yaw + Math.PI);
  }
}

/** Returns t in [0,1] where segment enters box, or null. */
function segBox2D(x0: number, z0: number, x1: number, z1: number, minX: number, maxX: number, minZ: number, maxZ: number): number | null {
  let tmin = 0, tmax = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, d, mn, mx] of [[x0, dx, minX, maxX], [z0, dz, minZ, maxZ]] as [number, number, number, number][]) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return null;
    } else {
      let t1 = (mn - p) / d, t2 = (mx - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : null;
}
