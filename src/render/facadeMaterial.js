// Facade material: MeshStandardMaterial patched with a voxel relief ray-march.
//
// Facade geometry is meshed on the brick-course grid (CV = 6.77 cm). In the
// fragment shader each face is treated as a heightfield on a 5x finer grid
// (BV = 1.354 cm): bricks, mortar joints, chipped edges and spalled faces are
// voxel columns of different heights. A short 2D DDA walks the view ray
// through the columns, so joints and chips read as real stepped geometry at
// grazing angles, lit with axis-aligned voxel normals.
import * as THREE from 'three';
import { GLSL_COMMON, shared, patch } from './shaderlib.js';
import { BRICK_SCHEMES } from '../world/layout.js';
import { PAINT_LAYER_W, PAINT_LAYER_H } from '../world/units.js';

const srgb = (c) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return new THREE.Vector3(f(c[0]), f(c[1]), f(c[2]));
};

export function createFacadeMaterial(opts) {
  const brickCols = [];
  const brickAvg = [];
  const mortarCols = [];
  for (let s = 0; s < 6; s++) {
    const sc = BRICK_SCHEMES[s] ?? BRICK_SCHEMES[0];
    const avg = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const v = srgb(sc.bricks[i % sc.bricks.length]);
      brickCols.push(v);
      avg.add(v);
    }
    brickAvg.push(avg.multiplyScalar(1 / 8));
    mortarCols.push(srgb(sc.mortar));
  }

  const uniforms = {
    uBrickCols: { value: brickCols },
    uBrickAvg: { value: brickAvg },
    uMortarCols: { value: mortarCols },
    uFacPaint: { value: opts.facPaint },
    uPaint: { value: opts.paint },
    uPaintProps: { value: opts.paintProps },
    uGrime: { value: opts.grime },
    uPaintLayerSize: { value: new THREE.Vector2(PAINT_LAYER_W, PAINT_LAYER_H) },
    uReliefOn: { value: 1 },
  };

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 });
  mat.name = 'facade';
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, uniforms);
    let vs = shader.vertexShader;
    vs = patch(vs, '#include <common>', /* glsl */ `
      attribute vec4 vcol;
      attribute vec4 vmat;
      attribute vec3 vox;
      attribute vec4 vfac;
      varying vec4 vCol;
      varying vec4 vMat;
      varying vec3 vVox;
      flat varying vec4 vFac;
      varying vec3 vWPos;
      varying vec3 vWNrm;
    `, 'after');
    vs = patch(vs, '#include <begin_vertex>', /* glsl */ `
      vCol = vcol; vMat = vmat; vVox = vox; vFac = vfac;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNrm = normalize(mat3(modelMatrix) * normal);
    `, 'after');
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = patch(fs, '#include <common>', GLSL_COMMON + FACADE_PARS, 'after');
    fs = patch(fs, '#include <map_fragment>', FACADE_SURFACE);
    fs = patch(fs, '#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;');
    fs = patch(fs, '#include <metalnessmap_fragment>', 'float metalnessFactor = sMetal;');
    fs = patch(fs, '#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(sN, 0.0)).xyz);');
    fs = patch(fs, '#include <lights_fragment_maps>', /* glsl */ `
      irradiance = sampleIrradiance(vWPos, sN) * sAO;
      #if defined( USE_ENVMAP )
        iblIrradiance = vec3(0.0);
        radiance *= sSpecOcc;
      #endif
    `, 'after');
    fs = patch(fs, '#include <aomap_fragment>', /* glsl */ `
      float pShadow = playerShadow(vWPos + sN * 0.02);
      reflectedLight.directDiffuse *= pShadow;
      reflectedLight.directSpecular *= pShadow;
    `, 'before');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'facade-relief-v1';
  return mat;
}

