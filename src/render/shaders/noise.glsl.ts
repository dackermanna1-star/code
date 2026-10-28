/** GLSL noise: integer hashing, periodic gradient noise with derivatives, fbm. */
export const NOISE_GLSL = /* glsl */ `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float hash31(vec3 p) {
  uvec3 h = pcg3d(uvec3(ivec3(floor(p)) + 32768));
  return float(h.x & 0xFFFFFFu) / 16777215.0;
}
vec3 hash33(vec3 p) {
  uvec3 h = pcg3d(uvec3(ivec3(floor(p)) + 32768));
  return vec3(h & 0xFFFFFFu) / 16777215.0;
}
float hash12(vec2 p) {
  uvec3 h = pcg3d(uvec3(ivec2(floor(p)) + 32768, 7u));
  return float(h.x & 0xFFFFFFu) / 16777215.0;
}
// gradient at integer lattice point, wrapped with integer period (0 = no wrap)
vec3 latticeGrad(ivec3 c, int period) {
  if (period > 0) c = ((c % period) + period) % period;
  uvec3 h = pcg3d(uvec3(c + 65536));
  return normalize(vec3(h & 0xFFFFu) / 32767.5 - 1.0 + 1e-4);
}
// periodic gradient noise with analytic derivatives: returns (value, d/dx, d/dy, d/dz)
vec4 gnoised(vec3 x, int period) {
  vec3 i = floor(x);
  vec3 f = x - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  ivec3 c = ivec3(i);
  vec3 ga = latticeGrad(c + ivec3(0,0,0), period);
  vec3 gb = latticeGrad(c + ivec3(1,0,0), period);
  vec3 gc = latticeGrad(c + ivec3(0,1,0), period);
  vec3 gd = latticeGrad(c + ivec3(1,1,0), period);
  vec3 ge = latticeGrad(c + ivec3(0,0,1), period);
  vec3 gf = latticeGrad(c + ivec3(1,0,1), period);
  vec3 gg = latticeGrad(c + ivec3(0,1,1), period);
  vec3 gh = latticeGrad(c + ivec3(1,1,1), period);
  float va = dot(ga, f - vec3(0,0,0));
  float vb = dot(gb, f - vec3(1,0,0));
  float vc = dot(gc, f - vec3(0,1,0));
  float vd = dot(gd, f - vec3(1,1,0));
  float ve = dot(ge, f - vec3(0,0,1));
  float vf = dot(gf, f - vec3(1,0,1));
  float vg = dot(gg, f - vec3(0,1,1));
  float vh = dot(gh, f - vec3(1,1,1));
  float v = va + u.x*(vb-va) + u.y*(vc-va) + u.z*(ve-va) + u.x*u.y*(va-vb-vc+vd)
          + u.y*u.z*(va-vc-ve+vg) + u.z*u.x*(va-vb-ve+vf) + u.x*u.y*u.z*(-va+vb+vc-vd+ve-vf-vg+vh);
  vec3 d = ga + u.x*(gb-ga) + u.y*(gc-ga) + u.z*(ge-ga) + u.x*u.y*(ga-gb-gc+gd)
         + u.y*u.z*(ga-gc-ge+gg) + u.z*u.x*(ga-gb-ge+gf) + u.x*u.y*u.z*(-ga+gb+gc-gd+ge-gf-gg+gh)
         + du * (vec3(vb-va, vc-va, ve-va) + u.yzx*vec3(va-vb-vc+vd, va-vc-ve+vg, va-vb-ve+vf)
         + u.zxy*vec3(va-vb-ve+vf, va-vb-vc+vd, va-vc-ve+vg) + u.yzx*u.zxy*(-va+vb+vc-vd+ve-vf-vg+vh));
  return vec4(v, d);
}
float gnoise(vec3 x) { return gnoised(x, 0).x; }
float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * gnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// cellular F1/F2 (non-periodic) – returns (F1, F2, cell hash)
vec3 cellular(vec3 p) {
  vec3 i = floor(p), f = p - i;
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z);
    vec3 h = hash33(i + o);
    vec3 r = o + h * 0.9 + 0.05 - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = h.x; } else if (d < f2) { f2 = d; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
// cellular noise wrapped with a period (in cells), for coordinates that wrap
vec3 cellularP(vec3 p, float period) {
  vec3 i = floor(p), f = p - i;
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z);
    vec3 h = hash33(mod(i + o, period));
    vec3 r = o + h * 0.9 + 0.05 - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = h.x; } else if (d < f2) { f2 = d; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
// interleaved gradient noise for dithering / jitter
float ign(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
`;
