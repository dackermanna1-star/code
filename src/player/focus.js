import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { easeInOutCubic } from './springs.js';

// =============================================================================
// FOCUS MODE: ease the camera square-on to an object's +Z face (e.g. the
// seatback IFE screen anchor), release pointer lock so the cursor can be used
// (input mode 'ife'), and ease back on release (input mode 'play').
// The target is re-evaluated every frame, so a reclining seat in front moves
// the view with it.
// =============================================================================

const _p = new THREE.Vector3();
const _z = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Focus {
  constructor(app) {
    this.app = app;
    this.target = null;
    this.opts = null;
    this.blend = 0;          // 0 = free camera, 1 = fully focused
    this.dir = 0;            // +1 entering, -1 leaving, 0 idle
    this.duration = 0.6;
    this.eye = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fov = 50;
  }

  /** True while focused or easing in. */
  get engaged() { return !!this.target && this.dir >= 0; }
  /** Eased blend factor (0..1). */
  get weight() { return easeInOutCubic(clamp(this.blend, 0, 1)); }

  focusOn(object3D, opts = {}) {
    if (!object3D || !object3D.isObject3D) return false;
    const was = this.engaged;
    this.target = object3D;
    this.opts = { distance: 0.45, fovDeg: null, duration: 0.6, ...opts };
    this.duration = Math.max(0.05, Number(this.opts.duration) || 0.6);
    this.dir = 1;
    this._computeTarget();
    if (this.app.input.mode !== 'ife') this.app.input.setMode('ife');
    if (!was) this.app.events.emit('player:focus', { on: true, object: object3D });
    return true;
  }

  release({ instant = false, keepMode = false } = {}) {
    if (!this.target) return false;
    const was = this.engaged;
    this.dir = -1;
    if (instant) { this.blend = 0; this.target = null; this.dir = 0; }
    if (!keepMode && this.app.input.mode === 'ife') this.app.input.setMode('play');
    if (was) this.app.events.emit('player:focus', { on: false });
    return true;
  }

  _computeTarget() {
    const o = this.target;
    if (!o) return;
    o.updateWorldMatrix(true, false);
    o.matrixWorld.decompose(_p, this.quat, _s);
    _z.set(0, 0, 1).applyQuaternion(this.quat);
    const d = Number(this.opts.distance);
    this.eye.copy(_p).addScaledVector(_z, Number.isFinite(d) ? d : 0.45);
    const base = this.app.settings.get('fov') || 72;
    this.fov = Number.isFinite(this.opts.fovDeg) && this.opts.fovDeg > 5 ? this.opts.fovDeg : base;
  }

  update(dt) {
    if (!this.target) return;
    if (this.dir !== 0) this.blend = clamp(this.blend + this.dir * dt / this.duration, 0, 1);
    if (this.dir < 0 && this.blend <= 0) { this.target = null; this.dir = 0; return; }
    this._computeTarget();
  }
}
