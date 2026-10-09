// The city's materials:
//  - buildingMaterial: the kit's faces. A photo layer per vertex, tinted, painted or flat, with grime,
//    neon tubes and uplit walls that glow at night - and the windows, drawn by the shader from each
//    facade's window spec (kind, floor height, bay width): punched windows with frames and sills,
//    curtain walls with mullions and spandrels, ribbon windows, glass block, portholes, shopfronts,
//    lobbies and rolling shutters. Behind every pane is a room (interior mapping: back wall, side
//    walls, floor and ceiling at the right depth for where you look from), some with curtains or
//    blinds, and at night a share of them are lit.
//  - signs: every sign's words drawn once into one canvas atlas; neon tubes (unlit, glowing at night
//    with a halo) and painted panels (lit like a wall).
//  - murals: big procedural pictures for Wynwood's walls (an atlas too).
import * as THREE from 'three';
import { TBN_GLSL } from '../world/surface.js';
import { TEX_LAYER, TEX_KEYS, texAvg } from '../world/textures.js';
import { rng } from '../../outbreak/noise.js';

/** Uniforms shared by every city material (set by City.update). */
export const CITY_U = {
  night: { value: 0 },   // street lights / windows / neon on (sky.state.lamps)
  dayL: { value: 1 },    // how much daylight (sky.state.light)
  uTime: { value: 0 },
  dbg: { value: 0 },     // debug views: 1 no normal maps, 2 no room light, 3 no env (metal 0)
};

const FRAG_HEAD = `
precision highp sampler2DArray;
uniform sampler2DArray tCol, tNor; uniform sampler2D noiseT;
uniform float night, dayL, uTime, wet, dbg;
uniform float layAvg[32];
varying vec4 vLay; varying vec4 vTint; varying vec4 vWin; varying vec2 vUv2; varying vec3 vWp; varying vec3 vWn;
vec3 bN; vec3 eGlow; float gR; float gM;
${TBN_GLSL}
float hsh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 pal(float h) { return 0.62 + 0.3 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }
// a box mask with soft (anti-aliased) edges
float boxm(vec2 p, vec4 r, vec2 fw) {
  vec2 a = smoothstep(r.xy - fw, r.xy + fw, p), b = 1.0 - smoothstep(r.zw - fw, r.zw + fw, p);
  return a.x * a.y * b.x * b.y;
}
// the room behind a pane: p (studs, in the cell), cell size cs, depth D, view direction d (x along, y up, z in)
vec3 room(vec2 p, vec2 cs, float D, vec3 d, float h, float lit, vec3 lc, int style, float aa) {
  vec3 o = vec3(p, 0.0);
  vec3 tq = (vec3(d.x > 0.0 ? cs.x : 0.0, d.y > 0.0 ? cs.y : 0.0, D) - o) / d;
  float t = min(min(tq.x, tq.y), tq.z);
  vec3 q = o + d * t;
  vec3 wallC = mix(vec3(0.78, 0.74, 0.66), pal(h * 7.3), 0.28);
  vec3 c;
  if (t == tq.z) {
    c = wallC;
    if (style == 1) { // a shop: shelves of colourful things on the back wall
      float sh = step(0.5, fract(q.y / 2.2)) * step(0.15, fract(q.x / 3.1));
      vec3 goods = pal(hsh(floor(q.xy / vec2(3.1, 2.2)) + h)); goods = mix(vec3(dot(goods, vec3(0.33))), goods, 1.8);
      c = mix(wallC * 0.9, goods, mix(sh, 0.4, aa) * 0.9);
    } else if (style == 2) { // an office: a partition, a window to the next room
      c = mix(wallC, vec3(0.35, 0.38, 0.42), step(cs.y * 0.62, q.y) * 0.5);
    } else {
      c *= 0.92 + 0.08 * mix(step(0.5, fract(q.x / 7.0 + h)), 0.5, aa); // a picture or a door
    }
  } else if (t == tq.y) {
    c = d.y > 0.0 ? vec3(0.86, 0.85, 0.82) : mix(vec3(0.42, 0.3, 0.2), vec3(0.5, 0.5, 0.52), step(0.5, h));
  } else {
    c = wallC * 0.82;
    if (style == 1) { // shelves down the side walls too
      float sh = step(0.5, fract(q.y / 2.2)) * step(0.2, fract(q.z / 3.1));
      vec3 goods = pal(hsh(floor(q.zy / vec2(3.1, 2.2)) + h + 7.0)); goods = mix(vec3(dot(goods, vec3(0.33))), goods, 1.8);
      c = mix(wallC * 0.5, goods * 0.8, mix(sh, 0.4, aa) * 0.9);
    }
  }
  c *= mix(1.0, 0.55, q.z / D);
  // the light: ceiling lamps when lit (brightest near the top), else the dim daylight inside
  float up = q.y / cs.y;
  vec3 L = lc * lit * (0.35 + 0.55 * up * up) + vec3(0.42, 0.45, 0.5) * dayL * 0.3 * (1.0 - night);
  return c * L;
}
`;

