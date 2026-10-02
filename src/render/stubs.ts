/**
 * Minimal fallback implementations of the material set and the atmosphere, used until/unless
 * the full modules are available (and as a low-end fallback).
 */
import * as THREE from 'three';
import { TEXTURE_NAMES } from './materials/textureList';
import { FULLSCREEN_VERT, FullscreenPass } from './post/fullscreen';
import type { AtmosphereLike, BlockMaterialSet, SkyParams } from './types';

const COLORS: [RegExp, number][] = [
  [/grass_block_top|short_grass|fern|tall_grass|grass_tuft|leaves|vine|sugar_cane|lily/, 0xb0b0b0],
  [/grass_block_side/, 0x866043],
  [/dirt|farmland|podzol|coarse|mud/, 0x866043],
  [/sand(?!stone)/, 0xdbd3a0],
  [/sandstone/, 0xd8cb9b],
  [/gravel/, 0x837e7d],
  [/cobble/, 0x7a7a7a],
  [/deepslate/, 0x4d4d52],
  [/stone|andesite|tuff/, 0x7d7d7d],
  [/granite/, 0x9a6b5a],
  [/diorite|calcite|quartz/, 0xbdbdbd],
  [/oak_log|spruce_log|jungle_log|acacia_log|dark_oak_log|birch_log|cherry_log/, 0x6d5532],
  [/planks|crafting|chest|bookshelf|door|trapdoor|ladder|barrel/, 0xa2834f],
  [/water/, 0xe0e0e0],
  [/lava|magma|fire|glowstone|shroomlight|lantern|torch/, 0xff8a20],
  [/snow/, 0xf0f4ff],
  [/ice/, 0xa0c0ff],
  [/glass/, 0xffffff],
  [/netherrack|nether/, 0x6f3534],
  [/end_stone|end_/, 0xdbde9e],
  [/obsidian/, 0x140f20],
  [/wool|concrete|terracotta|bed/, 0xe8e8e8],
  [/bedrock/, 0x3a3a3a],
  [/iron/, 0xd8d8d8],
  [/gold/, 0xf5d040],
  [/diamond/, 0x60e0e0],
  [/redstone/, 0xc01010],
];

