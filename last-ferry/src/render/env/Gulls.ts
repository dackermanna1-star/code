// Herring gulls perched on railings, lamps, the crane and the bait shop roof.
// Gunfire scares them (scare(x, z, strength)): they flap up and away over the
// sea, circle out of view, and drift back to their perches 8–20 s later,
// gliding in and landing with a flurry. A few always wheel high over the water.
// Three instanced draw calls (body, left wing, right wing).
import * as THREE from 'three';
import { mulberry32 } from './noise';
import type { Perch } from './Pier';

type GullState = 'perched' | 'flee' | 'away' | 'return' | 'circle';

interface Gull {
  perch: Perch;
  state: GullState;
  t: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  bank: number;
  flap: number;
  /** Seconds away before returning. */
  away: number;
  seed: number;
  /** Idle animation: head-turn / hop timers. */
  idle: number;
  wings: number;
  scale: number;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Gulls {
  readonly group = new THREE.Group();
  private gulls: Gull[] = [];
  private body: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private rnd = mulberry32(4401);

  constructor(count: number, perches: Perch[]) {
    this.group.name = 'Gulls';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const body = this.bodyGeometry();
    const wing = (side: number) => this.wingGeometry(side);
    const total = count + 3;
    this.body = new THREE.InstancedMesh(body, mat, total);
    this.wingL = new THREE.InstancedMesh(wing(-1), mat, total);
    this.wingR = new THREE.InstancedMesh(wing(1), mat, total);
    for (const m of [this.body, this.wingL, this.wingR]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    // Pick spread-out perches (prefer high ones).
    const pool = perches.slice().sort((a, b) => b.y - a.y + (this.rnd() - 0.5) * 3);
    const chosen: Perch[] = [];
    for (const p of pool) {
      if (chosen.length >= count) break;
      if (chosen.some((c) => Math.abs(c.x - p.x) < 1.2 && Math.abs(c.z - p.z) < 1.2)) continue;
      chosen.push(p);
    }
    for (const p of chosen) {
      this.gulls.push(this.make(p, 'perched'));
    }
    // A few wheeling over the water all the time.
    for (let i = 0; i < 3; i++) {
      const g = this.make({ x: 0, y: 12, z: -14, yaw: 0 }, 'circle');
      g.t = this.rnd() * 30;
      this.gulls.push(g);
    }
  }

  private make(perch: Perch, state: GullState): Gull {
    return {
      perch,
      state,
      t: 0,
      pos: new THREE.Vector3(perch.x, perch.y, perch.z),
      vel: new THREE.Vector3(),
      yaw: perch.yaw,
      bank: 0,
      flap: this.rnd() * 10,
      away: 0,
      seed: this.rnd(),
      idle: this.rnd() * 5,
      wings: 0,
      scale: 0.9 + this.rnd() * 0.25,
    };
  }

  private bodyGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, color: number, m: THREE.Matrix4) => {
      g = g.index ? g.toNonIndexed() : g;
      g.applyMatrix4(m);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const c = new THREE.Color(color);
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(g);
    };
    // Facing +x. Body, head, beak (yellow with a red spot), tail, legs.
    add(new THREE.SphereGeometry(0.12, 10, 7), 0xf2f2ee, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.17, 0), new THREE.Quaternion(), new THREE.Vector3(1.75, 0.95, 0.95)));
    add(new THREE.SphereGeometry(0.075, 8, 6), 0xf6f6f2, new THREE.Matrix4().makeTranslation(0.2, 0.27, 0));
    add(new THREE.ConeGeometry(0.022, 0.1, 5).rotateZ(-Math.PI / 2), 0xe8c030, new THREE.Matrix4().makeTranslation(0.3, 0.26, 0));
    add(new THREE.SphereGeometry(0.012, 4, 3), 0xc0302a, new THREE.Matrix4().makeTranslation(0.31, 0.245, 0));
    add(new THREE.BoxGeometry(0.14, 0.02, 0.09), 0x2a2a2a, new THREE.Matrix4().makeTranslation(-0.24, 0.19, 0));
    // Folded wings on the back (grey) – visible when perched.
    add(new THREE.BoxGeometry(0.3, 0.05, 0.2), 0x9aa2ac, new THREE.Matrix4().compose(new THREE.Vector3(-0.04, 0.22, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.12)), new THREE.Vector3(1, 1, 1)));
    add(new THREE.BoxGeometry(0.12, 0.04, 0.16), 0x1a1a1a, new THREE.Matrix4().makeTranslation(-0.2, 0.21, 0));
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), 0xd08a6a, new THREE.Matrix4().makeTranslation(0.02, 0.04, 0.04));
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), 0xd08a6a, new THREE.Matrix4().makeTranslation(0.02, 0.04, -0.04));
    return mergeSimple(parts);
  }

  private wingGeometry(side: number): THREE.BufferGeometry {
    // A flat tapered wing from the shoulder (origin) out along ±z, grey with a black tip.
    const g = new THREE.BufferGeometry();
    const span = 0.55;
    const pos = [
      // inner panel
      0.08, 0, 0, -0.1, 0, 0, -0.08, 0, side * span * 0.6, 0.05, 0, side * span * 0.6,
      // tip panel
      0.05, 0, side * span * 0.6, -0.08, 0, side * span * 0.6, -0.12, 0, side * span, 0.0, 0, side * span,
    ];
    const idx = side > 0 ? [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6] : [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
    const col: number[] = [];
    const grey = new THREE.Color(0x9aa2ac);
    const black = new THREE.Color(0x161616);
    for (let i = 0; i < 8; i++) {
      const c = i >= 6 ? black : grey;
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Double-sided look: duplicate flipped.
    const back = g.clone();
    const bi = back.index!.array as Uint16Array | Uint32Array;
    const flipped: number[] = [];
    for (let i = 0; i < bi.length; i += 3) flipped.push(bi[i], bi[i + 2], bi[i + 1]);
    back.setIndex(flipped);
    back.computeVertexNormals();
    return mergeSimple([g.toNonIndexed(), back.toNonIndexed()]);
  }

  /** Gulls within ~6·strength m of (x, z) take off. */
  scare(x: number, z: number, strength = 1): void {
    const r = 5 + 5 * strength;
    for (const g of this.gulls) {
      if (g.state !== 'perched' && g.state !== 'return') continue;
      const d = Math.hypot(g.pos.x - x, g.pos.z - z);
      if (d > r) continue;
      g.state = 'flee';
      g.t = -this.rnd() * 0.25 * (d / r);
      g.away = 8 + this.rnd() * 12;
      const away = _v.set(g.pos.x - x, 0, g.pos.z - z);
      if (away.lengthSq() < 0.01) away.set(this.rnd() - 0.5, 0, -1);
      away.normalize();
      g.vel.set(away.x * 3 + (this.rnd() - 0.5) * 2, 4.5 + this.rnd() * 2, Math.min(-1.5, away.z * 3) - 2);
    }
  }

  update(dt: number, time: number): void {
    const n = this.gulls.length;
    for (let i = 0; i < n; i++) {
      const g = this.gulls[i];
      g.t += dt;
      switch (g.state) {
        case 'perched': {
          g.pos.set(g.perch.x, g.perch.y, g.perch.z);
          g.wings = Math.max(0, g.wings - dt * 4);
          g.idle -= dt;
          if (g.idle <= 0) {
            g.idle = 1.5 + this.rnd() * 4;
            g.yaw = g.perch.yaw + (this.rnd() - 0.5) * 2.5;
            if (this.rnd() < 0.15) g.wings = 1; // a stretch
          }
          g.bank = 0;
          break;
        }
        case 'flee': {
          if (g.t < 0) break;
          g.vel.y += dt * 1.5;
          g.vel.multiplyScalar(Math.exp(-dt * 0.3));
          g.pos.addScaledVector(g.vel, dt);
          g.yaw = Math.atan2(-g.vel.z, g.vel.x);
          g.flap += dt * 16;
          g.wings = 1;
          if (g.t > 3.5) {
            g.state = 'away';
            g.t = 0;
          }
          break;
        }
        case 'away': {
          // Out of view (high and far); wait.
          g.pos.set(g.perch.x + 20, 30, -40);
          if (g.t > g.away) {
            g.state = 'return';
            g.t = 0;
            g.pos.set(g.perch.x + (this.rnd() - 0.5) * 20, g.perch.y + 14 + this.rnd() * 4, g.perch.z - 22);
          }
          break;
        }
        case 'return': {
          const target = _v.set(g.perch.x, g.perch.y, g.perch.z);
          const d = target.clone().sub(g.pos);
          const dist = d.length();
          const speed = Math.min(7, 1.2 + dist * 0.7);
          const desired = d.normalize().multiplyScalar(speed);
          g.vel.lerp(desired, Math.min(1, dt * 2.2));
          g.pos.addScaledVector(g.vel, dt);
          g.yaw = Math.atan2(-g.vel.z, g.vel.x);
          // Glide, then flap hard to land.
          g.flap += dt * (dist < 2.5 ? 18 : 3);
          g.wings = 1;
          g.bank = Math.sin(g.t * 1.3 + g.seed * 6) * 0.25 * Math.min(1, dist / 5);
          if (dist < 0.08) {
            g.state = 'perched';
            g.wings = 1;
            g.idle = 0.6;
          }
          break;
        }
        case 'circle': {
          const a = time * (0.18 + g.seed * 0.1) + g.seed * 20;
          const R = 9 + g.seed * 8;
          const cx = -4 + g.seed * 18;
          g.pos.set(cx + Math.cos(a) * R, 10 + g.seed * 6 + Math.sin(a * 2.3) * 0.8, -16 + Math.sin(a) * R * 0.45);
          g.yaw = Math.atan2(Math.cos(a) * 0.45, -Math.sin(a)) ;
          g.bank = -0.35;
          g.flap += dt * (Math.sin(time * 0.5 + g.seed * 9) > 0.6 ? 12 : 0.5);
          g.wings = 1;
          break;
        }
      }
      // Compose instance transforms.
      const s = g.scale;
      _q.setFromEuler(_e.set(g.bank, g.yaw, g.state === 'perched' ? 0 : -0.15 * Math.sign(g.vel.y || 1), 'YXZ'));
      _m.compose(g.pos, _q, _s.set(s, s, s));
      this.body.setMatrixAt(i, _m);
      // Wings: folded (hidden into the body) when perched, flapping in flight.
      const flying = g.wings;
      const flapA = Math.sin(g.flap) * 0.7 * flying;
      for (const [mesh, side] of [
        [this.wingL, -1],
        [this.wingR, 1],
      ] as Array<[THREE.InstancedMesh, number]>) {
        _m2.copy(_m)
          .multiply(new THREE.Matrix4().makeTranslation(0, 0.22, side * 0.06))
          .multiply(new THREE.Matrix4().makeRotationX(side * (flapA + 0.1)))
          .multiply(new THREE.Matrix4().makeScale(1, 1, Math.max(0.001, flying)));
        mesh.setMatrixAt(i, _m2);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
  }
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    if (!p.attributes.normal) p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
