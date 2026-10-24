import * as THREE from 'three';
import { smoothstep } from '../core/math';

interface Shot {
  from: [number, number, number];
  to: [number, number, number];
  lookFrom: [number, number, number];
  lookTo: [number, number, number];
  dur: number;
}

/** Slow cinematic dolly shots through the bar behind the title screen. */
const SHOTS: Shot[] = [
  // main hall from the entrance side
  { from: [5.5, 2.6, 10.6], to: [1.0, 2.3, 10.2], lookFrom: [-3, 1.2, 0], lookTo: [-6, 1.1, -1], dur: 9 },
  // tracking along the bar counter
  { from: [-11.2, 1.75, 7.0], to: [-11.4, 1.6, -0.5], lookFrom: [-15, 1.25, 4.5], lookTo: [-15, 1.25, -3], dur: 9 },
  // dance floor and the band
  { from: [-2.8, 1.25, 4.2], to: [2.6, 1.45, 3.4], lookFrom: [0.5, 1.6, -4.6], lookTo: [-0.5, 1.6, -4.6], dur: 8 },
  // pool hall
  { from: [9.4, 1.8, 6.4], to: [10.0, 2.0, 0.8], lookFrom: [14, 0.9, 3.4], lookTo: [14.2, 0.9, -2.8], dur: 8 },
  // balcony overlook
  { from: [-7.5, 6.0, 10.4], to: [6.5, 6.1, 10.4], lookFrom: [-1, 0.6, -1], lookTo: [1, 0.6, -2], dur: 10 },
  // VIP and the boss
  { from: [-1.5, 5.9, -7.0], to: [3.5, 5.8, -7.6], lookFrom: [8.5, 5.0, -12.3], lookTo: [8.6, 5.0, -12.3], dur: 8 },
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _l = new THREE.Vector3();

export class AttractCam {
  private i = 0;
  private t = 0;
  /** 0..1 fade to black at cuts */
  fade = 1;

  reset(): void {
    this.i = 0;
    this.t = 0;
    this.fade = 1;
  }

  update(dt: number, cam: THREE.PerspectiveCamera): void {
    let shot = SHOTS[this.i];
    this.t += dt;
    if (this.t > shot.dur) {
      this.t = 0;
      this.i = (this.i + 1) % SHOTS.length;
      shot = SHOTS[this.i];
    }
    const k = this.t / shot.dur;
    const e = smoothstep(0, 1, k) * 0.7 + k * 0.3;
    _a.fromArray(shot.from);
    _b.fromArray(shot.to);
    cam.position.lerpVectors(_a, _b, e);
    _a.fromArray(shot.lookFrom);
    _b.fromArray(shot.lookTo);
    _l.lerpVectors(_a, _b, e);
    cam.lookAt(_l);
    // fade in at the start of a shot, out at the end
    const fin = Math.min(1, this.t / 0.6);
    const fout = Math.min(1, (shot.dur - this.t) / 0.6);
    this.fade = 1 - Math.min(fin, fout);
    if (cam.fov !== 62) {
      cam.fov = 62;
      cam.updateProjectionMatrix();
    }
  }
}
