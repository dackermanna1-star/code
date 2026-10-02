import { ATMO, CLOUD_KM_PER_BLOCK, SKY_SEA_LEVEL, MULTISCAT_LUT_SIZE, TRANSMITTANCE_LUT_SIZE } from '../constants';

const f = (v: number) => {
  const s = String(v);
  return /[.eE]/.test(s) ? s : s + '.0';
};
const v3 = (a: readonly number[]) => `vec3(${a.map(f).join(', ')})`;

/**
 * Constants + pure functions (no uniforms). Everything is prefixed atmo_/ATMO_ so it can be
 * concatenated into other shaders.
 */
export const GLSL_ATMO_COMMON = /* glsl */ `
const float ATMO_PI = 3.14159265358979;
const float ATMO_RB = ${f(ATMO.bottomRadius)};
const float ATMO_RT = ${f(ATMO.topRadius)};
const vec3  ATMO_RAY_SCAT = ${v3(ATMO.rayleighScattering)};
const float ATMO_RAY_H = ${f(ATMO.rayleighScaleHeight)};
const float ATMO_MIE_SCAT = ${f(ATMO.mieScattering)};
const float ATMO_MIE_EXT = ${f(ATMO.mieExtinction)};
const float ATMO_MIE_H = ${f(ATMO.mieScaleHeight)};
const float ATMO_MIE_G = ${f(ATMO.mieG)};
const vec3  ATMO_OZONE_ABS = ${v3(ATMO.ozoneAbsorption)};
const float ATMO_OZONE_C = ${f(ATMO.ozoneCenter)};
const float ATMO_OZONE_W = ${f(ATMO.ozoneHalfWidth)};
const float ATMO_GROUND_ALBEDO = ${f(ATMO.groundAlbedo)};
const vec2  ATMO_TRANS_RES = vec2(${f(TRANSMITTANCE_LUT_SIZE[0])}, ${f(TRANSMITTANCE_LUT_SIZE[1])});
const float ATMO_MS_RES = ${f(MULTISCAT_LUT_SIZE)};
const float ATMO_SEA_LEVEL = ${f(SKY_SEA_LEVEL)};
const float ATMO_CLOUD_KM_PER_BLOCK = ${f(CLOUD_KM_PER_BLOCK)};
const float ATMO_H_TOP = ${f(ATMO.topRadius - ATMO.bottomRadius)};

float atmo_luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void atmo_medium(float h, out vec3 scatR, out float scatM, out vec3 ext) {
  float hh = max(h, 0.0);
  float dR = exp(-hh / ATMO_RAY_H);
  float dM = exp(-hh / ATMO_MIE_H);
  float dO = max(0.0, 1.0 - abs(hh - ATMO_OZONE_C) / ATMO_OZONE_W);
  scatR = ATMO_RAY_SCAT * dR;
  scatM = ATMO_MIE_SCAT * dM;
  ext = scatR + vec3(ATMO_MIE_EXT * dM) + ATMO_OZONE_ABS * dO;
}

float atmo_rayleighPhase(float c) { return 3.0 / (16.0 * ATMO_PI) * (1.0 + c * c); }
float atmo_hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * ATMO_PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-5), 1.5));
}
// Cornette-Shanks
float atmo_miePhase(float c) {
  float g = ATMO_MIE_G, g2 = g * g;
  return 3.0 / (8.0 * ATMO_PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-5), 1.5));
}

float atmo_fromUnitToSubUvs(float u, float res) { return (u + 0.5 / res) * (res / (res + 1.0)); }
float atmo_fromSubUvsToUnit(float u, float res) { return (u - 0.5 / res) * (res / (res - 1.0)); }

// Transmittance LUT parametrisation (Bruneton/Hillaire), using altitude h (km) for precision.
vec2 atmo_transmittanceUV(float h, float mu) {
  const float H = sqrt(ATMO_RT * ATMO_RT - ATMO_RB * ATMO_RB);
  float r = ATMO_RB + h;
  float rho = sqrt(max(h * (2.0 * ATMO_RB + h), 0.0));
  float disc = r * r * mu * mu + (ATMO_RT - r) * (ATMO_RT + r);
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dMin = ATMO_RT - r;
  float dMax = rho + H;
  return vec2((d - dMin) / max(dMax - dMin, 1e-6), rho / H);
}

// Cosine of the geometric horizon seen from altitude h (negative).
float atmo_horizonMu(float h) {
  float r = ATMO_RB + h;
  return -sqrt(max(h * (2.0 * ATMO_RB + h), 0.0)) / r;
}

// Soft planet shadow (finite sun disk ~0.5 deg) for light zenith cosine mu at altitude h.
float atmo_planetShadow(float h, float mu) {
  return smoothstep(-0.008, 0.008, mu - atmo_horizonMu(h));
}

// Sky-view / cloud-env panorama parametrisation: upper hemisphere, world azimuth on u, sqrt(elevation) on v.
vec2 atmo_skyViewUV(vec3 d, vec2 res) {
  float el = asin(clamp(d.y, 0.0, 1.0));
  float v = sqrt(el / (0.5 * ATMO_PI));
  float az = (abs(d.x) + abs(d.z) < 1e-7) ? 0.0 : atan(d.z, d.x);
  return vec2(az / (2.0 * ATMO_PI) + 0.5, atmo_fromUnitToSubUvs(v, res.y));
}
vec3 atmo_skyViewDir(vec2 uv, vec2 res) {
  float v = clamp(atmo_fromSubUvsToUnit(uv.y, res.y), 0.0, 1.0);
  float el = v * v * 0.5 * ATMO_PI;
  float az = (uv.x - 0.5) * 2.0 * ATMO_PI;
  float ce = cos(el);
  return vec3(ce * cos(az), sin(el), ce * sin(az));
}

// Altitude (km) in the atmosphere model for a block-space height (kept near ground level).
float atmo_altitudeForY(float y) { return 0.02 + max(y, 0.0) * 0.00025; }

// 32-bit integer hash (explicit highp: fragment shaders default int to mediump)
highp uint atmo_hashU(highp uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
highp vec3 atmo_hash33(highp uvec3 v) {
  highp uint a = atmo_hashU(v.x ^ atmo_hashU(v.y ^ atmo_hashU(v.z)));
  highp uint b = atmo_hashU(a ^ 0x9e3779b9u);
  highp uint c = atmo_hashU(b ^ 0x85ebca6bu);
  return vec3(uvec3(a, b, c) >> 8u) * (1.0 / 16777216.0);
}
`;

