// Ice-top material: MeshStandardMaterial (so it receives shadows and the scene
// lights like everything else) extended through onBeforeCompile with
//  * a painted, world-anchored haze field matching the original's misty floe
//    (pale grey-blue with a bright plume through the middle),
//  * lighting normalised so the unshadowed ice shows exactly that haze colour
//    and shadows only remove the key light's share,
//  * subtle procedural normal / roughness variation,
//  * the backdrop render target sampled mirrored about the floe's back edge
//    (the iceberg's soft reflection, fading with distance from the edge),
//  * the planar character reflection (blurred, low opacity),
//  * a premultiplied-alpha decal map (blood, scorch) composited onto the
//    albedo, wet (glossier, darker) where its alpha is high.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export const MIRROR_SAMPLES = 33;

export interface IceUniforms {
  uDesignVP: { value: THREE.Matrix4 };
  uBackdrop: { value: THREE.Texture | null };
  uMirrorLine: { value: Float32Array };
  uMirrorStrength: { value: number };
  uMirrorFalloff: { value: number };
  uMirrorStretch: { value: number };
  uReflMap: { value: THREE.Texture | null };
  uReflMatrix: { value: THREE.Matrix4 };
  uReflStrength: { value: number };
  uReflTexel: { value: THREE.Vector2 };
  uDecalMap: { value: THREE.Texture | null };
  uDecalRect: { value: THREE.Vector4 };
  uAlbedoNorm: { value: THREE.Vector3 };
  uIceBase: { value: THREE.Vector3 };
  uIceHaze: { value: THREE.Vector3 };
  uIceTop: { value: THREE.Vector3 };
  uTime: { value: number };
}

