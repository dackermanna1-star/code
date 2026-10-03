import * as THREE from 'three';
import { chamferBox, gunMat } from '../weapons/ModelBuilder';

/** Gojo's skin and uniform. */
export const SKIN = 0xc8987c;
const SKIN_D = 0xab7d64;
const NAIL = 0xe2bcae;
export const SLEEVE_G = 0x16171e;
export const SLEEVE_G2 = 0x0e0f14;

/** Skin, knuckle shade and nail colours of a pair of bare hands. */
export interface HandLook {
  skin: number;
  skinD: number;
  nail: number;
}
export const LOOK_GOJO: HandLook = { skin: SKIN, skinD: SKIN_D, nail: NAIL };
/** Sukuna in Yuji's body: a warmer skin tone and black nails. */
export const LOOK_SUKUNA: HandLook = { skin: 0xad7556, skinD: 0x8f5c42, nail: 0x0c0a0b };

type V3 = [number, number, number];

/**
 * A hand shape: per-finger joint flex (radians, + bends toward the palm),
 * spread (yaw), a lift for the finger that crosses over in the Infinite Void
 * sign, and explicit thumb joint positions. Right-hand frame: fingers point
 * -Z, back of the hand +Y, thumb on -X, wrist toward +Z.
 */
export interface HandPose {
  flex: [V3, V3, V3, V3];
  spread: [number, number, number, number];
  lift: [number, number, number, number];
  thumb: [V3, V3, V3, V3];
}

const CURL: V3 = [1.5, 1.72, 0.95];
export const HAND_POSES: Record<string, HandPose> = {
  relax: {
    flex: [[0.32, 0.45, 0.3], [0.38, 0.52, 0.34], [0.46, 0.6, 0.4], [0.55, 0.66, 0.46]],
    spread: [-0.05, 0, 0.05, 0.12],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.047, -0.017, 0.002], [-0.054, -0.022, -0.023], [-0.051, -0.026, -0.043]],
  },
  // Reversal: Red / Hollow Purple: index finger out
  point: {
    flex: [[0.02, 0.03, 0.02], CURL, CURL, [1.55, 1.75, 0.95]],
    spread: [0.02, 0.02, 0.04, 0.08],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.043, -0.021, 0.002], [-0.031, -0.031, -0.021], [-0.012, -0.033, -0.038]],
  },
  // Lapse: Blue: open, clawed palm that drags space toward it
  open: {
    flex: [[0.16, 0.28, 0.2], [0.14, 0.26, 0.2], [0.18, 0.3, 0.22], [0.22, 0.34, 0.26]],
    spread: [-0.2, -0.05, 0.1, 0.26],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.056, -0.012, 0.006], [-0.074, -0.014, -0.016], [-0.084, -0.015, -0.036]],
  },
  // Domain Expansion: index and middle crossed, the rest folded under the thumb
  cross: {
    flex: [[0.04, 0.04, 0.03], [-0.06, 0.05, 0.04], CURL, [1.55, 1.75, 0.95]],
    spread: [0.1, -0.17, 0.04, 0.08],
    lift: [0, 0.006, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.041, -0.022, 0.0], [-0.022, -0.032, -0.019], [0.002, -0.034, -0.032]],
  },
  // Lapse: Blue held: fingers hooked, gripping a ball of space
  claw: {
    flex: [[0.5, 0.75, 0.55], [0.48, 0.78, 0.58], [0.55, 0.82, 0.6], [0.62, 0.86, 0.62]],
    spread: [-0.24, -0.06, 0.12, 0.3],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.054, -0.018, 0.004], [-0.064, -0.03, -0.016], [-0.06, -0.04, -0.034]],
  },
  // Dismantle: a knife hand, fingers straight and pressed together
  blade: {
    flex: [[0.03, 0.04, 0.02], [0.02, 0.03, 0.02], [0.03, 0.04, 0.02], [0.05, 0.06, 0.03]],
    spread: [0.06, 0.02, -0.02, -0.06],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.04, -0.016, 0.0], [-0.038, -0.018, -0.024], [-0.032, -0.018, -0.042]],
  },
  // Malevolent Shrine: the Enma-ten sign. Middle fingers up, index curled behind, the rest folded
  mudra: {
    flex: [[1.15, 1.3, 0.7], [0.0, 0.02, 0.02], [1.45, 1.6, 0.9], [1.5, 1.7, 0.95]],
    spread: [0.05, 0, 0.04, 0.08],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.045, -0.014, 0.0], [-0.05, -0.012, -0.03], [-0.05, -0.01, -0.055]],
  },
  // Fuga: thumb and index pinch the nock of the flame arrow
  pinch: {
    flex: [[0.75, 0.9, 0.5], [1.0, 1.2, 0.7], [1.3, 1.5, 0.85], [1.4, 1.6, 0.9]],
    spread: [0.0, 0.02, 0.05, 0.1],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.045, -0.03, 0.0], [-0.04, -0.05, -0.035], [-0.03, -0.062, -0.058]],
  },
  fist: {
    flex: [CURL, CURL, CURL, [1.55, 1.75, 0.95]],
    spread: [0, 0, 0.03, 0.06],
    lift: [0, 0, 0, 0],
    thumb: [[-0.03, -0.012, 0.03], [-0.043, -0.021, 0.002], [-0.031, -0.031, -0.021], [-0.012, -0.033, -0.038]],
  },
};

