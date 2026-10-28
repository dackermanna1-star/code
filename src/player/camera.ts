// First-person camera rig: yaw/pitch look, eye height (stand/crouch transition), stride-synced
// head-bob, landing dip (spring), step-up smoothing, sprint FOV kick and render camera shake.
//
// Conventions (Babylon, left-handed, Y up): yaw = rotation about +Y (0 looks along +Z, positive
// turns right towards +X); pitch = rotation about the camera's right axis, POSITIVE LOOKS DOWN
// (Babylon's camera.rotation.x convention); clamped to ±89°.
//   forward = (sin yaw · cos pitch, −sin pitch, cos yaw · cos pitch)
//   right   = (cos yaw, 0, −sin yaw)          up = forward × right
//
// `eye` / `forward` / `right` / `up` are the GAMEPLAY pose (no bob/shake): tools, raycasts and
// the audio listener use them. Bob, dip and shake only affect the rendered camera.

import { Vector3, type UniversalCamera } from "@babylonjs/core";
import type { RenderSystem } from "../core/context.ts";
import type { Settings } from "../core/settings.ts";

const DEG = Math.PI / 180;
/** Look pitch limit (±88.8°): at ±π/2 Babylon's view degenerates and flips (api-notes §3). */
export const MAX_PITCH = 1.55;
/** Limit for the composed render pitch (look + landing dip + shake). */
const MAX_RENDER_PITCH = 1.565;
/** Radians of view rotation per (sensitivity-scaled) mouse pixel. */
export const LOOK_RAD_PER_PX = 0.0022;

export interface CameraInputs {
  /** Capsule foot position (world). */
  footX: number;
  footY: number;
  footZ: number;
  /** Target eye height above the foot (stand / crouch). */
  eyeHeight: number;
  /** Horizontal speed (m/s) relative to the ground. */
  speed: number;
  grounded: boolean;
  sprinting: boolean;
  /** Stride phase (radians, advances π per footstep; foot strikes at multiples of π). */
  stridePhase: number;
}

