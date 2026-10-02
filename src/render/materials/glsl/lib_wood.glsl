// ---------------------------------------------------------------------------------------------
// Wood library: plank boards, bark and end-grain rings. Palettes are passed explicitly so the
// woodwork and machine families can reuse them.
// ---------------------------------------------------------------------------------------------

/** Long-grain wood surface (grain along +u). Returns colour, relief in h (0..1), roughness. */
Mat woodGrain(vec2 uv, vec3 dk, vec3 md, vec3 lt, float salt) {
  // warped coordinate so grain lines meander
  float wv = uv.y + 0.012 * fbm(uv, vec2(2.0, 4.0), 3, 0.5, salt) + 0.004 * fbm(uv, vec2(6.0, 16.0), 2, 0.5, salt + 1.0);
  float streak = fbm(vec2(uv.x, wv), vec2(3.0, 48.0), 4, 0.55, salt + 2.0);
  float fine = gnoise(vec2(uv.x, wv) * vec2(8.0, 160.0), vec2(8.0, 160.0), salt + 3.0);
  // growth-ring lines (latewood): thin dark lines along the board
  float ring = abs(fract(wv * 22.0 + 1.6 * fbm(uv, vec2(2.0, 3.0), 3, 0.5, salt + 4.0)) - 0.5);
  float late = 1.0 - smoothstep(0.03, 0.12, ring);
  // second, finer ring family for denser figure
  float ring2 = abs(fract(wv * 47.0 + 2.3 * fbm(uv, vec2(3.0, 5.0), 2, 0.5, salt + 6.0)) - 0.5);
  float late2 = 1.0 - smoothstep(0.02, 0.08, ring2);
  float t = sat(0.5 + streak * 1.15 + fine * 0.18);
  vec3 col = t < 0.5 ? mix(dk, md, t * 2.0) : mix(md, lt, t * 2.0 - 1.0);
  col = mix(col, dk * 0.88, late * 0.6);
  col = mix(col, dk, late2 * 0.22);
  float pores = gnoise(vec2(uv.x, wv) * vec2(48.0, 256.0), vec2(48.0, 256.0), salt + 5.0);
  col *= 1.0 + 0.07 * pores;
  float h = 0.5 + 0.25 * streak - 0.15 * late + 0.06 * fine + 0.04 * pores;
  float r = 0.62 + 0.08 * late + 0.05 * fine;
  return M(col, 1.0, sat(h), r);
}

/**
 * Minecraft planks: 4 horizontal boards with offset joints, wood grain and gaps.
 *  c: dark, mid, light, gap. p: x board tone variation, y gap width (px/16), z knot chance, w roughness add
 */
Mat planks(vec2 uv, vec3 dk, vec3 md, vec3 lt, vec3 gap, vec4 p, float salt) {
  float boards = 4.0;
  float bi = floor(uv.y * boards);
  float seamX = fract(0.13 + 0.5 * bi + 0.25 * floor(bi * 0.5));
  // board-local coordinates; the seam splits a board into two planks
  // one plank per board row per tile; sx = plank-local x (0 at the joint)
  float sx = fract(uv.x - seamX);
  vec2 lp = vec2(sx, fract(uv.y * boards));
  float pid = h1(vec2(bi, 0.0), salt + 10.0);
  // sampling the (1-periodic) grain over a span shorter than 1 makes the grain break at the joint
  Mat m = woodGrain(vec2(sx * 0.77 + pid * 3.0, uv.y), dk, md, lt, salt);
  float tone = 1.0 + p.x * (pid - 0.5) + 0.06 * (h1(vec2(bi, 3.0), salt + 11.0) - 0.5);
  float pi = 0.0;
  m.col *= tone;
  // distance to board edges (uv units)
  float gw = p.y * PX * 0.5;
  float ey = min(lp.y, 1.0 - lp.y) / boards;
  float ex = min(sx, 1.0 - sx);
  float e = min(ey, ex) - gw;
  e += 0.002 * fbm(uv, vec2(24.0), 2, 0.5, salt + 12.0);
  float b = bevel(e, 0.7 * PX);
  float inGap = 1.0 - cover(-e);
  // knots
  if (p.z > 0.0) {
    vec2 kc = vec2(0.5 + 0.3 * (pid - 0.5), 0.5);
    float hasK = step(h1(vec2(bi, pi + 7.0), salt + 13.0), p.z);
    vec2 kd = (lp - kc) * vec2(1.0 / boards * 4.0, 1.0);
    float kr = length(kd * vec2(3.0, 1.0));
    float knot = hasK * (1.0 - smoothstep(0.12, 0.2, kr));
    float kring = hasK * (1.0 - smoothstep(0.2, 0.45, kr)) * (0.5 + 0.5 * sin(kr * 60.0));
    m.col = mix(m.col, dk * 0.6, knot * 0.85);
    m.col = mix(m.col, dk * 0.85, kring * 0.35);
    m.h -= knot * 0.12;
  }
  m.col *= 0.88 + 0.12 * b;
  m.h = mix(0.25, 0.72 + 0.28 * (m.h - 0.5), b);
  m.col = mix(m.col, gap, inGap);
  m.h = mix(m.h, 0.1, inGap);
  m.r = sat(m.r + p.w + 0.2 * inGap);
  return m;
}