/** Public uniforms (names must match Atmosphere.uniforms). */
export const GLSL_ATMO_UNIFORMS = /* glsl */ `
uniform highp sampler2D atmo_transmittanceLUT;
uniform highp sampler2D atmo_multiScatLUT;
uniform highp sampler2D atmo_skyViewLUT;
uniform highp sampler2D atmo_cloudEnvMap;
uniform highp sampler2D atmo_cloudShadowMap;
uniform highp vec2 atmo_skyViewSize;
uniform highp vec2 atmo_cloudEnvSize;
uniform highp vec3 atmo_sunDir;
uniform highp vec3 atmo_moonDir;
uniform highp vec3 atmo_sunIlluminance;
uniform highp vec3 atmo_moonIlluminance;
uniform highp vec3 atmo_lightDir;
uniform highp vec3 atmo_lightColor;
uniform highp vec3 atmo_cameraPos;
uniform highp float atmo_cameraAltKm;
uniform highp vec3 atmo_sunTransCam;
uniform highp vec3 atmo_moonTransCam;
uniform highp vec4 atmo_fogParams;
uniform highp vec4 atmo_hazeParams;
uniform highp vec4 atmo_weather;
uniform highp int atmo_dimension;
uniform highp vec3 atmo_dimFogColor;
uniform highp vec3 atmo_nightGlow;
uniform highp vec4 atmo_cloudShadowParams;
uniform highp vec4 atmo_cloudShadowParams2;
uniform highp vec3 atmo_cloudShadowLight;
uniform highp vec3 atmo_ambientSH[9];
`;

