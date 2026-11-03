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
  /**
   * How far behind the fighter the camera sits with nobody about (m): close, just over head
   * height and only a little above the line of the shoulders - the floor, the walls and the men
   * coming at you are at your level, not a board seen from above.
   */
  static readonly BASE_DIST = 2.75;
  /** Its height: the view's pitch over the fighter's chest (rad) when the player hasn't moved it. */
  static readonly BASE_PITCH = 0.16;
  camera: THREE.PerspectiveCamera;
  yaw = Math.PI; // camera behind player looking +Z? yaw = direction from focus to camera
  pitch = CameraRig.BASE_PITCH;
  dist = CameraRig.BASE_DIST;
  focus = new THREE.Vector3(0, 1.2, 0);
  private focusVel = new THREE.Vector3();
  private trauma = 0;
  private shakeT = 0;
  fovBase = 60;
  /**
   * Over the shoulder: the camera and where it looks both shifted this far to the right (m), the
   * fighter a little left of the middle with the way ahead past the shoulder (less in a crowd).
   */
  shoulder = 0.3;
  private shoulderK = 0.3;
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
  private crowdPitch = -0.15;

  constructor(aspect: number, public arena: Arena) {
    this.camera = new THREE.PerspectiveCamera(this.fovBase, aspect, 0.05, 120);
  }

  addTrauma(t: number) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  /** Spectating after a run ends: a free camera flying round the room (null while following). */
  private free: { pos: THREE.Vector3; yaw: number; pitch: number; vel: THREE.Vector3 } | null = null;
  get freeCam() {
    return this.free !== null;
  }
  /**
   * Take over from wherever the camera is now (`exact`: from exactly there; else from a vantage
   * point: at least head height and a bit, looking a little down over the room).
   */
  startFree(exact = false) {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const pos = this.camera.position.clone();
    if (!exact) pos.y = Math.max(pos.y, 2.4);
    const pitch = Math.asin(clamp(d.y, -1, 1));
    this.free = { pos, yaw: Math.atan2(d.x, d.z), pitch: exact ? clamp(pitch, -1.45, 1.45) : clamp(pitch, -0.75, -0.15), vel: new THREE.Vector3() };
    this.shot = null;
    this.cineBlend = 0;
    this.trauma = 0;
    this.fovKick = 0;
  }
  stopFree() {
    this.free = null;
  }
  /** Put the lens exactly here (a replay showing the camera as it was). */
  setPose(pos: THREE.Vector3, quat: THREE.Quaternion, fov: number) {
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
  /**
   * Fly: mouse / right stick looks, move keys / left stick fly where you look, `up` rises or sinks,
   * `fast` triples the speed. The motion eases in and out (no lurch on a key), and the camera keeps
   * clear of walls and the floor.
   */
  updateFree(realDt: number, lookDX: number, lookDY: number, mx: number, my: number, up: number, fast: boolean) {
    const f = this.free;
    if (!f) return;
    const k = 0.0022 * this.sensitivity;
    f.yaw -= lookDX * k;
    f.pitch = clamp(f.pitch - lookDY * k * (this.invertY ? -1 : 1), -1.45, 1.45);
    const cp = Math.cos(f.pitch);
    const d = new THREE.Vector3(Math.sin(f.yaw) * cp, Math.sin(f.pitch), Math.cos(f.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(f.yaw), 0, Math.sin(f.yaw));
    const speed = fast ? 10 : 3.6;
    const want = new THREE.Vector3().addScaledVector(d, my).addScaledVector(right, mx);
    want.y += up;
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    f.vel.lerp(want, 1 - Math.exp(-realDt * 10));
    f.pos.addScaledVector(f.vel, realDt);
    // (inside the room, above the floor, under the roof - it floats through crates and people)
    const cb = this.arena.camBounds;
    f.pos.x = clamp(f.pos.x, -HALF_W - cb.out, HALF_W + cb.out);
    f.pos.z = clamp(f.pos.z, -HALF_D - cb.out, HALF_D + cb.out);
    f.pos.y = clamp(f.pos.y, 0.25, Math.max(2, cb.maxY));
    this.camera.position.copy(f.pos);
    this.camera.lookAt(f.pos.clone().add(d));
    if (Math.abs(this.camera.fov - this.fovBase) > 0.01) {
      this.camera.fov = this.fovBase;
      this.camera.updateProjectionMatrix();
    }
    this.lastPos.copy(f.pos);
    this.lastLook.copy(f.pos).add(d);
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
    // ---- framing distance: close behind; further out only as far as a crowd round you needs, and
    // a touch while you're on the move
    const want = CameraRig.BASE_DIST + Math.min(0.8, nearbyEnemies * 0.18) + (moving ? 0.2 : 0) + this.framingDist;
    this.dist = damp(this.dist, want, 1.6, realDt);
    // ---- focus follow (critically damped; a little give, so the camera carries some weight)
    const desired = target.clone();
    desired.y += 0.18;
    const k = 11;
    const accel = desired.clone().sub(this.focus).multiplyScalar(k * k).addScaledVector(this.focusVel, -2 * k);
    this.focusVel.addScaledVector(accel, realDt);
    this.focus.addScaledVector(this.focusVel, realDt);
    if (this.focus.distanceTo(desired) > 4) this.focus.copy(desired);

    // ---- orbit camera position (a little higher over a crowd, to see over the nearest heads)
    const crowd = nearbyEnemies >= 2 ? 0.17 + Math.min(0.08, (nearbyEnemies - 1) * 0.02) : -0.15;
    this.crowdPitch = damp(this.crowdPitch, crowd, 1.2, realDt);
    const pitch = Math.max(this.pitch, this.crowdPitch);
    const cp = Math.cos(pitch);
    const offs = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    const d = this.dist;
    // over the shoulder (both the lens and the point it looks at, so the view's direction is the
    // orbit's; nearer the middle in a crowd, where the fight is all round)
    this.shoulderK = damp(this.shoulderK, this.shoulder * (nearbyEnemies >= 3 ? 0.55 : 1), 1.5, realDt);
    const centre = this.focus.clone().addScaledVector(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), this.shoulderK);
    const wantPos = centre.clone().addScaledVector(offs, d);
    // collision against arena bounds & tall obstacles: pull in fast, ease back out slowly
    const solved = this.resolveCollision(centre, wantPos.clone());
    const ck = solved.distanceTo(centre) / Math.max(0.01, wantPos.distanceTo(centre));
    this.collK = ck < this.collK ? damp(this.collK, ck, 30, realDt) : damp(this.collK, ck, 3.5, realDt);
    let pos = centre.clone().addScaledVector(wantPos.sub(centre), Math.min(this.collK, ck + 0.02));
    pos = this.resolveCollision(centre, pos);
    let look = centre.clone();
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
      cpos = this.resolveCollision(s.focus, cpos, true);
      const e = this.cineBlend * this.cineBlend * (3 - 2 * this.cineBlend);
      // swing around the action on an arc (never through the fighters): interpolate the look point
      // linearly and the camera offset spherically
      const focusA = look.clone();
      const offA = pos.clone().sub(focusA);
      const offB = cpos.clone().sub(s.focus);
      const lenA = offA.length(), lenB = offB.length();
      // swing round in yaw at a blended elevation (a straight slerp between two far-apart views
      // can arc over the top of the action and look straight down)
      const yawA = Math.atan2(offA.x, offA.z), yawB = Math.atan2(offB.x, offB.z);
      const pitA = Math.asin(clamp(offA.y / Math.max(lenA, 1e-4), -1, 1)), pitB = Math.asin(clamp(offB.y / Math.max(lenB, 1e-4), -1, 1));
      const yw = yawA + wrapAngle(yawB - yawA) * e;
      const pt = lerp(pitA, pitB, e);
      const dir = new THREE.Vector3(Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt));
      look.lerp(s.focus, e);
      pos = look.clone().addScaledVector(dir, Math.max(1.5, lerp(lenA, lenB, e)));
      pos = this.resolveCollision(look, pos, true);
      fov = lerp(fov, s.fov, e);
      if (s.t > s.duration + s.blendOut) {
        this.shot = null;
        this.cineBlend = 0;
        // after a shot, align orbit yaw to where the camera ended up to avoid snapping
        const dv = pos.clone().sub(centre);
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
    void dt;
  }

  /** Keep camera within the room and in front of pillars/crates between focus and camera. */
  resolveCollision(focus: THREE.Vector3, pos: THREE.Vector3, cine = false) {
    const m = 0.35;
    // segment vs obstacle boxes (2D slab test)
    const dir = pos.clone().sub(focus);
    const len = dir.length();
    let tMin = 1;
    const cb = this.arena.camBounds;
    for (const o of this.arena.obstacles) {
      // (a room's walls are the clamp below; the rooftop's stair huts are real boxes)
      if (o.kind === 'wall' && !cb.walls) continue;
      // (a knee-high parapet only matters to the low gameplay camera; a shot looks over it)
      if (o.h < 1.0 && (o.kind !== 'ledge' || cine)) continue;
      const t = segBox2D(focus.x, focus.z, pos.x, pos.z, o.minX - m, o.maxX + m, o.minZ - m, o.maxZ + m);
      if (t !== null && t < tMin) {
        // only if the obstacle is tall enough at that height
        const y = focus.y + dir.y * t;
        if (y < o.h + 0.2) tMin = t;
      }
    }
    if (tMin < 1) pos = focus.clone().addScaledVector(dir, Math.max(0.15, tMin - 0.02 / Math.max(len, 1e-3)));
    pos.x = clamp(pos.x, -HALF_W - cb.out, HALF_W + cb.out);
    pos.z = clamp(pos.z, -HALF_D - cb.out, HALF_D + cb.out);
    pos.y = clamp(pos.y, 0.3, cb.maxY);
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
