// Gore chunks: bits of flesh, bone and cloth thrown by gibs, pops and
// headshots. One instanced mesh; chunks fly, bounce on the planks (leaving a
// splat), come to rest and stay (oldest recycled), or sink into the sea.
import * as THREE from 'three';
import type { BloodSystem } from '../BloodSystem';
import { REFLECT_LAYER } from '../Stage';

interface Chunk {
  idx: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  s: number;
  bounces: number;
  rest: boolean;
  sinking: number;
}

const CAP = 1600;
const _o = new THREE.Object3D();
const _c = new THREE.Color();

/** Chunk palettes (linear-ish sRGB hex): flesh, dark meat, bone, rotten skin. */
const COLORS = [0x7a1010, 0x5a0808, 0x9a2a22, 0xd8c8b0, 0x6a7a4a, 0x8a1a14, 0x3a0606];

export class Gore {
  readonly mesh: THREE.InstancedMesh;
  private chunks: Chunk[] = [];
  private active: Chunk[] = [];
  private next = 0;
  private count = 0;
  /** Blood option multiplier. */
  amount = 1;
  isOnDeck: (x: number, z: number) => boolean = () => true;

  constructor(
    scene: THREE.Scene,
    private blood: BloodSystem,
  ) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    // Lumpy: push vertices in and out a little.
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453 % 1);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0, color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(g, mat, CAP);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.layers.enable(REFLECT_LAYER);
    this.mesh.name = 'Gore';
    scene.add(this.mesh);
    for (let i = 0; i < CAP; i++) this.mesh.setColorAt(i, _c.set(COLORS[i % COLORS.length]));
  }

  /**
   * Throw `n` chunks from p: `dirX/dirZ` bias, `speed` m/s, `size` m.
   * `bone` adds a few pale bone bits.
   */
  burst(p: { x: number; y: number; z: number }, n: number, o: { dirX?: number; dirZ?: number; speed?: number; up?: number; size?: number; spread?: number; tint?: number } = {}): void {
    n = Math.round(n * Math.min(1.6, this.amount));
    const sp = o.speed ?? 5;
    const up = o.up ?? 4;
    const size = o.size ?? 0.06;
    const spread = o.spread ?? 1;
    for (let i = 0; i < n; i++) {
      const idx = this.next;
      this.next = (this.next + 1) % CAP;
      this.count = Math.max(this.count, idx + 1);
      let c = this.chunks[idx];
      if (!c) {
        c = this.chunks[idx] = { idx, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, s: 1, bounces: 0, rest: false, sinking: 0 };
      } else if (!c.rest) {
        const k = this.active.indexOf(c);
        if (k >= 0) this.active.splice(k, 1);
      }
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      c.x = p.x + (Math.random() - 0.5) * 0.2;
      c.y = Math.max(0.05, p.y + (Math.random() - 0.5) * 0.2);
      c.z = p.z + (Math.random() - 0.5) * 0.2;
      c.vx = (o.dirX ?? 0) * sp * (0.4 + Math.random() * 0.8) + Math.cos(a) * sp * spread * r;
      c.vz = (o.dirZ ?? 0) * sp * (0.4 + Math.random() * 0.8) + Math.sin(a) * sp * spread * r * 0.7;
      c.vy = up * (0.4 + Math.random() * 0.9);
      c.rx = Math.random() * 6;
      c.ry = Math.random() * 6;
      c.rz = Math.random() * 6;
      const s = size * (0.45 + Math.random() * 1.1);
      c.s = s;
      c.sx = s * (0.8 + Math.random() * 0.8);
      c.sy = s * (0.5 + Math.random() * 0.5);
      c.sz = s * (0.7 + Math.random() * 0.6);
      c.bounces = 0;
      c.rest = false;
      c.sinking = 0;
      if (o.tint !== undefined && Math.random() < 0.5) this.mesh.setColorAt(idx, _c.set(o.tint));
      else this.mesh.setColorAt(idx, _c.set(COLORS[(idx * 7 + i) % COLORS.length]));
      this.active.push(c);
    }
    this.mesh.count = this.count;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    if (dt <= 0 || !this.active.length) return;
    let w = 0;
    for (const c of this.active) {
      c.vy -= 22 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      const spin = c.rest ? 0 : 9;
      c.rx += spin * dt * (c.vx > 0 ? 1 : -1);
      c.rz += spin * 0.7 * dt;
      const onDeck = this.isOnDeck(c.x, c.z);
      const floor = onDeck ? c.sy * 0.6 : -2.6;
      if (c.y < floor) {
        if (!onDeck) {
          // Sinks into the sea.
          c.sinking += dt;
          c.vx *= 0.9;
          c.vz *= 0.9;
          c.vy = -0.3;
          if (c.sinking > 1.2) {
            c.y = -50;
            c.rest = true;
          }
        } else {
          c.y = floor;
          if (c.bounces === 0 && Math.random() < 0.65) this.blood.splat('drop', c.x, c.z, c.s * (1.3 + Math.random() * 1.2), { angle: Math.atan2(c.vz, c.vx), stretch: 1.3 + Math.random() * 1.2 });
          if (c.vy < -2 && c.bounces < 2) {
            c.vy = -c.vy * 0.25;
            c.vx *= 0.45;
            c.vz *= 0.45;
            c.bounces++;
          } else {
            // Wet meat slides a little, then sticks.
            c.vy = 0;
            c.vx *= Math.exp(-dt * 9);
            c.vz *= Math.exp(-dt * 9);
            if (Math.abs(c.vx) + Math.abs(c.vz) < 0.15) {
              c.rest = true;
              c.rx = 0;
            }
          }
        }
      }
      this.write(c);
      if (!c.rest) this.active[w++] = c;
    }
    this.active.length = w;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(c: Chunk): void {
    _o.position.set(c.x, c.y, c.z);
    _o.rotation.set(c.rx, c.ry, c.rz);
    _o.scale.set(c.sx, c.sy, c.sz);
    _o.updateMatrix();
    this.mesh.setMatrixAt(c.idx, _o.matrix);
  }

  clear(): void {
    this.active.length = 0;
    this.count = 0;
    this.next = 0;
    this.mesh.count = 0;
  }

  get flying(): number {
    return this.active.length;
  }
}
