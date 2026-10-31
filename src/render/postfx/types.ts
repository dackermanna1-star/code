/**
 * Post-processing contract. The scene is drawn with Canvas2D into an offscreen canvas,
 * then PostFX (WebGL2) composites it to the visible canvas with cinematic effects.
 * All screen-space positions are UV coordinates: (0,0) = top-left, (1,1) = bottom-right.
 */

export interface Shockwave {
  /** Centre in UV. */
  x: number;
  y: number;
  /** Current ring radius in UV units of screen HEIGHT (aspect-corrected circle). */
  radius: number;
  /** Ring thickness (same units as radius). */
  thickness: number;
  /** Displacement strength (0..1; ~0.03 subtle, 0.12 huge). */
  strength: number;
}

export interface PostFXParams {
  /** Seconds since start (animates grain / noise). */
  time: number;
  /** Bloom intensity 0..3 (typ. 0.9). */
  bloomStrength: number;
  /** Luminance threshold for bloom 0..1 (typ. 0.55). */
  bloomThreshold: number;
  /** Bloom radius multiplier 0.5..2 (typ. 1). */
  bloomRadius: number;
  /** Chromatic aberration 0..1 (radial RGB split; 0.15 subtle, 1 extreme). */
  chromatic: number;
  /**
   * Impact frame 0..1. At 1 the frame becomes a stark two-tone image (see impactMode);
   * values between blend. Used for 1-3 frames on huge hits, anime style.
   */
  impact: number;
  /** 0 = colour invert, 1 = black silhouettes on white, 2 = white on black (threshold based). */
  impactMode: 0 | 1 | 2;
  /** Accent colour for impact frames (rgb 0..1), tints the bright tone. */
  impactTint: [number, number, number];
  /** 0..1 desaturation (time-stop, dramatic pauses). */
  desaturate: number;
  /** Contrast multiplier (1 = neutral). */
  contrast: number;
  /** Brightness offset (-1..1, 0 = neutral). */
  brightness: number;
  /** Saturation multiplier applied after desaturate (1 = neutral). */
  saturation: number;
  /** Colour overlay: rgb 0..1 + strength a (mix). */
  tint: [number, number, number, number];
  /** Additive flash: rgb 0..1 + strength a. */
  flash: [number, number, number, number];
  /** Vignette strength 0..1. */
  vignette: number;
  /** Vignette colour (rgb 0..1) — e.g. red pulse at low health. */
  vignetteColor: [number, number, number];
  /** Film grain 0..1 (typ. 0.04). */
  grain: number;
  /** Radial (zoom) blur strength 0..1. */
  radialBlur: number;
  /** Radial blur centre in UV. */
  radialCenter: [number, number];
  /** Directional motion blur (UV offset vector per sample, e.g. [0.004, 0]); [0,0] = off. */
  motionBlur: [number, number];
  /** Up to 8 shockwave distortions. */
  shockwaves: Shockwave[];
  /** Cinematic letterbox 0..1 (1 = bars covering ~12% top and bottom each). */
  letterbox: number;
  /** Scanline / CRT-ish lines 0..1 (used subtly during time stop). */
  scanlines: number;
}

export function defaultPostFXParams(): PostFXParams {
  return {
    time: 0,
    bloomStrength: 0.9,
    bloomThreshold: 0.55,
    bloomRadius: 1,
    chromatic: 0.08,
    impact: 0,
    impactMode: 0,
    impactTint: [1, 1, 1],
    desaturate: 0,
    contrast: 1.05,
    brightness: 0,
    saturation: 1.05,
    tint: [0, 0, 0, 0],
    flash: [1, 1, 1, 0],
    vignette: 0.35,
    vignetteColor: [0, 0, 0],
    grain: 0.035,
    radialBlur: 0,
    radialCenter: [0.5, 0.5],
    motionBlur: [0, 0],
    shockwaves: [],
    letterbox: 0,
    scanlines: 0,
  };
}

export interface IPostFX {
  /** True when the WebGL2 pipeline is active (false = Canvas2D fallback). */
  readonly accelerated: boolean;
  resize(width: number, height: number): void;
  /** Composite `source` (same size as output) to the visible canvas with `params`. */
  render(source: HTMLCanvasElement | OffscreenCanvas, params: PostFXParams): void;
  dispose(): void;
}
