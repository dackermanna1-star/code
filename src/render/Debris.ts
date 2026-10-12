// Spent casings and dropped magazines. They bounce on the ice and then stay
// for the rest of the match, like the gold specks fanning out to the right
// of the hunter in the reference frames.
import * as THREE from 'three';
import type { ClipKind, ShellKind } from '../config/weapons';
import { REFLECT_LAYER } from './Stage';

interface Body {
  idx: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  bounces: number;
  rest: boolean;
}

/** Default casings are exaggerated so they read at gameplay scale (model casings come pre-scaled). */
let SHELL_SCALE = 2.2;

function defaultShellGeometry(kind: ShellKind): THREE.BufferGeometry {
  const dims: Record<string, [number, number]> = {
    small: [0.0045, 0.019],
    normal: [0.005, 0.03],
    shotgun: [0.0105, 0.06],
    awp: [0.0065, 0.062],
    minigun: [0.006, 0.05],
  };
  const [r, l] = dims[kind] ?? dims.small;
  const g = new THREE.CylinderGeometry(r, r, l, 7);
  g.rotateZ(Math.PI / 2);
  return g;
}

class ShellPool {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private active: Body[] = [];
  private readonly tmp = new THREE.Object3D();
  count = 0;

  constructor(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, readonly cap: number, metal = true) {
    // Kept bright (low metalness + a little emissive) so casings read as the
    // gold specks of the reference frames regardless of the environment map.
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: metal ? 0.35 : 0.05,
      roughness: metal ? 0.35 : 0.55,
      emissive: metal ? 0x3a2a08 : 0x200404,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.layers.enable(REFLECT_LAYER);
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3): Body {
    const idx = this.next;
    this.next = (this.next + 1) % this.cap;
    this.count = Math.max(this.count, idx + 1);
    this.mesh.count = this.count;
    // Recycled slot: drop the old body if it is still flying.
    this.active = this.active.filter((b) => b.idx !== idx);
    const b: Body = {
      idx,
      pos: pos.clone(),
      vel: vel.clone(),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40),
      bounces: 0,
      rest: false,
    };
    this.active.push(b);
    this.write(b);
    return b;
  }

  private write(b: Body): void {
    this.tmp.position.copy(b.pos);
    this.tmp.rotation.copy(b.rot);
    this.tmp.scale.setScalar(SHELL_SCALE);
    this.tmp.updateMatrix();
    this.mesh.setMatrixAt(b.idx, this.tmp.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, onBounce: (b: Body) => void, isOnFloe: (x: number, z: number) => boolean): void {
    let w = 0;
    for (const b of this.active) {
      b.vel.y -= 20 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
      const ground = isOnFloe(b.pos.x, b.pos.z) ? 0.012 : -100;
      if (b.pos.y < ground) {
        b.pos.y = ground;
        if (b.vel.y < -1.2 && b.bounces < 4) {
          b.vel.y = -b.vel.y * 0.35;
          b.vel.x *= 0.55;
          b.vel.z *= 0.55;
          b.spin.multiplyScalar(0.6);
          b.bounces++;
          onBounce(b);
        } else {
          // Settle lying on its side.
          b.rest = true;
          b.rot.set(b.rot.x, b.rot.y, 0);
        }
      }
      if (b.pos.y < -3) b.rest = true;
      this.write(b);
      if (!b.rest) this.active[w++] = b;
    }
    this.active.length = w;
  }

  clear(): void {
    this.active.length = 0;
    this.count = 0;
    this.next = 0;
    this.mesh.count = 0;
  }
}

export class Debris {
  private shells = new Map<ShellKind, ShellPool>();
  private clips: Array<{ obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; rest: boolean }> = [];
  /** Sound callback for bounces. */
  onShellBounce: ((kind: ShellKind, x: number, strength: number) => void) | null = null;
  isOnFloe: (x: number, z: number) => boolean = () => true;
  clipFactory: ((kind: ClipKind) => THREE.Object3D) | null = null;

