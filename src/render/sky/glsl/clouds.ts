import { CLOUD_DETAIL_TILE_KM, CLOUD_SHAPE_TILE_KM, CLOUD_WEATHER_TILE_KM } from '../constants';
import { GLSL_PRECISION } from '../fullscreen';
import { GLSL_ATMO_API, GLSL_ATMO_COMMON, GLSL_ATMO_UNIFORMS } from './atmosphere';

const f = (v: number) => {
  const s = String(v);
  return /[.eE]/.test(s) ? s : s + '.0';
};

/** Cloud density / lighting / raymarch functions (require the atmosphere chunks first). */
export const GLSL_CLOUD_COMMON = /* glsl */ `
uniform highp sampler3D cl_shapeNoise;
uniform highp sampler3D cl_detailNoise;
uniform highp sampler2D cl_weatherMap;
uniform vec4 cl_layer;      // base km, top km, camera alt km (cloud space), cloud-planet radius km
uniform vec4 cl_origin;     // xy: cloud-frame xz of the camera (km, wrapped); z: shape evolution; w: detail evolution
uniform vec4 cl_shape;      // x: coverage, y: extinction /km at density 1, z: detail erosion, w: coverage spread
uniform vec3 cl_lightDir;   // light used for clouds (sun, or moon at night)
uniform vec3 cl_lightIllum; // its top-of-atmosphere illuminance (fades included, no weather)
uniform vec4 cl_look;       // x: aerial-perspective extinction /km, y: ambient scale, z: rain darkening, w: multi-scatter scale
uniform vec4 cl_march;      // x: steps min, y: steps max, z: light steps, w: max distance km
uniform vec4 cl_lod;        // x: pixel angle (rad), y: shape texels per tile, z: detail texels per tile, w: detail max distance km
uniform vec4 cl_light;      // x: extinction /km for light transport, y: diffusion decay per unit od, z: diffusion amplitude

const float CL_WEATHER_TILE = ${f(CLOUD_WEATHER_TILE_KM)};
const float CL_SHAPE_TILE = ${f(CLOUD_SHAPE_TILE_KM)};
const float CL_DETAIL_TILE = ${f(CLOUD_DETAIL_TILE_KM)};

float cl_remap(float v, float lo, float hi, float nlo, float nhi) {
  return nlo + (v - lo) * (nhi - nlo) / (hi - lo);
}
float cl_heightFrac(float alt) { return (alt - cl_layer.x) / (cl_layer.y - cl_layer.x); }

// Local coverage: the weather potential (one blob per cumulus cell) biased by the global coverage;
// global coverage -> 1 turns the whole layer overcast.
float cl_coverage(vec4 w) {
  return clamp(w.r * cl_shape.w + (cl_shape.x - 0.5) * 2.0, 0.0, 1.0);
}

// p = (x, altitude, z) in cloud-frame km. h = height fraction in the layer.
float cl_density(vec3 p, float h, bool detail, float lodShape, float lodDetail) {
  if (h < 0.0 || h > 1.0) return 0.0;
  vec4 w = textureLod(cl_weatherMap, p.xz / CL_WEATHER_TILE, 0.0);
  float cov = cl_coverage(w);
  if (cov < 0.02) return 0.0;
  float topH = mix(0.45, 1.0, w.g);
  float hp = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.35, topH, h));
  if (hp <= 0.0) return 0.0;
  vec4 n = textureLod(cl_shapeNoise, vec3(p.x, p.y + cl_origin.z, p.z) / CL_SHAPE_TILE, lodShape);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = cl_remap(n.r, fbm - 1.0, 1.0, 0.0, 1.0);
  float d = cl_remap(base * hp, 1.0 - cov, 1.0, 0.0, 1.0);
  if (d <= 0.0) return 0.0;
  d *= mix(0.6, 1.0, cov);
  if (!detail) return d;
  vec3 dn = textureLod(cl_detailNoise, vec3(p.x + cl_origin.w, p.y, p.z) / CL_DETAIL_TILE, lodDetail).rgb;
  float dfbm = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
  float m = mix(dfbm, 1.0 - dfbm, clamp(h * 4.0, 0.0, 1.0));
  return max(cl_remap(d, m * cl_shape.z, 1.0, 0.0, 1.0), 0.0);
}

// Stable intersection of a ray (camera at radius r0, zenith cos mu) with a sphere; c = |o|^2 - r^2.
bool cl_sphere(float r0, float mu, float c, out float tn, out float tf) {
  float b = r0 * mu;
  float disc = b * b - c;
  tn = 0.0; tf = 0.0;
  if (disc < 0.0) return false;
  float sq = sqrt(disc);
  float q = b > 0.0 ? -b - sq : -b + sq;
  float t1 = q;
  float t2 = abs(q) > 1e-12 ? c / q : 0.0;
  tn = min(t1, t2);
  tf = max(t1, t2);
  return true;
}

// Segment of the ray inside the cloud shell.
bool cl_segment(vec3 rd, out float t0, out float t1) {
  float Rc = cl_layer.w, ac = cl_layer.z, ab = cl_layer.x, at = cl_layer.y;
  float r0 = Rc + ac, mu = rd.y;
  float bn, bf, tn, tf;
  bool hB = cl_sphere(r0, mu, (ac - ab) * (2.0 * Rc + ac + ab), bn, bf);
  bool hT = cl_sphere(r0, mu, (ac - at) * (2.0 * Rc + ac + at), tn, tf);
  t0 = 0.0; t1 = 0.0;
  if (ac < ab) {
    float gn, gf;
    if (cl_sphere(r0, mu, ac * (2.0 * Rc + ac), gn, gf) && gn > 0.0) return false;
    t0 = bf; t1 = tf;
  } else if (ac <= at) {
    t0 = 0.0; t1 = tf;
    if (hB && bn > 0.0) t1 = min(t1, bn);
  } else {
    if (!hT || tf <= 0.0) return false;
    t0 = max(tn, 0.0);
    t1 = (hB && bn > 0.0) ? bn : tf;
  }
  return t1 > t0;
}

// Light illuminance arriving at a cloud sample (atmospheric transmittance with Earth curvature).
vec3 cl_lightAt(float alt, vec2 relXZ) {
  vec3 up = normalize(vec3(relXZ.x, ATMO_RB + alt, relXZ.y));
  float mu = dot(up, cl_lightDir);
  return cl_lightIllum * atmo_transmittance(alt, mu) * atmo_planetShadow(alt, mu) * (1.0 - cl_look.z);
}

float cl_phase(float c, float k) {
  return mix(atmo_hg(c, 0.8 * k), atmo_hg(c, -0.3 * k), 0.35) + 0.6 * atmo_hg(c, 0.95 * k) * k;
}

// Light transport for optical depth od toward the light: single scattering (dual-lobe HG + silver
// lining lobe), one forward octave of multiple scattering, and a slowly decaying near-isotropic
// diffusion term standing in for the high scattering orders that make thick cumulus bright.
float cl_transport(float od, float ph0, float ph1) {
  float k = od * cl_light.y;
  // diffusion: exponential near the lit surface, power-law tail through thick (overcast) layers
  float diff = 0.75 * exp(-k) + 0.25 / (1.0 + 1.5 * k);
  return ph0 * exp(-od) + cl_look.w * (0.5 * ph1 * exp(-od * 0.25) + cl_light.z * diff);
}

// Optical depth toward the light: exponentially growing steps, sample position jittered within each
// step (jl in [0,1)) so the discrete light samples do not print horizontal bands into the shading.
float cl_lightOD(vec3 p, int steps, float lodShape, float jl) {
  float od = 0.0;
  float ds = 0.035;
  float s = 0.0;
  for (int j = 0; j < 8; j++) {
    if (j >= steps) break;
    vec3 q = p + cl_lightDir * (s + ds * jl);
    float hq = cl_heightFrac(q.y);
    if (hq > 1.0) break;
    od += cl_density(q, hq, false, lodShape + float(j) * 0.5, 0.0) * ds;
    s += ds;
    ds *= 2.0;
  }
  return od * cl_light.x;
}

// Ambient light around the clouds from the sky-view LUT: x = top (sky above), y = bottom (ground bounce).
void cl_ambient(out vec3 ambTop, out vec3 ambBot) {
  vec3 Lz = atmo_skyClear(vec3(0.0, 1.0, 0.0));
  vec3 Lh = 0.25 * (atmo_skyClear(normalize(vec3(1.0, 0.25, 0.0))) + atmo_skyClear(normalize(vec3(-1.0, 0.25, 0.0)))
                  + atmo_skyClear(normalize(vec3(0.0, 0.25, 1.0))) + atmo_skyClear(normalize(vec3(0.0, 0.25, -1.0))));
  ambTop = 0.65 * Lz + 0.35 * Lh + atmo_nightGlow;
  vec3 Esun = cl_lightIllum * atmo_transmittance(atmo_cameraAltKm, cl_lightDir.y) * max(cl_lightDir.y, 0.0);
  ambBot = 0.2 / ATMO_PI * Esun * (1.0 - 0.7 * cl_shape.x) * (1.0 - cl_look.z) + 0.45 * ambTop;
  ambTop = atmo_weatherGrade(ambTop);
  ambBot = atmo_weatherGrade(ambBot);
}

// Volumetric march. Returns (scattered radiance incl. aerial perspective, effective transmittance).
vec4 cl_raymarch(vec3 rd, float jitter, float stepsMin, float stepsMax, int lightSteps, bool detail,
                 vec3 ambTop, vec3 ambBot, float pixelAngle, out float tMean) {
  tMean = 0.0;
  float t0, t1;
  if (!cl_segment(rd, t0, t1)) return vec4(0.0, 0.0, 0.0, 1.0);
  float maxD = cl_march.w;
  if (t0 >= maxD) return vec4(0.0, 0.0, 0.0, 1.0);
  t1 = min(t1, maxD);
  float seg = t1 - t0;
  float n = floor(mix(stepsMin, stepsMax, clamp(seg / 10.0, 0.0, 1.0)));
  float dt = seg / n;
  float Rc = cl_layer.w, ac = cl_layer.z;
  float r0 = Rc + ac;
  float c0 = ac * (2.0 * Rc + ac);
  float cosT = dot(rd, cl_lightDir);
  float ph0 = cl_phase(cosT, 1.0), ph1 = cl_phase(cosT, 0.5);
  float sigma = cl_shape.y;
  vec3 scat = vec3(0.0);
  float T = 1.0, blocked = 0.0, wsum = 0.0;
  float t = t0 + dt * jitter;
  float shapeTexel = CL_SHAPE_TILE / cl_lod.y;
  float detailTexel = CL_DETAIL_TILE / cl_lod.z;
  for (int i = 0; i < 256; i++) {
    if (float(i) >= n || T < 0.01) break;
    float q = c0 + 2.0 * r0 * rd.y * t + t * t;
    float lp = sqrt(q + Rc * Rc);
    float alt = q / (lp + Rc);
    float h = cl_heightFrac(alt);
    vec2 rel = rd.xz * t;
    vec3 p = vec3(rel.x + cl_origin.x, alt, rel.y + cl_origin.y);
    float foot = max(t * pixelAngle, dt * 0.5);
    float lodS = max(log2(foot / shapeTexel), 0.0);
    float lodD = max(log2(foot / detailTexel), 0.0);
    float dens = cl_density(p, h, detail && t < cl_lod.w, lodS, lodD);
    if (dens > 0.0) {
      float se = dens * sigma;
      float od = cl_lightOD(p, lightSteps, lodS, fract(jitter * 7.31 + float(i) * 0.618034));
      vec3 Ll = cl_lightAt(alt, rel);
      // single scattering + octave multiple scattering + diffusion term (thick-cloud transport)
      float ms = cl_transport(od, ph0, ph1);
      float powder = mix(1.0, 1.0 - exp(-dens * 5.0), 0.65 * (0.55 - 0.45 * cosT));
      vec3 amb = mix(ambBot, ambTop, clamp(h, 0.0, 1.0)) * cl_look.y * (0.75 + 0.25 * h);
      vec3 S = Ll * (ms * powder) + amb;
      float Ts = exp(-se * dt);
      float ap = exp(-t * cl_look.x) * (1.0 - smoothstep(maxD * 0.5, maxD, t));
      float a = T * (1.0 - Ts);
      scat += a * S * ap;
      blocked += a * ap;
      tMean += a * t;
      wsum += a;
      T *= Ts;
    }
    t += dt;
  }
  tMean = wsum > 0.0 ? tMean / wsum : t1;
  return vec4(scat, 1.0 - blocked);
}

// ---- 2D (low quality) cloud layer ----
float cl_density2D(vec2 xz) {
  vec4 w = textureLod(cl_weatherMap, xz / CL_WEATHER_TILE, 0.0);
  float cov = cl_coverage(w);
  if (cov < 0.02) return 0.0;
  vec4 n = textureLod(cl_shapeNoise, vec3(xz.x, 0.3 * CL_SHAPE_TILE + cl_origin.z, xz.y) / CL_SHAPE_TILE, 0.0);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = cl_remap(n.r, fbm - 1.0, 1.0, 0.0, 1.0);
  return max(cl_remap(base, 1.0 - cov, 1.0, 0.0, 1.0), 0.0) * mix(0.6, 1.0, cov);
}

vec4 cl_clouds2D(vec3 rd, vec3 ambTop, vec3 ambBot) {
  float Rc = cl_layer.w, ac = cl_layer.z;
  float alt = mix(cl_layer.x, cl_layer.y, 0.3);
  float tn, tf;
  if (!cl_sphere(Rc + ac, rd.y, (ac - alt) * (2.0 * Rc + ac + alt), tn, tf)) return vec4(0.0, 0.0, 0.0, 1.0);
  float t = ac < alt ? tf : (tn > 0.0 ? tn : -1.0);
  if (t <= 0.0 || t > cl_march.w) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 rel = rd.xz * t;
  vec2 pxz = rel + cl_origin.xy;
  float d = cl_density2D(pxz);
  if (d <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float thick = (cl_layer.y - cl_layer.x) * 0.5;
  vec2 ld = cl_lightDir.xz / max(cl_lightDir.y, 0.2);
  float d1 = cl_density2D(pxz + ld * 0.15);
  float d2 = cl_density2D(pxz + ld * 0.45);
  float od = (0.5 * d + d1 + 0.5 * d2) * thick * cl_light.x * 0.35;
  float cosT = dot(rd, cl_lightDir);
  float ms = cl_transport(od, cl_phase(cosT, 1.0), cl_phase(cosT, 0.5));
  vec3 S = cl_lightAt(alt, rel) * ms + mix(ambBot, ambTop, 0.6) * cl_look.y;
  float T = exp(-d * thick * cl_shape.y * 0.6 / max(abs(rd.y), 0.08) * 0.15);
  float ap = exp(-t * cl_look.x) * (1.0 - smoothstep(cl_march.w * 0.5, cl_march.w, t));
  return vec4(S * (1.0 - T) * ap, 1.0 - (1.0 - T) * ap);
}
`;

