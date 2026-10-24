// CPU-simulated, GPU-instanced particle effects: sparks (velocity stretched),
// smoke, dust, fire, plus physical debris chunks and glass shards.

import * as THREE from 'three';
import { smokeSpriteTexture, sparkSpriteTexture, fireSpriteTexture } from '../render/textures.ts';
import type { Heightfield } from '../sim/terrain.ts';

interface SystemOpts {
  max: number;
  texture: THREE.Texture;
  additive: boolean;
  stretch: number;
  lit?: boolean;
}

class ParticleSystem {
  readonly max: number;
  count = 0;
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  // per particle state
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; maxLife: Float32Array;
  size0: Float32Array; size1: Float32Array;
  r: Float32Array; g: Float32Array; b: Float32Array; a0: Float32Array;
  rot: Float32Array; rotV: Float32Array;
  drag: Float32Array; grav: Float32Array; bounce: Float32Array;
  // GPU buffers
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;

  constructor(o: SystemOpts) {
    this.max = o.max;
    const n = o.max;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.size0 = new Float32Array(n); this.size1 = new Float32Array(n);
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n); this.a0 = new Float32Array(n);
    this.rot = new Float32Array(n); this.rotV = new Float32Array(n);
    this.drag = new Float32Array(n); this.grav = new Float32Array(n); this.bounce = new Float32Array(n);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iVel', this.aVel);
    g.setAttribute('iCol', this.aCol);
    g.setAttribute('iSize', this.aSize);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: o.texture }, stretch: { value: o.stretch }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, lightCol: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `
        attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec2 iSize;
        uniform float stretch;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          vUv = uv; vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec2 c = position.xy;
          if (stretch > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
            float sp = length(vv.xy);
            vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
            vec2 perp = vec2(-dir.y, dir.x);
            float len = iSize.x + sp * stretch;
            mv.xy += dir * c.y * len + perp * c.x * iSize.x;
          } else {
            float cs = cos(iSize.y), sn = sin(iSize.y);
            mv.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * iSize.x;
          }
          vFog = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform vec3 lightCol;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          vec4 t = texture2D(map, vUv);
          vec4 c = vec4(vCol.rgb * t.rgb * lightCol, vCol.a * t.a);
          float f = smoothstep(fogNear, fogFar, vFog);
          c.rgb = mix(c.rgb, fogColor, f * ${o.additive ? '0.0' : '1.0'});
          c.a *= ${o.additive ? '(1.0 - f)' : '1.0'};
          if (c.a < 0.003) discard;
          gl_FragColor = c;
        }`,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.additive ? 5 : 4;
    void o.lit;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, drag = 0, grav = 0, bounce = 0, rot = 0, rotV = 0): void {
    let i: number;
    if (this.count < this.max) i = this.count++;
    else i = Math.floor(Math.random() * this.max);
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = s0; this.size1[i] = s1;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a0[i] = a;
    this.drag[i] = drag; this.grav[i] = grav; this.bounce[i] = bounce;
    this.rot[i] = rot; this.rotV[i] = rotV;
  }

  update(dt: number, terrain: Heightfield | null, fog: THREE.Fog | null): void {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const d = 1 - this.drag[i] * dt;
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
      if (this.bounce[i] > 0 && terrain) {
        const h = terrain.heightAt(this.px[i], this.pz[i]);
        if (this.py[i] < h + 0.02) {
          this.py[i] = h + 0.02;
          if (this.vy[i] < 0) this.vy[i] = -this.vy[i] * this.bounce[i];
          this.vx[i] *= 0.6;
          this.vz[i] *= 0.6;
        }
      }
    }
    this.count = n;
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array, C = this.aCol.array as Float32Array, S = this.aSize.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      V[i * 3] = this.vx[i]; V[i * 3 + 1] = this.vy[i]; V[i * 3 + 2] = this.vz[i];
      const fadeIn = Math.min(1, t * 8);
      const fade = (1 - t) * fadeIn;
      C[i * 4] = this.r[i]; C[i * 4 + 1] = this.g[i]; C[i * 4 + 2] = this.b[i]; C[i * 4 + 3] = this.a0[i] * fade;
      S[i * 2] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      S[i * 2 + 1] = this.rot[i];
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aVel.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.aPos.addUpdateRange(0, n * 3);
    this.aVel.addUpdateRange(0, n * 3);
    this.aCol.addUpdateRange(0, n * 4);
    this.aSize.addUpdateRange(0, n * 2);
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    if (fog) {
      u.fogColor.value.copy(fog.color);
      u.fogNear.value = fog.near;
      u.fogFar.value = fog.far;
    }
  }

  private copy(from: number, to: number): void {
    const arrs = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.size0, this.size1, this.r, this.g, this.b, this.a0, this.rot, this.rotV, this.drag, this.grav, this.bounce];
    for (const a of arrs) a[to] = a[from];
  }

  setLight(c: THREE.Color): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.lightCol.value.copy(c);
  }
}

