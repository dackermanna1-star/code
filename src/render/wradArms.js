// First-person arms from WRAD ARMS by wriks (CC0 1.0, https://wriks.itch.io/wrad-arms): a rigged,
// skinned pair of arms (shoulder, upper arm, forearm with twist bones, wrist, three bones per
// digit). This drives that skeleton through the same interface as the viewmodel's own ArmRig:
// setHand(handMatrix) places the hand frame (origin at the wrist, +Z towards the knuckles, +Y the
// back of the hand, +X radial on the right hand / ulnar on the left - a right-handed basis on
// both), the arm follows on a two-bone IK from a fixed shoulder, and setFingers(pose) bends the
// digits from the 21-number grip pose. Grip poses are evened out first (the three outer fingers
// close together, each distal joint follows its middle one), so a hand never looks crooked.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GLB64 from '../assets/wradArmsGlb.js';

const DEG = Math.PI / 180;
const SCALE = 0.122; // model units -> metres (a hand of ~9.5 cm wrist to knuckles)
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

function basisQ(x, y, z, out) {
  return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
}
function worldQ(o, out) {
  o.matrixWorld.decompose(_v, out, _a);
  return out;
}
function worldP(o, out) {
  return out.setFromMatrixPosition(o.matrixWorld);
}

class WradSide {
  constructor(arms, side) {
    this.arms = arms;
    this.side = side;
    const s = side > 0 ? 'r' : 'l';
    const B = (n) => arms.bone(`${n}.${s}`);
    this.shoulderB = B('shoulder');
    this.bicep = B('bicep');
    this.fore = B('forearm');
    this.twist = [B('forearm.Twist0'), B('forearm.Twist1')].filter(Boolean);
    this.wristB = B('wrist');
    this.digits = FINGERS.map((f) => [1, 2, 3].map((k) => B(`finger_${f}${k}`)));
    this.thumb = [1, 2, 3].map((k) => B(`finger_thumb${k}`));
    this.root = new THREE.Group(); // (the mesh is shared: the arms add it once)
    this.shoulder = new THREE.Vector3(0.19 * side, -0.29, 0.1);
    this.elbowOut = 0.08;
    this.elbowDown = 0.3;
    this.elbowBack = 0.4;
    this.pose = new Float32Array(21);
    this.handQ = new THREE.Quaternion();
    this.restMeasure();
  }

