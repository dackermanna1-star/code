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
/** Distance from the gripped handle to the wrist joint. */
const WRIST = 0.08;

interface Arm {
  shoulder: THREE.Vector3;
  pole: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  hand: THREE.Group;
  lenA: number;
  lenB: number;
}

/** Box whose far end (z = -1 after the translate) is scaled by `taper`. */
function taperedBox(w: number, h: number, taper: number) {
  const g = new THREE.BoxGeometry(w, h, 1, 1, 1, 1);
  g.translate(0, 0, -0.5);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < -0.5) pos.setXY(i, pos.getX(i) * taper, pos.getY(i) * taper);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Gloved hand wrapped around a handle. Hand frame: the handle runs along +Y
 * through the origin, the wrist is toward +Z and the fingers curl around the
 * front (-Z). `side` mirrors it (right = 1, left = -1). Fingerless gloves:
 * skin shows at the finger and thumb tips.
 */
function makeHand(side: 1 | -1) {
  const s = side;
  const hand = new THREE.Group();
  const add = (size: [number, number, number], pos: [number, number, number], color: number, rot?: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    hand.add(m);
    return m;
  };
  // back of the hand along the outer side of the handle, knuckle ridge in front
  add([0.022, 0.07, 0.054], [s * 0.026, -0.003, 0.012], C.GLOVE);
  add([0.024, 0.066, 0.012], [s * 0.024, -0.003, -0.018], C.GLOVE_L);
  // palm heel wrapping the back of the handle
  add([0.04, 0.056, 0.02], [s * 0.008, -0.016, 0.034], C.GLOVE);
  // fingers across the front of the handle, bare tips on the inner side
  for (let i = 0; i < 4; i++) {
    const y = 0.024 - i * 0.0172;
    const t = i === 3 ? 0.85 : 1;
    add([0.032, 0.0145 * t, 0.016], [s * 0.003, y, -0.026], C.GLOVE_L);
    add([0.011, 0.0135 * t, 0.018], [-s * 0.018, y, -0.014], C.SKIN);
  }
  // thumb along the inner side at the top, tip bare
  add([0.016, 0.018, 0.04], [-s * 0.017, 0.037, 0.016], C.GLOVE);
  add([0.015, 0.016, 0.018], [-s * 0.018, 0.038, -0.013], C.SKIN);
  // wrist cuff
  add([0.048, 0.05, 0.026], [s * 0.012, -0.022, 0.058], C.GLOVE_L, [-0.25, 0, 0]);
  return hand;
}

function makeArm(side: 1 | -1): Arm {
  const upper = new THREE.Mesh(taperedBox(0.082, 0.082, 0.86), mat(C.SLEEVE));
  const fore = new THREE.Mesh(taperedBox(0.074, 0.07, 0.78), mat(C.SLEEVE));
  // rolled cuff ring near the wrist end of the sleeve
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.063, 0.045), mat(C.SLEEVE_D));
  cuff.name = 'cuff';
  const hand = new THREE.Group();
  const grip = makeHand(side);
  hand.add(grip);
  if (side < 0) {
    // wristwatch on the left arm
    const watch = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.056, 0.02), mat(0x161616));
    watch.position.set(-0.004, -0.018, 0.078);
    watch.rotation.x = -0.25;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.024), mat(0x9aa0a4, 0x101410));
    face.position.set(-0.02, -0.018, 0.078);
    face.rotation.set(-0.25, 0, Math.PI / 2);
    hand.add(watch, face);
  }
  hand.add(cuff);
  cuff.position.set(side * 0.01, -0.024, 0.09);
  cuff.rotation.x = -0.25;
  return {
    shoulder: new THREE.Vector3(side * 0.22, -0.4, 0.22),
    pole: new THREE.Vector3(side * 0.9, -1, 0.2).normalize(),
    upper,
    fore,
    hand,
    lenA: 0.34,
    lenB: 0.36,
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
  /** Soft camera-side key so the gun and hands always read, even against the sun. */
  private camKey: THREE.DirectionalLight;
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
    this.camKey = new THREE.DirectionalLight(0xffffff, 0.6);
    this.camKey.position.set(-0.4, 0.5, 1);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.fill, this.camKey, this.camKey.target);
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
    this.hemi.intensity = s.hemiIntensity * 1.1 + G.atmosphere.lightning * 3;
    this.camKey.color.copy(s.hemiSky).lerp(s.sunColor, 0.5);
    this.camKey.intensity = 0.35 + s.sunIntensity * 0.12;
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
    const hr = m.hipRot;
    const hipK = 1 - ads;
    r.set(
      hr[0] * hipK + this.swayY * 1.2 + this.recoilRot.x.x * 0.06 * (1 - ads * 0.6) + this.animRot.x - this.sprint * 0.35 - this.lower * 0.6,
      hr[1] * hipK + this.swayX * 1.2 + this.recoilRot.x.y * 0.05 + this.animRot.y + this.sprint * 0.7,
      hr[2] * hipK + Math.sin(this.bobPhase) * 0.02 * bobAmt + this.recoilRot.x.z * 0.05 + this.animRot.z + this.sprint * 0.25 - this.swayX * 0.8,
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

    // arms: the forearm ends at the wrist, behind the gripping hand
    const up = _v3.set(0, 1, 0);
    const solve = (arm: Arm, target: THREE.Vector3, visible: boolean, handObj: THREE.Object3D | null, side: number) => {
      arm.upper.visible = arm.fore.visible = arm.hand.visible = visible && !this.hideArms;
      if (!visible || this.hideArms) return;
      const elbow = new THREE.Vector3();
      const wrist = new THREE.Vector3();
      if (handObj) {
        handObj.getWorldQuaternion(arm.hand.quaternion);
        wrist.set(side * 0.012, -0.03, 0.078).applyQuaternion(arm.hand.quaternion).add(target);
        solveIK(arm.shoulder, wrist, arm.lenA, arm.lenB, arm.pole, elbow);
      } else {
        solveIK(arm.shoulder, target, arm.lenA, arm.lenB + WRIST, arm.pole, elbow);
        _m.lookAt(elbow, target, up);
        arm.hand.quaternion.setFromRotationMatrix(_m);
        wrist.copy(target).addScaledVector(_v2.subVectors(target, elbow).normalize(), -WRIST);
      }
      orientBox(arm.upper, arm.shoulder, elbow, up);
      orientBox(arm.fore, elbow, wrist, up);
      arm.hand.position.copy(target);
    };
    const gripName = this.bowMode ? 'support' : 'grip';
    const supName = this.bowMode ? 'grip' : 'support';
    const rt = this.rhTarget ?? m.mb.anchors[gripName].getWorldPosition(new THREE.Vector3());
    const lt = this.lhTarget ?? (this.lhObj ?? m.mb.anchors[supName]).getWorldPosition(new THREE.Vector3());
    solve(this.armR, rt, this.rhVisible, this.rhTarget ? null : m.mb.anchors[gripName], 1);
    solve(this.armL, lt, this.lhVisible, this.lhTarget ? null : this.lhObj ?? m.mb.anchors[supName], -1);
  }
}
