import * as THREE from 'three';
import { ATLAS_H, ATLAS_W, buildMaterialTextures } from './materialTextures';

export const MAX_LIGHTS = 40;
/** Pattern texels per voxel edge. */
export const SUB = 2;

export interface SharedUniforms {
  uAtlas: { value: THREE.DataTexture };
  uInfo: { value: THREE.DataTexture };
  uTime: { value: number };
  uLightPos: { value: THREE.Vector4[] };
  uLightCol: { value: THREE.Vector4[] };
  uLightCount: { value: number };
  uAmbient: { value: THREE.Color };
  uSkyAmbient: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
  uPointScale: { value: number };
  uFlash: { value: number };
  [k: string]: { value: unknown };
}

export function createSharedUniforms(): SharedUniforms {
  const tex = buildMaterialTextures();
  const atlas = new THREE.DataTexture(tex.atlas, ATLAS_W, ATLAS_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
  const info = new THREE.DataTexture(tex.info, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  info.magFilter = THREE.NearestFilter;
  info.minFilter = THREE.NearestFilter;
  info.needsUpdate = true;
  const lp: THREE.Vector4[] = [];
  const lc: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_LIGHTS; i++) {
    lp.push(new THREE.Vector4());
    lc.push(new THREE.Vector4());
  }
  return {
    uAtlas: { value: atlas },
    uInfo: { value: info },
    uTime: { value: 0 },
    uLightPos: { value: lp },
    uLightCol: { value: lc },
    uLightCount: { value: 0 },
    uAmbient: { value: new THREE.Color(0.3, 0.25, 0.2) },
    uSkyAmbient: { value: new THREE.Color(0.55, 0.42, 0.55) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.75, -0.5).normalize() },
    uSunCol: { value: new THREE.Color(0.75, 0.52, 0.5) },
    uFogColor: { value: new THREE.Color(0.02, 0.015, 0.012) },
    uFogDensity: { value: 0.012 },
    uPointScale: { value: 600 },
    uFlash: { value: 0 },
  };
}

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform sampler2D uInfo;
uniform float uTime;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightCount;
uniform vec3 uAmbient;
uniform vec3 uSkyAmbient;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFlash;

uint hash3u(uvec3 v) {
  uint h = v.x * 0x8da6b343u ^ v.y * 0xd8163841u ^ v.z * 0xcb1ab31fu;
  h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15;
  return h;
}

vec3 dynLight(vec3 p, vec3 n, bool useNormal) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 L = uLightPos[i].xyz - p;
    float r = uLightPos[i].w;
    float d2 = dot(L, L);
    if (d2 > r * r) continue;
    float d = sqrt(d2);
    float att = 1.0 - d / r;
    att *= att;
    float nd = useNormal ? max(dot(n, L / max(d, 0.001)), 0.0) * 0.8 + 0.2 : 1.0;
    acc += uLightCol[i].rgb * att * nd;
  }
  return acc;
}