const MAP_FRAG = `{
  float L = floor(vLay.x + 0.5), pp = floor(vLay.y + 0.5);
  int pat = int(mod(pp, 16.0)); float grime = floor(pp / 16.0) / 15.0;
  float sc = max(vLay.w, 1.0);
  vec2 tuv = vUv2 / sc;
  vec3 tc = texture(tCol, vec3(tuv, L)).rgb;
  bN = texture(tNor, vec3(tuv, L)).xyz * 2.0 - 1.0;
  vec3 tint = vTint.rgb;
  float glow = vTint.a;
  float lum = dot(tc, vec3(0.299, 0.587, 0.114));
  vec3 col;
  gR = vLay.z / 255.0; gM = 0.0; eGlow = vec3(0.0);
  float gy = vWp.y - 3.0;                       // height above the street
  float vert = 1.0 - abs(vWn.y);
  // paint and flat colour: the tint's own colour, shaded by the photo (its brightness over the layer's average)
  float shade = clamp(lum / max(layAvg[int(L)], 0.02), 0.35, 1.7);
  if (pat == 4 || pat == 7) { col = tint * mix(1.0, shade, 0.5); bN = mix(vec3(0.0, 0.0, 1.0), bN, 0.55); }
  else if (pat == 5) { col = tint * mix(1.0, shade, 0.15); bN = mix(vec3(0.0, 0.0, 1.0), bN, 0.2); }
  else if (pat == 6) { col = tint * 0.55; bN = vec3(0.0, 0.0, 1.0); gR = 0.3; eGlow = tint * glow * (0.25 + 4.5 * night); }
  else if (pat == 8) { col = tint; bN = vec3(0.0, 0.0, 1.0); gR = 0.06; gM = 0.9; }
  else if (pat == 9) { col = tint * mix(1.0, shade, 0.45); gM = 0.8; bN = mix(vec3(0.0, 0.0, 1.0), bN, 0.4); }
  else if (pat == 10) {
    // chain-link: a diamond mesh you can see through
    vec2 q = vec2(vUv2.x + vUv2.y, vUv2.x - vUv2.y) * 0.9;
    vec2 g = abs(fract(q) - 0.5); float wire = 1.0 - smoothstep(0.06, 0.12, min(g.x, g.y));
    float fwq = length(fwidth(q));
    if (fwq > 0.35) wire = step(hsh(floor(gl_FragCoord.xy)), 0.35); // far: a screen door
    if (wire < 0.5) discard;
    col = tint * mix(1.0, shade, 0.3); gM = 0.7; gR = 0.5; bN = vec3(0.0, 0.0, 1.0);
  }
  else col = tc * tint;
  if (pat == 7) eGlow += col * glow * night * (0.05 + 0.4 * (1.0 - smoothstep(0.0, 36.0, gy)));
  else if (glow > 0.0 && pat != 6) eGlow += col * glow * night * 0.9;
  // grime: streaks down the walls and patches
  if (grime > 0.0) {
    float g1 = texture(noiseT, vWp.xz / 53.0 + vWp.y / 131.0).r, g2 = texture(noiseT, vec2(vWp.x + vWp.z, vWp.y * 0.2) / 29.0).g;
    col *= 1.0 - grime * (smoothstep(0.5, 0.9, g1) * 0.3 + smoothstep(0.55, 0.92, g2) * 0.22 * vert);
  }
  // a little darker at the foot of walls (bounce light is less down there)
  col *= mix(1.0, mix(0.72, 1.0, smoothstep(0.0, 3.5, gy)), vert);

  // ---- windows ----
  float code = floor(vWin.x + 0.5);
  if (code > 0.5 && vert > 0.6) {
    int kind = int(mod(code, 16.0)); float variant = mod(floor(code / 16.0), 16.0); int gk = int(floor(code / 256.0));
    float fh = max(vWin.y / 64.0, 1.0), bw = max(vWin.z / 64.0, 1.0);
    float wseed = floor(vWin.w + 0.5); // (interpolation wobbles: round before hashing)
    float seed = mod(wseed, 4096.0), occ = floor(wseed / 4096.0) / 15.0;
    vec2 uv = vUv2;
    vec3 N = normalize(vWn), Rt = normalize(vec3(N.z, 0.0, -N.x));
    vec3 Vd = normalize(vWp - cameraPosition);
    vec3 d = vec3(dot(Vd, Rt), Vd.y, -dot(Vd, N)); d.z = max(d.z, 0.06);
    float fres = pow(1.0 - clamp(-dot(Vd, N), 0.0, 1.0), 2.0);
    bool gfl = uv.y < 0.0 && gk > 0;
    vec2 cs; vec4 R; vec2 fp; vec2 cell; float D; int style = 0;
    vec3 glass = vec3(0.1, 0.12, 0.14); float gMet = 0.55; float frameW = 0.0; vec3 frameC = col;
    float litF = occ; vec3 lc = vec3(1.0, 0.78, 0.5);
    float pane = 0.0, recess = 1.0, opaqueGlass = 0.0, sb = bw;
    if (gfl) {
      // ---- the ground floor ----
      float g = max(gy - uv.y, 2.0);                      // its height
      sb = bw < 9.0 ? bw * 2.0 : bw;
      cs = vec2(sb, g); cell = vec2(floor(uv.x / sb), -1.0); fp = vec2(mod(uv.x, sb), gy);
      D = 16.0; style = 1;
      if (gk == 2 || gk == 5) { R = vec4(0.55, 1.1, sb - 0.55, g - 3.0); frameW = 0.35; frameC = vec3(0.16, 0.17, 0.18); litF = 0.85; lc = vec3(1.0, 0.92, 0.78); gMet = 0.12; glass = vec3(0.03, 0.035, 0.04); }
      else if (gk == 3) { R = vec4(0.5, 0.25, sb - 0.5, g - 0.8); frameW = 0.3; frameC = vec3(0.7, 0.72, 0.74); litF = 0.95; D = 28.0; style = 2; lc = vec3(1.0, 0.86, 0.66); gMet = 0.15; glass = vec3(0.03, 0.035, 0.04); }
      else if (gk == 4) { R = vec4(0.7, 0.0, sb - 0.7, g - 2.4); frameW = 0.45; frameC = vec3(0.3, 0.31, 0.32); litF = 0.5; }
      else if (gk == 6) { R = vec4(1.0, 0.0, sb - 1.0, min(g - 1.0, 11.0)); frameW = 0.4; frameC = col * 0.8; litF = 0.0; }
      else R = vec4(-1.0);
      if (gk == 5) { col *= 0.7; }
    } else {
      cs = vec2(bw, fh);
      vec2 st = uv / cs; cell = floor(st); fp = fract(st) * cs;
      D = bw * 0.8 + 6.0;
      float ww, wh, sill;
      if (kind == 1 || kind == 8) {
        ww = bw * mix(0.38, 0.6, fract(variant * 0.37 + 0.1)); wh = fh * mix(0.48, 0.62, fract(variant * 0.61 + 0.3)); sill = fh * 0.26;
        R = vec4((bw - ww) * 0.5, sill, (bw + ww) * 0.5, sill + wh); frameW = 0.32; frameC = mix(col, vec3(0.95, 0.94, 0.9), 0.65);
        recess = 0.5;
      } else if (kind == 2) {
        R = vec4(0.14, fh * 0.2, bw - 0.14, fh - 0.1); glass = tint; gMet = 0.92; frameW = 0.14; frameC = tint * 0.5 + 0.08;
        style = 2; litF = occ; lc = vec3(0.86, 0.92, 1.0); col = tint * 0.55;
      } else if (kind == 9) {
        R = vec4(0.4, fh * 0.34, bw - 0.4, fh - 0.5); glass = mix(vec3(0.12, 0.16, 0.2), tint, 0.4); gMet = 0.85; frameW = 0.3; frameC = col * 0.7;
        style = 2; lc = vec3(0.9, 0.95, 1.0);
      } else if (kind == 3) {
        R = vec4(-0.1, fh * 0.3, bw + 0.1, fh * 0.8); frameW = 0.0; glass = vec3(0.12, 0.16, 0.19); gMet = 0.7;
      } else if (kind == 4) {
        R = vec4(0.25, fh * 0.1, bw - 0.25, fh - 1.1); glass = mix(vec3(0.1, 0.14, 0.16), tint, 0.35); gMet = 0.8; frameW = 0.18; frameC = vec3(0.75);
      } else if (kind == 5) {
        R = vec4(0.0, 0.0, bw, fh); opaqueGlass = 1.0;
      } else if (kind == 6) {
        R = vec4(-1.0); recess = 0.6;
      } else if (kind == 7) {
        R = vec4(0.5, fh * 0.72, bw - 0.5, fh * 0.9); frameW = 0.25; frameC = col * 0.6; glass = vec3(0.16, 0.18, 0.2); litF = occ * 0.6; lc = vec3(0.9, 0.95, 1.0);
      } else R = vec4(-1.0);
    }
    vec2 fw = max(fwidth(uv), vec2(1e-3));
    float cellPix = max(fw.x / cs.x, fw.y / cs.y);
    float far = smoothstep(0.2, 0.6, cellPix);
    if (kind == 6 && !gfl) {
      float r = min(bw, fh) * 0.2; vec2 c0 = vec2(bw * 0.5, fh * 0.55);
      float dd = length(fp - c0);
      pane = 1.0 - smoothstep(r - fw.x, r + fw.x, dd);
      float ring = (1.0 - smoothstep(r + 0.35 - fw.x, r + 0.35 + fw.x, dd)) * (1.0 - pane);
      col = mix(col, vec3(0.95), ring);
      if (ring > 0.0) bN.xy += normalize(fp - c0 + 1e-4) * ring * 0.6;
    } else if (R.x > -0.5) {
      pane = boxm(fp, R, fw);
      if (frameW > 0.0) {
        float fr = boxm(fp, R + vec4(-frameW, -frameW, frameW, frameW), fw) - pane;
        col = mix(col, frameC, fr * (1.0 - far));
        // bevel: the frame catches the light on its upper and outer edges
        vec2 cc = (R.xy + R.zw) * 0.5, hs = (R.zw - R.xy) * 0.5;
        vec2 rel = (fp - cc) / max(hs, vec2(0.1));
        bN.xy += fr * (1.0 - far) * vec2(sign(rel.x) * step(abs(rel.y) * hs.y, abs(rel.x) * hs.x), sign(rel.y) * step(abs(rel.x) * hs.x, abs(rel.y) * hs.y)) * 0.7;
        // a sill under punched windows
        if (kind == 1 || kind == 8) {
          float sl = boxm(fp, vec4(R.x - 0.6, R.y - frameW - 0.45, R.z + 0.6, R.y - frameW), fw) * (1.0 - far);
          col = mix(col, vec3(0.93, 0.92, 0.88), sl); bN = mix(bN, vec3(0.0, 0.75, 0.66), sl);
          // shutters either side
          if (kind == 8) {
            float shw = (R.z - R.x) * 0.5;
            float sh = boxm(fp, vec4(R.x - frameW - shw, R.y, R.x - frameW, R.w), fw) + boxm(fp, vec4(R.z + frameW, R.y, R.z + frameW + shw, R.w), fw);
            vec3 shc = mix(tint * 0.45, vec3(0.2, 0.42, 0.36), 0.5 + 0.5 * sin(seed));
            col = mix(col, shc * (0.85 + 0.15 * step(0.5, fract(fp.y * 1.5))), sh * (1.0 - far));
          }
        }
      }
      // shopfronts and lobbies: a mullion down the middle and a transom bar
      if (gfl && (gk == 2 || gk == 3 || gk == 5)) {
        float bar = 0.0;
        if (sb > 11.0) bar = max(bar, 1.0 - smoothstep(0.12, 0.12 + fw.x * 1.5, abs(fp.x - sb * 0.5)));
        bar = max(bar, 1.0 - smoothstep(0.12, 0.12 + fw.y * 1.5, abs(fp.y - (R.w - 2.4))));
        bar *= pane * (1.0 - far);
        col = mix(col, frameC, bar); pane *= 1.0 - bar;
      }
      // the far LOD: windows melt into an even tone
      float area = (R.z - R.x) * (R.w - R.y) / (cs.x * cs.y);
      pane = mix(pane, clamp(area, 0.0, 1.0) * 0.85, far);
    }
    if (pane > 0.001) {
      float h = hsh(cell + vec2(seed * 0.173, dot(N.xz, vec2(17.1, 31.7))));
      float h2 = hsh(cell.yx * 1.37 + seed * 0.71 + 3.1);
      // lit rooms: offices by whole floors and runs, homes window by window
      float on = step(h, litF);
      if (style == 2 && !gfl) on = step(hsh(vec2(cell.y, seed + floor(cell.x / 4.0))), litF) * step(0.15, h);
      on = mix(on, litF, far);
      vec3 lcol = lc * mix(vec3(1.0), vec3(1.05, 0.95, 0.8), h2);
      if (h2 > 0.82 && style == 0) lcol = vec3(0.55, 0.7, 1.0); // a television
      vec3 rc;
      if (opaqueGlass > 0.5) {
        // glass block: a grid of thick bricks that glow through
        vec2 gb = fract(fp / 0.9); float m = smoothstep(0.0, 0.12, min(min(gb.x, gb.y), min(1.0 - gb.x, 1.0 - gb.y)));
        col = mix(vec3(0.82, 0.86, 0.85), vec3(0.62, 0.72, 0.74), m); bN.xy += (gb - 0.5) * m * 0.5;
        eGlow += vec3(1.0, 0.85, 0.6) * m * night * 0.9 * on;
        gR = 0.25; pane = 0.0;
      } else {
        float aa = smoothstep(0.03, 0.12, cellPix);
        rc = room(fp, cs, D, d, h, on * (gfl ? max(night, 0.45) : night), lcol, style, aa);
        // curtains (homes) or blinds (offices) behind some panes
        float cur = 0.0;
        if (style == 0 && h2 > 0.45) { float cw = (R.z - R.x) * (0.18 + 0.3 * fract(h2 * 7.0)); cur = max(1.0 - step(R.x + cw, fp.x), step(R.z - cw, fp.x)); }
        if (style == 2 && h2 > 0.5) { float bl = R.w - (R.w - R.y) * fract(h2 * 3.7); cur = step(bl, fp.y) * (0.75 + 0.25 * mix(step(0.5, fract(fp.y * 2.0)), 0.5, smoothstep(0.15, 0.5, fw.y * 2.0))); }
        vec3 curC = mix(vec3(0.85, 0.82, 0.74), pal(h2 * 3.0), 0.3);
        if (dbg < 4.5 || dbg > 5.5) rc = mix(rc, curC * (lcol * on * night * 0.9 + vec3(0.5) * dayL * 0.5), cur * (1.0 - far));
        float top = smoothstep(R.w - 1.2, R.w, fp.y) * recess * (1.0 - far); // the lintel's shadow
        vec3 gcol = glass * (1.0 - top * 0.5);
        col = mix(col, gcol, pane);
        gR = mix(gR, 0.05 + 0.05 * h2, pane);
        gM = mix(gM, gMet, pane);
        bN = mix(bN, vec3((h2 - 0.5) * 0.04, (h - 0.5) * 0.03, 1.0), pane);
        if (dbg > 3.5 && dbg < 4.5) rc = vec3(0.3);
        eGlow += rc * pane * (1.0 - fres * 0.85) * (1.0 - top * 0.6);
      }
    }
  }
  diffuseColor.rgb *= col;
}`;

