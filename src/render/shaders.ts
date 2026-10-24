// GLSL sources for the deferred voxel renderer.
import { GLSL_HEADER } from './gl';

export const MAX_LIGHTS = 48;
export const NUM_CASCADES = 4;
export const SKY_MAPS = 8;

/** Quad decoding shared by every pass that draws voxel geometry (vertex pulling from the quad texture). */
const QUAD_COMMON = `
uniform highp usampler2D uQuads;
uniform highp sampler2D uXforms;
const vec3 FN[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
const vec3 FU[6] = vec3[6](vec3(0,1,0), vec3(0,0,1), vec3(0,0,1), vec3(1,0,0), vec3(1,0,0), vec3(0,1,0));
const vec3 FV[6] = vec3[6](vec3(0,0,1), vec3(0,1,0), vec3(1,0,0), vec3(0,0,1), vec3(0,1,0), vec3(1,0,0));
const vec2 CORNER[6] = vec2[6](vec2(0,0), vec2(1,0), vec2(0,1), vec2(0,1), vec2(1,0), vec2(1,1));

struct Quad { vec3 lp; vec3 n; vec2 uv; uint pal; uint ao; uint slot; int face; };

Quad decodeQuad(int vid) {
  int qi = vid / 6;
  int ci = vid - qi * 6;
  uvec4 q = texelFetch(uQuads, ivec2(qi & 4095, qi >> 12), 0);
  Quad r;
  vec3 o = vec3(float(q.x & 0xffffu), float(q.x >> 16u), float(q.y & 0xffffu));
  vec2 wh = vec2(float(((q.y >> 16u) & 0xffu) + 1u), float((q.y >> 24u) + 1u));
  r.face = int((q.z >> 8u) & 7u);
  vec2 c = CORNER[ci];
  r.uv = c * wh;
  // LOD quads are stored in 2^lod voxel units: local positions are always in voxel units
  r.lp = (o + FU[r.face] * r.uv.x + FV[r.face] * r.uv.y) * float(1u << ((q.z >> 20u) & 3u));
  r.n = FN[r.face];
  r.pal = q.z & 0xffu;
  r.ao = (q.z >> 11u) & 0xffu;
  r.slot = q.w;
  return r;
}

// Model rows for a body slot (rows 0..2 current, 3..5 previous). Slot 0 = static world (scale 0.1).
void bodyXform(uint slot, bool prev, out vec4 m0, out vec4 m1, out vec4 m2) {
  int row = int(slot);
  int b = prev ? 3 : 0;
  m0 = texelFetch(uXforms, ivec2(b, row), 0);
  m1 = texelFetch(uXforms, ivec2(b + 1, row), 0);
  m2 = texelFetch(uXforms, ivec2(b + 2, row), 0);
}
`;

const HASH = `
uint pcg(uint v) { uint state = v * 747796405u + 2891336453u; uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u; return (word >> 22u) ^ word; }
uint hash3i(ivec3 p) { return pcg(uint(p.x) * 73856093u ^ pcg(uint(p.y) * 19349663u ^ pcg(uint(p.z) * 83492791u))); }
float hash3f(ivec3 p) { return float(hash3i(p) & 0xffffu) / 65535.0; }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// ---------------------------------------------------------------------------
// G-buffer pass

export const GBUFFER_VS = GLSL_HEADER + QUAD_COMMON + `
uniform mat4 uViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uJitter;
uniform int uTransparent;
out vec3 vLocal;
out vec2 vUV;
out vec4 vCur;
out vec4 vPrev;
out vec3 vWorld;
flat out vec3 vNormal;
flat out uint vPal;
flat out vec4 vAO;
flat out int vFace;
void main() {
  Quad q = decodeQuad(gl_VertexID);
  vLocal = q.lp; vUV = q.uv; vPal = q.pal; vFace = q.face;
  uint a = q.ao;
  vAO = vec4(float(a & 3u), float((a >> 2u) & 3u), float((a >> 4u) & 3u), float((a >> 6u) & 3u)) * (1.0 / 3.0);
  vec3 wp, pwp, wn;
  if (q.slot == 0u) { wp = q.lp * 0.1; pwp = wp; wn = q.n; }
  else {
    vec4 m0, m1, m2; bodyXform(q.slot, false, m0, m1, m2);
    vec4 l = vec4(q.lp, 1.0);
    wp = vec3(dot(m0, l), dot(m1, l), dot(m2, l));
    wn = normalize(vec3(dot(m0.xyz, q.n), dot(m1.xyz, q.n), dot(m2.xyz, q.n)));
    bodyXform(q.slot, true, m0, m1, m2);
    pwp = vec3(dot(m0, l), dot(m1, l), dot(m2, l));
  }
  vNormal = wn;
  vWorld = wp;
  vec4 clip = uViewProj * vec4(wp, 1.0);
  vCur = clip;
  vPrev = uPrevViewProj * vec4(pwp, 1.0);
  clip.xy += uJitter * clip.w;
  gl_Position = clip;
}`;

/** Per-palette surface shading (albedo variation + procedural patterns), shared by opaque & glass passes. */
const SURFACE = HASH + `
uniform highp sampler2D uPalAlbedo;
uniform highp sampler2D uPalParams;
uniform float uEdge;

