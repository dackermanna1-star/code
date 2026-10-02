// Natural rock family: generic rocks, crystal mosaics and bespoke volcanic / mineral textures.
// Heavy primitives (rock, crystal, granular) are called from a single site each to keep the
// compiled program small; variants post-process the shared result.

Mat basaltSide(vec2 uv, bool polished) {
  vec2 q = uv + vec2(0.015 * fbm(uv, vec2(2.0, 6.0), 3, 0.5, 1.0), 0.0);
  float s = fbm(q, vec2(14.0, 2.0), 4, 0.55, 2.0);
  float s2 = fbm(q, vec2(40.0, 3.0), 3, 0.5, 3.0);
  float grooves = ridged(q, vec2(9.0, 1.0), 2, 0.5, 4.0);
  vec3 dark = polished ? rgb(0x47494b) : rgb(0x3b3b3f);
  vec3 mid = polished ? rgb(0x5a5c5f) : rgb(0x515156);
  vec3 light = polished ? rgb(0x74767a) : rgb(0x6b6b70);
  vec3 col = mix(dark, mid, smoothstep(-0.35, 0.05, s));
  col = mix(col, light, smoothstep(0.15, 0.45, s + 0.3 * s2));
  float ves = worley(uv, vec2(10.0, 22.0), 0.9, 5.0).x;
  float pit = (1.0 - smoothstep(0.08, 0.22, ves)) * step(0.55, h1(floor(uv * vec2(10.0, 22.0)), 6.0));
  float h, r;
  if (polished) {
    col *= 0.96 + 0.08 * s2;
    float e = min(uv.y, 1.0 - uv.y);
    h = (0.85 + 0.05 * s - 0.04 * smoothstep(0.85, 1.0, grooves)) * (0.9 + 0.1 * bevel(e, 0.04));
    r = 0.42 + 0.06 * s2;
    col *= 0.92 + 0.08 * smoothstep(0.0, 0.03, e);
  } else {
    col *= 0.94 + 0.12 * s2;
    col = mix(col, dark * 0.6, pit * 0.7);
    h = 0.6 + 0.18 * s + 0.08 * s2 - 0.22 * smoothstep(0.75, 1.0, grooves) - 0.25 * pit;
    r = 0.88 + 0.05 * s2;
  }
  return M(col, 1.0, sat(h), sat(r));
}

Mat basaltTop(vec2 uv, bool polished) {
  vec2 c = uv - 0.5;
  float d = max(abs(c.x), abs(c.y));
  float rn = length(c);
  float n = fbm(uv, vec2(5.0), 4, 0.55, 7.0);
  float g = fbm(uv, vec2(24.0), 3, 0.5, 8.0);
  vec4 w = worley(uv, vec2(14.0), 0.9, 9.0);
  vec3 col;
  float h, r;
  if (polished) {
    float ang = atan(c.y, c.x);
    float sw = sin(mix(rn, d, 0.6) * 34.0 + ang + n * 2.0);
    col = mix(rgb(0x4e5053), rgb(0x6c6e72), smoothstep(-0.4, 0.6, sw));
    col *= 0.96 + 0.06 * g;
    float e = 0.5 - d;
    h = 0.82 + 0.04 * sw - 0.1 * (1.0 - bevel(e, 0.05));
    r = 0.4 + 0.05 * g;
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.04, e);
  } else {
    vec3 dark = rgb(0x3c3c40), mid = rgb(0x535357), light = rgb(0x6c6c71);
    float ring = sin(d * 44.0 + n * 3.0);
    col = mix(dark, mid, smoothstep(-0.3, 0.3, n + 0.3 * ring));
    col = mix(col, light, smoothstep(0.25, 0.6, n + 0.2 * g));
    col *= 0.93 + 0.12 * g;
    float pit = (1.0 - smoothstep(0.1, 0.25, w.x)) * step(w.z, 0.3);
    col = mix(col, dark * 0.55, pit * 0.7);
    float rim = smoothstep(0.43, 0.5, d);
    col *= 1.0 - 0.18 * rim;
    h = 0.62 + 0.15 * n + 0.08 * g + 0.04 * ring - 0.22 * pit - 0.1 * rim;
    r = 0.88;
  }
  return M(col, 1.0, sat(h), sat(r));
}

