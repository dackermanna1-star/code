import { GLSL_PRECISION } from '../fullscreen';
import { GLSL_ATMO_COMMON, GLSL_ATMO_UNIFORMS, GLSL_ATMO_API } from './atmosphere';

/** Transmittance LUT (256x64): optical depth to the top of the atmosphere. */
export const TRANSMITTANCE_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_ATMO_COMMON}
layout(location = 0) out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / ATMO_TRANS_RES;
  const float H = sqrt(ATMO_RT * ATMO_RT - ATMO_RB * ATMO_RB);
  float rho = H * uv.y;
  float r = sqrt(rho * rho + ATMO_RB * ATMO_RB);
  float dMin = ATMO_RT - r, dMax = rho + H;
  float d = dMin + uv.x * (dMax - dMin);
  float mu = d <= 0.0 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
  vec3 od = vec3(0.0);
  const int N = 64;
  for (int i = 0; i < N; i++) {
    float s0 = float(i) / float(N), s1 = float(i + 1) / float(N);
    float t0 = d * s0 * s0, t1 = d * s1 * s1;
    float t = 0.5 * (t0 + t1);
    float q = rho * rho + 2.0 * r * mu * t + t * t;
    float hh = q / (sqrt(q + ATMO_RB * ATMO_RB) + ATMO_RB);
    vec3 sR; float sM; vec3 ext;
    atmo_medium(hh, sR, sM, ext);
    od += ext * (t1 - t0);
  }
  outColor = vec4(exp(-od), 1.0);
}
`;

/** Multiple-scattering LUT (32x32), Hillaire 2020 eq. 5-10 (isotropic 2nd order, geometric series). */
export const MULTISCAT_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_ATMO_UNIFORMS}
${GLSL_ATMO_COMMON}
${GLSL_ATMO_API}
layout(location = 0) out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / ATMO_MS_RES;
  uv = vec2(atmo_fromSubUvsToUnit(uv.x, ATMO_MS_RES), atmo_fromSubUvsToUnit(uv.y, ATMO_MS_RES));
  float muS = clamp(uv.x, 0.0, 1.0) * 2.0 - 1.0;
  float h = max(clamp(uv.y, 0.0, 1.0) * ATMO_H_TOP, 0.01);
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
  float r0 = ATMO_RB + h;
  vec3 Lsum = vec3(0.0), fmsSum = vec3(0.0);
  const int SQ = 8;
  const int NS = 20;
  for (int i = 0; i < SQ; i++) {
    for (int j = 0; j < SQ; j++) {
      float theta = 2.0 * ATMO_PI * (float(i) + 0.5) / float(SQ);
      float phi = acos(1.0 - 2.0 * (float(j) + 0.5) / float(SQ));
      vec3 dir = vec3(cos(theta) * sin(phi), cos(phi), sin(theta) * sin(phi));
      float mu = dir.y;
      // distance to ground / top
      bool hitGround = mu < atmo_horizonMu(h);
      float tMax;
      if (hitGround) {
        float c = h * (2.0 * ATMO_RB + h);           // |o|^2 - Rb^2
        float b = r0 * mu;
        float disc = max(b * b - c, 0.0);
        tMax = c / (-b + sqrt(disc));                 // near root, stable
      } else {
        float disc = r0 * r0 * mu * mu + (ATMO_RT - r0) * (ATMO_RT + r0);
        tMax = -r0 * mu + sqrt(max(disc, 0.0));
      }
      vec3 L = vec3(0.0), fms = vec3(0.0), thr = vec3(1.0);
      float dt = tMax / float(NS);
      float cosSV = dot(dir, sunDir);
      for (int s = 0; s < NS; s++) {
        float t = (float(s) + 0.5) * dt;
        float q = h * (2.0 * ATMO_RB + h) + 2.0 * r0 * mu * t + t * t;
        float lp = sqrt(q + ATMO_RB * ATMO_RB);
        float hh = q / (lp + ATMO_RB);
        vec3 sR; float sM; vec3 ext;
        atmo_medium(hh, sR, sM, ext);
        vec3 sTot = sR + vec3(sM);
        float muSs = (r0 * sunDir.y + t * cosSV) / lp;
        vec3 Ts = atmo_transmittance(hh, muSs) * atmo_planetShadow(hh, muSs);
        vec3 Tstep = exp(-ext * dt);
        vec3 ext1 = max(ext, vec3(1e-9));
        vec3 S = Ts * sTot * (1.0 / (4.0 * ATMO_PI));
        L += thr * (S - S * Tstep) / ext1;
        fms += thr * (sTot - sTot * Tstep) / ext1;
        thr *= Tstep;
      }
      if (hitGround) {
        float hg = 0.0;
        float muG = (r0 * sunDir.y + tMax * cosSV) / ATMO_RB;
        vec3 Tg = atmo_transmittance(hg, muG) * atmo_planetShadow(hg, muG);
        L += thr * Tg * clamp(muG, 0.0, 1.0) * ATMO_GROUND_ALBEDO / ATMO_PI;
      }
      Lsum += L;
      fmsSum += fms;
    }
  }
  float inv = 1.0 / float(SQ * SQ);
  vec3 L2 = Lsum * inv;
  vec3 fms = fmsSum * inv;
  outColor = vec4(L2 / max(1.0 - fms, vec3(1e-4)), 1.0);
}
`;

