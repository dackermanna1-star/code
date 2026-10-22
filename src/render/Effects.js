// Battlefield effects: turns simulation events into particles, debris,
// scorch decals, light flashes and camera shake, and runs continuous
// emitters (fires, smoke screens, dust trails, rotor wash, missile trails).

import * as THREE from 'three';
import { ParticlePool, particle } from './ParticleSystem.js';
import { FRAME } from './textures.js';
import { MAT } from '../world/terrain.js';
import { buildPropModel } from './models/index.js';

const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();

// Ground spray colours by surface material (sRGB-ish, used directly as tints).
const DIRT_COLORS = {
  [MAT.GRASS]: [0.36, 0.31, 0.22],
  [MAT.DRYGRASS]: [0.45, 0.4, 0.28],
  [MAT.DIRT]: [0.42, 0.34, 0.24],
  [MAT.ROCK]: [0.45, 0.43, 0.4],
  [MAT.SAND]: [0.62, 0.55, 0.4],
  [MAT.ROAD]: [0.32, 0.31, 0.3],
  [MAT.FIELD]: [0.45, 0.37, 0.24],
  [MAT.CONCRETE]: [0.55, 0.54, 0.51],
  [MAT.MUD]: [0.3, 0.24, 0.17],
  [MAT.FOREST]: [0.3, 0.27, 0.19],
  [MAT.DRYGRASS]: [0.45, 0.4, 0.28],
};

const SIZE_K = { small: 1, medium: 1.7, large: 2.8, huge: 5 };

// --------------------------------------------------------------- lights

class LightPool {
  constructor(scene, n = 6) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 50, 2);
      l.userData = { t: 0, dur: 1, peak: 0, flicker: false };
      scene.add(l);
      this.lights.push(l);
    }
  }

  flash(x, y, z, color, intensity, range, dur, cam) {
    // Prefer the dimmest light; ignore flashes much weaker than current ones far away.
    let best = this.lights[0];
    let bs = Infinity;
    for (const l of this.lights) {
      const left = l.userData.peak * Math.max(0, 1 - l.userData.t / l.userData.dur);
      if (left < bs) {
        bs = left;
        best = l;
      }
    }
    const d = cam ? cam.distanceTo(new THREE.Vector3(x, y, z)) : 0;
    if (bs > intensity * 0.5 && d > range * 3) return;
    best.position.set(x, y, z);
    best.color.setHex(color);
    best.distance = range;
    best.userData.t = 0;
    best.userData.dur = dur;
    best.userData.peak = intensity;
    best.intensity = intensity;
  }

  update(dt) {
    for (const l of this.lights) {
      const u = l.userData;
      if (u.peak <= 0) continue;
      u.t += dt;
      const k = Math.max(0, 1 - u.t / u.dur);
      l.intensity = u.peak * k * k;
      if (k <= 0) u.peak = 0;
    }
  }
}

// --------------------------------------------------------------- debris

class DebrisSystem {
  constructor(scene, terrain, max = 1400) {
    this.terrain = terrain;
    this.max = max;
    const kinds = [];
    const tryProp = (k, fallback) => {
      try {
        return buildPropModel(k, 0).lod0;
      } catch (e) {
        return fallback;
      }
    };
    const clod = new THREE.DodecahedronGeometry(0.35, 0);
    kinds.push({ geo: clod, color: 0x4a3e2e, vertexColors: false });
    kinds.push({ geo: tryProp('debris_concrete', new THREE.BoxGeometry(0.6, 0.35, 0.45)), color: 0xffffff, vertexColors: true });
    kinds.push({ geo: tryProp('debris_metal', new THREE.BoxGeometry(0.8, 0.06, 0.5)), color: 0xffffff, vertexColors: true });
    this.meshes = kinds.map((k) => {
      const m = new THREE.InstancedMesh(k.geo, new THREE.MeshStandardMaterial({ color: k.color, vertexColors: k.vertexColors && !!k.geo.getAttribute('color'), roughness: 0.95 }), max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      scene.add(m);
      return m;
    });
    this.items = [];
    this.obj = new THREE.Object3D();
  }

  spawn(kind, x, y, z, vx, vy, vz, scale, life) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      kind,
      p: new THREE.Vector3(x, y, z),
      v: new THREE.Vector3(vx, vy, vz),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)),
      axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      spin: rr(3, 14),
      s: scale,
      t: 0,
      life,
      rest: false,
    });
  }

  update(dt) {
    const counts = [0, 0, 0];
    const o = this.obj;
    const dq = new THREE.Quaternion();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.t += dt;
      if (d.t > d.life) {
        this.items.splice(i, 1);
        continue;
      }
      if (!d.rest) {
        d.v.y -= 9.81 * dt;
        d.p.addScaledVector(d.v, dt);
        dq.setFromAxisAngle(d.axis, d.spin * dt);
        d.q.premultiply(dq);
        const g = this.terrain.heightAt(d.p.x, d.p.z);
        if (d.p.y < g + 0.1 * d.s) {
          d.p.y = g + 0.1 * d.s;
          if (Math.abs(d.v.y) < 2.5) {
            d.rest = true;
          } else {
            d.v.y *= -0.3;
            d.v.x *= 0.5;
            d.v.z *= 0.5;
            d.spin *= 0.5;
          }
        }
      }
      const shrink = d.t > d.life - 2 ? Math.max(0.01, (d.life - d.t) / 2) : 1;
      o.position.copy(d.p);
      o.quaternion.copy(d.q);
      o.scale.setScalar(d.s * shrink);
      o.updateMatrix();
      const m = this.meshes[d.kind];
      m.setMatrixAt(counts[d.kind]++, o.matrix);
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      if (counts[k]) m.instanceMatrix.needsUpdate = true;
    });
  }
}