const HEADER = `${GLSL_PRECISION}
${GLSL_ATMO_UNIFORMS}
${GLSL_ATMO_COMMON}
${GLSL_ATMO_API}
${GLSL_CLOUD_COMMON}
`;

/** Low-res volumetric cloud pass. Output: rgb = scattered light, a = effective transmittance. */
export const CLOUD_MARCH_FRAG = /* glsl */ `${HEADER}
uniform mat4 cl_invViewProj;
uniform vec2 cl_res;
uniform highp sampler2D cl_depth;
uniform int cl_skip;
uniform float cl_frame;
uniform vec2 cl_subpixel;   // per-frame sub-texel ray offset (texels), resolved by the temporal pass
layout(location = 0) out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / cl_res;
  vec2 uvRay = (gl_FragCoord.xy + cl_subpixel) / cl_res;
  if (cl_skip == 1) {
    bool sky = false;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 suv = clamp((gl_FragCoord.xy + vec2(float(i), float(j)) * 0.9) / cl_res, 0.0, 1.0);
        float z = textureLod(cl_depth, suv, 0.0).r;
        if (z >= 0.9999999) { sky = true; continue; }
        // terrain inside the render-distance fade zone also shows the sky (blended in the composite)
        vec4 wp = cl_invViewProj * vec4(suv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
        if (length(wp.xz / wp.w) > atmo_fogParams.z * atmo_fogParams.y) sky = true;
      }
    }
    if (!sky) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }
  vec4 w = cl_invViewProj * vec4(uvRay * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(w.xyz / w.w);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float jitter = fract(ign + cl_frame * 0.61803398875);
  vec3 ambTop, ambBot;
  cl_ambient(ambTop, ambBot);
  float tMean;
  outColor = cl_raymarch(rd, jitter, cl_march.x, cl_march.y, int(cl_march.z), true, ambTop, ambBot, cl_lod.x, tMean);
}
`;

