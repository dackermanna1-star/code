import * as THREE from 'three';
import type { Game } from '../game';
import { SPLAT } from '../world/bloodAtlas';
import { HALF_D, HALF_W } from '../world/arena';
import { rand } from '../core/math';

const PVERT = /* glsl */ `
attribute vec4 iPos;   // xyz, size
attribute vec4 iVel;   // xyz velocity, stretch factor
attribute vec4 iColor; // rgb, alpha
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = iColor;
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  vec3 vv = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xyz;
  float sp = length(vv.xy);
  vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float stretch = 1.0 + sp * iVel.w;
  vec2 q = (position.x * dir * stretch + position.y * perp) * iPos.w;
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
}
`;
const PFRAG_SOFT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a * a);
}
`;
const PFRAG_DROP = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float shade = 0.65 + 0.35 * (1.0 - d) + max(0.0, -c.y) * 0.4;
  gl_FragColor = vec4(vColor.rgb * shade, 1.0);
}
`;

type Kind = 'drop' | 'soft' | 'add';

class ParticlePool {
  max: number;
  count = 0;
  pos: Float32Array; // x,y,z,size
  vel: Float32Array; // vx,vy,vz,stretch
  col: Float32Array; // r,g,b,a
  life: Float32Array; // remaining, total
  grow: Float32Array; // size growth per sec
  drag: Float32Array;
  grav: Float32Array;
  fade: Uint8Array;
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  aPos: THREE.InstancedBufferAttribute;
  aVel: THREE.InstancedBufferAttribute;
  aCol: THREE.InstancedBufferAttribute;

  constructor(max: number, kind: Kind) {
    this.max = max;
    this.pos = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 4);
    this.col = new Float32Array(max * 4);
    this.life = new Float32Array(max * 2);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.fade = new Uint8Array(max);
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iVel', this.aVel);
    g.setAttribute('iColor', this.aCol);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: PVERT,
      fragmentShader: kind === 'drop' ? PFRAG_DROP : PFRAG_SOFT,
      transparent: kind !== 'drop',
      depthWrite: kind === 'drop',
      blending: kind === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'drop' ? 0 : kind === 'soft' ? 5 : 6;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, r: number, gc: number, b: number, a: number, life: number, opts: { grow?: number; drag?: number; grav?: number; stretch?: number; fade?: boolean } = {}) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.pos.set([x, y, z, size], i * 4);
    this.vel.set([vx, vy, vz, opts.stretch ?? 0], i * 4);
    this.col.set([r, gc, b, a], i * 4);
    this.life[i * 2] = life;
    this.life[i * 2 + 1] = life;
    this.grow[i] = opts.grow ?? 0;
    this.drag[i] = opts.drag ?? 0;
    this.grav[i] = opts.grav ?? 0;
    this.fade[i] = opts.fade === false ? 0 : 1;
    return i;
  }

  kill(i: number) {
    const last = --this.count;
    if (i !== last) {
      this.pos.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.vel.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.col.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.life.copyWithin(i * 2, last * 2, last * 2 + 2);
      this.grow[i] = this.grow[last];
      this.drag[i] = this.drag[last];
      this.grav[i] = this.grav[last];
      this.fade[i] = this.fade[last];
    }
  }

  upload() {
    const n = this.count;
    (this.aPos.array as Float32Array).set(this.pos.subarray(0, n * 4));
    (this.aVel.array as Float32Array).set(this.vel.subarray(0, n * 4));
    const ca = this.aCol.array as Float32Array;
    for (let i = 0; i < n; i++) {
      ca[i * 4] = this.col[i * 4];
      ca[i * 4 + 1] = this.col[i * 4 + 1];
      ca[i * 4 + 2] = this.col[i * 4 + 2];
      const lf = this.fade[i] ? Math.max(0, this.life[i * 2] / this.life[i * 2 + 1]) : 1;
      ca[i * 4 + 3] = this.col[i * 4 + 3] * lf;
    }
    for (const a of [this.aPos, this.aVel, this.aCol]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
    this.geo.instanceCount = n;
  }
}

