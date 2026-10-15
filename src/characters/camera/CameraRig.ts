// ICameraRig: PUBG-style third/first-person camera with aim/ADS, collision, free look, recoil, shake,
// and vehicle / skydive / plane / spectate / deathcam / menu modes. Runs at render rate after animation.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { Priority } from '../../core/Engine';
import { debugState } from '../../core/Debug';
import type { CameraMode, ICameraRig, ICharacter } from '../../core/contracts';
import type { Perspective } from '../../core/types';
import { DEG, clamp, damp, lerp, lerpAngle, dirFromYawPitch } from '../../core/math';
import type { Character } from '../Character';
import type { PlayerController } from '../player/PlayerController';
import { CameraCollider } from './CameraCollider';
import { Shake } from './Shake';

/** Horizontal FOVs (deg). */
const TPP_HFOV = 88;
const IRON_HFOV = 70;
/** 1x reference horizontal FOV for scope magnification. */
const SCOPE_REF_HFOV = 80;
const ADS_TIME = 0.18;
const AIM_TIME = 0.15;

/** TPP camera layout relative to the head pivot. */
const TPP = { dist: 2.65, right: 0.58, up: 0.28 };
const TPP_AIM = { dist: 1.25, right: 0.52, up: 0.14 };
const TPP_PRONE = { dist: 2.3, right: 0.5, up: 0.32 };

const _pivot = new THREE.Vector3();
const _want = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _sight = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _vpos = new THREE.Vector3();

export function hfovToVfov(hfovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((hfovDeg * DEG) / 2) / Math.max(0.1, aspect))) / DEG;
}

export function scopeHfov(zoom: number): number {
  if (zoom <= 1.01) return IRON_HFOV;
  return (2 * Math.atan(Math.tan((SCOPE_REF_HFOV * DEG) / 2) / zoom)) / DEG;
}

export class CameraRig implements ICameraRig {
  mode: CameraMode = 'menu';
  perspective: Perspective = 'tpp';
  zoom = 1;
  fovH = TPP_HFOV;
  adsBlend = 0;
  private aimBlend = 0;
  private target: Character | null = null;
  private readonly collider = new CameraCollider();
  private readonly shaker = new Shake();
  private controller: PlayerController | null = null;
  private deathTime = 0;
  private menuAngle = 0;
  private fppActive = false;
  /** Smoothed yaw/pitch for spectating. */
  private specYaw = 0;
  private specPitch = 0;
  private prevMode: CameraMode = 'menu';
  private sprintBlend = 0;
  private distSmooth = TPP.dist;

  install(controller: PlayerController): void {
    this.controller = controller;
    this.perspective = ctx.settings.data.gameplay.perspective ?? 'tpp';
    ctx.engine.addSystem({ name: 'cameraRig', priority: Priority.Camera, update: (dt) => this.update(dt) });
    ctx.events.on('settings:changed', ({ section }) => {
      if (section === 'gameplay' || section === 'all') this.perspective = ctx.settings.data.gameplay.perspective ?? this.perspective;
    });
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.prevMode = this.mode;
    this.mode = mode;
    if (mode === 'deathcam') this.deathTime = 0;
    if (mode !== 'player') this.setFirstPersonVisual(null);
  }

  spectate(c: ICharacter | null): void {
    this.target = (c as Character | null) ?? null;
    if (c) {
      this.specYaw = c.yaw;
      this.specPitch = c.pitch;
      this.setMode('spectate');
    } else if (this.mode === 'spectate') {
      this.setMode(ctx.player ? 'player' : 'menu');
    }
  }

  setPerspective(p: Perspective): void {
    this.perspective = p;
  }

  shake(intensity: number, duration: number): void {
    this.shaker.add(intensity, duration);
  }

  /** The character the camera currently follows. */
  get followed(): Character | null {
    if (this.mode === 'spectate') return this.target;
    return (ctx.player as Character | null) ?? null;
  }