/** Sky-view LUT (per frame): in-scattered radiance from sun + moon for the upper hemisphere. */
export const SKYVIEW_FRAG = /* glsl */ `${GLSL_PRECISION}
${GLSL_ATMO_UNIFORMS}
${GLSL_ATMO_COMMON}
${GLSL_ATMO_API}
uniform vec2 sv_size;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / sv_size;
  vec3 d = atmo_skyViewDir(uv, sv_size);
  float h = atmo_cameraAltKm;
  float r0 = ATMO_RB + h;
  float mu = d.y;
  float disc = r0 * r0 * mu * mu + (ATMO_RT - r0) * (ATMO_RT + r0);
  float tMax = -r0 * mu + sqrt(max(disc, 0.0));
  float csS = dot(d, atmo_sunDir), csM = dot(d, atmo_moonDir);
  float pRs = atmo_rayleighPhase(csS), pMs = atmo_miePhase(csS);
  float pRm = atmo_rayleighPhase(csM), pMm = atmo_miePhase(csM);
  bool moonOn = dot(atmo_moonIlluminance, vec3(1.0)) > 1e-6;
  vec3 L = vec3(0.0), thr = vec3(1.0);
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float s0 = float(i) / float(N), s1 = float(i + 1) / float(N);
    float t0 = tMax * s0 * s0, t1 = tMax * s1 * s1;
    float t = mix(t0, t1, 0.5), dt = t1 - t0;
    float q = h * (2.0 * ATMO_RB + h) + 2.0 * r0 * mu * t + t * t;
    float lp = sqrt(q + ATMO_RB * ATMO_RB);
    float hh = q / (lp + ATMO_RB);
    vec3 sR; float sM; vec3 ext;
    atmo_medium(hh, sR, sM, ext);
    vec3 sTot = sR + vec3(sM);
    float muS = (r0 * atmo_sunDir.y + t * csS) / lp;
    vec3 Ts = atmo_transmittance(hh, muS) * atmo_planetShadow(hh, muS);
    vec3 S = atmo_sunIlluminance * (Ts * (sR * pRs + sM * pMs) + atmo_multiScat(hh, muS) * sTot);
    if (moonOn) {
      float muM = (r0 * atmo_moonDir.y + t * csM) / lp;
      vec3 Tm = atmo_transmittance(hh, muM) * atmo_planetShadow(hh, muM);
      S += atmo_moonIlluminance * (Tm * (sR * pRm + sM * pMm) + atmo_multiScat(hh, muM) * sTot);
    }
    vec3 Tstep = exp(-ext * dt);
    L += thr * (S - S * Tstep) / max(ext, vec3(1e-9));
    thr *= Tstep;
  }
  outColor = vec4(L, 1.0);
}
`;
