import { GLSL_PRECISION } from '../fullscreen';
import { GLSL_ATMO_API, GLSL_ATMO_COMMON, GLSL_ATMO_UNIFORMS } from './atmosphere';
import { GLSL_CLOUD_COMMON } from './clouds';

/**
 * Final sky composite (full resolution) drawn only where the scene depth is the far plane.
 * Two depth modes: sample the depth texture and discard, or (when the target owns that depth
 * buffer) rely on the depth test with the triangle at z = 1.
 */
export const SKY_COMPOSITE_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_ATMO_UNIFORMS}
${GLSL_ATMO_COMMON}
${GLSL_ATMO_API}
${GLSL_CLOUD_COMMON}
in vec2 vUv;
uniform mat4 sky_invViewProj;   // rotation-only inverse view-projection
uniform highp sampler2D sky_depth;
uniform int sky_depthMode;      // 0 = none (depth test), 1 = sample & discard
uniform highp sampler2D sky_clouds;
uniform int sky_cloudMode;      // 0 none, 1 low-res volumetric buffer, 2 flat 2D layer
uniform mat3 sky_starRot;
uniform vec3 sky_moonLight;     // direction of sunlight on the moon (phase)
uniform vec4 sky_disk;          // x sun disk radiance per unit illuminance, y moon disk radiance, z sun radius, w moon radius
uniform vec4 sky_night;         // x star visibility, y time (s), z aureole strength, w milky way strength
uniform float sky_pixelAngle;
uniform int sky_fadeTerrain;    // 1: also blend the sky over terrain in the render-distance fade zone
layout(location = 0) out vec4 outColor;

// 9-tap Catmull-Rom bicubic (bilinear-optimised), used to upsample / reproject the cloud buffer.
vec4 sky_sampleBicubic(highp sampler2D tex, vec2 uv, vec2 texSize) {
  vec2 sp = uv * texSize;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / texSize;
  vec2 t3 = (t1 + 2.0) / texSize;
  vec2 t12 = (t1 + w2 / w12) / texSize;
  vec4 r = texture(tex, vec2(t0.x, t0.y)) * (w0.x * w0.y)
         + texture(tex, vec2(t12.x, t0.y)) * (w12.x * w0.y)
         + texture(tex, vec2(t3.x, t0.y)) * (w3.x * w0.y)
         + texture(tex, vec2(t0.x, t12.y)) * (w0.x * w12.y)
         + texture(tex, vec2(t12.x, t12.y)) * (w12.x * w12.y)
         + texture(tex, vec2(t3.x, t12.y)) * (w3.x * w12.y)
         + texture(tex, vec2(t0.x, t3.y)) * (w0.x * w3.y)
         + texture(tex, vec2(t12.x, t3.y)) * (w12.x * w3.y)
         + texture(tex, vec2(t3.x, t3.y)) * (w3.x * w3.y);
  return vec4(max(r.rgb, vec3(0.0)), clamp(r.a, 0.0, 1.0));
}

vec3 sky_viewTransmittance(vec3 d) {
  float h = atmo_cameraAltKm;
  return atmo_transmittance(h, d.y) * atmo_planetShadow(h, d.y);
}

vec3 sky_sun(vec3 d, vec3 Tv) {
  float R = sky_disk.z;
  float ang = 2.0 * asin(clamp(length(d - atmo_sunDir) * 0.5, 0.0, 1.0));
  float aa = max(sky_pixelAngle, 1e-5);
  if (ang > R + 2.0 * aa) return vec3(0.0);
  float r = clamp(ang / R, 0.0, 1.0);
  float mu = sqrt(max(1.0 - r * r, 0.0));
  vec3 limb = pow(vec3(max(mu, 0.02)), vec3(0.397, 0.503, 0.652));
  float edge = clamp((R - ang) / aa + 0.5, 0.0, 1.0);
  return atmo_sunIlluminance * sky_disk.x * Tv * limb * edge;
}

