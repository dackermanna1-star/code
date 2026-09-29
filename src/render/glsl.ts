// Shared GLSL snippets: hashing, periodic noise, voronoi, color helpers.
// All "p*" functions are periodic with integer period `rep` so baked textures
// tile seamlessly.

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718

float saturate(float x){ return clamp(x, 0.0, 1.0); }
vec3 saturate3(vec3 x){ return clamp(x, 0.0, 1.0); }

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash32(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

// periodic gradient noise, range ~[-1,1]
float pnoise(vec2 p, vec2 rep){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 i00 = mod(i, rep);
  vec2 i10 = mod(i + vec2(1.0,0.0), rep);
  vec2 i01 = mod(i + vec2(0.0,1.0), rep);
  vec2 i11 = mod(i + vec2(1.0,1.0), rep);
  vec2 g00 = hash22(i00)*2.0-1.0;
  vec2 g10 = hash22(i10)*2.0-1.0;
  vec2 g01 = hash22(i01)*2.0-1.0;
  vec2 g11 = hash22(i11)*2.0-1.0;
  float n00 = dot(g00, f);
  float n10 = dot(g10, f - vec2(1.0,0.0));
  float n01 = dot(g01, f - vec2(0.0,1.0));
  float n11 = dot(g11, f - vec2(1.0,1.0));
  return 1.4 * mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

float pfbm(vec2 p, vec2 rep, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    s += a * pnoise(p, rep);
    n += a;
    p *= 2.0; rep *= 2.0; a *= 0.5;
  }
  return s / n;
}

// ridged periodic fbm in [0,1]
float pridge(vec2 p, vec2 rep, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    float v = 1.0 - abs(pnoise(p, rep));
    s += a * v * v;
    n += a;
    p *= 2.0; rep *= 2.0; a *= 0.5;
  }
  return s / n;
}

// periodic voronoi: x=F1, y=F2, z=cell hash
vec3 pvoronoi(vec2 p, vec2 rep, float jitter){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int y=-1; y<=1; y++){
    for (int x=-1; x<=1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 cell = mod(i + g, rep);
      vec2 o = hash22(cell) * jitter + (1.0 - jitter) * 0.5;
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1){ f2 = f1; f1 = d; id = hash12(cell + 17.0); }
      else if (d < f2){ f2 = d; }
    }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}

// non periodic helpers
float noise2(vec2 p){ return pnoise(p, vec2(4096.0)); }
float fbm2(vec2 p, int oct){ return pfbm(p, vec2(4096.0), oct); }

vec3 srgbToLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 hex(float h){
  // helper not used at runtime; colors passed as vec3 literal
  return vec3(h);
}
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// Rounded box SDF 2D
float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

// Periodic 3D value noise usable in material shaders (object/world space).
export const GLSL_NOISE3 = /* glsl */ `
float hash13(vec3 p3){
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise3(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash13(i);
  float n100 = hash13(i+vec3(1,0,0));
  float n010 = hash13(i+vec3(0,1,0));
  float n110 = hash13(i+vec3(1,1,0));
  float n001 = hash13(i+vec3(0,0,1));
  float n101 = hash13(i+vec3(1,0,1));
  float n011 = hash13(i+vec3(0,1,1));
  float n111 = hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i=0;i<4;i++){ s += a*vnoise3(p); p *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
`;
