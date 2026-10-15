// Free-fly debug camera (WASD + mouse, Space/C up/down, Shift fast). Active while debugState.freeCam is true and
// fly input is enabled (?flycam=1 or __game.flycam(true)). Uses raw DOM events so it works without gameplay input.
import * as THREE from 'three';
import { debugState } from '../../core/Debug';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _v = new THREE.Vector3();

export class FlyCamera {
  enabled = false;
  yaw = 0;
  pitch = -0.2;
  speed = 30;
  private keys = new Set<string>();
  private dragging = false;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.enabled && this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.dragging = true;
      if (e.button === 0) canvas.requestPointerLock?.();
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !debugState.freeCam) return;
      if (document.pointerLockElement !== canvas && !this.dragging) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0025, -1.55, 1.55);
    });
    window.addEventListener('wheel', (e) => {
      if (this.enabled) this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 2, 800);
    });
  }

  /** Sync yaw/pitch from the current camera orientation. */
  syncFromCamera(): void {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
  }

  update(dt: number): void {
    if (!this.enabled || !debugState.freeCam) return;
    const fwd = _fwd.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const v = _v.set(0, 0, 0);
    if (this.keys.has('KeyW')) v.add(fwd);
    if (this.keys.has('KeyS')) v.sub(fwd);
    if (this.keys.has('KeyD')) v.add(right);
    if (this.keys.has('KeyA')) v.sub(right);
    if (this.keys.has('Space') || this.keys.has('KeyE')) v.y += 1;
    if (this.keys.has('KeyC') || this.keys.has('KeyQ')) v.y -= 1;
    const mul = this.keys.has('ShiftLeft') ? 4 : 1;
    if (v.lengthSq() > 0) this.camera.position.addScaledVector(v.normalize(), this.speed * mul * dt);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
