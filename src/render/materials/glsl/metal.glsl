// Metal family. One metalSurf() call shared by all variants; designs are cheap overlays.
//  V_METAL_BLOCK: uC0 base, uC1 tarnish, uP0 metalSurf params, uP1.x style (0 iron, 1 gold, 2 copper, 3 netherite)
//  V_GEM_BLOCK  : uC0 deep, uC1 mid, uC2 light, uC3 frame; uP1.x 0 diamond, 1 emerald
//  V_LAPIS_BLOCK, V_REDSTONE_BLOCK, V_IRON_BARS, V_IRON_DOOR (uP1.y 1 = top), V_IRON_TRAPDOOR,
//  V_ANVIL (uP1.y 1 = top), V_CAULDRON (uP1.y 0 side, 1 top, 2 bottom), V_HOPPER (uP1.y 0 outside, 1 top),
//  V_CHAIN, V_LANTERN (uP1.y 1 = soul)

vec3 metalBaseColor(int v) {
  if (v == V_METAL_BLOCK || v == V_GEM_BLOCK || v == V_LAPIS_BLOCK || v == V_REDSTONE_BLOCK) return uC[0];
  if (v == V_ANVIL) return rgb(0x3e3e40);
  if (v == V_CHAIN) return rgb(0x3a3d46);
  if (v == V_LANTERN) return rgb(0x34363c);
  if (v == V_CAULDRON || v == V_HOPPER) return rgb(0x48484a);
  return rgb(0x8c8c8e);
}

