// Soil family. Shared heavy calls: soilBase (dirt-like ground), rock (netherrack under nylium),
// bladeCarpet (grass / nylium / mycelium / moss tops) and topFringe (block-side fringes).
//
//  V_SOIL       : soilBase(uC0..4, uP0, uP1) + extras uP2: x farmland furrows, y wetness, z soul faces
//  V_GRASS_TOP  : grass carpet, greyscale for biome tint (alpha = tint mask), soil specks untinted
//  V_GRASS_SIDE : dirt + hanging grass fringe (alpha = tint mask)
//  V_FRINGE     : dirt/netherrack + coloured fringe (podzol/mycelium/nylium/snow/path sides)
//                 uP2: x fringe depth (px), y base (0 dirt, 1 netherrack), z fringe style (0 blades, 1 snow, 2 path), w alpha out
//                 uC5: fringe colour, uC6: fringe light colour
//  V_SNOW_OVERLAY: snow fringe only, alpha = coverage
//  V_CARPET     : blade carpet top (mycelium, nylium, moss) uP2: cells, length, width, gap; uC0 base, uC1 tip, uC2 gap colour
//  V_PODZOL_TOP : dirt + needle litter
//  V_SNOW       : snow

Mat material(vec2 uv) {
  int v = uVariant;
  bool needDirt = (v == V_SOIL || v == V_GRASS_SIDE || v == V_PODZOL_TOP || v == V_GRASS_TOP || (v == V_FRINGE && uP[2].y < 0.5));
  Mat m = M(vec3(0.5), 1.0, 0.5, 0.9);
  if (needDirt) {
    vec3 dk = uC[0], md = uC[1], lt = uC[2], pa = uC[3], pb = uC[4];
    vec4 p0 = uP[0], p1 = uP[1];
    if (v != V_SOIL) {
      // standard dirt for composite textures
      dk = rgb(0x5c3f2b); md = rgb(0x866043); lt = rgb(0x9d7555); pa = rgb(0x8a8378); pb = rgb(0x6a5040);
      p0 = vec4(9.0, 0.8, 0.1, 14.0); p1 = vec4(0.93, 0.5, 0.0, 0.32);
    }
    m = soilBase(uv, dk, md, lt, pa, pb, p0, p1, 200.0);
  } else if (v == V_FRINGE) {
    m = rock(uv, rgb(0x4d2223), rgb(0x6f3534), rgb(0x8b4747), rgb(0x3e1717), rgb(0x9a5050),
             vec4(6.0, 0.8, 0.1, 0.1), vec4(0.35, 0.4, 0.35, 0.0), vec4(0.9, 1.4, 22.0, 7.0), vec4(0.9, 0.4, 1.0, 0.6));
  }

  if (v == V_SOIL) {
    // farmland furrows
    if (uP[2].x > 0.0) {
      float fr = cos(uv.y * TAU * 4.0 + 0.6 * fbm(uv, vec2(3.0), 2, 0.5, 210.0));
      m.h = mix(m.h, m.h * 0.45 + 0.55 * (0.5 + 0.5 * fr), uP[2].x);
      m.col *= 1.0 + 0.22 * fr * uP[2].x;
      // the frame of untilled soil around the edge (Minecraft farmland border)
      float e = borderDist(uv);
      float rim = 1.0 - smoothstep(0.8 * PX, 1.2 * PX, e);
      m.col = mix(m.col, m.col * 0.8, rim * uP[2].x);
    }
    // wetness: darker, glossier, puddled lows
    if (uP[2].y > 0.0) {
      float wet = uP[2].y * (0.7 + 0.3 * smoothstep(0.6, 0.3, m.h));
      m.col *= 1.0 - 0.35 * wet;
      m.r = mix(m.r, 0.25, wet);
    }
    // soul sand faces: shallow ghostly hollows
    if (uP[2].z > 0.0) {
      vec2 cell = floor(uv * 2.0);
      vec2 f = fract(uv * 2.0) - 0.5 - (h2(mod(cell, 2.0), 211.0) - 0.5) * 0.3;
      float eyes = min(length((f - vec2(-0.12, 0.08)) * vec2(1.0, 0.8)), length((f - vec2(0.12, 0.08)) * vec2(1.0, 0.8))) - 0.07;
      float mouth = length((f - vec2(0.0, -0.13)) * vec2(0.7, 1.3)) - 0.075;
      float face = cover(min(eyes, mouth) / 2.0) * step(0.35, h1(mod(cell, 2.0), 212.0));
      m.col = mix(m.col, m.col * 0.45, face * uP[2].z);
      m.h -= face * 0.3 * uP[2].z;
    }
    m.a = 1.0 - uP[3].w; // dirt: tint mask 0 (it is the bottom face of tinted grass blocks)
    return m;
  }
  if (v == V_GRASS_TOP) {
    vec3 grey = rgb(0xa2a2a2);
    Mat g = bladeCarpet(uv, grey, rgb(0xc8c8c6), vec4(20.0, 0.06, 0.0075, 0.24), 220.0);
    // soil specks keep the dirt colour and are not tinted (alpha 0)
    float a = g.a;
    m.col = mix(m.col * 0.8, g.col, a);
    m.h = mix(m.h * 0.5, g.h, a);
    m.r = mix(0.9, g.r, a);
    m.a = a;
    return m;
  }
  if (v == V_CARPET) {
    Mat g = bladeCarpet(uv, uC[0], uC[1], uP[2], 230.0);
    vec3 under = uC[2] * (0.8 + 0.3 * fbm(uv, vec2(16.0), 3, 0.5, 231.0));
    m.col = mix(under, g.col, g.a);
    m.h = mix(0.3, g.h, g.a);
    m.r = mix(0.9, uP[3].x, g.a);
    m.a = 1.0;
    // speckles (mycelium spores / nylium warts)
    if (uP[3].y > 0.0) {
      vec4 w = worley(uv, vec2(18.0), 0.9, 232.0);
      float sp = (1.0 - smoothstep(0.15, 0.3, w.x)) * step(w.z, uP[3].y);
      m.col = mix(m.col, uC[3], sp);
      m.h += sp * 0.08;
    }
    return m;
  }
  if (v == V_PODZOL_TOP) {
    m.col *= vec3(0.86, 0.8, 0.72);
    // needle litter: short thin segments in random directions
    float cells = 18.0;
    for (int L = 0; L < 2; L++) {
      vec2 cp = uv * cells + float(L) * 0.5;
      vec2 ci = floor(cp);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 g = ci + vec2(float(x), float(y));
          vec3 r = h3(mod(g, vec2(cells)), 240.0 + float(L));
          vec2 a = (g + r.xy - float(L) * 0.5) / cells;
          float ang = r.z * TAU;
          vec2 dir = vec2(cos(ang), sin(ang));
          vec2 d = uv - a;
          d -= floor(d + 0.5);
          float len = 0.07 + 0.05 * fract(r.z * 7.0);
          float t = clamp(dot(d, dir), 0.0, len);
          float dist = length(d - dir * t) - 0.0035;
          float c = cover(dist) * step(0.25, fract(r.x * 3.7));
          vec3 nc = mix(rgb(0x6b3c16), rgb(0xa8642a), fract(r.y * 13.0));
          m.col = mix(m.col, nc, c);
          m.h = mix(m.h, 0.8 + 0.1 * float(L), c);
        }
      }
    }
    m.a = 1.0;
    return m;
  }
  if (v == V_GRASS_SIDE || v == V_FRINGE || v == V_SNOW_OVERLAY) {
    float depth = (v == V_GRASS_SIDE ? 3.2 : uP[2].x) * PX;
    int style = v == V_GRASS_SIDE ? 0 : int(uP[2].z + 0.5);
    if (v == V_SNOW_OVERLAY) style = 1;
    float cols = style == 1 ? 7.0 : 26.0;
    float tip = style == 1 ? 0.06 : (style == 2 ? 0.012 : 0.09);
    vec3 fr = topFringe(uv, depth, cols, tip, style, 250.0);
    float cov = fr.x;
    // soft shadow cast on the block side just below the fringe
    float sh = (1.0 - smoothstep(0.0, 0.06, fr.y)) * (1.0 - cov);
    m.col *= 1.0 - 0.35 * sh;
    m.h -= 0.05 * sh;
    vec3 fc, fl;
    if (v == V_GRASS_SIDE) { fc = rgb(0x8e8e8e); fl = rgb(0xb4b4b2); }
    else if (v == V_SNOW_OVERLAY) { fc = rgb(0xe6eef2); fl = rgb(0xfafcff); }
    else { fc = uC[5]; fl = uC[6]; }
    float y = 1.0 - uv.y;
    float streak = gnoise(uv * vec2(48.0, 6.0), vec2(48.0, 6.0), 251.0);
    float grain = gnoise(uv * 64.0, vec2(64.0), 252.0);
    float k = style == 1 ? 0.5 + 0.12 * grain : sat(0.5 + 0.35 * streak + 0.25 * fract(fr.z * 13.0)) * (fr.z < 0.5 ? 0.72 : 1.0);
    vec3 c = mix(fc, fl, k);
    // fringe darkens with depth (self shadow towards its lower edge)
    c *= 1.0 - 0.25 * smoothstep(depth * 0.5, depth * 1.6, y);
    float fh = 0.85 + 0.1 * (style == 1 ? grain : streak);
    m.col = mix(m.col, c, cov);
    m.h = mix(m.h, fh, cov);
    m.r = mix(m.r, style == 1 ? 0.75 : 0.7, cov);
    if (v == V_GRASS_SIDE) m.a = cov;
    else if (v == V_SNOW_OVERLAY) m.a = cov;
    else m.a = uP[2].w;
    return m;
  }
  if (v == V_SNOW) {
    float n = fbm(uv, vec2(4.0), 4, 0.55, 260.0);
    float g = gnoise(uv * 96.0, vec2(96.0), 261.0);
    vec4 w = worley(uv, vec2(28.0), 0.9, 262.0);
    float sparkle = (1.0 - smoothstep(0.05, 0.15, w.x)) * step(w.z, 0.12);
    vec3 col = mix(rgb(0xdfe7ee), rgb(0xf7fbff), sat(0.6 + 0.5 * n + 0.15 * g));
    col = mix(col, vec3(1.0), sparkle * 0.6);
    float h = 0.7 + 0.15 * n + 0.04 * g;
    return M(col, 1.0, sat(h), 0.72 - 0.4 * sparkle);
  }
  return missingTex(uv);
}
