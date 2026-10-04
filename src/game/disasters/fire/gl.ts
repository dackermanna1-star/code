/**
 * Small GPU helpers shared by the volcano and tsunami visuals: a forward scene that draws
 * before the particles (so smoke and spray composite in front of our meshes), and the GLSL
 * prefix that brings in the atmosphere (fog, sky radiance) when the renderer has one.
 */
import * as THREE from 'three';
import type { Game } from '../../game';
import { GLSL_COMMON } from '../../../render/shaders/common';

/** Atmosphere GLSL + uniforms if installed (falls back to simple fog in the shaders). */
export function atmosphereParts(game: Game): { glsl: string; uniforms: Record<string, THREE.IUniform> } {
  const atmo = (game.renderer as any)?.atmosphere;
  if (atmo?.glsl && atmo.uniforms) return { glsl: `#define HAS_ATMO 1\n${atmo.glsl}`, uniforms: atmo.uniforms };
  return { glsl: '', uniforms: {} };
}

/** Fog helper that works with or without the atmosphere include. */
export const GLSL_FOG = /* glsl */ `
vec3 dz_fog(vec3 col, vec3 worldDir, float dist) {
#ifdef HAS_ATMO
  return atmo_applyFog(col, worldDir, dist);
#else
  return mix(col, vec3(0.5, 0.6, 0.75), 1.0 - exp(-dist * 0.004));
#endif
}
vec3 dz_sky(vec3 dir) {
#ifdef HAS_ATMO
  return atmo_skyRadianceWithClouds(dir);
#else
  return mix(vec3(0.6, 0.7, 0.85), vec3(0.2, 0.35, 0.7), clamp(dir.y, 0.0, 1.0)) * 2.0;
#endif
}
`;

export const GLSL_PRELUDE = `precision highp float;\nprecision highp int;\n${GLSL_COMMON}\n`;

/** A forward scene inserted at the front of renderExtras.forward (before particles). */
export class ForwardLayer {
  readonly scene = new THREE.Scene();
  private added = false;
  constructor(readonly game: Game) {
    const ex = game.renderExtras as any;
    if (!ex) return;
    (ex.forward ??= []).unshift(this.scene);
    this.added = true;
  }
  /** Uniform with the camera position (shared with the renderer). */
  cameraPosUniform(): THREE.IUniform {
    return (this.game.renderer as any)?.lightUniforms?.u_cameraPos ?? { value: new THREE.Vector3() };
  }
  dispose() {
    if (this.added) {
      const fw = (this.game.renderExtras as any).forward as THREE.Scene[] | undefined;
      const i = fw ? fw.indexOf(this.scene) : -1;
      if (i >= 0) fw!.splice(i, 1);
      this.added = false;
    }
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.scene.clear();
  }
}

/** True when a WebGL renderer is present (not in unit tests / headless stubs). */
export function hasGpu(game: Game): boolean {
  const r = game.renderer as any;
  return !!(r && r.gl && r.lightUniforms && game.renderExtras);
}
