import * as THREE from 'three';
import { BareHand } from '../../gojo/BareHand';
import { SD } from '../core/SD';
import { RAMP_CHAR, addOutline, outlineMaterial, toon } from '../render/Toon';
import { DAY } from '../world/Sky';
import { handMats } from '../char/Model';

/** Where a first-person hand sits (camera space: -Z ahead, +X right) and its shape. */
export interface HandGoal {
  p: [number, number, number];
  /** Euler XYZ (radians) in camera space; identity = fingers forward, back of the hand up */
  r: [number, number, number];
  pose: string;
}

const H = (p: [number, number, number], r: [number, number, number], pose: string): HandGoal => ({ p, r, pose });

/** Right-hand goals; left hands are mirrored. */
export const FP: Record<string, HandGoal> = {
  idle: H([0.21, -0.25, -0.42], [-0.6, 0.15, -1.2], 'relax'),
  low: H([0.24, -0.4, -0.34], [-1.0, 0.1, -1.3], 'relax'),
  guard: H([0.17, -0.17, -0.4], [0.3, 0.15, -1.3], 'fist'),
  chamber: H([0.24, -0.25, -0.2], [0.2, 0.3, -1.4], 'fist'),
  punch: H([0.06, -0.1, -0.6], [0.0, 0.05, -0.25], 'fist'),
  hook: H([0.02, -0.08, -0.5], [0.0, 0.9, -0.2], 'fist'),
  bfPull: H([0.27, -0.24, -0.12], [0.4, 0.4, -1.5], 'fist'),
  bfStrike: H([0.03, -0.08, -0.66], [0.0, 0.0, -0.4], 'fist'),
  point: H([0.12, -0.12, -0.55], [0.05, 0.05, -1.35], 'point'),
  pointUp: H([0.16, -0.06, -0.42], [0.6, 0.05, -1.35], 'point'),
  open: H([0.16, -0.14, -0.5], [1.35, 0.0, 0.0], 'open'),
  claw: H([0.16, -0.14, -0.5], [1.25, 0.0, 0.0], 'claw'),
  sign: H([0.02, -0.08, -0.34], [1.45, -0.2, -0.5], 'cross'),
  stop: H([0.2, -0.12, -0.46], [1.4, 0.0, -0.2], 'open'),
  palmUp: H([0.12, -0.22, -0.38], [-0.25, 0.0, -2.8], 'open'),
  purpleSide: H([0.26, -0.13, -0.46], [0.1, 0.1, -1.35], 'point'),
  purpleMeet: H([0.03, -0.1, -0.44], [0.1, 0.2, -1.35], 'point'),
  purpleThrust: H([0.05, -0.08, -0.62], [1.3, 0, 0.0], 'open'),
  hidden: H([0.3, -0.9, -0.2], [-1.2, 0, -1.3], 'relax'),
};

export function mirrorGoal(g: HandGoal): HandGoal {
  return { p: [-g.p[0], g.p[1], g.p[2]], r: [g.r[0], -g.r[1], -g.r[2]], pose: g.pose };
}

const NAVY = 0x1c2031;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

class Arm {
  readonly hand: BareHand;
  readonly root = new THREE.Group();
  readonly upper: THREE.Mesh;
  readonly fore: THREE.Mesh;
  readonly cuff: THREE.Mesh;
  /** current hand position/orientation (spring) */
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  goal: HandGoal = FP.idle;
  /** extra offset (recoil, tremble) added on top of the goal */
  readonly off = new THREE.Vector3();
  stiff = 240;
  damp = 26;
  rotRate = 18;
  readonly shoulder: THREE.Vector3;
  readonly a = 0.32;
  readonly b = 0.3;

  constructor(
    readonly side: 1 | -1,
    scene: THREE.Object3D,
    mats: ReturnType<typeof handMats>,
    sleeve: THREE.Material,
    outline: THREE.ShaderMaterial,
  ) {
    this.hand = new BareHand(side, mats);
    this.hand.group.scale.setScalar(1.06);
    this.root.add(this.hand.group);
    scene.add(this.root);
    const tube = (r0: number, r1: number) => {
      const g = new THREE.CylinderGeometry(r1, r0, 1, 14, 1, true);
      g.translate(0, 0.5, 0);
      g.rotateX(-Math.PI / 2);
      // now runs from z=0 to z=-1
      return g;
    };
    this.upper = new THREE.Mesh(tube(0.056, 0.049), sleeve);
    this.fore = new THREE.Mesh(tube(0.05, 0.046), sleeve);
    this.cuff = new THREE.Mesh(tube(0.048, 0.048), sleeve);
    for (const m of [this.upper, this.fore]) {
      scene.add(m);
      addOutline(m, outline);
    }
    this.root.add(this.cuff);
    this.shoulder = new THREE.Vector3(side * 0.21, -0.38, 0.16);
    const g = side > 0 ? FP.idle : mirrorGoal(FP.idle);
    this.pos.set(g.p[0], g.p[1], g.p[2]);
    this.quat.setFromEuler(_e.set(g.r[0], g.r[1], g.r[2]));
  }

  set(g: HandGoal, stiff = 240, damp = 26, rotRate = 18) {
    this.goal = this.side > 0 ? g : mirrorGoal(g);
    this.stiff = stiff;
    this.damp = damp;
    this.rotRate = rotRate;
  }

  /** Snap straight to the goal (cuts). */
  snap() {
    const g = this.goal;
    this.pos.set(g.p[0], g.p[1], g.p[2]);
    this.vel.set(0, 0, 0);
    this.quat.setFromEuler(_e.set(g.r[0], g.r[1], g.r[2]));
  }

