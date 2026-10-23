// Sand surface model shared by the terrain (and anything that wants matching sand).
// Requires HASH_GLSL, ATMOSPHERE_USE_GLSL and SHADOW_GLSL to be included first.
export const SAND_GLSL = /* glsl */ `
#ifndef SAND_GLSL
#define SAND_GLSL
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindSpeed;
#ifndef DECL_WIND_OFFSET
#define DECL_WIND_OFFSET
uniform vec2 uWindOffset;
#endif
uniform vec3 uSunDir;
uniform vec4 uOases[4];
uniform int uOasisCount;
uniform sampler2D tDeform;
uniform vec4 uDeformRect;

// Ripples form perpendicular to the prevailing (dune-forming) wind.
const vec2 RIPPLE_WIND = vec2(-0.70710678, 0.70710678);

struct SandSurface {
  vec3 N;
  vec3 albedo;
  float sparkle;
  float roughness;
  float wet;
  float ao;
  float printShadow;
};

// Slope of a skewed sine (gentle stoss, steeper lee) for phase th in radians.
float rippleSlope(float th) {
  const float k = 0.55;
  return cos(th + k * sin(th)) * (1.0 + k * cos(th));
}

// Gradient (world xz) of the wind-ripple height field. Ripples fade out before they
// get smaller than a few pixels, which keeps them from shimmering in the distance.
vec2 rippleGradient(vec2 p, float footprint) {
  vec2 g = vec2(0.0);
  float warp = fbm3(p * 0.42) * 2.6 + vnoise(p * 1.9 + 3.1) * 0.7;
  float lambda = 0.11;
  float aa = 1.0 - smoothstep(0.18, 0.5, footprint / lambda);
  if (aa > 0.0) {
    float th = 6.2831853 * fract(dot(p, RIPPLE_WIND) / lambda + warp);
    g += RIPPLE_WIND * (rippleSlope(th) * (6.2831853 / lambda) * 0.0042 * aa);
  }
  // Weaker oblique set from secondary winds: gives forks and cross-hatching.
  vec2 dir2 = vec2(-0.4226, 0.9063);
  float lambda2 = 0.083;
  float aa2 = 1.0 - smoothstep(0.18, 0.5, footprint / lambda2);
  if (aa2 > 0.0) {
    float th2 = 6.2831853 * fract(dot(p, dir2) / lambda2 + warp * 0.8 + 0.31);
    g += dir2 * (rippleSlope(th2) * (6.2831853 / lambda2) * 0.0014 * aa2);
  }
  return g;
}

float sandSparkle(vec3 p, vec3 N, vec3 V, vec3 L, float dist, float footprint) {
#ifdef USE_SPARKLE
  if (dist > 28.0) return 0.0;
  vec2 g = p.xz * 90.0;
  vec2 cell = floor(g);
  vec3 r = hash32(cell);
  if (r.z < 0.93) return 0.0;
  // A grain is a point, not the whole cell: keep the glint to a small jittered disc so
  // nearby sparkles stay pin-sharp instead of becoming flakes.
  float pt = 1.0 - smoothstep(0.08, 0.2, length(fract(g) - 0.25 - 0.5 * r.xy));
  if (pt <= 0.0) return 0.0;
  // Random quartz facet tilted around the surface normal; only a few line up with the
  // half vector at any moment, and they twinkle as the viewer moves.
  vec3 fn = normalize(N + vec3(r.x - 0.5, 0.0, r.y - 0.5) * 1.6);
  vec3 H = normalize(L + V);
  float s = pow(max(dot(fn, H), 0.0), 1400.0);
  float fade = (1.0 - smoothstep(3.0, 12.0, dist)) * (1.0 - smoothstep(0.01, 0.025, footprint));
  return s * 5.0 * fade * pt;
#else
  return 0.0;
#endif
}

// Qualitative Oren-Nayar: rough, retro-reflective sand gets brighter looking down-sun.
float orenNayar(vec3 N, vec3 L, vec3 V, float sigma) {
  float s2 = sigma * sigma;
  float A = 1.0 - 0.5 * s2 / (s2 + 0.33);
  float B = 0.45 * s2 / (s2 + 0.09);
  float NdotL = dot(N, L);
  float NdotV = max(dot(N, V), 1e-3);
  float s = dot(L, V) - NdotL * NdotV;
  float t = s > 0.0 ? max(max(NdotL, NdotV), 1e-3) : 1.0;
  return max(NdotL, 0.0) * max(A + B * s / t, 0.0);
}

float ggxSpecular(vec3 N, vec3 V, vec3 L, float rough, float f0) {
  vec3 H = normalize(V + L);
  float NdotH = max(dot(N, H), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-3);
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159265 * d * d);
  float k = a * 0.5;
  float G = NdotL / (NdotL * (1.0 - k) + k) * NdotV / (NdotV * (1.0 - k) + k);
  float F = f0 + (1.0 - f0) * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  return D * G * F / (4.0 * NdotV);
}

// Footprints: x = height offset (m), y = disturbance. Gradient by central differences.
vec4 sampleDeform(vec2 pxz) {
#ifdef USE_FOOTPRINTS
  vec2 uv = (pxz - uDeformRect.xy) * uDeformRect.w;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  float e = 0.03 * uDeformRect.w;
  vec2 c = textureLod(tDeform, uv, 0.0).rg;
  float hx = textureLod(tDeform, uv + vec2(e, 0.0), 0.0).r - textureLod(tDeform, uv - vec2(e, 0.0), 0.0).r;
  float hz = textureLod(tDeform, uv + vec2(0.0, e), 0.0).r - textureLod(tDeform, uv - vec2(0.0, e), 0.0).r;
  vec2 edge = min(uv, 1.0 - uv);
  float fade = smoothstep(0.0, 0.08, min(edge.x, edge.y));
  return vec4(vec2(hx, hz) / 0.06, c.y, c.x) * fade;
#else
  return vec4(0.0);
#endif
}

// Shadow cast by the walls of a footprint onto its floor at low sun: a few taps toward
// the light through the deformation map.
float footprintShadow(vec2 pxz, float h0, vec3 L) {
#ifdef USE_FOOTPRINTS
  float hl = length(L.xz);
  if (L.y <= 0.0 || hl < 1e-4) return 1.0;
  vec2 dir = L.xz / hl;
  float tanL = L.y / hl;
  float vis = 1.0;
  for (int i = 1; i <= 4; i++) {
    float t = float(i) * 0.035;
    vec2 uv = (pxz + dir * t - uDeformRect.xy) * uDeformRect.w;
    float h = textureLod(tDeform, uv, 0.0).r;
    vis = min(vis, clamp((h0 + t * tanL - h) * 90.0 + 0.6, 0.0, 1.0));
  }
  return vis;
#else
  return 1.0;
#endif
}

SandSurface sandSurface(vec3 p, vec4 nd, float footprint, float dist, vec3 V) {
  SandSurface s;
  vec2 grad = nd.xy;
  float lee = clamp(nd.z, 0.0, 1.0);
  float curv = nd.w;
  float slope = length(grad);

  // --- Albedo: iron-stained Saharan sand with large patches of redder and paler sand.
  float n1 = fbm3(p.xz * 0.0031 + 7.3);
  float n2 = vnoise(p.xz * 0.045);
  vec3 redder = vec3(0.60, 0.29, 0.125);
  vec3 paler = vec3(0.68, 0.44, 0.245);
  vec3 alb = mix(redder, paler, smoothstep(0.28, 0.72, n1));
  alb *= 0.93 + 0.12 * n2;
  // Wind sorts fine, pale grains onto crests; coarser darker grains collect in troughs.
  float crest = clamp(-curv * 3.0, 0.0, 1.0);
  float trough = clamp(curv * 3.0, 0.0, 1.0);
  alb *= 1.0 + 0.1 * crest - 0.12 * trough;
  // Slip faces: fresh avalanche sand in long down-slope grainflow strips.
  vec2 up = slope > 1e-4 ? grad / slope : vec2(1.0, 0.0);
  vec2 acr = vec2(-up.y, up.x);
  float streak = vnoise(vec2(dot(p.xz, acr) * 0.9, dot(p.xz, up) * 0.07));
  alb *= 1.0 + lee * (streak - 0.5) * 0.12;

  // --- Normal: macro gradient + ripples + footprints.
  float ripple = 1.0;
  ripple *= 1.0 - 0.92 * smoothstep(0.15, 0.6, lee);
  ripple *= 1.0 - smoothstep(0.45, 0.75, slope);
  ripple *= 0.55 + 0.45 * smoothstep(0.2, 0.7, fbm3(p.xz * 0.06 + 3.0));
  vec4 fp = sampleDeform(p.xz);
  float disturbed = clamp(fp.z, 0.0, 1.0);
  ripple *= 1.0 - disturbed;
  alb *= 1.0 - 0.13 * disturbed;

  // Oasis: damp sand at the waterline and darker, organic soil on the vegetated rim.
  float wet = 0.0;
  float soil = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uOasisCount) break;
    vec4 o = uOases[i];
    float d = length(p.xz - o.xy) / (o.z * 1.7);
    if (d < 2.2) {
      wet = max(wet, (1.0 - smoothstep(0.02, 0.55, p.y - o.w)) * (1.0 - smoothstep(1.2, 1.6, d)));
      // Organic soil under the palms, broken up so the rim has no hard edge.
      float n = fbm3(p.xz * 0.08);
      soil = max(soil, (1.0 - smoothstep(0.55, 1.35, d + (n - 0.5) * 0.5)) * 0.8);
    }
  }
  alb = mix(alb, alb * vec3(0.8, 0.76, 0.7), soil * 0.6);
  alb *= 1.0 - 0.45 * wet;
  ripple *= (1.0 - wet) * (1.0 - 0.6 * soil);

  vec2 rg = vec2(0.0);
#ifdef USE_RIPPLES
  if (ripple > 0.01 && dist < 80.0) rg = rippleGradient(p.xz, footprint) * ripple;
#endif
  vec2 totalGrad = grad + rg + fp.xy;
  s.N = normalize(vec3(-totalGrad.x, 1.0, -totalGrad.y));

  // Drifting sand sheets streaming downwind in strong wind.
  float windAmt = smoothstep(6.0, 14.0, uWindSpeed);
  if (windAmt > 0.0 && dist < 450.0) {
    vec2 wd = uWindDir;
    vec2 q = p.xz - uWindOffset;
    vec2 a = vec2(dot(q, vec2(-wd.y, wd.x)), dot(q, wd));
    float n = fbm3(vec2(a.x * 0.8, a.y * 0.1));
    float drift = smoothstep(0.5, 0.82, n) * windAmt * (1.0 - smoothstep(180.0, 450.0, dist));
    drift *= 1.0 - wet;
    alb = mix(alb, alb * 1.12 + vec3(0.025, 0.018, 0.01), drift);
  }

  s.albedo = alb;
  s.wet = wet;
  s.roughness = mix(0.9, 0.3, wet);
  s.ao = (1.0 - 0.25 * trough) * (1.0 - 0.45 * smoothstep(0.0, -0.035, fp.w));
  s.printShadow = disturbed > 0.02 && dist < 30.0 ? footprintShadow(p.xz, fp.w, uLightDir) : 1.0;
  s.sparkle = ripple > 0.0 ? 1.0 : 0.0;
  return s;
}

vec3 shadeSand(SandSurface s, vec3 p, vec3 V, float terrainShadow) {
  vec3 L = uLightDir;
  vec3 N = s.N;
  float vis = terrainShadow * objectShadow(p) * s.printShadow;
  vec3 E = keyLightIrradiance();
  float diff = orenNayar(N, L, V, 0.6);
  vec3 col = s.albedo / ATM_PI * (E * (diff * vis) + skyIrradiance(N) * s.ao);
  // Wet sand reflects a little; dry sand only a faint sheen.
  float spec = ggxSpecular(N, V, L, s.roughness, mix(0.02, 0.05, s.wet)) * mix(0.25, 1.0, s.wet);
  col += E * vis * spec;
  float dist = length(cameraPosition - p);
  col += E * vis * sandSparkle(p, N, V, L, dist, 0.0) * s.sparkle;
  return col;
}
#endif
`;
