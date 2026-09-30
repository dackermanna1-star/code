import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, damp, Spring3 } from '../core/math';
import { C, chamferBox, gunMat, mergeByMaterial } from './ModelBuilder';
import { WeaponModel } from './models';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _white = new THREE.Color(1, 1, 1);
/** Distance from the gripped handle to the wrist joint. */
const WRIST = 0.08;

interface Arm {
  shoulder: THREE.Vector3;
  pole: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  hand: THREE.Group;
  poses: Record<string, THREE.Group>;
  /** Right hand only: the index finger that rests on the trigger. */
  trigger?: { a: THREE.Mesh; b: THREE.Mesh; c: THREE.Mesh; knuckle: THREE.Vector3; curl: THREE.Vector3[] };
  lenA: number;
  lenB: number;
}

/**
 * Sleeve: an 8-sided prism along -Z from 0 to -1 (scaled to the bone length)
 * whose radius tapers from r0 to r1, with a couple of fabric folds.
 */
function sleeveGeo(r0: number, r1: number, flatten: number, folds: number[]) {
  const ts = [0, 0.04];
  for (const f of folds) ts.push(f - 0.05, f, f + 0.05);
  ts.push(0.96, 1);
  const rad = (t: number) => {
    let r = r0 + (r1 - r0) * t;
    for (const f of folds) r *= 1 + Math.max(0, 1 - Math.abs(t - f) / 0.05) * 0.07;
    if (t < 0.04) r *= 0.92 + t * 2;
    return r;
  };
  const N = 8;
  const pos: number[] = [];
  const P = (t: number, i: number) => {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    const r = rad(t);
    return [Math.cos(a) * r, Math.sin(a) * r * flatten, -t];
  };
  for (let k = 0; k < ts.length - 1; k++)
    for (let i = 0; i < N; i++) {
      const a = P(ts[k], i);
      const b = P(ts[k], i + 1);
      const c = P(ts[k + 1], i + 1);
      const d = P(ts[k + 1], i);
      pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3 + 2] * 3, Math.atan2(pos[i * 3 + 1], pos[i * 3]) * 0.4);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
/** Place a unit segment mesh (chamfered box along -Z of length 1) from a to b. */
function orientSeg(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const len = a.distanceTo(b);
  mesh.position.copy(a);
  const up = Math.abs(_b.subVectors(b, a).normalize().y) > 0.9 ? _a.set(1, 0, 0) : _a.set(0, 1, 0);
  _m.lookAt(a, b, up);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.scale.set(1, 1, Math.max(0.001, len));
}
const segGeoCache = new Map<string, THREE.BufferGeometry>();
function segGeo(w: number, h: number) {
  const k = `${w},${h}`;
  let g = segGeoCache.get(k);
  if (!g) {
    // unit length along -Z; ends overhang so joints overlap into knuckles
    g = chamferBox(w, h, 1, Math.min(w, h) * 0.28).clone();
    g.translate(0, 0, -0.5);
    segGeoCache.set(k, g);
  }
  return g;
}

/**
 * Builds gloved hands out of chamfered segments. Grip pose frame: the handle
 * runs along +Y through the origin, the wrist is toward +Z and the fingers
 * wrap around the front (-Z) from the outer side (x = side). Cup pose frame
 * (left hand): a handguard runs along Z above the origin; the palm is under
 * it, the fingers climb its right side and the thumb its left.
 */