const FACADE_PARS = /* glsl */ `
uniform vec3 uBrickCols[48];
uniform vec3 uBrickAvg[6];
uniform vec3 uMortarCols[6];
uniform vec4 uFacPaint[40];
uniform highp sampler2DArray uPaint;
uniform highp sampler2DArray uPaintProps;
uniform highp sampler2DArray uGrime;
uniform vec2 uPaintLayerSize;
uniform float uReliefOn;

varying vec4 vCol;
varying vec4 vMat;
varying vec3 vVox;
flat varying vec4 vFac;
varying vec3 vWPos;
varying vec3 vWNrm;

const float BVM = 0.01354;
const float CVM = 0.0677;

// Pattern ids
#define P_RUNNING 0
#define P_COMMON 1
#define P_SOLDIER 2
#define P_HEADER 3
#define P_CMU 4
#define P_SPALL 5
#define P_PARGE 6
#define P_STONE 7
#define P_TILE 8
#define P_STEEL 9
#define P_CONCRETE 10
#define P_GLASSBLOCK 11
#define P_WOOD 12

// Height of the fine voxel column at integer cell c (BV units, <= 0).
// Outputs: mortar flag, unit id hash, position inside the unit (0..1).
float cellHeight(ivec2 c, int pat, int phase, int seed, out float mortar, out float uid, out vec2 inUnit) {
  mortar = 0.0;
  uid = 0.0;
  inUnit = vec2(0.5);
  float hgt = 0.0;
  if (pat <= P_CMU) {
    int uw, uh, ii, rr, b, row;
    bool header = false;
    if (pat == P_SOLDIER) {
      int jy = c.y - phase * 5;
      row = fdiv(jy, 15); rr = jy - row * 15;
      b = fdiv(c.x, 5); ii = c.x - b * 5;
      uw = 5; uh = 15;
    } else if (pat == P_CMU) {
      row = fdiv(c.y, 15); rr = c.y - row * 15;
      int off = (row & 1) * 15;
      b = fdiv(c.x + off, 30); ii = c.x + off - b * 30;
      uw = 30; uh = 15;
    } else {
      row = fdiv(c.y, 5); rr = c.y - row * 5;
      header = (pat == P_HEADER) || (pat == P_COMMON && fmodi(row, 6) == 0);
      uw = header ? 8 : 15;
      int off = header ? 4 * (fdiv(row, 6) & 1) : (row & 1) * 7;
      b = fdiv(c.x + off, uw); ii = c.x + off - b * uw;
      uh = 5;
    }
    uid = h12(ivec2(b * 2 + (header ? 1 : 0), row) + ivec2(seed * 31, seed));
    inUnit = vec2((float(ii) - 0.5) / float(uw - 1), (float(rr) - 0.5) / float(uh - 1));
    if (rr == 0 || ii == 0) {
      mortar = 1.0;
      float mh = h12(c * 7 + ivec2(seed));
      hgt = -0.7 - 0.5 * mh;
      if (pat == P_CMU) hgt = -0.45 - 0.3 * mh;
    } else {
      float bh = fract(uid * 13.73);
      hgt = -0.2 * bh;
      if (fract(uid * 71.31) < 0.045) hgt = -0.5 - 0.6 * h12(c + ivec2(seed * 3));
      bool edge = (ii == 1 || ii == uw - 1 || rr == 1 || rr == uh - 1);
      bool corner = (ii == 1 || ii == uw - 1) && (rr == 1 || rr == uh - 1);
      float ch = h12(c * 3 + ivec2(seed, 5));
      if (corner && ch < 0.38) hgt -= 0.55;
      else if (edge && ch < 0.11) hgt -= 0.4;
      hgt -= 0.07 * h12(c + ivec2(11, seed));
      if (pat == P_CMU) hgt = -0.12 * h12(c + ivec2(5));
    }
  } else if (pat == P_SPALL) {
    float n = h12(fdiv(c.x, 2) * ivec2(1, 0) + fdiv(c.y, 2) * ivec2(0, 1) + ivec2(seed));
    hgt = -0.5 - 1.0 * n - 0.25 * h12(c + ivec2(seed, 9));
    uid = n;
  } else if (pat == P_PARGE) {
    hgt = -0.06 * h12(c + ivec2(seed));
    vec4 nz = noise2L(vec2(c) * 0.11 + float(seed));
    if (abs(nz.r - 0.5) < 0.012) { hgt = -0.6; mortar = 1.0; }
    if (nz.g > 0.78) { hgt = -0.9; mortar = 0.5; } // parge fallen off, brick shows
    uid = nz.b;
  } else if (pat == P_STONE || pat == P_TILE) {
    int jw = pat == P_STONE ? 45 : 30;
    int b = fdiv(c.x, jw);
    int ii = c.x - b * jw;
    uid = h12(ivec2(b, seed));
    if (ii == 0) { mortar = 1.0; hgt = -0.6; }
    else {
      hgt = -0.08 * h12(c + ivec2(seed));
      if (h12(c * 5 + ivec2(seed)) < 0.035) hgt = -0.45;
    }
  } else if (pat == P_CONCRETE) {
    hgt = -0.1 * h12(c + ivec2(seed));
    if (h12(c * 9 + ivec2(seed)) < 0.03) hgt = -0.4;
    uid = h12(fdiv(c.x, 6) * ivec2(1, 0) + fdiv(c.y, 6) * ivec2(0, 1));
  } else if (pat == P_GLASSBLOCK) {
    int bx = fdiv(c.x, 15), by = fdiv(c.y, 15);
    int ii = c.x - bx * 15, rr = c.y - by * 15;
    uid = h12(ivec2(bx, by));
    inUnit = vec2(float(ii) / 15.0, float(rr) / 15.0);
    if (ii == 0 || rr == 0) { mortar = 1.0; hgt = -0.7; }
    else hgt = (ii == 1 || ii == 14 || rr == 1 || rr == 14) ? -0.25 : 0.0;
  } else if (pat == P_WOOD) {
    int row = fdiv(c.y, 9);
    int rr = c.y - row * 9;
    uid = h12(ivec2(row, seed));
    if (rr == 0) { mortar = 1.0; hgt = -0.5; }
    else hgt = -0.1 * h12(ivec2(c.x / 4, c.y) + ivec2(seed));
  } else {
    // steel & others: mostly flat with corrosion pits
    hgt = h12(c + ivec2(seed)) < 0.03 ? -0.25 : 0.0;
    uid = h12(fdiv(c.x, 8) * ivec2(1, 0) + fdiv(c.y, 8) * ivec2(0, 1));
  }
  return floor(hgt * 4.0) / 4.0;
}
`;