  /** Rest-pose measurements: bone lengths, the hand frame and each bone's offset from it. */
  restMeasure() {
    const P = (o) => worldP(o, new THREE.Vector3());
    const S = P(this.bicep), E = P(this.fore), W = P(this.wristB);
    this.L1 = S.distanceTo(E);
    this.L2 = E.distanceTo(W);
    const M1 = P(this.digits[1][0]), I1 = P(this.digits[0][0]), K1 = P(this.digits[3][0]);
    // rest hand frame
    _z.subVectors(M1, W).normalize();
    _x.subVectors(this.side > 0 ? I1 : K1, this.side > 0 ? K1 : I1);
    _x.addScaledVector(_z, -_x.dot(_z)).normalize();
    _y.crossVectors(_z, _x).normalize();
    const H0 = basisQ(_x, _y, _z, new THREE.Quaternion());
    const H0i = H0.clone().invert();
    this.restHandQ = H0;
    this.wristOff = H0i.clone().multiply(worldQ(this.wristB, new THREE.Quaternion()));
    // the wrist joint of our hand frame vs the bone origin (in the hand frame)
    this.wristPosOff = new THREE.Vector3(0, 0, 0);
    // digits: each bone's rest orientation in the hand frame, and how far the model's rest pose
    // already bends each joint (measured, so a grip pose's angles mean the same thing here)
    this.digitRest = this.digits.map((ch) => ch.map((b) => H0i.clone().multiply(worldQ(b, new THREE.Quaternion()))));
    this.restFlex = this.digits.map((ch) => {
      const pts = ch.map((b) => P(b).sub(W).applyQuaternion(H0i));
      const ang = (a, b) => Math.atan2(-(b.y - a.y), b.z - a.z) / DEG;
      const a1 = ang(pts[0], pts[1]), a2 = ang(pts[1], pts[2]);
      return [a1, a2 - a1, Math.max(4, (a2 - a1) * 0.7)];
    });
    this.thumbRest = this.thumb.map((b) => H0i.clone().multiply(worldQ(b, new THREE.Quaternion())));
    // the thumb's own bend axis (in the hand frame): across its rest direction and the palm normal
    const T1 = P(this.thumb[0]), T2 = P(this.thumb[1]);
    const td = T2.sub(T1).applyQuaternion(H0i).normalize();
    this.thumbAxis = new THREE.Vector3().crossVectors(td, AY).normalize();
    if (this.side < 0) this.thumbAxis.negate();
    this.thumbDir = td;
    // upper arm and forearm: offsets from an aim basis (z along the bone, y = the bend normal)
    _z.subVectors(E, S).normalize();
    _y.subVectors(W, E).cross(_z).normalize(); // bend normal
    if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0);
    _x.crossVectors(_y, _z).normalize();
    this.bicepOff = basisQ(_x, _y, _z, new THREE.Quaternion()).invert().multiply(worldQ(this.bicep, new THREE.Quaternion()));
    // forearm: aim basis with y = the elbow's bend normal (the roll is carried by the twist bones)
    const bend = new THREE.Vector3().copy(_y);
    _z.subVectors(W, E).normalize();
    _y.copy(bend).addScaledVector(_z, -bend.dot(_z)).normalize();
    _x.crossVectors(_y, _z).normalize();
    const foreRest = worldQ(this.fore, new THREE.Quaternion());
    this.foreOff = basisQ(_x, _y, _z, new THREE.Quaternion()).invert().multiply(foreRest);
    // how the hand's back sits about the forearm at rest (its roll), and the twist bones' rest
    this.restRoll = this.rollOf(_z, _y, new THREE.Vector3(0, 1, 0).applyQuaternion(H0));
    const fi = foreRest.clone().invert();
    this.twistRel = this.twist.map((t) => fi.clone().multiply(worldQ(t, new THREE.Quaternion())));
    this.twistK = this.twist.map((t, i) => (this.twist.length === 2 ? [0.35, 0.75][i] : 0.5));
  }

  /** Angle of `v` about axis z, measured from y (all unit / perpendicular-ish). */
  rollOf(z, y, v) {
    const vp = _v.copy(v).addScaledVector(z, -v.dot(z));
    const x = _a.crossVectors(y, z);
    return Math.atan2(vp.dot(x), vp.dot(y));
  }

  /** Set a bone's world rotation (and optionally its world position). */
  setWorld(bone, q, pos = null) {
    const parent = bone.parent;
    parent.updateMatrixWorld(false);
    worldQ(parent, _q3).invert();
    bone.quaternion.copy(_q3.multiply(q));
    if (pos) bone.position.copy(parent.worldToLocal(_v.copy(pos)));
    bone.updateMatrixWorld(true);
  }

  setHand(handMatrix) {
    const Hq = this.handQ;
    const W = _d.setFromMatrixPosition(handMatrix).clone();
    handMatrix.decompose(_v, Hq, _a);
    const zH = _c.set(0, 0, 1).applyQuaternion(Hq).clone();
    const yH = _b.set(0, 1, 0).applyQuaternion(Hq).clone();
    // two-bone IK from the shoulder (as the viewmodel's own rig does it)
    const S = this.shoulder.clone();
    const L1 = this.L1, L2 = this.L2;
    let dist = S.distanceTo(W);
    if (dist > L1 + L2 - 0.005) {
      _a.subVectors(S, W).setLength(L1 + L2 - 0.005);
      S.copy(W).add(_a);
      dist = L1 + L2 - 0.005;
    }
    const axis = new THREE.Vector3().subVectors(W, S).normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const rad = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const C = S.clone().addScaledVector(axis, a);
    const pref = W.clone().addScaledVector(zH, -L2 * this.elbowBack);
    pref.x += this.elbowOut * this.side;
    pref.y -= this.elbowDown;
    pref.z += 0.04;
    pref.sub(C);
    pref.addScaledVector(axis, -pref.dot(axis));
    if (pref.lengthSq() < 1e-10) pref.set(this.side * 0.3, -1, 0).addScaledVector(axis, -axis.y);
    const E = C.addScaledVector(pref.normalize(), rad);
    // upper arm: along shoulder -> elbow, bend normal from the elbow's fold
    _z.subVectors(E, S).normalize();
    _y.subVectors(W, E).cross(_z);
    if (_y.lengthSq() < 1e-10) _y.set(0, 1, 0);
    _y.normalize();
    _x.crossVectors(_y, _z).normalize();
    this.setWorld(this.bicep, basisQ(_x, _y, _z, _q).multiply(this.bicepOff), S);
    // forearm: along elbow -> wrist, in the elbow's bend plane
    const bend = _y.clone();
    _z.subVectors(W, E).normalize();
    _y.copy(bend).addScaledVector(_z, -bend.dot(_z)).normalize();
    _x.crossVectors(_y, _z).normalize();
    const fz = _z.clone(), fy = _y.clone();
    this.setWorld(this.fore, basisQ(_x, _y, _z, _q).multiply(this.foreOff));
    // the forearm's twist (pronation) spread along its twist bones toward the hand
    let roll = this.rollOf(fz, fy, yH) - this.restRoll;
    roll = Math.atan2(Math.sin(roll), Math.cos(roll));
    const foreQ = worldQ(this.fore, new THREE.Quaternion());
    this.twist.forEach((t, i) => {
      const q = new THREE.Quaternion().setFromAxisAngle(fz, roll * this.twistK[i]).multiply(foreQ).multiply(this.twistRel[i]);
      this.setWorld(t, q);
    });
    // the hand itself, at the wrist
    this.setWorld(this.wristB, _q.copy(Hq).multiply(this.wristOff), W);
    this.applyFingers();
  }

  setFingers(p) {
    for (let i = 0; i < 21; i++) this.pose[i] = p[i];
    this.applyFingers();
  }

  /** The digits from the (evened-out) pose. */
  applyFingers() {
    const p = this.pose, side = this.side, Hq = this.handQ;
    // the three outer fingers close together; distal joints follow the middle ones
    const outer = [1, 2, 3];
    let mcp = 0, pip = 0;
    for (const d of outer) {
      mcp += p[d * 4];
      pip += p[d * 4 + 2];
    }
    mcp /= 3;
    pip /= 3;
    const flex = [
      [p[0], p[2], p[2] * 0.65],
      [mcp, pip, pip * 0.65],
      [mcp + 2, pip + 2, (pip + 2) * 0.65],
      [mcp + 5, pip + 4, (pip + 4) * 0.65],
    ];
    const abd = [Math.max(-6, Math.min(8, p[1])), 0, -3, -7];
    for (let d = 0; d < 4; d++) {
      // rotations in the hand frame: abduction about Y at the knuckle, flexion about X
      _q2.setFromAxisAngle(AY, abd[d] * side * DEG);
      let cum = 0;
      for (let k = 0; k < 3; k++) {
        // (relative to the model's own rest curl; never bent back, never past a fist)
        const want = Math.min(k === 0 ? 90 : 105, Math.max(0, flex[d][k]));
        cum += want - this.restFlex[d][k];
        const q = _q.copy(_q2).multiply(_q3.setFromAxisAngle(AX, cum * DEG)).multiply(this.digitRest[d][k]);
        this.setWorld(this.digits[d][k], q.premultiply(Hq));
      }
    }
    // thumb: aimed (from its rest direction) where the grip wants it - round the far side of a
    // firing grip, along the handguard on a support hand - then bent along itself
    const across = p[16];
    const radial = 0.35 - across * 0.015, palmar = 0.15 + across * 0.008;
    _a.set(radial * side, -palmar, 1).normalize();
    _q2.setFromUnitVectors(this.thumbDir, _a);
    const ax = _b.copy(this.thumbAxis).applyQuaternion(_q2);
    const bend = [p[19] * 1.2 + 14, p[20] * 1.2 + 12];
    let cum = 0;
    for (let k = 0; k < 3; k++) {
      if (k > 0) cum += Math.max(0, bend[k - 1]);
      const q = _q.copy(_q3.setFromAxisAngle(ax, cum * DEG)).multiply(_q2).multiply(this.thumbRest[k]);
      this.setWorld(this.thumb[k], q.premultiply(Hq));
    }
  }
}

