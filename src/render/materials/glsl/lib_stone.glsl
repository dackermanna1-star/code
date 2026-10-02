// ---------------------------------------------------------------------------------------------
// Stone library: a generic parameterised natural-rock surface reused by rocks, ores, masonry and
// machine textures.
// ---------------------------------------------------------------------------------------------

/**
 * Generic rock.
 *  dark/mid/light : palette           sa/sb : speckle colours
 *  p0: x patch freq (int), y patch contrast 0..1, z speckle A density, w speckle B density
 *  p1: x cracks 0..1, y pits 0..1, z dark dashes 0..1, w anisotropy (+n: vertical grain n:1, -n: horizontal)
 *  p2: x roughness, y height amplitude, z speckle cells (int), w salt
 *  p3: x facets 0..1, y speckle radius (0..1 of cell), z grain 0..1, w light patches 0..1
 */
Mat rock(vec2 uv, vec3 dark, vec3 mid, vec3 light, vec3 sa, vec3 sb, vec4 p0, vec4 p1, vec4 p2, vec4 p3) {
  float salt = p2.w;
  float an = p1.w;
  vec2 af = an > 0.5 ? vec2(an, 1.0) : (an < -0.5 ? vec2(1.0, -an) : vec2(1.0));
  vec2 q = uv + warp(uv, 3.0, 0.03, salt + 1.0);
  float pf = max(1.0, p0.x);

  // large tonal zones + mid patches (thresholded into distinct darker / lighter blotches)
  float zone = fbm(q, vec2(2.0) * af, 3, 0.5, salt + 2.0);
  float pat = fbm(q, vec2(pf) * af, 5, 0.55, salt + 3.0);
  float pat2 = fbm(q, vec2(pf * 2.0) * af, 4, 0.5, salt + 33.0);
  vec3 col = mix(mid, mix(dark, mid, 0.35), smoothstep(0.0, 0.5, -zone) * 0.6);
  col = mix(col, dark, smoothstep(0.08, 0.3, pat) * (0.35 + 0.65 * p0.y));
  col = mix(col, light, smoothstep(0.12, 0.34, pat2 - pat * 0.5) * (0.3 + 0.7 * p3.w) * 0.8);

  // facets: warped Voronoi cells each with a random tilted plane -> chiselled relief
  vec2 fq = q + warp(q, 5.0, 0.05, salt + 34.0);
  vec4 fv = voronoi(fq, vec2(pf + 1.0) * af, 0.9, salt + 4.0);
  vec2 fsl = h2(vec2(fv.y * 997.0, 3.0), salt + 5.0) * 2.0 - 1.0;
  float facet = dot(-fv.zw, fsl) * 0.5 * smoothstep(0.0, 0.12, fv.x) + (fv.y - 0.5) * 0.3;
  col *= 1.0 + p3.x * 0.05 * dot(normalize(vec2(-0.6, 0.8)), fsl);
  float rg = ridged(q, vec2(pf * 3.0) * af, 3, 0.5, salt + 35.0);

  float h = 0.62 + p2.y * (0.12 * zone + 0.08 * pat + p3.x * 0.08 * facet + 0.05 * rg);

  // dark dashes / streaks (classic Minecraft stone), elongated along the grain
  if (p1.z > 0.0) {
    vec2 sf = an > 0.5 ? vec2(24.0, 5.0) : vec2(6.0, 20.0);
    float s = fbm(q + vec2(0.13, 0.71), sf, 3, 0.45, salt + 6.0);
    float sm = smoothstep(0.12, 0.3, s) * p1.z;
    col = mix(col, dark * 0.74, sm * 0.85);
    h -= sm * 0.05 * p2.y;
    float sl = smoothstep(0.24, 0.45, -s) * p1.z * p3.w;
    col = mix(col, light * 1.04, sl * 0.5);
  }
  // speckles (mineral grains)
  if (p0.z + p0.w > 0.0) {
    vec4 w = worley(q, vec2(max(4.0, p2.z)), 0.95, salt + 7.0);
    float rr = max(0.05, p3.y) * (0.75 + 0.5 * fract(w.z * 13.7));
    float disc = 1.0 - smoothstep(rr * 0.6, rr, w.x + 0.1 * gnoise(q * p2.z * 3.0, vec2(p2.z * 3.0), salt + 8.0));
    float isA = step(w.z, p0.z);
    float isB = step(1.0 - p0.w, w.z) * (1.0 - isA);
    vec3 sc = mix(sa, sb, isB) * (0.88 + 0.24 * fract(w.z * 7.13));
    float k = disc * (isA + isB);
    col = mix(col, sc, k);
    h += k * 0.03 * p2.y;
  }
  // fine crystalline grain (texel scale)
  float gf = floor(uSize * 0.5);
  float g = vnoise(uv * gf, vec2(gf), salt + 9.0) - 0.5;
  float g2 = vnoise(uv * gf * 0.5, vec2(gf * 0.5), salt + 10.0) - 0.5;
  col *= 1.0 + (g * 0.16 + g2 * 0.12) * p3.z;
  h += (g * 0.04 + g2 * 0.05) * p2.y * p3.z;
  // mid-frequency micro relief (pitted, granular rock face)
  float mr = fbm(q, vec2(pf * 6.0) * af, 3, 0.5, salt + 36.0);
  h += 0.07 * mr * p2.y;
  col *= 1.0 + 0.05 * mr;

  // cracks: warped Voronoi borders, partially masked
  if (p1.x > 0.0) {
    vec4 v = voronoi(q + warp(q, 6.0, 0.025, salt + 11.0), vec2(3.0) * af, 0.9, salt + 12.0);
    float mask = smoothstep(0.0, 0.3, fbm(q, vec2(3.0), 3, 0.5, salt + 13.0) + p1.x * 0.6 - 0.45);
    float wdt = 0.02 + 0.025 * sat(fbm(q, vec2(10.0), 2, 0.5, salt + 14.0) + 0.5);
    float cr = (1.0 - smoothstep(0.0, wdt, v.x)) * mask * p1.x;
    float rim = (1.0 - smoothstep(wdt, wdt * 2.5, v.x)) * mask * p1.x;
    col = mix(col, dark * 0.4, cr * 0.85);
    col *= 1.0 + 0.05 * (rim - cr);
    h -= cr * 0.3 + rim * 0.03;
  }
  // pits / small holes
  if (p1.y > 0.0) {
    vec4 w = worley(uv, vec2(14.0), 0.95, salt + 15.0);
    float pr = 0.12 + 0.12 * fract(w.z * 31.0);
    float pit = step(w.z, p1.y * 0.25) * (1.0 - smoothstep(pr * 0.5, pr, w.x));
    col = mix(col, dark * 0.5, pit * 0.7);
    h -= pit * 0.2;
  }
  float r = p2.x + 0.05 * pat - 0.03 * zone + 0.04 * g;
  return M(col, 1.0, sat(h), sat(r));
}

