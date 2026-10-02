// ---------------------------------------------------------------------------------------------
// Soil library: loose granular ground (dirt, sand, gravel ...), grass carpets and top fringes.
// ---------------------------------------------------------------------------------------------

/**
 * Granular soil.
 *  dk/md/lt palette, pa/pb pebble colours
 *  p0: x clod cells, y clod relief, z pebble density, w pebble cells
 *  p1: x roughness, y grain contrast, z ripple (sand), w pebble size
 */
Mat soilBase(vec2 uv, vec3 dk, vec3 md, vec3 lt, vec3 pa, vec3 pb, vec4 p0, vec4 p1, float salt) {
  vec2 q = uv + warp(uv, 4.0, 0.025, salt);
  float n = fbm(q, vec2(4.0), 5, 0.55, salt + 1.0);
  float gf = floor(uSize * 0.5);
  float g = vnoise(uv * gf, vec2(gf), salt + 2.0) - 0.5;
  float g2 = vnoise(uv * gf * 0.5, vec2(gf * 0.5), salt + 3.0) - 0.5;
  // clods
  vec4 c = worley(q, vec2(max(2.0, p0.x)), 0.9, salt + 4.0);
  float clod = smoothstep(0.0, 0.5, c.y - c.x);
  float t = sat(0.5 + 0.55 * n + 0.25 * (c.z - 0.5) + (g * 0.8 + g2 * 0.6) * p1.y);
  vec3 col = t < 0.5 ? mix(dk, md, t * 2.0) : mix(md, lt, t * 2.0 - 1.0);
  col *= 0.88 + 0.12 * clod;
  float h = 0.55 + 0.18 * n + p0.y * 0.2 * clod + 0.05 * (g + g2);
  // sand ripples
  if (p1.z > 0.0) {
    float rp = sin((uv.y + 0.05 * fbm(uv, vec2(2.0), 3, 0.5, salt + 5.0) + 0.02 * uv.x) * TAU * 7.0);
    h += p1.z * 0.08 * rp;
    col *= 1.0 + p1.z * 0.04 * rp;
  }
  // pebbles
  if (p0.z > 0.0) {
    vec4 w = worley(q + 0.37, vec2(max(4.0, p0.w)), 0.9, salt + 6.0);
    float rad = p1.w * (0.6 + 0.6 * fract(w.z * 11.0));
    float pe = (1.0 - smoothstep(rad * 0.7, rad, w.x + 0.06 * gnoise(q * p0.w * 4.0, vec2(p0.w * 4.0), salt + 7.0))) * step(w.z, p0.z);
    vec3 pc = mix(pa, pb, fract(w.z * 37.0)) * (0.8 + 0.4 * fract(w.z * 91.0));
    float dome = sqrt(sat(1.0 - w.x / max(rad, 1e-3)));
    col = mix(col, pc * (0.85 + 0.25 * dome), pe);
    h = mix(h, 0.65 + 0.3 * dome, pe);
    // contact shadow ring
    float ring = (1.0 - smoothstep(rad, rad * 1.35, w.x)) * step(w.z, p0.z) * (1.0 - pe);
    col *= 1.0 - 0.25 * ring;
    h -= 0.04 * ring;
  }
  return M(col, 1.0, sat(h), sat(p1.x - 0.05 * clod));
}

/**
 * Carpet of short blades seen from above (grass block top, nylium, moss).
 * Returns grass colour in m.col (greyscale-ish when `grey`), coverage in m.a, height in m.h.
 *  p: x blade cells per layer, y blade length (uv), z blade width (uv), w gap amount
 */
