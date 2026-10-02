// Machines & functional stone blocks. Shared heavy calls (each inlined once): rock (stone faces),
// planks (piston heads), bark (smoker logs), metalSurf (iron parts).
// uP[0].x = part id within a variant.

float boxMask(vec2 uv, vec2 lo, vec2 hi) {
  // pixel-space box (Minecraft px), anti-aliased
  vec2 c = (lo + hi) * 0.5 * PX, h = (hi - lo) * 0.5 * PX;
  return cover(sdBox(uv - c, h));
}
float boxSD(vec2 uv, vec2 lo, vec2 hi) {
  vec2 c = (lo + hi) * 0.5 * PX, h = (hi - lo) * 0.5 * PX;
  return sdBox(uv - c, h);
}

// Dark recessed opening with inner depth shading. Returns updated material.
void opening(inout Mat m, vec2 uv, vec2 lo, vec2 hi, vec3 deep) {
  float sd = boxSD(uv, lo, hi);
  float c = cover(sd);
  float depth = sat(-sd / (1.5 * PX));
  vec3 col = mix(deep * 1.8, deep, depth);
  // top inner edge in shadow, bottom inner lip slightly lit
  m.col = mix(m.col, col, c);
  m.h = mix(m.h, 0.08, c);
  m.r = mix(m.r, 0.9, c);
  // bevelled lip around the opening
  float lip = cover(sd - 0.6 * PX) - c;
  m.col *= 1.0 - 0.18 * lip;
  m.h -= 0.08 * lip;
}

// Fire inside an opening (furnace / smoker / blast furnace)
void fireIn(inout Mat m, vec2 uv, vec2 lo, vec2 hi, float amount) {
  float c = cover(boxSD(uv, lo, hi));
  if (c <= 0.0) return;
  vec2 q = (uv - lo * PX) / ((hi - lo) * PX);
  float n = fbm(vec2(uv.x, uv.y * 0.6), vec2(10.0, 4.0), 4, 0.55, 1200.0);
  float flame = sat(1.0 - q.y * 1.3 + 0.55 * n);
  float coals = smoothstep(0.35, 0.0, q.y) * (0.6 + 0.4 * gnoise(uv * 64.0, vec2(64.0), 1201.0));
  float heat = max(flame, coals) * amount;
  vec3 fc = mix(rgb(0x7a1a04), rgb(0xff8a14), smoothstep(0.1, 0.5, heat));
  fc = mix(fc, rgb(0xfff0a0), smoothstep(0.6, 1.0, heat));
  m.col = mix(m.col, fc, c * smoothstep(0.05, 0.3, heat));
}

Mat stoneFace(vec2 uv) {
  return rock(uv, rgb(0x5f5f5f), rgb(0x777777), rgb(0x8f8f8f), rgb(0x5a5a5a), rgb(0x9a9a9a),
              vec4(6.0, 0.7, 0.04, 0.04), vec4(0.2, 0.1, 0.45, 0.0), vec4(0.82, 1.1, 26.0, 1300.0), vec4(0.9, 0.35, 0.8, 0.7));
}

float tntLetters(vec2 uv) {
  // "TNT" in 16px space: band y 6..10 (MC: white band in the middle)
  vec2 p = uv * 16.0;
  float t1 = boxMask(uv, vec2(2.0, 9.0), vec2(5.0, 10.0)) + boxMask(uv, vec2(3.0, 6.0), vec2(4.0, 9.0));
  float n = boxMask(uv, vec2(6.0, 6.0), vec2(7.0, 10.0)) + boxMask(uv, vec2(9.0, 6.0), vec2(10.0, 10.0)) +
            cover(sdSeg(uv, vec2(6.8, 9.6) * PX, vec2(9.2, 6.4) * PX) - 0.5 * PX);
  float t2 = boxMask(uv, vec2(11.0, 9.0), vec2(14.0, 10.0)) + boxMask(uv, vec2(12.0, 6.0), vec2(13.0, 9.0));
  return sat(t1 + n + t2);
}