float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  ivec3 ii = ivec3(i);
  float a = hash3f(ii), b = hash3f(ii + ivec3(1,0,0)), c = hash3f(ii + ivec3(0,1,0)), d = hash3f(ii + ivec3(1,1,0));
  float e = hash3f(ii + ivec3(0,0,1)), g = hash3f(ii + ivec3(1,0,1)), h = hash3f(ii + ivec3(0,1,1)), k = hash3f(ii + ivec3(1,1,1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}

// pattern ids (see materials.ts / renderer palette upload)
// 0 none, 1 brick, 2 planks, 3 corrugated, 4 concrete, 5 asphalt, 6 grass, 7 dirt, 8 tiles, 9 rust, 10 foliage, 11 container
vec3 surfaceAlbedo(uint pal, int pattern, ivec3 cell, vec3 lp, int face, out float roughMod) {
  vec3 alb = texelFetch(uPalAlbedo, ivec2(int(pal), 0), 0).rgb;
  float h = hash3f(cell);
  float v = (h - 0.5) * 0.10;
  roughMod = 0.0;
  if (pattern == 1) {
    // bricks: 3 voxels long, 1 voxel high, staggered every row; colour per brick
    int row = cell.y;
    int off = (row & 1) * 2;
    ivec3 b = ivec3((cell.x + off) >> 2, row, (cell.z + off) >> 2);
    float hb = hash3f(b);
    v = (hb - 0.5) * 0.28 + (h - 0.5) * 0.06;
    // occasional darker sooty bricks
    if (hb > 0.93) v -= 0.18;
  } else if (pattern == 2) {
    // planks: strips along the longest horizontal axis of the face
    int strip = (face == 2 || face == 3) ? cell.z : cell.y;
    float hs = hash3f(ivec3(strip, cell.x >> 4, 7));
    v = (hs - 0.5) * 0.22 + (h - 0.5) * 0.08;
  } else if (pattern == 4) {
    float n = vnoise(lp * 0.07) * 0.6 + vnoise(lp * 0.21) * 0.4;
    float big = vnoise(lp * 0.012 + 17.0);
    v = (n - 0.5) * 0.26 + (h - 0.5) * 0.07 + (big - 0.5) * 0.3;
    // water / oil stains
    v -= smoothstep(0.68, 0.8, vnoise(lp * 0.03 + 5.0)) * 0.22;
    if (face == 2) {
      // slab joints every 4 m on horizontal surfaces
      ivec2 j = ivec2(cell.x % 40, cell.z % 40);
      if (j.x == 0 || j.y == 0) v -= 0.16;
    }
  } else if (pattern == 5) {
    float n = vnoise(lp * 0.05);
    v = (n - 0.5) * 0.22 + (h - 0.5) * 0.14;
  } else if (pattern == 6) {
    float n = vnoise(lp * 0.06) * 0.7 + vnoise(lp * 0.25) * 0.3;
    alb = mix(alb, alb * vec3(1.25, 1.15, 0.7), smoothstep(0.55, 0.8, n));
    v = (h - 0.5) * 0.28;
  } else if (pattern == 7) {
    float n = vnoise(lp * 0.09);
    v = (n - 0.5) * 0.3 + (h - 0.5) * 0.16;
  } else if (pattern == 8) {
    ivec3 t = cell >> 2;
    v = (hash3f(t) - 0.5) * 0.06 + (h - 0.5) * 0.03;
    ivec3 m = cell & 3;
    if ((face == 2 && (m.x == 0 || m.z == 0))) v -= 0.12;
  } else if (pattern == 9) {
    float n = vnoise(lp * 0.12) * 0.65 + vnoise(lp * 0.4) * 0.35;
    float rustAmt = smoothstep(0.5, 0.75, n);
    alb = mix(alb, vec3(0.30, 0.12, 0.05), rustAmt * 0.8);
    roughMod = rustAmt * 0.4;
    v = (h - 0.5) * 0.08;
  } else if (pattern == 10) {
    v = (h - 0.5) * 0.45;
    alb *= mix(vec3(1.0), vec3(1.2, 1.15, 0.7), step(0.85, h));
  } else if (pattern == 11) {
    // container: corrugation lines + grime towards the bottom
    float n = vnoise(lp * 0.1);
    v = (n - 0.5) * 0.16 + (h - 0.5) * 0.04;
  } else if (pattern == 3) {
    v = (h - 0.5) * 0.05;
  }
  return alb * (1.0 + v);
}

// corrugated sheet metal: bend the normal across one horizontal axis
vec3 corrugate(vec3 n, int face, vec3 lp) {
  if (face == 2 || face == 3) return n;
  float axis = (face == 0 || face == 1) ? lp.z : lp.x;
  float s = sin(axis * 3.14159 * 1.0);
  vec3 t = (face == 0 || face == 1) ? vec3(0, 0, 1) : vec3(1, 0, 0);
  return normalize(n + t * s * 0.35);
}

float voxelEdge(vec2 uv) {
  vec2 e = fract(uv);
  vec2 d = min(e, 1.0 - e);
  float m = min(d.x, d.y);
  return 1.0 - uEdge * (1.0 - smoothstep(0.0, 0.09, m));
}
`;

export const GBUFFER_FS = GLSL_HEADER + SURFACE + `
in vec3 vLocal;
in vec2 vUV;
in vec4 vCur;
in vec4 vPrev;
in vec3 vWorld;
flat in vec3 vNormal;
flat in uint vPal;
flat in vec4 vAO;
flat in int vFace;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oMat;
const vec3 FN_LOCAL[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
void main() {
  vec3 ln = FN_LOCAL[vFace];
  ivec3 cell = ivec3(floor(vLocal - ln * 0.5));
  vec4 prm = texelFetch(uPalParams, ivec2(int(vPal), 0), 0);
  int pattern = int(prm.a * 255.0 + 0.5);
  float roughMod;
  vec3 alb = surfaceAlbedo(vPal, pattern, cell, vLocal, vFace, roughMod);
  vec2 f = fract(vUV);
  float ao = mix(mix(vAO.x, vAO.y, f.x), mix(vAO.z, vAO.w, f.x), f.y);
  ao = ao * ao * (3.0 - 2.0 * ao);
  alb *= voxelEdge(vUV);
  vec3 n = vNormal;
  if (pattern == 3 || pattern == 11) {
    // perturb in local space only for static geometry (bodies keep flat normals)
    if (dot(abs(n - ln), vec3(1.0)) < 0.001) n = corrugate(n, vFace, vLocal);
  }
  vec2 vel = (vCur.xy / vCur.w - vPrev.xy / vPrev.w) * 0.5;
  oAlbedo = vec4(alb, prm.b);
  oNormal = vec4(n * 0.5 + 0.5, ao);
  oMat = vec4(vel, clamp(prm.r + roughMod, 0.02, 1.0), prm.g);
}`;

// ---------------------------------------------------------------------------
// Shadow pass

export const SHADOW_VS = GLSL_HEADER + QUAD_COMMON + `
uniform mat4 uLightVP;
void main() {
  Quad q = decodeQuad(gl_VertexID);
  vec3 wp;
  if (q.slot == 0u) wp = q.lp * 0.1;
  else {
    vec4 m0, m1, m2; bodyXform(q.slot, false, m0, m1, m2);
    vec4 l = vec4(q.lp, 1.0);
    wp = vec3(dot(m0, l), dot(m1, l), dot(m2, l));
  }
  gl_Position = uLightVP * vec4(wp, 1.0);
}`;

export const SHADOW_FS = GLSL_HEADER + `
void main() {}`;

// ---------------------------------------------------------------------------
// Shared lighting helpers

const LIGHT_COMMON = `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uTime;
uniform vec3 uCamPos;

vec3 skyColor(vec3 d) {
  float y = d.y;
  float t = clamp(y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(t, 0.55));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (pow(sd, 6.0) * 0.06 + pow(sd, 48.0) * 0.18);
  // horizon haze band
  c = mix(c, uFogColor, exp(-max(y, 0.0) * 9.0) * 0.55);
  if (y < 0.0) c = mix(c, uGroundColor * 0.6 + uFogColor * 0.4, smoothstep(0.0, -0.08, y));
  return c;
}

float cloudLayer(vec3 d) {
  if (d.y <= 0.01) return 0.0;
  vec2 p = d.xz / d.y * 0.6 + vec2(uTime * 0.004, uTime * 0.0013);
  float n = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    vec2 ip = floor(p); vec2 fp = fract(p); fp = fp * fp * (3.0 - 2.0 * fp);
    float h00 = fract(sin(dot(ip, vec2(127.1, 311.7))) * 43758.5453);
    float h10 = fract(sin(dot(ip + vec2(1,0), vec2(127.1, 311.7))) * 43758.5453);
    float h01 = fract(sin(dot(ip + vec2(0,1), vec2(127.1, 311.7))) * 43758.5453);
    float h11 = fract(sin(dot(ip + vec2(1,1), vec2(127.1, 311.7))) * 43758.5453);
    n += a * mix(mix(h00, h10, fp.x), mix(h01, h11, fp.x), fp.y);
    p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5;
  }
  return smoothstep(0.52, 0.85, n) * smoothstep(0.01, 0.15, d.y);
}

vec3 fullSky(vec3 d) {
  vec3 c = skyColor(d);
  float cl = cloudLayer(d);
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 cloudCol = mix(uSkyHorizon * 1.1 + uSunColor * 0.15, uSunColor * 0.55 + uSkyZenith * 0.3, pow(sd, 3.0));
  c = mix(c, cloudCol, cl * 0.85);
  return c;
}

vec3 applyFog(vec3 col, vec3 wp, vec3 rd, float dist) {
  // exponential height fog (analytic integral along the ray)
  float b = uFogHeight;
  float a = uFogDensity;
  float ry = rd.y;
  float camH = uCamPos.y;
  float fogAmt;
  if (abs(ry) < 1e-4) fogAmt = a * exp(-camH * b) * dist;
  else fogAmt = a * exp(-camH * b) * (1.0 - exp(-dist * ry * b)) / (ry * b);
  fogAmt = 1.0 - exp(-max(fogAmt, 0.0));
  float sd = max(dot(rd, uSunDir), 0.0);
  vec3 fc = uFogColor + uSunColor * pow(sd, 10.0) * 0.25;
  return mix(col, fc, fogAmt);
}

float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d + 1e-6); }
vec3 F_Schlick(float VoH, vec3 f0) { return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0); }
`;

// ---------------------------------------------------------------------------
// SSAO (half resolution)

export const SSAO_FS = GLSL_HEADER + HASH + `
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uView;
uniform vec2 uTexel;
uniform float uRadius;
uniform int uFrame;
out vec4 oAO;
vec3 viewPos(vec2 uv) {
  float d = texture(uDepth, uv).r;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  float d = texture(uDepth, vUV).r;
  if (d >= 1.0) { oAO = vec4(1.0); return; }
  vec3 P = viewPos(vUV);
  vec3 N = normalize((uView * vec4(texture(uNormal, vUV).xyz * 2.0 - 1.0, 0.0)).xyz);
  float noise = ign(gl_FragCoord.xy + float(uFrame % 64) * 5.588238);
  float rot = noise * 6.2831;
  vec3 rv = normalize(vec3(cos(rot), sin(rot), 0.3));
  vec3 T = normalize(rv - N * dot(rv, N));
  vec3 B = cross(N, T);
  float occ = 0.0;
  const int S = 12;
  float radius = uRadius * (0.6 + 0.4 * clamp(-P.z / 6.0, 0.0, 1.0));
  for (int i = 0; i < S; i++) {
    float fi = float(i) + fract(noise * 7.13);
    float r = (fi + 0.5) / float(S);
    float a = fi * 2.39996;
    float z = sqrt(1.0 - r);
    vec3 s = vec3(cos(a) * sqrt(r), sin(a) * sqrt(r), z);
    vec3 sp = P + (T * s.x + B * s.y + N * s.z) * radius * mix(0.2, 1.0, r * r);
    vec4 c = uProj * vec4(sp, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    float sz = viewPos(suv).z;
    float rangeOk = smoothstep(0.0, 1.0, radius / abs(P.z - sz));
    occ += (sz >= sp.z + 0.02 ? 1.0 : 0.0) * rangeOk;
  }
  float ao = 1.0 - occ / float(S);
  oAO = vec4(ao, 0.0, 0.0, 1.0);
}`;

export const SSAO_BLUR_FS = GLSL_HEADER + `
in vec2 vUV;
uniform sampler2D uAO;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uNear;
uniform float uFar;
out vec4 oAO;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float d0 = lin(texture(uDepth, vUV).r);
  float sum = 0.0, wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUV + uDir * uTexel * float(i) * 1.5;
    float d = lin(texture(uDepth, uv).r);
    float w = exp(-abs(d - d0) / (0.05 * d0 + 0.05)) * (1.0 - abs(float(i)) / 4.0);
    sum += texture(uAO, uv).r * w; wsum += w;
  }
  oAO = vec4(sum / max(wsum, 1e-4), 0, 0, 1);
}`;

// ---------------------------------------------------------------------------
// Deferred lighting

export const LIGHTING_FS = GLSL_HEADER + LIGHT_COMMON + HASH + `
in vec2 vUV;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uMat;
uniform sampler2D uDepth;
uniform sampler2D uSSAO;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uInvViewProj;
uniform mat4 uCascadeVP[${NUM_CASCADES}];
uniform vec4 uCascadeSplits;
uniform float uCascadeTexel[${NUM_CASCADES}];
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightCount;
uniform float uAmbient;
uniform int uUseSSAO;
uniform float uShadowSoft;
uniform int uFrame;
uniform sampler2DArrayShadow uSkyOcc;
uniform mat4 uSkyVP[${SKY_MAPS}];
uniform vec4 uSkyDir[${SKY_MAPS}];
uniform int uSkyOn;
uniform sampler2D uVol;
uniform int uVolOn;
uniform sampler2D uPrevColor;
uniform mat4 uViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uNearFar;
uniform int uSSR;
out vec4 oColor;

