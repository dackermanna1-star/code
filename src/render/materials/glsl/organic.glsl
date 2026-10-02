// Organic blocks: pumpkins, melon, hay, cactus, bone, wart blocks, shroomlight, chorus, dragon egg,
// cake, target.  uP[0].x = part / sub-type for multi-texture blocks.

// Ribbed gourd skin (pumpkin / melon sides): vertical ribs with grooves and waxy speckle.
Mat gourdSide(vec2 uv, vec3 dk, vec3 md, vec3 lt, float ribs, float stripes) {
  float x = uv.x + 0.01 * fbm(uv, vec2(2.0, 4.0), 2, 0.5, 1100.0);
  float rib = cos(x * TAU * ribs);
  float groove = smoothstep(0.75, 1.0, -rib);
  float n = fbm(uv, vec2(6.0, 3.0), 4, 0.55, 1101.0);
  float sp = gnoise(uv * 80.0, vec2(80.0), 1102.0);
  vec3 col = mix(md, lt, sat(0.5 + 0.45 * rib * 0.5 + 0.4 * n));
  col = mix(col, dk, groove * 0.75);
  if (stripes > 0.0) {
    float st = smoothstep(0.2, 0.5, fbm(vec2(x, uv.y), vec2(ribs * 2.0, 2.0), 3, 0.5, 1103.0));
    col = mix(col, lt * 1.15, st * stripes);
  }
  col *= 1.0 + 0.05 * sp;
  float h = 0.65 + 0.25 * (0.5 + 0.5 * rib) - 0.2 * groove + 0.03 * n;
  return M(col, 1.0, sat(h), 0.42 + 0.1 * groove);
}

// Pumpkin face: triangle eyes + jagged mouth (classic Minecraft carving), y up.
float pumpkinFace(vec2 uv) {
  vec2 p = uv * 16.0;
  // eyes: triangles
  float e1 = step(4.0, p.x) * step(p.x, 7.0) * step(9.0, p.y) * step(p.y, 12.0) * step(p.y - 9.0, (p.x - 4.0) * 1.0 + 0.5);
  float e2 = step(9.0, p.x) * step(p.x, 12.0) * step(9.0, p.y) * step(p.y, 12.0) * step(p.y - 9.0, (12.0 - p.x) * 1.0 + 0.5);
  // mouth: wide band with teeth
  float mouth = step(3.0, p.x) * step(p.x, 13.0) * step(3.5, p.y) * step(p.y, 6.5);
  float tooth = step(6.0, p.x) * step(p.x, 7.5) * step(5.0, p.y) + step(9.0, p.x) * step(p.x, 10.5) * step(p.y, 5.0);
  mouth *= 1.0 - sat(tooth);
  return sat(e1 + e2 + mouth);
}