export class CameraRig {
  yaw = 0;
  pitch = 0;
  /** Gameplay eye position (smoothed eye height, step smoothing; no bob/dip/shake). */
  readonly eye = new Vector3();
  readonly forward = new Vector3(0, 0, 1);
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);

  private readonly camera: UniversalCamera;
  private readonly settings: Settings;
  private readonly render: RenderSystem | null;

  private eyeH = 1.65;
  private eyeInit = false;
  private bobAmt = 0; // 0..1 blend of the bob (grounded & moving)
  private bobSpeed = 0; // smoothed speed used for amplitude
  private dip = 0; // landing dip (m, negative = down)
  private dipVel = 0;
  private stepOffset = 0; // step-up / step-down smoothing (m)
  private fovExtra = 0; // degrees
  private readonly tmp = new Vector3();

  constructor(camera: UniversalCamera, settings: Settings, render: RenderSystem | null) {
    this.camera = camera;
    this.settings = settings;
    this.render = render;
    // Euler rotation only (a rotationQuaternion would override it), no Babylon camera inputs, and
    // a near plane that works next to 12.5 mm drywall (the render system normally sets these).
    this.camera.rotationQuaternion = null;
    this.camera.inputs?.clear();
    if (this.camera.minZ > 0.1) this.camera.minZ = 0.05;
    this.updateBasis();
  }

  /** Apply a mouse delta (sensitivity-scaled pixels; dy > 0 = look down). */
  addLookPixels(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
    this.setAngles(this.yaw + dx * LOOK_RAD_PER_PX, this.pitch + dy * LOOK_RAD_PER_PX);
  }

  setAngles(yaw: number, pitch: number): void {
    if (Number.isFinite(yaw)) {
      // keep yaw bounded to avoid precision loss after hours of spinning
      const twoPi = Math.PI * 2;
      this.yaw = yaw - twoPi * Math.floor((yaw + Math.PI) / twoPi);
    }
    if (Number.isFinite(pitch)) this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
    this.updateBasis();
  }

  /** Landing: kick the dip spring by the vertical impact speed (m/s, positive). */
  land(speed: number): void {
    if (!(speed > 0)) return;
    this.dipVel -= Math.min(speed, 14) * 0.12;
  }

  /** The capsule teleported vertically (step-up / small step-down): absorb it smoothly. */
  absorbStep(dy: number): void {
    if (!Number.isFinite(dy)) return;
    this.stepOffset = Math.max(-0.4, Math.min(0.4, this.stepOffset - dy));
  }

  /** Snap smoothed state (teleport / spawn). */
  reset(eyeHeight: number): void {
    this.eyeH = eyeHeight;
    this.eyeInit = true;
    this.dip = this.dipVel = 0;
    this.stepOffset = 0;
    this.bobAmt = 0;
  }

  /**
   * Update the gameplay eye (fixed step or frame) without touching the render camera.
   * Called by the player after moving the capsule so tools/raycasts see the new pose.
   */
  updateEye(inp: CameraInputs, dt: number): void {
    if (!this.eyeInit) this.reset(inp.eyeHeight);
    // crouch / stand transition (exponential, ~0.12 s)
    const k = 1 - Math.exp(-dt * 14);
    this.eyeH += (inp.eyeHeight - this.eyeH) * k;
    this.stepOffset *= Math.exp(-dt * 11);
    if (Math.abs(this.stepOffset) < 1e-4) this.stepOffset = 0;
    this.eye.set(inp.footX, inp.footY + this.eyeH + this.stepOffset, inp.footZ);
  }

  /** Per render frame: animate bob/dip/FOV, then place the render camera. */
  updateCamera(inp: CameraInputs, dt: number): void {
    const s = this.settings.data;
    dt = Math.min(Math.max(dt, 0), 0.1);

    // head-bob (vertical: lowest at each foot strike; lateral sway: one cycle per two steps)
    const moving = inp.grounded && inp.speed > 0.4;
    this.bobAmt += ((moving ? 1 : 0) - this.bobAmt) * (1 - Math.exp(-dt * 7));
    this.bobSpeed += (inp.speed - this.bobSpeed) * (1 - Math.exp(-dt * 6));
    const amp = Math.min(0.045, 0.0062 * this.bobSpeed) * this.bobAmt;
    const ph = inp.stridePhase;
    const bobY = amp * (0.5 - 0.5 * Math.cos(2 * ph)) - amp * 0.5;
    const bobX = amp * 0.55 * Math.sin(ph);
    const roll = amp * 0.12 * Math.sin(ph); // ≈ 0.3° at walking pace

    // landing dip: slightly under-damped spring
    const kSpring = 140;
    const cDamp = 2 * Math.sqrt(kSpring) * 0.72;
    // semi-implicit Euler in a couple of sub-steps for stability at low frame rates
    const n = dt > 1 / 90 ? 2 : 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.dipVel += (-kSpring * this.dip - cDamp * this.dipVel) * h;
      this.dip += this.dipVel * h;
    }
    if (this.dip < -0.12) {
      this.dip = -0.12;
      if (this.dipVel < 0) this.dipVel = 0;
    }

    // sprint FOV kick (small)
    const kick = inp.sprinting && inp.speed > 4.4 ? 4.5 : 0;
    this.fovExtra += (kick - this.fovExtra) * (1 - Math.exp(-dt * 5));
    const fovDeg = Math.max(40, Math.min(110, (Number.isFinite(s.fov) ? s.fov : 75) + this.fovExtra));
    this.camera.fov = fovDeg * DEG;

    // shake from the render system (PostFX.getShake already applies the camera-shake setting)
    let spx = 0, spy = 0, spz = 0, srx = 0, sry = 0, srz = 0;
    if (this.render) {
      const sh = this.render.getShake();
      if (sh) {
        spx = sh.pos?.x || 0;
        spy = sh.pos?.y || 0;
        spz = sh.pos?.z || 0;
        srx = sh.rot?.x || 0;
        sry = sh.rot?.y || 0;
        srz = sh.rot?.z || 0;
      }
    }

    // compose: eye + bob (camera-local x/y) + dip + shake (camera-local)
    const ox = bobX + spx;
    const oy = bobY + this.dip + spy;
    const oz = spz;
    const t = this.tmp;
    t.copyFrom(this.eye);
    t.x += this.right.x * ox + this.up.x * oy + this.forward.x * oz;
    t.y += this.right.y * ox + this.up.y * oy + this.forward.y * oz;
    t.z += this.right.z * ox + this.up.z * oy + this.forward.z * oz;
    this.camera.position.copyFrom(t);
    const dipPitch = -this.dip * 0.45; // nod down a little on hard landings
    const pitch = Math.max(-MAX_RENDER_PITCH, Math.min(MAX_RENDER_PITCH, this.pitch + dipPitch + srx));
    this.camera.rotation.set(pitch, this.yaw + sry, roll + srz);
  }

  private updateBasis(): void {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.forward.set(sy * cp, -sp, cy * cp);
    this.right.set(cy, 0, -sy);
    Vector3.CrossToRef(this.forward, this.right, this.up);
    this.up.normalize();
  }
}