  private update(dt: number): void {
    if (debugState.freeCam || this.mode === 'free') return;
    const cam = ctx.camera;
    this.shaker.update(dt);
    try {
      switch (this.mode) {
        case 'player':
          this.updatePlayer(dt, cam);
          break;
        case 'spectate':
          this.updateSpectate(dt, cam);
          break;
        case 'deathcam':
          this.updateDeathcam(dt, cam);
          break;
        case 'plane':
          this.updatePlane(dt, cam);
          break;
        case 'menu':
          this.updateMenu(dt, cam);
          break;
      }
    } catch (e) {
      console.error('[cameraRig] update failed', e);
      this.mode = 'menu';
    }
    this.shaker.apply(cam);
  }

  // ── player ─────────────────────────────────────────────────────────────────
  private updatePlayer(dt: number, cam: THREE.PerspectiveCamera): void {
    const c = (ctx.player as Character | null) ?? null;
    if (!c) return this.updateMenu(dt, cam);
    if (c.lifeState === 'dead') {
      this.setMode('deathcam');
      return this.updateDeathcam(dt, cam);
    }
    if (c.mode === 'plane') return this.updatePlane(dt, cam);
    const fl = this.controller;
    const yaw = c.intent.yaw + (fl?.freeLookYaw ?? 0) + c.recoilYaw;
    const pitch = clamp(c.intent.pitch + (fl?.freeLookPitch ?? 0) + c.recoilPitch, -1.52, 1.52);
    if (c.mode === 'skydive') return this.updateSkydive(dt, cam, c, yaw, pitch);
    if (c.mode === 'vehicle' && !c.isAiming) return this.updateVehicle(dt, cam, c, yaw, pitch);
    this.updateOnFoot(dt, cam, c, yaw, pitch, true);
  }

