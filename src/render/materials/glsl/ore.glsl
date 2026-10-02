// Ores: a base rock (stone / deepslate / netherrack) with clustered mineral inclusions.
//  uP[0]: x base (0 stone, 1 deepslate, 2 netherrack), y cluster probability, z blob radius scale, w blobs per cluster
//  uP[1]: x style (0 chunky/coal, 1 metal nugget, 2 faceted gem, 3 patchy lapis, 4 crystal shards),
//         y mineral roughness, z rim darkness, w cluster grid (cells per axis)
//  uP[2]: x glow (lit redstone), y speck amount (tiny scattered grains)
//  uC[0] mineral dark, uC[1] mineral main, uC[2] mineral highlight, uC[3] rim colour

Mat oreBase(vec2 uv, int base) {
  vec3 dk, md, lt, sa, sb;
  vec4 p0, p1, p2, p3;
  if (base == 1) {
    dk = rgb(0x3a3a3f); md = rgb(0x4e4e53); lt = rgb(0x636369); sa = rgb(0x2f2f34); sb = rgb(0x6a6a70);
    p0 = vec4(4.0, 0.55, 0.04, 0.05); p1 = vec4(0.2, 0.08, 0.6, 4.0); p2 = vec4(0.74, 1.0, 28.0, 4.0); p3 = vec4(0.6, 0.35, 0.7, 0.5);
  } else if (base == 2) {
    dk = rgb(0x4d2223); md = rgb(0x6f3534); lt = rgb(0x8b4747); sa = rgb(0x3e1717); sb = rgb(0x9a5050);
    p0 = vec4(6.0, 0.8, 0.1, 0.1); p1 = vec4(0.35, 0.4, 0.35, 0.0); p2 = vec4(0.9, 1.4, 22.0, 7.0); p3 = vec4(0.9, 0.4, 1.0, 0.6);
  } else {
    dk = rgb(0x6a6a6a); md = rgb(0x7f7f7f); lt = rgb(0x939393); sa = rgb(0x666666); sb = rgb(0x8e8e8e);
    p0 = vec4(5.0, 0.5, 0.03, 0.03); p1 = vec4(0.3, 0.12, 0.75, -1.0); p2 = vec4(0.8, 1.0, 30.0, 1.0); p3 = vec4(0.7, 0.35, 0.7, 0.6);
  }
  return rock(uv, dk, md, lt, sa, sb, p0, p1, p2, p3);
}