float linDepth(float d) {
  float z = d * 2.0 - 1.0, n = uNearFar.x, f = uNearFar.y;
  return 2.0 * n * f / (f + n - z * (f - n));
}

// Screen-space reflection: march the reflected ray against the depth buffer and shade a hit with
// last frame's image (reprojected). conf = how much to trust it (0 = fall back to the environment).
vec3 ssr(vec3 wp, vec3 R, float rough, float dist, out float conf) {
  conf = 0.0;
  float j = ign(gl_FragCoord.xy + float(uFrame % 8) * 5.17);
  float t = 0.12 + j * 0.08, tPrev = 0.0;
  for (int i = 0; i < 26; i++) {
    vec3 p = wp + R * t;
    vec4 c = uViewProj * vec4(p, 1.0);
    if (c.w <= 0.05) return vec3(0.0);
    vec3 ndc = c.xyz / c.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
    float sl = linDepth(texture(uDepth, uv).r), rl = linDepth(ndc.z * 0.5 + 0.5);
    if (rl > sl) {
      if (rl - sl > 0.35 + t * 0.06) return vec3(0.0); // went behind a thick object: unknown
      // refine between the last two samples
      float a = tPrev, b = t;
      for (int k = 0; k < 5; k++) {
        float m = (a + b) * 0.5;
        vec4 cm = uViewProj * vec4(wp + R * m, 1.0);
        vec3 nm = cm.xyz / cm.w;
        if (linDepth(nm.z * 0.5 + 0.5) > linDepth(texture(uDepth, nm.xy * 0.5 + 0.5).r)) b = m; else a = m;
      }
      vec3 hp = wp + R * b;
      vec4 pc = uPrevViewProj * vec4(hp, 1.0);
      vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
      if (pc.w <= 0.0 || puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) return vec3(0.0);
      vec2 e = min(puv, 1.0 - puv);
      conf = smoothstep(0.0, 0.08, min(e.x, e.y)) * (1.0 - smoothstep(10.0, 18.0, b))
           * (1.0 - smoothstep(0.25, 0.5, rough)) * (1.0 - smoothstep(40.0, 70.0, dist));
      return min(texture(uPrevColor, puv).rgb, vec3(30.0));
    }
    tPrev = t;
    t *= 1.2;
  }
  return vec3(0.0);
}