class HandKit {
  readonly group = new THREE.Group();
  constructor(readonly side: 1 | -1) {}
  box(size: [number, number, number], pos: [number, number, number], color: number, rot?: [number, number, number], parent: THREE.Object3D = this.group) {
    const m = new THREE.Mesh(chamferBox(size[0], size[1], size[2]), gunMat(color));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  }
  seg(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: number, parent: THREE.Object3D = this.group) {
    const m = new THREE.Mesh(segGeo(w, h), gunMat(color));
    // extend both ends a little so consecutive segments overlap
    const d = _v.subVectors(b, a).normalize().multiplyScalar(h * 0.3);
    orientSeg(m, a.clone().sub(d), b.clone().add(d));
    parent.add(m);
    return m;
  }
  /** Finger through a chain of points, glove color darkening toward the tip. */
  finger(pts: THREE.Vector3[], w: number, parent: THREE.Object3D = this.group) {
    const out: THREE.Mesh[] = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(this.seg(pts[i], pts[i + 1], w * (1 - i * 0.07), w * (1 - i * 0.07), i === 0 ? C.GLOVE_L : C.GLOVE_L, parent));
    return out;
  }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function makeGripPose(kit: HandKit, trigger: boolean) {
  const s = kit.side;
  const g = new THREE.Group();
  // back of the hand: a base plate with four raised metacarpal ridges fanning
  // in toward the wrist, and a rubber knuckle guard over the finger roots
  kit.box([0.014, 0.066, 0.05], [s * 0.023, -0.003, 0.014], C.GLOVE_L, [0, s * 0.12, 0], g);
  const ridge = trigger ? [0.029, 0.011, -0.007, -0.025] : [0.027, 0.009, -0.009, -0.026];
  for (const y of ridge) kit.seg(V(s * 0.03, y, -0.008), V(s * 0.025, y * 0.5 - 0.008, 0.044), 0.011, 0.0158, C.GLOVE, g);
  kit.box([0.009, 0.07, 0.014], [s * 0.032, -0.001, -0.011], C.GLOVE_D, undefined, g);
  // palm around the back of the handle, heel pad lower
  kit.box([0.042, 0.062, 0.02], [s * 0.004, -0.008, 0.031], C.PALM, undefined, g);
  kit.box([0.034, 0.03, 0.016], [s * 0.006, -0.03, 0.036], C.PALM, undefined, g);
  // fingers wrap the front of the handle
  const ys = trigger ? [0.011, -0.007, -0.025] : [0.027, 0.009, -0.009, -0.026];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    const w = i === ys.length - 1 ? 0.0145 : 0.0165;
    kit.finger([V(s * 0.027, y, -0.012), V(s * 0.019, y, -0.035), V(-s * 0.004, y - 0.001, -0.037), V(-s * 0.02, y - 0.002, -0.024)], w, g);
    kit.box([0.012, 0.013, 0.012], [s * 0.035, y, -0.013], C.GLOVE_D, undefined, g); // knuckle pad
  }
  // web of the hand over the backstrap, thumb along the inner side pointing forward
  kit.box([0.044, 0.014, 0.03], [s * 0.004, 0.031, 0.024], C.GLOVE, [0.2, 0, 0], g);
  kit.box([0.02, 0.034, 0.03], [-s * 0.016, 0.018, 0.022], C.GLOVE, undefined, g);
  kit.finger([V(-s * 0.02, 0.033, 0.02), V(-s * 0.023, 0.039, -0.004), V(-s * 0.019, 0.037, -0.025)], 0.016, g);
  // cuff with a velcro strap
  kit.box([0.046, 0.048, 0.028], [s * 0.012, -0.024, 0.062], C.GLOVE_D, [-0.25, 0, 0], g);
  kit.box([0.049, 0.014, 0.03], [s * 0.012, -0.013, 0.064], C.GLOVE_L, [-0.25, 0, 0], g);
  g.userData.wrist = V(s * 0.012, -0.03, 0.078);
  return g;
}

function makeCupPose(kit: HandKit) {
  // built for the left hand (side -1): outer side is -X
  const g = new THREE.Group();
  kit.box([0.05, 0.016, 0.076], [0.0, -0.012, 0.004], C.PALM, [0, 0, -0.12], g);
  kit.box([0.052, 0.012, 0.074], [-0.002, -0.024, 0.006], C.GLOVE, [0, 0, -0.12], g); // back of the hand
  kit.box([0.014, 0.014, 0.07], [0.024, -0.022, 0.0], C.GLOVE_D, [0, 0, 0.5], g); // knuckle armor
  // four fingers climb the right side and hook over the top corner
  const zs = [-0.028, -0.009, 0.01, 0.028];
  for (let i = 0; i < 4; i++) {
    const z = zs[i];
    const w = i === 3 ? 0.0145 : 0.0165;
    kit.finger([V(0.021, -0.015, z), V(0.031, 0.012, z - 0.002), V(0.024, 0.037, z - 0.004), V(0.009, 0.047, z - 0.004)], w, g);
  }
  // thenar and thumb up the left side, pointing forward along the top
  kit.box([0.022, 0.026, 0.04], [-0.024, -0.008, 0.018], C.GLOVE, [0, 0, 0.3], g);
  kit.finger([V(-0.028, -0.004, 0.014), V(-0.032, 0.01, -0.008), V(-0.029, 0.018, -0.032)], 0.016, g);
  kit.box([0.05, 0.03, 0.054], [-0.012, -0.034, 0.05], C.GLOVE_D, [0.5, 0, -0.25], g); // cuff
  kit.box([0.052, 0.034, 0.016], [-0.012, -0.03, 0.044], C.GLOVE_L, [0.5, 0, -0.25], g);
  g.userData.wrist = V(-0.014, -0.036, 0.062);
  return g;
}