/** Persistent debris (wood splinters, teeth...) as a growing set of instanced meshes. */
class Debris {
  meshes: THREE.InstancedMesh[] = [];
  active: { mesh: THREE.InstancedMesh; i: number; p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; t: number }[] = [];
  private cur: THREE.InstancedMesh | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  constructor(public scene: THREE.Scene, public geo: THREE.BufferGeometry, public mat: THREE.Material, public perMesh = 2000) {}
  spawn(p: THREE.Vector3, v: THREE.Vector3, scale: number, color: THREE.Color) {
    if (!this.cur || this.cur.count >= this.perMesh) {
      this.cur = new THREE.InstancedMesh(this.geo, this.mat, this.perMesh);
      this.cur.count = 0;
      this.cur.castShadow = false;
      this.cur.receiveShadow = true;
      this.cur.frustumCulled = false;
      this.scene.add(this.cur);
      this.meshes.push(this.cur);
    }
    const i = this.cur.count++;
    const r = new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6));
    this.m.compose(p, this.q.setFromEuler(r), new THREE.Vector3(scale, scale, scale));
    this.cur.setMatrixAt(i, this.m);
    this.cur.setColorAt(i, color);
    this.cur.instanceMatrix.needsUpdate = true;
    if (this.cur.instanceColor) this.cur.instanceColor.needsUpdate = true;
    this.active.push({ mesh: this.cur, i, p: p.clone(), v: v.clone(), r, w: new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15)), t: 0 });
  }
  update(dt: number) {
    for (let k = this.active.length - 1; k >= 0; k--) {
      const d = this.active[k];
      d.t += dt;
      d.v.y -= 12 * dt;
      d.p.addScaledVector(d.v, dt);
      d.r.x += d.w.x * dt;
      d.r.y += d.w.y * dt;
      d.r.z += d.w.z * dt;
      if (d.p.y < 0.015) {
        d.p.y = 0.015;
        d.v.y *= -0.3;
        d.v.x *= 0.5;
        d.v.z *= 0.5;
        d.w.multiplyScalar(0.4);
      }
      d.p.x = Math.max(-HALF_W + 0.05, Math.min(HALF_W - 0.05, d.p.x));
      d.p.z = Math.max(-HALF_D + 0.05, Math.min(HALF_D - 0.05, d.p.z));
      const s = new THREE.Vector3();
      d.mesh.getMatrixAt(d.i, this.m);
      this.m.decompose(new THREE.Vector3(), this.q, s);
      // settled: lie flat-ish and stop simulating (stays forever)
      const done = d.t > 2.5 || (d.p.y <= 0.02 && d.v.lengthSq() < 0.05);
      if (done) {
        d.r.x = Math.round(d.r.x / Math.PI) * Math.PI;
        d.r.z = Math.round(d.r.z / Math.PI) * Math.PI;
      }
      this.m.compose(d.p, this.q.setFromEuler(d.r), s);
      d.mesh.setMatrixAt(d.i, this.m);
      d.mesh.instanceMatrix.needsUpdate = true;
      if (done) this.active.splice(k, 1);
    }
  }
  get total() {
    return this.meshes.reduce((a, m) => a + m.count, 0);
  }
}

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class FX {
  drops: ParticlePool;
  soft: ParticlePool;
  add: ParticlePool;
  wood: Debris;
  bone: Debris;
  dropRadius: Float32Array;
  dropsLanded = 0;

  constructor(public game: Game, maxParticles: number) {
    this.drops = new ParticlePool(maxParticles, 'drop');
    this.soft = new ParticlePool(Math.floor(maxParticles * 0.5), 'soft');
    this.add = new ParticlePool(Math.floor(maxParticles * 0.4), 'add');
    this.dropRadius = new Float32Array(maxParticles);
    game.scene.add(this.drops.mesh, this.soft.mesh, this.add.mesh);
    const splinter = new THREE.BoxGeometry(0.16, 0.025, 0.04);
    this.wood = new Debris(game.scene, splinter, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    const chip = new THREE.BoxGeometry(0.012, 0.014, 0.01);
    this.bone = new Debris(game.scene, chip, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 1000);
  }

  /** Arterial/impact blood spray. dir = main direction (world, normalized). */
  bloodSpray(p: THREE.Vector3, dir: THREE.Vector3, amount: number, speed = 3.5, spread = 0.6) {
    const n = Math.round(8 + amount * 46);
    for (let i = 0; i < n; i++) {
      const s = speed * rand(0.35, 1.15);
      const vx = dir.x * s + rand(-1, 1) * spread * s;
      const vy = dir.y * s + rand(-0.2, 1) * spread * s + rand(0.3, 1.6);
      const vz = dir.z * s + rand(-1, 1) * spread * s;
      const big = Math.random() < 0.12;
      const size = (big ? rand(0.018, 0.03) : rand(0.004, 0.013)) * (0.7 + amount * 0.45);
      const shade = rand(0.16, 0.26);
      const idx = this.drops.spawn(p.x + rand(-0.03, 0.03), p.y + rand(-0.03, 0.03), p.z + rand(-0.03, 0.03), vx, vy, vz, size, shade, 0.012, 0.01, 1, 3, { grav: 11, drag: 0.15, stretch: 0.045, fade: false });
      if (idx >= 0) this.dropRadius[idx] = size;
    }
    // mist
    const m = Math.round(2 + amount * 5);
    for (let i = 0; i < m; i++) {
      this.soft.spawn(p.x, p.y, p.z, dir.x * rand(0.3, 1.2) + rand(-0.3, 0.3), dir.y + rand(0, 0.5), dir.z * rand(0.3, 1.2) + rand(-0.3, 0.3), rand(0.06, 0.16) * (0.6 + amount), 0.2, 0.01, 0.01, 0.45, rand(0.3, 0.6), { grow: 0.45, drag: 2.5, grav: 0.4 });
    }
  }
  /** A few slow drips (bleeding wounds, trails). */
  bloodDrip(p: THREE.Vector3, n = 1) {
    for (let i = 0; i < n; i++) {
      const size = rand(0.006, 0.014);
      const idx = this.drops.spawn(p.x + rand(-0.04, 0.04), p.y, p.z + rand(-0.04, 0.04), rand(-0.15, 0.15), rand(-0.2, 0.1), rand(-0.15, 0.15), size, 0.2, 0.008, 0.008, 1, 3, { grav: 9.8, stretch: 0.06, fade: false });
      if (idx >= 0) this.dropRadius[idx] = size;
    }
  }
  /** Saliva/sweat spray on heavy face hits. */
  spit(p: THREE.Vector3, dir: THREE.Vector3, n = 8) {
    for (let i = 0; i < n; i++) {
      const s = rand(1.5, 4);
      this.soft.spawn(p.x, p.y, p.z, dir.x * s + rand(-0.6, 0.6), dir.y * s + rand(0, 1.2), dir.z * s + rand(-0.6, 0.6), rand(0.01, 0.025), 0.9, 0.9, 0.85, 0.7, rand(0.25, 0.5), { grav: 9, stretch: 0.05 });
    }
  }
  impactFlash(p: THREE.Vector3, strength = 1, color = [1, 0.9, 0.75]) {
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.08 + strength * 0.14, color[0] * 1.8, color[1] * 1.8, color[2] * 1.8, 0.75, 0.06 + strength * 0.03, { grow: 1.6 * strength });
    // shock ring particles
    for (let i = 0; i < 6 + strength * 6; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(1.5, 4) * strength;
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * s, rand(-0.5, 1.5), Math.sin(a) * s, rand(0.015, 0.03), 1.6, 1.3, 1.0, 0.8, rand(0.08, 0.18), { stretch: 0.03, drag: 4 });
    }
  }
  sparks(p: THREE.Vector3, dir: THREE.Vector3, n = 18) {
    for (let i = 0; i < n; i++) {
      const s = rand(2, 7);
      this.add.spawn(p.x, p.y, p.z, dir.x * s + rand(-2, 2), dir.y * s + rand(-1, 3), dir.z * s + rand(-2, 2), rand(0.012, 0.022), 3.0, 2.0, 0.7, 1, rand(0.2, 0.5), { grav: 9.8, stretch: 0.03, drag: 0.6 });
    }
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.3, 3, 2.2, 1.2, 0.8, 0.07, { grow: 3 });
  }
  dust(p: THREE.Vector3, amount = 1) {
    const n = Math.round(4 + amount * 8);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.4, 1.4) * amount;
      this.soft.spawn(p.x + Math.cos(a) * 0.1, 0.05 + rand(0, 0.1), p.z + Math.sin(a) * 0.1, Math.cos(a) * s, rand(0.05, 0.4), Math.sin(a) * s, rand(0.15, 0.32) * (0.6 + amount * 0.5), 0.42, 0.4, 0.37, 0.32, rand(0.7, 1.4), { grow: 0.6, drag: 2.2 });
    }
  }
  woodBurst(p: THREE.Vector3, n = 24) {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setHSL(0.08 + rand(-0.01, 0.02), 0.45, rand(0.22, 0.38));
      this.wood.spawn(p.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(0, 0.6), rand(-0.3, 0.3))), new THREE.Vector3(rand(-3, 3), rand(1, 5), rand(-3, 3)), rand(0.5, 1.6), c);
    }
    this.dust(p, 1.5);
  }
  teeth(p: THREE.Vector3, dir: THREE.Vector3, n = 2) {
    const c = new THREE.Color(0.92, 0.9, 0.82);
    for (let i = 0; i < n; i++) this.bone.spawn(p.clone(), dir.clone().multiplyScalar(rand(1.5, 3)).add(new THREE.Vector3(rand(-0.5, 0.5), rand(1, 2.5), rand(-0.5, 0.5))), 1, c);
  }

  update(dt: number) {
    const g = this.game;
    // ---- blood droplets with collision -> permanent splats
    const P = this.drops;
    const obstacles = g.arena.obstacles;
    for (let i = P.count - 1; i >= 0; i--) {
      const o = i * 4;
      let vx = P.vel[o], vy = P.vel[o + 1], vz = P.vel[o + 2];
      vy -= P.grav[i] * dt;
      const dr = 1 - P.drag[i] * dt;
      vx *= dr; vy *= dr; vz *= dr;
      const x = P.pos[o] + vx * dt, y = P.pos[o + 1] + vy * dt, z = P.pos[o + 2] + vz * dt;
      P.vel[o] = vx; P.vel[o + 1] = vy; P.vel[o + 2] = vz;
      P.life[i * 2] -= dt;
      const rad = this.dropRadius[i];
      let landed = false;
      if (y <= 0.005) {
        const sp = Math.hypot(vx, vz);
        _v.set(x, 0.01, z);
        const hdir = sp > 0.05 ? new THREE.Vector3(vx / sp, 0, vz / sp) : null;
        const r = rad * (1.5 + Math.min(4, Math.hypot(vx, vy, vz)) * 0.4);
        g.blood.splat(_v, r, r > 0.03 && Math.random() < 0.5 ? SPLAT.splash : SPLAT.drop, rand(0.75, 1), UP, hdir, hdir ? Math.min(2.6, sp * 0.4) : 0);
        landed = true;
      } else if (Math.abs(x) > HALF_W - 0.02 || Math.abs(z) > HALF_D - 0.02) {
        // wall hit
        const n = Math.abs(x) > HALF_W - 0.02 ? new THREE.Vector3(-Math.sign(x), 0, 0) : new THREE.Vector3(0, 0, -Math.sign(z));
        _v.set(Math.max(-HALF_W + 0.01, Math.min(HALF_W - 0.01, x)), y, Math.max(-HALF_D + 0.01, Math.min(HALF_D - 0.01, z)));
        const r = rad * (1.8 + Math.hypot(vx, vy, vz) * 0.3);
        g.blood.splat(_v, r, SPLAT.drop, 1, n, new THREE.Vector3(vx, vy, vz).normalize(), 0.6);
        if (Math.random() < 0.18) g.blood.splat(_v, r * 0.9, SPLAT.drip, 0.9, n, null, Math.random() * 3);
        landed = true;
      } else {
        for (const ob of obstacles) {
          if (ob.kind === 'wall') continue;
          if (x > ob.minX && x < ob.maxX && z > ob.minZ && z < ob.maxZ && y < ob.h) {
            // which face?
            const dx0 = x - ob.minX, dx1 = ob.maxX - x, dz0 = z - ob.minZ, dz1 = ob.maxZ - z, dy = ob.h - y;
            const m = Math.min(dx0, dx1, dz0, dz1, dy);
            const n = m === dx0 ? new THREE.Vector3(-1, 0, 0) : m === dx1 ? new THREE.Vector3(1, 0, 0) : m === dz0 ? new THREE.Vector3(0, 0, -1) : m === dz1 ? new THREE.Vector3(0, 0, 1) : UP;
            _v.set(x, y, z).addScaledVector(n, m + 0.01);
            g.blood.splat(_v, rad * 2.2, SPLAT.drop, 1, n, new THREE.Vector3(vx, vy, vz).normalize(), 0.5);
            if (n !== UP && Math.random() < 0.15) g.blood.splat(_v, rad * 2.0, SPLAT.drip, 0.9, n, null, Math.random() * 2);
            landed = true;
            break;
          }
        }
      }
      if (landed || P.life[i * 2] <= 0) {
        if (landed) this.dropsLanded++;
        this.dropRadius[i] = this.dropRadius[P.count - 1];
        P.kill(i);
        continue;
      }
      P.pos[o] = x; P.pos[o + 1] = y; P.pos[o + 2] = z;
    }
    // ---- soft & additive
    for (const pool of [this.soft, this.add]) {
      for (let i = pool.count - 1; i >= 0; i--) {
        const o = i * 4;
        pool.life[i * 2] -= dt;
        if (pool.life[i * 2] <= 0) {
          pool.kill(i);
          continue;
        }
        const dr = Math.max(0, 1 - pool.drag[i] * dt);
        pool.vel[o] *= dr;
        pool.vel[o + 1] = pool.vel[o + 1] * dr - pool.grav[i] * dt;
        pool.vel[o + 2] *= dr;
        pool.pos[o] += pool.vel[o] * dt;
        pool.pos[o + 1] = Math.max(0.01, pool.pos[o + 1] + pool.vel[o + 1] * dt);
        pool.pos[o + 2] += pool.vel[o + 2] * dt;
        pool.pos[o + 3] += pool.grow[i] * dt;
      }
    }
    this.wood.update(dt);
    this.bone.update(dt);
    this.drops.upload();
    this.soft.upload();
    this.add.upload();
  }

  get liveParticles() {
    return this.drops.count + this.soft.count + this.add.count;
  }
}