Mat material(vec2 uv) {
  if (uVariant != V_ORE) return missingTex(uv);
  int base = int(uP[0].x + 0.5);
  Mat m = oreBase(uv, base);
  int style = int(uP[1].x + 0.5);
  float grid = max(2.0, uP[1].w);
  float salt = 300.0;

  // nearest cluster centre on a jittered periodic grid
  vec2 p = uv * grid;
  vec2 ci = floor(p);
  float best = 9.0;
  vec2 bc = vec2(0.0);
  vec2 bid = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = ci + vec2(float(x), float(y));
      vec2 cell = mod(g, grid);
      vec3 hh = h3(cell, salt);
      if (hh.z > uP[0].y) continue;
      vec2 c = g + 0.2 + 0.6 * hh.xy;
      float d = length(p - c);
      if (d < best) { best = d; bc = c; bid = cell; }
    }
  }
  float inc = 0.0;
  float hl = 0.0;
  float facet = 0.0;
  vec2 lp = vec2(0.0);
  if (best < 1.2) {
    // union of blobs around the cluster centre (cell units)
    int nb = int(uP[0].w + 0.5);
    float rs = uP[0].z;
    float dmin = 9.0;
    vec2 nearestOff = vec2(0.0);
    for (int k = 0; k < 7; k++) {
      if (k >= nb) break;
      vec3 r = h3(bid + vec2(float(k) * 17.0, 3.0), salt + 1.0);
      vec2 off = (r.xy - 0.5) * 0.42 * (k == 0 ? 0.0 : 1.0);
      float rad = rs * (0.07 + 0.06 * r.z);
      vec2 dv = p - (bc + off);
      // angular grains: a randomly rotated box/diamond blend instead of round blobs
      vec2 rv = rot(r.z * TAU) * dv;
      float ang = max(abs(rv.x), abs(rv.y));
      float dia = (abs(rv.x) + abs(rv.y)) * 0.75;
      float d = mix(ang, dia, fract(r.x * 5.0)) * 1.05 - rad;
      if (d < dmin) { dmin = d; nearestOff = dv / max(rad, 1e-3); }
    }
    float edgeN = 0.03 * rs * gnoise(uv * 48.0, vec2(48.0), salt + 2.0);
    float sd = (dmin + edgeN) / grid; // uv units
    inc = cover(sd);
    float rimC = cover(sd - 0.012) - inc;
    lp = nearestOff;
    hl = sat(1.0 - length(nearestOff));
    // rim: darker reaction halo around the mineral
    m.col = mix(m.col, uC[3], rimC * uP[1].z);
    m.h -= rimC * 0.04;
    facet = h1(mod(floor(p * 7.0 + vec2(nearestOff * 2.0)), vec2(grid * 7.0)), salt + 3.0);
  }
  // scattered tiny grains of the mineral between clusters
  float speck = 0.0;
  if (uP[2].y > 0.0) {
    vec4 w = worley(uv, vec2(26.0), 0.9, salt + 4.0);
    speck = step(w.z, uP[2].y) * (1.0 - smoothstep(0.12, 0.22, w.x));
  }
  float g = gnoise(uv * 64.0, vec2(64.0), salt + 5.0);
  vec3 mc;
  float mh;
  float mr = uP[1].y;
  if (style == 0) {
    // coal: dark chunky matte lumps with dull sheen
    mc = mix(uC[0], uC[1], sat(0.5 + 0.5 * g + 0.3 * facet));
    mc = mix(mc, uC[2], smoothstep(0.55, 0.9, hl) * 0.4);
    mh = 0.73 + 0.08 * hl + 0.04 * g;
  } else if (style == 1) {
    // metal nugget: rounded, bright highlight towards the light, dark edge
    float sh = dot(normalize(vec2(-0.5, 0.8)), -lp) * 0.5 + 0.5;
    mc = mix(uC[0], uC[1], smoothstep(0.0, 0.6, hl));
    mc = mix(mc, uC[2], smoothstep(0.55, 0.95, sh * hl + 0.15 * g) * 0.8);
    mh = 0.74 + 0.09 * sqrt(hl) + 0.02 * g;
  } else if (style == 2) {
    // faceted gem: angular facets with bright white glints
    float f = step(0.5, fract(facet * 3.7 + 0.3 * g));
    mc = mix(uC[0], uC[1], 0.55 + 0.45 * f);
    mc = mix(mc, uC[2], smoothstep(0.8, 0.98, facet) * 0.9 + smoothstep(0.6, 0.9, hl) * 0.35);
    mh = 0.74 + 0.1 * hl + 0.04 * f;
  } else if (style == 3) {
    // lapis: blue patches with lighter mottling and golden pyrite flecks
    mc = mix(uC[0], uC[1], sat(0.55 + 0.6 * g));
    mc = mix(mc, uC[2], smoothstep(0.45, 0.8, g) * 0.5);
    mc = mix(mc, rgb(0xc8a040), step(0.93, facet) * 0.8);
    mh = 0.7 + 0.06 * hl + 0.03 * g;
  } else {
    // crystal shards (quartz, redstone): elongated bright crystals
    float sh = abs(fract(dot(lp, vec2(0.8, 0.6)) * 1.5 + facet) - 0.5);
    mc = mix(uC[0], uC[1], smoothstep(0.0, 0.5, hl + 0.2 * g));
    mc = mix(mc, uC[2], smoothstep(0.32, 0.5, sh) * 0.7 + smoothstep(0.7, 1.0, hl) * 0.4);
    mh = 0.73 + 0.08 * hl + 0.05 * sh;
  }
  float any = max(inc, speck * 0.85);
  m.col = mix(m.col, mc, any);
  m.h = mix(m.h, mh, inc);
  m.r = mix(m.r, mr, any);
  if (uP[2].x > 0.0) {
    // lit redstone: the stone is a little darker so only the glowing cores pass the emissive threshold
    m.col *= mix(0.72, 1.0, any);
    m.col = mix(m.col, uC[2], inc * smoothstep(0.15, 0.8, hl) * uP[2].x);
  }
  return m;
}