const ROOT_X = [-0.027, -0.009, 0.009, 0.026];
const ROOT_Z = [-0.044, -0.046, -0.044, -0.037];
const LEN: V3[] = [
  [0.045, 0.027, 0.022],
  [0.049, 0.03, 0.024],
  [0.045, 0.028, 0.023],
  [0.034, 0.021, 0.019],
];
const THICK = [0.0175, 0.018, 0.017, 0.0155];

const segGeo = new Map<string, THREE.BufferGeometry>();
function unitSeg(w: number, h: number) {
  const k = `${w.toFixed(4)},${h.toFixed(4)}`;
  let g = segGeo.get(k);
  if (!g) {
    g = chamferBox(w, h, 1, Math.min(w, h) * 0.3).clone();
    g.translate(0, 0, -0.5);
    segGeo.set(k, g);
  }
  return g;
}

const _m = new THREE.Matrix4();
const _z = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
/** Orients a unit segment (along -Z) from a to b with its back facing `up`. */
function placeSeg(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, up: THREE.Vector3, overlap: number) {
  _z.subVectors(a, b);
  const len = _z.length();
  _z.multiplyScalar(1 / Math.max(1e-6, len));
  _x.crossVectors(up, _z).normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.position.copy(a).addScaledVector(_z, overlap);
  mesh.scale.set(1, 1, len + overlap * 2);
}

interface Finger {
  segs: THREE.Mesh[];
  nail: THREE.Mesh;
}

/**
 * Bare, articulated hand. Every joint is posed per frame, so the fingers
 * flow from one hand sign into the next.
 */
export class BareHand {
  readonly group = new THREE.Group();
  /** Wrist position in the hand frame (where the forearm ends). */
  readonly wrist = new THREE.Vector3(0, -0.002, 0.072);
  private fingers: Finger[] = [];
  private thumb: THREE.Mesh[] = [];
  private thumbNail: THREE.Mesh;
  private cur: HandPose;
  private target: HandPose;
  /** Blend speed toward the target pose (1/s). */
  rate = 16;

  private mSkin: THREE.MeshPhongMaterial;
  private mSkinD: THREE.MeshPhongMaterial;
  private mNail: THREE.MeshPhongMaterial;

  constructor(readonly side: 1 | -1) {
    const s = side;
    // own copies: the look (Gojo or Sukuna) recolours them
    const skin = (this.mSkin = gunMat(SKIN, 0, 'skin').clone());
    const skinD = (this.mSkinD = gunMat(SKIN_D, 0, 'skin').clone());
    const nail = (this.mNail = gunMat(NAIL, 0, 'poly').clone());
    const add = (size: V3, pos: V3, m: THREE.Material, rot?: V3) => {
      const mesh = new THREE.Mesh(chamferBox(size[0], size[1], size[2]), m);
      mesh.position.set(pos[0] * s, pos[1], pos[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1] * s, rot[2] * s);
      this.group.add(mesh);
      return mesh;
    };
    // palm block, the meat of the thumb, the heel and the wrist
    add([0.078, 0.024, 0.088], [0, 0, 0], skin);
    add([0.032, 0.02, 0.05], [-0.024, -0.009, 0.014], skin, [0, 0.25, 0]);
    add([0.06, 0.018, 0.03], [0.004, -0.008, 0.036], skin);
    add([0.058, 0.032, 0.034], [0, -0.002, 0.056], skin);
    // knuckles on the back of the hand
    for (let i = 0; i < 4; i++) add([THICK[i] * 0.9, 0.008, 0.014], [ROOT_X[i], 0.011, ROOT_Z[i] + 0.006], skinD);
    // tendons
    for (let i = 0; i < 4; i++) add([0.006, 0.004, 0.06], [ROOT_X[i] * 0.85, 0.012, -0.008], skinD, [0, ROOT_X[i] * 2.2, 0]);
    for (let f = 0; f < 4; f++) {
      const segs: THREE.Mesh[] = [];
      for (let k = 0; k < 3; k++) {
        const t = THICK[f] * (1 - k * 0.07);
        const m = new THREE.Mesh(unitSeg(t, t * 0.92), k === 0 ? skin : k === 1 ? skin : skinD);
        segs.push(m);
        this.group.add(m);
      }
      const n = new THREE.Mesh(chamferBox(THICK[f] * 0.72, 0.003, 0.0145), nail);
      this.group.add(n);
      this.fingers.push({ segs, nail: n });
    }
    for (let k = 0; k < 3; k++) {
      const t = 0.021 - k * 0.0015;
      const m = new THREE.Mesh(unitSeg(t, t * 0.9), k === 2 ? skinD : skin);
      this.thumb.push(m);
      this.group.add(m);
    }
    this.thumbNail = new THREE.Mesh(chamferBox(0.0135, 0.003, 0.014), nail);
    this.group.add(this.thumbNail);
    this.cur = clonePose(HAND_POSES.relax);
    this.target = HAND_POSES.relax;
    this.apply();
  }

