/**
 * Sky / atmosphere / volumetric clouds (Hillaire 2020 LUT atmosphere + Nubis-style cumulus).
 *
 * Per frame:
 *   atmosphere.update(params, camera, frameIndex);          // before shadow/lighting passes
 *   ...lighting uses atmosphere.lightDir / lightColor / ambientSH and the `atmo_*` GLSL functions...
 *   atmosphere.render(hdrTarget, gbufferDepthTexture, camera); // after lighting, before translucents
 *
 * render(): draws sky + sun + moon + stars + clouds where the depth texture holds the far plane
 * (depth >= 1). If `hdrTarget.depthTexture === depthTexture` (the target owns that depth buffer) the
 * depth test is used instead of sampling (no feedback loop). When the depth texture is sampled and
 * `fadeTerrainInSkyPass` is true (default) terrain in the 75..100% render-distance fade zone is
 * additionally blended toward the full sky with the same factor atmo_applyFog uses (replaces the
 * low-res sky+cloud approximation baked in by the lighting pass; set false to touch only sky pixels).
 * Destination alpha is preserved.
 *
 * GLSL include contract (`atmosphere.glsl`): GLSL ES 3.00 text without #version/main/precision.
 * Concatenate it after `precision highp float;` (vertex or fragment stage, or both) and merge
 * `atmosphere.uniforms` (the same IUniform objects, updated in place every frame) into your
 * material's uniforms. All identifiers are prefixed `atmo_` / `ATMO_`. Functions:
 *   vec3  atmo_skyRadiance(vec3 worldDir)             sky radiance (no sun disk / clouds / stars)
 *   vec3  atmo_skyRadianceWithClouds(vec3 worldDir)   + low-res cloud panorama (reflections, SSR miss)
 *   vec3  atmo_applyFog(vec3 color, vec3 worldDir, float dist)
 *                                                     game-scale aerial perspective (+ exponential
 *                                                     valley haze) and fade to the sky between 75%
 *                                                     and 100% of renderDistance (horizontal dist).
 *                                                     Nether/End: dense / light coloured fog.
 *   float atmo_cloudShadow(vec3 worldPos)             0..1 sun/moon visibility through the clouds
 *   vec3  atmo_sunTransmittance(vec3 worldPos)        atmospheric transmittance toward the sun
 *   vec3  atmo_ambient(vec3 normal)                   sky irradiance from atmo_ambientSH (== ambientSH)
 * Uniforms (all `highp`): atmo_transmittanceLUT, atmo_multiScatLUT, atmo_skyViewLUT,
 * atmo_cloudEnvMap, atmo_cloudShadowMap (sampler2D); atmo_skyViewSize, atmo_cloudEnvSize (vec2);
 * atmo_sunDir, atmo_moonDir, atmo_sunIlluminance, atmo_moonIlluminance, atmo_lightDir,
 * atmo_lightColor, atmo_cameraPos, atmo_sunTransCam, atmo_moonTransCam, atmo_dimFogColor,
 * atmo_nightGlow, atmo_cloudShadowLight (vec3); atmo_cameraAltKm (float); atmo_fogParams,
 * atmo_hazeParams, atmo_weather, atmo_cloudShadowParams, atmo_cloudShadowParams2 (vec4);
 * atmo_dimension (int: 0 overworld, 1 nether, 2 end); atmo_ambientSH (vec3[9]).
 * atmo_lightDir / atmo_lightColor mirror `lightDir` / `lightColor`.
 *
 * ambientSH basis (world axes, Y up), irradiance E(n) = Σ c_i · Y_i(n):
 *   Y0 = 0.282095, Y1 = 0.488603·y, Y2 = 0.488603·z, Y3 = 0.488603·x, Y4 = 1.092548·x·y,
 *   Y5 = 1.092548·y·z, Y6 = 0.315392·(3z² − 1), Y7 = 1.092548·x·z, Y8 = 0.546274·(x² − y²)
 * (already cosine-convolved; diffuse radiance = albedo / π · E(n)). See evalAmbientSH().
 *
 * Units: SUN_ILLUMINANCE = 20 at the top of the atmosphere, MOON_ILLUMINANCE = 0.08 × phase.
 * World: +X east, -X west, +Z south, +Y up; celestialFromTicks() gives a sun path tilted toward
 * the south (tick 0 sunrise, 6000 noon, 12000 sunset, 18000 midnight).
 */
export { Atmosphere, evalAmbientSH } from './Atmosphere';
export type { SkyParams } from './Atmosphere';
export {
  SUN_ILLUMINANCE, MOON_ILLUMINANCE, SKY_QUALITY, SUN_PATH_TILT_DEG, CLOUD_BASE_Y, CLOUD_TOP_Y, CLOUD_KM_PER_BLOCK,
} from './constants';
export type { SkyQuality, SkyQualitySettings } from './constants';
export {
  celestialFromTicks, moonPhaseFactor, moonPhaseAngle, moonLightDirection, sunPathAxis, sunPathNoon, starFrameRotation,
} from './celestial';
export type { CelestialState } from './celestial';
