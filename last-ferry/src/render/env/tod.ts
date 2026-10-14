// Time of day: one palette per key moment, interpolated smoothly for any t in
// 0..1 (DESIGN §9: ch.1 0.00–0.30 sunset, ch.2 0.33–0.62 blue hour, ch.3
// 0.66–1.00 night). Colours are linear, pre-tone-mapping.
//
// The backdrop sky is a "matte painting": its visible band only spans the
// lowest ~6° above the horizon, so the sky shader stretches the gradient
// (horizon → band top) while reflections / the environment map use the
// physical elevation (horizon → zenith).

export type RGB = [number, number, number];

export interface TodState {
  t: number;
  // --- sky -------------------------------------------------------------------
  /** Sky at the zenith (reflections, env map). */
  zenith: RGB;
  /** Sky at ~6° (top of the visible band) / mid elevations. */
  upper: RGB;
  /** Sky a little above the horizon (lower third of the band). */
  lower: RGB;
  /** Horizon away from the sun. */
  horizon: RGB;
  /** Horizon glow around the sun's azimuth. */
  sunGlow: RGB;
  /** Width (radians of azimuth) of the sun glow. */
  sunGlowWidth: number;
  /** Visual sun elevation above the horizon (tan units in the backdrop; negative = set). */
  sunElev: number;
  /** Sun disc colour (HDR). */
  sunDisc: RGB;
  /** Clouds: lit underside colour, shadowed body colour, coverage 0..1. */
  cloudLit: RGB;
  cloudDark: RGB;
  cloudCover: number;
  /** Stars / moon visibility 0..1. */
  stars: number;
  moon: number;
  /** Fire glow of the burning town on the left horizon (HDR). */
  townGlow: RGB;
  /** Haze at the horizon (backdrop sea far colour, fog). */
  haze: RGB;
  // --- sea -------------------------------------------------------------------
  seaDeep: RGB;
  seaShallow: RGB;
  /** Specular strength of the sun / moon glitter. */
  glitter: number;
  // --- lighting ----------------------------------------------------------------
  /** Key light (sun → moon) elevation (deg) and azimuth (deg, + = toward +x, 0 = toward -z). */
  keyElev: number;
  keyAz: number;
  keyColor: RGB;
  keyIntensity: number;
  shadowIntensity: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  envIntensity: number;
  fog: RGB;
  fogNear: number;
  fogFar: number;
  /** Lamps (sodium), lighthouse beam, lit windows 0..1. */
  lamps: number;
  lighthouse: number;
  windows: number;
  /** Strength of the town fire glow light on the left of the deck. */
  fireLight: number;
  // --- post ----------------------------------------------------------------------
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  saturation: number;
  contrast: number;
  shadowTint: RGB;
  highlightTint: RGB;
  lift: RGB;
  vignette: number;
}

type Key = Omit<TodState, 't'>;

