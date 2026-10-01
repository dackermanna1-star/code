// Spray paint as seen by the world materials. Paint lives on "canvases":
// 2 x 2 m planar projectors laid out on a grid over whatever surface was
// sprayed (a wall, the ground, the side of a dumpster). Each canvas owns one
// 512 x 512 tile of an array texture (premultiplied linear colour + coverage,
// and a half-resolution material layer: metalness, smoothness, wetness).
// A coarse 3D grid over the world lists which canvases touch each 1 m cell,
// so a fragment only tests the (at most four) canvases near it.
import * as THREE from 'three';
import { shared } from '../render/shaderlib.js';

export const SPRAY_TILES_PER_ROW = 4; // 4 x 4 tiles per array layer
export const SPRAY_TILE = 512; // texels per canvas side
export const SPRAY_SIZE = 2.0; // metres per canvas side

Object.assign(shared, {
  uSprayOn: { value: 0 },
  uSprayGrid: { value: null },
  uSprayCanvas: { value: null },
  uSprayColor: { value: null },
  uSprayMat: { value: null },
  uSprayGridMin: { value: new THREE.Vector3() },
  uSprayGridInv: { value: new THREE.Vector3(1, 1, 1) },
});

export const SPRAY_PARS = /* glsl */ `
uniform float uSprayOn;
uniform highp sampler3D uSprayGrid;
uniform highp sampler2D uSprayCanvas;
uniform highp sampler2DArray uSprayColor;
uniform highp sampler2DArray uSprayMat;
uniform vec3 uSprayGridMin;
uniform vec3 uSprayGridInv;

// Paint covering world point wp (geometric normal gn). Returns premultiplied
// linear colour + coverage; m = premultiplied (metal, smoothness, wetness, coverage).
// dPdx/dPdy: screen derivatives of wp, taken by the caller in uniform control flow.
vec4 sprayPaint(vec3 wp, vec3 gn, vec3 dPdx, vec3 dPdy, out vec4 m) {
  m = vec4(0.0);
  vec4 acc = vec4(0.0);
  if (uSprayOn < 0.5) return acc;
  vec3 gc = (wp - uSprayGridMin) * uSprayGridInv;
  if (any(lessThan(gc, vec3(0.0))) || any(greaterThan(gc, vec3(1.0)))) return acc;
  vec4 ids = textureLod(uSprayGrid, gc, 0.0) * 255.0;
  for (int k = 0; k < 4; k++) {
    float idf = ids[k];
    if (idf < 0.5) break;
    int ci = int(idf + 0.5) - 1;
    vec4 r0 = texelFetch(uSprayCanvas, ivec2(0, ci), 0); // origin, slab back
    vec4 r1 = texelFetch(uSprayCanvas, ivec2(1, ci), 0); // U, slab front
    vec4 r2 = texelFetch(uSprayCanvas, ivec2(2, ci), 0); // V, layer
    vec4 r3 = texelFetch(uSprayCanvas, ivec2(3, ci), 0); // N, tile
    vec3 d = wp - r0.xyz;
    float dn = dot(d, r3.xyz);
    if (dn < r0.w || dn > r1.w || dot(gn, r3.xyz) < 0.2) continue;
    vec2 uv = vec2(dot(d, r1.xyz), dot(d, r2.xyz)) * ${(1 / SPRAY_SIZE).toFixed(6)};
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
    vec2 tile = vec2(mod(r3.w, ${SPRAY_TILES_PER_ROW.toFixed(1)}), floor(r3.w / ${SPRAY_TILES_PER_ROW.toFixed(1)}));
    // footprint in atlas texels; capped at mip 4 so neighbouring tiles never bleed in
    const float S = ${(1 / (SPRAY_SIZE * SPRAY_TILES_PER_ROW)).toFixed(6)};
    vec2 gx = vec2(dot(dPdx, r1.xyz), dot(dPdx, r2.xyz)) * S;
    vec2 gy = vec2(dot(dPdy, r1.xyz), dot(dPdy, r2.xyz)) * S;
    float fp = max(length(gx), length(gy)) * ${(SPRAY_TILE * SPRAY_TILES_PER_ROW).toFixed(1)};
    if (fp > 16.0) { gx *= 16.0 / fp; gy *= 16.0 / fp; fp = 16.0; }
    float margin = 0.5 * max(fp, 1.0) / ${SPRAY_TILE.toFixed(1)};
    vec2 auv = (tile + clamp(uv, vec2(margin), vec2(1.0 - margin))) * ${(1 / SPRAY_TILES_PER_ROW).toFixed(6)};
    vec4 c = textureGrad(uSprayColor, vec3(auv, r2.w), gx, gy);
    vec4 mm = textureGrad(uSprayMat, vec3(auv, r2.w), gx, gy);
    acc = c + acc * (1.0 - c.a);
    m = mm + m * (1.0 - mm.a);
  }
  return acc;
}
`;

/**
 * GLSL block applying paint to a surface: expects alb, rough, metal, porosity in
 * scope and a coverage scale `k` (1 = full; less in recessed mortar).
 */
export function sprayApply(wp, gn, scale = '1.0') {
  return /* glsl */ `
  {
    vec4 spM;
    vec4 spC = sprayPaint(${wp}, ${gn}, dFdx(${wp}), dFdy(${wp}), spM);
    if (spC.a > 0.003) {
      float cov = clamp(spC.a * (${scale}), 0.0, 1.0);
      vec3 pcol = spC.rgb / spC.a;
      float ia = 1.0 / max(spM.a, 1e-3);
      float pMetal = clamp(spM.r * ia, 0.0, 1.0);
      float pSmooth = clamp(spM.g * ia, 0.0, 1.0);
      float pWet = clamp(spM.b * ia, 0.0, 1.0);
      // fresh paint is a touch darker and much glossier until it dries
      alb = mix(alb, pcol * (1.0 - 0.12 * pWet), cov);
      rough = mix(rough, mix(1.0 - pSmooth, 0.07, pWet), cov);
      metal = mix(metal, pMetal, cov);
      porosity *= 1.0 - cov;
    }
  }
  `;
}
