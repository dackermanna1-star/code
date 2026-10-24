// First-person camera producing view / projection matrices.
import { mat4, mat4LookAt, mat4Perspective } from './math';
import type { CameraState } from '../render/renderer';

export class Camera implements CameraState {
  x = 0; y = 0; z = 0;
  yaw = 0;   // radians, 0 = looking towards -Z
  pitch = 0; // radians, positive = up
  roll = 0;
  fov = 75 * Math.PI / 180;
  aspect = 16 / 9;
  near = 0.05;
  far = 900;
  readonly view = mat4();
  readonly proj = mat4();
  /** extra offsets (camera shake) */
  shakeX = 0; shakeY = 0;

  forward(out: { x: number; y: number; z: number }): void {
    const cp = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cp;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * cp;
  }

  update(aspect: number): void {
    this.aspect = aspect;
    const p = this.pitch + this.shakeY, yw = this.yaw + this.shakeX;
    const cp = Math.cos(p);
    const fx = -Math.sin(yw) * cp, fy = Math.sin(p), fz = -Math.cos(yw) * cp;
    // roll: rotate the up vector around forward
    let ux = 0, uy = 1, uz = 0;
    if (this.roll !== 0) {
      const rx = -Math.cos(yw), rz = Math.sin(yw); // right vector
      const c = Math.cos(this.roll), s = Math.sin(this.roll);
      ux = rx * s; uy = c; uz = rz * s;
    }
    mat4LookAt(this.view, this.x, this.y, this.z, this.x + fx, this.y + fy, this.z + fz, ux, uy, uz);
    mat4Perspective(this.proj, this.fov, aspect, this.near, this.far);
  }
}