export async function generateStubMaterials(renderer: THREE.WebGLRenderer, size = 16): Promise<BlockMaterialSet> {
  const n = TEXTURE_NAMES.length;
  const alb = new Uint8Array(size * size * 4 * n);
  const nrm = new Uint8Array(size * size * 4 * n);
  const props = new Uint8Array(n * 4);
  for (let l = 0; l < n; l++) {
    const name = TEXTURE_NAMES[l];
    let c = 0xff00ff;
    for (const [re, col] of COLORS) if (re.test(name)) { c = col; break; }
    const cutout = /leaves|grass(?!_block)|fern|flower|tulip|poppy|dandelion|sapling|torch|fluff|tuft|wheat|carrots|potatoes|beetroots|vine|sugar|bush|mushroom|rail|redstone_dust|fire|glass|door|trapdoor|ladder|lily|cobweb|kelp|seagrass/.test(name);
    const emissive = /lava|magma|glowstone|shroomlight|sea_lantern|fire|torch|lit|_on|lamp_on|portal/.test(name);
    props[l * 4 + 1] = emissive ? 255 : 0;
    props[l * 4 + 3] = /leaves|grass|fern|plant|flower|tuft|fluff|vine/.test(name) ? 200 : 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = ((l * size + y) * size + x) * 4;
        const h = Math.sin(x * 12.9898 + y * 78.233 + l * 3.1) * 43758.5453;
        const nz = h - Math.floor(h);
        const v = 0.85 + nz * 0.3;
        alb[i] = Math.min(255, ((c >> 16) & 255) * v);
        alb[i + 1] = Math.min(255, ((c >> 8) & 255) * v);
        alb[i + 2] = Math.min(255, (c & 255) * v);
        let a = 255;
        if (cutout) a = name.includes('glass') ? (x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 220 : 30) : nz > 0.35 ? 255 : 0;
        if (name === 'grass_block_side') a = y > size * 0.8 ? 255 : 0;
        if (name === 'grass_block_side' && y > size * 0.8) { alb[i] = 170; alb[i + 1] = 170; alb[i + 2] = 170; }
        alb[i + 3] = a;
        nrm[i] = 128; nrm[i + 1] = 128; nrm[i + 2] = 255; nrm[i + 3] = 200;
      }
  }
  const mk = (data: Uint8Array) => {
    const t = new THREE.DataArrayTexture(data, size, size, n);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  const p = new THREE.DataTexture(props, n, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  p.needsUpdate = true;
  void renderer;
  return { albedo: mk(alb), normal: mk(nrm), props: p, size, layerCount: n };
}

// ------------------------------------------------------------------------------------------
const STUB_SKY_GLSL = /* glsl */ `
uniform vec3 atmo_sunDir;
uniform vec3 atmo_zenith;
uniform vec3 atmo_horizon;
uniform vec3 atmo_sunColor;
uniform float atmo_renderDist;
uniform float atmo_fogDensity;
vec3 atmo_skyRadiance(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  vec3 c = mix(atmo_horizon, atmo_zenith, pow(max(h, 0.0), 0.45));
  c = mix(c, atmo_horizon * 0.5, clamp(-h * 4.0, 0.0, 1.0));
  float mu = max(dot(d, atmo_sunDir), 0.0);
  c += atmo_sunColor * (pow(mu, 8.0) * 0.08 + pow(mu, 64.0) * 0.25);
  return c;
}
vec3 atmo_skyRadianceWithClouds(vec3 d) { return atmo_skyRadiance(d); }
vec3 atmo_applyFog(vec3 color, vec3 d, float dist) {
  float f = 1.0 - exp(-dist * atmo_fogDensity);
  float edge = smoothstep(atmo_renderDist * 0.75, atmo_renderDist, dist);
  vec3 s = atmo_skyRadiance(normalize(vec3(d.x, max(d.y, 0.02), d.z)));
  return mix(color, s, clamp(f * 0.6 + edge, 0.0, 1.0));
}
float atmo_cloudShadow(vec3 p) { return 1.0; }
vec3 atmo_sunTransmittance(vec3 p) { return vec3(1.0); }
`;

export class StubAtmosphere implements AtmosphereLike {
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  readonly lightColor = new THREE.Color();
  readonly ambientSH: THREE.Vector3[] = Array.from({ length: 9 }, () => new THREE.Vector3());
  readonly fogColor = new THREE.Color();
  readonly uniforms: Record<string, THREE.IUniform> = {
    atmo_sunDir: { value: new THREE.Vector3(0, 1, 0) },
    atmo_zenith: { value: new THREE.Color() },
    atmo_horizon: { value: new THREE.Color() },
    atmo_sunColor: { value: new THREE.Color() },
    atmo_renderDist: { value: 128 },
    atmo_fogDensity: { value: 0.002 },
  };
  readonly glsl = STUB_SKY_GLSL;
  private pass: FullscreenPass;
  private skyUniforms: Record<string, THREE.IUniform>;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.skyUniforms = {
      ...this.uniforms,
      u_depth: { value: null },
      u_projInv: { value: new THREE.Matrix4() },
      u_viewInvRot: { value: new THREE.Matrix3() },
    };
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: `precision highp float;\n${STUB_SKY_GLSL}\nuniform sampler2D u_depth; uniform mat4 u_projInv; uniform mat3 u_viewInvRot; in vec2 v_uv; out vec4 o;
      void main(){ float d = texture(u_depth, v_uv).r; if (d < 1.0) discard; vec4 p = u_projInv * vec4(v_uv*2.0-1.0, 1.0, 1.0); vec3 dir = normalize(u_viewInvRot * (p.xyz/p.w));
      vec3 c = atmo_skyRadiance(dir); float mu = dot(dir, atmo_sunDir); c += atmo_sunColor * smoothstep(0.9995, 0.9998, mu) * 40.0; o = vec4(c, 1.0); }`,
      uniforms: this.skyUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.pass = new FullscreenPass(mat);
  }

  update(p: SkyParams, camera: THREE.PerspectiveCamera) {
    const sun = p.sunDir;
    const day = THREE.MathUtils.smoothstep(sun.y, -0.12, 0.25);
    const warm = 1 - THREE.MathUtils.smoothstep(sun.y, 0.0, 0.45);
    const z = new THREE.Color(0.18, 0.38, 0.85).multiplyScalar(1.2 * day + 0.004);
    const h = new THREE.Color(0.65, 0.78, 0.95).lerp(new THREE.Color(1.0, 0.55, 0.32), warm * day).multiplyScalar(1.5 * day + 0.006);
    (this.uniforms.atmo_zenith.value as THREE.Color).copy(z);
    (this.uniforms.atmo_horizon.value as THREE.Color).copy(h);
    const sunCol = new THREE.Color(1, 0.96, 0.9).lerp(new THREE.Color(1, 0.55, 0.25), warm).multiplyScalar(20 * THREE.MathUtils.smoothstep(sun.y, -0.05, 0.15));
    (this.uniforms.atmo_sunColor.value as THREE.Color).copy(sunCol).multiplyScalar(0.05);
    this.uniforms.atmo_sunDir.value.copy(sun);
    this.uniforms.atmo_renderDist.value = p.renderDistance;
    this.uniforms.atmo_fogDensity.value = 0.0025 + p.rain * 0.01;
    if (sun.y > -0.05) {
      this.lightDir.copy(sun);
      this.lightColor.copy(sunCol);
    } else {
      this.lightDir.copy(p.moonDir);
      this.lightColor.setRGB(0.06, 0.07, 0.1);
    }
    // SH: constant + up gradient
    const amb = new THREE.Color().copy(z).lerp(h, 0.5).multiplyScalar(Math.PI);
    this.ambientSH[0].set(amb.r, amb.g, amb.b);
    this.ambientSH[1].set(z.r * 0.8, z.g * 0.8, z.b * 0.8);
    for (let i = 2; i < 9; i++) this.ambientSH[i].set(0, 0, 0);
    this.fogColor.copy(h);
    this.skyUniforms.u_projInv.value.copy(camera.projectionMatrixInverse);
    this.skyUniforms.u_viewInvRot.value.setFromMatrix4(camera.matrixWorld);
  }

  render(target: THREE.WebGLRenderTarget, depthTexture: THREE.Texture) {
    this.skyUniforms.u_depth.value = depthTexture;
    this.pass.render(this.renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}
