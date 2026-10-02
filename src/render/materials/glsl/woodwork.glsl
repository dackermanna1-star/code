// Woodwork: doors, trapdoors, crafting table, chest, barrel, bookshelf, jukebox, note block, ladder,
// scaffolding, campfire log and daylight detector.
// Shared heavy calls (inlined once): planks (palette uC0..3), metalSurf (hinges / hoops).
//  V_DOOR     : uP0.y window style (top half), uP0.z 1 = top half
//  V_TRAPDOOR : uP0.x hole style
//  others use uP0.x as the part id.

float pxBox(vec2 uv, vec2 lo, vec2 hi) {
  vec2 c = (lo + hi) * 0.5 * PX, h = (hi - lo) * 0.5 * PX;
  return cover(sdBox(uv - c, h));
}
float pxBoxSD(vec2 uv, vec2 lo, vec2 hi) {
  vec2 c = (lo + hi) * 0.5 * PX, h = (hi - lo) * 0.5 * PX;
  return sdBox(uv - c, h);
}

// Window / hole patterns (1 = hole). style:
// 0 none, 1 2x2 panes, 2 2x3 small panes, 3 lattice, 4 two vertical slits, 5 arched window,
// 6 two small square windows, 7 3x2 trapdoor grid, 8 4 holes, 9 radial (acacia), 10 lattice diamonds
float holes(vec2 uv, float style) {
  vec2 p = uv * 16.0;
  if (style < 0.5) return 0.0;
  if (style < 1.5) {
    float a = pxBox(uv, vec2(3.0, 3.0), vec2(7.5, 8.0)) + pxBox(uv, vec2(8.5, 3.0), vec2(13.0, 8.0)) +
              pxBox(uv, vec2(3.0, 9.0), vec2(7.5, 13.0)) + pxBox(uv, vec2(8.5, 9.0), vec2(13.0, 13.0));
    return sat(a);
  }
  if (style < 2.5) {
    vec2 g = vec2((p.x - 3.0) / 10.0 * 2.0, (p.y - 3.0) / 10.0 * 3.0);
    vec2 f = fract(g) - 0.5;
    float inside = step(0.0, g.x) * step(g.x, 2.0) * step(0.0, g.y) * step(g.y, 3.0);
    return cover(sdBox(f, vec2(0.36, 0.33)) / 8.0) * inside;
  }
  if (style < 3.5) {
    vec2 g = (p - 3.0) / 2.5;
    vec2 f = fract(g) - 0.5;
    float inside = step(0.0, g.x) * step(g.x, 4.0) * step(0.0, g.y) * step(g.y, 4.0);
    return cover(sdBox(f, vec2(0.28)) / 6.0) * inside;
  }
  if (style < 4.5) return sat(pxBox(uv, vec2(4.0, 3.0), vec2(6.5, 13.0)) + pxBox(uv, vec2(9.5, 3.0), vec2(12.0, 13.0)));
  if (style < 5.5) {
    float body = pxBox(uv, vec2(4.0, 3.0), vec2(12.0, 10.0));
    float arch = cover(length(uv - vec2(8.0, 10.0) * PX) - 4.0 * PX) * step(10.0 * PX, uv.y);
    float mull = cover(abs(uv.x - 0.5) - 0.5 * PX);
    return sat(body + arch) * (1.0 - mull);
  }
  if (style < 6.5) return sat(pxBox(uv, vec2(4.0, 8.0), vec2(7.0, 12.0)) + pxBox(uv, vec2(9.0, 8.0), vec2(12.0, 12.0)));
  if (style < 7.5) {
    vec2 g = vec2((p.x - 2.0) / 12.0 * 3.0, (p.y - 3.0) / 10.0 * 2.0);
    vec2 f = fract(g) - 0.5;
    float inside = step(0.0, g.x) * step(g.x, 3.0) * step(0.0, g.y) * step(g.y, 2.0);
    return cover(sdBox(f, vec2(0.3, 0.3)) / 8.0) * inside;
  }
  if (style < 8.5) {
    return sat(pxBox(uv, vec2(3.0, 3.0), vec2(6.0, 6.0)) + pxBox(uv, vec2(10.0, 3.0), vec2(13.0, 6.0)) +
               pxBox(uv, vec2(3.0, 10.0), vec2(6.0, 13.0)) + pxBox(uv, vec2(10.0, 10.0), vec2(13.0, 13.0)));
  }
  if (style < 9.5) {
    vec2 c = uv - 0.5;
    float r = length(c);
    float ang = atan(c.y, c.x);
    float spoke = abs(fract(ang / TAU * 8.0) - 0.5);
    return cover(-(spoke - 0.18) * r * 2.0) * step(r, 0.36) * step(0.08, r);
  }
  vec2 g = (p - 2.0) / 3.0;
  vec2 f = fract(g) - 0.5;
  float inside = step(0.0, g.x) * step(g.x, 4.0) * step(0.0, g.y) * step(g.y, 4.0);
  return cover((abs(f.x) + abs(f.y) - 0.3) / 6.0) * inside;
}

