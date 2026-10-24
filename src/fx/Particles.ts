import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { QG, CG, groups } from '../physics/Physics';
import { DECAL, type Decals } from './Decals';

export type ParticleKind = 'blood' | 'chunk' | 'glass' | 'splinter' | 'spark' | 'dust' | 'liquid' | 'tooth' | 'debris' | 'mist';

export interface SpawnOpts {
  size: number;
  color: THREE.ColorRepresentation;
  life: number;
  gravity?: number;
  drag?: number;
  bounce?: number;
  spin?: number;
  stain?: boolean;
  stretch?: number;
  sizeEnd?: number;
  /** decal color override (defaults to particle color) */
  stainColor?: THREE.ColorRepresentation;
  stainScale?: number;
  /** 'spill' style decals for liquids */
  stainCell?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);
const RAY_GROUPS = groups(0xffff, CG.STATIC | CG.PROP);

/** Struct-of-arrays particle pool rendered with one InstancedMesh. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly cap: number;
  n = 0;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  size: Float32Array;
  sizeEnd: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  bounce: Float32Array;
  stretch: Float32Array;
  flags: Uint8Array; // 1 stain, 2 resting, 4 billboard, 8 noCollide
  stainCol: Float32Array;
  stainScale: Float32Array;
  stainCell: Int16Array;
  colR: Float32Array;
  colG: Float32Array;
  colB: Float32Array;

  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    cap: number,
    public collide: boolean,
    public billboard = false,
  ) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    const f = () => new Float32Array(cap);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.rx = f();
    this.ry = f();
    this.rz = f();
    this.wx = f();
    this.wy = f();
    this.wz = f();
    this.size = f();
    this.sizeEnd = f();
    this.life = f();
    this.maxLife = f();
    this.grav = f();
    this.drag = f();
    this.bounce = f();
    this.stretch = f();
    this.flags = new Uint8Array(cap);
    this.stainCol = new Float32Array(cap * 3);
    this.stainScale = f();
    this.stainCell = new Int16Array(cap);
    this.colR = f();
    this.colG = f();
    this.colB = f();
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, o: SpawnOpts): number {
    let i: number;
    if (this.n < this.cap) i = this.n++;
    else {
      // recycle the particle closest to death
      i = 0;
      let best = Infinity;
      for (let k = 0; k < this.n; k += 7) {
        const rem = this.life[k];
        if (rem < best) {
          best = rem;
          i = k;
        }
      }
    }
    this.px[i] = pos.x;
    this.py[i] = pos.y;
    this.pz[i] = pos.z;
    this.vx[i] = vel.x;
    this.vy[i] = vel.y;
    this.vz[i] = vel.z;
    this.rx[i] = Math.random() * 6.28;
    this.ry[i] = Math.random() * 6.28;
    this.rz[i] = Math.random() * 6.28;
    const spin = o.spin ?? 8;
    this.wx[i] = (Math.random() - 0.5) * spin;
    this.wy[i] = (Math.random() - 0.5) * spin;
    this.wz[i] = (Math.random() - 0.5) * spin;
    this.size[i] = o.size;
    this.sizeEnd[i] = o.sizeEnd ?? o.size;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.grav[i] = o.gravity ?? 15;
    this.drag[i] = o.drag ?? 0.4;
    this.bounce[i] = o.bounce ?? 0.25;
    this.stretch[i] = o.stretch ?? 0;
    this.flags[i] = (o.stain ? 1 : 0) | (this.billboard ? 4 : 0);
    _c.set(o.color);
    this.colR[i] = _c.r;
    this.colG[i] = _c.g;
    this.colB[i] = _c.b;
    this.mesh.setColorAt(i, _c);
    _c.set(o.stainColor ?? o.color);
    this.stainCol[i * 3] = _c.r;
    this.stainCol[i * 3 + 1] = _c.g;
    this.stainCol[i * 3 + 2] = _c.b;
    this.stainScale[i] = o.stainScale ?? 1;
    this.stainCell[i] = o.stainCell ?? -1;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return i;
  }

  kill(i: number): void {
    const last = --this.n;
    if (i !== last) {
      const arrs = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.rx, this.ry, this.rz, this.wx, this.wy, this.wz, this.size, this.sizeEnd, this.life, this.maxLife, this.grav, this.drag, this.bounce, this.stretch, this.stainScale, this.colR, this.colG, this.colB];
      for (const a of arrs) a[i] = a[last];
      this.flags[i] = this.flags[last];
      this.stainCell[i] = this.stainCell[last];
      this.stainCol[i * 3] = this.stainCol[last * 3];
      this.stainCol[i * 3 + 1] = this.stainCol[last * 3 + 1];
      this.stainCol[i * 3 + 2] = this.stainCol[last * 3 + 2];
      _c.setRGB(this.colR[i], this.colG[i], this.colB[i]);
      this.mesh.setColorAt(i, _c);
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

export class Particles {
  readonly group = new THREE.Group();
  private solid: Pool;
  private glass: Pool;
  private sparks: Pool;
  private dust: Pool;
  decals: Decals | null = null;
  raycastBudget = 500;
  onStain: ((pos: THREE.Vector3, normal: THREE.Vector3, size: number, color: THREE.Color, onFloor: boolean, kind: number) => void) | null = null;
  onSettle: ((pos: THREE.Vector3, kind: string) => void) | null = null;
  private camQuat = new THREE.Quaternion();
  maxScale = 1;

  constructor(maxParticles: number) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.solid = new Pool(
      box,
      new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.0 }),
      Math.floor(maxParticles * 0.7),
      true,
    );
    this.solid.mesh.castShadow = false;
    this.glass = new Pool(
      box,
      new THREE.MeshStandardMaterial({ roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7, depthWrite: false }),
      Math.floor(maxParticles * 0.15),
      true,
    );
    this.sparks = new Pool(
      box,
      new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      Math.floor(maxParticles * 0.1),
      false,
    );
    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.0, r);
          // pixelated edge
          gl_FragColor = vec4(vColor, a * 0.45);
        }`,
    });
    this.dust = new Pool(new THREE.PlaneGeometry(1, 1), dustMat, Math.floor(maxParticles * 0.12), false, true);
    for (const p of [this.solid, this.glass, this.sparks, this.dust]) this.group.add(p.mesh);
  }

  private poolFor(kind: ParticleKind): Pool {
    switch (kind) {
      case 'glass':
        return this.glass;
      case 'spark':
        return this.sparks;
      case 'dust':
      case 'mist':
        return this.dust;
      default:
        return this.solid;
    }
  }

  spawn(kind: ParticleKind, pos: THREE.Vector3, vel: THREE.Vector3, o: SpawnOpts): void {
    const pool = this.poolFor(kind);
    pool.spawn(pos, vel, o);
  }

  get activeCount(): number {
    return this.solid.n + this.glass.n + this.sparks.n + this.dust.n;
  }

  update(dt: number, camera: THREE.Camera): void {
    if (dt <= 0) {
      // still need billboards facing camera during freeze frames
      this.camQuat.copy(camera.quaternion);
      return;
    }
    this.camQuat.copy(camera.quaternion);
    let budget = this.raycastBudget;
    for (const pool of [this.solid, this.glass, this.sparks, this.dust]) {
      budget = this.updatePool(pool, dt, budget);
    }
  }

  private updatePool(pool: Pool, dt: number, budget: number): number {
    const phys = ctx.physics;
    for (let i = pool.n - 1; i >= 0; i--) {
      pool.life[i] -= dt;
      if (pool.life[i] <= 0) {
        pool.kill(i);
        continue;
      }
      const resting = (pool.flags[i] & 2) !== 0;
      if (!resting) {
        const drag = Math.max(0, 1 - pool.drag[i] * dt);
        pool.vx[i] *= drag;
        pool.vy[i] = pool.vy[i] * drag - pool.grav[i] * dt;
        pool.vz[i] *= drag;
        const ox = pool.px[i],
          oy = pool.py[i],
          oz = pool.pz[i];
        let nx = ox + pool.vx[i] * dt,
          ny = oy + pool.vy[i] * dt,
          nz = oz + pool.vz[i] * dt;
        if (pool.collide && budget > 0) {
          _d.set(nx - ox, ny - oy, nz - oz);
          const len = _d.length();
          if (len > 1e-5) {
            budget--;
            _d.multiplyScalar(1 / len);
            _p.set(ox, oy, oz);
            const hit = phys.raycast(_p, _d, len + pool.size[i] * 0.5, RAY_GROUPS);
            if (hit) {
              const owner = hit.owner;
              const isStatic = owner?.kind === 'static';
              if (pool.flags[i] & 1) {
                // stain and die (blood / liquid)
                if (isStatic && this.onStain) {
                  _c.setRGB(pool.stainCol[i * 3], pool.stainCol[i * 3 + 1], pool.stainCol[i * 3 + 2]);
                  const speed = Math.sqrt(pool.vx[i] ** 2 + pool.vy[i] ** 2 + pool.vz[i] ** 2);
                  const sz = pool.size[i] * pool.stainScale[i] * (2.2 + Math.min(speed, 12) * 0.25);
                  this.onStain(hit.point, hit.normal, sz, _c, hit.normal.y > 0.7, pool.stainCell[i]);
                }
                pool.kill(i);
                continue;
              }
              // bounce
              const n = hit.normal;
              const vn = pool.vx[i] * n.x + pool.vy[i] * n.y + pool.vz[i] * n.z;
              const b = pool.bounce[i];
              pool.vx[i] = (pool.vx[i] - (1 + b) * vn * n.x) * 0.7;
              pool.vy[i] = (pool.vy[i] - (1 + b) * vn * n.y) * 0.7;
              pool.vz[i] = (pool.vz[i] - (1 + b) * vn * n.z) * 0.7;
              pool.wx[i] *= 0.6;
              pool.wy[i] *= 0.6;
              pool.wz[i] *= 0.6;
              nx = hit.point.x + n.x * pool.size[i] * 0.5;
              ny = hit.point.y + n.y * pool.size[i] * 0.5;
              nz = hit.point.z + n.z * pool.size[i] * 0.5;
              const sp = Math.sqrt(pool.vx[i] ** 2 + pool.vy[i] ** 2 + pool.vz[i] ** 2);
              if (n.y > 0.6 && sp < 0.9 && isStatic) {
                pool.flags[i] |= 2;
                pool.vx[i] = pool.vy[i] = pool.vz[i] = 0;
                // lay flat-ish
                pool.rx[i] = Math.round(pool.rx[i] / (Math.PI / 2)) * (Math.PI / 2);
                pool.rz[i] = Math.round(pool.rz[i] / (Math.PI / 2)) * (Math.PI / 2);
                this.onSettle?.(_p.set(nx, ny, nz), 'chunk');
              }
            }
          }
        } else if (pool.collide && ny < -5) {
          pool.kill(i);
          continue;
        }
        pool.px[i] = nx;
        pool.py[i] = ny;
        pool.pz[i] = nz;
        pool.rx[i] += pool.wx[i] * dt;
        pool.ry[i] += pool.wy[i] * dt;
        pool.rz[i] += pool.wz[i] * dt;
      }
    }
    // write matrices
    const mesh = pool.mesh;
    for (let i = 0; i < pool.n; i++) {
      const t = 1 - pool.life[i] / pool.maxLife[i];
      let s = pool.size[i] + (pool.sizeEnd[i] - pool.size[i]) * t;
      // fade out by shrinking at the end of life
      const rem = pool.life[i];
      if (rem < 0.6 && !(pool.mesh.material as THREE.Material).transparent) s *= rem / 0.6;
      _p.set(pool.px[i], pool.py[i], pool.pz[i]);
      if (pool.flags[i] & 4) {
        _q.copy(this.camQuat);
        _s.set(s, s, s);
      } else if (pool.stretch[i] > 0 && !(pool.flags[i] & 2)) {
        // orient along velocity
        _d.set(pool.vx[i], pool.vy[i], pool.vz[i]);
        const sp = _d.length();
        if (sp > 0.01) _q.setFromUnitVectors(Y, _d.multiplyScalar(1 / sp));
        else _q.identity();
        _s.set(s, s * (1 + sp * pool.stretch[i]), s);
      } else {
        _e.set(pool.rx[i], pool.ry[i], pool.rz[i]);
        _q.setFromEuler(_e);
        _s.set(s, s, s);
      }
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.count = pool.n;
    mesh.instanceMatrix.needsUpdate = true;
    if (pool === this.dust) {
      // dust fades by alpha: encode in color brightness? keep color, shrink handled
    }
    return budget;
  }

  clear(): void {
    for (const p of [this.solid, this.glass, this.sparks, this.dust]) {
      p.n = 0;
      p.mesh.count = 0;
    }
  }
}

export { DECAL, _q2 as _unusedQuat };
void QG;
