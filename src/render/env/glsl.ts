// Shared GLSL snippets for the environment shaders.

/** Hash, value noise and fbm (2D). */
export const NOISE_GLSL = /* glsl */ `
float envHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float envNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = envHash12(i);
  float b = envHash12(i + vec2(1.0, 0.0));
  float c = envHash12(i + vec2(0.0, 1.0));
  float d = envHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// Value noise with analytic derivatives: returns (value, d/dx, d/dy).
vec3 envNoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = envHash12(i);
  float b = envHash12(i + vec2(1.0, 0.0));
  float c = envHash12(i + vec2(0.0, 1.0));
  float d = envHash12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y,
              du.x * (k1 + k4 * u.y),
              du.y * (k2 + k4 * u.x));
}
const mat2 ENV_ROT = mat2(0.8, 0.6, -0.6, 0.8);
float envFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * envNoise(p);
    p = ENV_ROT * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
float envFbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * envNoise(p);
    p = ENV_ROT * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;
