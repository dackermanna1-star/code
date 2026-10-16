// Materials for voxel geometry (instanced models, terrain) and clear glass.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL, windowGLSL, MAX_LIGHTS } from './shaderChunks.js'
import { getPaletteTexture } from '../core/materials.js'
import { VOXEL } from '../core/constants.js'

/** Uniforms shared by every world material (one object, referenced everywhere). */
export function createSharedUniforms() {
  const arr = n => Array.from({ length: n }, () => new THREE.Vector4())
  return {
    uTime: { value: 0 },
    uGameMinutes: { value: 0 },
    uSkyAmb: { value: new THREE.Color(0.05, 0.055, 0.08) },
    uGroundAmb: { value: new THREE.Color(0.03, 0.028, 0.03) },
    uIndoorAmb: { value: new THREE.Color(0.012, 0.012, 0.012) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
    uSunCol: { value: new THREE.Color(0, 0, 0) },
    uLitFraction: { value: 0.5 },
    uStreetOn: { value: 1 },
    uNight: { value: 1 },
    uSnowCover: { value: 0.0 },
    uFogColor: { value: new THREE.Color(0.06, 0.055, 0.07) },
    uFogHorizon: { value: new THREE.Color(0.16, 0.12, 0.12) },
    uFogGlow: { value: new THREE.Color(0.08, 0.04, 0.02) },
    uFogDensity: { value: 0.012 },
    uFogFalloff: { value: 0.035 },
    uFogBase: { value: 0 },
    uScatter: { value: 0.06 },
    uWhiteout: { value: 0 },
    uWhiteoutCenter: { value: new THREE.Vector2() },
    uNumLights: { value: 0 },
    uLightPos: { value: arr(MAX_LIGHTS) },
    uLightCol: { value: arr(MAX_LIGHTS) },
    uLightDir: { value: arr(MAX_LIGHTS) },
    uLightParam: { value: arr(MAX_LIGHTS) },
    uFlashPos: { value: new THREE.Vector3() },
    uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
    uFlashOn: { value: 0 },
    uPalette: { value: null },
  }
}

const voxelVertex = /* glsl */ `
attribute vec4 aData;
attribute vec2 aSize;
#ifdef USE_INSTANCING
attribute vec4 aInst;
attribute vec4 aInst2;
#endif
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vN;
varying float vAO;
varying vec2 vUV;
flat varying float vMat;
flat varying float vExtra;
flat varying float vDomain;
flat varying vec4 vInst;
flat varying float vFlag;
flat varying vec2 vSize;
flat varying float vDir;
varying vec3 vViewL;

vec3 dirNormal(float d) {
  if (d < 0.5) return vec3(1,0,0);
  if (d < 1.5) return vec3(-1,0,0);
  if (d < 2.5) return vec3(0,1,0);
  if (d < 3.5) return vec3(0,-1,0);
  if (d < 4.5) return vec3(0,0,1);
  return vec3(0,0,-1);
}

void main() {
  float packed = aData.y;
  float dir = mod(packed, 8.0);
  float corner = mod(floor(packed / 8.0), 4.0);
  float ao = floor(packed / 32.0);
  vec3 n = dirNormal(dir);
  vec4 lp = vec4(position, 1.0);
  vLocal = position;
  float indoor = mod(aData.w, 2.0);
#ifdef USE_INSTANCING
  vec4 wp = modelMatrix * instanceMatrix * lp;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  vViewL = transpose(mat3(instanceMatrix)) * (cameraPosition - wp.xyz);
  vInst = aInst;
  vFlag = aInst2.x;
  indoor = max(indoor, aInst2.y);
  vLocal += vec3(aInst.x * 731.0, 0.0, aInst.x * 297.0);
#else
  vec4 wp = modelMatrix * lp;
  vN = normalize(mat3(modelMatrix) * n);
  vViewL = cameraPosition - wp.xyz;
  vInst = vec4(0.5, 1.0, 1.0, 1.0);
  vFlag = 1.0;
#endif
  vWorld = wp.xyz;
  vAO = ao;
  vMat = aData.x;
  vExtra = aData.z;
  vDomain = indoor > 0.5 ? 2.0 : 1.0;
  vec2 cuv = vec2((corner == 1.0 || corner == 2.0) ? 1.0 : 0.0, corner >= 2.0 ? 1.0 : 0.0);
  vUV = cuv;
  vSize = aSize;
  vDir = dir;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const voxelFragment = /* glsl */ `
uniform sampler2D uPalette;
uniform float uVoxelScale;
uniform float uDetail;
${commonUniformsGLSL}
${hashGLSL}
${lightingGLSL}
${fogGLSL}
${windowGLSL}

varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vN;
varying float vAO;
varying vec2 vUV;
flat varying float vMat;
flat varying float vExtra;
flat varying float vDomain;
flat varying vec4 vInst;
flat varying float vFlag;
flat varying vec2 vSize;
flat varying float vDir;
varying vec3 vViewL;

void main() {
  vec2 pu = vec2((vMat + 0.5) / 256.0, 0.25);
  vec4 p0 = texture2D(uPalette, pu);
  vec4 p1 = texture2D(uPalette, vec2(pu.x, 0.75));
  vec3 albedo = p0.rgb;
  float gloss = p0.a;
  float fl = floor(p1.a);
  float variation = fract(p1.a) * 4.0;
  float emitKind = mod(fl, 8.0);
  float paint = mod(floor(fl / 8.0), 2.0);
  float snowy = mod(floor(fl / 16.0), 2.0);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);

  if (paint > 0.5) albedo = vInst.yzw;

  // per-voxel cell variation (keeps the voxel grain visible on merged quads)
  vec3 cellP = vLocal / uVoxelScale - N * 0.5;
  vec3 cell = floor(cellP + 1e-3);
  float hv = hash13(cell + 0.17);
  albedo *= 1.0 + (hv - 0.5) * 0.10 * variation;
  // soft large-scale grime
  float grime = vnoise3(vWorld * vec3(0.35, 0.12, 0.35));
  albedo *= 1.0 - 0.10 * grime * variation * (1.0 - snowy);
  // voxel edge darkening, fades with distance
  if (uDetail > 0.0) {
    vec3 f = fract(cellP + 1e-3);
    vec3 e = min(f, 1.0 - f);
    vec3 an = abs(N);
    float edge = an.x > 0.5 ? min(e.y, e.z) : an.y > 0.5 ? min(e.x, e.z) : min(e.x, e.y);
    float ew = smoothstep(0.0, 0.08, edge);
    albedo *= mix(1.0 - 0.07 * uDetail * (snowy > 0.5 ? 0.25 : 1.0) * clamp(1.0 - dist / 40.0, 0.0, 1.0), 1.0, ew);
  }
  // fresh snow settling on up-facing exterior surfaces
  if (vDomain < 1.5 && N.y > 0.7 && snowy < 0.5 && uSnowCover > 0.0) {
    float patchN = vnoise2(vWorld.xz * 1.7);
    float sc = smoothstep(0.35, 0.7, patchN + uSnowCover * 0.6 - 0.3) * uSnowCover;
    albedo = mix(albedo, vec3(0.74, 0.77, 0.82), sc);
    snowy = max(snowy, sc);
  }

  float ao = vAO / 3.0;
  ao = 0.32 + 0.68 * ao * ao * (0.4 + 0.6 * ao);

  vec3 amb;
  if (vDomain > 1.5) amb = uIndoorAmb;
  else {
    amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
    if (snowy > 0.5) amb *= vec3(0.92, 0.97, 1.12);
  }
  vec3 spec = vec3(0.0);
  vec3 direct = evalLights(vWorld, N, vDomain, V, gloss, snowy > 0.5 ? 0.25 : 0.0, spec);
  if (vDomain < 1.5) direct += uSunCol * max(dot(N, uSunDir), 0.0);
  vec3 col = albedo * (amb * ao + direct * (0.55 + 0.45 * ao)) + spec * ao;

  // glossy surfaces reflect the sky glow a little
  if (gloss > 0.0 && vDomain < 1.5) {
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col += fogSky(reflect(-V, N)) * fres * gloss * 0.6;
  }

  // snow glitter in light: tiny view-dependent sparkles, never larger than ~2 pixels
  if (snowy > 0.5 && dist < 30.0) {
    float pxw = length(fwidth(vWorld));
    vec3 g = floor(vWorld * 60.0);
    float sh = hash13(g);
    if (sh > 0.97 && pxw > 0.008) {
      vec3 rnd = normalize(hash33(g) - 0.5);
      float tw = pow(max(dot(reflect(-V, N), rnd), 0.0), 60.0);
      float lum = dot(direct, vec3(0.33));
      col += vec3(1.0, 0.95, 0.85) * min(1.6, tw * lum * 5.0) * (1.0 - dist / 30.0);
    }
  }

  // emissive
  vec3 emis = p1.rgb;
  float flag = vFlag;
  if (emitKind > 0.5) {
    if (emitKind < 1.5) {
      float litO;
      vec3 w = shadeWindow(vExtra, vInst.x, vUV, vSize, vDir, vViewL, uVoxelScale, N, V, length(emis) * 0.55, litO);
      col = w + col * 0.15;
    } else if (emitKind < 2.5) {
      col += emis * flag;
    } else if (emitKind < 3.5) {
      float fk = 0.93 + 0.07 * sin(uTime * 628.0);
      float burst = step(0.995, hash11(floor(uTime * 12.0) + vInst.x * 77.0)) * (1.0 - flag * 0.0);
      col += emis * flag * fk * (1.0 - 0.8 * burst);
    } else if (emitKind < 4.5) {
      float fl2 = 0.5 + 0.5 * vnoise2(vec2(uTime * 7.0, vInst.x * 40.0));
      col += emis * fl2 * flag;
    } else if (emitKind < 5.5) {
      float lit = step(hash12(vec2(vInst.x * 41.0, vExtra + floor(vWorld.y / 1.4))), 0.75);
      col += emis * lit * mix(0.35, 1.0, uNight) * (0.6 + 0.4 * hash11(vExtra + vInst.x * 13.0));
    } else if (emitKind < 6.5) {
      col += emis * flag * uStreetOn;
    }
  }

  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`

const glassFragment = /* glsl */ `
uniform sampler2D uPalette;
${commonUniformsGLSL}
${hashGLSL}
${lightingGLSL}
${fogGLSL}
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vN;
varying float vAO;
varying vec2 vUV;
flat varying float vMat;
flat varying float vExtra;
flat varying float vDomain;
flat varying vec4 vInst;
flat varying float vFlag;
flat varying vec2 vSize;

void main() {
  vec4 p0 = texture2D(uPalette, vec2((vMat + 0.5) / 256.0, 0.25));
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  bool indoor = vDomain > 1.5;
  vec3 spec = vec3(0.0);
  vec3 direct = evalLights(vWorld, N, vDomain, V, 0.9, 0.0, spec);
  vec3 amb = indoor ? uIndoorAmb : uSkyAmb;
  // frost creeps in from the edges of outdoor panes only (a thin band), plus a little grime
  vec2 ed = min(vUV, 1.0 - vUV) * vSize * 0.25; // meters to the pane edge
  float edge = min(ed.x, ed.y);
  float frost = indoor ? 0.0 : (1.0 - smoothstep(0.01, 0.09, edge + (vnoise2(vWorld.xz * 9.0 + vWorld.y * 7.0) - 0.5) * 0.05));
  float dirt = vnoise2(vec2(vWorld.x + vWorld.z, vWorld.y) * 3.0) * 0.5;
  vec3 tint = p0.rgb * 0.25;
  vec3 col = tint * (amb + direct) + spec * 0.6;
  if (!indoor) col += fogSky(reflect(-V, N)) * fres * 0.5;
  col += vec3(0.75, 0.8, 0.85) * frost * 0.45 * (amb * 2.0 + direct * 0.8 + 0.01);
  float alpha = clamp(0.06 + fres * (indoor ? 0.2 : 0.4) + frost * 0.45 + dirt * 0.08, 0.0, 0.9);
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, alpha);
}
`

/** Create voxel materials for LOD levels and glass, sharing `uniforms`. */
export function createVoxelMaterials(shared, maxLods = 3) {
  shared.uPalette.value = getPaletteTexture()
  const voxel = []
  for (let i = 0; i < maxLods; i++) {
    const f = [1, 2, 4][i]
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uVoxelScale: { value: VOXEL * f }, uDetail: { value: i === 0 ? 1 : 0 } },
      vertexShader: voxelVertex,
      fragmentShader: voxelFragment,
    })
    m.name = 'voxel_L' + i
    voxel.push(m)
  }
  const terrain = new THREE.ShaderMaterial({
    uniforms: { ...shared, uVoxelScale: { value: VOXEL }, uDetail: { value: 1 } },
    vertexShader: voxelVertex,
    fragmentShader: voxelFragment,
  })
  terrain.name = 'terrain'
  const glass = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: voxelVertex,
    fragmentShader: glassFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  glass.name = 'glass'
  return { voxel, terrain, glass }
}

export { voxelVertex, voxelFragment }
