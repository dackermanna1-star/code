import * as THREE from 'three';
import { clamp, dampTo } from '../core/math';

const D2R = Math.PI / 180;
/** Visual scale trick: the viewmodel is shrunk and moved closer so it never clips into walls. */
export const VM_SCALE = 0.26;

export interface ArmKey {
  p: [number, number, number];
  r: [number, number, number];
}
export interface VMPose {
  L: ArmKey;
  R: ArmKey;
  leg?: ArmKey;
}
interface VMKey {
  t: number;
  pose: VMPose;
  ease?: 'out' | 'in' | 'inout' | 'snap' | 'linear';
}
export interface VMAnim {
  keys: VMKey[];
  events?: Record<string, number>;
}

const HIDE_LEG: ArmKey = { p: [0.12, -1.0, 0.05], r: [0, 0, 0] };

export const VM_POSES: Record<string, VMPose> = {
  idle: { L: { p: [-0.24, -0.27, -0.42], r: [42, -14, 6] }, R: { p: [0.24, -0.27, -0.42], r: [42, 14, -6] } },
  guard: { L: { p: [-0.23, -0.19, -0.42], r: [38, -12, 6] }, R: { p: [0.25, -0.22, -0.39], r: [40, 14, -6] } },
  block: { L: { p: [-0.1, -0.04, -0.31], r: [76, -8, 10] }, R: { p: [0.1, -0.05, -0.3], r: [78, 8, -10] } },
  carry1h: { L: { p: [-0.26, -0.26, -0.42], r: [40, -14, 6] }, R: { p: [0.2, -0.22, -0.4], r: [30, 10, -6] } },
  carry2h: { L: { p: [-0.02, -0.26, -0.42], r: [20, 30, 30] }, R: { p: [0.2, -0.25, -0.34], r: [20, 10, -10] } },
  carryHeavy: { L: { p: [-0.26, -0.18, -0.5], r: [10, -6, 10] }, R: { p: [0.26, -0.18, -0.5], r: [10, 6, -10] } },
  grab: { L: { p: [-0.16, -0.1, -0.55], r: [8, -10, 40] }, R: { p: [0.2, -0.2, -0.4], r: [40, 12, -4] } },
  drink: { L: { p: [-0.26, -0.3, -0.42], r: [42, -14, 6] }, R: { p: [0.06, -0.05, -0.22], r: [-30, 20, -20] } },
  hidden: { L: { p: [-0.3, -0.7, -0.3], r: [60, 0, 0] }, R: { p: [0.3, -0.7, -0.3], r: [60, 0, 0] } },
};

function P(L: ArmKey, R: ArmKey, leg?: ArmKey): VMPose {
  return { L, R, leg };
}
const G = VM_POSES.guard;

