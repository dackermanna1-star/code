import * as THREE from 'three';

/**
 * Chunk shader: texture-array sampling with greedy-quad tiling (fract +
 * textureGrad to keep mip selection seam-free), Minecraft-style light curve,
 * sky light scaled by daylight, warm block light, AO, face shading, fog.
 */
const vert = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uWater;
in vec4 position;
in vec2 uv;
in vec4 info;
out vec2 vUv;
flat out float vLayer;
out float vAo;
out float vSky;
out float vBl;
out float vShade;
out float vDist;
void main() {
  vec3 p = position.xyz;
  float face = position.w;
  vShade = face < 0.5 ? 0.8 : face < 1.5 ? 0.8 : face < 2.5 ? 1.0 : face < 3.5 ? 0.55 : face < 5.5 ? 0.68 : 0.9;
  vUv = uv / 16.0;
  if (uWater > 0.5) {
    vUv += vec2(uTime * 0.03, uTime * 0.02);
  }
  vLayer = info.x;
  vAo = info.y;
  vSky = info.z;
  vBl = info.w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform float uDaylight;
uniform vec3 uSkyTint;
uniform vec3 uTorch;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
uniform float uAoStrength;
uniform float uGamma;
in vec2 vUv;
flat in float vLayer;
in float vAo;
in float vSky;
in float vBl;
in float vShade;
in float vDist;
out vec4 outColor;
float curve(float l) { return pow(0.82, 15.0 - l); }
void main() {
  vec2 f = fract(vUv);
  vec4 c = textureGrad(uTex, vec3(f, vLayer), dFdx(vUv), dFdy(vUv));
  if (uAlpha > 0.99 && c.a < 0.5) discard;
  float ao = mix(1.0 - uAoStrength, 1.0, vAo / 3.0);
  vec3 sky = uSkyTint * curve(vSky) * uDaylight;
  vec3 blk = uTorch * curve(vBl);
  vec3 light = max(max(sky, blk), vec3(0.035));
  vec3 col = c.rgb * light * ao * vShade;
  col = pow(col, vec3(uGamma));
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, fog);
  float a = uAlpha > 0.99 ? 1.0 : c.a * uAlpha + 0.15;
  outColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

export interface ChunkUniforms {
  uTex: { value: THREE.DataArrayTexture };
  uDaylight: { value: number };
  uSkyTint: { value: THREE.Color };
  uTorch: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uTime: { value: number };
  uAoStrength: { value: number };
  uGamma: { value: number };
}

export function makeChunkUniforms(tex: THREE.DataArrayTexture): ChunkUniforms {
  return {
    uTex: { value: tex },
    uDaylight: { value: 1 },
    uSkyTint: { value: new THREE.Color(1, 1, 1) },
    uTorch: { value: new THREE.Color(1.0, 0.82, 0.55) },
    uFogColor: { value: new THREE.Color(0.7, 0.8, 0.95) },
    uFogNear: { value: 60 },
    uFogFar: { value: 110 },
    uTime: { value: 0 },
    uAoStrength: { value: 0.55 },
    uGamma: { value: 1.0 },
  };
}

export function makeChunkMaterials(u: ChunkUniforms) {
  const opaque = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...u, uAlpha: { value: 1 }, uWater: { value: 0 } },
    side: THREE.FrontSide,
  });
  const trans = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...u, uAlpha: { value: 0.75 }, uWater: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  return { opaque, trans };
}

/** Build the WebGL2 texture array from RGBA tile layers. */
export function makeTileTexture(data: Uint8Array, layers: number, size = 16): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, size, size, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  // Tile bytes are used as-is (sRGB-encoded) by the custom shader, like classic voxel engines.
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
