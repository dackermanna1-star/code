// Masonry: bricks, tiles, cobble, dressed panels, sandstone, quartz, purpur and chiseled motifs.
//  uP[0]: x layout (0 bricks, 1 grid tiles, 2 panel, 3 cobble, 4 two stacked panels), y rows, z cols, w row offset
//  uP[1]: x mortar width (px/16), y bevel (px/16), z chip amount, w per-brick colour variation
//  uP[2]: x surface freq, y surface contrast, z roughness, w relief
//  uP[3]: x moss, y cracks, z motif id, w layering (sandstone strata)
//  uC: 0 dark, 1 mid, 2 light, 3 mortar, 4 speck, 5 moss
#define MOTIF_NONE 0
#define MOTIF_CHISELED_STONE 1
#define MOTIF_CHISELED_DEEPSLATE 2
#define MOTIF_CREEPER 3
#define MOTIF_SANDSTONE_SIDE 4
#define MOTIF_CUT_SANDSTONE 5
#define MOTIF_FLUTES 6
#define MOTIF_RINGS 7
#define MOTIF_REINFORCED 8
#define MOTIF_DARK_PRISMARINE 9
#define MOTIF_SANDSTONE_BOTTOM 10
#define MOTIF_QUARTZ_SIDE 11

// Surface of a single stone/clay unit. Returns colour in m.col, relief in m.h (0..1), roughness.
Mat masonSurface(vec2 uv, float salt) {
  vec3 dk = uC[0], md = uC[1], lt = uC[2];
  float f = max(1.0, uP[2].x);
  vec2 q = uv + warp(uv, 4.0, 0.02, salt);
  float layer = uP[3].w;
  vec2 fa = layer > 0.0 ? vec2(1.0, 6.0) : vec2(1.0);
  float n = fbm(q, vec2(f) * fa, 5, 0.55, salt + 1.0);
  float n2 = fbm(q, vec2(f * 3.0), 3, 0.5, salt + 2.0);
  float t = sat(0.5 + n * (0.6 + uP[2].y) + 0.25 * n2);
  vec3 col = t < 0.5 ? mix(dk, md, t * 2.0) : mix(md, lt, t * 2.0 - 1.0);
  float gf = floor(uSize * 0.5);
  float g = vnoise(uv * gf, vec2(gf), salt + 3.0) - 0.5;
  col *= 1.0 + g * 0.1;
  vec4 w = worley(q, vec2(24.0), 0.9, salt + 4.0);
  float sp = (1.0 - smoothstep(0.15, 0.3, w.x)) * step(w.z, 0.12);
  float pit = (1.0 - smoothstep(0.1, 0.22, w.x)) * step(0.95, w.z);
  col = mix(col, uC[4], sp * 0.8);
  col = mix(col, dk * 0.6, pit * 0.6);
  float h = 0.5 + 0.3 * n + 0.12 * n2 + 0.05 * g - 0.3 * pit;
  return M(col, 1.0, sat(h), uP[2].z + 0.05 * n2);
}

// Distance (uv units, + inside) to the edge of the unit (brick/tile/panel) and its id/local coords.
struct Unit { float e; float id; vec2 lp; vec2 sz; };
Unit layoutUnit(vec2 uv, int kind) {
  Unit u;
  float rows = max(1.0, uP[0].y), cols = max(1.0, uP[0].z);
  if (kind == 4) { rows = 2.0; cols = 1.0; }
  if (kind == 2) { rows = 1.0; cols = 1.0; }
  float row = floor(uv.y * rows);
  float sh = (kind == 0) ? mod(row, 2.0) * uP[0].w : 0.0;
  float x = uv.x * cols + sh;
  float col = floor(x);
  u.lp = vec2(fract(x), fract(uv.y * rows));
  u.sz = vec2(1.0 / cols, 1.0 / rows);
  vec2 p = (u.lp - 0.5) * u.sz;
  float mort = uP[1].x * PX * 0.5;
  u.e = -sdRBox(p, u.sz * 0.5 - mort, mort * 0.4 + 0.12 * PX);
  u.id = h1(vec2(mod(col, cols), row), 900.0);
  return u;
}

float creeper(vec2 p) {
  // classic creeper face on an 8x8 grid, p in grid units (0..8, y down)
  vec2 c = floor(p);
  if (c.x < 0.0 || c.y < 0.0 || c.x > 7.0 || c.y > 7.0) return 0.0;
  bool eye = (c.y >= 2.0 && c.y <= 3.0) && ((c.x >= 1.0 && c.x <= 2.0) || (c.x >= 5.0 && c.x <= 6.0));
  bool mouthC = (c.x >= 3.0 && c.x <= 4.0) && (c.y >= 4.0 && c.y <= 6.0);
  bool mouthS = (c.y >= 5.0 && c.y <= 7.0) && (c.x == 2.0 || c.x == 5.0);
  return (eye || mouthC || mouthS) ? 1.0 : 0.0;
}

