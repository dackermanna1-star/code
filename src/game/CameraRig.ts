// Camera: smooth flights between viewpoints, aspect-aware framing and overview panning.

import * as THREE from 'three';
import { VIEWS, type ViewDef } from '../world/layout';
import { ease } from './anim';

export type ViewName = keyof typeof VIEWS;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  view: ViewName = 'overview';
  private from = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40 };
  private to = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40 };
  private t = 1;
  private dur = 0.8;
  readonly target = new THREE.Vector3();
  /** Logical camera position (the shown one adds sway/shake). */
  readonly pos = new THREE.Vector3();
  /** Horizontal pan offset in the overview (narrow screens). */
  panX = 0;
  panLimit = 0;
  private panVel = 0;
  /** Gentle idle sway & pointer parallax. */
  private sway = new THREE.Vector2();
  private swayTarget = new THREE.Vector2();
  private shakeT = 0;
  private shakeAmp = 0;
  onArrive: ((v: ViewName) => void) | null = null;
  private arrived = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.03, 60);
    const v = this.resolve('overview');
    this.camera.position.copy(v.pos);
    this.pos.copy(v.pos);
    this.target.copy(v.target);
    this.camera.fov = v.fov;
    this.camera.lookAt(this.target);
    this.to = { pos: v.pos.clone(), target: v.target.clone(), fov: v.fov };
  }

  /** Viewpoint adapted to the current aspect ratio (pull back so `fit` stays visible). */
  resolve(name: ViewName): { pos: THREE.Vector3; target: THREE.Vector3; fov: number } {
    const def: ViewDef = VIEWS[name];
    const aspect = this.camera ? this.camera.aspect : 16 / 9;
    const pos = def.pos.clone();
    const target = def.target.clone();
    let fov = def.fov;
    if (def.fit) {
      const [hw, hh] = def.fit;
      const dir = pos.clone().sub(target);
      const dist = dir.length();
      dir.normalize();
      const vfov = THREE.MathUtils.degToRad(fov);
      const needV = hh / Math.tan(vfov / 2);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      const needH = hw / Math.tan(hfov / 2);
      let need = Math.max(needV, needH);
      if (name === 'overview') {
        // never pull the overview back too far: allow panning instead
        const maxDist = dist * 1.34;
        if (need > maxDist) {
          const visibleHalfW = Math.tan(hfov / 2) * maxDist;
          this.panLimit = Math.max(0, hw - visibleHalfW);
          need = maxDist;
        } else this.panLimit = 0;
        need = Math.max(need, dist * 0.92);
      } else need = Math.max(need, dist * 0.8);
      pos.copy(target).addScaledVector(dir, need);
      if (aspect < 1.2) fov = Math.min(55, fov * 1.08);
    }
    if (name === 'overview') {
      this.panX = THREE.MathUtils.clamp(this.panX, -this.panLimit, this.panLimit);
      pos.x += this.panX;
      target.x += this.panX;
    }
    return { pos, target, fov };
  }

  go(name: ViewName, dur = 0.85) {
    if (name === this.view && this.t >= 1) return;
    this.view = name;
    this.from = { pos: this.pos.clone(), target: this.target.clone(), fov: this.camera.fov };
    const v = this.resolve(name);
    this.to = { pos: v.pos, target: v.target, fov: v.fov };
    this.t = 0;
    this.dur = dur;
    this.arrived = false;
  }

  get moving(): boolean {
    return this.t < 1;
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const v = this.resolve(this.view);
    this.to = { pos: v.pos, target: v.target, fov: v.fov };
    if (this.t >= 1) {
      this.pos.copy(v.pos);
      this.target.copy(v.target);
      this.camera.fov = v.fov;
    }
  }

  /** Drag-pan the overview (pixels -> metres). */
  pan(dxPixels: number, viewportWidth: number) {
    if (this.view !== 'overview' || this.panLimit <= 0) return;
    const metresPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect * this.pos.distanceTo(this.target)) / viewportWidth;
    this.panX = THREE.MathUtils.clamp(this.panX - dxPixels * metresPerPixel, -this.panLimit, this.panLimit);
    this.panVel = -dxPixels * metresPerPixel * 60;
    this.refreshOverview();
  }

  releasePan() {
    // inertia handled in update
  }

  private refreshOverview() {
    const v = this.resolve('overview');
    this.to = { pos: v.pos, target: v.target, fov: v.fov };
    if (this.t >= 1) {
      this.pos.copy(v.pos);
      this.target.copy(v.target);
    }
  }

  /** Pan the overview so a world x is visible (e.g. when something happens off-screen). */
  ensureVisible(x: number) {
    if (this.panLimit <= 0) return;
    this.panX = THREE.MathUtils.clamp(x - VIEWS.overview.target.x, -this.panLimit, this.panLimit);
    this.refreshOverview();
  }

  setParallax(nx: number, ny: number) {
    this.swayTarget.set(nx, ny);
  }

  shake(amp = 0.01, dur = 0.35) {
    this.shakeAmp = amp;
    this.shakeT = dur;
  }

  update(dt: number, time: number) {
    const pos = this.pos;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = ease.inOutCubic(this.t);
      // arc slightly upwards mid-flight for a pleasant swoop
      const lift = Math.sin(k * Math.PI) * 0.12 * this.from.pos.distanceTo(this.to.pos);
      pos.lerpVectors(this.from.pos, this.to.pos, k);
      pos.y += lift * 0.35;
      this.target.lerpVectors(this.from.target, this.to.target, k);
      this.camera.fov = THREE.MathUtils.lerp(this.from.fov, this.to.fov, k);
      if (this.t >= 1 && !this.arrived) {
        this.arrived = true;
        this.onArrive?.(this.view);
      }
    } else {
      // inertia on overview pan
      if (Math.abs(this.panVel) > 0.0005 && this.view === 'overview') {
        this.panX = THREE.MathUtils.clamp(this.panX + this.panVel * dt, -this.panLimit, this.panLimit);
        this.panVel *= Math.exp(-6 * dt);
        this.refreshOverview();
      }
      pos.lerp(this.to.pos, 1 - Math.exp(-10 * dt));
      this.target.lerp(this.to.target, 1 - Math.exp(-10 * dt));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.to.fov, 1 - Math.exp(-10 * dt));
    }
    this.sway.lerp(this.swayTarget, 1 - Math.exp(-2.5 * dt));
    // subtle life: breathing drift + pointer parallax
    const right = new THREE.Vector3().subVectors(pos, this.target).cross(this.camera.up).normalize();
    const amp = this.view === 'overview' ? 0.035 : 0.012;
    const shown = pos.clone().addScaledVector(right, this.sway.x * amp + Math.sin(time * 0.31) * amp * 0.25);
    shown.y += this.sway.y * amp * 0.6 + Math.sin(time * 0.43) * amp * 0.15;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 3;
      shown.x += (Math.random() - 0.5) * a;
      shown.y += (Math.random() - 0.5) * a;
    }
    this.camera.position.copy(shown);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
}