/** Key moments. */
const KEYS: Array<[number, Key]> = [
  [
    0.0,
    {
      zenith: [0.04, 0.09, 0.22],
      upper: [0.16, 0.1, 0.32],
      lower: [0.75, 0.2, 0.28],
      horizon: [1.1, 0.38, 0.16],
      sunGlow: [3.2, 1.4, 0.35],
      sunGlowWidth: 0.2,
      sunElev: 0.032,
      sunDisc: [2.4, 0.62, 0.08],
      cloudLit: [1.8, 0.65, 0.3],
      cloudDark: [0.12, 0.06, 0.12],
      cloudCover: 0.55,
      stars: 0,
      moon: 0,
      townGlow: [1.2, 0.35, 0.08],
      haze: [0.9, 0.42, 0.25],
      seaDeep: [0.012, 0.03, 0.05],
      seaShallow: [0.03, 0.07, 0.08],
      glitter: 1,
      keyElev: 15,
      keyAz: 9,
      keyColor: [1.0, 0.62, 0.34],
      keyIntensity: 5.5,
      shadowIntensity: 0.82,
      hemiSky: [0.55, 0.52, 0.68],
      hemiGround: [0.32, 0.2, 0.16],
      hemiIntensity: 0.75,
      envIntensity: 0.35,
      fog: [0.55, 0.3, 0.26],
      fogNear: 70,
      fogFar: 260,
      lamps: 0,
      lighthouse: 0.15,
      windows: 0.35,
      fireLight: 0.35,
      exposure: 1.0,
      bloom: 0.5,
      bloomThreshold: 1.6,
      saturation: 1.2,
      contrast: 1.07,
      shadowTint: [0.92, 0.95, 1.08],
      highlightTint: [1.06, 1.0, 0.92],
      lift: [0.012, 0.006, 0.014],
      vignette: 0.3,
    },
  ],
  [
    0.16,
    {
      zenith: [0.03, 0.06, 0.17],
      upper: [0.13, 0.07, 0.26],
      lower: [0.65, 0.14, 0.22],
      horizon: [1.0, 0.28, 0.1],
      sunGlow: [3.0, 0.9, 0.2],
      sunGlowWidth: 0.2,
      sunElev: 0.008,
      sunDisc: [2.2, 0.45, 0.05],
      cloudLit: [1.6, 0.45, 0.22],
      cloudDark: [0.1, 0.05, 0.1],
      cloudCover: 0.58,
      stars: 0,
      moon: 0,
      townGlow: [1.4, 0.4, 0.09],
      haze: [0.75, 0.3, 0.2],
      seaDeep: [0.01, 0.022, 0.042],
      seaShallow: [0.025, 0.055, 0.07],
      glitter: 1,
      keyElev: 13,
      keyAz: 9,
      keyColor: [1.0, 0.5, 0.25],
      keyIntensity: 4.6,
      shadowIntensity: 0.8,
      hemiSky: [0.46, 0.4, 0.62],
      hemiGround: [0.28, 0.16, 0.14],
      hemiIntensity: 0.72,
      envIntensity: 0.33,
      fog: [0.45, 0.22, 0.22],
      fogNear: 70,
      fogFar: 250,
      lamps: 0.05,
      lighthouse: 0.3,
      windows: 0.5,
      fireLight: 0.45,
      exposure: 1.02,
      bloom: 0.55,
      bloomThreshold: 1.5,
      saturation: 1.22,
      contrast: 1.07,
      shadowTint: [0.9, 0.94, 1.1],
      highlightTint: [1.07, 0.98, 0.92],
      lift: [0.012, 0.006, 0.016],
      vignette: 0.3,
    },
  ],
  [
    0.3,
    {
      zenith: [0.02, 0.04, 0.12],
      upper: [0.08, 0.05, 0.19],
      lower: [0.4, 0.1, 0.2],
      horizon: [0.75, 0.2, 0.1],
      sunGlow: [1.8, 0.45, 0.12],
      sunGlowWidth: 0.22,
      sunElev: -0.012,
      sunDisc: [0, 0, 0],
      cloudLit: [1.0, 0.28, 0.2],
      cloudDark: [0.07, 0.04, 0.09],
      cloudCover: 0.6,
      stars: 0,
      moon: 0,
      townGlow: [1.7, 0.48, 0.1],
      haze: [0.45, 0.18, 0.18],
      seaDeep: [0.008, 0.016, 0.034],
      seaShallow: [0.02, 0.04, 0.06],
      glitter: 0.55,
      keyElev: 14,
      keyAz: 9,
      keyColor: [1.0, 0.45, 0.32],
      keyIntensity: 2.2,
      shadowIntensity: 0.6,
      hemiSky: [0.36, 0.32, 0.6],
      hemiGround: [0.2, 0.12, 0.14],
      hemiIntensity: 0.78,
      envIntensity: 0.3,
      fog: [0.26, 0.14, 0.2],
      fogNear: 65,
      fogFar: 230,
      lamps: 0.55,
      lighthouse: 0.55,
      windows: 0.75,
      fireLight: 0.6,
      exposure: 1.08,
      bloom: 0.6,
      bloomThreshold: 1.35,
      saturation: 1.2,
      contrast: 1.07,
      shadowTint: [0.88, 0.93, 1.14],
      highlightTint: [1.08, 0.97, 0.92],
      lift: [0.01, 0.008, 0.02],
      vignette: 0.32,
    },
  ],
  [
    0.45,
    {
      zenith: [0.012, 0.03, 0.1],
      upper: [0.03, 0.06, 0.17],
      lower: [0.09, 0.09, 0.22],
      horizon: [0.3, 0.14, 0.18],
      sunGlow: [0.7, 0.22, 0.12],
      sunGlowWidth: 0.25,
      sunElev: -0.03,
      sunDisc: [0, 0, 0],
      cloudLit: [0.3, 0.14, 0.2],
      cloudDark: [0.03, 0.035, 0.08],
      cloudCover: 0.6,
      stars: 0.15,
      moon: 0.25,
      townGlow: [2.0, 0.55, 0.12],
      haze: [0.14, 0.11, 0.18],
      seaDeep: [0.006, 0.013, 0.03],
      seaShallow: [0.012, 0.03, 0.055],
      glitter: 0.25,
      keyElev: 24,
      keyAz: 12,
      keyColor: [0.55, 0.6, 1.0],
      keyIntensity: 0.55,
      shadowIntensity: 0.45,
      hemiSky: [0.24, 0.3, 0.62],
      hemiGround: [0.12, 0.1, 0.14],
      hemiIntensity: 0.75,
      envIntensity: 0.26,
      fog: [0.08, 0.08, 0.17],
      fogNear: 60,
      fogFar: 210,
      lamps: 1,
      lighthouse: 0.8,
      windows: 0.9,
      fireLight: 0.8,
      exposure: 1.2,
      bloom: 0.68,
      bloomThreshold: 1.1,
      saturation: 1.14,
      contrast: 1.07,
      shadowTint: [0.86, 0.94, 1.18],
      highlightTint: [1.08, 0.98, 0.9],
      lift: [0.008, 0.012, 0.026],
      vignette: 0.34,
    },
  ],
  [
    0.62,
    {
      zenith: [0.007, 0.016, 0.06],
      upper: [0.015, 0.03, 0.1],
      lower: [0.035, 0.05, 0.14],
      horizon: [0.09, 0.07, 0.13],
      sunGlow: [0.2, 0.09, 0.1],
      sunGlowWidth: 0.6,
      sunElev: -0.05,
      sunDisc: [0, 0, 0],
      cloudLit: [0.1, 0.09, 0.16],
      cloudDark: [0.015, 0.02, 0.05],
      cloudCover: 0.6,
      stars: 0.5,
      moon: 0.7,
      townGlow: [2.4, 0.65, 0.14],
      haze: [0.05, 0.055, 0.11],
      seaDeep: [0.004, 0.009, 0.022],
      seaShallow: [0.008, 0.022, 0.04],
      glitter: 0.35,
      keyElev: 36,
      keyAz: 16,
      keyColor: [0.55, 0.68, 1.0],
      keyIntensity: 0.42,
      shadowIntensity: 0.55,
      hemiSky: [0.16, 0.22, 0.5],
      hemiGround: [0.08, 0.08, 0.12],
      hemiIntensity: 0.5,
      envIntensity: 0.22,
      fog: [0.04, 0.05, 0.11],
      fogNear: 55,
      fogFar: 190,
      lamps: 1,
      lighthouse: 1,
      windows: 1,
      fireLight: 0.95,
      exposure: 1.38,
      bloom: 0.75,
      bloomThreshold: 0.95,
      saturation: 1.08,
      contrast: 1.06,
      shadowTint: [0.86, 0.95, 1.2],
      highlightTint: [1.08, 0.98, 0.9],
      lift: [0.006, 0.012, 0.03],
      vignette: 0.36,
    },
  ],
  [
    0.8,
    {
      zenith: [0.004, 0.01, 0.04],
      upper: [0.009, 0.018, 0.065],
      lower: [0.02, 0.032, 0.09],
      horizon: [0.04, 0.045, 0.09],
      sunGlow: [0.04, 0.04, 0.08],
      sunGlowWidth: 0.6,
      sunElev: -0.08,
      sunDisc: [0, 0, 0],
      cloudLit: [0.07, 0.08, 0.13],
      cloudDark: [0.008, 0.012, 0.03],
      cloudCover: 0.55,
      stars: 0.9,
      moon: 1,
      townGlow: [2.8, 0.75, 0.16],
      haze: [0.03, 0.04, 0.08],
      seaDeep: [0.003, 0.007, 0.018],
      seaShallow: [0.006, 0.016, 0.032],
      glitter: 0.55,
      keyElev: 40,
      keyAz: 18,
      keyColor: [0.6, 0.72, 1.0],
      keyIntensity: 0.34,
      shadowIntensity: 0.6,
      hemiSky: [0.12, 0.17, 0.4],
      hemiGround: [0.06, 0.06, 0.1],
      hemiIntensity: 0.4,
      envIntensity: 0.16,
      fog: [0.03, 0.04, 0.09],
      fogNear: 48,
      fogFar: 170,
      lamps: 1,
      lighthouse: 1,
      windows: 1,
      fireLight: 1,
      exposure: 1.48,
      bloom: 0.8,
      bloomThreshold: 0.9,
      saturation: 1.05,
      contrast: 1.07,
      shadowTint: [0.86, 0.96, 1.22],
      highlightTint: [1.08, 0.99, 0.9],
      lift: [0.006, 0.012, 0.03],
      vignette: 0.38,
    },
  ],
  [
    1.0,
    {
      zenith: [0.003, 0.007, 0.03],
      upper: [0.007, 0.014, 0.05],
      lower: [0.016, 0.026, 0.075],
      horizon: [0.032, 0.038, 0.08],
      sunGlow: [0.03, 0.03, 0.06],
      sunGlowWidth: 0.6,
      sunElev: -0.1,
      sunDisc: [0, 0, 0],
      cloudLit: [0.06, 0.07, 0.11],
      cloudDark: [0.006, 0.01, 0.025],
      cloudCover: 0.6,
      stars: 1,
      moon: 1,
      townGlow: [3.1, 0.85, 0.18],
      haze: [0.025, 0.035, 0.07],
      seaDeep: [0.0025, 0.006, 0.016],
      seaShallow: [0.005, 0.014, 0.028],
      glitter: 0.6,
      keyElev: 42,
      keyAz: 18,
      keyColor: [0.6, 0.72, 1.0],
      keyIntensity: 0.3,
      shadowIntensity: 0.6,
      hemiSky: [0.1, 0.15, 0.36],
      hemiGround: [0.05, 0.05, 0.09],
      hemiIntensity: 0.34,
      envIntensity: 0.14,
      fog: [0.025, 0.035, 0.08],
      fogNear: 42,
      fogFar: 150,
      lamps: 1,
      lighthouse: 1,
      windows: 1,
      fireLight: 1,
      exposure: 1.45,
      bloom: 0.85,
      bloomThreshold: 0.85,
      saturation: 1.03,
      contrast: 1.08,
      shadowTint: [0.86, 0.96, 1.24],
      highlightTint: [1.08, 0.99, 0.9],
      lift: [0.006, 0.012, 0.032],
      vignette: 0.4,
    },
  ],
];