float sky_noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  uvec3 u = uvec3(ivec3(i) + 1024);
  float n000 = atmo_hash33(u).x, n100 = atmo_hash33(u + uvec3(1, 0, 0)).x;
  float n010 = atmo_hash33(u + uvec3(0, 1, 0)).x, n110 = atmo_hash33(u + uvec3(1, 1, 0)).x;
  float n001 = atmo_hash33(u + uvec3(0, 0, 1)).x, n101 = atmo_hash33(u + uvec3(1, 0, 1)).x;
  float n011 = atmo_hash33(u + uvec3(0, 1, 1)).x, n111 = atmo_hash33(u + uvec3(1, 1, 1)).x;
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

// Procedural lunar albedo on the unit sphere (moon-local frame).
float sky_moonAlbedo(vec3 n) {
  float m = 0.0, a = 0.5;
  vec3 p = n * 2.2 + vec3(3.1, 1.7, 0.4);
  for (int i = 0; i < 4; i++) { m += a * sky_noise3(p); p *= 2.07; a *= 0.5; }
  float maria = smoothstep(0.50, 0.60, m + 0.18 * (n.y * 0.6 - n.x * 0.4));
  float alb = mix(0.16, 0.085, maria);
  // craters: cellular rings
  vec3 cp = n * 9.0;
  vec3 ci = floor(cp);
  float rim = 0.0, bowl = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = ci + vec3(float(x), float(y), float(z));
    vec3 h = atmo_hash33(uvec3(ivec3(c) + 512));
    float rad = 0.15 + 0.3 * h.z * h.z;
    float dd = length(cp - (c + h)) / rad;
    rim += smoothstep(0.75, 1.0, dd) * (1.0 - smoothstep(1.0, 1.3, dd)) * step(0.55, h.y);
    bowl += (1.0 - smoothstep(0.0, 0.85, dd)) * step(0.55, h.y);
  }
  alb *= 1.0 + 0.35 * clamp(rim, 0.0, 1.0) - 0.12 * clamp(bowl, 0.0, 1.0);
  alb *= 0.9 + 0.2 * sky_noise3(n * 40.0);
  return alb;
}

vec3 sky_moon(vec3 d, vec3 Tv, out float mask) {
  vec3 m = atmo_moonDir;
  float R = sky_disk.w;
  float ang = 2.0 * asin(clamp(length(d - m) * 0.5, 0.0, 1.0));
  float aa = max(sky_pixelAngle, 1e-5);
  mask = clamp((R - ang) / aa + 0.5, 0.0, 1.0);
  if (mask <= 0.0) return vec3(0.0);
  vec3 up = vec3(0.0, 1.0, 0.0) - m * m.y;
  up = dot(up, up) > 1e-6 ? normalize(up) : vec3(0.0, 0.0, 1.0);
  vec3 right = normalize(cross(m, up));
  vec2 p = vec2(dot(d - m, right), dot(d - m, up)) / R;
  float rr = min(dot(p, p), 1.0);
  float z = sqrt(1.0 - rr);
  vec3 n = p.x * right + p.y * up - z * m;          // world-space surface normal (toward viewer)
  float alb = sky_moonAlbedo(vec3(p, z));
  float mu0 = dot(n, sky_moonLight);
  float muv = z;
  float lit = 2.0 * max(mu0, 0.0) / max(max(mu0, 0.0) + muv, 1e-3);   // Lommel-Seeliger, =1 at full moon
  lit *= smoothstep(-0.03, 0.08, mu0);
  float earthshine = 0.004;
  return sky_disk.y * (alb / 0.12) * (lit + earthshine) * Tv * mask;
}

