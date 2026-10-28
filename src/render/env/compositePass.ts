// Final full-screen pass after the default pipeline: PS2-style output (15-bit colour with
// 4×4 Bayer ordered dithering, optional subtle interlace lines) and the impact/pain
// screen flash. Runs on the display-referred (tone-mapped, gamma) image.

import { Effect, PostProcess, Texture, type Camera, type Engine } from "@babylonjs/core";

const NAME = "renderEnvComposite";

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float uPS2;
uniform float uLevels;
uniform float uInterlace;
uniform float uField;
uniform vec4 uFlash;

// 4x4 Bayer matrix value in [0, 1) by recursive bit interleaving.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main(void) {
  vec3 col = texture2D(textureSampler, vUV).rgb;
  if (uPS2 > 0.5) {
    float d = bayer4(gl_FragCoord.xy) - 0.46875; // centred threshold (mean of 16 cells)
    col = floor(clamp(col, 0.0, 1.0) * uLevels + 0.5 + d) / uLevels;
    float line = mod(floor(gl_FragCoord.y) + uField, 2.0);
    col *= 1.0 - uInterlace * line;
  }
  col = mix(col, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface CompositeState {
  ps2: boolean;
  /** Quantisation levels per channel − 1 (31 = 5 bits = 15-bit colour). */
  levels: number;
  /** Interlace darkening of alternate lines (0 = off). */
  interlace: number;
  flashR: number;
  flashG: number;
  flashB: number;
  flashA: number;
}

export function createCompositePass(camera: Camera, engine: Engine, state: CompositeState): PostProcess {
  if (!Effect.ShadersStore[NAME + "FragmentShader"]) Effect.ShadersStore[NAME + "FragmentShader"] = FRAGMENT;
  const pp = new PostProcess(NAME, NAME, ["uPS2", "uLevels", "uInterlace", "uField", "uFlash"], null, 1.0, camera, Texture.NEAREST_SAMPLINGMODE, engine, false);
  pp.onApply = (effect) => {
    effect.setFloat("uPS2", state.ps2 ? 1 : 0);
    effect.setFloat("uLevels", Math.max(1, state.levels));
    effect.setFloat("uInterlace", state.ps2 ? state.interlace : 0);
    // Static field: alternating fields every frame reads as 30 Hz flicker on LCDs.
    effect.setFloat("uField", 0);
    effect.setFloat4("uFlash", state.flashR, state.flashG, state.flashB, state.flashA);
  };
  return pp;
}