// --------------------------------------------------------------- decals

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(10,9,8,0.95)');
  g.addColorStop(0.45, 'rgba(18,15,12,0.8)');
  g.addColorStop(0.8, 'rgba(30,26,20,0.3)');
  g.addColorStop(1, 'rgba(30,26,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Ragged rays.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const l = rr(30, 60);
    ctx.strokeStyle = `rgba(15,12,10,${rr(0.2, 0.5)})`;
    ctx.lineWidth = rr(2, 6);
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class DecalSystem {
  constructor(scene, terrain, max = 500) {
    this.terrain = terrain;
    this.max = max;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.next = 0;
    this.obj = new THREE.Object3D();
    this.n = new THREE.Vector3();
  }

  add(x, z, size) {
    const t = this.terrain;
    const y = t.heightAt(x, z) + 0.06;
    t.normalAt(x, z, this.n);
    const o = this.obj;
    o.position.set(x, y, z);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.n);
    o.rotateY(rand() * Math.PI * 2);
    o.scale.set(size, 1, size);
    o.updateMatrix();
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.mesh.setMatrixAt(i, o.matrix);
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// --------------------------------------------------------------- effects

export class Effects {
  constructor(scene, terrain, atlas, quality) {
    this.scene = scene;
    this.terrain = terrain;
    const q = quality.particles ?? 1;
    this.q = q;
    this.smoke = new ParticlePool(Math.round(26000 * q), atlas, false, 11);
    this.fx = new ParticlePool(Math.round(22000 * q), atlas, false, 12);
    this.add = new ParticlePool(Math.round(26000 * q), atlas, true, 13);
    scene.add(this.smoke.mesh, this.fx.mesh, this.add.mesh);
    this.P = particle();
    this.lights = new LightPool(scene, quality.lights ?? 6);
    this.debris = new DebrisSystem(scene, terrain, Math.round(1400 * q));
    this.decals = new DecalSystem(scene, terrain);
    this.shake = 0;
    this.cam = new THREE.Vector3();
    this.camFwd = new THREE.Vector3();
    this.time = 0;
    this.cloudT = new WeakMap();
    this.windX = 0;
    this.windZ = 0;
    this.night = 0;
    this.trailT = 0;
    this.n = new THREE.Vector3();
  }

  // Level of detail factor for an effect at a position (0 = skip).
  lod(x, y, z, range = 1) {
    const d = Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z);
    if (d > 2600 * range) return 0;
    // Behind the camera and not very close: thin out heavily.
    const dx = (x - this.cam.x) / (d || 1);
    const dy = (y - this.cam.y) / (d || 1);
    const dz = (z - this.cam.z) / (d || 1);
    const facing = dx * this.camFwd.x + dy * this.camFwd.y + dz * this.camFwd.z;
    let k = d < 120 ? 1 : d < 400 ? 0.75 : d < 900 ? 0.5 : 0.3;
    if (facing < 0.2 && d > 40) k *= 0.25;
    return k;
  }

  // ------------------------------------------------------------ primitives

  emit(pool, o) {
    const P = this.P;
    P.x = o.x;
    P.y = o.y;
    P.z = o.z;
    P.vx = o.vx || 0;
    P.vy = o.vy || 0;
    P.vz = o.vz || 0;
    P.life = o.life;
    P.k = o.k || 0;
    P.tx = o.tx || 0;
    P.ty = o.ty || 0;
    P.tz = o.tz || 0;
    P.s0 = o.s0;
    P.s1 = o.s1;
    P.rot = o.rot ?? rand() * 6.28;
    P.spin = o.spin ?? 0;
    const c = o.c;
    const c1 = o.c1 || o.c;
    P.r = c[0];
    P.g = c[1];
    P.b = c[2];
    P.a = c[3];
    P.r1 = c1[0];
    P.g1 = c1[1];
    P.b1 = c1[2];
    P.a1 = c1[3];
    P.frame = o.frame;
    P.fadeIn = o.fadeIn ?? 0.05;
    P.emissive = o.emissive || 0;
    P.stretch = o.stretch || 0;
    P.delay = o.delay || 0;
    pool.spawn(P);
  }

  smokePuff(x, y, z, size, life, shade, alpha, rise = 1, pool = this.smoke, frame = FRAME.SMOKE_B) {
    const k = 0.35 + rand() * 0.3;
    this.emit(pool, {
      x,
      y,
      z,
      vx: rr(-1, 1) * size * 0.3,
      vy: rr(0.2, 1) * rise,
      vz: rr(-1, 1) * size * 0.3,
      k,
      tx: this.windX * 0.8,
      ty: rise * 1.2,
      tz: this.windZ * 0.8,
      life: life * rr(0.8, 1.2),
      s0: size * 0.45,
      s1: size * rr(1.2, 1.7),
      spin: rr(-0.25, 0.25),
      c: [shade, shade * 0.98, shade * 0.96, alpha],
      c1: [shade * 1.15, shade * 1.13, shade * 1.1, 0],
      frame: frame === -1 ? (rand() < 0.5 ? FRAME.SMOKE_A : FRAME.SMOKE_B) : frame,
      fadeIn: 0.08,
    });
  }

  sparks(x, y, z, n, speed, nx = 0, ny = 1, nz = 0, life = 0.5, hot = 1) {
    for (let i = 0; i < n; i++) {
      let vx = rr(-1, 1);
      let vy = rr(-1, 1);
      let vz = rr(-1, 1);
      const d = vx * nx + vy * ny + vz * nz;
      if (d < 0) {
        vx -= 2 * d * nx;
        vy -= 2 * d * ny;
        vz -= 2 * d * nz;
      }
      const s = speed * rr(0.4, 1.2);
      const l = Math.hypot(vx, vy, vz) || 1;
      this.emit(this.add, {
        x,
        y,
        z,
        vx: (vx / l) * s,
        vy: (vy / l) * s + 2,
        vz: (vz / l) * s,
        k: 0.8,
        tx: 0,
        ty: -12,
        tz: 0,
        life: life * rr(0.5, 1.3),
        s0: 0.06,
        s1: 0.03,
        c: [4 * hot, 2.6 * hot, 1.1 * hot, 1],
        c1: [2, 0.6, 0.15, 1],
        frame: FRAME.SPARK,
        stretch: 0.6,
        emissive: 1,
        fadeIn: 0.01,
      });
    }
  }

  dirtSpray(x, y, z, n, speed, col, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28;
      const up = rr(0.5, 1);
      const s = speed * rr(0.5, 1.1);
      this.emit(this.fx, {
        x,
        y,
        z,
        vx: Math.cos(a) * s * (1 - up * 0.6),
        vy: s * up,
        vz: Math.sin(a) * s * (1 - up * 0.6),
        k: 0.25,
        tx: 0,
        ty: -30,
        tz: 0,
        life: rr(0.6, 1.4),
        s0: 0.25 * size,
        s1: 0.8 * size,
        c: [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1],
        c1: [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.6],
        frame: FRAME.SPECKS,
        fadeIn: 0.02,
      });
    }
  }

  // ------------------------------------------------------------ presets

  muzzle(e) {
    const def = e.weapon;
    const size = def.flash || 0.6;
    const l = this.lod(e.x, e.y, e.z);
    if (l <= 0) return;
    const { x, y, z, dx, dy, dz } = e;
    const night = this.night;
    const I = 2.5 + night * 2;
    this.emit(this.add, { x: x + dx * 0.15 * size, y: y + dy * 0.15 * size, z: z + dz * 0.15 * size, life: 0.055, s0: 0.45 * size, s1: 0.7 * size, c: [I, I * 0.8, I * 0.5, 1], c1: [I, I * 0.5, I * 0.2, 0], frame: FRAME.FLASH, emissive: 1, fadeIn: 0.01 });
    if (l > 0.4) {
      for (let i = 1; i <= 2; i++) {
        const o = i * 0.32 * size;
        this.emit(this.add, { x: x + dx * o, y: y + dy * o, z: z + dz * o, vx: dx * 6, vy: dy * 6, vz: dz * 6, life: 0.05, s0: 0.28 * size / i, s1: 0.4 * size / i, c: [I, I * 0.7, I * 0.35, 1], c1: [I, I * 0.4, 0.1, 0], frame: FRAME.FIREBALL, emissive: 1, fadeIn: 0.01 });
      }
    }
    if (size >= 1.4) {
      // Heavy guns: blast smoke and ground dust.
      const n = Math.round((size >= 3 ? 10 : 4) * l);
      for (let i = 0; i < n; i++) {
        const o = rr(0.5, 2.5) * size * 0.5;
        this.emit(this.smoke, {
          x: x + dx * o,
          y: y + dy * o,
          z: z + dz * o,
          vx: dx * rr(4, 14) * size * 0.4 + rr(-2, 2),
          vy: dy * rr(4, 14) * size * 0.4 + rr(0, 2),
          vz: dz * rr(4, 14) * size * 0.4 + rr(-2, 2),
          k: 2,
          tx: this.windX,
          ty: 0.8,
          tz: this.windZ,
          life: rr(1.5, 3.5) * (size >= 3 ? 1.6 : 1),
          s0: 0.8 * size,
          s1: 2.2 * size,
          c: [0.72, 0.7, 0.66, 0.5],
          c1: [0.78, 0.76, 0.72, 0],
          frame: FRAME.SMOKE_A,
          fadeIn: 0.02,
        });
      }
      if (size >= 3) {
        this.lights.flash(x, y, z, 0xffb070, 60 + night * 140, 60, 0.12, this.cam);
        const g = this.terrain.heightAt(x, z);
        if (y - g < 4) {
          const col = DIRT_COLORS[this.terrain.materialAt(x, z)] || DIRT_COLORS[MAT.DIRT];
          for (let i = 0; i < 8 * l; i++) {
            const a = rand() * 6.28;
            this.emit(this.fx, { x: x + Math.cos(a) * 2, y: g + 0.5, z: z + Math.sin(a) * 2, vx: Math.cos(a) * rr(6, 14), vy: rr(0.5, 2), vz: Math.sin(a) * rr(6, 14), k: 2.2, tx: this.windX, ty: 0.3, tz: this.windZ, life: rr(1.5, 3), s0: 1.5, s1: 4.5, c: [col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, 0.55], c1: [col[0] * 1.4, col[1] * 1.4, col[2] * 1.4, 0], frame: FRAME.DUST });
          }
        }
      }
    } else if (night > 0.3 && rand() < 0.15) {
      this.lights.flash(x, y, z, 0xffc080, 6, 14, 0.05, this.cam);
    }
    // Rocket backblast.
    if (def.backblast) {
      for (let i = 0; i < 8 * l; i++) {
        this.emit(this.smoke, { x: x - dx * 1.2, y: y - dy * 1.2, z: z - dz * 1.2, vx: -dx * rr(8, 20) + rr(-2, 2), vy: -dy * rr(8, 20) + rr(0, 2), vz: -dz * rr(8, 20) + rr(-2, 2), k: 2.5, tx: this.windX, ty: 0.6, tz: this.windZ, life: rr(1.5, 3), s0: 0.6, s1: 2.6, c: [0.8, 0.78, 0.74, 0.55], c1: [0.85, 0.83, 0.8, 0], frame: FRAME.SMOKE_A });
      }
    }
    if (def.kind === 'missile' || def.kind === 'rocket') {
      for (let i = 0; i < 5 * l; i++) this.smokePuff(x + rr(-0.5, 0.5), y + rr(-0.3, 0.5), z + rr(-0.5, 0.5), 1.4, 2.5, 0.8, 0.45, 0.4, this.smoke, FRAME.SMOKE_A);
    }
  }

  impact(e) {
    const l = this.lod(e.x, e.y, e.z, 0.6);
    if (l <= 0) return;
    const s = e.size || 0.6;
    const { x, y, z } = e;
    let nx = e.nx || 0;
    let ny = e.ny ?? 1;
    let nz = e.nz || 0;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    switch (e.kind) {
      case 'dirt': {
        const col = DIRT_COLORS[e.mat ?? this.terrain.materialAt(x, z)] || DIRT_COLORS[MAT.DIRT];
        const n = Math.max(1, Math.round((s > 1 ? 4 : 2) * l));
        for (let i = 0; i < n; i++) {
          this.emit(this.fx, { x, y: y + 0.1, z, vx: rr(-1, 1) * s, vy: rr(1.5, 4) * s, vz: rr(-1, 1) * s, k: 1.5, tx: this.windX * 0.5, ty: 0.2, tz: this.windZ * 0.5, life: rr(0.7, 1.6) * (0.8 + s * 0.3), s0: 0.25 * s, s1: 1.4 * s, c: [col[0] * 1.35, col[1] * 1.35, col[2] * 1.35, 0.75], c1: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, 0], frame: FRAME.DUST });
        }
        if (l > 0.5) this.dirtSpray(x, y + 0.05, z, Math.round(2 + s * 2), 3 + s * 2, col, 0.6 * s);
        break;
      }
      case 'water':
        this.emit(this.fx, { x, y, z, vy: 1, life: 0.6, s0: 0.5 * s, s1: 1.6 * s, c: [0.8, 0.85, 0.9, 0.8], c1: [0.8, 0.85, 0.9, 0], frame: FRAME.SPLASH });
        break;
      case 'metal':
      case 'penetration':
      case 'ricochet': {
        const pen = e.kind === 'penetration';
        this.sparks(x, y, z, Math.round((pen ? 24 : e.kind === 'ricochet' ? 6 : 9) * s * l + 2), pen ? 16 : 11, nx, ny, nz, pen ? 0.7 : 0.45);
        this.emit(this.add, { x, y, z, life: 0.06, s0: 0.5 * s, s1: 1.1 * s, c: [5, 4, 2.6, 1], c1: [4, 2, 0.5, 0], frame: FRAME.FLASH, emissive: 1, fadeIn: 0.01 });
        if (pen || s > 1.5) {
          for (let i = 0; i < 3; i++) this.smokePuff(x, y, z, 1 + s, 2.5, 0.3, 0.5, 0.6, this.smoke, FRAME.SMOKE_A);
          if (s > 1.5) this.lights.flash(x, y, z, 0xffd090, 40, 30, 0.08, this.cam);
        }
        break;
      }
      case 'metal_heavy':
        this.sparks(x, y + 0.3, z, 12, 9, 0, 1, 0, 0.6);
        this.smokePuff(x, y + 0.5, z, 2, 2, 0.45, 0.5, 0.5, this.fx, FRAME.DUST);
        break;
      case 'concrete': {
        const n = Math.max(1, Math.round(3 * l));
        for (let i = 0; i < n; i++) this.emit(this.fx, { x, y, z, vx: nx * rr(1, 3) + rr(-1, 1), vy: ny * rr(1, 3) + rr(0, 1.5), vz: nz * rr(1, 3) + rr(-1, 1), k: 1.5, tx: this.windX * 0.5, ty: -0.3, tz: this.windZ * 0.5, life: rr(0.8, 1.6), s0: 0.2 * s, s1: 1.1 * s, c: [0.72, 0.7, 0.66, 0.8], c1: [0.78, 0.76, 0.72, 0], frame: FRAME.DUST });
        if (l > 0.5) {
          this.dirtSpray(x, y, z, 3, 4, [0.6, 0.58, 0.55], 0.4);
          if (rand() < 0.4) this.sparks(x, y, z, 2, 6, nx, ny, nz, 0.25, 0.7);
        }
        break;
      }
      case 'wood':
        for (let i = 0; i < 3 * l; i++) this.emit(this.fx, { x, y, z, vx: nx * rr(2, 5) + rr(-1, 1), vy: rr(1, 4), vz: nz * rr(2, 5) + rr(-1, 1), k: 0.3, ty: -20, life: rr(0.6, 1.2), s0: 0.25, s1: 0.2, c: [0.45, 0.33, 0.2, 1], c1: [0.45, 0.33, 0.2, 0.5], frame: FRAME.SPECKS });
        this.smokePuff(x, y, z, 0.6 * s, 1, 0.55, 0.4, 0.4, this.fx, FRAME.DUST);
        break;
      case 'foliage':
        for (let i = 0; i < 4 * l; i++) this.emit(this.fx, { x, y, z, vx: rr(-2, 2), vy: rr(0, 2), vz: rr(-2, 2), k: 1.2, tx: this.windX * 0.6, ty: -1.2, tz: this.windZ * 0.6, life: rr(1.5, 3), s0: 0.15, s1: 0.15, spin: rr(-4, 4), c: [1, 1, 1, 1], c1: [1, 1, 1, 0.6], frame: FRAME.LEAF });
        break;
      case 'flesh':
        if (l > 0.5) this.emit(this.fx, { x, y, z, vx: rr(-0.5, 0.5), vy: 0.4, vz: rr(-0.5, 0.5), k: 2, life: 0.45, s0: 0.12, s1: 0.45, c: [0.28, 0.07, 0.05, 0.55], c1: [0.32, 0.12, 0.1, 0], frame: FRAME.DUST, fadeIn: 0.02 });
        break;
    }
  }

  explosion(e) {
    const { x, y, z } = e;
    const k = SIZE_K[e.size] || 1;
    const l = this.lod(x, y, z, 1.5);
    if (l <= 0) return;
    const air = e.air;
    const g = this.terrain.heightAt(x, z);
    const col = DIRT_COLORS[e.mat >= 0 ? e.mat : this.terrain.materialAt(x, z)] || DIRT_COLORS[MAT.DIRT];
    const n = (base) => Math.max(1, Math.round(base * l * this.q));
    // Flash.
    this.emit(this.add, { x, y: y + k * 0.5, z, life: 0.09 + k * 0.03, s0: 4 * k, s1: 7 * k, c: [7, 5.5, 3.5, 1], c1: [5, 2, 0.5, 0], frame: FRAME.FLASH, emissive: 1, fadeIn: 0.01 });
    this.emit(this.add, { x, y: y + k * 0.5, z, life: 0.25 + k * 0.05, s0: 6 * k, s1: 10 * k, c: [1.6, 1.0, 0.5, 0.6], c1: [0.8, 0.3, 0.05, 0], frame: FRAME.GLOW, emissive: 1, fadeIn: 0.01 });
    // Fireball.
    for (let i = 0; i < n(4 + k * 3); i++) {
      this.emit(this.add, {
        x: x + rr(-1, 1) * k * 0.6,
        y: y + rr(0, 1) * k * 0.6,
        z: z + rr(-1, 1) * k * 0.6,
        vx: rr(-1, 1) * k * 3,
        vy: rr(1, 4) * k,
        vz: rr(-1, 1) * k * 3,
        k: 3,
        tx: this.windX,
        ty: 3,
        tz: this.windZ,
        life: rr(0.35, 0.7) * (0.8 + k * 0.15),
        s0: 1.4 * k,
        s1: 3.6 * k,
        spin: rr(-1, 1),
        c: [3.2, 1.7, 0.6, 1],
        c1: [0.9, 0.2, 0.03, 0],
        frame: FRAME.FIREBALL,
        emissive: 1,
        fadeIn: 0.02,
      });
    }
    // Smoke.
    const dark = air ? 0.12 : e.size === 'huge' ? 0.2 : 0.26;
    for (let i = 0; i < n(5 + k * 5); i++) {
      const h = rand();
      this.emit(this.smoke, {
        x: x + rr(-1, 1) * k,
        y: y + h * k * 1.5,
        z: z + rr(-1, 1) * k,
        vx: rr(-1, 1) * k * 1.5,
        vy: rr(2, 6) * (0.6 + k * 0.4) * (0.5 + h),
        vz: rr(-1, 1) * k * 1.5,
        k: 0.6,
        tx: this.windX,
        ty: 1 + k * 0.4,
        tz: this.windZ,
        life: rr(3, 6) * (0.7 + k * 0.5),
        s0: 1.6 * k,
        s1: (4 + rand() * 3) * k,
        spin: rr(-0.2, 0.2),
        c: [dark, dark * 0.95, dark * 0.9, 0.85],
        c1: [dark * 2.2, dark * 2.1, dark * 2, 0],
        frame: rand() < 0.5 ? FRAME.SMOKE_A : FRAME.SMOKE_B,
        fadeIn: 0.04,
      });
    }
    if (!air) {
      // Dirt column and spray.
      if (e.mat !== MAT.CONCRETE || k > 2) {
        for (let i = 0; i < n(6 + k * 6); i++) {
          const a = rand() * 6.28;
          const up = rr(0.55, 1);
          const sp = rr(6, 18) * Math.sqrt(k);
          this.emit(this.fx, {
            x: x + rr(-1, 1),
            y: g + 0.3,
            z: z + rr(-1, 1),
            vx: Math.cos(a) * sp * (1 - up * 0.7),
            vy: sp * up * 1.4,
            vz: Math.sin(a) * sp * (1 - up * 0.7),
            k: 0.9,
            tx: this.windX,
            ty: -9,
            tz: this.windZ,
            life: rr(1.2, 2.4) * Math.sqrt(k),
            s0: 0.8 * k,
            s1: 2.6 * k,
            c: [col[0], col[1], col[2], 0.95],
            c1: [col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, 0],
            frame: rand() < 0.5 ? FRAME.DUST : FRAME.SPECKS,
            fadeIn: 0.02,
          });
        }
      }
      // Ground shock dust ring.
      if (k >= 1.7) {
        for (let i = 0; i < n(8 + k * 4); i++) {
          const a = (i / (8 + k * 4)) * 6.28 + rr(-0.2, 0.2);
          const sp = rr(14, 26) * Math.sqrt(k);
          this.emit(this.fx, { x: x + Math.cos(a) * k, y: g + 0.4, z: z + Math.sin(a) * k, vx: Math.cos(a) * sp, vy: rr(0.3, 1.5), vz: Math.sin(a) * sp, k: 2.6, tx: this.windX, ty: 0.4, tz: this.windZ, life: rr(1.5, 3.5) * Math.sqrt(k), s0: 1.2 * k, s1: 3.8 * k, c: [col[0] * 1.4, col[1] * 1.4, col[2] * 1.4, 0.55], c1: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, 0], frame: FRAME.DUST });
        }
        this.emit(this.add, { x, y: g + 0.5, z, life: 0.3, s0: 2 * k, s1: 14 * k, c: [0.8, 0.7, 0.6, 0.4], c1: [0.5, 0.4, 0.3, 0], frame: FRAME.RING, emissive: 1, fadeIn: 0.01 });
      }
      // Clods and chunks.
      const nd = Math.round((k >= 5 ? 16 : k >= 2.8 ? 8 : k >= 1.7 ? 4 : 1) * l);
      for (let i = 0; i < nd; i++) {
        const a = rand() * 6.28;
        const sp = rr(5, 16) * Math.sqrt(k);
        this.debris.spawn(e.mat === MAT.CONCRETE ? 1 : 0, x, g + 0.5, z, Math.cos(a) * sp * 0.5, sp, Math.sin(a) * sp * 0.5, rr(0.4, 1.1) * Math.min(1.6, k * 0.4), rr(5, 10));
      }
      if (k >= 1.7) this.decals.add(x, z, 3 + k * 2.2);
    } else {
      this.sparks(x, y, z, n(8 + k * 4), 14 * Math.sqrt(k), 0, 1, 0, 0.9);
    }
    this.sparks(x, y + 0.3, z, n(6 + k * 5), 10 * Math.sqrt(k), 0, 1, 0, 0.7);
    // Light and shake.
    const night = this.night;
    this.lights.flash(x, y + 2, z, 0xffa055, (60 + night * 160) * k, 25 * k + 20, 0.18 + k * 0.05, this.cam);
    const d = Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z);
    this.shake = Math.max(this.shake, Math.min(1.5, (k * 7) / (8 + d * 0.5)));
  }

  vehicleDestroyed(e) {
    const v = e.unit;
    const { x, y, z } = v.pos;
    const l = this.lod(x, y, z, 1.5);
    if (l <= 0) return;
    const big = e.catastrophic;
    for (let i = 0; i < (big ? 26 : 12) * l; i++) {
      this.emit(this.add, { x: x + rr(-2, 2), y: y + rr(1, 3), z: z + rr(-2, 2), vx: rr(-4, 4), vy: rr(4, big ? 22 : 10), vz: rr(-4, 4), k: 1.5, ty: 4, life: rr(0.5, 1.2), s0: 2.5, s1: big ? 7 : 4.5, c: [3.5, 1.8, 0.6, 1], c1: [0.8, 0.2, 0.04, 0], frame: FRAME.FIREBALL, emissive: 1, fadeIn: 0.02 });
    }
    for (let i = 0; i < 16 * l; i++) this.smokePuff(x + rr(-2, 2), y + rr(1, 4), z + rr(-2, 2), big ? 8 : 5, 8, 0.1, 0.85, 4);
    for (let i = 0; i < (big ? 10 : 5) * l; i++) {
      const a = rand() * 6.28;
      const sp = rr(6, big ? 22 : 12);
      this.debris.spawn(2, x, y + 2, z, Math.cos(a) * sp * 0.6, sp, Math.sin(a) * sp * 0.6, rr(0.6, 1.4), rr(12, 20));
    }
    this.sparks(x, y + 2, z, 40 * l, 18, 0, 1, 0, 1.2);
    this.lights.flash(x, y + 3, z, 0xff9040, big ? 600 : 250, big ? 90 : 60, 0.6, this.cam);
    this.decals.add(x, z, big ? 12 : 8);
  }

  buildingCollapse(e) {
    const s = e.s;
    const l = this.lod(s.x, s.y, s.z, 2);
    if (l <= 0) return;
    const c = new THREE.Color(s.color);
    const n = Math.round(Math.min(80, 18 + s.hx * s.hz * 0.15) * l);
    const r = Math.max(s.hx, s.hz);
    for (let i = 0; i < n; i++) {
      this.emit(this.smoke, {
        x: s.x + rr(-s.hx, s.hx),
        y: s.y + rr(0.5, s.h * 0.8),
        z: s.z + rr(-s.hz, s.hz),
        vx: rr(-4, 4),
        vy: rr(-1, 3),
        vz: rr(-4, 4),
        k: 0.5,
        tx: this.windX,
        ty: 0.6,
        tz: this.windZ,
        life: rr(10, 22),
        s0: r * 0.5 + 3,
        s1: r * 1.1 + 8,
        spin: rr(-0.1, 0.1),
        c: [c.r * 0.7 + 0.15, c.g * 0.7 + 0.14, c.b * 0.7 + 0.12, 0.85],
        c1: [c.r * 0.8 + 0.2, c.g * 0.8 + 0.2, c.b * 0.8 + 0.18, 0],
        frame: FRAME.SMOKE_B,
        fadeIn: 0.03,
      });
    }
    for (let i = 0; i < Math.min(40, 10 + s.h * 2) * l; i++) {
      this.debris.spawn(1, s.x + rr(-s.hx, s.hx), s.y + rr(1, s.h), s.z + rr(-s.hz, s.hz), rr(-6, 6), rr(-2, 6), rr(-6, 6), rr(0.6, 2), rr(15, 30));
    }
    this.shake = Math.max(this.shake, 0.6 * l);
  }

  smokeLaunch(e) {
    const v = e.unit;
    for (let i = 0; i < 6; i++) this.emit(this.add, { x: e.x, y: e.y, z: e.z, vx: rr(-6, 6), vy: rr(4, 8), vz: rr(-6, 6), life: 0.15, s0: 0.6, s1: 0.3, c: [3, 2.2, 1.2, 1], c1: [1, 0.5, 0.1, 0], frame: FRAME.FLASH, emissive: 1 });
    void v;
  }

  flaresBurst(e) {
    this.lights.flash(e.x, e.y, e.z, 0xffe0f0, 120, 120, 2.5, this.cam);
  }

  // ------------------------------------------------------------ events

  handle(events, world) {
    for (const e of events) {
      switch (e.t) {
        case 'fire':
          this.muzzle(e);
          break;
        case 'impact':
          this.impact(e);
          break;
        case 'explosion':
          this.explosion(e);
          break;
        case 'vehicle_destroyed':
          this.vehicleDestroyed(e);
          break;
        case 'aircraft_crash':
          this.explosion({ x: e.unit.pos.x, y: e.unit.pos.y + 1, z: e.unit.pos.z, size: 'huge', air: false, mat: -1 });
          break;
        case 'building_collapse':
          this.buildingCollapse(e);
          break;
        case 'structure_destroyed':
        case 'crush': {
          const s = e.s;
          const kind = s.material === 'metal' ? 2 : s.material === 'wood' || s.material === 'hedge' ? 0 : 1;
          for (let i = 0; i < 4; i++) this.debris.spawn(kind, s.x + rr(-s.hx, s.hx), s.y + 0.5, s.z + rr(-s.hz, s.hz), rr(-3, 3), rr(2, 6), rr(-3, 3), rr(0.4, 0.9), rr(8, 14));
          this.smokePuff(s.x, s.y + 1, s.z, 3, 3, 0.55, 0.6, 0.6, this.fx, FRAME.DUST);
          break;
        }
        case 'tree_fall': {
          const t = e.tree;
          for (let i = 0; i < 10; i++) this.emit(this.fx, { x: t.x + rr(-3, 3), y: t.y + rr(4, 10), z: t.z + rr(-3, 3), vx: rr(-2, 2), vy: rr(-1, 1), vz: rr(-2, 2), k: 1, tx: this.windX * 0.6, ty: -1.5, tz: this.windZ * 0.6, life: rr(2, 4), s0: 0.18, s1: 0.18, spin: rr(-4, 4), c: [1, 1, 1, 1], c1: [1, 1, 1, 0.5], frame: FRAME.LEAF });
          break;
        }
        case 'smoke_launch':
          this.smokeLaunch(e);
          break;
        case 'flares':
          this.flaresBurst(e);
          break;
        case 'aircraft_hit': {
          const a = e.unit;
          this.explosion({ x: a.pos.x, y: a.pos.y, z: a.pos.z, size: 'large', air: true });
          break;
        }
        default:
          break;
      }
    }
    void world;
  }

  // ------------------------------------------------------------ continuous emitters

  update(dt, world, camera, sky) {
    this.time += dt;
    this.cam.copy(camera.position);
    camera.getWorldDirection(this.camFwd);
    this.windX = world.weather.windX;
    this.windZ = world.weather.windZ;
    this.night = sky ? sky.nightFactor : 0;
    const emitK = Math.min(dt, 0.05);
    // Sim smoke clouds -> particles.
    for (const c of world.smoke.clouds) {
      const l = this.lod(c.x, c.y, c.z, 1.2);
      if (l <= 0) continue;
      let t = this.cloudT.get(c) ?? 0;
      t -= dt;
      if (t <= 0) {
        const fade = c.t > c.life * 0.7 ? 1 - (c.t - c.life * 0.7) / (c.life * 0.3) : 1;
        if (c.kind === 'screen') {
          const r = c.r;
          const a = rand() * 6.28;
          const rad = Math.sqrt(rand()) * r * 0.75;
          this.emit(this.smoke, { x: c.x + Math.cos(a) * rad, y: c.y + rr(-0.5, 0.4) * r, z: c.z + Math.sin(a) * rad, vx: rr(-0.5, 0.5), vy: rr(0, 0.4), vz: rr(-0.5, 0.5), k: 0.4, tx: this.windX * 0.7, ty: 0.15, tz: this.windZ * 0.7, life: rr(7, 11), s0: r * 0.6, s1: r * 1.2, spin: rr(-0.08, 0.08), c: [0.82, 0.82, 0.8, 0.42 * fade], c1: [0.88, 0.88, 0.86, 0], frame: rand() < 0.5 ? FRAME.SMOKE_A : FRAME.SMOKE_B, fadeIn: 0.15 });
          t = 0.32 / l;
        } else if (c.kind === 'fire') {
          this.emit(this.smoke, { x: c.x + rr(-2, 2), y: c.y, z: c.z + rr(-2, 2), vy: rr(2, 4), k: 0.3, tx: this.windX, ty: 3, tz: this.windZ, life: rr(9, 15), s0: c.r * 0.5, s1: c.r * 2, spin: rr(-0.1, 0.1), c: [0.06, 0.055, 0.05, 0.7 * fade], c1: [0.2, 0.19, 0.18, 0], frame: FRAME.SMOKE_B, fadeIn: 0.06 });
          t = 0.9 / l;
        } else {
          t = 1e9; // dust clouds are already drawn by the explosion itself
        }
      }
      this.cloudT.set(c, t);
    }
    // Burning wrecks.
    for (const u of world.dead) {
      if (!(u.burning > 0) || u.removed) continue;
      const l = this.lod(u.pos.x, u.pos.y, u.pos.z, 1.3);
      if (l <= 0) continue;
      const big = u.cat === 'air' ? 1.3 : u.catastrophic ? 1.2 : 1;
      const intensity = Math.min(1, u.burning / 20);
      const fireRate = 14 * l * intensity * big;
      if (rand() < fireRate * emitK) {
        const hs = u.spec ? (u.spec.width || 3) * 0.4 : 2;
        this.emit(this.add, { x: u.pos.x + rr(-hs, hs), y: u.pos.y + rr(1, 2.4), z: u.pos.z + rr(-hs, hs), vx: rr(-0.4, 0.4), vy: rr(1.5, 3.5), vz: rr(-0.4, 0.4), k: 0.6, tx: this.windX * 0.4, ty: 3.5, tz: this.windZ * 0.4, life: rr(0.6, 1.2), s0: 1.3 * big, s1: 2.6 * big, c: [2.6, 1.3, 0.45, 1], c1: [1.2, 0.25, 0.05, 0], frame: FRAME.FLAME, emissive: 1, fadeIn: 0.1 });
      }
      if (rand() < 4 * l * big * emitK * (0.5 + intensity)) {
        this.emit(this.smoke, { x: u.pos.x + rr(-1, 1), y: u.pos.y + 3, z: u.pos.z + rr(-1, 1), vx: rr(-0.5, 0.5), vy: rr(2.5, 4.5), vz: rr(-0.5, 0.5), k: 0.35, tx: this.windX, ty: 3.2, tz: this.windZ, life: rr(10, 16), s0: 2.5 * big, s1: 9 * big, spin: rr(-0.15, 0.15), c: [0.05, 0.048, 0.045, 0.75], c1: [0.16, 0.15, 0.15, 0], frame: FRAME.SMOKE_B, fadeIn: 0.05 });
      }
      if (rand() < 2 * emitK && this.night > 0.2) this.lights.flash(u.pos.x, u.pos.y + 2.5, u.pos.z, 0xff8a3c, 25 * intensity, 28, 0.6, this.cam);
    }
    // Burning buildings.
    for (const s of world.burningStructures) {
      const l = this.lod(s.x, s.y, s.z, 1.3);
      if (l <= 0) continue;
      const top = s.destroyed ? s.y + s.rubbleH : s.top;
      if (rand() < 10 * l * emitK) {
        this.emit(this.add, { x: s.x + rr(-s.hx, s.hx) * 0.8, y: top - rr(0, 1.5), z: s.z + rr(-s.hz, s.hz) * 0.8, vy: rr(2, 4), k: 0.6, tx: this.windX * 0.4, ty: 4, tz: this.windZ * 0.4, life: rr(0.8, 1.5), s0: 2, s1: 4, c: [2.6, 1.3, 0.45, 1], c1: [1.2, 0.25, 0.05, 0], frame: FRAME.FLAME, emissive: 1, fadeIn: 0.1 });
      }
      if (rand() < 3 * l * emitK) this.smokePuff(s.x + rr(-s.hx, s.hx) * 0.5, top + 2, s.z + rr(-s.hz, s.hz) * 0.5, 8, 15, 0.08, 0.75, 3.5);
    }
    // Vehicles: dust trails and exhaust.
    for (const u of world.units) {
      if (u.cat === 'veh') {
        if (u.dust > 0 && rand() < u.dust * 10 * emitK) {
          const l = this.lod(u.pos.x, u.pos.y, u.pos.z, 0.7);
          if (l > 0) {
            const bx = u.pos.x - Math.sin(u.yaw) * u.spec.length * 0.45;
            const bz = u.pos.z - Math.cos(u.yaw) * u.spec.length * 0.45;
            const col = DIRT_COLORS[this.terrain.materialAt(bx, bz)] || DIRT_COLORS[MAT.DIRT];
            this.emit(this.fx, { x: bx + rr(-1.5, 1.5), y: u.pos.y + 0.6, z: bz + rr(-1.5, 1.5), vx: rr(-1, 1), vy: rr(0.5, 1.5), vz: rr(-1, 1), k: 0.8, tx: this.windX, ty: 0.3, tz: this.windZ, life: rr(2.5, 4.5), s0: 1.5, s1: 5.5, c: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, 0.5], c1: [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6, 0], frame: FRAME.DUST, fadeIn: 0.1 });
          }
        }
        if (u.engine > 0.7 && u.spec.exhaust && rand() < 3 * emitK) {
          const ex = u.spec.exhaust;
          this.n.set(ex[0], ex[1], ex[2]).applyQuaternion(u.quat).add(u.pos);
          this.smokePuff(this.n.x, this.n.y, this.n.z, 1, 2, 0.15, 0.35, 0.8, this.fx, FRAME.SMOKE_A);
        }
      } else if (u.cat === 'air' && u.alive) {
        const ground = this.terrain.heightAt(u.pos.x, u.pos.z);
        const agl = u.pos.y - ground;
        if (u.aclass === 'heli' && agl < 28 && rand() < (1 - agl / 28) * 25 * emitK) {
          const a = rand() * 6.28;
          const col = DIRT_COLORS[this.terrain.materialAt(u.pos.x, u.pos.z)] || DIRT_COLORS[MAT.DIRT];
          this.emit(this.fx, { x: u.pos.x + Math.cos(a) * 3, y: ground + 0.4, z: u.pos.z + Math.sin(a) * 3, vx: Math.cos(a) * rr(10, 18), vy: rr(0.3, 1.5), vz: Math.sin(a) * rr(10, 18), k: 1.2, tx: this.windX, ty: 0.3, tz: this.windZ, life: rr(1.5, 3), s0: 1.5, s1: 5, c: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, 0.45], c1: [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6, 0], frame: FRAME.DUST });
        }
        if ((u.smoking || u.crashing) && rand() < 20 * emitK) {
          this.smokePuff(u.pos.x, u.pos.y, u.pos.z, u.crashing ? 4 : 2.5, u.crashing ? 6 : 4, u.crashing ? 0.06 : 0.25, 0.75, 0.3);
          if (u.crashing) this.emit(this.add, { x: u.pos.x, y: u.pos.y, z: u.pos.z, vx: rr(-1, 1), vy: rr(-1, 1), vz: rr(-1, 1), life: rr(0.3, 0.6), s0: 2, s1: 3.5, c: [3, 1.4, 0.4, 1], c1: [1, 0.2, 0.03, 0], frame: FRAME.FIREBALL, emissive: 1 });
        }
        if (u.aclass === 'jet') {
          const n = u.spec.nozzle;
          this.n.set(n[0], n[1], n[2]).applyQuaternion(u.quat).add(u.pos);
          this.emit(this.add, { x: this.n.x, y: this.n.y, z: this.n.z, life: 0.05, s0: 1.2, s1: 1.6, c: [2.4, 1.2, 0.5, 0.8 * u.throttle], c1: [1, 0.3, 0.1, 0], frame: FRAME.GLOW, emissive: 1 });
        }
      }
    }
    // Missile / rocket smoke trails and flare trails.
    this.trailT -= dt;
    const doTrail = this.trailT <= 0;
    if (doTrail) this.trailT = 0.025;
    if (doTrail) {
      for (const p of world.projectiles.active) {
        if (!p.active) continue;
        if (p.kind === 'missile' || (p.kind === 'rocket' && p.def.smokeTrail)) {
          const burning = p.thrustT > 0 || p.sustain > 0 || p.age < 1.8;
          if (!burning) continue;
          const l = this.lod(p.x, p.y, p.z, 0.8);
          if (l <= 0 || rand() > l + 0.2) continue;
          const shade = p.def.id === 'mlrs_rocket' ? 0.65 : 0.82;
          this.emit(this.smoke, { x: p.x - p.vx * 0.01, y: p.y - p.vy * 0.01, z: p.z - p.vz * 0.01, vx: rr(-0.3, 0.3), vy: rr(-0.2, 0.3), vz: rr(-0.3, 0.3), k: 0.25, tx: this.windX * 0.6, ty: 0.25, tz: this.windZ * 0.6, life: rr(3, 6), s0: 0.4, s1: rr(2.5, 4), spin: rr(-0.2, 0.2), c: [shade, shade, shade * 0.98, 0.5], c1: [shade + 0.08, shade + 0.08, shade + 0.06, 0], frame: FRAME.SMOKE_A, fadeIn: 0.02 });
        } else if (p.kind === 'flare') {
          this.emit(this.smoke, { x: p.x, y: p.y, z: p.z, k: 0.4, tx: this.windX * 0.5, ty: 0.3, tz: this.windZ * 0.5, life: rr(2, 4), s0: 0.4, s1: 2.2, c: [0.9, 0.9, 0.9, 0.4], c1: [0.95, 0.95, 0.95, 0], frame: FRAME.SMOKE_A, fadeIn: 0.02 });
        }
      }
    }
    this.lights.update(dt);
    this.debris.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const light = sky ? sky.ambientLevel : new THREE.Color(1, 1, 1);
    const fog = this.scene.fog;
    for (const pool of [this.smoke, this.fx, this.add]) {
      if (fog) pool.setEnvironment(fog.color, fog.density, light);
      pool.flush(this.time);
    }
  }
}
