// Builds three.js meshes for the compiled world: one merged mesh per texture,
// texture UVs projected Hammer-style, plus a shared lightmap atlas.

import * as THREE from 'three';
import { textureAxes, lightmapUV } from './lightmap.js';

const VERT = /* glsl */`
  attribute vec2 uv1;
  varying vec2 vUv;
  varying vec2 vLm;
  void main() {
    vUv = uv;
    vLm = uv1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform sampler2D lightmap;
  uniform float brightness;
  uniform float lightGamma;
  uniform float fullbright;
  varying vec2 vUv;
  varying vec2 vLm;
  void main() {
    vec4 t = texture2D(map, vUv);
    #ifdef ALPHATEST
      if (t.a < 0.5) discard;
    #endif
    vec3 l = texture2D(lightmap, vLm).rgb * 2.0;
    l = pow(l, vec3(lightGamma));
    l = mix(l, vec3(1.0), fullbright);
    gl_FragColor = vec4(t.rgb * l * brightness, 1.0);
  }
`;

export const worldUniforms = {
  brightness: { value: 1.0 },
  lightGamma: { value: 0.7 },
  fullbright: { value: 0.0 },
};

// GoldSrc-style light curve, shared by the world shader and model lighting:
// `gamma` (default 2.5) bends light values like the engine's lightgamma table,
// lifting shadows while leaving full sunlight (1.0) unchanged; `brightness`
// (default 1, up to 2 in the options) adds a mild overall boost.
export function setLightCurve(gamma = 2.5, brightness = 1) {
  worldUniforms.lightGamma.value = 1.75 / Math.max(1.0, Math.min(3.5, gamma));
  worldUniforms.brightness.value = 0.85 + 0.15 * Math.max(0, Math.min(2, brightness));
}

export function lightCurve(l) {
  return Math.pow(Math.max(0, l), worldUniforms.lightGamma.value) * worldUniforms.brightness.value;
}

export function createWorldMaterial(tex, lightmapTex, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      lightmap: { value: lightmapTex },
      brightness: worldUniforms.brightness,
      lightGamma: worldUniforms.lightGamma,
      fullbright: worldUniforms.fullbright,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: alpha ? { ALPHATEST: 1 } : {},
    side: THREE.FrontSide,
  });
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// texInfo(name) -> { world:[wu,wv] }
export function buildWorldMeshes(faces, alloc, lightmapTex, getTexture, texInfo) {
  const groups = new Map();
  for (const f of faces) {
    let g = groups.get(f.texName);
    if (!g) groups.set(f.texName, g = []);
    g.push(f);
  }
  const meshes = [];
  const lm = [0, 0];
  for (const [name, list] of groups) {
    let nTri = 0;
    for (const f of list) nTri += f.poly.length - 2;
    const pos = new Float32Array(nTri * 9);
    const uv = new Float32Array(nTri * 6);
    const uv1 = new Float32Array(nTri * 6);
    const info = texInfo(name) || { world: [128, 128] };
    let p = 0, q = 0;
    for (const f of list) {
      const spec = typeof f.tex === 'object' ? f.tex : {};
      const ax = textureAxes(f.n);
      const scale = spec.scale || [1, 1];
      const off = spec.offset || [0, 0];
      const rot = (spec.rot || 0) * Math.PI / 180;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      let fit = null;
      if (spec.fit) {
        let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
        for (const v of f.origPoly) {
          const s = dot3(v, ax.s), t = dot3(v, ax.t);
          if (s < smin) smin = s; if (s > smax) smax = s;
          if (t < tmin) tmin = t; if (t > tmax) tmax = t;
        }
        fit = { smin, ds: Math.max(1e-3, smax - smin), tmin, dt: Math.max(1e-3, tmax - tmin) };
      }
      const uvOf = (v) => {
        let u, w;
        if (fit) {
          u = (dot3(v, ax.s) - fit.smin) / fit.ds * (spec.repeat ? spec.repeat[0] : 1);
          w = (dot3(v, ax.t) - fit.tmin) / fit.dt * (spec.repeat ? spec.repeat[1] : 1);
        } else {
          u = (dot3(v, ax.s) / scale[0] + off[0]) / info.world[0];
          w = (dot3(v, ax.t) / scale[1] + off[1]) / info.world[1];
        }
        const ru = u * cr - w * sr, rw = u * sr + w * cr;
        return [ru, -rw];
      };
      const v0 = f.poly[0];
      const uv0 = uvOf(v0);
      const lm0 = lightmapUV(f, v0, alloc.width, alloc.height, [0, 0]);
      for (let i = 1; i + 1 < f.poly.length; i++) {
        const v1 = f.poly[i], v2 = f.poly[i + 1];
        // winding: face normal should point toward viewer (CCW). Ensure order.
        const tri = [v0, v1, v2];
        const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const flip = dot3(c, f.n) < 0;
        const order = flip ? [0, 2, 1] : [0, 1, 2];
        for (const k of order) {
          const v = tri[k];
          pos[p * 3] = v[0]; pos[p * 3 + 1] = v[1]; pos[p * 3 + 2] = v[2];
          const t = k === 0 ? uv0 : uvOf(v);
          uv[p * 2] = t[0]; uv[p * 2 + 1] = t[1];
          const l = k === 0 ? lm0 : lightmapUV(f, v, alloc.width, alloc.height, lm);
          uv1[p * 2] = l[0]; uv1[p * 2 + 1] = l[1];
          p++;
        }
      }
      q++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mat = createWorldMaterial(getTexture(name), lightmapTex, !!info.alpha);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'world:' + name;
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }
  return meshes;
}

export function makeLightmapTexture(rgba, W, H) {
  const tex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function makeWorldTexture(canvas, meta = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 1;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
