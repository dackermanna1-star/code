import * as THREE from 'three';
import type { BakedSurface } from '../render/TextureBaker';

export interface PattyLook {
  raw: BakedSurface;
  cooked: BakedSurface;
  char: BakedSurface;
  /** multiplies cooked color (chicken is lighter/golden) */
  cookedTint: THREE.Color;
  /** grill mark strength */
  marks: number;
  /** how strongly raw color reads (chicken batter is pale) */
  rawSheen: number;
}

/**
 * Patty material: a MeshPhysicalMaterial whose fragment shader blends
 * raw → browned → deep brown → charred per face, based on per-instance cook
 * uniforms. Grill marks appear on faces that touched the grates, fat glistens
 * while cooking, and the whole thing dries out as it overcooks.
 */
export function createPattyMaterial(look: PattyLook, halfThickness: number): THREE.MeshPhysicalMaterial & { userData: { uniforms: PattyUniforms } } {
  const uniforms: PattyUniforms = {
    uCookTop: { value: 0 },
    uCookBottom: { value: 0 },
    uHalfT: { value: halfThickness },
    uRawMap: { value: look.raw.map },
    uCookedMap: { value: look.cooked.map },
    uCharMap: { value: look.char.map },
    uCookedTint: { value: look.cookedTint },
    uMarks: { value: look.marks },
    uSizzle: { value: 0 },
    uHighlight: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    map: look.raw.map,
    normalMap: look.cooked.normalMap ?? null,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.35,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xff9a7a),
  }) as THREE.MeshPhysicalMaterial & { userData: { uniforms: PattyUniforms } };
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => 'patty-v1';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vObjPos = position;
        vObjNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        uniform float uCookTop;
        uniform float uCookBottom;
        uniform float uHalfT;
        uniform sampler2D uRawMap;
        uniform sampler2D uCookedMap;
        uniform sampler2D uCharMap;
        uniform vec3 uCookedTint;
        uniform float uMarks;
        uniform float uSizzle;
        uniform float uHighlight;
        float pHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float pNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(pHash(i), pHash(i+vec2(1,0)), f.x), mix(pHash(i+vec2(0,1)), pHash(i+vec2(1,1)), f.x), f.y); }
        float gCook;
        float gMark;
        float gChar;`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec3 on = normalize(vObjNormal);
        float topness = smoothstep(-0.35, 0.35, on.y);
        float faceMask = smoothstep(0.55, 0.85, abs(on.y));
        float yN = clamp(vObjPos.y / max(uHalfT, 1e-4), -1.0, 1.0);
        float faceCook = mix(uCookBottom, uCookTop, topness);
        float through = (uCookTop + uCookBottom) * 0.5;
        float sideCook = max(max(uCookTop * smoothstep(0.1, 1.0, yN), uCookBottom * smoothstep(-0.1, -1.0, yN)), through * 0.9);
        float c = mix(sideCook, faceCook, faceMask);
        float n = pNoise(vObjPos.xz * 180.0) * 0.6 + pNoise(vObjPos.xz * 520.0) * 0.4;
        vec3 rawC = texture2D(uRawMap, vMapUv).rgb;
        vec3 cookC = texture2D(uCookedMap, vMapUv).rgb * uCookedTint;
        vec3 charC = texture2D(uCharMap, vMapUv).rgb;
        // uneven browning
        float brown = smoothstep(0.06, 0.42, c + (n - 0.5) * 0.22);
        vec3 col = mix(rawC, cookC, brown);
        // grey band before crust forms (sides mostly)
        col = mix(col, vec3(0.42, 0.33, 0.3) * 0.8, (1.0 - faceMask) * smoothstep(0.05, 0.3, c) * (1.0 - smoothstep(0.3, 0.7, c)) * 0.35);
        // deepen as it keeps cooking
        col *= mix(1.1, 0.62, smoothstep(0.5, 0.98, c));
        // char
        gChar = smoothstep(0.88, 1.12, c + (n - 0.5) * 0.25);
        col = mix(col, charC, gChar);
        // grill marks (diagonal, object space)
        float stripe = sin((vObjPos.x * 0.7071 + vObjPos.z * 0.7071) * 6.2831 / 0.017);
        float mark = smoothstep(0.35, 0.85, stripe) * faceMask;
        gMark = mark * smoothstep(0.18, 0.5, faceCook) * uMarks * (1.0 - gChar * 0.7);
        col = mix(col, vec3(0.05, 0.025, 0.012), gMark * 0.88);
        gCook = c;
        vec4 sampledDiffuseColor = vec4(col, 1.0);
        diffuseColor *= sampledDiffuseColor;
        diffuseColor.rgb += uHighlight * 0.08;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wet = 1.0 - smoothstep(0.0, 0.5, gCook);
        float grease = smoothstep(0.25, 0.6, gCook) * (1.0 - smoothstep(0.85, 1.05, gCook)) * uSizzle;
        roughnessFactor = mix(0.55, 0.3, wet);
        roughnessFactor = mix(roughnessFactor, 0.22, grease * step(0.72, pNoise(vObjPos.xz * 300.0)));
        roughnessFactor = mix(roughnessFactor, 0.9, gChar);
        roughnessFactor = mix(roughnessFactor, 0.75, gMark * 0.6);`,
      )
      .replace(
        '#include <clearcoat_normal_fragment_begin>',
        `#include <clearcoat_normal_fragment_begin>`,
      );
    // modulate normal map intensity (crust gets bumpier)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>`,
    );
    mat.userData.shader = shader;
  };
  return mat;
}

export interface PattyUniforms {
  uCookTop: { value: number };
  uCookBottom: { value: number };
  uHalfT: { value: number };
  uRawMap: { value: THREE.Texture };
  uCookedMap: { value: THREE.Texture };
  uCharMap: { value: THREE.Texture };
  uCookedTint: { value: THREE.Color };
  uMarks: { value: number };
  uSizzle: { value: number };
  uHighlight: { value: number };
}