Mat material(vec2 uv) {
  int v = uVariant;
  float part = uP[0].x;
  vec2 c = uv - 0.5;
  if (v == V_PUMPKIN_SIDE || v == V_CARVED) {
    Mat m = gourdSide(uv, rgb(0x9a4e08), rgb(0xd87a14), rgb(0xf0a030), 4.0, 0.0);
    float shade = smoothstep(0.0, 0.12, min(uv.y, 1.0 - uv.y));
    m.col *= 0.85 + 0.15 * shade;
    if (v == V_CARVED) {
      float f = pumpkinFace(uv);
      // soften the pixel edges slightly by a distance estimate
      float rim = sat(pumpkinFace(uv + vec2(0.012, 0.0)) + pumpkinFace(uv - vec2(0.012, 0.0)) + pumpkinFace(uv + vec2(0.0, 0.012)) + pumpkinFace(uv - vec2(0.0, 0.012))) * (1.0 - f);
      bool lit = part > 0.5;
      vec3 inside = lit ? mix(rgb(0xff9a10), rgb(0xffe080), sat(0.6 + 0.5 * fbm(uv, vec2(8.0), 3, 0.5, 1104.0))) : rgb(0x2a1606);
      m.col = mix(m.col, rgb(0xf6c860), rim * 0.8);
      m.col = mix(m.col, inside, f);
      m.h = mix(m.h, 0.15, f);
      m.r = mix(m.r, 0.8, f);
    }
    return m;
  }
  if (v == V_PUMPKIN_TOP || v == V_MELON_TOP) {
    bool melon = v == V_MELON_TOP;
    float r = length(c);
    float ang = atan(c.y, c.x);
    float rib = cos(ang * (melon ? 10.0 : 8.0) + 0.6 * fbm(uv, vec2(3.0), 2, 0.5, 1105.0));
    float n = fbm(uv, vec2(6.0), 4, 0.55, 1106.0);
    vec3 dk = melon ? rgb(0x3e5e14) : rgb(0x9a4e08);
    vec3 md = melon ? rgb(0x6a9028) : rgb(0xd87a14);
    vec3 lt = melon ? rgb(0x94bc40) : rgb(0xf0a030);
    vec3 col = mix(md, lt, sat(0.5 + 0.3 * rib + 0.4 * n));
    col = mix(col, dk, smoothstep(0.7, 1.0, -rib) * smoothstep(0.08, 0.3, r) * 0.7);
    col *= 0.85 + 0.15 * smoothstep(0.7, 0.3, r);
    // stem
    float stem = cover(sdRBox(c, vec2(1.4, 1.4) * PX, 0.4 * PX));
    vec3 sc = melon ? rgb(0x5a6a24) : rgb(0x6a5a2a);
    col = mix(col, sc * (0.8 + 0.3 * n), stem);
    float h = 0.7 + 0.1 * rib * smoothstep(0.05, 0.3, r) + 0.2 * stem + 0.03 * n;
    return M(col, 1.0, sat(h), mix(0.45, 0.7, stem));
  }
  if (v == V_MELON_SIDE) return gourdSide(uv, rgb(0x2e4a10), rgb(0x55801e), rgb(0x8ab03a), 5.0, 0.6);
  if (v == V_HAY) {
    bool top = part > 0.5;
    if (!top) {
      float x = uv.x + 0.01 * fbm(uv, vec2(3.0, 2.0), 2, 0.5, 1110.0);
      float str = gnoise(vec2(x * 48.0, uv.y * 3.0), vec2(48.0, 3.0), 1111.0);
      float str2 = gnoise(vec2(x * 96.0, uv.y * 5.0), vec2(96.0, 5.0), 1112.0);
      vec3 col = mix(rgb(0xa8801e), rgb(0xe0bc48), sat(0.5 + 0.5 * str + 0.25 * str2));
      // twine bands
      float band = max(cover(abs(uv.y - 3.0 * PX) - 0.9 * PX), cover(abs(uv.y - 13.0 * PX) - 0.9 * PX));
      vec3 bc = mix(rgb(0x6a2a10), rgb(0x9a4a20), 0.5 + 0.5 * gnoise(uv * vec2(60.0, 8.0), vec2(60.0, 8.0), 1113.0));
      col = mix(col, bc, band);
      float h = 0.65 + 0.2 * str + 0.05 * str2 + 0.08 * band;
      return M(col, 1.0, sat(h), 0.88 - 0.1 * band);
    }
    // cut straw ends
    vec4 w = worley(uv, vec2(18.0), 0.9, 1114.0);
    float tube = 1.0 - smoothstep(0.25, 0.45, w.x);
    float hole = 1.0 - smoothstep(0.08, 0.16, w.x);
    float n = fbm(uv, vec2(4.0), 3, 0.5, 1115.0);
    vec3 col = mix(rgb(0x9a7418), rgb(0xe2c050), sat(0.4 + 0.4 * tube + 0.3 * n + 0.2 * w.z));
    col = mix(col, rgb(0x6a4a10), hole * 0.7);
    float e = borderDist(uv);
    float rim = 1.0 - smoothstep(0.8 * PX, 1.2 * PX, e);
    col = mix(col, rgb(0x7a2e12), rim * 0.8);
    return M(col, 1.0, 0.6 + 0.25 * tube - 0.2 * hole, 0.88);
  }
  if (v == V_CACTUS) {
    float n = fbm(uv, vec2(6.0), 4, 0.55, 1120.0);
    if (part < 0.5) {
      // side: ribs with spine rows
      float rib = cos(uv.x * TAU * 4.0);
      vec3 col = mix(rgb(0x2e5a1a), rgb(0x5a8a2a), sat(0.5 + 0.5 * rib + 0.3 * n));
      col = mix(col, rgb(0x7aa83a), smoothstep(0.85, 1.0, rib) * 0.6);
      vec2 g = vec2(fract(uv.x * 4.0 + 0.5) - 0.5, fract(uv.y * 5.0 + 0.5 * floor(uv.x * 4.0 + 0.5)) - 0.5);
      float spine = cover(length(g * vec2(1.0, 1.5)) - 0.09) * 1.0;
      float tuftC = cover(length(g) - 0.16);
      col = mix(col, rgb(0x2a3a14), tuftC * 0.5);
      col = mix(col, rgb(0xe8e4c8), spine);
      float h = 0.65 + 0.25 * (0.5 + 0.5 * rib) + 0.1 * spine;
      return M(col, 1.0, sat(h), 0.5 - 0.15 * spine);
    }
    if (part < 1.5) {
      float r = max(abs(c.x), abs(c.y));
      float ang = atan(c.y, c.x);
      float rib = cos(ang * 8.0);
      vec3 col = mix(rgb(0x3a6a20), rgb(0x6a9a32), sat(0.5 + 0.3 * rib + 0.3 * n));
      col *= 0.8 + 0.2 * smoothstep(0.5, 0.1, length(c));
      float rim = smoothstep(0.43, 0.47, r);
      col = mix(col, rgb(0x2a4a14), rim);
      float spine = cover(length(fract(uv * 4.0) - 0.5) - 0.05) * (1.0 - rim);
      col = mix(col, rgb(0xe8e4c8), spine);
      return M(col, 1.0, 0.75 + 0.08 * rib - 0.2 * rim + 0.1 * spine, 0.5);
    }
    vec3 col = mix(rgb(0x8a9a48), rgb(0xb4c068), sat(0.5 + 0.6 * n));
    return M(col, 1.0, 0.7 + 0.1 * n, 0.65);
  }
  if (v == V_BONE) {
    float n = fbm(uv, vec2(5.0), 4, 0.55, 1130.0);
    vec3 base = mix(rgb(0xcdc8b2), rgb(0xe8e4d2), sat(0.5 + 0.7 * n));
    if (part < 0.5) {
      float gr = gnoise(vec2(uv.x * 40.0, uv.y * 3.0), vec2(40.0, 3.0), 1131.0);
      float groove = smoothstep(0.55, 0.9, abs(gr));
      vec4 w = worley(uv, vec2(16.0, 30.0), 0.9, 1132.0);
      float pore = (1.0 - smoothstep(0.06, 0.14, w.x)) * step(w.z, 0.3);
      vec3 col = base * (1.0 - 0.15 * groove) * (1.0 - 0.3 * pore);
      return M(col, 1.0, 0.75 - 0.12 * groove - 0.2 * pore + 0.05 * n, 0.62);
    }
    float r = max(abs(c.x), abs(c.y));
    float ring = smoothstep(0.28, 0.32, r) * (1.0 - smoothstep(0.44, 0.47, r));
    vec4 w = worley(uv, vec2(14.0), 0.9, 1133.0);
    float spongy = (1.0 - smoothstep(0.15, 0.35, w.x)) * (1.0 - smoothstep(0.26, 0.3, r));
    vec3 col = mix(base, base * 0.55, spongy * 0.8);
    col = mix(col, base * 1.05, ring);
    float rim = smoothstep(0.46, 0.5, r);
    col *= 1.0 - 0.15 * rim;
    return M(col, 1.0, 0.7 - 0.25 * spongy + 0.08 * ring - 0.1 * rim, 0.6);
  }
  if (v == V_WART) {
    // fleshy fungal tissue: bumps with dark crevices; uC0 dark, uC1 mid, uC2 light
    vec2 q = uv + warp(uv, 4.0, 0.04, 1140.0);
    vec4 w = worley(q, vec2(9.0), 0.9, 1141.0);
    vec4 w2 = worley(q, vec2(20.0), 0.9, 1142.0);
    float bump = 1.0 - smoothstep(0.0, 0.8, w.x);
    float b2 = 1.0 - smoothstep(0.0, 0.7, w2.x);
    float n = fbm(uv, vec2(6.0), 3, 0.5, 1143.0);
    float t = sat(0.3 + 0.5 * bump + 0.25 * b2 + 0.2 * n);
    vec3 col = t < 0.5 ? mix(uC[0], uC[1], t * 2.0) : mix(uC[1], uC[2], t * 2.0 - 1.0);
    float h = 0.35 + 0.45 * bump + 0.15 * b2;
    return M(col, 1.0, sat(h), 0.55 - 0.15 * bump);
  }
  if (v == V_SHROOMLIGHT) {
    vec2 q = uv + warp(uv, 4.0, 0.04, 1150.0);
    vec4 w = worley(q, vec2(7.0), 0.9, 1151.0);
    float n = fbm(uv, vec2(8.0), 4, 0.55, 1152.0);
    float blob = 1.0 - smoothstep(0.1, 0.55, w.x);
    vec3 col = mix(rgb(0xc85a20), rgb(0xf6a050), sat(0.4 + 0.5 * n + 0.3 * blob));
    col = mix(col, rgb(0xffe0a0), smoothstep(0.6, 1.0, blob) * 0.85);
    vec4 w2 = worley(uv, vec2(18.0), 0.9, 1153.0);
    float dot_ = (1.0 - smoothstep(0.1, 0.22, w2.x)) * step(w2.z, 0.25);
    col = mix(col, rgb(0xfff0c0), dot_);
    return M(col, 1.0, 0.5 + 0.35 * blob + 0.05 * n, 0.6);
  }
  if (v == V_CHORUS) {
    float n = fbm(uv, vec2(5.0), 4, 0.55, 1160.0);
    vec4 w = worley(uv, vec2(6.0), 0.9, 1161.0);
    float vein = 1.0 - smoothstep(0.0, 0.08, w.y - w.x);
    vec3 dk = part > 0.5 ? rgb(0x8a6a9a) : rgb(0x4a2a4a);
    vec3 lt = part > 0.5 ? rgb(0xe8d8f0) : rgb(0x8a6a8e);
    vec3 col = mix(dk, lt, sat(0.4 + 0.6 * n + 0.3 * (1.0 - w.x)));
    col = mix(col, lt * 1.15, vein * 0.6);
    if (part > 0.5) {
      float pet = cos(atan(c.y, c.x) * 5.0) * 0.5 + 0.5;
      col = mix(col, rgb(0xf6eefa), smoothstep(0.6, 1.0, pet) * smoothstep(0.42, 0.15, length(c)) * 0.6);
    }
    vec2 pf = vec2(bevel(borderDist(uv), 0.8 * PX));
    col *= 0.85 + 0.15 * pf.x;
    return M(col, 1.0, 0.6 + 0.2 * (1.0 - w.x) + 0.1 * vein, 0.6);
  }
  if (v == V_DRAGON_EGG) {
    float n = fbm(uv, vec2(5.0), 4, 0.55, 1170.0);
    vec4 w = worley(uv, vec2(12.0), 0.9, 1171.0);
    float sp = (1.0 - smoothstep(0.15, 0.32, w.x)) * step(w.z, 0.35);
    vec3 col = mix(rgb(0x0a070e), rgb(0x1a1024), sat(0.5 + 0.7 * n));
    col = mix(col, mix(rgb(0x4a1a6a), rgb(0xa050e0), w.z * 2.0), sp);
    return M(col, 1.0, 0.75 + 0.05 * n + 0.04 * sp, 0.2);
  }
  if (v == V_CAKE) {
    float n = fbm(uv, vec2(8.0), 4, 0.55, 1180.0);
    if (part < 0.5) {
      // top: white frosting with red sprinkles
      vec3 col = mix(rgb(0xe6e0dc), rgb(0xfcf8f4), sat(0.5 + 0.7 * n));
      vec4 w = worley(uv, vec2(7.0), 0.8, 1181.0);
      float sp = cover((w.x - 0.16) / 7.0) * step(w.z, 0.55);
      col = mix(col, rgb(0xd81a2a), sp);
      float e = borderDist(uv);
      col *= 0.9 + 0.1 * bevel(e, 0.8 * PX);
      return M(col, 1.0, 0.75 + 0.08 * n + 0.06 * sp, 0.45);
    }
    if (part < 1.5) {
      // side: sponge with a jam stripe and a frosting band on top
      float frost = smoothstep(11.5 * PX, 12.0 * PX, uv.y + 0.01 * gnoise(uv * vec2(24.0, 2.0), vec2(24.0, 2.0), 1182.0));
      float jam = cover(abs(uv.y - 6.0 * PX) - 0.6 * PX);
      vec4 w = worley(uv, vec2(24.0), 0.9, 1183.0);
      float pore = (1.0 - smoothstep(0.1, 0.25, w.x)) * step(w.z, 0.5);
      vec3 sponge = mix(rgb(0x9a5a2a), rgb(0xc07a40), sat(0.5 + 0.6 * n)) * (1.0 - 0.3 * pore);
      vec3 col = mix(sponge, rgb(0xb01828), jam);
      col = mix(col, mix(rgb(0xece6e2), rgb(0xfcf8f4), 0.5 + 0.5 * n), frost);
      return M(col, 1.0, 0.7 + 0.08 * frost - 0.2 * pore * (1.0 - frost), mix(0.85, 0.45, frost));
    }
    vec3 col = mix(rgb(0x8a4e22), rgb(0xb06c34), sat(0.5 + 0.6 * n));
    return M(col, 1.0, 0.7 + 0.05 * n, 0.85);
  }
  if (v == V_TARGET) {
    // straw background with red / white rings
    float x = uv.x;
    float str = gnoise(vec2(uv.x * 40.0, uv.y * 4.0), vec2(40.0, 4.0), 1190.0);
    vec3 straw = mix(rgb(0xb89a4a), rgb(0xe8d090), sat(0.5 + 0.5 * str));
    float r = length(c);
    float rings = part > 0.5 ? 0.0 : 1.0;
    float ringI = floor(r / (1.5 * PX));
    vec3 col = straw;
    if (r < 7.0 * PX) {
      float red = mod(ringI, 2.0) < 1.0 ? 1.0 : 0.0;
      vec3 rc = red > 0.5 ? rgb(0xc8202a) : rgb(0xf0ece4);
      col = mix(straw, rc * (0.9 + 0.1 * str), 0.92);
    }
    float h = 0.7 + 0.1 * str;
    return M(col, 1.0, h, 0.85);
  }
  return missingTex(uv);
}