// fraction of the sky visible from a point: soft "sky shadows" from several directions
float skyVisibility(vec3 wp, vec3 n) {
  float sum = 0.0, wsum = 0.0;
  float j = ign(gl_FragCoord.xy + float(uFrame % 8) * 7.31) - 0.5;
  for (int k = 0; k < ${SKY_MAPS}; k++) {
    vec3 dir = uSkyDir[k].xyz;
    float w = uSkyDir[k].w * (0.25 + 0.75 * max(dot(n, dir), 0.0));
    vec4 lp = uSkyVP[k] * vec4(wp + n * 0.25 + dir * (0.15 + j * 0.1), 1.0);
    vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
    float v = 1.0;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0) v = texture(uSkyOcc, vec4(s.xy, float(k), s.z - 0.0015));
    sum += v * w; wsum += w;
  }
  return sum / max(wsum, 1e-4);
}

float shadowAt(vec3 wp, vec3 n, float viewDist) {
  int c = 0;
  if (viewDist > uCascadeSplits.x) c = 1;
  if (viewDist > uCascadeSplits.y) c = 2;
  if (viewDist > uCascadeSplits.z) c = 3;
  if (viewDist > uCascadeSplits.w) return 1.0;
  float texel = uCascadeTexel[c];
  vec3 p = wp + n * texel * 1.5;
  vec4 lp = uCascadeVP[c] * vec4(p, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) return 1.0;
  float bias = 0.0003 * float(c + 1);
  float r = uShadowSoft / (texel * 2048.0) ;
  float sum = 0.0;
  float ang = ign(gl_FragCoord.xy + float(uFrame % 16) * 3.7) * 6.2831;
  float ca = cos(ang), sa = sin(ang);
  const vec2 taps[8] = vec2[8](vec2(-0.613,0.3617), vec2(0.1702,-0.0405), vec2(-0.2994,-0.6545), vec2(0.6455,-0.2964),
                               vec2(0.4213,0.6801), vec2(-0.7984,-0.3154), vec2(-0.1101,0.8971), vec2(0.8662,0.2549));
  for (int i = 0; i < 8; i++) {
    vec2 o = taps[i];
    o = vec2(o.x * ca - o.y * sa, o.x * sa + o.y * ca) * (1.5 / 2048.0) * (c == 0 ? 1.0 : 1.4);
    sum += texture(uShadow, vec4(s.xy + o, float(c), s.z - bias));
  }
  float sh = sum / 8.0;
  // fade out at the last cascade end
  if (c == 3) sh = mix(sh, 1.0, smoothstep(uCascadeSplits.w * 0.85, uCascadeSplits.w, viewDist));
  return sh;
}

