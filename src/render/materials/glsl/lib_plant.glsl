// ---------------------------------------------------------------------------------------------
// Plant library: a small data-driven "element" renderer for alpha-cut plant cards. A plant is a
// list of elements (blades, leaves, stems, discs, petal rings, fronds, ears, caps, floret balls)
// produced by a per-family `element(variant, i)` function and drawn in order (later = on top).
// Every primitive is inlined once per program, which keeps compile times low.
// ---------------------------------------------------------------------------------------------
#define E_NONE 0
#define E_BLADE 1
#define E_LEAF 2
#define E_STEM 3
#define E_DISC 4
#define E_PETALS 5
#define E_FROND 6
#define E_EAR 7
#define E_CAP 8
#define E_BALL 9
#define E_SPIKE 10

struct El { int t; vec2 a; vec2 b; float w; float w2; float n; vec3 c1; vec3 c2; };

El el(int t, vec2 a, vec2 b, float w, float w2, float n, vec3 c1, vec3 c2) {
  El e; e.t = t; e.a = a; e.b = b; e.w = w; e.w2 = w2; e.n = n; e.c1 = c1; e.c2 = c2; return e;
}
El elNone() { return el(E_NONE, vec2(0.0), vec2(0.0), 0.0, 0.0, 0.0, vec3(0.0), vec3(0.0)); }

/** Per-element random number in [0,1). */
float er(int i, float k) { return h1(vec2(float(i) * 7.0 + k, 13.0 + k * 3.0), 500.0); }

/** Lens-shaped leaf from a (base) to b (tip): returns (sd, t, s normalised, hw). */
vec4 leafSD(vec2 p, vec2 a, vec2 b, float w, float shape) {
  vec2 ab = b - a;
  float len = max(length(ab), 1e-4);
  vec2 dir = ab / len;
  vec2 d = p - a;
  float t = dot(d, dir) / len;
  float s = dot(d, vec2(-dir.y, dir.x));
  float tt = clamp(t, 0.0, 1.0);
  float hw = w * pow(max(sin(PI * pow(tt, shape)), 0.0), 0.7);
  float sd = abs(s) - hw;
  if (t < 0.0) sd = max(sd, -t * len);
  if (t > 1.0) sd = max(sd, (t - 1.0) * len);
  return vec4(sd, t, s / max(hw, 1e-5), hw);
}

void leafPaint(inout Mat m, float c, float t, float s, vec3 c1, vec3 c2, float hb) {
  float rib = 1.0 - smoothstep(0.0, 0.14, abs(s));
  float veins = smoothstep(0.75, 1.0, sin((t * 7.0 - abs(s) * 2.2) * PI));
  vec3 col = mix(c2, c1, sat(t * 1.2)) * (0.8 + 0.25 * (1.0 - s * s)) * (1.0 + 0.15 * rib) * (1.0 - 0.08 * veins);
  float h = hb + 0.12 * (1.0 - s * s) + 0.03 * rib;
  over(m, col, h, 0.55, c);
}

