// Particle system with two roles:
//  * material particles: voxels thrown by explosions/splashes/potions. They fly ballistically and are
//    re-inserted into the voxel grid where they land, so liquids and powders are conserved.
//  * visual particles: sparks, debris, trails, impact flashes (no world effect).
import * as THREE from 'three';
import { GRAVITY } from '../config';
import { VoxelWorld } from '../world/world';
import { AIR, KIND, Kind, MATERIALS, UNLOADED } from '../world/materials';
import { hexToRgb } from './materialTextures';

const MAX = 12000;

const MAT_RGB: [number, number, number][] = MATERIALS.map((m) => {
  const c = hexToRgb(m.colors[0]);
  return [c[0] / 255, c[1] / 255, c[2] / 255];
});

export class ParticleSystem {
  // structure of arrays
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private mat = new Uint8Array(MAX); // material carried (0 = visual only)
  private aux = new Uint8Array(MAX);
  private grav = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private cr = new Float32Array(MAX);
  private cg = new Float32Array(MAX);
  private cb = new Float32Array(MAX);
  private glow = new Uint8Array(MAX);
  private drag = new Float32Array(MAX);
  count = 0;
  materialCount = 0;

  readonly points: THREE.Points;
  readonly glowPoints: THREE.Points;
  private geo: THREE.BufferGeometry;
  private glowGeo: THREE.BufferGeometry;
  private posBuf = new Float32Array(MAX * 3);
  private colBuf = new Float32Array(MAX * 4);
  private sizeBuf = new Float32Array(MAX);
  private gPosBuf = new Float32Array(MAX * 3);
  private gColBuf = new Float32Array(MAX * 4);
  private gSizeBuf = new Float32Array(MAX);
  readonly material: THREE.ShaderMaterial;
  readonly glowMaterial: THREE.ShaderMaterial;

