// Fluids & portals: water (still / flow), lava (still / flow), nether portal, end portal.

float ripples(vec2 uv, float flow) {
  // sum of tileable waves; flow stretches them along v
  vec2 f = flow > 0.5 ? vec2(6.0, 2.0) : vec2(4.0);
  float a = fbm(uv, f, 5, 0.55, 1000.0);
  float b = fbm(uv + vec2(0.37, 0.11), f * 2.0, 4, 0.5, 1001.0);
  return 0.6 * a + 0.4 * b;
}

Mat material(vec2 uv) {
  int v = uVariant;
  bool flow = uP[0].x > 0.5;
  if (v == V_WATER) {
    float r = ripples(uv, uP[0].x);
    float streak = flow ? fbm(uv, vec2(12.0, 2.0), 4, 0.55, 1002.0) : 0.0;
    float foam = flow ? smoothstep(0.35, 0.6, streak) * 0.5 : smoothstep(0.45, 0.7, r) * 0.15;
    vec3 col = vec3(0.72 + 0.06 * r + 0.15 * foam);
    float h = 0.6 + 0.25 * r + 0.1 * streak;
    return M(col, 0.78 + 0.08 * foam, sat(h), 0.03 + 0.15 * foam);
  }
  if (v == V_LAVA) {
    vec2 q = uv + warp(uv, 3.0, flow ? 0.08 : 0.05, 1010.0);
    float n = flow ? fbm(q, vec2(3.0, 9.0), 5, 0.55, 1011.0) : fbm(q, vec2(4.0), 5, 0.55, 1011.0);
    vec4 vc = voronoi(q, flow ? vec2(3.0, 6.0) : vec2(4.0), 0.9, 1012.0);
    float crust = smoothstep(0.05, 0.3, n + 0.15) * smoothstep(0.02, 0.1, vc.x);
    crust *= flow ? 0.55 : 0.75;
    float heat = sat(0.6 + 0.6 * fbm(uv, vec2(6.0), 3, 0.5, 1013.0));
    vec3 molten = mix(rgb(0xd84808), rgb(0xffb428), heat);
    molten = mix(molten, rgb(0xfff0a0), smoothstep(0.75, 1.0, heat) * 0.6);
    vec3 cr = mix(rgb(0x3a1206), rgb(0x6a2408), sat(0.5 + n));
    vec3 col = mix(molten, cr, crust);
    float h = 0.5 + 0.35 * crust + 0.08 * n;
    return M(col, 1.0, sat(h), mix(0.3, 0.85, crust));
  }
  if (v == V_NETHER_PORTAL) {
    vec2 c = uv - 0.5;
    vec2 q = uv + warp(uv, 3.0, 0.12, 1020.0);
    float sw = fbm(q, vec2(3.0), 5, 0.6, 1021.0);
    float sw2 = fbm(q + vec2(0.31, 0.17), vec2(6.0), 4, 0.55, 1022.0);
    float t = sat(0.5 + 0.8 * sw + 0.4 * sw2);
    vec3 col = mix(rgb(0x3a0a8a), rgb(0x8a2af0), t);
    col = mix(col, rgb(0xd09aff), smoothstep(0.75, 1.0, t) * 0.7);
    return M(col, 0.72 + 0.15 * t, 0.7 + 0.1 * sw, 0.1);
  }
  if (v == V_END_PORTAL) {
    // layered starfield on a near-black teal void
    float n = fbm(uv, vec2(3.0), 4, 0.55, 1030.0);
    vec3 col = mix(rgb(0x050c10), rgb(0x0c2a2c), sat(0.5 + 0.8 * n));
    for (int L = 0; L < 3; L++) {
      float fl = float(L);
      float cells = 10.0 + 8.0 * fl;
      vec4 w = worley(uv, vec2(cells), 0.9, 1031.0 + fl);
      float star = (1.0 - smoothstep(0.03, 0.1 + 0.03 * fl, w.x)) * step(w.z, 0.45 - 0.1 * fl);
      vec3 sc = L == 0 ? rgb(0xc8fff0) : (L == 1 ? rgb(0x6ad8c0) : rgb(0x3a8a9a));
      col = mix(col, sc, star * (0.9 - 0.2 * fl));
    }
    return M(col, 1.0, 0.5, 0.2);
  }
  return missingTex(uv);
}
