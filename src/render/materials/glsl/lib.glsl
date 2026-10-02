// ---------------------------------------------------------------------------------------------
// Core library shared by every material program: hashing, periodic (tileable) noise, Voronoi,
// SDF helpers and the Mat struct. Every noise function is periodic over uv in [0,1]^2 so all
// textures tile seamlessly. Colours are authored in LINEAR space (rgb() decodes sRGB hex).
// ---------------------------------------------------------------------------------------------
#define PI 3.14159265359
#define TAU 6.28318530718
#define PX 0.0625

struct Mat { vec3 col; float a; float h; float r; };

Mat M(vec3 c, float a, float h, float r) { Mat m; m.col = c; m.a = a; m.h = h; m.r = r; return m; }

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec2 sat2(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 sat3(vec3 x) { return clamp(x, 0.0, 1.0); }
float remap(float x, float a, float b) { return sat((x - a) / (b - a)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 srgb2lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lin2srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
/** sRGB hex colour (0xRRGGBB) -> linear rgb. */
vec3 rgb(int h) { return srgb2lin(vec3(float((h >> 16) & 255), float((h >> 8) & 255), float(h & 255)) / 255.0); }
/** Scale a linear colour's brightness perceptually (k in sRGB-ish units). */
vec3 shade(vec3 c, float k) { return c * pow(max(k, 0.0), 2.2); }
vec3 desat(vec3 c, float k) { return mix(c, vec3(lum(c)), k); }

// ---------------------------------------------------------------------------- hashing
// pcg3d (Jarzynski & Olano 2020): cheap, good-quality 3-in/3-out integer hash.
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
uint hseed(float salt) { return uint(int(uSeed)) * 747796405u + uint(int(salt * 97.0 + 0.5)) * 2891336453u + 0x9e3779b9u; }
vec3 h3S(ivec2 i, uint s) { return vec3(pcg3d(uvec3(uvec2(i), s)) >> 8u) * (1.0 / 16777216.0); }
float hS(ivec2 i, uint s) { return h3S(i, s).x; }
vec2 h2S(ivec2 i, uint s) { return h3S(i, s).xy; }
/** Hash of an integer lattice point p (floats holding integers) with a salt, in [0,1). */
float h1(vec2 p, float salt) { return hS(ivec2(floor(p)), hseed(salt)); }
vec2 h2(vec2 p, float salt) { return h2S(ivec2(floor(p)), hseed(salt)); }
vec3 h3(vec2 p, float salt) { return h3S(ivec2(floor(p)), hseed(salt)); }
float hf(float x, float salt) { return h1(vec2(x, 7.0), salt); }

// ---------------------------------------------------------------------------- periodic noise
/** Gradient noise with integer lattice period `per`, approx [-1,1]. */
float gnoise(vec2 p, vec2 per, float salt) {
  uint s = hseed(salt);
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 a0 = mod(i, per), a1 = mod(i + 1.0, per);
  ivec2 i00 = ivec2(a0), i11 = ivec2(a1);
  vec2 g00 = h2S(i00, s) * 2.0 - 1.0;
  vec2 g10 = h2S(ivec2(i11.x, i00.y), s) * 2.0 - 1.0;
  vec2 g01 = h2S(ivec2(i00.x, i11.y), s) * 2.0 - 1.0;
  vec2 g11 = h2S(i11, s) * 2.0 - 1.0;
  float n00 = dot(g00, f);
  float n10 = dot(g10, f - vec2(1.0, 0.0));
  float n01 = dot(g01, f - vec2(0.0, 1.0));
  float n11 = dot(g11, f - vec2(1.0, 1.0));
  return 1.45 * mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}
/** Value noise, period `per`, [0,1]. */
float vnoise(vec2 p, vec2 per, float salt) {
  uint s = hseed(salt);
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 i00 = ivec2(mod(i, per)), i11 = ivec2(mod(i + 1.0, per));
  float a = hS(i00, s), b = hS(ivec2(i11.x, i00.y), s), c = hS(ivec2(i00.x, i11.y), s), d = hS(i11, s);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
/** Tileable noise over uv with integer frequency f (per axis). */
float noise(vec2 uv, vec2 f, float salt) { return gnoise(uv * f, f, salt); }

float octFade(float f) {
  float lim = uSize * float(uSS);
  return 1.0 - smoothstep(lim * 0.22, lim * 0.45, f);
}
/** Tileable fBm, base integer frequency f, approx [-1,1]. High octaves fade out below texel size. */
float fbm(vec2 uv, vec2 f, int oct, float gain, float salt) {
  float s = 0.0, a = 1.0, w = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    float fd = octFade(max(f.x, f.y));
    w += a;
    if (fd <= 0.0) break;
    s += a * fd * gnoise(uv * f, f, salt + float(i) * 13.0);
    a *= gain;
    f *= 2.0;
  }
  return s / max(w, 1e-4);
}
/** Ridged fBm in [0,1] (1 = ridge crest). */
float ridged(vec2 uv, vec2 f, int oct, float gain, float salt) {
  float s = 0.0, a = 1.0, w = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float fd = octFade(max(f.x, f.y));
    w += a;
    if (fd <= 0.0) break;
    float n = 1.0 - abs(gnoise(uv * f, f, salt + float(i) * 13.0));
    s += a * fd * n * n;
    a *= gain;
    f *= 2.0;
  }
  return s / max(w, 1e-4);
}
/** Turbulence (abs fBm) in [0,1]. */
float turb(vec2 uv, vec2 f, int oct, float gain, float salt) {
  float s = 0.0, a = 1.0, w = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float fd = octFade(max(f.x, f.y));
    w += a;
    if (fd <= 0.0) break;
    s += a * fd * abs(gnoise(uv * f, f, salt + float(i) * 13.0));
    a *= gain;
    f *= 2.0;
  }
  return s / max(w, 1e-4);
}
/** Tileable domain warp offset (uv units). */
vec2 warp(vec2 uv, float f, float amp, float salt) {
  return amp * vec2(fbm(uv, vec2(f), 3, 0.5, salt), fbm(uv, vec2(f), 3, 0.5, salt + 5.0));
}

// ---------------------------------------------------------------------------- cellular
/** Periodic Worley: x=F1, y=F2 (cell units), z=id of nearest cell [0,1), w=id of 2nd nearest. */
vec4 worley(vec2 uv, vec2 cells, float jit, float salt) {
  uint s = hseed(salt);
  vec2 p = uv * cells;
  vec2 i = floor(p);
  vec2 f = p - i;
  float d1 = 9.0, d2 = 9.0, id = 0.0, id2 = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      ivec2 c = ivec2(mod(i + g, cells));
      vec3 hh = h3S(c, s);
      vec2 o = 0.5 + jit * (hh.xy - 0.5);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; id2 = id; d1 = d; id = hh.z; }
      else if (d < d2) { d2 = d; id2 = hh.z; }
    }
  }
  return vec4(sqrt(d1), sqrt(d2), id, id2);
}
/** Periodic Voronoi with exact border distance: x=distance to cell border (cell units), y=cell id,
 *  zw = vector from p to the cell's feature point (cell units). */
