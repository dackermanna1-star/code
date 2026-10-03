// Little physical bits: crumbs, peel curls, juice droplets that bounce and settle, then fade.

import * as THREE from 'three';

interface Bit {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
  floor: number;
  age: number;
  life: number;
  color: THREE.Color;
  kind: number;
  resting: boolean;
}

export interface DebrisSpec {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color | string;
  size: number;
  /** y of the surface it lands on */
  floor: number;
  life?: number;
  /** 0 = chunk, 1 = flat flake/peel, 2 = drop */
  kind?: 0 | 1 | 2;
}

export class Debris {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private bits: Bit[][] = [[], [], []];
  private readonly max = 220;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();

  constructor() {
    const geos = [
      new THREE.IcosahedronGeometry(1, 0),
      (() => {
        const g = new THREE.CylinderGeometry(1, 1, 0.18, 7);
        return g;
      })(),
      new THREE.SphereGeometry(1, 8, 6),
    ];
    const mats = [
      new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }),
      new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true, opacity: 0.85 }),
    ];
    for (let k = 0; k < 3; k++) {
      const im = new THREE.InstancedMesh(geos[k], mats[k], this.max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      im.userData.noPick = true;
      this.meshes.push(im);
      this.group.add(im);
    }
  }

  spawn(s: DebrisSpec) {
    const kind = s.kind ?? 0;
    const list = this.bits[kind];
    if (list.length >= this.max) list.shift();
    const sz = s.size;
    list.push({
      pos: s.pos.clone(),
      vel: s.vel.clone(),
      rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      spin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
      scale: kind === 1 ? new THREE.Vector3(sz, sz, sz * 0.9) : new THREE.Vector3(sz * (0.8 + Math.random() * 0.4), sz * (0.7 + Math.random() * 0.4), sz),
      floor: s.floor,
      age: 0,
      life: s.life ?? 2.2 + Math.random(),
      color: typeof s.color === 'string' ? new THREE.Color(s.color) : s.color.clone(),
      kind,
      resting: false,
    });
  }

  update(dt: number) {
    for (let k = 0; k < 3; k++) {
      const list = this.bits[k];
      const im = this.meshes[k];
      let n = 0;
      const keep: Bit[] = [];
      for (const b of list) {
        b.age += dt;
        if (b.age > b.life) continue;
        if (!b.resting) {
          b.vel.y -= 9.8 * dt;
          b.pos.addScaledVector(b.vel, dt);
          b.rot.x += b.spin.x * dt;
          b.rot.y += b.spin.y * dt;
          b.rot.z += b.spin.z * dt;
          const r = b.scale.y * 0.5;
          if (b.pos.y < b.floor + r) {
            b.pos.y = b.floor + r;
            if (b.kind === 2) {
              // droplets splat flat
              b.resting = true;
              b.scale.set(b.scale.x * 1.6, b.scale.y * 0.25, b.scale.z * 1.6);
            } else if (Math.abs(b.vel.y) < 0.35) {
              b.resting = true;
              if (b.kind === 1) b.rot.set(0, b.rot.y, 0);
            } else {
              b.vel.y *= -0.35;
              b.vel.x *= 0.6;
              b.vel.z *= 0.6;
              b.spin.multiplyScalar(0.5);
            }
          }
        }
        const fade = Math.min(1, (b.life - b.age) / 0.5);
        this.q.setFromEuler(b.rot);
        const s = b.scale.clone().multiplyScalar(fade);
        this.m4.compose(b.pos, this.q, s);
        im.setMatrixAt(n, this.m4);
        im.setColorAt(n, b.color);
        n++;
        keep.push(b);
      }
      this.bits[k] = keep;
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.bits = [[], [], []];
    for (const m of this.meshes) m.count = 0;
  }
}
