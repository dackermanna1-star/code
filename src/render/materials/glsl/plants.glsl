// Plants: grasses, ferns, double plants, crops, saplings, mushrooms, fungi, roots and misc cards.
// Element-based (see lib_plant). Common params: uP[0].x = stage / type, uP[0].y = plant-space y offset
// (0 bottom half, 1 top half of double plants).

const vec3 G1 = vec3(0.53, 0.53, 0.52);   // greyscale light (tinted plants)
const vec3 G2 = vec3(0.13, 0.13, 0.13);   // greyscale dark

int elemCount(int v, float st) {
  if (v == V_SHORT_GRASS) return 18;
  if (v == V_FERN) return 6;
  if (v == V_TALL_GRASS) return 26;
  if (v == V_LARGE_FERN) return 7;
  if (v == V_SUGAR_CANE) return 7;
  if (v == V_KELP) return 12;
  if (v == V_SEAGRASS) return 10;
  if (v == V_DEAD_BUSH) return 14;
  if (v == V_BAMBOO) return 4;
  if (v == V_SWEET_BERRY) return 26;
  if (v == V_MUSHROOM) return 2;
  if (v == V_FUNGUS) return 5;
  if (v == V_ROOTS) return 16;
  if (v == V_WHEAT) return 8 + int(st) + (st >= 6.0 ? 6 : 0);
  if (v == V_CARROTS) return 3 + int(st) * 2 + (st >= 3.0 ? 3 : 0);
  if (v == V_POTATOES) return 4 + int(st) * 3 + (st >= 3.0 ? 3 : 0);
  if (v == V_BEETROOTS) return 3 + int(st) * 2 + (st >= 3.0 ? 2 : 0);
  if (v == V_NETHER_WART) return 3 + int(st) * 3;
  if (v == V_STEM) return 3;
  if (v == V_SAPLING) return 18;
  if (v == V_AMETHYST) return 8;
  if (v == V_SEA_PICKLE) return 6;
  return 0;
}

El saplingEl(int i, float type) {
  // palettes per sapling type
  vec3 bark = rgb(0x5a4128), barkD = rgb(0x3a2a18), lf1 = rgb(0x78a842), lf2 = rgb(0x3e6a22);
  float tw = 0.028;
  if (type == 1.0) { bark = rgb(0x4a3420); lf1 = rgb(0x4f7a42); lf2 = rgb(0x22401e); }
  if (type == 2.0) { bark = rgb(0xd8d8d0); barkD = rgb(0x8a8a82); lf1 = rgb(0x9ac25a); lf2 = rgb(0x5a8a2a); }
  if (type == 3.0) { bark = rgb(0x6a5428); lf1 = rgb(0x5aa030); lf2 = rgb(0x2e6a16); }
  if (type == 4.0) { bark = rgb(0x6a6458); lf1 = rgb(0x8ab840); lf2 = rgb(0x4a7a1e); }
  if (type == 5.0) { bark = rgb(0x3e2e1a); lf1 = rgb(0x4a7a2a); lf2 = rgb(0x1e3e12); tw = 0.042; }
  if (type == 6.0) { bark = rgb(0x3a2027); lf1 = rgb(0xf6c8dc); lf2 = rgb(0xc46a92); }
  if (i == 0) {
    if (type == 4.0) return el(E_STEM, vec2(0.5, -0.02), vec2(0.4, 0.5), tw, tw * 0.6, 0.0, bark, barkD);
    return el(E_STEM, vec2(0.5, -0.02), vec2(0.5, 0.5), tw, tw * 0.6, 0.0, bark, barkD);
  }
  if (i == 1) {
    if (type == 4.0) return el(E_STEM, vec2(0.46, 0.2), vec2(0.66, 0.55), tw * 0.8, tw * 0.5, 0.0, bark, barkD);
    if (type == 1.0) return el(E_STEM, vec2(0.5, 0.4), vec2(0.5, 0.92), tw * 0.6, 0.004, 0.0, bark, barkD);
    return elNone();
  }
  float k = float(i - 2);
  if (type == 1.0) {
    // spruce: tiers of drooping needle fronds
    float tier = floor(k / 4.0);
    float y = 0.3 + tier * 0.16;
    float side = mod(k, 2.0) * 2.0 - 1.0;
    float wid = 0.38 - tier * 0.08;
    return el(E_FROND, vec2(0.5, y + 0.03), vec2(0.5 + side * wid, y - 0.06 + 0.05 * mod(floor(k / 2.0), 2.0)), 0.05, -side * 0.03, 7.0, lf1, lf2);
  }
  if (type == 6.0 && k < 4.0) {
    vec2 c = vec2(0.5 + (er(i, 1.0) - 0.5) * 0.4, 0.62 + (er(i, 2.0) - 0.5) * 0.3);
    return el(E_BALL, c, vec2(0.0), 0.13, 0.11, 22.0, lf1, lf2);
  }
  // bushy crown: leaves scattered inside an ellipse with random orientations (back to front)
  vec2 cen = type == 4.0 ? vec2(0.56, 0.68) : vec2(0.5, 0.64);
  vec2 rad = type == 4.0 ? vec2(0.3, 0.1) : vec2(0.2, 0.2);
  float pa = TAU * er(i, 3.0);
  float pr = sqrt(er(i, 6.0));
  vec2 pos = cen + vec2(cos(pa), sin(pa)) * rad * pr;
  float ang = TAU * er(i, 7.0);
  float ll = (type == 3.0 ? 0.2 : 0.14) * (0.8 + 0.4 * er(i, 8.0));
  vec2 dir = vec2(cos(ang), sin(ang));
  float wl = (type == 3.0 ? 0.065 : 0.05) * (0.8 + 0.4 * er(i, 4.0));
  float sh = (0.7 + 0.35 * er(i, 5.0)) * (0.8 + 0.25 * k / 16.0);
  return el(E_LEAF, pos - dir * ll * 0.5, pos + dir * ll * 0.5, wl, 0.8, 0.0, lf1 * sh, lf2 * sh);
}

