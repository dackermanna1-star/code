// Free orbit / fly camera: orbit around a movable focus point, with smoothing.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0.9, 0);
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 11;
    this.sTarget = this.target.clone();
    this.sYaw = this.yaw;
    this.sPitch = this.pitch;
    this.sDist = this.dist;
    this.keys = new Set();
    this.basePos = new THREE.Vector3();
    this.setView(new THREE.Vector3(0, 0.9, -0.3), 0, 0.3, 11.5, true);
  }

  setView(target, yaw, pitch, dist, snap) {
    this.target.copy(target);
    this.yaw = yaw;
    this.pitch = pitch;
    this.dist = dist;
    if (snap) {
      this.sTarget.copy(target);
      this.sYaw = yaw;
      this.sPitch = pitch;
      this.sDist = dist;
    }
  }

  rotate(dx, dy) {
    this.yaw -= dx * 0.0052;
    this.pitch = clamp(this.pitch + dy * 0.0052, -0.12, 1.5);
  }

  pan(dx, dy) {
    const k = this.dist * 0.0013;
    const cy = Math.cos(this.sYaw), sy = Math.sin(this.sYaw);
    // right vector and (camera-space) up projected to world
    this.target.x -= cy * dx * k;
    this.target.z += sy * dx * k;
    this.target.y = clamp(this.target.y + dy * k * Math.cos(this.sPitch), 0.05, 40);
    const fwd = dy * k * Math.sin(this.sPitch);
    this.target.x -= sy * fwd;
    this.target.z -= cy * fwd;
  }

  zoom(delta) {
    this.dist = clamp(this.dist * Math.exp(delta * 0.0011), 0.45, 90);
  }

  /** World ray through a normalised device coordinate. */
  ray(ndcX, ndcY, out) {
    out.origin.copy(this.camera.position);
    out.dir.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return out;
  }

  update(dt, shakeOffset, shakeRot) {
    // keyboard fly
    const k = this.keys;
    let mx = 0, mz = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyE')) my += 1;
    if (k.has('KeyQ')) my -= 1;
    if (mx || mz || my) {
      const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.6 : 1) * Math.max(2.2, this.dist * 0.75) * dt;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      // forward (on the ground plane) points from the camera towards the target
      this.target.x += (-sy * mz + cy * mx) * sp;
      this.target.z += (-cy * mz - sy * mx) * sp;
      this.target.y = clamp(this.target.y + my * sp * 0.7, 0.05, 40);
    }
    this.target.x = clamp(this.target.x, -150, 150);
    this.target.z = clamp(this.target.z, -150, 150);
    const a = 1 - Math.exp(-dt * 14);
    this.sTarget.lerp(this.target, a);
    this.sYaw += (this.yaw - this.sYaw) * a;
    this.sPitch += (this.pitch - this.sPitch) * a;
    this.sDist += (this.dist - this.sDist) * a;
    const cp = Math.cos(this.sPitch), sp = Math.sin(this.sPitch);
    _v.set(Math.sin(this.sYaw) * cp, sp, Math.cos(this.sYaw) * cp).multiplyScalar(this.sDist).add(this.sTarget);
    if (_v.y < 0.12) _v.y = 0.12;
    this.basePos.copy(_v);
    const cam = this.camera;
    cam.position.copy(_v);
    cam.lookAt(this.sTarget);
    if (shakeOffset) {
      _r.setFromMatrixColumn(cam.matrix, 0);
      _f.setFromMatrixColumn(cam.matrix, 1);
      cam.position.addScaledVector(_r, shakeOffset.x).addScaledVector(_f, shakeOffset.y);
      cam.rotation.x += shakeRot.x;
      cam.rotation.y += shakeRot.y;
      cam.rotation.z += shakeRot.z;
    }
    cam.updateMatrixWorld();
  }
}