// ---------------------------------------------------------------------------
// Rigid debris chunks and glass shards (instanced meshes with simple physics)

class ChunkSystem {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly max: number;
  private p: Float32Array;
  private v: Float32Array;
  private q: Float32Array; // quaternion
  private w: Float32Array; // angular velocity
  private s: Float32Array; // scale
  private life: Float32Array;
  private rest: Uint8Array;
  private col: THREE.Color[] = [];
  private dummy = new THREE.Object3D();
  private hasColor: boolean;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, colored: boolean) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.hasColor = colored;
    if (colored) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.q = new Float32Array(max * 4);
    this.w = new Float32Array(max * 3);
    this.s = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.rest = new Uint8Array(max);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: THREE.Color | null, life = 14): void {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.q.set([q.x, q.y, q.z, q.w], i * 4);
    this.w.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30], i * 3);
    this.s.set([size * (0.6 + Math.random() * 0.8), size * (0.3 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.8)], i * 3);
    this.life[i] = life * (0.7 + Math.random() * 0.6);
    this.rest[i] = 0;
    if (this.hasColor && color) this.mesh.setColorAt(i, color);
    void this.col;
  }

  update(dt: number, terrain: Heightfield | null): void {
    const qq = new THREE.Quaternion(), dq = new THREE.Quaternion(), e = new THREE.Vector3();
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.moveSlot(n, i);
        i--;
        continue;
      }
      if (!this.rest[i]) {
        this.v[i * 3 + 1] -= 9.81 * dt;
        for (let k = 0; k < 3; k++) this.p[i * 3 + k] += this.v[i * 3 + k] * dt;
        const h = terrain ? terrain.heightAt(this.p[i * 3], this.p[i * 3 + 2]) : 0;
        const r = this.s[i * 3 + 1] * 0.5;
        if (this.p[i * 3 + 1] < h + r) {
          this.p[i * 3 + 1] = h + r;
          if (this.v[i * 3 + 1] < 0) this.v[i * 3 + 1] *= -0.3;
          this.v[i * 3] *= 0.55;
          this.v[i * 3 + 2] *= 0.55;
          for (let k = 0; k < 3; k++) this.w[i * 3 + k] *= 0.6;
          const sp = Math.hypot(this.v[i * 3], this.v[i * 3 + 1], this.v[i * 3 + 2]);
          if (sp < 0.3) this.rest[i] = 1;
        }
        qq.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]);
        e.set(this.w[i * 3], this.w[i * 3 + 1], this.w[i * 3 + 2]);
        const ang = e.length() * dt;
        if (ang > 1e-5) {
          dq.setFromAxisAngle(e.normalize(), ang);
          qq.premultiply(dq);
          this.q.set([qq.x, qq.y, qq.z, qq.w], i * 4);
        }
      }
      const d = this.dummy;
      d.position.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      d.quaternion.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]);
      const fade = Math.min(1, this.life[i] / 1.5);
      d.scale.set(this.s[i * 3] * fade, this.s[i * 3 + 1] * fade, this.s[i * 3 + 2] * fade);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.n = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private moveSlot(from: number, to: number): void {
    this.p.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.v.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.q.copyWithin(to * 4, from * 4, from * 4 + 4);
    this.w.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.s.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.life[to] = this.life[from];
    this.rest[to] = this.rest[from];
    if (this.mesh.instanceColor) {
      const c = new THREE.Color();
      this.mesh.getColorAt(from, c);
      this.mesh.setColorAt(to, c);
    }
  }
}

// ---------------------------------------------------------------------------

export class Effects {
  readonly group = new THREE.Group();
  readonly sparks: ParticleSystem;
  readonly smoke: ParticleSystem;
  readonly dust: ParticleSystem;
  readonly fire: ParticleSystem;
  readonly debris: ChunkSystem;
  readonly glass: ChunkSystem;
  terrain: Heightfield | null = null;
  quality = 1;