void main() {
  float d = texture(uDepth, vUV).r;
  vec4 wp4 = uInvViewProj * vec4(vUV * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 wp = wp4.xyz / wp4.w;
  vec3 rd = normalize(wp - uCamPos);
  if (d >= 1.0) {
    oColor = vec4(fullSky(rd), 1.0);
    return;
  }
  vec4 A = texture(uAlbedo, vUV);
  vec4 Nn = texture(uNormal, vUV);
  vec4 M = texture(uMat, vUV);
  vec3 alb = A.rgb;
  float emissive = A.a * 16.0;
  vec3 n = normalize(Nn.xyz * 2.0 - 1.0);
  float vao = Nn.w;
  float rough = M.b, metal = M.a;
  float dist = length(wp - uCamPos);
  float ssao = uUseSSAO == 1 ? texture(uSSAO, vUV).r : 1.0;
  float ao = vao * mix(1.0, ssao, 0.85);
  vec3 V = -rd;
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 diffCol = alb * (1.0 - metal);

  // sun
  float NoL = max(dot(n, uSunDir), 0.0);
  float sh = NoL > 0.0 ? shadowAt(wp, n, dist) : 0.0;
  vec3 H = normalize(uSunDir + V);
  float NoH = max(dot(n, H), 0.0), VoH = max(dot(V, H), 0.0), NoV = max(dot(n, V), 1e-3);
  float a = max(rough * rough, 0.02);
  vec3 F = F_Schlick(VoH, f0);
  float k = (rough + 1.0); k = k * k / 8.0;
  float G = (NoL / (NoL * (1.0 - k) + k)) * (NoV / (NoV * (1.0 - k) + k));
  vec3 spec = D_GGX(NoH, a) * F * G / max(4.0 * NoL * NoV, 1e-3);
  vec3 col = (diffCol / 3.14159 + spec) * uSunColor * NoL * sh * 3.14159;

  // sky / ambient (hemisphere) with bounce from the ground, occluded by the large-scale sky visibility
  float sv = uSkyOn == 1 ? skyVisibility(wp, n) : 1.0;
  float up = n.y * 0.5 + 0.5;
  vec3 skyAmb = mix(uGroundColor, mix(uSkyHorizon, uSkyZenith, 0.5), up);
  // indoors: dim ambient tinted by sunlight bouncing off the floor
  vec3 indoor = (uGroundColor * 0.5 + uSunColor * 0.02) * 0.35;
  vec3 amb = mix(indoor, skyAmb, sv) * uAmbient;
  // cheap environment reflection for metals / glossy
  vec3 R = reflect(rd, n);
  vec3 env = skyColor(R) * uAmbient * mix(0.12, 1.0, sv);
  if (uSSR == 1 && rough < 0.5 && dist < 70.0) {
    float conf;
    vec3 sc = ssr(wp + n * 0.02, R, rough, dist, conf);
    env = mix(env, sc, conf);
  }
  vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NoV, 5.0);
  col += (diffCol * amb + env * Fe * (1.0 - rough * 0.7)) * ao;

  // point lights
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 lp = uLightPos[i];
    vec3 L = lp.xyz - wp;
    float dl2 = dot(L, L);
    float r2 = lp.w * lp.w;
    if (dl2 > r2) continue;
    float dl = sqrt(dl2);
    L /= dl;
    float nl = max(dot(n, L), 0.0);
    float win = 1.0 - dl2 / r2; win *= win;
    float att = win / (dl2 + 0.25);
    vec3 Hl = normalize(L + V);
    float sl = D_GGX(max(dot(n, Hl), 0.0), max(a, 0.08)) * 0.25;
    col += uLightCol[i].rgb * att * (diffCol * nl + f0 * sl * nl) * mix(1.0, ao, 0.5);
  }

  col += alb * emissive;
  col = applyFog(col, wp, rd, dist);
  if (uVolOn == 1) col += texture(uVol, vUV).rgb;
  oColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// Volumetric sun scattering (half resolution, jittered, resolved by TAA)