/** The material for the kit's faces (see the top of this file). tex: viceTextures(); shared uniforms in CITY_U. */
export function buildingMaterial(tex, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const avg = new Array(32).fill(0.3);
  TEX_KEYS.forEach((k, i) => { const c = texAvg(k); avg[i] = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; });
  const uni = { tCol: tex.col, tNor: tex.nor, noiseT: { value: grimeTex() }, wet: { value: 0 }, layAvg: { value: avg }, ...CITY_U };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 lay; attribute vec4 tint; attribute vec4 win;\nvarying vec4 vLay; varying vec4 vTint; varying vec4 vWin; varying vec2 vUv2; varying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLay = lay; vTint = tint; vWin = win; vUv2 = uv;
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWn = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', MAP_FRAG)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(gR, gR * 0.4, wet);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = dbg > 2.5 ? 0.0 : gM;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ mat3 tbn = vcTBN(normal, -vViewPosition, vUv2); if (dbg < 0.5 || dbg > 1.5) normal = normalize(tbn * vec3(bN.xy * 0.75, max(bN.z, 0.2))); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += dbg > 1.5 && dbg < 2.5 ? vec3(0.0) : eGlow;');
  };
  mat.customProgramCacheKey = () => 'vc-bld' + (o.key || '');
  mat.userData.uni = uni;
  return mat;
}