/** Temporal accumulation with rotation-aware reprojection and neighbourhood clamping. */
export const CLOUD_TEMPORAL_FRAG = /* glsl */ `${GLSL_PRECISION}
uniform highp sampler2D tp_current;
uniform highp sampler2D tp_history;
uniform mat4 tp_invViewProj;
uniform mat4 tp_prevViewProj;
uniform vec2 tp_res;
uniform float tp_blend;
uniform int tp_valid;
layout(location = 0) out vec4 outColor;

// 9-tap Catmull-Rom bicubic (bilinear-optimised), used to upsample / reproject the cloud buffer.
vec4 tp_sampleBicubic(highp sampler2D tex, vec2 uv, vec2 texSize) {
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

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  ivec2 maxp = ivec2(tp_res) - 1;
  vec4 cur = texelFetch(tp_current, ip, 0);
  vec4 mn = cur, mx = cur, m1 = vec4(0.0), m2 = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 s = texelFetch(tp_current, clamp(ip + ivec2(i, j), ivec2(0), maxp), 0);
      mn = min(mn, s); mx = max(mx, s);
      m1 += s; m2 += s * s;
    }
  }
  m1 /= 9.0; m2 /= 9.0;
  vec4 sd = sqrt(max(m2 - m1 * m1, vec4(0.0)));
  mn = min(mn, m1 - 1.5 * sd); mx = max(mx, m1 + 1.5 * sd);
  if (tp_valid == 0) { outColor = cur; return; }
  vec2 uv = gl_FragCoord.xy / tp_res;
  vec4 w = tp_invViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  vec4 pc = tp_prevViewProj * vec4(d, 0.0);
  if (pc.w <= 1e-5) { outColor = cur; return; }
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) { outColor = cur; return; }
  vec4 hist = tp_sampleBicubic(tp_history, puv, tp_res);
  hist = clamp(hist, mn, mx);
  outColor = mix(hist, cur, tp_blend);
}
`;

