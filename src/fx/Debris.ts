import * as THREE from 'three';

export interface DebrisKind {
  geo: THREE.BufferGeometry;
  max: number;
  bounce: number;
  friction: number;
  /** Sound hook id when it hits the ground hard enough. */
  sound?: string;
  /** Called on first ground impact (e.g. blood stain for gibs). */
  onLand?: (x: number, z: number, speed: number, color: THREE.Color) => void;
  castShadow?: boolean;
  vertexColors?: boolean;
  emissive?: number;
}

/**
 * Cheap CPU-simulated debris (shell casings, gibs, splinters). Bounces on the
 * ground plane, then rests forever (ring buffer recycles the oldest).
 */
export class DebrisSystem {
  readonly mesh: THREE.InstancedMesh;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private q: Float32Array;
  private av: Float32Array;
  private scl: Float32Array;
  private awake: Uint8Array;
  private bounces: Uint8Array;
  private floorY: Float32Array;
  private cols: THREE.Color[] = [];
  private head = 0;
  private count = 0;
  private awakeList: number[] = [];
  private m = new THREE.Matrix4();
  private qq = new THREE.Quaternion();
  private pp = new THREE.Vector3();
  private ss = new THREE.Vector3();
  private c = new THREE.Color();
  onSound: ((x: number, y: number, z: number, speed: number, kind: string) => void) | null = null;

  constructor(readonly kind: DebrisKind, material: THREE.Material) {
    const n = kind.max;
    this.mesh = new THREE.InstancedMesh(kind.geo, material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = kind.castShadow ?? false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.q = new Float32Array(n * 4);
    this.av = new Float32Array(n * 3);
    this.scl = new Float32Array(n * 3);
    this.awake = new Uint8Array(n);
    this.bounces = new Uint8Array(n);
    this.floorY = new Float32Array(n);
    for (let i = 0; i < n; i++) this.cols.push(new THREE.Color(1, 1, 1));
    // allocate instance colors
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, color?: THREE.Color | number, floor = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.kind.max;
    if (this.count < this.kind.max) this.count++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.qq.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    this.q[i * 4] = this.qq.x;
    this.q[i * 4 + 1] = this.qq.y;
    this.q[i * 4 + 2] = this.qq.z;
    this.q[i * 4 + 3] = this.qq.w;
    this.av[i * 3] = (Math.random() - 0.5) * 30;
    this.av[i * 3 + 1] = (Math.random() - 0.5) * 30;
    this.av[i * 3 + 2] = (Math.random() - 0.5) * 30;
    this.scl[i * 3] = sx;
    this.scl[i * 3 + 1] = sy;
    this.scl[i * 3 + 2] = sz;
    this.bounces[i] = 0;
    this.floorY[i] = floor;
    if (color !== undefined) {
      if (typeof color === 'number') this.cols[i].setHex(color);
      else this.cols[i].copy(color);
    } else this.cols[i].setRGB(1, 1, 1);
    this.mesh.setColorAt(i, this.cols[i]);
    if (!this.awake[i]) {
      this.awake[i] = 1;
      this.awakeList.push(i);
    }
    this.writeMatrix(i);
    this.mesh.count = this.count;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private writeMatrix(i: number) {
    this.qq.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]);
    this.pp.set(this.px[i], this.py[i], this.pz[i]);
    this.ss.set(this.scl[i * 3], this.scl[i * 3 + 1], this.scl[i * 3 + 2]);
    this.m.compose(this.pp, this.qq, this.ss);
    this.mesh.setMatrixAt(i, this.m);
  }

  private dq = new THREE.Quaternion();
  private axis = new THREE.Vector3();

  update(dt: number) {
    if (this.awakeList.length === 0) return;
    const k = this.kind;
    for (let n = this.awakeList.length - 1; n >= 0; n--) {
      const i = this.awakeList[n];
      this.vy[i] -= 9.81 * dt;
      const drag = Math.exp(-0.3 * dt);
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const half = Math.min(this.scl[i * 3], this.scl[i * 3 + 1], this.scl[i * 3 + 2]) * 0.5;
      const floor = this.floorY[i] + half;
      // spin
      const ax = this.av[i * 3], ay = this.av[i * 3 + 1], az = this.av[i * 3 + 2];
      const w = Math.hypot(ax, ay, az);
      if (w > 0.01) {
        this.axis.set(ax / w, ay / w, az / w);
        this.dq.setFromAxisAngle(this.axis, w * dt);
        this.qq.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]).premultiply(this.dq);
        this.q[i * 4] = this.qq.x;
        this.q[i * 4 + 1] = this.qq.y;
        this.q[i * 4 + 2] = this.qq.z;
        this.q[i * 4 + 3] = this.qq.w;
      }
      if (this.py[i] < floor) {
        this.py[i] = floor;
        const speed = Math.abs(this.vy[i]);
        if (this.bounces[i] < 3 && speed > 0.8) {
          if (k.sound) this.onSound?.(this.px[i], this.py[i], this.pz[i], speed, k.sound);
          if (this.bounces[i] === 0 && k.onLand) k.onLand(this.px[i], this.pz[i], speed, this.cols[i]);
        }
        this.bounces[i]++;
        this.vy[i] = speed * k.bounce;
        this.vx[i] *= k.friction;
        this.vz[i] *= k.friction;
        this.av[i * 3] *= 0.6;
        this.av[i * 3 + 1] *= 0.6;
        this.av[i * 3 + 2] *= 0.6;
        if (speed < 0.6 && Math.hypot(this.vx[i], this.vz[i]) < 0.2) {
          // settle flat-ish: kill spin, rest
          this.vy[i] = 0;
          this.awake[i] = 0;
          this.awakeList[n] = this.awakeList[this.awakeList.length - 1];
          this.awakeList.pop();
        }
      }
      this.writeMatrix(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.head = 0;
    this.mesh.count = 0;
    for (const i of this.awakeList) this.awake[i] = 0;
    this.awakeList.length = 0;
  }
}

/** Box geometry with per-face vertex color (two-tone shells). */
export function twoToneBox(w: number, h: number, d: number, split: number, c1: number, c2: number) {
  const a = new THREE.BoxGeometry(w, h * split, d);
  a.translate(0, -h / 2 + (h * split) / 2, 0);
  const b = new THREE.BoxGeometry(w, h * (1 - split), d);
  b.translate(0, h / 2 - (h * (1 - split)) / 2, 0);
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };
  paint(a, c1);
  paint(b, c2);
  const out = new THREE.BufferGeometry();
  const pa = a.getAttribute('position').array as Float32Array;
  const pb = b.getAttribute('position').array as Float32Array;
  const na = a.getAttribute('normal').array as Float32Array;
  const nb = b.getAttribute('normal').array as Float32Array;
  const ca = a.getAttribute('color').array as Float32Array;
  const cb = b.getAttribute('color').array as Float32Array;
  const cat = (x: Float32Array, y: Float32Array) => {
    const r = new Float32Array(x.length + y.length);
    r.set(x);
    r.set(y, x.length);
    return r;
  };
  out.setAttribute('position', new THREE.BufferAttribute(cat(pa, pb), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(cat(na, nb), 3));
  out.setAttribute('color', new THREE.BufferAttribute(cat(ca, cb), 3));
  const ia = Array.from(a.getIndex()!.array);
  const ib = Array.from(b.getIndex()!.array).map((i) => i + a.getAttribute('position').count);
  out.setIndex([...ia, ...ib]);
  return out;
}
