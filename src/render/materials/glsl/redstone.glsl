// Redstone components, rails, torches, lever, end rod, fire, flower pot.
// uP[0].x = sub type / state as documented per variant.

vec3 redstoneColor(float on, float k) {
  vec3 off = mix(rgb(0x4a0604), rgb(0x8a1008), k);
  vec3 lit = mix(rgb(0xd0200e), rgb(0xff7050), k);
  // powered: hot pinkish core so only the energised parts pass the emissive luminance threshold
  lit = mix(lit, rgb(0xffdccc), smoothstep(0.7, 1.0, k));
  return mix(off, lit, on);
}

// Smooth stone slab top used by repeaters / comparators
Mat slabTop(vec2 uv) {
  Mat m = rock(uv, rgb(0x8e8e8e), rgb(0x9e9e9e), rgb(0xadadad), rgb(0x8a8a8a), rgb(0xb4b4b4),
               vec4(5.0, 0.3, 0.02, 0.02), vec4(0.05, 0.05, 0.25, 0.0), vec4(0.7, 0.5, 26.0, 1400.0), vec4(0.3, 0.35, 0.6, 0.4));
  float e = borderDist(uv);
  m.col *= 0.85 + 0.15 * bevel(e, 0.9 * PX);
  m.h *= 0.85 + 0.15 * bevel(e, 0.9 * PX);
  return m;
}

// Torch head seen from above (repeater / comparator): ring + glowing core
void torchSpot(inout Mat m, vec2 uv, vec2 c, float on) {
  float d = length(uv - c);
  float ring = cover(d - 1.6 * PX);
  float core = cover(d - 1.0 * PX);
  m.col = mix(m.col, rgb(0x6a5032), ring);
  m.h = mix(m.h, 0.9, ring);
  m.col = mix(m.col, redstoneColor(on, 1.0 - d / (1.0 * PX)), core);
  m.h = mix(m.h, 1.0, core);
}

float lineMask(vec2 uv, vec2 a, vec2 b, float w) { return cover(sdSeg(uv, a, b) - w); }

Mat railCard(vec2 uv, int kind, float on) {
  // kind 0 rail, 1 corner, 2 powered, 3 detector, 4 activator
  Mat m = M(rgb(0x5a4026), 0.0, 0.0, 0.7);
  Mat wood = woodGrain(uv * vec2(1.0, 1.0), rgb(0x4a3420), rgb(0x6a4c2e), rgb(0x7e5c38), 1410.0);
  bool corner = kind == 1;
  float ties = 0.0;
  float tieH = 0.0;
  if (!corner) {
    float ty = fract(uv.y * 4.0 + 0.125);
    ties = cover(abs(ty - 0.5) / 4.0 - 1.0 * PX) * cover(abs(uv.x - 0.5) - 6.5 * PX);
  } else {
    // radial ties around the bottom-right corner
    vec2 q = uv - vec2(1.0, 0.0);
    float r = length(q);
    float ang = atan(q.y, -q.x);
    float k = fract(ang / (PI * 0.5) * 5.0);
    ties = cover(abs(k - 0.5) * (PI * 0.5 / 5.0) * r - 1.0 * PX) * cover(abs(r - 0.5) - 6.5 * PX);
  }
  over(m, wood.col * 0.9, 0.35 + 0.1 * wood.h, 0.8, ties);
  // redstone / plate between the rails
  if (kind == 2 || kind == 4) {
    float dx = abs(uv.x - 0.5);
    float rl = cover(dx - 0.9 * PX);
    vec3 rc = redstoneColor(on, kind == 2 ? 1.0 - dx / (0.9 * PX) : 0.4);
    over(m, rc, 0.5, 0.5, kind == 2 ? rl : rl * ties);
  }
  if (kind == 3) {
    float plate = cover(sdRBox(uv - 0.5, vec2(3.5 * PX, 3.5 * PX), 0.5 * PX));
    over(m, rgb(0x8a8a8a), 0.55, 0.7, plate);
    float dot_ = cover(length(uv - 0.5) - 1.2 * PX);
    over(m, redstoneColor(on, 0.8), 0.6, 0.5, dot_);
  }
  // rails
  vec3 railC = kind == 2 ? rgb(0xd8b040) : rgb(0x9a9a9e);
  float rails;
  float cyl;
  if (!corner) {
    float d1 = abs(uv.x - 3.5 * PX), d2 = abs(uv.x - 12.5 * PX);
    float d = min(d1, d2);
    rails = cover(d - 0.9 * PX);
    cyl = sat(1.0 - d / (0.9 * PX));
  } else {
    float r = length(uv - vec2(1.0, 0.0));
    float d = min(abs(r - 3.5 * PX), abs(r - 12.5 * PX));
    rails = cover(d - 0.9 * PX);
    cyl = sat(1.0 - d / (0.9 * PX));
  }
  over(m, railC * (0.6 + 0.6 * cyl), 0.7 + 0.2 * cyl, 0.3, rails);
  return m;
}

