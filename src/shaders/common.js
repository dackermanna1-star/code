// Shared GLSL chunks. Each chunk declares the uniforms it needs and is include-guarded,
// so materials can concatenate whichever chunks they use.

// Vertex-shader logarithmic depth: the view spans 0.1 m to ~25 km, far beyond what a
// standard 24-bit depth buffer resolves. The terrain is finely tessellated near the
// camera, so applying it per vertex (keeping early-z) is accurate enough.
export const LOGDEPTH_GLSL = /* glsl */ `
#ifndef LOGDEPTH_GLSL
#define LOGDEPTH_GLSL
uniform float uLogDepthFC;
vec4 logDepth(vec4 clip) {
  clip.z = (log2(max(1e-6, 1.0 + clip.w)) * uLogDepthFC - 1.0) * clip.w;
  return clip;
}
// Earth curvature: distant ground drops below the horizon.
vec3 applyCurvature(vec3 wp) {
  vec2 d = wp.xz - cameraPosition.xz;
  wp.y -= dot(d, d) * (1.0 / (2.0 * 6371000.0));
  return wp;
}
#endif
`;

// Clipmap atlas sampling. Requires #define CLIP_LEVELS and CLIP_N.
// Level k covers N x N texels of size uClip[k].z starting at uClip[k].xy (world x,z).
// Tiles are laid out 4 per row in the atlas.
export const CLIPMAP_GLSL = /* glsl */ `
#ifndef CLIPMAP_GLSL
#define CLIPMAP_GLSL
uniform highp sampler2D tHeight;
uniform sampler2D tNormal;
uniform sampler2D tShadow;
uniform vec4 uClip[CLIP_LEVELS];
uniform vec2 uAtlasInv;
const float CLIP_NF = float(CLIP_N);
const float CLIP_MARGIN = 4.0;
const float CLIP_BLEND = float(CLIP_N) * 0.14;

ivec2 clipTile(int k) {
  return ivec2((k % 4) * CLIP_N, (k / 4) * CLIP_N);
}

// Finest level (>= kMin) whose tile contains p with a margin. blend = weight of level k+1,
// rising near the tile edge so neighbouring levels meet without seams.
int clipLevel(vec2 p, int kMin, out float blend) {
  for (int k = 0; k < CLIP_LEVELS; k++) {
    if (k < kMin) continue;
    vec2 tc = (p - uClip[k].xy) * uClip[k].w;
    float m = min(min(tc.x, tc.y), CLIP_NF - max(tc.x, tc.y));
    if (k == CLIP_LEVELS - 1) {
      blend = 0.0;
      return k;
    }
    if (m > CLIP_MARGIN) {
      blend = 1.0 - smoothstep(CLIP_MARGIN, CLIP_MARGIN + CLIP_BLEND, m);
      return k;
    }
  }
  blend = 0.0;
  return CLIP_LEVELS - 1;
}

float clipHeightAt(int k, vec2 p) {
  vec2 tc = (p - uClip[k].xy) * uClip[k].w - 0.5;
  tc = clamp(tc, vec2(0.0), vec2(CLIP_NF - 1.001));
  vec2 f = floor(tc);
  vec2 w = tc - f;
  ivec2 b = clipTile(k) + ivec2(f);
  float h00 = texelFetch(tHeight, b, 0).r;
  float h10 = texelFetch(tHeight, b + ivec2(1, 0), 0).r;
  float h01 = texelFetch(tHeight, b + ivec2(0, 1), 0).r;
  float h11 = texelFetch(tHeight, b + ivec2(1, 1), 0).r;
  return mix(mix(h00, h10, w.x), mix(h01, h11, w.x), w.y);
}

float clipHeightFrom(vec2 p, int kMin) {
  float blend;
  int k = clipLevel(p, kMin, blend);
  float h = clipHeightAt(k, p);
  if (blend > 0.0) h = mix(h, clipHeightAt(k + 1, p), blend);
  return h;
}

float clipHeight(vec2 p) {
  return clipHeightFrom(p, 0);
}

vec2 clipAtlasUV(int k, vec2 p) {
  vec2 tc = clamp((p - uClip[k].xy) * uClip[k].w, vec2(1.0), vec2(CLIP_NF - 1.0));
  return (vec2(clipTile(k)) + tc) * uAtlasInv;
}

// Surface data at p: nrm = (dh/dx, dh/dz, slip-face factor, curvature), shadow = sun
// visibility. footprint = world size of one pixel; coarser levels are used when the
// pixel covers several texels (mip-mapping for the clipmap).
void clipSurface(vec2 p, float footprint, out vec4 nrm, out float shadow) {
  float kf = max(log2(max(footprint, 1e-4) * 0.8 * uClip[0].w), 0.0);
  int kMin = min(int(kf), CLIP_LEVELS - 1);
  float blend;
  int k = clipLevel(p, kMin, blend);
  if (k == kMin && k < CLIP_LEVELS - 1) blend = max(blend, fract(kf));
  vec2 uv = clipAtlasUV(k, p);
  nrm = textureLod(tNormal, uv, 0.0);
  shadow = textureLod(tShadow, uv, 0.0).r;
  if (blend > 0.001) {
    vec2 uv2 = clipAtlasUV(k + 1, p);
    nrm = mix(nrm, textureLod(tNormal, uv2, 0.0), blend);
    shadow = mix(shadow, textureLod(tShadow, uv2, 0.0).r, blend);
  }
}

float clipShadow(vec2 p) {
  float blend;
  int k = clipLevel(p, 0, blend);
  float s = textureLod(tShadow, clipAtlasUV(k, p), 0.0).r;
  if (blend > 0.001) s = mix(s, textureLod(tShadow, clipAtlasUV(k + 1, p), 0.0).r, blend);
  return s;
}
#endif
`;

// Small hash helpers for shading noise (not shared with JS).
export const HASH_GLSL = /* glsl */ `
#ifndef HASH_GLSL
#define HASH_GLSL
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
// Cheap value noise for shading detail.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) {
  float v = 0.5 * vnoise(p);
  v += 0.25 * vnoise(p * 2.03 + 17.1);
  v += 0.125 * vnoise(p * 4.01 - 9.7);
  return v / 0.875;
}
#endif
`;