/** Load the arms (async). Resolves to { root, right, left } or null if it fails. */
export function loadWradArms(material = null) {
  return new Promise((resolve) => {
    try {
      const bin = atob(GLB64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      new GLTFLoader().parse(buf.buffer, '', (gltf) => {
        const root = new THREE.Group();
        root.name = 'wradArms';
        const scene = gltf.scene;
        scene.scale.setScalar(SCALE);
        root.add(scene);
        const bones = new Map();
        let mesh = null;
        scene.traverse((o) => {
          if (o.isBone || o.type === 'Bone' || (o.name && !o.isMesh)) bones.set(o.name, o);
          if (o.isSkinnedMesh) mesh = o;
        });
        if (!mesh) return resolve(null);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        if (material) mesh.material = material;
        else {
          const m = mesh.material;
          m.roughness = 0.75;
          m.metalness = 0;
          if (m.map) {
            m.map.colorSpace = THREE.SRGBColorSpace;
            m.map.anisotropy = 4;
          }
        }
        root.updateMatrixWorld(true);
        // (the loader strips '.' from node names)
        const arms = { root, mesh, bone: (n) => bones.get(n) || bones.get(THREE.PropertyBinding.sanitizeNodeName(n)) || null };
        arms.right = new WradSide(arms, 1);
        arms.left = new WradSide(arms, -1);
        resolve(arms);
      }, () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}