Mat flameShape(vec2 uv, vec3 c1, vec3 c2, vec3 c3, float scale) {
  // rising tongues of flame from the bottom edge, tileable horizontally
  float n1 = fbm(vec2(uv.x, uv.y * 0.8), vec2(6.0, 2.0), 4, 0.55, 1420.0);
  float n2 = gnoise(vec2(uv.x * 10.0, uv.y * 4.0), vec2(10.0, 4.0), 1421.0);
  float tongues = 0.5 + 0.5 * cos(uv.x * TAU * 4.0 + n1 * 3.0);
  float hgt = scale * (0.55 + 0.35 * tongues + 0.2 * n1);
  float dens = sat(1.0 - uv.y / max(hgt, 0.05) + 0.25 * n2);
  float a = smoothstep(0.08, 0.2, dens);
  vec3 col = mix(c3, c2, smoothstep(0.1, 0.5, dens));
  col = mix(col, c1, smoothstep(0.55, 0.9, dens));
  return M(col, a, 0.5 + 0.3 * dens, 0.6);
}

Mat stickTorch(vec2 uv, vec3 h1c, vec3 h2c, vec3 h3c, float headKind) {
  // stick: 2px wide centred, from the bottom to 10px; head on top
  Mat m = M(rgb(0x6a4a28), 0.0, 0.0, 0.7);
  float sx = abs(uv.x - 0.5);
  float stick = cover(sx - 1.0 * PX) * step(uv.y, 10.0 * PX);
  float g = gnoise(vec2(uv.x * 32.0, uv.y * 8.0), vec2(32.0, 8.0), 1430.0);
  vec3 sc = mix(rgb(0x5a3e20), rgb(0x8a6a3e), 0.5 + 0.4 * g) * (0.75 + 0.35 * sat(1.0 - sx / PX));
  over(m, sc, 0.6 + 0.2 * sat(1.0 - sx / PX), 0.7, stick);
  if (headKind < 0.5) {
    // flame
    vec2 q = (uv - vec2(0.5, 11.0 * PX)) / vec2(1.6 * PX, 2.6 * PX);
    float f = length(vec2(q.x * (1.0 + 0.6 * max(q.y, 0.0)), q.y));
    float fl = cover((f - 1.0) * 1.6 * PX);
    vec3 fc = mix(h3c, h2c, smoothstep(1.0, 0.5, f));
    fc = mix(fc, h1c, smoothstep(0.55, 0.1, f));
    over(m, fc, 0.8, 0.5, fl);
    // charred tip of the stick
    float tip = cover(sx - 1.0 * PX) * step(9.0 * PX, uv.y) * step(uv.y, 10.0 * PX);
    over(m, rgb(0x2a1a0e), 0.7, 0.8, tip * (1.0 - fl));
  } else {
    // redstone head: a small cube of redstone on top of the stick
    float head = cover(sdRBox(uv - vec2(0.5, 10.5 * PX), vec2(1.3 * PX, 1.4 * PX), 0.4 * PX));
    vec2 q = (uv - vec2(0.5, 10.5 * PX)) / (1.4 * PX);
    vec3 hc = mix(h2c, h1c, sat(1.0 - length(q)));
    over(m, hc, 0.9, 0.4, head);
  }
  return m;
}

