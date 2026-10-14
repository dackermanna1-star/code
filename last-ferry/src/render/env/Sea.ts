// The gameplay sea around the pier (y = PIER.waterY): a MeshStandardMaterial
// (so it takes the sun/moon shadow of the pier, the lamps' and lighthouse's
// specular glints and the fog) extended with
//  * layered moving wave normals (swell, chop, ripples),
//  * an analytic Fresnel sky reflection using the shared sky function (the
//    same sky the backdrop shows), sun / moon glitter,
//  * foam rings around every piling and along the ferry's hull (a CPU-baked
//    proximity map, animated with noise), shade under the deck,
//  * fading out across the seam band into the backdrop sea (screen space).
import * as THREE from 'three';
import { PIER } from '../../config/world';
import { NOISE_GLSL, SKY_FN_GLSL, SKY_PARS_GLSL, dirSpecularScaledLightsChunk, type SkyUniforms } from './glsl';
import { SEAM_V0, SEAM_V1 } from './Backdrop';

export const FOAM_RECT = { minX: -40, minZ: -12, sizeX: 76, sizeZ: 30 };

export interface SeaUniforms {
  uSeaDeep: { value: THREE.Vector3 };
  uSeaShallow: { value: THREE.Vector3 };
  uGlitter: { value: number };
}

export function createSeaUniforms(): SeaUniforms {
  return {
    uSeaDeep: { value: new THREE.Vector3(0.01, 0.02, 0.04) },
    uSeaShallow: { value: new THREE.Vector3(0.02, 0.05, 0.07) },
    uGlitter: { value: 1 },
  };
}

/**
 * Bake the foam proximity map: R = closeness to a piling / hull (1 at the
 * surface, 0 beyond ~1.3 m), G = under-deck shade.
 */
