// Texture library: every surface texture lives in one of two 256×256 RGBA texture ARRAYS so
// the whole world renders with a single material (one draw call per island).
//
//   albedo array  rgb = albedo (sRGB), a = RELATIVE roughness (128 = 1.0 × the surface's
//                 roughness; photo roughness maps are normalised by their mean so the surface
//                 table stays the authority for overall gloss and the photo adds detail)
//   normal array  rgb = tangent-space normal, OpenGL convention (+X = u/right, +Y = v/up),
//                 a = emissive mask (255 = fully emissive where the surface is emissive).
//                 Layer 0 is a flat normal with full mask. Normal layers are created per
//                 (texture, normalStrength) pair, so surfaces with a custom normalStrength get
//                 a pre-scaled copy and the shader never needs the strength.
//
// Layers are stored UPRIGHT: row 0 of a layer is the BOTTOM of the image, so v (which points
// up on walls, see geom autoUV) reads the image the right way up and text is not mirrored
// vertically.
//
// Sources: CC0 photo textures listed in public/assets/textures/manifest.json (fetched relative
// to import.meta.env.BASE_URL), and procedural generators (src/render/proctex) for every
// "proc:*" name and as a fallback for any missing photo. A missing manifest, a 404 or a decode
// error never breaks loading — the procedural stand-in is used instead.

import { RawTexture2DArray, Texture, Constants, type Scene } from "@babylonjs/core";
import { SURFACES, type SurfaceDef } from "./surfaces.ts";
import { generateTexture, PROC_PREFIX } from "./proctex/index.ts";
import { heightToNormal, SIZE as PROC_SIZE, type TexOutput } from "./proctex/kit.ts";

export const TEX_SIZE = 256;
const LAYER_BYTES = TEX_SIZE * TEX_SIZE * 4;

/** One row of public/assets/textures/manifest.json (see scripts/assets/fetch_textures.py). */
export interface ManifestRow {
  name: string;
  albedo: string;
  normal?: string;
  rough?: string;
  worldSizeMeters?: number;
  metallic?: number;
  tintable?: boolean;
  procedural?: boolean;
}

export interface TextureLoadOptions {
  /** Folder URL holding manifest.json and the JPGs (default `${BASE_URL}assets/textures/`). */
  baseUrl?: string;
  /** Map a manifest file name to a URL (overrides baseUrl; tests use bundled asset URLs). */
  resolve?: (file: string) => string;
  /** Inline manifest (skips fetching manifest.json). */
  manifest?: ManifestRow[];
  /** Never fetch photos: everything procedural (tests / offline builds). */
  proceduralOnly?: boolean;
  /** Max parallel image downloads (default 6). */
  concurrency?: number;
  /** Anisotropic filtering level (default 8). */
  anisotropy?: number;
  onProgress?: (p: number, label: string) => void;
}

export interface TextureReport {
  /** Texture names loaded from photos. */
  photo: string[];
  /** proc:* textures generated. */
  procedural: string[];
  /** Photo names that fell back to a procedural stand-in (missing/failed). */
  fallback: string[];
  /** Names nobody knows how to make (generic placeholder used). */
  unknown: string[];
  layers: { albedo: number; normal: number };
  ms: number;
}

/** Decoded source of one texture before packing. */
interface TexSource {
  /** RGBA top-down, rgb sRGB. */
  rgba: Uint8ClampedArray;
  /** Per-pixel relative roughness 0..255 (128 = nominal) or null = nominal everywhere. */
  rough: Uint8Array | null;
  /** RGBA top-down tangent normal (OpenGL) or null = flat. */
  normal: Uint8ClampedArray | null;
  /** Emissive mask 0..255 top-down, or null = full. */
  emissive: Uint8Array | null;
}

function defaultBaseUrl(): string {
  let base = "./";
  try {
    base = import.meta.env?.BASE_URL ?? "./";
  } catch {
    /* not running under Vite */
  }
  if (!base.endsWith("/")) base += "/";
  return base + "assets/textures/";
}

// ------------------------------------------------------------------ decode helpers

let decodeCanvas: { g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null = null;

function getDecodeCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!decodeCanvas) {
    let c: HTMLCanvasElement | OffscreenCanvas;
    if (typeof OffscreenCanvas !== "undefined") c = new OffscreenCanvas(TEX_SIZE, TEX_SIZE);
    else {
      const e = document.createElement("canvas");
      e.width = TEX_SIZE;
      e.height = TEX_SIZE;
      c = e;
    }
    const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!g) throw new Error("textures: 2D canvas unavailable");
    decodeCanvas = { g };
  }
  return decodeCanvas.g;
}

