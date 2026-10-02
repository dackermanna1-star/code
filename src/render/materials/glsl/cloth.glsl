// Cloth & neutral tintable surfaces: wool (knit), bed blanket (weave), terracotta, concrete, sponges.
// Tintable textures are authored near white (luminance detail only) so tint * texture ~= dye colour.

Mat knit(vec2 uv) {
  // rows of V-shaped stitches
  float rows = 10.0, cols = 10.0;
  vec2 g = vec2(uv.x * cols, uv.y * rows);
  vec2 f = fract(g) - 0.5;
  float side = f.x < 0.0 ? -1.0 : 1.0;
  // each stitch = two slanted loops forming a V
  vec2 q = vec2(abs(f.x) - 0.25, f.y + abs(f.x) * 0.9 - 0.1);
  float loop = length(q * vec2(1.6, 1.0));
  float st = 1.0 - smoothstep(0.18, 0.42, loop);
  float fuzz = gnoise(uv * 96.0, vec2(96.0), 950.0) * 0.5 + gnoise(uv * 192.0, vec2(192.0), 951.0) * 0.5;
  float n = fbm(uv, vec2(4.0), 3, 0.5, 952.0);
  float t = 0.78 + 0.18 * st + 0.04 * fuzz + 0.04 * n;
  vec3 col = vec3(t);
  float h = 0.55 + 0.35 * st + 0.04 * fuzz;
  return M(col, 1.0, sat(h), 0.95);
}

Mat weave(vec2 uv) {
  float N = 32.0;
  vec2 g = uv * N;
  vec2 f = fract(g) - 0.5;
  vec2 id = floor(g);
  bool over_ = mod(id.x + id.y, 2.0) < 1.0;
  float thread = over_ ? 1.0 - 4.0 * f.y * f.y : 1.0 - 4.0 * f.x * f.x;
  float fuzz = gnoise(uv * 128.0, vec2(128.0), 960.0);
  // quilting seams
  float seam = cover(abs(fract(uv.y * 2.0) - 0.5) * 0.5 - 0.004) * 0.0 + cover(abs(uv.y - 0.5) - 0.006);
  float n = fbm(uv, vec2(4.0), 3, 0.5, 961.0);
  float t = 0.84 + 0.1 * thread + 0.03 * fuzz + 0.03 * n - 0.15 * seam;
  float h = 0.6 + 0.2 * thread + 0.03 * fuzz - 0.25 * seam + 0.06 * n;
  return M(vec3(t), 1.0, sat(h), 0.9);
}

Mat material(vec2 uv) {
  int v = uVariant;
  if (v == V_WOOL) return knit(uv);
  if (v == V_BLANKET) return weave(uv);
  if (v == V_TERRACOTTA || v == V_CONCRETE) {
    bool terr = v == V_TERRACOTTA;
    float n = fbm(uv, vec2(terr ? 5.0 : 3.0), 5, 0.55, 970.0);
    float g = gnoise(uv * floor(uSize * 0.5), vec2(floor(uSize * 0.5)), 971.0);
    vec4 w = worley(uv, vec2(30.0), 0.9, 972.0);
    float pore = (1.0 - smoothstep(0.05, 0.14, w.x)) * step(w.z, terr ? 0.15 : 0.2);
    float t = terr ? 0.9 + 0.07 * n + 0.03 * g : 0.93 + 0.04 * n + 0.015 * g;
    t -= pore * (terr ? 0.12 : 0.18);
    // terracotta: faint horizontal smears; concrete: trowel swirls
    float sm = terr ? fbm(uv, vec2(2.0, 10.0), 3, 0.5, 973.0) : fbm(uv + warp(uv, 2.0, 0.1, 974.0), vec2(3.0), 3, 0.5, 975.0);
    t += 0.025 * sm;
    float h = 0.8 + 0.05 * n + 0.02 * g - 0.2 * pore + 0.02 * sm;
    return M(vec3(min(t, 1.0)), 1.0, sat(h), terr ? 0.85 : 0.62 + 0.08 * sm);
  }
  if (v == V_SPONGE) {
    bool wet = uP[0].x > 0.5;
    vec2 q = uv + warp(uv, 4.0, 0.03, 980.0);
    vec4 w = worley(q, vec2(9.0), 0.9, 981.0);
    vec4 w2 = worley(q, vec2(20.0), 0.9, 982.0);
    float hole = (1.0 - smoothstep(0.18, 0.32, w.x)) * step(w.z, 0.6);
    float hole2 = (1.0 - smoothstep(0.12, 0.26, w2.x)) * step(w2.z, 0.5);
    float holes = max(hole, hole2 * 0.8);
    float n = fbm(uv, vec2(6.0), 4, 0.55, 983.0);
    vec3 base = wet ? rgb(0xa5a242) : rgb(0xc8c450);
    vec3 col = base * (0.9 + 0.2 * n);
    col = mix(col, base * 0.35, holes);
    float h = 0.75 + 0.1 * n - 0.55 * holes;
    float r = wet ? 0.35 : 0.9;
    if (wet) {
      float drop = (1.0 - smoothstep(0.1, 0.2, worley(uv, vec2(14.0), 0.9, 984.0).x)) * step(0.85, worley(uv, vec2(14.0), 0.9, 984.0).z);
      col = mix(col, col * 1.2, drop);
      r = mix(r, 0.05, drop);
      h += 0.05 * drop;
    }
    return M(col, 1.0, sat(h), r);
  }
  return missingTex(uv);
}
