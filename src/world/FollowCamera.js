import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../anim/math.js';

/**
 * Smooth third-person orbit camera.  Mouse drag (or pointer lock) orbits,
 * wheel zooms.  The camera follows a filtered body position (no head bob
 * transferred to the view) and gently drifts behind her while she walks.
 */
export class FollowCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.yaw = Math.PI;        // camera position angle around the target (0 = in front of +Z)
    this.pitch = 0.08;
    this.dist = 3.6;
    this.targetDist = 3.6;
    this.focusHeight = 1.0;
    this.targetFocus = 1.0;
    this.target = new THREE.Vector3(0, 1, 0);
    this.ts = [{ v: 0 }, { v: 0 }, { v: 0 }];
    this.autoFollow = true;
    this.lastInteract = -10;
    this.time = 0;
    this.dragging = false;
    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.dragging = true; this.px = e.clientX; this.py = e.clientY;
      d.setPointerCapture(e.pointerId);
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.dragging && document.pointerLockElement !== d) return;
      const dx = document.pointerLockElement === d ? e.movementX : e.clientX - this.px;
      const dy = document.pointerLockElement === d ? e.movementY : e.clientY - this.py;
      this.px = e.clientX; this.py = e.clientY;
      this.yaw -= dx * 0.0055;
      this.pitch = clamp(this.pitch + dy * 0.004, -0.35, 1.2);
      this.lastInteract = this.time;
    });
    const end = (e) => { this.dragging = false; try { d.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ } };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetDist = clamp(this.targetDist * Math.exp(e.deltaY * 0.001), 0.7, 9);
      this.lastInteract = this.time;
    }, { passive: false });
  }

  /** yaw of the camera's viewing direction (for camera-relative movement). */
  get viewYaw() { return wrapAngle(this.yaw + Math.PI); }

  setPreset(name) {
    const p = {
      full: [3.6, 1.0, 0.08],
      close: [1.7, 1.25, 0.05],
      face: [0.85, 1.55, 0.02],
      feet: [1.5, 0.35, 0.25],
      wide: [6.0, 0.95, 0.15],
    }[name];
    if (!p) return;
    this.targetDist = p[0]; this.targetFocus = p[1]; this.pitch = p[2];
  }

  update(dt, focus, heading, speed) {
    this.time += dt;
    // filtered follow target
    this.target.x = damp(this.target.x, focus.x, this.ts[0], 0.18, dt);
    this.target.z = damp(this.target.z, focus.z, this.ts[2], 0.18, dt);
    this.focusHeight += (this.targetFocus - this.focusHeight) * (1 - Math.exp(-dt / 0.25));
    this.target.y = this.focusHeight;
    this.dist += (this.targetDist - this.dist) * (1 - Math.exp(-dt / 0.15));
    // drift behind her while walking, unless the user recently orbited
    if (this.autoFollow && speed > 0.3 && this.time - this.lastInteract > 2.5) {
      const behind = heading + Math.PI;
      const err = wrapAngle(behind - this.yaw);
      this.yaw += err * (1 - Math.exp(-dt * 0.35 * Math.min(speed, 1.5)));
    }
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    if (this.camera.position.y < 0.08) this.camera.position.y = 0.08;
    this.camera.lookAt(this.target);
  }
}
