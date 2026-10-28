// World vertex layout constants and the per-surface packing used by the batcher, the VFX
// micro-debris instances and the world material shader. PURE MODULE (no Babylon import) so the
// packing can be unit-tested in Node; src/render/batch.ts documents the layout in full.
//
//   surf.x = albedo layer index (integer)
//   surf.y = normal layer index (integer)
//   surf.z = round(roughness·255) + 256·round(metallic·255)   (exact integer in float32)
//   surf.w = emissive HDR strength: > 0 mains-powered, < 0 always-on (|w|), 0 = none
//   color  = linear rgb tint (surface tint × face tint), a = 1 opaque / glass opacity

import type { SurfaceDef } from "./surfaces.ts";

/** Floats per vertex in batched island buffers: pos3 nrm3 uv2 color4 surf4. */
export const WORLD_STRIDE = 16;
export const OFF_NORMAL = 3;
export const OFF_UV = 6;
export const OFF_COLOR = 8;
export const OFF_SURF = 12;

/** Emissive surfaces that keep glowing when the apartment loses mains power. */
export const ALWAYS_ON_EMISSIVE: ReadonlySet<string> = new Set<string>(["city_windows"]);

/** sRGB 8-bit → linear float (exact sRGB EOTF). */
export const SRGB_TO_LINEAR: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/** Floats per surface row in the packed surface table. */
export const SURFACE_ROW = 10;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Opacity of a transparent surface: clear glass ≈ 0.18, frosted ≈ 0.55, smoked ≈ 0.8. */
export function glassOpacity(tint: number, roughness: number): number {
  const r = ((tint >> 16) & 255) / 255,
    g = ((tint >> 8) & 255) / 255,
    b = (tint & 255) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return clamp(0.06 + (1 - lum) * 0.9 + clamp(roughness, 0, 1) * 1.1, 0.08, 0.95);
}

/** Pack roughness and metallic (0..1) into the exact integer stored in surf.z. */
export function packRoughMetal(roughness: number, metallic: number): number {
  return Math.round(clamp(roughness, 0, 1) * 255) + 256 * Math.round(clamp(metallic, 0, 1) * 255);
}

/** Inverse of packRoughMetal, mirroring the vertex shader's decode. */
export function unpackRoughMetal(z: number): { roughness: number; metallic: number } {
  const rm = Math.floor(z + 0.5);
  const met = Math.floor(rm / 256);
  return { roughness: (rm - met * 256) / 255, metallic: met / 255 };
}

/**
 * One surface table row: [albedoLayer, normalLayer, packedRM, emissive(signed), 1/worldSize,
 * tintR, tintG, tintB (linear), alpha, transparent(0|1)].
 */
export function packSurfaceRow(s: SurfaceDef, albedoLayer: number, normalLayer: number, out: Float32Array | number[], o = 0): void {
  const rough = clamp(s.roughness, 0, 1);
  const em = Math.max(0, s.emissive ?? 0);
  out[o] = albedoLayer;
  out[o + 1] = normalLayer;
  out[o + 2] = packRoughMetal(rough, s.metallic);
  out[o + 3] = em > 0 && ALWAYS_ON_EMISSIVE.has(s.name) ? -em : em;
  out[o + 4] = 1 / (s.worldSize > 1e-6 ? s.worldSize : 1);
  out[o + 5] = SRGB_TO_LINEAR[(s.tint >> 16) & 255];
  out[o + 6] = SRGB_TO_LINEAR[(s.tint >> 8) & 255];
  out[o + 7] = SRGB_TO_LINEAR[s.tint & 255];
  out[o + 8] = s.transparent ? glassOpacity(s.tint, rough) : 1;
  out[o + 9] = s.transparent ? 1 : 0;
}

/** Effective emissive multiplier the shader applies for surf.w given the mains power (0..1). */
export function emissiveFor(w: number, power: number): number {
  return w > 0 ? w * power : w < 0 ? -w : 0;
}