Mat material(vec2 uv) {
  int v = uVariant;
  float part = uP[0].x;
  vec2 c = uv - 0.5;
  bool needStone = v == V_FURNACE || v == V_DISPENSER || v == V_OBSERVER || v == V_PISTON || v == V_BLAST || (v == V_SMOKER && part > 2.5) || (v == V_BREWING && part > 0.5);
  bool needMetal = v == V_BLAST || v == V_SMOKER || v == V_PISTON || v == V_SPAWNER || v == V_BREWING;
  Mat m = M(vec3(0.5), 1.0, 0.7, 0.8);
  if (needStone) m = stoneFace(uv);
  Mat met = M(vec3(0.3), 1.0, 0.8, 0.4);
  if (needMetal) met = metalSurf(uv, rgb(0x56585c), rgb(0x3a3430), vec4(0.3, 0.4, 0.45, 0.25), 1310.0);

  if (v == V_FURNACE) {
    // 0 side, 1 top, 2 front, 3 front lit
    float e = borderDist(uv);
    m.col *= 0.86 + 0.14 * bevel(e, 0.9 * PX);
    m.h *= 0.85 + 0.15 * bevel(e, 0.9 * PX);
    if (part < 0.5) {
      float band = smoothstep(13.0 * PX, 13.5 * PX, uv.y);
      m.col *= 1.0 + 0.06 * band;
    } else if (part > 1.5) {
      opening(m, uv, vec2(3.0, 2.0), vec2(13.0, 7.0), rgb(0x0c0a08));
      float lintel = boxMask(uv, vec2(2.0, 7.0), vec2(14.0, 8.5));
      m.col = mix(m.col, m.col * 1.08, lintel);
      m.h = mix(m.h, 0.9, lintel);
      opening(m, uv, vec2(5.0, 10.0), vec2(11.0, 11.5), rgb(0x141210));
      if (part > 2.5) fireIn(m, uv, vec2(3.0, 2.0), vec2(13.0, 7.0), 1.0);
    }
    return m;
  }
  if (v == V_SMOKER) {
    // 0 front, 1 side, 2 top, 3 bottom (stone)
    if (part > 2.5) return m;
    Mat w = bark(vec2(uv.x * 2.0, uv.y), rgb(0x1c140b), rgb(0x2e2112), rgb(0x3d2c18), rgb(0x57432a), rgb(0x2a1e10), rgb(0x000000),
                 vec4(9.0, 0.4, 0.0, 0.5), vec4(0.85, 1.0, 0.0, 0.0), 1320.0);
    if (part < 0.5) {
      float plate = boxMask(uv, vec2(2.0, 1.0), vec2(14.0, 9.0));
      w.col = mix(w.col, met.col, plate);
      w.h = mix(w.h, met.h, plate);
      w.r = mix(w.r, met.r, plate);
      opening(w, uv, vec2(4.0, 2.0), vec2(12.0, 7.0), rgb(0x0c0a08));
      // grate bars
      float bars = boxMask(uv, vec2(4.0, 2.0), vec2(12.0, 7.0)) * cover(abs(fract(uv.x * 16.0 / 2.0) - 0.5) * 2.0 * PX - 0.3 * PX);
      w.col = mix(w.col, met.col * 0.8, bars);
      w.h = mix(w.h, 0.5, bars);
      fireIn(w, uv, vec2(4.0, 2.0), vec2(12.0, 4.0), 0.55);
      float hood = boxMask(uv, vec2(3.0, 11.0), vec2(13.0, 14.0));
      w.col = mix(w.col, met.col * 0.9, hood);
      w.h = mix(w.h, 0.85, hood);
    } else if (part < 1.5) {
      float band = max(boxMask(uv, vec2(0.0, 12.0), vec2(16.0, 14.0)), boxMask(uv, vec2(0.0, 2.0), vec2(16.0, 4.0)));
      w.col = mix(w.col, met.col, band);
      w.h = mix(w.h, 0.9, band);
      w.r = mix(w.r, met.r, band);
    } else {
      w = met;
      float e = borderDist(uv);
      w.col *= 0.85 + 0.15 * bevel(e, 1.0 * PX);
      vec2 g = fract(uv * vec2(1.0, 6.0));
      float slot = boxMask(uv, vec2(4.0, 4.0), vec2(12.0, 12.0)) * cover(abs(g.y - 0.5) - 0.18);
      w.col = mix(w.col, rgb(0x141414), slot);
      w.h = mix(w.h, 0.2, slot);
    }
    return w;
  }
  if (v == V_BLAST) {
    // 0 front, 1 side, 2 top
    float e = borderDist(uv);
    if (part < 0.5) {
      Mat w = met;
      w.col *= 0.82 + 0.18 * bevel(e, 1.0 * PX);
      float top = boxMask(uv, vec2(0.0, 11.0), vec2(16.0, 16.0));
      w.col = mix(w.col, m.col, top);
      w.h = mix(w.h, m.h, top);
      w.r = mix(w.r, m.r, top);
      opening(w, uv, vec2(3.0, 2.0), vec2(13.0, 8.0), rgb(0x0a0908));
      fireIn(w, uv, vec2(3.0, 2.0), vec2(13.0, 4.0), 0.5);
      float bars = boxMask(uv, vec2(3.0, 2.0), vec2(13.0, 8.0)) * cover(abs(fract(uv.x * 4.0) - 0.5) / 4.0 - 0.35 * PX);
      w.col = mix(w.col, met.col * 0.9, bars);
      w.h = mix(w.h, 0.6, bars);
      return w;
    }
    if (part < 1.5) {
      m.col *= 0.86 + 0.14 * bevel(e, 0.9 * PX);
      float band = boxMask(uv, vec2(0.0, 6.0), vec2(16.0, 10.0));
      m.col = mix(m.col, met.col, band);
      m.h = mix(m.h, 0.9, band);
      m.r = mix(m.r, met.r, band);
      for (int k = 0; k < 4; k++) {
        vec2 rv = rivet(uv, vec2(2.0 + 4.0 * float(k), 8.0) * PX, 0.6 * PX);
        m.col = mix(m.col, met.col * 1.3, rv.x * rv.y);
        m.h = mix(m.h, 1.0, rv.x);
      }
      return m;
    }
    Mat w = met;
    w.col *= 0.85 + 0.15 * bevel(e, 1.0 * PX);
    vec2 g = abs(fract(uv * 4.0) - 0.5);
    float grid = max(cover(g.x - 0.08), cover(g.y - 0.08));
    float inner = boxMask(uv, vec2(2.0, 2.0), vec2(14.0, 14.0));
    w.col = mix(w.col, rgb(0x121212), inner * (1.0 - grid));
    w.h = mix(w.h, 0.25, inner * (1.0 - grid));
    return w;
  }
  if (v == V_DISPENSER) {
    // 0 dispenser front, 1 dropper front
    float e = borderDist(uv);
    m.col *= 0.86 + 0.14 * bevel(e, 0.9 * PX);
    float recess = boxMask(uv, vec2(4.0, 4.0), vec2(12.0, 12.0));
    m.h -= 0.08 * recess;
    m.col *= 1.0 - 0.06 * recess;
    if (part < 0.5) {
      float d = length(c) - 2.6 * PX;
      float hole = cover(d);
      float depth = sat(-d / (2.6 * PX));
      m.col = mix(m.col, mix(rgb(0x2a2826), rgb(0x080706), depth), hole);
      m.h = mix(m.h, 0.1, hole);
      float lip = cover(d - 0.7 * PX) - hole;
      m.col *= 1.0 - 0.25 * lip;
    } else {
      opening(m, uv, vec2(6.0, 6.5), vec2(10.0, 9.5), rgb(0x0a0908));
      float lip = boxMask(uv, vec2(5.0, 5.5), vec2(11.0, 6.5)) + boxMask(uv, vec2(5.0, 9.5), vec2(11.0, 10.5));
      m.col *= 1.0 - 0.15 * sat(lip);
    }
    return m;
  }
  if (v == V_OBSERVER) {
    // 0 front (face), 1 side, 2 back, 3 back lit
    m.col *= vec3(0.86);
    float e = borderDist(uv);
    m.col *= 0.85 + 0.15 * bevel(e, 0.9 * PX);
    if (part < 0.5) {
      opening(m, uv, vec2(3.0, 9.0), vec2(7.0, 12.0), rgb(0x0c0c0c));
      opening(m, uv, vec2(9.0, 9.0), vec2(13.0, 12.0), rgb(0x0c0c0c));
      opening(m, uv, vec2(4.0, 4.0), vec2(12.0, 6.0), rgb(0x101010));
      float brow = boxMask(uv, vec2(2.0, 12.5), vec2(14.0, 13.5));
      m.col *= 1.0 - 0.2 * brow;
    } else if (part < 1.5) {
      // recessed channel with an upward arrow (signal direction)
      float stripe = boxMask(uv, vec2(5.5, 1.0), vec2(10.5, 15.0));
      m.col = mix(m.col, rgb(0x3a3a3c) * (0.9 + 0.2 * m.h), stripe * 0.85);
      m.h = mix(m.h, 0.35, stripe);
      float shaft = boxMask(uv, vec2(7.25, 2.5), vec2(8.75, 11.0));
      float head = cover(max(abs(uv.x - 0.5) - (13.5 * PX - uv.y) * 0.9, -(uv.y - 10.0 * PX)));
      float arrow = max(shaft, head);
      m.col = mix(m.col, rgb(0xb4b4b4), arrow);
      m.h = mix(m.h, 0.6, arrow);
    } else {
      float sock = boxMask(uv, vec2(6.0, 6.0), vec2(10.0, 10.0));
      bool lit = part > 2.5;
      vec3 lamp = lit ? mix(rgb(0xff3a2a), rgb(0xffb0a0), sat(1.0 - length(c) * 8.0)) : rgb(0x3a0c0a);
      opening(m, uv, vec2(5.0, 5.0), vec2(11.0, 11.0), rgb(0x141414));
      float dot_ = cover(length(c) - 1.6 * PX);
      m.col = mix(m.col, lamp, dot_);
      m.h = mix(m.h, 0.4, dot_);
    }
    return m;
  }
  if (v == V_PISTON) {
    // 0 top (head), 1 top sticky, 2 top extended (base face with socket), 3 side, 4 bottom
    float e = borderDist(uv);
    Mat wd = planks(uv, rgb(0x7d6338), rgb(0xa2834f), rgb(0xb9975c), rgb(0x4a361c), vec4(0.12, 0.5, 0.2, 0.0), 1330.0);
    if (part < 1.5) {
      float rim = 1.0 - smoothstep(2.0 * PX - 0.004, 2.0 * PX + 0.004, e);
      Mat r = m;
      r.col *= 0.85 + 0.15 * bevel(e, 0.8 * PX);
      Mat o = mixMat(wd, r, rim);
      if (part > 0.5) {
        vec2 q = c + 0.02 * vec2(gnoise(uv * 12.0, vec2(12.0), 1331.0), gnoise(uv * 12.0, vec2(12.0), 1332.0));
        float slime = cover(sdRBox(q, vec2(4.5 * PX), 2.0 * PX));
        float dome = sqrt(sat(1.0 - dot(c, c) / (0.09)));
        vec3 sc = mix(rgb(0x4a9a3a), rgb(0x9ae07a), dome * 0.8);
        o.col = mix(o.col, sc, slime);
        o.h = mix(o.h, 0.85 + 0.12 * dome, slime);
        o.r = mix(o.r, 0.15, slime);
      }
      return o;
    }
    if (part < 2.5) {
      m.col *= 0.86 + 0.14 * bevel(e, 0.9 * PX);
      float plate = boxMask(uv, vec2(3.0, 3.0), vec2(13.0, 13.0));
      m.col = mix(m.col, met.col, plate);
      m.h = mix(m.h, met.h, plate);
      m.r = mix(m.r, met.r, plate);
      opening(m, uv, vec2(6.0, 6.0), vec2(10.0, 10.0), rgb(0x100e0c));
      float arm = boxMask(uv, vec2(6.5, 6.5), vec2(9.5, 9.5));
      m.col = mix(m.col, wd.col * 0.8, arm);
      m.h = mix(m.h, 0.5, arm);
      return m;
    }
    if (part < 3.5) {
      float head = smoothstep(12.0 * PX - 0.004, 12.0 * PX + 0.004, uv.y);
      m.col *= 0.86 + 0.14 * bevel(e, 0.9 * PX);
      // iron band and the arm channel down the middle
      float band = boxMask(uv, vec2(0.0, 6.0), vec2(16.0, 8.0));
      m.col = mix(m.col, met.col, band);
      m.h = mix(m.h, 0.88, band);
      m.r = mix(m.r, met.r, band);
      float chan = boxMask(uv, vec2(7.0, 0.0), vec2(9.0, 12.0)) * (1.0 - band);
      m.col *= 1.0 - 0.3 * chan;
      m.h -= 0.1 * chan;
      Mat o = mixMat(m, wd, head);
      float seam = cover(abs(uv.y - 12.0 * PX) - 0.3 * PX);
      o.col *= 1.0 - 0.4 * seam;
      o.h -= 0.2 * seam;
      return o;
    }
    m.col *= 0.86 + 0.14 * bevel(e, 0.9 * PX);
    float plate = boxMask(uv, vec2(4.0, 4.0), vec2(12.0, 12.0));
    m.col = mix(m.col, met.col, plate);
    m.h = mix(m.h, 0.9, plate);
    m.r = mix(m.r, met.r, plate);
    return m;
  }
  if (v == V_LAMP) {
    bool on = part > 0.5;
    vec2 g = fract(uv * 3.0) - 0.5;
    float pane = cover(sdBox(g, vec2(0.38)) / 3.0);
    float n = fbm(uv, vec2(8.0), 3, 0.5, 1340.0);
    // filament: wiggly glowing lines inside each pane
    float fil = cover((abs(g.y + 0.16 * sin(g.x * 14.0 + 1.3 + floor(uv.x * 3.0))) - 0.045) / 3.0) * pane;
    vec3 frame = on ? rgb(0xa86a2a) : rgb(0x5a3418);
    frame *= 0.85 + 0.25 * n;
    vec3 glass = on ? mix(rgb(0xffc860), rgb(0xfff4d0), sat(0.5 + 0.6 * n)) : mix(rgb(0x3a2410), rgb(0x5a3a1c), 0.5 + 0.5 * n);
    vec3 fc = on ? rgb(0xffffe8) : rgb(0x7a4a20);
    vec3 col = mix(frame, glass, pane);
    col = mix(col, fc, fil);
    float e = borderDist(uv);
    col *= 0.88 + 0.12 * bevel(e, 0.8 * PX);
    return M(col, 1.0, 0.55 + 0.3 * (1.0 - pane) + 0.05 * fil, mix(0.7, 0.15, pane));
  }
  if (v == V_TNT) {
    // 0 side, 1 top, 2 bottom
    float n = fbm(uv, vec2(6.0), 3, 0.5, 1350.0);
    if (part < 0.5) {
      float stick = abs(fract(uv.x * 4.0) - 0.5);
      vec3 red = mix(rgb(0xa82410), rgb(0xe0441a), sat(0.6 + 0.4 * n)) * (0.82 + 0.18 * smoothstep(0.5, 0.2, stick));
      float groove = cover(0.5 - stick - 0.03);
      red *= 1.0 - 0.35 * (1.0 - cover(-(0.5 - stick) + 0.035));
      float band = boxMask(uv, vec2(0.0, 5.0), vec2(16.0, 11.0));
      vec3 paper = mix(rgb(0xd8d4cc), rgb(0xf4f2ec), sat(0.5 + 0.5 * n));
      vec3 col = mix(red, paper, band);
      float letters = tntLetters(uv) * band;
      col = mix(col, rgb(0x161412), letters);
      float edge = max(boxMask(uv, vec2(0.0, 15.0), vec2(16.0, 16.0)), boxMask(uv, vec2(0.0, 0.0), vec2(16.0, 1.0)));
      col = mix(col, rgb(0x2a2420), edge * 0.8);
      float h = 0.7 + 0.2 * smoothstep(0.5, 0.15, stick) * (1.0 - band) + 0.05 * band;
      return M(col, 1.0, h, mix(0.55, 0.8, band));
    }
    vec2 g = fract(uv * 3.0) - 0.5;
    float d = length(g);
    float stickEnd = cover(d - 0.42);
    vec3 col = mix(rgb(0x2a201c), mix(rgb(0xb02a14), rgb(0xe04a24), sat(0.5 + n)), stickEnd);
    float core = cover(d - 0.22);
    col = mix(col, mix(rgb(0xc8c0b0), rgb(0xe8e0d0), n), core * 0.85);
    if (part < 1.5) {
      float fuse = cover(sdSeg(uv, vec2(0.5, 0.5), vec2(0.56, 0.6)) - 0.8 * PX) ;
      col = mix(col, rgb(0x1a1612), fuse);
    }
    return M(col, 1.0, 0.65 + 0.25 * stickEnd - 0.1 * core, 0.75);
  }
  if (v == V_ENCHANT) {
    // 0 top, 1 side, 2 bottom
    float n = fbm(uv, vec2(5.0), 4, 0.55, 1360.0);
    vec3 obs = mix(rgb(0x0e0a16), rgb(0x241a34), sat(0.5 + 0.8 * n));
    vec4 w = worley(uv, vec2(10.0), 0.9, 1361.0);
    float gem = (1.0 - smoothstep(0.08, 0.2, w.x)) * step(w.z, 0.15);
    obs = mix(obs, rgb(0x6aeee0), gem);
    float e = borderDist(uv);
    if (part > 1.5) return M(obs, 1.0, 0.75 + 0.05 * n, 0.12);
    vec3 velvet = mix(rgb(0x5a0e14), rgb(0x8a1a22), sat(0.5 + 0.7 * fbm(uv, vec2(24.0), 3, 0.5, 1362.0)));
    if (part < 0.5) {
      float cloth = smoothstep(2.0 * PX - 0.004, 2.0 * PX + 0.004, e);
      float trim = cover(abs(e - 2.5 * PX) - 0.35 * PX);
      vec3 col = mix(obs, velvet, cloth);
      col = mix(col, rgb(0xd8a82a), trim);
      vec2 q = abs(c) - vec2(4.5 * PX);
      float stud = cover(abs(q.x) + abs(q.y) - 1.2 * PX);
      col = mix(col, rgb(0x6aeee0), stud);
      return M(col, 1.0, 0.7 + 0.1 * cloth + 0.1 * stud, mix(0.12, 0.9, cloth));
    }
    // side: velvet drape over the top quarter with pointed hems and gold trim
    float hem = 12.0 * PX - 1.2 * PX * (1.0 - abs(fract(uv.x * 4.0) - 0.5) * 2.0);
    float cloth = smoothstep(hem - 0.004, hem + 0.004, uv.y);
    float trim = cover(abs(uv.y - hem) - 0.4 * PX);
    vec3 col = mix(obs, velvet, cloth);
    col = mix(col, rgb(0xd8a82a), trim);
    return M(col, 1.0, 0.7 + 0.1 * cloth, mix(0.12, 0.9, cloth));
  }
  if (v == V_BREWING) {
    // 0 stand (cutout: blaze rod + arms), 1 base (stone)
    if (part > 0.5) {
      m.col *= 1.12;
      m.h = 0.7 + 0.3 * (m.h - 0.6);
      return m;
    }
    Mat o = M(rgb(0xd09018), 0.0, 0.0, 0.5);
    float rod = cover(abs(uv.x - 0.5) - 1.0 * PX) * step(uv.y, 14.0 * PX);
    float g = gnoise(uv * vec2(8.0, 40.0), vec2(8.0, 40.0), 1371.0);
    vec3 rc = mix(rgb(0xd88a10), rgb(0xffe060), 0.5 + 0.5 * g);
    over(o, rc * (0.8 + 0.3 * sat(1.0 - abs(uv.x - 0.5) / PX)), 0.8, 0.4, rod);
    float arm1 = cover(sdSeg(uv, vec2(0.5, 0.75), vec2(0.15, 0.6)) - 0.5 * PX);
    float arm2 = cover(sdSeg(uv, vec2(0.5, 0.75), vec2(0.85, 0.6)) - 0.5 * PX);
    over(o, met.col * 1.2, 0.7, 0.4, max(arm1, arm2));
    return o;
  }
  if (v == V_SPAWNER) {
    // dark iron cage: 4x4 openings
    vec2 g = abs(fract(uv * 4.0) - 0.5);
    float bars = max(cover(g.x * 0.25 - 0.06 * 0.25 - 0.0), cover(g.y * 0.25 - 0.06 * 0.25));
    float rod = 1.0 - 2.0 * min(g.x, g.y);
    vec3 col = met.col * vec3(0.6, 0.62, 0.75) * (0.6 + 0.6 * sat(1.0 - min(g.x, g.y) / 0.08));
    float e = borderDist(uv);
    float frame = 1.0 - smoothstep(0.8 * PX, 1.0 * PX, e);
    float a = max(bars, frame);
    return M(col, a, 0.6 + 0.3 * a, 0.4);
  }
  if (v == V_END_FRAME) {
    // 0 top (eye socket), 1 side
    float n = fbm(uv, vec2(6.0), 4, 0.55, 1380.0);
    vec4 w = worley(uv, vec2(16.0), 0.9, 1381.0);
    float pit = (1.0 - smoothstep(0.1, 0.25, w.x)) * step(w.z, 0.25);
    vec3 es = mix(rgb(0xc4c88c), rgb(0xe0e2a8), sat(0.5 + 0.6 * n));
    es = mix(es, rgb(0x9a9c6a), pit * 0.6);
    vec3 teal = mix(rgb(0x2a5a50), rgb(0x3e7e6e), sat(0.5 + 0.6 * n));
    float e = borderDist(uv);
    if (part < 0.5) {
      float frame = 1.0 - smoothstep(2.5 * PX - 0.004, 2.5 * PX + 0.004, e);
      vec3 col = mix(es, teal, frame);
      float r = length(c);
      float sock = cover(r - 3.6 * PX);
      float ring = cover(abs(r - 3.9 * PX) - 0.5 * PX);
      vec3 sc = mix(rgb(0x0a2a2a), rgb(0x1a5a54), sat(1.0 - r / (3.6 * PX)) * 0.6);
      col = mix(col, teal * 1.3, ring);
      col = mix(col, sc, sock);
      float h = 0.75 + 0.05 * n - 0.4 * sock + 0.08 * frame - 0.1 * pit;
      return M(col, 1.0, sat(h), mix(0.8, 0.2, sock));
    }
    float band = smoothstep(12.0 * PX - 0.004, 12.0 * PX + 0.004, uv.y);
    vec3 col = mix(es, teal, band);
    float dots = band * cover(length(vec2(fract(uv.x * 4.0) - 0.5, (uv.y - 14.0 * PX) * 4.0)) - 0.12);
    col = mix(col, rgb(0x6ad8c0), dots * 0.7);
    float h = 0.72 + 0.05 * n + 0.1 * band - 0.1 * pit * (1.0 - band);
    return M(col, 1.0, sat(h), 0.8);
  }
  if (v == V_ENDER_CHEST) {
    float n = fbm(uv, vec2(5.0), 4, 0.55, 1390.0);
    vec3 body = mix(rgb(0x0c1414), rgb(0x1c2c2c), sat(0.5 + 0.8 * n));
    float e = borderDist(uv);
    float frame = 1.0 - smoothstep(1.0 * PX - 0.004, 1.0 * PX + 0.004, e);
    vec3 col = mix(body, rgb(0x1f5a52) * (0.8 + 0.3 * n), frame);
    float seam = cover(abs(uv.y - 10.0 * PX) - 0.4 * PX);
    col = mix(col, rgb(0x060a0a), seam);
    float latch = boxMask(uv, vec2(7.0, 8.0), vec2(9.0, 11.5));
    col = mix(col, rgb(0x2a3a3a), latch);
    float eye = cover(length((uv - vec2(8.0, 9.6) * PX) * vec2(1.0, 1.6)) - 0.7 * PX);
    col = mix(col, rgb(0x5af0c8), eye);
    float h = 0.72 + 0.08 * frame - 0.25 * seam + 0.1 * latch + 0.04 * n;
    return M(col, 1.0, sat(h), mix(0.2, 0.4, frame));
  }
  return missingTex(uv);
}