Mat bookshelf(vec2 uv, Mat wood) {
  // shelves: top/bottom boards + middle shelf; two rows of books
  float row = uv.y < 0.5 ? 0.0 : 1.0;
  float y0 = row < 0.5 ? 1.0 * PX : 9.0 * PX;
  float y1 = row < 0.5 ? 7.0 * PX : 15.0 * PX;
  float inRow = step(y0, uv.y) * step(uv.y, y1);
  // book widths vary: walk a hash-driven partition of the row
  float x = uv.x * 16.0;
  float bi = floor(x / 2.0);
  float bw = 2.0;
  vec3 r = h3(vec2(bi + row * 20.0, 4.0), 1500.0);
  float bookTop = y1 - (r.y < 0.3 ? 1.0 : 0.0) * PX * (1.0 + floor(r.z * 2.0));
  float inBook = inRow * step(uv.y, bookTop);
  vec3 pal0 = rgb(0x7a1e1a), pal1 = rgb(0x2a3e7a), pal2 = rgb(0x2e6a2a), pal3 = rgb(0x6a4a24), pal4 = rgb(0x5a2a6a), pal5 = rgb(0x8a6a2a);
  float ci = floor(r.x * 6.0);
  vec3 bc = ci < 1.0 ? pal0 : (ci < 2.0 ? pal1 : (ci < 3.0 ? pal2 : (ci < 4.0 ? pal3 : (ci < 5.0 ? pal4 : pal5))));
  float lx = fract(x / bw);
  float spine = 0.75 + 0.35 * sin(lx * PI);
  vec3 col = bc * spine;
  // spine bands
  float ly = (uv.y - y0) / (y1 - y0);
  float band = cover(abs(ly - 0.2) - 0.04) + cover(abs(ly - 0.78) - 0.04);
  col = mix(col, rgb(0xd8b860) * 0.8, sat(band) * 0.6);
  float gap = cover(abs(lx - 0.0) * bw * PX - 0.15 * PX) + cover(abs(lx - 1.0) * bw * PX - 0.15 * PX);
  col *= 1.0 - 0.5 * sat(gap);
  // shadowed back of the shelf above books that are shorter
  vec3 back = rgb(0x1e140a);
  vec3 outc = mix(back, col, inBook);
  Mat m = wood;
  m.col = mix(wood.col, outc, inRow);
  m.h = mix(wood.h, mix(0.2, 0.55 + 0.15 * sin(lx * PI), inBook), inRow);
  m.r = mix(wood.r, 0.75, inRow);
  return m;
}

