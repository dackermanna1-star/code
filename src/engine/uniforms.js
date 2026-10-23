import * as THREE from 'three';

// Uniforms shared by every material in the world. Materials reference these objects
// directly, so updating `.value` once per frame updates every shader.
export const U = {
  uTime: { value: 0 },
  uLogDepthFC: { value: 2 / Math.log2(40000 + 1) },

  // Lighting
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  uLightDir: { value: new THREE.Vector3(0, 1, 0) }, // dominant light: sun by day, moon by night
  uNight: { value: 0 }, // 0 = sun is the key light, 1 = moon
  uExposure: { value: 1 }, // CPU-side estimate only; shaders read tExposure
  tExposure: { value: null }, // 1x1 adapted exposure computed on the GPU
  uExposureBias: { value: 0 }, // EV offset from settings
  uCameraAltitude: { value: 0.72 }, // km above sea level (Erg Chebbi sits ~720 m)
  uStarRotation: { value: new THREE.Matrix3() },

  // Atmosphere LUTs and the per-frame lighting probe
  tTransmittance: { value: null },
  tSkyView: { value: null },
  tProbe: { value: null },
  uExtinction: { value: new THREE.Vector3(1e-5, 2e-5, 4e-5) }, // per metre, near ground
  uFarFade: { value: new THREE.Vector2(14000, 22000) },

  // Weather
  uWindDir: { value: new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2) },
  uWindSpeed: { value: 4 },
  uGust: { value: 0 },
  uDust: { value: 0.3 },
  uStorm: { value: 0 },
  uCloud: { value: 0.25 },
  uHeat: { value: 0 },
  uWindOffset: { value: new THREE.Vector2() }, // integrated wind travel, for scrolling effects

  // Terrain clipmap atlases
  tHeight: { value: null },
  tNormal: { value: null },
  tShadow: { value: null },
  uClip: { value: [] },
  uAtlasInv: { value: new THREE.Vector2(1, 1) },

  // Footprints / deformation
  tDeform: { value: null },
  uDeformRect: { value: new THREE.Vector4(0, 0, 64, 1 / 64) },

  // Object shadow cascades
  tObjShadow0: { value: null },
  tObjShadow1: { value: null },
  uObjShadowMatrix0: { value: new THREE.Matrix4() },
  uObjShadowMatrix1: { value: new THREE.Matrix4() },
  uObjShadowParams: { value: new THREE.Vector4(0, 0, 0, 0) }, // x: enabled, y: texel0, z: texel1

  // Nearby oases for wet sand and water (xy centre, z radius, w water level)
  uOases: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uOasisCount: { value: 0 },
};