vec3 applyFog(vec3 c, vec3 wp) {
  float dist = length(wp - cameraPosition);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  return mix(c, uFogColor, clamp(f, 0.0, 1.0));
}
`;

const VOXEL_VS = /* glsl */ `
in vec2 vinfo;
out vec3 vWorld;
out float vAO;
out float vSky;
flat out int vMat;
flat out int vNormal;
void main() {
  int pk = int(vinfo.x + 0.5);
  vNormal = pk & 7;
  vAO = float((pk >> 3) & 3) / 3.0;
  vSky = float((pk >> 5) & 1);
  vMat = int(vinfo.y + 0.5);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const VOXEL_FS = /* glsl */ `
${COMMON}
in vec3 vWorld;
in float vAO;
in float vSky;
flat in int vMat;
flat in int vNormal;
uniform float uTranslucent;
out vec4 outColor;
const vec3 NORMALS[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
void main() {
  vec3 n = NORMALS[vNormal];
  vec3 vox = floor(vWorld - n * 0.5);
  ivec3 iv = ivec3(vox);
  vec4 inf = texelFetch(uInfo, ivec2(vMat, 0), 0);
  int flags = int(inf.b * 255.0 + 0.5);
  // pattern texels at SUB x voxel resolution, continuous across voxels (dense pixel-art surfaces)
  ivec3 lp = ivec3(floor(vWorld * ${SUB}.0 - n * 0.5));
  if ((flags & 1) != 0) {
    uint h = hash3u(uvec3(lp >> 4) + 1000u);
    lp += ivec3(int(h & 15u), int((h >> 4) & 15u), int((h >> 8) & 15u));
  }
  lp &= 15;
  vec3 col = texelFetch(uAtlas, ivec2(lp.x + lp.z * 16, lp.y + vMat * 16), 0).rgb;
  uint vh = hash3u(uvec3(iv) + 77u);
  float jitter = 0.95 + 0.1 * float(vh & 255u) / 255.0;
  col *= jitter;
  if ((flags & 16) != 0) {
    // liquid shimmer
    float ph = float(vh & 1023u) * 0.0061;
    col *= 0.9 + 0.1 * sin(uTime * 2.3 + ph + vox.x * 0.3 + vox.z * 0.2);
  }
  float shade = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.6 : (abs(n.x) > 0.5 ? 0.82 : 0.72));
  float ao = 0.4 + 0.6 * vAO;
  // blocky per-face lighting sampled at the face centre of this voxel
  vec3 fc = vox + 0.5 + n * 0.51;
  vec3 light = uAmbient * ao;
  light += vSky * (uSkyAmbient * ao + uSunCol * max(dot(n, uSunDir), 0.0));
  light += dynLight(fc, n, true) * (0.55 + 0.45 * ao);
  light += vec3(uFlash);
  vec3 c = col * shade * light;
  float glow = inf.g;
  if (glow > 0.0) {
    float fl = 1.0;
    if ((flags & 2) != 0) fl = 0.85 + 0.15 * sin(uTime * 3.0 + float(vh & 511u) * 0.05);
    c = mix(c, col * 1.15 * fl, glow);
  }
  c = applyFog(c, vWorld);
  float alpha = uTranslucent > 0.5 ? inf.r : 1.0;
  outColor = vec4(c, alpha);
}
`;

const POINT_VS = /* glsl */ `
in vec2 pinfo;
uniform float uPointScale;
uniform float uFire;
uniform float uTime;
out vec3 vColor;
out float vAlpha;
out vec3 vWorld;
uniform sampler2D uAtlas;
uniform sampler2D uInfo;
uint hash3u(uvec3 v) {
  uint h = v.x * 0x8da6b343u ^ v.y * 0xd8163841u ^ v.z * 0xcb1ab31fu;
  h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15;
  return h;
}
void main() {
  int m = int(pinfo.x + 0.5);
  float life = pinfo.y / 255.0;
  vec4 wp = modelMatrix * vec4(position + 0.5, 1.0);
  ivec3 iv = ivec3(floor(wp.xyz));
  uint h = hash3u(uvec3(iv) + uvec3(uint(uTime * 12.0)));
  vec4 inf = texelFetch(uInfo, ivec2(m, 0), 0);
  ivec3 lp = (iv + ivec3(int(h & 15u), 0, 0)) & 15;
  vec3 col = texelFetch(uAtlas, ivec2(lp.x + lp.z * 16, lp.y + m * 16), 0).rgb;
  // small drift for organic movement
  vec3 jit = vec3(float(h & 255u), float((h >> 8) & 255u), float((h >> 16) & 255u)) / 255.0 - 0.5;
  wp.xyz += jit * 0.35;
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float sz = uFire > 0.5 ? 1.15 : 1.5;
  gl_PointSize = clamp(uPointScale * sz / max(-mv.z, 0.5), 1.0, 160.0);
  vColor = col;
  vAlpha = inf.r * (uFire > 0.5 ? (0.6 + 0.4 * life) : clamp(0.35 + life * 0.9, 0.0, 1.0));
}
`;

const POINT_FS = /* glsl */ `
${COMMON}
uniform float uFire;
in vec3 vColor;
in float vAlpha;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 c = vColor;
  if (uFire > 0.5) {
    c = c * 1.4;
  } else {
    vec3 light = uAmbient + dynLight(vWorld, vec3(0.0, 1.0, 0.0), false) * 0.8 + vec3(uFlash);
    c = c * light;
    c = applyFog(c, vWorld);
  }
  outColor = vec4(c, vAlpha);
}
`;

export function createVoxelMaterials(u: SharedUniforms) {
  const opaque = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...u, uTranslucent: { value: 0 } },
    vertexShader: VOXEL_VS,
    fragmentShader: VOXEL_FS,
  });
  const translucent = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...u, uTranslucent: { value: 1 } },
    vertexShader: VOXEL_VS,
    fragmentShader: VOXEL_FS,
    transparent: true,
    depthWrite: false,
  });
  const gas = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...u, uFire: { value: 0 } },
    vertexShader: POINT_VS,
    fragmentShader: POINT_FS,
    transparent: true,
    depthWrite: false,
  });
  const fire = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...u, uFire: { value: 1 } },
    vertexShader: POINT_VS,
    fragmentShader: POINT_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { opaque, translucent, gas, fire };
}

export type VoxelMaterials = ReturnType<typeof createVoxelMaterials>;
export { COMMON as VOXEL_SHADER_COMMON };
