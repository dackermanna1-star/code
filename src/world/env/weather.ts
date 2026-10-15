// Weather presets and interpolation. All parameters are continuous so transitions are smooth lerps.
import type { WeatherKind } from '../../core/types';

export interface WeatherParams {
  /** 0..1 sky fraction covered by clouds. */
  cloudCover: number;
  /** 0..1 cloud darkness (storm clouds). */
  cloudDarkness: number;
  /** Fog density at sea level (1/m). */
  fogDensity: number;
  /** Fog height falloff (1/m): larger = fog hugs the ground. */
  fogFalloff: number;
  /** Direct sun multiplier (clouds block the sun). */
  sunIntensity: number;
  /** Sky / ambient multiplier. */
  skyIntensity: number;
  /** 0..1 desaturate the sky toward grey. */
  skyGrey: number;
  /** Atmospheric turbidity (haze) for the scattering model. */
  turbidity: number;
  /** 0..1 rain amount (particles + audio). */
  rain: number;
  /** 0..1 surface wetness (darker, glossier ground). */
  wetness: number;
  /** Wind strength (m/s) for clouds, rain slant, vegetation. */
  wind: number;
  /** 0..1 shadow strength (soft overcast light = weak shadows). */
  shadowStrength: number;
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherParams> = {
  clear: {
    cloudCover: 0.22,
    cloudDarkness: 0.0,
    fogDensity: 0.00028,
    fogFalloff: 0.006,
    sunIntensity: 1,
    skyIntensity: 1,
    skyGrey: 0,
    turbidity: 2.4,
    rain: 0,
    wetness: 0,
    wind: 3,
    shadowStrength: 1,
  },
  cloudy: {
    cloudCover: 0.55,
    cloudDarkness: 0.15,
    fogDensity: 0.00045,
    fogFalloff: 0.006,
    sunIntensity: 0.75,
    skyIntensity: 0.95,
    skyGrey: 0.25,
    turbidity: 3.5,
    rain: 0,
    wetness: 0,
    wind: 5,
    shadowStrength: 0.85,
  },
  overcast: {
    cloudCover: 0.93,
    cloudDarkness: 0.45,
    fogDensity: 0.0009,
    fogFalloff: 0.005,
    sunIntensity: 0.18,
    skyIntensity: 0.75,
    skyGrey: 0.85,
    turbidity: 6,
    rain: 0,
    wetness: 0.1,
    wind: 6,
    shadowStrength: 0.35,
  },
  rain: {
    cloudCover: 0.98,
    cloudDarkness: 0.7,
    fogDensity: 0.0016,
    fogFalloff: 0.004,
    sunIntensity: 0.1,
    skyIntensity: 0.55,
    skyGrey: 0.95,
    turbidity: 8,
    rain: 1,
    wetness: 1,
    wind: 9,
    shadowStrength: 0.2,
  },
  fog: {
    cloudCover: 0.75,
    cloudDarkness: 0.25,
    fogDensity: 0.0075,
    fogFalloff: 0.012,
    sunIntensity: 0.35,
    skyIntensity: 0.8,
    skyGrey: 0.8,
    turbidity: 10,
    rain: 0,
    wetness: 0.25,
    wind: 1.5,
    shadowStrength: 0.4,
  },
};

export function lerpWeather(a: WeatherParams, b: WeatherParams, t: number, out: WeatherParams): WeatherParams {
  for (const k of Object.keys(a) as (keyof WeatherParams)[]) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function cloneWeather(w: WeatherParams): WeatherParams {
  return { ...w };
}

/** Distance (m) at which horizontal fog at height `h` reaches 95 % opacity. */
export function fogVisibilityDistance(w: WeatherParams, h = 2): number {
  const d = w.fogDensity * Math.exp(-w.fogFalloff * Math.max(0, h));
  return Math.min(6000, Math.log(20) / Math.max(1e-6, d));
}
