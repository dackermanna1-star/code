/**
 * Precipitation: a top-down "rain heightmap" around the camera (highest motion-blocking block
 * per column + precipitation type) and an instanced rain-streak / snowflake renderer that is
 * occluded by roofs and trees by sampling that heightmap in the vertex shader.
 *
 * The heightmap is toroidal: world column (x, z) lives at texel (x mod N, z mod N), so moving
 * the camera only requires refreshing columns, never shifting data.
 */
import * as THREE from 'three';
import { GLSL_COMMON } from '../shaders/common';
import { T_LIQUID, T_SOLID } from '../../world/blocks/registry';
import { BIOMES } from '../../world/biomes';

export const HM_SIZE = 128;

export const enum Precip {
  None = 0,
  Rain = 1,
  Snow = 2,
}

/** Column surface flags (stored in the G channel, upper bits). */
export const HM_WATER = 4;
export const HM_LAVA = 8;

/** Toroidal texel index of a world column. */
export function hmIndex(x: number, z: number, size = HM_SIZE): number {
  const tx = ((x % size) + size) % size;
  const tz = ((z % size) + size) % size;
  return tz * size + tx;
}

/** Minimal world access for the heightmap. */
export interface PrecipWorld {
  getBlock(x: number, y: number, z: number): number;
  getChunk(cx: number, cz: number): { heightmap: Int16Array; biomes: Uint8Array; blocks: (Uint16Array | null)[] } | undefined;
}

/**
 * Height (y of the top face) of the highest block that stops rain (solid or liquid) in a
 * column; 0 if none / unloaded. Blocks above the chunk light heightmap that don't block light
 * (glass, slabs, fences...) are found by scanning down from the top non-empty section.
 */
export function rainHeight(world: PrecipWorld, x: number, z: number): number {
  const c = world.getChunk(x >> 4, z >> 4);
  if (!c) return 0;
  const lx = x & 15, lz = z & 15;
  const hm = c.heightmap[lz * 16 + lx];
  let top = 0;
  for (let sy = c.blocks.length - 1; sy >= 0; sy--) if (c.blocks[sy]) { top = sy * 16 + 15; break; }
  for (let y = top; y >= hm && y >= 0; y--) {
    const sec = c.blocks[y >> 4];
    if (!sec) { y = (y & ~15); continue; }
    const st = sec[((y & 15) << 8) | (lz << 4) | lx];
    if (st && (T_SOLID[st >>> 4] || T_LIQUID[st >>> 4])) return y + 1;
  }
  return hm;
}

/** Minecraft precipitation at a height: biome type + altitude cooling (snow above the line). */
export function precipitationAt(biomeId: number, y: number): Precip {
  const b = BIOMES[biomeId];
  if (!b || b.precipitation === 'none' || b.dimension !== 'overworld') return Precip.None;
  if (b.precipitation === 'snow') return Precip.Snow;
  const t = b.temperature - Math.max(0, y - 80) * (0.05 / 40) * 1.0;
  return t < 0.15 ? Precip.Snow : Precip.Rain;
}

/** Rain heightmap around the camera (CPU array + GPU texture). */
export class RainHeightmap {
  readonly size = HM_SIZE;
  /** RGBA8: R = height (0..255), G = precip | flags, B/A unused. */
  readonly data = new Uint8Array(HM_SIZE * HM_SIZE * 4);
  readonly texture: THREE.DataTexture;
  private row = 0;
  private cx = 0;
  private cz = 0;

