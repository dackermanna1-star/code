import * as THREE from 'three';
import { BLOCKS } from '../../shared/world/blocks';
import { buildTiles, TILE, type TileAtlas } from './textures';

/**
 * Textured mini cubes for block items (first-person held blocks and item
 * drops), using the very same procedural 16x16 tiles as the terrain.
 */
let atlas: TileAtlas | null = null;
const texCache = new Map<string, { tex: THREE.DataTexture; alpha: boolean }>();
const matCache = new Map<string, THREE.Material[] | null>();
let cubeGeo: THREE.BoxGeometry | null = null;

function tile(name: string) {
  let t = texCache.get(name);
  if (t) return t;
  atlas ??= buildTiles();
  const i = atlas.index.get(name) ?? 0;
  const src = atlas.data.subarray(i * TILE * TILE * 4, (i + 1) * TILE * TILE * 4);
  const data = new Uint8Array(TILE * TILE * 4);
  let alpha = false;
  // tiles are stored top row first; DataTexture rows go bottom-up
  for (let y = 0; y < TILE; y++) data.set(src.subarray(y * TILE * 4, (y + 1) * TILE * 4), (TILE - 1 - y) * TILE * 4);
  for (let k = 3; k < data.length; k += 4) if (data[k] < 250) { alpha = true; break; }
  const tex = new THREE.DataTexture(data, TILE, TILE, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(name, (t = { tex, alpha }));
  return t;
}

/** Six face materials (BoxGeometry order) for a placeable cube block, or null. */
export function blockMaterials(blockKey: string): THREE.Material[] | null {
  if (matCache.has(blockKey)) return matCache.get(blockKey)!;
  const def = BLOCKS.find((b) => b && b.key === blockKey);
  let mats: THREE.Material[] | null = null;
  if (def && def.shape === 'cube') {
    const mk = (name: string) => {
      const t = tile(name);
      return new THREE.MeshLambertMaterial({ map: t.tex, transparent: t.alpha, alphaTest: t.alpha ? 0.05 : 0, depthWrite: !t.alpha, side: t.alpha ? THREE.DoubleSide : THREE.FrontSide });
    };
    const side = mk(def.tex.side), top = mk(def.tex.top), bottom = mk(def.tex.bottom);
    mats = [side, side, top, bottom, side, side];
  }
  matCache.set(blockKey, mats);
  return mats;
}

/** A unit-size textured cube mesh (scale it), or null if the block is not a cube. */
export function blockCube(blockKey: string): THREE.Mesh | null {
  const mats = blockMaterials(blockKey);
  if (!mats) return null;
  cubeGeo ??= new THREE.BoxGeometry(1, 1, 1);
  return new THREE.Mesh(cubeGeo, mats);
}