Mat material(vec2 uv) {
  int v = uVariant;
  vec4 mp = v == V_METAL_BLOCK ? uP[0] : vec4(0.4, 0.5, 0.42, 0.15);
  if (v == V_GEM_BLOCK || v == V_LAPIS_BLOCK || v == V_REDSTONE_BLOCK) mp = vec4(0.0, 0.2, 0.3, 0.0);
  Mat m = metalSurf(uv, metalBaseColor(v), v == V_METAL_BLOCK ? uC[1] : rgb(0x3a3430), mp, 800.0);
  vec2 c = uv - 0.5;
  float part = uP[1].y;

  if (v == V_METAL_BLOCK) {
    int style = int(uP[1].x + 0.5);
    vec2 pf = panelFrame(uv, 1.0 * PX, 0.9 * PX);
    m.h = 0.55 + 0.4 * pf.x;
    m.col *= 0.6 + 0.4 * pf.x;
    // light inner edge highlight, dark outer edge
    float hl = cover(abs(borderDist(uv) - 1.15 * PX) - 0.25 * PX);
    m.col = mix(m.col, m.col * 1.22, hl * 0.75);
    if (style == 0) {
      float groove = cover(abs(uv.y - 2.5 * PX) - 0.006) * step(1.2 * PX, uv.x) * step(uv.x, 1.0 - 1.2 * PX);
      m.col *= 1.0 - 0.18 * groove;
      m.h -= 0.08 * groove;
    } else if (style == 1) {
      float sheen = smoothstep(0.08, 0.0, abs(uv.x + uv.y - 1.1)) * 0.5 + smoothstep(0.04, 0.0, abs(uv.x + uv.y - 0.78)) * 0.3;
      m.col *= 1.0 + 0.12 * sheen * pf.x;
    } else if (style == 2) {
      vec4 w = worley(uv, vec2(9.0), 0.8, 801.0);
      float dimple = 1.0 - smoothstep(0.0, 0.5, w.x);
      m.h -= 0.06 * dimple * pf.x;
      m.col *= 1.0 - 0.06 * dimple + 0.05 * w.z;
    } else {
      float ln = max(cover(abs(uv.x - 0.5) - 0.006), cover(abs(uv.y - 0.5) - 0.006)) * step(1.5 * PX, borderDist(uv));
      m.col *= 1.0 - 0.25 * ln;
      m.h -= 0.1 * ln;
    }
    return m;
  }
  if (v == V_GEM_BLOCK) {
    bool emerald = uP[1].x > 0.5;
    vec2 pf = panelFrame(uv, 1.2 * PX, 0.8 * PX);
    vec2 g;
    vec2 cell;
    if (emerald) { g = vec2(uv.x * 2.0 + floor(uv.y * 3.0) * 0.5, uv.y * 3.0); cell = fract(g) - 0.5; }
    else { g = uv * 3.0; cell = fract(g) - 0.5; }
    vec2 ac = abs(cell * (emerald ? vec2(1.0, 1.0) : vec2(1.0)));
    float pyr = 1.0 - 2.0 * max(ac.x * (emerald ? 0.75 : 1.0), ac.y);
    // facet orientation -> brightness (top/left lit)
    float face = ac.x * (emerald ? 0.75 : 1.0) > ac.y ? (cell.x < 0.0 ? 0.85 : 0.55) : (cell.y > 0.0 ? 1.0 : 0.45);
    float top = smoothstep(0.55, 0.62, pyr);
    vec3 col = mix(uC[0], uC[1], face);
    col = mix(col, uC[2], top * 0.8);
    float seam = 1.0 - smoothstep(0.0, 0.06, pyr);
    col = mix(col, uC[3], seam * 0.8);
    col *= 0.95 + 0.1 * gnoise(uv * 32.0, vec2(32.0), 802.0);
    col = mix(uC[3], col, pf.y < 0.5 ? 1.0 : 0.0);
    col = mix(col, uC[3] * 1.1, pf.y * (1.0 - pf.x) * 0.5);
    float h = mix(0.6, 0.75 + 0.22 * pyr, 1.0 - pf.y) * (0.75 + 0.25 * pf.x);
    return M(col, 1.0, sat(h), 0.08 + 0.1 * seam);
  }
  if (v == V_LAPIS_BLOCK) {
    float n = fbm(uv, vec2(5.0), 5, 0.55, 803.0);
    vec4 w = worley(uv, vec2(18.0), 0.9, 804.0);
    vec3 col = mix(uC[0], uC[1], sat(0.5 + 0.8 * n));
    col = mix(col, uC[2], (1.0 - smoothstep(0.2, 0.4, w.x)) * step(w.z, 0.25));
    col = mix(col, rgb(0xe0b040), (1.0 - smoothstep(0.08, 0.18, w.x)) * step(0.95, w.z));
    vec2 pf = panelFrame(uv, 0.8 * PX, 0.8 * PX);
    col *= 0.85 + 0.15 * pf.x;
    return M(col, 1.0, 0.6 + 0.35 * pf.x * (0.85 + 0.15 * n), 0.55 - 0.3 * step(0.95, w.z));
  }
  if (v == V_REDSTONE_BLOCK) {
    float n = fbm(uv, vec2(6.0), 4, 0.55, 805.0);
    vec3 col = mix(uC[0], uC[1], sat(0.5 + 0.7 * n));
    vec2 g = fract(uv * 4.0) - 0.5;
    float lines = max(cover(abs(g.x) - 0.03), cover(abs(g.y) - 0.03));
    float dots = cover(length(g - vec2(0.18, -0.18)) - 0.07);
    col = mix(col, uC[0] * 0.55, lines * 0.8);
    col = mix(col, uC[2], dots);
    vec2 pf = panelFrame(uv, 0.8 * PX, 0.8 * PX);
    col *= 0.85 + 0.15 * pf.x;
    return M(col, 1.0, 0.62 + 0.3 * pf.x - 0.1 * lines + 0.05 * dots, 0.45);
  }
  if (v == V_IRON_BARS) {
    float bx = abs(fract(uv.x * 4.0) - 0.5) / 4.0;
    float barw = 0.8 * PX;
    float bar = cover(bx - barw);
    float band = max(cover(abs(uv.y - 3.0 * PX) - 0.6 * PX), cover(abs(uv.y - 13.0 * PX) - 0.6 * PX));
    float cyl = sqrt(sat(1.0 - (bx / barw) * (bx / barw)));
    vec3 col = rgb(0x6a6a6c) * (0.6 + 0.6 * cyl);
    col = mix(col, rgb(0x58585a) * (0.9 + 0.2 * m.h), band * (1.0 - bar));
    float a = max(bar, band);
    return M(col * (0.9 + 0.2 * (m.col.r / max(metalBaseColor(v).r, 0.01) - 1.0)), a, 0.5 + 0.4 * max(cyl * bar, band * 0.8), 0.45);
  }
  if (v == V_IRON_DOOR || v == V_IRON_TRAPDOOR) {
    vec2 pf = panelFrame(uv, 1.5 * PX, 0.8 * PX);
    float frame = pf.y;
    m.col *= 0.8 + 0.2 * pf.x;
    m.col = mix(m.col, m.col * 1.08, frame);
    m.h = mix(0.6, 0.85, frame) * (0.8 + 0.2 * pf.x);
    float hole = 0.0;
    if (v == V_IRON_DOOR && part > 0.5) {
      hole = max(cover(sdBox(uv - vec2(5.0, 10.5) * PX, vec2(2.0, 2.5) * PX)), cover(sdBox(uv - vec2(11.0, 10.5) * PX, vec2(2.0, 2.5) * PX)));
      float panel = cover(sdBox(uv - vec2(8.0, 4.0) * PX, vec2(5.0, 2.0) * PX));
      m.h += 0.06 * panel;
      m.col *= 1.0 + 0.04 * panel;
    } else if (v == V_IRON_DOOR) {
      float p1 = cover(sdBox(uv - vec2(8.0, 11.0) * PX, vec2(5.0, 3.0) * PX));
      float p2 = cover(sdBox(uv - vec2(8.0, 4.5) * PX, vec2(5.0, 2.5) * PX));
      m.h += 0.06 * max(p1, p2);
      // handle
      vec2 hr = rivet(uv, vec2(12.5, 8.5) * PX, 0.9 * PX);
      m.col = mix(m.col, rgb(0x505052), hr.x);
      m.h = mix(m.h, 0.9 + 0.1 * hr.y, hr.x);
    } else {
      vec2 g = fract((uv - 1.5 * PX) / (13.0 * PX) * 2.0) - 0.5;
      vec2 gi = floor((uv - 1.5 * PX) / (13.0 * PX) * 2.0);
      float inside = step(0.0, gi.x) * step(gi.x, 1.0) * step(0.0, gi.y) * step(gi.y, 1.0);
      hole = cover(sdBox(g, vec2(0.28, 0.2))) * inside;
    }
    // rivets in the corners of the frame
    vec2 q = abs(c) - vec2(6.6 * PX);
    vec2 rv = rivet(abs(c), vec2(6.6 * PX), 0.6 * PX);
    m.col = mix(m.col, m.col * 1.15, rv.x * rv.y);
    m.h = mix(m.h, 0.95, rv.x);
    // inner edge of holes is darker (thickness)
    m.col *= 1.0 - 0.4 * (cover(-0.01 + 0.0) * 0.0);
    m.a = 1.0 - hole;
    return m;
  }
  if (v == V_ANVIL) {
    vec4 w = worley(uv, vec2(7.0), 0.9, 806.0);
    float dent = 1.0 - smoothstep(0.0, 0.6, w.x);
    m.h -= 0.05 * dent;
    if (part > 0.5) {
      vec2 pf = panelFrame(uv, 3.0 * PX, 0.8 * PX);
      vec3 face = rgb(0x6c6c70) * (0.9 + 0.2 * fbm(uv, vec2(8.0, 2.0), 3, 0.5, 807.0));
      m.col = mix(face, m.col, pf.y);
      m.r = mix(0.3, m.r, pf.y);
      m.h = mix(0.85, 0.7, pf.y) * (0.85 + 0.15 * pf.x);
    } else {
      m.col *= 0.9 + 0.1 * w.z;
    }
    return m;
  }
  if (v == V_CAULDRON) {
    vec4 w = worley(uv, vec2(10.0), 0.9, 808.0);
    m.col *= 0.92 + 0.12 * w.z;
    m.h -= 0.04 * (1.0 - smoothstep(0.0, 0.6, w.x));
    if (part < 0.5) {
      float rim = smoothstep(13.5 * PX, 14.0 * PX, uv.y);
      m.col *= 1.0 + 0.15 * rim;
      m.h += 0.1 * rim;
      float gap = cover(sdBox(uv - vec2(8.0, 1.0) * PX, vec2(4.0, 2.0) * PX));
      m.a = 1.0 - gap;
    } else if (part < 1.5) {
      float e = borderDist(uv);
      float rim = smoothstep(2.0 * PX + 0.004, 2.0 * PX - 0.004, e);
      m.col *= 0.9 + 0.2 * bevel(e, 0.8 * PX);
      m.a = rim;
    }
    return m;
  }
  if (v == V_HOPPER) {
    if (part > 0.5) {
      float e = borderDist(uv);
      float rim = 1.0 - smoothstep(2.0 * PX - 0.004, 2.0 * PX + 0.004, e);
      vec2 g = abs(fract(uv * 6.0) - 0.5);
      float grate = max(cover(g.x - 0.08), cover(g.y - 0.08));
      vec3 inner = mix(rgb(0x1a1a1c), rgb(0x3a3a3c), grate);
      m.col = mix(inner, m.col * (0.85 + 0.25 * bevel(e, 0.8 * PX)), rim);
      m.h = mix(0.25 + 0.15 * grate, 0.9, rim);
    } else {
      vec2 pf = panelFrame(uv, 1.0 * PX, 0.7 * PX);
      m.col *= 0.82 + 0.18 * pf.x;
      m.h = 0.6 + 0.35 * pf.x;
      float band = cover(abs(uv.y - 10.0 * PX) - 0.7 * PX);
      m.col *= 1.0 - 0.15 * band;
      m.h += 0.05 * band;
      for (int k = 0; k < 4; k++) {
        vec2 rc = vec2(3.0 + 3.3 * float(k), 10.0) * PX;
        vec2 rv = rivet(uv, rc, 0.55 * PX);
        m.col = mix(m.col, m.col * 1.2, rv.x * rv.y);
        m.h = mix(m.h, 0.98, rv.x);
      }
    }
    return m;
  }
  if (v == V_CHAIN) {
    // alternating face-on ring and edge-on link along x = 0.5, two links per tile (tiles vertically)
    float y = fract(uv.y * 2.0);
    bool face = fract(uv.y) < 0.5;
    vec2 q = vec2(uv.x - 0.5, (y - 0.5) / 2.0);
    float a, h;
    if (face) {
      float ring = abs(sdEllipse(q, vec2(2.2 * PX, 4.6 * PX))) - 0.9 * PX;
      a = cover(ring);
      h = 0.5 + 0.4 * sat(1.0 - abs(ring + 0.9 * PX) / (0.9 * PX));
    } else {
      float bar = sdRBox(q, vec2(0.9 * PX, 4.8 * PX), 0.8 * PX);
      a = cover(bar);
      h = 0.6 + 0.3 * sat(-bar / (0.9 * PX));
    }
    vec3 col = rgb(0x3e4250) * (0.6 + 0.6 * h);
    return M(col, a, h, 0.4);
  }
  if (v == V_LANTERN) {
    bool soul = part > 0.5;
    // iron frame: top cap, bottom base, corner posts; glass with a flame inside
    float cap = step(11.0 * PX, uv.y) * step(uv.y, 13.5 * PX) * step(abs(c.x), 4.0 * PX);
    float knob = step(13.5 * PX, uv.y) * step(uv.y, 15.0 * PX) * step(abs(c.x), 1.5 * PX);
    float base = step(1.0 * PX, uv.y) * step(uv.y, 3.0 * PX) * step(abs(c.x), 4.5 * PX);
    float body = step(3.0 * PX, uv.y) * step(uv.y, 11.0 * PX) * step(abs(c.x), 4.0 * PX);
    float post = body * step(3.0 * PX, abs(c.x));
    float glass = body * (1.0 - post);
    vec2 fq = (uv - vec2(0.5, 6.0 * PX)) / vec2(1.8 * PX, 3.6 * PX);
    float flame = (1.0 - smoothstep(0.6, 1.0, length(vec2(fq.x * (1.0 + max(fq.y, 0.0)), fq.y)))) * glass;
    vec3 fc1 = soul ? rgb(0x9cf8ff) : rgb(0xfff2b0);
    vec3 fc2 = soul ? rgb(0x18a8c0) : rgb(0xff9a20);
    vec3 glassC = soul ? rgb(0x3a8a98) : rgb(0xb07a30);
    vec3 col = m.col;
    col = mix(col, glassC * (0.7 + 0.3 * smoothstep(1.4, 0.0, length(fq))), glass);
    col = mix(col, mix(fc2, fc1, smoothstep(0.2, 0.8, 1.0 - length(fq))), flame);
    float frameM = max(max(cap, knob), max(base, post));
    float a = max(frameM, glass);
    float h = 0.5 + 0.35 * frameM;
    return M(col, a, h, mix(0.15, 0.4, frameM));
  }
  return missingTex(uv);
}
