import * as THREE from 'three';
import { clamp, damp, noise } from '../core/math';
import type { CharacterModel, Rig } from './CharacterModel';

export type Gesture =
  | 'none'
  | 'talk'
  | 'wave'
  | 'cheer'
  | 'clap'
  | 'crossArms'
  | 'tapFoot'
  | 'checkWatch'
  | 'facepalm'
  | 'shrug'
  | 'eat'
  | 'hold'
  | 'stomp'
  | 'thumbsUp'
  | 'rubBelly'
  | 'think'
  | 'point'
  | 'handsHips'
  | 'dance';

type JointKey = Exclude<keyof Rig, 'root' | 'hatGroup'>;
const JOINTS: JointKey[] = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
  'hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR',
];

interface Pose {
  r: Record<JointKey, THREE.Vector3>;
  pelvisPos: THREE.Vector3;
}

function makePose(): Pose {
  const r = {} as Record<JointKey, THREE.Vector3>;
  for (const j of JOINTS) r[j] = new THREE.Vector3();
  return { r, pelvisPos: new THREE.Vector3() };
}

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/**
 * Procedural animation: locomotion (idle / walk / sit) blended with gesture
 * layers and a look-at system. All joint angles are damped for smooth,
 * springy transitions.
 */
export class Animator {
  speed = 0;
  sit = 0; // 0..1 target
  private sitCur = 0;
  seatHeight = 0.46;
  gesture: Gesture = 'none';
  private gestureW = 0;
  private lastGesture: Gesture = 'none';
  private phase = Math.random() * 10;
  private t = Math.random() * 100;
  lookTarget: THREE.Vector3 | null = null;
  private idleLook = new THREE.Vector2();
  private idleLookTimer = 0;
  mood = 0; // -1 slump .. 1 upbeat
  energy = 1; // bounce multiplier
  private target = makePose();
  private cur = makePose();
  private headYaw = 0;
  private headPitch = 0;
  onFootstep?: (side: number) => void;
  private lastStepSign = 0;
  hopHeight = 0;

  constructor(readonly model: CharacterModel) {}

  get rig() {
    return this.model.rig;
  }