/** A small tileable value-noise texture for the grime (r, g: two octave mixes), cheap to make. */
let _grime = null;
function grimeTex() {
  if (_grime) return _grime;
  const N = 128, d = new Uint8Array(N * N * 4), r = rng(77);
  const grid = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = r(); return g; };
  const oct = [[4, grid(4)], [8, grid(8)], [16, grid(16)], [32, grid(32)]];
  const sample = (n, g, x, y) => {
    const fx = (x / N) * n, fy = (y / N) * n, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const s = (a, b) => g[((b % n) + n) % n * n + ((a % n) + n) % n];
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (s(i, j) * (1 - su) + s(i + 1, j) * su) * (1 - sv) + (s(i, j + 1) * (1 - su) + s(i + 1, j + 1) * su) * sv;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = sample(4, oct[0][1], x, y) * 0.5 + sample(8, oct[1][1], x, y) * 0.3 + sample(16, oct[2][1], x, y) * 0.2;
    const b = sample(8, oct[1][1], x + 37, y + 11) * 0.4 + sample(16, oct[2][1], x, y) * 0.3 + sample(32, oct[3][1], x, y) * 0.3;
    const k = (y * N + x) * 4; d[k] = a * 255; d[k + 1] = b * 255; d[k + 2] = 128; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (_grime = t);
}