/** Cloud panorama for reflections / ambient (same parametrisation as the sky-view LUT). */
export const CLOUD_ENV_FRAG = /* glsl */ `${HEADER}
uniform vec2 ce_size;
uniform int ce_mode;   // 0 none, 1 volumetric, 2 flat 2D
uniform vec4 ce_march; // x steps min, y steps max, z light steps
layout(location = 0) out vec4 outColor;
void main() {
  if (ce_mode == 0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 uv = gl_FragCoord.xy / ce_size;
  vec3 rd = atmo_skyViewDir(uv, ce_size);
  rd = normalize(vec3(rd.x, max(rd.y, 0.004), rd.z));
  vec3 ambTop, ambBot;
  cl_ambient(ambTop, ambBot);
  vec4 r;
  if (ce_mode == 2) {
    r = cl_clouds2D(rd, ambTop, ambBot);
  } else {
    float tMean;
    float pixelAngle = 2.0 * ATMO_PI / ce_size.x;
    r = cl_raymarch(rd, 0.5, ce_march.x, ce_march.y, int(ce_march.z), false, ambTop, ambBot, pixelAngle, tMean);
  }
  outColor = vec4(r.rgb, r.a);
}
`;

/** Cloud shadow map: transmittance through the layer along the light, indexed on the mid plane. */
export const CLOUD_SHADOW_FRAG = /* glsl */ `${HEADER}
uniform vec2 cs_size;
uniform vec4 cs_params; // x: extent km, y: steps, z: density scale, w: mode (1 vol, 2 flat)
uniform vec3 cs_light;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / cs_size;
  vec2 q = (uv - 0.5) * cs_params.x;
  float base = cl_layer.x, top = cl_layer.y, mid = 0.5 * (base + top);
  float od = 0.0;
  if (cs_params.w > 1.5) {
    float d = cl_density2D(q + cl_origin.xy);
    od = d * (top - base) * 0.5 * cl_light.x * 0.15;
  } else {
    int N = int(cs_params.y);
    float dAlt = (top - base) / float(N);
    for (int i = 0; i < 32; i++) {
      if (i >= N) break;
      float a = base + (float(i) + 0.5) * dAlt;
      vec2 xz = q + cs_light.xz / cs_light.y * (a - mid);
      od += cl_density(vec3(xz.x + cl_origin.x, a, xz.y + cl_origin.y), (a - base) / (top - base), false, 1.0, 0.0) * dAlt / cs_light.y;
    }
    od *= cl_light.x;
  }
  float T = exp(-od * cs_params.z);
  outColor = vec4(T, T, T, 1.0);
}
`;