  constructor() {
    this.sparks = new ParticleSystem({ max: 2500, texture: sparkSpriteTexture(), additive: true, stretch: 0.045 });
    this.smoke = new ParticleSystem({ max: 900, texture: smokeSpriteTexture(), additive: false, stretch: 0 });
    this.dust = new ParticleSystem({ max: 1200, texture: smokeSpriteTexture(), additive: false, stretch: 0 });
    this.fire = new ParticleSystem({ max: 500, texture: fireSpriteTexture(), additive: true, stretch: 0 });
    const chunkGeo = new THREE.DodecahedronGeometry(0.5, 0);
    this.debris = new ChunkSystem(chunkGeo, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.5 }), 400, true);
    const shard = new THREE.BufferGeometry();
    shard.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0.2, 0.3, 0, 1, 0, 0.04, 0, 1, 0.04, 0.2, 0.3, 0.04, 1], 3));
    shard.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1]);
    shard.translate(-0.4, 0, -0.4);
    shard.computeVertexNormals();
    this.glass = new ChunkSystem(shard, new THREE.MeshPhysicalMaterial({ color: 0xbfd8e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 700, false);
    this.group.add(this.smoke.mesh, this.dust.mesh, this.sparks.mesh, this.fire.mesh, this.debris.mesh, this.glass.mesh);
  }

  emitSparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, speed: number, vx = 0, vy = 0, vz = 0): void {
    count = Math.ceil(count * this.quality);
    for (let i = 0; i < count; i++) {
      const s = speed * (0.3 + Math.random() * 0.9);
      const dx = nx + (Math.random() - 0.5) * 1.6, dy = ny + Math.random() * 0.8, dz = nz + (Math.random() - 0.5) * 1.6;
      const l = Math.hypot(dx, dy, dz) || 1;
      const hot = Math.random();
      this.sparks.emit(x, y, z, vx * 0.6 + (dx / l) * s, vy * 0.3 + (dy / l) * s, vz * 0.6 + (dz / l) * s, 0.25 + Math.random() * 0.5, 0.035, 0.012, 3.2, 2.0 + hot * 1.2, 0.6 + hot * 1.0, 1.0, 0.8, 9.81, 0.35);
    }
  }

  emitSmoke(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, shade: number, alpha: number, life = 2.5): void {
    if (Math.random() > this.quality + 0.2) return;
    this.smoke.emit(x, y, z, vx + (Math.random() - 0.5) * 0.6, vy + 0.4 + Math.random() * 0.4, vz + (Math.random() - 0.5) * 0.6, life * (0.7 + Math.random() * 0.6), size * 0.5, size * 2.2, shade, shade, shade * 1.02, alpha, 0.9, -0.15, 0, Math.random() * 6, (Math.random() - 0.5) * 0.8);
  }

  emitDust(x: number, y: number, z: number, count: number, color: [number, number, number] = [0.55, 0.47, 0.36], speed = 2, size = 1.2): void {
    count = Math.ceil(count * this.quality);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * Math.random();
      this.dust.emit(x, y + 0.1, z, Math.cos(a) * s, 0.3 + Math.random() * speed * 0.5, Math.sin(a) * s, 1.5 + Math.random() * 2, size * 0.4, size * 2.2, color[0], color[1], color[2], 0.35, 1.2, -0.05, 0, Math.random() * 6, (Math.random() - 0.5));
    }
  }

  emitFire(x: number, y: number, z: number, intensity: number): void {
    const n = Math.ceil(intensity * 2 * this.quality);
    for (let i = 0; i < n; i++) {
      this.fire.emit(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.5, 0.5, 0.15, 1, 0.75, 0.45, 0.9, 1.0, -1.0, 0, Math.random() * 6, (Math.random() - 0.5) * 2);
    }
    if (Math.random() < 0.6) this.emitSmoke(x, y + 1, z, 0, 1.2, 0, 1.2, 0.12, 0.55, 3.5);
  }

  emitDebris(x: number, y: number, z: number, vx: number, vy: number, vz: number, count: number, color: THREE.Color, size = 0.12): void {
    count = Math.ceil(count * this.quality);
    for (let i = 0; i < count; i++) {
      this.debris.emit(x, y, z, vx * 0.5 + (Math.random() - 0.5) * 5, vy * 0.3 + Math.random() * 4, vz * 0.5 + (Math.random() - 0.5) * 5, size * (0.5 + Math.random()), color, 18);
    }
  }

  emitGlass(x: number, y: number, z: number, vx: number, vy: number, vz: number, count: number, spread = 1.0): void {
    count = Math.ceil(count * this.quality);
    for (let i = 0; i < count; i++) {
      this.glass.emit(
        x + (Math.random() - 0.5) * spread,
        y + (Math.random() - 0.5) * spread * 0.4,
        z + (Math.random() - 0.5) * spread,
        vx * 0.6 + (Math.random() - 0.5) * 4,
        vy * 0.3 + Math.random() * 3,
        vz * 0.6 + (Math.random() - 0.5) * 4,
        0.03 + Math.random() * 0.05,
        null,
        20,
      );
    }
  }

  update(dt: number, fog: THREE.Fog | null, light: THREE.Color): void {
    this.sparks.update(dt, this.terrain, fog);
    this.smoke.setLight(light);
    this.dust.setLight(light);
    this.smoke.update(dt, this.terrain, fog);
    this.dust.update(dt, this.terrain, fog);
    this.fire.update(dt, this.terrain, fog);
    this.debris.update(dt, this.terrain);
    this.glass.update(dt, this.terrain);
  }
}
