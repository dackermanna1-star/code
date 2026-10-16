// Shared GLSL. All world shaders (voxels, terrain, glass, signs, particles, sky) use the same
// lighting and fog code so the atmosphere is coherent.

export const MAX_LIGHTS = 24

export const commonUniformsGLSL = /* glsl */ `
uniform float uTime;
uniform float uGameMinutes;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uIndoorAmb;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uLitFraction;
uniform float uStreetOn;
uniform float uNight;
uniform float uSnowCover;
uniform vec3 uFogColor;
uniform vec3 uFogHorizon;
uniform vec3 uFogGlow;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uScatter;
uniform float uWhiteout;
uniform vec2 uWhiteoutCenter;
uniform int uNumLights;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform vec4 uLightDir[${MAX_LIGHTS}];
uniform vec4 uLightParam[${MAX_LIGHTS}];
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform float uFlashOn;
`

export const hashGLSL = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
  float e = hash13(i + vec3(0,0,1)), f2 = hash13(i + vec3(1,0,1)), g = hash13(i + vec3(0,1,1)), h = hash13(i + vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f2,u.x), mix(g,h,u.x), u.y), u.z);
}
`

// Lighting: point/spot lights with smooth windowed falloff, domain masks (outdoor/indoor),
// optional Blinn specular for glossy surfaces, plus the player's flashlight.
export const lightingGLSL = /* glsl */ `
vec3 evalLights(vec3 P, vec3 N, float domain, vec3 V, float gloss, float wrap, inout vec3 spec) {
  vec3 sum = vec3(0.0);
  float shin = mix(6.0, 220.0, gloss);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNumLights) break;
    vec4 lc = uLightCol[i];
    float dm = lc.w;
    if (dm < 2.5 && abs(dm - domain) > 0.5) continue;
    vec4 lp = uLightPos[i];
    vec3 L = lp.xyz - P;
    float d2 = dot(L, L);
    float r = lp.w;
    if (d2 > r * r) continue;
    float d = sqrt(d2);
    L /= max(d, 1e-4);
    float q = d / r; q = q * q; q = clamp(1.0 - q * q, 0.0, 1.0);
    float att = q * q / (d2 + 1.0);
    vec4 ld = uLightDir[i];
    if (ld.w > -1.5) {
      float cd = dot(-L, ld.xyz);
      att *= smoothstep(ld.w, uLightParam[i].x, cd);
    }
    float ndl = (dot(N, L) + wrap) / (1.0 + wrap);
    ndl = max(ndl, 0.0);
    sum += lc.rgb * att * ndl;
    if (gloss > 0.0) {
      vec3 H = normalize(L + V);
      spec += lc.rgb * att * pow(max(dot(N, H), 0.0), shin) * gloss * (shin * 0.04 + 0.5);
    }
  }
  if (uFlashOn > 0.0) {
    vec3 L = uFlashPos - P; float d2 = dot(L, L); float d = sqrt(d2); L /= max(d, 1e-4);
    float cd = dot(-L, uFlashDir);
    float cone = smoothstep(0.82, 0.97, cd);
    float att = cone * 4.0 / (d2 + 0.6) * clamp(1.0 - d / 22.0, 0.0, 1.0);
    sum += vec3(0.95, 0.97, 1.0) * att * max(dot(N, L), 0.0) * uFlashOn;
  }
  return sum;
}
`

// Exponential height fog with analytic single scattering from the nearest lights.
export const fogGLSL = /* glsl */ `
vec3 fogSky(vec3 rd) {
  float hz = 1.0 - clamp(rd.y * 2.2 + 0.05, 0.0, 1.0);
  vec3 c = mix(uFogColor, uFogHorizon, pow(hz, 2.2));
  c += uFogGlow * pow(hz, 6.0);
  return c;
}

float fogAmount(vec3 ro, vec3 rd, float dist) {
  float k = uFogFalloff;
  float a = uFogDensity * exp(-k * (ro.y - uFogBase));
  float ky = k * rd.y;
  float f = abs(ky) > 1e-4 ? a * (1.0 - exp(-ky * dist)) / ky : a * dist;
  // whiteout band at the world edge
  return f;
}

