// Golden-hour sun model shared by lighting, sky, exterior and light shafts (pure, no Babylon).
//
// Compass convention: azimuth 0° = north (+Z), 90° = east (+X), 180° = south (−Z),
// 270° = west (−X). The apartment's exterior walls face south (z = 0) and east (x = 12.8);
// the evening sun hangs low in the west-south-west, so it rakes in through the south
// windows at a grazing angle and paints long warm patches on the floors and partition
// walls. (The east windows only see sky light at this time of day, as they should.)

import type { Vec3 } from "../../geom/vec.ts";

/** Sun compass azimuth in degrees (west-south-west sector 236°–259°). */
export const SUN_AZIMUTH_DEG = 240;
/** Sun elevation above the horizon in degrees (golden hour). */
export const SUN_ELEVATION_DEG = 13.5;
/** Sun light colour as it arrives at the window (sRGB hex). */
export const SUN_COLOR_HEX = 0xffb36b;

/** Unit vector pointing TOWARDS the sun for the given compass azimuth / elevation (degrees). */
export function dirFromAngles(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const c = Math.cos(el);
  return { x: Math.sin(az) * c, y: Math.sin(el), z: Math.cos(az) * c };
}

/** Unit vector towards the sun. */
export const TO_SUN: Readonly<Vec3> = Object.freeze(dirFromAngles(SUN_AZIMUTH_DEG, SUN_ELEVATION_DEG));

/** Unit direction the sunlight travels (DirectionalLight.direction). */
export const SUN_LIGHT_DIR: Readonly<Vec3> = Object.freeze({ x: -TO_SUN.x, y: -TO_SUN.y, z: -TO_SUN.z });

/** Unpack 0xRRGGBB into sRGB components in [0, 1]. */
export function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Exact sRGB → linear transfer function for one component. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 0xRRGGBB (sRGB) → linear RGB triple. */
export function hexToLinear(hex: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}
