// Flowers: small flowers (V_FLOWER, uP[0].x = type) and two-block flowers (V_TALL_FLOWER,
// uP[0].x = type, uP[0].y = plant-space y offset of this half).
// Small types: 0 dandelion, 1 poppy, 2 blue orchid, 3 allium, 4 azure bluet, 5 red tulip,
// 6 orange tulip, 7 white tulip, 8 pink tulip, 9 oxeye daisy, 10 cornflower, 11 lily of the valley
// Tall types: 0 sunflower, 1 lilac, 2 rose bush, 3 peony

const vec3 STEM1 = vec3(0.16, 0.36, 0.07);
const vec3 STEM2 = vec3(0.04, 0.12, 0.02);
const vec3 LEAF1 = vec3(0.14, 0.33, 0.06);
const vec3 LEAF2 = vec3(0.03, 0.1, 0.02);

int flowerCount(float t) {
  if (t == 0.0) return 5;
  if (t == 1.0) return 5;
  if (t == 2.0) return 11;
  if (t == 3.0) return 4;
  if (t == 4.0) return 16;
  if (t >= 5.0 && t <= 8.0) return 6;
  if (t == 9.0) return 5;
  if (t == 10.0) return 6;
  return 10;
}

El flowerEl(float t, int i) {
  float fi = float(i);
  // common: stem + two basal leaves
  if (t != 4.0 && t != 2.0 && t != 11.0) {
    float top = t == 3.0 ? 0.62 : 0.5;
    if (i == 0) return el(E_STEM, vec2(0.5, -0.02), vec2(0.5 + 0.02 * (er(0, 1.0) - 0.5), top), 0.018, 0.014, 0.0, STEM1, STEM2);
    if (i == 1) return el(E_LEAF, vec2(0.5, 0.0), vec2(0.27, t >= 5.0 && t <= 8.0 ? 0.42 : 0.24), t >= 5.0 && t <= 8.0 ? 0.05 : 0.045, 0.75, 0.0, LEAF1, LEAF2);
    if (i == 2) return el(E_LEAF, vec2(0.5, 0.0), vec2(0.74, t >= 5.0 && t <= 8.0 ? 0.36 : 0.2), t >= 5.0 && t <= 8.0 ? 0.05 : 0.045, 0.75, 0.0, LEAF1 * 1.1, LEAF2);
  }
  if (t == 0.0) {
    if (i == 3) return el(E_BALL, vec2(0.5, 0.57), vec2(0.0), 0.11, 0.095, 40.0, rgb(0xffe030), rgb(0xd09000));
    return el(E_DISC, vec2(0.5, 0.5), vec2(0.0), 0.05, 0.03, 0.0, rgb(0x6aa030), rgb(0x2a5a10));
  }
  if (t == 1.0) {
    if (i == 3) return el(E_PETALS, vec2(0.5, 0.6), vec2(0.4, 0.0), 0.15, 0.085, 4.0, rgb(0xf0302a), rgb(0x9a0c0c));
    return el(E_DISC, vec2(0.5, 0.6), vec2(0.0), 0.036, 0.036, 1.0, rgb(0x302018), rgb(0x0a0604));
  }
  if (t == 2.0) {
    // blue orchid: curved stems with several small star flowers
    if (i < 3) {
      vec2 tipp = vec2(0.32 + 0.18 * fi, 0.45 + 0.13 * mod(fi + 1.0, 3.0));
      return el(E_STEM, vec2(0.5, -0.02), tipp, 0.014, 0.01, 0.0, STEM1, STEM2);
    }
    if (i < 5) return el(E_LEAF, vec2(0.5, 0.0), vec2(i == 3 ? 0.22 : 0.8, 0.3), 0.045, 0.7, 0.0, LEAF1, LEAF2);
    float k = mod(fi - 5.0, 3.0);
    vec2 c = vec2(0.32 + 0.18 * k, 0.45 + 0.13 * mod(k + 1.0, 3.0));
    if (fi - 5.0 < 3.0) return el(E_PETALS, c, vec2(0.3 * k, 0.0), 0.085, 0.045, 5.0, rgb(0x7ad8ff), rgb(0x2a7ad0));
    return el(E_DISC, c, vec2(0.0), 0.02, 0.02, 0.0, rgb(0xe8f4ff), rgb(0x8ac8f0));
  }
  if (t == 3.0) return el(E_BALL, vec2(0.5, 0.72), vec2(0.0), 0.17, 0.16, 34.0, rgb(0xd47cf0), rgb(0x6a2a9a));
  if (t == 4.0) {
    // azure bluet: a clump of tiny white flowers
    float k = mod(fi, 5.0);
    vec2 c = vec2(0.2 + 0.15 * k + 0.04 * (er(int(k), 1.0) - 0.5), 0.3 + 0.2 * er(int(k), 2.0));
    if (fi < 5.0) return el(E_STEM, vec2(0.5 + (k - 2.0) * 0.05, -0.02), c, 0.01, 0.008, 0.0, STEM1, STEM2);
    if (fi < 10.0) return el(E_PETALS, c, vec2(0.7 * k, 0.0), 0.055, 0.032, 4.0, rgb(0xfafaf6), rgb(0xc8ccd8));
    if (fi < 15.0) return el(E_DISC, c, vec2(0.0), 0.016, 0.016, 0.0, rgb(0xf8e060), rgb(0xc0a020));
    return el(E_LEAF, vec2(0.5, 0.0), vec2(0.3, 0.12), 0.04, 0.7, 0.0, LEAF1, LEAF2);
  }
  if (t >= 5.0 && t <= 8.0) {
    vec3 c1 = rgb(0xf04030), c2 = rgb(0x9a1410);
    if (t == 6.0) { c1 = rgb(0xffa040); c2 = rgb(0xc0500e); }
    if (t == 7.0) { c1 = rgb(0xfafaf4); c2 = rgb(0xc4c8c0); }
    if (t == 8.0) { c1 = rgb(0xffb8d8); c2 = rgb(0xc8608a); }
    vec2 b = vec2(0.5, 0.47);
    if (i == 3) return el(E_LEAF, b, vec2(0.39, 0.73), 0.075, 0.7, 0.0, c1 * 0.92, c2);
    if (i == 4) return el(E_LEAF, b, vec2(0.61, 0.73), 0.075, 0.7, 0.0, c1 * 0.92, c2);
    return el(E_LEAF, b + vec2(0.0, -0.01), vec2(0.5, 0.77), 0.085, 0.6, 0.0, c1, c2 * 1.1);
  }
  if (t == 9.0) {
    if (i == 3) return el(E_PETALS, vec2(0.5, 0.6), vec2(0.13, 0.0), 0.14, 0.03, 13.0, rgb(0xfdfdf8), rgb(0xc8c8c0));
    return el(E_DISC, vec2(0.5, 0.6), vec2(0.0), 0.05, 0.05, 1.0, rgb(0xf8d030), rgb(0xb07a08));
  }
  if (t == 10.0) {
    if (i == 3) return el(E_PETALS, vec2(0.5, 0.6), vec2(0.2, 0.0), 0.13, 0.035, 9.0, rgb(0x6a8aff), rgb(0x2a3ab0));
    if (i == 4) return el(E_PETALS, vec2(0.5, 0.61), vec2(0.55, 0.0), 0.085, 0.03, 7.0, rgb(0x8aa4ff), rgb(0x3048c0));
    return el(E_DISC, vec2(0.5, 0.6), vec2(0.0), 0.028, 0.028, 1.0, rgb(0x2a2a80), rgb(0x10104a));
  }
  // lily of the valley: arched stem with hanging bells, two broad leaves
  if (i == 0) return el(E_LEAF, vec2(0.48, -0.02), vec2(0.25, 0.62), 0.11, 0.8, 0.0, LEAF1, LEAF2);
  if (i == 1) return el(E_LEAF, vec2(0.52, -0.02), vec2(0.78, 0.5), 0.1, 0.8, 0.0, LEAF1 * 1.1, LEAF2);
  if (i == 2) return el(E_STEM, vec2(0.5, -0.02), vec2(0.52, 0.62), 0.012, 0.01, 0.0, STEM1, STEM2);
  if (i == 3) return el(E_STEM, vec2(0.52, 0.62), vec2(0.72, 0.66), 0.01, 0.007, 0.0, STEM1, STEM2);
  float k = fi - 4.0;
  vec2 c = vec2(0.52 + 0.038 * k, 0.6 - 0.02 * k + 0.03 * k * (k - 3.0) * 0.1 - 0.04);
  return el(E_DISC, c, vec2(0.0), 0.03, 0.034, 0.0, rgb(0xfafaf2), rgb(0xc0c4b8));
}

