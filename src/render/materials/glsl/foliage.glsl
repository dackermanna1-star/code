// Foliage: leaf canopies (leaf blocks + fluff cards), grass tufts, vines, lichen, weeping vines.
//  V_CANOPY / V_FLUFF: uC0 light, uC1 dark, uC2 accent (blossom), uC3 accent 2
//    uP0: x cells (int), y leaf length, z width ratio, w presence (0..1)
//    uP1: x shape (0 broad, 1 needle, 2 round, 3 large, 4 narrow, 5 blossom), y twigs, z blossom amount, w leaf-shape exponent

Mat canopy(vec2 uv, bool masked) {
  vec3 lc = uC[0], dc = uC[1];
  int shape = int(uP[1].x + 0.5);
  float salt = 600.0;
  Mat m = M(dc * 0.55, 0.0, 0.0, 0.7);
  vec2 mc = uv - 0.5;
  float blob = 1.0;
  if (masked) {
    float ang = atan(mc.y, mc.x);
    float rr = 0.36 + 0.06 * sin(ang * 3.0 + 1.3) + 0.04 * sin(ang * 5.0 + 0.4);
    blob = 1.0 - smoothstep(rr - 0.05, rr + 0.03, length(mc));
  }
  float clump = fbm(uv, vec2(4.0), 3, 0.5, salt);
  // twigs visible through the gaps
  if (uP[1].y > 0.0) {
    for (int k = 0; k < 3; k++) {
      // wavy twigs, periodic in both directions
      vec3 r = h3(vec2(float(k), 1.0), salt + 1.0);
      float x = r.x + 0.06 * sin(TAU * uv.y + r.y * 6.0) + 0.02 * sin(TAU * 3.0 * uv.y + r.z * 6.0);
      float dx = uv.x - x;
      dx -= floor(dx + 0.5);
      float w = 0.006 + 0.003 * sin(TAU * uv.y + r.z * 4.0);
      float c = cover(abs(dx) - w) * uP[1].y * blob;
      over(m, rgb(0x3a2a1a), 0.15, 0.8, c);
    }
  }
  float shapeExp = uP[1].w > 0.0 ? uP[1].w : 0.8;
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cells = max(2.0, uP[0].x) + 2.0 * fl;
    vec2 off = vec2(0.31, 0.57) * fl;
    vec2 ci = floor(uv * cells + off);
    float layerK = 0.62 + 0.19 * fl;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = ci + vec2(float(x), float(y));
        vec3 r = h3(mod(g, vec2(cells)), salt + 10.0 + fl * 5.0);
        vec2 c = (g + 0.1 + 0.8 * r.xy - off) / cells;
        float pres = step(fract(r.z * 31.0), uP[0].w + 0.25 * clump);
        if (masked) pres *= step(length(fract(c) - 0.5), 0.4 + 0.05 * fl);
        if (pres <= 0.0) continue;
        float ang = TAU * fract(r.z * 7.0);
        float len = uP[0].y * (0.7 + 0.6 * fract(r.x * 13.0));
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 d = uv - c;
        d -= floor(d + 0.5);
        float shadeK = layerK * (0.8 + 0.35 * fract(r.y * 17.0));
        bool blossom = shape == 5 && fract(r.y * 7.0) < uP[1].z && L > 0;
        if (blossom) {
          float pa = atan(d.y, d.x) + ang;
          float pr = len * 0.42 * (0.78 + 0.22 * cos(5.0 * pa));
          float dl = length(d);
          float cv = cover(dl - pr);
          if (cv > 0.0) {
            float t = dl / max(pr, 1e-4);
            vec3 bc = mix(uC[3], uC[2], smoothstep(0.15, 0.6, t)) * (0.85 + 0.25 * fract(r.y * 29.0));
            over(m, bc * (0.9 + 0.1 * fl), 0.45 + 0.22 * fl + 0.08 * (1.0 - t), 0.55, cv);
          }
        } else {
          vec4 Ls = leafSD(d, -dir * len * 0.5, dir * len * 0.5, len * uP[0].z * 0.5, shapeExp);
          float cv = cover(Ls.x);
          if (cv > 0.0) leafPaint(m, cv, Ls.y, Ls.z, lc * shadeK, dc * shadeK, 0.3 + 0.22 * fl, uv);
        }
      }
    }
  }
  m.a *= blob;
  m.r = mix(0.7, m.r, m.a);
  return m;
}

Mat tuft(vec2 uv) {
  Mat m = M(rgb(0x6a6a6a), 0.0, 0.0, 0.7);
  for (int i = 0; i < 22; i++) {
    El e = grassBlade(i, 22.0, 0.85, 0.8, rgb(0xc2c2c0), rgb(0x6e6e6e), 0.0);
    drawEl(m, uv, e, 0.3 + 0.03 * float(i));
  }
  return m;
}