El element(int v, int i, float st, float yoff) {
  float fi = float(i);
  if (v == V_SHORT_GRASS) return grassBlade(i, 18.0, 0.82, 0.95, G1, G2, 0.0);
  if (v == V_TALL_GRASS) return grassBlade(i, 26.0, 1.85, 1.0, G1, G2, yoff);
  if (v == V_SEAGRASS) {
    El e = grassBlade(i, 10.0, 1.05, 0.8, G1, G2, 0.0);
    e.w *= 0.8;
    return e;
  }
  if (v == V_ROOTS) {
    vec3 c1 = st > 0.5 ? rgb(0x2ab09a) : rgb(0xc4304a);
    vec3 c2 = st > 0.5 ? rgb(0x0e5048) : rgb(0x5a0e1a);
    El e = grassBlade(i, 16.0, 0.8, 0.85, c1, c2, 0.0);
    e.w *= 0.65;
    e.b.x += (er(i, 7.0) - 0.5) * 0.3;
    return e;
  }
  if (v == V_FERN || v == V_LARGE_FERN) {
    float n = v == V_FERN ? 6.0 : 7.0;
    float ang = mix(-1.15, 1.15, (fi + 0.5) / n + 0.08 * (er(i, 1.0) - 0.5));
    float len = v == V_FERN ? 0.55 + 0.3 * er(i, 2.0) : (1.35 + 0.55 * er(i, 2.0)) * (1.0 - abs(ang) * 0.25);
    vec2 a = vec2(0.5 + 0.06 * (er(i, 3.0) - 0.5), -0.02 - yoff);
    vec2 dir = vec2(sin(ang), cos(ang));
    float sh = 0.8 + 0.3 * er(i, 4.0);
    return el(E_FROND, a, a + dir * len, (v == V_FERN ? 0.12 : 0.17), -sign(ang) * 0.12 * len, v == V_FERN ? 9.0 : 13.0, G1 * sh, G2 * sh);
  }
  if (v == V_SUGAR_CANE) {
    vec3 c1 = vec3(0.62, 0.64, 0.6), c2 = vec3(0.3, 0.32, 0.3);
    if (i < 3) {
      float x = 0.2 + 0.3 * fi + 0.04 * (er(i, 1.0) - 0.5);
      return el(E_STEM, vec2(x, 0.0), vec2(x, 1.0), 0.05, 0.05, 4.0, c1, c2);
    }
    float s = mod(fi, 3.0);
    float x = 0.2 + 0.3 * s;
    float y0 = 0.2 + 0.55 * er(i, 2.0);
    float side = er(i, 3.0) > 0.5 ? 1.0 : -1.0;
    return el(E_LEAF, vec2(x, y0), vec2(x + side * 0.2, y0 + 0.22), 0.03, 0.6, 0.0, c1 * 1.05, c2);
  }
  if (v == V_KELP) {
    // wavy stalk (tiles vertically) with long blades and gas bladders
    if (i < 3) {
      float y0 = fi / 3.0, y1 = (fi + 1.0) / 3.0;
      float x0 = 0.5 + 0.06 * sin(y0 * TAU), x1 = 0.5 + 0.06 * sin(y1 * TAU);
      return el(E_STEM, vec2(x0, y0), vec2(x1, y1), 0.022, 0.022, 0.0, G1, G2);
    }
    float k = fi - 3.0;
    float y = 0.08 + k * 0.1;
    float side = mod(k, 2.0) * 2.0 - 1.0;
    float x = 0.5 + 0.06 * sin(y * TAU);
    if (mod(k, 3.0) == 2.0) return el(E_DISC, vec2(x + side * 0.04, y), vec2(0.0), 0.035, 0.03, 0.0, G1 * 1.15, G2);
    return el(E_LEAF, vec2(x, y - 0.02), vec2(x + side * 0.38, y + 0.18), 0.05, 0.5, 0.0, G1, G2);
  }
  if (v == V_DEAD_BUSH) {
    vec3 c1 = rgb(0x8f6a3a), c2 = rgb(0x5a3e1e);
    if (i == 0) return el(E_STEM, vec2(0.5, -0.02), vec2(0.5, 0.22), 0.025, 0.018, 0.0, c1, c2);
    float k = fi - 1.0;
    float ang = mix(-1.2, 1.2, er(i, 1.0));
    float len = 0.25 + 0.3 * er(i, 2.0);
    vec2 a = vec2(0.5, 0.18 + 0.05 * er(i, 3.0));
    if (k >= 6.0) {
      // sub-branches from the main branches
      int pj = 1 + int(mod(k, 6.0));
      float pang = mix(-1.2, 1.2, er(pj, 1.0));
      float plen = 0.25 + 0.3 * er(pj, 2.0);
      a = vec2(0.5, 0.18 + 0.05 * er(pj, 3.0)) + vec2(sin(pang), cos(pang)) * plen * (0.4 + 0.3 * er(i, 4.0));
      ang = pang + (er(i, 5.0) - 0.5) * 1.6;
      len *= 0.5;
    }
    vec2 b = a + vec2(sin(ang), cos(ang)) * len;
    return el(E_STEM, a, b, 0.014, 0.004, 0.0, c1, c2);
  }
  if (v == V_BAMBOO) {
    vec3 c1 = rgb(0x7fae36), c2 = rgb(0x4a7a1a);
    if (i == 0) return el(E_STEM, vec2(0.5, 0.0), vec2(0.5, 1.0), 0.07, 0.07, 2.0, c1, c2);
    float y0 = 0.25 + 0.45 * er(i, 1.0);
    float side = mod(fi, 2.0) * 2.0 - 1.0;
    return el(E_LEAF, vec2(0.5 + side * 0.05, y0), vec2(0.5 + side * 0.42, y0 + 0.12), 0.04, 0.6, 0.0, rgb(0x8cc040), rgb(0x4a7a1a));
  }
  if (v == V_SWEET_BERRY) {
    if (i < 20) {
      float ang = mix(-1.3, 1.3, er(i, 1.0));
      float r0 = 0.15 + 0.6 * er(i, 2.0);
      vec2 a = vec2(0.5 + sin(ang) * r0 * 0.4, 0.02 + cos(ang) * r0 * 0.5);
      vec2 b = a + vec2(sin(ang), cos(ang)) * 0.2;
      float sh = 0.75 + 0.4 * er(i, 3.0);
      return el(E_LEAF, a, b, 0.05, 0.8, 0.0, rgb(0x5c8a34) * sh, rgb(0x284a1a) * sh);
    }
    vec2 c = vec2(0.2 + 0.6 * er(i, 4.0), 0.2 + 0.5 * er(i, 5.0));
    return el(E_DISC, c, vec2(0.0), 0.045, 0.045, 0.0, rgb(0xff5a5a), rgb(0x8a0a1e));
  }
  if (v == V_MUSHROOM) {
    bool red = st > 0.5;
    if (i == 0) return el(E_STEM, vec2(0.5, 0.0), vec2(0.5, red ? 0.34 : 0.26), 0.055, 0.045, 0.0, rgb(0xe6dcc8), rgb(0xb0a48c));
    if (red) return el(E_CAP, vec2(0.5, 0.3), vec2(0.0), 0.22, 0.2, 14.0, rgb(0xc8261c), rgb(0xf4f0e8));
    return el(E_CAP, vec2(0.5, 0.25), vec2(0.0), 0.27, 0.09, 0.0, rgb(0xa0724a), rgb(0x000000));
  }
  if (v == V_FUNGUS) {
    bool warped = st > 0.5;
    vec3 cap = warped ? rgb(0x168a78) : rgb(0xa8202a);
    vec3 spot = warped ? rgb(0xf08a30) : rgb(0xf0a840);
    vec3 stem = warped ? rgb(0xb8743a) : rgb(0x8c2a30);
    if (i == 0) return el(E_STEM, vec2(0.5, 0.0), vec2(0.5, 0.45), 0.035, 0.028, 0.0, stem * 1.2, stem * 0.7);
    if (i == 1) return el(E_CAP, vec2(0.5, 0.42), vec2(0.0), 0.25, 0.2, 12.0, cap, spot);
    // dangling strands under the cap
    float x = 0.32 + 0.12 * (fi - 2.0);
    return el(E_STEM, vec2(x, 0.43), vec2(x + 0.01, 0.3 - 0.06 * er(i, 1.0)), 0.012, 0.008, 0.0, cap * 0.9, cap * 0.6);
  }
  if (v == V_WHEAT) {
    float n = 8.0 + st;
    bool ripe = st >= 7.0;
    vec3 c1 = ripe ? rgb(0xe0c25a) : mix(rgb(0x6aaa2a), rgb(0xb0b040), st / 7.0);
    vec3 c2 = ripe ? rgb(0x8a6a28) : rgb(0x2e5a14);
    float tall = 0.16 + 0.11 * st;
    if (fi < n) {
      El e = grassBlade(i, n, tall, 0.9, c1, c2, 0.0);
      e.w *= 0.75;
      return e;
    }
    // ears on top of some stalks
    int bi = i - int(n);
    El s = grassBlade(bi * 2, n, tall, 0.9, c1, c2, 0.0);
    vec2 top = s.b;
    vec2 dir = normalize(s.b - s.a);
    return el(E_EAR, top - dir * 0.2, top + dir * 0.02, 0.03, 0.0, 8.0, ripe ? rgb(0xf0d070) : rgb(0x8ab040), ripe ? rgb(0xa8823a) : rgb(0x4a7a20));
  }
  if (v == V_CARROTS || v == V_POTATOES || v == V_BEETROOTS) {
    int nl = v == V_CARROTS ? 3 + int(st) * 2 : (v == V_POTATOES ? 4 + int(st) * 3 : 3 + int(st) * 2);
    if (i < nl) {
      float ang = mix(-1.1, 1.1, (fi + 0.5) / float(nl) + 0.1 * (er(i, 1.0) - 0.5));
      float len = (0.22 + 0.12 * st) * (0.7 + 0.5 * er(i, 2.0));
      vec2 a = vec2(0.5 + 0.35 * (er(i, 3.0) - 0.5), -0.01);
      vec2 b = a + vec2(sin(ang), cos(ang)) * len;
      float sh = 0.8 + 0.35 * er(i, 4.0);
      if (v == V_CARROTS) return el(E_FROND, a, b, 0.05, -sign(ang) * 0.05, 6.0, rgb(0x5aa83a) * sh, rgb(0x2a5a1a) * sh);
      if (v == V_POTATOES) return el(E_LEAF, a + (b - a) * 0.15, b, 0.06, 0.7, 0.0, rgb(0x5f9a34) * sh, rgb(0x2a5218) * sh);
      return el(E_LEAF, a, b, 0.055, 0.8, 0.0, rgb(0x4a8a2a) * sh, rgb(0x9a1a30));
    }
    float k = fi - float(nl);
    vec2 c = vec2(0.28 + 0.22 * k, 0.03);
    if (v == V_CARROTS) return el(E_DISC, c, vec2(0.0), 0.045, 0.035, 0.0, rgb(0xff9a2a), rgb(0xb0500a));
    if (v == V_POTATOES) return el(E_DISC, c, vec2(0.0), 0.055, 0.04, 0.0, rgb(0xd8b46a), rgb(0x8a6a34));
    return el(E_DISC, vec2(0.38 + 0.24 * k, 0.05), vec2(0.0), 0.07, 0.06, 0.0, rgb(0xa8203a), rgb(0x500818));
  }
  if (v == V_NETHER_WART) {
    float sz = 0.05 + 0.03 * st;
    vec2 c = vec2(0.2 + 0.6 * er(i, 1.0), sz * 0.8 + (0.08 + 0.18 * st) * er(i, 2.0));
    return el(E_BALL, c, vec2(0.0), sz * (0.8 + 0.4 * er(i, 3.0)), sz * (0.9 + 0.5 * er(i, 4.0)), 30.0, rgb(0xc42a2a), rgb(0x5a0a0e));
  }
  if (v == V_STEM) {
    if (i == 0) return el(E_STEM, vec2(0.5, -0.02), vec2(0.46, 0.8), 0.03, 0.02, 0.0, rgb(0x7ab040), rgb(0x3a6a1a));
    float side = fi == 1.0 ? -1.0 : 1.0;
    float y = 0.35 + 0.25 * fi;
    return el(E_LEAF, vec2(0.48, y), vec2(0.48 + side * 0.25, y + 0.1), 0.06, 0.6, 0.0, rgb(0x6aa03a), rgb(0x2e5a1a));
  }
  if (v == V_SAPLING) return saplingEl(i, st);
  if (v == V_AMETHYST) {
    float ang = mix(-0.9, 0.9, (fi + 0.5) / 8.0) + 0.15 * (er(i, 1.0) - 0.5);
    float len = (0.45 + 0.4 * er(i, 2.0)) * (1.0 - 0.35 * abs(ang));
    vec2 a = vec2(0.5 + 0.1 * (er(i, 3.0) - 0.5), -0.02);
    return el(E_SPIKE, a, a + vec2(sin(ang), cos(ang)) * len, 0.05 + 0.04 * er(i, 4.0), 0.0, 0.0, rgb(0xe6d0ff), rgb(0x7a4ac0));
  }
  if (v == V_SEA_PICKLE) {
    float k = mod(fi, 3.0);
    vec2 c = vec2(0.28 + 0.22 * k, 0.0);
    float hh = 0.16 + 0.05 * k;
    if (fi < 3.0) return el(E_DISC, c + vec2(0.0, hh), vec2(0.0), 0.075, hh, 0.0, rgb(0x7a9a3a), rgb(0x3e5a1a));
    return el(E_DISC, c + vec2(0.0, 2.0 * hh + 0.01), vec2(0.0), 0.04, 0.03, 0.0, rgb(0xeaff9a), rgb(0xb8e060));
  }
  return elNone();
}