/** Fetch + decode an image to 256×256 RGBA (top-down). Throws on any failure. */
async function fetchImage(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  // no colour management: normal and roughness maps must keep their raw values
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    const g = getDecodeCtx();
    g.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, TEX_SIZE, TEX_SIZE);
    return new Uint8ClampedArray(g.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data);
  } finally {
    bmp.close();
  }
}

/** Run async jobs with bounded parallelism. */
async function runPool<T>(items: T[], limit: number, job: (t: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.max(1, Math.min(limit, items.length)); w++) {
    workers.push(
      (async () => {
        while (next < items.length) {
          const it = items[next++];
          await job(it);
        }
      })(),
    );
  }
  await Promise.all(workers);
}

/** Convert procedural output to a TexSource. */
function fromProc(out: TexOutput): TexSource {
  let rough: Uint8Array | null = null;
  if (out.rough !== undefined && typeof out.rough !== "number") {
    rough = new Uint8Array(PROC_SIZE * PROC_SIZE);
    const r = out.rough;
    for (let i = 0; i < rough.length; i++) {
      const v = Math.round(128 * r[i]);
      rough[i] = v < 1 ? 1 : v > 255 ? 255 : v;
    }
  } else if (typeof out.rough === "number" && Math.abs(out.rough - 1) > 1e-3) {
    rough = new Uint8Array(PROC_SIZE * PROC_SIZE).fill(Math.max(1, Math.min(255, Math.round(128 * out.rough))));
  }
  const normal = out.height ? heightToNormal(out.height, out.bump ?? 1) : null;
  let emissive: Uint8Array | null = null;
  if (out.emissive) {
    emissive = new Uint8Array(PROC_SIZE * PROC_SIZE);
    const e = out.emissive;
    for (let i = 0; i < emissive.length; i++) emissive[i] = Math.max(0, Math.min(255, Math.round(e[i] * 255)));
  }
  return { rgba: out.rgba, rough, normal, emissive };
}

/** Normalise a greyscale roughness map (RGBA, uses R) to relative roughness (mean → 128). */
function relativeRough(rgba: Uint8ClampedArray): Uint8Array {
  const n = TEX_SIZE * TEX_SIZE;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rgba[i * 4];
  const mean = Math.max(1, sum / n);
  const out = new Uint8Array(n);
  const k = 128 / mean;
  for (let i = 0; i < n; i++) {
    const v = Math.round(rgba[i * 4] * k);
    out[i] = v < 1 ? 1 : v > 255 ? 255 : v;
  }
  return out;
}

// ------------------------------------------------------------------ library

/** Growable CPU store of 256×256 RGBA layers + its GPU texture array. */
class LayerStore {
  data: Uint8Array;
  count = 0;
  constructor(initialCapacity: number) {
    this.data = new Uint8Array(Math.max(1, initialCapacity) * LAYER_BYTES);
  }
  get capacity(): number {
    return this.data.length / LAYER_BYTES;
  }
  /** Reserve a new layer and return its index. */
  alloc(): number {
    if (this.count >= this.capacity) {
      const grown = new Uint8Array(Math.ceil(this.capacity * 1.5 + 4) * LAYER_BYTES);
      grown.set(this.data);
      this.data = grown;
    }
    return this.count++;
  }
  /** View of one layer's bytes. */
  layer(i: number): Uint8Array {
    return this.data.subarray(i * LAYER_BYTES, (i + 1) * LAYER_BYTES);
  }
  /** Exact-size view of the used layers (what the GPU gets). */
  used(): Uint8Array {
    return this.data.subarray(0, Math.max(1, this.count) * LAYER_BYTES);
  }
}

export class TextureLibrary {
  readonly scene: Scene;
  private albedoStore: LayerStore;
  private normalStore: LayerStore;
  private albedoTex: RawTexture2DArray | null = null;
  private normalTex: RawTexture2DArray | null = null;
  /** texture name → albedo layer */
  private albedoLayers = new Map<string, number>();
  /** texture name → base (strength 1) normal layer, 0 when flat without mask */
  private baseNormal = new Map<string, number>();
  /** `${name}|${strength}` → normal layer */
  private normalVariants = new Map<string, number>();
  /** per surface index: albedo / normal layer */
  private surfAlbedo: number[] = [];
  private surfNormal: number[] = [];
  private photoRows = new Map<string, ManifestRow>();
  private anisotropy: number;
  private retro = false;
  private listeners: Array<() => void> = [];
  private gpuDirty = true;
  readonly report: TextureReport = { photo: [], procedural: [], fallback: [], unknown: [], layers: { albedo: 0, normal: 0 }, ms: 0 };
  private warned = new Set<string>();