int tallCount(float t) {
  if (t == 0.0) return 12;
  if (t == 1.0) return 18;
  if (t == 2.0) return 34;
  return 30;
}

El tallEl(float t, int i, float yoff) {
  float fi = float(i);
  vec2 o = vec2(0.0, -yoff);
  if (t == 0.0) {
    // sunflower: tall stem, big leaves, head at the top
    if (i == 0) return el(E_STEM, vec2(0.5, -0.02) + o, vec2(0.52, 1.55) + o, 0.035, 0.028, 0.0, STEM1, STEM2);
    if (i < 9) {
      float y = 0.2 + 0.17 * (fi - 1.0);
      float side = mod(fi, 2.0) * 2.0 - 1.0;
      return el(E_LEAF, vec2(0.51, y) + o, vec2(0.51 + side * 0.36, y + 0.12) + o, 0.085, 0.75, 0.0, LEAF1 * (0.9 + 0.2 * er(i, 1.0)), LEAF2);
    }
    if (i == 9) return el(E_PETALS, vec2(0.52, 1.6) + o, vec2(0.1, 0.0), 0.2, 0.05, 20.0, rgb(0xffd020), rgb(0xd08a08));
    if (i == 10) return el(E_PETALS, vec2(0.52, 1.6) + o, vec2(0.25, 0.0), 0.16, 0.045, 16.0, rgb(0xffc818), rgb(0xc07a08));
    return el(E_DISC, vec2(0.52, 1.6) + o, vec2(0.0), 0.12, 0.12, 1.0, rgb(0x5a3412), rgb(0x241406));
  }
  if (t == 1.0) {
    // lilac: woody stems, leaves, purple flower panicles in the upper half
    if (i < 3) return el(E_STEM, vec2(0.5, -0.02) + o, vec2(0.28 + 0.22 * fi, 1.35) + o, 0.025, 0.014, 0.0, rgb(0x6a5a3a), rgb(0x3a2e1a));
    if (i < 12) {
      float y = 0.25 + 0.12 * (fi - 3.0);
      float x = 0.28 + 0.44 * er(i, 1.0);
      float side = er(i, 2.0) > 0.5 ? 1.0 : -1.0;
      return el(E_LEAF, vec2(x, y) + o, vec2(x + side * 0.22, y + 0.12) + o, 0.065, 0.75, 0.0, LEAF1 * (0.85 + 0.3 * er(i, 3.0)), LEAF2);
    }
    vec2 c = vec2(0.25 + 0.25 * mod(fi - 12.0, 3.0), 1.35 + 0.22 * floor((fi - 12.0) / 3.0) + 0.05 * er(i, 4.0));
    return el(E_BALL, c + o, vec2(0.0), 0.13, 0.16, 26.0, rgb(0xe0a4ec), rgb(0x8a4a9a));
  }
  if (t == 2.0) {
    // rose bush: dense leafy bush with red roses in the upper half
    if (i < 28) {
      float x = 0.12 + 0.76 * er(i, 1.0);
      float y = 0.06 + 1.62 * er(i, 2.0);
      float ang = TAU * er(i, 3.0);
      vec2 d = vec2(cos(ang), sin(ang)) * 0.11;
      return el(E_LEAF, vec2(x, y) - d + o, vec2(x, y) + d + o, 0.06, 0.8, 0.0, LEAF1 * (0.8 + 0.4 * er(i, 4.0)), LEAF2);
    }
    float k = fi - 28.0;
    vec2 c = vec2(0.25 + 0.25 * mod(k, 3.0), 1.2 + 0.3 * floor(k / 3.0) + 0.08 * er(i, 5.0));
    if (k < 6.0 && mod(k, 2.0) == 0.0) return el(E_PETALS, c + o, vec2(k, 0.0), 0.09, 0.06, 5.0, rgb(0xe02434), rgb(0x7a0814));
    return el(E_DISC, c + o, vec2(0.0), 0.055, 0.05, 1.0, rgb(0xc0141e), rgb(0x500408));
  }
  // peony: leafy with big pink blooms
  if (i < 24) {
    float x = 0.12 + 0.76 * er(i, 1.0);
    float y = 0.1 + 1.4 * er(i, 2.0);
    float ang = TAU * er(i, 3.0);
    vec2 d = vec2(cos(ang), sin(ang)) * 0.13;
    return el(E_LEAF, vec2(x, y) - d + o, vec2(x, y) + d + o, 0.065, 0.8, 0.0, LEAF1 * (0.8 + 0.4 * er(i, 4.0)), LEAF2);
  }
  float k = fi - 24.0;
  vec2 c = vec2(0.28 + 0.44 * mod(k, 2.0), 1.3 + 0.25 * floor(k / 2.0));
  return el(E_BALL, c + o, vec2(0.0), 0.15, 0.14, 14.0, rgb(0xffc4dc), rgb(0xc8608a));
}

Mat material(vec2 uv) {
  int v = uVariant;
  float t = uP[0].x;
  bool tall = v == V_TALL_FLOWER;
  if (v != V_FLOWER && !tall) return missingTex(uv);
  int n = tall ? tallCount(t) : flowerCount(t);
  Mat m = M(vec3(0.15, 0.3, 0.08), 0.0, 0.0, 0.7);
  for (int i = 0; i < 36; i++) {
    if (i >= n) break;
    El e;
    if (tall) e = tallEl(t, i, uP[0].y);
    else e = flowerEl(t, i);
    drawEl(m, uv, e, 0.3 + 0.015 * float(i));
  }
  return m;
}
