import * as THREE from 'three';
import { U } from '../engine/uniforms.js';
import { SHADOW_LAYER } from './vegetation/vegetation.js';

// Two orthographic shadow cascades for objects (palms, shrubs) following the player.
// The terrain is not a caster: its shadows come from the clipmap ray-march.

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _c = new THREE.Vector3();

export class ShadowCascades {
  constructor(renderer, { size = 2048, radii = [42, 360] } = {}) {
    this.renderer = renderer;
    this.cascades = radii.map((radius, i) => {
      const s = i === 0 ? size : Math.max(1024, size >> 1);
      const depthTexture = new THREE.DepthTexture(s, s);
      depthTexture.type = THREE.UnsignedIntType;
      depthTexture.compareFunction = THREE.LessEqualCompare;
      depthTexture.minFilter = THREE.LinearFilter;
      depthTexture.magFilter = THREE.LinearFilter;
      const rt = new THREE.WebGLRenderTarget(s, s, {
        depthBuffer: true,
        stencilBuffer: false,
        depthTexture,
        format: THREE.RedFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false,
      });
      // Allocate now: a sampler2DShadow bound to an unallocated texture is a GL error even
      // when the shader branch that samples it never runs.
      renderer.initRenderTarget(rt);
      const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 1, 2000);
      camera.layers.set(SHADOW_LAYER);
      return { rt, camera, radius, size: s, rendered: false, matrix: i === 0 ? U.uObjShadowMatrix0.value : U.uObjShadowMatrix1.value };
    });
    U.tObjShadow0.value = this.cascades[0].rt.depthTexture;
    U.tObjShadow1.value = this.cascades[1].rt.depthTexture;
    this.frame = 0;
  }

  update(scene, center, lightDir, casters) {
    this.frame++;
    if (lightDir.y < 0.015 || casters.length === 0) {
      U.uObjShadowParams.value.x = 0;
      return;
    }
    const r = this.renderer;
    const swap = casters.map((m) => [m, m.material]);
    for (const [m] of swap) m.material = m.userData.depthMaterial;
    const autoUpdate = scene.matrixWorldAutoUpdate;
    for (let i = 0; i < this.cascades.length; i++) {
      const cs = this.cascades[i];
      // The far cascade changes slowly; refresh it every other frame.
      if (i === 1 && this.frame % 2 === 1 && cs.rendered) continue;
      cs.rendered = true;
      const cam = cs.camera;
      // Light-space basis, then snap the centre to whole texels to stop shimmering.
      _up.set(0, 1, 0);
      if (Math.abs(lightDir.y) > 0.99) _up.set(0, 0, 1);
      _right.crossVectors(_up, lightDir).normalize();
      _up.crossVectors(lightDir, _right).normalize();
      const texel = (2 * cs.radius) / cs.size;
      const a = Math.round(center.dot(_right) / texel) * texel - center.dot(_right);
      const b = Math.round(center.dot(_up) / texel) * texel - center.dot(_up);
      _c.copy(center).addScaledVector(_right, a).addScaledVector(_up, b);
      cam.position.copy(_c).addScaledVector(lightDir, 900);
      cam.up.copy(_up);
      cam.lookAt(_c);
      cam.updateMatrixWorld();
      cs.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      r.setRenderTarget(cs.rt);
      r.clear(true, true, false);
      r.render(scene, cam);
    }
    scene.matrixWorldAutoUpdate = autoUpdate;
    for (const [m, mat] of swap) m.material = mat;
    U.uObjShadowParams.value.set(1, 1 / this.cascades[0].size, 1 / this.cascades[1].size, 0.00012);
  }
}