  setLook(look: HandLook) {
    this.mSkin.color.setHex(look.skin);
    this.mSkinD.color.setHex(look.skinD);
    this.mNail.color.setHex(look.nail);
    // black nails get a little lacquer shine
    this.mNail.shininess = look.nail < 0x202020 ? 60 : 16;
    this.mNail.specular.setHex(look.nail < 0x202020 ? 0x4a4a50 : 0x1e1e1e);
  }

  setNailColor(hex: number) {
    this.mNail.color.setHex(hex);
  }

  setPose(name: string) {
    this.target = HAND_POSES[name] ?? HAND_POSES.relax;
  }

  snap(name: string) {
    this.setPose(name);
    this.cur = clonePose(this.target);
    this.apply();
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * this.rate);
    const c = this.cur;
    const t = this.target;
    for (let f = 0; f < 4; f++) {
      for (let j = 0; j < 3; j++) c.flex[f][j] += (t.flex[f][j] - c.flex[f][j]) * k;
      c.spread[f] += (t.spread[f] - c.spread[f]) * k;
      c.lift[f] += (t.lift[f] - c.lift[f]) * k;
      for (let j = 0; j < 3; j++) c.thumb[f][j] += (t.thumb[f][j] - c.thumb[f][j]) * k;
    }
    this.apply();
  }

  private pa = new THREE.Vector3();
  private pb = new THREE.Vector3();
  private d = new THREE.Vector3();
  private u = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private apply() {
    const s = this.side;
    const c = this.cur;
    for (let f = 0; f < 4; f++) {
      const F = this.fingers[f];
      const sp = c.spread[f];
      this.pa.set(ROOT_X[f] * s, 0.002 + c.lift[f], ROOT_Z[f]);
      this.d.set(Math.sin(sp) * s, 0, -Math.cos(sp));
      this.u.set(0, 1, 0);
      for (let j = 0; j < 3; j++) {
        const th = c.flex[f][j];
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        // bend toward the palm: rotate (d, u) within their plane
        this.tmp.copy(this.d).multiplyScalar(cs).addScaledVector(this.u, -sn);
        this.u.multiplyScalar(cs).addScaledVector(this.d, sn);
        this.d.copy(this.tmp);
        this.pb.copy(this.pa).addScaledVector(this.d, LEN[f][j]);
        placeSeg(F.segs[j], this.pa, this.pb, this.u, THICK[f] * 0.22);
        this.pa.copy(this.pb);
      }
      // nail near the tip, on the back of the last bone
      F.nail.quaternion.copy(F.segs[2].quaternion);
      F.nail.position.copy(this.pa).addScaledVector(this.d, -0.0075).addScaledVector(this.u, THICK[f] * 0.43);
    }
    const T = c.thumb;
    for (let j = 0; j < 3; j++) {
      this.pa.set(T[j][0] * s, T[j][1], T[j][2]);
      this.pb.set(T[j + 1][0] * s, T[j + 1][1], T[j + 1][2]);
      // the thumbnail faces away from the palm, roughly outward and up
      this.u.set(-0.55 * s, 0.85, 0).normalize();
      placeSeg(this.thumb[j], this.pa, this.pb, this.u, 0.004);
    }
    this.d.subVectors(this.pb, this.pa).normalize();
    this.thumbNail.quaternion.copy(this.thumb[2].quaternion);
    this.thumbNail.position.copy(this.pb).addScaledVector(this.d, -0.007).addScaledVector(this.u, 0.0085);
  }
}

function clonePose(p: HandPose): HandPose {
  return {
    flex: p.flex.map((f) => [...f]) as HandPose['flex'],
    spread: [...p.spread] as HandPose['spread'],
    lift: [...p.lift] as HandPose['lift'],
    thumb: p.thumb.map((t) => [...t]) as HandPose['thumb'],
  };
}
