// Asset loading & caching. All asset URLs are relative to the site root, e.g. 'assets/weapons/ar_akm.glb'.
// Missing assets resolve to null (via tryGltf / tryTexture) so systems can fall back gracefully.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export type { GLTF };

/** Resolve an asset path against the page base (works under sub-paths and file hosting). */
export function assetUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  return (base.endsWith('/') ? base : base + '/') + path.replace(/^\/+/, '');
}

export interface PbrOptions {
  repeat?: number | [number, number];
  /** Load normal map (default true). */
  normal?: boolean;
  /** Load AO/roughness/metalness packed map (default true). */
  arm?: boolean;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  /** Max anisotropy (default renderer max). */
  anisotropy?: number;
}

export class Assets {
  readonly manager = new THREE.LoadingManager();
  readonly gltfLoader: GLTFLoader;
  readonly textureLoader: THREE.TextureLoader;
  readonly hdrLoader: HDRLoader;
  private gltfCache = new Map<string, Promise<GLTF | null>>();
  private texCache = new Map<string, Promise<THREE.Texture | null>>();
  private jsonCache = new Map<string, Promise<any>>();
  private audioCache = new Map<string, Promise<AudioBuffer | null>>();
  private existsCache = new Map<string, Promise<boolean>>();
  maxAnisotropy = 8;
  /** Texture quality (0 low, 1 med, 2 high) — low skips normal maps on minor materials. */
  textureQuality = 2;
  loadedCount = 0;
  requestedCount = 0;

  constructor() {
    this.gltfLoader = new GLTFLoader(this.manager);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.hdrLoader = new HDRLoader(this.manager);
  }

  /** Load a glTF (cached). Throws if missing. Clone with cloneGltfScene() before adding to the scene more than once. */
  async gltf(path: string): Promise<GLTF> {
    const g = await this.tryGltf(path);
    if (!g) throw new Error(`Asset not found: ${path}`);
    return g;
  }

  tryGltf(path: string): Promise<GLTF | null> {
    const url = assetUrl(path);
    let p = this.gltfCache.get(url);
    if (!p) {
      this.requestedCount++;
      p = this.gltfLoader
        .loadAsync(url)
        .then((g) => {
          this.loadedCount++;
          return g;
        })
        .catch((e) => {
          this.loadedCount++;
          console.warn(`[Assets] glTF failed: ${path}`, e?.message ?? e);
          return null;
        });
      this.gltfCache.set(url, p);
    }
    return p;
  }

  /** Deep clone a glTF scene (handles skinned meshes). Materials/geometries stay shared. */
  static cloneScene<T extends THREE.Object3D>(obj: T): T {
    return SkeletonUtils.clone(obj) as T;
  }

  texture(path: string, srgb = true): Promise<THREE.Texture | null> {
    const url = assetUrl(path);
    const key = url + (srgb ? '|srgb' : '|lin');
    let p = this.texCache.get(key);
    if (!p) {
      this.requestedCount++;
      p = this.textureLoader
        .loadAsync(url)
        .then((t) => {
          this.loadedCount++;
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = this.maxAnisotropy;
          return t;
        })
        .catch(() => {
          this.loadedCount++;
          console.warn(`[Assets] texture failed: ${path}`);
          return null;
        });
      this.texCache.set(key, p);
    }
    return p;
  }

  hdr(path: string): Promise<THREE.DataTexture | null> {
    const url = assetUrl(path);
    let p = this.texCache.get(url) as Promise<any> | undefined;
    if (!p) {
      p = this.hdrLoader
        .loadAsync(url)
        .then((t) => {
          t.mapping = THREE.EquirectangularReflectionMapping;
          return t;
        })
        .catch(() => null);
      this.texCache.set(url, p);
    }
    return p;
  }

  /**
   * Build a MeshStandardMaterial from a texture set folder `assets/textures/<id>/` (albedo/normal/arm).
   * Textures are shared between materials of the same set; repeat is applied by cloning the texture.
   */
  async pbr(setId: string, opts: PbrOptions = {}): Promise<THREE.MeshStandardMaterial> {
    const base = `assets/textures/${setId}/`;
    const [albedo, normal, arm] = await Promise.all([
      this.texture(base + 'albedo.jpg', true),
      opts.normal === false || this.textureQuality === 0 ? null : this.texture(base + 'normal.jpg', false),
      opts.arm === false ? null : this.texture(base + 'arm.jpg', false),
    ]);
    const rep = opts.repeat ?? 1;
    const [rx, ry] = Array.isArray(rep) ? rep : [rep, rep];
    const prep = (t: THREE.Texture | null) => {
      if (!t) return null;
      if (rx === 1 && ry === 1) return t;
      const c = t.clone();
      c.repeat.set(rx, ry);
      c.needsUpdate = true;
      return c;
    };
    const mat = new THREE.MeshStandardMaterial({
      map: prep(albedo),
      normalMap: prep(normal),
      aoMap: prep(arm),
      roughnessMap: prep(arm),
      metalnessMap: prep(arm),
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? (arm ? 1 : 0),
    });
    mat.name = setId;
    return mat;
  }

  json<T = any>(path: string): Promise<T | null> {
    const url = assetUrl(path);
    let p = this.jsonCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      this.jsonCache.set(url, p);
    }
    return p;
  }

  audioBuffer(path: string, ac: BaseAudioContext): Promise<AudioBuffer | null> {
    const url = assetUrl(path);
    let p = this.audioCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => ac.decodeAudioData(buf))
        .catch(() => null);
      this.audioCache.set(url, p);
    }
    return p;
  }

  /** HEAD-check that an asset exists (cached). */
  exists(path: string): Promise<boolean> {
    const url = assetUrl(path);
    let p = this.existsCache.get(url);
    if (!p) {
      p = fetch(url, { method: 'HEAD' })
        .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
        .catch(() => false);
      this.existsCache.set(url, p);
    }
    return p;
  }
}
