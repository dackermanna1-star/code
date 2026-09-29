import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, damp, Spring3 } from '../core/math';
import { C, mat } from './ModelBuilder';
import { WeaponModel } from './models';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

interface Arm {
  shoulder: THREE.Vector3;
  pole: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  hand: THREE.Group;
  lenA: number;
  lenB: number;
}

function makeArm(side: 1 | -1): Arm {
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), mat(C.SLEEVE));
  (upper.geometry as THREE.BoxGeometry).translate(0, 0, -0.5);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.056, 1), mat(C.SKIN));
  (fore.geometry as THREE.BoxGeometry).translate(0, 0, -0.5);
  const hand = new THREE.Group();
  // palm + fingers wrap (glove)
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.06, 0.058), mat(C.GLOVE));
  palm.position.set(side * 0.01, 0, 0);
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.024, 0.054), mat(C.GLOVE));
  fingers.position.set(-side * 0.017, -0.016, -0.004);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.038), mat(C.SKIN));
  thumb.position.set(-side * 0.015, 0.023, -0.017);
  const watch = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.018, 0.062), mat(side < 0 ? 0x151515 : C.SLEEVE));
  watch.position.set(0, 0.0, 0.045);
  hand.add(palm, fingers, thumb);
  if (side < 0) hand.add(watch);
  return {
    shoulder: new THREE.Vector3(side * 0.2, -0.36, 0.2),
    pole: new THREE.Vector3(side * 0.9, -1, 0.2).normalize(),
    upper,
    fore,
    hand,
    lenA: 0.34,
    lenB: 0.33,
  };
}

/** Solve 2-bone IK; returns elbow position. */
function solveIK(s: THREE.Vector3, t: THREE.Vector3, a: number, b: number, pole: THREE.Vector3, out: THREE.Vector3) {
  const d = _v.subVectors(t, s);
  let len = d.length();
  const maxL = a + b - 0.001;
  if (len > maxL) {
    d.multiplyScalar(maxL / len);
    len = maxL;
  }
  len = Math.max(len, Math.abs(a - b) + 0.001);
  const dir = d.normalize();
  const cosA = clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(s).addScaledVector(dir, cosA * a).addScaledVector(perp, sinA * a);
}

function orientBox(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, up: THREE.Vector3) {
  const len = from.distanceTo(to);
  mesh.position.copy(from);
  _m.lookAt(from, to, up);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.scale.set(1, 1, Math.max(0.001, len));
}

/**
 * First-person weapon + arms. Rendered in its own scene/camera (no clipping,
 * fixed FOV). Pose is layered: hip/ADS base, bob, sway, recoil springs and
 * per-action animation offsets supplied by the WeaponController.
 */
export class Viewmodel {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly holder = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.PointLight;
  model: WeaponModel | null = null;
  private armR = makeArm(1);
  private armL = makeArm(-1);
  readonly flash: THREE.Mesh;
  private flashT = 1;
  readonly recoilPos = new Spring3(170, 17);
  readonly recoilRot = new Spring3(150, 15);
  private swayX = 0;
  private swayY = 0;
  private sprint = 0;
  private bobPhase = 0;
  ads = 0;
  /** Animation offsets set each frame by the controller. */
  readonly animPos = new THREE.Vector3();
  readonly animRot = new THREE.Euler();
  lower = 0;
  /** Left/right hand target overrides (camera space). null = anchor default. */
  lhTarget: THREE.Vector3 | null = null;
  rhTarget: THREE.Vector3 | null = null;
  lhObj: THREE.Object3D | null = null;
  rhObj: THREE.Object3D | null = null;
  lhVisible = true;
  rhVisible = true;
  /** Object held in the left hand (mag, shell, speedloader, grenade...). */
  readonly leftProp = new THREE.Group();
  readonly rightProp = new THREE.Group();
  hideArms = false;
  private bowMode = false;