  setGesture(g: Gesture) {
    if (g !== this.gesture) {
      this.lastGesture = this.gesture;
      this.gesture = g;
      this.gestureW = g === 'none' ? this.gestureW : 0;
    }
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const d = this.model.dims;
    const P = this.target;
    for (const j of JOINTS) P.r[j].set(0, 0, 0);
    P.pelvisPos.set(0, d.hipY, 0);

    this.sitCur = damp(this.sitCur, this.sit, 6, dt);
    const sit = this.sitCur;
    const walkW = clamp(this.speed / 1.0) * (1 - sit);
    const hs = d.thigh / 0.36;
    this.phase += (dt * this.speed) / (1.2 * hs) * Math.PI * 2;
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const e = this.energy;

    // ---------------------------------------------------------- idle
    const breathe = Math.sin(t * 1.6) * 0.018;
    const sway = noise.noise2(t * 0.25, 3.3);
    P.r.chest.x -= breathe;
    P.pelvisPos.x += sway * 0.012 * (1 - walkW);
    P.r.pelvis.z += sway * 0.025 * (1 - walkW);
    P.r.spine.z -= sway * 0.02 * (1 - walkW);
    P.r.shoulderL.z += 0.11 + breathe * 0.3;
    P.r.shoulderR.z -= 0.11 + breathe * 0.3;
    P.r.elbowL.x -= 0.14;
    P.r.elbowR.x -= 0.14;
    // posture from mood
    P.r.spine.x += -this.mood * 0.04 + (this.mood < 0 ? -this.mood * 0.08 : 0);
    P.r.neck.x += this.mood < 0 ? -this.mood * 0.12 : 0;

    // ---------------------------------------------------------- walk
    if (walkW > 0.001) {
      const w = walkW;
      P.r.hipL.x += -s * 0.48 * w;
      P.r.hipR.x += s * 0.48 * w;
      P.r.kneeL.x += (Math.max(0, c) * 0.8 + 0.06) * w;
      P.r.kneeR.x += (Math.max(0, -c) * 0.8 + 0.06) * w;
      P.r.footL.x += (s * 0.2 - Math.max(0, c) * 0.3) * w;
      P.r.footR.x += (-s * 0.2 - Math.max(0, -c) * 0.3) * w;
      P.pelvisPos.y += (Math.abs(c) * 0.03 - 0.02) * w * e;
      P.r.pelvis.y += s * 0.1 * w;
      P.r.pelvis.z += c * 0.035 * w;
      P.r.chest.y += -s * 0.16 * w;
      P.r.spine.x += 0.06 * w;
      P.r.shoulderL.x += s * 0.5 * w;
      P.r.shoulderR.x += -s * 0.5 * w;
      P.r.elbowL.x += (-0.25 - Math.max(0, -s) * 0.3) * w;
      P.r.elbowR.x += (-0.25 - Math.max(0, s) * 0.3) * w;
      P.r.head.y += s * 0.08 * w;
      P.r.head.x += Math.abs(c) * 0.03 * w;
      const stepSign = Math.sign(s);
      if (stepSign !== this.lastStepSign && walkW > 0.3) {
        this.onFootstep?.(stepSign);
        this.lastStepSign = stepSign;
      }
    }

    // ---------------------------------------------------------- sit
    if (sit > 0.001) {
      const sy = this.seatHeight + 0.07;
      P.pelvisPos.y = P.pelvisPos.y * (1 - sit) + sy * sit;
      P.pelvisPos.z += -0.02 * sit;
      P.r.hipL.x += -1.52 * sit;
      P.r.hipR.x += -1.52 * sit;
      P.r.kneeL.x += 1.5 * sit;
      P.r.kneeR.x += 1.5 * sit;
      P.r.hipL.z += 0.05 * sit;
      P.r.hipR.z -= 0.05 * sit;
      P.r.spine.x += 0.08 * sit;
      P.r.shoulderL.x += -0.55 * sit;
      P.r.shoulderR.x += -0.55 * sit;
      P.r.elbowL.x += -0.9 * sit;
      P.r.elbowR.x += -0.9 * sit;
    }

    // ---------------------------------------------------------- gestures
    const target = this.gesture === 'none' ? 0 : 1;
    this.gestureW = damp(this.gestureW, target, 8, dt);
    const gw = this.gestureW;
    const g = this.gesture === 'none' ? this.lastGesture : this.gesture;
    if (gw > 0.001 && g !== 'none') this.applyGesture(g, gw, P, t);

    // hop (celebrations)
    P.pelvisPos.y += this.hopHeight;

    // ---------------------------------------------------------- look-at
    let yaw = this.idleLook.x;
    let pitch = this.idleLook.y;
    this.idleLookTimer -= dt;
    if (this.idleLookTimer <= 0) {
      this.idleLookTimer = 1.5 + Math.random() * 3.5;
      this.idleLook.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.25);
    }
    if (this.lookTarget) {
      const head = this.rig.head;
      head.getWorldPosition(tmpV);
      tmpV.subVectors(this.lookTarget, tmpV);
      // into root-local frame
      tmpM.copy(this.rig.root.matrixWorld).invert();
      tmpV.transformDirection(tmpM);
      yaw = Math.atan2(tmpV.x, tmpV.z);
      pitch = -Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
    }
    yaw = clamp(yaw, -1.1, 1.1);
    pitch = clamp(pitch, -0.6, 0.55);
    this.headYaw = damp(this.headYaw, yaw, 5, dt);
    this.headPitch = damp(this.headPitch, pitch, 5, dt);
    P.r.neck.y += this.headYaw * 0.35;
    P.r.head.y += this.headYaw * 0.55;
    P.r.neck.x += this.headPitch * 0.3;
    P.r.head.x += this.headPitch * 0.5;
    this.model.face.look.set(clamp((yaw - this.headYaw * 0.9) * 2.5, -1, 1) + this.headYaw * 0.15, clamp(-(pitch - this.headPitch * 0.8) * 2, -1, 1));