export const VOLUMETRIC_FS = GLSL_HEADER + HASH + `
in vec2 vUV;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uCascadeVP[${NUM_CASCADES}];
uniform vec4 uCascadeSplits;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uDensity;
uniform float uGround;
uniform int uFrame;
out vec4 oColor;
void main() {
  float d = texture(uDepth, vUV).r;
  vec4 wp4 = uInvViewProj * vec4(vUV * 2.0 - 1.0, (d >= 1.0 ? 0.9999 : d) * 2.0 - 1.0, 1.0);
  vec3 wp = wp4.xyz / wp4.w;
  vec3 rd = wp - uCamPos;
  float dist = length(rd);
  rd /= dist;
  float tmax = min(dist, 70.0);
  const int N = 20;
  float jit = ign(gl_FragCoord.xy + float(uFrame % 32) * 5.588);
  float stepLen = tmax / float(N);
  float acc = 0.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + jit) * stepLen;
    vec3 p = uCamPos + rd * t;
    int c = t > uCascadeSplits.x ? (t > uCascadeSplits.y ? (t > uCascadeSplits.z ? 3 : 2) : 1) : 0;
    vec4 lp = uCascadeVP[c] * vec4(p, 1.0);
    vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
    float vis = 1.0;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0) vis = texture(uShadow, vec4(s.xy, float(c), s.z - 0.001));
    float dens = uDensity * exp(-max(p.y - uGround, 0.0) * 0.07);
    acc += vis * dens * stepLen * exp(-t * uDensity * 0.6);
  }
  float g = 0.55;
  float mu = dot(rd, uSunDir);
  float phase = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 sc = acc * uSunColor * (phase * 3.0 + 0.04);
  oColor = vec4(sc, 1.0);
}`;