vec3 sky_starLayer(vec3 sd, float cells, float density, float seed) {
  vec3 a = abs(sd);
  vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z) { uv = sd.yz / a.x; face = sd.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = sd.xz / a.y; face = sd.y > 0.0 ? 2.0 : 3.0; }
  else { uv = sd.xy / a.z; face = sd.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = (uv * 0.5 + 0.5) * cells;
  vec2 cell = floor(g);
  vec2 f = g - cell;
  vec3 h = atmo_hash33(uvec3(uvec2(ivec2(cell) + 4096), uint(face + seed * 8.0)));
  if (h.z > density) return vec3(0.0);
  vec3 h2 = atmo_hash33(uvec3(uvec2(ivec2(cell) + 9000), uint(face + seed * 8.0 + 77.0)));
  vec2 pos = 0.2 + 0.6 * h.xy;
  float pxPerCell = 2.0 / (cells * max(sky_pixelAngle, 1e-5));
  vec2 dpx = (f - pos) * pxPerCell;
  float r2 = dot(dpx, dpx);
  float b = exp(-r2 * 1.1);
  float mag = pow(h2.x, 12.0) * 6.0 + pow(h2.x, 4.0) * 0.25 + 0.015;
  float temp = h2.y;
  vec3 col = mix(vec3(1.0, 0.72, 0.45), vec3(0.75, 0.85, 1.0), smoothstep(0.15, 0.85, temp));
  col = mix(col, vec3(1.0), 0.35);
  float tw = 1.0 + 0.45 * sin(sky_night.y * (2.0 + 5.0 * h2.z) + h.x * 40.0) * (0.35 + 0.65 * (1.0 - clamp(sd.y, 0.0, 1.0)));
  return col * mag * b * tw;
}

vec3 sky_milkyWay(vec3 sd) {
  vec3 gN = normalize(vec3(0.35, 0.42, 0.84));
  float lat = dot(sd, gN);
  float band = exp(-lat * lat / (0.13 * 0.13));
  if (band < 0.01) return vec3(0.0);
  vec3 core = normalize(vec3(-0.6, 0.55, -0.25));
  float c = 0.4 + 0.6 * smoothstep(-0.2, 1.0, dot(sd, core));
  float cl = textureLod(cl_shapeNoise, sd * 0.45 + 0.3, 0.0).g;
  float dust = textureLod(cl_detailNoise, sd * 1.1, 0.0).r;
  float lanes = smoothstep(0.35, 0.75, dust) * exp(-lat * lat / (0.04 * 0.04));
  float v = band * c * (0.35 + 0.9 * cl) * (1.0 - 0.75 * lanes);
  vec3 col = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.9, 0.78), c);
  return col * v;
}

vec3 sky_endSky(vec3 d) {
  vec3 col = atmo_endSky(d);
  vec3 sd = d;
  float n1 = textureLod(cl_shapeNoise, sd * vec3(0.25, 0.9, 0.25) + vec3(0.1, atmo_weather.w * 0.002, 0.3), 0.0).r;
  float n2 = textureLod(cl_detailNoise, sd * vec3(0.6, 2.4, 0.6) + 0.5, 0.0).g;
  float streak = smoothstep(0.55, 0.95, n1) * (0.5 + 0.5 * n2);
  col += vec3(0.020, 0.008, 0.030) * streak * 1.6;
  col += sky_starLayer(sd, 160.0, 0.35, 5.0) * 0.0012;
  return col;
}

