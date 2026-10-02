/**
 * Sky / atmosphere / volumetric clouds.
 *
 * Usage per frame:
 *   atmosphere.update(params, camera, frameIndex);      // before the lighting pass
 *   ...lighting pass uses atmosphere.lightDir/lightColor/ambientSH and `atmosphere.glsl` functions...
 *   atmosphere.render(hdrTarget, gbufferDepthTexture, camera); // after lighting, before translucents
 *
 * GLSL include contract (`atmosphere.glsl`): GLSL ES 3.00, no #version / main / precision statements.
 * Include it after `precision highp float;` in fragment shaders, and merge `atmosphere.uniforms`
 * (same IUniform objects, updated in place) into the material's uniforms. Provides:
 *   vec3  atmo_skyRadiance(vec3 worldDir)             sky radiance (no sun disk/clouds)
 *   vec3  atmo_skyRadianceWithClouds(vec3 worldDir)   + low-res cloud panorama (reflections, SSR fallback)
 *   vec3  atmo_applyFog(vec3 color, vec3 worldDir, float dist)  aerial perspective + render-distance fade
 *   float atmo_cloudShadow(vec3 worldPos)             0..1 direct-light visibility through clouds
 *   vec3  atmo_sunTransmittance(vec3 worldPos)        atmospheric transmittance toward the sun
 *   vec3  atmo_ambient(vec3 normal)                   sky irradiance from atmo_ambientSH (== ambientSH)
 * and uniforms atmo_lightDir / atmo_lightColor (== lightDir / lightColor), atmo_sunDir, atmo_moonDir,
 * atmo_cameraPos, ... (all prefixed `atmo_`).
 */
export { Atmosphere, evalAmbientSH } from './Atmosphere';
export type { SkyParams } from './Atmosphere';
export {
  SUN_ILLUMINANCE, MOON_ILLUMINANCE, SKY_QUALITY, SUN_PATH_TILT_DEG, CLOUD_BASE_Y, CLOUD_TOP_Y, CLOUD_KM_PER_BLOCK,
} from './constants';
export type { SkyQuality, SkyQualitySettings } from './constants';
export { celestialFromTicks, moonPhaseFactor, moonLightDirection, sunPathAxis, sunPathNoon } from './celestial';
export type { CelestialState } from './celestial';
