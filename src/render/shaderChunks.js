// Shared GLSL. All world shaders (voxels, terrain, glass, signs, particles, sky) use the same
// lighting and fog code so the atmosphere is coherent.

export const MAX_LIGHTS = 24

export const commonUniformsGLSL = /* glsl */ `
uniform float uTime;
uniform float uGameMinutes;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uIndoorAmb;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uLitFraction;
uniform float uStreetOn;
uniform float uNight;
uniform float uSnowCover;
uniform vec3 uFogColor;
uniform vec3 uFogHorizon;
uniform vec3 uFogGlow;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uScatter;
uniform float uWhiteout;
uniform vec2 uWhiteoutCenter;
uniform int uNumLights;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform vec4 uLightDir[${MAX_LIGHTS}];
uniform vec4 uLightParam[${MAX_LIGHTS}];
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform float uFlashOn;
`

export const hashGLSL = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
  float e = hash13(i + vec3(0,0,1)), f2 = hash13(i + vec3(1,0,1)), g = hash13(i + vec3(0,1,1)), h = hash13(i + vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f2,u.x), mix(g,h,u.x), u.y), u.z);
}
`

// Lighting: point/spot lights with smooth windowed falloff, domain masks (outdoor/indoor),
// optional Blinn specular for glossy surfaces, plus the player's flashlight.
export const lightingGLSL = /* glsl */ `
vec3 evalLights(vec3 P, vec3 N, float domain, vec3 V, float gloss, float wrap, inout vec3 spec) {
  vec3 sum = vec3(0.0);
  float shin = mix(6.0, 220.0, gloss);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNumLights) break;
    vec4 lc = uLightCol[i];
    float dm = lc.w;
    if (dm < 2.5 && abs(dm - domain) > 0.5) continue;
    vec4 lp = uLightPos[i];
    vec3 L = lp.xyz - P;
    float d2 = dot(L, L);
    float r = lp.w;
    if (d2 > r * r) continue;
    float d = sqrt(d2);
    L /= max(d, 1e-4);
    float q = d / r; q = q * q; q = clamp(1.0 - q * q, 0.0, 1.0);
    float att = q * q / (d2 + 1.0);
    vec4 ld = uLightDir[i];
    if (ld.w > -1.5) {
      float cd = dot(-L, ld.xyz);
      att *= smoothstep(ld.w, uLightParam[i].x, cd);
    }
    float ndl = (dot(N, L) + wrap) / (1.0 + wrap);
    ndl = max(ndl, 0.0);
    sum += lc.rgb * att * ndl;
    if (gloss > 0.0) {
      vec3 H = normalize(L + V);
      spec += lc.rgb * att * pow(max(dot(N, H), 0.0), shin) * gloss * (shin * 0.04 + 0.5);
    }
  }
  if (uFlashOn > 0.0) {
    vec3 L = uFlashPos - P; float d2 = dot(L, L); float d = sqrt(d2); L /= max(d, 1e-4);
    float cd = dot(-L, uFlashDir);
    float cone = smoothstep(0.82, 0.97, cd);
    float att = cone * 4.0 / (d2 + 0.6) * clamp(1.0 - d / 22.0, 0.0, 1.0);
    sum += vec3(0.95, 0.97, 1.0) * att * max(dot(N, L), 0.0) * uFlashOn;
  }
  return sum;
}
`

// Exponential height fog with analytic single scattering from the nearest lights.
export const fogGLSL = /* glsl */ `
vec3 fogSky(vec3 rd) {
  float hz = 1.0 - clamp(rd.y * 2.2 + 0.05, 0.0, 1.0);
  vec3 c = mix(uFogColor, uFogHorizon, pow(hz, 2.2));
  c += uFogGlow * pow(hz, 6.0);
  return c;
}

float fogAmount(vec3 ro, vec3 rd, float dist) {
  float k = uFogFalloff;
  float a = uFogDensity * exp(-k * (ro.y - uFogBase));
  float ky = k * rd.y;
  float f = abs(ky) > 1e-4 ? a * (1.0 - exp(-ky * dist)) / ky : a * dist;
  // whiteout band at the world edge
  return f;
}

vec3 lampScatter(vec3 ro, vec3 rd, float dist) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNumLights) break;
    vec4 lp = uLightPos[i];
    vec4 prm = uLightParam[i];
    if (prm.y <= 0.0) continue;
    vec3 rel = lp.xyz - ro;
    float tp = dot(rel, rd);
    vec3 cp = rel - rd * tp;
    float h2 = dot(cp, cp) + 0.04;
    float h = sqrt(h2);
    float integ = (atan((dist - tp) / h) - atan(-tp / h)) / h;
    // spot lights: weight by cone at closest point
    vec4 ld = uLightDir[i];
    float w = 1.0;
    if (ld.w > -1.5) {
      vec3 cpw = ro + rd * clamp(tp, 0.0, dist);
      vec3 Ld = normalize(cpw - lp.xyz);
      w = smoothstep(ld.w - 0.25, prm.x, dot(Ld, ld.xyz)) * 0.85 + 0.15;
    }
    s += uLightCol[i].rgb * integ * prm.y * w;
  }
  return s;
}