/**
 * Bark (log side, grain vertical).
 *  c: crevice, dark, mid, light, marks (lenticels / stripes), accent (moss / glow)
 *  p0: x furrow freq, y plate breaks, z lenticels, w scales
 *  p1: x roughness, y relief, z accent amount, w stripe contrast (stems)
 */
Mat bark(vec2 uv, vec3 cr, vec3 dk, vec3 md, vec3 lt, vec3 mk, vec3 ac, vec4 p0, vec4 p1, float salt) {
  float F = max(2.0, p0.x);
  float xw = uv.x + 0.03 * fbm(uv, vec2(2.0, 3.0), 3, 0.5, salt) + 0.01 * fbm(uv, vec2(6.0, 4.0), 2, 0.5, salt + 1.0);
  vec2 q = vec2(xw, uv.y);
  // meandering vertical furrows (zero crossings of vertically stretched noise) separating plates
  // (all frequencies are integers so the bark tiles seamlessly in both directions)
  float n1 = gnoise(q * vec2(F, 2.0), vec2(F, 2.0), salt + 2.0);
  float n2 = gnoise(q * vec2(F * 2.0, 3.0), vec2(F * 2.0, 3.0), salt + 3.0);
  vec2 f3 = max(vec2(1.0), floor(vec2(F * 0.75, F * 0.6)));
  float n3 = gnoise(q * f3, f3, salt + 4.0);
  float fur = smoothstep(0.72, 0.97, 1.0 - abs(n1));
  float fur2 = smoothstep(0.82, 0.98, 1.0 - abs(n2)) * 0.65;
  float brk = smoothstep(0.86, 0.98, 1.0 - abs(n3)) * p0.y;
  float crevice = max(max(fur, fur2), brk);
  // plate profile: rounded away from the furrows
  float plate = 1.0 - crevice;
  plate = sqrt(sat(plate));
  float n = fbm(uv, vec2(4.0, 12.0), 4, 0.55, salt + 5.0);
  float fib = gnoise(q * vec2(F * 6.0, 6.0), vec2(F * 6.0, 6.0), salt + 12.0);
  float t = sat(0.45 + 0.35 * n + 0.2 * fib + 0.2 * (abs(n1) - 0.3));
  vec3 col = t < 0.5 ? mix(dk, md, t * 2.0) : mix(md, lt, t * 2.0 - 1.0);
  col = mix(col, cr, smoothstep(0.2, 0.9, crevice) * 0.9);
  float h = 0.15 + 0.7 * plate + 0.08 * n + 0.03 * fib;
  // scales (spruce)
  if (p0.w > 0.0) {
    vec4 w = worley(q + vec2(0.0, 0.04 * sin(TAU * xw)), floor(vec2(F * 1.5, F * 1.1)), 0.9, salt + 6.0);
    float sc = smoothstep(0.0, 0.25, w.y - w.x);
    col = mix(col, mix(col, lt, 0.3) * (0.85 + 0.3 * w.z), p0.w * 0.6);
    col = mix(col, cr, (1.0 - sc) * p0.w * 0.7);
    h = mix(h, h * (0.6 + 0.4 * sc) + 0.1 * w.z, p0.w);
  }
  // lenticels / horizontal marks (birch, cherry)
  if (p0.z > 0.0) {
    float ln = gnoise(uv * vec2(5.0, 36.0), vec2(5.0, 36.0), salt + 7.0);
    float dash = smoothstep(0.45, 0.6, ln) * smoothstep(0.2, 0.5, gnoise(uv * vec2(9.0, 3.0), vec2(9.0, 3.0), salt + 8.0) + 0.3);
    col = mix(col, mk, dash * p0.z);
    h -= dash * 0.1 * p0.z;
  }
  // vertical colour stripes (nether stems)
  if (p1.w > 0.0) {
    float st = fbm(q, vec2(F * 2.0, 1.0), 3, 0.5, salt + 9.0);
    col = mix(col, mk, smoothstep(0.1, 0.35, st) * p1.w);
  }
  // accent: moss / glowing specks
  if (p1.z > 0.0) {
    float a = smoothstep(0.35, 0.6, fbm(uv, vec2(3.0, 6.0), 4, 0.55, salt + 10.0) + crevice * 0.2);
    col = mix(col, ac, a * p1.z);
  }
  float g = vnoise(uv * floor(uSize * 0.5), vec2(floor(uSize * 0.5)), salt + 11.0) - 0.5;
  col *= 1.0 + 0.08 * g;
  return M(col, 1.0, sat(h * p1.y + (1.0 - p1.y) * 0.6), sat(p1.x + 0.1 * crevice));
}