  constructor(private scene: THREE.Scene, shellGeometry?: (k: ShellKind) => THREE.BufferGeometry) {
    const kinds: Array<[ShellKind, number, number]> = [
      ['small', 0xf0c040, 1500],
      ['normal', 0xf0c040, 1500],
      ['minigun', 0xf6c848, 3000],
      ['awp', 0xf0c040, 200],
      ['shotgun', 0xc02828, 400],
    ];
    if (shellGeometry) SHELL_SCALE = 1;
    for (const [k, color, cap] of kinds) {
      const geo = shellGeometry?.(k) ?? defaultShellGeometry(k);
      const pool = new ShellPool(geo, shellGeometry ? 0xffffff : color, cap, k !== 'shotgun');
      if (shellGeometry) {
        // Factory geometry may carry vertex colours.
        const m = pool.mesh.material as THREE.MeshStandardMaterial;
        if (geo.getAttribute('color')) m.vertexColors = true;
        else m.color.set(color);
      }
      this.shells.set(k, pool);
      scene.add(pool.mesh);
    }
  }

  /** Eject a casing from `pos` toward +X (the hunter faces -X, ejection port on his right). */
  shell(kind: ShellKind, pos: THREE.Vector3, carrier: THREE.Vector3, power = 1): void {
    const pool = this.shells.get(kind === 'none' ? 'small' : kind);
    if (!pool) return;
    const v = new THREE.Vector3(
      (1.6 + Math.random() * 1.6) * power + carrier.x * 0.5,
      (1.6 + Math.random() * 1.8) * power,
      (Math.random() - 0.35) * 1.4 * power + carrier.z * 0.5,
    );
    pool.spawn(pos, v);
  }

  clip(kind: ClipKind, pos: THREE.Vector3, carrier: THREE.Vector3): void {
    if (!this.clipFactory || kind === 'none') return;
    const obj = this.clipFactory(kind);
    obj.position.copy(pos);
    obj.scale.multiplyScalar(1.3);
    obj.traverse((o) => o.layers.enable(REFLECT_LAYER));
    this.scene.add(obj);
    this.clips.push({
      obj,
      vel: new THREE.Vector3(carrier.x * 0.5 + (Math.random() - 0.3) * 0.6, 0.5 + Math.random(), carrier.z * 0.5 + (Math.random() - 0.5) * 0.6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8),
      rest: false,
    });
    if (this.clips.length > 160) {
      const old = this.clips.shift()!;
      this.scene.remove(old.obj);
    }
  }

  update(dt: number): void {
    for (const [kind, pool] of this.shells) {
      pool.update(
        dt,
        (b) => {
          if (b.bounces <= 2) this.onShellBounce?.(kind, b.pos.x, Math.min(1, Math.abs(b.vel.y) / 3));
        },
        this.isOnFloe,
      );
    }
    for (const c of this.clips) {
      if (c.rest) continue;
      c.vel.y -= 18 * dt;
      c.obj.position.addScaledVector(c.vel, dt);
      c.obj.rotation.x += c.spin.x * dt;
      c.obj.rotation.y += c.spin.y * dt;
      c.obj.rotation.z += c.spin.z * dt;
      const ground = this.isOnFloe(c.obj.position.x, c.obj.position.z) ? 0.03 : -100;
      if (c.obj.position.y < ground) {
        c.obj.position.y = ground;
        if (c.vel.y < -1.5) {
          c.vel.y *= -0.3;
          c.vel.x *= 0.5;
          c.vel.z *= 0.5;
          c.spin.multiplyScalar(0.4);
        } else {
          c.rest = true;
          c.obj.rotation.x = 0;
          c.obj.rotation.z = 0;
        }
      }
      if (c.obj.position.y < -3) c.rest = true;
    }
  }

  clear(): void {
    for (const p of this.shells.values()) p.clear();
    for (const c of this.clips) this.scene.remove(c.obj);
    this.clips.length = 0;
  }
}