void blackstoneRings(inout Mat m, vec2 uv) {
  vec2 c = uv - 0.5;
  float d = max(abs(c.x), abs(c.y)) * 0.6 + length(c) * 0.4;
  float n = fbm(uv, vec2(4.0), 3, 0.5, 22.0);
  float ring = smoothstep(0.55, 0.95, sin(d * 30.0 + n * 4.0));
  m.col = mix(m.col, rgb(0x4a3f47), ring * 0.55);
  m.h += ring * 0.04;
}

void goldInclusions(inout Mat m, vec2 uv) {
  vec2 q = uv + warp(uv, 6.0, 0.04, 62.0);
  vec4 w = worley(q, vec2(8.0), 0.9, 63.0);
  float shape = w.x + 0.18 * gnoise(q * 30.0, vec2(30.0), 64.0);
  float gold = (1.0 - smoothstep(0.22, 0.3, shape)) * step(w.z, 0.5);
  vec4 w2 = worley(q, vec2(22.0), 0.9, 65.0);
  gold = max(gold, (1.0 - smoothstep(0.3, 0.45, w2.x)) * step(0.82, w2.z));
  float sh = fbm(uv, vec2(24.0), 3, 0.5, 66.0);
  vec3 gc = mix(rgb(0xa06e14), rgb(0xffd860), sat(0.55 + sh * 0.9));
  m.col = mix(m.col, gc, gold);
  m.h = mix(m.h, 0.8 + 0.08 * sh, gold);
  m.r = mix(m.r, 0.25, gold);
}

void obsidianDetail(inout Mat m, vec2 uv, bool crying) {
  vec2 q = uv + warp(uv, 4.0, 0.05, 32.0);
  float s = fbm(q, vec2(5.0, 9.0), 4, 0.55, 33.0);
  m.col = mix(m.col, rgb(0x3d2a62), smoothstep(0.3, 0.5, s) * 0.5);
  float g = fbm(uv, vec2(32.0), 2, 0.5, 34.0);
  m.col *= 0.92 + 0.12 * g;
  m.r = 0.05 + 0.04 * sat(g + 0.5);
  if (crying) {
    vec4 w = worley(uv, vec2(7.0), 0.9, 35.0);
    float spot = (1.0 - smoothstep(0.18, 0.34, w.x + 0.12 * gnoise(uv * 28.0, vec2(28.0), 36.0))) * step(w.z, 0.55);
    vec2 dc = vec2(floor(uv.x * 14.0), 0.0);
    float hasDrip = step(0.6, h1(dc, 37.0));
    float len = 0.15 + 0.3 * h1(dc, 39.0);
    float yy = fract(h1(dc, 38.0) - uv.y);
    float wx = abs(fract(uv.x * 14.0) - 0.5);
    float drip = hasDrip * (1.0 - smoothstep(0.12, 0.22, wx + 0.15 * yy / len)) * step(yy, len);
    float glow = max(spot, drip * 0.9);
    vec3 gc = mix(rgb(0x7a1fd6), rgb(0xd77bff), smoothstep(0.3, 1.0, spot));
    m.col = mix(m.col, gc, glow);
    m.h += 0.05 * glow;
    m.r = mix(m.r, 0.15, glow);
  }
}