const FACADE_SURFACE = /* glsl */ `
  int orient = int(vFac.x + 0.5);
  int facIdx = int(vFac.y + 0.5);
  int scheme = int(vFac.z + 0.5);
  int bondCommon = int(vFac.w + 0.5);
  int cls = int(vMat.b * 255.0 + 0.5);

  vec3 lx = orient == 0 ? vec3(0.0, 0.0, -1.0) : orient == 1 ? vec3(0.0, 0.0, 1.0) : orient == 2 ? vec3(1.0, 0.0, 0.0) : vec3(-1.0, 0.0, 0.0);
  vec3 lz = vec3(-lx.z, 0.0, lx.x); // outward normal (rotate lx by -90deg around Y)
  vec3 Ng = normalize(vWNrm);

  int faceKind = 0;
  vec2 pat0;
  vec3 T, B;
  if (dot(Ng, lz) > 0.5) { faceKind = 0; pat0 = vVox.xy; T = lx; B = vec3(0.0, 1.0, 0.0); }
  else if (abs(dot(Ng, lx)) > 0.5) { faceKind = 1; pat0 = vec2(vVox.z, vVox.y); T = lz; B = vec3(0.0, 1.0, 0.0); }
  else if (Ng.y > 0.5) { faceKind = 2; pat0 = vec2(vVox.x, vVox.z); T = lx; B = lz; }
  else { faceKind = 3; pat0 = vec2(vVox.x, vVox.z); T = lx; B = lz; }

  // pattern for this material class
  int pid = P_STEEL;
  int phase = 0;
  if (cls == 20 || cls == 33) pid = bondCommon == 1 ? P_COMMON : P_RUNNING;
  else if (cls == 21) { pid = P_SOLDIER; phase = int(vCol.r * 255.0 + 0.5); }
  else if (cls == 22) pid = P_HEADER;
  else if (cls == 23) pid = P_CMU;
  else if (cls == 24) pid = P_PARGE;
  else if (cls == 25) pid = P_STONE;
  else if (cls == 26) pid = P_TILE;
  else if (cls == 27) pid = P_STEEL;
  else if (cls == 28) pid = P_CONCRETE;
  else if (cls == 29) pid = P_GLASSBLOCK;
  else if (cls == 30) pid = bondCommon == 1 ? P_COMMON : P_RUNNING;
  else if (cls == 31) pid = P_WOOD;
  else if (cls == 32) pid = P_SPALL;
  if (faceKind >= 2 && pid <= P_HEADER) pid = P_HEADER; // tops of brick show header-ish units
  int seed = facIdx * 7 + 3;

  vec2 p0 = pat0 * 5.0; // BV units
  vec2 dpx = dFdx(p0), dpy = dFdy(p0);
  // smooth paint-space derivatives (front faces map p0 directly to paint space)
  vec2 puvDx = vec2(dpx.x * BVM / uPaintLayerSize.x, -dpx.y * BVM / uPaintLayerSize.y);
  vec2 puvDy = vec2(dpy.x * BVM / uPaintLayerSize.x, -dpy.y * BVM / uPaintLayerSize.y);
  float fw = max(length(dpx), length(dpy));
  float detail = (1.0 - smoothstep(1.1, 2.2, fw)) * uReliefOn;

  vec3 V = normalize(vWPos - cameraPosition);
  vec3 rd = vec3(dot(V, T), dot(V, B), dot(V, Ng));
  rd.z = min(rd.z, -0.02);

  ivec2 ic = ivec2(floor(p0));
  float mort, uid; vec2 inU;
  float hitH = 0.0;
  int hitType = 0;
  vec2 stp = vec2(rd.x >= 0.0 ? 1.0 : -1.0, rd.y >= 0.0 ? 1.0 : -1.0);
  vec2 hitP = p0;
  if (detail > 0.001) {
    vec2 cell = floor(p0);
    vec2 invd = 1.0 / max(abs(rd.xy), vec2(1e-5));
    vec2 tMax = (stp * (cell - p0) + max(stp, 0.0)) * invd;
    float tEntry = 0.0;
    int axis = -1;
    float tHit = 0.0;
    for (int k = 0; k < 14; k++) {
      float h = cellHeight(ic, pid, phase, seed, mort, uid, inU);
      if (k > 0 && rd.z * tEntry <= h) { tHit = tEntry; hitType = axis + 1; hitH = rd.z * tEntry; break; }
      float tExit = min(tMax.x, tMax.y);
      if (rd.z * tExit <= h || k == 13) { tHit = h / rd.z; hitType = 0; hitH = h; break; }
      if (tMax.x < tMax.y) { tEntry = tMax.x; tMax.x += invd.x; ic.x += int(stp.x); axis = 0; }
      else { tEntry = tMax.y; tMax.y += invd.y; ic.y += int(stp.y); axis = 1; }
    }
    hitP = p0 + rd.xy * tHit;
  } else {
    hitH = cellHeight(ic, pid, phase, seed, mort, uid, inU);
  }

  vec3 sN = Ng;
  if (detail > 0.001) {
    if (hitType == 1) sN = -stp.x * T;
    else if (hitType == 2) sN = -stp.y * B;
  }

  // ---------- albedo ----------
  float vn = h12(ic * 13 + ivec2(seed, 1));
  vec3 alb;
  float rough = 0.9;
  float metal = 0.0;
  float porosity = 1.0;
  bool brickish = pid <= P_HEADER || pid == P_SPALL;
  vec3 baseCol = srgbToLinear(vCol.rgb);
  if (brickish || cls == 33) {
    int sch = cls == 33 ? int(vCol.r * 255.0 + 0.5) : scheme;
    vec3 bc = uBrickCols[sch * 8 + int(fract(uid * 7.31) * 8.0)];
    // fire flash: one end of some bricks darker, headers often burnt darker
    float flash = fract(uid * 3.17) > 0.6 ? mix(0.78, 1.0, inU.x) : 1.0;
    if (pid == P_HEADER || (pid == P_COMMON && fract(uid * 5.1) > 0.55 && mort < 0.5 && fract(uid * 9.7) > 0.4)) flash *= 0.86;
    bc *= flash * (0.9 + 0.2 * vn);
    vec3 mc = uMortarCols[sch] * (0.95 + 0.3 * vn);
    alb = mix(bc, mc, mort);
    if (pid == P_SPALL) alb = bc * vec3(1.12, 1.0, 0.92) * (0.85 + 0.25 * vn);
    if (cls == 30) {
      // painted brick, peeling
      float peel = smoothstep(0.55, 0.75, noise2L(vWPos.xz * 3.0 + vWPos.y * 2.0).r + 0.25 * vn);
      alb = mix(baseCol * (0.92 + 0.12 * vn), alb, peel);
      rough = 0.82;
    }
    // at distance blend to the scheme average to avoid sparkle
    float far = smoothstep(4.0, 14.0, fw);
    alb = mix(alb, mix(uBrickAvg[sch], uMortarCols[sch], 0.22), far);
    rough = mort > 0.5 ? 0.95 : 0.86;
  } else if (pid == P_CMU) {
    alb = baseCol * (0.86 + 0.24 * vn) * (mort > 0.5 ? 0.85 : 1.0);
    rough = 0.93;
  } else if (pid == P_PARGE) {
    alb = baseCol * (0.88 + 0.16 * vn);
    if (mort > 0.4) alb = mort > 0.8 ? baseCol * 0.55 : uBrickCols[scheme * 8 + int(uid * 8.0)] * 0.9;
    rough = 0.92;
  } else if (pid == P_STONE) {
    alb = baseCol * (0.86 + 0.22 * vn) * (0.92 + 0.16 * fract(uid * 7.0));
    rough = 0.78;
    porosity = 0.8;
  } else if (pid == P_TILE) {
    alb = baseCol * (0.8 + 0.3 * vn) * (0.9 + 0.2 * fract(uid * 7.0));
    rough = 0.42;
    porosity = 0.3;
  } else if (pid == P_CONCRETE) {
    alb = baseCol * (0.82 + 0.3 * vn) * (0.94 + 0.12 * uid);
    rough = 0.93;
  } else if (pid == P_GLASSBLOCK) {
    alb = mort > 0.5 ? vec3(0.32, 0.31, 0.29) : baseCol * (0.55 + 0.25 * vn);
    rough = mort > 0.5 ? 0.9 : 0.08;
    porosity = 0.0;
  } else if (pid == P_WOOD) {
    alb = baseCol * (0.8 + 0.3 * vn) * (0.9 + 0.2 * uid);
    rough = 0.85;
  } else {
    // steel: paint + rust
    float rn = fbm3(vWPos * 4.0);
    float rust = smoothstep(0.52, 0.7, rn + 0.15 * vn);
    alb = mix(baseCol * (0.85 + 0.25 * vn), vec3(0.16, 0.07, 0.03) * (0.8 + 0.4 * vn), rust);
    rough = mix(0.55, 0.92, rust);
    metal = mix(0.45, 0.0, rust);
    porosity = 0.15;
  }

  // ---------- local coordinates for paint / grime ----------
  float uLoc = (faceKind == 0 || faceKind >= 2) ? hitP.x * BVM : vVox.x * CVM;
  float yLoc = faceKind == 0 ? hitP.y * BVM : vVox.y * CVM;
  float yW = vWPos.y;

  // ---------- grime & weathering ----------
  vec4 fp = uFacPaint[facIdx];
  vec4 grime = vec4(0.0);
  float uu = uLoc + fp.y;
  float lyrStep = floor(uu / uPaintLayerSize.x);
  float lyr = fp.x + lyrStep;
  uu -= lyrStep * uPaintLayerSize.x;
  vec2 puv = vec2(uu / uPaintLayerSize.x, 1.0 - (yLoc + fp.z) / uPaintLayerSize.y);
  bool inLayer = fp.x >= 0.0 && puv.y > 0.0 && puv.y < 1.0;
  if (inLayer) grime = textureGrad(uGrime, vec3(puv, lyr), puvDx, puvDy);
  // procedural: rising damp + ground splash + soot streaks from the parapet
  vec4 nzA = noise2L(vec2(uLoc * 1.7, yW * 0.9) + float(facIdx) * 13.0);
  float risingDamp = 1.0 - smoothstep(0.25, 0.75 + 0.5 * nzA.r, yW);
  float splash = 1.0 - smoothstep(0.05, 0.35 + 0.15 * nzA.g, yW);
  vec4 nzS = noise2L(vec2(uLoc * 2.3, yW * 0.07) + float(facIdx) * 5.0);
  float streak = smoothstep(0.55, 0.85, nzS.b) * smoothstep(1.5, 8.0, yW) * 0.6;
  float soot = clamp(grime.r + streak * 0.5 + 0.18 * nzA.b, 0.0, 1.0);
  float damp = clamp(grime.g + risingDamp * 0.8 + streak * 0.35, 0.0, 1.0);
  alb *= mix(1.0, 0.45, soot * 0.65);
  alb = mix(alb, alb * vec3(0.55, 0.52, 0.5), splash * 0.6);
  // efflorescence (white salt bloom) on masonry
  if (brickish || pid == P_CMU) alb = mix(alb, vec3(0.55, 0.53, 0.5), grime.b * 0.55 * (0.6 + 0.4 * vn));
  // rust stains
  alb = mix(alb, vec3(0.2, 0.09, 0.04), grime.a * 0.7);

  // ---------- graffiti paint ----------
  float paintA = 0.0;
  if (inLayer && faceKind == 0) {
    vec4 pc = textureGrad(uPaint, vec3(puv, lyr), puvDx, puvDy);
    vec4 pp = textureGrad(uPaintProps, vec3(puv, lyr), puvDx, puvDy);
    float cover = pc.a * (mort > 0.5 ? mix(0.42, 1.0, pp.b) : 1.0) * (hitType != 0 ? mix(0.65, 1.0, pp.b) : 1.0) * (pid == P_SPALL ? 0.35 : 1.0);
    cover *= mix(0.82 + 0.18 * vn, 1.0, pp.b);
    cover = clamp(cover * 1.08, 0.0, 1.0);
    vec3 pcol = srgbToLinear(pc.rgb);
    alb = mix(alb, pcol * (1.0 - 0.4 * soot * 0.5), cover);
    rough = mix(rough, mix(0.75, 0.35, pp.g), cover);
    metal = mix(metal, pp.r * 0.85, cover);
    porosity = mix(porosity, 0.25 + pp.b * 0.8, cover);
    paintA = cover;
  }

  // ---------- wetness ----------
  float wet = uWetness * clamp(0.28 + 0.72 * damp, 0.0, 1.0);
  if (sN.y > 0.6) wet = max(wet, uWetness * 0.95);
  alb *= mix(1.0, 0.62, wet * porosity);
  rough = mix(rough, mix(rough, 0.22, 0.85), wet * (sN.y > 0.6 ? 1.0 : 0.45));

  // ---------- occlusion ----------
  float reliefAO = mix(1.0, mort > 0.5 ? 0.74 : 0.55, clamp(-hitH / 1.8, 0.0, 1.0));
  if (hitType != 0) reliefAO *= 0.85;
  reliefAO = mix(1.0, reliefAO, detail);
  float sAO = vMat.a * reliefAO;
  float sSpecOcc = sAO * clamp(skyVisibility(vWPos, sN) * 1.5, 0.15, 1.0);
  float sRough = clamp(rough, 0.04, 1.0);
  float sMetal = metal;
  diffuseColor.rgb = alb;
`;
