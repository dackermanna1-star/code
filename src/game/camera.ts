/**
 * Camera controller: first/third person, view bobbing, landing dip, hit shake, sneak
 * eye-height smoothing, sprint FOV, collision-aware third-person boom.
 */
import * as THREE from 'three';
import type { Game } from './game';
import { raycastBlocks } from './interaction';

export type Perspective = 'first' | 'third_back' | 'third_front';

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  perspective: Perspective = 'first';
  baseFov = 70;
  /** Interpolated eye position in world space (for raycasts, audio listener). */
  readonly eyeWorld = new THREE.Vector3();
  private eyeHeight = 1.62;
  viewBobbing = true;
  private tmp = new THREE.Vector3();

  constructor(private game: Game) {
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 2000);
    this.camera.rotation.order = 'YXZ';
  }

  cyclePerspective() {
    this.perspective = this.perspective === 'first' ? 'third_back' : this.perspective === 'third_back' ? 'third_front' : 'first';
  }

  /** Physics interpolation factor of the last update (for other view effects). */
  lastAlpha = 1;
  update(alpha: number, dt: number) {
    this.lastAlpha = alpha;
    const p = this.game.player;
    const cam = this.camera;
    const pos = p.renderPos(alpha, this.tmp);
    const targetEye = p.sleeping ? 0.3 : p.sneaking && !p.flying ? 1.27 : p.swimming ? 0.4 : p.dead ? 0.3 : 1.62;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 14);
    const eye = new THREE.Vector3(pos.x, pos.y + this.eyeHeight, pos.z);
    this.eyeWorld.copy(eye);
    let yaw = p.yaw, pitch = p.pitch, roll = 0;
    // bobbing (Minecraft-like figure-eight)
    let bobX = 0, bobY = 0;
    if (this.viewBobbing && this.perspective === 'first' && !p.flying) {
      const ph = (p.prevBobPhase + (p.bobPhase - p.prevBobPhase) * alpha) * Math.PI;
      const a = p.prevBobAmount + (p.bobAmount - p.prevBobAmount) * alpha;
      bobX = Math.sin(ph) * a * 0.045;
      bobY = -Math.abs(Math.cos(ph)) * a * 0.07;
      roll += Math.sin(ph) * a * 0.012;
      pitch += Math.abs(Math.cos(ph - 0.2)) * a * 0.012;
    }
    // landing dip & hit shake
    bobY -= p.landingImpact * 0.18;
    pitch -= p.landingImpact * 0.05;
    roll += p.cameraShake.x * 0.08;
    pitch += p.cameraShake.y * 0.05;
    yaw += p.cameraShake.x * 0.02;
    // hurt tilt (Minecraft hurt camera roll)
    if (p.hurtTime > 0) roll += Math.sin((p.hurtTime / p.hurtDuration) * Math.PI) * 0.06;
    if (p.dead) roll = Math.min(Math.PI / 2.2, p.deathTime * 0.08);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    eye.addScaledVector(right, bobX);
    eye.y += bobY;
    if (this.perspective !== 'first') {
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const back = this.perspective === 'third_back' ? dir.clone().negate() : dir.clone();
      let dist = 4;
      const hit = raycastBlocks(this.game, eye, back, dist);
      if (hit) dist = Math.max(0.3, hit.dist - 0.25);
      eye.addScaledVector(back, dist);
      if (this.perspective === 'third_front') { yaw += Math.PI; pitch = -pitch; }
    }
    cam.position.copy(eye);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
    cam.fov = this.baseFov * p.fovMul * (this.game.input.isDown('zoom') ? 0.25 : 1);
    cam.near = 0.05;
    cam.far = Math.max(512, this.game.settings.renderDistance * 16 * 2.2, this.game.settings.lod ? this.game.settings.lodDistance * 1.6 : 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
}