  constructor(scene: Scene, anisotropy = 8, expectedLayers = 80) {
    this.scene = scene;
    this.anisotropy = anisotropy;
    this.albedoStore = new LayerStore(expectedLayers);
    this.normalStore = new LayerStore(Math.ceil(expectedLayers * 0.8));
    // normal layer 0: flat normal, full emissive mask
    const flat = this.normalStore.layer(this.normalStore.alloc());
    for (let i = 0; i < flat.length; i += 4) {
      flat[i] = 128;
      flat[i + 1] = 128;
      flat[i + 2] = 255;
      flat[i + 3] = 255;
    }
  }

  /** albedo+roughness texture array (rebuilt when late surfaces add layers: listen with onRebuild). */
  get albedo(): RawTexture2DArray {
    this.ensureGpu();
    return this.albedoTex as RawTexture2DArray;
  }

  get normal(): RawTexture2DArray {
    this.ensureGpu();
    return this.normalTex as RawTexture2DArray;
  }

  get layerCounts(): { albedo: number; normal: number } {
    return { albedo: this.albedoStore.count, normal: this.normalStore.count };
  }

  /** Called whenever the GPU arrays are recreated (materials must rebind). */
  onRebuild(cb: () => void): void {
    this.listeners.push(cb);
  }

  albedoLayerOf(surf: number): number {
    return this.surfAlbedo[surf] ?? 0;
  }

  normalLayerOf(surf: number): number {
    return this.surfNormal[surf] ?? 0;
  }

  /** Number of surfaces currently mapped (SURFACES may grow via registerSurface). */
  get mappedSurfaces(): number {
    return this.surfAlbedo.length;
  }

  /**
   * PS2-style filtering: bilinear with a visible mip band (LINEAR_LINEAR_MIPNEAREST) instead of
   * smooth trilinear. Anisotropy stays allowed for both modes.
   */
  setRetroFiltering(on: boolean): void {
    this.retro = on;
    const mode = on ? Texture.LINEAR_LINEAR_MIPNEAREST : Texture.TRILINEAR_SAMPLINGMODE;
    this.albedoTex?.updateSamplingMode(mode);
    this.normalTex?.updateSamplingMode(mode);
  }

  setAnisotropy(level: number): void {
    this.anisotropy = Math.max(1, Math.min(16, Math.round(level)));
    if (this.albedoTex) this.albedoTex.anisotropicFilteringLevel = this.anisotropy;
    if (this.normalTex) this.normalTex.anisotropicFilteringLevel = this.anisotropy;
  }

  // ---------------------------------------------------------------- loading