vec3 applyFog(vec3 col, vec3 P) {
  vec3 ro = cameraPosition;
  vec3 rd = P - ro;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  float fa = fogAmount(ro, rd, dist);
  // whiteout near the world edge: extra uniform fog proportional to distance
  fa += uWhiteout * dist * 0.06;
  float tr = exp(-fa);
  vec3 fc = fogSky(rd);
  fc = mix(fc, uFogHorizon * 1.15 + vec3(0.02), clamp(uWhiteout, 0.0, 1.0) * 0.6);
  // lamp in-scattering is added once per pixel by the ScatterPass (post), not per surface
  return col * tr + fc * (1.0 - tr);
}
`

// Window shading: procedural lit apartments with parallax "interior mapping" — each pane opens
// onto a fake room (wallpaper, ceiling lamp, wall carpet, wardrobe, TV glow) that shifts with
// the viewing angle. wid = window id (extra byte), seed = instance seed, uvC = pane uv (0..1),
// sizeVox = pane size in voxels (mesher u,v), dir = face direction, viewL = model-space vector
// from the fragment to the camera.
export const windowGLSL = /* glsl */ `
vec3 shadeWindow(float wid, float seed, vec2 uvC, vec2 sizeVox, float dir, vec3 viewL, float vs, vec3 N, vec3 V, float emisScale, out float litOut) {
  float h1 = hash12(vec2(seed * 917.13, wid * 13.17));
  float epoch = floor(uGameMinutes / 11.0 + h1 * 37.0);
  float h2 = hash12(vec2(seed * 311.7 + epoch * 1.37, wid * 7.71));
  float lit = step(h2, uLitFraction);
  litOut = lit;
  float t = hash12(vec2(seed * 53.3, wid * 3.31 + 0.5));
  vec3 lc; float tv = 0.0; float kitchen = 0.0;
  if (t < 0.48) lc = vec3(1.0, 0.60, 0.28);                   // incandescent
  else if (t < 0.62) lc = vec3(1.0, 0.70, 0.42);              // warm shade
  else if (t < 0.74) { lc = vec3(0.80, 0.93, 1.0); kitchen = 1.0; } // fluorescent kitchen
  else if (t < 0.85) { lc = vec3(0.48, 0.60, 1.0); tv = 1.0; } // only the TV is on
  else lc = vec3(1.0, 0.52, 0.22);                            // dim lamp, orange shade

  // pane frame in model space
  vec3 hA; vec2 hv; vec2 sz;
  if (dir < 1.5) { hA = vec3(0.0, 0.0, 1.0); hv = vec2(uvC.y, uvC.x); sz = vec2(sizeVox.y, sizeVox.x) * vs; }
  else { hA = vec3(1.0, 0.0, 0.0); hv = uvC; sz = sizeVox * vs; }
  vec3 nL = dir < 0.5 ? vec3(1.0, 0.0, 0.0) : dir < 1.5 ? vec3(-1.0, 0.0, 0.0) : dir < 4.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
  vec3 rdL = -normalize(viewL);
  vec3 rd = vec3(dot(rdL, hA), rdL.y, -dot(rdL, nL));
  rd = sign(rd + 1e-6) * max(abs(rd), vec3(1e-4));
  vec3 ro = vec3(hv * sz, 0.0);
  float hr = hash12(vec2(seed * 19.0 + 3.0, wid));
  float depth = 3.0 + hr * 1.8;
  vec3 bmin = vec3(-0.9 - hr * 0.9, -0.85, 0.0);
  vec3 bmax = vec3(sz.x + 0.9 + fract(hr * 7.3) * 0.9, sz.y + 0.32, depth);
  vec3 tt = (mix(bmin, bmax, step(0.0, rd)) - ro) / rd;
  float tm = min(min(tt.x, tt.y), tt.z);
  vec3 p = ro + rd * tm;

  float hw = hash12(vec2(seed * 7.0, wid * 1.7));
  vec3 paper = hw < 0.3 ? vec3(0.56, 0.47, 0.32) : hw < 0.55 ? vec3(0.42, 0.48, 0.37) : hw < 0.78 ? vec3(0.54, 0.43, 0.40) : vec3(0.42, 0.45, 0.53);
  if (kitchen > 0.5) paper = vec3(0.64, 0.64, 0.6);
  vec3 base;
  float face;
  if (tm == tt.z) { base = paper; face = 0.0; }
  else if (tm == tt.y) {
    if (rd.y > 0.0) { base = vec3(0.78, 0.76, 0.71); face = 3.0; }
    else { base = vec3(0.30, 0.20, 0.13); face = 2.0; }
  } else { base = paper * 0.88; face = 1.0; }
  if (face < 1.5) {
    vec2 w2 = face < 0.5 ? p.xy : p.zy;
    base *= 0.93 + 0.07 * step(0.5, fract(w2.x * 4.0 + step(0.5, fract(w2.y * 3.0)) * 0.5));
  }
  // a carpet hanging on one side wall
  float carpetRight = step(0.5, hash12(vec2(seed + 0.3, wid * 5.1)));
  if (face == 1.0 && kitchen < 0.5 && (rd.x > 0.0 ? 1.0 : 0.0) == carpetRight && p.y > 0.1 && p.y < sz.y + 0.05 && p.z > 0.5 && p.z < depth - 0.5) {
    vec2 q = vec2(p.z, p.y) * 5.0;
    vec2 f = fract(q * 0.5) - 0.5;
    float pat = 0.8 + 0.2 * step(0.18, abs(f.x) + abs(f.y)) - 0.15 * step(0.42, max(abs(f.x), abs(f.y)));
    base = vec3(0.46, 0.13, 0.10) * pat;
  }
  // wardrobe / shelf silhouette on the back wall
  if (face == 0.0) {
    float wx = bmin.x + 0.2 + hr * max(0.1, bmax.x - bmin.x - 1.6);
    if (p.x > wx && p.x < wx + 1.2 && p.y < bmin.y + 2.05) base = kitchen > 0.5 ? vec3(0.62, 0.6, 0.55) : vec3(0.22, 0.14, 0.09);
  }
  // interior lighting
  vec3 lpos = vec3((bmin.x + bmax.x) * 0.5, bmax.y - 0.4, depth * 0.45);
  vec3 dl = p - lpos;
  float li = 0.38 + 1.3 / (1.0 + dot(dl, dl) * 0.35);
  if (face == 3.0) li += 0.6 * exp(-dot(p.xz - lpos.xz, p.xz - lpos.xz) * 2.5);
  if (tv > 0.5) {
    vec3 tpos = vec3(bmin.x + 0.5 + hr, bmin.y + 0.75, depth * 0.8);
    vec3 dt = p - tpos;
    float fl = 0.5 + 0.5 * vnoise2(vec2(uTime * 6.0 + wid, seed * 50.0));
    li = (0.1 + 1.1 / (1.0 + dot(dt, dt) * 0.7)) * (0.45 + 0.8 * fl);
  }
  li *= mix(0.6, 1.2, hash12(vec2(wid, seed * 7.0)));
  // someone crossing the room (rare)
  float cross = step(0.985, hash12(vec2(floor(uTime / 23.0 + h1 * 9.0), wid + seed * 101.0)));
  if (cross > 0.5 && face == 0.0) {
    float sx = mix(bmin.x, bmax.x, fract(uTime / 23.0 + h1 * 9.0) * 1.4 - 0.2);
    li *= 1.0 - 0.8 * smoothstep(0.35, 0.2, abs(p.x - sx)) * step(p.y, bmin.y + 1.75);
  }
  vec3 room = base * lc * li * emisScale;
  // curtains at the sides and tulle across the glass
  float hcur = hash12(vec2(wid * 3.0, seed));
  float cw = 0.08 + 0.2 * hcur;
  float curtain = max(smoothstep(cw, cw - 0.06, hv.x), smoothstep(1.0 - cw, 1.0 - cw + 0.06, hv.x));
  vec3 curtCol = (hcur < 0.4 ? vec3(0.8, 0.5, 0.25) : hcur < 0.7 ? vec3(0.65, 0.25, 0.2) : vec3(0.5, 0.55, 0.35)) * lc * 0.55 * emisScale;
  float tulle = (0.25 + 0.1 * sin(hv.x * 70.0 + hcur * 9.0)) * step(0.35, hw);
  room = mix(room, lc * 0.45 * emisScale, tulle);
  room = mix(room, curtCol, curtain * 0.9);
  // unlit: barely visible furniture lit by the street, mostly reflection
  vec3 dark = base * (uSkyAmb + uGroundAmb) * 0.5 + curtain * 0.005;
  vec3 interior = mix(dark, room, lit);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 refl = fogSky(reflect(-V, N)) * (0.07 + 0.5 * fres);
  return interior + refl * mix(1.0, 0.25, lit);
}
`
