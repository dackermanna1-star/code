/** Shared lighting helpers: blackbody colour, GGX, eclipse occlusion. */
export const LIGHTING_GLSL = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
// Approximate linear-sRGB chromaticity of a blackbody (normalised to luminance 1).
vec3 blackbodyColor(float T) {
  T = clamp(T, 800.0, 40000.0);
  float t = T / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3900816 * log(t) - 0.6318414, 0.0, 1.0) : clamp(1.1298909 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432068 * log(t - 10.0) - 1.1962541, 0.0, 1.0));
  c = pow(c, vec3(2.2));
  return c / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
}
float D_GGX(float NdotH, float a) {
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
float V_SmithGGX(float NdotV, float NdotL, float a) {
  float a2 = a * a;
  float gv = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
  float gl = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
float fresnelSchlick(float c, float f0) { return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }

// Fraction of a star's disc (angular radius sunR) left visible by an occluding sphere
// with angular radius occR whose centre is at angular distance sep.
float discOcclusion(float sep, float sunR, float occR) {
  if (sep >= sunR + occR) return 1.0;
  float rs = sunR, ro = occR;
  if (sep <= abs(ro - rs)) {
    return ro >= rs ? 0.0 : 1.0 - (ro * ro) / (rs * rs);
  }
  // lens area of two overlapping circles (small-angle approximation)
  float d = sep;
  float a1 = rs * rs * acos(clamp((d * d + rs * rs - ro * ro) / (2.0 * d * rs), -1.0, 1.0));
  float a2 = ro * ro * acos(clamp((d * d + ro * ro - rs * rs) / (2.0 * d * ro), -1.0, 1.0));
  float a3 = 0.5 * sqrt(max(0.0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  return 1.0 - clamp((a1 + a2 - a3) / (PI * rs * rs), 0.0, 1.0);
}
`;

/**
 * Eclipse shadows from up to 4 spheres for each of 2 suns.
 * uOcc[i] = (centre camera-relative xyz, radius). uSunPos[k] = camera-relative position (xyz) & radius (w).
 */
export const ECLIPSE_GLSL = /* glsl */ `
uniform vec4 uOcc[4];
uniform int uOccCount;
uniform vec4 uSunPos[2];
float eclipseFactor(vec3 p, int sun) {
  vec3 toSun = uSunPos[sun].xyz - p;
  float dS = length(toSun);
  vec3 sd = toSun / dS;
  float sunR = asin(clamp(uSunPos[sun].w / dS, 0.0, 1.0));
  float f = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uOccCount) break;
    vec3 toO = uOcc[i].xyz - p;
    float dO = length(toO);
    if (dO >= dS || dO < uOcc[i].w * 1.0001) continue;
    float occR = asin(clamp(uOcc[i].w / dO, 0.0, 1.0));
    float sep = acos(clamp(dot(toO / dO, sd), -1.0, 1.0));
    f *= discOcclusion(sep, sunR, occR);
  }
  return f;
}
`;
