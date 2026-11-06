// Pool of small lit cubes (blood droplets, gore gibs, debris, splinters, glass shards, shell casings) drawn with
// ONE InstancedMesh. CPU physics with voxel collision (world.isSolid), no allocations per frame.
import * as THREE from 'three';
import { LIGHTING_GLSL, globalUniforms } from '../../render/materials.js';

export const CK = { DEBRIS: 0, BLOOD: 1, GORE: 2, SHELL: 3, GLASS: 4, SPLINTER: 5, LEAF: 6 };

const VERT = /* glsl */ `
in vec3 aColor;
in vec4 aColor2;
in vec3 aLight;
out vec3 vColor;
out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vLight;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vColor = (position.y + 0.5 < aColor2.w) ? aColor2.rgb : aColor;
  vLight = aLight;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec3 vColor;
in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vLight;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 lit = computeLighting(vWorldPos, n, vLight.x, vLight.y, 1.0);
  vec3 col = vColor * lit;
  // glossy kinds (wet blood, brass, glass): cheap sun / flash glint
  if (vLight.z > 0.0) {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 H = normalize(V + uSunDir);
    float sp = pow(max(dot(n, H), 0.0), 24.0) * vLight.z;
    col += uSunColor * sp * smoothstep(0.5, 0.95, vLight.x);
    if (uFlashOn > 0.0) col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, V), 0.0), 16.0) * vLight.z * 0.6 * uFlashOn * clamp(1.0 - length(uFlashPos - vWorldPos) / uFlashRange, 0.0, 1.0);
  }
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, 1.0);
}
`;

const FIELDS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'sx', 'sy', 'sz', 'life', 'age', 'grav', 'bounce', 'drag', 'r', 'g', 'b', 'gloss'];

export class CubeParticles {
  constructor(scene, max = 1500) {
    this.max = max;
    this.n = 0;
    for (const f of FIELDS) this[f] = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.rest = new Uint8Array(max);
    this.hits = new Uint8Array(max);
    this.cursor = 0;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.colAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.col2Attr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.lightAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    for (const a of [this.colAttr, this.col2Attr, this.lightAttr]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aColor2', this.col2Attr);
    geo.setAttribute('aLight', this.lightAttr);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...globalUniforms },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx_cubes';
    scene.add(this.mesh);
    this.onHit = null; // (i, x, y, z, nx, ny, nz) → return true to kill the particle
  }