Mat vine(vec2 uv) {
  Mat m = M(rgb(0x5a5a5a), 0.0, 0.0, 0.7);
  // sinuous stems (tile vertically)
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float x0 = (fk + 0.3 + 0.4 * h1(vec2(fk, 2.0), 610.0)) / 3.0;
    float x = x0 + 0.05 * sin(uv.y * TAU * 2.0 + fk * 2.1) + 0.02 * sin(uv.y * TAU * 5.0 + fk);
    float dx = uv.x - x;
    dx -= floor(dx + 0.5);
    float c = cover(abs(dx) - 0.007);
    over(m, rgb(0x707070), 0.4, 0.7, c);
  }
  // leaves along the stems, sparse canopy
  vec3 lc = rgb(0xb2b2b0), dc = rgb(0x5e5e5e);
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float cells = 6.0 + fl * 2.0;
    vec2 off = vec2(0.5, 0.25) * fl;
    vec2 ci = floor(uv * cells + off);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = ci + vec2(float(x), float(y));
        vec3 r = h3(mod(g, vec2(cells)), 611.0 + fl);
        if (r.z > 0.62) continue;
        vec2 c = (g + 0.15 + 0.7 * r.xy - off) / cells;
        float ang = TAU * fract(r.z * 11.0);
        float len = 0.1 + 0.06 * fract(r.x * 7.0);
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 d = uv - c;
        d -= floor(d + 0.5);
        // vine leaves are broad with a pointed tip and a stalk
        vec4 Ls = leafSD(d, -dir * len * 0.3, dir * len * 0.7, len * 0.32, 0.55);
        float cv = cover(Ls.x);
        float sh = 0.75 + 0.3 * fract(r.y * 19.0) + 0.1 * fl;
        if (cv > 0.0) leafPaint(m, cv, Ls.y, Ls.z, lc * sh, dc * sh, 0.5 + 0.2 * fl, uv);
      }
    }
  }
  return m;
}

Mat lichen(vec2 uv) {
  float n = fbm(uv, vec2(4.0), 4, 0.55, 620.0);
  float cov = smoothstep(-0.02, 0.06, n + 0.08);
  vec4 w = worley(uv, vec2(20.0), 0.9, 621.0);
  float cup = 1.0 - smoothstep(0.1, 0.45, w.x);
  vec3 col = mix(rgb(0x6f8f82), rgb(0xa4c9b8), cup);
  float dots = (1.0 - smoothstep(0.08, 0.18, w.x)) * step(w.z, 0.3);
  col = mix(col, rgb(0xe2fff2), dots);
  float g = gnoise(uv * 64.0, vec2(64.0), 622.0);
  col *= 0.9 + 0.15 * g;
  return M(col, cov, 0.4 + 0.3 * cup + 0.1 * g, 0.85);
}

Mat weeping(vec2 uv) {
  Mat m = M(rgb(0x7a1a1a), 0.0, 0.0, 0.7);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float x0 = 0.22 + 0.28 * fk + 0.06 * (h1(vec2(fk, 1.0), 630.0) - 0.5);
    float x = x0 + 0.035 * sin(uv.y * TAU * 2.0 + fk * 1.7);
    float dx = uv.x - x;
    float c = cover(abs(dx) - 0.012);
    vec3 sc = mix(rgb(0x6e1414), rgb(0xa82a22), 0.5 + 0.5 * sin(uv.y * 40.0 + fk));
    over(m, sc, 0.5, 0.7, c);
    // leaf bulbs along the strand
    float yy = fract(uv.y * 6.0 + fk * 0.37);
    float side = mod(floor(uv.y * 6.0 + fk * 0.37), 2.0) * 2.0 - 1.0;
    vec2 lp = vec2(dx - side * 0.03, (yy - 0.5) / 6.0);
    vec4 Ls = leafSD(lp, vec2(-side * 0.025, 0.02), vec2(side * 0.035, -0.035), 0.017, 0.6);
    float cl = cover(Ls.x);
    if (cl > 0.0) leafPaint(m, cl, Ls.y, Ls.z, rgb(0xc43a2a), rgb(0x701818), 0.6, uv);
  }
  return m;
}

Mat material(vec2 uv) {
  int v = uVariant;
  if (v == V_CANOPY || v == V_FLUFF) return canopy(uv, v == V_FLUFF);
  if (v == V_TUFT) return tuft(uv);
  if (v == V_VINE) return vine(uv);
  if (v == V_LICHEN) return lichen(uv);
  if (v == V_WEEPING) return weeping(uv);
  return missingTex(uv);
}