/** A BufferGeometry from the kit's arrays. */
export function kitGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 4, true));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setAttribute('lay', new THREE.BufferAttribute(a.lay, 4, false));
  g.setAttribute('tint', new THREE.BufferAttribute(a.tint, 4, true));
  g.setAttribute('win', new THREE.BufferAttribute(a.win, 4, false));
  g.setIndex(new THREE.BufferAttribute(a.nv > 65535 ? a.idx : new Uint16Array(a.idx), 1));
  g.computeBoundingSphere();
  return g;
}

// ---- signs ---------------------------------------------------------------------------------------------------------
const FONTS = {
  script: (px) => `italic 700 ${px}px "Brush Script MT", "Snell Roundhand", "Segoe Script", "URW Chancery L", "Z003", cursive`,
  deco: (px) => `700 ${px}px Futura, "Century Gothic", "Avenir Next", "Trebuchet MS", "DejaVu Sans", sans-serif`,
  block: (px) => `900 ${px}px "Arial Black", Impact, "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`,
  serif: (px) => `700 ${px}px "Didot", "Bodoni 72", Georgia, "DejaVu Serif", serif`,
  sans: (px) => `700 ${px}px "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif`,
};
// styles: neon (script tubes), neonDeco (caps tubes), neonV (vertical caps), letters (metal letters, faint glow),
// box (lit box sign: panel + text), paint (painted panel), plus a few named ones
const STY = {
  neon: { kind: 1, font: 'script' },
  neonDeco: { kind: 1, font: 'deco' },
  neonV: { kind: 1, font: 'deco', vertical: true },
  letters: { kind: 2, font: 'deco' },
  lettersV: { kind: 2, font: 'deco', vertical: true },
  box: { kind: 0, font: 'sans', bg: '#f6f1e4', fg: '#1d2a44', glow: 0.8 },
  paint: { kind: 0, font: 'sans', bg: '#2a2f38', fg: '#f4efe0', glow: 0 },
  shop: { kind: 0, font: 'block', bg: '#c8322a', fg: '#fff6e0', glow: 0.5 },
  havana: { kind: 0, font: 'serif', bg: '#f3e6c4', fg: '#7a1f1a', glow: 0.35, border: '#7a1f1a' },
  police: { kind: 0, font: 'block', bg: '#14306e', fg: '#ffffff', glow: 0.9, border: '#e0e6f4' },
  hospital: { kind: 0, font: 'sans', bg: '#ffffff', fg: '#b3141c', glow: 0.9, border: '#b3141c' },
  ammu: { kind: 0, font: 'block', bg: '#141414', fg: '#e8382a', glow: 1, border: '#e8382a' },
  spray: { kind: 0, font: 'block', bg: '#2a7fd4', fg: '#ffffff', glow: 1, border: '#ffd23a' },
  arena: { kind: 1, font: 'deco' },
  plate: { kind: 0, font: 'serif', bg: '#d8cdb4', fg: '#3a3226', glow: 0, border: '#6a5e48' },
  billboard: { kind: 0, font: 'block', glow: 0.9 },
};
export const SIGN_STYLES = Object.keys(STY);