export const VM_ANIMS: Record<string, VMAnim> = {
  jabL: {
    events: { hit: 0.075 },
    keys: [
      { t: 0, pose: G },
      { t: 0.04, pose: P({ p: [-0.22, -0.18, -0.36], r: [44, -12, 4] }, G.R), ease: 'out' },
      { t: 0.085, pose: P({ p: [-0.05, -0.08, -0.74], r: [8, -2, -6] }, { p: [0.23, -0.19, -0.34], r: [42, 14, -4] }), ease: 'snap' },
      { t: 0.24, pose: G, ease: 'inout' },
    ],
  },
  jabR: {
    events: { hit: 0.08 },
    keys: [
      { t: 0, pose: G },
      { t: 0.045, pose: P(G.L, { p: [0.24, -0.2, -0.33], r: [46, 12, -4] }), ease: 'out' },
      { t: 0.09, pose: P({ p: [-0.22, -0.18, -0.34], r: [42, -12, 4] }, { p: [0.04, -0.08, -0.76], r: [8, 2, 6] }), ease: 'snap' },
      { t: 0.26, pose: G, ease: 'inout' },
    ],
  },
  hookL: {
    events: { hit: 0.11 },
    keys: [
      { t: 0, pose: G },
      { t: 0.06, pose: P({ p: [-0.36, -0.12, -0.42], r: [20, -45, 60] }, G.R), ease: 'out' },
      { t: 0.12, pose: P({ p: [0.1, -0.06, -0.62], r: [12, 50, 80] }, { p: [0.24, -0.2, -0.33], r: [44, 14, -4] }), ease: 'snap' },
      { t: 0.32, pose: G, ease: 'inout' },
    ],
  },
  hookR: {
    events: { hit: 0.11 },
    keys: [
      { t: 0, pose: G },
      { t: 0.06, pose: P(G.L, { p: [0.36, -0.12, -0.42], r: [20, 45, -60] }), ease: 'out' },
      { t: 0.12, pose: P({ p: [-0.22, -0.18, -0.34], r: [44, -14, 4] }, { p: [-0.1, -0.06, -0.62], r: [12, -50, -80] }), ease: 'snap' },
      { t: 0.32, pose: G, ease: 'inout' },
    ],
  },
  uppercutR: {
    events: { hit: 0.13 },
    keys: [
      { t: 0, pose: G },
      { t: 0.07, pose: P(G.L, { p: [0.18, -0.36, -0.36], r: [60, 10, -10] }), ease: 'out' },
      { t: 0.14, pose: P({ p: [-0.22, -0.19, -0.34], r: [44, -14, 4] }, { p: [0.05, 0.04, -0.58], r: [-35, 4, -6] }), ease: 'snap' },
      { t: 0.36, pose: G, ease: 'inout' },
    ],
  },
  uppercutL: {
    events: { hit: 0.13 },
    keys: [
      { t: 0, pose: G },
      { t: 0.07, pose: P({ p: [-0.18, -0.36, -0.36], r: [60, -10, 10] }, G.R), ease: 'out' },
      { t: 0.14, pose: P({ p: [-0.05, 0.04, -0.58], r: [-35, -4, 6] }, { p: [0.23, -0.2, -0.34], r: [44, 14, -4] }), ease: 'snap' },
      { t: 0.36, pose: G, ease: 'inout' },
    ],
  },
  chargeR: {
    keys: [
      { t: 0, pose: G },
      { t: 0.35, pose: P({ p: [-0.18, -0.12, -0.46], r: [30, -10, 4] }, { p: [0.34, -0.12, -0.18], r: [30, 50, -20] }), ease: 'out' },
    ],
  },
  haymakerR: {
    events: { hit: 0.07 },
    keys: [
      { t: 0, pose: P({ p: [-0.18, -0.12, -0.46], r: [30, -10, 4] }, { p: [0.34, -0.12, -0.18], r: [30, 50, -20] }) },
      { t: 0.08, pose: P({ p: [-0.26, -0.22, -0.3], r: [44, -14, 4] }, { p: [-0.02, -0.06, -0.8], r: [6, -10, 30] }), ease: 'snap' },
      { t: 0.42, pose: G, ease: 'inout' },
    ],
  },
  kick: {
    events: { hit: 0.14 },
    keys: [
      { t: 0, pose: { ...G, leg: HIDE_LEG } },
      { t: 0.08, pose: P({ p: [-0.24, -0.1, -0.42], r: [30, -16, 10] }, { p: [0.26, -0.1, -0.4], r: [30, 16, -10] }, { p: [0.12, -0.95, -0.05], r: [40, 0, 0] }), ease: 'out' },
      { t: 0.15, pose: P({ p: [-0.28, -0.06, -0.4], r: [26, -20, 14] }, { p: [0.3, -0.06, -0.38], r: [26, 20, -14] }, { p: [0.06, -0.95, 0.0], r: [84, 0, 0] }), ease: 'snap' },
      { t: 0.32, pose: P(G.L, G.R, { p: [0.08, -0.95, -0.02], r: [70, 0, 0] }), ease: 'inout' },
      { t: 0.5, pose: { ...G, leg: HIDE_LEG }, ease: 'inout' },
    ],
  },
  stomp: {
    events: { hit: 0.18 },
    keys: [
      { t: 0, pose: { ...G, leg: HIDE_LEG } },
      { t: 0.12, pose: P(G.L, G.R, { p: [0.1, -0.7, -0.15], r: [35, 0, 0] }), ease: 'out' },
      { t: 0.19, pose: P({ p: [-0.24, -0.1, -0.42], r: [30, -16, 10] }, { p: [0.26, -0.1, -0.4], r: [30, 16, -10] }, { p: [0.08, -1.05, -0.25], r: [8, 0, 0] }), ease: 'snap' },
      { t: 0.45, pose: { ...G, leg: HIDE_LEG }, ease: 'inout' },
    ],
  },
  // weapon swings: right hand holds weapon
  swingA: {
    events: { hit: 0.12 },
    keys: [
      { t: 0, pose: VM_POSES.carry1h },
      { t: 0.1, pose: P({ p: [-0.28, -0.24, -0.42], r: [40, -14, 6] }, { p: [0.4, 0.02, -0.3], r: [-20, 70, -40] }), ease: 'out' },
      { t: 0.2, pose: P({ p: [-0.26, -0.28, -0.4], r: [44, -14, 6] }, { p: [-0.3, -0.14, -0.5], r: [10, -60, -90] }), ease: 'snap' },
      { t: 0.42, pose: VM_POSES.carry1h, ease: 'inout' },
    ],
  },
  swingB: {
    events: { hit: 0.12 },
    keys: [
      { t: 0, pose: VM_POSES.carry1h },
      { t: 0.1, pose: P({ p: [-0.3, -0.24, -0.42], r: [40, -14, 6] }, { p: [-0.18, 0.04, -0.34], r: [-10, -50, 60] }), ease: 'out' },
      { t: 0.2, pose: P({ p: [-0.26, -0.28, -0.4], r: [44, -14, 6] }, { p: [0.36, -0.16, -0.46], r: [20, 60, 70] }), ease: 'snap' },
      { t: 0.42, pose: VM_POSES.carry1h, ease: 'inout' },
    ],
  },
  overhead: {
    events: { hit: 0.16 },
    keys: [
      { t: 0, pose: VM_POSES.carry1h },
      { t: 0.14, pose: P({ p: [-0.28, -0.22, -0.42], r: [40, -14, 6] }, { p: [0.14, 0.18, -0.12], r: [-70, 10, -10] }), ease: 'out' },
      { t: 0.24, pose: P({ p: [-0.26, -0.3, -0.4], r: [44, -14, 6] }, { p: [0.04, -0.24, -0.62], r: [60, 0, -6] }), ease: 'snap' },
      { t: 0.5, pose: VM_POSES.carry1h, ease: 'inout' },
    ],
  },
  stab: {
    events: { hit: 0.08 },
    keys: [
      { t: 0, pose: VM_POSES.carry1h },
      { t: 0.06, pose: P(VM_POSES.carry1h.L, { p: [0.22, -0.2, -0.26], r: [20, 10, -6] }), ease: 'out' },
      { t: 0.11, pose: P({ p: [-0.26, -0.28, -0.38], r: [44, -14, 6] }, { p: [0.04, -0.1, -0.78], r: [4, 2, -4] }), ease: 'snap' },
      { t: 0.28, pose: VM_POSES.carry1h, ease: 'inout' },
    ],
  },
  swing2h: {
    events: { hit: 0.22 },
    keys: [
      { t: 0, pose: VM_POSES.carry2h },
      { t: 0.2, pose: P({ p: [0.24, 0.0, -0.3], r: [-10, 60, 20] }, { p: [0.46, -0.04, -0.2], r: [-10, 70, -20] }), ease: 'out' },
      { t: 0.32, pose: P({ p: [-0.42, -0.22, -0.46], r: [20, -60, 30] }, { p: [-0.2, -0.24, -0.5], r: [20, -60, -30] }), ease: 'snap' },
      { t: 0.62, pose: VM_POSES.carry2h, ease: 'inout' },
    ],
  },
  overhead2h: {
    events: { hit: 0.26 },
    keys: [
      { t: 0, pose: VM_POSES.carry2h },
      { t: 0.24, pose: P({ p: [0.0, 0.22, -0.16], r: [-70, 0, 20] }, { p: [0.16, 0.22, -0.12], r: [-70, 10, -10] }), ease: 'out' },
      { t: 0.36, pose: P({ p: [-0.06, -0.26, -0.56], r: [60, 0, 20] }, { p: [0.1, -0.26, -0.56], r: [60, 0, -10] }), ease: 'snap' },
      { t: 0.7, pose: VM_POSES.carry2h, ease: 'inout' },
    ],
  },
  throw: {
    events: { release: 0.17 },
    keys: [
      { t: 0, pose: VM_POSES.carry1h },
      { t: 0.14, pose: P({ p: [-0.2, -0.12, -0.5], r: [10, -20, 6] }, { p: [0.3, 0.1, -0.06], r: [-60, 30, -20] }), ease: 'out' },
      { t: 0.2, pose: P({ p: [-0.3, -0.3, -0.36], r: [44, -14, 6] }, { p: [0.02, -0.12, -0.75], r: [20, -10, 0] }), ease: 'snap' },
      { t: 0.45, pose: G, ease: 'inout' },
    ],
  },
  throwHeavy: {
    events: { release: 0.22 },
    keys: [
      { t: 0, pose: VM_POSES.carryHeavy },
      { t: 0.16, pose: P({ p: [-0.24, 0.0, -0.3], r: [-20, -6, 10] }, { p: [0.24, 0.0, -0.3], r: [-20, 6, -10] }), ease: 'out' },
      { t: 0.24, pose: P({ p: [-0.2, -0.16, -0.7], r: [20, -6, 10] }, { p: [0.2, -0.16, -0.7], r: [20, 6, -10] }), ease: 'snap' },
      { t: 0.55, pose: G, ease: 'inout' },
    ],
  },
  pickup: {
    events: { grab: 0.12 },
    keys: [
      { t: 0, pose: G },
      { t: 0.12, pose: P(G.L, { p: [0.12, -0.4, -0.5], r: [70, 0, -10] }), ease: 'out' },
      { t: 0.3, pose: VM_POSES.carry1h, ease: 'inout' },
    ],
  },
  grabPunch: {
    events: { hit: 0.09 },
    keys: [
      { t: 0, pose: VM_POSES.grab },
      { t: 0.05, pose: P(VM_POSES.grab.L, { p: [0.26, -0.18, -0.3], r: [44, 14, -4] }), ease: 'out' },
      { t: 0.1, pose: P(VM_POSES.grab.L, { p: [0.0, -0.08, -0.62], r: [8, -4, 10] }), ease: 'snap' },
      { t: 0.26, pose: VM_POSES.grab, ease: 'inout' },
    ],
  },
  drink: {
    keys: [
      { t: 0, pose: VM_POSES.carry1h },
      { t: 0.3, pose: VM_POSES.drink, ease: 'inout' },
      { t: 1.1, pose: P(VM_POSES.drink.L, { p: [0.04, 0.0, -0.2], r: [-50, 24, -24] }), ease: 'inout' },
      { t: 1.4, pose: G, ease: 'inout' },
    ],
  },
  hurt: {
    keys: [
      { t: 0, pose: G },
      { t: 0.06, pose: P({ p: [-0.28, -0.3, -0.36], r: [56, -20, 10] }, { p: [0.3, -0.32, -0.34], r: [56, 20, -10] }), ease: 'snap' },
      { t: 0.3, pose: G, ease: 'inout' },
    ],
  },
  rageRoar: {
    keys: [
      { t: 0, pose: G },
      { t: 0.25, pose: P({ p: [-0.42, 0.1, -0.4], r: [-30, -40, 40] }, { p: [0.42, 0.1, -0.4], r: [-30, 40, -40] }), ease: 'out' },
      { t: 0.75, pose: P({ p: [-0.44, 0.12, -0.42], r: [-34, -44, 44] }, { p: [0.44, 0.12, -0.42], r: [-34, 44, -44] }), ease: 'inout' },
      { t: 1.0, pose: G, ease: 'inout' },
    ],
  },
};

