// Grass: tufts of blades all around you, placed and swayed entirely on the
// graphics card. Every tuft sits on a fixed spot in the world (a hashed grid
// point), so as you walk the field doesn't swim; the vertex shader reads the
// height map, the grass mask (no grass on roads, floors, sand or rock) and
// the field map (golden wheat in the wheat fields) and bends the blades in
// the wind. Tufts thin out with distance and are gone by the edge of the patch.
import * as THREE from 'three';
import { HEIGHT_GLSL } from './terrainView.js';
import { grassBladeTex, flowerTex } from '../textures.js';
import { HALF } from './layout.js';
import { N } from './terrain.js';

function tuftGeometry(w = 1.7, h = 1.6) {
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2, b = k * 4;
    pos.push(-c, 0, -s, c, 0, s, c, h, s, -c, h, -s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(world, T, terrainView, o = {}) {
    this.world = world; this.T = T;
    const R = o.radius ?? 68, step = o.step ?? 1.15;
    this.R = R; this.step = step;
    // the mask textures
    const FN = T.fineN;
    this.maskTex = new THREE.DataTexture(T.fine, FN, FN, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.unpackAlignment = 1; // rows of an odd number of bytes
    this.maskTex.minFilter = this.maskTex.magFilter = THREE.LinearFilter; this.maskTex.generateMipmaps = false; this.maskTex.needsUpdate = true;
    const fd = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) fd[i] = Math.round(T.field[i] * 255);
    this.fieldTex = new THREE.DataTexture(fd, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    this.fieldTex.unpackAlignment = 1;
    this.fieldTex.minFilter = this.fieldTex.magFilter = THREE.LinearFilter; this.fieldTex.generateMipmaps = false; this.fieldTex.needsUpdate = true;
    this.uni = {
      hMap: terrainView.uniforms.hMap, wT0: terrainView.uniforms.wT0, wT1: terrainView.uniforms.wT1, gMask: { value: this.maskTex }, fieldT: { value: this.fieldTex },
      gCenter: { value: new THREE.Vector2() }, gStep: { value: step }, gRadius: { value: R }, wind: { value: new THREE.Vector2(0.4, 0) },
    };
    this.meshes = [];
    this._make('grass', grassBladeTex(), R, step, 1);
    this._make('flowers', flowerTex(), R * 0.7, step * 3.2, 0.7);
  }

  _make(kind, tex, R, step, size) {
    const n = Math.ceil(R / step);
    const idx = new Float32Array((2 * n + 1) * (2 * n + 1) * 2);
    let c = 0;
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) { if (i * i + j * j > n * n) continue; idx[c++] = i; idx[c++] = j; }
    const g = tuftGeometry(1.7 * size, 1.6 * size);
    g.setAttribute('gIdx', new THREE.InstancedBufferAttribute(idx.slice(0, c), 2));
    g.instanceCount = c / 2;
    const flowers = kind === 'flowers';
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
    const uni = { ...this.uni, gStep: { value: step }, gRadius: { value: R } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 gIdx;
uniform vec2 gCenter, wind; uniform float gStep, gRadius;
uniform sampler2D gMask, wT0, wT1, fieldT;
varying vec3 vTint; varying float vRoot;
${HEIGHT_GLSL}
float hh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
vec2 cellP = floor(gCenter / gStep + 0.5) * gStep + gIdx * gStep;
float r1 = hh(cellP), r2 = hh(cellP + 17.31), r3 = hh(cellP + 41.7), r4 = hh(cellP - 9.13);
vec2 wxz = cellP + (vec2(r1, r2) - 0.5) * gStep * 1.3;
vec2 muv = (wxz + ${HALF.toFixed(1)}) / 4.0 / ${T_FN(this.T)}.0 + 0.5 / ${T_FN(this.T)}.0;
float dens = texture2D(gMask, muv).r;
vec2 wuv = ((wxz + ${HALF.toFixed(1)}) / 8.0 + 0.5) / ${N.toFixed(1)};
vec4 tw = texture2D(wT0, wuv); vec4 tw1 = texture2D(wT1, wuv);
dens *= 1.0 - smoothstep(0.1, 0.35, tw1.r + tw1.b + tw1.a * 1.5 + tw.a * 0.6);
float field = texture2D(fieldT, wuv).r;
float wheat = smoothstep(0.5, 0.6, field) * (1.0 - smoothstep(0.8, 0.9, field));
float forest = tw.b;
${flowers ? 'dens *= tw.g * 1.4 * (1.0 - forest) * (1.0 - wheat);' : 'dens *= mix(1.0, 0.25, forest);'}
float dist = length(wxz - cameraPosition.xz);
float fade = 1.0 - smoothstep(gRadius * 0.55, gRadius, dist);
float keep = step(r3, dens * 1.05);
float s = keep * fade * (0.65 + r4 * 0.7);
float ang = r2 * 6.2832;
vec3 lp = position;
lp.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * lp.xz;
float tall = ${flowers ? '1.0' : '1.0 + wheat * 1.4 + tw.g * 0.35 - forest * 0.3'};
lp.y *= tall;
lp *= s;
// the wind bends the tops
float top = uv.y * uv.y;
float gust = sin(wind.y * 1.7 + wxz.x * 0.09 + wxz.y * 0.06) * 0.5 + sin(wind.y * 3.1 + wxz.x * 0.21) * 0.25;
lp.x += top * (0.25 + gust) * wind.x * 0.9 * s;
lp.z += top * gust * wind.x * 0.4 * s;
vec3 transformed = vec3(wxz.x + lp.x, hAt(wxz) - 0.05 + lp.y, wxz.y + lp.z);
vRoot = uv.y;
vec3 green = mix(vec3(0.72, 0.9, 0.4), vec3(1.0, 0.92, 0.5), tw.g * 0.75 + r1 * 0.2);
green = mix(green, vec3(1.25, 1.02, 0.5), wheat);
green = mix(green, vec3(0.55, 0.62, 0.35), forest * 0.6);
vTint = green * (0.85 + r4 * 0.3);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying float vRoot;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal); // both sides of a blade face up (else the backs go black)')
        .replace('#include <map_fragment>', `#include <map_fragment>
${flowers ? '' : 'diffuseColor.rgb *= vTint;'}
diffuseColor.rgb *= mix(0.6, 1.1, smoothstep(0.0, 0.8, vRoot));`);
    };
    mat.customProgramCacheKey = () => 'ob-grass-' + kind;
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
    this.world.scene.add(m);
    this.meshes.push(m);
    return m;
  }

  /** After buildings have cleared their footprints. */
  refresh() { this.maskTex.needsUpdate = true; }

  update(dt, camera, sky) {
    const u = this.uni;
    u.gCenter.value.set(camera.position.x, camera.position.z);
    u.wind.value.set(0.35 + (sky?.w.wind ?? 0.3) * 1.2, u.wind.value.y + dt);
  }
}
function T_FN(T) { return T.fineN; }