/**
 * Middle finger: fist with the middle finger up. Frame: back of the hand
 * faces +Z, fingers point +Y, the wrist is at -Y (the emote turns the back
 * of the hand toward the horde).
 */
function makeBirdPose(kit: HandKit) {
  const s = kit.side;
  const g = new THREE.Group();
  kit.box([0.07, 0.074, 0.028], [0, -0.008, 0], C.PALM, undefined, g);
  kit.box([0.068, 0.06, 0.012], [0, -0.01, 0.016], C.GLOVE, undefined, g); // back of the hand
  // fingers from the thumb side: index, middle, ring, pinky
  const xs = [0.024, 0.008, -0.009, -0.025].map((x) => -s * x);
  for (let i = 0; i < 4; i++) {
    const x = xs[i];
    kit.seg(V(x, -0.036, 0.021), V(x, 0.022, 0.021), 0.0145, 0.01, C.GLOVE, g); // metacarpal ridge
    kit.box([0.014, 0.012, 0.012], [x, 0.03, 0.013], C.GLOVE_D, undefined, g); // knuckle pad
    const w = i === 3 ? 0.0145 : 0.0165;
    if (i === 1) kit.finger([V(x, 0.028, 0.004), V(x, 0.074, 0.006), V(x, 0.104, 0.006), V(x, 0.127, 0.003)], 0.0172, g);
    else kit.finger([V(x, 0.028, 0.004), V(x, 0.046, -0.018), V(x, 0.03, -0.038), V(x, 0.008, -0.032)], w, g);
  }
  // thumb folded across the front of the curled fingers
  kit.box([0.022, 0.036, 0.03], [-s * 0.034, -0.014, -0.004], C.GLOVE, [0, 0, -s * 0.2], g);
  kit.finger([V(-s * 0.036, -0.004, -0.012), V(-s * 0.03, 0.012, -0.034), V(-s * 0.008, 0.018, -0.046)], 0.016, g);
  kit.box([0.066, 0.034, 0.044], [0, -0.058, 0.004], C.GLOVE_D, undefined, g); // cuff
  kit.box([0.068, 0.014, 0.046], [0, -0.05, 0.005], C.GLOVE_L, undefined, g);
  g.userData.wrist = V(0, -0.074, 0.006);
  g.userData.watchUp = V(0, 0, 1);
  return g;
}

function makeArm(side: 1 | -1): Arm {
  const upper = new THREE.Mesh(sleeveGeo(0.046, 0.04, 0.88, [0.35, 0.7]), gunMat(C.SLEEVE, 0, 'fabric'));
  const fore = new THREE.Mesh(sleeveGeo(0.04, 0.031, 0.85, [0.3, 0.62]), gunMat(C.SLEEVE, 0, 'fabric'));
  const hand = new THREE.Group();
  const kit = new HandKit(side);
  const poses: Record<string, THREE.Group> = { grip: makeGripPose(kit, side > 0), bird: makeBirdPose(kit) };
  if (side < 0) poses.cup = makeCupPose(kit);
  for (const k in poses) hand.add(poses[k]);
  // rolled sleeve cuff and (left) wristwatch ride on each pose's wrist
  for (const k in poses) {
    const p = poses[k];
    const w: THREE.Vector3 = p.userData.wrist;
    const cuff = new THREE.Mesh(sleeveGeo(0.035, 0.034, 0.86, []), gunMat(C.SLEEVE_D, 0, 'fabric'));
    cuff.scale.set(1, 1, 0.045);
    cuff.name = 'cuff';
    cuff.userData.keep = true;
    p.add(cuff);
    p.userData.cuff = cuff;
    if (side < 0) {
      const watch = new THREE.Group();
      const strap = new THREE.Mesh(chamferBox(0.05, 0.05, 0.016), gunMat(0x1e1e1e, 0, 'rubber'));
      const body = new THREE.Mesh(chamferBox(0.026, 0.01, 0.026), gunMat(0x2a2c2e, 0, 'metal'));
      body.position.set(0, 0.026, 0);
      const face = new THREE.Mesh(chamferBox(0.019, 0.002, 0.019), gunMat(0x8fa39a, 0x18261e, 'glass'));
      face.position.set(0, 0.0315, 0);
      watch.add(strap, body, face);
      watch.name = 'watch';
      for (const c of watch.children) c.userData.keep = true;
      p.add(watch);
      p.userData.watch = watch;
    }
    void w;
  }
  let trigger: Arm['trigger'];
  if (side > 0) {
    const a = new THREE.Mesh(segGeo(0.0165, 0.0165), gunMat(C.GLOVE_L));
    const b = new THREE.Mesh(segGeo(0.0152, 0.0152), gunMat(C.GLOVE_L));
    const c = new THREE.Mesh(segGeo(0.014, 0.014), gunMat(C.GLOVE_L));
    const kn = new THREE.Mesh(chamferBox(0.012, 0.013, 0.012), gunMat(C.GLOVE_D));
    kn.position.set(0.035, 0.029, -0.013);
    poses.grip.add(a, b, c, kn);
    for (const f of [a, b, c]) f.userData.keep = true;
    trigger = { a, b, c, knuckle: V(0.027, 0.029, -0.012), curl: [V(0.019, 0.029, -0.035), V(-0.004, 0.028, -0.037), V(-0.02, 0.027, -0.024)] };
  }
  // one draw call per glove material per pose; cuff, watch and trigger finger move per frame
  for (const k in poses) mergeByMaterial(poses[k]);
  return {
    shoulder: new THREE.Vector3(side * 0.22, -0.4, 0.22),
    pole: new THREE.Vector3(side * 0.9, -1, 0.2).normalize(),
    upper,
    fore,
    hand,
    poses,
    trigger,
    lenA: 0.34,
    lenB: 0.36,
  };
}