function easeFn(e: VMKey['ease'], t: number): number {
  switch (e) {
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'in':
      return t * t;
    case 'inout':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'snap': {
      const u = 1 - t;
      return 1 - u * u * u * u;
    }
    default:
      return t;
  }
}

function pixelTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface PlayerLook {
  skin: string;
  sleeve: string;
  sleeveDark: string;
  pants: string;
  boot: string;
}

/** First person arms + kicking leg. */
export class ViewModel {
  readonly root = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly leg = new THREE.Group();
  readonly handR = new THREE.Group(); // weapon socket
  readonly handL = new THREE.Group();
  private anim: { a: VMAnim; t: number; speed: number; fired: Set<string>; onEvent?: (n: string) => void; hold?: number } | null = null;
  base: VMPose = VM_POSES.idle;
  private baseTarget: VMPose = VM_POSES.idle;
  private baseBlend = 1;
  private prevBase: VMPose = VM_POSES.idle;
  private cur: VMPose = structuredClone(VM_POSES.idle) as VMPose;
  private swayX = 0;
  private swayY = 0;
  private tremble = 0;
  time = 0;
  bob = { phase: 0, amount: 0 };
  readonly materials: THREE.MeshStandardMaterial[] = [];
  bloodiness = 0;
  private knuckleTex: THREE.CanvasTexture;

