// GPU textures built from the generated terrain data.
import * as THREE from 'three';
import { CLS, N, WATER_RES, type TerrainResult } from './TerrainData';

export interface TerrainGpuData {
  height: THREE.DataTexture;
  normal: THREE.DataTexture;
  splatA: THREE.DataTexture;
  splatB: THREE.DataTexture;
  water: THREE.DataTexture;
}

export function createTerrainGpuData(t: TerrainResult, anisotropy: number): TerrainGpuData {
  const height = new THREE.DataTexture(t.heights, N, N, THREE.RedFormat, THREE.FloatType);
  height.minFilter = height.magFilter = THREE.NearestFilter;
  height.generateMipmaps = false;
  height.needsUpdate = true;

  const normal = new THREE.DataTexture(t.normals, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.magFilter = THREE.LinearFilter;
  normal.generateMipmaps = true;
  normal.anisotropy = anisotropy;
  normal.needsUpdate = true;

  const splat = (data: Uint8Array) => {
    const tex = new THREE.DataTexture(data, CLS, CLS, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  const water = new THREE.DataTexture(t.water, WATER_RES, WATER_RES, THREE.RGBAFormat, THREE.HalfFloatType);
  water.minFilter = water.magFilter = THREE.LinearFilter;
  water.generateMipmaps = false;
  water.wrapS = water.wrapT = THREE.ClampToEdgeWrapping;
  water.needsUpdate = true;
  return { height, normal, splatA: splat(t.splatA), splatB: splat(t.splatB), water };
}
