// Final full-screen pass after the default pipeline: film grain and chromatic aberration (folded
// in here instead of two extra full-resolution DefaultRenderingPipeline passes; same formulas
// as Babylon's grain / chromaticAberration shaders, grain evaluated at each aberrated tap so
// the result matches grain → aberration), PS2-style output (15-bit colour with 4×4 Bayer
// ordered dithering, optional subtle interlace lines) and the impact/pain screen flash. Runs
// on the display-referred (tone-mapped, gamma) image.

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
uniform vec2 uGrain;     // x = intensity (0..255 variance, 0 = off), y = seed
uniform vec2 uAberration; // x = amount (px, 0 = off), y = radial exponent
uniform vec2 uScreen;     // input size (px)

const float PI_C = 3.1415926535897932384626433832795;

// 4x4 Bayer matrix value in [0, 1) by recursive bit interleaving.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

// Babylon's grain: dither(uv * seed, intensity), strongest in the mid tones.
vec3 grainAt(vec3 c, vec2 uv) {
  if (uGrain.x <= 0.0) return c;
  float rnd = fract(sin(dot(uv * uGrain.y, vec2(12.9898, 78.233))) * 43758.5453);
  float v = uGrain.x / 255.0;
  float g = mix(-v, v, rnd);
  float lum = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  return max(c + g * ((cos(-PI_C + lum * PI_C * 2.0) + 1.0) * 0.5), 0.0);
}

void main(void) {
  vec3 col;
  if (uAberration.x > 0.0) {
    // Babylon's chromatic aberration with its defaults: centre (0.5, 0.5), fixed direction
    // (0.707, 0.707); the shift grows with the distance from the centre
    vec2 cs = vUV - vec2(0.5);
    float radius = length(cs);
    const vec2 dir = vec2(0.707, 0.707);
    float k = uAberration.x * pow(radius, uAberration.y);
    vec2 shift = vec2(k * dir.x / uScreen.x, k * dir.y / uScreen.y * 0.5);
    vec2 uvR = vUV - 0.3 * shift;
    vec2 uvB = vUV + 0.3 * shift;
    col.r = grainAt(texture2D(textureSampler, uvR).rgb, uvR).r;
    col.g = grainAt(texture2D(textureSampler, vUV).rgb, vUV).g;
    col.b = grainAt(texture2D(textureSampler, uvB).rgb, uvB).b;
  } else {
    col = grainAt(texture2D(textureSampler, vUV).rgb, vUV);
  }
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
  /** Film grain variance (Babylon GrainPostProcess.intensity units; 0 = off). */
  grain: number;
  /** New grain pattern every frame. */
  grainAnimated: boolean;
  /** Chromatic aberration amount (Babylon aberrationAmount; 0 = off) and radial exponent. */
  aberration: number;
  aberrationRadial: number;
}

export function createCompositePass(camera: Camera, engine: Engine, state: CompositeState): PostProcess {
  if (!Effect.ShadersStore[NAME + "FragmentShader"]) Effect.ShadersStore[NAME + "FragmentShader"] = FRAGMENT;
  // bilinear: the aberration taps fall between texels (other taps sit exactly on texel centres)
  const pp = new PostProcess(NAME, NAME, ["uPS2", "uLevels", "uInterlace", "uField", "uFlash", "uGrain", "uAberration", "uScreen"], null, 1.0, camera, Texture.BILINEAR_SAMPLINGMODE, engine, false);
  pp.onApply = (effect) => {
    effect.setFloat("uPS2", state.ps2 ? 1 : 0);
    effect.setFloat("uLevels", Math.max(1, state.levels));
    effect.setFloat("uInterlace", state.ps2 ? state.interlace : 0);
    // Static field: alternating fields every frame reads as 30 Hz flicker on LCDs.
    effect.setFloat("uField", 0);
    effect.setFloat4("uFlash", state.flashR, state.flashG, state.flashB, state.flashA);
    effect.setFloat2("uGrain", Math.max(0, state.grain), state.grainAnimated ? Math.random() + 1 : 1);
    effect.setFloat2("uAberration", Math.max(0, state.aberration), state.aberrationRadial);
    effect.setFloat2("uScreen", Math.max(1, pp.width), Math.max(1, pp.height));
  };
  return pp;
}