/** Solve 2-bone IK; returns elbow position. */
export function solveIK(s: THREE.Vector3, t: THREE.Vector3, a: number, b: number, pole: THREE.Vector3, out: THREE.Vector3) {
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
  private ambient: THREE.AmbientLight;
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
  private idleT = 0;
  /** Lateral move lean and vertical inertia (jump lift / landing dip). */
  private lean = 0;
  private vertV = 0;
  private vertP = 0;
  private wasGround = true;
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
  /** Hide the gun itself (scoped in, or put away while peeing). */
  hideWeapon = false;
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
    // a gun held right of the eye and angled at the crosshair shows its left side
    this.camKey.position.set(-0.6, 0.5, 0.9);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambient);
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
    // the viewmodel gets its own, brighter light rig so dark guns keep their detail
    this.hemi.intensity = s.hemiIntensity * 1.35 + G.atmosphere.lightning * 3;
    this.camKey.color.copy(s.hemiSky).lerp(s.sunColor, 0.5);
    this.camKey.intensity = 0.75 + s.sunIntensity * 0.18;
    this.ambient.color.copy(s.hemiSky).lerp(_white, 0.5);
    this.ambient.intensity = 0.35 + s.hemiIntensity * 0.25;
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
    // idle breathing, strafe lean, and a springy jump/land response
    this.idleT += dt;
    const pl = G.player;
    // camera right vector for yaw ψ is (cos ψ, 0, -sin ψ)
    const side = pl.vel.x * Math.cos(pl.yaw) - pl.vel.z * Math.sin(pl.yaw);
    this.lean = damp(this.lean, clamp(side / 5, -1, 1), 6, dt);
    if (onGround && !this.wasGround) this.vertV -= 0.22;
    this.wasGround = onGround;
    const vTarget = onGround ? 0 : clamp(-pl.vel.y * 0.003, -0.015, 0.015);
    this.vertV += ((vTarget - this.vertP) * 90 - this.vertV * 11) * dt;
    this.vertP += this.vertV * dt;

    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.camera.updateMatrixWorld();

    if (!m) {
      this.holder.visible = false;
      for (const a of [this.armL, this.armR]) a.upper.visible = a.fore.visible = a.hand.visible = false;
      return;
    }
    this.holder.visible = !this.hideWeapon;
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
    const still = (1 - ads * 0.85) * (1 - moving * 0.7);
    p.x += Math.sin(this.idleT * 0.9) * 0.0022 * still - this.lean * 0.006 * (1 - ads * 0.7);
    p.y += Math.sin(this.idleT * 1.8) * 0.0016 * still + this.vertP * (1 - ads * 0.6);
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
      hr[2] * hipK + Math.sin(this.bobPhase) * 0.02 * bobAmt + this.recoilRot.x.z * 0.05 + this.animRot.z + this.sprint * 0.25 - this.swayX * 0.8 - this.lean * 0.05 * (1 - ads * 0.6) + Math.sin(this.idleT * 0.9) * 0.006 * still,
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
    const solve = (arm: Arm, target: THREE.Vector3, visible: boolean, handObj: THREE.Object3D | null, side: number, fingerOnTrigger: boolean) => {
      arm.upper.visible = arm.fore.visible = arm.hand.visible = visible && !this.hideArms;
      if (!visible || this.hideArms) return;
      const want = handObj?.userData.pose as string | undefined;
      const pose = want && arm.poses[want] ? want : 'grip';
      for (const k in arm.poses) arm.poses[k].visible = k === pose;
      const P = arm.poses[pose];
      const wristLocal: THREE.Vector3 = P.userData.wrist;
      const elbow = new THREE.Vector3();
      const wrist = new THREE.Vector3();
      if (handObj) {
        handObj.getWorldQuaternion(arm.hand.quaternion);
        wrist.copy(wristLocal).applyQuaternion(arm.hand.quaternion).add(target);
        solveIK(arm.shoulder, wrist, arm.lenA, arm.lenB, arm.pole, elbow);
      } else {
        solveIK(arm.shoulder, target, arm.lenA, arm.lenB + WRIST, arm.pole, elbow);
        _m.lookAt(elbow, target, up);
        arm.hand.quaternion.setFromRotationMatrix(_m);
        wrist.copy(wristLocal).applyQuaternion(arm.hand.quaternion).add(target);
        solveIK(arm.shoulder, wrist, arm.lenA, arm.lenB, arm.pole, elbow);
      }
      orientBox(arm.upper, arm.shoulder, elbow, up);
      orientBox(arm.fore, elbow, wrist, up);
      arm.hand.position.copy(target);
      // sleeve cuff and watch ride the forearm just behind the glove
      const inv = _q.copy(arm.hand.quaternion).invert();
      const dir = _v2.subVectors(wrist, elbow).normalize().applyQuaternion(inv);
      const cuff = P.userData.cuff as THREE.Object3D;
      _a.copy(wristLocal).addScaledVector(dir, -0.03);
      _b.copy(_a).add(dir);
      _m.lookAt(_a, _b, up);
      cuff.position.copy(_a);
      cuff.quaternion.setFromRotationMatrix(_m);
      const watch = P.userData.watch as THREE.Object3D | undefined;
      if (watch) {
        _a.copy(wristLocal).addScaledVector(dir, -0.012);
        _b.copy(_a).add(dir);
        // face toward the back of the wrist (outer side)
        const hint = P.userData.watchUp as THREE.Vector3 | undefined;
        _m.lookAt(_a, _b, hint ? _v.copy(hint) : pose === 'cup' ? _v.set(-0.8, -0.6, 0) : _v.set(-0.9, 0.45, 0));
        watch.position.copy(_a);
        watch.quaternion.setFromRotationMatrix(_m);
        watch.rotateX(-Math.PI / 2);
      }
      const tf = arm.trigger;
      if (tf) {
        const K = tf.knuckle;
        const T: THREE.Vector3 | undefined = fingerOnTrigger && handObj ? handObj.userData.trigger : undefined;
        let p1: THREE.Vector3;
        let p2: THREE.Vector3;
        let p3: THREE.Vector3;
        if (T && T.z < K.z - 0.015) {
          const d = _v.subVectors(T, K);
          if (d.length() > 0.068) d.setLength(0.068);
          p3 = K.clone().add(d);
          p1 = K.clone().addScaledVector(d, 0.45).add(_v2.set(0.004, 0.004, 0));
          p2 = K.clone().addScaledVector(d, 0.8).add(_v2.set(0.0015, 0.002, 0));
        } else [p1, p2, p3] = tf.curl;
        const ext = (a: THREE.Vector3, b: THREE.Vector3, h: number) => {
          const d = _v.subVectors(b, a).normalize().multiplyScalar(h * 0.3);
          return [a.clone().sub(d), b.clone().add(d)] as const;
        };
        orientSeg(tf.a, ...ext(K, p1, 0.0165));
        orientSeg(tf.b, ...ext(p1, p2, 0.015));
        orientSeg(tf.c, ...ext(p2, p3, 0.014));
      }
    };
    const gripName = this.bowMode ? 'support' : 'grip';
    const supName = this.bowMode ? 'grip' : 'support';
    const rObj = this.rhObj ?? m.mb.anchors[gripName];
    const rt = this.rhTarget ?? rObj.getWorldPosition(new THREE.Vector3());
    const lt = this.lhTarget ?? (this.lhObj ?? m.mb.anchors[supName]).getWorldPosition(new THREE.Vector3());
    solve(this.armR, rt, this.rhVisible, this.rhTarget ? null : rObj, 1, !this.bowMode && !this.rhObj);
    solve(this.armL, lt, this.lhVisible, this.lhTarget ? null : this.lhObj ?? m.mb.anchors[supName], -1, false);
  }
}