/**
 * Every sign's words drawn once into one canvas, and the meshes for them.
 * Neon and metal-letter signs store the letters' tube in R and the glow around them in G (coloured by the
 * sign); painted signs store their colours. The canvas is black where nothing is drawn.
 */
export class SignAtlas {
  constructor(signs) {
    this.entries = new Map();
    const W = 2048, H0 = 112;
    let x = 0, y = 0;
    for (const s of signs) {
      const st = STY[s.style] || STY.paint;
      const key = s.style + '|' + s.text + '|' + (s.bg || '') + '|' + (s.fg || '');
      if (this.entries.has(key)) { s.key = key; continue; }
      const vertical = st.vertical;
      const asp = vertical ? s.h / Math.max(0.1, s.w) : s.w / Math.max(0.1, s.h);
      const rh = vertical ? Math.min(W, Math.round(H0 * 0.75 * Math.max(1, asp))) : H0;
      const rw = vertical ? Math.round(H0 * 0.75) : Math.min(W, Math.round(H0 * asp));
      // vertical signs are packed as columns in their own rows
      if (x + rw > W) { x = 0; y += this._rowH || H0; this._rowH = 0; }
      this.entries.set(key, { s, st, rect: [x, y, rw, rh], vertical });
      this._rowH = Math.max(this._rowH || 0, rh + 6);
      x += rw + 6;
      s.key = key;
    }
    const H = Math.min(4096, Math.pow(2, Math.ceil(Math.log2(Math.max(64, y + (this._rowH || H0) + 4)))));
    this.W = W; this.H = H;
    const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!cv) return;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const e of this.entries.values()) this._draw(g, e);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex = tex;
  }

  _draw(g, e) {
    const { s, st, rect: [rx, ry, rw, rh] } = e;
    g.save();
    g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
    const text = s.text;
    if (st.kind === 0) {
      // a painted (or lit box) panel
      const bg = s.bg || st.bg || '#222', fg = s.fg || st.fg || '#fff';
      g.fillStyle = bg; g.fillRect(rx, ry, rw, rh);
      if (st.border) { g.strokeStyle = st.border; g.lineWidth = 5; g.strokeRect(rx + 7, ry + 7, rw - 14, rh - 14); }
      g.fillStyle = fg;
      fitText(g, text, rx, ry, rw, rh, FONTS[s.font || st.font] || FONTS.sans, 0.62, e.vertical);
    } else {
      // tubes (R) and their glow (G)
      const font = FONTS[s.font || st.font] || FONTS.deco;
      g.globalCompositeOperation = 'lighter';
      if (st.kind === 1) {
        g.shadowColor = '#00ff00'; g.shadowBlur = rh * 0.16; g.fillStyle = '#00a000';
        fitText(g, text, rx, ry, rw, rh, font, 0.6, e.vertical, true);
        g.shadowBlur = 0; g.shadowColor = 'transparent';
      }
      g.fillStyle = '#ff0000';
      fitText(g, text, rx, ry, rw, rh, font, 0.6, e.vertical, true);
      if (st.kind === 1) {
        // the tube's bright core
        g.fillStyle = '#ff0000'; g.globalAlpha = 1;
      }
    }
    g.restore();
  }

  /** UV rectangle [u0, v0, u1, v1] of a sign. */
  uv(s) {
    const e = this.entries.get(s.key), [x, y, w, h] = e.rect;
    return [x / this.W, 1 - (y + h) / this.H, (x + w) / this.W, 1 - y / this.H];
  }
  kindOf(s) { return (this.entries.get(s.key)?.st || STY.paint).kind; }
  glowOf(s) { return (this.entries.get(s.key)?.st || STY.paint).glow || 0; }
}

function fitText(g, text, rx, ry, rw, rh, font, fill, vertical, tube) {
  if (vertical) {
    // letters stacked top to bottom
    const n = text.length, step = rh / n, px = Math.min(rw * 0.86, step * 0.92);
    g.font = font(Math.round(px)); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) g.fillText(text[i], rx + rw / 2, ry + step * (i + 0.5) + px * 0.04);
    return;
  }
  const px = Math.round(rh * fill);
  g.font = font(px); g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(text).width, k = Math.min(1, (rw - rh * (tube ? 0.35 : 0.3)) / Math.max(1, tw));
  g.save(); g.translate(rx + rw / 2, ry + rh / 2 + px * 0.05); g.scale(k, 1); g.fillText(text, 0, 0); g.restore();
}

