// Spectator camera: free flight, orbit, chase, first person (soldier eyes,
// gunner sight, cockpit, FPV drone feed), cinematic (auto director) and a
// top-down overview. Keyboard, mouse and touch input.

import * as THREE from 'three';
import { clamp, damp } from '../core/math.js';
import { Director } from './Director.js';

export const MODES = ['free', 'orbit', 'follow', 'eyes', 'cinematic', 'overview', 'play'];
const SPEEDS = [3, 6, 12, 25, 50, 100, 200, 400];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = 'free';
    this.pos = new THREE.Vector3(0, 120, 600);
    this.yaw = Math.PI;
    this.pitch = -0.25;
    this.vel = new THREE.Vector3();
    this.speedIdx = 4;
    this.fov = 60;
    this.target = null;
    this.orbit = { yaw: 0.6, pitch: 0.35, dist: 30 };
    this.followOff = { yaw: 0, pitch: 0.18 };
    this.keys = new Set();
    this.drag = null;
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this.lookSmooth = new THREE.Vector3();
    this.overview = { x: 0, z: 0, h: 1100 };
    this.director = new Director();
    this.onPick = null;
    this.onPlay = null; // play mode: the player places the camera
    this.fpvActive = false;
    this.snap = true;
    this.attach();
  }

  get speed() {
    return SPEEDS[this.speedIdx];
  }

  attach() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      // (Fails while the pointer is locked to the view in play mode.)
      try {
        d.setPointerCapture?.(e.pointerId);
      } catch (err) {
        void err;
      }
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, moved: false, type: e.pointerType };
    });
    d.addEventListener('pointermove', (e) => {
      const g = this.drag;
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      g.x = e.clientX;
      g.y = e.clientY;
      if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 4) g.moved = true;
      const look = g.button === 2 || (g.type === 'touch') || (g.button === 0 && this.mode !== 'free' && this.mode !== 'overview');
      if (look) this.rotate(dx, dy);
      else if (g.button === 1 || (g.button === 0 && this.mode === 'overview')) this.pan(dx, dy);
      else if (g.button === 0 && this.mode === 'free') this.rotate(dx, dy);
    });
    d.addEventListener('pointerup', (e) => {
      const g = this.drag;
      this.drag = null;
      if (g && !g.moved && g.button === 0 && this.onPick && this.mode !== 'play') this.onPick(e.clientX, e.clientY);
    });
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      const s = Math.sign(e.deltaY);
      if (this.mode === 'free') this.speedIdx = clamp(this.speedIdx - s, 0, SPEEDS.length - 1);
      else if (this.mode === 'overview') this.overview.h = clamp(this.overview.h * (1 + s * 0.12), 250, 2600);
      else if (this.mode === 'orbit' || this.mode === 'follow') this.orbit.dist = clamp(this.orbit.dist * (1 + s * 0.12), 4, 900);
      else if (this.mode === 'eyes') this.fov = clamp(this.fov + s * 5, 15, 75);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  rotate(dx, dy) {
    const k = 0.0042 * (this.fov / 60);
    if (this.mode === 'orbit' || this.mode === 'follow') {
      this.orbit.yaw -= dx * k;
      this.orbit.pitch = clamp(this.orbit.pitch + dy * k, -0.2, 1.45);
    } else if (this.mode === 'eyes') {
      this.followOff.yaw = clamp(this.followOff.yaw - dx * k, -1.5, 1.5);
      this.followOff.pitch = clamp(this.followOff.pitch - dy * k, -0.8, 0.8);
    } else {
      this.yaw -= dx * k;
      this.pitch = clamp(this.pitch - dy * k, -1.5, 1.5);
    }
  }

  pan(dx, dy) {
    if (this.mode === 'overview') {
      const s = this.overview.h / 700;
      this.overview.x -= dx * s;
      this.overview.z -= dy * s;
      return;
    }
    // Grab-and-drag on the horizontal plane.
    const s = 0.05 * Math.max(1, this.pos.y / 40);
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.pos.x += (-rx * dx + fx * dy) * s;
    this.pos.z += (-rz * dx + fz * dy) * s;
  }

  setMode(mode, world) {
    if (!MODES.includes(mode)) return;
    if ((mode === 'orbit' || mode === 'follow' || mode === 'eyes') && !this.target) {
      if (world) this.target = this.director.pickInteresting(world);
      if (!this.target) return;
    }
    if (mode === 'free' && this.mode !== 'free') {
      // Continue from wherever the camera is now.
      this.pos.copy(this.camera.position);
      _e.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = _e.y + Math.PI;
      this.pitch = clamp(_e.x, -1.5, 1.5);
    }
    if (mode === 'overview' && world) {
      // Centre the map on what the camera is looking at.
      const cam = this.camera;
      const dir = cam.getWorldDirection(_v);
      const g = world.terrain.heightAt(cam.position.x, cam.position.z);
      const t = dir.y < -0.05 ? Math.min(1500, (cam.position.y - g) / -dir.y) : 400;
      this.overview.x = clamp(cam.position.x + dir.x * t, -1100, 1100);
      this.overview.z = clamp(cam.position.z + dir.z * t, -1100, 1100);
    }
    if (mode === 'cinematic') this.director.start(world);
    if (mode === 'play') this.target = null;
    if (mode === 'follow' || mode === 'orbit') this.orbit.dist = this.defaultDist(this.target);
    this.followOff.yaw = 0;
    this.followOff.pitch = 0;
    this.mode = mode;
    this.snap = true;
    this.fov = mode === 'eyes' ? 70 : 60;
  }

  defaultDist(u) {
    if (!u) return 30;
    if (u.cat === 'inf') return 6;
    if (u.cat === 'veh') return 22;
    if (u.aclass === 'drone') return 4;
    if (u.aclass === 'jet') return 45;
    if (u.aclass === 'plane') return 80;
    return 40;
  }

  follow(unit, mode = 'follow') {
    this.target = unit;
    this.orbit.dist = this.defaultDist(unit);
    this.orbit.pitch = unit && unit.cat === 'inf' ? 0.25 : 0.3;
    this.orbit.yaw = 0;
    this.mode = mode;
    this.snap = true;
    this.fov = mode === 'eyes' ? 70 : 60;
  }

  // Frame update: dt is real time (camera moves while paused too).
  update(dt, world, shake = 0) {
    const cam = this.camera;
    const terrain = world.terrain;
    if (this.target && (this.target.removed || (this.target.hidden && !this.target.mounted))) {
      // Lost the target: keep looking at where it was.
      if (this.mode === 'eyes' || this.mode === 'follow' || this.mode === 'orbit') {
        const next = this.target.mounted && !this.target.mounted.removed ? this.target.mounted : null;
        this.target = next;
        if (!next) this.setMode('free', world);
      }
    }
    switch (this.mode) {
      case 'free':
        this.updateFree(dt, terrain);
        break;
      case 'orbit':
      case 'follow':
        this.updateFollow(dt, terrain);
        break;
      case 'eyes':
        this.updateEyes(dt, terrain);
        break;
      case 'cinematic':
        this.director.update(dt, world, this);
        break;
      case 'overview':
        this.updateOverview(dt, terrain);
        break;
      case 'play':
        if (this.onPlay) this.onPlay(dt);
        break;
    }
    const fpvShot = this.mode === 'cinematic' && this.director.shot && this.director.shot.type === 'fpv';
    this.fpvActive = (this.mode === 'eyes' || fpvShot) && !!this.target && this.target.aclass === 'drone';
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov += (this.fov - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
    }
    if (shake > 0.001) {
      const t = performance.now() * 0.001;
      const a = shake * 0.6;
      cam.position.x += Math.sin(t * 37) * a * 0.3;
      cam.position.y += Math.sin(t * 43 + 1) * a * 0.3;
      cam.rotateZ(Math.sin(t * 29 + 2) * a * 0.01);
      cam.rotateX(Math.sin(t * 31 + 3) * a * 0.006);
    }
    // Never below ground (a prone player's eyes sit lower).
    const g = terrain.heightAt(cam.position.x, cam.position.z) + (this.mode === 'play' ? 0.15 : 0.6);
    if (cam.position.y < g) cam.position.y = g;
    this.snap = false;
  }

  updateFree(dt, terrain) {
    const k = this.keys;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyE') || k.has('PageUp')) fy += 1;
    if (k.has('KeyQ') || k.has('PageDown')) fy -= 1;
    let sp = this.speed;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) sp *= 4;
    if (k.has('ControlLeft') || k.has('AltLeft')) sp *= 0.25;
    // Look direction (yaw 0 faces +Z).
    const cp = Math.cos(this.pitch);
    const dir = _v.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = _v2.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const want = new THREE.Vector3().addScaledVector(dir, fz).addScaledVector(right, fx);
    want.y += fy;
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(sp);
    this.vel.lerp(want, damp(6, dt));
    this.pos.addScaledVector(this.vel, dt);
    const half = terrain.half + 1500;
    this.pos.x = clamp(this.pos.x, -half, half);
    this.pos.z = clamp(this.pos.z, -half, half);
    this.pos.y = clamp(this.pos.y, terrain.heightAt(this.pos.x, this.pos.z) + 1.2, 3500);
    const cam = this.camera;
    cam.position.copy(this.pos);
    _v.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    cam.lookAt(_v.add(this.pos));
  }

  updateFollow(dt, terrain) {
    const u = this.target;
    if (!u) return;
    const cam = this.camera;
    const center = _v.copy(u.pos);
    center.y += u.cat === 'inf' ? 1.3 : u.cat === 'veh' ? u.spec.height * 0.7 : 0;
    let yaw = this.orbit.yaw;
    if (this.mode === 'follow') yaw += (u.cat === 'air' ? Math.atan2(u.vel.x, u.vel.z) || u.yaw : u.yaw) + Math.PI;
    const dist = this.orbit.dist;
    const p = this.orbit.pitch;
    const off = _v2.set(Math.sin(yaw) * Math.cos(p) * dist, Math.sin(p) * dist, Math.cos(yaw) * Math.cos(p) * dist);
    const want = center.clone().add(off);
    const g = terrain.heightAt(want.x, want.z) + 1;
    if (want.y < g) want.y = g;
    if (this.snap) {
      this.smoothPos.copy(want);
      this.smoothLook.copy(center);
    } else {
      const fast = u.cat === 'air' ? 10 : 6;
      this.smoothPos.lerp(want, damp(this.mode === 'follow' ? fast : 12, dt));
      this.smoothLook.lerp(center, damp(14, dt));
    }
    cam.position.copy(this.smoothPos);
    cam.lookAt(this.smoothLook);
  }

  updateEyes(dt, terrain) {
    const u = this.target;
    if (!u) return;
    const cam = this.camera;
    let yaw = u.yaw;
    let pitch = 0;
    if (u.cat === 'inf') {
      u.eyePos(_v);
      _v.y -= 0.05;
      if (u.aiming) {
        yaw = u.aimYaw;
        pitch = u.aimPitch;
      }
      cam.position.copy(_v);
      // Cameras look along -Z: yaw + PI faces the soldier's +Z; positive X rotation looks up.
      _e.set(pitch + this.followOff.pitch, yaw + Math.PI + this.followOff.yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(_e);
    } else if (u.cat === 'veh') {
      // Gunner's sight just above the gun (the vehicle itself is hidden).
      u.mountPoint('gun', _v, -u.spec.barrelLength + 0.4);
      _v.y += 0.45;
      cam.position.copy(_v);
      u.gunDir(_v2);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _v2);
      cam.quaternion.copy(_q);
      cam.rotateY(this.followOff.yaw);
      cam.rotateX(this.followOff.pitch);
    } else {
      // Cockpit or drone camera.
      const c = u.spec.cockpit || u.spec.camera || [0, 1, 2];
      _v.set(c[0], c[1] + (u.aclass === 'drone' ? 0 : 0.35), c[2]).applyQuaternion(u.quat).add(u.pos);
      cam.position.copy(_v);
      cam.quaternion.copy(u.quat);
      cam.rotateY(Math.PI + this.followOff.yaw);
      cam.rotateX(this.followOff.pitch + (u.aclass === 'drone' ? 0.25 : 0));
    }
    void terrain;
  }

  updateOverview(dt, terrain) {
    const k = this.keys;
    const s = this.overview.h * 0.9 * dt;
    if (k.has('KeyW') || k.has('ArrowUp')) this.overview.z -= s;
    if (k.has('KeyS') || k.has('ArrowDown')) this.overview.z += s;
    if (k.has('KeyA') || k.has('ArrowLeft')) this.overview.x -= s;
    if (k.has('KeyD') || k.has('ArrowRight')) this.overview.x += s;
    this.overview.x = clamp(this.overview.x, -1100, 1100);
    this.overview.z = clamp(this.overview.z, -1100, 1100);
    const cam = this.camera;
    const want = _v.set(this.overview.x, terrain.heightAt(this.overview.x, this.overview.z) + this.overview.h, this.overview.z + this.overview.h * 0.18);
    if (this.snap) cam.position.copy(want);
    else cam.position.lerp(want, damp(5, dt));
    cam.lookAt(this.overview.x, terrain.heightAt(this.overview.x, this.overview.z), this.overview.z);
  }
}
