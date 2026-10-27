/**
 * Physically based atmosphere functions (after Bruneton 2017 / Hillaire 2020).
 * Units: metres for distances, 1/m for coefficients. Radiance values are
 * relative to the star's illuminance at the planet (multiplied in by callers).
 */
export const ATMOSPHERE_UNIFORMS = /* glsl */ `
uniform float uRg;            // ground radius
uniform float uRt;            // top of atmosphere radius
uniform vec3  uRayleigh;      // rayleigh scattering at ground
uniform float uRayleighH;
uniform vec3  uMieScat;
uniform vec3  uMieExt;
uniform float uMieH;
uniform float uMieG;
uniform vec3  uAbsorb;        // absorption extinction at peak
uniform float uAbsCenter;     // altitude of absorption layer peak (m); <0 → exponential with uRayleighH
uniform float uAbsWidth;
uniform vec3  uGroundAlbedo;
`;

export const ATMOSPHERE_FUNCS = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e30, -1e30);
  float s = sqrt(d);
  return vec2(-b - s, -b + s);
}
float atmClampR(float r) { return clamp(r, uRg, uRt); }
float distToTop(float r, float mu) {
  float disc = r * r * (mu * mu - 1.0) + uRt * uRt;
  return max(0.0, -r * mu + sqrt(max(disc, 0.0)));
}
float distToBottom(float r, float mu) {
  float disc = r * r * (mu * mu - 1.0) + uRg * uRg;
  return max(0.0, -r * mu - sqrt(max(disc, 0.0)));
}
bool hitsGround(float r, float mu) {
  return mu < 0.0 && r * r * (mu * mu - 1.0) + uRg * uRg >= 0.0;
}
vec3 atmScattering(float h, out vec3 extinction, out vec3 mieS) {
  float dr = exp(-max(h, 0.0) / uRayleighH);
  float dm = exp(-max(h, 0.0) / uMieH);
  float da = uAbsCenter >= 0.0 ? max(0.0, 1.0 - abs(h - uAbsCenter) / uAbsWidth) : exp(-max(h, 0.0) / uAbsWidth);
  vec3 rs = uRayleigh * dr;
  mieS = uMieScat * dm;
  extinction = rs + uMieExt * dm + uAbsorb * da;
  return rs;
}
float phaseRayleigh(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float phaseMie(float c, float g) {
  // Cornette-Shanks
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// transmittance LUT parameterisation (Bruneton)
vec2 transmittanceUV(float r, float mu) {
  float H = sqrt(max(0.0, uRt * uRt - uRg * uRg));
  float rho = sqrt(max(0.0, r * r - uRg * uRg));
  float d = distToTop(r, mu);
  float dmin = uRt - r, dmax = rho + H;
  float xmu = (d - dmin) / max(dmax - dmin, 1e-3);
  float xr = rho / max(H, 1e-3);
  return vec2(xmu, xr) * vec2(1.0 - 1.0/256.0, 1.0 - 1.0/64.0) + vec2(0.5/256.0, 0.5/64.0);
}
void transmittanceRMu(vec2 uv, out float r, out float mu) {
  float xmu = (uv.x - 0.5/256.0) / (1.0 - 1.0/256.0);
  float xr  = (uv.y - 0.5/64.0)  / (1.0 - 1.0/64.0);
  float H = sqrt(max(0.0, uRt * uRt - uRg * uRg));
  float rho = H * xr;
  r = sqrt(rho * rho + uRg * uRg);
  float dmin = uRt - r, dmax = rho + H;
  float d = dmin + xmu * (dmax - dmin);
  mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
}
`;

/** Functions that need the LUT samplers. */
export const ATMOSPHERE_LUT_FUNCS = /* glsl */ `
uniform sampler2D uTransmittanceLUT;
uniform sampler2D uMultiScatLUT;
uniform sampler2D uIrradianceLUT;
vec3 transmittanceToTop(float r, float mu) {
  return texture(uTransmittanceLUT, transmittanceUV(atmClampR(r), mu)).rgb;
}
// transmittance toward the sun, with smooth planet-shadow at the terminator
vec3 sunTransmittance(float r, float muS) {
  r = atmClampR(r);
  float sinH = uRg / r;
  float cosH = -sqrt(max(0.0, 1.0 - sinH * sinH));
  float vis = smoothstep(cosH - 0.004, cosH + 0.004, muS);
  return transmittanceToTop(r, muS) * vis;
}
vec3 multiScat(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, (atmClampR(r) - uRg) / max(uRt - uRg, 1.0));
  return texture(uMultiScatLUT, uv * (31.0/32.0) + 0.5/32.0).rgb;
}
// diffuse sky irradiance on a horizontal surface (per unit star illuminance)
vec3 skyIrradiance(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, (atmClampR(r) - uRg) / max(uRt - uRg, 1.0));
  return texture(uIrradianceLUT, uv * vec2(63.0/64.0, 15.0/16.0) + vec2(0.5/64.0, 0.5/16.0)).rgb;
}
`;
