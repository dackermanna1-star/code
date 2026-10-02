import { GLSL_PRECISION } from '../fullscreen';

/** Tileable gradient (Perlin) and cellular (Worley) noise, 2D and 3D. */
const GLSL_TILE_NOISE = /* glsl */ `
uint nz_hash(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
vec3 nz_hash3(vec3 p, float seed) {
  uvec3 u = uvec3(ivec3(p) + 4096);
  uint a = nz_hash(u.x ^ nz_hash(u.y ^ nz_hash(u.z ^ uint(seed))));
  uint b = nz_hash(a ^ 0x9e3779b9u);
  uint c = nz_hash(b ^ 0x85ebca6bu);
  return vec3(uvec3(a, b, c) >> 8u) * (1.0 / 16777216.0);
}
vec2 nz_hash2(vec2 p, float seed) { return nz_hash3(vec3(p, 0.0), seed).xy; }

float nz_perlin3(vec3 p, float period, float seed) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n[8];
  for (int k = 0; k < 8; k++) {
    vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 g = normalize(nz_hash3(mod(i + o, period), seed) * 2.0 - 1.0 + 1e-4);
    n[k] = dot(g, f - o);
  }
  float x00 = mix(n[0], n[1], u.x), x10 = mix(n[2], n[3], u.x);
  float x01 = mix(n[4], n[5], u.x), x11 = mix(n[6], n[7], u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}

float nz_worley3(vec3 p, float period, float seed) {
  vec3 i = floor(p);
  vec3 f = p - i;
  float dmin = 10.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 fp = o + nz_hash3(mod(i + o, period), seed) - f;
    dmin = min(dmin, dot(fp, fp));
  }
  return 1.0 - clamp(sqrt(dmin), 0.0, 1.0);
}

float nz_perlin2(vec2 p, float period, float seed) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n[4];
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float((k >> 1) & 1));
    vec2 g = normalize(nz_hash2(mod(i + o, period), seed) * 2.0 - 1.0 + 1e-4);
    n[k] = dot(g, f - o);
  }
  return mix(mix(n[0], n[1], u.x), mix(n[2], n[3], u.x), u.y);
}

float nz_worley2(vec2 p, float period, float seed) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float dmin = 10.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 fp = o + nz_hash2(mod(i + o, period), seed) - f;
    dmin = min(dmin, dot(fp, fp));
  }
  return 1.0 - clamp(sqrt(dmin), 0.0, 1.0);
}

float nz_perlinFbm3(vec3 p, float freq, int octaves, float seed) {
  float sum = 0.0, amp = 1.0, norm = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;
    sum += amp * nz_perlin3(p * freq, freq, seed + float(o) * 17.0);
    norm += amp;
    amp *= 0.55;
    freq *= 2.0;
  }
  return sum / norm;
}

float nz_perlinFbm2(vec2 p, float freq, int octaves, float seed) {
  float sum = 0.0, amp = 1.0, norm = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;
    sum += amp * nz_perlin2(p * freq, freq, seed + float(o) * 17.0);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}
`;

/**
 * Shape noise slice (128^3 RGBA8): R = Perlin-Worley, G/B/A = Worley FBM at increasing frequency.
 */
export const SHAPE_NOISE_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_TILE_NOISE}
uniform float nz_slice;
uniform float nz_size;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 p = vec3(gl_FragCoord.xy, nz_slice + 0.5) / nz_size;
  float w4 = nz_worley3(p * 4.0, 4.0, 1.0);
  float w8 = nz_worley3(p * 8.0, 8.0, 2.0);
  float w16 = nz_worley3(p * 16.0, 16.0, 3.0);
  float w32 = nz_worley3(p * 32.0, 32.0, 4.0);
  float w64 = nz_size >= 128.0 ? nz_worley3(p * 64.0, 64.0, 5.0) : w32;
  float g = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
  float b = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
  float a = w16 * 0.625 + w32 * 0.25 + w64 * 0.125;
  float pf = nz_perlinFbm3(p, 4.0, nz_size >= 128.0 ? 5 : 4, 11.0);
  pf = clamp(abs(pf) * 1.5, 0.0, 1.0);          // billowy Perlin
  float pw = g + pf * (1.0 - g);                // remap(perlin, 0, 1, worleyFbm, 1)
  outColor = vec4(pw, g, b, a);
}
`;

/** Detail noise slice (32^3 RGBA8): Worley FBM at three frequencies. */
export const DETAIL_NOISE_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_TILE_NOISE}
uniform float nz_slice;
uniform float nz_size;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 p = vec3(gl_FragCoord.xy, nz_slice + 0.5) / nz_size;
  float w2 = nz_worley3(p * 2.0, 2.0, 21.0);
  float w4 = nz_worley3(p * 4.0, 4.0, 22.0);
  float w8 = nz_worley3(p * 8.0, 8.0, 23.0);
  float w16 = nz_worley3(p * 16.0, 16.0, 24.0);
  float w32 = nz_worley3(p * 32.0, 32.0, 25.0);
  outColor = vec4(w2 * 0.625 + w4 * 0.25 + w8 * 0.125, w4 * 0.625 + w8 * 0.25 + w16 * 0.125, w8 * 0.625 + w16 * 0.25 + w32 * 0.125, 1.0);
}
`;

/**
 * Weather map (512^2 RGBA8, tileable): R = cloud potential (cells clustered by large-scale noise),
 * G = cloud type (tower height), B = large-scale variation, A = wispiness.
 */
export const WEATHER_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_TILE_NOISE}
uniform float nz_size;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 p = gl_FragCoord.xy / nz_size;
  // one cumulus per Worley cell (~1.6 km and ~0.8 km), cells clustered by low-frequency noise
  float warp = nz_perlinFbm2(p, 12.0, 3, 30.0);
  vec2 pw = p + vec2(warp, -warp) * 0.012;
  float c1 = nz_worley2(pw * 14.0, 14.0, 31.0);
  float c2 = nz_worley2(pw * 28.0, 28.0, 32.0);
  float c3 = nz_worley2(pw * 56.0, 56.0, 33.0);
  float cells = max(smoothstep(0.32, 0.9, c1), 0.75 * smoothstep(0.45, 0.95, c2));
  cells = max(cells, 0.4 * smoothstep(0.55, 0.95, c3));
  float clusters = nz_perlinFbm2(p, 4.0, 4, 34.0) * 0.5 + 0.5;
  float large = nz_perlinFbm2(p, 2.0, 3, 35.0) * 0.5 + 0.5;
  float pot = cells * smoothstep(0.22, 0.62, clusters);
  // per-cell tower height (cloud type): bigger cells grow taller
  float type = clamp(smoothstep(0.5, 1.0, c1) * 0.7 + (nz_perlinFbm2(p, 8.0, 3, 36.0) * 0.5 + 0.5) * 0.5, 0.0, 1.0);
  float wisp = clamp(nz_perlinFbm2(p, 16.0, 3, 37.0) * 0.8 + 0.5, 0.0, 1.0);
  outColor = vec4(pot, type, large, wisp);
}
`;
