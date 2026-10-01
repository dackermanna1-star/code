// One-time environment capture: renders the finished alley into a cube map
// from mid-alley and prefilters it (PMREM) for image-based specular on every
// world material (leather, wet sills, metal, glass bottles, plastic bags...).
// Each material scales it by its local sky visibility, so recesses stay dark.
import * as THREE from 'three';
import { LAYER_REFLECT } from '../world/units.js';

export function captureEnvironment(renderer, scene, position = new THREE.Vector3(0, 2.2, -30), size = 256) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.1, 400, rt);
  cam.position.copy(position);
  cam.children.forEach((c) => c.layers.enable(LAYER_REFLECT));
  scene.add(cam);
  cam.update(renderer, scene);
  scene.remove(cam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture).texture;
  pmrem.dispose();
  rt.dispose();
  return env;
}

/** Assign env map to all MeshStandardMaterials in the scene (except ground, which uses planar reflection). */
export function applyEnvironment(scene, env, intensity = 1) {
  scene.traverse((o) => {
    const m = o.material;
    if (!m || !m.isMeshStandardMaterial) return;
    if (m.name === 'ground') return;
    m.envMap = env;
    m.envMapIntensity = intensity;
    m.needsUpdate = true;
  });
}