export function bakeFoamMap(pilings: Array<{ x: number; z: number; r: number }>, hullX: number): THREE.DataTexture {
  const res = 10; // px per metre
  const W = FOAM_RECT.sizeX * res;
  const H = FOAM_RECT.sizeZ * res;
  const data = new Uint8Array(W * H * 4);
  const dist = new Float32Array(W * H).fill(99);
  const reach = 1.4;
  for (const p of pilings) {
    const x0 = Math.max(0, Math.floor((p.x - reach - p.r - FOAM_RECT.minX) * res));
    const x1 = Math.min(W - 1, Math.ceil((p.x + reach + p.r - FOAM_RECT.minX) * res));
    const z0 = Math.max(0, Math.floor((p.z - reach - p.r - FOAM_RECT.minZ) * res));
    const z1 = Math.min(H - 1, Math.ceil((p.z + reach + p.r - FOAM_RECT.minZ) * res));
    for (let j = z0; j <= z1; j++) {
      for (let i = x0; i <= x1; i++) {
        const wx = FOAM_RECT.minX + (i + 0.5) / res;
        const wz = FOAM_RECT.minZ + (j + 0.5) / res;
        const d = Math.hypot(wx - p.x, wz - p.z) - p.r;
        const k = j * W + i;
        if (d < dist[k]) dist[k] = d;
      }
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const wx = FOAM_RECT.minX + (i + 0.5) / res;
      const wz = FOAM_RECT.minZ + (j + 0.5) / res;
      const k = j * W + i;
      // Hull side (x ≥ hullX) along the ferry.
      const dh = Math.abs(wx - hullX);
      const d = Math.min(dist[k], dh + 0.05);
      const foam = Math.max(0, 1 - Math.max(0, d) / reach);
      // Shade under the deck (soft edges).
      const inX = smooth(PIER.minX - 0.5, PIER.minX + 1.5, wx) * (1 - smooth(PIER.maxX - 1.5, PIER.maxX + 0.5, wx));
      const inZ = smooth(PIER.minZ - 0.8, PIER.minZ + 1.6, wz) * (1 - smooth(PIER.maxZ - 1.6, PIER.maxZ + 0.8, wz));
      const hull = smooth(hullX - 0.3, hullX + 2.5, wx);
      const shadeV = Math.max(inX * inZ, hull * 0.8);
      data[k * 4] = Math.round(foam * foam * 255);
      data[k * 4 + 1] = Math.round(shadeV * 255);
      data[k * 4 + 2] = 0;
      data[k * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface MainSeaUniforms extends SeaUniforms {
  uFoamMap: { value: THREE.Texture | null };
  uFoamRect: { value: THREE.Vector4 };
  uRes: { value: THREE.Vector2 };
  uSeam: { value: THREE.Vector2 };
  uFoamCol: { value: THREE.Vector3 };
  /** Departing ferry wake in the gameplay sea: x offset of the hull, strength. */
  uHullWake: { value: THREE.Vector2 };
  /** Scale on the key (directional) light for the water: its gameplay elevation would put glints everywhere. */
  uSeaDirK: { value: number };
}

export function createMainSea(sky: SkyUniforms, sea: SeaUniforms, foam: THREE.Texture): { mesh: THREE.Mesh; uniforms: MainSeaUniforms } {
  const u: MainSeaUniforms = {
    ...sea,
    uFoamMap: { value: foam },
    uFoamRect: { value: new THREE.Vector4(FOAM_RECT.minX, FOAM_RECT.minZ, FOAM_RECT.sizeX, FOAM_RECT.sizeZ) },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uSeam: { value: new THREE.Vector2(SEAM_V0, SEAM_V1) },
    uFoamCol: { value: new THREE.Vector3(0.55, 0.6, 0.65) },
    uHullWake: { value: new THREE.Vector2(0, 0) },
    uSeaDirK: { value: 0.3 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.07,
    metalness: 0,
    transparent: true,
    envMapIntensity: 0,
  });
  mat.name = 'MainSea';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sky, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSeaWorld;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vSeaWorld;
        ${SKY_PARS_GLSL}
        uniform vec3 uSeaDeep, uSeaShallow, uFoamCol;
        uniform float uGlitter;
        uniform sampler2D uFoamMap;
        uniform vec4 uFoamRect;
        uniform vec2 uRes, uSeam, uHullWake;
        uniform float uSeaDirK;
        ${NOISE_GLSL}
        ${SKY_FN_GLSL}
        vec2 seaGrad(vec2 p, float t) {
          vec3 a = envNoiseD(p * vec2(0.09, 0.16) + vec2(t * 0.05, t * 0.11));
          vec3 b = envNoiseD(p * vec2(0.32, 0.55) + vec2(-t * 0.21, t * 0.17) + 5.0);
          vec3 c = envNoiseD(p * vec2(1.1, 1.6) + vec2(t * 0.45, -t * 0.32) + 11.0);
          vec3 d = envNoiseD(p * vec2(2.9, 3.7) + vec2(-t * 0.8, t * 0.6) + 17.0);
          // Long swell lines running along x (toward the pier).
          float sw = sin(p.y * 0.55 + p.x * 0.08 - t * 1.1);
          vec2 g = a.yz * vec2(0.09, 0.16) * 0.9 + b.yz * vec2(0.32, 0.55) * 0.17 + c.yz * vec2(1.1, 1.6) * 0.04 + d.yz * vec2(2.9, 3.7) * 0.012;
          g.y += cos(p.y * 0.55 + p.x * 0.08 - t * 1.1) * 0.025;
          return g * (1.0 + 0.15 * sw);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 sp = vSeaWorld.xz;
        vec2 sg = seaGrad(sp, uTime);
        vec3 seaN = normalize(vec3(-sg.x, 1.0, -sg.y));
        vec2 fUv = (sp - uFoamRect.xy) / uFoamRect.zw;
        vec4 fm = texture2D(uFoamMap, fUv);
        float inRect = step(0.0, fUv.x) * step(fUv.x, 1.0) * step(0.0, fUv.y) * step(fUv.y, 1.0);
        float near = fm.r * inRect;
        float under = fm.g * inRect;
        // Foam: rings that breathe with the swell, broken up by noise.
        float fn = envNoise(sp * 2.4 + vec2(uTime * 0.3, -uTime * 0.2)) * 0.6 + envNoise(sp * 7.0 - uTime * 0.5) * 0.4;
        float swell = 0.5 + 0.5 * sin(uTime * 1.3 + sp.x * 0.35 + sp.y * 0.2);
        float foam = smoothstep(0.55, 0.9, near * (0.75 + 0.4 * swell) + fn * 0.45 - 0.15);
        foam += smoothstep(0.8, 1.0, near) * 0.6;
        // Sparse whitecaps out on the water.
        float wc = smoothstep(0.66, 0.8, envFbm3(sp * vec2(0.22, 0.4) + vec2(uTime * 0.05, uTime * 0.015))) * smoothstep(0.55, 0.85, envNoise(sp * vec2(2.0, 4.0) + uTime * 0.7));
        foam = clamp(foam + wc * 0.14, 0.0, 1.0);
        // Hull wake of the departing ferry.
        float hw = uHullWake.y * smoothstep(uHullWake.x + 6.0, uHullWake.x - 2.0, sp.x) * smoothstep(uHullWake.x - 12.0, uHullWake.x - 1.0, sp.x) * (0.4 + 0.6 * envNoise(sp * 1.5 + uTime));
        foam = clamp(foam + hw, 0.0, 1.0);
        float crest = clamp(0.5 + dot(sg, vec2(0.7, 0.9)) * 3.0, 0.0, 1.0);
        vec3 water = mix(uSeaDeep, uSeaShallow, crest * 0.7 + near * 0.4);
        diffuseColor.rgb = mix(water, uFoamCol, foam * 0.85);
        float seaFoam = foam;
        float seaUnder = under;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(0.13, 0.6, seaFoam);`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        dirSpecularScaledLightsChunk('uSeaDirK'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(seaN, 0.0)).xyz);`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
          vec3 Vw = normalize(cameraPosition - vSeaWorld);
          float ndv = clamp(dot(seaN, Vw), 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
          vec3 R = reflect(-Vw, seaN);
          R.y = abs(R.y);
          vec3 sky = skyPhysical(R);
          // Sun / moon glitter on the open water (the lights add their own glints too).
          float sd = max(dot(R, normalize(vec3(uSunDir.x, max(uSunDir.y, 0.0) + 0.24, uSunDir.z))), 0.0);
          vec3 glit = uSunDisc * pow(sd, 400.0) * 0.03 * uGlitter;
          float md = max(dot(R, normalize(vec3(uMoonDir.x, uMoonDir.y + 0.22, uMoonDir.z))), 0.0);
          glit += vec3(0.8, 0.9, 1.1) * (pow(md, 500.0) * 3.0 + pow(md, 60.0) * 0.03) * uMoon * uGlitter;
          float shadeK = 1.0 - 0.75 * seaUnder;
          vec3 refl = (sky * fres * (1.0 - seaFoam)) * shadeK;
          outgoingLight = outgoingLight + refl + glit * (1.0 - seaFoam) * shadeK;
          outgoingLight *= 1.0 - 0.55 * seaUnder;
          // Fade into the backdrop across the seam band.
          float sv = 1.0 - gl_FragCoord.y / uRes.y;
          diffuseColor.a = smoothstep(uSeam.x, uSeam.y, sv);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'lf-main-sea-v1';
  // Covers the frame below the seam (and a margin for screen shake).
  const geo = new THREE.PlaneGeometry(220, 70, 1, 1).rotateX(-Math.PI / 2).translate(0, PIER.waterY, -2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Sea';
  mesh.receiveShadow = true;
  mesh.renderOrder = -5;
  return { mesh, uniforms: u };
}