// ---------------------------------------------------------------------------
// Forward pass for transparent voxels (glass)

export const GLASS_FS = GLSL_HEADER + LIGHT_COMMON + SURFACE + `
in vec3 vLocal;
in vec2 vUV;
in vec4 vCur;
in vec4 vPrev;
in vec3 vWorld;
flat in vec3 vNormal;
flat in uint vPal;
flat in vec4 vAO;
flat in int vFace;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uCascadeVP[${NUM_CASCADES}];
uniform vec4 uCascadeSplits;
uniform float uAmbient;
out vec4 oColor;
void main() {
  vec3 alb = texelFetch(uPalAlbedo, ivec2(int(vPal), 0), 0).rgb;
  vec3 n = normalize(vNormal);
  vec3 rd = normalize(vWorld - uCamPos);
  float dist = length(vWorld - uCamPos);
  if (dot(n, rd) > 0.0) n = -n;
  float NoV = max(dot(n, -rd), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(rd, n);
  vec3 env = fullSky(R);
  // simple sun shadow on glass (first matching cascade)
  float sh = 1.0;
  int c = dist > uCascadeSplits.x ? (dist > uCascadeSplits.y ? (dist > uCascadeSplits.z ? 3 : 2) : 1) : 0;
  vec4 lp = uCascadeVP[c] * vec4(vWorld + n * 0.02, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && dist < uCascadeSplits.w) sh = texture(uShadow, vec4(s.xy, float(c), s.z - 0.0005));
  vec3 H = normalize(uSunDir - rd);
  float spec = pow(max(dot(n, H), 0.0), 400.0) * 40.0 * sh;
  float edge = 1.0 - voxelEdge(vUV);
  vec3 col = alb * (uSkyHorizon * uAmbient * 0.6 + uSunColor * max(dot(n, uSunDir), 0.0) * sh * 0.25);
  col = mix(col, env, fres * 0.85) + uSunColor * spec;
  float alpha = clamp(0.22 + fres * 0.6 + edge * 0.5, 0.0, 0.95);
  col = applyFog(col, vWorld, rd, dist);
  oColor = vec4(col, alpha);
}`;

// ---------------------------------------------------------------------------
// Temporal anti-aliasing

export const TAA_FS = GLSL_HEADER + `
in vec2 vUV;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uMat;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uBlend;
uniform int uReset;
uniform mat4 uReproj; // current clip -> previous clip (for static geometry)
out vec4 oColor;
vec3 toYCoCg(vec3 c) { return vec3(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b); }
vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 tm(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 itm(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-4); }
void main() {
  vec3 cur = tm(texture(uCurrent, vUV).rgb);
  if (uReset == 1) { oColor = vec4(itm(cur), 1.0); return; }
  // closest depth in 3x3 for velocity dilation
  float best = 1.0; vec2 bestUV = vUV;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
    float d = texture(uDepth, uv).r;
    if (d < best) { best = d; bestUV = uv; }
    vec3 c = toYCoCg(tm(texture(uCurrent, uv).rgb));
    m1 += c; m2 += c * c;
  }
  vec2 vel = texture(uMat, bestUV).rg;
  if (best >= 1.0) {
    // sky: reproject using camera rotation only
    vec4 c = uReproj * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
    vel = vUV - (c.xy / c.w * 0.5 + 0.5);
  }
  vec2 prevUV = vUV - vel;
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, 0.0));
  vec3 lo = mean - sigma * 1.25, hi = mean + sigma * 1.25;
  vec3 hist = toYCoCg(tm(texture(uHistory, prevUV).rgb));
  // clip towards mean
  vec3 cc = 0.5 * (hi + lo), ext = 0.5 * (hi - lo) + 1e-4;
  vec3 off = hist - cc; vec3 ts = abs(off / ext); float t = max(ts.x, max(ts.y, ts.z));
  if (t > 1.0) hist = cc + off / t;
  hist = fromYCoCg(hist);
  float blend = uBlend;
  if (prevUV.x < 0.0 || prevUV.y < 0.0 || prevUV.x > 1.0 || prevUV.y > 1.0) blend = 1.0;
  float speed = length(vel / uTexel);
  blend = mix(blend, 0.3, clamp(speed / 40.0, 0.0, 1.0));
  vec3 res = mix(hist, cur, blend);
  oColor = vec4(itm(res), 1.0);
}`;