  /** On-foot camera (TPP/FPP/aim/ADS) for a character with the given view angles. */
  private updateOnFoot(dt: number, cam: THREE.PerspectiveCamera, c: Character, yaw: number, pitch: number, own: boolean): void {
    const fpp = this.perspective === 'fpp';
    const optic = c.activeWeapon ? ctx.combat.getOptic?.(c.activeWeapon) : undefined;
    const zoom = optic?.zoom ?? 1;
    this.adsBlend = clamp(this.adsBlend + (c.isADS ? dt : -dt) / ADS_TIME, 0, 1);
    this.aimBlend = clamp(this.aimBlend + (c.isAiming && !c.isADS ? dt : -dt) / AIM_TIME, 0, 1);
    this.sprintBlend = clamp(this.sprintBlend + (c.isSprinting ? dt : -dt) * 3, 0, 1);
    const ads = smooth(this.adsBlend);
    const aim = smooth(this.aimBlend);

    // Camera orientation.
    _euler.set(pitch, yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(_euler);

    // Eye / pivot from the interpolated visual.
    const visual = c.visual;
    const vroot = visual?.root;
    if (vroot) _vpos.copy(vroot.position);
    else _vpos.copy(c.position);
    const eyeVisual = visual && visual.getEyeWorld(_tmp) ? _tmp : null;
    c.getEyePosition(_tmp2).sub(c.position).add(_vpos); // analytic eye at the interpolated position
    const eye = eyeVisual ?? _tmp2;

    let pos: THREE.Vector3;
    if (fpp) {
      pos = _want.copy(eyeVisual ?? _tmp2);
      // Push the camera slightly forward of the head so the neck/shoulders don't clip.
      dirFromYawPitch(yaw, pitch, _dir);
      pos.addScaledVector(_dir, 0.08);
    } else {
      // Pivot above the head; shoulder offset to the right; collide back to the camera.
      const prone = c.stance === 'prone' && c.mode === 'ground';
      const L = prone ? TPP_PRONE : TPP;
      const dist = lerp(L.dist + this.sprintBlend * 0.25, TPP_AIM.dist, aim);
      const rightOff = lerp(L.right, TPP_AIM.right, aim);
      const upOff = lerp(L.up, TPP_AIM.up, aim);
      _pivot.copy(_tmp2);
      _pivot.y += upOff;
      // Smooth stance height changes are already in stanceHeight; keep the pivot steady while leaning.
      _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const shoulder = _tmp.copy(_pivot).addScaledVector(_right, rightOff);
      const exclude = c.body.collider;
      const sideFree = this.collider.cast(_pivot, shoulder, 0.18, exclude, null);
      shoulder.copy(_pivot).addScaledVector(_right, rightOff * sideFree);
      dirFromYawPitch(yaw, pitch, _dir);
      _want.copy(shoulder).addScaledVector(_dir, -dist);
      const back = this.collider.cast(shoulder, _want, 0.2, exclude, null);
      const d = dist * back;
      // Pull in instantly, ease back out.
      this.distSmooth = d < this.distSmooth ? d : lerp(this.distSmooth, d, damp(6, dt));
      pos = _want.copy(shoulder).addScaledVector(_dir, -this.distSmooth);
    }

    // ADS: move to the sight eye (weapon model) or the eye position.
    if (ads > 0) {
      const sight = visual && visual.getSightEyeWorld(_sight) ? _sight : _sight.copy(eye);
      pos.lerp(sight, ads);
    }
    cam.position.copy(pos);

    // FOV.
    const baseH = fpp ? ctx.settings.data.graphics.fov : TPP_HFOV;
    const aimH = lerp(baseH, baseH * 0.9, aim) + this.sprintBlend * 3;
    const adsH = scopeHfov(zoom);
    this.fovH = lerp(aimH, Math.min(adsH, baseH), ads);
    this.zoom = ads > 0.5 ? zoom : 1;
    this.applyFov(cam, this.fovH);

    if (own) this.setFirstPersonVisual(fpp || ads > 0.35 ? c : null);
  }

  private setFirstPersonVisual(c: Character | null): void {
    const p = (ctx.player as Character | null) ?? null;
    const want = !!c;
    if (want !== this.fppActive || (p && p.visual && want)) {
      this.fppActive = want;
      p?.visual?.setFirstPerson(want);
    }
  }

  private applyFov(cam: THREE.PerspectiveCamera, hfov: number): void {
    const v = hfovToVfov(hfov, cam.aspect);
    if (Math.abs(cam.fov - v) > 0.01) {
      cam.fov = v;
      cam.updateProjectionMatrix();
    }
  }

  // ── vehicle ────────────────────────────────────────────────────────────────
  private updateVehicle(dt: number, cam: THREE.PerspectiveCamera, c: Character, yaw: number, pitch: number): void {
    const v = c.vehicle;
    if (!v) return this.updateOnFoot(dt, cam, c, yaw, pitch, true);
    this.adsBlend = this.aimBlend = 0;
    this.zoom = 1;
    const big = /uaz|pickup|truck|boat/.test(v.kind);
    const dist = big ? 7 : v.kind.includes('motorcycle') ? 5 : 6;
    _pivot.copy(v.root.position);
    _pivot.y += big ? 2.0 : 1.6;
    _euler.set(clamp(pitch, -1.2, 0.9), yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(_euler);
    dirFromYawPitch(yaw, clamp(pitch, -1.2, 0.9), _dir);
    _want.copy(_pivot).addScaledVector(_dir, -dist);
    const k = this.collider.cast(_pivot, _want, 0.25, c.body.collider, v);
    cam.position.copy(_pivot).addScaledVector(_dir, -dist * k);
    this.fovH = TPP_HFOV + clamp(v.speedKmh / 25, 0, 6);
    this.applyFov(cam, this.fovH);
    this.setFirstPersonVisual(this.perspective === 'fpp' ? c : null);
    if (this.perspective === 'fpp') {
      c.getEyePosition(cam.position);
      _euler.set(pitch, yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(_euler);
    }
  }

  // ── freefall / parachute ───────────────────────────────────────────────────
  private updateSkydive(dt: number, cam: THREE.PerspectiveCamera, c: Character, yaw: number, pitch: number): void {
    this.adsBlend = this.aimBlend = 0;
    this.zoom = 1;
    const chute = c.sky.phase === 'parachute';
    const dist = chute ? 6.5 : 4.2;
    _pivot.copy(c.visual?.root.position ?? c.position);
    _pivot.y += chute ? 1.6 : 1.0;
    const p = clamp(pitch, -1.45, 1.0);
    _euler.set(p, yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(_euler);
    dirFromYawPitch(yaw, p, _dir);
    _want.copy(_pivot).addScaledVector(_dir, -dist);
    const k = this.collider.cast(_pivot, _want, 0.25, c.body.collider, null);
    cam.position.copy(_pivot).addScaledVector(_dir, -dist * k);
    // Speed sensation in freefall.
    const speed = c.velocity.length();
    this.fovH = TPP_HFOV + (chute ? 0 : clamp((speed - 40) / 5, 0, 6));
    this.applyFov(cam, this.fovH);
    this.setFirstPersonVisual(null);
    void dt;
  }

  // ── plane ─────────────────────────────────────────────────────────────────
  private updatePlane(_dt: number, cam: THREE.PerspectiveCamera): void {
    const c = (ctx.player as Character | null) ?? null;
    this.adsBlend = this.aimBlend = 0;
    this.zoom = 1;
    if (!c) return;
    const yaw = c.intent.yaw;
    const pitch = clamp(c.intent.pitch, -1.2, 0.6);
    _pivot.copy(c.visual?.root.position ?? c.position);
    _euler.set(pitch, yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(_euler);
    dirFromYawPitch(yaw, pitch, _dir);
    cam.position.copy(_pivot).addScaledVector(_dir, -24).addScaledVector(_up, 4);
    this.fovH = TPP_HFOV;
    this.applyFov(cam, this.fovH);
  }

  // ── spectate ──────────────────────────────────────────────────────────────
  private updateSpectate(dt: number, cam: THREE.PerspectiveCamera): void {
    const t = this.target;
    if (!t || t.lifeState === 'dead') {
      if (t && t.lifeState === 'dead') {
        // Keep looking at the body until the match picks another target.
        this.orbit(dt, cam, t, 4.5);
      }
      return;
    }
    const k = damp(12, dt);
    this.specYaw = lerpAngle(this.specYaw, t.yaw, k);
    this.specPitch = lerp(this.specPitch, t.pitch, k);
    if (t.mode === 'skydive') return this.updateSkydive(dt, cam, t, this.specYaw, this.specPitch);
    if (t.mode === 'vehicle' && t.vehicle) return this.updateVehicle(dt, cam, t, this.specYaw, this.specPitch);
    this.updateOnFoot(dt, cam, t, this.specYaw, this.specPitch, false);
  }

  // ── deathcam ──────────────────────────────────────────────────────────────
  private updateDeathcam(dt: number, cam: THREE.PerspectiveCamera): void {
    const c = (ctx.player as Character | null) ?? null;
    this.deathTime += dt;
    this.adsBlend = this.aimBlend = 0;
    this.zoom = 1;
    this.setFirstPersonVisual(null);
    if (!c) return;
    if (c.lifeState !== 'dead' && this.prevMode === 'player') {
      this.setMode('player');
      return;
    }
    this.orbit(dt, cam, c, 3.2 + Math.min(3, this.deathTime * 0.6));
  }

  private orbit(dt: number, cam: THREE.PerspectiveCamera, c: Character, dist: number): void {
    this.menuAngle += dt * 0.25;
    _pivot.copy(c.visual?.root.position ?? c.position);
    _pivot.y += 0.6;
    _want.set(Math.sin(this.menuAngle) * dist, 1.6 + dist * 0.35, Math.cos(this.menuAngle) * dist).add(_pivot);
    const k = this.collider.cast(_pivot, _want, 0.2, c.body.collider, null);
    cam.position.lerpVectors(_pivot, _want, k);
    cam.lookAt(_pivot);
    this.fovH = TPP_HFOV;
    this.applyFov(cam, this.fovH);
  }

  // ── menu ──────────────────────────────────────────────────────────────────
  private updateMenu(dt: number, cam: THREE.PerspectiveCamera): void {
    this.menuAngle += dt * 0.03;
    const size = ctx.world?.size ?? 3072;
    const cx = size / 2, cz = size / 2;
    const r = size * 0.35;
    const x = cx + Math.sin(this.menuAngle) * r;
    const z = cz + Math.cos(this.menuAngle) * r;
    const g = ctx.world ? ctx.world.getHeight(x, z) : 0;
    cam.position.set(x, Math.max(g, 0) + 180, z);
    cam.lookAt(cx, 30, cz);
    this.fovH = TPP_HFOV;
    this.zoom = 1;
    this.applyFov(cam, this.fovH);
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