Mat lilyPad(vec2 uv) {
  vec2 c = uv - 0.5;
  float r = length(c);
  float ang = atan(c.y, c.x);
  float notch = abs(mod(ang - 0.9 + PI, TAU) - PI);
  float rad = 0.44 + 0.015 * sin(ang * 7.0);
  float inside = cover(r - rad) * cover(-(notch - 0.22 * sat(r / 0.44)) * r);
  float veins = smoothstep(0.85, 1.0, cos(ang * 13.0)) * smoothstep(0.05, 0.3, r);
  vec3 col = mix(vec3(0.42), vec3(0.62), sat(0.5 + 0.4 * fbm(uv, vec2(6.0), 3, 0.5, 700.0)));
  col *= 1.0 + 0.12 * veins;
  col *= 0.85 + 0.15 * smoothstep(rad, rad - 0.05, r);
  float h = 0.6 + 0.05 * veins + 0.1 * smoothstep(rad, rad - 0.04, r);
  return M(col, inside, h, 0.35);
}

Mat cobweb(vec2 uv) {
  vec2 c = uv - 0.5;
  float r = length(c);
  float ang = atan(c.y, c.x);
  float spokes = 9.0;
  float sa = abs(fract(ang / TAU * spokes + 0.05 * sin(r * 20.0)) - 0.5) / spokes * TAU * r;
  float spoke = cover(sa - 0.003);
  float spiral = abs(fract(r * 14.0 - ang / TAU) - 0.5) / 14.0;
  float sp = cover(spiral - 0.0025) * step(r, 0.47) * step(0.04, r);
  float frame = cover(abs(borderDist(uv) - 0.03) - 0.003);
  float a = max(max(spoke, sp), frame) * step(r, 0.72);
  vec3 col = vec3(0.86, 0.87, 0.88);
  return M(col, a * 0.95, 0.6, 0.5);
}

Mat material(vec2 uv) {
  int v = uVariant;
  if (v == V_LILY_PAD) return lilyPad(uv);
  if (v == V_COBWEB) return cobweb(uv);
  float st = uP[0].x;
  float yoff = uP[0].y;
  int n = elemCount(v, st);
  if (n == 0) return missingTex(uv);
  Mat m = M(vec3(0.3, 0.4, 0.2), 0.0, 0.0, 0.7);
  for (int i = 0; i < 40; i++) {
    if (i >= n) break;
    El e = element(v, i, st, yoff);
    drawEl(m, uv, e, 0.3 + 0.012 * float(i));
  }
  return m;
}