void amethystBuds(inout Mat m, vec2 uv) {
  vec4 w = worley(uv, vec2(4.0), 0.85, 82.0);
  float pocket = 1.0 - smoothstep(0.2, 0.32, w.x + 0.06 * gnoise(uv * 24.0, vec2(24.0), 83.0));
  m.col = mix(m.col, rgb(0x2c1848), pocket * 0.85);
  m.h = mix(m.h, 0.35, pocket);
  vec4 w2 = worley(uv, vec2(16.0), 0.8, 84.0);
  float bud = pocket * (1.0 - smoothstep(0.1, 0.3, w2.x)) * step(w2.z, 0.7);
  m.col = mix(m.col, rgb(0xe8d8ff), bud);
  m.h = mix(m.h, 0.6, bud);
  m.r = mix(m.r, 0.2, bud);
}

Mat magma(vec2 uv) {
  vec2 q = uv + warp(uv, 4.0, 0.035, 41.0);
  vec4 v = voronoi(q, vec2(5.0), 0.85, 42.0);
  float n = fbm(uv, vec2(8.0), 4, 0.55, 43.0);
  float g = fbm(uv, vec2(32.0), 2, 0.5, 44.0);
  float crack = 1.0 - smoothstep(0.02, 0.11 + 0.05 * n, v.x);
  vec4 w = worley(uv, vec2(9.0), 0.9, 45.0);
  float pool = (1.0 - smoothstep(0.12, 0.28, w.x + 0.1 * n)) * step(w.z, 0.35);
  float hot = max(crack, pool);
  vec3 crust = mix(rgb(0x2a0f08), rgb(0x5e2412), sat(0.5 + n * 0.8 + v.y * 0.3));
  crust *= 0.9 + 0.2 * g;
  crust = mix(crust, rgb(0x8a2a0a), (1.0 - smoothstep(0.05, 0.22, v.x)) * 0.5);
  vec3 lava = mix(rgb(0xd84a08), rgb(0xffc040), smoothstep(0.4, 1.0, hot + 0.2 * n));
  vec3 col = mix(crust, lava, hot);
  float h = 0.75 + 0.1 * n + 0.08 * smoothstep(0.0, 0.2, v.x) - 0.45 * hot + 0.03 * g;
  return M(col, 1.0, sat(h), mix(0.85, 0.35, hot));
}

Mat debris(vec2 uv, bool top) {
  vec2 q = uv + warp(uv, 3.0, 0.04, 51.0);
  vec2 c = top ? q - 0.5 : vec2(q.x - 0.5, q.y + 0.35);
  float d = top ? mix(length(c), max(abs(c.x), abs(c.y)), 0.5) : length(c * vec2(0.8, 1.0));
  float n = fbm(uv, vec2(5.0), 4, 0.55, 52.0);
  float band = sin(d * (top ? 42.0 : 34.0) + n * 3.0);
  float band2 = sin(d * 90.0 + n * 6.0);
  vec3 col = mix(rgb(0x4a312a), rgb(0x6e4c41), smoothstep(-0.5, 0.5, band));
  col = mix(col, rgb(0x8f6a5a), smoothstep(0.7, 1.0, band) * 0.7);
  col = mix(col, rgb(0x35221d), smoothstep(0.75, 1.0, -band) * 0.6);
  col *= 0.94 + 0.06 * band2 + 0.08 * fbm(uv, vec2(32.0), 2, 0.5, 53.0);
  if (top) col = mix(col, rgb(0x2e1d18), (1.0 - smoothstep(0.0, 0.12, d)) * 0.7);
  float h = 0.68 + 0.08 * band + 0.02 * band2 + 0.12 * n;
  return M(col, 1.0, sat(h), 0.72 + 0.08 * band);
}