vec3 lampScatter(vec3 ro, vec3 rd, float dist) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNumLights) break;
    vec4 lp = uLightPos[i];
    vec4 prm = uLightParam[i];
    if (prm.y <= 0.0) continue;
    vec3 rel = lp.xyz - ro;
    float tp = dot(rel, rd);
    vec3 cp = rel - rd * tp;
    float h2 = dot(cp, cp) + 0.04;
    float h = sqrt(h2);
    float integ = (atan((dist - tp) / h) - atan(-tp / h)) / h;
    // spot lights: weight by cone at closest point
    vec4 ld = uLightDir[i];
    float w = 1.0;
    if (ld.w > -1.5) {
      vec3 cpw = ro + rd * clamp(tp, 0.0, dist);
      vec3 Ld = normalize(cpw - lp.xyz);
      w = smoothstep(ld.w - 0.25, prm.x, dot(Ld, ld.xyz)) * 0.85 + 0.15;
    }
    s += uLightCol[i].rgb * integ * prm.y * w;
  }
  return s;
}

vec3 applyFog(vec3 col, vec3 P) {
  vec3 ro = cameraPosition;
  vec3 rd = P - ro;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  float fa = fogAmount(ro, rd, dist);
  // whiteout near the world edge: extra uniform fog proportional to distance
  fa += uWhiteout * dist * 0.06;
  float tr = exp(-fa);
  vec3 fc = fogSky(rd);
  fc = mix(fc, uFogHorizon * 1.15 + vec3(0.02), clamp(uWhiteout, 0.0, 1.0) * 0.6);
  vec3 sc = lampScatter(ro, rd, dist) * uScatter;
  return col * tr + fc * (1.0 - tr) + sc * (0.35 + 0.65 * (1.0 - tr));
}
`

// Window shading: procedural lit apartments. wid = window id (extra byte), seed = instance seed.
export const windowGLSL = /* glsl */ `
vec3 shadeWindow(float wid, float seed, vec2 uv, vec3 N, vec3 V, vec3 P, float emisScale, out float litOut) {
  float h1 = hash12(vec2(seed * 917.13, wid * 13.17));
  float epoch = floor(uGameMinutes / 11.0 + h1 * 37.0);
  float h2 = hash12(vec2(seed * 311.7 + epoch * 1.37, wid * 7.71));
  float lit = step(h2, uLitFraction);
  litOut = lit;
  float t = hash12(vec2(seed * 53.3, wid * 3.31 + 0.5));
  vec3 wc;
  float tv = 0.0;
  if (t < 0.46) wc = vec3(1.0, 0.60, 0.26);           // incandescent
  else if (t < 0.60) wc = vec3(1.0, 0.44, 0.16);      // orange curtains
  else if (t < 0.70) wc = vec3(0.92, 0.80, 0.55);     // pale yellow
  else if (t < 0.79) wc = vec3(0.70, 0.86, 0.95);     // cold fluorescent kitchen
  else if (t < 0.88) { wc = vec3(0.45, 0.60, 1.0); tv = 1.0; } // only a TV on
  else if (t < 0.94) wc = vec3(0.85, 0.42, 0.30);     // red curtains
  else wc = vec3(0.55, 0.75, 0.45);                   // green curtains
  // interior hint: ceiling lamp hot spot, curtains at the sides, sill shadow at the bottom
  vec2 c = uv - vec2(0.5, 0.62);
  float spot = exp(-dot(c, c) * 5.0);
  float curtain = smoothstep(0.0, 0.22, uv.x) * smoothstep(0.0, 0.22, 1.0 - uv.x);
  float tulle = 0.85 + 0.15 * sin(uv.x * 60.0 + h1 * 6.0);
  float inten = (0.45 + 0.75 * spot) * mix(0.55, 1.0, curtain) * tulle;
  inten *= mix(0.6, 1.25, hash12(vec2(wid, seed * 7.0)));
  if (tv > 0.5) {
    float fl = 0.55 + 0.45 * vnoise2(vec2(uTime * 6.0 + wid, seed * 50.0));
    inten = (0.25 + 0.5 * fl) * (0.6 + 0.4 * spot);
  }
  // silhouette passing (very rare)
  float sil = step(0.985, hash12(vec2(floor(uTime / 23.0 + h1 * 9.0), wid + seed * 101.0)));
  if (sil > 0.5) {
    float sx = fract(uTime / 23.0 + h1 * 9.0) * 1.6 - 0.3;
    float body = smoothstep(0.16, 0.10, abs(uv.x - sx)) * step(uv.y, 0.85);
    inten *= 1.0 - 0.75 * body;
  }
  vec3 litCol = wc * inten * emisScale;
  // dark glass: faint reflection of the sky and street glow
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 refl = fogSky(reflect(-V, N)) * (0.10 + 0.5 * fres);
  return mix(refl, litCol + refl * 0.25, lit);
}
`