  constructor(look: PlayerLook) {
    this.root.scale.setScalar(VM_SCALE);
    this.root.add(this.armL, this.armR, this.leg);
    const skinTex = pixelTex(8, 8, (g) => {
      g.fillStyle = look.skin;
      g.fillRect(0, 0, 8, 8);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 6; i++) g.fillRect((Math.random() * 8) | 0, (Math.random() * 8) | 0, 1, 1);
    });
    this.knuckleTex = pixelTex(16, 16, (g) => {
      g.fillStyle = look.skin;
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = 'rgba(80,30,20,0.35)';
      for (let k = 1; k < 4; k++) g.fillRect(k * 4, 0, 1, 16);
      g.fillStyle = 'rgba(255,230,210,0.25)';
      for (let k = 0; k < 4; k++) g.fillRect(k * 4 + 1, 2, 2, 2);
    });
    const sleeveTex = pixelTex(16, 16, (g) => {
      g.fillStyle = look.sleeve;
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = look.sleeveDark;
      for (let i = 0; i < 26; i++) g.fillRect((Math.random() * 16) | 0, (Math.random() * 16) | 0, 1, 1);
      g.fillRect(0, 0, 16, 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(2, 5, 1, 8);
      g.fillRect(9, 3, 1, 9);
    });
    const skinMat = new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.7 });
    const fistMat = new THREE.MeshStandardMaterial({ map: this.knuckleTex, roughness: 0.65 });
    const sleeveMat = new THREE.MeshStandardMaterial({ map: sleeveTex, roughness: 0.55, metalness: 0.05 });
    this.materials.push(skinMat, fistMat, sleeveMat);
    for (const [arm, hand, side] of [
      [this.armL, this.handL, -1],
      [this.armR, this.handR, 1],
    ] as const) {
      // fist at origin, forearm extends toward +Z (back toward camera) and down by arm rotation
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.115), [skinMat, skinMat, skinMat, skinMat, fistMat, skinMat]);
      fist.position.set(0, 0, 0);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.07), skinMat);
      thumb.position.set(-side * 0.055, -0.02, -0.02);
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.095, 0.16), skinMat);
      wrist.position.set(0, -0.005, 0.14);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.135, 0.5), sleeveMat);
      sleeve.position.set(0, -0.01, 0.46);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.145, 0.04), new THREE.MeshStandardMaterial({ color: look.sleeveDark, roughness: 0.6 }));
      cuff.position.set(0, -0.01, 0.22);
      arm.add(fist, thumb, wrist, sleeve, cuff, hand);
      hand.position.set(0, 0, 0);
      for (const m of [fist, thumb, wrist, sleeve, cuff]) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
    }
    // leg: hip pivot at group origin, leg extends down (-Y)
    const jeans = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.8 });
    const bootMat = new THREE.MeshStandardMaterial({ color: look.boot, roughness: 0.5 });
    const thighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.17), jeans);
    thighMesh.position.set(0, -0.25, 0);
    const shinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.48, 0.16), jeans);
    shinMesh.position.set(0, -0.72, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.3), bootMat);
    boot.position.set(0, -1.0, -0.06);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.31), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 }));
    sole.position.set(0, -1.075, -0.06);
    this.leg.add(thighMesh, shinMesh, boot, sole);
    this.leg.visible = false;
    this.applyPose(this.cur);
  }

  setBase(name: keyof typeof VM_POSES | VMPose): void {
    const p = typeof name === 'string' ? VM_POSES[name] : name;
    if (p === this.baseTarget) return;
    this.prevBase = structuredClone(this.base) as VMPose;
    this.baseTarget = p;
    this.baseBlend = 0;
  }

  play(name: string, opts: { speed?: number; onEvent?: (n: string) => void } = {}): void {
    const a = VM_ANIMS[name];
    if (!a) return;
    this.anim = { a, t: 0, speed: opts.speed ?? 1, fired: new Set(), onEvent: opts.onEvent };
  }

  /** hold the current animation at a time (charging) */
  hold(t: number | undefined): void {
    if (this.anim) this.anim.hold = t;
  }

  get playing(): string | null {
    if (!this.anim) return null;
    for (const k in VM_ANIMS) if (VM_ANIMS[k] === this.anim.a) return k;
    return null;
  }

  stop(): void {
    this.anim = null;
  }

  addSway(dx: number, dy: number): void {
    this.swayX = clamp(this.swayX - dx * 0.0009, -0.06, 0.06);
    this.swayY = clamp(this.swayY + dy * 0.0009, -0.06, 0.06);
  }

  setTremble(v: number): void {
    this.tremble = v;
  }

  jolt(): void {
    this.play('hurt');
  }

  update(dt: number): void {
    this.time += dt;
    // base pose blending
    this.baseBlend = Math.min(1, this.baseBlend + dt * 7);
    this.base = lerpPose(this.prevBase, this.baseTarget, smooth(this.baseBlend), this.base);
    let pose = this.base;
    if (this.anim) {
      const an = this.anim;
      if (an.hold === undefined || an.t < an.hold) an.t += dt * an.speed;
      if (an.hold !== undefined && an.t > an.hold) an.t = an.hold;
      if (an.a.events && an.onEvent) {
        for (const k in an.a.events) {
          if (!an.fired.has(k) && an.t >= an.a.events[k]) {
            an.fired.add(k);
            an.onEvent(k);
          }
        }
      }
      const keys = an.a.keys;
      const end = keys[keys.length - 1].t;
      if (an.t >= end && an.hold === undefined) {
        this.anim = null;
      } else {
        let k = 0;
        while (k < keys.length - 1 && keys[k + 1].t <= an.t) k++;
        if (k >= keys.length - 1) pose = keys[keys.length - 1].pose;
        else {
          const k0 = keys[k],
            k1 = keys[k + 1];
          const u = easeFn(k1.ease, clamp((an.t - k0.t) / Math.max(1e-4, k1.t - k0.t), 0, 1));
          pose = lerpPose(k0.pose, k1.pose, u, this.tmpPose);
        }
        // blend the last key back to the current base so stance changes mid-anim look right
        if (an.t > end * 0.8) {
          const w = (an.t - end * 0.8) / (end * 0.2);
          pose = lerpPose(pose, this.base, smooth(clamp(w, 0, 1)), this.tmpPose2);
        }
      }
    }
    // sway & bob
    this.swayX = dampTo(this.swayX, 0, 6, dt);
    this.swayY = dampTo(this.swayY, 0, 6, dt);
    const b = this.bob.amount;
    const ph = this.bob.phase;
    const bobX = Math.cos(ph) * 0.012 * b;
    const bobY = -Math.abs(Math.sin(ph)) * 0.016 * b;
    const idle = Math.sin(this.time * 1.6) * 0.004;
    const tr = this.tremble;
    const trX = tr > 0 ? (Math.random() - 0.5) * 0.008 * tr : 0;
    const trY = tr > 0 ? (Math.random() - 0.5) * 0.008 * tr : 0;
    this.cur = copyPose(pose, this.cur);
    for (const arm of [this.cur.L, this.cur.R]) {
      arm.p[0] += this.swayX + bobX + trX;
      arm.p[1] += this.swayY + bobY + idle + trY;
    }
    this.applyPose(this.cur);
  }

  private tmpPose: VMPose = structuredClone(VM_POSES.idle) as VMPose;
  private tmpPose2: VMPose = structuredClone(VM_POSES.idle) as VMPose;

  private applyPose(p: VMPose): void {
    setArm(this.armL, p.L);
    setArm(this.armR, p.R);
    if (p.leg && p.leg.p[1] > -0.99) {
      this.leg.visible = true;
      setArm(this.leg, p.leg);
    } else if (p.leg) {
      this.leg.visible = p.leg.r[0] > 5;
      setArm(this.leg, p.leg);
    } else this.leg.visible = false;
  }

  /** Splatter the knuckles with blood (pixel paint on the fist texture). */
  bloodyKnuckles(amount: number): void {
    const c = this.knuckleTex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const n = Math.ceil(amount * 6);
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.3 ? '#6a0608' : '#b01014';
      g.fillRect((Math.random() * 16) | 0, (Math.random() * 16) | 0, 1 + ((Math.random() * 2) | 0), 1);
    }
    this.knuckleTex.needsUpdate = true;
    this.bloodiness = Math.min(1, this.bloodiness + amount * 0.05);
  }
}

