/**
 * Cloud shadows for surfaces: the weather map (the same one the volumetric
 * clouds are rendered from) is looked up where the ray toward the star
 * crosses the middle of the cloud deck. Thick cloud blocks direct light
 * (τ ≫ 1) and turns the sky into a dimmer, grey diffuse source.
 * Requires uWorldToPlanet and uPlanetCenter.
 */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
#ifdef CLOUD_SHADOWS
uniform samplerCube uShadowWeather;
uniform float uShadowDrift;
uniform float uCloudMidR;     // radius of the deck's middle (m)
uniform float uShadowStrength;
float cloudCover(vec3 Pw, vec3 L) {
  vec3 rel = Pw - uPlanetCenter;
  float r = length(rel);
  float mu = max(dot(rel / r, L), 0.04);
  vec3 q = rel + L * max(uCloudMidR - r, 0.0) / mu;
  vec3 d = normalize(uWorldToPlanet * q);
  float c = cos(uShadowDrift), s = sin(uShadowDrift);
  vec3 wd = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  vec4 w = textureLod(uShadowWeather, wd, 2.0);
  return smoothstep(0.25, 0.85, w.r) * smoothstep(0.15, 0.6, w.g) * uShadowStrength;
}
// Under thick cloud the direct beam is blocked and the sky becomes a grey
// diffuse source carrying ~1/4 of the light that falls on the deck.
void applyCloudShade(vec3 Pw, vec3 L, float muS, inout vec3 sunT, inout vec3 sky) {
  if (length(Pw - uPlanetCenter) > uCloudMidR) return;
  float cov = cloudCover(Pw, L);
  if (cov <= 0.0) return;
  vec3 W = vec3(0.2126, 0.7152, 0.0722);
  float total = dot(sunT, W) * max(muS, 0.0) + dot(sky, W);
  sky = mix(sky, vec3(total * 0.25), cov);
  sunT *= 1.0 - cov * 0.97;
}
#else
void applyCloudShade(vec3 Pw, vec3 L, float muS, inout vec3 sunT, inout vec3 sky) {}
#endif
`;