    // ---------------------------------------------------------- apply (damped)
    const k = 14;
    for (const j of JOINTS) {
      const cv = this.cur.r[j];
      const tv = P.r[j];
      cv.x = damp(cv.x, tv.x, k, dt);
      cv.y = damp(cv.y, tv.y, k, dt);
      cv.z = damp(cv.z, tv.z, k, dt);
      this.rig[j].rotation.set(cv.x, cv.y, cv.z);
    }
    const cp = this.cur.pelvisPos;
    cp.x = damp(cp.x, P.pelvisPos.x, k, dt);
    cp.y = damp(cp.y, P.pelvisPos.y, 18, dt);
    cp.z = damp(cp.z, P.pelvisPos.z, k, dt);
    this.rig.pelvis.position.copy(cp);
    // keep feet planted while the pelvis bobs: compensate chest height tiny bit
    const blob = this.rig.root.userData.blob as THREE.Object3D | undefined;
    if (blob) blob.scale.setScalar(1 - this.hopHeight * 2);
    this.model.face.update(dt);
  }

  private applyGesture(g: Gesture, w: number, P: Pose, t: number) {
    const add = (j: JointKey, x: number, y: number, z: number) => {
      P.r[j].x += x * w;
      P.r[j].y += y * w;
      P.r[j].z += z * w;
    };
    // override: blend arms toward gesture targets (not purely additive)
    const set = (j: JointKey, x: number, y: number, z: number) => {
      const v = P.r[j];
      v.x += (x - v.x) * w;
      v.y += (y - v.y) * w;
      v.z += (z - v.z) * w;
    };
    switch (g) {
      case 'talk': {
        const a = Math.sin(t * 3.1);
        const b = Math.sin(t * 2.3 + 1);
        set('shoulderR', -0.45 + a * 0.15, 0.1, -0.35 + b * 0.1);
        set('elbowR', -1.2 + Math.sin(t * 4.2) * 0.25, 0, 0);
        set('shoulderL', -0.2 + b * 0.1, 0, 0.25);
        set('elbowL', -0.7 + a * 0.2, 0, 0);
        add('head', Math.sin(t * 5.3) * 0.05, Math.sin(t * 1.7) * 0.1, Math.sin(t * 2.1) * 0.04);
        add('chest', 0, Math.sin(t * 1.9) * 0.06, 0);
        break;
      }
      case 'wave': {
        set('shoulderR', -0.3, 0, -2.5);
        set('elbowR', -0.5 + Math.sin(t * 10) * 0.45, 0, 0);
        // twist the wrist so the palm faces whoever we're waving at
        set('handR', 0, -1.25, Math.sin(t * 10 + 0.6) * 0.2);
        add('head', 0, 0, 0.08);
        break;
      }
      case 'cheer': {
        const b = Math.abs(Math.sin(t * 7));
        set('shoulderL', -0.2, 0, 2.7 - b * 0.2);
        set('shoulderR', -0.2, 0, -2.7 + b * 0.2);
        set('elbowL', -0.35, 0, 0);
        set('elbowR', -0.35, 0, 0);
        add('head', -0.25, 0, 0);
        P.pelvisPos.y += b * 0.07 * w * this.energy;
        add('kneeL', b * 0.3, 0, 0);
        add('kneeR', b * 0.3, 0, 0);
        add('hipL', -b * 0.15, 0, 0);
        add('hipR', -b * 0.15, 0, 0);
        break;
      }
      case 'dance': {
        const b = Math.sin(t * 6);
        set('shoulderL', -0.4 + b * 0.3, 0, 1.2 + b * 0.4);
        set('shoulderR', -0.4 - b * 0.3, 0, -1.2 + b * 0.4);
        set('elbowL', -1.4, 0, 0);
        set('elbowR', -1.4, 0, 0);
        add('pelvis', 0, b * 0.25, b * 0.08);
        add('chest', 0, -b * 0.2, 0);
        add('head', 0, b * 0.2, -b * 0.1);
        P.pelvisPos.y += Math.abs(b) * 0.035 * w;
        break;
      }
      case 'clap': {
        const c = 0.5 + 0.5 * Math.sin(t * 15);
        set('shoulderL', -1.05, -0.35 - c * 0.25, 0.15);
        set('shoulderR', -1.05, 0.35 + c * 0.25, -0.15);
        set('elbowL', -0.8, 0, 0);
        set('elbowR', -0.8, 0, 0);
        add('head', -0.1, 0, 0);
        break;
      }
      case 'crossArms': {
        set('shoulderL', -0.55, -0.55, 0.25);
        set('shoulderR', -0.62, 0.55, -0.25);
        set('elbowL', -2.0, 0, 0);
        set('elbowR', -1.9, 0, 0);
        add('head', 0, 0, Math.sin(t * 0.7) * 0.05);
        break;
      }
      case 'handsHips': {
        set('shoulderL', 0.15, 0.3, 0.75);
        set('shoulderR', 0.15, -0.3, -0.75);
        set('elbowL', -1.7, 0, 0);
        set('elbowR', -1.7, 0, 0);
        break;
      }
      case 'tapFoot': {
        set('shoulderL', -0.55, -0.55, 0.25);
        set('shoulderR', -0.62, 0.55, -0.25);
        set('elbowL', -2.0, 0, 0);
        set('elbowR', -1.9, 0, 0);
        const tap = Math.max(0, Math.sin(t * 9));
        add('hipR', -0.12, 0, -0.05);
        add('kneeR', 0.18, 0, 0);
        add('footR', -tap * 0.45, 0, 0);
        add('head', Math.sin(t * 4.5) * 0.04, 0, 0);
        break;
      }
      case 'checkWatch': {
        set('shoulderL', -1.25, -0.35, 0.1);
        set('elbowL', -1.5, 0, 0);
        add('head', 0.35, 0.35, 0);
        break;
      }
      case 'facepalm': {
        set('shoulderR', -1.9, 0.25, -0.1);
        set('elbowR', -2.2, 0, 0);
        add('head', 0.35, 0, 0);
        add('spine', 0.08, 0, 0);
        break;
      }
      case 'shrug': {
        set('shoulderL', -0.25, 0, 0.45);
        set('shoulderR', -0.25, 0, -0.45);
        set('elbowL', -1.35, 0, 0);
        set('elbowR', -1.35, 0, 0);
        add('head', 0, 0, 0.18);
        add('chest', -0.05, 0, 0);
        break;
      }
      case 'eat': {
        const bite = Math.max(0, Math.sin(t * 1.4)) ** 3;
        set('shoulderL', -1.25 - bite * 0.2, -0.45, 0.1);
        set('shoulderR', -1.25 - bite * 0.2, 0.45, -0.1);
        set('elbowL', -1.7 - bite * 0.25, 0, 0);
        set('elbowR', -1.7 - bite * 0.25, 0, 0);
        add('head', 0.12 - bite * 0.1, 0, 0);
        break;
      }
      case 'hold': {
        set('shoulderL', -0.75, -0.2, 0.15);
        set('shoulderR', -0.75, 0.2, -0.15);
        set('elbowL', -0.9, 0, 0);
        set('elbowR', -0.9, 0, 0);
        break;
      }
      case 'stomp': {
        const st = Math.max(0, Math.sin(t * 6));
        set('shoulderL', 0.1, 0, 0.35);
        set('shoulderR', 0.1, 0, -0.35);
        set('elbowL', -0.5, 0, 0);
        set('elbowR', -0.5, 0, 0);
        add('hipR', -st * 0.6, 0, 0);
        add('kneeR', st * 0.9, 0, 0);
        add('head', 0.1, Math.sin(t * 12) * 0.12, 0);
        break;
      }
      case 'thumbsUp': {
        set('shoulderR', -1.0, 0.2, -0.35);
        set('elbowR', -1.3, 0, 0);
        add('head', -0.05, 0, -0.12);
        break;
      }
      case 'rubBelly': {
        const c = t * 5;
        set('shoulderL', -0.35 + Math.sin(c) * 0.08, -0.4, 0.2);
        set('elbowL', -1.55 + Math.cos(c) * 0.1, 0, 0);
        add('head', -0.1, 0, 0.1);
        break;
      }
      case 'think': {
        set('shoulderR', -1.05, 0.5, -0.1);
        set('elbowR', -2.25, 0, 0);
        set('shoulderL', -0.5, -0.5, 0.25);
        set('elbowL', -1.6, 0, 0);
        add('head', 0.05, 0.1, 0.15);
        break;
      }
      case 'point': {
        set('shoulderR', -1.45, 0, -0.1);
        set('elbowR', -0.1, 0, 0);
        break;
      }
    }
  }
}
