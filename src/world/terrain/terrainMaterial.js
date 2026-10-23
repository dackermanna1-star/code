import * as THREE from 'three';
import { U } from '../../engine/uniforms.js';
import { LOGDEPTH_GLSL, CLIPMAP_GLSL, HASH_GLSL } from '../../shaders/common.js';
import { ATMOSPHERE_USE_GLSL } from '../atmosphere.js';
import { SAND_GLSL } from '../../shaders/sand.js';
import { SHADOW_GLSL } from '../../shaders/shadows.js';

const VERT = /* glsl */ `
${LOGDEPTH_GLSL}
${CLIPMAP_GLSL}
attribute vec4 aNode; // x0, z0, patch size, lod
uniform vec2 uMorph[TERRAIN_LODS];
uniform vec2 uYRange;
uniform sampler2D tDeform;
uniform vec4 uDeformRect;
varying vec3 vWorld;

void main() {
  float res = position.y;
  float cell = aNode.z / res;
  vec2 g = position.xz;
  vec2 wxz = aNode.xy + g * cell;

  // Same distance metric as the CPU quadtree selection, so morphing completes before
  // every LOD boundary.
  float dy = cameraPosition.y - clamp(cameraPosition.y, uYRange.x, uYRange.y);
  vec2 dxz = wxz - cameraPosition.xz;
  float dist = sqrt(dot(dxz, dxz) + dy * dy);
  vec2 mr = uMorph[int(aNode.w + 0.5)];
  float k = clamp((dist - mr.x) / (mr.y - mr.x), 0.0, 1.0);
  wxz -= fract(g * 0.5) * 2.0 * cell * k;

  // Sample the clipmap level whose (band-limited) texels match the vertex spacing; the
  // morph factor makes the choice continuous across LOD boundaries.
  float kf = max(log2(cell * 0.7 * uClip[0].w) + k, 0.0);
  int k0 = min(int(kf), CLIP_LEVELS - 1);
  float h = clipHeightFrom(wxz, k0);
  float kb = fract(kf);
  if (kb > 0.001 && k0 < CLIP_LEVELS - 1) h = mix(h, clipHeightFrom(wxz, k0 + 1), kb);
#ifdef USE_FOOTPRINTS
  vec2 duv = (wxz - uDeformRect.xy) * uDeformRect.w;
  if (cell < 0.5 && all(greaterThan(duv, vec2(0.0))) && all(lessThan(duv, vec2(1.0)))) {
    h += textureLod(tDeform, duv, 0.0).r;
  }
#endif
  vec3 wp = vec3(wxz.x, h, wxz.y);
  vWorld = wp;
  gl_Position = logDepth(projectionMatrix * viewMatrix * vec4(applyCurvature(wp), 1.0));
}
`;

const FRAG = /* glsl */ `
${HASH_GLSL}
${CLIPMAP_GLSL}
${ATMOSPHERE_USE_GLSL}
${SHADOW_GLSL}
${SAND_GLSL}
varying vec3 vWorld;
uniform int uDebugView;

void main() {
  vec3 p = vWorld;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  float footprint = max(length(dpx), length(dpy));

  vec4 nd;
  float terrainShadow;
  clipSurface(p.xz, footprint, nd, terrainShadow);

  SandSurface s = sandSurface(p, nd, footprint, dist, V);
  if (uDebugView > 0) {
    vec3 d = vec3(0.0);
    if (uDebugView == 1) d = vec3(terrainShadow);
    else if (uDebugView == 2) d = s.N * 0.5 + 0.5;
    else if (uDebugView == 3) d = vec3(fract(p.y / 10.0), fract(p.y / 100.0), 0.0);
    else if (uDebugView == 4) {
      float b;
      int k = clipLevel(p.xz, 0, b);
      d = vec3(float(k % 3) * 0.5, float((k / 3) % 3) * 0.5, b);
    } else if (uDebugView == 5) d = vec3(nd.z, max(-nd.w * 5.0, 0.0), max(nd.w * 5.0, 0.0));
    else if (uDebugView == 6) {
      vec4 fp = sampleDeform(p.xz);
      d = vec3(max(-fp.w * 40.0, 0.0), max(fp.w * 40.0, 0.0), fp.z);
    }
    gl_FragColor = vec4(d * d, 1.0);
    return;
  }
  vec3 col = shadeSand(s, p, V, terrainShadow);
  col = applyAerial(col, p);
  gl_FragColor = vec4(col * exposure(), 1.0);
}
`;

export function createTerrainMaterial(atmosphere, atlas, quality) {
  const defines = { ...atlas.defines };
  if (quality.footprints) defines.USE_FOOTPRINTS = 1;
  if (quality.sparkle) defines.USE_SPARKLE = 1;
  if (quality.ripples) defines.USE_RIPPLES = 1;
  if (quality.objectShadows) defines.USE_OBJECT_SHADOWS = 1;
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: {
      ...atmosphere.materialUniforms(),
      uLogDepthFC: U.uLogDepthFC,
      tHeight: U.tHeight,
      tNormal: U.tNormal,
      tShadow: U.tShadow,
      uClip: U.uClip,
      uAtlasInv: U.uAtlasInv,
      tDeform: U.tDeform,
      uDeformRect: U.uDeformRect,
      uTime: U.uTime,
      uWindDir: U.uWindDir,
      uWindSpeed: U.uWindSpeed,
      uWindOffset: U.uWindOffset,
      uSunDir: U.uSunDir,
      uOases: U.uOases,
      uOasisCount: U.uOasisCount,
      tObjShadow0: U.tObjShadow0,
      tObjShadow1: U.tObjShadow1,
      uObjShadowMatrix0: U.uObjShadowMatrix0,
      uObjShadowMatrix1: U.uObjShadowMatrix1,
      uObjShadowParams: U.uObjShadowParams,
      uDebugView: { value: 0 },
    },
  });
}