vec4 voronoi(vec2 uv, vec2 cells, float jit, float salt) {
  uint s = hseed(salt);
  vec2 p = uv * cells;
  vec2 n = floor(p);
  vec2 f = p - n;
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 9.0, id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      ivec2 c = ivec2(mod(n + g, cells));
      vec3 hh = h3S(c, s);
      vec2 o = 0.5 + jit * (hh.xy - 0.5);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; id = hh.z; }
    }
  }
  md = 9.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      ivec2 c = ivec2(mod(n + g, cells));
      vec2 o = 0.5 + jit * (h2S(c, s) - 0.5);
      vec2 r = g + o - f;
      vec2 dd = r - mr;
      if (dot(dd, dd) > 1e-6) md = min(md, dot(0.5 * (mr + r), normalize(dd)));
    }
  }
  return vec4(md, id, mr);
}

// ---------------------------------------------------------------------------- SDF / shapes
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdRBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
/** Segment param t (0..1) of the closest point. */
float segT(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); }
/** Approximate ellipse SDF (good near the boundary). */
float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
/** Smooth min. */
float smin(float a, float b, float k) { float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

/** Anti-aliased coverage of a signed distance in uv units (negative inside). */
float cover(float d) { return clamp(0.5 - d * uSize * float(uSS), 0.0, 1.0); }
/** Coverage with extra softness (in texels). */
float coverSoft(float d, float soft) { return clamp(0.5 - d * uSize * float(uSS) / max(1.0, soft * float(uSS)), 0.0, 1.0); }
/** Texel size in uv. */
float texel() { return 1.0 / uSize; }

/** Rounded bevel profile: 0 at the edge (d=0) rising to 1 at distance w inside. */
float bevel(float d, float w) { float t = sat(d / w); return sqrt(1.0 - (1.0 - t) * (1.0 - t)); }

// ---------------------------------------------------------------------------- compositing
/** Paint `col` (with height h, roughness r) over m with coverage c; alpha accumulates. */
void over(inout Mat m, vec3 col, float h, float r, float c) {
  m.col = mix(m.col, col, c);
  m.h = mix(m.h, h, c);
  m.r = mix(m.r, r, c);
  m.a = max(m.a, c);
}
Mat mixMat(Mat a, Mat b, float t) {
  return M(mix(a.col, b.col, t), mix(a.a, b.a, t), mix(a.h, b.h, t), mix(a.r, b.r, t));
}
/** Local 16-px grid helpers (Minecraft pixel units). */
vec2 mcpx(vec2 uv) { return uv * 16.0; }
/** Distance (uv) to the nearest tile border. */
float borderDist(vec2 uv) { vec2 d = min(uv, 1.0 - uv); return min(d.x, d.y); }

/** The 'missing' texture: magenta/black checker. */
Mat missingTex(vec2 uv) {
  vec2 c = floor(uv * 2.0);
  float k = mod(c.x + c.y, 2.0);
  return M(mix(rgb(0x0a0a0a), rgb(0xf800f8), k), 1.0, 0.5, 0.6);
}