/**
 * Crystal mosaic (granite, diorite, andesite ...).
 *  c0 main mineral, c1 second mineral, c2 dark mineral, c3 light mineral
 *  p: x crystal cells (int), y fraction c1, z fraction dark, w fraction light
 *  s: x roughness, y height amp, z polish 0..1 (flattens relief, lowers roughness), w salt
 */
Mat granular(vec2 uv, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec4 p, vec4 s) {
  float salt = s.w;
  vec2 q = uv + warp(uv, 4.0, 0.03, salt);
  // blotchy zones decide which minerals dominate locally (Minecraft-like speckle clusters)
  float zone = fbm(uv, vec2(4.0), 4, 0.55, salt + 3.0);
  vec4 w = worley(q, vec2(p.x), 0.95, salt + 1.0);
  float id = fract(w.z + 0.0);
  float dk = p.z * (1.0 + 1.6 * zone);
  float lt = p.w * (1.0 - 1.4 * zone);
  vec3 col = c0;
  float rr = s.x;
  float kind = 0.0;
  if (id < dk) { col = c2; rr = s.x * 0.55; kind = 2.0; }
  else if (id < dk + lt) { col = c3; rr = s.x * 0.6; kind = 3.0; }
  else if (id < dk + lt + p.y) { col = c1; kind = 1.0; }
  col *= 0.86 + 0.28 * fract(id * 17.31);
  // soft crystal boundaries: blend towards the neighbour colour instead of outlining
  float edge = 1.0 - smoothstep(0.0, 0.18, w.y - w.x);
  col = mix(col, c0 * 0.92, edge * 0.25);
  // fine grains
  vec4 w2 = worley(q, vec2(p.x * 2.5), 0.9, salt + 2.0);
  float fine = (1.0 - smoothstep(0.16, 0.32, w2.x));
  col = mix(col, mix(c2, c3, step(0.5, w2.z)), fine * step(0.8, w2.z) * 0.85);
  col *= 1.0 + 0.1 * zone;
  float gf = floor(uSize * 0.5);
  float g = vnoise(uv * gf, vec2(gf), salt + 4.0) - 0.5;
  col *= 1.0 + g * 0.1;
  float mr = fbm(q, vec2(p.x * 0.5), 3, 0.5, salt + 5.0);
  float relief = 0.03 * smoothstep(0.0, 0.25, w.y - w.x) + 0.02 * (kind >= 2.0 ? 1.0 : 0.0) + 0.05 * zone + 0.04 * mr + 0.02 * g;
  float h = 0.75 + s.y * relief * (1.0 - 0.85 * s.z);
  rr = mix(rr, rr * 0.35, s.z) + 0.04 * g;
  return M(col, 1.0, sat(h), sat(rr));
}