Mat bladeCarpet(vec2 uv, vec3 base, vec3 tipc, vec4 p, float salt) {
  // under-layer: dense fuzz
  vec2 q = uv + warp(uv, 6.0, 0.02, salt);
  float fz = fbm(q, vec2(24.0), 3, 0.55, salt + 1.0);
  float fz2 = gnoise(q * 64.0, vec2(64.0), salt + 2.0);
  float under = sat(0.5 + 0.6 * fz + 0.25 * fz2);
  vec3 col = mix(base * 0.62, base * 0.95, under);
  float h = 0.45 + 0.2 * under;
  float cov = smoothstep(p.w - 0.08, p.w + 0.08, under + 0.15 * fbm(q, vec2(6.0), 2, 0.5, salt + 3.0));
  // blade layers
  float cells = max(4.0, p.x);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    vec2 cp = uv * cells + fl * vec2(0.37, 0.71);
    vec2 ci = floor(cp);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = ci + vec2(float(x), float(y));
        vec3 r = h3(mod(g, vec2(cells)), salt + 10.0 + fl * 7.0);
        vec2 a = (g + r.xy - fl * vec2(0.37, 0.71)) / cells;
        float ang = r.z * TAU;
        vec2 dir = vec2(cos(ang), sin(ang));
        float len = p.y * (0.6 + 0.8 * fract(r.z * 13.0));
        vec2 b = a + dir * len;
        vec2 d = uv - a;
        // wrap the blade into the nearest periodic copy
        d -= floor(d + 0.5);
        float t = sat(dot(d, dir) / len);
        float w = p.z * (1.0 - 0.85 * t) * (0.7 + 0.6 * fract(r.z * 29.0));
        float dist = length(d - dir * t * len) - w;
        float c = cover(dist);
        if (c > 0.0) {
          float shadeK = 0.7 + 0.5 * fract(r.x * 17.0 + r.y * 5.0) + 0.25 * t;
          float ridge = 1.0 - sat(abs(dot(d - dir * t * len, vec2(-dir.y, dir.x))) / max(w + p.z * 0.2, 1e-4));
          vec3 bc = mix(base, tipc, t * 0.7) * shadeK * (0.85 + 0.2 * ridge);
          float bh = 0.62 + 0.12 * fl + 0.1 * ridge - 0.1 * t;
          col = mix(col, bc, c);
          h = mix(h, max(h, bh), c);
          cov = max(cov, c);
        }
      }
    }
  }
  return M(col, cov, sat(h), 0.75);
}

/**
 * Top fringe mask (grass/podzol/mycelium/snow hanging over a block side).
 * Returns x = coverage, y = distance below the fringe edge (uv, for shadowing), z = blade id.
 *  depth: mean fringe depth (uv), cols: blade count, tipLen: extra length of blade tips (uv)
 */
vec3 topFringe(vec2 uv, float depth, float cols, float tipLen, int style, float salt) {
  float y = 1.0 - uv.y; // distance from the top edge
  float edge = depth + 0.028 * fbm(vec2(uv.x, 0.5), vec2(5.0, 1.0), 3, 0.5, salt);
  if (style == 1) {
    // snow: smooth wavy edge with rounded lumps / drips
    float cx = uv.x * cols;
    float ci = floor(cx);
    float bump = 0.0;
    for (int k = -1; k <= 1; k++) {
      float cell = ci + float(k);
      vec3 r = h3(vec2(mod(cell, cols), 5.0), salt + 2.0);
      float dx = (uv.x - (cell + 0.5 + 0.4 * (r.x - 0.5)) / cols) * cols / (0.5 + 0.5 * r.z);
      bump = max(bump, tipLen * r.y * sat(1.0 - dx * dx));
    }
    float e = edge + bump;
    return vec3(cover(y - e), y - e, 0.0);
  }
  float cx = uv.x * cols;
  float ci = floor(cx);
  float best = 0.0;
  float bid = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cell = ci + float(k);
    vec3 r = h3(vec2(mod(cell, cols), 3.0), salt + 1.0);
    float x0 = (cell + 0.15 + 0.7 * r.x) / cols;
    // a few long drips, mostly short tips
    float len = edge * (0.7 + 0.2 * r.z) + tipLen * (0.25 + 1.2 * r.y * r.y * r.y);
    float w = (0.6 + 0.5 * r.z) / cols;
    float dx = abs(uv.x - x0 - 0.25 * (y - edge * 0.5) * (r.z - 0.5));
    float tipT = sat((y - edge * 0.45) / max(len - edge * 0.45, 1e-3));
    float half_ = w * (1.0 - tipT * tipT) * 0.5;
    float c = cover(dx - half_) * step(y, len);
    if (c > best) { best = c; bid = r.x; }
  }
  float solid = cover(y - edge * 0.62);
  float cov = max(best, solid);
  return vec3(cov, y - edge, bid);
}
