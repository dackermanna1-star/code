// GLSL for the PS1-style pipeline:
//  * vertices snapped to the output pixel grid (GTE integer screen coords -> wobble)
//  * affine (screen-linear) texture mapping and Gouraud colour, like the PS1 GPU
//  * per-vertex depth cue fog
//  * nearest-neighbour texels, no mipmaps
//  * 15-bit colour output with the PS1 4x4 ordered dither

export const WORLD_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uint aLayer;
layout(location=3) in uvec2 aFC;
layout(location=4) in vec4 aCol;
layout(location=5) in vec4 aFlk;

uniform mat4 uVP;
uniform mat4 uModel;
uniform vec3 uCam;
uniform vec2 uSnap;
uniform vec2 uFog;
uniform float uTime;
uniform float uFlick[16];
uniform float uBright;
uniform float uLightMul;

out vec3 vUVW;
out vec4 vColW;
out float vFogW;
flat out float vLayer;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  uint flags = aFC.x;
  if ((flags & 2u) != 0u) {
    wp.y += sin(uTime * 1.1 + wp.x * 0.83 + wp.z * 0.61) * 0.022 + sin(uTime * 0.7 - wp.z * 1.3) * 0.012;
  }
  if ((flags & 4u) != 0u) {
    float k = clamp(wp.y * 0.2, 0.0, 1.0);
    wp.x += sin(uTime * 57.0 + wp.y * 9.0) * 0.006 * (0.3 + k);
    wp.z += cos(uTime * 49.0 + wp.y * 7.0) * 0.006 * (0.3 + k);
  }
  if ((flags & 64u) != 0u) {
    wp.x += sin(uTime * 0.8 + wp.z * 0.3) * 0.03;
  }
  vec4 clip = uVP * wp;
  if (clip.w > 0.08) {
    vec2 ndc = clip.xy / clip.w;
    ndc = floor(ndc * uSnap + 0.5) / uSnap;
    clip.xy = ndc * clip.w;
  }
  gl_Position = clip;
  float w = clip.w;
  float fl = uFlick[aFC.y];
  vec3 col = (aCol.rgb * uLightMul + aFlk.rgb * fl) * 2.0 * uBright;
  float d = distance(wp.xyz, uCam);
  float fog = clamp((d - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  if ((flags & 16u) != 0u) fog = 0.0;
  vec2 uv = aUV;
  if ((flags & 32u) != 0u) uv += vec2(uTime * 0.013, uTime * 0.007);
  vUVW = vec3(uv * w, w);
  vColW = vec4(col, aCol.a) * w;
  vFogW = fog * w;
  float layer = float(aLayer);
  if ((flags & 8u) != 0u) layer += mod(floor(uTime * 14.0), 4.0);
  vLayer = layer;
}
`;

export const WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec3 uFogColor;
uniform float uDither;
uniform float uAlphaMul;
in vec3 vUVW;
in vec4 vColW;
in float vFogW;
flat in float vLayer;
out vec4 outColor;

const float BAYER[16] = float[16](-4.0, 0.0, -3.0, 1.0, 2.0, -2.0, 3.0, -1.0, -3.0, 1.0, -4.0, 0.0, 3.0, -1.0, 2.0, -2.0);

void main() {
  float w = vUVW.z;
  vec2 uv = vUVW.xy / w;
  vec4 col = vColW / w;
  float fog = vFogW / w;
  vec4 t = texture(uTex, vec3(uv, vLayer));
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * col.rgb;
  c = mix(c, uFogColor, clamp(fog, 0.0, 1.0));
  ivec2 p = ivec2(gl_FragCoord.xy) & 3;
  float d = BAYER[p.y * 4 + p.x] * uDither;
  c = floor(clamp(c * 255.0 + d, 0.0, 255.0) / 8.0) / 31.0;
  outColor = vec4(c, col.a * uAlphaMul);
}
`;
