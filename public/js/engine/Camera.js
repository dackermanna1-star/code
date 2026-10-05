// Classic follow camera: orbits the character's head, right-drag to rotate,
// wheel / I / O to zoom, zooming all the way in gives first person with the
// mouse captured ("Zoom out (O Key) to free mouse").
//
// yaw uses the same convention as Character.facing: the look direction is
// (-sin yaw, 0, -cos yaw). elevation > 0 puts the camera above its subject.
import * as THREE from 'three';
import { sounds } from './Sound.js';

export class ClassicCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.yaw = 0;
    this.elevation = 0.38;
    this.distance = 12;
    this.minDistance = 0.5;
    this.maxDistance = 400;
    this.subject = null; // Character
    this.focus = new THREE.Vector3(0, 5, 0);
    this.dragging = false;
    this.firstPerson = false;
    this.enabled = true;
    this.fixed = null; // {position, lookAt} for scripted shots
    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.firstPerson && document.pointerLockElement === this.dom) {
        this.rotate(-e.movementX * 0.005, e.movementY * 0.005);
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.rotate(-dx * 0.0075, dy * 0.0075);
    });
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    d.addEventListener('click', () => {
      if (this.firstPerson && document.pointerLockElement !== this.dom) this.dom.requestPointerLock?.();
    });
  }

  rotate(dYaw, dElev) {
    this.yaw += dYaw;
    this.elevation = Math.max(-1.39, Math.min(1.39, this.elevation + dElev)); // +-80 degrees
  }

  /** dir > 0 zooms out, dir < 0 zooms in. */
  zoom(dir) {
    if (dir > 0) this.distance = this.distance < 1.5 ? 2 : Math.min(this.maxDistance, this.distance * 1.25);
    else this.distance = this.distance <= 2.1 ? this.minDistance : Math.max(2, this.distance / 1.25);
    this._updateFirstPerson();
    this._click();
  }

  _click() {
    const now = performance.now();
    if (now - (this._lastClick || 0) > 30) { this._lastClick = now; sounds.play('camclick', null, 0.35); }
  }

  /** PageUp/PageDown and the tilt buttons: 15 degree steps. */
  tilt(dir) { this.rotate(0, dir * Math.PI / 12); this._click(); }
  /** "," and "." snap-rotate in 45 degree steps. */
  pan(dir) {
    const step = Math.PI / 4;
    this.yaw = Math.round((this.yaw + dir * step) / step) * step;
    this._click();
  }

  _updateFirstPerson() {
    const fp = this.distance < 1.5;
    if (fp !== this.firstPerson) {
      this.firstPerson = fp;
      if (!fp && document.pointerLockElement === this.dom) document.exitPointerLock?.();
      if (fp) this.dom.requestPointerLock?.();
      this.onFirstPerson?.(fp);
    }
  }

  /** Horizontal look direction, for camera-relative movement. */
  get flatForward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get flatRight() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  update(dt) {
    const cam = this.camera;
    if (this.fixed) {
      cam.position.copy(this.fixed.position);
      cam.lookAt(this.fixed.lookAt);
      return;
    }
    if (this.subject && this.subject.alive) {
      const target = this.subject.rootPosition.clone();
      target.y += 1.5;
      this.focus.lerp(target, Math.min(1, dt * 30));
    }
    const ce = Math.cos(this.elevation);
    const offset = new THREE.Vector3(Math.sin(this.yaw) * ce, Math.sin(this.elevation), Math.cos(this.yaw) * ce).multiplyScalar(this.distance);
    cam.position.copy(this.focus).add(offset);
    cam.lookAt(this.focus);
    if (this.subject && this.subject.alive) {
      this.subject.root.visible = !this.firstPerson;
      if (this.firstPerson) this.subject.facing = this.yaw;
    }
  }
}