/** Public functions. Requires GLSL_ATMO_UNIFORMS + GLSL_ATMO_COMMON before it. */
export const GLSL_ATMO_API = /* glsl */ `
vec3 atmo_transmittance(float h, float mu) {
  return texture(atmo_transmittanceLUT, atmo_transmittanceUV(h, mu)).rgb;
}
vec3 atmo_multiScat(float h, float mu) {
  vec2 uv = clamp(vec2(mu * 0.5 + 0.5, h / ATMO_H_TOP), 0.0, 1.0);
  uv = vec2(atmo_fromUnitToSubUvs(uv.x, ATMO_MS_RES), atmo_fromUnitToSubUvs(uv.y, ATMO_MS_RES));
  return texture(atmo_multiScatLUT, uv).rgb;
}

// Rain / thunder grading of sky light: greyer, darker.
vec3 atmo_weatherGrade(vec3 L) {
  float rain = atmo_weather.x, thunder = atmo_weather.y;
  float lum = atmo_luminance(L);
  L = mix(L, vec3(lum) * vec3(0.93, 0.98, 1.06), rain * 0.8);
  return L * (1.0 - 0.5 * rain) * (1.0 - 0.45 * thunder);
}

vec3 atmo_netherSky(vec3 d) {
  float g = 0.8 + 0.2 * (1.0 - abs(d.y));
  float w = 0.92 + 0.08 * sin(d.x * 5.1 + atmo_weather.w * 0.05) * sin(d.z * 4.3 - d.y * 3.0);
  return atmo_dimFogColor * g * w;
}

vec3 atmo_endSky(vec3 d) {
  vec3 base = atmo_dimFogColor;
  float horizon = exp(-abs(d.y) * 3.0);
  return base * (0.55 + 0.45 * horizon);
}

// Clear overworld sky from the sky-view LUT (no weather, no celestial bodies).
vec3 atmo_skyClear(vec3 d) {
  float below = max(-d.y, 0.0);
  vec3 dd = vec3(d.x, max(d.y, 0.0), d.z);
  float l = length(dd);
  dd = l > 1e-5 ? dd / l : vec3(1.0, 0.0, 0.0);
  vec3 L = texture(atmo_skyViewLUT, atmo_skyViewUV(dd, atmo_skyViewSize)).rgb;
  // Below the horizon: distant hazy land; darkens quickly toward the nadir.
  return L * mix(1.0, 0.35, smoothstep(0.0, 0.5, below));
}

vec3 atmo_skyRadiance(vec3 worldDir) {
  vec3 d = normalize(worldDir);
  if (atmo_dimension == 1) return atmo_netherSky(d);
  if (atmo_dimension == 2) return atmo_endSky(d);
  vec3 L = atmo_weatherGrade(atmo_skyClear(d));
  // airglow / starlight floor (limb brightened)
  L += atmo_nightGlow * (0.6 + 0.4 / sqrt(max(abs(d.y), 0.05) + 0.05));
  return L;
}

vec3 atmo_skyRadianceWithClouds(vec3 worldDir) {
  vec3 d = normalize(worldDir);
  vec3 L = atmo_skyRadiance(d);
  if (atmo_dimension != 0) return L;
  vec3 dd = vec3(d.x, max(d.y, 0.0), d.z);
  float l = length(dd);
  dd = l > 1e-5 ? dd / l : vec3(1.0, 0.0, 0.0);
  vec4 c = texture(atmo_cloudEnvMap, atmo_skyViewUV(dd, atmo_cloudEnvSize));
  float w = smoothstep(-0.12, 0.0, d.y);
  return L * mix(1.0, c.a, w) + c.rgb * w;
}

// Aerial perspective (game-scale) + render-distance fade to the sky. dist in blocks.
vec3 atmo_applyFog(vec3 color, vec3 worldDir, float dist) {
  vec3 d = normalize(worldDir);
  float rd = atmo_fogParams.y;
  float hd = dist * length(d.xz);
  float fade = smoothstep(atmo_fogParams.z * rd, rd, hd);
  if (atmo_dimension == 1) {
    // Nether: dense coloured fog
    float T = exp(-dist * atmo_hazeParams.w);
    vec3 c = mix(atmo_dimFogColor, color, T);
    return mix(c, atmo_netherSky(d), fade);
  }
  if (atmo_dimension == 2) {
    float T = exp(-dist * atmo_hazeParams.w);
    vec3 c = mix(atmo_dimFogColor * 0.8, color, T);
    return mix(c, atmo_endSky(d), fade);
  }
  float km = dist * atmo_fogParams.x;
  float rayDens = exp(-atmo_cameraAltKm / ATMO_RAY_H) * atmo_hazeParams.z;
  // Haze with exponential height falloff (blocks): denser in valleys, thinner on peaks.
  float H = atmo_hazeParams.y;
  float y0 = atmo_cameraPos.y - atmo_hazeParams.x;
  float x = d.y * dist / H;
  float avg = exp(-clamp(y0 / H, -2.0, 30.0)) * (abs(x) > 1e-3 ? (1.0 - exp(-clamp(x, -30.0, 30.0))) / x : 1.0 - 0.5 * x);
  float haze = atmo_fogParams.w * clamp(avg, 0.0, 6.0);
  vec3 tauR = ATMO_RAY_SCAT * (rayDens * km);
  float tauMs = ATMO_MIE_SCAT * haze * km;
  vec3 tau = tauR + vec3(ATMO_MIE_EXT * haze * km);
  vec3 T = exp(-tau);
  float cs = dot(d, atmo_sunDir), cm = dot(d, atmo_moonDir);
  vec3 sunL = atmo_sunIlluminance * atmo_sunTransCam;
  vec3 moonL = atmo_moonIlluminance * atmo_moonTransCam;
  vec3 ms = atmo_multiScat(atmo_cameraAltKm, atmo_sunDir.y) * atmo_sunIlluminance
          + atmo_multiScat(atmo_cameraAltKm, atmo_moonDir.y) * atmo_moonIlluminance;
  vec3 srcR = sunL * atmo_rayleighPhase(cs) + moonL * atmo_rayleighPhase(cm) + ms;
  vec3 srcM = sunL * atmo_miePhase(cs) + moonL * atmo_miePhase(cm) + ms;
  vec3 ins = (srcR * tauR + srcM * tauMs) / max(tau, vec3(1e-7)) * (1.0 - T);
  ins = atmo_weatherGrade(ins) + atmo_nightGlow * (1.0 - T.g);
  vec3 c = color * T + ins;
  // fade into what the sky pass draws behind (sky + low-res cloud panorama) to hide chunk borders
  return fade > 0.0 ? mix(c, atmo_skyRadianceWithClouds(d), fade) : c;
}

// Fraction of direct sun/moon light reaching worldPos through the clouds (0 = fully shadowed).
float atmo_cloudShadow(vec3 worldPos) {
  if (atmo_dimension != 0 || atmo_cloudShadowParams.w <= 0.0) return 1.0;
  vec3 L = atmo_cloudShadowLight;
  vec2 rel = (worldPos.xz - atmo_cameraPos.xz) * ATMO_CLOUD_KM_PER_BLOCK;
  float alt = (worldPos.y - ATMO_SEA_LEVEL) * ATMO_CLOUD_KM_PER_BLOCK;
  vec2 q = rel + L.xz / L.y * (atmo_cloudShadowParams2.x - alt);
  vec2 uv = (q + atmo_cloudShadowParams.xy) * atmo_cloudShadowParams.z + 0.5;
  float T = texture(atmo_cloudShadowMap, uv).r;
  vec2 e = abs(uv - 0.5) * 2.0;
  T = mix(T, atmo_cloudShadowParams2.z, smoothstep(0.8, 1.0, max(e.x, e.y)));
  return mix(1.0, T, atmo_cloudShadowParams.w);
}

// Atmospheric transmittance from worldPos toward the sun (no clouds).
vec3 atmo_sunTransmittance(vec3 worldPos) {
  float h = atmo_altitudeForY(worldPos.y);
  return atmo_transmittance(h, atmo_sunDir.y) * atmo_planetShadow(h, atmo_sunDir.y);
}

// Diffuse sky irradiance for a surface normal (evaluates atmo_ambientSH; same as Atmosphere.ambientSH).
vec3 atmo_ambient(vec3 n) {
  vec3 r = atmo_ambientSH[0] * 0.282095
    + atmo_ambientSH[1] * (0.488603 * n.y)
    + atmo_ambientSH[2] * (0.488603 * n.z)
    + atmo_ambientSH[3] * (0.488603 * n.x)
    + atmo_ambientSH[4] * (1.092548 * n.x * n.y)
    + atmo_ambientSH[5] * (1.092548 * n.y * n.z)
    + atmo_ambientSH[6] * (0.315392 * (3.0 * n.z * n.z - 1.0))
    + atmo_ambientSH[7] * (1.092548 * n.x * n.z)
    + atmo_ambientSH[8] * (0.546274 * (n.x * n.x - n.y * n.y));
  return max(r, vec3(0.0));
}
`;

/** The public include: uniforms + common + API. */
export const GLSL_ATMO_PUBLIC = GLSL_ATMO_UNIFORMS + GLSL_ATMO_COMMON + GLSL_ATMO_API;
