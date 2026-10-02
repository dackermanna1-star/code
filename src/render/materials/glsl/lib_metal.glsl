// ---------------------------------------------------------------------------------------------
// Metal library: brushed / worn metal surfaces, panel bevels and rivets.
// ---------------------------------------------------------------------------------------------

/**
 * Metal surface.
 *  col base colour, tc tarnish / patina colour
 *  p: x brushing 0..1, y scratches 0..1, z base roughness, w tarnish amount
 */
Mat metalSurf(vec2 uv, vec3 col, vec3 tc, vec4 p, float salt) {
  float br = gnoise(uv * vec2(3.0, 160.0), vec2(3.0, 160.0), salt);
  float br2 = gnoise(uv * vec2(6.0, 320.0), vec2(6.0, 320.0), salt + 1.0);
  float n = fbm(uv, vec2(4.0), 4, 0.5, salt + 2.0);
  // scratches: thin streaks along two lattice-aligned diagonals (keeps them tileable)
  float s1 = 1.0 - abs(gnoise(vec2((uv.x - uv.y) * 90.0, (uv.x + uv.y) * 3.0), vec2(90.0, 3.0), salt + 3.0));
  float s2 = 1.0 - abs(gnoise(vec2((uv.x + 2.0 * uv.y) * 70.0, (2.0 * uv.x - uv.y) * 2.0), vec2(70.0, 2.0), salt + 4.0));
  float scr = (smoothstep(0.96, 1.0, s1) * step(0.2, fbm(uv, vec2(3.0), 2, 0.5, salt + 5.0)) +
               smoothstep(0.97, 1.0, s2) * step(0.3, fbm(uv, vec2(3.0), 2, 0.5, salt + 6.0))) * p.y;
  vec3 c = col * (1.0 + p.x * (0.06 * br + 0.04 * br2) + 0.06 * n);
  c = mix(c, col * 1.15, sat(scr));
  // tarnish blotches
  float tn = smoothstep(0.1, 0.5, fbm(uv, vec2(5.0), 4, 0.55, salt + 7.0)) * p.w;
  c = mix(c, tc, tn);
  float h = 0.8 + 0.02 * n - 0.03 * sat(scr) + 0.01 * br * p.x;
  float r = p.z + 0.08 * tn + 0.06 * p.x * br2 - 0.05 * sat(scr) + 0.04 * n;
  return M(c, 1.0, sat(h), sat(r));
}

/** Panel frame: returns (bevel height factor 0..1, frame mask) for a frame of width fw (uv) with bevel bw. */
vec2 panelFrame(vec2 uv, float fw, float bw) {
  float e = borderDist(uv);
  float outer = bevel(e, bw);
  float inner = smoothstep(fw - 0.004, fw + 0.004, e);
  return vec2(outer, 1.0 - inner);
}

/** Rivet dome at c with radius r: returns (coverage, dome). */
vec2 rivet(vec2 p, vec2 c, float r) {
  float d = length(p - c);
  return vec2(cover(d - r), sqrt(sat(1.0 - (d / r) * (d / r))));
}