/**
 * Faceted crystalline mass (amethyst, coal block, obsidian).
 *  c0 deep, c1 mid, c2 light, c3 edge highlight; p: x cells, y facet tilt, z edge highlight, w roughness; salt
 */
Mat crystal(vec2 uv, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec4 p, float salt) {
  vec2 q = uv + warp(uv, 3.0, 0.06, salt) + warp(uv, 8.0, 0.012, salt + 9.0);
  vec4 v = voronoi(q, vec2(p.x), 0.9, salt + 1.0);
  vec2 sl = h2(vec2(v.y * 1013.0, 1.0), salt + 2.0) * 2.0 - 1.0;
  float plane = dot(-v.zw, sl) * p.y;
  float lightDir = dot(normalize(sl + 1e-4), normalize(vec2(-0.5, 0.85)));
  float t = sat(0.5 + 0.45 * lightDir * p.y + 0.35 * (v.y - 0.5));
  vec3 col = t < 0.5 ? mix(c0, c1, t * 2.0) : mix(c1, c2, t * 2.0 - 1.0);
  // sub-facets
  vec4 v2 = voronoi(q, vec2(p.x * 2.0), 0.9, salt + 3.0);
  col *= 0.9 + 0.2 * v2.y;
  float edge = 1.0 - smoothstep(0.0, 0.05, v.x);
  float edge2 = 1.0 - smoothstep(0.0, 0.05, v2.x);
  col = mix(col, c3, edge * p.z);
  col = mix(col, c3, edge2 * p.z * 0.35);
  float h = 0.7 + 0.18 * plane + 0.08 * v.y - 0.12 * edge - 0.03 * edge2;
  float r = p.w + 0.05 * fbm(uv, vec2(6.0), 2, 0.5, salt + 4.0);
  return M(col, 1.0, sat(h), sat(r));
}

/** Plain stone (#7d7d7d) used as a base by ores and machines. */
Mat stoneBase(vec2 uv, float salt) {
  return rock(uv, rgb(0x6a6a6a), rgb(0x7f7f7f), rgb(0x939393), rgb(0x666666), rgb(0x8e8e8e),
              vec4(5.0, 0.5, 0.03, 0.03), vec4(0.3, 0.12, 0.75, -1.0), vec4(0.8, 1.0, 30.0, salt), vec4(0.7, 0.35, 0.7, 0.6));
}
/** Deepslate base (#4d4d52) with vertical striation. */
Mat deepslateBase(vec2 uv, float salt) {
  return rock(uv, rgb(0x3a3a3f), rgb(0x4e4e53), rgb(0x636369), rgb(0x2f2f34), rgb(0x6a6a70),
              vec4(4.0, 0.55, 0.04, 0.05), vec4(0.2, 0.08, 0.6, 4.0), vec4(0.74, 1.0, 28.0, salt), vec4(0.6, 0.35, 0.7, 0.5));
}
/** Netherrack base (#6f3534). */
Mat netherrackBase(vec2 uv, float salt) {
  return rock(uv, rgb(0x4d2223), rgb(0x6f3534), rgb(0x8b4747), rgb(0x3e1717), rgb(0x9a5050),
              vec4(6.0, 0.8, 0.1, 0.1), vec4(0.35, 0.4, 0.35, 0.0), vec4(0.9, 1.4, 22.0, salt), vec4(0.9, 0.4, 1.0, 0.6));
}