void main() {
  float alpha = 1.0;
  if (sky_depthMode == 1) {
    float z = texture(sky_depth, vUv).r;
    if (z < 0.9999999) {
      if (sky_fadeTerrain == 0) discard;
      // Terrain in the fade zone: atmo_applyFog faded it toward the low-res cloud panorama; replace
      // that approximation with the full sky by blending with the same factor.
      vec4 wp = sky_invViewProj * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
      float hd = length(wp.xz / wp.w);
      alpha = smoothstep(atmo_fogParams.z * atmo_fogParams.y, atmo_fogParams.y, hd);
      if (alpha <= 0.001) discard;
    }
  }
  vec4 w = sky_invViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  if (atmo_dimension == 1) { outColor = vec4(atmo_netherSky(d), alpha); return; }
  if (atmo_dimension == 2) { outColor = vec4(sky_endSky(d), alpha); return; }

  vec3 col = atmo_skyRadiance(d);
  if (d.y > -0.02) {
    vec3 Tv = sky_viewTransmittance(d);
    vec3 grade = vec3(1.0 - 0.9 * atmo_weather.x);
    // sun disk + aureole (forward scattering by haze, narrower than the LUT can hold)
    col += sky_sun(d, Tv) * grade;
    float cs = dot(d, atmo_sunDir);
    float air = 1.0 / max(d.y + 0.08, 0.08);
    col += atmo_sunIlluminance * atmo_sunTransCam * Tv * atmo_hg(cs, 0.93) * sky_night.z * sqrt(air) * grade;
    // moon
    float moonMask;
    col += sky_moon(d, Tv, moonMask) * grade;
    // stars & milky way (hidden behind the moon disk)
    if (sky_night.x > 0.0) {
      vec3 sd = sky_starRot * d;
      vec3 stars = sky_starLayer(sd, 260.0, 0.4, 1.0) * 0.0012 + sky_starLayer(sd, 70.0, 0.35, 2.0) * 0.005;
      stars += sky_milkyWay(sd) * sky_night.w;
      col += stars * Tv * sky_night.x * (1.0 - moonMask) * (1.0 - atmo_weather.x);
    }
  }
  if (sky_cloudMode == 1) {
    vec4 c = sky_sampleBicubic(sky_clouds, vUv, vec2(textureSize(sky_clouds, 0)));
    col = col * c.a + c.rgb;
  } else if (sky_cloudMode == 2) {
    vec3 ambTop, ambBot;
    cl_ambient(ambTop, ambBot);
    vec4 c = cl_clouds2D(d, ambTop, ambBot);
    col = col * c.a + c.rgb;
  }
  outColor = vec4(col, alpha);
}
`;

/**
 * Projects sky (+cheap clouds, + ground bounce) radiance into 9 L2 SH coefficients of irradiance
 * (cosine convolved). Pixel i (0..8) = coefficient i, pixel 9 = average horizon radiance,
 * pixel 10 = zenith radiance, pixel 11 = horizontal irradiance from the sky.
 */
export const SH_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_ATMO_UNIFORMS}
${GLSL_ATMO_COMMON}
${GLSL_ATMO_API}
uniform vec3 sh_sunGround;   // direct horizontal irradiance on the ground (for the bounce term)
uniform float sh_groundAlbedo;
layout(location = 0) out vec4 outColor;
float sh_basis(int i, vec3 n) {
  if (i == 0) return 0.282095;
  if (i == 1) return 0.488603 * n.y;
  if (i == 2) return 0.488603 * n.z;
  if (i == 3) return 0.488603 * n.x;
  if (i == 4) return 1.092548 * n.x * n.y;
  if (i == 5) return 1.092548 * n.y * n.z;
  if (i == 6) return 0.315392 * (3.0 * n.z * n.z - 1.0);
  if (i == 7) return 1.092548 * n.x * n.z;
  return 0.546274 * (n.x * n.x - n.y * n.y);
}
void main() {
  int idx = int(gl_FragCoord.x);
  const int NA = 32;
  const int NE = 12;
  vec3 acc = vec3(0.0), Eh = vec3(0.0), fog = vec3(0.0);
  float dEl = 0.5 * ATMO_PI / float(NE);
  float dAz = 2.0 * ATMO_PI / float(NA);
  for (int e = 0; e < NE; e++) {
    float el = (float(e) + 0.5) * dEl;
    float ce = cos(el), se = sin(el);
    for (int a = 0; a < NA; a++) {
      float az = (float(a) + 0.5) * dAz;
      vec3 d = vec3(ce * cos(az), se, ce * sin(az));
      float dw = ce * dEl * dAz;
      vec3 L = atmo_skyRadianceWithClouds(d);
      if (idx < 9) acc += L * sh_basis(idx, d) * dw;
      Eh += L * se * dw;
      if (e == 0) fog += L;
    }
  }
  vec3 Lg = sh_groundAlbedo / ATMO_PI * (Eh + sh_sunGround);
  if (idx == 0) acc += Lg * (0.282095 * 2.0 * ATMO_PI);
  if (idx == 1) acc += Lg * (-0.488603 * ATMO_PI);
  float A = idx == 0 ? ATMO_PI : (idx < 4 ? 2.0 * ATMO_PI / 3.0 : ATMO_PI / 4.0);
  if (idx < 9) outColor = vec4(acc * A, 1.0);
  else if (idx == 9) outColor = vec4(fog / float(NA), 1.0);
  else if (idx == 10) outColor = vec4(atmo_skyRadianceWithClouds(vec3(0.0, 1.0, 0.0)), 1.0);
  else outColor = vec4(Eh, 1.0);
}
`;
