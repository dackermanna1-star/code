// First-person head hiding: the local player's materials get a clip sphere around the eye — fragments
// inside it are discarded in the colour pass (head, hair, helmet, visor), while shadow/depth passes use
// separate materials so the player's shadow keeps its head. Avoids the stretched geometry that bone
// scaling produces on vertices blended between neck and head.
import * as THREE from 'three';

export interface ClipUniforms {
  uClipCenter: { value: THREE.Vector3 };
  uClipRadius: { value: number };
}

const patched = new WeakSet<THREE.Material>();

function patch(mat: THREE.Material, u: ClipUniforms): THREE.Material {
  const m = mat.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uClipCenter = u.uClipCenter;
    shader.uniforms.uClipRadius = u.uClipRadius;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipWorld;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvClipWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipWorld;\nuniform vec3 uClipCenter;\nuniform float uClipRadius;')
      .replace('void main() {', 'void main() {\n  if (uClipRadius > 0.0 && distance(vClipWorld, uClipCenter) < uClipRadius) discard;');
  };
  m.customProgramCacheKey = () => 'fpclip';
  patched.add(m);
  return m;
}

/** Clone + patch the materials of every mesh under `root` (idempotent per mesh). */
export function installFirstPersonClip(root: THREE.Object3D, u: ClipUniforms): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((mm) => (patched.has(mm) ? mm : patch(mm, u)));
    else if (!patched.has(mesh.material)) mesh.material = patch(mesh.material, u);
  });
}

export function makeClipUniforms(): ClipUniforms {
  return { uClipCenter: { value: new THREE.Vector3() }, uClipRadius: { value: 0 } };
}