export function createIceUniforms(): IceUniforms {
  return {
    uDesignVP: { value: new THREE.Matrix4() },
    uBackdrop: { value: null },
    uMirrorLine: { value: new Float32Array(MIRROR_SAMPLES) },
    uMirrorStrength: { value: 0.72 },
    uMirrorFalloff: { value: 0.17 },
    uMirrorStretch: { value: 1.0 },
    uReflMap: { value: null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflStrength: { value: 0.0 },
    uReflTexel: { value: new THREE.Vector2(1 / 640, 1 / 480) },
    uDecalMap: { value: null },
    uDecalRect: { value: new THREE.Vector4(-30, -25, 60, 50) },
    uAlbedoNorm: { value: new THREE.Vector3(1, 1, 1) },
    // Pre-tone-mapping linear colours (ACES inverse of the original's sRGB tones).
    uIceBase: { value: new THREE.Vector3(0.24, 0.3, 0.37) }, // ~#9eabb7 on screen
    uIceHaze: { value: new THREE.Vector3(0.9, 1.0, 1.11) }, // #dfe2e5
    uIceTop: { value: new THREE.Vector3(0.5, 0.53, 0.62) }, // #c5c8cf
    uTime: { value: 0 },
  };
}

export function createIceMaterial(u: IceUniforms, opts: { reflections: boolean }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0,
    envMapIntensity: 0,
  });
  mat.name = 'IceTop';
  mat.defines = { ...(mat.defines ?? {}), ...(opts.reflections ? { ICE_REFL: '' } : {}) };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vIceWorld;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `#include <worldpos_vertex>
        vIceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vIceWorld;
        uniform mat4 uDesignVP;
        uniform sampler2D uBackdrop;
        uniform float uMirrorLine[${MIRROR_SAMPLES}];
        uniform float uMirrorStrength, uMirrorFalloff, uMirrorStretch;
        uniform sampler2D uReflMap;
        uniform mat4 uReflMatrix;
        uniform float uReflStrength;
        uniform vec2 uReflTexel;
        uniform sampler2D uDecalMap;
        uniform vec4 uDecalRect;
        uniform vec3 uAlbedoNorm, uIceBase, uIceHaze, uIceTop;
        uniform float uTime;
        ${NOISE_GLSL}
        float iceMirrorLine(float u) {
          float f = clamp(u, 0.0, 1.0) * float(${MIRROR_SAMPLES - 1});
          int i = int(min(floor(f), float(${MIRROR_SAMPLES - 2})));
          return mix(uMirrorLine[i], uMirrorLine[i + 1], f - float(i));
        }
        // Painted haze field in design-frame coordinates (u right, v down).
        vec3 iceHaze(vec2 sv, out float hazeAmt) {
          float u = sv.x, v = sv.y;
          // Bright plume running from the upper left towards the lower middle.
          float uc = 0.25 + (v - 0.44) * 0.5;
          float plume = exp(-pow(u - uc, 2.0) / (2.0 * 0.105 * 0.105));
          plume *= smoothstep(0.93, 0.6, v) * smoothstep(0.33, 0.43, v);
          // Misty glow along the back edge on the left.
          float glow = exp(-pow((u - 0.08) / 0.2, 2.0) - pow((v - 0.4) / 0.085, 2.0));
          // Haze band through the middle of the floe.
          float band = exp(-pow((v - 0.5) / 0.09, 2.0)) * 0.25;
          float h = clamp(plume * 0.95 + glow * 0.3 + band * (1.0 - plume), 0.0, 1.0);
          hazeAmt = clamp(plume + glow * 0.8, 0.0, 1.0);
          vec3 c = mix(uIceBase, uIceHaze, h * h * 0.35 + h * 0.65);
          // A little brighter towards the back edge overall.
          c = mix(c, uIceTop, smoothstep(0.52, 0.33, v) * 0.35 * (1.0 - h));
          return c;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec4 iceClip = uDesignVP * vec4(vIceWorld, 1.0);
        vec2 iceScr = iceClip.xy / iceClip.w * 0.5 + 0.5; // GL uv (y up)
        vec2 iceSv = vec2(iceScr.x, 1.0 - iceScr.y);
        float iceMist;
        vec3 iceCol = iceHaze(iceSv, iceMist);
        // Fine frost variation.
        float frost = envNoise(vIceWorld.xz * vec2(0.9, 1.6));
        iceCol *= 0.975 + 0.05 * frost;
        // Decal (premultiplied alpha): albedo = ice * (1 - a) + rgb.
        vec2 dUv = (vIceWorld.xz - uDecalRect.xy) / uDecalRect.zw;
        vec2 dIn = step(vec2(0.0), dUv) * step(dUv, vec2(1.0));
        vec4 dec = texture2D(uDecalMap, clamp(dUv, 0.0, 1.0)) * (dIn.x * dIn.y);
        float wet = clamp(dec.a, 0.0, 1.0);
        // Procedural micro-relief (world-space height gradient).
        vec3 iceN1 = envNoiseD(vIceWorld.xz * 0.8);
        vec2 iceGrad = iceN1.yz * 0.8 * 0.045 * (1.0 - 0.7 * wet);
        vec3 iceAlbedo = iceCol * uAlbedoNorm;
        diffuseColor.rgb = iceAlbedo * (1.0 - wet) + dec.rgb * 0.88;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.34 + 0.22 * iceN1.x, 0.16, wet);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(normalize(vec3(-iceGrad.x, 1.0, -iceGrad.y)), 0.0)).xyz);`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          float clean = 1.0 - wet;
          // Wet sheen: a faint overcast-sky reflection on blood pools.
          outgoingLight += wet * vec3(0.022, 0.024, 0.032) * (0.6 + 0.8 * iceN1.x);
          // Iceberg reflection: backdrop mirrored about the back edge line.
          float edgeY = iceMirrorLine(iceScr.x);
          float dEdge = max(edgeY - iceScr.y, 0.0);
          vec2 mUv = vec2(iceScr.x, edgeY + dEdge * uMirrorStretch) + iceGrad * vec2(0.01, 0.02);
          mUv.y = min(mUv.y, 0.999);
          float mk = uMirrorStrength * exp(-dEdge / uMirrorFalloff) * (0.08 + 0.92 * clean) * (1.0 - 0.55 * iceMist);
          if (mk > 0.004) {
            // Soft (glossy) reflection: a small blur kernel widening with distance.
            vec2 bk = vec2(0.0012, 0.0018) + dEdge * vec2(0.006, 0.012);
            vec3 berg = texture2D(uBackdrop, mUv).rgb * 0.4
              + texture2D(uBackdrop, mUv + vec2(bk.x, bk.y)).rgb * 0.15
              + texture2D(uBackdrop, mUv + vec2(-bk.x, bk.y)).rgb * 0.15
              + texture2D(uBackdrop, mUv + vec2(bk.x, -bk.y)).rgb * 0.15
              + texture2D(uBackdrop, mUv + vec2(-bk.x, -bk.y)).rgb * 0.15;
            // Misty: the reflection is washed towards the ice colour.
            berg = mix(berg, outgoingLight, 0.22);
            outgoingLight = mix(outgoingLight, berg, mk);
          }
          #ifdef ICE_REFL
          // Planar reflection of characters (blurred, faint).
          vec4 rc = uReflMatrix * vec4(vIceWorld, 1.0);
          vec2 rUv = rc.xy / rc.w + iceGrad * 0.01;
          vec2 tx = uReflTexel * 1.5;
          vec4 r = texture2D(uReflMap, rUv) * 0.4
            + texture2D(uReflMap, rUv + vec2(tx.x, tx.y)) * 0.15
            + texture2D(uReflMap, rUv + vec2(-tx.x, tx.y)) * 0.15
            + texture2D(uReflMap, rUv + vec2(tx.x, -tx.y)) * 0.15
            + texture2D(uReflMap, rUv + vec2(-tx.x, -tx.y)) * 0.15;
          float rk = uReflStrength * (1.0 + 0.6 * wet);
          outgoingLight = mix(outgoingLight, r.rgb / max(r.a, 1e-3), clamp(r.a * rk, 0.0, 1.0));
          #endif
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `ice-top-v1-${opts.reflections ? 1 : 0}`;
  return mat;
}
