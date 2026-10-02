/**
 * Distant terrain LOD ("distant horizons"): coarse heightfield tiles sampled from the world
 * generator in workers, rendered into the G-buffer beyond (and under) the loaded chunks.
 * Fragments are discarded where real chunk geometry exists (chunk mask texture).
 */
import * as THREE from 'three';
import { GLSL_COMMON } from './shaders/common';
import type { ChunkManager } from '../world/chunkManager';

const TILE = 64;
const STEP = 4;
const N = TILE / STEP + 1;
const MASK = 96; // chunks per side covered by the mask texture

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
in vec4 color;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 v_normal;
out vec4 v_color;
out vec3 v_world;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  v_world = wp.xyz;
  v_normal = normal;
  v_color = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform sampler2D u_mask;
uniform vec2 u_maskOrigin; // chunk coords of texel (0,0)
uniform float u_maskSize;
uniform float u_time;
in vec3 v_normal;
in vec4 v_color;
in vec3 v_world;
layout(location = 0) out vec4 g0;
layout(location = 1) out vec4 g1;
layout(location = 2) out vec4 g2;
layout(location = 3) out vec4 g3;
void main() {
  vec2 c = floor(v_world.xz / 16.0) - u_maskOrigin;
  if (c.x >= 0.0 && c.y >= 0.0 && c.x < u_maskSize && c.y < u_maskSize) {
    if (texture(u_mask, (c + 0.5) / u_maskSize).r > 0.5) discard;
  }
  float kind = floor(v_color.a * 255.0 + 0.5);
  vec3 albedo = srgbToLinear(v_color.rgb);
  vec3 N = normalize(v_normal);
  float rough = 0.92;
  float sss = 0.0;
  // break up flat colour with world-space noise (block-sized variation)
  float n1 = vnoise(v_world.xz * 0.9), n2 = vnoise(v_world.xz * 0.21);
  if (kind == 1.0) { // water
    rough = 0.06;
    vec2 g = vec2(sin(v_world.x * 0.35 + u_time * 0.8) + sin(v_world.z * 0.27 - u_time * 0.6), cos(v_world.z * 0.31 + u_time * 0.7)) * 0.02;
    N = normalize(vec3(g.x, 1.0, g.y));
  } else if (kind == 2.0) { // tree canopy
    albedo *= 0.7 + 0.6 * n1 * n2 + 0.15 * n1;
    rough = 0.85;
    sss = 0.5;
  } else {
    albedo *= 0.85 + 0.3 * n1;
  }
  g0 = vec4(sqrt(clamp(albedo, 0.0, 1.0)), sss);
  g1 = vec4(N, rough);
  g2 = vec4(0.0, 0.0, kind == 2.0 ? 0.75 : 0.95, kind == 2.0 ? 1.0 / 255.0 : 0.0);
  g3 = vec4(1.0, 0.0, 0.0, 0.0);
}`;

interface Tile {
  mesh: THREE.Mesh | null;
  pending: boolean;
}

export class LodTerrain {
  readonly scene = new THREE.Scene();
  private tiles = new Map<string, Tile>();
  private material: THREE.RawShaderMaterial;
  private maskData = new Uint8Array(MASK * MASK);
  private maskTex: THREE.DataTexture;
  private maskOrigin = new THREE.Vector2();
  private inflight = 0;
  outerRadius = 768;
  enabled = true;

  constructor() {
    this.maskTex = new THREE.DataTexture(this.maskData, MASK, MASK, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.minFilter = this.maskTex.magFilter = THREE.NearestFilter;
    this.maskTex.needsUpdate = true;
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { u_mask: { value: this.maskTex }, u_maskOrigin: { value: this.maskOrigin }, u_maskSize: { value: MASK }, u_time: { value: 0 } },
    });
    this.scene.matrixWorldAutoUpdate = true;
  }

  clear() {
    for (const t of this.tiles.values()) {
      if (t.mesh) {
        t.mesh.removeFromParent();
        t.mesh.geometry.dispose();
      }
    }
    this.tiles.clear();
  }

  /** Per frame: update mask and request/remove tiles around (px, pz). */
  update(cm: ChunkManager, px: number, pz: number, time: number) {
    this.material.uniforms.u_time.value = time;
    if (!this.enabled) {
      this.scene.visible = false;
      return;
    }
    this.scene.visible = true;
    // chunk mask
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const ox = pcx - MASK / 2, oz = pcz - MASK / 2;
    this.maskOrigin.set(ox, oz);
    let changed = false;
    for (let j = 0; j < MASK; j++)
      for (let i = 0; i < MASK; i++) {
        const v = cm.isChunkMeshed(ox + i, oz + j) ? 255 : 0;
        const idx = j * MASK + i;
        if (this.maskData[idx] !== v) { this.maskData[idx] = v; changed = true; }
      }
    if (changed) this.maskTex.needsUpdate = true;
    // tiles
    const R = this.outerRadius;
    const inner = Math.max(0, cm.renderDistance * 16 - TILE * 1.5);
    const tx0 = Math.floor((px - R) / TILE), tx1 = Math.floor((px + R) / TILE);
    const tz0 = Math.floor((pz - R) / TILE), tz1 = Math.floor((pz + R) / TILE);
    const want: [number, number, number][] = [];
    for (let tz = tz0; tz <= tz1; tz++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const cx = tx * TILE + TILE / 2, cz = tz * TILE + TILE / 2;
        const d = Math.hypot(cx - px, cz - pz);
        if (d > R || d < inner) continue;
        const key = `${tx},${tz}`;
        if (!this.tiles.has(key)) want.push([d, tx, tz]);
      }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, tx, tz] of want) {
      if (this.inflight >= 2 || !cm.genIdle) break;
      this.request(cm, tx, tz);
    }
    // drop far tiles
    for (const [key, t] of this.tiles) {
      const [tx, tz] = key.split(',').map(Number);
      const d = Math.hypot(tx * TILE + TILE / 2 - px, tz * TILE + TILE / 2 - pz);
      if (d > R + TILE * 2 || d < inner - TILE * 2) {
        if (t.mesh) { t.mesh.removeFromParent(); t.mesh.geometry.dispose(); }
        if (!t.pending) this.tiles.delete(key);
      }
    }
  }

  private request(cm: ChunkManager, tx: number, tz: number) {
    const key = `${tx},${tz}`;
    const tile: Tile = { mesh: null, pending: true };
    this.tiles.set(key, tile);
    this.inflight++;
    const x0 = tx * TILE, z0 = tz * TILE;
    cm.requestLod(x0, z0, N, STEP)
      .then((r) => {
        tile.pending = false;
        if (this.tiles.get(key) !== tile) return;
        tile.mesh = this.buildMesh(x0, z0, r.heights, r.colors, r.kinds);
        this.scene.add(tile.mesh);
      })
      .catch(() => this.tiles.delete(key))
      .finally(() => this.inflight--);
  }

  private buildMesh(x0: number, z0: number, h: Float32Array, col: Uint32Array, kinds: Uint8Array): THREE.Mesh {
    const pos = new Float32Array(N * N * 3);
    const nrm = new Float32Array(N * N * 3);
    const clr = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        pos[k * 3] = i * STEP;
        pos[k * 3 + 1] = h[k];
        pos[k * 3 + 2] = j * STEP;
        const hl = h[j * N + Math.max(0, i - 1)], hr = h[j * N + Math.min(N - 1, i + 1)];
        const hd = h[Math.max(0, j - 1) * N + i], hu = h[Math.min(N - 1, j + 1) * N + i];
        const nx = hl - hr, nz = hd - hu, ny = 2 * STEP;
        const l = Math.hypot(nx, ny, nz);
        nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
        clr[k * 4] = (col[k] >> 16) & 255;
        clr[k * 4 + 1] = (col[k] >> 8) & 255;
        clr[k * 4 + 2] = col[k] & 255;
        clr[k * 4 + 3] = kinds[k];
      }
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(clr, 4, true));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.position.set(x0, 0, z0);
    m.updateMatrixWorld();
    m.matrixAutoUpdate = false;
    return m;
  }
}