Mat material(vec2 uv) {
  int v = uVariant;
  float k = uP[0].x;
  vec2 c = uv - 0.5;
  if (v == V_DUST) {
    vec2 q = uv + warp(uv, 8.0, 0.012, 1440.0);
    float band = min(abs(q.x - 0.5), abs(q.y - 0.5));
    float blob = length(q - 0.5);
    float shape = min(band - 1.5 * PX, blob - 3.2 * PX);
    vec4 w = worley(uv, vec2(40.0), 0.9, 1441.0);
    float grain = 1.0 - smoothstep(0.2, 0.55, w.x);
    float a = cover(shape + 0.6 * PX * (w.z - 0.5)) * (0.7 + 0.3 * grain);
    a = smoothstep(0.3, 0.6, a);
    vec3 col = mix(rgb(0x6a0804), rgb(0xd01c0c), sat(0.4 + 0.6 * grain * w.z + 0.2));
    return M(col, a, 0.4 + 0.3 * grain, 0.5);
  }
  if (v == V_REPEATER || v == V_COMPARATOR) {
    Mat m = slabTop(uv);
    float on = k;
    float lw = 0.7 * PX;
    vec3 lc = redstoneColor(on, 0.5);
    if (v == V_REPEATER) {
      float ln = lineMask(uv, vec2(0.5, 1.0 * PX), vec2(0.5, 15.0 * PX), lw);
      m.col = mix(m.col, lc, ln);
      m.h = mix(m.h, 0.82, ln);
      torchSpot(m, uv, vec2(0.5, 12.0 * PX), on);
      torchSpot(m, uv, vec2(0.5, 6.0 * PX), on);
    } else {
      float ln = max(max(lineMask(uv, vec2(4.0, 3.0) * PX, vec2(12.0, 3.0) * PX, lw), lineMask(uv, vec2(0.5, 3.0 * PX), vec2(0.5, 13.0 * PX), lw)), 0.0);
      m.col = mix(m.col, lc, ln);
      m.h = mix(m.h, 0.82, ln);
      torchSpot(m, uv, vec2(4.0, 3.0) * PX, on);
      torchSpot(m, uv, vec2(12.0, 3.0) * PX, on);
      torchSpot(m, uv, vec2(8.0, 13.0) * PX, 0.0); // the front torch of a comparator is lit only in subtract mode
    }
    return m;
  }
  if (v == V_RAIL) return railCard(uv, int(uP[0].y + 0.5), k);
  if (v == V_TORCH) {
    // k: 0 torch, 1 soul torch, 2 redstone on, 3 redstone off
    vec3 a = rgb(0xfffbe0), b = rgb(0xffd040), d = rgb(0xff7a10);
    if (k > 0.5 && k < 1.5) { a = rgb(0xe8ffff); b = rgb(0x60e8f0); d = rgb(0x1890b0); }
    if (k > 1.5 && k < 2.5) { a = rgb(0xffb0a0); b = rgb(0xff2a1a); d = rgb(0x900a04); }
    if (k > 2.5) { a = rgb(0x7a1410); b = rgb(0x4a0806); d = rgb(0x2a0402); }
    return stickTorch(uv, a, b, d, k > 1.5 ? 1.0 : 0.0);
  }
  if (v == V_LEVER) {
    Mat m = M(rgb(0x6a4a28), 0.0, 0.0, 0.7);
    float sx = abs(uv.x - 0.5);
    float stick = cover(sx - 1.0 * PX) * step(uv.y, 11.0 * PX) * step(1.0 * PX, uv.y);
    float g = gnoise(vec2(uv.x * 32.0, uv.y * 8.0), vec2(32.0, 8.0), 1450.0);
    vec3 sc = mix(rgb(0x5a3e20), rgb(0x8a6a3e), 0.5 + 0.4 * g) * (0.75 + 0.35 * sat(1.0 - sx / PX));
    over(m, sc, 0.7, 0.7, stick);
    float knob = cover(sdRBox(uv - vec2(0.5, 10.5 * PX), vec2(1.2 * PX), 0.5 * PX));
    over(m, rgb(0x3a3a3a), 0.9, 0.4, knob);
    return m;
  }
  if (v == V_END_ROD) {
    Mat m = M(rgb(0xe8e4f0), 0.0, 0.0, 0.3);
    float sx = abs(uv.x - 0.5);
    float rod = cover(sx - 1.0 * PX) * step(2.0 * PX, uv.y) * step(uv.y, 15.0 * PX);
    vec3 rc = mix(rgb(0xc8c0d8), rgb(0xffffff), sat(1.0 - sx / PX));
    over(m, rc, 0.8, 0.2, rod);
    float base = cover(sdBox(uv - vec2(0.5, 1.0 * PX), vec2(2.0 * PX, 1.0 * PX)));
    over(m, rgb(0xb8aed0), 0.7, 0.3, base);
    return m;
  }
  if (v == V_FIRE) {
    bool soul = k > 0.5;
    return flameShape(uv, soul ? rgb(0xe0ffff) : rgb(0xfff6c0), soul ? rgb(0x40d8f0) : rgb(0xffa020), soul ? rgb(0x1060a0) : rgb(0xc02a08), 0.95);
  }
  if (v == V_POT) {
    float n = fbm(uv, vec2(6.0), 4, 0.55, 1460.0);
    vec3 col = mix(rgb(0x6a3424), rgb(0x8e4a32), sat(0.5 + 0.7 * n));
    float rim = smoothstep(13.0 * PX, 13.5 * PX, uv.y);
    col *= 1.0 + 0.1 * rim;
    float lip = cover(abs(uv.y - 13.0 * PX) - 0.3 * PX);
    col *= 1.0 - 0.3 * lip;
    float h = 0.7 + 0.05 * n + 0.1 * rim - 0.15 * lip;
    return M(col, 1.0, h, 0.8);
  }
  return missingTex(uv);
}