const SIGN_VS = `
attribute vec3 tint; attribute float sk;
varying vec2 vUv; varying vec3 vTint; varying float vK;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv; vTint = tint; vK = sk;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SIGN_FS = `
uniform sampler2D map; uniform float night, dayL;
varying vec2 vUv; varying vec3 vTint; varying float vK;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  float core = t.r, halo = t.g;
  vec3 c = vTint;
  vec3 col; float a;
  if (vK < 1.5) {
    // neon: the tube (white hot in the middle at night) and its glow
    col = c * core * (0.75 + 3.2 * night) + vec3(1.0) * core * core * night * 0.9 + c * halo * night * 1.6;
    a = max(core, halo * night * 0.9);
  } else {
    // metal letters: lit by the day, a faint glow at night
    col = c * core * (0.25 + 0.75 * dayL) + c * core * night * 0.9;
    a = core;
  }
  if (a < 0.03) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** The unlit material for neon and letter signs (alpha blended). */
export function neonMaterial(atlas) {
  const m = new THREE.ShaderMaterial({
    vertexShader: SIGN_VS, fragmentShader: SIGN_FS,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), map: { value: atlas.tex }, night: CITY_U.night, dayL: CITY_U.dayL },
    transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return m;
}

/** The lit material for painted and box signs (and their glow at night). */
export function paintMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.night = CITY_U.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float sk; varying float vSk;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSk = sk;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float night; varying float vSk;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSk * night * 1.4;');
  };
  m.customProgramCacheKey = () => 'vc-paint';
  return m;
}