void drawEl(inout Mat m, vec2 p, El e, float hb) {
  if (e.t == E_BLADE) {
    // vertical-ish blade: base a, tip b (bends quadratically towards b.x)
    float hgt = e.b.y - e.a.y;
    float t = (p.y - e.a.y) / hgt;
    if (t < -0.02 || t > 1.0) return;
    t = max(t, 0.0);
    float cx = e.a.x + (e.b.x - e.a.x) * t * t;
    float slope = 2.0 * (e.b.x - e.a.x) * t / hgt;
    float hw = e.w * pow(1.0 - t, 0.75);
    float dx = (p.x - cx) / sqrt(1.0 + slope * slope);
    float c = cover(abs(dx) - hw);
    if (c <= 0.0) return;
    float s = dx / max(hw, 1e-5);
    float fold = sign(s) * (1.0 - abs(s));
    vec3 col = mix(e.c2, e.c1, sat(t * 1.3)) * (0.85 + 0.2 * fold * sign(e.b.x - e.a.x + 1e-4) + 0.1 * (1.0 - abs(s)));
    over(m, col, hb + 0.1 * (1.0 - s * s), 0.6, c);
  } else if (e.t == E_LEAF) {
    vec4 L = leafSD(p, e.a, e.b, e.w, e.w2 > 0.0 ? e.w2 : 0.8);
    float c = cover(L.x);
    if (c <= 0.0) return;
    leafPaint(m, c, L.y, L.z, e.c1, e.c2, hb);
  } else if (e.t == E_STEM) {
    vec2 pa = p - e.a, ba = e.b - e.a;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float w = mix(e.w, e.w2, t);
    float dd = length(pa - ba * t);
    float c = cover(dd - w);
    if (c <= 0.0) return;
    float s = dd / max(w, 1e-5);
    float cyl = sqrt(sat(1.0 - s * s));
    vec3 col = mix(e.c2, e.c1, t) * (0.7 + 0.4 * cyl);
    if (e.n > 0.0) col *= 0.85 + 0.15 * smoothstep(0.3, 0.6, abs(fract(t * e.n) - 0.5) * 2.0);
    over(m, col, hb + 0.15 * cyl, 0.6, c);
  } else if (e.t == E_DISC) {
    vec2 d = (p - e.a) / vec2(e.w, e.w2);
    float r = length(d);
    float c = cover((r - 1.0) * min(e.w, e.w2));
    if (c <= 0.0) return;
    float dome = sqrt(sat(1.0 - r * r));
    vec3 col = mix(e.c1, e.c2, sat(r * r));
    if (e.n > 0.5) {
      // seed / floret texture
      float sp = gnoise(p * 128.0, vec2(128.0), 510.0);
      col *= 0.8 + 0.3 * smoothstep(-0.2, 0.4, sp);
    }
    col *= 0.75 + 0.35 * dome;
    over(m, col, hb + 0.12 * dome, 0.55, c);
  } else if (e.t == E_PETALS) {
    vec2 d = p - e.a;
    float r = length(d);
    float n = max(e.n, 1.0);
    float ang = atan(d.y, d.x) - e.b.x;
    float sector = TAU / n;
    float a = mod(ang + sector * 0.5, sector) - sector * 0.5;
    float pid = floor((ang + sector * 0.5) / sector);
    vec2 q = vec2(cos(a), sin(a)) * r;
    float len = e.w * (0.85 + 0.3 * h1(vec2(mod(pid, n), 3.0), 520.0));
    float sd = sdEllipse(q - vec2(len * 0.5, 0.0), vec2(len * 0.5, e.w2));
    float c = cover(sd);
    if (c <= 0.0) return;
    float t = sat(r / len);
    float s = q.y / max(e.w2, 1e-5);
    vec3 col = mix(e.c2, e.c1, smoothstep(0.0, 0.7, t)) * (0.82 + 0.22 * (1.0 - s * s));
    col *= 0.92 + 0.12 * h1(vec2(mod(pid, n), 5.0), 521.0);
    over(m, col, hb + 0.1 * (1.0 - t) + 0.05 * (1.0 - s * s), 0.55, c);
  } else if (e.t == E_FROND) {
    // curved rachis from a to b (bend = w2 along the normal) with paired leaflets (n pairs),
    // leaflet length w at the base tapering towards the tip
    vec2 ab = e.b - e.a;
    float len = max(length(ab), 1e-4);
    vec2 dir = ab / len;
    vec2 nrm = vec2(-dir.y, dir.x);
    float bend = e.w2;
    float t0 = clamp(dot(p - e.a, dir) / len, 0.0, 1.0);
    vec2 cpt = e.a + dir * t0 * len + nrm * bend * t0 * t0;
    vec2 tang = normalize(dir * len + nrm * 2.0 * bend * t0);
    vec2 tn = vec2(-tang.y, tang.x);
    float side = dot(p - cpt, tn) >= 0.0 ? 1.0 : -1.0;
    float cR = cover(length(p - cpt) - max(0.004, 0.009 * (1.0 - t0)));
    float n = max(e.n, 1.0);
    float jc = floor(t0 * n);
    float best = 9.0, bt = 0.0, bs = 0.0;
    for (int k = -1; k <= 1; k++) {
      float j = jc + float(k);
      if (j < 0.0 || j >= n) continue;
      float tj = (j + 0.5) / n;
      vec2 pj = e.a + dir * tj * len + nrm * bend * tj * tj;
      vec2 tgj = normalize(dir * len + nrm * 2.0 * bend * tj);
      vec2 tnj = vec2(-tgj.y, tgj.x);
      float L = e.w * (1.0 - 0.7 * tj);
      vec2 tip = pj + normalize(tnj * side + tgj * 0.75) * L;
      vec4 Ls = leafSD(p, pj, tip, L * 0.3, 0.7);
      if (Ls.x < best) { best = Ls.x; bt = Ls.y; bs = Ls.z; }
    }
    float cL = cover(best);
    if (max(cR, cL) <= 0.0) return;
    if (cL > 0.0) leafPaint(m, cL, bt, bs, e.c1, e.c2, hb);
    over(m, e.c2 * 0.9, hb + 0.08, 0.6, cR);
  } else if (e.t == E_EAR) {
    // grain ear (wheat): alternating kernels along a spike from a to b, kernel count n, half width w
    vec2 ab = e.b - e.a;
    float len = max(length(ab), 1e-4);
    vec2 dir = ab / len;
    vec2 nrm = vec2(-dir.y, dir.x);
    float t = dot(p - e.a, dir) / len;
    if (t < -0.1 || t > 1.4) return;
    float n = max(e.n, 2.0);
    float jc = floor(t * n);
    float best = 9.0, bj = 0.0, bd = 0.0;
    float awn = 9.0;
    for (int k = -1; k <= 1; k++) {
      float j = jc + float(k);
      if (j < 0.0 || j >= n) continue;
      float side = mod(j, 2.0) * 2.0 - 1.0;
      float tj = (j + 0.5) / n;
      vec2 kc = e.a + dir * tj * len + nrm * side * e.w * 0.4;
      vec2 kdir = normalize(dir + nrm * side * 0.45);
      vec2 q = p - kc;
      vec2 ql = vec2(dot(q, kdir), dot(q, vec2(-kdir.y, kdir.x)));
      float kr = len / n * 0.95;
      float sd = sdEllipse(ql, vec2(kr, e.w * 0.48));
      if (sd < best) { best = sd; bj = j; bd = length(ql / vec2(kr, e.w * 0.48)); }
      // awn: thin bristle from the kernel tip
      vec2 at = kc + kdir * kr;
      awn = min(awn, sdSeg(p, at, at + normalize(dir + nrm * side * 0.25) * len * 0.45));
    }
    float c = cover(best);
    float ca = cover(awn - 0.0012) * 0.8;
    if (max(c, ca) <= 0.0) return;
    float sh = 0.72 + 0.38 * sqrt(sat(1.0 - bd * bd));
    vec3 col = mix(e.c2, e.c1, 0.4 + 0.6 * h1(vec2(bj, 1.0), 530.0)) * sh;
    over(m, e.c1 * 0.9, hb + 0.05, 0.6, ca * (1.0 - c));
    over(m, col, hb + 0.12 * sh, 0.6, c);
  } else if (e.t == E_CAP) {
    // mushroom cap: half ellipse dome (centre a = base centre of cap), half width w, height w2
    vec2 d = p - e.a;
    float sd = sdEllipse(d, vec2(e.w, e.w2));
    float under = smoothstep(0.0, -0.15 * e.w2, d.y);
    sd = max(sd, -d.y - 0.12 * e.w2);
    float c = cover(sd);
    if (c <= 0.0) return;
    float r = length(d / vec2(e.w, e.w2));
    float dome = sqrt(sat(1.0 - r * r));
    vec3 col = e.c1 * (0.65 + 0.45 * dome) * (1.0 - 0.4 * under);
    if (e.n > 0.0) {
      vec4 w = worley(p, vec2(e.n), 0.85, 540.0);
      float spot = (1.0 - smoothstep(0.18, 0.3, w.x)) * step(w.z, 0.6) * step(-0.05 * e.w2, d.y);
      col = mix(col, e.c2 * (0.8 + 0.3 * dome), spot);
    }
    over(m, col, hb + 0.2 * dome, 0.5, c);
  } else if (e.t == E_BALL) {
    // spherical floret cluster (allium, lilac, berries cluster) centre a, radii w/w2, floret count n
    vec2 d = (p - e.a) / vec2(e.w, e.w2);
    float r = length(d);
    float edgeN = 0.08 * gnoise(p * 60.0, vec2(60.0), 550.0);
    float c = cover((r - 1.0 - edgeN) * min(e.w, e.w2));
    if (c <= 0.0) return;
    vec4 w = worley(p, vec2(max(e.n, 4.0)), 0.9, 551.0);
    float fl = 1.0 - smoothstep(0.2, 0.55, w.x);
    float dome = sqrt(sat(1.0 - r * r));
    vec3 col = mix(e.c2, e.c1, fl) * (0.6 + 0.5 * dome) * (0.85 + 0.3 * w.z);
    over(m, col, hb + 0.15 * dome + 0.05 * fl, 0.55, c);
  } else if (e.t == E_SPIKE) {
    // crystal / flame spike: tapered from a (base, half width w) to b (tip)
    vec4 L = leafSD(p, e.a, e.b, e.w, 0.25);
    float c = cover(L.x);
    if (c <= 0.0) return;
    float s = L.z;
    float facet = s > 0.0 ? 1.0 : 0.72;
    vec3 col = mix(e.c2, e.c1, sat(L.y)) * facet * (0.85 + 0.2 * (1.0 - abs(s)));
    over(m, col, hb + 0.15 * (1.0 - abs(s)), 0.3, c);
  }
}

/** Grass blade tuft: n blades rooted along the bottom; tall = max height (uv). Used by grasses and tufts. */
El grassBlade(int i, float n, float tall, float spread, vec3 c1, vec3 c2, float yoff) {
  float fi = float(i);
  float x0 = 0.5 + spread * (er(i, 1.0) - 0.5) * 2.0 * 0.5 + 0.06 * (er(i, 9.0) - 0.5);
  float hgt = tall * (0.45 + 0.55 * er(i, 2.0));
  float lean = (x0 - 0.5) * 0.9 + 0.25 * (er(i, 3.0) - 0.5);
  float w = 0.018 + 0.016 * er(i, 4.0);
  float sh = 0.75 + 0.45 * er(i, 5.0);
  return el(E_BLADE, vec2(x0, -0.02 - yoff), vec2(x0 + lean * hgt, hgt - yoff), w, 0.0, 0.0, c1 * sh, c2 * sh);
}