  constructor(private world: VoxelWorld, pointScale: { value: number }, fog: { uFogColor: { value: THREE.Color }; uFogDensity: { value: number } }) {
    const mk = (pos: Float32Array, col: Float32Array, size: Float32Array) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      return g;
    };
    this.geo = mk(this.posBuf, this.colBuf, this.sizeBuf);
    this.glowGeo = mk(this.gPosBuf, this.gColBuf, this.gSizeBuf);
    const vs = /* glsl */ `
      in vec4 pcolor; in float psize;
      uniform float uPointScale;
      out vec4 vCol; out vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float dz = -mv.z;
        gl_PointSize = clamp(uPointScale * psize / max(dz, 0.3), 1.0, 28.0);
        vCol = pcolor;
        vCol.a *= smoothstep(0.8, 3.0, dz); // fade particles right in front of the eye
      }`;
    const fs = (glowy: boolean) => /* glsl */ `
      precision highp float;
      in vec4 vCol; in vec3 vWorld;
      uniform vec3 uFogColor; uniform float uFogDensity;
      out vec4 outColor;
      void main() {
        vec3 c = vCol.rgb;
        ${glowy ? '' : 'float dist = length(vWorld - cameraPosition); float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist); c = mix(c, uFogColor, clamp(f, 0.0, 1.0));'}
        outColor = vec4(c, vCol.a);
      }`;
    const uniforms = { uPointScale: pointScale, uFogColor: fog.uFogColor, uFogDensity: fog.uFogDensity };
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: fs(false), uniforms, transparent: true, depthWrite: false });
    this.glowMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: fs(true), uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.glowPoints = new THREE.Points(this.glowGeo, this.glowMaterial);
    this.glowPoints.frustumCulled = false;
    this.glowPoints.renderOrder = 6;
  }

  private alloc(): number {
    if (this.count >= MAX) return -1;
    return this.count++;
  }

  /** Visual particle. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: [number, number, number], life: number, size = 0.35, gravity = 0.4, glow = false, drag = 0.5): void {
    const i = this.alloc();
    if (i < 0) return;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.mat[i] = 0; this.aux[i] = 0;
    this.grav[i] = gravity; this.size[i] = size; this.drag[i] = drag;
    this.cr[i] = color[0]; this.cg[i] = color[1]; this.cb[i] = color[2];
    this.glow[i] = glow ? 1 : 0;
  }

  /** Material particle: re-inserted into the world on landing. Returns false if the pool is full. */
  launch(m: number, aux: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): boolean {
    const i = this.alloc();
    if (i < 0) {
      // pool full: place directly so material is never lost
      this.settle(m, aux, x, y, z, 0, 1, 0);
      return false;
    }
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = 6; this.maxLife[i] = 6;
    this.mat[i] = m; this.aux[i] = aux;
    this.grav[i] = 1; this.size[i] = 0.9; this.drag[i] = 0.25;
    const c = MAT_RGB[m];
    const j = 0.85 + Math.random() * 0.3;
    this.cr[i] = c[0] * j; this.cg[i] = c[1] * j; this.cb[i] = c[2] * j;
    this.glow[i] = MATERIALS[m].glow && MATERIALS[m].glow! > 0.5 ? 1 : 0;
    this.materialCount++;
    return true;
  }

  matColor(m: number): [number, number, number] {
    return MAT_RGB[m];
  }

  /** Put material m at or near (x,y,z), searching back along the incoming direction. */
  private settle(m: number, aux: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): boolean {
    const w = this.world;
    const len = Math.hypot(dx, dy, dz) || 1;
    const bx = -dx / len, by = -dy / len, bz = -dz / len;
    for (let s = 0; s < 8; s++) {
      for (let k = 0; k < 7; k++) {
        const ox = k === 1 ? 1 : k === 2 ? -1 : 0;
        const oy = k === 5 ? 1 : k === 6 ? -1 : 0;
        const oz = k === 3 ? 1 : k === 4 ? -1 : 0;
        const tx = Math.floor(x + bx * s * 0.7) + ox, ty = Math.floor(y + by * s * 0.7) + oy + (s > 4 ? s - 4 : 0), tz = Math.floor(z + bz * s * 0.7) + oz;
        const cur = w.get(tx, ty, tz);
        if (cur === AIR || (KIND[cur] === Kind.GAS)) {
          w.set(tx, ty, tz, m);
          if (aux & 0x80) w.setAux(tx, ty, tz, aux);
          return true;
        }
      }
    }
    return false;
  }

  update(dt: number): void {
    const w = this.world;
    let i = 0;
    while (i < this.count) {
      let dead = false;
      this.life[i] -= dt;
      const m = this.mat[i];
      this.vy[i] -= GRAVITY * this.grav[i] * dt;
      const dk = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dk; this.vy[i] *= dk; this.vz[i] *= dk;
      const nx = this.px[i] + this.vx[i] * dt, ny = this.py[i] + this.vy[i] * dt, nz = this.pz[i] + this.vz[i] * dt;
      if (m !== 0) {
        // step through cells to find a landing spot
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - this.px[i]), Math.abs(ny - this.py[i]), Math.abs(nz - this.pz[i])) / 0.7));
        let lx = this.px[i], ly = this.py[i], lz = this.pz[i];
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const sx = this.px[i] + (nx - this.px[i]) * t, sy = this.py[i] + (ny - this.py[i]) * t, sz = this.pz[i] + (nz - this.pz[i]) * t;
          const cur = w.get(Math.floor(sx), Math.floor(sy), Math.floor(sz));
          const k = KIND[cur];
          if (cur === UNLOADED || k === Kind.SOLID || k === Kind.POWDER || k === Kind.LIQUID) {
            this.settle(m, this.aux[i], lx, ly, lz, this.vx[i], this.vy[i], this.vz[i]);
            dead = true;
            break;
          }
          lx = sx; ly = sy; lz = sz;
        }
        if (!dead && this.life[i] <= 0) {
          this.settle(m, this.aux[i], nx, ny, nz, 0, -1, 0);
          dead = true;
        }
      } else {
        if (this.life[i] <= 0) dead = true;
        else if (this.grav[i] > 0) {
          const cur = w.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
          if (KIND[cur] === Kind.SOLID || KIND[cur] === Kind.POWDER) {
            this.vx[i] *= -0.3; this.vy[i] *= -0.3; this.vz[i] *= -0.3;
          }
        }
      }
      if (dead) {
        if (m !== 0) this.materialCount--;
        this.kill(i);
        continue;
      }
      this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
      i++;
    }
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
    this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
    this.mat[i] = this.mat[last]; this.aux[i] = this.aux[last];
    this.grav[i] = this.grav[last]; this.size[i] = this.size[last]; this.drag[i] = this.drag[last];
    this.cr[i] = this.cr[last]; this.cg[i] = this.cg[last]; this.cb[i] = this.cb[last];
    this.glow[i] = this.glow[last];
  }

  /** Drop every material particle into the world immediately (e.g. before saving/restart). */
  flushMaterial(): void {
    for (let i = 0; i < this.count; i++) if (this.mat[i]) this.settle(this.mat[i], this.aux[i], this.px[i], this.py[i], this.pz[i], 0, -1, 0);
    this.count = 0;
    this.materialCount = 0;
  }

  clear(): void {
    this.count = 0;
    this.materialCount = 0;
  }

  /** Upload to GPU buffers. */
  sync(): void {
    let n = 0, g = 0;
    for (let i = 0; i < this.count; i++) {
      const a = this.mat[i] ? 1 : Math.min(1, this.life[i] / (this.maxLife[i] * 0.5));
      if (this.glow[i]) {
        this.gPosBuf[g * 3] = this.px[i]; this.gPosBuf[g * 3 + 1] = this.py[i]; this.gPosBuf[g * 3 + 2] = this.pz[i];
        this.gColBuf[g * 4] = this.cr[i]; this.gColBuf[g * 4 + 1] = this.cg[i]; this.gColBuf[g * 4 + 2] = this.cb[i]; this.gColBuf[g * 4 + 3] = a;
        this.gSizeBuf[g] = this.size[i];
        g++;
      } else {
        this.posBuf[n * 3] = this.px[i]; this.posBuf[n * 3 + 1] = this.py[i]; this.posBuf[n * 3 + 2] = this.pz[i];
        this.colBuf[n * 4] = this.cr[i]; this.colBuf[n * 4 + 1] = this.cg[i]; this.colBuf[n * 4 + 2] = this.cb[i]; this.colBuf[n * 4 + 3] = a;
        this.sizeBuf[n] = this.size[i];
        n++;
      }
    }
    for (const [geo, cnt] of [[this.geo, n], [this.glowGeo, g]] as [THREE.BufferGeometry, number][]) {
      geo.setDrawRange(0, cnt);
      for (const name of ['position', 'pcolor', 'psize']) {
        const at = geo.getAttribute(name) as THREE.BufferAttribute;
        at.needsUpdate = true;
        at.clearUpdateRanges();
        at.addUpdateRange(0, cnt * at.itemSize);
      }
    }
  }
}