// ---------------------------------------------------------------------------
// Bloom

export const BLOOM_DOWN_FS = GLSL_HEADER + `
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform int uFirst;
uniform float uThreshold;
out vec4 oColor;
vec3 karis(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b)) * 0.25); }
void main() {
  vec3 a = texture(uSrc, vUV + uTexel * vec2(-2, 2)).rgb, b = texture(uSrc, vUV + uTexel * vec2(0, 2)).rgb, c = texture(uSrc, vUV + uTexel * vec2(2, 2)).rgb;
  vec3 d = texture(uSrc, vUV + uTexel * vec2(-2, 0)).rgb, e = texture(uSrc, vUV).rgb, f = texture(uSrc, vUV + uTexel * vec2(2, 0)).rgb;
  vec3 g = texture(uSrc, vUV + uTexel * vec2(-2, -2)).rgb, h = texture(uSrc, vUV + uTexel * vec2(0, -2)).rgb, i = texture(uSrc, vUV + uTexel * vec2(2, -2)).rgb;
  vec3 j = texture(uSrc, vUV + uTexel * vec2(-1, 1)).rgb, k = texture(uSrc, vUV + uTexel * vec2(1, 1)).rgb;
  vec3 l = texture(uSrc, vUV + uTexel * vec2(-1, -1)).rgb, m = texture(uSrc, vUV + uTexel * vec2(1, -1)).rgb;
  vec3 col;
  if (uFirst == 1) {
    col = karis((a + b + d + e) * 0.25) * 0.125 + karis((b + c + e + f) * 0.25) * 0.125 + karis((d + e + g + h) * 0.25) * 0.125
        + karis((e + f + h + i) * 0.25) * 0.125 + karis((j + k + l + m) * 0.25) * 0.5;
    float br = max(col.r, max(col.g, col.b));
    col *= max(br - uThreshold, 0.0) / max(br, 1e-4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  oColor = vec4(col, 1.0);
}`;

export const BLOOM_UP_FS = GLSL_HEADER + `
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 oColor;
void main() {
  vec2 r = uTexel * uRadius;
  vec3 c = texture(uSrc, vUV).rgb * 4.0;
  c += (texture(uSrc, vUV + vec2(-r.x, 0)).rgb + texture(uSrc, vUV + vec2(r.x, 0)).rgb + texture(uSrc, vUV + vec2(0, r.y)).rgb + texture(uSrc, vUV + vec2(0, -r.y)).rgb) * 2.0;
  c += texture(uSrc, vUV + vec2(-r.x, r.y)).rgb + texture(uSrc, vUV + vec2(r.x, r.y)).rgb + texture(uSrc, vUV + vec2(-r.x, -r.y)).rgb + texture(uSrc, vUV + vec2(r.x, -r.y)).rgb;
  oColor = vec4(c / 16.0, 1.0);
}`;

// ---------------------------------------------------------------------------
// Final composite: bloom, exposure, ACES tonemap, grading, vignette, grain, sRGB

export const FINAL_FS = GLSL_HEADER + HASH + `
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uTime;
uniform vec2 uRes;
uniform float uFlash;
uniform float uDamage;
out vec4 oColor;
vec3 aces(vec3 x) {
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  vec3 b = texture(uBloom, vUV).rgb;
  c = mix(c, b, uBloomStrength);
  c *= uExposure * (1.0 + uFlash);
  c = aces(c);
  // gentle grading: lift shadows slightly cool, warm highlights
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * vec3(0.96, 1.0, 1.06), (1.0 - l) * 0.25);
  c = mix(vec3(l), c, 1.06);
  vec2 q = vUV - 0.5;
  float vig = 1.0 - dot(q, q) * 0.55;
  c *= vig;
  c = mix(c, vec3(0.6, 0.0, 0.0), uDamage * smoothstep(0.2, 0.75, length(q)));
  c = toSRGB(max(c, 0.0));
  float g = ign(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5;
  c += g * (1.0 / 255.0) * 1.5;
  oColor = vec4(c, 1.0);
}`;

export { LIGHT_COMMON, HASH, SURFACE, QUAD_COMMON };