  constructor() {
    this.texture = new THREE.DataTexture(this.data, HM_SIZE, HM_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  /** Refreshes `rows` rows of the window centred on (camX, camZ). */
  update(world: PrecipWorld, camX: number, camZ: number, rows = 16) {
    const N = this.size;
    const cx = Math.floor(camX), cz = Math.floor(camZ);
    // big jump: refresh everything
    if (Math.abs(cx - this.cx) > N / 4 || Math.abs(cz - this.cz) > N / 4) rows = N;
    this.cx = cx; this.cz = cz;
    const x0 = cx - N / 2, z0 = cz - N / 2;
    for (let r = 0; r < rows; r++) {
      const z = z0 + ((this.row + r) % N);
      for (let x = x0; x < x0 + N; x++) this.writeColumn(world, x, z);
    }
    this.row = (this.row + rows) % N;
    this.texture.needsUpdate = true;
  }

  /** Immediate refresh of one column (block changes). */
  writeColumn(world: PrecipWorld, x: number, z: number) {
    const i = hmIndex(x, z, this.size) * 4;
    const h = rainHeight(world, x, z);
    const c = world.getChunk(x >> 4, z >> 4);
    const biome = c ? c.biomes[(z & 15) * 16 + (x & 15)] : 0;
    let flags = c ? precipitationAt(biome, h) : Precip.None;
    if (h > 0) {
      const top = world.getBlock(x, h - 1, z);
      const liq = top ? T_LIQUID[top >>> 4] : 0;
      if (liq === 1) flags |= HM_WATER;
      else if (liq === 2) flags |= HM_LAVA;
    }
    this.data[i] = Math.min(255, h);
    this.data[i + 1] = flags;
  }

  height(x: number, z: number): number {
    return this.data[hmIndex(x, z, this.size) * 4];
  }
  flags(x: number, z: number): number {
    return this.data[hmIndex(x, z, this.size) * 4 + 1];
  }
  /** Is a world point exposed to precipitation (above the column's rain height)? */
  exposed(x: number, y: number, z: number): boolean {
    return y >= this.height(Math.floor(x), Math.floor(z));
  }

  dispose() {
    this.texture.dispose();
  }
}

// ------------------------------------------------------------------------------- renderer
const VERT = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
in vec3 position;
in vec4 a_seed;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D u_hm;
uniform vec3 u_cam;
uniform float u_time;
uniform float u_amount;
uniform vec2 u_wind;
uniform float u_box;
uniform float u_height;
out vec2 v_uv;
out float v_alpha;
flat out int v_snow;
out float v_dist;
void main() {
  v_uv = position.xy * 0.5 + 0.5;
  v_alpha = 0.0;
  v_snow = 0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (a_seed.w > u_amount) return;
  // column position wrapped around the camera
  vec2 base = (a_seed.xy - 0.5) * u_box;
  vec2 p = u_cam.xz + mod(base - u_cam.xz + u_box * 0.5, u_box) - u_box * 0.5;
  ivec2 cell = ivec2(floor(p));
  ivec2 t = ivec2(mod(vec2(cell), 128.0));
  vec4 hm = texelFetch(u_hm, t, 0);
  float h = hm.r * 255.0;
  int fl = int(hm.g * 255.0 + 0.5) & 3;
  if (fl == 0) return;
  bool snow = fl == 2;
  float speed = snow ? 1.6 + a_seed.z * 0.8 : 13.0 + a_seed.z * 4.0;
  float top = u_cam.y + u_height * 0.5;
  float y = top - mod(u_time * speed + a_seed.z * 97.0 * u_height, u_height);
  if (y < h) return; // under a roof / below the surface
  vec3 wp = vec3(p.x, y, p.y);
  if (snow) {
    wp.x += sin(u_time * 0.9 + a_seed.x * 40.0) * 0.35;
    wp.z += cos(u_time * 0.7 + a_seed.y * 40.0) * 0.35;
  }
  vec3 vel = snow ? vec3(u_wind.x * 0.6, -speed, u_wind.y * 0.6) : vec3(u_wind.x, -speed, u_wind.y);
  wp.xz += vel.xz * (top - y) / speed * 0.5;
  vec3 rel = wp - u_cam;
  float dist = length(rel);
  vec3 toCam = -rel / max(dist, 1e-3);
  vec3 off;
  if (snow) {
    vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-4));
    vec3 U = cross(toCam, R);
    float s = 0.045 + 0.03 * a_seed.x;
    off = (R * position.x + U * position.y) * s;
  } else {
    vec3 U = normalize(vel);
    vec3 R = normalize(cross(U, toCam) + vec3(1e-4));
    float w = 0.012 + 0.004 * dist * 0.05;
    off = R * position.x * w + U * position.y * 0.32;
  }
  vec3 vp = mat3(viewMatrix) * (rel + off);
  gl_Position = projectionMatrix * vec4(vp, 1.0);
  v_dist = dist;
  v_snow = snow ? 1 : 0;
  // fade near the ground, near the camera and at the box edge
  float fade = smoothstep(0.0, 0.6, y - h) * smoothstep(0.25, 1.5, dist) * (1.0 - smoothstep(u_box * 0.35, u_box * 0.5, length(p - u_cam.xz)));
  v_alpha = fade;
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
uniform vec3 u_sh[9];
uniform vec3 u_lightColor;
uniform vec3 u_lightDir;
uniform float u_skyLightScale;
uniform sampler2D u_linDepth;
uniform vec2 u_resolution;
uniform vec3 u_flash;
in vec2 v_uv;
in float v_alpha;
flat in int v_snow;
in float v_dist;
out vec4 o;
void main() {
  if (v_alpha <= 0.001) discard;
  float scene = texture(u_linDepth, gl_FragCoord.xy / u_resolution).r;
  if (scene < v_dist) discard;
  vec2 c = v_uv * 2.0 - 1.0;
  vec3 sky = shIrradiance(vec3(0.0, 1.0, 0.0), u_sh) / PI * u_skyLightScale;
  vec3 col;
  float a;
  if (v_snow == 1) {
    float d = length(c);
    a = smoothstep(1.0, 0.3, d) * 0.85;
    col = vec3(0.95, 0.97, 1.0) * (sky * 1.1 + u_lightColor * max(u_lightDir.y, 0.0) * 0.25 / PI + u_flash * 0.3);
  } else {
    float w = exp(-c.x * c.x * 3.0) * smoothstep(1.0, 0.6, abs(c.y));
    a = w * 0.32;
    // refraction-like brightening: drops transmit the bright sky
    col = vec3(0.75, 0.82, 0.92) * (sky * 1.6 + u_lightColor * 0.02 + u_flash * 0.4);
  }
  a *= v_alpha;
  o = vec4(col * a, a);
}
`;

export class PrecipRenderer {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly count: number;

  constructor(hm: RainHeightmap, lightUniforms: Record<string, THREE.IUniform>, terrainUniforms: Record<string, THREE.IUniform>, count = 9000) {
    this.count = count;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random();
    }
    g.setAttribute('a_seed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.uniforms = {
      u_hm: { value: hm.texture },
      u_cam: { value: new THREE.Vector3() },
      u_time: { value: 0 },
      u_amount: { value: 0 },
      u_wind: { value: new THREE.Vector2(1.2, 0.5) },
      u_box: { value: 44 },
      u_height: { value: 36 },
      u_flash: { value: new THREE.Vector3() },
      u_sh: lightUniforms.u_sh,
      u_lightColor: lightUniforms.u_lightColor,
      u_lightDir: lightUniforms.u_lightDir,
      u_skyLightScale: lightUniforms.u_skyLightScale,
      u_resolution: terrainUniforms.u_resolution,
      u_linDepth: { value: null },
    };
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  update(cam: THREE.Vector3, time: number, amount: number, linDepth: THREE.Texture) {
    (this.uniforms.u_cam.value as THREE.Vector3).copy(cam);
    this.uniforms.u_time.value = time % 3600;
    this.uniforms.u_amount.value = amount;
    this.uniforms.u_linDepth.value = linDepth;
    this.mesh.visible = amount > 0.005;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