Mat material(vec2 uv) {
  int v = uVariant;
  float part = uP[0].x;
  bool vertical = v == V_DOOR || v == V_LADDER || (v == V_BARREL && part < 0.5);
  vec2 puv = vertical ? vec2(uv.y, uv.x) : uv;
  Mat w = planks(puv, uC[0], uC[1], uC[2], uC[3], vec4(0.12, 0.5, 0.15, 0.0), 1510.0);
  Mat met = metalSurf(uv, rgb(0x3e3e42), rgb(0x2a2420), vec4(0.3, 0.3, 0.45, 0.3), 1520.0);
  float e = borderDist(uv);
  vec2 c = uv - 0.5;

  if (v == V_DOOR || v == V_TRAPDOOR) {
    float style = v == V_DOOR ? uP[0].y : uP[0].x;
    bool top = v == V_DOOR && uP[0].z > 0.5;
    // frame
    float frame = 1.0 - smoothstep(2.0 * PX - 0.004, 2.0 * PX + 0.004, e);
    if (v == V_DOOR) frame = 1.0 - smoothstep(2.0 * PX - 0.004, 2.0 * PX + 0.004, min(min(uv.x, 1.0 - uv.x), top ? 1.0 - uv.y : uv.y));
    w.col *= 1.0 + 0.08 * frame;
    w.h = mix(w.h * 0.92, min(w.h + 0.12, 1.0), frame);
    float bev = bevel(e, 0.7 * PX);
    w.col *= 0.88 + 0.12 * bev;
    float hole = 0.0;
    if (v == V_DOOR && !top) {
      // lower half: two recessed panels and a handle
      float p1 = pxBoxSD(uv, vec2(3.5, 3.0), vec2(12.5, 7.5));
      float p2 = pxBoxSD(uv, vec2(3.5, 9.0), vec2(12.5, 14.0));
      float pan = max(cover(p1), cover(p2));
      float rim = max(cover(abs(p1) - 0.35 * PX), cover(abs(p2) - 0.35 * PX));
      w.h -= 0.06 * pan;
      w.col *= 1.0 - 0.18 * rim;
      vec2 hd = rivet(uv, vec2(13.2, 14.5) * PX, 0.8 * PX);
      w.col = mix(w.col, met.col * 1.4, hd.x);
      w.h = mix(w.h, 0.95, hd.x);
      w.r = mix(w.r, 0.35, hd.x);
    } else {
      hole = holes(uv, style);
    }
    // hinges (metal straps on the left edge)
    float hinge = v == V_DOOR ? pxBox(uv, vec2(0.0, top ? 10.0 : 3.0), vec2(3.5, top ? 12.0 : 5.0)) : pxBox(uv, vec2(1.0, 1.0), vec2(4.0, 2.5)) + pxBox(uv, vec2(12.0, 1.0), vec2(15.0, 2.5));
    w.col = mix(w.col, met.col, sat(hinge));
    w.h = mix(w.h, 0.95, sat(hinge));
    w.r = mix(w.r, met.r, sat(hinge));
    // inner edge of each hole shows the plank thickness (darker)
    float holeRim = sat(holes(uv + vec2(0.0, 0.6 * PX), style) - hole);
    w.col *= 1.0 - 0.35 * holeRim * (v == V_DOOR && !top ? 0.0 : 1.0);
    w.a = 1.0 - hole;
    return w;
  }
  if (v == V_CRAFTING) {
    // 0 top, 1 front, 2 side
    if (part < 0.5) {
      float frame = 1.0 - smoothstep(1.5 * PX - 0.004, 1.5 * PX + 0.004, e);
      vec2 g = (uv - 2.0 * PX) / (12.0 * PX) * 3.0;
      vec2 f = abs(fract(g) - 0.5);
      float inside = step(0.0, g.x) * step(g.x, 3.0) * step(0.0, g.y) * step(g.y, 3.0);
      float lines = max(cover(0.5 - f.x - 0.06 * 0.0 - 0.05), cover(0.5 - f.y - 0.05)) * inside;
      w.col *= 1.0 + 0.1 * inside;
      w.col = mix(w.col, uC[3] * 0.9, lines * 0.85);
      w.h -= 0.15 * lines;
      w.col = mix(w.col, w.col * 0.75, frame);
      w.h = mix(w.h, w.h + 0.06, frame);
      return w;
    }
    // front / side: thick top slab band + tools hanging on the body
    float topBand = smoothstep(12.5 * PX - 0.004, 12.5 * PX + 0.004, uv.y);
    w.col = mix(w.col * 0.92, w.col * 1.08, topBand);
    float seam = cover(abs(uv.y - 12.5 * PX) - 0.35 * PX);
    w.col *= 1.0 - 0.4 * seam;
    w.h -= 0.2 * seam;
    vec3 iron = met.col * 1.8;
    vec3 handle = rgb(0x6a4a2a);
    if (part < 1.5) {
      // saw (left) and hammer (right)
      float blade = cover(sdRBox(uv - vec2(5.0, 7.5) * PX, vec2(2.0, 3.5) * PX, 0.3 * PX));
      float teeth = blade * step(0.5, fract(uv.y * 16.0 * 1.5)) * step(uv.x, 3.6 * PX);
      float sawH = pxBox(uv, vec2(3.5, 11.0), vec2(6.5, 12.0));
      float hamH = pxBox(uv, vec2(11.0, 3.0), vec2(12.0, 10.5));
      float hamHead = pxBox(uv, vec2(9.0, 9.5), vec2(14.0, 11.5));
      over(w, iron * (0.9 + 0.1 * met.h), 0.85, 0.35, blade * (1.0 - teeth * 0.5));
      over(w, handle, 0.9, 0.7, max(sawH, hamH));
      over(w, iron * 0.8, 0.95, 0.35, hamHead);
    } else {
      // shears / pliers silhouettes
      float b1 = cover(sdSeg(uv, vec2(4.0, 4.0) * PX, vec2(8.0, 10.5) * PX) - 0.6 * PX);
      float b2 = cover(sdSeg(uv, vec2(8.0, 4.0) * PX, vec2(4.5, 10.5) * PX) - 0.6 * PX);
      float ring1 = cover(abs(length(uv - vec2(4.0, 3.5) * PX) - 1.0 * PX) - 0.35 * PX);
      float ring2 = cover(abs(length(uv - vec2(8.0, 3.5) * PX) - 1.0 * PX) - 0.35 * PX);
      over(w, iron, 0.9, 0.35, max(b1, b2));
      over(w, handle * 1.2, 0.9, 0.6, max(ring1, ring2));
      float axeH = pxBox(uv, vec2(11.5, 3.0), vec2(12.5, 11.0));
      float axeHead = cover(sdRBox(uv - vec2(13.0, 9.5) * PX, vec2(1.5, 1.6) * PX, 0.5 * PX));
      over(w, handle, 0.9, 0.7, axeH);
      over(w, iron * 0.9, 0.95, 0.35, axeHead);
    }
    return w;
  }
  if (v == V_CHEST) {
    float frame = 1.0 - smoothstep(1.0 * PX - 0.004, 1.0 * PX + 0.004, e);
    w.col = mix(w.col, w.col * 0.6, frame);
    float seam = cover(abs(uv.y - 10.5 * PX) - 0.45 * PX);
    w.col = mix(w.col, uC[3] * 0.5, seam);
    w.h -= 0.25 * seam;
    // iron corner brackets
    float br = cover(sdBox(abs(c) - vec2(6.6 * PX), vec2(1.2 * PX)));
    w.col = mix(w.col, met.col * 1.2, br);
    w.h = mix(w.h, 0.95, br);
    w.r = mix(w.r, met.r, br);
    float latch = pxBox(uv, vec2(7.0, 8.0), vec2(9.0, 12.0));
    w.col = mix(w.col, rgb(0xb0b0b4) * (0.8 + 0.3 * met.h), latch);
    w.h = mix(w.h, 1.0, latch);
    w.r = mix(w.r, 0.3, latch);
    return w;
  }
  if (v == V_BARREL) {
    // 0 side (vertical staves + 2 hoops), 1 top (lid), 2 bottom
    if (part < 0.5) {
      float hoop = max(pxBox(uv, vec2(0.0, 2.0), vec2(16.0, 4.0)), pxBox(uv, vec2(0.0, 12.0), vec2(16.0, 14.0)));
      w.col = mix(w.col, met.col, hoop);
      w.h = mix(w.h, 0.95, hoop);
      w.r = mix(w.r, met.r, hoop);
      for (int k = 0; k < 4; k++) {
        vec2 rv = rivet(uv, vec2(2.0 + 4.0 * float(k), 3.0) * PX, 0.45 * PX);
        vec2 rv2 = rivet(uv, vec2(2.0 + 4.0 * float(k), 13.0) * PX, 0.45 * PX);
        w.col = mix(w.col, met.col * 1.5, max(rv.x * rv.y, rv2.x * rv2.y));
      }
      return w;
    }
    float rim = 1.0 - smoothstep(1.5 * PX - 0.004, 1.5 * PX + 0.004, e);
    w.col = mix(w.col, met.col, rim);
    w.h = mix(w.h, 0.95, rim);
    w.r = mix(w.r, met.r, rim);
    if (part < 1.5) {
      float lid = cover(abs(sdBox(c, vec2(3.5 * PX))) - 0.4 * PX);
      w.col *= 1.0 - 0.45 * lid;
      w.h -= 0.15 * lid;
      float hole = cover(sdBox(c, vec2(1.2 * PX)));
      w.col = mix(w.col, rgb(0x140c06), hole);
      w.h = mix(w.h, 0.15, hole);
    }
    return w;
  }
  if (v == V_BOOKSHELF) return bookshelf(uv, w);
  if (v == V_JUKEBOX || v == V_NOTE) {
    // dark polished wood with a frame; jukebox top has a record slot
    float frame = 1.0 - smoothstep(1.5 * PX - 0.004, 1.5 * PX + 0.004, e);
    w.col = mix(w.col, w.col * 0.62, frame);
    w.h = mix(w.h, w.h + 0.06, frame);
    float inner = cover(abs(e - 1.8 * PX) - 0.3 * PX);
    w.col *= 1.0 - 0.3 * inner;
    if (v == V_JUKEBOX && part > 0.5) {
      float slot = cover(sdRBox(c, vec2(5.0 * PX, 1.0 * PX), 0.9 * PX));
      w.col = mix(w.col, rgb(0x0e0a08), slot);
      w.h = mix(w.h, 0.1, slot);
      float diamond = cover(abs(c.x) + abs(c.y - 4.5 * PX) - 1.0 * PX);
      w.col = mix(w.col, rgb(0x6aeee0), diamond);
    }
    if (v == V_NOTE) {
      // speaker grille holes
      vec2 g = fract(uv * 4.0) - 0.5;
      float hole = cover(length(g) - 0.11) * step(2.0 * PX, e);
      w.col = mix(w.col, rgb(0x120a06), hole);
      w.h = mix(w.h, 0.2, hole);
    }
    w.r -= 0.12;
    return w;
  }
  if (v == V_LADDER) {
    // vertical boards were sampled above (rotated), rails + rungs
    float rails = max(pxBox(uv, vec2(2.0, 0.0), vec2(4.0, 16.0)), pxBox(uv, vec2(12.0, 0.0), vec2(14.0, 16.0)));
    float ry = fract(uv.y * 4.0 + 0.125);
    float rung = cover(abs(ry - 0.5) / 4.0 - 0.9 * PX) * pxBox(uv, vec2(3.0, 0.0), vec2(13.0, 16.0));
    float a = max(rails, rung);
    w.col *= 0.9 + 0.2 * sat(1.0 - abs(ry - 0.5) * 8.0) * rung;
    w.h = 0.5 + 0.3 * a;
    w.a = a;
    return w;
  }
  if (v == V_SCAFFOLD) {
    // bamboo frame; 0 side (cross brace), 1 top (slats), 2 bottom (frame only)
    vec3 bam = mix(rgb(0xa88a40), rgb(0xd8bc6a), sat(0.5 + 0.5 * gnoise(uv * vec2(4.0, 40.0), vec2(4.0, 40.0), 1530.0)));
    float frame = 1.0 - smoothstep(1.5 * PX - 0.004, 1.5 * PX + 0.004, e);
    float node = cover(abs(fract(uv.y * 2.0) - 0.5) / 2.0 - 0.3 * PX) * frame;
    float a = frame;
    if (part < 0.5) {
      float brace = max(cover(sdSeg(uv, vec2(1.5, 1.5) * PX, vec2(14.5, 14.5) * PX) - 0.9 * PX), cover(sdSeg(uv, vec2(1.5, 14.5) * PX, vec2(14.5, 1.5) * PX) - 0.9 * PX) * 0.0);
      a = max(a, brace);
    } else if (part < 1.5) {
      float slat = cover(abs(fract(uv.x * 4.0) - 0.5) / 4.0 - 1.2 * PX);
      a = max(a, slat);
    }
    vec3 col = bam * (0.85 + 0.2 * sat(1.0 - abs(e - 0.75 * PX) / PX)) * (1.0 - 0.3 * node);
    return M(col, a, 0.5 + 0.3 * a, 0.6);
  }
  if (v == V_CAMPFIRE) {
    // horizontal log: bark rows with charred cracks glowing with embers
    float n = fbm(uv, vec2(3.0, 8.0), 4, 0.55, 1540.0);
    float rid = 1.0 - abs(gnoise(uv * vec2(3.0, 10.0), vec2(3.0, 10.0), 1541.0));
    float crack = smoothstep(0.88, 0.98, rid);
    vec3 bark = mix(rgb(0x2a1e12), rgb(0x5a4024), sat(0.5 + 0.6 * n));
    bark = mix(bark, rgb(0x161210), smoothstep(0.2, 0.6, fbm(uv, vec2(4.0), 3, 0.5, 1542.0)) * 0.7);
    float ember = crack * smoothstep(0.0, 0.4, fbm(uv, vec2(6.0, 3.0), 3, 0.5, 1543.0) + 0.3);
    vec3 ec = mix(rgb(0xc03a08), rgb(0xffb030), sat(ember * 1.4));
    vec3 col = mix(bark, ec, ember);
    return M(col, 1.0, 0.65 + 0.2 * (1.0 - crack) + 0.05 * n, mix(0.85, 0.6, ember));
  }
  if (v == V_DAYLIGHT) {
    // 0 top (sensor glass cells in a wooden frame), 1 side (slab side)
    if (part < 0.5) {
      float frame = 1.0 - smoothstep(2.0 * PX - 0.004, 2.0 * PX + 0.004, e);
      vec2 g = (uv - 2.0 * PX) / (12.0 * PX) * vec2(3.0, 3.0);
      vec2 f = abs(fract(g) - 0.5);
      float cell = cover(max(f.x, f.y) - 0.4) * (1.0 - frame);
      float nn = fbm(uv, vec2(8.0), 3, 0.5, 1550.0);
      vec3 glass = mix(rgb(0x2a3a6a), rgb(0x8ab0d8), sat(0.4 + 0.6 * (0.5 - f.y) + 0.3 * nn));
      w.col = mix(w.col * (frame > 0.5 ? 1.0 : 0.6), glass, cell);
      w.h = mix(w.h, 0.8, cell);
      w.r = mix(w.r, 0.08, cell);
      return w;
    }
    float slab = step(uv.y, 6.0 * PX);
    w.a = 1.0;
    w.col *= 0.8 + 0.2 * slab;
    return w;
  }
  return missingTex(uv);
}
