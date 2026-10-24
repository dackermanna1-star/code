// Camera rig with chase, orbit, driver, hood, cinematic and free-fly modes.

import * as THREE from 'three';
import type { Vehicle } from '../sim/vehicle/vehicle.ts';
import type { Input } from './input.ts';
import type { World } from '../sim/world.ts';

export type CameraMode = 'chase' | 'orbit' | 'driver' | 'hood' | 'cinematic' | 'free';
export const CAMERA_MODES: CameraMode[] = ['chase', 'orbit', 'driver', 'hood', 'cinematic'];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class CameraRig {
  mode: CameraMode = 'chase';
  readonly camera: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3(0, 5, 10);
  private look = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private chaseDir = new THREE.Vector3(0, 0, 1);
  distance = 6.5;
  height = 2.0;
  orbitAz = 0;
  orbitEl = 0.25;
  orbitDist = 8;
  private lookAz = 0;
  private lookEl = 0;
  private cineTimer = 0;
  private cinePos = new THREE.Vector3();
  private shake = 0;
  private freeYaw = 0;
  private freePitch = -0.2;
  baseFov = 62;
  /** Camera position before collisions (for audio listener). */
  readonly focus = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  setMode(m: CameraMode): void {
    if (m === 'free') {
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.freeYaw = e.y;
      this.freePitch = e.x;
    }
    if (m === 'orbit') {
      this.orbitAz = Math.atan2(this.camera.position.x - this.focus.x, this.camera.position.z - this.focus.z);
    }
    this.mode = m;
    this.cineTimer = 0;
  }

  next(): CameraMode {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.setMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  /** Snap behind the vehicle (after resets/teleports). */
  snap(v: Vehicle): void {
    const f = v.forward;
    this.chaseDir.set(f[0], 0, f[2]).normalize();
    const p = v.position;
    this.pos.set(p[0] - this.chaseDir.x * this.distance, p[1] + this.height + 0.6, p[2] - this.chaseDir.z * this.distance);
    this.look.set(p[0], p[1] + 0.8, p[2]);
    this.vel.set(0, 0, 0);
  }

  update(dt: number, v: Vehicle | null, input: Input, world: World, paused: boolean): void {
    const cam = this.camera;
    const mouse = input.takeMouse();
    if (this.mode === 'free' || !v) {
      this.updateFree(dt, input, mouse);
      return;
    }
    const p = v.position;
    // focus point: vehicle center slightly above
    const R = v.rotation;
    const cx = p[0] + R[1] * 0.75, cy = p[1] + R[4] * 0.75, cz = p[2] + R[7] * 0.75;
    this.focus.set(cx, cy, cz);
    const speed = Math.hypot(v.velocity[0], v.velocity[2]);

    // mouse/gamepad look offsets (chase)
    if (mouse.dx || mouse.dy) {
      this.lookAz -= mouse.dx * 0.005;
      this.lookEl = THREE.MathUtils.clamp(this.lookEl + mouse.dy * 0.004, -0.4, 1.2);
    } else if (!input.mouseDown) {
      this.lookAz *= Math.exp(-dt * 1.5);
      this.lookEl *= Math.exp(-dt * 1.5);
    }
    this.lookAz += -input.lookX * dt * 2.5;
    if (mouse.wheel) {
      this.distance = THREE.MathUtils.clamp(this.distance * (1 + mouse.wheel * 0.1), 3.5, 25);
      this.orbitDist = THREE.MathUtils.clamp(this.orbitDist * (1 + mouse.wheel * 0.1), 3, 40);
    }

    let fov = this.baseFov;
    switch (this.mode) {
      case 'chase': {
        // direction: blend of velocity and heading
        const fx = R[2], fz = R[8];
        const hl = Math.hypot(fx, fz);
        const tgt = _v.set(fx / (hl || 1), 0, fz / (hl || 1));
        if (speed > 3 && v.speed > -1) {
          const vx = v.velocity[0] / speed, vz = v.velocity[2] / speed;
          tgt.lerp(_v2.set(vx, 0, vz), 0.4).normalize();
        } else if (v.speed < -2) {
          // reversing: keep looking forward relative to car
        }
        if (hl < 0.3) tgt.copy(this.chaseDir); // pointing up/down: keep previous
        const k = 1 - Math.exp(-dt * (2.2 + speed * 0.04));
        this.chaseDir.lerp(tgt, k).normalize();
        const dist = this.distance + Math.min(2.5, speed * 0.035);
        const az = Math.atan2(this.chaseDir.x, this.chaseDir.z) + Math.PI + this.lookAz;
        const el = 0.22 + this.lookEl;
        const want = _v2.set(cx + Math.sin(az) * Math.cos(el) * dist, cy + Math.sin(el) * dist + this.height * 0.35, cz + Math.cos(az) * Math.cos(el) * dist);
        // critically damped spring toward the wanted position
        const stiff = 60, damp = 2 * Math.sqrt(stiff);
        const ax = (want.x - this.pos.x) * stiff - this.vel.x * damp;
        const ay = (want.y - this.pos.y) * stiff - this.vel.y * damp;
        const az2 = (want.z - this.pos.z) * stiff - this.vel.z * damp;
        this.vel.x += ax * dt;
        this.vel.y += ay * dt;
        this.vel.z += az2 * dt;
        this.pos.addScaledVector(this.vel, dt);
        // don't lag too far behind at high speed
        const off = _v.copy(this.pos).sub(this.focus);
        const maxD = dist * 1.6;
        if (off.length() > maxD) this.pos.copy(this.focus).addScaledVector(off.normalize(), maxD);
        this.look.lerp(_v.set(cx, cy + 0.4, cz), 1 - Math.exp(-dt * 12));
        fov += Math.min(14, speed * 0.18);
        break;
      }
      case 'orbit': {
        if (mouse.dx || mouse.dy) {
          this.orbitAz -= mouse.dx * 0.006;
          this.orbitEl = THREE.MathUtils.clamp(this.orbitEl + mouse.dy * 0.005, -0.1, 1.45);
        }
        this.orbitAz -= input.lookX * dt * 2;
        this.orbitEl = THREE.MathUtils.clamp(this.orbitEl + input.lookY * dt * 1.5, -0.1, 1.45);
        const d = this.orbitDist;
        this.pos.set(cx + Math.sin(this.orbitAz) * Math.cos(this.orbitEl) * d, cy + Math.sin(this.orbitEl) * d, cz + Math.cos(this.orbitAz) * Math.cos(this.orbitEl) * d);
        this.look.set(cx, cy, cz);
        break;
      }
      case 'driver':
      case 'hood': {
        const P = v.def.shape;
        const local = this.mode === 'driver'
          ? [0.36 * (P.width / 1.83), P.style === 'van' || P.style === 'pickup' || P.style === 'suv' ? 1.55 : 1.18, (P.zWindshieldBase + P.zRoofFront) / 2 - 0.62]
          : [0, P.top[2][1] + 0.12, P.zWindshieldBase + 0.25];
        if (this.mode === 'driver') local[1] = Math.min(local[1], P.top.reduce((m, t) => Math.max(m, t[1]), 0) - 0.22);
        const x = p[0] + R[0] * local[0] + R[1] * local[1] + R[2] * local[2];
        const y = p[1] + R[3] * local[0] + R[4] * local[1] + R[5] * local[2];
        const z = p[2] + R[6] * local[0] + R[7] * local[1] + R[8] * local[2];
        this.pos.set(x, y, z);
        _m.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
        _q.setFromRotationMatrix(_m);
        // three cameras look down -Z; car forward is +Z: rotate 180 deg about Y
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + this.lookAz));
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.lookEl * 0.5));
        cam.position.copy(this.pos);
        cam.quaternion.slerp(_q, this.mode === 'hood' ? 1 : 1 - Math.exp(-dt * 30));
        fov = this.mode === 'driver' ? 70 : 66;
        this.applyFov(fov, dt);
        this.applyShake(dt, paused);
        return;
      }
      case 'cinematic': {
        this.cineTimer -= dt;
        const tooFar = this.cinePos.distanceTo(this.focus) > 70;
        if (this.cineTimer <= 0 || tooFar) {
          // pick a point ahead of the car, to the side
          const fx = speed > 2 ? v.velocity[0] / speed : R[2];
          const fz = speed > 2 ? v.velocity[2] / speed : R[8];
          const ahead = Math.min(40, 6 + speed * 1.6);
          const side = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 8);
          this.cinePos.set(cx + fx * ahead - fz * side, 0, cz + fz * ahead + fx * side);
          this.cinePos.y = world.groundHeight(this.cinePos.x, this.cinePos.z, cy + 30) + 1.2 + Math.random() * 3;
          this.cineTimer = 4 + Math.random() * 3;
        }
        this.pos.copy(this.cinePos);
        this.look.lerp(this.focus, 1 - Math.exp(-dt * 8));
        const d = this.pos.distanceTo(this.focus);
        fov = THREE.MathUtils.clamp(2 * Math.atan(4.5 / d) * 180 / Math.PI, 12, 60);
        break;
      }
    }
    // keep above ground
    const gh = world.terrain ? world.terrain.heightAt(this.pos.x, this.pos.z) : 0;
    if (this.pos.y < gh + 0.35) this.pos.y = gh + 0.35;
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    this.applyFov(fov, dt);
    this.applyShake(dt, paused);
  }

  private applyFov(fov: number, dt: number): void {
    const cam = this.camera;
    const f = cam.fov + (fov - cam.fov) * (1 - Math.exp(-dt * 4));
    if (Math.abs(f - cam.fov) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  private applyShake(dt: number, paused: boolean): void {
    if (this.shake <= 0.001 || paused) return;
    const s = this.shake * 0.12;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.position.z += (Math.random() - 0.5) * s;
    this.shake *= Math.exp(-dt * 6);
  }

  private updateFree(dt: number, input: Input, mouse: { dx: number; dy: number; wheel: number }): void {
    const cam = this.camera;
    if (mouse.dx || mouse.dy) {
      this.freeYaw -= mouse.dx * 0.004;
      this.freePitch = THREE.MathUtils.clamp(this.freePitch - mouse.dy * 0.004, -1.5, 1.5);
    }
    this.freeYaw -= input.lookX * dt * 2;
    this.freePitch = THREE.MathUtils.clamp(this.freePitch - input.lookY * dt * 1.5, -1.5, 1.5);
    cam.quaternion.setFromEuler(new THREE.Euler(this.freePitch, this.freeYaw, 0, 'YXZ'));
    const sp = (input.move.fast ? 40 : 12) * dt;
    _v.set(input.move.x, 0, input.move.z).applyQuaternion(cam.quaternion).multiplyScalar(sp);
    _v.y += input.move.y * sp;
    cam.position.add(_v);
    this.applyFov(this.baseFov, dt);
    this.focus.copy(cam.position);
  }
}