Mat material(vec2 uv) {
  if (uVariant != V_MASONRY) return missingTex(uv);
  int kind = int(uP[0].x + 0.5);
  int motif = int(uP[3].z + 0.5);
  float salt = 100.0;
  Mat s = masonSurface(uv, salt);
  vec3 col = s.col;
  float h = s.h;
  float rough = s.r;
  float relief = uP[2].w;
  float e;
  float id = 0.0;
  vec2 lp = uv;

  if (kind == 5) {
    // plain dressed surface, no units
    e = 1.0;
    h = 0.62 + relief * 0.3 * (s.h - 0.5);
  } else if (kind == 3) {
    // cobble: irregular rounded stones with dark gaps
    vec2 q = uv + warp(uv, 4.0, 0.045, salt + 10.0);
    float cells = max(2.0, uP[0].y);
    vec4 v = voronoi(q, vec2(cells), 0.95, salt + 11.0);
    e = v.x / cells - uP[1].x * PX * 0.5;
    id = v.y;
    float dome = bevel(e, 0.09 + 0.05 * id);
    vec3 tone = mix(uC[0], uC[2], fract(id * 7.31));
    col = mix(col, col * tone / max(uC[1], vec3(0.02)), 0.55);
    h = 0.25 + 0.55 * dome + relief * 0.15 * (s.h - 0.5);
  } else {
    Unit u = layoutUnit(uv, kind);
    float chip = uP[1].z * 0.012 * (fbm(uv, vec2(20.0), 3, 0.5, salt + 12.0) + 0.3);
    e = u.e + min(chip, 0.0) * step(0.0, u.e);
    id = u.id;
    lp = u.lp;
    float bw = max(uP[1].y, 0.3) * PX;
    float b = bevel(e, bw);
    col *= 1.0 + uP[1].w * (id - 0.5);
    h = mix(0.3, 0.72 + relief * 0.25 * (s.h - 0.5), b);
    col *= 0.85 + 0.15 * b;
  }
  // mortar / gaps
  float mortar = 1.0 - cover(-e);
  if (uP[1].x > 0.0) {
    float mn = fbm(uv, vec2(24.0), 3, 0.5, salt + 13.0);
    vec3 mc = uC[3] * (0.9 + 0.2 * mn);
    col = mix(col, mc, mortar);
    h = mix(h, 0.18 + 0.06 * mn, mortar);
    rough = mix(rough, 0.92, mortar);
  }

  // ---- motifs
  vec2 c = uv - 0.5;
  if (motif == MOTIF_CHISELED_STONE) {
    float band = step(13.0 / 16.0, uv.y) + step(uv.y, 3.0 / 16.0);
    float ring = abs(length(c - vec2(0.0, 0.0)) - 0.2) - 0.035;
    float groove = cover(ring) * (1.0 - band);
    float inner = cover(length(c) - 0.12) * (1.0 - band);
    float frame = cover(abs(c.y) - 5.0 / 16.0) ;
    float seam = cover(abs(abs(c.y) - 5.0 / 16.0) - 0.008);
    col = mix(col, col * 0.55, groove);
    h = h - groove * 0.25 + inner * 0.04;
    col = mix(col, uC[3], seam * 0.9);
    h -= seam * 0.25;
  } else if (motif == MOTIF_CHISELED_DEEPSLATE) {
    float d = max(abs(c.x), abs(c.y));
    float g1 = cover(abs(d - 0.36) - 0.025);
    float g2 = cover(abs(d - 0.2) - 0.025);
    float bridge = step(abs(c.x - 0.1), 0.04) * step(c.y, 0.0);
    float g = max(g1, g2 * (1.0 - bridge));
    float core = cover(d - 0.07);
    col = mix(col, uC[3], g * 0.9);
    h = h - g * 0.3 + core * 0.05;
  } else if (motif == MOTIF_CREEPER) {
    float band = step(12.0 / 16.0, uv.y) + step(uv.y, 4.0 / 16.0);
    vec2 fp = (vec2(uv.x, 1.0 - uv.y) - vec2(4.0, 4.0) / 16.0) * 16.0;
    float cr = creeper(fp) * (1.0 - band);
    float seam = cover(abs(abs(uv.y - 0.5) - 4.0 / 16.0) - 0.006);
    col = mix(col, uC[0] * 0.7, cr);
    h = h - cr * 0.3;
    col = mix(col, uC[0] * 0.8, seam * 0.8);
    h -= seam * 0.2;
    // carved recess of the middle band
    float mid = 1.0 - band;
    h -= mid * 0.04;
  } else if (motif == MOTIF_SANDSTONE_SIDE) {
    // light cap band on top with a darker line under it, darker base band
    float cap = smoothstep(12.0 / 16.0, 12.5 / 16.0, uv.y);
    float line = cover(abs(uv.y - 11.7 / 16.0) - 0.012 - 0.006 * gnoise(uv * 32.0, vec2(32.0), 14.0));
    float base = 1.0 - smoothstep(1.5 / 16.0, 2.5 / 16.0, uv.y);
    col = mix(col, uC[2] * 1.04, cap * 0.7);
    col = mix(col, uC[0] * 0.8, line * 0.85);
    col = mix(col, uC[0] * 0.92, base * 0.5);
    h = h + cap * 0.06 - line * 0.18;
  } else if (motif == MOTIF_SANDSTONE_BOTTOM) {
    vec4 v = voronoi(uv + warp(uv, 5.0, 0.03, 15.0), vec2(3.0), 0.9, 16.0);
    float cr = (1.0 - smoothstep(0.0, 0.035, v.x)) * smoothstep(0.1, 0.3, fbm(uv, vec2(3.0), 2, 0.5, 17.0));
    col = mix(col, uC[0] * 0.75, cr * 0.7);
    h -= cr * 0.2;
  } else if (motif == MOTIF_CUT_SANDSTONE) {
    float seam = cover(abs(uv.y - 0.5) - 0.012);
    float topL = smoothstep(14.5 / 16.0, 15.0 / 16.0, uv.y);
    col = mix(col, uC[0] * 0.82, seam);
    col = mix(col, uC[2], topL * 0.4);
    h -= seam * 0.25;
  } else if (motif == MOTIF_FLUTES) {
    float fl = cos(uv.x * TAU * 4.0);
    col *= 0.94 + 0.06 * fl;
    h += 0.05 * fl;
    float side = 1.0 - smoothstep(0.03, 0.06, min(uv.x, 1.0 - uv.x));
    col *= 1.0 - 0.15 * side;
    h -= 0.12 * side;
  } else if (motif == MOTIF_RINGS) {
    float d = max(abs(c.x), abs(c.y));
    float r1 = cover(abs(d - 0.3) - 0.012);
    float r2 = cover(abs(d - 0.18) - 0.01);
    float r = max(r1, r2 * 0.8);
    col *= 1.0 - 0.2 * r;
    h -= 0.15 * r;
  } else if (motif == MOTIF_REINFORCED) {
    float d = max(abs(c.x), abs(c.y));
    float frame = smoothstep(0.31, 0.32, d);
    vec3 fc = rgb(0x8f9393) * (0.9 + 0.2 * s.h);
    float fb = bevel(0.5 - d, 0.04) * bevel(d - 0.32, 0.03);
    col = mix(col, fc, frame);
    h = mix(h, 0.6 + 0.35 * fb, frame);
    rough = mix(rough, 0.6, frame);
    // corner studs
    vec2 cc = abs(c) - vec2(0.41);
    float stud = cover(length(cc) - 0.045);
    col = mix(col, rgb(0x5a6062), stud);
    h = mix(h, 0.98, stud);
    // core: dark sculk-like slate with faint teal veins
    float vein = 1.0 - smoothstep(0.0, 0.02, abs(fbm(uv, vec2(5.0), 3, 0.5, 18.0)));
    col = mix(col, rgb(0x1f6b74) * 0.6, vein * (1.0 - frame) * 0.5);
  } else if (motif == MOTIF_DARK_PRISMARINE) {
    float lx = cover(abs(uv.x - 0.5) - 0.012);
    float ly = cover(abs(uv.y - 0.5) - 0.012);
    float ln = max(lx * step(0.5, uv.y), ly);
    col = mix(col, uC[3], ln);
    h -= ln * 0.25;
  } else if (motif == MOTIF_QUARTZ_SIDE) {
    float st = fbm(uv, vec2(2.0, 12.0), 3, 0.5, 19.0);
    col *= 0.98 + 0.03 * st;
  }

  // ---- moss
  if (uP[3].x > 0.0) {
    float mn = fbm(uv + warp(uv, 6.0, 0.03, salt + 20.0), vec2(5.0), 5, 0.6, salt + 21.0);
    float low = 1.0 - smoothstep(0.25, 0.6, h);
    float mo = smoothstep(0.55, 0.75, mn * 0.9 + uP[3].x * 0.5 + low * 0.35 + 0.1);
    float tuft = gnoise(uv * 96.0, vec2(96.0), salt + 22.0);
    vec3 mc = mix(uC[5] * 0.7, uC[5] * 1.25, sat(0.5 + tuft * 0.8));
    col = mix(col, mc, mo);
    h = mix(h, max(h, 0.45) + 0.05 + 0.04 * tuft, mo);
    rough = mix(rough, 0.95, mo);
  }
  // ---- cracks
  if (uP[3].y > 0.0) {
    vec2 q = uv + warp(uv, 6.0, 0.03, salt + 23.0);
    vec4 v = voronoi(q, vec2(3.0), 0.9, salt + 24.0);
    float msk = smoothstep(0.1, 0.35, fbm(uv, vec2(2.0), 3, 0.5, salt + 25.0) + uP[3].y * 0.5 - 0.3);
    float cr = (1.0 - smoothstep(0.0, 0.03 + 0.02 * uP[3].y, v.x)) * msk;
    col = mix(col, uC[3] * 0.5, cr * 0.9);
    h -= cr * 0.35;
  }
  return M(col, 1.0, sat(h), sat(rough));
}