Mat rawBlock(vec2 uv, vec3 c0, vec3 c1, vec3 c2, vec3 crev, float rough, float salt) {
  vec2 q = uv + warp(uv, 4.0, 0.04, salt);
  vec4 v = voronoi(q, vec2(5.0), 0.85, salt + 1.0);
  vec4 v2 = voronoi(q, vec2(11.0), 0.9, salt + 2.0);
  float n = fbm(q, vec2(10.0), 4, 0.55, salt + 3.0);
  float dome = bevel(v.x, 0.35);
  float small = bevel(v2.x, 0.2);
  float t = sat(0.5 + 0.5 * n + 0.4 * (v.y - 0.5));
  vec3 col = t < 0.5 ? mix(c0, c1, t * 2.0) : mix(c1, c2, t * 2.0 - 1.0);
  col *= 0.85 + 0.25 * small;
  float crevice = 1.0 - smoothstep(0.0, 0.08, v.x);
  col = mix(col, crev, crevice * 0.85);
  float h = 0.35 + 0.45 * dome + 0.12 * small + 0.06 * n;
  return M(col, 1.0, sat(h), sat(rough + 0.1 * crevice - 0.08 * small));
}

Mat glowstone(vec2 uv) {
  vec2 q = uv + warp(uv, 4.0, 0.03, 71.0);
  vec4 v = voronoi(q, vec2(6.0), 0.85, 72.0);
  vec4 v2 = voronoi(q, vec2(13.0), 0.9, 73.0);
  float n = fbm(uv, vec2(12.0), 3, 0.5, 74.0);
  float core = smoothstep(0.02, 0.3, v.x);
  float t = sat(core * (0.55 + 0.6 * v.y) + 0.15 * n);
  vec3 col = mix(rgb(0x7a4a14), rgb(0xd8901e), smoothstep(0.0, 0.45, t));
  col = mix(col, rgb(0xffe08a), smoothstep(0.45, 0.85, t));
  col = mix(col, rgb(0xfff6d0), smoothstep(0.85, 1.0, t) * 0.8);
  col *= 0.9 + 0.2 * smoothstep(0.0, 0.1, v2.x);
  float gap = 1.0 - smoothstep(0.0, 0.05, v.x);
  col = mix(col, rgb(0x4a2a0c), gap * 0.9);
  float h = 0.45 + 0.4 * bevel(v.x, 0.2) + 0.08 * v2.y - 0.05 * (1.0 - smoothstep(0.0, 0.05, v2.x));
  return M(col, 1.0, sat(h), 0.45 + 0.2 * gap);
}

Mat material(vec2 uv) {
  int v = uVariant;
  if (v == V_ROCK || v == V_BLACKSTONE_TOP || v == V_GILDED) {
    Mat m = rock(uv, uC[0], uC[1], uC[2], uC[3], uC[4], uP[0], uP[1], uP[2], uP[3]);
    if (v == V_BLACKSTONE_TOP) blackstoneRings(m, uv);
    if (v == V_GILDED) goldInclusions(m, uv);
    return m;
  }
  if (v == V_CRYSTAL || v == V_OBSIDIAN || v == V_CRYING_OBSIDIAN || v == V_BUDDING) {
    Mat m = crystal(uv, uC[0], uC[1], uC[2], uC[3], uP[0], uP[1].x);
    if (v == V_OBSIDIAN || v == V_CRYING_OBSIDIAN) obsidianDetail(m, uv, v == V_CRYING_OBSIDIAN);
    if (v == V_BUDDING) amethystBuds(m, uv);
    return m;
  }
  if (v == V_GRANULAR) return granular(uv, uC[0], uC[1], uC[2], uC[3], uP[0], uP[1]);
  if (v == V_BASALT_SIDE || v == V_POLISHED_BASALT_SIDE) return basaltSide(uv, v == V_POLISHED_BASALT_SIDE);
  if (v == V_BASALT_TOP || v == V_POLISHED_BASALT_TOP) return basaltTop(uv, v == V_POLISHED_BASALT_TOP);
  if (v == V_MAGMA) return magma(uv);
  if (v == V_DEBRIS_SIDE || v == V_DEBRIS_TOP) return debris(uv, v == V_DEBRIS_TOP);
  if (v == V_RAW) return rawBlock(uv, uC[0], uC[1], uC[2], uC[3], uP[0].x, uP[0].y);
  if (v == V_GLOWSTONE) return glowstone(uv);
  return missingTex(uv);
}