  /** Spawn a particle; returns its index. Oldest particles are recycled when the pool is full. */
  spawn(kind, x, y, z, vx, vy, vz, sx, sy, sz, r, g, b, life, o = null) {
    let i;
    if (this.n < this.max) i = this.n++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.max; }
    this.kind[i] = kind; this.rest[i] = 0; this.hits[i] = 0;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.rx[i] = Math.random() * 6.28; this.ry[i] = Math.random() * 6.28; this.rz[i] = Math.random() * 6.28;
    const spin = o && o.spin !== undefined ? o.spin : 8;
    this.wx[i] = (Math.random() - 0.5) * spin; this.wy[i] = (Math.random() - 0.5) * spin; this.wz[i] = (Math.random() - 0.5) * spin;
    this.sx[i] = sx; this.sy[i] = sy; this.sz[i] = sz;
    this.life[i] = life; this.age[i] = 0;
    this.grav[i] = o && o.grav !== undefined ? o.grav : 1;
    this.bounce[i] = o && o.bounce !== undefined ? o.bounce : 0.3;
    this.drag[i] = o && o.drag !== undefined ? o.drag : 0.4;
    this.gloss[i] = o && o.gloss !== undefined ? o.gloss : 0;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
    const c2 = this.col2Attr.array;
    if (o && o.color2) { c2[i * 4] = o.color2[0]; c2[i * 4 + 1] = o.color2[1]; c2[i * 4 + 2] = o.color2[2]; c2[i * 4 + 3] = o.split ?? 0.3; }
    else c2[i * 4 + 3] = -1;
    const la = this.lightAttr.array;
    la[i * 3] = o && o.sky !== undefined ? o.sky : 1;
    la[i * 3 + 1] = o && o.block !== undefined ? o.block : 0;
    la[i * 3 + 2] = this.gloss[i];
    const ca = this.colAttr.array;
    ca[i * 3] = r; ca[i * 3 + 1] = g; ca[i * 3 + 2] = b;
    return i;
  }

  _kill(i) {
    const j = --this.n;
    if (i !== j) {
      for (const f of FIELDS) this[f][i] = this[f][j];
      this.kind[i] = this.kind[j]; this.rest[i] = this.rest[j]; this.hits[i] = this.hits[j];
      const c = this.colAttr.array, c2 = this.col2Attr.array, l = this.lightAttr.array;
      c[i * 3] = c[j * 3]; c[i * 3 + 1] = c[j * 3 + 1]; c[i * 3 + 2] = c[j * 3 + 2];
      for (let k = 0; k < 4; k++) c2[i * 4 + k] = c2[j * 4 + k];
      for (let k = 0; k < 3; k++) l[i * 3 + k] = l[j * 3 + k];
    }
    if (this.cursor >= this.n) this.cursor = 0;
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  update(dt, world) {
    const solid = world ? (x, y, z) => world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z)) : (x, y) => y < 0;
    const G = -15;
    const m = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const age = this.age[i], life = this.life[i];
      if (age >= life) { this._kill(i); i--; continue; }
      if (!this.rest[i]) {
        let vx = this.vx[i], vy = this.vy[i] + G * this.grav[i] * dt, vz = this.vz[i];
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        vx *= dr; vy *= dr; vz *= dr;
        const ox = this.px[i], oy = this.py[i], oz = this.pz[i];
        const hy = this.sy[i] * 0.5;
        let nx = ox + vx * dt, ny = oy + vy * dt, nz = oz + vz * dt;
        let hit = 0, hnx = 0, hny = 0, hnz = 0, cx = 0, cy = 0, cz = 0;
        if (solid(nx, ny - hy, nz)) {
          const bo = this.bounce[i];
          if (solid(ox, oy - hy, oz)) {
            // started inside a block: pop out on top
            ny = Math.floor(oy - hy) + 1 + hy; vy = 0; hit = 1; hny = 1; cx = nx; cy = ny - hy; cz = nz;
          } else if (solid(ox, ny - hy, oz)) {
            hit = 1;
            if (vy <= 0) { hny = 1; cy = Math.floor(ny - hy) + 1; ny = cy + hy + 0.001; }
            else { hny = -1; cy = Math.floor(ny - hy); ny = oy; }
            cx = nx; cz = nz;
            vy = -vy * bo;
            vx *= 0.55; vz *= 0.55; // friction
            this.wx[i] *= 0.5; this.wy[i] *= 0.5; this.wz[i] *= 0.5;
          } else if (solid(nx, oy - hy, oz)) {
            hit = 1; hnx = vx > 0 ? -1 : 1;
            cx = vx > 0 ? Math.floor(nx) : Math.floor(nx) + 1; cy = oy; cz = nz;
            nx = ox; vx = -vx * bo; vy *= 0.7; vz *= 0.7;
          } else {
            hit = 1; hnz = vz > 0 ? -1 : 1;
            cz = vz > 0 ? Math.floor(nz) : Math.floor(nz) + 1; cx = nx; cy = oy;
            nz = oz; vz = -vz * bo; vx *= 0.7; vy *= 0.7;
          }
        }
        this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
        this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
        if (hit) {
          this.hits[i]++;
          if (this.onHit && this.onHit(i, cx, cy, cz, hnx, hny, hnz)) { this._kill(i); i--; continue; }
          if (hny > 0 && Math.abs(vy) < 0.7 && vx * vx + vz * vz < 0.08) {
            this.rest[i] = 1;
            this.rx[i] = 0; this.rz[i] = 0; // lie flat (keep yaw)
            this.py[i] = cy + hy;
          }
        }
        this.rx[i] += this.wx[i] * dt; this.ry[i] += this.wy[i] * dt; this.rz[i] += this.wz[i] * dt;
      }
      // shrink out at end of life
      const fade = Math.min(1, (life - age) / Math.min(0.5, life * 0.3));
      this._writeMatrix(m, i, fade);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.n) {
      this.colAttr.needsUpdate = true;
      this.col2Attr.needsUpdate = true;
      this.lightAttr.needsUpdate = true;
    }
  }

  _writeMatrix(m, i, k) {
    const a = this.rx[i], b = this.ry[i], c = this.rz[i];
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    // R = Ry(b) * Rx(a) * Rz(c)
    const r00 = cb * cc + sb * sa * sc, r01 = -cb * sc + sb * sa * cc, r02 = sb * ca;
    const r10 = ca * sc, r11 = ca * cc, r12 = -sa;
    const r20 = -sb * cc + cb * sa * sc, r21 = sb * sc + cb * sa * cc, r22 = cb * ca;
    const sx = this.sx[i] * k, sy = this.sy[i] * k, sz = this.sz[i] * k;
    const o = i * 16;
    m[o] = r00 * sx; m[o + 1] = r10 * sx; m[o + 2] = r20 * sx; m[o + 3] = 0;
    m[o + 4] = r01 * sy; m[o + 5] = r11 * sy; m[o + 6] = r21 * sy; m[o + 7] = 0;
    m[o + 8] = r02 * sz; m[o + 9] = r12 * sz; m[o + 10] = r22 * sz; m[o + 11] = 0;
    m[o + 12] = this.px[i]; m[o + 13] = this.py[i]; m[o + 14] = this.pz[i]; m[o + 15] = 1;
  }
}
