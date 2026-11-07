// Shared exterior materials (our aircraft). Created once per app.
import * as THREE from 'three';
import { patchExterior } from './shading.js';
import { wingAtlas, nacelleTexture, spinnerTexture, fanBlurTexture, cascadeTexture, tyreTexture, noiseCanvas, heightToNormal, tex } from './textures.js';
import { paintLivery, LIVERIES } from './liveries.js';

/** small tiling micro-normal for painted metal (orange peel + fine scratches) */
function microNormal() {
  const n = noiseCanvas(256, 256, 64, 77, { lo: 100, hi: 156 });
  return tex(heightToNormal(n, 0.6, true), { srgb: false, wrap: THREE.RepeatWrapping, repeat: [6, 6] });
}

export function createMaterials(app, { livery = 'halcyon', detail = 1 } = {}) {
  const liv = LIVERIES[livery] || LIVERIES.halcyon;
  const aniso = app.assets?.maxAnisotropy || 4;
  const atlas = wingAtlas(detail >= 1 ? 2048 : 1024, aniso, liv);
  const M = {};
  M.wing = patchExterior(new THREE.MeshStandardMaterial({
    name: 'ext-wing', map: atlas.map, normalMap: atlas.normalMap, roughnessMap: atlas.roughnessMap, metalnessMap: atlas.roughnessMap,
    roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.75, 0.75), envMapIntensity: 1.0,
  }));
  M.slat = patchExterior(new THREE.MeshPhysicalMaterial({
    name: 'ext-slat', map: atlas.map, normalMap: atlas.normalMap, roughnessMap: atlas.roughnessMap,
    roughness: 0.95, metalness: 1, anisotropy: 0.45, anisotropyRotation: 0, normalScale: new THREE.Vector2(0.35, 0.35), color: 0xf2f4f6,
  }));
  const L = paintLivery(liv, { W: detail >= 2 ? 4096 : 2048, H: detail >= 2 ? 2048 : 1024, detail });
  M.livery = patchExterior(new THREE.MeshStandardMaterial({
    name: 'ext-livery', map: L.map, roughnessMap: L.roughnessMap, normalMap: L.normalMap || null,
    roughness: 1, metalness: 0.0, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.0,
  }), { flex: false });
  M.liveryTexture = L.map;
  const nac = nacelleTexture(liv, detail >= 1 ? 1024 : 512);
  M.nacelle = patchExterior(new THREE.MeshStandardMaterial({
    name: 'ext-nacelle', map: nac.map, normalMap: nac.normalMap, roughnessMap: nac.roughnessMap, roughness: 1, metalness: 0.05,
    normalScale: new THREE.Vector2(0.6, 0.6),
  }));
  M.lip = patchExterior(new THREE.MeshPhysicalMaterial({ name: 'ext-lip', color: 0xc9cdd1, metalness: 1, roughness: 0.26, anisotropy: 0.5, anisotropyRotation: Math.PI / 2 }));
  M.duct = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-duct', color: 0x34373b, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }));
  M.core = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-core', color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.75 }));
  M.cascade = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-cascade', map: cascadeTexture(), roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
  M.cascade.map.repeat.set(4, 1);
  M.spinnerTex = spinnerTexture();
  M.fanBlurTex = fanBlurTexture();
  M.pylon = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-pylon', color: 0x9da2a7, roughness: 0.68, metalness: 0.05, normalMap: microNormal(), normalScale: new THREE.Vector2(0.15, 0.15) }));
  M.gearPaint = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-gear', color: 0xc9cbcd, roughness: 0.48, metalness: 0.1 }));
  M.chrome = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-chrome', color: 0xe9ecef, roughness: 0.1, metalness: 1 }));
  M.darkMetal = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-dark', color: 0x3a3b3d, roughness: 0.6, metalness: 0.5 }));
  M.tyre = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-tyre', map: tyreTexture(), color: 0xffffff, roughness: 0.88, metalness: 0 }));
  M.wheel = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-wheel', color: 0xa8acb1, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }));
  M.hubcap = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-hubcap', color: 0xd4d7da, roughness: 0.18, metalness: 1, side: THREE.DoubleSide }));
  M.antenna = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-antenna', color: 0xd9d9d6, roughness: 0.45, metalness: 0.0 }), { flex: false });
  M.apu = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-apu', color: 0x1a1a1b, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }), { flex: false });
  M.livery_ = liv;
  return M;
}

/** Per-engine materials (fan blades / blur / spinner need their own uniforms). */
export function engineMaterials(M) {
  const blades = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-fan', color: 0x8b9095, roughness: 0.32, metalness: 1, side: THREE.DoubleSide, transparent: true, opacity: 1 }));
  const blur = new THREE.MeshStandardMaterial({ name: 'ext-fanblur', map: M.fanBlurTex, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const smear = { value: 0 };
  const spinner = patchExterior(new THREE.MeshStandardMaterial({ name: 'ext-spinner', map: M.spinnerTex, roughness: 0.32, metalness: 0.55 }), {
    extra: (shader) => {
      shader.uniforms.uSmear = smear;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSmear;')
        .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = vec4(0.0);
  for (int k = 0; k < 10; k++) sampledDiffuseColor += texture2D(map, vMapUv + vec2(uSmear * (float(k) / 9.0 - 0.5), 0.0));
  sampledDiffuseColor /= 10.0;
  diffuseColor *= sampledDiffuseColor;
#endif`);
    },
  });
  spinner.userData.extraKey = 'smear';
  return { blades, blur, spinner, smear };
}