/**
 * End grain: rings in a rounded square with a bark rim.
 *  c: ring dark, wood mid, wood light, bark, bark dark, heart
 *  p: x ring count, y squareness 0..1, z crack amount, w rim width (px/16)
 */
Mat logTop(vec2 uv, vec3 rdk, vec3 md, vec3 lt, vec3 bk, vec3 bkd, vec3 heart, vec4 p, float salt) {
  vec2 off = (h2(vec2(1.0, 2.0), salt) - 0.5) * 0.06;
  vec2 c = uv - 0.5 - off;
  float sq = p.y;
  float rr = mix(length(c), pow(pow(abs(c.x), 5.0) + pow(abs(c.y), 5.0), 0.2), sq);
  float wob = 0.012 * fbm(uv, vec2(4.0), 3, 0.5, salt + 1.0);
  float r = rr + wob;
  float rings = r * p.x;
  float rf = fract(rings + 0.15 * fbm(uv, vec2(3.0), 2, 0.5, salt + 2.0));
  float late = smoothstep(0.65, 0.95, rf) * (1.0 - smoothstep(0.95, 1.0, rf));
  float n = fbm(uv, vec2(12.0), 3, 0.5, salt + 3.0);
  vec3 col = mix(md, lt, sat(0.5 + 0.6 * n));
  col = mix(col, rdk, late * 0.75);
  col = mix(col, heart, (1.0 - smoothstep(0.05, 0.22, r)) * 0.5);
  // saw marks
  float saw = gnoise(uv * vec2(2.0, 90.0), vec2(2.0, 90.0), salt + 4.0);
  col *= 1.0 + 0.04 * saw;
  float h = 0.75 - 0.08 * late + 0.03 * saw + 0.04 * n;
  // radial cracks (checks)
  float ang = atan(c.y, c.x);
  float crk = 0.0;
  if (p.z > 0.0) {
    for (int k = 0; k < 3; k++) {
      float a0 = TAU * h1(vec2(float(k), 5.0), salt + 5.0);
      float da = abs(mod(ang - a0 + PI, TAU) - PI);
      float len = 0.18 + 0.2 * h1(vec2(float(k), 6.0), salt + 6.0);
      float w = 0.012 * (1.0 - r / max(len, 0.01));
      crk = max(crk, (1.0 - smoothstep(0.0, max(w, 0.0), da * r)) * step(r, len) * step(0.03, r));
    }
    crk *= p.z;
  }
  col = mix(col, rdk * 0.4, crk);
  h -= crk * 0.3;
  // bark rim (as seen across the tile border: distance to the tile edge)
  float edge = borderDist(uv);
  float rimW = p.w * PX;
  float cambium = 1.0 - smoothstep(rimW, rimW + 0.012, edge);
  float bark = 1.0 - smoothstep(rimW - 0.006, rimW, edge + 0.004 * gnoise(uv * 40.0, vec2(40.0), salt + 7.0));
  col = mix(col, rdk, cambium * 0.5);
  vec3 bc = mix(bkd, bk, sat(0.5 + 0.8 * fbm(uv, vec2(16.0), 3, 0.5, salt + 8.0)));
  col = mix(col, bc, bark);
  h = mix(h, 0.55 + 0.3 * n, bark);
  return M(col, 1.0, sat(h), mix(0.7, 0.85, bark));
}