/** Geometry for a list of signs (all of one material kind). */
export function signGeometry(list, atlas) {
  const pos = [], uv = [], nrm = [], tint = [], sk = [], idx = [];
  const c = new THREE.Color();
  for (const s of list) {
    const [u0, v0, u1, v1] = atlas.uv(s);
    const kind = atlas.kindOf(s);
    c.set(s.color ?? 0xffffff);
    const sides = s.both ? [0, Math.PI] : [0];
    for (const add of sides) {
      const yaw = s.yaw + add, co = Math.cos(yaw), si = Math.sin(yaw);
      const ax = co * s.w / 2, az = -si * s.w / 2, nx = si, nz = co;
      const px = s.x + nx * 0.06, pz = s.z + nz * 0.06;
      const b = pos.length / 3;
      pos.push(px - ax, s.y - s.h / 2, pz - az, px + ax, s.y - s.h / 2, pz + az, px + ax, s.y + s.h / 2, pz + az, px - ax, s.y + s.h / 2, pz - az);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let i = 0; i < 4; i++) { nrm.push(nx, 0, nz); tint.push(c.r, c.g, c.b); sk.push(kind === 0 ? atlas.glowOf(s) : kind); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('sk', new THREE.Float32BufferAttribute(sk, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---- murals ----------------------------------------------------------------------------------------------------------
export const MURALS = 16; // 4 x 4 in the atlas, 512 px each
/** Big bold pictures for Wynwood's walls: faces, shapes, gradients and graffiti letters. */
export function muralAtlas() {
  if (typeof document === 'undefined') return null;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S * 4;
  const g = cv.getContext('2d');
  const PAL = [
    ['#ff2f7a', '#ffd23a', '#2ad4ff', '#1b1240', '#ffffff'], ['#ff6a00', '#ffcf00', '#00a86b', '#3a0ca3', '#fef6e4'],
    ['#7400b8', '#48bfe3', '#80ffdb', '#ff006e', '#fffbe6'], ['#f72585', '#4cc9f0', '#3a0ca3', '#ffbe0b', '#ffffff'],
    ['#06d6a0', '#ef476f', '#ffd166', '#073b4c', '#ffffff'], ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'],
    ['#00f5d4', '#9b5de5', '#f15bb5', '#fee440', '#00bbf9'], ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'],
  ];
  const WORDS = ['VICE', 'WYNWOOD', '305', 'LOVE', 'DREAM', 'SOL', 'ARTE', 'NEON', 'WILD', 'RUMBA', 'FLOW', 'CALOR', 'VIBE', 'MAGIC', 'OCEAN', 'FUEGO'];
  for (let i = 0; i < MURALS; i++) {
    const r = rng(9001 + i * 77), x0 = (i % 4) * S, y0 = Math.floor(i / 4) * S;
    const P = PAL[i % PAL.length], pick = () => P[Math.floor(r() * P.length)];
    g.save(); g.beginPath(); g.rect(x0, y0, S, S); g.clip(); g.translate(x0, y0);
    // background: a bold gradient
    const gr = g.createLinearGradient(0, 0, S * r(), S);
    gr.addColorStop(0, P[0]); gr.addColorStop(0.5, P[1 + Math.floor(r() * 2)]); gr.addColorStop(1, P[3]);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const kind = i % 4;
    // shapes: rays, circles, stripes, zigzags
    for (let k = 0; k < 6; k++) {
      g.fillStyle = pick(); g.globalAlpha = 0.55 + r() * 0.45;
      const t = r();
      if (t < 0.3) { g.beginPath(); g.arc(r() * S, r() * S, 40 + r() * 160, 0, Math.PI * 2); g.fill(); }
      else if (t < 0.55) { g.save(); g.translate(S / 2, S / 2); g.rotate(r() * 3); for (let q = 0; q < 12; q += 2) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, S, q * Math.PI / 6, (q + 1) * Math.PI / 6); g.fill(); } g.restore(); }
      else if (t < 0.8) { const w = 18 + r() * 40; g.save(); g.translate(S / 2, S / 2); g.rotate(r() * 3); for (let q = -S; q < S; q += w * 2) g.fillRect(q, -S, w, S * 2); g.restore(); }
      else { g.lineWidth = 14 + r() * 20; g.strokeStyle = pick(); g.beginPath(); const yy = r() * S; for (let q = 0; q <= 10; q++) g.lineTo(q * S / 10, yy + (q % 2 ? -40 : 40)); g.stroke(); }
    }
    g.globalAlpha = 1;
    if (kind === 0 || kind === 2) {
      // a face: big shapes, big eyes, bold lips
      const cx = S * (0.35 + r() * 0.3), cy = S * (0.45 + r() * 0.1), R = S * (0.26 + r() * 0.08);
      g.fillStyle = pick(); g.beginPath(); g.ellipse(cx, cy, R * 0.82, R, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 10; g.strokeStyle = P[3]; g.stroke();
      // hair
      g.fillStyle = pick(); g.beginPath(); g.ellipse(cx, cy - R * 0.75, R * 1.05, R * 0.55, 0, Math.PI, 0); g.fill();
      for (const s of [-1, 1]) {
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx + s * R * 0.33, cy - R * 0.12, R * 0.2, R * 0.13, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = P[3]; g.beginPath(); g.arc(cx + s * R * 0.33, cy - R * 0.1, R * 0.08, 0, Math.PI * 2); g.fill();
        g.strokeStyle = P[3]; g.lineWidth = 7; g.beginPath(); g.arc(cx + s * R * 0.33, cy - R * 0.2, R * 0.24, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      }
      g.fillStyle = '#e8173c'; g.beginPath(); g.ellipse(cx, cy + R * 0.45, R * 0.28, R * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = P[3]; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - R * 0.27, cy + R * 0.45); g.lineTo(cx + R * 0.27, cy + R * 0.45); g.stroke();
      // tears of colour
      for (let k = 0; k < 4; k++) { g.fillStyle = pick(); g.fillRect(cx + (r() - 0.5) * R, cy + R * 0.05, 8 + r() * 10, R * (0.5 + r())); }
    }
    if (kind !== 2) {
      // graffiti letters: thick, outlined, with a drop shadow and a highlight
      const word = WORDS[i % WORDS.length];
      const px = Math.round(S * (word.length > 5 ? 0.2 : 0.3));
      g.save(); g.translate(S / 2, kind === 0 ? S * 0.86 : S * 0.55); g.rotate((r() - 0.5) * 0.35);
      g.font = `900 ${px}px "Arial Black", Impact, "DejaVu Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(word).width, k = Math.min(1.25, (S * 0.92) / tw);
      g.scale(k, k * 1.15);
      g.lineJoin = 'round';
      g.lineWidth = px * 0.32; g.strokeStyle = P[3]; g.strokeText(word, 8, 10);
      g.lineWidth = px * 0.2; g.strokeStyle = '#ffffff'; g.strokeText(word, 0, 0);
      const lg = g.createLinearGradient(0, -px / 2, 0, px / 2); lg.addColorStop(0, pick()); lg.addColorStop(1, pick());
      g.fillStyle = lg; g.fillText(word, 0, 0);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-tw / 2, -px * 0.32, tw, px * 0.08);
      g.restore();
    }
    // drips and splatter
    for (let k = 0; k < 30; k++) { g.fillStyle = pick(); g.globalAlpha = 0.8; g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 7, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/** Geometry for murals: quads with UVs into the 4x4 atlas. */
export function decalGeometry(list) {
  const pos = [], uv = [], nrm = [], idx = [];
  for (const d of list) {
    const i = d.index % MURALS, u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 4, u1 = u0 + 0.25, v0 = v1 - 0.25;
    const co = Math.cos(d.yaw), si = Math.sin(d.yaw), ax = co * d.w / 2, az = -si * d.w / 2, nx = si, nz = co;
    const px = d.x + nx * 0.08, pz = d.z + nz * 0.08, b = pos.length / 3;
    // keep the picture's proportions: crop the atlas cell to the wall's shape
    const asp = d.w / d.h;
    let cu0 = u0, cu1 = u1, cv0 = v0, cv1 = v1;
    if (asp > 1) { const k = 0.25 / asp; cv0 = (v0 + v1) / 2 - k / 2; cv1 = cv0 + k; } else { const k = 0.25 * asp; cu0 = (u0 + u1) / 2 - k / 2; cu1 = cu0 + k; }
    pos.push(px - ax, d.y - d.h / 2, pz - az, px + ax, d.y - d.h / 2, pz + az, px + ax, d.y + d.h / 2, pz + az, px - ax, d.y + d.h / 2, pz - az);
    uv.push(cu0, cv0, cu1, cv0, cu1, cv1, cu0, cv1);
    for (let k = 0; k < 4; k++) nrm.push(nx, 0, nz);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export const SHUTTER_LAYER = TEX_LAYER.shutter;
