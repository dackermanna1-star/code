// Skid marks: ring buffer of quads laid along sliding tire contact paths.

import * as THREE from 'three';

const MAX = 6000;

interface Trail {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  active: boolean;
}

export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;
  private trails = new Map<string, Trail>();

  constructor() {
    this.pos = new Float32Array(MAX * 4 * 3);
    this.alpha = new Float32Array(MAX * 4);
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) {
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(0.03, 0.03, 0.03, vA); }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Add a mark segment for a wheel (key) at the contact point; call each frame. */
  add(key: string, x: number, y: number, z: number, dirx: number, dirz: number, width: number, intensity: number): void {
    const t = this.trails.get(key);
    const nx = -dirz, nz = dirx;
    const hw = width / 2;
    if (!t || !t.active) {
      this.trails.set(key, { x, y, z, nx, ny: 0, nz, active: true });
      return;
    }
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < 0.15) return;
    if (d > 3) {
      t.x = x; t.y = y; t.z = z; t.nx = nx; t.nz = nz;
      return;
    }
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const p = this.pos;
    const o = i * 12;
    const a = Math.min(0.85, intensity);
    p[o] = t.x + t.nx * hw; p[o + 1] = t.y + 0.025; p[o + 2] = t.z + t.nz * hw;
    p[o + 3] = t.x - t.nx * hw; p[o + 4] = t.y + 0.025; p[o + 5] = t.z - t.nz * hw;
    p[o + 6] = x - nx * hw; p[o + 7] = y + 0.025; p[o + 8] = z - nz * hw;
    p[o + 9] = x + nx * hw; p[o + 10] = y + 0.025; p[o + 11] = z + nz * hw;
    this.alpha[i * 4] = this.alpha[i * 4 + 1] = this.alpha[i * 4 + 2] = this.alpha[i * 4 + 3] = a;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    t.x = x; t.y = y; t.z = z; t.nx = nx; t.nz = nz;
  }

  end(key: string): void {
    const t = this.trails.get(key);
    if (t) t.active = false;
  }

  clear(): void {
    this.pos.fill(0);
    this.alpha.fill(0);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    this.trails.clear();
  }
}
