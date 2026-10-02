// Glass family: clear & stained glass, ice variants, slime, honey, beacon and sea lantern.

Mat glassPane(vec2 uv, float interiorA, float frameA, vec3 tintC) {
  float e = borderDist(uv);
  float frame = 1.0 - smoothstep(0.9 * PX, 1.1 * PX, e);
  float n = fbm(uv, vec2(3.0), 3, 0.5, 900.0);
  // diagonal streak highlights (classic glass texture), top-left and bottom-right
  float s1 = cover(abs((uv.y - uv.x) - 0.42) - 0.012) * step(0.55, uv.y) * step(uv.x, 0.45) * step(0.15, uv.x);
  float s2 = cover(abs((uv.y - uv.x) - 0.33) - 0.006) * step(0.62, uv.y) * step(uv.x, 0.32) * step(0.2, uv.x);
  float s3 = cover(abs((uv.y - uv.x) + 0.42) - 0.01) * step(uv.y, 0.45) * step(0.6, uv.x) * step(uv.x, 0.85);
  float streak = max(max(s1, s2 * 0.8), s3);
  float wav = 0.5 + 0.5 * gnoise(uv * vec2(3.0, 12.0), vec2(3.0, 12.0), 901.0);
  vec3 col = tintC * (0.96 + 0.04 * n);
  col = mix(col, vec3(0.92, 0.96, 0.98), frame * 0.6 + streak * 0.5);
  float a = interiorA + 0.03 * wav;
  a = mix(a, frameA, frame);
  a = max(a, streak * (interiorA + 0.2));
  float h = 0.9 + 0.02 * wav + 0.05 * frame * bevel(e, 0.9 * PX);
  return M(col, sat(a), h, 0.03 + 0.03 * n);
}

Mat iceSurface(vec2 uv, vec3 deep, vec3 light, float alpha, float cracks, float bubbles) {
  float n = fbm(uv, vec2(3.0), 4, 0.55, 910.0);
  float st = fbm(uv, vec2(2.0, 8.0), 3, 0.5, 911.0);
  vec3 col = mix(deep, light, sat(0.5 + 0.7 * n + 0.3 * st));
  vec4 v = voronoi(uv + warp(uv, 4.0, 0.03, 912.0), vec2(3.0), 0.9, 913.0);
  float cr = (1.0 - smoothstep(0.0, 0.03, v.x)) * cracks * smoothstep(-0.1, 0.25, fbm(uv, vec2(4.0), 2, 0.5, 914.0));
  col = mix(col, vec3(0.95, 0.98, 1.0), cr * 0.7);
  vec4 w = worley(uv, vec2(24.0), 0.9, 915.0);
  float bub = (1.0 - smoothstep(0.08, 0.16, w.x)) * step(w.z, bubbles);
  col = mix(col, vec3(0.97, 0.99, 1.0), bub * 0.6);
  float h = 0.85 + 0.04 * n - 0.06 * cr;
  return M(col, sat(alpha + 0.1 * cr + 0.08 * bub), h, 0.04 + 0.04 * sat(n) + 0.05 * cr);
}

Mat material(vec2 uv) {
  int v = uVariant;
  if (v == V_GLASS) return glassPane(uv, uP[0].x, uP[0].y, uC[0]);
  if (v == V_ICE) return iceSurface(uv, uC[0], uC[1], uP[0].x, uP[0].y, uP[0].z);
  if (v == V_GEL) {
    // slime / honey: translucent shell with a denser inner cube
    vec2 c = uv - 0.5;
    float d = max(abs(c.x), abs(c.y));
    float inner = 1.0 - smoothstep(0.31, 0.33, d);
    float frame = smoothstep(0.43, 0.45, d);
    float n = fbm(uv, vec2(4.0), 3, 0.5, 920.0);
    vec3 col = mix(uC[0], uC[1], inner);
    col = mix(col, uC[2], frame * 0.6);
    col *= 0.94 + 0.1 * n;
    // honeycomb cells on honey
    if (uP[0].z > 0.0) {
      vec2 hx = uv * vec2(6.0, 6.0 * 1.1547);
      vec2 hi = floor(hx);
      vec4 w = worley(uv, vec2(7.0), 0.15, 921.0);
      float cellE = smoothstep(0.0, 0.08, w.y - w.x);
      col *= 1.0 - uP[0].z * 0.18 * (1.0 - cellE) * inner;
    }
    float a = mix(uP[0].x, uP[0].y, inner);
    a = max(a, frame * (uP[0].x + 0.2));
    float h = 0.85 + 0.04 * n - 0.06 * smoothstep(0.31, 0.33, d) * (1.0 - frame);
    return M(col, sat(a), h, 0.12 + 0.05 * n);
  }
  if (v == V_BEACON) {
    vec2 c = uv - 0.5;
    float d = max(abs(c.x), abs(c.y));
    float core = 1.0 - smoothstep(0.24, 0.26, d);
    Mat g = glassPane(uv, 0.18, 0.6, vec3(0.9, 0.97, 1.0));
    float n = fbm(uv, vec2(6.0), 3, 0.5, 930.0);
    float glow = sat(1.0 - length(c) * 3.2);
    vec3 cc = mix(rgb(0x5ad8d8), rgb(0xf0ffff), glow * 0.9 + 0.1 * n);
    vec2 g4 = abs(fract(uv * 4.0) - 0.5);
    cc *= 0.92 + 0.08 * smoothstep(0.3, 0.5, max(g4.x, g4.y));
    g.col = mix(g.col, cc, core);
    g.a = mix(g.a, 1.0, core);
    g.h = mix(g.h, 0.8 + 0.1 * glow, core);
    return g;
  }
  if (v == V_SEA_LANTERN) {
    // grid of glowing crystal tiles separated by prismarine frame lines
    vec2 g = uv * 4.0;
    vec2 f = fract(g) - 0.5;
    vec2 id = floor(g);
    float tile = 1.0 - smoothstep(0.38, 0.42, max(abs(f.x), abs(f.y)));
    float big = step(0.5, h1(mod(id, 4.0), 940.0));
    float n = fbm(uv, vec2(8.0), 3, 0.5, 941.0);
    vec3 lineC = rgb(0x6f9c94);
    vec3 tc = mix(rgb(0xa8dcd6), rgb(0xf2fffc), sat(0.45 + 0.8 * n + 0.35 * big));
    vec3 col = mix(lineC * (0.9 + 0.2 * n), tc, tile);
    float e = borderDist(uv);
    col = mix(col, rgb(0x6a9a90), 1.0 - smoothstep(0.5 * PX, 0.8 * PX, e));
    float h = 0.6 + 0.3 * tile * bevel(0.42 - max(abs(f.x), abs(f.y)), 0.1);
    return M(col, 1.0, h, 0.15 + 0.2 * (1.0 - tile));
  }
  return missingTex(uv);
}
