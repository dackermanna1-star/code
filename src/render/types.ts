import type * as THREE from 'three';

/** Contract implemented by src/render/materials/generator.ts */
export interface BlockMaterialSet {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  props: THREE.DataTexture;
  size: number;
  layerCount: number;
}

export interface SkyParams {
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  moonPhase: number;
  time: number;
  rain: number;
  thunder: number;
  dimension: 'overworld' | 'nether' | 'end';
  cameraPosition: THREE.Vector3;
  renderDistance: number;
  biomeFogColor?: THREE.Color;
}

export type SkyQuality = 'low' | 'medium' | 'high' | 'ultra';

/** Contract implemented by src/render/sky (Atmosphere). */
export interface AtmosphereLike {
  setQuality?(q: SkyQuality): void;
  update(params: SkyParams, camera: THREE.PerspectiveCamera, frameIndex: number): void;
  render(target: THREE.WebGLRenderTarget, depthTexture: THREE.Texture, camera: THREE.PerspectiveCamera): void;
  readonly glsl: string;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly lightDir: THREE.Vector3;
  readonly lightColor: THREE.Color;
  readonly ambientSH: THREE.Vector3[];
  readonly fogColor: THREE.Color;
  dispose(): void;
}