function lerpValue(a: unknown, b: unknown, k: number): unknown {
  if (typeof a === 'number') return a + ((b as number) - a) * k;
  const aa = a as number[];
  const bb = b as number[];
  return aa.map((v, i) => v + (bb[i] - v) * k);
}

/** Palette at time of day t (0..1, clamped). */
export function todAt(t: number, out?: TodState): TodState {
  const tt = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < KEYS.length - 2 && tt > KEYS[i + 1][0]) i++;
  const [t0, a] = KEYS[i];
  const [t1, b] = KEYS[i + 1];
  let k = Math.min(1, Math.max(0, (tt - t0) / (t1 - t0)));
  // Gentle ease so the derivative does not jump at the keys.
  k = k * k * (3 - 2 * k) * 0.5 + k * 0.5;
  const res = (out ?? ({} as TodState)) as unknown as Record<string, unknown>;
  for (const key of Object.keys(a) as Array<keyof Key>) res[key] = lerpValue(a[key], b[key], k);
  res.t = tt;
  return res as unknown as TodState;
}

/** Convenience: [r,g,b] → hex-free setter target. */
export function setRGB(c: { setRGB(r: number, g: number, b: number): unknown }, v: RGB, k = 1): void {
  c.setRGB(v[0] * k, v[1] * k, v[2] * k);
}