function setArm(g: THREE.Object3D, k: ArmKey): void {
  g.position.set(k.p[0], k.p[1], k.p[2]);
  g.rotation.set(k.r[0] * D2R, k.r[1] * D2R, k.r[2] * D2R, 'YXZ');
}

function lerpKey(a: ArmKey, b: ArmKey, t: number, out: ArmKey): ArmKey {
  for (let i = 0; i < 3; i++) {
    out.p[i] = a.p[i] + (b.p[i] - a.p[i]) * t;
    out.r[i] = a.r[i] + (b.r[i] - a.r[i]) * t;
  }
  return out;
}

function lerpPose(a: VMPose, b: VMPose, t: number, out: VMPose): VMPose {
  out.L ??= { p: [0, 0, 0], r: [0, 0, 0] };
  out.R ??= { p: [0, 0, 0], r: [0, 0, 0] };
  lerpKey(a.L, b.L, t, out.L);
  lerpKey(a.R, b.R, t, out.R);
  const la = a.leg ?? HIDE_LEG;
  const lb = b.leg ?? HIDE_LEG;
  if (a.leg || b.leg) {
    out.leg ??= { p: [0, 0, 0], r: [0, 0, 0] };
    lerpKey(la, lb, t, out.leg);
  } else out.leg = undefined;
  return out;
}

function copyPose(a: VMPose, out: VMPose): VMPose {
  return lerpPose(a, a, 0, out);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