  constructor() {
    this.scene = G.vmScene;
    this.camera = G.vmCamera;
    this.scene.add(this.holder);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.fill = new THREE.PointLight(0xffc070, 0, 2, 1);
    this.fill.position.set(0.1, -0.05, -0.5);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.fill);
    for (const a of [this.armR, this.armL]) this.scene.add(a.upper, a.fore, a.hand);
    this.armL.hand.add(this.leftProp);
    this.armR.hand.add(this.rightProp);
    const fm = new THREE.MeshBasicMaterial({ map: G.fx.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(4, 3, 1.6) });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm);
    this.flash.visible = false;
    this.flash.renderOrder = 50;
    this.scene.add(this.flash);
  }

  setModel(m: WeaponModel | null, bow = false) {
    if (this.model) this.holder.remove(this.model.mb.root);
    this.model = m;
    this.bowMode = bow;
    if (m) this.holder.add(m.mb.root);
  }

  fireKick(kick: number, flashSize: number, color = 0xffc070) {
    this.recoilPos.kick((Math.random() - 0.5) * 0.02 * kick, 0.02 * kick, 0.55 * kick);
    this.recoilRot.kick(1.1 * kick, (Math.random() - 0.5) * 0.4 * kick, (Math.random() - 0.5) * 0.6 * kick);
    if (flashSize > 0) {
      this.flashT = 0;
      this.flash.scale.setScalar(flashSize * (0.8 + Math.random() * 0.5));
      this.flash.rotation.z = Math.random() * Math.PI;
      (this.flash.material as THREE.MeshBasicMaterial).color.setHex(color).multiplyScalar(3.5);
      this.fill.intensity = 3;
    }
  }

  /** Camera-space position of a model anchor (after current pose). */
  anchorPos(name: string, out: THREE.Vector3) {
    if (!this.model) return out.set(0, 0, -0.5);
    const a = this.model.mb.anchors[name];
    if (!a) return out.set(0, 0, -0.5);
    this.holder.updateMatrixWorld(true);
    return a.getWorldPosition(out);
  }

  /** Convert a camera-space viewmodel point to a world point that projects to the same screen spot. */
  toWorld(p: THREE.Vector3, out: THREE.Vector3) {
    const k = Math.tan((G.camera.fov * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360);
    out.set(p.x * k, p.y * k, p.z);
    return out.applyMatrix4(G.camera.matrixWorld);
  }

  /** World-space direction from a camera-space direction. */
  dirToWorld(d: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(d).applyQuaternion(G.camera.quaternion);
  }

  update(dt: number, mouseDX: number, mouseDY: number, moving: number, sprinting: boolean, onGround: boolean) {
    const m = this.model;
    // lights in camera space
    const camQ = G.camera.quaternion;
    const inv = _q.copy(camQ).invert();
    const s = G.atmosphere.state;
    this.sun.position.copy(s.sunDir).applyQuaternion(inv).multiplyScalar(5);
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity * 0.9;
    this.hemi.position.set(0, 1, 0).applyQuaternion(inv);
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity * 0.95 + G.atmosphere.lightning * 3;
    this.fill.intensity = damp(this.fill.intensity, 0, 30, dt);

    // sway (lagging mouse)
    const sx = clamp(-mouseDX * 0.0009, -0.08, 0.08);
    const sy = clamp(-mouseDY * 0.0009, -0.08, 0.08);
    this.swayX = damp(this.swayX, sx, 9, dt);
    this.swayY = damp(this.swayY, sy, 9, dt);
    this.sprint = damp(this.sprint, sprinting ? 1 : 0, 9, dt);
    const bobSpeed = sprinting ? 11 : 8;
    this.bobPhase += dt * bobSpeed * moving * (onGround ? 1 : 0.2);
    this.recoilPos.update(dt);
    this.recoilRot.update(dt);

    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.camera.updateMatrixWorld();

    if (!m) {
      this.holder.visible = false;
      for (const a of [this.armL, this.armR]) a.upper.visible = a.fore.visible = a.hand.visible = false;
      return;
    }
    this.holder.visible = true;
    const hip = m.hip;
    const sight = m.mb.anchors.sight.position;
    const ads = this.ads;
    const ax = -sight.x;
    const ay = -sight.y;
    const az = -m.eye - sight.z;
    const bobAmt = (1 - ads * 0.85) * moving;
    const bx = Math.sin(this.bobPhase) * 0.012 * bobAmt;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.01 * bobAmt;
    const p = this.holder.position;
    p.set(hip[0] + (ax - hip[0]) * ads, hip[1] + (ay - hip[1]) * ads, hip[2] + (az - hip[2]) * ads);
    p.x += bx + this.swayX * 0.4 * (1 - ads * 0.7);
    p.y += by + this.swayY * 0.4 * (1 - ads * 0.7) - this.lower * 0.35;
    p.z += 0;
    p.x += this.sprint * 0.02;
    p.y -= this.sprint * 0.04;
    p.add(this.animPos);
    p.x += this.recoilPos.x.x;
    p.y += this.recoilPos.x.y * (1 - ads * 0.5);
    p.z += this.recoilPos.x.z * (1 - ads * 0.3) * 0.12;
    const r = this.holder.rotation;
    const hipYaw = 0.04 * (1 - ads);
    r.set(
      this.swayY * 1.2 + this.recoilRot.x.x * 0.06 * (1 - ads * 0.6) + this.animRot.x - this.sprint * 0.35 - this.lower * 0.6,
      hipYaw + this.swayX * 1.2 + this.recoilRot.x.y * 0.05 + this.animRot.y + this.sprint * 0.7,
      Math.sin(this.bobPhase) * 0.02 * bobAmt + this.recoilRot.x.z * 0.05 + this.animRot.z + this.sprint * 0.25 - this.swayX * 0.8,
      'YXZ',
    );
    this.holder.updateMatrixWorld(true);

    // muzzle flash
    this.flashT += dt;
    if (this.flashT < 0.045) {
      this.flash.visible = true;
      m.mb.anchors.muzzle.getWorldPosition(this.flash.position);
      this.flash.quaternion.identity();
      this.flash.position.z -= 0.02;
    } else this.flash.visible = false;

    // arms
    const up = _v3.set(0, 1, 0);
    const solve = (arm: Arm, target: THREE.Vector3, visible: boolean, handObj: THREE.Object3D | null) => {
      arm.upper.visible = arm.fore.visible = arm.hand.visible = visible && !this.hideArms;
      if (!visible || this.hideArms) return;
      const elbow = solveIK(arm.shoulder, target, arm.lenA, arm.lenB, arm.pole, new THREE.Vector3());
      orientBox(arm.upper, arm.shoulder, elbow, up);
      orientBox(arm.fore, elbow, target, up);
      arm.hand.position.copy(target);
      if (handObj) {
        handObj.getWorldQuaternion(arm.hand.quaternion);
      } else {
        _m.lookAt(elbow, target, up);
        arm.hand.quaternion.setFromRotationMatrix(_m);
      }
    };
    const gripName = this.bowMode ? 'support' : 'grip';
    const supName = this.bowMode ? 'grip' : 'support';
    const rt = this.rhTarget ?? m.mb.anchors[gripName].getWorldPosition(new THREE.Vector3());
    const lt = this.lhTarget ?? (this.lhObj ?? m.mb.anchors[supName]).getWorldPosition(new THREE.Vector3());
    solve(this.armR, rt, this.rhVisible, this.rhTarget ? null : m.mb.anchors[gripName]);
    solve(this.armL, lt, this.lhVisible, this.lhTarget ? null : this.lhObj ?? m.mb.anchors[supName]);
  }
}
