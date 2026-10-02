/**
 * Sky / atmosphere / cloud constants shared by the CPU side and (via string interpolation) the
 * shaders. Units: atmosphere distances in kilometres, radiance/illuminance in the engine's HDR
 * units (see ARCHITECTURE.md: SUN_ILLUMINANCE = 20 at the top of the atmosphere).
 */

/** Sun illuminance at the top of the atmosphere (HDR units). */
export const SUN_ILLUMINANCE = 20.0;
/** Full-moon illuminance at the top of the atmosphere (HDR units). */
export const MOON_ILLUMINANCE = 0.08;

/** Earth-like atmosphere (Hillaire 2020 defaults), kilometres. */
export const ATMO = {
  bottomRadius: 6360.0,
  topRadius: 6460.0,
  rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3] as const,
  rayleighScaleHeight: 8.0,
  // ~2.5x Hillaire's clear-sky aerosols: hazier continental air for glowing sunsets
  mieScattering: 1.0e-2,
  mieExtinction: 1.11e-2,
  mieScaleHeight: 1.2,
  mieG: 0.8,
  ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3] as const,
  ozoneCenter: 25.0,
  ozoneHalfWidth: 15.0,
  groundAlbedo: 0.3,
};

/** LUT sizes. */
export const TRANSMITTANCE_LUT_SIZE = [256, 64] as const;
export const MULTISCAT_LUT_SIZE = 32;

/** Sea level in blocks (mirrors src/core/constants SEA_LEVEL; duplicated to keep the sky module self-contained). */
export const SKY_SEA_LEVEL = 63;

/**
 * Cloud space: the block world is uniformly scaled so the Minecraft cloud layer (y≈190..300)
 * becomes a real-sized cumulus layer (≈1.5..2.8 km above sea level). Kilometres per block.
 */
export const CLOUD_KM_PER_BLOCK = 1.5 / (190 - SKY_SEA_LEVEL);
export const CLOUD_BASE_Y = 190;
export const CLOUD_TOP_Y = 300;
/** Planet radius used for the curved cloud shell (smaller than Earth so the layer meets the horizon closer). */
export const CLOUD_PLANET_RADIUS_KM = 1500.0;
/** Tile sizes (km) of the procedural cloud textures; the wrap period of cloud offsets is their LCM. */
export const CLOUD_WEATHER_TILE_KM = 36.0;
export const CLOUD_SHAPE_TILE_KM = 7.2;
export const CLOUD_DETAIL_TILE_KM = 1.125;
export const CLOUD_WRAP_KM = 36.0;

/** Default sun-path tilt toward the south (+Z), degrees. */
export const SUN_PATH_TILT_DEG = 16;

/** Artistic apparent radii of the celestial disks (radians). */
export const SUN_ANGULAR_RADIUS = 0.6 * (Math.PI / 180);
export const MOON_ANGULAR_RADIUS = 1.35 * (Math.PI / 180);

export type SkyQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface SkyQualitySettings {
  /** 0 = 2D cloud layer evaluated in the composite (no raymarch), 1 = volumetric raymarch. */
  volumetric: boolean;
  /** Cloud raymarch resolution divisor (2 = half width & height = a quarter of the pixels). */
  cloudDivisor: number;
  /** Primary march steps (min near zenith, max toward the horizon). */
  stepsMin: number;
  stepsMax: number;
  /** Light (shadow) march steps. */
  lightSteps: number;
  /** Use high-frequency detail erosion. */
  detail: boolean;
  /** Temporal accumulation of the cloud buffer. */
  temporal: boolean;
  /** Blend weight of the new frame in the temporal accumulation. */
  temporalBlend: number;
  /** Cloud environment (reflection) panorama size and steps. */
  envSize: [number, number];
  envSteps: number;
  /** Cloud shadow map resolution and update period (frames). */
  shadowSize: number;
  shadowEvery: number;
  /** Sky-view LUT size. */
  skyViewSize: [number, number];
  /** Ambient SH refresh period (frames). */
  shEvery: number;
  /** 3D shape noise resolution. */
  shapeNoiseSize: number;
}

export const SKY_QUALITY: Record<SkyQuality, SkyQualitySettings> = {
  low: {
    volumetric: false, cloudDivisor: 4, stepsMin: 0, stepsMax: 0, lightSteps: 0, detail: false,
    temporal: false, temporalBlend: 1, envSize: [96, 48], envSteps: 0, shadowSize: 128, shadowEvery: 4,
    skyViewSize: [128, 72], shEvery: 60, shapeNoiseSize: 64,
  },
  medium: {
    volumetric: true, cloudDivisor: 4, stepsMin: 20, stepsMax: 40, lightSteps: 4, detail: true,
    temporal: true, temporalBlend: 0.12, envSize: [128, 64], envSteps: 14, shadowSize: 256, shadowEvery: 2,
    skyViewSize: [192, 108], shEvery: 30, shapeNoiseSize: 128,
  },
  high: {
    volumetric: true, cloudDivisor: 2, stepsMin: 24, stepsMax: 56, lightSteps: 5, detail: true,
    temporal: true, temporalBlend: 0.1, envSize: [128, 64], envSteps: 18, shadowSize: 256, shadowEvery: 1,
    skyViewSize: [192, 108], shEvery: 30, shapeNoiseSize: 128,
  },
  ultra: {
    volumetric: true, cloudDivisor: 2, stepsMin: 40, stepsMax: 96, lightSteps: 6, detail: true,
    temporal: true, temporalBlend: 0.08, envSize: [192, 96], envSteps: 24, shadowSize: 512, shadowEvery: 1,
    skyViewSize: [256, 144], shEvery: 15, shapeNoiseSize: 128,
  },
};