  /** Load everything referenced by SURFACES (photos where available, else procedural). */
  async load(opts: TextureLoadOptions = {}): Promise<void> {
    const t0 = performance.now();
    const progress = opts.onProgress ?? (() => {});
    const base = opts.baseUrl ?? defaultBaseUrl();
    const resolve = opts.resolve ?? ((f: string) => base + f);
    // manifest
    if (!opts.proceduralOnly) {
      let rows: ManifestRow[] | null = opts.manifest ?? null;
      if (!rows) {
        try {
          const res = await fetch(resolve("manifest.json"));
          if (res.ok) rows = (await res.json()) as ManifestRow[];
        } catch {
          rows = null;
        }
      }
      if (Array.isArray(rows)) for (const r of rows) if (r && typeof r.name === "string" && typeof r.albedo === "string") this.photoRows.set(r.name, r);
    }
    // unique texture names in surface order
    const names: string[] = [];
    const seen = new Set<string>();
    for (const s of SURFACES) {
      if (!seen.has(s.tex)) {
        seen.add(s.tex);
        names.push(s.tex);
      }
    }
    const photoNames = names.filter((n) => !n.startsWith(PROC_PREFIX) && this.photoRows.has(n));
    const decoded = new Map<string, TexSource>();
    let done = 0;
    const total = names.length;
    progress(0, "Loading textures");
    // photos (parallel)
    await runPool(photoNames, opts.concurrency ?? 6, async (name) => {
      const row = this.photoRows.get(name) as ManifestRow;
      try {
        const [alb, nrm, rgh] = await Promise.all([
          fetchImage(resolve(row.albedo)),
          row.normal ? fetchImage(resolve(row.normal)).catch(() => null) : Promise.resolve(null),
          row.rough ? fetchImage(resolve(row.rough)).catch(() => null) : Promise.resolve(null),
        ]);
        decoded.set(name, { rgba: alb, normal: nrm, rough: rgh ? relativeRough(rgh) : null, emissive: null });
        this.report.photo.push(name);
      } catch (e) {
        this.warnOnce(`photo:${name}`, `textures: photo '${name}' unavailable (${String((e as Error)?.message ?? e)}), using procedural stand-in`);
      }
      done++;
      progress((done / total) * 0.6, `Textures: ${name}`);
    });
    // procedural (sequential, yields between textures to keep the page responsive)
    let k = 0;
    for (const name of names) {
      if (decoded.has(name)) continue;
      const { out, known } = generateTexture(name);
      decoded.set(name, fromProc(out));
      if (name.startsWith(PROC_PREFIX)) this.report.procedural.push(name);
      else this.report.fallback.push(name);
      if (!known) {
        this.report.unknown.push(name);
        this.warnOnce(`unknown:${name}`, `textures: no source for texture '${name}', using a generic placeholder`);
      }
      done++;
      if (++k % 6 === 0) {
        progress(Math.min(0.99, 0.6 + (done / total) * 0.4), `Textures: ${name}`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    // pack in surface order (stable layer numbering)
    for (const name of names) this.addTexture(name, decoded.get(name) as TexSource);
    this.mapSurfaces();
    this.gpuDirty = true;
    this.ensureGpu();
    this.report.ms = Math.round(performance.now() - t0);
    this.report.layers = this.layerCounts;
    progress(1, "Textures ready");
  }

  /**
   * Map surfaces registered after load() (registerSurface). Missing textures are generated
   * procedurally (photos cannot be fetched synchronously). Returns true if GPU arrays were
   * recreated (listeners have been notified).
   */
  sync(): boolean {
    if (this.surfAlbedo.length >= SURFACES.length) return false;
    const before = this.layerCounts;
    for (let i = this.surfAlbedo.length; i < SURFACES.length; i++) {
      const s = SURFACES[i];
      if (!this.albedoLayers.has(s.tex)) {
        const { out, known } = generateTexture(s.tex);
        if (!known) this.warnOnce(`unknown:${s.tex}`, `textures: no source for texture '${s.tex}', using a generic placeholder`);
        this.addTexture(s.tex, fromProc(out));
      }
    }
    this.mapSurfaces();
    const after = this.layerCounts;
    if (after.albedo !== before.albedo || after.normal !== before.normal) {
      this.gpuDirty = true;
      this.ensureGpu();
      return true;
    }
    return false;
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  /** Pack one decoded texture: albedo layer + base normal layer (if relief or emissive mask). */
  private addTexture(name: string, src: TexSource): void {
    if (this.albedoLayers.has(name)) return;
    const ai = this.albedoStore.alloc();
    const dst = this.albedoStore.layer(ai);
    for (let y = 0; y < TEX_SIZE; y++) {
      const srow = (TEX_SIZE - 1 - y) * TEX_SIZE; // flip: layer row 0 = image bottom
      const drow = y * TEX_SIZE;
      for (let x = 0; x < TEX_SIZE; x++) {
        const s = (srow + x) * 4,
          d = (drow + x) * 4;
        dst[d] = src.rgba[s];
        dst[d + 1] = src.rgba[s + 1];
        dst[d + 2] = src.rgba[s + 2];
        dst[d + 3] = src.rough ? src.rough[srow + x] : 128;
      }
    }
    this.albedoLayers.set(name, ai);
    if (!src.normal && !src.emissive) {
      this.baseNormal.set(name, 0);
      return;
    }
    const ni = this.normalStore.alloc();
    const nd = this.normalStore.layer(ni);
    for (let y = 0; y < TEX_SIZE; y++) {
      const srow = (TEX_SIZE - 1 - y) * TEX_SIZE;
      const drow = y * TEX_SIZE;
      for (let x = 0; x < TEX_SIZE; x++) {
        const s = srow + x,
          d = (drow + x) * 4;
        if (src.normal) {
          nd[d] = src.normal[s * 4];
          nd[d + 1] = src.normal[s * 4 + 1];
          nd[d + 2] = src.normal[s * 4 + 2];
        } else {
          nd[d] = 128;
          nd[d + 1] = 128;
          nd[d + 2] = 255;
        }
        nd[d + 3] = src.emissive ? src.emissive[s] : 255;
      }
    }
    this.baseNormal.set(name, ni);
    this.normalVariants.set(`${name}|1`, ni);
  }

  /** Normal layer for (texture, strength): strength-scaled copies are made on demand. */
  private normalLayerFor(name: string, strength: number): number {
    const base = this.baseNormal.get(name) ?? 0;
    if (base === 0) return 0;
    const s = Math.round(Math.max(0, strength) * 100) / 100;
    if (Math.abs(s - 1) < 1e-3) return base;
    const key = `${name}|${s}`;
    const hit = this.normalVariants.get(key);
    if (hit !== undefined) return hit;
    const vi = this.normalStore.alloc();
    // read base AFTER alloc (alloc may reallocate the store)
    const src = this.normalStore.layer(base);
    const dst = this.normalStore.layer(vi);
    for (let i = 0; i < src.length; i += 4) {
      let x = (src[i] / 255) * 2 - 1,
        y = (src[i + 1] / 255) * 2 - 1;
      const z = Math.max(1e-3, (src[i + 2] / 255) * 2 - 1);
      x *= s;
      y *= s;
      const inv = 1 / Math.sqrt(x * x + y * y + z * z);
      dst[i] = Math.round((x * inv * 0.5 + 0.5) * 255);
      dst[i + 1] = Math.round((y * inv * 0.5 + 0.5) * 255);
      dst[i + 2] = Math.round((z * inv * 0.5 + 0.5) * 255);
      dst[i + 3] = src[i + 3];
    }
    this.normalVariants.set(key, vi);
    return vi;
  }

  private mapSurfaces(): void {
    for (let i = this.surfAlbedo.length; i < SURFACES.length; i++) {
      const s: SurfaceDef = SURFACES[i];
      this.surfAlbedo[i] = this.albedoLayers.get(s.tex) ?? 0;
      this.surfNormal[i] = this.normalLayerFor(s.tex, s.normalStrength ?? 1);
    }
  }

  /** (Re)create the GPU arrays if layers changed. */
  private ensureGpu(): void {
    if (!this.gpuDirty && this.albedoTex && this.normalTex) return;
    const make = (store: LayerStore, name: string): RawTexture2DArray => {
      const t = new RawTexture2DArray(
        store.used(),
        TEX_SIZE,
        TEX_SIZE,
        Math.max(1, store.count),
        Constants.TEXTUREFORMAT_RGBA,
        this.scene,
        true, // mipmaps (generated on the GPU)
        false, // rows already upright (invertY must be false for ArrayBufferView array uploads)
        this.retro ? Texture.LINEAR_LINEAR_MIPNEAREST : Texture.TRILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      );
      t.name = name;
      t.wrapU = Texture.WRAP_ADDRESSMODE;
      t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = this.anisotropy;
      return t;
    };
    const oldA = this.albedoTex,
      oldN = this.normalTex;
    this.albedoTex = make(this.albedoStore, "worldAlbedoArray");
    this.normalTex = make(this.normalStore, "worldNormalArray");
    this.gpuDirty = false;
    this.report.layers = this.layerCounts;
    if (oldA || oldN) {
      for (const l of this.listeners) l();
      oldA?.dispose();
      oldN?.dispose();
    }
  }

  /** Raw layer bytes (tests / tools): kind 'albedo' | 'normal'. Rows bottom-up. */
  layerData(kind: "albedo" | "normal", layer: number): Uint8Array {
    const st = kind === "albedo" ? this.albedoStore : this.normalStore;
    if (layer < 0 || layer >= st.count) throw new Error(`textures: bad ${kind} layer ${layer}`);
    return st.layer(layer);
  }

  dispose(): void {
    this.albedoTex?.dispose();
    this.normalTex?.dispose();
    this.albedoTex = null;
    this.normalTex = null;
    this.listeners.length = 0;
  }
}

/** Create and load the texture library (photos + procedural). Never throws for missing assets. */
export async function loadTextures(scene: Scene, opts: TextureLoadOptions = {}): Promise<TextureLibrary> {
  const lib = new TextureLibrary(scene, opts.anisotropy ?? 8, SURFACES.length + 8);
  await lib.load(opts);
  return lib;
}