  update(dt: number, sway: THREE.Vector3) {
    const g = this.goal;
    // critically-damped-ish spring toward the goal
    _v.set(g.p[0], g.p[1], g.p[2]).add(this.off).add(sway);
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const ax = (_v.x - this.pos.x) * this.stiff - this.vel.x * this.damp;
      const ay = (_v.y - this.pos.y) * this.stiff - this.vel.y * this.damp;
      const az = (_v.z - this.pos.z) * this.stiff - this.vel.z * this.damp;
      this.vel.x += ax * h;
      this.vel.y += ay * h;
      this.vel.z += az * h;
      this.pos.addScaledVector(this.vel, h);
    }
    _q.setFromEuler(_e.set(g.r[0], g.r[1], g.r[2]));
    this.quat.slerp(_q, 1 - Math.exp(-this.rotRate * dt));
    this.hand.setPose(g.pose);
    this.hand.update(dt);
    // hand transform: the wrist point sits at the arm's end
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);
    const wrist = _v2.copy(this.hand.wrist).multiplyScalar(1.06).applyQuaternion(this.quat).add(this.pos);
    // elbow by two-bone IK, pointing out and down
    const S = this.shoulder;
    const d = _v.subVectors(wrist, S);
    let len = d.length();
    const maxL = this.a + this.b - 1e-3;
    if (len > maxL) len = maxL;
    const dir = d.normalize();
    const cosA = THREE.MathUtils.clamp((this.a * this.a + len * len - this.b * this.b) / (2 * this.a * len), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const pole = new THREE.Vector3(this.side * 0.8, -1, 0.3).normalize();
    const perp = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = new THREE.Vector3().copy(S).addScaledVector(dir, cosA * this.a).addScaledVector(perp, sinA * this.a);
    const W = new THREE.Vector3().copy(S).addScaledVector(dir, len);
    // if the wrist is out of reach, the hand still goes where it's told: stretch the forearm to it
    W.copy(wrist);
    this.orient(this.upper, S, E);
    this.orient(this.fore, E, W);
    // cuff covers the wrist seam, aligned to the forearm
    const inv = this.quat.clone().invert();
    const fdir = _v.subVectors(W, E).normalize().applyQuaternion(inv);
    this.cuff.position.copy(this.hand.wrist).multiplyScalar(1.06).addScaledVector(fdir, -0.02);
    this.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), fdir.clone().negate());
    this.cuff.scale.set(1, 1, 0.07);
  }

  private orient(m: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
    const len = from.distanceTo(to);
    m.position.copy(from);
    _m.lookAt(from, to, _v2.set(0, 1, 0));
    m.quaternion.setFromRotationMatrix(_m);
    m.scale.set(1, 1, Math.max(0.001, len));
  }

  setVisible(v: boolean) {
    this.root.visible = this.upper.visible = this.fore.visible = v;
  }
}

/**
 * Gojo's arms in first person: navy uniform sleeves and bare hands that glide
 * between named goals, with a light rig that follows the world sun.
 */
export class FPArms {
  readonly group = new THREE.Group();
  readonly R: Arm;
  readonly L: Arm;
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  private fill = new THREE.PointLight(0x88aaff, 0, 2.5, 2);
  /** bob/sway offset applied to both hands */
  readonly sway = new THREE.Vector3();
  private bob = 0;
  private swayX = 0;
  private swayY = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const mats = handMats(0xf0d6c4, 0xdcb8a4, 0xe9cfc4);
    const sleeve = toon(NAVY, { rim: 0.5, rimColor: 0x8fb4ff, ramp: RAMP_CHAR, backShade: 0.6 });
    sleeve.side = THREE.DoubleSide;
    const outline = outlineMaterial(2.2);
    this.R = new Arm(1, this.group, mats, sleeve, outline);
    this.L = new Arm(-1, this.group, mats, sleeve, outline);
    scene.add(this.sun, this.hemi, this.fill);
    this.fill.position.set(0, -0.1, -0.4);
  }

  /** Light colour/intensity near the hands (technique glows). */
  glow(color: THREE.ColorRepresentation, intensity: number, at?: THREE.Vector3) {
    this.fill.color.set(color);
    this.fill.intensity = intensity * 0.35;
    if (at) this.fill.position.copy(at);
  }

  update(dt: number, cam: THREE.Camera, mouseDX: number, mouseDY: number, moving: number, grounded: boolean) {
    // lights in camera space
    const inv = _q.copy(cam.quaternion).invert();
    this.sun.position.copy(DAY.sunDir).applyQuaternion(inv).multiplyScalar(5);
    this.sun.color.copy(DAY.sunColor);
    this.sun.intensity = DAY.sunIntensity * 0.7;
    this.hemi.position.set(0, 1, 0).applyQuaternion(inv);
    this.hemi.color.copy(DAY.hemiSky);
    this.hemi.groundColor.copy(DAY.hemiGround);
    this.hemi.intensity = DAY.hemiIntensity * 0.85;
    this.fill.intensity *= Math.exp(-dt * 6);
    // sway lags the mouse, bob follows the stride
    this.swayX += (THREE.MathUtils.clamp(-mouseDX * 0.0006, -0.05, 0.05) - this.swayX) * (1 - Math.exp(-dt * 10));
    this.swayY += (THREE.MathUtils.clamp(mouseDY * 0.0006, -0.05, 0.05) - this.swayY) * (1 - Math.exp(-dt * 10));
    this.bob += dt * 9 * moving * (grounded ? 1 : 0.2);
    this.sway.set(this.swayX + Math.sin(this.bob) * 0.012 * moving, this.swayY - Math.abs(Math.cos(this.bob)) * 0.012 * moving, 0);
    void SD;
    this.R.update(dt, this.sway);
    this.L.update(dt, this.sway);
  }
}
