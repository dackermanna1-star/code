// Terrain layer texture arrays (albedo+roughness, normal+AO+height) baked on the GPU.
// Layers use PBR sets from public/assets/textures when available (matched by keywords against the manifest),
// otherwise a procedural recipe; when new texture sets appear later, a reload upgrades automatically.
import * as THREE from 'three';
import type { Assets } from '../../core/Assets';
import { LAYERS } from './TerrainMaterial';
import { layerFragment, layerVertex } from './terrainLayerShader';

export const LAYER_NAMES = ['grass', 'dry_grass', 'forest_floor', 'dirt', 'mud', 'rock', 'sand', 'gravel', 'field'] as const;

/** Keyword preferences for matching texture-set ids to layers (first match wins, `-word` excludes). */
const LAYER_KEYWORDS: string[][] = [
  ['terrain_grass', 'grass_green', 'grass_lush', 'grass', 'meadow', 'lawn', '-dry', '-wild'],
  ['grass_dry', 'dry_grass', 'drygrass', 'grass_wild', 'hay'],
  ['forest_floor', 'forest_ground', 'forestfloor', 'leaves', 'needles', 'moss'],
  ['dirt', 'soil', 'ground_dirt', 'earth', '-plow', '-field'],
  ['mud', 'wet_soil'],
  ['rock', 'cliff', 'stone_wall_natural', 'boulder'],
  ['sand', 'beach'],
  ['gravel', 'pebble'],
  ['field', 'plowed', 'farmland', 'soil_plowed', 'farm'],
];

export interface LayerSource {
  setId: string;
  albedo: THREE.Texture;
  normal: THREE.Texture | null;
  arm: THREE.Texture | null;
  height: THREE.Texture | null;
}

function setIdsFromManifest(m: unknown): string[] {
  const ids = new Set<string>();
  const visit = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'string') ids.add(o.id);
      else if (typeof o.name === 'string' && (o.albedo || o.files || o.maps)) ids.add(o.name);
      for (const k of ['sets', 'textures', 'items', 'entries', 'assets']) if (o[k]) visit(o[k]);
      if (!Array.isArray(v) && !o.id && !o.sets && !o.textures && !o.items && !o.entries && !o.assets)
        for (const [k, val] of Object.entries(o)) if (val && typeof val === 'object' && !Array.isArray(val)) ids.add(k);
    }
  };
  visit(m);
  return [...ids];
}

function pickSet(ids: string[], keywords: string[]): string | null {
  const excl = keywords.filter((k) => k.startsWith('-')).map((k) => k.slice(1));
  for (const kw of keywords) {
    if (kw.startsWith('-')) continue;
    const hit = ids.find((id) => id.toLowerCase().includes(kw) && !excl.some((e) => id.toLowerCase().includes(e)));
    if (hit) return hit;
  }
  return null;
}

/** Resolve layer texture sets from public/assets/textures/manifest.json (missing → null = procedural). */
export async function resolveLayerSources(assets: Assets): Promise<(LayerSource | null)[]> {
  const manifest = await assets.json('assets/textures/manifest.json');
  const ids = manifest ? setIdsFromManifest(manifest) : [];
  const used = new Set<string>();
  return Promise.all(
    LAYER_KEYWORDS.map(async (kws) => {
      const id = pickSet(ids.filter((i) => !used.has(i)), kws);
      if (!id) return null;
      used.add(id);
      const base = `assets/textures/${id}/`;
      const [albedo, normal, arm, hasHeight] = await Promise.all([
        assets.texture(base + 'albedo.jpg', false),
        assets.texture(base + 'normal.jpg', false),
        assets.texture(base + 'arm.jpg', false),
        assets.exists(base + 'height.jpg'),
      ]);
      if (!albedo) return null;
      const height = hasHeight ? await assets.texture(base + 'height.jpg', false) : null;
      return { setId: id, albedo, normal, arm, height };
    }),
  );
}

export interface TerrainTextureArrays {
  albedo: THREE.WebGLArrayRenderTarget;
  normal: THREE.WebGLArrayRenderTarget;
  sources: (string | null)[];
}

/** Bake all layers into two array render targets. */
export function bakeLayerArrays(renderer: THREE.WebGLRenderer, size: number, sources: (LayerSource | null)[], anisotropy: number): TerrainTextureArrays {
  const make = () => {
    const rt = new THREE.WebGLArrayRenderTarget(size, size, LAYERS, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
    rt.texture.anisotropy = anisotropy;
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  };
  const albedo = make();
  const normal = make();
  const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    vertexShader: layerVertex,
    fragmentShader: layerFragment,
    uniforms: {
      uLayer: { value: 0 },
      uPass: { value: 0 },
      uTexel: { value: 1 / size },
      uSource: { value: 0 },
      tSrcAlbedo: { value: blank },
      tSrcNormal: { value: blank },
      tSrcArm: { value: blank },
      tSrcHeight: { value: blank },
      uHasHeight: { value: 0 },
      uHasArm: { value: 0 },
      uHasNormal: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(tri, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  for (let layer = 0; layer < LAYERS; layer++) {
    const src = sources[layer];
    const u = mat.uniforms;
    u.uLayer.value = layer;
    u.uSource.value = src ? 1 : 0;
    if (src) {
      u.tSrcAlbedo.value = src.albedo;
      u.tSrcNormal.value = src.normal ?? blank;
      u.tSrcArm.value = src.arm ?? blank;
      u.tSrcHeight.value = src.height ?? blank;
      u.uHasNormal.value = src.normal ? 1 : 0;
      u.uHasArm.value = src.arm ? 1 : 0;
      u.uHasHeight.value = src.height ? 1 : 0;
    }
    for (let pass = 0; pass < 2; pass++) {
      u.uPass.value = pass;
      renderer.setRenderTarget(pass === 0 ? albedo : normal, layer);
      renderer.render(scene, cam);
    }
  }
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
  mat.dispose();
  tri.dispose();
  blank.dispose();
  return { albedo, normal, sources: sources.map((s) => s?.setId ?? null) };
}
